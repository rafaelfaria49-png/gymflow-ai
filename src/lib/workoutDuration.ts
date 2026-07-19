// GOAL-10.5/22: estimadores puros de duração. A API curta permanece compatível
// com Planejador/Construtor; a API detalhada separa trabalho, descanso, setup e transição.

import type {
  Exercise,
  ExerciseSlot,
} from '../types';
import type {
  EquipmentCategory,
  EquipmentId,
  ExerciseMechanics,
  MuscleGroupId,
} from '../types/training-taxonomy';
import type {
  DetailedWorkoutDurationEstimate,
  ExerciseDurationEstimate,
  VolumeConfidence,
} from '../types/training-volume';
import { resolveLegacyEquipment } from './equipment-legacy-map';
import { getEquipmentDefinition } from './equipment-registry';
import { getMuscleGroupDefinition, resolveLegacyMuscleGroup } from './training-taxonomy';
import { DURATION_RULES, lowestConfidence } from './training-volume-rules';
import { resolveTrainingGoalContext } from './training-volume';
import { analyzeWorkoutTimeFit } from './workout-time-fit';

/** Contrato legado consumido hoje pelo Construtor, Planejador e cards. */
export interface WorkoutDurationEstimate {
  minutes: number;
  totalSeries: number;
  exerciseCount: number;
}

export interface DetailedWorkoutDurationOptions {
  includeWarmup?: boolean;
  defaultRestSeconds?: number;
  goal?: unknown;
  calculationMode?: 'detailed' | 'legacy';
  transitionSecondsOverride?: number;
  setupSecondsOverride?: number;
}

interface EquipmentContext {
  equipmentIds: EquipmentId[];
  categories: EquipmentCategory[];
  confidence: VolumeConfidence;
  generic: boolean;
  warnings: string[];
}

interface WorkEstimate {
  repetitionTarget: number | null;
  targetSeconds: number;
  lowerSeconds: number;
  upperSeconds: number;
  confidence: VolumeConfidence;
  assumptions: string[];
  warnings: string[];
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function emptyDetailedEstimate(): DetailedWorkoutDurationEstimate {
  return {
    totalMinutes: 0,
    lowerBoundMinutes: 0,
    upperBoundMinutes: 0,
    workSeconds: 0,
    restSeconds: 0,
    transitionSeconds: 0,
    setupSeconds: 0,
    warmupSeconds: 0,
    totalSeries: 0,
    exerciseCount: 0,
    breakdownByExercise: [],
    assumptions: ['Nenhum exercício informado.'],
    warnings: [],
    confidence: 'high',
  };
}

function resolveEquipmentContext(exercise: Exercise | undefined): EquipmentContext {
  if (!exercise) {
    return {
      equipmentIds: [],
      categories: [],
      confidence: 'low',
      generic: true,
      warnings: ['Exercício ausente no catálogo; setup e transição usam fallback genérico.'],
    };
  }

  const canonicalIds = Array.isArray(exercise.equipmentIds)
    ? exercise.equipmentIds.filter((id) => Boolean(getEquipmentDefinition(id)))
    : [];
  if (canonicalIds.length > 0) {
    return {
      equipmentIds: [...canonicalIds],
      categories: unique(canonicalIds
        .map((id) => getEquipmentDefinition(id)?.category)
        .filter((category): category is EquipmentCategory => Boolean(category))),
      confidence: 'high',
      generic: false,
      warnings: [],
    };
  }

  const resolution = resolveLegacyEquipment(exercise.equipment ?? '');
  const categories = unique(resolution.equipmentIds
    .map((id) => getEquipmentDefinition(id)?.category)
    .filter((category): category is EquipmentCategory => Boolean(category)));
  return {
    equipmentIds: [...resolution.equipmentIds],
    categories,
    confidence: resolution.resolution === 'unresolved' || resolution.resolution === 'generic' ? 'low' : 'medium',
    generic: resolution.resolution === 'generic' || resolution.resolution === 'unresolved',
    warnings: [
      'Equipamento resolvido a partir do texto legado.',
      ...(resolution.warnings ?? []),
    ],
  };
}

function setupSecondsFor(context: EquipmentContext, exercise: Exercise | undefined): number {
  if (context.equipmentIds.includes('barbell') && context.equipmentIds.includes('weight_plates')) {
    return DURATION_RULES.barbellPlateSetupSeconds;
  }
  const categorySeconds = context.categories.map((category) => DURATION_RULES.setupSecondsByCategory[category]);
  let setup = categorySeconds.length > 0 ? Math.max(...categorySeconds) : DURATION_RULES.setupSecondsByCategory.other;
  if (exercise?.laterality === 'unilateral' || exercise?.laterality === 'alternating') setup += 10;
  return setup;
}

function transitionSecondsBetween(current: EquipmentContext, next: EquipmentContext): number {
  const currentIds = new Set(current.equipmentIds);
  const hasSharedEquipment = next.equipmentIds.some((id) => currentIds.has(id));
  let seconds: number;
  const currentUsesBarbellOrPlates = current.equipmentIds.some((id) => id === 'barbell' || id === 'weight_plates');
  const nextUsesBarbellOrPlates = next.equipmentIds.some((id) => id === 'barbell' || id === 'weight_plates');
  if (currentUsesBarbellOrPlates || nextUsesBarbellOrPlates) {
    seconds = currentUsesBarbellOrPlates && nextUsesBarbellOrPlates
      ? DURATION_RULES.transitionSeconds.sameBarbellOrPlates
      : DURATION_RULES.transitionSeconds.barbellOrPlates;
  } else if (hasSharedEquipment && current.equipmentIds.length > 0) {
    seconds = DURATION_RULES.transitionSeconds.sameEquipment;
  } else if (current.categories.some((category) => next.categories.includes(category))) {
    seconds = DURATION_RULES.transitionSeconds.sameCategory;
  } else {
    seconds = DURATION_RULES.transitionSeconds.differentEquipment;
  }
  return seconds + (current.generic || next.generic ? DURATION_RULES.transitionSeconds.genericExtra : 0);
}

function canonicalPrimary(exercise: Exercise | undefined): MuscleGroupId | undefined {
  if (!exercise) return undefined;
  if (exercise.primaryMuscleGroupId && getMuscleGroupDefinition(exercise.primaryMuscleGroupId)) {
    return exercise.primaryMuscleGroupId;
  }
  return resolveLegacyMuscleGroup(exercise.muscleGroup)?.id;
}

function inferMechanics(exercise: Exercise | undefined): { mechanics: ExerciseMechanics | undefined; confidence: VolumeConfidence } {
  if (exercise?.mechanics) return { mechanics: exercise.mechanics, confidence: 'high' };
  if (!exercise) return { mechanics: undefined, confidence: 'low' };
  if (exercise.muscleGroup === 'cardio') return { mechanics: 'cardio', confidence: 'medium' };
  if (exercise.muscleGroup === 'mobility') return { mechanics: 'mobility', confidence: 'medium' };
  return {
    mechanics: exercise.secondaryMuscles && exercise.secondaryMuscles.length > 0 ? 'compound' : 'isolation',
    confidence: 'medium',
  };
}

function estimateWork(slot: ExerciseSlot, exercise: Exercise | undefined): WorkEstimate {
  const series = Number.isFinite(slot?.series) ? Math.max(0, slot.series) : 0;
  const repMin = Array.isArray(slot?.repRange) && Number.isFinite(slot.repRange[0]) ? Math.max(0, slot.repRange[0]) : null;
  const repMax = Array.isArray(slot?.repRange) && Number.isFinite(slot.repRange[1]) ? Math.max(0, slot.repRange[1]) : null;
  const validRange = repMin !== null && repMax !== null && repMax >= repMin && repMax > 0;
  const { mechanics, confidence: mechanicsConfidence } = inferMechanics(exercise);
  if (!validRange) {
    return {
      repetitionTarget: null,
      targetSeconds: series * DURATION_RULES.fallbackSetSeconds,
      lowerSeconds: series * DURATION_RULES.fallbackSetSeconds * DURATION_RULES.lowerBoundFactor,
      upperSeconds: series * DURATION_RULES.fallbackSetSeconds * DURATION_RULES.upperBoundFactor,
      confidence: 'low',
      assumptions: [`Faixa de repetições ausente; fallback de ${DURATION_RULES.fallbackSetSeconds} s por série.`],
      warnings: ['A duração de trabalho usa fallback porque a faixa de repetições está incompleta.'],
    };
  }

  const primary = canonicalPrimary(exercise);
  const repetitionTarget = (repMin + repMax) / 2;
  if (primary === 'cardio' || mechanics === 'cardio') {
    const seconds = repetitionTarget * 60 * series;
    return {
      repetitionTarget,
      targetSeconds: seconds,
      lowerSeconds: repMin * 60 * series,
      upperSeconds: repMax * 60 * series,
      confidence: mechanicsConfidence,
      assumptions: ['A faixa de cardio foi interpretada como minutos por bloco.'],
      warnings: [],
    };
  }
  if (primary === 'core' && slot.progression === 'nenhuma') {
    const seconds = repetitionTarget * series;
    return {
      repetitionTarget,
      targetSeconds: seconds,
      lowerSeconds: repMin * series,
      upperSeconds: repMax * series,
      confidence: mechanicsConfidence,
      assumptions: ['A faixa de core sem progressão foi interpretada como segundos de isometria.'],
      warnings: [],
    };
  }

  const secondsPerRep = mechanics === 'compound'
    ? DURATION_RULES.secondsPerRep.compound
    : mechanics === 'isolation'
      ? DURATION_RULES.secondsPerRep.isolation
      : mechanics === 'functional'
        ? DURATION_RULES.secondsPerRep.functional
        : DURATION_RULES.secondsPerRep.fallback;
  const lateralityMultiplier = exercise?.laterality === 'unilateral' || exercise?.laterality === 'alternating'
    ? DURATION_RULES.unilateralWorkMultiplier
    : 1;
  const overhead = DURATION_RULES.setStartEndOverheadSeconds;
  return {
    repetitionTarget,
    targetSeconds: series * (repetitionTarget * secondsPerRep + overhead) * lateralityMultiplier,
    lowerSeconds: series * (repMin * DURATION_RULES.secondsPerRep.lower + overhead * 0.75) * lateralityMultiplier,
    upperSeconds: series * (repMax * DURATION_RULES.secondsPerRep.upper + overhead * 1.25) * lateralityMultiplier,
    confidence: mechanicsConfidence,
    assumptions: [
      `${secondsPerRep} s por repetição e ${overhead} s de overhead por série foram usados apenas para estimativa.`,
      ...(lateralityMultiplier > 1 ? ['Exercício unilateral recebeu tempo operacional adicional.'] : []),
    ],
    warnings: mechanicsConfidence === 'high' ? [] : ['Mecânica não curada; tempo de execução usa heurística legada.'],
  };
}

function restPerSet(
  slot: ExerciseSlot,
  exercise: Exercise | undefined,
  options: DetailedWorkoutDurationOptions,
): { seconds: number; confidence: VolumeConfidence; assumption?: string } {
  if (Number.isFinite(slot?.restSec) && slot.restSec >= 0) return { seconds: slot.restSec, confidence: 'high' };
  if (Number.isFinite(exercise?.restSec) && (exercise?.restSec as number) >= 0) {
    return { seconds: exercise?.restSec as number, confidence: 'medium', assumption: 'Descanso obtido do default do exercício.' };
  }
  if (Number.isFinite(options.defaultRestSeconds) && (options.defaultRestSeconds as number) >= 0) {
    return { seconds: options.defaultRestSeconds as number, confidence: 'medium', assumption: 'Descanso obtido do default informado pelo perfil.' };
  }
  const fallback = options.goal !== undefined
    ? DURATION_RULES.restByGoal[resolveTrainingGoalContext(options.goal)]
    : DURATION_RULES.fallbackRestSeconds;
  return { seconds: fallback, confidence: 'low', assumption: `Descanso ausente; fallback de ${fallback} s.` };
}

function estimateLegacyDetailed(
  slots: readonly ExerciseSlot[],
  includeWarmup: boolean,
): DetailedWorkoutDurationEstimate {
  const warmupSeconds = includeWarmup ? DURATION_RULES.warmupSeconds : 0;
  const breakdownByExercise: ExerciseDurationEstimate[] = slots.map((slot, index) => {
    const series = Number.isFinite(slot?.series) ? Math.max(0, slot.series) : 0;
    const rest = Number.isFinite(slot?.restSec) ? Math.max(0, slot.restSec) : DURATION_RULES.fallbackRestSeconds;
    const workSeconds = series * DURATION_RULES.fallbackSetSeconds;
    const restSeconds = series * rest;
    const transitionSeconds = index < slots.length - 1 ? DURATION_RULES.legacyTransitionSeconds : 0;
    const totalSeconds = workSeconds + restSeconds + transitionSeconds;
    return {
      exerciseId: slot.exerciseId,
      exerciseIndex: index,
      series,
      repetitionTarget: null,
      workSeconds,
      restSeconds,
      transitionSeconds,
      setupSeconds: 0,
      totalSeconds,
      lowerBoundSeconds: totalSeconds,
      upperBoundSeconds: totalSeconds,
      equipmentIds: [],
      confidence: 'medium',
      assumptions: ['Modo de compatibilidade: 40 s por série, descanso após cada série e 60 s entre exercícios.'],
      warnings: [],
    };
  });
  const workSeconds = breakdownByExercise.reduce((sum, item) => sum + item.workSeconds, 0);
  const restSeconds = breakdownByExercise.reduce((sum, item) => sum + item.restSeconds, 0);
  const transitionSeconds = breakdownByExercise.reduce((sum, item) => sum + item.transitionSeconds, 0);
  const totalSeconds = workSeconds + restSeconds + transitionSeconds + warmupSeconds;
  const totalMinutes = Math.max(5, Math.round(totalSeconds / 60));
  return {
    totalMinutes,
    lowerBoundMinutes: totalMinutes,
    upperBoundMinutes: totalMinutes,
    workSeconds,
    restSeconds,
    transitionSeconds,
    setupSeconds: 0,
    warmupSeconds,
    totalSeries: breakdownByExercise.reduce((sum, item) => sum + item.series, 0),
    exerciseCount: slots.length,
    breakdownByExercise,
    assumptions: ['Cálculo legado preservado para os consumidores atuais.'],
    warnings: [],
    confidence: 'medium',
  };
}

export function estimateWorkoutDurationDetailed(
  slots: readonly ExerciseSlot[],
  allExercises: readonly Exercise[] = [],
  options: DetailedWorkoutDurationOptions = {},
): DetailedWorkoutDurationEstimate {
  if (!Array.isArray(slots) || slots.length === 0) return emptyDetailedEstimate();
  if (options.calculationMode === 'legacy') return estimateLegacyDetailed(slots, options.includeWarmup === true);

  const exerciseById = new Map(allExercises.map((exercise) => [exercise.id, exercise]));
  const equipmentContexts = slots.map((slot) => resolveEquipmentContext(exerciseById.get(slot.exerciseId)));
  const breakdownByExercise: ExerciseDurationEstimate[] = slots.map((slot, index) => {
    const exercise = exerciseById.get(slot.exerciseId);
    const equipment = equipmentContexts[index];
    const work = estimateWork(slot, exercise);
    const rest = restPerSet(slot, exercise, options);
    const series = Number.isFinite(slot?.series) ? Math.max(0, slot.series) : 0;
    const restSeconds = Math.max(0, series - 1) * rest.seconds;
    const setupSeconds = Number.isFinite(options.setupSecondsOverride)
      ? Math.max(0, options.setupSecondsOverride as number)
      : setupSecondsFor(equipment, exercise);
    const transitionSeconds = index >= slots.length - 1
      ? 0
      : Number.isFinite(options.transitionSecondsOverride)
        ? Math.max(0, options.transitionSecondsOverride as number)
        : transitionSecondsBetween(equipment, equipmentContexts[index + 1]);
    const totalSeconds = work.targetSeconds + restSeconds + setupSeconds + transitionSeconds;
    const lowerBoundSeconds = work.lowerSeconds
      + restSeconds * 0.9
      + (setupSeconds + transitionSeconds) * DURATION_RULES.lowerBoundFactor;
    const upperBoundSeconds = work.upperSeconds
      + restSeconds * 1.15
      + (setupSeconds + transitionSeconds) * DURATION_RULES.upperBoundFactor;
    return {
      exerciseId: slot.exerciseId,
      exerciseIndex: index,
      series,
      repetitionTarget: work.repetitionTarget,
      workSeconds: Math.round(work.targetSeconds),
      restSeconds: Math.round(restSeconds),
      transitionSeconds: Math.round(transitionSeconds),
      setupSeconds: Math.round(setupSeconds),
      totalSeconds: Math.round(totalSeconds),
      lowerBoundSeconds: Math.round(lowerBoundSeconds),
      upperBoundSeconds: Math.round(upperBoundSeconds),
      equipmentIds: equipment.equipmentIds,
      confidence: lowestConfidence(work.confidence, rest.confidence, equipment.confidence),
      assumptions: unique([...work.assumptions, ...(rest.assumption ? [rest.assumption] : [])]),
      warnings: unique([...work.warnings, ...equipment.warnings]),
    };
  });

  const warmupSeconds = options.includeWarmup ? DURATION_RULES.warmupSeconds : 0;
  const workSeconds = breakdownByExercise.reduce((sum, item) => sum + item.workSeconds, 0);
  const restSeconds = breakdownByExercise.reduce((sum, item) => sum + item.restSeconds, 0);
  const transitionSeconds = breakdownByExercise.reduce((sum, item) => sum + item.transitionSeconds, 0);
  const setupSeconds = breakdownByExercise.reduce((sum, item) => sum + item.setupSeconds, 0);
  const totalSeconds = workSeconds + restSeconds + transitionSeconds + setupSeconds + warmupSeconds;
  const lowerSeconds = breakdownByExercise.reduce((sum, item) => sum + item.lowerBoundSeconds, 0) + warmupSeconds;
  const upperSeconds = breakdownByExercise.reduce((sum, item) => sum + item.upperBoundSeconds, 0) + warmupSeconds;
  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
  const lowerBoundMinutes = Math.min(totalMinutes, Math.max(1, Math.floor(lowerSeconds / 60)));
  const upperBoundMinutes = Math.max(totalMinutes, Math.ceil(upperSeconds / 60));
  const confidence = breakdownByExercise.reduce<VolumeConfidence>(
    (current, item) => lowestConfidence(current, item.confidence),
    'high',
  );

  return {
    totalMinutes,
    lowerBoundMinutes,
    upperBoundMinutes,
    workSeconds,
    restSeconds,
    transitionSeconds,
    setupSeconds,
    warmupSeconds,
    totalSeries: breakdownByExercise.reduce((sum, item) => sum + item.series, 0),
    exerciseCount: slots.length,
    breakdownByExercise,
    assumptions: unique([
      'Descanso é contado somente entre séries; após a última série entra a transição, evitando dupla contagem.',
      'Cadência, setup e transições são intervalos operacionais para estimativa, não prescrição técnica.',
      ...(options.includeWarmup ? [`Aquecimento operacional de ${warmupSeconds / 60} min incluído.`] : []),
      ...breakdownByExercise.flatMap((item) => item.assumptions),
    ]),
    warnings: unique([
      'A duração pode variar conforme lotação, disponibilidade e preparação dos aparelhos.',
      ...breakdownByExercise.flatMap((item) => item.warnings),
    ]),
    confidence,
  };
}

/** Wrapper legado: mantém exatamente a fórmula e o shape usados antes do GOAL-22. */
export function estimateWorkoutDuration(
  slots: ExerciseSlot[],
  options?: { includeWarmup?: boolean },
): WorkoutDurationEstimate {
  if (!slots || slots.length === 0) return { minutes: 0, totalSeries: 0, exerciseCount: 0 };
  const detailed = estimateWorkoutDurationDetailed(slots, [], {
    includeWarmup: options?.includeWarmup,
    calculationMode: 'legacy',
  });
  return {
    minutes: detailed.totalMinutes,
    totalSeries: detailed.totalSeries,
    exerciseCount: detailed.exerciseCount,
  };
}

// Grupos musculares reais envolvidos nos slots — sempre derivado dos exercícios.
export function muscleGroupsForSlots(slots: ExerciseSlot[], allExercises: Exercise[]): Exercise['muscleGroup'][] {
  return Array.from(
    new Set(
      slots
        .map((slot) => allExercises.find((exercise) => exercise.id === slot.exerciseId)?.muscleGroup)
        .filter((muscleGroup): muscleGroup is Exercise['muscleGroup'] => Boolean(muscleGroup)),
    ),
  );
}

// Aviso honesto: o app nunca corta exercícios sozinho, apenas informa o tempo.
/**
 * @deprecated Compatibilidade textual legada. Use `analyzeWorkoutTimeFit` para novas telas.
 */
export function buildDurationWarning(estimatedMinutes: number, targetMinutes: number | null | undefined): string | null {
  if (
    typeof targetMinutes !== 'number'
    || !Number.isFinite(targetMinutes)
    || targetMinutes <= 0
    || typeof estimatedMinutes !== 'number'
    || !Number.isFinite(estimatedMinutes)
    || estimatedMinutes <= 0
  ) return null;
  const analysis = analyzeWorkoutTimeFit({ targetMinutes, estimatedMinutes, exerciseCount: 1 });
  if (!analysis.legacyOverExactTarget) return null;
  return `Este treino pode passar de ${targetMinutes} min (estimativa: ${estimatedMinutes} min). Reduza séries ou escolha o modo Alto Volume.`;
}
