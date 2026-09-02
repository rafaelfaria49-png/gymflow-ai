// GOAL-23A: normalização legada do domínio de sessão.
//
// Pura e IDEMPOTENTE: normalize(normalize(state)) === normalize(state) (retorna
// a MESMA referência quando nada muda). Opera sobre o estado já materializado em
// memória, logo após mergePersistedState e ANTES de alimentar os setters — não
// altera o storage v1, a chave `gymflow:state:v1` nem o formato físico atual.
//
// Regras:
//   - activeWorkout sem `status`    → `active`;
//   - activeWorkout sem `startedAt` → usa `activeWorkoutStartedAt` (se houver);
//   - sessão do histórico sem `status` → `completed`;
//   - preserva os campos já existentes; nunca apaga nem inventa dados.
//
// `activeWorkoutStartedAt` é mantido intacto para compatibilidade.

import type { ActiveExercise, WorkoutSession, WorkoutSet } from '../types';
import { migrateTechniqueSession } from '../domain/techniques/migration';

export interface NormalizableSessionState {
  activeWorkout: WorkoutSession | null;
  activeWorkoutStartedAt: number | null;
  workoutHistory: WorkoutSession[];
}

function normalizeActiveWorkout(
  activeWorkout: WorkoutSession | null,
  activeWorkoutStartedAt: number | null,
): WorkoutSession | null {
  if (!activeWorkout) return activeWorkout;
  const normalizedRir = migrateRirSession(migrateTechniqueSession(activeWorkout));
  const needsStatus = normalizedRir.status === undefined;
  const needsStartedAt = normalizedRir.startedAt === undefined && activeWorkoutStartedAt != null;
  if (!needsStatus && !needsStartedAt) return normalizedRir;
  return {
    ...normalizedRir,
    ...(needsStatus ? { status: 'active' as const } : {}),
    ...(needsStartedAt ? { startedAt: activeWorkoutStartedAt } : {}),
  };
}

function normalizeHistorySession(session: WorkoutSession): WorkoutSession {
  const normalizedRir = migrateRirSession(migrateTechniqueSession(session));
  if (normalizedRir.status !== undefined) return normalizedRir;
  return { ...normalizedRir, status: 'completed' as const };
}

/** Normaliza o RIR persistido sem inventar dado para sessões legadas. */
export function normalizeRir(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(5, Math.round(value)));
}

/** Migra apenas o campo RIR de uma série; mantém a referência quando nada mudou. */
export function migrateWorkoutSetRir(set: WorkoutSet): WorkoutSet {
  if (!Object.prototype.hasOwnProperty.call(set, 'rir')) return set;
  const normalized = normalizeRir(set.rir);
  if (normalized === set.rir) return set;
  const next = { ...set };
  if (normalized === undefined) delete next.rir;
  else next.rir = normalized;
  return next;
}

export function migrateRirExercise(exercise: ActiveExercise): ActiveExercise {
  const sets = exercise.sets.map(migrateWorkoutSetRir);
  return sets.every((set, index) => set === exercise.sets[index])
    ? exercise
    : { ...exercise, sets };
}

export function migrateRirSession(session: WorkoutSession): WorkoutSession {
  const exercises = session.exercises.map(migrateRirExercise);
  return exercises.every((exercise, index) => exercise === session.exercises[index])
    ? session
    : { ...session, exercises };
}

function normalizeHistory(history: WorkoutSession[]): WorkoutSession[] {
  let changed = false;
  const next = history.map((session) => {
    const normalized = normalizeHistorySession(session);
    if (normalized !== session) changed = true;
    return normalized;
  });
  return changed ? next : history;
}

/** Normaliza activeWorkout + workoutHistory. Retorna o mesmo objeto se nada muda. */
export function normalizeSessionState(
  state: NormalizableSessionState,
): NormalizableSessionState {
  const activeWorkout = normalizeActiveWorkout(state.activeWorkout, state.activeWorkoutStartedAt);
  const workoutHistory = normalizeHistory(state.workoutHistory);
  if (activeWorkout === state.activeWorkout && workoutHistory === state.workoutHistory) {
    return state;
  }
  return { ...state, activeWorkout, workoutHistory };
}
