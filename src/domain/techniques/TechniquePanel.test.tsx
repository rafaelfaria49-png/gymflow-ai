import React, { useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TechniquePanel } from './TechniquePanel';
import type { TechniqueLog, TechniquePlan } from './types';

afterEach(() => vi.useRealTimers());

describe('TechniquePanel — proteção de toque duplo', () => {
  it.each([
    { plan: { type: 'drop_set' } as TechniquePlan, log: { type: 'drop_set', stages: [{ id: 'stage', index: 0, weight: 20, reps: 10, completed: false, failed: false, restSec: 0, pauseSec: 0 }] } as TechniqueLog, label: 'estágio', field: 'stages', input: 'Carga do estágio 1' },
    { plan: { type: 'rest_pause' } as TechniquePlan, log: { type: 'rest_pause', sets: [{ id: 'base', index: 0, weight: 20, reps: 10, completed: true }], miniSets: [{ id: 'mini', index: 0, reps: 5, restSec: 0, completed: false }] } as TechniqueLog, label: 'mini-série', field: 'miniSets', input: 'Repetições da mini-série 1' },
    { plan: { type: 'to_failure' } as TechniquePlan, log: { type: 'to_failure', sets: [{ id: 'set', index: 0, weight: 20, reps: 10, completed: false }] } as TechniqueLog, label: 'série especial', field: 'sets', input: 'Carga da série especial 1' },
  ])('preserva a conclusão de $label após render, sem bloquear edição', ({ plan, log, label, field, input }) => {
    vi.useFakeTimers();
    let latest = log;
    const onChange = vi.fn();
    function Harness() {
      const [state, setState] = useState(log);
      latest = state;
      return <TechniquePanel plan={plan} log={state} level="advanced" onUnlock={vi.fn()} onChange={(next) => { onChange(next); setState(next); }} />;
    }
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<Harness />); });
    const button = () => renderer.root.findAllByType('button').find(node => node.props['aria-label']?.endsWith(label + ' 1'))!;
    act(() => button().props.onClick());
    act(() => button().props.onClick());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(latest[field as 'sets']?.[0].completed).toBe(true);
    act(() => renderer.root.findByProps({ 'aria-label': input }).props.onChange({ target: { value: '12' } }));
    expect(onChange).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(501);
    act(() => button().props.onClick());
    expect(latest[field as 'sets']?.[0].completed).toBe(false);
    act(() => renderer.unmount());
  });

  it('compartilha a guarda entre falha e conclusão da mesma série', () => {
    vi.useFakeTimers();
    let latest: TechniqueLog = { type: 'to_failure', sets: [{ id: 'set', index: 0, weight: 20, reps: 10, completed: false }] };
    function Harness() {
      const [log, setLog] = useState(latest);
      latest = log;
      return <TechniquePanel plan={{ type: 'to_failure' }} log={log} level="advanced" onUnlock={vi.fn()} onChange={setLog} />;
    }
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<Harness />); });
    const failure = renderer.root.findAllByType('button').find(node => node.props.children === 'Marcar falhou aqui')!;
    act(() => failure.props.onClick());
    act(() => renderer.root.findByProps({ 'aria-label': 'Desmarcar série especial 1' }).props.onClick());
    expect(latest.sets?.[0]).toMatchObject({ completed: true, failed: true });
    act(() => renderer.unmount());
  });
});
