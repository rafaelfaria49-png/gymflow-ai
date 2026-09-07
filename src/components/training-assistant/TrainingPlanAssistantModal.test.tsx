import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { TrainingPlanAssistantModal } from './TrainingPlanAssistantModal';
import { MOCK_EXERCISES } from '../../mock/exercises';

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

vi.mock('../../providers/GymFlowContext', () => ({
  useGymFlow: () => mockUseGymFlow(),
}));

describe('TrainingPlanAssistantModal (GOAL-024)', () => {
  const baseContext = {
    user: {
      goal: 'hypertrophy',
      level: 'intermediate',
      frequency: 4,
      duration: 60,
    },
    exercises: MOCK_EXERCISES,
    gymProfile: null,
    saveCustomProgram: vi.fn(),
    applyProgramToWeek: vi.fn(),
    openWorkoutBuilder: vi.fn(),
    setActiveView: vi.fn(),
    setWorkoutsTab: vi.fn(),
  };

  it('renderiza os parâmetros pré-preenchidos a partir do perfil do usuário', () => {
    mockUseGymFlow.mockReturnValue(baseContext);

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <TrainingPlanAssistantModal isOpen={true} onClose={vi.fn()} />,
      );
    });

    const text = collectText(renderer!.toJSON());
    expect(text).toContain('Assistente de Plano de Treino');
    expect(text).toContain('Configuração orientada pelo seu perfil real');
    expect(text).toContain('Gerar Divisão Semanal');
  });

  it('permite selecionar até 3 grupos prioritários e avançar para o preview de divisão', () => {
    mockUseGymFlow.mockReturnValue(baseContext);

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <TrainingPlanAssistantModal isOpen={true} onClose={vi.fn()} />,
      );
    });

    // Seleciona Peito como prioridade
    const buttons = renderer!.root.findAllByType('button');
    const peitoBtn = buttons.find((b) => collectText(b).trim() === 'Peito');
    expect(peitoBtn).toBeDefined();

    act(() => {
      peitoBtn!.props.onClick();
    });

    // Clica em Gerar Divisão Semanal
    const generateBtn = buttons.find((b) => collectText(b).includes('Gerar Divisão Semanal'));
    expect(generateBtn).toBeDefined();

    act(() => {
      generateBtn!.props.onClick();
    });

    const text = collectText(renderer!.toJSON());
    expect(text).toContain('Proposta de Divisão Semanal');
    expect(text).toContain('Usar Esta Divisão');
    expect(text).toContain('Gerar Outra Opção');
  });

  it('avança para o preview de exercícios e salva programa em Meus Treinos', () => {
    const saveCustomProgram = vi.fn();
    mockUseGymFlow.mockReturnValue({
      ...baseContext,
      saveCustomProgram,
    });

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <TrainingPlanAssistantModal isOpen={true} onClose={vi.fn()} />,
      );
    });

    // Passo 1 -> Passo 2
    let buttons = renderer!.root.findAllByType('button');
    const generateBtn = buttons.find((b) => collectText(b).includes('Gerar Divisão Semanal'));
    act(() => {
      generateBtn!.props.onClick();
    });

    // Passo 2 -> Passo 3
    buttons = renderer!.root.findAllByType('button');
    const useSplitBtn = buttons.find((b) => collectText(b).includes('Usar Esta Divisão'));
    expect(useSplitBtn).toBeDefined();

    act(() => {
      useSplitBtn!.props.onClick();
    });

    let text = collectText(renderer!.toJSON());
    expect(text).toContain('Plano Completo Gerado');
    expect(text).toContain('Salvar em Meus Treinos');
    expect(text).toContain('Salvar e Aplicar à Semana');
    expect(text).toContain('Editar no Construtor');

    // Clica em Salvar em Meus Treinos
    buttons = renderer!.root.findAllByType('button');
    const saveBtn = buttons.find((b) => collectText(b).includes('Salvar em Meus Treinos'));
    expect(saveBtn).toBeDefined();

    act(() => {
      saveBtn!.props.onClick();
    });

    expect(saveCustomProgram).toHaveBeenCalledTimes(1);
    const savedProgram = saveCustomProgram.mock.calls[0][0];
    expect(savedProgram.isCustom).toBe(true);
    expect(savedProgram.weeks[0].days.length).toBeGreaterThanOrEqual(2);
  });

  it('exibe aviso honesto e transparente sobre restrições do usuário', () => {
    mockUseGymFlow.mockReturnValue({
      ...baseContext,
      user: {
        ...baseContext.user,
        restrictions: ['Ombro direito', 'Lombar'],
      },
    });

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <TrainingPlanAssistantModal isOpen={true} onClose={vi.fn()} />,
      );
    });

    const text = collectText(renderer!.toJSON());
    expect(text).toContain('Restrições informadas — revise os exercícios antes de aplicar (Ombro direito, Lombar).');
  });
});
