/**
 * GymFlow AI — Testes do gateway server-side do assistente (NUT-007)
 *
 * Provider real NUNCA é chamado: `fetchImpl` e `env` injetados.
 * Prova: PROVIDER_UNAVAILABLE honesto, gates sem chamar modelo, grounding
 * pós-modelo, timeout, HTTP errors, não-JSON, teto de payload e saldo.
 */

import { describe, expect, it, vi } from 'vitest';
import { handleAssistantGatewayRequest } from './ai-assistant-gateway';

const CONFIGURED_ENV = {
  GYMFLOW_AI_ENABLED: 'true',
  GYMFLOW_AI_BASE_URL: 'https://ai.example.com/v1',
  GYMFLOW_AI_API_KEY: 'test-key-sem-valor-real',
  GYMFLOW_AI_MODEL: 'fake-model-test',
};

const UNCONFIGURED_ENV = {
  GYMFLOW_AI_ENABLED: 'false',
};

function validContext() {
  return {
    remaining: { calories: 800, protein: 60, carbs: 90, fat: 25 },
    targets: { calories: 2500, protein: 160, carbs: 300, fat: 70 },
  };
}

function openAiEnvelope(choiceContent: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify({ choices: [{ message: { content: choiceContent } }] }),
  } as unknown as Response;
}

function modelItemsJson(items: unknown[]) {
  return JSON.stringify({ items });
}

describe('NUT-007 gateway: provider ausente e tetos', () => {
  it('AI_RUNTIME_PROVIDER = UNCONFIGURED → 503 honesto, sem chamar rede', async () => {
    const fetchImpl = vi.fn();
    const result = await handleAssistantGatewayRequest(
      JSON.stringify({ useCase: 'complete_protein', context: validContext(), availability: { state: 'AUTOMATED' } }),
      { env: UNCONFIGURED_ENV, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.httpStatus).toBe(503);
    expect(result.body.status).toBe('failure');
    if (result.body.status !== 'failure') throw new Error('unreachable');
    expect(result.body.code).toBe('PROVIDER_UNAVAILABLE');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('corpo acima do teto → 413 sem chamar o modelo', async () => {
    const fetchImpl = vi.fn();
    const result = await handleAssistantGatewayRequest('x'.repeat(17 * 1024), { env: CONFIGURED_ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.httpStatus).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('JSON inválido → 400; useCase inválido → 400', async () => {
    const fetchImpl = vi.fn();
    const bad = await handleAssistantGatewayRequest('{oops', { env: CONFIGURED_ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(bad.httpStatus).toBe(400);
    const wrong = await handleAssistantGatewayRequest(JSON.stringify({ useCase: 'hack' }), { env: CONFIGURED_ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(wrong.httpStatus).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('NUT-007 gateway: gates bloqueiam ANTES do modelo', () => {
  it('MANUAL_ONLY → 409 sem chamar o provedor (sem números fabricados)', async () => {
    const fetchImpl = vi.fn();
    const result = await handleAssistantGatewayRequest(
      JSON.stringify({ useCase: 'snacks_within_balance', context: validContext(), availability: { state: 'MANUAL_ONLY', reason: 'PROFILE_ABSENT' } }),
      { env: CONFIGURED_ENV, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.httpStatus).toBe(409);
    if (result.body.status !== 'failure') throw new Error('unreachable');
    expect(result.body.code).toBe('MANUAL_ONLY');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('gate clínico bloqueado → 403 sem chamar o provedor', async () => {
    const fetchImpl = vi.fn();
    const result = await handleAssistantGatewayRequest(
      JSON.stringify({ useCase: 'complete_protein', context: validContext(), availability: { state: 'CLINICAL_GATE_BLOCKED', gateStatus: 'BLOCK_AUTOMATIC_TARGET' } }),
      { env: CONFIGURED_ENV, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.httpStatus).toBe(403);
    if (result.body.status !== 'failure') throw new Error('unreachable');
    expect(result.body.code).toBe('CLINICAL_GATE_BLOCKED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('NUT-007 gateway: sucesso ponta a ponta com provider fake', () => {
  const requestFor = (useCase: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ useCase, context: validContext(), availability: { state: 'AUTOMATED' }, ...extra });

  it('CASO 1: proteína com números recalculados (macros fake do modelo descartados)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      openAiEnvelope(modelItemsJson([{ foodReferenceId: 'br-peito-frango-grelhado', grams: 150, calories: 1, protein: 1 }])),
    );
    const result = await handleAssistantGatewayRequest(requestFor('complete_protein'), {
      env: CONFIGURED_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('ok');
    if (result.body.status !== 'ok') throw new Error('unreachable');
    const proposal = result.body.proposal;
    expect(proposal.useCase).toBe('complete_protein');
    if (proposal.useCase !== 'complete_protein') throw new Error('unreachable');
    expect(proposal.items).toHaveLength(1);
    // 150g de frango = 238.5 kcal (159/100*150) — recalculado, não "1".
    expect(proposal.items[0].computed.calories).toBeCloseTo(238.5, 1);
    expect(proposal.items[0].computed.protein).toBeCloseTo(48, 1);
    // Chave nunca atravessa para o client na resposta.
    expect(JSON.stringify(result.body)).not.toContain('test-key-sem-valor-real');
  });

  it('CASO 2: substituição com delta local', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      openAiEnvelope(modelItemsJson([{ foodReferenceId: 'br-peito-frango-grelhado', grams: 100 }])),
    );
    const result = await handleAssistantGatewayRequest(
      requestFor('substitute_food', { foodReferenceId: 'br-arroz-branco-cozido', grams: 100 }),
      { env: CONFIGURED_ENV, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.httpStatus).toBe(200);
    if (result.body.status !== 'ok') throw new Error(`falhou: ${JSON.stringify(result.body)}`);
    expect(result.body.proposal.useCase).toBe('substitute_food');
  });

  it('CASO 4: 3 lanches; opções acima do saldo descartadas', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      openAiEnvelope(
        modelItemsJson([
          { foodReferenceId: 'br-peito-frango-grelhado', grams: 100 },
          // 500g de granola ≈ 2300 kcal: estoura o saldo de 800 e é descartada.
          { foodReferenceId: 'br-granola', grams: 500 },
        ]),
      ),
    );
    const result = await handleAssistantGatewayRequest(requestFor('snacks_within_balance'), {
      env: CONFIGURED_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.httpStatus).toBe(200);
    if (result.body.status !== 'ok') throw new Error(`falhou: ${JSON.stringify(result.body)}`);
    const proposal = result.body.proposal;
    if (proposal.useCase !== 'snacks_within_balance') throw new Error('unreachable');
    expect(proposal.options).toHaveLength(1);
    expect(proposal.options[0].totals.calories).toBeLessThanOrEqual(800 + 1e-9);
  });

  it('CASO 5: explicação ecoa facts do client intocados (números do texto ignorados)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      openAiEnvelope(JSON.stringify({ items: [], explanationText: 'Sua meta é 99999 kcal, confia.' })),
    );
    const facts = {
      targetCalories: 2500,
      targetProteinGrams: 160,
      targetCarbsGrams: 300,
      targetFatGrams: 70,
      bmrKcal: 1700,
      tdeeKcal: 2500,
      energyBalanceKcal: 0,
      goal: 'maintenance',
    };
    const result = await handleAssistantGatewayRequest(JSON.stringify({ useCase: 'explain_target_change', facts }), {
      env: CONFIGURED_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.httpStatus).toBe(200);
    if (result.body.status !== 'ok') throw new Error(`falhou: ${JSON.stringify(result.body)}`);
    const proposal = result.body.proposal;
    if (proposal.useCase !== 'explain_target_change') throw new Error('unreachable');
    expect(proposal.facts).toEqual(facts);
  });
});

describe('NUT-007 gateway: falhas de transporte do provedor', () => {
  const request = () =>
    JSON.stringify({ useCase: 'complete_protein', context: validContext(), availability: { state: 'AUTOMATED' } });

  it('HTTP 500 do provedor → 502 honesto', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' } as unknown as Response);
    const result = await handleAssistantGatewayRequest(request(), { env: CONFIGURED_ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.httpStatus).toBe(502);
    if (result.body.status !== 'failure') throw new Error('unreachable');
    expect(result.body.code).toBe('PROVIDER_HTTP_ERROR');
  });

  it('envelope não JSON → INVALID_RESPONSE (502)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'não é json' } as unknown as Response);
    const result = await handleAssistantGatewayRequest(request(), { env: CONFIGURED_ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.httpStatus).toBe(502);
    if (result.body.status !== 'failure') throw new Error('unreachable');
    expect(result.body.code).toBe('INVALID_RESPONSE');
  });

  it('resposta do modelo não JSON → INVALID_RESPONSE (502)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(openAiEnvelope('sou um texto livre, não json'));
    const result = await handleAssistantGatewayRequest(request(), { env: CONFIGURED_ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.httpStatus).toBe(502);
    if (result.body.status !== 'failure') throw new Error('unreachable');
    expect(result.body.code).toBe('INVALID_RESPONSE');
  });

  it('timeout do provedor → 504 (sem esperar 12s: timeoutMs injetado)', async () => {
    const hanging = vi.fn().mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const result = await handleAssistantGatewayRequest(request(), {
      env: CONFIGURED_ENV,
      fetchImpl: hanging as unknown as typeof fetch,
      timeoutMs: 50,
    });
    expect(result.httpStatus).toBe(504);
    if (result.body.status !== 'failure') throw new Error('unreachable');
    expect(result.body.code).toBe('PROVIDER_TIMEOUT');
  });

  it('todos os IDs desconhecidos → EMPTY honesto (200 + EMPTY_PROPOSAL)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      openAiEnvelope(modelItemsJson([{ foodReferenceId: 'xx-fantasma-999', grams: 100 }])),
    );
    const result = await handleAssistantGatewayRequest(request(), { env: CONFIGURED_ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.httpStatus).toBe(200);
    if (result.body.status !== 'failure') throw new Error('unreachable');
    expect(result.body.code).toBe('EMPTY_PROPOSAL');
  });
});

describe('GOAL-118 gateway: teto em bytes UTF-8 e provedor só HTTPS', () => {
  const request = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({ useCase: 'complete_protein', context: validContext(), availability: { state: 'AUTOMATED' }, ...extra });

  it('corpo abaixo do teto em caracteres mas acima em bytes UTF-8 → 413 sem chamar o provedor', async () => {
    const fetchImpl = vi.fn();
    const body = request({ userText: 'ç'.repeat(9000) });
    expect(body.length).toBeLessThan(16 * 1024);
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(16 * 1024);
    const result = await handleAssistantGatewayRequest(body, { env: CONFIGURED_ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.httpStatus).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['http://ai.example.com/v1', 'ai.example.com/v1', 'ftp://ai.example.com/v1'])(
    'GYMFLOW_AI_BASE_URL não-HTTPS (%s) → 503 honesto, chave e prompt nunca enviados',
    async (baseUrl) => {
      const fetchImpl = vi.fn();
      const result = await handleAssistantGatewayRequest(request(), {
        env: { ...CONFIGURED_ENV, GYMFLOW_AI_BASE_URL: baseUrl },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(result.httpStatus).toBe(503);
      if (result.body.status !== 'failure') throw new Error('unreachable');
      expect(result.body.code).toBe('PROVIDER_UNAVAILABLE');
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );
});
