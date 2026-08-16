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
  toPersistedCoreState,
} from './storage-hybrid';
import {
  IndexedDbWorkoutHistoryStorage,
  STORAGE_OPERATION_RECEIPTS_STORE,
  WORKOUT_HISTORY_STORE,
} from './storage-indexeddb';
import {
  commitLogicalStorageRestoreV2,
  proveLogicalStorageRestoreTargetV2,
} from './storage-logical-restore';
import { resolveLogicalRestorePredecessorV2 } from './storage-logical-restore-resolve';
import {
  commitLogicalStorageResetV2,
  recoverLogicalStorageResetV2,
  resolveLogicalResetRecovery,
  type LogicalResetCommitStep,
} from './storage-logical-reset';
import { createWorkoutCompletionReceipt } from './storage-completion-receipt';
import {
  createStorageOperationReceipt,
  isStorageOperationReceipt,
  type StorageOperationReceipt,
} from './storage-operation-receipt';
import {
  createEmptyPersistedState,
  type PersistedState,
  type StorageLike,
} from './storage-types';

const KEY = 'gymflow:state:v1';
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
    createOperationId: () => 'reset-busy',
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

function stateA(): PersistedState {
  return {
    ...createEmptyPersistedState(),
    favoriteExercises: ['exercise-a'],
    workoutHistory: [session('a', 'Estado A')],
  };
}

function writeNamedCore(storage: MemoryStorage, generationId: string, persisted: PersistedState): string {
  const raw = JSON.stringify({
    v: 2,
    savedAt: '2026-08-14T10:00:00.000Z',
    data: toPersistedCoreState(persisted, generationId),
  });
  storage.setItem(KEY, raw);
  return raw;
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

async function createWorldA() {
  const storage = new MemoryStorage();
  const factory = new IDBFactory();
  const databaseName = `reset-foundation-${sequence += 1}`;
  let generationSequence = 0;
  const adapter = new IndexedDbWorkoutHistoryStorage({
    factory,
    databaseName,
    generationIdFactory: () => `generation-${generationSequence += 1}`,
    now: () => new Date('2026-08-14T10:00:00.000Z'),
  });
  const hybrid = createHybridStorageRuntime({
    key: KEY,
    storage,
    adapter,
    defaults: createEmptyPersistedState(),
    now: () => new Date('2026-08-14T10:00:00.000Z'),
  });
  const hydration = await hybrid.hydrate();
  if (hydration.mode !== 'hybrid-v2') throw new Error('setup nao ficou em v2');

  const persistedA = stateA();
  const generationA = await adapter.replaceHistory(persistedA.workoutHistory);
  const coreA = writeNamedCore(storage, generationA, persistedA);

  const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter });
  const snapshot = await adapter.readStorageAdministrationSnapshot();
  return {
    storage,
    factory,
    databaseName,
    adapter,
    runtime,
    hybrid,
    coreA,
    generationA,
    hydrationGenerationId: hydration.generationId,
    generationIdsBeforeReset: snapshot.generations.map((entry) => entry.generationId).sort(),
  };
}

type World = Awaited<ReturnType<typeof createWorldA>>;

async function generationIdsOf(world: World): Promise<string[]> {
  const snapshot = await world.adapter.readStorageAdministrationSnapshot();
  return snapshot.generations.map((entry) => entry.generationId).sort();
}

async function assertWorldZ(world: World, generationZ: string, coreZ: string): Promise<void> {
  expect(world.storage.getItem(KEY)).toBe(coreZ);
  expect((await world.adapter.readMetadata()).activeGeneration).toBe(generationZ);
  const verified = await world.adapter.readVerifiedHistoryGeneration(generationZ);
  expect(verified.sessions).toEqual([]);
  expect(verified.manifest.sessionCount).toBe(0);
  expect(verified.manifest.verified).toBe(true);
  const parsed = JSON.parse(coreZ) as {
    data: ReturnType<typeof toPersistedCoreState>;
  };
  expect(parsed.data.user).toBeNull();
  expect(parsed.data.weeklyPlan).toEqual([]);
  expect(parsed.data.customPrograms).toEqual([]);
  expect(parsed.data.activeWorkout).toBeNull();
  expect(parsed.data.favoriteExercises).toEqual([]);
  expect(parsed.data.historyStorage.generationId).toBe(generationZ);
  expect(world.storage.removed).toEqual([]);
  const snapshot = await world.adapter.readStorageAdministrationSnapshot();
  expect(snapshot.unsettledOperations).toEqual([]);
}

async function assertWorldAPreserved(world: World): Promise<void> {
  const verified = await world.adapter.readVerifiedHistoryGeneration(world.generationA);
  expect(verified.sessions.map((entry) => entry.name)).toEqual(['Estado A']);
  expect(verified.manifest.verified).toBe(true);
  const after = await generationIdsOf(world);
  for (const id of world.generationIdsBeforeReset) {
    expect(after).toContain(id);
  }
}

describe('estado vazio canonico', () => {
  it('a factory nao duplica defaults no protocolo e hidrata hybrid-v2 saudavel', async () => {
    const empty = createEmptyPersistedState();
    expect(empty).toEqual({
      user: null,
      weeklyPlan: [],
      customPrograms: [],
      activeWorkout: null,
      activeWorkoutStartedAt: null,
      restTimerEndAt: null,
      restTimerTotalSeconds: null,
      restTimerLabel: null,
      workoutHistory: [],
      weightHistory: [],
      measurementsHistory: [],
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
      achievements: [],
      challenges: [],
      favoriteExercises: [],
      recentlyViewedVideoIds: [],
    });
    const world = await createWorldA();
    const reset = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      now: () => new Date('2026-08-14T12:00:00.000Z'),
      ownerToken: ownerToken('reset-empty'),
    });
    expect(reset.ok).toBe(true);
    if (!reset.ok) throw new Error('reset deveria ter criado Z');
    const hydration = await createHybridStorageRuntime({
      key: KEY,
      storage: world.storage,
      adapter: world.adapter,
      defaults: createEmptyPersistedState(),
      now: () => new Date('2026-08-14T12:01:00.000Z'),
    }).hydrate();
    expect(hydration.mode).toBe('hybrid-v2');
    if (hydration.mode !== 'hybrid-v2') throw new Error('hidratacao nao ficou em v2');
    expect(hydration.generationId).toBe(reset.generationId);
    expect(hydration.state).toMatchObject({
      user: null,
      weeklyPlan: [],
      customPrograms: [],
      activeWorkout: null,
      workoutHistory: [],
      weightHistory: [],
      measurementsHistory: [],
      favoriteExercises: [],
    });
  });
});

describe('primitive desconectada de reset', () => {
  it('cria geracao nova vazia, liquida o journal e preserva A', async () => {
    const world = await createWorldA();
    const result = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      now: () => new Date('2026-08-14T12:00:00.000Z'),
      ownerToken: ownerToken('reset-z'),
    });
    expect(result).toMatchObject({
      ok: true,
      previousGenerationId: world.generationA,
    });
    if (!result.ok) throw new Error('reset saudavel falhou');
    expect(result.generationId).not.toBe(world.generationA);
    const coreZ = world.storage.getItem(KEY) as string;
    await assertWorldZ(world, result.generationId, coreZ);
    await assertWorldAPreserved(world);
    const receipt = await world.adapter.readStorageOperationReceipt('reset-z');
    expect(receipt).toMatchObject({
      kind: 'reset',
      status: 'settled',
      sourceDigest: null,
      previousGenerationId: world.generationA,
      previousCoreRaw: world.coreA,
      stagedGenerationId: result.generationId,
      targetCoreRaw: coreZ,
    });
    expect(Object.prototype.hasOwnProperty.call(receipt, 'targetGenerationId')).toBe(false);
    expect(isStorageOperationReceipt(receipt)).toBe(true);
    const after = await generationIdsOf(world);
    expect(after).toContain(result.generationId);
    expect(after.length).toBe(world.generationIdsBeforeReset.length + 1);
  });

  it('recusa owner-token ocupado antes do journal e de qualquer write', async () => {
    const world = await createWorldA();
    const before = world.storage.getItem(KEY);
    const idsBefore = await generationIdsOf(world);
    const result = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: busyOwnerToken(),
    });
    expect(result).toMatchObject({
      ok: false,
      reason: 'owner-token-conflict',
      recoveryRequired: false,
      operationId: null,
    });
    expect(world.storage.getItem(KEY)).toBe(before);
    expect(await world.adapter.readStorageOperationReceipt('reset-busy')).toBeNull();
    expect(await generationIdsOf(world)).toEqual(idsBefore);
  });

  it('recusa quando ja existe operacao administrativa aberta', async () => {
    const world = await createWorldA();
    await world.adapter.createStorageOperationReceiptIfIdle({
      receipt: createStorageOperationReceipt({
        operationId: 'import-aberta',
        kind: 'import',
        previousCoreRaw: world.coreA,
        previousGenerationId: world.generationA,
        createdAt: '2026-08-14T11:00:00.000Z',
      }),
      expectedActiveGenerationId: world.generationA,
    });
    const result = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: ownerToken('reset-open'),
    });
    expect(result).toMatchObject({ ok: false, reason: 'operation-conflict', recoveryRequired: false });
    expect(await world.adapter.readStorageOperationReceipt('reset-open')).toBeNull();
    expect(world.storage.getItem(KEY)).toBe(world.coreA);
  });

  it('recusa quando ha completion pendente', async () => {
    const world = await createWorldA();
    const pendingSession = session('p', 'Pendente');
    const receipt = await createWorkoutCompletionReceipt({
      receiptId: 'completion-pendente',
      generationId: world.generationA,
      finalSession: pendingSession,
      coreEnvelopeAfter: toPersistedCoreState(createEmptyPersistedState(), world.generationA),
      effects: {
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
      },
      createdAt: '2026-08-14T11:00:00.000Z',
    });
    await world.adapter.appendSessionWithCompletionReceipt(pendingSession, receipt);
    const result = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: ownerToken('reset-completion'),
    });
    expect(result.ok).toBe(false);
    expect(await world.adapter.readStorageOperationReceipt('reset-completion')).toBeNull();
    expect(world.storage.getItem(KEY)).toBe(world.coreA);
  });

  it('CAS concorrente impede ativacao sobre outra geracao', async () => {
    const world = await createWorldA();
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
    const result = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: racingAdapter,
      storage: world.storage,
      key: KEY,
      now: () => new Date('2026-08-14T12:00:00.000Z'),
      ownerToken: ownerToken('reset-race'),
    });
    expect(result).toMatchObject({ ok: false, recoveryRequired: true });
    expect(world.storage.getItem(KEY)).toBe(world.coreA);
    expect(world.storage.removed).toEqual([]);
  });
});

describe('crash recovery deterministico do reset', () => {
  for (const step of [
    'journal-created',
    'staging-created',
    'activating',
    'generation-activated',
    'core-committed',
    'receipt-activated',
    'settled',
  ] as const) {
    it(`crash depois de ${step} converge para Z e permanece idempotente`, async () => {
      const world = await createWorldA();
      const crashed = await commitLogicalStorageResetV2({
        runtime: world.runtime,
        adapter: world.adapter,
        storage: world.storage,
        key: KEY,
        now: () => new Date('2026-08-14T12:00:00.000Z'),
        ownerToken: ownerToken(`reset-crash-${step}`),
        afterStep: (observed) => {
          if (observed === step) throw new Error(`CRASH:${step}`);
        },
      });
      expect(crashed).toMatchObject({ ok: false, recoveryRequired: true });
      const recovered = await recoverLogicalStorageResetV2({
        runtime: world.runtime,
        adapter: world.adapter,
        storage: world.storage,
        key: KEY,
        operationId: crashed.operationId as string,
        now: () => new Date('2026-08-14T12:00:00.000Z'),
        ownerToken: ownerToken(`reset-crash-${step}`),
      });
      expect(recovered).toMatchObject({ ok: true });
      const generationZ = (await world.adapter.readStorageOperationReceipt(
        crashed.operationId as string,
      ))?.stagedGenerationId;
      if (generationZ === null || generationZ === undefined) {
        throw new Error('geracao Z ausente apos recovery');
      }
      const coreZ = world.storage.getItem(KEY) as string;
      await assertWorldZ(world, generationZ, coreZ);
      await assertWorldAPreserved(world);
      const repeated = await recoverLogicalStorageResetV2({
        runtime: world.runtime,
        adapter: world.adapter,
        storage: world.storage,
        key: KEY,
        operationId: crashed.operationId as string,
        ownerToken: ownerToken(`reset-crash-${step}`),
      });
      expect(repeated).toMatchObject({ ok: true, status: 'already-settled' });
      expect(world.storage.getItem(KEY)).toBe(coreZ);
    });
  }

  it('owner-token perdido durante recovery preserva journal e uma nova posse converge', async () => {
    const world = await createWorldA();
    const crashed = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      now: () => new Date('2026-08-14T12:00:00.000Z'),
      ownerToken: ownerToken('reset-owner-lost'),
      afterStep: (step) => {
        if (step === 'activating') throw new Error('CRASH');
      },
    });
    const blocked = await recoverLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      operationId: crashed.operationId as string,
      ownerToken: busyOwnerToken(),
    });
    expect(blocked).toMatchObject({ ok: false, reason: 'owner-token-conflict' });
    expect((await world.adapter.readStorageOperationReceipt('reset-owner-lost'))?.status)
      .toBe('activating');

    const recovered = await recoverLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      operationId: crashed.operationId as string,
      now: () => new Date('2026-08-14T12:00:00.000Z'),
      ownerToken: ownerToken('reset-owner-lost'),
    });
    expect(recovered).toMatchObject({ ok: true, status: 'settled' });
    const receipt = await world.adapter.readStorageOperationReceipt('reset-owner-lost');
    await assertWorldZ(world, receipt?.stagedGenerationId as string, world.storage.getItem(KEY) as string);
  });

  it('core terceiro bloqueia sem apagar geracao nem fechar o journal', async () => {
    const world = await createWorldA();
    const crashed = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      now: () => new Date('2026-08-14T12:00:00.000Z'),
      ownerToken: ownerToken('reset-third-core'),
      afterStep: (step) => {
        if (step === 'activating') throw new Error('CRASH');
      },
    });
    world.storage.setItem(KEY, '{"v":2,"terceiro":true}');
    const blocked = await recoverLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      operationId: crashed.operationId as string,
      ownerToken: ownerToken('reset-third-core'),
    });
    expect(blocked).toMatchObject({ ok: false, reason: 'administration-conflicted' });
    expect((await world.adapter.readStorageOperationReceipt('reset-third-core'))?.status)
      .toBe('activating');
    expect(world.storage.removed).toEqual([]);
    await assertWorldAPreserved(world);
  });

  it('geracao inesperada bloqueia sem delete', async () => {
    const world = await createWorldA();
    const crashed = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      now: () => new Date('2026-08-14T12:00:00.000Z'),
      ownerToken: ownerToken('reset-unexpected-gen'),
      afterStep: (step) => {
        if (step === 'activating') throw new Error('CRASH');
      },
    });
    await world.adapter.replaceHistory([session('x', 'Geracao inesperada')]);
    const blocked = await recoverLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      operationId: crashed.operationId as string,
      ownerToken: ownerToken('reset-unexpected-gen'),
    });
    expect(blocked).toMatchObject({ ok: false, reason: 'administration-conflicted' });
    expect(world.storage.removed).toEqual([]);
  });

  it('geracao corrompida nao e reparada e bloqueia recovery', async () => {
    const world = await createWorldA();
    const crashed = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      now: () => new Date('2026-08-14T12:00:00.000Z'),
      ownerToken: ownerToken('reset-corrupt'),
      afterStep: (step) => {
        if (step === 'staging-created') throw new Error('CRASH');
      },
    });
    expect(crashed.ok).toBe(false);
    await corruptGenerationRecord(world.factory, world.databaseName, world.generationA);
    const blocked = await recoverLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      operationId: crashed.operationId as string,
      ownerToken: ownerToken('reset-corrupt'),
    });
    expect(blocked.ok).toBe(false);
    expect((await world.adapter.readStorageOperationReceipt('reset-corrupt'))?.status)
      .not.toBe('settled');
    expect(world.storage.removed).toEqual([]);
  });

  it('receipt malformado nao e reparado e bloqueia o dispatcher', async () => {
    const world = await createWorldA();
    await putRawReceipt(world.factory, world.databaseName, {
      ...createStorageOperationReceipt({
        operationId: 'reset-malformado',
        kind: 'reset',
        previousCoreRaw: world.coreA,
        previousGenerationId: world.generationA,
        createdAt: '2026-08-14T13:00:00.000Z',
      }),
      targetGenerationId: 'generation-x',
    });
    expect(await recoverLogicalStorageAdministrationV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    })).toMatchObject({ ok: false, reason: 'administration-conflicted' });
    expect(world.storage.getItem(KEY)).toBe(world.coreA);
    expect(world.storage.removed).toEqual([]);
  });
});

describe('roundtrip A -> Z -> A', () => {
  it('reset para Z, resolve A, restaura A e nao apaga geracao', async () => {
    const world = await createWorldA();
    const reset = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      now: () => new Date('2026-08-14T12:00:00.000Z'),
      ownerToken: ownerToken('reset-roundtrip'),
    });
    expect(reset.ok).toBe(true);
    if (!reset.ok) throw new Error('reset do roundtrip falhou');
    const coreZ = world.storage.getItem(KEY) as string;
    await assertWorldZ(world, reset.generationId, coreZ);

    const resolved = await resolveLogicalRestorePredecessorV2({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(resolved.status).toBe('available');
    if (resolved.status !== 'available') throw new Error('predecessor A ausente');
    expect(resolved.target.targetGenerationId).toBe(world.generationA);
    expect(resolved.target.targetCoreRaw).toBe(world.coreA);

    const proof = await proveLogicalStorageRestoreTargetV2({
      sourceOperationId: resolved.target.sourceOperationId,
      targetCoreRaw: resolved.target.targetCoreRaw,
      targetGenerationId: resolved.target.targetGenerationId,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(proof.ok).toBe(true);
    if (!proof.ok) throw new Error('prova de A falhou');

    const restored = await commitLogicalStorageRestoreV2({
      target: proof.target,
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: ownerToken('restore-after-reset'),
    });
    expect(restored).toMatchObject({ ok: true, targetGenerationId: world.generationA });
    expect(world.storage.getItem(KEY)).toBe(world.coreA);
    expect((await world.adapter.readMetadata()).activeGeneration).toBe(world.generationA);
    const verifiedA = await world.adapter.readVerifiedHistoryGeneration(world.generationA);
    expect(verifiedA.sessions.map((entry) => entry.name)).toEqual(['Estado A']);
    const verifiedZ = await world.adapter.readVerifiedHistoryGeneration(reset.generationId);
    expect(verifiedZ.sessions).toEqual([]);
    expect(world.storage.removed).toEqual([]);
    const after = await generationIdsOf(world);
    expect(after).toContain(world.generationA);
    expect(after).toContain(reset.generationId);
  });
});

describe('predecessor unico apos reset e restore reais', () => {
  async function restoreCurrentPredecessor(
    world: World,
    operationId: string,
  ) {
    const resolved = await resolveLogicalRestorePredecessorV2({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(resolved.status).toBe('available');
    if (resolved.status !== 'available') throw new Error(`predecessor ausente em ${operationId}`);
    const restored = await commitLogicalStorageRestoreV2({
      target: resolved.target,
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: ownerToken(operationId),
    });
    expect(restored.ok).toBe(true);
    return { resolved, restored };
  }

  it('A → Z1 → Z2 → Z1 deixa predecessor(Z1) = Z2 com exatamente um candidato', async () => {
    const world = await createWorldA();
    const resetZ1 = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      now: () => new Date('2026-08-14T12:00:00.000Z'),
      ownerToken: ownerToken('reset-z1'),
    });
    expect(resetZ1.ok).toBe(true);
    if (!resetZ1.ok) throw new Error('reset Z1 falhou');
    const resetZ2 = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      now: () => new Date('2026-08-14T12:01:00.000Z'),
      ownerToken: ownerToken('reset-z2'),
    });
    expect(resetZ2.ok).toBe(true);
    if (!resetZ2.ok) throw new Error('reset Z2 falhou');

    const afterZ2 = await resolveLogicalRestorePredecessorV2({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(afterZ2.status).toBe('available');
    if (afterZ2.status !== 'available') throw new Error('predecessor de Z2 ausente');
    expect(afterZ2.target.targetGenerationId).toBe(resetZ1.generationId);

    const hop = await restoreCurrentPredecessor(world, 'restore-z1');
    expect(hop.resolved.target.targetGenerationId).toBe(resetZ1.generationId);

    const afterZ1 = await resolveLogicalRestorePredecessorV2({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(afterZ1.status).toBe('available');
    if (afterZ1.status !== 'available') throw new Error('predecessor de Z1 nao ficou unico');
    expect(afterZ1.target.targetGenerationId).toBe(resetZ2.generationId);
    expect(afterZ1.status).not.toBe('ambiguous');

    const snapshot = await world.adapter.readStorageAdministrationSnapshot();
    const resetZ1Receipt = snapshot.operationReceipts.find(
      (entry) => entry.operationId === 'reset-z1',
    );
    const restoreZ1 = snapshot.operationReceipts.find(
      (entry) => entry.operationId === 'restore-z1',
    );
    expect(resetZ1Receipt?.status).toBe('settled');
    expect(restoreZ1?.supersedesOperationIds).toEqual(['reset-z1']);
    const verifiedZ1 = await world.adapter.readVerifiedHistoryGeneration(resetZ1.generationId);
    expect(verifiedZ1.manifest.verified).toBe(true);
  });

  it('A → Z1 → Z2 → Z1 → Z2 deixa predecessor(Z2) = Z1 com exatamente um candidato', async () => {
    const world = await createWorldA();
    const resetZ1 = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      now: () => new Date('2026-08-14T12:00:00.000Z'),
      ownerToken: ownerToken('reset-z1-loop'),
    });
    expect(resetZ1.ok).toBe(true);
    if (!resetZ1.ok) throw new Error('reset Z1 falhou');
    const resetZ2 = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      now: () => new Date('2026-08-14T12:01:00.000Z'),
      ownerToken: ownerToken('reset-z2-loop'),
    });
    expect(resetZ2.ok).toBe(true);
    if (!resetZ2.ok) throw new Error('reset Z2 falhou');

    await restoreCurrentPredecessor(world, 'restore-z1-loop');
    const backToZ2 = await restoreCurrentPredecessor(world, 'restore-z2-loop');
    expect(backToZ2.resolved.target.targetGenerationId).toBe(resetZ2.generationId);

    const afterZ2 = await resolveLogicalRestorePredecessorV2({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(afterZ2.status).toBe('available');
    if (afterZ2.status !== 'available') throw new Error('predecessor de Z2 nao ficou unico');
    expect(afterZ2.target.targetGenerationId).toBe(resetZ1.generationId);
    expect(afterZ2.status).not.toBe('ambiguous');

    const snapshot = await world.adapter.readStorageAdministrationSnapshot();
    const restoreZ2 = snapshot.operationReceipts.find(
      (entry) => entry.operationId === 'restore-z2-loop',
    );
    expect(restoreZ2?.supersedesOperationIds).toEqual(['reset-z2-loop']);
    expect(snapshot.operationReceipts.map((entry) => entry.operationId).sort()).toEqual([
      'reset-z1-loop',
      'reset-z2-loop',
      'restore-z1-loop',
      'restore-z2-loop',
    ]);
    const verifiedZ1 = await world.adapter.readVerifiedHistoryGeneration(resetZ1.generationId);
    expect(verifiedZ1.manifest.verified).toBe(true);
  });
});

describe('dispatcher, boot e isolamento estrutural', () => {
  it('dispatcher reconhece reset pelo receipt e converge sem inferir pelo core', async () => {
    const world = await createWorldA();
    const crashed = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      now: () => new Date('2026-08-14T12:00:00.000Z'),
      ownerToken: ownerToken('dispatcher-reset'),
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
      ownerToken: ownerToken('dispatcher-reset'),
    });
    expect(recovered).toMatchObject({ ok: true, status: 'settled' });
    const receipt = await world.adapter.readStorageOperationReceipt('dispatcher-reset');
    await assertWorldZ(world, receipt?.stagedGenerationId as string, world.storage.getItem(KEY) as string);
  });

  it('dispatcher recusa rollback e kind desconhecido', async () => {
    const world = await createWorldA();
    await world.adapter.createStorageOperationReceiptIfIdle({
      receipt: createStorageOperationReceipt({
        operationId: 'rollback-sem-recovery',
        kind: 'rollback',
        previousCoreRaw: world.coreA,
        previousGenerationId: world.generationA,
        createdAt: '2026-08-14T13:00:00.000Z',
      }),
      expectedActiveGenerationId: world.generationA,
    });
    expect(await recoverLogicalStorageAdministrationV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    })).toMatchObject({ ok: false, reason: 'operation-conflict' });

    const unknown = await createWorldA();
    await putRawReceipt(unknown.factory, unknown.databaseName, {
      ...createStorageOperationReceipt({
        operationId: 'future-kind',
        kind: 'rollback',
        previousCoreRaw: unknown.coreA,
        previousGenerationId: unknown.generationA,
        createdAt: '2026-08-14T13:00:00.000Z',
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

  it('boot usa o dispatcher e libera hidratacao somente depois de settle do reset', async () => {
    const world = await createWorldA();
    const crashed = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      now: () => new Date('2026-08-14T12:00:00.000Z'),
      ownerToken: ownerToken('boot-reset'),
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
    const receipt = await world.adapter.readStorageOperationReceipt('boot-reset');
    await assertWorldZ(world, receipt?.stagedGenerationId as string, world.storage.getItem(KEY) as string);
  });

  it('resolvedor cobre cada janela e recusa core/geracao terceiros', () => {
    const targetCoreRaw = JSON.stringify({
      v: 2,
      savedAt: '2026-08-14T12:00:00.000Z',
      data: toPersistedCoreState(createEmptyPersistedState(), 'generation-z'),
    });
    const resetReceipt = (
      status: StorageOperationReceipt['status'],
      extras: {
        stagedGenerationId?: string | null;
        targetCoreRaw?: string | null;
      } = {},
    ): StorageOperationReceipt => ({
      operationId: 'reset-1',
      kind: 'reset',
      sourceDigest: null,
      previousCoreRaw: 'core-a',
      previousGenerationId: 'generation-a',
      stagedGenerationId: extras.stagedGenerationId === undefined
        ? 'generation-z'
        : extras.stagedGenerationId,
      targetCoreRaw: extras.targetCoreRaw === undefined ? targetCoreRaw : extras.targetCoreRaw,
      status,
      createdAt: '2026-08-14T12:00:00.000Z',
      updatedAt: '2026-08-14T12:00:00.000Z',
    });
    const base = {
      migrationGeneration: null,
      migrationStatus: 'completed',
      generations: [{ generationId: 'generation-a' }, { generationId: 'generation-z' }],
      previousGenerationIntegrity: 'verified' as const,
      stagedGenerationIntegrity: 'verified' as const,
      unsettledOperationCount: 1,
      pendingCompletionReceiptCount: 0,
    };
    expect(resolveLogicalResetRecovery({
      ...base,
      receipt: resetReceipt('staged', { stagedGenerationId: null, targetCoreRaw: null }),
      coreRaw: 'core-a',
      activeGeneration: 'generation-a',
    })).toEqual({
      action: 'stage-empty-generation',
      operationId: 'reset-1',
      previousGenerationId: 'generation-a',
    });
    expect(resolveLogicalResetRecovery({
      ...base,
      receipt: resetReceipt('staged', { targetCoreRaw: null }),
      coreRaw: 'core-a',
      activeGeneration: 'generation-a',
    })).toEqual({
      action: 'prepare-core',
      operationId: 'reset-1',
      generationId: 'generation-z',
    });
    expect(resolveLogicalResetRecovery({
      ...base,
      receipt: resetReceipt('activating'),
      coreRaw: 'core-a',
      activeGeneration: 'generation-a',
    })).toEqual({
      action: 'activate-generation',
      operationId: 'reset-1',
      stagedGenerationId: 'generation-z',
      previousGenerationId: 'generation-a',
    });
    expect(resolveLogicalResetRecovery({
      ...base,
      receipt: resetReceipt('activating'),
      coreRaw: 'core-a',
      activeGeneration: 'generation-z',
    })).toEqual({
      action: 'commit-core',
      operationId: 'reset-1',
      stagedGenerationId: 'generation-z',
    });
    expect(resolveLogicalResetRecovery({
      ...base,
      receipt: resetReceipt('activating'),
      coreRaw: targetCoreRaw,
      activeGeneration: 'generation-z',
    })).toEqual({
      action: 'mark-activated',
      operationId: 'reset-1',
      stagedGenerationId: 'generation-z',
    });
    expect(resolveLogicalResetRecovery({
      ...base,
      receipt: resetReceipt('activated'),
      coreRaw: targetCoreRaw,
      activeGeneration: 'generation-z',
    })).toEqual({ action: 'settle', operationId: 'reset-1' });
    expect(resolveLogicalResetRecovery({
      ...base,
      receipt: resetReceipt('activating'),
      coreRaw: 'core-terceiro',
      activeGeneration: 'generation-terceira',
      generations: [
        { generationId: 'generation-a' },
        { generationId: 'generation-z' },
        { generationId: 'generation-terceira' },
      ],
    })).toMatchObject({ action: 'blocked' });
  });

  it('zero delete: modulo e testes nao chamam primitivas destrutivas', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/storage-logical-reset.ts'),
      'utf8',
    );
    expect(source).not.toContain('clearInactiveGeneration');
    expect(source).not.toContain('deleteDatabase');
    expect(source).not.toContain('localStorage.clear');
    expect(source).not.toMatch(/objectStore\.clear/);
    expect(source).not.toMatch(/\.delete\s*\(/);
    expect(source).not.toMatch(/\.removeItem\s*\(/);
    expect(source).not.toContain('executeRetention');
    expect(source).not.toContain('applyRetention');
  });

  it('commitLogicalStorageResetV2 so tem call site autorizado no Context', () => {
    const found: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const relative = path.relative(process.cwd(), full).split(path.sep).join('/');
          const contents = fs.readFileSync(full, 'utf8');
          if (contents.includes('commitLogicalStorageResetV2')) found.push(relative);
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
      'src/lib/storage-logical-reset.ts',
      'src/providers/GymFlowContext.logical-reset.test.tsx',
      'src/providers/GymFlowContext.tsx',
    ]);
    const context = fs.readFileSync(
      path.join(process.cwd(), 'src/providers/GymFlowContext.tsx'),
      'utf8',
    );
    expect(context).toContain('commitLogicalStorageResetV2');
    expect(context).not.toContain('recoverLogicalStorageResetV2');
    const uiFiles = [
      'src/modules/AdminPanel.tsx',
      'src/components/ui/StorageResetControls.tsx',
    ];
    for (const file of uiFiles) {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source).not.toContain('commitLogicalStorageResetV2');
      expect(source).not.toContain('recoverLogicalStorageResetV2');
      expect(source).not.toContain('storage-logical-reset');
    }
  });
});

const _crashStep: LogicalResetCommitStep | null = null;
void _crashStep;
