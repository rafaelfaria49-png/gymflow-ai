import { describe, expect, it } from 'vitest';
import {
  migrateRirSession,
  migrateWorkoutSetRir,
  normalizeRir,
} from './workout-session-migration';
import type { WorkoutSession, WorkoutSet } from '../types';

const set = (rir?: number): WorkoutSet => ({
  id: 'set-1',
  reps: 8,
  weight: 40,
  completed: true,
  ...(rir === undefined ? {} : { rir }),
});

const session = (sets: WorkoutSet[]): WorkoutSession => ({
  id: 'session-1',
  name: 'Treino',
  date: '2026-09-02',
  duration: 0,
  calories: 0,
  exercises: [{
    id: 'exercise-1',
    exerciseId: 'chest_supino_reto',
    name: 'Supino',
    muscleGroup: 'chest',
    sets,
  }],
  xpEarned: 0,
});

describe('migração de RIR', () => {
  it('normaliza RIR para chips inteiros entre 0 e 5', () => {
    expect(normalizeRir(-2)).toBe(0);
    expect(normalizeRir(2.6)).toBe(3);
    expect(normalizeRir(8)).toBe(5);
    expect(normalizeRir('2')).toBeUndefined();
  });

  it('não cria RIR em séries legadas e preserva referência já normalizada', () => {
    const legacy = set();
    expect(migrateWorkoutSetRir(legacy)).toBe(legacy);
    const normalized = set(2);
    expect(migrateWorkoutSetRir(normalized)).toBe(normalized);
  });

  it('migra o RIR de sessões sem tocar em outros campos', () => {
    const migrated = migrateRirSession(session([set(7)]));
    expect(migrated.exercises[0].sets[0].rir).toBe(5);
    expect(migrated.exercises[0].sets[0]).toMatchObject({ reps: 8, weight: 40, completed: true });
  });
});
