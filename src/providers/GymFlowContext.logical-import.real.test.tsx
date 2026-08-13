import { IDBFactory } from 'fake-indexeddb';
import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import {
  GYMFLOW_INDEXEDDB_VERSION,
  STORAGE_OPERATION_RECEIPTS_STORE,
} from '../lib/storage-indexeddb';
import { createStorageAdminOwnerTokenCoordinator } from '../lib/storage-admin-owner-token';
import { inspectLogicalStorageBackupV2 } from '../lib/storage-logical-backup';
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
// GOAL-17B-E4B (auditoria 083): INTEGRAÇÃO REAL.
//
// Nada é mockado no caminho administrativo: commitLogicalStorageImportV2 real
// (W0–W10), runtime administrativo real, adapter real sobre fake-indexeddb,
// StorageLike (MemoryLocalStorage) real, owner-token real. O raw é produzido
// pelo exportador real do próprio Provider.
// ---------------------------------------------------------------------------

type GymFlowValue = ReturnType<typeof useGymFlow>;
type ImportResult = ReturnType<GymFlowValue['importLogicalBackupV2']> extends Promise<infer R> ? R : never;

const DAYS_ORDER = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// ===== Ambiente de navegador mínimo (mesmo contrato do teste do wrapper) =====

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

// Sabotage injetável e de disparo único sobre a chave principal (STORAGE_KEY).
// Ouvir o primeiro write do core durante o commit real permite exercitar
// falhas determinísticas no meio do protocolo W6.
type MainKeySabotage =
  | { mode: 'pass' }
  | { mode: 'throw' }
  | { mode: 'corrupt-after-write' }
  | { mode: 'dispatch-pagehide-after-write' };

let sabotage: MainKeySabotage = { mode: 'pass' };

// Reservado para futura instrumentação de debug.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _probeDispatchLog: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _probeDispatchCount = 0;

const underlying = new MemoryLocalStorage();

const localStorageFacade = {
  getItem(key: string): string | null {
    return underlying.getItem(key);
  },
  setItem(key: string, value: string): void {
    const mode = key === STORAGE_KEY ? sabotage.mode : 'pass';
    // Consome o sabotage somente na chave principal (STORAGE_KEY). O W6 do
    // commitLogicalStorageImportV2 escreve primeiro no backupKey (que NÃO é
    // STORAGE_KEY) e depois no STORAGE_KEY. Sem este guard, o backupKey
    // consumiria o sabotage antes do write crítico.
    if (key === STORAGE_KEY) {
      sabotage = { mode: 'pass' };
    }
    if (mode === 'throw') {
      throw new Error('falha injetada no write do core v2');
    }
    underlying.setItem(key, value);
    if (mode === 'corrupt-after-write') {
      underlying.setItem(key, `${value}\u0000corrupt`);
    }
    if (mode === 'dispatch-pagehide-after-write') {
      windowStub.dispatchEvent(new Event('pagehide'));
    }
  },
  removeItem(key: string): void {
    underlying.removeItem(key);
  },
};

const storage = localStorageFacade;
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
  sabotage = { mode: 'pass' };
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

// ===== Acesso físico ao armazenamento =====

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

// ===== Fixtures =====

const STARTED_AT = 1_784_000_000_000;

function makeHistoricalSession(): WorkoutSession {
  return {
    id: 'session-1',
    name: 'Treino A — Peito',
    date: new Date(STARTED_AT).toISOString(),
    duration: 42,
    calories: 300,
    xpEarned: 50,
    prsDetected: [],
    status: 'completed',
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

function seedV1Envelope(): void {
  const weeklyPlan = makeWeeklyPlan();
  storage.setItem(STORAGE_KEY, JSON.stringify({
    v: MONOLITHIC_STORAGE_VERSION,
    savedAt: '2026-07-23T10:00:00.000Z',
    data: {
      user: makeUser({ weeklyPlan }),
      weeklyPlan,
      customPrograms: [],
      activeWorkout: null,
      activeWorkoutStartedAt: null,
      restTimerEndAt: null,
      restTimerTotalSeconds: null,
      restTimerLabel: null,
      workoutHistory: [makeHistoricalSession()],
      weightHistory: [],
      measurementsHistory: [],
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
      achievements: makeAchievements(),
      challenges: makeChallenges(),
      favoriteExercises: [],
      recentlyViewedVideoIds: [],
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

// Drena a janela do debounce do autosave (500 ms) armado pela hidratação:
// qualquer save pendente é executado ANTES de armar sabotagens, para que o
// primeiro write da chave principal observado seja realmente o W6 do commit.
async function flushDebounceWindow(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 600));
  });
  await settle(3);
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

// Produz um arquivo lógico v2 REAL pelo caminho real do Provider (export → raw).
async function exportRealBackup(handle: Mounted): Promise<{
  raw: string;
  declaredBytes: number;
  expectedPayloadDigest: string;
}> {
  const exported = await handle.context().exportLogicalBackupV2();
  if (!exported.ok) {
    throw new Error(`Export real falhou: ${exported.reason}`);
  }
  const inspection = await inspectLogicalStorageBackupV2(exported.content, exported.bytes);
  if (!inspection.ok) {
    throw new Error(`Inspeção do raw exportado falhou: ${inspection.reason}`);
  }
  return {
    raw: exported.content,
    declaredBytes: exported.bytes,
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
      // já desmontado pelo próprio teste
    }
  }
  await settle(10);
  restoreBrowserGlobals();
});

// ===== Testes de integração REAL =====

describe('importLogicalBackupV2 — integração REAL (W0–W10, sem mocks)', () => {
  it('sucesso settled: ok:true, receipt settled, único reload e zero autosave tardio', async () => {
    seedV1Envelope();
    const handle = await mountHydrated();
    expect(handle.context().storageMode).toBe('hybrid-v2');
    const beforeImport = mainKeyContent();

    const backup = await exportRealBackup(handle);
    const result = await callImport(handle, backup);

    expect(result).toEqual({ ok: true });

    // W10: o receipt está settled no journal físico.
    const receipts = await readOperationReceipts();
    expect(receipts.filter((r) => r.status === 'settled' && r.kind === 'import').length).toBe(1);

    // O core importado substituiu o anterior.
    const afterImport = mainKeyContent();
    expect(afterImport).not.toBe(beforeImport);
    expect(parsePhysicalEnvelope(afterImport as string).status).toBe('v2');

    // Ainda dentro da janela de reload: um pagehide NÃO pode regravar o core
    // antigo por cima do importado (autosave suspenso até o reload).
    windowStub.dispatchEvent(new Event('pagehide'));
    await settle(3);
    expect(mainKeyContent()).toBe(afterImport);

    // Reload controlado único.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('digest divergente: falha antes do primeiro write, nada persistido e autosave liberado', async () => {
    seedV1Envelope();
    const handle = await mountHydrated();
    const beforeImport = mainKeyContent();

    const backup = await exportRealBackup(handle);
    const wrongDigest = 'sha256:'.concat('0'.repeat(64));
    const result = await callImport(handle, { ...backup, expectedPayloadDigest: wrongDigest });

    expect(result).toMatchObject({ ok: false, reason: 'import-failed', requiresReload: false });
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(mainKeyContent()).toBe(beforeImport);
    expect(await readOperationReceipts()).toEqual([]);

    // Falha comprovadamente sem write: autosave retomado — um flush posterior
    // grava normalmente.
    windowStub.dispatchEvent(new Event('pagehide'));
    await settle(3);
    expect(mainKeyContent()).not.toBe(beforeImport);
  });

  it('owner-token ocupado por outra aba: bloqueio antes de qualquer write', async () => {
    seedV1Envelope();
    const handle = await mountHydrated();
    const beforeImport = mainKeyContent();

    const coordinator = createStorageAdminOwnerTokenCoordinator({
      key: STORAGE_KEY,
      storage: storage,
    });
    const acquisition = coordinator.acquire({
      operationId: coordinator.createOperationId(),
      operationKind: 'import',
    });
    expect(acquisition.status).toBe('acquired');
    try {
      const backup = await exportRealBackup(handle);
      const result = await callImport(handle, backup);

      expect(result).toMatchObject({ ok: false, reason: 'owner-token-busy', requiresReload: false });
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(mainKeyContent()).toBe(beforeImport);
      expect(await readOperationReceipts()).toEqual([]);
    } finally {
      coordinateRelease(acquisition);
    }
  });

  it('falha no write do core W6 após ativação W5: recovery-required, compensação não pode reverter geração ativada', async () => {
    seedV1Envelope();
    const handle = await mountHydrated();
    await flushDebounceWindow();
    const beforeImport = mainKeyContent();

    sabotage = { mode: 'throw' };
    const backup = await exportRealBackup(handle);
    const result = await callImport(handle, backup);

    // O throw no W6 ocorre DEPOIS da ativação da geração (W5). A compensação
    // tenta restaurar a geração anterior, mas o `restorePreviousGeneration`
    // falha porque a geração ativada não pode ser revertida de forma segura
    // sem o CAS. O resultado é `recovery-required`, não `import-failed`.
    expect(result).toMatchObject({ ok: false, reason: 'recovery-required', requiresReload: true });
    expect(mainKeyContent()).toBe(beforeImport);
  });

  it('recovery-required (valor terceiro no core): reload, bloqueio mantido e zero escrita tardia', async () => {
    seedV1Envelope();
    const handle = await mountHydrated();
    await flushDebounceWindow();
    const beforeImport = mainKeyContent();

    sabotage = { mode: 'corrupt-after-write' };
    const backup = await exportRealBackup(handle);
    const result = await callImport(handle, backup);

    expect(result).toMatchObject({ ok: false, reason: 'recovery-required', requiresReload: true });

    // Estado ambíguo preservado: o valor terceiro NÃO é tocado por autosave.
    const ambiguousRaw = mainKeyContent();
    expect(ambiguousRaw).not.toBe(beforeImport);
    windowStub.dispatchEvent(new Event('pagehide'));
    await settle(10);
    expect(mainKeyContent()).toBe(ambiguousRaw);

    // Reload controlado. O segundo reload é disparado pelo pagehide posterior
    // que aciona o lifecycleFlush → flushPendingCompletionCoreNow (com
    // completionRecoveryRequiredRef true após a importação ambígua).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(reloadSpy).toHaveBeenCalled();
  });

  it('zero autosave tardio DURANTE a operação: pagehide no meio do commit não corrompe o sucesso', async () => {
    seedV1Envelope();
    const handle = await mountHydrated();
    await flushDebounceWindow();

    // Instrumenta a contagem de invocações do wrapper (Strict Mode/log duplo).
    const probeContext = handle.context();
    const originalImport = probeContext.importLogicalBackupV2;
    let wrapperInvocations = 0;
    probeContext.importLogicalBackupV2 = (async (input: {
      raw: string;
      declaredBytes: number;
      expectedPayloadDigest: string;
    }) => {
      wrapperInvocations += 1;
      return originalImport(input);
    }) as typeof originalImport;

    // Um pagehide disparado pelo próprio primeiro write do core (W6). Com o
    // autosave suspenso durante a operação, o flush é ignorado e o commit
    // termina settled com sucesso.
    sabotage = { mode: 'dispatch-pagehide-after-write' };
    const backup = await exportRealBackup(handle);
    const result = await callImport(handle, backup);

    expect(result).toEqual({ ok: true });
    const receipts = await readOperationReceipts();
    expect(receipts.filter((r) => r.status === 'settled' && r.kind === 'import').length).toBe(1);
    expect(wrapperInvocations).toBe(1);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('Strict Mode: commit real executado uma única vez e reload único', async () => {
    seedV1Envelope();
    const handle = await mountHydrated({ strict: true });
    await flushDebounceWindow();
    expect(handle.context().storageMode).toBe('hybrid-v2');

    const backup = await exportRealBackup(handle);
    const result = await callImport(handle, backup);

    expect(result).toEqual({ ok: true });
    const receipts = await readOperationReceipts();
    expect(receipts.filter((r) => r.kind === 'import' && r.status === 'settled').length).toBe(1);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});

// Helper de escape do tipo do lease para o finally.
function coordinateRelease(acquisition: { status: string; lease?: { release: () => void } }): void {
  if (acquisition.status === 'acquired' && acquisition.lease) {
    acquisition.lease.release();
  }
}