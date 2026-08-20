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
import { resolveLogicalRestorePredecessorV2 } from './storage-logical-restore-resolve';
import {
  createStorageOperationReceipt,
  listActivePredecessorSourceOperationIds,
} from './storage-operation-receipt';
import { planStorageRetention } from './storage-retention';
import { classifyStorageRetirement } from './storage-retirement-contract';
import {
  inspectStorageRetirementProof,
  proveStorageRetirement,
  type StorageRetirementProof,
} from './storage-retirement-proof';
import {
  decideStorageRetirementJournalCas,
  recoverStorageRetirementJournal,
  STORAGE_RETIREMENT_JOURNAL_METADATA_KEY,
  STORAGE_RETIREMENT_JOURNAL_SCHEMA_VERSION,
  writeStorageRetirementJournal,
  type StorageRetirementJournal,
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

type RetirementWorld = Awaited<ReturnType<typeof createThreeGenerationWorld>>;

async function createFourGenerationWorld() {
  const world = await createThreeGenerationWorld();
  const reset = await commitLogicalStorageResetV2({
    runtime: world.runtime,
    adapter: world.adapter,
    storage: world.storage,
    key: KEY,
    now: () => new Date('2026-08-19T12:03:00.000Z'),
    ownerToken: ownerToken('reset-z2'),
  });
  if (!reset.ok) throw new Error(`segundo reset setup falhou: ${reset.reason}`);
  return {
    ...world,
    generationZ1: world.generationZ,
    generationZ2: reset.generationId,
  };
}

function twoConnections(factory: IDBFactory, databaseName: string) {
  const left = new IndexedDbWorkoutHistoryStorage({ factory, databaseName });
  const right = new IndexedDbWorkoutHistoryStorage({ factory, databaseName });
  return { left, right };
}

async function proveCandidate(world: RetirementWorld, candidateGenerationId: string) {
  const snapshot = await world.adapter.readStorageAdministrationSnapshot();
  const predecessor = await resolveLogicalRestorePredecessorV2({
    adapter: world.adapter,
    storage: world.storage,
    key: KEY,
  });
  if (predecessor.status !== 'available') {
    throw new Error(`predecessor nao disponivel: ${predecessor.status}`);
  }
  return proveStorageRetirement({
    adapter: world.adapter,
    storage: world.storage,
    key: KEY,
    candidateGenerationId,
    reservedPredecessorGenerationId: predecessor.target.targetGenerationId,
    supersedeOperationIds: listActivePredecessorSourceOperationIds(
      snapshot.operationReceipts,
      candidateGenerationId,
    ),
  });
}

function journalFromProof(
  proof: StorageRetirementProof,
  recordedAt: string,
  override: Partial<Pick<StorageRetirementJournal, 'candidateGenerationId'>> = {},
): StorageRetirementJournal {
  const record = inspectStorageRetirementProof(proof);
  if (record === null) throw new Error('prova ausente');
  return {
    schemaVersion: STORAGE_RETIREMENT_JOURNAL_SCHEMA_VERSION,
    status: 'recorded',
    candidateGenerationId: override.candidateGenerationId ?? record.candidateGenerationId,
    reservedPredecessorGenerationId: record.reservedPredecessorGenerationId,
    currentGenerationId: record.currentGenerationId,
    supersedeOperationIds: [...record.supersedeOperationIds],
    originFingerprint: record.fingerprint,
    recordedAt,
  };
}

async function putRawJournal(factory: IDBFactory, databaseName: string, value: unknown) {
  const request = factory.open(databaseName, GYMFLOW_INDEXEDDB_VERSION);
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('metadata', 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('abort'));
    transaction.objectStore('metadata').put({
      key: STORAGE_RETIREMENT_JOURNAL_METADATA_KEY,
      value,
    });
  });
  database.close();
}

async function physicalLineage(adapter: IndexedDbWorkoutHistoryStorage) {
  const generations = await adapter.listHistoryGenerations();
  const snapshot = await adapter.readStorageAdministrationSnapshot();
  return {
    generations: generations.map((entry) => [
      entry.generationId,
      entry.recordCount,
      entry.orderedDigest,
      entry.isActive,
    ]),
    operationIds: snapshot.operationReceipts.map((receipt) => receipt.operationId).sort(),
  };
}

function sampleJournal(originFingerprint: string): StorageRetirementJournal {
  return {
    schemaVersion: STORAGE_RETIREMENT_JOURNAL_SCHEMA_VERSION,
    status: 'recorded',
    candidateGenerationId: 'generation-a',
    reservedPredecessorGenerationId: 'generation-b',
    currentGenerationId: 'generation-z',
    supersedeOperationIds: [],
    originFingerprint,
    recordedAt: '2026-08-19T12:10:00.000Z',
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

describe('decisao pura do compare-and-put do journal', () => {
  const next = sampleJournal('fp-1');

  it('ausente + ausente autoriza a primeira gravacao', () => {
    const decision = decideStorageRetirementJournalCas({
      expectedFingerprint: 'fp-1',
      actualFingerprint: 'fp-1',
      existingRaw: null,
      next,
    });
    expect(decision).toMatchObject({ status: 'recorded', shouldPut: true });
    expect(decision.journal?.candidateGenerationId).toBe('generation-a');
  });

  it('intencao equivalente ignora recordedAt e nao regrava', () => {
    const decision = decideStorageRetirementJournalCas({
      expectedFingerprint: 'fp-1',
      actualFingerprint: 'fp-1',
      existingRaw: { ...next, recordedAt: '2026-08-19T12:11:00.000Z' },
      next,
    });
    expect(decision).toMatchObject({
      status: 'already-recorded',
      shouldPut: false,
      journal: { ...next, recordedAt: '2026-08-19T12:11:00.000Z' },
    });
  });

  it('intencao divergente bloqueia sem overwrite', () => {
    const decision = decideStorageRetirementJournalCas({
      expectedFingerprint: 'fp-1',
      actualFingerprint: 'fp-1',
      existingRaw: { ...next, candidateGenerationId: 'generation-other' },
      next,
    });
    expect(decision.status).toBe('blocked-journal-conflict');
    expect(decision.shouldPut).toBe(false);
    expect(decision.journal?.candidateGenerationId).toBe('generation-other');
  });

  it('journal malformado ou incompleto falha fechado', () => {
    expect(decideStorageRetirementJournalCas({
      expectedFingerprint: 'fp-1',
      actualFingerprint: 'fp-1',
      existingRaw: { status: 'pending' },
      next,
    })).toMatchObject({ status: 'blocked-journal-conflict', shouldPut: false, journal: null });

    expect(decideStorageRetirementJournalCas({
      expectedFingerprint: 'fp-1',
      actualFingerprint: 'fp-1',
      existingRaw: 'not-a-journal',
      next,
    })).toMatchObject({ status: 'blocked-journal-conflict', shouldPut: false, journal: null });
  });

  it('fingerprint administrativo divergente recusa a escrita', () => {
    expect(decideStorageRetirementJournalCas({
      expectedFingerprint: 'fp-1',
      actualFingerprint: 'fp-2',
      existingRaw: null,
      next,
    })).toMatchObject({ status: 'blocked-snapshot-changed', shouldPut: false, journal: null });

    expect(decideStorageRetirementJournalCas({
      expectedFingerprint: 'fp-1',
      actualFingerprint: 'fp-1',
      existingRaw: null,
      next: sampleJournal('fp-stale'),
    })).toMatchObject({ status: 'blocked-snapshot-changed', shouldPut: false, journal: null });
  });
});

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
    expect(snapshot.fingerprint).toBe(inspectStorageRetirementProof(proved.proof)?.fingerprint);
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

describe('compare-and-put atomico do journal de retirement', () => {
  it('journal ausente grava recorded e a mesma intencao sequencial vira already-recorded', async () => {
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
    const lineage = await physicalLineage(world.adapter);

    const first = await writeStorageRetirementJournal({
      lease: ownedLease(),
      proof: proved.proof,
      adapter: world.adapter,
      now: () => new Date('2026-08-19T12:10:00.000Z'),
    });
    expect(first.status).toBe('recorded');
    expect(first.executionAuthorized).toBe(false);
    expect(first.deleteAuthorized).toBe(false);
    expect(first.writeAuthorized).toBe(false);

    const second = await writeStorageRetirementJournal({
      lease: ownedLease(),
      proof: proved.proof,
      adapter: world.adapter,
      now: () => new Date('2026-08-19T12:11:00.000Z'),
    });
    expect(second.status).toBe('already-recorded');
    expect(second.journal?.recordedAt).toBe('2026-08-19T12:10:00.000Z');
    expect(await physicalLineage(world.adapter)).toEqual(lineage);
    expect(planStorageRetention(await world.adapter.readStorageAdministrationSnapshot()).delete)
      .toEqual([]);
  });

  it('intencao divergente sequencial conflita e nao sobrescreve', async () => {
    const world = await createFourGenerationWorld();
    const provedA = await proveCandidate(world, world.generationA);
    const provedB = await proveCandidate(world, world.generationB);
    expect(provedA.status).toBe('proved');
    expect(provedB.status).toBe('proved');
    if (provedA.status !== 'proved' || provedB.status !== 'proved') {
      throw new Error('provas divergentes ausentes');
    }

    const first = await writeStorageRetirementJournal({
      lease: ownedLease(),
      proof: provedA.proof,
      adapter: world.adapter,
      now: () => new Date('2026-08-19T12:10:00.000Z'),
    });
    expect(first.status).toBe('recorded');

    const second = await writeStorageRetirementJournal({
      lease: ownedLease(),
      proof: provedB.proof,
      adapter: world.adapter,
      now: () => new Date('2026-08-19T12:11:00.000Z'),
    });
    expect(second.status).toBe('blocked-journal-conflict');
    expect(second.journal?.candidateGenerationId).toBe(world.generationA);

    const recovered = recoverStorageRetirementJournal(
      await world.adapter.readStorageRetirementJournal(),
      (await world.adapter.readStorageAdministrationSnapshot()).fingerprint,
    );
    expect(recovered.status).toBe('recorded');
    expect(recovered.journal?.candidateGenerationId).toBe(world.generationA);
    expect(recovered.deleteAuthorized).toBe(false);
  });

  it('duas intencoes divergentes concorrentes: exatamente uma vence', async () => {
    const world = await createFourGenerationWorld();
    const provedA = await proveCandidate(world, world.generationA);
    const provedB = await proveCandidate(world, world.generationB);
    expect(provedA.status).toBe('proved');
    expect(provedB.status).toBe('proved');
    if (provedA.status !== 'proved' || provedB.status !== 'proved') {
      throw new Error('provas divergentes ausentes');
    }
    const lineage = await physicalLineage(world.adapter);
    const { left, right } = twoConnections(world.factory, world.databaseName);
    await left.open();
    await right.open();

    const [first, second] = await Promise.all([
      writeStorageRetirementJournal({
        lease: ownedLease(),
        proof: provedA.proof,
        adapter: left,
        now: () => new Date('2026-08-19T12:10:00.000Z'),
      }),
      writeStorageRetirementJournal({
        lease: ownedLease(),
        proof: provedB.proof,
        adapter: right,
        now: () => new Date('2026-08-19T12:11:00.000Z'),
      }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(['blocked-journal-conflict', 'recorded']);
    const winner = first.status === 'recorded' ? first : second;
    const loser = first.status === 'recorded' ? second : first;
    expect(winner.journal?.candidateGenerationId).toBe(
      winner === first ? world.generationA : world.generationB,
    );
    expect(loser.journal?.candidateGenerationId).toBe(winner.journal?.candidateGenerationId);

    const persisted = recoverStorageRetirementJournal(
      await world.adapter.readStorageRetirementJournal(),
      (await world.adapter.readStorageAdministrationSnapshot()).fingerprint,
    );
    expect(persisted.status).toBe('recorded');
    expect([world.generationA, world.generationB]).toContain(persisted.journal?.candidateGenerationId);
    expect(persisted.journal?.candidateGenerationId).toBe(winner.journal?.candidateGenerationId);
    expect(await physicalLineage(world.adapter)).toEqual(lineage);
    expect(first.deleteAuthorized).toBe(false);
    expect(second.deleteAuthorized).toBe(false);
    expect(planStorageRetention(await world.adapter.readStorageAdministrationSnapshot()).delete)
      .toEqual([]);
  });

  it('duas escritas equivalentes concorrentes convergem sem conflito falso', async () => {
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
    const { left, right } = twoConnections(world.factory, world.databaseName);
    await left.open();
    await right.open();

    const [first, second] = await Promise.all([
      writeStorageRetirementJournal({
        lease: ownedLease(),
        proof: proved.proof,
        adapter: left,
        now: () => new Date('2026-08-19T12:10:00.000Z'),
      }),
      writeStorageRetirementJournal({
        lease: ownedLease(),
        proof: proved.proof,
        adapter: right,
        now: () => new Date('2026-08-19T12:11:00.000Z'),
      }),
    ]);

    expect([first.status, second.status].sort()).toEqual(['already-recorded', 'recorded']);
    const recorded = first.status === 'recorded' ? first : second;
    const already = first.status === 'recorded' ? second : first;
    expect(already.journal?.recordedAt).toBe(recorded.journal?.recordedAt);
    expect(already.journal?.candidateGenerationId).toBe(world.generationA);

    const persisted = recoverStorageRetirementJournal(
      await world.adapter.readStorageRetirementJournal(),
      (await world.adapter.readStorageAdministrationSnapshot()).fingerprint,
    );
    expect(persisted.status).toBe('recorded');
    expect(persisted.journal?.candidateGenerationId).toBe(world.generationA);
    expect(first.deleteAuthorized).toBe(false);
    expect(second.deleteAuthorized).toBe(false);
  });

  it('primitive CAS recusa intencao divergente sem last-write-win', async () => {
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
    const journalA = journalFromProof(proved.proof, '2026-08-19T12:10:00.000Z');
    const journalDivergent = journalFromProof(
      proved.proof,
      '2026-08-19T12:11:00.000Z',
      { candidateGenerationId: 'generation-divergent' },
    );
    const { left, right } = twoConnections(world.factory, world.databaseName);
    await left.open();
    await right.open();

    const [first, second] = await Promise.all([
      left.compareAndPutStorageRetirementJournal({
        expectedFingerprint: journalA.originFingerprint,
        journal: journalA,
      }),
      right.compareAndPutStorageRetirementJournal({
        expectedFingerprint: journalDivergent.originFingerprint,
        journal: journalDivergent,
      }),
    ]);

    expect([first.status, second.status].sort()).toEqual(['blocked-journal-conflict', 'recorded']);
    const winner = first.status === 'recorded' ? first : second;
    expect(['generation-divergent', world.generationA]).toContain(winner.journal?.candidateGenerationId);
    const persisted = await world.adapter.readStorageRetirementJournal() as StorageRetirementJournal;
    expect(persisted.candidateGenerationId).toBe(winner.journal?.candidateGenerationId);
  });

  it('journal malformado existente nao e sobrescrito', async () => {
    const world = await createThreeGenerationWorld();
    await putRawJournal(world.factory, world.databaseName, { status: 'pending', schemaVersion: 1 });
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

    const written = await writeStorageRetirementJournal({
      lease: ownedLease(),
      proof: proved.proof,
      adapter: world.adapter,
    });
    expect(written.status).toBe('blocked-journal-conflict');
    expect(written.journal).toBeNull();
    expect(await world.adapter.readStorageRetirementJournal()).toEqual({
      status: 'pending',
      schemaVersion: 1,
    });
    expect((await world.adapter.readVerifiedHistoryGeneration(world.generationA)).manifest.verified)
      .toBe(true);
  });

  it('fingerprint mudado antes da transacao recusa a escrita', async () => {
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
    });
    expect(written.status).toBe('blocked-snapshot-changed');
    expect(await world.adapter.readStorageRetirementJournal()).toBeNull();
    expect((await world.adapter.readVerifiedHistoryGeneration(world.generationA)).manifest.verified)
      .toBe(true);
  });

  it('estado administrativo mudado durante a tentativa falha fechado', async () => {
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
    const { left, right } = twoConnections(world.factory, world.databaseName);
    await left.open();
    await right.open();

    const [written] = await Promise.all([
      writeStorageRetirementJournal({
        lease: ownedLease(),
        proof: proved.proof,
        adapter: left,
        now: () => new Date('2026-08-19T12:10:00.000Z'),
      }),
      right.replaceHistory([session('c', 'Estado C')]),
    ]);

    expect(['recorded', 'blocked-snapshot-changed']).toContain(written.status);
    expect(written.deleteAuthorized).toBe(false);
    const snapshot = await world.adapter.readStorageAdministrationSnapshot();
    const recovered = recoverStorageRetirementJournal(
      await world.adapter.readStorageRetirementJournal(),
      snapshot.fingerprint,
    );
    expect(recovered.status).not.toBe('recorded');
    expect((await world.adapter.readVerifiedHistoryGeneration(world.generationA)).manifest.verified)
      .toBe(true);
    expect((await world.adapter.readVerifiedHistoryGeneration(world.generationB)).manifest.verified)
      .toBe(true);
    expect((await world.adapter.readVerifiedHistoryGeneration(world.generationZ)).manifest.verified)
      .toBe(true);
  });

  it('prova forjada ou clonada continua recusada', async () => {
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
    const record = inspectStorageRetirementProof(proved.proof);
    const forged = await writeStorageRetirementJournal({
      lease: ownedLease(),
      proof: { ...record } as never,
      adapter: world.adapter,
    });
    const cloned = await writeStorageRetirementJournal({
      lease: ownedLease(),
      proof: JSON.parse(JSON.stringify(proved.proof)) as never,
      adapter: world.adapter,
    });
    expect(forged.status).toBe('blocked-proof-missing');
    expect(cloned.status).toBe('blocked-proof-missing');
    expect(await world.adapter.readStorageRetirementJournal()).toBeNull();
  });

  it('reload apos recorded e recovery repetido preservam o journal', async () => {
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
    const written = await writeStorageRetirementJournal({
      lease: ownedLease(),
      proof: proved.proof,
      adapter: world.adapter,
      now: () => new Date('2026-08-19T12:10:00.000Z'),
    });
    expect(written.status).toBe('recorded');
    await world.adapter.close();

    const reopened = new IndexedDbWorkoutHistoryStorage({
      factory: world.factory,
      databaseName: world.databaseName,
    });
    await reopened.open();
    const snapshot = await reopened.readStorageAdministrationSnapshot();
    const recovered = recoverStorageRetirementJournal(
      await reopened.readStorageRetirementJournal(),
      snapshot.fingerprint,
    );
    expect(recovered.status).toBe('recorded');
    expect(recovered.journal?.candidateGenerationId).toBe(world.generationA);
    expect(recoverStorageRetirementJournal(
      await reopened.readStorageRetirementJournal(),
      snapshot.fingerprint,
    )).toEqual(recovered);

    const boot = await runStorageBootRecovery({
      adapter: reopened,
      storage: world.storage,
      key: KEY,
    });
    expect(boot.hydrationAllowed).toBe(true);
    expect(boot.status).not.toBe('blocked-administration-conflicted');
    expect(planStorageRetention(snapshot).delete).toEqual([]);
  });

  it('adapter sem compare-and-put falha fechado e o lease nao e CAS', async () => {
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
    const written = await writeStorageRetirementJournal({
      lease: ownedLease(),
      proof: proved.proof,
      adapter: {
        readStorageRetirementJournal: async () => null,
      } as never,
    });
    expect(written.status).toBe('blocked-unknown-state');
    expect(await world.adapter.readStorageRetirementJournal()).toBeNull();
  });
});

describe('guards zero delete da fundacao de retirement', () => {
  it('modulos novos nao introduzem delete fisico', () => {
    const files = [
      'storage-retirement-proof.ts',
      'storage-retirement-journal.ts',
      'storage-retirement-contract.ts',
      'storage-retention-policy.ts',
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

    const indexedDb = readFileSync(join(SOURCE_ROOT, 'lib', 'storage-indexeddb.ts'), 'utf8');
    const cas = indexedDb.match(
      /async compareAndPutStorageRetirementJournal[\s\S]*?\n  \/\/ Fixture de teste/,
    )?.[0];
    expect(cas).toBeTruthy();
    expect(cas).toContain('decideStorageRetirementJournalCas');
    expect(cas).not.toMatch(/\bdeleteGeneration\b/);
    expect(cas).not.toMatch(/\bdeleteDatabase\b/);
    expect(cas).not.toMatch(/objectStore\.delete/);
    expect(cas).not.toMatch(/objectStore\.clear/);
    expect(cas).not.toMatch(/clearInactiveGeneration/);
  });

  it('writer de producao so persiste via compare-and-put', () => {
    const source = codeOf(join(SOURCE_ROOT, 'lib', 'storage-retirement-journal.ts'));
    expect(source).toContain('compareAndPutStorageRetirementJournal');
    expect(source).not.toMatch(/writeStorageRetirementJournalRecord/);
    expect(source).not.toMatch(/readStorageAdministrationSnapshot/);
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
