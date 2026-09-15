/**
 * GymFlow AI — Reconciliação única do dia nutricional ativo (NUT-004C / GOAL-094)
 *
 * `reconcileNutritionDayForNow` é o ÚNICO ponto de entrada da reconciliação
 * do dia ativo fora do cold boot com migração (`runNutritionColdBoot`,
 * NUT-004B, preservado). Todos os gatilhos canônicos passam por ela:
 * - cold boot existente (via bridge, sem duplicar);
 * - app resume / foreground (`visibilitychange` + `appStateChange` do Capacitor);
 * - timer cooperativo de foreground (meia-noite com app aberto);
 * - writes nutricionais (`logWater`/`logMacros` reconciliam antes do mutate).
 *
 * Sequência canônica (sem tocar em migration marker, admin-lock/fence,
 * backup/restore/reset ou schema físico):
 * timezone efetivo atual → targets/gate (contrato NUT-004B) → data civil
 * local → ensureTodayNutritionDay (idempotente, put-if-absent transacional) →
 * actuals derivados → espelhos.
 *
 * - Sem estado global: idempotência e atomicidade vivem no
 *   `putNutritionDayIfAbsent` do repository (mesmo contrato do rollover).
 *   Chamadas concorrentes/duplicadas (visibility + appState, timer + resume,
 *   timer + write) são inofensivas: exatamente um NutritionDay por data civil.
 * - Dia inalterado implica somente leituras (ensure retorna `existing-active`
 *   sem escrita) — o timer nunca cria loop de escrita.
 * - Falha é fail-closed explícita (`ok: false`, sem throw): o chamador mantém
 *   o dia anterior e nunca publica espelhos derivados de dia não persistido.
 * - Datas sempre via `getCivilDateString(now, timezone)` — nenhum
 *   `toISOString().split('T')[0]`, nenhum fuso hardcodado.
 */

import type { NutritionProfile } from '../../types/nutrition';
import { getCivilDateString } from '../nutrition-civil-date';
import { resolveEffectiveTimezone } from './effective-timezone';
import { calculateActuals } from './ledger';
import type { DailyActuals, NutritionDay } from './ledger-types';
import { ensureTodayNutritionDay, type EnsureTodayStatus, type NutritionDayRepository } from './rollover';
import { resolveNutritionTargets, type TargetResolution } from './target-resolution';

// ============================================================================
// CONSTANTES DE LIFECYCLE
// ============================================================================

/**
 * Intervalo do timer cooperativo de foreground (verificação da data civil
 * enquanto o app está visível). 60s detectam a meia-noite com app aberto sem
 * polling agressivo. O timer NUNCA roda em hidden/background (o Provider o
 * desarma em `visibilitychange`/`appStateChange` inativo).
 */
export const NUTRITION_FOREGROUND_RECONCILE_INTERVAL_MS = 60_000;

/** Gatilho canônico que originou a reconciliação (diagnóstico, sem efeito). */
export type NutritionLifecycleReason =
  | 'cold-boot'
  | 'resume'
  | 'visibility'
  | 'app-state'
  | 'timer'
  | 'write';

// ============================================================================
// CONTRATO
// ============================================================================

export interface ReconcileNutritionDayInput {
  /** Gatilho de origem (somente diagnóstico). */
  reason: NutritionLifecycleReason;
  /** Repository já aberto (IDB do Provider ou in-memory em testes). */
  repository: NutritionDayRepository;
  /** Instante explícito (função não lê o relógio). */
  now: Date;
  /** Perfil vigente; null => MANUAL_ONLY/PROFILE_ABSENT (contrato NUT-004B). */
  profile: NutritionProfile | null;
}

export interface NutritionReconciledMirrors {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water: number;
  waterIntake: number;
}

export interface ReconcileNutritionDaySuccess {
  ok: true;
  reason: NutritionLifecycleReason;
  /** Data civil local reconciliada (dia ativo após persistência). */
  today: string;
  timezone: string;
  timezoneSource: 'profile' | 'runtime';
  day: NutritionDay;
  actuals: DailyActuals;
  mirrors: NutritionReconciledMirrors;
  resolution: TargetResolution;
  /** Resultado do ensure interno (created = rollover executado). */
  status: EnsureTodayStatus;
}

export interface ReconcileNutritionDayFailure {
  ok: false;
  reason: NutritionLifecycleReason;
  error: string;
  stage: 'invalid-input' | 'timezone' | 'ensure-today';
  cause?: unknown;
}

export type ReconcileNutritionDayResult = ReconcileNutritionDaySuccess | ReconcileNutritionDayFailure;

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

// ============================================================================
// RECONCILIAÇÃO ÚNICA
// ============================================================================

/**
 * Reconcilia o dia nutricional ativo para o instante `now`, de forma
 * idempotente. Nunca lança para falhas de domínio (retorna `ok: false`); o
 * Provider então mantém o dia anterior sem publicar espelhos.
 *
 * Garantias (herdadas de `ensureTodayNutritionDay` + `resolveNutritionTargets`):
 * - mesma data civil → devolve o dia existente, sem criar dia e sem escrita;
 * - data nova → fecha o dia anterior (`isClosed = true`), cria/reusa o novo
 *   dia com consumo zero, histórico anterior 100% preservado, targets do
 *   snapshot corrente (AUTOMATED) ou MANUAL_ONLY vigente, gateSnapshot novo e
 *   coerente; nunca copia consumo anterior; nunca sobrescreve dia histórico;
 * - relógio retrocedido → preserva histórico (sem ressuscitar dia fechado).
 */
export async function reconcileNutritionDayForNow(
  input: ReconcileNutritionDayInput,
): Promise<ReconcileNutritionDayResult> {
  const { reason, repository, now, profile } = input;
  if (!repository || !(now instanceof Date) || Number.isNaN(now.getTime())) {
    return {
      ok: false,
      reason,
      error: 'reconcileNutrition exige repository e um `now` Date válido e explícito.',
      stage: 'invalid-input',
    };
  }

  const tz = resolveEffectiveTimezone(profile?.timezone ?? null);
  if (!tz.ok) {
    return { ok: false, reason, error: tz.error, stage: 'timezone' };
  }
  const timezone = tz.timezone;
  const today = getCivilDateString(now, timezone);
  const resolution = resolveNutritionTargets({ profile, evaluatedAt: now.toISOString() });

  try {
    const ensured = resolution.targetState === 'AUTOMATED'
      ? await ensureTodayNutritionDay({
        now,
        timezone,
        targets: resolution.targets,
        targetState: 'AUTOMATED',
        gateSnapshot: resolution.gateSnapshot,
        repository,
      })
      : await ensureTodayNutritionDay({
        now,
        timezone,
        targets: null,
        targetState: 'MANUAL_ONLY',
        targetUnavailableReason: resolution.targetUnavailableReason,
        gateSnapshot: resolution.gateSnapshot,
        repository,
      });
    const actuals = calculateActuals(ensured.day);
    return {
      ok: true,
      reason,
      today: ensured.today,
      timezone,
      timezoneSource: tz.source,
      day: ensured.day,
      actuals,
      mirrors: {
        calories: actuals.calories,
        protein: actuals.protein,
        carbs: actuals.carbs,
        fat: actuals.fat,
        water: actuals.waterMl,
        waterIntake: actuals.waterMl,
      },
      resolution,
      status: ensured.status,
    };
  } catch (error) {
    return {
      ok: false,
      reason,
      error: describeError(error, 'Falha ao reconciliar o dia nutricional ativo.'),
      stage: 'ensure-today',
      cause: error,
    };
  }
}
