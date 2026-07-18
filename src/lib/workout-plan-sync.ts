import type { Exercise, WeeklyWorkoutDay, WorkoutProgram } from '../types';
import { programDayDisplayLabel } from './workout-day-naming';
import { getProgramDays } from './workout-program-days';
import { estimateWorkoutDuration, muscleGroupsForSlots } from './workoutDuration';

export const MISSING_PROGRAM_DAY_ISSUE = 'missing-program-day' as const;
export const MISSING_PROGRAM_DAY_WORKOUT_NAME = 'Escolha novamente o treino';

export interface WeeklyPlanReconciliationResult {
  weeklyPlan: WeeklyWorkoutDay[];
  invalidatedDayNames: string[];
  updatedDayNames: string[];
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Atualiza apenas o cache de apresentação dos vínculos futuros do programa salvo.
 * Dias já treinados são snapshots do que aconteceu e nunca são reescritos.
 */
export function reconcileWeeklyPlanWithProgram(
  weeklyPlan: WeeklyWorkoutDay[],
  savedProgram: WorkoutProgram,
  exerciseCatalog: Exercise[],
): WeeklyPlanReconciliationResult {
  const canonicalDays = getProgramDays(savedProgram);
  const programDays = new Map(canonicalDays.map((day) => [day.id, day] as const));
  const invalidatedDayNames: string[] = [];
  const updatedDayNames: string[] = [];
  let changed = false;

  const reconciled = weeklyPlan.map((plannedDay) => {
    if (plannedDay.trained || plannedDay.programId !== savedProgram.id) return plannedDay;

    const programDay = plannedDay.programDayId
      ? programDays.get(plannedDay.programDayId)
      : canonicalDays.length === 1
        ? canonicalDays[0]
        : undefined;

    if (!programDay) {
      invalidatedDayNames.push(plannedDay.dayName);
      changed = true;
      return {
        ...plannedDay,
        workoutName: MISSING_PROGRAM_DAY_WORKOUT_NAME,
        muscleGroups: [],
        duration: 0,
        exerciseCount: 0,
        isRest: false,
        programId: undefined,
        programDayId: undefined,
        planningIssue: MISSING_PROGRAM_DAY_ISSUE,
      };
    }

    const estimate = estimateWorkoutDuration(programDay.slots);
    const muscleGroups = muscleGroupsForSlots(programDay.slots, exerciseCatalog);
    const workoutName = programDayDisplayLabel(programDay);
    const dayChanged = plannedDay.workoutName !== workoutName
      || !sameStrings(plannedDay.muscleGroups, muscleGroups)
      || plannedDay.duration !== estimate.minutes
      || plannedDay.exerciseCount !== estimate.exerciseCount
      || plannedDay.isRest
      || plannedDay.programDayId !== programDay.id
      || plannedDay.planningIssue !== undefined;

    if (!dayChanged) return plannedDay;
    changed = true;
    updatedDayNames.push(plannedDay.dayName);
    return {
      ...plannedDay,
      workoutName,
      muscleGroups,
      duration: estimate.minutes,
      exerciseCount: estimate.exerciseCount,
      isRest: false,
      programId: savedProgram.id,
      programDayId: programDay.id,
      planningIssue: undefined,
    };
  });

  return {
    weeklyPlan: changed ? reconciled : weeklyPlan,
    invalidatedDayNames,
    updatedDayNames,
  };
}
