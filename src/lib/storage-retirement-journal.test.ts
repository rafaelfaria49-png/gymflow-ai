import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../types';
import { createStorageAdminRuntime } from './storage-admin-runtime';
import type { StorageAdminOwnerTokenCoordinator } from './storage-admin-owner-token';
import { runStorageBootRecovery } from './storage-boot-recovery';
import { createWorkoutCompletionReceipt } from './storage-completion-receipt';
import {
  createHybridStorageRuntime,
  toPersistedCoreState,
} from './storage-hybrid';
import {
  GYMFLOW_INDEXEDDB_VERSION,
  IndexedDbWorkoutHistoryStorage,
} from './storage-indexeddb';
import { commitLogicalStorageImportV2 } from './storage-logical-import';
import {
  computeLogicalPayloadDigest,
  serializeLogicalPayloadCanonically,
} from './storage-logical-backup';
import { commitLogicalStorageResetV2 } from './storage-logical-reset';
import { createStorageOperationReceipt } from './storage-operation-receipt';
import { classifyStorageRetirement } from './storage-retirement-contract';
import {
  inspectStorageRetirementProof,
  proveStorageRetirement,
} from './storage-retirement-proof';
import {
  recoverStorageRetirementJournal,
  writeStorageRetirementJournal,
} from './storage-retirement-journal';
import {
  createEmptyPersistedState,
  type PersistedState,
  type StorageLike,
} from './storage-types';

const KEY = 'gymflow:state:v1';
const SOURCE_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const REPO_ROOT = join(SOURCE_ROOT, '..');
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

function lostLease() {
  return {
    confirm: () => ({ status: 'blocked' as const, reason: 'lost-ownership' as const }),
    execute: async <T>(operation: () => T | Promise<T>) => operation(),
    release: () => ({ status: 'not-released' as const, reason: 'lost-ownership' as const }),
  };
}

function ownedLease() {
  return {
    confirm: () => ({ status: 'owned' as const, reason: 'confirmed' as const }),
    execute: async <T>(operation: () => T | Promise<T>) => operation(),
    release: () => ({ status: 'released' as const, reason: 'released' as const }),
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

function state(history: WorkoutSession[]): PersistedState {
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

async function backupRaw(payload: PersistedState): Promise<string> {
  return JSON.stringify({
    format: 'gymflow-backup',
    formatVersion: 2,
    logicalSchemaVersion: 1,
    exportedAt: '2026-08-19T12:00:00.000Z',
    sourcePhysicalStorageVersion: 2,
    sourceSavedAt: '2026-08-19T11:59:00.000Z',
    payloadDigest: await computeLogicalPayloadDigest(payload),
    payload: JSON.parse(serializeLogicalPayloadCanonically(payload)) as PersistedState,
  });
}

async function createThreeGenerationWorld() {
  const storage = new MemoryStorage();
  const factory = new IDBFactory();
  const databaseName = `retirement-journal-${sequence += 1}`;
  let generationSequence = 0;
  const adapter = new IndexedDbWorkoutHistoryStorage({
    factory,
    databaseName,
    generationIdFactory: () => `generation-${generationSequence += 1}`,
    now: () => new Date('2026-08-19T10:00:00.000Z'),
  });
  const hybrid = createHybridStorageRuntime({
    key: KEY,
    storage,
    adapter,
    defaults: state([]),
    now: () => new Date('2026-08-19T10:00:00.000Z'),
  });
  const hydration = await hybrid.hydrate();
  if (hydration.mode !== 'hybrid-v2') throw new Error('setup nao ficou em v2');

  const stateA = state([session('a', 'Estado A')]);
  const generationA = await adapter.replaceHistory(stateA.workoutHistory);
  const initialRaw = storage.getItem(KEY) as string;
  const parsed = JSON.parse(initialRaw) as { data: Record<string, unknown> };
  parsed.data = {
    ...parsed.data,
    historyStorage: {
      ...(parsed.data.historyStorage as object),
      generationId: generationA,
    },
  };
  storage.setItem(KEY, JSON.stringify(parsed));
  await adapter.clearInactiveGeneration(hydration.generationId);

  const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter });
  const imported = await commitLogicalStorageImportV2({
    raw: await backupRaw(state([session('b', 'Estado B')])),
    runtime,
    adapter,
    storage,
    key: KEY,
    now: () => new Date('2026-08-19T12:01:00.000Z'),
    ownerToken: ownerToken('import-b'),
  });
  if (!imported.ok) throw new Error(`import setup falhou: ${imported.reason}`);

  const reset = await commitLogicalStorageResetV2({
    runtime,
    adapter,
    storage,
    key: KEY,
    now: () => new Date('2026-08-19T12:02:00.000Z'),
    ownerToken: ownerToken('reset-z'),
  });
  if (!reset.ok) throw new Error(`reset setup falhou: ${reset.reason}`);

  return {
    storage,
    adapter,
    runtime,
    factory,
    databaseName,
    generationA,
    generationB: imported.generationId,
    generationZ: reset.generationId,
  };
}

function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, ' ');
}

function listFiles(root: string, extensions: readonly string[]): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.')) {
        continue;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (extensions.some((extension) => entry.name.endsWith(extension))) found.push(full);
    }
  };
  walk(root);
  return found;
}

function relativeSource(file: string): string {
  return relative(REPO_ROOT, file).replace(/\\/g, '/');
}

describe('prova fisica e journal de retirement', () => {
  it('prova candidata, predecessor e fingerprint; prova forjada nao classifica', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveStorageRetirement({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      candidateGenerationId: world.generationA,
      reservedPredecessorGenerationId: world.generationB,
      supersedeOperationIds: [],
    });
    expect(proved.status).toBe('proved');
    if (proved.status !== 'proved') throw new Error('prova ausente');
    expect(proved.executionAuthorized).toBe(false);
    expect(proved.deleteAuthorized).toBe(false);

    const record = inspectStorageRetirementProof(proved.proof);
    expect(record?.candidateGenerationId).toBe(world.generationA);
    expect(record?.reservedPredecessorGenerationId).toBe(world.generationB);
    expect(record?.currentGenerationId).toBe(world.generationZ);

    const classified = classifyStorageRetirement({
      candidateGenerationId: world.generationA,
      reservedPredecessorGenerationId: world.generationB,
      currentGenerationId: world.generationZ,
      supersedeOperationIds: [],
      revalidationFingerprint: record?.fingerprint,
      proof: proved.proof,
    });
    expect(classified.status).toBe('retirement-classified');
    expect(classified.executionAuthorized).toBe(false);
    expect(classified.deleteAuthorized).toBe(false);

    const forged = classifyStorageRetirement({
      candidateGenerationId: world.generationA,
      reservedPredecessorGenerationId: world.generationB,
      currentGenerationId: world.generationZ,
      supersedeOperationIds: [],
      revalidationFingerprint: record?.fingerprint,
      proof: { ...record },
    });
    expect(forged.status).toBe('blocked-physical-proof-missing');
  });

  it('recusa candidata inexistente, predecessor inexistente, ativa e igual ao predecessor', async () => {
    const world = await createThreeGenerationWorld();
    expect((await proveStorageRetirement({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      candidateGenerationId: 'generation-missing',
      reservedPredecessorGenerationId: world.generationB,
      supersedeOperationIds: [],
    })).status).toBe('blocked-candidate-missing');
    expect((await proveStorageRetirement({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      candidateGenerationId: world.generationA,
      reservedPredecessorGenerationId: 'generation-missing',
      supersedeOperationIds: [],
    })).status).toBe('blocked-predecessor-missing');
    expect((await proveStorageRetirement({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      candidateGenerationId: world.generationZ,
      reservedPredecessorGenerationId: world.generationB,
      supersedeOperationIds: [],
    })).status).toBe('blocked-candidate-protected');
    expect((await proveStorageRetirement({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      candidateGenerationId: world.generationB,
      reservedPredecessorGenerationId: world.generationB,
      supersedeOperationIds: [],
    })).status).toBe('blocked-identity-invalid');
  });

  it('receipt aberto bloqueia a prova', async () => {
    const world = await createThreeGenerationWorld();
    const open = createStorageOperationReceipt({
      operationId: 'open-restore',
      kind: 'restore',
      previousCoreRaw: '{"open":true}',
      previousGenerationId: world.generationZ,
      createdAt: '2026-08-19T12:03:00.000Z',
      stagedGenerationId: null,
      targetGenerationId: world.generationB,
      targetCoreRaw: '{"target":true}',
    });
    await world.adapter.putStorageOperationReceipt(open);
    expect((await proveStorageRetirement({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      candidateGenerationId: world.generationA,
      reservedPredecessorGenerationId: world.generationB,
      supersedeOperationIds: [],
    })).status).toBe('blocked-operation-open');
  });

  it('completion pending bloqueia a prova', async () => {
    const world = await createThreeGenerationWorld();
    const pendingSession = session('p', 'Pendente');
    const receipt = await createWorkoutCompletionReceipt({
      receiptId: 'completion-pendente',
      generationId: world.generationZ,
      finalSession: pendingSession,
      coreEnvelopeAfter: toPersistedCoreState(
        createEmptyPersistedState(),
        world.generationZ,
      ),
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
      createdAt: '2026-08-19T12:03:00.000Z',
    });
    await world.adapter.appendSessionWithCompletionReceipt(pendingSession, receipt);
    expect((await proveStorageRetirement({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      candidateGenerationId: world.generationA,
      reservedPredecessorGenerationId: world.generationB,
      supersedeOperationIds: [],
    })).status).toBe('blocked-completion-pending');
  });

  it('snapshot mudado entre prova e journal falha fechado e nao apaga geracao', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveStorageRetirement({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      candidateGenerationId: world.generationA,
      reservedPredecessorGenerationId: world.generationB,
      supersedeOperationIds: [],
    });
    expect(proved.status).toBe('proved');
    if (proved.status !== 'proved') throw new Error('prova ausente');

    await world.adapter.replaceHistory([session('c', 'Estado C')]);
    const written = await writeStorageRetirementJournal({
      lease: ownedLease(),
      proof: proved.proof,
      adapter: world.adapter,
      now: () => new Date('2026-08-19T12:10:00.000Z'),
    });
    expect(written.status).toBe('blocked-snapshot-changed');
    expect(written.deleteAuthorized).toBe(false);
    const stillThere = await world.adapter.readVerifiedHistoryGeneration(world.generationA);
    expect(stillThere.manifest.verified).toBe(true);
  });

  it('journal e idempotente, recupera apos crash e recovery repetido nao apaga', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveStorageRetirement({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      candidateGenerationId: world.generationA,
      reservedPredecessorGenerationId: world.generationB,
      supersedeOperationIds: [],
    });
    expect(proved.status).toBe('proved');
    if (proved.status !== 'proved') throw new Error('prova ausente');

    const first = await writeStorageRetirementJournal({
      lease: ownedLease(),
      proof: proved.proof,
      adapter: world.adapter,
      now: () => new Date('2026-08-19T12:10:00.000Z'),
    });
    expect(first.status).toBe('recorded');
    expect(first.deleteAuthorized).toBe(false);
    expect(first.executionAuthorized).toBe(false);

    const second = await writeStorageRetirementJournal({
      lease: ownedLease(),
      proof: proved.proof,
      adapter: world.adapter,
      now: () => new Date('2026-08-19T12:11:00.000Z'),
    });
    expect(second.status).toBe('already-recorded');

    const snapshot = await world.adapter.readStorageAdministrationSnapshot();
    const recovered = recoverStorageRetirementJournal(
      await world.adapter.readStorageRetirementJournal(),
      snapshot.fingerprint,
    );
    expect(recovered.status).toBe('recorded');
    const repeated = recoverStorageRetirementJournal(
      await world.adapter.readStorageRetirementJournal(),
      snapshot.fingerprint,
    );
    expect(repeated).toEqual(recovered);
    expect(repeated.deleteAuthorized).toBe(false);

    const boot = await runStorageBootRecovery({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(boot.hydrationAllowed).toBe(true);

    const verifiedA = await world.adapter.readVerifiedHistoryGeneration(world.generationA);
    const verifiedB = await world.adapter.readVerifiedHistoryGeneration(world.generationB);
    const verifiedZ = await world.adapter.readVerifiedHistoryGeneration(world.generationZ);
    expect(verifiedA.manifest.verified).toBe(true);
    expect(verifiedB.manifest.verified).toBe(true);
    expect(verifiedZ.manifest.verified).toBe(true);
    expect(GYMFLOW_INDEXEDDB_VERSION).toBe(4);
  });

  it('journal incompleto nao vira sucesso e recovery falha fechado sem delete', async () => {
    const world = await createThreeGenerationWorld();
    await world.adapter.writeStorageRetirementJournalRecord({
      schemaVersion: 1,
      status: 'recorded',
      candidateGenerationId: world.generationA,
      reservedPredecessorGenerationId: world.generationB,
      currentGenerationId: world.generationZ,
      supersedeOperationIds: [],
      originFingerprint: 'stale-fingerprint',
      recordedAt: '2026-08-19T12:10:00.000Z',
    });
    const snapshot = await world.adapter.readStorageAdministrationSnapshot();
    const recovered = recoverStorageRetirementJournal(
      await world.adapter.readStorageRetirementJournal(),
      snapshot.fingerprint,
    );
    expect(recovered.status).toBe('blocked-fingerprint-mismatch');
    expect(recovered.deleteAuthorized).toBe(false);

    const boot = await runStorageBootRecovery({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(boot.status).toBe('blocked-administration-conflicted');
    expect(boot.hydrationAllowed).toBe(false);
    const stillThere = await world.adapter.readVerifiedHistoryGeneration(world.generationA);
    expect(stillThere.manifest.verified).toBe(true);
  });

  it('writer sem owner-token recusa e settled receipt nao impede a prova', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveStorageRetirement({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      candidateGenerationId: world.generationA,
      reservedPredecessorGenerationId: world.generationB,
      supersedeOperationIds: [],
    });
    expect(proved.status).toBe('proved');
    if (proved.status !== 'proved') throw new Error('prova ausente');
    const denied = await writeStorageRetirementJournal({
      lease: lostLease(),
      proof: proved.proof,
      adapter: world.adapter,
    });
    expect(denied.status).toBe('blocked-owner-token');
    expect(denied.deleteAuthorized).toBe(false);
    expect(denied.executionAuthorized).toBe(false);
  });

  it('IndexedDB permanece v4 e o journal vive no metadata store', async () => {
    const world = await createThreeGenerationWorld();
    const request = world.factory.open(world.databaseName, GYMFLOW_INDEXEDDB_VERSION);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(Array.from(database.objectStoreNames)).toEqual([
      'completionReceipts',
      'generationManifests',
      'legacySnapshots',
      'metadata',
      'storageOperationReceipts',
      'workoutHistory',
    ]);
    database.close();
  });
});

describe('guards zero delete da fundacao de retirement', () => {
  it('modulos novos nao introduzem delete fisico', () => {
    const files = [
      'storage-retirement-proof.ts',
      'storage-retirement-journal.ts',
      'storage-retirement-contract.ts',
    ].map((name) => join(SOURCE_ROOT, 'lib', name));
    const forbidden = [
      /\bdeleteDatabase\b/,
      /\bdeleteGeneration\b/,
      /\bclearInactiveGeneration\b/,
      /\bobjectStore\.delete\b/,
      /\.clear\s*\(/,
    ];
    for (const file of files) {
      const source = codeOf(file);
      for (const pattern of forbidden) expect(source).not.toMatch(pattern);
      expect(source).toContain('deleteAuthorized: false');
    }
  });

  it('writer nao possui call site de UI ou Provider', () => {
    const callers = listFiles(SOURCE_ROOT, ['.ts', '.tsx'])
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => /\bwriteStorageRetirementJournal\s*\(/.test(codeOf(file)))
      .map(relativeSource)
      .sort();
    expect(callers).toEqual(['src/lib/storage-retirement-journal.ts']);
  });
});
