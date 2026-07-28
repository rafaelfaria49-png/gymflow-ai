import type {
  HistoryGenerationSummary,
  StorageAdministrationSnapshotRead,
} from './storage-adapter';
import { isHistoryGenerationManifest } from './storage-history-integrity';
import {
  isStorageOperationReceipt,
  isTerminalStorageOperationStatus,
  type StorageOperationReceipt,
} from './storage-operation-receipt';
import { isRecord } from './storage-validation';

// GOAL-17B-002D-D2B — planejamento conservador de retenção.
//
// Não existe política aprovada de quantidade ou idade. Por isso este módulo é
// deliberadamente apenas um planner puro: ele nunca recebe adapter/storage,
// nunca apaga e nunca transforma "parece órfão" em autorização de deleção.

export type StorageRetentionPlanStatus = 'policy-required' | 'blocked';

export type StorageRetentionDisposition = 'keep' | 'delete' | 'blocked';

export type StorageRetentionArtifactKind =
  | 'administration-snapshot'
  | 'current-core'
  | 'rolling-core-backup'
  | 'legacy-snapshot'
  | 'generation'
  | 'operation-receipt'
  | 'completion-receipt';

export type StorageRetentionReason =
  | 'snapshot-invalid'
  | 'current-core'
  | 'rolling-core-backup'
  | 'legacy-snapshot'
  | 'active-generation'
  | 'migration-generation'
  | 'pending-completion-generation'
  | 'unsettled-previous-generation'
  | 'unsettled-staged-generation'
  | 'terminal-operation-evidence'
  | 'unsettled-operation-receipt'
  | 'cleanup-pending'
  | 'pending-completion-receipt'
  | 'integrity-proof-required'
  | 'policy-required';

export interface StorageRetentionDecision {
  artifactKind: StorageRetentionArtifactKind;
  artifactId: string;
  disposition: StorageRetentionDisposition;
  reason: StorageRetentionReason;
}

export interface StorageRetentionPlan {
  status: StorageRetentionPlanStatus;
  reason: 'snapshot-invalid' | 'policy-required';
  snapshotFingerprint: string | null;
  decisions: readonly StorageRetentionDecision[];
  keep: readonly StorageRetentionDecision[];
  delete: readonly StorageRetentionDecision[];
  blocked: readonly StorageRetentionDecision[];
}

const FIXED_PROTECTIONS: readonly StorageRetentionDecision[] = [
  {
    artifactKind: 'current-core',
    artifactId: 'current-core',
    disposition: 'keep',
    reason: 'current-core',
  },
  {
    artifactKind: 'rolling-core-backup',
    artifactId: 'rolling-core-backup',
    disposition: 'keep',
    reason: 'rolling-core-backup',
  },
  {
    artifactKind: 'legacy-snapshot',
    artifactId: 'legacy-snapshot',
    disposition: 'keep',
    reason: 'legacy-snapshot',
  },
];

function finalizePlan(
  status: StorageRetentionPlanStatus,
  reason: StorageRetentionPlan['reason'],
  snapshotFingerprint: string | null,
  decisions: readonly StorageRetentionDecision[],
): StorageRetentionPlan {
  const copied = decisions.map((decision) => ({ ...decision }));
  return {
    status,
    reason,
    snapshotFingerprint,
    decisions: copied,
    keep: copied.filter((decision) => decision.disposition === 'keep'),
    delete: copied.filter((decision) => decision.disposition === 'delete'),
    blocked: copied.filter((decision) => decision.disposition === 'blocked'),
  };
}

function invalidPlan(): StorageRetentionPlan {
  return finalizePlan('blocked', 'snapshot-invalid', null, [
    ...FIXED_PROTECTIONS,
    {
      artifactKind: 'administration-snapshot',
      artifactId: 'administration-snapshot',
      disposition: 'blocked',
      reason: 'snapshot-invalid',
    },
  ]);
}

function isGenerationSummary(value: unknown): value is HistoryGenerationSummary {
  if (!isRecord(value)) return false;
  return typeof value.generationId === 'string'
    && value.generationId.length > 0
    && typeof value.isActive === 'boolean'
    && typeof value.isStaged === 'boolean'
    && typeof value.hasManifest === 'boolean'
    && typeof value.hasRecords === 'boolean'
    && typeof value.recordCount === 'number'
    && Number.isInteger(value.recordCount)
    && value.recordCount >= 0
    && (value.manifestSessionCount === null
      || (typeof value.manifestSessionCount === 'number'
        && Number.isInteger(value.manifestSessionCount)
        && value.manifestSessionCount >= 0))
    && (value.orderedDigest === null || typeof value.orderedDigest === 'string')
    && (value.verified === null || typeof value.verified === 'boolean');
}

function completionReference(value: unknown): {
  receiptId: string;
  generationIds: readonly string[];
} | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.receiptId !== 'string'
    || value.receiptId.length === 0
    || typeof value.generationId !== 'string'
    || value.generationId.length === 0
  ) {
    return null;
  }
  const core = value.coreEnvelopeAfter;
  if (!isRecord(core) || !isRecord(core.historyStorage)) return null;
  const coreGenerationId = core.historyStorage.generationId;
  if (typeof coreGenerationId !== 'string' || coreGenerationId.length === 0) return null;
  return {
    receiptId: value.receiptId,
    generationIds: Array.from(new Set([value.generationId, coreGenerationId])),
  };
}

function uniqueNonEmptyStrings(values: readonly string[]): boolean {
  return values.length === new Set(values).size && values.every((value) => value.length > 0);
}

function snapshotShape(value: unknown): {
  snapshot: StorageAdministrationSnapshotRead;
  operations: readonly StorageOperationReceipt[];
  completions: readonly { receiptId: string; generationIds: readonly string[] }[];
} | null {
  if (!isRecord(value) || !isRecord(value.metadata)) return null;
  if (
    typeof value.fingerprint !== 'string'
    || value.fingerprint.length === 0
    || (value.activeGenerationId !== null && typeof value.activeGenerationId !== 'string')
    || (value.migrationGenerationId !== null && typeof value.migrationGenerationId !== 'string')
    || !Array.isArray(value.generations)
    || !Array.isArray(value.manifests)
    || !Array.isArray(value.operationReceipts)
    || !Array.isArray(value.unsettledOperations)
    || !Array.isArray(value.pendingCompletionReceipts)
  ) {
    return null;
  }
  if (!value.generations.every(isGenerationSummary)) return null;
  if (!value.manifests.every(isHistoryGenerationManifest)) return null;
  if (!value.operationReceipts.every(isStorageOperationReceipt)) return null;
  if (!value.unsettledOperations.every(isStorageOperationReceipt)) return null;

  const completions = value.pendingCompletionReceipts.map(completionReference);
  if (completions.some((entry) => entry === null)) return null;

  const generationIds = value.generations.map((entry) => entry.generationId);
  const operationIds = value.operationReceipts.map((entry) => entry.operationId);
  const completionIds = completions.map((entry) => entry?.receiptId ?? '');
  if (
    !uniqueNonEmptyStrings(generationIds)
    || !uniqueNonEmptyStrings(operationIds)
    || !uniqueNonEmptyStrings(completionIds)
  ) {
    return null;
  }

  const expectedUnsettledIds = value.operationReceipts
    .filter((receipt) => !isTerminalStorageOperationStatus(receipt.status))
    .map((receipt) => receipt.operationId)
    .sort();
  const observedUnsettledIds = value.unsettledOperations
    .map((receipt) => receipt.operationId)
    .sort();
  if (
    expectedUnsettledIds.length !== observedUnsettledIds.length
    || expectedUnsettledIds.some((id, index) => id !== observedUnsettledIds[index])
  ) {
    return null;
  }

  return {
    snapshot: value as unknown as StorageAdministrationSnapshotRead,
    operations: value.operationReceipts,
    completions: completions as {
      receiptId: string;
      generationIds: readonly string[];
    }[],
  };
}

function protectedGenerationReason(
  generationId: string,
  snapshot: StorageAdministrationSnapshotRead,
  operations: readonly StorageOperationReceipt[],
  completions: readonly { generationIds: readonly string[] }[],
): StorageRetentionReason | null {
  if (generationId === snapshot.activeGenerationId) return 'active-generation';
  if (generationId === snapshot.migrationGenerationId) return 'migration-generation';
  if (completions.some((receipt) => receipt.generationIds.includes(generationId))) {
    return 'pending-completion-generation';
  }
  for (const receipt of operations) {
    if (!isTerminalStorageOperationStatus(receipt.status)) {
      if (receipt.previousGenerationId === generationId) return 'unsettled-previous-generation';
      if (receipt.stagedGenerationId === generationId) return 'unsettled-staged-generation';
    }
  }
  if (operations.some((receipt) => (
    isTerminalStorageOperationStatus(receipt.status)
    && (
      receipt.previousGenerationId === generationId
      || receipt.stagedGenerationId === generationId
    )
  ))) {
    return 'terminal-operation-evidence';
  }
  return null;
}

function generationHasStructuralProof(
  generation: HistoryGenerationSummary,
  snapshot: StorageAdministrationSnapshotRead,
): boolean {
  const manifest = snapshot.manifests.find((entry) => entry.generationId === generation.generationId);
  return generation.hasManifest
    && generation.verified === true
    && generation.manifestSessionCount !== null
    && generation.recordCount === generation.manifestSessionCount
    && generation.orderedDigest !== null
    && manifest !== undefined
    && manifest.verified
    && manifest.sessionCount === generation.recordCount
    && manifest.orderedDigest === generation.orderedDigest;
}

function referencesAreCoherent(
  snapshot: StorageAdministrationSnapshotRead,
  operations: readonly StorageOperationReceipt[],
  completions: readonly { generationIds: readonly string[] }[],
): boolean {
  const known = new Set(snapshot.generations.map((entry) => entry.generationId));
  if (snapshot.activeGenerationId === null || !known.has(snapshot.activeGenerationId)) return false;
  if (snapshot.migrationGenerationId !== null && !known.has(snapshot.migrationGenerationId)) return false;

  for (const receipt of operations) {
    if (isTerminalStorageOperationStatus(receipt.status)) continue;
    if (!known.has(receipt.previousGenerationId)) return false;
    if (receipt.stagedGenerationId !== null && !known.has(receipt.stagedGenerationId)) return false;
  }
  return completions.every((receipt) => (
    receipt.generationIds.every((generationId) => known.has(generationId))
  ));
}

/**
 * Planeja retenção sem autorizar exclusão.
 *
 * A assinatura aceita `unknown` para que uma leitura adulterada também produza
 * um resultado fechado e sanitizado, em vez de lançar ou interpolar conteúdo
 * físico numa mensagem pública.
 */
export function planStorageRetention(value: unknown): StorageRetentionPlan {
  try {
    const parsed = snapshotShape(value);
    if (!parsed) return invalidPlan();
    const { snapshot, operations, completions } = parsed;
    if (!referencesAreCoherent(snapshot, operations, completions)) return invalidPlan();

    const generationDecisions: StorageRetentionDecision[] = [...snapshot.generations]
      .sort((left, right) => left.generationId.localeCompare(right.generationId))
      .map((generation) => {
        const protectedReason = protectedGenerationReason(
          generation.generationId,
          snapshot,
          operations,
          completions,
        );
        if (protectedReason !== null) {
          return {
            artifactKind: 'generation',
            artifactId: generation.generationId,
            disposition: 'keep',
            reason: protectedReason,
          };
        }
        return {
          artifactKind: 'generation',
          artifactId: generation.generationId,
          disposition: 'blocked',
          reason: generationHasStructuralProof(generation, snapshot)
            ? 'policy-required'
            : 'integrity-proof-required',
        };
      });

    const operationDecisions: StorageRetentionDecision[] = [...operations]
      .sort((left, right) => left.operationId.localeCompare(right.operationId))
      .map((receipt) => {
        const cleanupPending = (receipt as unknown as Record<string, unknown>).cleanupPending === true;
        return {
          artifactKind: 'operation-receipt',
          artifactId: receipt.operationId,
          disposition: cleanupPending || !isTerminalStorageOperationStatus(receipt.status)
            ? 'keep'
            : 'blocked',
          reason: cleanupPending
            ? 'cleanup-pending'
            : !isTerminalStorageOperationStatus(receipt.status)
              ? 'unsettled-operation-receipt'
              : 'policy-required',
        };
      });

    const completionDecisions: StorageRetentionDecision[] = [...completions]
      .sort((left, right) => left.receiptId.localeCompare(right.receiptId))
      .map((receipt) => ({
        artifactKind: 'completion-receipt',
        artifactId: receipt.receiptId,
        disposition: 'keep',
        reason: 'pending-completion-receipt',
      }));

    return finalizePlan('policy-required', 'policy-required', snapshot.fingerprint, [
      ...FIXED_PROTECTIONS,
      ...generationDecisions,
      ...operationDecisions,
      ...completionDecisions,
    ]);
  } catch {
    return invalidPlan();
  }
}
