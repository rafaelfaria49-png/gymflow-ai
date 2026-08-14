import fs from 'node:fs';
import path from 'node:path';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import type { WorkoutSession } from '../types';
import { loadStateResult, STORAGE_BACKUP_SUFFIX } from './storage';
import type { VerifiedHistoryGeneration } from './storage-adapter';
import {
  createStorageAdminRuntime,
  type StorageAdministrationSnapshot,
} from './storage-admin-runtime';
import {
  commitStorageImport,
  createStorageExport,
  inspectStorageImport,
  MAX_IMPORT_BYTES,
  STORAGE_EXPORT_FORMAT_VERSION,
} from './storage-export';
import {
  combineCoreWithHistory,
  createHybridStorageRuntime,
  parsePhysicalEnvelope,
} from './storage-hybrid';
import {
  computeOrderedDigestFromSessionDigests,
  digestWorkoutSessions,
  EMPTY_GENERATION_DIGEST,
  type HistoryGenerationManifest,
  serializeWorkoutHistoryDeterministically,
} from './storage-history-integrity';
import {
  createWorkoutCompletionReceipt,
  type WorkoutCompletionEffects,
} from './storage-completion-receipt';
import {
  GENERATION_MANIFESTS_STORE,
  GYMFLOW_INDEXEDDB_VERSION,
  IndexedDbWorkoutHistoryStorage,
  METADATA_STORE,
  STORAGE_OPERATION_RECEIPTS_STORE,
  WORKOUT_HISTORY_STORE,
} from './storage-indexeddb';
import * as logicalBackupModule from './storage-logical-backup';
import {
  captureLogicalBackupSnapshot,
  computeLogicalPayloadDigest,
  createLogicalStorageExportV2,
  describeLogicalBackupSize,
  inspectLogicalStorageBackupV2,
  isCanonicalIsoInstant,
  LOGICAL_BACKUP_ENVELOPE_FIELDS,
  LOGICAL_BACKUP_FORMAT_VERSION,
  LOGICAL_BACKUP_LARGE_WARNING_BYTES,
  LOGICAL_BACKUP_SCHEMA_VERSION,
  type LogicalBackupRuntime,
  MAX_LOGICAL_BACKUP_BYTES,
  serializeLogicalPayloadCanonically,
  validateLogicalBackupEnvelopeContract,
  validateLogicalBackupPayload,
  validateLogicalJsonTree,
} from './storage-logical-backup';
import type { StorageOperationReceipt } from './storage-operation-receipt';
import {
  HYBRID_STORAGE_VERSION,
  MONOLITHIC_STORAGE_VERSION,
  type PersistedState,
  type StorageLike,
} from './storage-types';

const KEY = 'gymflow:state:v1';
let databaseSequence = 0;

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function utf8(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function makeSession(index: number, overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  const startedAt = 1_767_225_600_000 + index * 86_400_000;
  return {
    id: `session-${index}`,
    name: `Treino ${index}`,
    date: new Date(startedAt).toISOString(),
    duration: 3_600,
    calories: 420,
    xpEarned: 180,
    totalVolume: 12_500 + index,
    prsDetected: [],
    sourceProgramId: 'program-1',
    sourceProgramDayId: 'day-1',
    sourceProgramName: 'Programa multi-dia',
    sourceProgramDayName: 'Dia 1 — Peito',
    status: 'completed',
    startedAt,
    endedAt: startedAt + 3_600_000,
    exercises: [{
      id: `entry-${index}`,
      exerciseId: 'exercise-1',
      name: 'Remada articulada',
      muscleGroup: 'back',
      notes: '',
      repRange: [8, 12],
      targetRPE: 8,
      restSec: 90,
      progressionNote: '',
      plannedSlotIndex: 0,
      entryOrigin: 'planned',
      entryStatus: 'performed',
      sets: [{
        id: `set-${index}`,
        reps: 10,
        weight: 60,
        completed: true,
        suggestedWeight: 60,
        lastWeight: 60,
        rpe: 8,
      }],
    }],
    ...overrides,
  };
}

function defaults(history: WorkoutSession[] = []): PersistedState {
  return {
    user: null,
    weeklyPlan: [],
    customPrograms: [],
    activeWorkout: null,
    activeWorkoutStartedAt: null,
    restTimerEndAt: null,
    restTimerTotalSeconds: null,
    restTimerLabel: null,
    workoutHistory: history,
    weightHistory: [],
    measurementsHistory: [],
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
    achievements: [],
    challenges: [],
    favoriteExercises: [],
    recentlyViewedVideoIds: [],
  };
}

function logicalPayload(overrides: Partial<PersistedState> = {}): PersistedState {
  return { ...defaults(), ...overrides };
}

function v1Envelope(state: Partial<PersistedState>): string {
  return JSON.stringify({
    v: MONOLITHIC_STORAGE_VERSION,
    savedAt: '2026-07-23T10:00:00.000Z',
    data: state,
  });
}

const EMPTY_EFFECTS: WorkoutCompletionEffects = {
  xpNotifications: [],
  communityPost: {
    id: 'post-1',
    authorName: 'Rafael',
    authorAvatar: '🚀',
    time: 'Agora mesmo',
    content: 'Treino finalizado!',
    likes: 0,
    comments: [],
    userLiked: false,
    shares: 0,
  },
  unlockedAchievementIds: [],
  markedDayName: 'Segunda',
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => undefined;
  });
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  const request = factory.open(name, GYMFLOW_INDEXEDDB_VERSION);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  factory: IDBFactory,
  name: string,
  storeNames: string | string[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const database = await openDatabase(factory, name);
  const transaction = database.transaction(storeNames, mode);
  const completed = transactionResult(transaction);
  const result = await run(transaction);
  await completed;
  database.close();
  return result;
}

interface RawHistoryRecord {
  generationId: string;
  sessionId: string;
  order: number;
  session: WorkoutSession;
  digest: string;
}

function readHistoryRecords(factory: IDBFactory, name: string): Promise<RawHistoryRecord[]> {
  return withStore(factory, name, WORKOUT_HISTORY_STORE, 'readonly', (transaction) => (
    requestResult(transaction.objectStore(WORKOUT_HISTORY_STORE).getAll()) as Promise<RawHistoryRecord[]>
  ));
}

function putHistoryRecord(factory: IDBFactory, name: string, record: RawHistoryRecord): Promise<unknown> {
  return withStore(factory, name, WORKOUT_HISTORY_STORE, 'readwrite', (transaction) => (
    requestResult(transaction.objectStore(WORKOUT_HISTORY_STORE).put(record))
  ));
}

function readManifest(
  factory: IDBFactory,
  name: string,
  generationId: string,
): Promise<HistoryGenerationManifest> {
  return withStore(factory, name, GENERATION_MANIFESTS_STORE, 'readonly', (transaction) => (
    requestResult(
      transaction.objectStore(GENERATION_MANIFESTS_STORE).get(generationId),
    ) as Promise<HistoryGenerationManifest>
  ));
}

function putManifest(factory: IDBFactory, name: string, manifest: unknown): Promise<unknown> {
  return withStore(factory, name, GENERATION_MANIFESTS_STORE, 'readwrite', (transaction) => (
    requestResult(transaction.objectStore(GENERATION_MANIFESTS_STORE).put(manifest as never))
  ));
}

function putRawMetadata(factory: IDBFactory, name: string, key: string, value: unknown): Promise<unknown> {
  return withStore(factory, name, METADATA_STORE, 'readwrite', (transaction) => (
    requestResult(transaction.objectStore(METADATA_STORE).put({ key, value }))
  ));
}

function putRawOperationReceipt(
  factory: IDBFactory,
  name: string,
  record: Record<string, unknown>,
): Promise<unknown> {
  return withStore(factory, name, STORAGE_OPERATION_RECEIPTS_STORE, 'readwrite', (transaction) => (
    requestResult(transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE).put(record))
  ));
}

async function readAllStores(factory: IDBFactory, name: string): Promise<Record<string, unknown[]>> {
  const database = await openDatabase(factory, name);
  const storeNames = Array.from(database.objectStoreNames);
  const transaction = database.transaction(storeNames, 'readonly');
  const completed = transactionResult(transaction);
  const entries = await Promise.all(storeNames.map(async (storeName) => [
    storeName,
    await requestResult(transaction.objectStore(storeName).getAll()) as unknown[],
  ] as const));
  await completed;
  database.close();
  return Object.fromEntries(entries);
}

// PARTE 14 — invariância. Cobre core raw, metadata, workoutHistory, manifests,
// receipts administrativos, CompletionReceipts, snapshots legados e TODAS as
// chaves do localStorage (backup e quarentena inclusive).
interface PhysicalState {
  entries: [string, string][];
  stores: Record<string, unknown[]>;
}

async function capturePhysicalState(
  factory: IDBFactory,
  name: string,
  storage: MemoryStorage,
): Promise<PhysicalState> {
  return {
    entries: Array.from(storage.values.entries()).sort(([a], [b]) => a.localeCompare(b)),
    stores: await readAllStores(factory, name),
  };
}

function expectUnchanged(before: PhysicalState, after: PhysicalState): void {
  expect(JSON.stringify(after.entries)).toBe(JSON.stringify(before.entries));
  expect(JSON.stringify(after.stores)).toBe(JSON.stringify(before.stores));
}

async function createReadyHarness(options: {
  storage?: MemoryStorage;
  factory?: IDBFactory;
  sessions?: WorkoutSession[];
} = {}) {
  const storage = options.storage ?? new MemoryStorage();
  const factory = options.factory ?? new IDBFactory();
  const name = `gymflow-logical-${databaseSequence += 1}`;
  let generation = 0;
  const adapter = new IndexedDbWorkoutHistoryStorage({
    factory,
    databaseName: name,
    generationIdFactory: () => `generation-${generation += 1}`,
    now: () => new Date('2026-07-24T12:00:00.000Z'),
  });
  const hybrid = createHybridStorageRuntime({
    key: KEY,
    storage,
    adapter,
    defaults: defaults(),
    now: () => new Date('2026-07-24T12:00:00.000Z'),
  });
  const hydration = await hybrid.hydrate();
  if (hydration.mode !== 'hybrid-v2') {
    throw new Error(`setup de teste falhou: hidratação ficou em ${hydration.mode}`);
  }
  let generationId = hydration.generationId;
  if (options.sessions && options.sessions.length > 0) {
    generationId = await adapter.replaceHistory(options.sessions);
    // `replaceHistory` troca a geração ativa no IndexedDB; o core v2 precisa
    // apontar para ela, exatamente como `saveCore` faria no fluxo real. Sem
    // isso o harness nasceria com core e metadata descrevendo mundos
    // diferentes — que é justamente o que a captura tem de recusar.
    const envelope = JSON.parse(storage.getItem(KEY) as string) as {
      data: { historyStorage: Record<string, unknown> };
    };
    envelope.data.historyStorage = { ...envelope.data.historyStorage, generationId };
    storage.setItem(KEY, JSON.stringify(envelope));
  }
  const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter });
  return { storage, factory, name, adapter, hybrid, runtime, generationId };
}

type Harness = Awaited<ReturnType<typeof createReadyHarness>>;

// Patch do core v2 preservando envelope, `savedAt` e `historyStorage`.
function patchCore(storage: MemoryStorage, patch: Record<string, unknown>): void {
  const envelope = JSON.parse(storage.getItem(KEY) as string) as {
    data: Record<string, unknown>;
  };
  envelope.data = { ...envelope.data, ...patch };
  storage.setItem(KEY, JSON.stringify(envelope));
}

function inflateCore(storage: MemoryStorage, fillerBytes: number): void {
  patchCore(storage, { favoriteExercises: ['x'.repeat(fillerBytes)] });
}

// Troca só o `savedAt` do envelope físico, preservando o core inteiro.
function patchEnvelopeSavedAt(storage: MemoryStorage, savedAt: string): void {
  const envelope = JSON.parse(storage.getItem(KEY) as string) as Record<string, unknown>;
  envelope.savedAt = savedAt;
  storage.setItem(KEY, JSON.stringify(envelope));
}

// Roda `mutate` DEPOIS da n-ésima chamada real de `method`: a mutação física
// acontece dentro da janela do protocolo, com o adapter de verdade. Nada aqui
// simula retorno de erro.
function afterCall<T extends object>(
  target: T,
  method: keyof T & string,
  nth: number,
  mutate: () => Promise<void>,
): T {
  let calls = 0;
  return new Proxy(target, {
    get(object, prop, receiver) {
      const value = Reflect.get(object, prop, receiver);
      if (prop !== method || typeof value !== 'function') {
        return typeof value === 'function' ? value.bind(object) : value;
      }
      return async (...args: unknown[]) => {
        const result = await (value as (...a: unknown[]) => Promise<unknown>).apply(object, args);
        calls += 1;
        if (calls === nth) await mutate();
        return result;
      };
    },
  }) as T;
}

function beforeCall<T extends object>(
  target: T,
  method: keyof T & string,
  nth: number,
  mutate: () => Promise<void>,
): T {
  let calls = 0;
  return new Proxy(target, {
    get(object, prop, receiver) {
      const value = Reflect.get(object, prop, receiver);
      if (prop !== method || typeof value !== 'function') {
        return typeof value === 'function' ? value.bind(object) : value;
      }
      return async (...args: unknown[]) => {
        calls += 1;
        if (calls === nth) await mutate();
        return (value as (...a: unknown[]) => Promise<unknown>).apply(object, args);
      };
    },
  }) as T;
}

// Mutação a CADA chamada: instabilidade persistente, que a retentativa do
// diagnóstico não consegue absorver.
function onEveryCall<T extends object>(
  target: T,
  method: keyof T & string,
  mutate: (call: number) => Promise<void>,
): T {
  let calls = 0;
  return new Proxy(target, {
    get(object, prop, receiver) {
      const value = Reflect.get(object, prop, receiver);
      if (prop !== method || typeof value !== 'function') {
        return typeof value === 'function' ? value.bind(object) : value;
      }
      return async (...args: unknown[]) => {
        const result = await (value as (...a: unknown[]) => Promise<unknown>).apply(object, args);
        calls += 1;
        await mutate(calls);
        return result;
      };
    },
  }) as T;
}

function breakMethod<T extends object>(target: T, method: keyof T & string, error: () => Error): T {
  return new Proxy(target, {
    get(object, prop, receiver) {
      const value = Reflect.get(object, prop, receiver);
      if (prop !== method || typeof value !== 'function') {
        return typeof value === 'function' ? value.bind(object) : value;
      }
      return async () => { throw error(); };
    },
  }) as T;
}

// Fault injection ABA: muda o armazenamento ANTES da n-ésima chamada real de
// `method` e o devolve DEPOIS que ela retorna. É a corrida H1 → H2 → H1 que a
// auditoria comprovou: os dois diagnósticos veem H1, a leitura do meio recebe
// H2, e nada no estado administrativo em volta denuncia a diferença.
function aroundCall<T extends object>(
  target: T,
  method: keyof T & string,
  nth: number,
  before: () => Promise<void>,
  after: () => Promise<void>,
): T {
  let calls = 0;
  return new Proxy(target, {
    get(object, prop, receiver) {
      const value = Reflect.get(object, prop, receiver);
      if (prop !== method || typeof value !== 'function') {
        return typeof value === 'function' ? value.bind(object) : value;
      }
      return async (...args: unknown[]) => {
        calls += 1;
        const mine = calls === nth;
        if (mine) await before();
        const result = await (value as (...a: unknown[]) => Promise<unknown>).apply(object, args);
        if (mine) await after();
        return result;
      };
    },
  }) as T;
}

// Restaura TODOS os stores byte a byte a partir de um `capturePhysicalState`.
// Todas as requisições são emitidas na mesma volta do laço de eventos, como
// `stageGeneration` faz, para que a transação não feche no meio.
async function restoreStores(
  factory: IDBFactory,
  name: string,
  stores: Record<string, unknown[]>,
): Promise<void> {
  const database = await openDatabase(factory, name);
  const storeNames = Array.from(database.objectStoreNames);
  const transaction = database.transaction(storeNames, 'readwrite');
  const completed = transactionResult(transaction);
  const writes: Promise<unknown>[] = [];
  for (const storeName of storeNames) {
    const store = transaction.objectStore(storeName);
    writes.push(requestResult(store.clear()));
    for (const record of stores[storeName] ?? []) {
      writes.push(requestResult(store.put(record as never)));
    }
  }
  await Promise.all(writes);
  await completed;
  database.close();
}

// Reescreve a geração ATIVA com outro conteúdo, mantendo-a integralmente
// válida: registros, digests por registro e orderedDigest do manifest são
// recalculados juntos. Sem isso o H2 seria inválido e a exportação falharia
// pelo motivo errado — `administration-conflicted`, não a corrida.
async function writeGenerationSessions(
  harness: Harness,
  sessions: WorkoutSession[],
  manifestOverrides: Partial<HistoryGenerationManifest> = {},
): Promise<void> {
  const { factory, name, generationId } = harness;
  const digests = await digestWorkoutSessions(sessions);
  const orderedDigest = sessions.length === 0
    ? EMPTY_GENERATION_DIGEST
    : await computeOrderedDigestFromSessionDigests(digests);
  const current = await readManifest(factory, name, generationId);
  const existing = (await readHistoryRecords(factory, name))
    .filter((record) => record.generationId === generationId);

  await withStore(factory, name, WORKOUT_HISTORY_STORE, 'readwrite', async (transaction) => {
    const store = transaction.objectStore(WORKOUT_HISTORY_STORE);
    const writes: Promise<unknown>[] = [];
    for (const record of existing) {
      writes.push(requestResult(store.delete([record.generationId, record.order])));
    }
    sessions.forEach((session, order) => {
      writes.push(requestResult(store.put({
        generationId,
        sessionId: session.id,
        order,
        session,
        digest: digests[order],
      })));
    });
    await Promise.all(writes);
  });

  await putManifest(factory, name, {
    ...current,
    generationId,
    sessionCount: sessions.length,
    orderedDigest,
    verified: true,
    ...manifestOverrides,
  });
}

// Registra o que a captura REALMENTE observou. O `inspect` interno de
// `readVerifiedAdministrationGeneration` roda no runtime de verdade, então o log
// contém exatamente os dois diagnósticos do protocolo (A e B) e a leitura
// intermediária.
interface CaptureLog {
  snapshots: StorageAdministrationSnapshot[];
  readings: VerifiedHistoryGeneration[];
}

function recordingRuntime(runtime: LogicalBackupRuntime, log: CaptureLog): LogicalBackupRuntime {
  return {
    async inspectStorageAdministration() {
      const snapshot = await runtime.inspectStorageAdministration();
      log.snapshots.push(snapshot);
      return snapshot;
    },
    async readVerifiedAdministrationGeneration(generationId: string) {
      const verified = await runtime.readVerifiedAdministrationGeneration(generationId);
      log.readings.push(verified);
      return verified;
    },
  };
}

function verifiedGenerationOf(snapshot: StorageAdministrationSnapshot): {
  manifest: HistoryGenerationManifest;
  sessions: WorkoutSession[];
} {
  const integrity = snapshot.activeGenerationIntegrity;
  if (integrity === null || integrity.status !== 'verified') {
    throw new Error('o diagnóstico não trouxe uma geração ativa verificada');
  }
  return { manifest: integrity.manifest, sessions: integrity.sessions };
}

function runtimeOver(harness: Harness, adapter: unknown): LogicalBackupRuntime {
  return createStorageAdminRuntime({
    key: KEY,
    storage: harness.storage,
    adapter: adapter as Harness['adapter'],
  });
}

function coherentReceiptRecord(harness: Harness): StorageOperationReceipt {
  return {
    operationId: 'operation-corrida',
    kind: 'rollback',
    sourceDigest: null,
    previousCoreRaw: harness.storage.getItem(KEY) as string,
    previousGenerationId: harness.generationId,
    stagedGenerationId: null,
    targetCoreRaw: null,
    status: 'staged',
    createdAt: '2026-07-24T12:15:00.000Z',
    updatedAt: '2026-07-24T12:15:00.000Z',
  };
}

async function exportOk(runtime: LogicalBackupRuntime, now?: Date) {
  const result = await createLogicalStorageExportV2({ runtime, now });
  if (!result.ok) throw new Error(`exportação falhou inesperadamente: ${result.reason} — ${result.error}`);
  return result;
}

const PROFILE = {
  name: 'Rafael Façanha 🏋️',
  email: 'rafael@example.com',
  level: 'intermediate',
  goal: 'hypertrophy',
  gender: 'male',
  age: 34,
  weight: 82.4,
  height: 178,
  frequency: 4,
  duration: 60,
  location: 'gym',
  equipments: ['barra', 'halteres'],
  restrictions: [],
  muscleFocus: ['back'],
  preference: 'força',
  xp: 4200,
  streak: 9,
  waterIntake: 1500,
  waterGoal: 3000,
  premiumStatus: 'pro',
  points: 320,
};

const RICH_CORE = {
  user: PROFILE,
  activeWorkout: makeSession(50, { status: 'active', endedAt: undefined }),
  activeWorkoutStartedAt: 1_767_312_000_000,
  restTimerEndAt: 1_767_312_090_000,
  restTimerTotalSeconds: 90,
  restTimerLabel: 'Descanso — Remada',
  weightHistory: [
    { date: '2026-07-01', value: 83.2 },
    { date: '2026-07-15', value: 82.4 },
  ],
  measurementsHistory: [
    { date: '2026-07-01', chest: 104, waist: 84, hips: 98, arms: 38.5 },
  ],
  nutrition: { calories: 2600, protein: 180, carbs: 260, fat: 70, water: 2400 },
  favoriteExercises: ['exercise-1', 'exercise-7'],
  recentlyViewedVideoIds: ['video-3', 'video-9'],
  achievements: [{ id: 'ach-1', name: 'Primeiro treino', description: 'Começou', icon: '🥇', unlocked: true }],
  challenges: [{
    id: 'ch-1',
    name: 'Sete dias',
    durationDays: 7,
    xpReward: 500,
    description: 'Treinar 7 dias',
    progress: 40,
    completed: false,
    type: '7-days',
  }],
  weeklyPlan: [{
    dayName: 'Segunda',
    workoutName: 'Peito',
    muscleGroups: ['chest'],
    duration: 60,
    exerciseCount: 5,
    isRest: false,
  }],
  customPrograms: [{
    id: 'program-custom-1',
    name: 'Meu programa',
    durationWeeks: 8,
    frequencyDays: 4,
    level: 'intermediate',
    objective: 'hipertrofia',
    exercises: [],
    description: 'Programa pessoal',
    repeatWeeks: true,
    weeks: [],
    isCustom: true,
  }],
};

const rawV1Fixture = fs.readFileSync(
  path.join(process.cwd(), 'docs/audit/fixtures/gymflow-state-v1-active-workout.json'),
  'utf8',
);

// ---------------------------------------------------------------------------
// Contrato e conteúdo
// ---------------------------------------------------------------------------

describe('backup lógico v2 — contrato e conteúdo', () => {
  it('1. exportação saudável gera formatVersion 2', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(2), makeSession(1)] });
    const result = await exportOk(harness.runtime, new Date('2026-07-25T09:30:00.000Z'));
    expect(result.backup.format).toBe('gymflow-backup');
    expect(result.backup.formatVersion).toBe(2);
    expect(result.backup.sourcePhysicalStorageVersion).toBe(HYBRID_STORAGE_VERSION);
    expect(result.filename).toBe('gymflow-backup-v2-2026-07-25-0930.json');
    expect(result.backup.payloadDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('2. logicalSchemaVersion é 1 e a data exportada é ISO válida', async () => {
    const harness = await createReadyHarness();
    const result = await exportOk(harness.runtime, new Date('2026-07-25T09:30:00.000Z'));
    expect(result.backup.logicalSchemaVersion).toBe(LOGICAL_BACKUP_SCHEMA_VERSION);
    expect(result.backup.exportedAt).toBe('2026-07-25T09:30:00.000Z');
    expect(Number.isNaN(Date.parse(result.backup.sourceSavedAt))).toBe(false);
  });

  it('3. o payload declara exatamente os 16 campos raiz do PersistedState', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const result = await exportOk(harness.runtime);
    expect(Object.keys(result.backup.payload).sort()).toEqual([
      'achievements',
      'activeWorkout',
      'activeWorkoutStartedAt',
      'challenges',
      'customPrograms',
      'favoriteExercises',
      'measurementsHistory',
      'nutrition',
      'recentlyViewedVideoIds',
      'restTimerEndAt',
      'restTimerLabel',
      'restTimerTotalSeconds',
      'user',
      'weeklyPlan',
      'weightHistory',
      'workoutHistory',
    ]);
  });

  it('4. workoutHistory vem da geração ativa verificada, newest-first', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(3), makeSession(2), makeSession(1)] });
    const result = await exportOk(harness.runtime);
    expect(result.backup.payload.workoutHistory.map((session) => session.id))
      .toEqual(['session-3', 'session-2', 'session-1']);
    const verified = await harness.runtime.readVerifiedAdministrationGeneration(harness.generationId);
    expect(result.backup.payload.workoutHistory.map((session) => session.id))
      .toEqual(verified.sessions.map((session) => session.id));
  });

  it('5. historyStorage não aparece no payload nem no arquivo', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const result = await exportOk(harness.runtime);
    expect(Object.prototype.hasOwnProperty.call(result.backup.payload, 'historyStorage')).toBe(false);
    expect(result.content).not.toContain('historyStorage');
  });

  it('6. nenhum id físico de geração aparece no arquivo', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const result = await exportOk(harness.runtime);
    expect(harness.generationId.length).toBeGreaterThan(0);
    expect(result.content).not.toContain(harness.generationId);
    expect(result.content).not.toContain('generationId');
    expect(result.content).not.toContain('activeGeneration');
    expect(result.content).not.toContain('migrationGeneration');
    expect(result.content).not.toContain(KEY);
  });

  it('7. receipts, manifests, digests internos e fingerprints não aparecem no arquivo', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const result = await exportOk(harness.runtime);
    for (const forbidden of [
      'orderedDigest',
      'recordDigests',
      'generationManifests',
      'storageOperationReceipts',
      'completionReceipts',
      'legacySnapshots',
      'quarantine',
      'previousCoreRaw',
      'targetCoreRaw',
      'operationId',
      'receiptId',
      'fingerprint',
    ]) {
      expect(result.content).not.toContain(forbidden);
    }
  });

  it('8. a origem opcional das sessões é preservada', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const result = await exportOk(harness.runtime);
    expect(result.backup.payload.workoutHistory[0]).toMatchObject({
      sourceProgramId: 'program-1',
      sourceProgramDayId: 'day-1',
      sourceProgramName: 'Programa multi-dia',
      sourceProgramDayName: 'Dia 1 — Peito',
    });
  });

  it('9. histórico vazio é um backup válido', async () => {
    const harness = await createReadyHarness();
    const result = await exportOk(harness.runtime);
    expect(result.backup.payload.workoutHistory).toEqual([]);
    expect(result.preview.workoutSessions).toBe(0);
    expect((await inspectLogicalStorageBackupV2(result.content)).ok).toBe(true);
  });

  it('10. activeWorkout é preservado integralmente', async () => {
    const harness = await createReadyHarness();
    patchCore(harness.storage, RICH_CORE);
    const result = await exportOk(harness.runtime);
    expect(result.backup.payload.activeWorkout?.id).toBe('session-50');
    expect(result.backup.payload.activeWorkout?.exercises[0].sets[0].weight).toBe(60);
    expect(result.preview.hasActiveWorkout).toBe(true);
  });

  it('11. os timers são preservados', async () => {
    const harness = await createReadyHarness();
    patchCore(harness.storage, RICH_CORE);
    const result = await exportOk(harness.runtime);
    expect(result.backup.payload.activeWorkoutStartedAt).toBe(1_767_312_000_000);
    expect(result.backup.payload.restTimerEndAt).toBe(1_767_312_090_000);
    expect(result.backup.payload.restTimerTotalSeconds).toBe(90);
    expect(result.backup.payload.restTimerLabel).toBe('Descanso — Remada');
  });

  it('12. peso, medidas e nutrição são preservados', async () => {
    const harness = await createReadyHarness();
    patchCore(harness.storage, RICH_CORE);
    const result = await exportOk(harness.runtime);
    expect(result.backup.payload.weightHistory).toEqual(RICH_CORE.weightHistory);
    expect(result.backup.payload.measurementsHistory).toEqual(RICH_CORE.measurementsHistory);
    expect(result.backup.payload.nutrition).toEqual(RICH_CORE.nutrition);
    expect(result.preview.weightEntries).toBe(2);
    expect(result.preview.measurementEntries).toBe(1);
  });

  it('13. favoritos, vídeos recentes, perfil, plano e programas são preservados', async () => {
    const harness = await createReadyHarness();
    patchCore(harness.storage, RICH_CORE);
    const result = await exportOk(harness.runtime);
    expect(result.backup.payload.favoriteExercises).toEqual(['exercise-1', 'exercise-7']);
    expect(result.backup.payload.recentlyViewedVideoIds).toEqual(['video-3', 'video-9']);
    expect(result.backup.payload.user?.name).toBe('Rafael Façanha 🏋️');
    expect(result.backup.payload.weeklyPlan).toHaveLength(1);
    expect(result.backup.payload.customPrograms[0].id).toBe('program-custom-1');
    expect(result.preview.customPrograms).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Digest e determinismo
// ---------------------------------------------------------------------------

describe('backup lógico v2 — digest e determinismo', () => {
  it('14. mesmo estado e mesmo now geram conteúdo byte a byte idêntico', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(2), makeSession(1)] });
    patchCore(harness.storage, RICH_CORE);
    const now = new Date('2026-07-25T09:30:00.000Z');
    const first = await exportOk(harness.runtime, now);
    const second = await exportOk(harness.runtime, now);
    expect(second.content).toBe(first.content);
    expect(second.bytes).toBe(first.bytes);
    expect(second.filename).toBe(first.filename);
    expect(second.backup.payloadDigest).toBe(first.backup.payloadDigest);
  });

  it('15. exportedAt diferente mantém payloadDigest e muda filename e conteúdo', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const first = await exportOk(harness.runtime, new Date('2026-07-25T09:30:00.000Z'));
    const second = await exportOk(harness.runtime, new Date('2026-07-26T18:45:00.000Z'));
    expect(second.backup.payloadDigest).toBe(first.backup.payloadDigest);
    expect(second.filename).not.toBe(first.filename);
    expect(second.content).not.toBe(first.content);
  });

  it('16. qualquer mudança no payload muda o digest', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const before = await exportOk(harness.runtime);
    patchCore(harness.storage, { favoriteExercises: ['exercise-42'] });
    const after = await exportOk(harness.runtime);
    expect(after.backup.payloadDigest).not.toBe(before.backup.payloadDigest);
  });

  it('17. a ordem das chaves dos objetos de entrada não altera o digest', async () => {
    const base = logicalPayload({ favoriteExercises: ['a', 'b'] });
    const reordered = Object.fromEntries(
      Object.keys(base).reverse().map((key) => [key, (base as unknown as Record<string, unknown>)[key]]),
    ) as unknown as PersistedState;
    expect(Object.keys(reordered)).not.toEqual(Object.keys(base));
    expect(await computeLogicalPayloadDigest(reordered))
      .toBe(await computeLogicalPayloadDigest(base));
    expect(serializeLogicalPayloadCanonically(reordered))
      .toBe(serializeLogicalPayloadCanonically(base));
  });

  it('18. a ordem dos arrays altera o digest', async () => {
    const ascending = logicalPayload({ workoutHistory: [makeSession(1), makeSession(2)] });
    const descending = logicalPayload({ workoutHistory: [makeSession(2), makeSession(1)] });
    expect(await computeLogicalPayloadDigest(ascending))
      .not.toBe(await computeLogicalPayloadDigest(descending));
    expect(await computeLogicalPayloadDigest(logicalPayload({ favoriteExercises: ['a', 'b'] })))
      .not.toBe(await computeLogicalPayloadDigest(logicalPayload({ favoriteExercises: ['b', 'a'] })));
  });

  it('19. digest adulterado e payload adulterado são rejeitados na inspeção', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const result = await exportOk(harness.runtime);

    const tamperedDigest = JSON.parse(result.content) as Record<string, unknown>;
    tamperedDigest.payloadDigest = `sha256:${'0'.repeat(64)}`;
    expect(await inspectLogicalStorageBackupV2(JSON.stringify(tamperedDigest)))
      .toMatchObject({ ok: false, reason: 'digest-mismatch' });

    const tamperedPayload = JSON.parse(result.content) as { payload: PersistedState };
    tamperedPayload.payload.favoriteExercises = ['injetado'];
    expect(await inspectLogicalStorageBackupV2(JSON.stringify(tamperedPayload)))
      .toMatchObject({ ok: false, reason: 'digest-mismatch' });
  });

  it('20. sem Web Crypto a exportação e a inspeção falham explicitamente, sem hash fraco', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const valid = await exportOk(harness.runtime);

    const exported = await createLogicalStorageExportV2({ runtime: harness.runtime, subtleCrypto: null });
    expect(exported).toMatchObject({ ok: false, reason: 'crypto-unavailable' });
    if (exported.ok) throw new Error('exportação sem Web Crypto não pode ter sucesso');
    expect(exported.cause).toBeInstanceOf(Error);
    expect(Object.prototype.hasOwnProperty.call(exported, 'content')).toBe(false);

    expect(await inspectLogicalStorageBackupV2(valid.content, undefined, null))
      .toMatchObject({ ok: false, reason: 'crypto-unavailable' });
  });
});

// ---------------------------------------------------------------------------
// Tamanho
// ---------------------------------------------------------------------------

describe('backup lógico v2 — limites de tamanho', () => {
  it('21. bytes são os bytes UTF-8 exatos, não a contagem de caracteres', async () => {
    const harness = await createReadyHarness();
    patchCore(harness.storage, RICH_CORE);
    const result = await exportOk(harness.runtime);
    expect(result.content).toContain('Façanha');
    expect(result.bytes).toBe(utf8(result.content));
    expect(result.bytes).toBeGreaterThan(result.content.length);
  });

  it('22. o conteúdo é compacto, sem indentação de apresentação', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const result = await exportOk(harness.runtime);
    expect(result.content).not.toContain('\n');
    expect(result.content).not.toContain('  ');
    expect(result.content).toBe(JSON.stringify(JSON.parse(result.content)));
  });

  it('23. até 8 MiB não existe warning', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const result = await exportOk(harness.runtime);
    expect(result.bytes).toBeLessThanOrEqual(LOGICAL_BACKUP_LARGE_WARNING_BYTES);
    expect(result.warning).toBeNull();
    expect(result.preview.warning).toBeNull();
    expect(describeLogicalBackupSize(LOGICAL_BACKUP_LARGE_WARNING_BYTES)).toBeNull();
  });

  it('24. acima de 8 MiB o backup é gerado com aviso de arquivo grande', async () => {
    const harness = await createReadyHarness();
    inflateCore(harness.storage, 8 * 1024 * 1024 + 512 * 1024);
    const result = await exportOk(harness.runtime);
    expect(result.bytes).toBeGreaterThan(LOGICAL_BACKUP_LARGE_WARNING_BYTES);
    expect(result.bytes).toBeLessThanOrEqual(MAX_LOGICAL_BACKUP_BYTES);
    expect(result.warning).toContain('MiB');
    expect(result.preview.warning).toBe(result.warning);
  }, 120_000);

  it('25. acima de 25 MiB a exportação falha com too-large e sem conteúdo', async () => {
    const harness = await createReadyHarness();
    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    inflateCore(harness.storage, MAX_LOGICAL_BACKUP_BYTES + 4096);
    const result = await createLogicalStorageExportV2({ runtime: harness.runtime });
    expect(result).toMatchObject({ ok: false, reason: 'too-large' });
    expect(Object.prototype.hasOwnProperty.call(result, 'content')).toBe(false);
    const after = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    expect(JSON.stringify(after.stores)).toBe(JSON.stringify(before.stores));
  }, 180_000);

  it('26. declaredBytes menor que o real não reduz o tamanho medido', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const result = await exportOk(harness.runtime);
    const inspection = await inspectLogicalStorageBackupV2(result.content, 1);
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) return;
    expect(inspection.preview.bytes).toBe(utf8(result.content));

    const oversized = 'a'.repeat(MAX_LOGICAL_BACKUP_BYTES + 1);
    expect(await inspectLogicalStorageBackupV2(oversized, 1))
      .toMatchObject({ ok: false, reason: 'too-large' });
  }, 60_000);

  it('27. declaredBytes maior que o real é respeitado', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const result = await exportOk(harness.runtime);

    const large = await inspectLogicalStorageBackupV2(result.content, 9 * 1024 * 1024);
    expect(large.ok).toBe(true);
    if (!large.ok) return;
    expect(large.preview.bytes).toBe(9 * 1024 * 1024);
    expect(large.preview.warning).toContain('MiB');

    expect(await inspectLogicalStorageBackupV2(result.content, MAX_LOGICAL_BACKUP_BYTES + 1))
      .toMatchObject({ ok: false, reason: 'too-large' });
  });
});

// ---------------------------------------------------------------------------
// Inspeção read-only
// ---------------------------------------------------------------------------

describe('backup lógico v2 — inspeção read-only', () => {
  async function validBackupFile(): Promise<{ harness: Harness; content: string }> {
    const harness = await createReadyHarness({ sessions: [makeSession(2), makeSession(1)] });
    patchCore(harness.storage, RICH_CORE);
    const result = await exportOk(harness.runtime, new Date('2026-07-25T09:30:00.000Z'));
    return { harness, content: result.content };
  }

  async function tampered(
    content: string,
    mutate: (backup: Record<string, unknown>) => void,
  ): Promise<string> {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    mutate(parsed);
    return JSON.stringify(parsed);
  }

  it('28. um arquivo v2 válido é inspecionado e devolve preview completo', async () => {
    const { content } = await validBackupFile();
    const inspection = await inspectLogicalStorageBackupV2(content);
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) return;
    expect(inspection.backup.formatVersion).toBe(2);
    expect(inspection.preview).toMatchObject({
      exportedAt: '2026-07-25T09:30:00.000Z',
      workoutSessions: 2,
      hasActiveWorkout: true,
      customPrograms: 1,
      weightEntries: 2,
      measurementEntries: 1,
      warning: null,
    });
    expect(inspection.preview.bytes).toBe(utf8(content));
    expect(Number.isNaN(Date.parse(inspection.preview.sourceSavedAt))).toBe(false);
  });

  it('29. JSON inválido', async () => {
    expect(await inspectLogicalStorageBackupV2('{invalido'))
      .toMatchObject({ ok: false, reason: 'invalid-json' });
  });

  it('30. formato inválido, inclusive chave de protótipo perigosa', async () => {
    expect(await inspectLogicalStorageBackupV2(JSON.stringify({ format: 'outro' })))
      .toMatchObject({ ok: false, reason: 'invalid-format' });
    expect(await inspectLogicalStorageBackupV2('[]'))
      .toMatchObject({ ok: false, reason: 'invalid-format' });

    const { content } = await validBackupFile();
    const poisoned = await tampered(content, (backup) => {
      Object.assign(backup, JSON.parse('{"__proto__":{"polluted":true}}') as object);
    });
    const inspection = await inspectLogicalStorageBackupV2(
      poisoned.replace('"payload"', '"__proto__":{"polluted":true},"payload"'),
    );
    expect(inspection).toMatchObject({ ok: false, reason: 'invalid-format' });
    expect((({} as Record<string, unknown>).polluted)).toBeUndefined();
  });

  it('31. formatVersion inválida', async () => {
    const { content } = await validBackupFile();
    expect(await inspectLogicalStorageBackupV2(await tampered(content, (b) => { b.formatVersion = 3; })))
      .toMatchObject({ ok: false, reason: 'unsupported-version' });
    expect(await inspectLogicalStorageBackupV2(await tampered(content, (b) => {
      b.sourcePhysicalStorageVersion = 1;
    }))).toMatchObject({ ok: false, reason: 'unsupported-version' });
  });

  it('32. schema lógico inválido', async () => {
    const { content } = await validBackupFile();
    expect(await inspectLogicalStorageBackupV2(await tampered(content, (b) => {
      b.logicalSchemaVersion = 2;
    }))).toMatchObject({ ok: false, reason: 'unsupported-schema' });
  });

  it('33. datas inválidas', async () => {
    const { content } = await validBackupFile();
    expect(await inspectLogicalStorageBackupV2(await tampered(content, (b) => { b.exportedAt = 'ontem'; })))
      .toMatchObject({ ok: false, reason: 'invalid-date' });
    expect(await inspectLogicalStorageBackupV2(await tampered(content, (b) => { b.sourceSavedAt = 42; })))
      .toMatchObject({ ok: false, reason: 'invalid-date' });
  });

  it('34. payload incompleto — cada campo obrigatório ausente é recusado', async () => {
    const { content } = await validBackupFile();
    const fields = Object.keys((JSON.parse(content) as { payload: Record<string, unknown> }).payload);
    expect(fields).toHaveLength(16);
    for (const field of fields) {
      const broken = await tampered(content, (backup) => {
        delete (backup.payload as Record<string, unknown>)[field];
      });
      expect(await inspectLogicalStorageBackupV2(broken))
        .toMatchObject({ ok: false, reason: 'invalid-payload' });
    }
  });

  it('35. campos com tipo inválido são recusados', async () => {
    const { content } = await validBackupFile();
    const invalidByField: [string, unknown][] = [
      ['workoutHistory', {}],
      ['weeklyPlan', 'lista'],
      ['nutrition', null],
      ['user', 'Rafael'],
      ['activeWorkout', 7],
      ['restTimerLabel', 42],
      ['restTimerTotalSeconds', 'noventa'],
      ['activeWorkoutStartedAt', 'ontem'],
      ['favoriteExercises', [1, 2]],
      ['weightHistory', [{ date: '2026-07-01' }]],
      ['measurementsHistory', [{ date: '2026-07-01', chest: 104, waist: 84, hips: 98 }]],
    ];
    for (const [field, value] of invalidByField) {
      const broken = await tampered(content, (backup) => {
        (backup.payload as Record<string, unknown>)[field] = value;
      });
      expect(await inspectLogicalStorageBackupV2(broken))
        .toMatchObject({ ok: false, reason: 'invalid-payload' });
    }

    // `JSON.parse` transforma `1e999` em `Infinity` — o único jeito de um
    // arquivo JSON carregar um número não finito. O validador recusa.
    const zeroed = await tampered(content, (backup) => {
      (backup.payload as Record<string, unknown>).restTimerEndAt = 0;
    });
    const overflowed = zeroed.replace('"restTimerEndAt":0', '"restTimerEndAt":1e999');
    expect(overflowed).not.toBe(zeroed);
    expect((JSON.parse(overflowed) as { payload: PersistedState }).payload.restTimerEndAt)
      .toBe(Number.POSITIVE_INFINITY);
    expect(await inspectLogicalStorageBackupV2(overflowed))
      .toMatchObject({ ok: false, reason: 'invalid-payload' });
  });

  it('36. sessão do histórico sem id não vazio é recusada', async () => {
    const { content } = await validBackupFile();
    for (const id of ['', 7, null, undefined]) {
      const broken = await tampered(content, (backup) => {
        const payload = backup.payload as { workoutHistory: Record<string, unknown>[] };
        payload.workoutHistory[0].id = id;
      });
      expect(await inspectLogicalStorageBackupV2(broken))
        .toMatchObject({ ok: false, reason: 'invalid-payload' });
    }
  });

  it('37. sessionId duplicado tem motivo próprio', async () => {
    const { content } = await validBackupFile();
    const broken = await tampered(content, (backup) => {
      const payload = backup.payload as { workoutHistory: Record<string, unknown>[] };
      payload.workoutHistory[1].id = payload.workoutHistory[0].id;
    });
    expect(await inspectLogicalStorageBackupV2(broken))
      .toMatchObject({ ok: false, reason: 'duplicate-session-id' });
  });

  it('38. campo físico proibido na raiz do payload é recusado', async () => {
    const { content } = await validBackupFile();
    const forbidden = [
      'historyStorage',
      'generationId',
      'activeGeneration',
      'migrationGeneration',
      'generationManifests',
      'recordDigests',
      'storageOperationReceipts',
      'completionReceipts',
      'legacySnapshots',
      'quarantine',
      'previousCoreRaw',
      'targetCoreRaw',
    ];
    for (const field of forbidden) {
      const broken = await tampered(content, (backup) => {
        (backup.payload as Record<string, unknown>)[field] = 'vazamento';
      });
      const inspection = await inspectLogicalStorageBackupV2(broken);
      expect(inspection).toMatchObject({ ok: false, reason: 'invalid-payload' });
      if (inspection.ok) return;
      expect(inspection.error).toContain(field);
    }
  });

  it('39. inspecionar não altera storage nenhum e não carrega payload na mensagem', async () => {
    const { harness, content } = await validBackupFile();
    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    expect((await inspectLogicalStorageBackupV2(content)).ok).toBe(true);
    const broken = await tampered(content, (backup) => {
      (backup.payload as Record<string, unknown>).user = 'Rafael Façanha 🏋️';
    });
    const failure = await inspectLogicalStorageBackupV2(broken);
    expect(failure).toMatchObject({ ok: false, reason: 'invalid-payload' });
    if (!failure.ok) expect(failure.error).not.toContain('Façanha');
    expectUnchanged(before, await capturePhysicalState(harness.factory, harness.name, harness.storage));
  });
});

// ---------------------------------------------------------------------------
// Concorrência — fault injection real dentro da janela da exportação
// ---------------------------------------------------------------------------

describe('backup lógico v2 — corridas durante a exportação', () => {
  type Race = {
    name: string;
    reason: string;
    build: (harness: Harness) => LogicalBackupRuntime;
  };

  function coreChanged(harness: Harness): LogicalBackupRuntime {
    return runtimeOver(harness, afterCall(harness.adapter, 'readVerifiedHistoryGeneration', 1, async () => {
      patchCore(harness.storage, { favoriteExercises: ['escrito-por-outra-aba'] });
    }));
  }

  function coreChangedBeforeHistoryRead(harness: Harness): LogicalBackupRuntime {
    return runtimeOver(harness, beforeCall(harness.adapter, 'readVerifiedHistoryGeneration', 1, async () => {
      patchCore(harness.storage, { restTimerLabel: 'trocado antes da leitura do histórico' });
    }));
  }

  function activeGenerationChanged(harness: Harness): LogicalBackupRuntime {
    return runtimeOver(harness, afterCall(harness.adapter, 'readVerifiedHistoryGeneration', 1, async () => {
      await harness.adapter.replaceHistory([makeSession(7), makeSession(6)]);
    }));
  }

  function sessionChanged(harness: Harness): LogicalBackupRuntime {
    return runtimeOver(harness, afterCall(harness.adapter, 'readVerifiedHistoryGeneration', 1, async () => {
      const records = await readHistoryRecords(harness.factory, harness.name);
      const victim = records[0];
      await putHistoryRecord(harness.factory, harness.name, {
        ...victim,
        session: { ...victim.session, calories: victim.session.calories + 999 },
      });
    }));
  }

  function manifestChanged(harness: Harness): LogicalBackupRuntime {
    return runtimeOver(harness, afterCall(harness.adapter, 'readVerifiedHistoryGeneration', 1, async () => {
      const manifest = await readManifest(harness.factory, harness.name, harness.generationId);
      await putManifest(harness.factory, harness.name, { ...manifest, sessionCount: manifest.sessionCount + 5 });
    }));
  }

  function adminReceiptAppeared(harness: Harness): LogicalBackupRuntime {
    return runtimeOver(harness, afterCall(harness.adapter, 'readVerifiedHistoryGeneration', 1, async () => {
      await putRawOperationReceipt(
        harness.factory,
        harness.name,
        coherentReceiptRecord(harness) as unknown as Record<string, unknown>,
      );
    }));
  }

  function completionReceiptAppeared(harness: Harness): LogicalBackupRuntime {
    return runtimeOver(harness, afterCall(harness.adapter, 'readVerifiedHistoryGeneration', 1, async () => {
      const session = makeSession(91);
      const receipt = await createWorkoutCompletionReceipt({
        receiptId: `receipt-${session.id}`,
        generationId: harness.generationId,
        finalSession: session,
        coreEnvelopeAfter: JSON.parse(harness.storage.getItem(KEY) as string).data,
        effects: EMPTY_EFFECTS,
        createdAt: '2026-07-24T12:30:00.000Z',
      });
      await harness.adapter.appendSessionWithCompletionReceipt(session, receipt);
    }));
  }

  function migrationGenerationChanged(harness: Harness): LogicalBackupRuntime {
    return runtimeOver(harness, afterCall(harness.adapter, 'readVerifiedHistoryGeneration', 1, async () => {
      await putRawMetadata(harness.factory, harness.name, 'migrationGeneration', 'generation-fantasma');
    }));
  }

  function unstableAdministration(harness: Harness): LogicalBackupRuntime {
    let flips = 0;
    return runtimeOver(harness, onEveryCall(harness.adapter, 'readStorageAdministrationSnapshot', async () => {
      flips += 1;
      await putRawMetadata(harness.factory, harness.name, 'migratedAt', `2026-07-24T12:00:${String(flips % 60).padStart(2, '0')}.000Z`);
    }));
  }

  const CHANGED = 'snapshot-changed-during-export';

  const races: Race[] = [
    { name: 'o core muda depois da leitura verificada do histórico', reason: CHANGED, build: coreChanged },
    {
      name: 'o core muda antes da leitura verificada do histórico',
      reason: CHANGED,
      build: coreChangedBeforeHistoryRead,
    },
    { name: 'a geração ativa é trocada', reason: CHANGED, build: activeGenerationChanged },
    { name: 'uma sessão do histórico é adulterada', reason: CHANGED, build: sessionChanged },
    { name: 'o manifest da geração é adulterado', reason: CHANGED, build: manifestChanged },
    { name: 'um receipt administrativo aparece', reason: CHANGED, build: adminReceiptAppeared },
    { name: 'um CompletionReceipt aparece', reason: CHANGED, build: completionReceiptAppeared },
    {
      name: 'migrationGeneration passa a apontar para uma geração fantasma',
      reason: CHANGED,
      build: migrationGenerationChanged,
    },
    {
      name: 'o snapshot administrativo nunca estabiliza',
      reason: 'administration-conflicted',
      build: unstableAdministration,
    },
  ];

  it.each(races)('40-46. $name nunca produz backup e nunca escreve', async ({ build, reason }) => {
    const harness = await createReadyHarness({ sessions: [makeSession(2), makeSession(1)] });
    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    const racingRuntime = build(harness);

    const result = await createLogicalStorageExportV2({ runtime: racingRuntime });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(reason);

    // A mutação aconteceu de verdade — a corrida não passou pelo motivo errado.
    const after = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    const mutated = JSON.stringify(after.entries) !== JSON.stringify(before.entries)
      || JSON.stringify(after.stores) !== JSON.stringify(before.stores);
    expect(mutated).toBe(true);

    // Nenhuma escrita veio da exportação: nada de receipt administrativo novo.
    expect(await harness.adapter.listUnsettledStorageOperationReceipts())
      .toEqual(build === adminReceiptAppeared
        ? [expect.objectContaining({ operationId: 'operation-corrida' })]
        : []);
  });

  it('47. nenhuma corrida devolve sucesso, e o core nunca se mistura com outro histórico', async () => {
    for (const race of races) {
      const harness = await createReadyHarness({ sessions: [makeSession(2), makeSession(1)] });
      const result = await createLogicalStorageExportV2({ runtime: race.build(harness) });
      expect(result.ok, `a corrida "${race.name}" devolveu sucesso`).toBe(false);
    }
  }, 60_000);

  it('47b. a exportação saudável não cria receipt nem toca no armazenamento', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(2), makeSession(1)] });
    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    const result = await exportOk(harness.runtime);
    expect(result.ok).toBe(true);
    expectUnchanged(before, await capturePhysicalState(harness.factory, harness.name, harness.storage));
    expect(await harness.adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
    expect(await harness.adapter.readPendingCompletionReceipts()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Estados bloqueados
// ---------------------------------------------------------------------------

describe('backup lógico v2 — estados bloqueados', () => {
  async function legacyRuntime(): Promise<LogicalBackupRuntime> {
    const storage = new MemoryStorage();
    storage.setItem(KEY, v1Envelope(defaults([makeSession(1)])));
    const adapter = new IndexedDbWorkoutHistoryStorage({
      factory: new IDBFactory(),
      databaseName: `gymflow-logical-legacy-${databaseSequence += 1}`,
    });
    return createStorageAdminRuntime({ key: KEY, storage, adapter });
  }

  it('48. armazenamento legado v1 é bloqueado', async () => {
    const result = await createLogicalStorageExportV2({ runtime: await legacyRuntime() });
    expect(result).toMatchObject({ ok: false, reason: 'administration-unavailable' });
  });

  it('48b. armazenamento vazio, core corrompido e versão física divergente são bloqueados', async () => {
    for (const raw of [null, '{invalido', JSON.stringify({ v: 7, savedAt: '2026-07-24T12:00:00.000Z', data: {} })]) {
      const storage = new MemoryStorage();
      if (raw !== null) storage.setItem(KEY, raw);
      const adapter = new IndexedDbWorkoutHistoryStorage({
        factory: new IDBFactory(),
        databaseName: `gymflow-logical-blocked-${databaseSequence += 1}`,
      });
      const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter });
      expect(await createLogicalStorageExportV2({ runtime }))
        .toMatchObject({ ok: false, reason: 'administration-unavailable' });
    }
  });

  it('49. IndexedDB indisponível é bloqueado', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const runtime = runtimeOver(
      harness,
      breakMethod(harness.adapter, 'isAvailable', () => new Error('IndexedDB fora do ar')),
    );
    expect(await createLogicalStorageExportV2({ runtime }))
      .toMatchObject({ ok: false, reason: 'administration-unavailable' });
  });

  it('50. operação administrativa interrompida é bloqueada', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await putRawOperationReceipt(
      harness.factory,
      harness.name,
      coherentReceiptRecord(harness) as unknown as Record<string, unknown>,
    );
    const result = await createLogicalStorageExportV2({ runtime: harness.runtime });
    expect(result).toMatchObject({ ok: false, reason: 'administration-interrupted' });
    if (result.ok) return;
    expect(result.error).toContain('operation-corrida');
  });

  it('51. estado conflitado (duas operações em aberto) é bloqueado', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await putRawOperationReceipt(
      harness.factory,
      harness.name,
      coherentReceiptRecord(harness) as unknown as Record<string, unknown>,
    );
    await putRawOperationReceipt(
      harness.factory,
      harness.name,
      { ...coherentReceiptRecord(harness), operationId: 'operation-corrida-2' } as unknown as Record<string, unknown>,
    );
    expect(await createLogicalStorageExportV2({ runtime: harness.runtime }))
      .toMatchObject({ ok: false, reason: 'administration-conflicted' });
  });

  it('52. geração ativa corrompida é bloqueada', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(2), makeSession(1)] });
    const records = await readHistoryRecords(harness.factory, harness.name);
    await putHistoryRecord(harness.factory, harness.name, {
      ...records[0],
      session: { ...records[0].session, totalVolume: 999_999 },
    });
    expect(await createLogicalStorageExportV2({ runtime: harness.runtime }))
      .toMatchObject({ ok: false, reason: 'administration-conflicted' });
  });

  it('52b. metadata malformada, geração ativa ausente e conclusão pendente são bloqueadas', async () => {
    const malformed = await createReadyHarness({ sessions: [makeSession(1)] });
    await putRawMetadata(malformed.factory, malformed.name, 'activeGeneration', 42);
    expect(await createLogicalStorageExportV2({ runtime: malformed.runtime }))
      .toMatchObject({ ok: false, reason: 'administration-conflicted' });

    const absent = await createReadyHarness({ sessions: [makeSession(1)] });
    await putRawMetadata(absent.factory, absent.name, 'activeGeneration', null);
    expect(await createLogicalStorageExportV2({ runtime: absent.runtime }))
      .toMatchObject({ ok: false, reason: 'administration-unavailable' });

    const pending = await createReadyHarness({ sessions: [makeSession(1)] });
    const session = makeSession(92);
    const receipt = await createWorkoutCompletionReceipt({
      receiptId: `receipt-${session.id}`,
      generationId: pending.generationId,
      finalSession: session,
      coreEnvelopeAfter: JSON.parse(pending.storage.getItem(KEY) as string).data,
      effects: EMPTY_EFFECTS,
      createdAt: '2026-07-24T12:30:00.000Z',
    });
    await pending.adapter.appendSessionWithCompletionReceipt(session, receipt);
    expect(await createLogicalStorageExportV2({ runtime: pending.runtime }))
      .toMatchObject({ ok: false, reason: 'administration-conflicted' });
  });

  it('52c. nenhum estado bloqueado cai em recuperação bruta automática', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const rawBefore = harness.storage.getItem(KEY) as string;
    await putRawOperationReceipt(
      harness.factory,
      harness.name,
      coherentReceiptRecord(harness) as unknown as Record<string, unknown>,
    );
    const result = await createLogicalStorageExportV2({ runtime: harness.runtime });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Nada de conteúdo de consolação: a exportação bloqueada não devolve o raw.
    expect(JSON.stringify(result)).not.toContain(rawBefore);
    const snapshot = await captureLogicalBackupSnapshot(harness.runtime);
    expect(snapshot.status).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// Portabilidade e privacidade
// ---------------------------------------------------------------------------

describe('backup lógico v2 — portabilidade e privacidade', () => {
  it('o arquivo é analisável sem IndexedDB, sem localStorage e sem a chave do app', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(2), makeSession(1)] });
    patchCore(harness.storage, RICH_CORE);
    const result = await exportOk(harness.runtime);

    // A inspeção recebe apenas a string: nenhum adapter, nenhuma storage.
    const inspection = await inspectLogicalStorageBackupV2(result.content);
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) return;
    expect(inspection.backup.payload.workoutHistory).toHaveLength(2);
    expect(inspection.backup.payload.user?.name).toBe('Rafael Façanha 🏋️');
  });

  it('o payload carrega dados pessoais e histórico — e nenhum detalhe físico', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    patchCore(harness.storage, RICH_CORE);
    const result = await exportOk(harness.runtime);
    const validation = validateLogicalBackupPayload(result.backup.payload);
    expect(validation.status).toBe('valid');
    expect(result.content).toContain('rafael@example.com');
    expect(result.content).toContain('session-1');
    // O único `sha256:` do arquivo é o digest do envelope externo; o payload
    // lógico não carrega nenhum digest interno do armazenamento.
    expect(JSON.stringify(result.backup.payload)).not.toContain('sha256:');
    expect(result.content.match(/sha256:/g)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Regressão do protocolo legado v1
// ---------------------------------------------------------------------------

describe('backup lógico v2 — regressão do fluxo v1', () => {
  it('53. createStorageExport v1 continua idêntico', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, rawV1Fixture);
    const result = createStorageExport(KEY, storage, new Date('2026-07-16T14:05:00.000Z'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filename).toBe('gymflow-backup-2026-07-16-1405.json');
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    expect(parsed.format).toBe('gymflow-backup');
    expect(parsed.formatVersion).toBe(STORAGE_EXPORT_FORMAT_VERSION);
    expect(parsed.appStorageVersion).toBe(MONOLITHIC_STORAGE_VERSION);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'envelope')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'payload')).toBe(false);
    // O v1 continua indentado; o compacto é exclusividade do v2.
    expect(result.content).toContain('\n');
  });

  it('54. inspectStorageImport v1 continua idêntico', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, rawV1Fixture);
    const exported = createStorageExport(KEY, storage);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const inspection = inspectStorageImport(exported.content, exported.bytes);
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) return;
    expect(inspection.preview.hasActiveWorkout).toBe(true);
    expect(inspection.preview.bytes).toBe(exported.bytes);
  });

  it('55. commitStorageImport v1 continua importando e criando backup do anterior', () => {
    const source = new MemoryStorage();
    source.setItem(KEY, rawV1Fixture);
    const exported = createStorageExport(KEY, source);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const target = new MemoryStorage();
    const current = rawV1Fixture.replace('session_fixture_active_001', 'current_session');
    target.setItem(KEY, current);
    const inspection = inspectStorageImport(exported.content, exported.bytes);
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) return;
    expect(commitStorageImport(KEY, inspection.backup, target).ok).toBe(true);
    expect(target.getItem(`${KEY}${STORAGE_BACKUP_SUFFIX}`)).toBe(current);
    const loaded = loadStateResult<PersistedState>(KEY, target);
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') expect(loaded.value.activeWorkout?.id).toBe('session_fixture_active_001');
  });

  it('56. o inspetor v1 continua recusando um backup lógico v2 real', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const v2 = await exportOk(harness.runtime);
    expect(inspectStorageImport(v2.content, v2.bytes))
      .toMatchObject({ ok: false, reason: 'unsupported-version' });
  });

  it('57. o inspetor v2 recusa um backup v1 real', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, rawV1Fixture);
    const v1 = createStorageExport(KEY, storage);
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;
    return expect(inspectLogicalStorageBackupV2(v1.content, v1.bytes))
      .resolves.toMatchObject({ ok: false, reason: 'unsupported-version' });
  });

  it('58. MAX_IMPORT_BYTES do v1 continua em 5 MiB e é independente dos limites v2', () => {
    expect(MAX_IMPORT_BYTES).toBe(5 * 1024 * 1024);
    expect(LOGICAL_BACKUP_LARGE_WARNING_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_LOGICAL_BACKUP_BYTES).toBe(25 * 1024 * 1024);
    expect(STORAGE_EXPORT_FORMAT_VERSION).toBe(1);
    expect(LOGICAL_BACKUP_FORMAT_VERSION).toBe(2);
  });

  it('59. o módulo v2 não expõe nenhuma API de escrita, importação ou download', () => {
    const exported = Object.keys(logicalBackupModule).sort();
    expect(exported).not.toContain('commitLogicalStorageImportV2');
    expect(exported).not.toContain('commitStorageImportV2');
    for (const name of exported) {
      expect(
        /^(commit|save|write|persist|restore|apply|rollback|reset|download|clear|delete|remove)/i.test(name),
        `o módulo exporta ${name}, que parece uma API de escrita`,
      ).toBe(false);
    }
    // Comentários fora: o módulo NOMEIA as escritas que se recusa a fazer, e
    // essa documentação não pode ser confundida com uma chamada real.
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/storage-logical-backup.ts'),
      'utf8',
    )
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    for (const forbidden of [
      'setItem',
      'removeItem',
      'beginStorageOperation',
      'transitionStorageOperation',
      'revertStorageOperationSafely',
      'rollbackToHistoryGeneration',
      'replaceHistory',
      'appendSession',
      'writeMetadata',
      'activateHistoryGeneration',
      'createObjectURL',
      'createElement',
      'new Blob',
    ]) {
      expect(source, `o módulo v2 menciona ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('60. nenhum call site real importa o módulo v2', () => {
    const roots = ['src'];
    const found: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(target);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (entry.name === 'storage-logical-backup.ts') continue;
        if (fs.readFileSync(target, 'utf8').includes('storage-logical-backup')) {
          found.push(path.relative(process.cwd(), target).replace(/\\/g, '/'));
        }
      }
    };
    for (const root of roots) walk(path.join(process.cwd(), root));
    // O 002D-C1 acrescentou UM consumidor de biblioteca: o importador lógico
    // chama `inspectLogicalStorageBackupV2` internamente, de propósito — é o
    // que impede um TOCTOU entre validar o arquivo e gravá-lo. O 002E-E3
    // acrescentou o GymFlowContext como call site real de exportação v2:
    // `createLogicalStorageExportV2` é chamado por `exportLogicalBackupV2`.
    // A igualdade exata segue valendo, e é ela que prova esse limite.
    expect(found).toEqual([
      'src/components/ui/StorageBackupVerifier.guard.test.ts',
      'src/components/ui/StorageBackupVerifier.test.tsx',
      'src/components/ui/StorageBackupVerifier.tsx',
      'src/lib/storage-logical-backup.test.ts',
      'src/lib/storage-logical-import.test.ts',
      'src/lib/storage-logical-import.ts',
      'src/lib/storage-logical-reset.ts',
      'src/lib/storage-logical-restore-resolve.test.ts',
      'src/lib/storage-logical-restore.test.ts',
      'src/providers/GymFlowContext.logical-import.real.test.tsx',
      'src/providers/GymFlowContext.logical-restore.real.test.tsx',
      'src/providers/GymFlowContext.tsx',
      'src/providers/probe-real-roundtrip.test.ts',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Invariância física (PARTE 14)
// ---------------------------------------------------------------------------

describe('backup lógico v2 — invariância física', () => {
  it('exportar e inspecionar deixam core, metadata, histórico, manifests e receipts idênticos', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(3), makeSession(2), makeSession(1)] });
    patchCore(harness.storage, RICH_CORE);
    await putRawMetadata(harness.factory, harness.name, 'migratedAt', '2026-07-24T12:00:00.000Z');

    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    const exported = await exportOk(harness.runtime);
    expect((await inspectLogicalStorageBackupV2(exported.content)).ok).toBe(true);
    await createLogicalStorageExportV2({ runtime: harness.runtime, subtleCrypto: null });
    await inspectLogicalStorageBackupV2('{invalido');
    await captureLogicalBackupSnapshot(harness.runtime);

    expectUnchanged(before, await capturePhysicalState(harness.factory, harness.name, harness.storage));
  });

  it('a captura devolve uma cópia lógica independente do core observado', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const captured = await captureLogicalBackupSnapshot(harness.runtime);
    expect(captured.status).toBe('ok');
    if (captured.status !== 'ok') return;
    const rawBefore = harness.storage.getItem(KEY);
    captured.snapshot.state.favoriteExercises.push('mutação-do-chamador');
    captured.snapshot.state.workoutHistory.length = 0;
    expect(harness.storage.getItem(KEY)).toBe(rawBefore);
    const again = await captureLogicalBackupSnapshot(harness.runtime);
    if (again.status !== 'ok') throw new Error('a segunda captura deveria continuar válida');
    expect(again.snapshot.state.favoriteExercises).toEqual([]);
    expect(again.snapshot.state.workoutHistory).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Serialização canônica — casos que não passam pelo armazenamento
// ---------------------------------------------------------------------------

describe('backup lógico v2 — serialização canônica', () => {
  it('recusa números não finitos em vez de convertê-los silenciosamente', () => {
    expect(() => serializeLogicalPayloadCanonically(
      logicalPayload({ restTimerEndAt: Number.POSITIVE_INFINITY }),
    )).toThrow(/não finito/);
    expect(() => serializeLogicalPayloadCanonically(
      logicalPayload({ nutrition: { calories: Number.NaN, protein: 0, carbs: 0, fat: 0, water: 0 } }),
    )).toThrow(/não finito/);
  });

  it('ordena chaves recursivamente e preserva a ordem dos arrays', () => {
    const canonical = serializeLogicalPayloadCanonically(logicalPayload({
      workoutHistory: [makeSession(2), makeSession(1)],
    }));
    expect(canonical.indexOf('"achievements"')).toBeLessThan(canonical.indexOf('"weeklyPlan"'));
    expect(canonical.indexOf('"session-2"')).toBeLessThan(canonical.indexOf('"session-1"'));
    expect(canonical).toBe(serializeLogicalPayloadCanonically(JSON.parse(canonical) as PersistedState));
  });

  it('a mensagem de erro carrega o caminho, nunca o valor', () => {
    try {
      serializeLogicalPayloadCanonically(logicalPayload({
        weightHistory: [{ date: '2026-07-01', value: Number.NaN }],
      }));
      throw new Error('deveria ter falhado');
    } catch (error) {
      expect((error as Error).message).toContain('payload.weightHistory[0].value');
      expect((error as Error).message).not.toContain('2026-07-01');
    }
  });
});

// ---------------------------------------------------------------------------
// CORRIDA ABA — H1 → H2 → H1 (corretivo 046, PARTE 10)
// ---------------------------------------------------------------------------
//
// A auditoria provou que comparar apenas os dois diagnósticos que cercam a
// leitura verificada não fecha nada: se o armazenamento sai de H1, passa por H2
// e VOLTA byte a byte para H1, os dois diagnósticos são idênticos — mesmo
// fingerprint, mesmo core, mesma geração — e mesmo assim a leitura do meio
// carregou H2. Cada cenário abaixo é fault injection física real: o IndexedDB é
// reescrito de verdade, com manifest e digests coerentes, e depois devolvido ao
// estado exato de antes.

interface AbaScenario {
  name: string;
  sessions: WorkoutSession[];
  // Falso quando a mutação não muda o PAYLOAD lógico (o manifest é físico): o
  // arquivo seria o mesmo, mas a geração verificada descrita pelos diagnósticos
  // não é a mesma que a leitura intermediária descreveu.
  logicalContentChanges: boolean;
  apply: (harness: Harness) => Promise<void>;
  proveMutation?: (harness: Harness, digestsBefore: (string | null)[]) => Promise<void>;
}

async function recordDigestsOf(harness: Harness): Promise<(string | null)[]> {
  return (await readHistoryRecords(harness.factory, harness.name))
    .filter((record) => record.generationId === harness.generationId)
    .sort((left, right) => left.order - right.order)
    .map((record) => record.digest ?? null);
}

const H1_SESSIONS = [makeSession(2), makeSession(1)];

const ABA_SCENARIOS: AbaScenario[] = [
  {
    name: '1. ids de sessão diferentes',
    sessions: H1_SESSIONS,
    logicalContentChanges: true,
    apply: (harness) => writeGenerationSessions(harness, [makeSession(12), makeSession(11)]),
  },
  {
    name: '2. mesmos ids, valores diferentes',
    sessions: H1_SESSIONS,
    logicalContentChanges: true,
    apply: (harness) => writeGenerationSessions(harness, [
      makeSession(2, { calories: 999 }),
      makeSession(1, { calories: 888 }),
    ]),
  },
  {
    name: '3. mesma contagem e mesmos ids, ordem diferente',
    sessions: H1_SESSIONS,
    logicalContentChanges: true,
    apply: (harness) => writeGenerationSessions(harness, [makeSession(1), makeSession(2)]),
  },
  {
    name: '4. manifest M1 → M2 → M1',
    sessions: H1_SESSIONS,
    logicalContentChanges: false,
    apply: (harness) => writeGenerationSessions(harness, H1_SESSIONS, {
      updatedAt: '2027-01-01T00:00:00.000Z',
    }),
  },
  {
    name: '5. recordDigest D1 → D2 → D1',
    sessions: H1_SESSIONS,
    logicalContentChanges: true,
    apply: (harness) => writeGenerationSessions(harness, [
      makeSession(2, { totalVolume: 77_777 }),
      makeSession(1),
    ]),
    proveMutation: async (harness, digestsBefore) => {
      const digestsDuring = await recordDigestsOf(harness);
      expect(digestsDuring[0]).not.toBe(digestsBefore[0]);
      expect(digestsDuring[0]).not.toBeNull();
    },
  },
  {
    name: '6. geração vazia → uma sessão → vazia',
    sessions: [],
    logicalContentChanges: true,
    apply: (harness) => writeGenerationSessions(harness, [makeSession(5)]),
  },
  {
    name: '7. geração com sessão → vazia → sessão original',
    sessions: [makeSession(1)],
    logicalContentChanges: true,
    apply: (harness) => writeGenerationSessions(harness, []),
  },
  {
    name: '8. conteúdo alterado com orderedDigest válido',
    sessions: H1_SESSIONS,
    logicalContentChanges: true,
    apply: (harness) => {
      const original = makeSession(2);
      const exercise = original.exercises[0];
      return writeGenerationSessions(harness, [
        { ...original, exercises: [{ ...exercise, sets: [{ ...exercise.sets[0], weight: 137.5 }] }] },
        makeSession(1),
      ]);
    },
  },
  {
    name: '9. createdAt e updatedAt do manifest alterados',
    sessions: H1_SESSIONS,
    logicalContentChanges: false,
    apply: (harness) => writeGenerationSessions(harness, H1_SESSIONS, {
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-06-30T23:59:59.999Z',
    }),
  },
];

// Protocolo PRÉ-corretivo, reproduzido fielmente: só as comparações entre os
// diagnósticos A e B, SEM amarrar a leitura intermediária às gerações que eles
// verificaram. Existe para provar que era exatamente essa comparação que
// faltava — sem precisar mutilar o módulo de produção nem deixar `skip` no
// commit.
type LegacyCapture =
  | { status: 'ok'; state: PersistedState }
  | { status: 'failed'; reason: string };

async function legacyCaptureWithoutGenerationBinding(
  runtime: LogicalBackupRuntime,
): Promise<LegacyCapture> {
  const first = await runtime.inspectStorageAdministration();
  if (first.state.status !== 'ready') return { status: 'failed', reason: first.state.status };
  const activeGenerationId = first.activeGenerationId;
  const coreRawObserved = first.coreRawObserved;
  if (!activeGenerationId || coreRawObserved === null || first.administrationFingerprint === null) {
    return { status: 'failed', reason: 'invalid-core' };
  }
  if (first.pendingCompletionReceiptCount !== 0 || first.unsettledOperations.length !== 0) {
    return { status: 'failed', reason: 'administration-conflicted' };
  }
  const parsed = parsePhysicalEnvelope(coreRawObserved);
  if (parsed.status !== 'v2') return { status: 'failed', reason: 'invalid-core' };

  const verified = await runtime.readVerifiedAdministrationGeneration(activeGenerationId);

  const second = await runtime.inspectStorageAdministration();
  if (second.state.status !== 'ready') {
    return { status: 'failed', reason: 'snapshot-changed-during-export' };
  }
  const changed = second.coreRawObserved !== coreRawObserved
    || second.activeGenerationId !== activeGenerationId
    || second.administrationFingerprint !== first.administrationFingerprint
    || second.physicalStorageVersion !== first.physicalStorageVersion
    || second.unsettledOperations.length !== 0
    || second.pendingCompletionReceiptCount !== 0;
  if (changed) return { status: 'failed', reason: 'snapshot-changed-during-export' };

  return {
    status: 'ok',
    state: combineCoreWithHistory(parsed.envelope.data, [...verified.sessions]),
  };
}

// Monta a corrida ABA de um cenário sobre um harness já restaurado em H1.
function abaRuntime(scenario: AbaScenario, harness: Harness, h1: PhysicalState): LogicalBackupRuntime {
  return runtimeOver(harness, aroundCall(
    harness.adapter,
    'readVerifiedHistoryGeneration',
    1,
    () => scenario.apply(harness),
    () => restoreStores(harness.factory, harness.name, h1.stores),
  ));
}

describe('backup lógico v2 — corrida ABA (H1 → H2 → H1)', () => {
  it.each(ABA_SCENARIOS)('$name é recusada com snapshot-changed-during-export', async (scenario) => {
    const harness = await createReadyHarness({ sessions: scenario.sessions });
    const h1 = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    const digestsBefore = await recordDigestsOf(harness);

    // H1 é individualmente válido.
    const exportedH1 = await exportOk(harness.runtime);
    const h1History = serializeWorkoutHistoryDeterministically(exportedH1.backup.payload.workoutHistory);

    // H2 também é — e é mesmo um estado físico diferente.
    await scenario.apply(harness);
    const h2 = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    expect(JSON.stringify(h2.stores)).not.toBe(JSON.stringify(h1.stores));
    if (scenario.proveMutation) await scenario.proveMutation(harness, digestsBefore);
    const exportedH2 = await exportOk(harness.runtime);
    const h2History = serializeWorkoutHistoryDeterministically(exportedH2.backup.payload.workoutHistory);
    if (scenario.logicalContentChanges) {
      expect(exportedH2.backup.payloadDigest).not.toBe(exportedH1.backup.payloadDigest);
      expect(h2History).not.toBe(h1History);
    } else {
      expect(exportedH2.backup.payloadDigest).toBe(exportedH1.backup.payloadDigest);
    }

    // Volta byte a byte para H1.
    await restoreStores(harness.factory, harness.name, h1.stores);
    expectUnchanged(h1, await capturePhysicalState(harness.factory, harness.name, harness.storage));

    const log: CaptureLog = { snapshots: [], readings: [] };
    const racing = recordingRuntime(abaRuntime(scenario, harness, h1), log);
    const result = await createLogicalStorageExportV2({ runtime: racing });

    expect(result).toMatchObject({ ok: false, reason: 'snapshot-changed-during-export' });
    expect(Object.prototype.hasOwnProperty.call(result, 'content')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, 'backup')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, 'preview')).toBe(false);

    // A e B observaram H1, com fingerprints iguais...
    expect(log.snapshots).toHaveLength(2);
    const [a, b] = log.snapshots;
    expect(a.state.status).toBe('ready');
    expect(b.state.status).toBe('ready');
    expect(a.administrationFingerprint).toBe(b.administrationFingerprint);
    expect(a.coreRawObserved).toBe(b.coreRawObserved);
    expect(a.activeGenerationId).toBe(b.activeGenerationId);
    const observedA = verifiedGenerationOf(a);
    const observedB = verifiedGenerationOf(b);
    expect(serializeWorkoutHistoryDeterministically(observedA.sessions)).toBe(h1History);
    expect(serializeWorkoutHistoryDeterministically(observedB.sessions)).toBe(h1History);
    expect(JSON.stringify(observedB.manifest)).toBe(JSON.stringify(observedA.manifest));

    // ...enquanto a leitura intermediária devolveu H2.
    expect(log.readings).toHaveLength(1);
    const reading = log.readings[0];
    const readingHistory = serializeWorkoutHistoryDeterministically(reading.sessions);
    const readingDiffers = readingHistory !== h1History
      || JSON.stringify(reading.manifest) !== JSON.stringify(observedA.manifest);
    expect(readingDiffers).toBe(true);
    if (scenario.logicalContentChanges) expect(readingHistory).toBe(h2History);

    // Nenhuma escrita e nenhuma mutação adicional vieram da exportação.
    expectUnchanged(h1, await capturePhysicalState(harness.factory, harness.name, harness.storage));
    expect(await harness.adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
    expect(await harness.adapter.readPendingCompletionReceipts()).toEqual([]);
  }, 60_000);

  it('sem o vínculo da leitura intermediária, todas as corridas ABA passariam', async () => {
    for (const scenario of ABA_SCENARIOS) {
      const harness = await createReadyHarness({ sessions: scenario.sessions });
      const h1 = await capturePhysicalState(harness.factory, harness.name, harness.storage);
      const exportedH1 = await exportOk(harness.runtime);
      const h1History = serializeWorkoutHistoryDeterministically(exportedH1.backup.payload.workoutHistory);

      await scenario.apply(harness);
      const exportedH2 = await exportOk(harness.runtime);
      const h2History = serializeWorkoutHistoryDeterministically(exportedH2.backup.payload.workoutHistory);
      await restoreStores(harness.factory, harness.name, h1.stores);

      // Protocolo antigo: aprova, e nos cenários de conteúdo entrega justamente
      // o H2 que já não existe mais.
      const legacy = await legacyCaptureWithoutGenerationBinding(abaRuntime(scenario, harness, h1));
      expect(legacy.status, `o protocolo antigo recusou "${scenario.name}"`).toBe('ok');
      if (legacy.status === 'ok' && scenario.logicalContentChanges) {
        const captured = serializeWorkoutHistoryDeterministically(legacy.state.workoutHistory);
        expect(captured).toBe(h2History);
        expect(captured).not.toBe(h1History);
      }

      // Protocolo corrigido: recusa a mesma corrida.
      await restoreStores(harness.factory, harness.name, h1.stores);
      const corrected = await captureLogicalBackupSnapshot(abaRuntime(scenario, harness, h1));
      expect(corrected.status, `o protocolo corrigido aprovou "${scenario.name}"`).toBe('failed');
      if (corrected.status === 'failed') {
        expect(corrected.reason).toBe('snapshot-changed-during-export');
      }
    }
  }, 120_000);

  it('a captura exige geração verificada íntegra nos dois diagnósticos', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const blind: LogicalBackupRuntime = {
      async inspectStorageAdministration() {
        const snapshot = await harness.runtime.inspectStorageAdministration();
        return { ...snapshot, activeGenerationIntegrity: null };
      },
      readVerifiedAdministrationGeneration: (id) => (
        harness.runtime.readVerifiedAdministrationGeneration(id)
      ),
    };
    expect(await createLogicalStorageExportV2({ runtime: blind }))
      .toMatchObject({ ok: false, reason: 'invalid-core' });
  });

  it('a geração verificada precisa ser a geração ativa declarada', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const mismatched: LogicalBackupRuntime = {
      async inspectStorageAdministration() {
        const snapshot = await harness.runtime.inspectStorageAdministration();
        const integrity = snapshot.activeGenerationIntegrity;
        if (integrity === null || integrity.status !== 'verified') return snapshot;
        return {
          ...snapshot,
          activeGenerationIntegrity: {
            ...integrity,
            manifest: { ...integrity.manifest, generationId: 'generation-fantasma' },
          },
        };
      },
      readVerifiedAdministrationGeneration: (id) => (
        harness.runtime.readVerifiedAdministrationGeneration(id)
      ),
    };
    expect(await createLogicalStorageExportV2({ runtime: mismatched }))
      .toMatchObject({ ok: false, reason: 'invalid-core' });
  });
});

// ---------------------------------------------------------------------------
// CONTRATO FECHADO — envelope externo e raiz do payload (PARTES 2, 3 e 11)
// ---------------------------------------------------------------------------

function validEnvelopeObject(): Record<string, unknown> {
  return {
    format: 'gymflow-backup',
    formatVersion: LOGICAL_BACKUP_FORMAT_VERSION,
    logicalSchemaVersion: LOGICAL_BACKUP_SCHEMA_VERSION,
    exportedAt: '2026-07-25T09:30:00.000Z',
    sourcePhysicalStorageVersion: HYBRID_STORAGE_VERSION,
    sourceSavedAt: '2026-07-24T12:00:00.000Z',
    payloadDigest: `sha256:${'0'.repeat(64)}`,
    payload: defaults(),
  };
}

function rawPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...(defaults() as unknown as Record<string, unknown>), ...overrides };
}

const UNKNOWN_EXTERNAL_KEY = 'campoExternoInventadoPeloArquivo';

describe('backup lógico v2 — contrato externo fechado', () => {
  it('o envelope válido tem exatamente as oito chaves do contrato', () => {
    expect(LOGICAL_BACKUP_ENVELOPE_FIELDS).toHaveLength(8);
    expect(Object.keys(validEnvelopeObject()).sort()).toEqual([...LOGICAL_BACKUP_ENVELOPE_FIELDS].sort());
    expect(validateLogicalBackupEnvelopeContract(validEnvelopeObject())).toEqual({ status: 'valid' });
  });

  it('campo externo extra é recusado sem citar o nome do campo', async () => {
    const envelope = validEnvelopeObject();
    envelope[UNKNOWN_EXTERNAL_KEY] = 'vazamento';
    expect(validateLogicalBackupEnvelopeContract(envelope))
      .toMatchObject({ status: 'invalid', violation: 'unknown-field' });

    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const exported = await exportOk(harness.runtime);
    const parsed = JSON.parse(exported.content) as Record<string, unknown>;
    parsed[UNKNOWN_EXTERNAL_KEY] = 'vazamento';
    const inspection = await inspectLogicalStorageBackupV2(JSON.stringify(parsed));
    expect(inspection).toMatchObject({ ok: false, reason: 'invalid-format' });
    if (!inspection.ok) expect(inspection.error).not.toContain(UNKNOWN_EXTERNAL_KEY);
  });

  it('campo externo obrigatório ausente é recusado', async () => {
    for (const field of LOGICAL_BACKUP_ENVELOPE_FIELDS) {
      const envelope = validEnvelopeObject();
      delete envelope[field];
      expect(validateLogicalBackupEnvelopeContract(envelope))
        .toEqual({ status: 'invalid', violation: 'missing-field', field });
    }

    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const exported = await exportOk(harness.runtime);
    for (const field of LOGICAL_BACKUP_ENVELOPE_FIELDS) {
      const parsed = JSON.parse(exported.content) as Record<string, unknown>;
      delete parsed[field];
      const inspection = await inspectLogicalStorageBackupV2(JSON.stringify(parsed));
      expect(inspection.ok).toBe(false);
      if (!inspection.ok) {
        expect(['invalid-format', 'unsupported-version']).toContain(inspection.reason);
      }
    }
  });

  it('símbolo externo é recusado', () => {
    const envelope = validEnvelopeObject();
    (envelope as Record<symbol, unknown>)[Symbol('externo')] = 'vazamento';
    expect(validateLogicalBackupEnvelopeContract(envelope))
      .toMatchObject({ status: 'invalid', violation: 'symbol-key' });
  });

  it('propriedade externa não enumerável é recusada', () => {
    const envelope = validEnvelopeObject();
    Object.defineProperty(envelope, 'payloadDigest', {
      value: `sha256:${'0'.repeat(64)}`,
      enumerable: false,
      writable: true,
      configurable: true,
    });
    expect(validateLogicalBackupEnvelopeContract(envelope))
      .toMatchObject({ status: 'invalid', violation: 'non-enumerable-field', field: 'payloadDigest' });
  });

  it('getter e setter externos são recusados sem serem executados', () => {
    let reads = 0;
    const withGetter = validEnvelopeObject();
    Object.defineProperty(withGetter, 'payload', {
      get() { reads += 1; return defaults(); },
      enumerable: true,
      configurable: true,
    });
    expect(validateLogicalBackupEnvelopeContract(withGetter))
      .toMatchObject({ status: 'invalid', violation: 'accessor-field', field: 'payload' });
    expect(reads).toBe(0);

    const withSetter = validEnvelopeObject();
    Object.defineProperty(withSetter, 'sourceSavedAt', {
      set() { /* nunca chamado */ },
      enumerable: true,
      configurable: true,
    });
    expect(validateLogicalBackupEnvelopeContract(withSetter))
      .toMatchObject({ status: 'invalid', violation: 'accessor-field', field: 'sourceSavedAt' });
  });

  it('prototype externo customizado e valores não-objeto são recusados', () => {
    const custom = Object.assign(Object.create({ herdado: true }) as object, validEnvelopeObject());
    expect(validateLogicalBackupEnvelopeContract(custom))
      .toMatchObject({ status: 'invalid', violation: 'custom-prototype' });

    const nullPrototype = Object.assign(Object.create(null) as object, validEnvelopeObject());
    expect(validateLogicalBackupEnvelopeContract(nullPrototype))
      .toMatchObject({ status: 'invalid', violation: 'custom-prototype' });

    for (const value of [null, 42, 'texto', [], new Date()]) {
      expect(validateLogicalBackupEnvelopeContract(value).status).toBe('invalid');
    }
  });

  it('chave perigosa externa é recusada', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const envelope = validEnvelopeObject();
      Object.defineProperty(envelope, key, {
        value: { polluted: true },
        enumerable: true,
        writable: true,
        configurable: true,
      });
      expect(validateLogicalBackupEnvelopeContract(envelope))
        .toMatchObject({ status: 'invalid', violation: 'dangerous-key' });
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('backup lógico v2 — raiz do payload fechada', () => {
  it('exatamente os 16 campos lógicos são aceitos', () => {
    const validation = validateLogicalBackupPayload(rawPayload());
    expect(validation.status).toBe('valid');
    if (validation.status === 'valid') expect(Object.keys(validation.payload)).toHaveLength(16);
  });

  it('campo raiz desconhecido é recusado sem citar o nome', async () => {
    const unknownField = 'campoDeRaizInventado';
    const validation = validateLogicalBackupPayload(rawPayload({ [unknownField]: 'vazamento' }));
    expect(validation).toMatchObject({ status: 'invalid', reason: 'invalid-payload' });
    if (validation.status === 'invalid') expect(validation.detail).not.toContain(unknownField);

    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const exported = await exportOk(harness.runtime);
    const parsed = JSON.parse(exported.content) as { payload: Record<string, unknown> };
    parsed.payload[unknownField] = 'vazamento';
    const inspection = await inspectLogicalStorageBackupV2(JSON.stringify(parsed));
    expect(inspection).toMatchObject({ ok: false, reason: 'invalid-payload' });
    if (!inspection.ok) expect(inspection.error).not.toContain(unknownField);
  });

  it('campo físico na raiz continua sendo nomeado, porque o nome é constante', () => {
    for (const field of ['historyStorage', 'generationId', 'recordDigests', 'previousCoreRaw']) {
      const validation = validateLogicalBackupPayload(rawPayload({ [field]: 'vazamento' }));
      expect(validation).toMatchObject({ status: 'invalid', reason: 'invalid-payload' });
      if (validation.status === 'invalid') expect(validation.detail).toContain(field);
    }
  });

  it('campo obrigatório ausente é recusado nome a nome', () => {
    for (const field of Object.keys(defaults())) {
      const payload = rawPayload();
      delete payload[field];
      const validation = validateLogicalBackupPayload(payload);
      expect(validation).toMatchObject({ status: 'invalid', reason: 'invalid-payload' });
      if (validation.status === 'invalid') expect(validation.detail).toContain(field);
    }
  });

  it('propriedade simbólica e não enumerável na raiz do payload são recusadas', () => {
    const withSymbol = rawPayload();
    (withSymbol as Record<symbol, unknown>)[Symbol('raiz')] = 1;
    expect(validateLogicalBackupPayload(withSymbol).status).toBe('invalid');

    const withHidden = rawPayload();
    Object.defineProperty(withHidden, 'nutrition', {
      value: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
      enumerable: false,
      writable: true,
      configurable: true,
    });
    expect(validateLogicalBackupPayload(withHidden).status).toBe('invalid');
  });

  it('strings funcionais com nomes físicos continuam preservadas', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    patchCore(harness.storage, {
      restTimerLabel: 'Descanso — anotei generationId no caderno',
      user: { ...PROFILE, preference: 'manifest de treino pesado' },
      customPrograms: [{
        ...RICH_CORE.customPrograms[0],
        description: 'recibo (receipt) do historyStorage antigo',
      }],
    });
    const result = await exportOk(harness.runtime);
    expect(result.backup.payload.restTimerLabel).toBe('Descanso — anotei generationId no caderno');
    expect(result.backup.payload.user?.preference).toBe('manifest de treino pesado');
    expect(result.backup.payload.customPrograms[0].description)
      .toBe('recibo (receipt) do historyStorage antigo');

    const inspection = await inspectLogicalStorageBackupV2(result.content);
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) return;
    expect(inspection.backup.payload.restTimerLabel).toBe('Descanso — anotei generationId no caderno');
  });
});

// ---------------------------------------------------------------------------
// ÁRVORE JSON ESTRITA — nada de normalização silenciosa (PARTES 4 e 12)
// ---------------------------------------------------------------------------

const NON_JSON_VALUES: { name: string; make: () => unknown }[] = [
  { name: 'undefined', make: () => undefined },
  { name: 'function', make: () => () => 'x' },
  { name: 'symbol', make: () => Symbol('privado') },
  { name: 'BigInt', make: () => BigInt(9) },
  { name: 'NaN', make: () => Number.NaN },
  { name: 'Infinity', make: () => Number.POSITIVE_INFINITY },
  { name: '-Infinity', make: () => Number.NEGATIVE_INFINITY },
  { name: 'Date', make: () => new Date('2026-07-25T09:30:00.000Z') },
  { name: 'Map', make: () => new Map([['a', 1]]) },
  { name: 'Set', make: () => new Set([1]) },
  { name: 'ArrayBuffer', make: () => new ArrayBuffer(8) },
  { name: 'Uint8Array', make: () => new Uint8Array([1, 2, 3]) },
  { name: 'RegExp', make: () => /abc/ },
  { name: 'Promise', make: () => Promise.resolve(1) },
  { name: 'WeakMap', make: () => new WeakMap() },
  { name: 'WeakSet', make: () => new WeakSet() },
  { name: 'objeto com prototype customizado', make: () => Object.create({ herdado: true }) },
];

const INJECTION_POINTS: { name: string; inject: (value: unknown) => Record<string, unknown> }[] = [
  { name: 'user.name', inject: (value) => rawPayload({ user: { ...PROFILE, name: value } }) },
  {
    name: 'activeWorkout.calories',
    inject: (value) => rawPayload({ activeWorkout: { ...makeSession(50), calories: value } }),
  },
  {
    name: 'workoutHistory[0].duration',
    inject: (value) => rawPayload({ workoutHistory: [{ ...makeSession(1), duration: value }] }),
  },
  {
    name: 'workoutHistory[0].exercises[0].sets[0].weight',
    inject: (value) => {
      const session = makeSession(1);
      const exercise = session.exercises[0];
      return rawPayload({
        workoutHistory: [{
          ...session,
          exercises: [{ ...exercise, sets: [{ ...exercise.sets[0], weight: value }] }],
        }],
      });
    },
  },
  {
    name: 'nutrition.protein',
    inject: (value) => rawPayload({
      nutrition: { calories: 0, protein: value, carbs: 0, fat: 0, water: 0 },
    }),
  },
  {
    name: 'customPrograms[0].description',
    inject: (value) => rawPayload({
      customPrograms: [{ ...RICH_CORE.customPrograms[0], description: value }],
    }),
  },
];

const NON_JSON_MATRIX = NON_JSON_VALUES.flatMap((value) => (
  INJECTION_POINTS.map((point) => ({ value: value.name, point: point.name, value_: value, point_: point }))
));

describe('backup lógico v2 — valores que não são JSON', () => {
  it.each(NON_JSON_MATRIX)('$value em $point é recusado sem normalização', ({ value_, point_ }) => {
    const payload = point_.inject(value_.make());
    const validation = validateLogicalBackupPayload(payload);
    expect(validation).toMatchObject({ status: 'invalid', reason: 'invalid-payload' });
    expect(() => serializeLogicalPayloadCanonically(payload as unknown as PersistedState)).toThrow();
    expect(validateLogicalJsonTree(payload).status).toBe('invalid');
  });

  it('o que JSON.stringify normalizaria em silêncio é recusado explicitamente', () => {
    const comDate = rawPayload({ user: { ...PROFILE, name: new Date('2026-07-25T09:30:00.000Z') } });
    const normalizado = JSON.parse(JSON.stringify(comDate)) as { user: { name: unknown } };
    expect(typeof normalizado.user.name).toBe('string');
    expect(validateLogicalBackupPayload(comDate).status).toBe('invalid');

    const comMap = rawPayload({ nutrition: { calories: new Map(), protein: 0, carbs: 0, fat: 0, water: 0 } });
    expect((JSON.parse(JSON.stringify(comMap)) as { nutrition: { calories: unknown } }).nutrition.calories)
      .toEqual({});
    expect(validateLogicalBackupPayload(comMap).status).toBe('invalid');

    const comUndefined = rawPayload({ user: { ...PROFILE, name: undefined } });
    expect(Object.prototype.hasOwnProperty.call(
      JSON.parse(JSON.stringify(comUndefined)) as { user: object },
      'name',
    )).toBe(false);
    expect(validateLogicalBackupPayload(comUndefined).status).toBe('invalid');

    const comTyped = rawPayload({ favoriteExercises: new Uint8Array([1, 2]) });
    expect(JSON.parse(JSON.stringify(comTyped)) as { favoriteExercises: unknown })
      .toMatchObject({ favoriteExercises: { 0: 1, 1: 2 } });
    expect(validateLogicalBackupPayload(comTyped).status).toBe('invalid');
  });

  it('array esparso é recusado em mais de um nível', () => {
    const sparse = (): unknown[] => {
      const list: unknown[] = [];
      list[0] = 'a';
      list.length = 3;
      return list;
    };
    expect(validateLogicalBackupPayload(rawPayload({ favoriteExercises: sparse() })).status)
      .toBe('invalid');
    const session = makeSession(1);
    expect(validateLogicalBackupPayload(rawPayload({
      workoutHistory: [{ ...session, prsDetected: sparse() }],
    })).status).toBe('invalid');
  });

  it('array com propriedade própria extra é recusado', () => {
    const list: unknown[] = ['exercise-1'];
    Object.defineProperty(list, 'extra', {
      value: 'invisível para JSON.stringify',
      enumerable: true,
      writable: true,
      configurable: true,
    });
    expect(JSON.stringify(list)).toBe('["exercise-1"]');
    expect(validateLogicalBackupPayload(rawPayload({ favoriteExercises: list })).status).toBe('invalid');
  });

  it('propriedade não enumerável aninhada é recusada em mais de um nível', () => {
    const hidden = (base: Record<string, unknown>): Record<string, unknown> => {
      Object.defineProperty(base, 'oculto', {
        value: 'escondido',
        enumerable: false,
        writable: true,
        configurable: true,
      });
      return base;
    };
    expect(validateLogicalBackupPayload(rawPayload({ user: hidden({ ...PROFILE }) })).status)
      .toBe('invalid');
    expect(validateLogicalBackupPayload(rawPayload({
      nutrition: hidden({ calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 }),
    })).status).toBe('invalid');
  });

  it('getter e setter aninhados são recusados sem serem executados', () => {
    let reads = 0;
    const user = { ...PROFILE } as Record<string, unknown>;
    Object.defineProperty(user, 'name', {
      get() { reads += 1; return 'nunca lido'; },
      enumerable: true,
      configurable: true,
    });
    expect(validateLogicalBackupPayload(rawPayload({ user })).status).toBe('invalid');
    expect(reads).toBe(0);

    const nutrition: Record<string, unknown> = { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 };
    Object.defineProperty(nutrition, 'water', {
      set() { /* nunca chamado */ },
      enumerable: true,
      configurable: true,
    });
    expect(validateLogicalBackupPayload(rawPayload({ nutrition })).status).toBe('invalid');
  });

  it('propriedade simbólica aninhada é recusada', () => {
    const user = { ...PROFILE } as Record<string | symbol, unknown>;
    user[Symbol('privado')] = 1;
    expect(validateLogicalBackupPayload(rawPayload({ user })).status).toBe('invalid');
  });

  it('referência circular é recusada em objeto e em array', () => {
    const user = { ...PROFILE } as Record<string, unknown>;
    user.returnToTraining = user;
    const circularObject = validateLogicalJsonTree(rawPayload({ user }));
    expect(circularObject).toMatchObject({ status: 'invalid', rejection: 'circular-reference' });
    expect(validateLogicalBackupPayload(rawPayload({ user })).status).toBe('invalid');

    const list: unknown[] = [];
    list.push(list);
    expect(validateLogicalJsonTree(rawPayload({ favoriteExercises: list })))
      .toMatchObject({ status: 'invalid', rejection: 'circular-reference' });
  });

  it('referência compartilhada sem ciclo continua válida', () => {
    const shared = { date: '2026-07-01', value: 82.4 };
    const validation = validateLogicalBackupPayload(rawPayload({ weightHistory: [shared, shared] }));
    expect(validation.status).toBe('valid');
  });

  it('a validação não modifica a entrada e devolve uma cópia independente', () => {
    const date = new Date('2026-07-25T09:30:00.000Z');
    const hostile = rawPayload({ user: { ...PROFILE, name: date } });
    expect(validateLogicalBackupPayload(hostile).status).toBe('invalid');
    expect((hostile.user as Record<string, unknown>).name).toBe(date);

    const source = rawPayload({ favoriteExercises: ['a'] });
    const validation = validateLogicalBackupPayload(source);
    expect(validation.status).toBe('valid');
    if (validation.status !== 'valid') return;
    validation.payload.favoriteExercises.push('b');
    expect(source.favoriteExercises).toEqual(['a']);
    expect(validation.payload).not.toBe(source);
  });

  it('o caminho do erro só usa nomes conhecidos e índices', () => {
    const session = makeSession(1);
    const exercise = session.exercises[0];
    const payload = rawPayload({
      workoutHistory: [{
        ...session,
        exercises: [{ ...exercise, sets: [{ ...exercise.sets[0], weight: Number.NaN }] }],
      }],
    });
    const tree = validateLogicalJsonTree(payload);
    expect(tree).toMatchObject({
      status: 'invalid',
      rejection: 'non-finite-number',
      path: 'payload.workoutHistory[0].exercises[0].sets[0].weight',
    });

    const secreto = 'nome-de-campo-que-e-conteudo-do-usuario';
    const opaque = validateLogicalJsonTree(rawPayload({ user: { ...PROFILE, [secreto]: undefined } }));
    expect(opaque.status).toBe('invalid');
    if (opaque.status === 'invalid') {
      expect(opaque.path).not.toContain(secreto);
      expect(opaque.path).toBe('payload.user.<campo>');
    }
  });
});

// ---------------------------------------------------------------------------
// CHAVES PERIGOSAS RECURSIVAS (PARTES 5 e 13)
// ---------------------------------------------------------------------------

function withDangerousKey<T extends object>(target: T, key: string, value: unknown): T {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return target;
}

const DANGEROUS_KEY_NAMES = ['__proto__', 'prototype', 'constructor'];

const DANGEROUS_LEVELS: { name: string; build: (key: string) => Record<string, unknown> }[] = [
  { name: 'payload', build: (key) => withDangerousKey(rawPayload(), key, { polluted: true }) },
  {
    name: 'user',
    build: (key) => rawPayload({ user: withDangerousKey({ ...PROFILE }, key, { polluted: true }) }),
  },
  {
    name: 'activeWorkout',
    build: (key) => rawPayload({
      activeWorkout: withDangerousKey({ ...makeSession(50) }, key, { polluted: true }),
    }),
  },
  {
    name: 'sessão',
    build: (key) => rawPayload({
      workoutHistory: [withDangerousKey({ ...makeSession(1) }, key, { polluted: true })],
    }),
  },
  {
    name: 'exercise',
    build: (key) => {
      const session = makeSession(1);
      return rawPayload({
        workoutHistory: [{
          ...session,
          exercises: [withDangerousKey({ ...session.exercises[0] }, key, { polluted: true })],
        }],
      });
    },
  },
  {
    name: 'set',
    build: (key) => {
      const session = makeSession(1);
      const exercise = session.exercises[0];
      return rawPayload({
        workoutHistory: [{
          ...session,
          exercises: [{
            ...exercise,
            sets: [withDangerousKey({ ...exercise.sets[0] }, key, { polluted: true })],
          }],
        }],
      });
    },
  },
  {
    name: 'customProgram',
    build: (key) => rawPayload({
      customPrograms: [withDangerousKey({ ...RICH_CORE.customPrograms[0] }, key, { polluted: true })],
    }),
  },
  {
    name: 'nutrition',
    build: (key) => rawPayload({
      nutrition: withDangerousKey(
        { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
        key,
        { polluted: true },
      ),
    }),
  },
];

const DANGEROUS_MATRIX = DANGEROUS_KEY_NAMES.flatMap((key) => (
  DANGEROUS_LEVELS.map((level) => ({ key, level: level.name, build: level.build }))
));

describe('backup lógico v2 — chaves perigosas recursivas', () => {
  it.each(DANGEROUS_MATRIX)('$key em $level é recusada', ({ key, build }) => {
    const payload = build(key);
    expect(validateLogicalBackupPayload(payload)).toMatchObject({
      status: 'invalid',
      reason: 'invalid-payload',
    });
    expect(() => serializeLogicalPayloadCanonically(payload as unknown as PersistedState)).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('a chave perigosa no envelope externo é recusada em qualquer profundidade', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const exported = await exportOk(harness.runtime);
    const poisoned = exported.content.replace(
      '"payload":{',
      '"payload":{"__proto__":{"polluted":true},',
    );
    expect(poisoned).not.toBe(exported.content);
    expect(await inspectLogicalStorageBackupV2(poisoned))
      .toMatchObject({ ok: false, reason: 'invalid-payload' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// DATAS CANÔNICAS (PARTES 6 e 14)
// ---------------------------------------------------------------------------

const NON_CANONICAL_DATES = [
  '2026-07-25',
  '2026-07-25T09:30:00',
  '2026-07-25T09:30:00Z',
  '2026-07-25T09:30:00+03:00',
  '2026-07-25T06:30:00.000+03:00',
  '2026-02-30T00:00:00.000Z',
  '2026-13-01T00:00:00.000Z',
  'Sat, 25 Jul 2026 09:30:00 GMT',
  '25/07/2026',
  'ontem',
  '',
];

describe('backup lógico v2 — datas canônicas', () => {
  it('só o formato produzido por toISOString é aceito', () => {
    expect(isCanonicalIsoInstant('2026-07-25T09:30:00.000Z')).toBe(true);
    expect(isCanonicalIsoInstant(new Date().toISOString())).toBe(true);
    for (const value of NON_CANONICAL_DATES) expect(isCanonicalIsoInstant(value)).toBe(false);
    for (const value of [42, null, undefined, {}, new Date()]) {
      expect(isCanonicalIsoInstant(value)).toBe(false);
    }
  });

  it.each(NON_CANONICAL_DATES)('exportedAt "%s" é recusado na inspeção', async (value) => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const exported = await exportOk(harness.runtime);
    const parsed = JSON.parse(exported.content) as Record<string, unknown>;
    parsed.exportedAt = value;
    expect(await inspectLogicalStorageBackupV2(JSON.stringify(parsed)))
      .toMatchObject({ ok: false, reason: 'invalid-date' });
  });

  it.each(NON_CANONICAL_DATES)('sourceSavedAt "%s" é recusado na inspeção', async (value) => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const exported = await exportOk(harness.runtime);
    const parsed = JSON.parse(exported.content) as Record<string, unknown>;
    parsed.sourceSavedAt = value;
    expect(await inspectLogicalStorageBackupV2(JSON.stringify(parsed)))
      .toMatchObject({ ok: false, reason: 'invalid-date' });
  });

  it('now inválido falha sem produzir backup e sem escrever', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    const result = await createLogicalStorageExportV2({
      runtime: harness.runtime,
      now: new Date(Number.NaN),
    });
    expect(result).toMatchObject({ ok: false, reason: 'invalid-timestamp' });
    expect(Object.prototype.hasOwnProperty.call(result, 'content')).toBe(false);
    expectUnchanged(before, await capturePhysicalState(harness.factory, harness.name, harness.storage));
  });

  it('savedAt não canônico no core bloqueia a captura', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    patchEnvelopeSavedAt(harness.storage, '2026-07-24T12:00:00Z');
    expect(await createLogicalStorageExportV2({ runtime: harness.runtime }))
      .toMatchObject({ ok: false, reason: 'invalid-core' });

    patchEnvelopeSavedAt(harness.storage, '2026-07-24T12:00:00.000Z');
    expect((await createLogicalStorageExportV2({ runtime: harness.runtime })).ok).toBe(true);
  });

  it('o exportedAt gerado pela exportação é sempre canônico', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const result = await exportOk(harness.runtime, new Date('2026-07-25T09:30:00.000Z'));
    expect(isCanonicalIsoInstant(result.backup.exportedAt)).toBe(true);
    expect(isCanonicalIsoInstant(result.backup.sourceSavedAt)).toBe(true);
    const semNow = await exportOk(harness.runtime);
    expect(isCanonicalIsoInstant(semNow.backup.exportedAt)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TAMANHO DECLARADO (PARTES 8 e 15)
// ---------------------------------------------------------------------------

const INVALID_DECLARED_BYTES: { name: string; value: unknown }[] = [
  { name: 'NaN', value: Number.NaN },
  { name: 'Infinity', value: Number.POSITIVE_INFINITY },
  { name: '-Infinity', value: Number.NEGATIVE_INFINITY },
  { name: 'negativo', value: -1 },
  { name: 'decimal', value: 12.5 },
  { name: 'string', value: '1024' },
  { name: 'null', value: null },
  { name: 'objeto', value: {} },
  { name: 'boolean', value: true },
];

describe('backup lógico v2 — declaredBytes', () => {
  async function validContent(): Promise<string> {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    return (await exportOk(harness.runtime)).content;
  }

  it('declaredBytes ausente usa os bytes UTF-8 reais', async () => {
    const content = await validContent();
    const inspection = await inspectLogicalStorageBackupV2(content);
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) return;
    expect(inspection.preview.bytes).toBe(utf8(content));
  });

  it('declaredBytes zero, menor e maior que o real', async () => {
    const content = await validContent();
    const real = utf8(content);

    const zero = await inspectLogicalStorageBackupV2(content, 0);
    expect(zero.ok).toBe(true);
    if (zero.ok) expect(zero.preview.bytes).toBe(real);

    const menor = await inspectLogicalStorageBackupV2(content, 1);
    expect(menor.ok).toBe(true);
    if (menor.ok) expect(menor.preview.bytes).toBe(real);

    const maior = await inspectLogicalStorageBackupV2(content, real + 4096);
    expect(maior.ok).toBe(true);
    if (maior.ok) expect(maior.preview.bytes).toBe(real + 4096);
  });

  it.each(INVALID_DECLARED_BYTES)('declaredBytes $name é recusado com invalid-size', async ({ value }) => {
    const content = await validContent();
    const inspection = await inspectLogicalStorageBackupV2(content, value as number);
    expect(inspection).toMatchObject({ ok: false, reason: 'invalid-size' });
    if (inspection.ok) return;
    expect(inspection.error).not.toContain('NaN');
    expect(inspection.error).not.toContain('Infinity');
  });

  it('os limites de 8 MiB e 25 MiB são exatos', async () => {
    const content = await validContent();

    const oitoExatos = await inspectLogicalStorageBackupV2(content, LOGICAL_BACKUP_LARGE_WARNING_BYTES);
    expect(oitoExatos.ok).toBe(true);
    if (oitoExatos.ok) {
      expect(oitoExatos.preview.bytes).toBe(LOGICAL_BACKUP_LARGE_WARNING_BYTES);
      expect(oitoExatos.preview.warning).toBeNull();
    }

    const acimaDeOito = await inspectLogicalStorageBackupV2(
      content,
      LOGICAL_BACKUP_LARGE_WARNING_BYTES + 1,
    );
    expect(acimaDeOito.ok).toBe(true);
    if (acimaDeOito.ok) expect(acimaDeOito.preview.warning).toContain('MiB');

    const vinteCincoExatos = await inspectLogicalStorageBackupV2(content, MAX_LOGICAL_BACKUP_BYTES);
    expect(vinteCincoExatos.ok).toBe(true);
    if (vinteCincoExatos.ok) {
      expect(vinteCincoExatos.preview.bytes).toBe(MAX_LOGICAL_BACKUP_BYTES);
      expect(vinteCincoExatos.preview.warning).toContain('MiB');
    }

    expect(await inspectLogicalStorageBackupV2(content, MAX_LOGICAL_BACKUP_BYTES + 1))
      .toMatchObject({ ok: false, reason: 'too-large' });
  });

  it('bytes multibyte contam como UTF-8, não como caracteres', async () => {
    const harness = await createReadyHarness();
    patchCore(harness.storage, RICH_CORE);
    const exported = await exportOk(harness.runtime);
    const inspection = await inspectLogicalStorageBackupV2(exported.content);
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) return;
    expect(exported.content).toContain('🏋️');
    expect(inspection.preview.bytes).toBe(utf8(exported.content));
    expect(inspection.preview.bytes).toBeGreaterThan(exported.content.length);
  });

  it('too-large e invalid-size acontecem antes de JSON.parse e de qualquer SHA-256', async () => {
    const content = await validContent();
    const digest = vi.fn(async () => new ArrayBuffer(32));
    const crypto = { digest } as unknown as SubtleCrypto;

    const parseSpy = vi.spyOn(JSON, 'parse');
    try {
      expect(await inspectLogicalStorageBackupV2(content, MAX_LOGICAL_BACKUP_BYTES + 1, crypto))
        .toMatchObject({ ok: false, reason: 'too-large' });
      expect(parseSpy).not.toHaveBeenCalled();
      expect(digest).not.toHaveBeenCalled();

      expect(await inspectLogicalStorageBackupV2(content, Number.NaN, crypto))
        .toMatchObject({ ok: false, reason: 'invalid-size' });
      expect(parseSpy).not.toHaveBeenCalled();
      expect(digest).not.toHaveBeenCalled();
    } finally {
      parseSpy.mockRestore();
    }

    // Controle positivo: com tamanho válido o arquivo é realmente analisado.
    const parseAgain = vi.spyOn(JSON, 'parse');
    try {
      expect((await inspectLogicalStorageBackupV2(content)).ok).toBe(true);
      expect(parseAgain).toHaveBeenCalled();
    } finally {
      parseAgain.mockRestore();
    }
  });

  it('o digest só é recalculado depois de o payload ser validado', async () => {
    const content = await validContent();
    const digest = vi.fn(async () => new ArrayBuffer(32));
    const parsed = JSON.parse(content) as { payload: Record<string, unknown> };
    delete parsed.payload.nutrition;
    expect(await inspectLogicalStorageBackupV2(
      JSON.stringify(parsed),
      undefined,
      { digest } as unknown as SubtleCrypto,
    )).toMatchObject({ ok: false, reason: 'invalid-payload' });
    expect(digest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PRIVACIDADE DOS ERROS (PARTES 9 e 16)
// ---------------------------------------------------------------------------

const PRIVATE_SESSION_ID = 'PRIVATE-SESSION-ID-9c1f';
const PRIVATE_PROFILE_VALUE = 'PRIVATE-PROFILE-VALUE-4b7a';
const PRIVATE_GETTER_MESSAGE = 'PRIVATE-GETTER-MESSAGE-2e55';
const PRIVATE_RAW_VALUE = 'PRIVATE-RAW-VALUE-77d3';

const SENTINELS = [
  PRIVATE_SESSION_ID,
  PRIVATE_PROFILE_VALUE,
  PRIVATE_GETTER_MESSAGE,
  PRIVATE_RAW_VALUE,
];

function expectNoSentinel(result: unknown): void {
  const record = result as { error?: string; reason?: string; detail?: string; cause?: unknown };
  const surfaces = [
    JSON.stringify(result) ?? '',
    String(record.error ?? ''),
    String(record.reason ?? ''),
    String(record.detail ?? ''),
    String(record.cause ?? ''),
    record.cause instanceof Error ? `${record.cause.message}${record.cause.stack ?? ''}` : '',
  ];
  for (const sentinel of SENTINELS) {
    for (const surface of surfaces) expect(surface).not.toContain(sentinel);
  }
}

describe('backup lógico v2 — privacidade das mensagens', () => {
  it('sessionId duplicado tem mensagem genérica e não interpola o id', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(2), makeSession(1)] });
    const exported = await exportOk(harness.runtime);
    const parsed = JSON.parse(exported.content) as { payload: { workoutHistory: { id: string }[] } };
    parsed.payload.workoutHistory[0].id = PRIVATE_SESSION_ID;
    parsed.payload.workoutHistory[1].id = PRIVATE_SESSION_ID;

    const inspection = await inspectLogicalStorageBackupV2(JSON.stringify(parsed));
    expect(inspection).toMatchObject({ ok: false, reason: 'duplicate-session-id' });
    if (!inspection.ok) expect(inspection.error).toContain('IDs de sessão duplicados');
    expectNoSentinel(inspection);
  });

  it('valor de perfil recusado não aparece na mensagem', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const exported = await exportOk(harness.runtime);
    const parsed = JSON.parse(exported.content) as { payload: Record<string, unknown> };
    parsed.payload.user = PRIVATE_PROFILE_VALUE;
    expectNoSentinel(await inspectLogicalStorageBackupV2(JSON.stringify(parsed)));

    const outro = JSON.parse(exported.content) as { payload: Record<string, unknown> };
    outro.payload[`campo-${PRIVATE_PROFILE_VALUE}`] = 1;
    expectNoSentinel(await inspectLogicalStorageBackupV2(JSON.stringify(outro)));

    expectNoSentinel(validateLogicalBackupPayload(rawPayload({
      user: { ...PROFILE, [PRIVATE_PROFILE_VALUE]: undefined },
    })));
  });

  it('mensagem de getter controlado pelo payload nunca sobe', () => {
    let reads = 0;
    const user = { ...PROFILE } as Record<string, unknown>;
    Object.defineProperty(user, 'name', {
      get() { reads += 1; throw new Error(PRIVATE_GETTER_MESSAGE); },
      enumerable: true,
      configurable: true,
    });
    const payload = rawPayload({ user });

    const validation = validateLogicalBackupPayload(payload);
    expect(validation.status).toBe('invalid');
    expectNoSentinel(validation);
    expect(reads).toBe(0);

    try {
      serializeLogicalPayloadCanonically(payload as unknown as PersistedState);
      throw new Error('deveria ter falhado');
    } catch (error) {
      expect((error as Error).message).not.toContain(PRIVATE_GETTER_MESSAGE);
    }
    expect(reads).toBe(0);
  });

  it('proxy hostil vira recusa anônima, sem mensagem nem cause originais', () => {
    const hostile = new Proxy({ calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 }, {
      ownKeys() { throw new Error(PRIVATE_GETTER_MESSAGE); },
    });
    const tree = validateLogicalJsonTree(rawPayload({ nutrition: hostile }));
    expect(tree).toMatchObject({ status: 'invalid', rejection: 'hostile-value' });
    expectNoSentinel(validateLogicalBackupPayload(rawPayload({ nutrition: hostile })));
  });

  it('o raw e trechos de JSON nunca aparecem na falha de parse', async () => {
    const broken = `{"format":"gymflow-backup","payload":"${PRIVATE_RAW_VALUE}"`;
    const inspection = await inspectLogicalStorageBackupV2(broken);
    expect(inspection).toMatchObject({ ok: false, reason: 'invalid-json' });
    expectNoSentinel(inspection);
    if (!inspection.ok) expect(inspection.cause).toBeUndefined();
  });

  it('a falha de exportação por serialização não devolve mensagem nem cause do payload', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const captured = await captureLogicalBackupSnapshot(harness.runtime);
    expect(captured.status).toBe('ok');
    if (captured.status !== 'ok') return;
    // A captura real nunca produz um payload hostil; o caminho é exercitado
    // injetando o estado já capturado num runtime que o devolve adulterado.
    const poisoned = { ...captured.snapshot.state } as unknown as Record<string, unknown>;
    Object.defineProperty(poisoned, 'user', {
      get() { throw new Error(PRIVATE_GETTER_MESSAGE); },
      enumerable: true,
      configurable: true,
    });
    expectNoSentinel(validateLogicalBackupPayload(poisoned));
    try {
      serializeLogicalPayloadCanonically(poisoned as unknown as PersistedState);
      throw new Error('deveria ter falhado');
    } catch (error) {
      expect((error as Error).message).not.toContain(PRIVATE_GETTER_MESSAGE);
    }
  });

  it('cause continua preservado nas falhas internas confiáveis', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const exported = await exportOk(harness.runtime);
    const semCrypto = await createLogicalStorageExportV2({
      runtime: harness.runtime,
      subtleCrypto: null,
    });
    expect(semCrypto).toMatchObject({ ok: false, reason: 'crypto-unavailable' });
    if (!semCrypto.ok) expect(semCrypto.cause).toBeInstanceOf(Error);

    const inspection = await inspectLogicalStorageBackupV2(exported.content, undefined, null);
    expect(inspection).toMatchObject({ ok: false, reason: 'crypto-unavailable' });
    if (!inspection.ok) expect(inspection.cause).toBeInstanceOf(Error);
  });
});
