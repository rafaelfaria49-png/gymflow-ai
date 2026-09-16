/**
 * GymFlow AI — Gateway same-origin do Assistente Nutricional (NUT-007 / web)
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
 * Mobile Capacitor (bundle estático, sem servidor Next): esta rota NÃO existe
 * no export `out/` — o client adapter (`ai-assistant-client.ts`) usa então
 * somente um backend HTTPS GymFlow configurável por origem pública.
 */

import { NextResponse } from 'next/server';
import { handleAssistantGatewayRequest } from '@/lib/nutrition/ai-assistant-gateway';

// NUT-007 / mobile (Capacitor, `output: export`): esta rota POST-only NÃO é
// incluída no bundle estático `out/` — o export contempla apenas GET
// estáticos. O client adapter detecta o runtime nativo e usa exclusivamente
// um backend HTTPS GymFlow configurável (origem pública, sem segredo).
// Nenhum `export const dynamic` aqui: `force-dynamic` quebra o export
// estático e a rota já é dinâmica por usar `request` (POST com corpo).

export async function POST(request: Request): Promise<NextResponse> {
  let bodyText = '';
  try {
    bodyText = await request.text();
  } catch {
    return NextResponse.json(
      { status: 'failure', code: 'INVALID_REQUEST', message: 'Corpo da requisição ilegível.' },
      { status: 400 },
    );
  }

  try {
    const result = await handleAssistantGatewayRequest(bodyText, {}, request.signal);
    return NextResponse.json(result.body, { status: result.httpStatus });
  } catch {
    return NextResponse.json(
      {
        status: 'failure',
        code: 'PROVIDER_HTTP_ERROR',
        message: 'Falha interna do gateway do assistente. Nenhuma sugestão fake foi gerada.',
      },
      { status: 502 },
    );
  }
}
