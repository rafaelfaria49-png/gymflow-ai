import type { WorkoutSession } from '../types';
import type {
  LegacySnapshotRecord,
  WorkoutHistoryStorageAdapter,
} from './storage-adapter';
import { checksumLegacySnapshot } from './storage-indexeddb';
import type { PersistedState } from './storage-types';
import { parseEnvelope } from './storage-validation';
import { normalizeSessionState } from './workout-session-migration';

export type HistoryMigrationResult =
  | HistoryMigrationSuccess<'migrated'>
  | HistoryMigrationSuccess<'already-completed'>
  | HistoryMigrationSuccess<'resumed'>
  | { status: 'no-history'; reason: 'absent' | 'empty' }
  | { status: 'failed'; error: unknown };

interface HistoryMigrationSuccess<Status extends 'migrated' | 'already-completed' | 'resumed'> {
  status: Status;
  generationId: string;
  sessions: number;
  checksum: string;
}

export interface MigrateWorkoutHistoryFromV1Options {
  rawEnvelope: string;
  adapter: WorkoutHistoryStorageAdapter;
  now?: () => Date;
  checksumHistory?: (history: readonly WorkoutSession[]) => Promise<string>;
}

export class HistoryMigrationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HistoryMigrationIntegrityError';
  }
}

export class HistoryMigrationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HistoryMigrationValidationError';
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = canonicalize(item);
      return normalized === undefined ? null : normalized;
    });
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .flatMap((key) => {
          const normalized = canonicalize(record[key]);
          return normalized === undefined ? [] : [[key, normalized]];
        }),
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  return value;
}

export function serializeWorkoutHistoryDeterministically(
  history: readonly WorkoutSession[],
): string {
  return JSON.stringify(canonicalize(history));
}

export async function checksumWorkoutHistory(
  history: readonly WorkoutSession[],
): Promise<string> {
  return checksumLegacySnapshot(serializeWorkoutHistoryDeterministically(history));
}

function normalizeHistory(envelope: PersistedState): WorkoutSession[] {
  return normalizeSessionState({
    activeWorkout: envelope.activeWorkout ?? null,
    activeWorkoutStartedAt: envelope.activeWorkoutStartedAt ?? null,
    workoutHistory: envelope.workoutHistory,
  }).workoutHistory;
}

async function assertSnapshotMatches(
  rawEnvelope: string,
  snapshot: LegacySnapshotRecord | null,
): Promise<void> {
  const expectedChecksum = await checksumLegacySnapshot(rawEnvelope);
  if (!snapshot) {
    throw new HistoryMigrationIntegrityError('Snapshot v1 não encontrado após a gravação.');
  }
  if (
    !snapshot.verified
    || snapshot.raw !== rawEnvelope
    || snapshot.checksum !== expectedChecksum
  ) {
    throw new HistoryMigrationIntegrityError('Snapshot v1 não passou na verificação de integridade.');
  }
}

async function historyMismatch(
  expected: readonly WorkoutSession[],
  actual: readonly WorkoutSession[],
  expectedChecksum: string,
  checksumHistory: (history: readonly WorkoutSession[]) => Promise<string>,
): Promise<string | null> {
  if (actual.length !== expected.length) {
    return `Contagem divergente: esperado ${expected.length}, recebido ${actual.length}.`;
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index]?.id !== expected[index]?.id) {
      return `Ordem ou identidade divergente na posição ${index}.`;
    }
  }
  const expectedSerialized = serializeWorkoutHistoryDeterministically(expected);
  const actualSerialized = serializeWorkoutHistoryDeterministically(actual);
  if (actualSerialized !== expectedSerialized) {
    return 'Conteúdo da geração diverge do histórico normalizado.';
  }
  const actualChecksum = await checksumHistory(actual);
  if (actualChecksum !== expectedChecksum) {
    return 'Checksum da geração diverge do histórico normalizado.';
  }
  return null;
}

async function markFailedSafely(adapter: WorkoutHistoryStorageAdapter): Promise<void> {
  try {
    await adapter.writeMetadata({ migrationStatus: 'failed' });
  } catch {
    // O erro original da migração tem precedência sobre a falha de telemetria.
  }
}

export async function migrateWorkoutHistoryFromV1({
  rawEnvelope,
  adapter,
  now = () => new Date(),
  checksumHistory = checksumWorkoutHistory,
}: MigrateWorkoutHistoryFromV1Options): Promise<HistoryMigrationResult> {
  const parsed = parseEnvelope<PersistedState>(rawEnvelope);
  if (parsed.status === 'unsupported-version') {
    return {
      status: 'failed',
      error: new HistoryMigrationValidationError(`Versão de storage não suportada: ${String(parsed.version)}.`),
    };
  }
  if (parsed.status === 'corrupt') {
    return { status: 'failed', error: new HistoryMigrationValidationError(parsed.error) };
  }

  const data = parsed.envelope.data;
  if (!Object.prototype.hasOwnProperty.call(data, 'workoutHistory')) {
    return { status: 'no-history', reason: 'absent' };
  }
  if (data.workoutHistory.length === 0) {
    return { status: 'no-history', reason: 'empty' };
  }

  let expectedHistory: WorkoutSession[];
  let expectedChecksum: string;
  try {
    expectedHistory = normalizeHistory(data);
    expectedChecksum = await checksumHistory(expectedHistory);
  } catch (error) {
    return { status: 'failed', error };
  }

  try {
    await adapter.open();
    const initialMetadata = await adapter.readMetadata();

    if (initialMetadata.migrationStatus === 'completed') {
      await assertSnapshotMatches(rawEnvelope, await adapter.readLegacySnapshot());
      const generationId = initialMetadata.activeGeneration;
      if (!generationId) {
        throw new HistoryMigrationIntegrityError('Migração concluída sem geração ativa.');
      }
      const mismatch = await historyMismatch(
        expectedHistory,
        await adapter.readHistoryGeneration(generationId),
        expectedChecksum,
        checksumHistory,
      );
      if (mismatch) throw new HistoryMigrationIntegrityError(mismatch);
      if (initialMetadata.sourceStorageVersion !== 1 || !initialMetadata.migratedAt) {
        throw new HistoryMigrationIntegrityError('Metadata final da migração está incompleta.');
      }
      return {
        status: 'already-completed',
        generationId,
        sessions: expectedHistory.length,
        checksum: expectedChecksum,
      };
    }

    const resumed = initialMetadata.migrationStatus !== 'not-started'
      || initialMetadata.migrationGeneration !== null;
    await adapter.writeMetadata({
      migrationStatus: 'in-progress',
      migratedAt: null,
      sourceStorageVersion: 1,
    });

    const existingSnapshot = await adapter.readLegacySnapshot();
    if (!existingSnapshot) {
      const savedSnapshot = await adapter.saveLegacySnapshot(rawEnvelope);
      if (!savedSnapshot.verified) {
        throw new HistoryMigrationIntegrityError('Snapshot v1 não foi confirmado pelo adapter.');
      }
    } else if (
      !existingSnapshot.verified
      && existingSnapshot.raw === rawEnvelope
      && existingSnapshot.checksum === await checksumLegacySnapshot(rawEnvelope)
    ) {
      const savedSnapshot = await adapter.saveLegacySnapshot(rawEnvelope);
      if (!savedSnapshot.verified) {
        throw new HistoryMigrationIntegrityError('Snapshot v1 não foi confirmado pelo adapter.');
      }
    }
    await assertSnapshotMatches(rawEnvelope, await adapter.readLegacySnapshot());

    let generationId = initialMetadata.migrationGeneration;
    if (
      !generationId
      && initialMetadata.activeGeneration
      && initialMetadata.migrationStatus !== 'not-started'
    ) {
      const activeCandidate = await adapter.readHistoryGeneration(initialMetadata.activeGeneration);
      const activeCandidateMismatch = await historyMismatch(
        expectedHistory,
        activeCandidate,
        expectedChecksum,
        checksumHistory,
      );
      if (!activeCandidateMismatch) generationId = initialMetadata.activeGeneration;
    }
    if (generationId) {
      const stagedHistory = await adapter.readHistoryGeneration(generationId);
      const mismatch = await historyMismatch(
        expectedHistory,
        stagedHistory,
        expectedChecksum,
        checksumHistory,
      );
      if (mismatch) {
        if (generationId === initialMetadata.activeGeneration) {
          throw new HistoryMigrationIntegrityError(`Geração ativa inválida: ${mismatch}`);
        }
        await adapter.clearInactiveGeneration(generationId);
        generationId = null;
      }
    }

    if (!generationId) {
      generationId = await adapter.prepareHistoryGeneration(expectedHistory);
    }

    const preparedMismatch = await historyMismatch(
      expectedHistory,
      await adapter.readHistoryGeneration(generationId),
      expectedChecksum,
      checksumHistory,
    );
    if (preparedMismatch) {
      const metadata = await adapter.readMetadata();
      if (metadata.activeGeneration !== generationId) {
        await adapter.clearInactiveGeneration(generationId);
      }
      throw new HistoryMigrationIntegrityError(preparedMismatch);
    }

    const beforeActivation = await adapter.readMetadata();
    if (beforeActivation.activeGeneration !== generationId) {
      await adapter.activateHistoryGeneration(generationId);
    }

    const activatedMetadata = await adapter.readMetadata();
    if (activatedMetadata.activeGeneration !== generationId) {
      throw new HistoryMigrationIntegrityError('A geração verificada não se tornou ativa.');
    }
    const activeMismatch = await historyMismatch(
      expectedHistory,
      await adapter.readActiveHistory(),
      expectedChecksum,
      checksumHistory,
    );
    if (activeMismatch) throw new HistoryMigrationIntegrityError(activeMismatch);

    await adapter.writeMetadata({
      migrationGeneration: null,
      migrationStatus: 'completed',
      migratedAt: now().toISOString(),
      sourceStorageVersion: 1,
    });
    const finalMetadata = await adapter.readMetadata();
    if (
      finalMetadata.activeGeneration !== generationId
      || finalMetadata.migrationGeneration !== null
      || finalMetadata.migrationStatus !== 'completed'
      || finalMetadata.sourceStorageVersion !== 1
      || !finalMetadata.migratedAt
    ) {
      throw new HistoryMigrationIntegrityError('Metadata final não confirmou a migração.');
    }

    return {
      status: resumed ? 'resumed' : 'migrated',
      generationId,
      sessions: expectedHistory.length,
      checksum: expectedChecksum,
    };
  } catch (error) {
    await markFailedSafely(adapter);
    return { status: 'failed', error };
  }
}
