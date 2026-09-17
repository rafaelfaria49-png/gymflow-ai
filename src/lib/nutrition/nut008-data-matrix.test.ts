/**
 * GymFlow AI — NUT-008 matriz de dados (cenários obrigatórios).
 */

import { describe, expect, it, vi } from 'vitest';
import { validateGatewayRequest } from './ai-assistant';
import { requestAssistantProposal } from './ai-assistant-client';
import { handleAssistantGatewayRequest } from './ai-assistant-gateway';
import { calculateDailyTargets } from './engine';
import { FOOD_DATABASE } from './food-database';
import { addFoodEntry, addMeal, calculateActuals } from './ledger';
import { reconcileNutritionDayForNow } from './lifecycle';
import { evaluateNutritionGate } from './profile-gates';
import { createInMemoryNutritionDayRepository } from './rollover';
import { resolveNutritionTargets } from './target-resolution';
import { getCivilDateString } from '../nutrition-civil-date';
import {
  NUT008_NOW_ISO,
  createNut008ConsumedDay,
  createNut008ManualOnlyDay,
  createNut008Profile,
  nut008SharedTargets,
} from './nut008-fixtures';

const AUTOMATED_BODY = JSON.stringify({
  useCase: 'complete_protein',
  context: {
    remaining: { calories: 800, protein: 60, carbs: 90, fat: 25 },
    targets: { calories: 2500, protein: 160, carbs: 300, fat: 70 },
  },
  availability: { state: 'AUTOMATED' },
});

describe('NUT-008 matriz de dados', () => {
  it('AUTOMATED: perfil completo produz targets e dia gravável', async () => {
    const profile = createNut008Profile();
    const gate = evaluateNutritionGate(profile);
    expect(gate.status).toBe('NORMAL_FLOW');
    const resolution = resolveNutritionTargets({ profile, evaluatedAt: NUT008_NOW_ISO });
    expect(resolution.targetState).toBe('AUTOMATED');
    const repo = createInMemoryNutritionDayRepository();
    const result = await reconcileNutritionDayForNow({
      reason: 'cold-boot',
      repository: repo,
      now: new Date('2026-09-16T18:00:00.000-03:00'),
      profile,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.day.targetState).toBe('AUTOMATED');
    expect(result.day.targets).not.toBeNull();
  });

  it('MANUAL_ONLY + profile ausente: sem targets fabricados, tracking manual permitido', async () => {
    const resolution = resolveNutritionTargets({ profile: null, evaluatedAt: NUT008_NOW_ISO });
    expect(resolution.targetState).toBe('MANUAL_ONLY');
    if (resolution.targetState !== 'MANUAL_ONLY') throw new Error('unreachable');
    expect(resolution.targetUnavailableReason).toBe('PROFILE_ABSENT');
    expect(resolution.targets).toBeNull();
    expect(resolution.gateSnapshot.kind).toBe('PROFILE_ABSENT');
    expect(resolution.gateSnapshot.allowManualTracking).toBe(true);

    const repo = createInMemoryNutritionDayRepository();
    const result = await reconcileNutritionDayForNow({
      reason: 'cold-boot',
      repository: repo,
      now: new Date('2026-09-16T18:00:00.000-03:00'),
      profile: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.day.targetState).toBe('MANUAL_ONLY');
    expect(result.day.targets).toBeNull();
    const chicken = FOOD_DATABASE.getById('br-peito-frango-grelhado')!;
    let day = addMeal(result.day, { id: 'm1', type: 'snack', name: 'Lanche', time: '16:00' });
    day = addFoodEntry(day, 'm1', {
      id: 'e1',
      name: chicken.name,
      quantityGrams: 80,
      calories: 100,
      protein: 20,
      carbs: 0,
      fat: 2,
      loggedAt: NUT008_NOW_ISO,
      foodReferenceId: chicken.id,
    });
    expect(calculateActuals(day).protein).toBe(20);
  });

  it('gate clínico bloqueado: BLOCK_AUTOMATIC_TARGET e gateway 403 sem modelo', async () => {
    const profile = createNut008Profile({ healthFlags: ['pregnancy'] });
    const gate = evaluateNutritionGate(profile);
    expect(gate.status).toBe('BLOCK_AUTOMATIC_TARGET');
    expect(gate.allowAutomatedTargets).toBe(false);
    const resolution = resolveNutritionTargets({ profile, evaluatedAt: NUT008_NOW_ISO });
    expect(resolution.targetState).toBe('MANUAL_ONLY');
    if (resolution.targetState !== 'MANUAL_ONLY') throw new Error('unreachable');
    expect(resolution.targetUnavailableReason).toBe('AUTOMATION_BLOCKED');

    const fetchImpl = vi.fn();
    const blocked = await handleAssistantGatewayRequest(
      JSON.stringify({
        useCase: 'complete_protein',
        context: {
          remaining: { calories: 800, protein: 60, carbs: 90, fat: 25 },
          targets: { calories: 2500, protein: 160, carbs: 300, fat: 70 },
        },
        availability: { state: 'CLINICAL_GATE_BLOCKED', gateStatus: 'BLOCK_AUTOMATIC_TARGET' },
      }),
      {
        env: {
          GYMFLOW_AI_ENABLED: 'true',
          GYMFLOW_AI_BASE_URL: 'https://ai.example.com/v1',
          GYMFLOW_AI_API_KEY: 'test-key-sem-valor-real',
          GYMFLOW_AI_MODEL: 'fake-model-test',
        },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
    );
    expect(blocked.httpStatus).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('dia vazio vs dia consumido vs histórico multi-dia', () => {
    const targets = nut008SharedTargets();
    const empty = createNut008ConsumedDay('2026-09-10', targets, { chickenGrams: 150 });
    // overwrite path: dedicated empty day
    const vacant = createNut008ManualOnlyDay('2026-09-11');
    expect(calculateActuals(vacant).calories).toBe(0);
    expect(calculateActuals(empty).calories).toBeGreaterThan(0);
    const days = [
      createNut008ConsumedDay('2026-09-12', targets),
      createNut008ConsumedDay('2026-09-13', targets),
      createNut008ConsumedDay('2026-09-14', targets),
    ];
    expect(days).toHaveLength(3);
    expect(new Set(days.map((day) => day.date)).size).toBe(3);
  });

  it('timezone America/Sao_Paulo vs Pacific/Kiritimati na virada civil', () => {
    const instant = new Date('2026-09-17T02:30:00.000Z');
    const sp = getCivilDateString(instant, 'America/Sao_Paulo');
    const kiritimati = getCivilDateString(instant, 'Pacific/Kiritimati');
    expect(sp).toBe('2026-09-16');
    expect(kiritimati).toBe('2026-09-17');
    expect(sp).not.toBe(kiritimati);
  });

  it('virada de meia-noite fecha o dia anterior e cria o novo sem copiar consumo', async () => {
    const profile = createNut008Profile();
    const repo = createInMemoryNutritionDayRepository();
    const beforeMidnight = await reconcileNutritionDayForNow({
      reason: 'write',
      repository: repo,
      now: new Date('2026-09-16T23:50:00.000-03:00'),
      profile,
    });
    expect(beforeMidnight.ok).toBe(true);
    if (!beforeMidnight.ok) throw new Error('unreachable');
    let day = addMeal(beforeMidnight.day, { id: 'dinner', type: 'dinner', name: 'Jantar', time: '21:00' });
    day = addFoodEntry(day, 'dinner', {
      id: 'late',
      name: 'Iogurte',
      quantityGrams: 100,
      calories: 80,
      protein: 8,
      carbs: 10,
      fat: 2,
      loggedAt: '2026-09-17T00:50:00.000Z',
    });
    await repo.putNutritionDay(day);

    const afterMidnight = await reconcileNutritionDayForNow({
      reason: 'timer',
      repository: repo,
      now: new Date('2026-09-17T00:05:00.000-03:00'),
      profile,
    });
    expect(afterMidnight.ok).toBe(true);
    if (!afterMidnight.ok) throw new Error('unreachable');
    expect(afterMidnight.today).toBe('2026-09-17');
    expect(afterMidnight.actuals.calories).toBe(0);
    const closed = await repo.getNutritionDay('2026-09-16');
    expect(closed?.isClosed).toBe(true);
    expect(calculateActuals(closed!).calories).toBe(80);
  });

  it('offline: client mapeia falha de rede para PROVIDER_UNAVAILABLE honesto', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await requestAssistantProposal(
      {
        useCase: 'complete_protein',
        context: {
          remaining: { calories: 800, protein: 60, carbs: 90, fat: 25 },
          targets: { calories: 2500, protein: 160, carbs: 300, fat: 70 },
        },
        availability: { state: 'AUTOMATED' },
      },
      {},
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.status).toBe('failure');
    if (result.status !== 'failure') throw new Error('unreachable');
    expect(result.code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('retorno online: fetch recuperado entrega payload de contrato (sem números fake locais)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        status: 'ok',
        proposal: {
          useCase: 'explain_target_change',
          facts: {
            targetCalories: 2500,
            targetProteinGrams: 160,
            targetCarbsGrams: 300,
            targetFatGrams: 70,
            bmrKcal: 1700,
            tdeeKcal: 2600,
            energyBalanceKcal: -100,
            goal: 'maintenance',
          },
          explanationText: 'Metas do motor, não da IA.',
        },
      }),
    });
    const result = await requestAssistantProposal(
      {
        useCase: 'explain_target_change',
        facts: {
          targetCalories: 2500,
          targetProteinGrams: 160,
          targetCarbsGrams: 300,
          targetFatGrams: 70,
          bmrKcal: 1700,
          tdeeKcal: 2600,
          energyBalanceKcal: -100,
          goal: 'maintenance',
        },
      },
      {},
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.status).toBe('ok');
  });

  it('provider IA indisponível: gateway 503 sem chamar rede', async () => {
    const fetchImpl = vi.fn();
    const result = await handleAssistantGatewayRequest(AUTOMATED_BODY, {
      env: { GYMFLOW_AI_ENABLED: 'false' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.httpStatus).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('explain_target_change aceita balanço energético negativo do motor (déficit)', () => {
    const targets = calculateDailyTargets(createNut008Profile({ goal: 'fat_loss_moderate' }));
    expect(targets.energyBalanceKcal).toBeLessThan(0);
    const request = validateGatewayRequest({
      useCase: 'explain_target_change',
      facts: {
        targetCalories: targets.targetCalories,
        targetProteinGrams: targets.targetProteinGrams,
        targetCarbsGrams: targets.targetCarbsGrams,
        targetFatGrams: targets.targetFatGrams,
        bmrKcal: targets.bmrKcal,
        tdeeKcal: targets.tdeeKcal,
        energyBalanceKcal: targets.energyBalanceKcal,
        goal: 'fat_loss_moderate',
      },
    });
    expect(request.useCase).toBe('explain_target_change');
  });

  it('provider IA disponível (fake): 200 grounded, macros locais', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              items: [{ foodReferenceId: 'br-peito-frango-grelhado', grams: 150, calories: 1, protein: 1 }],
            }),
          },
        }],
      }),
    });
    const result = await handleAssistantGatewayRequest(AUTOMATED_BODY, {
      env: {
        GYMFLOW_AI_ENABLED: 'true',
        GYMFLOW_AI_BASE_URL: 'https://ai.example.com/v1',
        GYMFLOW_AI_API_KEY: 'test-key-sem-valor-real',
        GYMFLOW_AI_MODEL: 'fake-model-test',
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('ok');
    if (result.body.status !== 'ok') throw new Error('unreachable');
    if (result.body.proposal.useCase !== 'complete_protein') throw new Error('unreachable');
    expect(result.body.proposal.items[0].computed.calories).toBeCloseTo(238.5, 1);
  });
});
