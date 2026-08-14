import { IDBFactory } from 'fake-indexeddb';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import {
  COMPLETION_RECEIPTS_STORE,
  GENERATION_MANIFESTS_STORE,
  GYMFLOW_INDEXEDDB_VERSION,
  STORAGE_OPERATION_RECEIPTS_STORE,
  WORKOUT_HISTORY_STORE,
} from '../lib/storage-indexeddb';
import { inspectLogicalStorageBackupV2 } from '../lib/storage-logical-backup';
import { parsePhysicalEnvelope } from '../lib/storage-hybrid';
import { MONOLITHIC_STORAGE_VERSION } from '../lib/storage-types';
import type {
  Achievement,
  Challenge,
  UserProfile,
  WeeklyWorkoutDay,
  WorkoutProgram,
  WorkoutSession,
} from '../types';
import { GymFlowProvider, STORAGE_KEY, useGymFlow } from './GymFlowContext';

// Integração real A → importação B → predecessor A → restore A.
// Zero mock do writer de restore.

type GymFlowValue = ReturnType<typeof useGymFlow>;
type InspectResult = Awaited<ReturnType<GymFlowValue['inspectLogicalRestoreV2']>>;
type RestoreResult = Awaited<ReturnType<GymFlowValue['commitLogicalRestoreV2']>>;
type ImportResult = Awaited<ReturnType<GymFlowValue['importLogicalBackupV2']>>;

const DAYS_ORDER = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

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

const underlying = new MemoryLocalStorage();
const storage = {
  getItem(key: string): string | null {
    return underlying.getItem(key);
  },
  setItem(key: string, value: string): void {
    underlying.setItem(key, value);
  },
  removeItem(key: string): void {
    underlying.removeItem(key);
  },
};

let reloadSpy: ReturnType<typeof vi.fn>;
let windowStub: EventTarget & {
  localStorage: typeof storage;
  location: { reload: ReturnType<typeof vi.fn> };
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
};
let documentStub: EventTarget & { visibilityState: string };
const originalWindow = Reflect.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Reflect.getOwnPropertyDescriptor(globalThis, 'document');
const originalIndexedDb = Reflect.getOwnPropertyDescriptor(globalThis, 'indexedDB');

function installBrowserGlobals(): void {
  underlying.values.clear();
  reloadSpy = vi.fn();
  windowStub = Object.assign(new EventTarget(), {
    localStorage: storage,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    location: { reload: reloadSpy },
  });
  documentStub = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  Object.defineProperty(globalThis, 'window', { value: windowStub, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'document', { value: documentStub, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
    writable: true,
  });
}

function restoreBrowserGlobals(): void {
  for (const [name, descriptor] of [
    ['window', originalWindow],
    ['document', originalDocument],
    ['indexedDB', originalIndexedDb],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
}

function mainKeyContent(): string | null {
  return storage.getItem(STORAGE_KEY);
}

function openRawDatabase(): Promise<IDBDatabase> {
  const request = (globalThis.indexedDB as IDBFactory)
    .open('gymflow-persistence', GYMFLOW_INDEXEDDB_VERSION);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function rawRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readOperationReceipts(): Promise<Array<{
  status: string;
  kind: string;
  operationId: string;
}>> {
  const db = await openRawDatabase();
  try {
    const transaction = db.transaction(STORAGE_OPERATION_RECEIPTS_STORE, 'readonly');
    const store = transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE);
    const rows = await rawRequest(store.getAll());
    return rows.map((row) => row as {
      status: string;
      kind: string;
      operationId: string;
    });
  } finally {
    db.close();
  }
}

const STARTED_AT = 1_784_000_000_000;

function makeSession(id: string, name: string): WorkoutSession {
  return {
    id,
    name,
    date: new Date(STARTED_AT).toISOString(),
    duration: 42,
    calories: 300,
    xpEarned: 50,
    prsDetected: [],
    status: 'completed',
    startedAt: STARTED_AT,
    exercises: [{
      id: `entry-${id}`,
      exerciseId: 'chest_supino_reto',
      name: 'Supino reto',
      muscleGroup: 'Peito',
      notes: '',
      entryOrigin: 'planned',
      sets: [{ id: `set-${id}`, reps: 10, weight: 60, completed: true }],
    }],
  };
}

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Rafael Silveira (Demo)',
    email: 'rafael.demo@gymflow.ai',
    level: 'intermediate',
    goal: 'hypertrophy',
    gender: 'male',
    age: 28,
    weight: 80.5,
    height: 178,
    frequency: 4,
    duration: 60,
    location: 'gym',
    equipments: [],
    restrictions: [],
    muscleFocus: [],
    preference: '',
    xp: 100,
    streak: 3,
    lastWorkoutDate: '2020-01-01',
    waterIntake: 0,
    waterGoal: 3000,
    premiumStatus: 'pro',
    points: 100,
    weeklyPlan: [],
    connectedSocials: [],
    ...overrides,
  };
}

function makeWeeklyPlan(): WeeklyWorkoutDay[] {
  return DAYS_ORDER.map((dayName) => ({
    dayName,
    workoutName: 'Treino A',
    muscleGroups: ['Peito'],
    duration: 60,
    exerciseCount: 1,
    isRest: false,
    trained: false,
  }));
}

function makeAchievements(): Achievement[] {
  return [
    { id: 'ach_1', name: 'Primeiro Treino', description: '', icon: '🏅', unlocked: false },
    { id: 'ach_18', name: 'Volume 10t', description: '', icon: '🏋️', unlocked: false },
  ];
}

function makeChallenges(): Challenge[] {
  return [
    { id: 'chal_1', name: '7 dias', durationDays: 7, xpReward: 100, description: '', progress: 10, completed: false, type: '7-days' },
    { id: 'chal_9', name: 'Intocado', durationDays: 14, xpReward: 200, description: '', progress: 42, completed: false, type: '14-days' },
  ];
}

function makeCustomProgram(): WorkoutProgram {
  return {
    id: 'program-custom-a',
    name: 'Programa A',
    durationWeeks: 8,
    frequencyDays: 4,
    level: 'intermediate',
    objective: 'hipertrofia',
    exercises: [],
    description: 'Programa pessoal A',
    repeatWeeks: true,
    weeks: [],
    isCustom: true,
  };
}

function seedWorldA(): void {
  const weeklyPlan = makeWeeklyPlan();
  storage.setItem(STORAGE_KEY, JSON.stringify({
    v: MONOLITHIC_STORAGE_VERSION,
    savedAt: '2026-07-23T10:00:00.000Z',
    data: {
      user: makeUser({ weeklyPlan }),
      weeklyPlan,
      customPrograms: [makeCustomProgram()],
      activeWorkout: null,
      activeWorkoutStartedAt: null,
      restTimerEndAt: null,
      restTimerTotalSeconds: null,
      restTimerLabel: null,
      workoutHistory: [makeSession('session-a1', 'Estado A1'), makeSession('session-a2', 'Estado A2')],
      weightHistory: [
        { date: '2026-05-01', value: 82.5 },
        { date: '2026-05-08', value: 81.9 },
        { date: '2026-05-15', value: 81.2 },
      ],
      measurementsHistory: [
        { date: '2026-05-01', chest: 104, waist: 88, hips: 100, arms: 38 },
        { date: '2026-05-15', chest: 105, waist: 86, hips: 99, arms: 38.5 },
      ],
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
      achievements: makeAchievements(),
      challenges: makeChallenges(),
      favoriteExercises: [],
      recentlyViewedVideoIds: [],
    },
  }));
}

function worldBPayload() {
  const weeklyPlan = makeWeeklyPlan();
  return {
    user: makeUser({ weeklyPlan, name: 'Mundo B' }),
    weeklyPlan,
    customPrograms: [],
    activeWorkout: null,
    activeWorkoutStartedAt: null,
    restTimerEndAt: null,
    restTimerTotalSeconds: null,
    restTimerLabel: null,
    workoutHistory: [makeSession('session-b', 'Estado B')],
    weightHistory: [{ date: '2026-06-01', value: 80 }],
    measurementsHistory: [],
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
    achievements: makeAchievements(),
    challenges: makeChallenges(),
    favoriteExercises: ['exercise-b'],
    recentlyViewedVideoIds: [],
  };
}

interface Mounted {
  renderer: TestRenderer.ReactTestRenderer;
  context: () => GymFlowValue;
  unmount: () => Promise<void>;
}

const mounted: Mounted[] = [];

async function mountProvider(): Promise<Mounted> {
  const state = { value: null as GymFlowValue | null };
  const Probe = () => {
    state.value = useGymFlow();
    return null;
  };
  const tree: React.ReactElement = (
    <ToastProvider>
      <GymFlowProvider>
        <Probe />
      </GymFlowProvider>
    </ToastProvider>
  );
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  await act(async () => {
    renderer = TestRenderer.create(tree);
  });
  const handle: Mounted = {
    renderer: renderer as unknown as TestRenderer.ReactTestRenderer,
    context: () => {
      if (!state.value) throw new Error('O Provider não expôs o contexto.');
      return state.value;
    },
    unmount: async () => {
      await act(async () => {
        (renderer as unknown as TestRenderer.ReactTestRenderer).unmount();
      });
      await settle(30);
    },
  };
  mounted.push(handle);
  return handle;
}

async function settle(ticks = 5): Promise<void> {
  for (let index = 0; index < ticks; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
  }
}

async function waitFor(
  predicate: () => boolean,
  label: string,
  attempts = 400,
): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
  }
  throw new Error(`Tempo esgotado esperando: ${label}`);
}

async function mountHydrated(): Promise<Mounted> {
  const handle = await mountProvider();
  await waitFor(
    () => handle.context().storageHealth.status !== 'loading',
    'hidratação concluir',
  );
  return handle;
}

async function callImport(
  handle: Mounted,
  input: { raw: string; declaredBytes: number; expectedPayloadDigest: string },
): Promise<ImportResult> {
  let result!: ImportResult;
  await act(async () => {
    result = await handle.context().importLogicalBackupV2(input);
  });
  return result;
}

async function callInspect(handle: Mounted): Promise<InspectResult> {
  let result!: InspectResult;
  await act(async () => {
    result = await handle.context().inspectLogicalRestoreV2();
  });
  return result;
}

async function callRestore(handle: Mounted): Promise<RestoreResult> {
  let result!: RestoreResult;
  await act(async () => {
    result = await handle.context().commitLogicalRestoreV2();
  });
  return result;
}

async function buildBackupB(): Promise<{
  raw: string;
  declaredBytes: number;
  expectedPayloadDigest: string;
}> {
  const payload = worldBPayload();
  const rawObject = {
    format: 'gymflow-backup',
    formatVersion: 2,
    logicalSchemaVersion: 1,
    exportedAt: '2026-08-14T12:00:00.000Z',
    sourcePhysicalStorageVersion: 2,
    sourceSavedAt: '2026-08-14T11:59:00.000Z',
    payloadDigest: 'pending',
    payload,
  };
  const { computeLogicalPayloadDigest, serializeLogicalPayloadCanonically } = await import(
    '../lib/storage-logical-backup'
  );
  const digest = await computeLogicalPayloadDigest(
    JSON.parse(serializeLogicalPayloadCanonically(payload)),
  );
  const raw = JSON.stringify({ ...rawObject, payloadDigest: digest, payload: JSON.parse(serializeLogicalPayloadCanonically(payload)) });
  const inspection = await inspectLogicalStorageBackupV2(raw, new TextEncoder().encode(raw).length);
  if (!inspection.ok) throw new Error(`backup B invalido: ${inspection.reason}`);
  return {
    raw,
    declaredBytes: new TextEncoder().encode(raw).length,
    expectedPayloadDigest: inspection.backup.payloadDigest,
  };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installBrowserGlobals();
});

afterEach(async () => {
  for (const handle of mounted.splice(0)) {
    try {
      await act(async () => { handle.renderer.unmount(); });
    } catch {
      // já desmontado
    }
  }
  await settle(10);
  restoreBrowserGlobals();
});

async function waitMs(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function prepareWorldBAfterReload(): Promise<Mounted> {
  seedWorldA();
  const first = await mountHydrated();
  expect(first.context().storageMode).toBe('hybrid-v2');
  const backupB = await buildBackupB();
  const imported = await callImport(first, backupB);
  expect(imported).toEqual({ ok: true });
  await waitMs(700);
  expect(reloadSpy).toHaveBeenCalledTimes(1);
  await first.unmount();
  reloadSpy.mockClear();
  const second = await mountHydrated();
  expect(second.context().storageMode).toBe('hybrid-v2');
  expect(second.context().workoutHistory).toHaveLength(1);
  return second;
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operate: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openRawDatabase();
  try {
    const transaction = db.transaction(storeName, mode);
    const result = await operate(transaction.objectStore(storeName));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return result;
  } finally {
    db.close();
  }
}

describe('restore hybrid-v2 — integração real A→B→A', () => {
  it('identifica A como único predecessor, restaura, settle e recarrega uma vez', async () => {
    seedWorldA();
    const first = await mountHydrated();
    expect(first.context().storageMode).toBe('hybrid-v2');
    expect(first.context().workoutHistory).toHaveLength(2);
    expect(first.context().programs.some((program) => program.isCustom)).toBe(true);

    const backupB = await buildBackupB();
    const imported = await callImport(first, backupB);
    expect(imported).toEqual({ ok: true });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    await first.unmount();
    reloadSpy.mockClear();

    const second = await mountHydrated();
    expect(second.context().storageMode).toBe('hybrid-v2');
    expect(second.context().workoutHistory).toHaveLength(1);
    expect(second.context().programs.some((program) => program.isCustom)).toBe(false);

    const inspection = await callInspect(second);
    expect(inspection).toEqual({
      status: 'available',
      preview: {
        sessionCount: 2,
        customProgramCount: 1,
        weightRecordCount: 3,
        measurementRecordCount: 2,
      },
    });
    expect(JSON.stringify(inspection)).not.toContain('operationId');
    expect(JSON.stringify(inspection)).not.toContain('generationId');
    expect(JSON.stringify(inspection)).not.toContain('previousCoreRaw');
    expect(JSON.stringify(inspection)).not.toContain('targetCoreRaw');

    const coreBeforeRestore = mainKeyContent();
    const restored = await callRestore(second);
    expect(restored).toEqual({
      ok: true,
      requiresReload: true,
      message: 'Backup anterior restaurado. Recarregando...',
    });
    expect(JSON.stringify(restored)).not.toContain('operationId');
    expect(JSON.stringify(restored)).not.toContain('generation');

    const receipts = await readOperationReceipts();
    expect(receipts.filter((row) => row.kind === 'restore' && row.status === 'settled')).toHaveLength(1);
    expect(receipts.some((row) => row.kind === 'import' && row.status === 'settled')).toBe(true);

    const coreAfterRestore = mainKeyContent();
    expect(coreAfterRestore).not.toBe(coreBeforeRestore);
    expect(parsePhysicalEnvelope(coreAfterRestore as string).status).toBe('v2');

    windowStub.dispatchEvent(new Event('pagehide'));
    await settle(3);
    expect(mainKeyContent()).toBe(coreAfterRestore);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});

describe('restore hybrid-v2 — vida útil do predecessor após A→import B', () => {
  it('hidratação normal após reload mantém available', async () => {
    const handle = await prepareWorldBAfterReload();
    const inspection = await callInspect(handle);
    expect(inspection.status).toBe('available');
  });

  it('debounce de autosave sem alteração do usuário mantém available', async () => {
    const handle = await prepareWorldBAfterReload();
    const coreAfterHydration = mainKeyContent();
    await waitMs(700);
    expect(mainKeyContent()).not.toBe(coreAfterHydration);
    const inspection = await callInspect(handle);
    expect(inspection.status).toBe('available');
    if (inspection.status !== 'available') throw new Error('esperado available');
    expect(inspection.preview).toEqual({
      sessionCount: 2,
      customProgramCount: 1,
      weightRecordCount: 3,
      measurementRecordCount: 2,
    });
  });

  it('pagehide/visibilitychange após reload mantém available', async () => {
    const handle = await prepareWorldBAfterReload();
    windowStub.dispatchEvent(new Event('pagehide'));
    documentStub.visibilityState = 'hidden';
    documentStub.dispatchEvent(new Event('visibilitychange'));
    await settle(5);
    const inspection = await callInspect(handle);
    expect(inspection.status).toBe('available');
  });

  it('abrir e fechar o app sem modificar dados mantém available', async () => {
    const first = await prepareWorldBAfterReload();
    await waitMs(700);
    await first.unmount();
    const second = await mountHydrated();
    await waitMs(700);
    const inspection = await callInspect(second);
    expect(inspection.status).toBe('available');
  });

  it('alteração comum do perfil mantém available (mesma geração)', async () => {
    const handle = await prepareWorldBAfterReload();
    await waitMs(700);
    await act(async () => {
      handle.context().updateUserProfile({ name: 'Perfil editado' });
    });
    await waitMs(700);
    const inspection = await callInspect(handle);
    expect(inspection.status).toBe('available');
  });

  it('novo treino ativo mantém available e o commit recusa active-workout', async () => {
    const handle = await prepareWorldBAfterReload();
    await waitMs(700);
    await act(async () => {
      handle.context().startWorkout(undefined, 'Treino extra');
    });
    expect(handle.context().activeWorkout).not.toBeNull();
    const inspection = await callInspect(handle);
    expect(inspection.status).toBe('available');
    const restored = await callRestore(handle);
    expect(restored).toMatchObject({ ok: false, reason: 'active-workout', requiresReload: false });
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('alteração de peso e medida mantém available', async () => {
    const handle = await prepareWorldBAfterReload();
    await waitMs(700);
    await act(async () => {
      handle.context().addWeightLog(79.4);
      handle.context().addMeasurementLog(104, 86, 98, 37);
    });
    await waitMs(700);
    const inspection = await callInspect(handle);
    expect(inspection.status).toBe('available');
  });
});

describe('restore hybrid-v2 — preview → commit com proveniência sabotada', () => {
  it('core atual apagado recusa antes do primeiro write', async () => {
    const handle = await prepareWorldBAfterReload();
    const before = mainKeyContent();
    await callInspect(handle);
    storage.removeItem(STORAGE_KEY);
    const restored = await callRestore(handle);
    expect(restored.ok).toBe(false);
    expect(mainKeyContent()).toBeNull();
    expect(before).not.toBeNull();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('geração ativa no core divergente recusa sem write de restore', async () => {
    const handle = await prepareWorldBAfterReload();
    await callInspect(handle);
    const parsed = JSON.parse(mainKeyContent() as string) as {
      data: { historyStorage: { generationId: string } };
    };
    parsed.data.historyStorage.generationId = 'generation-sabotada';
    const sabotaged = JSON.stringify(parsed);
    storage.setItem(STORAGE_KEY, sabotaged);
    const restored = await callRestore(handle);
    expect(restored.ok).toBe(false);
    expect(mainKeyContent()).toBe(sabotaged);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('receipt fonte adulterado recusa sem write de restore', async () => {
    const handle = await prepareWorldBAfterReload();
    const before = mainKeyContent();
    await callInspect(handle);
    await withStore(STORAGE_OPERATION_RECEIPTS_STORE, 'readwrite', async (store) => {
      const rows = await rawRequest(store.getAll()) as Array<Record<string, unknown>>;
      const source = rows.find((row) => row.kind === 'import');
      if (!source) throw new Error('receipt de import ausente');
      await rawRequest(store.put({
        ...source,
        previousCoreRaw: '{"v":2,"sabotaged":true}',
      }));
    });
    const restored = await callRestore(handle);
    expect(restored.ok).toBe(false);
    expect(mainKeyContent()).toBe(before);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('geração alvo removida recusa sem write de restore', async () => {
    const handle = await prepareWorldBAfterReload();
    const before = mainKeyContent();
    const inspection = await callInspect(handle);
    expect(inspection.status).toBe('available');
    const currentGeneration = (
      JSON.parse(before as string) as { data: { historyStorage: { generationId: string } } }
    ).data.historyStorage.generationId;
    await withStore(WORKOUT_HISTORY_STORE, 'readwrite', async (store) => {
      const rows = await rawRequest(store.getAll()) as Array<{ generationId: string; order: number }>;
      for (const row of rows) {
        if (row.generationId !== currentGeneration) {
          await rawRequest(store.delete([row.generationId, row.order]));
        }
      }
    });
    await withStore(GENERATION_MANIFESTS_STORE, 'readwrite', async (store) => {
      const rows = await rawRequest(store.getAll()) as Array<{ generationId: string }>;
      for (const row of rows) {
        if (row.generationId !== currentGeneration) {
          await rawRequest(store.delete(row.generationId));
        }
      }
    });
    const restored = await callRestore(handle);
    expect(restored.ok).toBe(false);
    expect(mainKeyContent()).toBe(before);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('manifest da geração alvo corrompido recusa sem write de restore', async () => {
    const handle = await prepareWorldBAfterReload();
    const before = mainKeyContent();
    await callInspect(handle);
    const currentGeneration = (
      JSON.parse(before as string) as { data: { historyStorage: { generationId: string } } }
    ).data.historyStorage.generationId;
    await withStore(GENERATION_MANIFESTS_STORE, 'readwrite', async (store) => {
      const rows = await rawRequest(store.getAll()) as Array<{
        generationId: string;
        verified: boolean;
      }>;
      const target = rows.find((row) => row.generationId !== currentGeneration);
      if (!target) throw new Error('manifest alvo ausente');
      await rawRequest(store.put({ ...target, verified: false }));
    });
    const restored = await callRestore(handle);
    expect(restored.ok).toBe(false);
    expect(mainKeyContent()).toBe(before);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('completion receipt pendente recusa sem write de restore', async () => {
    const handle = await prepareWorldBAfterReload();
    const before = mainKeyContent();
    await callInspect(handle);
    await withStore(COMPLETION_RECEIPTS_STORE, 'readwrite', async (store) => {
      await rawRequest(store.put({ receiptId: 'completion-sabotada' } as never));
    });
    const restored = await callRestore(handle);
    expect(restored.ok).toBe(false);
    expect(mainKeyContent()).toBe(before);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('owner-token ocupado recusa sem write de restore', async () => {
    const handle = await prepareWorldBAfterReload();
    const before = mainKeyContent();
    await callInspect(handle);
    storage.setItem(`${STORAGE_KEY}:admin-owner-token:v1`, JSON.stringify({
      schemaVersion: 1,
      ownerId: 'outra-aba',
      operationId: 'op-estrangeira',
      operationKind: 'restore',
      acquiredAt: Date.now(),
      expiresAt: Date.now() + 30_000,
      nonce: 'nonce-estrangeiro',
    }));
    const restored = await callRestore(handle);
    expect(restored).toMatchObject({ ok: false, reason: 'owner-token-busy' });
    expect(mainKeyContent()).toBe(before);
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});

describe('restore hybrid-v2 — ambiguous real e pagehide durante commit', () => {
  it('dois receipts settled integralmente validos => ambiguous sem acao', async () => {
    const handle = await prepareWorldBAfterReload();
    await withStore(STORAGE_OPERATION_RECEIPTS_STORE, 'readwrite', async (store) => {
      const rows = await rawRequest(store.getAll()) as Array<Record<string, unknown>>;
      const source = rows.find((row) => row.kind === 'import');
      if (!source) throw new Error('receipt de import ausente');
      await rawRequest(store.put({
        ...source,
        operationId: 'import-zzz-later-id',
        createdAt: '2026-08-14T23:59:59.000Z',
        updatedAt: '2026-08-14T23:59:59.000Z',
      }));
    });
    const inspection = await callInspect(handle);
    expect(inspection).toEqual({ status: 'ambiguous' });
    const restored = await callRestore(handle);
    expect(restored).toMatchObject({ ok: false, reason: 'restore-unavailable' });
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('pagehide durante o commit real nao sobrescreve o restore', async () => {
    const handle = await prepareWorldBAfterReload();
    await waitMs(700);
    const inspection = await callInspect(handle);
    expect(inspection.status).toBe('available');
    const coreBefore = mainKeyContent();

    let restored!: RestoreResult;
    const pending = handle.context().commitLogicalRestoreV2();
    windowStub.dispatchEvent(new Event('pagehide'));
    documentStub.visibilityState = 'hidden';
    documentStub.dispatchEvent(new Event('visibilitychange'));
    await act(async () => {
      restored = await pending;
    });

    expect(restored).toMatchObject({ ok: true, requiresReload: true });
    const coreAfter = mainKeyContent();
    expect(coreAfter).not.toBe(coreBefore);
    expect(parsePhysicalEnvelope(coreAfter as string).status).toBe('v2');
    const receipts = await readOperationReceipts();
    expect(receipts.some((row) => row.kind === 'restore' && row.status === 'settled')).toBe(true);
  });
});
