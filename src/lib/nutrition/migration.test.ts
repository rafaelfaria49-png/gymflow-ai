/**
 * GymFlow AI — Testes da migração legada pura (NUT-004A / GOAL-077)
 *
 * Cobre: EMPTY, DEMO, REAL, UNKNOWN (NaN / negativo / tipo incorreto),
 * anti-duplicidade de hidratação e replay idempotente.
 */

import { describe, expect, it } from 'vitest';
import type { DailyTargets } from './engine-types';
import { createEvaluatedGateSnapshot } from './gate-snapshot';
import { createInMemoryNutritionDayRepository } from './rollover';
import { NutritionLedgerError } from './ledger-types';
import {
  classifyLegacyNutrition,
  LEGACY_CONSOLIDATED_MEAL_NAME,
  LEGACY_DEMO_SEED,
  migrateLegacyNutrition,
} from './migration';

function makeTargets(): DailyTargets {
  return {
    id: 'targets-event-legacy',
    engineVersion: '1.0.0',
    formulaVersion: 'mifflin-st-jeor-v1',
    inputSnapshotHash: 'b'.repeat(64),
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

const DATE = '2026-09-10';
const TIMEZONE = 'America/Sao_Paulo';

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
    '2026-09-10T14:00:00.000Z',
  );
}

describe('classifyLegacyNutrition', () => {
  it('EMPTY para zeros absolutos', () => {
    expect(classifyLegacyNutrition({ calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 })).toBe('LEGACY_EMPTY');
    expect(classifyLegacyNutrition({ calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 }, 0)).toBe('LEGACY_EMPTY');
    expect(classifyLegacyNutrition({ calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 }, null)).toBe('LEGACY_EMPTY');
  });

  it('DEMO somente para o seed comprovado 1420/110/150/45/1200', () => {
    expect(classifyLegacyNutrition({ ...LEGACY_DEMO_SEED })).toBe('LEGACY_DEMO');
    expect(classifyLegacyNutrition({ calories: 1420, protein: 110, carbs: 150, fat: 45, water: 1200 })).toBe(
      'LEGACY_DEMO',
    );
    // Qualquer divergência indica uso deliberado: vira REAL, não DEMO.
    expect(classifyLegacyNutrition({ calories: 1421, protein: 110, carbs: 150, fat: 45, water: 1200 })).toBe(
      'LEGACY_REAL',
    );
  });

  it.each([
    ['ausente', undefined, 'LEGACY_DEMO'],
    ['nulo', null, 'LEGACY_DEMO'],
    ['zerado', 0, 'LEGACY_DEMO'],
    ['espelho demo 1200', 1200, 'LEGACY_DEMO'],
    ['hidratação real 500 preserva dado real', 500, 'LEGACY_REAL'],
    ['hidratação real 1800 preserva dado real', 1800, 'LEGACY_REAL'],
    ['hidratação real 5000 preserva dado real', 5000, 'LEGACY_REAL'],
  ])('GOAL-079 — seed exato com waterIntake %s => %s', (_label, intake, expected) => {
    expect(classifyLegacyNutrition({ ...LEGACY_DEMO_SEED }, intake)).toBe(expected);
  });

  it('GOAL-079 — waterIntake incompatível segue caminho REAL e preserva a hidratação', () => {
    const result = migrateLegacyNutrition({
      nutrition: { ...LEGACY_DEMO_SEED },
      userWaterIntake: 5000,
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
      gateSnapshot: makeGateSnapshot(),
      markClosed: false,
    });
    expect(result.classification).toBe('LEGACY_REAL');
    expect(result.outcome).toBe('migrated');
    if (result.outcome !== 'migrated') return expect.unreachable();
    expect(result.hydrationMl).toBe(5000);
    expect(result.day.hydrationEntries).toHaveLength(1);
    expect(result.day.hydrationEntries[0]?.amountMl).toBe(5000);
  });

  it.each([
    ['calorias no teto', { calories: 15000, protein: 1, carbs: 1, fat: 1, water: 0 }],
    ['calorias absurdas', { calories: 50000, protein: 1, carbs: 1, fat: 1, water: 0 }],
    ['proteína no teto', { calories: 100, protein: 1000, carbs: 1, fat: 1, water: 0 }],
    ['carbo no teto', { calories: 100, protein: 1, carbs: 1000, fat: 1, water: 0 }],
    ['gordura no teto', { calories: 100, protein: 1, carbs: 1, fat: 1000, water: 0 }],
  ])('GOAL-079 — fora de teto %s => UNKNOWN (nunca LEGACY_REAL → exceção)', (_label, nutrition) => {
    expect(classifyLegacyNutrition(nutrition)).toBe('UNKNOWN');
    const result = migrateLegacyNutrition({
      nutrition,
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
      gateSnapshot: makeGateSnapshot(),
    });
    expect(result.classification).toBe('UNKNOWN');
    expect(result.outcome).toBe('quarantined');
    expect(result.day).toBeNull();
    expect(result.hydrationMl).toBe(0);
  });

  it('REAL para dados divergentes do demo', () => {
    expect(classifyLegacyNutrition({ calories: 2000, protein: 150, carbs: 200, fat: 60, water: 2500 })).toBe(
      'LEGACY_REAL',
    );
    // Hidratação real com macros zerados ainda é uso deliberado.
    expect(classifyLegacyNutrition({ calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 }, 500)).toBe('LEGACY_REAL');
  });

  it('UNKNOWN para NaN (prioridade sobre promoção)', () => {
    expect(classifyLegacyNutrition({ calories: Number.NaN, protein: 0, carbs: 0, fat: 0, water: 0 })).toBe('UNKNOWN');
    expect(classifyLegacyNutrition({ calories: 0, protein: 0, carbs: 0, fat: 0, water: Number.NaN })).toBe('UNKNOWN');
  });

  it('UNKNOWN para Infinity e negativos', () => {
    expect(
      classifyLegacyNutrition({ calories: Number.POSITIVE_INFINITY, protein: 0, carbs: 0, fat: 0, water: 0 }),
    ).toBe('UNKNOWN');
    expect(classifyLegacyNutrition({ calories: 0, protein: -10, carbs: 0, fat: 0, water: 0 })).toBe('UNKNOWN');
    expect(classifyLegacyNutrition({ calories: 0, protein: 0, carbs: 0, fat: 0, water: -1 })).toBe('UNKNOWN');
    // Intake legado corrompido contamina a classificação inteira.
    expect(classifyLegacyNutrition({ calories: 2000, protein: 150, carbs: 200, fat: 60, water: 500 }, -5)).toBe(
      'UNKNOWN',
    );
  });

  it('UNKNOWN para tipo incorreto e payload malformado', () => {
    expect(classifyLegacyNutrition({ calories: '2000', protein: 150, carbs: 200, fat: 60, water: 500 })).toBe('UNKNOWN');
    expect(classifyLegacyNutrition({ calories: 2000, protein: 150, carbs: 200, fat: 60 })).toBe('UNKNOWN');
    expect(classifyLegacyNutrition(null)).toBe('UNKNOWN');
    expect(classifyLegacyNutrition(undefined)).toBe('UNKNOWN');
    expect(classifyLegacyNutrition([1, 2, 3])).toBe('UNKNOWN');
    expect(classifyLegacyNutrition('legado')).toBe('UNKNOWN');
    expect(classifyLegacyNutrition({ calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 }, 'muita')).toBe('UNKNOWN');
  });
});

describe('migrateLegacyNutrition — descarte e quarentena', () => {
  it('EMPTY é descartado sem dia', () => {
    const result = migrateLegacyNutrition({
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
      gateSnapshot: makeGateSnapshot(),
    });
    expect(result).toMatchObject({ classification: 'LEGACY_EMPTY', outcome: 'discarded', day: null, hydrationMl: 0 });
  });

  it('DEMO é descartado do ledger real', () => {
    const result = migrateLegacyNutrition({
      nutrition: { ...LEGACY_DEMO_SEED },
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
      gateSnapshot: makeGateSnapshot(),
    });
    expect(result).toMatchObject({ classification: 'LEGACY_DEMO', outcome: 'discarded', day: null });
  });

  it('UNKNOWN é quarentenado: nunca gera FoodEntry, HydrationEntry, Actuals ou XP', () => {
    const result = migrateLegacyNutrition({
      nutrition: { calories: Number.NaN, protein: 0, carbs: 0, fat: 0, water: 0 },
      userWaterIntake: 500,
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
      gateSnapshot: makeGateSnapshot(),
    });
    expect(result.classification).toBe('UNKNOWN');
    expect(result.outcome).toBe('quarantined');
    expect(result.day).toBeNull();
    expect(result.hydrationMl).toBe(0);
    if (result.outcome === 'quarantined') {
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons.join(' ')).toMatch(/nutrition\.calories/);
    } else {
      expect.unreachable();
    }
  });
});

describe('migrateLegacyNutrition — REAL', () => {
  const REAL = { calories: 2000, protein: 150, carbs: 200, fat: 60, water: 800 };

  it('preserva valores em entrada consolidada legada', () => {
    const result = migrateLegacyNutrition({
      nutrition: REAL,
      userWaterIntake: 1200,
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
      gateSnapshot: makeGateSnapshot(),
    });
    expect(result.classification).toBe('LEGACY_REAL');
    expect(result.outcome).toBe('migrated');
    if (result.outcome !== 'migrated') return expect.unreachable();

    const { day } = result;
    expect(day.date).toBe(DATE);
    expect(day.timezone).toBe(TIMEZONE);
    expect(day.targets!.targetCalories).toBe(2500);
    expect(day.meals).toHaveLength(1);
    expect(day.meals[0]?.type).toBe('custom');
    expect(day.meals[0]?.name).toBe(LEGACY_CONSOLIDATED_MEAL_NAME);
    expect(day.meals[0]?.entries).toHaveLength(1);
    expect(day.meals[0]?.entries[0]).toMatchObject({
      calories: 2000,
      protein: 150,
      carbs: 200,
      fat: 60,
    });
    // Dia migrado nasce fechado por padrão (dado histórico).
    expect(day.isClosed).toBe(true);
    expect(day.closedAt).not.toBeNull();
  });

  it('markClosed:false mantém o dia aberto (dia corrente no wiring futuro)', () => {
    const result = migrateLegacyNutrition({
      nutrition: REAL,
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
      gateSnapshot: makeGateSnapshot(),
      markClosed: false,
    });
    if (result.outcome !== 'migrated') return expect.unreachable();
    expect(result.day.isClosed).toBe(false);
    expect(result.day.closedAt).toBeNull();
  });

  it('REAL sem DailyTargets válido falha tipada (sem alvo artificial)', () => {
    for (const targets of [null, undefined, { targetCalories: 2000 }]) {
      try {
        migrateLegacyNutrition({
          nutrition: REAL,
          date: DATE,
          timezone: TIMEZONE,
          targets: targets as unknown as DailyTargets,
        });
        expect.unreachable('migração REAL sem targets deveria falhar');
      } catch (error) {
        expect((error as NutritionLedgerError).code).toBe('INVALID_TARGETS');
      }
    }
  });

  it('GOAL-079 — água sem teto canônico: nenhum teto arbitrário inventado (dívida P2 LEGACY_WATER_NO_CEILING)', () => {
    const result = migrateLegacyNutrition({
      nutrition: { calories: 2000, protein: 100, carbs: 200, fat: 60, water: 12000 },
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
      gateSnapshot: makeGateSnapshot(),
      markClosed: false,
    });
    expect(result.classification).toBe('LEGACY_REAL');
    if (result.outcome !== 'migrated') return expect.unreachable();
    expect(result.hydrationMl).toBe(12000);
  });

  it('REAL só com hidratação gera dia sem FoodEntry (refeição vazia permanece)', () => {
    const result = migrateLegacyNutrition({
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
      userWaterIntake: 700,
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
      gateSnapshot: makeGateSnapshot(),
      markClosed: false,
    });
    if (result.outcome !== 'migrated') return expect.unreachable();
    expect(result.day.meals).toHaveLength(1);
    expect(result.day.meals[0]?.entries).toEqual([]);
    expect(result.day.hydrationEntries).toHaveLength(1);
    expect(result.day.hydrationEntries[0]?.amountMl).toBe(700);
  });
});

describe('migrateLegacyNutrition — anti-duplicidade de hidratação', () => {
  it.each([
    ['intake maior vence', 800, 1200, 1200],
    ['nutrition.water maior vence', 1500, 900, 1500],
    ['iguais não somam', 800, 800, 800],
    ['só nutrition.water', 600, 0, 600],
    ['só intake', 0, 450, 450],
  ])('%s', (_label, water, intake, expected) => {
    const result = migrateLegacyNutrition({
      nutrition: { calories: 1800, protein: 120, carbs: 180, fat: 55, water },
      userWaterIntake: intake,
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
      gateSnapshot: makeGateSnapshot(),
      markClosed: false,
    });
    if (result.outcome !== 'migrated') return expect.unreachable();
    // UMA única entrada — nunca a soma dos dois legados.
    expect(result.day.hydrationEntries).toHaveLength(1);
    expect(result.day.hydrationEntries[0]?.amountMl).toBe(expected);
    expect(result.hydrationMl).toBe(expected);
  });

  it('sem água em nenhum legado: nenhuma entrada de hidratação', () => {
    const result = migrateLegacyNutrition({
      nutrition: { calories: 1800, protein: 120, carbs: 180, fat: 55, water: 0 },
      userWaterIntake: 0,
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
      gateSnapshot: makeGateSnapshot(),
      markClosed: false,
    });
    if (result.outcome !== 'migrated') return expect.unreachable();
    expect(result.day.hydrationEntries).toEqual([]);
    expect(result.hydrationMl).toBe(0);
  });
});

describe('migrateLegacyNutrition — idempotência de replay', () => {
  it('executar 2x sobre o mesmo input produz dias profundo-iguais', () => {
    const input = {
      nutrition: { calories: 2000, protein: 150, carbs: 200, fat: 60, water: 800 },
      userWaterIntake: 1200,
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
      gateSnapshot: makeGateSnapshot(),
    };
    const first = migrateLegacyNutrition(input);
    const second = migrateLegacyNutrition(input);
    expect(first).toEqual(second);
  });

  it('replay no repository (chave natural date) não cria duplicatas', async () => {
    const repository = createInMemoryNutritionDayRepository();
    const input = {
      nutrition: { calories: 2000, protein: 150, carbs: 200, fat: 60, water: 800 },
      userWaterIntake: 1200,
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
      gateSnapshot: makeGateSnapshot(),
    };
    for (let replay = 0; replay < 2; replay += 1) {
      const result = migrateLegacyNutrition(input);
      if (result.outcome !== 'migrated') return expect.unreachable();
      await repository.putNutritionDay(result.day);
    }
    const days = await repository.listNutritionDays();
    expect(days).toHaveLength(1);
    expect(days[0]?.meals).toHaveLength(1);
    expect(days[0]?.meals[0]?.entries).toHaveLength(1);
    expect(days[0]?.hydrationEntries).toHaveLength(1);
  });
});
