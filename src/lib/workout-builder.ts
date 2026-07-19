// GOAL-19A: motor puro do Construtor de Treino multi-dia.
//
// Toda mutação de dia (adicionar, remover, duplicar, reordenar, renumerar) e todo
// resumo (volume por dia, volume semanal) moram aqui, fora do React, para serem
// testáveis sem DOM. Nada nestas funções escolhe exercício, aplica sugestão ou
// altera o treino do usuário — avisos são texto, nunca ação.

import type { Exercise, ExerciseSlot, WorkoutProgram } from '../types';
import type {
  BuilderIdFactory,
  WorkoutDayBuilderDraft,
  WorkoutProgramBuilderDraft,
} from '../types/workout-builder';
import type { MuscleGroupId } from '../types/training-taxonomy';
import type { TrainingProfileSource } from '../types/training-profile';
import type {
  MuscleGroupVolumeResult,
  SetVolumeReference,
  TrainingVolumeLevel,
  VolumeConfidence,
  WeeklyVolumeGuideline,
} from '../types/training-volume';
import {
  calculatePlannedMuscleVolume,
  classifyVolumeAgainstReference,
  getWeeklyVolumeGuideline,
} from './training-volume';
import { lowestConfidence } from './training-volume-rules';
import { getMuscleGroupDefinition, resolveLegacyMuscleGroup } from './training-taxonomy';
import { createBuilderId } from './workout-builder-id';
import {
  cloneSlots,
  createEmptyDayDraft,
  buildWorkoutProgramFromDraft,
} from './workout-program-normalization';
import {
  generateWorkoutDayAutoName,
  muscleGroupShortLabel,
  normalizeMuscleGroupIds,
  resolveWorkoutDayName,
} from './workout-day-naming';
import { buildDayFocusFilterResult } from './workout-picker';

/** Teto defensivo de dias por programa; não é uma recomendação de treino. */
export const MAX_PROGRAM_DAYS = 7;

/**
 * Cobertura da classificação LEGADA, não equivalência anatômica.
 *
 * Hoje nenhum dos 126 exercícios tem `primaryMuscleGroupId`: todos resolvem pelo
 * campo legado `muscleGroup`, e os 23 exercícios de perna colapsam em `legs_general`.
 * Ou seja: nenhum exercício resolve para quadríceps ou posterior de coxa.
 *
 * Este mapa diz apenas "um exercício marcado como legs_general PODE ser deste
 * subgrupo — a classificação atual não permite afirmar nem negar". Serve para:
 *  - o filtro "Foco do dia" não devolver lista vazia ao focar Quadríceps;
 *  - não afirmar "sem trabalho direto para posterior" quando há trabalho de perna
 *    que simplesmente não foi curado (isso seria uma afirmação falsa).
 *
 * NÃO é substituição automática (PART 5): o chip escolhido continua sendo o do
 * usuário, o nome do dia continua o dele, e a origem legada é sempre exibida.
 * A curadoria exercício a exercício pertence ao GOAL-33A.
 */
export const LEGACY_GENERIC_COVERAGE: Partial<Record<MuscleGroupId, readonly MuscleGroupId[]>> = {
  legs_general: ['quadriceps', 'hamstrings', 'adductors', 'abductors'],
};

function genericGroupsCovering(muscleGroupId: MuscleGroupId): MuscleGroupId[] {
  return (Object.keys(LEGACY_GENERIC_COVERAGE) as MuscleGroupId[])
    .filter((generic) => LEGACY_GENERIC_COVERAGE[generic]?.includes(muscleGroupId));
}

/** Faixa aceita para o tempo alvo de um dia (PART 12). */
export const MIN_DAY_TARGET_MINUTES = 10;
export const MAX_DAY_TARGET_MINUTES = 240;
export const QUICK_TARGET_MINUTES: readonly number[] = [30, 45, 60, 75, 90];

// ===== Dias =====

/** dayNumber é sempre a posição atual: reordenar/remover nunca deixa lacuna. */
export function renumberDays(days: readonly WorkoutDayBuilderDraft[]): WorkoutDayBuilderDraft[] {
  return days.map((day, index) => (day.dayNumber === index + 1 ? day : { ...day, dayNumber: index + 1 }));
}

function withDays(
  draft: WorkoutProgramBuilderDraft,
  days: readonly WorkoutDayBuilderDraft[],
): WorkoutProgramBuilderDraft {
  return { ...draft, days: renumberDays(days) };
}

export function findDay(
  draft: WorkoutProgramBuilderDraft,
  dayId: string,
): WorkoutDayBuilderDraft | undefined {
  return draft.days.find((day) => day.id === dayId);
}

export function canAddDay(draft: WorkoutProgramBuilderDraft): boolean {
  return draft.days.length < MAX_PROGRAM_DAYS;
}

export function canRemoveDay(draft: WorkoutProgramBuilderDraft): boolean {
  return draft.days.length > 1;
}

export function addDayToDraft(
  draft: WorkoutProgramBuilderDraft,
  createId: BuilderIdFactory = createBuilderId,
): WorkoutProgramBuilderDraft {
  if (!canAddDay(draft)) return draft;
  const day = createEmptyDayDraft({
    dayNumber: draft.days.length + 1,
    targetMinutes: draft.targetMinutes,
    createId,
  });
  return withDays(draft, [...draft.days, day]);
}

/** Cria N dias vazios de uma vez (ex.: "usar minha frequência"), respeitando o teto. */
export function addEmptyDaysToDraft(
  draft: WorkoutProgramBuilderDraft,
  count: number,
  createId: BuilderIdFactory = createBuilderId,
): WorkoutProgramBuilderDraft {
  let next = draft;
  for (let index = 0; index < count; index += 1) {
    if (!canAddDay(next)) break;
    next = addDayToDraft(next, createId);
  }
  return next;
}

/** Nunca remove o último dia — um programa sem nenhum dia não é salvável. */
export function removeDayFromDraft(
  draft: WorkoutProgramBuilderDraft,
  dayId: string,
): WorkoutProgramBuilderDraft {
  if (!canRemoveDay(draft)) return draft;
  const days = draft.days.filter((day) => day.id !== dayId);
  if (days.length === draft.days.length) return draft;
  return withDays(draft, days);
}

/**
 * Duplica um dia logo após o original: id novo, slots copiados em profundidade e
 * foco preservado. "(Cópia)" só entra quando havia nome customizado — o nome
 * automático já descreve o foco e duplicá-lo com sufixo seria ruído.
 */
export function duplicateDayInDraft(
  draft: WorkoutProgramBuilderDraft,
  dayId: string,
  createId: BuilderIdFactory = createBuilderId,
): WorkoutProgramBuilderDraft {
  if (!canAddDay(draft)) return draft;
  const index = draft.days.findIndex((day) => day.id === dayId);
  if (index === -1) return draft;

  const source = draft.days[index];
  const copy: WorkoutDayBuilderDraft = {
    ...source,
    id: createId('day'),
    dayNumber: index + 2,
    muscleGroupIds: [...source.muscleGroupIds],
    slots: cloneSlots(source.slots),
    ...(source.customName?.trim() ? { customName: `${source.customName.trim()} (Cópia)` } : {}),
  };

  const days = [...draft.days];
  days.splice(index + 1, 0, copy);
  return withDays(draft, days);
}

export function moveDayInDraft(
  draft: WorkoutProgramBuilderDraft,
  dayId: string,
  direction: -1 | 1,
): WorkoutProgramBuilderDraft {
  const index = draft.days.findIndex((day) => day.id === dayId);
  if (index === -1) return draft;
  const target = index + direction;
  if (target < 0 || target >= draft.days.length) return draft;

  const days = [...draft.days];
  [days[index], days[target]] = [days[target], days[index]];
  return withDays(draft, days);
}

/** Patch imutável de um dia. Mexer no foco recalcula o autoName e nunca toca no customName. */
export function updateDayInDraft(
  draft: WorkoutProgramBuilderDraft,
  dayId: string,
  patch: Partial<Omit<WorkoutDayBuilderDraft, 'id' | 'dayNumber' | 'autoName'>>,
): WorkoutProgramBuilderDraft {
  const days = draft.days.map((day) => {
    if (day.id !== dayId) return day;
    const next: WorkoutDayBuilderDraft = { ...day, ...patch };
    if (patch.muscleGroupIds) {
      next.muscleGroupIds = normalizeMuscleGroupIds(patch.muscleGroupIds);
      next.autoName = generateWorkoutDayAutoName(next.muscleGroupIds);
    }
    if ('customName' in patch && !patch.customName?.trim()) delete next.customName;
    return next;
  });
  return { ...draft, days };
}

/** Liga/desliga um grupo do foco do dia. */
export function toggleDayMuscleGroup(
  draft: WorkoutProgramBuilderDraft,
  dayId: string,
  muscleGroupId: MuscleGroupId,
): WorkoutProgramBuilderDraft {
  const day = findDay(draft, dayId);
  if (!day) return draft;
  const active = day.muscleGroupIds.includes(muscleGroupId);
  const muscleGroupIds = active
    ? day.muscleGroupIds.filter((id) => id !== muscleGroupId)
    : [...day.muscleGroupIds, muscleGroupId];
  return updateDayInDraft(draft, dayId, { muscleGroupIds });
}

/** "Usar nome automático": descarta o nome customizado (PART 6, regra 9). */
export function clearDayCustomName(
  draft: WorkoutProgramBuilderDraft,
  dayId: string,
): WorkoutProgramBuilderDraft {
  return updateDayInDraft(draft, dayId, { customName: undefined });
}

export function clampTargetMinutes(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return MIN_DAY_TARGET_MINUTES;
  return Math.min(MAX_DAY_TARGET_MINUTES, Math.max(MIN_DAY_TARGET_MINUTES, Math.round(value as number)));
}

// ===== Slots (por dia) =====

export function updateDaySlots(
  draft: WorkoutProgramBuilderDraft,
  dayId: string,
  updater: (slots: ExerciseSlot[]) => ExerciseSlot[],
): WorkoutProgramBuilderDraft {
  const day = findDay(draft, dayId);
  if (!day) return draft;
  return updateDayInDraft(draft, dayId, { slots: updater(day.slots) });
}

export function addSlotToDay(
  draft: WorkoutProgramBuilderDraft,
  dayId: string,
  slot: ExerciseSlot,
): WorkoutProgramBuilderDraft {
  return updateDaySlots(draft, dayId, (slots) => [...slots, slot]);
}

export function removeSlotFromDay(
  draft: WorkoutProgramBuilderDraft,
  dayId: string,
  index: number,
): WorkoutProgramBuilderDraft {
  return updateDaySlots(draft, dayId, (slots) => slots.filter((_, i) => i !== index));
}

export function duplicateSlotInDay(
  draft: WorkoutProgramBuilderDraft,
  dayId: string,
  index: number,
): WorkoutProgramBuilderDraft {
  return updateDaySlots(draft, dayId, (slots) => {
    if (index < 0 || index >= slots.length) return slots;
    const copy = [...slots];
    copy.splice(index + 1, 0, ...cloneSlots([slots[index]]));
    return copy;
  });
}

export function moveSlotInDay(
  draft: WorkoutProgramBuilderDraft,
  dayId: string,
  index: number,
  direction: -1 | 1,
): WorkoutProgramBuilderDraft {
  return updateDaySlots(draft, dayId, (slots) => {
    const target = index + direction;
    if (target < 0 || target >= slots.length) return slots;
    const copy = [...slots];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    return copy;
  });
}

export function updateSlotInDay(
  draft: WorkoutProgramBuilderDraft,
  dayId: string,
  index: number,
  fields: Partial<ExerciseSlot>,
): WorkoutProgramBuilderDraft {
  return updateDaySlots(draft, dayId, (slots) => slots.map((slot, i) => (i === index ? { ...slot, ...fields } : slot)));
}

export function countExerciseInDay(day: WorkoutDayBuilderDraft | undefined, exerciseId: string): number {
  return day ? day.slots.filter((slot) => slot.exerciseId === exerciseId).length : 0;
}

/**
 * Em quais OUTROS dias este exercício já aparece. Serve só para informar — repetir
 * o mesmo exercício em dias diferentes é legítimo e nunca é bloqueado.
 */
export function findExerciseInOtherDays(
  draft: WorkoutProgramBuilderDraft,
  dayId: string,
  exerciseId: string,
): WorkoutDayBuilderDraft[] {
  return draft.days.filter((day) => day.id !== dayId && day.slots.some((slot) => slot.exerciseId === exerciseId));
}

// ===== Foco do dia no seletor (PART 9) =====

export type ExerciseFocusMatchKind =
  | 'primary'
  | 'legacy-primary'
  | 'legacy-generic'
  | 'secondary'
  | 'legacy-secondary'
  | 'none';

export interface ExerciseFocusMatch {
  matches: boolean;
  kind: ExerciseFocusMatchKind;
  /** true quando o casamento dependeu de classificação legada (precisa ser exibido). */
  legacy: boolean;
}

function resolvePrimary(exercise: Exercise): { id: MuscleGroupId | undefined; canonical: boolean } {
  if (exercise.primaryMuscleGroupId && getMuscleGroupDefinition(exercise.primaryMuscleGroupId)) {
    return { id: exercise.primaryMuscleGroupId, canonical: true };
  }
  return { id: resolveLegacyMuscleGroup(exercise.muscleGroup ?? '')?.id, canonical: false };
}

function resolveSecondaries(exercise: Exercise): { ids: MuscleGroupId[]; canonical: boolean } {
  if (Array.isArray(exercise.secondaryMuscleGroupIds) && exercise.secondaryMuscleGroupIds.length > 0) {
    return {
      ids: exercise.secondaryMuscleGroupIds.filter((id) => Boolean(getMuscleGroupDefinition(id))),
      canonical: true,
    };
  }
  const ids = (exercise.secondaryMuscles ?? [])
    .map((value) => resolveLegacyMuscleGroup(value)?.id)
    .filter((id): id is MuscleGroupId => Boolean(id));
  return { ids, canonical: false };
}

/**
 * O exercício atende ao foco do dia? Ordem de resolução do PART 9:
 * primário canônico → primário legado → primário genérico legado → secundários.
 * `legacy` informa a UI, que precisa dizer que a classificação é legada.
 */
export function matchesDayFocus(
  exercise: Exercise,
  focusIds: readonly MuscleGroupId[],
): ExerciseFocusMatch {
  if (focusIds.length === 0) return { matches: true, kind: 'none', legacy: false };

  const primary = resolvePrimary(exercise);
  if (primary.id && focusIds.includes(primary.id)) {
    return {
      matches: true,
      kind: primary.canonical ? 'primary' : 'legacy-primary',
      legacy: !primary.canonical,
    };
  }

  // Exercício genérico (legs_general) contra um foco de subgrupo de perna: não dá
  // para afirmar que atende, mas esconder seria pior — entra marcado como legado.
  if (primary.id && focusIds.some((focusId) => genericGroupsCovering(focusId).includes(primary.id as MuscleGroupId))) {
    return { matches: true, kind: 'legacy-generic', legacy: true };
  }

  const secondary = resolveSecondaries(exercise);
  if (secondary.ids.some((id) => focusIds.includes(id))) {
    return {
      matches: true,
      kind: secondary.canonical ? 'secondary' : 'legacy-secondary',
      legacy: !secondary.canonical,
    };
  }

  return { matches: false, kind: 'none', legacy: false };
}

export interface DayFocusFilterResult {
  exercises: Exercise[];
  /** Algum resultado dependeu de classificação legada → a UI precisa avisar. */
  usesLegacyClassification: boolean;
}

/** Filtra a biblioteca pelo foco do dia. NÃO ordena, NÃO pontua, NÃO sugere (isso é GOAL-20). */
export function filterExercisesByDayFocus(
  exercises: readonly Exercise[],
  focusIds: readonly MuscleGroupId[],
): DayFocusFilterResult {
  return buildDayFocusFilterResult(exercises, focusIds);
}

// ===== Estado não salvo =====

/**
 * Assinatura estável do draft para detectar alterações não salvas (PART 18).
 * Cobre nome, objetivo, nível, dias, foco, tempo, perfil de volume, slots e ordem.
 */
export function serializeDraftSignature(draft: WorkoutProgramBuilderDraft): string {
  return JSON.stringify({
    name: draft.name.trim(),
    description: draft.description?.trim() ?? '',
    level: draft.level,
    objective: draft.objective.trim(),
    durationWeeks: draft.durationWeeks,
    repeatWeeks: draft.repeatWeeks,
    days: draft.days.map((day) => ({
      id: day.id,
      customName: day.customName?.trim() ?? '',
      muscleGroupIds: day.muscleGroupIds,
      volumeProfile: day.volumeProfile,
      targetMinutes: day.targetMinutes,
      slots: day.slots,
    })),
  });
}

export function isDraftDirty(draft: WorkoutProgramBuilderDraft, savedSignature: string): boolean {
  return serializeDraftSignature(draft) !== savedSignature;
}

// ===== Volume =====

export interface WeeklyMuscleVolumeComparison {
  muscleGroupId: MuscleGroupId;
  label: string;
  directSets: number;
  secondaryExposure: number;
  weightedSets: number;
  reference: SetVolumeReference | null;
  level: TrainingVolumeLevel | null;
  confidence: VolumeConfidence;
}

export interface ProgramVolumeSummary {
  muscleVolume: MuscleGroupVolumeResult[];
  comparisons: WeeklyMuscleVolumeComparison[];
  guidelines: WeeklyVolumeGuideline[];
  totalWorkingSets: number;
  unclassifiedSets: number;
  /** Foco de algum dia com ausência de trabalho direto VERIFICÁVEL. */
  focusWithoutDirectWork: MuscleGroupId[];
  /** Foco cujo volume direto não é confirmável porque o trabalho está classificado genericamente. */
  focusCoveredByGenericWork: MuscleGroupId[];
  warnings: string[];
  confidence: VolumeConfidence;
}

/** Volume de UM dia: números crus, sem comparar com a referência semanal (PART 11). */
export function summarizeDayVolume(day: WorkoutDayBuilderDraft, exercises: readonly Exercise[]) {
  return calculatePlannedMuscleVolume({ slots: day.slots, exercises });
}

/**
 * Volume do programa inteiro (a semana canônica = todos os dias, uma vez cada).
 *
 * Só aqui a comparação com a referência semanal do perfil acontece — comparar um dia
 * isolado com uma faixa semanal, sem o contexto dos outros dias, seria desonesto.
 * Nenhum aviso altera o treino: são todos textuais.
 */
export function summarizeProgramVolume(
  draft: WorkoutProgramBuilderDraft,
  exercises: readonly Exercise[],
  profile: Pick<TrainingProfileSource, 'level' | 'trainingStatus' | 'returnToTraining' | 'goal'>,
): ProgramVolumeSummary {
  const slots = draft.days.flatMap((day) => day.slots);
  const analysis = calculatePlannedMuscleVolume({ slots, exercises });

  const guidelines = analysis.muscleVolume.map((result) => getWeeklyVolumeGuideline({
    muscleGroupId: result.muscleGroupId,
    experienceLevel: profile.level,
    trainingStatus: profile.trainingStatus,
    breakDuration: profile.returnToTraining?.breakDuration,
    goal: profile.goal,
  }));
  const guidelineByMuscle = new Map(guidelines.map((guideline) => [guideline.muscleGroupId, guideline]));

  const warnings: string[] = [];
  const comparisons: WeeklyMuscleVolumeComparison[] = analysis.muscleVolume.map((result) => {
    const guideline = guidelineByMuscle.get(result.muscleGroupId);
    const reference = guideline?.reference ?? null;
    const level = reference ? classifyVolumeAgainstReference(result.weightedSets, reference) : null;
    const label = muscleGroupShortLabel(result.muscleGroupId);

    if (level === 'very_high') {
      warnings.push(`O volume semanal de ${label.toLowerCase()} está acima da referência inicial.`);
    } else if (level === 'low') {
      warnings.push(`O volume semanal de ${label.toLowerCase()} está abaixo da referência inicial.`);
    }

    return {
      muscleGroupId: result.muscleGroupId,
      label,
      directSets: result.directSets,
      secondaryExposure: result.secondaryExposure,
      weightedSets: result.weightedSets,
      reference,
      level,
      confidence: lowestConfidence(result.confidence, guideline?.confidence ?? 'high'),
    };
  });

  // Foco declarado sem trabalho direto: o usuário marcou o dia como de posterior,
  // mas nenhum exercício do programa atinge posterior como grupo primário.
  //
  // Só afirmamos a ausência quando ela é verificável. Se existe trabalho classificado
  // genericamente que PODE ser deste grupo (legs_general), a resposta honesta é "não
  // dá para saber" — aí o aviso vira o de classificação legada, não uma afirmação falsa.
  const directByGroup = new Map(analysis.muscleVolume.map((result) => [result.muscleGroupId, result.directSets]));
  const hasDirect = (id: MuscleGroupId) => (directByGroup.get(id) ?? 0) > 0;
  const focusGroups = normalizeMuscleGroupIds(draft.days.flatMap((day) => day.muscleGroupIds));

  const coveredByGenericWork: MuscleGroupId[] = [];
  const focusWithoutDirectWork = focusGroups.filter((id) => {
    if (hasDirect(id)) return false;
    if (genericGroupsCovering(id).some(hasDirect)) {
      coveredByGenericWork.push(id);
      return false;
    }
    return true;
  });

  for (const muscleGroupId of focusWithoutDirectWork) {
    warnings.push(
      `Este programa ainda não possui trabalho direto para ${muscleGroupShortLabel(muscleGroupId).toLowerCase()}.`,
    );
  }

  if (coveredByGenericWork.length > 0) {
    const labels = coveredByGenericWork.map((id) => muscleGroupShortLabel(id).toLowerCase());
    warnings.push(
      `O trabalho de perna deste programa está classificado de forma genérica; não é possível confirmar o volume direto de ${labels.join(', ')}.`,
    );
  }

  if (analysis.unclassifiedSets > 0 || analysis.confidence !== 'high') {
    warnings.push('Alguns exercícios não estão totalmente classificados.');
  }

  return {
    muscleVolume: analysis.muscleVolume,
    comparisons,
    guidelines,
    totalWorkingSets: analysis.totalWorkingSets,
    unclassifiedSets: analysis.unclassifiedSets,
    focusWithoutDirectWork,
    focusCoveredByGenericWork: coveredByGenericWork,
    warnings: [...new Set(warnings)],
    confidence: analysis.confidence,
  };
}

// ===== Salvamento =====

/** Só um dia com pelo menos um exercício é iniciável/salvável. */
export function draftHasAnyExercise(draft: WorkoutProgramBuilderDraft): boolean {
  return draft.days.some((day) => day.slots.length > 0);
}

export function daysWithoutExercises(draft: WorkoutProgramBuilderDraft): WorkoutDayBuilderDraft[] {
  return draft.days.filter((day) => day.slots.length === 0);
}

export function dayDisplayName(day: WorkoutDayBuilderDraft): string {
  return resolveWorkoutDayName(day);
}

/**
 * Nome da sessão ao iniciar um dia: inclui o programa e a identidade do dia, para o
 * histórico nunca registrar "Meu Treino" três vezes sem dizer qual dia foi.
 */
export function activeWorkoutNameForDay(
  programName: string,
  day: WorkoutDayBuilderDraft,
  multiDay: boolean,
): string {
  const dayName = dayDisplayName(day);
  const program = programName.trim() || 'Meu Treino';
  if (!multiDay) return program;
  return `${program} — Dia ${day.dayNumber} · ${dayName}`;
}

export function buildProgramFromDraft(
  draft: WorkoutProgramBuilderDraft,
  existingProgram?: WorkoutProgram | null,
  createId: BuilderIdFactory = createBuilderId,
): WorkoutProgram {
  return buildWorkoutProgramFromDraft(draft, existingProgram, createId);
}
