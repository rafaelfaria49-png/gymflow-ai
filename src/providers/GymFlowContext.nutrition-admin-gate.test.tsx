/**
 * GymFlow AI — Admin lógico ledger-aware (GOAL-100; gate GOAL-085 REMOVIDO)
 *
 * O NUT-004C integra nutritionDays + nutritionMetadata ao formato lógico
 * (schema 2, section nutritionLedger obrigatória). Não há mais bloqueio
 * temporário: export inclui o ledger; import/restore/reset aplicam core+ledger
 * com verificação cruzada; schema 1 + ledger ativo falha fechado com
 * legacy-backup-with-active-ledger (sem reload, sem wipe).
 */

import { IDBFactory } from 'fake-indexeddb';
import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { waitForCondition, waitForProviderHydrated } from './nutrition-provider-test-readiness';
import { installFakeNutritionCrossTabLocks, restoreFakeNutritionCrossTabLocks } from '../lib/nutrition/admin-lock-fake';
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
  // GOAL-091: readiness por condição real (hidratação assentada: ready, blocked
  // ou write-error), sem sleep fixo. StrictMode preservado (double effects
  // tolerados pela espera da prontidão final). O P3 com classificação blocked
  // também assenta aqui; os testes admin com ledger ativo/vazio assentam em
  // ready+hybrid-v2 e seguem determinísticos.
  await waitForProviderHydrated(
    () => {
      if (!value) throw new Error('Contexto não inicializado');
      return value;
    },
    { label: 'admin-gate-cold-boot-settled' },
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

/**
 * GOAL-091: sincronização pós-escrita por condição real (espelho esperado).
 * Para casos de bloqueio (fail-closed, sem setState), não há espera — a
 * operação já foi awaitada e o caminho bloqueado nunca agenda atualização;
 * assert imediato é determinístico.
 */
async function waitForNutrition(
  get: () => GymFlowValue,
  predicate: (ctx: GymFlowValue) => boolean,
  label: string,
): Promise<void> {
  await waitForCondition(() => predicate(get()), { label });
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
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
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

  it('ADMIN_GATE_REMOVED: export com ledger ativo inclui a section (schema 2)', async () => {
    seedRealConsumption();
    const app = await mountAndGet();
    await waitForNutrition(app.get, (ctx) => ctx.nutrition.calories === 1850, 'gate-ledger-migrated-1850');
    expect(app.get().nutrition.calories).toBe(1850);

    let result: Awaited<ReturnType<GymFlowValue['exportLogicalBackupV2']>> | null = null;
    await act(async () => {
      result = await app.get().exportLogicalBackupV2();
    });
    expect(result).toMatchObject({ ok: true });
    const content = (result as unknown as { ok: boolean; content?: string }).content as string;
    const parsed = JSON.parse(content) as {
      logicalSchemaVersion: number;
      nutritionLedger: { days: unknown[]; activeDate: unknown };
    };
    expect(parsed.logicalSchemaVersion).toBe(2);
    expect(Array.isArray(parsed.nutritionLedger.days)).toBe(true);
    expect(parsed.nutritionLedger.days.length).toBeGreaterThan(0);
  });

  it('OLD_BACKUP_SAFE (provider): arquivo inválido recusa antes de write; core/ledger intactos', async () => {
    seedRealConsumption();
    const app = await mountAndGet();
    await waitForNutrition(app.get, (ctx) => ctx.nutrition.calories === 1850, 'gate-ledger-migrated-1850');
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
    expect(result).toMatchObject({ ok: false, requiresReload: false });
    expect((result as { reason?: string } | null)?.reason).not.toBe('nutrition-ledger-admin-deferred');

    expect(storage.getItem(STORAGE_KEY)).toBe(coreBefore);
    expect(await readLedgerSnapshot()).toEqual(ledgerBefore);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('RESET_LEDGER_COMPLETE (provider): reset com ledger ativo zera e recarrega', async () => {
    seedRealConsumption();
    const app = await mountAndGet();
    await waitForNutrition(app.get, (ctx) => ctx.nutrition.calories === 1850, 'gate-ledger-migrated-1850');

    let inspected: Awaited<ReturnType<GymFlowValue['inspectLogicalResetV2']>> | null = null;
    await act(async () => {
      inspected = await app.get().inspectLogicalResetV2();
    });
    expect((inspected as { reason?: string } | null)?.reason).not.toBe('nutrition-ledger-admin-deferred');

    let result: Awaited<ReturnType<GymFlowValue['commitLogicalResetV2']>> | null = null;
    await act(async () => {
      result = await app.get().commitLogicalResetV2();
    });
    expect(result).toMatchObject({ ok: true, requiresReload: true });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 700));
    expect(reloadSpy).toHaveBeenCalled();
  });

  it('RESTORE sem predecessor: sem gate; sem alvo não há write nem reload', async () => {
    seedRealConsumption();
    const app = await mountAndGet();
    await waitForNutrition(app.get, (ctx) => ctx.nutrition.calories === 1850, 'gate-ledger-migrated-1850');
    const coreBefore = storage.getItem(STORAGE_KEY);
    const ledgerBefore = await readLedgerSnapshot();

    let inspected: Awaited<ReturnType<GymFlowValue['inspectLogicalRestoreV2']>> | null = null;
    await act(async () => {
      inspected = await app.get().inspectLogicalRestoreV2();
    });
    expect((inspected as { reason?: string } | null)?.reason).not.toBe('nutrition-ledger-admin-deferred');

    let result: Awaited<ReturnType<GymFlowValue['commitLogicalRestoreV2']>> | null = null;
    await act(async () => {
      result = await app.get().commitLogicalRestoreV2();
    });
    expect((result as unknown as { ok?: boolean } | null)?.ok).toBe(false);
    expect((result as { reason?: string } | null)?.reason).not.toBe('nutrition-ledger-admin-deferred');

    expect(storage.getItem(STORAGE_KEY)).toBe(coreBefore);
    expect(await readLedgerSnapshot()).toEqual(ledgerBefore);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('NO_LEDGER_RESURRECTION (provider): reset zera; remount não ressuscita consumo', async () => {
    seedRealConsumption();
    const app = await mountAndGet();
    await waitForNutrition(app.get, (ctx) => ctx.nutrition.calories === 1850, 'gate-ledger-migrated-1850');

    await act(async () => {
      await app.get().commitLogicalResetV2();
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 700));
    expect(reloadSpy).toHaveBeenCalled();

    const app2 = await mountAndGet();
    await waitForNutrition(app2.get, (ctx) => ctx.nutrition.calories === 0, 'reset-remount-zero-mirrors');
    expect(app2.get().nutrition.calories).toBe(0);
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
    // GOAL-091: mount já garante hidratação assentada (P3 classifica blocked);
    // ledger vazio (sem dia, sem marker) é a condição real, sem sleep.
    await mountAndGet();
    const snapshot = await readLedgerSnapshot();
    expect(JSON.parse(snapshot.daysJson)).toEqual([]);
    expect(JSON.parse(snapshot.markerJson)).toBeNull();
  });
});
