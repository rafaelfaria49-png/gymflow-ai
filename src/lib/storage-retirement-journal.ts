import type { StorageAdminOwnerTokenLease } from './storage-admin-owner-token';
import type { StorageAdministrationSnapshotRead } from './storage-adapter';
import {
  inspectStorageRetirementProof,
  isStorageRetirementProof,
  type StorageRetirementProof,
} from './storage-retirement-proof';

// GOAL-17B-002E-E7A3 — journal persistível de retirement, desconectado da UI.
//
// O writer exige owner-token e prova opaca, revalida o fingerprint imediatamente
// antes da escrita e é idempotente. Nunca altera gerações físicas, nunca apaga
// manifest/records/summary e nunca autoriza delete.

export const STORAGE_RETIREMENT_JOURNAL_SCHEMA_VERSION = 1;
export const STORAGE_RETIREMENT_JOURNAL_METADATA_KEY = 'retirementJournal:v1';

export type StorageRetirementJournalStatus = 'recorded';

export interface StorageRetirementJournal {
  readonly schemaVersion: typeof STORAGE_RETIREMENT_JOURNAL_SCHEMA_VERSION;
  readonly status: StorageRetirementJournalStatus;
  readonly candidateGenerationId: string;
  readonly reservedPredecessorGenerationId: string;
  readonly currentGenerationId: string;
  readonly supersedeOperationIds: readonly string[];
  readonly originFingerprint: string;
  readonly recordedAt: string;
}

export type StorageRetirementJournalWriteStatus =
  | 'recorded'
  | 'already-recorded'
  | 'blocked-owner-token'
  | 'blocked-proof-missing'
  | 'blocked-snapshot-changed'
  | 'blocked-journal-conflict'
  | 'blocked-unknown-state';

export type StorageRetirementJournalWriteResult = {
  readonly status: StorageRetirementJournalWriteStatus;
  readonly journal: StorageRetirementJournal | null;
  readonly ownerTokenRequired: true;
  readonly executionAuthorized: false;
  readonly deleteAuthorized: false;
  readonly writeAuthorized: false;
};

export type StorageRetirementJournalRecoveryStatus =
  | 'absent'
  | 'recorded'
  | 'blocked-malformed'
  | 'blocked-incomplete'
  | 'blocked-fingerprint-mismatch';

export type StorageRetirementJournalRecovery = {
  readonly status: StorageRetirementJournalRecoveryStatus;
  readonly journal: StorageRetirementJournal | null;
  readonly executionAuthorized: false;
  readonly deleteAuthorized: false;
};

export interface StorageRetirementJournalPersistence {
  readStorageRetirementJournal(): Promise<unknown>;
  writeStorageRetirementJournalRecord(journal: StorageRetirementJournal): Promise<void>;
}

export interface WriteStorageRetirementJournalInput {
  readonly lease: StorageAdminOwnerTokenLease;
  readonly proof: StorageRetirementProof;
  readonly adapter: StorageRetirementJournalPersistence & {
    readStorageAdministrationSnapshot(): Promise<StorageAdministrationSnapshotRead>;
  };
  readonly now?: () => Date;
}

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

const JOURNAL_KEYS = [
  'schemaVersion',
  'status',
  'candidateGenerationId',
  'reservedPredecessorGenerationId',
  'currentGenerationId',
  'supersedeOperationIds',
  'originFingerprint',
  'recordedAt',
] as const;

export function isStorageRetirementJournal(value: unknown): value is StorageRetirementJournal {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = [...JOURNAL_KEYS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    return false;
  }
  const ids = uniqueNonEmptyStrings(value.supersedeOperationIds);
  return value.schemaVersion === STORAGE_RETIREMENT_JOURNAL_SCHEMA_VERSION
    && value.status === 'recorded'
    && isNonEmptyString(value.candidateGenerationId)
    && isNonEmptyString(value.reservedPredecessorGenerationId)
    && isNonEmptyString(value.currentGenerationId)
    && value.candidateGenerationId !== value.currentGenerationId
    && value.candidateGenerationId !== value.reservedPredecessorGenerationId
    && value.reservedPredecessorGenerationId !== value.currentGenerationId
    && ids !== null
    && isNonEmptyString(value.originFingerprint)
    && isNonEmptyString(value.recordedAt);
}

function freezeJournal(journal: StorageRetirementJournal): StorageRetirementJournal {
  return Object.freeze({
    schemaVersion: STORAGE_RETIREMENT_JOURNAL_SCHEMA_VERSION,
    status: 'recorded',
    candidateGenerationId: journal.candidateGenerationId,
    reservedPredecessorGenerationId: journal.reservedPredecessorGenerationId,
    currentGenerationId: journal.currentGenerationId,
    supersedeOperationIds: Object.freeze([...journal.supersedeOperationIds]),
    originFingerprint: journal.originFingerprint,
    recordedAt: journal.recordedAt,
  });
}

function journalsMatch(
  left: StorageRetirementJournal,
  right: StorageRetirementJournal,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.status === right.status
    && left.candidateGenerationId === right.candidateGenerationId
    && left.reservedPredecessorGenerationId === right.reservedPredecessorGenerationId
    && left.currentGenerationId === right.currentGenerationId
    && left.originFingerprint === right.originFingerprint
    && left.supersedeOperationIds.length === right.supersedeOperationIds.length
    && left.supersedeOperationIds.every((id, index) => id === right.supersedeOperationIds[index]);
}

function freezeWrite(
  status: StorageRetirementJournalWriteStatus,
  journal: StorageRetirementJournal | null,
): StorageRetirementJournalWriteResult {
  return Object.freeze({
    status,
    journal: journal === null ? null : freezeJournal(journal),
    ownerTokenRequired: true as const,
    executionAuthorized: false as const,
    deleteAuthorized: false as const,
    writeAuthorized: false as const,
  });
}

function freezeRecovery(
  status: StorageRetirementJournalRecoveryStatus,
  journal: StorageRetirementJournal | null,
): StorageRetirementJournalRecovery {
  return Object.freeze({
    status,
    journal: journal === null ? null : freezeJournal(journal),
    executionAuthorized: false as const,
    deleteAuthorized: false as const,
  });
}

/**
 * Classifica um journal persistido. Incompleto/malformado nunca vira sucesso
 * por inferência. Recovery nunca executa delete.
 */
export function recoverStorageRetirementJournal(
  value: unknown,
  currentFingerprint?: string,
): StorageRetirementJournalRecovery {
  if (value === null || value === undefined) {
    return freezeRecovery('absent', null);
  }
  if (!isRecord(value)) {
    return freezeRecovery('blocked-malformed', null);
  }
  if (value.status !== 'recorded' || value.schemaVersion !== STORAGE_RETIREMENT_JOURNAL_SCHEMA_VERSION) {
    return freezeRecovery('blocked-incomplete', null);
  }
  if (!isStorageRetirementJournal(value)) {
    return freezeRecovery('blocked-malformed', null);
  }
  const journal = freezeJournal(value);
  if (
    isNonEmptyString(currentFingerprint)
    && journal.originFingerprint !== currentFingerprint
  ) {
    return freezeRecovery('blocked-fingerprint-mismatch', journal);
  }
  return freezeRecovery('recorded', journal);
}

/**
 * Persiste o journal de retirement. Idempotente, fail-closed e sem mutação
 * física de gerações.
 */
export async function writeStorageRetirementJournal(
  input: WriteStorageRetirementJournalInput,
): Promise<StorageRetirementJournalWriteResult> {
  try {
    const owned = input.lease.confirm();
    if (owned.status !== 'owned') {
      return freezeWrite('blocked-owner-token', null);
    }

    const proofRecord = inspectStorageRetirementProof(input.proof);
    if (!isStorageRetirementProof(input.proof) || proofRecord === null) {
      return freezeWrite('blocked-proof-missing', null);
    }

    const snapshot = await input.adapter.readStorageAdministrationSnapshot().catch(() => null);
    if (snapshot === null || snapshot.fingerprint !== proofRecord.fingerprint) {
      return freezeWrite('blocked-snapshot-changed', null);
    }

    const existingRaw = await input.adapter.readStorageRetirementJournal().catch(() => undefined);
    const recovered = recoverStorageRetirementJournal(existingRaw, snapshot.fingerprint);
    const next = freezeJournal({
      schemaVersion: STORAGE_RETIREMENT_JOURNAL_SCHEMA_VERSION,
      status: 'recorded',
      candidateGenerationId: proofRecord.candidateGenerationId,
      reservedPredecessorGenerationId: proofRecord.reservedPredecessorGenerationId,
      currentGenerationId: proofRecord.currentGenerationId,
      supersedeOperationIds: proofRecord.supersedeOperationIds,
      originFingerprint: proofRecord.fingerprint,
      recordedAt: (input.now ?? (() => new Date()))().toISOString(),
    });

    if (recovered.status === 'recorded' && recovered.journal !== null) {
      if (journalsMatch(recovered.journal, next)) {
        return freezeWrite('already-recorded', recovered.journal);
      }
      return freezeWrite('blocked-journal-conflict', recovered.journal);
    }
    if (recovered.status !== 'absent') {
      return freezeWrite('blocked-journal-conflict', recovered.journal);
    }

    const confirmed = input.lease.confirm();
    if (confirmed.status !== 'owned') {
      return freezeWrite('blocked-owner-token', null);
    }

    await input.adapter.writeStorageRetirementJournalRecord(next);

    const snapshotAfter = await input.adapter.readStorageAdministrationSnapshot().catch(() => null);
    if (snapshotAfter === null || snapshotAfter.fingerprint !== proofRecord.fingerprint) {
      return freezeWrite('blocked-snapshot-changed', next);
    }
    const persisted = recoverStorageRetirementJournal(
      await input.adapter.readStorageRetirementJournal().catch(() => null),
      snapshotAfter.fingerprint,
    );
    if (persisted.status !== 'recorded' || persisted.journal === null) {
      return freezeWrite('blocked-unknown-state', null);
    }
    if (!journalsMatch(persisted.journal, next)) {
      return freezeWrite('blocked-journal-conflict', persisted.journal);
    }
    return freezeWrite('recorded', persisted.journal);
  } catch {
    return freezeWrite('blocked-unknown-state', null);
  }
}
