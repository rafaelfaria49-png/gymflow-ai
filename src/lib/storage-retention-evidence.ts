import type {
  AdministrableWorkoutHistoryStorageAdapter,
  HistoryGenerationSummary,
  StorageAdministrationSnapshotRead,
} from './storage-adapter';
import {
  isWorkoutCompletionReceipt,
} from './storage-completion-receipt';
import {
  HistoryDigestCryptoUnavailableError,
  isHistoryGenerationManifest,
  verifyHistoryGeneration,
  type HistoryGenerationManifest,
} from './storage-history-integrity';
import {
  isStorageOperationReceipt,
  isTerminalStorageOperationStatus,
} from './storage-operation-receipt';

// GOAL-17B-002D-D2 — evidência física read-only para retenção.
//
// Esta camada observa e classifica. Ela não planeja retenção, não autoriza
// exclusão e não possui nenhuma capacidade mutável no contrato injetado.
// Identidades físicas são indispensáveis para correlacionar ponteiros,
// manifests e receipts, mas vivem somente nos Maps locais desta inspeção.

export type StorageRetentionEvidenceReader = Pick<
  AdministrableWorkoutHistoryStorageAdapter,
  'readStorageAdministrationSnapshot' | 'readHistoryGenerationSnapshot'
>;

export type StorageRetentionEvidenceStatus = 'inspected' | 'blocked';

export type StorageRetentionEvidenceReason =
  | 'evidence-collected'
  | 'storage-read-failed'
  | 'physical-proof-unavailable'
  | 'snapshot-invalid'
  | 'snapshot-unstable'
  | 'structurally-conflicted';

export interface StorageRetentionGenerationCounts {
  readonly observed: number;
  readonly evaluated: number;
  readonly active: number;
  readonly migration: number;
  readonly historical: number;
  readonly orphan: number;
  readonly complete: number;
  readonly incomplete: number;
  readonly structurallyConflicted: number;
  readonly physicallyVerified: number;
  readonly physicallyUnverified: number;
  readonly missingReferenced: number;
}

export interface StorageRetentionReferenceCounts {
  readonly activePointers: number;
  readonly migrationPointers: number;
  readonly operationReceipts: number;
  readonly unsettledOperationReceipts: number;
  readonly pendingCompletionReceipts: number;
  readonly operationProtectedGenerations: number;
  readonly completionProtectedGenerations: number;
}

export interface StorageRetentionAnomalyCounts {
  readonly missingManifests: number;
  readonly duplicateManifests: number;
  readonly duplicateGenerationSummaries: number;
  readonly danglingPointers: number;
  readonly danglingReceiptReferences: number;
  readonly multipleActiveGenerations: number;
  readonly multipleMigrationGenerations: number;
  readonly summaryManifestConflicts: number;
  readonly malformedEntries: number;
  readonly verificationFailures: number;
}

export interface StorageRetentionEvidence {
  readonly status: StorageRetentionEvidenceStatus;
  readonly reason: StorageRetentionEvidenceReason;
  readonly generations: StorageRetentionGenerationCounts;
  readonly references: StorageRetentionReferenceCounts;
  readonly anomalies: StorageRetentionAnomalyCounts;
}

export interface InspectStorageRetentionEvidenceOptions {
  readonly reader: StorageRetentionEvidenceReader;
  readonly subtleCrypto?: SubtleCrypto | null;
}

interface GenerationSubject {
  readonly generationId: string;
  summary: HistoryGenerationSummary | null;
  manifest: HistoryGenerationManifest | null;
  summaryOccurrences: number;
  manifestOccurrences: number;
  activeReference: boolean;
  migrationReference: boolean;
  operationReferenceCount: number;
  completionReferenceCount: number;
  malformed: boolean;
  structurallyConflicted: boolean;
  summaryManifestConflict: boolean;
  complete: boolean;
}

interface MutableAnomalyCounts {
  missingManifests: number;
  duplicateManifests: number;
  duplicateGenerationSummaries: number;
  danglingPointers: number;
  danglingReceiptReferences: number;
  multipleActiveGenerations: number;
  multipleMigrationGenerations: number;
  summaryManifestConflicts: number;
  malformedEntries: number;
  verificationFailures: number;
}

interface SnapshotAnalysis {
  readonly fingerprint: string;
  readonly subjects: Map<string, GenerationSubject>;
  readonly references: StorageRetentionReferenceCounts;
  readonly anomalies: MutableAnomalyCounts;
  readonly structurallyConflicted: boolean;
}

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

function isMetadataShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isNullableNonEmptyString(value.activeGeneration)
    && isNullableNonEmptyString(value.migrationGeneration)
    && isNonNegativeInteger(value.schemaVersion)
    && value.schemaVersion > 0
    && typeof value.migrationStatus === 'string'
    && MIGRATION_STATUSES.has(value.migrationStatus)
    && isNullableNonEmptyString(value.migratedAt)
    && isNullableNonNegativeInteger(value.sourceStorageVersion);
}

function isGenerationSummary(value: unknown): value is HistoryGenerationSummary {
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

function isSnapshotContainer(value: unknown): value is StorageAdministrationSnapshotRead {
  if (!isRecord(value) || !isMetadataShape(value.metadata)) return false;
  return isNullableNonEmptyString(value.activeGenerationId)
    && isNullableNonEmptyString(value.migrationGenerationId)
    && Array.isArray(value.generations)
    && Array.isArray(value.manifests)
    && Array.isArray(value.activeGenerationRecords)
    && Array.isArray(value.operationReceipts)
    && Array.isArray(value.unsettledOperations)
    && Array.isArray(value.pendingCompletionReceipts)
    && typeof value.activeGenerationPresent === 'boolean'
    && isNonEmptyString(value.fingerprint);
}

function newAnomalies(): MutableAnomalyCounts {
  return {
    missingManifests: 0,
    duplicateManifests: 0,
    duplicateGenerationSummaries: 0,
    danglingPointers: 0,
    danglingReceiptReferences: 0,
    multipleActiveGenerations: 0,
    multipleMigrationGenerations: 0,
    summaryManifestConflicts: 0,
    malformedEntries: 0,
    verificationFailures: 0,
  };
}

function newGenerationCounts(): StorageRetentionGenerationCounts {
  return {
    observed: 0,
    evaluated: 0,
    active: 0,
    migration: 0,
    historical: 0,
    orphan: 0,
    complete: 0,
    incomplete: 0,
    structurallyConflicted: 0,
    physicallyVerified: 0,
    physicallyUnverified: 0,
    missingReferenced: 0,
  };
}

function newReferenceCounts(): StorageRetentionReferenceCounts {
  return {
    activePointers: 0,
    migrationPointers: 0,
    operationReceipts: 0,
    unsettledOperationReceipts: 0,
    pendingCompletionReceipts: 0,
    operationProtectedGenerations: 0,
    completionProtectedGenerations: 0,
  };
}

function freezeDeep<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) freezeDeep(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function evidence(
  status: StorageRetentionEvidenceStatus,
  reason: StorageRetentionEvidenceReason,
  generations: StorageRetentionGenerationCounts = newGenerationCounts(),
  references: StorageRetentionReferenceCounts = newReferenceCounts(),
  anomalies: StorageRetentionAnomalyCounts = newAnomalies(),
): StorageRetentionEvidence {
  return freezeDeep({
    status,
    reason,
    generations: { ...generations },
    references: { ...references },
    anomalies: { ...anomalies },
  });
}

function subjectFor(
  subjects: Map<string, GenerationSubject>,
  generationId: string,
): GenerationSubject {
  const existing = subjects.get(generationId);
  if (existing) return existing;
  const created: GenerationSubject = {
    generationId,
    summary: null,
    manifest: null,
    summaryOccurrences: 0,
    manifestOccurrences: 0,
    activeReference: false,
    migrationReference: false,
    operationReferenceCount: 0,
    completionReferenceCount: 0,
    malformed: false,
    structurallyConflicted: false,
    summaryManifestConflict: false,
    complete: false,
  };
  subjects.set(generationId, created);
  return created;
}

function manifestsMatch(
  left: HistoryGenerationManifest,
  right: HistoryGenerationManifest,
): boolean {
  return left.generationId === right.generationId
    && left.sessionCount === right.sessionCount
    && left.orderedDigest === right.orderedDigest
    && left.createdAt === right.createdAt
    && left.updatedAt === right.updatedAt
    && left.verified === right.verified;
}

function summariesMatch(
  left: HistoryGenerationSummary,
  right: HistoryGenerationSummary,
): boolean {
  return left.generationId === right.generationId
    && left.isActive === right.isActive
    && left.isStaged === right.isStaged
    && left.hasManifest === right.hasManifest
    && left.hasRecords === right.hasRecords
    && left.recordCount === right.recordCount
    && left.manifestSessionCount === right.manifestSessionCount
    && left.orderedDigest === right.orderedDigest
    && left.verified === right.verified
    && left.createdAt === right.createdAt
    && left.updatedAt === right.updatedAt;
}

function markConflict(subject: GenerationSubject, summaryManifest = false): void {
  subject.structurallyConflicted = true;
  if (summaryManifest) subject.summaryManifestConflict = true;
}

function analyzeSnapshot(snapshot: StorageAdministrationSnapshotRead): SnapshotAnalysis {
  const subjects = new Map<string, GenerationSubject>();
  const anomalies = newAnomalies();
  let globalConflict = false;

  for (const value of snapshot.generations as unknown[]) {
    const generationId = isRecord(value) && isNonEmptyString(value.generationId)
      ? value.generationId
      : null;
    if (generationId === null) {
      anomalies.malformedEntries += 1;
      globalConflict = true;
      continue;
    }
    const subject = subjectFor(subjects, generationId);
    subject.summaryOccurrences += 1;
    if (!isGenerationSummary(value)) {
      subject.malformed = true;
      markConflict(subject);
      anomalies.malformedEntries += 1;
      continue;
    }
    if (subject.summary === null) subject.summary = value;
  }

  for (const value of snapshot.manifests as unknown[]) {
    const generationId = isRecord(value) && isNonEmptyString(value.generationId)
      ? value.generationId
      : null;
    if (generationId === null) {
      anomalies.malformedEntries += 1;
      globalConflict = true;
      continue;
    }
    const subject = subjectFor(subjects, generationId);
    subject.manifestOccurrences += 1;
    if (
      !isHistoryGenerationManifest(value)
      || value.generationId.length === 0
      || value.sessionCount < 0
    ) {
      subject.malformed = true;
      markConflict(subject);
      anomalies.malformedEntries += 1;
      continue;
    }
    if (subject.manifest === null) subject.manifest = value;
  }

  const activePointers = new Set<string>();
  const migrationPointers = new Set<string>();
  const topLevelActive = snapshot.activeGenerationId;
  const metadataActive = snapshot.metadata.activeGeneration;
  const topLevelMigration = snapshot.migrationGenerationId;
  const metadataMigration = snapshot.metadata.migrationGeneration;

  for (const generationId of [topLevelActive, metadataActive]) {
    if (generationId !== null) {
      activePointers.add(generationId);
      subjectFor(subjects, generationId).activeReference = true;
    }
  }
  for (const generationId of [topLevelMigration, metadataMigration]) {
    if (generationId !== null) {
      migrationPointers.add(generationId);
      subjectFor(subjects, generationId).migrationReference = true;
    }
  }
  if (topLevelActive !== metadataActive || topLevelMigration !== metadataMigration) {
    globalConflict = true;
    for (const generationId of [...activePointers, ...migrationPointers]) {
      markConflict(subjectFor(subjects, generationId));
    }
  }

  const operationProtected = new Set<string>();
  const validOperations = new Map<string, string>();
  for (const value of snapshot.operationReceipts as unknown[]) {
    if (!isStorageOperationReceipt(value)) {
      anomalies.malformedEntries += 1;
      globalConflict = true;
      continue;
    }
    validOperations.set(value.operationId, value.status);
    const referencedGenerationIds = [value.previousGenerationId, value.stagedGenerationId];
    if (value.kind === 'restore') referencedGenerationIds.push(value.targetGenerationId);
    for (const generationId of referencedGenerationIds) {
      if (generationId === null) continue;
      const subject = subjectFor(subjects, generationId);
      subject.operationReferenceCount += 1;
      operationProtected.add(generationId);
    }
  }

  const validUnsettled = new Set<string>();
  for (const value of snapshot.unsettledOperations as unknown[]) {
    if (!isStorageOperationReceipt(value) || isTerminalStorageOperationStatus(value.status)) {
      anomalies.malformedEntries += 1;
      globalConflict = true;
      continue;
    }
    validUnsettled.add(value.operationId);
    if (validOperations.get(value.operationId) !== value.status) globalConflict = true;
  }
  for (const [operationId, status] of validOperations) {
    if (!isTerminalStorageOperationStatus(status) && !validUnsettled.has(operationId)) {
      globalConflict = true;
    }
  }

  const completionProtected = new Set<string>();
  for (const value of snapshot.pendingCompletionReceipts as unknown[]) {
    if (!isWorkoutCompletionReceipt(value) || value.status !== 'pending') {
      anomalies.malformedEntries += 1;
      globalConflict = true;
      continue;
    }
    const subject = subjectFor(subjects, value.generationId);
    subject.completionReferenceCount += 1;
    completionProtected.add(value.generationId);
  }

  const summariesMarkedActive = [...subjects.values()].filter(
    (subject) => subject.summary?.isActive === true,
  );
  const summariesMarkedMigration = [...subjects.values()].filter(
    (subject) => subject.summary?.isStaged === true,
  );
  if (summariesMarkedActive.length > 1) {
    anomalies.multipleActiveGenerations = summariesMarkedActive.length - 1;
    for (const subject of summariesMarkedActive) markConflict(subject);
  }
  if (summariesMarkedMigration.length > 1) {
    anomalies.multipleMigrationGenerations = summariesMarkedMigration.length - 1;
    for (const subject of summariesMarkedMigration) markConflict(subject);
  }

  for (const subject of subjects.values()) {
    const summary = subject.summary;
    const manifest = subject.manifest;

    if (subject.summaryOccurrences > 1) {
      anomalies.duplicateGenerationSummaries += subject.summaryOccurrences - 1;
      markConflict(subject);
    }
    if (subject.manifestOccurrences > 1) {
      anomalies.duplicateManifests += subject.manifestOccurrences - 1;
      markConflict(subject);
    }
    if (subject.activeReference && subject.migrationReference) markConflict(subject);

    if (summary === null) {
      if (
        subject.activeReference
        || subject.migrationReference
        || subject.operationReferenceCount > 0
        || subject.completionReferenceCount > 0
        || manifest !== null
      ) {
        markConflict(subject);
      }
    } else {
      if (summary.isActive !== subject.activeReference) markConflict(subject);
      if (summary.isStaged !== subject.migrationReference) markConflict(subject);
      if (summary.hasRecords !== (summary.recordCount > 0)) markConflict(subject, true);
      if (summary.hasManifest !== (subject.manifestOccurrences > 0)) {
        markConflict(subject, true);
      }
      if (manifest === null) {
        anomalies.missingManifests += 1;
        if (summary.hasManifest) markConflict(subject, true);
      } else if (
        summary.manifestSessionCount !== manifest.sessionCount
        || summary.recordCount !== manifest.sessionCount
        || summary.orderedDigest !== manifest.orderedDigest
        || summary.verified !== manifest.verified
        || summary.createdAt !== manifest.createdAt
        || summary.updatedAt !== manifest.updatedAt
      ) {
        markConflict(subject, true);
      }
    }

    if (
      (subject.activeReference || subject.migrationReference)
      && subject.summary === null
    ) {
      anomalies.danglingPointers += 1;
    }
    if (
      (subject.operationReferenceCount > 0 || subject.completionReferenceCount > 0)
      && subject.summary === null
    ) {
      anomalies.danglingReceiptReferences += 1;
    }

    subject.complete = !subject.structurallyConflicted
      && summary !== null
      && manifest !== null;
  }

  const activeSubject = topLevelActive === null ? null : subjects.get(topLevelActive) ?? null;
  const activeSummaryPresent = activeSubject?.summary !== null
    && activeSubject?.summary !== undefined;
  if (
    (topLevelActive === null && snapshot.activeGenerationPresent)
    || (
      topLevelActive !== null
      && snapshot.activeGenerationPresent !== activeSummaryPresent
    )
  ) {
    globalConflict = true;
    if (activeSubject) markConflict(activeSubject);
  }

  if (topLevelActive === null) {
    if (snapshot.activeGenerationManifest !== null || snapshot.activeGenerationRecords.length > 0) {
      globalConflict = true;
    }
  } else {
    const expectedManifest = activeSubject?.manifest ?? null;
    if (
      (expectedManifest === null) !== (snapshot.activeGenerationManifest === null)
      || (
        expectedManifest !== null
        && snapshot.activeGenerationManifest !== null
        && !manifestsMatch(expectedManifest, snapshot.activeGenerationManifest)
      )
    ) {
      globalConflict = true;
      if (activeSubject) markConflict(activeSubject, true);
    }

    const sessionIds = new Set<string>();
    const orders = new Set<number>();
    let recordsValid = true;
    for (const value of snapshot.activeGenerationRecords as unknown[]) {
      if (
        !isRecord(value)
        || value.generationId !== topLevelActive
        || !isNonEmptyString(value.sessionId)
        || !isNonNegativeInteger(value.order)
        || sessionIds.has(value.sessionId)
        || orders.has(value.order)
      ) {
        recordsValid = false;
        break;
      }
      sessionIds.add(value.sessionId);
      orders.add(value.order);
    }
    if (
      !recordsValid
      || (
        activeSubject?.summary !== null
        && activeSubject?.summary !== undefined
        && activeSubject.summary.recordCount !== snapshot.activeGenerationRecords.length
      )
    ) {
      globalConflict = true;
      if (activeSubject) markConflict(activeSubject, true);
    }
  }

  for (const subject of subjects.values()) {
    subject.complete = !subject.structurallyConflicted
      && subject.summary !== null
      && subject.manifest !== null;
  }
  anomalies.summaryManifestConflicts = [...subjects.values()].filter(
    (subject) => subject.summaryManifestConflict,
  ).length;

  return {
    fingerprint: snapshot.fingerprint,
    subjects,
    references: {
      activePointers: topLevelActive === null ? 0 : 1,
      migrationPointers: topLevelMigration === null ? 0 : 1,
      operationReceipts: snapshot.operationReceipts.length,
      unsettledOperationReceipts: snapshot.unsettledOperations.length,
      pendingCompletionReceipts: snapshot.pendingCompletionReceipts.length,
      operationProtectedGenerations: operationProtected.size,
      completionProtectedGenerations: completionProtected.size,
    },
    anomalies,
    structurallyConflicted: globalConflict
      || [...subjects.values()].some((subject) => subject.structurallyConflicted),
  };
}

function analysesMatch(left: SnapshotAnalysis, right: SnapshotAnalysis): boolean {
  if (left.fingerprint !== right.fingerprint || left.subjects.size !== right.subjects.size) {
    return false;
  }
  const referenceKeys: (keyof StorageRetentionReferenceCounts)[] = [
    'activePointers',
    'migrationPointers',
    'operationReceipts',
    'unsettledOperationReceipts',
    'pendingCompletionReceipts',
    'operationProtectedGenerations',
    'completionProtectedGenerations',
  ];
  if (referenceKeys.some((key) => left.references[key] !== right.references[key])) return false;
  const anomalyKeys: (keyof StorageRetentionAnomalyCounts)[] = [
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
  ];
  if (
    left.structurallyConflicted !== right.structurallyConflicted
    || anomalyKeys.some((key) => left.anomalies[key] !== right.anomalies[key])
  ) {
    return false;
  }

  for (const [generationId, leftSubject] of left.subjects) {
    const rightSubject = right.subjects.get(generationId);
    if (!rightSubject) return false;
    if (
      leftSubject.summaryOccurrences !== rightSubject.summaryOccurrences
      || leftSubject.manifestOccurrences !== rightSubject.manifestOccurrences
      || leftSubject.activeReference !== rightSubject.activeReference
      || leftSubject.migrationReference !== rightSubject.migrationReference
      || leftSubject.operationReferenceCount !== rightSubject.operationReferenceCount
      || leftSubject.completionReferenceCount !== rightSubject.completionReferenceCount
      || leftSubject.malformed !== rightSubject.malformed
      || leftSubject.structurallyConflicted !== rightSubject.structurallyConflicted
      || leftSubject.complete !== rightSubject.complete
    ) {
      return false;
    }
    if (
      (leftSubject.summary === null) !== (rightSubject.summary === null)
      || (
        leftSubject.summary !== null
        && rightSubject.summary !== null
        && !summariesMatch(leftSubject.summary, rightSubject.summary)
      )
      || (leftSubject.manifest === null) !== (rightSubject.manifest === null)
      || (
        leftSubject.manifest !== null
        && rightSubject.manifest !== null
        && !manifestsMatch(leftSubject.manifest, rightSubject.manifest)
      )
    ) {
      return false;
    }
  }
  return true;
}

function countGenerations(
  analysis: SnapshotAnalysis,
  physicallyVerified: ReadonlyMap<string, boolean>,
): StorageRetentionGenerationCounts {
  const counts = { ...newGenerationCounts() };
  for (const subject of analysis.subjects.values()) {
    counts.evaluated += 1;
    if (subject.summary !== null) counts.observed += 1;

    if (subject.activeReference) counts.active += 1;
    else if (subject.migrationReference) counts.migration += 1;
    else counts.historical += 1;

    const referenced = subject.activeReference
      || subject.migrationReference
      || subject.operationReferenceCount > 0
      || subject.completionReferenceCount > 0;
    if (!referenced) counts.orphan += 1;
    if (referenced && subject.summary === null) counts.missingReferenced += 1;

    if (subject.structurallyConflicted) counts.structurallyConflicted += 1;
    else if (subject.complete) counts.complete += 1;
    else counts.incomplete += 1;

    if (subject.complete && physicallyVerified.get(subject.generationId) === true) {
      counts.physicallyVerified += 1;
    } else {
      counts.physicallyUnverified += 1;
    }
  }
  return counts;
}

/**
 * Inspeciona a evidência física sem escrever, reparar, recuperar, planejar ou
 * excluir. O retorno público é deliberadamente agregado: somente enums
 * fechados e contagens atravessam a fronteira de privacidade.
 */
export async function inspectStorageRetentionEvidence(
  options: InspectStorageRetentionEvidenceOptions,
): Promise<StorageRetentionEvidence> {
  let firstValue: unknown;
  try {
    firstValue = await options.reader.readStorageAdministrationSnapshot();
  } catch {
    return evidence('blocked', 'storage-read-failed');
  }
  if (!isSnapshotContainer(firstValue)) {
    return evidence('blocked', 'snapshot-invalid');
  }

  const first = analyzeSnapshot(firstValue);
  const physicallyVerified = new Map<string, boolean>();

  for (const generationId of [...first.subjects.keys()].sort()) {
    let snapshot;
    try {
      snapshot = await options.reader.readHistoryGenerationSnapshot(generationId);
    } catch {
      return evidence('blocked', 'storage-read-failed');
    }

    let verification;
    try {
      verification = await verifyHistoryGeneration(
        generationId,
        snapshot,
        options.subtleCrypto,
      );
    } catch (error) {
      if (error instanceof HistoryDigestCryptoUnavailableError) {
        return evidence('blocked', 'physical-proof-unavailable');
      }
      return evidence('blocked', 'storage-read-failed');
    }

    const subject = first.subjects.get(generationId);
    const proofMatchesAdministration = verification.status === 'verified'
      && subject?.summary !== null
      && subject?.summary !== undefined
      && subject.manifest !== null
      && verification.manifest.generationId === generationId
      && manifestsMatch(verification.manifest, subject.manifest)
      && verification.sessions.length === subject.summary.recordCount;
    physicallyVerified.set(generationId, proofMatchesAdministration);
  }

  let secondValue: unknown;
  try {
    secondValue = await options.reader.readStorageAdministrationSnapshot();
  } catch {
    return evidence('blocked', 'storage-read-failed');
  }
  if (!isSnapshotContainer(secondValue)) {
    return evidence('blocked', 'snapshot-invalid');
  }
  const second = analyzeSnapshot(secondValue);
  if (!analysesMatch(first, second)) {
    return evidence('blocked', 'snapshot-unstable');
  }

  const generations = countGenerations(first, physicallyVerified);
  first.anomalies.verificationFailures = generations.physicallyUnverified;
  const reason: StorageRetentionEvidenceReason = first.structurallyConflicted
    ? 'structurally-conflicted'
    : 'evidence-collected';
  return evidence(
    first.structurallyConflicted ? 'blocked' : 'inspected',
    reason,
    generations,
    first.references,
    first.anomalies,
  );
}
