import type {
  AdministrableWorkoutHistoryStorageAdapter,
  StorageAdministrationSnapshotRead,
  VerifiedHistoryGeneration,
} from './storage-adapter';
import type { StorageAdminRuntime } from './storage-admin-runtime';
import {
  createStorageAdminOwnerTokenCoordinator,
  isStorageAdminOwnerTokenConflict,
  type StorageAdminOwnerTokenCoordinator,
  type StorageAdminOwnerTokenLease,
} from './storage-admin-owner-token';
import {
  computeOrderedHistoryDigest,
} from './storage-history-integrity';
import {
  HYBRID_CORE_BACKUP_SUFFIX,
  parsePhysicalEnvelope,
  toPersistedCoreState,
} from './storage-hybrid';
import { isCanonicalIsoInstant } from './storage-logical-backup';
import {
  isTerminalStorageOperationStatus,
  type ResetStorageOperationReceipt,
  type StorageOperationReceipt,
} from './storage-operation-receipt';
import {
  HYBRID_STORAGE_VERSION,
  createEmptyPersistedState,
  type PersistedCoreState,
  type StorageEnvelope,
  type StorageLike,
} from './storage-types';

const RESET_KIND = 'reset' as const;
const MAX_RECOVERY_STEPS = 20;
const EMPTY_HISTORY: readonly [] = [];

export type LogicalResetRuntime = Pick<
  StorageAdminRuntime,
  'inspectStorageAdministration' | 'beginStorageOperation' | 'transitionStorageOperation'
>;

export type LogicalResetAdapter = Pick<
  AdministrableWorkoutHistoryStorageAdapter,
  | 'readStorageAdministrationSnapshot'
  | 'readStorageOperationReceipt'
  | 'readVerifiedHistoryGeneration'
  | 'readMetadata'
  | 'stageHistoryGenerationForOperation'
  | 'rollbackToHistoryGeneration'
  | 'transitionStorageOperationIfUnambiguous'
>;

export type LogicalResetFailureReason =
  | 'administration-unavailable'
  | 'operation-conflict'
  | 'owner-token-conflict'
  | 'staging-failed'
  | 'verification-failed'
  | 'activation-failed'
  | 'storage-unavailable'
  | 'core-commit-failed'
  | 'readback-failed'
  | 'recovery-required';

export type LogicalStorageResetV2Result =
  | {
      ok: true;
      operationId: string;
      generationId: string;
      previousGenerationId: string;
    }
  | {
      ok: false;
      reason: LogicalResetFailureReason;
      operationId: string | null;
      generationId: string | null;
      recoveryRequired: boolean;
    };

export type LogicalResetCommitStep =
  | 'journal-created'
  | 'staging-created'
  | 'activating'
  | 'generation-activated'
  | 'core-committed'
  | 'receipt-activated'
  | 'settled';

export interface CommitLogicalStorageResetV2Input {
  runtime: LogicalResetRuntime;
  adapter: LogicalResetAdapter;
  storage: StorageLike;
  key: string;
  ownerToken?: StorageAdminOwnerTokenCoordinator;
  now?: () => Date;
  // Somente costura deterministica de teste para simular queda entre writes.
  afterStep?: (step: LogicalResetCommitStep) => void | Promise<void>;
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

function coreNamesGeneration(raw: string, generationId: string): boolean {
  const parsed = parsePhysicalEnvelope(raw);
  return parsed.status === 'v2'
    && parsed.envelope.data.historyStorage.generationId === generationId;
}

function isResetReceipt(
  receipt: StorageOperationReceipt | null,
  operationId?: string,
): receipt is ResetStorageOperationReceipt {
  return receipt !== null
    && receipt.kind === RESET_KIND
    && (operationId === undefined || receipt.operationId === operationId);
}

function isVerifiedEmptyGeneration(
  verified: VerifiedHistoryGeneration,
  generationId: string,
  expectedDigest: string,
): boolean {
  return verified.generationId === generationId
    && verified.manifest.generationId === generationId
    && verified.manifest.verified
    && verified.manifest.sessionCount === 0
    && verified.sessions.length === 0
    && verified.manifest.orderedDigest === expectedDigest;
}

function buildEmptyTargetCoreRaw(
  generationId: string,
  savedAt: string,
): string | null {
  if (!isCanonicalIsoInstant(savedAt)) return null;
  const envelope: StorageEnvelope<PersistedCoreState> = {
    v: HYBRID_STORAGE_VERSION,
    savedAt,
    data: toPersistedCoreState(createEmptyPersistedState(), generationId),
  };
  let raw: string;
  try {
    raw = JSON.stringify(envelope);
  } catch {
    return null;
  }
  const parsed = parsePhysicalEnvelope(raw);
  if (
    parsed.status !== 'v2'
    || parsed.envelope.savedAt !== savedAt
    || parsed.envelope.data.historyStorage.generationId !== generationId
    || parsed.envelope.data.user !== null
    || parsed.envelope.data.weeklyPlan.length !== 0
    || parsed.envelope.data.customPrograms.length !== 0
    || parsed.envelope.data.activeWorkout !== null
    || parsed.envelope.data.weightHistory.length !== 0
    || parsed.envelope.data.measurementsHistory.length !== 0
    || parsed.envelope.data.favoriteExercises.length !== 0
  ) {
    return null;
  }
  return raw;
}

type CoreCommitOutcome =
  | 'committed'
  | 'storage-unavailable'
  | 'core-commit-failed'
  | 'recovery-required';

async function commitResetTargetCore(input: {
  adapter: LogicalResetAdapter;
  ownerLease: StorageAdminOwnerTokenLease;
  storage: StorageLike;
  key: string;
  receipt: ResetStorageOperationReceipt;
}): Promise<CoreCommitOutcome> {
  const { adapter, ownerLease, storage, key, receipt } = input;
  if (receipt.stagedGenerationId === null || receipt.targetCoreRaw === null) {
    return 'recovery-required';
  }
  const metadata = await adapter.readMetadata().catch(() => null);
  if (
    metadata === null
    || metadata.activeGeneration !== receipt.stagedGenerationId
    || metadata.migrationGeneration !== null
  ) {
    return 'recovery-required';
  }
  if (!coreNamesGeneration(receipt.targetCoreRaw, receipt.stagedGenerationId)) {
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
      await ownerLease.execute(() => storage.setItem(key, receipt.targetCoreRaw as string));
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

/**
 * Cria um mundo hybrid-v2 vazio e recuperavel, sem apagar a geracao anterior.
 *
 * Sequencia: administracao ready → journal → geracao vazia verificada →
 * activating → ativacao com CAS → commit do core vazio → readback →
 * activated → settled → diagnostico ready. Nenhuma primitiva de delete,
 * clear ou retencao participa deste fluxo.
 */
export async function commitLogicalStorageResetV2(
  input: CommitLogicalStorageResetV2Input,
): Promise<LogicalStorageResetV2Result> {
  const { runtime, adapter, storage, key } = input;
  const now = input.now ?? (() => new Date());

  const ownerToken = input.ownerToken ?? createStorageAdminOwnerTokenCoordinator({ key, storage });
  const operationId = ownerToken.createOperationId();
  const acquisition = ownerToken.acquire({ operationId, operationKind: RESET_KIND });
  if (acquisition.status === 'blocked') {
    return {
      ok: false,
      reason: 'owner-token-conflict',
      operationId: null,
      generationId: null,
      recoveryRequired: false,
    };
  }
  const ownerLease = acquisition.lease;
  let journalCreated = false;
  let generationId: string | null = null;

  const fail = (
    reason: LogicalResetFailureReason,
    knownGenerationId: string | null = generationId,
  ): LogicalStorageResetV2Result => ({
    ok: false,
    reason,
    operationId: journalCreated ? operationId : null,
    generationId: knownGenerationId,
    recoveryRequired: journalCreated,
  });

  try {
    const snapshot = await runtime.inspectStorageAdministration().catch(() => null);
    if (snapshot === null || snapshot.state.status !== 'ready') {
      return fail(snapshot?.state.status === 'unavailable'
        ? 'administration-unavailable'
        : 'operation-conflict');
    }
    if (
      snapshot.unsettledOperations.length !== 0
      || snapshot.pendingCompletionReceiptCount !== 0
      || snapshot.activeGenerationId === null
      || snapshot.coreRawObserved === null
      || snapshot.activeGenerationIntegrity?.status !== 'verified'
    ) {
      return fail('operation-conflict');
    }

    const previousGenerationId = snapshot.activeGenerationId;
    const previousCoreRaw = snapshot.coreRawObserved;

    const begun = await ownerLease.execute(() => runtime.beginStorageOperation({
      kind: RESET_KIND,
      sourceDigest: null,
      reservedOperationId: operationId,
      stagedGenerationId: null,
      targetCoreRaw: null,
    }));
    journalCreated = true;
    if (
      !isResetReceipt(begun, operationId)
      || begun.status !== 'staged'
      || begun.sourceDigest !== null
      || begun.previousCoreRaw !== previousCoreRaw
      || begun.previousGenerationId !== previousGenerationId
      || begun.stagedGenerationId !== null
      || begun.targetCoreRaw !== null
    ) {
      return fail('readback-failed');
    }
    await input.afterStep?.('journal-created');

    const staged = await ownerLease.execute(() => adapter.stageHistoryGenerationForOperation({
      operationId,
      expectedStatus: 'staged',
      expectedKind: RESET_KIND,
      expectedActiveGenerationId: previousGenerationId,
      history: EMPTY_HISTORY,
    }));
    generationId = staged.generationId;
    if (generationId === previousGenerationId) return fail('staging-failed');
    const stagedGenerationId = generationId;
    await input.afterStep?.('staging-created');

    const emptyDigest = await computeOrderedHistoryDigest(EMPTY_HISTORY);
    const verified = await adapter.readVerifiedHistoryGeneration(stagedGenerationId);
    if (!isVerifiedEmptyGeneration(verified, stagedGenerationId, emptyDigest)) {
      return fail('verification-failed');
    }

    const savedAt = now().toISOString();
    const targetCoreRaw = buildEmptyTargetCoreRaw(stagedGenerationId, savedAt);
    if (targetCoreRaw === null) return fail('core-commit-failed');

    const activating = await ownerLease.execute(() => runtime.transitionStorageOperation({
      operationId,
      expectedStatus: 'staged',
      nextStatus: 'activating',
      patch: { targetCoreRaw },
    }));
    if (
      !isResetReceipt(activating, operationId)
      || activating.status !== 'activating'
      || activating.stagedGenerationId !== stagedGenerationId
      || activating.targetCoreRaw !== targetCoreRaw
    ) {
      return fail('readback-failed');
    }
    await input.afterStep?.('activating');

    const activation = await ownerLease.execute(() => adapter.rollbackToHistoryGeneration({
      targetGenerationId: stagedGenerationId,
      expectedActiveGenerationId: previousGenerationId,
    }));
    if (activation.activeGeneration !== stagedGenerationId) return fail('activation-failed');
    await input.afterStep?.('generation-activated');

    const receiptBeforeCore = await adapter.readStorageOperationReceipt(operationId);
    if (!isResetReceipt(receiptBeforeCore, operationId)) return fail('readback-failed');
    const committed = await commitResetTargetCore({
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
        expectedActiveGenerationId: stagedGenerationId,
      })
    ));
    if (!isResetReceipt(activated, operationId) || activated.status !== 'activated') {
      return fail('readback-failed');
    }
    await input.afterStep?.('receipt-activated');

    const settled = await ownerLease.execute(() => runtime.transitionStorageOperation({
      operationId,
      expectedStatus: 'activated',
      nextStatus: 'settled',
    }));
    if (!isResetReceipt(settled, operationId) || settled.status !== 'settled') {
      return fail('readback-failed');
    }
    await input.afterStep?.('settled');

    const final = await runtime.inspectStorageAdministration();
    if (
      final.state.status !== 'ready'
      || final.activeGenerationId !== stagedGenerationId
      || final.coreRawObserved !== targetCoreRaw
      || final.unsettledOperations.length !== 0
      || final.activeGenerationIntegrity?.status !== 'verified'
    ) {
      return fail('recovery-required');
    }
    return {
      ok: true,
      operationId,
      generationId: stagedGenerationId,
      previousGenerationId,
    };
  } catch (error) {
    if (isStorageAdminOwnerTokenConflict(error)) return fail('owner-token-conflict');
    return fail(journalCreated ? 'recovery-required' : 'operation-conflict');
  } finally {
    ownerLease.release();
  }
}

export type LogicalResetGenerationIntegrity = 'verified' | 'invalid' | 'unknown';

export interface LogicalResetRecoveryObservation {
  receipt: StorageOperationReceipt | null;
  coreRaw: string | null;
  activeGeneration: string | null;
  migrationGeneration: string | null;
  migrationStatus: string;
  generations: readonly { generationId: string }[];
  previousGenerationIntegrity: LogicalResetGenerationIntegrity;
  stagedGenerationIntegrity: LogicalResetGenerationIntegrity;
  unsettledOperationCount: number;
  pendingCompletionReceiptCount: number;
}

export type LogicalResetRecoveryBlockedReason =
  | 'not-a-reset'
  | 'multiple-unsettled-operations'
  | 'completion-pending'
  | 'core-missing'
  | 'migration-incomplete'
  | 'unexpected-staging-pointer'
  | 'previous-generation-absent'
  | 'staged-generation-absent'
  | 'staged-generation-invalid'
  | 'previous-generation-invalid'
  | 'staged-generation-is-previous'
  | 'target-core-invalid'
  | 'core-divergent'
  | 'active-generation-divergent'
  | 'status-world-incompatible';

export type LogicalResetRecoveryDecision =
  | { action: 'no-operation' }
  | { action: 'already-settled'; operationId: string; status: 'settled' | 'reverted' }
  | { action: 'verify-previous'; operationId: string; generationId: string }
  | { action: 'verify-staging'; operationId: string; generationId: string }
  | { action: 'stage-empty-generation'; operationId: string; previousGenerationId: string }
  | { action: 'prepare-core'; operationId: string; generationId: string }
  | { action: 'advance-activating'; operationId: string }
  | {
      action: 'activate-generation';
      operationId: string;
      stagedGenerationId: string;
      previousGenerationId: string;
    }
  | { action: 'commit-core'; operationId: string; stagedGenerationId: string }
  | { action: 'mark-activated'; operationId: string; stagedGenerationId: string }
  | { action: 'settle'; operationId: string }
  | { action: 'recovery-required'; reason: LogicalResetRecoveryBlockedReason }
  | { action: 'blocked'; reason: LogicalResetRecoveryBlockedReason };

function recoveryRequired(
  reason: LogicalResetRecoveryBlockedReason,
): LogicalResetRecoveryDecision {
  return { action: 'recovery-required', reason };
}

function recoveryBlocked(
  reason: LogicalResetRecoveryBlockedReason,
): LogicalResetRecoveryDecision {
  return { action: 'blocked', reason };
}

export function resolveLogicalResetRecovery(
  observation: LogicalResetRecoveryObservation,
): LogicalResetRecoveryDecision {
  const receipt = observation.receipt;
  if (receipt === null) return { action: 'no-operation' };
  if (receipt.kind !== RESET_KIND) return recoveryBlocked('not-a-reset');
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
  const staged = receipt.stagedGenerationId;
  if (staged !== null && !known.has(staged)) {
    return recoveryBlocked('staged-generation-absent');
  }
  if (staged !== null && staged === receipt.previousGenerationId) {
    return recoveryBlocked('staged-generation-is-previous');
  }
  if (receipt.targetCoreRaw !== null && staged !== null) {
    if (!coreNamesGeneration(receipt.targetCoreRaw, staged)) {
      return recoveryBlocked('target-core-invalid');
    }
  }

  const coreIsPrevious = observation.coreRaw === receipt.previousCoreRaw;
  const coreIsTarget = receipt.targetCoreRaw !== null
    && observation.coreRaw === receipt.targetCoreRaw;
  const activeIsPrevious = observation.activeGeneration === receipt.previousGenerationId;
  const activeIsStaged = staged !== null && observation.activeGeneration === staged;
  if (!coreIsPrevious && !coreIsTarget) return recoveryBlocked('core-divergent');
  if (!activeIsPrevious && !activeIsStaged) {
    return recoveryBlocked('active-generation-divergent');
  }

  if (receipt.status === 'settled' || receipt.status === 'reverted') {
    const terminalWorld = receipt.status === 'settled'
      ? activeIsStaged && coreIsTarget
      : activeIsPrevious && coreIsPrevious;
    if (!terminalWorld) return recoveryBlocked('status-world-incompatible');
    const integrity = receipt.status === 'settled'
      ? observation.stagedGenerationIntegrity
      : observation.previousGenerationIntegrity;
    if (integrity === 'invalid') {
      return recoveryBlocked(receipt.status === 'settled'
        ? 'staged-generation-invalid'
        : 'previous-generation-invalid');
    }
    if (integrity === 'unknown') {
      return receipt.status === 'settled' && staged !== null
        ? { action: 'verify-staging', operationId: receipt.operationId, generationId: staged }
        : {
            action: 'verify-previous',
            operationId: receipt.operationId,
            generationId: receipt.previousGenerationId,
          };
    }
    return { action: 'already-settled', operationId: receipt.operationId, status: receipt.status };
  }

  if (receipt.status === 'staged') {
    if (!activeIsPrevious || !coreIsPrevious) {
      return recoveryBlocked('status-world-incompatible');
    }
    if (observation.previousGenerationIntegrity === 'invalid') {
      return recoveryBlocked('previous-generation-invalid');
    }
    if (observation.previousGenerationIntegrity === 'unknown') {
      return {
        action: 'verify-previous',
        operationId: receipt.operationId,
        generationId: receipt.previousGenerationId,
      };
    }
    if (staged === null) {
      return {
        action: 'stage-empty-generation',
        operationId: receipt.operationId,
        previousGenerationId: receipt.previousGenerationId,
      };
    }
    if (observation.stagedGenerationIntegrity === 'invalid') {
      return recoveryBlocked('staged-generation-invalid');
    }
    if (observation.stagedGenerationIntegrity === 'unknown') {
      return { action: 'verify-staging', operationId: receipt.operationId, generationId: staged };
    }
    if (receipt.targetCoreRaw === null) {
      return { action: 'prepare-core', operationId: receipt.operationId, generationId: staged };
    }
    return { action: 'advance-activating', operationId: receipt.operationId };
  }

  if (activeIsPrevious && coreIsTarget) {
    return recoveryBlocked('status-world-incompatible');
  }
  if (staged !== null) {
    if (observation.stagedGenerationIntegrity === 'invalid') {
      return recoveryBlocked('staged-generation-invalid');
    }
    if (observation.stagedGenerationIntegrity === 'unknown') {
      return { action: 'verify-staging', operationId: receipt.operationId, generationId: staged };
    }
  }

  if (receipt.status === 'activating') {
    if (staged === null || receipt.targetCoreRaw === null) {
      return recoveryBlocked('status-world-incompatible');
    }
    if (activeIsPrevious && coreIsPrevious) {
      return {
        action: 'activate-generation',
        operationId: receipt.operationId,
        stagedGenerationId: staged,
        previousGenerationId: receipt.previousGenerationId,
      };
    }
    if (activeIsStaged && coreIsPrevious) {
      return {
        action: 'commit-core',
        operationId: receipt.operationId,
        stagedGenerationId: staged,
      };
    }
    if (activeIsStaged && coreIsTarget) {
      return {
        action: 'mark-activated',
        operationId: receipt.operationId,
        stagedGenerationId: staged,
      };
    }
  }
  if (receipt.status === 'activated' && activeIsStaged && coreIsTarget && staged !== null) {
    return { action: 'settle', operationId: receipt.operationId };
  }
  return recoveryBlocked('status-world-incompatible');
}

export type LogicalResetRecoveryFailureReason =
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

export type LogicalStorageResetRecoveryResult =
  | {
      ok: true;
      status: 'no-operation' | 'settled' | 'reverted' | 'already-settled' | 'already-reverted';
      operationId: string | null;
      generationId: string | null;
      steps: number;
      finalAction: LogicalResetRecoveryDecision['action'] | 'observe';
      recoveryRequired: false;
      cleanupPending: false;
    }
  | {
      ok: false;
      reason: LogicalResetRecoveryFailureReason;
      error: string;
      operationId: string | null;
      generationId: string | null;
      steps: number;
      finalAction: LogicalResetRecoveryDecision['action'] | 'observe';
      recoveryRequired: true;
      cleanupPending: false;
    };

export interface RecoverLogicalStorageResetV2Input {
  runtime: LogicalResetRuntime;
  adapter: LogicalResetAdapter;
  storage: StorageLike;
  key: string;
  operationId?: string;
  ownerToken?: StorageAdminOwnerTokenCoordinator;
  now?: () => Date;
}

function findReceipt(
  snapshot: StorageAdministrationSnapshotRead,
  operationId: string,
): StorageOperationReceipt | null {
  return snapshot.operationReceipts.find((entry) => entry.operationId === operationId) ?? null;
}

function selectResetReceipt(
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

export async function recoverLogicalStorageResetV2(
  input: RecoverLogicalStorageResetV2Input,
): Promise<LogicalStorageResetRecoveryResult> {
  const now = input.now ?? (() => new Date());
  const ownerToken = input.ownerToken ?? createStorageAdminOwnerTokenCoordinator({
    key: input.key,
    storage: input.storage,
  });
  let steps = 0;
  let operationId: string | null = input.operationId ?? null;
  let generationId: string | null = null;
  let outcome: 'settled' | 'reverted' | null = null;
  let lease: StorageAdminOwnerTokenLease | null = null;
  const proofs = new Map<string, { fingerprint: string; integrity: LogicalResetGenerationIntegrity }>();

  const fail = (
    reason: LogicalResetRecoveryFailureReason,
    finalAction: LogicalResetRecoveryDecision['action'] | 'observe',
  ): LogicalStorageResetRecoveryResult => ({
    ok: false,
    reason,
    error: 'A recuperacao do reset nao pode ser comprovada; o journal foi preservado.',
    operationId,
    generationId,
    steps,
    finalAction,
    recoveryRequired: true,
    cleanupPending: false,
  });
  const succeed = (
    status: 'no-operation' | 'settled' | 'reverted' | 'already-settled' | 'already-reverted',
    finalAction: LogicalResetRecoveryDecision['action'],
  ): LogicalStorageResetRecoveryResult => ({
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
      const selected = selectResetReceipt(snapshot, input.operationId ?? operationId ?? undefined);
      if (selected === 'conflict') return fail('operation-conflict', 'observe');
      const receipt = selected;
      if (receipt !== null) {
        operationId = receipt.operationId;
        if (receipt.kind === RESET_KIND) generationId = receipt.stagedGenerationId;
        if (!isTerminalStorageOperationStatus(receipt.status) && lease === null) {
          if (receipt.kind !== RESET_KIND) return fail('operation-conflict', 'observe');
          const acquired = ownerToken.acquire({
            operationId: receipt.operationId,
            operationKind: RESET_KIND,
          });
          if (acquired.status === 'blocked') return fail('owner-token-conflict', 'observe');
          lease = acquired.lease;
        }
      }

      const core = readRaw(input.storage, input.key);
      if (!core.ok) return fail('storage-unavailable', 'observe');
      const integrityOf = (id: string | null): LogicalResetGenerationIntegrity => {
        if (id === null) return 'unknown';
        const proof = proofs.get(id);
        return proof?.fingerprint === snapshot.fingerprint ? proof.integrity : 'unknown';
      };
      const decision = resolveLogicalResetRecovery({
        receipt,
        coreRaw: core.raw,
        activeGeneration: snapshot.metadata.activeGeneration,
        migrationGeneration: snapshot.metadata.migrationGeneration,
        migrationStatus: snapshot.metadata.migrationStatus,
        generations: snapshot.generations,
        previousGenerationIntegrity: integrityOf(receipt?.previousGenerationId ?? null),
        stagedGenerationIntegrity: integrityOf(
          receipt?.kind === RESET_KIND ? receipt.stagedGenerationId : null,
        ),
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
        case 'verify-staging': {
          const verified = await input.adapter
            .readVerifiedHistoryGeneration(decision.generationId)
            .catch(() => null);
          let integrity: LogicalResetGenerationIntegrity = 'invalid';
          if (
            verified !== null
            && verified.generationId === decision.generationId
            && verified.manifest.generationId === decision.generationId
            && verified.manifest.verified
          ) {
            if (decision.action === 'verify-staging') {
              const emptyDigest = await computeOrderedHistoryDigest(EMPTY_HISTORY).catch(() => null);
              integrity = emptyDigest !== null
                && isVerifiedEmptyGeneration(verified, decision.generationId, emptyDigest)
                ? 'verified'
                : 'invalid';
            } else {
              integrity = 'verified';
            }
          }
          proofs.set(decision.generationId, {
            fingerprint: snapshot.fingerprint,
            integrity,
          });
          continue;
        }
        case 'stage-empty-generation': {
          if (lease === null) return fail('owner-token-conflict', decision.action);
          const staged = await lease.execute(() => input.adapter.stageHistoryGenerationForOperation({
            operationId: decision.operationId,
            expectedStatus: 'staged',
            expectedKind: RESET_KIND,
            expectedActiveGenerationId: decision.previousGenerationId,
            history: EMPTY_HISTORY,
          }));
          generationId = staged.generationId;
          continue;
        }
        case 'prepare-core': {
          if (lease === null) return fail('owner-token-conflict', decision.action);
          const current = await input.adapter.readStorageOperationReceipt(decision.operationId);
          if (!isResetReceipt(current, decision.operationId) || current.status !== 'staged') {
            return fail('readback-failed', decision.action);
          }
          const existingTarget = current.targetCoreRaw;
          const targetCoreRaw = existingTarget !== null
            && current.stagedGenerationId === decision.generationId
            && coreNamesGeneration(existingTarget, decision.generationId)
            ? existingTarget
            : buildEmptyTargetCoreRaw(decision.generationId, now().toISOString());
          if (targetCoreRaw === null) return fail('core-commit-failed', decision.action);
          const activating = await lease.execute(() => input.runtime.transitionStorageOperation({
            operationId: decision.operationId,
            expectedStatus: 'staged',
            nextStatus: 'activating',
            patch: { targetCoreRaw },
          }));
          if (activating.status !== 'activating') return fail('readback-failed', decision.action);
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
            targetGenerationId: decision.stagedGenerationId,
            expectedActiveGenerationId: decision.previousGenerationId,
          }));
          if (activation.activeGeneration !== decision.stagedGenerationId) {
            return fail('activation-failed', decision.action);
          }
          continue;
        }
        case 'commit-core': {
          if (lease === null) return fail('owner-token-conflict', decision.action);
          const current = await input.adapter.readStorageOperationReceipt(decision.operationId);
          if (!isResetReceipt(current, decision.operationId)) {
            return fail('readback-failed', decision.action);
          }
          const committed = await commitResetTargetCore({
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
              expectedActiveGenerationId: decision.stagedGenerationId,
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
