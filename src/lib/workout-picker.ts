import type { Exercise } from '../types';
import type { MuscleGroupId } from '../types/training-taxonomy';
import { matchesExerciseSearch } from './exerciseSearch';
import { MUSCLE_GROUPS } from './training-taxonomy';
import {
  matchesDayFocus,
  type DayFocusFilterResult,
  type ExerciseFocusMatch,
} from './workout-builder';

export const ALL_EXERCISES_TAB_ID = 'all' as const;

export type WorkoutPickerTabId = MuscleGroupId | typeof ALL_EXERCISES_TAB_ID;

export interface DayFocusGroup {
  id: MuscleGroupId;
  label: string;
  order: number;
}

export interface DayFocusExerciseItem {
  exercise: Exercise;
  match: ExerciseFocusMatch;
}

export interface DayFocusExerciseGroup extends DayFocusGroup {
  items: DayFocusExerciseItem[];
  usesLegacyClassification: boolean;
}

export interface WorkoutPickerTab {
  id: WorkoutPickerTabId;
  label: string;
}

export interface WorkoutPickerTabResult {
  items: DayFocusExerciseItem[];
  usesLegacyClassification: boolean;
}

export interface WorkoutPickerState {
  activeTabId: WorkoutPickerTabId;
  search: string;
}

export type WorkoutPickerAction =
  | { type: 'select-tab'; tabId: WorkoutPickerTabId }
  | { type: 'set-search'; search: string }
  | { type: 'clear-search' };

/** Remove focos inválidos/duplicados e devolve os válidos na ordem canônica da taxonomia. */
export function getDayFocusGroups(focusIds: readonly MuscleGroupId[]): DayFocusGroup[] {
  const selected = new Set<MuscleGroupId>(focusIds);
  return MUSCLE_GROUPS
    .filter((definition) => selected.has(definition.id))
    .map(({ id, label, order }) => ({ id, label, order }));
}

/**
 * Resolve cada foco isoladamente e preserva o match que incluiu cada exercício.
 * A ordem dos exercícios é sempre a ordem de entrada: não existe score nem ranking.
 */
export function groupExercisesForDayFocus(
  exercises: readonly Exercise[],
  focusIds: readonly MuscleGroupId[],
): DayFocusExerciseGroup[] {
  return getDayFocusGroups(focusIds).map((group) => {
    const items = exercises.reduce<DayFocusExerciseItem[]>((matched, exercise) => {
      const match = matchesDayFocus(exercise, [group.id]);
      if (match.matches) matched.push({ exercise, match });
      return matched;
    }, []);

    return {
      ...group,
      items,
      usesLegacyClassification: items.some(({ match }) => match.legacy),
    };
  });
}

/** Abas visíveis do picker: um chip por foco válido e `Todos` sempre por último. */
export function getWorkoutPickerTabs(focusIds: readonly MuscleGroupId[]): WorkoutPickerTab[] {
  return [
    ...getDayFocusGroups(focusIds).map(({ id, label }) => ({ id, label })),
    { id: ALL_EXERCISES_TAB_ID, label: 'Todos' },
  ];
}

/** Estado inicial usado a cada montagem/abertura do conteúdo do modal. */
export function createWorkoutPickerState(focusIds: readonly MuscleGroupId[]): WorkoutPickerState {
  const firstFocus = getDayFocusGroups(focusIds)[0];
  return {
    activeTabId: firstFocus?.id ?? ALL_EXERCISES_TAB_ID,
    search: '',
  };
}

/** Alterações de busca nunca mudam a aba e alterações de aba nunca apagam a busca. */
export function workoutPickerReducer(
  state: WorkoutPickerState,
  action: WorkoutPickerAction,
): WorkoutPickerState {
  switch (action.type) {
    case 'select-tab':
      return { ...state, activeTabId: action.tabId };
    case 'set-search':
      return { ...state, search: action.search };
    case 'clear-search':
      return { ...state, search: '' };
  }
}

/**
 * Aplica a busca somente depois de resolver a aba. O aviso legado considera toda a
 * aba, como o filtro anterior, e não desaparece por causa de um termo de busca.
 */
export function getWorkoutPickerTabResult(
  exercises: readonly Exercise[],
  groups: readonly DayFocusExerciseGroup[],
  tabId: WorkoutPickerTabId,
  search: string,
): WorkoutPickerTabResult {
  if (tabId === ALL_EXERCISES_TAB_ID) {
    return {
      items: exercises
        .filter((exercise) => matchesExerciseSearch(exercise, search))
        .map((exercise) => ({ exercise, match: matchesDayFocus(exercise, []) })),
      usesLegacyClassification: false,
    };
  }

  const group = groups.find(({ id }) => id === tabId);
  if (!group) return { items: [], usesLegacyClassification: false };

  return {
    items: group.items.filter(({ exercise }) => matchesExerciseSearch(exercise, search)),
    usesLegacyClassification: group.usesLegacyClassification,
  };
}

/** Implementação compartilhada pelo adaptador público legado em workout-builder.ts. */
export function buildDayFocusFilterResult(
  exercises: readonly Exercise[],
  focusIds: readonly MuscleGroupId[],
): DayFocusFilterResult {
  if (focusIds.length === 0) {
    return { exercises: [...exercises], usesLegacyClassification: false };
  }

  let usesLegacyClassification = false;
  const matched = exercises.filter((exercise) => {
    const match = matchesDayFocus(exercise, focusIds);
    if (match.matches && match.legacy) usesLegacyClassification = true;
    return match.matches;
  });

  return { exercises: matched, usesLegacyClassification };
}
