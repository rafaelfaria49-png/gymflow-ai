import { IDBFactory } from 'fake-indexeddb';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import {
  GENERATION_MANIFESTS_STORE,
  GYMFLOW_INDEXEDDB_VERSION,
  METADATA_STORE,
  STORAGE_OPERATION_RECEIPTS_STORE,
} from '../lib/storage-indexeddb';
import { parsePhysicalEnvelope } from '../lib/storage-hybrid';
import { createEmptyPersistedState, MONOLITHIC_STORAGE_VERSION } from '../lib/storage-types';
import type {
  Achievement,
  Challenge,
  UserProfile,
  WeeklyWorkoutDay,
  WorkoutProgram,
  WorkoutSession,
} from '../types';
import { GymFlowProvider, STORAGE_KEY, useGymFlow } from './GymFlowContext';

// Integração real A → reset Z → restore A, e A → Z1 → Z2.
// Zero mock dos writers de reset e restore.

type GymFlowValue = ReturnType<typeof useGymFlow>;
type InspectResetResult = Awaited<ReturnType<GymFlowValue['inspectLogicalResetV2']>>;
type ResetResult = Awaited<ReturnType<GymFlowValue['commitLogicalResetV2']>>;
type InspectRestoreResult = Awaited<ReturnType<GymFlowValue['inspectLogicalRestoreV2']>>;
type RestoreResult = Awaited<ReturnType<GymFlowValue['commitLogicalRestoreV2']>>;

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
  previousGenerationId?: string;
  stagedGenerationId?: string | null;
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
      previousGenerationId?: string;
      stagedGenerationId?: string | null;
    });
  } finally {
    db.close();
  }
}

async function readActiveGeneration(): Promise<string | null> {
  const db = await openRawDatabase();
  try {
    const transaction = db.transaction(METADATA_STORE, 'readonly');
    const row = await rawRequest(
      transaction.objectStore(METADATA_STORE).get('activeGeneration'),
    ) as { key?: string; value?: string | null } | undefined;
    return typeof row?.value === 'string' ? row.value : null;
  } finally {
    db.close();
  }
}

async function generationIds(): Promise<string[]> {
  const db = await openRawDatabase();
  try {
    const transaction = db.transaction(GENERATION_MANIFESTS_STORE, 'readonly');
    const rows = await rawRequest(transaction.objectStore(GENERATION_MANIFESTS_STORE).getAll()) as Array<{
      generationId: string;
    }>;
    return rows.map((row) => row.generationId);
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
      nutrition: { calories: 1420, protein: 110, carbs: 150, fat: 45, water: 1200 },
      achievements: makeAchievements(),
      challenges: makeChallenges(),
      favoriteExercises: ['chest_supino_reto'],
      recentlyViewedVideoIds: ['video-a'],
    },
  }));
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

async function callInspectReset(handle: Mounted): Promise<InspectResetResult> {
  let result!: InspectResetResult;
  await act(async () => {
    result = await handle.context().inspectLogicalResetV2();
  });
  return result;
}

async function callReset(handle: Mounted): Promise<ResetResult> {
  let result!: ResetResult;
  await act(async () => {
    result = await handle.context().commitLogicalResetV2();
  });
  return result;
}

async function callInspectRestore(handle: Mounted): Promise<InspectRestoreResult> {
  let result!: InspectRestoreResult;
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

async function waitMs(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function assertCanonicalEmpty(context: GymFlowValue): void {
  const empty = createEmptyPersistedState();
  expect(context.user).toBeNull();
  expect(context.workoutHistory).toEqual([]);
  expect(context.weeklyPlan).toEqual([]);
  expect(context.programs.some((program) => program.isCustom)).toBe(false);
  expect(context.weightHistory).toEqual([]);
  expect(context.measurementsHistory).toEqual([]);
  expect(context.nutrition).toEqual(empty.nutrition);
  expect(context.achievements).toEqual([]);
  expect(context.challenges).toEqual([]);
  expect(context.favoriteExercises).toEqual([]);
  expect(context.activeWorkout).toBeNull();
  expect(context.storageMode).toBe('hybrid-v2');
  expect(context.storageHealth.status).toBe('ready');
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

async function resetToEmptyAndReload(handle: Mounted): Promise<Mounted> {
  const inspection = await callInspectReset(handle);
  expect(inspection.status).toBe('available');
  const reset = await callReset(handle);
  expect(reset).toEqual({
    ok: true,
    requiresReload: true,
    message: 'Dados zerados. Recarregando...',
  });
  await waitMs(700);
  expect(reloadSpy).toHaveBeenCalledTimes(1);
  await handle.unmount();
  reloadSpy.mockClear();
  const next = await mountHydrated();
  expect(next.context().storageMode).toBe('hybrid-v2');
  return next;
}

describe('reset hybrid-v2 — A → Z', () => {
  it('zera para o vazio canônico, settle e recarrega uma vez', async () => {
    seedWorldA();
    const first = await mountHydrated();
    expect(first.context().storageMode).toBe('hybrid-v2');
    expect(first.context().user).not.toBeNull();
    expect(first.context().workoutHistory).toHaveLength(2);
    expect(first.context().programs.some((program) => program.isCustom)).toBe(true);

    const inspection = await callInspectReset(first);
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

    const generationA = await readActiveGeneration();
    expect(generationA).not.toBeNull();
    const coreBefore = mainKeyContent();

    const reset = await callReset(first);
    expect(reset).toEqual({
      ok: true,
      requiresReload: true,
      message: 'Dados zerados. Recarregando...',
    });
    expect(JSON.stringify(reset)).not.toContain('operationId');
    expect(JSON.stringify(reset)).not.toContain('generation');

    const receipts = await readOperationReceipts();
    expect(receipts.filter((row) => row.kind === 'reset' && row.status === 'settled')).toHaveLength(1);

    const coreAfter = mainKeyContent();
    expect(coreAfter).not.toBe(coreBefore);
    const parsed = parsePhysicalEnvelope(coreAfter as string);
    expect(parsed.status).toBe('v2');
    if (parsed.status !== 'v2') throw new Error('core Z ausente');
    expect(parsed.envelope.data.user).toBeNull();
    expect(parsed.envelope.data.customPrograms).toEqual([]);
    expect(parsed.envelope.data.weightHistory).toEqual([]);
    expect(parsed.envelope.data.measurementsHistory).toEqual([]);

    windowStub.dispatchEvent(new Event('pagehide'));
    await settle(3);
    expect(mainKeyContent()).toBe(coreAfter);

    await waitMs(700);
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    await first.unmount();
    reloadSpy.mockClear();
    const second = await mountHydrated();
    assertCanonicalEmpty(second.context());
    const generationZ = await readActiveGeneration();
    expect(generationZ).not.toBeNull();
    expect(generationZ).not.toBe(generationA);
    const ids = await generationIds();
    expect(ids).toContain(generationA as string);
    expect(ids).toContain(generationZ as string);
  });
});

describe('reset hybrid-v2 — A → Z → restore A', () => {
  it('após o vazio, o restore identifica A e o recupera íntegro', async () => {
    seedWorldA();
    const first = await mountHydrated();
    const afterReset = await resetToEmptyAndReload(first);
    assertCanonicalEmpty(afterReset.context());

    const restoreInspect = await callInspectRestore(afterReset);
    expect(restoreInspect).toEqual({
      status: 'available',
      preview: {
        sessionCount: 2,
        customProgramCount: 1,
        weightRecordCount: 3,
        measurementRecordCount: 2,
      },
    });
    expect(JSON.stringify(restoreInspect)).not.toContain('operationId');
    expect(JSON.stringify(restoreInspect)).not.toContain('generationId');

    const restored = await callRestore(afterReset);
    expect(restored).toEqual({
      ok: true,
      requiresReload: true,
      message: 'Backup anterior restaurado. Recarregando...',
    });
    await waitMs(700);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    await afterReset.unmount();
    reloadSpy.mockClear();

    const afterRestore = await mountHydrated();
    expect(afterRestore.context().storageMode).toBe('hybrid-v2');
    expect(afterRestore.context().user?.name).toBe('Rafael Silveira (Demo)');
    expect(afterRestore.context().workoutHistory.map((session) => session.name).sort()).toEqual([
      'Estado A1',
      'Estado A2',
    ]);
    expect(afterRestore.context().programs.some((program) => program.isCustom)).toBe(true);
    expect(afterRestore.context().weightHistory).toHaveLength(3);
    expect(afterRestore.context().measurementsHistory).toHaveLength(2);
    expect(afterRestore.context().nutrition.calories).toBe(1420);
  });
});

describe('reset hybrid-v2 — A → Z1 → Z2', () => {
  it('o predecessor de Z2 é Z1, não A, sem fallback por timestamp', async () => {
    seedWorldA();
    const first = await mountHydrated();
    const generationA = await readActiveGeneration();
    const afterZ1 = await resetToEmptyAndReload(first);
    assertCanonicalEmpty(afterZ1.context());
    const generationZ1 = await readActiveGeneration();
    expect(generationZ1).not.toBe(generationA);

    const restoreAfterZ1 = await callInspectRestore(afterZ1);
    expect(restoreAfterZ1.status).toBe('available');
    if (restoreAfterZ1.status !== 'available') throw new Error('esperado predecessor A');
    expect(restoreAfterZ1.preview.sessionCount).toBe(2);
    expect(restoreAfterZ1.preview.customProgramCount).toBe(1);

    const afterZ2 = await resetToEmptyAndReload(afterZ1);
    assertCanonicalEmpty(afterZ2.context());
    const generationZ2 = await readActiveGeneration();
    expect(generationZ2).not.toBe(generationZ1);
    expect(generationZ2).not.toBe(generationA);

    const restoreAfterZ2 = await callInspectRestore(afterZ2);
    expect(restoreAfterZ2.status).toBe('available');
    if (restoreAfterZ2.status !== 'available') throw new Error('esperado predecessor Z1');
    expect(restoreAfterZ2.preview).toEqual({
      sessionCount: 0,
      customProgramCount: 0,
      weightRecordCount: 0,
      measurementRecordCount: 0,
    });
    expect(restoreAfterZ2).not.toEqual(restoreAfterZ1);

    const receipts = await readOperationReceipts();
    const settledResets = receipts.filter((row) => row.kind === 'reset' && row.status === 'settled');
    expect(settledResets).toHaveLength(2);
    const resetZ2 = settledResets.find((row) => row.stagedGenerationId === generationZ2);
    expect(resetZ2?.previousGenerationId).toBe(generationZ1);
    expect(resetZ2?.previousGenerationId).not.toBe(generationA);

    const ids = await generationIds();
    expect(ids).toContain(generationA as string);
    expect(ids).toContain(generationZ1 as string);
    expect(ids).toContain(generationZ2 as string);
    expect(restoreAfterZ2.status).not.toBe('ambiguous');
  });
});

describe('reset hybrid-v2 — pagehide durante o commit real', () => {
  it('pagehide durante o reset não sobrescreve Z', async () => {
    seedWorldA();
    const handle = await mountHydrated();
    await waitMs(700);
    const inspection = await callInspectReset(handle);
    expect(inspection.status).toBe('available');
    const coreBefore = mainKeyContent();

    let reset!: ResetResult;
    const pending = handle.context().commitLogicalResetV2();
    windowStub.dispatchEvent(new Event('pagehide'));
    documentStub.visibilityState = 'hidden';
    documentStub.dispatchEvent(new Event('visibilitychange'));
    await act(async () => {
      reset = await pending;
    });

    expect(reset).toMatchObject({ ok: true, requiresReload: true });
    const coreAfter = mainKeyContent();
    expect(coreAfter).not.toBe(coreBefore);
    expect(parsePhysicalEnvelope(coreAfter as string).status).toBe('v2');
    const receipts = await readOperationReceipts();
    expect(receipts.some((row) => row.kind === 'reset' && row.status === 'settled')).toBe(true);
    await waitMs(700);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
