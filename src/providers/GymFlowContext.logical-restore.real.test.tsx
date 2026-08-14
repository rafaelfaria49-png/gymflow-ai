import { IDBFactory } from 'fake-indexeddb';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import {
  GYMFLOW_INDEXEDDB_VERSION,
  STORAGE_OPERATION_RECEIPTS_STORE,
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
