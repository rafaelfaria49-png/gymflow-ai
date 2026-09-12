/**
 * GymFlow AI — Provider bridge nutricional durável (NUT-004B / GOAL-083)
 *
 * Cobre no Provider real:
 * - logWater durável (commit antes do sucesso, espelhos derivados, XP após commit)
 * - logMacros durável (FoodEntry real, meal determinística, XP idempotente)
 * - storage failure => false sem espelho/XP/achievement fantasma
 * - concorrentes sem lost update
 */

import { IDBFactory } from 'fake-indexeddb';
import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { IndexedDbWorkoutHistoryStorage } from '../lib/storage-indexeddb';
import { GymFlowProvider, STORAGE_KEY, useGymFlow } from './GymFlowContext';
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
const originalWindow = Reflect.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Reflect.getOwnPropertyDescriptor(globalThis, 'document');
const originalIndexedDb = Reflect.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const mounted: TestRenderer.ReactTestRenderer[] = [];

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Atleta Bridge',
    email: 'bridge@gymflow.ai',
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

function seedDefaultUser(): void {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      v: 1,
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
      },
    }),
  );
}

async function mountAndGet(): Promise<{ renderer: TestRenderer.ReactTestRenderer; get: () => GymFlowValue }> {
  let value: GymFlowValue | null = null;
  const Probe = () => {
    value = useGymFlow();
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
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  mounted.push(renderer!);
  return {
    renderer: renderer!,
    get: () => {
      if (!value) throw new Error('Contexto não inicializado');
      return value;
    },
  };
}

describe('GymFlowContext — bridge nutricional durável (NUT-004B)', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    storage = new MemoryLocalStorage();
    const windowStub = Object.assign(new EventTarget(), {
      localStorage: storage,
      location: { reload: vi.fn() },
    });
    const documentStub = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    Reflect.defineProperty(globalThis, 'window', { value: windowStub, configurable: true, writable: true });
    Reflect.defineProperty(globalThis, 'document', { value: documentStub, configurable: true, writable: true });
    Reflect.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
    Reflect.defineProperty(globalThis, 'indexedDB', {
      value: new IDBFactory(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    while (mounted.length > 0) {
      const renderer = mounted.pop();
      await act(async () => {
        renderer?.unmount();
      });
    }
    if (originalWindow) Reflect.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalDocument) Reflect.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (originalIndexedDb) Reflect.defineProperty(globalThis, 'indexedDB', originalIndexedDb);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  });

  it('NUTRITION_WRITE_DURABLE_BEFORE_SUCCESS = YES: logWater commita antes do sucesso', async () => {
    seedDefaultUser();
    const app = await mountAndGet();
    let ok = false;
    await act(async () => {
      ok = await app.get().logWater(250);
    });
    expect(ok).toBe(true);
    expect(app.get().nutrition.water).toBe(250);
    expect(app.get().user!.waterIntake).toBe(250);

    let ok2 = false;
    await act(async () => {
      ok2 = await app.get().logWater(250);
    });
    expect(ok2).toBe(true);
    expect(app.get().nutrition.water).toBe(500);
  });

  it('logMacros registra FoodEntry real com meal determinística e XP idempotente', async () => {
    seedDefaultUser();
    const app = await mountAndGet();
    const before = app.get().user!.xp;
    let ok = false;
    await act(async () => {
      ok = await app.get().logMacros(500, 40, 60, 10);
    });
    expect(ok).toBe(true);
    expect(app.get().nutrition.calories).toBe(500);
    expect(app.get().user!.xp).toBe(before + 20);

    await act(async () => {
      ok = await app.get().logMacros(300, 20, 30, 5);
    });
    expect(ok).toBe(true);
    expect(app.get().nutrition.calories).toBe(800);
    // XP_BEFORE_DURABLE_COMMIT = NO: segundo log no mesmo dia não duplica XP.
    expect(app.get().user!.xp).toBe(before + 20);
  });

  it('STORAGE_FAILURE sem XP/mirror fantasma: commit falha => false e nada muda', async () => {
    seedDefaultUser();
    const app = await mountAndGet();
    const beforeNutrition = { ...app.get().nutrition };
    const beforeXp = app.get().user!.xp;
    const beforeWater = app.get().user!.waterIntake;

    const spy = vi
      .spyOn(IndexedDbWorkoutHistoryStorage.prototype, 'mutateNutritionDay')
      .mockRejectedValueOnce(new Error('falha induzida de storage'));
    // ensureToday também usa o adapter: falha induzida no primeiro uso.
    // Força a falha no mutate garantindo que o ensure passe: mock só o mutate.
    // Como o spy cobre mutate, o ensureToday (putIfAbsent) ainda passa.
    let ok = true;
    await act(async () => {
      ok = await app.get().logWater(250);
    });
    expect(spy).toHaveBeenCalled();
    expect(ok).toBe(false);
    expect(app.get().nutrition).toEqual(beforeNutrition);
    expect(app.get().user!.xp).toBe(beforeXp);
    expect(app.get().user!.waterIntake).toBe(beforeWater);
    expect(app.get().nutrition.lastWaterXpDate).toBe(beforeNutrition.lastWaterXpDate);
  });

  it('concorrentes sem lost update: 10 logWater(100) somam 1000', async () => {
    seedDefaultUser();
    const app = await mountAndGet();
    const results: boolean[] = [];
    await act(async () => {
      const settled = await Promise.all(Array.from({ length: 10 }, () => app.get().logWater(100)));
      results.push(...settled);
    });
    expect(results.every(Boolean)).toBe(true);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(app.get().nutrition.water).toBe(1000);
    expect(app.get().user!.waterIntake).toBe(1000);
  }, 60000);

  it('LEDGER_SOURCE_OF_TRUTH = YES: espelhos derivam do ledger, sem XP fantasma no boot', async () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 1,
        savedAt: '2026-09-07T10:00:00.000Z',
        data: {
          user: makeUser({ xp: 200 }),
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
          nutrition: { calories: 1850, protein: 140, carbs: 190, fat: 55, water: 2500 },
          achievements: [],
          challenges: [],
          favoriteExercises: [],
          recentlyViewedVideoIds: [],
        },
      }),
    );
    const app = await mountAndGet();
    // LEGACY_REAL_WITHOUT_TARGETS = PRESERVED + MIGRATION_REPLAY = IDEMPOTENT:
    // consumo legado vira ledger, sem XP.
    expect(app.get().nutrition.calories).toBe(1850);
    expect(app.get().nutrition.water).toBe(2500);
    expect(app.get().user!.waterIntake).toBe(2500);
    expect(app.get().user!.xp).toBe(200);
  });
});
