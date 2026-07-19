import { describe, expect, it } from 'vitest';
import type { Exercise } from '../types';
import type { MuscleGroupId } from '../types/training-taxonomy';
import { MOCK_EXERCISES } from '../mock/exercises';
import { filterExercisesByDayFocus } from './workout-builder';
import {
  ALL_EXERCISES_TAB_ID,
  createWorkoutPickerState,
  getDayFocusGroups,
  getWorkoutPickerTabResult,
  getWorkoutPickerTabs,
  groupExercisesForDayFocus,
  workoutPickerReducer,
} from './workout-picker';

function exercise(id: string): Exercise {
  const found = MOCK_EXERCISES.find((item) => item.id === id);
  if (!found) throw new Error(`Exercício de teste ausente: ${id}`);
  return found;
}

const supino = exercise('chest_supino_reto');
const tricepsCorda = exercise('triceps_polia_corda');
const puxada = exercise('back_puxada_pulley');
const rosca = exercise('biceps_rosca_direta');
const flexora = exercise('legs_mesa_flexora');

describe('GOAL-TF-B / PART15 17–22 e 26–27', () => {
  it('PART15-17: normaliza os focos na ordem da taxonomia, sem duplicados ou inválidos', () => {
    const invalid = 'grupo_inexistente' as MuscleGroupId;
    expect(getDayFocusGroups(['triceps', invalid, 'chest', 'triceps'])).toEqual([
      { id: 'chest', label: 'Peito', order: 10 },
      { id: 'triceps', label: 'Tríceps', order: 50 },
    ]);
  });

  it('PART15-18: cria um grupo independente para cada foco válido', () => {
    const groups = groupExercisesForDayFocus([supino, tricepsCorda, puxada], ['triceps', 'chest']);
    expect(groups.map(({ id }) => id)).toEqual(['chest', 'triceps']);
    expect(groups[0].items.map(({ exercise: item }) => item.id)).toEqual([supino.id]);
    expect(groups[1].items.map(({ exercise: item }) => item.id)).toEqual([supino.id, tricepsCorda.id]);
  });

  it('PART15-19: preserva o ExerciseFocusMatch em cada item', () => {
    const [group] = groupExercisesForDayFocus([supino, tricepsCorda], ['triceps']);
    expect(group.items).toEqual([
      {
        exercise: supino,
        match: { matches: true, kind: 'legacy-secondary', legacy: true },
      },
      {
        exercise: tricepsCorda,
        match: { matches: true, kind: 'legacy-primary', legacy: true },
      },
    ]);
  });

  it('PART15-20: o mesmo exercício pode aparecer nos grupos em que realmente casa', () => {
    const groups = groupExercisesForDayFocus([supino], ['chest', 'triceps']);
    expect(groups[0].items[0].match.kind).toBe('legacy-primary');
    expect(groups[1].items[0].match.kind).toBe('legacy-secondary');
  });

  it('PART15-21: mantém a ordem recebida dos exercícios, sem score ou pontuação', () => {
    const input = [tricepsCorda, supino];
    const [group] = groupExercisesForDayFocus(input, ['triceps']);
    expect(group.items.map(({ exercise: item }) => item.id)).toEqual(input.map(({ id }) => id));
  });

  it('PART15-22: preserva a resolução genérica legada por foco', () => {
    const [group] = groupExercisesForDayFocus([flexora], ['quadriceps']);
    expect(group.items[0].match).toEqual({ matches: true, kind: 'legacy-generic', legacy: true });
    expect(group.usesLegacyClassification).toBe(true);
  });

  it('PART15-26: um foco produz [Foco, Todos] e inicia no foco', () => {
    expect(getWorkoutPickerTabs(['chest'])).toEqual([
      { id: 'chest', label: 'Peito' },
      { id: ALL_EXERCISES_TAB_ID, label: 'Todos' },
    ]);
    expect(createWorkoutPickerState(['chest'])).toEqual({ activeTabId: 'chest', search: '' });
  });

  it('PART15-27: zero focos mantém o comportamento Todos', () => {
    expect(getDayFocusGroups([])).toEqual([]);
    expect(groupExercisesForDayFocus(MOCK_EXERCISES, [])).toEqual([]);
    expect(getWorkoutPickerTabs([])).toEqual([{ id: ALL_EXERCISES_TAB_ID, label: 'Todos' }]);
    expect(createWorkoutPickerState([])).toEqual({ activeTabId: ALL_EXERCISES_TAB_ID, search: '' });
  });
});

describe('contratos adicionais do picker por foco', () => {
  it('preserva a assinatura e o resultado público de filterExercisesByDayFocus por delegação', () => {
    const input = [puxada, supino, tricepsCorda];
    const result = filterExercisesByDayFocus(input, ['triceps']);
    expect(result.exercises.map(({ id }) => id)).toEqual([supino.id, tricepsCorda.id]);
    expect(result.usesLegacyClassification).toBe(true);
  });

  it('calcula cada contador com a mesma resolução usada pelo filtro', () => {
    const focusIds: MuscleGroupId[] = ['chest', 'triceps', 'quadriceps'];
    const groups = groupExercisesForDayFocus(MOCK_EXERCISES, focusIds);

    for (const group of groups) {
      const filtered = filterExercisesByDayFocus(MOCK_EXERCISES, [group.id]);
      expect(group.items).toHaveLength(filtered.exercises.length);
      expect(group.items.map(({ exercise: item }) => item.id)).toEqual(
        filtered.exercises.map(({ id }) => id),
      );
    }
  });

  it('aplica a busca dentro da aba selecionada', () => {
    const input = [supino, tricepsCorda, puxada, rosca];
    const groups = groupExercisesForDayFocus(input, ['chest', 'triceps']);

    const inTriceps = getWorkoutPickerTabResult(input, groups, 'triceps', 'supino reto');
    const inChest = getWorkoutPickerTabResult(input, groups, 'chest', 'rosca direta');
    const inAll = getWorkoutPickerTabResult(input, groups, ALL_EXERCISES_TAB_ID, 'puxada aberta');

    expect(inTriceps.items.map(({ exercise: item }) => item.id)).toEqual([supino.id]);
    expect(inChest.items).toEqual([]);
    expect(inAll.items.map(({ exercise: item }) => item.id)).toEqual([puxada.id]);
  });

  it('mantém a busca ao trocar de aba e limpar não troca a aba', () => {
    const searched = workoutPickerReducer(
      createWorkoutPickerState(['chest', 'triceps']),
      { type: 'set-search', search: 'supino' },
    );
    const switched = workoutPickerReducer(searched, { type: 'select-tab', tabId: 'triceps' });
    const cleared = workoutPickerReducer(switched, { type: 'clear-search' });

    expect(switched).toEqual({ activeTabId: 'triceps', search: 'supino' });
    expect(cleared).toEqual({ activeTabId: 'triceps', search: '' });
  });

  it('reinicializa busca e primeira aba ao reabrir', () => {
    const changed = workoutPickerReducer(
      workoutPickerReducer(
        createWorkoutPickerState(['chest', 'triceps']),
        { type: 'set-search', search: 'corda' },
      ),
      { type: 'select-tab', tabId: ALL_EXERCISES_TAB_ID },
    );

    expect(changed).toEqual({ activeTabId: ALL_EXERCISES_TAB_ID, search: 'corda' });
    expect(createWorkoutPickerState(['chest', 'triceps'])).toEqual({
      activeTabId: 'chest',
      search: '',
    });
  });
});
