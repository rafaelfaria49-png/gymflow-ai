import { describe, expect, it } from 'vitest';
import type { Exercise, WorkoutSession, WorkoutSwapReasonCode } from '../types';
import {
  adaptWorkoutForCrowdedGym,
  swapWorkoutExercise,
  toggleWorkoutSetCompletion,
  updateWorkoutExerciseNotes,
} from './workout-session-mutations';
import { markEntrySwapped } from './workout-session-domain';

function makeExercise(
  id: string,
  name: string,
  muscleGroup: Exercise['muscleGroup'],
  equipment: string,
): Exercise {
  return {
    id,
    name,
    thumbnail: '',
    muscleGroup,
    equipment,
    level: 'intermediate',
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

function makeWorkout(): WorkoutSession {
  return {
    id: 'session-1',
    name: 'Treino',
    date: '2026-07-18',
    duration: 0,
    calories: 0,
    xpEarned: 0,
    sourceProgramId: 'program-1',
    sourceProgramDayId: 'day-1',
    sourceProgramName: 'Programa',
    sourceProgramDayName: 'Dia 1 — Peito',
    exercises: [{
      id: 'active-1',
      exerciseId: 'machine-chest',
      name: 'Supino máquina',
      muscleGroup: 'chest',
      notes: '',
      restSec: 75,
      sets: [
        { id: 'set-1', reps: 10, weight: 80, completed: false, rpe: 8 },
        { id: 'set-2', reps: 10, weight: 80, completed: true, rpe: 8 },
      ],
    }],
  };
}

const catalog = [
  makeExercise('machine-chest', 'Supino máquina', 'chest', 'Máquina'),
  makeExercise('dumbbell-chest', 'Supino com halteres', 'chest', 'Halteres'),
];

describe('mutações puras da sessão ativa', () => {
  it('aplica duas alterações sequenciais sem a segunda sobrescrever a primeira', () => {
    const original = makeWorkout();
    const withNotes = updateWorkoutExerciseNotes(original, 0, 'Cadência controlada');
    const swapped = swapWorkoutExercise(withNotes, 0, catalog[1]);

    expect(swapped.exercises[0]).toMatchObject({
      exerciseId: 'dumbbell-chest',
      notes: 'Cadência controlada',
      restSec: 75,
    });
    expect(swapped.exercises[0].sets).toEqual(original.exercises[0].sets);
    expect(swapped.sourceProgramId).toBe('program-1');
    expect(original.exercises[0].notes).toBe('');
  });

  it('retorna a mesma sessão quando índice/alteração não é válida', () => {
    const workout = makeWorkout();
    expect(updateWorkoutExerciseNotes(workout, 99, 'x')).toBe(workout);
    expect(updateWorkoutExerciseNotes(workout, 0, '')).toBe(workout);
    expect(swapWorkoutExercise(workout, 99, catalog[1])).toBe(workout);
    expect(swapWorkoutExercise(workout, 0, catalog[0])).toBe(workout);
  });

  it('Academia Lotada usa e preserva o snapshot mais recente', () => {
    const latest = updateWorkoutExerciseNotes(makeWorkout(), 0, 'Manter amplitude');
    const result = adaptWorkoutForCrowdedGym(latest, catalog);

    expect(result.replacementCount).toBe(1);
    expect(result.workout.exercises[0]).toMatchObject({
      exerciseId: 'dumbbell-chest',
      notes: 'Manter amplitude',
    });
    expect(result.workout.exercises[0].sets).toEqual(latest.exercises[0].sets);
    expect(latest.exercises[0].exerciseId).toBe('machine-chest');
  });

  it('retorna a mesma sessão quando não há adaptação disponível', () => {
    const workout = swapWorkoutExercise(makeWorkout(), 0, catalog[1]);
    const result = adaptWorkoutForCrowdedGym(workout, catalog);
    expect(result).toEqual({ workout, replacementCount: 0 });
    expect(result.workout).toBe(workout);
  });

  it('alterna a série e identifica quando ela era a última pendente', () => {
    const workout = makeWorkout();
    const completed = toggleWorkoutSetCompletion(workout, 0, 0);
    expect(completed.changed).toBe(true);
    expect(completed.completed).toBe(true);
    expect(completed.isLastRemainingSet).toBe(true);
    expect(completed.workout.exercises[0].sets[0].completed).toBe(true);
    expect(workout.exercises[0].sets[0].completed).toBe(false);

    const reopened = toggleWorkoutSetCompletion(completed.workout, 0, 0);
    expect(reopened.completed).toBe(false);
    expect(reopened.isLastRemainingSet).toBe(false);
  });

  it('não altera sessão para índices de série inválidos', () => {
    const workout = makeWorkout();
    const result = toggleWorkoutSetCompletion(workout, 0, 99);
    expect(result.changed).toBe(false);
    expect(result.workout).toBe(workout);
  });
});

describe('substituição estruturada (GOAL-24): swapWorkoutExercise + markEntrySwapped', () => {
  // Reproduz o applySwap do GymFlowContext: troca a identidade preservando séries e
  // registra o snapshot estruturado (original + motivo + nota + timestamp).
  function applySwap(
    workout: WorkoutSession,
    index: number,
    replacement: Pick<Exercise, 'id' | 'name' | 'muscleGroup'>,
    meta: { reasonCode: WorkoutSwapReasonCode; reasonNote?: string; swappedAt: number },
  ): WorkoutSession {
    const original = workout.exercises[index];
    const swapped = swapWorkoutExercise(workout, index, replacement);
    return {
      ...swapped,
      exercises: swapped.exercises.map((ex, i) => (
        i === index ? markEntrySwapped(ex, { original, ...meta }) : ex
      )),
    };
  }

  it('preserva séries, reps, carga, RPE e descanso ao registrar a troca', () => {
    const workout = makeWorkout();
    const before = workout.exercises[0];
    const after = applySwap(workout, 0, catalog[1], {
      reasonCode: 'equipment-occupied',
      reasonNote: 'barra ocupada',
      swappedAt: 1000,
    }).exercises[0];

    // identidade trocada + snapshot do original
    expect(after.exerciseId).toBe('dumbbell-chest');
    expect(after.name).toBe('Supino com halteres');
    expect(after.entryOrigin).toBe('swapped');
    expect(after.plannedExerciseId).toBe('machine-chest');
    expect(after.plannedExerciseName).toBe('Supino máquina');
    expect(after.plannedMuscleGroup).toBe('chest');
    expect(after.swapReasonCode).toBe('equipment-occupied');
    expect(after.swapReasonNote).toBe('barra ocupada');
    expect(after.swappedAt).toBe(1000);

    // séries/reps/carga/RPE/descanso intactos
    expect(after.sets).toEqual(before.sets);
    expect(after.restSec).toBe(before.restSec);
  });

  it('trocas sucessivas mantêm o PRIMEIRO original e atualizam o motivo', () => {
    const workout = makeWorkout();
    const first = applySwap(workout, 0, catalog[1], {
      reasonCode: 'equipment-occupied',
      swappedAt: 1,
    });
    const third: Pick<Exercise, 'id' | 'name' | 'muscleGroup'> = {
      id: 'cable-chest',
      name: 'Crossover na polia',
      muscleGroup: 'chest',
    };
    const second = applySwap(first, 0, third, { reasonCode: 'preference', swappedAt: 2 });

    expect(second.exercises[0].exerciseId).toBe('cable-chest');
    expect(second.exercises[0].name).toBe('Crossover na polia');
    // o snapshot continua sendo o do primeiro original
    expect(second.exercises[0].plannedExerciseName).toBe('Supino máquina');
    expect(second.exercises[0].swapReasonCode).toBe('preference');
  });
});
