/**
 * GymFlow AI — Contratos Canônicos de Nutrição (NUT-002)
 *
 * Referências canônicas:
 * - docs/nutrition/GYMFLOW_NUTRITION_MASTERPLAN_001.md
 * - docs/nutrition/GYMFLOW_NUTRITION_DECISIONS_001.md (D-NUT-02)
 * - docs/nutrition/GYMFLOW_NUTRITION_IMPLEMENTATION_GOALS_001.md
 */

/**
 * Sexo metabólico estritamente para equações bioenergéticas (Mifflin-St Jeor / Harris-Benedict).
 * Conceito independente de gênero social (user.gender).
 * Proibido assumir 'male' como default implícito (D-NUT-02).
 */
export type BiologicalSexForCalcs = 'female' | 'male' | 'unspecified';

export type NutritionGoal =
  | 'fat_loss_aggressive'
  | 'fat_loss_moderate'
  | 'maintenance'
  | 'hypertrophy_lean'
  | 'hypertrophy_aggressive'
  | 'strength_performance';

export type ActivityLevel =
  | 'sedentary' // Trabalho de mesa, passos < 5.000/dia
  | 'lightly_active' // Atividade leve, passos 5.000-7.500/dia
  | 'moderately_active' // Atividade moderada, passos 7.500-10.000/dia
  | 'very_active'; // Trabalho braçal ou passos > 10.000/dia

export type DietaryPattern =
  | 'omnivore'
  | 'flexitarian'
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'low_carb'
  | 'ketogenic';

export type HealthFlag =
  | 'pregnancy'
  | 'lactation'
  | 'underage'
  | 'eating_disorder_history'
  | 'chronic_kidney_disease'
  | 'type_1_diabetes'
  | 'type_2_diabetes_uncontrolled'
  | 'severe_cardiovascular_condition';

export interface NutritionProfile {
  // Biometria
  age: number;
  heightCm: number;
  weightKg: number;

  // Sexo metabólico para equações energéticas (separado do gênero social)
  biologicalSexForCalcs: BiologicalSexForCalcs;

  // Metas e Treinamento
  goal: NutritionGoal;
  trainingFrequencyDaysPerWeek: number; // 0 a 7
  averageTrainingDurationMinutes: number;
  nonExerciseActivity: ActivityLevel;

  // Alvos corporais opcionais
  targetWeightKg?: number;
  targetPaceWeeks?: number;

  // Hábitos e Restrições Alimentares
  dietaryPattern: DietaryPattern;
  mealsPerDayPreference: number; // 2 a 6 refeições
  allergies: string[];
  intolerances: string[];
  avoidedFoods: string[];

  // Triagem de Segurança
  healthFlags: HealthFlag[];

  // Contexto Temporal
  timezone: string; // ex: 'America/Sao_Paulo'
  updatedAt: string; // ISO 8601
}

export type NutritionGateStatus =
  | 'NORMAL_FLOW'
  | 'LIMITED_GUIDANCE'
  | 'PROFESSIONAL_REFERRAL'
  | 'BLOCK_AUTOMATIC_TARGET';

export type NutritionSuggestedAction =
  | 'CONSULT_DIETITIAN'
  | 'PROVIDE_DETAILS'
  | 'PROCEED';

export interface NutritionGateResult {
  status: NutritionGateStatus;
  reasons: string[];
  userNoticeKey: string;
  allowManualTracking: boolean;
  allowAutomatedTargets: boolean;
  suggestedAction?: NutritionSuggestedAction;
}
