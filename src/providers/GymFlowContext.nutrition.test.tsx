import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { GymFlowProvider, STORAGE_KEY, useGymFlow } from './GymFlowContext';
import { MONOLITHIC_STORAGE_VERSION } from '../lib/storage-types';
import type { UserProfile } from '../types';

type GymFlowValue = ReturnType<typeof useGymFlow>;

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

let storage: MemoryLocalStorage;
let windowStub: EventTarget & { localStorage: MemoryLocalStorage; location: { reload: () => void } };
let documentStub: EventTarget & { visibilityState: string };
const originalWindow = Reflect.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Reflect.getOwnPropertyDescriptor(globalThis, 'document');

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Atleta Teste',
    email: 'atleta@gymflow.ai',
    level: 'intermediate',
    goal: 'hypertrophy',
    gender: 'male',
    age: 28,
    weight: 80.5,
    height: 178,
    frequency: 4,
    xp: 100,
    points: 100,
    streak: 3,
    waterIntake: 0,
    waterGoal: 3000,
    weeklyPlan: [],
    ...overrides,
  };
}

function seedPersistedStorage(dataOverrides: Record<string, unknown> = {}): void {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      v: MONOLITHIC_STORAGE_VERSION,
      savedAt: '2026-09-07T10:00:00.000Z',
      data: {
        user: makeUser(),
        weeklyPlan: [],
        customPrograms: [],
        activeWorkout: null,
        activeWorkoutStartedAt: null,
        restTimerEndAt: null,
        restTimerTotalSeconds: null,
        restTimerLabel: null,
        workoutHistory: [],
        weightHistory: [],
        measurementsHistory: [],
        nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
        achievements: [],
        challenges: [],
        favoriteExercises: [],
        recentlyViewedVideoIds: [],
        ...dataOverrides,
      },
    })
  );
}

interface Mounted {
  renderer: TestRenderer.ReactTestRenderer;
  context: () => GymFlowValue;
  unmount: () => Promise<void>;
}

const mountedInstances: Mounted[] = [];

async function mountProvider(): Promise<Mounted> {
  let contextValue: GymFlowValue | null = null;

  const Probe = () => {
    contextValue = useGymFlow();
    return null;
  };

  const tree = (
    <ToastProvider>
      <GymFlowProvider>
        <Probe />
      </GymFlowProvider>
    </ToastProvider>
  );

  let renderer: TestRenderer.ReactTestRenderer | null = null;
  await act(async () => {
    renderer = TestRenderer.create(<StrictMode>{tree}</StrictMode>);
  });

  const handle: Mounted = {
    renderer: renderer as unknown as TestRenderer.ReactTestRenderer,
    context: () => {
      if (!contextValue) throw new Error('Contexto não inicializado');
      return contextValue;
    },
    unmount: async () => {
      await act(async () => {
        renderer?.unmount();
      });
    },
  };

  mountedInstances.push(handle);
  return handle;
}

describe('GymFlowContext — Nutrição e Idempotência de XP (NUT-001)', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    storage = new MemoryLocalStorage();
    windowStub = new EventTarget() as EventTarget & {
      localStorage: MemoryLocalStorage;
      location: { reload: () => void };
    };
    windowStub.localStorage = storage;
    windowStub.location = { reload: vi.fn() };
    documentStub = new EventTarget() as EventTarget & { visibilityState: string };
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

  afterEach(async () => {
    vi.useRealTimers();
    while (mountedInstances.length > 0) {
      const handle = mountedInstances.pop();
      await handle?.unmount();
    }
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

  it('nutrition inicia em zeros sem storage (elimina seed demo 1420/110/150/45/1200)', async () => {
    const app = await mountProvider();
    const ctx = app.context();

    expect(ctx.nutrition).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      water: 0,
    });
  });

  it('dados reais persistidos continuam hidratando corretamente', async () => {
    seedPersistedStorage({
      nutrition: {
        calories: 1850,
        protein: 140,
        carbs: 190,
        fat: 55,
        water: 2500,
        lastMacroLoggedDate: '2026-09-06',
      },
    });

    const app = await mountProvider();
    const ctx = app.context();

    expect(ctx.nutrition.calories).toBe(1850);
    expect(ctx.nutrition.protein).toBe(140);
    expect(ctx.nutrition.carbs).toBe(190);
    expect(ctx.nutrition.fat).toBe(55);
    expect(ctx.nutrition.water).toBe(2500);
  });

  it('input macro válido é registrado e soma aos valores existentes', async () => {
    const app = await mountProvider();
    const ctx = app.context();

    let accepted = false;
    await act(async () => {
      accepted = ctx.logMacros(500, 40, 60, 10);
    });

    expect(accepted).toBe(true);
    expect(app.context().nutrition.calories).toBe(500);
    expect(app.context().nutrition.protein).toBe(40);
    expect(app.context().nutrition.carbs).toBe(60);
    expect(app.context().nutrition.fat).toBe(10);

    // Segundo registro válido soma
    await act(async () => {
      accepted = app.context().logMacros(300, 20, 30, 5);
    });

    expect(accepted).toBe(true);
    expect(app.context().nutrition.calories).toBe(800);
    expect(app.context().nutrition.protein).toBe(60);
    expect(app.context().nutrition.carbs).toBe(90);
    expect(app.context().nutrition.fat).toBe(15);
  });

  it('calorias zero, negativas, NaN e fora do range são rejeitadas sem mutar estado nem conceder XP', async () => {
    seedPersistedStorage({
      user: makeUser({ xp: 100 }),
      nutrition: { calories: 500, protein: 30, carbs: 50, fat: 10, water: 0 },
    });

    const app = await mountProvider();
    const initialUserXp = app.context().user!.xp;

    // Calorias zero
    let result = false;
    await act(async () => {
      result = app.context().logMacros(0, 30, 50, 10);
    });
    expect(result).toBe(false);

    // Calorias negativas
    await act(async () => {
      result = app.context().logMacros(-100, 30, 50, 10);
    });
    expect(result).toBe(false);

    // Calorias NaN
    await act(async () => {
      result = app.context().logMacros(Number.NaN, 30, 50, 10);
    });
    expect(result).toBe(false);

    // Calorias >= 15000
    await act(async () => {
      result = app.context().logMacros(15000, 30, 50, 10);
    });
    expect(result).toBe(false);

    // Nenhuma mutação ocorreu
    expect(app.context().nutrition.calories).toBe(500);
    expect(app.context().nutrition.protein).toBe(30);
    expect(app.context().user!.xp).toBe(initialUserXp);
  });

  it('macros negativos, NaN ou out-of-range são rejeitados sem alterar nutrição', async () => {
    seedPersistedStorage({
      nutrition: { calories: 500, protein: 30, carbs: 50, fat: 10, water: 0 },
    });

    const app = await mountProvider();

    // Proteína negativa
    let result = false;
    await act(async () => {
      result = app.context().logMacros(400, -5, 50, 10);
    });
    expect(result).toBe(false);

    // Carbos >= 1000
    await act(async () => {
      result = app.context().logMacros(400, 30, 1000, 10);
    });
    expect(result).toBe(false);

    // Gordura NaN
    await act(async () => {
      result = app.context().logMacros(400, 30, 50, Number.NaN);
    });
    expect(result).toBe(false);

    // Estado permanece inalterado
    expect(app.context().nutrition.calories).toBe(500);
    expect(app.context().nutrition.protein).toBe(30);
    expect(app.context().nutrition.carbs).toBe(50);
    expect(app.context().nutrition.fat).toBe(10);
  });

  it('primeiro registro válido do dia concede até 20 XP; segundo registro no mesmo dia concede 0 XP adicional', async () => {
    seedPersistedStorage({
      user: makeUser({ xp: 200 }),
    });

    const app = await mountProvider();
    const initialXp = app.context().user!.xp;

    // 1º registro válido do dia -> +20 XP
    let success = false;
    await act(async () => {
      success = app.context().logMacros(400, 30, 50, 10);
    });
    expect(success).toBe(true);
    expect(app.context().user!.xp).toBe(initialXp + 20);

    // 2º registro válido no mesmo dia -> 0 XP adicional
    await act(async () => {
      success = app.context().logMacros(350, 25, 40, 8);
    });
    expect(success).toBe(true);
    expect(app.context().user!.xp).toBe(initialXp + 20); // Continua 220 XP

    // Nutrição somou ambos
    expect(app.context().nutrition.calories).toBe(750);
    expect(app.context().nutrition.protein).toBe(55);
  });

  it('a trava de XP por data civil sobrevive a reload/hidratação de storage', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Simula estado salvo onde o usuário já registrou refeição hoje
    seedPersistedStorage({
      user: makeUser({ xp: 500 }),
      nutrition: {
        calories: 600,
        protein: 45,
        carbs: 70,
        fat: 15,
        water: 1000,
        lastMacroLoggedDate: today,
      },
    });

    const app = await mountProvider();
    expect(app.context().user!.xp).toBe(500);

    // Tentativa de novo registro no mesmo dia após reload
    let success = false;
    await act(async () => {
      success = app.context().logMacros(300, 25, 30, 5);
    });

    expect(success).toBe(true);
    // Não concede XP adicional porque a trava sobreviveu à hidratação
    expect(app.context().user!.xp).toBe(500);
    // Mas a nutrição é somada com sucesso
    expect(app.context().nutrition.calories).toBe(900);
    expect(app.context().nutrition.protein).toBe(70);
  });

  it('no dia seguinte civil, o primeiro registro válido volta a conceder até 20 XP', async () => {
    // Estado com último registro em dia anterior
    seedPersistedStorage({
      user: makeUser({ xp: 300 }),
      nutrition: {
        calories: 2000,
        protein: 150,
        carbs: 220,
        fat: 60,
        water: 3000,
        lastMacroLoggedDate: '2026-09-06',
      },
    });

    const app = await mountProvider();

    // Hoje é outro dia civil (ex.: 2026-09-07)
    let success = false;
    await act(async () => {
      success = app.context().logMacros(450, 35, 50, 12);
    });

    expect(success).toBe(true);
    expect(app.context().user!.xp).toBe(320); // +20 XP concedido
  });

  it('água manual zero, negativa ou inválida não altera estado', async () => {
    seedPersistedStorage({
      user: makeUser({ waterIntake: 500 }),
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 500 },
    });

    const app = await mountProvider();

    let accepted = false;
    await act(async () => {
      accepted = app.context().logWater(0);
    });
    expect(accepted).toBe(false);

    await act(async () => {
      accepted = app.context().logWater(-250);
    });
    expect(accepted).toBe(false);

    await act(async () => {
      accepted = app.context().logWater(Number.NaN);
    });
    expect(accepted).toBe(false);

    expect(app.context().nutrition.water).toBe(500);
    expect(app.context().user!.waterIntake).toBe(500);
  });

  it('água positiva é registrada e atualiza estado de nutrição e do usuário', async () => {
    seedPersistedStorage({
      user: makeUser({ waterIntake: 500, waterGoal: 3000 }),
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 500 },
    });

    const app = await mountProvider();

    let accepted = false;
    await act(async () => {
      accepted = app.context().logWater(250);
    });

    expect(accepted).toBe(true);
    expect(app.context().nutrition.water).toBe(750);
    expect(app.context().user!.waterIntake).toBe(750);
  });
});
