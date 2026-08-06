import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  inspectLogicalStorageBackupV2,
  MAX_LOGICAL_BACKUP_BYTES,
} from '../../lib/storage-logical-backup';
import type { LogicalBackupPreview } from '../../lib/storage-logical-backup';
import { StorageBackupVerifier } from './StorageBackupVerifier';

vi.mock('../../lib/storage-logical-backup', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../lib/storage-logical-backup')
  >();
  return {
    ...actual,
    inspectLogicalStorageBackupV2: vi.fn(),
  };
});

const mockInspect = vi.mocked(inspectLogicalStorageBackupV2);

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

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

function findButtonByLabel(
  tree: unknown,
  label: string,
): RenderedElement | undefined {
  return findButtons(tree).find((btn) => buttonText(btn).includes(label));
}

function findInputByAriaLabel(
  tree: unknown,
  label: string,
): RenderedElement | undefined {
  return collectByType(tree, 'input').find(
    (el) =>
      typeof el.props?.['aria-label'] === 'string'
      && el.props['aria-label'].includes(label),
  );
}

function makePreview(overrides: Partial<LogicalBackupPreview> = {}): LogicalBackupPreview {
  return {
    exportedAt: '2026-08-05T12:00:00.000Z',
    sourceSavedAt: '2026-08-05T11:59:00.000Z',
    workoutSessions: 3,
    hasActiveWorkout: false,
    customPrograms: 2,
    weightEntries: 10,
    measurementEntries: 5,
    bytes: 2048,
    warning: null,
    ...overrides,
  };
}

function makeFile(
  content: string,
  name = 'gymflow-backup.json',
  size?: number,
): File {
  const blob = new File([content], name, { type: 'application/json' });
  if (size !== undefined) {
    Object.defineProperty(blob, 'size', { value: size });
  }
  return blob;
}

async function triggerFileChange(
  renderer: TestRenderer.ReactTestRenderer,
  file: File,
): Promise<void> {
  const input = findInputByAriaLabel(renderer.toJSON(), 'verificação');
  expect(input).toBeDefined();
  const onChange = input?.props?.onChange;
  expect(typeof onChange).toBe('function');

  const fakeEvent = {
    target: {
      files: [file],
      value: 'set',
    },
  };

  await act(async () => {
    (onChange as (e: unknown) => void)(fakeEvent);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    await Promise.resolve();
    await Promise.resolve();
  });
}

/* ------------------------------------------------------------------ */
/*  Setup / Teardown                                                  */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
});

afterEach(() => {
  Reflect.deleteProperty(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean },
    'IS_REACT_ACT_ENVIRONMENT',
  );
});

/* ================================================================== */
/*  Tests                                                             */
/* ================================================================== */

describe('StorageBackupVerifier', () => {
  /* -------------------------------------------------------------- */
  /*  1. V1 flow: component renders nothing in legacy-v1 mode       */
  /* -------------------------------------------------------------- */
  it('1 — V1 preservado: não renderiza no modo legacy-v1', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="legacy-v1" />,
      );
    });

    expect(renderer.toJSON()).toBeNull();
    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  2. Blocked mode: renders nothing                              */
  /* -------------------------------------------------------------- */
  it('2 — Modo blocked: não renderiza', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="blocked" />,
      );
    });

    expect(renderer.toJSON()).toBeNull();
    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  3. V2 valid file produces preview                             */
  /* -------------------------------------------------------------- */
  it('3 — JSON v2 válido produz preview sanitizado', async () => {
    const preview = makePreview();
    mockInspect.mockResolvedValue({
      ok: true,
      backup: {} as never,
      preview,
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    expect(verifyBtn).toBeDefined();

    await act(async () => {
      clickButton(verifyBtn!);
    });

    const file = makeFile('{"valid":"backup-content"}');
    await triggerFileChange(renderer, file);

    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Backup verificado');
    expect(text).toContain('Nenhum dado foi alterado.');
    expect(text).toContain('gymflow-backup.json');
    expect(text).toContain('3');
    expect(text).toContain('Não');
    expect(text).toContain('2');
    expect(text).toContain('10');
    expect(text).toContain('5');
    expect(text).toContain('A importação segura será habilitada em uma próxima etapa.');

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  4. File larger than limit rejected before file.text()          */
  /* -------------------------------------------------------------- */
  it('4 — Arquivo maior que limite é recusado antes de file.text()', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    await act(async () => {
      clickButton(verifyBtn!);
    });

    const file = makeFile('x', 'big.json', MAX_LOGICAL_BACKUP_BYTES + 1);
    Object.defineProperty(file, 'text', {
      value: () => {
        throw new Error('text() should not be called for oversized files');
      },
    });

    await triggerFileChange(renderer, file);

    expect(mockInspect).not.toHaveBeenCalled();
    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Verificação falhou');
    expect(text).toContain('excede o limite máximo');

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  5. Invalid JSON produces sanitized message                    */
  /* -------------------------------------------------------------- */
  it('5 — JSON inválido gera mensagem sanitizada', async () => {
    mockInspect.mockResolvedValue({
      ok: false,
      reason: 'invalid-json',
      error: 'Unexpected token x in JSON at position 0',
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    await act(async () => {
      clickButton(verifyBtn!);
    });

    await triggerFileChange(renderer, makeFile('{invalido'));

    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Verificação falhou');
    expect(text).toContain('não é um JSON válido');
    expect(text).not.toContain('Unexpected token');
    expect(text).not.toContain('position 0');

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  6. Unsupported version rejected                               */
  /* -------------------------------------------------------------- */
  it('6 — Versão não suportada é recusada', async () => {
    mockInspect.mockResolvedValue({
      ok: false,
      reason: 'unsupported-version',
      error: 'Versão 3 não suportada',
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    await act(async () => {
      clickButton(verifyBtn!);
    });

    await triggerFileChange(
      renderer,
      makeFile('{"formatVersion":3}'),
    );

    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('versão deste backup não é suportada');
    expect(text).not.toContain('Versão 3');

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  7. Digest mismatch rejected                                  */
  /* -------------------------------------------------------------- */
  it('7 — Digest divergente é recusado', async () => {
    mockInspect.mockResolvedValue({
      ok: false,
      reason: 'digest-mismatch',
      error: 'digest mismatch detail',
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    await act(async () => {
      clickButton(verifyBtn!);
    });

    await triggerFileChange(renderer, makeFile('{"tampered":"payload"}'));

    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('integridade');
    expect(text).not.toContain('digest mismatch detail');

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  8. Invalid payload rejected                                   */
  /* -------------------------------------------------------------- */
  it('8 — Payload inválido é recusado', async () => {
    mockInspect.mockResolvedValue({
      ok: false,
      reason: 'invalid-payload',
      error: 'internal payload validation failure',
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    await act(async () => {
      clickButton(verifyBtn!);
    });

    await triggerFileChange(renderer, makeFile('{"bad":"payload"}'));

    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('não pôde ser validado');
    expect(text).not.toContain('internal payload validation failure');

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  9. Preview does not contain private data                      */
  /* -------------------------------------------------------------- */
  it('9 — Preview não contém dados privados', async () => {
    const preview = makePreview({
      workoutSessions: 42,
      hasActiveWorkout: true,
      customPrograms: 7,
      weightEntries: 100,
      measurementEntries: 50,
    });
    mockInspect.mockResolvedValue({
      ok: true,
      backup: {
        payload: {
          workoutHistory: [{ id: 'session-private-id' }],
          activeWorkout: { exercises: [] },
          customPrograms: [{ name: 'Programa Secreto' }],
        },
      } as never,
      preview,
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    await act(async () => {
      clickButton(verifyBtn!);
    });

    await triggerFileChange(renderer, makeFile('{"valid":"content"}'));

    const text = normalize(collectText(renderer.toJSON()));
    expect(text).not.toContain('session-private-id');
    expect(text).not.toContain('Programa Secreto');
    expect(text).not.toContain('payload');
    expect(text).not.toContain('workoutHistory');
    expect(text).not.toContain('activeWorkout');
    expect(text).not.toContain('customPrograms');

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  10. Raw content not in text, public props, or error           */
  /* -------------------------------------------------------------- */
  it('10 — raw não aparece em texto, props públicas ou erro', async () => {
    const rawContent = 'SUPER_SECRET_SESSION_ID_abc123@email.com';
    mockInspect.mockResolvedValue({
      ok: true,
      backup: {} as never,
      preview: makePreview(),
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    await act(async () => {
      clickButton(verifyBtn!);
    });

    await triggerFileChange(renderer, makeFile(rawContent));

    const fullText = normalize(collectText(renderer.toJSON()));
    expect(fullText).not.toContain('SUPER_SECRET_SESSION_ID_abc123@email.com');

    const allElements = JSON.stringify(renderer.toJSON());
    expect(allElements).not.toContain('SUPER_SECRET_SESSION_ID_abc123@email.com');

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  11. Duplicate click does not execute duplicate read           */
  /* -------------------------------------------------------------- */
  it('11 — Clique duplicado não executa leitura duplicada', async () => {
    let resolveInspect!: (
      value: Awaited<ReturnType<typeof inspectLogicalStorageBackupV2>>,
    ) => void;
    const pending = new Promise<
      Awaited<ReturnType<typeof inspectLogicalStorageBackupV2>>
    >((resolve) => {
      resolveInspect = resolve;
    });
    mockInspect.mockReturnValue(pending);

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');

    // First click opens file picker and triggers file read
    await act(async () => {
      clickButton(verifyBtn!);
    });

    const input = findInputByAriaLabel(renderer.toJSON(), 'verificação');
    const onChange = input?.props?.onChange;
    const file = makeFile('{"dup":"test"}');
    const fakeEvent = {
      target: { files: [file], value: 'set' },
    };

    await act(async () => {
      (onChange as (e: unknown) => void)(fakeEvent);
    });

    // Attempt a second file change while first is still reading
    const fakeEvent2 = {
      target: { files: [makeFile('{"dup2":"test2"}')], value: 'set' },
    };
    await act(async () => {
      (onChange as (e: unknown) => void)(fakeEvent2);
    });

    // Resolve the first inspection
    await act(async () => {
      resolveInspect({
        ok: true,
        backup: {} as never,
        preview: makePreview(),
      });
      await pending;
      await Promise.resolve();
    });

    // inspect called exactly once
    expect(mockInspect).toHaveBeenCalledTimes(1);

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  12. Same file can be selected again                           */
  /* -------------------------------------------------------------- */
  it('12 — Mesmo arquivo pode ser selecionado novamente', async () => {
    mockInspect.mockResolvedValue({
      ok: true,
      backup: {} as never,
      preview: makePreview(),
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    // First selection
    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    await act(async () => {
      clickButton(verifyBtn!);
    });
    await triggerFileChange(renderer, makeFile('{"same":"file"}'));

    let text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Backup verificado');

    // Close preview
    const closeBtn = findButtonByLabel(renderer.toJSON(), 'Fechar');
    await act(async () => {
      clickButton(closeBtn!);
    });

    // Select the same file again
    const verifyBtn2 = findButtonByLabel(renderer.toJSON(), 'Verificar');
    await act(async () => {
      clickButton(verifyBtn2!);
    });

    mockInspect.mockResolvedValue({
      ok: true,
      backup: {} as never,
      preview: makePreview({ workoutSessions: 5 }),
    });
    await triggerFileChange(renderer, makeFile('{"same":"file"}'));

    text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Backup verificado');
    expect(text).toContain('5');
    expect(mockInspect).toHaveBeenCalledTimes(2);

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  13. Closing clears preview                                    */
  /* -------------------------------------------------------------- */
  it('13 — Fechar limpa o preview', async () => {
    mockInspect.mockResolvedValue({
      ok: true,
      backup: {} as never,
      preview: makePreview(),
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    await act(async () => {
      clickButton(verifyBtn!);
    });
    await triggerFileChange(renderer, makeFile('{"valid":"content"}'));

    let text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Backup verificado');

    const closeBtn = findButtonByLabel(renderer.toJSON(), 'Fechar');
    await act(async () => {
      clickButton(closeBtn!);
    });

    text = normalize(collectText(renderer.toJSON()));
    expect(text).not.toContain('Backup verificado');
    expect(text).toContain('Verificar');

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  14. Unmount prevents late state update                        */
  /* -------------------------------------------------------------- */
  it('14 — Unmount impede atualização tardia', async () => {
    let resolveInspect!: (
      value: Awaited<ReturnType<typeof inspectLogicalStorageBackupV2>>,
    ) => void;
    const pending = new Promise<
      Awaited<ReturnType<typeof inspectLogicalStorageBackupV2>>
    >((resolve) => {
      resolveInspect = resolve;
    });
    mockInspect.mockReturnValue(pending);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    await act(async () => {
      clickButton(verifyBtn!);
    });
    await triggerFileChange(renderer, makeFile('{"stale":"data"}'));

    // Unmount before inspection resolves
    act(() => renderer.unmount());

    // Resolve the pending inspection
    await act(async () => {
      resolveInspect({
        ok: true,
        backup: {} as never,
        preview: makePreview(),
      });
      await pending;
      await Promise.resolve();
    });

    expect(renderer.toJSON()).toBeNull();
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(
      /unmounted component|state update/i,
    );

    consoleError.mockRestore();
  });

  /* -------------------------------------------------------------- */
  /*  15. No download is triggered                                  */
  /* -------------------------------------------------------------- */
  it('15 — Nenhum download é disparado', async () => {
    mockInspect.mockResolvedValue({
      ok: true,
      backup: {} as never,
      preview: makePreview(),
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    await act(async () => {
      clickButton(verifyBtn!);
    });
    await triggerFileChange(renderer, makeFile('{"valid":"content"}'));

    // No <a> elements or download attributes
    const anchors = collectByType(renderer.toJSON(), 'a');
    expect(anchors.length).toBe(0);

    const allButtons = findButtons(renderer.toJSON());
    const downloadBtn = allButtons.find(
      (btn) =>
        typeof btn.props?.download === 'string'
        || buttonText(btn).toLowerCase().includes('baixar')
        || buttonText(btn).toLowerCase().includes('download'),
    );
    expect(downloadBtn).toBeUndefined();

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  16. Button is accessible with min 44px touch target           */
  /* -------------------------------------------------------------- */
  it('16 — Input acessível e touch target mínimo de 44px', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    expect(verifyBtn).toBeDefined();
    expect(verifyBtn?.props?.['aria-label']).toBe(
      'Verificar backup lógico v2',
    );
    expect(verifyBtn?.props?.className).toContain('min-h-[44px]');

    const input = findInputByAriaLabel(renderer.toJSON(), 'verificação');
    expect(input).toBeDefined();
    expect(input?.props?.type).toBe('file');
    expect(input?.props?.accept).toBe('application/json,.json');

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  17. No import button rendered in hybrid mode                  */
  /* -------------------------------------------------------------- */
  it('17 — Sem botão de importar no modo híbrido', async () => {
    mockInspect.mockResolvedValue({
      ok: true,
      backup: {} as never,
      preview: makePreview(),
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    await act(async () => {
      clickButton(verifyBtn!);
    });
    await triggerFileChange(renderer, makeFile('{"valid":"content"}'));

    const allButtons = findButtons(renderer.toJSON());
    const importBtn = allButtons.find((btn) =>
      buttonText(btn).toLowerCase().includes('importar'),
    );
    expect(importBtn).toBeUndefined();

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  18. Preview shows active workout as "Sim" when present        */
  /* -------------------------------------------------------------- */
  it('18 — Treino ativo exibido como Sim quando presente', async () => {
    mockInspect.mockResolvedValue({
      ok: true,
      backup: {} as never,
      preview: makePreview({ hasActiveWorkout: true }),
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    await act(async () => {
      clickButton(verifyBtn!);
    });
    await triggerFileChange(renderer, makeFile('{"valid":"content"}'));

    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Treino ativo');
    expect(text).toContain('Sim');

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  19. Preview shows warning when present                        */
  /* -------------------------------------------------------------- */
  it('19 — Warning de tamanho exibido quando presente', async () => {
    mockInspect.mockResolvedValue({
      ok: true,
      backup: {} as never,
      preview: makePreview({ warning: 'Arquivo grande, pode demorar para processar.' }),
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    await act(async () => {
      clickButton(verifyBtn!);
    });
    await triggerFileChange(renderer, makeFile('{"valid":"content"}'));

    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Arquivo grande, pode demorar para processar.');

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  20. File read error shows sanitized message                   */
  /* -------------------------------------------------------------- */
  it('20 — Erro de leitura de arquivo mostra mensagem sanitizada', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StorageBackupVerifier storageMode="hybrid-v2" />,
      );
    });

    const verifyBtn = findButtonByLabel(renderer.toJSON(), 'Verificar');
    await act(async () => {
      clickButton(verifyBtn!);
    });

    const input = findInputByAriaLabel(renderer.toJSON(), 'verificação');
    const onChange = input?.props?.onChange;
    const file = makeFile('content');
    Object.defineProperty(file, 'text', {
      value: () => Promise.reject(new Error('FileReader internal error')),
    });

    await act(async () => {
      (onChange as (e: unknown) => void)({
        target: { files: [file], value: 'set' },
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Não foi possível ler o arquivo selecionado.');
    expect(text).not.toContain('FileReader internal error');

    act(() => renderer.unmount());
  });
});
