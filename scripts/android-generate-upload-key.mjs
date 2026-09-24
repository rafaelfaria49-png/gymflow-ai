// GOAL-117 — Gera a UPLOAD KEY DEFINITIVA do Google Play (separada da chave
// interna gymflow-internal do GOAL-115).
//
// Regras:
// - a chave SEMPRE fica FORA de qualquer repositório git, num diretório que o
//   humano escolheu e já criou (--out-dir obrigatório, sem default);
// - senha lida de forma interativa sem eco (digitada 2x); nunca aparece em
//   argumento de processo, log, arquivo ou relatório — o keytool a recebe por
//   variável de ambiente do filho (`-storepass:env`);
// - nunca sobrescreve keystore/certificado existente;
// - grava no repo APENAS o registro público (fingerprints + DN) em
//   android/play-upload-certificate.json, usado como contrato pelo build e
//   pela auditoria.
//
// Uso (num terminal interativo):
//   npm run android:upload-key:generate -- --out-dir "D:\\Cofre\\GymFlow\\upload-key"
// Flags: --alias gymflow-upload · --dname "CN=..., O=..., C=BR" · --record <json>
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  JAVA_EN_LOCALE,
  REPO_ROOT,
  canonicalPath,
  enclosingGitRoot,
  jdkTool,
  run,
  takeSecretEnv,
} from "./android/android-tools.mjs";
import {
  PACKAGE_ID,
  UPLOAD_CERT_RECORD,
  formatFingerprint,
  parseKeytoolCertificate,
  uploadPasswordProblems,
} from "./android/play-release-lib.mjs";
import { promptSecret } from "./android/prompt-secret.mjs";

const TAG = "[android:upload-key:generate]";
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

// Senha vinda do ambiente (só modo teste) sai do ambiente deste processo já
// aqui: nenhum filho a herda; o keytool a recebe só via extraEnv.
const envPassword = takeSecretEnv("GYMFLOW_UPLOAD_KEY_PASSWORD");

const outDirArg = flagValue("--out-dir", "");
const alias = flagValue("--alias", "gymflow-upload");
const dname = flagValue("--dname", "CN=GymFlow Upload, OU=Mobile, O=GymFlow, C=BR");
const recordPath = path.resolve(REPO_ROOT, flagValue("--record", UPLOAD_CERT_RECORD));

if (!outDirArg) {
  fail("Informe --out-dir com o diretório seguro (fora do repo) confirmado para guardar a upload key.");
}
if (!path.isAbsolute(outDirArg)) fail("--out-dir precisa ser um caminho absoluto.");
if (!existsSync(outDirArg) || !statSync(outDirArg).isDirectory()) {
  fail(`Diretório não existe: ${outDirArg}. Crie-o conscientemente antes (local seguro escolhido por você).`);
}
// Caminho canônico (symlink/junction resolvidos) antes de checar repo git.
const outDir = canonicalPath(outDirArg);
const gitRoot = enclosingGitRoot(outDir);
if (gitRoot) fail(`Recusado: ${outDir} está dentro do repositório git ${gitRoot}. A upload key nunca fica em repo.`);

const keystorePath = path.join(outDir, "gymflow-upload-key.jks");
const certPath = path.join(outDir, "gymflow-upload-certificate.pem");
for (const target of [keystorePath, certPath]) {
  if (existsSync(target)) fail(`Já existe: ${target}. Nada foi sobrescrito (uma upload key não se substitui por engano).`);
}
if (existsSync(recordPath)) {
  fail(`Registro público já existe: ${path.relative(REPO_ROOT, recordPath)}. Upload key definitiva já foi gerada.`);
}

// Senha: interativa (padrão). GYMFLOW_UPLOAD_KEY_PASSWORD existe só para o
// teste automatizado com chave descartável; nunca use para a chave real.
let password = envPassword;
if (password) {
  console.warn(`${TAG} AVISO: senha lida de GYMFLOW_UPLOAD_KEY_PASSWORD (modo teste/descartável).`);
} else {
  console.log(`${TAG} Upload key: ${keystorePath}`);
  console.log(`${TAG} A senha NÃO aparece na tela. Guarde-a num cofre de senhas antes de continuar.`);
  try {
    password = await promptSecret("Senha da upload key: ");
    const again = await promptSecret("Repita a senha: ");
    if (password !== again) fail("As senhas não conferem. Nada foi gerado.");
  } catch (error) {
    fail(`${error instanceof Error ? error.message : String(error)} Nada foi gerado.`);
  }
}
const problems = uploadPasswordProblems(password);
if (problems.length > 0) fail(`Senha recusada: ${problems.join("; ")}. Nada foi gerado.`);

const secretEnv = { GYMFLOW_UPLOAD_KEY_SECRET: password };
const keytool = jdkTool("keytool");

console.log(`${TAG} Gerando par de chaves RSA 4096 / SHA256withRSA / 10000 dias (PKCS12)...`);
const gen = run(
  keytool,
  [
    ...JAVA_EN_LOCALE,
    "-genkeypair",
    "-storetype", "PKCS12",
    "-keystore", keystorePath,
    "-alias", alias,
    "-keyalg", "RSA",
    "-keysize", "4096",
    "-sigalg", "SHA256withRSA",
    "-validity", "10000",
    "-dname", dname,
    "-storepass:env", "GYMFLOW_UPLOAD_KEY_SECRET",
    "-keypass:env", "GYMFLOW_UPLOAD_KEY_SECRET",
  ],
  { extraEnv: secretEnv }
);
if (gen.status !== 0 || !existsSync(keystorePath)) {
  fail(`keytool -genkeypair falhou (exit ${gen.status}). Saída:\n${gen.output.trim()}`);
}

const exp = run(
  keytool,
  [
    ...JAVA_EN_LOCALE,
    "-exportcert",
    "-rfc",
    "-keystore", keystorePath,
    "-alias", alias,
    "-storepass:env", "GYMFLOW_UPLOAD_KEY_SECRET",
    "-file", certPath,
  ],
  { extraEnv: secretEnv }
);
if (exp.status !== 0 || !existsSync(certPath)) {
  fail(`keytool -exportcert falhou (exit ${exp.status}). Keystore criado em ${keystorePath}; revise antes de repetir.`);
}

// Fingerprints a partir do certificado PÚBLICO (sem senha).
const printed = run(keytool, [...JAVA_EN_LOCALE, "-printcert", "-v", "-file", certPath]);
const cert = parseKeytoolCertificate(printed.output);
if (printed.status !== 0 || !cert.sha256 || !cert.sha1 || !cert.owner) {
  fail(`Não foi possível ler os fingerprints do certificado público (exit ${printed.status}).`);
}

const record = {
  schema: 1,
  purpose: "Google Play upload key (GOAL-117). Registro PUBLICO: sem senha, sem chave privada.",
  packageId: PACKAGE_ID,
  keyAlias: alias,
  storeType: "PKCS12",
  keystoreFileName: path.basename(keystorePath),
  certificateFileName: path.basename(certPath),
  subject: cert.owner,
  keyAlgorithm: cert.keyAlgorithm,
  signatureAlgorithm: "SHA256withRSA",
  validUntil: cert.validUntil,
  sha256: formatFingerprint(cert.sha256),
  sha1: formatFingerprint(cert.sha1),
  createdAt: new Date().toISOString().slice(0, 10),
};
mkdirSync(path.dirname(recordPath), { recursive: true });
writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);

console.log(`\n${TAG} OK — upload key gerada (senha não exibida).`);
console.log(`  keystore (PRIVADO, fora do repo): ${keystorePath}`);
console.log(`  certificado público (PEM):        ${certPath}`);
console.log(`  registro público no repo:         ${path.relative(REPO_ROOT, recordPath)}`);
console.log(`  subject: ${record.subject}`);
console.log(`  UPLOAD_CERT_SHA256: ${record.sha256}`);
console.log(`  UPLOAD_CERT_SHA1:   ${record.sha1}`);
console.log(`  válido até: ${record.validUntil}`);
console.log("\nANTES de usar esta chave, complete o backup (a chave NÃO pode ser recuperada pelo GymFlow):");
console.log("  1. cópia primária: este arquivo .jks no local escolhido;");
console.log("  2. backup OFFLINE separado (ex.: pendrive/HD criptografado guardado fora deste PC);");
console.log("  3. senha guardada SEPARADAMENTE num cofre confiável (nunca junto do .jks, nunca no git).");
