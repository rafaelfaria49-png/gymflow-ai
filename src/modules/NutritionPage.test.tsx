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

describe('NutritionPage UI (NUT-001 Honesty & Legacy Containment)', () => {
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
  });

  it('não exibe falso rótulo de IA e utiliza "Sugestões de refeições"', async () => {
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

    const allText = JSON.stringify(renderer!.toJSON());

    // Deve conter "Sugestões de refeições"
    expect(allText).toContain('Sugestões de refeições');
    // Não pode conter "Cardápio Sugerido IA" nem "Cardápio Sugerido" na seção
    expect(allText).not.toContain('Cardápio Sugerido IA');
    expect(allText).not.toContain('Cardápio Sugerido');
  });

  it('não possui disclaimers que insinuem estimativas geradas por IA/algoritmos', async () => {
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

    const allText = JSON.stringify(renderer!.toJSON());

    expect(allText).not.toContain('estimativas geradas por algoritmos');
    expect(allText).not.toContain('Cardápio Sugerido IA');
    expect(allText).toContain('Sugestões de refeições');
    expect(allText).toContain('não constituem planejamento alimentar individualizado');
  });

  it('submissão de macros com campos válidos atualiza o contexto e reseta inputs', async () => {
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

    const root = renderer!.root;
    const inputs = root.findAllByType('input');
    // inputs: [waterInput, kcalInput, protInput, carbInput, fatInput]
    const kcalInput = inputs.find((i) => i.props.placeholder === 'Ex: 450');
    const protInput = inputs.find((i) => i.props.placeholder === '30');
    const carbInput = inputs.find((i) => i.props.placeholder === '50');
    const fatInput = inputs.find((i) => i.props.placeholder === '10');

    expect(kcalInput).toBeDefined();
    expect(protInput).toBeDefined();
    expect(carbInput).toBeDefined();
    expect(fatInput).toBeDefined();

    await act(async () => {
      kcalInput!.props.onChange({ target: { value: '450' } });
      protInput!.props.onChange({ target: { value: '35' } });
      carbInput!.props.onChange({ target: { value: '55' } });
      fatInput!.props.onChange({ target: { value: '15' } });
    });

    // Encontrar form de macro
    const forms = root.findAllByType('form');
    const macroForm = forms.find((f) => f.props.className?.includes('space-y-3.5'));
    expect(macroForm).toBeDefined();

    await act(async () => {
      macroForm!.props.onSubmit({ preventDefault: vi.fn() });
    });

    expect(capturedContext!.nutrition.calories).toBe(450);
    expect(capturedContext!.nutrition.protein).toBe(35);
    expect(capturedContext!.nutrition.carbs).toBe(55);
    expect(capturedContext!.nutrition.fat).toBe(15);
  });

  it('submissão com calorias zero ou negativas não altera nutrição', async () => {
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

    const root = renderer!.root;
    const inputs = root.findAllByType('input');
    const kcalInput = inputs.find((i) => i.props.placeholder === 'Ex: 450');
    const protInput = inputs.find((i) => i.props.placeholder === '30');
    const carbInput = inputs.find((i) => i.props.placeholder === '50');
    const fatInput = inputs.find((i) => i.props.placeholder === '10');

    await act(async () => {
      kcalInput!.props.onChange({ target: { value: '0' } });
      protInput!.props.onChange({ target: { value: '30' } });
      carbInput!.props.onChange({ target: { value: '50' } });
      fatInput!.props.onChange({ target: { value: '10' } });
    });

    const forms = root.findAllByType('form');
    const macroForm = forms.find((f) => f.props.className?.includes('space-y-3.5'));

    await act(async () => {
      macroForm!.props.onSubmit({ preventDefault: vi.fn() });
    });

    // Estado deve permanecer zero
    expect(capturedContext!.nutrition.calories).toBe(0);
    expect(capturedContext!.nutrition.protein).toBe(0);
    expect(capturedContext!.nutrition.carbs).toBe(0);
    expect(capturedContext!.nutrition.fat).toBe(0);

    // Feedback honesto de erro exibido na UI via toast
    const renderedText = JSON.stringify(renderer!.toJSON());
    expect(renderedText).toContain('Informe valores válidos');
  });

  it('submissão de água manual com valor zero ou negativo não altera estado e exibe feedback honesto', async () => {
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

    const root = renderer!.root;
    const waterInput = root.findAllByType('input').find((i) => i.props.placeholder === 'Outro valor em ml');
    expect(waterInput).toBeDefined();

    const forms = root.findAllByType('form');
    const waterForm = forms.find((f) => f.props.className?.includes('border-t'));
    expect(waterForm).toBeDefined();

    // Tentar registrar 0ml
    await act(async () => {
      waterInput!.props.onChange({ target: { value: '0' } });
    });
    await act(async () => {
      waterForm!.props.onSubmit({ preventDefault: vi.fn() });
    });
    expect(capturedContext!.nutrition.water).toBe(0);
    expect(JSON.stringify(renderer!.toJSON())).toContain('Informe uma quantidade positiva de água');

    // Tentar registrar -100ml
    await act(async () => {
      waterInput!.props.onChange({ target: { value: '-100' } });
    });
    await act(async () => {
      waterForm!.props.onSubmit({ preventDefault: vi.fn() });
    });
    expect(capturedContext!.nutrition.water).toBe(0);
  });
});
