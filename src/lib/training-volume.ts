import type {
  Exercise,
  ExerciseSlot,
} from '../types';
import type {
  TrainingBreakDuration,
  TrainingContinuityStatus,
  TrainingExperienceLevel,
} from '../types/training-profile';
import type {
  MuscleGroupId,
} from '../types/training-taxonomy';
import type {
  MuscleGroupVolumeResult,
  PlannedVolumeAnalysis,
  SessionCapacityEstimate,
  SetVolumeReference,
  TrainingGoalContext,
  TrainingVolumeLevel,
  VolumeConfidence,
  WeeklyVolumeGuideline,
} from '../types/training-volume';
import {
  MUSCLE_VOLUME_CLASS,
  RETURN_CAPACITY_REST_BUFFER_SECONDS,
  RETURN_REFERENCE_MODIFIERS,
  SECONDARY_EXPOSURE_WEIGHT,
  SESSION_CAPACITY_RULES,
  WEEKLY_VOLUME_REFERENCES,
  lowestConfidence,
} from './training-volume-rules';
import {
  getMuscleGroupDefinition,
  normalizeTaxonomyText,
  resolveLegacyMuscleGroup,
} from './training-taxonomy';

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function roundReference(reference: SetVolumeReference, factor: number): SetVolumeReference {
  const minimum = Math.max(1, Math.round(reference.minimum * factor));
  const target = Math.max(minimum, Math.round(reference.target * factor));
  return {
    minimum,
    target,
    upperReference: Math.max(target, Math.round(reference.upperReference * factor)),
  };
}

export interface WeeklyVolumeGuidelineInput {
  muscleGroupId: MuscleGroupId;
  experienceLevel: TrainingExperienceLevel;
  trainingStatus?: TrainingContinuityStatus;
  breakDuration?: TrainingBreakDuration;
  goal?: unknown;
}

export function resolveTrainingGoalContext(goal: unknown): TrainingGoalContext {
  const normalized = normalizeTaxonomyText(typeof goal === 'string' ? goal : '');
  if (normalized.includes('hipertrof') || normalized === 'hypertrophy') return 'hypertrophy';
  if (normalized.includes('forca') || normalized === 'strength') return 'strength';
  if (
    normalized.includes('condicion')
    || normalized.includes('resistencia')
    || normalized.includes('emagrec')
    || normalized === 'conditioning'
    || normalized === 'slimming'
  ) return 'conditioning';
  if (normalized.includes('mobilidade') || normalized === 'mobility') return 'mobility';
  if (normalized.includes('retorno') || normalized === 'return') return 'return';
  if (normalized.includes('atleta') || normalized.includes('performance') || normalized === 'athlete') return 'performance';
  return 'general';
}

export function getWeeklyVolumeGuideline(input: WeeklyVolumeGuidelineInput): WeeklyVolumeGuideline {
  const trainingStatus = input.trainingStatus ?? 'active';
  const volumeClass = MUSCLE_VOLUME_CLASS[input.muscleGroupId];
  const reasons: string[] = [];
  let confidence: VolumeConfidence = input.trainingStatus ? 'high' : 'medium';

  if (volumeClass === 'conditioning' || volumeClass === 'mobility') {
    reasons.push(
      volumeClass === 'conditioning'
        ? 'Cardio é avaliado por tempo e densidade, não pela mesma faixa de séries musculares.'
        : 'Mobilidade é avaliada por tempo e objetivo da sessão, não pela mesma faixa de séries musculares.',
    );
    return {
      muscleGroupId: input.muscleGroupId,
      experienceLevel: input.experienceLevel,
      trainingStatus,
      reference: null,
      reasons,
      confidence: lowestConfidence(confidence, 'medium'),
    };
  }

  const base = WEEKLY_VOLUME_REFERENCES[input.experienceLevel][volumeClass];
  let reference = { ...base };
  reasons.push(`Faixa inicial de produto para grupo ${volumeClass === 'large' ? 'grande' : volumeClass === 'small' ? 'pequeno' : volumeClass}.`);

  if (input.experienceLevel === 'athlete') {
    reasons.push('Atleta não recebe volume extremo automaticamente; a referência inicial acompanha o nível avançado.');
  }

  if (trainingStatus === 'returning') {
    const modifier = input.breakDuration
      ? RETURN_REFERENCE_MODIFIERS[input.breakDuration]
      : RETURN_REFERENCE_MODIFIERS.three_to_six_months;
    reference = roundReference(reference, modifier);
    reasons.push('Seu nível foi preservado, mas a referência inicial considera o retorno após uma pausa.');
    reasons.push('A faixa poderá ser reavaliada progressivamente em etapas futuras, com registros e confirmação do usuário.');
    if (!input.breakDuration) {
      confidence = 'low';
      reasons.push('A duração da pausa não foi informada; foi usada uma heurística conservadora intermediária.');
    } else {
      confidence = lowestConfidence(confidence, 'medium');
      reasons.push('O modificador de retorno é uma heurística de produto, não uma medida de perda de capacidade.');
    }
  }

  const goalContext = resolveTrainingGoalContext(input.goal);
  if (goalContext === 'strength') reasons.push('O objetivo de força pode exigir descansos maiores; a faixa não altera o treino existente.');
  if (goalContext === 'conditioning') {
    reasons.push('O objetivo prioriza também densidade e duração; a faixa muscular continua apenas como referência.');
  }
  if (goalContext === 'mobility') reasons.push('Mobilidade prioriza tempo e qualidade do bloco, não aumento automático de séries.');
  if (goalContext === 'return') reasons.push('O objetivo de retorno reforça a leitura conservadora sem alterar o plano.');

  return {
    muscleGroupId: input.muscleGroupId,
    experienceLevel: input.experienceLevel,
    trainingStatus,
    reference,
    reasons,
    confidence,
  };
}

interface GroupAccumulator {
  directSets: number;
  secondaryExposure: number;
  confidence: VolumeConfidence;
  warnings: string[];
}

export interface PlannedMuscleVolumeInput {
  slots: readonly (ExerciseSlot & { isWarmup?: boolean })[];
  exercises: readonly Exercise[];
  weeklyOccurrences?: number;
  secondaryExposureWeight?: number;
}

function ensureGroup(
  groups: Map<MuscleGroupId, GroupAccumulator>,
  muscleGroupId: MuscleGroupId,
): GroupAccumulator {
  const current = groups.get(muscleGroupId);
  if (current) return current;
  const created: GroupAccumulator = { directSets: 0, secondaryExposure: 0, confidence: 'high', warnings: [] };
  groups.set(muscleGroupId, created);
  return created;
}

function canonicalMuscleGroup(value: unknown): MuscleGroupId | undefined {
  return typeof value === 'string' && getMuscleGroupDefinition(value as MuscleGroupId)
    ? value as MuscleGroupId
    : undefined;
}

export function calculatePlannedMuscleVolume(input: PlannedMuscleVolumeInput): PlannedVolumeAnalysis {
  const slots = Array.isArray(input.slots) ? input.slots : [];
  const exercises = Array.isArray(input.exercises) ? input.exercises : [];
  const weeklyOccurrences = Number.isFinite(input.weeklyOccurrences) && (input.weeklyOccurrences as number) > 0
    ? input.weeklyOccurrences as number
    : 1;
  const secondaryExposureWeight = Number.isFinite(input.secondaryExposureWeight)
    && (input.secondaryExposureWeight as number) >= 0
    ? input.secondaryExposureWeight as number
    : SECONDARY_EXPOSURE_WEIGHT;
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const groups = new Map<MuscleGroupId, GroupAccumulator>();
  const warnings: string[] = [];
  let unclassifiedSets = 0;
  let totalWorkingSets = 0;
  let warmupSets = 0;

  for (const slot of slots) {
    const series = Number.isFinite(slot?.series) ? Math.max(0, slot.series) * weeklyOccurrences : 0;
    if (series === 0) continue;
    const exercise = exerciseById.get(slot.exerciseId);
    if (slot.isWarmup === true || exercise?.type === 'warmup') {
      warmupSets += series;
      continue;
    }
    totalWorkingSets += series;
    if (!exercise) {
      unclassifiedSets += series;
      warnings.push(`Exercício ${slot.exerciseId} não foi encontrado; ${series} série(s) ficaram sem classificação muscular.`);
      continue;
    }

    const canonicalPrimary = canonicalMuscleGroup(exercise.primaryMuscleGroupId);
    const legacyPrimary = canonicalPrimary ? undefined : resolveLegacyMuscleGroup(exercise.muscleGroup);
    const primary = canonicalPrimary ?? legacyPrimary?.id;
    if (!primary) {
      unclassifiedSets += series;
      warnings.push(`O grupo primário de ${exercise.name} não pôde ser resolvido.`);
      continue;
    }

    const primaryAccumulator = ensureGroup(groups, primary);
    primaryAccumulator.directSets += series;
    if (!canonicalPrimary) {
      primaryAccumulator.confidence = lowestConfidence(primaryAccumulator.confidence, 'medium');
      primaryAccumulator.warnings.push('A contagem direta usa o grupo muscular legado do exercício.');
    }

    const secondaryIds = new Set<MuscleGroupId>();
    let secondaryUsedLegacy = false;
    if (Array.isArray(exercise.secondaryMuscleGroupIds) && exercise.secondaryMuscleGroupIds.length > 0) {
      for (const candidate of exercise.secondaryMuscleGroupIds) {
        const resolved = canonicalMuscleGroup(candidate);
        if (resolved && resolved !== primary) secondaryIds.add(resolved);
      }
    } else if (Array.isArray(exercise.secondaryMuscles)) {
      secondaryUsedLegacy = exercise.secondaryMuscles.length > 0;
      for (const candidate of exercise.secondaryMuscles) {
        const resolved = resolveLegacyMuscleGroup(candidate)?.id;
        if (resolved && resolved !== primary) secondaryIds.add(resolved);
        else if (!resolved) warnings.push(`Sinergista legado “${candidate}” de ${exercise.name} não foi resolvido.`);
      }
    }

    for (const secondaryId of secondaryIds) {
      const secondaryAccumulator = ensureGroup(groups, secondaryId);
      secondaryAccumulator.secondaryExposure += series * secondaryExposureWeight;
      if (secondaryUsedLegacy) {
        secondaryAccumulator.confidence = lowestConfidence(secondaryAccumulator.confidence, 'medium');
        secondaryAccumulator.warnings.push('A exposição secundária usa classificação legada.');
      }
    }
  }

  const muscleVolume: MuscleGroupVolumeResult[] = [...groups.entries()]
    .map(([muscleGroupId, accumulator]) => ({
      muscleGroupId,
      directSets: accumulator.directSets,
      secondaryExposure: accumulator.secondaryExposure,
      weightedSets: accumulator.directSets + accumulator.secondaryExposure,
      confidence: accumulator.confidence,
      warnings: unique(accumulator.warnings),
    }))
    .sort((left, right) => (
      (getMuscleGroupDefinition(left.muscleGroupId)?.order ?? 999)
      - (getMuscleGroupDefinition(right.muscleGroupId)?.order ?? 999)
    ));

  const confidence = unclassifiedSets > 0
    ? 'low'
    : muscleVolume.reduce<VolumeConfidence>(
      (current, result) => lowestConfidence(current, result.confidence),
      'high',
    );

  return {
    muscleVolume,
    totalWorkingSets,
    warmupSets,
    unclassifiedSets,
    weeklyOccurrences,
    secondaryExposureWeight,
    confidence,
    warnings: unique(warnings),
    assumptions: [
      `Exposição secundária ponderada por ${secondaryExposureWeight}; séries diretas permanecem separadas.`,
      weeklyOccurrences === 1
        ? 'O plano informado foi contado uma vez por semana.'
        : `O plano informado foi contado ${weeklyOccurrences} vezes por semana.`,
      'Séries não classificadas não são atribuídas a um grupo inventado.',
      'Séries marcadas como aquecimento permanecem separadas das séries de trabalho.',
    ],
  };
}

export function classifyVolumeAgainstReference(
  weightedSets: number,
  reference: SetVolumeReference,
): TrainingVolumeLevel {
  if (weightedSets < reference.minimum) return 'low';
  if (weightedSets <= reference.target) return 'moderate';
  if (weightedSets <= reference.upperReference) return 'high';
  return 'very_high';
}

export interface SessionCapacityInput {
  availableMinutes: number;
  experienceLevel: TrainingExperienceLevel;
  trainingStatus?: TrainingContinuityStatus;
  breakDuration?: TrainingBreakDuration;
  goal?: unknown;
  averageRestSeconds?: number;
  averageSetDurationSeconds?: number;
  averageTransitionSeconds?: number;
}

function capacityRange(target: number) {
  return {
    minimum: Math.max(0, Math.floor(target * SESSION_CAPACITY_RULES.minimumFactor)),
    target,
    maximumReference: Math.max(target, Math.ceil(target * SESSION_CAPACITY_RULES.maximumFactor)),
  };
}

export function estimateSessionCapacity(input: SessionCapacityInput): SessionCapacityEstimate {
  const warnings = ['Esta capacidade é uma estimativa e pode variar com lotação, preparação dos aparelhos e ritmo da sessão.'];
  const assumptions: string[] = [];
  const availableMinutes = Number.isFinite(input.availableMinutes) && input.availableMinutes > 0
    ? input.availableMinutes
    : 0;
  if (availableMinutes === 0) {
    return {
      availableMinutes: 0,
      estimatedWorkingSetCapacity: capacityRange(0),
      estimatedExerciseCapacity: capacityRange(0),
      assumptions: ['Tempo disponível ausente ou inválido.'],
      warnings,
      confidence: 'low',
    };
  }

  const restProvided = Number.isFinite(input.averageRestSeconds) && (input.averageRestSeconds as number) >= 0;
  const setDurationProvided = Number.isFinite(input.averageSetDurationSeconds) && (input.averageSetDurationSeconds as number) > 0;
  const transitionProvided = Number.isFinite(input.averageTransitionSeconds) && (input.averageTransitionSeconds as number) >= 0;
  const experienceRest = SESSION_CAPACITY_RULES.restByExperience[input.experienceLevel];
  const goalContext = resolveTrainingGoalContext(input.goal);
  const goalRest = input.goal === undefined ? experienceRest : (
    goalContext === 'performance'
      ? Math.max(experienceRest, 105)
      : goalContext === 'general' || goalContext === 'return'
        ? experienceRest
        : goalContext === 'hypertrophy'
          ? Math.max(experienceRest, 90)
          : goalContext === 'strength'
            ? 150
            : 60
  );
  let averageRestSeconds = restProvided ? input.averageRestSeconds as number : goalRest;
  const averageSetDurationSeconds = setDurationProvided
    ? input.averageSetDurationSeconds as number
    : SESSION_CAPACITY_RULES.defaultSetDurationSeconds;
  const averageTransitionSeconds = transitionProvided
    ? input.averageTransitionSeconds as number
    : SESSION_CAPACITY_RULES.defaultTransitionSeconds;
  let confidence: VolumeConfidence = restProvided && setDurationProvided && transitionProvided ? 'high' : 'medium';

  if (!restProvided) assumptions.push(`Descanso médio estimado em ${averageRestSeconds} s a partir do perfil/objetivo.`);
  if (!setDurationProvided) assumptions.push(`Duração média de série estimada em ${averageSetDurationSeconds} s.`);
  if (!transitionProvided) assumptions.push(`Transição média estimada em ${averageTransitionSeconds} s.`);

  if ((input.trainingStatus ?? 'active') === 'returning') {
    const restBuffer = input.breakDuration
      ? RETURN_CAPACITY_REST_BUFFER_SECONDS[input.breakDuration]
      : RETURN_CAPACITY_REST_BUFFER_SECONDS.three_to_six_months;
    averageRestSeconds += restBuffer;
    assumptions.push('O nível foi preservado; a capacidade de referência reserva mais tempo entre blocos durante o retorno.');
    if (!input.breakDuration) {
      confidence = 'low';
      warnings.push('A duração da pausa não foi informada; a referência de retorno usa um buffer conservador intermediário.');
    }
  }

  const transitionShare = Math.min(0.3, Math.max(0.12, averageTransitionSeconds / 400));
  const nonWorkingShare = Math.max(SESSION_CAPACITY_RULES.nonWorkingTimeShare, transitionShare);
  const usableSeconds = Math.max(
    0,
    (availableMinutes * 60 - SESSION_CAPACITY_RULES.warmupSeconds) * (1 - nonWorkingShare),
  );
  const averageRestPerSet = averageRestSeconds * ((SESSION_CAPACITY_RULES.setsPerExercise - 1) / SESSION_CAPACITY_RULES.setsPerExercise);
  const targetWorkingSets = Math.max(0, Math.floor(usableSeconds / (averageSetDurationSeconds + averageRestPerSet)));
  const targetExercises = Math.max(0, Math.floor(targetWorkingSets / SESSION_CAPACITY_RULES.setsPerExercise));

  assumptions.push(`${SESSION_CAPACITY_RULES.warmupSeconds / 60} min reservados para aquecimento operacional.`);
  assumptions.push(`${Math.round(nonWorkingShare * 100)}% do tempo restante reservado para setup e transições.`);
  assumptions.push('A faixa informa o que pode caber no tempo; não escolhe exercícios nem altera séries.');

  return {
    availableMinutes,
    estimatedWorkingSetCapacity: capacityRange(targetWorkingSets),
    estimatedExerciseCapacity: capacityRange(targetExercises),
    assumptions,
    warnings,
    confidence,
  };
}
