import type {
  AdministrableWorkoutHistoryStorageAdapter,
  StorageAdministrationSnapshotRead,
} from './storage-adapter';
import type { StorageAdminRuntime } from './storage-admin-runtime';
import {
  createStorageAdminOwnerTokenCoordinator,
  isStorageAdminOwnerTokenConflict,
  type StorageAdminOwnerTokenCoordinator,
  type StorageAdminOwnerTokenLease,
} from './storage-admin-owner-token';
import {
  HYBRID_CORE_BACKUP_SUFFIX,
  parsePhysicalEnvelope,
} from './storage-hybrid';
import {
  isTerminalStorageOperationStatus,
  type RestoreStorageOperationReceipt,
  type StorageOperationReceipt,
} from './storage-operation-receipt';
import type { StorageLike } from './storage-types';

const RESTORE_KIND = 'restore' as const;
const MAX_RECOVERY_STEPS = 20;
const PROVEN_TARGET = Symbol('logical-storage-restore-v2-proven-target');

export type LogicalRestoreRuntime = Pick<
  StorageAdminRuntime,
  | 'inspectStorageAdministration'
  | 'beginStorageOperation'
  | 'transitionStorageOperation'
  | 'revertStorageOperationSafely'
>;

export type LogicalRestoreAdapter = Pick<
  AdministrableWorkoutHistoryStorageAdapter,
  | 'readStorageAdministrationSnapshot'
  | 'readStorageOperationReceipt'
  | 'readVerifiedHistoryGeneration'
  | 'readMetadata'
  | 'rollbackToHistoryGeneration'
  | 'transitionStorageOperationIfUnambiguous'
>;

export interface LogicalStorageRestoreTargetV2 {
  readonly sourceOperationId: string;
  readonly targetCoreRaw: string;
  readonly targetGenerationId: string;
  readonly currentCoreRaw: string;
  readonly currentGenerationId: string;
  readonly administrationFingerprint: string;
  readonly [PROVEN_TARGET]: true;
}

export type LogicalRestoreProvenanceFailureReason =
  | 'invalid-input'
  | 'storage-unavailable'
  | 'administration-unavailable'
  | 'administration-busy'
  | 'source-receipt-not-settled'
  | 'source-receipt-unsupported'
  | 'target-pair-divergent'
  | 'current-pair-divergent'
  | 'target-generation-invalid'
  | 'current-generation-invalid'
  | 'snapshot-changed';

export type LogicalRestoreProvenanceResult =
  | { ok: true; target: LogicalStorageRestoreTargetV2 }
  | { ok: false; reason: LogicalRestoreProvenanceFailureReason };

export interface ProveLogicalStorageRestoreTargetV2Input {
  sourceOperationId: string;
  targetCoreRaw: string;
  targetGenerationId: string;
  adapter: LogicalRestoreAdapter;
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

function finalGenerationOf(receipt: StorageOperationReceipt): string | null {
  if (receipt.kind === 'import') return receipt.stagedGenerationId;
  if (receipt.kind === 'restore') return receipt.targetGenerationId;
  return null;
}

function coreNamesGeneration(raw: string, generationId: string): boolean {
  const parsed = parsePhysicalEnvelope(raw);
  return parsed.status === 'v2'
    && parsed.envelope.data.historyStorage.generationId === generationId;
}

function findReceipt(
  snapshot: StorageAdministrationSnapshotRead,
  operationId: string,
): StorageOperationReceipt | null {
  return snapshot.operationReceipts.find((entry) => entry.operationId === operationId) ?? null;
}

/**
 * Prova um alvo explicitamente nomeado. A funcao nunca enumera para escolher
 * candidato e nunca usa timestamp, ordem, nome lexical ou proximidade temporal.
 *
 * A tupla duravel e somente:
 * receipt fonte.previousCoreRaw + previousGenerationId + targetCoreRaw
 * + targetGenerationId + manifest + conteudo fisico da geracao.
 *
 * O backup rolante e copia de trabalho rotativa (autosave e import a
 * sobrescrevem) e portanto nao participa da prova.
 */
export async function proveLogicalStorageRestoreTargetV2(
  input: ProveLogicalStorageRestoreTargetV2Input,
): Promise<LogicalRestoreProvenanceResult> {
  if (
    !input.sourceOperationId
    || !input.targetCoreRaw
    || !input.targetGenerationId
    || !input.key
  ) {
    return { ok: false, reason: 'invalid-input' };
  }

  const backupKey = `${input.key}${HYBRID_CORE_BACKUP_SUFFIX}`;
  const currentA = readRaw(input.storage, input.key);
  const backupA = readRaw(input.storage, backupKey);
  if (!currentA.ok || !backupA.ok) return { ok: false, reason: 'storage-unavailable' };
  if (currentA.raw === null) return { ok: false, reason: 'current-pair-divergent' };

  const snapshotA = await input.adapter.readStorageAdministrationSnapshot().catch(() => null);
  if (snapshotA === null) return { ok: false, reason: 'administration-unavailable' };
  if (
    snapshotA.unsettledOperations.length !== 0
    || snapshotA.pendingCompletionReceipts.length !== 0
    || snapshotA.metadata.migrationStatus !== 'completed'
    || snapshotA.metadata.migrationGeneration !== null
  ) {
    return { ok: false, reason: 'administration-busy' };
  }

  const source = findReceipt(snapshotA, input.sourceOperationId);
  if (source === null || source.status !== 'settled') {
    return { ok: false, reason: 'source-receipt-not-settled' };
  }
  if (source.targetCoreRaw === null || finalGenerationOf(source) === null) {
    return { ok: false, reason: 'source-receipt-unsupported' };
  }

  if (
    source.previousCoreRaw !== input.targetCoreRaw
    || source.previousGenerationId !== input.targetGenerationId
  ) {
    return { ok: false, reason: 'target-pair-divergent' };
  }
  if (!coreNamesGeneration(input.targetCoreRaw, input.targetGenerationId)) {
    return { ok: false, reason: 'target-pair-divergent' };
  }

  const currentGenerationId = snapshotA.metadata.activeGeneration;
  if (
    currentGenerationId === null
    || !coreNamesGeneration(currentA.raw, currentGenerationId)
  ) {
    return { ok: false, reason: 'current-pair-divergent' };
  }
  if (currentGenerationId === input.targetGenerationId) {
    return { ok: false, reason: 'target-pair-divergent' };
  }

  const targetVerified = await input.adapter
    .readVerifiedHistoryGeneration(input.targetGenerationId)
    .catch(() => null);
  if (
    targetVerified === null
    || targetVerified.generationId !== input.targetGenerationId
    || targetVerified.manifest.generationId !== input.targetGenerationId
    || !targetVerified.manifest.verified
  ) {
    return { ok: false, reason: 'target-generation-invalid' };
  }
  const currentVerified = await input.adapter
    .readVerifiedHistoryGeneration(currentGenerationId)
    .catch(() => null);
  if (
    currentVerified === null
    || currentVerified.generationId !== currentGenerationId
    || currentVerified.manifest.generationId !== currentGenerationId
    || !currentVerified.manifest.verified
  ) {
    return { ok: false, reason: 'current-generation-invalid' };
  }

  const snapshotB = await input.adapter.readStorageAdministrationSnapshot().catch(() => null);
  const currentB = readRaw(input.storage, input.key);
  const backupB = readRaw(input.storage, backupKey);
  if (snapshotB === null || !currentB.ok || !backupB.ok) {
    return { ok: false, reason: 'administration-unavailable' };
  }
  if (
    snapshotA.fingerprint !== snapshotB.fingerprint
    || currentA.raw !== currentB.raw
    || backupA.raw !== backupB.raw
  ) {
    return { ok: false, reason: 'snapshot-changed' };
  }

  return {
    ok: true,
    target: Object.freeze({
      sourceOperationId: input.sourceOperationId,
      targetCoreRaw: input.targetCoreRaw,
      targetGenerationId: input.targetGenerationId,
      currentCoreRaw: currentA.raw,
      currentGenerationId,
      administrationFingerprint: snapshotA.fingerprint,
      [PROVEN_TARGET]: true as const,
    }),
  };
}

export type LogicalRestoreFailureReason =
  | 'invalid-target-proof'
  | 'provenance-diverged'
  | 'administration-unavailable'
  | 'operation-conflict'
  | 'owner-token-conflict'
  | 'verification-failed'
  | 'activation-failed'
  | 'storage-unavailable'
  | 'core-commit-failed'
  | 'readback-failed'
  | 'recovery-required';

export type LogicalStorageRestoreV2Result =
  | {
      ok: true;
      operationId: string;
      targetGenerationId: string;
      previousGenerationId: string;
    }
  | {
      ok: false;
      reason: LogicalRestoreFailureReason;
      operationId: string | null;
      targetGenerationId: string | null;
      recoveryRequired: boolean;
    };

export type LogicalRestoreCommitStep =
  | 'journal-created'
  | 'activating'
  | 'generation-activated'
  | 'core-committed'
  | 'receipt-activated'
  | 'settled';

export interface CommitLogicalStorageRestoreV2Input {
  target: LogicalStorageRestoreTargetV2;
  runtime: LogicalRestoreRuntime;
  adapter: LogicalRestoreAdapter;
  storage: StorageLike;
  key: string;
  ownerToken?: StorageAdminOwnerTokenCoordinator;
  // Somente costura deterministica de teste para simular queda entre writes.
  afterStep?: (step: LogicalRestoreCommitStep) => void | Promise<void>;
}

type CoreCommitOutcome =
  | 'committed'
  | 'storage-unavailable'
  | 'core-commit-failed'
  | 'recovery-required';

async function commitRestoreTargetCore(input: {
  adapter: LogicalRestoreAdapter;
  ownerLease: StorageAdminOwnerTokenLease;
  storage: StorageLike;
  key: string;
  receipt: RestoreStorageOperationReceipt;
}): Promise<CoreCommitOutcome> {
  const { adapter, ownerLease, storage, key, receipt } = input;
  const metadata = await adapter.readMetadata().catch(() => null);
  if (
    metadata === null
    || metadata.activeGeneration !== receipt.targetGenerationId
    || metadata.migrationGeneration !== null
  ) {
    return 'recovery-required';
  }
  if (!coreNamesGeneration(receipt.targetCoreRaw, receipt.targetGenerationId)) {
    return 'recovery-required';
  }

  const coreBefore = readRaw(storage, key);
  if (!coreBefore.ok || coreBefore.raw === null) return 'storage-unavailable';
  if (coreBefore.raw !== receipt.previousCoreRaw && coreBefore.raw !== receipt.targetCoreRaw) {
    return 'recovery-required';
  }

  const backupKey = `${key}${HYBRID_CORE_BACKUP_SUFFIX}`;
  const backupProbe = readRaw(storage, backupKey);
  if (!backupProbe.ok) return 'storage-unavailable';
  try {
    await ownerLease.execute(() => storage.setItem(backupKey, receipt.previousCoreRaw));
  } catch (error) {
    if (isStorageAdminOwnerTokenConflict(error)) throw error;
    return 'storage-unavailable';
  }
  const backupReadback = readRaw(storage, backupKey);
  if (!backupReadback.ok || backupReadback.raw !== receipt.previousCoreRaw) {
    return 'core-commit-failed';
  }

  const coreAgain = readRaw(storage, key);
  if (!coreAgain.ok || coreAgain.raw === null) return 'storage-unavailable';
  if (coreAgain.raw !== receipt.previousCoreRaw && coreAgain.raw !== receipt.targetCoreRaw) {
    return 'recovery-required';
  }
  if (coreAgain.raw === receipt.previousCoreRaw) {
    try {
      await ownerLease.execute(() => storage.setItem(key, receipt.targetCoreRaw));
    } catch (error) {
      if (isStorageAdminOwnerTokenConflict(error)) throw error;
      return 'storage-unavailable';
    }
  }
  const coreReadback = readRaw(storage, key);
  return coreReadback.ok && coreReadback.raw === receipt.targetCoreRaw
    ? 'committed'
    : 'core-commit-failed';
}

function restoreReceiptMatchesTarget(
  receipt: StorageOperationReceipt | null,
  target: LogicalStorageRestoreTargetV2,
  operationId: string,
): receipt is RestoreStorageOperationReceipt {
  return receipt !== null
    && receipt.kind === RESTORE_KIND
    && receipt.operationId === operationId
    && receipt.previousCoreRaw === target.currentCoreRaw
    && receipt.previousGenerationId === target.currentGenerationId
    && receipt.stagedGenerationId === null
    && receipt.targetGenerationId === target.targetGenerationId
    && receipt.targetCoreRaw === target.targetCoreRaw;
}

export async function commitLogicalStorageRestoreV2(
  input: CommitLogicalStorageRestoreV2Input,
): Promise<LogicalStorageRestoreV2Result> {
  const { target, runtime, adapter, storage, key } = input;
  if (target?.[PROVEN_TARGET] !== true) {
    return {
      ok: false,
      reason: 'invalid-target-proof',
      operationId: null,
      targetGenerationId: null,
      recoveryRequired: false,
    };
  }

  const reproved = await proveLogicalStorageRestoreTargetV2({
    sourceOperationId: target.sourceOperationId,
    targetCoreRaw: target.targetCoreRaw,
    targetGenerationId: target.targetGenerationId,
    adapter,
    storage,
    key,
  }).catch(() => null);
  if (reproved === null || !reproved.ok || reproved.target.currentCoreRaw !== target.currentCoreRaw) {
    return {
      ok: false,
      reason: 'provenance-diverged',
      operationId: null,
      targetGenerationId: target.targetGenerationId,
      recoveryRequired: false,
    };
  }

  const ownerToken = input.ownerToken ?? createStorageAdminOwnerTokenCoordinator({ key, storage });
  const operationId = ownerToken.createOperationId();
  const acquisition = ownerToken.acquire({ operationId, operationKind: RESTORE_KIND });
  if (acquisition.status === 'blocked') {
    return {
      ok: false,
      reason: 'owner-token-conflict',
      operationId: null,
      targetGenerationId: target.targetGenerationId,
      recoveryRequired: false,
    };
  }
  const ownerLease = acquisition.lease;
  let journalCreated = false;

  const fail = (reason: LogicalRestoreFailureReason): LogicalStorageRestoreV2Result => ({
    ok: false,
    reason,
    operationId,
    targetGenerationId: target.targetGenerationId,
    recoveryRequired: journalCreated,
  });

  try {
    // Verificacao integral imediatamente antes do primeiro write. A primitiva de
    // ativacao repete a prova dentro da transacao que move o ponteiro.
    const verified = await adapter.readVerifiedHistoryGeneration(target.targetGenerationId);
    if (!verified.manifest.verified) return fail('verification-failed');

    const begun = await ownerLease.execute(() => runtime.beginStorageOperation({
      kind: RESTORE_KIND,
      sourceDigest: null,
      reservedOperationId: operationId,
      stagedGenerationId: null,
      expectedPreviousCoreRaw: target.currentCoreRaw,
      expectedPreviousGenerationId: target.currentGenerationId,
      targetGenerationId: target.targetGenerationId,
      targetCoreRaw: target.targetCoreRaw,
    }));
    journalCreated = true;
    if (!restoreReceiptMatchesTarget(begun, target, operationId) || begun.status !== 'staged') {
      return fail('readback-failed');
    }
    await input.afterStep?.('journal-created');

    const activating = await ownerLease.execute(() => runtime.transitionStorageOperation({
      operationId,
      expectedStatus: 'staged',
      nextStatus: 'activating',
    }));
    if (!restoreReceiptMatchesTarget(activating, target, operationId)) {
      return fail('readback-failed');
    }
    await input.afterStep?.('activating');

    await adapter.readVerifiedHistoryGeneration(target.targetGenerationId);
    const activation = await ownerLease.execute(() => adapter.rollbackToHistoryGeneration({
      targetGenerationId: target.targetGenerationId,
      expectedActiveGenerationId: target.currentGenerationId,
    }));
    if (activation.activeGeneration !== target.targetGenerationId) return fail('activation-failed');
    await input.afterStep?.('generation-activated');

    const receiptBeforeCore = await adapter.readStorageOperationReceipt(operationId);
    if (!restoreReceiptMatchesTarget(receiptBeforeCore, target, operationId)) {
      return fail('readback-failed');
    }
    const committed = await commitRestoreTargetCore({
      adapter,
      ownerLease,
      storage,
      key,
      receipt: receiptBeforeCore,
    });
    if (committed !== 'committed') return fail(committed);
    await input.afterStep?.('core-committed');

    const activated = await ownerLease.execute(() => (
      adapter.transitionStorageOperationIfUnambiguous({
        operationId,
        expectedStatus: 'activating',
        nextStatus: 'activated',
        expectedActiveGenerationId: target.targetGenerationId,
      })
    ));
    if (!restoreReceiptMatchesTarget(activated, target, operationId)) {
      return fail('readback-failed');
    }
    await input.afterStep?.('receipt-activated');

    const settled = await ownerLease.execute(() => runtime.transitionStorageOperation({
      operationId,
      expectedStatus: 'activated',
      nextStatus: 'settled',
    }));
    if (!restoreReceiptMatchesTarget(settled, target, operationId) || settled.status !== 'settled') {
      return fail('readback-failed');
    }
    await input.afterStep?.('settled');

    const final = await runtime.inspectStorageAdministration();
    if (
      final.state.status !== 'ready'
      || final.activeGenerationId !== target.targetGenerationId
      || final.coreRawObserved !== target.targetCoreRaw
      || final.unsettledOperations.length !== 0
      || final.activeGenerationIntegrity?.status !== 'verified'
    ) {
      return fail('recovery-required');
    }
    return {
      ok: true,
      operationId,
      targetGenerationId: target.targetGenerationId,
      previousGenerationId: target.currentGenerationId,
    };
  } catch (error) {
    if (isStorageAdminOwnerTokenConflict(error)) return fail('owner-token-conflict');
    return fail(journalCreated ? 'recovery-required' : 'operation-conflict');
  } finally {
    ownerLease.release();
  }
}

export type LogicalRestoreGenerationIntegrity = 'verified' | 'invalid' | 'unknown';

export interface LogicalRestoreRecoveryObservation {
  receipt: StorageOperationReceipt | null;
  coreRaw: string | null;
  activeGeneration: string | null;
  migrationGeneration: string | null;
  migrationStatus: string;
  generations: readonly { generationId: string }[];
  previousGenerationIntegrity: LogicalRestoreGenerationIntegrity;
  targetGenerationIntegrity: LogicalRestoreGenerationIntegrity;
  unsettledOperationCount: number;
  pendingCompletionReceiptCount: number;
}

export type LogicalRestoreRecoveryBlockedReason =
  | 'not-a-restore'
  | 'multiple-unsettled-operations'
  | 'completion-pending'
  | 'core-missing'
  | 'migration-incomplete'
  | 'unexpected-staging-pointer'
  | 'previous-generation-absent'
  | 'target-generation-absent'
  | 'target-generation-invalid'
  | 'previous-generation-invalid'
  | 'target-core-invalid'
  | 'target-generation-divergent'
  | 'core-divergent'
  | 'active-generation-divergent'
  | 'status-world-incompatible';

export type LogicalRestoreRecoveryDecision =
  | { action: 'no-operation' }
  | { action: 'already-settled'; operationId: string; status: 'settled' | 'reverted' }
  | { action: 'verify-previous'; operationId: string; generationId: string }
  | { action: 'verify-target'; operationId: string; generationId: string }
  | { action: 'advance-activating'; operationId: string }
  | { action: 'revert'; operationId: string; expectedStatus: 'staged' | 'activating' }
  | {
      action: 'activate-generation';
      operationId: string;
      targetGenerationId: string;
      previousGenerationId: string;
    }
  | { action: 'commit-core'; operationId: string; targetGenerationId: string }
  | { action: 'mark-activated'; operationId: string; targetGenerationId: string }
  | { action: 'settle'; operationId: string }
  | { action: 'recovery-required'; reason: LogicalRestoreRecoveryBlockedReason }
  | { action: 'blocked'; reason: LogicalRestoreRecoveryBlockedReason };

function recoveryRequired(
  reason: LogicalRestoreRecoveryBlockedReason,
): LogicalRestoreRecoveryDecision {
  return { action: 'recovery-required', reason };
}

function recoveryBlocked(
  reason: LogicalRestoreRecoveryBlockedReason,
): LogicalRestoreRecoveryDecision {
  return { action: 'blocked', reason };
}

export function resolveLogicalRestoreRecovery(
  observation: LogicalRestoreRecoveryObservation,
): LogicalRestoreRecoveryDecision {
  const receipt = observation.receipt;
  if (receipt === null) return { action: 'no-operation' };
  if (receipt.kind !== RESTORE_KIND) return recoveryBlocked('not-a-restore');
  if (observation.unsettledOperationCount > 1) {
    return recoveryBlocked('multiple-unsettled-operations');
  }
  if (observation.pendingCompletionReceiptCount > 0) {
    return recoveryBlocked('completion-pending');
  }
  if (observation.coreRaw === null) return recoveryRequired('core-missing');
  if (observation.migrationStatus !== 'completed') {
    return recoveryBlocked('migration-incomplete');
  }
  if (observation.migrationGeneration !== null) {
    return recoveryBlocked('unexpected-staging-pointer');
  }

  const known = new Set(observation.generations.map((entry) => entry.generationId));
  if (!known.has(receipt.previousGenerationId)) {
    return recoveryBlocked('previous-generation-absent');
  }
  if (!known.has(receipt.targetGenerationId)) {
    return recoveryBlocked('target-generation-absent');
  }
  if (receipt.targetGenerationId === receipt.previousGenerationId) {
    return recoveryBlocked('target-generation-divergent');
  }
  if (!coreNamesGeneration(receipt.targetCoreRaw, receipt.targetGenerationId)) {
    return recoveryBlocked('target-core-invalid');
  }

  const coreIsPrevious = observation.coreRaw === receipt.previousCoreRaw;
  const coreIsTarget = observation.coreRaw === receipt.targetCoreRaw;
  const activeIsPrevious = observation.activeGeneration === receipt.previousGenerationId;
  const activeIsTarget = observation.activeGeneration === receipt.targetGenerationId;
  if (!coreIsPrevious && !coreIsTarget) return recoveryBlocked('core-divergent');
  if (!activeIsPrevious && !activeIsTarget) {
    return recoveryBlocked('active-generation-divergent');
  }

  if (receipt.status === 'settled' || receipt.status === 'reverted') {
    const terminalWorld = receipt.status === 'settled'
      ? activeIsTarget && coreIsTarget
      : activeIsPrevious && coreIsPrevious;
    if (!terminalWorld) return recoveryBlocked('status-world-incompatible');
    const integrity = receipt.status === 'settled'
      ? observation.targetGenerationIntegrity
      : observation.previousGenerationIntegrity;
    if (integrity === 'invalid') {
      return recoveryBlocked(receipt.status === 'settled'
        ? 'target-generation-invalid'
        : 'previous-generation-invalid');
    }
    if (integrity === 'unknown') {
      return receipt.status === 'settled'
        ? { action: 'verify-target', operationId: receipt.operationId, generationId: receipt.targetGenerationId }
        : { action: 'verify-previous', operationId: receipt.operationId, generationId: receipt.previousGenerationId };
    }
    return { action: 'already-settled', operationId: receipt.operationId, status: receipt.status };
  }

  if (receipt.status === 'staged' && (!activeIsPrevious || !coreIsPrevious)) {
    return recoveryBlocked('status-world-incompatible');
  }
  if (receipt.status === 'staged' || (receipt.status === 'activating' && activeIsPrevious && coreIsPrevious)) {
    if (observation.previousGenerationIntegrity === 'invalid') {
      return recoveryBlocked('previous-generation-invalid');
    }
    if (observation.previousGenerationIntegrity === 'unknown') {
      return { action: 'verify-previous', operationId: receipt.operationId, generationId: receipt.previousGenerationId };
    }
    if (observation.targetGenerationIntegrity === 'invalid') {
      return recoveryBlocked('target-generation-invalid');
    }
    if (observation.targetGenerationIntegrity === 'unknown') {
      return { action: 'verify-target', operationId: receipt.operationId, generationId: receipt.targetGenerationId };
    }
    if (receipt.status === 'staged') {
      return { action: 'advance-activating', operationId: receipt.operationId };
    }
    return {
      action: 'activate-generation',
      operationId: receipt.operationId,
      targetGenerationId: receipt.targetGenerationId,
      previousGenerationId: receipt.previousGenerationId,
    };
  }

  if (activeIsPrevious && coreIsTarget) {
    return recoveryBlocked('status-world-incompatible');
  }
  if (observation.targetGenerationIntegrity === 'invalid') {
    return recoveryBlocked('target-generation-invalid');
  }
  if (observation.targetGenerationIntegrity === 'unknown') {
    return { action: 'verify-target', operationId: receipt.operationId, generationId: receipt.targetGenerationId };
  }

  if (receipt.status === 'activating') {
    if (activeIsPrevious && coreIsPrevious) {
      return {
        action: 'activate-generation',
        operationId: receipt.operationId,
        targetGenerationId: receipt.targetGenerationId,
        previousGenerationId: receipt.previousGenerationId,
      };
    }
    if (activeIsTarget && coreIsPrevious) {
      return { action: 'commit-core', operationId: receipt.operationId, targetGenerationId: receipt.targetGenerationId };
    }
    if (activeIsTarget && coreIsTarget) {
      return { action: 'mark-activated', operationId: receipt.operationId, targetGenerationId: receipt.targetGenerationId };
    }
  }
  if (receipt.status === 'activated' && activeIsTarget && coreIsTarget) {
    return { action: 'settle', operationId: receipt.operationId };
  }
  return recoveryBlocked('status-world-incompatible');
}

export type LogicalRestoreRecoveryFailureReason =
  | 'operation-conflict'
  | 'owner-token-conflict'
  | 'administration-unavailable'
  | 'administration-conflicted'
  | 'storage-unavailable'
  | 'verification-failed'
  | 'activation-failed'
  | 'core-commit-failed'
  | 'readback-failed'
  | 'recovery-required'
  | 'recovery-step-limit';

export type LogicalStorageRestoreRecoveryResult =
  | {
      ok: true;
      status: 'no-operation' | 'settled' | 'reverted' | 'already-settled' | 'already-reverted';
      operationId: string | null;
      generationId: string | null;
      steps: number;
      finalAction: LogicalRestoreRecoveryDecision['action'] | 'observe';
      recoveryRequired: false;
      cleanupPending: false;
    }
  | {
      ok: false;
      reason: LogicalRestoreRecoveryFailureReason;
      error: string;
      operationId: string | null;
      generationId: string | null;
      steps: number;
      finalAction: LogicalRestoreRecoveryDecision['action'] | 'observe';
      recoveryRequired: true;
      cleanupPending: false;
    };

export interface RecoverLogicalStorageRestoreV2Input {
  runtime: LogicalRestoreRuntime;
  adapter: LogicalRestoreAdapter;
  storage: StorageLike;
  key: string;
  operationId?: string;
  ownerToken?: StorageAdminOwnerTokenCoordinator;
}

function selectRestoreReceipt(
  snapshot: StorageAdministrationSnapshotRead,
  requested: string | undefined,
): StorageOperationReceipt | null | 'conflict' {
  if (requested === undefined) {
    if (snapshot.unsettledOperations.length === 0) return null;
    if (snapshot.unsettledOperations.length !== 1) return 'conflict';
    return snapshot.unsettledOperations[0];
  }
  const named = findReceipt(snapshot, requested);
  if (named === null) return 'conflict';
  if (isTerminalStorageOperationStatus(named.status)) {
    return snapshot.unsettledOperations.length === 0 ? named : 'conflict';
  }
  return snapshot.unsettledOperations.length === 1
    && snapshot.unsettledOperations[0].operationId === requested
    ? named
    : 'conflict';
}

export async function recoverLogicalStorageRestoreV2(
  input: RecoverLogicalStorageRestoreV2Input,
): Promise<LogicalStorageRestoreRecoveryResult> {
  const ownerToken = input.ownerToken ?? createStorageAdminOwnerTokenCoordinator({
    key: input.key,
    storage: input.storage,
  });
  let steps = 0;
  let operationId: string | null = input.operationId ?? null;
  let generationId: string | null = null;
  let outcome: 'settled' | 'reverted' | null = null;
  let lease: StorageAdminOwnerTokenLease | null = null;
  const proofs = new Map<string, { fingerprint: string; integrity: LogicalRestoreGenerationIntegrity }>();

  const fail = (
    reason: LogicalRestoreRecoveryFailureReason,
    finalAction: LogicalRestoreRecoveryDecision['action'] | 'observe',
  ): LogicalStorageRestoreRecoveryResult => ({
    ok: false,
    reason,
    error: 'A recuperacao do restore nao pode ser comprovada; o journal foi preservado.',
    operationId,
    generationId,
    steps,
    finalAction,
    recoveryRequired: true,
    cleanupPending: false,
  });
  const succeed = (
    status: 'no-operation' | 'settled' | 'reverted' | 'already-settled' | 'already-reverted',
    finalAction: LogicalRestoreRecoveryDecision['action'],
  ): LogicalStorageRestoreRecoveryResult => ({
    ok: true,
    status,
    operationId,
    generationId,
    steps,
    finalAction,
    recoveryRequired: false,
    cleanupPending: false,
  });

  try {
    while (steps < MAX_RECOVERY_STEPS) {
      steps += 1;
      const snapshot = await input.adapter.readStorageAdministrationSnapshot().catch(() => null);
      if (snapshot === null) return fail('administration-unavailable', 'observe');
      const selected = selectRestoreReceipt(snapshot, input.operationId ?? operationId ?? undefined);
      if (selected === 'conflict') return fail('operation-conflict', 'observe');
      const receipt = selected;
      if (receipt !== null) {
        operationId = receipt.operationId;
        if (receipt.kind === RESTORE_KIND) generationId = receipt.targetGenerationId;
        if (!isTerminalStorageOperationStatus(receipt.status) && lease === null) {
          if (receipt.kind !== RESTORE_KIND) return fail('operation-conflict', 'observe');
          const acquired = ownerToken.acquire({
            operationId: receipt.operationId,
            operationKind: RESTORE_KIND,
          });
          if (acquired.status === 'blocked') return fail('owner-token-conflict', 'observe');
          lease = acquired.lease;
        }
      }

      const core = readRaw(input.storage, input.key);
      if (!core.ok) return fail('storage-unavailable', 'observe');
      const integrityOf = (id: string | null): LogicalRestoreGenerationIntegrity => {
        if (id === null) return 'unknown';
        const proof = proofs.get(id);
        return proof?.fingerprint === snapshot.fingerprint ? proof.integrity : 'unknown';
      };
      const decision = resolveLogicalRestoreRecovery({
        receipt,
        coreRaw: core.raw,
        activeGeneration: snapshot.metadata.activeGeneration,
        migrationGeneration: snapshot.metadata.migrationGeneration,
        migrationStatus: snapshot.metadata.migrationStatus,
        generations: snapshot.generations,
        previousGenerationIntegrity: integrityOf(receipt?.previousGenerationId ?? null),
        targetGenerationIntegrity: integrityOf(receipt?.kind === RESTORE_KIND
          ? receipt.targetGenerationId
          : null),
        unsettledOperationCount: snapshot.unsettledOperations.length,
        pendingCompletionReceiptCount: snapshot.pendingCompletionReceipts.length,
      });

      switch (decision.action) {
        case 'no-operation':
          return succeed(outcome ?? 'no-operation', decision.action);
        case 'already-settled':
          return succeed(
            outcome ?? (decision.status === 'settled' ? 'already-settled' : 'already-reverted'),
            decision.action,
          );
        case 'verify-previous':
        case 'verify-target': {
          const verified = await input.adapter
            .readVerifiedHistoryGeneration(decision.generationId)
            .catch(() => null);
          proofs.set(decision.generationId, {
            fingerprint: snapshot.fingerprint,
            integrity: verified !== null
              && verified.generationId === decision.generationId
              && verified.manifest.generationId === decision.generationId
              && verified.manifest.verified
              ? 'verified'
              : 'invalid',
          });
          continue;
        }
        case 'revert': {
          if (lease === null) return fail('owner-token-conflict', decision.action);
          await lease.execute(() => input.runtime.revertStorageOperationSafely({
            operationId: decision.operationId,
            expectedStatus: decision.expectedStatus,
          }));
          const reverted = await input.adapter.readStorageOperationReceipt(decision.operationId);
          if (reverted?.status !== 'reverted') return fail('readback-failed', decision.action);
          outcome = 'reverted';
          continue;
        }
        case 'advance-activating': {
          if (lease === null) return fail('owner-token-conflict', decision.action);
          const activating = await lease.execute(() => input.runtime.transitionStorageOperation({
            operationId: decision.operationId,
            expectedStatus: 'staged',
            nextStatus: 'activating',
          }));
          if (activating.status !== 'activating') return fail('readback-failed', decision.action);
          continue;
        }
        case 'activate-generation': {
          if (lease === null) return fail('owner-token-conflict', decision.action);
          const activation = await lease.execute(() => input.adapter.rollbackToHistoryGeneration({
            targetGenerationId: decision.targetGenerationId,
            expectedActiveGenerationId: decision.previousGenerationId,
          }));
          if (activation.activeGeneration !== decision.targetGenerationId) {
            return fail('activation-failed', decision.action);
          }
          continue;
        }
        case 'commit-core': {
          if (lease === null) return fail('owner-token-conflict', decision.action);
          const current = await input.adapter.readStorageOperationReceipt(decision.operationId);
          if (current === null || current.kind !== RESTORE_KIND) {
            return fail('readback-failed', decision.action);
          }
          const committed = await commitRestoreTargetCore({
            adapter: input.adapter,
            ownerLease: lease,
            storage: input.storage,
            key: input.key,
            receipt: current,
          });
          if (committed !== 'committed') {
            return fail(committed === 'core-commit-failed'
              ? 'core-commit-failed'
              : committed === 'storage-unavailable'
                ? 'storage-unavailable'
                : 'recovery-required', decision.action);
          }
          continue;
        }
        case 'mark-activated': {
          if (lease === null) return fail('owner-token-conflict', decision.action);
          const advanced = await lease.execute(() => (
            input.adapter.transitionStorageOperationIfUnambiguous({
              operationId: decision.operationId,
              expectedStatus: 'activating',
              nextStatus: 'activated',
              expectedActiveGenerationId: decision.targetGenerationId,
            })
          ));
          if (advanced.status !== 'activated') return fail('readback-failed', decision.action);
          continue;
        }
        case 'settle': {
          if (lease === null) return fail('owner-token-conflict', decision.action);
          const settled = await lease.execute(() => input.runtime.transitionStorageOperation({
            operationId: decision.operationId,
            expectedStatus: 'activated',
            nextStatus: 'settled',
          }));
          if (settled.status !== 'settled') return fail('readback-failed', decision.action);
          outcome = 'settled';
          continue;
        }
        case 'recovery-required':
          return fail('recovery-required', decision.action);
        case 'blocked':
          return fail('administration-conflicted', decision.action);
      }
    }
    return fail('recovery-step-limit', 'observe');
  } catch (error) {
    if (isStorageAdminOwnerTokenConflict(error)) return fail('owner-token-conflict', 'observe');
    return fail('recovery-required', 'observe');
  } finally {
    lease?.release();
  }
}
