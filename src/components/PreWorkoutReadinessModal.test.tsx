import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { PreWorkoutReadinessModal } from './PreWorkoutReadinessModal';
import type { WorkoutSession } from '../types';

const mockSession: WorkoutSession = {
  id: 'sess_1',
  name: 'Treino A — Peitoral',
  date: '2026-09-02',
  duration: 0,
  calories: 0,
  plannedDuration: 50,
  sourceProgramDayId: 'day_a',
  sourceProgramId: 'prog_1',
  exercises: [
    {
      id: 'ex_1',
      exerciseId: 'chest_supino',
      name: 'Supino Reto',
      muscleGroup: 'chest',
      sets: [{ id: 's1', reps: 10, weight: 80, completed: false }],
    },
  ],
  xpEarned: 0,
};

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

function chooseRemainingAnswers(root: TestRenderer.ReactTestInstance) {
  for (const label of ['Nenhuma', 'Baixo', 'Livre']) {
    const button = root.findAllByType('button').find(b => collectText(b.props.children).includes(label));
    act(() => button!.props.onClick());
  }
}

describe('PreWorkoutReadinessModal (GOAL-30)', () => {
  it('não renderiza nada quando isOpen é false', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <PreWorkoutReadinessModal
          isOpen={false}
          session={mockSession}
          onComplete={vi.fn()}
          onSkip={vi.fn()}
          onApplySuggestion={vi.fn()}
          onDismissSuggestion={vi.fn()}
        />,
      );
    });
    expect(renderer!.toJSON()).toBeNull();
  });

  it('1 toque em "Pular" aciona onSkip imediatamente (zero bloqueio de treino)', () => {
    const onSkip = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <PreWorkoutReadinessModal
          isOpen={true}
          session={mockSession}
          onComplete={vi.fn()}
          onSkip={onSkip}
          onApplySuggestion={vi.fn()}
          onDismissSuggestion={vi.fn()}
        />,
      );
    });

    const root = renderer!.root;
    const skipButtons = root.findAllByType('button').filter((btn) => {
      const text = collectText(btn.props.children);
      return /pular/i.test(text);
    });

    expect(skipButtons).toHaveLength(1);
    act(() => {
      skipButtons[0].props.onClick();
    });
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('quando tudo estiver OK, conclui direto chamando onComplete sem mensagens de bloqueio', () => {
    const onComplete = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <PreWorkoutReadinessModal
          isOpen={true}
          session={mockSession}
          onComplete={onComplete}
          onSkip={vi.fn()}
          onApplySuggestion={vi.fn()}
          onDismissSuggestion={vi.fn()}
        />,
      );
    });

    const root = renderer!.root;
    // Clica em Alta energia
    const highEnergyBtn = root.findAllByType('button').find((b) => collectText(b.props.children).includes('Alta'));
    expect(highEnergyBtn).toBeDefined();
    act(() => {
      highEnergyBtn!.props.onClick();
    });

    // Clica em Ótimo sono
    const goodSleepBtn = root.findAllByType('button').find((b) => collectText(b.props.children).includes('Ótimo'));
    expect(goodSleepBtn).toBeDefined();
    act(() => {
      goodSleepBtn!.props.onClick();
    });

    // Clica em Concluir Check-in
    chooseRemainingAnswers(root);
    const submitBtn = root.findAllByType('button').find((b) => collectText(b.props.children).includes('Concluir Check-in'));
    expect(submitBtn).toBeDefined();
    act(() => {
      submitBtn!.props.onClick();
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    const assessment = onComplete.mock.calls[0][0];
    expect(assessment.status).toBe('all-good');
    expect(assessment.level).toBe('optimal');
    expect(assessment.score).toBeGreaterThanOrEqual(95);
  });

  it('exibe sugestão de redução de volume para energia baixa / sono ruim e permite aplicar em 1 toque', () => {
    const onComplete = vi.fn();
    const onApplySuggestion = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <PreWorkoutReadinessModal
          isOpen={true}
          session={mockSession}
          onComplete={onComplete}
          onSkip={vi.fn()}
          onApplySuggestion={onApplySuggestion}
          onDismissSuggestion={vi.fn()}
        />,
      );
    });

    const root = renderer!.root;
    // Clica em Baixa energia
    const lowEnergyBtn = root.findAllByType('button').find((b) => collectText(b.props.children).includes('Baixa'));
    act(() => {
      lowEnergyBtn!.props.onClick();
    });

    // Clica em Sono Ruim
    const poorSleepBtn = root.findAllByType('button').find((b) => collectText(b.props.children).includes('Ruim'));
    act(() => {
      poorSleepBtn!.props.onClick();
    });

    // Clica em Concluir Check-in
    chooseRemainingAnswers(root);
    const submitBtn = root.findAllByType('button').find((b) => collectText(b.props.children).includes('Concluir Check-in'));
    act(() => {
      submitBtn!.props.onClick();
    });

    // Deve exibir sugestão de Redução Suave de Volume
    const text = collectText(renderer!.toJSON());
    expect(text).toContain('Redução Suave de Volume');

    // Botão de 1 toque para aplicar
    const applyBtn = root.findAllByType('button').find((b) => collectText(b.props.children).includes('Reduzir 1 Série'));
    expect(applyBtn).toBeDefined();
    act(() => {
      applyBtn!.props.onClick();
    });

    expect(onApplySuggestion).toHaveBeenCalledTimes(1);
    expect(onApplySuggestion.mock.calls[0][0].type).toBe('reduce-volume');
  });

  it('permite recusar a sugestão chamando onDismissSuggestion e não insiste na mesma sessão', () => {
    const onDismissSuggestion = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <PreWorkoutReadinessModal
          isOpen={true}
          session={mockSession}
          dismissedSuggestionIds={[]}
          onComplete={vi.fn()}
          onSkip={vi.fn()}
          onApplySuggestion={vi.fn()}
          onDismissSuggestion={onDismissSuggestion}
        />,
      );
    });

    const root = renderer!.root;
    const lowEnergyBtn = root.findAllByType('button').find((b) => collectText(b.props.children).includes('Baixa'));
    act(() => {
      lowEnergyBtn!.props.onClick();
    });

    const poorSleepBtn = root.findAllByType('button').find((b) => collectText(b.props.children).includes('Ruim'));
    act(() => {
      poorSleepBtn!.props.onClick();
    });

    chooseRemainingAnswers(root);
    const submitBtn = root.findAllByType('button').find((b) => collectText(b.props.children).includes('Concluir Check-in'));
    act(() => {
      submitBtn!.props.onClick();
    });

    const dismissBtn = root.findAllByType('button').find((b) => collectText(b.props.children).includes('Manter Volume Original'));
    expect(dismissBtn).toBeDefined();
    act(() => {
      dismissBtn!.props.onClick();
    });

    expect(onDismissSuggestion).toHaveBeenCalledWith('sugg_reduce_volume');

    // Ao atualizar dismissedSuggestionIds, a sugestão não reaparece
    act(() => {
      renderer.update(
        <PreWorkoutReadinessModal
          isOpen={true}
          session={mockSession}
          dismissedSuggestionIds={['sugg_reduce_volume']}
          onComplete={vi.fn()}
          onSkip={vi.fn()}
          onApplySuggestion={vi.fn()}
          onDismissSuggestion={onDismissSuggestion}
        />,
      );
    });

    const textAfter = collectText(renderer!.toJSON());
    expect(textAfter).not.toContain('Redução Suave de Volume');
    expect(textAfter).toContain('Sugestões dispensadas');
  });
});

describe('GOAL-119 — respostas explícitas', () => {
  it('inicia sem seleção, recusa envio parcial e pula uma única vez sem gravar respostas', () => {
    const onComplete = vi.fn(), onSkip = vi.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<PreWorkoutReadinessModal isOpen session={mockSession} onComplete={onComplete} onSkip={onSkip} onApplySuggestion={vi.fn()} onDismissSuggestion={vi.fn()} />); });
    expect(collectText(renderer.toJSON())).toContain('Como você está hoje?');
    expect(renderer.root.findAllByType('button').filter(b => b.props['aria-pressed'])).toHaveLength(0);
    const submit = renderer.root.findAllByType('button').find(b => collectText(b).includes('Escolha as 5 respostas'));
    expect(submit!.props.disabled).toBe(true);
    act(() => submit!.props.onClick());
    expect(onComplete).not.toHaveBeenCalled();
    const skip = renderer.root.findAllByType('button').filter(b => collectText(b) === 'Pular');
    expect(skip).toHaveLength(1);
    act(() => { skip[0].props.onClick(); skip[0].props.onClick(); });
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });
  it('não preenche local da dor nem tempo livre e reseta ao reabrir', () => {
    const onComplete = vi.fn();
    const props = { session: mockSession, onComplete, onSkip: vi.fn(), onApplySuggestion: vi.fn(), onDismissSuggestion: vi.fn() };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<PreWorkoutReadinessModal {...props} isOpen />); });
    for (const label of ['Alta','Ótimo','Nenhuma','Baixo','Livre']) {
      const button = renderer.root.findAllByType('button').find(b => collectText(b.props.children).includes(label));
      act(() => button!.props.onClick());
    }
    const submit = renderer.root.findAllByType('button').find(b => collectText(b).includes('Concluir Check-in'));
    act(() => { submit!.props.onClick(); submit!.props.onClick(); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].checkIn.sorenessLocation).toBeUndefined();
    expect(onComplete.mock.calls[0][0].checkIn.timeAvailableMinutes).toBeUndefined();
    act(() => renderer.update(<PreWorkoutReadinessModal {...props} isOpen={false} />));
    act(() => renderer.update(<PreWorkoutReadinessModal {...props} isOpen />));
    expect(renderer.root.findAllByType('button').filter(b => b.props['aria-pressed'])).toHaveLength(0);
    act(() => renderer.unmount());
  });
});
