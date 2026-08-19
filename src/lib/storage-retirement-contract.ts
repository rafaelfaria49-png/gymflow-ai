// GOAL-17B-002E-E7A2 — contrato puro de retirement futuro.
//
// Classifica uma proposta de retirement com identidades explicitas. Nao abre
// storage, nao escreve journal, nao apaga geracao e nao autoriza execucao.
// A saida nomeia candidata, predecessor reservado e relacoes a supersedir
// apenas para um executor futuro ainda inexistente.

import {
  inspectStorageRetirementProof,
  isStorageRetirementProof,
} from './storage-retirement-proof';

export type StorageRetirementStatus =
  | 'retirement-classified'
  | 'blocked-unknown-state'
  | 'blocked-identity-invalid'
  | 'blocked-predecessor-not-reserved'
  | 'blocked-candidate-protected'
  | 'blocked-supersession-invalid'
  | 'blocked-physical-proof-missing';

export type StorageRetirementReason =
  | 'retirement-classified'
  | 'unknown-state'
  | 'identity-invalid'
  | 'predecessor-not-reserved'
  | 'candidate-protected'
  | 'supersession-invalid'
  | 'physical-proof-missing';

export interface StorageRetirementClassification {
  readonly status: StorageRetirementStatus;
  readonly reason: StorageRetirementReason;
  readonly candidateGenerationId: string | null;
  readonly reservedPredecessorGenerationId: string | null;
  readonly currentGenerationId: string | null;
  readonly supersedeOperationIds: readonly string[];
  readonly revalidationFingerprint: string | null;
  readonly ownerTokenRequired: true;
  readonly executionAuthorized: false;
  readonly deleteAuthorized: false;
  readonly writeAuthorized: false;
}

export interface ClassifyStorageRetirementInput {
  readonly candidateGenerationId: unknown;
  readonly reservedPredecessorGenerationId: unknown;
  readonly currentGenerationId: unknown;
  readonly supersedeOperationIds: unknown;
  readonly revalidationFingerprint?: unknown;
  readonly proof?: unknown;
}

const INPUT_KEYS = [
  'candidateGenerationId',
  'reservedPredecessorGenerationId',
  'currentGenerationId',
  'supersedeOperationIds',
] as const;

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

function freezeClassification(
  status: StorageRetirementStatus,
  reason: StorageRetirementReason,
  extras: {
    candidateGenerationId?: string | null;
    reservedPredecessorGenerationId?: string | null;
    currentGenerationId?: string | null;
    supersedeOperationIds?: readonly string[];
    revalidationFingerprint?: string | null;
  } = {},
): StorageRetirementClassification {
  return Object.freeze({
    status,
    reason,
    candidateGenerationId: extras.candidateGenerationId ?? null,
    reservedPredecessorGenerationId: extras.reservedPredecessorGenerationId ?? null,
    currentGenerationId: extras.currentGenerationId ?? null,
    supersedeOperationIds: Object.freeze([...(extras.supersedeOperationIds ?? [])]),
    revalidationFingerprint: extras.revalidationFingerprint ?? null,
    ownerTokenRequired: true,
    executionAuthorized: false,
    deleteAuthorized: false,
    writeAuthorized: false,
  });
}

function blocked(
  status: Exclude<StorageRetirementStatus, 'retirement-classified'>,
  reason: Exclude<StorageRetirementReason, 'retirement-classified'>,
  extras?: {
    candidateGenerationId?: string | null;
    reservedPredecessorGenerationId?: string | null;
    currentGenerationId?: string | null;
    supersedeOperationIds?: readonly string[];
    revalidationFingerprint?: string | null;
  },
): StorageRetirementClassification {
  return freezeClassification(status, reason, extras);
}

/**
 * Classifica uma proposta de retirement sem I/O e sem autoridade. Exige prova
 * física opaca: sem ela o estado nunca vira retirement-classified. Qualquer
 * writer ainda precisa de journal, owner-token e revalidacao imediata.
 */
export function classifyStorageRetirement(
  input: unknown,
): StorageRetirementClassification {
  try {
    if (!isRecord(input)) return blocked('blocked-unknown-state', 'unknown-state');
    const keys = Object.keys(input);
    const allowed = new Set<string>([...INPUT_KEYS, 'revalidationFingerprint', 'proof']);
    if (keys.some((key) => !allowed.has(key))) {
      return blocked('blocked-unknown-state', 'unknown-state');
    }
    if (!INPUT_KEYS.every((key) => Object.prototype.hasOwnProperty.call(input, key))) {
      return blocked('blocked-unknown-state', 'unknown-state');
    }

    const candidate = input.candidateGenerationId;
    const reserved = input.reservedPredecessorGenerationId;
    const current = input.currentGenerationId;
    if (!isNonEmptyString(candidate) || !isNonEmptyString(reserved) || !isNonEmptyString(current)) {
      return blocked('blocked-identity-invalid', 'identity-invalid');
    }

    const supersedeOperationIds = uniqueNonEmptyStrings(input.supersedeOperationIds);
    if (supersedeOperationIds === null) {
      return blocked('blocked-supersession-invalid', 'supersession-invalid', {
        candidateGenerationId: candidate,
        reservedPredecessorGenerationId: reserved,
        currentGenerationId: current,
      });
    }

    const fingerprint = input.revalidationFingerprint;
    if (fingerprint !== undefined && !isNonEmptyString(fingerprint)) {
      return blocked('blocked-unknown-state', 'unknown-state', {
        candidateGenerationId: candidate,
        reservedPredecessorGenerationId: reserved,
        currentGenerationId: current,
        supersedeOperationIds,
      });
    }

    if (candidate === current) {
      return blocked('blocked-candidate-protected', 'candidate-protected', {
        candidateGenerationId: candidate,
        reservedPredecessorGenerationId: reserved,
        currentGenerationId: current,
        supersedeOperationIds,
        revalidationFingerprint: isNonEmptyString(fingerprint) ? fingerprint : null,
      });
    }
    if (reserved === current) {
      return blocked('blocked-predecessor-not-reserved', 'predecessor-not-reserved', {
        candidateGenerationId: candidate,
        reservedPredecessorGenerationId: reserved,
        currentGenerationId: current,
        supersedeOperationIds,
        revalidationFingerprint: isNonEmptyString(fingerprint) ? fingerprint : null,
      });
    }
    if (candidate === reserved) {
      return blocked('blocked-identity-invalid', 'identity-invalid', {
        candidateGenerationId: candidate,
        reservedPredecessorGenerationId: reserved,
        currentGenerationId: current,
        supersedeOperationIds,
        revalidationFingerprint: isNonEmptyString(fingerprint) ? fingerprint : null,
      });
    }

    const proofRecord = inspectStorageRetirementProof(input.proof);
    if (!isStorageRetirementProof(input.proof) || proofRecord === null) {
      return blocked('blocked-physical-proof-missing', 'physical-proof-missing', {
        candidateGenerationId: candidate,
        reservedPredecessorGenerationId: reserved,
        currentGenerationId: current,
        supersedeOperationIds,
        revalidationFingerprint: isNonEmptyString(fingerprint) ? fingerprint : null,
      });
    }
    if (
      proofRecord.candidateGenerationId !== candidate
      || proofRecord.reservedPredecessorGenerationId !== reserved
      || proofRecord.currentGenerationId !== current
      || proofRecord.supersedeOperationIds.length !== supersedeOperationIds.length
      || proofRecord.supersedeOperationIds.some((id, index) => id !== supersedeOperationIds[index])
      || (
        isNonEmptyString(fingerprint)
        && proofRecord.fingerprint !== fingerprint
      )
    ) {
      return blocked('blocked-physical-proof-missing', 'physical-proof-missing', {
        candidateGenerationId: candidate,
        reservedPredecessorGenerationId: reserved,
        currentGenerationId: current,
        supersedeOperationIds,
        revalidationFingerprint: isNonEmptyString(fingerprint) ? fingerprint : null,
      });
    }

    return freezeClassification('retirement-classified', 'retirement-classified', {
      candidateGenerationId: candidate,
      reservedPredecessorGenerationId: reserved,
      currentGenerationId: current,
      supersedeOperationIds,
      revalidationFingerprint: proofRecord.fingerprint,
    });
  } catch {
    return blocked('blocked-unknown-state', 'unknown-state');
  }
}
