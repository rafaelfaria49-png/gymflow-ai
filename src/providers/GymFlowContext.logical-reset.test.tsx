import { IDBFactory } from 'fake-indexeddb';
import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import {
  COMPLETION_RECEIPTS_STORE,
  GYMFLOW_INDEXEDDB_VERSION,
  STORAGE_OPERATION_RECEIPTS_STORE,
} from '../lib/storage-indexeddb';
import { createStorageOperationReceipt } from '../lib/storage-operation-receipt';
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

const mockCommitLogicalStorageResetV2 = vi.fn();
const mockInspectStorageAdminOwnerToken = vi.fn();

vi.mock('../lib/storage-logical-reset', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/storage-logical-reset')>();
  return {
    ...actual,
    commitLogicalStorageResetV2: (...args: unknown[]) => mockCommitLogicalStorageResetV2(...args),
  };
});

vi.mock('../lib/storage-admin-owner-token', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/storage-admin-owner-token')>();
  return {
    ...actual,
    inspectStorageAdminOwnerToken: (...args: unknown[]) => mockInspectStorageAdminOwnerToken(...args),
  };
});

type GymFlowValue = ReturnType<typeof useGymFlow>;
type InspectResult = Awaited<ReturnType<GymFlowValue['inspectLogicalResetV2']>>;
type ResetResult = Awaited<ReturnType<GymFlowValue['commitLogicalResetV2']>>;

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

let storage: MemoryLocalStorage;
let reloadSpy: ReturnType<typeof vi.fn>;
let windowStub: EventTarget & {
  localStorage: MemoryLocalStorage;
  location: { reload: ReturnType<typeof vi.fn> };
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
};
let documentStub: EventTarget & { visibilityState: string };
const originalWindow = Reflect.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Reflect.getOwnPropertyDescriptor(globalThis, 'document');
const originalIndexedDb = Reflect.getOwnPropertyDescriptor(globalThis, 'indexedDB');

function installBrowserGlobals(): void {
  storage = new MemoryLocalStorage();
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

const STARTED_AT = 1_784_000_000_000;

function makeActiveSession(): WorkoutSession {
  return {
    id: 'session-ativa',
    name: 'Treino A — Peito',
    date: new Date(STARTED_AT).toISOString(),
    duration: 0,
    calories: 0,
    xpEarned: 0,
    prsDetected: [],
    status: 'active',
    startedAt: STARTED_AT,
    exercises: [{
      id: 'entry-1',
      exerciseId: 'chest_supino_reto',
      name: 'Supino reto',
      muscleGroup: 'Peito',
      notes: '',
      entryOrigin: 'planned',
      sets: [{ id: 'set-1', reps: 10, weight: 60, completed: true }],
    }],
  };
}

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
  ];
}

function makeChallenges(): Challenge[] {
  return [
    { id: 'chal_1', name: '7 dias', durationDays: 7, xpReward: 100, description: '', progress: 10, completed: false, type: '7-days' },
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

function seedWorldA(overrides: Record<string, unknown> = {}): void {
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
      recentlyViewedVideoIds: [],
      ...overrides,
    },
  }));
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

interface Mounted {
  renderer: TestRenderer.ReactTestRenderer;
  context: () => GymFlowValue;
  unmount: () => Promise<void>;
}

const mounted: Mounted[] = [];

async function mountProvider(options: { strict?: boolean } = {}): Promise<Mounted> {
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
    renderer = TestRenderer.create(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
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

async function mountHydrated(options: { strict?: boolean } = {}): Promise<Mounted> {
  const handle = await mountProvider(options);
  await waitFor(
    () => handle.context().storageHealth.status !== 'loading',
    'hidratação concluir',
  );
  return handle;
}

async function callInspect(handle: Mounted): Promise<InspectResult> {
  let result!: InspectResult;
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

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installBrowserGlobals();
  mockCommitLogicalStorageResetV2.mockReset();
  mockInspectStorageAdminOwnerToken.mockReset();
  mockInspectStorageAdminOwnerToken.mockReturnValue(Object.freeze({ status: 'available' }));
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

describe('inspectLogicalResetV2 — fronteira pública', () => {
  it('expõe preview agregado sem IDs/raw', async () => {
    seedWorldA();
    const handle = await mountHydrated();
    const result = await callInspect(handle);
    expect(result).toEqual({
      status: 'available',
      preview: {
        sessionCount: 2,
        customProgramCount: 1,
        weightRecordCount: 3,
        measurementRecordCount: 2,
      },
    });
    expect(JSON.stringify(result)).not.toContain('generationId');
    expect(JSON.stringify(result)).not.toContain('operationId');
    expect(JSON.stringify(result)).not.toContain('previousCoreRaw');
    expect(JSON.stringify(result)).not.toContain('fingerprint');
  });

  it('recusa storage bloqueado sem IDs', async () => {
    storage.setItem(STORAGE_KEY, '{inválido');
    const handle = await mountHydrated();
    expect(handle.context().storageMode).toBe('blocked');
    const result = await callInspect(handle);
    expect(result).toMatchObject({ status: 'error', reason: 'storage-not-healthy' });
    expect(JSON.stringify(result)).not.toContain('operationId');
  });
});

describe('commitLogicalResetV2 — pré-flights', () => {
  it('recusa treino ativo antes da escrita', async () => {
    seedWorldA({
      activeWorkout: makeActiveSession(),
      activeWorkoutStartedAt: STARTED_AT,
    });
    const handle = await mountHydrated();
    expect(handle.context().activeWorkout).not.toBeNull();
    const result = await callReset(handle);
    expect(result).toMatchObject({ ok: false, reason: 'active-workout', requiresReload: false });
    expect(mockCommitLogicalStorageResetV2).not.toHaveBeenCalled();
  });

  it('recusa storage bloqueado antes da escrita', async () => {
    storage.setItem(STORAGE_KEY, '{inválido');
    const handle = await mountHydrated();
    const result = await callReset(handle);
    expect(result).toMatchObject({ ok: false, reason: 'storage-not-healthy', requiresReload: false });
    expect(mockCommitLogicalStorageResetV2).not.toHaveBeenCalled();
  });

  it('recusa owner-token ocupado antes da escrita', async () => {
    seedWorldA();
    mockInspectStorageAdminOwnerToken.mockReturnValue(Object.freeze({ status: 'busy' }));
    const handle = await mountHydrated();
    const result = await callReset(handle);
    expect(result).toMatchObject({ ok: false, reason: 'owner-token-busy', requiresReload: false });
    expect(mockCommitLogicalStorageResetV2).not.toHaveBeenCalled();
  });

  it('recusa completion pendente antes da escrita', async () => {
    seedWorldA();
    const handle = await mountHydrated();
    const db = await openRawDatabase();
    try {
      const transaction = db.transaction(COMPLETION_RECEIPTS_STORE, 'readwrite');
      await rawRequest(transaction.objectStore(COMPLETION_RECEIPTS_STORE).put({
        receiptId: 'completion-pendente',
        sessionId: 'session-a1',
        generationId: 'generation-a',
        sessionDigest: 'digest-pendente',
        finalSession: makeSession('session-a1', 'Estado A1'),
        coreEnvelopeAfter: {
          user: null,
          weeklyPlan: [],
          customPrograms: [],
          activeWorkout: null,
          activeWorkoutStartedAt: null,
          restTimerEndAt: null,
          restTimerTotalSeconds: null,
          restTimerLabel: null,
          weightHistory: [],
          measurementsHistory: [],
          nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
          achievements: [],
          challenges: [],
          favoriteExercises: [],
          recentlyViewedVideoIds: [],
          historyStorage: {
            backend: 'indexeddb',
            schemaVersion: 1,
            generationId: 'generation-a',
          },
        },
        effects: {
          xpNotifications: [],
          communityPost: {
            id: 'post-pendente',
            authorName: 'Rafael',
            authorAvatar: '🚀',
            time: 'Agora mesmo',
            content: 'Treino finalizado',
            likes: 0,
            comments: [],
            userLiked: false,
            shares: 0,
          },
          unlockedAchievementIds: [],
          markedDayName: 'Segunda',
        },
        createdAt: '2026-08-14T12:00:00.000Z',
        status: 'pending',
        settledAt: null,
      }));
    } finally {
      db.close();
    }
    const result = await callReset(handle);
    expect(result).toMatchObject({ ok: false, reason: 'completion-pending', requiresReload: false });
    expect(mockCommitLogicalStorageResetV2).not.toHaveBeenCalled();
  });

  it('recusa operação administrativa aberta antes da escrita', async () => {
    seedWorldA();
    const handle = await mountHydrated();
    const db = await openRawDatabase();
    try {
      const transaction = db.transaction(STORAGE_OPERATION_RECEIPTS_STORE, 'readwrite');
      await rawRequest(transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE).put(
        createStorageOperationReceipt({
          operationId: 'op-aberta',
          kind: 'import',
          previousCoreRaw: '{"v":2}',
          previousGenerationId: 'generation-a',
          createdAt: '2026-08-14T12:00:00.000Z',
        }),
      ));
    } finally {
      db.close();
    }
    const result = await callReset(handle);
    expect(result).toMatchObject({ ok: false, reason: 'operation-open', requiresReload: false });
    expect(mockCommitLogicalStorageResetV2).not.toHaveBeenCalled();
  });
});

describe('commitLogicalResetV2 — sucesso e reload único', () => {
  it('sucesso settled agenda exatamente um reload e não vaza IDs', async () => {
    seedWorldA();
    mockCommitLogicalStorageResetV2.mockResolvedValue({
      ok: true,
      operationId: 'reset-1',
      generationId: 'generation-z',
      previousGenerationId: 'generation-a',
    });
    const handle = await mountHydrated();
    const result = await callReset(handle);
    expect(result).toEqual({
      ok: true,
      requiresReload: true,
      message: 'Dados zerados. Recarregando...',
    });
    expect(JSON.stringify(result)).not.toContain('operationId');
    expect(JSON.stringify(result)).not.toContain('generation-z');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('recovery-required mantém bloqueio e recarrega', async () => {
    seedWorldA();
    mockCommitLogicalStorageResetV2.mockResolvedValue({
      ok: false,
      reason: 'recovery-required',
      operationId: 'reset-1',
      generationId: 'generation-z',
      recoveryRequired: true,
    });
    const handle = await mountHydrated();
    const result = await callReset(handle);
    expect(result).toMatchObject({ ok: false, reason: 'recovery-required', requiresReload: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    const second = await callReset(handle);
    expect(second).toMatchObject({ ok: false, reason: 'operation-open' });
    expect(mockCommitLogicalStorageResetV2).toHaveBeenCalledTimes(1);
  });
});

describe('commitLogicalResetV2 — clique duplo e Strict Mode', () => {
  it('segunda chamada retorna operation-open sem novo commit', async () => {
    seedWorldA();
    let resolveCommit!: (value: { ok: true }) => void;
    mockCommitLogicalStorageResetV2.mockImplementation(
      () => new Promise((resolve) => { resolveCommit = resolve; }),
    );
    const handle = await mountHydrated();

    let first!: ResetResult;
    const firstPromise = (async () => {
      await act(async () => {
        first = await handle.context().commitLogicalResetV2();
      });
    })();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const second = await callReset(handle);
    expect(second).toMatchObject({ ok: false, reason: 'operation-open' });
    expect(mockCommitLogicalStorageResetV2).toHaveBeenCalledTimes(1);
    resolveCommit({ ok: true });
    await firstPromise;
    expect(first).toMatchObject({ ok: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
  });

  it('Strict Mode não duplica o commit', async () => {
    seedWorldA();
    mockCommitLogicalStorageResetV2.mockResolvedValue({ ok: true });
    const handle = await mountHydrated({ strict: true });
    const result = await callReset(handle);
    expect(result).toMatchObject({ ok: true });
    expect(mockCommitLogicalStorageResetV2).toHaveBeenCalledTimes(1);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(reloadSpy).toHaveBeenCalled();
  });
});

describe('commitLogicalResetV2 — autosave tardio', () => {
  it('pagehide após sucesso settled não grava o estado React antigo', async () => {
    seedWorldA();
    mockCommitLogicalStorageResetV2.mockResolvedValue({ ok: true });
    const handle = await mountHydrated();
    const before = storage.getItem(STORAGE_KEY);
    await callReset(handle);
    windowStub.dispatchEvent(new Event('pagehide'));
    await settle(3);
    expect(storage.getItem(STORAGE_KEY)).toBe(before);
  });

  it('falha sem write libera o bloqueio', async () => {
    seedWorldA();
    mockCommitLogicalStorageResetV2.mockResolvedValue({
      ok: false,
      reason: 'verification-failed',
      operationId: null,
      generationId: null,
      recoveryRequired: false,
    });
    const handle = await mountHydrated();
    const result = await callReset(handle);
    expect(result).toMatchObject({ ok: false, reason: 'reset-failed', requiresReload: false });
    expect(reloadSpy).not.toHaveBeenCalled();
    mockCommitLogicalStorageResetV2.mockResolvedValue({ ok: true });
    const retry = await callReset(handle);
    expect(retry).toMatchObject({ ok: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
  });
});

describe('legacy-v1 — startFreshStorage permanece', () => {
  it('preserva startFreshStorage e não usa o writer híbrido fora do hybrid-v2', async () => {
    storage.setItem(STORAGE_KEY, '{inválido');
    const handle = await mountHydrated();
    expect(typeof handle.context().startFreshStorage).toBe('function');
    expect(handle.context().legacyStorageOperationsAllowed).toBe(true);
    const result = await callReset(handle);
    expect(result).toMatchObject({ ok: false, reason: 'storage-not-healthy' });
    expect(mockCommitLogicalStorageResetV2).not.toHaveBeenCalled();
  });
});
