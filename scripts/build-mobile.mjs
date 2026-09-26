// GOAL-12 — Build mobile (Capacitor).
// Força BUILD_TARGET=mobile de forma cross-platform (Windows/PowerShell não
// aceita `VAR=valor cmd` inline) e roda `next build`, que com o export ligado
// gera a pasta estática `out/` consumida pelo WebView do Capacitor.
//
// Uso: npm run build:mobile [-- --ai-backend production|none]
import { spawnSync } from "node:child_process";
import { resolveMobileBuild } from "./android/android-tools.mjs";

// GOAL-117/118: a origem pública do backend GymFlow vira constante no bundle.
// Modo explícito (`--ai-backend`, padrão "production"): "production" embute
// exatamente a Production GymFlow a partir da constante versionada
// PRODUCTION_BACKEND_ORIGIN (Assistente IA nativo ligado, via CORS do
// gateway); "none" não embute nada (IA nativa "unavailable" honesta). Nenhuma
// outra origem é aceita (sem exceção de QA).
//
// O `next build` também lê .env* (ignorados pelo git), que preenchem
// variáveis ausentes do ambiente. Por isso a origem efetiva é calculada com
// o próprio carregador do Next (mesmos arquivos e ordem) antes do build, sobre
// o MESMO ambiente que o `next build` recebe: ela só pode repetir a Production
// (ou estar vazia no modo "none"), e o valor decidido é fixado no ambiente do
// build — nenhum .env pode trocá-lo.
const { mode, effective, plan, buildEnv } = resolveMobileBuild(process.argv.slice(2));
if (plan.error) {
  console.error(`[build:mobile] NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL recusada (efetiva via ${effective.source}): ${plan.error}.`);
  process.exit(1);
}
console.log(
  `[build:mobile] backend de IA embutido (modo ${mode}): ${plan.origin ? `${plan.origin} (${plan.source})` : "(nenhum — IA nativa indisponível)"}`
);

const result = spawnSync("next", ["build"], {
  stdio: "inherit",
  shell: true, // resolve `next`/`next.cmd` via PATH no Windows e no Unix
  env: buildEnv,
});

process.exit(result.status ?? 1);
