import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { EvolutionDashboard } from './EvolutionDashboard';
import type { WorkoutSession } from '../types';

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

const mockSessions: WorkoutSession[] = [
  {
    id: 's-1',
    name: 'Treino A — Peito e Tríceps',
    date: '2026-06-01T12:00:00.000Z',
    duration: 3600,
    calories: 350,
    xpEarned: 150,
    status: 'completed',
    variant: 'standard',
    startedAt: 1_780_315_200_000,
    endedAt: 1_780_315_200_000 + 3600_000,
    totalVolume: 2400,
    exercises: [
      {
        id: 'ex-1',
        exerciseId: 'chest_supino',
        name: 'Supino Reto com Barra',
        muscleGroup: 'chest',
        entryOrigin: 'planned',
        entryStatus: 'performed',
        sets: [
          { id: 's1', reps: 10, weight: 80, completed: true, isWarmup: false },
          { id: 's2', reps: 8, weight: 85, completed: true, isWarmup: false },
        ],
      },
    ],
  },
];

const mockUseGymFlow = vi.fn();

vi.mock('../providers/GymFlowContext', () => ({
  useGymFlow: () => mockUseGymFlow(),
}));

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

describe('EvolutionDashboard (GOAL-31: Evolução v2)', () => {
  it('renderiza painel de evolução v2 com KPIs, roteiro de usabilidade <30s e abas', () => {
    mockUseGymFlow.mockReturnValue({
      user: { xp: 1200, level: 'intermediate' },
      updateUserProfile: vi.fn(),
      weightHistory: [{ date: '2026-06-01', value: 80 }],
      addWeightLog: vi.fn(),
      measurementsHistory: [],
      addMeasurementLog: vi.fn(),
      workoutHistory: mockSessions,
      setActiveView: vi.fn(),
      gymProfile: { machines: [] },
      setGymProfile: vi.fn(),
    });

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<EvolutionDashboard />);
    });

    const text = collectText(renderer!.toJSON());
    expect(text).toContain('Evolução e Análise v2');
    expect(text).toContain('Onde você evoluiu, estagnou ou faltou');
    expect(text).toContain('1. Onde evoluí?');
    expect(text).toContain('2. Onde estagnei?');
    expect(text).toContain('3. O que faltou?');
    expect(text).toContain('Volume Total');
    expect(text).toContain('Conclusão');
    expect(text).toContain('Tempo Médio');
    expect(text).toContain('Semanas Ativas');
    expect(text).toContain('Supino Reto com Barra');
  });

  it('exibe badge de dados antigos quando há sessões pré-v2 no histórico', () => {
    const legacySession: WorkoutSession = {
      id: 'legacy-1',
      name: 'Treino Antigo Sem Telemetria',
      date: '2026-06-01T12:00:00.000Z',
      duration: 1800,
      calories: 120,
      xpEarned: 50,
      exercises: [
        {
          id: 'ex-leg',
          exerciseId: 'puxada',
          name: 'Puxada',
          muscleGroup: 'back',
          sets: [{ id: 's1', reps: 10, weight: 50, completed: true }],
        },
      ],
    } as WorkoutSession;

    mockUseGymFlow.mockReturnValue({
      user: { xp: 500, level: 'beginner' },
      updateUserProfile: vi.fn(),
      weightHistory: [],
      addWeightLog: vi.fn(),
      measurementsHistory: [],
      addMeasurementLog: vi.fn(),
      workoutHistory: [legacySession],
      setActiveView: vi.fn(),
      gymProfile: { machines: [] },
      setGymProfile: vi.fn(),
    });

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<EvolutionDashboard />);
    });

    const text = collectText(renderer!.toJSON());
    expect(text).toContain('dados antigos');
  });

  it('permite alternar para a aba de comparativo de treinos', () => {
    mockUseGymFlow.mockReturnValue({
      user: { xp: 1200, level: 'intermediate' },
      updateUserProfile: vi.fn(),
      weightHistory: [],
      addWeightLog: vi.fn(),
      measurementsHistory: [],
      addMeasurementLog: vi.fn(),
      workoutHistory: mockSessions,
      setActiveView: vi.fn(),
      gymProfile: { machines: [] },
      setGymProfile: vi.fn(),
    });

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<EvolutionDashboard />);
    });

    // Encontra botões de aba
    const buttons = renderer!.root.findAllByType('button');
    const compButton = buttons.find((b) => collectText(b).includes('Comparativo de Treinos'));
    expect(compButton).toBeDefined();

    act(() => {
      compButton!.props.onClick();
    });

    const text = collectText(renderer!.toJSON());
    expect(text).toContain('Comparativo de Treinos Equivalentes');
  });
});
