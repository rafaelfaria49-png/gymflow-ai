import type { WorkoutSession } from '../types';
import type {
  HistoryStorageMetadata,
  LegacySnapshotRecord,
  WorkoutHistoryStorageAdapter,
} from './storage-adapter';
import {
  type HistoryGenerationManifest,
  type HistoryGenerationSnapshot,
  chainGenerationDigest,
  computeOrderedDigestFromSessionDigests,
  createGenerationManifest,
  digestWorkoutSession,
  digestWorkoutSessions,
  isHistoryGenerationManifest,
  sha256Checksum,
} from './storage-history-integrity';

export const GYMFLOW_INDEXEDDB_NAME = 'gymflow-persistence';
// v2 adiciona os stores de manifest e de receipts da conclusão. O upgrade é
// idempotente e preserva todos os stores e registros já existentes.
export const GYMFLOW_INDEXEDDB_VERSION = 2;

// Versão lógica do schema de histórico exposta em metadata e no core físico v2.
// Continua 1: nenhum formato observável pelo envelope mudou.
export const HISTORY_METADATA_SCHEMA_VERSION = 1;

export const WORKOUT_HISTORY_STORE = 'workoutHistory';
export const METADATA_STORE = 'metadata';
export const LEGACY_SNAPSHOTS_STORE = 'legacySnapshots';
export const GENERATION_MANIFESTS_STORE = 'generationManifests';

const BY_GENERATION_INDEX = 'byGeneration';
const BY_GENERATION_SESSION_INDEX = 'byGenerationSession';
const LEGACY_SNAPSHOT_ID = 'v1-rollback';
const INTERNAL_NEXT_ORDER_PREFIX = 'generationNextOrder:';

const METADATA_DEFAULTS: HistoryStorageMetadata = {
  activeGeneration: null,
  migrationGeneration: null,
  schemaVersion: HISTORY_METADATA_SCHEMA_VERSION,
  migrationStatus: 'not-started',
  migratedAt: null,
  sourceStorageVersion: null,
};

type MetadataKey = keyof HistoryStorageMetadata;

interface HistoryRecord {
  sessionId: string;
  generationId: string;
  order: number;
  session: WorkoutSession;
  // Digest canônico do conteúdo, gravado na mesma transação do registro.
  digest: string;
}

interface MetadataRecord {
  key: string;
  value: unknown;
}

interface StoredLegacySnapshotRecord extends LegacySnapshotRecord {
  snapshotId: string;
}

export interface IndexedDbHistoryStorageOptions {
  factory?: IDBFactory;
  databaseName?: string;
  generationIdFactory?: () => string;
  now?: () => Date;
  subtleCrypto?: SubtleCrypto | null;
}

export class IndexedDbUnavailableError extends Error {
  constructor() {
    super('IndexedDB indisponível neste ambiente.');
    this.name = 'IndexedDbUnavailableError';
  }
}

export class IndexedDbNotOpenError extends Error {
  constructor() {
    super('O adapter IndexedDB precisa ser aberto antes da operação.');
    this.name = 'IndexedDbNotOpenError';
  }
}

export class LegacySnapshotCryptoUnavailableError extends Error {
  constructor() {
    super('Web Crypto indisponível para calcular o checksum do snapshot.');
    this.name = 'LegacySnapshotCryptoUnavailableError';
  }
}

export class LegacySnapshotIntegrityError extends Error {
  readonly originalError: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = 'LegacySnapshotIntegrityError';
    this.originalError = originalError;
  }
}

export class HistoryManifestIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HistoryManifestIntegrityError';
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha em uma operação IndexedDB.'));
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Transação IndexedDB abortada.'));
    transaction.onerror = () => {
      // O evento abort contém o erro final e encerra a promise.
    };
  });
}

function abortQuietly(transaction: IDBTransaction): void {
  try {
    transaction.abort();
  } catch {
    // A transação já pode ter sido abortada ou concluída pelo próprio IndexedDB.
  }
}

function defaultGenerationId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `generation-${globalThis.crypto.randomUUID()}`;
  }
  return `generation-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function assertSessionIdentity(session: WorkoutSession): void {
  if (!session.id || typeof session.id !== 'string') {
    throw new Error('Toda sessão precisa de um id estável.');
  }
}

export async function checksumLegacySnapshot(
  raw: string,
  subtleCrypto: SubtleCrypto | null | undefined = globalThis.crypto?.subtle,
): Promise<string> {
  if (!subtleCrypto) throw new LegacySnapshotCryptoUnavailableError();
  return sha256Checksum(raw, subtleCrypto);
}

export class IndexedDbWorkoutHistoryStorage implements WorkoutHistoryStorageAdapter {
  private readonly factory: IDBFactory | undefined;
  private readonly databaseName: string;
  private readonly generationIdFactory: () => string;
  private readonly now: () => Date;
  private readonly subtleCrypto: SubtleCrypto | null | undefined;
  private database: IDBDatabase | null = null;

  constructor(options: IndexedDbHistoryStorageOptions = {}) {
    this.factory = options.factory ?? globalThis.indexedDB;
    this.databaseName = options.databaseName ?? GYMFLOW_INDEXEDDB_NAME;
    this.generationIdFactory = options.generationIdFactory ?? defaultGenerationId;
    this.now = options.now ?? (() => new Date());
    this.subtleCrypto = options.subtleCrypto === null
      ? null
      : options.subtleCrypto ?? globalThis.crypto?.subtle;
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.factory);
  }

  async open(): Promise<void> {
    if (this.database) return;
    if (!this.factory) throw new IndexedDbUnavailableError();

    const request = this.factory.open(this.databaseName, GYMFLOW_INDEXEDDB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const transaction = request.transaction;
      if (!transaction) throw new Error('Upgrade IndexedDB sem transação ativa.');

      if (!database.objectStoreNames.contains(WORKOUT_HISTORY_STORE)) {
        const historyStore = database.createObjectStore(WORKOUT_HISTORY_STORE, {
          keyPath: ['generationId', 'order'],
        });
        historyStore.createIndex(BY_GENERATION_INDEX, 'generationId', { unique: false });
        historyStore.createIndex(
          BY_GENERATION_SESSION_INDEX,
          ['generationId', 'sessionId'],
          { unique: true },
        );
      }

      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        const metadataStore = database.createObjectStore(METADATA_STORE, { keyPath: 'key' });
        for (const [key, value] of Object.entries(METADATA_DEFAULTS)) {
          metadataStore.put({ key, value } satisfies MetadataRecord);
        }
      }

      if (!database.objectStoreNames.contains(LEGACY_SNAPSHOTS_STORE)) {
        database.createObjectStore(LEGACY_SNAPSHOTS_STORE, { keyPath: 'snapshotId' });
      }

      // v2: manifest por geração. Criado sem tocar nos registros existentes —
      // gerações antigas ficam sem manifest e são bloqueadas por integridade em
      // vez de virarem histórico vazio.
      if (!database.objectStoreNames.contains(GENERATION_MANIFESTS_STORE)) {
        database.createObjectStore(GENERATION_MANIFESTS_STORE, { keyPath: 'generationId' });
      }
    };

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Falha ao abrir o IndexedDB.'));
      request.onblocked = () => reject(new Error('A abertura do IndexedDB foi bloqueada por outra conexão.'));
    });

    database.onversionchange = () => {
      database.close();
      if (this.database === database) this.database = null;
    };
    this.database = database;
  }

  async close(): Promise<void> {
    this.database?.close();
    this.database = null;
  }

  async readActiveHistory(): Promise<WorkoutSession[]> {
    const database = this.requireDatabase();
    const transaction = database.transaction([METADATA_STORE, WORKOUT_HISTORY_STORE], 'readonly');
    const completed = transactionResult(transaction);
    const activeGeneration = await this.readMetadataValue<string | null>(transaction, 'activeGeneration');
    if (!activeGeneration) {
      await completed;
      return [];
    }

    const records = await requestResult(
      transaction.objectStore(WORKOUT_HISTORY_STORE)
        .index(BY_GENERATION_INDEX)
        .getAll(activeGeneration),
    ) as HistoryRecord[];
    await completed;
    return records
      .sort((left, right) => left.order - right.order)
      .map((record) => record.session);
  }

  async replaceHistory(history: readonly WorkoutSession[]): Promise<string> {
    return this.stageGeneration(history, 'activeGeneration');
  }

  async prepareHistoryGeneration(history: readonly WorkoutSession[]): Promise<string> {
    return this.stageGeneration(history, 'migrationGeneration');
  }

  // Staging e replace gravam registros, digests, manifest e metadata na mesma
  // transação: a geração só existe quando o manifest confirmado a acompanha.
  private async stageGeneration(
    history: readonly WorkoutSession[],
    pointer: 'activeGeneration' | 'migrationGeneration',
  ): Promise<string> {
    for (const session of history) assertSessionIdentity(session);

    const database = this.requireDatabase();
    const generationId = this.generationIdFactory();
    if (!generationId) throw new Error('A geração precisa de um id estável.');

    // Os digests são calculados fora da transação: `crypto.subtle` resolve em
    // outra tarefa e desativaria a transação IndexedDB no meio do caminho.
    const digests = await digestWorkoutSessions(history, this.subtleCrypto);
    const orderedDigest = await computeOrderedDigestFromSessionDigests(digests, this.subtleCrypto);
    const createdAt = this.now().toISOString();

    const transaction = database.transaction(
      [WORKOUT_HISTORY_STORE, METADATA_STORE, GENERATION_MANIFESTS_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);
    const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
    const metadataStore = transaction.objectStore(METADATA_STORE);
    const manifestStore = transaction.objectStore(GENERATION_MANIFESTS_STORE);
    const writes: Promise<unknown>[] = [];

    try {
      if (pointer === 'migrationGeneration') {
        const [activeGeneration, migrationGeneration, existingMarker, existingRecords] = await Promise.all([
          this.readMetadataValue<string | null>(transaction, 'activeGeneration'),
          this.readMetadataValue<string | null>(transaction, 'migrationGeneration'),
          this.readMetadataValue<number>(transaction, `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`),
          requestResult(historyStore.index(BY_GENERATION_INDEX).count(generationId)),
        ]);
        if (generationId === activeGeneration) {
          throw new Error('A geração preparada precisa ser diferente da geração ativa.');
        }
        if (migrationGeneration) {
          throw new Error(`A geração ${migrationGeneration} já está preparada.`);
        }
        if (existingMarker !== undefined || existingRecords > 0) {
          throw new Error(`A geração ${generationId} já existe.`);
        }
      }

      history.forEach((session, order) => {
        writes.push(requestResult(historyStore.add({
          sessionId: session.id,
          generationId,
          order,
          session,
          digest: digests[order],
        } satisfies HistoryRecord)));
      });
      writes.push(requestResult(manifestStore.put(createGenerationManifest({
        generationId,
        sessionCount: history.length,
        orderedDigest,
        createdAt,
      }))));
      writes.push(requestResult(metadataStore.put({
        key: `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`,
        value: -1,
      } satisfies MetadataRecord)));
      writes.push(requestResult(metadataStore.put({
        key: pointer,
        value: generationId,
      } satisfies MetadataRecord)));

      await Promise.all(writes);
      await completed;
      return generationId;
    } catch (error) {
      abortQuietly(transaction);
      await Promise.allSettled(writes);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async readHistoryGeneration(generationId: string): Promise<WorkoutSession[]> {
    if (!generationId) throw new Error('A leitura exige um generationId.');
    const database = this.requireDatabase();
    const transaction = database.transaction(WORKOUT_HISTORY_STORE, 'readonly');
    const completed = transactionResult(transaction);
    const records = await requestResult(
      transaction.objectStore(WORKOUT_HISTORY_STORE)
        .index(BY_GENERATION_INDEX)
        .getAll(generationId),
    ) as HistoryRecord[];
    await completed;
    return records
      .sort((left, right) => left.order - right.order)
      .map((record) => record.session);
  }

  async readGenerationManifest(generationId: string): Promise<HistoryGenerationManifest | null> {
    if (!generationId) throw new Error('A leitura do manifest exige um generationId.');
    const database = this.requireDatabase();
    const transaction = database.transaction(GENERATION_MANIFESTS_STORE, 'readonly');
    const completed = transactionResult(transaction);
    const manifest = await this.readManifestRecord(transaction, generationId);
    await completed;
    return manifest;
  }

  // Leitura única usada pela hidratação: presença física, manifest e registros
  // (com os digests gravados) saem da mesma transação consistente.
  async readHistoryGenerationSnapshot(generationId: string): Promise<HistoryGenerationSnapshot> {
    if (!generationId) throw new Error('A leitura da geração exige um generationId.');
    const database = this.requireDatabase();
    const transaction = database.transaction(
      [METADATA_STORE, WORKOUT_HISTORY_STORE, GENERATION_MANIFESTS_STORE],
      'readonly',
    );
    const completed = transactionResult(transaction);
    const [marker, manifest, records] = await Promise.all([
      this.readMetadataValue<number>(transaction, `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`),
      this.readManifestRecord(transaction, generationId),
      requestResult(
        transaction.objectStore(WORKOUT_HISTORY_STORE)
          .index(BY_GENERATION_INDEX)
          .getAll(generationId),
      ) as Promise<HistoryRecord[]>,
    ]);
    await completed;
    const ordered = [...records].sort((left, right) => left.order - right.order);
    return {
      present: marker !== undefined || manifest !== null || ordered.length > 0,
      manifest,
      sessions: ordered.map((record) => record.session),
      recordDigests: ordered.map((record) => record.digest ?? null),
    };
  }

  async hasHistoryGeneration(generationId: string): Promise<boolean> {
    if (!generationId) return false;
    const database = this.requireDatabase();
    const transaction = database.transaction(METADATA_STORE, 'readonly');
    const completed = transactionResult(transaction);
    const marker = await this.readMetadataValue<number>(
      transaction,
      `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`,
    );
    await completed;
    return marker !== undefined;
  }

  async activateHistoryGeneration(generationId: string): Promise<void> {
    if (!generationId) throw new Error('A ativação exige um generationId.');
    const database = this.requireDatabase();
    const transaction = database.transaction(METADATA_STORE, 'readwrite');
    const completed = transactionResult(transaction);

    try {
      const [migrationGeneration, marker] = await Promise.all([
        this.readMetadataValue<string | null>(transaction, 'migrationGeneration'),
        this.readMetadataValue<number>(transaction, `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`),
      ]);
      if (migrationGeneration !== generationId || marker === undefined) {
        throw new Error('A geração só pode ser ativada depois de preparada.');
      }
      await requestResult(transaction.objectStore(METADATA_STORE).put({
        key: 'activeGeneration',
        value: generationId,
      } satisfies MetadataRecord));
      await completed;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  // Append incremental: lê apenas o manifest, serializa apenas a sessão nova e
  // encadeia um único passo de digest. Registro, manifest, contagem e
  // orderedDigest entram na mesma transação.
  async appendSession(session: WorkoutSession): Promise<void> {
    await this.commitAppend(session);
  }

  protected async commitAppend(
    session: WorkoutSession,
    extraWrite?: (transaction: IDBTransaction) => Promise<unknown>,
    extraStores: string[] = [],
  ): Promise<void> {
    assertSessionIdentity(session);
    const database = this.requireDatabase();

    const base = await this.readActiveGenerationBase();
    const sessionDigest = await digestWorkoutSession(session, this.subtleCrypto);
    const nextOrderedDigest = await chainGenerationDigest(
      base.manifest.orderedDigest,
      sessionDigest,
      this.subtleCrypto,
    );
    const updatedAt = this.now().toISOString();

    const transaction = database.transaction(
      [METADATA_STORE, WORKOUT_HISTORY_STORE, GENERATION_MANIFESTS_STORE, ...extraStores],
      'readwrite',
    );
    const completed = transactionResult(transaction);

    try {
      const generationId = await this.requireActiveGeneration(transaction);
      if (generationId !== base.generationId) {
        throw new HistoryManifestIntegrityError('A geração ativa mudou durante o append.');
      }
      const manifest = await this.readManifestRecord(transaction, generationId);
      if (
        !manifest
        || manifest.orderedDigest !== base.manifest.orderedDigest
        || manifest.sessionCount !== base.manifest.sessionCount
      ) {
        throw new HistoryManifestIntegrityError('O manifest mudou durante o append.');
      }

      const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
      const duplicateKey = await requestResult(
        historyStore.index(BY_GENERATION_SESSION_INDEX).getKey([generationId, session.id]),
      );
      if (duplicateKey !== undefined) throw new Error(`A sessão ${session.id} já existe na geração ativa.`);

      const nextOrderKey = `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`;
      const nextOrder = await this.readMetadataValue<number>(transaction, nextOrderKey) ?? -1;
      await requestResult(historyStore.add({
        sessionId: session.id,
        generationId,
        order: nextOrder,
        session,
        digest: sessionDigest,
      } satisfies HistoryRecord));
      await requestResult(transaction.objectStore(GENERATION_MANIFESTS_STORE).put(
        createGenerationManifest({
          generationId,
          sessionCount: manifest.sessionCount + 1,
          orderedDigest: nextOrderedDigest,
          createdAt: manifest.createdAt,
          updatedAt,
        }),
      ));
      await requestResult(transaction.objectStore(METADATA_STORE).put({
        key: nextOrderKey,
        value: nextOrder - 1,
      } satisfies MetadataRecord));
      if (extraWrite) await extraWrite(transaction);
      await completed;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  // Update e delete recalculam a cadeia inteira: são operações raras e a ordem
  // pode mudar em qualquer posição.
  async updateSession(session: WorkoutSession): Promise<boolean> {
    assertSessionIdentity(session);
    return this.rewriteActiveGeneration((sessions) => {
      const index = sessions.findIndex((candidate) => candidate.id === session.id);
      if (index === -1) return null;
      const next = [...sessions];
      next[index] = session;
      return next;
    });
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    if (!sessionId) throw new Error('A exclusão exige um sessionId.');
    return this.rewriteActiveGeneration((sessions) => {
      const index = sessions.findIndex((candidate) => candidate.id === sessionId);
      if (index === -1) return null;
      return sessions.filter((_, position) => position !== index);
    });
  }

  private async rewriteActiveGeneration(
    mutate: (sessions: WorkoutSession[]) => WorkoutSession[] | null,
  ): Promise<boolean> {
    const database = this.requireDatabase();
    const base = await this.readActiveGenerationBase();
    const current = await this.readHistoryGeneration(base.generationId);
    const next = mutate(current);
    if (!next) return false;

    const digests = await digestWorkoutSessions(next, this.subtleCrypto);
    const orderedDigest = await computeOrderedDigestFromSessionDigests(digests, this.subtleCrypto);
    const updatedAt = this.now().toISOString();

    const transaction = database.transaction(
      [METADATA_STORE, WORKOUT_HISTORY_STORE, GENERATION_MANIFESTS_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);

    try {
      const generationId = await this.requireActiveGeneration(transaction);
      if (generationId !== base.generationId) {
        throw new HistoryManifestIntegrityError('A geração ativa mudou durante a reescrita.');
      }
      const manifest = await this.readManifestRecord(transaction, generationId);
      if (
        !manifest
        || manifest.orderedDigest !== base.manifest.orderedDigest
        || manifest.sessionCount !== base.manifest.sessionCount
      ) {
        throw new HistoryManifestIntegrityError('O manifest mudou durante a reescrita.');
      }

      const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
      const keys = await requestResult(historyStore.index(BY_GENERATION_INDEX).getAllKeys(generationId));
      await Promise.all(keys.map((key) => requestResult(historyStore.delete(key))));
      await Promise.all(next.map((session, order) => requestResult(historyStore.add({
        sessionId: session.id,
        generationId,
        order,
        session,
        digest: digests[order],
      } satisfies HistoryRecord))));
      await requestResult(transaction.objectStore(GENERATION_MANIFESTS_STORE).put(
        createGenerationManifest({
          generationId,
          sessionCount: next.length,
          orderedDigest,
          createdAt: manifest.createdAt,
          updatedAt,
        }),
      ));
      await requestResult(transaction.objectStore(METADATA_STORE).put({
        key: `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`,
        value: -1,
      } satisfies MetadataRecord));
      await completed;
      return true;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async count(): Promise<number> {
    const database = this.requireDatabase();
    const transaction = database.transaction([METADATA_STORE, WORKOUT_HISTORY_STORE], 'readonly');
    const completed = transactionResult(transaction);
    const activeGeneration = await this.readMetadataValue<string | null>(transaction, 'activeGeneration');
    if (!activeGeneration) {
      await completed;
      return 0;
    }
    const total = await requestResult(
      transaction.objectStore(WORKOUT_HISTORY_STORE)
        .index(BY_GENERATION_INDEX)
        .count(activeGeneration),
    );
    await completed;
    return total;
  }

  async readMetadata(): Promise<HistoryStorageMetadata> {
    const database = this.requireDatabase();
    const transaction = database.transaction(METADATA_STORE, 'readonly');
    const completed = transactionResult(transaction);
    const entries = await Promise.all(
      (Object.keys(METADATA_DEFAULTS) as MetadataKey[]).map(async (key) => [
        key,
        await this.readMetadataValue(transaction, key),
      ] as const),
    );
    await completed;
    return { ...METADATA_DEFAULTS, ...Object.fromEntries(entries) } as HistoryStorageMetadata;
  }

  async writeMetadata(
    metadata: Partial<Omit<HistoryStorageMetadata, 'activeGeneration'>>,
  ): Promise<void> {
    const entries = Object.entries(metadata)
      .filter((entry): entry is [MetadataKey, HistoryStorageMetadata[MetadataKey]] => entry[1] !== undefined);
    if (entries.length === 0) return;
    const database = this.requireDatabase();
    const transaction = database.transaction(METADATA_STORE, 'readwrite');
    const completed = transactionResult(transaction);
    const store = transaction.objectStore(METADATA_STORE);
    await Promise.all(entries.map(([key, value]) => requestResult(store.put({ key, value } satisfies MetadataRecord))));
    await completed;
  }

  async saveLegacySnapshot(raw: string): Promise<LegacySnapshotRecord> {
    const snapshot: LegacySnapshotRecord = {
      raw,
      checksum: await checksumLegacySnapshot(raw, this.subtleCrypto),
      createdAt: this.now().toISOString(),
      verified: false,
    };

    await this.writeLegacySnapshotRecord({
      snapshotId: LEGACY_SNAPSHOT_ID,
      ...snapshot,
    });

    try {
      const persisted = await this.readLegacySnapshotRecord();
      if (!persisted) {
        throw new LegacySnapshotIntegrityError('Snapshot legado não encontrado após a primeira gravação.');
      }

      const recalculatedChecksum = await checksumLegacySnapshot(persisted.raw, this.subtleCrypto);
      if (
        persisted.raw !== raw
        || persisted.checksum !== snapshot.checksum
        || recalculatedChecksum !== persisted.checksum
      ) {
        throw new LegacySnapshotIntegrityError('Falha de integridade no readback do snapshot legado.');
      }

      const verifiedSnapshot: StoredLegacySnapshotRecord = {
        ...persisted,
        verified: true,
      };
      await this.writeLegacySnapshotRecord(verifiedSnapshot);
      return {
        raw: verifiedSnapshot.raw,
        checksum: verifiedSnapshot.checksum,
        createdAt: verifiedSnapshot.createdAt,
        verified: verifiedSnapshot.verified,
      };
    } catch (error) {
      if (error instanceof LegacySnapshotIntegrityError) throw error;
      throw new LegacySnapshotIntegrityError(
        'Não foi possível verificar a integridade do snapshot legado.',
        error,
      );
    }
  }

  async readLegacySnapshot(): Promise<LegacySnapshotRecord | null> {
    const record = await this.readLegacySnapshotRecord();
    if (!record) return null;

    const actualChecksum = await checksumLegacySnapshot(record.raw, this.subtleCrypto);
    return {
      raw: record.raw,
      checksum: record.checksum,
      createdAt: record.createdAt,
      verified: record.verified && actualChecksum === record.checksum,
    };
  }

  async clearInactiveGeneration(generationId: string): Promise<number> {
    if (!generationId) throw new Error('A limpeza exige um generationId.');
    const database = this.requireDatabase();
    const transaction = database.transaction(
      [METADATA_STORE, WORKOUT_HISTORY_STORE, GENERATION_MANIFESTS_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);

    try {
      const [activeGeneration, migrationGeneration] = await Promise.all([
        this.readMetadataValue<string | null>(transaction, 'activeGeneration'),
        this.readMetadataValue<string | null>(transaction, 'migrationGeneration'),
      ]);
      if (generationId === activeGeneration) {
        throw new Error('A geração ativa nunca pode ser removida.');
      }
      const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
      const keys = await requestResult(
        historyStore.index(BY_GENERATION_INDEX).getAllKeys(generationId),
      );
      await Promise.all(keys.map((key) => requestResult(historyStore.delete(key))));
      await requestResult(transaction.objectStore(GENERATION_MANIFESTS_STORE).delete(generationId));
      await requestResult(transaction.objectStore(METADATA_STORE).delete(
        `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`,
      ));
      if (migrationGeneration === generationId) {
        await requestResult(transaction.objectStore(METADATA_STORE).put({
          key: 'migrationGeneration',
          value: null,
        } satisfies MetadataRecord));
      }
      await completed;
      return keys.length;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  private requireDatabase(): IDBDatabase {
    if (!this.database) throw new IndexedDbNotOpenError();
    return this.database;
  }

  private async readManifestRecord(
    transaction: IDBTransaction,
    generationId: string,
  ): Promise<HistoryGenerationManifest | null> {
    const record = await requestResult(
      transaction.objectStore(GENERATION_MANIFESTS_STORE).get(generationId),
    ) as unknown;
    if (record === undefined || record === null) return null;
    if (!isHistoryGenerationManifest(record)) {
      throw new HistoryManifestIntegrityError(
        `O manifest da geração ${generationId} está com formato inválido.`,
      );
    }
    return record;
  }

  // Base otimista do append/reescrita: o digest encadeado precisa ser calculado
  // fora da transação, então a transação de escrita reconfere esta base.
  private async readActiveGenerationBase(): Promise<{
    generationId: string;
    manifest: HistoryGenerationManifest;
  }> {
    const database = this.requireDatabase();
    const transaction = database.transaction(
      [METADATA_STORE, GENERATION_MANIFESTS_STORE],
      'readonly',
    );
    const completed = transactionResult(transaction);
    try {
      const generationId = await this.requireActiveGeneration(transaction);
      const manifest = await this.readManifestRecord(transaction, generationId);
      await completed;
      if (!manifest) {
        throw new HistoryManifestIntegrityError(
          `A geração ativa ${generationId} não possui manifest durável.`,
        );
      }
      if (!manifest.verified) {
        throw new HistoryManifestIntegrityError(
          `O manifest da geração ativa ${generationId} não está confirmado.`,
        );
      }
      return { generationId, manifest };
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  private async readMetadataValue<T>(transaction: IDBTransaction, key: string): Promise<T | undefined> {
    const record = await requestResult(
      transaction.objectStore(METADATA_STORE).get(key),
    ) as MetadataRecord | undefined;
    return record?.value as T | undefined;
  }

  private async readLegacySnapshotRecord(): Promise<StoredLegacySnapshotRecord | undefined> {
    const database = this.requireDatabase();
    const transaction = database.transaction(LEGACY_SNAPSHOTS_STORE, 'readonly');
    const completed = transactionResult(transaction);

    try {
      const record = await requestResult(
        transaction.objectStore(LEGACY_SNAPSHOTS_STORE).get(LEGACY_SNAPSHOT_ID),
      ) as StoredLegacySnapshotRecord | undefined;
      await completed;
      return record;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  private async writeLegacySnapshotRecord(record: StoredLegacySnapshotRecord): Promise<void> {
    const database = this.requireDatabase();
    const transaction = database.transaction(LEGACY_SNAPSHOTS_STORE, 'readwrite');
    const completed = transactionResult(transaction);

    try {
      await requestResult(transaction.objectStore(LEGACY_SNAPSHOTS_STORE).put(record));
      await completed;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  private async requireActiveGeneration(transaction: IDBTransaction): Promise<string> {
    const generationId = await this.readMetadataValue<string | null>(transaction, 'activeGeneration');
    if (!generationId) throw new Error('Não existe uma geração ativa de histórico.');
    return generationId;
  }
}
