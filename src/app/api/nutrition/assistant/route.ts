/**
 * GymFlow AI — Gateway do Assistente Nutricional (NUT-007 / web + app nativo)
 *
 * Rota server-side estrita: entrada e saída tipadas, teto de payload,
 * timeout e cancelamento controlados. A chave do provedor (`GYMFLOW_AI_API_KEY`)
 * vive somente no ambiente do servidor — nunca no bundle.
 *
 * Contrato:
 * - POST JSON ≤ 16KB com um dos 5 casos canônicos (`AiAssistantGatewayRequest`);
 * - 200 { status: 'ok', proposal } — proposta grounded com números locais;
 * - 200 { status: 'failure', code: 'EMPTY_PROPOSAL' } — honesto, sem números;
 * - 400/403/409/413/502/503/504 { status: 'failure', code, message }.
 *
 * Web: same-origin, sem CORS. App nativo (GOAL-118): o bundle estático
 * `out/` não tem esta rota; o client adapter (`ai-assistant-client.ts`) chama
 * a Production GymFlow e o CORS cirúrgico (somente `https://localhost` e
 * `capacitor://localhost`) vive em `ai-assistant-route.ts`. Origem não
 * autorizada → 403 fail-closed, sem chamar o provedor.
 */

import { handleAssistantOptions, handleAssistantPost } from '@/lib/nutrition/ai-assistant-route';

// NUT-007 / mobile (Capacitor, `output: export`): esta rota POST/OPTIONS NÃO
// é incluída no bundle estático `out/` — o export contempla apenas GET
// estáticos. Nenhum `export const dynamic` aqui: `force-dynamic` quebra o
// export estático e a rota já é dinâmica por usar `request`.

export async function POST(request: Request): Promise<Response> {
  return handleAssistantPost(request);
}

export function OPTIONS(request: Request): Response {
  return handleAssistantOptions(request);
}
