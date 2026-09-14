/**
 * GymFlow AI — In-flight keyed por contexto civil (NUT-004C-INFLIGHT / GOAL-096)
 *
 * P1 GOAL-095: uma reconciliação iniciada no dia civil D não pode ser
 * reutilizada por logWater/logMacros ou lifecycle cujo `now` já pertence a D+1.
 *
 * Prova no Provider real, determinística (sem sleeps fixos):
 * - MIDNIGHT_INFLIGHT_LOG_WATER_SAFE: reconcile A em D (barreira no repository),
 *   relógio avança para D+1, logWater, libera A → entry somente em D+1, D
 *   fechado, D+1 ativo, consumo de D preservado.
 * - MIDNIGHT_INFLIGHT_LOG_MACROS_SAFE: idem com logMacros (FoodEntry em D+1,
 *   XP no civilDate correto, sem duplicar).
 * - Origens lifecycle: visibility D → write D+1, timer D → write D+1,
 *   appState D → write D+1 (INFLIGHT_OLD_DAY_REUSED_BY_NEW_DAY_WRITE = NO).
 * - Encadeamento D → D+1 → D+1 → D+2 (D+1 deduplica, D+2 serializa, um único
 *   NutritionDay por data, nenhum resultado antigo publicado como novo).
 * - Mesmo dia: 10 chamadas simultâneas no mesmo civilDate deduplicam
 *   (uma única reconciliação, sem 10 reconciliations redundantes).
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

const TZ = 'America/Sao_Paulo';
// D = 2026-09-12 (10:00 SP), D+1 = 2026-09-13, D+2 = 2026-09-14.
const D_ISO = '2026-09-12T13:00:00.000Z';
const D1_ISO = '2026-09-13T13:00:00.000Z';
const D2_ISO = '2026-09-14T13:00:00.000Z';

function freezeClockAt(instant: Date, withInterval = false): void {
  vi.useFakeTimers(
    withInterval
      ? { toFake: ['Date', 'setInterval', 'clearInterval'], now: instant }
      : { toFake: ['Date'], now: instant },
  );
}

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Atleta InFlight',
    email: 'inflight@gymflow.ai',
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
  await waitForProviderHydrated(
    () => {
      if (!contextValue) throw new Error('Contexto não inicializado');
      return contextValue;
    },
    { label: 'inflight-cold-boot-hydrated' },
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
  get: (date: string) => { isClosed: boolean; waterMl: number; calories: number; foodEntries: number; hydrationEntries: number } | null;
}> {
  const probe = new IndexedDbWorkoutHistoryStorage();
  await probe.open();
  try {
    const days = await probe.listNutritionDays();
    const active = await probe.getActiveNutritionDate();
    const summaries = new Map(
      days.map((day) => {
        const waterMl = day.hydrationEntries.reduce((sum, entry) => sum + entry.amountMl, 0);
        const calories = day.meals.reduce(
          (sum, meal) => sum + meal.entries.reduce((inner, entry) => inner + entry.calories, 0),
          0,
        );
        const foodEntries = day.meals.reduce((sum, meal) => sum + meal.entries.length, 0);
        return [day.date, { isClosed: day.isClosed, waterMl, calories, foodEntries, hydrationEntries: day.hydrationEntries.length }] as const;
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

function createDeferred<T = void>(): { promise: Promise<T>; resolve: (v: T | PromiseLike<T>) => void; reject: (e?: unknown) => void } {
  let resolve!: (v: T | PromiseLike<T>) => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function pendingSettled<T>(promise: Promise<T>, ms = 30): Promise<{ settled: boolean; value?: T }> {
  let outcome: { settled: boolean; value?: T } = { settled: false };
  void promise.then((value) => {
    outcome = { settled: true, value };
  });
  await new Promise((resolve) => setTimeout(resolve, ms));
  return outcome;
}

/**
 * Barreira determinística no repository: segura a PRÓXIMA leitura
 * `getNutritionDay` (primeiro passo do ensure da reconciliação A em D).
 * Leituras de sonda (`list`/`getActive`) seguem livres, então o ledger pode
 * ser observado com A em voo. Chamadas posteriores (B em D+1) enfileiram na
 * chave nova sem tocar o repository até A liberar — exatamente a semântica
 * serializada exigida.
 */
function installReconcileBarrier(): { entered: Promise<void>; release: () => void; restore: () => void } {
  const original = IndexedDbWorkoutHistoryStorage.prototype.getNutritionDay;
  const enteredDeferred = createDeferred<void>();
  const releaseDeferred = createDeferred<void>();
  let blocked = true;
  let gateCount = 0;
  const spy = vi
    .spyOn(IndexedDbWorkoutHistoryStorage.prototype, 'getNutritionDay')
    .mockImplementation(async function (this: IndexedDbWorkoutHistoryStorage, date: string) {
      if (blocked && gateCount === 0) {
        gateCount += 1;
        enteredDeferred.resolve();
        await releaseDeferred.promise;
      }
      return original.call(this, date);
    });
  return {
    entered: enteredDeferred.promise,
    release: () => {
      blocked = false;
      releaseDeferred.resolve();
    },
    restore: () => {
      spy.mockRestore();
    },
  };
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

describe('GymFlowContext — in-flight keyed por contexto civil (NUT-004C-INFLIGHT/GOAL-096)', () => {
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

  it('MIDNIGHT_INFLIGHT_LOG_WATER_SAFE = YES: reconcile D em voo não é reusado por logWater em D+1', async () => {
    freezeClockAt(new Date(D_ISO));
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile(TZ) });
    const app = await mountProvider();
    await act(async () => {
      expect(await app.context().logWater(500)).toBe(true);
    });
    expect((await probeLedger()).get('2026-09-12')?.waterMl).toBe(500);

    const barrier = installReconcileBarrier();
    try {
      // A: reconcile de lifecycle em D, segurado na barreira do repository.
      await dispatchVisibility('visible');
      await barrier.entered;

      // Relógio avança para D+1; B: logWater captura `now` de D+1.
      vi.setSystemTime(new Date(D1_ISO));
      const waterPromise = app.context().logWater(250);
      const whilePending = await pendingSettled(waterPromise);
      // B enfileirou atrás de A (chave diferente): nada commitado ainda.
      expect(whilePending.settled).toBe(false);

      barrier.release();
      let ok = false;
      await act(async () => {
        ok = await waterPromise;
      });
      expect(ok).toBe(true);
      // Drenar espelhos do dia novo.
      await waitForReal(() => app.context().nutrition.water === 250, 'inflight-water-d1-mirrors');

      const ledger = await probeLedger();
      // Entry somente em D+1; D fechado; D+1 ativo; consumo de D preservado.
      expect(ledger.dates).toEqual(['2026-09-12', '2026-09-13']);
      expect(ledger.active).toBe('2026-09-13');
      expect(ledger.get('2026-09-12')).toMatchObject({ isClosed: true, waterMl: 500 });
      expect(ledger.get('2026-09-13')).toMatchObject({ isClosed: false, waterMl: 250 });
      // INFLIGHT_OLD_DAY_REUSED_BY_NEW_DAY_WRITE = NO.
      expect(ledger.get('2026-09-12')?.waterMl).toBe(500);
    } finally {
      barrier.restore();
    }
  });

  it('MIDNIGHT_INFLIGHT_LOG_MACROS_SAFE = YES: reconcile D em voo não é reusado por logMacros em D+1', async () => {
    freezeClockAt(new Date(D_ISO));
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile(TZ) });
    const app = await mountProvider();
    const baseXp = app.context().user!.xp;

    const barrier = installReconcileBarrier();
    try {
      await dispatchVisibility('visible');
      await barrier.entered;

      vi.setSystemTime(new Date(D1_ISO));
      const macrosPromise = app.context().logMacros(400, 30, 50, 10);
      const whilePending = await pendingSettled(macrosPromise);
      expect(whilePending.settled).toBe(false);

      barrier.release();
      let ok = false;
      await act(async () => {
        ok = await macrosPromise;
      });
      expect(ok).toBe(true);
      await waitForReal(
        () => app.context().nutrition.calories === 400,
        'inflight-macros-d1-mirrors',
      );

      const ledger = await probeLedger();
      // FoodEntry somente em D+1; XP no civilDate correto; sem duplicar.
      expect(ledger.dates).toEqual(['2026-09-12', '2026-09-13']);
      expect(ledger.active).toBe('2026-09-13');
      expect(ledger.get('2026-09-12')).toMatchObject({ isClosed: true, calories: 0, foodEntries: 0 });
      expect(ledger.get('2026-09-13')).toMatchObject({ isClosed: false, calories: 400, foodEntries: 1 });
      expect(app.context().user!.xp).toBe(baseXp + 20);
      expect(app.context().nutrition.lastMacroLoggedDate).toBe('2026-09-13');
    } finally {
      barrier.restore();
    }
  });

  it('VISIBILITY_D_TO_WRITE_D1 = PASS: visibility D em voo não serve write D+1', async () => {
    freezeClockAt(new Date(D_ISO));
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile(TZ) });
    const app = await mountProvider();
    await act(async () => {
      expect(await app.context().logWater(500)).toBe(true);
    });

    const barrier = installReconcileBarrier();
    try {
      await dispatchVisibility('visible');
      await barrier.entered;
      vi.setSystemTime(new Date(D1_ISO));
      const waterPromise = app.context().logWater(250);
      expect((await pendingSettled(waterPromise)).settled).toBe(false);
      barrier.release();
      await act(async () => {
        expect(await waterPromise).toBe(true);
      });
      await waitForReal(() => app.context().nutrition.water === 250, 'inflight-visibility-write-mirrors');
      const ledger = await probeLedger();
      expect(ledger.get('2026-09-12')).toMatchObject({ isClosed: true, waterMl: 500 });
      expect(ledger.get('2026-09-13')).toMatchObject({ isClosed: false, waterMl: 250 });
      // INFLIGHT_OLD_DAY_REUSED_BY_NEW_DAY_WRITE = NO.
      expect(ledger.dates).toEqual(['2026-09-12', '2026-09-13']);
    } finally {
      barrier.restore();
    }
  });

  it('TIMER_D_TO_WRITE_D1 = PASS: timer D em voo não serve write D+1', async () => {
    expect(NUTRITION_FOREGROUND_RECONCILE_INTERVAL_MS).toBe(60_000);
    freezeClockAt(new Date(D_ISO), true);
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile(TZ) });
    const app = await mountProvider();
    await act(async () => {
      expect(await app.context().logWater(500)).toBe(true);
    });

    const barrier = installReconcileBarrier();
    try {
      // A: tick cooperativo em D, segurado na barreira.
      await act(async () => {
        vi.advanceTimersByTime(NUTRITION_FOREGROUND_RECONCILE_INTERVAL_MS);
      });
      await barrier.entered;

      vi.setSystemTime(new Date(D1_ISO));
      const waterPromise = app.context().logWater(250);
      expect((await pendingSettled(waterPromise)).settled).toBe(false);
      barrier.release();
      await act(async () => {
        expect(await waterPromise).toBe(true);
      });
      await waitForReal(() => app.context().nutrition.water === 250, 'inflight-timer-write-mirrors');
      const ledger = await probeLedger();
      expect(ledger.get('2026-09-12')).toMatchObject({ isClosed: true, waterMl: 500 });
      expect(ledger.get('2026-09-13')).toMatchObject({ isClosed: false, waterMl: 250 });
    } finally {
      barrier.restore();
    }
  });

  it('APPSTATE_D_TO_WRITE_D1 = PASS: appState D em voo não serve write D+1', async () => {
    freezeClockAt(new Date(D_ISO));
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile(TZ) });
    const app = await mountProvider();
    await waitForReal(
      () => appStateHook.addListener.mock.calls.length > 0,
      'inflight-appstate-subscribed',
    );
    await act(async () => {
      expect(await app.context().logWater(500)).toBe(true);
    });

    const barrier = installReconcileBarrier();
    try {
      await fireAppState(true);
      await barrier.entered;

      vi.setSystemTime(new Date(D1_ISO));
      const waterPromise = app.context().logWater(250);
      expect((await pendingSettled(waterPromise)).settled).toBe(false);
      barrier.release();
      await act(async () => {
        expect(await waterPromise).toBe(true);
      });
      await waitForReal(() => app.context().nutrition.water === 250, 'inflight-appstate-write-mirrors');
      const ledger = await probeLedger();
      expect(ledger.get('2026-09-12')).toMatchObject({ isClosed: true, waterMl: 500 });
      expect(ledger.get('2026-09-13')).toMatchObject({ isClosed: false, waterMl: 250 });
    } finally {
      barrier.restore();
    }
  });

  it('encadeamento D → D+1 → D+1 → D+2: D+1 deduplica, D+2 serializa, um dia por data', async () => {
    freezeClockAt(new Date(D_ISO));
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile(TZ) });
    const app = await mountProvider();
    const baseXp = app.context().user!.xp;
    await act(async () => {
      expect(await app.context().logWater(500)).toBe(true);
    });

    const barrier = installReconcileBarrier();
    try {
      await dispatchVisibility('visible');
      await barrier.entered;

      // B: primeira chamada D+1.
      vi.setSystemTime(new Date(D1_ISO));
      const firstD1 = app.context().logWater(100);
      // C: chamada adicional D+1 (mesma chave: deve reutilizar a Promise de B).
      const secondD1 = app.context().logMacros(200, 20, 25, 5);
      // D: chamada D+2 (chave nova: agenda reconciliação posterior).
      vi.setSystemTime(new Date(D2_ISO));
      const d2 = app.context().logWater(50);

      expect((await pendingSettled(firstD1)).settled).toBe(false);
      expect((await pendingSettled(secondD1)).settled).toBe(false);
      expect((await pendingSettled(d2)).settled).toBe(false);

      barrier.release();
      await act(async () => {
        const [okB, okC, okD] = await Promise.all([firstD1, secondD1, d2]);
        expect(okB).toBe(true);
        expect(okC).toBe(true);
        expect(okD).toBe(true);
      });
      await waitForReal(
        () => app.context().nutrition.water === 50,
        'inflight-chain-d2-mirrors',
      );

      const ledger = await probeLedger();
      // Um único NutritionDay por data; nenhum resultado antigo publicado como novo.
      expect(ledger.dates).toEqual(['2026-09-12', '2026-09-13', '2026-09-14']);
      expect(ledger.active).toBe('2026-09-14');
      expect(ledger.get('2026-09-12')).toMatchObject({ isClosed: true, waterMl: 500, calories: 0 });
      // D+1 deduplica o reconcile mas comete os dois writes no dia correto.
      expect(ledger.get('2026-09-13')).toMatchObject({ isClosed: true, waterMl: 100, calories: 200, foodEntries: 1 });
      expect(ledger.get('2026-09-14')).toMatchObject({ isClosed: false, waterMl: 50, calories: 0 });
      // XP: somente os macros de D+1 (+20), sem duplicar.
      expect(app.context().user!.xp).toBe(baseXp + 20);
    } finally {
      barrier.restore();
    }
  });

  it('mesmo dia: 10 chamadas simultâneas deduplicam em uma única reconciliação', async () => {
    freezeClockAt(new Date(D_ISO));
    seedPersistedStorage({ nutritionProfile: makeNutritionProfile(TZ) });
    const app = await mountProvider();

    const spy = vi.spyOn(IndexedDbWorkoutHistoryStorage.prototype, 'getActiveNutritionDate');
    const baseline = spy.mock.calls.length;

    let results: boolean[] = [];
    await act(async () => {
      results = await Promise.all(Array.from({ length: 10 }, () => app.context().logWater(100)));
    });
    expect(results.every(Boolean)).toBe(true);
    await waitForReal(() => app.context().nutrition.water === 1000, 'inflight-sameday-mirrors');

    // Mesma chave civil: uma única reconciliação (sem 10 reconciliations).
    expect(spy.mock.calls.length - baseline).toBe(1);

    const ledger = await probeLedger();
    expect(ledger.dates).toEqual(['2026-09-12']);
    expect(ledger.active).toBe('2026-09-12');
    expect(ledger.get('2026-09-12')).toMatchObject({ isClosed: false, waterMl: 1000 });
    spy.mockRestore();
  });
});
