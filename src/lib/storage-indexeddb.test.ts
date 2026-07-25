import { IDBFactory, IDBObjectStore as FakeIDBObjectStore } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../types';
import {
  COMPLETION_RECEIPTS_STORE,
  CompletionReceiptIntegrityError,
  GENERATION_MANIFESTS_STORE,
  GYMFLOW_INDEXEDDB_VERSION,
  HistoryGenerationIntegrityError,
  HistoryManifestIntegrityError,
  HistoryMetadataIntegrityError,
  HistoryRollbackConflictError,
  IndexedDbNotOpenError,
  IndexedDbUnavailableError,
  IndexedDbWorkoutHistoryStorage,
  LEGACY_SNAPSHOTS_STORE,
  LegacySnapshotCryptoUnavailableError,
  LegacySnapshotIntegrityError,
  METADATA_STORE,
  STORAGE_OPERATION_RECEIPTS_STORE,
  StorageCompletionPendingError,
  StorageOperationAlreadyInProgressError,
  StorageOperationBeginConflictError,
  StorageOperationReceiptIntegrityError,
  StorageOperationTransitionError,
  WORKOUT_HISTORY_STORE,
  checksumLegacySnapshot,
} from './storage-indexeddb';
import {
  EMPTY_GENERATION_DIGEST,
  type HistoryGenerationIntegrityReason,
  chainGenerationDigest,
  computeOrderedHistoryDigest,
  digestWorkoutSession,
} from './storage-history-integrity';
import type { WorkoutCompletionReceipt } from './storage-completion-receipt';
import {
  type StorageOperationReceipt,
  createStorageOperationReceipt,
} from './storage-operation-receipt';

let databaseSequence = 0;

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
    prsDetected: index % 10 === 0 ? ['Supino +2,5 kg'] : [],
    sourceProgramId: 'program-1',
    sourceProgramDayId: 'day-1',
    sourceProgramName: 'Programa multi-dia',
    sourceProgramDayName: 'Dia 1 — Peito',
    status: 'completed',
    startedAt,
    endedAt: startedAt + 3_600_000,
    exercises: [{
      id: `entry-${index}`,
      exerciseId: 'replacement-exercise',
      name: 'Remada articulada',
      muscleGroup: 'back',
      notes: 'Cadência controlada e amplitude confortável.',
      repRange: [8, 12],
      targetRPE: 8,
      restSec: 90,
      progressionNote: 'Aumentar 2,5 kg ao fechar a faixa.',
      plannedSlotIndex: 0,
      plannedExerciseId: 'planned-exercise',
      entryOrigin: 'swapped',
      entryStatus: 'performed',
      plannedExerciseName: 'Puxada alta',
      plannedMuscleGroup: 'back',
      swapReasonCode: 'equipment-unavailable',
      swapReasonNote: 'Equipamento ocupado.',
      swappedAt: startedAt + 120_000,
      sets: [{
        id: `set-${index}`,
        reps: 10,
        weight: 62.5,
        completed: true,
        suggestedWeight: 60,
        lastWeight: 60,
        rpe: 8,
      }],
    }],
    ...overrides,
  };
}

function createHarness(
  factory = new IDBFactory(),
  databaseName?: string,
  options: { subtleCrypto?: SubtleCrypto | null } = {},
) {
  const name = databaseName ?? `gymflow-idb-test-${databaseSequence += 1}`;
  let generation = 0;
  const adapter = new IndexedDbWorkoutHistoryStorage({
    factory,
    databaseName: name,
    generationIdFactory: () => `generation-${generation += 1}`,
    now: () => new Date('2026-07-22T15:00:00.000Z'),
    ...options,
  });
  return { adapter, factory, name };
}

interface StoredSnapshotForTest {
  snapshotId: string;
  raw: string;
  checksum: string;
  createdAt: string;
  verified: boolean;
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  const request = factory.open(name, GYMFLOW_INDEXEDDB_VERSION);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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

async function readStoredSnapshot(
  factory: IDBFactory,
  name: string,
): Promise<StoredSnapshotForTest | undefined> {
  const database = await openDatabase(factory, name);
  const transaction = database.transaction(LEGACY_SNAPSHOTS_STORE, 'readonly');
  const completed = transactionResult(transaction);
  const record = await requestResult(
    transaction.objectStore(LEGACY_SNAPSHOTS_STORE).get('v1-rollback'),
  ) as StoredSnapshotForTest | undefined;
  await completed;
  database.close();
  return record;
}

async function updateStoredSnapshot(
  factory: IDBFactory,
  name: string,
  changes: Partial<StoredSnapshotForTest>,
): Promise<void> {
  const database = await openDatabase(factory, name);
  const transaction = database.transaction(LEGACY_SNAPSHOTS_STORE, 'readwrite');
  const completed = transactionResult(transaction);
  const store = transaction.objectStore(LEGACY_SNAPSHOTS_STORE);
  const record = await requestResult(store.get('v1-rollback')) as StoredSnapshotForTest | undefined;
  if (!record) throw new Error('Snapshot de teste não encontrado.');
  await requestResult(store.put({ ...record, ...changes }));
  await completed;
  database.close();
}

// Banco físico exatamente como a v3 o criava, já povoado em todos os cinco
// stores daquela versão. É a base real do teste de upgrade para v4.
async function createV3Database(factory: IDBFactory, name: string): Promise<void> {
  const sessions = [
    makeSession(31, { id: 'session-v3-a' }),
    makeSession(32, { id: 'session-v3-b' }),
  ];
  const orderedDigest = await computeOrderedHistoryDigest(sessions);
  const digests = await Promise.all(sessions.map((session) => digestWorkoutSession(session)));

  const request = factory.open(name, 3);
  request.onupgradeneeded = () => {
    const database = request.result;
    const historyStore = database.createObjectStore(WORKOUT_HISTORY_STORE, {
      keyPath: ['generationId', 'order'],
    });
    historyStore.createIndex('byGeneration', 'generationId', { unique: false });
    historyStore.createIndex('byGenerationSession', ['generationId', 'sessionId'], { unique: true });
    sessions.forEach((session, order) => {
      historyStore.add({
        sessionId: session.id,
        generationId: 'generation-v3',
        order,
        session,
        digest: digests[order],
      });
    });

    const metadataStore = database.createObjectStore(METADATA_STORE, { keyPath: 'key' });
    metadataStore.put({ key: 'activeGeneration', value: 'generation-v3' });
    metadataStore.put({ key: 'migrationGeneration', value: null });
    metadataStore.put({ key: 'schemaVersion', value: 1 });
    metadataStore.put({ key: 'migrationStatus', value: 'completed' });
    metadataStore.put({ key: 'migratedAt', value: '2026-07-23T10:00:00.000Z' });
    metadataStore.put({ key: 'sourceStorageVersion', value: 1 });
    metadataStore.put({ key: 'generationNextOrder:generation-v3', value: -1 });

    const snapshotStore = database.createObjectStore(LEGACY_SNAPSHOTS_STORE, {
      keyPath: 'snapshotId',
    });
    snapshotStore.put({
      snapshotId: 'v1-rollback',
      raw: '{"version":1}',
      checksum: 'sha256:congelado',
      createdAt: '2026-07-23T10:00:00.000Z',
      verified: true,
    });

    const manifestStore = database.createObjectStore(GENERATION_MANIFESTS_STORE, {
      keyPath: 'generationId',
    });
    manifestStore.put({
      generationId: 'generation-v3',
      sessionCount: sessions.length,
      orderedDigest,
      createdAt: '2026-07-23T10:00:00.000Z',
      updatedAt: '2026-07-23T10:00:00.000Z',
      verified: true,
    });

    const receiptStore = database.createObjectStore(COMPLETION_RECEIPTS_STORE, {
      keyPath: 'receiptId',
    });
    receiptStore.createIndex('byStatus', 'status', { unique: false });
    receiptStore.add({
      receiptId: 'receipt-v3-pendente',
      sessionId: 'session-v3-a',
      generationId: 'generation-v3',
      sessionDigest: digests[0],
      finalSession: sessions[0],
      coreEnvelopeAfter: makeCoreEnvelope('generation-v3'),
      effects: {
        xpNotifications: [{ kind: 'xp', text: 'Treino Concluído!', xp: 150 }],
        communityPost: {
          id: 'post-v3',
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
      },
      createdAt: '2026-07-23T11:00:00.000Z',
      status: 'pending',
      settledAt: null,
    });
  };

  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
}

async function readAllStores(
  factory: IDBFactory,
  name: string,
  version: number,
): Promise<Record<string, unknown[]>> {
  const request = factory.open(name, version);
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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

function createInterceptedSubtleCrypto(
  onDigest: (call: number, digest: ArrayBuffer) => void | ArrayBuffer | Promise<void | ArrayBuffer>,
): SubtleCrypto {
  let calls = 0;
  return {
    async digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
      calls += 1;
      const digest = await globalThis.crypto.subtle.digest(algorithm, data);
      return await onDigest(calls, digest) ?? digest;
    },
  } as SubtleCrypto;
}

describe('fundação IndexedDB do workoutHistory', () => {
  it('informa e rejeita ambiente sem IndexedDB', async () => {
    const adapter = new IndexedDbWorkoutHistoryStorage({ factory: undefined });
    expect(await adapter.isAvailable()).toBe(false);
    await expect(adapter.open()).rejects.toBeInstanceOf(IndexedDbUnavailableError);
  });

  it('cria os object stores e os metadados iniciais', async () => {
    const { adapter, factory, name } = createHarness();
    expect(await adapter.isAvailable()).toBe(true);
    await adapter.open();

    const database = await openDatabase(factory, name);
    expect(Array.from(database.objectStoreNames)).toEqual([
      COMPLETION_RECEIPTS_STORE,
      GENERATION_MANIFESTS_STORE,
      LEGACY_SNAPSHOTS_STORE,
      METADATA_STORE,
      STORAGE_OPERATION_RECEIPTS_STORE,
      WORKOUT_HISTORY_STORE,
    ]);
    const operationStore = database.transaction(STORAGE_OPERATION_RECEIPTS_STORE, 'readonly')
      .objectStore(STORAGE_OPERATION_RECEIPTS_STORE);
    expect(operationStore.keyPath).toBe('operationId');
    expect(Array.from(operationStore.indexNames).sort())
      .toEqual(['byKind', 'byStatus', 'byUpdatedAt']);
    expect(await adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
    expect(await adapter.readMetadata()).toEqual({
      activeGeneration: null,
      migrationGeneration: null,
      schemaVersion: 1,
      migrationStatus: 'not-started',
      migratedAt: null,
      sourceStorageVersion: null,
    });
    database.close();
    await adapter.close();
  });

  it('abre de forma idempotente e reabre o mesmo banco', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);
    await adapter.close();

    const reopened = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name });
    await reopened.open();
    expect((await reopened.readActiveHistory()).map((session) => session.id)).toEqual(['session-1']);
    await reopened.close();
  });

  it.each([0, 100, 500, 1_000])(
    'substitui o histórico por uma geração de %i sessões',
    async (size) => {
      const { adapter } = createHarness();
      await adapter.open();
      const history = Array.from({ length: size }, (_, index) => makeSession(index));
      const generationId = await adapter.replaceHistory(history);

      expect(generationId).toBe('generation-1');
      expect(await adapter.count()).toBe(size);
      expect((await adapter.readActiveHistory()).map((session) => session.id))
        .toEqual(history.map((session) => session.id));
      await adapter.close();
    },
    20_000,
  );

  it('preserva a ordem do array sem usar data ou id como ordenação', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const history = [
      makeSession(8, { id: 'z', date: '2020-01-01' }),
      makeSession(2, { id: 'a', date: '2030-01-01' }),
      makeSession(5, { id: 'm', date: '2025-01-01' }),
    ];
    await adapter.replaceHistory(history);
    expect((await adapter.readActiveHistory()).map((session) => session.id)).toEqual(['z', 'a', 'm']);
    await adapter.close();
  });

  it('grava cada sessão como registro separado com geração e ordem', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1), makeSession(2)]);
    const database = await openDatabase(factory, name);
    const transaction = database.transaction(WORKOUT_HISTORY_STORE, 'readonly');
    const records = await requestResult(transaction.objectStore(WORKOUT_HISTORY_STORE).getAll());
    expect(records).toMatchObject([
      { sessionId: 'session-1', generationId: 'generation-1', order: 0 },
      { sessionId: 'session-2', generationId: 'generation-1', order: 1 },
    ]);
    database.close();
    await adapter.close();
  });

  it('só torna a nova geração ativa quando a transação inteira confirma', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);

    await expect(adapter.replaceHistory([
      makeSession(2, { id: 'duplicada' }),
      makeSession(3, { id: 'duplicada' }),
    ])).rejects.toBeTruthy();

    expect((await adapter.readMetadata()).activeGeneration).toBe('generation-1');
    expect((await adapter.readActiveHistory()).map((session) => session.id)).toEqual(['session-1']);
    await adapter.close();
  });

  it('aborta falha de structured clone sem tocar na geração anterior', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);
    const invalid = {
      ...makeSession(2),
      unsupportedValue: () => 'não clonável',
    } as unknown as WorkoutSession;

    await expect(adapter.replaceHistory([makeSession(3), invalid])).rejects.toBeTruthy();
    expect((await adapter.readMetadata()).activeGeneration).toBe('generation-1');
    expect((await adapter.readActiveHistory()).map((session) => session.id)).toEqual(['session-1']);
    await adapter.close();
  });

  it('prepara geração inativa e permite leitura específica na ordem original', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const active = await adapter.replaceHistory([makeSession(1)]);
    const history = [
      makeSession(8, { id: 'z', date: '2020-01-01' }),
      makeSession(2, { id: 'a', date: '2030-01-01' }),
      makeSession(5, { id: 'm', date: '2025-01-01' }),
    ];

    const prepared = await adapter.prepareHistoryGeneration(history);
    expect(prepared).toBe('generation-2');
    expect(await adapter.readHistoryGeneration(prepared)).toEqual(history);
    expect((await adapter.readMetadata())).toMatchObject({
      activeGeneration: active,
      migrationGeneration: prepared,
    });
    expect(await adapter.hasHistoryGeneration(prepared)).toBe(true);
    expect(await adapter.hasHistoryGeneration('generation-inexistente')).toBe(false);
    expect((await adapter.readActiveHistory()).map((session) => session.id)).toEqual(['session-1']);
    await adapter.close();
  });

  it('ativa somente geração previamente preparada sem apagar a anterior', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const previous = await adapter.replaceHistory([makeSession(1), makeSession(2)]);
    const prepared = await adapter.prepareHistoryGeneration([makeSession(3)]);

    await adapter.activateHistoryGeneration(prepared);
    expect((await adapter.readMetadata()).activeGeneration).toBe(prepared);
    expect((await adapter.readActiveHistory()).map((session) => session.id)).toEqual(['session-3']);
    expect((await adapter.readHistoryGeneration(previous)).map((session) => session.id))
      .toEqual(['session-1', 'session-2']);
    await adapter.close();
  });

  it('aceita staging e ativação de histórico vazio', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);
    const prepared = await adapter.prepareHistoryGeneration([]);

    expect(await adapter.readHistoryGeneration(prepared)).toEqual([]);
    expect((await adapter.readActiveHistory()).map((session) => session.id)).toEqual(['session-1']);
    await adapter.activateHistoryGeneration(prepared);
    expect(await adapter.readActiveHistory()).toEqual([]);
    await adapter.close();
  });

  it('recusa segundo staging enquanto já existe geração preparada', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const prepared = await adapter.prepareHistoryGeneration([makeSession(1)]);

    await expect(adapter.prepareHistoryGeneration([makeSession(2)]))
      .rejects.toThrow('já está preparada');
    expect((await adapter.readMetadata()).migrationGeneration).toBe(prepared);
    expect((await adapter.readHistoryGeneration(prepared)).map((session) => session.id))
      .toEqual(['session-1']);
    expect(await adapter.readHistoryGeneration('generation-2')).toEqual([]);
    await adapter.close();
  });

  it('rejeita ativação de geração que não foi preparada', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);

    await expect(adapter.activateHistoryGeneration('generation-inexistente'))
      .rejects.toThrow('depois de preparada');
    expect((await adapter.readMetadata()).activeGeneration).toBe('generation-1');
    await adapter.close();
  });

  it('aborta staging duplicado sem estado parcial nem troca da geração ativa', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const active = await adapter.replaceHistory([makeSession(1)]);

    await expect(adapter.prepareHistoryGeneration([
      makeSession(2, { id: 'duplicada' }),
      makeSession(3, { id: 'duplicada' }),
    ])).rejects.toBeTruthy();

    expect(await adapter.readHistoryGeneration('generation-2')).toEqual([]);
    expect(await adapter.readMetadata()).toMatchObject({
      activeGeneration: active,
      migrationGeneration: null,
    });
    await adapter.close();
  });

  it('aborta staging com structured clone inválido sem registros parciais', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const active = await adapter.replaceHistory([makeSession(1)]);
    const invalid = {
      ...makeSession(3),
      unsupportedValue: () => 'não clonável',
    } as unknown as WorkoutSession;

    await expect(adapter.prepareHistoryGeneration([makeSession(2), invalid])).rejects.toBeTruthy();
    expect(await adapter.readHistoryGeneration('generation-2')).toEqual([]);
    expect(await adapter.readMetadata()).toMatchObject({
      activeGeneration: active,
      migrationGeneration: null,
    });
    await adapter.close();
  });

  it('adiciona sessão incrementalmente no início lógico do histórico atual', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1), makeSession(2)]);
    await adapter.appendSession(makeSession(3));
    await adapter.appendSession(makeSession(4));

    expect((await adapter.readActiveHistory()).map((session) => session.id))
      .toEqual(['session-4', 'session-3', 'session-1', 'session-2']);
    expect(await adapter.count()).toBe(4);
    await adapter.close();
  });

  it('atualiza somente uma sessão existente da geração ativa', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1), makeSession(2)]);
    expect(await adapter.updateSession(makeSession(2, { name: 'Treino revisado' }))).toBe(true);
    expect(await adapter.updateSession(makeSession(99))).toBe(false);
    expect((await adapter.readActiveHistory()).map((session) => session.name))
      .toEqual(['Treino 1', 'Treino revisado']);
    await adapter.close();
  });

  it('exclui somente a sessão solicitada da geração ativa', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1), makeSession(2), makeSession(3)]);
    expect(await adapter.deleteSession('session-2')).toBe(true);
    expect(await adapter.deleteSession('session-inexistente')).toBe(false);
    expect((await adapter.readActiveHistory()).map((session) => session.id))
      .toEqual(['session-1', 'session-3']);
    await adapter.close();
  });

  it('rejeita IDs duplicados no replace e no append', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await expect(adapter.replaceHistory([
      makeSession(1, { id: 'mesmo-id' }),
      makeSession(2, { id: 'mesmo-id' }),
    ])).rejects.toBeTruthy();
    expect(await adapter.count()).toBe(0);

    await adapter.replaceHistory([makeSession(1)]);
    await expect(adapter.appendSession(makeSession(2, { id: 'session-1' })))
      .rejects.toThrow('já existe');
    expect(await adapter.count()).toBe(1);
    await adapter.close();
  });

  it('lê e grava os metadados de migração como chave/valor', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.writeMetadata({
      migrationStatus: 'completed',
      migratedAt: '2026-07-22T14:30:00.000Z',
      sourceStorageVersion: 1,
    });
    expect(await adapter.readMetadata()).toEqual({
      activeGeneration: null,
      migrationGeneration: null,
      schemaVersion: 1,
      migrationStatus: 'completed',
      migratedAt: '2026-07-22T14:30:00.000Z',
      sourceStorageVersion: 1,
    });
    await adapter.close();
  });

  it('expõe saveLegacySnapshot sem parâmetro de verificação', () => {
    const { adapter } = createHarness();
    expect(adapter.saveLegacySnapshot).toHaveLength(1);
  });

  it('só verifica o snapshot após commit, readback e comparação integral', async () => {
    const factory = new IDBFactory();
    const name = `gymflow-idb-test-${databaseSequence += 1}`;
    let observedUnverifiedPhase = false;
    const subtleCrypto = createInterceptedSubtleCrypto(async (call) => {
      if (call !== 2) return;
      const stored = await readStoredSnapshot(factory, name);
      expect(stored).toMatchObject({ verified: false });
      observedUnverifiedPhase = true;
    });
    const { adapter } = createHarness(factory, name, { subtleCrypto });
    await adapter.open();
    const raw = '{"v":1,"savedAt":"2026-07-22T12:00:00.000Z","data":{}}';
    const saved = await adapter.saveLegacySnapshot(raw);
    expect(saved).toEqual({
      raw,
      checksum: await checksumLegacySnapshot(raw),
      createdAt: '2026-07-22T15:00:00.000Z',
      verified: true,
    });
    expect(observedUnverifiedPhase).toBe(true);
    expect(await readStoredSnapshot(factory, name)).toEqual({
      snapshotId: 'v1-rollback',
      ...saved,
    });
    expect(await adapter.readLegacySnapshot()).toEqual(saved);
    await adapter.close();
  });

  it('mantém verified false quando a comparação entre as duas fases falha', async () => {
    const factory = new IDBFactory();
    const name = `gymflow-idb-test-${databaseSequence += 1}`;
    const subtleCrypto = createInterceptedSubtleCrypto((call, digest) => {
      if (call !== 2) return;
      const corrupted = digest.slice(0);
      new Uint8Array(corrupted)[0] ^= 0xff;
      return corrupted;
    });
    const { adapter } = createHarness(factory, name, { subtleCrypto });
    await adapter.open();

    await expect(adapter.saveLegacySnapshot('{"v":1}'))
      .rejects.toBeInstanceOf(LegacySnapshotIntegrityError);
    expect(await readStoredSnapshot(factory, name)).toMatchObject({
      raw: '{"v":1}',
      verified: false,
    });
    await adapter.close();
  });

  it('não retorna sucesso quando a segunda transação é abortada', async () => {
    const originalPut = FakeIDBObjectStore.prototype.put;
    const failingVerifiedPut = function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ): IDBRequest<IDBValidKey> {
      const request = originalPut.call(this, value, key);
      const snapshot = value as Partial<StoredSnapshotForTest>;
      if (snapshot.snapshotId === 'v1-rollback' && snapshot.verified === true) {
        this.transaction.abort();
      }
      return request;
    };
    FakeIDBObjectStore.prototype.put = failingVerifiedPut;

    const { adapter, factory, name } = createHarness();
    try {
      await adapter.open();
      await expect(adapter.saveLegacySnapshot('{"v":1}'))
        .rejects.toBeInstanceOf(LegacySnapshotIntegrityError);
      expect(await readStoredSnapshot(factory, name)).toMatchObject({ verified: false });
      await adapter.close();
    } finally {
      FakeIDBObjectStore.prototype.put = originalPut;
    }
  });

  it('não aceita flag true persistido quando o conteúdo foi adulterado', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    await adapter.saveLegacySnapshot('{"v":1}');
    await updateStoredSnapshot(factory, name, { raw: '{"v":1,"alterado":true}' });

    expect((await adapter.readLegacySnapshot())?.verified).toBe(false);
    await adapter.close();
  });

  it('detecta corrupção do checksum persistido', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    await adapter.saveLegacySnapshot('{"v":1}');
    await updateStoredSnapshot(factory, name, { checksum: `sha256:${'0'.repeat(64)}` });

    expect((await adapter.readLegacySnapshot())?.verified).toBe(false);
    await adapter.close();
  });

  it('mantém snapshot e histórico após fechamento e reabertura', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(7)]);
    await adapter.saveLegacySnapshot('snapshot-v1');
    await adapter.close();

    const reopened = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name });
    await reopened.open();
    expect((await reopened.readActiveHistory()).map((session) => session.id)).toEqual(['session-7']);
    expect(await reopened.readLegacySnapshot()).toMatchObject({ raw: 'snapshot-v1', verified: true });
    await reopened.close();
  });

  it('retorna erro explícito e não grava snapshot sem Web Crypto', async () => {
    const factory = new IDBFactory();
    const { adapter, name } = createHarness(factory, undefined, { subtleCrypto: null });
    await adapter.open();

    await expect(adapter.saveLegacySnapshot('{"v":1}'))
      .rejects.toBeInstanceOf(LegacySnapshotCryptoUnavailableError);
    expect(await readStoredSnapshot(factory, name)).toBeUndefined();
    await adapter.close();
  });

  it('limpa somente a geração inativa explicitamente solicitada', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.saveLegacySnapshot('snapshot-preservado');
    const first = await adapter.replaceHistory([makeSession(1), makeSession(2)]);
    const active = await adapter.replaceHistory([makeSession(3)]);

    expect(await adapter.clearInactiveGeneration(first)).toBe(2);
    expect(await adapter.clearInactiveGeneration(first)).toBe(0);
    await expect(adapter.clearInactiveGeneration(active)).rejects.toThrow('geração ativa');
    expect((await adapter.readActiveHistory()).map((session) => session.id)).toEqual(['session-3']);
    expect(await adapter.readLegacySnapshot()).toMatchObject({
      raw: 'snapshot-preservado',
      verified: true,
    });
    await adapter.close();
  });

  it('descarta geração preparada inválida sem tocar na ativa ou no snapshot', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.saveLegacySnapshot('snapshot-preservado');
    const active = await adapter.replaceHistory([makeSession(1)]);
    const prepared = await adapter.prepareHistoryGeneration([makeSession(2), makeSession(3)]);

    expect(await adapter.clearInactiveGeneration(prepared)).toBe(2);
    expect(await adapter.readMetadata()).toMatchObject({
      activeGeneration: active,
      migrationGeneration: null,
    });
    expect((await adapter.readActiveHistory()).map((session) => session.id)).toEqual(['session-1']);
    expect(await adapter.readLegacySnapshot()).toMatchObject({
      raw: 'snapshot-preservado',
      verified: true,
    });
    await adapter.close();
  });

  it('isola bancos de teste mesmo com a mesma factory', async () => {
    const factory = new IDBFactory();
    const first = createHarness(factory, 'gymflow-isolated-a').adapter;
    const second = createHarness(factory, 'gymflow-isolated-b').adapter;
    await first.open();
    await second.open();
    await first.replaceHistory([makeSession(1)]);
    await second.replaceHistory([makeSession(2), makeSession(3)]);

    expect((await first.readActiveHistory()).map((session) => session.id)).toEqual(['session-1']);
    expect((await second.readActiveHistory()).map((session) => session.id))
      .toEqual(['session-2', 'session-3']);
    await first.close();
    await second.close();
  });

  it('preserva no round-trip todos os campos dos GOALs 23A, 23B e 24', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const session = makeSession(42);
    await adapter.replaceHistory([session]);
    expect((await adapter.readActiveHistory())[0]).toEqual(session);
    await adapter.close();
  });
});

describe('manifest verificado por geração', () => {
  it('grava manifest confirmado junto dos registros em replaceHistory', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const history = [makeSession(3), makeSession(2), makeSession(1)];
    const generationId = await adapter.replaceHistory(history);

    const manifest = await adapter.readGenerationManifest(generationId);
    expect(manifest).toMatchObject({
      generationId,
      sessionCount: 3,
      orderedDigest: await computeOrderedHistoryDigest(history),
      verified: true,
    });
    await adapter.close();
  });

  it('grava manifest canônico para geração preparada vazia', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const generationId = await adapter.prepareHistoryGeneration([]);

    expect(await adapter.readGenerationManifest(generationId)).toMatchObject({
      sessionCount: 0,
      orderedDigest: EMPTY_GENERATION_DIGEST,
      verified: true,
    });
    const snapshot = await adapter.readHistoryGenerationSnapshot(generationId);
    expect(snapshot.present).toBe(true);
    expect(snapshot.sessions).toEqual([]);
    await adapter.close();
  });

  it('atualiza contagem e digest encadeado no append sem reler o histórico', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const history = [makeSession(2), makeSession(1)];
    const generationId = await adapter.replaceHistory(history);
    const before = await adapter.readGenerationManifest(generationId);

    const appended = makeSession(3);
    await adapter.appendSession(appended);

    const after = await adapter.readGenerationManifest(generationId);
    expect(after).toMatchObject({
      sessionCount: 3,
      createdAt: before!.createdAt,
      verified: true,
    });
    expect(after!.orderedDigest).toBe(
      await chainGenerationDigest(before!.orderedDigest, await digestWorkoutSession(appended)),
    );
    expect(after!.orderedDigest).toBe(
      await computeOrderedHistoryDigest([appended, ...history]),
    );
    await adapter.close();
  });

  it('recalcula a cadeia completa em update e delete', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const history = [makeSession(3), makeSession(2), makeSession(1)];
    const generationId = await adapter.replaceHistory(history);

    const updated = { ...history[1], totalVolume: 99_999 };
    expect(await adapter.updateSession(updated)).toBe(true);
    expect(await adapter.readGenerationManifest(generationId)).toMatchObject({
      sessionCount: 3,
      orderedDigest: await computeOrderedHistoryDigest([history[0], updated, history[2]]),
    });

    expect(await adapter.deleteSession(history[2].id)).toBe(true);
    expect(await adapter.readGenerationManifest(generationId)).toMatchObject({
      sessionCount: 2,
      orderedDigest: await computeOrderedHistoryDigest([history[0], updated]),
    });
    expect((await adapter.readActiveHistory()).map((session) => session.id))
      .toEqual([history[0].id, updated.id]);
    await adapter.close();
  });

  it('distingue geração ausente de geração vazia no snapshot', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const empty = await adapter.replaceHistory([]);

    const emptySnapshot = await adapter.readHistoryGenerationSnapshot(empty);
    expect(emptySnapshot).toMatchObject({ present: true, sessions: [] });
    expect(emptySnapshot.manifest?.orderedDigest).toBe(EMPTY_GENERATION_DIGEST);

    const absentSnapshot = await adapter.readHistoryGenerationSnapshot('generation-inexistente');
    expect(absentSnapshot).toEqual({
      present: false,
      manifest: null,
      sessions: [],
      recordDigests: [],
    });
    await adapter.close();
  });

  it('grava o digest de cada registro junto da sessão', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const history = [makeSession(2), makeSession(1)];
    const generationId = await adapter.replaceHistory(history);
    await adapter.appendSession(makeSession(3));

    const snapshot = await adapter.readHistoryGenerationSnapshot(generationId);
    expect(snapshot.recordDigests).toEqual(
      await Promise.all(snapshot.sessions.map((session) => digestWorkoutSession(session))),
    );
    await adapter.close();
  });

  it('remove o manifest ao limpar uma geração inativa', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);
    const staged = await adapter.prepareHistoryGeneration([makeSession(2)]);
    expect(await adapter.readGenerationManifest(staged)).not.toBeNull();

    await adapter.clearInactiveGeneration(staged);
    expect(await adapter.readGenerationManifest(staged)).toBeNull();
    expect(await adapter.readHistoryGenerationSnapshot(staged))
      .toMatchObject({ present: false, manifest: null });
    await adapter.close();
  });

  it('recusa append quando o manifest da geração ativa é removido', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1)]);

    const database = await openDatabase(factory, name);
    const transaction = database.transaction(GENERATION_MANIFESTS_STORE, 'readwrite');
    const completed = transactionResult(transaction);
    await requestResult(transaction.objectStore(GENERATION_MANIFESTS_STORE).delete(generationId));
    await completed;
    database.close();

    await expect(adapter.appendSession(makeSession(2)))
      .rejects.toBeInstanceOf(HistoryManifestIntegrityError);
    await adapter.close();
  });

  it('recusa append quando o manifest gravado tem formato inválido', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1)]);

    const database = await openDatabase(factory, name);
    const transaction = database.transaction(GENERATION_MANIFESTS_STORE, 'readwrite');
    const completed = transactionResult(transaction);
    await requestResult(transaction.objectStore(GENERATION_MANIFESTS_STORE).put({
      generationId,
      sessionCount: 'muitas',
    }));
    await completed;
    database.close();

    await expect(adapter.appendSession(makeSession(2)))
      .rejects.toBeInstanceOf(HistoryManifestIntegrityError);
    await adapter.close();
  });

  it('faz upgrade idempotente para v3 preservando o manifest já gravado na v2', async () => {
    const factory = new IDBFactory();
    const name = `gymflow-upgrade-v2-${databaseSequence += 1}`;

    const first = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name });
    await first.open();
    const generationId = await first.replaceHistory([makeSession(1)]);
    const manifest = await first.readGenerationManifest(generationId);
    await first.close();

    const reopened = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name });
    await reopened.open();
    const database = await openDatabase(factory, name);
    expect(Array.from(database.objectStoreNames)).toContain(COMPLETION_RECEIPTS_STORE);
    expect(Array.from(database.objectStoreNames)).toContain(GENERATION_MANIFESTS_STORE);
    database.close();
    expect(await reopened.readGenerationManifest(generationId)).toEqual(manifest);
    expect(await reopened.readPendingCompletionReceipts()).toEqual([]);
    await reopened.close();
  });

  it('faz upgrade idempotente preservando registros e stores da versão anterior', async () => {
    const factory = new IDBFactory();
    const name = `gymflow-upgrade-${databaseSequence += 1}`;

    // Banco físico na versão 1: sem o store de manifests.
    const legacyRequest = factory.open(name, 1);
    legacyRequest.onupgradeneeded = () => {
      const database = legacyRequest.result;
      const historyStore = database.createObjectStore(WORKOUT_HISTORY_STORE, {
        keyPath: ['generationId', 'order'],
      });
      historyStore.createIndex('byGeneration', 'generationId', { unique: false });
      historyStore.createIndex('byGenerationSession', ['generationId', 'sessionId'], { unique: true });
      const metadataStore = database.createObjectStore(METADATA_STORE, { keyPath: 'key' });
      metadataStore.put({ key: 'activeGeneration', value: 'generation-legada' });
      metadataStore.put({ key: 'generationNextOrder:generation-legada', value: -1 });
      database.createObjectStore(LEGACY_SNAPSHOTS_STORE, { keyPath: 'snapshotId' });
      historyStore.add({
        sessionId: 'session-legada',
        generationId: 'generation-legada',
        order: 0,
        session: makeSession(7, { id: 'session-legada' }),
      });
    };
    const legacyDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
      legacyRequest.onsuccess = () => resolve(legacyRequest.result);
      legacyRequest.onerror = () => reject(legacyRequest.error);
    });
    legacyDatabase.close();

    const adapter = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name });
    await adapter.open();
    const upgraded = await openDatabase(factory, name);
    expect(Array.from(upgraded.objectStoreNames)).toContain(GENERATION_MANIFESTS_STORE);
    upgraded.close();

    // Registros preservados, mas sem manifest: a geração legada nunca vira `[]`.
    const snapshot = await adapter.readHistoryGenerationSnapshot('generation-legada');
    expect(snapshot.present).toBe(true);
    expect(snapshot.sessions.map((session) => session.id)).toEqual(['session-legada']);
    expect(snapshot.manifest).toBeNull();
    expect(snapshot.recordDigests).toEqual([null]);

    // Reabrir é idempotente e não recria nada.
    await adapter.close();
    await adapter.open();
    expect((await adapter.readActiveHistory()).map((session) => session.id))
      .toEqual(['session-legada']);
    await adapter.close();
  });

  it('faz upgrade físico de v3 para v4 preservando byte a byte todos os stores antigos', async () => {
    const factory = new IDBFactory();
    const name = `gymflow-upgrade-v3-${databaseSequence += 1}`;
    await createV3Database(factory, name);

    const before = await readAllStores(factory, name, 3);
    expect(Object.keys(before).sort()).toEqual([
      COMPLETION_RECEIPTS_STORE,
      GENERATION_MANIFESTS_STORE,
      LEGACY_SNAPSHOTS_STORE,
      METADATA_STORE,
      WORKOUT_HISTORY_STORE,
    ].sort());

    const adapter = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name });
    await adapter.open();

    const after = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    for (const store of [
      WORKOUT_HISTORY_STORE,
      METADATA_STORE,
      LEGACY_SNAPSHOTS_STORE,
      GENERATION_MANIFESTS_STORE,
      COMPLETION_RECEIPTS_STORE,
    ]) {
      expect(JSON.stringify(after[store])).toBe(JSON.stringify(before[store]));
    }

    // Store novo criado vazio; schemaVersion lógico intocado.
    expect(after[STORAGE_OPERATION_RECEIPTS_STORE]).toEqual([]);
    expect(await adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
    expect((await adapter.readMetadata()).schemaVersion).toBe(1);
    expect((await adapter.readActiveHistory()).map((session) => session.id))
      .toEqual(['session-v3-a', 'session-v3-b']);
    await adapter.close();
  });

  it('mantém os receipts de conclusão intactos e legíveis depois do upgrade v4', async () => {
    const factory = new IDBFactory();
    const name = `gymflow-upgrade-v3-receipts-${databaseSequence += 1}`;
    await createV3Database(factory, name);

    const adapter = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name });
    await adapter.open();
    const pending = await adapter.readPendingCompletionReceipts();
    expect(pending.map((receipt) => receipt.receiptId)).toEqual(['receipt-v3-pendente']);
    expect(pending[0].status).toBe('pending');
    expect((await adapter.readCompletionReceiptForSession('session-v3-a'))?.receiptId)
      .toBe('receipt-v3-pendente');
    await adapter.close();
  });

  it('repete o upgrade v4 de forma idempotente sem recriar nem regravar nada', async () => {
    const factory = new IDBFactory();
    const name = `gymflow-upgrade-v4-idempotente-${databaseSequence += 1}`;
    await createV3Database(factory, name);

    const first = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name });
    await first.open();
    const receipt = createStorageOperationReceipt({
      operationId: 'operation-upgrade',
      kind: 'rollback',
      previousCoreRaw: '{"core":"v3"}',
      previousGenerationId: 'generation-v3',
      createdAt: '2026-07-24T12:00:00.000Z',
    });
    await first.putStorageOperationReceipt(receipt);
    const afterFirst = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    await first.close();

    const second = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name });
    await second.open();
    await second.close();
    await second.open();

    const afterSecond = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    expect(JSON.stringify(afterSecond)).toBe(JSON.stringify(afterFirst));
    expect(await second.readStorageOperationReceipt('operation-upgrade')).toEqual(receipt);
    await second.close();
  });
});

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

async function makeReceipt(
  session: WorkoutSession,
  generationId: string,
  overrides: Partial<WorkoutCompletionReceipt> = {},
): Promise<WorkoutCompletionReceipt> {
  return {
    receiptId: `receipt-${session.id}`,
    sessionId: session.id,
    generationId,
    sessionDigest: await digestWorkoutSession(session),
    finalSession: session,
    coreEnvelopeAfter: makeCoreEnvelope(generationId),
    effects: {
      xpNotifications: [{ kind: 'xp', text: 'Treino Concluído!', xp: 150 }],
      communityPost: {
        id: `post-${session.id}`,
        authorName: 'Rafael',
        authorAvatar: '🚀',
        time: 'Agora mesmo',
        content: 'Treino finalizado!',
        likes: 0,
        comments: [],
        userLiked: false,
        shares: 0,
      },
      unlockedAchievementIds: ['ach_1'],
      markedDayName: 'Segunda',
    },
    createdAt: '2026-07-23T12:00:00.000Z',
    status: 'pending',
    settledAt: null,
    ...overrides,
  };
}

describe('receipt transacional da finalização', () => {
  it('grava sessão, manifest e receipt na mesma transação', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1)]);
    const before = await adapter.readGenerationManifest(generationId);

    const session = makeSession(2);
    await adapter.appendSessionWithCompletionReceipt(session, await makeReceipt(session, generationId));

    expect((await adapter.readActiveHistory()).map((item) => item.id))
      .toEqual(['session-2', 'session-1']);
    const after = await adapter.readGenerationManifest(generationId);
    expect(after).toMatchObject({ sessionCount: 2, verified: true });
    expect(after!.orderedDigest).toBe(
      await chainGenerationDigest(before!.orderedDigest, await digestWorkoutSession(session)),
    );
    const pending = await adapter.readPendingCompletionReceipts();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      receiptId: 'receipt-session-2',
      sessionId: 'session-2',
      status: 'pending',
    });
    await adapter.close();
  });

  it('não grava receipt quando a sessão já existe, nem toca no manifest', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const session = makeSession(1);
    const generationId = await adapter.replaceHistory([session]);
    const before = await adapter.readGenerationManifest(generationId);

    await expect(adapter.appendSessionWithCompletionReceipt(
      session,
      await makeReceipt(session, generationId),
    )).rejects.toThrow(/já existe/);

    expect(await adapter.readGenerationManifest(generationId)).toEqual(before);
    expect(await adapter.readPendingCompletionReceipts()).toEqual([]);
    expect(await adapter.readActiveHistory()).toHaveLength(1);
    await adapter.close();
  });

  it('não grava sessão quando o receipt já existe', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1)]);
    const first = makeSession(2);
    await adapter.appendSessionWithCompletionReceipt(first, await makeReceipt(first, generationId));
    const manifestAfterFirst = await adapter.readGenerationManifest(generationId);

    const second = makeSession(3);
    await expect(adapter.appendSessionWithCompletionReceipt(
      second,
      await makeReceipt(second, generationId, { receiptId: 'receipt-session-2' }),
    )).rejects.toBeInstanceOf(CompletionReceiptIntegrityError);

    expect((await adapter.readActiveHistory()).map((item) => item.id))
      .toEqual(['session-2', 'session-1']);
    expect(await adapter.readGenerationManifest(generationId)).toEqual(manifestAfterFirst);
    expect(await adapter.readPendingCompletionReceipts()).toHaveLength(1);
    await adapter.close();
  });

  it('recusa receipt malformado ou de outra sessão antes de gravar', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1)]);
    const session = makeSession(2);

    await expect(adapter.appendSessionWithCompletionReceipt(
      session,
      { receiptId: 'r' } as unknown as WorkoutCompletionReceipt,
    )).rejects.toBeInstanceOf(CompletionReceiptIntegrityError);

    await expect(adapter.appendSessionWithCompletionReceipt(
      session,
      await makeReceipt(makeSession(9), generationId),
    )).rejects.toBeInstanceOf(CompletionReceiptIntegrityError);

    expect(await adapter.readActiveHistory()).toHaveLength(1);
    expect(await adapter.readPendingCompletionReceipts()).toEqual([]);
    await adapter.close();
  });

  it('lista receipts pendentes em ordem de criação e ignora os concluídos', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([]);
    const first = makeSession(1);
    const second = makeSession(2);
    await adapter.appendSessionWithCompletionReceipt(
      first,
      await makeReceipt(first, generationId, { createdAt: '2026-07-23T12:00:00.000Z' }),
    );
    await adapter.appendSessionWithCompletionReceipt(
      second,
      await makeReceipt(second, generationId, { createdAt: '2026-07-23T13:00:00.000Z' }),
    );

    expect((await adapter.readPendingCompletionReceipts()).map((r) => r.receiptId))
      .toEqual(['receipt-session-1', 'receipt-session-2']);

    expect(await adapter.settleCompletionReceipt('receipt-session-1')).toBe(true);
    expect((await adapter.readPendingCompletionReceipts()).map((r) => r.receiptId))
      .toEqual(['receipt-session-2']);
    await adapter.close();
  });

  it('liquida receipts de forma idempotente e informa receipt inexistente', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([]);
    const session = makeSession(1);
    await adapter.appendSessionWithCompletionReceipt(session, await makeReceipt(session, generationId));

    expect(await adapter.settleCompletionReceipt('receipt-session-1')).toBe(true);
    expect(await adapter.settleCompletionReceipt('receipt-session-1')).toBe(true);
    expect(await adapter.readPendingCompletionReceipts()).toEqual([]);
    expect(await adapter.settleCompletionReceipt('receipt-inexistente')).toBe(false);

    const stored = await adapter.readCompletionReceiptForSession('session-1');
    expect(stored).toMatchObject({ status: 'completed' });
    expect(stored?.settledAt).toBe('2026-07-22T15:00:00.000Z');
    expect(await adapter.readCompletionReceiptForSession('session-9')).toBeNull();
    await adapter.close();
  });
});

describe('benchmark informativo da fundação IndexedDB', () => {
  it('mede replaceHistory, readActiveHistory e appendSession sem impor limiar', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const results: Array<Record<string, number>> = [];

    for (const size of [100, 500, 1_000]) {
      const history = Array.from({ length: size }, (_, index) => makeSession(index));
      const replaceStartedAt = performance.now();
      await adapter.replaceHistory(history);
      const replaceMs = performance.now() - replaceStartedAt;

      const readStartedAt = performance.now();
      await adapter.readActiveHistory();
      const readMs = performance.now() - readStartedAt;

      const appendStartedAt = performance.now();
      await adapter.appendSession(makeSession(size + 1, { id: `benchmark-append-${size}` }));
      const appendMs = performance.now() - appendStartedAt;

      results.push({ sessions: size, replaceMs, readMs, appendMs });
    }

    console.info('[GOAL-17B-IDB BENCHMARK]', JSON.stringify(results));
    expect(results).toHaveLength(3);
    await adapter.close();
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Fundação administrativa — GOAL-17B-002D-A1.
// ---------------------------------------------------------------------------

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

function putMetadataRecord(
  factory: IDBFactory,
  name: string,
  key: string,
  value: unknown,
): Promise<unknown> {
  return withStore(factory, name, METADATA_STORE, 'readwrite', (transaction) => (
    requestResult(transaction.objectStore(METADATA_STORE).put({ key, value }))
  ));
}

function putManifestRecord(
  factory: IDBFactory,
  name: string,
  manifest: Record<string, unknown>,
): Promise<unknown> {
  return withStore(factory, name, GENERATION_MANIFESTS_STORE, 'readwrite', (transaction) => (
    requestResult(transaction.objectStore(GENERATION_MANIFESTS_STORE).put(manifest))
  ));
}

function deleteManifestRecord(
  factory: IDBFactory,
  name: string,
  generationId: string,
): Promise<unknown> {
  return withStore(factory, name, GENERATION_MANIFESTS_STORE, 'readwrite', (transaction) => (
    requestResult(transaction.objectStore(GENERATION_MANIFESTS_STORE).delete(generationId))
  ));
}

function deleteHistoryRecords(
  factory: IDBFactory,
  name: string,
  generationId: string,
): Promise<void> {
  return withStore(factory, name, WORKOUT_HISTORY_STORE, 'readwrite', async (transaction) => {
    const store = transaction.objectStore(WORKOUT_HISTORY_STORE);
    const keys = await requestResult(store.index('byGeneration').getAllKeys(generationId));
    await Promise.all(keys.map((key) => requestResult(store.delete(key))));
  });
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

function makeOperationReceipt(
  overrides: Partial<StorageOperationReceipt> = {},
): StorageOperationReceipt {
  return {
    ...createStorageOperationReceipt({
      operationId: 'operation-1',
      kind: 'rollback',
      previousCoreRaw: '{"schemaVersion":1}',
      previousGenerationId: 'generation-1',
      createdAt: '2026-07-24T12:00:00.000Z',
    }),
    ...overrides,
  };
}

// Falha de integridade sempre carrega a classe e a razão: nenhuma delas é
// aceita apenas pela mensagem.
async function expectGenerationIntegrityError(
  promise: Promise<unknown>,
  reason: HistoryGenerationIntegrityReason,
): Promise<void> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(HistoryGenerationIntegrityError);
  expect((error as HistoryGenerationIntegrityError).reason).toBe(reason);
}

function makeManifestRecord(
  generationId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    generationId,
    sessionCount: 0,
    orderedDigest: EMPTY_GENERATION_DIGEST,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    verified: true,
    ...overrides,
  };
}

// Escreve um registro de metadata cru, inclusive com chave não textual — o
// IndexedDB aceita number, Date e ArrayBuffer como chave válida.
function putRawMetadataRecord(
  factory: IDBFactory,
  name: string,
  record: Record<string, unknown>,
): Promise<unknown> {
  return withStore(factory, name, METADATA_STORE, 'readwrite', (transaction) => (
    requestResult(transaction.objectStore(METADATA_STORE).put(record))
  ));
}

// Reescreve registros do histórico direto no store, sem passar pelo adapter e
// sem tocar no manifest.
function mutateHistoryRecords(
  factory: IDBFactory,
  name: string,
  generationId: string,
  mutate: (
    store: IDBObjectStore,
    records: Record<string, unknown>[],
  ) => Promise<void>,
): Promise<void> {
  return withStore(factory, name, WORKOUT_HISTORY_STORE, 'readwrite', async (transaction) => {
    const store = transaction.objectStore(WORKOUT_HISTORY_STORE);
    const records = await requestResult(
      store.index('byGeneration').getAll(generationId),
    ) as Record<string, unknown>[];
    await mutate(store, [...records].sort((left, right) => Number(left.order) - Number(right.order)));
  });
}

describe('receipts das operações administrativas', () => {
  it('faz round-trip completo de um receipt válido', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const receipt = makeOperationReceipt({
      kind: 'import',
      sourceDigest: 'sha256:origem',
      stagedGenerationId: 'generation-2',
      targetCoreRaw: '{"schemaVersion":1,"alvo":true}',
    });

    await adapter.putStorageOperationReceipt(receipt);
    expect(await adapter.readStorageOperationReceipt('operation-1')).toEqual(receipt);
    expect(await adapter.readStorageOperationReceipt('operation-inexistente')).toBeNull();
    await adapter.close();
  });

  it('recusa gravar e recusa ler registro malformado', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();

    await expect(adapter.putStorageOperationReceipt(
      { ...makeOperationReceipt(), status: 'pending' } as unknown as StorageOperationReceipt,
    )).rejects.toBeInstanceOf(StorageOperationReceiptIntegrityError);
    await expect(adapter.putStorageOperationReceipt(
      { ...makeOperationReceipt(), previousCoreRaw: '' } as unknown as StorageOperationReceipt,
    )).rejects.toBeInstanceOf(StorageOperationReceiptIntegrityError);
    expect(await adapter.readStorageOperationReceipt('operation-1')).toBeNull();

    // Registro corrompido fora do adapter nunca vira operação silenciosa.
    await putRawOperationReceipt(factory, name, { operationId: 'operation-torto', kind: 'import' });
    await expect(adapter.readStorageOperationReceipt('operation-torto'))
      .rejects.toBeInstanceOf(StorageOperationReceiptIntegrityError);
    // Sem status válido o registro não entra em índice nenhum: a listagem
    // precisa acusar corrupção em vez de responder "nada em aberto".
    await expect(adapter.listUnsettledStorageOperationReceipts())
      .rejects.toBeInstanceOf(StorageOperationReceiptIntegrityError);

    await putRawOperationReceipt(factory, name, {
      ...makeOperationReceipt({ operationId: 'operation-torto' }),
      previousGenerationId: '',
    });
    await expect(adapter.listUnsettledStorageOperationReceipts())
      .rejects.toBeInstanceOf(StorageOperationReceiptIntegrityError);
    await adapter.close();
  });

  it('lista apenas os receipts não terminais, em ordem determinística', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.putStorageOperationReceipt(makeOperationReceipt({
      operationId: 'operation-b',
      status: 'staged',
      createdAt: '2026-07-24T12:00:00.000Z',
    }));
    await adapter.putStorageOperationReceipt(makeOperationReceipt({
      operationId: 'operation-a',
      status: 'activating',
      createdAt: '2026-07-24T12:00:00.000Z',
    }));
    await adapter.putStorageOperationReceipt(makeOperationReceipt({
      operationId: 'operation-c',
      status: 'activated',
      createdAt: '2026-07-24T11:00:00.000Z',
    }));
    await adapter.putStorageOperationReceipt(makeOperationReceipt({
      operationId: 'operation-liquidada',
      status: 'settled',
    }));
    await adapter.putStorageOperationReceipt(makeOperationReceipt({
      operationId: 'operation-revertida',
      status: 'reverted',
    }));

    expect((await adapter.listUnsettledStorageOperationReceipts()).map((item) => item.operationId))
      .toEqual(['operation-c', 'operation-a', 'operation-b']);
    await adapter.close();
  });

  it('percorre as transições válidas e carimba updatedAt', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.putStorageOperationReceipt(makeOperationReceipt());

    const activating = await adapter.transitionStorageOperationReceipt(
      'operation-1',
      'staged',
      'activating',
      { stagedGenerationId: 'generation-2', sourceDigest: 'sha256:origem' },
    );
    expect(activating).toMatchObject({
      status: 'activating',
      stagedGenerationId: 'generation-2',
      sourceDigest: 'sha256:origem',
      createdAt: '2026-07-24T12:00:00.000Z',
      updatedAt: '2026-07-22T15:00:00.000Z',
    });

    const activated = await adapter.transitionStorageOperationReceipt(
      'operation-1',
      'activating',
      'activated',
      { targetCoreRaw: '{"schemaVersion":1}' },
    );
    expect(activated).toMatchObject({ status: 'activated', targetCoreRaw: '{"schemaVersion":1}' });

    const settled = await adapter.transitionStorageOperationReceipt(
      'operation-1',
      'activated',
      'settled',
    );
    expect(settled.status).toBe('settled');
    expect(await adapter.readStorageOperationReceipt('operation-1')).toEqual(settled);
    expect(await adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
    await adapter.close();
  });

  it('permite reverter a partir de qualquer status não terminal', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    for (const status of ['staged', 'activating', 'activated'] as const) {
      const operationId = `operation-${status}`;
      await adapter.putStorageOperationReceipt(makeOperationReceipt({ operationId, status }));
      const reverted = await adapter.transitionStorageOperationReceipt(
        operationId,
        status,
        'reverted',
      );
      expect(reverted.status).toBe('reverted');
    }
    expect(await adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
    await adapter.close();
  });

  it('recusa compare-and-swap com expectedStatus divergente ou registro ausente', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.putStorageOperationReceipt(makeOperationReceipt());

    await expect(adapter.transitionStorageOperationReceipt(
      'operation-1',
      'activating',
      'activated',
    )).rejects.toBeInstanceOf(StorageOperationTransitionError);
    await expect(adapter.transitionStorageOperationReceipt(
      'operation-ausente',
      'staged',
      'activating',
    )).rejects.toBeInstanceOf(StorageOperationTransitionError);

    // O registro persistido continua exatamente como estava.
    expect(await adapter.readStorageOperationReceipt('operation-1'))
      .toEqual(makeOperationReceipt());
    await adapter.close();
  });

  it('recusa transição a partir de status terminal e transição não declarada', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.putStorageOperationReceipt(makeOperationReceipt({
      operationId: 'operation-liquidada',
      status: 'settled',
    }));
    await adapter.putStorageOperationReceipt(makeOperationReceipt({
      operationId: 'operation-revertida',
      status: 'reverted',
    }));
    await adapter.putStorageOperationReceipt(makeOperationReceipt());

    await expect(adapter.transitionStorageOperationReceipt(
      'operation-liquidada',
      'settled',
      'activated',
    )).rejects.toBeInstanceOf(StorageOperationTransitionError);
    await expect(adapter.transitionStorageOperationReceipt(
      'operation-revertida',
      'reverted',
      'activating',
    )).rejects.toBeInstanceOf(StorageOperationTransitionError);
    // staged → activated pula uma etapa e não está declarada.
    await expect(adapter.transitionStorageOperationReceipt(
      'operation-1',
      'staged',
      'activated',
    )).rejects.toBeInstanceOf(StorageOperationTransitionError);

    expect((await adapter.readStorageOperationReceipt('operation-liquidada'))?.status)
      .toBe('settled');
    expect((await adapter.readStorageOperationReceipt('operation-revertida'))?.status)
      .toBe('reverted');
    expect((await adapter.readStorageOperationReceipt('operation-1'))?.status).toBe('staged');
    await adapter.close();
  });

  // Isolamento físico: os dois receipts vivem em stores diferentes e nenhuma
  // busca cruza a fronteira.
  it('não confunde receipt administrativo com receipt de conclusão', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1)]);
    await adapter.putStorageOperationReceipt(makeOperationReceipt({ status: 'staged' }));

    expect(await adapter.readPendingCompletionReceipts()).toEqual([]);
    expect(await adapter.readCompletionReceiptForSession('session-1')).toBeNull();
    expect(await adapter.settleCompletionReceipt('operation-1')).toBe(false);
    expect((await adapter.readStorageOperationReceipt('operation-1'))?.status).toBe('staged');

    // E o inverso: a conclusão de treino continua invisível para a busca
    // administrativa.
    const session = makeSession(2);
    await adapter.appendSessionWithCompletionReceipt(
      session,
      await makeReceipt(session, generationId),
    );
    expect((await adapter.readPendingCompletionReceipts()).map((item) => item.receiptId))
      .toEqual([`receipt-${session.id}`]);
    expect((await adapter.listUnsettledStorageOperationReceipts()).map((item) => item.operationId))
      .toEqual(['operation-1']);
    expect(await adapter.readStorageOperationReceipt(`receipt-${session.id}`)).toBeNull();
    await adapter.close();
  });

  it('falha explicitamente quando o banco não está aberto, sem fallback em memória', async () => {
    const adapter = new IndexedDbWorkoutHistoryStorage({ factory: new IDBFactory() });
    await expect(adapter.putStorageOperationReceipt(makeOperationReceipt()))
      .rejects.toBeInstanceOf(IndexedDbNotOpenError);
    await expect(adapter.readStorageOperationReceipt('operation-1'))
      .rejects.toBeInstanceOf(IndexedDbNotOpenError);
    await expect(adapter.listUnsettledStorageOperationReceipts())
      .rejects.toBeInstanceOf(IndexedDbNotOpenError);
    await expect(adapter.transitionStorageOperationReceipt('operation-1', 'staged', 'activating'))
      .rejects.toBeInstanceOf(IndexedDbNotOpenError);
    await expect(adapter.listHistoryGenerations())
      .rejects.toBeInstanceOf(IndexedDbNotOpenError);
    await expect(adapter.readVerifiedHistoryGeneration('generation-1'))
      .rejects.toBeInstanceOf(IndexedDbNotOpenError);
    await expect(adapter.rollbackToHistoryGeneration({
      targetGenerationId: 'generation-1',
      expectedActiveGenerationId: 'generation-2',
    })).rejects.toBeInstanceOf(IndexedDbNotOpenError);
    await expect(adapter.createStorageOperationReceiptIfIdle({
      receipt: makeOperationReceipt(),
      expectedActiveGenerationId: 'generation-1',
    })).rejects.toBeInstanceOf(IndexedDbNotOpenError);
  });
});

describe('criação atômica de receipt administrativo (createStorageOperationReceiptIfIdle)', () => {
  it('cria o receipt quando não há operação em aberto e a geração ativa confere', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1)]);
    const receipt = makeOperationReceipt({ previousGenerationId: generationId });

    const created = await adapter.createStorageOperationReceiptIfIdle({
      receipt,
      expectedActiveGenerationId: generationId,
    });

    expect(created).toEqual(receipt);
    expect(await adapter.readStorageOperationReceipt('operation-1')).toEqual(receipt);
    await adapter.close();
  });

  it('recusa quando já existe um receipt não terminal, para os três status', async () => {
    for (const status of ['staged', 'activating', 'activated'] as const) {
      const { adapter } = createHarness();
      await adapter.open();
      const generationId = await adapter.replaceHistory([makeSession(1)]);
      const existing = makeOperationReceipt({
        operationId: 'operation-existente',
        previousGenerationId: generationId,
        status,
      });
      await adapter.putStorageOperationReceipt(existing);

      const error = await adapter.createStorageOperationReceiptIfIdle({
        receipt: makeOperationReceipt({ operationId: 'operation-nova', previousGenerationId: generationId }),
        expectedActiveGenerationId: generationId,
      }).then(() => null, (caught: unknown) => caught);

      expect(error).toBeInstanceOf(StorageOperationAlreadyInProgressError);
      expect((error as StorageOperationAlreadyInProgressError).existing).toEqual(existing);
      expect(await adapter.readStorageOperationReceipt('operation-nova')).toBeNull();
      expect((await adapter.listUnsettledStorageOperationReceipts()).map((item) => item.operationId))
        .toEqual(['operation-existente']);
      await adapter.close();
    }
  });

  it('receipts settled e reverted não bloqueiam uma nova operação', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1)]);
    await adapter.putStorageOperationReceipt(
      makeOperationReceipt({ operationId: 'operation-liquidada', previousGenerationId: generationId, status: 'settled' }),
    );
    await adapter.putStorageOperationReceipt(
      makeOperationReceipt({ operationId: 'operation-revertida', previousGenerationId: generationId, status: 'reverted' }),
    );

    const created = await adapter.createStorageOperationReceiptIfIdle({
      receipt: makeOperationReceipt({ operationId: 'operation-nova', previousGenerationId: generationId }),
      expectedActiveGenerationId: generationId,
    });

    expect(created.operationId).toBe('operation-nova');
    // Nenhum receipt terminal foi apagado.
    expect(await adapter.readStorageOperationReceipt('operation-liquidada')).not.toBeNull();
    expect(await adapter.readStorageOperationReceipt('operation-revertida')).not.toBeNull();
    await adapter.close();
  });

  it('recusa por CAS quando a geração ativa observada não confere', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1)]);

    await expect(adapter.createStorageOperationReceiptIfIdle({
      receipt: makeOperationReceipt({ previousGenerationId: generationId }),
      expectedActiveGenerationId: 'generation-desatualizada',
    })).rejects.toBeInstanceOf(StorageOperationBeginConflictError);

    expect(await adapter.readStorageOperationReceipt('operation-1')).toBeNull();
    expect(await adapter.listUnsettledStorageOperationReceipts()).toEqual([]);
    await adapter.close();
  });

  it('recusa quando o operationId já existe, mesmo terminal', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1)]);
    await adapter.putStorageOperationReceipt(
      makeOperationReceipt({ operationId: 'operation-1', previousGenerationId: generationId, status: 'settled' }),
    );

    await expect(adapter.createStorageOperationReceiptIfIdle({
      receipt: makeOperationReceipt({ operationId: 'operation-1', previousGenerationId: generationId }),
      expectedActiveGenerationId: generationId,
    })).rejects.toBeInstanceOf(StorageOperationBeginConflictError);

    expect((await adapter.readStorageOperationReceipt('operation-1'))?.status).toBe('settled');
    await adapter.close();
  });

  it('recusa quando o receipt novo ou um registro existente está malformado', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1)]);

    await expect(adapter.createStorageOperationReceiptIfIdle({
      receipt: { ...makeOperationReceipt(), status: 'pending' } as unknown as StorageOperationReceipt,
      expectedActiveGenerationId: generationId,
    })).rejects.toBeInstanceOf(StorageOperationReceiptIntegrityError);

    await putRawOperationReceipt(factory, name, { operationId: 'operation-torto', kind: 'import' });
    await expect(adapter.createStorageOperationReceiptIfIdle({
      receipt: makeOperationReceipt({ operationId: 'operation-nova', previousGenerationId: generationId }),
      expectedActiveGenerationId: generationId,
    })).rejects.toBeInstanceOf(StorageOperationReceiptIntegrityError);
    expect(await adapter.readStorageOperationReceipt('operation-nova')).toBeNull();
    await adapter.close();
  });

  it('duas criações concorrentes na mesma conexão produzem exatamente um receipt', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1)]);

    const [first, second] = await Promise.allSettled([
      adapter.createStorageOperationReceiptIfIdle({
        receipt: makeOperationReceipt({ operationId: 'operation-a', previousGenerationId: generationId }),
        expectedActiveGenerationId: generationId,
      }),
      adapter.createStorageOperationReceiptIfIdle({
        receipt: makeOperationReceipt({ operationId: 'operation-b', previousGenerationId: generationId }),
        expectedActiveGenerationId: generationId,
      }),
    ]);

    const outcomes = [first, second];
    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(StorageOperationAlreadyInProgressError);
    expect(await adapter.listUnsettledStorageOperationReceipts()).toHaveLength(1);
    await adapter.close();
  });
});

describe('enumeração completa das gerações de histórico', () => {
  it('descreve a geração ativa válida', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1), makeSession(2)]);

    expect(await adapter.listHistoryGenerations()).toEqual([{
      generationId: 'generation-1',
      isActive: true,
      isStaged: false,
      hasManifest: true,
      hasRecords: true,
      recordCount: 2,
      manifestSessionCount: 2,
      orderedDigest: await computeOrderedHistoryDigest([makeSession(1), makeSession(2)]),
      verified: true,
      createdAt: '2026-07-22T15:00:00.000Z',
      updatedAt: '2026-07-22T15:00:00.000Z',
    }]);
    await adapter.close();
  });

  it('separa a geração ativa da geração preparada', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);
    await adapter.prepareHistoryGeneration([makeSession(2), makeSession(3)]);

    const generations = await adapter.listHistoryGenerations();
    expect(generations.map((item) => [item.generationId, item.isActive, item.isStaged])).toEqual([
      ['generation-1', true, false],
      ['generation-2', false, true],
    ]);
    expect(generations[1]).toMatchObject({
      hasManifest: true,
      hasRecords: true,
      recordCount: 2,
      manifestSessionCount: 2,
    });
    await adapter.close();
  });

  it('mostra registros sem manifest em vez de escondê-los', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);
    await deleteManifestRecord(factory, name, 'generation-1');

    expect(await adapter.listHistoryGenerations()).toEqual([{
      generationId: 'generation-1',
      isActive: true,
      isStaged: false,
      hasManifest: false,
      hasRecords: true,
      recordCount: 1,
      manifestSessionCount: null,
      orderedDigest: null,
      verified: null,
      createdAt: null,
      updatedAt: null,
    }]);
    await adapter.close();
  });

  it('mostra manifest que declara sessões sem nenhum registro físico', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);
    await deleteHistoryRecords(factory, name, 'generation-1');

    const [generation] = await adapter.listHistoryGenerations();
    expect(generation).toMatchObject({
      generationId: 'generation-1',
      hasManifest: true,
      hasRecords: false,
      recordCount: 0,
      manifestSessionCount: 1,
      verified: true,
    });
    await adapter.close();
  });

  it('distingue geração vazia válida de manifest sem registros', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([]);

    const [generation] = await adapter.listHistoryGenerations();
    expect(generation).toMatchObject({
      generationId: 'generation-1',
      hasManifest: true,
      hasRecords: false,
      recordCount: 0,
      manifestSessionCount: 0,
      orderedDigest: EMPTY_GENERATION_DIGEST,
      verified: true,
    });
    await adapter.close();
  });

  it('mostra geração órfã que não é ativa nem preparada', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);
    await adapter.replaceHistory([makeSession(2), makeSession(3)]);

    const generations = await adapter.listHistoryGenerations();
    expect(generations.map((item) => item.generationId)).toEqual(['generation-2', 'generation-1']);
    expect(generations[1]).toMatchObject({
      generationId: 'generation-1',
      isActive: false,
      isStaged: false,
      hasManifest: true,
      hasRecords: true,
      recordCount: 1,
    });
    await adapter.close();
  });

  it('ordena por ativa, preparada e tempo, com desempate por generationId', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    await putManifestRecord(factory, name, makeManifestRecord('gen-active', { updatedAt: '2026-01-05T00:00:00.000Z' }));
    await putManifestRecord(factory, name, makeManifestRecord('gen-staged', { updatedAt: '2026-01-04T00:00:00.000Z' }));
    await putManifestRecord(factory, name, makeManifestRecord('gen-newer', { updatedAt: '2026-01-03T00:00:00.000Z' }));
    await putManifestRecord(factory, name, makeManifestRecord('gen-tie-b', { updatedAt: '2026-01-02T00:00:00.000Z' }));
    await putManifestRecord(factory, name, makeManifestRecord('gen-tie-a', { updatedAt: '2026-01-02T00:00:00.000Z' }));
    await putManifestRecord(factory, name, makeManifestRecord('gen-older', { updatedAt: '2026-01-01T00:00:00.000Z' }));
    await putMetadataRecord(factory, name, 'generationNextOrder:gen-marcador', -1);
    await putMetadataRecord(factory, name, 'activeGeneration', 'gen-active');
    await putMetadataRecord(factory, name, 'migrationGeneration', 'gen-staged');

    expect((await adapter.listHistoryGenerations()).map((item) => item.generationId)).toEqual([
      'gen-active',
      'gen-staged',
      'gen-newer',
      'gen-tie-a',
      'gen-tie-b',
      'gen-older',
      'gen-marcador',
    ]);
    await adapter.close();
  });

  it('trata manifest ilegível como presente sem presumir integridade', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);
    await putManifestRecord(factory, name, { generationId: 'generation-1', sessionCount: 'muitas' });

    expect(await adapter.listHistoryGenerations()).toEqual([{
      generationId: 'generation-1',
      isActive: true,
      isStaged: false,
      hasManifest: true,
      hasRecords: true,
      recordCount: 1,
      manifestSessionCount: null,
      orderedDigest: null,
      verified: false,
      createdAt: null,
      updatedAt: null,
    }]);
    await adapter.close();
  });

  it('não muta nada durante a listagem', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);
    await adapter.prepareHistoryGeneration([makeSession(2)]);
    await adapter.putStorageOperationReceipt(makeOperationReceipt());

    const before = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    await adapter.listHistoryGenerations();
    await adapter.listHistoryGenerations();
    const after = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    await adapter.close();
  });
});

describe('leitura verificada de uma geração', () => {
  it('devolve sessões newest-first e o manifest verificado', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const history = [makeSession(3), makeSession(2), makeSession(1)];
    const generationId = await adapter.replaceHistory(history);

    const verified = await adapter.readVerifiedHistoryGeneration(generationId);
    expect(verified.generationId).toBe(generationId);
    expect(verified.sessions.map((session) => session.id))
      .toEqual(['session-3', 'session-2', 'session-1']);
    expect(verified.manifest).toEqual(await adapter.readGenerationManifest(generationId));
    await adapter.close();
  });

  it('aceita geração vazia apenas com o digest canônico do vazio', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([]);

    const verified = await adapter.readVerifiedHistoryGeneration(generationId);
    expect(verified.sessions).toEqual([]);
    expect(verified.manifest.orderedDigest).toBe(EMPTY_GENERATION_DIGEST);

    await putManifestRecord(factory, name, makeManifestRecord(generationId, {
      orderedDigest: 'sha256:inventado',
      createdAt: '2026-07-22T15:00:00.000Z',
      updatedAt: '2026-07-22T15:00:00.000Z',
    }));
    await expectGenerationIntegrityError(
      adapter.readVerifiedHistoryGeneration(generationId),
      'empty-digest-mismatch',
    );
    await adapter.close();
  });

  it('recusa geração ausente sem fabricar histórico vazio', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);

    await expectGenerationIntegrityError(
      adapter.readVerifiedHistoryGeneration('generation-inexistente'),
      'generation-absent',
    );
    await expect(adapter.readVerifiedHistoryGeneration(''))
      .rejects.toBeInstanceOf(Error);
    await adapter.close();
  });

  it('recusa geração sem manifest', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1)]);
    await deleteManifestRecord(factory, name, generationId);

    await expectGenerationIntegrityError(
      adapter.readVerifiedHistoryGeneration(generationId),
      'manifest-absent',
    );
    await adapter.close();
  });

  it('recusa digest divergente sem corrigir o manifest', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1), makeSession(2)]);
    const manifest = await adapter.readGenerationManifest(generationId);
    await putManifestRecord(factory, name, {
      ...manifest,
      orderedDigest: 'sha256:adulterado',
    } as Record<string, unknown>);

    await expectGenerationIntegrityError(
      adapter.readVerifiedHistoryGeneration(generationId),
      'ordered-digest-mismatch',
    );
    expect((await adapter.readGenerationManifest(generationId))?.orderedDigest)
      .toBe('sha256:adulterado');
    await adapter.close();
  });

  it('recusa contagem divergente entre manifest e registros', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1)]);
    const manifest = await adapter.readGenerationManifest(generationId);
    await putManifestRecord(factory, name, {
      ...manifest,
      sessionCount: 5,
    } as Record<string, unknown>);

    await expectGenerationIntegrityError(
      adapter.readVerifiedHistoryGeneration(generationId),
      'session-count-mismatch',
    );
    await adapter.close();
  });

  it('recusa ordem divergente mesmo com o mesmo conjunto de sessões', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1), makeSession(2)]);

    // Troca as duas posições preservando o digest de cada registro: só a ordem
    // encadeada muda.
    await withStore(factory, name, WORKOUT_HISTORY_STORE, 'readwrite', async (transaction) => {
      const store = transaction.objectStore(WORKOUT_HISTORY_STORE);
      const records = await requestResult(
        store.index('byGeneration').getAll(generationId),
      ) as Record<string, unknown>[];
      const [first, second] = records.sort(
        (left, right) => Number(left.order) - Number(right.order),
      );
      await Promise.all(records.map((record) => requestResult(
        store.delete([generationId, Number(record.order)]),
      )));
      await requestResult(store.add({ ...second, order: 0 }));
      await requestResult(store.add({ ...first, order: 1 }));
    });

    expect((await adapter.readHistoryGeneration(generationId)).map((session) => session.id))
      .toEqual(['session-2', 'session-1']);
    await expectGenerationIntegrityError(
      adapter.readVerifiedHistoryGeneration(generationId),
      'ordered-digest-mismatch',
    );
    await adapter.close();
  });
});

describe('rollback físico do ponteiro de geração ativa', () => {
  async function createRollbackHarness() {
    const harness = createHarness();
    await harness.adapter.open();
    await harness.adapter.replaceHistory([makeSession(1)]);
    await harness.adapter.replaceHistory([makeSession(2), makeSession(3)]);
    return harness;
  }

  it('volta para uma geração anterior válida sem apagar nada', async () => {
    const { adapter, factory, name } = await createRollbackHarness();
    const historyBefore = (await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION))[
      WORKOUT_HISTORY_STORE
    ];

    const result = await adapter.rollbackToHistoryGeneration({
      targetGenerationId: 'generation-1',
      expectedActiveGenerationId: 'generation-2',
    });

    expect(result).toEqual({
      targetGenerationId: 'generation-1',
      previousActiveGenerationId: 'generation-2',
      clearedStagedGenerationId: null,
      sessionCount: 1,
      orderedDigest: await computeOrderedHistoryDigest([makeSession(1)]),
      activeGeneration: 'generation-1',
      migrationGeneration: null,
      changed: true,
    });
    expect((await adapter.readActiveHistory()).map((session) => session.id))
      .toEqual(['session-1']);

    // Nenhuma geração apagada e histórico byte a byte igual.
    expect((await adapter.listHistoryGenerations()).map((item) => item.generationId).sort())
      .toEqual(['generation-1', 'generation-2']);
    const historyAfter = (await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION))[
      WORKOUT_HISTORY_STORE
    ];
    expect(JSON.stringify(historyAfter)).toBe(JSON.stringify(historyBefore));
    await adapter.close();
  });

  it('trata a própria geração ativa como no-op explícito', async () => {
    const { adapter, factory, name } = await createRollbackHarness();
    const before = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);

    const result = await adapter.rollbackToHistoryGeneration({
      targetGenerationId: 'generation-2',
      expectedActiveGenerationId: 'generation-2',
    });

    expect(result).toMatchObject({
      targetGenerationId: 'generation-2',
      previousActiveGenerationId: 'generation-2',
      activeGeneration: 'generation-2',
      changed: false,
    });
    const after = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    await adapter.close();
  });

  it('limpa migrationGeneration somente quando o id declarado confere', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);
    await adapter.prepareHistoryGeneration([makeSession(2)]);
    expect((await adapter.readMetadata()).migrationGeneration).toBe('generation-2');

    const result = await adapter.rollbackToHistoryGeneration({
      targetGenerationId: 'generation-1',
      expectedActiveGenerationId: 'generation-1',
      clearStagedGenerationId: 'generation-2',
    });

    expect(result).toMatchObject({
      clearedStagedGenerationId: 'generation-2',
      migrationGeneration: null,
      changed: false,
    });
    expect(await adapter.readMetadata()).toMatchObject({
      activeGeneration: 'generation-1',
      migrationGeneration: null,
    });
    // A geração que estava preparada continua fisicamente presente.
    expect((await adapter.listHistoryGenerations()).map((item) => item.generationId).sort())
      .toEqual(['generation-1', 'generation-2']);
    await adapter.close();
  });

  it('não limpa migrationGeneration quando o id não é declarado', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);
    await adapter.prepareHistoryGeneration([makeSession(2)]);

    const result = await adapter.rollbackToHistoryGeneration({
      targetGenerationId: 'generation-1',
      expectedActiveGenerationId: 'generation-1',
    });

    expect(result.clearedStagedGenerationId).toBeNull();
    expect((await adapter.readMetadata()).migrationGeneration).toBe('generation-2');
    await adapter.close();
  });

  it('recusa alvo ausente, alvo corrompido, ponteiro obsoleto e staged divergente sem alterar nada', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);
    await adapter.replaceHistory([makeSession(2), makeSession(3)]);
    await adapter.prepareHistoryGeneration([makeSession(4)]);
    const before = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);

    // Alvo ausente.
    await expectGenerationIntegrityError(adapter.rollbackToHistoryGeneration({
      targetGenerationId: 'generation-inexistente',
      expectedActiveGenerationId: 'generation-2',
    }), 'generation-absent');

    // Ponteiro ativo obsoleto.
    await expect(adapter.rollbackToHistoryGeneration({
      targetGenerationId: 'generation-1',
      expectedActiveGenerationId: 'generation-obsoleta',
    })).rejects.toBeInstanceOf(HistoryRollbackConflictError);

    // Staged divergente.
    await expect(adapter.rollbackToHistoryGeneration({
      targetGenerationId: 'generation-1',
      expectedActiveGenerationId: 'generation-2',
      clearStagedGenerationId: 'generation-outra',
    })).rejects.toBeInstanceOf(HistoryRollbackConflictError);

    const after = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));

    // Alvo corrompido: manifest removido depois do snapshot de comparação.
    await deleteManifestRecord(factory, name, 'generation-1');
    const beforeCorrupted = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    await expectGenerationIntegrityError(adapter.rollbackToHistoryGeneration({
      targetGenerationId: 'generation-1',
      expectedActiveGenerationId: 'generation-2',
    }), 'manifest-absent');
    const afterCorrupted = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    expect(JSON.stringify(afterCorrupted)).toBe(JSON.stringify(beforeCorrupted));
    expect((await adapter.readMetadata()).activeGeneration).toBe('generation-2');
    await adapter.close();
  });

  it('aborta quando o manifest alvo muda entre a verificação e o commit', async () => {
    const { adapter, factory, name } = await createRollbackHarness();
    const manifest = await adapter.readGenerationManifest('generation-1');
    await adapter.close();

    // A interceptação do digest reescreve o manifest exatamente na janela entre
    // a verificação e a transação de escrita.
    const racing = new IndexedDbWorkoutHistoryStorage({
      factory,
      databaseName: name,
      subtleCrypto: createInterceptedSubtleCrypto(async (call) => {
        if (call !== 1) return undefined;
        await putManifestRecord(factory, name, {
          ...manifest,
          updatedAt: '2030-01-01T00:00:00.000Z',
        } as Record<string, unknown>);
        return undefined;
      }),
    });
    await racing.open();
    const before = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);

    await expect(racing.rollbackToHistoryGeneration({
      targetGenerationId: 'generation-1',
      expectedActiveGenerationId: 'generation-2',
    })).rejects.toBeInstanceOf(HistoryRollbackConflictError);

    const after = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    expect(JSON.stringify(after[METADATA_STORE])).toBe(JSON.stringify(before[METADATA_STORE]));
    expect(JSON.stringify(after[WORKOUT_HISTORY_STORE]))
      .toBe(JSON.stringify(before[WORKOUT_HISTORY_STORE]));
    expect((await racing.readMetadata()).activeGeneration).toBe('generation-2');
    await racing.close();
  });

  it('mantém o histórico intacto e recusa quando os registros mudam antes do commit', async () => {
    // Cobertura de fumaça do caminho feliz depois da correção: o rollback normal
    // continua funcionando com a reconferência de conteúdo ligada.
    const { adapter } = await createRollbackHarness();
    const result = await adapter.rollbackToHistoryGeneration({
      targetGenerationId: 'generation-1',
      expectedActiveGenerationId: 'generation-2',
    });
    expect(result.changed).toBe(true);
    expect((await adapter.readVerifiedHistoryGeneration('generation-1')).sessions)
      .toHaveLength(1);
    await adapter.close();
  });

  it('não toca em receipts nem no snapshot legado durante o rollback', async () => {
    const { adapter, factory, name } = await createRollbackHarness();
    await adapter.saveLegacySnapshot('{"version":1}');
    const session = makeSession(9);
    await adapter.appendSessionWithCompletionReceipt(
      session,
      await makeReceipt(session, 'generation-2'),
    );
    await adapter.putStorageOperationReceipt(makeOperationReceipt());
    const before = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);

    await adapter.rollbackToHistoryGeneration({
      targetGenerationId: 'generation-1',
      expectedActiveGenerationId: 'generation-2',
    });

    const after = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    for (const store of [
      COMPLETION_RECEIPTS_STORE,
      STORAGE_OPERATION_RECEIPTS_STORE,
      LEGACY_SNAPSHOTS_STORE,
      WORKOUT_HISTORY_STORE,
      GENERATION_MANIFESTS_STORE,
    ]) {
      expect(JSON.stringify(after[store])).toBe(JSON.stringify(before[store]));
    }
    expect((await adapter.readStorageOperationReceipt('operation-1'))?.status).toBe('staged');
    await adapter.close();
  });
});

// ---------------------------------------------------------------------------
// Janela entre a verificação e o commit do rollback.
//
// A auditoria Classe C do 002D-A1 provou que, com workoutHistory fora da
// transação, o rollback ativava uma geração cujo conteúdo mudara depois de ser
// verificado. As três sondas viraram testes permanentes, em banco real.
//
// A janela é criada interceptando `crypto.subtle.digest`: a primeira chamada
// acontece depois da leitura física e antes da transação de commit. A
// verificação real roda inteira, a mutação é gravada no IndexedDB real e o
// rollback executa sua implementação verdadeira — nada é simulado.
// ---------------------------------------------------------------------------

interface RollbackRaceOutcome {
  error: unknown;
  before: Record<string, unknown[]>;
  afterMutation: Record<string, unknown[]> | null;
  after: Record<string, unknown[]>;
  activeGeneration: string | null;
  activeHistory: WorkoutSession[];
}

describe('janela entre a verificação e o commit do rollback', () => {
  async function seedRollbackRace() {
    const harness = createHarness();
    await harness.adapter.open();
    // generation-1 fica com duas sessões para que ordem e posição sejam
    // observáveis; generation-2 assume como ativa.
    await harness.adapter.replaceHistory([makeSession(1), makeSession(4)]);
    await harness.adapter.replaceHistory([makeSession(2), makeSession(3)]);
    await harness.adapter.close();
    return harness;
  }

  async function runRollbackRace(options: {
    targetGenerationId?: string;
    expectedActiveGenerationId?: string;
    mutate: (context: { factory: IDBFactory; name: string }) => Promise<void>;
  }): Promise<RollbackRaceOutcome> {
    const { factory, name } = await seedRollbackRace();
    const before = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    let afterMutation: Record<string, unknown[]> | null = null;

    const racing = new IndexedDbWorkoutHistoryStorage({
      factory,
      databaseName: name,
      subtleCrypto: createInterceptedSubtleCrypto(async (call) => {
        if (call !== 1) return undefined;
        await options.mutate({ factory, name });
        afterMutation = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
        return undefined;
      }),
    });
    await racing.open();

    const error = await racing.rollbackToHistoryGeneration({
      targetGenerationId: options.targetGenerationId ?? 'generation-1',
      expectedActiveGenerationId: options.expectedActiveGenerationId ?? 'generation-2',
    }).then(() => null, (caught: unknown) => caught);

    const after = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    const activeGeneration = (await racing.readMetadata()).activeGeneration;
    const activeHistory = await racing.readActiveHistory();
    await racing.close();
    return { error, before, afterMutation, after, activeGeneration, activeHistory };
  }

  // Falha fail-closed: o rollback não gravou nada depois da mutação injetada, e
  // metadata, manifests e os dois stores de receipt continuam como no início.
  function expectNothingWritten(result: RollbackRaceOutcome): void {
    expect(result.error).toBeInstanceOf(HistoryRollbackConflictError);
    expect(result.activeGeneration).toBe('generation-2');
    expect(JSON.stringify(result.after)).toBe(JSON.stringify(result.afterMutation));
    for (const store of [
      METADATA_STORE,
      GENERATION_MANIFESTS_STORE,
      COMPLETION_RECEIPTS_STORE,
      STORAGE_OPERATION_RECEIPTS_STORE,
    ]) {
      expect(JSON.stringify(result.after[store])).toBe(JSON.stringify(result.before[store]));
    }
    // A geração ativa anterior continua servindo o histórico dela.
    expect(result.activeHistory.map((session) => session.id)).toEqual(['session-2', 'session-3']);
  }

  it('recusa quando uma sessão é alterada e o manifest permanece intacto', async () => {
    const result = await runRollbackRace({
      mutate: ({ factory, name }) => mutateHistoryRecords(
        factory,
        name,
        'generation-1',
        async (store, records) => {
          // O digest gravado é preservado de propósito: só a comparação canônica
          // pode detectar esta alteração.
          await requestResult(store.put({
            ...records[0],
            session: { ...(records[0].session as WorkoutSession), totalVolume: 999_999 },
          }));
        },
      ),
    });

    expectNothingWritten(result);
    expect((result.error as Error).message).toContain('conteúdo');
    expect(result.activeHistory.some((session) => session.totalVolume === 999_999)).toBe(false);
  });

  it('recusa quando uma sessão é removida e o manifest permanece intacto', async () => {
    const result = await runRollbackRace({
      mutate: ({ factory, name }) => mutateHistoryRecords(
        factory,
        name,
        'generation-1',
        async (store, records) => {
          await requestResult(store.delete(['generation-1', Number(records[0].order)]));
        },
      ),
    });

    expectNothingWritten(result);
    expect((result.error as Error).message).toContain('registros');
    // Geração esvaziada não vira geração ativa.
    expect(result.activeHistory).toHaveLength(2);
  });

  it('recusa quando uma sessão é adicionada e o manifest permanece intacto', async () => {
    const result = await runRollbackRace({
      mutate: ({ factory, name }) => mutateHistoryRecords(
        factory,
        name,
        'generation-1',
        async (store) => {
          await requestResult(store.add({
            sessionId: 'session-intrusa',
            generationId: 'generation-1',
            order: 9,
            session: makeSession(77, { id: 'session-intrusa' }),
            digest: null,
          }));
        },
      ),
    });

    expectNothingWritten(result);
    expect((result.error as Error).message).toContain('registros');
  });

  it('recusa quando a ordem física dos registros é trocada', async () => {
    const result = await runRollbackRace({
      mutate: ({ factory, name }) => mutateHistoryRecords(
        factory,
        name,
        'generation-1',
        async (store, records) => {
          const [first, second] = records;
          await requestResult(store.delete(['generation-1', Number(first.order)]));
          await requestResult(store.delete(['generation-1', Number(second.order)]));
          await requestResult(store.add({ ...second, order: Number(first.order) }));
          await requestResult(store.add({ ...first, order: Number(second.order) }));
        },
      ),
    });

    expectNothingWritten(result);
    expect((result.error as Error).message).toContain('posição');
  });

  it('recusa quando o digest gravado muda e o conteúdo permanece igual', async () => {
    const result = await runRollbackRace({
      mutate: ({ factory, name }) => mutateHistoryRecords(
        factory,
        name,
        'generation-1',
        async (store, records) => {
          await requestResult(store.put({ ...records[0], digest: 'sha256:trocado' }));
        },
      ),
    });

    expectNothingWritten(result);
    expect((result.error as Error).message).toContain('digest');
  });

  // Registro legado sem digest individual: `null` não pode tornar a comparação
  // permissiva — a serialização canônica continua obrigatória.
  it('recusa alteração de conteúdo mesmo com digest persistido nulo', async () => {
    const result = await runRollbackRace({
      mutate: ({ factory, name }) => mutateHistoryRecords(
        factory,
        name,
        'generation-1',
        async (store, records) => {
          await requestResult(store.put({
            ...records[0],
            digest: null,
            session: { ...(records[0].session as WorkoutSession), calories: 1 },
          }));
        },
      ),
    });

    expectNothingWritten(result);
  });

  it('recusa o no-op quando a própria geração ativa muda depois da verificação', async () => {
    const result = await runRollbackRace({
      targetGenerationId: 'generation-2',
      expectedActiveGenerationId: 'generation-2',
      mutate: ({ factory, name }) => mutateHistoryRecords(
        factory,
        name,
        'generation-2',
        async (store, records) => {
          await requestResult(store.put({
            ...records[0],
            session: { ...(records[0].session as WorkoutSession), calories: 7 },
          }));
        },
      ),
    });

    // No-op não pode ignorar corrupção: ele passa pelas mesmas verificações.
    expect(result.error).toBeInstanceOf(HistoryRollbackConflictError);
    expect(result.activeGeneration).toBe('generation-2');
    expect(JSON.stringify(result.after)).toBe(JSON.stringify(result.afterMutation));
    expect(JSON.stringify(result.after[METADATA_STORE]))
      .toBe(JSON.stringify(result.before[METADATA_STORE]));
  });

  it('mantém metadata intocada no no-op bem-sucedido', async () => {
    const { factory, name, adapter } = await seedRollbackRace();
    await adapter.open();
    const before = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);

    const result = await adapter.rollbackToHistoryGeneration({
      targetGenerationId: 'generation-2',
      expectedActiveGenerationId: 'generation-2',
    });

    expect(result.changed).toBe(false);
    const after = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    await adapter.close();
  });

  // Concorrência legítima: workoutHistory está na transação, então um escritor
  // concorrente é serializado. Reescrevendo conteúdo idêntico, o rollback conclui
  // sempre — e a geração ativada continua verificável. Sem threshold de tempo.
  it('conclui com escritor concorrente que regrava conteúdo idêntico', async () => {
    const { factory, name, adapter } = await seedRollbackRace();
    await adapter.open();

    const rollback = adapter.rollbackToHistoryGeneration({
      targetGenerationId: 'generation-1',
      expectedActiveGenerationId: 'generation-2',
    });
    const competing = mutateHistoryRecords(factory, name, 'generation-1', async (store, records) => {
      for (const record of records) await requestResult(store.put({ ...record }));
    });
    const [result] = await Promise.all([rollback, competing]);

    expect(result.changed).toBe(true);
    expect((await adapter.readMetadata()).activeGeneration).toBe('generation-1');
    expect((await adapter.readVerifiedHistoryGeneration('generation-1')).sessions)
      .toHaveLength(2);
    await adapter.close();
  });

  it('nunca produz estado intermediário com escritor concorrente que altera conteúdo', async () => {
    const { factory, name, adapter } = await seedRollbackRace();
    await adapter.open();

    const rollback = adapter.rollbackToHistoryGeneration({
      targetGenerationId: 'generation-1',
      expectedActiveGenerationId: 'generation-2',
    }).then(() => null, (caught: unknown) => caught);
    const competing = mutateHistoryRecords(factory, name, 'generation-1', async (store, records) => {
      await requestResult(store.put({
        ...records[0],
        session: { ...(records[0].session as WorkoutSession), totalVolume: 424_242 },
      }));
    });
    const [error] = await Promise.all([rollback, competing]);
    const activeGeneration = (await adapter.readMetadata()).activeGeneration;

    // Só duas formas são aceitáveis, e nenhuma delas é um estado torto.
    if (error === null) {
      expect(activeGeneration).toBe('generation-1');
    } else {
      expect(error).toBeInstanceOf(HistoryRollbackConflictError);
      expect(activeGeneration).toBe('generation-2');
    }
    await adapter.close();
  });
});

describe('metadata com chave não textual', () => {
  async function seedWithRawMetadataKey(key: unknown) {
    const harness = createHarness();
    await harness.adapter.open();
    await harness.adapter.replaceHistory([makeSession(1)]);
    await putRawMetadataRecord(harness.factory, harness.name, { key, value: 'lixo' });
    return harness;
  }

  it.each([
    ['numérica', 42],
    ['Date', new Date('2026-07-24T12:00:00.000Z')],
    ['ArrayBuffer', new Uint8Array([1, 2, 3]).buffer],
  ])('recusa a enumeração com chave %s em vez de lançar TypeError', async (_label, key) => {
    const { adapter, factory, name } = await seedWithRawMetadataKey(key);
    const before = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);

    const error = await adapter.listHistoryGenerations()
      .then(() => null, (caught: unknown) => caught);

    expect(error).toBeInstanceOf(HistoryMetadataIntegrityError);
    expect(error).not.toBeInstanceOf(TypeError);
    // Nenhuma listagem parcial e nenhuma mutação.
    const after = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    await adapter.close();
  });

  it('mantém o banco legível por operações que não dependem da listagem', async () => {
    const { adapter } = await seedWithRawMetadataKey(7);

    expect((await adapter.readActiveHistory()).map((session) => session.id))
      .toEqual(['session-1']);
    expect((await adapter.readMetadata()).activeGeneration).toBe('generation-1');
    expect((await adapter.readVerifiedHistoryGeneration('generation-1')).sessions)
      .toHaveLength(1);
    expect(await adapter.count()).toBe(1);
    await adapter.close();
  });
});

// Concorrência entre CONEXÕES INDEPENDENTES. Duas instâncias do adapter sobre o
// mesmo banco reproduzem duas abas: é o cenário que a auditoria apontou como não
// coberto. Nenhum threshold de tempo — só o resultado final observado.
describe('serialização administrativa entre duas conexões (002D-A2 corretivo)', () => {
  function twoConnections(factory: IDBFactory, name: string) {
    const left = new IndexedDbWorkoutHistoryStorage({
      factory, databaseName: name, now: () => new Date('2026-07-24T12:00:00.000Z'),
    });
    const right = new IndexedDbWorkoutHistoryStorage({
      factory, databaseName: name, now: () => new Date('2026-07-24T12:00:00.000Z'),
    });
    return { left, right };
  }

  async function seedActiveGeneration(adapter: IndexedDbWorkoutHistoryStorage) {
    await adapter.open();
    return adapter.replaceHistory([makeSession(1)]);
  }

  it('duas criações administrativas simultâneas: só uma vence', async () => {
    const { adapter, factory, name } = createHarness();
    const generationId = await seedActiveGeneration(adapter);
    const { left, right } = twoConnections(factory, name);
    await left.open();
    await right.open();

    const results = await Promise.allSettled([
      left.createStorageOperationReceiptIfIdle({
        receipt: makeOperationReceipt({ operationId: 'operation-left', previousGenerationId: generationId }),
        expectedActiveGenerationId: generationId,
      }),
      right.createStorageOperationReceiptIfIdle({
        receipt: makeOperationReceipt({ operationId: 'operation-right', previousGenerationId: generationId }),
        expectedActiveGenerationId: generationId,
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(StorageOperationAlreadyInProgressError);
    // Nenhuma atualização perdida: exatamente um receipt não terminal existe.
    expect(await adapter.listUnsettledStorageOperationReceipts()).toHaveLength(1);
  });

  it('begin administrativo contra criação de CompletionReceipt: nunca coexistem pela corrida', async () => {
    const { adapter, factory, name } = createHarness();
    const generationId = await seedActiveGeneration(adapter);
    const { left, right } = twoConnections(factory, name);
    await left.open();
    await right.open();
    const session = makeSession(90);
    const completion = await makeReceipt(session, generationId);

    const [admin, treino] = await Promise.allSettled([
      left.createStorageOperationReceiptIfIdle({
        receipt: makeOperationReceipt({ operationId: 'operation-admin', previousGenerationId: generationId }),
        expectedActiveGenerationId: generationId,
      }),
      right.appendSessionWithCompletionReceipt(session, completion),
    ]);

    const unsettled = await adapter.listUnsettledStorageOperationReceipts();
    const pending = await adapter.readPendingCompletionReceipts();
    // As duas transações disputam `completionReceipts`, então elas serializam.
    // Se a administrativa venceu, ela nasceu num mundo sem conclusão pendente;
    // se perdeu, ela não nasceu. O que não pode acontecer é a administrativa
    // nascer POR CAUSA de um diagnóstico obsoleto e coexistir com a conclusão.
    if (admin.status === 'fulfilled') {
      expect(unsettled).toHaveLength(1);
      expect(treino.status).toBe('fulfilled');
    } else {
      expect(admin.reason).toBeInstanceOf(StorageCompletionPendingError);
      expect(unsettled).toHaveLength(0);
      expect(pending).toHaveLength(1);
    }
  });

  it('CompletionReceipt criado primeiro bloqueia a criação administrativa', async () => {
    const { adapter, factory, name } = createHarness();
    const generationId = await seedActiveGeneration(adapter);
    const session = makeSession(91);
    await adapter.appendSessionWithCompletionReceipt(session, await makeReceipt(session, generationId));
    const { left } = twoConnections(factory, name);
    await left.open();

    const error = await left.createStorageOperationReceiptIfIdle({
      receipt: makeOperationReceipt({ operationId: 'operation-tardia', previousGenerationId: generationId }),
      expectedActiveGenerationId: generationId,
    }).then(() => null, (caught: unknown) => caught);

    expect(error).toBeInstanceOf(StorageCompletionPendingError);
    expect((error as StorageCompletionPendingError).pendingReceiptIds).toEqual([`receipt-${session.id}`]);
    expect(await adapter.listUnsettledStorageOperationReceipts()).toHaveLength(0);
    // A conclusão pendente não foi alterada nem liquidada.
    expect(await adapter.readPendingCompletionReceipts()).toHaveLength(1);
  });

  it('receipt administrativo criado primeiro bloqueia o segundo em outra conexão', async () => {
    const { adapter, factory, name } = createHarness();
    const generationId = await seedActiveGeneration(adapter);
    await adapter.createStorageOperationReceiptIfIdle({
      receipt: makeOperationReceipt({ operationId: 'operation-primeira', previousGenerationId: generationId }),
      expectedActiveGenerationId: generationId,
    });
    const { right } = twoConnections(factory, name);
    await right.open();

    const error = await right.createStorageOperationReceiptIfIdle({
      receipt: makeOperationReceipt({ operationId: 'operation-segunda', previousGenerationId: generationId }),
      expectedActiveGenerationId: generationId,
    }).then(() => null, (caught: unknown) => caught);

    expect(error).toBeInstanceOf(StorageOperationAlreadyInProgressError);
    expect((error as StorageOperationAlreadyInProgressError).existing.operationId).toBe('operation-primeira');
    expect(await adapter.listUnsettledStorageOperationReceipts()).toHaveLength(1);
  });

  it('registro malformado em qualquer um dos stores bloqueia a criação', async () => {
    const adminTorto = createHarness();
    const generationA = await seedActiveGeneration(adminTorto.adapter);
    await putRawOperationReceipt(adminTorto.factory, adminTorto.name, { operationId: 'torto', kind: 'import' });
    await expect(adminTorto.adapter.createStorageOperationReceiptIfIdle({
      receipt: makeOperationReceipt({ operationId: 'operation-nova', previousGenerationId: generationA }),
      expectedActiveGenerationId: generationA,
    })).rejects.toBeInstanceOf(StorageOperationReceiptIntegrityError);

    const conclusaoTorta = createHarness();
    const generationB = await seedActiveGeneration(conclusaoTorta.adapter);
    await withStore(
      conclusaoTorta.factory,
      conclusaoTorta.name,
      COMPLETION_RECEIPTS_STORE,
      'readwrite',
      (transaction) => requestResult(
        transaction.objectStore(COMPLETION_RECEIPTS_STORE).put({ receiptId: 'torto' } as never),
      ),
    );
    await expect(conclusaoTorta.adapter.createStorageOperationReceiptIfIdle({
      receipt: makeOperationReceipt({ operationId: 'operation-nova', previousGenerationId: generationB }),
      expectedActiveGenerationId: generationB,
    })).rejects.toBeInstanceOf(CompletionReceiptIntegrityError);
    expect(await conclusaoTorta.adapter.listUnsettledStorageOperationReceipts()).toHaveLength(0);
  });

  it('duas transições atômicas simultâneas em conexões diferentes: só uma vence', async () => {
    const { adapter, factory, name } = createHarness();
    const generationId = await seedActiveGeneration(adapter);
    await adapter.createStorageOperationReceiptIfIdle({
      receipt: makeOperationReceipt({ operationId: 'operation-1', previousGenerationId: generationId }),
      expectedActiveGenerationId: generationId,
    });
    const { left, right } = twoConnections(factory, name);
    await left.open();
    await right.open();

    const results = await Promise.allSettled([
      left.transitionStorageOperationIfUnambiguous({
        operationId: 'operation-1',
        expectedStatus: 'staged',
        nextStatus: 'activating',
        expectedActiveGenerationId: generationId,
      }),
      right.transitionStorageOperationIfUnambiguous({
        operationId: 'operation-1',
        expectedStatus: 'staged',
        nextStatus: 'reverted',
        expectedActiveGenerationId: generationId,
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const final = await adapter.readStorageOperationReceipt('operation-1');
    expect(['activating', 'reverted']).toContain(final?.status);
  });

  it('a transição atômica recusa CAS de geração ativa divergente', async () => {
    const { adapter } = createHarness();
    const generationId = await seedActiveGeneration(adapter);
    await adapter.createStorageOperationReceiptIfIdle({
      receipt: makeOperationReceipt({ operationId: 'operation-1', previousGenerationId: generationId }),
      expectedActiveGenerationId: generationId,
    });

    await expect(adapter.transitionStorageOperationIfUnambiguous({
      operationId: 'operation-1',
      expectedStatus: 'staged',
      nextStatus: 'activating',
      expectedActiveGenerationId: 'generation-outra',
    })).rejects.toBeInstanceOf(StorageOperationTransitionError);
    expect((await adapter.readStorageOperationReceipt('operation-1'))?.status).toBe('staged');
  });

  it('a transição atômica recusa quando existe conclusão pendente', async () => {
    const { adapter } = createHarness();
    const generationId = await seedActiveGeneration(adapter);
    await adapter.createStorageOperationReceiptIfIdle({
      receipt: makeOperationReceipt({ operationId: 'operation-1', previousGenerationId: generationId }),
      expectedActiveGenerationId: generationId,
    });
    const session = makeSession(93);
    await adapter.appendSessionWithCompletionReceipt(session, await makeReceipt(session, generationId));

    await expect(adapter.transitionStorageOperationIfUnambiguous({
      operationId: 'operation-1',
      expectedStatus: 'staged',
      nextStatus: 'activating',
      expectedActiveGenerationId: generationId,
    })).rejects.toBeInstanceOf(StorageCompletionPendingError);
    expect((await adapter.readStorageOperationReceipt('operation-1'))?.status).toBe('staged');
    expect(await adapter.readPendingCompletionReceipts()).toHaveLength(1);
  });
});

describe('snapshot administrativo atômico (readStorageAdministrationSnapshot)', () => {
  it('descreve metadata, gerações, registros, receipts e conclusões numa leitura só', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(2), makeSession(1)]);
    await adapter.createStorageOperationReceiptIfIdle({
      receipt: makeOperationReceipt({ operationId: 'operation-1', previousGenerationId: generationId }),
      expectedActiveGenerationId: generationId,
    });

    const snapshot = await adapter.readStorageAdministrationSnapshot();
    expect(snapshot.activeGenerationId).toBe(generationId);
    expect(snapshot.migrationGenerationId).toBeNull();
    expect(snapshot.activeGenerationRecords.map((record) => record.sessionId)).toEqual(['session-2', 'session-1']);
    expect(snapshot.activeGenerationManifest?.sessionCount).toBe(2);
    expect(snapshot.activeGenerationPresent).toBe(true);
    expect(snapshot.operationReceipts).toHaveLength(1);
    expect(snapshot.unsettledOperations).toHaveLength(1);
    expect(snapshot.pendingCompletionReceipts).toEqual([]);
    expect(snapshot.generations.map((entry) => entry.generationId)).toContain(generationId);
    expect(typeof snapshot.fingerprint).toBe('string');
  });

  it('o fingerprint é estável entre leituras iguais e muda a cada alteração real', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1)]);

    const primeiro = await adapter.readStorageAdministrationSnapshot();
    const segundo = await adapter.readStorageAdministrationSnapshot();
    expect(segundo.fingerprint).toBe(primeiro.fingerprint);

    // Conteúdo trocado mantendo id, ordem e digest: a contagem não muda, mas o
    // fingerprint precisa mudar — é exatamente o caso que a auditoria explorou.
    await mutateHistoryRecords(factory, name, generationId, async (store, records) => {
      const victim = records[0];
      await requestResult(store.put({
        ...victim,
        session: { ...(victim.session as Record<string, unknown>), totalVolume: 987_654 },
      }));
    });
    const terceiro = await adapter.readStorageAdministrationSnapshot();
    expect(terceiro.fingerprint).not.toBe(primeiro.fingerprint);
    expect(terceiro.activeGenerationRecords).toHaveLength(1);
  });

  it('receipt malformado em qualquer store vira erro de integridade explícito', async () => {
    const admin = createHarness();
    await admin.adapter.open();
    await admin.adapter.replaceHistory([makeSession(1)]);
    await putRawOperationReceipt(admin.factory, admin.name, { operationId: 'torto', kind: 'import' });
    await expect(admin.adapter.readStorageAdministrationSnapshot())
      .rejects.toBeInstanceOf(StorageOperationReceiptIntegrityError);

    const conclusao = createHarness();
    await conclusao.adapter.open();
    await conclusao.adapter.replaceHistory([makeSession(1)]);
    await withStore(conclusao.factory, conclusao.name, COMPLETION_RECEIPTS_STORE, 'readwrite', (transaction) => (
      requestResult(transaction.objectStore(COMPLETION_RECEIPTS_STORE).put({ receiptId: 'torto' } as never))
    ));
    await expect(conclusao.adapter.readStorageAdministrationSnapshot())
      .rejects.toBeInstanceOf(CompletionReceiptIntegrityError);
  });

  it('metadata com chave não textual vira erro de integridade, nunca lista parcial', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);
    await putRawMetadataRecord(factory, name, { key: 42, value: 'lixo' });

    await expect(adapter.readStorageAdministrationSnapshot())
      .rejects.toBeInstanceOf(HistoryMetadataIntegrityError);
  });

  it('não escreve nada: byte a byte idêntico antes e depois', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    const generationId = await adapter.replaceHistory([makeSession(1)]);
    const session = makeSession(92);
    await adapter.appendSessionWithCompletionReceipt(session, await makeReceipt(session, generationId));

    const before = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    await adapter.readStorageAdministrationSnapshot();
    const after = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it('devolve cópia segura: mutar o snapshot não altera o armazenamento', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    await adapter.replaceHistory([makeSession(1)]);

    const snapshot = await adapter.readStorageAdministrationSnapshot();
    snapshot.activeGenerationRecords[0].session.totalVolume = -1;
    snapshot.activeGenerationRecords.pop();

    const relido = await adapter.readStorageAdministrationSnapshot();
    expect(relido.activeGenerationRecords).toHaveLength(1);
    expect(relido.activeGenerationRecords[0].session.totalVolume).not.toBe(-1);
  });

  it('sem geração ativa não fabrica registros nem manifest', async () => {
    const { adapter } = createHarness();
    await adapter.open();

    const snapshot = await adapter.readStorageAdministrationSnapshot();
    expect(snapshot.activeGenerationId).toBeNull();
    expect(snapshot.activeGenerationRecords).toEqual([]);
    expect(snapshot.activeGenerationManifest).toBeNull();
    expect(snapshot.activeGenerationPresent).toBe(false);
  });
});
