import type { WorkoutSession } from '../types';

export type HistoryMigrationStatus = 'not-started' | 'in-progress' | 'completed' | 'failed';

export interface HistoryStorageMetadata {
  activeGeneration: string | null;
  migrationGeneration: string | null;
  schemaVersion: number;
  migrationStatus: HistoryMigrationStatus;
  migratedAt: string | null;
  sourceStorageVersion: number | null;
}

export interface LegacySnapshotRecord {
  raw: string;
  checksum: string;
  createdAt: string;
  verified: boolean;
}

export interface WorkoutHistoryStorageAdapter {
  open(): Promise<void>;
  close(): Promise<void>;
  isAvailable(): Promise<boolean>;
  readActiveHistory(): Promise<WorkoutSession[]>;
  replaceHistory(history: readonly WorkoutSession[]): Promise<string>;
  prepareHistoryGeneration(history: readonly WorkoutSession[]): Promise<string>;
  readHistoryGeneration(generationId: string): Promise<WorkoutSession[]>;
  activateHistoryGeneration(generationId: string): Promise<void>;
  appendSession(session: WorkoutSession): Promise<void>;
  updateSession(session: WorkoutSession): Promise<boolean>;
  deleteSession(sessionId: string): Promise<boolean>;
  count(): Promise<number>;
  readMetadata(): Promise<HistoryStorageMetadata>;
  writeMetadata(metadata: Partial<Omit<HistoryStorageMetadata, 'activeGeneration'>>): Promise<void>;
  saveLegacySnapshot(raw: string): Promise<LegacySnapshotRecord>;
  readLegacySnapshot(): Promise<LegacySnapshotRecord | null>;
  clearInactiveGeneration(generationId: string): Promise<number>;
}
