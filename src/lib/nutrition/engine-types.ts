/**
 * GymFlow AI — Contratos do Motor Nutricional Canônico (NUT-003)
 *
 * Referências canônicas:
 * - docs/nutrition/GYMFLOW_NUTRITION_MASTERPLAN_001.md (Seções 5.2, 7, 8 e 9.2)
 * - docs/nutrition/GYMFLOW_NUTRITION_DECISIONS_001.md (D-NUT-01, D-NUT-02, D-NUT-03, D-NUT-04)
 * - docs/nutrition/GYMFLOW_NUTRITION_IMPLEMENTATION_GOALS_001.md (NUT-003)
 *
 * Separação estrutural deste contrato:
 * - `EngineCalculationConfig`: parâmetros que alteram números de saída. Entram INTEGRALMENTE
 *   no `inputSnapshotHash` (garantia de tipo em `NutritionInputSnapshot.effectiveParameters`).
 * - `EngineComputationContext`: metadados de evento (`computedAt`, `computedReason`).
 *   NÃO alteram números e NÃO entram no snapshot determinístico, apenas na identidade de evento.
 * - `ENGINE_HARD_SAFETY_LIMITS`: invariantes absolutos. Não são ajustáveis por configuração;
 *   configuração que tente ultrapassá-los falha fechada (`NutritionEngineConfigError`).
 */

import type {
  ActivityLevel,
  BiologicalSexForCalcs,
  DietaryPattern,
  HealthFlag,
  NutritionGateResult,
  NutritionGoal,
} from '../../types/nutrition';

// ============================================================================
// ENUMERAÇÕES CANÔNICAS (VALIDAÇÃO EM RUNTIME)
// ============================================================================

export const NUTRITION_GOALS: readonly NutritionGoal[] = Object.freeze([
  'fat_loss_aggressive',
  'fat_loss_moderate',
  'maintenance',
  'hypertrophy_lean',
  'hypertrophy_aggressive',
  'strength_performance',
]);

export const ACTIVITY_LEVELS: readonly ActivityLevel[] = Object.freeze([
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
]);

export const DIETARY_PATTERNS: readonly DietaryPattern[] = Object.freeze([
  'omnivore',
  'flexitarian',
  'vegetarian',
  'vegan',
  'pescatarian',
  'low_carb',
  'ketogenic',
]);

export const BIOLOGICAL_SEXES_FOR_CALCS: readonly BiologicalSexForCalcs[] = Object.freeze([
  'female',
  'male',
  'unspecified',
]);

/**
 * Razão determinística da computação dos alvos diários.
 */
export type ComputedReason =
  | 'initial_setup'
  | 'profile_update'
  | 'weight_checkin'
  | 'manual_override';

export const COMPUTED_REASONS: readonly ComputedReason[] = Object.freeze([
  'initial_setup',
  'profile_update',
  'weight_checkin',
  'manual_override',
]);

/**
 * Metadados de status científico das equações provisórias do V1.
 */
export type ScientificStatus = 'PROVISIONAL_PENDING_PROFESSIONAL_REVIEW';

// ============================================================================
// INVARIANTES ABSOLUTOS (NÃO CONFIGURÁVEIS)
// ============================================================================

/**
 * Limites duros de segurança do motor. Diferente de `EngineConfig`, estes valores
 * NÃO são ajustáveis: qualquer configuração que tente ultrapassá-los é rejeitada
 * com `NutritionEngineConfigError` (fail-closed), sem clamp silencioso.
 *
 * Origem canônica de cada limite:
 * - Déficit máximo, piso BMR * 0.90 e pisos calóricos: Masterplan 7.2.
 * - Teto de proteína 2.2 g/kg: Masterplan 8.1 / D-NUT-04.
 * - Faixa de PAL 1.2 a 1.75: Masterplan 7.2.
 * - Faixa de lipídios 0.7 a 1.0 g/kg/dia: Masterplan 8.2.
 * - Teto de hidratação 4500 ml/dia: Masterplan 9.2.
 * - Offsets de BMR por sexo (Mifflin-St Jeor) e proibição de default masculino: D-NUT-02.
 * - Teto de superávit e de custo de treino: maior valor positivo já canonizado em
 *   `DEFAULT_CALCULATION_CONFIG` (nenhum número clínico novo foi introduzido).
 *
 * Simetria de direção: os limites cobrem tanto a direção hipocalórica (déficit, pisos)
 * quanto a hipercalórica (superávit, custo de treino). Nenhum override público pode
 * empurrar o alvo para fora do envelope canônico em qualquer das duas direções.
 *
 * PROFESSIONAL_REVIEW_REQUIRED (valores provisórios pendentes de revisão profissional).
 */
export const ENGINE_HARD_SAFETY_LIMITS = Object.freeze({
  /** Déficit calórico absoluto programado nunca pode passar de 750 kcal/dia. */
  MAX_ABSOLUTE_DEFICIT_KCAL: 750,

  /**
   * Superávit calórico programado nunca pode passar do maior ajuste positivo canônico
   * (`hypertrophy_aggressive: +400` em `DEFAULT_CALCULATION_CONFIG.goalAdjustments`).
   * Não é um número clínico novo: é a formalização do teto já praticado pelo contrato.
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  MAX_GOAL_SURPLUS_KCAL: 400,

  /** Em déficit, o alvo nunca pode descer abaixo de BMR * 0.90. */
  MIN_BMR_MULTIPLIER_IN_DEFICIT: 0.9,

  /**
   * Acima de 1.0 o parâmetro deixa de ser piso de déficit e passa a forçar superávit;
   * limite estrutural para preservar a semântica do multiplicador.
   */
  MAX_BMR_MULTIPLIER_IN_DEFICIT: 1.0,

  /**
   * Pisos calóricos absolutos de emergência (Masterplan 7.2). Deixaram de ser
   * configuráveis: como o único valor justificável por documento canônico é o próprio
   * valor canônico, o override público não teria liberdade semântica real e só servia
   * como caminho para alvos arbitrariamente altos.
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  FEMALE_CALORIC_FLOOR_KCAL: 1200,
  MALE_CALORIC_FLOOR_KCAL: 1500,
  /** D-NUT-02: `unspecified` nunca recebe o piso masculino. */
  UNSPECIFIED_CALORIC_FLOOR_KCAL: 1200,

  /** D-NUT-04: automação nunca acima de 2.2 g/kg/dia de proteína. */
  MAX_PROTEIN_GRAMS_PER_KG: 2.2,

  /** Faixa canônica de lipídios de suporte essencial (Masterplan 8.2). */
  MIN_FAT_GRAMS_PER_KG: 0.7,
  MAX_FAT_GRAMS_PER_KG: 1.0,

  /**
   * Custo energético máximo por minuto de treino: o próprio valor canônico vigente
   * (`trainingKcalPerMinute: 6`). Impede que o componente de treino do TDEE seja
   * usado como via alternativa de superávit arbitrário.
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  MAX_TRAINING_KCAL_PER_MINUTE: 6,

  /** Faixa canônica vigente de PAL (Masterplan 7.2). */
  MIN_PAL_FACTOR: 1.2,
  MAX_PAL_FACTOR: 1.75,

  /** Teto máximo de hidratação automatizada (prevenção de hiponatremia). */
  MAX_HYDRATION_ML_PER_DAY: 4500,

  /** Offsets canônicos de Mifflin-St Jeor usados como fronteira para `unspecified`. */
  MALE_BMR_OFFSET: 5,
  FEMALE_BMR_OFFSET: -161,

  /** Guarda estrutural (não clínica) para duração diária de treino. */
  MAX_TRAINING_DURATION_MINUTES: 1440,

  /** Guarda estrutural (não clínica) para frequência semanal de treino. */
  MAX_TRAINING_DAYS_PER_WEEK: 7,
});

/**
 * Tolerância ampliada exigida pelo Masterplan 5.2 quando `biologicalSexForCalcs === 'unspecified'`.
 * É uma declaração de incerteza (guidance), NUNCA um ajuste automático do alvo.
 */
export const UNSPECIFIED_ESTIMATION_RELATIVE_TOLERANCE = 0.15;

/**
 * Tolerâncias inevitáveis de arredondamento inteiro na reconciliação de macros.
 * O macro residual é arredondado para grama inteira: meio grama de carboidrato = 2 kcal,
 * meio grama de lipídio = 4.5 kcal.
 */
export const MACRO_ROUNDING_TOLERANCE_KCAL = Object.freeze({
  CARBS_RESIDUAL: 2,
  FAT_RESIDUAL: 4.5,
});

// ============================================================================
// RECONCILIAÇÃO DE MACROS E TOLERÂNCIA DE ESTIMATIVA
// ============================================================================

/**
 * Constraints estruturais que podem não ser atendidas pela partição de macros.
 * O motor nunca finge reconciliação: quando a igualdade energética é impossível,
 * o estado é exposto de forma tipada.
 */
export type MacroConstraintCode =
  /** Energia alvo insuficiente para proteína + lipídio essencial mínimo (+ carboidrato keto). */
  | 'ENERGY_BELOW_MACRO_MINIMUMS'
  /** Preferência de carboidratos não cetogênicos não atingida (preferência, não invariante). */
  | 'NON_KETO_CARBS_PREFERENCE_UNMET';

/**
 * Estado explícito de reconciliação energética entre macros e `targetCalories`.
 *
 * `isReconciled === true` garante que a divergência absoluta não passa de
 * `roundingToleranceKcal`, isto é, apenas o arredondamento inteiro inevitável.
 */
export interface MacroReconciliation {
  /** 4 * proteína + 4 * carboidrato + 9 * lipídio. */
  macroCalories: number;
  /** Alvo calórico efetivamente emitido. */
  targetCalories: number;
  /** macroCalories - targetCalories (positivo = macros acima do alvo). */
  deltaKcal: number;
  /** Tolerância inevitável de arredondamento aplicável ao padrão alimentar. */
  roundingToleranceKcal: number;
  /** true somente quando o desvio absoluto cabe em `roundingToleranceKcal`. */
  isReconciled: boolean;
  /** Constraints estruturais não atendidas (lista determinística e ordenada). */
  unmetConstraints: MacroConstraintCode[];
}

export type EstimationToleranceReason = 'BIOLOGICAL_SEX_UNSPECIFIED' | 'NONE';

/**
 * Tolerância declarada do alvo calórico (Masterplan 5.2).
 * Para `unspecified`, `relative` é 0.15 (mais ou menos 15%) e as bordas são informativas:
 * o alvo emitido NÃO é ajustado por elas.
 */
export interface EstimationTolerance {
  relative: number;
  reason: EstimationToleranceReason;
  targetCaloriesLowerKcal: number;
  targetCaloriesUpperKcal: number;
}

/**
 * Origem do carimbo temporal do cálculo.
 * - `explicit_context`: instante fornecido explicitamente pelo chamador.
 * - `absent`: nenhum instante foi fornecido; `computedAt` permanece `null`.
 *   O motor NUNCA inventa data (nem `profile.updatedAt`, nem literal hardcoded).
 */
export type ComputedAtSource = 'explicit_context' | 'absent';

// ============================================================================
// CONTRATO DE SAÍDA
// ============================================================================

/**
 * Contrato de Alvos Diários emitidos pelo NutritionEngine (Masterplan Seção 7.1).
 */
export interface DailyTargets {
  /**
   * Identidade de EVENTO do cálculo: deriva de `inputSnapshotHash` + `computedAt` + `computedReason`.
   * Dois cálculos do mesmo snapshot com razão ou instante diferentes NÃO colidem.
   */
  id: string;

  engineVersion: string; // ex: '1.0.0'
  formulaVersion: string; // ex: 'mifflin-st-jeor-v1'

  /**
   * Identidade determinística do SNAPSHOT de entrada (SHA-256 hex completo).
   * Cobre biometria, estilo de vida, versões e a totalidade dos parâmetros de cálculo.
   * Não cobre metadados de evento (`computedAt`, `computedReason`), que não alteram números.
   */
  inputSnapshotHash: string;

  /** Instante do cálculo (ISO 8601 UTC) quando fornecido explicitamente; `null` caso contrário. */
  computedAt: string | null;
  computedAtSource: ComputedAtSource;
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
  isLimitedGuidance: boolean;

  /**
   * Piso calórico de emergência aplicável ao sexo metabólico do perfil.
   * É o limite inferior considerado no cálculo — vinculante apenas quando o alvo bruto
   * ficaria abaixo dele. Comparar com `targetCalories` para saber se foi determinante.
   */
  appliedCaloricFloor: number;
  effectiveProteinGramsPerKg: number;
  effectiveFatGramsPerKg: number;
  macroReconciliation: MacroReconciliation;
  estimationTolerance: EstimationTolerance;
}

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

/**
 * Parâmetros que participam do cálculo numérico.
 *
 * Regra estrutural: todo campo aqui declarado entra obrigatoriamente no
 * `inputSnapshotHash` (ver `NutritionInputSnapshot.effectiveParameters`).
 *
 * D-NUT-03: parâmetros metabólicos e fisiológicos provisórios carregam a marcação
 * literal PROFESSIONAL_REVIEW_REQUIRED.
 */
export interface EngineCalculationConfig {
  /**
   * Constante BMR para sexo unspecified (ponto médio entre male +5 e female -161: -78).
   * NUNCA assume default masculino (D-NUT-02): valor deve ficar em [-161, +5).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  bmrUnspecifiedOffset?: number;

  /**
   * Fatores de Nível de Atividade Física. Faixa canônica dura: 1.2 a 1.75.
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  palFactors?: Record<ActivityLevel, number>;

  /**
   * Custo energético estimado por minuto de treino moderado/intenso (kcal/min).
   * Faixa dura: [0, 6] — o teto é o próprio valor canônico vigente, de modo que o
   * componente de treino do TDEE não vire via alternativa de superávit arbitrário.
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  trainingKcalPerMinute?: number; // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Ajuste de balanço energético diário por NutritionGoal (kcal/dia).
   *
   * Envelope duro, verificado sem clamp silencioso:
   * `-maxAbsoluteDeficitKcal <= ajuste <= MAX_GOAL_SURPLUS_KCAL` (+400).
   * Déficit fora do envelope e superávit acima do teto canônico são rejeitados
   * com `NutritionEngineConfigError`, não corrigidos em silêncio.
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  goalAdjustments?: Record<NutritionGoal, number>;

  /**
   * Limite máximo de déficit calórico absoluto programado.
   * Invariante dura: menor ou igual a 750 kcal/dia.
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  maxAbsoluteDeficitKcal?: number; // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Multiplicador mínimo de BMR em déficit. Invariante dura: entre 0.90 e 1.00.
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  minBmrMultiplierInDeficit?: number; // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Faixa de proteína conservadora automática por objetivo (g/kg/dia).
   * Cada valor deve pertencer a [minProteinGramsPerKg, maxProteinGramsPerKg];
   * valores fora da faixa são rejeitados (sem clamp silencioso).
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  proteinGramsPerKgByGoal?: Record<NutritionGoal, number>;

  /**
   * Proteína mínima permitida na partição automática (g/kg/dia).
   */
  minProteinGramsPerKg?: number; // 1.6

  /**
   * Proteína máxima permitida na partição automática (g/kg/dia).
   * Invariante dura: nunca acima de 2.2 (D-NUT-04).
   */
  maxProteinGramsPerKg?: number; // 2.2

  /**
   * Lipídios de suporte essencial padrão (g/kg/dia).
   * Faixa dura canônica (Masterplan 8.2): [0.7, 1.0].
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  defaultFatGramsPerKg?: number; // 0.85 // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Piso mínimo de lipídios essenciais (g/kg/dia). O motor nunca reduz lipídio abaixo
   * deste piso para financiar carboidratos. Faixa dura canônica: [0.7, 1.0].
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  minFatGramsPerKg?: number; // 0.70 // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Teto superior padrão de lipídios (g/kg/dia). Faixa dura canônica: [0.7, 1.0].
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  maxFatGramsPerKg?: number; // 1.00 // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * PREFERÊNCIA (não invariante) de carboidratos diários em dieta não cetogênica.
   *
   * Semântica real implementada: o motor tenta atingir este valor deslocando lipídio
   * até o piso essencial `minFatGramsPerKg`. Quando a energia disponível é insuficiente,
   * a preferência NÃO é atingida e o motor sinaliza `NON_KETO_CARBS_PREFERENCE_UNMET`
   * em `macroReconciliation.unmetConstraints`. Nenhuma garantia clínica de piso é prometida.
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  nonKetoCarbsPreferenceGrams?: number; // 120 // PROFESSIONAL_REVIEW_REQUIRED

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
   * Teto máximo seguro de hidratação automatizada. Invariante dura: nunca acima de 4500 ml/dia.
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  maxHydrationMlPerDay?: number; // 4500 // PROFESSIONAL_REVIEW_REQUIRED

  /**
   * Piso mínimo de hidratação (ml/dia). Deve ser positivo e não maior que `maxHydrationMlPerDay`.
   * PROFESSIONAL_REVIEW_REQUIRED
   */
  minHydrationMlPerDay?: number; // 1500 // PROFESSIONAL_REVIEW_REQUIRED
}

/**
 * Metadados de evento do cálculo. NÃO alteram nenhum número de saída e por isso
 * NÃO entram em `inputSnapshotHash` — apenas na identidade de evento (`DailyTargets.id`).
 */
export interface EngineComputationContext {
  /**
   * Instante do cálculo em ISO 8601. Deve vir de um contexto válido do chamador.
   * Quando omitido, `DailyTargets.computedAt` é `null` e `computedAtSource` é `'absent'`:
   * o motor não deriva data de `profile.updatedAt` nem de literal hardcoded, e não lê o relógio.
   */
  computedAt?: string;

  /** Motivo da computação. */
  computedReason?: ComputedReason;
}

/**
 * Versionamento canônico do motor e da fórmula metabólica (entra no snapshot).
 */
export interface EngineVersionConfig {
  engineVersion?: string;
  formulaVersion?: string;
}

/**
 * Configuração e parâmetros centralizados do NutritionEngine.
 */
export type EngineConfig = EngineCalculationConfig &
  EngineComputationContext &
  EngineVersionConfig;

/**
 * Pisos calóricos de emergência resolvidos.
 *
 * Não são configuráveis por `EngineCalculationConfig` (ver `ENGINE_HARD_SAFETY_LIMITS`),
 * mas continuam participando do cálculo e, por isso, do `inputSnapshotHash`:
 * proveniência cobre todo input efetivo, configurável ou não.
 */
export interface ResolvedCaloricFloors {
  femaleCaloricFloorKcal: number;
  maleCaloricFloorKcal: number;
  unspecifiedCaloricFloorKcal: number;
}

/** Configuração de cálculo totalmente resolvida (todos os campos presentes). */
export type ResolvedCalculationConfig = Required<EngineCalculationConfig> &
  ResolvedCaloricFloors;

/**
 * Chaves canônicas aceitas em `EngineConfig`.
 *
 * Qualquer outra chave é rejeitada com `UNKNOWN_CONFIG_KEY`: um override removido do
 * contrato (por exemplo os antigos pisos calóricos ou os percentuais de gordura) nunca
 * é silenciosamente ignorado — o chamador é informado de que o parâmetro não existe
 * mais, em vez de seguir acreditando que ele está em vigor.
 */
export const ENGINE_CONFIG_KEYS: readonly string[] = Object.freeze([
  // EngineCalculationConfig
  'bmrUnspecifiedOffset',
  'palFactors',
  'trainingKcalPerMinute',
  'goalAdjustments',
  'maxAbsoluteDeficitKcal',
  'minBmrMultiplierInDeficit',
  'proteinGramsPerKgByGoal',
  'minProteinGramsPerKg',
  'maxProteinGramsPerKg',
  'defaultFatGramsPerKg',
  'minFatGramsPerKg',
  'maxFatGramsPerKg',
  'nonKetoCarbsPreferenceGrams',
  'ketogenicCarbsGrams',
  'baseHydrationMlPerKg',
  'trainingHydrationMlPerHour',
  'maxHydrationMlPerDay',
  'minHydrationMlPerDay',
  // EngineComputationContext
  'computedAt',
  'computedReason',
  // EngineVersionConfig
  'engineVersion',
  'formulaVersion',
]);

/** Contexto de evento totalmente resolvido. */
export interface ResolvedComputationContext {
  engineVersion: string;
  formulaVersion: string;
  computedAt: string | null;
  computedAtSource: ComputedAtSource;
  computedReason: ComputedReason;
}

/** Configuração completa resolvida (cálculo + versões + evento). */
export type ResolvedEngineConfig = ResolvedCalculationConfig & {
  engineVersion: string;
  formulaVersion: string;
  computedAt: string | null;
  computedReason: ComputedReason;
};

/**
 * Parâmetros canônicos padrão de cálculo (imutáveis).
 * Todos os parâmetros provisórios trazem marcação formal D-NUT-03.
 */
export const DEFAULT_CALCULATION_CONFIG: Readonly<ResolvedCalculationConfig> = Object.freeze({
  // BMR unspecified: ponto médio (-78) entre +5 (male) e -161 (female)
  // PROFESSIONAL_REVIEW_REQUIRED
  bmrUnspecifiedOffset: -78,

  // PAL (faixa canônica 1.2 a 1.75)
  // PROFESSIONAL_REVIEW_REQUIRED
  palFactors: Object.freeze({
    sedentary: 1.2, // PROFESSIONAL_REVIEW_REQUIRED
    lightly_active: 1.375, // PROFESSIONAL_REVIEW_REQUIRED
    moderately_active: 1.55, // PROFESSIONAL_REVIEW_REQUIRED
    very_active: 1.725, // PROFESSIONAL_REVIEW_REQUIRED
  }) as Record<ActivityLevel, number>,

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
  }) as Record<NutritionGoal, number>,

  // Trava de déficit calórico absoluto máximo
  // PROFESSIONAL_REVIEW_REQUIRED
  maxAbsoluteDeficitKcal: 750,

  // Proteção: em déficit, target não desce abaixo de BMR * 0.90
  // PROFESSIONAL_REVIEW_REQUIRED
  minBmrMultiplierInDeficit: 0.9,

  // Pisos de segurança absoluta — invariantes, não configuráveis.
  // Derivados diretamente de ENGINE_HARD_SAFETY_LIMITS para que exista uma única
  // fonte de verdade e nenhuma cópia possa divergir silenciosamente.
  femaleCaloricFloorKcal: ENGINE_HARD_SAFETY_LIMITS.FEMALE_CALORIC_FLOOR_KCAL,
  maleCaloricFloorKcal: ENGINE_HARD_SAFETY_LIMITS.MALE_CALORIC_FLOOR_KCAL,
  // Proibido piso masculino a unspecified (D-NUT-02)
  unspecifiedCaloricFloorKcal: ENGINE_HARD_SAFETY_LIMITS.UNSPECIFIED_CALORIC_FLOOR_KCAL,

  // Proteína conservadora por objetivo (1.6 a 2.2 g/kg/dia)
  // D-NUT-04: Proibida automação acima de 2.2 g/kg
  // PROFESSIONAL_REVIEW_REQUIRED
  proteinGramsPerKgByGoal: Object.freeze({
    fat_loss_aggressive: 2.2, // Ponto superior para cutting agressivo // PROFESSIONAL_REVIEW_REQUIRED
    fat_loss_moderate: 2.0, // Ponto superior moderado // PROFESSIONAL_REVIEW_REQUIRED
    maintenance: 1.8, // Faixa central // PROFESSIONAL_REVIEW_REQUIRED
    hypertrophy_lean: 1.8, // Faixa central com suporte glicolítico // PROFESSIONAL_REVIEW_REQUIRED
    hypertrophy_aggressive: 1.7, // Efeito poupador de carboidratos abundantes // PROFESSIONAL_REVIEW_REQUIRED
    strength_performance: 1.9, // Suporte à força miofibrilar // PROFESSIONAL_REVIEW_REQUIRED
  }) as Record<NutritionGoal, number>,

  minProteinGramsPerKg: 1.6,
  maxProteinGramsPerKg: 2.2,

  // Lipídios de suporte essencial (0.7 a 1.0 g/kg/dia)
  // PROFESSIONAL_REVIEW_REQUIRED
  defaultFatGramsPerKg: 0.85,
  minFatGramsPerKg: 0.7,
  maxFatGramsPerKg: 1.0,

  // Carboidratos
  // PROFESSIONAL_REVIEW_REQUIRED
  nonKetoCarbsPreferenceGrams: 120, // Preferência best-effort (faixa canônica 100-130 g/dia)
  ketogenicCarbsGrams: 30, // Keto controlada

  // Hidratação
  // PROFESSIONAL_REVIEW_REQUIRED
  baseHydrationMlPerKg: 35, // 35 ml * pesoKg
  trainingHydrationMlPerHour: 500, // +500 ml por hora de esforço
  maxHydrationMlPerDay: 4500, // Teto preventivo de hiponatremia
  minHydrationMlPerDay: 1500,
});

/**
 * Configuração canônica padrão imutável do NutritionEngine (cálculo + versões + evento).
 */
export const DEFAULT_ENGINE_CONFIG: Readonly<ResolvedEngineConfig> = Object.freeze({
  ...DEFAULT_CALCULATION_CONFIG,
  engineVersion: '1.0.0',
  formulaVersion: 'mifflin-st-jeor-v1',
  computedAt: null,
  computedReason: 'profile_update' as ComputedReason,
});

// ============================================================================
// ERROS TIPADOS
// ============================================================================

/**
 * Códigos determinísticos de violação de contrato numérico/estrutural.
 */
export type EngineViolationCode =
  | 'NOT_FINITE'
  | 'NOT_POSITIVE'
  | 'NEGATIVE'
  | 'ABOVE_HARD_LIMIT'
  | 'BELOW_HARD_LIMIT'
  | 'ABOVE_RANGE'
  | 'BELOW_RANGE'
  | 'INCONSISTENT_RANGE'
  | 'INVALID_ENUM'
  | 'INVALID_NESTED_CONFIG'
  | 'UNKNOWN_NESTED_KEY'
  | 'UNKNOWN_CONFIG_KEY'
  | 'INVALID_TIMESTAMP'
  | 'EMPTY_STRING'
  | 'MALE_DEFAULT_FORBIDDEN';

/**
 * Violação individual de contrato, com caminho do campo e código determinístico.
 */
export interface EngineViolation {
  field: string;
  code: EngineViolationCode;
  message: string;
}

function formatViolations(violations: readonly EngineViolation[]): string {
  return violations.map((v) => `${v.field}: ${v.code} (${v.message})`).join('; ');
}

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
 * Erro tipado de configuração inválida (fail-closed).
 * Emitido quando `EngineConfig` tenta ultrapassar um invariante duro de segurança,
 * fornece número não finito/negativo ou quebra a consistência de faixas.
 */
export class NutritionEngineConfigError extends Error {
  readonly code = 'NUTRITION_ENGINE_CONFIG_INVALID' as const;
  readonly violations: readonly EngineViolation[];

  constructor(violations: readonly EngineViolation[]) {
    super(`Configuração do NutritionEngine rejeitada: ${formatViolations(violations)}`);
    this.name = 'NutritionEngineConfigError';
    this.violations = Object.freeze([...violations]);
    Object.setPrototypeOf(this, NutritionEngineConfigError.prototype);
  }
}

/**
 * Erro tipado de entrada inválida (fail-closed) para números/enumerações do perfil
 * e para a garantia final de finitude da saída.
 */
export class NutritionEngineInputError extends Error {
  readonly code = 'NUTRITION_ENGINE_INPUT_INVALID' as const;
  readonly violations: readonly EngineViolation[];

  constructor(violations: readonly EngineViolation[]) {
    super(`Entrada do NutritionEngine rejeitada: ${formatViolations(violations)}`);
    this.name = 'NutritionEngineInputError';
    this.violations = Object.freeze([...violations]);
    Object.setPrototypeOf(this, NutritionEngineInputError.prototype);
  }
}

/**
 * Erro tipado de serialização canônica.
 * O serializador nunca converte NaN/Infinity em `null` silenciosamente.
 */
export class NutritionEngineSerializationError extends Error {
  readonly code = 'NUTRITION_ENGINE_NON_FINITE_SERIALIZATION' as const;
  readonly path: string;

  constructor(path: string, value: number) {
    super(
      `Serialização canônica rejeitada: valor numérico não finito em "${path}" (${String(value)})`
    );
    this.name = 'NutritionEngineSerializationError';
    this.path = path;
    Object.setPrototypeOf(this, NutritionEngineSerializationError.prototype);
  }
}

// ============================================================================
// SNAPSHOT DE PROVENIÊNCIA
// ============================================================================

/**
 * Snapshot canônico dos inputs que influenciam o cálculo para proveniência SHA-256.
 *
 * `effectiveParameters` é tipado como `ResolvedCalculationConfig` (e não como uma
 * lista curada manualmente): qualquer parâmetro novo de cálculo entra automaticamente
 * no hash, impedindo que dois configs com saídas diferentes compartilhem o mesmo snapshot.
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
  effectiveParameters: ResolvedCalculationConfig;
}
