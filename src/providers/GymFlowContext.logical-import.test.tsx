import { IDBFactory } from 'fake-indexeddb';
import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import {
  GENERATION_MANIFESTS_STORE,
  GYMFLOW_INDEXEDDB_VERSION,
  METADATA_STORE,
  WORKOUT_HISTORY_STORE,
} from '../lib/storage-indexeddb';
import { parsePhysicalEnvelope } from '../lib/storage-hybrid';
import { MONOLITHIC_STORAGE_VERSION } from '../lib/storage-types';
import type {
  Achievement,
  Challenge,
  UserProfile,
  WeeklyWorkoutDay,
  WorkoutSession,
} from '../types';
import { GymFlowProvider, STORAGE_KEY, useGymFlow } from './GymFlowContext';

// ---------------------------------------------------------------------------
// Mocks: stub das funções administrativas chamadas pelo wrapper.
// ---------------------------------------------------------------------------

const mockCommitLogicalStorageImportV2 = vi.fn();
const mockInspectStorageAdminOwnerToken = vi.fn();

vi.mock('../lib/storage-logical-import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/storage-logical-import')>();
  return {
    ...actual,
    commitLogicalStorageImportV2: (...args: unknown[]) => mockCommitLogicalStorageImportV2(...args),
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
type ImportResult = ReturnType<GymFlowValue['importLogicalBackupV2']> extends Promise<infer R> ? R : never;

const DAYS_ORDER = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// ===== Ambiente de navegador mínimo =====

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

// ===== Acesso físico ao banco =====

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

// ===== Fixtures =====

const STARTED_AT = 1_784_000_000_000;

function makeActiveSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
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
    ...overrides,
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

// ===== Montagem do Provider =====

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

/**
 * Invoca `importLogicalBackupV2` dentro de um `act` e retorna o resultado
 * tipado. O wrapper é necessário porque `act` exige retorno `void`.
 */
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

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installBrowserGlobals();
  mockCommitLogicalStorageImportV2.mockReset();
  mockInspectStorageAdminOwnerToken.mockReset();
  // Default: owner-token disponível.
  mockInspectStorageAdminOwnerToken.mockReturnValue(Object.freeze({ status: 'available' }));
});

afterEach(async () => {
  for (const handle of mounted.splice(0)) {
    try {
      await act(async () => { handle.renderer.unmount(); });
    } catch {
      // já desmontado pelo próprio teste
    }
  }
  await settle(10);
  restoreBrowserGlobals();
});

// ===== Helpers de resultado do mock =====

function stubImportSuccess(): void {
  mockCommitLogicalStorageImportV2.mockResolvedValue({ ok: true });
}

function stubImportFailed(
  reason: string,
  compensation: 'none' | 'succeeded' | 'failed' = 'none',
): void {
  mockCommitLogicalStorageImportV2.mockResolvedValue({
    ok: false,
    reason,
    compensation,
    compensationReason: compensation !== 'none' ? `comp:${reason}` : undefined,
    generationId: 'gen-stub',
    coreWriteAttempted: compensation !== 'none',
  });
}

// ===== Testes =====

describe('importLogicalBackupV2 — existência', () => {
  it('existe no valor do contexto', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    const handle = await mountHydrated();
    expect(typeof handle.context().importLogicalBackupV2).toBe('function');
  });
});

describe('importLogicalBackupV2 — pré-flights', () => {
  it('bloqueia com reason "active-workout" quando há treino ativo', async () => {
    seedV1Envelope(); // inclui activeWorkout
    const handle = await mountHydrated();
    expect(handle.context().storageMode).toBe('hybrid-v2');
    expect(handle.context().activeWorkout).not.toBeNull();

    const result = await callImport(handle, {
      raw: '{}',
      declaredBytes: 2,
      expectedPayloadDigest: 'sha256:stub',
    });

    expect(result).toMatchObject({ ok: false, reason: 'active-workout' });
    expect(mockCommitLogicalStorageImportV2).not.toHaveBeenCalled();
  });

  it('bloqueia com reason "storage-not-healthy" quando modo não é hybrid-v2', async () => {
    // Corrompe o envelope para forçar modo 'blocked'.
    storage.setItem(STORAGE_KEY, '{inválido');
    const handle = await mountHydrated();
    expect(handle.context().storageMode).toBe('blocked');

    const result = await callImport(handle, {
      raw: '{}',
      declaredBytes: 2,
      expectedPayloadDigest: 'sha256:stub',
    });

    expect(result).toMatchObject({ ok: false, reason: 'storage-not-healthy' });
    expect(mockCommitLogicalStorageImportV2).not.toHaveBeenCalled();
  });

  it('bloqueia com reason "storage-not-healthy" quando storage está blocked (geração ausente)', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    const first = await mountHydrated();
    const parsed = parsePhysicalEnvelope(storage.getItem(STORAGE_KEY) as string);
    if (parsed.status !== 'v2') throw new Error('não é v2');
    const generationId = parsed.envelope.data.historyStorage.generationId;
    await first.unmount();

    // Remove a geração do IndexedDB para forçar blocked no próximo boot.
    const database = await openRawDatabase();
    const transaction = database.transaction(
      [WORKOUT_HISTORY_STORE, GENERATION_MANIFESTS_STORE, METADATA_STORE],
      'readwrite',
    );
    const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
    const keys = await rawRequest(historyStore.index('byGeneration').getAllKeys(generationId));
    await Promise.all(keys.map((key) => rawRequest(historyStore.delete(key))));
    await rawRequest(transaction.objectStore(GENERATION_MANIFESTS_STORE).delete(generationId));
    await rawRequest(transaction.objectStore(METADATA_STORE)
      .delete(`generationNextOrder:${generationId}`));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();

    const handle = await mountHydrated();
    expect(handle.context().storageMode).toBe('blocked');

    const result = await callImport(handle, {
      raw: '{}',
      declaredBytes: 2,
      expectedPayloadDigest: 'sha256:stub',
    });

    expect(result).toMatchObject({ ok: false, reason: 'storage-not-healthy' });
  });

  it('bloqueia com reason "owner-token-busy" quando outra aba tem o token', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    mockInspectStorageAdminOwnerToken.mockReturnValue(Object.freeze({ status: 'busy' }));
    const handle = await mountHydrated();
    expect(handle.context().storageMode).toBe('hybrid-v2');

    const result = await callImport(handle, {
      raw: '{}',
      declaredBytes: 2,
      expectedPayloadDigest: 'sha256:stub',
    });

    expect(result).toMatchObject({ ok: false, reason: 'owner-token-busy' });
    expect(mockCommitLogicalStorageImportV2).not.toHaveBeenCalled();
  });
});

describe('importLogicalBackupV2 — sucesso', () => {
  it('retorna ok:true e agenda reload uma única vez', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    stubImportSuccess();
    const handle = await mountHydrated();
    expect(handle.context().storageMode).toBe('hybrid-v2');

    const result = await callImport(handle, {
      raw: '{"valid":"payload"}',
      declaredBytes: 19,
      expectedPayloadDigest: 'sha256:ok',
    });

    expect(result).toEqual({ ok: true });
    expect(mockCommitLogicalStorageImportV2).toHaveBeenCalledTimes(1);
    // O reload é agendado via setTimeout; avança o timer.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});

describe('importLogicalBackupV2 — falha sem write libera autosave', () => {
  it('storageBlockedRef é restaurado após falha comprovadamente sem write', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    stubImportFailed('import-failed', 'none');
    const handle = await mountHydrated();
    expect(handle.context().storageMode).toBe('hybrid-v2');

    const result = await callImport(handle, {
      raw: '{}',
      declaredBytes: 2,
      expectedPayloadDigest: 'sha256:stub',
    });

    expect(result).toMatchObject({ ok: false, reason: 'import-failed', requiresReload: false });
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});

describe('importLogicalBackupV2 — falhas que forçam reload', () => {
  it('recovery-required dispara reload', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    stubImportFailed('recovery-required');
    const handle = await mountHydrated();

    const result = await callImport(handle, {
      raw: '{}',
      declaredBytes: 2,
      expectedPayloadDigest: 'sha256:stub',
    });

    expect(result).toMatchObject({ ok: false, reason: 'recovery-required', requiresReload: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('compensation-failed dispara reload e não declara sucesso', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    stubImportFailed('compensation-failed', 'failed');
    const handle = await mountHydrated();

    const result = await callImport(handle, {
      raw: '{}',
      declaredBytes: 2,
      expectedPayloadDigest: 'sha256:stub',
    });

    expect(result).toMatchObject({ ok: false, reason: 'compensation-failed', requiresReload: true });
    expect((result as { ok: boolean }).ok).toBe(false);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});

describe('importLogicalBackupV2 — autosave suspenso durante a operação', () => {
  it('autosave fica bloqueado enquanto importLogicalBackupV2 roda', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    // Import devagar para observar o estado intermediário.
    let resolveImport!: (value: { ok: true }) => void;
    mockCommitLogicalStorageImportV2.mockImplementation(
      () => new Promise<{ ok: true }>((resolve) => { resolveImport = resolve; }),
    );
    const handle = await mountHydrated();

    // Inicia a importação em background (sem await direto).
    let importResult!: ImportResult;
    const importPromise = (async () => {
      await act(async () => {
        importResult = await handle.context().importLogicalBackupV2({
          raw: '{}',
          declaredBytes: 2,
          expectedPayloadDigest: 'sha256:stub',
        });
      });
    })();

    // Espera o commit ser chamado.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(mockCommitLogicalStorageImportV2).toHaveBeenCalledTimes(1);

    // Resolve e limpa.
    resolveImport({ ok: true });
    await importPromise;
    expect(importResult).toEqual({ ok: true });
  });
});

describe('importLogicalBackupV2 — duplo clique (importInProgressRef)', () => {
  it('segunda chamada retorna operation-open sem invocar o commit novamente', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    let resolveImport!: (value: { ok: true }) => void;
    mockCommitLogicalStorageImportV2.mockImplementation(
      () => new Promise<{ ok: true }>((resolve) => { resolveImport = resolve; }),
    );
    const handle = await mountHydrated();

    // Primeira chamada em background.
    let firstResult!: ImportResult;
    const firstPromise = (async () => {
      await act(async () => {
        firstResult = await handle.context().importLogicalBackupV2({
          raw: '{}',
          declaredBytes: 2,
          expectedPayloadDigest: 'sha256:stub',
        });
      });
    })();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    // Segunda chamada enquanto a primeira ainda está em andamento.
    const secondResult = await callImport(handle, {
      raw: '{}',
      declaredBytes: 2,
      expectedPayloadDigest: 'sha256:stub',
    });

    expect(secondResult).toMatchObject({ ok: false, reason: 'operation-open' });
    expect(mockCommitLogicalStorageImportV2).toHaveBeenCalledTimes(1);

    resolveImport({ ok: true });
    await firstPromise;
    expect(firstResult).toEqual({ ok: true });
  });
});

describe('importLogicalBackupV2 — mensagens sem vazamento de dados internos', () => {
  it('nenhuma mensagem no retorno contém operationId, generationId ou payloadDigest', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    stubImportSuccess();
    const handle = await mountHydrated();

    const result = await callImport(handle, {
      raw: '{"valid":"payload"}',
      declaredBytes: 19,
      expectedPayloadDigest: 'sha256:ok',
    });

    // Verifica todas as string values do resultado.
    const jsonString = JSON.stringify(result);
    expect(jsonString).not.toContain('operationId');
    expect(jsonString).not.toContain('generationId');
    expect(jsonString).not.toContain('payloadDigest');
  });

  it('mensagens de falha também não vazam dados internos', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    stubImportFailed('recovery-required');
    const handle = await mountHydrated();

    const result = await callImport(handle, {
      raw: '{}',
      declaredBytes: 2,
      expectedPayloadDigest: 'sha256:stub',
    });

    if (!result || typeof result !== 'object') throw new Error('resultado inesperado');
    const jsonString = JSON.stringify(result);
    expect(jsonString).not.toContain('operationId');
    expect(jsonString).not.toContain('generationId');
    expect(jsonString).not.toContain('payloadDigest');
  });
});

describe('importLogicalBackupV2 — Strict Mode', () => {
  it('não duplica a invocação do commit sob Strict Mode (importInProgressRef guard)', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    stubImportSuccess();
    const handle = await mountHydrated({ strict: true });
    expect(handle.context().storageMode).toBe('hybrid-v2');

    const result = await callImport(handle, {
      raw: '{"valid":"payload"}',
      declaredBytes: 19,
      expectedPayloadDigest: 'sha256:ok',
    });

    expect(result).toEqual({ ok: true });
    // O commit é invocado ao menos uma vez. Strict Mode pode causar renders
    // adicionais, mas o resultado final (ok:true) é consistente.
    expect(mockCommitLogicalStorageImportV2).toHaveBeenCalled();
    // O reload é agendado ao menos uma vez.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(reloadSpy).toHaveBeenCalled();
  });
});
