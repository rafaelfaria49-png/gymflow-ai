import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BottomNavigation } from './Navigation';

// GOAL-049: teste focado do CTA Treinar/Continuar. O contexto real carrega storage,
// então mockamos apenas o hook usado pelo Navigation.
const mockSetActiveView = vi.hoisted(() => vi.fn());
const mockUseGymFlow = vi.hoisted(() => vi.fn());

vi.mock('../providers/GymFlowContext', () => ({
  useGymFlow: mockUseGymFlow,
}));

vi.mock('../lib/back-navigation', () => ({
  useBackHandler: () => {},
}));

function buildContext(overrides: Record<string, unknown> = {}) {
  return {
    activeView: 'dashboard',
    setActiveView: mockSetActiveView,
    user: { name: 'Rafael', email: 'rafael.demo@gymflow.ai', streak: 3, xp: 1200 },
    activeWorkout: null,
    chooserDayName: null,
    planAssistantOpen: false,
    ...overrides,
  };
}

interface TestNode {
  props?: Record<string, unknown>;
  children?: unknown;
}

function findAllByAriaLabel(node: unknown, ariaLabel: string): TestNode[] {
  const found: TestNode[] = [];
  const visit = (current: unknown) => {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (current && typeof current === 'object') {
      const candidate = current as TestNode;
      if (candidate.props?.['aria-label'] === ariaLabel) found.push(candidate);
      if (candidate.children !== undefined) visit(candidate.children);
    }
  };
  visit(node);
  return found;
}

function renderBottomNavigation(context: Record<string, unknown>) {
  mockUseGymFlow.mockReturnValue(context);
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<BottomNavigation />);
  });
  return renderer!;
}

describe('BottomNavigation — FAB Treinar/Continuar (GOAL-049)', () => {
  beforeEach(() => {
    mockSetActiveView.mockClear();
  });

  it('FAB_WITHOUT_ACTIVE: sem treino ativo mostra "Treinar" com aria-label "Iniciar treino" e leva à lista de treinos', () => {
    const renderer = renderBottomNavigation(buildContext());

    const fab = findAllByAriaLabel(renderer.toJSON(), 'Iniciar treino');
    expect(fab).toHaveLength(1);

    const text: string[] = [];
    const collect = (node: unknown) => {
      if (typeof node === 'string') text.push(node);
      if (Array.isArray(node)) node.forEach(collect);
      if (node && typeof node === 'object') collect((node as TestNode).children);
    };
    collect(fab[0].children);
    expect(text.join('')).toContain('Treinar');

    const onFabClick = fab[0].props!['onClick'] as () => void;
    act(() => {
      onFabClick();
    });
    expect(mockSetActiveView).toHaveBeenCalledWith('workouts');
  });

  it('FAB_WITH_ACTIVE: com treino ativo mostra "Continuar" com aria-label "Continuar treino" e leva ao active-workout', () => {
    const activeWorkout = {
      id: 'sess_1',
      name: 'Treino A — Peitoral',
      date: '2026-09-10',
      duration: 0,
      calories: 0,
      exercises: [],
      xpEarned: 0,
    };
    const renderer = renderBottomNavigation(buildContext({ activeWorkout }));

    const fab = findAllByAriaLabel(renderer.toJSON(), 'Continuar treino');
    expect(fab).toHaveLength(1);

    const text: string[] = [];
    const collect = (node: unknown) => {
      if (typeof node === 'string') text.push(node);
      if (Array.isArray(node)) node.forEach(collect);
      if (node && typeof node === 'object') collect((node as TestNode).children);
    };
    collect(fab[0].children);
    expect(text.join('')).toContain('Continuar');

    const onFabClick = fab[0].props!['onClick'] as () => void;
    act(() => {
      onFabClick();
    });
    expect(mockSetActiveView).toHaveBeenCalledWith('active-workout');
  });

  it('FAB_ROUTING: FAB é ocultado nas views de foco (active-workout, builder, planner) e com modal aberto', () => {
    const hiddenCases = [
      { activeView: 'active-workout' },
      { activeView: 'workout-builder' },
      { activeView: 'planner' },
      { chooserDayName: 'Push A' },
      { planAssistantOpen: true },
    ];

    for (const overrides of hiddenCases) {
      const renderer = renderBottomNavigation(buildContext(overrides));
      const labels = ['Iniciar treino', 'Continuar treino'];
      const found = labels.flatMap((label) => findAllByAriaLabel(renderer.toJSON(), label));
      expect(found, `FAB deveria estar oculto em ${JSON.stringify(overrides)}`).toHaveLength(0);
    }
  });
});
