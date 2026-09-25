// GOAL-117 — Resolução das ferramentas JDK/Android SDK e execução segura.
// Segredos só chegam aos processos filhos por variável de ambiente
// (`-storepass:env`), nunca por argumento de linha de comando.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { mobileBuildEnv, normalizeBackendEnv, parseMobileAiBackendMode, planMobileBackend } from "./play-release-lib.mjs";

const isWin = process.platform === "win32";
export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
export const ANDROID_DIR = path.join(REPO_ROOT, "android");

// Força rótulos em inglês na saída do keytool/jarsigner (o parser depende
// deles; o locale pt-BR traduz "Owner", "jar verified" etc.).
export const JAVA_EN_LOCALE = ["-J-Duser.language=en", "-J-Duser.country=US"];

export function jdkTool(name) {
  const exe = isWin ? `${name}.exe` : name;
  const javaHome = process.env.JAVA_HOME ?? "";
  if (javaHome) {
    const candidate = path.join(javaHome, "bin", exe);
    if (existsSync(candidate)) return candidate;
  }
  return exe;
}

function sdkRoot() {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const localProps = path.join(ANDROID_DIR, "local.properties");
  if (existsSync(localProps)) {
    const sdkDir = readFileSync(localProps, "utf8").match(/^sdk\.dir=(.+)$/m)?.[1]?.trim();
    if (sdkDir) {
      const unescaped = sdkDir.replace(/\\:/g, ":").replace(/\\\\/g, "\\");
      if (existsSync(unescaped)) return unescaped;
    }
  }
  return null;
}

function compareVersions(a, b) {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** build-tools mais recente que contém apksigner.jar e aapt2. */
export function buildToolsDir() {
  const root = sdkRoot();
  if (!root) throw new Error("Android SDK não encontrado (ANDROID_HOME/ANDROID_SDK_ROOT/local.properties).");
  const base = path.join(root, "build-tools");
  const versions = readdirSync(base)
    .filter((v) => existsSync(path.join(base, v, "lib", "apksigner.jar")))
    .sort(compareVersions);
  if (versions.length === 0) throw new Error(`Nenhum build-tools com apksigner em ${base}.`);
  return path.join(base, versions[versions.length - 1]);
}

export function aapt2Path() {
  return path.join(buildToolsDir(), isWin ? "aapt2.exe" : "aapt2");
}

/**
 * Executa um binário sem shell. `extraEnv` é mesclado somente no ambiente
 * do filho. A saída é devolvida para parsing; quem chama decide o que
 * imprimir (nunca há senha na saída dessas ferramentas).
 */
export function run(command, args, { cwd = REPO_ROOT, extraEnv = {}, input } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    input,
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

/**
 * Origem do backend que o `next build` EFETIVAMENTE vai embutir: ambiente do
 * processo + `.env*` (ignorados pelo git), calculada com o carregador do
 * próprio Next (`@next/env`, mesmos arquivos e ordem do modo production).
 * O ambiente deste processo é restaurado ao final (nada de `.env` vaza para
 * filhos por aqui). Retorna só a origem pública e nomes de arquivo.
 */
export function effectiveBackendOrigin(cwd = REPO_ROOT) {
  const snapshot = { ...process.env };
  try {
    const { combinedEnv, loadedEnvFiles } = nextEnv.loadEnvConfig(cwd, false, { info() {}, error: console.error }, true);
    const fromProcess = (snapshot.NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL ?? "").trim() !== "";
    return {
      origin: (combinedEnv.NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL ?? "").trim().replace(/\/+$/, ""),
      source: fromProcess ? "ambiente" : `arquivos .env (${loadedEnvFiles.map((f) => f.path).join(", ") || "nenhum"})`,
    };
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in snapshot)) delete process.env[key];
    Object.assign(process.env, snapshot);
  }
}

/**
 * GOAL-118: plano completo do `build:mobile`. Normaliza a variável do backend
 * NO PRÓPRIO ambiente do processo (vazia/espaços = ausente) ANTES da primeira
 * leitura do `@next/env` — que fixa o ambiente inicial —, avalia a origem
 * efetiva e monta o ambiente do `next build` a partir desse MESMO ambiente.
 * Retorna `{ mode, effective, plan, buildEnv }` (`plan.error` quando recusado).
 */
export function resolveMobileBuild(argv, cwd = REPO_ROOT) {
  normalizeBackendEnv(process.env);
  const mode = parseMobileAiBackendMode(argv);
  const effective = effectiveBackendOrigin(cwd);
  const plan = planMobileBackend({ mode, effectiveOrigin: effective.origin });
  return { mode, effective, plan, buildEnv: plan.error ? null : mobileBuildEnv(process.env, plan) };
}

// Toda variável que pode carregar senha de assinatura/upload key.
export const SECRET_ENV_NAMES = [
  "GYMFLOW_RELEASE_STORE_PASSWORD",
  "GYMFLOW_RELEASE_KEY_PASSWORD",
  "GYMFLOW_UPLOAD_KEY_PASSWORD",
  "GYMFLOW_UPLOAD_KEY_SECRET",
];

/**
 * Retira do ambiente DESTE processo as variáveis de senha (devolvendo o
 * valor pedido), para que nenhum filho as herde por acidente. Quem precisa
 * da senha a repassa explicitamente via `extraEnv` a um filho específico.
 */
export function takeSecretEnv(name) {
  const value = process.env[name] ?? "";
  for (const secretName of SECRET_ENV_NAMES) delete process.env[secretName];
  return value;
}

export function runApksigner(args) {
  return run(jdkTool("java"), ["-jar", path.join(buildToolsDir(), "lib", "apksigner.jar"), ...args]);
}

/**
 * Caminho canônico: resolve symlinks/junctions do trecho existente (o resto
 * do caminho, se ainda não existe, é anexado ao ancestral resolvido).
 */
export function canonicalPath(target) {
  let existing = path.resolve(target);
  const pending = [];
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    pending.unshift(path.basename(existing));
    existing = parent;
  }
  const resolved = existsSync(existing) ? realpathSync.native(existing) : existing;
  return path.join(resolved, ...pending);
}

/** Raiz do repositório git que contém `target` (após canonicalizar) ou null. */
export function enclosingGitRoot(target) {
  let current = canonicalPath(target);
  for (;;) {
    if (existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
