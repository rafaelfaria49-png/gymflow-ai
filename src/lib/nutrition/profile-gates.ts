/**
 * GymFlow AI — Avaliação de Gates Ético-Clínicos de Nutrição (NUT-002)
 *
 * Módulo puro, determinístico e sem efeitos colaterais.
 * Avalia se o perfil atende aos critérios de segurança para prosseguir
 * com metas calóricas/macronutrientes automáticas ou se deve receber
 * limitação, recomendação profissional ou bloqueio estrito.
 *
 * Referências canônicas:
 * - docs/nutrition/GYMFLOW_NUTRITION_MASTERPLAN_001.md (Seção 5 e 6)
 * - docs/nutrition/GYMFLOW_NUTRITION_DECISIONS_001.md (D-NUT-02)
 * - docs/nutrition/GYMFLOW_NUTRITION_IMPLEMENTATION_GOALS_001.md (NUT-002)
 */

import type {
  HealthFlag,
  NutritionGateResult,
  NutritionGateStatus,
  NutritionProfile,
  NutritionSuggestedAction,
} from '../../types/nutrition';

/**
 * Razões canônicas estruturadas para o resultado da avaliação de gate.
 */
export const NUTRITION_GATE_REASONS = {
  // Bloqueadores estritos (BLOCK_AUTOMATIC_TARGET)
  UNDERAGE: 'UNDERAGE',
  PREGNANCY: 'PREGNANCY',
  LACTATION: 'LACTATION',
  CHRONIC_KIDNEY_DISEASE: 'CHRONIC_KIDNEY_DISEASE',

  // Condições para encaminhamento profissional (PROFESSIONAL_REFERRAL)
  EATING_DISORDER_HISTORY: 'EATING_DISORDER_HISTORY',
  TYPE_1_DIABETES: 'TYPE_1_DIABETES',
  TYPE_2_DIABETES_UNCONTROLLED: 'TYPE_2_DIABETES_UNCONTROLLED',
  SEVERE_CARDIOVASCULAR_CONDITION: 'SEVERE_CARDIOVASCULAR_CONDITION',

  // Limitações / ausência de refinamento (LIMITED_GUIDANCE)
  BIOLOGICAL_SEX_UNSPECIFIED: 'BIOLOGICAL_SEX_UNSPECIFIED',
  INVALID_AGE: 'INVALID_AGE',
  INVALID_HEIGHT: 'INVALID_HEIGHT',
  INVALID_WEIGHT: 'INVALID_WEIGHT',
  MARGINAL_BIOMETRICS: 'MARGINAL_BIOMETRICS',
} as const;

export type NutritionGateReason =
  (typeof NUTRITION_GATE_REASONS)[keyof typeof NUTRITION_GATE_REASONS];

/**
 * Chaves padronizadas de aviso para a camada de apresentação / UI.
 */
export const NUTRITION_GATE_NOTICE_KEYS = {
  NORMAL_FLOW: 'NUTRITION_GATE_NORMAL_FLOW',
  LIMITED_GUIDANCE: 'NUTRITION_GATE_LIMITED_GUIDANCE',
  PROFESSIONAL_REFERRAL: 'NUTRITION_GATE_PROFESSIONAL_REFERRAL',
  BLOCK_AUTOMATIC_TARGET: 'NUTRITION_GATE_BLOCK_AUTOMATIC_TARGET',
} as const;

/**
 * Flags de saúde que impõem bloqueio absoluto de cálculo calórico automático.
 */
export const BLOCKING_HEALTH_FLAGS: ReadonlySet<HealthFlag> = new Set<HealthFlag>([
  'underage',
  'pregnancy',
  'lactation',
  'chronic_kidney_disease',
]);

/**
 * Flags de saúde que exigem encaminhamento a nutricionista/médico.
 */
export const REFERRAL_HEALTH_FLAGS: ReadonlySet<HealthFlag> = new Set<HealthFlag>([
  'eating_disorder_history',
  'type_1_diabetes',
  'type_2_diabetes_uncontrolled',
  'severe_cardiovascular_condition',
]);

/**
 * Parâmetros biométricos de referência para validação fisiológica.
 */
export const BIOMETRIC_LIMITS = {
  AGE_MIN_ADULT: 18,
  HEIGHT_CM_MIN: 100,
  HEIGHT_CM_MAX: 250,
  WEIGHT_KG_MIN: 30,
  WEIGHT_KG_MAX: 300,
} as const;

/**
 * Avalia deterministicamente o NutritionProfile contra as políticas de segurança ética e clínica.
 *
 * Precedência estrita:
 * 1. BLOCK_AUTOMATIC_TARGET (menores de 18, gestação, lactação, doença renal crônica)
 * 2. PROFESSIONAL_REFERRAL (histórico de transtorno alimentar, diabetes descompensado, condição CV grave)
 * 3. LIMITED_GUIDANCE (sexo biológico unspecified, biometria ausente ou valores limítrofes marginais)
 * 4. NORMAL_FLOW (adulto saudável suportado com perfil completo)
 *
 * Regras invioláveis:
 * - Proibido fallback implícito para 'male' (D-NUT-02).
 * - Um blocker forte nunca é rebaixado para LIMITED_GUIDANCE por sexo 'unspecified'.
 * - allowManualTracking permanece sempre true em todos os estados.
 */
export function evaluateNutritionGate(profile: NutritionProfile): NutritionGateResult {
  const flags = Array.isArray(profile.healthFlags) ? profile.healthFlags : [];

  const blockingReasons: string[] = [];
  const referralReasons: string[] = [];
  const guidanceReasons: string[] = [];

  // 1. Verificação de menoridade (idade cronológica < 18 ou flag explícita)
  const isChronologicallyUnderage =
    typeof profile.age === 'number' &&
    Number.isFinite(profile.age) &&
    profile.age < BIOMETRIC_LIMITS.AGE_MIN_ADULT;
  const hasUnderageFlag = flags.includes('underage');

  if (isChronologicallyUnderage || hasUnderageFlag) {
    blockingReasons.push(NUTRITION_GATE_REASONS.UNDERAGE);
  }

  // 2. Verificação de outros bloqueadores clínicos absolutos
  if (flags.includes('pregnancy')) {
    blockingReasons.push(NUTRITION_GATE_REASONS.PREGNANCY);
  }
  if (flags.includes('lactation')) {
    blockingReasons.push(NUTRITION_GATE_REASONS.LACTATION);
  }
  if (flags.includes('chronic_kidney_disease')) {
    blockingReasons.push(NUTRITION_GATE_REASONS.CHRONIC_KIDNEY_DISEASE);
  }

  // 3. Verificação de condições para encaminhamento profissional
  if (flags.includes('eating_disorder_history')) {
    referralReasons.push(NUTRITION_GATE_REASONS.EATING_DISORDER_HISTORY);
  }
  if (flags.includes('type_1_diabetes')) {
    referralReasons.push(NUTRITION_GATE_REASONS.TYPE_1_DIABETES);
  }
  if (flags.includes('type_2_diabetes_uncontrolled')) {
    referralReasons.push(NUTRITION_GATE_REASONS.TYPE_2_DIABETES_UNCONTROLLED);
  }
  if (flags.includes('severe_cardiovascular_condition')) {
    referralReasons.push(NUTRITION_GATE_REASONS.SEVERE_CARDIOVASCULAR_CONDITION);
  }

  // 4. Verificação de sexo metabólico não especificado (D-NUT-02)
  if (profile.biologicalSexForCalcs === 'unspecified') {
    guidanceReasons.push(NUTRITION_GATE_REASONS.BIOLOGICAL_SEX_UNSPECIFIED);
  }

  // 5. Verificação de integridade biométrica básica
  const hasValidAge =
    typeof profile.age === 'number' && Number.isFinite(profile.age) && profile.age > 0;
  const hasValidHeight =
    typeof profile.heightCm === 'number' && Number.isFinite(profile.heightCm) && profile.heightCm > 0;
  const hasValidWeight =
    typeof profile.weightKg === 'number' && Number.isFinite(profile.weightKg) && profile.weightKg > 0;

  if (!hasValidAge) {
    guidanceReasons.push(NUTRITION_GATE_REASONS.INVALID_AGE);
  }
  if (!hasValidHeight) {
    guidanceReasons.push(NUTRITION_GATE_REASONS.INVALID_HEIGHT);
  }
  if (!hasValidWeight) {
    guidanceReasons.push(NUTRITION_GATE_REASONS.INVALID_WEIGHT);
  }

  // 6. Verificação de limites marginais/extremos
  const hasMarginalHeight =
    hasValidHeight &&
    (profile.heightCm < BIOMETRIC_LIMITS.HEIGHT_CM_MIN ||
      profile.heightCm > BIOMETRIC_LIMITS.HEIGHT_CM_MAX);
  const hasMarginalWeight =
    hasValidWeight &&
    (profile.weightKg < BIOMETRIC_LIMITS.WEIGHT_KG_MIN ||
      profile.weightKg > BIOMETRIC_LIMITS.WEIGHT_KG_MAX);

  if (hasMarginalHeight || hasMarginalWeight) {
    guidanceReasons.push(NUTRITION_GATE_REASONS.MARGINAL_BIOMETRICS);
  }

  const allBiometricsValid = hasValidAge && hasValidHeight && hasValidWeight;

  // Nível 1 de Precedência: BLOCK_AUTOMATIC_TARGET
  if (blockingReasons.length > 0) {
    return {
      status: 'BLOCK_AUTOMATIC_TARGET',
      reasons: [...blockingReasons, ...referralReasons, ...guidanceReasons],
      userNoticeKey: NUTRITION_GATE_NOTICE_KEYS.BLOCK_AUTOMATIC_TARGET,
      allowManualTracking: true,
      allowAutomatedTargets: false,
      suggestedAction: 'CONSULT_DIETITIAN',
    };
  }

  // Nível 2 de Precedência: PROFESSIONAL_REFERRAL
  if (referralReasons.length > 0) {
    return {
      status: 'PROFESSIONAL_REFERRAL',
      reasons: [...referralReasons, ...guidanceReasons],
      userNoticeKey: NUTRITION_GATE_NOTICE_KEYS.PROFESSIONAL_REFERRAL,
      allowManualTracking: true,
      allowAutomatedTargets: false,
      suggestedAction: 'CONSULT_DIETITIAN',
    };
  }

  // Nível 3 de Precedência: LIMITED_GUIDANCE
  if (guidanceReasons.length > 0) {
    return {
      status: 'LIMITED_GUIDANCE',
      reasons: guidanceReasons,
      userNoticeKey: NUTRITION_GATE_NOTICE_KEYS.LIMITED_GUIDANCE,
      allowManualTracking: true,
      allowAutomatedTargets: allBiometricsValid,
      suggestedAction: 'PROVIDE_DETAILS',
    };
  }

  // Nível 4 de Precedência: NORMAL_FLOW
  return {
    status: 'NORMAL_FLOW',
    reasons: [],
    userNoticeKey: NUTRITION_GATE_NOTICE_KEYS.NORMAL_FLOW,
    allowManualTracking: true,
    allowAutomatedTargets: true,
    suggestedAction: 'PROCEED',
  };
}
