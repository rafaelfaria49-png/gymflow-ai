import type { ActiveExercise, WorkoutSet } from '../../types';
import type { TechniqueId, TechniqueLog, TechniqueMetrics } from './types';

/** Pesos transparentes da tabela TECH §5. Drop/rest-pause/cluster são uma série efetiva. */
export const TECHNIQUE_AGGREGATION_RULES: Readonly<Record<TechniqueId, {
  stageFatigue: number;
  failureFatigue: number;
  baseFatigue: number;
}>> = Object.freeze({
  drop_set: Object.freeze({ stageFatigue: 0.25, failureFatigue: 0.25, baseFatigue: 1 }),
  pyramid: Object.freeze({ stageFatigue: 0.1, failureFatigue: 0, baseFatigue: 1 }),
  back_off: Object.freeze({ stageFatigue: 0.05, failureFatigue: 0, baseFatigue: 1 }),
  to_failure: Object.freeze({ stageFatigue: 0, failureFatigue: 0.25, baseFatigue: 1 }),
  tempo: Object.freeze({ stageFatigue: 0.1, failureFatigue: 0, baseFatigue: 1 }),
  iso_hold: Object.freeze({ stageFatigue: 0.15, failureFatigue: 0, baseFatigue: 1 }),
  partials: Object.freeze({ stageFatigue: 0.05, failureFatigue: 0, baseFatigue: 1 }),
  rest_pause: Object.freeze({ stageFatigue: 0.2, failureFatigue: 0.25, baseFatigue: 1 }),
  cluster: Object.freeze({ stageFatigue: 0.15, failureFatigue: 0.1, baseFatigue: 1 }),
});

function roundMetric(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

function completedSetVolume(set: WorkoutSet): number {
  return !set.isWarmup && set.completed && Number.isFinite(set.weight) && Number.isFinite(set.reps)
    ? Math.max(0, set.weight) * Math.max(0, set.reps)
    : 0;
}

function completedStageVolume(log: TechniqueLog): number {
  return (log.stages ?? []).reduce((total, stage) => (
    total + (stage.completed && Number.isFinite(stage.weight) && Number.isFinite(stage.reps)
      ? Math.max(0, stage.weight) * Math.max(0, stage.reps)
      : 0)
  ), 0);
}

function completedTechniqueSetVolume(log: TechniqueLog): number {
  return (log.sets ?? []).reduce((total, set) => (
    total + (set.completed && Number.isFinite(set.weight) && Number.isFinite(set.reps)
      ? Math.max(0, set.weight) * Math.max(0, set.reps)
      : 0)
  ), 0);
}

function completedMiniSetVolume(log: TechniqueLog): number {
  const baseWeight = log.sets?.find((set) => Number.isFinite(set.weight))?.weight ?? 0;
  return (log.miniSets ?? []).reduce((total, mini) => (
    total + (mini.completed && Number.isFinite(mini.reps)
      ? Math.max(0, baseWeight) * Math.max(0, mini.reps)
      : 0)
  ), 0);
}

function hasCompletedTechniqueEntry(log: TechniqueLog): boolean {
  return Boolean(
    log.stages?.some((stage) => stage.completed)
    || log.sets?.some((set) => set.completed)
    || log.miniSets?.some((mini) => mini.completed),
  );
}

/** Agrega um log especial sem transformar cada drop em uma série muscular nova. */
export function aggregateTechniqueLog(log: TechniqueLog): TechniqueMetrics {
  const rules = TECHNIQUE_AGGREGATION_RULES[log.type];
  const completedStages = log.stages?.filter((stage) => stage.completed).length ?? 0;
  const failedStages = log.stages?.filter((stage) => stage.failed && stage.completed).length ?? 0;
  const failedSets = log.sets?.filter((set) => set.failed && set.completed).length ?? 0;
  const completedSets = log.sets?.filter((set) => set.completed).length ?? 0;
  const hasCompleted = hasCompletedTechniqueEntry(log);

  let effectiveSets = 0;
  switch (log.type) {
    case 'drop_set':
      effectiveSets = hasCompleted ? 1 : 0;
      break;
    case 'to_failure':
    case 'tempo':
    case 'iso_hold':
    case 'partials':
    case 'rest_pause':
    case 'cluster':
      effectiveSets = hasCompleted ? 1 : 0;
      break;
    case 'pyramid':
    case 'back_off':
      effectiveSets = completedSets;
      break;
  }

  const tonnage = log.type === 'drop_set' || log.type === 'cluster'
    ? completedStageVolume(log)
    : log.type === 'rest_pause'
      ? completedTechniqueSetVolume(log) + completedMiniSetVolume(log)
      : completedTechniqueSetVolume(log);
  const fatigueIndex = effectiveSets === 0
    ? 0
    : rules.baseFatigue
      + Math.max(0, completedStages + (log.miniSets?.filter((mini) => mini.completed).length ?? 0) - 1) * rules.stageFatigue
      + (failedStages + failedSets) * rules.failureFatigue;

  return {
    effectiveSets,
    tonnage: roundMetric(tonnage),
    fatigueIndex: roundMetric(fatigueIndex),
    techniqueCount: hasCompleted ? 1 : 0,
  };
}

export interface ActiveExerciseVolume extends TechniqueMetrics {
  totalVolume: number;
}

export function aggregateActiveExerciseVolume(exercise: ActiveExercise): ActiveExerciseVolume {
  if (exercise.techniqueLog && hasCompletedTechniqueEntry(exercise.techniqueLog)) {
    const metrics = aggregateTechniqueLog(exercise.techniqueLog);
    return { ...metrics, totalVolume: metrics.tonnage };
  }
  const completedSets = exercise.sets.filter((set) => set.completed && !set.isWarmup);
  const totalVolume = completedSets.reduce((total, set) => total + completedSetVolume(set), 0);
  return {
    effectiveSets: completedSets.length,
    tonnage: roundMetric(totalVolume),
    fatigueIndex: roundMetric(completedSets.length),
    techniqueCount: 0,
    totalVolume: roundMetric(totalVolume),
  };
}

export interface WorkoutVolumeSummary extends TechniqueMetrics {
  totalVolume: number;
}

export function aggregateWorkoutVolume(exercises: readonly ActiveExercise[]): WorkoutVolumeSummary {
  const summary = exercises.reduce<WorkoutVolumeSummary>((total, exercise) => {
    const current = aggregateActiveExerciseVolume(exercise);
    return {
      effectiveSets: total.effectiveSets + current.effectiveSets,
      tonnage: total.tonnage + current.tonnage,
      fatigueIndex: total.fatigueIndex + current.fatigueIndex,
      techniqueCount: total.techniqueCount + current.techniqueCount,
      totalVolume: total.totalVolume + current.totalVolume,
    };
  }, { effectiveSets: 0, tonnage: 0, fatigueIndex: 0, techniqueCount: 0, totalVolume: 0 });
  return {
    ...summary,
    tonnage: roundMetric(summary.tonnage),
    fatigueIndex: roundMetric(summary.fatigueIndex),
    totalVolume: roundMetric(summary.totalVolume),
  };
}

/** Nome explícito para consumidores que tratam o resultado como agregador TECH. */
export const aggregateTrainingVolume = aggregateWorkoutVolume;
