import { IDBFactory, IDBObjectStore as FakeIDBObjectStore } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../types';
import {
  COMPLETION_RECEIPTS_STORE,
  CompletionReceiptIntegrityError,
  GENERATION_MANIFESTS_STORE,
  GYMFLOW_INDEXEDDB_VERSION,
  HistoryManifestIntegrityError,
  IndexedDbUnavailableError,
  IndexedDbWorkoutHistoryStorage,
  LEGACY_SNAPSHOTS_STORE,
  LegacySnapshotCryptoUnavailableError,
  LegacySnapshotIntegrityError,
  METADATA_STORE,
  WORKOUT_HISTORY_STORE,
  checksumLegacySnapshot,
} from './storage-indexeddb';
import {
  EMPTY_GENERATION_DIGEST,
  chainGenerationDigest,
  computeOrderedHistoryDigest,
  digestWorkoutSession,
} from './storage-history-integrity';
import type { WorkoutCompletionReceipt } from './storage-completion-receipt';

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
      WORKOUT_HISTORY_STORE,
    ]);
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
