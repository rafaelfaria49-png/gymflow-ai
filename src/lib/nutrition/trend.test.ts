import { describe, expect, it } from 'vitest';
import { addFoodEntry, addHydrationEntry, addMeal, createNutritionDay } from './ledger';
import type { NutritionDay } from './ledger-types';
import { buildNutritionTrend, summarizeNutritionTrend } from './trend';
import type { DailyTargets } from './engine-types';

function makeTargets(): DailyTargets {
  return {
    id: 'dt_trend',
    engineVersion: '1.0.0',
    formulaVersion: 'mifflin-st-jeor-v1',
    inputSnapshotHash: 'abc',
    computedAt: null,
    computedAtSource: 'absent',
    computedReason: 'profile_update',
    targetCalories: 2000,
    targetProteinGrams: 150,
    targetCarbsGrams: 220,
    targetFatGrams: 60,
    targetWaterMl: 3000,
    bmrKcal: 1600,
    tdeeKcal: 2200,
    energyBalanceKcal: -200,
    scientificStatus: 'PROVISIONAL_PENDING_PROFESSIONAL_REVIEW',
    isLimitedGuidance: false,
    appliedCaloricFloor: 1500,
    effectiveProteinGramsPerKg: 2,
    effectiveFatGramsPerKg: 0.85,
    macroReconciliation: {
      macroCalories: 2000,
      targetCalories: 2000,
      deltaKcal: 0,
      roundingToleranceKcal: 2,
      isReconciled: true,
      unmetConstraints: [],
    },
    estimationTolerance: {
      relative: 0,
      reason: 'NONE',
      targetCaloriesLowerKcal: 2000,
      targetCaloriesUpperKcal: 2000,
    },
  };
}

const GATE = {
  kind: 'EVALUATED',
  result: {
    status: 'NORMAL_FLOW',
    reasons: [],
    userNoticeKey: 'NORMAL_FLOW',
    allowManualTracking: true,
    allowAutomatedTargets: true,
  },
  evaluatedAt: '2026-09-10T10:00:00.000Z',
} as never;

function makeDay(date: string, kcal: number, protein: number, waterMl: number): NutritionDay {
  let day = createNutritionDay({
    id: `day-${date}`,
    date,
    timezone: 'America/Sao_Paulo',
    targets: makeTargets(),
    targetState: 'AUTOMATED',
    gateSnapshot: GATE,
  });
  day = addMeal(day, { id: `meal-${date}`, type: 'lunch', name: 'Almoço' });
  if (kcal > 0) {
    day = addFoodEntry(day, `meal-${date}`, {
      id: `food-${date}`,
      name: 'Refeição',
      calories: kcal,
      protein,
      carbs: 10,
      fat: 5,
      loggedAt: `${date}T12:00:00.000Z`,
    });
  }
  if (waterMl > 0) {
    day = addHydrationEntry(day, { id: `water-${date}`, amountMl: waterMl, loggedAt: `${date}T13:00:00.000Z` });
  }
  return day;
}

describe('NUT-006 trend honesta (sem interpolar dias)', () => {
  it('janela de 7 dias usa somente dias existentes, em ordem', () => {
    const days = [
      makeDay('2026-09-10', 1800, 120, 2000),
      makeDay('2026-09-12', 2000, 150, 3000),
      makeDay('2026-09-13', 1500, 100, 1500),
    ];
    const points = buildNutritionTrend({ days, daysCount: 7 });
    expect(points.map((p) => p.date)).toEqual(['2026-09-10', '2026-09-12', '2026-09-13']);
    expect(points[0].calories).toBe(1800);
    expect(points[0].targetCalories).toBe(2000);
    expect(points[0].hasTargets).toBe(true);
  });

  it('dias ausentes não entram na média', () => {
    const days = [makeDay('2026-09-10', 2000, 150, 3000), makeDay('2026-09-12', 1000, 50, 1000)];
    const points = buildNutritionTrend({ days, daysCount: 7 });
    expect(points).toHaveLength(2);
    const summary = summarizeNutritionTrend(points);
    expect(summary.count).toBe(2);
    expect(summary.avgCalories).toBe(1500);
    expect(summary.avgProtein).toBe(100);
    expect(summary.avgWaterMl).toBe(2000);
  });

  it('vazio honesto: sem dias => pontos [] e médias null', () => {
    expect(buildNutritionTrend({ days: [], daysCount: 7 })).toEqual([]);
    expect(summarizeNutritionTrend([])).toEqual({ count: 0, avgCalories: null, avgProtein: null, avgWaterMl: null });
  });

  it('janela inválida falha fechado', () => {
    const days = [makeDay('2026-09-10', 1800, 120, 2000)];
    expect(buildNutritionTrend({ days, daysCount: 5 as never })).toEqual([]);
  });
});
