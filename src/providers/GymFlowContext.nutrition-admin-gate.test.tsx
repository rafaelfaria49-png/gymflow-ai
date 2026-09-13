/**
 * GymFlow AI — Gate temporário do admin lógico com ledger ativo (GOAL-085)
 *
 * Enquanto o NUT-004C não integra nutritionDays + nutritionMetadata ao formato
 * lógico, o Provider bloqueia as seis operações lógicas em hybrid-v2 quando há
 * consumo nutricional real — ANTES de qualquer write, sem sucesso parcial:
 * - exportLogicalBackupV2 (nenhum arquivo que omita o ledger é gerado);
 * - importLogicalBackupV2 (bloqueado antes de write);
 * - inspect/commit logical restore (bloqueados antes de write);
 * - inspect/commit logical reset (bloqueados antes de write).
 *
 * Razão pública tipada: nutrition-ledger-admin-deferred.
 */

import { IDBFactory } from 'fake-indexeddb';
import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { NUTRITION_LEDGER_ADMIN_DEFERRED_MESSAGE } from '../lib/nutrition/admin-gate';
import { IndexedDbWorkoutHistoryStorage } from '../lib/storage-indexeddb';
import type { UserProfile } from '../types';
import { GymFlowProvider, STORAGE_KEY, useGymFlow } from './GymFlowContext';

type GymFlowValue = ReturnType<typeof useGymFlow>;

const DEFERRED = 'nutrition-ledger-admin-deferred';

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
    name: 'Atleta Gate',
    email: 'gate@gymflow.ai',
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

function seedEnvelope(nutrition: unknown, extraData: Record<string, unknown> = {}): void {
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
        nutrition,
        achievements: [],
        challenges: [],
        favoriteExercises: [],
        recentlyViewedVideoIds: [],
        ...extraData,
      },
    }),
  );
}

function seedEmptyLedger(): void {
  seedEnvelope({ calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 });
}

function seedRealConsumption(): void {
  seedEnvelope({ calories: 1850, protein: 140, carbs: 190, fat: 55, water: 2500 });
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

/** Leitura independente do ledger pelo mesmo IDB do Provider (prova de não-escrita). */
async function readLedgerSnapshot(): Promise<{ daysJson: string; markerJson: string }> {
  const probe = new IndexedDbWorkoutHistoryStorage();
  await probe.open();
  try {
    const days = await probe.listNutritionDays();
    const marker = await probe.getNutritionMigrationMarker();
    return { daysJson: JSON.stringify(days), markerJson: JSON.stringify(marker) };
  } finally {
    await probe.close();
  }
}

describe('GymFlowContext — gate do admin lógico com ledger ativo (GOAL-085)', () => {
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

  it('LOGICAL_EXPORT_WITH_ACTIVE_LEDGER = BLOCKED: nenhum arquivo que omita o ledger', async () => {
    seedRealConsumption();
    const app = await mountAndGet();
    // Sanidade: consumo real chegou ao ledger.
    expect(app.get().nutrition.calories).toBe(1850);

    let result: Awaited<ReturnType<GymFlowValue['exportLogicalBackupV2']>> | null = null;
    await act(async () => {
      result = await app.get().exportLogicalBackupV2();
    });
    expect(result).toEqual({ ok: false, reason: DEFERRED });
  });

  it('LOGICAL_IMPORT_WITH_ACTIVE_LEDGER = BLOCKED antes de write; core/ledger intactos', async () => {
    seedRealConsumption();
    const app = await mountAndGet();
    await settle();
    const coreBefore = storage.getItem(STORAGE_KEY);
    const ledgerBefore = await readLedgerSnapshot();

    let result: Awaited<ReturnType<GymFlowValue['importLogicalBackupV2']>> | null = null;
    await act(async () => {
      result = await app.get().importLogicalBackupV2({
        raw: '{"format":"gymflow-backup"}',
        declaredBytes: 30,
        expectedPayloadDigest: 'sha256:0',
      });
    });
    expect(result).toMatchObject({
      ok: false,
      reason: DEFERRED,
      requiresReload: false,
      message: NUTRITION_LEDGER_ADMIN_DEFERRED_MESSAGE,
    });

    await settle();
    expect(storage.getItem(STORAGE_KEY)).toBe(coreBefore);
    expect(await readLedgerSnapshot()).toEqual(ledgerBefore);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('LOGICAL_RESET_WITH_ACTIVE_LEDGER = BLOCKED (inspect + execute); sem write, sem reload', async () => {
    seedRealConsumption();
    const app = await mountAndGet();
    await settle();
    const coreBefore = storage.getItem(STORAGE_KEY);
    const ledgerBefore = await readLedgerSnapshot();

    let inspected: Awaited<ReturnType<GymFlowValue['inspectLogicalResetV2']>> | null = null;
    await act(async () => {
      inspected = await app.get().inspectLogicalResetV2();
    });
    expect(inspected).toMatchObject({ status: 'error', reason: DEFERRED });

    let result: Awaited<ReturnType<GymFlowValue['commitLogicalResetV2']>> | null = null;
    await act(async () => {
      result = await app.get().commitLogicalResetV2();
    });
    expect(result).toMatchObject({ ok: false, reason: DEFERRED, requiresReload: false });

    await settle();
    expect(storage.getItem(STORAGE_KEY)).toBe(coreBefore);
    expect(await readLedgerSnapshot()).toEqual(ledgerBefore);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('LOGICAL_RESTORE_WITH_ACTIVE_LEDGER = BLOCKED (inspect + execute); sem write, sem reload', async () => {
    seedRealConsumption();
    const app = await mountAndGet();
    await settle();
    const coreBefore = storage.getItem(STORAGE_KEY);
    const ledgerBefore = await readLedgerSnapshot();

    let inspected: Awaited<ReturnType<GymFlowValue['inspectLogicalRestoreV2']>> | null = null;
    await act(async () => {
      inspected = await app.get().inspectLogicalRestoreV2();
    });
    expect(inspected).toMatchObject({ status: 'error', reason: DEFERRED });

    let result: Awaited<ReturnType<GymFlowValue['commitLogicalRestoreV2']>> | null = null;
    await act(async () => {
      result = await app.get().commitLogicalRestoreV2();
    });
    expect(result).toMatchObject({ ok: false, reason: DEFERRED, requiresReload: false });

    await settle();
    expect(storage.getItem(STORAGE_KEY)).toBe(coreBefore);
    expect(await readLedgerSnapshot()).toEqual(ledgerBefore);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('PARTIAL_ADMIN_WRITE = NO + LEDGER_RESURRECTION_PATH = CLOSED: bloqueio não altera nada nem ressuscita', async () => {
    seedRealConsumption();
    const app = await mountAndGet();
    const caloriesBefore = app.get().nutrition.calories;
    const waterBefore = app.get().nutrition.water;
    expect(caloriesBefore).toBe(1850);

    await act(async () => {
      await app.get().commitLogicalResetV2();
      await app.get().importLogicalBackupV2({ raw: '{}', declaredBytes: 2, expectedPayloadDigest: 'x' });
    });
    await settle();

    // Remount sobre o mesmo storage+IDB: estado contínuo, sem wipe e sem fantasma.
    const app2 = await mountAndGet();
    expect(app2.get().nutrition.calories).toBe(caloriesBefore);
    expect(app2.get().nutrition.water).toBe(waterBefore);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('ledger vazio: export lógico segue liberado (sem falso-positivo do gate)', async () => {
    seedEmptyLedger();
    const app = await mountAndGet();
    let result: Awaited<ReturnType<GymFlowValue['exportLogicalBackupV2']>> | null = null;
    await act(async () => {
      result = await app.get().exportLogicalBackupV2();
    });
    expect(result).toMatchObject({ ok: true });
  });

  it('P3: perfil persistido inválido nunca vira dia PROFILE_ABSENT', async () => {
    seedEnvelope(
      { calories: 1850, protein: 140, carbs: 190, fat: 55, water: 2500 },
      { nutritionProfile: { gender: 'male', goal: 'hypertrophy' } },
    );
    await mountAndGet();
    await settle();
    const snapshot = await readLedgerSnapshot();
    expect(JSON.parse(snapshot.daysJson)).toEqual([]);
    expect(JSON.parse(snapshot.markerJson)).toBeNull();
  });
});
