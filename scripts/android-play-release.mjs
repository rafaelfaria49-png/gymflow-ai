// GOAL-117 — Build FINAL para o Google Play assinado com a UPLOAD KEY.
//
// Sequência (a mesma do guia): build:mobile -> cap sync android ->
// gradlew clean assembleRelease bundleRelease -> auditoria completa.
//
// Segurança:
// - senha lida sem eco (ou GYMFLOW_RELEASE_STORE_PASSWORD já definida pelo
//   operador); chega ao Gradle só por variável de ambiente do processo filho,
//   com --no-daemon para nenhum daemon reter a senha após o build;
// - as 4 variáveis GYMFLOW_RELEASE_* são definidas juntas, então o
//   android/release-signing.properties local (chave INTERNA) é ignorado;
// - antes de compilar, confere que keystore+alias+senha produzem exatamente o
//   fingerprint registrado em android/play-upload-certificate.json;
// - o build web NÃO recebe nenhuma variável de assinatura;
// - --expect-version-code obriga o operador a confirmar o versionCode que o
//   Play Console aceita (nada de incremento cego).
//
// Uso (terminal interativo):
//   npm run android:play:release -- --keystore "D:\\Cofre\\GymFlow\\upload-key\\gymflow-upload-key.jks" --expect-version-code 1
// Flags: --skip-web (reusa out/ + cap sync já feitos) · --allow-dirty
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ANDROID_DIR, JAVA_EN_LOCALE, REPO_ROOT, enclosingGitRoot, jdkTool, run } from "./android/android-tools.mjs";
import {
  UPLOAD_CERT_RECORD,
  fingerprintsEqual,
  formatFingerprint,
  parseGradleVersion,
  parseKeytoolCertificate,
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

const SIGNING_ENV_NAMES = [
  "GYMFLOW_RELEASE_STORE_FILE",
  "GYMFLOW_RELEASE_STORE_PASSWORD",
  "GYMFLOW_RELEASE_KEY_ALIAS",
  "GYMFLOW_RELEASE_KEY_PASSWORD",
];

// 1. Registro público da upload key (contrato de assinatura)
const recordFile = path.join(REPO_ROOT, UPLOAD_CERT_RECORD);
if (!existsSync(recordFile)) fail(`${UPLOAD_CERT_RECORD} ausente. Gere a upload key antes (npm run android:upload-key:generate).`);
const record = JSON.parse(readFileSync(recordFile, "utf8"));

// 2. Keystore: caminho explícito, existente e FORA de repositório git
const keystoreArg = flagValue("--keystore", process.env.GYMFLOW_UPLOAD_STORE_FILE ?? "");
if (!keystoreArg || !path.isAbsolute(keystoreArg)) fail("Informe --keystore com o caminho ABSOLUTO da upload key.");
const keystore = path.resolve(keystoreArg);
if (!existsSync(keystore)) fail(`Keystore não encontrado: ${keystore}`);
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

// 4. Árvore limpa: o AAB precisa corresponder a um commit identificável
const dirty = run("git", ["status", "--porcelain"]).stdout.trim();
if (dirty && !args.includes("--allow-dirty")) fail("Working tree com alterações. Faça commit/stash (ou --allow-dirty conscientemente).");

// 5. Senha (sem eco) + conferência do fingerprint ANTES do build
let password = process.env.GYMFLOW_RELEASE_STORE_PASSWORD ?? "";
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
console.log(`${TAG} Upload key conferida: ${record.sha256}`);

// Ambiente sem NENHUMA variável de assinatura (build web / cap sync) e sem a
// exceção de backend não-Production: o release só embute Production ou nada.
const cleanEnv = { ...process.env };
for (const name of [...SIGNING_ENV_NAMES, "GYMFLOW_ALLOW_NON_PRODUCTION_BACKEND"]) delete cleanEnv[name];

function step(label, command, commandArgs, { cwd = REPO_ROOT, env = cleanEnv } = {}) {
  console.log(`\n${TAG} ${label}`);
  // Windows: wrappers .cmd/.bat (npm/npx/gradlew) exigem shell; a linha é
  // montada aqui só com constantes deste script (nada vindo do usuário).
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...commandArgs].join(" "), { cwd, env, stdio: "inherit", shell: true })
      : spawnSync(command, commandArgs, { cwd, env, stdio: "inherit" });
  if (result.status !== 0) fail(`${label} falhou (exit ${result.status}).`);
}

if (!args.includes("--skip-web")) {
  step("1/3 npm run build:mobile", "npm", ["run", "build:mobile"]);
  step("2/3 npx cap sync android", "npx", ["cap", "sync", "android"]);
} else {
  console.log(`${TAG} --skip-web: reutilizando out/ e android/ já sincronizados.`);
}

const gradlew = process.platform === "win32" ? `"${path.join(ANDROID_DIR, "gradlew.bat")}"` : "./gradlew";
step("3/3 gradlew --no-daemon clean assembleRelease bundleRelease (upload key)", gradlew, ["--no-daemon", "clean", "assembleRelease", "bundleRelease"], {
  cwd: ANDROID_DIR,
  env: {
    ...cleanEnv,
    GYMFLOW_RELEASE_STORE_FILE: keystore,
    GYMFLOW_RELEASE_STORE_PASSWORD: password,
    GYMFLOW_RELEASE_KEY_ALIAS: record.keyAlias,
    // PKCS12: a senha da chave é a mesma do keystore.
    GYMFLOW_RELEASE_KEY_PASSWORD: password,
  },
});
password = "";

console.log(`\n${TAG} Auditoria pós-build`);
const manifest = runAudit({ requireRecord: true });
const failed = manifest.gates.filter((g) => g.status === "FAIL");
if (failed.length > 0) fail(`Auditoria FALHOU: ${failed.map((g) => g.id).join(", ")}. NÃO enviar ao Play.`);
console.log(`\n${TAG} OK — AAB pronto para o gate humano (não enviado a lugar nenhum).`);
console.log(`  AAB_SHA256=${manifest.aab.sha256}`);
console.log(`  UPLOAD_CERT_SHA256=${manifest.signer.sha256}`);
