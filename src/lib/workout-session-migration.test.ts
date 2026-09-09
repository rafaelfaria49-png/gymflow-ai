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
      activeWorkout: makeSession({ id: 'active_1', status: 'active', startedAt: 1000 }),
      activeWorkoutStartedAt: 1000,
      workoutHistory: [makeSession({ id: 'history_1', status: 'completed' })],
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

describe('GOAL-043: sessões finalizadas não reabrem como ativas', () => {
  it('sessão com status completed no activeWorkout normaliza para null e zera activeWorkoutStartedAt', () => {
    const state = makeState({
      activeWorkout: makeSession({ id: 'done', status: 'completed' }),
      activeWorkoutStartedAt: 1000,
    });
    const result = normalizeSessionState(state);
    expect(result.activeWorkout).toBeNull();
    expect(result.activeWorkoutStartedAt).toBeNull();
  });

  it('sessão com status abandoned no activeWorkout normaliza para null e zera activeWorkoutStartedAt', () => {
    const state = makeState({
      activeWorkout: makeSession({ id: 'abandoned_session', status: 'abandoned' }),
      activeWorkoutStartedAt: 2000,
    });
    const result = normalizeSessionState(state);
    expect(result.activeWorkout).toBeNull();
    expect(result.activeWorkoutStartedAt).toBeNull();
  });

  it('sessão com status partial no activeWorkout normaliza para null', () => {
    const state = makeState({
      activeWorkout: makeSession({ id: 'partial_session', status: 'partial' }),
      activeWorkoutStartedAt: 3000,
    });
    const result = normalizeSessionState(state);
    expect(result.activeWorkout).toBeNull();
    expect(result.activeWorkoutStartedAt).toBeNull();
  });

  it('sessão com endedAt definido no activeWorkout normaliza para null', () => {
    const state = makeState({
      activeWorkout: makeSession({ id: 'ended_session', endedAt: 4000 }),
      activeWorkoutStartedAt: 3000,
    });
    const result = normalizeSessionState(state);
    expect(result.activeWorkout).toBeNull();
    expect(result.activeWorkoutStartedAt).toBeNull();
  });

  it('sessão ativa genuína permanece intacta e preserva activeWorkoutStartedAt', () => {
    const state = makeState({
      activeWorkout: makeSession({ id: 'active_session', status: 'active', startedAt: 5000 }),
      activeWorkoutStartedAt: 5000,
    });
    const result = normalizeSessionState(state);
    expect(result.activeWorkout?.id).toBe('active_session');
    expect(result.activeWorkout?.status).toBe('active');
    expect(result.activeWorkoutStartedAt).toBe(5000);
  });
});

describe('GOAL-045: reconciliação de colisão de sessionId com histórico finalizado', () => {
  // A. activeWorkout id=session_123 status=active endedAt=null; workoutHistory contém session_123 completed
  it('A. activeWorkout com id presente no histórico como completed é descartado e zera activeWorkoutStartedAt', () => {
    const state = makeState({
      activeWorkout: makeSession({ id: 'session_123', status: 'active', endedAt: undefined }),
      activeWorkoutStartedAt: 1000,
      workoutHistory: [makeSession({ id: 'session_123', status: 'completed', endedAt: 2000 })],
    });
    const result = normalizeSessionState(state);
    expect(result.activeWorkout).toBeNull();
    expect(result.activeWorkoutStartedAt).toBeNull();
    expect(result.workoutHistory).toHaveLength(1);
    expect(result.workoutHistory[0].id).toBe('session_123');
    expect(result.workoutHistory[0].status).toBe('completed');
  });

  // B. Mesmo caso com histórico partial
  it('B. activeWorkout com id presente no histórico como partial não reabre', () => {
    const state = makeState({
      activeWorkout: makeSession({ id: 'session_partial', status: 'active', endedAt: undefined }),
      activeWorkoutStartedAt: 1500,
      workoutHistory: [makeSession({ id: 'session_partial', status: 'partial', endedAt: 2500 })],
    });
    const result = normalizeSessionState(state);
    expect(result.activeWorkout).toBeNull();
    expect(result.activeWorkoutStartedAt).toBeNull();
    expect(result.workoutHistory[0].status).toBe('partial');
  });

  // C. Mesmo caso com histórico abandoned
  it('C. activeWorkout com id presente no histórico como abandoned não reabre', () => {
    const state = makeState({
      activeWorkout: makeSession({ id: 'session_abandoned', status: 'active', endedAt: undefined }),
      activeWorkoutStartedAt: 3000,
      workoutHistory: [makeSession({ id: 'session_abandoned', status: 'abandoned', endedAt: 3010 })],
    });
    const result = normalizeSessionState(state);
    expect(result.activeWorkout).toBeNull();
    expect(result.activeWorkoutStartedAt).toBeNull();
    expect(result.workoutHistory[0].status).toBe('abandoned');
  });

  // D. Active session sem id correspondente no histórico
  it('D. active session genuína sem id correspondente no histórico é preservada', () => {
    const active = makeSession({ id: 'session_active_fresh', status: 'active', startedAt: 5000 });
    const historical = makeSession({ id: 'session_other_completed', status: 'completed' });
    const state = makeState({
      activeWorkout: active,
      activeWorkoutStartedAt: 5000,
      workoutHistory: [historical],
    });
    const result = normalizeSessionState(state);
    expect(result.activeWorkout).toBe(active);
    expect(result.activeWorkoutStartedAt).toBe(5000);
    expect(result.workoutHistory).toHaveLength(1);
    expect(result.workoutHistory[0].id).toBe('session_other_completed');
  });

  // E. Normalização repetida permanece idempotente
  it('E. normalização repetida com colisão descartada permanece estritamente idempotente', () => {
    const state = makeState({
      activeWorkout: makeSession({ id: 'session_dup', status: 'active' }),
      activeWorkoutStartedAt: 1200,
      workoutHistory: [makeSession({ id: 'session_dup', status: 'completed' })],
    });
    const once = normalizeSessionState(state);
    expect(once.activeWorkout).toBeNull();
    expect(once.activeWorkoutStartedAt).toBeNull();

    const twice = normalizeSessionState(once);
    expect(twice).toBe(once); // mesma referência no topo
    expect(twice.activeWorkout).toBeNull();
    expect(twice.activeWorkoutStartedAt).toBeNull();
    expect(twice.workoutHistory).toBe(once.workoutHistory);
  });

  it('reconhece sessão histórica com endedAt como finalizada mesmo com status ausente/legado', () => {
    const state = makeState({
      activeWorkout: makeSession({ id: 'session_ended_only', status: 'active' }),
      activeWorkoutStartedAt: 1000,
      workoutHistory: [makeSession({ id: 'session_ended_only', endedAt: 4000, status: undefined })],
    });
    const result = normalizeSessionState(state);
    expect(result.activeWorkout).toBeNull();
    expect(result.activeWorkoutStartedAt).toBeNull();
  });
});
