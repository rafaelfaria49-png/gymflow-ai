import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

const originalDocument = Reflect.getOwnPropertyDescriptor(globalThis, 'document');

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(globalThis, 'document', {
    value: new EventTarget(),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
});

interface RenderedElement {
  type?: unknown;
  props?: Record<string, unknown>;
  children?: unknown;
}

function collectText(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (typeof node !== 'object') return '';
  return collectText((node as { children?: unknown }).children);
}

function collectByType(
  node: unknown,
  type: string,
  found: RenderedElement[] = [],
): RenderedElement[] {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    node.forEach((child) => collectByType(child, type, found));
    return found;
  }
  const element = node as RenderedElement;
  if (element.type === type) found.push(element);
  collectByType(element.children, type, found);
  return found;
}

function buttonText(button: RenderedElement): string {
  return collectText(button).replace(/\s+/g, ' ').trim();
}

function findDialog(tree: unknown): RenderedElement | undefined {
  return collectByType(tree, 'div').find((node) => node.props?.role === 'alertdialog');
}

function findButton(tree: unknown, label: string): RenderedElement | undefined {
  return collectByType(tree, 'button').find((button) => buttonText(button) === label);
}

function dispatchKey(type: 'keydown' | 'keyup', key: string, repeat = false): { defaultPrevented: boolean } {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'key', { value: key });
  Object.defineProperty(event, 'repeat', { value: repeat });
  document.dispatchEvent(event);
  return { defaultPrevented: event.defaultPrevented };
}

const mounted: TestRenderer.ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of mounted.splice(0)) {
    act(() => renderer.unmount());
  }
});

function renderDialog(props: {
  requireIndependentKeyboardIntent?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  const onConfirm = props.onConfirm ?? vi.fn();
  const onCancel = props.onCancel ?? vi.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <ConfirmDialog
        isOpen
        title="Confirmar e zerar"
        confirmLabel="Confirmar e zerar"
        cancelLabel="Cancelar"
        onConfirm={onConfirm}
        onCancel={onCancel}
        requireIndependentKeyboardIntent={props.requireIndependentKeyboardIntent}
      />,
    );
  });
  mounted.push(renderer);
  return { renderer, onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('default não expõe a barreira e o clique no confirm dispara na hora', () => {
    const { renderer, onConfirm } = renderDialog({});
    const dialog = findDialog(renderer.toJSON());
    expect(dialog?.props?.['data-keyboard-armed']).toBeUndefined();

    act(() => {
      (findButton(renderer.toJSON(), 'Confirmar e zerar')!.props!.onClick as () => void)();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('com barreira: abre desarmada, ignora Enter/Space repetidos e Escape cancela', () => {
    const { renderer, onConfirm, onCancel } = renderDialog({
      requireIndependentKeyboardIntent: true,
    });
    expect(findDialog(renderer.toJSON())?.props?.['data-keyboard-armed']).toBe('false');

    let enterRepeat!: { defaultPrevented: boolean };
    act(() => {
      enterRepeat = dispatchKey('keydown', 'Enter', true);
    });
    expect(enterRepeat.defaultPrevented).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();

    let spaceRepeat!: { defaultPrevented: boolean };
    act(() => {
      spaceRepeat = dispatchKey('keydown', ' ', true);
    });
    expect(spaceRepeat.defaultPrevented).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();

    act(() => {
      dispatchKey('keydown', 'Escape');
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('com barreira: clique do mouse confirma mesmo antes do keyup', () => {
    const { renderer, onConfirm } = renderDialog({
      requireIndependentKeyboardIntent: true,
    });
    expect(findDialog(renderer.toJSON())?.props?.['data-keyboard-armed']).toBe('false');

    act(() => {
      (findButton(renderer.toJSON(), 'Confirmar e zerar')!.props!.onClick as () => void)();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('default: Enter não é prevenido — callers históricos permanecem imediatos', () => {
    renderDialog({});
    const event = dispatchKey('keydown', 'Enter', false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('com barreira: após keyup o diálogo arma para uma nova intenção', () => {
    const { renderer, onConfirm } = renderDialog({
      requireIndependentKeyboardIntent: true,
    });

    act(() => {
      dispatchKey('keydown', 'Enter', true);
      dispatchKey('keyup', 'Enter');
    });
    expect(findDialog(renderer.toJSON())?.props?.['data-keyboard-armed']).toBe('true');

    const confirm = findButton(renderer.toJSON(), 'Confirmar e zerar')!;
    const keyDown = confirm.props?.onKeyDown as (event: { key: string; repeat: boolean; preventDefault: () => void }) => void;
    const prevented: string[] = [];
    act(() => {
      keyDown({
        key: 'Enter',
        repeat: false,
        preventDefault: () => { prevented.push('enter'); },
      });
    });
    expect(prevented).toEqual([]);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
