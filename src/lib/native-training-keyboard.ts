import type { PluginListenerHandle } from '@capacitor/core';
import type { KeyboardPlugin } from '@capacitor/keyboard';

/** Keep native set entry visible after the keyboard has resized the WebView. */
export function observeNativeTrainingKeyboard(keyboard: Pick<KeyboardPlugin, 'addListener'>) {
  let disposed = false;
  let frame: number | undefined;
  const handles: PluginListenerHandle[] = [];
  const root = document.documentElement;
  const revealSet = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    const row = document.activeElement?.closest('[data-training-set-row]');
    if (!row) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      if (!disposed && row.isConnected && document.activeElement?.closest('[data-training-set-row]') === row) {
        row.scrollIntoView({ block: 'start', behavior: 'auto' });
      }
    });
  };
  const hide = () => {
    root.classList.remove('training-keyboard-open');
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  };
  const show = () => {
    if (disposed || !document.activeElement?.closest('[data-training-set-row]')) return;
    root.classList.add('training-keyboard-open');
    revealSet();
  };
  const focus = () => {
    if (root.classList.contains('training-keyboard-open')) revealSet();
  };
  for (const pending of [
    keyboard.addListener('keyboardDidShow', show),
    keyboard.addListener('keyboardDidHide', hide),
  ]) {
    void pending.then(handle => {
      if (disposed) return handle.remove();
      handles.push(handle);
    }).catch(() => {});
  }
  document.addEventListener('focusin', focus);
  return () => {
    disposed = true;
    hide();
    document.removeEventListener('focusin', focus);
    for (const handle of handles) void handle.remove().catch(() => {});
  };
}
