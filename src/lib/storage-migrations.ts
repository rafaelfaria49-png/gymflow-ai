import { loadStateResult, saveStateResult } from './storage';
import type { PersistedState, StorageLike, StorageWriteResult } from './storage-types';
import { errorMessage, isRecord } from './storage-validation';

export const LEGACY_USER_KEY = 'gymflow_user';
export const LEGACY_WEEKLY_PLAN_KEY = 'gymflow_weeklyPlan';

export type LegacyMigrationResult =
  | { status: 'already-current'; value: PersistedState }
  | { status: 'no-legacy' }
  | { status: 'migrated'; value: PersistedState; sourceKeys: string[]; cleanupWarning?: string }
  | { status: 'blocked'; error: string }
  | { status: 'invalid-legacy'; error: string }
  | { status: 'unavailable'; error: string }
  | { status: 'write-failed'; result: StorageWriteResult<PersistedState> };

export function mergePersistedState(
  defaults: PersistedState,
  saved: Partial<PersistedState>,
): PersistedState {
  // Presença da propriedade, e não length, decide o valor. Assim [] é dado legítimo.
  return { ...defaults, ...saved };
}

export function buildLegacyState(
  defaults: PersistedState,
  legacyUser: unknown,
  legacyWeeklyPlan: unknown,
): PersistedState | null {
  if (!isRecord(legacyUser)) return null;
  const weeklyPlan = legacyWeeklyPlan ?? legacyUser.weeklyPlan ?? [];
  if (!Array.isArray(weeklyPlan)) return null;
  return mergePersistedState(defaults, {
    user: legacyUser as unknown as PersistedState['user'],
    weeklyPlan: weeklyPlan as PersistedState['weeklyPlan'],
  });
}

export function migrateLegacyState(
  key: string,
  defaults: PersistedState,
  storage: StorageLike,
): LegacyMigrationResult {
  const current = loadStateResult<PersistedState>(key, storage);
  if (current.status === 'ok') return { status: 'already-current', value: current.value };
  if (current.status === 'unavailable') return current;
  if (current.status !== 'empty') {
    return { status: 'blocked', error: 'O estado v1 atual não pode ser substituído por dados legados.' };
  }

  let rawUser: string | null;
  let rawPlan: string | null;
  try {
    rawUser = storage.getItem(LEGACY_USER_KEY);
    rawPlan = storage.getItem(LEGACY_WEEKLY_PLAN_KEY);
  } catch (error) {
    return { status: 'unavailable', error: errorMessage(error, 'Falha ao ler chaves legadas.') };
  }

  if (rawUser === null) return { status: 'no-legacy' };

  let legacyUser: unknown;
  let legacyPlan: unknown = undefined;
  try {
    legacyUser = JSON.parse(rawUser);
    if (rawPlan !== null) legacyPlan = JSON.parse(rawPlan);
  } catch (error) {
    return { status: 'invalid-legacy', error: errorMessage(error, 'Dados legados inválidos.') };
  }

  const migrated = buildLegacyState(defaults, legacyUser, legacyPlan);
  if (!migrated) return { status: 'invalid-legacy', error: 'As chaves legadas têm formato incompatível.' };

  const write = saveStateResult(key, migrated, storage);
  if (!write.ok) return { status: 'write-failed', result: write };

  const verification = loadStateResult<PersistedState>(key, storage);
  if (verification.status !== 'ok') {
    return {
      status: 'write-failed',
      result: { ok: false, reason: 'verification', error: 'A migração não passou na releitura final.' },
    };
  }

  const sourceKeys = rawPlan === null
    ? [LEGACY_USER_KEY]
    : [LEGACY_USER_KEY, LEGACY_WEEKLY_PLAN_KEY];
  let cleanupWarning: string | undefined;
  try {
    for (const sourceKey of sourceKeys) storage.removeItem(sourceKey);
  } catch (error) {
    cleanupWarning = errorMessage(error, 'O envelope foi migrado, mas uma chave legada não pôde ser removida.');
  }

  return { status: 'migrated', value: verification.value, sourceKeys, cleanupWarning };
}
