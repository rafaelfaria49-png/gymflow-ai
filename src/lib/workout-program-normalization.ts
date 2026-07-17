// GOAL-19A: ponte pura entre o WorkoutProgram persistido e o draft do Construtor.
//
// Contrato:
//   normalizeWorkoutProgramForBuilder(program) -> draft   (ler, nunca alterar)
//   buildWorkoutProgramFromDraft(draft, existing?) -> program (gravar)
//
// `weeks[0].days` é a fonte canônica. Programas customizados novos NÃO duplicam os
// dias em `WorkoutProgram.exercises` — a lista achatada legada só é preservada quando
// já existia, nunca recriada.

import type {
  ExerciseSlot,
  ProgramDay,
  WorkoutProgram,
} from '../types';
import type {
  BuilderIdFactory,
  WorkoutDayBuilderDraft,
  WorkoutProgramBuilderDraft,
} from '../types/workout-builder';
import type { TrainingExperienceLevel } from '../types/training-profile';
import { defaultTargetMinutes } from './volumeProfiles';
import { createBuilderId } from './workout-builder-id';
import {
  generateWorkoutDayAutoName,
  normalizeMuscleGroupIds,
  resolveWorkoutDayName,
} from './workout-day-naming';

export const DEFAULT_PROGRAM_NAME = 'Meu Treino';
export const DEFAULT_PROGRAM_OBJECTIVE = 'Treino personalizado criado no Construtor de Treino';
export const DEFAULT_PROGRAM_DESCRIPTION = 'Treino criado manualmente pelo usuário no Construtor de Treino.';

export interface NormalizeProgramOptions {
  /** Nível usado quando o programa não traz um válido (perfil do usuário). */
  fallbackLevel?: TrainingExperienceLevel;
  /** Tempo alvo usado quando o dia não traz um (duração do perfil). */
  fallbackTargetMinutes?: number;
  createId?: BuilderIdFactory;
}

function cloneSlot(slot: ExerciseSlot): ExerciseSlot {
  return { ...slot, repRange: [slot.repRange[0], slot.repRange[1]] };
}

export function cloneSlots(slots: readonly ExerciseSlot[] | undefined | null): ExerciseSlot[] {
  return Array.isArray(slots) ? slots.map(cloneSlot) : [];
}

/**
 * Lê "8-12", "8 a 12", "10", "12 reps" etc. Devolve null quando o texto não contém
 * número algum ("até a falha") — nesse caso quem chama decide o fallback.
 */
export function parseLegacyRepRange(reps: unknown): [number, number] | null {
  if (typeof reps !== 'string') return null;
  const range = /(\d+)\s*(?:-|–|a|até)\s*(\d+)/i.exec(reps);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min) return [min, max];
  }
  const single = /(\d+)/.exec(reps);
  if (single) {
    const value = Number(single[1]);
    if (Number.isFinite(value)) return [value, value];
  }
  return null;
}

/**
 * Converte a lista achatada legada em slots.
 *
 * `exerciseId`, `series` e `repRange` vêm do dado real. RPE, descanso, progressão e
 * incremento não existem na lista achatada: usam os MESMOS defaults que o Construtor
 * já aplica ao adicionar um exercício à mão — não são medidas, são defaults declarados.
 * Caminho defensivo: nenhum programa seed atual cai aqui (todos têm weeks[0].days).
 */
function slotsFromLegacyExercises(program: WorkoutProgram): ExerciseSlot[] {
  if (!Array.isArray(program.exercises)) return [];
  return program.exercises.map((entry) => ({
    exerciseId: entry.exerciseId,
    series: Number.isFinite(entry.sets) && entry.sets > 0 ? entry.sets : 3,
    repRange: parseLegacyRepRange(entry.reps) ?? [8, 12],
    targetRPE: 8,
    restSec: 90,
    progression: 'dupla' as const,
    incrementKg: 2.5,
  }));
}

function normalizeDay(
  day: ProgramDay,
  index: number,
  options: NormalizeProgramOptions,
): WorkoutDayBuilderDraft {
  const muscleGroupIds = normalizeMuscleGroupIds(day.muscleGroupIds);
  const autoName = generateWorkoutDayAutoName(muscleGroupIds);
  const persistedName = typeof day.name === 'string' ? day.name : '';

  // Um nome que o gerador automático não produziria só pode ter vindo do usuário —
  // é isso que preserva, sem perda, o nome de programas antigos de um dia só.
  const explicitCustomName = typeof day.customName === 'string' && day.customName.trim()
    ? day.customName
    : undefined;
  const customName = explicitCustomName
    ?? (persistedName && persistedName !== autoName ? persistedName : undefined);

  const volumeProfile = day.volumeProfile ?? 'standard';
  const targetMinutes = Number.isFinite(day.targetMinutes) && (day.targetMinutes as number) > 0
    ? day.targetMinutes as number
    : Number.isFinite(options.fallbackTargetMinutes) && (options.fallbackTargetMinutes as number) > 0
      ? options.fallbackTargetMinutes as number
      : defaultTargetMinutes(volumeProfile);

  return {
    id: day.id,
    dayNumber: index + 1,
    autoName,
    ...(customName ? { customName } : {}),
    muscleGroupIds,
    volumeProfile,
    targetMinutes,
    slots: cloneSlots(day.slots),
  };
}

/**
 * Lê um WorkoutProgram e devolve o draft do Construtor. Função pura: NÃO altera o
 * programa recebido — abrir um programa nunca pode modificá-lo.
 *
 * `programId` só é preenchido para programas customizados. Normalizar um programa
 * seed devolve um draft sem `programId`, então salvar cria um novo customProgram e
 * o seed permanece intocado (regra herdada do GOAL-10.5).
 */
export function normalizeWorkoutProgramForBuilder(
  program: WorkoutProgram | null | undefined,
  options: NormalizeProgramOptions = {},
): WorkoutProgramBuilderDraft {
  const createId = options.createId ?? createBuilderId;
  const level = program?.level ?? options.fallbackLevel ?? 'intermediate';
  const programTargetMinutes = Number.isFinite(options.fallbackTargetMinutes) && (options.fallbackTargetMinutes as number) > 0
    ? options.fallbackTargetMinutes as number
    : defaultTargetMinutes('standard');

  const persistedDays = program?.weeks?.[0]?.days;
  let days: WorkoutDayBuilderDraft[] = Array.isArray(persistedDays)
    ? persistedDays.map((day, index) => normalizeDay(day, index, options))
    : [];

  // Sem weeks/days: tenta a lista achatada legada antes de desistir do conteúdo.
  if (days.length === 0 && program) {
    const legacySlots = slotsFromLegacyExercises(program);
    days = [{
      id: createId('day'),
      dayNumber: 1,
      autoName: generateWorkoutDayAutoName([]),
      ...(program.name ? { customName: program.name } : {}),
      muscleGroupIds: [],
      volumeProfile: 'standard',
      targetMinutes: programTargetMinutes,
      slots: legacySlots,
    }];
  }

  if (days.length === 0) {
    days = [createEmptyDayDraft({ dayNumber: 1, targetMinutes: programTargetMinutes, createId })];
  }

  return {
    ...(program?.isCustom && program.id ? { programId: program.id } : {}),
    name: program?.name ?? DEFAULT_PROGRAM_NAME,
    description: program?.description ?? DEFAULT_PROGRAM_DESCRIPTION,
    level,
    objective: program?.objective ?? DEFAULT_PROGRAM_OBJECTIVE,
    durationWeeks: Number.isFinite(program?.durationWeeks) ? program!.durationWeeks : 0,
    repeatWeeks: program?.repeatWeeks ?? true,
    targetMinutes: programTargetMinutes,
    days,
  };
}

export interface CreateEmptyDayOptions {
  dayNumber: number;
  targetMinutes: number;
  volumeProfile?: WorkoutDayBuilderDraft['volumeProfile'];
  createId?: BuilderIdFactory;
}

/** Dia novo e vazio — sem foco, sem exercícios, sem nome inventado. */
export function createEmptyDayDraft(options: CreateEmptyDayOptions): WorkoutDayBuilderDraft {
  const createId = options.createId ?? createBuilderId;
  return {
    id: createId('day'),
    dayNumber: options.dayNumber,
    autoName: generateWorkoutDayAutoName([]),
    muscleGroupIds: [],
    volumeProfile: options.volumeProfile ?? 'standard',
    targetMinutes: options.targetMinutes,
    slots: [],
  };
}

function serializeDay(day: WorkoutDayBuilderDraft, index: number): ProgramDay {
  return {
    id: day.id,
    name: resolveWorkoutDayName(day),
    slots: cloneSlots(day.slots),
    volumeProfile: day.volumeProfile,
    dayNumber: index + 1,
    muscleGroupIds: [...day.muscleGroupIds],
    ...(day.customName?.trim() ? { customName: day.customName } : {}),
    targetMinutes: day.targetMinutes,
  };
}

/**
 * Serializa o draft em um WorkoutProgram salvável.
 *
 * IDs de programa e de dia são preservados quando já existem; `existingProgram` só
 * fornece campos que o Construtor não edita (targetAudience, contraindicações e a
 * lista achatada legada, preservada como está — nunca recriada a partir dos dias).
 */
export function buildWorkoutProgramFromDraft(
  draft: WorkoutProgramBuilderDraft,
  existingProgram?: WorkoutProgram | null,
  createId: BuilderIdFactory = createBuilderId,
): WorkoutProgram {
  const days = draft.days.map(serializeDay);
  const id = draft.programId ?? existingProgram?.id ?? createId('custom');

  return {
    id,
    name: draft.name.trim() || DEFAULT_PROGRAM_NAME,
    durationWeeks: draft.durationWeeks,
    // Honesto: quantos dias o programa tem. A distribuição na semana é do Planejador.
    frequencyDays: days.length,
    level: draft.level,
    objective: draft.objective.trim() || DEFAULT_PROGRAM_OBJECTIVE,
    exercises: existingProgram?.exercises ?? [],
    description: draft.description?.trim() || DEFAULT_PROGRAM_DESCRIPTION,
    ...(existingProgram?.targetAudience ? { targetAudience: existingProgram.targetAudience } : {}),
    ...(existingProgram?.contraindications ? { contraindications: existingProgram.contraindications } : {}),
    repeatWeeks: draft.repeatWeeks,
    weeks: [{ number: 1, days }],
    isCustom: true,
  };
}
