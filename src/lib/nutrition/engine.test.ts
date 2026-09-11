/**
 * GymFlow AI — Testes Unitários do Motor Nutricional Determinístico (NUT-003)
 *
 * Cobertura exaustiva de determinismo, proveniência SHA-256, equações de BMR (Mifflin-St Jeor),
 * TDEE, travas de segurança calórica, partição de macronutrientes, hidratação e gates ético-clínicos.
 */

import { describe, expect, it, vi } from 'vitest';
import type {
  ActivityLevel,
  BiologicalSexForCalcs,
  DietaryPattern,
  HealthFlag,
  NutritionGoal,
  NutritionProfile,
} from '../../types/nutrition';
import {
  buildInputSnapshot,
  calculateDailyTargets,
  canonicalizeJson,
  canonicalSerialize,
  computeBmr,
  computeHydration,
  computeMacros,
  computeTargetCalories,
  computeTdee,
  resolveCalculationConfig,
  resolveEngineConfig,
  sha256Sync,
} from './engine';
import {
  DEFAULT_CALCULATION_CONFIG,
  DEFAULT_ENGINE_CONFIG,
  ENGINE_CONFIG_KEYS,
  ENGINE_HARD_SAFETY_LIMITS,
  NUTRITION_GOALS,
  EngineConfig,
  MACRO_ROUNDING_TOLERANCE_KCAL,
  NutritionEngineConfigError,
  NutritionEngineGateError,
  NutritionEngineInputError,
  NutritionEngineSerializationError,
} from './engine-types';
import { NUTRITION_GATE_REASONS } from './profile-gates';

/**
 * Captura o erro lançado por `calculateDailyTargets` sem depender de matcher genérico,
 * permitindo asserção sobre o código determinístico da violação.
 */
function captureEngineError(
  profile: NutritionProfile,
  config?: EngineConfig
): NutritionEngineConfigError | NutritionEngineInputError | Error {
  try {
    calculateDailyTargets(profile, config);
  } catch (err) {
    return err as Error;
  }
  throw new Error('calculateDailyTargets deveria ter falhado e não falhou');
}

function violationCodes(err: Error): string[] {
  if (err instanceof NutritionEngineConfigError || err instanceof NutritionEngineInputError) {
    return err.violations.map((v) => v.code);
  }
  return [];
}

function violationFields(err: Error): string[] {
  if (err instanceof NutritionEngineConfigError || err instanceof NutritionEngineInputError) {
    return err.violations.map((v) => v.field);
  }
  return [];
}

function createTestProfile(overrides: Partial<NutritionProfile> = {}): NutritionProfile {
  return {
    age: 30,
    heightCm: 175,
    weightKg: 75,
    biologicalSexForCalcs: 'male',
    goal: 'maintenance',
    trainingFrequencyDaysPerWeek: 4,
    averageTrainingDurationMinutes: 60,
    nonExerciseActivity: 'moderately_active',
    dietaryPattern: 'omnivore',
    mealsPerDayPreference: 4,
    allergies: [],
    intolerances: [],
    avoidedFoods: [],
    healthFlags: [],
    timezone: 'America/Sao_Paulo',
    updatedAt: '2026-09-09T10:00:00.000Z',
    ...overrides,
  };
}

describe('NutritionEngine (NUT-003)', () => {
  // --------------------------------------------------------------------------
  // 1. DETERMINISMO COMPLETO DE OUTPUT
  // --------------------------------------------------------------------------
  it('1. determinismo completo de output: mesmas entradas geram rigorosamente o mesmo resultado', () => {
    const profile = createTestProfile();
    const firstResult = calculateDailyTargets(profile);

    for (let i = 0; i < 100; i++) {
      const result = calculateDailyTargets(profile);
      expect(result).toEqual(firstResult);
      expect(result.id).toBe(firstResult.id);
      expect(result.inputSnapshotHash).toBe(firstResult.inputSnapshotHash);
      expect(result.targetCalories).toBe(firstResult.targetCalories);
      expect(result.targetProteinGrams).toBe(firstResult.targetProteinGrams);
      expect(result.targetCarbsGrams).toBe(firstResult.targetCarbsGrams);
      expect(result.targetFatGrams).toBe(firstResult.targetFatGrams);
      expect(result.targetWaterMl).toBe(firstResult.targetWaterMl);
    }
  });

  // --------------------------------------------------------------------------
  // 2. DETERMINISMO DO SHA-256 (TEST VECTORS FIPS 180-4)
  // --------------------------------------------------------------------------
  describe('2. determinismo do SHA-256', () => {
    it('deve produzir os vetores canônicos padrão do padrão FIPS 180-4', () => {
      // Vetor 1: string vazia
      expect(sha256Sync('')).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      );

      // Vetor 2: "abc"
      expect(sha256Sync('abc')).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
      );

      // Vetor 3: "The quick brown fox jumps over the lazy dog"
      expect(sha256Sync('The quick brown fox jumps over the lazy dog')).toBe(
        'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'
      );
    });

    it('canonicalSerialize não deve depender da ordem de inserção das chaves do objeto', () => {
      const objA = { z: 1, a: 2, m: { b: 3, a: 4 } };
      const objB = { a: 2, m: { a: 4, b: 3 }, z: 1 };
      expect(canonicalSerialize(objA)).toBe(canonicalSerialize(objB));
      expect(sha256Sync(canonicalSerialize(objA))).toBe(sha256Sync(canonicalSerialize(objB)));
    });
  });

  // --------------------------------------------------------------------------
  // 3. MUDANÇA DE INPUT ALTERA HASH
  // --------------------------------------------------------------------------
  it('3. mudança de input altera hash', () => {
    const baseProfile = createTestProfile();
    const baseHash = calculateDailyTargets(baseProfile).inputSnapshotHash;

    const testVariations: Partial<NutritionProfile>[] = [
      { age: baseProfile.age + 1 },
      { weightKg: baseProfile.weightKg + 1 },
      { heightCm: baseProfile.heightCm + 1 },
      { biologicalSexForCalcs: 'female' },
      { biologicalSexForCalcs: 'unspecified' },
      { goal: 'fat_loss_aggressive' },
      { goal: 'hypertrophy_lean' },
      { nonExerciseActivity: 'sedentary' },
      { nonExerciseActivity: 'very_active' },
      { trainingFrequencyDaysPerWeek: 6 },
      { averageTrainingDurationMinutes: 90 },
      { dietaryPattern: 'ketogenic' },
      { dietaryPattern: 'vegan' },
    ];

    for (const variation of testVariations) {
      const modified = createTestProfile(variation);
      const modifiedHash = calculateDailyTargets(modified).inputSnapshotHash;
      expect(modifiedHash).not.toBe(baseHash);
    }

    // Mudança de config também deve alterar o hash
    const modifiedConfigHash = calculateDailyTargets(baseProfile, {
      engineVersion: '1.0.1',
    }).inputSnapshotHash;
    expect(modifiedConfigHash).not.toBe(baseHash);
  });

  // --------------------------------------------------------------------------
  // 4. BMR MASCULINO CONHECIDO
  // --------------------------------------------------------------------------
  it('4. BMR masculino conhecido: Mifflin-St Jeor Homem', () => {
    // 10 * 80 + 6.25 * 180 - 5 * 30 + 5 = 800 + 1125 - 150 + 5 = 1780 kcal
    const profile = createTestProfile({
      biologicalSexForCalcs: 'male',
      weightKg: 80,
      heightCm: 180,
      age: 30,
    });
    const targets = calculateDailyTargets(profile);
    expect(targets.bmrKcal).toBe(1780);
    expect(targets.formulaVersion).toBe('mifflin-st-jeor-v1');
  });

  // --------------------------------------------------------------------------
  // 5. BMR FEMININO CONHECIDO
  // --------------------------------------------------------------------------
  it('5. BMR feminino conhecido: Mifflin-St Jeor Mulher', () => {
    // 10 * 60 + 6.25 * 165 - 5 * 30 - 161 = 600 + 1031.25 - 150 - 161 = 1320.25 -> 1320 kcal
    const profile = createTestProfile({
      biologicalSexForCalcs: 'female',
      weightKg: 60,
      heightCm: 165,
      age: 30,
    });
    const targets = calculateDailyTargets(profile);
    expect(targets.bmrKcal).toBe(1320);
    expect(targets.formulaVersion).toBe('mifflin-st-jeor-v1');
  });

  // --------------------------------------------------------------------------
  // 6. UNSPECIFIED NÃO USA FALLBACK MASCULINO
  // --------------------------------------------------------------------------
  it('6. unspecified não usa fallback masculino: respeita LIMITED_GUIDANCE e não aplica piso masculino', () => {
    const maleProfile = createTestProfile({
      biologicalSexForCalcs: 'male',
      weightKg: 80,
      heightCm: 180,
      age: 30,
      goal: 'fat_loss_aggressive',
    });
    const unspecifiedProfile = createTestProfile({
      biologicalSexForCalcs: 'unspecified',
      weightKg: 80,
      heightCm: 180,
      age: 30,
      goal: 'fat_loss_aggressive',
    });

    const maleTargets = calculateDailyTargets(maleProfile);
    const unspecTargets = calculateDailyTargets(unspecifiedProfile);

    // BMR unspecified não pode ser idêntico ao masculino (1780)
    // 10 * 80 + 6.25 * 180 - 5 * 30 - 78 = 1697
    expect(unspecTargets.bmrKcal).toBe(1697);
    expect(unspecTargets.bmrKcal).not.toBe(maleTargets.bmrKcal);

    // Deve emitir flag de limited guidance
    expect(unspecTargets.isLimitedGuidance).toBe(true);

    // Piso de segurança de unspecified é 1200 kcal, NUNCA o piso masculino de 1500 kcal
    expect(unspecTargets.appliedCaloricFloor).toBe(1200);
    expect(unspecTargets.appliedCaloricFloor).not.toBe(1500);
  });

  // --------------------------------------------------------------------------
  // 7. GATE BLOQUEADO NÃO GERA TARGETS AUTOMÁTICOS
  // --------------------------------------------------------------------------
  describe('7. gate bloqueado não gera targets automáticos (BLOCK_AUTOMATIC_TARGET)', () => {
    it('deve lançar NutritionEngineGateError para menor de idade (< 18 anos)', () => {
      const profile = createTestProfile({ age: 17 });
      expect(() => calculateDailyTargets(profile)).toThrow(NutritionEngineGateError);

      try {
        calculateDailyTargets(profile);
      } catch (err) {
        expect(err).toBeInstanceOf(NutritionEngineGateError);
        const gateErr = err as NutritionEngineGateError;
        expect(gateErr.code).toBe('NUTRITION_GATE_BLOCKED');
        expect(gateErr.gateResult.status).toBe('BLOCK_AUTOMATIC_TARGET');
        expect(gateErr.gateResult.reasons).toContain(NUTRITION_GATE_REASONS.UNDERAGE);
      }
    });

    it('deve lançar NutritionEngineGateError para gestação', () => {
      const profile = createTestProfile({ healthFlags: ['pregnancy'] });
      expect(() => calculateDailyTargets(profile)).toThrow(NutritionEngineGateError);
    });

    it('deve lançar NutritionEngineGateError para lactação', () => {
      const profile = createTestProfile({ healthFlags: ['lactation'] });
      expect(() => calculateDailyTargets(profile)).toThrow(NutritionEngineGateError);
    });

    it('deve lançar NutritionEngineGateError para doença renal crônica', () => {
      const profile = createTestProfile({ healthFlags: ['chronic_kidney_disease'] });
      expect(() => calculateDailyTargets(profile)).toThrow(NutritionEngineGateError);
    });
  });

  // --------------------------------------------------------------------------
  // 8. PROFESSIONAL REFERRAL NÃO GERA TARGETS AUTOMÁTICOS
  // --------------------------------------------------------------------------
  describe('8. professional referral não gera targets automáticos', () => {
    it('deve lançar NutritionEngineGateError para histórico de transtorno alimentar', () => {
      const profile = createTestProfile({ healthFlags: ['eating_disorder_history'] });
      expect(() => calculateDailyTargets(profile)).toThrow(NutritionEngineGateError);

      try {
        calculateDailyTargets(profile);
      } catch (err) {
        const gateErr = err as NutritionEngineGateError;
        expect(gateErr.gateResult.status).toBe('PROFESSIONAL_REFERRAL');
        expect(gateErr.gateResult.allowAutomatedTargets).toBe(false);
      }
    });

    it('deve lançar NutritionEngineGateError para diabetes tipo 1', () => {
      const profile = createTestProfile({ healthFlags: ['type_1_diabetes'] });
      expect(() => calculateDailyTargets(profile)).toThrow(NutritionEngineGateError);
    });

    it('deve lançar NutritionEngineGateError para diabetes tipo 2 descompensado', () => {
      const profile = createTestProfile({ healthFlags: ['type_2_diabetes_uncontrolled'] });
      expect(() => calculateDailyTargets(profile)).toThrow(NutritionEngineGateError);
    });

    it('deve lançar NutritionEngineGateError para cardiopatia severa', () => {
      const profile = createTestProfile({ healthFlags: ['severe_cardiovascular_condition'] });
      expect(() => calculateDailyTargets(profile)).toThrow(NutritionEngineGateError);
    });
  });

  // --------------------------------------------------------------------------
  // 9. ADULTO NORMAL_FLOW GERA TARGETS
  // --------------------------------------------------------------------------
  it('9. adulto NORMAL_FLOW gera targets completos com metadados provisórios', () => {
    const profile = createTestProfile({
      age: 28,
      biologicalSexForCalcs: 'male',
      weightKg: 78,
      heightCm: 180,
      healthFlags: [],
    });

    const targets = calculateDailyTargets(profile);

    expect(targets.id).toMatch(/^dt_[0-9a-f]{16}$/);
    expect(targets.engineVersion).toBe('1.0.0');
    expect(targets.formulaVersion).toBe('mifflin-st-jeor-v1');
    expect(targets.scientificStatus).toBe('PROVISIONAL_PENDING_PROFESSIONAL_REVIEW');
    expect(targets.targetCalories).toBeGreaterThan(1500);
    expect(targets.targetProteinGrams).toBeGreaterThan(0);
    expect(targets.targetCarbsGrams).toBeGreaterThan(0);
    expect(targets.targetFatGrams).toBeGreaterThan(0);
    expect(targets.targetWaterMl).toBeGreaterThan(2000);
  });

  // --------------------------------------------------------------------------
  // 10. TODOS OS ACTIVITYLEVEL
  // --------------------------------------------------------------------------
  it('10. todos os ActivityLevel geram targets e TDEE escala monotonicamente', () => {
    const levels: ActivityLevel[] = [
      'sedentary',
      'lightly_active',
      'moderately_active',
      'very_active',
    ];

    const tdees: number[] = [];

    for (const level of levels) {
      const profile = createTestProfile({
        nonExerciseActivity: level,
        trainingFrequencyDaysPerWeek: 0,
      });
      const targets = calculateDailyTargets(profile);
      expect(Number.isFinite(targets.tdeeKcal)).toBe(true);
      expect(targets.tdeeKcal).toBeGreaterThan(0);
      tdees.push(targets.tdeeKcal);
    }

    // TDEE deve crescer estritamente do sedentário ao muito ativo
    for (let i = 1; i < tdees.length; i++) {
      expect(tdees[i]).toBeGreaterThan(tdees[i - 1]);
    }
  });

  // --------------------------------------------------------------------------
  // 11. TODOS OS NUTRITIONGOAL
  // --------------------------------------------------------------------------
  it('11. todos os NutritionGoal operam com seus respectivos balanços energéticos', () => {
    const goals: NutritionGoal[] = [
      'fat_loss_aggressive',
      'fat_loss_moderate',
      'maintenance',
      'hypertrophy_lean',
      'hypertrophy_aggressive',
      'strength_performance',
    ];

    for (const goal of goals) {
      const profile = createTestProfile({ goal });
      const targets = calculateDailyTargets(profile);
      expect(Number.isFinite(targets.targetCalories)).toBe(true);

      if (goal === 'fat_loss_aggressive' || goal === 'fat_loss_moderate') {
        expect(targets.energyBalanceKcal).toBeLessThan(0);
      } else if (goal === 'maintenance') {
        expect(targets.energyBalanceKcal).toBe(0);
      } else {
        expect(targets.energyBalanceKcal).toBeGreaterThan(0);
      }
    }
  });

  // --------------------------------------------------------------------------
  // 12. DÉFICIT NUNCA > 750 KCAL
  // --------------------------------------------------------------------------
  it('12. déficit nunca > 750 kcal: mesmo com ajuste extremo configurado', () => {
    const profile = createTestProfile({
      goal: 'fat_loss_aggressive',
      weightKg: 95,
      heightCm: 185,
    });

    // Ajuste configurado de -1200 kcal está fora do envelope: rejeitado, não clampeado.
    const outOfEnvelope: EngineConfig = {
      goalAdjustments: {
        fat_loss_aggressive: -1200,
        fat_loss_moderate: -500,
        maintenance: 0,
        hypertrophy_lean: 200,
        hypertrophy_aggressive: 400,
        strength_performance: 150,
      },
      maxAbsoluteDeficitKcal: 750,
    };
    const err = captureEngineError(profile, outOfEnvelope);
    expect(err).toBeInstanceOf(NutritionEngineConfigError);
    expect(violationFields(err)).toContain('goalAdjustments.fat_loss_aggressive');
    expect(violationCodes(err)).toContain('BELOW_HARD_LIMIT');

    // No limite do envelope o cálculo prossegue e o déficit efetivo respeita 750 kcal.
    const atEnvelope: EngineConfig = {
      goalAdjustments: {
        fat_loss_aggressive: -750,
        fat_loss_moderate: -500,
        maintenance: 0,
        hypertrophy_lean: 200,
        hypertrophy_aggressive: 400,
        strength_performance: 150,
      },
      maxAbsoluteDeficitKcal: 750,
    };
    const targets = calculateDailyTargets(profile, atEnvelope);
    const actualDeficit = targets.tdeeKcal - targets.targetCalories;

    expect(actualDeficit).toBeLessThanOrEqual(750);
  });

  // --------------------------------------------------------------------------
  // 13. PISO FEMININO DE 1200 KCAL
  // --------------------------------------------------------------------------
  it('13. piso feminino de 1200 kcal: target nunca abaixo de 1200 kcal', () => {
    const profile = createTestProfile({
      biologicalSexForCalcs: 'female',
      weightKg: 45,
      heightCm: 150,
      age: 40,
      goal: 'fat_loss_aggressive',
      nonExerciseActivity: 'sedentary',
      trainingFrequencyDaysPerWeek: 0,
      averageTrainingDurationMinutes: 0,
    });

    const targets = calculateDailyTargets(profile);
    expect(targets.targetCalories).toBeGreaterThanOrEqual(1200);
    expect(targets.appliedCaloricFloor).toBe(1200);
  });

  // --------------------------------------------------------------------------
  // 14. PISO MASCULINO DE 1500 KCAL
  // --------------------------------------------------------------------------
  it('14. piso masculino de 1500 kcal: target nunca abaixo de 1500 kcal', () => {
    const profile = createTestProfile({
      biologicalSexForCalcs: 'male',
      weightKg: 50,
      heightCm: 160,
      age: 40,
      goal: 'fat_loss_aggressive',
      nonExerciseActivity: 'sedentary',
      trainingFrequencyDaysPerWeek: 0,
      averageTrainingDurationMinutes: 0,
    });

    const targets = calculateDailyTargets(profile);
    expect(targets.targetCalories).toBeGreaterThanOrEqual(1500);
    expect(targets.appliedCaloricFloor).toBe(1500);
  });

  // --------------------------------------------------------------------------
  // 15. PROTEÇÃO BMR * 0.9
  // --------------------------------------------------------------------------
  it('15. proteção BMR * 0.9: target em déficit não desce abaixo de BMR * 0.9', () => {
    const profile = createTestProfile({
      biologicalSexForCalcs: 'male',
      weightKg: 85,
      heightCm: 180,
      age: 25,
      goal: 'fat_loss_aggressive',
      nonExerciseActivity: 'sedentary',
      trainingFrequencyDaysPerWeek: 0,
    });

    const targets = calculateDailyTargets(profile);
    const minSafeCal = Math.round(targets.bmrKcal * 0.9);

    expect(targets.targetCalories).toBeGreaterThanOrEqual(minSafeCal);
  });

  // --------------------------------------------------------------------------
  // 16. PROTEÍNA NUNCA < 1.6 G/KG
  // --------------------------------------------------------------------------
  it('16. proteína nunca < 1.6 g/kg em qualquer objetivo automático', () => {
    const goals: NutritionGoal[] = [
      'fat_loss_aggressive',
      'fat_loss_moderate',
      'maintenance',
      'hypertrophy_lean',
      'hypertrophy_aggressive',
      'strength_performance',
    ];

    for (const goal of goals) {
      const profile = createTestProfile({ goal, weightKg: 70 });
      const targets = calculateDailyTargets(profile);
      const proteinRate = targets.targetProteinGrams / profile.weightKg;
      expect(proteinRate).toBeGreaterThanOrEqual(1.6 - 0.02); // tolerância de arredondamento
    }
  });

  // --------------------------------------------------------------------------
  // 17. PROTEÍNA NUNCA > 2.2 G/KG
  // --------------------------------------------------------------------------
  it('17. proteína acima de 2.2 g/kg é rejeitada, não clampeada silenciosamente (D-NUT-04)', () => {
    const profile = createTestProfile({
      goal: 'fat_loss_aggressive',
      weightKg: 80,
    });

    // Tentativa de configurar 2.8 g/kg no config: fail-closed, sem clamp silencioso
    const customConfig: EngineConfig = {
      proteinGramsPerKgByGoal: {
        fat_loss_aggressive: 2.8,
        fat_loss_moderate: 2.0,
        maintenance: 1.8,
        hypertrophy_lean: 1.8,
        hypertrophy_aggressive: 1.7,
        strength_performance: 1.9,
      },
      maxProteinGramsPerKg: 2.2,
    };

    expect(() => calculateDailyTargets(profile, customConfig)).toThrow(NutritionEngineConfigError);
    const err = captureEngineError(profile, customConfig);
    expect(violationFields(err)).toContain('proteinGramsPerKgByGoal.fat_loss_aggressive');
    expect(violationCodes(err)).toContain('ABOVE_RANGE');

    // Com a taxa dentro da faixa permitida, o alvo permanece abaixo do teto duro de 2.2 g/kg
    const validTargets = calculateDailyTargets(profile);
    expect(validTargets.targetProteinGrams / profile.weightKg).toBeLessThanOrEqual(2.2);
  });

  // --------------------------------------------------------------------------
  // 18. CARBOIDRATOS DERIVADOS CORRETAMENTE
  // --------------------------------------------------------------------------
  it('18. carboidratos derivados corretamente pelo saldo energético', () => {
    const profile = createTestProfile({
      dietaryPattern: 'omnivore',
      weightKg: 75,
    });
    const targets = calculateDailyTargets(profile);

    const proteinCalories = targets.targetProteinGrams * 4;
    const fatCalories = targets.targetFatGrams * 9;
    const carbsCalories = targets.targetCarbsGrams * 4;
    const totalMacroCalories = proteinCalories + fatCalories + carbsCalories;

    // Tolerância real declarada pelo contrato: o macro residual em dieta não cetogênica
    // é o carboidrato, logo meio grama = 2 kcal. Nada de folga genérica.
    expect(targets.macroReconciliation.roundingToleranceKcal).toBe(
      MACRO_ROUNDING_TOLERANCE_KCAL.CARBS_RESIDUAL
    );
    expect(Math.abs(totalMacroCalories - targets.targetCalories)).toBeLessThanOrEqual(
      MACRO_ROUNDING_TOLERANCE_KCAL.CARBS_RESIDUAL
    );
    expect(targets.macroReconciliation.isReconciled).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 19. KETOGENIC NÃO RECEBE PISO NÃO CETOGÊNICO INDEVIDO
  // --------------------------------------------------------------------------
  it('19. ketogenic não recebe piso não cetogênico indevido (carbo ~30g, não 120g)', () => {
    const profileKeto = createTestProfile({
      dietaryPattern: 'ketogenic',
      weightKg: 80,
    });
    const targets = calculateDailyTargets(profileKeto);

    // Deve estar na faixa cetogênica controlada (~30g) e não no piso não-keto (120g)
    expect(targets.targetCarbsGrams).toBeLessThanOrEqual(45);
    expect(targets.targetFatGrams).toBeGreaterThan(targets.targetProteinGrams);
  });

  // --------------------------------------------------------------------------
  // 20. HIDRATAÇÃO BASE 35 ML/KG
  // --------------------------------------------------------------------------
  it('20. hidratação base 35 ml/kg quando sem treinos', () => {
    const profile = createTestProfile({
      weightKg: 80,
      trainingFrequencyDaysPerWeek: 0,
      averageTrainingDurationMinutes: 0,
    });
    const targets = calculateDailyTargets(profile);

    // 35 ml * 80 kg = 2800 ml
    expect(targets.targetWaterMl).toBe(2800);
  });

  // --------------------------------------------------------------------------
  // 21. HIDRATAÇÃO AUTOMÁTICA <= 4500 ML
  // --------------------------------------------------------------------------
  it('21. hidratação automática <= 4500 ml: teto preventivo de hiponatremia', () => {
    // Indivíduo pesado com treino diário intenso
    const profileHeavyAthlete = createTestProfile({
      weightKg: 130, // base 4550 ml sozinha
      trainingFrequencyDaysPerWeek: 7,
      averageTrainingDurationMinutes: 120,
    });

    const targets = calculateDailyTargets(profileHeavyAthlete);
    expect(targets.targetWaterMl).toBe(4500);
  });

  // --------------------------------------------------------------------------
  // 22. BAIXO PESO
  // --------------------------------------------------------------------------
  it('22. baixo peso: indivíduo com IMC < 18.5 recebe metas seguras e finitas', () => {
    const underweightProfile = createTestProfile({
      weightKg: 42,
      heightCm: 168,
      age: 22,
      biologicalSexForCalcs: 'female',
    });

    const targets = calculateDailyTargets(underweightProfile);
    expect(targets.targetCalories).toBeGreaterThanOrEqual(1200);
    expect(Number.isFinite(targets.targetCalories)).toBe(true);
    expect(targets.targetProteinGrams).toBeGreaterThanOrEqual(67);
  });

  // --------------------------------------------------------------------------
  // 23. OBESIDADE
  // --------------------------------------------------------------------------
  it('23. obesidade: indivíduo com IMC elevado recebe metas finitas e seguras', () => {
    const obeseProfile = createTestProfile({
      weightKg: 140,
      heightCm: 175,
      age: 35,
      biologicalSexForCalcs: 'male',
      goal: 'fat_loss_moderate',
    });

    const targets = calculateDailyTargets(obeseProfile);
    expect(Number.isFinite(targets.targetCalories)).toBe(true);
    expect(targets.targetProteinGrams).toBeLessThanOrEqual(140 * 2.2 + 2);
    expect(targets.targetWaterMl).toBeLessThanOrEqual(4500);
  });

  // --------------------------------------------------------------------------
  // 24. IDOSO
  // --------------------------------------------------------------------------
  it('24. idoso: indivíduo de 75 anos recebe cálculo seguro e finito', () => {
    const seniorProfile = createTestProfile({
      age: 75,
      weightKg: 68,
      heightCm: 165,
      biologicalSexForCalcs: 'female',
    });

    const targets = calculateDailyTargets(seniorProfile);
    expect(Number.isFinite(targets.targetCalories)).toBe(true);
    expect(targets.targetCalories).toBeGreaterThanOrEqual(1200);
  });

  // --------------------------------------------------------------------------
  // 25. ATLETA / ALTA FREQUÊNCIA
  // --------------------------------------------------------------------------
  it('25. atleta / alta frequência: 7 dias/semana e 90 min/sessão', () => {
    const athleteProfile = createTestProfile({
      trainingFrequencyDaysPerWeek: 7,
      averageTrainingDurationMinutes: 90,
      nonExerciseActivity: 'very_active',
      goal: 'hypertrophy_aggressive',
      weightKg: 85,
    });

    const targets = calculateDailyTargets(athleteProfile);
    expect(targets.tdeeKcal).toBeGreaterThan(targets.bmrKcal * 1.7);
    expect(targets.targetCalories).toBeGreaterThan(targets.tdeeKcal);
    expect(targets.targetWaterMl).toBeGreaterThan(3500);
  });

  // --------------------------------------------------------------------------
  // 26. ALTURAS LIMÍTROFES VÁLIDAS
  // --------------------------------------------------------------------------
  it('26. alturas limítrofes válidas: 100 cm e 250 cm produzem saídas válidas', () => {
    const shortProfile = createTestProfile({ heightCm: 100 });
    const tallProfile = createTestProfile({ heightCm: 250 });

    const shortTargets = calculateDailyTargets(shortProfile);
    const tallTargets = calculateDailyTargets(tallProfile);

    expect(Number.isFinite(shortTargets.targetCalories)).toBe(true);
    expect(Number.isFinite(tallTargets.targetCalories)).toBe(true);
    expect(tallTargets.bmrKcal).toBeGreaterThan(shortTargets.bmrKcal);
  });

  // --------------------------------------------------------------------------
  // 27. NENHUMA SAÍDA NAN/INFINITY
  // --------------------------------------------------------------------------
  it('27. nenhuma saída NaN/Infinity em dezenas de combinações biométricas', () => {
    const testWeights = [35, 60, 90, 130, 200];
    const testHeights = [110, 150, 175, 200, 240];
    const testAges = [18, 30, 50, 80];
    const testSexes: BiologicalSexForCalcs[] = ['female', 'male', 'unspecified'];

    for (const weightKg of testWeights) {
      for (const heightCm of testHeights) {
        for (const age of testAges) {
          for (const biologicalSexForCalcs of testSexes) {
            const profile = createTestProfile({
              weightKg,
              heightCm,
              age,
              biologicalSexForCalcs,
            });

            const targets = calculateDailyTargets(profile);

            expect(Number.isFinite(targets.targetCalories)).toBe(true);
            expect(Number.isFinite(targets.targetProteinGrams)).toBe(true);
            expect(Number.isFinite(targets.targetCarbsGrams)).toBe(true);
            expect(Number.isFinite(targets.targetFatGrams)).toBe(true);
            expect(Number.isFinite(targets.targetWaterMl)).toBe(true);
            expect(Number.isFinite(targets.bmrKcal)).toBe(true);
            expect(Number.isFinite(targets.tdeeKcal)).toBe(true);
            expect(Number.isFinite(targets.energyBalanceKcal)).toBe(true);

            expect(targets.targetCalories).toBeGreaterThan(0);
            expect(targets.targetProteinGrams).toBeGreaterThanOrEqual(0);
            expect(targets.targetCarbsGrams).toBeGreaterThanOrEqual(0);
            expect(targets.targetFatGrams).toBeGreaterThanOrEqual(0);
            expect(targets.targetWaterMl).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  // --------------------------------------------------------------------------
  // 28. PROFILE E CONFIG NÃO SÃO MUTADOS
  // --------------------------------------------------------------------------
  it('28. profile e config não são mutados (Object.freeze de entrada)', () => {
    const frozenProfile = Object.freeze(
      createTestProfile({
        allergies: Object.freeze(['amendoim']) as unknown as string[],
        healthFlags: Object.freeze([]) as unknown as HealthFlag[],
      })
    );
    const frozenConfig = Object.freeze({
      engineVersion: '1.0.0',
      formulaVersion: 'mifflin-st-jeor-v1',
    });

    expect(() => calculateDailyTargets(frozenProfile, frozenConfig)).not.toThrow();
  });

  // --------------------------------------------------------------------------
  // 29. ENGINE NÃO DEPENDE DO RELÓGIO
  // --------------------------------------------------------------------------
  it('29. engine não depende do relógio do sistema para o cálculo', () => {
    const profile = createTestProfile({
      updatedAt: '2026-09-09T08:00:00.000Z',
    });

    // Mock Date.now para simular diferentes instantes
    const realDateNow = Date.now;
    try {
      Date.now = () => 1000;
      const resA = calculateDailyTargets(profile);

      Date.now = () => 999999999;
      const resB = calculateDailyTargets(profile);

      expect(resA).toEqual(resB);

      // Sem instante explícito, o motor NÃO inventa data: nem relógio, nem profile.updatedAt
      expect(resA.computedAt).toBeNull();
      expect(resA.computedAtSource).toBe('absent');
      expect(resA.computedAt).not.toBe(profile.updatedAt);
    } finally {
      Date.now = realDateNow;
    }
  });

  // --------------------------------------------------------------------------
  // 30. ENGINE NÃO DEPENDE DE ALEATORIEDADE
  // --------------------------------------------------------------------------
  it('30. engine não depende de aleatoriedade (Math.random não é chamado)', () => {
    const randomSpy = vi.spyOn(Math, 'random');
    const profile = createTestProfile();

    calculateDailyTargets(profile);

    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });

  // ==========================================================================
  // REGRESSÕES CORRETIVAS (revisão 063) — HARD SAFETY, PROVENIÊNCIA E MACROS
  // ==========================================================================

  // --------------------------------------------------------------------------
  // 31. INVARIANTES ABSOLUTOS NÃO SÃO AJUSTÁVEIS POR CONFIG
  // --------------------------------------------------------------------------
  describe('31. hard safety: EngineConfig não ultrapassa invariantes absolutos', () => {
    it('rejeita maxAbsoluteDeficitKcal acima de 750 kcal e aceita exatamente 750', () => {
      const profile = createTestProfile();

      const err = captureEngineError(profile, { maxAbsoluteDeficitKcal: 751 });
      expect(err).toBeInstanceOf(NutritionEngineConfigError);
      expect(violationFields(err)).toContain('maxAbsoluteDeficitKcal');
      expect(violationCodes(err)).toContain('ABOVE_HARD_LIMIT');

      expect(() =>
        calculateDailyTargets(profile, { maxAbsoluteDeficitKcal: 750 })
      ).not.toThrow();
      expect(() => calculateDailyTargets(profile, { maxAbsoluteDeficitKcal: 0 })).toThrow(
        NutritionEngineConfigError
      );
    });

    it('rejeita ajuste extremo configurado em vez de clampear silenciosamente', () => {
      const profile = createTestProfile({ goal: 'fat_loss_aggressive' });
      const err = captureEngineError(profile, {
        goalAdjustments: {
          fat_loss_aggressive: -5000,
          fat_loss_moderate: -4000,
          maintenance: 0,
          hypertrophy_lean: 200,
          hypertrophy_aggressive: 400,
          strength_performance: 150,
        },
      });
      expect(err).toBeInstanceOf(NutritionEngineConfigError);
      expect(violationFields(err)).toContain('goalAdjustments.fat_loss_aggressive');
      expect(violationFields(err)).toContain('goalAdjustments.fat_loss_moderate');
      expect(violationCodes(err)).toContain('BELOW_HARD_LIMIT');
    });

    it('déficit efetivo nunca passa de 750 kcal no limite do envelope', () => {
      const extremeConfig: EngineConfig = {
        goalAdjustments: {
          fat_loss_aggressive: -750,
          fat_loss_moderate: -750,
          maintenance: 0,
          hypertrophy_lean: 200,
          hypertrophy_aggressive: 400,
          strength_performance: 150,
        },
      };

      const sexes: BiologicalSexForCalcs[] = ['female', 'male', 'unspecified'];
      for (const biologicalSexForCalcs of sexes) {
        for (const weightKg of [55, 80, 120, 180]) {
          for (const goal of ['fat_loss_aggressive', 'fat_loss_moderate'] as NutritionGoal[]) {
            const profile = createTestProfile({ biologicalSexForCalcs, weightKg, goal });
            const targets = calculateDailyTargets(profile, extremeConfig);
            expect(targets.tdeeKcal - targets.targetCalories).toBeLessThanOrEqual(750);
          }
        }
      }
    });

    it('rejeita minBmrMultiplierInDeficit abaixo de 0.90 ou acima de 1.00', () => {
      const profile = createTestProfile();

      const low = captureEngineError(profile, { minBmrMultiplierInDeficit: 0.89 });
      expect(low).toBeInstanceOf(NutritionEngineConfigError);
      expect(violationFields(low)).toContain('minBmrMultiplierInDeficit');
      expect(violationCodes(low)).toContain('BELOW_HARD_LIMIT');

      const high = captureEngineError(profile, { minBmrMultiplierInDeficit: 1.01 });
      expect(violationCodes(high)).toContain('ABOVE_HARD_LIMIT');

      expect(() =>
        calculateDailyTargets(profile, { minBmrMultiplierInDeficit: 0.9 })
      ).not.toThrow();
    });

    it('pisos calóricos deixaram de ser overrides públicos e são rejeitados como chave', () => {
      const profile = createTestProfile();

      for (const key of [
        'femaleCaloricFloorKcal',
        'maleCaloricFloorKcal',
        'unspecifiedCaloricFloorKcal',
      ]) {
        for (const value of [1199, 1200, 1500, 100000]) {
          const err = captureEngineError(profile, {
            [key]: value,
          } as unknown as EngineConfig);
          expect(err).toBeInstanceOf(NutritionEngineConfigError);
          expect(violationFields(err)).toContain(key);
          expect(violationCodes(err)).toContain('UNKNOWN_CONFIG_KEY');
        }
      }
    });

    it('pisos canônicos continuam vigentes como invariantes internos', () => {
      expect(ENGINE_HARD_SAFETY_LIMITS.FEMALE_CALORIC_FLOOR_KCAL).toBe(1200);
      expect(ENGINE_HARD_SAFETY_LIMITS.MALE_CALORIC_FLOOR_KCAL).toBe(1500);
      expect(ENGINE_HARD_SAFETY_LIMITS.UNSPECIFIED_CALORIC_FLOOR_KCAL).toBe(1200);

      const female = calculateDailyTargets(
        createTestProfile({ biologicalSexForCalcs: 'female' })
      );
      const male = calculateDailyTargets(createTestProfile({ biologicalSexForCalcs: 'male' }));
      const unspecified = calculateDailyTargets(
        createTestProfile({ biologicalSexForCalcs: 'unspecified' })
      );
      expect(female.appliedCaloricFloor).toBe(1200);
      expect(male.appliedCaloricFloor).toBe(1500);
      expect(unspecified.appliedCaloricFloor).toBe(1200);
    });

    it('proíbe estruturalmente que unspecified herde o piso masculino (D-NUT-02)', () => {
      // Com pisos constantes, D-NUT-02 deixa de depender de uma regra relativa por analogia:
      // a separação é estrutural e verificável diretamente sobre os invariantes.
      expect(ENGINE_HARD_SAFETY_LIMITS.UNSPECIFIED_CALORIC_FLOOR_KCAL).toBeLessThan(
        ENGINE_HARD_SAFETY_LIMITS.MALE_CALORIC_FLOOR_KCAL
      );

      const unspecified = calculateDailyTargets(
        createTestProfile({ biologicalSexForCalcs: 'unspecified' })
      );
      const male = calculateDailyTargets(createTestProfile({ biologicalSexForCalcs: 'male' }));
      expect(unspecified.appliedCaloricFloor).toBeLessThan(male.appliedCaloricFloor);
      expect(unspecified.isLimitedGuidance).toBe(true);
    });

    it('proíbe que o offset de BMR unspecified adote o offset masculino (+5)', () => {
      const profile = createTestProfile({ biologicalSexForCalcs: 'unspecified' });

      const maleDefault = captureEngineError(profile, { bmrUnspecifiedOffset: 5 });
      expect(violationCodes(maleDefault)).toContain('MALE_DEFAULT_FORBIDDEN');

      const belowFemale = captureEngineError(profile, { bmrUnspecifiedOffset: -200 });
      expect(violationCodes(belowFemale)).toContain('BELOW_HARD_LIMIT');
    });

    it('rejeita proteína máxima acima de 2.2 g/kg', () => {
      const profile = createTestProfile();
      const err = captureEngineError(profile, { maxProteinGramsPerKg: 2.21 });

      expect(err).toBeInstanceOf(NutritionEngineConfigError);
      expect(violationFields(err)).toContain('maxProteinGramsPerKg');
      expect(violationCodes(err)).toContain('ABOVE_HARD_LIMIT');
    });

    it('rejeita PAL fora da faixa canônica vigente (1.2 a 1.75)', () => {
      const profile = createTestProfile();

      const above = captureEngineError(profile, {
        palFactors: {
          sedentary: 1.2,
          lightly_active: 1.375,
          moderately_active: 1.55,
          very_active: 1.76,
        },
      });
      expect(violationFields(above)).toContain('palFactors.very_active');
      expect(violationCodes(above)).toContain('ABOVE_HARD_LIMIT');

      const below = captureEngineError(profile, {
        palFactors: {
          sedentary: 1.0,
          lightly_active: 1.375,
          moderately_active: 1.55,
          very_active: 1.725,
        },
      });
      expect(violationFields(below)).toContain('palFactors.sedentary');
      expect(violationCodes(below)).toContain('BELOW_HARD_LIMIT');

      expect(() =>
        calculateDailyTargets(profile, {
          palFactors: {
            sedentary: 1.2,
            lightly_active: 1.375,
            moderately_active: 1.55,
            very_active: 1.75,
          },
        })
      ).not.toThrow();
    });

    it('rejeita hidratação máxima acima de 4500 ml/dia e piso acima do teto', () => {
      const profile = createTestProfile();

      const above = captureEngineError(profile, { maxHydrationMlPerDay: 4501 });
      expect(violationFields(above)).toContain('maxHydrationMlPerDay');
      expect(violationCodes(above)).toContain('ABOVE_HARD_LIMIT');

      const inverted = captureEngineError(profile, {
        minHydrationMlPerDay: 4000,
        maxHydrationMlPerDay: 3000,
      });
      expect(violationCodes(inverted)).toContain('INCONSISTENT_RANGE');
    });
  });

  // --------------------------------------------------------------------------
  // 32. VALIDAÇÃO NUMÉRICA CONTROLADA (NaN / Infinity / NEGATIVOS / ENUM)
  // --------------------------------------------------------------------------
  describe('32. validação numérica fail-closed', () => {
    it('rejeita NaN, Infinity e -Infinity em parâmetros de config', () => {
      const profile = createTestProfile();

      for (const invalid of [NaN, Infinity, -Infinity]) {
        const err = captureEngineError(profile, { trainingKcalPerMinute: invalid });
        expect(err).toBeInstanceOf(NutritionEngineConfigError);
        expect(violationFields(err)).toContain('trainingKcalPerMinute');
        expect(violationCodes(err)).toContain('NOT_FINITE');
      }

      const negativeHydration = captureEngineError(profile, { baseHydrationMlPerKg: -35 });
      expect(violationCodes(negativeHydration)).toContain('NEGATIVE');
    });

    it('rejeita config aninhado inválido (PAL nulo ou com chave desconhecida)', () => {
      const profile = createTestProfile();

      const nullPal = captureEngineError(profile, {
        palFactors: null as unknown as Record<ActivityLevel, number>,
      });
      expect(violationCodes(nullPal)).toContain('INVALID_NESTED_CONFIG');

      const unknownKey = captureEngineError(profile, {
        palFactors: {
          sedentary: 1.2,
          lightly_active: 1.375,
          moderately_active: 1.55,
          very_active: 1.725,
          hyperactive: 2.5,
        } as unknown as Record<ActivityLevel, number>,
      });
      expect(violationCodes(unknownKey)).toContain('UNKNOWN_NESTED_KEY');

      const nanPal = captureEngineError(profile, {
        palFactors: {
          sedentary: NaN,
          lightly_active: 1.375,
          moderately_active: 1.55,
          very_active: 1.725,
        },
      });
      expect(violationFields(nanPal)).toContain('palFactors.sedentary');
      expect(violationCodes(nanPal)).toContain('NOT_FINITE');
    });

    it('rejeita números inválidos do perfil que antes vazavam NaN para o output', () => {
      const nanFrequency = captureEngineError(
        createTestProfile({ trainingFrequencyDaysPerWeek: NaN })
      );
      expect(nanFrequency).toBeInstanceOf(NutritionEngineInputError);
      expect(violationFields(nanFrequency)).toContain('profile.trainingFrequencyDaysPerWeek');
      expect(violationCodes(nanFrequency)).toContain('NOT_FINITE');

      const infiniteDuration = captureEngineError(
        createTestProfile({ averageTrainingDurationMinutes: Infinity })
      );
      expect(violationCodes(infiniteDuration)).toContain('NOT_FINITE');

      const negativeDuration = captureEngineError(
        createTestProfile({ averageTrainingDurationMinutes: -30 })
      );
      expect(violationCodes(negativeDuration)).toContain('NEGATIVE');

      const impossibleFrequency = captureEngineError(
        createTestProfile({ trainingFrequencyDaysPerWeek: 8 })
      );
      expect(violationCodes(impossibleFrequency)).toContain('ABOVE_HARD_LIMIT');
    });

    it('rejeita enumerações fora do contrato em vez de aplicar default oculto', () => {
      const badActivity = captureEngineError(
        createTestProfile({
          nonExerciseActivity: 'hyperactive' as unknown as ActivityLevel,
        })
      );
      expect(badActivity).toBeInstanceOf(NutritionEngineInputError);
      expect(violationFields(badActivity)).toContain('profile.nonExerciseActivity');
      expect(violationCodes(badActivity)).toContain('INVALID_ENUM');

      const badGoal = captureEngineError(
        createTestProfile({ goal: 'recomposition' as unknown as NutritionGoal })
      );
      expect(violationFields(badGoal)).toContain('profile.goal');

      const badPattern = captureEngineError(
        createTestProfile({ dietaryPattern: 'carnivore' as unknown as DietaryPattern })
      );
      expect(violationFields(badPattern)).toContain('profile.dietaryPattern');
    });

    it('nunca retorna DailyTargets com número não finito ou hidratação negativa', () => {
      const configs: EngineConfig[] = [
        {},
        { maxAbsoluteDeficitKcal: 750, minBmrMultiplierInDeficit: 0.9 },
        { minHydrationMlPerDay: 4500, maxHydrationMlPerDay: 4500 },
        { baseHydrationMlPerKg: 0, trainingHydrationMlPerHour: 0 },
        { trainingKcalPerMinute: 0 },
      ];

      for (const config of configs) {
        for (const weightKg of [31, 70, 299]) {
          for (const dietaryPattern of ['omnivore', 'ketogenic'] as DietaryPattern[]) {
            const targets = calculateDailyTargets(
              createTestProfile({ weightKg, dietaryPattern }),
              config
            );

            const numbers = [
              targets.targetCalories,
              targets.targetProteinGrams,
              targets.targetCarbsGrams,
              targets.targetFatGrams,
              targets.targetWaterMl,
              targets.bmrKcal,
              targets.tdeeKcal,
              targets.energyBalanceKcal,
              targets.macroReconciliation.macroCalories,
              targets.macroReconciliation.deltaKcal,
              targets.estimationTolerance.targetCaloriesLowerKcal,
              targets.estimationTolerance.targetCaloriesUpperKcal,
            ];
            for (const value of numbers) {
              expect(Number.isFinite(value)).toBe(true);
            }
            expect(targets.targetWaterMl).toBeGreaterThan(0);
            expect(targets.targetWaterMl).toBeLessThanOrEqual(4500);
          }
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // 33. PROVENIÊNCIA: HASH COBRE TODO INPUT EFETIVO DE CÁLCULO
  // --------------------------------------------------------------------------
  describe('33. proveniência completa do inputSnapshotHash', () => {
    it('parâmetros auditados alteram o hash mesmo quando isolados', () => {
      const profile = createTestProfile({ weightKg: 40, trainingFrequencyDaysPerWeek: 3 });
      const baseHash = calculateDailyTargets(profile).inputSnapshotHash;

      // trainingKcalPerMinute: altera TDEE e, portanto, o output
      const training = calculateDailyTargets(profile, { trainingKcalPerMinute: 3 });
      expect(training.inputSnapshotHash).not.toBe(baseHash);

      // minHydrationMlPerDay: para perfil leve sem treino, altera diretamente a meta hídrica
      // (base 40 kg * 35 ml = 1400 ml, abaixo do piso configurado)
      const lightProfile = createTestProfile({
        weightKg: 40,
        trainingFrequencyDaysPerWeek: 0,
        averageTrainingDurationMinutes: 0,
      });
      const hydrationBase = calculateDailyTargets(lightProfile, { minHydrationMlPerDay: 1500 });
      const hydrationRaised = calculateDailyTargets(lightProfile, { minHydrationMlPerDay: 1600 });
      expect(hydrationRaised.targetWaterMl).not.toBe(hydrationBase.targetWaterMl);
      expect(hydrationRaised.inputSnapshotHash).not.toBe(hydrationBase.inputSnapshotHash);

      // minProteinGramsPerKg: participa da faixa aceita e entra no hash
      const minProtein = calculateDailyTargets(profile, { minProteinGramsPerKg: 1.7 });
      expect(minProtein.inputSnapshotHash).not.toBe(baseHash);

      // maxProteinGramsPerKg isolado (mesmas taxas por objetivo em ambos os configs)
      const uniformRates = {
        fat_loss_aggressive: 1.8,
        fat_loss_moderate: 1.8,
        maintenance: 1.8,
        hypertrophy_lean: 1.8,
        hypertrophy_aggressive: 1.8,
        strength_performance: 1.8,
      };
      const capAt20 = calculateDailyTargets(profile, {
        proteinGramsPerKgByGoal: uniformRates,
        maxProteinGramsPerKg: 2.0,
      });
      const capAt22 = calculateDailyTargets(profile, {
        proteinGramsPerKgByGoal: uniformRates,
        maxProteinGramsPerKg: 2.2,
      });
      expect(capAt20.inputSnapshotHash).not.toBe(capAt22.inputSnapshotHash);
    });

    it('configs com outputs diferentes nunca compartilham o mesmo inputSnapshotHash', () => {
      const profile = createTestProfile({ weightKg: 40, trainingFrequencyDaysPerWeek: 4 });
      const configs: EngineConfig[] = [
        {},
        { trainingKcalPerMinute: 3 },
        { minHydrationMlPerDay: 1600 },
        { baseHydrationMlPerKg: 40 },
        { defaultFatGramsPerKg: 0.7 },
        { nonKetoCarbsPreferenceGrams: 200 },
        { maxAbsoluteDeficitKcal: 500 },
        { engineVersion: '1.0.1' },
      ];

      const byOutput = new Map<string, string>();
      for (const config of configs) {
        const targets = calculateDailyTargets(profile, config);
        const outputSignature = canonicalSerialize({
          targetCalories: targets.targetCalories,
          targetProteinGrams: targets.targetProteinGrams,
          targetCarbsGrams: targets.targetCarbsGrams,
          targetFatGrams: targets.targetFatGrams,
          targetWaterMl: targets.targetWaterMl,
        });

        for (const [otherOutput, otherHash] of byOutput.entries()) {
          if (otherOutput !== outputSignature) {
            expect(targets.inputSnapshotHash).not.toBe(otherHash);
          }
        }
        byOutput.set(outputSignature, targets.inputSnapshotHash);
      }
    });

    it('snapshot serializa a totalidade dos parâmetros de cálculo resolvidos', () => {
      const profile = createTestProfile();
      const snapshot = buildInputSnapshot(profile, resolveCalculationConfig(), {
        engineVersion: '1.0.0',
        formulaVersion: 'mifflin-st-jeor-v1',
      });
      const serialized = canonicalSerialize(snapshot);

      for (const key of Object.keys(DEFAULT_CALCULATION_CONFIG)) {
        expect(serialized).toContain(`"${key}"`);
      }
    });

    it('serializador canônico rejeita NaN/Infinity em vez de convertê-los em null', () => {
      // Comportamento nativo que o motor precisa impedir:
      expect(JSON.stringify({ a: NaN })).toBe('{"a":null}');

      expect(() => canonicalSerialize({ a: NaN })).toThrow(NutritionEngineSerializationError);
      expect(() => canonicalSerialize({ a: Infinity })).toThrow(NutritionEngineSerializationError);
      expect(() => canonicalSerialize([1, -Infinity])).toThrow(NutritionEngineSerializationError);
      expect(() => canonicalizeJson({ nested: { value: NaN } })).toThrow(
        NutritionEngineSerializationError
      );

      expect(canonicalSerialize({ a: 1, b: 'ok' })).toBe('{"a":1,"b":"ok"}');
    });

    it('metadados de evento não alteram o inputSnapshotHash', () => {
      const profile = createTestProfile();
      const a = calculateDailyTargets(profile, { computedReason: 'initial_setup' });
      const b = calculateDailyTargets(profile, {
        computedReason: 'weight_checkin',
        computedAt: '2026-09-10T12:00:00.000Z',
      });

      expect(a.inputSnapshotHash).toBe(b.inputSnapshotHash);
      expect(a.id).not.toBe(b.id);
    });
  });

  // --------------------------------------------------------------------------
  // 34. SEMÂNTICA DE computedAt E IDENTIDADE DE EVENTO
  // --------------------------------------------------------------------------
  describe('34. computedAt honesto e identidade de evento sem colisão', () => {
    it('sem instante explícito, computedAt é null e não deriva de profile.updatedAt', () => {
      const profile = createTestProfile({ updatedAt: '2026-09-09T10:00:00.000Z' });
      const targets = calculateDailyTargets(profile);

      expect(targets.computedAt).toBeNull();
      expect(targets.computedAtSource).toBe('absent');
      expect(targets.computedAt).not.toBe(profile.updatedAt);
      expect(targets.computedAt).not.toBe('2026-09-09T00:00:00.000Z');
    });

    it('com instante explícito, usa exatamente o contexto fornecido', () => {
      const profile = createTestProfile({ updatedAt: '2026-09-09T10:00:00.000Z' });
      const targets = calculateDailyTargets(profile, {
        computedAt: '2026-09-11T07:30:00.000Z',
        computedReason: 'weight_checkin',
      });

      expect(targets.computedAt).toBe('2026-09-11T07:30:00.000Z');
      expect(targets.computedAtSource).toBe('explicit_context');
      expect(targets.computedReason).toBe('weight_checkin');
    });

    it('rejeita timestamp inválido, não UTC estrito ou inexistente no calendário', () => {
      const profile = createTestProfile();

      for (const invalid of [
        'ontem',
        '2026-09-11',
        '2026-09-11T07:30:00+03:00',
        '2026-02-30T00:00:00.000Z',
        '2026-13-01T00:00:00.000Z',
        '2026-09-11T25:00:00.000Z',
      ]) {
        const err = captureEngineError(profile, { computedAt: invalid });
        expect(err).toBeInstanceOf(NutritionEngineConfigError);
        expect(violationFields(err)).toContain('computedAt');
        expect(violationCodes(err)).toContain('INVALID_TIMESTAMP');
      }

      // Ano bissexto válido é aceito
      expect(() =>
        calculateDailyTargets(profile, { computedAt: '2028-02-29T23:59:59.999Z' })
      ).not.toThrow();
    });

    it('ids de evento não colidem quando razão ou instante diferem', () => {
      const profile = createTestProfile();
      const at = '2026-09-11T07:30:00.000Z';

      const initial = calculateDailyTargets(profile, { computedAt: at, computedReason: 'initial_setup' });
      const update = calculateDailyTargets(profile, { computedAt: at, computedReason: 'profile_update' });
      const later = calculateDailyTargets(profile, {
        computedAt: '2026-09-12T07:30:00.000Z',
        computedReason: 'initial_setup',
      });
      const absent = calculateDailyTargets(profile, { computedReason: 'initial_setup' });

      const ids = new Set([initial.id, update.id, later.id, absent.id]);
      expect(ids.size).toBe(4);

      // O snapshot determinístico permanece idêntico: apenas a identidade de evento muda
      expect(update.inputSnapshotHash).toBe(initial.inputSnapshotHash);
      expect(later.inputSnapshotHash).toBe(initial.inputSnapshotHash);
      expect(absent.inputSnapshotHash).toBe(initial.inputSnapshotHash);

      // Mesmo snapshot + mesmos metadados continuam produzindo o mesmo id
      expect(
        calculateDailyTargets(profile, { computedAt: at, computedReason: 'initial_setup' }).id
      ).toBe(initial.id);
    });

    it('não usa Date.now nem new Date em nenhum caminho de cálculo', () => {
      const RealDate = globalThis.Date;
      let constructedCount = 0;
      const nowSpy = vi.spyOn(RealDate, 'now');

      class TrackingDate extends RealDate {
        constructor(...args: unknown[]) {
          constructedCount += 1;
          super(...(args as []));
        }
      }
      globalThis.Date = TrackingDate as unknown as DateConstructor;

      try {
        calculateDailyTargets(createTestProfile());
        calculateDailyTargets(createTestProfile({ biologicalSexForCalcs: 'unspecified' }), {
          computedAt: '2026-09-11T07:30:00.000Z',
        });
      } finally {
        globalThis.Date = RealDate;
      }

      expect(constructedCount).toBe(0);
      expect(nowSpy).not.toHaveBeenCalled();
      nowSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // 35. MACROS: RECONCILIAÇÃO REAL E TETO DURO PÓS-ARREDONDAMENTO
  // --------------------------------------------------------------------------
  describe('35. reconciliação explícita de macronutrientes', () => {
    it('reconcilia 4P + 4C + 9F com targetCalories dentro da tolerância de arredondamento', () => {
      const patterns: DietaryPattern[] = ['omnivore', 'low_carb', 'vegan', 'ketogenic'];
      const goals: NutritionGoal[] = [
        'fat_loss_aggressive',
        'maintenance',
        'hypertrophy_aggressive',
      ];

      for (const dietaryPattern of patterns) {
        for (const goal of goals) {
          for (const weightKg of [55, 70, 88]) {
            const targets = calculateDailyTargets(
              createTestProfile({ dietaryPattern, goal, weightKg })
            );
            const { macroReconciliation: rec } = targets;

            expect(rec.macroCalories).toBe(
              targets.targetProteinGrams * 4 +
                targets.targetCarbsGrams * 4 +
                targets.targetFatGrams * 9
            );
            expect(rec.deltaKcal).toBe(rec.macroCalories - targets.targetCalories);
            expect(rec.isReconciled).toBe(
              Math.abs(rec.deltaKcal) <= rec.roundingToleranceKcal
            );

            // Casos viáveis reconciliam apenas dentro do arredondamento inevitável
            expect(rec.isReconciled).toBe(true);
            expect(rec.unmetConstraints).not.toContain('ENERGY_BELOW_MACRO_MINIMUMS');
          }
        }
      }
    });

    it('sinaliza caso infeasível em vez de fingir reconciliação exata', () => {
      // Energia alvo (piso de BMR * 0.9) é insuficiente para proteína + lipídio essencial
      const profile = createTestProfile({
        biologicalSexForCalcs: 'female',
        weightKg: 100,
        heightCm: 160,
        age: 40,
        goal: 'fat_loss_aggressive',
        nonExerciseActivity: 'sedentary',
        trainingFrequencyDaysPerWeek: 0,
        averageTrainingDurationMinutes: 0,
      });

      const targets = calculateDailyTargets(profile);
      const rec = targets.macroReconciliation;

      expect(rec.isReconciled).toBe(false);
      expect(rec.unmetConstraints).toContain('ENERGY_BELOW_MACRO_MINIMUMS');
      expect(rec.deltaKcal).toBeGreaterThan(rec.roundingToleranceKcal);
      // O delta declarado é o delta real, sem maquiagem
      expect(rec.macroCalories - rec.targetCalories).toBe(rec.deltaKcal);
      // Lipídio essencial preservado (nenhuma constraint clínica nova foi inventada)
      expect(targets.targetFatGrams).toBe(Math.round(profile.weightKg * 0.7));
    });

    it('preferência de carboidratos não cetogênicos é sinalizada, não prometida', () => {
      const unmetProfile = createTestProfile({
        biologicalSexForCalcs: 'female',
        weightKg: 85,
        heightCm: 160,
        age: 40,
        goal: 'fat_loss_aggressive',
        nonExerciseActivity: 'sedentary',
        trainingFrequencyDaysPerWeek: 0,
        averageTrainingDurationMinutes: 0,
      });
      const unmet = calculateDailyTargets(unmetProfile);
      expect(unmet.targetCarbsGrams).toBeLessThan(120);
      expect(unmet.macroReconciliation.unmetConstraints).toContain(
        'NON_KETO_CARBS_PREFERENCE_UNMET'
      );

      const metProfile = createTestProfile({ weightKg: 75, goal: 'maintenance' });
      const met = calculateDailyTargets(metProfile);
      expect(met.targetCarbsGrams).toBeGreaterThanOrEqual(120);
      expect(met.macroReconciliation.unmetConstraints).toHaveLength(0);
    });

    it('proteína final nunca excede 2.2 g/kg após o arredondamento inteiro', () => {
      const fractionalWeights = [45.3, 55.45, 61.2, 68.3, 72.7, 77.5, 84.1, 90.9, 95.45, 113.6];

      for (const weightKg of fractionalWeights) {
        const targets = calculateDailyTargets(
          createTestProfile({ weightKg, goal: 'fat_loss_aggressive' })
        );

        expect(targets.targetProteinGrams).toBeLessThanOrEqual(weightKg * 2.2);
        expect(targets.targetProteinGrams / weightKg).toBeLessThanOrEqual(2.2);
        expect(targets.effectiveProteinGramsPerKg).toBeLessThanOrEqual(2.2);
      }
    });

    it('composição dos passos puros reproduz exatamente calculateDailyTargets', () => {
      const profile = createTestProfile({ weightKg: 82, goal: 'hypertrophy_lean' });
      const config = resolveCalculationConfig();

      const { bmrKcal } = computeBmr(profile, config);
      const { tdeeKcal } = computeTdee(bmrKcal, profile, config);
      const { targetCalories } = computeTargetCalories(bmrKcal, tdeeKcal, profile, config);
      const macros = computeMacros(targetCalories, profile, config);
      const waterMl = computeHydration(profile, config);

      const targets = calculateDailyTargets(profile);
      expect(targets.bmrKcal).toBe(bmrKcal);
      expect(targets.tdeeKcal).toBe(tdeeKcal);
      expect(targets.targetCalories).toBe(targetCalories);
      expect(targets.targetProteinGrams).toBe(macros.targetProteinGrams);
      expect(targets.targetCarbsGrams).toBe(macros.targetCarbsGrams);
      expect(targets.targetFatGrams).toBe(macros.targetFatGrams);
      expect(targets.targetWaterMl).toBe(waterMl);
      expect(resolveEngineConfig().engineVersion).toBe(DEFAULT_ENGINE_CONFIG.engineVersion);
    });
  });

  // --------------------------------------------------------------------------
  // 36. TOLERÂNCIA EXPLÍCITA DE +/- 15% PARA UNSPECIFIED
  // --------------------------------------------------------------------------
  describe('36. tolerância ampliada tipada para biologicalSexForCalcs unspecified', () => {
    it('declara +/- 15% sem transformar a tolerância em ajuste do alvo', () => {
      const profile = createTestProfile({ biologicalSexForCalcs: 'unspecified', weightKg: 80 });
      const targets = calculateDailyTargets(profile);
      const tolerance = targets.estimationTolerance;

      expect(tolerance.relative).toBe(0.15);
      expect(tolerance.reason).toBe('BIOLOGICAL_SEX_UNSPECIFIED');
      expect(tolerance.targetCaloriesLowerKcal).toBe(Math.round(targets.targetCalories * 0.85));
      expect(tolerance.targetCaloriesUpperKcal).toBe(Math.round(targets.targetCalories * 1.15));

      // O alvo permanece o valor determinístico do pipeline energético, sem escalonamento
      expect(targets.targetCalories).toBe(targets.tdeeKcal + targets.energyBalanceKcal);
      expect(targets.targetCalories).toBeGreaterThan(tolerance.targetCaloriesLowerKcal);
      expect(targets.targetCalories).toBeLessThan(tolerance.targetCaloriesUpperKcal);
      expect(targets.isLimitedGuidance).toBe(true);
    });

    it('sexos especificados não recebem tolerância ampliada', () => {
      for (const biologicalSexForCalcs of ['female', 'male'] as BiologicalSexForCalcs[]) {
        const targets = calculateDailyTargets(createTestProfile({ biologicalSexForCalcs }));
        const tolerance = targets.estimationTolerance;

        expect(tolerance.relative).toBe(0);
        expect(tolerance.reason).toBe('NONE');
        expect(tolerance.targetCaloriesLowerKcal).toBe(targets.targetCalories);
        expect(tolerance.targetCaloriesUpperKcal).toBe(targets.targetCalories);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 37. CAMPOS DE CONFIG MORTOS RESOLVIDOS
  // --------------------------------------------------------------------------
  describe('37. contrato de config sem campos mortos', () => {
    it('não declara percentuais calóricos de gordura que o algoritmo não usa', () => {
      const keys = Object.keys(DEFAULT_ENGINE_CONFIG);

      expect(keys).not.toContain('minFatCaloriePercentage');
      expect(keys).not.toContain('ketogenicFatCaloriePercentage');
      // Renomeado para refletir a semântica real (preferência, não piso garantido)
      expect(keys).not.toContain('nonKetoCarbsFloorGrams');
      expect(keys).toContain('nonKetoCarbsPreferenceGrams');
    });

    it('a preferência de carboidratos é respeitada quando há energia disponível', () => {
      const profile = createTestProfile({ weightKg: 75, goal: 'maintenance' });

      const lowPreference = calculateDailyTargets(profile, { nonKetoCarbsPreferenceGrams: 100 });
      const highPreference = calculateDailyTargets(profile, { nonKetoCarbsPreferenceGrams: 130 });

      expect(lowPreference.targetCarbsGrams).toBeGreaterThanOrEqual(100);
      expect(highPreference.targetCarbsGrams).toBeGreaterThanOrEqual(130);
      expect(lowPreference.macroReconciliation.unmetConstraints).toHaveLength(0);
      expect(highPreference.macroReconciliation.unmetConstraints).toHaveLength(0);
    });
  });

  // ==========================================================================
  // REGRESSÕES CORRETIVAS (revisão 065) — SIMETRIA HIPERCALÓRICA
  // P1: overrides públicos não podem produzir metas hipercalóricas arbitrárias.
  // ==========================================================================

  // --------------------------------------------------------------------------
  // 38. TETO DE SUPERÁVIT POR OBJETIVO
  // --------------------------------------------------------------------------
  describe('38. envelope duro de goalAdjustments (revisão 065)', () => {
    const withSurplus = (value: number): EngineConfig => ({
      goalAdjustments: {
        ...DEFAULT_CALCULATION_CONFIG.goalAdjustments,
        hypertrophy_aggressive: value,
      },
    });

    it('rejeita os ataques hipercalóricos exatos da revisão 065', () => {
      const profile = createTestProfile({ goal: 'hypertrophy_aggressive' });

      for (const attack of [10000, 100000, 1e9]) {
        const err = captureEngineError(profile, withSurplus(attack));
        expect(err).toBeInstanceOf(NutritionEngineConfigError);
        expect(violationFields(err)).toContain('goalAdjustments.hypertrophy_aggressive');
        expect(violationCodes(err)).toContain('ABOVE_HARD_LIMIT');
      }
    });

    it('aceita exatamente o máximo canônico (+400) e rejeita o valor imediatamente acima', () => {
      const profile = createTestProfile({ goal: 'hypertrophy_aggressive' });

      expect(() =>
        calculateDailyTargets(profile, withSurplus(ENGINE_HARD_SAFETY_LIMITS.MAX_GOAL_SURPLUS_KCAL))
      ).not.toThrow();

      const err = captureEngineError(
        profile,
        withSurplus(ENGINE_HARD_SAFETY_LIMITS.MAX_GOAL_SURPLUS_KCAL + 1)
      );
      expect(err).toBeInstanceOf(NutritionEngineConfigError);
      expect(violationCodes(err)).toContain('ABOVE_HARD_LIMIT');
    });

    it('o teto de superávit é o maior positivo já canonizado, não um número novo', () => {
      const canonicalMaxPositive = Math.max(
        ...Object.values(DEFAULT_CALCULATION_CONFIG.goalAdjustments)
      );
      expect(ENGINE_HARD_SAFETY_LIMITS.MAX_GOAL_SURPLUS_KCAL).toBe(canonicalMaxPositive);
      expect(canonicalMaxPositive).toBe(400);
    });

    it('rejeita déficit fora do envelope protegido, sem clamp silencioso', () => {
      const profile = createTestProfile({ goal: 'fat_loss_aggressive' });

      // Fora do hard cap absoluto de déficit (750).
      const beyondHardCap = captureEngineError(profile, {
        goalAdjustments: {
          ...DEFAULT_CALCULATION_CONFIG.goalAdjustments,
          fat_loss_aggressive: -751,
        },
      });
      expect(violationCodes(beyondHardCap)).toContain('BELOW_HARD_LIMIT');

      // Fora do envelope efetivamente configurado (mais restritivo que o hard cap).
      const beyondConfigured = captureEngineError(profile, {
        maxAbsoluteDeficitKcal: 300,
        goalAdjustments: {
          ...DEFAULT_CALCULATION_CONFIG.goalAdjustments,
          fat_loss_aggressive: -500,
        },
      });
      expect(violationFields(beyondConfigured)).toContain('goalAdjustments.fat_loss_aggressive');
      expect(violationCodes(beyondConfigured)).toContain('BELOW_HARD_LIMIT');

      // Exatamente no envelope configurado: aceito.
      // O envelope vale para TODOS os objetivos, não só o do perfil — um config só é
      // válido como um todo, independentemente de qual objetivo venha a consumi-lo.
      expect(() =>
        calculateDailyTargets(profile, {
          maxAbsoluteDeficitKcal: 300,
          goalAdjustments: {
            ...DEFAULT_CALCULATION_CONFIG.goalAdjustments,
            fat_loss_aggressive: -300,
            fat_loss_moderate: -300,
          },
        })
      ).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // 39. PISOS CALÓRICOS NÃO SÃO VIA DE ABUSO HIPERCALÓRICO
  // --------------------------------------------------------------------------
  describe('39. pisos calóricos como invariantes (revisão 065)', () => {
    it('rejeita os três ataques de piso da revisão 065 antes de produzir DailyTargets', () => {
      const attacks: Array<[string, number]> = [
        ['femaleCaloricFloorKcal', 100000],
        ['maleCaloricFloorKcal', 100000],
        ['unspecifiedCaloricFloorKcal', 99999],
      ];

      for (const [key, value] of attacks) {
        for (const biologicalSexForCalcs of [
          'female',
          'male',
          'unspecified',
        ] as BiologicalSexForCalcs[]) {
          const profile = createTestProfile({ biologicalSexForCalcs });
          const err = captureEngineError(profile, { [key]: value } as unknown as EngineConfig);
          expect(err).toBeInstanceOf(NutritionEngineConfigError);
          expect(violationCodes(err)).toContain('UNKNOWN_CONFIG_KEY');
        }
      }
    });

    it('overrides removidos do contrato falham em vez de serem ignorados em silêncio', () => {
      const profile = createTestProfile();

      for (const key of [
        'minFatCaloriePercentage',
        'ketogenicFatCaloriePercentage',
        'nonKetoCarbsFloorGrams',
        'chaveInexistente',
      ]) {
        const err = captureEngineError(profile, { [key]: 1 } as unknown as EngineConfig);
        expect(err).toBeInstanceOf(NutritionEngineConfigError);
        expect(violationFields(err)).toContain(key);
        expect(violationCodes(err)).toContain('UNKNOWN_CONFIG_KEY');
      }
    });

    it('a allowlist de chaves não pode divergir do contrato resolvido', () => {
      // Guarda estrutural: um parâmetro novo em EngineCalculationConfig que esqueça de
      // entrar em ENGINE_CONFIG_KEYS passaria a ser rejeitado como chave desconhecida.
      const invariantOnly = [
        'femaleCaloricFloorKcal',
        'maleCaloricFloorKcal',
        'unspecifiedCaloricFloorKcal',
      ];
      const expected = Object.keys(DEFAULT_ENGINE_CONFIG)
        .filter((k) => !invariantOnly.includes(k))
        .concat('computedAt')
        .filter((k, i, a) => a.indexOf(k) === i)
        .sort();

      expect([...ENGINE_CONFIG_KEYS].sort()).toEqual(expected);

      // E toda chave da allowlist, com seu próprio valor canônico, é aceita pelo motor.
      for (const key of ENGINE_CONFIG_KEYS) {
        expect(() =>
          calculateDailyTargets(createTestProfile(), {
            [key]: (DEFAULT_ENGINE_CONFIG as Record<string, unknown>)[key],
          } as unknown as EngineConfig)
        ).not.toThrow();
      }
    });

    it('pisos invariantes continuam íntegros na proveniência', () => {
      const profile = createTestProfile();
      const snapshot = buildInputSnapshot(
        profile,
        resolveCalculationConfig(),
        DEFAULT_ENGINE_CONFIG
      );

      expect(snapshot.effectiveParameters.femaleCaloricFloorKcal).toBe(1200);
      expect(snapshot.effectiveParameters.maleCaloricFloorKcal).toBe(1500);
      expect(snapshot.effectiveParameters.unspecifiedCaloricFloorKcal).toBe(1200);
      expect(canonicalSerialize(snapshot)).toContain('femaleCaloricFloorKcal');
    });
  });

  // --------------------------------------------------------------------------
  // 40. NENHUMA CONFIG PÚBLICA VÁLIDA PRODUZ ALVO HIPERCALÓRICO ARBITRÁRIO
  // --------------------------------------------------------------------------
  describe('40. sweep de segurança hipercalórica (revisão 065)', () => {
    it('rejeita custo de treino acima do valor canônico vigente', () => {
      const profile = createTestProfile();

      expect(() =>
        calculateDailyTargets(profile, {
          trainingKcalPerMinute: ENGINE_HARD_SAFETY_LIMITS.MAX_TRAINING_KCAL_PER_MINUTE,
        })
      ).not.toThrow();

      for (const attack of [6.1, 100, 100000]) {
        const err = captureEngineError(profile, { trainingKcalPerMinute: attack });
        expect(err).toBeInstanceOf(NutritionEngineConfigError);
        expect(violationFields(err)).toContain('trainingKcalPerMinute');
        expect(violationCodes(err)).toContain('ABOVE_HARD_LIMIT');
      }
    });

    it('rejeita lipídios fora da faixa canônica 0.7 a 1.0 g/kg/dia (Masterplan 8.2)', () => {
      const profile = createTestProfile();

      for (const field of ['minFatGramsPerKg', 'maxFatGramsPerKg', 'defaultFatGramsPerKg']) {
        for (const attack of [0.69, 1.01, 1000]) {
          const err = captureEngineError(profile, {
            [field]: attack,
          } as unknown as EngineConfig);
          expect(err).toBeInstanceOf(NutritionEngineConfigError);
          expect(violationFields(err)).toContain(field);
        }
      }
    });

    it('nenhuma configuração pública válida escapa do envelope calórico derivado', () => {
      // Invariante derivado exclusivamente de regras canônicas já existentes:
      // alvo <= max(piso masculino, TDEE + superávit canônico máximo).
      // Não é um teto global novo de targetCalories — é a consequência dos componentes.
      const configs: EngineConfig[] = [
        {},
        { palFactors: { ...DEFAULT_CALCULATION_CONFIG.palFactors, very_active: 1.75 } },
        { trainingKcalPerMinute: ENGINE_HARD_SAFETY_LIMITS.MAX_TRAINING_KCAL_PER_MINUTE },
        { trainingKcalPerMinute: 0 },
        {
          goalAdjustments: Object.fromEntries(
            NUTRITION_GOALS.map((g) => [g, ENGINE_HARD_SAFETY_LIMITS.MAX_GOAL_SURPLUS_KCAL])
          ) as Record<NutritionGoal, number>,
        },
        {
          goalAdjustments: Object.fromEntries(
            NUTRITION_GOALS.map((g) => [g, -750])
          ) as Record<NutritionGoal, number>,
        },
        { minProteinGramsPerKg: 1.6, maxProteinGramsPerKg: 2.2 },
        { minFatGramsPerKg: 0.7, maxFatGramsPerKg: 1.0, defaultFatGramsPerKg: 1.0 },
        { maxHydrationMlPerDay: 4500, minHydrationMlPerDay: 1500 },
        { baseHydrationMlPerKg: 35, trainingHydrationMlPerHour: 500 },
      ];

      let evaluated = 0;
      for (const config of configs) {
        for (const goal of NUTRITION_GOALS) {
          for (const biologicalSexForCalcs of [
            'female',
            'male',
            'unspecified',
          ] as BiologicalSexForCalcs[]) {
            for (const weightKg of [40, 62, 95, 180]) {
              for (const nonExerciseActivity of [
                'sedentary',
                'very_active',
              ] as ActivityLevel[]) {
                const profile = createTestProfile({
                  goal,
                  biologicalSexForCalcs,
                  weightKg,
                  nonExerciseActivity,
                  trainingFrequencyDaysPerWeek: 7,
                  averageTrainingDurationMinutes: 180,
                });

                const targets = calculateDailyTargets(profile, config);
                evaluated++;

                const derivedCeiling = Math.max(
                  ENGINE_HARD_SAFETY_LIMITS.MALE_CALORIC_FLOOR_KCAL,
                  targets.tdeeKcal + ENGINE_HARD_SAFETY_LIMITS.MAX_GOAL_SURPLUS_KCAL
                );
                expect(targets.targetCalories).toBeLessThanOrEqual(derivedCeiling);
                expect(targets.targetCalories).toBeGreaterThan(0);
                expect(targets.targetWaterMl).toBeLessThanOrEqual(
                  ENGINE_HARD_SAFETY_LIMITS.MAX_HYDRATION_ML_PER_DAY
                );
                expect(targets.targetProteinGrams).toBeLessThanOrEqual(
                  weightKg * ENGINE_HARD_SAFETY_LIMITS.MAX_PROTEIN_GRAMS_PER_KG
                );
                expect(targets.targetCarbsGrams).toBeGreaterThanOrEqual(0);
                expect(targets.targetFatGrams).toBeGreaterThanOrEqual(0);
              }
            }
          }
        }
      }

      expect(evaluated).toBeGreaterThan(500);
    });
  });
});
