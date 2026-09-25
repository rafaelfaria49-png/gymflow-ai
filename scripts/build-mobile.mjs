// GOAL-12 — Build mobile (Capacitor).
// Força BUILD_TARGET=mobile de forma cross-platform (Windows/PowerShell não
// aceita `VAR=valor cmd` inline) e roda `next build`, que com o export ligado
// gera a pasta estática `out/` consumida pelo WebView do Capacitor.
//
// Uso: npm run build:mobile [-- --ai-backend production|none]
import { spawnSync } from "node:child_process";
import { effectiveBackendOrigin } from "./android/android-tools.mjs";
import { parseMobileAiBackendMode, planMobileBackend } from "./android/play-release-lib.mjs";

// GOAL-117/118: a origem pública do backend GymFlow vira constante no bundle.
// Modo explícito (`--ai-backend`, padrão "production"): "production" embute
// a Production GymFlow a partir da constante versionada
// PRODUCTION_BACKEND_ORIGIN (Assistente IA nativo ligado, via CORS do
// gateway); "none" não embute nada (IA nativa "unavailable" honesta). Nunca
// localhost/LAN/túnel/provedor de IA direto. Outra origem HTTPS só com
// GYMFLOW_ALLOW_NON_PRODUCTION_BACKEND=1 (QA local, nunca release).
//
// O `next build` também lê .env* (ignorados pelo git), que preenchem
// variáveis ausentes do ambiente. Por isso a origem efetiva é calculada com
// o próprio carregador do Next (mesmos arquivos e ordem) antes do build: ela
// só pode repetir a Production (ou nada); o valor decidido aqui é fixado no
// ambiente do `next build` e nenhum .env pode trocá-lo.
const mode = parseMobileAiBackendMode(process.argv.slice(2));
const { origin: effectiveOrigin, source: effectiveSource } = effectiveBackendOrigin();
const plan = planMobileBackend({
  mode,
  effectiveOrigin,
  allowNonProduction: process.env.GYMFLOW_ALLOW_NON_PRODUCTION_BACKEND === "1",
});
if (plan.error) {
  console.error(`[build:mobile] NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL recusada (efetiva via ${effectiveSource}): ${plan.error}.`);
  process.exit(1);
}
console.log(
  `[build:mobile] backend de IA embutido (modo ${mode}): ${plan.origin ? `${plan.origin} (${plan.source})` : "(nenhum — IA nativa indisponível)"}`
);

// Valor decidido acima, fixado: nenhum .env pode trocá-lo no `next build`.
// Sem origem (modo none), a variável sai do ambiente do filho (nem vazia):
// o bundle mantém a leitura em runtime que a auditoria reconhece.
const buildEnv = { ...process.env, BUILD_TARGET: "mobile" };
delete buildEnv.NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL;
if (plan.origin) buildEnv.NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL = plan.origin;

const result = spawnSync("next", ["build"], {
  stdio: "inherit",
  shell: true, // resolve `next`/`next.cmd` via PATH no Windows e no Unix
  env: buildEnv,
});

process.exit(result.status ?? 1);
