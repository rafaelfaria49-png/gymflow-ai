/**
 * GymFlow AI — Testes do NutritionLedger puro (NUT-004A / GOAL-077)
 *
 * Cobre: create day, add/update/remove food, add/remove hydration, actuals
 * derivados, remaining (incl. over-target), dia fechado bloqueado e imutabilidade.
 */

import { describe, expect, it } from 'vitest';
import type { DailyTargets } from './engine-types';
import {
  addFoodEntry,
  addHydrationEntry,
  addMeal,
  calculateActuals,
  calculateRemaining,
  closeNutritionDay,
  createEmptyNutritionLedger,
  createNutritionDay,
  findNutritionDay,
  removeFoodEntry,
  removeHydrationEntry,
  updateFoodEntry,
} from './ledger';
import { createEvaluatedGateSnapshot } from './gate-snapshot';
import { NutritionLedgerError, isCivilDateString, isDailyTargets, type NutritionDay } from './ledger-types';

function makeTargets(overrides: Partial<DailyTargets> = {}): DailyTargets {
  return {
    id: 'targets-event-1',
    engineVersion: '1.0.0',
    formulaVersion: 'mifflin-st-jeor-v1',
    inputSnapshotHash: 'a'.repeat(64),
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
    ...overrides,
  };
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

function makeDay(overrides: Partial<Parameters<typeof createNutritionDay>[0]> = {}): NutritionDay {
  return createNutritionDay({
    id: 'day-1',
    date: '2026-09-12',
    timezone: 'America/Sao_Paulo',
    targets: makeTargets(),
    gateSnapshot: makeGateSnapshot(),
    ...overrides,
  });
}

function snapshot(day: NutritionDay): string {
  return JSON.stringify(day);
}

describe('createNutritionDay', () => {
  it('cria dia aberto com snapshot completo dos targets', () => {
    const targets = makeTargets();
    const day = makeDay({ targets });

    expect(day.id).toBe('day-1');
    expect(day.date).toBe('2026-09-12');
    expect(day.timezone).toBe('America/Sao_Paulo');
    expect(day.targets).toEqual(targets);
    expect(day.meals).toEqual([]);
    expect(day.hydrationEntries).toEqual([]);
    expect(day.isClosed).toBe(false);
    expect(day.closedAt).toBeNull();
  });

  it('isola o snapshot: mutar o objeto original não afeta o dia', () => {
    const targets = makeTargets();
    const day = makeDay({ targets });
    targets.targetCalories = 9999;
    targets.macroReconciliation.unmetConstraints.push('ENERGY_BELOW_MACRO_MINIMUMS');

    expect(day.targets!.targetCalories).toBe(2500);
    expect(day.targets!.macroReconciliation.unmetConstraints).toEqual([]);
  });

  it.each([
    ['targets null', null],
    ['targets undefined', undefined],
    ['targets vazio', {}],
    ['targets parcial', { targetCalories: 2000 }],
    ['calorias zero', makeTargets({ targetCalories: 0 })],
    ['calorias NaN', makeTargets({ targetCalories: Number.NaN })],
    ['calorias Infinity', makeTargets({ targetCalories: Number.POSITIVE_INFINITY })],
    ['proteína negativa', makeTargets({ targetProteinGrams: -5 })],
    ['água NaN', makeTargets({ targetWaterMl: Number.NaN })],
    ['sem id de proveniência', makeTargets({ id: '' })],
  ])('falha tipada sem fallback quando %s', (_label, targets) => {
    expect(() => makeDay({ targets: targets as unknown as DailyTargets }))
      .toThrowError(NutritionLedgerError);
    try {
      makeDay({ targets: targets as unknown as DailyTargets });
      expect.unreachable();
    } catch (error) {
      expect((error as NutritionLedgerError).code).toBe('INVALID_TARGETS');
    }
  });

  it('rejeita data civil malformada, id vazio e timezone ausente', () => {
    expect(() => makeDay({ date: '12/09/2026' })).toThrowError(NutritionLedgerError);
    expect(() => makeDay({ date: '2026-13-40' })).toThrowError(NutritionLedgerError);
    expect(() => makeDay({ id: '   ' })).toThrowError(NutritionLedgerError);
    expect(() => makeDay({ timezone: '' })).toThrowError(NutritionLedgerError);
  });
});

describe('refeições e alimentos', () => {
  it('adiciona refeição e alimento com actuals derivados', () => {
    let day = makeDay();
    day = addMeal(day, { id: 'meal-1', type: 'breakfast', name: 'Café da manhã' });
    day = addFoodEntry(day, 'meal-1', {
      id: 'food-1',
      name: 'Ovos mexidos',
      quantityGrams: 150,
      calories: 220,
      protein: 18,
      carbs: 2,
      fat: 15,
      loggedAt: '2026-09-12T10:00:00.000Z',
    });

    expect(day.meals).toHaveLength(1);
    expect(day.meals[0]?.entries).toHaveLength(1);
    expect(calculateActuals(day)).toEqual({ calories: 220, protein: 18, carbs: 2, fat: 15, waterMl: 0 });
  });

  it('actuals e remaining são derivados: nunca persistidos no dia', () => {
    const day = addFoodEntry(
      addMeal(makeDay(), { id: 'meal-1', type: 'lunch', name: 'Almoço' }),
      'meal-1',
      { id: 'food-1', name: 'Frango', calories: 300, protein: 40, carbs: 0, fat: 8, loggedAt: '2026-09-12T12:00:00.000Z' },
    );
    expect('actuals' in day).toBe(false);
    expect('remaining' in day).toBe(false);
    expect('actualCalories' in day).toBe(false);
  });

  it('atualiza alimento e recalcula os derivados', () => {
    let day = addFoodEntry(
      addMeal(makeDay(), { id: 'meal-1', type: 'lunch', name: 'Almoço' }),
      'meal-1',
      { id: 'food-1', name: 'Arroz', calories: 200, protein: 4, carbs: 44, fat: 1, loggedAt: '2026-09-12T12:00:00.000Z' },
    );
    day = updateFoodEntry(day, 'meal-1', 'food-1', { calories: 260, carbs: 56 });

    expect(calculateActuals(day)).toMatchObject({ calories: 260, protein: 4, carbs: 56, fat: 1 });
  });

  it('remove alimento mas mantém a refeição vazia', () => {
    let day = addFoodEntry(
      addMeal(makeDay(), { id: 'meal-1', type: 'snack', name: 'Lanche' }),
      'meal-1',
      { id: 'food-1', name: 'Banana', calories: 90, protein: 1, carbs: 23, fat: 0, loggedAt: '2026-09-12T15:00:00.000Z' },
    );
    day = removeFoodEntry(day, 'meal-1', 'food-1');

    expect(day.meals).toHaveLength(1);
    expect(day.meals[0]?.entries).toEqual([]);
    expect(calculateActuals(day)).toMatchObject({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it('rejeita entradas inválidas: NaN, Infinity, negativos, malformadas e duplicadas', () => {
    const day = addMeal(makeDay(), { id: 'meal-1', type: 'dinner', name: 'Jantar' });
    const base = {
      id: 'food-x', name: 'X', calories: 100, protein: 10, carbs: 10, fat: 5, loggedAt: '2026-09-12T19:00:00.000Z',
    };
    expect(() => addFoodEntry(day, 'meal-1', { ...base, calories: Number.NaN })).toThrowError(NutritionLedgerError);
    expect(() => addFoodEntry(day, 'meal-1', { ...base, protein: Number.POSITIVE_INFINITY })).toThrowError(NutritionLedgerError);
    expect(() => addFoodEntry(day, 'meal-1', { ...base, fat: -1 })).toThrowError(NutritionLedgerError);
    expect(() => addFoodEntry(day, 'meal-1', { ...base, calories: 0 })).toThrowError(NutritionLedgerError);
    expect(() => addFoodEntry(day, 'meal-1', { ...base, name: '  ' })).toThrowError(NutritionLedgerError);
    expect(() => addFoodEntry(day, 'meal-1', { ...base, quantityGrams: 0 })).toThrowError(NutritionLedgerError);
    expect(() => addFoodEntry(day, 'nope', base)).toThrowError(NutritionLedgerError);

    const withOne = addFoodEntry(day, 'meal-1', base);
    expect(() => addFoodEntry(withOne, 'meal-1', base)).toThrowError(NutritionLedgerError);
    expect(() => addMeal(withOne, { id: 'meal-1', type: 'snack', name: 'Outra' })).toThrowError(NutritionLedgerError);
    expect(() => addMeal(withOne, { id: 'meal-2', type: 'brunch' as never, name: 'X' })).toThrowError(NutritionLedgerError);
  });

  it('update recusa id imutável, entrada inexistente e patch inválido', () => {
    const day = addFoodEntry(
      addMeal(makeDay(), { id: 'meal-1', type: 'lunch', name: 'Almoço' }),
      'meal-1',
      { id: 'food-1', name: 'Feijão', calories: 150, protein: 9, carbs: 27, fat: 1, loggedAt: '2026-09-12T12:00:00.000Z' },
    );
    expect(() => updateFoodEntry(day, 'meal-1', 'food-1', { id: 'food-2' })).toThrowError(NutritionLedgerError);
    expect(() => updateFoodEntry(day, 'meal-1', 'missing', { calories: 10 })).toThrowError(NutritionLedgerError);
    expect(() => updateFoodEntry(day, 'missing', 'food-1', { calories: 10 })).toThrowError(NutritionLedgerError);
    expect(() => updateFoodEntry(day, 'meal-1', 'food-1', { calories: -50 })).toThrowError(NutritionLedgerError);
    expect(() => removeFoodEntry(day, 'meal-1', 'missing')).toThrowError(NutritionLedgerError);
  });
});

describe('hidratação', () => {
  it('água deriva exclusivamente de hydrationEntries', () => {
    let day = makeDay();
    day = addHydrationEntry(day, { id: 'h-1', amountMl: 500, loggedAt: '2026-09-12T09:00:00.000Z' });
    day = addHydrationEntry(day, { id: 'h-2', amountMl: 250, loggedAt: '2026-09-12T11:00:00.000Z' });

    expect(calculateActuals(day).waterMl).toBe(750);
    day = removeHydrationEntry(day, 'h-1');
    expect(calculateActuals(day).waterMl).toBe(250);
  });

  it('rejeita água zero, negativa, NaN, duplicada e remoção inexistente', () => {
    const day = makeDay();
    expect(() => addHydrationEntry(day, { id: 'h', amountMl: 0, loggedAt: 'x' })).toThrowError(NutritionLedgerError);
    expect(() => addHydrationEntry(day, { id: 'h', amountMl: -100, loggedAt: 'x' })).toThrowError(NutritionLedgerError);
    expect(() => addHydrationEntry(day, { id: 'h', amountMl: Number.NaN, loggedAt: 'x' })).toThrowError(NutritionLedgerError);
    const withOne = addHydrationEntry(day, { id: 'h', amountMl: 300, loggedAt: 'x' });
    expect(() => addHydrationEntry(withOne, { id: 'h', amountMl: 300, loggedAt: 'x' })).toThrowError(NutritionLedgerError);
    expect(() => removeHydrationEntry(withOne, 'missing')).toThrowError(NutritionLedgerError);
  });
});

describe('remaining', () => {
  it('calcula saldo como target menos actual', () => {
    const targets = makeTargets();
    expect(calculateRemaining(targets, { calories: 1000, protein: 60, carbs: 100, fat: 20, waterMl: 800 }))
      .toEqual({ calories: 1500, protein: 100, carbs: 200, fat: 50, waterMl: 2000 });
  });

  it('trava em zero quando o consumo estoura a meta (over-target)', () => {
    const targets = makeTargets();
    expect(calculateRemaining(targets, { calories: 3000, protein: 200, carbs: 100, fat: 70, waterMl: 5000 }))
      .toEqual({ calories: 0, protein: 0, carbs: 200, fat: 0, waterMl: 0 });
  });

  it('rejeita targets inválidos e actuals malformados', () => {
    const targets = makeTargets();
    const actuals = { calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: 0 };
    expect(() => calculateRemaining(null as never, actuals)).toThrowError(NutritionLedgerError);
    expect(() => calculateRemaining(targets, { ...actuals, calories: Number.NaN })).toThrowError(NutritionLedgerError);
    expect(() => calculateRemaining(targets, { ...actuals, waterMl: -1 })).toThrowError(NutritionLedgerError);
  });
});

describe('dia fechado e imutabilidade', () => {
  function makeClosedDay(): NutritionDay {
    let day = addHydrationEntry(makeDay(), { id: 'h-1', amountMl: 250, loggedAt: '2026-09-12T08:00:00.000Z' });
    return closeNutritionDay(day, '2026-09-13T00:00:00.000Z');
  }

  it('dia fechado bloqueia toda edição com DAY_CLOSED', () => {
    const closed = makeClosedDay();
    expect(closed.isClosed).toBe(true);
    const food = {
      id: 'f', name: 'X', calories: 100, protein: 5, carbs: 5, fat: 5, loggedAt: '2026-09-12T08:00:00.000Z',
    };
    const codes: string[] = [];
    for (const attempt of [
      () => addMeal(closed, { id: 'm', type: 'snack', name: 'X' }),
      () => addFoodEntry(closed, 'meal-1', food),
      () => updateFoodEntry(closed, 'meal-1', 'food-1', { calories: 1 }),
      () => removeFoodEntry(closed, 'meal-1', 'food-1'),
      () => addHydrationEntry(closed, { id: 'h-2', amountMl: 100, loggedAt: 'x' }),
      () => removeHydrationEntry(closed, 'h-1'),
    ]) {
      try {
        attempt();
        expect.unreachable('edição em dia fechado deveria falhar');
      } catch (error) {
        codes.push((error as NutritionLedgerError).code);
      }
    }
    expect(codes).toEqual(Array(6).fill('DAY_CLOSED'));
    // Leitura de derivados continua permitida em dia fechado.
    expect(calculateActuals(closed).waterMl).toBe(250);
  });

  it('fechar dia já fechado é idempotente', () => {
    const closed = makeClosedDay();
    expect(closeNutritionDay(closed, '2026-09-14T00:00:00.000Z')).toBe(closed);
  });

  it('operações nunca mutam a entrada (imutabilidade)', () => {
    const fresh = addFoodEntry(
      addMeal(makeDay(), { id: 'meal-1', type: 'lunch', name: 'Almoço' }),
      'meal-1',
      { id: 'food-1', name: 'Frango', calories: 300, protein: 40, carbs: 0, fat: 8, loggedAt: '2026-09-12T12:00:00.000Z' },
    );
    const before = snapshot(fresh);

    const added = addHydrationEntry(fresh, { id: 'h-1', amountMl: 200, loggedAt: 'x' });
    const updated = updateFoodEntry(fresh, 'meal-1', 'food-1', { calories: 350 });
    const removed = removeFoodEntry(fresh, 'meal-1', 'food-1');
    const closed = closeNutritionDay(fresh, '2026-09-13T00:00:00.000Z');

    expect(snapshot(fresh)).toBe(before);
    expect(added).not.toBe(fresh);
    expect(updated).not.toBe(fresh);
    expect(removed).not.toBe(fresh);
    expect(closed).not.toBe(fresh);
    expect(added.hydrationEntries).toHaveLength(1);
    expect(updated.meals[0]?.entries[0]?.calories).toBe(350);
    expect(removed.meals[0]?.entries).toEqual([]);
  });
});

describe('contêiner lógico', () => {
  it('createEmptyNutritionLedger + findNutritionDay', () => {
    const ledger = createEmptyNutritionLedger();
    expect(ledger).toEqual({ days: [], activeDate: null });
    const day = makeDay();
    expect(findNutritionDay({ days: [day], activeDate: day.date }, '2026-09-12')).toBe(day);
    expect(findNutritionDay({ days: [day], activeDate: day.date }, '2026-09-11')).toBeNull();
  });
});

describe('GOAL-079 — isDailyTargets exige o contrato REAL completo', () => {
  const MANDATORY_TOP_LEVEL = [
    'id',
    'engineVersion',
    'formulaVersion',
    'inputSnapshotHash',
    'computedAt',
    'computedAtSource',
    'computedReason',
    'targetCalories',
    'targetProteinGrams',
    'targetCarbsGrams',
    'targetFatGrams',
    'targetWaterMl',
    'bmrKcal',
    'tdeeKcal',
    'energyBalanceKcal',
    'scientificStatus',
    'isLimitedGuidance',
    'appliedCaloricFloor',
    'effectiveProteinGramsPerKg',
    'effectiveFatGramsPerKg',
    'macroReconciliation',
    'estimationTolerance',
  ] as const;

  it('snapshot parcial de 9 campos não é DailyTargets', () => {
    expect(isDailyTargets({
      id: 'x',
      engineVersion: '1.0.0',
      formulaVersion: 'v1',
      inputSnapshotHash: 'h',
      targetCalories: 2500,
      targetProteinGrams: 160,
      targetCarbsGrams: 300,
      targetFatGrams: 70,
      targetWaterMl: 2800,
    })).toBe(false);
  });

  it.each(MANDATORY_TOP_LEVEL.map((field) => [field] as const))(
    'ausência de %s resulta em isDailyTargets = false',
    (field) => {
      const candidate = { ...(makeTargets() as unknown as Record<string, unknown>) };
      delete candidate[field];
      expect(isDailyTargets(candidate)).toBe(false);
    },
  );

  it.each([
    ['macroReconciliation ausente', { macroReconciliation: undefined }],
    ['macroReconciliation nulo', { macroReconciliation: null }],
    ['macroReconciliation sem unmetConstraints', { macroReconciliation: { macroCalories: 1, targetCalories: 1, deltaKcal: 0, roundingToleranceKcal: 2, isReconciled: true } }],
    ['macroReconciliation com unmetConstraints não-array', { macroReconciliation: { macroCalories: 1, targetCalories: 1, deltaKcal: 0, roundingToleranceKcal: 2, isReconciled: true, unmetConstraints: 'x' } }],
    ['macroReconciliation com constraint desconhecida', { macroReconciliation: { macroCalories: 1, targetCalories: 1, deltaKcal: 0, roundingToleranceKcal: 2, isReconciled: true, unmetConstraints: ['INVENTED_CODE'] } }],
    ['macroReconciliation sem isReconciled', { macroReconciliation: { macroCalories: 1, targetCalories: 1, deltaKcal: 0, roundingToleranceKcal: 2, unmetConstraints: [] } }],
    ['estimationTolerance ausente', { estimationTolerance: undefined }],
    ['estimationTolerance nula', { estimationTolerance: null }],
    ['estimationTolerance sem reason', { estimationTolerance: { relative: 0, targetCaloriesLowerKcal: 1, targetCaloriesUpperKcal: 1 } }],
    ['estimationTolerance com reason inventada', { estimationTolerance: { relative: 0, reason: 'GUESS', targetCaloriesLowerKcal: 1, targetCaloriesUpperKcal: 1 } }],
    ['estimationTolerance com relative negativo', { estimationTolerance: { relative: -1, reason: 'NONE', targetCaloriesLowerKcal: 1, targetCaloriesUpperKcal: 1 } }],
    ['computedReason inventada', { computedReason: 'ai_guess' }],
    ['computedAtSource inventado', { computedAtSource: 'device_clock' }],
    ['computedAt malformado', { computedAt: '12/09/2026' }],
    ['computedAt impossível', { computedAt: '2026-02-30T12:00:00.000Z' }],
    ['scientificStatus inventado', { scientificStatus: 'FINAL' }],
    ['isLimitedGuidance não-booleano', { isLimitedGuidance: 'no' }],
  ])('proveniência aninhada parcial %s não é DailyTargets', (_label, override) => {
    expect(isDailyTargets({ ...makeTargets(), ...override })).toBe(false);
  });

  it('computedAt null (ausência explícita do motor) continua válido', () => {
    expect(isDailyTargets({ ...makeTargets(), computedAt: null, computedAtSource: 'absent' })).toBe(true);
  });

  it('targets completo do motor é aceito', () => {
    expect(isDailyTargets(makeTargets())).toBe(true);
  });
});

describe('GOAL-079 — snapshot parcial falha tipada, nunca TypeError', () => {
  it.each([
    ['sem macroReconciliation', { macroReconciliation: undefined }],
    ['sem estimationTolerance', { estimationTolerance: undefined }],
    ['só 9 campos', null],
  ])('createNutritionDay %s falha com NutritionLedgerError', (_label, override) => {
    const targets = override === null
      ? ({ id: 'x', engineVersion: '1.0.0', formulaVersion: 'v1', inputSnapshotHash: 'h', targetCalories: 2500, targetProteinGrams: 1, targetCarbsGrams: 1, targetFatGrams: 1, targetWaterMl: 1 })
      : ({ ...makeTargets(), ...override });
    let caught: unknown;
    try {
      makeDay({ targets: targets as unknown as DailyTargets });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(NutritionLedgerError);
    expect((caught as NutritionLedgerError).code).toBe('INVALID_TARGETS');
    expect(caught).not.toBeInstanceOf(TypeError);
  });
});

describe('GOAL-079 — data civil de calendário', () => {
  it.each([
    '2026-02-29',
    '2026-02-30',
    '2026-02-31',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
  ])('isCivilDateString(%s) = false', (date) => {
    expect(isCivilDateString(date)).toBe(false);
  });

  it.each([
    '2026-02-28',
    '2026-04-30',
    '2026-12-31',
    '2024-02-29',
    '2000-02-29',
  ])('isCivilDateString(%s) = true (incl. bissextos reais)', (date) => {
    expect(isCivilDateString(date)).toBe(true);
  });

  it('createNutritionDay rejeita chave civil impossível com erro tipado', () => {
    expect(() => makeDay({ date: '2026-02-30' })).toThrowError(NutritionLedgerError);
    expect(() => makeDay({ date: '2026-04-31' })).toThrowError(NutritionLedgerError);
  });
});
