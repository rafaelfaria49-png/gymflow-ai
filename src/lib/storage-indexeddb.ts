import type { WorkoutSession } from '../types';
import type {
  HistoryStorageMetadata,
  LegacySnapshotRecord,
  WorkoutHistoryStorageAdapter,
} from './storage-adapter';

export const GYMFLOW_INDEXEDDB_NAME = 'gymflow-persistence';
export const GYMFLOW_INDEXEDDB_VERSION = 1;

export const WORKOUT_HISTORY_STORE = 'workoutHistory';
export const METADATA_STORE = 'metadata';
export const LEGACY_SNAPSHOTS_STORE = 'legacySnapshots';

const BY_GENERATION_INDEX = 'byGeneration';
const BY_GENERATION_SESSION_INDEX = 'byGenerationSession';
const LEGACY_SNAPSHOT_ID = 'v1-rollback';
const INTERNAL_NEXT_ORDER_PREFIX = 'generationNextOrder:';

const METADATA_DEFAULTS: HistoryStorageMetadata = {
  activeGeneration: null,
  migrationGeneration: null,
  schemaVersion: GYMFLOW_INDEXEDDB_VERSION,
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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function checksumLegacySnapshot(
  raw: string,
  subtleCrypto: SubtleCrypto | null | undefined = globalThis.crypto?.subtle,
): Promise<string> {
  if (!subtleCrypto) throw new LegacySnapshotCryptoUnavailableError();
  const digest = await subtleCrypto.digest('SHA-256', new TextEncoder().encode(raw));
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
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
    for (const session of history) assertSessionIdentity(session);

    const database = this.requireDatabase();
    const generationId = this.generationIdFactory();
    if (!generationId) throw new Error('A geração precisa de um id estável.');

    const transaction = database.transaction([WORKOUT_HISTORY_STORE, METADATA_STORE], 'readwrite');
    const completed = transactionResult(transaction);
    const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
    const metadataStore = transaction.objectStore(METADATA_STORE);
    const writes: Promise<unknown>[] = [];

    try {
      history.forEach((session, order) => {
        writes.push(requestResult(historyStore.add({
          sessionId: session.id,
          generationId,
          order,
          session,
        } satisfies HistoryRecord)));
      });
      writes.push(requestResult(metadataStore.put({
        key: `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`,
        value: -1,
      } satisfies MetadataRecord)));
      writes.push(requestResult(metadataStore.put({
        key: 'activeGeneration',
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

  async prepareHistoryGeneration(history: readonly WorkoutSession[]): Promise<string> {
    for (const session of history) assertSessionIdentity(session);

    const database = this.requireDatabase();
    const generationId = this.generationIdFactory();
    if (!generationId) throw new Error('A geração precisa de um id estável.');

    const transaction = database.transaction([WORKOUT_HISTORY_STORE, METADATA_STORE], 'readwrite');
    const completed = transactionResult(transaction);
    const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
    const metadataStore = transaction.objectStore(METADATA_STORE);
    const writes: Promise<unknown>[] = [];

    try {
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

      history.forEach((session, order) => {
        writes.push(requestResult(historyStore.add({
          sessionId: session.id,
          generationId,
          order,
          session,
        } satisfies HistoryRecord)));
      });
      writes.push(requestResult(metadataStore.put({
        key: `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`,
        value: -1,
      } satisfies MetadataRecord)));
      writes.push(requestResult(metadataStore.put({
        key: 'migrationGeneration',
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

  async appendSession(session: WorkoutSession): Promise<void> {
    assertSessionIdentity(session);
    const database = this.requireDatabase();
    const transaction = database.transaction([METADATA_STORE, WORKOUT_HISTORY_STORE], 'readwrite');
    const completed = transactionResult(transaction);

    try {
      const generationId = await this.requireActiveGeneration(transaction);
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
      } satisfies HistoryRecord));
      await requestResult(transaction.objectStore(METADATA_STORE).put({
        key: nextOrderKey,
        value: nextOrder - 1,
      } satisfies MetadataRecord));
      await completed;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async updateSession(session: WorkoutSession): Promise<boolean> {
    assertSessionIdentity(session);
    const database = this.requireDatabase();
    const transaction = database.transaction([METADATA_STORE, WORKOUT_HISTORY_STORE], 'readwrite');
    const completed = transactionResult(transaction);

    try {
      const generationId = await this.requireActiveGeneration(transaction);
      const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
      const key = await requestResult(
        historyStore.index(BY_GENERATION_SESSION_INDEX).getKey([generationId, session.id]),
      );
      if (key === undefined) {
        await completed;
        return false;
      }
      const record = await requestResult(historyStore.get(key)) as HistoryRecord | undefined;
      if (!record) {
        await completed;
        return false;
      }
      await requestResult(historyStore.put({ ...record, session } satisfies HistoryRecord));
      await completed;
      return true;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    if (!sessionId) throw new Error('A exclusão exige um sessionId.');
    const database = this.requireDatabase();
    const transaction = database.transaction([METADATA_STORE, WORKOUT_HISTORY_STORE], 'readwrite');
    const completed = transactionResult(transaction);

    try {
      const generationId = await this.requireActiveGeneration(transaction);
      const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
      const key = await requestResult(
        historyStore.index(BY_GENERATION_SESSION_INDEX).getKey([generationId, sessionId]),
      );
      if (key === undefined) {
        await completed;
        return false;
      }
      await requestResult(historyStore.delete(key));
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
    const transaction = database.transaction([METADATA_STORE, WORKOUT_HISTORY_STORE], 'readwrite');
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
