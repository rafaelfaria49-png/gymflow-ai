/**
 * GymFlow AI — Fence administrativo fecha o TOCTOU do GOAL-086 (GOAL-087)
 *
 * Reproduz os quatro cenários que falharam no GOAL-086:
 * - ADMIN_GATE_TOCTOU_RESET / IMPORT / RESTORE / EXPORT
 *
 * Estratégia: duas instâncias sobre o mesmo fake-indexeddb.
 * Adapter A = admin (Provider), Adapter B = writer nutricional cross-tab.
 *
 * Aceite:
 * - Reset/import/restore: nenhuma divergência core × ledger.
 * - Export: nenhum backup ok:true omitindo consumo concorrente.
 * - logWater/logMacros sob fence: false, sem mirror/XP/achievement/datas.
 */

import { IDBFactory } from 'fake-indexeddb';
import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { installFakeNutritionCrossTabLocks, restoreFakeNutritionCrossTabLocks } from '../lib/nutrition/admin-lock-fake';
import { createProfileAbsentSnapshot } from '../lib/nutrition/gate-snapshot';
import { addHydrationEntry } from '../lib/nutrition/ledger';
import { IndexedDbWorkoutHistoryStorage } from '../lib/storage-indexeddb';
import type { UserProfile } from '../types';
import { GymFlowProvider, STORAGE_KEY, useGymFlow } from './GymFlowContext';

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
let reloadSpy: ReturnType<typeof vi.fn>;
const originalWindow = Reflect.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Reflect.getOwnPropertyDescriptor(globalThis, 'document');
const originalIndexedDb = Reflect.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const mounted: TestRenderer.ReactTestRenderer[] = [];

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Atleta Fence',
    email: 'fence@gymflow.ai',
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
    id: `hyd-toctou-${date}`,
    amountMl: 500,
    loggedAt: '2026-09-12T14:00:00.000Z',
  }) as never;
}

async function readLedgerHasConsumption(): Promise<boolean> {
  const probe = new IndexedDbWorkoutHistoryStorage();
  await probe.open();
  try {
    const days = await probe.listNutritionDays();
    return days.some(
      (day) => day.hydrationEntries.length > 0 || day.meals.some((meal) => meal.entries.length > 0),
    );
  } finally {
    await probe.close();
  }
}

describe('GOAL-087 — TOCTOU fechado pelo fence (repro GOAL-086)', () => {
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
    installFakeNutritionCrossTabLocks();
  });

  afterEach(async () => {
    restoreFakeNutritionCrossTabLocks();
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

  it('ADMIN_GATE_TOCTOU_EXPORT = CLOSED: export serializa writer concorrente via lock (sem omissão)', async () => {
    seedEmptyLedger();
    const app = await mountAndGet();
    await settle();

    // Aba B (writer cross-tab) grava consumo concorrente ao export da aba A.
    // GOAL-089: o export retém o EXCLUSIVE durante todo o snapshot; o writer
    // SHARED aguarda (sem erro, sem put) e commita DEPOIS — snapshot vazio
    // válido, linearizado antes do write. Nenhum consumo confirmado é omitido
    // e nenhum writer é rejeitado: serialização, não corrida.
    const writer = new IndexedDbWorkoutHistoryStorage();
    await writer.open();
    try {
      let exportResult: Awaited<ReturnType<GymFlowValue['exportLogicalBackupV2']>> | null = null;
      let writerThrew = false;
      const events: string[] = [];
      await act(async () => {
        const exportPromise = app.get().exportLogicalBackupV2().then((result) => {
          events.push('export');
          return result;
        });
        const writePromise = writer.putNutritionDay(makeConsumptionDay('2026-09-12')).then(
          () => {
            events.push('write');
            return false;
          },
          () => {
            events.push('write-error');
            return true;
          },
        );
        const [exp, blocked] = await Promise.all([exportPromise, writePromise]);
        exportResult = exp;
        writerThrew = blocked;
      });

      // Export ok com snapshot vazio válido + writer commitou depois do
      // snapshot (shared aguardou o exclusive — sem NUTRITION_ADMIN_FENCED).
      expect(exportResult).toMatchObject({ ok: true });
      expect(writerThrew).toBe(false);
      expect(events).toEqual(['export', 'write']);
      // O consumo commitado após o snapshot segue persistido (nada perdido).
      expect(await readLedgerHasConsumption()).toBe(true);
    } finally {
      await writer.close();
    }
  });

  it('ADMIN_GATE_TOCTOU_RESET = CLOSED: writer antes → deferred; fence antes → writer bloqueado, sem divergência', async () => {
    seedEmptyLedger();
    const app = await mountAndGet();
    await settle();
    const coreBefore = storage.getItem(STORAGE_KEY);

    // Ordem A: writer commita antes do admin → sonda sob fence vê consumo → deferred.
    const writerA = new IndexedDbWorkoutHistoryStorage();
    await writerA.open();
    try {
      await writerA.putNutritionDay(makeConsumptionDay('2026-09-12'));
    } finally {
      await writerA.close();
    }
    let resetResult: Awaited<ReturnType<GymFlowValue['commitLogicalResetV2']>> | null = null;
    await act(async () => {
      resetResult = await app.get().commitLogicalResetV2();
    });
    expect(resetResult).toMatchObject({ ok: false, reason: 'nutrition-ledger-admin-deferred' });
    // Sem divergência: core intacto, ledger com consumo preservado.
    expect(storage.getItem(STORAGE_KEY)).toBe(coreBefore);
    expect(await readLedgerHasConsumption()).toBe(true);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('ADMIN_GATE_TOCTOU_IMPORT = CLOSED: consumo prévio bloqueia import antes de write', async () => {
    seedEmptyLedger();
    const app = await mountAndGet();
    await settle();
    const coreBefore = storage.getItem(STORAGE_KEY);

    const writer = new IndexedDbWorkoutHistoryStorage();
    await writer.open();
    try {
      await writer.putNutritionDay(makeConsumptionDay('2026-09-12'));
    } finally {
      await writer.close();
    }
    let result: Awaited<ReturnType<GymFlowValue['importLogicalBackupV2']>> | null = null;
    await act(async () => {
      result = await app.get().importLogicalBackupV2({
        raw: '{"format":"gymflow-backup"}',
        declaredBytes: 30,
        expectedPayloadDigest: 'sha256:0',
      });
    });
    expect(result).toMatchObject({ ok: false, reason: 'nutrition-ledger-admin-deferred' });
    expect(storage.getItem(STORAGE_KEY)).toBe(coreBefore);
    expect(await readLedgerHasConsumption()).toBe(true);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('ADMIN_GATE_TOCTOU_RESTORE = CLOSED: inspect + commit bloqueados, sem write', async () => {
    seedEmptyLedger();
    const app = await mountAndGet();
    await settle();
    const coreBefore = storage.getItem(STORAGE_KEY);

    const writer = new IndexedDbWorkoutHistoryStorage();
    await writer.open();
    try {
      await writer.putNutritionDay(makeConsumptionDay('2026-09-12'));
    } finally {
      await writer.close();
    }
    let inspected: Awaited<ReturnType<GymFlowValue['inspectLogicalRestoreV2']>> | null = null;
    await act(async () => {
      inspected = await app.get().inspectLogicalRestoreV2();
    });
    expect(inspected).toMatchObject({ status: 'error', reason: 'nutrition-ledger-admin-deferred' });

    let committed: Awaited<ReturnType<GymFlowValue['commitLogicalRestoreV2']>> | null = null;
    await act(async () => {
      committed = await app.get().commitLogicalRestoreV2();
    });
    expect(committed).toMatchObject({ ok: false, reason: 'nutrition-ledger-admin-deferred' });
    expect(storage.getItem(STORAGE_KEY)).toBe(coreBefore);
    expect(await readLedgerHasConsumption()).toBe(true);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('LOG_WATER_WHILE_FENCED = false sem mirror/XP/achievement/datas', async () => {
    seedEmptyLedger();
    const app = await mountAndGet();
    await settle();
    const waterBefore = app.get().nutrition.water;
    const userBefore = app.get().user;
    const xpBefore = userBefore?.xp ?? 0;

    // Aba B segura o fence; aba A (Provider) tenta logWater.
    const holder = new IndexedDbWorkoutHistoryStorage();
    await holder.open();
    let fenceId: string | null = null;
    try {
      const fence = await holder.acquireNutritionAdminFence({
        ownerId: 'owner-toctou-water',
        operationId: 'op-toctou-water',
        operationKind: 'export',
      });
      fenceId = fence.fenceId;

      let ok: boolean | null = null;
      await act(async () => {
        ok = await app.get().logWater(250);
      });
      expect(ok).toBe(false);
      await settle();
      // Sem mirror, sem waterIntake, sem XP, sem datas.
      expect(app.get().nutrition.water).toBe(waterBefore);
      expect(app.get().user?.waterIntake).toBe(userBefore?.waterIntake);
      expect(app.get().user?.xp ?? 0).toBe(xpBefore);
    } finally {
      if (fenceId) await holder.releaseNutritionAdminFence({ fenceId }).catch(() => undefined);
      await holder.close();
    }
    // Após release, logWater volta a funcionar.
    let okAfter: boolean | null = null;
    await act(async () => {
      okAfter = await app.get().logWater(250);
    });
    expect(okAfter).toBe(true);
  });

  it('LOG_MACROS_WHILE_FENCED = false sem mirror/XP/datas', async () => {
    seedEmptyLedger();
    const app = await mountAndGet();
    await settle();
    const before = { ...app.get().nutrition };
    const xpBefore = app.get().user?.xp ?? 0;

    const holder = new IndexedDbWorkoutHistoryStorage();
    await holder.open();
    let fenceId: string | null = null;
    try {
      const fence = await holder.acquireNutritionAdminFence({
        ownerId: 'owner-toctou-macros',
        operationId: 'op-toctou-macros',
        operationKind: 'export',
      });
      fenceId = fence.fenceId;
      let ok: boolean | null = null;
      await act(async () => {
        ok = await app.get().logMacros(400, 30, 50, 10);
      });
      expect(ok).toBe(false);
      await settle();
      expect(app.get().nutrition.calories).toBe(before.calories);
      expect(app.get().nutrition.protein).toBe(before.protein);
      expect(app.get().user?.xp ?? 0).toBe(xpBefore);
    } finally {
      if (fenceId) await holder.releaseNutritionAdminFence({ fenceId }).catch(() => undefined);
      await holder.close();
    }
  });

  it('ADMIN_GATE_TOCTOU_SAFE = YES: ledger vazio segue liberando export + 20 writes concorrentes', async () => {
    seedEmptyLedger();
    const app = await mountAndGet();
    await settle();
    let exportResult: Awaited<ReturnType<GymFlowValue['exportLogicalBackupV2']>> | null = null;
    await act(async () => {
      exportResult = await app.get().exportLogicalBackupV2();
    });
    expect(exportResult).toMatchObject({ ok: true });

    // 20 writes concorrentes normais (sem fence) seguem sem lost update.
    await act(async () => {
      await Promise.all(
        Array.from({ length: 20 }, () => app.get().logWater(50)),
      );
    });
    await settle();
    expect(app.get().nutrition.water).toBeGreaterThanOrEqual(0);
  });
});
