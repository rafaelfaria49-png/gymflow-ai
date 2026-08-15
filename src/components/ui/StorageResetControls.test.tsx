import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageResetControls } from './StorageResetControls';

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
  const inspect = options.inspect ?? vi.fn(async () => ({
    status: 'error',
    reason: 'reset-failed',
    message: 'Não foi possível zerar os dados do GymFlow.',
  }));
  const commit = options.commit ?? vi.fn(async () => ({
    ok: false,
    reason: 'reset-failed',
    requiresReload: false,
    message: 'Não foi possível zerar os dados do GymFlow.',
  }));
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <StorageResetControls
        storageMode={options.storageMode ?? 'hybrid-v2'}
        inspectLogicalResetV2={inspect as never}
        commitLogicalResetV2={commit as never}
      />,
    );
  });
  mounted.push(renderer);
  return { renderer, inspect, commit };
}

describe('StorageResetControls', () => {
  it('não renderiza fora do hybrid-v2', async () => {
    const { renderer } = await renderControls({ storageMode: 'legacy-v1' });
    expect(renderer.toJSON()).toBeNull();
  });

  it('não renderiza no modo blocked', async () => {
    const { renderer } = await renderControls({ storageMode: 'blocked' });
    expect(renderer.toJSON()).toBeNull();
  });

  it('available: preview agregado e ação destrutiva', async () => {
    const { renderer } = await renderControls({
      inspect: async () => ({ status: 'available', preview: PREVIEW }),
    });
    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Zerar dados do GymFlow');
    expect(text).toContain('Treinos, programas, histórico, peso, medidas e perfil atual serão zerados');
    expect(text).toContain('O aplicativo será recarregado');
    expect(text).toContain('não apaga fisicamente');
    expect(text).toContain('predecessor verificável');
    expect(text).toContain('não garante histórico ilimitado nem recuperação eterna');
    expect(text).toContain('Sessões de treino');
    expect(text).toContain('2');
    expect(text).toContain('Programas personalizados');
    expect(text).toContain('Registros de peso');
    expect(text).toContain('Registros de medidas');
    expect(findButtonByLabel(renderer.toJSON(), 'Zerar dados do GymFlow')).toBeDefined();
    expect(text).not.toContain('generation');
    expect(text).not.toContain('operationId');
    expect(text).not.toContain('previousCoreRaw');
  });

  it('confirmação destrutiva em dois passos e bloqueio de clique duplo', async () => {
    let resolveCommit!: (value: { ok: true; requiresReload: true; message: string }) => void;
    const commit = vi.fn(() => new Promise((resolve) => {
      resolveCommit = resolve;
    }));
    const { renderer } = await renderControls({
      inspect: async () => ({ status: 'available', preview: PREVIEW }),
      commit,
    });

    await act(async () => {
      clickButton(findButtonByLabel(renderer.toJSON(), 'Zerar dados do GymFlow')!);
    });
    const first = normalize(collectText(renderer.toJSON()));
    expect(first).toContain('Zerar todos os dados');
    expect(first).toContain('Os dados atuais serão substituídos por um estado vazio do GymFlow.');

    const firstConfirm = findButtons(renderer.toJSON())
      .find((button) => buttonText(button) === 'Zerar todos os dados');
    expect(firstConfirm).toBeDefined();

    await act(async () => {
      clickButton(firstConfirm!);
    });
    const final = normalize(collectText(renderer.toJSON()));
    expect(final).toContain('Confirmar e zerar');
    expect(final).toContain('Os dados atuais serão substituídos por um estado vazio do GymFlow.');

    const finalConfirm = findButtons(renderer.toJSON())
      .find((button) => buttonText(button) === 'Confirmar e zerar');
    expect(finalConfirm).toBeDefined();

    await act(async () => {
      clickButton(finalConfirm!);
    });
    const resetting = normalize(collectText(renderer.toJSON()));
    expect(resetting).toContain('Zerando dados…');
    expect(resetting).toContain('Não feche esta aba.');
    expect(commit).toHaveBeenCalledTimes(1);

    await act(async () => {
      const again = findButtonByLabel(renderer.toJSON(), 'Zerar dados do GymFlow');
      if (again) clickButton(again);
    });
    expect(commit).toHaveBeenCalledTimes(1);

    resolveCommit({
      ok: true,
      requiresReload: true,
      message: 'Dados zerados. Recarregando...',
    });
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('erro do inspect não oferece ação destrutiva', async () => {
    const { renderer } = await renderControls({
      inspect: async () => ({
        status: 'error',
        reason: 'completion-pending',
        message: 'Existe uma finalização de treino pendente. Recarregue o aplicativo.',
      }),
    });
    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Existe uma finalização de treino pendente.');
    expect(findButtonByLabel(renderer.toJSON(), 'Zerar dados do GymFlow')).toBeUndefined();
  });
});
