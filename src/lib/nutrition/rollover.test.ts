/**
 * GymFlow AI — Testes do rollover idempotente (NUT-004A / GOAL-077)
 *
 * Cobre: mesmo dia, meia-noite, dia já existente, anterior fechado, duplo
 * ensureToday concorrente, fusos negativo/positivo, mudança de timezone e
 * relógio retrocedido sem apagar histórico.
 */

import { describe, expect, it } from 'vitest';
import type { DailyTargets } from './engine-types';
import { createEvaluatedGateSnapshot } from './gate-snapshot';
import { addFoodEntry, addMeal, calculateActuals, closeNutritionDay, createNutritionDay } from './ledger';
import { NutritionLedgerError } from './ledger-types';
import {
  createInMemoryNutritionDayRepository,
  ensureTodayNutritionDay,
  type NutritionDayRepository,
} from './rollover';

const SAO_PAULO = 'America/Sao_Paulo';
const KIRITIMATI = 'Pacific/Kiritimati'; // UTC+14
const MIDWAY = 'Pacific/Midway'; // UTC-11

function makeTargets(): DailyTargets {
  return {
    id: 'targets-event-rollover',
    engineVersion: '1.0.0',
    formulaVersion: 'mifflin-st-jeor-v1',
    inputSnapshotHash: 'c'.repeat(64),
    computedAt: '2026-09-12T12:00:00.000Z',
    computedAtSource: 'explicit_context',
    computedReason: 'initial_setup',
    targetCalories: 2500,
    targetProteinGrams: 160,
    targetCarbsGrams: 300,
    targetFatGrams: 70,
    targetWaterMl: 2800,
    bmrKcal: 1700,
    tdeeKcal: 2600,
    energyBalanceKcal: -100,
    scientificStatus: 'PROVISIONAL_PENDING_PROFESSIONAL_REVIEW',
    isLimitedGuidance: false,
    appliedCaloricFloor: 1500,
    effectiveProteinGramsPerKg: 2.0,
    effectiveFatGramsPerKg: 0.85,
    macroReconciliation: {
      macroCalories: 2500,
      targetCalories: 2500,
      deltaKcal: 0,
      roundingToleranceKcal: 2,
      isReconciled: true,
      unmetConstraints: [],
    },
    estimationTolerance: {
      relative: 0,
      reason: 'NONE',
      targetCaloriesLowerKcal: 2500,
      targetCaloriesUpperKcal: 2500,
    },
  };
}

function ensure(
  repository: NutritionDayRepository,
  now: Date,
  timezone: string = SAO_PAULO,
) {
  return ensureTodayNutritionDay({
    now,
    timezone,
    targets: makeTargets(),
    targetState: 'AUTOMATED',
    gateSnapshot: makeGateSnapshot(),
    repository,
  });
}

function makeGateSnapshot() {
  return createEvaluatedGateSnapshot(
    {
      status: 'NORMAL_FLOW',
      reasons: [],
      userNoticeKey: 'NUTRITION_GATE_NORMAL_FLOW',
      allowManualTracking: true,
      allowAutomatedTargets: true,
      suggestedAction: 'PROCEED',
    },
    '2026-09-12T14:00:00.000Z',
  );
}

describe('ensureTodayNutritionDay — mesmo dia e meia-noite', () => {
  it('cria uma vez e devolve o existente na segunda chamada', async () => {
    const repository = createInMemoryNutritionDayRepository();
    const now = new Date('2026-09-12T14:00:00.000Z');

    const first = await ensure(repository, now);
    expect(first.status).toBe('created');
    expect(first.today).toBe('2026-09-12');
    expect(first.day.date).toBe('2026-09-12');
    expect(first.day.isClosed).toBe(false);

    const second = await ensure(repository, now);
    expect(second.status).toBe('existing-active');
    expect(second.day.id).toBe(first.day.id);
    expect(await repository.listNutritionDays()).toHaveLength(1);
    expect(await repository.getActiveNutritionDate()).toBe('2026-09-12');
  });

  it('virada de meia-noite: fecha o anterior e cria today sem perda', async () => {
    const repository = createInMemoryNutritionDayRepository();
    const dayOne = await ensure(repository, new Date('2026-09-12T14:00:00.000Z'));
    const withFood = addFoodEntry(
      addMeal(dayOne.day, { id: 'meal-1', type: 'dinner', name: 'Jantar' }),
      'meal-1',
      { id: 'food-1', name: 'Frango', calories: 400, protein: 50, carbs: 0, fat: 10, loggedAt: '2026-09-12T19:00:00.000Z' },
    );
    await repository.putNutritionDay(withFood);

    const dayTwo = await ensure(repository, new Date('2026-09-13T04:00:00.000Z'));
    expect(dayTwo.status).toBe('created');
    expect(dayTwo.today).toBe('2026-09-13');
    expect(dayTwo.day.id).not.toBe(dayOne.day.id);

    const previous = await repository.getNutritionDay('2026-09-12');
    expect(previous?.isClosed).toBe(true);
    expect(previous?.closedAt).not.toBeNull();
    // Histórico preservado byte a byte (só flags de fechamento mudam).
    expect(previous?.meals).toEqual(withFood.meals);
    expect(calculateActuals(previous!)).toEqual(calculateActuals(withFood));

    expect(await repository.getActiveNutritionDate()).toBe('2026-09-13');
    expect((await repository.listNutritionDays()).map((day) => day.date)).toEqual(['2026-09-12', '2026-09-13']);
  });

  it('dia já existente mas não ativo é reutilizado (sem duplicar)', async () => {
    const seeded = await ensureTodayNutritionDay({
      now: new Date('2026-09-12T14:00:00.000Z'),
      timezone: SAO_PAULO,
      targets: makeTargets(),
      targetState: 'AUTOMATED',
      gateSnapshot: makeGateSnapshot(),
      repository: createInMemoryNutritionDayRepository(),
      dayIdFactory: () => 'seeded-day',
    });
    expect(seeded.day.id).toBe('seeded-day');

    const repository = createInMemoryNutritionDayRepository({
      days: [{ ...seeded.day, isClosed: false }],
      activeDate: '2026-09-11',
    });
    // Dia anterior aberto: deve ser fechado na reutilização.
    const previous = await ensureTodayNutritionDay({
      now: new Date('2026-09-11T14:00:00.000Z'),
      timezone: SAO_PAULO,
      targets: makeTargets(),
      targetState: 'AUTOMATED',
      gateSnapshot: makeGateSnapshot(),
      repository,
    });
    expect(previous.day.date).toBe('2026-09-11');

    const reused = await ensure(repository, new Date('2026-09-12T14:00:00.000Z'));
    expect(reused.status).toBe('reused');
    expect(reused.day.id).toBe('seeded-day');
    expect(await repository.getActiveNutritionDate()).toBe('2026-09-12');
    expect(await repository.listNutritionDays()).toHaveLength(2);
  });

  it('dia anterior já fechado permanece intacto', async () => {
    const repository = createInMemoryNutritionDayRepository();
    await ensure(repository, new Date('2026-09-12T14:00:00.000Z'));
    const before = await repository.getNutritionDay('2026-09-12');

    await ensure(repository, new Date('2026-09-13T14:00:00.000Z'));

    const after = await repository.getNutritionDay('2026-09-12');
    expect(after?.isClosed).toBe(true);
    expect(after?.meals).toEqual(before?.meals);
    expect(after?.targets).toEqual(before?.targets);
  });

  it('dias pulados não são inventados', async () => {
    const repository = createInMemoryNutritionDayRepository();
    await ensure(repository, new Date('2026-09-12T14:00:00.000Z'));
    await ensure(repository, new Date('2026-09-15T14:00:00.000Z'));

    expect((await repository.listNutritionDays()).map((day) => day.date)).toEqual(['2026-09-12', '2026-09-15']);
  });
});

describe('ensureTodayNutritionDay — concorrência', () => {
  it('dois ensureToday simultâneos resultam em 1 dia, 1 activeDate e mesmo id', async () => {
    const repository = createInMemoryNutritionDayRepository();
    const now = new Date('2026-09-12T14:00:00.000Z');

    const [left, right] = await Promise.all([ensure(repository, now), ensure(repository, now)]);

    expect(left.day.id).toBe(right.day.id);
    expect(new Set([left.status, right.status])).toEqual(new Set(['created', 'reused']));
    expect(await repository.listNutritionDays()).toHaveLength(1);
    expect(await repository.getActiveNutritionDate()).toBe('2026-09-12');
  });
});

describe('ensureTodayNutritionDay — fusos', () => {
  // 2026-09-12T02:00:00Z cai em dias civis distintos conforme o offset.
  const INSTANT = new Date('2026-09-12T02:00:00.000Z');

  it('timezone negativo (America/Sao_Paulo, UTC-3): ainda é dia 11', async () => {
    const repository = createInMemoryNutritionDayRepository();
    const result = await ensure(repository, INSTANT, SAO_PAULO);
    expect(result.today).toBe('2026-09-11');
    expect(result.day.date).toBe('2026-09-11');
    expect(result.day.timezone).toBe(SAO_PAULO);
  });

  it('timezone positivo (Pacific/Kiritimati, UTC+14): já é dia 12', async () => {
    const repository = createInMemoryNutritionDayRepository();
    const result = await ensure(repository, INSTANT, KIRITIMATI);
    expect(result.today).toBe('2026-09-12');
    expect(result.day.date).toBe('2026-09-12');
  });

  it('timezone negativo extremo (Pacific/Midway, UTC-11): ainda é dia 11', async () => {
    const repository = createInMemoryNutritionDayRepository();
    const result = await ensure(repository, INSTANT, MIDWAY);
    expect(result.today).toBe('2026-09-11');
  });

  it('mudança de timezone no mesmo instante preserva ambos os dias', async () => {
    const repository = createInMemoryNutritionDayRepository();
    const first = await ensure(repository, INSTANT, KIRITIMATI);
    expect(first.day.date).toBe('2026-09-12');

    const second = await ensure(repository, INSTANT, SAO_PAULO);
    expect(second.day.date).toBe('2026-09-11');
    expect(second.day.id).not.toBe(first.day.id);

    // O dia do fuso futuro não é fechado nem apagado pela mudança de fuso.
    const future = await repository.getNutritionDay('2026-09-12');
    expect(future?.isClosed).toBe(false);
    expect(future?.meals).toEqual([]);
    expect((await repository.listNutritionDays()).map((day) => day.date)).toEqual(['2026-09-11', '2026-09-12']);
  });
});

describe('ensureTodayNutritionDay — relógio retrocede', () => {
  it('preserva o histórico sem apagar nem fechar o futuro', async () => {
    const repository = createInMemoryNutritionDayRepository();
    const current = await ensure(repository, new Date('2026-09-12T14:00:00.000Z'));
    const withFood = addFoodEntry(
      addMeal(current.day, { id: 'meal-1', type: 'lunch', name: 'Almoço' }),
      'meal-1',
      { id: 'food-1', name: 'Arroz', calories: 200, protein: 4, carbs: 44, fat: 1, loggedAt: '2026-09-12T12:00:00.000Z' },
    );
    await repository.putNutritionDay(withFood);

    const back = await ensure(repository, new Date('2026-09-10T14:00:00.000Z'));
    expect(back.day.date).toBe('2026-09-10');

    // Nada do futuro foi apagado ou fechado.
    const future = await repository.getNutritionDay('2026-09-12');
    expect(future?.isClosed).toBe(false);
    expect(future?.meals).toEqual(withFood.meals);

    // Relógio restaurado: o dia original volta a ser o ativo, intacto.
    const restored = await ensure(repository, new Date('2026-09-12T15:00:00.000Z'));
    expect(restored.day.id).toBe(current.day.id);
    expect(restored.day.isClosed).toBe(false);
    expect(restored.day.meals).toEqual(withFood.meals);
  });

  it('dia fechado com ativo no futuro é devolvido sem tocar no ponteiro', async () => {
    const past = await ensureTodayNutritionDay({
      now: new Date('2026-09-10T14:00:00.000Z'),
      timezone: SAO_PAULO,
      targets: makeTargets(),
      targetState: 'AUTOMATED',
      gateSnapshot: makeGateSnapshot(),
      repository: createInMemoryNutritionDayRepository(),
    });
    const repository = createInMemoryNutritionDayRepository({
      days: [{ ...past.day, isClosed: true, closedAt: '2026-09-11T00:00:00.000Z' }],
      activeDate: '2026-09-12',
    });

    const result = await ensure(repository, new Date('2026-09-10T15:00:00.000Z'));
    expect(result.status).toBe('reused');
    expect(result.day.isClosed).toBe(true);
    expect(await repository.getActiveNutritionDate()).toBe('2026-09-12');
  });
});

describe('ensureTodayNutritionDay — entradas inválidas', () => {
  it('falha tipada sem targets válidos no caminho de criação', async () => {
    const repository = createInMemoryNutritionDayRepository();
    await expect(
      ensureTodayNutritionDay({
        now: new Date('2026-09-12T14:00:00.000Z'),
        timezone: SAO_PAULO,
        targets: null as never,
        gateSnapshot: makeGateSnapshot(),
        repository,
      }),
    ).rejects.toMatchObject({ name: 'NutritionLedgerError', code: 'INVALID_TARGETS' });
    expect(await repository.listNutritionDays()).toHaveLength(0);
  });

  it('falha tipada para now/timezone inválidos', async () => {
    const repository = createInMemoryNutritionDayRepository();
    await expect(
      ensureTodayNutritionDay({
        now: new Date(Number.NaN),
        timezone: SAO_PAULO,
        targets: makeTargets(),
        targetState: 'AUTOMATED',
        gateSnapshot: makeGateSnapshot(),
        repository,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      ensureTodayNutritionDay({
        now: new Date('2026-09-12T14:00:00.000Z'),
        timezone: '',
        targets: makeTargets(),
        targetState: 'AUTOMATED',
        gateSnapshot: makeGateSnapshot(),
        repository,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('não usa o relógio: instantes distintos geram dias distintos deterministicamente', async () => {
    const repository = createInMemoryNutritionDayRepository();
    const noon = await ensure(repository, new Date('2026-09-12T12:00:00.000Z'));
    const night = await ensure(repository, new Date('2026-09-12T23:59:59.000Z'));
    expect(night.status).toBe('existing-active');
    expect(night.day.id).toBe(noon.day.id);
  });
});

describe('GOAL-079 — recuperação determinística dos pontos de crash A–D', () => {
  const ADVANCE_NOW = new Date('2026-09-12T15:00:00.000Z');

  function seedPrevious(repository: NutritionDayRepository, closed: boolean): Promise<void> {
    const previous = createNutritionDay({
      id: 'day-2026-09-11',
      date: '2026-09-11',
      timezone: SAO_PAULO,
      targets: makeTargets(),
      gateSnapshot: makeGateSnapshot(),
    });
    return repository.putNutritionDay(closed ? closeNutritionDay(previous, '2026-09-11T23:00:00.000Z') : previous)
      .then(() => repository.setActiveNutritionDate('2026-09-11'));
  }

  /** Repositório que simula crash: lança antes da k-ésima escrita (W1/W2/W3). */
  function crashingRepository(
    base: NutritionDayRepository,
    crashBeforeWrite: number,
  ): { repository: NutritionDayRepository; writes: string[] } {
    const writes: string[] = [];
    let count = 0;
    const crash = (label: string): void => {
      count += 1;
      writes.push(label);
      if (count === crashBeforeWrite) throw new Error(`CRASH-SIMULADO-antes-${label}`);
    };
    return {
      writes,
      repository: {
        ...base,
        async putNutritionDayIfAbsent(day) {
          crash('W1-putIfAbsent');
          return base.putNutritionDayIfAbsent(day);
        },
        async putNutritionDay(day) {
          crash('W2-putClose');
          return base.putNutritionDay(day);
        },
        async setActiveNutritionDate(date) {
          crash('W3-setActive');
          return base.setActiveNutritionDate(date);
        },
      },
    };
  }

  it('estado A (crash antes de W1): próximo ensure recria, fecha o anterior e ativa', async () => {
    const base = createInMemoryNutritionDayRepository();
    await seedPrevious(base, false);
    const { repository } = crashingRepository(base, 1);
    await expect(ensure(repository, ADVANCE_NOW)).rejects.toThrow('CRASH-SIMULADO');

    const recovered = await ensure(base, ADVANCE_NOW);
    expect(recovered.status).toBe('created');
    expect((await base.getNutritionDay('2026-09-11'))?.isClosed).toBe(true);
    expect(await base.getActiveNutritionDate()).toBe('2026-09-12');
  });

  it('estado B (crash entre W1 e W2, previous aberto): próximo ensure fecha o pendente e ativa', async () => {
    const base = createInMemoryNutritionDayRepository();
    await seedPrevious(base, false);
    const { repository } = crashingRepository(base, 2);
    await expect(ensure(repository, ADVANCE_NOW)).rejects.toThrow('CRASH-SIMULADO');
    // Estado B real: today persistido, active antigo, previous aberto.
    expect(await base.getNutritionDay('2026-09-12')).not.toBeNull();
    expect(await base.getActiveNutritionDate()).toBe('2026-09-11');
    expect((await base.getNutritionDay('2026-09-11'))?.isClosed).toBe(false);

    const recovered = await ensure(base, ADVANCE_NOW);
    expect(recovered.status).toBe('reused');
    expect((await base.getNutritionDay('2026-09-11'))?.isClosed).toBe(true);
    expect(await base.getActiveNutritionDate()).toBe('2026-09-12');
    expect(await base.listNutritionDays()).toHaveLength(2);
  });

  it('estado C (previous já fechado, active antigo): próximo ensure só avança o ponteiro', async () => {
    const base = createInMemoryNutritionDayRepository();
    await seedPrevious(base, true);
    const { repository } = crashingRepository(base, 2);
    await expect(ensure(repository, ADVANCE_NOW)).rejects.toThrow('CRASH-SIMULADO');

    const recovered = await ensure(base, ADVANCE_NOW);
    expect(await base.getActiveNutritionDate()).toBe('2026-09-12');
    expect((await base.getNutritionDay('2026-09-11'))?.isClosed).toBe(true);
    expect((await base.getNutritionDay('2026-09-12'))?.isClosed).toBe(false);
  });

  it('estado D é inalcançável: ordem W1→W2→W3 confirmada no caminho de avanço', async () => {
    const base = createInMemoryNutritionDayRepository();
    await seedPrevious(base, false);
    const order: string[] = [];
    const recording: NutritionDayRepository = {
      ...base,
      async putNutritionDayIfAbsent(day) {
        order.push('W1');
        return base.putNutritionDayIfAbsent(day);
      },
      async putNutritionDay(day) {
        order.push('W2');
        return base.putNutritionDay(day);
      },
      async setActiveNutritionDate(date) {
        order.push('W3');
        return base.setActiveNutritionDate(date);
      },
    };
    await ensure(recording, ADVANCE_NOW);
    // W3 (ponteiro em today) jamais executa sem W2 (fechar anterior) confirmado.
    expect(order).toEqual(['W1', 'W2', 'W3']);
  });

  it('estado D é inalcançável: falha em W2 propaga e W3 nunca executa', async () => {
    const base = createInMemoryNutritionDayRepository();
    await seedPrevious(base, false);
    let setActiveCalls = 0;
    const failing: NutritionDayRepository = {
      ...base,
      async putNutritionDay(day) {
        throw new Error('W2-falhou');
      },
      async setActiveNutritionDate(date) {
        setActiveCalls += 1;
        return base.setActiveNutritionDate(date);
      },
    };
    await expect(ensure(failing, ADVANCE_NOW)).rejects.toThrow('W2-falhou');
    expect(setActiveCalls).toBe(0);
    expect(await base.getActiveNutritionDate()).toBe('2026-09-11');
  });

  it('20 chamadas concorrentes para a mesma data: 1 dia, mesmo id', async () => {
    const repository = createInMemoryNutritionDayRepository();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => ensure(repository, ADVANCE_NOW)),
    );
    expect(new Set(results.map((result) => result.day.id)).size).toBe(1);
    expect(await repository.listNutritionDays()).toHaveLength(1);
    expect(await repository.getActiveNutritionDate()).toBe('2026-09-12');
  });
});
