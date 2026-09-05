import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { WorkoutsTab } from './WorkoutsTab';
import { MOCK_PROGRAMS } from '../mock/programs';
import { MOCK_EXERCISES } from '../mock/exercises';

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

describe('WorkoutsTab — Hub de Treinos (GOAL-024)', () => {
  const baseContext = {
    programs: MOCK_PROGRAMS,
    exercises: MOCK_EXERCISES,
    startWorkout: vi.fn(),
    applyProgramToWeek: vi.fn(),
    user: {
      goal: 'hypertrophy',
      level: 'intermediate',
      frequency: 4,
      duration: 60,
    },
    openWorkoutBuilder: vi.fn(),
    workoutsTab: 'suggested',
    setWorkoutsTab: vi.fn(),
    lastSavedProgramId: null,
    weeklyPlan: [],
    duplicateProgram: vi.fn(),
    createProgramFromBase: vi.fn(),
    deleteCustomProgram: vi.fn(),
    planAssistantOpen: false,
    openPlanAssistant: vi.fn(),
    closePlanAssistant: vi.fn(),
  };

  it('renderiza as 4 áreas principais: Para você, Programas prontos, Meus treinos, Montar do zero', () => {
    mockUseGymFlow.mockReturnValue(baseContext);

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<WorkoutsTab />);
    });

    const text = collectText(renderer!.toJSON());
    expect(text).toContain('Para você');
    expect(text).toContain('Programas prontos');
    expect(text).toContain('Meus treinos');
    expect(text).toContain('Montar do zero');
  });

  it('inicia na seção "Para você" com o card de destaque do Assistente e recomendações', () => {
    mockUseGymFlow.mockReturnValue(baseContext);

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<WorkoutsTab />);
    });

    const text = collectText(renderer!.toJSON());
    expect(text).toContain('Monte sua Ficha com o Assistente de Treino');
    expect(text).toContain('Iniciar Assistente de Plano');
    expect(text).toContain('Programas que Combinam com Você');
    expect(text).toContain('Combina com você');
  });

  it('alterna para "Programas prontos" e exibe programas da biblioteca com filtros', () => {
    mockUseGymFlow.mockReturnValue(baseContext);

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<WorkoutsTab />);
    });

    // Clica no botão da aba "Programas prontos"
    const buttons = renderer!.root.findAllByType('button');
    const readyBtn = buttons.find((b) => collectText(b).trim() === 'Programas prontos');
    expect(readyBtn).toBeDefined();

    act(() => {
      readyBtn!.props.onClick();
    });

    const text = collectText(renderer!.toJSON());
    expect(text).toContain('Todos os níveis');
    expect(text).toContain('Todas as frequências');
    expect(text).toContain('Todos os objetivos');
  });

  it('alterna para "Montar do zero" e exibe as 3 opções do Construtor e templates estruturais', () => {
    mockUseGymFlow.mockReturnValue(baseContext);

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<WorkoutsTab />);
    });

    const buttons = renderer!.root.findAllByType('button');
    const scratchBtn = buttons.find((b) => collectText(b).trim() === 'Montar do zero');
    expect(scratchBtn).toBeDefined();

    act(() => {
      scratchBtn!.props.onClick();
    });

    const text = collectText(renderer!.toJSON());
    expect(text).toContain('Programa em Branco');
    expect(text).toContain('Usar Minha Frequência');
    expect(text).toContain('Começar com Template');
    expect(text).toContain('Templates Estruturais Catalogados');
    expect(text).toContain('Corpo inteiro — 2 dias');
  });

  it('ao voltar do construtor após salvar (workoutsTab="mine"), inicializa em "Meus treinos"', () => {
    mockUseGymFlow.mockReturnValue({
      ...baseContext,
      workoutsTab: 'mine',
      programs: [
        ...MOCK_PROGRAMS,
        {
          id: 'custom-1',
          name: 'Meu Treino Personalizado ABC',
          level: 'intermediate',
          objective: 'hypertrophy',
          frequencyDays: 3,
          durationWeeks: 4,
          repeatWeeks: true,
          isCustom: true,
          weeks: [{ number: 1, days: [] }],
        },
      ],
    });

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<WorkoutsTab />);
    });

    const text = collectText(renderer!.toJSON());
    expect(text).toContain('Meu Treino Personalizado ABC');
    expect(text).toContain('Personalizado');
  });

  it('filtra programas prontos por objetivo usando chave canônica', () => {
    mockUseGymFlow.mockReturnValue(baseContext);

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<WorkoutsTab />);
    });

    // Clica em Programas prontos
    const buttons = renderer!.root.findAllByType('button');
    const readyBtn = buttons.find((b) => collectText(b).trim() === 'Programas prontos');
    act(() => {
      readyBtn!.props.onClick();
    });

    // Encontra o select de objetivo
    const selects = renderer!.root.findAllByType('select');
    const goalSelect = selects.find((s) => s.props['aria-label'] === 'Filtrar por objetivo');
    expect(goalSelect).toBeDefined();

    // Filtra por força
    act(() => {
      goalSelect!.props.onChange({ target: { value: 'strength' } });
    });

    const text = collectText(renderer!.toJSON());
    // Deve conter programas de força
    expect(text).toContain('Força Máxima de Powerlifting');
    expect(text).toContain('Powerbuilding');
    // Não deve conter máquinas guiadas
    expect(text).not.toContain('Aprendendo Máquinas Guiadas');
  });
});
