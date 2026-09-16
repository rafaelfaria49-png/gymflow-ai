import { IDBFactory } from 'fake-indexeddb';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NutritionPage } from './NutritionPage';
import { ToastProvider } from '../components/ui/Toast';
import { GymFlowProvider, useGymFlow } from '../providers/GymFlowContext';

// Stub mínimo para window/localStorage
class MemoryLocalStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

let originalWindow = Reflect.getOwnPropertyDescriptor(globalThis, 'window');
let originalDocument = Reflect.getOwnPropertyDescriptor(globalThis, 'document');
let originalIndexedDb = Reflect.getOwnPropertyDescriptor(globalThis, 'indexedDB');

async function renderPage() {
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  await act(async () => {
    renderer = TestRenderer.create(
      <ToastProvider>
        <GymFlowProvider>
          <NutritionPage />
        </GymFlowProvider>
      </ToastProvider>
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  return renderer!;
}

function panelText(renderer: TestRenderer.ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

function switchTab(renderer: TestRenderer.ReactTestRenderer, tabId: string) {
  const root = renderer.root;
  const tab = root.findAllByType('button').find((button) => button.props.id === `nut-tab-${tabId}`);
  expect(tab).toBeDefined();
  act(() => {
    tab!.props.onClick();
  });
}

describe('NutritionPage NUT-006 (mobile UX sobre ledger real)', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const storage = new MemoryLocalStorage();
    const windowStub = new EventTarget() as EventTarget & {
      localStorage: MemoryLocalStorage;
      location: { reload: () => void };
    };
    windowStub.localStorage = storage;
    windowStub.location = { reload: vi.fn() };

    const documentStub = new EventTarget() as EventTarget & { visibilityState: string };
    documentStub.visibilityState = 'visible';

    Reflect.defineProperty(globalThis, 'window', {
      value: windowStub,
      configurable: true,
      writable: true,
    });
    Reflect.defineProperty(globalThis, 'document', {
      value: documentStub,
      configurable: true,
      writable: true,
    });
    Reflect.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
    Reflect.defineProperty(globalThis, 'indexedDB', {
      value: new IDBFactory(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (originalWindow) {
      Reflect.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
    if (originalDocument) {
      Reflect.defineProperty(globalThis, 'document', originalDocument);
    } else {
      Reflect.deleteProperty(globalThis, 'document');
    }
    if (originalIndexedDb) {
      Reflect.defineProperty(globalThis, 'indexedDB', originalIndexedDb);
    } else {
      Reflect.deleteProperty(globalThis, 'indexedDB');
    }
  });

  it('FIVE_SECTIONS = PASS: cinco abas internas sem estado paralelo', async () => {
    const renderer = await renderPage();
    const text = panelText(renderer);
    for (const label of ['Hoje', 'Registrar', 'Metas', 'Tendência', 'Sugestões']) {
      expect(text).toContain(label);
    }
    // Nenhum formulário legado de macros manuais.
    expect(text).not.toContain('Adicionar Alimento (Refeição)');
    expect(text).not.toContain('Ex: 450');
  });

  it('FAKE_AI_LABEL = NO e FAKE_NUTRITION_DATA = NO: sem IA, sem sugestões hardcoded', async () => {
    const renderer = await renderPage();
    const text = panelText(renderer);
    expect(text).not.toContain('Cardápio Sugerido IA');
    expect(text).not.toContain('Cardápio Sugerido');
    expect(text).not.toContain('Mingau de aveia');
    expect(text).not.toContain('Patinho bovino');
    // Sugestões honestas exigem disclaimer real.
    switchTab(renderer, 'suggestions');
    const suggestionsText = panelText(renderer);
    expect(suggestionsText).toContain('não constituem planejamento alimentar individualizado');
  });

  it('TODAY_REAL_LEDGER + HYDRATION = PASS: quick actions registram água real', async () => {
    let capturedContext: ReturnType<typeof useGymFlow> | null = null;
    const ContextInspector = () => {
      capturedContext = useGymFlow();
      return null;
    };
    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(
        <ToastProvider>
          <GymFlowProvider>
            <ContextInspector />
            <NutritionPage />
          </GymFlowProvider>
        </ToastProvider>
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    const root = renderer!.root;
    // Aba Hoje é a padrão: quick actions de hidratação.
    const quick250 = root.findAllByType('button').find((b) => b.props['aria-label']?.includes('250'));
    expect(quick250).toBeDefined();
    await act(async () => {
      await quick250!.props.onClick();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(capturedContext!.nutrition.water).toBe(250);
    expect(capturedContext!.nutritionDay).not.toBeNull();
  });

  it('TARGETS_MANUAL_ONLY = PASS: sem perfil, sem números fabricados', async () => {
    const renderer = await renderPage();
    switchTab(renderer, 'targets');
    const text = panelText(renderer);
    expect(text).toContain('Metas automáticas indisponíveis');
    expect(text).toContain('PROFILE_ABSENT');
    expect(text).not.toContain('Mingau de aveia');
  });

  it('REGISTER_REAL_FOOD = PASS: fluxo busca → preview → confirmação existe e nada grava sozinho', async () => {
    const renderer = await renderPage();
    switchTab(renderer, 'register');
    const root = renderer.root;
    const search = root.findAllByType('input').find((i) => i.props['aria-label'] === 'Buscar alimento no catálogo');
    expect(search).toBeDefined();
    // Sem seleção, nenhum botão de confirmação de alimento.
    expect(panelText(renderer)).not.toContain('Confirmar registro');
    await act(async () => {
      search!.props.onChange({ target: { value: 'arroz' } });
    });
    const text = panelText(renderer);
    expect(text).toContain('Arroz');
    // Cadastro manual USER_CONFIRMED presente com trava de 15%.
    expect(text).toContain('USER_CONFIRMED');
  });

  it('TREND_7_30 = PASS: janelas de 7/30 dias sem inventar dias', async () => {
    const renderer = await renderPage();
    switchTab(renderer, 'trend');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    const text = panelText(renderer);
    expect(text).toContain('Janela da tendência');
    expect(text).toContain('dias');
    expect(text).toContain('interpolados');
  });
});
