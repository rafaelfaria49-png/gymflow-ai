/**
 * GymFlow AI — Adapter server-side do provedor de IA (NUT-007)
 *
 * MÓDULO EXCLUSIVAMENTE SERVER-SIDE: lê `GYMFLOW_AI_API_KEY` do ambiente do
 * servidor e nunca é importado por código client (`'use client'`). Nenhum
 * segredo `NEXT_PUBLIC_*` existe neste fluxo — a chave do provedor jamais
 * entra no bundle web ou no bundle estático do Capacitor.
 *
 * Adapter OpenAI-compatible via `fetch`, sem dependência obrigatória de SDK:
 * `POST {baseUrl}/chat/completions` com `{ model, messages, max_tokens,
 * temperature: 0.2, response_format: { type: 'json_object' } }`.
 *
 * Configuração (todas server-only):
 * - GYMFLOW_AI_ENABLED=true para ligar;
 * - GYMFLOW_AI_BASE_URL (ex.: https://api.openai.com/v1);
 * - GYMFLOW_AI_API_KEY (segredo — nunca commitar, nunca expor);
 * - GYMFLOW_AI_MODEL (ex.: gpt-4o-mini).
 *
 * Sem configuração: `isProviderConfigured()` retorna false e o gateway
 * responde AI_UNAVAILABLE honesto — sem fallback fake rotulado como IA.
 */

import { AI_ASSISTANT_LIMITS, AiAssistantError } from './ai-assistant-types';

export interface AiProviderConfig {
  enabled: boolean;
  baseUrl: string | null;
  apiKey: string | null;
  model: string | null;
}

export interface AiChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface AiProviderCallInput {
  system: string;
  user: string;
  /** Tetativa máxima de tokens de saída (teto contratual, não preferência). */
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Lê a configuração do provedor do ambiente do SERVIDOR.
 * `env` é injetável para testes (padrão: `process.env`). Nunca loga a chave.
 */
export function readProviderConfig(env: Record<string, string | undefined> = process.env): AiProviderConfig {
  const enabled = (env['GYMFLOW_AI_ENABLED'] ?? '').trim().toLowerCase() === 'true';
  const rawBaseUrl = (env['GYMFLOW_AI_BASE_URL'] ?? '').trim();
  const rawApiKey = (env['GYMFLOW_AI_API_KEY'] ?? '').trim();
  const rawModel = (env['GYMFLOW_AI_MODEL'] ?? '').trim();
  return {
    enabled,
    baseUrl: rawBaseUrl.length > 0 ? rawBaseUrl.replace(/\/+$/, '') : null,
    apiKey: rawApiKey.length > 0 ? rawApiKey : null,
    model: rawModel.length > 0 ? rawModel : null,
  };
}

/** Provedor utilizável somente com as 4 peças presentes (flag + url + key + model). */
export function isProviderConfigured(config: AiProviderConfig): boolean {
  return (
    config.enabled === true
    && config.baseUrl !== null
    && config.apiKey !== null
    && config.model !== null
  );
}

/**
 * Nome público do provedor para telemetria honesta (sem expor segredo):
 * hostname da base URL + modelo. Ex.: "api.openai.com/gpt-4o-mini".
 */
export function describeProvider(config: AiProviderConfig): string {
  if (!isProviderConfigured(config)) return 'UNCONFIGURED';
  try {
    const host = new URL(config.baseUrl as string).hostname;
    return `${host}/${config.model as string}`;
  } catch {
    return `custom/${config.model as string}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extrai o texto do primeiro choice de forma defensiva (sem throw genérico). */
export function extractFirstChoiceText(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new AiAssistantError('INVALID_MODEL_RESPONSE', 'Resposta do provedor sem corpo JSON válido.');
  }
  const choices = payload['choices'];
  if (!Array.isArray(choices) || choices.length === 0 || !isRecord(choices[0])) {
    throw new AiAssistantError('INVALID_MODEL_RESPONSE', 'Resposta do provedor sem choices.');
  }
  const message = (choices[0] as Record<string, unknown>)['message'];
  if (!isRecord(message) || typeof message['content'] !== 'string') {
    throw new AiAssistantError('INVALID_MODEL_RESPONSE', 'Resposta do provedor sem conteúdo textual.');
  }
  return message['content'] as string;
}

/**
 * Chama o chat completion OpenAI-compatible com timeout e cancelamento
 * controlados. `fetchImpl` injetável para testes (padrão: fetch global).
 *
 * - Timeout: AbortController próprio quando o chamador não fornece signal;
 * - Teto de bytes da resposta antes do parse (contrato);
 * - HTTP != 2xx: PROVIDER_HTTP_ERROR (status preservado na mensagem, corpo
 *   truncado — nunca vaza para a UI além do código honesto);
 * - Abort/timeout: PROVIDER_TIMEOUT.
 */
export async function callProviderChatCompletion(
  config: AiProviderConfig,
  input: AiProviderCallInput,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!isProviderConfigured(config)) {
    throw new AiAssistantError(
      'PROVIDER_UNAVAILABLE',
      'Provedor de IA não configurado (GYMFLOW_AI_* ausente). Nenhuma sugestão fake foi gerada.',
    );
  }
  const timeoutMs = input.timeoutMs ?? AI_ASSISTANT_LIMITS.PROVIDER_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = (): void => controller.abort();
  input.signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const messages: AiChatMessage[] = [
      { role: 'system', content: input.system },
      { role: 'user', content: input.user },
    ];
    const response = await fetchImpl(`${config.baseUrl as string}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey as string}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: input.maxTokens ?? 1200,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AiAssistantError(
        'PROVIDER_HTTP_ERROR',
        `Provedor de IA respondeu HTTP ${response.status}. Nenhuma sugestão fake foi gerada.`,
      );
    }
    const text = await response.text();
    if (text.length > AI_ASSISTANT_LIMITS.MAX_PROVIDER_RESPONSE_BYTES) {
      throw new AiAssistantError(
        'INVALID_MODEL_RESPONSE',
        'Resposta do provedor excede o teto de bytes do contrato.',
      );
    }
    return text;
  } catch (error) {
    if (error instanceof AiAssistantError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      if (input.signal?.aborted) {
        throw new AiAssistantError('PROVIDER_TIMEOUT', 'Chamada à IA cancelada pelo chamador.');
      }
      throw new AiAssistantError(
        'PROVIDER_TIMEOUT',
        `Provedor de IA excedeu o timeout de ${timeoutMs}ms. Nenhuma sugestão fake foi gerada.`,
      );
    }
    throw new AiAssistantError(
      'PROVIDER_HTTP_ERROR',
      'Falha de rede ao alcançar o provedor de IA. Nenhuma sugestão fake foi gerada.',
    );
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onExternalAbort);
  }
}
