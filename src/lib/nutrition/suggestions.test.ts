import { describe, expect, it } from 'vitest';
import { CANONICAL_BR_CATALOG } from './food-database';
import { buildNutritionSuggestions } from './suggestions';
import type { DailyActuals } from './ledger-types';
import type { DailyTargets } from './engine-types';

function makeTargets(overrides: Partial<DailyTargets> = {}): DailyTargets {
  return {
    id: 'dt_test',
    engineVersion: '1.0.0',
    formulaVersion: 'mifflin-st-jeor-v1',
    inputSnapshotHash: 'abc',
    computedAt: null,
    computedAtSource: 'absent',
    computedReason: 'profile_update',
    targetCalories: 2500,
    targetProteinGrams: 160,
    targetCarbsGrams: 300,
    targetFatGrams: 70,
    targetWaterMl: 3000,
    bmrKcal: 1700,
    tdeeKcal: 2500,
    energyBalanceKcal: 0,
    scientificStatus: 'PROVISIONAL_PENDING_PROFESSIONAL_REVIEW',
    isLimitedGuidance: false,
    appliedCaloricFloor: 1500,
    effectiveProteinGramsPerKg: 2,
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

describe('NUT-006 suggestions determinísticas (sem IA, sem prescrição)', () => {
  it('com targets: prioriza proteína cabendo no restante e cita origem verificada', () => {
    const actuals: DailyActuals = { calories: 1000, protein: 40, carbs: 100, fat: 20, waterMl: 500 };
    const suggestions = buildNutritionSuggestions({
      catalog: CANONICAL_BR_CATALOG,
      actuals,
      targets: makeTargets(),
      limit: 3,
    });
    expect(suggestions).toHaveLength(3);
    for (const suggestion of suggestions) {
      expect(suggestion.referenceId).toBeTruthy();
      expect(suggestion.grams).toBeGreaterThan(0);
      expect(suggestion.preview.calories).toBeLessThanOrEqual(1500 + 1e-9);
      expect(suggestion.reason).toContain('catálogo verificado');
      expect(suggestion.reason).not.toMatch(/IA|inteligência|prescri/i);
    }
    // Determinístico: mesma entrada, mesma saída e ordem.
    const again = buildNutritionSuggestions({
      catalog: CANONICAL_BR_CATALOG,
      actuals,
      targets: makeTargets(),
      limit: 3,
    });
    expect(again.map((s) => s.referenceId)).toEqual(suggestions.map((s) => s.referenceId));
  });

  it('MANUAL_ONLY (targets null): exemplos honestos sem prometer adequação', () => {
    const actuals: DailyActuals = { calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: 0 };
    const suggestions = buildNutritionSuggestions({ catalog: CANONICAL_BR_CATALOG, actuals, targets: null });
    expect(suggestions).toHaveLength(3);
    for (const suggestion of suggestions) {
      expect(suggestion.reason).toContain('Sem meta ativa');
      expect(suggestion.reason).toContain('Não é prescrição');
    }
  });

  it('catálogo vazio ou sem verificado: [] honesto', () => {
    const actuals: DailyActuals = { calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: 0 };
    expect(buildNutritionSuggestions({ catalog: [], actuals, targets: null })).toEqual([]);
    expect(buildNutritionSuggestions({ catalog: [], actuals, targets: makeTargets() })).toEqual([]);
  });
});
