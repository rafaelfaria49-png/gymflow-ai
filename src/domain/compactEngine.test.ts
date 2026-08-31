import { describe, expect, it } from 'vitest';
import type { ActiveExercise, Exercise, WorkoutSession } from '../types';
import { finalizeSession } from '../lib/workout-session-domain';
import {
  applyCompactWorkoutProposal,
  buildCompactWorkoutProposal,
} from './compactEngine';

function makeActiveExercise(id: string, name: string, sets = 3): ActiveExercise {
  return {
    id: `active-${id}`,
    exerciseId: id,
    name,
    muscleGroup: 'chest',
    sets: Array.from({ length: sets }, (_, index) => ({
      id: `set-${id}-${index}`,
      reps: 10,
      weight: 20,
      completed: false,
    })),
  };
}

function makeCatalogExercise(
  id: string,
  name: string,
  mechanics: Exercise['mechanics'],
  type: Exercise['type'] = 'main',
): Exercise {
  return {
    id,
    name,
    thumbnail: '',
    muscleGroup: 'chest',
    secondaryMuscles: mechanics === 'compound' ? ['triceps'] : [],
    equipment: mechanics === 'compound' ? 'Barra e Banco' : 'Halteres',
    level: 'beginner',
    mechanics,
    type,
    executionSteps: [],
    postureTips: [],
    breathing: '',
    commonErrors: [],
    errorCorrections: [],
    variations: [],
    substitutions: [],
    safetyWarnings: [],
  };
}

function makeSession(): WorkoutSession {
  return {
    id: 'session-compact-1',
    name: 'Peito',
    date: '2026-08-31',
    duration: 0,
    plannedDuration: 70,
    calories: 0,
    xpEarned: 0,
    status: 'active',
    variant: 'standard',
    exercises: [
      makeActiveExercise('compound-1', 'Supino reto'),
      makeActiveExercise('compound-2', 'Desenvolvimento'),
      makeActiveExercise('isolation-1', 'Crucifixo'),
      makeActiveExercise('isolation-2', 'Crossover'),
      makeActiveExercise('isolation-3', 'Pullover'),
    ],
  };
}

const catalog = [
  makeCatalogExercise('compound-1', 'Supino reto', 'compound'),
  makeCatalogExercise('compound-2', 'Desenvolvimento', 'compound'),
  makeCatalogExercise('isolation-1', 'Crucifixo', 'isolation', 'accessory'),
  makeCatalogExercise('isolation-2', 'Crossover', 'isolation', 'accessory'),
  makeCatalogExercise('isolation-3', 'Pullover', 'isolation', 'finisher'),
];

describe('compactEngine — Treino rápido (GOAL-25)', () => {
  it('compacta 70→45 min removendo isoladores e preserva 100% dos compostos', () => {
    const session = makeSession();
    const proposal = buildCompactWorkoutProposal({
      session,
      plannedMinutes: 70,
      targetMinutes: 45,
      catalog,
    });

    expect(proposal.sourceMinutes).toBe(70);
    expect(proposal.targetMinutes).toBe(45);
    expect(proposal.requiresConfirmation).toBe(true);
    expect(proposal.removedExercises.length).toBeGreaterThan(0);
    expect(proposal.removedExercises.every((item) => item.reason === 'isolation-first')).toBe(true);
    expect(proposal.estimatedMinutesAfter).toBeLessThanOrEqual(45);
    expect(proposal.compactWorkout.variant).toBe('compact');
    expect(proposal.compactWorkout.exercises.map((exercise) => exercise.exerciseId))
      .toContain('compound-1');
    expect(proposal.compactWorkout.exercises.map((exercise) => exercise.exerciseId))
      .toContain('compound-2');
    expect(proposal.removedExercises.map((item) => item.exerciseId))
      .not.toContain('compound-1');
    expect(proposal.removedExercises.map((item) => item.exerciseId))
      .not.toContain('compound-2');
    expect(session.exercises).toHaveLength(5);
    expect(session.variant).toBe('standard');
  });

  it('não remove compostos quando o alvo é curto demais e explicita o limite', () => {
    const session = makeSession();
    const proposal = buildCompactWorkoutProposal({
      session,
      targetMinutes: 1,
      catalog,
    });

    expect(proposal.removedExercises.every((item) => item.exerciseId.startsWith('isolation'))).toBe(true);
    expect(proposal.compactWorkout.exercises.map((exercise) => exercise.exerciseId))
      .toEqual(['compound-1', 'compound-2']);
    expect(proposal.canReachTarget).toBe(false);
    expect(proposal.rationale.join(' ')).toContain('compostos');
  });

  it('aplica somente após confirmação e o log preserva variant compact', () => {
    const session = makeSession();
    const proposal = buildCompactWorkoutProposal({ session, targetMinutes: 45, catalog });

    const applied = applyCompactWorkoutProposal(session, proposal);
    expect(applied.variant).toBe('compact');
    expect(applied.exercises).toHaveLength(proposal.retainedExerciseIds.length);
    expect(session.exercises).toHaveLength(5);

    const { session: log } = finalizeSession({
      session: applied,
      endedAt: 1000,
      duration: 2700,
      calories: 200,
      totalVolume: 1000,
      prsDetected: [],
      xpEarned: 100,
    });
    expect(log.variant).toBe('compact');
    expect(log.status).toBe('abandoned');
  });

  it('não propõe cortes quando o tempo de hoje não é menor que o plano', () => {
    const session = makeSession();
    const proposal = buildCompactWorkoutProposal({ session, targetMinutes: 70, catalog });

    expect(proposal.removedExercises).toHaveLength(0);
    expect(proposal.requiresConfirmation).toBe(false);
    expect(proposal.compactWorkout.exercises).toEqual(session.exercises);
  });
});
