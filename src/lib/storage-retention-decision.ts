import type { StorageRetentionEvidence } from './storage-retention-evidence';
import type { StorageRetentionPlan } from './storage-retention';

// GOAL-17B-002D-D2 / GOAL-17B-002E-E7A5 — composição pura da decisão de retenção.
//
// O planner estrutural e a evidência física já removeram identidades de suas
// saídas públicas. Esta camada preserva essa fronteira: combina somente enums,
// booleanos e contagens e nunca escolhe qual geração seria uma candidata.
// A política de produto E7A5 é MANUAL: históricas não selecionadas por um
// humano permanecem protegidas. Não existe keep-N, escolha por idade/espaço
// nem candidatura automática. futureDeleteCandidate permanece 0 aqui porque
// esta função não recebe seleção humana.

export type StorageRetentionDecisionStatus =
  | 'decision-ready'
  | 'blocked-snapshot-unstable'
  | 'blocked-physical-unverified'
  | 'blocked-structural-conflict'
  | 'blocked-active-or-migration-reference'
  | 'blocked-operation-receipt'
  | 'blocked-completion-receipt'
  | 'blocked-boot-proof-missing'
  | 'blocked-insufficient-previous-generation'
  | 'blocked-unknown-state';

export type StorageRetentionDecisionReason =
  | 'retention-classified'
  | 'snapshot-unstable'
  | 'physical-proof-missing'
  | 'structural-conflict'
  | 'active-or-migration-reference'
  | 'operation-receipt-present'
  | 'completion-receipt-present'
  | 'boot-proof-missing'
  | 'previous-generation-missing'
  | 'unknown-state';

export interface StorageRetentionDecisionCounts {
  readonly evaluated: number;
  readonly keep: number;
  readonly protected: number;
  readonly futureDeleteCandidate: number;
}

interface StorageRetentionDecisionBase {
  readonly reason: StorageRetentionDecisionReason;
  readonly generations: StorageRetentionDecisionCounts;
  readonly bootProofVerified: boolean;
  readonly ownerTokenRequired: true;
  readonly executionAuthorized: false;
  readonly deleteAuthorized: false;
}

export interface StorageRetentionDecisionReady extends StorageRetentionDecisionBase {
  readonly status: 'decision-ready';
  readonly reason: 'retention-classified';
  readonly bootProofVerified: true;
}

export interface StorageRetentionDecisionBlocked extends StorageRetentionDecisionBase {
  readonly status: Exclude<StorageRetentionDecisionStatus, 'decision-ready'>;
  readonly reason: Exclude<StorageRetentionDecisionReason, 'retention-classified'>;
}

export type StorageRetentionDecision =
  | StorageRetentionDecisionReady
  | StorageRetentionDecisionBlocked;

export interface DecideStorageRetentionInput {
  readonly plan: unknown;
  readonly evidence: unknown;
  readonly boot: unknown;
  // Uma instalação nova pode não possuir geração anterior. Quando o ciclo de
  // vida exige uma reserva de rollback, a ausência precisa ficar explícita e
  // bloquear — nunca é inferida de timestamps ou ids.
  readonly rollbackReserveRequired: unknown;
}

const PLAN_STATUSES = new Set(['policy-required', 'blocked']);
const PLAN_REASONS = new Set([
  'policy-required',
  'snapshot-invalid',
  'operation-receipt-present',
  'completion-receipt-present',
  'cleanup-pending',
  'physical-proof-required',
]);
const EVIDENCE_STATUSES = new Set(['inspected', 'blocked']);
const EVIDENCE_REASONS = new Set([
  'evidence-collected',
  'storage-read-failed',
  'physical-proof-unavailable',
  'snapshot-invalid',
  'snapshot-unstable',
  'structurally-conflicted',
]);
const READY_BOOT_STATUSES = new Set([
  'ready-no-operation',
  'ready-after-settled',
  'ready-after-reverted',
]);
const BLOCKED_BOOT_STATUSES = new Set([
  'blocked-operation-conflict',
  'blocked-recovery-required',
  'blocked-storage-unavailable',
  'blocked-administration-conflicted',
  'blocked-step-limit',
]);

const GENERATION_COUNT_KEYS = [
  'observed',
  'evaluated',
  'active',
  'migration',
  'historical',
  'orphan',
  'complete',
  'incomplete',
  'structurallyConflicted',
  'physicallyVerified',
  'physicallyUnverified',
  'missingReferenced',
] as const;

const REFERENCE_COUNT_KEYS = [
  'activePointers',
  'migrationPointers',
  'operationReceipts',
  'unsettledOperationReceipts',
  'pendingCompletionReceipts',
  'operationProtectedGenerations',
  'completionProtectedGenerations',
] as const;

const ANOMALY_COUNT_KEYS = [
  'missingManifests',
  'duplicateManifests',
  'duplicateGenerationSummaries',
  'danglingPointers',
  'danglingReceiptReferences',
  'multipleActiveGenerations',
  'multipleMigrationGenerations',
  'summaryManifestConflicts',
  'malformedEntries',
  'verificationFailures',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function hasNonNegativeIntegerCounts<K extends string>(
  value: unknown,
  keys: readonly K[],
): value is Record<K, number> {
  if (!isRecord(value) || !hasExactKeys(value, keys)) return false;
  return keys.every((key) => isNonNegativeInteger(value[key]));
}

function isPlan(value: unknown): value is StorageRetentionPlan {
  if (!isRecord(value) || !hasExactKeys(value, ['status', 'reason', 'delete'])) {
    return false;
  }
  if (
    typeof value.status !== 'string'
    || !PLAN_STATUSES.has(value.status)
    || typeof value.reason !== 'string'
    || !PLAN_REASONS.has(value.reason)
    || !Array.isArray(value.delete)
    || value.delete.length !== 0
  ) {
    return false;
  }
  return value.status === 'policy-required'
    ? value.reason === 'policy-required'
    : value.reason !== 'policy-required';
}

function isEvidence(value: unknown): value is StorageRetentionEvidence {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      'status',
      'reason',
      'generations',
      'references',
      'anomalies',
    ])
    || typeof value.status !== 'string'
    || !EVIDENCE_STATUSES.has(value.status)
    || typeof value.reason !== 'string'
    || !EVIDENCE_REASONS.has(value.reason)
    || !hasNonNegativeIntegerCounts(value.generations, GENERATION_COUNT_KEYS)
    || !hasNonNegativeIntegerCounts(value.references, REFERENCE_COUNT_KEYS)
    || !hasNonNegativeIntegerCounts(value.anomalies, ANOMALY_COUNT_KEYS)
  ) {
    return false;
  }

  if (
    (value.status === 'inspected' && value.reason !== 'evidence-collected')
    || (value.status === 'blocked' && value.reason === 'evidence-collected')
  ) {
    return false;
  }

  const generations = value.generations;
  const references = value.references;
  const anomalies = value.anomalies;
  return generations.observed <= generations.evaluated
    && generations.active + generations.migration + generations.historical
      === generations.evaluated
    && generations.complete
      + generations.incomplete
      + generations.structurallyConflicted
      === generations.evaluated
    && generations.physicallyVerified + generations.physicallyUnverified
      === generations.evaluated
    && generations.orphan <= generations.historical
    && generations.missingReferenced <= generations.evaluated
    && references.activePointers <= 1
    && references.migrationPointers <= 1
    && references.operationProtectedGenerations <= generations.evaluated
    && references.completionProtectedGenerations <= generations.evaluated
    && anomalies.verificationFailures === generations.physicallyUnverified;
}

function isRecognizedBoot(value: unknown): boolean {
  if (!isRecord(value) || typeof value.status !== 'string') return false;

  if (READY_BOOT_STATUSES.has(value.status)) {
    return hasExactKeys(value, ['status', 'hydrationAllowed', 'cleanupPending'])
      && value.hydrationAllowed === true
      && typeof value.cleanupPending === 'boolean';
  }

  if (value.status === 'ready-for-blocked-storage-classification') {
    return hasExactKeys(value, [
      'status',
      'hydrationAllowed',
      'blockedStorageClassificationAllowed',
      'cleanupPending',
    ])
      && value.hydrationAllowed === false
      && value.blockedStorageClassificationAllowed === true
      && value.cleanupPending === false;
  }

  if (!BLOCKED_BOOT_STATUSES.has(value.status)) return false;
  const keys = Object.keys(value).sort();
  const withoutPhysicalVersion = [
    'status',
    'hydrationAllowed',
    'cleanupPending',
    'message',
  ].sort();
  const withPhysicalVersion = [...withoutPhysicalVersion, 'physicalVersion'].sort();
  const keysRecognized = (
    keys.length === withoutPhysicalVersion.length
    && keys.every((key, index) => key === withoutPhysicalVersion[index])
  ) || (
    keys.length === withPhysicalVersion.length
    && keys.every((key, index) => key === withPhysicalVersion[index])
  );
  return keysRecognized
    && value.hydrationAllowed === false
    && typeof value.cleanupPending === 'boolean'
    && typeof value.message === 'string'
    && (
      !Object.prototype.hasOwnProperty.call(value, 'physicalVersion')
      || isNonNegativeInteger(value.physicalVersion)
    );
}

function isSuccessfulBoot(value: unknown): boolean {
  return isRecord(value)
    && typeof value.status === 'string'
    && READY_BOOT_STATUSES.has(value.status)
    && value.hydrationAllowed === true
    && value.cleanupPending === false;
}

function freezeCounts(
  evaluated: number,
  keep: number,
  protectedCount: number,
  futureDeleteCandidate: number,
): StorageRetentionDecisionCounts {
  return Object.freeze({
    evaluated,
    keep,
    protected: protectedCount,
    futureDeleteCandidate,
  });
}

function preservationCounts(
  evidence?: StorageRetentionEvidence,
): StorageRetentionDecisionCounts {
  if (!evidence) return freezeCounts(0, 0, 0, 0);
  const evaluated = evidence.generations.evaluated;
  const keep = Math.min(evidence.generations.active, evaluated);
  return freezeCounts(evaluated, keep, evaluated - keep, 0);
}

function blocked(
  status: Exclude<StorageRetentionDecisionStatus, 'decision-ready'>,
  reason: Exclude<StorageRetentionDecisionReason, 'retention-classified'>,
  evidence?: StorageRetentionEvidence,
  bootProofVerified = false,
): StorageRetentionDecisionBlocked {
  return Object.freeze({
    status,
    reason,
    generations: preservationCounts(evidence),
    bootProofVerified,
    ownerTokenRequired: true,
    executionAuthorized: false,
    deleteAuthorized: false,
  });
}

function ready(
  evidence: StorageRetentionEvidence,
): StorageRetentionDecisionReady {
  const historical = evidence.generations.historical;
  return Object.freeze({
    status: 'decision-ready',
    reason: 'retention-classified',
    generations: freezeCounts(
      evidence.generations.evaluated,
      1,
      historical,
      0,
    ),
    bootProofVerified: true,
    ownerTokenRequired: true,
    executionAuthorized: false,
    deleteAuthorized: false,
  });
}

function hasStructuralAnomaly(evidence: StorageRetentionEvidence): boolean {
  const generations = evidence.generations;
  const anomalies = evidence.anomalies;
  return generations.structurallyConflicted > 0
    || anomalies.duplicateManifests > 0
    || anomalies.duplicateGenerationSummaries > 0
    || anomalies.danglingPointers > 0
    || anomalies.danglingReceiptReferences > 0
    || anomalies.multipleActiveGenerations > 0
    || anomalies.multipleMigrationGenerations > 0
    || anomalies.summaryManifestConflicts > 0
    || anomalies.malformedEntries > 0;
}

function activeAndMigrationCollide(evidence: StorageRetentionEvidence): boolean {
  const generations = evidence.generations;
  const references = evidence.references;
  return references.activePointers > 0
    && references.migrationPointers > 0
    && generations.active + generations.migration
      < references.activePointers + references.migrationPointers;
}

/**
 * Combina contratos já sanitizados. Não abre storage, não seleciona ids e não
 * autoriza execução: a política de produto exige seleção humana explícita de
 * no máximo uma geração, preview sanitizado e confirmação futura separada.
 * Qualquer executor ainda precisará de owner-token, prova e revalidação
 * imediatamente antes da mutação.
 */
export function decideStorageRetention(
  input: DecideStorageRetentionInput,
): StorageRetentionDecision {
  try {
    if (
      !isRecord(input)
      || !hasExactKeys(input, [
        'plan',
        'evidence',
        'boot',
        'rollbackReserveRequired',
      ])
      || !isPlan(input.plan)
      || !isEvidence(input.evidence)
      || !isRecognizedBoot(input.boot)
      || typeof input.rollbackReserveRequired !== 'boolean'
    ) {
      return blocked('blocked-unknown-state', 'unknown-state');
    }

    const plan = input.plan;
    const evidence = input.evidence;
    const generations = evidence.generations;
    const references = evidence.references;
    const bootVerified = isSuccessfulBoot(input.boot);

    if (evidence.reason === 'snapshot-unstable') {
      return blocked(
        'blocked-snapshot-unstable',
        'snapshot-unstable',
        evidence,
        bootVerified,
      );
    }

    if (
      generations.migration > 0
      || references.migrationPointers > 0
      || activeAndMigrationCollide(evidence)
    ) {
      return blocked(
        'blocked-active-or-migration-reference',
        'active-or-migration-reference',
        evidence,
        bootVerified,
      );
    }

    if (
      references.unsettledOperationReceipts > 0
      || plan.reason === 'operation-receipt-present'
    ) {
      return blocked(
        'blocked-operation-receipt',
        'operation-receipt-present',
        evidence,
        bootVerified,
      );
    }

    if (
      references.pendingCompletionReceipts > 0
      || references.completionProtectedGenerations > 0
      || plan.reason === 'completion-receipt-present'
    ) {
      return blocked(
        'blocked-completion-receipt',
        'completion-receipt-present',
        evidence,
        bootVerified,
      );
    }

    if (
      evidence.reason === 'structurally-conflicted'
      || hasStructuralAnomaly(evidence)
    ) {
      return blocked(
        'blocked-structural-conflict',
        'structural-conflict',
        evidence,
        bootVerified,
      );
    }

    if (
      evidence.reason === 'physical-proof-unavailable'
      || generations.physicallyUnverified > 0
      || generations.incomplete > 0
      || evidence.anomalies.missingManifests > 0
      || evidence.anomalies.verificationFailures > 0
    ) {
      return blocked(
        'blocked-physical-unverified',
        'physical-proof-missing',
        evidence,
        bootVerified,
      );
    }

    if (
      evidence.status !== 'inspected'
      || evidence.reason !== 'evidence-collected'
    ) {
      return blocked(
        'blocked-unknown-state',
        'unknown-state',
        evidence,
        bootVerified,
      );
    }

    if (!bootVerified) {
      return blocked(
        'blocked-boot-proof-missing',
        'boot-proof-missing',
        evidence,
      );
    }

    const safeEvidence = generations.active === 1
      && references.activePointers === 1
      && generations.migration === 0
      && references.migrationPointers === 0
      && generations.observed === generations.evaluated
      && generations.complete === generations.evaluated
      && generations.physicallyVerified === generations.evaluated
      && generations.structurallyConflicted === 0
      && generations.physicallyUnverified === 0
      && generations.missingReferenced === 0
      && generations.orphan <= generations.historical;
    if (!safeEvidence) {
      return blocked(
        'blocked-unknown-state',
        'unknown-state',
        evidence,
        true,
      );
    }

    const plannerMatches = plan.status === 'policy-required'
      ? generations.evaluated === 1 && generations.historical === 0
      : plan.reason === 'physical-proof-required'
        && generations.evaluated > 1
        && generations.historical > 0;
    if (!plannerMatches) {
      return blocked(
        'blocked-unknown-state',
        'unknown-state',
        evidence,
        true,
      );
    }

    if (
      input.rollbackReserveRequired
      && generations.historical === 0
    ) {
      return blocked(
        'blocked-insufficient-previous-generation',
        'previous-generation-missing',
        evidence,
        true,
      );
    }

    return ready(evidence);
  } catch {
    return blocked('blocked-unknown-state', 'unknown-state');
  }
}
