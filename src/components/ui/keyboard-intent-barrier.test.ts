import { describe, expect, it } from 'vitest';
import {
  createKeyboardIntentBarrier,
  isConfirmActivationKey,
} from './keyboard-intent-barrier';

describe('keyboard-intent-barrier', () => {
  it('reconhece somente Enter e Space como teclas de ativação', () => {
    expect(isConfirmActivationKey('Enter')).toBe(true);
    expect(isConfirmActivationKey(' ')).toBe(true);
    expect(isConfirmActivationKey('Escape')).toBe(false);
    expect(isConfirmActivationKey('Tab')).toBe(false);
  });

  it('abre desarmada: o primeiro Enter/Space não é uma intenção nova', () => {
    const barrier = createKeyboardIntentBarrier();
    barrier.resetForOpen();
    expect(barrier.isKeyboardArmed()).toBe(false);
    expect(barrier.shouldBlockKeyboardActivation('Enter', false)).toBe(true);
    expect(barrier.shouldBlockKeyboardActivation(' ', false)).toBe(true);
    expect(barrier.shouldBlockKeyboardActivation('Escape', false)).toBe(false);
  });

  it('bloqueia key-repeat de Enter e Space mesmo depois do keyup', () => {
    const barrier = createKeyboardIntentBarrier();
    barrier.resetForOpen();
    barrier.onKeyDown();
    expect(barrier.shouldBlockKeyboardActivation('Enter', true)).toBe(true);
    barrier.onKeyUp();
    expect(barrier.isKeyboardArmed()).toBe(true);
    expect(barrier.shouldBlockKeyboardActivation('Enter', true)).toBe(true);
    expect(barrier.shouldBlockKeyboardActivation(' ', true)).toBe(true);
  });

  it('após keyup, um Enter/Space não-repeat é intenção independente', () => {
    const barrier = createKeyboardIntentBarrier();
    barrier.resetForOpen();
    barrier.onKeyDown();
    expect(barrier.shouldBlockKeyboardActivation('Enter', false)).toBe(true);
    barrier.onKeyUp();
    expect(barrier.isKeyboardArmed()).toBe(true);
    expect(barrier.shouldBlockKeyboardActivation('Enter', false)).toBe(false);
    expect(barrier.shouldBlockKeyboardActivation(' ', false)).toBe(false);
  });

  it('Space hold segue o mesmo contrato de Enter', () => {
    const barrier = createKeyboardIntentBarrier();
    barrier.resetForOpen();
    barrier.onKeyDown();
    expect(barrier.shouldBlockKeyboardActivation(' ', true)).toBe(true);
    expect(barrier.shouldBlockKeyboardActivation('Enter', false)).toBe(true);
    barrier.onKeyUp();
    expect(barrier.shouldBlockKeyboardActivation(' ', false)).toBe(false);
  });

  it('reabrir o diálogo desarma de novo', () => {
    const barrier = createKeyboardIntentBarrier();
    barrier.resetForOpen();
    barrier.onKeyUp();
    expect(barrier.isKeyboardArmed()).toBe(true);
    barrier.resetForOpen();
    expect(barrier.isKeyboardArmed()).toBe(false);
    expect(barrier.shouldBlockKeyboardActivation('Enter', false)).toBe(true);
  });
});
