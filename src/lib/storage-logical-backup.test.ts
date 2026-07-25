import fs from 'node:fs';
import path from 'node:path';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../types';
import { loadStateResult, STORAGE_BACKUP_SUFFIX } from './storage';
import { createStorageAdminRuntime } from './storage-admin-runtime';
import {
  commitStorageImport,
  createStorageExport,
  inspectStorageImport,
  MAX_IMPORT_BYTES,
  STORAGE_EXPORT_FORMAT_VERSION,
} from './storage-export';
import { createHybridStorageRuntime } from './storage-hybrid';
import type { HistoryGenerationManifest } from './storage-history-integrity';
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
  LOGICAL_BACKUP_FORMAT_VERSION,
  LOGICAL_BACKUP_LARGE_WARNING_BYTES,
  LOGICAL_BACKUP_SCHEMA_VERSION,
  type LogicalBackupRuntime,
  MAX_LOGICAL_BACKUP_BYTES,
  serializeLogicalPayloadCanonically,
  validateLogicalBackupPayload,
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
    kind: 'restore',
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
    expect(found).toEqual(['src/lib/storage-logical-backup.test.ts']);
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
