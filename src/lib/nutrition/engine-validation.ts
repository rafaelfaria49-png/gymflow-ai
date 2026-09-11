/**
 * GymFlow AI — Validação Fail-Closed do Motor Nutricional (NUT-003)
 *
 * Responsabilidade única: separar parâmetros ajustáveis de invariantes absolutos e
 * rejeitar de forma controlada (sem clamp silencioso) qualquer configuração, entrada
 * numérica ou saída que viole o contrato canônico.
 *
 * Pureza: nenhuma dependência de relógio, aleatoriedade, I/O ou `Date`.
 * A validação de timestamp é feita por gramática ISO 8601 UTC + aritmética de calendário.
 *
 * Referências canônicas:
 * - docs/nutrition/GYMFLOW_NUTRITION_MASTERPLAN_001.md (Seções 5.2, 7.2, 8.1 e 9.2)
 * - docs/nutrition/GYMFLOW_NUTRITION_DECISIONS_001.md (D-NUT-02, D-NUT-03, D-NUT-04)
 */

import type {
  ActivityLevel,
  BiologicalSexForCalcs,
  DietaryPattern,
  NutritionGoal,
  NutritionProfile,
} from '../../types/nutrition';
import {
  ACTIVITY_LEVELS,
  BIOLOGICAL_SEXES_FOR_CALCS,
  COMPUTED_REASONS,
  DIETARY_PATTERNS,
  ENGINE_HARD_SAFETY_LIMITS,
  NUTRITION_GOALS,
  type DailyTargets,
  type EngineViolation,
  type ResolvedEngineConfig,
} from './engine-types';

/** Folga numérica para comparações de ponto flutuante em invariantes de saída. */
const FLOAT_EPSILON = 1e-9;

// ============================================================================
// PRIMITIVAS DE VALIDAÇÃO
// ============================================================================

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function violation(
  field: string,
  code: EngineViolation['code'],
  message: string
): EngineViolation {
  return { field, code, message };
}

/**
 * Valida finitude. Retorna `false` (registrando violação) para NaN, Infinity,
 * -Infinity, `null`, `undefined` e qualquer valor não numérico.
 */
function requireFinite(
  field: string,
  value: unknown,
  violations: EngineViolation[]
): value is number {
  if (!isFiniteNumber(value)) {
    violations.push(
      violation(field, 'NOT_FINITE', `esperado número finito, recebido ${String(value)}`)
    );
    return false;
  }
  return true;
}

function requirePositive(field: string, value: number, violations: EngineViolation[]): boolean {
  if (value <= 0) {
    violations.push(violation(field, 'NOT_POSITIVE', `esperado valor > 0, recebido ${value}`));
    return false;
  }
  return true;
}

function requireNonNegative(field: string, value: number, violations: EngineViolation[]): boolean {
  if (value < 0) {
    violations.push(violation(field, 'NEGATIVE', `esperado valor >= 0, recebido ${value}`));
    return false;
  }
  return true;
}

function requireAtMost(
  field: string,
  value: number,
  limit: number,
  violations: EngineViolation[],
  code: EngineViolation['code'] = 'ABOVE_HARD_LIMIT'
): boolean {
  if (value > limit) {
    violations.push(violation(field, code, `limite máximo ${limit}, recebido ${value}`));
    return false;
  }
  return true;
}

function requireAtLeast(
  field: string,
  value: number,
  limit: number,
  violations: EngineViolation[],
  code: EngineViolation['code'] = 'BELOW_HARD_LIMIT'
): boolean {
  if (value < limit) {
    violations.push(violation(field, code, `limite mínimo ${limit}, recebido ${value}`));
    return false;
  }
  return true;
}

function requireEnum<T extends string>(
  field: string,
  value: unknown,
  allowed: readonly T[],
  violations: EngineViolation[]
): value is T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    violations.push(
      violation(
        field,
        'INVALID_ENUM',
        `valor fora da enumeração canônica [${allowed.join(', ')}]: ${String(value)}`
      )
    );
    return false;
  }
  return true;
}

function requireNonEmptyString(
  field: string,
  value: unknown,
  violations: EngineViolation[]
): boolean {
  if (typeof value !== 'string' || value.length === 0) {
    violations.push(violation(field, 'EMPTY_STRING', `esperada string não vazia: ${String(value)}`));
    return false;
  }
  return true;
}

/**
 * Valida um registro numérico aninhado do config (PAL, ajustes por objetivo, proteína por objetivo).
 * Rejeita estrutura inválida, chaves canônicas ausentes/não finitas e chaves desconhecidas.
 */
function validateNumericRecord(
  field: string,
  value: unknown,
  canonicalKeys: readonly string[],
  violations: EngineViolation[]
): Record<string, number> | null {
  if (!isPlainRecord(value)) {
    violations.push(
      violation(field, 'INVALID_NESTED_CONFIG', `esperado objeto simples, recebido ${String(value)}`)
    );
    return null;
  }

  let valid = true;
  for (const key of canonicalKeys) {
    if (!requireFinite(`${field}.${key}`, value[key], violations)) {
      valid = false;
    }
  }

  for (const key of Object.keys(value)) {
    if (!canonicalKeys.includes(key)) {
      violations.push(
        violation(`${field}.${key}`, 'UNKNOWN_NESTED_KEY', 'chave fora do contrato canônico')
      );
      valid = false;
    }
  }

  return valid ? (value as Record<string, number>) : null;
}

// ============================================================================
// TIMESTAMP ISO 8601 UTC (SEM DEPENDÊNCIA DE `Date`)
// ============================================================================

const ISO_UTC_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1];
}

/**
 * Verifica se o valor é um instante ISO 8601 UTC estrito e semanticamente válido.
 * Não usa `Date`, portanto não introduz dependência de relógio nem de fuso do runtime.
 */
export function isStrictIsoUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const match = ISO_UTC_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;

  return true;
}

// ============================================================================
// VALIDAÇÃO DE CONFIGURAÇÃO (INVARIANTES ABSOLUTOS)
// ============================================================================

/**
 * Valida a configuração já resolvida contra os invariantes duros de `ENGINE_HARD_SAFETY_LIMITS`.
 *
 * Política: fail-closed. Nenhum valor é corrigido/clampeado silenciosamente; o chamador
 * recebe a lista completa e determinística de violações.
 */
export function validateEngineConfig(config: ResolvedEngineConfig): EngineViolation[] {
  const violations: EngineViolation[] = [];
  const limits = ENGINE_HARD_SAFETY_LIMITS;

  // --- Versões e metadados de evento ---
  requireNonEmptyString('engineVersion', config.engineVersion, violations);
  requireNonEmptyString('formulaVersion', config.formulaVersion, violations);
  requireEnum('computedReason', config.computedReason, COMPUTED_REASONS, violations);

  if (config.computedAt !== null && !isStrictIsoUtcTimestamp(config.computedAt)) {
    violations.push(
      violation(
        'computedAt',
        'INVALID_TIMESTAMP',
        `esperado instante ISO 8601 UTC (YYYY-MM-DDTHH:MM:SS[.mmm]Z): ${String(config.computedAt)}`
      )
    );
  }

  // --- BMR para unspecified (D-NUT-02: nunca adotar o offset masculino) ---
  if (requireFinite('bmrUnspecifiedOffset', config.bmrUnspecifiedOffset, violations)) {
    if (config.bmrUnspecifiedOffset >= limits.MALE_BMR_OFFSET) {
      violations.push(
        violation(
          'bmrUnspecifiedOffset',
          'MALE_DEFAULT_FORBIDDEN',
          `offset de unspecified nunca pode alcançar o offset masculino (${limits.MALE_BMR_OFFSET})`
        )
      );
    }
    requireAtLeast(
      'bmrUnspecifiedOffset',
      config.bmrUnspecifiedOffset,
      limits.FEMALE_BMR_OFFSET,
      violations
    );
  }

  // --- PAL: faixa canônica dura 1.2 a 1.75 ---
  const palFactors = validateNumericRecord(
    'palFactors',
    config.palFactors,
    ACTIVITY_LEVELS,
    violations
  );
  if (palFactors) {
    for (const level of ACTIVITY_LEVELS) {
      const field = `palFactors.${level}`;
      requireAtMost(field, palFactors[level], limits.MAX_PAL_FACTOR, violations);
      requireAtLeast(field, palFactors[level], limits.MIN_PAL_FACTOR, violations);
    }
  }

  // --- Custo energético de treino ---
  if (requireFinite('trainingKcalPerMinute', config.trainingKcalPerMinute, violations)) {
    requireNonNegative('trainingKcalPerMinute', config.trainingKcalPerMinute, violations);
  }

  // --- Ajustes por objetivo ---
  validateNumericRecord('goalAdjustments', config.goalAdjustments, NUTRITION_GOALS, violations);

  // --- Déficit máximo absoluto ---
  if (requireFinite('maxAbsoluteDeficitKcal', config.maxAbsoluteDeficitKcal, violations)) {
    requirePositive('maxAbsoluteDeficitKcal', config.maxAbsoluteDeficitKcal, violations);
    requireAtMost(
      'maxAbsoluteDeficitKcal',
      config.maxAbsoluteDeficitKcal,
      limits.MAX_ABSOLUTE_DEFICIT_KCAL,
      violations
    );
  }

  // --- Piso relativo de BMR em déficit ---
  if (requireFinite('minBmrMultiplierInDeficit', config.minBmrMultiplierInDeficit, violations)) {
    requireAtLeast(
      'minBmrMultiplierInDeficit',
      config.minBmrMultiplierInDeficit,
      limits.MIN_BMR_MULTIPLIER_IN_DEFICIT,
      violations
    );
    requireAtMost(
      'minBmrMultiplierInDeficit',
      config.minBmrMultiplierInDeficit,
      limits.MAX_BMR_MULTIPLIER_IN_DEFICIT,
      violations
    );
  }

  // --- Pisos calóricos absolutos por sexo metabólico ---
  if (requireFinite('femaleCaloricFloorKcal', config.femaleCaloricFloorKcal, violations)) {
    requireAtLeast(
      'femaleCaloricFloorKcal',
      config.femaleCaloricFloorKcal,
      limits.MIN_FEMALE_CALORIC_FLOOR_KCAL,
      violations
    );
  }
  const maleFloorFinite = requireFinite(
    'maleCaloricFloorKcal',
    config.maleCaloricFloorKcal,
    violations
  );
  if (maleFloorFinite) {
    requireAtLeast(
      'maleCaloricFloorKcal',
      config.maleCaloricFloorKcal,
      limits.MIN_MALE_CALORIC_FLOOR_KCAL,
      violations
    );
  }
  if (requireFinite('unspecifiedCaloricFloorKcal', config.unspecifiedCaloricFloorKcal, violations)) {
    requireAtLeast(
      'unspecifiedCaloricFloorKcal',
      config.unspecifiedCaloricFloorKcal,
      limits.MIN_UNSPECIFIED_CALORIC_FLOOR_KCAL,
      violations
    );
    // D-NUT-02: unspecified nunca herda o piso masculino.
    if (maleFloorFinite && config.unspecifiedCaloricFloorKcal >= config.maleCaloricFloorKcal) {
      violations.push(
        violation(
          'unspecifiedCaloricFloorKcal',
          'MALE_DEFAULT_FORBIDDEN',
          `piso de unspecified (${config.unspecifiedCaloricFloorKcal}) nunca pode alcançar o piso masculino (${config.maleCaloricFloorKcal})`
        )
      );
    }
  }

  // --- Proteína: teto duro 2.2 g/kg (D-NUT-04) ---
  const minProteinFinite = requireFinite(
    'minProteinGramsPerKg',
    config.minProteinGramsPerKg,
    violations
  );
  if (minProteinFinite) {
    requirePositive('minProteinGramsPerKg', config.minProteinGramsPerKg, violations);
  }
  const maxProteinFinite = requireFinite(
    'maxProteinGramsPerKg',
    config.maxProteinGramsPerKg,
    violations
  );
  if (maxProteinFinite) {
    requirePositive('maxProteinGramsPerKg', config.maxProteinGramsPerKg, violations);
    requireAtMost(
      'maxProteinGramsPerKg',
      config.maxProteinGramsPerKg,
      limits.MAX_PROTEIN_GRAMS_PER_KG,
      violations
    );
  }
  if (
    minProteinFinite &&
    maxProteinFinite &&
    config.minProteinGramsPerKg > config.maxProteinGramsPerKg
  ) {
    violations.push(
      violation(
        'minProteinGramsPerKg',
        'INCONSISTENT_RANGE',
        `mínimo (${config.minProteinGramsPerKg}) acima do máximo (${config.maxProteinGramsPerKg})`
      )
    );
  }

  const proteinByGoal = validateNumericRecord(
    'proteinGramsPerKgByGoal',
    config.proteinGramsPerKgByGoal,
    NUTRITION_GOALS,
    violations
  );
  if (proteinByGoal && minProteinFinite && maxProteinFinite) {
    for (const goal of NUTRITION_GOALS) {
      const field = `proteinGramsPerKgByGoal.${goal}`;
      // Sem clamp silencioso: taxa fora da faixa declarada é rejeitada.
      requireAtMost(field, proteinByGoal[goal], config.maxProteinGramsPerKg, violations, 'ABOVE_RANGE');
      requireAtLeast(
        field,
        proteinByGoal[goal],
        config.minProteinGramsPerKg,
        violations,
        'BELOW_RANGE'
      );
    }
  }

  // --- Lipídios ---
  const minFatFinite = requireFinite('minFatGramsPerKg', config.minFatGramsPerKg, violations);
  if (minFatFinite) {
    requirePositive('minFatGramsPerKg', config.minFatGramsPerKg, violations);
  }
  const maxFatFinite = requireFinite('maxFatGramsPerKg', config.maxFatGramsPerKg, violations);
  if (maxFatFinite) {
    requirePositive('maxFatGramsPerKg', config.maxFatGramsPerKg, violations);
  }
  const defaultFatFinite = requireFinite(
    'defaultFatGramsPerKg',
    config.defaultFatGramsPerKg,
    violations
  );
  if (defaultFatFinite) {
    requirePositive('defaultFatGramsPerKg', config.defaultFatGramsPerKg, violations);
  }
  if (minFatFinite && maxFatFinite && config.minFatGramsPerKg > config.maxFatGramsPerKg) {
    violations.push(
      violation(
        'minFatGramsPerKg',
        'INCONSISTENT_RANGE',
        `mínimo (${config.minFatGramsPerKg}) acima do máximo (${config.maxFatGramsPerKg})`
      )
    );
  }
  if (defaultFatFinite && minFatFinite && maxFatFinite) {
    requireAtLeast(
      'defaultFatGramsPerKg',
      config.defaultFatGramsPerKg,
      config.minFatGramsPerKg,
      violations,
      'BELOW_RANGE'
    );
    requireAtMost(
      'defaultFatGramsPerKg',
      config.defaultFatGramsPerKg,
      config.maxFatGramsPerKg,
      violations,
      'ABOVE_RANGE'
    );
  }

  // --- Carboidratos ---
  if (
    requireFinite('nonKetoCarbsPreferenceGrams', config.nonKetoCarbsPreferenceGrams, violations)
  ) {
    requireNonNegative(
      'nonKetoCarbsPreferenceGrams',
      config.nonKetoCarbsPreferenceGrams,
      violations
    );
  }
  if (requireFinite('ketogenicCarbsGrams', config.ketogenicCarbsGrams, violations)) {
    requireNonNegative('ketogenicCarbsGrams', config.ketogenicCarbsGrams, violations);
  }

  // --- Hidratação: teto duro 4500 ml/dia ---
  if (requireFinite('baseHydrationMlPerKg', config.baseHydrationMlPerKg, violations)) {
    requireNonNegative('baseHydrationMlPerKg', config.baseHydrationMlPerKg, violations);
  }
  if (requireFinite('trainingHydrationMlPerHour', config.trainingHydrationMlPerHour, violations)) {
    requireNonNegative('trainingHydrationMlPerHour', config.trainingHydrationMlPerHour, violations);
  }
  const maxHydrationFinite = requireFinite(
    'maxHydrationMlPerDay',
    config.maxHydrationMlPerDay,
    violations
  );
  if (maxHydrationFinite) {
    requirePositive('maxHydrationMlPerDay', config.maxHydrationMlPerDay, violations);
    requireAtMost(
      'maxHydrationMlPerDay',
      config.maxHydrationMlPerDay,
      limits.MAX_HYDRATION_ML_PER_DAY,
      violations
    );
  }
  const minHydrationFinite = requireFinite(
    'minHydrationMlPerDay',
    config.minHydrationMlPerDay,
    violations
  );
  if (minHydrationFinite) {
    requirePositive('minHydrationMlPerDay', config.minHydrationMlPerDay, violations);
    requireAtMost(
      'minHydrationMlPerDay',
      config.minHydrationMlPerDay,
      limits.MAX_HYDRATION_ML_PER_DAY,
      violations
    );
  }
  if (
    maxHydrationFinite &&
    minHydrationFinite &&
    config.minHydrationMlPerDay > config.maxHydrationMlPerDay
  ) {
    violations.push(
      violation(
        'minHydrationMlPerDay',
        'INCONSISTENT_RANGE',
        `mínimo (${config.minHydrationMlPerDay}) acima do máximo (${config.maxHydrationMlPerDay})`
      )
    );
  }

  return violations;
}

// ============================================================================
// VALIDAÇÃO NUMÉRICA DO PERFIL
// ============================================================================

/**
 * Valida todos os números e enumerações efetivos do perfil antes de qualquer cálculo.
 * Rejeita NaN, Infinity, -Infinity, negativos inválidos, zero semanticamente inválido
 * e enumerações fora do contrato (que produziriam default oculto por fallback).
 */
export function validateProfileInputs(profile: NutritionProfile): EngineViolation[] {
  const violations: EngineViolation[] = [];
  const limits = ENGINE_HARD_SAFETY_LIMITS;

  if (requireFinite('profile.age', profile.age, violations)) {
    requirePositive('profile.age', profile.age, violations);
  }
  if (requireFinite('profile.heightCm', profile.heightCm, violations)) {
    requirePositive('profile.heightCm', profile.heightCm, violations);
  }
  if (requireFinite('profile.weightKg', profile.weightKg, violations)) {
    requirePositive('profile.weightKg', profile.weightKg, violations);
  }

  if (
    requireFinite(
      'profile.trainingFrequencyDaysPerWeek',
      profile.trainingFrequencyDaysPerWeek,
      violations
    )
  ) {
    requireNonNegative(
      'profile.trainingFrequencyDaysPerWeek',
      profile.trainingFrequencyDaysPerWeek,
      violations
    );
    requireAtMost(
      'profile.trainingFrequencyDaysPerWeek',
      profile.trainingFrequencyDaysPerWeek,
      limits.MAX_TRAINING_DAYS_PER_WEEK,
      violations
    );
  }

  if (
    requireFinite(
      'profile.averageTrainingDurationMinutes',
      profile.averageTrainingDurationMinutes,
      violations
    )
  ) {
    requireNonNegative(
      'profile.averageTrainingDurationMinutes',
      profile.averageTrainingDurationMinutes,
      violations
    );
    requireAtMost(
      'profile.averageTrainingDurationMinutes',
      profile.averageTrainingDurationMinutes,
      limits.MAX_TRAINING_DURATION_MINUTES,
      violations
    );
  }

  requireEnum<BiologicalSexForCalcs>(
    'profile.biologicalSexForCalcs',
    profile.biologicalSexForCalcs,
    BIOLOGICAL_SEXES_FOR_CALCS,
    violations
  );
  requireEnum<NutritionGoal>('profile.goal', profile.goal, NUTRITION_GOALS, violations);
  requireEnum<ActivityLevel>(
    'profile.nonExerciseActivity',
    profile.nonExerciseActivity,
    ACTIVITY_LEVELS,
    violations
  );
  requireEnum<DietaryPattern>(
    'profile.dietaryPattern',
    profile.dietaryPattern,
    DIETARY_PATTERNS,
    violations
  );

  if (
    profile.healthFlags !== undefined &&
    profile.healthFlags !== null &&
    !Array.isArray(profile.healthFlags)
  ) {
    violations.push(
      violation(
        'profile.healthFlags',
        'INVALID_NESTED_CONFIG',
        `esperado array de HealthFlag, recebido ${String(profile.healthFlags)}`
      )
    );
  }

  return violations;
}

// ============================================================================
// GARANTIA FINAL DE SAÍDA
// ============================================================================

/**
 * Última barreira do contrato: nenhum `DailyTargets` sai do motor com número não finito,
 * hidratação negativa ou proteína acima do teto duro de 2.2 g/kg.
 */
export function validateDailyTargetsOutput(
  targets: DailyTargets,
  profile: NutritionProfile
): EngineViolation[] {
  const violations: EngineViolation[] = [];
  const limits = ENGINE_HARD_SAFETY_LIMITS;

  const finiteFields: Array<[string, number]> = [
    ['targetCalories', targets.targetCalories],
    ['targetProteinGrams', targets.targetProteinGrams],
    ['targetCarbsGrams', targets.targetCarbsGrams],
    ['targetFatGrams', targets.targetFatGrams],
    ['targetWaterMl', targets.targetWaterMl],
    ['bmrKcal', targets.bmrKcal],
    ['tdeeKcal', targets.tdeeKcal],
    ['energyBalanceKcal', targets.energyBalanceKcal],
    ['appliedCaloricFloor', targets.appliedCaloricFloor],
    ['effectiveProteinGramsPerKg', targets.effectiveProteinGramsPerKg],
    ['effectiveFatGramsPerKg', targets.effectiveFatGramsPerKg],
    ['macroReconciliation.macroCalories', targets.macroReconciliation.macroCalories],
    ['macroReconciliation.deltaKcal', targets.macroReconciliation.deltaKcal],
    ['macroReconciliation.roundingToleranceKcal', targets.macroReconciliation.roundingToleranceKcal],
    ['estimationTolerance.relative', targets.estimationTolerance.relative],
    ['estimationTolerance.targetCaloriesLowerKcal', targets.estimationTolerance.targetCaloriesLowerKcal],
    ['estimationTolerance.targetCaloriesUpperKcal', targets.estimationTolerance.targetCaloriesUpperKcal],
  ];

  for (const [field, value] of finiteFields) {
    requireFinite(field, value, violations);
  }

  const nonNegativeFields: Array<[string, number]> = [
    ['targetProteinGrams', targets.targetProteinGrams],
    ['targetCarbsGrams', targets.targetCarbsGrams],
    ['targetFatGrams', targets.targetFatGrams],
    ['effectiveProteinGramsPerKg', targets.effectiveProteinGramsPerKg],
    ['effectiveFatGramsPerKg', targets.effectiveFatGramsPerKg],
  ];
  for (const [field, value] of nonNegativeFields) {
    if (isFiniteNumber(value)) {
      requireNonNegative(field, value, violations);
    }
  }

  if (isFiniteNumber(targets.targetWaterMl)) {
    requirePositive('targetWaterMl', targets.targetWaterMl, violations);
    requireAtMost(
      'targetWaterMl',
      targets.targetWaterMl,
      limits.MAX_HYDRATION_ML_PER_DAY,
      violations
    );
  }
  if (isFiniteNumber(targets.targetCalories)) {
    requirePositive('targetCalories', targets.targetCalories, violations);
  }

  // Teto duro de proteína após arredondamento (D-NUT-04).
  if (isFiniteNumber(targets.targetProteinGrams) && isFiniteNumber(profile.weightKg)) {
    const hardCapGrams = profile.weightKg * limits.MAX_PROTEIN_GRAMS_PER_KG + FLOAT_EPSILON;
    requireAtMost('targetProteinGrams', targets.targetProteinGrams, hardCapGrams, violations);
  }

  return violations;
}
