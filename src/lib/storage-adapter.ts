import type { WorkoutSession } from '../types';
import type { WorkoutCompletionReceipt } from './storage-completion-receipt';
import type {
  HistoryGenerationManifest,
  HistoryGenerationSnapshot,
} from './storage-history-integrity';
import type {
  StorageOperationReceipt,
  StorageOperationReceiptPatch,
  StorageOperationStatus,
} from './storage-operation-receipt';

export type { HistoryGenerationManifest, HistoryGenerationSnapshot };

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
  hasHistoryGeneration(generationId: string): Promise<boolean>;
  readGenerationManifest(generationId: string): Promise<HistoryGenerationManifest | null>;
  readHistoryGenerationSnapshot(generationId: string): Promise<HistoryGenerationSnapshot>;
  activateHistoryGeneration(generationId: string): Promise<void>;
  appendSession(session: WorkoutSession): Promise<void>;
  appendSessionWithCompletionReceipt(
    session: WorkoutSession,
    receipt: WorkoutCompletionReceipt,
  ): Promise<void>;
  readPendingCompletionReceipts(): Promise<WorkoutCompletionReceipt[]>;
  readCompletionReceiptForSession(sessionId: string): Promise<WorkoutCompletionReceipt | null>;
  settleCompletionReceipt(receiptId: string): Promise<boolean>;
  updateSession(session: WorkoutSession): Promise<boolean>;
  deleteSession(sessionId: string): Promise<boolean>;
  count(): Promise<number>;
  readMetadata(): Promise<HistoryStorageMetadata>;
  writeMetadata(metadata: Partial<Omit<HistoryStorageMetadata, 'activeGeneration'>>): Promise<void>;
  saveLegacySnapshot(raw: string): Promise<LegacySnapshotRecord>;
  readLegacySnapshot(): Promise<LegacySnapshotRecord | null>;
  clearInactiveGeneration(generationId: string): Promise<number>;
}

// Resumo diagnóstico de uma geração física. Ele descreve o que existe, não o
// que está íntegro: `verified` é apenas a flag declarada pelo manifest e
// `hasManifest` não prova nada sobre os registros. Integridade real exige
// `readVerifiedHistoryGeneration`.
export interface HistoryGenerationSummary {
  generationId: string;
  isActive: boolean;
  isStaged: boolean;
  hasManifest: boolean;
  hasRecords: boolean;
  recordCount: number;
  manifestSessionCount: number | null;
  orderedDigest: string | null;
  verified: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface VerifiedHistoryGeneration {
  generationId: string;
  sessions: WorkoutSession[];
  manifest: HistoryGenerationManifest;
}

export interface RollbackHistoryGenerationInput {
  targetGenerationId: string;
  expectedActiveGenerationId: string;
  // Quando informado, `metadata.migrationGeneration` precisa ser exatamente
  // este id para ser limpo. Ausente significa não tocar no ponteiro de staging.
  clearStagedGenerationId?: string;
}

export interface RollbackHistoryGenerationResult {
  targetGenerationId: string;
  previousActiveGenerationId: string;
  clearedStagedGenerationId: string | null;
  sessionCount: number;
  orderedDigest: string;
  activeGeneration: string | null;
  migrationGeneration: string | null;
  // `false` quando o alvo já era a geração ativa: no-op explícito, não silêncio.
  changed: boolean;
}

// Primitivas administrativas de baixo nível.
//
// Elas ficam fora de `WorkoutHistoryStorageAdapter` de propósito: o contrato de
// leitura/escrita do histórico é consumido pela migração v1 e pelo runtime
// híbrido, que não podem — e não devem — executar operações administrativas. A
// implementação IndexedDB declara os dois contratos, sem cast e sem método
// ausente.
export interface WorkoutHistoryAdministrationAdapter {
  putStorageOperationReceipt(receipt: StorageOperationReceipt): Promise<void>;
  readStorageOperationReceipt(operationId: string): Promise<StorageOperationReceipt | null>;
  listUnsettledStorageOperationReceipts(): Promise<StorageOperationReceipt[]>;
  transitionStorageOperationReceipt(
    operationId: string,
    expectedStatus: StorageOperationStatus,
    nextStatus: StorageOperationStatus,
    patch?: StorageOperationReceiptPatch,
  ): Promise<StorageOperationReceipt>;
  listHistoryGenerations(): Promise<HistoryGenerationSummary[]>;
  readVerifiedHistoryGeneration(generationId: string): Promise<VerifiedHistoryGeneration>;
  rollbackToHistoryGeneration(
    input: RollbackHistoryGenerationInput,
  ): Promise<RollbackHistoryGenerationResult>;
}

export type AdministrableWorkoutHistoryStorageAdapter =
  WorkoutHistoryStorageAdapter & WorkoutHistoryAdministrationAdapter;
