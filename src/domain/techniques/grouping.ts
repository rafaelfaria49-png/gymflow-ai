import type { ActiveExercise, Exercise, ExerciseSlot, WorkoutSession } from '../../types';
import type { ExerciseGroupType } from './types';

export const EXERCISE_GROUP_TYPES: readonly ExerciseGroupType[] = Object.freeze([
  'bi_set',
  'superset',
  'tri_set',
  'giant_set',
]);

export const EXERCISE_GROUP_LABELS: Readonly<Record<ExerciseGroupType, string>> = Object.freeze({
  bi_set: 'Bi-set',
  superset: 'Superset',
  tri_set: 'Tri-set',
  giant_set: 'Giant set',
});

export const DEFAULT_GROUP_REST_SECONDS = 90;
export const INTRA_GROUP_TRANSITION_SECONDS = 30;

type GroupableEntry = {
  groupId?: string;
  groupOrder?: number;
  groupRestSec?: number;
  groupType?: ExerciseGroupType;
  sets?: readonly { completed: boolean }[];
  series?: number;
};

export interface ExerciseGroupCreationOptions {
  groupId?: string;
  groupType?: ExerciseGroupType;
  /** `type` é aceito como alias curto para integrações do Builder. */
  type?: ExerciseGroupType;
  groupRestSec?: number;
  /** `restSec` é aceito como alias curto para integrações do Builder. */
  restSec?: number;
}

export interface ExerciseGroupValidationIssue {
  code: string;
  message: string;
}

export interface ExerciseGroupValidationResult {
  valid: boolean;
  type: ExerciseGroupType;
  selectedIndices: number[];
  warnings: ExerciseGroupValidationIssue[];
}

export interface ExerciseGroupSummary {
  id: string;
  type: ExerciseGroupType;
  label: string;
  memberIndices: number[];
  restSec: number;
  roundCount: number;
}

export type SetRestTransitionMode = 'none' | 'intra-group' | 'group-round';

export interface SetRestTransition {
  mode: SetRestTransitionMode;
  seconds: number;
  round?: number;
  nextExerciseIndex?: number;
  isLastRemainingSet: boolean;
}

function isGroupType(value: unknown): value is ExerciseGroupType {
  return typeof value === 'string' && (EXERCISE_GROUP_TYPES as readonly string[]).includes(value);
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : fallback;
}

function selectedIndexList(indices: readonly number[], size: number): number[] {
  return [...new Set(indices)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < size)
    .sort((left, right) => left - right);
}

function selectedIndexOrder(indices: readonly number[], size: number): number[] {
  return [...new Set(indices)].filter((index) => Number.isInteger(index) && index >= 0 && index < size);
}

export function groupTypeForSize(size: number): ExerciseGroupType {
  if (size === 2) return 'superset';
  if (size === 3) return 'tri_set';
  if (size >= 4) return 'giant_set';
  return 'superset';
}

export function groupLabel(type: ExerciseGroupType): string {
  return EXERCISE_GROUP_LABELS[type];
}

function groupTypeOf(entry: GroupableEntry, memberCount: number): ExerciseGroupType {
  return isGroupType(entry.groupType) ? entry.groupType : groupTypeForSize(memberCount);
}

function groupRestOf(entries: readonly GroupableEntry[], indices: readonly number[]): number {
  const first = indices
    .map((index) => entries[index]?.groupRestSec)
    .find((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  return finiteNonNegative(first, DEFAULT_GROUP_REST_SECONDS);
}

function sortGroupIndices(entries: readonly GroupableEntry[], indices: readonly number[]): number[] {
  return [...indices].sort((left, right) => {
    const leftOrder = Number.isFinite(entries[left]?.groupOrder) ? entries[left].groupOrder as number : left;
    const rightOrder = Number.isFinite(entries[right]?.groupOrder) ? entries[right].groupOrder as number : right;
    return leftOrder - rightOrder || left - right;
  });
}

/**
 * Cria um agrupamento alternado. A ordem física dos slots é preservada; a
 * execução usa `groupOrder`, o que permite selecionar cartões fora de sequência
 * sem mover silenciosamente o plano do usuário.
 */
export function groupExerciseSlots(
  slots: readonly ExerciseSlot[],
  indices: readonly number[],
  options: ExerciseGroupCreationOptions = {},
): ExerciseSlot[] {
  const selected = selectedIndexOrder(indices, slots.length);
  if (selected.length < 2) return slots.map((slot) => ({ ...slot, repRange: [...slot.repRange] as [number, number] }));

  const groupId = options.groupId?.trim() || `group_${selected[0] + 1}`;
  const groupType = options.groupType ?? options.type ?? groupTypeForSize(selected.length);
  const groupRestSec = finiteNonNegative(
    options.groupRestSec ?? options.restSec,
    DEFAULT_GROUP_REST_SECONDS,
  );
  const selectedSet = new Set(selected);
  return slots.map((slot, index) => {
    const next = { ...slot, repRange: [...slot.repRange] as [number, number] };
    if (!selectedSet.has(index)) return next;
    next.groupId = groupId;
    next.groupOrder = selected.indexOf(index);
    next.groupRestSec = groupRestSec;
    next.groupType = groupType;
    return next;
  });
}

/** Alias explícito para o verbo usado no Builder. */
export const createGroupInSlots = groupExerciseSlots;
export const createExerciseGroup = groupExerciseSlots;

export function ungroupExerciseSlots(
  slots: readonly ExerciseSlot[],
  groupId: string,
): ExerciseSlot[] {
  if (!groupId) return slots.map((slot) => ({ ...slot, repRange: [...slot.repRange] as [number, number] }));
  return slots.map((slot) => {
    if (slot.groupId !== groupId) return { ...slot, repRange: [...slot.repRange] as [number, number] };
    const next = { ...slot, repRange: [...slot.repRange] as [number, number] };
    delete next.groupId;
    delete next.groupOrder;
    delete next.groupRestSec;
    delete next.groupType;
    return next;
  });
}

export const removeExerciseGroup = ungroupExerciseSlots;
export const ungroupSlots = ungroupExerciseSlots;

/**
 * Repara metadados de grupos carregados de versões antigas ou após a remoção de
 * uma entrada. Grupo com menos de duas entradas deixa de ser um grupo.
 */
export function normalizeExerciseGroups<T extends GroupableEntry>(entries: readonly T[]): T[] {
  const groupMap = new Map<string, number[]>();
  entries.forEach((entry, index) => {
    if (typeof entry.groupId !== 'string' || entry.groupId.trim().length === 0) return;
    const members = groupMap.get(entry.groupId) ?? [];
    members.push(index);
    groupMap.set(entry.groupId, members);
  });

  let changed = false;
  const next = entries.map((entry) => ({ ...entry } as T));
  for (const [groupId, rawMembers] of groupMap) {
    const members = sortGroupIndices(entries, rawMembers);
    if (members.length < 2) {
      for (const index of members) {
        const item = next[index] as GroupableEntry & T;
        delete item.groupId;
        delete item.groupOrder;
        delete item.groupRestSec;
        delete item.groupType;
        changed = true;
      }
      continue;
    }
    const type = groupTypeOf(entries[members[0]], members.length);
    const restSec = groupRestOf(entries, members);
    members.forEach((index, order) => {
      const current = entries[index];
      const item = next[index] as GroupableEntry & T;
      if (
        current.groupId !== groupId
        || current.groupOrder !== order
        || current.groupRestSec !== restSec
        || current.groupType !== type
      ) changed = true;
      item.groupId = groupId;
      item.groupOrder = order;
      item.groupRestSec = restSec;
      item.groupType = type;
    });
  }
  return changed ? next : entries as T[];
}

export function getExerciseGroups<T extends GroupableEntry>(entries: readonly T[]): ExerciseGroupSummary[] {
  const groupMap = new Map<string, number[]>();
  entries.forEach((entry, index) => {
    if (typeof entry.groupId !== 'string' || entry.groupId.trim().length === 0) return;
    groupMap.set(entry.groupId, [...(groupMap.get(entry.groupId) ?? []), index]);
  });
  return [...groupMap.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([id, rawMembers]) => {
      const memberIndices = sortGroupIndices(entries, rawMembers);
      const type = groupTypeOf(entries[memberIndices[0]], memberIndices.length);
      const roundCount = memberIndices.length === 0
        ? 0
        : Math.max(...memberIndices.map((index) => entries[index].sets?.length ?? entries[index].series ?? 0));
      return {
        id,
        type,
        label: groupLabel(type),
        memberIndices,
        restSec: groupRestOf(entries, memberIndices),
        roundCount,
      };
    });
}

export function getGroupForEntry<T extends GroupableEntry>(
  entries: readonly T[],
  index: number,
): ExerciseGroupSummary | undefined {
  const groupId = entries[index]?.groupId;
  return groupId ? getExerciseGroups(entries).find((group) => group.id === groupId) : undefined;
}

export function groupRoundForSet(setIndex: number): number {
  return Math.max(1, Math.floor(setIndex) + 1);
}

/** Validação sem bloqueio: avisos orientam bi-set/superset, mas não descartam seleção. */
export function validateExerciseGroup(
  slots: readonly ExerciseSlot[],
  exercises: readonly Exercise[],
  indices: readonly number[],
  type: ExerciseGroupType,
): ExerciseGroupValidationResult {
  const selectedIndices = selectedIndexList(indices, slots.length);
  const selectedExercises = selectedIndices
    .map((index) => exercises.find((exercise) => exercise.id === slots[index]?.exerciseId))
    .filter((exercise): exercise is Exercise => Boolean(exercise));
  const muscleGroups = new Set(selectedExercises.map((exercise) => exercise.primaryMuscleGroupId ?? exercise.muscleGroup));
  const warnings: ExerciseGroupValidationIssue[] = [];

  if (selectedIndices.length < 2) {
    warnings.push({ code: 'group-too-small', message: 'Selecione pelo menos dois exercícios para criar um grupo.' });
  }
  if (type === 'bi_set' && selectedIndices.length !== 2) {
    warnings.push({ code: 'bi-set-size', message: 'Bi-set normalmente usa exatamente dois exercícios.' });
  }
  if (type === 'tri_set' && selectedIndices.length !== 3) {
    warnings.push({ code: 'tri-set-size', message: 'Tri-set normalmente usa exatamente três exercícios.' });
  }
  if (type === 'giant_set' && selectedIndices.length < 4) {
    warnings.push({ code: 'giant-set-size', message: 'Giant set normalmente usa quatro ou mais exercícios.' });
  }
  if (type === 'bi_set' && muscleGroups.size > 1) {
    warnings.push({ code: 'bi-set-muscle-group', message: 'Bi-set costuma combinar exercícios do mesmo grupo muscular.' });
  }
  if (type === 'superset' && muscleGroups.size < 2) {
    warnings.push({ code: 'superset-muscle-group', message: 'Superset costuma alternar grupos musculares distintos.' });
  }

  return {
    valid: selectedIndices.length >= 2,
    type,
    selectedIndices,
    warnings,
  };
}

function allSetsCompleted(exercises: readonly GroupableEntry[]): boolean {
  return exercises.length > 0 && exercises.every((exercise) => (exercise.sets ?? []).every((set) => set.completed));
}

function nextGroupExerciseIndex(
  entries: readonly GroupableEntry[],
  group: ExerciseGroupSummary,
  currentIndex: number,
  setIndex: number,
): number | undefined {
  const currentOrder = group.memberIndices.indexOf(currentIndex);
  const orderedMembers = currentOrder >= 0
    ? [
        ...group.memberIndices.slice(currentOrder + 1),
        ...group.memberIndices.slice(0, currentOrder),
      ]
    : group.memberIndices;
  const sameRound = orderedMembers.find((index) => !entries[index].sets?.[setIndex]?.completed);
  if (sameRound !== undefined) return sameRound;
  return group.memberIndices
    .flatMap((index) => (entries[index].sets ?? []).map((set, candidateSetIndex) => ({ index, candidateSetIndex, set })))
    .sort((left, right) => left.candidateSetIndex - right.candidateSetIndex || left.index - right.index)
    .find(({ set }) => !set.completed)?.index;
}

/**
 * Decide o descanso após uma série já concluída. Dentro da rodada não há timer;
 * quando todos os membros da rodada terminaram, há um único descanso do grupo.
 */
export function resolveGroupRestAfterSet(
  workout: Pick<WorkoutSession, 'exercises'>,
  exerciseIndex: number,
  setIndex: number,
): SetRestTransition {
  const exercises = workout.exercises;
  const target = exercises[exerciseIndex];
  const targetSet = target?.sets?.[setIndex];
  const isLastRemainingSet = allSetsCompleted(exercises);
  if (!target || !targetSet || !targetSet.completed || !target.groupId) {
    return { mode: 'none', seconds: 0, isLastRemainingSet };
  }
  const group = getGroupForEntry(exercises, exerciseIndex);
  if (!group) return { mode: 'none', seconds: 0, isLastRemainingSet };

  const sameRoundPending = group.memberIndices.some((index) => (
    index !== exerciseIndex
    && Boolean(exercises[index].sets?.[setIndex])
    && !exercises[index].sets?.[setIndex]?.completed
  ));
  const nextExerciseIndex = nextGroupExerciseIndex(exercises, group, exerciseIndex, setIndex);
  if (sameRoundPending) {
    return {
      mode: 'intra-group',
      seconds: 0,
      round: groupRoundForSet(setIndex),
      nextExerciseIndex,
      isLastRemainingSet,
    };
  }

  return {
    mode: group.restSec > 0 && !isLastRemainingSet ? 'group-round' : 'none',
    seconds: group.restSec,
    round: groupRoundForSet(setIndex) + 1,
    nextExerciseIndex,
    isLastRemainingSet,
  };
}

/** Retorna o próximo cartão relevante, alternando membros antes de avançar a rodada. */
export function nextWorkoutFocusIndex(
  exercises: readonly ActiveExercise[],
  currentIndex = -1,
  setIndex = 0,
): number | undefined {
  const target = exercises[currentIndex];
  if (target?.groupId) {
    const group = getGroupForEntry(exercises, currentIndex);
    if (group) {
      const next = nextGroupExerciseIndex(exercises, group, currentIndex, setIndex);
      if (next !== undefined) return next;
    }
  }
  if (currentIndex < 0) {
    const firstPendingIndex = exercises.findIndex((exercise) => exercise.sets.some((set) => !set.completed));
    if (firstPendingIndex < 0) return undefined;
    const firstGroup = getGroupForEntry(exercises, firstPendingIndex);
    if (firstGroup) {
      const firstPendingGroupSet = firstGroup.memberIndices
        .flatMap((index) => (exercises[index].sets ?? [])
          .map((set, candidateSetIndex) => ({ index, candidateSetIndex, set })))
        .filter(({ set }) => !set.completed)
        .sort((left, right) => left.candidateSetIndex - right.candidateSetIndex || left.index - right.index)[0];
      if (firstPendingGroupSet) return firstPendingGroupSet.index;
    }
    return firstPendingIndex;
  }
  const after = exercises.findIndex((exercise, index) => index > currentIndex && exercise.sets.some((set) => !set.completed));
  if (after >= 0) return after;
  return exercises.findIndex((exercise) => exercise.sets.some((set) => !set.completed)) >= 0
    ? exercises.findIndex((exercise) => exercise.sets.some((set) => !set.completed))
    : undefined;
}
