// GOAL-117 — Auditoria do release Android para o Google Play (sem senha).
//
// Verifica APK + AAB gerados em android/app/build/outputs contra o registro
// PÚBLICO da upload key (android/play-upload-certificate.json):
//   - assinatura (apksigner no APK; jarsigner + keytool -printcert no AAB)
//     e signer == UPLOAD_CERT_SHA256 registrado;
//   - identidade (package/versionCode/versionName) do APK e do AAB (manifest
//     proto do AAB lido via aapt2) == android/app/build.gradle; sem debuggable;
//   - web bundle embarcado + dex: marcadores de segredo/provedor, backend de
//     desenvolvimento e hosts *.vercel.app (só Production é aceito);
//   - WebView debugging desligado no capacitor.config.json embarcado;
//   - git: nenhum keystore/credencial versionado; árvore limpa.
// Grava android/app/build/outputs/play-release-manifest.json (git-ignorado)
// com hashes e resultados. Nunca imprime trecho de segredo, só contagens.
//
// Uso: npm run android:release:audit [-- --accept-backend-unavailable] [--no-record] [--allow-dirty]
//   --accept-backend-unavailable: aceite humano da IA nativa indisponível
//     (backend não embutido); sem ele esse gate FALHA.
//   --no-record: audita sem exigir o registro da upload key (ex.: chave interna).
//   --allow-dirty: árvore git suja vira aviso (somente teste).
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ANDROID_DIR,
  JAVA_EN_LOCALE,
  REPO_ROOT,
  aapt2Path,
  jdkTool,
  run,
  runApksigner,
  takeSecretEnv,
} from "./android/android-tools.mjs";
import {
  DEV_BACKEND_MARKERS,
  PACKAGE_ID,
  PRODUCTION_BACKEND_ORIGIN,
  SECRET_MARKERS,
  UPLOAD_CERT_RECORD,
  committedSecretAssignments,
  compareWebTrees,
  countMarkers,
  fingerprintsEqual,
  formatFingerprint,
  parseAapt2Badging,
  parseApksignerOutput,
  parseGradleVersion,
  parseJarsignerVerbose,
  parseKeytoolJarSigners,
  vercelAppHosts,
} from "./android/play-release-lib.mjs";

const TAG = "[android:release:audit]";
const APK = path.join(ANDROID_DIR, "app", "build", "outputs", "apk", "release", "app-release.apk");
const AAB = path.join(ANDROID_DIR, "app", "build", "outputs", "bundle", "release", "app-release.aab");
const MANIFEST_OUT = path.join(ANDROID_DIR, "app", "build", "outputs", "play-release-manifest.json");

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function listFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function extract(archive, destination, entries = []) {
  mkdirSync(destination, { recursive: true });
  const res = run(jdkTool("jar"), ["xf", archive, ...entries], { cwd: destination });
  if (res.status !== 0) throw new Error(`jar xf falhou para ${path.basename(archive)} (exit ${res.status}).`);
}

function archiveEntries(archive) {
  const res = run(jdkTool("jar"), ["tf", archive]);
  if (res.status !== 0) throw new Error(`jar tf falhou para ${path.basename(archive)}.`);
  return res.stdout.split(/\r?\n/).filter(Boolean);
}

/** Varre arquivos (texto e binário como latin1) somando marcadores. */
function scanTree(files) {
  const secrets = {};
  const dev = {};
  const vercelHosts = new Set();
  let productionOriginHits = 0;
  let runtimeEnvLookup = 0;
  for (const file of files) {
    const text = readFileSync(file).toString("latin1");
    for (const [id, n] of Object.entries(countMarkers(text, SECRET_MARKERS))) secrets[id] = (secrets[id] ?? 0) + n;
    for (const [id, n] of Object.entries(countMarkers(text, DEV_BACKEND_MARKERS))) dev[id] = (dev[id] ?? 0) + n;
    for (const host of vercelAppHosts(text)) vercelHosts.add(host);
    productionOriginHits += text.split(PRODUCTION_BACKEND_ORIGIN).length - 1;
    runtimeEnvLookup += text.split("env.NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL").length - 1;
  }
  return { secrets, dev, vercelHosts: [...vercelHosts].sort(), productionOriginHits, runtimeEnvLookup };
}

function treeHashes(dir) {
  const hashes = {};
  for (const file of listFiles(dir)) hashes[path.relative(dir, file).split(path.sep).join("/")] = sha256File(file);
  return hashes;
}

/**
 * @param {object} options
 * @param {boolean} [options.requireRecord] exige android/play-upload-certificate.json
 * @param {boolean} [options.acceptBackendUnavailable] aceite humano explícito da
 *   IA nativa indisponível (backend não embutido) — vira WARN registrado no
 *   manifest; sem ele, backend não embutido é FAIL.
 * @param {boolean} [options.allowDirty] árvore git suja vira WARN (só teste)
 */
export function runAudit({ requireRecord = true, acceptBackendUnavailable = false, allowDirty = false, quiet = false } = {}) {
  const log = (...m) => {
    if (!quiet) console.log(...m);
  };
  const gates = [];
  const gate = (id, pass, detail, { hard = true } = {}) => {
    gates.push({ id, status: pass ? "PASS" : hard ? "FAIL" : "WARN", detail });
  };

  for (const artifact of [APK, AAB]) {
    if (!existsSync(artifact)) throw new Error(`Artefato ausente: ${path.relative(REPO_ROOT, artifact)}. Gere o release antes.`);
  }

  const recordFile = path.join(REPO_ROOT, UPLOAD_CERT_RECORD);
  const record = existsSync(recordFile) ? JSON.parse(readFileSync(recordFile, "utf8")) : null;
  if (requireRecord && !record) {
    throw new Error(`Registro da upload key ausente (${UPLOAD_CERT_RECORD}). Gere a upload key antes (ou use --no-record).`);
  }

  const gradle = parseGradleVersion(readFileSync(path.join(ANDROID_DIR, "app", "build.gradle"), "utf8"));
  const apkSha = sha256File(APK);
  const aabSha = sha256File(AAB);

  // --- Assinatura APK
  const apkSig = parseApksignerOutput(runApksigner(["verify", "--print-certs", "-v", APK]).output);
  const apkSigner = apkSig.signers[0] ?? {};
  gate("APK_SIGNATURE_VALID", apkSig.verified && apkSig.signers.length === 1, `verified=${apkSig.verified} signers=${apkSig.signers.length}`);
  gate("APK_NOT_DEBUG_SIGNED", !/CN=Android Debug/i.test(apkSigner.dn ?? ""), apkSigner.dn ?? "sem signer");

  // --- Assinatura AAB: "jar verified." não basta (jarsigner só AVISA sobre
  // entradas não assinadas) — toda entrada de payload precisa da flag "s" e
  // deve haver exatamente um signer.
  const jarsignerRun = run(jdkTool("jarsigner"), [...JAVA_EN_LOCALE, "-verify", "-verbose", AAB]);
  const jar = parseJarsignerVerbose(jarsignerRun.output);
  const aabSigners = parseKeytoolJarSigners(
    run(jdkTool("keytool"), [...JAVA_EN_LOCALE, "-printcert", "-jarfile", AAB]).output
  );
  const aabCert = aabSigners[0] ?? {};
  gate(
    "AAB_JAR_SIGNATURE_VALID",
    jarsignerRun.status === 0 && jar.verified && jar.fatalWarnings.length === 0,
    `verified=${jar.verified} avisos-fatais=${jar.fatalWarnings.length}`
  );
  const aabFileEntries = archiveEntries(AAB).filter((e) => !e.endsWith("/")).length;
  gate(
    "AAB_ALL_ENTRIES_SIGNED",
    jar.entries > 0 && jar.entries === aabFileEntries && jar.unsignedPayload.length === 0,
    `${jar.entries}/${aabFileEntries} entradas lidas; não assinadas: ${jar.unsignedPayload.length}`
  );
  gate(
    "AAB_SINGLE_SIGNER",
    aabSigners.length === 1 && jar.signedBy.length === 1,
    `keytool=${aabSigners.length} jarsigner=${jar.signedBy.length}`
  );
  gate("AAB_SIGNED", Boolean(aabCert.sha256), aabCert.owner ?? "sem certificado");
  gate(
    "APK_AAB_SAME_SIGNER",
    fingerprintsEqual(apkSigner.sha256, aabCert.sha256),
    `apk=${formatFingerprint(apkSigner.sha256 ?? "")} aab=${formatFingerprint(aabCert.sha256 ?? "")}`
  );
  if (record) {
    gate("AAB_SIGNED_BY_UPLOAD_KEY", fingerprintsEqual(aabCert.sha256, record.sha256), `esperado ${record.sha256}`);
    gate("APK_SIGNED_BY_UPLOAD_KEY", fingerprintsEqual(apkSigner.sha256, record.sha256), `esperado ${record.sha256}`);
  }

  // --- Identidade APK + AAB (manifest proto -> "APK proto" lido pelo aapt2)
  const aapt2 = aapt2Path();
  const apkBadging = parseAapt2Badging(run(aapt2, ["dump", "badging", APK]).output);
  const work = mkdtempSync(path.join(os.tmpdir(), "gymflow-aab-audit-"));
  try {
    extract(AAB, path.join(work, "aab"));
    const proto = path.join(work, "proto");
    mkdirSync(proto, { recursive: true });
    copyFileSync(path.join(work, "aab", "base", "manifest", "AndroidManifest.xml"), path.join(proto, "AndroidManifest.xml"));
    copyFileSync(path.join(work, "aab", "base", "resources.pb"), path.join(proto, "resources.pb"));
    const protoApk = path.join(work, "proto.apk");
    const packed = run(jdkTool("jar"), ["cfM", protoApk, "AndroidManifest.xml", "resources.pb"], { cwd: proto });
    if (packed.status !== 0) throw new Error("Falha ao montar APK proto do AAB para leitura do manifest.");
    const aabBadging = parseAapt2Badging(run(aapt2, ["dump", "badging", protoApk]).output);

    for (const [label, b] of [["APK", apkBadging], ["AAB", aabBadging]]) {
      gate(`${label}_PACKAGE_ID`, b.packageName === PACKAGE_ID, String(b.packageName));
      gate(`${label}_VERSION_CODE`, b.versionCode === gradle.versionCode, `${b.versionCode} (gradle ${gradle.versionCode})`);
      gate(`${label}_VERSION_NAME`, b.versionName === gradle.versionName, `${b.versionName} (gradle ${gradle.versionName})`);
      gate(`${label}_NOT_DEBUGGABLE`, !b.debuggable, b.debuggable ? "application-debuggable" : "ok");
    }

    extract(APK, path.join(work, "apk"));
    const aabEntries = archiveEntries(AAB);
    const apkEntries = archiveEntries(APK);
    const forbiddenEntry = (e) => /\.(jks|keystore|p12|pfx|pepk)$|release-signing\.properties$|keystore\.properties$|(^|\/)\.env/i.test(e);
    const forbidden = [...aabEntries, ...apkEntries].filter(forbiddenEntry);
    gate("NO_SIGNING_MATERIAL_IN_ARTIFACTS", forbidden.length === 0, forbidden.length ? forbidden.join(", ") : "0 entradas");
    const nativeLibs = aabEntries.filter((e) => e.endsWith(".so")).length;

    // Web bundle + dex + config embarcados. Scan vazio não pode virar PASS:
    // o bundle web precisa estar no AAB e ser EXATAMENTE o export out/ atual
    // (arquivo a arquivo, sha256), com extras só os injetados pelo Capacitor.
    const aabPublic = path.join(work, "aab", "base", "assets", "public");
    const aabIndex = path.join(aabPublic, "index.html");
    const aabWebHashes = treeHashes(aabPublic);
    const aabWebFiles = Object.keys(aabWebHashes).length;
    gate("AAB_WEB_BUNDLE_PRESENT", existsSync(aabIndex) && aabWebFiles > 0, `${aabWebFiles} arquivo(s) em base/assets/public`);
    const webCompare = compareWebTrees(treeHashes(path.join(REPO_ROOT, "out")), aabWebHashes);
    gate(
      "AAB_WEB_MATCHES_OUT",
      webCompare.match,
      webCompare.match
        ? "árvore idêntica a out/"
        : `faltando=${webCompare.missing.length} diferentes=${webCompare.different.length} extras=${webCompare.unexpectedExtra.length}`
    );

    const aabFiles = listFiles(path.join(work, "aab", "base"));
    const apkFiles = listFiles(path.join(work, "apk"));
    const aabScan = scanTree(aabFiles);
    const apkScan = scanTree(apkFiles);
    const outScan = scanTree(listFiles(path.join(REPO_ROOT, "out")));
    for (const [label, scan] of [["AAB", aabScan], ["APK", apkScan], ["OUT", outScan]]) {
      gate(`${label}_SECRET_SCAN`, Object.keys(scan.secrets).length === 0, JSON.stringify(scan.secrets));
      gate(`${label}_DEV_BACKEND_SCAN`, Object.keys(scan.dev).length === 0, JSON.stringify(scan.dev));
      const productionHost = new URL(PRODUCTION_BACKEND_ORIGIN).hostname;
      const foreignVercel = scan.vercelHosts.filter((h) => h !== productionHost);
      gate(`${label}_ONLY_PRODUCTION_VERCEL_HOST`, foreignVercel.length === 0, foreignVercel.join(", ") || "ok");
    }
    // Backend Production: sem a origem embutida, a IA nativa fica
    // indisponível. Isso só passa (como WARN) com aceite humano explícito.
    const backendEmbedded = aabScan.productionOriginHits > 0;
    gate(
      "BACKEND_PRODUCTION_ORIGIN_EMBEDDED",
      backendEmbedded,
      backendEmbedded
        ? `${PRODUCTION_BACKEND_ORIGIN} embutida (${aabScan.productionOriginHits}x)`
        : `origem do backend NÃO embutida: IA nativa 'unavailable' (aceite humano: ${acceptBackendUnavailable ? "SIM" : "NÃO"})`,
      { hard: !acceptBackendUnavailable }
    );

    const capConfigFile = path.join(work, "aab", "base", "assets", "capacitor.config.json");
    const capConfig = existsSync(capConfigFile) ? JSON.parse(readFileSync(capConfigFile, "utf8")) : null;
    gate("CAPACITOR_APP_ID", capConfig?.appId === PACKAGE_ID, String(capConfig?.appId));
    gate(
      "WEBVIEW_DEBUGGING_DISABLED",
      capConfig?.android?.webContentsDebuggingEnabled !== true,
      `webContentsDebuggingEnabled=${capConfig?.android?.webContentsDebuggingEnabled}`
    );
    gate("CAPACITOR_NO_DEV_SERVER_URL", !capConfig?.server?.url, capConfig?.server?.url ? "server.url definido" : "ok");

    // --- Git: nada de chave/credencial versionada
    const lsFiles = run("git", ["ls-files"]);
    if (lsFiles.status !== 0) throw new Error("git ls-files falhou; auditoria de git inconclusiva.");
    const tracked = lsFiles.stdout.split(/\r?\n/).filter(Boolean);
    const trackedSecrets = tracked.filter((f) =>
      /\.(jks|keystore|p12|pfx|pepk)$|(^|\/)release-signing\.properties$|(^|\/)keystore\.properties$|(^|\/)\.env(\.|$)/i.test(f)
    );
    gate("KEYSTORE_IN_GIT", trackedSecrets.length === 0, trackedSecrets.join(", ") || "0");
    // Valores literais atribuídos a nomes de senha em QUALQUER arquivo
    // versionado (templates .example ficam de fora; valores nunca impressos).
    const binaryExt = /\.(png|jpe?g|gif|webp|ico|glb|gltf|bin|mp4|mov|webm|woff2?|ttf|otf|pdf|zip|jar|aar|so|keystore|jks)$/i;
    const secretHits = [];
    for (const file of tracked) {
      if (file.endsWith(".example") || binaryExt.test(file)) continue;
      const full = path.join(REPO_ROOT, file);
      if (!existsSync(full) || statSync(full).size > 2 * 1024 * 1024) continue;
      const n = committedSecretAssignments(file, readFileSync(full, "utf8"));
      if (n > 0) secretHits.push(`${file} (${n})`);
    }
    gate("SIGNING_PASSWORD_IN_GIT", secretHits.length === 0, secretHits.length ? `${secretHits.join(", ")} — valores omitidos` : "0");

    // O AAB precisa corresponder a um commit identificável.
    const gitDirty = run("git", ["status", "--porcelain"]).stdout.trim().length > 0;
    gate("GIT_TREE_CLEAN", !gitDirty, gitDirty ? "working tree com alterações" : "limpa", { hard: !allowDirty });

    const manifest = {
      schema: 1,
      generatedAt: new Date().toISOString(),
      gitHead: run("git", ["rev-parse", "HEAD"]).stdout.trim(),
      gitDirty,
      packageId: aabBadging.packageName,
      versionCode: aabBadging.versionCode,
      versionName: aabBadging.versionName,
      minSdk: aabBadging.minSdk,
      targetSdk: aabBadging.targetSdk,
      permissions: aabBadging.permissions,
      nativeLibs,
      apk: { path: path.relative(REPO_ROOT, APK), bytes: statSync(APK).size, sha256: apkSha },
      aab: { path: path.relative(REPO_ROOT, AAB), bytes: statSync(AAB).size, sha256: aabSha },
      signer: {
        subject: aabCert.owner,
        sha256: formatFingerprint(aabCert.sha256 ?? ""),
        sha1: formatFingerprint(aabCert.sha1 ?? ""),
        matchesUploadRecord: record ? fingerprintsEqual(aabCert.sha256, record.sha256) : null,
      },
      backend: {
        productionOriginEmbedded: backendEmbedded,
        limitationAccepted: backendEmbedded ? null : acceptBackendUnavailable,
        productionOriginHits: aabScan.productionOriginHits,
        runtimeEnvLookup: aabScan.runtimeEnvLookup,
        vercelHosts: aabScan.vercelHosts,
      },
      gates,
    };
    writeFileSync(MANIFEST_OUT, `${JSON.stringify(manifest, null, 2)}\n`);

    log(`${TAG} ${path.relative(REPO_ROOT, AAB)}`);
    log(`  PACKAGE_ID=${manifest.packageId} VERSION_CODE=${manifest.versionCode} VERSION_NAME=${manifest.versionName}`);
    log(`  AAB_SHA256=${aabSha}`);
    log(`  APK_SHA256=${apkSha}`);
    log(`  SIGNING_CERT_SUBJECT=${aabCert.owner}`);
    log(`  SIGNING_CERT_SHA256=${manifest.signer.sha256}`);
    log(`  SIGNING_CERT_SHA1=${manifest.signer.sha1}`);
    log(`  git HEAD=${manifest.gitHead}${manifest.gitDirty ? " (DIRTY)" : ""}`);
    for (const g of gates) log(`  [${g.status}] ${g.id} — ${g.detail}`);
    log(`  manifest: ${path.relative(REPO_ROOT, MANIFEST_OUT)}`);
    return manifest;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  // A auditoria não usa senha: nenhuma variável de senha segue para filhos.
  takeSecretEnv("");
  try {
    const manifest = runAudit({
      requireRecord: !argv.includes("--no-record"),
      acceptBackendUnavailable: argv.includes("--accept-backend-unavailable"),
      allowDirty: argv.includes("--allow-dirty"),
    });
    const failed = manifest.gates.filter((g) => g.status === "FAIL");
    if (failed.length > 0) {
      console.error(`${TAG} FALHOU: ${failed.map((g) => g.id).join(", ")}`);
      process.exit(1);
    }
    console.log(`${TAG} OK (${manifest.gates.filter((g) => g.status === "WARN").length} aviso(s)).`);
  } catch (error) {
    console.error(`${TAG} ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
