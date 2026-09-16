/**
 * GymFlow AI — Client adapter do Assistente Nutricional (NUT-007)
 *
 * CLIENT-SAFE: nenhum segredo é importado ou referenciado aqui. A chave do
 * provedor vive somente no servidor (gateway same-origin) ou no backend
 * HTTPS configurado para o mobile.
 *
 * Roteamento:
 * - Web: gateway same-origin `/api/nutrition/assistant` (chave server-only);
 * - Mobile Capacitor (bundle estático, sem servidor Next): somente um HTTPS
 *   backend GymFlow configurável pela origem pública
 *   `NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL` (origem pública PODE estar no
 *   bundle; a chave do provedor NUNCA).
 *
 * Sem backend/provedor configurado: resultado honesto `PROVIDER_UNAVAILABLE`
 * (AI_UNAVAILABLE) — nunca fallback fake rotulado como IA.
 */

'use client';

import { AI_ASSISTANT_LIMITS, type AiAssistantResult } from './ai-assistant-types';
import type { AiAssistantGatewayRequest } from './ai-assistant-types';

export type AiBackendResolution =
  | { kind: 'same-origin'; url: string }
  | { kind: 'remote'; url: string }
  | { kind: 'unavailable'; reason: string };

function readPublicBackendOrigin(): string | null {
  const raw = (process.env['NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL'] ?? '').trim();
  if (raw.length === 0) return null;
  return raw.replace(/\/+$/, '');
}

function isNativeCapacitor(): boolean {
  try {
    const globalScope = globalThis as Record<string, unknown>;
    const capacitor = globalScope['Capacitor'] as Record<string, unknown> | undefined;
    if (capacitor && typeof capacitor['isNativePlatform'] === 'function') {
      return (capacitor['isNativePlatform'] as () => boolean)() === true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Resolve o endpoint do assistente. Nunca contém segredo: apenas origem
 * pública (mobile) ou caminho same-origin (web).
 */
export function resolveAssistantEndpoint(): AiBackendResolution {
  if (isNativeCapacitor()) {
    const origin = readPublicBackendOrigin();
    if (!origin) {
      return {
        kind: 'unavailable',
        reason: 'Backend de IA não configurado no app (origem pública ausente).',
      };
    }
    return { kind: 'remote', url: `${origin}/api/nutrition/assistant` };
  }
  return { kind: 'same-origin', url: '/api/nutrition/assistant' };
}

export interface AiClientRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

function isFailureResult(value: unknown): value is AiAssistantResult {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record['status'] === 'failure' && typeof record['code'] === 'string') return true;
  if (record['status'] === 'ok' && typeof record['proposal'] === 'object' && record['proposal'] !== null) {
    return true;
  }
  return false;
}

/**
 * Envia a requisição tipada ao gateway com timeout e cancelamento.
 * Mapeia transporte (rede/HTTP/não-JSON/timeout) para falhas honestas:
 * nenhuma sugestão fake é produzida em nenhum caminho de erro.
 */
export async function requestAssistantProposal(
  request: AiAssistantGatewayRequest,
  options: AiClientRequestOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<AiAssistantResult> {
  const endpoint = resolveAssistantEndpoint();
  if (endpoint.kind === 'unavailable') {
    return { status: 'failure', code: 'PROVIDER_UNAVAILABLE', message: endpoint.reason };
  }

  const timeoutMs = options.timeoutMs ?? AI_ASSISTANT_LIMITS.PROVIDER_TIMEOUT_MS + 3000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = (): void => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const response = await fetchImpl(endpoint.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text.length === 0 ? 'null' : text);
    } catch {
      return {
        status: 'failure',
        code: 'INVALID_RESPONSE',
        message: 'Backend de IA retornou resposta não JSON.',
      };
    }
    if (!isFailureResult(parsed)) {
      return {
        status: 'failure',
        code: 'INVALID_RESPONSE',
        message: 'Backend de IA retornou payload fora do contrato.',
      };
    }
    if (!response.ok && parsed.status === 'ok') {
      return {
        status: 'failure',
        code: 'INVALID_RESPONSE',
        message: 'Backend de IA retornou proposta com HTTP de erro.',
      };
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { status: 'failure', code: 'PROVIDER_TIMEOUT', message: 'Assistente IA excedeu o tempo de resposta.' };
    }
    return {
      status: 'failure',
      code: 'PROVIDER_UNAVAILABLE',
      message: 'Não foi possível alcançar o backend de IA (rede indisponível?).',
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}
