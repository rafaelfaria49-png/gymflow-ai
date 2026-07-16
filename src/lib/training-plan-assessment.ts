import type {
  Exercise,
  ExerciseSlot,
} from '../types';
import type {
  TrainingProfileSource,
} from '../types/training-profile';
import type {
  PlanAssessmentStatus,
  TrainingPlanAssessment,
  TrainingPlanSuggestion,
  TrainingPlanWarning,
  VolumeConfidence,
  WeeklyVolumeGuideline,
} from '../types/training-volume';
import {
  estimateWorkoutDurationDetailed,
  type DetailedWorkoutDurationOptions,
} from './workoutDuration';
import {
  calculatePlannedMuscleVolume,
  classifyVolumeAgainstReference,
  getWeeklyVolumeGuideline,
} from './training-volume';
import { lowestConfidence } from './training-volume-rules';

export interface TrainingPlanAssessmentInput {
  slots: readonly ExerciseSlot[];
  exercises: readonly Exercise[];
  profile: TrainingProfileSource;
  availableMinutes?: number;
  weeklyOccurrences?: number;
  durationOptions?: Omit<DetailedWorkoutDurationOptions, 'calculationMode'>;
}

function uniqueByCode<T extends { code: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.code}:${'muscleGroupId' in item ? String(item.muscleGroupId ?? '') : ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function timeSuggestions(status: PlanAssessmentStatus): TrainingPlanSuggestion[] {
  if (status !== 'exceeds_time' && status !== 'tight') return [];
  return [
    { code: 'review-accessory-sets', message: 'Considerar reduzir uma série em exercícios acessórios.' },
    { code: 'fewer-exercises', message: 'Considerar usar menos exercícios nesta sessão.' },
    { code: 'compact-profile', message: 'Considerar uma organização mais compacta.' },
    { code: 'increase-time', message: 'Aumentar o tempo disponível, se isso fizer sentido para sua rotina.' },
    { code: 'accept-longer-session', message: 'Manter como está e aceitar uma duração possivelmente maior.' },
  ];
}

export function assessTrainingPlanAgainstProfile(input: TrainingPlanAssessmentInput): TrainingPlanAssessment {
  const slots = Array.isArray(input.slots) ? input.slots : [];
  const exercises = Array.isArray(input.exercises) ? input.exercises : [];
  const profileMinutes = Number.isFinite(input.profile.duration) && input.profile.duration > 0 ? input.profile.duration : 0;
  const profileFrequency = Number.isFinite(input.profile.frequency) && input.profile.frequency > 0 ? input.profile.frequency : 0;
  const availableMinutes = Number.isFinite(input.availableMinutes) && (input.availableMinutes as number) > 0
    ? input.availableMinutes as number
    : profileMinutes;
  const durationEstimate = estimateWorkoutDurationDetailed(slots, exercises, {
    ...input.durationOptions,
    goal: input.durationOptions?.goal ?? input.profile.goal,
    calculationMode: 'detailed',
  });
  const volumeAnalysis = calculatePlannedMuscleVolume({
    slots,
    exercises,
    weeklyOccurrences: input.weeklyOccurrences,
  });
  const warnings: TrainingPlanWarning[] = [];
  const suggestions: TrainingPlanSuggestion[] = [];
  const reasons: string[] = [
    `Duração central estimada em ${durationEstimate.totalMinutes} min para ${availableMinutes} min disponíveis.`,
    `Foram analisadas ${volumeAnalysis.totalWorkingSets} séries de trabalho planejadas.`,
    profileFrequency > 0
      ? `O perfil informa ${profileFrequency} sessão(ões) por semana; este plano foi contado ${volumeAnalysis.weeklyOccurrences} vez(es).`
      : 'A frequência semanal do perfil está ausente ou inválida.',
  ];

  const guidelines: WeeklyVolumeGuideline[] = volumeAnalysis.muscleVolume.map((result) => getWeeklyVolumeGuideline({
    muscleGroupId: result.muscleGroupId,
    experienceLevel: input.profile.level,
    trainingStatus: input.profile.trainingStatus,
    breakDuration: input.profile.returnToTraining?.breakDuration,
    goal: input.profile.goal,
  }));

  const guidelineByMuscle = new Map(guidelines.map((guideline) => [guideline.muscleGroupId, guideline]));
  let highVolumeCount = 0;
  let lowVolumeCount = 0;
  let comparableCount = 0;

  for (const result of volumeAnalysis.muscleVolume) {
    const guideline = guidelineByMuscle.get(result.muscleGroupId);
    if (!guideline?.reference) continue;
    comparableCount += 1;
    const level = classifyVolumeAgainstReference(result.weightedSets, guideline.reference);
    if (level === 'very_high') {
      highVolumeCount += 1;
      warnings.push({
        code: 'high-volume-reference',
        muscleGroupId: result.muscleGroupId,
        message: `O volume de ${result.muscleGroupId} está alto em relação à faixa inicial de referência.`,
      });
    } else if (level === 'low') {
      lowVolumeCount += 1;
      warnings.push({
        code: 'low-volume-reference',
        muscleGroupId: result.muscleGroupId,
        message: `O volume de ${result.muscleGroupId} está abaixo da faixa inicial de referência.` ,
      });
    }
  }

  if (durationEstimate.totalMinutes > availableMinutes) {
    warnings.push({ code: 'exceeds-time', message: 'Este treino pode ultrapassar o tempo informado.' });
  } else if (durationEstimate.upperBoundMinutes > availableMinutes) {
    warnings.push({ code: 'upper-bound-exceeds', message: 'O limite superior da estimativa pode ultrapassar o tempo informado.' });
  }

  const accountedSeconds = durationEstimate.workSeconds
    + durationEstimate.restSeconds
    + durationEstimate.transitionSeconds
    + durationEstimate.setupSeconds
    + durationEstimate.warmupSeconds;
  if (accountedSeconds > 0 && durationEstimate.restSeconds / accountedSeconds > 0.5) {
    warnings.push({ code: 'rest-dominates', message: 'A maior parte do tempo vem dos períodos de descanso.' });
  }
  if (slots.length > Math.max(4, Math.floor(availableMinutes / 8))) {
    warnings.push({ code: 'many-exercises', message: 'Existem muitos exercícios para a duração escolhida.' });
  }
  if (volumeAnalysis.confidence !== 'high' || durationEstimate.confidence !== 'high') {
    warnings.push({
      code: 'partial-classification',
      message: 'Alguns exercícios usam classificação legada ou dados incompletos; a estimativa pode variar.',
    });
  }
  if (profileFrequency > 0 && volumeAnalysis.weeklyOccurrences > profileFrequency) {
    warnings.push({
      code: 'frequency-mismatch',
      message: 'As ocorrências semanais informadas ultrapassam a frequência declarada no perfil.',
    });
  }
  if ((input.profile.trainingStatus ?? 'active') === 'returning') {
    warnings.push({
      code: 'returning-reference',
      message: 'Seu nível foi preservado, mas a referência considera que você está retornando.',
    });
    reasons.push('O retorno modifica somente a faixa de referência; não rebaixa o nível nem altera o plano.');
  }
  warnings.push({
    code: 'estimate-varies',
    message: 'Este resultado é uma estimativa e pode variar conforme lotação e preparação dos aparelhos.',
  });
  warnings.push(...volumeAnalysis.warnings.map((message) => ({ code: 'unclassified-volume', message })));

  const insufficientData = slots.length === 0
    || availableMinutes <= 0
    || profileFrequency <= 0
    || volumeAnalysis.totalWorkingSets === 0
    || (volumeAnalysis.totalWorkingSets > 0 && volumeAnalysis.unclassifiedSets === volumeAnalysis.totalWorkingSets);
  let status: PlanAssessmentStatus;
  if (insufficientData) {
    status = 'insufficient_data';
    reasons.push('Não há dados classificados suficientes para comparar o plano.');
    suggestions.push({ code: 'complete-data', message: 'Informar exercícios, séries, descanso e classificação para refazer a estimativa.' });
  } else if (durationEstimate.totalMinutes > availableMinutes) {
    status = 'exceeds_time';
    reasons.push('A estimativa central ultrapassa o tempo disponível.');
  } else if (highVolumeCount > 0) {
    status = 'high_volume';
    reasons.push(`${highVolumeCount} grupo(s) ultrapassam o limite de cautela da referência inicial.`);
    suggestions.push(
      { code: 'split-muscle-groups', message: 'Considerar dividir grupos em outro dia.' },
      { code: 'review-accessory-sets', message: 'Considerar reduzir uma série em exercícios acessórios.' },
      { code: 'keep-plan', message: 'Manter como está se essa for uma escolha consciente e aceitar a referência mais alta.' },
    );
  } else if (comparableCount > 0 && lowVolumeCount === comparableCount) {
    status = 'low_volume';
    reasons.push('Todos os grupos comparáveis ficaram abaixo da faixa inicial de referência.');
    suggestions.push({ code: 'review-plan-scope', message: 'Confirmar se o plano informado representa todos os dias da semana antes de ajustar volume.' });
  } else if (durationEstimate.totalMinutes >= availableMinutes * 0.85 || durationEstimate.upperBoundMinutes > availableMinutes) {
    status = 'tight';
    reasons.push('O plano cabe na estimativa central, mas tem pouca margem para variação operacional.');
  } else {
    status = 'fits';
    reasons.push('O plano cabe no tempo central e não ultrapassa as faixas comparáveis analisadas.');
  }

  suggestions.push(...timeSuggestions(status));
  const confidence: VolumeConfidence = insufficientData
    ? 'low'
    : lowestConfidence(durationEstimate.confidence, volumeAnalysis.confidence, ...guidelines.map((item) => item.confidence));

  return {
    status,
    durationEstimate,
    muscleVolume: volumeAnalysis.muscleVolume,
    guidelines,
    warnings: uniqueByCode(warnings),
    suggestions: uniqueByCode(suggestions),
    reasons,
    confidence,
  };
}
