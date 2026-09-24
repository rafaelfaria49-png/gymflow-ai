// GOAL-12 — Build mobile (Capacitor).
// Força BUILD_TARGET=mobile de forma cross-platform (Windows/PowerShell não
// aceita `VAR=valor cmd` inline) e roda `next build`, que com o export ligado
// gera a pasta estática `out/` consumida pelo WebView do Capacitor.
import { spawnSync } from "node:child_process";
import { backendOriginProblems, PRODUCTION_BACKEND_ORIGIN } from "./android/play-release-lib.mjs";

// GOAL-117: a origem pública do backend GymFlow vira constante no bundle.
// Só é aceita a Production GymFlow (ou nenhuma = IA nativa "unavailable"
// honesta). Nunca localhost/LAN/túnel/provedor de IA direto. Outra origem
// HTTPS só com GYMFLOW_ALLOW_NON_PRODUCTION_BACKEND=1 (QA local, nunca release).
const backendOrigin = (process.env.NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL ?? "").trim().replace(/\/+$/, "");
if (backendOrigin) {
  const problems = backendOriginProblems(backendOrigin);
  if (problems.length > 0) {
    console.error(`[build:mobile] NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL recusada: ${problems.join("; ")}.`);
    process.exit(1);
  }
  if (backendOrigin !== PRODUCTION_BACKEND_ORIGIN && process.env.GYMFLOW_ALLOW_NON_PRODUCTION_BACKEND !== "1") {
    console.error(
      `[build:mobile] NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL (${backendOrigin}) não é a Production GymFlow (${PRODUCTION_BACKEND_ORIGIN}).`
    );
    process.exit(1);
  }
}
console.log(`[build:mobile] backend de IA embutido: ${backendOrigin || "(nenhum — IA nativa indisponível)"}`);

const result = spawnSync("next", ["build"], {
  stdio: "inherit",
  shell: true, // resolve `next`/`next.cmd` via PATH no Windows e no Unix
  env: { ...process.env, BUILD_TARGET: "mobile" },
});

process.exit(result.status ?? 1);
