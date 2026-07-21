import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../types';
import { normalizeSessionState, type NormalizableSessionState } from './workout-session-migration';

function makeSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'session_1',
    name: 'Treino',
    date: '2026-07-20',
    duration: 3600,
    calories: 300,
    xpEarned: 120,
    exercises: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<NormalizableSessionState> = {}): NormalizableSessionState {
  return {
    activeWorkout: null,
    activeWorkoutStartedAt: null,
    workoutHistory: [],
    ...overrides,
  };
}

describe('normalizeSessionState — sessão ativa legada', () => {
  it('activeWorkout sem status recebe active', () => {
    const state = makeState({ activeWorkout: makeSession(), activeWorkoutStartedAt: 1000 });
    expect(normalizeSessionState(state).activeWorkout?.status).toBe('active');
  });

  it('activeWorkout sem startedAt herda activeWorkoutStartedAt', () => {
    const state = makeState({ activeWorkout: makeSession(), activeWorkoutStartedAt: 1737460000000 });
    expect(normalizeSessionState(state).activeWorkout?.startedAt).toBe(1737460000000);
  });

  it('não inventa startedAt quando activeWorkoutStartedAt é null', () => {
    const state = makeState({ activeWorkout: makeSession(), activeWorkoutStartedAt: null });
    const result = normalizeSessionState(state);
    expect(result.activeWorkout?.status).toBe('active');
    expect(result.activeWorkout?.startedAt).toBeUndefined();
  });

  it('mantém activeWorkoutStartedAt intacto (compatibilidade)', () => {
    const state = makeState({ activeWorkout: makeSession(), activeWorkoutStartedAt: 42 });
    expect(normalizeSessionState(state).activeWorkoutStartedAt).toBe(42);
  });

  it('preserva status e startedAt já existentes', () => {
    const active = makeSession({ status: 'active', startedAt: 999 });
    const state = makeState({ activeWorkout: active, activeWorkoutStartedAt: 1000 });
    const result = normalizeSessionState(state);
    expect(result.activeWorkout?.status).toBe('active');
    expect(result.activeWorkout?.startedAt).toBe(999); // NÃO sobrescreve com activeWorkoutStartedAt
    expect(result.activeWorkout).toBe(active); // nada mudou → mesma referência
  });

  it('mantém activeWorkout null como null', () => {
    expect(normalizeSessionState(makeState()).activeWorkout).toBeNull();
  });
});

describe('normalizeSessionState — histórico legado', () => {
  it('sessão do histórico sem status vira completed', () => {
    const state = makeState({ workoutHistory: [makeSession(), makeSession({ id: 's2' })] });
    const result = normalizeSessionState(state);
    expect(result.workoutHistory.every((s) => s.status === 'completed')).toBe(true);
  });

  it('preserva o status já gravado no histórico (não força completed)', () => {
    const partial = makeSession({ id: 's_partial', status: 'partial' });
    const state = makeState({ workoutHistory: [partial, makeSession({ id: 's_legacy' })] });
    const result = normalizeSessionState(state);
    expect(result.workoutHistory[0].status).toBe('partial');
    expect(result.workoutHistory[0]).toBe(partial); // inalterada → mesma referência
    expect(result.workoutHistory[1].status).toBe('completed');
  });

  it('preserva os demais campos da sessão do histórico', () => {
    const state = makeState({ workoutHistory: [makeSession({ totalVolume: 5000, prsDetected: ['PR'] })] });
    const result = normalizeSessionState(state).workoutHistory[0];
    expect(result.totalVolume).toBe(5000);
    expect(result.prsDetected).toEqual(['PR']);
    expect(result.duration).toBe(3600);
  });

  it('histórico vazio permanece a mesma referência', () => {
    const state = makeState();
    expect(normalizeSessionState(state).workoutHistory).toBe(state.workoutHistory);
  });
});

describe('normalizeSessionState — idempotência e estabilidade referencial', () => {
  it('normalize(normalize(state)) === normalize(state) para estado legado', () => {
    const legacy = makeState({
      activeWorkout: makeSession({ id: 'active' }),
      activeWorkoutStartedAt: 1000,
      workoutHistory: [makeSession({ id: 'h1' }), makeSession({ id: 'h2' })],
    });
    const once = normalizeSessionState(legacy);
    const twice = normalizeSessionState(once);
    expect(twice).toBe(once); // mesma referência do topo
    expect(twice.activeWorkout).toBe(once.activeWorkout);
    expect(twice.workoutHistory).toBe(once.workoutHistory);
  });

  it('estado já normalizado retorna a MESMA referência (nada muda)', () => {
    const normalized = makeState({
      activeWorkout: makeSession({ status: 'active', startedAt: 1000 }),
      activeWorkoutStartedAt: 1000,
      workoutHistory: [makeSession({ status: 'completed' })],
    });
    expect(normalizeSessionState(normalized)).toBe(normalized);
  });

  it('idempotente também quando não há startedAt nem activeWorkoutStartedAt', () => {
    const state = makeState({ activeWorkout: makeSession(), activeWorkoutStartedAt: null });
    const once = normalizeSessionState(state);
    expect(normalizeSessionState(once)).toBe(once);
    expect(once.activeWorkout?.startedAt).toBeUndefined();
  });

  it('não apaga dados: campos de origem e métricas sobrevivem à normalização', () => {
    const rich = makeSession({
      sourceProgramId: 'prog-1',
      sourceProgramDayId: 'day-a',
      totalVolume: 8000,
      exercises: [
        { id: 'e1', exerciseId: 'ex1', name: 'Supino', muscleGroup: 'chest', sets: [{ id: 's', reps: 10, weight: 50, completed: true }] },
      ],
    });
    const result = normalizeSessionState(makeState({ workoutHistory: [rich] })).workoutHistory[0];
    expect(result.sourceProgramId).toBe('prog-1');
    expect(result.sourceProgramDayId).toBe('day-a');
    expect(result.totalVolume).toBe(8000);
    expect(result.exercises[0].sets[0].completed).toBe(true);
  });
});
