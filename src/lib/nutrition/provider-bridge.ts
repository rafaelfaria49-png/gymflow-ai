/**
 * GymFlow AI — Bridge de cold boot do ledger nutricional (NUT-004B)
 *
 * Sequência canônica antes de setHydrated(true):
 * hydrate core → carregar nutritionProfile → resolver gate/targets →
 * migration marker/classificação → migrate legacy se necessário →
 * ensureTodayNutritionDay → calculateActuals(today) → projetar espelhos.
 *
 * - Reutiliza o adapter IDB já aberto (nenhum segundo banco/paralelo).
 * - Marker só é concluído após a operação correspondente confirmada.
 * - Replay após crash não duplica consumo (putIfAbsent + chave natural).
 * - Projeção não cria entries, não concede XP, não altera marker nem
 *   histórico fechado.
 */

import type { NutritionLog } from '../../types';
import type { NutritionProfile } from '../../types/nutrition';
import { getCivilDateString } from '../nutrition-civil-date';
import { resolveEffectiveTimezone } from './effective-timezone';
import { calculateActuals } from './ledger';
import type { DailyActuals } from './ledger-types';
import type {
  LedgerMigrationMarker,
  LegacyDataClassification,
  NutritionDay,
} from './ledger-types';
import { classifyLegacyNutrition, migrateLegacyNutrition } from './migration';
import { ensureTodayNutritionDay, type NutritionDayRepository } from './rollover';
import { resolveNutritionTargets, type TargetResolution } from './target-resolution';

export interface NutritionBridgeMirrors {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water: number;
  waterIntake: number;
}

export type NutritionMigrationOutcome =
  | { handled: 'skipped-existing-marker'; marker: LedgerMigrationMarker }
  | {
    handled: 'classified';
    classification: LegacyDataClassification;
    outcome: 'discarded' | 'quarantined' | 'migrated';
    marker: LedgerMigrationMarker;
  };

export interface NutritionColdBootSuccess {
  ok: true;
  today: string;
  timezone: string;
  timezoneSource: 'profile' | 'runtime';
  day: NutritionDay;
  actuals: DailyActuals;
  mirrors: NutritionBridgeMirrors;
  resolution: TargetResolution;
  migration: NutritionMigrationOutcome;
}

export interface NutritionColdBootFailure {
  ok: false;
  error: string;
  stage: 'timezone' | 'marker-read' | 'marker-write' | 'migration-write' | 'ensure-today';
  cause?: unknown;
}

export interface RunNutritionColdBootInput {
  repository: NutritionDayRepository;
  now: Date;
  profile: NutritionProfile | null;
  savedNutrition: unknown;
  savedUserWaterIntake: unknown;
}

function toMirrors(actuals: DailyActuals): NutritionBridgeMirrors {
  return {
    calories: actuals.calories,
    protein: actuals.protein,
    carbs: actuals.carbs,
    fat: actuals.fat,
    water: actuals.waterMl,
    waterIntake: actuals.waterMl,
  };
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Executa o bridge nutricional completo. Puro em decisão, com I/O apenas via
 * `repository` (IDB já aberto). Nunca lança: falha vira `ok:false` explícito
 * para que o Provider hidrate o restante do app sem corromper o ledger.
 */
export async function runNutritionColdBoot(
  input: RunNutritionColdBootInput,
): Promise<NutritionColdBootSuccess | NutritionColdBootFailure> {
  const { repository, now, profile, savedNutrition, savedUserWaterIntake } = input;
  const nowIso = now.toISOString();

  const tz = resolveEffectiveTimezone(profile?.timezone ?? null);
  if (!tz.ok) {
    return { ok: false, error: tz.error, stage: 'timezone' };
  }
  const timezone = tz.timezone;
  const today = getCivilDateString(now, timezone);
  const resolution = resolveNutritionTargets({ profile, evaluatedAt: nowIso });

  let existingMarker: LedgerMigrationMarker | null;
  try {
    existingMarker = await repository.getNutritionMigrationMarker();
  } catch (error) {
    return {
      ok: false,
      error: describeError(error, 'Falha ao ler o marcador de migração nutricional.'),
      stage: 'marker-read',
      cause: error,
    };
  }
  if (existingMarker) {
    try {
      const ensured = await ensureTodayWithResolution(repository, now, timezone, resolution);
      const actuals = calculateActuals(ensured.day);
      return {
        ok: true,
        today: ensured.today,
        timezone,
        timezoneSource: tz.source,
        day: ensured.day,
        actuals,
        mirrors: toMirrors(actuals),
        resolution,
        migration: { handled: 'skipped-existing-marker', marker: existingMarker },
      };
    } catch (error) {
      return {
        ok: false,
        error: describeError(error, 'Falha ao garantir o dia nutricional atual.'),
        stage: 'ensure-today',
        cause: error,
      };
    }
  }

  const classification = classifyLegacyNutrition(savedNutrition, savedUserWaterIntake);

  if (classification === 'LEGACY_EMPTY' || classification === 'LEGACY_DEMO') {
    const marker: LedgerMigrationMarker = {
      version: 1,
      status: 'completed',
      classification,
      migratedAt: nowIso,
      source: 'legacy-nutrition-log',
    };
    try {
      await repository.setNutritionMigrationMarker(marker);
    } catch (error) {
      return {
        ok: false,
        error: describeError(error, 'Falha ao persistir o marcador de migração nutricional.'),
        stage: 'marker-write',
        cause: error,
      };
    }
    try {
      const ensured = await ensureTodayWithResolution(repository, now, timezone, resolution);
      const actuals = calculateActuals(ensured.day);
      return {
        ok: true,
        today: ensured.today,
        timezone,
        timezoneSource: tz.source,
        day: ensured.day,
        actuals,
        mirrors: toMirrors(actuals),
        resolution,
        migration: { handled: 'classified', classification, outcome: 'discarded', marker },
      };
    } catch (error) {
      return {
        ok: false,
        error: describeError(error, 'Falha ao garantir o dia nutricional atual.'),
        stage: 'ensure-today',
        cause: error,
      };
    }
  }

  if (classification === 'UNKNOWN') {
    // Quarentena honesta: nenhum consumo, nenhum XP. Classificação + motivos
    // persistem no marker para auditoria, sem inventar metas.
    const { reasons } = classifyWithReasonsForMarker(savedNutrition, savedUserWaterIntake);
    const marker: LedgerMigrationMarker = {
      version: 1,
      status: 'completed',
      classification: 'UNKNOWN',
      migratedAt: nowIso,
      source: 'legacy-nutrition-log',
      ...(reasons.length > 0 ? { reasons } : {}),
    };
    try {
      await repository.setNutritionMigrationMarker(marker);
    } catch (error) {
      return {
        ok: false,
        error: describeError(error, 'Falha ao persistir o marcador de quarentena nutricional.'),
        stage: 'marker-write',
        cause: error,
      };
    }
    try {
      const ensured = await ensureTodayWithResolution(repository, now, timezone, resolution);
      const actuals = calculateActuals(ensured.day);
      return {
        ok: true,
        today: ensured.today,
        timezone,
        timezoneSource: tz.source,
        day: ensured.day,
        actuals,
        mirrors: toMirrors(actuals),
        resolution,
        migration: { handled: 'classified', classification, outcome: 'quarantined', marker },
      };
    } catch (error) {
      return {
        ok: false,
        error: describeError(error, 'Falha ao garantir o dia nutricional atual.'),
        stage: 'ensure-today',
        cause: error,
      };
    }
  }

  // LEGACY_REAL: migrar para o NutritionDay correspondente (hoje, aberto).
  // Com targets => AUTOMATED; sem targets => MANUAL_ONLY. Nunca inventar metas.
  try {
    const migrated = resolution.targetState === 'AUTOMATED'
      ? migrateLegacyNutrition({
        nutrition: savedNutrition,
        userWaterIntake: savedUserWaterIntake,
        date: today,
        timezone,
        targets: resolution.targets,
        markClosed: false,
      })
      : migrateLegacyNutrition({
        nutrition: savedNutrition,
        userWaterIntake: savedUserWaterIntake,
        date: today,
        timezone,
        targets: null,
        targetUnavailableReason: resolution.targetUnavailableReason,
        markClosed: false,
      });
    if (migrated.outcome === 'migrated' && migrated.day) {
      // Idempotente pela chave natural: replay após crash não duplica.
      await repository.putNutritionDayIfAbsent(migrated.day);
    }
    const marker: LedgerMigrationMarker = {
      version: 1,
      status: 'completed',
      classification: 'LEGACY_REAL',
      migratedAt: nowIso,
      source: 'legacy-nutrition-log',
    };
    await repository.setNutritionMigrationMarker(marker);
    const ensured = await ensureTodayWithResolution(repository, now, timezone, resolution);
    const actuals = calculateActuals(ensured.day);
    return {
      ok: true,
      today: ensured.today,
      timezone,
      timezoneSource: tz.source,
      day: ensured.day,
      actuals,
      mirrors: toMirrors(actuals),
      resolution,
      migration: { handled: 'classified', classification, outcome: 'migrated', marker },
    };
  } catch (error) {
    const message = describeError(error, 'Falha ao migrar o consumo legado.');
    const stage = /marcador|marker/i.test(message) ? 'marker-write' : 'migration-write';
    return { ok: false, error: message, stage, cause: error };
  }
}

async function ensureTodayWithResolution(
  repository: NutritionDayRepository,
  now: Date,
  timezone: string,
  resolution: TargetResolution,
): Promise<{ day: NutritionDay; today: string }> {
  if (resolution.targetState === 'AUTOMATED') {
    return ensureTodayNutritionDay({
      now,
      timezone,
      targets: resolution.targets,
      repository,
    });
  }
  return ensureTodayNutritionDay({
    now,
    timezone,
    targets: null,
    targetState: 'MANUAL_ONLY',
    targetUnavailableReason: resolution.targetUnavailableReason,
    repository,
  });
}

// Reexposição local da classificação com motivos para o marker UNKNOWN sem
// duplicar a lógica canônica de `migration.ts`.
function classifyWithReasonsForMarker(
  nutrition: unknown,
  userWaterIntake?: unknown,
): { classification: LegacyDataClassification; reasons: string[] } {
  const problems: string[] = [];
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  if (!isRecord(nutrition)) {
    return { classification: 'UNKNOWN', reasons: ['nutrition: payload malformado (não é um objeto)'] };
  }
  let sound = true;
  const check = (holder: string, field: string, value: unknown): boolean => {
    if (typeof value !== 'number') {
      problems.push(`${holder}.${field}: tipo incorreto`);
      return false;
    }
    if (!Number.isFinite(value)) {
      problems.push(`${holder}.${field}: não finito`);
      return false;
    }
    if (value < 0) {
      problems.push(`${holder}.${field}: negativo`);
      return false;
    }
    return true;
  };
  for (const field of ['calories', 'protein', 'carbs', 'fat', 'water'] as const) {
    if (!check('nutrition', field, (nutrition as Record<string, unknown>)[field])) sound = false;
  }
  if (userWaterIntake !== undefined && userWaterIntake !== null) {
    if (!check('user', 'waterIntake', userWaterIntake)) sound = false;
  }
  if (!sound) return { classification: 'UNKNOWN', reasons: problems };
  const values = nutrition as Record<string, number>;
  if (values['calories'] >= 15000) {
    return { classification: 'UNKNOWN', reasons: [...problems, 'nutrition.calories: fora do teto NUT-001'] };
  }
  for (const field of ['protein', 'carbs', 'fat'] as const) {
    if (values[field] >= 1000) {
      return { classification: 'UNKNOWN', reasons: [...problems, `nutrition.${field}: fora do teto NUT-001`] };
    }
  }
  return { classification: 'LEGACY_REAL', reasons: [] };
}

/**
 * Projeção dos espelhos de compatibilidade a partir do ledger resolvido.
 * Eles deixam de ser fonte de verdade: refletem `calculateActuals(today)`.
 * Não cria entries, não concede XP, não altera marker nem histórico fechado.
 * Preserva lastMacroLoggedDate/lastMacroXpDate/lastWaterXpDate como contrato
 * temporário de idempotência XP.
 */
export function projectCompatMirrors(
  actuals: DailyActuals,
  preserved: Pick<NutritionLog, 'lastMacroLoggedDate' | 'lastMacroXpDate' | 'lastWaterXpDate'>,
): NutritionLog {
  return {
    calories: actuals.calories,
    protein: actuals.protein,
    carbs: actuals.carbs,
    fat: actuals.fat,
    water: actuals.waterMl,
    ...(preserved.lastMacroLoggedDate !== undefined ? { lastMacroLoggedDate: preserved.lastMacroLoggedDate } : {}),
    ...(preserved.lastMacroXpDate !== undefined ? { lastMacroXpDate: preserved.lastMacroXpDate } : {}),
    ...(preserved.lastWaterXpDate !== undefined ? { lastWaterXpDate: preserved.lastWaterXpDate } : {}),
  };
}
