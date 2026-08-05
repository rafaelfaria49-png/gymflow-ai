import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageAdminStatus } from '../../lib/storage-admin-status';
import { StorageAdminHealthPanel } from './StorageAdminHealthPanel';

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

function status(overrides: Partial<StorageAdminStatus> = {}): StorageAdminStatus {
  return {
    overall: 'healthy',
    boot: 'ready',
    storage: {
      observed: 3,
      evaluated: 3,
      active: 1,
      migration: 0,
      historical: 2,
    },
    receipts: 'absent',
    evidence: 'verified',
    retention: {
      status: 'ready',
      keep: 1,
      protected: 1,
      futureDeleteCandidate: 1,
    },
    ownerToken: 'available',
    executionAuthorized: false,
    deleteAuthorized: false,
    ...overrides,
  };
}

async function renderResolved(
  value: StorageAdminStatus,
  options: { strict?: boolean } = {},
) {
  const inspect = vi.fn(async () => value);
  const panel = <StorageAdminHealthPanel inspect={inspect} />;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      options.strict ? <StrictMode>{panel}</StrictMode> : panel,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return { renderer, inspect };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  Reflect.deleteProperty(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean },
    'IS_REACT_ACT_ENVIRONMENT',
  );
});

describe('StorageAdminHealthPanel — estados e linguagem operacional', () => {
  it('renderiza o cenário saudável com título, badge, cards e contagens', async () => {
    const { renderer, inspect } = await renderResolved(status());
    const text = normalize(collectText(renderer.toJSON()));
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(text).toContain('Saúde administrativa do armazenamento');
    expect(text).toContain('Saudável');
    expect(text).toContain('BootPronto');
    expect(text).toContain('ReceiptsAusentes');
    expect(text).toContain('EvidênciaVerificada');
    expect(text).toContain('RetençãoPronta');
    expect(text).toContain('Owner-tokenDisponível');
    expect(text).toContain('Candidatas futuras1');
    expect(text).toContain('Execução autorizada: não');
    expect(text).toContain('Exclusão autorizada: não');
    act(() => renderer.unmount());
  });

  it('explica atenção por receipts sem prometer ação automática', async () => {
    const { renderer } = await renderResolved(status({
      overall: 'attention',
      receipts: 'present',
      retention: {
        status: 'blocked',
        keep: 1,
        protected: 2,
        futureDeleteCandidate: 0,
      },
    }));
    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('Atenção');
    expect(text).toContain('ReceiptsPresentes');
    expect(text).toContain('RetençãoBloqueada');
    expect(text).toContain('Nenhuma limpeza automática é executada');
    expect(text).toContain('não autorizam exclusão');
    act(() => renderer.unmount());
  });

  it('torna bloqueio explícito e preserva a mensagem read-only', async () => {
    const { renderer } = await renderResolved(status({
      overall: 'blocked',
      boot: 'blocked',
      evidence: 'unstable',
      receipts: 'conflicted',
      retention: {
        status: 'blocked',
        keep: 1,
        protected: 2,
        futureDeleteCandidate: 0,
      },
      ownerToken: 'malformed',
    }));
    const tree = renderer.toJSON();
    const text = normalize(collectText(tree));
    expect(text).toContain('Bloqueado');
    expect(text).toContain('BootBloqueado');
    expect(text).toContain('EvidênciaInstável');
    expect(text).toContain('Owner-tokenMalformado');
    expect(collectByType(tree, 'div').some((node) => node?.props?.role === 'alert')).toBe(true);
    act(() => renderer.unmount());
  });

  it('mostra estado vazio quando nenhuma geração pôde ser avaliada', async () => {
    const base = status();
    const { renderer } = await renderResolved(status({
      overall: 'attention',
      storage: {
        ...base.storage,
        observed: 0,
        evaluated: 0,
        active: 0,
        historical: 0,
      },
      retention: {
        status: 'blocked',
        keep: 0,
        protected: 0,
        futureDeleteCandidate: 0,
      },
    }));
    expect(normalize(collectText(renderer.toJSON()))).toContain(
      'Nenhuma geração pôde ser avaliada nesta inspeção.',
    );
    act(() => renderer.unmount());
  });

  it('mantém loading acessível enquanto a leitura está pendente', () => {
    const inspect = vi.fn(() => new Promise<StorageAdminStatus>(() => undefined));
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<StorageAdminHealthPanel inspect={inspect} />);
    });
    const tree = renderer.toJSON();
    expect(normalize(collectText(tree))).toContain(
      'Lendo o estado administrativo sem alterar dados',
    );
    expect(collectByType(tree, 'div').some((node) => node?.props?.role === 'status')).toBe(true);
    act(() => renderer.unmount());
  });

  it('converte rejeição em erro honesto e permite tentar novamente', async () => {
    const inspect = vi.fn(async () => {
      throw new Error('erro nativo que não deve ser mostrado');
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<StorageAdminHealthPanel inspect={inspect} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    const text = normalize(collectText(renderer.toJSON()));
    expect(text).toContain('O diagnóstico está indisponível');
    expect(text).not.toContain('erro nativo');
    expect(collectByType(renderer.toJSON(), 'div').some(
      (node) => node?.props?.role === 'alert',
    )).toBe(true);
    act(() => renderer.unmount());
  });

  it('expõe somente o botão de atualização na nova UI', async () => {
    const { renderer } = await renderResolved(status());
    const buttons = collectByType(renderer.toJSON(), 'button')
      .map((node) => normalize(collectText(node)));
    expect(buttons).toEqual(['Atualizar diagnóstico']);
    expect(buttons.join(' ')).not.toMatch(
      /delete|clear|restore|import|reset|excluir|limpar|restaurar|importar|zerar/i,
    );
    act(() => renderer.unmount());
  });
});

describe('StorageAdminHealthPanel — ciclo de vida, concorrência e acessibilidade', () => {
  it('a atualização manual inicia exatamente uma nova inspeção lógica', async () => {
    const inspect = vi.fn()
      .mockResolvedValueOnce(status())
      .mockResolvedValueOnce(status({
        overall: 'attention',
        ownerToken: 'busy',
      }));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<StorageAdminHealthPanel inspect={inspect} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(inspect).toHaveBeenCalledTimes(1);

    const button = renderer.root.findByType('button');
    await act(async () => {
      button.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(normalize(collectText(renderer.toJSON()))).toContain('Owner-tokenOcupado');
    act(() => renderer.unmount());
  });

  it('Strict Mode compartilha a inspeção pendente e não duplica a seção', async () => {
    let resolve!: (value: StorageAdminStatus) => void;
    const pending = new Promise<StorageAdminStatus>((done) => {
      resolve = done;
    });
    const inspect = vi.fn(() => pending);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <StrictMode>
          <StorageAdminHealthPanel inspect={inspect} />
        </StrictMode>,
      );
      await Promise.resolve();
    });
    expect(inspect).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(status());
      await pending;
    });
    const titles = collectByType(renderer.toJSON(), 'h2')
      .map((node) => normalize(collectText(node)));
    expect(titles).toEqual(['Saúde administrativa do armazenamento']);
    act(() => renderer.unmount());
  });

  it('uma Promise compartilhada atende dois consumidores concorrentes', async () => {
    let resolve!: (value: StorageAdminStatus) => void;
    const pending = new Promise<StorageAdminStatus>((done) => {
      resolve = done;
    });
    const inspect = vi.fn(() => pending);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <>
          <StorageAdminHealthPanel inspect={inspect} />
          <StorageAdminHealthPanel inspect={inspect} />
        </>,
      );
      await Promise.resolve();
    });
    expect(inspect).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(status());
      await pending;
    });
    expect(collectByType(renderer.toJSON(), 'h2')).toHaveLength(2);
    act(() => renderer.unmount());
  });

  it('ignora a resolução depois do unmount sem atualizar estado', async () => {
    let resolve!: (value: StorageAdminStatus) => void;
    const pending = new Promise<StorageAdminStatus>((done) => {
      resolve = done;
    });
    const inspect = vi.fn(() => pending);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<StorageAdminHealthPanel inspect={inspect} />);
    });
    act(() => renderer.unmount());
    await act(async () => {
      resolve(status());
      await pending;
    });
    expect(renderer.toJSON()).toBeNull();
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(
      /unmounted component|state update/i,
    );
    consoleError.mockRestore();
  });

  it('mantém semântica acessível, touch target e grids responsivos', async () => {
    const { renderer } = await renderResolved(status());
    const tree = renderer.toJSON();
    const section = collectByType(tree, 'section')[0];
    const button = collectByType(tree, 'button')[0];
    const allClasses = [
      ...collectByType(tree, 'div'),
      ...collectByType(tree, 'dl'),
    ]
      .map((node) => String(node?.props?.className ?? ''))
      .join(' ');
    expect(section?.props?.['aria-labelledby']).toBe('storage-admin-health-title');
    expect(button?.props?.['aria-label']).toBe('Atualizar diagnóstico somente leitura');
    expect(String(button?.props?.className)).toContain('min-h-11');
    expect(allClasses).toContain('grid-cols-1');
    expect(allClasses).toContain('sm:grid-cols-2');
    expect(allClasses).toContain('xl:grid-cols-5');
    act(() => renderer.unmount());
  });
});
