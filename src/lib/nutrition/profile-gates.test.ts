import { describe, expect, it } from 'vitest';
import type { NutritionProfile } from '../../types/nutrition';
import {
  BIOMETRIC_LIMITS,
  BLOCKING_HEALTH_FLAGS,
  evaluateNutritionGate,
  NUTRITION_GATE_NOTICE_KEYS,
  NUTRITION_GATE_REASONS,
  REFERRAL_HEALTH_FLAGS,
} from './profile-gates';

function createMockNutritionProfile(
  overrides: Partial<NutritionProfile> = {}
): NutritionProfile {
  return {
    age: 28,
    heightCm: 175,
    weightKg: 75,
    biologicalSexForCalcs: 'male',
    goal: 'hypertrophy_lean',
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
    updatedAt: '2026-09-08T12:00:00.000Z',
    ...overrides,
  };
}

describe('evaluateNutritionGate — NUT-002', () => {
  describe('NORMAL_FLOW', () => {
    it('deve retornar NORMAL_FLOW para homem adulto saudável com perfil completo', () => {
      const profile = createMockNutritionProfile({
        age: 30,
        biologicalSexForCalcs: 'male',
        healthFlags: [],
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('NORMAL_FLOW');
      expect(result.allowManualTracking).toBe(true);
      expect(result.allowAutomatedTargets).toBe(true);
      expect(result.suggestedAction).toBe('PROCEED');
      expect(result.reasons).toEqual([]);
      expect(result.userNoticeKey).toBe(NUTRITION_GATE_NOTICE_KEYS.NORMAL_FLOW);
    });

    it('deve retornar NORMAL_FLOW para mulher adulta saudável com perfil completo', () => {
      const profile = createMockNutritionProfile({
        age: 26,
        biologicalSexForCalcs: 'female',
        heightCm: 165,
        weightKg: 58,
        healthFlags: [],
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('NORMAL_FLOW');
      expect(result.allowManualTracking).toBe(true);
      expect(result.allowAutomatedTargets).toBe(true);
      expect(result.suggestedAction).toBe('PROCEED');
      expect(result.reasons).toEqual([]);
      expect(result.userNoticeKey).toBe(NUTRITION_GATE_NOTICE_KEYS.NORMAL_FLOW);
    });

    it('deve permitir NORMAL_FLOW com preferências alimentares e alergias sem flags de saúde', () => {
      const profile = createMockNutritionProfile({
        dietaryPattern: 'vegan',
        allergies: ['peanut', 'shellfish'],
        intolerances: ['lactose'],
        avoidedFoods: ['sugar'],
        healthFlags: [],
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('NORMAL_FLOW');
      expect(result.allowAutomatedTargets).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });
  });

  describe('LIMITED_GUIDANCE e Proibição de Default Masculino (D-NUT-02)', () => {
    it('deve acionar LIMITED_GUIDANCE quando biologicalSexForCalcs === "unspecified"', () => {
      const profile = createMockNutritionProfile({
        biologicalSexForCalcs: 'unspecified',
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('LIMITED_GUIDANCE');
      expect(result.allowManualTracking).toBe(true);
      expect(result.allowAutomatedTargets).toBe(true);
      expect(result.suggestedAction).toBe('PROVIDE_DETAILS');
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.BIOLOGICAL_SEX_UNSPECIFIED);
      expect(result.userNoticeKey).toBe(NUTRITION_GATE_NOTICE_KEYS.LIMITED_GUIDANCE);
    });

    it('PROIBIÇÃO DE DEFAULT MASCULINO: biologicalSexForCalcs "unspecified" não assume "male"', () => {
      const profile = createMockNutritionProfile({
        biologicalSexForCalcs: 'unspecified',
      });

      const result = evaluateNutritionGate(profile);

      // Não pode virar NORMAL_FLOW nem apagar a razão
      expect(result.status).not.toBe('NORMAL_FLOW');
      expect(result.status).toBe('LIMITED_GUIDANCE');
      expect(profile.biologicalSexForCalcs).toBe('unspecified');
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.BIOLOGICAL_SEX_UNSPECIFIED);
    });

    it('deve acionar LIMITED_GUIDANCE com allowAutomatedTargets = false se peso for 0 ou negativo', () => {
      const profileZero = createMockNutritionProfile({ weightKg: 0 });
      const resultZero = evaluateNutritionGate(profileZero);

      expect(resultZero.status).toBe('LIMITED_GUIDANCE');
      expect(resultZero.allowAutomatedTargets).toBe(false);
      expect(resultZero.allowManualTracking).toBe(true);
      expect(resultZero.reasons).toContain(NUTRITION_GATE_REASONS.INVALID_WEIGHT);
      expect(resultZero.suggestedAction).toBe('PROVIDE_DETAILS');

      const profileNegative = createMockNutritionProfile({ weightKg: -10 });
      const resultNegative = evaluateNutritionGate(profileNegative);
      expect(resultNegative.status).toBe('LIMITED_GUIDANCE');
      expect(resultNegative.allowAutomatedTargets).toBe(false);
      expect(resultNegative.reasons).toContain(NUTRITION_GATE_REASONS.INVALID_WEIGHT);
    });

    it('deve acionar LIMITED_GUIDANCE com allowAutomatedTargets = false se altura for 0 ou negativa', () => {
      const profile = createMockNutritionProfile({ heightCm: 0 });
      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('LIMITED_GUIDANCE');
      expect(result.allowAutomatedTargets).toBe(false);
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.INVALID_HEIGHT);
    });

    it('deve acionar LIMITED_GUIDANCE com allowAutomatedTargets = false se idade for NaN ou inválida (sem ser número positivo)', () => {
      const profileNaN = createMockNutritionProfile({ age: NaN });
      const resultNaN = evaluateNutritionGate(profileNaN);

      expect(resultNaN.status).toBe('LIMITED_GUIDANCE');
      expect(resultNaN.allowAutomatedTargets).toBe(false);
      expect(resultNaN.reasons).toContain(NUTRITION_GATE_REASONS.INVALID_AGE);
    });


    it('deve acionar LIMITED_GUIDANCE se altura estiver fora dos limites marginais normais', () => {
      const profileVeryShort = createMockNutritionProfile({ heightCm: 85 });
      const resultShort = evaluateNutritionGate(profileVeryShort);
      expect(resultShort.status).toBe('LIMITED_GUIDANCE');
      expect(resultShort.reasons).toContain(NUTRITION_GATE_REASONS.MARGINAL_BIOMETRICS);
      expect(resultShort.allowAutomatedTargets).toBe(true);

      const profileVeryTall = createMockNutritionProfile({ heightCm: 255 });
      const resultTall = evaluateNutritionGate(profileVeryTall);
      expect(resultTall.status).toBe('LIMITED_GUIDANCE');
      expect(resultTall.reasons).toContain(NUTRITION_GATE_REASONS.MARGINAL_BIOMETRICS);
    });

    it('deve acionar LIMITED_GUIDANCE se peso estiver fora dos limites marginais normais', () => {
      const profileUnderweight = createMockNutritionProfile({ weightKg: 28 });
      const resultUnder = evaluateNutritionGate(profileUnderweight);
      expect(resultUnder.status).toBe('LIMITED_GUIDANCE');
      expect(resultUnder.reasons).toContain(NUTRITION_GATE_REASONS.MARGINAL_BIOMETRICS);

      const profileOverweight = createMockNutritionProfile({ weightKg: 320 });
      const resultOver = evaluateNutritionGate(profileOverweight);
      expect(resultOver.status).toBe('LIMITED_GUIDANCE');
      expect(resultOver.reasons).toContain(NUTRITION_GATE_REASONS.MARGINAL_BIOMETRICS);
    });
  });

  describe('BLOCK_AUTOMATIC_TARGET (Bloqueadores Clínicos e Legais Estritos)', () => {
    it('deve bloquear menor de 18 anos por idade cronológica (< 18)', () => {
      const profile17 = createMockNutritionProfile({ age: 17 });
      const result17 = evaluateNutritionGate(profile17);

      expect(result17.status).toBe('BLOCK_AUTOMATIC_TARGET');
      expect(result17.allowManualTracking).toBe(true);
      expect(result17.allowAutomatedTargets).toBe(false);
      expect(result17.suggestedAction).toBe('CONSULT_DIETITIAN');
      expect(result17.reasons).toContain(NUTRITION_GATE_REASONS.UNDERAGE);
      expect(result17.userNoticeKey).toBe(NUTRITION_GATE_NOTICE_KEYS.BLOCK_AUTOMATIC_TARGET);
    });

    it('deve bloquear menor de 18 anos por flag explícita "underage"', () => {
      const profile = createMockNutritionProfile({
        age: 20,
        healthFlags: ['underage'],
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('BLOCK_AUTOMATIC_TARGET');
      expect(result.allowAutomatedTargets).toBe(false);
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.UNDERAGE);
    });

    it('deve bloquear gestante (pregnancy)', () => {
      const profile = createMockNutritionProfile({
        biologicalSexForCalcs: 'female',
        healthFlags: ['pregnancy'],
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('BLOCK_AUTOMATIC_TARGET');
      expect(result.allowManualTracking).toBe(true);
      expect(result.allowAutomatedTargets).toBe(false);
      expect(result.suggestedAction).toBe('CONSULT_DIETITIAN');
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.PREGNANCY);
    });

    it('deve bloquear lactante (lactation)', () => {
      const profile = createMockNutritionProfile({
        biologicalSexForCalcs: 'female',
        healthFlags: ['lactation'],
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('BLOCK_AUTOMATIC_TARGET');
      expect(result.allowManualTracking).toBe(true);
      expect(result.allowAutomatedTargets).toBe(false);
      expect(result.suggestedAction).toBe('CONSULT_DIETITIAN');
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.LACTATION);
    });

    it('deve bloquear condição renal crônica (chronic_kidney_disease)', () => {
      const profile = createMockNutritionProfile({
        healthFlags: ['chronic_kidney_disease'],
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('BLOCK_AUTOMATIC_TARGET');
      expect(result.allowManualTracking).toBe(true);
      expect(result.allowAutomatedTargets).toBe(false);
      expect(result.suggestedAction).toBe('CONSULT_DIETITIAN');
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.CHRONIC_KIDNEY_DISEASE);
    });
  });

  describe('PROFESSIONAL_REFERRAL (Encaminhamento Profissional)', () => {
    it('deve encaminhar histórico de transtorno alimentar (eating_disorder_history)', () => {
      const profile = createMockNutritionProfile({
        healthFlags: ['eating_disorder_history'],
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('PROFESSIONAL_REFERRAL');
      expect(result.allowManualTracking).toBe(true);
      expect(result.allowAutomatedTargets).toBe(false);
      expect(result.suggestedAction).toBe('CONSULT_DIETITIAN');
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.EATING_DISORDER_HISTORY);
      expect(result.userNoticeKey).toBe(NUTRITION_GATE_NOTICE_KEYS.PROFESSIONAL_REFERRAL);
    });

    it('deve encaminhar diabetes tipo 1 (type_1_diabetes)', () => {
      const profile = createMockNutritionProfile({
        healthFlags: ['type_1_diabetes'],
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('PROFESSIONAL_REFERRAL');
      expect(result.allowAutomatedTargets).toBe(false);
      expect(result.suggestedAction).toBe('CONSULT_DIETITIAN');
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.TYPE_1_DIABETES);
    });

    it('deve encaminhar diabetes tipo 2 não controlado (type_2_diabetes_uncontrolled)', () => {
      const profile = createMockNutritionProfile({
        healthFlags: ['type_2_diabetes_uncontrolled'],
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('PROFESSIONAL_REFERRAL');
      expect(result.allowAutomatedTargets).toBe(false);
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.TYPE_2_DIABETES_UNCONTROLLED);
    });

    it('deve encaminhar condição cardiovascular grave (severe_cardiovascular_condition)', () => {
      const profile = createMockNutritionProfile({
        healthFlags: ['severe_cardiovascular_condition'],
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('PROFESSIONAL_REFERRAL');
      expect(result.allowAutomatedTargets).toBe(false);
      expect(result.reasons).toContain(
        NUTRITION_GATE_REASONS.SEVERE_CARDIOVASCULAR_CONDITION
      );
    });
  });

  describe('Precedência Determinística entre Condições Coexistentes', () => {
    it('underage + unspecified NÃO PODE virar LIMITED_GUIDANCE (blocker vence)', () => {
      const profile = createMockNutritionProfile({
        age: 16,
        biologicalSexForCalcs: 'unspecified',
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('BLOCK_AUTOMATIC_TARGET');
      expect(result.allowAutomatedTargets).toBe(false);
      expect(result.suggestedAction).toBe('CONSULT_DIETITIAN');
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.UNDERAGE);
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.BIOLOGICAL_SEX_UNSPECIFIED);
    });

    it('pregnancy + eating_disorder_history: blocker vence referral', () => {
      const profile = createMockNutritionProfile({
        healthFlags: ['pregnancy', 'eating_disorder_history'],
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('BLOCK_AUTOMATIC_TARGET');
      expect(result.allowAutomatedTargets).toBe(false);
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.PREGNANCY);
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.EATING_DISORDER_HISTORY);
    });

    it('chronic_kidney_disease + unspecified: blocker vence limited guidance', () => {
      const profile = createMockNutritionProfile({
        biologicalSexForCalcs: 'unspecified',
        healthFlags: ['chronic_kidney_disease'],
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('BLOCK_AUTOMATIC_TARGET');
      expect(result.allowAutomatedTargets).toBe(false);
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.CHRONIC_KIDNEY_DISEASE);
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.BIOLOGICAL_SEX_UNSPECIFIED);
    });

    it('eating_disorder_history + unspecified: referral vence limited guidance', () => {
      const profile = createMockNutritionProfile({
        biologicalSexForCalcs: 'unspecified',
        healthFlags: ['eating_disorder_history'],
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('PROFESSIONAL_REFERRAL');
      expect(result.allowAutomatedTargets).toBe(false);
      expect(result.suggestedAction).toBe('CONSULT_DIETITIAN');
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.EATING_DISORDER_HISTORY);
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.BIOLOGICAL_SEX_UNSPECIFIED);
    });

    it('type_1_diabetes + marginal biometrics: referral vence limited guidance', () => {
      const profile = createMockNutritionProfile({
        heightCm: 260,
        healthFlags: ['type_1_diabetes'],
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('PROFESSIONAL_REFERRAL');
      expect(result.allowAutomatedTargets).toBe(false);
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.TYPE_1_DIABETES);
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.MARGINAL_BIOMETRICS);
    });

    it('todas as flags coexistentes: blocker vence e ordena reasons deterministicamente', () => {
      const profile = createMockNutritionProfile({
        age: 15,
        biologicalSexForCalcs: 'unspecified',
        healthFlags: [
          'pregnancy',
          'lactation',
          'chronic_kidney_disease',
          'eating_disorder_history',
          'type_1_diabetes',
          'type_2_diabetes_uncontrolled',
          'severe_cardiovascular_condition',
        ],
      });

      const result = evaluateNutritionGate(profile);

      expect(result.status).toBe('BLOCK_AUTOMATIC_TARGET');
      expect(result.allowAutomatedTargets).toBe(false);
      expect(result.suggestedAction).toBe('CONSULT_DIETITIAN');
      expect(result.reasons).toEqual([
        NUTRITION_GATE_REASONS.UNDERAGE,
        NUTRITION_GATE_REASONS.PREGNANCY,
        NUTRITION_GATE_REASONS.LACTATION,
        NUTRITION_GATE_REASONS.CHRONIC_KIDNEY_DISEASE,
        NUTRITION_GATE_REASONS.EATING_DISORDER_HISTORY,
        NUTRITION_GATE_REASONS.TYPE_1_DIABETES,
        NUTRITION_GATE_REASONS.TYPE_2_DIABETES_UNCONTROLLED,
        NUTRITION_GATE_REASONS.SEVERE_CARDIOVASCULAR_CONDITION,
        NUTRITION_GATE_REASONS.BIOLOGICAL_SEX_UNSPECIFIED,
      ]);
    });
  });

  describe('Testes Limítrofes de Idade (Boundary Values)', () => {
    it('17.99 anos deve ser bloqueado como menor de idade', () => {
      const profile = createMockNutritionProfile({ age: 17.99 });
      const result = evaluateNutritionGate(profile);
      expect(result.status).toBe('BLOCK_AUTOMATIC_TARGET');
      expect(result.reasons).toContain(NUTRITION_GATE_REASONS.UNDERAGE);
    });

    it('18.0 anos deve ser aceito em NORMAL_FLOW', () => {
      const profile = createMockNutritionProfile({ age: 18.0 });
      const result = evaluateNutritionGate(profile);
      expect(result.status).toBe('NORMAL_FLOW');
      expect(result.allowAutomatedTargets).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('18 anos exatos deve ser aceito em NORMAL_FLOW', () => {
      const profile = createMockNutritionProfile({ age: 18 });
      const result = evaluateNutritionGate(profile);
      expect(result.status).toBe('NORMAL_FLOW');
      expect(result.allowAutomatedTargets).toBe(true);
    });

    it('19 anos deve ser aceito em NORMAL_FLOW', () => {
      const profile = createMockNutritionProfile({ age: 19 });
      const result = evaluateNutritionGate(profile);
      expect(result.status).toBe('NORMAL_FLOW');
      expect(result.allowAutomatedTargets).toBe(true);
    });

    it('idoso (75 anos) saudável deve ser aceito em NORMAL_FLOW', () => {
      const profile = createMockNutritionProfile({ age: 75 });
      const result = evaluateNutritionGate(profile);
      expect(result.status).toBe('NORMAL_FLOW');
      expect(result.allowAutomatedTargets).toBe(true);
    });
  });

  describe('Robustez, Imutabilidade e Determinismo', () => {
    it('não deve mutar o objeto de perfil fornecido na entrada', () => {
      const profile = Object.freeze(
        createMockNutritionProfile({
          biologicalSexForCalcs: 'unspecified',
          healthFlags: Object.freeze(['underage']) as unknown as typeof profile.healthFlags,
        })
      );

      expect(() => evaluateNutritionGate(profile)).not.toThrow();
      expect(profile.biologicalSexForCalcs).toBe('unspecified');
    });

    it('deve produzir rigorosamente o mesmo resultado em 100 invocações consecutivas (determinismo puro)', () => {
      const profile = createMockNutritionProfile({
        biologicalSexForCalcs: 'unspecified',
        healthFlags: ['eating_disorder_history'],
      });

      const firstResult = evaluateNutritionGate(profile);

      for (let i = 0; i < 100; i++) {
        const result = evaluateNutritionGate(profile);
        expect(result).toEqual(firstResult);
      }
    });

    it('deve lidar com healthFlags vazio e indefinido de forma segura', () => {
      const profileEmpty = createMockNutritionProfile({ healthFlags: [] });
      expect(evaluateNutritionGate(profileEmpty).status).toBe('NORMAL_FLOW');

      const profileUndefined = createMockNutritionProfile({
        healthFlags: undefined as unknown as typeof profileEmpty.healthFlags,
      });
      expect(evaluateNutritionGate(profileUndefined).status).toBe('NORMAL_FLOW');
    });

    it('allowManualTracking deve ser estritamente TRUE em todos os quatro estados', () => {
      const normal = evaluateNutritionGate(createMockNutritionProfile());
      const limited = evaluateNutritionGate(
        createMockNutritionProfile({ biologicalSexForCalcs: 'unspecified' })
      );
      const referral = evaluateNutritionGate(
        createMockNutritionProfile({ healthFlags: ['type_1_diabetes'] })
      );
      const blocked = evaluateNutritionGate(
        createMockNutritionProfile({ healthFlags: ['pregnancy'] })
      );

      expect(normal.allowManualTracking).toBe(true);
      expect(limited.allowManualTracking).toBe(true);
      expect(referral.allowManualTracking).toBe(true);
      expect(blocked.allowManualTracking).toBe(true);
    });

    it('deve expor constantes canônicas válidas e coerentes com a tipagem', () => {
      expect(BLOCKING_HEALTH_FLAGS.has('underage')).toBe(true);
      expect(BLOCKING_HEALTH_FLAGS.has('pregnancy')).toBe(true);
      expect(BLOCKING_HEALTH_FLAGS.has('lactation')).toBe(true);
      expect(BLOCKING_HEALTH_FLAGS.has('chronic_kidney_disease')).toBe(true);

      expect(REFERRAL_HEALTH_FLAGS.has('eating_disorder_history')).toBe(true);
      expect(REFERRAL_HEALTH_FLAGS.has('type_1_diabetes')).toBe(true);
      expect(REFERRAL_HEALTH_FLAGS.has('type_2_diabetes_uncontrolled')).toBe(true);
      expect(REFERRAL_HEALTH_FLAGS.has('severe_cardiovascular_condition')).toBe(true);

      expect(BIOMETRIC_LIMITS.AGE_MIN_ADULT).toBe(18);
    });
  });
});
