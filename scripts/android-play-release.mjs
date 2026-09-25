// GOAL-117 — Build FINAL para o Google Play assinado com a UPLOAD KEY.
//
// Sequência (a mesma do guia), sempre completa: build:mobile -> cap sync
// android -> gradlew clean assembleRelease bundleRelease -> auditoria.
//
// Segurança:
// - senha lida sem eco (ou GYMFLOW_RELEASE_STORE_PASSWORD já definida pelo
//   operador — retirada do ambiente deste processo logo no início); chega ao
//   keytool/Gradle só via env do filho específico, com --no-daemon para
//   nenhum daemon reter a senha após o build;
// - as 4 variáveis GYMFLOW_RELEASE_* são definidas juntas, então o
//   android/release-signing.properties local (chave INTERNA) é ignorado;
// - antes de compilar, confere que keystore+alias+senha produzem exatamente o
//   fingerprint registrado em android/play-upload-certificate.json;
// - build web/cap sync/auditoria não recebem nenhuma variável de assinatura;
// - --expect-version-code obriga o operador a confirmar o versionCode que o
//   Play Console aceita (nada de incremento cego);
// - árvore git limpa antes, depois do cap sync e na auditoria;
// - modo de backend declarado e exclusivo, conferido contra a origem EFETIVA
//   antes do build e contra o bundle na auditoria:
//   --accept-backend-unavailable (IA nativa indisponível, aceita no gate) ou
//   --expect-backend-production (origem Production embutida).
//
// Uso (terminal interativo):
//   npm run android:play:release -- --keystore "D:\\Cofre\\GymFlow\\upload-key\\gymflow-upload-key.jks" --expect-version-code 1 --accept-backend-unavailable
// Flag de teste: --allow-dirty — aceita SOMENTE com registro de chave
// descartável (subject "THROWAWAY TEST ONLY"); recusada com a upload key real.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  ANDROID_DIR,
  JAVA_EN_LOCALE,
  REPO_ROOT,
  canonicalPath,
  effectiveBackendOrigin,
  enclosingGitRoot,
  jdkTool,
  run,
  takeSecretEnv,
} from "./android/android-tools.mjs";
import {
  PRODUCTION_BACKEND_ORIGIN,
  UPLOAD_CERT_RECORD,
  fingerprintsEqual,
  formatFingerprint,
  isThrowawayRecord,
  parseGradleVersion,
  parseKeytoolCertificate,
  planMobileBackend,
} from "./android/play-release-lib.mjs";
import { promptSecret } from "./android/prompt-secret.mjs";
import { runAudit } from "./android-release-audit.mjs";

const TAG = "[android:play:release]";
const args = process.argv.slice(2);
function flagValue(name, fallback) {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}
function fail(message) {
  console.error(`${TAG} ${message}`);
  process.exit(1);
}

// 0. Senha opcional do ambiente sai JÁ do ambiente deste processo (todas as
// variáveis de senha): nenhum filho a herda por acidente.
let password = takeSecretEnv("GYMFLOW_RELEASE_STORE_PASSWORD");
const SIGNING_ENV_NAMES = ["GYMFLOW_RELEASE_STORE_FILE", "GYMFLOW_RELEASE_KEY_ALIAS"];
for (const name of SIGNING_ENV_NAMES) delete process.env[name];
// O release só embute backend Production ou nada (ver build-mobile.mjs).
delete process.env.GYMFLOW_ALLOW_NON_PRODUCTION_BACKEND;

const allowDirty = args.includes("--allow-dirty");
const acceptBackendUnavailable = args.includes("--accept-backend-unavailable");
const expectBackendProduction = args.includes("--expect-backend-production");
if (args.includes("--skip-web")) fail("--skip-web não existe no fluxo Play: o bundle web é sempre regenerado.");

// 1. Registro público da upload key (contrato de assinatura)
const recordFile = path.join(REPO_ROOT, UPLOAD_CERT_RECORD);
if (!existsSync(recordFile)) fail(`${UPLOAD_CERT_RECORD} ausente. Gere a upload key antes (npm run android:upload-key:generate).`);
const record = JSON.parse(readFileSync(recordFile, "utf8"));
if (allowDirty && !isThrowawayRecord(record)) {
  fail("--allow-dirty só existe para teste com chave DESCARTÁVEL; com a upload key real a árvore precisa estar limpa.");
}

// 2. Keystore: caminho explícito, existente e FORA de repositório git
// (symlink/junction resolvidos antes da checagem)
const keystoreArg = flagValue("--keystore", process.env.GYMFLOW_UPLOAD_STORE_FILE ?? "");
if (!keystoreArg || !path.isAbsolute(keystoreArg)) fail("Informe --keystore com o caminho ABSOLUTO da upload key.");
if (!existsSync(keystoreArg)) fail(`Keystore não encontrado: ${keystoreArg}`);
const keystore = canonicalPath(keystoreArg);
if (enclosingGitRoot(keystore)) fail(`Recusado: ${keystore} está dentro de um repositório git.`);

// 3. versionCode confirmado pelo operador == build.gradle
const expectedCode = Number(flagValue("--expect-version-code", ""));
const gradle = parseGradleVersion(readFileSync(path.join(ANDROID_DIR, "app", "build.gradle"), "utf8"));
if (!Number.isInteger(expectedCode) || expectedCode < 1) {
  fail("Informe --expect-version-code <N> (o versionCode que o Play Console aceita para este upload).");
}
if (gradle.versionCode !== expectedCode) {
  fail(`versionCode do build.gradle (${gradle.versionCode}) != --expect-version-code (${expectedCode}). Ajuste via PR antes.`);
}

// 4. Backend: modo declarado pelo operador (o mesmo aprovado no gate humano)
// vira o modo EXPLÍCITO do build:mobile (`--ai-backend none|production`,
// GOAL-118) e é conferido antes contra a origem EFETIVA (ambiente + .env*,
// calculada com o carregador do Next) pela MESMA regra do build:mobile, sem a
// exceção de QA. Modos exclusivos.
if (acceptBackendUnavailable === expectBackendProduction) {
  fail(
    "Declare exatamente um modo de backend: --accept-backend-unavailable (IA nativa indisponível, " +
      "aceita no gate) ou --expect-backend-production (origem Production embutida)."
  );
}
const backendMode = acceptBackendUnavailable ? "unavailable" : "production";
const buildBackendMode = acceptBackendUnavailable ? "none" : "production";
const { origin: effectiveOrigin, source: originSource } = effectiveBackendOrigin();
const backendPlan = planMobileBackend({ mode: buildBackendMode, effectiveOrigin, allowNonProduction: false });
if (backendPlan.error) fail(`Backend recusado (origem efetiva via ${originSource}): ${backendPlan.error}. Nada foi compilado.`);
if (backendPlan.origin !== (expectBackendProduction ? PRODUCTION_BACKEND_ORIGIN : "")) {
  fail(`Backend planejado (${backendPlan.origin || "nenhum"}) não bate com o modo declarado. Nada foi compilado.`);
}

// 5. Árvore limpa: o AAB precisa corresponder a um commit identificável
function assertCleanTree(moment) {
  const status = run("git", ["status", "--porcelain"]);
  if (status.status !== 0) fail(`git status falhou ${moment} (exit ${status.status}); proveniência inconclusiva.`);
  if (status.stdout.trim() && !allowDirty) fail(`Working tree com alterações ${moment}. Nada deve mudar arquivos versionados no release.`);
}
assertCleanTree("antes do build");

// 6. Senha (sem eco) + conferência do fingerprint ANTES do build
if (!password) {
  try {
    password = await promptSecret(`Senha da upload key (${path.basename(keystore)}): `);
  } catch (error) {
    fail(`${error instanceof Error ? error.message : String(error)} Nada foi compilado.`);
  }
}
if (!password) fail("Senha vazia.");

const list = run(
  jdkTool("keytool"),
  [...JAVA_EN_LOCALE, "-list", "-v", "-keystore", keystore, "-alias", record.keyAlias, "-storepass:env", "GYMFLOW_RELEASE_STORE_PASSWORD"],
  { extraEnv: { GYMFLOW_RELEASE_STORE_PASSWORD: password } }
);
if (list.status !== 0) {
  const reason = /password was incorrect|keystore password/i.test(list.output)
    ? "senha incorreta"
    : /does not exist|not exist/i.test(list.output)
      ? `alias '${record.keyAlias}' inexistente`
      : `keytool exit ${list.status}`;
  fail(`Não foi possível abrir a upload key: ${reason}. Nada foi compilado.`);
}
const keyCert = parseKeytoolCertificate(list.output);
if (!fingerprintsEqual(keyCert.sha256, record.sha256)) {
  fail(
    `Keystore NÃO corresponde ao registro público: ${formatFingerprint(keyCert.sha256 ?? "")} != ${record.sha256}. Nada foi compilado.`
  );
}
// A exceção de teste vale pelo CERTIFICADO REAL, não pelo texto do registro
// (editável): o subject do keystore precisa ter o marcador e bater com o registro.
if (allowDirty && !(keyCert.owner === record.subject && isThrowawayRecord({ subject: keyCert.owner }))) {
  fail("--allow-dirty recusado: o certificado real do keystore não é de chave descartável de teste.");
}
console.log(`${TAG} Upload key conferida: ${record.sha256}`);

function step(label, command, commandArgs, { cwd = REPO_ROOT, extraEnv = {} } = {}) {
  console.log(`\n${TAG} ${label}`);
  const env = { ...process.env, ...extraEnv };
  // Windows: wrappers .cmd/.bat (npm/npx/gradlew) exigem shell; a linha é
  // montada aqui só com constantes deste script (nada vindo do usuário).
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...commandArgs].join(" "), { cwd, env, stdio: "inherit", shell: true })
      : spawnSync(command, commandArgs, { cwd, env, stdio: "inherit" });
  if (result.status !== 0) fail(`${label} falhou (exit ${result.status}).`);
}

step(`1/3 npm run build:mobile -- --ai-backend ${buildBackendMode}`, "npm", ["run", "build:mobile", "--", "--ai-backend", buildBackendMode]);
step("2/3 npx cap sync android", "npx", ["cap", "sync", "android"]);
assertCleanTree("depois do cap sync");

const gradlew = process.platform === "win32" ? `"${path.join(ANDROID_DIR, "gradlew.bat")}"` : "./gradlew";
step("3/3 gradlew --no-daemon clean assembleRelease bundleRelease (upload key)", gradlew, ["--no-daemon", "clean", "assembleRelease", "bundleRelease"], {
  cwd: ANDROID_DIR,
  extraEnv: {
    GYMFLOW_RELEASE_STORE_FILE: keystore,
    GYMFLOW_RELEASE_STORE_PASSWORD: password,
    GYMFLOW_RELEASE_KEY_ALIAS: record.keyAlias,
    // PKCS12: a senha da chave é a mesma do keystore.
    GYMFLOW_RELEASE_KEY_PASSWORD: password,
  },
});
password = "";

console.log(`\n${TAG} Auditoria pós-build`);
const manifest = runAudit({ requireRecord: true, backendMode, allowDirty });
const failed = manifest.gates.filter((g) => g.status === "FAIL");
if (failed.length > 0) fail(`Auditoria FALHOU: ${failed.map((g) => g.id).join(", ")}. NÃO enviar ao Play.`);
console.log(`\n${TAG} OK — AAB pronto para o gate humano (não enviado a lugar nenhum).`);
console.log(`  AAB_SHA256=${manifest.aab.sha256}`);
console.log(`  UPLOAD_CERT_SHA256=${manifest.signer.sha256}`);
console.log(
  `  BACKEND_PRODUCTION=${manifest.backend.productionOriginEmbedded ? "EMBEDDED" : "NOT_CONFIGURED"}` +
    (manifest.backend.productionOriginEmbedded ? "" : " (limitação aceita via --accept-backend-unavailable)")
);
