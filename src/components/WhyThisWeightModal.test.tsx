import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { WhyThisWeightModal } from './WhyThisWeightModal';
import type { ActiveExercise } from '../types';
import type { ProgressionDecision } from '../domain/progressionEngine';

const mockDecision: ProgressionDecision = {
  pesoKg: 42.5,
  repsAlvo: 8,
  reasonCode: 'progress-weight',
  reasonText: 'Faixa completa (10 reps em todas as séries) com RIR 2 ≥ 2 — subir 2.5 kg e voltar ao piso da faixa.',
  motivo: 'Faixa completa (10 reps em todas as séries) com RIR 2 ≥ 2 — subir 2.5 kg e voltar ao piso da faixa.',
  action: 'progress',
  source: 'v2',
  changed: true,
  previousWeightKg: 40,
  targetRPE: 8,
  targetRIR: 2,
  effortSource: 'rir',
};

const mockExercise: ActiveExercise = {
  id: 'ex_active_1',
  exerciseId: 'chest_supino_reto',
  name: 'Supino Reto com Barra',
  muscleGroup: 'Peito',
  repRange: [8, 10],
  targetRPE: 8,
  progressionNote: mockDecision.reasonText,
  progressionDecision: mockDecision,
  progressionComparison: {
    legacy: {
      ...mockDecision,
      source: 'legacy',
      reasonText: 'Faixa completa (10 reps em todas as séries) — subir 2.5 kg e voltar ao piso.',
    },
    v2: mockDecision,
  },
  sets: [
    { id: 's1', reps: 10, weight: 40, completed: true, rir: 2 },
    { id: 's2', reps: 10, weight: 40, completed: true, rir: 2 },
  ],
};

function collectText(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (typeof node !== 'object') return '';
  return collectText((node as { children?: unknown }).children);
}

describe('WhyThisWeightModal', () => {
  it('não renderiza nada quando isOpen é false', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WhyThisWeightModal exercise={mockExercise} isOpen={false} onClose={() => {}} />,
      );
    });
    expect(renderer!.toJSON()).toBeNull();
  });

  it('renderiza o título, sugestão, motivo, fatores e comparativo quando aberto', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WhyThisWeightModal exercise={mockExercise} isOpen={true} onClose={() => {}} />,
      );
    });
    const text = collectText(renderer!.toJSON());

    expect(text).toContain('Por que esse peso?');
    expect(text).toContain('Supino Reto com Barra');
    expect(text).toContain('42.5 kg');
    expect(text).toContain('Subir Carga');
    expect(text).toContain('Faixa completa');
    expect(text).toContain('regra: progress-weight');
    expect(text).toContain('40 kg');
    expect(text).toContain('8 a 10 reps');
    expect(text).toContain('RIR (meta: ≥ 2)');
    expect(text).toContain('Comparativo de Transparência (v1 × v2)');
    expect(text).toContain('Motor v2 (Novo)');
    expect(text).toContain('Motor v1 (Legado)');
  });

  it('aciona onClose ao clicar no botão fechar', () => {
    const handleClose = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WhyThisWeightModal exercise={mockExercise} isOpen={true} onClose={handleClose} />,
      );
    });

    const root = renderer!.root;
    const closeButtons = root.findAllByType('button').filter((btn) => {
      const label = btn.props['aria-label'];
      const text = collectText(btn.props.children);
      return label === 'Fechar explicação de carga' || text.trim() === 'Fechar';
    });

    expect(closeButtons.length).toBeGreaterThanOrEqual(2);
    act(() => {
      closeButtons[0].props.onClick();
    });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('permite acionar onApplyWeightToAllSets com uma carga manual', () => {
    const handleApply = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WhyThisWeightModal
          exercise={mockExercise}
          isOpen={true}
          onClose={() => {}}
          onApplyWeightToAllSets={handleApply}
        />,
      );
    });

    const root = renderer!.root;
    const input = root.findByType('input');
    act(() => {
      input.props.onChange({ target: { value: '45' } });
    });

    const form = root.findByType('form');
    act(() => {
      form.props.onSubmit({ preventDefault: () => {} });
    });

    expect(handleApply).toHaveBeenCalledWith(45);
    const text = collectText(renderer!.toJSON());
    expect(text).toContain('Carga de 45 kg aplicada às séries deste exercício.');
  });
});
