// GOAL-115 — Gera uma chave de signing de release para DISTRIBUICAO INTERNA.
//
// NUNCA commita segredos: o keystore (.jks) e o release-signing.properties
// sao ignorados pelo git (android/.gitignore). Este script NAO imprime senhas
// e NAO grava credenciais no repositorio — apenas no arquivo local ignorado.
//
// A chave gerada aqui e para VALIDACAO INTERNA (build release assinado,
// instalacao via adb/sideload, smoke). A UPLOAD KEY definitiva do Google Play
// exige decisao humana sobre armazenamento/backup/senhas (cofre + backup
// offline); ver docs/mobile/ANDROID_INTERNAL_RELEASE_115.md.
//
// Uso (PowerShell/cmd):
//   set GYMFLOW_RELEASE_STORE_PASSWORD=***
//   set GYMFLOW_RELEASE_KEY_PASSWORD=***
//   node scripts/android-generate-release-key.mjs [--alias gymflow-internal] [--file android/gymflow-internal-key.jks] [--force]
//
// Defaults seguros: alias `gymflow-internal`, arquivo
// `android/gymflow-internal-key.jks` (git-ignorados por *.jks).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function flagValue(name, fallback) {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}

const alias = flagValue("--alias", process.env.GYMFLOW_RELEASE_KEY_ALIAS ?? "gymflow-internal");
const storeFileArg =
  flagValue("--file", process.env.GYMFLOW_RELEASE_STORE_FILE ?? "android/gymflow-internal-key.jks");
const force = args.includes("--force");

const storePassword = process.env.GYMFLOW_RELEASE_STORE_PASSWORD ?? "";
const keyPassword = process.env.GYMFLOW_RELEASE_KEY_PASSWORD ?? "";

if (!storePassword || !keyPassword) {
  console.error(
    "[android:generate-release-key] Defina GYMFLOW_RELEASE_STORE_PASSWORD e GYMFLOW_RELEASE_KEY_PASSWORD no ambiente (nunca no git)."
  );
  process.exit(1);
}

const androidDir = path.resolve("android");
const storePath = path.isAbsolute(storeFileArg) ? storeFileArg : path.resolve(storeFileArg);

if (existsSync(storePath) && !force) {
  console.error(
    `[android:generate-release-key] Keystore ja existe: ${storePath}. Use --force para sobrescrever (a chave antiga sera invalidada para updates).`
  );
  process.exit(1);
}

const javaHome = process.env.JAVA_HOME ?? "";
const keytool = javaHome ? path.join(javaHome, "bin", process.platform === "win32" ? "keytool.exe" : "keytool") : "keytool";

const dname = "CN=GymFlow Internal, OU=Mobile, O=GymFlow, C=BR";
const result = spawnSync(
  keytool,
  [
    "-genkeypair",
    "-v",
    "-keystore", storePath,
    "-alias", alias,
    "-keyalg", "RSA",
    "-keysize", "4096",
    "-validity", "10000",
    "-storepass", storePassword,
    "-keypass", keyPassword,
    "-dname", dname,
  ],
  { stdio: "inherit", shell: false }
);

if (result.status !== 0) {
  console.error(`[android:generate-release-key] keytool falhou (exit code: ${result.status})`);
  process.exit(result.status ?? 1);
}

// Grava o properties local (git-ignorado) apontando para o keystore gerado,
// usando caminho relativo a android/ quando possivel.
let storeRef = storePath;
const rel = path.relative(androidDir, storePath);
if (!rel.startsWith("..")) storeRef = rel.split(path.sep).join("/");

const propsPath = path.join(androidDir, "release-signing.properties");
// NOTA PKCS12: o keytool moderno grava `.jks` como PKCS12, que nao aceita
// keypass distinta da storepass (a keypass informada e ignorada). Por isso o
// properties local registra a mesma senha nos dois campos.
const { writeFileSync } = await import("node:fs");
writeFileSync(
  propsPath,
  [
    "# Gerado localmente por scripts/android-generate-release-key.mjs (GOAL-115).",
    "# ARQUIVO LOCAL — nunca commitar (ignorado pelo git).",
    "# PKCS12: storePassword e keyPassword sao iguais por exigencia do formato.",
    `storeFile=${storeRef}`,
    "storePassword=" + storePassword,
    `keyAlias=${alias}`,
    "keyPassword=" + storePassword,
    "",
  ].join("\n")
);

console.log("\n[android:generate-release-key] OK (senhas nao exibidas).");
console.log(`  keystore: ${storePath} (git-ignorado)`);
console.log(`  config:   ${propsPath} (git-ignorado)`);
console.log("  Proximo: npm run android:apk:release && npm run android:bundle:release");
