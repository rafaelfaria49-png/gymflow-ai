import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageRestoreControls } from './StorageRestoreControls';

const originalDocument = Reflect.getOwnPropertyDescriptor(globalThis, 'document');

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (typeof document === 'undefined') {
    const stub = Object.assign(new EventTarget(), {
      addEventListener: EventTarget.prototype.addEventListener,
      removeEventListener: EventTarget.prototype.removeEventListener,
    });
    Object.defineProperty(globalThis, 'document', {
      value: stub,
      configurable: true,
      writable: true,
    });
  }
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

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function findButtons(tree: unknown): RenderedElement[] {
  return collectByType(tree, 'button');
}

function clickButton(button: RenderedElement): void {
  const onClick = button?.props?.onClick;
  if (typeof onClick === 'function') onClick();
}

function buttonText(button: RenderedElement): string {
  return normalize(collectText(button));
}

function findButtonByLabel(tree: unknown, label: string): RenderedElement | undefined {
  return findButtons(tree).find((btn) => buttonText(btn).includes(label));
}

const PREVIEW = {
  sessionCount: 2,
  customProgramCount: 1,
  weightRecordCount: 3,
  measurementRecordCount: 2,
};

const mounted: TestRenderer.ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of mounted.splice(0)) {
    act(() => renderer.unmount());
  }
});

async function renderControls(options: {
  storageMode?: 'legacy-v1' | 'hybrid-v2' | 'blocked';
  inspect?: () => Promise<unknown>;
  commit?: () => Promise<unknown>;
}) {
  const inspect = options.inspect ?? vi.fn(async () => ({ status: 'unavailable' }));
  const commit = options.commit ?? vi.fn(async () => ({
    ok: false,
    reason: 'restore-unavailable',
    requiresReload: false,
    message: 'Nenhum backup anterior verificável disponível.',
  }));
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <StorageRestoreControls
        storageMode={options.storageMode ?? 'hybrid-v2'}
        inspectLogicalRestoreV2={inspect as never}
        commitLogicalRestoreV2={commit as never}
      />,
    );
  });
  mounted.push(renderer);
  return { renderer, inspect, commit };
}

describe('StorageRestoreControls', () => {
  it('não renderiza fora do hybrid-v2', async () => {
    const { renderer } = await renderControls({ storageMode: 'legacy-v1' });
    expect(renderer.toJSON()).toBeNull();
  });

  it('não renderiza no modo blocked', async () => {
    const { renderer } = await renderControls({ storageMode: 'blocked' });
    expect(renderer.toJSON()).toBeNull();
  });

  it('sem candidato: mensagem honesta e sem botão destrutivo', async () => {
    const { renderer } = await renderControls({
      inspect: async () => ({ status: 'unavailable' }),
    });
    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Nenhum backup anterior verificável disponível.');
    expect(findButtonByLabel(renderer.toJSON(), 'Restaurar backup anterior')).toBeUndefined();
  });

  it('ambíguo: mensagem honesta e sem botão destrutivo', async () => {
    const { renderer } = await renderControls({
      inspect: async () => ({ status: 'ambiguous' }),
    });
    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Não foi possível determinar com segurança um único backup anterior.');
    expect(findButtonByLabel(renderer.toJSON(), 'Restaurar backup anterior')).toBeUndefined();
  });

  it('available: preview agregado e ação destrutiva', async () => {
    const { renderer } = await renderControls({
      inspect: async () => ({ status: 'available', preview: PREVIEW }),
    });
    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Backup anterior verificável');
    expect(text).toContain('Sessões de treino');
    expect(text).toContain('2');
    expect(text).toContain('Programas personalizados');
    expect(text).toContain('Registros de peso');
    expect(text).toContain('Registros de medidas');
    expect(findButtonByLabel(renderer.toJSON(), 'Restaurar backup anterior')).toBeDefined();
    expect(text).not.toContain('generation');
    expect(text).not.toContain('operationId');
    expect(text).not.toContain('previousCoreRaw');
  });

  it('confirmação destrutiva e estado de operação', async () => {
    let resolveCommit!: (value: { ok: true; requiresReload: true; message: string }) => void;
    const commit = vi.fn(() => new Promise((resolve) => {
      resolveCommit = resolve;
    }));
    const { renderer } = await renderControls({
      inspect: async () => ({ status: 'available', preview: PREVIEW }),
      commit,
    });

    await act(async () => {
      clickButton(findButtonByLabel(renderer.toJSON(), 'Restaurar backup anterior')!);
    });
    const confirming = normalize(collectText(renderer.toJSON()));
    expect(confirming).toContain('Os dados atuais serão substituídos pelo backup anterior verificado.');
    expect(confirming).toContain('O aplicativo será recarregado ao concluir.');

    const confirmButtons = findButtons(renderer.toJSON())
      .filter((button) => buttonText(button) === 'Restaurar backup anterior');
    const confirm = confirmButtons[confirmButtons.length - 1];
    expect(confirm).toBeDefined();

    await act(async () => {
      clickButton(confirm!);
    });
    const restoring = normalize(collectText(renderer.toJSON()));
    expect(restoring).toContain('Restaurando backup…');
    expect(restoring).toContain('Não feche esta aba.');
    expect(commit).toHaveBeenCalledTimes(1);

    await act(async () => {
      clickButton(findButtonByLabel(renderer.toJSON(), 'Restaurar backup anterior')!);
    });
    expect(commit).toHaveBeenCalledTimes(1);

    resolveCommit({
      ok: true,
      requiresReload: true,
      message: 'Backup anterior restaurado. Recarregando...',
    });
    await act(async () => {
      await Promise.resolve();
    });
  });
});
