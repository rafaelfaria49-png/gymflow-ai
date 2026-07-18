import type { ActiveExercise, Exercise, WorkoutSession } from '../types';

export function updateWorkoutExerciseNotes(
  workout: WorkoutSession,
  exerciseIndex: number,
  notes: string,
): WorkoutSession {
  const exercise = workout.exercises[exerciseIndex];
  if (!exercise || exercise.notes === notes) return workout;
  return {
    ...workout,
    exercises: workout.exercises.map((item, index) => (
      index === exerciseIndex ? { ...item, notes } : item
    )),
  };
}

export function swapWorkoutExercise(
  workout: WorkoutSession,
  exerciseIndex: number,
  replacement: Pick<Exercise, 'id' | 'name' | 'muscleGroup'>,
): WorkoutSession {
  const exercise = workout.exercises[exerciseIndex];
  if (!exercise || exercise.exerciseId === replacement.id) return workout;
  return {
    ...workout,
    exercises: workout.exercises.map((item, index) => (
      index === exerciseIndex
        ? {
            ...item,
            exerciseId: replacement.id,
            name: replacement.name,
            muscleGroup: replacement.muscleGroup,
          }
        : item
    )),
  };
}

export interface CrowdedGymAdaptationResult {
  workout: WorkoutSession;
  replacementCount: number;
}

export function adaptWorkoutForCrowdedGym(
  workout: WorkoutSession,
  exerciseCatalog: Exercise[],
): CrowdedGymAdaptationResult {
  let replacementCount = 0;
  const exercises = workout.exercises.map((activeExercise) => {
    const current = exerciseCatalog.find((exercise) => exercise.id === activeExercise.exerciseId);
    if (
      !current
      || (
        current.equipment !== 'Máquina'
        && !current.equipment.includes('Leg Press')
        && !current.equipment.includes('Polia')
      )
    ) {
      return activeExercise;
    }

    const replacement = exerciseCatalog.find((exercise) => (
      exercise.muscleGroup === current.muscleGroup
      && exercise.id !== current.id
      && (exercise.equipment === 'Halteres' || exercise.equipment === 'Peso Corporal')
    ));
    if (!replacement) return activeExercise;

    replacementCount += 1;
    return {
      ...activeExercise,
      exerciseId: replacement.id,
      name: replacement.name,
      muscleGroup: replacement.muscleGroup,
    };
  });

  return {
    workout: replacementCount > 0 ? { ...workout, exercises } : workout,
    replacementCount,
  };
}

export interface WorkoutSetCompletionResult {
  workout: WorkoutSession;
  changed: boolean;
  completed: boolean;
  isLastRemainingSet: boolean;
  targetExercise: ActiveExercise | null;
}

export function toggleWorkoutSetCompletion(
  workout: WorkoutSession,
  exerciseIndex: number,
  setIndex: number,
): WorkoutSetCompletionResult {
  const targetExercise = workout.exercises[exerciseIndex];
  const targetSet = targetExercise?.sets[setIndex];
  if (!targetExercise || !targetSet) {
    return {
      workout,
      changed: false,
      completed: false,
      isLastRemainingSet: false,
      targetExercise: null,
    };
  }

  const completed = !targetSet.completed;
  const exercises = workout.exercises.map((exercise, currentExerciseIndex) => (
    currentExerciseIndex === exerciseIndex
      ? {
          ...exercise,
          sets: exercise.sets.map((set, currentSetIndex) => (
            currentSetIndex === setIndex ? { ...set, completed } : set
          )),
        }
      : exercise
  ));
  const isLastRemainingSet = completed && workout.exercises.every((exercise, currentExerciseIndex) => (
    exercise.sets.every((set, currentSetIndex) => (
      (currentExerciseIndex === exerciseIndex && currentSetIndex === setIndex) || set.completed
    ))
  ));

  return {
    workout: { ...workout, exercises },
    changed: true,
    completed,
    isLastRemainingSet,
    targetExercise,
  };
}
