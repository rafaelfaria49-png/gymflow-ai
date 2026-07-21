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

import type { WorkoutSession } from '../types';

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
  const needsStatus = activeWorkout.status === undefined;
  const needsStartedAt = activeWorkout.startedAt === undefined && activeWorkoutStartedAt != null;
  if (!needsStatus && !needsStartedAt) return activeWorkout;
  return {
    ...activeWorkout,
    ...(needsStatus ? { status: 'active' as const } : {}),
    ...(needsStartedAt ? { startedAt: activeWorkoutStartedAt } : {}),
  };
}

function normalizeHistorySession(session: WorkoutSession): WorkoutSession {
  if (session.status !== undefined) return session;
  return { ...session, status: 'completed' as const };
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
