import type {
  LogicalRestoreAdapter,
  LogicalStorageRestoreTargetV2,
} from './storage-logical-restore';
import { proveLogicalStorageRestoreTargetV2 } from './storage-logical-restore';
import { parsePhysicalEnvelope } from './storage-hybrid';
import type { StorageOperationReceipt } from './storage-operation-receipt';
import type { StorageLike } from './storage-types';

export interface LogicalRestorePredecessorPreview {
  readonly sessionCount: number;
  readonly customProgramCount: number;
  readonly weightRecordCount: number;
  readonly measurementRecordCount: number;
}

export type LogicalRestorePredecessorBusyReason =
  | 'completion-pending'
  | 'operation-open'
  | 'administration-busy';

export type LogicalRestorePredecessorErrorReason =
  | 'invalid-input'
  | 'storage-unavailable'
  | 'administration-unavailable'
  | 'current-pair-divergent'
  | 'snapshot-changed'
  | 'preview-unavailable';

export type LogicalRestorePredecessorResolution =
  | {
      status: 'available';
      target: LogicalStorageRestoreTargetV2;
      preview: LogicalRestorePredecessorPreview;
    }
  | { status: 'unavailable' }
  | { status: 'ambiguous' }
  | { status: 'busy'; reason: LogicalRestorePredecessorBusyReason }
  | { status: 'error'; reason: LogicalRestorePredecessorErrorReason };

export interface ResolveLogicalRestorePredecessorV2Input {
  adapter: Pick<
    LogicalRestoreAdapter,
    'readStorageAdministrationSnapshot' | 'readVerifiedHistoryGeneration'
  >;
  storage: StorageLike;
  key: string;
}

type RawRead =
  | { ok: true; raw: string | null }
  | { ok: false };

function readRaw(storage: StorageLike, key: string): RawRead {
  try {
    return { ok: true, raw: storage.getItem(key) };
  } catch {
    return { ok: false };
  }
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function finalGenerationOf(receipt: StorageOperationReceipt): string | null {
  if (receipt.kind === 'import') return receipt.stagedGenerationId;
  if (receipt.kind === 'restore') return receipt.targetGenerationId;
  return null;
}

function receiptMatchesCurrentWorld(
  receipt: StorageOperationReceipt,
  currentCoreRaw: string,
  currentGenerationId: string,
): boolean {
  return receipt.status === 'settled'
    && receipt.previousCoreRaw.length > 0
    && receipt.previousGenerationId.length > 0
    && receipt.targetCoreRaw === currentCoreRaw
    && finalGenerationOf(receipt) === currentGenerationId;
}

function previewFromTargetCore(
  targetCoreRaw: string,
  sessionCount: number,
): LogicalRestorePredecessorPreview | null {
  const parsed = parsePhysicalEnvelope(targetCoreRaw);
  if (parsed.status !== 'v2') return null;
  return {
    sessionCount,
    customProgramCount: countArray(parsed.envelope.data.customPrograms),
    weightRecordCount: countArray(parsed.envelope.data.weightHistory),
    measurementRecordCount: countArray(parsed.envelope.data.measurementsHistory),
  };
}

export function logicalRestoreTargetsMatch(
  left: LogicalStorageRestoreTargetV2,
  right: LogicalStorageRestoreTargetV2,
): boolean {
  return left.sourceOperationId === right.sourceOperationId
    && left.targetCoreRaw === right.targetCoreRaw
    && left.targetGenerationId === right.targetGenerationId
    && left.currentCoreRaw === right.currentCoreRaw
    && left.currentGenerationId === right.currentGenerationId;
}

/**
 * Identifica o predecessor comprovado do mundo atual.
 *
 * A funcao enumera todos os receipts settled e so aceita um candidato quando
 * o estado/geracao finais do receipt coincidem exatamente com o core e a
 * geracao ativos, previousCoreRaw + previousGenerationId continuam
 * verificaveis e proveLogicalStorageRestoreTargetV2 aprova o alvo.
 *
 * Instantes, ordem de enumeracao, "ultimo receipt", maior ID, ID lexical e
 * geracao mais recente nunca escolhem o predecessor. Zero candidatos
 * comprovaveis => unavailable; mais de um => ambiguous sem escolha.
 */
export async function resolveLogicalRestorePredecessorV2(
  input: ResolveLogicalRestorePredecessorV2Input,
): Promise<LogicalRestorePredecessorResolution> {
  if (!input.key) return { status: 'error', reason: 'invalid-input' };

  const current = readRaw(input.storage, input.key);
  if (!current.ok) return { status: 'error', reason: 'storage-unavailable' };
  if (current.raw === null) return { status: 'error', reason: 'current-pair-divergent' };

  const snapshot = await input.adapter.readStorageAdministrationSnapshot().catch(() => null);
  if (snapshot === null) return { status: 'error', reason: 'administration-unavailable' };

  if (snapshot.pendingCompletionReceipts.length > 0) {
    return { status: 'busy', reason: 'completion-pending' };
  }
  if (snapshot.unsettledOperations.length > 0) {
    return { status: 'busy', reason: 'operation-open' };
  }
  if (
    snapshot.metadata.migrationStatus !== 'completed'
    || snapshot.metadata.migrationGeneration !== null
  ) {
    return { status: 'busy', reason: 'administration-busy' };
  }

  const currentGenerationId = snapshot.metadata.activeGeneration;
  if (currentGenerationId === null) {
    return { status: 'error', reason: 'current-pair-divergent' };
  }

  const proven: LogicalStorageRestoreTargetV2[] = [];
  for (const receipt of snapshot.operationReceipts) {
    if (!receiptMatchesCurrentWorld(receipt, current.raw, currentGenerationId)) {
      continue;
    }

    const proof = await proveLogicalStorageRestoreTargetV2({
      sourceOperationId: receipt.operationId,
      targetCoreRaw: receipt.previousCoreRaw,
      targetGenerationId: receipt.previousGenerationId,
      adapter: input.adapter as LogicalRestoreAdapter,
      storage: input.storage,
      key: input.key,
    }).catch(() => null);

    if (proof === null) return { status: 'error', reason: 'administration-unavailable' };
    if (!proof.ok && proof.reason === 'snapshot-changed') {
      return { status: 'error', reason: 'snapshot-changed' };
    }
    if (!proof.ok) continue;
    proven.push(proof.target);
  }

  const snapshotAfter = await input.adapter.readStorageAdministrationSnapshot().catch(() => null);
  const currentAfter = readRaw(input.storage, input.key);
  if (snapshotAfter === null || !currentAfter.ok) {
    return { status: 'error', reason: 'administration-unavailable' };
  }
  if (
    snapshot.fingerprint !== snapshotAfter.fingerprint
    || current.raw !== currentAfter.raw
  ) {
    return { status: 'error', reason: 'snapshot-changed' };
  }

  if (proven.length === 0) return { status: 'unavailable' };
  if (proven.length > 1) return { status: 'ambiguous' };

  const target = proven[0];
  const verified = await input.adapter
    .readVerifiedHistoryGeneration(target.targetGenerationId)
    .catch(() => null);
  if (
    verified === null
    || verified.generationId !== target.targetGenerationId
    || !verified.manifest.verified
  ) {
    return { status: 'error', reason: 'preview-unavailable' };
  }

  const preview = previewFromTargetCore(target.targetCoreRaw, verified.sessions.length);
  if (preview === null) return { status: 'error', reason: 'preview-unavailable' };

  return { status: 'available', target, preview };
}
