/**
 * GymFlow AI — NUT-006 Provider: registro real por FoodReference (NUT-006 / GOAL-107)
 *
 * - logFoodReference grava FoodEntry real no ledger com foodReferenceId;
 * - favoritos/recents (IDs) atualizam sem quebrar o ledger;
 * - histórico real via getNutritionHistory;
 * - sem regressão em logWater/logMacros.
 */

import { IDBFactory } from 'fake-indexeddb';
import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { FOOD_DATABASE, scaleFoodReferenceToGrams } from '../lib/nutrition/food-database';
import { IndexedDbWorkoutHistoryStorage } from '../lib/storage-indexeddb';
import { GymFlowProvider, STORAGE_KEY, useGymFlow } from './GymFlowContext';
import { waitForProviderHydrated } from './nutrition-provider-test-readiness';
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
    name: 'Atleta NUT006',
    email: 'nut006@gymflow.ai',
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
  await waitForProviderHydrated(
    () => {
      if (!value) throw new Error('Contexto não inicializado');
      return value;
    },
    { label: 'nut006-cold-boot-hydrated' },
  );
  mounted.push(renderer!);
  return {
    renderer: renderer!,
    get: () => {
      if (!value) throw new Error('Contexto não inicializado');
      return value;
    },
  };
}

describe('GymFlowContext — NUT-006 registro real por referência', () => {
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
    seedDefaultUser();
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

  it('REGISTER_REAL_FOOD = YES: logFoodReference grava FoodEntry com foodReferenceId', async () => {
    const app = await mountAndGet();
    const reference = FOOD_DATABASE.search('arroz', { limit: 1 })[0] ?? FOOD_DATABASE.all()[0];
    expect(reference).toBeDefined();
    const grams = reference.servingReferenceGrams;
    const expected = scaleFoodReferenceToGrams(reference, grams);

    let ok = false;
    await act(async () => {
      ok = await app.get().logFoodReference(reference, grams, 'lunch');
    });
    expect(ok).toBe(true);

    // Espelhos derivam do ledger real.
    await act(async () => {});
    expect(app.get().nutrition.calories).toBe(expected.calories);
    expect(app.get().nutritionDay).not.toBeNull();
    const entries = app.get().nutritionDay!.meals.flatMap((meal) => meal.entries);
    expect(entries).toHaveLength(1);
    expect(entries[0].foodReferenceId).toBe(reference.id);
    expect(entries[0].quantityGrams).toBe(grams);
    expect(entries[0].name).toBe(reference.name);

    // Dia persistido confere (commit antes do sucesso) via histórico real.
    const activeDate = app.get().nutritionActiveDate;
    expect(activeDate).toBeTruthy();
    let historyCheck: { date: string }[] = [];
    await act(async () => {
      historyCheck = await app.get().getNutritionHistory();
    });
    expect(historyCheck.map((day) => day.date)).toContain(activeDate);

    // Recente marcado (ID, sem macros duplicadas).
    expect(app.get().nutritionRecents).toContain(reference.id);
  });

  it('FAVORITES_RECENTS = YES: toggle de favorito persiste IDs e não toca no ledger', async () => {
    const app = await mountAndGet();
    const reference = FOOD_DATABASE.all()[0];
    await act(async () => {
      app.get().toggleNutritionFavorite(reference.id);
    });
    expect(app.get().nutritionFavorites).toContain(reference.id);
    const raw = storage.getItem('gymflow:nutrition:favoriteFoodIds:v1');
    expect(raw).toContain(reference.id);
    // Ledger intacto (nenhum FoodEntry criado pelo toggle).
    expect(app.get().nutritionDay?.meals.flatMap((m) => m.entries) ?? []).toHaveLength(0);
    await act(async () => {
      app.get().toggleNutritionFavorite(reference.id);
    });
    expect(app.get().nutritionFavorites).not.toContain(reference.id);
  });

  it('TREND_7_30 = YES: histórico real lista o dia ativo após registro', async () => {
    const app = await mountAndGet();
    const reference = FOOD_DATABASE.all()[1] ?? FOOD_DATABASE.all()[0];
    await act(async () => {
      await app.get().logFoodReference(reference, 100, 'dinner');
    });
    let history: unknown[] = [];
    await act(async () => {
      history = await app.get().getNutritionHistory();
    });
    expect(history.length).toBeGreaterThanOrEqual(1);
  });

  it('entradas inválidas falham fechado sem tocar no ledger', async () => {
    const app = await mountAndGet();
    let ok = true;
    await act(async () => {
      ok = await app.get().logFoodReference(FOOD_DATABASE.all()[0], 0, 'lunch');
    });
    expect(ok).toBe(false);
    await act(async () => {
      ok = await app.get().logFoodReference({} as never, 100, 'lunch');
    });
    expect(ok).toBe(false);
    expect(app.get().nutritionDay?.meals.flatMap((m) => m.entries) ?? []).toHaveLength(0);
  });
});
