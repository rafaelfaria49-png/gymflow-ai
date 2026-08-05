import {
  inspectStorageAdminOwnerToken,
  type StorageAdminOwnerTokenInspectionStatus,
} from './storage-admin-owner-token';
import type {
  StorageAdministrationSnapshot,
  StorageAdminRuntime,
} from './storage-admin-runtime';
import type { StorageBootRecoveryOutcome } from './storage-boot-recovery';
import {
  inspectStorageRetentionEvidence,
  type InspectStorageRetentionEvidenceOptions,
  type StorageRetentionEvidence,
  type StorageRetentionEvidenceReader,
} from './storage-retention-evidence';
import {
  decideStorageRetention,
  type DecideStorageRetentionInput,
  type StorageRetentionDecision,
} from './storage-retention-decision';
import {
  planStorageRetention,
  type StorageRetentionPlan,
} from './storage-retention';
import type { StorageLike } from './storage-types';

// Fachada estritamente read-only da saúde administrativa. Ela compõe contratos
// já existentes, mas sua saída pública nunca carrega ids, timestamps, digests,
// fingerprints, manifests, receipts, conteúdo bruto, dados do usuário ou erros.

export type StorageAdminOverallStatus =
  | 'healthy'
  | 'attention'
  | 'blocked'
  | 'unavailable';

export type StorageAdminBootStatus = 'ready' | 'blocked' | 'unknown';
export type StorageAdminReceiptsStatus = 'present' | 'absent' | 'conflicted';
export type StorageAdminEvidenceStatus =
  | 'verified'
  | 'unverified'
  | 'unstable'
  | 'conflicted';
export type StorageAdminRetentionStatus = 'ready' | 'blocked';

export interface StorageAdminAggregatedCounts {
  readonly observed: number;
  readonly evaluated: number;
  readonly active: number;
  readonly migration: number;
  readonly historical: number;
}

export interface StorageAdminRetentionSummary {
  readonly status: StorageAdminRetentionStatus;
  readonly keep: number;
  readonly protected: number;
  readonly futureDeleteCandidate: number;
}

export interface StorageAdminStatus {
  readonly overall: StorageAdminOverallStatus;
  readonly boot: StorageAdminBootStatus;
  readonly storage: StorageAdminAggregatedCounts;
  readonly receipts: StorageAdminReceiptsStatus;
  readonly evidence: StorageAdminEvidenceStatus;
  readonly retention: StorageAdminRetentionSummary;
  readonly ownerToken: StorageAdminOwnerTokenInspectionStatus;
  readonly executionAuthorized: false;
  readonly deleteAuthorized: false;
}

interface StorageAdminStatusDependencies {
  readonly inspectEvidence: (
    options: InspectStorageRetentionEvidenceOptions,
  ) => Promise<StorageRetentionEvidence>;
  readonly planRetention: (snapshot: unknown) => StorageRetentionPlan;
  readonly decideRetention: (
    input: DecideStorageRetentionInput,
  ) => StorageRetentionDecision;
  readonly inspectOwnerToken: typeof inspectStorageAdminOwnerToken;
}

export interface CreateStorageAdminStatusReaderOptions {
  readonly runtime: Pick<StorageAdminRuntime, 'inspectStorageAdministration'>;
  readonly evidenceReader: StorageRetentionEvidenceReader;
  readonly storage: Pick<StorageLike, 'getItem'>;
  readonly key: string;
  readonly getBootOutcome: () => StorageBootRecoveryOutcome | null | undefined;
  readonly rollbackReserveRequired: boolean;
  readonly subtleCrypto?: SubtleCrypto | null;
  // Costura exclusivamente de contrato/teste: todas as dependências continuam
  // recebendo somente capacidades de leitura ou valores já sanitizados.
  readonly dependencies?: Partial<StorageAdminStatusDependencies>;
}

export interface StorageAdminStatusReader {
  inspect(): Promise<StorageAdminStatus>;
}

const READY_BOOT_STATUSES = new Set([
  'ready-no-operation',
  'ready-after-settled',
  'ready-after-reverted',
]);

const BLOCKED_BOOT_STATUSES = new Set([
  'ready-for-blocked-storage-classification',
  'blocked-operation-conflict',
  'blocked-recovery-required',
  'blocked-storage-unavailable',
  'blocked-administration-conflicted',
  'blocked-step-limit',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function classifyBoot(value: unknown): StorageAdminBootStatus {
  if (!isRecord(value) || typeof value.status !== 'string') return 'unknown';
  if (
    READY_BOOT_STATUSES.has(value.status)
    && value.hydrationAllowed === true
    && typeof value.cleanupPending === 'boolean'
  ) {
    return 'ready';
  }
  if (
    BLOCKED_BOOT_STATUSES.has(value.status)
    && value.hydrationAllowed === false
  ) {
    return 'blocked';
  }
  return 'unknown';
}

function classifyEvidence(
  evidence: StorageRetentionEvidence,
): StorageAdminEvidenceStatus {
  if (evidence.reason === 'snapshot-unstable') return 'unstable';
  if (
    evidence.reason === 'structurally-conflicted'
    || evidence.generations.structurallyConflicted > 0
  ) {
    return 'conflicted';
  }
  if (
    evidence.status === 'inspected'
    && evidence.reason === 'evidence-collected'
    && evidence.generations.physicallyUnverified === 0
    && evidence.anomalies.verificationFailures === 0
  ) {
    return 'verified';
  }
  return 'unverified';
}

function classifyReceipts(
  administration: StorageAdministrationSnapshot,
  evidence: StorageRetentionEvidence,
): StorageAdminReceiptsStatus {
  const operationCount = evidence.references.operationReceipts
    + evidence.references.unsettledOperationReceipts
    + evidence.references.pendingCompletionReceipts;
  if (
    administration.state.status === 'conflicted'
    || evidence.reason === 'snapshot-invalid'
    || evidence.reason === 'snapshot-unstable'
    || evidence.reason === 'structurally-conflicted'
  ) {
    return 'conflicted';
  }
  if (
    operationCount > 0
    || administration.unsettledOperations.length > 0
    || administration.pendingCompletionReceiptCount > 0
  ) {
    return 'present';
  }
  return evidence.status === 'inspected' ? 'absent' : 'conflicted';
}

function freezeStatus(input: {
  overall: StorageAdminOverallStatus;
  boot: StorageAdminBootStatus;
  storage: StorageAdminAggregatedCounts;
  receipts: StorageAdminReceiptsStatus;
  evidence: StorageAdminEvidenceStatus;
  retention: StorageAdminRetentionSummary;
  ownerToken: StorageAdminOwnerTokenInspectionStatus;
}): StorageAdminStatus {
  return Object.freeze({
    overall: input.overall,
    boot: input.boot,
    storage: Object.freeze({ ...input.storage }),
    receipts: input.receipts,
    evidence: input.evidence,
    retention: Object.freeze({ ...input.retention }),
    ownerToken: input.ownerToken,
    executionAuthorized: false,
    deleteAuthorized: false,
  });
}

export function createUnavailableStorageAdminStatus(): StorageAdminStatus {
  return freezeStatus({
    overall: 'unavailable',
    boot: 'unknown',
    storage: {
      observed: 0,
      evaluated: 0,
      active: 0,
      migration: 0,
      historical: 0,
    },
    receipts: 'conflicted',
    evidence: 'unverified',
    retention: {
      status: 'blocked',
      keep: 0,
      protected: 0,
      futureDeleteCandidate: 0,
    },
    ownerToken: 'unavailable',
  });
}

function classifyOverall(input: {
  administration: StorageAdministrationSnapshot;
  boot: StorageAdminBootStatus;
  receipts: StorageAdminReceiptsStatus;
  evidence: StorageAdminEvidenceStatus;
  retention: StorageAdminRetentionStatus;
  ownerToken: StorageAdminOwnerTokenInspectionStatus;
  evidenceReason: StorageRetentionEvidence['reason'];
}): StorageAdminOverallStatus {
  if (
    input.administration.state.status === 'unavailable'
    || input.evidenceReason === 'storage-read-failed'
    || input.ownerToken === 'unavailable'
  ) {
    return 'unavailable';
  }
  if (
    input.boot !== 'ready'
    || input.administration.state.status === 'conflicted'
    || input.receipts === 'conflicted'
    || input.evidence === 'unstable'
    || input.evidence === 'conflicted'
    || input.ownerToken === 'malformed'
  ) {
    return 'blocked';
  }
  if (
    input.administration.state.status === 'interrupted'
    || input.receipts === 'present'
    || input.evidence !== 'verified'
    || input.retention !== 'ready'
    || input.ownerToken === 'busy'
    || input.ownerToken === 'expired'
  ) {
    return 'attention';
  }
  return 'healthy';
}

async function inspectStorageAdminStatus(
  options: CreateStorageAdminStatusReaderOptions,
  dependencies: StorageAdminStatusDependencies,
): Promise<StorageAdminStatus> {
  try {
    let plannerSnapshot: unknown;
    let plannerSnapshotCaptured = false;
    const evidenceReader: StorageRetentionEvidenceReader = {
      readStorageAdministrationSnapshot: async () => {
        const snapshot = await options.evidenceReader.readStorageAdministrationSnapshot();
        if (!plannerSnapshotCaptured) {
          plannerSnapshot = snapshot;
          plannerSnapshotCaptured = true;
        }
        return snapshot;
      },
      readHistoryGenerationSnapshot: (generationId) => (
        options.evidenceReader.readHistoryGenerationSnapshot(generationId)
      ),
    };

    const [administration, evidence] = await Promise.all([
      options.runtime.inspectStorageAdministration(),
      dependencies.inspectEvidence({
        reader: evidenceReader,
        subtleCrypto: options.subtleCrypto,
      }),
    ]);
    const plan = dependencies.planRetention(plannerSnapshot);
    const bootOutcome = options.getBootOutcome();
    const decision = dependencies.decideRetention({
      plan,
      evidence,
      boot: bootOutcome,
      rollbackReserveRequired: options.rollbackReserveRequired,
    });
    const ownerToken = dependencies.inspectOwnerToken({
      key: options.key,
      storage: options.storage,
    }).status;
    const boot = classifyBoot(bootOutcome);
    const receipts = classifyReceipts(administration, evidence);
    const evidenceStatus = classifyEvidence(evidence);
    const retentionStatus: StorageAdminRetentionStatus =
      decision.status === 'decision-ready' ? 'ready' : 'blocked';

    return freezeStatus({
      overall: classifyOverall({
        administration,
        boot,
        receipts,
        evidence: evidenceStatus,
        retention: retentionStatus,
        ownerToken,
        evidenceReason: evidence.reason,
      }),
      boot,
      storage: {
        observed: evidence.generations.observed,
        evaluated: evidence.generations.evaluated,
        active: evidence.generations.active,
        migration: evidence.generations.migration,
        historical: evidence.generations.historical,
      },
      receipts,
      evidence: evidenceStatus,
      retention: {
        status: retentionStatus,
        keep: decision.generations.keep,
        protected: decision.generations.protected,
        futureDeleteCandidate: decision.generations.futureDeleteCandidate,
      },
      ownerToken,
    });
  } catch {
    return createUnavailableStorageAdminStatus();
  }
}

/**
 * Compartilha a Promise enquanto uma atualização está em andamento. Depois que
 * ela assenta, a próxima chamada inicia uma nova inspeção lógica completa.
 */
export function createStorageAdminStatusReader(
  options: CreateStorageAdminStatusReaderOptions,
): StorageAdminStatusReader {
  const dependencies: StorageAdminStatusDependencies = {
    inspectEvidence: options.dependencies?.inspectEvidence
      ?? inspectStorageRetentionEvidence,
    planRetention: options.dependencies?.planRetention ?? planStorageRetention,
    decideRetention: options.dependencies?.decideRetention ?? decideStorageRetention,
    inspectOwnerToken: options.dependencies?.inspectOwnerToken
      ?? inspectStorageAdminOwnerToken,
  };
  let pending: Promise<StorageAdminStatus> | null = null;

  return Object.freeze({
    inspect(): Promise<StorageAdminStatus> {
      if (pending) return pending;
      const operation = inspectStorageAdminStatus(options, dependencies);
      pending = operation;
      void operation.finally(() => {
        if (pending === operation) pending = null;
      });
      return operation;
    },
  });
}
