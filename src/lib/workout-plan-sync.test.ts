import { describe, expect, it } from 'vitest';
import type { Exercise, ExerciseSlot, ProgramDay, WeeklyWorkoutDay, WorkoutProgram } from '../types';
import {
  MISSING_PROGRAM_DAY_ISSUE,
  MISSING_PROGRAM_DAY_WORKOUT_NAME,
  reconcileWeeklyPlanWithProgram,
} from './workout-plan-sync';

function makeExercise(id: string, muscleGroup: Exercise['muscleGroup']): Exercise {
  return {
    id,
    name: id,
    thumbnail: '',
    muscleGroup,
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

function makeSlot(exerciseId: string, series = 3): ExerciseSlot {
  return {
    exerciseId,
    series,
    repRange: [8, 12],
    targetRPE: 8,
    restSec: 90,
    progression: 'dupla',
    incrementKg: 2.5,
  };
}

function makeDay(id: string, name: string, slots: ExerciseSlot[], dayNumber = 1): ProgramDay {
  return { id, name, slots, dayNumber };
}

function makeProgram(days: ProgramDay[]): WorkoutProgram {
  return {
    id: 'program-1',
    name: 'Programa editado',
    durationWeeks: 4,
    frequencyDays: days.length,
    level: 'intermediate',
    objective: 'Teste',
    exercises: [],
    description: 'Teste',
    repeatWeeks: true,
    weeks: [{ number: 1, days }],
    isCustom: true,
  };
}

function plannedDay(overrides: Partial<WeeklyWorkoutDay> = {}): WeeklyWorkoutDay {
  return {
    dayName: 'Segunda',
    workoutName: 'Nome antigo',
    muscleGroups: ['back'],
    duration: 999,
    exerciseCount: 99,
    isRest: false,
    programId: 'program-1',
    programDayId: 'day-2',
    trained: false,
    ...overrides,
  };
}

const catalog = [
  makeExercise('chest-1', 'chest'),
  makeExercise('legs-1', 'legs'),
];

describe('reconcileWeeklyPlanWithProgram', () => {
  it('mantém a mesma semana quando não há planejamento', () => {
    const weeklyPlan: WeeklyWorkoutDay[] = [];
    const result = reconcileWeeklyPlanWithProgram(weeklyPlan, makeProgram([]), catalog);
    expect(result.weeklyPlan).toBe(weeklyPlan);
    expect(result.invalidatedDayNames).toEqual([]);
  });

  it('atualiza nome, exercícios, duração, grupos e limpa problema resolvido', () => {
    const program = makeProgram([
      makeDay('day-2', 'Peito e Pernas', [makeSlot('chest-1', 4), makeSlot('legs-1', 2)], 2),
    ]);
    const result = reconcileWeeklyPlanWithProgram([
      plannedDay({ planningIssue: MISSING_PROGRAM_DAY_ISSUE }),
    ], program, catalog);

    expect(result.weeklyPlan[0]).toMatchObject({
      workoutName: 'Dia 2 — Peito e Pernas',
      muscleGroups: ['chest', 'legs'],
      exerciseCount: 2,
      programId: 'program-1',
      programDayId: 'day-2',
      planningIssue: undefined,
    });
    expect(result.weeklyPlan[0].duration).toBeGreaterThan(0);
    expect(result.weeklyPlan[0].duration).not.toBe(999);
    expect(result.updatedDayNames).toEqual(['Segunda']);
    expect(result.invalidatedDayNames).toEqual([]);
  });

  it('não altera dias treinados nem dias de outro programa', () => {
    const trained = plannedDay({ trained: true });
    const otherProgram = plannedDay({ dayName: 'Terça', programId: 'program-2' });
    const weeklyPlan = [trained, otherProgram];
    const result = reconcileWeeklyPlanWithProgram(
      weeklyPlan,
      makeProgram([makeDay('day-2', 'Novo', [makeSlot('chest-1')], 2)]),
      catalog,
    );

    expect(result.weeklyPlan).toBe(weeklyPlan);
    expect(result.weeklyPlan[0]).toBe(trained);
    expect(result.weeklyPlan[1]).toBe(otherProgram);
  });

  it('invalida um programDayId removido sem cair no primeiro dia', () => {
    const result = reconcileWeeklyPlanWithProgram(
      [plannedDay()],
      makeProgram([makeDay('day-1', 'Dia que restou', [makeSlot('chest-1')])]),
      catalog,
    );

    expect(result.invalidatedDayNames).toEqual(['Segunda']);
    expect(result.weeklyPlan[0]).toMatchObject({
      workoutName: MISSING_PROGRAM_DAY_WORKOUT_NAME,
      muscleGroups: [],
      duration: 0,
      exerciseCount: 0,
      isRest: false,
      programId: undefined,
      programDayId: undefined,
      planningIssue: MISSING_PROGRAM_DAY_ISSUE,
    });
    expect(result.weeklyPlan[0].workoutName).not.toContain('Dia que restou');
  });

  it('reconcilia vínculo legado sem programDayId quando existe exatamente um dia canônico', () => {
    const result = reconcileWeeklyPlanWithProgram(
      [plannedDay({ programDayId: undefined, planningIssue: MISSING_PROGRAM_DAY_ISSUE })],
      makeProgram([makeDay('day-1', 'Único dia', [makeSlot('chest-1', 4)])]),
      catalog,
    );
    expect(result.weeklyPlan[0]).toMatchObject({
      workoutName: 'Dia 1 — Único dia',
      muscleGroups: ['chest'],
      exerciseCount: 1,
      programId: 'program-1',
      programDayId: 'day-1',
      planningIssue: undefined,
    });
    expect(result.weeklyPlan[0].duration).toBeGreaterThan(0);
    expect(result.updatedDayNames).toEqual(['Segunda']);
    expect(result.invalidatedDayNames).toEqual([]);
  });

  it('tolera programa legado sem weeks sem lançar', () => {
    const withoutWeeks = {
      ...makeProgram([]),
      weeks: undefined,
      exercises: [{ exerciseId: 'chest-1', sets: 3, reps: '10' }],
    } as unknown as WorkoutProgram;
    const result = reconcileWeeklyPlanWithProgram([plannedDay({ programDayId: undefined })], withoutWeeks, catalog);
    expect(result.invalidatedDayNames).toEqual(['Segunda']);
    expect(result.weeklyPlan[0].planningIssue).toBe(MISSING_PROGRAM_DAY_ISSUE);
  });

  it('invalida vínculo multi-dia sem programDayId sem escolher silenciosamente o Dia 1', () => {
    const result = reconcileWeeklyPlanWithProgram(
      [plannedDay({ programDayId: undefined })],
      makeProgram([
        makeDay('day-1', 'Primeiro dia', [makeSlot('chest-1')]),
        makeDay('day-2', 'Segundo dia', [makeSlot('legs-1')], 2),
      ]),
      catalog,
    );
    expect(result.invalidatedDayNames).toEqual(['Segunda']);
    expect(result.weeklyPlan[0]).toMatchObject({
      workoutName: MISSING_PROGRAM_DAY_WORKOUT_NAME,
      programId: undefined,
      programDayId: undefined,
      planningIssue: MISSING_PROGRAM_DAY_ISSUE,
    });
    expect(result.weeklyPlan[0].workoutName).not.toContain('Primeiro dia');
  });

  it('não associa o único dia novo a um vínculo com programDayId removido', () => {
    const result = reconcileWeeklyPlanWithProgram(
      [plannedDay({ programDayId: 'day-removido' })],
      makeProgram([makeDay('day-1', 'Dia atual', [makeSlot('chest-1')])]),
      catalog,
    );
    expect(result.weeklyPlan[0].planningIssue).toBe(MISSING_PROGRAM_DAY_ISSUE);
    expect(result.weeklyPlan[0].programId).toBeUndefined();
  });

  it('mantém snapshot treinado sem programDayId intocado', () => {
    const trained = plannedDay({ trained: true, programDayId: undefined });
    const result = reconcileWeeklyPlanWithProgram(
      [trained],
      makeProgram([makeDay('day-1', 'Dia atual', [makeSlot('chest-1')])]),
      catalog,
    );
    expect(result.weeklyPlan).toEqual([trained]);
    expect(result.weeklyPlan[0]).toBe(trained);
  });

  it('não muta a semana, o programa nem o catálogo recebidos', () => {
    const weeklyPlan = [plannedDay()];
    const program = makeProgram([makeDay('day-2', 'Novo', [makeSlot('chest-1')], 2)]);
    const weeklyBefore = structuredClone(weeklyPlan);
    const programBefore = structuredClone(program);
    const catalogBefore = structuredClone(catalog);

    reconcileWeeklyPlanWithProgram(weeklyPlan, program, catalog);

    expect(weeklyPlan).toEqual(weeklyBefore);
    expect(program).toEqual(programBefore);
    expect(catalog).toEqual(catalogBefore);
  });
});
