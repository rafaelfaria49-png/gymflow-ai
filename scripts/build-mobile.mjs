// GOAL-12 — Build mobile (Capacitor).
// Força BUILD_TARGET=mobile de forma cross-platform (Windows/PowerShell não
// aceita `VAR=valor cmd` inline) e roda `next build`, que com o export ligado
// gera a pasta estática `out/` consumida pelo WebView do Capacitor.
import { spawnSync } from "node:child_process";

const result = spawnSync("next", ["build"], {
  stdio: "inherit",
  shell: true, // resolve `next`/`next.cmd` via PATH no Windows e no Unix
  env: { ...process.env, BUILD_TARGET: "mobile" },
});

process.exit(result.status ?? 1);
