import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { PlannerView } from './PlannerView';

function collectText(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (typeof node !== 'object') return '';
  const candidate = node as { props?: { children?: unknown }; children?: unknown };
  if (candidate.props?.children !== undefined) {
    return collectText(candidate.props.children);
  }
  return collectText(candidate.children);
}

const mockUseGymFlow = vi.fn();

vi.mock('../providers/GymFlowContext', () => ({
  useGymFlow: () => mockUseGymFlow(),
}));

describe('PlannerView (GOAL-024)', () => {
  it('remove a promessa de IA e exibe "Montar com Assistente"', () => {
    const openPlanAssistant = vi.fn();
    mockUseGymFlow.mockReturnValue({
      user: {
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 4,
        duration: 60,
        gender: 'neutral',
      },
      weeklyPlan: [],
      generateWeeklyPlan: vi.fn(),
      replanMissedWorkout: vi.fn(),
      startWorkout: vi.fn(),
      setWeeklyPlan: vi.fn(),
      updateUserProfile: vi.fn(),
      programs: [],
      exercises: [],
      openWorkoutBuilder: vi.fn(),
      assignDayToWeekday: vi.fn(),
      chooserDayName: null,
      setChooserDayName: vi.fn(),
      planAssistantOpen: false,
      openPlanAssistant,
      closePlanAssistant: vi.fn(),
    });

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlannerView />);
    });

    const text = collectText(renderer!.toJSON());

    // NUNCA deve prometer "Gerar Semana com IA"
    expect(text).not.toContain('Gerar Semana com IA');

    // DEVE exibir "Montar com Assistente"
    expect(text).toContain('Montar com Assistente');
  });

  it('aciona openPlanAssistant ao clicar no botão do assistente', () => {
    const openPlanAssistant = vi.fn();
    const updateUserProfile = vi.fn();
    mockUseGymFlow.mockReturnValue({
      user: {
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 4,
        duration: 60,
        gender: 'neutral',
      },
      weeklyPlan: [],
      generateWeeklyPlan: vi.fn(),
      replanMissedWorkout: vi.fn(),
      startWorkout: vi.fn(),
      setWeeklyPlan: vi.fn(),
      updateUserProfile,
      programs: [],
      exercises: [],
      openWorkoutBuilder: vi.fn(),
      assignDayToWeekday: vi.fn(),
      chooserDayName: null,
      setChooserDayName: vi.fn(),
      planAssistantOpen: false,
      openPlanAssistant,
      closePlanAssistant: vi.fn(),
    });

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PlannerView />);
    });

    // Encontra botões que contenham "Montar com Assistente"
    const buttons = renderer!.root.findAllByType('button');
    const assistantBtn = buttons.find((b) => collectText(b).includes('Montar com Assistente'));
    expect(assistantBtn).toBeDefined();

    act(() => {
      assistantBtn!.props.onClick();
    });

    expect(openPlanAssistant).toHaveBeenCalledTimes(1);
    expect(updateUserProfile).toHaveBeenCalled();
  });
});
