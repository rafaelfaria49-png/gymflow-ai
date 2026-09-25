/**
 * GymFlow AI — HTTP do gateway do Assistente Nutricional + CORS cirúrgico (GOAL-118)
 *
 * MÓDULO EXCLUSIVAMENTE SERVER-SIDE (importa o gateway, que importa o
 * provider com a chave). Usado somente pela Route Handler
 * `src/app/api/nutrition/assistant/route.ts`.
 *
 * CORS apenas para os WebViews nativos do Capacitor (origem ecoada, nunca `*`):
 * - Android: `https://localhost` (`server.androidScheme = 'https'`);
 * - iOS: `capacitor://localhost` (esquema padrão do Capacitor iOS).
 *
 * Classificação da origem (header `Origin`):
 * - ausente (servidor/curl/smoke): contrato de sempre, sem CORS;
 * - same-origin (web GymFlow): contrato de sempre, sem CORS;
 * - app nativo (allowlist exata): mesmo contrato + CORS em TODA resposta
 *   (200/400/403/409/413/502/503/504);
 * - qualquer outra (LAN, túnel, outros hosts Vercel, `null`, esquema
 *   estranho): 403 fail-closed ANTES de ler o corpo — o provedor nunca é
 *   chamado e nenhum header CORS é enviado.
 *
 * Preflight (`OPTIONS`) só é aceito para origem nativa pedindo `POST` com, no
 * máximo, o header `Content-Type`. `Vary` sempre presente: a resposta depende
 * da origem.
 */

import { handleAssistantGatewayRequest, type AiGatewayDeps } from './ai-assistant-gateway';
import type { AiAssistantResult } from './ai-assistant-types';

/** Origens dos WebViews nativos (Capacitor 7). Comparação exata. */
export const NATIVE_APP_ORIGINS: readonly string[] = ['https://localhost', 'capacitor://localhost'];

export const CORS_ALLOWED_METHODS = 'POST, OPTIONS';
export const CORS_ALLOWED_HEADERS = 'Content-Type';
const PREFLIGHT_MAX_AGE_SECONDS = '600';
const ALLOW_HEADER = 'OPTIONS, POST';
const VARY_POST = 'Origin';
const VARY_PREFLIGHT = 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers';

export type RequestOrigin =
  | { kind: 'absent' }
  | { kind: 'same-origin' }
  | { kind: 'native-app'; origin: string }
  | { kind: 'forbidden' };

/**
 * Same-origin = a página que chamou está no MESMO host que recebeu a
 * requisição. `Host` não é forjável por página; `x-forwarded-proto` (quando
 * presente, ex.: Vercel/Next) também precisa bater o esquema.
 */
function isSameOrigin(origin: string, headers: Headers): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.origin !== origin) return false; // Origin serializado nunca tem path/credenciais
  const host = (headers.get('host') ?? '').trim().toLowerCase();
  if (host.length === 0 || url.host !== host) return false;
  const forwardedProto = (headers.get('x-forwarded-proto') ?? '').split(',')[0].trim().toLowerCase();
  return forwardedProto.length === 0 || url.protocol === `${forwardedProto}:`;
}

export function classifyRequestOrigin(headers: Headers): RequestOrigin {
  const origin = headers.get('origin');
  if (origin === null) return { kind: 'absent' };
  if (NATIVE_APP_ORIGINS.includes(origin)) return { kind: 'native-app', origin };
  if (isSameOrigin(origin, headers)) return { kind: 'same-origin' };
  return { kind: 'forbidden' };
}

function responseHeaders(origin: RequestOrigin): Record<string, string> {
  if (origin.kind === 'native-app') {
    return { 'Access-Control-Allow-Origin': origin.origin, Vary: VARY_POST };
  }
  return { Vary: VARY_POST };
}

function failureJson(
  status: number,
  body: AiAssistantResult & { status: 'failure' },
  headers: Record<string, string>,
): Response {
  return Response.json(body, { status, headers });
}

/** POST /api/nutrition/assistant — gateway com CORS nativo e fail-closed. */
export async function handleAssistantPost(request: Request, deps: AiGatewayDeps = {}): Promise<Response> {
  const origin = classifyRequestOrigin(request.headers);
  if (origin.kind === 'forbidden') {
    return failureJson(
      403,
      { status: 'failure', code: 'INVALID_REQUEST', message: 'Origem não autorizada para o assistente IA.' },
      responseHeaders(origin),
    );
  }
  const headers = responseHeaders(origin);

  let bodyText = '';
  try {
    bodyText = await request.text();
  } catch {
    return failureJson(400, { status: 'failure', code: 'INVALID_REQUEST', message: 'Corpo da requisição ilegível.' }, headers);
  }

  try {
    const result = await handleAssistantGatewayRequest(bodyText, deps, request.signal);
    return Response.json(result.body, { status: result.httpStatus, headers });
  } catch {
    return failureJson(
      502,
      {
        status: 'failure',
        code: 'PROVIDER_HTTP_ERROR',
        message: 'Falha interna do gateway do assistente. Nenhuma sugestão fake foi gerada.',
      },
      headers,
    );
  }
}

function isAllowedPreflight(headers: Headers): boolean {
  if (headers.get('access-control-request-method') !== 'POST') return false;
  const requested = (headers.get('access-control-request-headers') ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
  return requested.every((name) => name === 'content-type');
}

/** OPTIONS /api/nutrition/assistant — preflight somente para o app nativo. */
export function handleAssistantOptions(request: Request): Response {
  const origin = classifyRequestOrigin(request.headers);
  if (origin.kind === 'absent' || origin.kind === 'same-origin') {
    return new Response(null, { status: 204, headers: { Allow: ALLOW_HEADER, Vary: VARY_PREFLIGHT } });
  }
  if (origin.kind === 'native-app' && isAllowedPreflight(request.headers)) {
    return new Response(null, {
      status: 204,
      headers: {
        Allow: ALLOW_HEADER,
        'Access-Control-Allow-Origin': origin.origin,
        'Access-Control-Allow-Methods': CORS_ALLOWED_METHODS,
        'Access-Control-Allow-Headers': CORS_ALLOWED_HEADERS,
        'Access-Control-Max-Age': PREFLIGHT_MAX_AGE_SECONDS,
        Vary: VARY_PREFLIGHT,
      },
    });
  }
  return new Response(null, { status: 403, headers: { Vary: VARY_PREFLIGHT } });
}
