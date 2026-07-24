import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../types';
import type { AdministrableWorkoutHistoryStorageAdapter, HistoryStorageMetadata } from './storage-adapter';
import {
  type BeginStorageOperationInput,
  StorageAdministrationConflictError,
  StorageAdministrationUnavailableError,
  StorageOperationAlreadyInProgressError,
  StorageOperationBeginConflictError,
  createStorageAdminRuntime,
} from './storage-admin-runtime';
import {
  type WorkoutCompletionEffects,
  createWorkoutCompletionReceipt,
} from './storage-completion-receipt';
import {
  createHybridStorageRuntime,
} from './storage-hybrid';
import {
  GENERATION_MANIFESTS_STORE,
  GYMFLOW_INDEXEDDB_VERSION,
  IndexedDbWorkoutHistoryStorage,
  METADATA_STORE,
  STORAGE_OPERATION_RECEIPTS_STORE,
  StorageOperationTransitionError,
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

// Envolve uma `StorageLike` real e substitui o valor devolvido por
// `getItem(key)` numa chamada específica (contada só para essa chave) — usada
// para abrir, de forma determinística, a janela entre a leitura do core e a
// releitura de confirmação do `beginStorageOperation`.
class RacingCoreStorage implements StorageLike {
  private calls = 0;
  setItemCalls = 0;

  constructor(
    private readonly inner: StorageLike,
    private readonly key: string,
    private readonly mutateOnCall: number,
    private readonly mutatedValue: string,
  ) {}

  getItem(key: string): string | null {
    const value = this.inner.getItem(key);
    if (key !== this.key) return value;
    this.calls += 1;
    return this.calls === this.mutateOnCall ? this.mutatedValue : value;
  }

  setItem(key: string, value: string): void {
    this.setItemCalls += 1;
    this.inner.setItem(key, value);
  }

  removeItem(key: string): void {
    this.inner.removeItem(key);
  }
}

// Intercepta `readMetadata()` numa chamada específica para rodar uma mutação
// real (segunda ativação de geração) antes de devolver o resultado —
// reproduz, com o adapter físico de verdade, a janela em que a geração ativa
// muda durante o begin.
function withMetadataRace(
  adapter: AdministrableWorkoutHistoryStorageAdapter,
  mutateOnCall: number,
  mutate: () => Promise<void>,
): AdministrableWorkoutHistoryStorageAdapter {
  let calls = 0;
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop !== 'readMetadata' || typeof value !== 'function') {
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return async (): Promise<HistoryStorageMetadata> => {
        calls += 1;
        if (calls === mutateOnCall) await mutate();
        return (value as () => Promise<HistoryStorageMetadata>).call(target);
      };
    },
  }) as AdministrableWorkoutHistoryStorageAdapter;
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

  it.each(['staged', 'activating', 'activated'] as const)(
    'exatamente um receipt %s → interrupted, identificado por operationId/kind/status',
    async (status) => {
      const { adapter, runtime, generationId } = await createReadyHarness();
      const receipt = await adapter.createStorageOperationReceiptIfIdle({
        receipt: {
          operationId: 'operation-interrompida',
          kind: 'restore',
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
      if (status !== 'staged') {
        await adapter.transitionStorageOperationReceipt('operation-interrompida', 'staged', 'activating');
      }
      if (status === 'activated') {
        await adapter.transitionStorageOperationReceipt('operation-interrompida', 'activating', 'activated');
      }
      void receipt;

      const snapshot = await runtime.inspectStorageAdministration();
      expect(snapshot.state.status).toBe('interrupted');
      if (snapshot.state.status === 'interrupted') {
        expect(snapshot.state.operation.operationId).toBe('operation-interrompida');
        expect(snapshot.state.operation.kind).toBe('restore');
        expect(snapshot.state.operation.status).toBe(status);
      }
    },
  );

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

  it('reverte o receipt quando a geração ativa muda durante o begin', async () => {
    const { adapter, storage, factory, name, generationId } = await createReadyHarness({ sessions: [makeSession(1)] });
    // Segunda geração real, fisicamente preparada. O ponteiro de staging é
    // limpo logo em seguida para que o `inspect()` inicial do begin veja
    // `ready` — a mutação real do ponteiro ativo só acontece dentro da
    // corrida, direto no store de metadata (mesma técnica de escrita crua já
    // usada pelas sondas de janela do 002D-A1).
    const otherGeneration = await adapter.prepareHistoryGeneration([makeSession(2)]);
    await putRawMetadata(factory, name, 'migrationGeneration', null);
    const racingAdapter = withMetadataRace(adapter, 3, async () => {
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

    const reverted = await adapter.readStorageOperationReceipt('operation-racing-generation');
    expect(reverted?.status).toBe('reverted');
    expect(await adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
    // A geração ativa real da mutação continua valendo; o begin não reverteu
    // o ponteiro que a corrida moveu.
    expect((await adapter.readMetadata()).activeGeneration).toBe(otherGeneration);
    void generationId;
  });

  it('reverte o receipt quando o core físico muda durante o begin', async () => {
    const { adapter, storage } = await createReadyHarness();
    const rawBefore = storage.getItem(KEY) as string;
    const mutatedRaw = JSON.stringify({
      v: HYBRID_STORAGE_VERSION,
      savedAt: '2030-01-01T00:00:00.000Z',
      data: JSON.parse(rawBefore).data,
    });
    const racingStorage = new RacingCoreStorage(storage, KEY, 3, mutatedRaw);
    const runtime = createStorageAdminRuntime({
      key: KEY,
      storage: racingStorage,
      adapter,
      now: () => new Date('2026-07-24T13:00:00.000Z'),
      idFactory: () => 'operation-racing-core',
    });

    const error = await runtime.beginStorageOperation(beginInput())
      .then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageOperationBeginConflictError);

    const reverted = await adapter.readStorageOperationReceipt('operation-racing-core');
    expect(reverted?.status).toBe('reverted');
    expect(await adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
    // O runtime nunca escreve no storage por conta própria — só leu através
    // do wrapper, nunca chamou `setItem`.
    expect(racingStorage.setItemCalls).toBe(0);
    expect(storage.getItem(KEY)).toBe(rawBefore);
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
  it('percorre staged → activating → activated → settled', async () => {
    const { runtime } = await createReadyHarness();
    const receipt = await runtime.beginStorageOperation(beginInput());

    const activating = await runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'staged',
      nextStatus: 'activating',
    });
    expect(activating.status).toBe('activating');

    const activated = await runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'activating',
      nextStatus: 'activated',
      patch: { targetCoreRaw: '{"schemaVersion":1}' },
    });
    expect(activated).toMatchObject({ status: 'activated', targetCoreRaw: '{"schemaVersion":1}' });

    const settled = await runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'activated',
      nextStatus: 'settled',
    });
    expect(settled.status).toBe('settled');
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

  it('recusa expectedStatus divergente, operação ausente e transição a partir de terminal', async () => {
    const { runtime } = await createReadyHarness();
    const receipt = await runtime.beginStorageOperation(beginInput());

    await expect(runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'activating',
      nextStatus: 'activated',
    })).rejects.toBeInstanceOf(StorageOperationTransitionError);

    await expect(runtime.transitionStorageOperation({
      operationId: 'operation-inexistente',
      expectedStatus: 'staged',
      nextStatus: 'activating',
    })).rejects.toBeInstanceOf(StorageOperationTransitionError);

    await runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'staged',
      nextStatus: 'reverted',
    });
    await expect(runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'reverted',
      nextStatus: 'activating',
    })).rejects.toBeInstanceOf(StorageOperationTransitionError);
  });

  it('não altera core, metadata, histórico ou CompletionReceipt', async () => {
    const { runtime, adapter, storage, factory, name, generationId } = await createReadyHarness({
      sessions: [makeSession(1)],
    });
    const receipt = await runtime.beginStorageOperation(beginInput());
    const session = makeSession(50);
    const completionReceipt = await createWorkoutCompletionReceipt({
      receiptId: `receipt-${session.id}`,
      generationId,
      finalSession: session,
      coreEnvelopeAfter: makeCoreEnvelope(generationId) as never,
      effects: EMPTY_EFFECTS,
      createdAt: '2026-07-24T12:45:00.000Z',
    });
    await adapter.appendSessionWithCompletionReceipt(session, completionReceipt);

    const rawBefore = storage.getItem(KEY);
    const historyBefore = await adapter.readActiveHistory();
    const completionBefore = await adapter.readPendingCompletionReceipts();
    const metadataBefore = await adapter.readMetadata();

    await runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'staged',
      nextStatus: 'activating',
    });
    await runtime.transitionStorageOperation({
      operationId: receipt.operationId,
      expectedStatus: 'activating',
      nextStatus: 'activated',
    });

    expect(storage.getItem(KEY)).toBe(rawBefore);
    expect(await adapter.readActiveHistory()).toEqual(historyBefore);
    expect(await adapter.readPendingCompletionReceipts()).toEqual(completionBefore);
    expect(await adapter.readMetadata()).toEqual(metadataBefore);
    void factory;
    void name;
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
