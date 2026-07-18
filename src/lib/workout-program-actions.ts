// GOAL-19B: ações PURAS sobre programas customizados (duplicar, usar seed como base,
// analisar/limpar exclusão) e a organização da lista "Meus Treinos" (busca, filtro,
// ordenação). Nada aqui toca o React nem persiste — o GymFlowContext orquestra.
//
// Invariantes (ver docs/builder/GYMFLOW_GUIDED_WORKOUT_CREATION.md):
//  - Duplicar/derivar cria SEMPRE novos ids (programa e dias) e nunca muta a origem.
//  - Um programa seed nunca é editado nem excluído; "usar como base" gera custom novo.
//  - Excluir só limpa referências FUTURAS no weeklyPlan — histórico não é reescrito.
//  - `WorkoutProgram.exercises` (lista achatada legada) nunca é recriada para customs.

import type { ProgramWeek, WeeklyWorkoutDay, WorkoutProgram } from '../types';
import type { BuilderIdFactory } from '../types/workout-builder';
import { createBuilderId } from './workout-builder-id';
import { cloneSlots, slotsFromLegacyExercises } from './workout-program-normalization';
import { normalizeText } from './exerciseSearch';
import {
  MISSING_PROGRAM_DAY_ISSUE,
  MISSING_PROGRAM_DAY_WORKOUT_NAME,
} from './workout-plan-sync';

// ===== Cópia com novos ids =====

function cloneProgramWeeks(program: WorkoutProgram, createId: BuilderIdFactory): ProgramWeek[] {
  const weeks = Array.isArray(program.weeks) ? program.weeks : [];
  const clonedWeeks = weeks.map((week) => ({
    number: week.number,
    days: (week.days ?? []).map((day) => ({
      ...day,
      id: createId('day'),
      slots: cloneSlots(day.slots),
      ...(Array.isArray(day.muscleGroupIds) ? { muscleGroupIds: [...day.muscleGroupIds] } : {}),
    })),
  }));
  if (clonedWeeks.some((week) => week.days.length > 0)) return clonedWeeks;

  // Compatibilidade v1: programas persistidos antes da estrutura de dias podem ter
  // somente a lista achatada. A cópia promove esse conteúdo para um único dia canônico,
  // sem manter duas fontes de verdade e sem perder exercícios.
  const legacySlots = slotsFromLegacyExercises(program);
  if (legacySlots.length === 0) return clonedWeeks;
  return [{
    number: 1,
    days: [{
      id: createId('day'),
      name: program.name,
      customName: program.name,
      dayNumber: 1,
      muscleGroupIds: [],
      volumeProfile: 'standard',
      slots: legacySlots,
    }],
  }];
}

function cloneProgramWithNewIds(
  program: WorkoutProgram,
  createId: BuilderIdFactory,
  renameSuffix = '',
): WorkoutProgram {
  const weeks = cloneProgramWeeks(program, createId);
  return {
    id: createId('custom'),
    name: `${program.name}${renameSuffix}`,
    durationWeeks: program.durationWeeks,
    // Honesto: reflete o número real de dias do programa copiado.
    frequencyDays: weeks[0]?.days.length ?? program.frequencyDays,
    level: program.level,
    objective: program.objective,
    // Custom novo NUNCA recria a lista achatada legada (fonte canônica = weeks[0].days).
    exercises: [],
    description: program.description,
    ...(program.targetAudience ? { targetAudience: program.targetAudience } : {}),
    ...(program.contraindications ? { contraindications: [...program.contraindications] } : {}),
    repeatWeeks: program.repeatWeeks,
    weeks,
    isCustom: true,
  };
}

/** Duplica um programa (customizado): cópia editável, novos ids, "— Cópia" no nome. */
export function duplicateWorkoutProgram(
  program: WorkoutProgram,
  createId: BuilderIdFactory = createBuilderId,
): WorkoutProgram {
  return cloneProgramWithNewIds(program, createId, ' — Cópia');
}

/**
 * "Usar como base": cria um custom novo a partir de um programa seed (ou qualquer
 * programa), com novos ids e sem sufixo de cópia. O seed original permanece intacto.
 */
export function deriveCustomProgramFromSeed(
  program: WorkoutProgram,
  createId: BuilderIdFactory = createBuilderId,
): WorkoutProgram {
  return cloneProgramWithNewIds(program, createId, '');
}

// ===== Exclusão =====

/** Rótulo honesto de um dia da semana cuja referência de programa foi liberada. */
export const CLEARED_WEEKLY_WORKOUT_NAME = MISSING_PROGRAM_DAY_WORKOUT_NAME;

export interface ProgramDeletionImpact {
  dayCount: number;
  exerciseCount: number;
  /** Nomes dos dias da semana que apontam para este programa (referências futuras). */
  weeklyReferenceDayNames: string[];
}

/** Lê o impacto de excluir um programa — sem alterar nada. Alimenta o diálogo de confirmação. */
export function analyzeProgramDeletion(
  program: WorkoutProgram,
  weeklyPlan: readonly WeeklyWorkoutDay[] | undefined | null,
): ProgramDeletionImpact {
  const days = program.weeks?.[0]?.days ?? [];
  const dayCount = programDayCount(program);
  const exerciseCount = days.length > 0
    ? days.reduce((total, day) => total + (day.slots?.length ?? 0), 0)
    : (program.exercises?.length ?? 0);
  const weeklyReferenceDayNames = (weeklyPlan ?? [])
    .filter((day) => !day.trained && day.programId === program.id)
    .map((day) => day.dayName);
  return { dayCount, exerciseCount, weeklyReferenceDayNames };
}

/**
 * Limpa as referências a um programa no weeklyPlan.
 *
 * Dias futuros que apontavam para o programa usam a mesma invalidação de um ProgramDay
 * removido: o Planejador explica a causa e exige nova escolha. Dias treinados são
 * snapshots passados e retornam integralmente intactos. Puro: não muta o array recebido.
 */
export function clearProgramFromWeeklyPlan(
  weeklyPlan: readonly WeeklyWorkoutDay[] | undefined | null,
  programId: string,
): WeeklyWorkoutDay[] {
  return (weeklyPlan ?? []).map((day) => {
    if (day.trained || day.programId !== programId) return day;
    return {
      ...day,
      workoutName: CLEARED_WEEKLY_WORKOUT_NAME,
      muscleGroups: [],
      duration: 0,
      exerciseCount: 0,
      isRest: false,
      programId: undefined,
      programDayId: undefined,
      planningIssue: MISSING_PROGRAM_DAY_ISSUE,
    };
  });
}

/** Remove um programa da lista de customs (imutável). Excluir inexistente é seguro (no-op). */
export function removeProgramFromList(
  programs: readonly WorkoutProgram[],
  programId: string,
): WorkoutProgram[] {
  return programs.filter((program) => program.id !== programId);
}

// ===== Organização de "Meus Treinos" (PART 11) =====

export type ProgramFilterKind = 'all' | 'mine' | 'ready';
export type ProgramSortKey = 'recent' | 'name' | 'days';

export function programDayCount(program: WorkoutProgram): number {
  const persistedCount = program.weeks?.[0]?.days?.length ?? 0;
  if (persistedCount > 0) return persistedCount;
  return slotsFromLegacyExercises(program).length > 0 ? 1 : 0;
}

/** Busca por nome — ignora acentos e caixa, casa por tokens (reusa a normalização existente). */
export function programMatchesSearch(program: WorkoutProgram, query: string): boolean {
  const normalizedQuery = normalizeText(query ?? '');
  if (normalizedQuery === '') return true;
  const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return true;
  const haystack = normalizeText([program.name, program.objective, program.description].filter(Boolean).join(' '));
  return tokens.every((token) => haystack.includes(token));
}

export function filterProgramsByKind(
  programs: readonly WorkoutProgram[],
  kind: ProgramFilterKind,
): WorkoutProgram[] {
  if (kind === 'mine') return programs.filter((program) => program.isCustom);
  if (kind === 'ready') return programs.filter((program) => !program.isCustom);
  return [...programs];
}

export interface SortProgramsOptions {
  /** Fixa o programa recém-criado no topo — só em 'recent', para não quebrar a ordem pedida. */
  pinnedId?: string | null;
}

export function sortPrograms(
  programs: readonly WorkoutProgram[],
  sort: ProgramSortKey,
  options: SortProgramsOptions = {},
): WorkoutProgram[] {
  const list = [...programs];
  if (sort === 'name') {
    list.sort((left, right) => left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }));
  } else if (sort === 'days') {
    list.sort((left, right) => programDayCount(right) - programDayCount(left));
  } else {
    // 'recent': sem timestamp, a ordem de inserção é a melhor aproximação — o último
    // salvo aparece primeiro. O highlight do recém-criado reforça isso via pinnedId.
    list.reverse();
    if (options.pinnedId) {
      const index = list.findIndex((program) => program.id === options.pinnedId);
      if (index > 0) {
        const [pinned] = list.splice(index, 1);
        list.unshift(pinned);
      }
    }
  }
  return list;
}

export interface OrganizeProgramsOptions {
  query?: string;
  kind?: ProgramFilterKind;
  sort?: ProgramSortKey;
  pinnedId?: string | null;
}

/** Compõe filtro → busca → ordenação para a lista de "Meus Treinos". */
export function organizePrograms(
  programs: readonly WorkoutProgram[],
  options: OrganizeProgramsOptions = {},
): WorkoutProgram[] {
  const kind = options.kind ?? 'all';
  const sort = options.sort ?? 'recent';
  const filtered = filterProgramsByKind(programs, kind)
    .filter((program) => programMatchesSearch(program, options.query ?? ''));
  return sortPrograms(filtered, sort, { pinnedId: options.pinnedId });
}
