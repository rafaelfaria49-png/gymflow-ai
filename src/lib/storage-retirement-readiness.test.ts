import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import type { WorkoutSession } from '../types';
import { createStorageAdminRuntime } from './storage-admin-runtime';
import type { StorageAdminOwnerTokenCoordinator } from './storage-admin-owner-token';
import { runStorageBootRecovery } from './storage-boot-recovery';
import {
  createHybridStorageRuntime,
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
import { listActivePredecessorSourceOperationIds } from './storage-operation-receipt';
import { planStorageRetention } from './storage-retention';
import { inspectStorageRetentionEvidence } from './storage-retention-evidence';
import {
  inspectStorageRetirementProof,
  proveStorageRetirement,
} from './storage-retirement-proof';
import {
  writeStorageRetirementJournal,
  type StorageRetirementJournal,
} from './storage-retirement-journal';
import {
  confirmStorageRetirementReadiness,
  isStorageRetirementReadinessCapability,
  proveStorageRetirementReadiness,
  proveStorageRetirementReadinessOnce,
  type ProveStorageRetirementReadinessResult,
} from './storage-retirement-readiness';
import {
  type PersistedState,
  type StorageLike,
} from './storage-types';

const KEY = 'gymflow:state:v1';
const SOURCE_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const REPO_ROOT = join(SOURCE_ROOT, '..');
const READINESS_SOURCE = join(SOURCE_ROOT, 'lib', 'storage-retirement-readiness.ts');
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
  const databaseName = `retirement-readiness-${sequence += 1}`;
  let generationSequence = 0;
  const adapter = new IndexedDbWorkoutHistoryStorage({
    factory,
    databaseName,
    generationIdFactory: () => `generation-${generationSequence += 1}`,
    now: () => new Date('2026-08-20T10:00:00.000Z'),
  });
  const hybrid = createHybridStorageRuntime({
    key: KEY,
    storage,
    adapter,
    defaults: state([]),
    now: () => new Date('2026-08-20T10:00:00.000Z'),
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
    now: () => new Date('2026-08-20T12:01:00.000Z'),
    ownerToken: ownerToken('import-b'),
  });
  if (!imported.ok) throw new Error(`import setup falhou: ${imported.reason}`);

  const reset = await commitLogicalStorageResetV2({
    runtime,
    adapter,
    storage,
    key: KEY,
    now: () => new Date('2026-08-20T12:02:00.000Z'),
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

async function createFourGenerationWorld() {
  const world = await createThreeGenerationWorld();
  const reset = await commitLogicalStorageResetV2({
    runtime: world.runtime,
    adapter: world.adapter,
    storage: world.storage,
    key: KEY,
    now: () => new Date('2026-08-20T12:03:00.000Z'),
    ownerToken: ownerToken('reset-z2'),
  });
  if (!reset.ok) throw new Error(`segundo reset setup falhou: ${reset.reason}`);
  return {
    ...world,
    generationZ1: world.generationZ,
    generationZ2: reset.generationId,
  };
}

type ReadinessWorld = Awaited<ReturnType<typeof createThreeGenerationWorld>>;

async function proveCandidate(world: ReadinessWorld, candidateGenerationId: string) {
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

function blockedRecover(reason: string) {
  return async () => ({
    ok: false,
    reason,
    error: 'Mensagem interna que nao pode atravessar o boot.',
    operationId: null,
    generationId: null,
    steps: 0,
    finalAction: 'observe',
    recoveryRequired: true,
    cleanupPending: false,
  }) as never;
}

function expectNoAuthority(result: ProveStorageRetirementReadinessResult): void {
  expect(result.ownerTokenRequired).toBe(true);
  expect(result.executionAuthorized).toBe(false);
  expect(result.deleteAuthorized).toBe(false);
  expect(result.executorReady).toBe(false);
  expect(result.physicalDeleteReady).toBe(false);
  expect(result.writeAuthorized).toBe(false);
  expect(Object.isFrozen(result)).toBe(true);
}

function expectSanitized(result: ProveStorageRetirementReadinessResult, world: ReadinessWorld): void {
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain(world.generationA);
  expect(serialized).not.toContain(world.generationB);
  expect(serialized).not.toContain(world.generationZ);
  expect(serialized).not.toMatch(/generationId|operationId|owner-token|receipt|raw|digest|fingerprint/i);
}

function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function listFiles(root: string, extensions: readonly string[]): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        entry.name === 'node_modules'
        || entry.name === '.next'
        || entry.name.startsWith('.')
      ) {
        continue;
      }
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (extensions.some((extension) => entry.name.endsWith(extension))) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found;
}

function relativeSource(file: string): string {
  return relative(REPO_ROOT, file).replace(/\\/g, '/');
}

describe('correlação de executor readiness', () => {
  it('ciclo completo estável prova readiness sem autorizar execução', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    expect(proved.status).toBe('proved');
    if (proved.status !== 'proved') throw new Error('prova ausente');

    const evidence = await inspectStorageRetentionEvidence({ reader: world.adapter });
    expect(evidence.status).toBe('inspected');
    const boot = await runStorageBootRecovery({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(boot.hydrationAllowed).toBe(true);

    const genSpy = vi.spyOn(world.adapter, 'readHistoryGenerationSnapshot');
    const clearSpy = vi.spyOn(world.adapter, 'clearInactiveGeneration');
    const journalSpy = vi.spyOn(world.adapter, 'writeStorageRetirementJournalRecord');
    const result = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: proved.proof,
    });

    expect(result.status).toBe('readiness-proven');
    expect(result.reason).toBe('readiness-proven');
    expect(isStorageRetirementReadinessCapability(result.capability)).toBe(true);
    expectNoAuthority(result);
    expectSanitized(result, world);
    expect(planStorageRetention(await world.adapter.readStorageAdministrationSnapshot()).delete)
      .toEqual([]);
    expect(GYMFLOW_INDEXEDDB_VERSION).toBe(5);
    expect(genSpy).toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
    expect(journalSpy).not.toHaveBeenCalled();
  });

  it('boot bloqueado com evidence válida permanece bloqueado', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    if (proved.status !== 'proved') throw new Error('prova ausente');
    const evidence = await inspectStorageRetentionEvidence({ reader: world.adapter });
    expect(evidence.status).toBe('inspected');

    for (const reason of [
      'storage-unavailable',
      'operation-conflict',
      'recovery-required',
    ]) {
      const result = await proveStorageRetirementReadiness({
        adapter: world.adapter,
        storage: world.storage,
        key: KEY,
        selectedGenerationIds: [world.generationA],
        proof: proved.proof,
        recover: blockedRecover(reason),
      });
      expect(result.status).toBe('blocked-boot-not-ready');
      expect(result.capability).toBeNull();
      expectNoAuthority(result);
    }
  });

  it('não converte blocked-administration-conflicted em pronto', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    if (proved.status !== 'proved') throw new Error('prova ausente');
    const result = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: proved.proof,
      recover: blockedRecover('administration-conflicted'),
    });
    expect(result.status).toBe('blocked-administration-conflicted');
    expect(result.capability).toBeNull();
    expectNoAuthority(result);
  });

  it('boot válido com evidence inválida bloqueia', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    if (proved.status !== 'proved') throw new Error('prova ausente');
    const boot = await runStorageBootRecovery({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(boot.hydrationAllowed).toBe(true);

    vi.spyOn(world.adapter, 'readHistoryGenerationSnapshot').mockRejectedValue(
      new Error('evidence-fail'),
    );
    const result = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: proved.proof,
    });
    expect(result.status).toBe('blocked-evidence-invalid');
    expect(result.capability).toBeNull();
    expectNoAuthority(result);
  });

  it('snapshot que muda entre evidence e o fechamento bloqueia', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    if (proved.status !== 'proved') throw new Error('prova ausente');

    const originalSnap = world.adapter.readStorageAdministrationSnapshot.bind(world.adapter);
    const originalGen = world.adapter.readHistoryGenerationSnapshot.bind(world.adapter);
    let seenGenerationRead = false;
    let evidenceClosingSnapshotSeen = false;
    vi.spyOn(world.adapter, 'readHistoryGenerationSnapshot').mockImplementation(async (id) => {
      seenGenerationRead = true;
      return originalGen(id);
    });
    vi.spyOn(world.adapter, 'readStorageAdministrationSnapshot').mockImplementation(async () => {
      const snapshot = await originalSnap();
      if (seenGenerationRead && !evidenceClosingSnapshotSeen) {
        evidenceClosingSnapshotSeen = true;
        return snapshot;
      }
      if (evidenceClosingSnapshotSeen) {
        return { ...snapshot, fingerprint: `${snapshot.fingerprint}-changed` };
      }
      return snapshot;
    });

    const result = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: proved.proof,
    });
    expect(result.status).toBe('blocked-snapshot-changed');
    expect(result.capability).toBeNull();
    expectNoAuthority(result);
  });

  it('não aceita evidence antiga só porque as contagens ainda coincidem', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    if (proved.status !== 'proved') throw new Error('prova ausente');
    const staleEvidence = await inspectStorageRetentionEvidence({ reader: world.adapter });
    expect(staleEvidence.status).toBe('inspected');

    const result = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: proved.proof,
      evidence: staleEvidence,
    } as never);
    expect(result.status).toBe('blocked-administration-conflicted');
    expect(result.capability).toBeNull();
  });

  it('predecessor divergente do reservado bloqueia', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    if (proved.status !== 'proved') throw new Error('prova ausente');
    const result = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: proved.proof,
      resolvePredecessor: async (inner) => {
        const resolved = await resolveLogicalRestorePredecessorV2(inner);
        if (resolved.status !== 'available') return resolved;
        return {
          ...resolved,
          target: {
            ...resolved.target,
            targetGenerationId: 'generation-other-PRIVATE_ID',
          },
        };
      },
    });
    expect(result.status).toBe('blocked-predecessor-changed');
    expect(result.capability).toBeNull();
    expectNoAuthority(result);
    expect(JSON.stringify(result)).not.toContain('generation-other-PRIVATE_ID');
  });

  it('seleção diferente da prova bloqueia e não escolhe outra candidata', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    if (proved.status !== 'proved') throw new Error('prova ausente');
    const result = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationB],
      proof: proved.proof,
    });
    expect(result.status).toBe('blocked-selection-changed');
    expect(result.capability).toBeNull();
    expectNoAuthority(result);
  });

  it('seleção mutada no fechamento bloqueia', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    if (proved.status !== 'proved') throw new Error('prova ausente');
    const selected = [world.generationA];
    const originalGen = world.adapter.readHistoryGenerationSnapshot.bind(world.adapter);
    vi.spyOn(world.adapter, 'readHistoryGenerationSnapshot').mockImplementation(async (id) => {
      selected[0] = world.generationB;
      return originalGen(id);
    });
    const result = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: selected,
      proof: proved.proof,
    });
    expect(result.status).toBe('blocked-selection-changed');
    expect(result.capability).toBeNull();
  });

  it('candidata que perde elegibilidade bloqueia na policy', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    if (proved.status !== 'proved') throw new Error('prova ausente');
    const originalSnap = world.adapter.readStorageAdministrationSnapshot.bind(world.adapter);
    const originalGen = world.adapter.readHistoryGenerationSnapshot.bind(world.adapter);
    let seenGenerationRead = false;
    let evidenceClosingSnapshotSeen = false;
    vi.spyOn(world.adapter, 'readHistoryGenerationSnapshot').mockImplementation(async (id) => {
      seenGenerationRead = true;
      return originalGen(id);
    });
    vi.spyOn(world.adapter, 'readStorageAdministrationSnapshot').mockImplementation(async () => {
      const snapshot = await originalSnap();
      if (seenGenerationRead && !evidenceClosingSnapshotSeen) {
        evidenceClosingSnapshotSeen = true;
        return snapshot;
      }
      if (evidenceClosingSnapshotSeen) {
        return {
          ...snapshot,
          generations: snapshot.generations.map((entry) => (
            entry.generationId === world.generationA
              ? { ...entry, isStaged: true }
              : entry
          )),
        };
      }
      return snapshot;
    });
    const result = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: proved.proof,
    });
    expect(result.status).toBe('blocked-policy');
    expect(result.capability).toBeNull();
    expectNoAuthority(result);
  });

  it('proof antiga de outro fingerprint bloqueia', async () => {
    const world = await createThreeGenerationWorld();
    const oldProof = await proveCandidate(world, world.generationA);
    if (oldProof.status !== 'proved') throw new Error('prova ausente');

    const reset = await commitLogicalStorageResetV2({
      runtime: world.runtime,
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      now: () => new Date('2026-08-20T12:04:00.000Z'),
      ownerToken: ownerToken('reset-after-proof'),
    });
    if (!reset.ok) throw new Error(`reset posterior falhou: ${reset.reason}`);

    const result = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: oldProof.proof,
    });
    expect(result.status).toBe('blocked-proof');
    expect(result.capability).toBeNull();
    expectNoAuthority(result);
  });

  it('journal divergente da intenção bloqueia', async () => {
    const world = await createFourGenerationWorld();
    const provedA = await proveCandidate(world, world.generationA);
    const provedB = await proveCandidate(world, world.generationB);
    if (provedA.status !== 'proved' || provedB.status !== 'proved') {
      throw new Error('provas ausentes');
    }
    const written = await writeStorageRetirementJournal({
      lease: ownedLease(),
      proof: provedA.proof,
      adapter: world.adapter,
      now: () => new Date('2026-08-20T12:10:00.000Z'),
    });
    expect(written.status).toBe('recorded');

    const result = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationB],
      proof: provedB.proof,
    });
    expect(result.status).toBe('blocked-journal');
    expect(result.capability).toBeNull();
    expectNoAuthority(result);
  });

  it('journal stale bloqueia e não vira readiness', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    if (proved.status !== 'proved') throw new Error('prova ausente');
    const record = inspectStorageRetirementProof(proved.proof);
    if (record === null) throw new Error('record ausente');
    const stale: StorageRetirementJournal = {
      schemaVersion: 1,
      status: 'recorded',
      candidateGenerationId: record.candidateGenerationId,
      reservedPredecessorGenerationId: record.reservedPredecessorGenerationId,
      currentGenerationId: record.currentGenerationId,
      supersedeOperationIds: [...record.supersedeOperationIds],
      originFingerprint: 'stale-fingerprint-PRIVATE',
      recordedAt: '2026-08-20T12:10:00.000Z',
    };
    await world.adapter.writeStorageRetirementJournalRecord(stale);

    const result = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: proved.proof,
    });
    expect(result.status).toBe('blocked-administration-conflicted');
    expect(result.capability).toBeNull();
    expectNoAuthority(result);
  });

  it('fecha a race do journal com snapshot e journal no mesmo fechamento', async () => {
    const world = await createFourGenerationWorld();
    const provedA = await proveCandidate(world, world.generationA);
    const provedB = await proveCandidate(world, world.generationB);
    if (provedA.status !== 'proved' || provedB.status !== 'proved') {
      throw new Error('provas ausentes');
    }
    const recordB = inspectStorageRetirementProof(provedB.proof);
    if (recordB === null) throw new Error('record ausente');
    const conflictingJournal: StorageRetirementJournal = {
      schemaVersion: 1,
      status: 'recorded',
      candidateGenerationId: recordB.candidateGenerationId,
      reservedPredecessorGenerationId: recordB.reservedPredecessorGenerationId,
      currentGenerationId: recordB.currentGenerationId,
      supersedeOperationIds: [...recordB.supersedeOperationIds],
      originFingerprint: recordB.fingerprint,
      recordedAt: '2026-08-20T12:10:00.000Z',
    };

    const originalJournal = world.adapter.readStorageRetirementJournal.bind(world.adapter);
    let journalReads = 0;
    const journalSpy = vi.spyOn(world.adapter, 'readStorageRetirementJournal')
      .mockImplementation(async () => {
        const raw = await originalJournal();
        journalReads += 1;
        // A implementação antiga lia o journal novamente aqui e só depois
        // fechava com snapshot B. A mutação após essa leitura deixava o
        // resultado stale; o corretivo não faz essa segunda leitura.
        if (journalReads === 2) {
          await world.adapter.writeStorageRetirementJournalRecord(conflictingJournal);
        }
        return raw;
      });
    const originalAtomic = world.adapter
      .readStorageAdministrationSnapshotWithRetirementJournal.bind(world.adapter);
    const atomicSpy = vi.spyOn(
      world.adapter,
      'readStorageAdministrationSnapshotWithRetirementJournal',
    ).mockImplementation(async () => {
      // O journal muda depois da leitura de boot, mas antes do fechamento.
      // Como esta escrita acontece antes da transação final, o par retornado
      // deve observar a divergência e bloquear fail-closed.
      if (journalReads === 1) {
        await world.adapter.writeStorageRetirementJournalRecord(conflictingJournal);
      }
      return originalAtomic();
    });

    const result = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: provedA.proof,
    });
    expect(result.status).toBe('blocked-journal');
    expect(result.capability).toBeNull();
    expectNoAuthority(result);
    expect(journalSpy).toHaveBeenCalledTimes(1);
    expect(atomicSpy).toHaveBeenCalledTimes(1);
  });

  it('bloqueia journal divergente mutado enquanto o reader final ainda calcula markers', async () => {
    const world = await createFourGenerationWorld();
    const provedA = await proveCandidate(world, world.generationA);
    const provedB = await proveCandidate(world, world.generationB);
    if (provedA.status !== 'proved' || provedB.status !== 'proved') {
      throw new Error('provas ausentes');
    }
    const recordB = inspectStorageRetirementProof(provedB.proof);
    if (recordB === null) throw new Error('record ausente');
    const conflictingJournal: StorageRetirementJournal = {
      schemaVersion: 1,
      status: 'recorded',
      candidateGenerationId: recordB.candidateGenerationId,
      reservedPredecessorGenerationId: recordB.reservedPredecessorGenerationId,
      currentGenerationId: recordB.currentGenerationId,
      supersedeOperationIds: [...recordB.supersedeOperationIds],
      originFingerprint: recordB.fingerprint,
      recordedAt: '2026-08-20T12:10:00.000Z',
    };

    const adapterWithCrypto = world.adapter as unknown as {
      subtleCrypto: SubtleCrypto | null | undefined;
    };
    const originalCrypto = adapterWithCrypto.subtleCrypto;
    if (!originalCrypto) throw new Error('crypto ausente');
    let finalReaderStarted = false;
    let journalMutation: Promise<void> | null = null;
    adapterWithCrypto.subtleCrypto = {
      ...originalCrypto,
      digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
        const digest = await originalCrypto.digest(algorithm, data);
        if (finalReaderStarted && journalMutation === null) {
          journalMutation = world.adapter.writeStorageRetirementJournalRecord(conflictingJournal);
          await journalMutation;
        }
        return digest;
      },
    } as SubtleCrypto;

    const originalAtomic = world.adapter
      .readStorageAdministrationSnapshotWithRetirementJournal.bind(world.adapter);
    const atomicSpy = vi.spyOn(
      world.adapter,
      'readStorageAdministrationSnapshotWithRetirementJournal',
    ).mockImplementation(async () => {
      // A implementação vulnerável só chegava ao digest depois do commit da
      // transação final; a mutação então ficava entre o par lido e o retorno.
      finalReaderStarted = true;
      return originalAtomic();
    });

    const result = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: provedA.proof,
    });
    expect(atomicSpy).toHaveBeenCalledTimes(1);
    expect(journalMutation).not.toBeNull();
    expect(result.status).toBe('blocked-journal');
    expect(result.capability).toBeNull();
    expectNoAuthority(result);
  });

  it('capability forjada, clonada ou JSON não prova readiness', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    if (proved.status !== 'proved') throw new Error('prova ausente');
    const result = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: proved.proof,
    });
    expect(result.status).toBe('readiness-proven');
    if (result.status !== 'readiness-proven') throw new Error('capability ausente');

    const forgedLiteral = {
      __storageRetirementReadinessBrand: 'StorageRetirementReadiness',
    };
    const cloned = { ...result.capability };
    const assigned = Object.assign({}, result.capability);
    const parsed = JSON.parse(JSON.stringify(result.capability)) as unknown;
    const created = Object.create(result.capability) as unknown;

    expect(isStorageRetirementReadinessCapability(forgedLiteral)).toBe(false);
    expect(isStorageRetirementReadinessCapability(cloned)).toBe(false);
    expect(isStorageRetirementReadinessCapability(assigned)).toBe(false);
    expect(isStorageRetirementReadinessCapability(parsed)).toBe(false);
    expect(isStorageRetirementReadinessCapability(created)).toBe(false);
    expect(confirmStorageRetirementReadiness(forgedLiteral)).toBe(false);
    expect(confirmStorageRetirementReadiness(result.capability)).toBe(true);
  });

  it('idade, tamanho e ordem de IDs não mudam a identidade da readiness', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    if (proved.status !== 'proved') throw new Error('prova ausente');
    const older = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: proved.proof,
      createdAt: '2000-01-01T00:00:00.000Z',
      candidateCreatedAt: '1999-01-01T00:00:00.000Z',
      sizeBytes: 1,
      candidateSizeBytes: 8,
      enumerationOrder: [world.generationZ, world.generationB, world.generationA],
    });
    const newer = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: proved.proof,
      createdAt: '2099-12-31T23:59:59.000Z',
      candidateCreatedAt: '2099-12-31T23:59:59.000Z',
      sizeBytes: 9_999_999,
      candidateSizeBytes: 88_888_888,
      enumerationOrder: [world.generationA, world.generationB, world.generationZ],
    });
    expect(older.status).toBe('readiness-proven');
    expect(newer.status).toBe(older.status);
    expect(newer.reason).toBe(older.reason);
    expect(newer.executionAuthorized).toBe(false);
    expect(newer.deleteAuthorized).toBe(false);
    if (older.status !== 'readiness-proven' || newer.status !== 'readiness-proven') {
      throw new Error('capability ausente');
    }
    expect(older.capability).not.toBe(newer.capability);
    expect(isStorageRetirementReadinessCapability(older.capability)).toBe(true);
    expect(isStorageRetirementReadinessCapability(newer.capability)).toBe(true);
  });

  it('reload exige nova readiness e não reutiliza capability', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    if (proved.status !== 'proved') throw new Error('prova ausente');
    const first = await proveStorageRetirementReadinessOnce({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: proved.proof,
    });
    const second = await proveStorageRetirementReadinessOnce({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: proved.proof,
    });
    expect(first.status).toBe('readiness-proven');
    expect(second.status).toBe('readiness-proven');
    if (first.status !== 'readiness-proven' || second.status !== 'readiness-proven') {
      throw new Error('capability ausente');
    }
    expect(first.capability).not.toBe(second.capability);
    expect(isStorageRetirementReadinessCapability(first.capability)).toBe(true);
    expect(isStorageRetirementReadinessCapability(second.capability)).toBe(true);
    expect(isStorageRetirementReadinessCapability(
      JSON.parse(JSON.stringify(first.capability)),
    )).toBe(false);
  });

  it('Strict Mode reutiliza o mesmo ciclo; seleções concorrentes não se misturam', async () => {
    const world = await createFourGenerationWorld();
    const provedA = await proveCandidate(world, world.generationA);
    const provedB = await proveCandidate(world, world.generationB);
    if (provedA.status !== 'proved' || provedB.status !== 'proved') {
      throw new Error('provas ausentes');
    }

    const inputA = {
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: provedA.proof,
    };
    const [left, right] = await Promise.all([
      proveStorageRetirementReadinessOnce(inputA),
      proveStorageRetirementReadinessOnce(inputA),
    ]);
    expect(left.status).toBe('readiness-proven');
    expect(right.status).toBe('readiness-proven');
    if (left.status !== 'readiness-proven' || right.status !== 'readiness-proven') {
      throw new Error('capability ausente');
    }
    expect(left.capability).toBe(right.capability);

    const mixed = await Promise.all([
      proveStorageRetirementReadinessOnce({
        adapter: world.adapter,
        storage: world.storage,
        key: KEY,
        selectedGenerationIds: [world.generationA],
        proof: provedA.proof,
      }),
      proveStorageRetirementReadinessOnce({
        adapter: world.adapter,
        storage: world.storage,
        key: KEY,
        selectedGenerationIds: [world.generationB],
        proof: provedB.proof,
      }),
    ]);
    expect(mixed.map((entry) => entry.status).sort()).toEqual([
      'readiness-proven',
      'readiness-proven',
    ]);
    if (mixed[0].status !== 'readiness-proven' || mixed[1].status !== 'readiness-proven') {
      throw new Error('capabilities ausentes');
    }
    expect(mixed[0].capability).not.toBe(mixed[1].capability);
    expectNoAuthority(mixed[0]);
    expectNoAuthority(mixed[1]);
  });

  it('proof válida e clone forjado nunca compartilham readiness', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    if (proved.status !== 'proved') throw new Error('prova ausente');
    const validInput = {
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: proved.proof,
    };
    const forgedClone = { ...(proved.proof as object) };
    const [valid, forged] = await Promise.all([
      proveStorageRetirementReadinessOnce(validInput),
      proveStorageRetirementReadinessOnce({ ...validInput, proof: forgedClone }),
    ]);

    expect(valid.status).toBe('readiness-proven');
    expect(forged.status).toBe('blocked-proof');
    expect(valid).not.toBe(forged);
    expectNoAuthority(valid);
    expectNoAuthority(forged);
  });

  it('proofs diferentes para a mesma candidata não compartilham readiness', async () => {
    const world = await createThreeGenerationWorld();
    const firstProof = await proveCandidate(world, world.generationA);
    const secondProof = await proveCandidate(world, world.generationA);
    if (firstProof.status !== 'proved' || secondProof.status !== 'proved') {
      throw new Error('provas ausentes');
    }
    expect(firstProof.proof).not.toBe(secondProof.proof);

    const [first, second] = await Promise.all([
      proveStorageRetirementReadinessOnce({
        adapter: world.adapter,
        storage: world.storage,
        key: KEY,
        selectedGenerationIds: [world.generationA],
        proof: firstProof.proof,
      }),
      proveStorageRetirementReadinessOnce({
        adapter: world.adapter,
        storage: world.storage,
        key: KEY,
        selectedGenerationIds: [world.generationA],
        proof: secondProof.proof,
      }),
    ]);

    expect(first.status).toBe('readiness-proven');
    expect(second.status).toBe('readiness-proven');
    if (first.status !== 'readiness-proven' || second.status !== 'readiness-proven') {
      throw new Error('capabilities ausentes');
    }
    expect(first.capability).not.toBe(second.capability);
  });

  it('mesma proof com seleção diferente nunca compartilha readiness', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    if (proved.status !== 'proved') throw new Error('prova ausente');
    const [valid, wrongSelection] = await Promise.all([
      proveStorageRetirementReadinessOnce({
        adapter: world.adapter,
        storage: world.storage,
        key: KEY,
        selectedGenerationIds: [world.generationA],
        proof: proved.proof,
      }),
      proveStorageRetirementReadinessOnce({
        adapter: world.adapter,
        storage: world.storage,
        key: KEY,
        selectedGenerationIds: [world.generationB],
        proof: proved.proof,
      }),
    ]);

    expect(valid.status).toBe('readiness-proven');
    expect(wrongSelection.status).toBe('blocked-selection-changed');
    expect(valid).not.toBe(wrongSelection);
  });

  it('journal recorded compatível permanece readiness-proven', async () => {
    const world = await createThreeGenerationWorld();
    const proved = await proveCandidate(world, world.generationA);
    if (proved.status !== 'proved') throw new Error('prova ausente');
    const written = await writeStorageRetirementJournal({
      lease: ownedLease(),
      proof: proved.proof,
      adapter: world.adapter,
      now: () => new Date('2026-08-20T12:10:00.000Z'),
    });
    expect(written.status).toBe('recorded');
    const result = await proveStorageRetirementReadiness({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
      selectedGenerationIds: [world.generationA],
      proof: proved.proof,
    });
    expect(result.status).toBe('readiness-proven');
    expectNoAuthority(result);
    expect(planStorageRetention(await world.adapter.readStorageAdministrationSnapshot()).delete)
      .toEqual([]);
  });
});

describe('guards da fundação de executor readiness', () => {
  it('não introduz delete físico nem persiste capability', () => {
    const source = codeOf(READINESS_SOURCE);
    const forbidden = [
      /\bdeleteDatabase\b/,
      /\bdeleteGeneration\b/,
      /\bclearInactiveGeneration\b/,
      /\bobjectStore\.delete\b/,
      /\bobjectStore\.clear\b/,
      /\.clear\s*\(/,
      /\bwriteStorageRetirementJournal\b/,
      /\bcompareAndPutStorageRetirementJournal\b/,
      /\bsetItem\b/,
      /\bremoveItem\b/,
      /\bdeleteDatabase\b/,
    ];
    for (const pattern of forbidden) expect(source).not.toMatch(pattern);
    expect(source).toContain('executionAuthorized: false');
    expect(source).toContain('deleteAuthorized: false');
    expect(source).toContain('executorReady: false');
    expect(source).toContain('physicalDeleteReady: false');
    expect(source).toContain('runStorageBootRecovery');
    expect(source).toContain('inspectStorageRetentionEvidence');
    expect(source).not.toContain('readonly evidence');
    expect(source).not.toContain('readonly boot');
  });

  it('não possui call site de UI, Provider, executor ou delete', () => {
    const callers = listFiles(SOURCE_ROOT, ['.ts', '.tsx'])
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => (
        /\bproveStorageRetirementReadiness\s*\(/.test(codeOf(file))
        || /\bproveStorageRetirementReadinessOnce\s*\(/.test(codeOf(file))
      ))
      .map(relativeSource)
      .sort();
    expect(callers).toEqual(['src/lib/storage-retirement-readiness.ts']);
  });

  it('IndexedDB permanece v5 e o planner continua sem delete', async () => {
    const world = await createThreeGenerationWorld();
    expect(GYMFLOW_INDEXEDDB_VERSION).toBe(5);
    expect(planStorageRetention(await world.adapter.readStorageAdministrationSnapshot()).delete)
      .toEqual([]);
  });
});
