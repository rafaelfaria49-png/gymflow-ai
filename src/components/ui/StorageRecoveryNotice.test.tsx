import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveStorageRecoveryCapabilities,
  type StorageRecoveryCapabilityInput,
} from '../../lib/storage-hybrid';
import type { StorageHealth, StorageIssue } from '../../lib/storage-types';
import { StorageRecoveryNotice } from './StorageRecoveryNotice';

// O ConfirmDialog aberto registra um listener de teclado; o resto do componente
// não toca no DOM. Um EventTarget basta para manter o ambiente `node`.
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

// ===== Leitura da árvore renderizada =====

type RenderedNode = { type?: unknown; children?: unknown } | string | null;

function collectText(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (typeof node !== 'object') return '';
  return collectText((node as { children?: unknown }).children);
}

function collectByType(node: unknown, type: string, found: RenderedNode[] = []): RenderedNode[] {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const child of node) collectByType(child, type, found);
    return found;
  }
  const element = node as { type?: unknown; children?: unknown };
  if (element.type === type) found.push(element as RenderedNode);
  collectByType(element.children, type, found);
  return found;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

interface Scenario {
  tree: unknown;
  buttons: string[];
  text: string;
  // `occurrence` desempata rótulos repetidos: o aviso e o diálogo de confirmação
  // usam o mesmo texto de ação, na ordem em que aparecem na árvore.
  press: (label: string, occurrence?: number) => void;
  unmount: () => void;
}

function renderNotice(
  input: StorageRecoveryCapabilityInput,
  issue: StorageIssue | undefined,
  handlers: {
    onExportRaw?: () => void;
    onRestoreBackup?: () => void;
    onStartFresh?: () => void;
  } = {},
  options: { strict?: boolean } = {},
): Scenario {
  const health: StorageHealth = {
    status: input.status,
    hasBackup: input.hasLegacyBackup,
    issue,
  };
  const element = (
    <StorageRecoveryNotice
      health={health}
      capabilities={resolveStorageRecoveryCapabilities(input)}
      onExportRaw={handlers.onExportRaw ?? (() => undefined)}
      onRestoreBackup={handlers.onRestoreBackup ?? (() => undefined)}
      onStartFresh={handlers.onStartFresh ?? (() => undefined)}
    />
  );

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(options.strict ? <StrictMode>{element}</StrictMode> : element);
  });

  const read = () => {
    const tree = renderer.toJSON() as unknown;
    return {
      tree,
      buttons: collectByType(tree, 'button').map((button) => normalize(collectText(button))),
      text: normalize(collectText(tree)),
    };
  };

  const snapshot = read();
  return {
    ...snapshot,
    press: (label: string, occurrence = 0) => {
      const target = collectByType(renderer.toJSON() as unknown, 'button')
        .filter((button) => normalize(collectText(button)) === label)[occurrence];
      if (!target || typeof target === 'string') {
        throw new Error(`Botão não encontrado: ${label} (${occurrence})`);
      }
      const props = (target as unknown as { props?: { onClick?: () => void } }).props;
      act(() => { props?.onClick?.(); });
    },
    unmount: () => { act(() => { renderer.unmount(); }); },
  };
}

const CORRUPT: StorageIssue = {
  kind: 'corrupt',
  message: 'Conteúdo local ilegível.',
  raw: '{inválido',
};

const CORRUPT_WITHOUT_RAW: StorageIssue = {
  kind: 'corrupt',
  message: 'generation-absent: a geração ativa não existe fisicamente.',
};

describe('StorageRecoveryNotice — ações refletem a capacidade real', () => {
  it('legacy-v1 corrompido com backup mantém as três ações antigas', () => {
    const scenario = renderNotice(
      { mode: 'blocked', physicalVersion: 1, status: 'blocked', hasLegacyBackup: true, hasRawContent: true },
      CORRUPT,
    );
    expect(scenario.buttons).toEqual([
      'Exportar original',
      'Restaurar backup',
      'Iniciar dados novos',
    ]);
    expect(scenario.text).toContain('Há um backup v1 válido disponível.');
    scenario.unmount();
  });

  it('legacy-v1 corrompido sem backup não oferece restauração', () => {
    const scenario = renderNotice(
      { mode: 'blocked', physicalVersion: 1, status: 'blocked', hasLegacyBackup: false, hasRawContent: true },
      CORRUPT,
    );
    expect(scenario.buttons).toEqual(['Exportar original', 'Iniciar dados novos']);
    expect(scenario.text).not.toContain('backup v1 válido');
    scenario.unmount();
  });

  it('legacy-v1 confirma a restauração pelo diálogo existente', () => {
    const onRestoreBackup = vi.fn();
    const scenario = renderNotice(
      { mode: 'blocked', physicalVersion: 1, status: 'blocked', hasLegacyBackup: true, hasRawContent: false },
      { kind: 'corrupt', message: 'Conteúdo local ilegível.' },
      { onRestoreBackup },
    );
    // Abrir o aviso não executa nada; a restauração só ocorre na confirmação.
    scenario.press('Restaurar backup');
    expect(onRestoreBackup).not.toHaveBeenCalled();
    scenario.press('Restaurar backup', 1);
    expect(onRestoreBackup).toHaveBeenCalledTimes(1);
    scenario.unmount();
  });

  it('hybrid-v2 saudável não renderiza o aviso', () => {
    const scenario = renderNotice(
      { mode: 'hybrid-v2', physicalVersion: 2, status: 'ready', hasLegacyBackup: true, hasRawContent: false },
      undefined,
    );
    expect(scenario.tree).toBeNull();
    scenario.unmount();
  });

  it('hybrid-v2 bloqueado com backup v1 congelado não oferece restauração nem reset', () => {
    const onRestoreBackup = vi.fn();
    const onStartFresh = vi.fn();
    const scenario = renderNotice(
      { mode: 'blocked', physicalVersion: 2, status: 'blocked', hasLegacyBackup: true, hasRawContent: true },
      CORRUPT,
      { onRestoreBackup, onStartFresh },
    );
    expect(scenario.buttons).toEqual(['Baixar conteúdo original']);
    expect(scenario.text).not.toContain('Restaurar backup');
    expect(scenario.text).not.toContain('Iniciar dados novos');
    expect(scenario.text).not.toContain('backup v1 válido');
    expect(scenario.text).toContain('Recuperação segura necessária');
    expect(scenario.text).toContain('não pôde ser validado');
    expect(scenario.text).toContain('não corrige o armazenamento');
    expect(onRestoreBackup).not.toHaveBeenCalled();
    expect(onStartFresh).not.toHaveBeenCalled();
    scenario.unmount();
  });

  it('hybrid-v2 bloqueado com conteúdo bruto só oferece o download, que é somente leitura', () => {
    const onExportRaw = vi.fn();
    const onRestoreBackup = vi.fn();
    const onStartFresh = vi.fn();
    const scenario = renderNotice(
      { mode: 'blocked', physicalVersion: 2, status: 'blocked', hasLegacyBackup: false, hasRawContent: true },
      CORRUPT,
      { onExportRaw, onRestoreBackup, onStartFresh },
    );
    scenario.press('Baixar conteúdo original');
    expect(onExportRaw).toHaveBeenCalledTimes(1);
    expect(onRestoreBackup).not.toHaveBeenCalled();
    expect(onStartFresh).not.toHaveBeenCalled();
    scenario.unmount();
  });

  it('hybrid-v2 bloqueado sem conteúdo bruto não expõe nenhuma ação destrutiva', () => {
    const scenario = renderNotice(
      { mode: 'blocked', physicalVersion: 2, status: 'blocked', hasLegacyBackup: true, hasRawContent: false },
      CORRUPT_WITHOUT_RAW,
    );
    expect(scenario.buttons).toEqual([]);
    expect(scenario.text).toContain('Recuperação segura necessária');
    expect(scenario.text).toContain('Nenhuma ação automática segura está disponível');
    expect(scenario.text).toContain('Mantenha o aplicativo instalado');
    expect(scenario.text).not.toContain('reinstal');
    scenario.unmount();
  });

  it('hybrid-v2 com erro de gravação não promete restauração incompatível', () => {
    const scenario = renderNotice(
      { mode: 'hybrid-v2', physicalVersion: 2, status: 'write-error', hasLegacyBackup: true, hasRawContent: false },
      { kind: 'quota', message: 'Sem espaço para salvar.' },
    );
    expect(scenario.buttons).toEqual([]);
    expect(scenario.text).toContain('O último salvamento não foi confirmado');
    expect(scenario.text).toContain('continuam desativadas');
    scenario.unmount();
  });

  it('não menciona identificadores internos de GOAL na interface', () => {
    for (const input of [
      { mode: 'blocked', physicalVersion: 2, status: 'blocked', hasLegacyBackup: true, hasRawContent: true },
      { mode: 'blocked', physicalVersion: 2, status: 'blocked', hasLegacyBackup: true, hasRawContent: false },
      { mode: 'blocked', physicalVersion: 1, status: 'blocked', hasLegacyBackup: true, hasRawContent: true },
    ] satisfies StorageRecoveryCapabilityInput[]) {
      const scenario = renderNotice(input, CORRUPT);
      expect(scenario.text).not.toMatch(/GOAL-?\d/i);
      scenario.unmount();
    }
  });

  it('sob Strict Mode não duplica o aviso nem as ações', () => {
    const scenario = renderNotice(
      { mode: 'blocked', physicalVersion: 2, status: 'blocked', hasLegacyBackup: true, hasRawContent: true },
      CORRUPT,
      {},
      { strict: true },
    );
    expect(collectByType(scenario.tree, 'aside')).toHaveLength(1);
    expect(scenario.buttons).toEqual(['Baixar conteúdo original']);
    expect(scenario.text.match(/Recuperação segura necessária/g)).toHaveLength(1);
    scenario.unmount();
  });
});
