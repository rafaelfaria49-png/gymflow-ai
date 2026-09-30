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
 * da origem. `Content-Length` declarado acima do teto → 413 sem ler o corpo;
 * sem ele, a leitura para ao passar do teto (stream cancelado) → 413.
 */

import { handleAssistantGatewayRequest, type AiGatewayDeps } from './ai-assistant-gateway';
import { AI_ASSISTANT_LIMITS, type AiAssistantResult } from './ai-assistant-types';
import { readTextWithinLimit } from './bounded-text';

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
 * Esquema externo da requisição: `x-forwarded-proto` (Vercel/Next atrás de
 * proxy) ou, na falta dele, o protocolo da própria URL da requisição.
 */
function requestScheme(headers: Headers, requestUrl: string): string | null {
  const forwardedProto = (headers.get('x-forwarded-proto') ?? '').split(',')[0].trim().toLowerCase();
  if (forwardedProto.length > 0) return `${forwardedProto}:`;
  try {
    return new URL(requestUrl).protocol;
  } catch {
    return null;
  }
}

/**
 * Same-origin = a página que chamou está no MESMO host e esquema que
 * receberam a requisição. `Host` não é forjável por página; o host da URL da
 * requisição não é usado (no `next start`/dev ele pode não refletir o Host).
 */
function isSameOrigin(origin: string, headers: Headers, requestUrl: string): boolean {
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
  return url.protocol === requestScheme(headers, requestUrl);
}

export function classifyRequestOrigin(headers: Headers, requestUrl: string): RequestOrigin {
  const origin = headers.get('origin');
  if (origin === null) return { kind: 'absent' };
  if (NATIVE_APP_ORIGINS.includes(origin)) return { kind: 'native-app', origin };
  if (isSameOrigin(origin, headers, requestUrl)) return { kind: 'same-origin' };
  return { kind: 'forbidden' };
}

/** `Content-Length` declarado acima do teto do contrato (sem ler o corpo). */
function declaresOversizedBody(headers: Headers): boolean {
  const raw = headers.get('content-length');
  if (raw === null || !/^\d+$/.test(raw.trim())) return false;
  return Number(raw.trim()) > AI_ASSISTANT_LIMITS.MAX_REQUEST_BYTES;
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
  const origin = classifyRequestOrigin(request.headers, request.url);
  if (origin.kind === 'forbidden') {
    return failureJson(
      403,
      { status: 'failure', code: 'INVALID_REQUEST', message: 'Origem não autorizada para o assistente IA.' },
      responseHeaders(origin),
    );
  }
  const headers = responseHeaders(origin);
  const tooLarge = () =>
    failureJson(
      413,
      {
        status: 'failure',
        code: 'REQUEST_TOO_LARGE',
        message: `Corpo excede o teto de ${AI_ASSISTANT_LIMITS.MAX_REQUEST_BYTES} bytes do contrato.`,
      },
      headers,
    );
  if (declaresOversizedBody(request.headers)) return tooLarge();

  // Sem Content-Length confiável, a leitura para no teto (stream cancelado).
  let bodyText = '';
  try {
    const read = await readTextWithinLimit(request, AI_ASSISTANT_LIMITS.MAX_REQUEST_BYTES);
    if (read.kind === 'too-large') return tooLarge();
    bodyText = read.text;
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
  const origin = classifyRequestOrigin(request.headers, request.url);
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
