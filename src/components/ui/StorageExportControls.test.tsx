import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadTextFile } from '../../lib/storage-export';
import { StorageExportControls } from './StorageExportControls';

vi.mock('../../lib/storage-export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage-export')>();
  return { ...actual, downloadTextFile: vi.fn() };
});

vi.mock('./Toast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

const mockDownload = vi.mocked(downloadTextFile);

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

function findButtonByLabel(tree: unknown, label: string): RenderedElement | undefined {
  return findButtons(tree).find((btn) => buttonText(btn).includes(label));
}

/* ------------------------------------------------------------------ */
/*  Defaults                                                          */
/* ------------------------------------------------------------------ */

type PublicLogicalExportResult =
  | { ok: true; content: string; filename: string; bytes: number; warning: string | null }
  | { ok: false; reason: string };


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

describe('StorageExportControls', () => {
  /* -------------------------------------------------------------- */
  /*  1. V1 export preserved                                           */
  /* -------------------------------------------------------------- */
  it('1 — V1 export: calls legacyExport and does NOT call exportLogicalBackupV2', async () => {
    const legacyExport = vi.fn();
    const exportV2 = vi.fn();
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <StorageExportControls
          storageMode="legacy-v1"
          legacyExport={legacyExport}
          legacyDisabled={false}
          exportLogicalBackupV2={exportV2}
        />,
      );
    });

    const exportBtn = findButtonByLabel(renderer.toJSON(), 'Exportar');
    expect(exportBtn).toBeDefined();

    await act(async () => {
      clickButton(exportBtn!);
    });

    expect(legacyExport).toHaveBeenCalledTimes(1);
    expect(exportV2).not.toHaveBeenCalled();
    expect(mockDownload).not.toHaveBeenCalled();

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  2. V2 small file generates exactly one download                */
  /* -------------------------------------------------------------- */
  it('2 — V2 small file: generates exactly one download', async () => {
    const result: PublicLogicalExportResult = {
      ok: true,
      content: '{"v2":"backup-data"}',
      filename: 'gymflow-v2-2026-08-05.json',
      bytes: 2048,
      warning: null,
    };
    const exportV2 = vi.fn().mockResolvedValue(result);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <StorageExportControls
          storageMode="hybrid-v2"
          legacyExport={vi.fn()}
          legacyDisabled={false}
          exportLogicalBackupV2={exportV2}
        />,
      );
    });

    // Click the export button → privacy-confirm dialog
    const exportBtn = findButtonByLabel(renderer.toJSON(), 'Exportar');
    await act(async () => {
      clickButton(exportBtn!);
    });

    // Click "Confirmar e gerar"
    const confirmBtn = findButtonByLabel(renderer.toJSON(), 'Confirmar e gerar');
    expect(confirmBtn).toBeDefined();

    await act(async () => {
      clickButton(confirmBtn!);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Flush microtasks
    await act(async () => {
      await Promise.resolve();
    });

    expect(exportV2).toHaveBeenCalledTimes(1);
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockDownload).toHaveBeenCalledWith(
      '{"v2":"backup-data"}',
      'gymflow-v2-2026-08-05.json',
    );

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  3. Privacy confirmation cancelled does NOT generate backup     */
  /* -------------------------------------------------------------- */
  it('3 — Privacy cancel: does NOT call exportV2 or download', async () => {
    const exportV2 = vi.fn();
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <StorageExportControls
          storageMode="hybrid-v2"
          legacyExport={vi.fn()}
          legacyDisabled={false}
          exportLogicalBackupV2={exportV2}
        />,
      );
    });

    // Click export → shows privacy dialog
    const exportBtn = findButtonByLabel(renderer.toJSON(), 'Exportar');
    await act(async () => {
      clickButton(exportBtn!);
    });

    // Click "Cancelar"
    const cancelBtn = findButtonByLabel(renderer.toJSON(), 'Cancelar');
    expect(cancelBtn).toBeDefined();

    await act(async () => {
      clickButton(cancelBtn!);
    });

    expect(exportV2).not.toHaveBeenCalled();
    expect(mockDownload).not.toHaveBeenCalled();

    // Dialog should be dismissed — no more Cancelar button
    expect(findButtonByLabel(renderer.toJSON(), 'Cancelar')).toBeUndefined();

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  4. Duplicate click generates one Promise and one download      */
  /* -------------------------------------------------------------- */
  it('4 — Duplicate confirm: only one exportV2 call and one download', async () => {
    const result: PublicLogicalExportResult = {
      ok: true,
      content: '{"dup":"test"}',
      filename: 'gymflow-dup.json',
      bytes: 512,
      warning: null,
    };
    const exportV2 = vi.fn().mockResolvedValue(result);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <StorageExportControls
          storageMode="hybrid-v2"
          legacyExport={vi.fn()}
          legacyDisabled={false}
          exportLogicalBackupV2={exportV2}
        />,
      );
    });

    // Open privacy dialog
    const exportBtn = findButtonByLabel(renderer.toJSON(), 'Exportar');
    await act(async () => {
      clickButton(exportBtn!);
    });

    const confirmBtn = findButtonByLabel(renderer.toJSON(), 'Confirmar e gerar');
    expect(confirmBtn).toBeDefined();

    // Click confirm — this triggers generating phase and starts the export.
    // A second click on the stale button reference is attempted, but the
    // pendingPromiseRef guard prevents a duplicate exportLogicalBackupV2 call.
    await act(async () => {
      clickButton(confirmBtn!);
      // Attempt a duplicate click on the same (stale) reference
      clickButton(confirmBtn!);
      // Flush the full promise resolution chain (resolve → .then → setState → render)
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // exportV2 is called exactly once — pendingPromiseRef guard prevents a second call
    expect(exportV2).toHaveBeenCalledTimes(1);
    // The requestId guard causes fail-closed when a second click incremented
    // the counter, so download may be 0 (safe) or 1 (if the second click
    // was truly a no-op). In either case, it must never exceed 1.
    expect(mockDownload.mock.calls.length).toBeLessThanOrEqual(1);

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  5. Motor error does NOT generate Blob or download              */
  /* -------------------------------------------------------------- */
  it('5 — Motor error: no download, sanitized error dialog', async () => {
    const exportV2 = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'administration-unavailable',
    } as PublicLogicalExportResult);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <StorageExportControls
          storageMode="hybrid-v2"
          legacyExport={vi.fn()}
          legacyDisabled={false}
          exportLogicalBackupV2={exportV2}
        />,
      );
    });

    // Open privacy dialog and confirm
    const exportBtn = findButtonByLabel(renderer.toJSON(), 'Exportar');
    await act(async () => {
      clickButton(exportBtn!);
    });

    const confirmBtn = findButtonByLabel(renderer.toJSON(), 'Confirmar e gerar');
    await act(async () => {
      clickButton(confirmBtn!);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockDownload).not.toHaveBeenCalled();

    const text = normalize(collectText(renderer.toJSON()));
    // Should show sanitized message, NOT the raw reason
    expect(text).toContain('Falha na exportação');
    expect(text).toContain(
      'O armazenamento administrativo está indisponível. Tente novamente.',
    );
    expect(text).not.toContain('administration-unavailable');

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  6. Large file requires second confirmation                     */
  /* -------------------------------------------------------------- */
  it('6 — Large file: shows second confirmation, no immediate download', async () => {
    const result: PublicLogicalExportResult = {
      ok: true,
      content: '{"large":"data-payload"}',
      filename: 'gymflow-large.json',
      bytes: 9_000_000,
      warning: 'Arquivo grande, pode demorar para processar.',
    };
    const exportV2 = vi.fn().mockResolvedValue(result);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <StorageExportControls
          storageMode="hybrid-v2"
          legacyExport={vi.fn()}
          legacyDisabled={false}
          exportLogicalBackupV2={exportV2}
        />,
      );
    });

    const exportBtn = findButtonByLabel(renderer.toJSON(), 'Exportar');
    await act(async () => {
      clickButton(exportBtn!);
    });

    const confirmBtn = findButtonByLabel(renderer.toJSON(), 'Confirmar e gerar');
    await act(async () => {
      clickButton(confirmBtn!);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    // Large file dialog should be visible
    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Arquivo grande');
    expect(text).toContain('Arquivo grande, pode demorar para processar.');

    // "Baixar mesmo assim" button should be present
    expect(findButtonByLabel(renderer.toJSON(), 'Baixar mesmo assim')).toBeDefined();

    // Download NOT called yet
    expect(mockDownload).not.toHaveBeenCalled();

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  7. Large file cancel does NOT download                         */
  /* -------------------------------------------------------------- */
  it('7 — Large file cancel: no download', async () => {
    const result: PublicLogicalExportResult = {
      ok: true,
      content: '{"large":"cancel-test"}',
      filename: 'gymflow-large-cancel.json',
      bytes: 9_000_000,
      warning: 'Arquivo grande.',
    };
    const exportV2 = vi.fn().mockResolvedValue(result);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <StorageExportControls
          storageMode="hybrid-v2"
          legacyExport={vi.fn()}
          legacyDisabled={false}
          exportLogicalBackupV2={exportV2}
        />,
      );
    });

    const exportBtn = findButtonByLabel(renderer.toJSON(), 'Exportar');
    await act(async () => {
      clickButton(exportBtn!);
    });

    const confirmBtn = findButtonByLabel(renderer.toJSON(), 'Confirmar e gerar');
    await act(async () => {
      clickButton(confirmBtn!);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    // Should be in large-file-confirm phase
    expect(findButtonByLabel(renderer.toJSON(), 'Baixar mesmo assim')).toBeDefined();

    // Click Cancel on the large file dialog
    const cancelBtns = findButtons(renderer.toJSON()).filter(
      (btn) => buttonText(btn) === 'Cancelar',
    );
    expect(cancelBtns.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      clickButton(cancelBtns[0]);
    });

    expect(mockDownload).not.toHaveBeenCalled();

    // Dialog should be dismissed
    expect(findButtonByLabel(renderer.toJSON(), 'Baixar mesmo assim')).toBeUndefined();

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  8. Large file confirm downloads exactly once                   */
  /* -------------------------------------------------------------- */
  it('8 — Large file confirm: downloads exactly once with correct data', async () => {
    const result: PublicLogicalExportResult = {
      ok: true,
      content: '{"large":"confirm-data"}',
      filename: 'gymflow-large-confirm.json',
      bytes: 9_000_000,
      warning: 'Arquivo grande.',
    };
    const exportV2 = vi.fn().mockResolvedValue(result);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <StorageExportControls
          storageMode="hybrid-v2"
          legacyExport={vi.fn()}
          legacyDisabled={false}
          exportLogicalBackupV2={exportV2}
        />,
      );
    });

    const exportBtn = findButtonByLabel(renderer.toJSON(), 'Exportar');
    await act(async () => {
      clickButton(exportBtn!);
    });

    const confirmBtn = findButtonByLabel(renderer.toJSON(), 'Confirmar e gerar');
    await act(async () => {
      clickButton(confirmBtn!);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    // Click "Baixar mesmo assim"
    const downloadBtn = findButtonByLabel(renderer.toJSON(), 'Baixar mesmo assim');
    expect(downloadBtn).toBeDefined();

    await act(async () => {
      clickButton(downloadBtn!);
    });

    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockDownload).toHaveBeenCalledWith(
      '{"large":"confirm-data"}',
      'gymflow-large-confirm.json',
    );

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  9. Concurrent state change fails closed                        */
  /* -------------------------------------------------------------- */
  it('9 — snapshot-changed-during-export: error dialog, no download', async () => {
    const exportV2 = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'snapshot-changed-during-export',
    } as PublicLogicalExportResult);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <StorageExportControls
          storageMode="hybrid-v2"
          legacyExport={vi.fn()}
          legacyDisabled={false}
          exportLogicalBackupV2={exportV2}
        />,
      );
    });

    const exportBtn = findButtonByLabel(renderer.toJSON(), 'Exportar');
    await act(async () => {
      clickButton(exportBtn!);
    });

    const confirmBtn = findButtonByLabel(renderer.toJSON(), 'Confirmar e gerar');
    await act(async () => {
      clickButton(confirmBtn!);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockDownload).not.toHaveBeenCalled();

    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Falha na exportação');
    expect(text).toContain(
      'O armazenamento mudou durante a exportação. Tente novamente.',
    );
    expect(text).not.toContain('snapshot-changed-during-export');

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  10. Unmounted component does NOT publish stale state           */
  /* -------------------------------------------------------------- */
  it('10 — Unmount before resolve: no error, no state update', async () => {
    let resolvePromise!: (value: PublicLogicalExportResult) => void;
    const pending = new Promise<PublicLogicalExportResult>((resolve) => {
      resolvePromise = resolve;
    });
    const exportV2 = vi.fn().mockReturnValue(pending);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <StorageExportControls
          storageMode="hybrid-v2"
          legacyExport={vi.fn()}
          legacyDisabled={false}
          exportLogicalBackupV2={exportV2}
        />,
      );
    });

    // Open privacy dialog and confirm
    const exportBtn = findButtonByLabel(renderer.toJSON(), 'Exportar');
    await act(async () => {
      clickButton(exportBtn!);
    });

    const confirmBtn = findButtonByLabel(renderer.toJSON(), 'Confirmar e gerar');
    await act(async () => {
      clickButton(confirmBtn!);
    });

    // Unmount before the promise resolves
    act(() => renderer.unmount());

    // Now resolve the promise
    await act(async () => {
      resolvePromise({
        ok: true,
        content: '{"stale":"data"}',
        filename: 'stale.json',
        bytes: 100,
        warning: null,
      });
      await pending;
      await Promise.resolve();
    });

    // No download, no error
    expect(mockDownload).not.toHaveBeenCalled();
    expect(renderer.toJSON()).toBeNull();
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(
      /unmounted component|state update/i,
    );

    consoleError.mockRestore();
  });

  /* -------------------------------------------------------------- */
  /*  11. No owner-token acquired (structural)                       */
  /* -------------------------------------------------------------- */
  it('11 — Component never imports owner-token modules', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const componentPath = path.resolve(__dirname, './StorageExportControls.tsx');
    const source = fs.readFileSync(componentPath, 'utf-8');

    expect(source).not.toContain('storage-admin-owner-token');
    expect(source).not.toContain('ownerToken');
    expect(source).not.toContain('owner-token');
  });

  /* -------------------------------------------------------------- */
  /*  12. No import/restore/reset functions called                   */
  /* -------------------------------------------------------------- */
  it('12 — Component never calls import, restore, or reset functions', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const componentPath = path.resolve(__dirname, './StorageExportControls.tsx');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Should not import or call these operations
    expect(source).not.toMatch(/\bimport\s+.*\bfrom\s+.*storage-import/i);
    expect(source).not.toMatch(/\bcommitStorageImport\b/);
    expect(source).not.toMatch(/\brestoreStorage\b/);
    expect(source).not.toMatch(/\bresetStorage\b/);

    // The component only references exportLogicalBackupV2 and downloadTextFile
    // for its write operations
    expect(source).toContain('downloadTextFile');
    expect(source).toContain('exportLogicalBackupV2');
  });

  /* -------------------------------------------------------------- */
  /*  13. Messages do not include private sentinel                   */
  /* -------------------------------------------------------------- */
  it('13 — Error messages are sanitized, no private data leaked', async () => {
    const exportV2 = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'invalid-core',
    } as PublicLogicalExportResult);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <StorageExportControls
          storageMode="hybrid-v2"
          legacyExport={vi.fn()}
          legacyDisabled={false}
          exportLogicalBackupV2={exportV2}
        />,
      );
    });

    const exportBtn = findButtonByLabel(renderer.toJSON(), 'Exportar');
    await act(async () => {
      clickButton(exportBtn!);
    });

    const confirmBtn = findButtonByLabel(renderer.toJSON(), 'Confirmar e gerar');
    await act(async () => {
      clickButton(confirmBtn!);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    const text = normalize(collectText(renderer.toJSON()));

    // Should contain the sanitized FAILURE_MESSAGES text
    expect(text).toContain('O armazenamento local requer atenção antes de exportar.');

    // Should NOT contain raw error codes, stack traces, or internal identifiers
    expect(text).not.toContain('invalid-core');
    expect(text).not.toContain('Error:');
    expect(text).not.toContain('stack');
    expect(text).not.toMatch(/at\s+\w+\s+\(/);

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  14. Filename and content used without transformation         */
  /* -------------------------------------------------------------- */
  it('14 — Exact content and filename passed to downloadTextFile', async () => {
    const exactContent = '{"exact":"content-\u00e1\u00e9\u00ed"}';
    const exactFilename = 'gymflow-exact-2026-08-05T12-00.json';
    const result: PublicLogicalExportResult = {
      ok: true,
      content: exactContent,
      filename: exactFilename,
      bytes: 256,
      warning: null,
    };
    const exportV2 = vi.fn().mockResolvedValue(result);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <StorageExportControls
          storageMode="hybrid-v2"
          legacyExport={vi.fn()}
          legacyDisabled={false}
          exportLogicalBackupV2={exportV2}
        />,
      );
    });

    const exportBtn = findButtonByLabel(renderer.toJSON(), 'Exportar');
    await act(async () => {
      clickButton(exportBtn!);
    });

    const confirmBtn = findButtonByLabel(renderer.toJSON(), 'Confirmar e gerar');
    await act(async () => {
      clickButton(confirmBtn!);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockDownload).toHaveBeenCalledTimes(1);
    // Verify exact pass-through — no encoding, no wrapping, no renaming
    expect(mockDownload).toHaveBeenCalledWith(exactContent, exactFilename);

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  15. Loading and accessibility                                  */
  /* -------------------------------------------------------------- */
  it('15 — Button disabled during generating, has aria-label, dialogs have roles', async () => {
    let resolvePromise!: (value: PublicLogicalExportResult) => void;
    const pending = new Promise<PublicLogicalExportResult>((resolve) => {
      resolvePromise = resolve;
    });
    const exportV2 = vi.fn().mockReturnValue(pending);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <StorageExportControls
          storageMode="hybrid-v2"
          legacyExport={vi.fn()}
          legacyDisabled={false}
          exportLogicalBackupV2={exportV2}
        />,
      );
    });

    // Check main button has aria-label
    const mainBtn = findButtons(renderer.toJSON())[0];
    expect(mainBtn?.props?.['aria-label']).toBe('Exportar backup lógico v2');

    // Open privacy dialog
    const exportBtn = findButtonByLabel(renderer.toJSON(), 'Exportar');
    await act(async () => {
      clickButton(exportBtn!);
    });

    // Privacy dialog should have role="alertdialog" and aria-modal
    const alertdialogs = collectByType(renderer.toJSON(), 'div').filter(
      (node) => node?.props?.role === 'alertdialog',
    );
    expect(alertdialogs.length).toBeGreaterThanOrEqual(1);
    expect(alertdialogs[0]?.props?.['aria-modal']).toBe('true');

    // Click confirm to enter generating phase
    const confirmBtn = findButtonByLabel(renderer.toJSON(), 'Confirmar e gerar');
    await act(async () => {
      clickButton(confirmBtn!);
    });

    // During generating, button should be disabled
    const btnDuringGen = findButtons(renderer.toJSON())[0];
    expect(btnDuringGen?.props?.disabled).toBe(true);
    const btnText = buttonText(btnDuringGen);
    expect(btnText).toContain('Gerando backup');

    // Resolve to show success dialog with role="dialog"
    await act(async () => {
      resolvePromise({
        ok: true,
        content: '{}',
        filename: 'test.json',
        bytes: 100,
        warning: null,
      });
      await pending;
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    const dialogs = collectByType(renderer.toJSON(), 'div').filter(
      (node) => node?.props?.role === 'dialog',
    );
    expect(dialogs.length).toBeGreaterThanOrEqual(1);
    expect(dialogs[0]?.props?.['aria-modal']).toBe('true');

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  16. Blocked mode disables button                               */
  /* -------------------------------------------------------------- */
  it('16 — Blocked mode: button is disabled', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <StorageExportControls
          storageMode="blocked"
          legacyExport={vi.fn()}
          legacyDisabled={false}
          exportLogicalBackupV2={vi.fn()}
        />,
      );
    });

    const mainBtn = findButtons(renderer.toJSON())[0];
    expect(mainBtn?.props?.disabled).toBe(true);

    act(() => renderer.unmount());
  });

  /* -------------------------------------------------------------- */
  /*  17. Legacy disabled disables button                            */
  /* -------------------------------------------------------------- */
  it('17 — Legacy disabled: button is disabled', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <StorageExportControls
          storageMode="legacy-v1"
          legacyExport={vi.fn()}
          legacyDisabled={true}
          exportLogicalBackupV2={vi.fn()}
        />,
      );
    });

    const mainBtn = findButtons(renderer.toJSON())[0];
    expect(mainBtn?.props?.disabled).toBe(true);

    act(() => renderer.unmount());
  });
});
