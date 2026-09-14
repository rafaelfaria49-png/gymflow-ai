/**
 * GymFlow AI — Guard estrito de NutritionProfile no core (NUT-004B)
 *
 * Persistido em `PersistedState` / `PersistedCoreState` como
 * `nutritionProfile?: NutritionProfile | null`.
 * - Envelope antigo sem campo continua válido e hidrata como null.
 * - Nenhuma derivação silenciosa de user.gender, user.goal ou
 *   user.restrictions: perfil ausente é PROFILE_ABSENT explícito.
 */

import type { NutritionProfile } from '../../types/nutrition';
import {
  ACTIVITY_LEVELS,
  BIOLOGICAL_SEXES_FOR_CALCS,
  DIETARY_PATTERNS,
  ENGINE_HARD_SAFETY_LIMITS,
  NUTRITION_GOALS,
} from './engine-types';
import { isStrictIsoUtcTimestamp } from './engine-validation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const HEALTH_FLAGS: readonly string[] = Object.freeze([
  'pregnancy',
  'lactation',
  'underage',
  'eating_disorder_history',
  'chronic_kidney_disease',
  'type_1_diabetes',
  'type_2_diabetes_uncontrolled',
  'severe_cardiovascular_condition',
]);

export function isValidIanaTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-CA', {
      timeZone: value,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date('2026-01-15T12:00:00.000Z'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Guard runtime estrito de NutritionProfile. Rejeita payload parcial,
 * NaN/Infinity, enums fora do contrato, arrays malformados, timezone
 * inválido e updatedAt fora do ISO UTC estrito.
 */
export function isNutritionProfile(value: unknown): value is NutritionProfile {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value['age']) || (value['age'] as number) <= 0) return false;
  if (!isFiniteNumber(value['heightCm']) || (value['heightCm'] as number) <= 0) return false;
  if (!isFiniteNumber(value['weightKg']) || (value['weightKg'] as number) <= 0) return false;
  if (
    typeof value['biologicalSexForCalcs'] !== 'string'
    || !(BIOLOGICAL_SEXES_FOR_CALCS as readonly string[]).includes(
      value['biologicalSexForCalcs'] as string,
    )
  ) {
    return false;
  }
  if (
    typeof value['goal'] !== 'string'
    || !(NUTRITION_GOALS as readonly string[]).includes(value['goal'] as string)
  ) {
    return false;
  }
  const freq = value['trainingFrequencyDaysPerWeek'];
  if (!isFiniteNumber(freq)) return false;
  if (
    (freq as number) < 0
    || (freq as number) > ENGINE_HARD_SAFETY_LIMITS.MAX_TRAINING_DAYS_PER_WEEK
  ) {
    return false;
  }
  const dur = value['averageTrainingDurationMinutes'];
  if (!isFiniteNumber(dur)) return false;
  if (
    (dur as number) < 0
    || (dur as number) > ENGINE_HARD_SAFETY_LIMITS.MAX_TRAINING_DURATION_MINUTES
  ) {
    return false;
  }
  if (
    typeof value['nonExerciseActivity'] !== 'string'
    || !(ACTIVITY_LEVELS as readonly string[]).includes(value['nonExerciseActivity'] as string)
  ) {
    return false;
  }
  if (
    typeof value['dietaryPattern'] !== 'string'
    || !(DIETARY_PATTERNS as readonly string[]).includes(value['dietaryPattern'] as string)
  ) {
    return false;
  }
  const meals = value['mealsPerDayPreference'];
  if (!isFiniteNumber(meals) || (meals as number) < 2 || (meals as number) > 6) return false;
  for (const key of ['allergies', 'intolerances', 'avoidedFoods'] as const) {
    const list = value[key];
    if (!Array.isArray(list)) return false;
    if (!(list as unknown[]).every((entry) => typeof entry === 'string')) return false;
  }
  const flags = value['healthFlags'];
  if (!Array.isArray(flags)) return false;
  if (
    !(flags as unknown[]).every(
      (flag) => typeof flag === 'string' && (HEALTH_FLAGS as readonly string[]).includes(flag),
    )
  ) {
    return false;
  }
  if (value['targetWeightKg'] !== undefined) {
    if (!isFiniteNumber(value['targetWeightKg']) || (value['targetWeightKg'] as number) <= 0) {
      return false;
    }
  }
  if (value['targetPaceWeeks'] !== undefined) {
    if (!isFiniteNumber(value['targetPaceWeeks']) || (value['targetPaceWeeks'] as number) <= 0) {
      return false;
    }
  }
  if (!isValidIanaTimezone(value['timezone'])) return false;
  if (!isStrictIsoUtcTimestamp(value['updatedAt'])) return false;
  return true;
}

/**
 * Normaliza o campo opcional do envelope: ausente vira null (compatível com
 * envelopes antigos); null permanece null; perfil válido é devolvido como
 * está; qualquer outro valor falha fechado (false).
 */
export function normalizePersistedNutritionProfile(
  value: unknown,
): { ok: true; profile: NutritionProfile | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, profile: null };
  if (isNutritionProfile(value)) return { ok: true, profile: value };
  return { ok: false };
}
