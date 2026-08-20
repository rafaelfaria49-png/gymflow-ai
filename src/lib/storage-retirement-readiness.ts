import type { AdministrableWorkoutHistoryStorageAdapter } from './storage-adapter';
import type { StorageAdministrationSnapshotRead } from './storage-adapter';
import type { StorageAdministrationSnapshotWithRetirementJournal } from './storage-adapter';
import type { StorageAdminOwnerTokenCoordinator } from './storage-admin-owner-token';
import type { StorageAdminRuntime } from './storage-admin-runtime';
import {
  runStorageBootRecovery,
  type StorageBootRecoveryInput,
  type StorageBootRecoveryOutcome,
} from './storage-boot-recovery';
import { resolveLogicalRestorePredecessorV2 } from './storage-logical-restore-resolve';
import type { LogicalRestorePredecessorResolution } from './storage-logical-restore-resolve';
import { planStorageRetention } from './storage-retention';
import { inspectStorageRetentionEvidence } from './storage-retention-evidence';
import { evaluateStorageRetentionPolicy } from './storage-retention-policy';
import {
  recoverStorageRetirementJournal,
  type StorageRetirementJournal,
} from './storage-retirement-journal';
import {
  inspectStorageRetirementProof,
  isStorageRetirementProof,
  proveStorageRetirement,
  type StorageRetirementProofRecord,
} from './storage-retirement-proof';
import type { StorageLike } from './storage-types';

// GOAL-17B-002E-E7A6 — correlação read-only de executor readiness.
//
// Esta camada observa um único ciclo administrativo vivo: boot seguro,
// evidence física, snapshot A/B, predecessor, seleção explícita, política
// manual, proof opaca e journal. Ela não escolhe candidata, não persiste a
// capability, não escreve journal e não autoriza execução ou delete.
// readiness-proven prova coerência. Não concede autoridade.

export type StorageRetirementReadinessStatus =
  | 'readiness-proven'
  | 'blocked-boot-not-ready'
  | 'blocked-evidence-invalid'
  | 'blocked-snapshot-changed'
  | 'blocked-selection-changed'
  | 'blocked-policy'
  | 'blocked-proof'
  | 'blocked-journal'
  | 'blocked-predecessor-changed'
  | 'blocked-administration-conflicted';

export type StorageRetirementReadinessReason =
  | 'readiness-proven'
  | 'boot-not-ready'
  | 'evidence-invalid'
  | 'snapshot-changed'
  | 'selection-changed'
  | 'policy-blocked'
  | 'proof-invalid'
  | 'journal-invalid'
  | 'predecessor-changed'
  | 'administration-conflicted';

export type StorageRetirementReadinessCapability = {
  readonly __storageRetirementReadinessBrand: 'StorageRetirementReadiness';
};

interface StorageRetirementReadinessBase {
  readonly ownerTokenRequired: true;
  readonly executionAuthorized: false;
  readonly deleteAuthorized: false;
  readonly executorReady: false;
  readonly physicalDeleteReady: false;
  readonly writeAuthorized: false;
}

export interface StorageRetirementReadinessProven extends StorageRetirementReadinessBase {
  readonly status: 'readiness-proven';
  readonly reason: 'readiness-proven';
  readonly capability: StorageRetirementReadinessCapability;
}

export interface StorageRetirementReadinessBlocked extends StorageRetirementReadinessBase {
  readonly status: Exclude<StorageRetirementReadinessStatus, 'readiness-proven'>;
  readonly reason: Exclude<StorageRetirementReadinessReason, 'readiness-proven'>;
  readonly capability: null;
}

export type ProveStorageRetirementReadinessResult =
  | StorageRetirementReadinessProven
  | StorageRetirementReadinessBlocked;

export interface ProveStorageRetirementReadinessInput {
  readonly adapter: AdministrableWorkoutHistoryStorageAdapter;
  readonly storage: StorageLike;
  readonly key: string;
  readonly selectedGenerationIds: unknown;
  readonly proof: unknown;
  readonly runtime?: StorageAdminRuntime;
  readonly ownerToken?: StorageAdminOwnerTokenCoordinator;
  readonly recover?: StorageBootRecoveryInput['recover'];
  readonly resolvePredecessor?: (
    input: Parameters<typeof resolveLogicalRestorePredecessorV2>[0],
  ) => Promise<LogicalRestorePredecessorResolution>;
  readonly createdAt?: unknown;
  readonly sizeBytes?: unknown;
  readonly enumerationOrder?: unknown;
  readonly candidateCreatedAt?: unknown;
  readonly candidateSizeBytes?: unknown;
}

const REQUIRED_KEYS = [
  'adapter',
  'storage',
  'key',
  'selectedGenerationIds',
  'proof',
] as const;

const OPTIONAL_KEYS = [
  'runtime',
  'ownerToken',
  'recover',
  'resolvePredecessor',
  'createdAt',
  'sizeBytes',
  'enumerationOrder',
  'candidateCreatedAt',
  'candidateSizeBytes',
] as const;

const ALLOWED_KEYS = new Set<string>([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);

const READY_BOOT_STATUSES = new Set([
  'ready-no-operation',
  'ready-after-settled',
  'ready-after-reverted',
]);

const AUTHENTIC_CAPABILITIES = new WeakSet<object>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function uniqueNonEmptyStrings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  for (const entry of value) {
    if (!isNonEmptyString(entry)) return null;
    ids.push(entry);
  }
  if (new Set(ids).size !== ids.length) return null;
  return ids;
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function freezeBlocked(
  status: Exclude<StorageRetirementReadinessStatus, 'readiness-proven'>,
  reason: Exclude<StorageRetirementReadinessReason, 'readiness-proven'>,
): StorageRetirementReadinessBlocked {
  return Object.freeze({
    status,
    reason,
    capability: null,
    ownerTokenRequired: true as const,
    executionAuthorized: false as const,
    deleteAuthorized: false as const,
    executorReady: false as const,
    physicalDeleteReady: false as const,
    writeAuthorized: false as const,
  });
}

function issueCapability(): StorageRetirementReadinessCapability {
  const capability = Object.freeze({}) as StorageRetirementReadinessCapability;
  AUTHENTIC_CAPABILITIES.add(capability);
  return capability;
}

function freezeProven(
  capability: StorageRetirementReadinessCapability,
): StorageRetirementReadinessProven {
  return Object.freeze({
    status: 'readiness-proven' as const,
    reason: 'readiness-proven' as const,
    capability,
    ownerTokenRequired: true as const,
    executionAuthorized: false as const,
    deleteAuthorized: false as const,
    executorReady: false as const,
    physicalDeleteReady: false as const,
    writeAuthorized: false as const,
  });
}

export function isStorageRetirementReadinessCapability(
  value: unknown,
): value is StorageRetirementReadinessCapability {
  return typeof value === 'object' && value !== null && AUTHENTIC_CAPABILITIES.has(value);
}

function hasAtomicRetirementJournalReader(
  adapter: AdministrableWorkoutHistoryStorageAdapter,
): adapter is AdministrableWorkoutHistoryStorageAdapter & {
  readStorageAdministrationSnapshotWithRetirementJournal(): Promise<
    StorageAdministrationSnapshotWithRetirementJournal
  >;
} {
  return typeof (adapter as {
    readStorageAdministrationSnapshotWithRetirementJournal?: unknown;
  }).readStorageAdministrationSnapshotWithRetirementJournal
    === 'function';
}

function isSuccessfulBoot(boot: StorageBootRecoveryOutcome): boolean {
  return READY_BOOT_STATUSES.has(boot.status)
    && boot.hydrationAllowed === true
    && boot.cleanupPending === false;
}

function bootBlock(
  boot: StorageBootRecoveryOutcome,
): StorageRetirementReadinessBlocked {
  if (boot.status === 'blocked-administration-conflicted') {
    return freezeBlocked('blocked-administration-conflicted', 'administration-conflicted');
  }
  return freezeBlocked('blocked-boot-not-ready', 'boot-not-ready');
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function liveProtection(snapshot: StorageAdministrationSnapshotRead): {
  stagedGenerationIds: string[];
  recoveryGenerationIds: string[];
  pendingCompletionGenerationIds: string[];
  operationProtectedGenerationIds: string[];
  migrationGenerationId: string | null;
} {
  const stagedGenerationIds = uniqueIds(
    snapshot.generations.filter((entry) => entry.isStaged).map((entry) => entry.generationId),
  );
  const operationProtectedGenerationIds: string[] = [];
  const recoveryGenerationIds: string[] = [];
  for (const receipt of snapshot.unsettledOperations) {
    const referenced = [
      receipt.previousGenerationId,
      receipt.stagedGenerationId,
      receipt.kind === 'restore' ? receipt.targetGenerationId : null,
    ];
    for (const generationId of referenced) {
      if (!isNonEmptyString(generationId)) continue;
      operationProtectedGenerationIds.push(generationId);
      recoveryGenerationIds.push(generationId);
    }
  }
  return {
    stagedGenerationIds,
    recoveryGenerationIds: uniqueIds(recoveryGenerationIds),
    pendingCompletionGenerationIds: uniqueIds(
      snapshot.pendingCompletionReceipts.map((entry) => entry.generationId),
    ),
    operationProtectedGenerationIds: uniqueIds(operationProtectedGenerationIds),
    migrationGenerationId: snapshot.migrationGenerationId,
  };
}

function associatedCounts(
  snapshot: StorageAdministrationSnapshotRead,
  candidateGenerationId: string,
): { associatedSessionCount: number; associatedDataCount: number } {
  const summary = snapshot.generations.find(
    (entry) => entry.generationId === candidateGenerationId,
  );
  const associatedSessionCount = summary?.recordCount ?? 0;
  return {
    associatedSessionCount,
    associatedDataCount: associatedSessionCount,
  };
}

function predecessorIdOf(resolved: LogicalRestorePredecessorResolution): string | null {
  return resolved.status === 'available' ? resolved.target.targetGenerationId : null;
}

function predecessorResolutionOf(
  resolved: LogicalRestorePredecessorResolution,
): 'proved' | 'ambiguous' | 'unavailable' {
  if (resolved.status === 'available') return 'proved';
  if (resolved.status === 'unavailable') return 'unavailable';
  return 'ambiguous';
}

function policyStillEligible(
  snapshot: StorageAdministrationSnapshotRead,
  selectedGenerationIds: readonly string[],
  resolved: LogicalRestorePredecessorResolution,
  input: ProveStorageRetirementReadinessInput,
): boolean {
  const currentGenerationId = snapshot.metadata.activeGeneration;
  const protection = liveProtection(snapshot);
  const candidate = selectedGenerationIds[0];
  const counts = associatedCounts(snapshot, candidate);
  const result = evaluateStorageRetentionPolicy({
    mode: 'manual',
    selectedGenerationIds: [...selectedGenerationIds],
    currentGenerationId,
    immediatePredecessorGenerationId: predecessorIdOf(resolved),
    predecessorResolution: predecessorResolutionOf(resolved),
    protectedGenerationIds: [],
    activeGenerationId: snapshot.activeGenerationId,
    migrationGenerationId: protection.migrationGenerationId,
    stagedGenerationIds: protection.stagedGenerationIds,
    recoveryGenerationIds: protection.recoveryGenerationIds,
    pendingCompletionGenerationIds: protection.pendingCompletionGenerationIds,
    operationProtectedGenerationIds: protection.operationProtectedGenerationIds,
    associatedSessionCount: counts.associatedSessionCount,
    associatedDataCount: counts.associatedDataCount,
    createdAt: input.createdAt,
    sizeBytes: input.sizeBytes,
    enumerationOrder: input.enumerationOrder,
    candidateCreatedAt: input.candidateCreatedAt,
    candidateSizeBytes: input.candidateSizeBytes,
  });
  return result.status === 'candidate-eligible'
    && result.executionAuthorized === false
    && result.deleteAuthorized === false;
}

function journalMatchesIntention(
  journal: StorageRetirementJournal,
  proofRecord: StorageRetirementProofRecord,
  fingerprint: string,
): boolean {
  return journal.candidateGenerationId === proofRecord.candidateGenerationId
    && journal.reservedPredecessorGenerationId === proofRecord.reservedPredecessorGenerationId
    && journal.currentGenerationId === proofRecord.currentGenerationId
    && journal.originFingerprint === fingerprint
    && journal.originFingerprint === proofRecord.fingerprint
    && sameStringList(journal.supersedeOperationIds, proofRecord.supersedeOperationIds);
}

async function readFinalSnapshotAndJournal(
  adapter: AdministrableWorkoutHistoryStorageAdapter,
): Promise<{
  ok: true;
  snapshot: StorageAdministrationSnapshotRead;
  retirementJournal: unknown;
} | { ok: false }> {
  // Sem um retrato único, não há como provar que snapshot e journal pertencem
  // ao mesmo fechamento. Adapters antigos bloqueiam, em vez de degradar para
  // duas leituras independentes.
  if (!hasAtomicRetirementJournalReader(adapter)) return { ok: false };
  try {
    const result = await adapter.readStorageAdministrationSnapshotWithRetirementJournal();
    if (!isRecord(result) || !isRecord(result.snapshot)) return { ok: false };
    return {
      ok: true,
      snapshot: result.snapshot,
      retirementJournal: result.retirementJournal,
    };
  } catch {
    return { ok: false };
  }
}

function classifyJournal(
  raw: unknown,
  fingerprint: string,
  proofRecord: StorageRetirementProofRecord,
): StorageRetirementReadinessBlocked | null {
  const recovered = recoverStorageRetirementJournal(raw, fingerprint);
  if (recovered.status === 'absent') return null;
  if (recovered.status === 'recorded' && recovered.journal !== null) {
    if (journalMatchesIntention(recovered.journal, proofRecord, fingerprint)) return null;
    return freezeBlocked('blocked-journal', 'journal-invalid');
  }
  if (recovered.status === 'blocked-fingerprint-mismatch') {
    return freezeBlocked('blocked-journal', 'journal-invalid');
  }
  return freezeBlocked('blocked-administration-conflicted', 'administration-conflicted');
}

/**
 * Correlação read-only de um ciclo administrativo. Não aceita boot/evidence
 * pré-computados de outro ciclo. A capability emitida não é persistível e
 * nunca autoriza executor ou delete.
 */
export async function proveStorageRetirementReadiness(
  input: ProveStorageRetirementReadinessInput,
): Promise<ProveStorageRetirementReadinessResult> {
  try {
    if (!isRecord(input)) {
      return freezeBlocked('blocked-administration-conflicted', 'administration-conflicted');
    }
    const keys = Object.keys(input);
    if (keys.some((key) => !ALLOWED_KEYS.has(key))) {
      return freezeBlocked('blocked-administration-conflicted', 'administration-conflicted');
    }
    if (!REQUIRED_KEYS.every((key) => Object.prototype.hasOwnProperty.call(input, key))) {
      return freezeBlocked('blocked-administration-conflicted', 'administration-conflicted');
    }
    if (!isNonEmptyString(input.key)) {
      return freezeBlocked('blocked-administration-conflicted', 'administration-conflicted');
    }

    const selectedAtOpen = uniqueNonEmptyStrings(input.selectedGenerationIds);
    const proofRecord = inspectStorageRetirementProof(input.proof);
    if (!isStorageRetirementProof(input.proof) || proofRecord === null) {
      return freezeBlocked('blocked-proof', 'proof-invalid');
    }
    if (selectedAtOpen === null) {
      return freezeBlocked('blocked-policy', 'policy-blocked');
    }
    if (
      selectedAtOpen.length !== 1
      || selectedAtOpen[0] !== proofRecord.candidateGenerationId
    ) {
      return freezeBlocked('blocked-selection-changed', 'selection-changed');
    }

    const boot = await runStorageBootRecovery({
      adapter: input.adapter,
      storage: input.storage,
      key: input.key,
      runtime: input.runtime,
      ownerToken: input.ownerToken,
      recover: input.recover,
    });
    if (!isSuccessfulBoot(boot)) return bootBlock(boot);

    const snapshotA = await input.adapter.readStorageAdministrationSnapshot().catch(() => null);
    if (snapshotA === null || !isNonEmptyString(snapshotA.fingerprint)) {
      return freezeBlocked('blocked-administration-conflicted', 'administration-conflicted');
    }
    if (snapshotA.fingerprint !== proofRecord.fingerprint) {
      return freezeBlocked('blocked-proof', 'proof-invalid');
    }
    if (
      snapshotA.metadata.activeGeneration !== proofRecord.currentGenerationId
      || snapshotA.activeGenerationId !== proofRecord.currentGenerationId
    ) {
      return freezeBlocked('blocked-snapshot-changed', 'snapshot-changed');
    }

    const evidence = await inspectStorageRetentionEvidence({ reader: input.adapter });
    if (evidence.status !== 'inspected' || evidence.reason !== 'evidence-collected') {
      return freezeBlocked('blocked-evidence-invalid', 'evidence-invalid');
    }

    const snapshotAfterEvidence = await input.adapter.readStorageAdministrationSnapshot()
      .catch(() => null);
    if (
      snapshotAfterEvidence === null
      || snapshotAfterEvidence.fingerprint !== snapshotA.fingerprint
    ) {
      return freezeBlocked('blocked-snapshot-changed', 'snapshot-changed');
    }

    const resolvePredecessor = input.resolvePredecessor ?? resolveLogicalRestorePredecessorV2;
    const predecessor = await resolvePredecessor({
      adapter: input.adapter,
      storage: input.storage,
      key: input.key,
    });
    if (predecessor.status === 'error' && predecessor.reason === 'snapshot-changed') {
      return freezeBlocked('blocked-snapshot-changed', 'snapshot-changed');
    }
    if (
      predecessor.status !== 'available'
      || predecessor.target.targetGenerationId !== proofRecord.reservedPredecessorGenerationId
      || predecessor.target.currentGenerationId !== proofRecord.currentGenerationId
    ) {
      return freezeBlocked('blocked-predecessor-changed', 'predecessor-changed');
    }

    if (!policyStillEligible(snapshotAfterEvidence, selectedAtOpen, predecessor, input)) {
      return freezeBlocked('blocked-policy', 'policy-blocked');
    }

    const liveProof = await proveStorageRetirement({
      adapter: input.adapter,
      storage: input.storage,
      key: input.key,
      candidateGenerationId: proofRecord.candidateGenerationId,
      reservedPredecessorGenerationId: proofRecord.reservedPredecessorGenerationId,
      supersedeOperationIds: [...proofRecord.supersedeOperationIds],
    });
    const liveRecord = inspectStorageRetirementProof(liveProof.proof);
    if (
      liveProof.status !== 'proved'
      || liveRecord === null
      || liveRecord.fingerprint !== snapshotA.fingerprint
      || liveRecord.candidateGenerationId !== proofRecord.candidateGenerationId
      || liveRecord.reservedPredecessorGenerationId !== proofRecord.reservedPredecessorGenerationId
      || liveRecord.currentGenerationId !== proofRecord.currentGenerationId
      || !sameStringList(liveRecord.supersedeOperationIds, proofRecord.supersedeOperationIds)
    ) {
      return freezeBlocked('blocked-proof', 'proof-invalid');
    }

    const selectedAtClose = uniqueNonEmptyStrings(input.selectedGenerationIds);
    if (
      selectedAtClose === null
      || !sameStringList(selectedAtClose, selectedAtOpen)
      || selectedAtClose[0] !== proofRecord.candidateGenerationId
    ) {
      return freezeBlocked('blocked-selection-changed', 'selection-changed');
    }

    const predecessorAtClose = await resolvePredecessor({
      adapter: input.adapter,
      storage: input.storage,
      key: input.key,
    });

    // Último await do ciclo. A partir daqui só existem validações síncronas e
    // a emissão síncrona da capability. Snapshot e journal são do mesmo
    // readonly transaction, portanto qualquer divergência fecha fail-closed.
    const finalRead = await readFinalSnapshotAndJournal(input.adapter);
    if (!finalRead.ok) {
      return freezeBlocked('blocked-administration-conflicted', 'administration-conflicted');
    }
    const snapshotB = finalRead.snapshot;
    if (snapshotB.fingerprint !== snapshotA.fingerprint) {
      return freezeBlocked('blocked-snapshot-changed', 'snapshot-changed');
    }
    if (
      snapshotB.metadata.activeGeneration !== proofRecord.currentGenerationId
      || snapshotB.activeGenerationId !== proofRecord.currentGenerationId
    ) {
      return freezeBlocked('blocked-snapshot-changed', 'snapshot-changed');
    }

    if (
      predecessorAtClose.status !== 'available'
      || predecessorAtClose.target.targetGenerationId !== proofRecord.reservedPredecessorGenerationId
      || predecessorAtClose.target.currentGenerationId !== proofRecord.currentGenerationId
    ) {
      return freezeBlocked('blocked-predecessor-changed', 'predecessor-changed');
    }

    const journalBlock = classifyJournal(
      finalRead.retirementJournal,
      snapshotB.fingerprint,
      proofRecord,
    );
    if (journalBlock !== null) return journalBlock;

    if (!policyStillEligible(snapshotB, selectedAtClose, predecessorAtClose, input)) {
      return freezeBlocked('blocked-policy', 'policy-blocked');
    }

    const plan = planStorageRetention(snapshotB);
    if (plan.delete.length !== 0) {
      return freezeBlocked('blocked-administration-conflicted', 'administration-conflicted');
    }

    return freezeProven(issueCapability());
  } catch {
    return freezeBlocked('blocked-administration-conflicted', 'administration-conflicted');
  }
}

const readinessLocks = new WeakMap<object, Map<string, {
  operation: Promise<ProveStorageRetirementReadinessResult>;
}>>();
const intentObjectIds = new WeakMap<object, number>();
let nextIntentObjectId = 1;

function intentIdentity(value: unknown): string {
  if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
    const objectValue = value as object;
    let id = intentObjectIds.get(objectValue);
    if (id === undefined) {
      id = nextIntentObjectId;
      nextIntentObjectId += 1;
      intentObjectIds.set(objectValue, id);
    }
    return `object:${id}`;
  }
  return `${typeof value}:${String(value)}`;
}

function readinessIntentKey(input: ProveStorageRetirementReadinessInput): string {
  const selected = uniqueNonEmptyStrings(input.selectedGenerationIds);
  return JSON.stringify([
    input.key,
    selected === null ? `invalid:${intentIdentity(input.selectedGenerationIds)}` : selected,
    // Proofs are opaque capabilities: object identity is part of the intent.
    // This prevents a forged clone from joining a valid proof's Promise.
    intentIdentity(input.proof),
    intentIdentity(input.adapter),
    intentIdentity(input.runtime),
    intentIdentity(input.ownerToken),
    intentIdentity(input.recover),
    intentIdentity(input.resolvePredecessor),
    intentIdentity(input.createdAt),
    intentIdentity(input.sizeBytes),
    intentIdentity(input.enumerationOrder),
    intentIdentity(input.candidateCreatedAt),
    intentIdentity(input.candidateSizeBytes),
  ]);
}

/**
 * Compartilha somente intenções equivalentes. A proof opaca, a seleção, o
 * adapter e os demais parâmetros que alteram o ciclo fazem parte da chave;
 * portanto proofs diferentes, clones forjados e callbacks diferentes nunca
 * recebem o resultado de outra intenção.
 */
export function proveStorageRetirementReadinessOnce(
  input: ProveStorageRetirementReadinessInput,
): Promise<ProveStorageRetirementReadinessResult> {
  if (!isRecord(input) || !isRecord(input.storage) || !isNonEmptyString(input.key)) {
    return proveStorageRetirementReadiness(input);
  }
  const lockTarget = input.storage;
  let locks = readinessLocks.get(lockTarget);
  if (!locks) {
    locks = new Map();
    readinessLocks.set(lockTarget, locks);
  }
  const lockKey = readinessIntentKey(input);
  const existing = locks.get(lockKey);
  if (existing) {
    return existing.operation;
  }

  const operation = proveStorageRetirementReadiness(input);
  locks.set(lockKey, { operation });
  void operation.then(() => {
    if (locks?.get(lockKey)?.operation === operation) locks.delete(lockKey);
  }, () => {
    if (locks?.get(lockKey)?.operation === operation) locks.delete(lockKey);
  });
  return operation;
}

export function confirmStorageRetirementReadiness(
  capability: unknown,
): capability is StorageRetirementReadinessCapability {
  return isStorageRetirementReadinessCapability(capability);
}
