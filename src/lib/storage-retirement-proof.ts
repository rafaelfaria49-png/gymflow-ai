import type { StorageAdministrationSnapshotRead } from './storage-adapter';
import type { VerifiedHistoryGeneration } from './storage-adapter';
import { resolveLogicalRestorePredecessorV2 } from './storage-logical-restore-resolve';
import {
  declaredSupersedesMatchLiveRelations,
  detectStorageOperationSupersessionCycle,
  isStorageOperationReceipt,
  isTerminalStorageOperationStatus,
  listActivePredecessorSourceOperationIds,
  validateStorageOperationSupersession,
} from './storage-operation-receipt';
import type { StorageLike } from './storage-types';

// GOAL-17B-002E-E7A3 — prova física/revalidável de retirement.
//
// A prova é uma capability opaca: só este módulo a emite, WeakSet recusa
// clones/JSON e o writer revalida o fingerprint antes de persistir o journal.
// Classificar sem esta prova nunca é retirement-classified.

export type StorageRetirementProofStatus =
  | 'proved'
  | 'blocked-unknown-state'
  | 'blocked-identity-invalid'
  | 'blocked-candidate-missing'
  | 'blocked-predecessor-missing'
  | 'blocked-candidate-protected'
  | 'blocked-predecessor-not-reserved'
  | 'blocked-operation-open'
  | 'blocked-completion-pending'
  | 'blocked-supersession-invalid'
  | 'blocked-snapshot-changed'
  | 'blocked-physical-unverified';

export type StorageRetirementProofReason =
  | 'retirement-proved'
  | 'unknown-state'
  | 'identity-invalid'
  | 'candidate-missing'
  | 'predecessor-missing'
  | 'candidate-protected'
  | 'predecessor-not-reserved'
  | 'operation-open'
  | 'completion-pending'
  | 'supersession-invalid'
  | 'snapshot-changed'
  | 'physical-unverified';

export type StorageRetirementProof = {
  readonly __storageRetirementProofBrand: 'StorageRetirementProof';
};

export interface StorageRetirementProofRecord {
  readonly candidateGenerationId: string;
  readonly reservedPredecessorGenerationId: string;
  readonly currentGenerationId: string;
  readonly supersedeOperationIds: readonly string[];
  readonly fingerprint: string;
}

export type ProveStorageRetirementResult =
  | {
      readonly status: 'proved';
      readonly reason: 'retirement-proved';
      readonly proof: StorageRetirementProof;
      readonly ownerTokenRequired: true;
      readonly executionAuthorized: false;
      readonly deleteAuthorized: false;
      readonly writeAuthorized: false;
    }
  | {
      readonly status: Exclude<StorageRetirementProofStatus, 'proved'>;
      readonly reason: Exclude<StorageRetirementProofReason, 'retirement-proved'>;
      readonly proof: null;
      readonly ownerTokenRequired: true;
      readonly executionAuthorized: false;
      readonly deleteAuthorized: false;
      readonly writeAuthorized: false;
    };

export interface ProveStorageRetirementInput {
  readonly adapter: {
    readStorageAdministrationSnapshot(): Promise<StorageAdministrationSnapshotRead>;
    readVerifiedHistoryGeneration(generationId: string): Promise<VerifiedHistoryGeneration>;
  };
  readonly storage: StorageLike;
  readonly key: string;
  readonly candidateGenerationId: unknown;
  readonly reservedPredecessorGenerationId: unknown;
  readonly supersedeOperationIds: unknown;
}

const AUTHENTIC_PROOFS = new WeakSet<object>();
const PROOF_RECORDS = new WeakMap<object, StorageRetirementProofRecord>();

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

function freezeBlocked(
  status: Exclude<StorageRetirementProofStatus, 'proved'>,
  reason: Exclude<StorageRetirementProofReason, 'retirement-proved'>,
): ProveStorageRetirementResult {
  return Object.freeze({
    status,
    reason,
    proof: null,
    ownerTokenRequired: true as const,
    executionAuthorized: false as const,
    deleteAuthorized: false as const,
    writeAuthorized: false as const,
  });
}

function freezeProved(proof: StorageRetirementProof): ProveStorageRetirementResult {
  return Object.freeze({
    status: 'proved',
    reason: 'retirement-proved',
    proof,
    ownerTokenRequired: true as const,
    executionAuthorized: false as const,
    deleteAuthorized: false as const,
    writeAuthorized: false as const,
  });
}

function issueProof(record: StorageRetirementProofRecord): StorageRetirementProof {
  const proof = Object.freeze({}) as StorageRetirementProof;
  AUTHENTIC_PROOFS.add(proof);
  PROOF_RECORDS.set(proof, Object.freeze({
    ...record,
    supersedeOperationIds: Object.freeze([...record.supersedeOperationIds]),
  }));
  return proof;
}

export function isStorageRetirementProof(value: unknown): value is StorageRetirementProof {
  return typeof value === 'object' && value !== null && AUTHENTIC_PROOFS.has(value);
}

export function inspectStorageRetirementProof(
  proof: unknown,
): StorageRetirementProofRecord | null {
  if (!isStorageRetirementProof(proof)) return null;
  return PROOF_RECORDS.get(proof) ?? null;
}

async function verifyGeneration(
  adapter: ProveStorageRetirementInput['adapter'],
  generationId: string,
): Promise<VerifiedHistoryGeneration | null> {
  try {
    const verified = await adapter.readVerifiedHistoryGeneration(generationId);
    if (
      verified.generationId !== generationId
      || verified.manifest.generationId !== generationId
      || verified.manifest.verified !== true
    ) {
      return null;
    }
    return verified;
  } catch {
    return null;
  }
}

function generationSummary(
  snapshot: StorageAdministrationSnapshotRead,
  generationId: string,
) {
  return snapshot.generations.find((entry) => entry.generationId === generationId) ?? null;
}

/**
 * Emite uma prova física opaca. Sem ela, retirement-classified é inalcançável.
 * Nunca autoriza execução ou delete.
 */
export async function proveStorageRetirement(
  input: ProveStorageRetirementInput,
): Promise<ProveStorageRetirementResult> {
  try {
    if (
      !isNonEmptyString(input.key)
      || !isNonEmptyString(input.candidateGenerationId)
      || !isNonEmptyString(input.reservedPredecessorGenerationId)
    ) {
      return freezeBlocked('blocked-identity-invalid', 'identity-invalid');
    }
    const supersedeOperationIds = uniqueNonEmptyStrings(input.supersedeOperationIds);
    if (supersedeOperationIds === null) {
      return freezeBlocked('blocked-supersession-invalid', 'supersession-invalid');
    }

    const candidateGenerationId = input.candidateGenerationId;
    const reservedPredecessorGenerationId = input.reservedPredecessorGenerationId;

    const snapshotA = await input.adapter.readStorageAdministrationSnapshot().catch(() => null);
    if (snapshotA === null) {
      return freezeBlocked('blocked-unknown-state', 'unknown-state');
    }

    if (snapshotA.unsettledOperations.length > 0) {
      return freezeBlocked('blocked-operation-open', 'operation-open');
    }
    if (snapshotA.pendingCompletionReceipts.length > 0) {
      return freezeBlocked('blocked-completion-pending', 'completion-pending');
    }
    if (detectStorageOperationSupersessionCycle(snapshotA.operationReceipts)) {
      return freezeBlocked('blocked-supersession-invalid', 'supersession-invalid');
    }

    const currentGenerationId = snapshotA.metadata.activeGeneration;
    if (!isNonEmptyString(currentGenerationId)) {
      return freezeBlocked('blocked-identity-invalid', 'identity-invalid');
    }
    if (candidateGenerationId === currentGenerationId) {
      return freezeBlocked('blocked-candidate-protected', 'candidate-protected');
    }
    if (reservedPredecessorGenerationId === currentGenerationId) {
      return freezeBlocked('blocked-predecessor-not-reserved', 'predecessor-not-reserved');
    }
    if (candidateGenerationId === reservedPredecessorGenerationId) {
      return freezeBlocked('blocked-identity-invalid', 'identity-invalid');
    }

    const currentVerified = await verifyGeneration(input.adapter, currentGenerationId);
    const candidateVerified = await verifyGeneration(input.adapter, candidateGenerationId);
    const predecessorVerified = await verifyGeneration(
      input.adapter,
      reservedPredecessorGenerationId,
    );
    if (currentVerified === null) {
      return freezeBlocked('blocked-physical-unverified', 'physical-unverified');
    }
    if (candidateVerified === null) {
      const present = generationSummary(snapshotA, candidateGenerationId) !== null;
      return freezeBlocked(
        present ? 'blocked-physical-unverified' : 'blocked-candidate-missing',
        present ? 'physical-unverified' : 'candidate-missing',
      );
    }
    if (predecessorVerified === null) {
      const present = generationSummary(snapshotA, reservedPredecessorGenerationId) !== null;
      return freezeBlocked(
        present ? 'blocked-physical-unverified' : 'blocked-predecessor-missing',
        present ? 'physical-unverified' : 'predecessor-missing',
      );
    }

    const candidateSummary = generationSummary(snapshotA, candidateGenerationId);
    if (
      candidateSummary === null
      || candidateSummary.isActive
      || candidateSummary.isStaged
      || snapshotA.metadata.migrationGeneration === candidateGenerationId
      || snapshotA.migrationGenerationId === candidateGenerationId
    ) {
      return freezeBlocked('blocked-candidate-protected', 'candidate-protected');
    }

    for (const receipt of snapshotA.unsettledOperations) {
      if (!isStorageOperationReceipt(receipt) || isTerminalStorageOperationStatus(receipt.status)) {
        return freezeBlocked('blocked-unknown-state', 'unknown-state');
      }
      const referenced = [
        receipt.previousGenerationId,
        receipt.stagedGenerationId,
        receipt.kind === 'restore' ? receipt.targetGenerationId : null,
      ];
      if (referenced.includes(candidateGenerationId)) {
        return freezeBlocked('blocked-candidate-protected', 'candidate-protected');
      }
    }
    for (const completion of snapshotA.pendingCompletionReceipts) {
      if (completion.generationId === candidateGenerationId) {
        return freezeBlocked('blocked-completion-pending', 'completion-pending');
      }
    }

    const predecessor = await resolveLogicalRestorePredecessorV2({
      adapter: input.adapter,
      storage: input.storage,
      key: input.key,
    });
    if (
      predecessor.status !== 'available'
      || predecessor.target.targetGenerationId !== reservedPredecessorGenerationId
    ) {
      return freezeBlocked('blocked-predecessor-not-reserved', 'predecessor-not-reserved');
    }

    const liveRelations = listActivePredecessorSourceOperationIds(
      snapshotA.operationReceipts,
      candidateGenerationId,
    );
    if (!declaredSupersedesMatchLiveRelations(supersedeOperationIds, liveRelations)) {
      return freezeBlocked('blocked-supersession-invalid', 'supersession-invalid');
    }
    if (supersedeOperationIds.length > 0) {
      const validated = validateStorageOperationSupersession({
        operationId: `retirement:${candidateGenerationId}`,
        supersedesOperationIds: supersedeOperationIds,
        finalGenerationId: candidateGenerationId,
        receipts: snapshotA.operationReceipts,
      });
      if (!validated.ok) {
        return freezeBlocked('blocked-supersession-invalid', 'supersession-invalid');
      }
    }

    const snapshotB = await input.adapter.readStorageAdministrationSnapshot().catch(() => null);
    if (snapshotB === null || snapshotA.fingerprint !== snapshotB.fingerprint) {
      return freezeBlocked('blocked-snapshot-changed', 'snapshot-changed');
    }

    return freezeProved(issueProof({
      candidateGenerationId,
      reservedPredecessorGenerationId,
      currentGenerationId,
      supersedeOperationIds: Object.freeze([...supersedeOperationIds]),
      fingerprint: snapshotA.fingerprint,
    }));
  } catch {
    return freezeBlocked('blocked-unknown-state', 'unknown-state');
  }
}
