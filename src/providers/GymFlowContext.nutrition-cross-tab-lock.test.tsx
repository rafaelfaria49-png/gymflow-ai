/**
 * GymFlow AI — Admin nutricional sob Web Locks no Provider real (GOAL-089).
 *
 * Prova no nível do Provider (com o fake determinístico como
 * `navigator.locks` global):
 * - WRITER_BEFORE_ADMIN = OBSERVED_BY_PROBE (race writer→export ⇒ deferred);
 * - ADMIN_BEFORE_WRITER = BLOCKED (export de outra aba retém logWater);
 * - logWater/logMacros durante EXCLUSIVE: sem commit, sem mirror, sem XP,
 *   sem datas — e sucesso único após a liberação (sem sucesso falso antes);
 * - ADMIN_WITHOUT_WEB_LOCK = BLOCKED_FAIL_CLOSED nas seis operações, com
 *   writers nutricionais normais e zero execução parcial;
 * - ADMIN_THROW_RELEASE no Provider (throw inesperado ⇒ lock liberado,
 *   próximo admin funciona);
 * - TOCTOU_OVER_TTL no Provider (fence expirado não esconde consumo);
 * - regressão: 20 logWater concorrentes sem lost update.
 */

import { IDBFactory } from 'fake-indexeddb';
import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { NUTRITION_ADMIN_WEB_LOCK_NAME } from '../lib/nutrition/admin-lock';
import {
  createDeferred,
  installFakeNutritionCrossTabLocks,
  restoreFakeNutritionCrossTabLocks,
  restoreGlobalWebLocksAfterTest,
  suppressGlobalWebLocksForTest,
  type FakeNutritionCrossTabLockManager,
} from '../lib/nutrition/admin-lock-fake';
import { createProfileAbsentSnapshot } from '../lib/nutrition/gate-snapshot';
import { addHydrationEntry } from '../lib/nutrition/ledger';
import { IndexedDbWorkoutHistoryStorage } from '../lib/storage-indexeddb';
import type { UserProfile } from '../types';
import { GymFlowProvider, STORAGE_KEY, useGymFlow } from './GymFlowContext';

type GymFlowValue = ReturnType<typeof useGymFlow>;

const LOCK = NUTRITION_ADMIN_WEB_LOCK_NAME;

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
let reloadSpy: ReturnType<typeof vi.fn>;
let locks: FakeNutritionCrossTabLockManager;
const originalWindow = Reflect.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Reflect.getOwnPropertyDescriptor(globalThis, 'document');
const originalIndexedDb = Reflect.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const mounted: TestRenderer.ReactTestRenderer[] = [];

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Atleta XTab',
    email: 'xtab@gymflow.ai',
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

function seedEmptyLedger(): void {
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

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}

function makeConsumptionDay(date: string) {
  const base = {
    id: `nutrition-day-${date}`,
    date,
    timezone: 'America/Sao_Paulo',
    targetState: 'MANUAL_ONLY' as const,
    targets: null,
    targetUnavailableReason: 'PROFILE_ABSENT' as const,
    gateSnapshot: createProfileAbsentSnapshot('2026-09-12T14:00:00.000Z'),
    meals: [],
    hydrationEntries: [],
    isClosed: false,
    closedAt: null,
  };
  return addHydrationEntry(base as never, {
    id: `hyd-xtab-${date}`,
    amountMl: 500,
    loggedAt: '2026-09-12T14:00:00.000Z',
  }) as never;
}

async function pendingSettled<T>(promise: Promise<T>, ms = 30): Promise<{ settled: boolean; value?: T }> {
  let outcome: { settled: boolean; value?: T } = { settled: false };
  void promise.then((value) => {
    outcome = { settled: true, value };
  });
  await new Promise((resolve) => setTimeout(resolve, ms));
  return outcome;
}

describe('GOAL-089 — Provider sob Web Locks (cross-tab)', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    storage = new MemoryLocalStorage();
    reloadSpy = vi.fn();
    const windowStub = Object.assign(new EventTarget(), {
      localStorage: storage,
      location: { reload: reloadSpy },
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
    locks = installFakeNutritionCrossTabLocks();
  });

  afterEach(async () => {
    restoreFakeNutritionCrossTabLocks();
    restoreGlobalWebLocksAfterTest();
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

  it('WRITER_BEFORE_ADMIN = OBSERVED_BY_PROBE: write commita primeiro, export defere', async () => {
    seedEmptyLedger();
    const app = await mountAndGet();
    await settle();

    const writer = new IndexedDbWorkoutHistoryStorage();
    await writer.open();
    try {
      let exportResult: Awaited<ReturnType<GymFlowValue['exportLogicalBackupV2']>> | null = null;
      await act(async () => {
        // Writer SHARED primeiro; export EXCLUSIVE enfileira atrás e a sonda
        // sob o fence vê o consumo commitado.
        const writePromise = writer.putNutritionDay(makeConsumptionDay('2026-09-12'));
        const exportPromise = app.get().exportLogicalBackupV2();
        const [, exp] = await Promise.all([writePromise, exportPromise]);
        exportResult = exp;
      });
      expect(exportResult).toEqual({ ok: false, reason: 'nutrition-ledger-admin-deferred' });
      expect(reloadSpy).not.toHaveBeenCalled();
    } finally {
      await writer.close();
    }
  });

  it('ADMIN_BEFORE_WRITER = BLOCKED: export de outra aba retém logWater sem commit parcial', async () => {
    seedEmptyLedger();
    const app = await mountAndGet();
    await settle();
    const waterBefore = app.get().nutrition.water;
    const xpBefore = app.get().user?.xp ?? 0;

    // Outra aba retém o EXCLUSIVE (admin em andamento).
    const releaseAdminTab = createDeferred<void>();
    const adminTabEntered = createDeferred<void>();
    const adminTab = locks.request(LOCK, { mode: 'exclusive' }, async () => {
      adminTabEntered.resolve();
      await releaseAdminTab.promise;
      return 'admin-tab-done';
    });
    await adminTabEntered.promise;
    expect(locks.hasExclusiveHolder(LOCK)).toBe(true);

    // logWater não commita enquanto o admin durar (pendente, sem put).
    // (logWater tem prefixo async de leituras antes do primeiro shared lock:
    // aguardar o ticket enfileirar de forma determinística, sem sleep de TTL.)
    const waterPromise = app.get().logWater(250);
    await vi.waitFor(() => {
      expect(locks.pendingCount(LOCK)).toBe(1);
    });
    const whilePending = await pendingSettled(waterPromise);
    expect(whilePending.settled).toBe(false);
    // Zero mirror, zero XP, zero datas durante a espera.
    expect(app.get().nutrition.water).toBe(waterBefore);
    expect(app.get().user?.waterIntake).toBe(0);
    expect(app.get().user?.xp ?? 0).toBe(xpBefore);

    releaseAdminTab.resolve();
    await expect(adminTab).resolves.toBe('admin-tab-done');
    let ok: boolean | null = null;
    await act(async () => {
      ok = await waterPromise;
    });
    // Sem sucesso falso antes do write real: true só após commitar, uma vez.
    expect(ok).toBe(true);
    await settle();
    expect(app.get().nutrition.water).toBe(waterBefore + 250);
  });

  it('logMacros durante EXCLUSIVE: pendente sem mirror/XP e commita uma vez após liberar', async () => {
    seedEmptyLedger();
    const app = await mountAndGet();
    await settle();
    const caloriesBefore = app.get().nutrition.calories;
    const xpBefore = app.get().user?.xp ?? 0;

    const releaseAdminTab = createDeferred<void>();
    const adminTabEntered = createDeferred<void>();
    const adminTab = locks.request(LOCK, { mode: 'exclusive' }, async () => {
      adminTabEntered.resolve();
      await releaseAdminTab.promise;
      return 'admin-tab-done';
    });
    await adminTabEntered.promise;

    const macrosPromise = app.get().logMacros(400, 30, 50, 10);
    const whilePending = await pendingSettled(macrosPromise);
    expect(whilePending.settled).toBe(false);
    expect(app.get().nutrition.calories).toBe(caloriesBefore);
    expect(app.get().user?.xp ?? 0).toBe(xpBefore);

    releaseAdminTab.resolve();
    await expect(adminTab).resolves.toBe('admin-tab-done');
    let ok: boolean | null = null;
    await act(async () => {
      ok = await macrosPromise;
    });
    expect(ok).toBe(true);
    await settle();
    expect(app.get().nutrition.calories).toBe(caloriesBefore + 400);
  });

  it('export do Provider aguarda admin de outra aba e conclui ok em ledger vazio', async () => {
    seedEmptyLedger();
    const app = await mountAndGet();
    await settle();

    const releaseAdminTab = createDeferred<void>();
    const adminTabEntered = createDeferred<void>();
    const adminTab = locks.request(LOCK, { mode: 'exclusive' }, async () => {
      adminTabEntered.resolve();
      await releaseAdminTab.promise;
      return 'admin-tab-done';
    });
    await adminTabEntered.promise;

    const exportPromise = app.get().exportLogicalBackupV2();
    expect(locks.pendingCount(LOCK)).toBe(1);
    const whilePending = await pendingSettled(exportPromise);
    expect(whilePending.settled).toBe(false);

    releaseAdminTab.resolve();
    await expect(adminTab).resolves.toBe('admin-tab-done');
    let result: Awaited<ReturnType<GymFlowValue['exportLogicalBackupV2']>> | null = null;
    await act(async () => {
      result = await exportPromise;
    });
    expect(result).toMatchObject({ ok: true });
  });

  it('ADMIN_WITHOUT_WEB_LOCK = BLOCKED_FAIL_CLOSED: seis ops indisponíveis, writers normais, zero parcial', async () => {
    seedEmptyLedger();
    const app = await mountAndGet();
    await settle();
    const coreBefore = storage.getItem(STORAGE_KEY);

    // Suprime até a Web Locks nativa: nenhuma exclusão cross-tab disponível.
    restoreFakeNutritionCrossTabLocks();
    suppressGlobalWebLocksForTest();
    try {
      const LOCKED = 'nutrition-admin-lock-unavailable';

      let exported: Awaited<ReturnType<GymFlowValue['exportLogicalBackupV2']>> | null = null;
      await act(async () => {
        exported = await app.get().exportLogicalBackupV2();
      });
      expect(exported).toEqual({ ok: false, reason: LOCKED });

      let imported: Awaited<ReturnType<GymFlowValue['importLogicalBackupV2']>> | null = null;
      await act(async () => {
        imported = await app.get().importLogicalBackupV2({
          raw: '{"format":"gymflow-backup"}',
          declaredBytes: 30,
          expectedPayloadDigest: 'sha256:0',
        });
      });
      expect(imported).toMatchObject({ ok: false, reason: LOCKED, requiresReload: false });
      expect((imported as unknown as { message?: unknown }).message).toEqual(expect.any(String));

      let inspectedRestore: Awaited<ReturnType<GymFlowValue['inspectLogicalRestoreV2']>> | null = null;
      await act(async () => {
        inspectedRestore = await app.get().inspectLogicalRestoreV2();
      });
      expect(inspectedRestore).toMatchObject({ status: 'error', reason: LOCKED });

      let committedRestore: Awaited<ReturnType<GymFlowValue['commitLogicalRestoreV2']>> | null = null;
      await act(async () => {
        committedRestore = await app.get().commitLogicalRestoreV2();
      });
      expect(committedRestore).toMatchObject({ ok: false, reason: LOCKED, requiresReload: false });

      let inspectedReset: Awaited<ReturnType<GymFlowValue['inspectLogicalResetV2']>> | null = null;
      await act(async () => {
        inspectedReset = await app.get().inspectLogicalResetV2();
      });
      expect(inspectedReset).toMatchObject({ status: 'error', reason: LOCKED });

      let committedReset: Awaited<ReturnType<GymFlowValue['commitLogicalResetV2']>> | null = null;
      await act(async () => {
        committedReset = await app.get().commitLogicalResetV2();
      });
      expect(committedReset).toMatchObject({ ok: false, reason: LOCKED, requiresReload: false });

      // Zero execução parcial: core intacto, sem reload, ledger inalterado.
      expect(storage.getItem(STORAGE_KEY)).toBe(coreBefore);
      expect(reloadSpy).not.toHaveBeenCalled();

      // Writers nutricionais seguem normais sem Web Locks.
      let waterOk: boolean | null = null;
      await act(async () => {
        waterOk = await app.get().logWater(250);
      });
      expect(waterOk).toBe(true);
      await settle();
      expect(app.get().nutrition.water).toBe(250);
    } finally {
      restoreGlobalWebLocksAfterTest();
    }
  });

  it('ADMIN_THROW_RELEASE no Provider: throw inesperado libera o lock; próximo admin funciona', async () => {
    seedEmptyLedger();
    const app = await mountAndGet();
    await settle();

    const acquireSpy = vi
      .spyOn(IndexedDbWorkoutHistoryStorage.prototype, 'acquireNutritionAdminFence')
      .mockRejectedValueOnce(new Error('boom-idb'));
    let thrown: unknown = null;
    await act(async () => {
      thrown = await app.get().exportLogicalBackupV2().then(
        () => null,
        (error: unknown) => error,
      );
    });
    expect((thrown as Error).message).toBe('boom-idb');
    acquireSpy.mockRestore();

    // Lock liberado apesar do throw: próximo admin prossegue normalmente.
    expect(locks.isHeld(LOCK)).toBe(false);
    let second: Awaited<ReturnType<GymFlowValue['exportLogicalBackupV2']>> | null = null;
    await act(async () => {
      second = await app.get().exportLogicalBackupV2();
    });
    expect(second).toMatchObject({ ok: true });
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('TOCTOU_OVER_TTL no Provider: fence expirado não esconde consumo (deferred)', async () => {
    seedEmptyLedger();
    const app = await mountAndGet();
    await settle();
    const coreBefore = storage.getItem(STORAGE_KEY);

    // Outra aba planta fence que já nasce expirado (crash/stale simulado).
    const holder = new IndexedDbWorkoutHistoryStorage();
    await holder.open();
    try {
      await holder.acquireNutritionAdminFence({
        ownerId: 'owner-stale-089',
        operationId: 'op-stale-089',
        operationKind: 'export',
        ttlMs: -1000,
      });
    } finally {
      await holder.close();
    }

    // Consumo commita (stale removido na transação do writer) e o export do
    // Provider — mesmo com o fence expirado no caminho — defere em vez de
    // omitir.
    const writer = new IndexedDbWorkoutHistoryStorage();
    await writer.open();
    try {
      await writer.putNutritionDay(makeConsumptionDay('2026-09-12'));
    } finally {
      await writer.close();
    }

    let result: Awaited<ReturnType<GymFlowValue['exportLogicalBackupV2']>> | null = null;
    await act(async () => {
      result = await app.get().exportLogicalBackupV2();
    });
    expect(result).toEqual({ ok: false, reason: 'nutrition-ledger-admin-deferred' });
    expect(storage.getItem(STORAGE_KEY)).toBe(coreBefore);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('regressão: 20 logWater concorrentes sem lost update', async () => {
    seedEmptyLedger();
    const app = await mountAndGet();
    await settle();

    await act(async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, () => app.get().logWater(50)),
      );
      expect(results.every((ok) => ok === true)).toBe(true);
    });
    await settle();
    expect(app.get().nutrition.water).toBe(1000);
  });
});
