import { describe, expect, it } from 'vitest';
import { createTrainingActionGuard } from './training-action-guard';
describe('ações críticas GOAL-119', () => {
  it('bloqueia repetição imediata, permite outra série e aceita nova intenção após o intervalo', () => {
    let now = 1000;
    const guard = createTrainingActionGuard(500, () => now);
    expect(guard('session:set-1')).toBe(true);
    expect(guard('session:set-1')).toBe(false);
    expect(guard('session:set-2')).toBe(true);
    now += 500;
    expect(guard('session:set-1')).toBe(true);
    expect(guard('another-session:set-1')).toBe(true);
  });
});
