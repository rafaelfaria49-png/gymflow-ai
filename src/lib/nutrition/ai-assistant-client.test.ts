/**
 * GymFlow AI — Testes do client adapter do assistente (NUT-007)
 *
 * Prova: WEB/MOBILE sem segredo no bundle, AI_UNAVAILABLE honesto,
 * timeout/cancelamento, HTTP errors, resposta não JSON e payload fora do
 * contrato — tudo sem nenhuma sugestão fake.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestAssistantProposal, resolveAssistantEndpoint } from './ai-assistant-client';

const REQUEST = {
  useCase: 'complete_protein',
  context: {
    remaining: { calories: 800, protein: 60, carbs: 90, fat: 25 },
    targets: { calories: 2500, protein: 160, carbs: 300, fat: 70 },
  },
} as const;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

afterEach(() => {
  const scope = globalThis as Record<string, unknown>;
  delete scope['Capacitor'];
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('NUT-007 client: roteamento web/mobile sem segredo', () => {
  it('web usa gateway same-origin', () => {
    const endpoint = resolveAssistantEndpoint();
    expect(endpoint).toEqual({ kind: 'same-origin', url: '/api/nutrition/assistant' });
  });

  it('mobile nativo SEM origem pública → unavailable honesto (sem chave no bundle)', () => {
    (globalThis as Record<string, unknown>)['Capacitor'] = { isNativePlatform: () => true };
    const endpoint = resolveAssistantEndpoint();
    expect(endpoint.kind).toBe('unavailable');
  });

  it('mobile nativo COM origem pública usa SOMENTE a origem (nenhum segredo)', () => {
    (globalThis as Record<string, unknown>)['Capacitor'] = { isNativePlatform: () => true };
    vi.stubEnv('NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL', 'https://api.gymflow.example.com');
    const endpoint = resolveAssistantEndpoint();
    expect(endpoint).toEqual({ kind: 'remote', url: 'https://api.gymflow.example.com/api/nutrition/assistant' });
    // A URL resolvida nunca carrega segredo.
    expect(JSON.stringify(endpoint)).not.toMatch(/key|token|secret|bearer/i);
  });
});

describe('NUT-007 client: transporte honesto', () => {
  it('sucesso repassa a proposta grounded do gateway', async () => {
    const proposal = { useCase: 'complete_protein', items: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0 } };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'ok', proposal }));
    const result = await requestAssistantProposal({ ...REQUEST }, {}, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ status: 'ok', proposal });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, { method: string }];
    expect(url).toBe('/api/nutrition/assistant');
    expect(init.method).toBe('POST');
  });

  it('falha tipada do gateway atravessa (ex.: 503 AI_UNAVAILABLE)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(503, { status: 'failure', code: 'PROVIDER_UNAVAILABLE', message: 'off' }));
    const result = await requestAssistantProposal({ ...REQUEST }, {}, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ status: 'failure', code: 'PROVIDER_UNAVAILABLE', message: 'off' });
  });

  it('resposta não JSON → INVALID_RESPONSE (nunca fake)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '<html>ops' } as unknown as Response);
    const result = await requestAssistantProposal({ ...REQUEST }, {}, fetchImpl as unknown as typeof fetch);
    expect(result.status).toBe('failure');
    if (result.status !== 'failure') throw new Error('unreachable');
    expect(result.code).toBe('INVALID_RESPONSE');
  });

  it('payload fora do contrato → INVALID_RESPONSE', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { hello: 'world' }));
    const result = await requestAssistantProposal({ ...REQUEST }, {}, fetchImpl as unknown as typeof fetch);
    if (result.status !== 'failure') throw new Error('unreachable');
    expect(result.code).toBe('INVALID_RESPONSE');
  });

  it('rede fora → PROVIDER_UNAVAILABLE honesto', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const result = await requestAssistantProposal({ ...REQUEST }, {}, fetchImpl as unknown as typeof fetch);
    if (result.status !== 'failure') throw new Error('unreachable');
    expect(result.code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('cancelamento/timeout → PROVIDER_TIMEOUT', async () => {
    const aborting = vi.fn().mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const result = await requestAssistantProposal(
      { ...REQUEST },
      { timeoutMs: 30 },
      aborting as unknown as typeof fetch,
    );
    if (result.status !== 'failure') throw new Error('unreachable');
    expect(result.code).toBe('PROVIDER_TIMEOUT');
  });

  it('mobile sem backend retorna UNAVAILABLE sem tocar na rede', async () => {
    (globalThis as Record<string, unknown>)['Capacitor'] = { isNativePlatform: () => true };
    const fetchImpl = vi.fn();
    const result = await requestAssistantProposal({ ...REQUEST }, {}, fetchImpl as unknown as typeof fetch);
    if (result.status !== 'failure') throw new Error('unreachable');
    expect(result.code).toBe('PROVIDER_UNAVAILABLE');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
