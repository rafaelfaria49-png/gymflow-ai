// GOAL-17B-002D-D2B — planejamento conservador de retenção.
//
// Este módulo é deliberadamente puro e não possui autoridade de retenção. Ele
// reconhece somente o estado administrativo mínimo em que uma política ainda
// precisa ser aprovada. Todo o restante falha fechado, sem devolver conteúdo ou
// identidades do snapshot.

import {
  isStorageOperationReceipt,
  isTerminalStorageOperationStatus,
} from './storage-operation-receipt';

export type StorageRetentionPlanStatus = 'policy-required' | 'blocked';

export type StorageRetentionReason =
  | 'policy-required'
  | 'snapshot-invalid'
  | 'operation-receipt-present'
  | 'completion-receipt-present'
  | 'cleanup-pending'
  | 'physical-proof-required';

export interface StorageRetentionPlan {
  status: StorageRetentionPlanStatus;
  reason: StorageRetentionReason;
  delete: readonly [];
}

type StorageRetentionCheck =
  | { status: 'policy-required'; reason: 'policy-required' }
  | { status: 'blocked'; reason: Exclude<StorageRetentionReason, 'policy-required'> };

const MIGRATION_STATUSES = new Set([
  'not-started',
  'in-progress',
  'completed',
  'failed',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === 'boolean';
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasUniqueStrings(values: readonly string[]): boolean {
  return values.length === new Set(values).size;
}

function isMetadataShape(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.activeGeneration)
    && isNullableNonEmptyString(value.migrationGeneration)
    && isNonNegativeInteger(value.schemaVersion)
    && value.schemaVersion > 0
    && typeof value.migrationStatus === 'string'
    && MIGRATION_STATUSES.has(value.migrationStatus)
    && isNullableNonEmptyString(value.migratedAt)
    && isNullableNonNegativeInteger(value.sourceStorageVersion);
}

function isGenerationShape(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.generationId)
    && typeof value.isActive === 'boolean'
    && typeof value.isStaged === 'boolean'
    && typeof value.hasManifest === 'boolean'
    && typeof value.hasRecords === 'boolean'
    && isNonNegativeInteger(value.recordCount)
    && isNullableNonNegativeInteger(value.manifestSessionCount)
    && isNullableNonEmptyString(value.orderedDigest)
    && isNullableBoolean(value.verified)
    && isNullableNonEmptyString(value.createdAt)
    && isNullableNonEmptyString(value.updatedAt);
}

function isManifestShape(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.generationId)
    && isNonNegativeInteger(value.sessionCount)
    && isNonEmptyString(value.orderedDigest)
    && isNonEmptyString(value.createdAt)
    && isNonEmptyString(value.updatedAt)
    && typeof value.verified === 'boolean';
}

function manifestsMatch(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return left.generationId === right.generationId
    && left.sessionCount === right.sessionCount
    && left.orderedDigest === right.orderedDigest
    && left.createdAt === right.createdAt
    && left.updatedAt === right.updatedAt
    && left.verified === right.verified;
}

function isActiveRecordShape(
  value: unknown,
  activeGenerationId: string,
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return value.generationId === activeGenerationId
    && isNonEmptyString(value.sessionId)
    && isNonNegativeInteger(value.order)
    && isRecord(value.session)
    && isNullableNonEmptyString(value.digest);
}

function blocked(
  reason: Exclude<StorageRetentionReason, 'policy-required'>,
): StorageRetentionCheck {
  return { status: 'blocked', reason };
}

function checkSnapshot(value: unknown): StorageRetentionCheck {
  if (!isRecord(value) || !isRecord(value.metadata)) {
    return blocked('snapshot-invalid');
  }

  if (
    !Array.isArray(value.generations)
    || !Array.isArray(value.manifests)
    || !Array.isArray(value.activeGenerationRecords)
    || !Array.isArray(value.operationReceipts)
    || !Array.isArray(value.unsettledOperations)
    || !Array.isArray(value.pendingCompletionReceipts)
  ) {
    return blocked('snapshot-invalid');
  }

  if (hasOwn(value, 'cleanupPending')) {
    return blocked('cleanup-pending');
  }
  if (value.unsettledOperations.length > 0) {
    return blocked('operation-receipt-present');
  }
  for (const receipt of value.operationReceipts) {
    if (!isStorageOperationReceipt(receipt)) {
      return blocked('snapshot-invalid');
    }
    if (!isTerminalStorageOperationStatus(receipt.status)) {
      return blocked('operation-receipt-present');
    }
  }
  if (value.pendingCompletionReceipts.length > 0) {
    return blocked('completion-receipt-present');
  }

  const metadata = value.metadata;
  if (
    !isMetadataShape(metadata)
    || !isNonEmptyString(value.activeGenerationId)
    || !isNullableNonEmptyString(value.migrationGenerationId)
    || typeof value.activeGenerationPresent !== 'boolean'
  ) {
    return blocked('snapshot-invalid');
  }

  if (
    metadata.activeGeneration !== value.activeGenerationId
    || metadata.migrationGeneration !== value.migrationGenerationId
  ) {
    return blocked('snapshot-invalid');
  }
  if (metadata.migrationStatus !== 'completed') {
    return blocked('snapshot-invalid');
  }
  if (metadata.migrationGeneration !== null || value.migrationGenerationId !== null) {
    return blocked('physical-proof-required');
  }

  if (!value.generations.every(isGenerationShape)) {
    return blocked('snapshot-invalid');
  }
  const generationIds = value.generations.map((entry) => entry.generationId as string);
  if (!hasUniqueStrings(generationIds)) {
    return blocked('snapshot-invalid');
  }
  if (value.generations.length !== 1) {
    return value.generations.length > 1
      ? blocked('physical-proof-required')
      : blocked('snapshot-invalid');
  }

  const activeGeneration = value.generations[0];
  if (
    activeGeneration.generationId !== value.activeGenerationId
    || activeGeneration.isActive !== true
    || activeGeneration.isStaged !== false
    || value.activeGenerationPresent !== true
  ) {
    return blocked('snapshot-invalid');
  }

  if (!value.manifests.every(isManifestShape)) {
    return blocked('snapshot-invalid');
  }
  const manifestIds = value.manifests.map((entry) => entry.generationId as string);
  if (!hasUniqueStrings(manifestIds) || value.manifests.length !== 1) {
    return blocked('snapshot-invalid');
  }

  const activeManifest = value.manifests[0];
  if (
    activeManifest.generationId !== value.activeGenerationId
    || !isManifestShape(value.activeGenerationManifest)
    || !manifestsMatch(activeManifest, value.activeGenerationManifest)
  ) {
    return blocked('snapshot-invalid');
  }

  if (
    activeGeneration.hasManifest !== true
    || activeGeneration.manifestSessionCount !== activeManifest.sessionCount
    || activeGeneration.orderedDigest !== activeManifest.orderedDigest
    || activeGeneration.verified !== activeManifest.verified
  ) {
    return blocked('snapshot-invalid');
  }

  if (
    !value.activeGenerationRecords.every((entry) => (
      isActiveRecordShape(entry, value.activeGenerationId as string)
    ))
  ) {
    return blocked('snapshot-invalid');
  }

  const recordIds = value.activeGenerationRecords
    .map((entry) => (entry as Record<string, unknown>).sessionId as string);
  const recordOrders = value.activeGenerationRecords
    .map((entry) => (entry as Record<string, unknown>).order as number);
  if (
    !hasUniqueStrings(recordIds)
    || recordOrders.length !== new Set(recordOrders).size
    || activeGeneration.recordCount !== value.activeGenerationRecords.length
    || activeGeneration.hasRecords !== (value.activeGenerationRecords.length > 0)
    || activeManifest.sessionCount !== value.activeGenerationRecords.length
  ) {
    return blocked('snapshot-invalid');
  }

  return { status: 'policy-required', reason: 'policy-required' };
}

/**
 * Planeja retenção sem executar I/O, provar integridade física ou autorizar
 * exclusão. O fingerprint legado do snapshot não é lido nem devolvido.
 */
export function planStorageRetention(value: unknown): StorageRetentionPlan {
  try {
    const result = checkSnapshot(value);
    return {
      status: result.status,
      reason: result.reason,
      delete: [],
    };
  } catch {
    return {
      status: 'blocked',
      reason: 'snapshot-invalid',
      delete: [],
    };
  }
}
