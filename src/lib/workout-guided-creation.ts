// GOAL-19B: conversões PURAS da criação guiada.
//
//   createWorkoutDraftFromTemplate(template, profile, options) -> draft editável
//   createEmptyWorkoutDraftFromFrequency(profile, dayCount?)   -> N dias vazios
//
// Ambas devolvem um `WorkoutProgramBuilderDraft` do GOAL-19A — 100% compatível com
// `buildWorkoutProgramFromDraft`/`normalizeWorkoutProgramForBuilder`. Regras duras:
//  - Nenhum exercício é inserido (todo dia nasce com `slots: []`).
//  - Nenhum foco é escolhido automaticamente pela frequência.
//  - O template NUNCA é mutado; todos os ids (programa e dias) são novos.
//  - `returning` afeta APENAS o volumeProfile inicial — nunca o nível (experienceLevel).

import type { VolumeProfile } from '../types';
import type {
  BuilderIdFactory,
  WorkoutDayBuilderDraft,
  WorkoutProgramBuilderDraft,
} from '../types/workout-builder';
import type { TrainingExperienceLevel } from '../types/training-profile';
import type { WorkoutProgramTemplate } from '../types/workout-templates';
import { MAX_PROGRAM_DAYS } from './workout-builder';
import { createBuilderId } from './workout-builder-id';
import {
  DEFAULT_PROGRAM_DESCRIPTION,
  DEFAULT_PROGRAM_NAME,
  DEFAULT_PROGRAM_OBJECTIVE,
} from './workout-program-normalization';
import { generateWorkoutDayAutoName, normalizeMuscleGroupIds } from './workout-day-naming';
import { clampTargetMinutes } from './workout-builder';
import { defaultTargetMinutes } from './volumeProfiles';

/** Faixa suportada de dias na criação por frequência (PART 7). */
export const MIN_FREQUENCY_DAYS = 1;
export const MAX_FREQUENCY_DAYS = MAX_PROGRAM_DAYS;

/** Perfil mínimo que a criação guiada consome. Tudo além disto é ignorado. */
export interface GuidedCreationProfile {
  level: TrainingExperienceLevel;
  duration?: number;
  frequency?: number;
  trainingStatus?: 'active' | 'returning';
}

export interface CreateDraftFromTemplateOptions {
  createId?: BuilderIdFactory;
}

function isReturning(profile: GuidedCreationProfile): boolean {
  return profile.trainingStatus === 'returning';
}

/**
 * Volume inicial ajustado para retorno (PART 6, regra 8).
 *
 * Único ponto onde o status de retorno influencia a conversão: um dia que começaria
 * em "Alto volume" nasce em "Padrão" para quem está retornando. O nível do usuário
 * NÃO muda, e o usuário pode reajustar o volume livremente depois.
 */
export function adjustVolumeProfileForReturn(
  volumeProfile: VolumeProfile,
  profile: GuidedCreationProfile,
): VolumeProfile {
  if (isReturning(profile) && volumeProfile === 'high') return 'standard';
  return volumeProfile;
}

/** Tempo alvo do dia: duração do perfil quando válida, senão o padrão do volumeProfile. */
function resolveTargetMinutes(profile: GuidedCreationProfile, volumeProfile: VolumeProfile): number {
  const fromProfile = profile.duration;
  if (Number.isFinite(fromProfile) && (fromProfile as number) > 0) {
    return clampTargetMinutes(fromProfile as number);
  }
  return clampTargetMinutes(defaultTargetMinutes(volumeProfile));
}

function programTargetMinutes(profile: GuidedCreationProfile): number {
  return resolveTargetMinutes(profile, 'standard');
}

/**
 * Converte um template estrutural em um draft editável.
 *
 * Não muta o template, cria ids novos para o programa e todos os dias, mantém `slots`
 * vazios e numera os dias na ordem do template. O draft resultante NÃO tem `programId`,
 * então o primeiro "Salvar" cria um novo customProgram (o seed/template fica intocado).
 */
export function createWorkoutDraftFromTemplate(
  template: WorkoutProgramTemplate,
  profile: GuidedCreationProfile,
  options: CreateDraftFromTemplateOptions = {},
): WorkoutProgramBuilderDraft {
  const createId = options.createId ?? createBuilderId;

  const days: WorkoutDayBuilderDraft[] = template.days.slice(0, MAX_PROGRAM_DAYS).map((templateDay, index) => {
    const muscleGroupIds = normalizeMuscleGroupIds(templateDay.muscleGroupIds);
    const baseVolumeProfile = templateDay.volumeProfile ?? 'standard';
    const volumeProfile = adjustVolumeProfileForReturn(baseVolumeProfile, profile);
    const targetMinutes = Number.isFinite(templateDay.targetMinutes) && (templateDay.targetMinutes as number) > 0
      ? clampTargetMinutes(templateDay.targetMinutes as number)
      : resolveTargetMinutes(profile, volumeProfile);
    const customName = templateDay.customName?.trim();

    return {
      id: createId('day'),
      dayNumber: index + 1,
      autoName: generateWorkoutDayAutoName(muscleGroupIds),
      ...(customName ? { customName } : {}),
      muscleGroupIds,
      volumeProfile,
      targetMinutes,
      slots: [], // NUNCA copiamos exercícios — templates não os têm.
    };
  });

  return {
    // Sem programId: salvar cria um novo customProgram; o template nunca é editado.
    name: template.name,
    description: template.description || DEFAULT_PROGRAM_DESCRIPTION,
    level: profile.level, // retorno mantém o nível — não rebaixa.
    objective: DEFAULT_PROGRAM_OBJECTIVE,
    durationWeeks: 0,
    repeatWeeks: true,
    targetMinutes: programTargetMinutes(profile),
    days,
  };
}

/** Normaliza o número de dias pedido para a faixa suportada, usando a frequência como sugestão. */
export function resolveFrequencyDayCount(profile: GuidedCreationProfile, dayCount?: number): number {
  const requested = Number.isFinite(dayCount) && (dayCount as number) > 0
    ? (dayCount as number)
    : Number.isFinite(profile.frequency) && (profile.frequency as number) > 0
      ? (profile.frequency as number)
      : MIN_FREQUENCY_DAYS;
  return Math.min(MAX_FREQUENCY_DAYS, Math.max(MIN_FREQUENCY_DAYS, Math.round(requested)));
}

/**
 * Cria um draft com N dias VAZIOS a partir da frequência do perfil (PART 7).
 *
 * A frequência é apenas sugestão: quem chama pode passar `dayCount` para sobrepor.
 * Nenhum foco muscular é escolhido — os dias saem como "Treino sem foco definido",
 * sem exercícios. Nada de divisão inventada a partir do número de dias.
 */
export function createEmptyWorkoutDraftFromFrequency(
  profile: GuidedCreationProfile,
  dayCount?: number,
  createId: BuilderIdFactory = createBuilderId,
): WorkoutProgramBuilderDraft {
  const count = resolveFrequencyDayCount(profile, dayCount);
  const targetMinutes = programTargetMinutes(profile);

  const days: WorkoutDayBuilderDraft[] = Array.from({ length: count }, (_, index) => ({
    id: createId('day'),
    dayNumber: index + 1,
    autoName: generateWorkoutDayAutoName([]),
    muscleGroupIds: [],
    volumeProfile: 'standard',
    targetMinutes,
    slots: [],
  }));

  return {
    name: DEFAULT_PROGRAM_NAME,
    description: DEFAULT_PROGRAM_DESCRIPTION,
    level: profile.level,
    objective: DEFAULT_PROGRAM_OBJECTIVE,
    durationWeeks: 0,
    repeatWeeks: true,
    targetMinutes,
    days,
  };
}
