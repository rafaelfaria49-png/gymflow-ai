import type { WorkoutSession } from '../types';
import type { WorkoutCompletionReceipt } from './storage-completion-receipt';
import type {
  HistoryGenerationManifest,
  HistoryGenerationSnapshot,
} from './storage-history-integrity';
import type {
  StorageOperationKind,
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

export interface CreateStorageOperationReceiptIfIdleInput {
  receipt: StorageOperationReceipt;
  // CAS: a criação só é aceita quando `metadata.activeGeneration` ainda é
  // exatamente este id no momento da escrita.
  expectedActiveGenerationId: string;
}

export interface TransitionStorageOperationIfUnambiguousInput {
  operationId: string;
  expectedStatus: StorageOperationStatus;
  nextStatus: StorageOperationStatus;
  // CAS: a transição só é aceita quando `metadata.activeGeneration` ainda é
  // exatamente este id no momento da escrita.
  expectedActiveGenerationId: string | null;
  patch?: StorageOperationReceiptPatch;
}

export interface RevertStorageOperationAfterTransitionConflictInput {
  operationId: string;
  // Status em que o receipt precisa estar AGORA para ser revertido. Sem ele a
  // compensação viraria um `put` cego.
  expectedStatus: StorageOperationStatus;
  // CAS opcional. `undefined` desliga a checagem — é o caso da reversão de
  // emergência, cujo propósito é justamente encerrar uma operação num mundo que
  // já divergiu. Qualquer outro valor (inclusive `null`) é conferido.
  expectedActiveGenerationId?: string | null;
  // Motivo fechado, só para diagnóstico. Nunca carrega core bruto.
  reason: string;
}

// Staging físico de uma geração AMARRADO a uma operação administrativa
// (GOAL-17B-002D-C1).
//
// Ele existe porque `prepareHistoryGeneration` e o patch do receipt seriam duas
// transações distintas: uma queda entre elas deixaria uma geração física órfã
// que nenhum receipt explica, e o diagnóstico do 002D-A2 não teria como decidir
// de quem ela é. Aqui a geração nasce e o receipt passa a nomeá-la na MESMA
// transação — ou nenhuma das duas coisas acontece.
//
// O `generationId` é sempre gerado pelo adapter: um backup externo nunca
// fornece identidade física, e o importador também não escolhe.
export interface StageHistoryGenerationForOperationInput {
  operationId: string;
  // Precisa ser `'staged'`: só uma operação que ainda não aplicou efeito algum
  // pode ganhar staging físico.
  expectedStatus: StorageOperationStatus;
  // Precisa ser `'import'` ou `'reset'`: os dois criam geração nova.
  // Restauração e rollback não passam por esta primitiva.
  expectedKind: StorageOperationKind;
  // CAS: a geração ativa precisa continuar sendo exatamente esta.
  expectedActiveGenerationId: string;
  history: readonly WorkoutSession[];
}

export interface StageHistoryGenerationForOperationResult {
  generationId: string;
  receipt: StorageOperationReceipt;
  manifest: HistoryGenerationManifest;
}

// Registro físico de uma sessão dentro de uma geração, exatamente como está
// gravado. `digest` é o digest persistido junto do registro — `null` marca
// registro legado sem digest individual. Nada aqui é normalizado ou reparado.
export interface HistoryGenerationRecordSnapshot {
  generationId: string;
  sessionId: string;
  order: number;
  session: WorkoutSession;
  digest: string | null;
}

// Retrato coerente de TODO o estado administrativo, capturado numa única
// transação readonly. É a base do diagnóstico do 002D-A2: sem ele, cada leitura
// independente podia descrever um momento diferente e o snapshot combinava
// dados incompatíveis.
//
// `fingerprint` é determinístico e cobre metadata, ponteiros, manifests,
// conteúdo canônico de todos os registros de histórico, todos os receipts
// administrativos e todos os CompletionReceipts pendentes. Dois snapshots com
// o mesmo fingerprint descrevem o mesmo estado físico.
export interface StorageAdministrationSnapshotRead {
  metadata: HistoryStorageMetadata;
  activeGenerationId: string | null;
  migrationGenerationId: string | null;
  generations: HistoryGenerationSummary[];
  manifests: HistoryGenerationManifest[];
  // Registros da geração ativa, ordenados por `order`. Vazio quando não há
  // geração ativa — nunca fabricado para uma geração que existe.
  activeGenerationRecords: HistoryGenerationRecordSnapshot[];
  activeGenerationManifest: HistoryGenerationManifest | null;
  activeGenerationPresent: boolean;
  operationReceipts: StorageOperationReceipt[];
  unsettledOperations: StorageOperationReceipt[];
  pendingCompletionReceipts: WorkoutCompletionReceipt[];
  fingerprint: string;
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
  // Só cria o receipt quando nenhuma outra operação administrativa está em
  // aberto e a geração ativa confere com o CAS. Varredura, releitura de
  // metadata e gravação (`add`, nunca `put`) acontecem numa única transação.
  createStorageOperationReceiptIfIdle(
    input: CreateStorageOperationReceiptIfIdleInput,
  ): Promise<StorageOperationReceipt>;
  // Retrato administrativo coerente numa única transação readonly, incluindo os
  // registros necessários para verificar integralmente a geração ativa. Nunca
  // escreve, nunca repara, nunca fabrica lista vazia por store ausente.
  readStorageAdministrationSnapshot(): Promise<StorageAdministrationSnapshotRead>;
  // Transição atômica que só acontece quando o estado administrativo é
  // inequívoco: exatamente um receipt não terminal, que é o `operationId`
  // informado, zero CompletionReceipt pendente e CAS da geração ativa — tudo na
  // mesma transação readwrite da escrita.
  transitionStorageOperationIfUnambiguous(
    input: TransitionStorageOperationIfUnambiguousInput,
  ): Promise<StorageOperationReceipt>;
  // Compensação: leva a operação para `reverted` e só para lá. Mesma transação
  // de três stores, mesma exigência de operação única e não ambígua, mesma
  // validação de todos os registros — mas sem bloquear por CompletionReceipt
  // pendente, porque reverter apenas REDUZ o conflito. Sem ela, um receipt que
  // avançou sobre um core que depois divergiu ficaria preso para sempre.
  revertStorageOperationAfterTransitionConflict(
    input: RevertStorageOperationAfterTransitionConflictInput,
  ): Promise<StorageOperationReceipt>;
  transitionStorageOperationReceipt(
    operationId: string,
    expectedStatus: StorageOperationStatus,
    nextStatus: StorageOperationStatus,
    patch?: StorageOperationReceiptPatch,
  ): Promise<StorageOperationReceipt>;
  // Cria uma geração física NOVA e inativa e grava `stagedGenerationId` no
  // receipt da operação, tudo numa única transação readwrite. Nunca toca em
  // `metadata.migrationGeneration`: o ponteiro de staging faria
  // `metadataMatchesV2` recusar a hidratação enquanto a operação estivesse em
  // andamento, e o vínculo geração ↔ operação já vive no receipt.
  stageHistoryGenerationForOperation(
    input: StageHistoryGenerationForOperationInput,
  ): Promise<StageHistoryGenerationForOperationResult>;
  listHistoryGenerations(): Promise<HistoryGenerationSummary[]>;
  readVerifiedHistoryGeneration(generationId: string): Promise<VerifiedHistoryGeneration>;
  rollbackToHistoryGeneration(
    input: RollbackHistoryGenerationInput,
  ): Promise<RollbackHistoryGenerationResult>;
}

export type AdministrableWorkoutHistoryStorageAdapter =
  WorkoutHistoryStorageAdapter & WorkoutHistoryAdministrationAdapter;
