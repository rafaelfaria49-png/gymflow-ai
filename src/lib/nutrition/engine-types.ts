/**
 * GymFlow AI — Contratos do Motor Nutricional Canônico (NUT-003)
 *
 * Referências canônicas:
 * - docs/nutrition/GYMFLOW_NUTRITION_MASTERPLAN_001.md (Seções 7 e 8)
 * - docs/nutrition/GYMFLOW_NUTRITION_DECISIONS_001.md (D-NUT-01, D-NUT-02, D-NUT-03, D-NUT-04)
 * - docs/nutrition/GYMFLOW_NUTRITION_IMPLEMENTATION_GOALS_001.md (NUT-003)
 */

import type {
  ActivityLevel,
  BiologicalSexForCalcs,
  DietaryPattern,
  HealthFlag,
  NutritionGateResult,
  NutritionGoal,
} from '../../types/nutrition';

/**
 * Razão determinística da computação dos alvos diários.
 */
export type ComputedReason =
  | 'initial_setup'
  | 'profile_update'
  | 'weight_checkin'
  | 'manual_override';

/**
 * Metadados de status científico das equações provisórias do V1.
 */
export type ScientificStatus = 'PROVISIONAL_PENDING_PROFESSIONAL_REVIEW';

/**
 * Contrato de Alvos Diários emitidos pelo NutritionEngine (Masterplan Seção 7.1).
 */
export interface DailyTargets {
  // Identificação e Provenance
  id: string;
  engineVersion: string; // ex: '1.0.0'
  formulaVersion: string; // ex: 'mifflin-st-jeor-v1'
  inputSnapshotHash: string; // Hash SHA-256 estável dos inputs
  computedAt: string; // ISO 8601 UTC determinístico
  computedReason: ComputedReason;

  // Alvos Diários Principais
  targetCalories: number;
  targetProteinGrams: number;
  targetCarbsGrams: number;
  targetFatGrams: number;
  targetWaterMl: number;

  // Decomposição de Suporte Bioenergético
  bmrKcal: number;
  tdeeKcal: number;
  energyBalanceKcal: number; // ex: -500 para déficit, +200 para superávit

  // Marcadores Científicos e Auditoria
  scientificStatus: ScientificStatus;

  // Metadados Determinísticos de Transparência e Segurança
  isLimitedGuidance?: boolean;
  appliedCaloricFloor?: number;
  effectiveProteinGramsPerKg?: number;
  effectiveFatGramsPerKg?: number;
}

/**
 * Configuração e parâmetros centralizados do NutritionEngine.
 *
 * D-NUT-03: Todos os parâmetros metabólicos e fisiológicos provisórios
 * carregam formalmente a marcação literal: PROFESSIONAL_REVIEW_REQUIRED.
 */
export interface EngineConfig {
  /** Versão canônica do motor */
  engineVersion?: string;

  /** Versão da fórmula metabólica */
  formulaVersion?: string;

  /** Override de timestamp determinístico (se omitido, usa profile.updatedAt) */
  computedAtOverride?: string;

  /** Motivo da computação */
  computedReason?: ComputedReason;

  // --- PARÂMETROS PROVISÓRIOS COM MARCAÇÃO CANÔNICA (D-NUT-03) ---

  /**
   * Constante BMR para sexo unspecified (ponto médio entre male +5 e female -161: -78).
   * NUNCA assume default masculino (D-NUT-02).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  bmrUnspecifiedOffset?: number;

  /**
   * Fatores de Nível de Atividade Física (PAL: 1.2 a 1.75).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  palFactors?: {
    sedentary: number; // 1.20 // PROFESSIONAL_REVIEW_REQUIRED
    lightly_active: number; // 1.375 // PROFESSIONAL_REVIEW_REQUIRED
    moderately_active: number; // 1.55 // PROFESSIONAL_REVIEW_REQUIRED
    very_active: number; // 1.725 // PROFESSIONAL_REVIEW_REQUIRED
  };

  /**
   * Custo energético estimado por minuto de treino moderado/intenso (kcal/min).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  trainingKcalPerMinute?: number; // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Ajuste de balanço energético diário por NutritionGoal (kcal/dia).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  goalAdjustments?: {
    fat_loss_aggressive: number; // PROFESSIONAL_REVIEW_REQUIRED
    fat_loss_moderate: number; // PROFESSIONAL_REVIEW_REQUIRED
    maintenance: number;
    hypertrophy_lean: number; // PROFESSIONAL_REVIEW_REQUIRED
    hypertrophy_aggressive: number; // PROFESSIONAL_REVIEW_REQUIRED
    strength_performance: number; // PROFESSIONAL_REVIEW_REQUIRED
  };

  /**
   * Limite máximo de déficit calórico absoluto programado (<= 750 kcal/dia).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  maxAbsoluteDeficitKcal?: number; // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Multiplicador mínimo de BMR em déficit (target >= BMR * 0.9).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  minBmrMultiplierInDeficit?: number; // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Piso calórico absoluto de emergência feminino (>= 1200 kcal).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  femaleCaloricFloorKcal?: number; // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Piso calórico absoluto de emergência masculino (>= 1500 kcal).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  maleCaloricFloorKcal?: number; // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Piso calórico absoluto para sexo unspecified (1200 kcal — nunca piso masculino).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  unspecifiedCaloricFloorKcal?: number; // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Faixa de proteína conservadora automática (estritamente 1.6 a 2.2 g/kg/dia).
   * Bloqueada automação acima de 2.2 g/kg (D-NUT-04).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  proteinGramsPerKgByGoal?: {
    fat_loss_aggressive: number; // 2.2 // PROFESSIONAL_REVIEW_REQUIRED
    fat_loss_moderate: number; // 2.0 // PROFESSIONAL_REVIEW_REQUIRED
    maintenance: number; // 1.8 // PROFESSIONAL_REVIEW_REQUIRED
    hypertrophy_lean: number; // 1.8 // PROFESSIONAL_REVIEW_REQUIRED
    hypertrophy_aggressive: number; // 1.7 // PROFESSIONAL_REVIEW_REQUIRED
    strength_performance: number; // 1.9 // PROFESSIONAL_REVIEW_REQUIRED
  };

  /**
   * Proteína mínima permitida na partição automática (g/kg/dia).
   */
  minProteinGramsPerKg?: number; // 1.6

  /**
   * Proteína máxima permitida na partição automática (g/kg/dia).
   */
  maxProteinGramsPerKg?: number; // 2.2

  /**
   * Lipídios de suporte essencial padrão (g/kg/dia). Faixa: 0.7 a 1.0 g/kg/dia.
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  defaultFatGramsPerKg?: number; // 0.85 // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Piso mínimo de lipídios essenciais (g/kg/dia).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  minFatGramsPerKg?: number; // 0.70 // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Teto superior padrão de lipídios (g/kg/dia).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  maxFatGramsPerKg?: number; // 1.00 // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Percentual calórico mínimo de lipídios para saúde hormonal (20%).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  minFatCaloriePercentage?: number; // 0.20 // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Percentual calórico de lipídios em dieta cetogênica (70%).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  ketogenicFatCaloriePercentage?: number; // 0.70 // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Piso de carboidratos para dietas não cetogênicas (100 a 130 g/dia).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  nonKetoCarbsFloorGrams?: number; // 120 // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Alocação diária de carboidratos para dieta cetogênica (g/dia).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  ketogenicCarbsGrams?: number; // 30 // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Fator base de hidratação (35 ml/kg/dia).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  baseHydrationMlPerKg?: number; // 35 // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Adicional hídrico por hora de treino (ml/hora).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  trainingHydrationMlPerHour?: number; // 500 // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Teto máximo seguro de hidratação automatizada (<= 4500 ml/dia).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  maxHydrationMlPerDay?: number; // 4500 // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Piso mínimo de hidratação (ml/dia).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  minHydrationMlPerDay?: number; // 1500 // PROFESSIONAL_REVIEW_REQUIRED
}

/**
 * Configuração canônica padrão imutável do NutritionEngine.
 * Todos os parâmetros provisórios trazem marcação formal D-NUT-03.
 */
export const DEFAULT_ENGINE_CONFIG: Readonly<Required<EngineConfig>> = Object.freeze({
  engineVersion: '1.0.0',
  formulaVersion: 'mifflin-st-jeor-v1',
  computedAtOverride: '',
  computedReason: 'profile_update' as ComputedReason,

  // BMR unspecified: midpoint (-78) entre +5 (male) e -161 (female)
  // PROFESSIONAL_REVIEW_REQUIRED
  bmrUnspecifiedOffset: -78,

  // PAL (1.2 a 1.75)
  // PROFESSIONAL_REVIEW_REQUIRED
  palFactors: Object.freeze({
    sedentary: 1.2, // PROFESSIONAL_REVIEW_REQUIRED
    lightly_active: 1.375, // PROFESSIONAL_REVIEW_REQUIRED
    moderately_active: 1.55, // PROFESSIONAL_REVIEW_REQUIRED
    very_active: 1.725, // PROFESSIONAL_REVIEW_REQUIRED
  }),

  // Treino: ~6 kcal/min (~360 kcal/hora de treino moderado/intenso)
  // PROFESSIONAL_REVIEW_REQUIRED
  trainingKcalPerMinute: 6.0,

  // Balanço calórico por objetivo
  // PROFESSIONAL_REVIEW_REQUIRED
  goalAdjustments: Object.freeze({
    fat_loss_aggressive: -500, // PROFESSIONAL_REVIEW_REQUIRED
    fat_loss_moderate: -350, // PROFESSIONAL_REVIEW_REQUIRED
    maintenance: 0,
    hypertrophy_lean: 200, // PROFESSIONAL_REVIEW_REQUIRED
    hypertrophy_aggressive: 400, // PROFESSIONAL_REVIEW_REQUIRED
    strength_performance: 150, // PROFESSIONAL_REVIEW_REQUIRED
  }),

  // Trava de déficit calórico absoluto máximo
  // PROFESSIONAL_REVIEW_REQUIRED
  maxAbsoluteDeficitKcal: 750,

  // Proteção: em déficit, target não deve descer abaixo de BMR * 0.90
  // PROFESSIONAL_REVIEW_REQUIRED
  minBmrMultiplierInDeficit: 0.9,

  // Pisos de segurança absoluta
  // PROFESSIONAL_REVIEW_REQUIRED
  femaleCaloricFloorKcal: 1200,
  maleCaloricFloorKcal: 1500,
  unspecifiedCaloricFloorKcal: 1200, // Proibido piso masculino a unspecified (D-NUT-02)

  // Proteína conservadora por objetivo (1.6 a 2.2 g/kg/dia)
  // D-NUT-04: Proibida automação > 2.2 g/kg
  // PROFESSIONAL_REVIEW_REQUIRED
  proteinGramsPerKgByGoal: Object.freeze({
    fat_loss_aggressive: 2.2, // Ponto superior para cutting agressivo // PROFESSIONAL_REVIEW_REQUIRED
    fat_loss_moderate: 2.0, // Ponto superior moderado // PROFESSIONAL_REVIEW_REQUIRED
    maintenance: 1.8, // Faixa central // PROFESSIONAL_REVIEW_REQUIRED
    hypertrophy_lean: 1.8, // Faixa central com suporte glicolítico // PROFESSIONAL_REVIEW_REQUIRED
    hypertrophy_aggressive: 1.7, // Efeito poupador de carboidratos abundantes // PROFESSIONAL_REVIEW_REQUIRED
    strength_performance: 1.9, // Suporte à força miofibrilar // PROFESSIONAL_REVIEW_REQUIRED
  }),

  minProteinGramsPerKg: 1.6,
  maxProteinGramsPerKg: 2.2,

  // Lipídios de suporte essencial (0.7 a 1.0 g/kg/dia)
  // PROFESSIONAL_REVIEW_REQUIRED
  defaultFatGramsPerKg: 0.85,
  minFatGramsPerKg: 0.7,
  maxFatGramsPerKg: 1.0,
  minFatCaloriePercentage: 0.2,
  ketogenicFatCaloriePercentage: 0.7,

  // Carboidratos
  // PROFESSIONAL_REVIEW_REQUIRED
  nonKetoCarbsFloorGrams: 120, // Faixa canônica 100-130 g/dia
  ketogenicCarbsGrams: 30, // Keto controlada

  // Hidratação
  // PROFESSIONAL_REVIEW_REQUIRED
  baseHydrationMlPerKg: 35, // 35 ml * pesoKg
  trainingHydrationMlPerHour: 500, // +500 ml por hora de esforço
  maxHydrationMlPerDay: 4500, // Teto preventivo de hiponatremia
  minHydrationMlPerDay: 1500,
});

/**
 * Erro tipado emitido quando a avaliação do gate clínico bloqueia a geração automática de metas.
 */
export class NutritionEngineGateError extends Error {
  readonly code = 'NUTRITION_GATE_BLOCKED' as const;
  readonly gateResult: NutritionGateResult;

  constructor(gateResult: NutritionGateResult) {
    super(
      `Cálculo de metas nutricionais bloqueado pelo gate ético-clínico: status=${gateResult.status} (Razões: ${gateResult.reasons.join(', ')})`
    );
    this.name = 'NutritionEngineGateError';
    this.gateResult = gateResult;
    Object.setPrototypeOf(this, NutritionEngineGateError.prototype);
  }
}

/**
 * Snapshot canônico dos inputs que influenciam o cálculo para proveniência SHA-256.
 */
export interface NutritionInputSnapshot {
  biometrics: {
    age: number;
    biologicalSexForCalcs: BiologicalSexForCalcs;
    heightCm: number;
    weightKg: number;
  };
  lifestyle: {
    averageTrainingDurationMinutes: number;
    dietaryPattern: DietaryPattern;
    goal: NutritionGoal;
    healthFlags: HealthFlag[];
    nonExerciseActivity: ActivityLevel;
    trainingFrequencyDaysPerWeek: number;
  };
  versions: {
    engineVersion: string;
    formulaVersion: string;
  };
  effectiveParameters: {
    bmrUnspecifiedOffset: number;
    goalAdjustments: Record<string, number>;
    maxAbsoluteDeficitKcal: number;
    minBmrMultiplierInDeficit: number;
    palFactors: Record<string, number>;
    proteinGramsPerKgByGoal: Record<string, number>;
    caloricFloors: {
      female: number;
      male: number;
      unspecified: number;
    };
    fat: {
      defaultGramsPerKg: number;
      minGramsPerKg: number;
      maxGramsPerKg: number;
    };
    carbs: {
      nonKetoFloorGrams: number;
      ketogenicGrams: number;
    };
    hydration: {
      baseMlPerKg: number;
      trainingMlPerHour: number;
      maxMlPerDay: number;
    };
  };
}
