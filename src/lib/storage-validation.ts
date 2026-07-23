import {
  CURRENT_STORAGE_VERSION,
  HYBRID_STORAGE_VERSION,
  type EnvelopeParseResult,
  type PersistedCoreState,
  type PersistedState,
  type StorageEnvelope,
} from './storage-types';

const ARRAY_FIELDS: (keyof PersistedState)[] = [
  'weeklyPlan',
  'customPrograms',
  'workoutHistory',
  'weightHistory',
  'measurementsHistory',
  'achievements',
  'challenges',
  'favoriteExercises',
  'recentlyViewedVideoIds',
];

const NULLABLE_NUMBER_FIELDS: (keyof PersistedState)[] = [
  'activeWorkoutStartedAt',
  'restTimerEndAt',
  'restTimerTotalSeconds',
];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validatePersistedStateShape(value: unknown): value is PersistedState {
  if (!isRecord(value)) return false;

  for (const field of ARRAY_FIELDS) {
    if (field in value && !Array.isArray(value[field])) return false;
  }

  for (const field of NULLABLE_NUMBER_FIELDS) {
    const fieldValue = value[field];
    if (field in value && fieldValue !== null && (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue))) {
      return false;
    }
  }

  if ('restTimerLabel' in value && value.restTimerLabel !== null && typeof value.restTimerLabel !== 'string') {
    return false;
  }
  if ('user' in value && value.user !== null && !isRecord(value.user)) return false;
  if ('activeWorkout' in value && value.activeWorkout !== null && !isRecord(value.activeWorkout)) return false;
  if (isRecord(value.activeWorkout) && 'exercises' in value.activeWorkout && !Array.isArray(value.activeWorkout.exercises)) {
    return false;
  }
  if ('nutrition' in value && !isRecord(value.nutrition)) return false;

  return true;
}

export function validateEnvelope<T>(
  value: unknown,
  validateData: (data: unknown) => data is T = validatePersistedStateShape as (data: unknown) => data is T,
): value is StorageEnvelope<T> {
  if (!isRecord(value)) return false;
  if (value.v !== CURRENT_STORAGE_VERSION) return false;
  if (typeof value.savedAt !== 'string' || Number.isNaN(Date.parse(value.savedAt))) return false;
  return validateData(value.data);
}

export function validatePersistedCoreStateShape(value: unknown): value is PersistedCoreState {
  if (!isRecord(value) || 'workoutHistory' in value) return false;
  const reference = value.historyStorage;
  if (
    !isRecord(reference)
    || reference.backend !== 'indexeddb'
    || reference.schemaVersion !== 1
    || typeof reference.generationId !== 'string'
    || reference.generationId.length === 0
  ) {
    return false;
  }
  return validatePersistedStateShape({ ...value, workoutHistory: [] });
}

export function validateHybridEnvelope(
  value: unknown,
): value is StorageEnvelope<PersistedCoreState> {
  if (!isRecord(value)) return false;
  if (value.v !== HYBRID_STORAGE_VERSION) return false;
  if (typeof value.savedAt !== 'string' || Number.isNaN(Date.parse(value.savedAt))) return false;
  return validatePersistedCoreStateShape(value.data);
}

export function parseEnvelope<T>(
  raw: string,
  validateData?: (data: unknown) => data is T,
): EnvelopeParseResult<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { status: 'corrupt', error: errorMessage(error, 'JSON inválido') };
  }

  if (isRecord(parsed) && 'v' in parsed && parsed.v !== CURRENT_STORAGE_VERSION) {
    return { status: 'unsupported-version', version: parsed.v };
  }

  if (!validateEnvelope(parsed, validateData)) {
    return { status: 'corrupt', error: 'Envelope v1 ou payload com formato inválido.' };
  }

  return { status: 'ok', envelope: parsed };
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
