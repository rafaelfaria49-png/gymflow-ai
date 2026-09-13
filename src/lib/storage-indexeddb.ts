import type { WorkoutSession } from '../types';
import type {
  CreateStorageOperationReceiptIfIdleInput,
  HistoryGenerationSummary,
  HistoryStorageMetadata,
  LegacySnapshotRecord,
  RevertStorageOperationAfterTransitionConflictInput,
  RollbackHistoryGenerationInput,
  RollbackHistoryGenerationResult,
  StageHistoryGenerationForOperationInput,
  StageHistoryGenerationForOperationResult,
  StorageAdministrationSnapshotRead,
  StorageAdministrationSnapshotWithRetirementJournal,
  TransitionStorageOperationIfUnambiguousInput,
  VerifiedHistoryGeneration,
  WorkoutHistoryAdministrationAdapter,
  WorkoutHistoryStorageAdapter,
} from './storage-adapter';
import {
  type WorkoutCompletionReceipt,
  isWorkoutCompletionReceipt,
} from './storage-completion-receipt';
import {
  type HistoryGenerationIntegrityReason,
  type HistoryGenerationManifest,
  type HistoryGenerationSnapshot,
  chainGenerationDigest,
  computeOrderedDigestFromSessionDigests,
  createGenerationManifest,
  digestWorkoutSession,
  digestWorkoutSessions,
  isHistoryGenerationManifest,
  serializeWorkoutSessionCanonically,
  sha256Checksum,
  verifyHistoryGeneration,
} from './storage-history-integrity';
import {
  type StorageOperationReceipt,
  type StorageOperationReceiptPatch,
  type StorageOperationStatus,
  canTransitionStorageOperation,
  declaredSupersedesMatchLiveRelations,
  detectStorageOperationSupersessionCycle,
  isStorageOperationReceipt,
  listActivePredecessorSourceOperationIds,
  storageOperationFinalGenerationId,
  validateStorageOperationSupersession,
} from './storage-operation-receipt';
import {
  decideStorageRetirementJournalCas,
  isStorageRetirementJournal,
  STORAGE_RETIREMENT_JOURNAL_METADATA_KEY,
  toStorageRetirementJournalWriteResult,
  type CompareAndPutStorageRetirementJournalInput,
  type StorageRetirementJournal,
  type StorageRetirementJournalWriteResult,
} from './storage-retirement-journal';

import { isCivilDateString, isLedgerMigrationMarker, isNutritionDay } from './nutrition/ledger-types';
import type { LedgerMigrationMarker, NutritionDay } from './nutrition/ledger-types';
import {
  NUTRITION_ADMIN_FENCE_KEY,
  NUTRITION_ADMIN_FENCE_TTL_MS,
  buildNutritionAdminFenceV1,
  isNutritionAdminFenceActive,
  isNutritionAdminFenceV1,
  newNutritionAdminFenceId,
  NutritionAdminFencedError,
  type NutritionAdminFenceOperationKind,
  type NutritionAdminFenceV1,
} from './nutrition/admin-fence';

export const GYMFLOW_INDEXEDDB_NAME = 'gymflow-persistence';
// v2 adicionou o manifest por geração; v3 adicionou os receipts duráveis da
// finalização; v4 adicionou os receipts das operações administrativas; v5
// adiciona o ledger nutricional (`nutritionDays` + `nutritionMetadata`). O upgrade
// é idempotente e preserva todos os stores e registros já existentes — cada
// store novo só é criado quando ainda não existe.
export const GYMFLOW_INDEXEDDB_VERSION = 5;

// Versão lógica do schema de histórico exposta em metadata e no core físico v2.
// Continua 1: nenhum formato observável pelo envelope mudou.
export const HISTORY_METADATA_SCHEMA_VERSION = 1;

export const WORKOUT_HISTORY_STORE = 'workoutHistory';
export const METADATA_STORE = 'metadata';
export const LEGACY_SNAPSHOTS_STORE = 'legacySnapshots';
export const GENERATION_MANIFESTS_STORE = 'generationManifests';
export const COMPLETION_RECEIPTS_STORE = 'completionReceipts';
export const STORAGE_OPERATION_RECEIPTS_STORE = 'storageOperationReceipts';
// v5 (NUT-004A): ledger nutricional. `nutritionDays` usa a data civil como chave
// natural; `nutritionMetadata` é chave/valor (activeDate + migration marker).
export const NUTRITION_DAYS_STORE = 'nutritionDays';
export const NUTRITION_METADATA_STORE = 'nutritionMetadata';

// Chaves do store `nutritionMetadata` (NUT-004A). O store `metadata` do workoutHistory
// não é tocado: o ledger nutricional tem seu próprio namespace chave/valor.
const NUTRITION_ACTIVE_DATE_KEY = 'activeNutritionDate';
const NUTRITION_MIGRATION_MARKER_KEY = 'nutritionMigrationMarker';
// GOAL-087: fence administrativo nutricional durável. Vive no store EXISTENTE
// `nutritionMetadata` — sem novo object store, sem bump de IDB (continua v5).
export { NUTRITION_ADMIN_FENCE_KEY };
export type { NutritionAdminFenceOperationKind, NutritionAdminFenceV1 };
export { NutritionAdminFencedError };

const BY_GENERATION_INDEX = 'byGeneration';
const BY_GENERATION_SESSION_INDEX = 'byGenerationSession';
const BY_RECEIPT_STATUS_INDEX = 'byStatus';
const BY_OPERATION_KIND_INDEX = 'byKind';
const BY_OPERATION_UPDATED_AT_INDEX = 'byUpdatedAt';
const LEGACY_SNAPSHOT_ID = 'v1-rollback';
const INTERNAL_NEXT_ORDER_PREFIX = 'generationNextOrder:';
const ADMINISTRATION_CAS_STORES = [
  METADATA_STORE,
  WORKOUT_HISTORY_STORE,
  GENERATION_MANIFESTS_STORE,
  STORAGE_OPERATION_RECEIPTS_STORE,
  COMPLETION_RECEIPTS_STORE,
] as const;

// Status administrativos que ainda podem avançar. `settled` e `reverted` são
// terminais e nunca aparecem na listagem de operações em aberto.
const UNSETTLED_OPERATION_STATUSES: readonly StorageOperationStatus[] = [
  'staged',
  'activating',
  'activated',
];

const METADATA_DEFAULTS: HistoryStorageMetadata = {
  activeGeneration: null,
  migrationGeneration: null,
  schemaVersion: HISTORY_METADATA_SCHEMA_VERSION,
  migrationStatus: 'not-started',
  migratedAt: null,
  sourceStorageVersion: null,
};

type MetadataKey = keyof HistoryStorageMetadata;

interface HistoryRecord {
  sessionId: string;
  generationId: string;
  order: number;
  session: WorkoutSession;
  // Digest canônico do conteúdo, gravado na mesma transação do registro.
  digest: string;
}

interface MetadataRecord {
  key: string;
  value: unknown;
}

interface StoredLegacySnapshotRecord extends LegacySnapshotRecord {
  snapshotId: string;
}

// Prova síncrona e imutável do conteúdo físico verificado de uma geração.
//
// Ela existe porque a verificação de integridade depende de `crypto.subtle`, que
// é assíncrono e desativaria a transação IndexedDB. A prova é montada fora da
// transação, a partir da MESMA leitura que alimentou a verificação, e é
// reconferida dentro da transação de escrita por comparação de strings — sem
// crypto, sem await estranho à transação.
interface HistoryGenerationRecordProof {
  readonly order: number;
  readonly sessionId: string;
  // `null` marca registro legado sem digest individual. Isso nunca torna a
  // comparação permissiva: a serialização canônica continua obrigatória.
  readonly digest: string | null;
  readonly canonical: string;
}

export interface IndexedDbHistoryStorageOptions {
  factory?: IDBFactory;
  databaseName?: string;
  generationIdFactory?: () => string;
  now?: () => Date;
  subtleCrypto?: SubtleCrypto | null;
}

export class IndexedDbUnavailableError extends Error {
  constructor() {
    super('IndexedDB indisponível neste ambiente.');
    this.name = 'IndexedDbUnavailableError';
  }
}

export class IndexedDbNotOpenError extends Error {
  constructor() {
    super('O adapter IndexedDB precisa ser aberto antes da operação.');
    this.name = 'IndexedDbNotOpenError';
  }
}

export class LegacySnapshotCryptoUnavailableError extends Error {
  constructor() {
    super('Web Crypto indisponível para calcular o checksum do snapshot.');
    this.name = 'LegacySnapshotCryptoUnavailableError';
  }
}

export class LegacySnapshotIntegrityError extends Error {
  readonly originalError: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = 'LegacySnapshotIntegrityError';
    this.originalError = originalError;
  }
}

export class HistoryManifestIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HistoryManifestIntegrityError';
  }
}

export class CompletionReceiptIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompletionReceiptIntegrityError';
  }
}

export class StorageOperationReceiptIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageOperationReceiptIntegrityError';
  }
}

// Falha de compare-and-swap: registro ausente, status divergente ou transição
// proibida. Nenhuma delas altera o registro persistido.
export class StorageOperationTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageOperationTransitionError';
  }
}

// Em que ponto do protocolo de transição o conflito apareceu.
export type StorageOperationTransitionPhase =
  | 'pre-transition'
  | 'post-transition'
  | 'compensation';

// Razões fechadas do conflito de transição. Nenhuma delas carrega core bruto.
export type StorageOperationTransitionConflictReason =
  | 'core-unreadable'
  | 'core-missing-before-transition'
  | 'core-invalid-before-transition'
  | 'core-changed-before-transition'
  | 'receipt-incompatible-before-transition'
  | 'core-changed-during-transition'
  | 'receipt-missing-after-transition'
  | 'receipt-status-unexpected-after-transition'
  | 'active-generation-changed-after-transition'
  | 'receipt-incompatible-after-transition'
  | 'administration-unreadable-after-transition';

// Último status conhecido do receipt. `missing` é "o registro não existe mais";
// `unknown` é "nem a releitura funcionou" — os dois são honestos e diferentes.
export type StorageOperationFinalReceiptStatus =
  | StorageOperationStatus
  | 'missing'
  | 'unknown';

// A transição administrativa foi recusada porque o core v2 do `localStorage`
// (que não participa da transação IndexedDB) divergiu, ou porque o estado
// projetado não se confirmou depois do commit.
//
// A mensagem nunca contém core bruto — nem `previousCoreRaw`, nem
// `targetCoreRaw`, nem o core atual. Quando é útil identificar qual core foi
// observado, o campo `observedCoreDigest` carrega apenas o checksum.
export class StorageOperationTransitionConflictError extends Error {
  readonly operationId: string;
  readonly expectedStatus: StorageOperationStatus;
  readonly attemptedStatus: StorageOperationStatus;
  readonly phase: StorageOperationTransitionPhase;
  readonly reason: StorageOperationTransitionConflictReason;
  readonly compensation: StorageOperationCompensationOutcome;
  readonly compensationCause: unknown;
  // Causa da falha ao RELER o status final depois de uma compensação que já
  // tinha falhado. Nunca é descartada: sem ela, `finalReceiptStatus: 'unknown'`
  // seria um silêncio.
  readonly finalStatusReadCause: unknown;
  readonly finalReceiptStatus: StorageOperationFinalReceiptStatus;
  readonly observedCoreDigest: string | null;

  constructor(message: string, options: {
    operationId: string;
    expectedStatus: StorageOperationStatus;
    attemptedStatus: StorageOperationStatus;
    phase: StorageOperationTransitionPhase;
    reason: StorageOperationTransitionConflictReason;
    compensation?: StorageOperationCompensationOutcome;
    compensationCause?: unknown;
    finalStatusReadCause?: unknown;
    finalReceiptStatus?: StorageOperationFinalReceiptStatus;
    observedCoreDigest?: string | null;
    cause?: unknown;
  }) {
    super(message, 'cause' in options ? { cause: options.cause } : undefined);
    this.name = 'StorageOperationTransitionConflictError';
    this.operationId = options.operationId;
    this.expectedStatus = options.expectedStatus;
    this.attemptedStatus = options.attemptedStatus;
    this.phase = options.phase;
    this.reason = options.reason;
    this.compensation = options.compensation ?? 'not-attempted';
    this.compensationCause = options.compensationCause;
    this.finalStatusReadCause = options.finalStatusReadCause;
    this.finalReceiptStatus = options.finalReceiptStatus ?? 'unknown';
    this.observedCoreDigest = options.observedCoreDigest ?? null;
  }
}

// Bloqueio fail-closed de `createStorageOperationReceiptIfIdle`: já existe um
// receipt administrativo não terminal. Carrega o receipt existente para que o
// chamador (002D-A2) saiba exatamente qual operação está em aberto sem uma
// segunda leitura.
export class StorageOperationAlreadyInProgressError extends Error {
  readonly existing: StorageOperationReceipt;

  constructor(existing: StorageOperationReceipt) {
    super(
      `Já existe uma operação administrativa em aberto (${existing.operationId}, status ${existing.status}).`,
    );
    this.name = 'StorageOperationAlreadyInProgressError';
    this.existing = existing;
  }
}

// Resultado da compensação `staged → reverted` tentada pelo 002D-A2 quando o
// begin detecta divergência depois de já ter criado o receipt.
export type StorageOperationCompensationOutcome = 'not-attempted' | 'reverted' | 'failed';

// CAS de `createStorageOperationReceiptIfIdle` falhou: a geração ativa mudou
// entre a leitura e a escrita, ou o operationId já existe. A transação inteira
// é abortada — nenhum receipt fica gravado pela metade.
//
// Também é o erro do begin do 002D-A2 quando a revalidação pós-criação recusa a
// operação. Nesse caminho ele carrega, de forma estruturada e nunca só no texto:
// qual operação, a causa original do conflito (`cause`), o que aconteceu com a
// compensação e o último status conhecido do receipt. Compensação que falhou
// **nunca** é relatada como `reverted`.
export class StorageOperationBeginConflictError extends Error {
  readonly operationId: string | null;
  readonly compensation: StorageOperationCompensationOutcome;
  readonly compensationCause: unknown;
  // Causa da falha ao reler o status final depois de uma compensação que já
  // tinha falhado. Antes ela era capturada e descartada; agora viaja junto,
  // porque `finalReceiptStatus: 'unknown'` sem causa é silêncio.
  readonly finalStatusReadCause: unknown;
  readonly finalReceiptStatus: StorageOperationFinalReceiptStatus | null;

  constructor(message: string, options: {
    cause?: unknown;
    operationId?: string | null;
    compensation?: StorageOperationCompensationOutcome;
    compensationCause?: unknown;
    finalStatusReadCause?: unknown;
    finalReceiptStatus?: StorageOperationFinalReceiptStatus | null;
  } = {}) {
    super(message, 'cause' in options ? { cause: options.cause } : undefined);
    this.name = 'StorageOperationBeginConflictError';
    this.operationId = options.operationId ?? null;
    this.compensation = options.compensation ?? 'not-attempted';
    this.compensationCause = options.compensationCause;
    this.finalStatusReadCause = options.finalStatusReadCause;
    this.finalReceiptStatus = options.finalReceiptStatus ?? null;
  }
}

// Bloqueio fail-closed por conclusão de treino pendente dentro de uma transação
// administrativa. O receipt de conclusão nunca é alterado nem liquidado aqui:
// ele só impede a operação administrativa de nascer ou avançar.
export class StorageCompletionPendingError extends Error {
  readonly pendingReceiptIds: readonly string[];

  constructor(pendingReceiptIds: readonly string[]) {
    super(
      `Existe conclusão de treino pendente (${pendingReceiptIds.join(', ') || 'sem id legível'});`
      + ' a operação administrativa não pode prosseguir.',
    );
    this.name = 'StorageCompletionPendingError';
    this.pendingReceiptIds = [...pendingReceiptIds];
  }
}

export type StorageOperationAmbiguityReason =
  | 'no-unsettled-operation'
  | 'multiple-unsettled-operations'
  | 'operation-not-the-unsettled-one';

// A transação de transição encontrou um estado administrativo em que escolher
// qual operação avançar seria um chute. Ela aborta sem tocar em nada.
export class StorageOperationAmbiguousStateError extends Error {
  readonly reason: StorageOperationAmbiguityReason;
  readonly unsettledOperationIds: readonly string[];

  constructor(reason: StorageOperationAmbiguityReason, message: string, unsettledOperationIds: readonly string[] = []) {
    super(message);
    this.name = 'StorageOperationAmbiguousStateError';
    this.reason = reason;
    this.unsettledOperationIds = [...unsettledOperationIds];
  }
}

// O store `metadata` só admite chaves textuais. Uma chave de outro tipo torna a
// enumeração de gerações não confiável — e a enumeração é justamente a visão que
// um runtime de recuperação usaria para decidir.
export class HistoryMetadataIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HistoryMetadataIntegrityError';
  }
}

// Dia nutricional ou metadado nutricional com formato inválido no storage.
// Nada é reparado, convertido ou apagado: a leitura apenas se recusa a adivinhar.
export class NutritionDayIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NutritionDayIntegrityError';
  }
}

export class HistoryGenerationIntegrityError extends Error {
  readonly reason: HistoryGenerationIntegrityReason;

  constructor(reason: HistoryGenerationIntegrityReason, message: string) {
    super(message);
    this.name = 'HistoryGenerationIntegrityError';
    this.reason = reason;
  }
}

// Falha de pré-condição do rollback físico: ponteiro ativo obsoleto, staging
// divergente ou manifest alterado entre a verificação e o commit. A transação é
// abortada inteira, então metadata continua exatamente como estava.
export class HistoryRollbackConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HistoryRollbackConflictError';
  }
}

// Falha de pré-condição do staging amarrado a uma operação administrativa:
// ponteiro de staging já ocupado, geração ativa obsoleta ou identidade física
// já existente. A transação é abortada inteira — nem a geração nem o patch do
// receipt sobrevivem.
export class HistoryStagingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HistoryStagingConflictError';
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha em uma operação IndexedDB.'));
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Transação IndexedDB abortada.'));
    transaction.onerror = () => {
      // O evento abort contém o erro final e encerra a promise.
    };
  });
}

function abortQuietly(transaction: IDBTransaction): void {
  try {
    transaction.abort();
  } catch {
    // A transação já pode ter sido abortada ou concluída pelo próprio IndexedDB.
  }
}

function defaultGenerationId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `generation-${globalThis.crypto.randomUUID()}`;
  }
  return `generation-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function assertSessionIdentity(session: WorkoutSession): void {
  if (!session.id || typeof session.id !== 'string') {
    throw new Error('Toda sessão precisa de um id estável.');
  }
}

// `undefined` significa "campo não informado no patch"; `null` continua sendo um
// valor gravável, então o patch consegue voltar um campo para nulo.
function patchedField<T>(patched: T | undefined, current: T): T {
  return patched === undefined ? current : patched;
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

function sortHistoryRecords(records: readonly HistoryRecord[]): HistoryRecord[] {
  return [...records].sort((left, right) => left.order - right.order);
}

function buildGenerationProof(
  records: readonly HistoryRecord[],
): readonly HistoryGenerationRecordProof[] {
  return Object.freeze(records.map((record) => Object.freeze({
    order: record.order,
    sessionId: record.sessionId,
    digest: record.digest ?? null,
    canonical: serializeWorkoutSessionCanonically(record.session),
  })));
}

// Reconferência síncrona dentro da transação de rollback.
//
// Digest persistido sozinho não basta: uma sessão pode ser alterada mantendo o
// digest antigo gravado. Por isso o conteúdo canônico completo é comparado
// sempre, inclusive quando o digest é `null`.
function assertGenerationMatchesProof(
  generationId: string,
  records: readonly HistoryRecord[],
  proof: readonly HistoryGenerationRecordProof[],
): void {
  const ordered = sortHistoryRecords(records);
  if (ordered.length !== proof.length) {
    throw new HistoryRollbackConflictError(
      `A geração ${generationId} tinha ${proof.length} registros na verificação e tem ${ordered.length} no commit.`,
    );
  }
  for (let index = 0; index < ordered.length; index += 1) {
    const record = ordered[index];
    const expected = proof[index];
    if (record.sessionId !== expected.sessionId) {
      throw new HistoryRollbackConflictError(
        `A posição ${index} da geração ${generationId} mudou de ${expected.sessionId} para ${record.sessionId}.`,
      );
    }
    if (record.order !== expected.order) {
      throw new HistoryRollbackConflictError(
        `A ordem física de ${expected.sessionId} mudou de ${expected.order} para ${record.order}.`,
      );
    }
    if ((record.digest ?? null) !== expected.digest) {
      throw new HistoryRollbackConflictError(
        `O digest gravado de ${expected.sessionId} mudou entre a verificação e o commit.`,
      );
    }
    if (serializeWorkoutSessionCanonically(record.session) !== expected.canonical) {
      throw new HistoryRollbackConflictError(
        `O conteúdo de ${expected.sessionId} mudou entre a verificação e o commit.`,
      );
    }
  }
}

// Ativa primeiro, staged depois, o resto por tempo. A ordem é diagnóstica: ela
// não diz nada sobre integridade.
function generationOrderRank(summary: HistoryGenerationSummary): number {
  if (summary.isActive) return 0;
  if (summary.isStaged) return 1;
  return 2;
}

interface GenerationEnumeration {
  activeGeneration: string | null;
  migrationGeneration: string | null;
  // `null` marca manifest presente porém ilegível: presença é reportada,
  // integridade não é presumida.
  manifests: Map<string, HistoryGenerationManifest | null>;
  summaries: HistoryGenerationSummary[];
}

// Enumeração pura compartilhada por `listHistoryGenerations` e pelo snapshot
// administrativo atômico. Uma implementação só: duas versões divergentes da
// mesma leitura seriam exatamente o tipo de inconsistência que o 002D-A2 existe
// para impedir.
interface MetadataPointers {
  activeGeneration: string | null;
  migrationGeneration: string | null;
  stagedMarkers: Set<string>;
}

// Leitura dos ponteiros estruturais do store `metadata`.
//
// `activeGeneration` e `migrationGeneration` só admitem `string` ou `null`.
// Qualquer outro tipo (number, Date, ArrayBuffer, objeto, array) invalida a
// leitura inteira com `HistoryMetadataIntegrityError`. Converter para `null`
// — o que esta função fazia antes do corretivo 038 — transformava metadata
// corrompida em "não existe geração ativa", um diagnóstico falso que apontava
// para `core-invalid` em vez de `metadata-malformed`. Nada é reparado,
// convertido ou apagado: a leitura apenas se recusa a adivinhar.
function readMetadataPointers(metadataRecords: readonly unknown[]): MetadataPointers {
  let activeGeneration: string | null = null;
  let migrationGeneration: string | null = null;
  const stagedMarkers = new Set<string>();
  for (const entry of metadataRecords) {
    const record = entry as Partial<MetadataRecord> | null;
    // Chave não textual não é ignorada nem convertida: ela invalida a
    // enumeração inteira. Devolver lista parcial seria esconder de um futuro
    // runtime de recuperação exatamente a geração que ele precisa ver.
    if (!record || typeof record.key !== 'string') {
      throw new HistoryMetadataIntegrityError(
        'O store metadata contém uma chave não textual; a enumeração de gerações não é confiável.',
      );
    }
    if (record.key === 'activeGeneration' || record.key === 'migrationGeneration') {
      if (record.value !== null && record.value !== undefined && typeof record.value !== 'string') {
        throw new HistoryMetadataIntegrityError(
          `O ponteiro ${record.key} da metadata não é textual nem nulo`
          + ` (tipo ${describeMetadataValueType(record.value)}); a metadata está malformada.`,
        );
      }
      const value = typeof record.value === 'string' ? record.value : null;
      if (record.key === 'activeGeneration') activeGeneration = value;
      else migrationGeneration = value;
    } else if (record.key.startsWith(INTERNAL_NEXT_ORDER_PREFIX)) {
      stagedMarkers.add(record.key.slice(INTERNAL_NEXT_ORDER_PREFIX.length));
    }
  }
  return { activeGeneration, migrationGeneration, stagedMarkers };
}

// Descrição de tipo suficiente para o diagnóstico, nunca o valor em si.
function describeMetadataValueType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'Date';
  if (value instanceof ArrayBuffer) return 'ArrayBuffer';
  if (ArrayBuffer.isView(value)) return 'ArrayBufferView';
  return typeof value;
}

function summarizeGenerations(
  metadataRecords: readonly unknown[],
  manifestRecords: readonly unknown[],
  recordCounts: ReadonlyMap<string, number>,
): GenerationEnumeration {
  const { activeGeneration, migrationGeneration, stagedMarkers } = readMetadataPointers(metadataRecords);

  const manifests = new Map<string, HistoryGenerationManifest | null>();
  for (const record of manifestRecords) {
    const candidate = record as Record<string, unknown> | null;
    const generationId = typeof candidate?.generationId === 'string' ? candidate.generationId : null;
    if (!generationId) continue;
    manifests.set(generationId, isHistoryGenerationManifest(record) ? record : null);
  }

  const generationIds = new Set<string>([
    ...recordCounts.keys(),
    ...manifests.keys(),
    ...stagedMarkers,
  ]);
  if (activeGeneration) generationIds.add(activeGeneration);
  if (migrationGeneration) generationIds.add(migrationGeneration);

  const summaries = Array.from(generationIds, (generationId): HistoryGenerationSummary => {
    const hasManifest = manifests.has(generationId);
    const manifest = manifests.get(generationId) ?? null;
    const recordCount = recordCounts.get(generationId) ?? 0;
    return {
      generationId,
      isActive: generationId === activeGeneration,
      isStaged: generationId === migrationGeneration,
      hasManifest,
      hasRecords: recordCount > 0,
      recordCount,
      manifestSessionCount: manifest ? manifest.sessionCount : null,
      orderedDigest: manifest ? manifest.orderedDigest : null,
      // Flag PERSISTIDA do manifest, não prova de integridade. Ver
      // `HistoryGenerationSummary.verified` em storage-adapter.ts.
      verified: hasManifest ? Boolean(manifest?.verified) : null,
      createdAt: manifest ? manifest.createdAt : null,
      updatedAt: manifest ? manifest.updatedAt : null,
    };
  }).sort((left, right) => {
    const rankDelta = generationOrderRank(left) - generationOrderRank(right);
    if (rankDelta !== 0) return rankDelta;
    const leftTime = left.updatedAt ?? left.createdAt;
    const rightTime = right.updatedAt ?? right.createdAt;
    if (leftTime !== rightTime) {
      if (leftTime === null) return 1;
      if (rightTime === null) return -1;
      return rightTime.localeCompare(leftTime);
    }
    return left.generationId.localeCompare(right.generationId);
  });

  return { activeGeneration, migrationGeneration, manifests, summaries };
}

// Impressão digital determinística do estado administrativo inteiro.
//
// Ela existe para o double-read do 002D-A2: dois snapshots com o mesmo
// fingerprint descrevem o mesmo estado físico, então o diagnóstico não está
// combinando momentos diferentes. Cobre metadata, ponteiros, manifests, o
// conteúdo canônico de TODOS os registros de histórico (não só a contagem — uma
// sessão trocada mantendo id, ordem e digest tem de mudar o fingerprint), todos
// os receipts administrativos e todos os CompletionReceipts pendentes.
//
// Desde o corretivo 038 o material canônico dos receipts inclui o CONTEÚDO
// INTEGRAL de `previousCoreRaw` e `targetCoreRaw` (via checksum SHA-256 do raw
// completo, ou o raw inteiro quando não há Web Crypto). Antes eles entravam só
// pelo comprimento, e dois cores diferentes de mesmo tamanho produziam o mesmo
// fingerprint — o double-read não enxergava a troca.
function fingerprintAdministrationSnapshot(input: {
  metadataRecords: readonly unknown[];
  manifests: ReadonlyMap<string, HistoryGenerationManifest | null>;
  historyRecords: readonly HistoryRecord[];
  operationReceipts: readonly StorageOperationReceipt[];
  pendingCompletionReceipts: readonly WorkoutCompletionReceipt[];
  // operationId → marcadores determinísticos dos dois cores do receipt.
  receiptCoreMarkers: ReadonlyMap<string, ReceiptCoreMarkers>;
}): string {
  const metadata = (input.metadataRecords as Partial<MetadataRecord>[])
    // E7A4: o journal permanece fora do fingerprint para a prova continuar
    // revalidável após recorded. A corrida é fechada por compare-and-put, não
    // por incluir `retirementJournal:v1` no retrato global.
    .filter((record) => record?.key !== STORAGE_RETIREMENT_JOURNAL_METADATA_KEY)
    .map((record) => [String(record?.key), JSON.stringify(record?.value ?? null)] as const)
    .sort((left, right) => left[0].localeCompare(right[0]));

  const manifests = Array.from(input.manifests.entries())
    .map(([generationId, manifest]) => [
      generationId,
      manifest === null
        ? 'manifest-ilegivel'
        : [
          manifest.generationId,
          manifest.sessionCount,
          manifest.orderedDigest,
          manifest.createdAt,
          manifest.updatedAt,
          manifest.verified,
        ].join('|'),
    ] as const)
    .sort((left, right) => left[0].localeCompare(right[0]));

  const history = input.historyRecords
    .map((record) => [
      record.generationId,
      record.order,
      record.sessionId,
      record.digest ?? 'sem-digest',
      serializeWorkoutSessionCanonically(record.session),
    ].join('|'))
    .sort();

  const operations = input.operationReceipts
    .map((receipt) => {
      const markers = input.receiptCoreMarkers.get(receipt.operationId);
      return [
        receipt.operationId,
        receipt.kind,
        receipt.status,
        receipt.createdAt,
        receipt.updatedAt,
        receipt.previousGenerationId,
        receipt.stagedGenerationId ?? 'nenhuma',
        receipt.kind === 'restore' ? receipt.targetGenerationId : 'nenhuma',
        receipt.sourceDigest ?? 'nenhum',
        receipt.supersedesOperationIds && receipt.supersedesOperationIds.length > 0
          ? [...receipt.supersedesOperationIds].sort().join(',')
          : 'nenhuma',
        markers?.previousCoreRaw ?? 'marcador-ausente',
        markers?.targetCoreRaw ?? 'marcador-ausente',
      ].join('|');
    })
    .sort();

  const completions = input.pendingCompletionReceipts
    .map((receipt) => [
      receipt.receiptId,
      receipt.sessionId,
      receipt.generationId,
      receipt.sessionDigest,
      receipt.status,
      receipt.createdAt,
    ].join('|'))
    .sort();

  return JSON.stringify({ metadata, manifests, history, operations, completions });
}

interface ReceiptCoreMarkers {
  previousCoreRaw: string;
  targetCoreRaw: string;
}

// Marcador determinístico do conteúdo INTEGRAL de um core bruto guardado num
// receipt. Reaproveita `sha256Checksum` (a mesma função de sempre, nenhuma
// definição paralela) e é sempre calculado FORA da transação IndexedDB.
//
// Sem Web Crypto o marcador carrega o raw inteiro: o fingerprint fica maior,
// mas continua determinístico e continua distinguindo dois raws de mesmo
// comprimento. O que ele nunca faz é cair para comprimento, presença, prefixo
// ou sufixo.
async function markReceiptCoreRaw(
  raw: string | null,
  subtleCrypto: SubtleCrypto | null | undefined,
): Promise<string> {
  if (raw === null) return 'nenhum';
  try {
    return await sha256Checksum(raw, subtleCrypto ?? undefined);
  } catch {
    return `raw:${raw}`;
  }
}

async function markReceiptCores(
  receipts: readonly StorageOperationReceipt[],
  subtleCrypto: SubtleCrypto | null | undefined,
): Promise<Map<string, ReceiptCoreMarkers>> {
  const markers = new Map<string, ReceiptCoreMarkers>();
  for (const receipt of receipts) {
    markers.set(receipt.operationId, {
      previousCoreRaw: await markReceiptCoreRaw(receipt.previousCoreRaw, subtleCrypto),
      targetCoreRaw: await markReceiptCoreRaw(receipt.targetCoreRaw, subtleCrypto),
    });
  }
  return markers;
}

function parseStorageOperationReceipts(
  records: readonly unknown[],
): StorageOperationReceipt[] {
  const operationReceipts: StorageOperationReceipt[] = [];
  for (const record of records) {
    if (!isStorageOperationReceipt(record)) {
      throw new StorageOperationReceiptIntegrityError(
        'Existe um receipt administrativo com formato inválido no armazenamento.',
      );
    }
    operationReceipts.push(record);
  }
  operationReceipts.sort((left, right) => (
    left.createdAt === right.createdAt
      ? left.operationId.localeCompare(right.operationId)
      : left.createdAt.localeCompare(right.createdAt)
  ));
  return operationReceipts;
}

function sameReceiptCoreInputs(
  left: readonly StorageOperationReceipt[],
  right: readonly StorageOperationReceipt[],
): boolean {
  return left.length === right.length && left.every((receipt, index) => {
    const other = right[index];
    return receipt.operationId === other.operationId
      && receipt.previousCoreRaw === other.previousCoreRaw
      && receipt.targetCoreRaw === other.targetCoreRaw;
  });
}

interface PreparedReceiptCoreState {
  receipts: StorageOperationReceipt[];
  markers: Map<string, ReceiptCoreMarkers>;
}

async function prepareReceiptCoreState(
  database: IDBDatabase,
  subtleCrypto: SubtleCrypto | null | undefined,
): Promise<PreparedReceiptCoreState> {
  const transaction = database.transaction(STORAGE_OPERATION_RECEIPTS_STORE, 'readonly');
  const completed = transactionResult(transaction);
  try {
    const records = await requestResult(
      transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE).getAll(),
    ) as unknown[];
    await completed;
    const receipts = parseStorageOperationReceipts(records);
    return {
      receipts,
      markers: await markReceiptCores(receipts, subtleCrypto),
    };
  } catch (error) {
    abortQuietly(transaction);
    await completed.catch(() => undefined);
    throw error;
  }
}

function readRetirementJournalRaw(metadataRecords: readonly unknown[]): unknown {
  for (const entry of metadataRecords) {
    const record = entry as Partial<MetadataRecord> | null;
    if (record?.key === STORAGE_RETIREMENT_JOURNAL_METADATA_KEY) {
      return Object.prototype.hasOwnProperty.call(record, 'value') ? record.value ?? null : null;
    }
  }
  return null;
}

function retirementJournalRecord(journal: StorageRetirementJournal): MetadataRecord {
  return {
    key: STORAGE_RETIREMENT_JOURNAL_METADATA_KEY,
    value: {
      schemaVersion: journal.schemaVersion,
      status: journal.status,
      candidateGenerationId: journal.candidateGenerationId,
      reservedPredecessorGenerationId: journal.reservedPredecessorGenerationId,
      currentGenerationId: journal.currentGenerationId,
      supersedeOperationIds: [...journal.supersedeOperationIds],
      originFingerprint: journal.originFingerprint,
      recordedAt: journal.recordedAt,
    },
  };
}

// Mantém a transação IndexedDB ativa enquanto o SHA-256 dos cores (fora de
// IDB) calcula o fingerprint. Sem isso o compare-and-put não cabe na mesma
// transação da revalidação. O ping para antes do put.
function startMetadataKeepAlive(transaction: IDBTransaction): () => void {
  let stopped = false;
  const ping = (): void => {
    if (stopped) return;
    try {
      const request = transaction.objectStore(METADATA_STORE).get(
        STORAGE_RETIREMENT_JOURNAL_METADATA_KEY,
      );
      request.onsuccess = () => {
        if (!stopped) ping();
      };
    } catch {
      stopped = true;
    }
  };
  ping();
  return () => {
    stopped = true;
  };
}

export async function checksumLegacySnapshot(
  raw: string,
  subtleCrypto: SubtleCrypto | null | undefined = globalThis.crypto?.subtle,
): Promise<string> {
  if (!subtleCrypto) throw new LegacySnapshotCryptoUnavailableError();
  return sha256Checksum(raw, subtleCrypto);
}

export class IndexedDbWorkoutHistoryStorage
implements WorkoutHistoryStorageAdapter, WorkoutHistoryAdministrationAdapter {
  private readonly factory: IDBFactory | undefined;
  private readonly databaseName: string;
  private readonly generationIdFactory: () => string;
  private readonly now: () => Date;
  private readonly subtleCrypto: SubtleCrypto | null | undefined;
  private database: IDBDatabase | null = null;

  constructor(options: IndexedDbHistoryStorageOptions = {}) {
    this.factory = options.factory ?? globalThis.indexedDB;
    this.databaseName = options.databaseName ?? GYMFLOW_INDEXEDDB_NAME;
    this.generationIdFactory = options.generationIdFactory ?? defaultGenerationId;
    this.now = options.now ?? (() => new Date());
    this.subtleCrypto = options.subtleCrypto === null
      ? null
      : options.subtleCrypto ?? globalThis.crypto?.subtle;
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.factory);
  }

  async open(): Promise<void> {
    if (this.database) return;
    if (!this.factory) throw new IndexedDbUnavailableError();

    const request = this.factory.open(this.databaseName, GYMFLOW_INDEXEDDB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const transaction = request.transaction;
      if (!transaction) throw new Error('Upgrade IndexedDB sem transação ativa.');

      if (!database.objectStoreNames.contains(WORKOUT_HISTORY_STORE)) {
        const historyStore = database.createObjectStore(WORKOUT_HISTORY_STORE, {
          keyPath: ['generationId', 'order'],
        });
        historyStore.createIndex(BY_GENERATION_INDEX, 'generationId', { unique: false });
        historyStore.createIndex(
          BY_GENERATION_SESSION_INDEX,
          ['generationId', 'sessionId'],
          { unique: true },
        );
      }

      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        const metadataStore = database.createObjectStore(METADATA_STORE, { keyPath: 'key' });
        for (const [key, value] of Object.entries(METADATA_DEFAULTS)) {
          metadataStore.put({ key, value } satisfies MetadataRecord);
        }
      }

      if (!database.objectStoreNames.contains(LEGACY_SNAPSHOTS_STORE)) {
        database.createObjectStore(LEGACY_SNAPSHOTS_STORE, { keyPath: 'snapshotId' });
      }

      // v2: manifest por geração. Criado sem tocar nos registros existentes —
      // gerações antigas ficam sem manifest e são bloqueadas por integridade em
      // vez de virarem histórico vazio.
      if (!database.objectStoreNames.contains(GENERATION_MANIFESTS_STORE)) {
        database.createObjectStore(GENERATION_MANIFESTS_STORE, { keyPath: 'generationId' });
      }

      // v3: receipts duráveis da finalização, também sem tocar nos registros.
      if (!database.objectStoreNames.contains(COMPLETION_RECEIPTS_STORE)) {
        const receiptStore = database.createObjectStore(COMPLETION_RECEIPTS_STORE, {
          keyPath: 'receiptId',
        });
        receiptStore.createIndex(BY_RECEIPT_STATUS_INDEX, 'status', { unique: false });
      }

      // v4: receipts das operações administrativas, em store próprio. O upgrade
      // é estritamente aditivo: nenhuma sessão é percorrida ou regravada,
      // metadata, manifests, completionReceipts e legacySnapshots ficam byte a
      // byte iguais e o schemaVersion lógico continua o mesmo.
      if (!database.objectStoreNames.contains(STORAGE_OPERATION_RECEIPTS_STORE)) {
        const operationStore = database.createObjectStore(STORAGE_OPERATION_RECEIPTS_STORE, {
          keyPath: 'operationId',
        });
        operationStore.createIndex(BY_RECEIPT_STATUS_INDEX, 'status', { unique: false });
        operationStore.createIndex(BY_OPERATION_KIND_INDEX, 'kind', { unique: false });
        operationStore.createIndex(BY_OPERATION_UPDATED_AT_INDEX, 'updatedAt', { unique: false });
      }

      // v5: ledger nutricional (NUT-004A). Estritamente aditivo: dois stores
      // novos, nenhum registro anterior percorrido ou regravado, nenhum índice
      // anterior tocado.
      if (!database.objectStoreNames.contains(NUTRITION_DAYS_STORE)) {
        database.createObjectStore(NUTRITION_DAYS_STORE, { keyPath: 'date' });
      }
      if (!database.objectStoreNames.contains(NUTRITION_METADATA_STORE)) {
        database.createObjectStore(NUTRITION_METADATA_STORE, { keyPath: 'key' });
      }
    };

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Falha ao abrir o IndexedDB.'));
      request.onblocked = () => reject(new Error('A abertura do IndexedDB foi bloqueada por outra conexão.'));
    });

    database.onversionchange = () => {
      database.close();
      if (this.database === database) this.database = null;
    };
    this.database = database;
  }

  async close(): Promise<void> {
    this.database?.close();
    this.database = null;
  }

  async readActiveHistory(): Promise<WorkoutSession[]> {
    const database = this.requireDatabase();
    const transaction = database.transaction([METADATA_STORE, WORKOUT_HISTORY_STORE], 'readonly');
    const completed = transactionResult(transaction);
    const activeGeneration = await this.readMetadataValue<string | null>(transaction, 'activeGeneration');
    if (!activeGeneration) {
      await completed;
      return [];
    }

    const records = await requestResult(
      transaction.objectStore(WORKOUT_HISTORY_STORE)
        .index(BY_GENERATION_INDEX)
        .getAll(activeGeneration),
    ) as HistoryRecord[];
    await completed;
    return records
      .sort((left, right) => left.order - right.order)
      .map((record) => record.session);
  }

  async replaceHistory(history: readonly WorkoutSession[]): Promise<string> {
    return this.stageGeneration(history, 'activeGeneration');
  }

  async prepareHistoryGeneration(history: readonly WorkoutSession[]): Promise<string> {
    return this.stageGeneration(history, 'migrationGeneration');
  }

  // Staging e replace gravam registros, digests, manifest e metadata na mesma
  // transação: a geração só existe quando o manifest confirmado a acompanha.
  private async stageGeneration(
    history: readonly WorkoutSession[],
    pointer: 'activeGeneration' | 'migrationGeneration',
  ): Promise<string> {
    for (const session of history) assertSessionIdentity(session);

    const database = this.requireDatabase();
    const generationId = this.generationIdFactory();
    if (!generationId) throw new Error('A geração precisa de um id estável.');

    // Os digests são calculados fora da transação: `crypto.subtle` resolve em
    // outra tarefa e desativaria a transação IndexedDB no meio do caminho.
    const digests = await digestWorkoutSessions(history, this.subtleCrypto);
    const orderedDigest = await computeOrderedDigestFromSessionDigests(digests, this.subtleCrypto);
    const createdAt = this.now().toISOString();

    const transaction = database.transaction(
      [WORKOUT_HISTORY_STORE, METADATA_STORE, GENERATION_MANIFESTS_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);
    const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
    const metadataStore = transaction.objectStore(METADATA_STORE);
    const manifestStore = transaction.objectStore(GENERATION_MANIFESTS_STORE);
    const writes: Promise<unknown>[] = [];

    try {
      if (pointer === 'migrationGeneration') {
        const [activeGeneration, migrationGeneration, existingMarker, existingRecords] = await Promise.all([
          this.readMetadataValue<string | null>(transaction, 'activeGeneration'),
          this.readMetadataValue<string | null>(transaction, 'migrationGeneration'),
          this.readMetadataValue<number>(transaction, `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`),
          requestResult(historyStore.index(BY_GENERATION_INDEX).count(generationId)),
        ]);
        if (generationId === activeGeneration) {
          throw new Error('A geração preparada precisa ser diferente da geração ativa.');
        }
        if (migrationGeneration) {
          throw new Error(`A geração ${migrationGeneration} já está preparada.`);
        }
        if (existingMarker !== undefined || existingRecords > 0) {
          throw new Error(`A geração ${generationId} já existe.`);
        }
      }

      history.forEach((session, order) => {
        writes.push(requestResult(historyStore.add({
          sessionId: session.id,
          generationId,
          order,
          session,
          digest: digests[order],
        } satisfies HistoryRecord)));
      });
      writes.push(requestResult(manifestStore.put(createGenerationManifest({
        generationId,
        sessionCount: history.length,
        orderedDigest,
        createdAt,
      }))));
      writes.push(requestResult(metadataStore.put({
        key: `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`,
        value: -1,
      } satisfies MetadataRecord)));
      writes.push(requestResult(metadataStore.put({
        key: pointer,
        value: generationId,
      } satisfies MetadataRecord)));

      await Promise.all(writes);
      await completed;
      return generationId;
    } catch (error) {
      abortQuietly(transaction);
      await Promise.allSettled(writes);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async readHistoryGeneration(generationId: string): Promise<WorkoutSession[]> {
    if (!generationId) throw new Error('A leitura exige um generationId.');
    const database = this.requireDatabase();
    const transaction = database.transaction(WORKOUT_HISTORY_STORE, 'readonly');
    const completed = transactionResult(transaction);
    const records = await requestResult(
      transaction.objectStore(WORKOUT_HISTORY_STORE)
        .index(BY_GENERATION_INDEX)
        .getAll(generationId),
    ) as HistoryRecord[];
    await completed;
    return records
      .sort((left, right) => left.order - right.order)
      .map((record) => record.session);
  }

  async readGenerationManifest(generationId: string): Promise<HistoryGenerationManifest | null> {
    if (!generationId) throw new Error('A leitura do manifest exige um generationId.');
    const database = this.requireDatabase();
    const transaction = database.transaction(GENERATION_MANIFESTS_STORE, 'readonly');
    const completed = transactionResult(transaction);
    const manifest = await this.readManifestRecord(transaction, generationId);
    await completed;
    return manifest;
  }

  // Leitura única usada pela hidratação: presença física, manifest e registros
  // (com os digests gravados) saem da mesma transação consistente.
  async readHistoryGenerationSnapshot(generationId: string): Promise<HistoryGenerationSnapshot> {
    const raw = await this.readGenerationRecords(generationId);
    return {
      present: raw.present,
      manifest: raw.manifest,
      sessions: raw.records.map((record) => record.session),
      recordDigests: raw.records.map((record) => record.digest ?? null),
    };
  }

  // Leitura física crua da geração, em ordem newest-first. O snapshot público e
  // a prova do rollback saem desta mesma leitura para descreverem exatamente o
  // mesmo estado físico.
  private async readGenerationRecords(generationId: string): Promise<{
    present: boolean;
    manifest: HistoryGenerationManifest | null;
    records: HistoryRecord[];
  }> {
    if (!generationId) throw new Error('A leitura da geração exige um generationId.');
    const database = this.requireDatabase();
    const transaction = database.transaction(
      [METADATA_STORE, WORKOUT_HISTORY_STORE, GENERATION_MANIFESTS_STORE],
      'readonly',
    );
    const completed = transactionResult(transaction);
    const [marker, manifest, records] = await Promise.all([
      this.readMetadataValue<number>(transaction, `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`),
      this.readManifestRecord(transaction, generationId),
      requestResult(
        transaction.objectStore(WORKOUT_HISTORY_STORE)
          .index(BY_GENERATION_INDEX)
          .getAll(generationId),
      ) as Promise<HistoryRecord[]>,
    ]);
    await completed;
    return {
      present: marker !== undefined || manifest !== null || records.length > 0,
      manifest,
      records: sortHistoryRecords(records),
    };
  }

  async hasHistoryGeneration(generationId: string): Promise<boolean> {
    if (!generationId) return false;
    const database = this.requireDatabase();
    const transaction = database.transaction(METADATA_STORE, 'readonly');
    const completed = transactionResult(transaction);
    const marker = await this.readMetadataValue<number>(
      transaction,
      `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`,
    );
    await completed;
    return marker !== undefined;
  }

  async activateHistoryGeneration(generationId: string): Promise<void> {
    if (!generationId) throw new Error('A ativação exige um generationId.');
    const database = this.requireDatabase();
    const transaction = database.transaction(METADATA_STORE, 'readwrite');
    const completed = transactionResult(transaction);

    try {
      const [migrationGeneration, marker] = await Promise.all([
        this.readMetadataValue<string | null>(transaction, 'migrationGeneration'),
        this.readMetadataValue<number>(transaction, `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`),
      ]);
      if (migrationGeneration !== generationId || marker === undefined) {
        throw new Error('A geração só pode ser ativada depois de preparada.');
      }
      await requestResult(transaction.objectStore(METADATA_STORE).put({
        key: 'activeGeneration',
        value: generationId,
      } satisfies MetadataRecord));
      await completed;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  // Append incremental: lê apenas o manifest, serializa apenas a sessão nova e
  // encadeia um único passo de digest. Registro, manifest, contagem e
  // orderedDigest entram na mesma transação.
  async appendSession(session: WorkoutSession): Promise<void> {
    await this.commitAppend(session);
  }

  // Sessão, manifest e receipt pendente entram na mesma transação: nunca existe
  // sessão sem receipt, receipt sem sessão nem manifest atualizado pela metade.
  async appendSessionWithCompletionReceipt(
    session: WorkoutSession,
    receipt: WorkoutCompletionReceipt,
  ): Promise<void> {
    if (!isWorkoutCompletionReceipt(receipt)) {
      throw new CompletionReceiptIntegrityError('O receipt de conclusão está com formato inválido.');
    }
    if (receipt.sessionId !== session.id) {
      throw new CompletionReceiptIntegrityError(
        `O receipt ${receipt.receiptId} não corresponde à sessão ${session.id}.`,
      );
    }
    await this.commitAppend(
      session,
      async (transaction) => {
        const store = transaction.objectStore(COMPLETION_RECEIPTS_STORE);
        const existing = await requestResult(store.get(receipt.receiptId)) as unknown;
        if (existing !== undefined) {
          throw new CompletionReceiptIntegrityError(
            `O receipt ${receipt.receiptId} já existe.`,
          );
        }
        await requestResult(store.put(receipt));
      },
      [COMPLETION_RECEIPTS_STORE],
    );
  }

  async readPendingCompletionReceipts(): Promise<WorkoutCompletionReceipt[]> {
    const database = this.requireDatabase();
    const transaction = database.transaction(COMPLETION_RECEIPTS_STORE, 'readonly');
    const completed = transactionResult(transaction);
    const records = await requestResult(
      transaction.objectStore(COMPLETION_RECEIPTS_STORE)
        .index(BY_RECEIPT_STATUS_INDEX)
        .getAll('pending'),
    ) as unknown[];
    await completed;
    return (records as WorkoutCompletionReceipt[])
      .sort((left, right) => (
        left.createdAt === right.createdAt
          ? String(left.receiptId).localeCompare(String(right.receiptId))
          : String(left.createdAt).localeCompare(String(right.createdAt))
      ));
  }

  async readCompletionReceiptForSession(
    sessionId: string,
  ): Promise<WorkoutCompletionReceipt | null> {
    if (!sessionId) throw new Error('A leitura do receipt exige um sessionId.');
    const database = this.requireDatabase();
    const transaction = database.transaction(COMPLETION_RECEIPTS_STORE, 'readonly');
    const completed = transactionResult(transaction);
    const records = await requestResult(
      transaction.objectStore(COMPLETION_RECEIPTS_STORE).getAll(),
    ) as unknown[];
    await completed;
    const match = (records as WorkoutCompletionReceipt[])
      .find((candidate) => candidate?.sessionId === sessionId);
    return match ?? null;
  }

  async settleCompletionReceipt(receiptId: string): Promise<boolean> {
    if (!receiptId) throw new Error('A conclusão do receipt exige um receiptId.');
    const database = this.requireDatabase();
    const settledAt = this.now().toISOString();
    const transaction = database.transaction(COMPLETION_RECEIPTS_STORE, 'readwrite');
    const completed = transactionResult(transaction);

    try {
      const store = transaction.objectStore(COMPLETION_RECEIPTS_STORE);
      const record = await requestResult(store.get(receiptId)) as WorkoutCompletionReceipt | undefined;
      if (!record) {
        await completed;
        return false;
      }
      if (record.status === 'completed') {
        await completed;
        return true;
      }
      await requestResult(store.put({ ...record, status: 'completed', settledAt }));
      await completed;
      return true;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  protected async commitAppend(
    session: WorkoutSession,
    extraWrite?: (transaction: IDBTransaction) => Promise<unknown>,
    extraStores: string[] = [],
  ): Promise<void> {
    assertSessionIdentity(session);
    const database = this.requireDatabase();

    const base = await this.readActiveGenerationBase();
    const sessionDigest = await digestWorkoutSession(session, this.subtleCrypto);
    const nextOrderedDigest = await chainGenerationDigest(
      base.manifest.orderedDigest,
      sessionDigest,
      this.subtleCrypto,
    );
    const updatedAt = this.now().toISOString();

    const transaction = database.transaction(
      [METADATA_STORE, WORKOUT_HISTORY_STORE, GENERATION_MANIFESTS_STORE, ...extraStores],
      'readwrite',
    );
    const completed = transactionResult(transaction);

    try {
      const generationId = await this.requireActiveGeneration(transaction);
      if (generationId !== base.generationId) {
        throw new HistoryManifestIntegrityError('A geração ativa mudou durante o append.');
      }
      const manifest = await this.readManifestRecord(transaction, generationId);
      if (
        !manifest
        || manifest.orderedDigest !== base.manifest.orderedDigest
        || manifest.sessionCount !== base.manifest.sessionCount
      ) {
        throw new HistoryManifestIntegrityError('O manifest mudou durante o append.');
      }

      const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
      const duplicateKey = await requestResult(
        historyStore.index(BY_GENERATION_SESSION_INDEX).getKey([generationId, session.id]),
      );
      if (duplicateKey !== undefined) throw new Error(`A sessão ${session.id} já existe na geração ativa.`);

      const nextOrderKey = `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`;
      const nextOrder = await this.readMetadataValue<number>(transaction, nextOrderKey) ?? -1;
      await requestResult(historyStore.add({
        sessionId: session.id,
        generationId,
        order: nextOrder,
        session,
        digest: sessionDigest,
      } satisfies HistoryRecord));
      await requestResult(transaction.objectStore(GENERATION_MANIFESTS_STORE).put(
        createGenerationManifest({
          generationId,
          sessionCount: manifest.sessionCount + 1,
          orderedDigest: nextOrderedDigest,
          createdAt: manifest.createdAt,
          updatedAt,
        }),
      ));
      await requestResult(transaction.objectStore(METADATA_STORE).put({
        key: nextOrderKey,
        value: nextOrder - 1,
      } satisfies MetadataRecord));
      if (extraWrite) await extraWrite(transaction);
      await completed;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  // Update e delete recalculam a cadeia inteira: são operações raras e a ordem
  // pode mudar em qualquer posição.
  async updateSession(session: WorkoutSession): Promise<boolean> {
    assertSessionIdentity(session);
    return this.rewriteActiveGeneration((sessions) => {
      const index = sessions.findIndex((candidate) => candidate.id === session.id);
      if (index === -1) return null;
      const next = [...sessions];
      next[index] = session;
      return next;
    });
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    if (!sessionId) throw new Error('A exclusão exige um sessionId.');
    return this.rewriteActiveGeneration((sessions) => {
      const index = sessions.findIndex((candidate) => candidate.id === sessionId);
      if (index === -1) return null;
      return sessions.filter((_, position) => position !== index);
    });
  }

  private async rewriteActiveGeneration(
    mutate: (sessions: WorkoutSession[]) => WorkoutSession[] | null,
  ): Promise<boolean> {
    const database = this.requireDatabase();
    const base = await this.readActiveGenerationBase();
    const current = await this.readHistoryGeneration(base.generationId);
    const next = mutate(current);
    if (!next) return false;

    const digests = await digestWorkoutSessions(next, this.subtleCrypto);
    const orderedDigest = await computeOrderedDigestFromSessionDigests(digests, this.subtleCrypto);
    const updatedAt = this.now().toISOString();

    const transaction = database.transaction(
      [METADATA_STORE, WORKOUT_HISTORY_STORE, GENERATION_MANIFESTS_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);

    try {
      const generationId = await this.requireActiveGeneration(transaction);
      if (generationId !== base.generationId) {
        throw new HistoryManifestIntegrityError('A geração ativa mudou durante a reescrita.');
      }
      const manifest = await this.readManifestRecord(transaction, generationId);
      if (
        !manifest
        || manifest.orderedDigest !== base.manifest.orderedDigest
        || manifest.sessionCount !== base.manifest.sessionCount
      ) {
        throw new HistoryManifestIntegrityError('O manifest mudou durante a reescrita.');
      }

      const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
      const keys = await requestResult(historyStore.index(BY_GENERATION_INDEX).getAllKeys(generationId));
      await Promise.all(keys.map((key) => requestResult(historyStore.delete(key))));
      await Promise.all(next.map((session, order) => requestResult(historyStore.add({
        sessionId: session.id,
        generationId,
        order,
        session,
        digest: digests[order],
      } satisfies HistoryRecord))));
      await requestResult(transaction.objectStore(GENERATION_MANIFESTS_STORE).put(
        createGenerationManifest({
          generationId,
          sessionCount: next.length,
          orderedDigest,
          createdAt: manifest.createdAt,
          updatedAt,
        }),
      ));
      await requestResult(transaction.objectStore(METADATA_STORE).put({
        key: `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`,
        value: -1,
      } satisfies MetadataRecord));
      await completed;
      return true;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async count(): Promise<number> {
    const database = this.requireDatabase();
    const transaction = database.transaction([METADATA_STORE, WORKOUT_HISTORY_STORE], 'readonly');
    const completed = transactionResult(transaction);
    const activeGeneration = await this.readMetadataValue<string | null>(transaction, 'activeGeneration');
    if (!activeGeneration) {
      await completed;
      return 0;
    }
    const total = await requestResult(
      transaction.objectStore(WORKOUT_HISTORY_STORE)
        .index(BY_GENERATION_INDEX)
        .count(activeGeneration),
    );
    await completed;
    return total;
  }

  async readMetadata(): Promise<HistoryStorageMetadata> {
    const database = this.requireDatabase();
    const transaction = database.transaction(METADATA_STORE, 'readonly');
    const completed = transactionResult(transaction);
    const entries = await Promise.all(
      (Object.keys(METADATA_DEFAULTS) as MetadataKey[]).map(async (key) => [
        key,
        await this.readMetadataValue(transaction, key),
      ] as const),
    );
    await completed;
    return { ...METADATA_DEFAULTS, ...Object.fromEntries(entries) } as HistoryStorageMetadata;
  }

  async writeMetadata(
    metadata: Partial<Omit<HistoryStorageMetadata, 'activeGeneration'>>,
  ): Promise<void> {
    const entries = Object.entries(metadata)
      .filter((entry): entry is [MetadataKey, HistoryStorageMetadata[MetadataKey]] => entry[1] !== undefined);
    if (entries.length === 0) return;
    const database = this.requireDatabase();
    const transaction = database.transaction(METADATA_STORE, 'readwrite');
    const completed = transactionResult(transaction);
    const store = transaction.objectStore(METADATA_STORE);
    await Promise.all(entries.map(([key, value]) => requestResult(store.put({ key, value } satisfies MetadataRecord))));
    await completed;
  }

  async saveLegacySnapshot(raw: string): Promise<LegacySnapshotRecord> {
    const snapshot: LegacySnapshotRecord = {
      raw,
      checksum: await checksumLegacySnapshot(raw, this.subtleCrypto),
      createdAt: this.now().toISOString(),
      verified: false,
    };

    await this.writeLegacySnapshotRecord({
      snapshotId: LEGACY_SNAPSHOT_ID,
      ...snapshot,
    });

    try {
      const persisted = await this.readLegacySnapshotRecord();
      if (!persisted) {
        throw new LegacySnapshotIntegrityError('Snapshot legado não encontrado após a primeira gravação.');
      }

      const recalculatedChecksum = await checksumLegacySnapshot(persisted.raw, this.subtleCrypto);
      if (
        persisted.raw !== raw
        || persisted.checksum !== snapshot.checksum
        || recalculatedChecksum !== persisted.checksum
      ) {
        throw new LegacySnapshotIntegrityError('Falha de integridade no readback do snapshot legado.');
      }

      const verifiedSnapshot: StoredLegacySnapshotRecord = {
        ...persisted,
        verified: true,
      };
      await this.writeLegacySnapshotRecord(verifiedSnapshot);
      return {
        raw: verifiedSnapshot.raw,
        checksum: verifiedSnapshot.checksum,
        createdAt: verifiedSnapshot.createdAt,
        verified: verifiedSnapshot.verified,
      };
    } catch (error) {
      if (error instanceof LegacySnapshotIntegrityError) throw error;
      throw new LegacySnapshotIntegrityError(
        'Não foi possível verificar a integridade do snapshot legado.',
        error,
      );
    }
  }

  async readLegacySnapshot(): Promise<LegacySnapshotRecord | null> {
    const record = await this.readLegacySnapshotRecord();
    if (!record) return null;

    const actualChecksum = await checksumLegacySnapshot(record.raw, this.subtleCrypto);
    return {
      raw: record.raw,
      checksum: record.checksum,
      createdAt: record.createdAt,
      verified: record.verified && actualChecksum === record.checksum,
    };
  }

  async clearInactiveGeneration(generationId: string): Promise<number> {
    if (!generationId) throw new Error('A limpeza exige um generationId.');
    const database = this.requireDatabase();
    const transaction = database.transaction(
      [METADATA_STORE, WORKOUT_HISTORY_STORE, GENERATION_MANIFESTS_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);

    try {
      const [activeGeneration, migrationGeneration] = await Promise.all([
        this.readMetadataValue<string | null>(transaction, 'activeGeneration'),
        this.readMetadataValue<string | null>(transaction, 'migrationGeneration'),
      ]);
      if (generationId === activeGeneration) {
        throw new Error('A geração ativa nunca pode ser removida.');
      }
      const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
      const keys = await requestResult(
        historyStore.index(BY_GENERATION_INDEX).getAllKeys(generationId),
      );
      await Promise.all(keys.map((key) => requestResult(historyStore.delete(key))));
      await requestResult(transaction.objectStore(GENERATION_MANIFESTS_STORE).delete(generationId));
      await requestResult(transaction.objectStore(METADATA_STORE).delete(
        `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`,
      ));
      if (migrationGeneration === generationId) {
        await requestResult(transaction.objectStore(METADATA_STORE).put({
          key: 'migrationGeneration',
          value: null,
        } satisfies MetadataRecord));
      }
      await completed;
      return keys.length;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  // ==========================================================================
  // Ledger nutricional — NUT-004A (GOAL-077). Primitivas duráveis sobre os
  // stores v5 (`nutritionDays` por data civil, `nutritionMetadata` chave/valor).
  //
  // Sem wiring no boot, sem backup/restore/reset lógico: só persistência
  // aditiva. O rollover (`src/lib/nutrition/rollover.ts`) consome esta classe
  // via o contrato `NutritionDayRepository` (mesmos nomes e assinaturas).
  // ==========================================================================

  async getNutritionDay(date: string): Promise<NutritionDay | null> {
    if (typeof date !== 'string' || date.length === 0) {
      throw new Error('A leitura do dia nutricional exige uma data civil.');
    }
    const database = this.requireDatabase();
    const transaction = database.transaction(NUTRITION_DAYS_STORE, 'readonly');
    const completed = transactionResult(transaction);
    try {
      const record = await requestResult(
        transaction.objectStore(NUTRITION_DAYS_STORE).get(date),
      ) as unknown;
      await completed;
      if (record === undefined || record === null) return null;
      if (!isNutritionDay(record)) {
        throw new NutritionDayIntegrityError(
          `O dia nutricional ${date} está com formato inválido no armazenamento.`,
        );
      }
      return record;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async putNutritionDay(day: NutritionDay): Promise<void> {
    if (!isNutritionDay(day)) {
      throw new NutritionDayIntegrityError('O dia nutricional a persistir está com formato inválido.');
    }
    const database = this.requireDatabase();
    // GOAL-087: escopo [days, metadata] para serializar com o fence.
    // A consulta ao fence vive NA MESMA transação — nunca check-then-write
    // em duas transações.
    const transaction = database.transaction(
      [NUTRITION_DAYS_STORE, NUTRITION_METADATA_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);
    try {
      await this.assertNutritionWriteAllowedInTransaction(transaction);
      await requestResult(transaction.objectStore(NUTRITION_DAYS_STORE).put(day));
      await completed;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  // Put-if-absent atômico pela chave natural (date): checagem e gravação com
  // `add` (nunca `put`) vivem na MESMA transação readwrite — duas chamadas
  // concorrentes nunca criam dois dias da mesma data. Se o `add` falhar por
  // corrida real (ConstraintError), a transação é abortada e o vencedor é
  // relido fora dela; só se não houver vencedor o erro original é relançado.
  //
  // GOAL-087: a consulta ao fence vive na MESMA transação (escopo
  // [days, metadata]). Fence ativo → NUTRITION_ADMIN_FENCED antes do add.
  // Fence expirado/corrompido → removido na própria transação e o write segue.
  async putNutritionDayIfAbsent(day: NutritionDay): Promise<{ created: boolean; day: NutritionDay }> {
    if (!isNutritionDay(day)) {
      throw new NutritionDayIntegrityError('O dia nutricional a persistir está com formato inválido.');
    }
    const database = this.requireDatabase();
    const transaction = database.transaction(
      [NUTRITION_DAYS_STORE, NUTRITION_METADATA_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);
    try {
      await this.assertNutritionWriteAllowedInTransaction(transaction);
      const store = transaction.objectStore(NUTRITION_DAYS_STORE);
      const existing = await requestResult(store.get(day.date)) as unknown;
      if (existing !== undefined && existing !== null) {
        await completed;
        if (!isNutritionDay(existing)) {
          throw new NutritionDayIntegrityError(
            `O dia nutricional ${day.date} está com formato inválido no armazenamento.`,
          );
        }
        return { created: false, day: existing };
      }
      try {
        await requestResult(store.add(day));
      } catch (addError) {
        // Fence nunca é mascarado como vencedor: se o abort foi por fence,
        // ele já teria sido lançado antes do add. Aqui só há corrida real.
        if (addError instanceof NutritionAdminFencedError) throw addError;
        abortQuietly(transaction);
        await completed.catch(() => undefined);
        const winner = await this.getNutritionDay(day.date);
        if (winner) return { created: false, day: winner };
        throw addError;
      }
      await completed;
      return { created: true, day };
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async listNutritionDays(options?: { from?: string; to?: string }): Promise<NutritionDay[]> {
    const database = this.requireDatabase();
    const transaction = database.transaction(NUTRITION_DAYS_STORE, 'readonly');
    const completed = transactionResult(transaction);
    try {
      const records = await requestResult(
        transaction.objectStore(NUTRITION_DAYS_STORE).getAll(),
      ) as unknown[];
      await completed;
      const days: NutritionDay[] = [];
      for (const record of records) {
        if (!isNutritionDay(record)) {
          throw new NutritionDayIntegrityError(
            'Existe um dia nutricional com formato inválido no armazenamento.',
          );
        }
        if (options?.from && record.date < options.from) continue;
        if (options?.to && record.date > options.to) continue;
        days.push(record);
      }
      days.sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0));
      return days;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async getActiveNutritionDate(): Promise<string | null> {
    const database = this.requireDatabase();
    const transaction = database.transaction(NUTRITION_METADATA_STORE, 'readonly');
    const completed = transactionResult(transaction);
    try {
      const value = await this.readNutritionMetadataValue(transaction, NUTRITION_ACTIVE_DATE_KEY);
      await completed;
      if (value === undefined || value === null) return null;
      if (!isCivilDateString(value)) {
        throw new NutritionDayIntegrityError('A data nutricional ativa está com formato inválido.');
      }
      return value;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async setActiveNutritionDate(date: string): Promise<void> {
    if (!isCivilDateString(date)) {
      throw new Error(`A data nutricional ativa exige data civil válida (recebido ${String(date)}).`);
    }
    const database = this.requireDatabase();
    // GOAL-087: mesmo escopo do fence para serializar cross-tab.
    const transaction = database.transaction(
      [NUTRITION_DAYS_STORE, NUTRITION_METADATA_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);
    try {
      await this.assertNutritionWriteAllowedInTransaction(transaction);
      await requestResult(transaction.objectStore(NUTRITION_METADATA_STORE).put({
        key: NUTRITION_ACTIVE_DATE_KEY,
        value: date,
      } satisfies MetadataRecord));
      await completed;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async getNutritionMigrationMarker(): Promise<LedgerMigrationMarker | null> {
    const database = this.requireDatabase();
    const transaction = database.transaction(NUTRITION_METADATA_STORE, 'readonly');
    const completed = transactionResult(transaction);
    try {
      const value = await this.readNutritionMetadataValue(transaction, NUTRITION_MIGRATION_MARKER_KEY);
      await completed;
      if (value === undefined || value === null) return null;
      if (!isLedgerMigrationMarker(value)) {
        throw new NutritionDayIntegrityError('O marcador de migração nutricional está com formato inválido.');
      }
      return value;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async setNutritionMigrationMarker(marker: LedgerMigrationMarker): Promise<void> {
    if (!isLedgerMigrationMarker(marker)) {
      throw new NutritionDayIntegrityError('O marcador de migração nutricional a persistir está inválido.');
    }
    const database = this.requireDatabase();
    // GOAL-087: mesmo escopo do fence para serializar cross-tab.
    const transaction = database.transaction(
      [NUTRITION_DAYS_STORE, NUTRITION_METADATA_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);
    try {
      await this.assertNutritionWriteAllowedInTransaction(transaction);
      await requestResult(transaction.objectStore(NUTRITION_METADATA_STORE).put({
        key: NUTRITION_MIGRATION_MARKER_KEY,
        value: marker,
      } satisfies MetadataRecord));
      await completed;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  /**
   * NUT-004B: primitiva transacional read → mutate puro → validate → put em
   * uma única transação readwrite por date.
   *
   * O mutador é síncrono e puro (IDs já criados pelo chamador, nunca dentro
   * do ledger). A validação `isNutritionDay` roda antes do put; dia inválido
   * aborta sem persistir nada. Chamadas concorrentes nunca perdem updates:
   * cada mutação lê o vencedor anterior dentro da sua transação.
   *
   * GOAL-087: escopo [days, metadata] + fence check na MESMA transação.
   * Fence ativo → NUTRITION_ADMIN_FENCED antes do mutador rodar.
   */
  async mutateNutritionDay(
    date: string,
    mutator: (current: NutritionDay | null) => NutritionDay,
  ): Promise<NutritionDay> {
    if (!isCivilDateString(date)) {
      throw new NutritionDayIntegrityError(`A mutação nutricional exige data civil válida (${String(date)}).`);
    }
    if (typeof mutator !== 'function') {
      throw new NutritionDayIntegrityError('A mutação nutricional exige um mutador puro síncrono.');
    }
    const database = this.requireDatabase();
    const transaction = database.transaction(
      [NUTRITION_DAYS_STORE, NUTRITION_METADATA_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);
    try {
      await this.assertNutritionWriteAllowedInTransaction(transaction);
      const store = transaction.objectStore(NUTRITION_DAYS_STORE);
      const raw = await requestResult(store.get(date)) as unknown;
      let current: NutritionDay | null = null;
      if (raw !== undefined && raw !== null) {
        if (!isNutritionDay(raw)) {
          throw new NutritionDayIntegrityError(
            `O dia nutricional ${date} está com formato inválido no armazenamento.`,
          );
        }
        current = raw;
      }
      const next = mutator(current);
      if (!isNutritionDay(next)) {
        throw new NutritionDayIntegrityError('O resultado da mutação nutricional está com formato inválido.');
      }
      if (next.date !== date) {
        throw new NutritionDayIntegrityError('A mutação nutricional não pode alterar a chave natural (date).');
      }
      await requestResult(store.put(next));
      await completed;
      return next;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  // ==========================================================================
  // Fence administrativo nutricional — GOAL-087 (TOCTOU fix).
  //
  // Vive no store EXISTENTE `nutritionMetadata` (sem novo store, sem bump).
  // Aquisição e writes usam o MESMO escopo readwrite
  // [nutritionDays, nutritionMetadata]: o IndexedDB serializa transações
  // sobrepostas, então:
  // - writer já iniciado → termina primeiro → fence adquire depois →
  //   nova sonda vê o consumo;
  // - fence adquirido primeiro → próximo writer vê fence ativo →
  //   bloqueado antes do put com NUTRITION_ADMIN_FENCED.
  // ==========================================================================

  private async assertNutritionWriteAllowedInTransaction(
    transaction: IDBTransaction,
  ): Promise<void> {
    const fenceStore = transaction.objectStore(NUTRITION_METADATA_STORE);
    const raw = await requestResult(fenceStore.get(NUTRITION_ADMIN_FENCE_KEY)) as unknown;
    if (raw === undefined || raw === null) return;
    const record = raw as Partial<MetadataRecord> | null;
    const candidate: unknown = record && typeof record === 'object' && 'value' in (record as object)
      ? (record as MetadataRecord).value
      : raw;
    if (candidate === undefined || candidate === null) return;
    if (!isNutritionAdminFenceV1(candidate)) {
      // Fence corrompido: recuperação determinística — remover e liberar o
      // write. Nunca virar corrupção de storage (GOAL-087 §6).
      try {
        await requestResult(fenceStore.delete(NUTRITION_ADMIN_FENCE_KEY));
      } catch {
        /* melhor esforço: o write segue mesmo se o delete falhar */
      }
      return;
    }
    if (!isNutritionAdminFenceActive(candidate)) {
      // Expirado: remover na PRÓPRIA transação e liberar o writer.
      await requestResult(fenceStore.delete(NUTRITION_ADMIN_FENCE_KEY));
      return;
    }
    throw new NutritionAdminFencedError(
      'Escrita nutricional bloqueada por fence administrativo ativo.',
      { fenceId: candidate.fenceId, operationKind: candidate.operationKind },
    );
  }

  async acquireNutritionAdminFence(input: {
    ownerId: string;
    operationId: string;
    operationKind: NutritionAdminFenceOperationKind;
    ttlMs?: number;
    now?: Date;
    fenceId?: string;
  }): Promise<NutritionAdminFenceV1> {
    if (!input || typeof input.ownerId !== 'string' || input.ownerId.length === 0) {
      throw new Error('A aquisição do fence exige um ownerId não vazio.');
    }
    if (typeof input.operationId !== 'string' || input.operationId.length === 0) {
      throw new Error('A aquisição do fence exige um operationId não vazio.');
    }
    const database = this.requireDatabase();
    const now = input.now ?? this.now();
    const ttlMs = input.ttlMs ?? NUTRITION_ADMIN_FENCE_TTL_MS;
    const fence: NutritionAdminFenceV1 = buildNutritionAdminFenceV1({
      fenceId: input.fenceId ?? newNutritionAdminFenceId(),
      ownerId: input.ownerId,
      operationId: input.operationId,
      operationKind: input.operationKind,
      now,
      ttlMs,
    });
    const transaction = database.transaction(
      [NUTRITION_DAYS_STORE, NUTRITION_METADATA_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);
    try {
      const fenceStore = transaction.objectStore(NUTRITION_METADATA_STORE);
      const raw = await requestResult(fenceStore.get(NUTRITION_ADMIN_FENCE_KEY)) as unknown;
      if (raw !== undefined && raw !== null) {
        const record = raw as Partial<MetadataRecord>;
        const candidate: unknown = record && typeof record === 'object' && 'value' in (record as object)
          ? (record as MetadataRecord).value
          : raw;
        if (candidate !== undefined && candidate !== null && isNutritionAdminFenceV1(candidate)) {
          if (isNutritionAdminFenceActive(candidate)) {
            throw new NutritionAdminFencedError(
              'Já existe um fence administrativo nutricional ativo.',
              { fenceId: candidate.fenceId, operationKind: candidate.operationKind },
            );
          }
          // Expirado: recuperação determinística — o novo fence sobrescreve.
        }
        // Corrompido ou expirado: sobrescrever abaixo (sem erro de storage).
      }
      await requestResult(fenceStore.put({
        key: NUTRITION_ADMIN_FENCE_KEY,
        value: fence,
      } satisfies MetadataRecord));
      await completed;
      return fence;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async renewNutritionAdminFence(input: {
    fenceId: string;
    ttlMs?: number;
    now?: Date;
  }): Promise<NutritionAdminFenceV1> {
    if (!input || typeof input.fenceId !== 'string' || input.fenceId.length === 0) {
      throw new Error('A renovação do fence exige um fenceId não vazio.');
    }
    const database = this.requireDatabase();
    const now = input.now ?? this.now();
    const ttlMs = input.ttlMs ?? NUTRITION_ADMIN_FENCE_TTL_MS;
    const transaction = database.transaction(
      [NUTRITION_DAYS_STORE, NUTRITION_METADATA_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);
    try {
      const fenceStore = transaction.objectStore(NUTRITION_METADATA_STORE);
      const raw = await requestResult(fenceStore.get(NUTRITION_ADMIN_FENCE_KEY)) as unknown;
      if (raw === undefined || raw === null) {
        throw new NutritionAdminFencedError('Não há fence administrativo para renovar.');
      }
      const record = raw as Partial<MetadataRecord>;
      const candidate: unknown = record && typeof record === 'object' && 'value' in (record as object)
        ? (record as MetadataRecord).value
        : raw;
      if (!isNutritionAdminFenceV1(candidate)) {
        throw new NutritionAdminFencedError('O fence administrativo está com formato inválido.');
      }
      if (candidate.fenceId !== input.fenceId) {
        throw new NutritionAdminFencedError(
          'Renovação recusada: fence pertence a outro dono.',
          { fenceId: candidate.fenceId, operationKind: candidate.operationKind },
        );
      }
      const renewed: NutritionAdminFenceV1 = {
        ...candidate,
        acquiredAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      };
      await requestResult(fenceStore.put({
        key: NUTRITION_ADMIN_FENCE_KEY,
        value: renewed,
      } satisfies MetadataRecord));
      await completed;
      return renewed;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async releaseNutritionAdminFence(input: {
    fenceId: string;
  }): Promise<{ released: boolean }> {
    if (!input || typeof input.fenceId !== 'string' || input.fenceId.length === 0) {
      throw new Error('A liberação do fence exige um fenceId não vazio.');
    }
    const database = this.requireDatabase();
    const transaction = database.transaction(
      [NUTRITION_DAYS_STORE, NUTRITION_METADATA_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);
    try {
      const fenceStore = transaction.objectStore(NUTRITION_METADATA_STORE);
      const raw = await requestResult(fenceStore.get(NUTRITION_ADMIN_FENCE_KEY)) as unknown;
      if (raw === undefined || raw === null) {
        await completed;
        return { released: false };
      }
      const record = raw as Partial<MetadataRecord>;
      const candidate: unknown = record && typeof record === 'object' && 'value' in (record as object)
        ? (record as MetadataRecord).value
        : raw;
      if (!isNutritionAdminFenceV1(candidate)) {
        // Registro corrompido sob a chave do fence: remover (higiene) e
        // reportar como não-liberado pelo dono (não era um fence válido).
        try {
          await requestResult(fenceStore.delete(NUTRITION_ADMIN_FENCE_KEY));
        } catch {
          /* melhor esforço */
        }
        await completed;
        return { released: false };
      }
      if (candidate.fenceId !== input.fenceId) {
        // Dono errado: NÃO remover fence alheio (GOAL-087 §11D).
        await completed;
        return { released: false };
      }
      await requestResult(fenceStore.delete(NUTRITION_ADMIN_FENCE_KEY));
      await completed;
      return { released: true };
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async readNutritionAdminFence(): Promise<NutritionAdminFenceV1 | null> {
    const database = this.requireDatabase();
    const transaction = database.transaction(NUTRITION_METADATA_STORE, 'readonly');
    const completed = transactionResult(transaction);
    try {
      const value = await this.readNutritionMetadataValue(transaction, NUTRITION_ADMIN_FENCE_KEY);
      await completed;
      if (value === undefined || value === null) return null;
      if (!isNutritionAdminFenceV1(value)) return null;
      return value;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async hasActiveNutritionAdminFence(nowMs?: number): Promise<boolean> {
    const fence = await this.readNutritionAdminFence();
    return isNutritionAdminFenceActive(fence, nowMs);
  }

  private async readNutritionMetadataValue(
    transaction: IDBTransaction,
    key: string,
  ): Promise<unknown> {
    const record = await requestResult(
      transaction.objectStore(NUTRITION_METADATA_STORE).get(key),
    ) as MetadataRecord | undefined;
    return record?.value;
  }

  // ==========================================================================
  // Primitivas administrativas — GOAL-17B-002D-A1.
  //
  // Fundação interna: nenhuma delas tem call site real no aplicativo, nenhuma é
  // exposta à UI e nenhuma é chamada no boot. Todas exigem o banco aberto — sem
  // IndexedDB elas falham explicitamente, sem fallback em memória e sem
  // fabricar geração. A coordenação com o core v2 do localStorage fica no
  // 002D-A2/C/D.
  // ==========================================================================

  async putStorageOperationReceipt(receipt: StorageOperationReceipt): Promise<void> {
    if (!isStorageOperationReceipt(receipt)) {
      throw new StorageOperationReceiptIntegrityError(
        'O receipt de operação administrativa está com formato inválido.',
      );
    }
    const database = this.requireDatabase();
    const transaction = database.transaction(STORAGE_OPERATION_RECEIPTS_STORE, 'readwrite');
    const completed = transactionResult(transaction);

    try {
      await requestResult(transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE).put(receipt));
      await completed;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  // Criação atômica: só existe operação nova quando nenhuma outra está em
  // aberto, nenhuma conclusão de treino está pendente e a geração ativa
  // observada pelo chamador ainda é a real. Varredura dos dois stores de
  // receipt, releitura de metadata e gravação com `add` (nunca `put`) vivem na
  // MESMA transação readwrite — não há await de outra tarefa entre a checagem e
  // o commit, então duas chamadas concorrentes nunca passam as duas: a segunda
  // transação só começa depois que a primeira já commitou ou abortou.
  //
  // `COMPLETION_RECEIPTS_STORE` entra no escopo justamente para serializar com
  // `appendSessionWithCompletionReceipt`: sem ele, uma conclusão de treino
  // gravada entre o diagnóstico e a criação passava despercebida e o begin
  // nascia sobre um estado já obsoleto.
  async createStorageOperationReceiptIfIdle(
    input: CreateStorageOperationReceiptIfIdleInput,
  ): Promise<StorageOperationReceipt> {
    const { receipt, expectedActiveGenerationId } = input;
    if (!isStorageOperationReceipt(receipt)) {
      throw new StorageOperationReceiptIntegrityError(
        'O receipt de operação administrativa está com formato inválido.',
      );
    }
    if (!expectedActiveGenerationId) {
      throw new Error('A criação atômica exige o expectedActiveGenerationId observado.');
    }
    const database = this.requireDatabase();
    const transaction = database.transaction(
      [STORAGE_OPERATION_RECEIPTS_STORE, COMPLETION_RECEIPTS_STORE, METADATA_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);

    try {
      const receiptStore = transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE);
      const existingRecords = await requestResult(receiptStore.getAll()) as unknown[];
      const existingReceipts: StorageOperationReceipt[] = [];
      for (const record of existingRecords) {
        if (!isStorageOperationReceipt(record)) {
          throw new StorageOperationReceiptIntegrityError(
            'Existe um receipt administrativo com formato inválido no armazenamento.',
          );
        }
        if (UNSETTLED_OPERATION_STATUSES.includes(record.status)) {
          throw new StorageOperationAlreadyInProgressError(record);
        }
        existingReceipts.push(record);
      }

      if (detectStorageOperationSupersessionCycle(existingReceipts)) {
        throw new StorageOperationBeginConflictError(
          'A supersessao settled ja forma um ciclo; o begin recusa persistir.',
        );
      }

      const declaredSupersedes = receipt.supersedesOperationIds;
      if (declaredSupersedes !== undefined) {
        const finalGenerationId = storageOperationFinalGenerationId(receipt);
        if (finalGenerationId === null) {
          throw new StorageOperationBeginConflictError(
            'A supersessao exige geracao final comprovavel no receipt novo.',
          );
        }
        const validated = validateStorageOperationSupersession({
          operationId: receipt.operationId,
          supersedesOperationIds: declaredSupersedes,
          finalGenerationId,
          receipts: existingReceipts,
        });
        if (!validated.ok) {
          throw new StorageOperationBeginConflictError(
            `A supersessao referencial falhou fechada (${validated.reason}).`,
          );
        }
        const liveRelations = listActivePredecessorSourceOperationIds(
          existingReceipts,
          finalGenerationId,
        );
        if (!declaredSupersedesMatchLiveRelations(declaredSupersedes, liveRelations)) {
          throw new StorageOperationBeginConflictError(
            'As relacoes ativas divergiram da supersessao declarada no begin.',
          );
        }
      } else if (receipt.kind === 'restore') {
        const liveRelations = listActivePredecessorSourceOperationIds(
          existingReceipts,
          receipt.targetGenerationId,
        );
        if (liveRelations.length > 0) {
          throw new StorageOperationBeginConflictError(
            'O begin cru omitiu supersessao obrigatoria das relacoes ativas.',
          );
        }
      }

      // Store inteiro, não o índice `byStatus`: um registro sem status válido
      // não aparece em índice nenhum e não pode virar "zero pendentes".
      const completionRecords = await requestResult(
        transaction.objectStore(COMPLETION_RECEIPTS_STORE).getAll(),
      ) as unknown[];
      const pendingCompletionIds: string[] = [];
      for (const record of completionRecords) {
        if (!isWorkoutCompletionReceipt(record)) {
          throw new CompletionReceiptIntegrityError(
            'Existe um receipt de conclusão de treino com formato inválido no armazenamento.',
          );
        }
        if (record.status === 'pending') pendingCompletionIds.push(record.receiptId);
      }
      if (pendingCompletionIds.length > 0) {
        throw new StorageCompletionPendingError(pendingCompletionIds);
      }

      const activeGeneration = await this.readMetadataValue<string | null>(transaction, 'activeGeneration');
      if (activeGeneration !== expectedActiveGenerationId) {
        throw new StorageOperationBeginConflictError(
          `A geração ativa é ${activeGeneration ?? 'nenhuma'}, e não ${expectedActiveGenerationId}.`,
        );
      }

      const existingReceipt = await requestResult(receiptStore.get(receipt.operationId)) as unknown;
      if (existingReceipt !== undefined) {
        throw new StorageOperationBeginConflictError(
          `O receipt ${receipt.operationId} já existe.`,
        );
      }

      await requestResult(receiptStore.add(receipt));
      await completed;
      return receipt;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  // Staging físico amarrado ao journal — GOAL-17B-002D-C1.
  //
  // Cria uma geração NOVA e inativa (registros + digests + manifest + marcador
  // de ordem) e grava `stagedGenerationId` no receipt da operação, tudo na
  // MESMA transação readwrite sobre os cinco stores administrativos. Fazer isso
  // em duas transações — `prepareHistoryGeneration` e depois um patch — deixaria
  // uma janela em que a geração existe e nenhum receipt a explica: o
  // diagnóstico do 002D-A2 não teria como provar de quem ela é, e a limpeza
  // viraria adivinhação.
  //
  // POR QUE `metadata.migrationGeneration` NÃO É GRAVADA: `metadataMatchesV2`
  // (storage-hybrid) exige o ponteiro nulo para hidratar, então preenchê-lo
  // bloquearia o boot durante toda a preparação — inclusive durante a
  // verificação integral de um histórico grande. O vínculo geração ↔ operação
  // já vive no receipt, que é durável e é lido pelo mesmo snapshot atômico.
  //
  // A geração criada permanece INATIVA. A ativação continua sendo uma decisão
  // separada, verificada e com CAS (`rollbackToHistoryGeneration`).
  async stageHistoryGenerationForOperation(
    input: StageHistoryGenerationForOperationInput,
  ): Promise<StageHistoryGenerationForOperationResult> {
    const { operationId, expectedStatus, expectedKind, expectedActiveGenerationId, history } = input;
    if (!operationId) throw new Error('O staging administrativo exige um operationId.');
    if (expectedStatus !== 'staged') {
      throw new StorageOperationTransitionError(
        `O staging físico só acontece sobre um receipt staged, e não ${expectedStatus}.`,
      );
    }
    if (expectedKind !== 'import' && expectedKind !== 'reset') {
      throw new StorageOperationTransitionError(
        `O staging físico desta primitiva é da importação ou do reset lógico, e não de ${expectedKind}.`,
      );
    }
    if (!expectedActiveGenerationId) {
      throw new Error('O staging administrativo exige o expectedActiveGenerationId observado.');
    }
    for (const session of history) assertSessionIdentity(session);

    const database = this.requireDatabase();
    const generationId = this.generationIdFactory();
    if (!generationId) throw new Error('A geração precisa de um id estável.');

    // Digests fora da transação: `crypto.subtle` resolve em outra tarefa e
    // desativaria a transação IndexedDB no meio do caminho. Mesmas primitivas
    // do staging existente — não existe uma segunda implementação de
    // integridade.
    const digests = await digestWorkoutSessions(history, this.subtleCrypto);
    const orderedDigest = await computeOrderedDigestFromSessionDigests(digests, this.subtleCrypto);
    const stampedAt = this.now().toISOString();

    const transaction = database.transaction(
      [
        WORKOUT_HISTORY_STORE,
        METADATA_STORE,
        GENERATION_MANIFESTS_STORE,
        STORAGE_OPERATION_RECEIPTS_STORE,
        COMPLETION_RECEIPTS_STORE,
      ],
      'readwrite',
    );
    const completed = transactionResult(transaction);
    const writes: Promise<unknown>[] = [];

    try {
      const receiptStore = transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE);
      const records = await requestResult(receiptStore.getAll()) as unknown[];
      const unsettled: StorageOperationReceipt[] = [];
      for (const record of records) {
        if (!isStorageOperationReceipt(record)) {
          throw new StorageOperationReceiptIntegrityError(
            'Existe um receipt administrativo com formato inválido no armazenamento.',
          );
        }
        if (UNSETTLED_OPERATION_STATUSES.includes(record.status)) unsettled.push(record);
      }
      const unsettledIds = unsettled.map((receipt) => receipt.operationId);
      if (unsettled.length === 0) {
        throw new StorageOperationAmbiguousStateError(
          'no-unsettled-operation',
          'Não existe operação administrativa em aberto para receber staging físico.',
        );
      }
      if (unsettled.length > 1) {
        throw new StorageOperationAmbiguousStateError(
          'multiple-unsettled-operations',
          `Existem ${unsettled.length} operações administrativas em aberto; nenhuma pode receber staging.`,
          unsettledIds,
        );
      }
      const current = unsettled[0];
      if (current.operationId !== operationId) {
        throw new StorageOperationAmbiguousStateError(
          'operation-not-the-unsettled-one',
          `A operação em aberto é ${current.operationId}, e não ${operationId}.`,
          unsettledIds,
        );
      }
      if (current.kind !== expectedKind) {
        throw new StorageOperationTransitionError(
          `A operação ${operationId} é ${current.kind}, e não ${expectedKind}.`,
        );
      }
      if (current.status !== expectedStatus) {
        throw new StorageOperationTransitionError(
          `O receipt ${operationId} está em ${current.status}, e não em ${expectedStatus}.`,
        );
      }
      // Um receipt que já nomeia staging ou core alvo descreve efeitos que esta
      // primitiva não pode reproduzir: preparar de novo criaria uma segunda
      // geração que o journal não conseguiria distinguir da primeira.
      if (current.stagedGenerationId !== null) {
        throw new StorageOperationTransitionError(
          `O receipt ${operationId} já nomeia a geração preparada ${current.stagedGenerationId}.`,
        );
      }
      if (current.targetCoreRaw !== null) {
        throw new StorageOperationTransitionError(
          `O receipt ${operationId} já nomeia um core alvo antes do staging físico.`,
        );
      }

      // Store inteiro, não o índice `byStatus`: um registro sem status válido
      // não aparece em índice nenhum e não pode virar "zero pendentes".
      const completionRecords = await requestResult(
        transaction.objectStore(COMPLETION_RECEIPTS_STORE).getAll(),
      ) as unknown[];
      const pendingCompletionIds: string[] = [];
      for (const record of completionRecords) {
        if (!isWorkoutCompletionReceipt(record)) {
          throw new CompletionReceiptIntegrityError(
            'Existe um receipt de conclusão de treino com formato inválido no armazenamento.',
          );
        }
        if (record.status === 'pending') pendingCompletionIds.push(record.receiptId);
      }
      if (pendingCompletionIds.length > 0) {
        throw new StorageCompletionPendingError(pendingCompletionIds);
      }

      // Metadata lida e VALIDADA: `readMetadataPointers` recusa ponteiro não
      // textual em vez de convertê-lo para `null`.
      const metadataRecords = await requestResult(
        transaction.objectStore(METADATA_STORE).getAll(),
      ) as unknown[];
      const pointers = readMetadataPointers(metadataRecords);
      if (pointers.activeGeneration !== expectedActiveGenerationId) {
        throw new StorageOperationTransitionError(
          `A geração ativa é ${pointers.activeGeneration ?? 'nenhuma'}, e não ${expectedActiveGenerationId}.`,
        );
      }
      if (pointers.migrationGeneration !== null) {
        throw new HistoryStagingConflictError(
          `A geração ${pointers.migrationGeneration} já ocupa o ponteiro de staging.`,
        );
      }
      if (generationId === pointers.activeGeneration) {
        throw new HistoryStagingConflictError(
          'A geração preparada precisa ser diferente da geração ativa.',
        );
      }

      const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
      const [existingRecords, existingManifest] = await Promise.all([
        requestResult(historyStore.index(BY_GENERATION_INDEX).count(generationId)),
        this.readManifestRecord(transaction, generationId),
      ]);
      if (
        pointers.stagedMarkers.has(generationId)
        || existingRecords > 0
        || existingManifest !== null
      ) {
        throw new HistoryStagingConflictError(`A geração ${generationId} já existe.`);
      }

      history.forEach((session, order) => {
        writes.push(requestResult(historyStore.add({
          sessionId: session.id,
          generationId,
          order,
          session,
          digest: digests[order],
        } satisfies HistoryRecord)));
      });
      const manifest = createGenerationManifest({
        generationId,
        sessionCount: history.length,
        orderedDigest,
        createdAt: stampedAt,
      });
      writes.push(requestResult(transaction.objectStore(GENERATION_MANIFESTS_STORE).put(manifest)));
      writes.push(requestResult(transaction.objectStore(METADATA_STORE).put({
        key: `${INTERNAL_NEXT_ORDER_PREFIX}${generationId}`,
        value: -1,
      } satisfies MetadataRecord)));

      // Todos os demais campos do receipt são preservados; só
      // `stagedGenerationId` e `updatedAt` mudam.
      const next = {
        ...current,
        stagedGenerationId: generationId,
        updatedAt: stampedAt,
      } as StorageOperationReceipt;
      if (!isStorageOperationReceipt(next)) {
        throw new StorageOperationReceiptIntegrityError(
          `O staging deixaria o receipt ${operationId} com formato inválido.`,
        );
      }
      writes.push(requestResult(receiptStore.put(next)));

      await Promise.all(writes);
      await completed;
      return { generationId, receipt: next, manifest };
    } catch (error) {
      abortQuietly(transaction);
      await Promise.allSettled(writes);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  // Transição atômica em estado inequívoco. Tudo — validação dos dois stores de
  // receipt, contagem de operações não terminais, CAS da geração ativa e a
  // escrita — na mesma transação readwrite. É o que elimina a corrida entre o
  // diagnóstico e a mutação: nenhum estado pode mudar entre "conferi" e "gravei".
  //
  // Nunca escolhe um receipt sozinha: o `operationId` tem de ser exatamente a
  // única operação não terminal encontrada.
  async transitionStorageOperationIfUnambiguous(
    input: TransitionStorageOperationIfUnambiguousInput,
  ): Promise<StorageOperationReceipt> {
    const { operationId, expectedStatus, nextStatus, expectedActiveGenerationId, patch = {} } = input;
    if (!operationId) throw new Error('A transição administrativa exige um operationId.');
    if (!canTransitionStorageOperation(expectedStatus, nextStatus)) {
      throw new StorageOperationTransitionError(
        `A transição ${expectedStatus} → ${nextStatus} não é permitida.`,
      );
    }
    const database = this.requireDatabase();
    const updatedAt = this.now().toISOString();
    const transaction = database.transaction(
      [STORAGE_OPERATION_RECEIPTS_STORE, COMPLETION_RECEIPTS_STORE, METADATA_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);

    try {
      const store = transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE);
      const records = await requestResult(store.getAll()) as unknown[];
      const unsettled: StorageOperationReceipt[] = [];
      for (const record of records) {
        if (!isStorageOperationReceipt(record)) {
          throw new StorageOperationReceiptIntegrityError(
            'Existe um receipt administrativo com formato inválido no armazenamento.',
          );
        }
        if (UNSETTLED_OPERATION_STATUSES.includes(record.status)) unsettled.push(record);
      }
      const unsettledIds = unsettled.map((receipt) => receipt.operationId);
      if (unsettled.length === 0) {
        throw new StorageOperationAmbiguousStateError(
          'no-unsettled-operation',
          'Não existe operação administrativa em aberto para transicionar.',
        );
      }
      if (unsettled.length > 1) {
        throw new StorageOperationAmbiguousStateError(
          'multiple-unsettled-operations',
          `Existem ${unsettled.length} operações administrativas em aberto; nenhuma pode ser escolhida.`,
          unsettledIds,
        );
      }
      const current = unsettled[0];
      if (current.operationId !== operationId) {
        throw new StorageOperationAmbiguousStateError(
          'operation-not-the-unsettled-one',
          `A operação em aberto é ${current.operationId}, e não ${operationId}.`,
          unsettledIds,
        );
      }

      const completionRecords = await requestResult(
        transaction.objectStore(COMPLETION_RECEIPTS_STORE).getAll(),
      ) as unknown[];
      const pendingCompletionIds: string[] = [];
      for (const record of completionRecords) {
        if (!isWorkoutCompletionReceipt(record)) {
          throw new CompletionReceiptIntegrityError(
            'Existe um receipt de conclusão de treino com formato inválido no armazenamento.',
          );
        }
        if (record.status === 'pending') pendingCompletionIds.push(record.receiptId);
      }
      if (pendingCompletionIds.length > 0) {
        throw new StorageCompletionPendingError(pendingCompletionIds);
      }

      const activeGeneration = await this.readMetadataValue<string | null>(transaction, 'activeGeneration');
      if (activeGeneration !== expectedActiveGenerationId) {
        throw new StorageOperationTransitionError(
          `A geração ativa é ${activeGeneration ?? 'nenhuma'}, e não ${expectedActiveGenerationId ?? 'nenhuma'}.`,
        );
      }

      if (current.status !== expectedStatus) {
        throw new StorageOperationTransitionError(
          `O receipt ${operationId} está em ${current.status}, e não em ${expectedStatus}.`,
        );
      }

      const next = {
        ...current,
        sourceDigest: patchedField(patch.sourceDigest, current.sourceDigest),
        stagedGenerationId: patchedField(patch.stagedGenerationId, current.stagedGenerationId),
        targetCoreRaw: patchedField(patch.targetCoreRaw, current.targetCoreRaw),
        status: nextStatus,
        updatedAt,
      } as StorageOperationReceipt;
      if (!isStorageOperationReceipt(next)) {
        throw new StorageOperationReceiptIntegrityError(
          `A transição deixaria o receipt ${operationId} com formato inválido.`,
        );
      }

      await requestResult(store.put(next));
      await completed;
      return next;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  // Reversão segura de uma operação administrativa cuja transição entrou em
  // conflito. Existe SÓ para compensar: o único destino possível é `reverted`,
  // um status terminal que não afirma efeito nenhum.
  //
  // Por que ela não é `transitionStorageOperationIfUnambiguous` com
  // `nextStatus: 'reverted'`: aquela primitiva bloqueia quando existe
  // CompletionReceipt pendente, e o CAS da geração ativa é obrigatório. Numa
  // compensação isso é exatamente o errado — o mundo JÁ divergiu, e recusar a
  // reversão deixaria o receipt preso em `activating` para sempre, bloqueando
  // todo begin futuro. Reverter só reduz o conflito.
  //
  // O que ela mantém: os três stores na transação, validação de TODOS os
  // registros dos dois stores de receipt, exatamente uma operação não terminal
  // que precisa ser a informada, releitura e validação da metadata, CAS opcional
  // da geração ativa, e validação do registro final antes do commit. Nenhum
  // CompletionReceipt é lido para fora, alterado ou liquidado; histórico,
  // manifests e metadata não são tocados; o receipt nunca é apagado nem
  // sobrescrito por `put` sem conferência.
  async revertStorageOperationAfterTransitionConflict(
    input: RevertStorageOperationAfterTransitionConflictInput,
  ): Promise<StorageOperationReceipt> {
    const { operationId, expectedStatus, expectedActiveGenerationId, reason } = input;
    if (!operationId) throw new Error('A reversão administrativa exige um operationId.');
    if (!canTransitionStorageOperation(expectedStatus, 'reverted')) {
      throw new StorageOperationTransitionError(
        `A transição ${expectedStatus} → reverted não é permitida.`,
      );
    }
    const database = this.requireDatabase();
    const updatedAt = this.now().toISOString();
    const transaction = database.transaction(
      [STORAGE_OPERATION_RECEIPTS_STORE, COMPLETION_RECEIPTS_STORE, METADATA_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);

    try {
      const store = transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE);
      const records = await requestResult(store.getAll()) as unknown[];
      const unsettled: StorageOperationReceipt[] = [];
      for (const record of records) {
        if (!isStorageOperationReceipt(record)) {
          throw new StorageOperationReceiptIntegrityError(
            'Existe um receipt administrativo com formato inválido no armazenamento.',
          );
        }
        if (UNSETTLED_OPERATION_STATUSES.includes(record.status)) unsettled.push(record);
      }
      const unsettledIds = unsettled.map((receipt) => receipt.operationId);
      if (unsettled.length === 0) {
        throw new StorageOperationAmbiguousStateError(
          'no-unsettled-operation',
          'Não existe operação administrativa em aberto para reverter.',
        );
      }
      if (unsettled.length > 1) {
        throw new StorageOperationAmbiguousStateError(
          'multiple-unsettled-operations',
          `Existem ${unsettled.length} operações administrativas em aberto; nenhuma pode ser revertida às cegas.`,
          unsettledIds,
        );
      }
      const current = unsettled[0];
      if (current.operationId !== operationId) {
        throw new StorageOperationAmbiguousStateError(
          'operation-not-the-unsettled-one',
          `A operação em aberto é ${current.operationId}, e não ${operationId}.`,
          unsettledIds,
        );
      }
      if (current.status !== expectedStatus) {
        throw new StorageOperationTransitionError(
          `O receipt ${operationId} está em ${current.status}, e não em ${expectedStatus}.`,
        );
      }

      // Os CompletionReceipts entram na transação para serializar com
      // `appendSessionWithCompletionReceipt` e são todos validados — mas uma
      // conclusão pendente NÃO bloqueia a reversão, e nenhum deles é alterado.
      const completionRecords = await requestResult(
        transaction.objectStore(COMPLETION_RECEIPTS_STORE).getAll(),
      ) as unknown[];
      for (const record of completionRecords) {
        if (!isWorkoutCompletionReceipt(record)) {
          throw new CompletionReceiptIntegrityError(
            'Existe um receipt de conclusão de treino com formato inválido no armazenamento.',
          );
        }
      }

      // Metadata precisa ser legível e estruturalmente válida: `readMetadataPointers`
      // recusa ponteiro não textual em vez de convertê-lo para `null`.
      const metadataRecords = await requestResult(
        transaction.objectStore(METADATA_STORE).getAll(),
      ) as unknown[];
      const pointers = readMetadataPointers(metadataRecords);
      if (
        expectedActiveGenerationId !== undefined
        && pointers.activeGeneration !== expectedActiveGenerationId
      ) {
        throw new StorageOperationTransitionError(
          `A geração ativa é ${pointers.activeGeneration ?? 'nenhuma'},`
          + ` e não ${expectedActiveGenerationId ?? 'nenhuma'}.`,
        );
      }

      const next: StorageOperationReceipt = { ...current, status: 'reverted', updatedAt };
      if (!isStorageOperationReceipt(next)) {
        throw new StorageOperationReceiptIntegrityError(
          `A reversão deixaria o receipt ${operationId} com formato inválido (${reason}).`,
        );
      }

      await requestResult(store.put(next));
      await completed;
      return next;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  async readStorageOperationReceipt(operationId: string): Promise<StorageOperationReceipt | null> {
    if (!operationId) throw new Error('A leitura do receipt administrativo exige um operationId.');
    const database = this.requireDatabase();
    const transaction = database.transaction(STORAGE_OPERATION_RECEIPTS_STORE, 'readonly');
    const completed = transactionResult(transaction);
    const record = await requestResult(
      transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE).get(operationId),
    ) as unknown;
    await completed;
    if (record === undefined || record === null) return null;
    if (!isStorageOperationReceipt(record)) {
      throw new StorageOperationReceiptIntegrityError(
        `O receipt administrativo ${operationId} está com formato inválido.`,
      );
    }
    return record;
  }

  // Só status não terminais. `settled` e `reverted` ficam de fora por definição.
  //
  // A varredura é do store inteiro, e não do índice `byStatus`: um registro com
  // status ausente ou inválido não aparece em índice nenhum, e devolver "nada em
  // aberto" sobre um store corrompido é exatamente a conclusão perigosa que o
  // runtime do 002D-A2 não pode tirar. Qualquer registro malformado interrompe a
  // listagem.
  async listUnsettledStorageOperationReceipts(): Promise<StorageOperationReceipt[]> {
    const database = this.requireDatabase();
    const transaction = database.transaction(STORAGE_OPERATION_RECEIPTS_STORE, 'readonly');
    const completed = transactionResult(transaction);
    const records = await requestResult(
      transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE).getAll(),
    ) as unknown[];
    await completed;

    const receipts: StorageOperationReceipt[] = [];
    for (const record of records) {
      if (!isStorageOperationReceipt(record)) {
        throw new StorageOperationReceiptIntegrityError(
          'Existe um receipt administrativo com formato inválido no armazenamento.',
        );
      }
      if (UNSETTLED_OPERATION_STATUSES.includes(record.status)) receipts.push(record);
    }
    return receipts.sort((left, right) => (
      left.createdAt === right.createdAt
        ? left.operationId.localeCompare(right.operationId)
        : left.createdAt.localeCompare(right.createdAt)
    ));
  }

  // Compare-and-swap: leitura e escrita na mesma transação, `expectedStatus`
  // obrigatório e validação do registro final antes do commit. Duas transições
  // concorrentes nunca passam as duas.
  async transitionStorageOperationReceipt(
    operationId: string,
    expectedStatus: StorageOperationStatus,
    nextStatus: StorageOperationStatus,
    patch: StorageOperationReceiptPatch = {},
  ): Promise<StorageOperationReceipt> {
    if (!operationId) throw new Error('A transição do receipt administrativo exige um operationId.');
    if (!canTransitionStorageOperation(expectedStatus, nextStatus)) {
      throw new StorageOperationTransitionError(
        `A transição ${expectedStatus} → ${nextStatus} não é permitida.`,
      );
    }
    const database = this.requireDatabase();
    const updatedAt = this.now().toISOString();
    const transaction = database.transaction(STORAGE_OPERATION_RECEIPTS_STORE, 'readwrite');
    const completed = transactionResult(transaction);

    try {
      const store = transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE);
      const record = await requestResult(store.get(operationId)) as unknown;
      if (record === undefined || record === null) {
        throw new StorageOperationTransitionError(
          `O receipt administrativo ${operationId} não existe.`,
        );
      }
      if (!isStorageOperationReceipt(record)) {
        throw new StorageOperationReceiptIntegrityError(
          `O receipt administrativo ${operationId} está com formato inválido.`,
        );
      }
      if (record.status !== expectedStatus) {
        throw new StorageOperationTransitionError(
          `O receipt ${operationId} está em ${record.status}, e não em ${expectedStatus}.`,
        );
      }

      const next = {
        ...record,
        sourceDigest: patchedField(patch.sourceDigest, record.sourceDigest),
        stagedGenerationId: patchedField(patch.stagedGenerationId, record.stagedGenerationId),
        targetCoreRaw: patchedField(patch.targetCoreRaw, record.targetCoreRaw),
        status: nextStatus,
        updatedAt,
      } as StorageOperationReceipt;
      if (!isStorageOperationReceipt(next)) {
        throw new StorageOperationReceiptIntegrityError(
          `A transição deixaria o receipt ${operationId} com formato inválido.`,
        );
      }

      await requestResult(store.put(next));
      await completed;
      return next;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  // Enumeração diagnóstica: união dos generationIds encontrados nos registros,
  // nos manifests, nos marcadores físicos de staging e nos dois ponteiros de
  // metadata. É assim que geração órfã, manifest sem registros e registros sem
  // manifest ficam visíveis em vez de sumirem. Não repara, não apaga, não ativa.
  async listHistoryGenerations(): Promise<HistoryGenerationSummary[]> {
    const database = this.requireDatabase();
    const transaction = database.transaction(
      [METADATA_STORE, WORKOUT_HISTORY_STORE, GENERATION_MANIFESTS_STORE],
      'readonly',
    );
    const completed = transactionResult(transaction);
    const [metadataRecords, manifestRecords, historyKeys] = await Promise.all([
      requestResult(transaction.objectStore(METADATA_STORE).getAll()) as Promise<unknown[]>,
      requestResult(
        transaction.objectStore(GENERATION_MANIFESTS_STORE).getAll(),
      ) as Promise<unknown[]>,
      requestResult(transaction.objectStore(WORKOUT_HISTORY_STORE).getAllKeys()),
    ]);
    await completed;

    const recordCounts = new Map<string, number>();
    for (const key of historyKeys) {
      if (!Array.isArray(key) || typeof key[0] !== 'string') continue;
      recordCounts.set(key[0], (recordCounts.get(key[0]) ?? 0) + 1);
    }

    return summarizeGenerations(metadataRecords, manifestRecords, recordCounts).summaries;
  }

  // Retrato administrativo coerente: UMA transação readonly cobrindo os cinco
  // stores relevantes. Nenhuma transação auxiliar, nenhuma releitura por fora —
  // é isso que garante que metadata, gerações, receipts e conclusões pendentes
  // descrevem o MESMO instante. Não repara, não apaga, não cria manifest, não
  // liquida receipt, não move ponteiro, não escreve nada.
  async readStorageAdministrationSnapshot(): Promise<StorageAdministrationSnapshotRead> {
    return (await this.readStorageAdministrationSnapshotInternal()).snapshot;
  }

  async readStorageAdministrationSnapshotWithRetirementJournal(): Promise<
    StorageAdministrationSnapshotWithRetirementJournal
  > {
    return this.readStorageAdministrationSnapshotInternal();
  }

  private async readStorageAdministrationSnapshotInternal(): Promise<
    StorageAdministrationSnapshotWithRetirementJournal
  > {
    const database = this.requireDatabase();
    // O SHA-256 dos cores dos receipts é assíncrono e não pode rodar com a
    // transação aberta. Prepare-o antes do retrato final; a transação abaixo
    // relê os receipts e falha fechado se qualquer core que alimenta os
    // marcadores tiver mudado nesse intervalo.
    const preparedReceiptCoreState = await prepareReceiptCoreState(
      database,
      this.subtleCrypto,
    );
    const transaction = database.transaction(
      [
        METADATA_STORE,
        WORKOUT_HISTORY_STORE,
        GENERATION_MANIFESTS_STORE,
        STORAGE_OPERATION_RECEIPTS_STORE,
        COMPLETION_RECEIPTS_STORE,
      ],
      'readonly',
    );
    const completed = transactionResult(transaction);

    try {
      const [metadataRecords, historyRecords, manifestRecords, operationRecords, completionRecords] =
        await Promise.all([
          requestResult(transaction.objectStore(METADATA_STORE).getAll()) as Promise<unknown[]>,
          requestResult(transaction.objectStore(WORKOUT_HISTORY_STORE).getAll()) as Promise<HistoryRecord[]>,
          requestResult(transaction.objectStore(GENERATION_MANIFESTS_STORE).getAll()) as Promise<unknown[]>,
          requestResult(transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE).getAll()) as Promise<unknown[]>,
          requestResult(transaction.objectStore(COMPLETION_RECEIPTS_STORE).getAll()) as Promise<unknown[]>,
        ]);
      await completed;
      // O journal é capturado dos mesmos metadataRecords da transação. Ele
      // continua fora do fingerprint por compatibilidade com proofs recorded,
      // mas o fechamento que o consome agora tem um instante único.
      const retirementJournal = readRetirementJournalRaw(metadataRecords);

      // Todo receipt é validado antes de qualquer filtragem: um registro
      // malformado nunca vira "nada em aberto".
      const operationReceipts = parseStorageOperationReceipts(operationRecords);
      if (!sameReceiptCoreInputs(preparedReceiptCoreState.receipts, operationReceipts)) {
        throw new StorageOperationReceiptIntegrityError(
          'Os cores dos receipts mudaram durante a leitura do snapshot administrativo.',
        );
      }

      const completionReceipts: WorkoutCompletionReceipt[] = [];
      for (const record of completionRecords) {
        if (!isWorkoutCompletionReceipt(record)) {
          throw new CompletionReceiptIntegrityError(
            'Existe um receipt de conclusão de treino com formato inválido no armazenamento.',
          );
        }
        completionReceipts.push(record);
      }
      const pendingCompletionReceipts = completionReceipts
        .filter((receipt) => receipt.status === 'pending')
        .sort((left, right) => (
          left.createdAt === right.createdAt
            ? left.receiptId.localeCompare(right.receiptId)
            : left.createdAt.localeCompare(right.createdAt)
        ));

      const recordCounts = new Map<string, number>();
      for (const record of historyRecords) {
        if (typeof record?.generationId !== 'string') continue;
        recordCounts.set(record.generationId, (recordCounts.get(record.generationId) ?? 0) + 1);
      }

      const enumeration = summarizeGenerations(metadataRecords, manifestRecords, recordCounts);
      const { activeGeneration, migrationGeneration, manifests, summaries } = enumeration;

      const activeGenerationRecords = activeGeneration
        ? sortHistoryRecords(historyRecords.filter((record) => record.generationId === activeGeneration))
        : [];
      const activeManifestEntry = activeGeneration ? manifests.get(activeGeneration) : undefined;
      const hasActiveStagingMarker = metadataRecords.some((entry) => (
        (entry as Partial<MetadataRecord> | null)?.key === `${INTERNAL_NEXT_ORDER_PREFIX}${activeGeneration}`
      ));

      return {
        snapshot: {
          metadata: {
            ...METADATA_DEFAULTS,
            ...Object.fromEntries(
              (metadataRecords as Partial<MetadataRecord>[])
                .filter((record) => typeof record?.key === 'string'
                  && Object.prototype.hasOwnProperty.call(METADATA_DEFAULTS, record.key))
                .map((record) => [record.key as string, record.value]),
            ),
            activeGeneration,
            migrationGeneration,
          } as HistoryStorageMetadata,
          activeGenerationId: activeGeneration,
          migrationGenerationId: migrationGeneration,
          generations: summaries,
          manifests: Array.from(manifests.values()).filter((manifest): manifest is HistoryGenerationManifest => (
            manifest !== null
          )),
          activeGenerationRecords: activeGenerationRecords.map((record) => ({
            generationId: record.generationId,
            sessionId: record.sessionId,
            order: record.order,
            // Cópia estrutural: o chamador nunca recebe referência viva do IDB.
            session: JSON.parse(JSON.stringify(record.session)) as WorkoutSession,
            digest: record.digest ?? null,
          })),
          activeGenerationManifest: activeManifestEntry ?? null,
          activeGenerationPresent: Boolean(activeGeneration) && (
            activeGenerationRecords.length > 0 || activeManifestEntry !== undefined || hasActiveStagingMarker
          ),
          operationReceipts,
          unsettledOperations: operationReceipts.filter((receipt) => (
            UNSETTLED_OPERATION_STATUSES.includes(receipt.status)
          )),
          pendingCompletionReceipts,
          fingerprint: fingerprintAdministrationSnapshot({
            metadataRecords,
            manifests,
            historyRecords,
            operationReceipts,
            pendingCompletionReceipts,
            receiptCoreMarkers: preparedReceiptCoreState.markers,
          }),
        },
        retirementJournal,
      };
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  // Leitura verificada: presença física, manifest obrigatório, digest
  // recalculado e verificação de integridade completa. Nunca devolve `[]` por
  // ausência, nunca aceita manifest ausente e nunca corrige nada.
  async readVerifiedHistoryGeneration(generationId: string): Promise<VerifiedHistoryGeneration> {
    return (await this.verifyGenerationWithProof(generationId)).verified;
  }

  // Verificação integral + prova do estado físico exato que foi verificado. A
  // prova sai da mesma leitura crua que alimentou a verificação, então ela
  // descreve precisamente o conteúdo aprovado — nunca um estado posterior.
  private async verifyGenerationWithProof(generationId: string): Promise<{
    verified: VerifiedHistoryGeneration;
    proof: readonly HistoryGenerationRecordProof[];
  }> {
    if (!generationId) throw new Error('A leitura verificada exige um generationId.');
    const raw = await this.readGenerationRecords(generationId);
    const verification = await verifyHistoryGeneration(
      generationId,
      {
        present: raw.present,
        manifest: raw.manifest,
        sessions: raw.records.map((record) => record.session),
        recordDigests: raw.records.map((record) => record.digest ?? null),
      },
      this.subtleCrypto,
    );
    if (verification.status !== 'verified') {
      throw new HistoryGenerationIntegrityError(verification.reason, verification.message);
    }
    return {
      verified: {
        generationId,
        sessions: verification.sessions,
        manifest: verification.manifest,
      },
      proof: buildGenerationProof(raw.records),
    };
  }

  // Rollback físico do ponteiro de geração ativa.
  //
  // A transação inclui workoutHistory de propósito: sem ele o store não é
  // serializado e um escritor concorrente conseguiria alterar as sessões entre a
  // verificação e a ativação — a janela real encontrada pela auditoria Classe C
  // do 002D-A1, reproduzida com sessão alterada, removida e adicionada.
  //
  // ATENÇÃO: isto continua não sendo o rollback completo do aplicativo. Só o
  // ponteiro do IndexedDB muda; o core v2 no localStorage precisa ser coordenado
  // pelo runtime seguro do 002D-A2/C/D. Não há call site real desta primitiva.
  async rollbackToHistoryGeneration(
    input: RollbackHistoryGenerationInput,
  ): Promise<RollbackHistoryGenerationResult> {
    const { targetGenerationId, expectedActiveGenerationId, clearStagedGenerationId } = input;
    if (!targetGenerationId) throw new Error('O rollback exige um targetGenerationId.');
    if (!expectedActiveGenerationId) {
      throw new Error('O rollback exige o expectedActiveGenerationId observado.');
    }

    // Verificação integral antes de qualquer escrita: alvo ausente, sem manifest
    // ou com digest divergente aborta aqui, sem tocar em metadata. A prova
    // registra o conteúdo exato aprovado, para reconferência dentro da transação.
    const { verified, proof } = await this.verifyGenerationWithProof(targetGenerationId);
    const expectedManifest = verified.manifest;

    const database = this.requireDatabase();
    const transaction = database.transaction(
      [METADATA_STORE, GENERATION_MANIFESTS_STORE, WORKOUT_HISTORY_STORE],
      'readwrite',
    );
    const completed = transactionResult(transaction);

    try {
      const [activeGeneration, migrationGeneration] = await Promise.all([
        this.readMetadataValue<string | null>(transaction, 'activeGeneration'),
        this.readMetadataValue<string | null>(transaction, 'migrationGeneration'),
      ]);
      if (activeGeneration !== expectedActiveGenerationId) {
        throw new HistoryRollbackConflictError(
          `A geração ativa é ${activeGeneration ?? 'nenhuma'}, e não ${expectedActiveGenerationId}.`,
        );
      }
      if (clearStagedGenerationId !== undefined && migrationGeneration !== clearStagedGenerationId) {
        throw new HistoryRollbackConflictError(
          `A geração preparada é ${migrationGeneration ?? 'nenhuma'}, e não ${clearStagedGenerationId}.`,
        );
      }

      const manifest = await this.readManifestRecord(transaction, targetGenerationId);
      if (!manifest || !manifestsMatch(manifest, expectedManifest)) {
        throw new HistoryRollbackConflictError(
          `O manifest da geração ${targetGenerationId} mudou entre a verificação e o commit.`,
        );
      }

      // Reconferência do conteúdo físico dentro da própria transação, contra a
      // prova canônica. Comparação síncrona de strings: nenhum `crypto.subtle`,
      // nenhum await estranho à transação, nenhum risco de desativá-la.
      const currentRecords = await requestResult(
        transaction.objectStore(WORKOUT_HISTORY_STORE)
          .index(BY_GENERATION_INDEX)
          .getAll(targetGenerationId),
      ) as HistoryRecord[];
      assertGenerationMatchesProof(targetGenerationId, currentRecords, proof);

      const metadataStore = transaction.objectStore(METADATA_STORE);
      // No-op não reescreve o ponteiro: ele passa pelas mesmas verificações, mas
      // metadata permanece intocada quando o alvo já é a geração ativa.
      if (activeGeneration !== targetGenerationId) {
        await requestResult(metadataStore.put({
          key: 'activeGeneration',
          value: targetGenerationId,
        } satisfies MetadataRecord));
      }
      if (clearStagedGenerationId !== undefined) {
        await requestResult(metadataStore.put({
          key: 'migrationGeneration',
          value: null,
        } satisfies MetadataRecord));
      }
      await completed;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }

    const metadata = await this.readMetadata();
    if (metadata.activeGeneration !== targetGenerationId) {
      throw new HistoryRollbackConflictError(
        `A geração ativa não confirmou ${targetGenerationId} após o commit.`,
      );
    }
    return {
      targetGenerationId,
      previousActiveGenerationId: expectedActiveGenerationId,
      clearedStagedGenerationId: clearStagedGenerationId ?? null,
      sessionCount: expectedManifest.sessionCount,
      orderedDigest: expectedManifest.orderedDigest,
      activeGeneration: metadata.activeGeneration,
      migrationGeneration: metadata.migrationGeneration,
      changed: expectedActiveGenerationId !== targetGenerationId,
    };
  }

  private requireDatabase(): IDBDatabase {
    if (!this.database) throw new IndexedDbNotOpenError();
    return this.database;
  }

  private async readManifestRecord(
    transaction: IDBTransaction,
    generationId: string,
  ): Promise<HistoryGenerationManifest | null> {
    const record = await requestResult(
      transaction.objectStore(GENERATION_MANIFESTS_STORE).get(generationId),
    ) as unknown;
    if (record === undefined || record === null) return null;
    if (!isHistoryGenerationManifest(record)) {
      throw new HistoryManifestIntegrityError(
        `O manifest da geração ${generationId} está com formato inválido.`,
      );
    }
    return record;
  }

  async readStorageRetirementJournal(): Promise<unknown> {
    const database = this.requireDatabase();
    const transaction = database.transaction(METADATA_STORE, 'readonly');
    const completed = transactionResult(transaction);
    try {
      const value = await this.readMetadataValue<unknown>(
        transaction,
        STORAGE_RETIREMENT_JOURNAL_METADATA_KEY,
      );
      await completed;
      return value ?? null;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  // Compare-and-put atômico: uma transação readwrite cobre os stores do
  // retrato administrativo e o metadata do journal. Revalida o fingerprint
  // (sem incluir retirementJournal:v1), lê o journal atual, decide e só então
  // grava. Duas transações concorrentes serializam; last-write-win silencioso
  // é impossível. O lease cooperativo não participa desta primitive.
  async compareAndPutStorageRetirementJournal(
    input: CompareAndPutStorageRetirementJournalInput,
  ): Promise<StorageRetirementJournalWriteResult> {
    if (
      !isStorageRetirementJournal(input.journal)
      || typeof input.expectedFingerprint !== 'string'
      || input.expectedFingerprint.length === 0
    ) {
      return toStorageRetirementJournalWriteResult('blocked-unknown-state', null);
    }

    const database = this.requireDatabase();
    const transaction = database.transaction([...ADMINISTRATION_CAS_STORES], 'readwrite');
    const completed = transactionResult(transaction);
    let stopKeepAlive: () => void = () => undefined;

    try {
      const [metadataRecords, historyRecords, manifestRecords, operationRecords, completionRecords] =
        await Promise.all([
          requestResult(transaction.objectStore(METADATA_STORE).getAll()) as Promise<unknown[]>,
          requestResult(transaction.objectStore(WORKOUT_HISTORY_STORE).getAll()) as Promise<HistoryRecord[]>,
          requestResult(transaction.objectStore(GENERATION_MANIFESTS_STORE).getAll()) as Promise<unknown[]>,
          requestResult(transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE).getAll()) as Promise<unknown[]>,
          requestResult(transaction.objectStore(COMPLETION_RECEIPTS_STORE).getAll()) as Promise<unknown[]>,
        ]);

      const operationReceipts: StorageOperationReceipt[] = [];
      for (const record of operationRecords) {
        if (!isStorageOperationReceipt(record)) {
          throw new StorageOperationReceiptIntegrityError(
            'Existe um receipt administrativo com formato inválido no armazenamento.',
          );
        }
        operationReceipts.push(record);
      }

      const pendingCompletionReceipts: WorkoutCompletionReceipt[] = [];
      for (const record of completionRecords) {
        if (!isWorkoutCompletionReceipt(record)) {
          throw new CompletionReceiptIntegrityError(
            'Existe um receipt de conclusão de treino com formato inválido no armazenamento.',
          );
        }
        if (record.status === 'pending') pendingCompletionReceipts.push(record);
      }

      const recordCounts = new Map<string, number>();
      for (const record of historyRecords) {
        if (typeof record?.generationId !== 'string') continue;
        recordCounts.set(record.generationId, (recordCounts.get(record.generationId) ?? 0) + 1);
      }
      const { manifests } = summarizeGenerations(metadataRecords, manifestRecords, recordCounts);

      stopKeepAlive = startMetadataKeepAlive(transaction);
      const receiptCoreMarkers = await markReceiptCores(operationReceipts, this.subtleCrypto);
      const actualFingerprint = fingerprintAdministrationSnapshot({
        metadataRecords,
        manifests,
        historyRecords,
        operationReceipts,
        pendingCompletionReceipts,
        receiptCoreMarkers,
      });

      const decision = decideStorageRetirementJournalCas({
        expectedFingerprint: input.expectedFingerprint,
        actualFingerprint,
        existingRaw: readRetirementJournalRaw(metadataRecords),
        next: input.journal,
      });

      if (decision.shouldPut) {
        if (decision.journal === null) {
          throw new Error('O compare-and-put recusou gravar um journal nulo.');
        }
        await requestResult(transaction.objectStore(METADATA_STORE).put(
          retirementJournalRecord(decision.journal),
        ));
      }

      stopKeepAlive();
      await completed;
      return toStorageRetirementJournalWriteResult(decision.status, decision.journal);
    } catch {
      stopKeepAlive();
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      return toStorageRetirementJournalWriteResult('blocked-unknown-state', null);
    }
  }

  // Fixture de teste: planta um journal sem CAS. Nenhum writer de produção
  // chama este método.
  async writeStorageRetirementJournalRecord(journal: StorageRetirementJournal): Promise<void> {
    if (!isStorageRetirementJournal(journal)) {
      throw new Error('O journal de retirement está com formato inválido.');
    }
    const database = this.requireDatabase();
    const transaction = database.transaction(METADATA_STORE, 'readwrite');
    const completed = transactionResult(transaction);
    try {
      await requestResult(transaction.objectStore(METADATA_STORE).put(
        retirementJournalRecord(journal),
      ));
      await completed;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  // Base otimista do append/reescrita: o digest encadeado precisa ser calculado
  // fora da transação, então a transação de escrita reconfere esta base.
  private async readActiveGenerationBase(): Promise<{
    generationId: string;
    manifest: HistoryGenerationManifest;
  }> {
    const database = this.requireDatabase();
    const transaction = database.transaction(
      [METADATA_STORE, GENERATION_MANIFESTS_STORE],
      'readonly',
    );
    const completed = transactionResult(transaction);
    try {
      const generationId = await this.requireActiveGeneration(transaction);
      const manifest = await this.readManifestRecord(transaction, generationId);
      await completed;
      if (!manifest) {
        throw new HistoryManifestIntegrityError(
          `A geração ativa ${generationId} não possui manifest durável.`,
        );
      }
      if (!manifest.verified) {
        throw new HistoryManifestIntegrityError(
          `O manifest da geração ativa ${generationId} não está confirmado.`,
        );
      }
      return { generationId, manifest };
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  private async readMetadataValue<T>(transaction: IDBTransaction, key: string): Promise<T | undefined> {
    const record = await requestResult(
      transaction.objectStore(METADATA_STORE).get(key),
    ) as MetadataRecord | undefined;
    return record?.value as T | undefined;
  }

  private async readLegacySnapshotRecord(): Promise<StoredLegacySnapshotRecord | undefined> {
    const database = this.requireDatabase();
    const transaction = database.transaction(LEGACY_SNAPSHOTS_STORE, 'readonly');
    const completed = transactionResult(transaction);

    try {
      const record = await requestResult(
        transaction.objectStore(LEGACY_SNAPSHOTS_STORE).get(LEGACY_SNAPSHOT_ID),
      ) as StoredLegacySnapshotRecord | undefined;
      await completed;
      return record;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  private async writeLegacySnapshotRecord(record: StoredLegacySnapshotRecord): Promise<void> {
    const database = this.requireDatabase();
    const transaction = database.transaction(LEGACY_SNAPSHOTS_STORE, 'readwrite');
    const completed = transactionResult(transaction);

    try {
      await requestResult(transaction.objectStore(LEGACY_SNAPSHOTS_STORE).put(record));
      await completed;
    } catch (error) {
      abortQuietly(transaction);
      await completed.catch(() => undefined);
      throw error;
    }
  }

  private async requireActiveGeneration(transaction: IDBTransaction): Promise<string> {
    const generationId = await this.readMetadataValue<string | null>(transaction, 'activeGeneration');
    if (!generationId) throw new Error('Não existe uma geração ativa de histórico.');
    return generationId;
  }
}
