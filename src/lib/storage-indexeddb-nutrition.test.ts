/**
 * GymFlow AI — Testes do ledger nutricional no IndexedDB v5 (NUT-004A / GOAL-077)
 *
 * Cobre: upgrade v4→v5 preservando todos os stores existentes, criação dos
 * novos stores, putIfAbsent atômico (incl. concorrente), round-trip de
 * activeDate e migration marker, e leitura de intervalo histórico — além do
 * rollover concorrente fim a fim sobre o adapter real.
 */

import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { DailyTargets } from './nutrition/engine-types';
import { createNutritionDay } from './nutrition/ledger';
import type { LedgerMigrationMarker, NutritionDay } from './nutrition/ledger-types';
import { ensureTodayNutritionDay } from './nutrition/rollover';
import {
  COMPLETION_RECEIPTS_STORE,
  GENERATION_MANIFESTS_STORE,
  GYMFLOW_INDEXEDDB_VERSION,
  IndexedDbWorkoutHistoryStorage,
  LEGACY_SNAPSHOTS_STORE,
  METADATA_STORE,
  NUTRITION_DAYS_STORE,
  NUTRITION_METADATA_STORE,
  NutritionDayIntegrityError,
  STORAGE_OPERATION_RECEIPTS_STORE,
  WORKOUT_HISTORY_STORE,
} from './storage-indexeddb';
import { CURRENT_STORAGE_VERSION, HYBRID_STORAGE_VERSION } from './storage-types';

let databaseSequence = 1000;

function makeTargets(): DailyTargets {
  return {
    id: 'targets-event-idb',
    engineVersion: '1.0.0',
    formulaVersion: 'mifflin-st-jeor-v1',
    inputSnapshotHash: 'd'.repeat(64),
    computedAt: '2026-09-12T12:00:00.000Z',
    computedAtSource: 'explicit_context',
    computedReason: 'initial_setup',
    targetCalories: 2500,
    targetProteinGrams: 160,
    targetCarbsGrams: 300,
    targetFatGrams: 70,
    targetWaterMl: 2800,
    bmrKcal: 1700,
    tdeeKcal: 2600,
    energyBalanceKcal: -100,
    scientificStatus: 'PROVISIONAL_PENDING_PROFESSIONAL_REVIEW',
    isLimitedGuidance: false,
    appliedCaloricFloor: 1500,
    effectiveProteinGramsPerKg: 2.0,
    effectiveFatGramsPerKg: 0.85,
    macroReconciliation: {
      macroCalories: 2500,
      targetCalories: 2500,
      deltaKcal: 0,
      roundingToleranceKcal: 2,
      isReconciled: true,
      unmetConstraints: [],
    },
    estimationTolerance: {
      relative: 0,
      reason: 'NONE',
      targetCaloriesLowerKcal: 2500,
      targetCaloriesUpperKcal: 2500,
    },
  };
}

function makeDay(date: string, id?: string): NutritionDay {
  return createNutritionDay({
    id: id ?? `day-${date}`,
    date,
    timezone: 'America/Sao_Paulo',
    targets: makeTargets(),
  });
}

function createHarness(factory?: IDBFactory, databaseName?: string) {
  const owned = factory ?? new IDBFactory();
  const name = databaseName ?? `gymflow-nutrition-idb-${databaseSequence += 1}`;
  const adapter = new IndexedDbWorkoutHistoryStorage({ factory: owned, databaseName: name });
  return { adapter, factory: owned, name };
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

// Banco físico exatamente como a v4 o criava, povoado nos seis stores daquela
// versão. Base real do teste de upgrade para v5.
async function createV4Database(factory: IDBFactory, name: string): Promise<void> {
  const request = factory.open(name, 4);
  request.onupgradeneeded = () => {
    const database = request.result;
    const historyStore = database.createObjectStore(WORKOUT_HISTORY_STORE, {
      keyPath: ['generationId', 'order'],
    });
    historyStore.createIndex('byGeneration', 'generationId', { unique: false });
    historyStore.createIndex('byGenerationSession', ['generationId', 'sessionId'], { unique: true });
    historyStore.add({
      sessionId: 'session-v4-a',
      generationId: 'generation-v4',
      order: 0,
      session: { id: 'session-v4-a', name: 'Treino A' },
      digest: 'sha256:v4a',
    });

    const metadataStore = database.createObjectStore(METADATA_STORE, { keyPath: 'key' });
    metadataStore.put({ key: 'activeGeneration', value: 'generation-v4' });
    metadataStore.put({ key: 'migrationGeneration', value: null });
    metadataStore.put({ key: 'schemaVersion', value: 1 });
    metadataStore.put({ key: 'migrationStatus', value: 'completed' });
    metadataStore.put({ key: 'migratedAt', value: '2026-09-10T10:00:00.000Z' });
    metadataStore.put({ key: 'sourceStorageVersion', value: 1 });
    metadataStore.put({ key: 'generationNextOrder:generation-v4', value: -1 });

    const snapshotStore = database.createObjectStore(LEGACY_SNAPSHOTS_STORE, { keyPath: 'snapshotId' });
    snapshotStore.put({
      snapshotId: 'v1-rollback',
      raw: '{"version":1}',
      checksum: 'sha256:congelado-v4',
      createdAt: '2026-09-10T10:00:00.000Z',
      verified: true,
    });

    const manifestStore = database.createObjectStore(GENERATION_MANIFESTS_STORE, { keyPath: 'generationId' });
    manifestStore.put({
      generationId: 'generation-v4',
      sessionCount: 1,
      orderedDigest: 'sha256:ordered-v4',
      createdAt: '2026-09-10T10:00:00.000Z',
      updatedAt: '2026-09-10T10:00:00.000Z',
      verified: true,
    });

    const receiptStore = database.createObjectStore(COMPLETION_RECEIPTS_STORE, { keyPath: 'receiptId' });
    receiptStore.createIndex('byStatus', 'status', { unique: false });
    receiptStore.add({ receiptId: 'receipt-v4', status: 'completed' });

    const operationStore = database.createObjectStore(STORAGE_OPERATION_RECEIPTS_STORE, { keyPath: 'operationId' });
    operationStore.createIndex('byStatus', 'status', { unique: false });
    operationStore.createIndex('byKind', 'kind', { unique: false });
    operationStore.createIndex('byUpdatedAt', 'updatedAt', { unique: false });
    operationStore.add({ operationId: 'operation-v4', status: 'settled', kind: 'rollback' });
  };
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
}

describe('versão e envelope físico congelados', () => {
  it('IDB vai a 5 sem tocar no envelope físico', () => {
    expect(GYMFLOW_INDEXEDDB_VERSION).toBe(5);
    expect(HYBRID_STORAGE_VERSION).toBe(2);
    expect(CURRENT_STORAGE_VERSION).toBe(1);
  });
});

describe('upgrade v4 → v5 do IndexedDB', () => {
  it('preserva byte a byte todos os stores existentes e cria os nutricionais vazios', async () => {
    const factory = new IDBFactory();
    const name = `gymflow-upgrade-v4-${databaseSequence += 1}`;
    await createV4Database(factory, name);

    const before = await readAllStores(factory, name, 4);
    expect(Object.keys(before).sort()).toEqual([
      COMPLETION_RECEIPTS_STORE,
      GENERATION_MANIFESTS_STORE,
      LEGACY_SNAPSHOTS_STORE,
      METADATA_STORE,
      STORAGE_OPERATION_RECEIPTS_STORE,
      WORKOUT_HISTORY_STORE,
    ].sort());

    const { adapter } = createHarness(factory, name);
    await adapter.open();

    const after = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    for (const store of [
      WORKOUT_HISTORY_STORE,
      METADATA_STORE,
      LEGACY_SNAPSHOTS_STORE,
      GENERATION_MANIFESTS_STORE,
      COMPLETION_RECEIPTS_STORE,
      STORAGE_OPERATION_RECEIPTS_STORE,
    ]) {
      expect(JSON.stringify(after[store])).toBe(JSON.stringify(before[store]));
    }

    // Stores novos existem, vazios, com a chave correta.
    expect(after[NUTRITION_DAYS_STORE]).toEqual([]);
    expect(after[NUTRITION_METADATA_STORE]).toEqual([]);
    expect(await adapter.getNutritionDay('2026-09-12')).toBeNull();
    expect(await adapter.getActiveNutritionDate()).toBeNull();
    expect(await adapter.getNutritionMigrationMarker()).toBeNull();
    await adapter.close();
  });

  it('cria os stores nutricionais com a chave natural correta', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();

    const request = factory.open(name, GYMFLOW_INDEXEDDB_VERSION);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(Array.from(database.objectStoreNames)).toContain(NUTRITION_DAYS_STORE);
    expect(Array.from(database.objectStoreNames)).toContain(NUTRITION_METADATA_STORE);
    const daysKeyPath = database.transaction(NUTRITION_DAYS_STORE, 'readonly')
      .objectStore(NUTRITION_DAYS_STORE).keyPath;
    const metadataKeyPath = database.transaction(NUTRITION_METADATA_STORE, 'readonly')
      .objectStore(NUTRITION_METADATA_STORE).keyPath;
    expect(daysKeyPath).toBe('date');
    expect(metadataKeyPath).toBe('key');
    database.close();
    await adapter.close();
  });

  it('repete a abertura de forma idempotente sem regravar nada', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    await adapter.putNutritionDay(makeDay('2026-09-12'));
    const before = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    await adapter.close();

    const reopened = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name });
    await reopened.open();
    await reopened.open();
    const after = await readAllStores(factory, name, GYMFLOW_INDEXEDDB_VERSION);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    await reopened.close();
  });
});

describe('API nutricional do IndexedDB', () => {
  it('put/get com round-trip completo do dia', async () => {
    const { adapter } = createHarness();
    await adapter.open();

    const day = makeDay('2026-09-12');
    await adapter.putNutritionDay(day);
    expect(await adapter.getNutritionDay('2026-09-12')).toEqual(day);
    expect(await adapter.getNutritionDay('2026-09-11')).toBeNull();
    await adapter.close();
  });

  it('put sobrescreve pela chave natural (date)', async () => {
    const { adapter } = createHarness();
    await adapter.open();

    await adapter.putNutritionDay(makeDay('2026-09-12', 'day-original'));
    await adapter.putNutritionDay({ ...makeDay('2026-09-12', 'day-updated'), isClosed: true, closedAt: 'x' });
    const read = await adapter.getNutritionDay('2026-09-12');
    expect(read?.id).toBe('day-updated');
    expect(read?.isClosed).toBe(true);
    expect(await adapter.listNutritionDays()).toHaveLength(1);
    await adapter.close();
  });

  it('putIfAbsent é atômico sob concorrência: 1 dia, mesmo id', async () => {
    const { adapter } = createHarness();
    await adapter.open();

    const [left, right] = await Promise.all([
      adapter.putNutritionDayIfAbsent(makeDay('2026-09-12', 'day-racer-a')),
      adapter.putNutritionDayIfAbsent(makeDay('2026-09-12', 'day-racer-b')),
    ]);

    const createdCount = [left, right].filter((result) => result.created).length;
    expect(createdCount).toBe(1);
    expect(left.day.id).toBe(right.day.id);
    expect(await adapter.listNutritionDays()).toHaveLength(1);
    await adapter.close();
  });

  it('putIfAbsent sequencial devolve o existente sem sobrescrever', async () => {
    const { adapter } = createHarness();
    await adapter.open();

    const first = await adapter.putNutritionDayIfAbsent(makeDay('2026-09-12', 'day-first'));
    expect(first.created).toBe(true);
    const second = await adapter.putNutritionDayIfAbsent(makeDay('2026-09-12', 'day-second'));
    expect(second.created).toBe(false);
    expect(second.day.id).toBe('day-first');
    await adapter.close();
  });

  it('activeDate com round-trip e rejeição de data inválida', async () => {
    const { adapter } = createHarness();
    await adapter.open();

    expect(await adapter.getActiveNutritionDate()).toBeNull();
    await adapter.setActiveNutritionDate('2026-09-12');
    expect(await adapter.getActiveNutritionDate()).toBe('2026-09-12');
    await expect(adapter.setActiveNutritionDate('12/09/2026')).rejects.toBeTruthy();
    expect(await adapter.getActiveNutritionDate()).toBe('2026-09-12');
    await adapter.close();
  });

  it('migration marker com round-trip e rejeição de marcador inválido', async () => {
    const { adapter } = createHarness();
    await adapter.open();

    expect(await adapter.getNutritionMigrationMarker()).toBeNull();
    const marker: LedgerMigrationMarker = {
      version: 1,
      status: 'completed',
      classification: 'LEGACY_REAL',
      migratedAt: '2026-09-12T12:00:00.000Z',
      source: 'legacy-nutrition-log',
    };
    await adapter.setNutritionMigrationMarker(marker);
    expect(await adapter.getNutritionMigrationMarker()).toEqual(marker);
    await expect(
      adapter.setNutritionMigrationMarker({ ...marker, classification: 'BOGUS' } as never),
    ).rejects.toBeInstanceOf(NutritionDayIntegrityError);
    await adapter.close();
  });

  it('leitura de intervalo histórico ordenada por data', async () => {
    const { adapter } = createHarness();
    await adapter.open();

    for (const date of ['2026-09-01', '2026-09-03', '2026-09-05', '2026-09-07', '2026-09-10']) {
      await adapter.putNutritionDay(makeDay(date));
    }
    expect((await adapter.listNutritionDays()).map((day) => day.date)).toEqual([
      '2026-09-01',
      '2026-09-03',
      '2026-09-05',
      '2026-09-07',
      '2026-09-10',
    ]);
    expect((await adapter.listNutritionDays({ from: '2026-09-03', to: '2026-09-07' })).map((day) => day.date)).toEqual([
      '2026-09-03',
      '2026-09-05',
      '2026-09-07',
    ]);
    expect(await adapter.listNutritionDays({ from: '2026-10-01' })).toEqual([]);
    await adapter.close();
  });

  it('rejeita dia malformado no put sem persistir nada', async () => {
    const { adapter } = createHarness();
    await adapter.open();

    await expect(adapter.putNutritionDay({ id: 'x' } as never)).rejects.toBeInstanceOf(NutritionDayIntegrityError);
    await expect(
      adapter.putNutritionDayIfAbsent({ ...makeDay('2026-09-12'), targets: null } as never),
    ).rejects.toBeInstanceOf(NutritionDayIntegrityError);
    expect(await adapter.listNutritionDays()).toEqual([]);
    await adapter.close();
  });
});

describe('rollover concorrente sobre o adapter real', () => {
  it('dois ensureToday simultâneos persistem 1 dia com o mesmo id', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    const now = new Date('2026-09-12T14:00:00.000Z');

    const [left, right] = await Promise.all([
      ensureTodayNutritionDay({ now, timezone: 'America/Sao_Paulo', targets: makeTargets(), repository: adapter }),
      ensureTodayNutritionDay({ now, timezone: 'America/Sao_Paulo', targets: makeTargets(), repository: adapter }),
    ]);

    expect(left.day.id).toBe(right.day.id);
    expect(await adapter.listNutritionDays()).toHaveLength(1);
    expect(await adapter.getActiveNutritionDate()).toBe('2026-09-12');

    const reopened = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name });
    await adapter.close();
    await reopened.open();
    expect((await reopened.getNutritionDay('2026-09-12'))?.id).toBe(left.day.id);
    await reopened.close();
  });

  it('GOAL-079 — 20 ensureToday simultâneos: 1 dia, 1 activeDate, mesmo id', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const now = new Date('2026-09-12T14:00:00.000Z');

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        ensureTodayNutritionDay({ now, timezone: 'America/Sao_Paulo', targets: makeTargets(), repository: adapter })),
    );

    expect(new Set(results.map((result) => result.day.id)).size).toBe(1);
    expect(await adapter.listNutritionDays()).toHaveLength(1);
    expect(await adapter.getActiveNutritionDate()).toBe('2026-09-12');
    await adapter.close();
  }, 60000);
});

describe('GOAL-079 — guards de leitura e escrita no adapter real', () => {
  async function writeRawDay(factory: IDBFactory, name: string, record: unknown): Promise<void> {
    const request = factory.open(name, GYMFLOW_INDEXEDDB_VERSION);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(NUTRITION_DAYS_STORE, 'readwrite');
    const completed = transactionResult(transaction);
    await requestResult(transaction.objectStore(NUTRITION_DAYS_STORE).put(record));
    await completed;
    database.close();
  }

  async function writeRawMetadata(factory: IDBFactory, name: string, key: string, value: unknown): Promise<void> {
    const request = factory.open(name, GYMFLOW_INDEXEDDB_VERSION);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(NUTRITION_METADATA_STORE, 'readwrite');
    const completed = transactionResult(transaction);
    await requestResult(transaction.objectStore(NUTRITION_METADATA_STORE).put({ key, value }));
    await completed;
    database.close();
  }

  it('put rejeita snapshot parcial de targets sem persistir nada', async () => {
    const { adapter } = createHarness();
    await adapter.open();

    const partial = { ...makeDay('2026-09-12'), targets: { targetCalories: 2000 } };
    await expect(adapter.putNutritionDay(partial as never)).rejects.toBeInstanceOf(NutritionDayIntegrityError);
    await expect(adapter.putNutritionDayIfAbsent(partial as never)).rejects.toBeInstanceOf(
      NutritionDayIntegrityError,
    );
    expect(await adapter.listNutritionDays()).toEqual([]);
    await adapter.close();
  });

  it('get rejeita dia persistido com entry negativa (fail-closed de leitura)', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    const day = JSON.parse(JSON.stringify(makeDay('2026-09-12'))) as unknown as Record<string, unknown>;
    const meals = day['meals'] as Array<Record<string, unknown>>;
    meals.push({
      id: 'meal-corrupt',
      type: 'custom',
      name: 'corrompida',
      entries: [{ id: 'e-1', name: 'x', calories: -50, protein: 0, carbs: 0, fat: 0, loggedAt: 't' }],
    });
    await writeRawDay(factory, name, day);
    await expect(adapter.getNutritionDay('2026-09-12')).rejects.toBeInstanceOf(NutritionDayIntegrityError);
    await expect(adapter.listNutritionDays()).rejects.toBeInstanceOf(NutritionDayIntegrityError);
    await adapter.close();
  });

  it('get rejeita dia persistido com chave civil impossível', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();
    await writeRawDay(factory, name, { ...makeDay('2026-02-28'), date: '2026-02-30' });
    await expect(adapter.getNutritionDay('2026-02-30')).rejects.toBeInstanceOf(NutritionDayIntegrityError);
    await adapter.close();
  });

  it('activeDate valida escrita e leitura (data impossível falha fechado)', async () => {
    const { adapter, factory, name } = createHarness();
    await adapter.open();

    await expect(adapter.setActiveNutritionDate('2026-02-30')).rejects.toBeTruthy();
    await expect(adapter.setActiveNutritionDate('12/09/2026')).rejects.toBeTruthy();
    expect(await adapter.getActiveNutritionDate()).toBeNull();

    await writeRawMetadata(factory, name, 'activeNutritionDate', '2026-02-30');
    await expect(adapter.getActiveNutritionDate()).rejects.toBeInstanceOf(NutritionDayIntegrityError);
    await adapter.close();
  });
});
