import type { VolumeProfile } from '../types';
import { WORKOUT_TIME_FIT_RULES } from './training-volume-rules';
import {
  defaultTargetMinutes,
  getVolumeProfile,
  VOLUME_PROFILES,
  type VolumeProfileConfig,
} from './volumeProfiles';

export type VolumeProfileRecommendationReason =
  | 'inside-profile-range'
  | 'nearest-profile-range'
  | 'below-all-ranges'
  | 'above-all-ranges'
  | 'fallback-invalid';

export interface RecommendedVolumeProfileResult {
  targetMinutes: number;
  profile: VolumeProfile;
  profileRange: {
    minimumMinutes: number;
    maximumMinutes: number;
  };
  reason: VolumeProfileRecommendationReason;
  assumptions: string[];
}

export type VolumeProfileFitStatus =
  | 'aligned'
  | 'near-range'
  | 'below-profile-range'
  | 'above-profile-range';

export interface VolumeProfileFitAnalysis {
  targetMinutes: number;
  selectedProfile: VolumeProfile;
  recommendedProfile: VolumeProfile;
  selectedRange: {
    minimumMinutes: number;
    maximumMinutes: number;
  };
  status: VolumeProfileFitStatus;
  divergent: boolean;
  distanceToSelectedRange: number;
  message: string | null;
  assumptions: string[];
}

export interface RecommendedExerciseRange {
  targetMinutes: number;
  profile: VolumeProfile;
  minimumExercises: number;
  maximumExercises: number;
  reason:
    | 'profile-reference'
    | 'below-compact-adjustment'
    | 'above-high-adjustment';
  assumptions: string[];
}

export type WorkoutTimeFitStatus =
  | 'empty'
  | 'under-target'
  | 'within-target'
  | 'over-target';

export interface WorkoutTimeFitInput {
  targetMinutes: number | null | undefined;
  estimatedMinutes: number | null | undefined;
  exerciseCount: number | null | undefined;
}

export interface WorkoutTimeFitAnalysis {
  targetMinutes: number;
  operationalRange: {
    minimumMinutes: number;
    maximumMinutes: number;
  };
  estimatedMinutes: number;
  exerciseCount: number;
  recommendedExerciseRange: RecommendedExerciseRange;
  status: WorkoutTimeFitStatus;
  differenceMinutes: number | null;
  absoluteDifferenceMinutes: number | null;
  direction: 'empty' | 'below' | 'within' | 'above';
  message: string | null;
  suggestion: string | null;
  legacyOverExactTarget: boolean;
  assumptions: string[];
}

const distanceToProfileRange = (targetMinutes: number, profile: VolumeProfileConfig): number => {
  if (targetMinutes < profile.minMinutes) return profile.minMinutes - targetMinutes;
  if (targetMinutes > profile.maxMinutes) return targetMinutes - profile.maxMinutes;
  return 0;
};

const profileRange = (profile: VolumeProfileConfig) => ({
  minimumMinutes: profile.minMinutes,
  maximumMinutes: profile.maxMinutes,
});

const sortedProfiles = (): VolumeProfileConfig[] => [...VOLUME_PROFILES]
  .sort((left, right) => left.minMinutes - right.minMinutes);

const normalizeTargetMinutes = (
  value: number | null | undefined,
): { targetMinutes: number; invalid: boolean; assumption: string } => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    const fallback = defaultTargetMinutes('standard');
    return {
      targetMinutes: fallback,
      invalid: true,
      assumption: `Tempo inválido; foi usado o padrão de ${fallback} min do perfil Padrão.`,
    };
  }

  const rounded = Math.round(value);
  const targetMinutes = Math.min(
    WORKOUT_TIME_FIT_RULES.maximumTargetMinutes,
    Math.max(WORKOUT_TIME_FIT_RULES.minimumTargetMinutes, rounded),
  );
  const assumption = targetMinutes === value
    ? `Tempo de ${targetMinutes} min usado como restrição canônica do dia.`
    : `Tempo normalizado de ${value} para ${targetMinutes} min por arredondamento e limites operacionais.`;
  return { targetMinutes, invalid: false, assumption };
};

export function resolveRecommendedVolumeProfile(
  targetMinutes: number | null | undefined,
): RecommendedVolumeProfileResult {
  const normalized = normalizeTargetMinutes(targetMinutes);
  const profiles = sortedProfiles();
  const first = profiles[0] ?? getVolumeProfile('standard');
  const last = profiles[profiles.length - 1] ?? first;
  const recommended = profiles.reduce<VolumeProfileConfig>((best, candidate) => {
    const candidateDistance = distanceToProfileRange(normalized.targetMinutes, candidate);
    const bestDistance = distanceToProfileRange(normalized.targetMinutes, best);
    if (candidateDistance < bestDistance) return candidate;
    if (candidateDistance === bestDistance && candidate.minMinutes < best.minMinutes) return candidate;
    return best;
  }, first);

  let reason: VolumeProfileRecommendationReason;
  if (normalized.invalid) reason = 'fallback-invalid';
  else if (normalized.targetMinutes < first.minMinutes) reason = 'below-all-ranges';
  else if (normalized.targetMinutes > last.maxMinutes) reason = 'above-all-ranges';
  else if (distanceToProfileRange(normalized.targetMinutes, recommended) === 0) reason = 'inside-profile-range';
  else reason = 'nearest-profile-range';

  return {
    targetMinutes: normalized.targetMinutes,
    profile: recommended.id,
    profileRange: profileRange(recommended),
    reason,
    assumptions: [
      normalized.assumption,
      `O perfil ${recommended.label} foi recomendado pela menor distância até as faixas cadastradas.`,
    ],
  };
}

export function analyzeVolumeProfileFit(
  targetMinutes: number | null | undefined,
  selectedProfile: VolumeProfile,
): VolumeProfileFitAnalysis {
  const recommendation = resolveRecommendedVolumeProfile(targetMinutes);
  const selected = getVolumeProfile(selectedProfile);
  const distanceToSelectedRange = distanceToProfileRange(recommendation.targetMinutes, selected);
  const insideSelectedRange = distanceToSelectedRange === 0;
  const divergent = selectedProfile !== recommendation.profile;
  const status: VolumeProfileFitStatus = insideSelectedRange
    ? 'aligned'
    : !divergent
      ? 'near-range'
      : recommendation.targetMinutes < selected.minMinutes
        ? 'below-profile-range'
        : 'above-profile-range';
  const recommended = getVolumeProfile(recommendation.profile);

  return {
    targetMinutes: recommendation.targetMinutes,
    selectedProfile,
    recommendedProfile: recommendation.profile,
    selectedRange: profileRange(selected),
    status,
    divergent,
    distanceToSelectedRange,
    message: divergent
      ? `O perfil ${selected.label} normalmente trabalha entre ${selected.minMinutes}–${selected.maxMinutes} min. O tempo disponível informado é ${recommendation.targetMinutes} min. Recomendado para este tempo: ${recommended.label}.`
      : null,
    assumptions: [
      ...recommendation.assumptions,
      insideSelectedRange
        ? `O tempo está dentro da faixa formal do perfil ${selected.label}.`
        : `A distância até a faixa do perfil ${selected.label} é de ${distanceToSelectedRange} min.`,
    ],
  };
}

export function estimateRecommendedExerciseRange(
  targetMinutes: number | null | undefined,
): RecommendedExerciseRange {
  const recommendation = resolveRecommendedVolumeProfile(targetMinutes);
  const profiles = sortedProfiles();
  const compact = profiles[0] ?? getVolumeProfile('compact');
  const high = profiles[profiles.length - 1] ?? getVolumeProfile('high');
  const base = getVolumeProfile(recommendation.profile);
  let minimumExercises = base.minExercises;
  let maximumExercises = base.maxExercises;
  let reason: RecommendedExerciseRange['reason'] = 'profile-reference';
  let adjustmentAssumption = `Foi usada a faixa de exercícios cadastrada para ${base.label}.`;

  if (recommendation.targetMinutes < compact.minMinutes) {
    const steps = Math.ceil(
      (compact.minMinutes - recommendation.targetMinutes)
      / WORKOUT_TIME_FIT_RULES.belowCompactAdjustmentStepMinutes,
    );
    minimumExercises = Math.max(
      WORKOUT_TIME_FIT_RULES.minimumRecommendedExercises,
      compact.minExercises - steps,
    );
    maximumExercises = Math.max(minimumExercises, compact.maxExercises - steps);
    reason = 'below-compact-adjustment';
    adjustmentAssumption = `A faixa Compacto foi reduzida em ${steps} passo(s) de ${WORKOUT_TIME_FIT_RULES.belowCompactAdjustmentStepMinutes} min.`;
  } else if (recommendation.targetMinutes > high.maxMinutes) {
    const steps = Math.ceil(
      (recommendation.targetMinutes - high.maxMinutes)
      / WORKOUT_TIME_FIT_RULES.aboveHighAdjustmentStepMinutes,
    );
    minimumExercises = Math.min(
      WORKOUT_TIME_FIT_RULES.maximumRecommendedExercises,
      high.minExercises + steps,
    );
    maximumExercises = Math.min(
      WORKOUT_TIME_FIT_RULES.maximumRecommendedExercises,
      high.maxExercises + steps,
    );
    minimumExercises = Math.min(minimumExercises, maximumExercises);
    reason = 'above-high-adjustment';
    adjustmentAssumption = `A faixa Alto Volume foi ampliada em ${steps} passo(s) de ${WORKOUT_TIME_FIT_RULES.aboveHighAdjustmentStepMinutes} min, com teto global.`;
  }

  return {
    targetMinutes: recommendation.targetMinutes,
    profile: recommendation.profile,
    minimumExercises,
    maximumExercises,
    reason,
    assumptions: [...recommendation.assumptions, adjustmentAssumption],
  };
}

export function analyzeWorkoutTimeFit(
  input: WorkoutTimeFitInput,
): WorkoutTimeFitAnalysis {
  const recommendation = resolveRecommendedVolumeProfile(input.targetMinutes);
  const recommendedExerciseRange = estimateRecommendedExerciseRange(input.targetMinutes);
  const estimatedMinutes = typeof input.estimatedMinutes === 'number' && Number.isFinite(input.estimatedMinutes)
    ? Math.max(0, Math.round(input.estimatedMinutes))
    : 0;
  const exerciseCount = typeof input.exerciseCount === 'number' && Number.isFinite(input.exerciseCount)
    ? Math.max(0, Math.floor(input.exerciseCount))
    : 0;
  const operationalRange = {
    minimumMinutes: Math.max(
      WORKOUT_TIME_FIT_RULES.minimumTargetMinutes,
      recommendation.targetMinutes - WORKOUT_TIME_FIT_RULES.operationalToleranceMinutes,
    ),
    maximumMinutes: Math.min(
      WORKOUT_TIME_FIT_RULES.maximumTargetMinutes,
      recommendation.targetMinutes + WORKOUT_TIME_FIT_RULES.operationalToleranceMinutes,
    ),
  };
  const legacyOverExactTarget = typeof input.targetMinutes === 'number'
    && Number.isFinite(input.targetMinutes)
    && input.targetMinutes > 0
    && typeof input.estimatedMinutes === 'number'
    && Number.isFinite(input.estimatedMinutes)
    && input.estimatedMinutes > input.targetMinutes;
  const assumptions = [
    ...recommendation.assumptions,
    ...recommendedExerciseRange.assumptions,
    `A faixa operacional usa tolerância de ±${WORKOUT_TIME_FIT_RULES.operationalToleranceMinutes} min, limitada a 10–240 min.`,
    `Estimativa normalizada para ${estimatedMinutes} min e contagem para ${exerciseCount} exercício(s).`,
  ];

  if (exerciseCount === 0 || estimatedMinutes === 0) {
    return {
      targetMinutes: recommendation.targetMinutes,
      operationalRange,
      estimatedMinutes,
      exerciseCount,
      recommendedExerciseRange,
      status: 'empty',
      differenceMinutes: null,
      absoluteDifferenceMinutes: null,
      direction: 'empty',
      message: null,
      suggestion: 'Adicione exercícios para comparar o treino com o tempo disponível.',
      legacyOverExactTarget,
      assumptions,
    };
  }

  const differenceMinutes = estimatedMinutes - recommendation.targetMinutes;
  const absoluteDifferenceMinutes = Math.abs(differenceMinutes);

  if (estimatedMinutes < operationalRange.minimumMinutes) {
    const suggestion = exerciseCount < recommendedExerciseRange.minimumExercises
      ? `Adicione de ${Math.max(1, recommendedExerciseRange.minimumExercises - exerciseCount)} a ${Math.max(1, recommendedExerciseRange.maximumExercises - exerciseCount)} exercícios ou ajuste séries e descansos.`
      : 'Revise séries, descansos e configuração dos exercícios para aproximar o treino do tempo disponível.';
    return {
      targetMinutes: recommendation.targetMinutes,
      operationalRange,
      estimatedMinutes,
      exerciseCount,
      recommendedExerciseRange,
      status: 'under-target',
      differenceMinutes,
      absoluteDifferenceMinutes,
      direction: 'below',
      message: `Estimativa atual: ${estimatedMinutes} min — aproximadamente ${absoluteDifferenceMinutes} min abaixo do tempo disponível.`,
      suggestion,
      legacyOverExactTarget,
      assumptions,
    };
  }

  if (estimatedMinutes > operationalRange.maximumMinutes) {
    const suggestion = exerciseCount > recommendedExerciseRange.maximumExercises
      ? `Reduza de ${exerciseCount - recommendedExerciseRange.maximumExercises} a ${exerciseCount - recommendedExerciseRange.minimumExercises} exercícios ou ajuste séries e descansos.`
      : 'Reduza séries, descansos ou exercícios para aproximar o treino do tempo disponível.';
    return {
      targetMinutes: recommendation.targetMinutes,
      operationalRange,
      estimatedMinutes,
      exerciseCount,
      recommendedExerciseRange,
      status: 'over-target',
      differenceMinutes,
      absoluteDifferenceMinutes,
      direction: 'above',
      message: `Estimativa atual: ${estimatedMinutes} min — aproximadamente ${absoluteDifferenceMinutes} min acima do tempo disponível.`,
      suggestion,
      legacyOverExactTarget,
      assumptions,
    };
  }

  return {
    targetMinutes: recommendation.targetMinutes,
    operationalRange,
    estimatedMinutes,
    exerciseCount,
    recommendedExerciseRange,
    status: 'within-target',
    differenceMinutes,
    absoluteDifferenceMinutes,
    direction: 'within',
    message: `A estimativa atual está dentro da faixa operacional de ${operationalRange.minimumMinutes}–${operationalRange.maximumMinutes} min.`,
    suggestion: null,
    legacyOverExactTarget,
    assumptions,
  };
}
