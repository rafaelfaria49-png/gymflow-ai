// GOAL-117 — Resolução das ferramentas JDK/Android SDK e execução segura.
// Segredos só chegam aos processos filhos por variável de ambiente
// (`-storepass:env`), nunca por argumento de linha de comando.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

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

export function runApksigner(args) {
  return run(jdkTool("java"), ["-jar", path.join(buildToolsDir(), "lib", "apksigner.jar"), ...args]);
}

/** Raiz do repositório git que contém `target` (ou null). */
export function enclosingGitRoot(target) {
  let current = path.resolve(target);
  for (;;) {
    if (existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
