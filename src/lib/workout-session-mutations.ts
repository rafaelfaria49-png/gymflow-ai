import type { ActiveExercise, Exercise, WorkoutSession } from '../types';
import type { EquipmentCategory, EquipmentId } from '../types/training-taxonomy';
import { getEquipmentDefinition } from './equipment-registry';
import { resolveLegacyEquipment } from './equipment-legacy-map';

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

export interface WorkoutSubstituteRankingOptions {
  /** Quando ativo, livres/cabos recebem bônus de ranking para horários de pico. */
  crowdedGym?: boolean;
}

export interface RankedWorkoutSubstitute {
  exercise: Exercise;
  index: number;
  score: number;
  preferredInCrowdedGym: boolean;
  equipmentCategories: EquipmentCategory[];
}

function resolvedEquipmentIds(exercise: Exercise): EquipmentId[] {
  const canonical = Array.isArray(exercise.equipmentIds)
    ? exercise.equipmentIds.filter((id) => Boolean(getEquipmentDefinition(id)))
    : [];
  return canonical.length > 0 ? [...canonical] : [...resolveLegacyEquipment(exercise.equipment).equipmentIds];
}

function equipmentCategories(exercise: Exercise): EquipmentCategory[] {
  return [...new Set(
    resolvedEquipmentIds(exercise)
      .map((id) => getEquipmentDefinition(id)?.category)
      .filter((category): category is EquipmentCategory => Boolean(category)),
  )];
}

/** Peso alto = melhor alternativa para uma academia em horário de pico. */
export function crowdedGymEquipmentScore(exercise: Exercise): number {
  const categories = equipmentCategories(exercise);
  if (categories.includes('free_weight')) return 300;
  if (categories.includes('cable')) return 250;
  if (categories.includes('bodyweight')) return 200;

  // Fallback para exercícios antigos cujo texto ainda não tem mapeamento.
  const label = exercise.equipment.toLocaleLowerCase('pt-BR');
  if (label.includes('halter') || label.includes('kettlebell') || label.includes('peso livre')) return 300;
  if (label.includes('polia') || label.includes('cabo') || label.includes('pulley')) return 250;
  if (label.includes('peso corporal') || label.includes('sem equipamento')) return 200;
  return 0;
}

/**
 * Ordena substitutos do mesmo grupo sem alterar o catálogo.
 * Fora do modo cheio, a ordem original é mantida; no modo cheio, livres e
 * cabos sobem com bônus explícito e empates continuam determinísticos.
 */
export function rankWorkoutSubstitutes(
  current: Pick<Exercise, 'id' | 'muscleGroup'>,
  catalog: readonly Exercise[],
  options: WorkoutSubstituteRankingOptions = {},
): Exercise[] {
  const ranked: RankedWorkoutSubstitute[] = catalog
    .map((exercise, index) => ({
      exercise,
      index,
      score: options.crowdedGym ? crowdedGymEquipmentScore(exercise) : 0,
      preferredInCrowdedGym: crowdedGymEquipmentScore(exercise) > 0,
      equipmentCategories: equipmentCategories(exercise),
    }))
    .filter(({ exercise }) => exercise.muscleGroup === current.muscleGroup && exercise.id !== current.id);

  return ranked
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ exercise }) => exercise);
}

export const rankCrowdedGymSubstitutes = rankWorkoutSubstitutes;

/** Move uma entrada da fila sem mutar a sessão nem alterar seus metadados. */
export function reorderWorkoutExercises(
  workout: WorkoutSession,
  fromIndex: number,
  toIndex: number,
): WorkoutSession {
  if (
    fromIndex === toIndex
    || fromIndex < 0
    || toIndex < 0
    || fromIndex >= workout.exercises.length
    || toIndex >= workout.exercises.length
  ) return workout;

  const exercises = [...workout.exercises];
  const [moved] = exercises.splice(fromIndex, 1);
  exercises.splice(toIndex, 0, moved);
  return { ...workout, exercises };
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

    const replacement = rankWorkoutSubstitutes(current, exerciseCatalog, { crowdedGym: true })
      .find((exercise) => crowdedGymEquipmentScore(exercise) > 0);
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
  const isLastRemainingSet = completed
    && !targetSet.isWarmup
    && workout.exercises.every((exercise, currentExerciseIndex) => (
      exercise.sets.every((set, currentSetIndex) => (
        set.isWarmup
        || (currentExerciseIndex === exerciseIndex && currentSetIndex === setIndex)
        || set.completed
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
