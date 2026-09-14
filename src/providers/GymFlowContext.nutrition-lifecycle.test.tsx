/**
 * GymFlow AI — Lifecycle/rollover nutricional no Provider real (NUT-004C / GOAL-094)
 *
 * Prova no nível do Provider, com o harness por condição do NUT-004B
 * (sem sleeps fixos para readiness):
 * - cold boot mesma data / dia seguinte (NUT-004B preservado);
 * - foreground mesma data / dia seguinte via visibilitychange;
 * - resume via appStateChange do Capacitor (mockado; falha fecha silencioso);
 * - timer cooperativo de foreground (60s, fake) atravessando a meia-noite;
 * - timer desarmado em background (NUTRITION_FOREGROUND_TIMER_ACTIVE = NO);
 * - meia-noite local que não coincide com UTC (America/Sao_Paulo, Kiritimati);
 * - resume duplicado + eventos concorrentes: um único dia por data;
 * - write imediatamente após midnight cai no dia novo (seção 8);
 * - histórico preservado, novo dia com consumo zero, sem XP duplicado.
 */

import { IDBFactory } from 'fake-indexeddb';
import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { NUTRITION_FOREGROUND_RECONCILE_INTERVAL_MS } from '../lib/nutrition/lifecycle';
import { IndexedDbWorkoutHistoryStorage } from '../lib/storage-indexeddb';
import { MONOLITHIC_STORAGE_VERSION } from '../lib/storage-types';
import type { UserProfile } from '../types';
import type { NutritionProfile } from '../types/nutrition';
import { GymFlowProvider, STORAGE_KEY, useGymFlow } from './GymFlowContext';
import { waitForProviderHydrated } from './nutrition-provider-test-readiness';

// Capacitor App mockado: captura listeners de appStateChange para simular o
// resume nativo de forma determinística (sem dispositivo, sem sleeps).
const appStateHook = vi.hoisted(() => ({
  listeners: [] as Array<(state: { isActive: boolean }) => void>,
  addListener: vi.fn(),
}));
vi.mock('@capacitor/app', () => ({
  App: { addListener: appStateHook.addListener },
}));

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
const originalIndexedDb = Reflect.getOwnPropertyDescriptor(globalThis, 'indexedDB');

function freezeClockAt(instant: Date, withInterval = false): void {
  vi.useFakeTimers(
    withInterval
      ? { toFake: ['Date', 'setInterval', 'clearInterval'], now: instant }
      : { toFake: ['Date'], now: instant },
  );
}

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Atleta Lifecycle',
    email: 'lifecycle@gymflow.ai',
    level: 'intermediate',
    goal: 'hypertrophy',
    gender: 'male',
    age: 28,
    weight: 80,
    height: 178,
    frequency: 4,
    duration: 60,
    location: 'gym',
    equipments: [],
    restrictions: [],
    muscleFocus: [],
    preference: '',
    xp: 100,
    points: 100,
    streak: 1,
    waterIntake: 0,
    waterGoal: 3000,
    premiumStatus: 'free',
    weeklyPlan: [],
    ...overrides,
  };
}

function makeNutritionProfile(timezone: string): NutritionProfile {
  return {
    age: 30,
    heightCm: 175,
    weightKg: 75,
    biologicalSexForCalcs: 'male',
    goal: 'maintenance',
    trainingFrequencyDaysPerWeek: 4,
    averageTrainingDurationMinutes: 60,
    nonExerciseActivity: 'moderately_active',
    dietaryPattern: 'omnivore',
    mealsPerDayPreference: 4,
    allergies: [],
    intolerances: [],
    avoidedFoods: [],
    healthFlags: [],
    timezone,
    updatedAt: '2026-09-09T10:00:00.000Z',
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
    }),
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
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  await act(async () => {
    renderer = TestRenderer.create(
      <StrictMode>
        <ToastProvider>
          <GymFlowProvider>
            <Probe />
          </GymFlowProvider>
        </ToastProvider>
      </StrictMode>,
    );
  });
  // Readiness por condição real (hidratação + cold boot assentados).
  await waitForProviderHydrated(
    () => {
      if (!contextValue) throw new Error('Contexto não inicializado');
      return contextValue;
    },
    { label: 'lifecycle-cold-boot-hydrated' },
  );
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

async function probeLedger(): Promise<{
  dates: string[];
  active: string | null;
  get: (date: string) => { isClosed: boolean; waterMl: number; calories: number } | null;
}> {
  const probe = new IndexedDbWorkoutHistoryStorage();
  await probe.open();
  try {
    const days = await probe.listNutritionDays();
    const active = await probe.getActiveNutritionDate();
    // Lê todos os resumos com a conexão aberta (o `get` devolvido é síncrono).
    const summaries = new Map(
      days.map((day) => {
        const waterMl = day.hydrationEntries.reduce((sum, entry) => sum + entry.amountMl, 0);
        const calories = day.meals.reduce(
          (sum, meal) => sum + meal.entries.reduce((inner, entry) => inner + entry.calories, 0),
          0,
        );
        return [day.date, { isClosed: day.isClosed, waterMl, calories }] as const;
      }),
    );
    return {
      dates: days.map((day) => day.date),
      active,
      get: (date: string) => summaries.get(date) ?? null,
    };
  } finally {
    await probe.close();
  }
}

async function dispatchVisibility(state: string): Promise<void> {
  await act(async () => {
    documentStub.visibilityState = state;
    documentStub.dispatchEvent(new Event('visibilitychange'));
  });
}

async function fireAppState(isActive: boolean): Promise<void> {
  await act(async () => {
    for (const listener of [...appStateHook.listeners]) listener({ isActive });
  });
}

/**
 * Espera por condição com wall-clock real (`performance.now`, nunca fakado
 * neste arquivo). O helper compartilhado mede timeout via `Date.now`, que
 * fica congelado sob `useFakeTimers({ toFake: ['Date'] })` — uma condição
 * não atendida poluiria os testes seguintes com pollers órfãos. Aqui o
 * timeout é sempre limitado (falha fechada e rápida).
 */
async function waitForReal(
  predicate: () => boolean | Promise<boolean>,
  label: string,
  timeoutMs = 5000,
): Promise<void> {
  const start = performance.now();
  for (;;) {
    let ok = false;
    try {
      ok = await predicate();
    } catch {
      ok = false;
    }
    if (ok) return;
    if (performance.now() - start >= timeoutMs) {
      throw new Error(`waitForReal timeout (${timeoutMs}ms): ${label}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

describe('GymFlowContext — lifecycle/rollover nutricional (NUT-004C)', () => {
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
    Reflect.defineProperty(globalThis, 'indexedDB', {
      value: new IDBFactory(),
      configurable: true,
      writable: true,
    });
    appStateHook.listeners.length = 0;
    appStateHook.addListener.mockImplementation(async (event: string, cb: (s: { isActive: boolean }) => void) => {
      if (event === 'appStateChange') appStateHook.listeners.push(cb);
      return { remove: vi.fn() };
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    while (mountedInstances.length > 0) {
      const handle = mountedInstances.pop();
      await handle?.unmount();
    }
    if (originalWindow) Reflect.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalDocument) Reflect.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (originalIndexedDb) Reflect.defineProperty(globalThis, 'indexedDB', originalIndexedDb);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  });

  it('cold boot mesma data: reusa o dia, sem duplicar e sem fechar', async () => {
    freezeClockAt(new Date('2026-09-12T13:00:00.000Z'));
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile('America/Sao_Paulo') });
    const app = await mountProvider();
    // 10:00 em America/Sao_Paulo.
    let ledger = await probeLedger();
    expect(ledger.dates).toEqual(['2026-09-12']);
    expect(ledger.active).toBe('2026-09-12');

    let ok = false;
    await act(async () => {
      ok = await app.context().logWater(500);
    });
    expect(ok).toBe(true);
    ledger = await probeLedger();
    expect(ledger.dates).toEqual(['2026-09-12']);
    expect((ledger.get('2026-09-12'))?.isClosed).toBe(false);
    expect(app.context().nutrition.water).toBe(500);
  });

  it('cold boot dia seguinte (remount): fecha anterior, preserva histórico, novo dia zerado', async () => {
    freezeClockAt(new Date('2026-09-12T13:00:00.000Z'));
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile('America/Sao_Paulo') });
    const dayOne = await mountProvider();
    await act(async () => {
      expect(await dayOne.context().logWater(500)).toBe(true);
      expect(await dayOne.context().logMacros(400, 30, 50, 10)).toBe(true);
    });
    await dayOne.unmount();

    // Dia seguinte: novo cold boot deve efetuar o rollover (NUT-004B preservado).
    vi.setSystemTime(new Date('2026-09-13T13:00:00.000Z'));
    const dayTwo = await mountProvider();
    await waitForReal(
      () => dayTwo.context().nutrition.water === 0 && dayTwo.context().nutrition.calories === 0,
      'lifecycle-cold-boot-next-day-mirrors',
    );
    const ledger = await probeLedger();
    expect(ledger.dates).toEqual(['2026-09-12', '2026-09-13']);
    expect(ledger.active).toBe('2026-09-13');
    expect(ledger.get('2026-09-12')).toEqual({ isClosed: true, waterMl: 500, calories: 400 });
    expect(ledger.get('2026-09-13')).toEqual({ isClosed: false, waterMl: 0, calories: 0 });
  });

  it('foreground mesma data: visibilitychange não cria novo dia', async () => {
    freezeClockAt(new Date('2026-09-12T13:00:00.000Z'));
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile('America/Sao_Paulo') });
    await mountProvider();
    // Mesmo dia => ensure retorna `existing-active` só com leituras: o espião
    // de leitura prova que o handler rodou (sem escrita e sem dia novo).
    const spy = vi.spyOn(IndexedDbWorkoutHistoryStorage.prototype, 'getNutritionDay');
    const baseline = spy.mock.calls.length;

    vi.setSystemTime(new Date('2026-09-12T15:00:00.000Z'));
    await dispatchVisibility('visible');
    await waitForReal(
      () => spy.mock.calls.length > baseline,
      'lifecycle-visibility-same-day-ran',
    );
    const ledger = await probeLedger();
    expect(ledger.dates).toEqual(['2026-09-12']);
    expect(ledger.active).toBe('2026-09-12');
  });

  it('foreground dia seguinte: visibilitychange efetua rollover antes de novo consumo', async () => {
    freezeClockAt(new Date('2026-09-12T13:00:00.000Z'));
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile('America/Sao_Paulo') });
    const app = await mountProvider();
    await act(async () => {
      expect(await app.context().logWater(500)).toBe(true);
    });

    vi.setSystemTime(new Date('2026-09-13T08:00:00.000Z'));
    await dispatchVisibility('visible');
    await waitForReal(
      () => app.context().nutrition.water === 0 && app.context().user?.waterIntake === 0,
      'lifecycle-foreground-next-day-mirrors',
    );
    const ledger = await probeLedger();
    expect(ledger.dates).toEqual(['2026-09-12', '2026-09-13']);
    expect(ledger.active).toBe('2026-09-13');
    expect(ledger.get('2026-09-12')).toEqual({ isClosed: true, waterMl: 500, calories: 0 });
    expect(ledger.get('2026-09-13')).toEqual({ isClosed: false, waterMl: 0, calories: 0 });

    // Novo consumo pós-rollover cai no dia novo.
    await act(async () => {
      expect(await app.context().logWater(250)).toBe(true);
    });
    expect((await probeLedger()).active).toBe('2026-09-13');
    expect(((await probeLedger()).get('2026-09-13'))?.waterMl).toBe(250);
    expect(((await probeLedger()).get('2026-09-12'))?.waterMl).toBe(500);
  });

  it('appStateChange ativo: resume nativo reconcilia (e falha fecha silencioso)', async () => {
    freezeClockAt(new Date('2026-09-12T13:00:00.000Z'));
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile('America/Sao_Paulo') });
    const app = await mountProvider();
    // Assinatura do resume nativo armada no foreground.
    await waitForReal(
      () => appStateHook.addListener.mock.calls.length > 0,
      'lifecycle-appstate-subscribed',
    );
    await act(async () => {
      expect(await app.context().logWater(500)).toBe(true);
    });

    vi.setSystemTime(new Date('2026-09-13T08:00:00.000Z'));
    await fireAppState(true);
    await waitForReal(() => app.context().nutrition.water === 0, 'lifecycle-appstate-next-day-mirrors');
    const ledger = await probeLedger();
    expect(ledger.dates).toEqual(['2026-09-12', '2026-09-13']);
    expect((ledger.get('2026-09-12'))?.isClosed).toBe(true);
  });

  it('timer cooperativo: 60s em foreground atravessa a meia-noite local', async () => {
    expect(NUTRITION_FOREGROUND_RECONCILE_INTERVAL_MS).toBe(60_000);
    // 23:59 em America/Sao_Paulo.
    freezeClockAt(new Date('2026-09-13T02:59:00.000Z'), true);
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile('America/Sao_Paulo') });
    const app = await mountProvider();
    await act(async () => {
      expect(await app.context().logWater(500)).toBe(true);
    });
    expect((await probeLedger()).dates).toEqual(['2026-09-12']);

    // 00:01 do dia seguinte: o tick cooperativo detecta a virada.
    vi.setSystemTime(new Date('2026-09-13T03:01:00.000Z'));
    await act(async () => {
      vi.advanceTimersByTime(NUTRITION_FOREGROUND_RECONCILE_INTERVAL_MS);
    });
    await waitForReal(() => app.context().nutrition.water === 0, 'lifecycle-timer-midnight-mirrors');
    const ledger = await probeLedger();
    expect(ledger.dates).toEqual(['2026-09-12', '2026-09-13']);
    expect(ledger.active).toBe('2026-09-13');
    expect(ledger.get('2026-09-12')).toEqual({ isClosed: true, waterMl: 500, calories: 0 });
    expect(ledger.get('2026-09-13')).toEqual({ isClosed: false, waterMl: 0, calories: 0 });
  });

  it('BACKGROUND_TIMER_ACTIVE = NO: em hidden o timer não reconcilia; ao voltar, reconcile imediato', async () => {
    freezeClockAt(new Date('2026-09-13T02:59:00.000Z'), true);
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile('America/Sao_Paulo') });
    const app = await mountProvider();
    await act(async () => {
      expect(await app.context().logWater(500)).toBe(true);
    });

    await dispatchVisibility('hidden');
    // Meia-noite atravessada em background: ticks não podem criar dia.
    vi.setSystemTime(new Date('2026-09-13T03:01:00.000Z'));
    await act(async () => {
      vi.advanceTimersByTime(10 * NUTRITION_FOREGROUND_RECONCILE_INTERVAL_MS);
    });
    let ledger = await probeLedger();
    expect(ledger.dates).toEqual(['2026-09-12']);
    expect(ledger.active).toBe('2026-09-12');
    expect(app.context().nutrition.water).toBe(500);

    // Ao retornar ao foreground, reconcile imediato antes da interação normal.
    await dispatchVisibility('visible');
    await waitForReal(() => app.context().nutrition.water === 0, 'lifecycle-return-foreground-mirrors');
    ledger = await probeLedger();
    expect(ledger.dates).toEqual(['2026-09-12', '2026-09-13']);
    expect((ledger.get('2026-09-12'))?.isClosed).toBe(true);
  });

  it('meia-noite local ≠ UTC (America/Sao_Paulo): mesma data UTC, dias locais distintos', async () => {
    // 23:30 local (09-12) = 02:30Z (09-13 em UTC); 00:30 local (09-13) = 03:30Z.
    freezeClockAt(new Date('2026-09-13T02:30:00.000Z'));
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile('America/Sao_Paulo') });
    const app = await mountProvider();
    expect((await probeLedger()).active).toBe('2026-09-12');
    await act(async () => {
      expect(await app.context().logWater(250)).toBe(true);
    });

    vi.setSystemTime(new Date('2026-09-13T03:30:00.000Z'));
    await dispatchVisibility('visible');
    await waitForReal(() => app.context().nutrition.water === 0, 'lifecycle-sp-local-midnight-mirrors');
    const ledger = await probeLedger();
    expect(ledger.dates).toEqual(['2026-09-12', '2026-09-13']);
    expect(ledger.get('2026-09-12')).toEqual({ isClosed: true, waterMl: 250, calories: 0 });
  });

  it('meia-noite local ≠ UTC (Pacific/Kiritimati UTC+14): virada adiantada ao UTC', async () => {
    // 23:30 local (09-12) = 09:30Z (09-12 em UTC); 00:30 local (09-13) = 10:30Z.
    freezeClockAt(new Date('2026-09-12T09:30:00.000Z'));
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile('Pacific/Kiritimati') });
    const app = await mountProvider();
    expect((await probeLedger()).active).toBe('2026-09-12');
    await act(async () => {
      expect(await app.context().logWater(250)).toBe(true);
    });

    vi.setSystemTime(new Date('2026-09-12T10:30:00.000Z'));
    await dispatchVisibility('visible');
    await waitForReal(() => app.context().nutrition.water === 0, 'lifecycle-kiritimati-local-midnight-mirrors');
    const ledger = await probeLedger();
    expect(ledger.dates).toEqual(['2026-09-12', '2026-09-13']);
    expect(ledger.get('2026-09-12')).toEqual({ isClosed: true, waterMl: 250, calories: 0 });
  });

  it('resume duplicado + eventos concorrentes: um único dia por data, sem XP duplicado', async () => {
    freezeClockAt(new Date('2026-09-12T13:00:00.000Z'), true);
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile('America/Sao_Paulo') });
    const app = await mountProvider();
    const baseXp = app.context().user!.xp;

    vi.setSystemTime(new Date('2026-09-13T08:00:00.000Z'));
    await act(async () => {
      // visibility ×2 + appState + timer + writes simultâneos.
      documentStub.visibilityState = 'visible';
      documentStub.dispatchEvent(new Event('visibilitychange'));
      documentStub.dispatchEvent(new Event('visibilitychange'));
      for (const listener of [...appStateHook.listeners]) listener({ isActive: true });
      vi.advanceTimersByTime(NUTRITION_FOREGROUND_RECONCILE_INTERVAL_MS);
      await Promise.all([
        app.context().logWater(100),
        app.context().logMacros(200, 20, 25, 5),
      ]);
    });
    await waitForReal(
      () => app.context().nutrition.water === 100 && app.context().nutrition.calories === 200,
      'lifecycle-concurrent-mirrors',
    );
    const ledger = await probeLedger();
    expect(ledger.dates).toEqual(['2026-09-12', '2026-09-13']);
    expect(ledger.active).toBe('2026-09-13');
    expect(ledger.get('2026-09-12')).toEqual({ isClosed: true, waterMl: 0, calories: 0 });
    expect(ledger.get('2026-09-13')).toEqual({ isClosed: false, waterMl: 100, calories: 200 });
    // XP idempotente do dia novo: +20 dos macros uma única vez, sem XP de água.
    expect(app.context().user!.xp).toBe(baseXp + 20);
  });

  it('MIDNIGHT_WRITE_TO_OLD_DAY = NO: write após midnight reconcilia sozinho', async () => {
    freezeClockAt(new Date('2026-09-12T13:00:00.000Z'));
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile('America/Sao_Paulo') });
    const app = await mountProvider();
    await act(async () => {
      expect(await app.context().logWater(500)).toBe(true);
    });

    // Meia-noite sem nenhum evento de lifecycle: o próprio write reconcilia.
    vi.setSystemTime(new Date('2026-09-13T08:00:00.000Z'));
    await act(async () => {
      expect(await app.context().logWater(250)).toBe(true);
    });
    expect(app.context().nutrition.water).toBe(250);
    const ledger = await probeLedger();
    expect(ledger.dates).toEqual(['2026-09-12', '2026-09-13']);
    expect(ledger.get('2026-09-12')).toEqual({ isClosed: true, waterMl: 500, calories: 0 });
    expect(ledger.get('2026-09-13')).toEqual({ isClosed: false, waterMl: 250, calories: 0 });
  });
});
