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
  calculateDailyTargets,
  canonicalizeJson,
  canonicalSerialize,
  computeBmr,
  computeHydration,
  computeMacros,
  computeTargetCalories,
  computeTdee,
  resolveEngineConfig,
  sha256Sync,
} from './engine';
import {
  DEFAULT_ENGINE_CONFIG,
  EngineConfig,
  NutritionEngineGateError,
} from './engine-types';
import { NUTRITION_GATE_REASONS } from './profile-gates';

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

    // Forçar ajuste configurado agressivo de -1200 kcal
    const customConfig: EngineConfig = {
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

    const targets = calculateDailyTargets(profile, customConfig);
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
  it('17. proteína nunca > 2.2 g/kg (trava estrita D-NUT-04)', () => {
    const profile = createTestProfile({
      goal: 'fat_loss_aggressive',
      weightKg: 80,
    });

    // Tentativa de configurar 2.8 g/kg no config
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

    const targets = calculateDailyTargets(profile, customConfig);
    const proteinRate = targets.targetProteinGrams / profile.weightKg;
    expect(proteinRate).toBeLessThanOrEqual(2.2 + 0.02);
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

    // Diferença máxima por arredondamentos inteiros <= 15 kcal
    expect(Math.abs(totalMacroCalories - targets.targetCalories)).toBeLessThanOrEqual(15);
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
      expect(resA.computedAt).toBe('2026-09-09T08:00:00.000Z');
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
});
