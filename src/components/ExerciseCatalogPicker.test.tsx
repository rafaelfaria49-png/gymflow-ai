import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExerciseCatalogPicker } from './ExerciseCatalogPicker';
import { MOCK_EXERCISES } from '../mock/exercises';
import { filterExerciseCatalog, getExerciseCatalogTabs, resolveExercisePrimaryGroup } from '../lib/workout-picker';
import { isEligibleWorkoutSubstitute, rankWorkoutSubstitutes } from '../lib/workout-session-mutations';

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => { for (const renderer of mounted.splice(0)) act(() => renderer.unmount()); });
function text(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  const n = node as { children?: unknown; props?: { children?: unknown } };
  return text(n.props?.children ?? n.children);
}
function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(<ExerciseCatalogPicker exercises={MOCK_EXERCISES} onSelect={vi.fn()} />); });
  mounted.push(renderer);
  return renderer;
}

describe('catálogo compartilhado GOAL-119', () => {
  it('cada categoria usa o grupo principal canônico; Peito e Costas não incluem sinergistas', () => {
    const tabs = getExerciseCatalogTabs(MOCK_EXERCISES);
    expect(tabs[0]).toEqual({ id: 'all', label: 'Todos' });
    for (const tab of tabs.slice(1)) {
      const result = filterExerciseCatalog(MOCK_EXERCISES, tab.id);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every(ex => resolveExercisePrimaryGroup(ex)?.id === tab.id)).toBe(true);
    }
    const chest = filterExerciseCatalog(MOCK_EXERCISES, 'chest');
    const back = filterExerciseCatalog(MOCK_EXERCISES, 'back');
    expect(chest.some(ex => back.includes(ex))).toBe(false);
  });
  it('busca sem acento permanece restrita à categoria', () => {
    const result = filterExerciseCatalog(MOCK_EXERCISES, 'triceps', 'triceps');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(ex => resolveExercisePrimaryGroup(ex)?.id === 'triceps')).toBe(true);
    expect(filterExerciseCatalog(MOCK_EXERCISES, 'chest', 'remada')).toEqual([]);
  });
  it('respeita o alvo canônico mesmo quando o muscleGroup legado diverge', () => {
    const source = { ...MOCK_EXERCISES[0], primaryMuscleGroupId: 'back' as const, muscleGroup: 'chest' as const };
    const eligible = { ...MOCK_EXERCISES[1], id: 'eligible', primaryMuscleGroupId: 'back' as const };
    const ineligible = { ...MOCK_EXERCISES[2], id: 'ineligible', primaryMuscleGroupId: 'chest' as const, muscleGroup: 'chest' as const };
    expect(filterExerciseCatalog([source], 'chest')).toEqual([]);
    expect(rankWorkoutSubstitutes(source, [source, eligible, ineligible])).toEqual([eligible]);
    expect(isEligibleWorkoutSubstitute(source, ineligible)).toBe(false);
  });
  it('exibe total, carrega a lista restante e reinicia a página ao filtrar', () => {
    const renderer = render();
    expect(text(renderer.toJSON())).toContain('30 de ' + MOCK_EXERCISES.length);
    const more = () => renderer.root.findAllByType('button').find(b => text(b).startsWith('Carregar mais'));
    act(() => more()!.props.onClick());
    expect(text(renderer.toJSON())).toContain('60 de ' + MOCK_EXERCISES.length);
    const chestButton = renderer.root.findAllByType('button').find(b => text(b) === 'Peito');
    act(() => chestButton!.props.onClick());
    const chestCount = filterExerciseCatalog(MOCK_EXERCISES, 'chest').length;
    expect(text(renderer.toJSON())).toContain(Math.min(30, chestCount) + ' de ' + chestCount);
    act(() => renderer.root.findByType('input').props.onChange({ target: { value: 'remada' } }));
    expect(text(renderer.toJSON())).toContain('0 de 0 exercícios');
    expect(chestButton!.props['aria-pressed']).toBe(true);
  });
});
