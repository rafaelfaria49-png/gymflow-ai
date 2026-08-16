import fs from 'node:fs';
import path from 'node:path';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../types';
import { createStorageAdminRuntime } from './storage-admin-runtime';
import {
  createHybridStorageRuntime,
  parsePhysicalEnvelope,
  saveHybridCoreResult,
} from './storage-hybrid';
import { IndexedDbWorkoutHistoryStorage } from './storage-indexeddb';
import { commitLogicalStorageImportV2 } from './storage-logical-import';
import {
  computeLogicalPayloadDigest,
  serializeLogicalPayloadCanonically,
} from './storage-logical-backup';
import {
  commitLogicalStorageRestoreV2,
  proveLogicalStorageRestoreTargetV2,
} from './storage-logical-restore';
import {
  resolveLogicalRestorePredecessorV2,
} from './storage-logical-restore-resolve';
import type { StorageAdminOwnerTokenCoordinator } from './storage-admin-owner-token';
import type { PersistedState, StorageLike } from './storage-types';
import type { StorageOperationReceipt } from './storage-operation-receipt';

const KEY = 'gymflow:state:v1';
let sequence = 0;

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

function state(
  history: WorkoutSession[],
  extras: Partial<PersistedState> = {},
): PersistedState {
  return {
    user: null,
    weeklyPlan: [],
    customPrograms: extras.customPrograms ?? [],
    activeWorkout: null,
    activeWorkoutStartedAt: null,
    restTimerEndAt: null,
    restTimerTotalSeconds: null,
    restTimerLabel: null,
    workoutHistory: history,
    weightHistory: extras.weightHistory ?? [],
    measurementsHistory: extras.measurementsHistory ?? [],
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
    achievements: [],
    challenges: [],
    favoriteExercises: extras.favoriteExercises ?? [],
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

async function createImportedWorld(options?: {
  stateA?: PersistedState;
  stateB?: PersistedState;
}) {
  const storage = new MemoryStorage();
  const factory = new IDBFactory();
  const databaseName = `restore-resolve-${sequence += 1}`;
  let generationSequence = 0;
  const adapter = new IndexedDbWorkoutHistoryStorage({
    factory,
    databaseName,
    generationIdFactory: () => `generation-${generationSequence += 1}`,
    now: () => new Date('2026-08-13T10:00:00.000Z'),
  });
  const stateA = options?.stateA ?? state([session('a', 'Estado A')], {
    customPrograms: [{
      id: 'program-custom-a',
      name: 'Programa A',
      durationWeeks: 4,
      frequencyDays: 3,
      level: 'intermediate',
      objective: 'hipertrofia',
      exercises: [],
      description: 'A',
      repeatWeeks: true,
      weeks: [],
      isCustom: true,
    }],
    weightHistory: [
      { date: '2026-05-01', value: 80 },
      { date: '2026-05-08', value: 79.5 },
    ],
    measurementsHistory: [
      { date: '2026-05-01', chest: 100, waist: 80, hips: 95, arms: 35 },
    ],
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

  const generationA = await adapter.replaceHistory(stateA.workoutHistory);
  const initialRaw = storage.getItem(KEY) as string;
  const parsed = JSON.parse(initialRaw) as { data: Record<string, unknown> };
  parsed.data = {
    ...parsed.data,
    customPrograms: stateA.customPrograms,
    weightHistory: stateA.weightHistory,
    measurementsHistory: stateA.measurementsHistory,
    historyStorage: {
      ...(parsed.data.historyStorage as object),
      generationId: generationA,
    },
  };
  const coreA = JSON.stringify(parsed);
  storage.setItem(KEY, coreA);
  await adapter.clearInactiveGeneration(hydration.generationId);

  const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter });
  const payloadB = options?.stateB ?? state([session('b', 'Estado B')], {
    favoriteExercises: ['exercise-b'],
    weightHistory: [{ date: '2026-06-01', value: 81 }],
  });
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

  return {
    storage,
    adapter,
    runtime,
    coreA,
    generationA,
    generationB: imported.generationId,
    importOperationId: imported.operationId,
  };
}

describe('resolveLogicalRestorePredecessorV2', () => {
  it('zero candidato comprovavel => unavailable', async () => {
    const storage = new MemoryStorage();
    const factory = new IDBFactory();
    const adapter = new IndexedDbWorkoutHistoryStorage({
      factory,
      databaseName: `restore-resolve-${sequence += 1}`,
    });
    const hybrid = createHybridStorageRuntime({
      key: KEY,
      storage,
      adapter,
      defaults: state([]),
    });
    const hydration = await hybrid.hydrate();
    expect(hydration.mode).toBe('hybrid-v2');

    const resolved = await resolveLogicalRestorePredecessorV2({ adapter, storage, key: KEY });
    expect(resolved).toEqual({ status: 'unavailable' });
  });

  it('exatamente um candidato comprovavel => available com preview agregado', async () => {
    const world = await createImportedWorld();
    const resolved = await resolveLogicalRestorePredecessorV2({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(resolved.status).toBe('available');
    if (resolved.status !== 'available') throw new Error('esperado available');
    expect(resolved.target.sourceOperationId).toBe(world.importOperationId);
    expect(resolved.target.targetGenerationId).toBe(world.generationA);
    expect(resolved.target.targetCoreRaw).toBe(world.coreA);
    expect(resolved.preview).toEqual({
      sessionCount: 1,
      customProgramCount: 1,
      weightRecordCount: 2,
      measurementRecordCount: 1,
    });
    expect(JSON.stringify(resolved.preview)).not.toContain('generation-');
    expect(JSON.stringify(resolved.preview)).not.toContain(world.importOperationId);
  });

  it('dois candidatos integralmente validos => ambiguous sem escolha', async () => {
    const world = await createImportedWorld();
    const source = await world.adapter.readStorageOperationReceipt(world.importOperationId);
    if (source === null) throw new Error('receipt fonte ausente');
    const firstProof = await proveLogicalStorageRestoreTargetV2({
      sourceOperationId: source.operationId,
      targetCoreRaw: source.previousCoreRaw,
      targetGenerationId: source.previousGenerationId,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(firstProof.ok).toBe(true);

    await world.adapter.putStorageOperationReceipt({
      ...source,
      operationId: 'import-zzz-later-id',
      createdAt: '2026-08-14T23:59:59.000Z',
      updatedAt: '2026-08-14T23:59:59.000Z',
    } as StorageOperationReceipt);

    const secondProof = await proveLogicalStorageRestoreTargetV2({
      sourceOperationId: 'import-zzz-later-id',
      targetCoreRaw: source.previousCoreRaw,
      targetGenerationId: source.previousGenerationId,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(secondProof.ok).toBe(true);

    const resolved = await resolveLogicalRestorePredecessorV2({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(resolved).toEqual({ status: 'ambiguous' });
    expect(JSON.stringify(resolved)).not.toContain('import-');
    expect(JSON.stringify(resolved)).not.toContain('generation-');
    expect(JSON.stringify(resolved)).not.toMatch(/chosen|selected|latest|last/i);
  });

  it('autosave neutro do mundo atual nao elimina o predecessor comprovado', async () => {
    const world = await createImportedWorld();
    const before = world.storage.getItem(KEY) as string;
    const parsed = parsePhysicalEnvelope(before);
    if (parsed.status !== 'v2') throw new Error('core ativo nao e v2');
    const saved = saveHybridCoreResult(
      KEY,
      parsed.envelope.data,
      world.storage,
      () => new Date('2026-08-13T18:00:00.000Z'),
    );
    expect(saved.ok).toBe(true);
    expect(world.storage.getItem(KEY)).not.toBe(before);

    const stillProves = await proveLogicalStorageRestoreTargetV2({
      sourceOperationId: world.importOperationId,
      targetCoreRaw: world.coreA,
      targetGenerationId: world.generationA,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(stillProves.ok).toBe(true);

    const resolved = await resolveLogicalRestorePredecessorV2({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(resolved.status).toBe('available');
    if (resolved.status !== 'available') throw new Error('esperado available apos autosave');
    expect(resolved.target.targetGenerationId).toBe(world.generationA);
    expect(resolved.target.targetCoreRaw).toBe(world.coreA);
    expect(resolved.target.currentCoreRaw).toBe(world.storage.getItem(KEY));

    const restored = await commitLogicalStorageRestoreV2({
      target: resolved.target,
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: ownerToken('restore-after-autosave'),
    });
    expect(restored.ok).toBe(true);
  });

  it('receipt settled cuja geracao final nao e a ativa nao e candidato', async () => {
    const world = await createImportedWorld();
    const source = await world.adapter.readStorageOperationReceipt(world.importOperationId);
    if (source === null || source.kind !== 'import') throw new Error('receipt fonte ausente');
    await world.adapter.putStorageOperationReceipt({
      ...source,
      operationId: 'import-other-generation',
      stagedGenerationId: 'generation-other',
    } as StorageOperationReceipt);

    const resolved = await resolveLogicalRestorePredecessorV2({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(resolved.status).toBe('available');
    if (resolved.status !== 'available') throw new Error('esperado o unico candidato da geracao ativa');
    expect(resolved.target.sourceOperationId).toBe(world.importOperationId);
  });

  it('previous generation ausente => unavailable', async () => {
    const world = await createImportedWorld();
    await world.adapter.clearInactiveGeneration(world.generationA);
    const resolved = await resolveLogicalRestorePredecessorV2({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(resolved).toEqual({ status: 'unavailable' });
  });

  it('prova do alvo invalida => unavailable', async () => {
    const world = await createImportedWorld();
    const source = await world.adapter.readStorageOperationReceipt(world.importOperationId);
    if (source === null) throw new Error('receipt fonte ausente');
    await world.adapter.putStorageOperationReceipt({
      ...source,
      previousCoreRaw: world.storage.getItem(KEY) as string,
    } as StorageOperationReceipt);

    const resolved = await resolveLogicalRestorePredecessorV2({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(resolved).toEqual({ status: 'unavailable' });
  });

  it('nao usa timestamp, ordem ou ID lexical para escolher', async () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/storage-logical-restore-resolve.ts'),
      'utf8',
    );
    expect(source).not.toContain('createdAt');
    expect(source).not.toMatch(/\bupdatedAt\b/);
    expect(source).not.toContain('localeCompare');
    expect(source).not.toContain('.sort(');
    expect(source).not.toContain('at(-1)');
    expect(source).not.toMatch(/receipts\s*\[\s*0\s*\]/);
  });

  it('apos restore real o predecessor volta a ser o mundo B', async () => {
    const world = await createImportedWorld();
    const first = await resolveLogicalRestorePredecessorV2({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    if (first.status !== 'available') throw new Error('primeiro predecessor ausente');
    const restored = await commitLogicalStorageRestoreV2({
      target: first.target,
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: ownerToken('restore-to-a'),
    });
    expect(restored.ok).toBe(true);

    const second = await resolveLogicalRestorePredecessorV2({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(second.status).toBe('available');
    if (second.status !== 'available') throw new Error('segundo predecessor ausente');
    expect(second.target.targetGenerationId).toBe(world.generationB);
    expect(second.preview.sessionCount).toBe(1);
    expect(second.preview.customProgramCount).toBe(0);
  });

  it('A → B → A → B deixa exatamente um predecessor comprovavel e preserva receipts', async () => {
    const world = await createImportedWorld();
    const first = await resolveLogicalRestorePredecessorV2({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(first.status).toBe('available');
    if (first.status !== 'available') throw new Error('predecessor de B ausente');
    expect(first.target.targetGenerationId).toBe(world.generationA);

    const restoredA = await commitLogicalStorageRestoreV2({
      target: first.target,
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: ownerToken('restore-to-a'),
    });
    expect(restoredA.ok).toBe(true);

    const second = await resolveLogicalRestorePredecessorV2({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(second.status).toBe('available');
    if (second.status !== 'available') throw new Error('predecessor de A ausente');
    expect(second.target.targetGenerationId).toBe(world.generationB);

    const restoredB = await commitLogicalStorageRestoreV2({
      target: second.target,
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      ownerToken: ownerToken('restore-to-b'),
    });
    expect(restoredB.ok).toBe(true);

    const third = await resolveLogicalRestorePredecessorV2({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(third.status).toBe('available');
    if (third.status !== 'available') throw new Error('ping-pong B sem predecessor unico');
    expect(third.target.targetGenerationId).toBe(world.generationA);
    expect(third.status).not.toBe('ambiguous');

    const snapshot = await world.adapter.readStorageAdministrationSnapshot();
    const importReceipt = snapshot.operationReceipts.find(
      (entry) => entry.operationId === world.importOperationId,
    );
    const restoreToB = snapshot.operationReceipts.find(
      (entry) => entry.operationId === 'restore-to-b',
    );
    expect(importReceipt?.status).toBe('settled');
    expect(restoreToB?.kind).toBe('restore');
    expect(restoreToB?.supersedesOperationIds).toEqual([world.importOperationId]);
    expect(snapshot.operationReceipts).toHaveLength(3);

    const verifiedA = await world.adapter.readVerifiedHistoryGeneration(world.generationA);
    expect(verifiedA.manifest.verified).toBe(true);
    expect(verifiedA.sessions.map((entry) => entry.name)).toEqual(['Estado A']);
  });
});
