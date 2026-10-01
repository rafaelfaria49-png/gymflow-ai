import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KeyboardPlugin } from '@capacitor/keyboard';
import { observeNativeTrainingKeyboard } from './native-training-keyboard';

afterEach(() => vi.unstubAllGlobals());

function setup(delayed = false) {
  const classes = new Set<string>();
  const row = { isConnected: true, scrollIntoView: vi.fn() };
  const activeElement = { closest: vi.fn(() => row as typeof row | null) };
  const callbacks: Record<string, () => void> = {};
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const remove = vi.fn(async () => {});
  const resolve: (() => void)[] = [];
  const documentStub = {
    documentElement: { classList: {
      add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name),
      contains: (name: string) => classes.has(name),
    } },
    activeElement,
    addEventListener: vi.fn((name: string, callback: () => void) => { callbacks[name] = callback; }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('document', documentStub);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback); return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const keyboard = { addListener: (name: string, callback: () => void) => {
    callbacks[name] = callback;
    return delayed ? new Promise<{remove: typeof remove}>(done => resolve.push(() => done({remove}))) : Promise.resolve({remove});
  } } as unknown as Pick<KeyboardPlugin, 'addListener'>;
  const cleanup = observeNativeTrainingKeyboard(keyboard);
  const flush = () => { for (const [id, callback] of frames) { frames.delete(id); callback(0); } };
  return {classes, row, activeElement, callbacks, frames, remove, resolve, cleanup, flush, documentStub};
}

describe('native training keyboard', () => {
  it('reveals the focused set after resize and releases overlays on Back/keyboard hide without scrolling again', () => {
    const s = setup();
    s.callbacks.keyboardDidShow();
    expect(s.classes.has('training-keyboard-open')).toBe(true);
    expect(s.row.scrollIntoView).not.toHaveBeenCalled();
    s.flush();
    expect(s.row.scrollIntoView).toHaveBeenCalledWith({block: 'start', behavior: 'auto'});
    s.callbacks.keyboardDidHide();
    expect(s.classes.size).toBe(0);
    expect(s.row.scrollIntoView).toHaveBeenCalledTimes(1);
    s.cleanup();
  });
  it('does not change other forms or scroll after focus leaves the set', () => {
    const s = setup();
    s.activeElement.closest.mockReturnValue(null);
    s.callbacks.keyboardDidShow();
    expect(s.classes.size).toBe(0);
    expect(s.frames.size).toBe(0);
    s.activeElement.closest.mockReturnValue(s.row);
    s.callbacks.keyboardDidShow();
    s.activeElement.closest.mockReturnValue(null);
    s.flush();
    expect(s.row.scrollIntoView).not.toHaveBeenCalled();
    s.cleanup();
  });
  it('reveals the newly focused set with the keyboard already open and cancels pending scroll when hidden', () => {
    const s = setup();
    s.callbacks.keyboardDidShow();
    s.flush();
    s.callbacks.focusin();
    expect(s.frames.size).toBe(1);
    s.callbacks.keyboardDidHide();
    s.flush();
    expect(s.row.scrollIntoView).toHaveBeenCalledTimes(1);
    s.cleanup();
  });
  it('removes listeners that finish registering after unmount and clears keyboard state', async () => {
    const s = setup(true);
    s.callbacks.keyboardDidShow();
    s.cleanup();
    s.resolve.forEach(done => done());
    await Promise.resolve();
    expect(s.remove).toHaveBeenCalledTimes(2);
    expect(s.classes.size).toBe(0);
    expect(s.frames.size).toBe(0);
    expect(s.documentStub.removeEventListener).toHaveBeenCalledWith('focusin', s.callbacks.focusin);
    s.callbacks.keyboardDidShow();
    expect(s.classes.size).toBe(0);
  });
});
