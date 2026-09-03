import { describe, expect, it } from 'vitest';
import type { ActiveExercise, Exercise, ExerciseSlot, WorkoutSession, WorkoutSet } from '../../types';
import {
  createExerciseGroup,
  getExerciseGroups,
  nextWorkoutFocusIndex,
  resolveGroupRestAfterSet,
  ungroupExerciseSlots,
  validateExerciseGroup,
} from './grouping';
import {
  createInitialTechniqueLog,
  createRestPausePlan,
  recordTechniqueMiniSet,
  recordTechniqueSet,
  resolveTechniqueRestAfterChange,
} from './model';
import { aggregateTechniqueLog, aggregateWorkoutVolume } from './aggregator';
import { buildSessionPlan, startActiveSession } from '../../lib/workout-session-domain';

function slot(exerciseId: string, series = 3): ExerciseSlot {
  return {
    exerciseId,
    series,
    repRange: [8, 12],
    targetRPE: 8,
    restSec: 120,
    progression: 'dupla',
    incrementKg: 2.5,
  };
}

function exercise(id: string, muscleGroup: Exercise['muscleGroup'] = 'chest'): Exercise {
  return {
    id,
    name: `Exercício ${id}`,
    thumbnail: '',
    muscleGroup,
    secondaryMuscles: [],
    equipment: 'Halteres',
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

function set(id: string, completed = false): WorkoutSet {
  return { id, reps: 10, weight: 50, completed };
}

function groupedWorkout(completed: Record<string, boolean> = {}): WorkoutSession {
  const groupFields = {
    groupId: 'group-ab',
    groupRestSec: 90,
    groupType: 'superset' as const,
  };
  const makeExercise = (id: string, order: number): ActiveExercise => ({
    id,
    exerciseId: id,
    name: id,
    muscleGroup: 'chest',
    sets: Array.from({ length: 3 }, (_, index) => set(`${id}-${index}`, completed[`${id}-${index}`] === true)),
    ...groupFields,
    groupOrder: order,
  });
  return {
    id: 'grouped-session',
    name: 'Superset A+B',
    date: '2026-08-31',
    duration: 0,
    calories: 0,
    xpEarned: 0,
    exercises: [makeExercise('a', 0), makeExercise('b', 1)],
  };
}

describe('GOAL-27 — agrupamentos alternados', () => {
  it('cria, resume e desfaz um grupo sem alterar a ordem física dos slots', () => {
    const slots = [slot('a'), slot('b'), slot('c')];
    const grouped = createExerciseGroup(slots, [1, 0], {
      groupId: 'group-1',
      type: 'bi_set',
      restSec: 75,
    });

    expect(grouped.map((item) => item.exerciseId)).toEqual(['a', 'b', 'c']);
    expect(grouped[0]).toMatchObject({ groupId: 'group-1', groupOrder: 1, groupRestSec: 75, groupType: 'bi_set' });
    expect(grouped[1]).toMatchObject({ groupId: 'group-1', groupOrder: 0, groupRestSec: 75, groupType: 'bi_set' });
    expect(getExerciseGroups(grouped)).toMatchObject([{
      id: 'group-1',
      memberIndices: [1, 0],
      restSec: 75,
      roundCount: 3,
    }]);

    const ungrouped = ungroupExerciseSlots(grouped, 'group-1');
    expect(ungrouped.every((item) => !item.groupId && item.groupOrder === undefined)).toBe(true);
    expect(ungrouped.map((item) => item.exerciseId)).toEqual(['a', 'b', 'c']);
  });

  it('emite avisos informativos para bi-set/superset sem bloquear a criação', () => {
    const slots = [slot('a'), slot('b')];
    const sameMuscleWarning = validateExerciseGroup(
      slots,
      [exercise('a', 'chest'), exercise('b', 'chest')],
      [0, 1],
      'superset',
    );
    const distinctMuscles = validateExerciseGroup(
      slots,
      [exercise('a', 'chest'), exercise('b', 'back')],
      [0, 1],
      'superset',
    );
    const biSet = validateExerciseGroup(
      slots,
      [exercise('a', 'chest'), exercise('b', 'chest')],
      [0, 1],
      'bi_set',
    );

    expect(sameMuscleWarning.valid).toBe(true);
    expect(sameMuscleWarning.warnings.map((warning) => warning.code)).toContain('superset-muscle-group');
    expect(distinctMuscles.warnings).toEqual([]);
    expect(biSet.warnings).toEqual([]);
  });

  it('não dispara timer entre exercícios e dispara uma única pausa ao fim da rodada', () => {
    const firstExercise = groupedWorkout().exercises[0];
    const afterA1 = groupedWorkout({ 'a-0': true });
    const afterB1 = groupedWorkout({ 'a-0': true, 'b-0': true });

    expect(resolveGroupRestAfterSet(afterA1, 0, 0)).toMatchObject({
      mode: 'intra-group',
      seconds: 0,
      round: 1,
      nextExerciseIndex: 1,
    });
    expect(resolveGroupRestAfterSet(afterB1, 1, 0)).toMatchObject({
      mode: 'group-round',
      seconds: 90,
      round: 2,
      nextExerciseIndex: 0,
    });
    expect(firstExercise.groupId).toBe('group-ab');
  });

  it('alterna A+B por rodada e materializa 3x(A+B) como 6 SetLogs em 2 entradas', () => {
    const slots = createExerciseGroup([slot('a'), slot('b')], [0, 1], {
      groupId: 'group-ab',
      groupType: 'superset',
      groupRestSec: 90,
    });
    const plan = buildSessionPlan({ kind: 'program-day', name: 'Superset', slots });
    const baseExercises: ActiveExercise[] = slots.map((item, index) => ({
      id: `active-${index}`,
      exerciseId: item.exerciseId,
      name: item.exerciseId,
      muscleGroup: 'chest',
      sets: Array.from({ length: item.series }, (_, setIndex) => set(`${item.exerciseId}-${setIndex}`)),
    }));
    const { session } = startActiveSession({
      plan,
      sessionId: 'session-superset',
      name: 'Superset',
      date: '2026-08-31',
      startedAt: 1,
      exercises: baseExercises,
    });
    const completed = {
      ...session,
      exercises: session.exercises.map((item) => ({
        ...item,
        sets: item.sets.map((itemSet) => ({ ...itemSet, completed: true })),
      })),
    };

    expect(session.exercises).toHaveLength(2);
    expect(session.exercises.flatMap((item) => item.sets)).toHaveLength(6);
    expect(session.exercises.every((item) => item.groupId === 'group-ab')).toBe(true);
    expect(nextWorkoutFocusIndex(afterSet(session, 0, 0).exercises, 0, 0)).toBe(1);
    expect(nextWorkoutFocusIndex(afterSet(afterSet(session, 0, 0), 1, 0).exercises, 1, 0)).toBe(0);
    expect(aggregateWorkoutVolume(completed.exercises).effectiveSets).toBe(6);
  });
});

function afterSet(session: WorkoutSession, exerciseIndex: number, setIndex: number): WorkoutSession {
  return {
    ...session,
    exercises: session.exercises.map((item, currentIndex) => currentIndex === exerciseIndex
      ? { ...item, sets: item.sets.map((itemSet, currentSetIndex) => currentSetIndex === setIndex ? { ...itemSet, completed: true } : itemSet) }
      : item),
  };
}

describe('GOAL-27 — rest-pause e cluster', () => {
  it('conta rest-pause como uma série efetiva, soma a carga base nas mini-séries e cronometra 15–20s', () => {
    const plan = createRestPausePlan({
      baseWeight: 30,
      baseReps: 8,
      miniSetReps: [3, 2],
      pauseSec: 17,
    });
    const initial = createInitialTechniqueLog(plan);
    const afterBase = recordTechniqueSet(initial, 0, { weight: 30, reps: 8, completed: true }, 10);
    const afterMini = recordTechniqueMiniSet(afterBase, 0, { reps: 3, completed: true }, 11);
    const afterLastMini = recordTechniqueMiniSet(afterMini, 1, { reps: 2, completed: true }, 12);

    expect(plan.miniSets?.map((mini) => mini.restSec)).toEqual([17, 0]);
    expect(resolveTechniqueRestAfterChange(initial, afterBase, plan)).toEqual({ seconds: 17, reason: 'rest-pause-mini-set' });
    expect(resolveTechniqueRestAfterChange(afterBase, afterMini, plan)).toEqual({ seconds: 17, reason: 'rest-pause-mini-set' });
    expect(resolveTechniqueRestAfterChange(afterMini, afterLastMini, plan)).toBeNull();
    expect(aggregateTechniqueLog(afterLastMini)).toMatchObject({
      effectiveSets: 1,
      tonnage: 390,
      techniqueCount: 1,
    });
  });
});
