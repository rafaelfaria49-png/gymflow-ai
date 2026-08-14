import { IDBFactory } from 'fake-indexeddb';
import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { MONOLITHIC_STORAGE_VERSION } from '../lib/storage-types';
import type {
  Achievement,
  Challenge,
  UserProfile,
  WeeklyWorkoutDay,
  WorkoutSession,
} from '../types';
import { GymFlowProvider, STORAGE_KEY, useGymFlow } from './GymFlowContext';

const mockCommitLogicalStorageRestoreV2 = vi.fn();
const mockResolveLogicalRestorePredecessorV2 = vi.fn();
const mockInspectStorageAdminOwnerToken = vi.fn();

vi.mock('../lib/storage-logical-restore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/storage-logical-restore')>();
  return {
    ...actual,
    commitLogicalStorageRestoreV2: (...args: unknown[]) => mockCommitLogicalStorageRestoreV2(...args),
  };
});

vi.mock('../lib/storage-logical-restore-resolve', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/storage-logical-restore-resolve')>();
  return {
    ...actual,
    resolveLogicalRestorePredecessorV2: (...args: unknown[]) => (
      mockResolveLogicalRestorePredecessorV2(...args)
    ),
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
type InspectResult = Awaited<ReturnType<GymFlowValue['inspectLogicalRestoreV2']>>;
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

function seedV1Envelope(overrides: Record<string, unknown> = {}): void {
  const weeklyPlan = makeWeeklyPlan();
  storage.setItem(STORAGE_KEY, JSON.stringify({
    v: MONOLITHIC_STORAGE_VERSION,
    savedAt: '2026-07-23T10:00:00.000Z',
    data: {
      user: makeUser({ weeklyPlan }),
      weeklyPlan,
      customPrograms: [],
      activeWorkout: makeActiveSession(),
      activeWorkoutStartedAt: STARTED_AT,
      restTimerEndAt: null,
      restTimerTotalSeconds: null,
      restTimerLabel: null,
      workoutHistory: [],
      weightHistory: [],
      measurementsHistory: [],
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
      achievements: makeAchievements(),
      challenges: makeChallenges(),
      favoriteExercises: [],
      recentlyViewedVideoIds: [],
      ...overrides,
    },
  }));
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

const PREVIEW = {
  sessionCount: 2,
  customProgramCount: 1,
  weightRecordCount: 3,
  measurementRecordCount: 2,
};

const TARGET_A = {
  sourceOperationId: 'import-b',
  targetCoreRaw: '{"v":2,"data":"A"}',
  targetGenerationId: 'generation-a',
  currentCoreRaw: '{"v":2,"data":"B"}',
  currentGenerationId: 'generation-b',
  administrationFingerprint: 'fp-1',
};

function stubAvailable(target = TARGET_A) {
  mockResolveLogicalRestorePredecessorV2.mockResolvedValue({
    status: 'available',
    target,
    preview: PREVIEW,
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installBrowserGlobals();
  mockCommitLogicalStorageRestoreV2.mockReset();
  mockResolveLogicalRestorePredecessorV2.mockReset();
  mockInspectStorageAdminOwnerToken.mockReset();
  mockInspectStorageAdminOwnerToken.mockReturnValue(Object.freeze({ status: 'available' }));
  stubAvailable();
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

describe('inspectLogicalRestoreV2 — fronteira pública', () => {
  it('expõe unavailable sem IDs físicos', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    mockResolveLogicalRestorePredecessorV2.mockResolvedValue({ status: 'unavailable' });
    const handle = await mountHydrated();
    const result = await callInspect(handle);
    expect(result).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(result)).not.toContain('generationId');
    expect(JSON.stringify(result)).not.toContain('operationId');
    expect(JSON.stringify(result)).not.toContain('previousCoreRaw');
  });

  it('expõe available apenas com preview agregado', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    const handle = await mountHydrated();
    const result = await callInspect(handle);
    expect(result).toEqual({ status: 'available', preview: PREVIEW });
    expect(JSON.stringify(result)).not.toContain('sourceOperationId');
    expect(JSON.stringify(result)).not.toContain('targetCoreRaw');
    expect(JSON.stringify(result)).not.toContain('fingerprint');
  });

  it('expõe ambiguous sem escolher candidato', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    mockResolveLogicalRestorePredecessorV2.mockResolvedValue({ status: 'ambiguous' });
    const handle = await mountHydrated();
    const result = await callInspect(handle);
    expect(result).toEqual({ status: 'ambiguous' });
  });
});

describe('commitLogicalRestoreV2 — pré-flights', () => {
  it('recusa treino ativo antes da escrita', async () => {
    seedV1Envelope();
    const handle = await mountHydrated();
    expect(handle.context().activeWorkout).not.toBeNull();
    const result = await callRestore(handle);
    expect(result).toMatchObject({ ok: false, reason: 'active-workout' });
    expect(mockCommitLogicalStorageRestoreV2).not.toHaveBeenCalled();
  });

  it('recusa owner-token ocupado antes da escrita', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    mockInspectStorageAdminOwnerToken.mockReturnValue(Object.freeze({ status: 'busy' }));
    const handle = await mountHydrated();
    await callInspect(handle);
    const result = await callRestore(handle);
    expect(result).toMatchObject({ ok: false, reason: 'owner-token-busy' });
    expect(mockCommitLogicalStorageRestoreV2).not.toHaveBeenCalled();
  });

  it('recusa quando não há prova prévia', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    const handle = await mountHydrated();
    const result = await callRestore(handle);
    expect(result).toMatchObject({ ok: false, reason: 'restore-unavailable' });
    expect(mockCommitLogicalStorageRestoreV2).not.toHaveBeenCalled();
  });

  it('recusa completion pendente na re-resolução', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    const handle = await mountHydrated();
    await callInspect(handle);
    mockResolveLogicalRestorePredecessorV2.mockResolvedValue({
      status: 'busy',
      reason: 'completion-pending',
    });
    const result = await callRestore(handle);
    expect(result).toMatchObject({ ok: false, reason: 'completion-pending' });
    expect(mockCommitLogicalStorageRestoreV2).not.toHaveBeenCalled();
  });

  it('detecta mudança entre preview e confirmação', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    const handle = await mountHydrated();
    await callInspect(handle);
    mockResolveLogicalRestorePredecessorV2.mockResolvedValue({
      status: 'available',
      target: { ...TARGET_A, sourceOperationId: 'import-other' },
      preview: PREVIEW,
    });
    const result = await callRestore(handle);
    expect(result).toMatchObject({ ok: false, reason: 'proof-diverged' });
    expect(mockCommitLogicalStorageRestoreV2).not.toHaveBeenCalled();
  });
});

describe('commitLogicalRestoreV2 — sucesso e reload único', () => {
  it('sucesso settled agenda exatamente um reload', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    mockCommitLogicalStorageRestoreV2.mockResolvedValue({
      ok: true,
      operationId: 'restore-1',
      targetGenerationId: 'generation-a',
      previousGenerationId: 'generation-b',
    });
    const handle = await mountHydrated();
    await callInspect(handle);
    const result = await callRestore(handle);
    expect(result).toEqual({
      ok: true,
      requiresReload: true,
      message: 'Backup anterior restaurado. Recarregando...',
    });
    expect(JSON.stringify(result)).not.toContain('operationId');
    expect(JSON.stringify(result)).not.toContain('generation-a');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('recovery-required mantém bloqueio e recarrega', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    mockCommitLogicalStorageRestoreV2.mockResolvedValue({
      ok: false,
      reason: 'recovery-required',
      operationId: 'restore-1',
      targetGenerationId: 'generation-a',
      recoveryRequired: true,
    });
    const handle = await mountHydrated();
    await callInspect(handle);
    const result = await callRestore(handle);
    expect(result).toMatchObject({ ok: false, reason: 'recovery-required', requiresReload: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});

describe('commitLogicalRestoreV2 — clique duplo e Strict Mode', () => {
  it('segunda chamada retorna operation-open sem novo commit', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    let resolveCommit!: (value: { ok: true }) => void;
    mockCommitLogicalStorageRestoreV2.mockImplementation(
      () => new Promise((resolve) => { resolveCommit = resolve; }),
    );
    const handle = await mountHydrated();
    await callInspect(handle);

    let first!: RestoreResult;
    const firstPromise = (async () => {
      await act(async () => {
        first = await handle.context().commitLogicalRestoreV2();
      });
    })();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const second = await callRestore(handle);
    expect(second).toMatchObject({ ok: false, reason: 'operation-open' });
    expect(mockCommitLogicalStorageRestoreV2).toHaveBeenCalledTimes(1);
    resolveCommit({ ok: true });
    await firstPromise;
    expect(first).toMatchObject({ ok: true });
  });

  it('Strict Mode não duplica o commit', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    mockCommitLogicalStorageRestoreV2.mockResolvedValue({ ok: true });
    const handle = await mountHydrated({ strict: true });
    await callInspect(handle);
    const result = await callRestore(handle);
    expect(result).toMatchObject({ ok: true });
    expect(mockCommitLogicalStorageRestoreV2).toHaveBeenCalledTimes(1);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(reloadSpy).toHaveBeenCalled();
  });
});

describe('commitLogicalRestoreV2 — autosave tardio', () => {
  it('pagehide após sucesso settled não grava o estado React antigo', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    mockCommitLogicalStorageRestoreV2.mockResolvedValue({ ok: true });
    const handle = await mountHydrated();
    const before = storage.getItem(STORAGE_KEY);
    await callInspect(handle);
    await callRestore(handle);
    windowStub.dispatchEvent(new Event('pagehide'));
    await settle(3);
    expect(storage.getItem(STORAGE_KEY)).toBe(before);
  });

  it('falha sem write libera o bloqueio', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    mockCommitLogicalStorageRestoreV2.mockResolvedValue({
      ok: false,
      reason: 'provenance-diverged',
      operationId: null,
      targetGenerationId: 'generation-a',
      recoveryRequired: false,
    });
    const handle = await mountHydrated();
    await callInspect(handle);
    const result = await callRestore(handle);
    expect(result).toMatchObject({ ok: false, reason: 'proof-diverged', requiresReload: false });
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
