import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../types';
import {
  type BeginStorageOperationInput,
  StorageAdministrationConflictError,
  StorageAdministrationInputError,
  StorageAdministrationUnavailableError,
  StorageCompletionPendingError,
  StorageOperationAlreadyInProgressError,
  StorageOperationBeginConflictError,
  StorageOperationTransitionConflictError,
  createStorageAdminRuntime,
} from './storage-admin-runtime';
import type { StorageOperationReceipt } from './storage-operation-receipt';
import {
  type WorkoutCompletionEffects,
  createWorkoutCompletionReceipt,
} from './storage-completion-receipt';
import {
  createHybridStorageRuntime,
} from './storage-hybrid';
import type { HistoryGenerationManifest } from './storage-history-integrity';
import {
  COMPLETION_RECEIPTS_STORE,
  GENERATION_MANIFESTS_STORE,
  GYMFLOW_INDEXEDDB_VERSION,
  HistoryMetadataIntegrityError,
  IndexedDbWorkoutHistoryStorage,
  METADATA_STORE,
  STORAGE_OPERATION_RECEIPTS_STORE,
  StorageOperationAmbiguousStateError,
  StorageOperationReceiptIntegrityError,
  StorageOperationTransitionError,
  WORKOUT_HISTORY_STORE,
} from './storage-indexeddb';
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

function v1Envelope(state: Partial<PersistedState>): string {
  return JSON.stringify({
    v: MONOLITHIC_STORAGE_VERSION,
    savedAt: '2026-07-23T10:00:00.000Z',
    data: state,
  });
}

function makeCoreEnvelope(generationId: string, overrides: Record<string, unknown> = {}) {
  return {
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
    historyStorage: { backend: 'indexeddb' as const, schemaVersion: 1 as const, generationId },
    ...overrides,
  };
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

async function seedPendingCompletion(
  adapter: IndexedDbWorkoutHistoryStorage,
  generationId: string,
  sessionIndex = 90,
): Promise<void> {
  const session = makeSession(sessionIndex);
  const receipt = await createWorkoutCompletionReceipt({
    receiptId: `receipt-${session.id}`,
    generationId,
    finalSession: session,
    coreEnvelopeAfter: makeCoreEnvelope(generationId) as never,
    effects: EMPTY_EFFECTS,
    createdAt: '2026-07-24T12:30:00.000Z',
  });
  await adapter.appendSessionWithCompletionReceipt(session, receipt);
}

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

function putRawOperationReceipt(
  factory: IDBFactory,
  name: string,
  record: Record<string, unknown>,
): Promise<unknown> {
  return withStore(factory, name, STORAGE_OPERATION_RECEIPTS_STORE, 'readwrite', (transaction) => (
    requestResult(transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE).put(record))
  ));
}

function putRawMetadata(factory: IDBFactory, name: string, key: string, value: unknown): Promise<unknown> {
  return withStore(factory, name, METADATA_STORE, 'readwrite', (transaction) => (
    requestResult(transaction.objectStore(METADATA_STORE).put({ key, value }))
  ));
}

function deleteManifest(factory: IDBFactory, name: string, generationId: string): Promise<unknown> {
  return withStore(factory, name, GENERATION_MANIFESTS_STORE, 'readwrite', (transaction) => (
    requestResult(transaction.objectStore(GENERATION_MANIFESTS_STORE).delete(generationId))
  ));
}

// `workoutHistory` tem keyPath ['generationId','order'] e índice único
// ['generationId','sessionId'].
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

function readManifest(factory: IDBFactory, name: string, generationId: string): Promise<HistoryGenerationManifest> {
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

async function readAllStores(
  factory: IDBFactory,
  name: string,
): Promise<Record<string, unknown[]>> {
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

// Hidrata um runtime híbrido de verdade (reaproveitando o 002D-A0/A1 já
// testados) para obter um core v2 saudável e uma geração ativa real, depois
// constrói a fachada administrativa sobre a MESMA storage/adapter.
async function createReadyHarness(options: {
  storage?: MemoryStorage;
  factory?: IDBFactory;
  now?: () => Date;
  idFactory?: () => string;
  sessions?: WorkoutSession[];
} = {}) {
  const storage = options.storage ?? new MemoryStorage();
  const factory = options.factory ?? new IDBFactory();
  const name = `gymflow-admin-${databaseSequence += 1}`;
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
    defaults: defaults(options.sessions ?? []),
    now: () => new Date('2026-07-24T12:00:00.000Z'),
  });
  const hydration = await hybrid.hydrate();
  if (hydration.mode !== 'hybrid-v2') {
    throw new Error(`setup de teste falhou: hidratação ficou em ${hydration.mode}`);
  }
  // `defaults.workoutHistory` não semeia o IndexedDB: uma instalação nova
  // sempre parte de histórico vazio (ver `initializeFreshInstall`). Sessões de
  // teste entram via `replaceHistory` direto no adapter, depois da hidratação.
  let generationId = hydration.generationId;
  if (options.sessions && options.sessions.length > 0) {
    generationId = await adapter.replaceHistory(options.sessions);
  }
  const runtime = createStorageAdminRuntime({
    key: KEY,
    storage,
    adapter,
    now: options.now ?? (() => new Date('2026-07-24T13:00:00.000Z')),
    idFactory: options.idFactory ?? (() => 'operation-test-1'),
  });
  return { storage, factory, name, adapter, hybrid, runtime, generationId };
}

function beginInput(overrides: Partial<BeginStorageOperationInput> = {}): BeginStorageOperationInput {
  return {
    kind: 'import',
    sourceDigest: null,
    stagedGenerationId: null,
    targetCoreRaw: null,
    ...overrides,
  };
}

// Receipt COERENTE com o estado físico observado: `previousCoreRaw` é o core v2
// real e `previousGenerationId` é a geração ativa real. Desde o corretivo 036 um
// receipt que não descreve o mesmo mundo que o core/metadata vira `conflicted`
// (`operation-incompatible`), e não `interrupted` — então todo teste que quer
// diagnosticar uma interrupção legítima precisa partir daqui.
function coherentReceipt(
  harness: { storage: MemoryStorage; generationId: string },
  overrides: Partial<StorageOperationReceipt> = {},
): StorageOperationReceipt {
  return {
    operationId: 'operation-interrompida',
    kind: 'restore',
    sourceDigest: null,
    previousCoreRaw: harness.storage.getItem(KEY) as string,
    previousGenerationId: harness.generationId,
    stagedGenerationId: null,
    targetCoreRaw: null,
    status: 'staged',
    createdAt: '2026-07-24T12:15:00.000Z',
    updatedAt: '2026-07-24T12:15:00.000Z',
    ...overrides,
  };
}

// Roda `mutate` DEPOIS da execução real da n-ésima chamada de `method`. É assim
// que as sondas abrem janelas verdadeiras: a mutação acontece no meio do
// protocolo, com o adapter físico de verdade, nunca simulando o retorno.
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

// Roda `mutate` ANTES da n-ésima chamada de `method`.
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

// Substitui um método do adapter por uma falha real.
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

interface PhysicalState {
  raw: string | null;
  stores: Record<string, unknown[]>;
}

async function capturePhysicalState(
  factory: IDBFactory,
  name: string,
  storage: MemoryStorage,
): Promise<PhysicalState> {
  return { raw: storage.getItem(KEY), stores: await readAllStores(factory, name) };
}

function expectUnchanged(before: PhysicalState, after: PhysicalState): void {
  expect(after.raw).toBe(before.raw);
  expect(JSON.stringify(after.stores)).toBe(JSON.stringify(before.stores));
}

describe('estado administrativo (inspectStorageAdministration)', () => {
  it('envelope legado v1 → unavailable (not-hybrid)', async () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, v1Envelope(defaults()));
    const adapter = new IndexedDbWorkoutHistoryStorage({ factory: new IDBFactory(), databaseName: 'admin-legacy' });
    const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter });

    const snapshot = await runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({ status: 'unavailable', reason: 'not-hybrid' });
    expect(snapshot.physicalStorageVersion).toBe(MONOLITHIC_STORAGE_VERSION);
    expect(snapshot.activeGenerationId).toBeNull();
    expect(snapshot.generations).toEqual([]);
  });

  it('core ausente (chave nunca gravada) → unavailable (not-hybrid)', async () => {
    const storage = new MemoryStorage();
    const adapter = new IndexedDbWorkoutHistoryStorage({ factory: new IDBFactory() });
    const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter });

    const snapshot = await runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({ status: 'unavailable', reason: 'not-hybrid' });
  });

  it('envelope v2 corrompido → unavailable (core-invalid)', async () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, `{"v":${HYBRID_STORAGE_VERSION},"corrompido":true`);
    const adapter = new IndexedDbWorkoutHistoryStorage({ factory: new IDBFactory() });
    const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter });

    const snapshot = await runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({ status: 'unavailable', reason: 'core-invalid' });
  });

  it('IndexedDB indisponível com core v2 válido → unavailable', async () => {
    const { storage } = await createReadyHarness();
    const raw = storage.getItem(KEY);
    expect(raw).not.toBeNull();
    const freshStorage = new MemoryStorage();
    freshStorage.setItem(KEY, raw as string);
    const adapter = new IndexedDbWorkoutHistoryStorage({ factory: undefined });
    const runtime = createStorageAdminRuntime({ key: KEY, storage: freshStorage, adapter });

    const snapshot = await runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({ status: 'unavailable', reason: 'indexeddb-unavailable' });
    expect(snapshot.physicalStorageVersion).toBe(HYBRID_STORAGE_VERSION);
  });

  it('v2 saudável sem nenhuma operação em aberto → ready', async () => {
    const { runtime, generationId } = await createReadyHarness({ sessions: [makeSession(1)] });

    const snapshot = await runtime.inspectStorageAdministration();
    expect(snapshot.state).toEqual({ status: 'ready' });
    expect(snapshot.activeGenerationId).toBe(generationId);
    expect(snapshot.stagedGenerationId).toBeNull();
    expect(snapshot.unsettledOperations).toEqual([]);
    expect(snapshot.pendingCompletionReceiptCount).toBe(0);
    expect(snapshot.physicalStorageVersion).toBe(HYBRID_STORAGE_VERSION);
  });

  it.each(['staged', 'activating'] as const)(
    'exatamente um receipt %s COERENTE → interrupted, identificado por operationId/kind/status',
    async (status) => {
      const harness = await createReadyHarness();
      const { adapter, runtime, generationId } = harness;
      await adapter.createStorageOperationReceiptIfIdle({
        receipt: coherentReceipt(harness),
        expectedActiveGenerationId: generationId,
      });
      if (status === 'activating') {
        await adapter.transitionStorageOperationReceipt('operation-interrompida', 'staged', 'activating');
      }

      const snapshot = await runtime.inspectStorageAdministration();
      expect(snapshot.state.status).toBe('interrupted');
      if (snapshot.state.status === 'interrupted') {
        expect(snapshot.state.operation.operationId).toBe('operation-interrompida');
        expect(snapshot.state.operation.kind).toBe('restore');
        expect(snapshot.state.operation.status).toBe(status);
      }
    },
  );

  it('receipt activated sem efeitos comprovados → conflicted, nunca interrupted', async () => {
    // No A2 nada cria staging físico nem grava core alvo, então `activated`
    // afirma efeitos que o diagnóstico não consegue comprovar. Isso é conflito,
    // não uma interrupção retomável.
    const harness = await createReadyHarness();
    await harness.adapter.putStorageOperationReceipt(coherentReceipt(harness, { status: 'activated' }));

    const snapshot = await harness.runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({ status: 'conflicted', reason: 'operation-incompatible' });
    if (snapshot.state.status === 'conflicted') {
      expect(snapshot.state.detail).toContain('activated-target-missing');
    }
  });

  it('dois receipts não terminais → conflicted (multiple-unsettled-operations)', async () => {
    const { adapter, runtime, generationId } = await createReadyHarness();
    await adapter.putStorageOperationReceipt({
      operationId: 'operation-a',
      kind: 'import',
      sourceDigest: null,
      previousCoreRaw: '{"a":true}',
      previousGenerationId: generationId,
      stagedGenerationId: null,
      targetCoreRaw: null,
      status: 'staged',
      createdAt: '2026-07-24T12:10:00.000Z',
      updatedAt: '2026-07-24T12:10:00.000Z',
    });
    await adapter.putStorageOperationReceipt({
      operationId: 'operation-b',
      kind: 'reset',
      sourceDigest: null,
      previousCoreRaw: '{"b":true}',
      previousGenerationId: generationId,
      stagedGenerationId: null,
      targetCoreRaw: null,
      status: 'activating',
      createdAt: '2026-07-24T12:11:00.000Z',
      updatedAt: '2026-07-24T12:11:00.000Z',
    });

    const snapshot = await runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({ status: 'conflicted', reason: 'multiple-unsettled-operations' });
    expect(snapshot.unsettledOperations).toHaveLength(2);
  });

  it('receipt malformado no store → conflicted (fail-closed, nunca "sem operação")', async () => {
    const { factory, name, runtime } = await createReadyHarness();
    await putRawOperationReceipt(factory, name, { operationId: 'operation-torto', kind: 'import' });

    const snapshot = await runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({ status: 'conflicted', reason: 'malformed-operation-receipt' });
  });

  it('conclusão de treino pendente sozinha → conflicted (completion-pending)', async () => {
    const { adapter, runtime, generationId } = await createReadyHarness();
    await seedPendingCompletion(adapter, generationId);

    const snapshot = await runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({ status: 'conflicted', reason: 'completion-pending' });
    expect(snapshot.pendingCompletionReceiptCount).toBe(1);
  });

  it('conclusão pendente + operação administrativa → conflicted (completion-pending-with-operation)', async () => {
    const { adapter, runtime, generationId } = await createReadyHarness();
    await seedPendingCompletion(adapter, generationId);
    await adapter.putStorageOperationReceipt({
      operationId: 'operation-a',
      kind: 'import',
      sourceDigest: null,
      previousCoreRaw: '{"a":true}',
      previousGenerationId: generationId,
      stagedGenerationId: null,
      targetCoreRaw: null,
      status: 'staged',
      createdAt: '2026-07-24T12:10:00.000Z',
      updatedAt: '2026-07-24T12:10:00.000Z',
    });

    const snapshot = await runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({
      status: 'conflicted',
      reason: 'completion-pending-with-operation',
    });
  });

  it('staging sem operação que o explique → conflicted (staging-without-receipt)', async () => {
    const { factory, name, runtime } = await createReadyHarness();
    await putRawMetadata(factory, name, 'migrationGeneration', 'generation-orfa');

    const snapshot = await runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({ status: 'conflicted', reason: 'staging-without-receipt' });
    expect(snapshot.stagedGenerationId).toBe('generation-orfa');
  });

  it('geração ativa sem manifest confirmado → conflicted (active-generation-corrupt)', async () => {
    const { factory, name, runtime, generationId } = await createReadyHarness({ sessions: [makeSession(1)] });
    await deleteManifest(factory, name, generationId);

    const snapshot = await runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({ status: 'conflicted', reason: 'active-generation-corrupt' });
  });

  it('a leitura do snapshot não produz nenhuma mutação física', async () => {
    const { factory, name, storage, runtime } = await createReadyHarness({ sessions: [makeSession(1)] });
    const rawBefore = storage.getItem(KEY);
    const storesBefore = await readAllStores(factory, name);

    await runtime.inspectStorageAdministration();

    expect(storage.getItem(KEY)).toBe(rawBefore);
    const storesAfter = await readAllStores(factory, name);
    expect(JSON.stringify(storesAfter)).toBe(JSON.stringify(storesBefore));
  });
});

describe('beginStorageOperation', () => {
  it('cria exatamente um receipt staged com campos internos corretos', async () => {
    const { runtime, storage, generationId } = await createReadyHarness({ sessions: [makeSession(1)] });
    const rawBefore = storage.getItem(KEY);

    const receipt = await runtime.beginStorageOperation(beginInput({
      kind: 'restore',
      sourceDigest: 'sha256:origem',
    }));

    expect(receipt.status).toBe('staged');
    expect(receipt.kind).toBe('restore');
    expect(receipt.sourceDigest).toBe('sha256:origem');
    expect(receipt.stagedGenerationId).toBeNull();
    expect(receipt.targetCoreRaw).toBeNull();
    // previousCoreRaw é byte a byte o core observado antes do begin.
    expect(receipt.previousCoreRaw).toBe(rawBefore);
    // previousGenerationId é a geração ativa real, não um valor informado.
    expect(receipt.previousGenerationId).toBe(generationId);
    // operationId e timestamps são gerados pelo runtime (injeção determinística).
    expect(receipt.operationId).toBe('operation-test-1');
    expect(receipt.createdAt).toBe('2026-07-24T13:00:00.000Z');
    expect(receipt.updatedAt).toBe('2026-07-24T13:00:00.000Z');
  });

  it('ignora campos protegidos informados pelo consumidor', async () => {
    const { runtime, generationId } = await createReadyHarness();
    const poisoned = {
      kind: 'import',
      sourceDigest: null,
      stagedGenerationId: null,
      targetCoreRaw: null,
      status: 'settled',
      previousCoreRaw: 'forjado',
      previousGenerationId: 'forjada',
      createdAt: '1999-01-01T00:00:00.000Z',
      updatedAt: '1999-01-01T00:00:00.000Z',
      operationId: 'operation-forjada',
    } as unknown as BeginStorageOperationInput;

    const receipt = await runtime.beginStorageOperation(poisoned);
    expect(receipt.status).toBe('staged');
    expect(receipt.previousGenerationId).toBe(generationId);
    expect(receipt.previousCoreRaw).not.toBe('forjado');
    expect(receipt.createdAt).toBe('2026-07-24T13:00:00.000Z');
    expect(receipt.operationId).toBe('operation-test-1');
  });

  it('recusa quando já existe uma operação administrativa em andamento', async () => {
    const { runtime } = await createReadyHarness();
    await runtime.beginStorageOperation(beginInput());

    await expect(runtime.beginStorageOperation(beginInput({ kind: 'reset' })))
      .rejects.toBeInstanceOf(StorageOperationAlreadyInProgressError);
  });

  it('recusa quando há uma conclusão de treino pendente', async () => {
    const { runtime, adapter, generationId } = await createReadyHarness();
    await seedPendingCompletion(adapter, generationId);

    const error = await runtime.beginStorageOperation(beginInput())
      .then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageAdministrationConflictError);
    expect((error as StorageAdministrationConflictError).reason).toBe('completion-pending');
    expect(await adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
  });

  it('recusa quando a geração ativa está corrompida (sem manifest)', async () => {
    const { runtime, factory, name, generationId, adapter } = await createReadyHarness({ sessions: [makeSession(1)] });
    await deleteManifest(factory, name, generationId);

    const error = await runtime.beginStorageOperation(beginInput())
      .then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageAdministrationConflictError);
    expect(await adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
  });

  it('recusa quando o core físico é inválido', async () => {
    const { runtime, storage } = await createReadyHarness();
    storage.setItem(KEY, `{"v":${HYBRID_STORAGE_VERSION},"corrompido":true`);

    await expect(runtime.beginStorageOperation(beginInput()))
      .rejects.toBeInstanceOf(StorageAdministrationUnavailableError);
  });

  it('recusa em runtime legado (v1)', async () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, v1Envelope(defaults()));
    const adapter = new IndexedDbWorkoutHistoryStorage({ factory: new IDBFactory(), databaseName: 'admin-legacy-begin' });
    const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter });

    await expect(runtime.beginStorageOperation(beginInput()))
      .rejects.toBeInstanceOf(StorageAdministrationUnavailableError);
  });

  it('recusa quando o envelope está bloqueado (versão física não suportada)', async () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify({ v: 99, savedAt: '2026-01-01T00:00:00.000Z', data: {} }));
    const adapter = new IndexedDbWorkoutHistoryStorage({ factory: new IDBFactory(), databaseName: 'admin-blocked-begin' });
    const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter });

    const error = await runtime.beginStorageOperation(beginInput())
      .then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageAdministrationUnavailableError);
    expect((error as StorageAdministrationUnavailableError).reason).toBe('physical-version-mismatch');
  });

  it('dois begins concorrentes na mesma fachada criam exatamente um receipt', async () => {
    const { runtime, adapter } = await createReadyHarness();

    const [first, second] = await Promise.allSettled([
      runtime.beginStorageOperation(beginInput({ kind: 'import' })),
      runtime.beginStorageOperation(beginInput({ kind: 'reset' })),
    ]);
    const outcomes = [first, second];
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(await adapter.listUnsettledStorageOperationReceipts()).toHaveLength(1);
  });

  it('reverte o receipt quando a geração ativa muda depois da criação', async () => {
    const { adapter, storage, factory, name } = await createReadyHarness({ sessions: [makeSession(1)] });
    // Segunda geração real, fisicamente preparada. O ponteiro de staging é
    // limpo logo em seguida para que o `inspect()` inicial do begin veja
    // `ready` — a mutação real do ponteiro ativo acontece DEPOIS de o receipt
    // já ter sido criado, direto no store de metadata.
    const otherGeneration = await adapter.prepareHistoryGeneration([makeSession(2)]);
    await putRawMetadata(factory, name, 'migrationGeneration', null);
    const racingAdapter = afterCall(adapter, 'createStorageOperationReceiptIfIdle', 1, async () => {
      await putRawMetadata(factory, name, 'activeGeneration', otherGeneration);
    });
    const runtime = createStorageAdminRuntime({
      key: KEY,
      storage,
      adapter: racingAdapter,
      now: () => new Date('2026-07-24T13:00:00.000Z'),
      idFactory: () => 'operation-racing-generation',
    });

    const error = await runtime.beginStorageOperation(beginInput())
      .then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageOperationBeginConflictError);
    const conflict = error as StorageOperationBeginConflictError;
    expect(conflict.operationId).toBe('operation-racing-generation');
    expect(conflict.compensation).toBe('reverted');
    expect(conflict.finalReceiptStatus).toBe('reverted');

    const reverted = await adapter.readStorageOperationReceipt('operation-racing-generation');
    expect(reverted?.status).toBe('reverted');
    expect(await adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
    // A geração ativa real da mutação continua valendo; o begin não reverteu
    // o ponteiro que a corrida moveu.
    expect((await adapter.readMetadata()).activeGeneration).toBe(otherGeneration);
  });

  it('reverte o receipt quando o core físico muda depois da criação', async () => {
    const { adapter, storage } = await createReadyHarness();
    const rawBefore = storage.getItem(KEY) as string;
    const mutatedRaw = JSON.stringify({
      v: HYBRID_STORAGE_VERSION,
      savedAt: '2030-01-01T00:00:00.000Z',
      data: JSON.parse(rawBefore).data,
    });
    const racingAdapter = afterCall(adapter, 'createStorageOperationReceiptIfIdle', 1, async () => {
      storage.setItem(KEY, mutatedRaw);
    });
    const runtime = createStorageAdminRuntime({
      key: KEY,
      storage,
      adapter: racingAdapter,
      now: () => new Date('2026-07-24T13:00:00.000Z'),
      idFactory: () => 'operation-racing-core',
    });

    const error = await runtime.beginStorageOperation(beginInput())
      .then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageOperationBeginConflictError);
    expect((error as StorageOperationBeginConflictError).compensation).toBe('reverted');

    const reverted = await adapter.readStorageOperationReceipt('operation-racing-core');
    expect(reverted?.status).toBe('reverted');
    expect(await adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
    // Só a corrida escreveu no core; o runtime nunca o alterou por conta própria.
    expect(storage.getItem(KEY)).toBe(mutatedRaw);
  });

  it('recusa CompletionReceipt que aparece entre o inspect e a criação (mesma transação)', async () => {
    // A janela que a auditoria explorou: o diagnóstico via zero conclusões
    // pendentes e o begin criava o receipt assim mesmo. Agora a criação disputa
    // `completionReceipts` na própria transação, então a conclusão gravada nesse
    // intervalo bloqueia a operação em vez de coexistir com ela.
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const { adapter, storage, factory, name, generationId } = harness;
    const racingAdapter = beforeCall(adapter, 'createStorageOperationReceiptIfIdle', 1, async () => {
      await seedPendingCompletion(adapter, generationId);
    });
    const runtime = createStorageAdminRuntime({
      key: KEY,
      storage,
      adapter: racingAdapter,
      now: () => new Date('2026-07-24T13:00:00.000Z'),
      idFactory: () => 'operation-race-completion',
    });

    const error = await runtime.beginStorageOperation(beginInput())
      .then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageCompletionPendingError);
    expect((error as StorageCompletionPendingError).pendingReceiptIds).toEqual(['receipt-session-90']);

    // Nenhum receipt administrativo nasceu, e a conclusão pendente segue intacta.
    expect(await adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
    expect(await adapter.readStorageOperationReceipt('operation-race-completion')).toBeNull();
    expect(await adapter.readPendingCompletionReceipts()).toHaveLength(1);
    void factory;
    void name;
  });

  it('um begin recusado não altera core, metadata ou histórico', async () => {
    const { runtime, adapter, storage, factory, name, generationId } = await createReadyHarness({
      sessions: [makeSession(1)],
    });
    await seedPendingCompletion(adapter, generationId);
    const rawBefore = storage.getItem(KEY);
    const storesBefore = await readAllStores(factory, name);

    await runtime.beginStorageOperation(beginInput()).catch(() => undefined);

    expect(storage.getItem(KEY)).toBe(rawBefore);
    const storesAfter = await readAllStores(factory, name);
    expect(JSON.stringify(storesAfter)).toBe(JSON.stringify(storesBefore));
  });
});

describe('transitionStorageOperation', () => {
  it('percorre staged → activating em estado coerente', async () => {
    const { runtime } = await createReadyHarness();
    const receipt = await runtime.beginStorageOperation(beginInput());

    const activating = await runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'staged',
      nextStatus: 'activating',
    });
    expect(activating.status).toBe('activating');
  });

  it('recusa activating → activated: o A2 não produz os efeitos que activated afirma', async () => {
    // `activated` significa "geração preparada já ativa e core alvo já gravado".
    // Nenhum fluxo do A2 faz isso, então a transição deixaria o receipt afirmando
    // um mundo que não existe. A recusa acontece ANTES de qualquer escrita.
    const { runtime, adapter } = await createReadyHarness();
    const receipt = await runtime.beginStorageOperation(beginInput());
    await runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'staged',
      nextStatus: 'activating',
    });

    const error = await runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'activating',
      nextStatus: 'activated',
      patch: { targetCoreRaw: '{"schemaVersion":1}' },
    }).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageAdministrationConflictError);
    expect((error as StorageAdministrationConflictError).reason).toBe('operation-incompatible');

    const current = await adapter.readStorageOperationReceipt(receipt.operationId);
    expect(current?.status).toBe('activating');
    expect(current?.targetCoreRaw).toBeNull();
  });

  it('permite activating → reverted: status terminal não afirma efeito nenhum', async () => {
    const { runtime } = await createReadyHarness();
    const receipt = await runtime.beginStorageOperation(beginInput());
    await runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'staged',
      nextStatus: 'activating',
    });

    const reverted = await runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'activating',
      nextStatus: 'reverted',
    });
    expect(reverted.status).toBe('reverted');
  });

  it('permite staged → reverted diretamente', async () => {
    const { runtime } = await createReadyHarness();
    const receipt = await runtime.beginStorageOperation(beginInput());

    const reverted = await runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'staged',
      nextStatus: 'reverted',
    });
    expect(reverted.status).toBe('reverted');
  });

  it('recusa expectedStatus divergente, operationId estranho e ausência de operação', async () => {
    const { runtime } = await createReadyHarness();
    const receipt = await runtime.beginStorageOperation(beginInput());

    // expectedStatus divergente: o CAS do adapter continua sendo quem recusa.
    await expect(runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'activating',
      nextStatus: 'activated',
    })).rejects.toBeInstanceOf(StorageOperationTransitionError);

    // operationId que não é a operação em aberto: a fachada não "escolhe" outra.
    const stranger = await runtime.transitionStorageOperation({
      operationId: 'operation-inexistente',
      expectedStatus: 'staged',
      nextStatus: 'activating',
    }).then(() => null, (caught: unknown) => caught);
    expect(stranger).toBeInstanceOf(StorageAdministrationConflictError);
    expect((stranger as StorageAdministrationConflictError).reason).toBe('operation-not-the-unsettled-one');

    // Depois de terminal não existe mais operação em aberto.
    await runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'staged',
      nextStatus: 'reverted',
    });
    const afterTerminal = await runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'reverted',
      nextStatus: 'activating',
    }).then(() => null, (caught: unknown) => caught);
    expect(afterTerminal).toBeInstanceOf(StorageAdministrationConflictError);
    expect((afterTerminal as StorageAdministrationConflictError).reason).toBe('no-unsettled-operation');
  });

  it('uma transição bem-sucedida altera só o receipt', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const { runtime, adapter, storage, factory, name } = harness;
    const receipt = await runtime.beginStorageOperation(beginInput());

    const rawBefore = storage.getItem(KEY);
    const historyBefore = await adapter.readActiveHistory();
    const metadataBefore = await adapter.readMetadata();
    const before = await capturePhysicalState(factory, name, storage);

    await runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'staged',
      nextStatus: 'activating',
    });

    expect(storage.getItem(KEY)).toBe(rawBefore);
    expect(await adapter.readActiveHistory()).toEqual(historyBefore);
    expect(await adapter.readMetadata()).toEqual(metadataBefore);
    const after = await capturePhysicalState(factory, name, storage);
    const changed = Object.keys(after.stores).filter((store) => (
      JSON.stringify(after.stores[store]) !== JSON.stringify(before.stores[store])
    ));
    expect(changed).toEqual([STORAGE_OPERATION_RECEIPTS_STORE]);
  });
});

describe('readVerifiedAdministrationGeneration', () => {
  it('lista todas as gerações reais via a primitiva do A1', async () => {
    const { runtime, adapter } = await createReadyHarness({ sessions: [makeSession(1)] });
    await adapter.prepareHistoryGeneration([makeSession(2)]);

    const snapshot = await runtime.inspectStorageAdministration();
    const direct = await adapter.listHistoryGenerations();
    expect(snapshot.generations.map((entry) => entry.generationId).sort())
      .toEqual(direct.map((entry) => entry.generationId).sort());
  });

  it('lê uma geração íntegra, newest-first, sem alterar nada', async () => {
    // `replaceHistory` grava `order` na ordem exata do array recebido — o
    // chamador é quem declara qual é a mais nova. Passar a mais nova primeiro
    // é o que a leitura verificada precisa preservar sem reordenar.
    const { runtime, generationId } = await createReadyHarness({ sessions: [makeSession(2), makeSession(1)] });

    const verified = await runtime.readVerifiedAdministrationGeneration(generationId);
    expect(verified.generationId).toBe(generationId);
    expect(verified.sessions.map((session) => session.id)).toEqual(['session-2', 'session-1']);
  });

  it('geração ausente falha em vez de devolver lista vazia', async () => {
    const { runtime } = await createReadyHarness();
    await expect(runtime.readVerifiedAdministrationGeneration('generation-inexistente'))
      .rejects.toThrow();
  });

  it('geração corrompida (manifest ausente) falha', async () => {
    const { runtime, factory, name, generationId } = await createReadyHarness({ sessions: [makeSession(1)] });
    await deleteManifest(factory, name, generationId);

    await expect(runtime.readVerifiedAdministrationGeneration(generationId)).rejects.toThrow();
  });

  it('uma operação interrompida não impede a leitura diagnóstica read-only', async () => {
    const { runtime, adapter, storage, factory, name, generationId } = await createReadyHarness({
      sessions: [makeSession(1)],
    });
    await adapter.createStorageOperationReceiptIfIdle({
      receipt: {
        operationId: 'operation-interrompida',
        kind: 'rollback',
        sourceDigest: null,
        previousCoreRaw: '{"placeholder":true}',
        previousGenerationId: generationId,
        stagedGenerationId: null,
        targetCoreRaw: null,
        status: 'staged',
        createdAt: '2026-07-24T12:15:00.000Z',
        updatedAt: '2026-07-24T12:15:00.000Z',
      },
      expectedActiveGenerationId: generationId,
    });
    const rawBefore = storage.getItem(KEY);
    const storesBefore = await readAllStores(factory, name);

    const verified = await runtime.readVerifiedAdministrationGeneration(generationId);
    expect(verified.sessions).toHaveLength(1);

    expect(storage.getItem(KEY)).toBe(rawBefore);
    const storesAfter = await readAllStores(factory, name);
    expect(JSON.stringify(storesAfter)).toBe(JSON.stringify(storesBefore));
  });
});

describe('regressões e ausência de call site real', () => {
  it('o schema do IndexedDB do A1 continua na v4', () => {
    expect(GYMFLOW_INDEXEDDB_VERSION).toBe(4);
  });

  it('o rollback físico do A1 continua acessível e correto no adapter de baixo nível', async () => {
    const { adapter, generationId } = await createReadyHarness({ sessions: [makeSession(1)] });
    const secondGeneration = await adapter.replaceHistory([makeSession(2), makeSession(3)]);

    const result = await adapter.rollbackToHistoryGeneration({
      targetGenerationId: generationId,
      expectedActiveGenerationId: secondGeneration,
    });
    expect(result.changed).toBe(true);
    expect((await adapter.readMetadata()).activeGeneration).toBe(generationId);
  });

  it('receipts administrativos e de conclusão continuam isolados sob a fachada', async () => {
    const { runtime, adapter, generationId } = await createReadyHarness();
    const operation = await runtime.beginStorageOperation(beginInput());
    await seedPendingCompletion(adapter, generationId);

    expect(await adapter.readStorageOperationReceipt(`receipt-session-90`)).toBeNull();
    expect((await adapter.readCompletionReceiptForSession('session-90'))?.receiptId)
      .toBe('receipt-session-90');
    expect((await adapter.readStorageOperationReceipt(operation.operationId))?.operationId)
      .toBe(operation.operationId);
  });

  it('runtime legado (v1) continua hidratando normalmente fora da fachada administrativa', async () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, v1Envelope(defaults([makeSession(1)])));
    const adapter = new IndexedDbWorkoutHistoryStorage({ factory: undefined });
    const hybrid = createHybridStorageRuntime({
      key: KEY,
      storage,
      adapter,
      defaults: defaults(),
    });
    const result = await hybrid.hydrate();
    expect(result.mode).toBe('legacy-v1');
  });
});

// As sete corrupções que a auditoria independente reproduziu contra o A2
// original, agora permanentes. Todas partem de uma geração ativa REAL e
// verificam que a corrupção física foi de fato aplicada antes de julgar —
// nenhuma pode passar pelo motivo errado.
describe('geração ativa fisicamente corrompida nunca é ready', () => {
  async function corruptibleHarness() {
    const harness = await createReadyHarness({ sessions: [makeSession(2), makeSession(1)] });
    const records = await readHistoryRecords(harness.factory, harness.name);
    const manifest = await readManifest(harness.factory, harness.name, harness.generationId);
    expect(records).toHaveLength(2);
    return { ...harness, records, manifest };
  }

  async function expectFailClosed(
    harness: Awaited<ReturnType<typeof corruptibleHarness>>,
    before: PhysicalState,
  ) {
    const snapshot = await harness.runtime.inspectStorageAdministration();
    // 1. nunca ready
    expect(snapshot.state.status).not.toBe('ready');
    expect(snapshot.state).toMatchObject({ status: 'conflicted', reason: 'active-generation-corrupt' });
    // 2. o motivo da reprovação é explícito, vindo da verificação integral
    expect(snapshot.activeGenerationIntegrity?.status).toBe('invalid');
    // 3. readVerified continua falhando
    await expect(harness.runtime.readVerifiedAdministrationGeneration(harness.generationId))
      .rejects.toThrow();
    // 4. begin nunca cria receipt
    await expect(harness.runtime.beginStorageOperation(beginInput())).rejects.toBeInstanceOf(
      StorageAdministrationConflictError,
    );
    expect(await harness.adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
    // 5. nenhuma mutação
    expectUnchanged(before, await capturePhysicalState(harness.factory, harness.name, harness.storage));
    return snapshot;
  }

  it('A. conteúdo da sessão alterado mantendo o digest persistido', async () => {
    const harness = await corruptibleHarness();
    const victim = harness.records.find((record) => record.sessionId === 'session-1') as RawHistoryRecord;
    await putHistoryRecord(harness.factory, harness.name, {
      ...victim,
      session: { ...victim.session, totalVolume: 999_999 },
    });
    const after = await readHistoryRecords(harness.factory, harness.name);
    expect(after.find((record) => record.sessionId === 'session-1')?.session.totalVolume).toBe(999_999);
    expect(after.find((record) => record.sessionId === 'session-1')?.digest).toBe(victim.digest);

    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    const snapshot = await expectFailClosed(harness, before);
    expect(snapshot.activeGenerationIntegrity).toMatchObject({ reason: 'record-digest-mismatch' });
  });

  it('B. somente o digest persistido alterado', async () => {
    const harness = await corruptibleHarness();
    const victim = harness.records.find((record) => record.sessionId === 'session-1') as RawHistoryRecord;
    await putHistoryRecord(harness.factory, harness.name, { ...victim, digest: 'sha256:0000000000000000' });
    const after = await readHistoryRecords(harness.factory, harness.name);
    expect(after.find((record) => record.sessionId === 'session-1')?.digest).toBe('sha256:0000000000000000');

    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    const snapshot = await expectFailClosed(harness, before);
    expect(snapshot.activeGenerationIntegrity).toMatchObject({ reason: 'record-digest-mismatch' });
  });

  it('C. ordem física trocada com manifest intacto', async () => {
    const harness = await corruptibleHarness();
    const first = harness.records.find((record) => record.sessionId === 'session-1') as RawHistoryRecord;
    const second = harness.records.find((record) => record.sessionId === 'session-2') as RawHistoryRecord;
    // Delete + re-add na mesma transação: o índice único por sessionId impede
    // um put direto com a ordem trocada.
    await withStore(harness.factory, harness.name, WORKOUT_HISTORY_STORE, 'readwrite', async (transaction) => {
      const store = transaction.objectStore(WORKOUT_HISTORY_STORE);
      await requestResult(store.delete([first.generationId, first.order]));
      await requestResult(store.delete([second.generationId, second.order]));
      await requestResult(store.put({ ...first, order: second.order }));
      await requestResult(store.put({ ...second, order: first.order }));
    });
    const after = await readHistoryRecords(harness.factory, harness.name);
    expect(after.find((record) => record.order === first.order)?.sessionId).toBe('session-2');

    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    const snapshot = await expectFailClosed(harness, before);
    expect(snapshot.activeGenerationIntegrity).toMatchObject({ reason: 'ordered-digest-mismatch' });
  });

  it('D. sessão removida: recordCount=1 contra manifestSessionCount=2', async () => {
    const harness = await corruptibleHarness();
    const victim = harness.records.find((record) => record.sessionId === 'session-1') as RawHistoryRecord;
    await withStore(harness.factory, harness.name, WORKOUT_HISTORY_STORE, 'readwrite', (transaction) => (
      requestResult(transaction.objectStore(WORKOUT_HISTORY_STORE).delete([victim.generationId, victim.order]))
    ));
    expect(await readHistoryRecords(harness.factory, harness.name)).toHaveLength(1);

    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    const snapshot = await expectFailClosed(harness, before);
    // O payload diagnóstico carrega a contradição explicitamente.
    const summary = snapshot.generations.find((entry) => entry.generationId === harness.generationId);
    expect(summary?.recordCount).toBe(1);
    expect(summary?.manifestSessionCount).toBe(2);
    expect(snapshot.activeGenerationIntegrity).toMatchObject({ reason: 'session-count-mismatch' });
  });

  it('E. sessão adicionada', async () => {
    const harness = await corruptibleHarness();
    const model = harness.records[0];
    await putHistoryRecord(harness.factory, harness.name, {
      ...model,
      sessionId: 'session-99',
      order: 99,
      session: makeSession(99),
    });
    expect(await readHistoryRecords(harness.factory, harness.name)).toHaveLength(3);

    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    const snapshot = await expectFailClosed(harness, before);
    expect(snapshot.activeGenerationIntegrity).toMatchObject({ reason: 'session-count-mismatch' });
  });

  it('F. orderedDigest incorreto com verified=true', async () => {
    const harness = await corruptibleHarness();
    await putManifest(harness.factory, harness.name, {
      ...harness.manifest,
      verified: true,
      orderedDigest: 'sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    });
    const stored = await readManifest(harness.factory, harness.name, harness.generationId);
    expect(stored.verified).toBe(true);
    expect(stored.orderedDigest).toContain('deadbeef');

    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    const snapshot = await expectFailClosed(harness, before);
    // A flag persistida continua visível no resumo — e continua não valendo nada.
    const summary = snapshot.generations.find((entry) => entry.generationId === harness.generationId);
    expect(summary?.verified).toBe(true);
    expect(snapshot.activeGenerationIntegrity).toMatchObject({ reason: 'ordered-digest-mismatch' });
  });

  it('G. verified=false com conteúdo aparentemente íntegro', async () => {
    const harness = await corruptibleHarness();
    await putManifest(harness.factory, harness.name, { ...harness.manifest, verified: false });

    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    const snapshot = await expectFailClosed(harness, before);
    // Manifest que nunca confirmou não é prova de nada: a verificação integral
    // recusa pelo mesmo motivo que a leitura verificada do A1.
    expect(snapshot.activeGenerationIntegrity).toMatchObject({ reason: 'manifest-unverified' });
  });

  it('manifest ausente e geração ativa inexistente também são conflicted', async () => {
    const semManifest = await corruptibleHarness();
    await deleteManifest(semManifest.factory, semManifest.name, semManifest.generationId);
    const s1 = await semManifest.runtime.inspectStorageAdministration();
    expect(s1.state).toMatchObject({ status: 'conflicted', reason: 'active-generation-corrupt' });
    expect(s1.activeGenerationIntegrity).toMatchObject({ reason: 'manifest-absent' });

    const fantasma = await corruptibleHarness();
    await putRawMetadata(fantasma.factory, fantasma.name, 'activeGeneration', 'generation-inexistente');
    const s2 = await fantasma.runtime.inspectStorageAdministration();
    expect(s2.state).toMatchObject({ status: 'conflicted', reason: 'active-generation-corrupt' });
    expect(s2.activeGenerationIntegrity).toMatchObject({ reason: 'generation-absent' });
  });

  it('a geração íntegra continua ready (controle da suíte de corrupção)', async () => {
    const harness = await corruptibleHarness();
    const snapshot = await harness.runtime.inspectStorageAdministration();
    expect(snapshot.state).toEqual({ status: 'ready' });
    expect(snapshot.activeGenerationIntegrity?.status).toBe('verified');
  });
});

// Fault injection real entre as duas leituras atômicas do diagnóstico. Em todos
// os casos a mutação acontece de verdade, com o adapter físico, dentro da janela
// — nenhuma resposta final é simulada.
describe('snapshot instável nunca vira ready', () => {
  async function inspectWithMutationInWindow(
    harness: Awaited<ReturnType<typeof createReadyHarness>>,
    mutate: () => Promise<void>,
  ) {
    // A primeira chamada é o snapshot A do inspect; a mutação roda logo depois
    // dele e antes do snapshot B.
    const racing = afterCall(harness.adapter, 'readStorageAdministrationSnapshot', 1, mutate);
    const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter: racing });
    return runtime.inspectStorageAdministration();
  }

  // Escrita CONTÍNUA: cada leitura atômica encontra um estado diferente, então
  // as duas tentativas do protocolo divergem e o diagnóstico continua
  // fail-closed em vez de escolher uma delas.
  function inspectUnderContinuousChurn(
    harness: Awaited<ReturnType<typeof createReadyHarness>>,
    mutate: (round: number) => Promise<void>,
  ) {
    let round = 0;
    const racing = new Proxy(harness.adapter, {
      get(object, prop, receiver) {
        const value = Reflect.get(object, prop, receiver);
        if (prop !== 'readStorageAdministrationSnapshot' || typeof value !== 'function') {
          return typeof value === 'function' ? value.bind(object) : value;
        }
        return async () => {
          const result = await (value as () => Promise<unknown>).call(object);
          round += 1;
          await mutate(round);
          return result;
        };
      },
    });
    const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter: racing });
    return runtime.inspectStorageAdministration();
  }

  it.each([
    ['admin receipts nascendo sem parar', async (h: Awaited<ReturnType<typeof createReadyHarness>>, round: number) => {
      await h.adapter.putStorageOperationReceipt(coherentReceipt(h, { operationId: `operation-${round}` }));
    }],
    ['migrationGeneration mudando sem parar', async (h: Awaited<ReturnType<typeof createReadyHarness>>, round: number) => {
      await putRawMetadata(h.factory, h.name, 'migrationGeneration', `generation-staged-${round}`);
    }],
    ['manifest mudando sem parar', async (h: Awaited<ReturnType<typeof createReadyHarness>>, round: number) => {
      const manifest = await readManifest(h.factory, h.name, h.generationId);
      await putManifest(h.factory, h.name, { ...manifest, updatedAt: `2030-01-0${round}T00:00:00.000Z` });
    }],
    ['sessão mudando sem parar', async (h: Awaited<ReturnType<typeof createReadyHarness>>, round: number) => {
      const records = await readHistoryRecords(h.factory, h.name);
      const victim = records[0];
      await putHistoryRecord(h.factory, h.name, {
        ...victim,
        session: { ...victim.session, totalVolume: 100_000 + round },
      });
    }],
  ])('%s → conflicted (administration-snapshot-unstable), nunca ready', async (_label, mutate) => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const snapshot = await inspectUnderContinuousChurn(harness, (round) => mutate(harness, round));

    expect(snapshot.state.status).not.toBe('ready');
    expect(snapshot.state).toMatchObject({ status: 'conflicted', reason: 'administration-snapshot-unstable' });
  });

  it('core raw mudando sem parar → conflicted (core-changed-during-inspection), nunca ready', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = harness.storage.getItem(KEY) as string;

    const snapshot = await inspectUnderContinuousChurn(harness, async (round) => {
      harness.storage.setItem(KEY, JSON.stringify({
        ...JSON.parse(raw),
        savedAt: `2030-01-0${round}T00:00:00.000Z`,
      }));
    });

    expect(snapshot.state.status).not.toBe('ready');
    expect(snapshot.state).toMatchObject({ status: 'conflicted', reason: 'core-changed-during-inspection' });
  });

  // Blip único: a segunda tentativa observa um estado já estável. O diagnóstico
  // pode concluir — mas tem de concluir sobre o estado NOVO, inteiro, nunca
  // misturando o momento anterior com o posterior nem devolvendo `ready` sobre
  // um mundo que mudou.
  it.each([
    ['admin receipt criado', 'interrupted', async (h: Awaited<ReturnType<typeof createReadyHarness>>) => {
      await h.adapter.putStorageOperationReceipt(coherentReceipt(h, { operationId: 'operation-na-janela' }));
    }],
    ['CompletionReceipt criado', 'conflicted', async (h: Awaited<ReturnType<typeof createReadyHarness>>) => {
      await seedPendingCompletion(h.adapter, h.generationId);
    }],
    ['activeGeneration alterada', 'conflicted', async (h: Awaited<ReturnType<typeof createReadyHarness>>) => {
      await putRawMetadata(h.factory, h.name, 'activeGeneration', 'generation-outra');
    }],
    ['migrationGeneration alterada', 'conflicted', async (h: Awaited<ReturnType<typeof createReadyHarness>>) => {
      await putRawMetadata(h.factory, h.name, 'migrationGeneration', 'generation-staged');
    }],
    ['sessão alterada', 'conflicted', async (h: Awaited<ReturnType<typeof createReadyHarness>>) => {
      const records = await readHistoryRecords(h.factory, h.name);
      const victim = records[0];
      await putHistoryRecord(h.factory, h.name, {
        ...victim,
        session: { ...victim.session, totalVolume: 123_456 },
      });
    }],
    ['dois receipts criados', 'conflicted', async (h: Awaited<ReturnType<typeof createReadyHarness>>) => {
      await h.adapter.putStorageOperationReceipt(coherentReceipt(h, { operationId: 'operation-a' }));
      await h.adapter.putStorageOperationReceipt(coherentReceipt(h, { operationId: 'operation-b' }));
    }],
  ])('%s numa janela isolada → %s na releitura, nunca ready', async (_label, expected, mutate) => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const snapshot = await inspectWithMutationInWindow(harness, () => mutate(harness));

    expect(snapshot.state.status).not.toBe('ready');
    expect(snapshot.state.status).toBe(expected);
  });

  it('receipt liquidado numa janela isolada → o estado novo, nunca uma mistura', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await harness.adapter.putStorageOperationReceipt(coherentReceipt(harness, { operationId: 'operation-liquidada' }));

    const snapshot = await inspectWithMutationInWindow(harness, async () => {
      await harness.adapter.transitionStorageOperationReceipt('operation-liquidada', 'staged', 'reverted');
    });
    // Depois de liquidada não há operação em aberto: `ready` aqui descreve o
    // estado real e inteiro, e o snapshot não continua exibindo a operação.
    expect(snapshot.state).toEqual({ status: 'ready' });
    expect(snapshot.unsettledOperations).toEqual([]);
  });

  it('core raw alterado numa janela isolada → o snapshot descreve o core NOVO', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = harness.storage.getItem(KEY) as string;
    const mutated = JSON.stringify({ ...JSON.parse(raw), savedAt: '2030-01-01T00:00:00.000Z' });

    const snapshot = await inspectWithMutationInWindow(harness, async () => {
      harness.storage.setItem(KEY, mutated);
    });
    // Nenhuma mistura: o core observado é o novo, não o de antes da janela.
    expect(snapshot.coreRawObserved).toBe(mutated);
    expect(snapshot.coreRawObserved).not.toBe(raw);
  });

  it('mutação que acontece DEPOIS da leitura final não contamina o snapshot já devolvido', async () => {
    // O contrato documentado: o snapshot descreve a janela estável observada.
    // Uma escrita iniciada depois dela aparece no PRÓXIMO inspect.
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const primeiro = await harness.runtime.inspectStorageAdministration();
    expect(primeiro.state).toEqual({ status: 'ready' });

    await harness.adapter.putStorageOperationReceipt(coherentReceipt(harness, { operationId: 'operation-depois' }));

    const segundo = await harness.runtime.inspectStorageAdministration();
    expect(segundo.state.status).toBe('interrupted');
    expect(primeiro.administrationFingerprint).not.toBe(segundo.administrationFingerprint);
  });
});

describe('transição só em estado inequívoco', () => {
  async function expectRefusedTransition(
    harness: Awaited<ReturnType<typeof createReadyHarness>>,
    operationId: string,
    expectedStatus: 'staged' | 'activating',
  ) {
    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    const statusBefore = (await harness.adapter.readStorageOperationReceipt(operationId))?.status ?? null;

    const error = await harness.runtime.transitionStorageOperation({
      operationId,
      expectedStatus,
      nextStatus: 'activating',
    }).then(() => null, (caught: unknown) => caught);

    expect(error).not.toBeNull();
    // O status do receipt não mudou e nada foi escrito.
    expect((await harness.adapter.readStorageOperationReceipt(operationId))?.status ?? null).toBe(statusBefore);
    expectUnchanged(before, await capturePhysicalState(harness.factory, harness.name, harness.storage));
    return error as Error;
  }

  it('dois admin receipts não terminais', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await harness.adapter.putStorageOperationReceipt(coherentReceipt(harness, { operationId: 'operation-a' }));
    await harness.adapter.putStorageOperationReceipt(coherentReceipt(harness, { operationId: 'operation-b' }));

    const error = await expectRefusedTransition(harness, 'operation-a', 'staged');
    expect(error).toBeInstanceOf(StorageAdministrationConflictError);
    expect((error as StorageAdministrationConflictError).reason).toBe('multiple-unsettled-operations');
  });

  it('admin receipt + CompletionReceipt pendente', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const receipt = await harness.runtime.beginStorageOperation(beginInput());
    await seedPendingCompletion(harness.adapter, harness.generationId);

    const error = await expectRefusedTransition(harness, receipt.operationId, 'staged');
    expect(error).toBeInstanceOf(StorageAdministrationConflictError);
    expect((error as StorageAdministrationConflictError).reason).toBe('completion-pending-with-operation');
  });

  it('receipt malformado coexistente', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const receipt = await harness.runtime.beginStorageOperation(beginInput());
    await putRawOperationReceipt(harness.factory, harness.name, { operationId: 'operation-torto', kind: 'import' });

    const error = await expectRefusedTransition(harness, receipt.operationId, 'staged');
    expect(error).toBeInstanceOf(StorageAdministrationConflictError);
    expect((error as StorageAdministrationConflictError).reason).toBe('malformed-operation-receipt');
  });

  it('core v2 ausente', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const receipt = await harness.runtime.beginStorageOperation(beginInput());
    harness.storage.removeItem(KEY);

    const error = await expectRefusedTransition(harness, receipt.operationId, 'staged');
    expect(error).toBeInstanceOf(StorageAdministrationUnavailableError);
    expect((error as StorageAdministrationUnavailableError).reason).toBe('not-hybrid');
  });

  it('core v2 inválido', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const receipt = await harness.runtime.beginStorageOperation(beginInput());
    harness.storage.setItem(KEY, `{"v":${HYBRID_STORAGE_VERSION},"corrompido":true`);

    const error = await expectRefusedTransition(harness, receipt.operationId, 'staged');
    expect(error).toBeInstanceOf(StorageAdministrationUnavailableError);
    expect((error as StorageAdministrationUnavailableError).reason).toBe('core-invalid');
  });

  it('runtime legado (v1)', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const receipt = await harness.runtime.beginStorageOperation(beginInput());
    harness.storage.setItem(KEY, v1Envelope(defaults()));

    const error = await expectRefusedTransition(harness, receipt.operationId, 'staged');
    expect(error).toBeInstanceOf(StorageAdministrationUnavailableError);
    expect((error as StorageAdministrationUnavailableError).reason).toBe('not-hybrid');
  });

  it('metadata malformada', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const receipt = await harness.runtime.beginStorageOperation(beginInput());
    await withStore(harness.factory, harness.name, METADATA_STORE, 'readwrite', (transaction) => (
      requestResult(transaction.objectStore(METADATA_STORE).put({ key: 42, value: 'lixo' } as never))
    ));

    const error = await expectRefusedTransition(harness, receipt.operationId, 'staged');
    expect(error).toBeInstanceOf(StorageAdministrationConflictError);
    expect((error as StorageAdministrationConflictError).reason).toBe('metadata-malformed');
  });

  it('staging incompatível com o receipt', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const receipt = await harness.runtime.beginStorageOperation(beginInput());
    await putRawMetadata(harness.factory, harness.name, 'migrationGeneration', 'generation-orfa');

    const error = await expectRefusedTransition(harness, receipt.operationId, 'staged');
    expect(error).toBeInstanceOf(StorageAdministrationConflictError);
    expect((error as StorageAdministrationConflictError).reason).toBe('staging-without-receipt');
  });

  it('receipt incompatível com o core observado', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await harness.adapter.putStorageOperationReceipt(coherentReceipt(harness, {
      operationId: 'operation-core-antigo',
      previousCoreRaw: '{"core":"de outro momento"}',
    }));

    const error = await expectRefusedTransition(harness, 'operation-core-antigo', 'staged');
    expect(error).toBeInstanceOf(StorageAdministrationConflictError);
    expect((error as StorageAdministrationConflictError).reason).toBe('operation-incompatible');
    expect(error.message).toContain('core-not-previous');
  });

  it('receipt cuja geração anterior não existe mais', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await harness.adapter.putStorageOperationReceipt(coherentReceipt(harness, {
      operationId: 'operation-geracao-fantasma',
      previousGenerationId: 'generation-que-nunca-existiu',
    }));

    const error = await expectRefusedTransition(harness, 'operation-geracao-fantasma', 'staged');
    expect(error).toBeInstanceOf(StorageAdministrationConflictError);
    expect(error.message).toContain('previous-generation-absent');
  });

  it('activated sem efeitos comprovados', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await harness.adapter.putStorageOperationReceipt(coherentReceipt(harness, {
      operationId: 'operation-activated',
      status: 'activated',
    }));

    const error = await expectRefusedTransition(harness, 'operation-activated', 'activating');
    expect(error).toBeInstanceOf(StorageAdministrationConflictError);
    expect(error.message).toContain('activated-target-missing');
  });

  it('a primitiva atômica do adapter também recusa sozinha quando o estado é ambíguo', async () => {
    // Mesmo chamada diretamente, sem passar pela fachada, ela nunca escolhe um
    // receipt: é a defesa contra a corrida entre diagnóstico e escrita.
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await harness.adapter.putStorageOperationReceipt(coherentReceipt(harness, { operationId: 'operation-a' }));
    await harness.adapter.putStorageOperationReceipt(coherentReceipt(harness, { operationId: 'operation-b' }));

    const error = await harness.adapter.transitionStorageOperationIfUnambiguous({
      operationId: 'operation-a',
      expectedStatus: 'staged',
      nextStatus: 'activating',
      expectedActiveGenerationId: harness.generationId,
    }).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageOperationAmbiguousStateError);
    expect((error as StorageOperationAmbiguousStateError).reason).toBe('multiple-unsettled-operations');
    expect([...(error as StorageOperationAmbiguousStateError).unsettledOperationIds].sort())
      .toEqual(['operation-a', 'operation-b']);
    expect((await harness.adapter.readStorageOperationReceipt('operation-a'))?.status).toBe('staged');
  });

  it('a primitiva atômica recusa quando surge conclusão pendente', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const receipt = await harness.runtime.beginStorageOperation(beginInput());
    await seedPendingCompletion(harness.adapter, harness.generationId);

    const error = await harness.adapter.transitionStorageOperationIfUnambiguous({
      operationId: receipt.operationId,
      expectedStatus: 'staged',
      nextStatus: 'activating',
      expectedActiveGenerationId: harness.generationId,
    }).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageCompletionPendingError);
    expect((await harness.adapter.readStorageOperationReceipt(receipt.operationId))?.status).toBe('staged');
  });
});

describe('compensação honesta do begin', () => {
  // Corrida real (a geração ativa muda depois da criação) somada a uma falha
  // real da compensação. O begin não pode afirmar que reverteu o que não
  // reverteu.
  async function beginWithBrokenCompensation(options: {
    breakWith: () => Error;
    breakRead?: boolean;
  }) {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const other = await harness.adapter.prepareHistoryGeneration([makeSession(2)]);
    await putRawMetadata(harness.factory, harness.name, 'migrationGeneration', null);

    const racing = afterCall(harness.adapter, 'createStorageOperationReceiptIfIdle', 1, async () => {
      await putRawMetadata(harness.factory, harness.name, 'activeGeneration', other);
    });
    let broken = breakMethod(racing, 'transitionStorageOperationReceipt', options.breakWith);
    if (options.breakRead) {
      broken = breakMethod(broken, 'readStorageOperationReceipt', () => new Error('store de receipts ilegível'));
    }
    const runtime = createStorageAdminRuntime({
      key: KEY,
      storage: harness.storage,
      adapter: broken,
      now: () => new Date('2026-07-24T13:00:00.000Z'),
      idFactory: () => 'operation-compensacao',
    });

    const error = await runtime.beginStorageOperation(beginInput())
      .then(() => null, (caught: unknown) => caught) as StorageOperationBeginConflictError | null;
    return { harness, error };
  }

  it('compensação bem-sucedida é relatada como reverted, com a causa do conflito', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const other = await harness.adapter.prepareHistoryGeneration([makeSession(2)]);
    await putRawMetadata(harness.factory, harness.name, 'migrationGeneration', null);
    const racing = afterCall(harness.adapter, 'createStorageOperationReceiptIfIdle', 1, async () => {
      await putRawMetadata(harness.factory, harness.name, 'activeGeneration', other);
    });
    const runtime = createStorageAdminRuntime({
      key: KEY, storage: harness.storage, adapter: racing, idFactory: () => 'operation-ok',
    });

    const error = await runtime.beginStorageOperation(beginInput())
      .then(() => null, (caught: unknown) => caught) as StorageOperationBeginConflictError;
    expect(error).toBeInstanceOf(StorageOperationBeginConflictError);
    expect(error.compensation).toBe('reverted');
    expect(error.finalReceiptStatus).toBe('reverted');
    expect(error.compensationCause).toBeUndefined();
    expect(error.message).toContain('revertido');
    expect((await harness.adapter.readStorageOperationReceipt('operation-ok'))?.status).toBe('reverted');
    expect(await harness.adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
  });

  it('compensação que falha NÃO é relatada como reverted e preserva a causa', async () => {
    const { harness, error } = await beginWithBrokenCompensation({
      breakWith: () => new Error('IndexedDB caiu durante a compensação'),
    });
    expect(error).toBeInstanceOf(StorageOperationBeginConflictError);
    const conflict = error as StorageOperationBeginConflictError;
    expect(conflict.operationId).toBe('operation-compensacao');
    expect(conflict.compensation).toBe('failed');
    expect(conflict.message).not.toContain('foi revertido');
    expect(conflict.message).toContain('FALHOU');
    expect((conflict.compensationCause as Error).message).toBe('IndexedDB caiu durante a compensação');
    // O status remanescente é lido e relatado honestamente.
    expect(conflict.finalReceiptStatus).toBe('staged');

    // O receipt não foi apagado nem sobrescrito à força: ele continua lá e
    // reaparece no próximo diagnóstico.
    const remaining = await harness.adapter.readStorageOperationReceipt('operation-compensacao');
    expect(remaining?.status).toBe('staged');
    const snapshot = await harness.runtime.inspectStorageAdministration();
    expect(['interrupted', 'conflicted']).toContain(snapshot.state.status);
  });

  it('falha da compensação POR CAS (status já mudou) é reportada com o status real', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const other = await harness.adapter.prepareHistoryGeneration([makeSession(2)]);
    await putRawMetadata(harness.factory, harness.name, 'migrationGeneration', null);
    const racing = afterCall(harness.adapter, 'createStorageOperationReceiptIfIdle', 1, async () => {
      await putRawMetadata(harness.factory, harness.name, 'activeGeneration', other);
      // Outro ator avança o receipt antes de a compensação tentar staged → reverted.
      await harness.adapter.transitionStorageOperationReceipt('operation-cas', 'staged', 'activating');
    });
    const runtime = createStorageAdminRuntime({
      key: KEY, storage: harness.storage, adapter: racing, idFactory: () => 'operation-cas',
    });

    const error = await runtime.beginStorageOperation(beginInput())
      .then(() => null, (caught: unknown) => caught) as StorageOperationBeginConflictError;
    expect(error.compensation).toBe('failed');
    expect(error.compensationCause).toBeInstanceOf(StorageOperationTransitionError);
    expect(error.finalReceiptStatus).toBe('activating');
    expect((await harness.adapter.readStorageOperationReceipt('operation-cas'))?.status).toBe('activating');
  });

  // Corretivo 038: a causa da falha ao RELER o status final era capturada numa
  // variável e descartada. Agora ela viaja em `finalStatusReadCause`, aparece na
  // mensagem e o status final é `unknown` (não `null`, que se confundia com
  // "receipt ausente").
  it('falha da compensação + falha ao reler o status final → unknown com a readCause acessível', async () => {
    const { error } = await beginWithBrokenCompensation({
      breakWith: () => new Error('transação abortada'),
      breakRead: true,
    });
    const conflict = error as StorageOperationBeginConflictError;
    expect(conflict).toBeInstanceOf(StorageOperationBeginConflictError);
    expect(conflict.compensation).toBe('failed');
    expect(conflict.finalReceiptStatus).toBe('unknown');
    expect(conflict.message).toContain('desconhecido');
    expect(conflict.message).not.toContain('foi revertido');
    expect((conflict.compensationCause as Error).message).toBe('transação abortada');
    expect((conflict.finalStatusReadCause as Error).message).toBe('store de receipts ilegível');
    expect(conflict.message).toContain('store de receipts ilegível');
  });

  it('receipt que desaparece durante a compensação é relatado como missing, não como unknown', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const racing = afterCall(harness.adapter, 'createStorageOperationReceiptIfIdle', 1, async () => {
      await withStore(
        harness.factory,
        harness.name,
        STORAGE_OPERATION_RECEIPTS_STORE,
        'readwrite',
        (transaction) => requestResult(transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE).clear()),
      );
    });
    const runtime = createStorageAdminRuntime({
      key: KEY, storage: harness.storage, adapter: racing, idFactory: () => 'operation-sumida',
    });

    const error = await runtime.beginStorageOperation(beginInput())
      .then(() => null, (caught: unknown) => caught) as StorageOperationBeginConflictError;
    expect(error).toBeInstanceOf(StorageOperationBeginConflictError);
    expect(error.compensation).toBe('failed');
    expect(error.finalReceiptStatus).toBe('missing');
    expect(error.finalStatusReadCause).toBeNull();
  });

  it('nenhuma compensação altera core, histórico ou metadata além do receipt', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const historyBefore = await harness.adapter.readActiveHistory();
    const rawBefore = harness.storage.getItem(KEY);
    const other = await harness.adapter.prepareHistoryGeneration([makeSession(2)]);
    await putRawMetadata(harness.factory, harness.name, 'migrationGeneration', null);
    const racing = afterCall(harness.adapter, 'createStorageOperationReceiptIfIdle', 1, async () => {
      await putRawMetadata(harness.factory, harness.name, 'activeGeneration', other);
    });
    const runtime = createStorageAdminRuntime({
      key: KEY, storage: harness.storage, adapter: racing, idFactory: () => 'operation-inv',
    });

    await runtime.beginStorageOperation(beginInput()).catch(() => undefined);

    expect(harness.storage.getItem(KEY)).toBe(rawBefore);
    expect(await harness.adapter.readHistoryGeneration(harness.generationId)).toEqual(historyBefore);
  });
});

describe('entrada, erros de domínio e causes', () => {
  it('stagedGenerationId e targetCoreRaw precisam ser null no A2', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);

    const staged = await harness.runtime.beginStorageOperation(
      beginInput({ stagedGenerationId: 'generation-x' }),
    ).then(() => null, (caught: unknown) => caught);
    expect(staged).toBeInstanceOf(StorageAdministrationInputError);
    expect((staged as StorageAdministrationInputError).field).toBe('stagedGenerationId');

    const target = await harness.runtime.beginStorageOperation(
      beginInput({ targetCoreRaw: '{"core":"alvo"}' }),
    ).then(() => null, (caught: unknown) => caught);
    expect(target).toBeInstanceOf(StorageAdministrationInputError);
    expect((target as StorageAdministrationInputError).field).toBe('targetCoreRaw');

    // Recusa antes de qualquer escrita.
    expect(await harness.adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
    expectUnchanged(before, await capturePhysicalState(harness.factory, harness.name, harness.storage));
  });

  it('now() inválido vira erro de domínio com o RangeError preservado em cause', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)], now: () => new Date(NaN) });
    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);

    const error = await harness.runtime.beginStorageOperation(beginInput())
      .then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageAdministrationInputError);
    expect(error).not.toBeInstanceOf(RangeError);
    expect((error as StorageAdministrationInputError).field).toBe('now');
    expect((error as StorageAdministrationInputError).cause).toBeInstanceOf(RangeError);
    expect(await harness.adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
    expectUnchanged(before, await capturePhysicalState(harness.factory, harness.name, harness.storage));
  });

  it('idFactory vazio vira erro de domínio antes de qualquer escrita', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)], idFactory: () => '' });
    const error = await harness.runtime.beginStorageOperation(beginInput())
      .then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageAdministrationInputError);
    expect((error as StorageAdministrationInputError).field).toBe('operationId');
    expect(await harness.adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
  });

  it('geração ativa corrompida no begin encapsula a causa original', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await deleteManifest(harness.factory, harness.name, harness.generationId);
    const error = await harness.runtime.beginStorageOperation(beginInput())
      .then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageAdministrationConflictError);
    expect((error as StorageAdministrationConflictError).reason).toBe('active-generation-corrupt');
  });

  it('storage bloqueado preserva a causa original', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raiz = new Error('localStorage negou acesso');
    const explosive = {
      getItem() { throw raiz; },
      setItem() {},
      removeItem() {},
    };
    const runtime = createStorageAdminRuntime({ key: KEY, storage: explosive, adapter: harness.adapter });

    const snapshot = await runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({ status: 'unavailable', reason: 'storage-blocked' });

    const error = await runtime.beginStorageOperation(beginInput())
      .then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageAdministrationUnavailableError);
    expect((error as StorageAdministrationUnavailableError).reason).toBe('storage-blocked');
    expect((error as StorageAdministrationUnavailableError).cause).toBe(raiz);
  });

  it('os erros de domínio têm instanceof estável e não são TypeError', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await harness.runtime.beginStorageOperation(beginInput());
    const error = await harness.runtime.beginStorageOperation(beginInput({ kind: 'reset' }))
      .then(() => null, (caught: unknown) => caught);

    expect(error).toBeInstanceOf(StorageOperationAlreadyInProgressError);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TypeError);
    expect((error as Error).name).toBe('StorageOperationAlreadyInProgressError');
    expect((error as StorageOperationAlreadyInProgressError).existing.operationId).toBe('operation-test-1');
  });

  it('falha ao ler CompletionReceipts nunca vira contagem zero', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const broken = breakMethod(
      harness.adapter,
      'readStorageAdministrationSnapshot',
      () => new Error('store de conclusão ilegível'),
    );
    const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter: broken });

    const snapshot = await runtime.inspectStorageAdministration();
    expect(snapshot.state.status).not.toBe('ready');
    expect(snapshot.state).toMatchObject({ status: 'unavailable', reason: 'indexeddb-unavailable' });
    await expect(runtime.beginStorageOperation(beginInput())).rejects.toBeInstanceOf(
      StorageAdministrationUnavailableError,
    );
  });

  it('CompletionReceipt malformado é conflito explícito, nunca "zero pendentes"', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await withStore(harness.factory, harness.name, COMPLETION_RECEIPTS_STORE, 'readwrite', (transaction) => (
      requestResult(transaction.objectStore(COMPLETION_RECEIPTS_STORE).put({ receiptId: 'torto' } as never))
    ));

    const snapshot = await harness.runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({ status: 'conflicted', reason: 'malformed-completion-receipt' });
    await expect(harness.runtime.beginStorageOperation(beginInput())).rejects.toBeInstanceOf(
      StorageAdministrationConflictError,
    );
    expect(await harness.adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
  });
});

describe('leitura verificada fail-closed', () => {
  it('bloqueia quando o conflito impede confiar na identificação da geração', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await withStore(harness.factory, harness.name, METADATA_STORE, 'readwrite', (transaction) => (
      requestResult(transaction.objectStore(METADATA_STORE).put({ key: 7, value: 'lixo' } as never))
    ));

    const error = await harness.runtime.readVerifiedAdministrationGeneration(harness.generationId)
      .then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageAdministrationConflictError);
    expect((error as StorageAdministrationConflictError).reason).toBe('metadata-malformed');
  });

  it('bloqueia enquanto o armazenamento não estabiliza', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    let round = 0;
    const racing = new Proxy(harness.adapter, {
      get(object, prop, receiver) {
        const value = Reflect.get(object, prop, receiver);
        if (prop !== 'readStorageAdministrationSnapshot' || typeof value !== 'function') {
          return typeof value === 'function' ? value.bind(object) : value;
        }
        return async () => {
          const result = await (value as () => Promise<unknown>).call(object);
          round += 1;
          await putRawMetadata(harness.factory, harness.name, 'migrationGeneration', `generation-movendo-${round}`);
          return result;
        };
      },
    });
    const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter: racing });

    const error = await runtime.readVerifiedAdministrationGeneration(harness.generationId)
      .then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageAdministrationConflictError);
    expect((error as StorageAdministrationConflictError).reason).toBe('administration-snapshot-unstable');
  });

  it('permite a leitura diagnóstica quando o conflito não afeta a geração pedida', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(2), makeSession(1)] });
    await harness.adapter.putStorageOperationReceipt(coherentReceipt(harness, { operationId: 'operation-a' }));
    await harness.adapter.putStorageOperationReceipt(coherentReceipt(harness, { operationId: 'operation-b' }));
    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);

    const verified = await harness.runtime.readVerifiedAdministrationGeneration(harness.generationId);
    expect(verified.sessions.map((session) => session.id)).toEqual(['session-2', 'session-1']);
    expectUnchanged(before, await capturePhysicalState(harness.factory, harness.name, harness.storage));
  });

  it('generationId vazio é erro de domínio, não TypeError', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const error = await harness.runtime.readVerifiedAdministrationGeneration('')
      .then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageAdministrationInputError);
    expect((error as StorageAdministrationInputError).field).toBe('generationId');
  });

  it('devolve cópia defensiva: mutar o retorno não afeta a próxima leitura', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(2), makeSession(1)] });
    const first = await harness.runtime.readVerifiedAdministrationGeneration(harness.generationId);
    first.sessions.pop();
    first.manifest.sessionCount = 999;

    const second = await harness.runtime.readVerifiedAdministrationGeneration(harness.generationId);
    expect(second.sessions).toHaveLength(2);
    expect(second.manifest.sessionCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Corretivo 038 — o core v2 vive no localStorage e NÃO participa da transação
// IndexedDB. A proteção é um protocolo explícito de leitura antes + leitura
// depois + compensação, nunca uma promessa de atomicidade única entre os dois.
// ---------------------------------------------------------------------------
describe('transição protegida contra core obsoleto (corretivo 038)', () => {
  async function begunHarness() {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const receipt = await harness.runtime.beginStorageOperation(beginInput());
    return { ...harness, receipt };
  }

  function mutatedCore(storage: MemoryStorage, marker: string): string {
    const raw = storage.getItem(KEY) as string;
    return JSON.stringify({ ...JSON.parse(raw), savedAt: marker });
  }

  // Janela determinística ENTRE o inspect e a releitura pré-transação. Um
  // `inspect` faz exatamente quatro leituras do core (classificação do envelope
  // + as três do double-read); a quinta é a releitura pré-transação. Trocar o
  // core logo depois da quarta coloca o escritor externo exatamente na janela
  // que o corretivo 038 fecha — sem timer, sem threshold.
  const READS_PER_INSPECT = 4;

  function storageMutatingAfterInspect(
    storage: MemoryStorage,
    mutate: (storage: MemoryStorage) => void,
  ): StorageLike {
    let reads = 0;
    return {
      getItem(key: string): string | null {
        const value = storage.getItem(key);
        reads += 1;
        if (reads === READS_PER_INSPECT) mutate(storage);
        return value;
      },
      setItem(key: string, value: string): void {
        storage.setItem(key, value);
      },
      removeItem(key: string): void {
        storage.removeItem(key);
      },
    };
  }

  // Janela determinística: a chamada já abriu a transação de forma síncrona e a
  // mutação acontece enquanto ela está em andamento, antes do commit.
  function racingDuringTransaction<T extends object>(adapter: T, mutate: () => void): T {
    return new Proxy(adapter, {
      get(object, prop, receiver) {
        const value = Reflect.get(object, prop, receiver);
        if (prop !== 'transitionStorageOperationIfUnambiguous' || typeof value !== 'function') {
          return typeof value === 'function' ? value.bind(object) : value;
        }
        return (...args: unknown[]) => {
          const running = (value as (...a: unknown[]) => Promise<unknown>).apply(object, args);
          mutate();
          return running;
        };
      },
    }) as T;
  }

  it('A. core diverge ANTES da transação: nada avança e o receipt termina reverted', async () => {
    const harness = await begunHarness();
    const alvo = mutatedCore(harness.storage, '2030-01-01T00:00:00.000Z');
    const storage = storageMutatingAfterInspect(harness.storage, (real) => real.setItem(KEY, alvo));
    const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter: harness.adapter });

    const error = await runtime.transitionStorageOperation({
      operationId: harness.receipt.operationId,
      expectedStatus: 'staged',
      nextStatus: 'activating',
    }).then(() => null, (caught: unknown) => caught) as StorageOperationTransitionConflictError;

    expect(error).toBeInstanceOf(StorageOperationTransitionConflictError);
    expect(error.phase).toBe('pre-transition');
    expect(error.reason).toBe('core-changed-before-transition');
    expect(error.expectedStatus).toBe('staged');
    expect(error.attemptedStatus).toBe('activating');
    expect(error.compensation).toBe('reverted');
    expect(error.finalReceiptStatus).toBe('reverted');
    // O receipt nunca chegou a `activating`.
    const final = await harness.adapter.readStorageOperationReceipt(harness.receipt.operationId);
    expect(final?.status).toBe('reverted');
    // O core externo fica exatamente como o outro escritor deixou.
    expect(harness.storage.getItem(KEY)).toBe(alvo);
  });

  it('B. core diverge DURANTE a transação: detectado no pós-commit e revertido', async () => {
    const harness = await begunHarness();
    const alvo = mutatedCore(harness.storage, '2030-02-02T00:00:00.000Z');
    const racing = racingDuringTransaction(harness.adapter, () => harness.storage.setItem(KEY, alvo));
    const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter: racing });

    const error = await runtime.transitionStorageOperation({
      operationId: harness.receipt.operationId,
      expectedStatus: 'staged',
      nextStatus: 'activating',
    }).then(() => null, (caught: unknown) => caught) as StorageOperationTransitionConflictError;

    expect(error).toBeInstanceOf(StorageOperationTransitionConflictError);
    expect(error.phase).toBe('post-transition');
    expect(error.reason).toBe('core-changed-during-transition');
    expect(error.compensation).toBe('reverted');
    expect(error.finalReceiptStatus).toBe('reverted');
    expect((await harness.adapter.readStorageOperationReceipt(harness.receipt.operationId))?.status)
      .toBe('reverted');
    expect(harness.storage.getItem(KEY)).toBe(alvo);
  });

  it('C. core diverge depois do COMMIT e antes do readback: nunca vira sucesso', async () => {
    const harness = await begunHarness();
    const alvo = mutatedCore(harness.storage, '2030-03-03T00:00:00.000Z');
    const racing = afterCall(harness.adapter, 'transitionStorageOperationIfUnambiguous', 1, async () => {
      harness.storage.setItem(KEY, alvo);
    });
    const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter: racing });

    const error = await runtime.transitionStorageOperation({
      operationId: harness.receipt.operationId,
      expectedStatus: 'staged',
      nextStatus: 'activating',
    }).then(() => null, (caught: unknown) => caught) as StorageOperationTransitionConflictError;

    expect(error).toBeInstanceOf(StorageOperationTransitionConflictError);
    expect(error.phase).toBe('post-transition');
    expect(error.compensation).toBe('reverted');
    expect((await harness.adapter.readStorageOperationReceipt(harness.receipt.operationId))?.status)
      .toBe('reverted');
  });

  it('a mensagem e o erro nunca carregam core bruto, só digest', async () => {
    const harness = await begunHarness();
    const raw = harness.storage.getItem(KEY) as string;
    const alvo = mutatedCore(harness.storage, '2030-04-04T00:00:00.000Z');
    const storage = storageMutatingAfterInspect(harness.storage, (real) => real.setItem(KEY, alvo));
    const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter: harness.adapter });

    const error = await runtime.transitionStorageOperation({
      operationId: harness.receipt.operationId,
      expectedStatus: 'staged',
      nextStatus: 'activating',
    }).then(() => null, (caught: unknown) => caught) as StorageOperationTransitionConflictError;

    expect(error.message).not.toContain(raw);
    expect(error.message).not.toContain(alvo);
    expect(error.message).not.toContain('historyStorage');
    expect(error.observedCoreDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('nenhum erro de transição altera core, histórico, manifests, conclusões ou metadata', async () => {
    const harness = await begunHarness();
    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    const alvo = mutatedCore(harness.storage, '2030-05-05T00:00:00.000Z');
    const racing = racingDuringTransaction(harness.adapter, () => harness.storage.setItem(KEY, alvo));
    const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter: racing });

    await runtime.transitionStorageOperation({
      operationId: harness.receipt.operationId,
      expectedStatus: 'staged',
      nextStatus: 'activating',
    }).catch(() => undefined);

    const after = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    // Só o core (mudado pelo escritor externo, não por nós) e o store de
    // receipts administrativos podem diferir.
    expect(after.raw).toBe(alvo);
    for (const store of Object.keys(before.stores)) {
      if (store === STORAGE_OPERATION_RECEIPTS_STORE) continue;
      expect(JSON.stringify(after.stores[store])).toBe(JSON.stringify(before.stores[store]));
    }
    const receipts = after.stores[STORAGE_OPERATION_RECEIPTS_STORE] as StorageOperationReceipt[];
    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe('reverted');
  });

  it('core que DESAPARECE antes da transação também compensa', async () => {
    const harness = await begunHarness();
    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    const storage = storageMutatingAfterInspect(harness.storage, (real) => real.removeItem(KEY));
    const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter: harness.adapter });

    const error = await runtime.transitionStorageOperation({
      operationId: harness.receipt.operationId, expectedStatus: 'staged', nextStatus: 'activating',
    }).then(() => null, (caught: unknown) => caught) as StorageOperationTransitionConflictError;

    expect(error.phase).toBe('pre-transition');
    expect(error.reason).toBe('core-missing-before-transition');
    expect(error.compensation).toBe('reverted');
    expect((await harness.adapter.readStorageOperationReceipt(harness.receipt.operationId))?.status)
      .toBe('reverted');
    // A compensação NÃO tenta restaurar o core removido pelo escritor externo.
    expect(harness.storage.getItem(KEY)).toBeNull();
    for (const store of Object.keys(before.stores)) {
      if (store === STORAGE_OPERATION_RECEIPTS_STORE) continue;
      const after = await capturePhysicalState(harness.factory, harness.name, harness.storage);
      expect(JSON.stringify(after.stores[store])).toBe(JSON.stringify(before.stores[store]));
    }
  });

  it('core que fica ilegível antes da transação compensa preservando a causa', async () => {
    const harness = await begunHarness();
    let reads = 0;
    const storage: StorageLike = {
      getItem(key: string): string | null {
        reads += 1;
        if (reads > READS_PER_INSPECT) throw new Error('localStorage bloqueado');
        return harness.storage.getItem(key);
      },
      setItem(key: string, value: string): void { harness.storage.setItem(key, value); },
      removeItem(key: string): void { harness.storage.removeItem(key); },
    };
    const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter: harness.adapter });

    const error = await runtime.transitionStorageOperation({
      operationId: harness.receipt.operationId, expectedStatus: 'staged', nextStatus: 'activating',
    }).then(() => null, (caught: unknown) => caught) as StorageOperationTransitionConflictError;

    expect(error.phase).toBe('pre-transition');
    expect(error.reason).toBe('core-unreadable');
    expect((error.cause as Error).message).toBe('localStorage bloqueado');
    expect(error.compensation).toBe('reverted');
  });

  it('compensação que falha porque o status mudou de novo NÃO é relatada como reverted', async () => {
    const harness = await begunHarness();
    const alvo = mutatedCore(harness.storage, '2030-06-06T00:00:00.000Z');
    const racing = afterCall(harness.adapter, 'transitionStorageOperationIfUnambiguous', 1, async () => {
      harness.storage.setItem(KEY, alvo);
      // Outro ator termina a operação antes de a compensação tentar.
      await harness.adapter.transitionStorageOperationReceipt(
        harness.receipt.operationId, 'activating', 'reverted',
      );
    });
    const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter: racing });

    const error = await runtime.transitionStorageOperation({
      operationId: harness.receipt.operationId, expectedStatus: 'staged', nextStatus: 'activating',
    }).then(() => null, (caught: unknown) => caught) as StorageOperationTransitionConflictError;

    expect(error.compensation).toBe('failed');
    expect(error.message).not.toContain('o receipt foi revertido');
    expect(error.compensationCause).toBeInstanceOf(StorageOperationAmbiguousStateError);
    expect(error.finalReceiptStatus).toBe('reverted');
  });

  it('receipt que desaparece durante a compensação → finalReceiptStatus missing', async () => {
    const harness = await begunHarness();
    const alvo = mutatedCore(harness.storage, '2030-07-07T00:00:00.000Z');
    const racing = afterCall(harness.adapter, 'transitionStorageOperationIfUnambiguous', 1, async () => {
      harness.storage.setItem(KEY, alvo);
      await withStore(
        harness.factory, harness.name, STORAGE_OPERATION_RECEIPTS_STORE, 'readwrite',
        (transaction) => requestResult(transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE).clear()),
      );
    });
    const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter: racing });

    const error = await runtime.transitionStorageOperation({
      operationId: harness.receipt.operationId, expectedStatus: 'staged', nextStatus: 'activating',
    }).then(() => null, (caught: unknown) => caught) as StorageOperationTransitionConflictError;

    expect(error.compensation).toBe('failed');
    expect(error.finalReceiptStatus).toBe('missing');
    expect(error.finalStatusReadCause).toBeNull();
  });

  it('adapter que fecha durante a compensação preserva a causa', async () => {
    const harness = await begunHarness();
    const alvo = mutatedCore(harness.storage, '2030-08-08T00:00:00.000Z');
    const racing = afterCall(harness.adapter, 'transitionStorageOperationIfUnambiguous', 1, async () => {
      harness.storage.setItem(KEY, alvo);
      await harness.adapter.close();
    });
    const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter: racing });

    const error = await runtime.transitionStorageOperation({
      operationId: harness.receipt.operationId, expectedStatus: 'staged', nextStatus: 'activating',
    }).then(() => null, (caught: unknown) => caught) as StorageOperationTransitionConflictError;

    expect(error.compensation).toBe('failed');
    expect(error.compensationCause).toBeInstanceOf(Error);
    expect(error.finalReceiptStatus).toBe('unknown');
    expect(error.finalStatusReadCause).toBeInstanceOf(Error);
  });

  it('erro real na primitiva de compensação viaja em compensationCause', async () => {
    const harness = await begunHarness();
    const alvo = mutatedCore(harness.storage, '2030-09-09T00:00:00.000Z');
    const comCorrida = afterCall(harness.adapter, 'transitionStorageOperationIfUnambiguous', 1, async () => {
      harness.storage.setItem(KEY, alvo);
    });
    const quebrado = breakMethod(
      comCorrida,
      'revertStorageOperationAfterTransitionConflict',
      () => new Error('IndexedDB caiu durante a compensação da transição'),
    );
    const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter: quebrado });

    const error = await runtime.transitionStorageOperation({
      operationId: harness.receipt.operationId, expectedStatus: 'staged', nextStatus: 'activating',
    }).then(() => null, (caught: unknown) => caught) as StorageOperationTransitionConflictError;

    expect(error.compensation).toBe('failed');
    expect((error.compensationCause as Error).message)
      .toBe('IndexedDB caiu durante a compensação da transição');
    // O receipt permanece observável no status para o qual avançou.
    expect(error.finalReceiptStatus).toBe('activating');
    expect(error.finalStatusReadCause).toBeNull();
  });

  it('falha ao reler o status final da compensação → unknown com readCause acessível', async () => {
    const harness = await begunHarness();
    const alvo = mutatedCore(harness.storage, '2030-10-10T00:00:00.000Z');
    const comCorrida = afterCall(harness.adapter, 'transitionStorageOperationIfUnambiguous', 1, async () => {
      harness.storage.setItem(KEY, alvo);
    });
    const semCompensacao = breakMethod(
      comCorrida,
      'revertStorageOperationAfterTransitionConflict',
      () => new Error('transação de compensação abortada'),
    );
    const semLeitura = breakMethod(
      semCompensacao,
      'readStorageOperationReceipt',
      () => new Error('store de receipts ilegível'),
    );
    const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter: semLeitura });

    const error = await runtime.transitionStorageOperation({
      operationId: harness.receipt.operationId, expectedStatus: 'staged', nextStatus: 'activating',
    }).then(() => null, (caught: unknown) => caught) as StorageOperationTransitionConflictError;

    expect(error.finalReceiptStatus).toBe('unknown');
    expect((error.finalStatusReadCause as Error).message).toBe('store de receipts ilegível');
    expect((error.compensationCause as Error).message).toBe('transação de compensação abortada');
    expect(error.message).toContain('desconhecido');
    expect(error.message).toContain('store de receipts ilegível');
  });

  it('sem corrida a transição continua passando e o próximo inspect vê a operação', async () => {
    const harness = await begunHarness();
    const receipt = await harness.runtime.transitionStorageOperation({
      operationId: harness.receipt.operationId, expectedStatus: 'staged', nextStatus: 'activating',
    });
    expect(receipt.status).toBe('activating');
    const snapshot = await harness.runtime.inspectStorageAdministration();
    expect(snapshot.state.status).toBe('interrupted');
  });

  // Limite honesto do protocolo: o método garante a janela que ele observou,
  // não o futuro. Uma escrita iniciada depois da leitura pós-transição é um
  // novo evento externo — ela aparece no PRÓXIMO inspect.
  it('alteração posterior à leitura final é novo evento externo, não falha da transição', async () => {
    const harness = await begunHarness();
    const receipt = await harness.runtime.transitionStorageOperation({
      operationId: harness.receipt.operationId, expectedStatus: 'staged', nextStatus: 'activating',
    });
    expect(receipt.status).toBe('activating');

    harness.storage.setItem(KEY, mutatedCore(harness.storage, '2031-01-01T00:00:00.000Z'));

    const snapshot = await harness.runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({ status: 'conflicted', reason: 'operation-incompatible' });
  });

  it('reverter é sempre permitido, mesmo com o core divergente depois do commit', async () => {
    const harness = await begunHarness();
    const alvo = mutatedCore(harness.storage, '2031-02-02T00:00:00.000Z');
    const racing = afterCall(harness.adapter, 'transitionStorageOperationIfUnambiguous', 1, async () => {
      harness.storage.setItem(KEY, alvo);
    });
    const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter: racing });

    // `reverted` é terminal e não afirma efeito nenhum: o core que mudou depois
    // do commit não invalida a reversão.
    const revertido = await runtime.transitionStorageOperation({
      operationId: harness.receipt.operationId, expectedStatus: 'staged', nextStatus: 'reverted',
    });
    expect(revertido.status).toBe('reverted');
  });
});

// ---------------------------------------------------------------------------
// Corretivo 038 — a armadilha do receipt preso em `activating`.
// ---------------------------------------------------------------------------
describe('reversão segura de operação presa (corretivo 038)', () => {
  // Produz exatamente o estado que a auditoria reproduziu: receipt em
  // `activating`, core divergente, inspect `conflicted` e compensação
  // automática impedida.
  async function operacaoPresa() {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const receipt = await harness.runtime.beginStorageOperation(beginInput());
    const raw = harness.storage.getItem(KEY) as string;
    const alvo = JSON.stringify({ ...JSON.parse(raw), savedAt: '2032-01-01T00:00:00.000Z' });
    const comCorrida = afterCall(harness.adapter, 'transitionStorageOperationIfUnambiguous', 1, async () => {
      harness.storage.setItem(KEY, alvo);
    });
    const quebrado = breakMethod(
      comCorrida,
      'revertStorageOperationAfterTransitionConflict',
      () => new Error('compensação indisponível'),
    );
    const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter: quebrado });
    await runtime.transitionStorageOperation({
      operationId: receipt.operationId, expectedStatus: 'staged', nextStatus: 'activating',
    }).catch(() => undefined);

    expect((await harness.adapter.readStorageOperationReceipt(receipt.operationId))?.status)
      .toBe('activating');
    const snapshot = await harness.runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({ status: 'conflicted', reason: 'operation-incompatible' });
    return { harness, receipt };
  }

  it('o caminho normal continua recusando — é por isso que a saída existe', async () => {
    const { harness, receipt } = await operacaoPresa();
    const error = await harness.runtime.transitionStorageOperation({
      operationId: receipt.operationId, expectedStatus: 'activating', nextStatus: 'reverted',
    }).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageAdministrationConflictError);
    expect((await harness.adapter.readStorageOperationReceipt(receipt.operationId))?.status)
      .toBe('activating');
  });

  it('revertStorageOperationSafely liberta o receipt e o diagnóstico volta a ready', async () => {
    const { harness, receipt } = await operacaoPresa();
    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);

    const revertido = await harness.runtime.revertStorageOperationSafely({
      operationId: receipt.operationId,
      expectedStatus: 'activating',
    });
    expect(revertido.status).toBe('reverted');

    const snapshot = await harness.runtime.inspectStorageAdministration();
    expect(snapshot.state).toEqual({ status: 'ready' });

    // Só o receipt mudou.
    const after = await capturePhysicalState(harness.factory, harness.name, harness.storage);
    expect(after.raw).toBe(before.raw);
    for (const store of Object.keys(before.stores)) {
      if (store === STORAGE_OPERATION_RECEIPTS_STORE) continue;
      expect(JSON.stringify(after.stores[store])).toBe(JSON.stringify(before.stores[store]));
    }
  });

  it('depois da reversão um novo begin volta a ser possível', async () => {
    const { harness, receipt } = await operacaoPresa();
    await harness.runtime.revertStorageOperationSafely({
      operationId: receipt.operationId, expectedStatus: 'activating',
    });
    const runtime = createStorageAdminRuntime({
      key: KEY,
      storage: harness.storage,
      adapter: harness.adapter,
      idFactory: () => 'operation-depois-da-reversao',
    });
    const novo = await runtime.beginStorageOperation(beginInput());
    expect(novo.status).toBe('staged');
  });

  it('recusa ambiguidade estrutural: operationId, status, dois receipts e malformado', async () => {
    const presa = await operacaoPresa();
    await expect(presa.harness.runtime.revertStorageOperationSafely({
      operationId: 'operation-que-nao-existe', expectedStatus: 'activating',
    })).rejects.toBeInstanceOf(StorageOperationAmbiguousStateError);
    await expect(presa.harness.runtime.revertStorageOperationSafely({
      operationId: presa.receipt.operationId, expectedStatus: 'staged',
    })).rejects.toBeInstanceOf(StorageOperationTransitionError);
    expect((await presa.harness.adapter.readStorageOperationReceipt(presa.receipt.operationId))?.status)
      .toBe('activating');

    const dois = await createReadyHarness({ sessions: [makeSession(1)] });
    await dois.adapter.putStorageOperationReceipt(coherentReceipt(dois, { operationId: 'operation-a' }));
    await dois.adapter.putStorageOperationReceipt(coherentReceipt(dois, { operationId: 'operation-b' }));
    await expect(dois.runtime.revertStorageOperationSafely({
      operationId: 'operation-a', expectedStatus: 'staged',
    })).rejects.toBeInstanceOf(StorageOperationAmbiguousStateError);

    const torto = await createReadyHarness({ sessions: [makeSession(1)] });
    await torto.adapter.putStorageOperationReceipt(coherentReceipt(torto, { operationId: 'operation-ok' }));
    await putRawOperationReceipt(torto.factory, torto.name, { operationId: 'torto', kind: 'import' });
    await expect(torto.runtime.revertStorageOperationSafely({
      operationId: 'operation-ok', expectedStatus: 'staged',
    })).rejects.toBeInstanceOf(StorageOperationReceiptIntegrityError);
  });

  it('recusa metadata malformada e operationId vazio', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await harness.adapter.putStorageOperationReceipt(coherentReceipt(harness, { operationId: 'operation-x' }));
    await putRawMetadata(harness.factory, harness.name, 'activeGeneration', 42);
    await expect(harness.runtime.revertStorageOperationSafely({
      operationId: 'operation-x', expectedStatus: 'staged',
    })).rejects.toBeInstanceOf(HistoryMetadataIntegrityError);

    const vazio = await createReadyHarness({ sessions: [makeSession(1)] });
    const error = await vazio.runtime.revertStorageOperationSafely({
      operationId: '', expectedStatus: 'staged',
    }).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageAdministrationInputError);
  });

  it('adapter indisponível bloqueia a reversão de emergência', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await harness.adapter.putStorageOperationReceipt(coherentReceipt(harness, { operationId: 'operation-y' }));
    const indisponivel = breakMethod(harness.adapter, 'isAvailable', () => new Error('sem IndexedDB'));
    const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter: indisponivel });
    const error = await runtime.revertStorageOperationSafely({
      operationId: 'operation-y', expectedStatus: 'staged',
    }).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageAdministrationUnavailableError);
    expect((error as StorageAdministrationUnavailableError).reason).toBe('indexeddb-unavailable');
  });

  it('CompletionReceipt pendente não bloqueia a reversão nem é alterado', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await harness.adapter.putStorageOperationReceipt(coherentReceipt(harness, { operationId: 'operation-z' }));
    await seedPendingCompletion(harness.adapter, harness.generationId);
    const pendentesAntes = await harness.adapter.readPendingCompletionReceipts();

    const revertido = await harness.runtime.revertStorageOperationSafely({
      operationId: 'operation-z', expectedStatus: 'staged',
    });
    expect(revertido.status).toBe('reverted');
    expect(await harness.adapter.readPendingCompletionReceipts()).toEqual(pendentesAntes);
  });
});

// ---------------------------------------------------------------------------
// Corretivo 038 — ponteiro de metadata não textual é `metadata-malformed`, e
// não "não existe geração ativa" (`core-invalid`).
// ---------------------------------------------------------------------------
describe('metadata malformada é classificada como metadata-malformed (corretivo 038)', () => {
  const valores: [string, unknown][] = [
    ['number', 42],
    ['Date', new Date('2026-07-24T12:00:00.000Z')],
    ['ArrayBuffer', new ArrayBuffer(8)],
    ['objeto', { generationId: 'generation-1' }],
    ['array', ['generation-1']],
  ];

  it.each(valores)('activeGeneration como %s → conflicted/metadata-malformed sem mutação', async (_label, value) => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await putRawMetadata(harness.factory, harness.name, 'activeGeneration', value);
    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);

    const snapshot = await harness.runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({ status: 'conflicted', reason: 'metadata-malformed' });
    if (snapshot.state.status === 'conflicted') {
      expect(snapshot.state.cause).toBeInstanceOf(HistoryMetadataIntegrityError);
    }
    expectUnchanged(before, await capturePhysicalState(harness.factory, harness.name, harness.storage));
  });

  it.each(valores)('migrationGeneration como %s → conflicted/metadata-malformed sem mutação', async (_label, value) => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await putRawMetadata(harness.factory, harness.name, 'migrationGeneration', value);
    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);

    const snapshot = await harness.runtime.inspectStorageAdministration();
    expect(snapshot.state).toMatchObject({ status: 'conflicted', reason: 'metadata-malformed' });
    expectUnchanged(before, await capturePhysicalState(harness.factory, harness.name, harness.storage));
  });

  it('metadata malformada bloqueia begin e transição, sem TypeError', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await harness.adapter.putStorageOperationReceipt(coherentReceipt(harness, { operationId: 'operation-m' }));
    await putRawMetadata(harness.factory, harness.name, 'activeGeneration', new Date());
    const before = await capturePhysicalState(harness.factory, harness.name, harness.storage);

    const erroBegin = await harness.runtime.beginStorageOperation(beginInput())
      .then(() => null, (caught: unknown) => caught);
    expect(erroBegin).toBeInstanceOf(StorageAdministrationConflictError);
    expect(erroBegin).not.toBeInstanceOf(TypeError);
    expect((erroBegin as StorageAdministrationConflictError).reason).toBe('metadata-malformed');

    const erroTransicao = await harness.runtime.transitionStorageOperation({
      operationId: 'operation-m', expectedStatus: 'staged', nextStatus: 'activating',
    }).then(() => null, (caught: unknown) => caught);
    expect(erroTransicao).toBeInstanceOf(StorageAdministrationConflictError);
    expect((erroTransicao as StorageAdministrationConflictError).reason).toBe('metadata-malformed');

    expectUnchanged(before, await capturePhysicalState(harness.factory, harness.name, harness.storage));
  });

  it('null continua sendo um valor legítimo para os dois ponteiros', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await putRawMetadata(harness.factory, harness.name, 'migrationGeneration', null);
    const snapshot = await harness.runtime.inspectStorageAdministration();
    expect(snapshot.state).toEqual({ status: 'ready' });
  });
});
