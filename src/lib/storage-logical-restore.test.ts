import fs from 'node:fs';
import path from 'node:path';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../types';
import { createStorageAdminRuntime } from './storage-admin-runtime';
import { recoverLogicalStorageAdministrationV2 } from './storage-administrative-recovery';
import type { StorageAdminOwnerTokenCoordinator } from './storage-admin-owner-token';
import { runStorageBootRecovery } from './storage-boot-recovery';
import {
  createHybridStorageRuntime,
  HYBRID_CORE_BACKUP_SUFFIX,
  toPersistedCoreState,
} from './storage-hybrid';
import {
  IndexedDbWorkoutHistoryStorage,
  STORAGE_OPERATION_RECEIPTS_STORE,
  WORKOUT_HISTORY_STORE,
} from './storage-indexeddb';
import {
  commitLogicalStorageImportV2,
} from './storage-logical-import';
import {
  computeLogicalPayloadDigest,
  serializeLogicalPayloadCanonically,
} from './storage-logical-backup';
import {
  commitLogicalStorageRestoreV2,
  proveLogicalStorageRestoreTargetV2,
  recoverLogicalStorageRestoreV2,
  resolveLogicalRestoreRecovery,
  type LogicalRestoreCommitStep,
  type LogicalStorageRestoreTargetV2,
} from './storage-logical-restore';
import {
  createStorageOperationReceipt,
  type StorageOperationReceipt,
} from './storage-operation-receipt';
import type { PersistedState, StorageLike } from './storage-types';

const KEY = 'gymflow:state:v1';
const BACKUP_KEY = `${KEY}${HYBRID_CORE_BACKUP_SUFFIX}`;
let sequence = 0;

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  readonly removed: string[] = [];

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.removed.push(key);
    this.values.delete(key);
  }
}

function ownerToken(operationId: string): StorageAdminOwnerTokenCoordinator {
  return {
    createOperationId: () => operationId,
    acquire: () => ({
      status: 'acquired',
      reason: 'acquired',
      lease: {
        confirm: () => ({ status: 'owned', reason: 'confirmed' }),
        execute: async <T>(operation: () => T | Promise<T>) => operation(),
        release: () => ({ status: 'released', reason: 'released' }),
      },
    }),
  };
}

function busyOwnerToken(): StorageAdminOwnerTokenCoordinator {
  return {
    createOperationId: () => 'restore-busy',
    acquire: () => ({ status: 'blocked', reason: 'owned-by-other' }),
  };
}

function session(id: string, name: string): WorkoutSession {
  const startedAt = id === 'a' ? 1_767_225_600_000 : 1_767_312_000_000;
  return {
    id: `session-${id}`,
    name,
    date: new Date(startedAt).toISOString(),
    duration: 3_600,
    calories: 400,
    xpEarned: 150,
    totalVolume: 10_000,
    prsDetected: [],
    sourceProgramId: 'program-1',
    sourceProgramDayId: 'day-1',
    sourceProgramName: 'Programa',
    sourceProgramDayName: 'Dia 1',
    status: 'completed',
    startedAt,
    endedAt: startedAt + 3_600_000,
    exercises: [],
  };
}

function state(history: WorkoutSession[], favoriteExercises: string[] = []): PersistedState {
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
    favoriteExercises,
    recentlyViewedVideoIds: [],
  };
}

async function backupRaw(payload: PersistedState): Promise<string> {
  return JSON.stringify({
    format: 'gymflow-backup',
    formatVersion: 2,
    logicalSchemaVersion: 1,
    exportedAt: '2026-08-13T12:00:00.000Z',
    sourcePhysicalStorageVersion: 2,
    sourceSavedAt: '2026-08-13T11:59:00.000Z',
    payloadDigest: await computeLogicalPayloadDigest(payload),
    payload: JSON.parse(serializeLogicalPayloadCanonically(payload)) as PersistedState,
  });
}

function updateCoreGeneration(raw: string, generationId: string): string {
  const envelope = JSON.parse(raw) as {
    data: { historyStorage: { generationId: string } };
  };
  envelope.data.historyStorage.generationId = generationId;
  return JSON.stringify(envelope);
}

async function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

async function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function putRawReceipt(
  factory: IDBFactory,
  databaseName: string,
  receipt: unknown,
): Promise<void> {
  const database = await request(factory.open(databaseName));
  const transaction = database.transaction(STORAGE_OPERATION_RECEIPTS_STORE, 'readwrite');
  await request(transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE).put(receipt));
  await transactionDone(transaction);
  database.close();
}

async function corruptGenerationRecord(
  factory: IDBFactory,
  databaseName: string,
  generationId: string,
): Promise<void> {
  const database = await request(factory.open(databaseName));
  const transaction = database.transaction(WORKOUT_HISTORY_STORE, 'readwrite');
  const store = transaction.objectStore(WORKOUT_HISTORY_STORE);
  const records = await request(store.getAll()) as Array<{
    generationId: string;
    session: WorkoutSession;
  }>;
  const target = records.find((record) => record.generationId === generationId);
  if (!target) throw new Error('registro alvo ausente no setup');
  target.session = { ...target.session, name: 'CORROMPIDO' };
  await request(store.put(target));
  await transactionDone(transaction);
  database.close();
}

async function createImportedWorld() {
  const storage = new MemoryStorage();
  const factory = new IDBFactory();
  const databaseName = `restore-foundation-${sequence += 1}`;
  let generationSequence = 0;
  const adapter = new IndexedDbWorkoutHistoryStorage({
    factory,
    databaseName,
    generationIdFactory: () => `generation-${generationSequence += 1}`,
    now: () => new Date('2026-08-13T10:00:00.000Z'),
  });
  const hybrid = createHybridStorageRuntime({
    key: KEY,
    storage,
    adapter,
    defaults: state([]),
    now: () => new Date('2026-08-13T10:00:00.000Z'),
  });
  const hydration = await hybrid.hydrate();
  if (hydration.mode !== 'hybrid-v2') throw new Error('setup nao ficou em v2');

  const generationA = await adapter.replaceHistory([session('a', 'Estado A')]);
  const initialRaw = storage.getItem(KEY) as string;
  const coreA = updateCoreGeneration(initialRaw, generationA);
  storage.setItem(KEY, coreA);
  await adapter.clearInactiveGeneration(hydration.generationId);

  const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter });
  const payloadB = state([session('b', 'Estado B')], ['exercise-b']);
  const imported = await commitLogicalStorageImportV2({
    raw: await backupRaw(payloadB),
    runtime,
    adapter,
    storage,
    key: KEY,
    now: () => new Date('2026-08-13T12:01:00.000Z'),
    ownerToken: ownerToken('import-b'),
  });
  if (!imported.ok) throw new Error(`import setup falhou: ${imported.reason}`);

  const coreB = storage.getItem(KEY) as string;
  const generationB = imported.generationId;
  const proof = await proveLogicalStorageRestoreTargetV2({
    sourceOperationId: imported.operationId,
    targetCoreRaw: coreA,
    targetGenerationId: generationA,
    adapter,
    storage,
    key: KEY,
  });
  if (!proof.ok) throw new Error(`prova setup falhou: ${proof.reason}`);
  return {
    storage,
    factory,
    databaseName,
    adapter,
    runtime,
    coreA,
    coreB,
    generationA,
    generationB,
    importOperationId: imported.operationId,
    target: proof.target,
  };
}

type World = Awaited<ReturnType<typeof createImportedWorld>>;

async function assertWorldA(world: World): Promise<void> {
  expect(world.storage.getItem(KEY)).toBe(world.coreA);
  expect(world.storage.getItem(BACKUP_KEY)).toBe(world.coreB);
  expect((await world.adapter.readMetadata()).activeGeneration).toBe(world.generationA);
  const verified = await world.adapter.readVerifiedHistoryGeneration(world.generationA);
  expect(verified.sessions.map((entry) => entry.name)).toEqual(['Estado A']);
  expect(world.storage.removed).toEqual([]);
  const snapshot = await world.adapter.readStorageAdministrationSnapshot();
  expect(snapshot.unsettledOperations).toEqual([]);
}

describe('proveniencia exata do restore v2', () => {
  it('liga receipt fonte, rolling backup, core, generation, manifest e conteudo fisico', async () => {
    const world = await createImportedWorld();
    expect(world.target.sourceOperationId).toBe(world.importOperationId);
    expect(world.target.targetCoreRaw).toBe(world.storage.getItem(BACKUP_KEY));
    expect(world.target.targetGenerationId).toBe(world.generationA);
    const verified = await world.adapter.readVerifiedHistoryGeneration(world.generationA);
    expect(verified.manifest.generationId).toBe(world.target.targetGenerationId);
    expect(verified.sessions.map((entry) => entry.name)).toEqual(['Estado A']);
  });

  it('invalida a prova se core ou generation forem trocados isoladamente', async () => {
    const world = await createImportedWorld();
    const wrongCore = await proveLogicalStorageRestoreTargetV2({
      sourceOperationId: world.importOperationId,
      targetCoreRaw: world.coreB,
      targetGenerationId: world.generationA,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(wrongCore).toMatchObject({ ok: false });
    const wrongGeneration = await proveLogicalStorageRestoreTargetV2({
      sourceOperationId: world.importOperationId,
      targetCoreRaw: world.coreA,
      targetGenerationId: world.generationB,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(wrongGeneration).toMatchObject({ ok: false });
  });

  it('invalida receipt fonte ou manifest alterados isoladamente', async () => {
    const receiptWorld = await createImportedWorld();
    const source = await receiptWorld.adapter.readStorageOperationReceipt(receiptWorld.importOperationId);
    await receiptWorld.adapter.putStorageOperationReceipt({
      ...source,
      previousCoreRaw: receiptWorld.coreB,
    } as StorageOperationReceipt);
    expect(await proveLogicalStorageRestoreTargetV2({
      sourceOperationId: receiptWorld.importOperationId,
      targetCoreRaw: receiptWorld.coreA,
      targetGenerationId: receiptWorld.generationA,
      adapter: receiptWorld.adapter,
      storage: receiptWorld.storage,
      key: KEY,
    })).toMatchObject({ ok: false, reason: 'target-pair-divergent' });
  });

  it('backup rolante rotativo nao destrói a prova duravel do par A', async () => {
    const world = await createImportedWorld();
    world.storage.setItem(BACKUP_KEY, world.coreB);
    const proof = await proveLogicalStorageRestoreTargetV2({
      sourceOperationId: world.importOperationId,
      targetCoreRaw: world.coreA,
      targetGenerationId: world.generationA,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(proof).toMatchObject({
      ok: true,
      target: {
        targetCoreRaw: world.coreA,
        targetGenerationId: world.generationA,
        currentCoreRaw: world.coreB,
        currentGenerationId: world.generationB,
      },
    });
  });

  it('core atual mutado na mesma geracao ainda prova o par historico A', async () => {
    const world = await createImportedWorld();
    const mutated = JSON.parse(world.coreB) as { savedAt: string };
    mutated.savedAt = '2026-08-13T14:00:00.000Z';
    world.storage.setItem(KEY, JSON.stringify(mutated));
    world.storage.setItem(BACKUP_KEY, world.coreB);
    const proof = await proveLogicalStorageRestoreTargetV2({
      sourceOperationId: world.importOperationId,
      targetCoreRaw: world.coreA,
      targetGenerationId: world.generationA,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(proof).toMatchObject({
      ok: true,
      target: {
        targetCoreRaw: world.coreA,
        targetGenerationId: world.generationA,
        currentGenerationId: world.generationB,
      },
    });
    if (!proof.ok) throw new Error('prova deveria permanecer valida');
    const restored = await commitLogicalStorageRestoreV2({
      target: proof.target,
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: ownerToken('restore-after-autosave'),
    });
    expect(restored).toMatchObject({ ok: true, targetGenerationId: world.generationA });
    expect(world.storage.getItem(KEY)).toBe(world.coreA);
    expect((await world.adapter.readMetadata()).activeGeneration).toBe(world.generationA);
    expect(world.storage.removed).toEqual([]);
  });

  it('invalida manifest/conteudo fisico corrompido sem reparar', async () => {
    const world = await createImportedWorld();
    await corruptGenerationRecord(world.factory, world.databaseName, world.generationA);
    expect(await proveLogicalStorageRestoreTargetV2({
      sourceOperationId: world.importOperationId,
      targetCoreRaw: world.coreA,
      targetGenerationId: world.generationA,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    })).toMatchObject({ ok: false, reason: 'target-generation-invalid' });
  });
});

describe('primitive desconectada e roundtrip A -> B -> A', () => {
  it('restaura A, liquida o journal e nao apaga geracao', async () => {
    const world = await createImportedWorld();
    const result = await commitLogicalStorageRestoreV2({
      target: world.target,
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: ownerToken('restore-a'),
    });
    expect(result).toMatchObject({ ok: true, targetGenerationId: world.generationA });
    await assertWorldA(world);
    const receipt = await world.adapter.readStorageOperationReceipt('restore-a');
    expect(receipt).toMatchObject({
      kind: 'restore',
      status: 'settled',
      stagedGenerationId: null,
      targetGenerationId: world.generationA,
      targetCoreRaw: world.coreA,
      previousGenerationId: world.generationB,
      previousCoreRaw: world.coreB,
    });
  });

  for (const step of [
    'journal-created',
    'activating',
    'generation-activated',
    'core-committed',
    'receipt-activated',
    'settled',
  ] as const) {
    it(`crash depois de ${step} converge deterministicamente para A`, async () => {
      const world = await createImportedWorld();
      const crashed = await commitLogicalStorageRestoreV2({
        target: world.target,
        runtime: world.runtime,
        adapter: world.adapter,
        storage: world.storage,
        key: KEY,
        ownerToken: ownerToken(`restore-crash-${step}`),
        afterStep: (observed) => {
          if (observed === step) throw new Error(`CRASH:${step}`);
        },
      });
      expect(crashed).toMatchObject({ ok: false, recoveryRequired: true });
      const recovered = await recoverLogicalStorageRestoreV2({
        runtime: world.runtime,
        adapter: world.adapter,
        storage: world.storage,
        key: KEY,
        operationId: crashed.operationId as string,
        ownerToken: ownerToken(`restore-crash-${step}`),
      });
      expect(recovered).toMatchObject({ ok: true });
      await assertWorldA(world);
      const repeated = await recoverLogicalStorageRestoreV2({
        runtime: world.runtime,
        adapter: world.adapter,
        storage: world.storage,
        key: KEY,
        operationId: crashed.operationId as string,
        ownerToken: ownerToken(`restore-crash-${step}`),
      });
      expect(repeated).toMatchObject({ ok: true, status: 'already-settled' });
    });
  }

  it('owner-token ocupado bloqueia antes do receipt e de qualquer write canonico', async () => {
    const world = await createImportedWorld();
    const before = world.storage.getItem(KEY);
    const result = await commitLogicalStorageRestoreV2({
      target: world.target,
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: busyOwnerToken(),
    });
    expect(result).toMatchObject({ ok: false, reason: 'owner-token-conflict', recoveryRequired: false });
    expect(world.storage.getItem(KEY)).toBe(before);
    expect(await world.adapter.readStorageOperationReceipt('restore-busy')).toBeNull();
  });

  it('owner-token perdido durante recovery preserva journal e uma nova posse converge', async () => {
    const world = await createImportedWorld();
    const crashed = await commitLogicalStorageRestoreV2({
      target: world.target,
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: ownerToken('restore-owner-lost'),
      afterStep: (step) => {
        if (step === 'activating') throw new Error('CRASH');
      },
    });
    const blocked = await recoverLogicalStorageRestoreV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      operationId: crashed.operationId as string,
      ownerToken: busyOwnerToken(),
    });
    expect(blocked).toMatchObject({ ok: false, reason: 'owner-token-conflict' });
    expect((await world.adapter.readStorageOperationReceipt('restore-owner-lost'))?.status)
      .toBe('activating');

    const recovered = await recoverLogicalStorageRestoreV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      operationId: crashed.operationId as string,
      ownerToken: ownerToken('restore-owner-lost'),
    });
    expect(recovered).toMatchObject({ ok: true, status: 'settled' });
    await assertWorldA(world);
  });

  it('CAS concorrente impede ativacao sobre outra geracao', async () => {
    const world = await createImportedWorld();
    let raced = false;
    const racingAdapter = new Proxy(world.adapter, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (property !== 'rollbackToHistoryGeneration' || typeof value !== 'function') {
          return typeof value === 'function' ? value.bind(target) : value;
        }
        return async (...args: unknown[]) => {
          if (!raced) {
            raced = true;
            await target.replaceHistory([session('c', 'Estado concorrente')]);
          }
          return value.apply(target, args);
        };
      },
    });
    const result = await commitLogicalStorageRestoreV2({
      target: world.target,
      runtime: world.runtime,
      adapter: racingAdapter,
      storage: world.storage,
      key: KEY,
      ownerToken: ownerToken('restore-race'),
    });
    expect(result).toMatchObject({ ok: false, recoveryRequired: true });
    expect(world.storage.getItem(KEY)).toBe(world.coreB);
    expect(world.storage.removed).toEqual([]);
  });

  it('target corrompido depois da prova bloqueia antes do journal', async () => {
    const world = await createImportedWorld();
    await corruptGenerationRecord(world.factory, world.databaseName, world.generationA);
    const result = await commitLogicalStorageRestoreV2({
      target: world.target,
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: ownerToken('restore-corrupt'),
    });
    expect(result).toMatchObject({ ok: false, reason: 'provenance-diverged', recoveryRequired: false });
    expect(await world.adapter.readStorageOperationReceipt('restore-corrupt')).toBeNull();
  });
});

describe('resolvedor e isolamento estrutural', () => {
  function restoreReceipt(status: StorageOperationReceipt['status']) {
    const targetCoreRaw = JSON.stringify({
      v: 2,
      savedAt: '2026-08-13T10:00:00.000Z',
      data: toPersistedCoreState(state([]), 'generation-a'),
    });
    return {
      operationId: 'restore-1',
      kind: 'restore' as const,
      sourceDigest: null,
      previousCoreRaw: 'core-b',
      previousGenerationId: 'generation-b',
      stagedGenerationId: null,
      targetGenerationId: 'generation-a',
      targetCoreRaw,
      status,
      createdAt: '2026-08-13T10:00:00.000Z',
      updatedAt: '2026-08-13T10:00:00.000Z',
    };
  }

  const generations = [{ generationId: 'generation-a' }, { generationId: 'generation-b' }];

  it('matriz de crash produz exatamente uma decisao por janela', () => {
    const base = {
      migrationGeneration: null,
      migrationStatus: 'completed',
      generations,
      previousGenerationIntegrity: 'verified' as const,
      targetGenerationIntegrity: 'verified' as const,
      unsettledOperationCount: 1,
      pendingCompletionReceiptCount: 0,
    };
    expect(resolveLogicalRestoreRecovery({
      ...base,
      receipt: restoreReceipt('staged'),
      coreRaw: 'core-b',
      activeGeneration: 'generation-b',
    })).toEqual({ action: 'advance-activating', operationId: 'restore-1' });
    expect(resolveLogicalRestoreRecovery({
      ...base,
      receipt: restoreReceipt('activating'),
      coreRaw: 'core-b',
      activeGeneration: 'generation-b',
    })).toEqual({
      action: 'activate-generation',
      operationId: 'restore-1',
      targetGenerationId: 'generation-a',
      previousGenerationId: 'generation-b',
    });
    expect(resolveLogicalRestoreRecovery({
      ...base,
      receipt: restoreReceipt('activating'),
      coreRaw: 'core-b',
      activeGeneration: 'generation-a',
    })).toEqual({
      action: 'commit-core',
      operationId: 'restore-1',
      targetGenerationId: 'generation-a',
    });
    expect(resolveLogicalRestoreRecovery({
      ...base,
      receipt: restoreReceipt('activating'),
      coreRaw: restoreReceipt('activating').targetCoreRaw,
      activeGeneration: 'generation-a',
    })).toEqual({
      action: 'mark-activated',
      operationId: 'restore-1',
      targetGenerationId: 'generation-a',
    });
    expect(resolveLogicalRestoreRecovery({
      ...base,
      receipt: restoreReceipt('activated'),
      coreRaw: restoreReceipt('activated').targetCoreRaw,
      activeGeneration: 'generation-a',
    })).toEqual({ action: 'settle', operationId: 'restore-1' });
    expect(resolveLogicalRestoreRecovery({
      ...base,
      receipt: restoreReceipt('settled'),
      coreRaw: restoreReceipt('settled').targetCoreRaw,
      activeGeneration: 'generation-a',
      unsettledOperationCount: 0,
    })).toEqual({
      action: 'already-settled',
      operationId: 'restore-1',
      status: 'settled',
    });
  });

  it('classifica core terceiro e generation terceira como blocked', () => {
    const receipt = {
      operationId: 'restore-1',
      kind: 'restore',
      sourceDigest: null,
      previousCoreRaw: 'core-b',
      previousGenerationId: 'generation-b',
      stagedGenerationId: null,
      targetGenerationId: 'generation-a',
      targetCoreRaw: JSON.stringify({
        v: 2,
        savedAt: '2026-08-13T10:00:00.000Z',
        data: { historyStorage: { generationId: 'generation-a' } },
      }),
      status: 'activating',
      createdAt: '2026-08-13T10:00:00.000Z',
      updatedAt: '2026-08-13T10:00:00.000Z',
    } as const;
    expect(resolveLogicalRestoreRecovery({
      receipt,
      coreRaw: 'core-terceiro',
      activeGeneration: 'generation-terceira',
      migrationGeneration: null,
      migrationStatus: 'completed',
      generations: [
        { generationId: 'generation-a' },
        { generationId: 'generation-b' },
        { generationId: 'generation-terceira' },
      ],
      previousGenerationIntegrity: 'verified',
      targetGenerationIntegrity: 'verified',
      unsettledOperationCount: 1,
      pendingCompletionReceiptCount: 0,
    })).toMatchObject({ action: 'blocked' });
  });

  it('receipt ainda staged nunca aceita efeito fisico parcial', () => {
    const targetCoreRaw = JSON.stringify({
      v: 2,
      savedAt: '2026-08-13T10:00:00.000Z',
      data: toPersistedCoreState(state([]), 'generation-a'),
    });
    const receipt = {
      operationId: 'restore-staged-parcial',
      kind: 'restore',
      sourceDigest: null,
      previousCoreRaw: 'core-b',
      previousGenerationId: 'generation-b',
      stagedGenerationId: null,
      targetGenerationId: 'generation-a',
      targetCoreRaw,
      status: 'staged',
      createdAt: '2026-08-13T10:00:00.000Z',
      updatedAt: '2026-08-13T10:00:00.000Z',
    } as const;
    expect(resolveLogicalRestoreRecovery({
      receipt,
      coreRaw: 'core-b',
      activeGeneration: 'generation-a',
      migrationGeneration: null,
      migrationStatus: 'completed',
      generations: [{ generationId: 'generation-a' }, { generationId: 'generation-b' }],
      previousGenerationIntegrity: 'verified',
      targetGenerationIntegrity: 'verified',
      unsettledOperationCount: 1,
      pendingCompletionReceiptCount: 0,
    })).toEqual({ action: 'blocked', reason: 'status-world-incompatible' });
  });

  it('o writer permanece encapsulado no Context e na fundacao', () => {
    const found: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const relative = path.relative(process.cwd(), full).split(path.sep).join('/');
          const source = fs.readFileSync(full, 'utf8');
          if (source.includes('commitLogicalStorageRestoreV2')) found.push(relative);
        }
      }
    };
    walk(path.join(process.cwd(), 'src'));
    expect(found.sort()).toEqual([
      'src/components/ui/StorageBackupVerifier.guard.test.ts',
      'src/components/ui/StorageResetControls.guard.test.ts',
      'src/components/ui/StorageRestoreControls.guard.test.ts',
      'src/lib/storage-boot-recovery.test.ts',
      'src/lib/storage-logical-reset.test.ts',
      'src/lib/storage-logical-restore-resolve.test.ts',
      'src/lib/storage-logical-restore.test.ts',
      'src/lib/storage-logical-restore.ts',
      'src/providers/GymFlowContext.logical-restore.test.tsx',
      'src/providers/GymFlowContext.tsx',
    ]);
  });

  it('a primitive nao referencia delete nem clearInactiveGeneration', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/storage-logical-restore.ts'),
      'utf8',
    );
    expect(source).not.toContain('clearInactiveGeneration');
    expect(source).not.toMatch(/\.delete\s*\(/);
    expect(source).not.toMatch(/\.removeItem\s*\(/);
  });
});

describe('dispatcher administrativo e boot por kind', () => {
  it('dispatcher sem operacao preserva o recovery historico de import', async () => {
    const world = await createImportedWorld();
    const result = await recoverLogicalStorageAdministrationV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: ownerToken('dispatcher-import'),
    });
    expect(result).toMatchObject({ ok: true, status: 'no-operation' });
  });

  it('dispatcher reconhece restore pelo receipt e converge sem inferir pelo core', async () => {
    const world = await createImportedWorld();
    const crashed = await commitLogicalStorageRestoreV2({
      target: world.target,
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: ownerToken('dispatcher-restore'),
      afterStep: (step) => {
        if (step === 'generation-activated') throw new Error('CRASH');
      },
    });
    expect(crashed).toMatchObject({ ok: false, recoveryRequired: true });
    const recovered = await recoverLogicalStorageAdministrationV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      operationId: crashed.operationId as string,
      ownerToken: ownerToken('dispatcher-restore'),
    });
    expect(recovered).toMatchObject({ ok: true, status: 'settled' });
    await assertWorldA(world);
  });

  it('receipt restore malformado nao e reparado e bloqueia o dispatcher', async () => {
    const world = await createImportedWorld();
    await putRawReceipt(world.factory, world.databaseName, {
      ...createStorageOperationReceipt({
        operationId: 'restore-malformado',
        kind: 'restore',
        previousCoreRaw: world.coreB,
        previousGenerationId: world.generationB,
        targetGenerationId: world.generationA,
        targetCoreRaw: world.coreA,
        createdAt: '2026-08-13T13:00:00.000Z',
      }),
      targetGenerationId: undefined,
    });
    expect(await recoverLogicalStorageAdministrationV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    })).toMatchObject({ ok: false, reason: 'administration-conflicted' });
    expect(world.storage.getItem(KEY)).toBe(world.coreB);
    expect(world.storage.removed).toEqual([]);
  });

  it('dispatcher recusa rollback sem recovery e kind desconhecido malformado', async () => {
    const known = await createImportedWorld();
    await known.adapter.createStorageOperationReceiptIfIdle({
      receipt: createStorageOperationReceipt({
        operationId: 'rollback-sem-recovery',
        kind: 'rollback',
        previousCoreRaw: known.coreB,
        previousGenerationId: known.generationB,
        createdAt: '2026-08-13T13:00:00.000Z',
      }),
      expectedActiveGenerationId: known.generationB,
    });
    expect(await recoverLogicalStorageAdministrationV2({
      runtime: known.runtime,
      adapter: known.adapter,
      storage: known.storage,
      key: KEY,
    })).toMatchObject({ ok: false, reason: 'operation-conflict' });

    const unknown = await createImportedWorld();
    await putRawReceipt(unknown.factory, unknown.databaseName, {
      ...createStorageOperationReceipt({
        operationId: 'future-kind',
        kind: 'rollback',
        previousCoreRaw: unknown.coreB,
        previousGenerationId: unknown.generationB,
        createdAt: '2026-08-13T13:00:00.000Z',
      }),
      kind: 'future',
    });
    expect(await recoverLogicalStorageAdministrationV2({
      runtime: unknown.runtime,
      adapter: unknown.adapter,
      storage: unknown.storage,
      key: KEY,
    })).toMatchObject({ ok: false, reason: 'administration-conflicted' });
  });

  it('boot usa o dispatcher e libera hidratacao somente depois de settle do restore', async () => {
    const world = await createImportedWorld();
    const crashed = await commitLogicalStorageRestoreV2({
      target: world.target,
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: ownerToken('boot-restore'),
      afterStep: (step) => {
        if (step === 'core-committed') throw new Error('CRASH');
      },
    });
    expect(crashed).toMatchObject({ ok: false, recoveryRequired: true });
    const outcome = await runStorageBootRecovery({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(outcome).toMatchObject({
      status: 'ready-after-settled',
      hydrationAllowed: true,
    });
    await assertWorldA(world);
  });
});

// Mantem o tipo opaco exercitado pelo compilador sem permitir construcao manual.
const _opaqueTarget: LogicalStorageRestoreTargetV2 | null = null;
const _crashStep: LogicalRestoreCommitStep | null = null;
void _opaqueTarget;
void _crashStep;
