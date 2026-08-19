import type {
  AdministrableWorkoutHistoryStorageAdapter,
  HistoryGenerationSummary,
  StorageAdministrationSnapshotRead,
  VerifiedHistoryGeneration,
} from './storage-adapter';
import { sha256Checksum } from './storage-history-integrity';
import {
  type HistoryGenerationVerification,
  verifyHistoryGeneration,
} from './storage-history-integrity';
import {
  CompletionReceiptIntegrityError,
  HistoryManifestIntegrityError,
  HistoryMetadataIntegrityError,
  StorageCompletionPendingError,
  StorageOperationAlreadyInProgressError,
  StorageOperationAmbiguousStateError,
  StorageOperationBeginConflictError,
  type StorageOperationFinalReceiptStatus,
  StorageOperationReceiptIntegrityError,
  StorageOperationTransitionConflictError,
  type StorageOperationTransitionConflictReason,
  StorageOperationTransitionError,
  type StorageOperationTransitionPhase,
} from './storage-indexeddb';
import { parsePhysicalEnvelope } from './storage-hybrid';
import {
  type StorageOperationCompatibility,
  createStorageOperationReceipt,
  declaredSupersedesMatchLiveRelations,
  detectStorageOperationSupersessionCycle,
  evaluateStorageOperationCompatibility,
  listActivePredecessorSourceOperationIds,
  type StorageOperationKind,
  type StorageOperationReceipt,
  type StorageOperationReceiptPatch,
  type StorageOperationStatus,
  validateStorageOperationSupersession,
} from './storage-operation-receipt';
import {
  HYBRID_STORAGE_VERSION,
  MONOLITHIC_STORAGE_VERSION,
  type StorageLike,
} from './storage-types';

// Fachada administrativa interna do runtime híbrido (002D-A2 + corretivo 036).
//
// Ela fica entre as primitivas físicas do IndexedDB (002D-A1: receipts,
// enumeração de gerações, leitura verificada, rollback físico, CAS) e os
// futuros fluxos reais de importação/restauração/reset/rollback completo
// (002D-C/D). Nada aqui executa uma dessas operações: `beginStorageOperation`
// só cria um receipt `staged`. Nada aqui é chamado pelo Provider, por um
// componente ou pelo boot — não há call site real nesta etapa.
//
// O corretivo 036 fechou os conflitos Classe C da auditoria independente:
// `ready` agora exige verificação criptográfica integral da geração ativa (a
// flag persistida do manifest nunca foi prova), o diagnóstico usa leitura
// atômica + double-read com fingerprint, a criação do receipt serializa com os
// CompletionReceipts na mesma transação, a transição é bloqueada em qualquer
// estado ambíguo e a falha da compensação nunca mais é silenciosa.

export {
  StorageCompletionPendingError,
  StorageOperationAlreadyInProgressError,
  StorageOperationAmbiguousStateError,
  StorageOperationBeginConflictError,
  StorageOperationTransitionConflictError,
};

export type {
  StorageOperationFinalReceiptStatus,
  StorageOperationTransitionConflictReason,
  StorageOperationTransitionPhase,
};

export type StorageAdministrationUnavailableReason =
  | 'storage-blocked'
  | 'not-hybrid'
  | 'indexeddb-unavailable'
  | 'physical-version-mismatch'
  | 'core-invalid';

export type StorageAdministrationConflictReason =
  | 'multiple-unsettled-operations'
  | 'malformed-operation-receipt'
  | 'malformed-completion-receipt'
  | 'metadata-malformed'
  | 'completion-pending'
  | 'completion-pending-with-operation'
  | 'staging-without-receipt'
  | 'active-generation-corrupt'
  // Duas leituras atômicas consecutivas descreveram estados físicos diferentes:
  // alguém escreveu durante o diagnóstico. O snapshot não escolhe qual leitura
  // está certa — recusa as duas.
  | 'administration-snapshot-unstable'
  // O core v2 do localStorage mudou entre as leituras que cercam o snapshot.
  | 'core-changed-during-inspection'
  // Existe exatamente uma operação em aberto, mas ela não descreve o mesmo
  // mundo que o core e a metadata observados agora.
  | 'operation-incompatible'
  | 'no-unsettled-operation'
  | 'operation-not-the-unsettled-one';

export type StorageAdministrationState =
  // `cause` carrega a falha interna original quando existe uma. Ela nunca é
  // reduzida a texto em `detail`: quem transforma o estado em exceção precisa
  // conseguir repassar a raiz.
  | {
      status: 'unavailable';
      reason: StorageAdministrationUnavailableReason;
      detail: string;
      cause?: unknown;
    }
  | { status: 'ready' }
  | { status: 'interrupted'; operation: StorageOperationReceipt }
  | {
      status: 'conflicted';
      reason: StorageAdministrationConflictReason;
      detail: string;
      operations: readonly StorageOperationReceipt[];
      cause?: unknown;
    };

// Snapshot diagnóstico. Sempre a partir de dados reais: nunca repara, nunca
// apaga, nunca ativa geração, nunca liquida ou cria receipt, nunca escreve em
// localStorage ou IndexedDB. Campos que dependem de uma leitura que falhou
// ficam em seu valor neutro (`null`/`[]`/`0`) — o motivo da falha vive em
// `state`.
//
// O estado descrito é o de um instante observado em DUAS leituras atômicas
// idênticas. Uma alteração iniciada depois da leitura final aparece no próximo
// `inspect`; ela nunca é misturada a este snapshot.
export interface StorageAdministrationSnapshot {
  state: StorageAdministrationState;
  physicalStorageVersion: number | null;
  activeGenerationId: string | null;
  stagedGenerationId: string | null;
  generations: HistoryGenerationSummary[];
  unsettledOperations: readonly StorageOperationReceipt[];
  pendingCompletionReceiptCount: number;
  // Checksum best-effort do core físico bruto (`sha256:<hex>`), quando o Web
  // Crypto está disponível. Não é usado para nenhuma decisão de estado — é
  // puramente informativo, um jeito barato de comparar dois snapshots sem
  // carregar o core inteiro.
  coreDigest: string | null;
  // Resultado da verificação criptográfica integral da geração ativa, feita
  // DENTRO da janela do double-read. `null` quando não havia geração ativa ou
  // quando o diagnóstico parou antes de chegar nela.
  activeGenerationIntegrity: HistoryGenerationVerification | null;
  // Impressão digital determinística do estado físico observado. Igual em duas
  // leituras consecutivas é o que autoriza qualquer conclusão estável.
  administrationFingerprint: string | null;
  // Core v2 bruto exatamente como observado na janela estável. Fica aqui para
  // que qualquer decisão posterior use o MESMO core que o diagnóstico usou, em
  // vez de reler e reabrir a janela que o double-read acabou de fechar.
  coreRawObserved: string | null;
}

interface BeginStorageOperationBaseInput {
  sourceDigest: string | null;
  // O coordenador de owner-token pode reservar a identidade antes do primeiro
  // write. Ausente, preserva o contrato histórico e usa `idFactory`.
  reservedOperationId?: string;
  // No A2 os dois precisam ser `null`: nenhum fluxo desta etapa cria staging
  // físico ou core alvo, então aceitar valor aqui gravaria no receipt uma
  // promessa que nada cumpriu. Reservados para 002D-C/D.
  stagedGenerationId: string | null;
}

export type BeginStorageOperationInput =
  | (BeginStorageOperationBaseInput & {
      kind: 'restore';
      expectedPreviousCoreRaw: string;
      expectedPreviousGenerationId: string;
      targetGenerationId: string;
      targetCoreRaw: string;
    })
  | (BeginStorageOperationBaseInput & {
      kind: Exclude<StorageOperationKind, 'restore'>;
      targetGenerationId?: never;
      targetCoreRaw: null;
    });

export interface TransitionStorageOperationInput {
  operationId: string;
  expectedStatus: StorageOperationStatus;
  nextStatus: StorageOperationStatus;
  patch?: StorageOperationReceiptPatch;
}

export interface RevertStorageOperationSafelyInput {
  operationId: string;
  expectedStatus: StorageOperationStatus;
}

export interface StorageAdminRuntimeOptions {
  key: string;
  storage: StorageLike;
  adapter: AdministrableWorkoutHistoryStorageAdapter;
  now?: () => Date;
  idFactory?: () => string;
  subtleCrypto?: SubtleCrypto | null;
}

export interface StorageAdminRuntime {
  inspectStorageAdministration(): Promise<StorageAdministrationSnapshot>;
  readVerifiedAdministrationGeneration(generationId: string): Promise<VerifiedHistoryGeneration>;
  beginStorageOperation(input: BeginStorageOperationInput): Promise<StorageOperationReceipt>;
  transitionStorageOperation(input: TransitionStorageOperationInput): Promise<StorageOperationReceipt>;
  // Saída de emergência: leva a operação em aberto para `reverted` mesmo quando
  // o diagnóstico está `conflicted` por incoerência entre receipt, core e
  // metadata. Sem ela, um receipt que avançou sobre um core que depois divergiu
  // ficaria preso — `transitionStorageOperation` exige `interrupted`, e o
  // estado divergente nunca volta a ser `interrupted`.
  revertStorageOperationSafely(input: RevertStorageOperationSafelyInput): Promise<StorageOperationReceipt>;
}

// Motivo explícito sempre que o estado bloqueia leitura verificada ou início
// de operação. `unavailable`: a camada física em si não está utilizável
// (envelope legado, IndexedDB fora do ar, core ausente ou corrompido).
export class StorageAdministrationUnavailableError extends Error {
  readonly reason: StorageAdministrationUnavailableReason;

  constructor(reason: StorageAdministrationUnavailableReason, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageAdministrationUnavailableError';
    this.reason = reason;
  }
}

// A camada física está de pé, mas o estado administrativo é ambíguo demais
// para autorizar uma mutação (mais de um receipt em aberto, staging sem
// explicação, geração ativa corrompida, conclusão de treino coexistindo com
// operação administrativa, snapshot instável etc.).
export class StorageAdministrationConflictError extends Error {
  readonly reason: StorageAdministrationConflictReason;

  constructor(reason: StorageAdministrationConflictReason, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageAdministrationConflictError';
    this.reason = reason;
  }
}

export type StorageAdministrationInputField =
  | 'operationId'
  | 'generationId'
  | 'stagedGenerationId'
  | 'targetGenerationId'
  | 'targetCoreRaw'
  | 'expectedPreviousCoreRaw'
  | 'expectedPreviousGenerationId'
  | 'now'
  | 'kind';

// Entrada recusada ANTES de qualquer leitura ou escrita. Nunca é um TypeError
// nem um RangeError cru: quando encapsula um, a causa original continua em
// `cause`.
export class StorageAdministrationInputError extends Error {
  readonly field: StorageAdministrationInputField;

  constructor(field: StorageAdministrationInputField, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageAdministrationInputError';
    this.field = field;
  }
}

// Conflitos que tornam a própria identificação/verificação de uma geração não
// confiável. Só eles bloqueiam a leitura diagnóstica read-only; os demais
// (receipt malformado, operação ambígua, conclusão pendente) não atrapalham
// verificar uma geração nomeada explicitamente pelo chamador.
const CONFLICTS_BLOCKING_VERIFIED_READ: readonly StorageAdministrationConflictReason[] = [
  'metadata-malformed',
  'administration-snapshot-unstable',
  'core-changed-during-inspection',
];

function defaultOperationId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `operation-${globalThis.crypto.randomUUID()}`;
  }
  return `operation-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function describeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Falha administrativa sem detalhe.';
}

function describeFinalStatus(status: StorageOperationFinalReceiptStatus): string {
  if (status === 'missing') return 'ausente (o registro não existe mais)';
  if (status === 'unknown') return 'desconhecido';
  return status;
}

function unavailableState(
  reason: StorageAdministrationUnavailableReason,
  detail: string,
  cause?: unknown,
): StorageAdministrationState {
  return { status: 'unavailable', reason, detail, cause };
}

function conflictedState(
  reason: StorageAdministrationConflictReason,
  detail: string,
  operations: readonly StorageOperationReceipt[],
  cause?: unknown,
): StorageAdministrationState {
  return { status: 'conflicted', reason, detail, operations, cause };
}

function emptySnapshot(
  state: StorageAdministrationState,
  physicalStorageVersion: number | null,
): StorageAdministrationSnapshot {
  return {
    state,
    physicalStorageVersion,
    activeGenerationId: null,
    stagedGenerationId: null,
    generations: [],
    unsettledOperations: [],
    pendingCompletionReceiptCount: 0,
    coreDigest: null,
    activeGenerationIntegrity: null,
    administrationFingerprint: null,
    coreRawObserved: null,
  };
}

// Resultado da tentativa de compensar (`* → reverted`) um receipt cuja
// revalidação foi recusada. `finalStatus` distingue três coisas diferentes: o
// status realmente lido, `missing` (o registro não existe mais) e `unknown` (a
// própria releitura falhou — e aí `readCause` carrega o porquê).
type CompensationResult =
  | { status: 'reverted'; receipt: StorageOperationReceipt }
  | {
      status: 'failed';
      cause: unknown;
      finalStatus: StorageOperationFinalReceiptStatus;
      readCause: unknown;
    };

// Uma passada completa do protocolo de leitura estável.
type StableRead<T> =
  | { status: 'stable'; raw: string; snapshot: StorageAdministrationSnapshotRead; value: T }
  | { status: 'core-changed'; detail: string }
  | { status: 'snapshot-unstable'; detail: string };

class StorageAdminRuntimeImpl implements StorageAdminRuntime {
  private readonly key: string;
  private readonly storage: StorageLike;
  private readonly adapter: AdministrableWorkoutHistoryStorageAdapter;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly subtleCrypto: SubtleCrypto | null | undefined;

  constructor(options: StorageAdminRuntimeOptions) {
    this.key = options.key;
    this.storage = options.storage;
    this.adapter = options.adapter;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? defaultOperationId;
    this.subtleCrypto = options.subtleCrypto === undefined
      ? globalThis.crypto?.subtle
      : options.subtleCrypto;
  }

  async inspectStorageAdministration(): Promise<StorageAdministrationSnapshot> {
    // Uma segunda tentativa é aceita quando a primeira pegou o armazenamento em
    // movimento. Instabilidade persistente continua fail-closed: nunca vira
    // `ready`, nunca escolhe uma das leituras.
    const MAX_ATTEMPTS = 2;
    let lastUnstable: StorageAdministrationSnapshot | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const result = await this.inspectOnce();
      if (result.retryable && attempt < MAX_ATTEMPTS) {
        lastUnstable = result.snapshot;
        continue;
      }
      return result.snapshot;
    }
    // Inalcançável na prática; mantido para que o tipo nunca dependa de sorte.
    return lastUnstable ?? emptySnapshot(
      conflictedState('administration-snapshot-unstable', 'O diagnóstico não estabilizou.', []),
      HYBRID_STORAGE_VERSION,
    );
  }

  private async inspectOnce(): Promise<{ snapshot: StorageAdministrationSnapshot; retryable: boolean }> {
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.key);
    } catch (error) {
      return {
        retryable: false,
        snapshot: emptySnapshot(unavailableState('storage-blocked', describeError(error), error), null),
      };
    }

    const envelope = this.classifyEnvelope(raw);
    if (envelope.status !== 'v2') {
      return {
        retryable: false,
        snapshot: emptySnapshot(
          unavailableState(envelope.reason, envelope.detail),
          envelope.physicalStorageVersion,
        ),
      };
    }

    const physicalStorageVersion = HYBRID_STORAGE_VERSION;

    const available = await this.adapterAvailable();
    if (!available) {
      return {
        retryable: false,
        snapshot: emptySnapshot(
          unavailableState('indexeddb-unavailable', 'O adapter IndexedDB reportou indisponibilidade.'),
          physicalStorageVersion,
        ),
      };
    }
    try {
      await this.adapter.open();
    } catch (error) {
      return {
        retryable: false,
        snapshot: emptySnapshot(
          unavailableState('indexeddb-unavailable', describeError(error)),
          physicalStorageVersion,
        ),
      };
    }

    let stable: StableRead<HistoryGenerationVerification | null>;
    try {
      // A verificação integral da geração ativa roda DENTRO da janela, entre os
      // dois snapshots: uma mutação durante a verificação muda o fingerprint e
      // impede `ready` em vez de aprovar um conteúdo que já não existe mais.
      stable = await this.readStableAdministration(
        (snapshotA) => this.verifyActiveGeneration(snapshotA),
      );
    } catch (error) {
      return {
        retryable: false,
        snapshot: emptySnapshot(this.classifyReadFailure(error), physicalStorageVersion),
      };
    }

    if (stable.status === 'core-changed') {
      return {
        retryable: true,
        snapshot: emptySnapshot(
          conflictedState('core-changed-during-inspection', stable.detail, []),
          physicalStorageVersion,
        ),
      };
    }
    if (stable.status === 'snapshot-unstable') {
      return {
        retryable: true,
        snapshot: emptySnapshot(
          conflictedState('administration-snapshot-unstable', stable.detail, []),
          physicalStorageVersion,
        ),
      };
    }

    return {
      retryable: false,
      snapshot: await this.buildStableSnapshot(stable.raw, stable.snapshot, stable.value),
    };
  }

  private classifyEnvelope(raw: string | null):
    | { status: 'v2' }
    | {
        status: 'other';
        reason: StorageAdministrationUnavailableReason;
        detail: string;
        physicalStorageVersion: number | null;
      } {
    if (raw === null) {
      return {
        status: 'other',
        reason: 'not-hybrid',
        detail: 'Não existe core físico gravado nesta chave.',
        physicalStorageVersion: null,
      };
    }
    const parsed = parsePhysicalEnvelope(raw);
    if (parsed.status === 'v1') {
      return {
        status: 'other',
        reason: 'not-hybrid',
        detail: 'O core físico ainda é o envelope legado v1.',
        physicalStorageVersion: MONOLITHIC_STORAGE_VERSION,
      };
    }
    if (parsed.status === 'unsupported-version') {
      return {
        status: 'other',
        reason: 'physical-version-mismatch',
        detail: `A versão física ${String(parsed.version)} não é suportada.`,
        physicalStorageVersion: typeof parsed.version === 'number' ? parsed.version : null,
      };
    }
    if (parsed.status === 'corrupt') {
      return {
        status: 'other',
        reason: 'core-invalid',
        detail: parsed.error,
        physicalStorageVersion: parsed.physicalVersion,
      };
    }
    return { status: 'v2' };
  }

  // Protocolo de estabilidade: core → snapshot A → (trabalho) → core → snapshot
  // B → core. Só um estado observado igual nas duas pontas autoriza qualquer
  // conclusão. Nada aqui escreve.
  private async readStableAdministration<T>(
    between: (snapshotA: StorageAdministrationSnapshotRead) => Promise<T>,
  ): Promise<StableRead<T>> {
    const coreRawBefore = this.readCoreRaw();
    const snapshotA = await this.adapter.readStorageAdministrationSnapshot();
    const value = await between(snapshotA);
    const coreRawMiddle = this.readCoreRaw();
    const snapshotB = await this.adapter.readStorageAdministrationSnapshot();
    const coreRawAfter = this.readCoreRaw();

    if (coreRawBefore !== coreRawMiddle || coreRawMiddle !== coreRawAfter) {
      return {
        status: 'core-changed',
        detail: 'O core físico v2 mudou durante o diagnóstico administrativo.',
      };
    }
    if (coreRawBefore === null) {
      return {
        status: 'core-changed',
        detail: 'O core físico v2 desapareceu durante o diagnóstico administrativo.',
      };
    }
    if (snapshotA.fingerprint !== snapshotB.fingerprint) {
      return {
        status: 'snapshot-unstable',
        detail: 'O estado administrativo mudou entre as duas leituras atômicas do diagnóstico.',
      };
    }
    return { status: 'stable', raw: coreRawBefore, snapshot: snapshotA, value };
  }

  // Verificação criptográfica integral a partir do snapshot atômico já lido:
  // contagem, ordem física, digests por registro e orderedDigest do manifest.
  // Reutiliza `verifyHistoryGeneration` — não existe segunda implementação.
  private async verifyActiveGeneration(
    snapshot: StorageAdministrationSnapshotRead,
  ): Promise<HistoryGenerationVerification | null> {
    const generationId = snapshot.activeGenerationId;
    if (!generationId) return null;
    const records = snapshot.activeGenerationRecords;
    return verifyHistoryGeneration(
      generationId,
      {
        present: snapshot.activeGenerationPresent,
        manifest: snapshot.activeGenerationManifest,
        sessions: records.map((record) => record.session),
        recordDigests: records.map((record) => record.digest),
      },
      this.subtleCrypto,
    );
  }

  // Leitura do core sempre pelo mesmo caminho: um `localStorage` que passa a
  // recusar acesso no meio do diagnóstico vira `storage-blocked`, e não um
  // genérico "IndexedDB indisponível".
  private readCoreRaw(): string | null {
    try {
      return this.storage.getItem(this.key);
    } catch (error) {
      throw new StorageAdministrationUnavailableError(
        'storage-blocked',
        describeError(error),
        { cause: error },
      );
    }
  }

  private classifyReadFailure(error: unknown): StorageAdministrationState {
    if (error instanceof StorageAdministrationUnavailableError) {
      return unavailableState(error.reason, error.message, error.cause ?? error);
    }
    if (error instanceof StorageOperationReceiptIntegrityError) {
      return conflictedState('malformed-operation-receipt', describeError(error), [], error);
    }
    if (error instanceof CompletionReceiptIntegrityError) {
      return conflictedState('malformed-completion-receipt', describeError(error), [], error);
    }
    if (error instanceof HistoryMetadataIntegrityError || error instanceof HistoryManifestIntegrityError) {
      return conflictedState('metadata-malformed', describeError(error), [], error);
    }
    return unavailableState('indexeddb-unavailable', describeError(error), error);
  }

  private async buildStableSnapshot(
    raw: string,
    read: StorageAdministrationSnapshotRead,
    integrity: HistoryGenerationVerification | null,
  ): Promise<StorageAdministrationSnapshot> {
    let coreDigest: string | null = null;
    try {
      coreDigest = await sha256Checksum(raw, this.subtleCrypto ?? undefined);
    } catch {
      coreDigest = null;
    }

    const activeGenerationId = read.activeGenerationId;
    const stagedGenerationId = read.migrationGenerationId;
    const unsettledOperations = read.unsettledOperations;
    const pendingCompletionReceipts = read.pendingCompletionReceipts;
    const base = {
      physicalStorageVersion: HYBRID_STORAGE_VERSION,
      activeGenerationId,
      stagedGenerationId,
      generations: read.generations,
      unsettledOperations,
      pendingCompletionReceiptCount: pendingCompletionReceipts.length,
      coreDigest,
      activeGenerationIntegrity: integrity,
      administrationFingerprint: read.fingerprint,
      coreRawObserved: raw,
    };

    if (unsettledOperations.length > 1) {
      return {
        ...base,
        state: conflictedState(
          'multiple-unsettled-operations',
          `Existem ${unsettledOperations.length} operações administrativas não terminais.`,
          unsettledOperations,
        ),
      };
    }

    const operation = unsettledOperations[0] ?? null;
    const hasCompletionPending = pendingCompletionReceipts.length > 0;

    if (operation && hasCompletionPending) {
      return {
        ...base,
        state: conflictedState(
          'completion-pending-with-operation',
          'Existe uma conclusão de treino pendente junto de uma operação administrativa em aberto.',
          unsettledOperations,
        ),
      };
    }

    if (!activeGenerationId) {
      return {
        ...base,
        state: unavailableState('core-invalid', 'Não existe geração ativa de histórico.'),
      };
    }

    // Integridade REAL, recalculada agora. A flag persistida do manifest segue
    // visível em `generations[].verified`, mas não decide nada.
    if (!integrity || integrity.status !== 'verified') {
      const reason = integrity && integrity.status === 'invalid' ? integrity.reason : 'generation-absent';
      const message = integrity && integrity.status === 'invalid' ? integrity.message : '';
      return {
        ...base,
        state: conflictedState(
          'active-generation-corrupt',
          `A geração ativa ${activeGenerationId} não passou na verificação integral (${reason}). ${message}`.trim(),
          unsettledOperations,
        ),
      };
    }

    if (stagedGenerationId) {
      const explainedByOperation = operation?.stagedGenerationId === stagedGenerationId;
      if (!explainedByOperation) {
        return {
          ...base,
          state: conflictedState(
            'staging-without-receipt',
            `A geração ${stagedGenerationId} está preparada sem uma operação administrativa que a explique.`,
            unsettledOperations,
          ),
        };
      }
    }

    if (hasCompletionPending) {
      return {
        ...base,
        state: conflictedState(
          'completion-pending',
          'Existe uma conclusão de treino pendente de recuperação.',
          [],
        ),
      };
    }

    if (operation) {
      const compatibility = evaluateStorageOperationCompatibility({
        receipt: operation,
        coreRaw: raw,
        metadata: { activeGeneration: activeGenerationId, migrationGeneration: stagedGenerationId },
        generations: read.generations,
      });
      if (compatibility.status !== 'compatible') {
        return {
          ...base,
          state: conflictedState(
            'operation-incompatible',
            `A operação ${operation.operationId} não é coerente com o estado físico`
            + ` (${compatibility.reason}): ${compatibility.message}`,
            unsettledOperations,
          ),
        };
      }
      return { ...base, state: { status: 'interrupted', operation } };
    }

    return { ...base, state: { status: 'ready' } };
  }

  async readVerifiedAdministrationGeneration(generationId: string): Promise<VerifiedHistoryGeneration> {
    if (!generationId) {
      throw new StorageAdministrationInputError(
        'generationId',
        'A leitura administrativa exige um generationId.',
      );
    }
    const snapshot = await this.inspectStorageAdministration();
    if (snapshot.state.status === 'unavailable') {
      throw new StorageAdministrationUnavailableError(
        snapshot.state.reason,
        snapshot.state.detail,
        { cause: snapshot.state.cause },
      );
    }
    if (
      snapshot.state.status === 'conflicted'
      && CONFLICTS_BLOCKING_VERIFIED_READ.includes(snapshot.state.reason)
    ) {
      throw new StorageAdministrationConflictError(
        snapshot.state.reason,
        snapshot.state.detail,
        { cause: snapshot.state.cause },
      );
    }
    // Sempre a verificação integral do adapter: nunca devolve `[]` por ausência
    // e nunca repara.
    const verified = await this.adapter.readVerifiedHistoryGeneration(generationId);
    return {
      generationId: verified.generationId,
      sessions: [...verified.sessions],
      manifest: { ...verified.manifest },
    };
  }

  async beginStorageOperation(input: BeginStorageOperationInput): Promise<StorageOperationReceipt> {
    const rawInput = input as unknown as Record<string, unknown>;
    // Entrada validada antes de qualquer leitura ou escrita.
    if (input.stagedGenerationId !== null && input.stagedGenerationId !== undefined) {
      throw new StorageAdministrationInputError(
        'stagedGenerationId',
        'O 002D-A2 não cria staging físico: stagedGenerationId precisa ser null até o 002D-C/D.',
      );
    }
    if (input.kind === 'restore') {
      if (
        typeof input.expectedPreviousCoreRaw !== 'string'
        || input.expectedPreviousCoreRaw.length === 0
      ) {
        throw new StorageAdministrationInputError(
          'expectedPreviousCoreRaw',
          'O restore exige o core anterior exato que participou da prova.',
        );
      }
      if (
        typeof input.expectedPreviousGenerationId !== 'string'
        || input.expectedPreviousGenerationId.length === 0
      ) {
        throw new StorageAdministrationInputError(
          'expectedPreviousGenerationId',
          'O restore exige a geracao anterior exata que participou da prova.',
        );
      }
      if (typeof input.targetGenerationId !== 'string' || input.targetGenerationId.length === 0) {
        throw new StorageAdministrationInputError(
          'targetGenerationId',
          'O restore exige targetGenerationId explicito antes do primeiro efeito.',
        );
      }
      if (typeof input.targetCoreRaw !== 'string' || input.targetCoreRaw.length === 0) {
        throw new StorageAdministrationInputError(
          'targetCoreRaw',
          'O restore exige targetCoreRaw explicito antes do primeiro efeito.',
        );
      }
    } else if (rawInput.targetCoreRaw !== null && rawInput.targetCoreRaw !== undefined) {
      throw new StorageAdministrationInputError(
        'targetCoreRaw',
        'O 002D-A2 não materializa core alvo: targetCoreRaw precisa ser null até o 002D-C/D.',
      );
    }
    const createdAt = this.requireTimestamp();
    const operationId = input.reservedOperationId === undefined
      ? this.requireOperationId()
      : this.requireProvidedOperationId(input.reservedOperationId);

    const snapshot = await this.inspectStorageAdministration();
    this.requireReadyForMutation(snapshot);

    let raw: string | null;
    try {
      raw = this.storage.getItem(this.key);
    } catch (error) {
      throw new StorageAdministrationUnavailableError(
        'storage-blocked',
        'Falha ao ler o core físico ao iniciar a operação.',
        { cause: error },
      );
    }
    if (raw === null) {
      throw new StorageAdministrationUnavailableError(
        'core-invalid',
        'Não existe core físico v2 para iniciar a operação.',
      );
    }
    const parsed = parsePhysicalEnvelope(raw);
    if (parsed.status !== 'v2') {
      throw new StorageAdministrationUnavailableError(
        'core-invalid',
        'O core físico não é um envelope v2 válido no início da operação.',
      );
    }
    if (input.kind === 'restore' && raw !== input.expectedPreviousCoreRaw) {
      throw new StorageAdministrationConflictError(
        'core-changed-during-inspection',
        'O core atual divergiu do mundo que comprovou o alvo do restore.',
      );
    }

    const metadata = await this.adapter.readMetadata();
    const activeGenerationId = metadata.activeGeneration;
    if (!activeGenerationId) {
      throw new StorageAdministrationUnavailableError(
        'core-invalid',
        'Não existe geração ativa de histórico ao iniciar a operação.',
      );
    }
    if (
      input.kind === 'restore'
      && activeGenerationId !== input.expectedPreviousGenerationId
    ) {
      throw new StorageAdministrationConflictError(
        'operation-incompatible',
        'A geracao ativa divergiu do mundo que comprovou o alvo do restore.',
      );
    }
    // Verificação integral independente do snapshot, imediatamente antes da
    // escrita. O erro de integridade é encapsulado num erro de domínio, mas a
    // causa original continua acessível em `cause`.
    try {
      await this.adapter.readVerifiedHistoryGeneration(activeGenerationId);
    } catch (error) {
      throw new StorageAdministrationConflictError(
        'active-generation-corrupt',
        `A geração ativa ${activeGenerationId} não passou na verificação integral ao iniciar a operação.`,
        { cause: error },
      );
    }

    if (input.kind === 'restore') {
      const parsedTarget = parsePhysicalEnvelope(input.targetCoreRaw);
      if (
        parsedTarget.status !== 'v2'
        || parsedTarget.envelope.data.historyStorage.generationId !== input.targetGenerationId
      ) {
        throw new StorageAdministrationConflictError(
          'operation-incompatible',
          'O targetCoreRaw do restore nao nomeia o targetGenerationId declarado.',
        );
      }
      if (input.targetGenerationId === activeGenerationId) {
        throw new StorageAdministrationConflictError(
          'operation-incompatible',
          'O restore recusa reativar a geracao ja ativa.',
        );
      }
      try {
        const verifiedTarget = await this.adapter.readVerifiedHistoryGeneration(
          input.targetGenerationId,
        );
        if (
          verifiedTarget.generationId !== input.targetGenerationId
          || verifiedTarget.manifest.generationId !== input.targetGenerationId
          || !verifiedTarget.manifest.verified
        ) {
          throw new StorageAdministrationConflictError(
            'operation-incompatible',
            `A geracao alvo ${input.targetGenerationId} nao passou na verificacao integral.`,
          );
        }
      } catch (error) {
        if (error instanceof StorageAdministrationConflictError) throw error;
        throw new StorageAdministrationConflictError(
          'operation-incompatible',
          `A geracao alvo ${input.targetGenerationId} nao passou na verificacao integral ao iniciar o restore.`,
          { cause: error },
        );
      }
    }

    let supersedesOperationIds: readonly string[] | undefined;
    if (input.kind === 'restore') {
      let physical;
      try {
        physical = await this.adapter.readStorageAdministrationSnapshot();
      } catch (error) {
        throw new StorageAdministrationConflictError(
          'administration-snapshot-unstable',
          'Nao foi possivel ler os receipts settled para declarar a supersessao do restore.',
          { cause: error },
        );
      }
      if (
        snapshot.administrationFingerprint === null
        || physical.fingerprint !== snapshot.administrationFingerprint
      ) {
        throw new StorageAdministrationConflictError(
          'administration-snapshot-unstable',
          'O snapshot administrativo mudou antes de gravar a supersessao do restore.',
        );
      }
      if (detectStorageOperationSupersessionCycle(physical.operationReceipts)) {
        throw new StorageAdministrationConflictError(
          'operation-incompatible',
          'A supersessao settled forma um ciclo e o begin recusa persistir.',
        );
      }
      const activeRelations = listActivePredecessorSourceOperationIds(
        physical.operationReceipts,
        input.targetGenerationId,
      );
      if (activeRelations.length > 0) {
        const validated = validateStorageOperationSupersession({
          operationId,
          supersedesOperationIds: activeRelations,
          finalGenerationId: input.targetGenerationId,
          receipts: physical.operationReceipts,
        });
        if (!validated.ok) {
          throw new StorageAdministrationConflictError(
            'operation-incompatible',
            `A supersessao do restore falhou fechada (${validated.reason}).`,
          );
        }
        supersedesOperationIds = validated.ids;
      }

      // Revalidacao imediata antes da persistencia: o owner-token nao prova o
      // snapshot. Um begin cru nao pode gravar a janela stale.
      let persistSnapshot;
      try {
        persistSnapshot = await this.adapter.readStorageAdministrationSnapshot();
      } catch (error) {
        throw new StorageAdministrationConflictError(
          'administration-snapshot-unstable',
          'Nao foi possivel revalidar o snapshot imediatamente antes de persistir o receipt.',
          { cause: error },
        );
      }
      if (persistSnapshot.fingerprint !== physical.fingerprint) {
        throw new StorageAdministrationConflictError(
          'administration-snapshot-unstable',
          'O snapshot administrativo mudou entre a prova da supersessao e a persistencia.',
        );
      }
      const liveRelations = listActivePredecessorSourceOperationIds(
        persistSnapshot.operationReceipts,
        input.targetGenerationId,
      );
      if (!declaredSupersedesMatchLiveRelations(supersedesOperationIds, liveRelations)) {
        throw new StorageAdministrationConflictError(
          'administration-snapshot-unstable',
          'As relacoes ativas mudaram imediatamente antes de persistir o receipt.',
        );
      }
    }

    const receipt = input.kind === 'restore'
      ? createStorageOperationReceipt({
          operationId,
          kind: input.kind,
          previousCoreRaw: raw,
          previousGenerationId: activeGenerationId,
          createdAt,
          sourceDigest: input.sourceDigest ?? null,
          stagedGenerationId: null,
          targetGenerationId: input.targetGenerationId,
          targetCoreRaw: input.targetCoreRaw,
          ...(supersedesOperationIds === undefined
            ? {}
            : { supersedesOperationIds }),
        })
      : createStorageOperationReceipt({
          operationId,
          kind: input.kind,
          previousCoreRaw: raw,
          previousGenerationId: activeGenerationId,
          createdAt,
          sourceDigest: input.sourceDigest ?? null,
          stagedGenerationId: null,
          targetCoreRaw: null,
        });

    const created = await this.adapter.createStorageOperationReceiptIfIdle({
      receipt,
      expectedActiveGenerationId: activeGenerationId,
    });

    // Revalidação pós-criação. O core v2 vive no localStorage, fora da transação
    // IndexedDB que acabou de criar o receipt: só uma releitura estável fecha a
    // janela que o CAS por si só não cobre.
    await this.confirmBegunOperation(created, raw, activeGenerationId);
    return created;
  }

  private async confirmBegunOperation(
    created: StorageOperationReceipt,
    expectedRaw: string,
    expectedActiveGenerationId: string,
  ): Promise<void> {
    let stable: StableRead<null>;
    try {
      stable = await this.readStableAdministration(async () => null);
    } catch (error) {
      await this.failBegin(created.operationId, describeError(error), error);
      return;
    }
    if (stable.status !== 'stable') {
      await this.failBegin(created.operationId, stable.detail, null);
      return;
    }

    const { raw, snapshot } = stable;
    const unsettled = snapshot.unsettledOperations;
    const mine = unsettled[0];
    const problem = raw !== expectedRaw
      ? 'o core físico mudou durante o início da operação'
      : snapshot.activeGenerationId !== expectedActiveGenerationId
        ? 'a geração ativa mudou durante o início da operação'
        : snapshot.pendingCompletionReceipts.length > 0
          ? 'uma conclusão de treino ficou pendente durante o início da operação'
          : unsettled.length !== 1
            ? `existem ${unsettled.length} operações administrativas em aberto`
            : mine.operationId !== created.operationId
              ? `a operação em aberto é ${mine.operationId}`
              : mine.status !== 'staged'
                ? `a operação já está em ${mine.status}`
                : null;

    if (problem !== null) await this.failBegin(created.operationId, problem, null);
  }

  // Nunca retorna: sempre lança. Compensa e relata honestamente o que aconteceu
  // com o receipt — inclusive quando a compensação em si falhou.
  private async failBegin(operationId: string, problem: string, cause: unknown): Promise<never> {
    const compensation = await this.revertBegunOperation(operationId);
    if (compensation.status === 'reverted') {
      throw new StorageOperationBeginConflictError(
        `A operação ${operationId} foi recusada (${problem}) e o receipt foi revertido.`,
        {
          cause,
          operationId,
          compensation: 'reverted',
          finalReceiptStatus: compensation.receipt.status,
        },
      );
    }
    const remaining = describeFinalStatus(compensation.finalStatus);
    const readDetail = compensation.readCause === null || compensation.readCause === undefined
      ? ''
      : ` A releitura do status final também falhou (${describeError(compensation.readCause)}).`;
    throw new StorageOperationBeginConflictError(
      `A operação ${operationId} foi recusada (${problem}) e a compensação staged → reverted FALHOU`
      + ` (${describeError(compensation.cause)}); o receipt permanece em ${remaining}.${readDetail}`,
      {
        cause,
        operationId,
        compensation: 'failed',
        compensationCause: compensation.cause,
        finalStatusReadCause: compensation.readCause,
        finalReceiptStatus: compensation.finalStatus,
      },
    );
  }

  // Compensação best-effort, porém nunca silenciosa: o resultado é estruturado e
  // sempre chega ao chamador. O receipt jamais é apagado nem sobrescrito à
  // força — se a transição falhar, ele continua no armazenamento e reaparece no
  // próximo diagnóstico como `interrupted` ou `conflicted`.
  private async revertBegunOperation(operationId: string): Promise<CompensationResult> {
    try {
      const receipt = await this.adapter.transitionStorageOperationReceipt(operationId, 'staged', 'reverted');
      return { status: 'reverted', receipt };
    } catch (cause) {
      const readback = await this.readFinalStatus(operationId);
      return { status: 'failed', cause, finalStatus: readback.status, readCause: readback.cause };
    }
  }

  // Releitura honesta do status remanescente. `missing` e `unknown` são estados
  // distintos: o primeiro é um fato lido, o segundo é a admissão de que nem ler
  // foi possível — e nesse caso a causa acompanha, nunca é descartada.
  private async readFinalStatus(
    operationId: string,
  ): Promise<{ status: StorageOperationFinalReceiptStatus; cause: unknown }> {
    try {
      const current = await this.adapter.readStorageOperationReceipt(operationId);
      return { status: current === null ? 'missing' : current.status, cause: null };
    } catch (error) {
      return { status: 'unknown', cause: error };
    }
  }

  // Compensação da TRANSIÇÃO. Usa a primitiva dedicada do adapter, que só sabe
  // levar para `reverted` e não é bloqueada por CompletionReceipt pendente —
  // reverter apenas reduz o conflito. Nunca apaga o receipt, nunca faz `put`
  // sem conferência, nunca mexe em core, histórico, manifests, metadata ou
  // conclusões de treino.
  private async compensateTransition(
    operationId: string,
    expectedStatus: StorageOperationStatus,
    expectedActiveGenerationId: string | null | undefined,
    reason: StorageOperationTransitionConflictReason,
  ): Promise<CompensationResult> {
    try {
      const receipt = await this.adapter.revertStorageOperationAfterTransitionConflict({
        operationId,
        expectedStatus,
        expectedActiveGenerationId,
        reason,
      });
      return { status: 'reverted', receipt };
    } catch (cause) {
      const readback = await this.readFinalStatus(operationId);
      return { status: 'failed', cause, finalStatus: readback.status, readCause: readback.cause };
    }
  }

  // Compensa e lança. `statusToRevert` é o status em que o receipt está AGORA:
  // `expectedStatus` quando o conflito apareceu antes da transação,
  // `nextStatus` quando apareceu depois do commit.
  private async failTransition(options: {
    operationId: string;
    expectedStatus: StorageOperationStatus;
    attemptedStatus: StorageOperationStatus;
    statusToRevert: StorageOperationStatus;
    phase: StorageOperationTransitionPhase;
    reason: StorageOperationTransitionConflictReason;
    problem: string;
    expectedActiveGenerationId: string | null | undefined;
    observedCoreDigest: string | null;
    cause?: unknown;
  }): Promise<never> {
    const compensation = await this.compensateTransition(
      options.operationId,
      options.statusToRevert,
      options.expectedActiveGenerationId,
      options.reason,
    );
    const base = {
      operationId: options.operationId,
      expectedStatus: options.expectedStatus,
      attemptedStatus: options.attemptedStatus,
      phase: options.phase,
      reason: options.reason,
      observedCoreDigest: options.observedCoreDigest,
      cause: options.cause,
    };
    if (compensation.status === 'reverted') {
      throw new StorageOperationTransitionConflictError(
        `A transição ${options.expectedStatus} → ${options.attemptedStatus} da operação`
        + ` ${options.operationId} foi recusada (${options.problem}); o receipt foi revertido.`,
        { ...base, compensation: 'reverted', finalReceiptStatus: compensation.receipt.status },
      );
    }
    const readDetail = compensation.readCause === null || compensation.readCause === undefined
      ? ''
      : ` A releitura do status final também falhou (${describeError(compensation.readCause)}).`;
    throw new StorageOperationTransitionConflictError(
      `A transição ${options.expectedStatus} → ${options.attemptedStatus} da operação`
      + ` ${options.operationId} foi recusada (${options.problem}) e a compensação para reverted FALHOU`
      + ` (${describeError(compensation.cause)}); o receipt permanece em`
      + ` ${describeFinalStatus(compensation.finalStatus)}.${readDetail}`,
      {
        ...base,
        compensation: 'failed',
        compensationCause: compensation.cause,
        finalStatusReadCause: compensation.readCause,
        finalReceiptStatus: compensation.finalStatus,
      },
    );
  }

  async transitionStorageOperation(
    input: TransitionStorageOperationInput,
  ): Promise<StorageOperationReceipt> {
    const { operationId, expectedStatus, nextStatus, patch } = input;
    if (!operationId) {
      throw new StorageAdministrationInputError(
        'operationId',
        'A transição administrativa exige um operationId.',
      );
    }

    // A transição só acontece em estado inequívoco. `interrupted` já garante,
    // por construção do diagnóstico: core v2 válido e estável, geração ativa
    // integralmente verificada, exatamente um receipt não terminal, zero
    // conclusão pendente e receipt coerente com core/metadata/gerações.
    const snapshot = await this.inspectStorageAdministration();
    if (snapshot.state.status === 'unavailable') {
      throw new StorageAdministrationUnavailableError(
        snapshot.state.reason,
        snapshot.state.detail,
        { cause: snapshot.state.cause },
      );
    }
    if (snapshot.state.status === 'ready') {
      throw new StorageAdministrationConflictError(
        'no-unsettled-operation',
        'Não existe operação administrativa em aberto para transicionar.',
      );
    }
    if (snapshot.state.status === 'conflicted') {
      throw new StorageAdministrationConflictError(
        snapshot.state.reason,
        snapshot.state.detail,
        { cause: snapshot.state.cause },
      );
    }

    const operation = snapshot.state.operation;
    if (operation.operationId !== operationId) {
      throw new StorageAdministrationConflictError(
        'operation-not-the-unsettled-one',
        `A operação em aberto é ${operation.operationId}, e não ${operationId}.`,
      );
    }

    // `expectedStatus` divergente é erro do chamador, não ambiguidade do estado:
    // conferido antes da projeção para que o erro descreva a causa certa.
    if (operation.status !== expectedStatus) {
      throw new StorageOperationTransitionError(
        `O receipt ${operationId} está em ${operation.status}, e não em ${expectedStatus}.`,
      );
    }

    // PROTOCOLO PRÉ-TRANSAÇÃO (corretivo 038).
    //
    // O core v2 mora no localStorage e NÃO participa da transação IndexedDB —
    // não existe atomicidade única entre os dois. O que existe é um protocolo
    // explícito: relê o core agora, exige igualdade byte a byte com o core que
    // o diagnóstico observou, revalida o envelope e reconfere a compatibilidade
    // do receipt contra esse raw recém-lido. Só então a transação começa.
    //
    // Antes do 038 a transição usava só `snapshot.coreRawObserved` e conseguia
    // avançar `staged → activating` sobre um core já trocado, deixando o receipt
    // preso: o inspect seguinte virava `conflicted` e nem reverter era possível.
    const observed = snapshot.coreRawObserved;
    const failOptions = {
      operationId,
      expectedStatus,
      attemptedStatus: nextStatus,
      expectedActiveGenerationId: snapshot.activeGenerationId,
      observedCoreDigest: snapshot.coreDigest,
    };

    let coreRawBeforeTransition: string | null;
    try {
      coreRawBeforeTransition = this.storage.getItem(this.key);
    } catch (error) {
      return this.failTransition({
        ...failOptions,
        statusToRevert: expectedStatus,
        phase: 'pre-transition',
        reason: 'core-unreadable',
        problem: 'o core físico ficou ilegível antes da transação',
        cause: error,
      });
    }
    if (coreRawBeforeTransition === null) {
      return this.failTransition({
        ...failOptions,
        statusToRevert: expectedStatus,
        phase: 'pre-transition',
        reason: 'core-missing-before-transition',
        problem: 'o core físico desapareceu antes da transação',
      });
    }
    if (coreRawBeforeTransition !== observed) {
      return this.failTransition({
        ...failOptions,
        statusToRevert: expectedStatus,
        phase: 'pre-transition',
        reason: 'core-changed-before-transition',
        problem: 'o core físico mudou entre o diagnóstico e a transação',
      });
    }
    if (parsePhysicalEnvelope(coreRawBeforeTransition).status !== 'v2') {
      return this.failTransition({
        ...failOptions,
        statusToRevert: expectedStatus,
        phase: 'pre-transition',
        reason: 'core-invalid-before-transition',
        problem: 'o core físico deixou de ser um envelope v2 válido antes da transação',
      });
    }

    // Coerência do receipt ATUAL contra o core recém-lido. `interrupted` já
    // garantiu isso contra o core do diagnóstico; aqui a garantia é refeita
    // contra o raw que vai valer para a escrita.
    const current = evaluateStorageOperationCompatibility({
      receipt: operation,
      coreRaw: coreRawBeforeTransition,
      metadata: {
        activeGeneration: snapshot.activeGenerationId,
        migrationGeneration: snapshot.stagedGenerationId,
      },
      generations: snapshot.generations,
    });
    if (current.status !== 'compatible') {
      return this.failTransition({
        ...failOptions,
        statusToRevert: expectedStatus,
        phase: 'pre-transition',
        reason: 'receipt-incompatible-before-transition',
        problem: `o receipt deixou de ser coerente com o core relido (${current.reason})`,
      });
    }

    // Uma transição não pode DEIXAR o receipt incoerente. No A2 isso barra, em
    // particular, `activating → activated`: `activated` afirma efeitos (geração
    // preparada ativa e core alvo gravado) que nenhuma etapa desta fase produz,
    // então avançar até lá criaria um estado impossível de comprovar. Reverter
    // é sempre permitido: status terminal não descreve efeito nenhum.
    //
    // Esta recusa é erro do chamador sobre um estado íntegro, não conflito
    // físico: nada é compensado, o receipt fica exatamente onde estava.
    const projected = this.projectReceipt(operation, nextStatus, patch);
    if (nextStatus !== 'settled' && nextStatus !== 'reverted') {
      const projection = evaluateStorageOperationCompatibility({
        receipt: projected,
        coreRaw: coreRawBeforeTransition,
        metadata: {
          activeGeneration: snapshot.activeGenerationId,
          migrationGeneration: snapshot.stagedGenerationId,
        },
        generations: snapshot.generations,
      });
      if (projection.status !== 'compatible') {
        throw new StorageAdministrationConflictError(
          'operation-incompatible',
          `A transição ${expectedStatus} → ${nextStatus} deixaria a operação ${operationId} incoerente`
          + ` (${projection.reason}): ${projection.message}`,
        );
      }
    }

    // O CAS atômico reconfere todo o lado IndexedDB dentro da própria transação
    // de escrita. Uma falha aqui não avançou nada: o erro sobe cru, sem
    // compensação, porque não há o que compensar.
    const advanced = await this.adapter.transitionStorageOperationIfUnambiguous({
      operationId,
      expectedStatus,
      nextStatus,
      expectedActiveGenerationId: snapshot.activeGenerationId,
      patch,
    });

    await this.confirmTransition({ coreRawBeforeTransition, snapshot, failOptions, nextStatus });
    return advanced;
  }

  private projectReceipt(
    operation: StorageOperationReceipt,
    nextStatus: StorageOperationStatus,
    patch: StorageOperationReceiptPatch | undefined,
  ): StorageOperationReceipt {
    return {
      ...operation,
      sourceDigest: patch?.sourceDigest === undefined ? operation.sourceDigest : patch.sourceDigest,
      stagedGenerationId: patch?.stagedGenerationId === undefined
        ? operation.stagedGenerationId
        : patch.stagedGenerationId,
      targetCoreRaw: patch?.targetCoreRaw === undefined ? operation.targetCoreRaw : patch.targetCoreRaw,
      status: nextStatus,
    } as StorageOperationReceipt;
  }

  // PROTOCOLO PÓS-COMMIT (corretivo 038).
  //
  // A transação já commitou; o receipt já está em `nextStatus`. Esta é a única
  // chance de descobrir que alguém trocou o core do localStorage enquanto a
  // transação IndexedDB estava aberta. Se trocou, a transição não pode ser
  // relatada como sucesso: o receipt é compensado para `reverted` e o erro
  // estruturado explica o que aconteceu.
  //
  // A compensação NÃO tenta desfazer a alteração externa do localStorage — o
  // core alheio fica exatamente como está. Ela só encerra honestamente a
  // operação administrativa.
  //
  // LIMITE HONESTO: uma alteração iniciada depois desta leitura é um novo evento
  // externo. Ela aparece no PRÓXIMO `inspect` como conflito; este método não
  // promete — e não pode prometer — bloquear escritas futuras.
  private async confirmTransition(options: {
    coreRawBeforeTransition: string;
    snapshot: StorageAdministrationSnapshot;
    failOptions: {
      operationId: string;
      expectedStatus: StorageOperationStatus;
      attemptedStatus: StorageOperationStatus;
      expectedActiveGenerationId: string | null;
      observedCoreDigest: string | null;
    };
    nextStatus: StorageOperationStatus;
  }): Promise<void> {
    const { coreRawBeforeTransition, snapshot, failOptions, nextStatus } = options;
    const { operationId } = failOptions;
    // `reverted` é terminal e não afirma efeito nenhum: um core que mude depois
    // dele não invalida coisa alguma, e "compensar" um receipt já revertido só
    // produziria uma falha de CAS inventada.
    const terminal = nextStatus === 'reverted';
    const fail = (
      reason: StorageOperationTransitionConflictReason,
      problem: string,
      cause?: unknown,
    ) => this.failTransition({
      ...failOptions,
      statusToRevert: nextStatus,
      phase: 'post-transition',
      reason,
      problem,
      cause,
    });

    let coreRawAfterTransition: string | null;
    try {
      coreRawAfterTransition = this.storage.getItem(this.key);
    } catch (error) {
      if (terminal) return;
      return fail('core-unreadable', 'o core físico ficou ilegível depois do commit', error);
    }
    if (!terminal && coreRawAfterTransition !== coreRawBeforeTransition) {
      return fail(
        'core-changed-during-transition',
        'o core físico mudou enquanto a transação IndexedDB estava em andamento',
      );
    }

    let persisted: StorageOperationReceipt | null;
    let metadata: { activeGeneration: string | null; migrationGeneration: string | null };
    try {
      persisted = await this.adapter.readStorageOperationReceipt(operationId);
      const read = await this.adapter.readMetadata();
      metadata = {
        activeGeneration: read.activeGeneration,
        migrationGeneration: read.migrationGeneration,
      };
    } catch (error) {
      return fail(
        'administration-unreadable-after-transition',
        'o estado administrativo ficou ilegível logo depois do commit',
        error,
      );
    }

    if (persisted === null) {
      return fail('receipt-missing-after-transition', 'o receipt desapareceu logo depois do commit');
    }
    if (persisted.status !== nextStatus) {
      return fail(
        'receipt-status-unexpected-after-transition',
        `o receipt persistido está em ${persisted.status}, e não em ${nextStatus}`,
      );
    }
    if (terminal) return;

    if (metadata.activeGeneration !== snapshot.activeGenerationId) {
      return fail(
        'active-generation-changed-after-transition',
        'a geração ativa mudou durante a transação',
      );
    }
    // `settled` é terminal e afirma efeitos que já foram comprovados em
    // `activated`; a avaliação de compatibilidade recusa qualquer status
    // terminal por definição, então não se aplica a ele.
    if (nextStatus !== 'settled' && coreRawAfterTransition !== null) {
      const confirmation = evaluateStorageOperationCompatibility({
        receipt: persisted,
        coreRaw: coreRawAfterTransition,
        metadata,
        generations: snapshot.generations,
      });
      if (confirmation.status !== 'compatible') {
        return fail(
          'receipt-incompatible-after-transition',
          `o receipt persistido não é coerente com o estado físico (${confirmation.reason})`,
        );
      }
    }
  }

  // Reversão de emergência. Existe porque a auditoria provou uma armadilha: um
  // receipt em `activating` sobre um core divergente nunca mais volta a ser
  // `interrupted`, e `transitionStorageOperation` — que exige `interrupted` —
  // recusava até a reversão. O receipt ficava preso, bloqueando todo begin
  // futuro.
  //
  // Este caminho não avança nada: o único destino é `reverted`. Ele aceita um
  // diagnóstico `conflicted` por incoerência (core incompatível, estado de
  // ativação não reconhecido, operação incompatível com a metadata, compensação
  // anterior que falhou), mas continua recusando ambiguidade ESTRUTURAL —
  // múltiplos receipts não terminais, receipt malformado, operationId ou status
  // divergentes, metadata malformada e adapter indisponível — porque nesses
  // casos escolher qual operação encerrar seria um chute. Todas essas recusas
  // são feitas dentro da própria transação da primitiva.
  async revertStorageOperationSafely(
    input: RevertStorageOperationSafelyInput,
  ): Promise<StorageOperationReceipt> {
    const { operationId, expectedStatus } = input;
    if (!operationId) {
      throw new StorageAdministrationInputError(
        'operationId',
        'A reversão administrativa exige um operationId.',
      );
    }
    if (!(await this.adapterAvailable())) {
      throw new StorageAdministrationUnavailableError(
        'indexeddb-unavailable',
        'O adapter IndexedDB reportou indisponibilidade.',
      );
    }
    try {
      await this.adapter.open();
    } catch (error) {
      throw new StorageAdministrationUnavailableError(
        'indexeddb-unavailable',
        describeError(error),
        { cause: error },
      );
    }
    // Sem CAS de geração ativa: o propósito é encerrar uma operação num mundo
    // que já divergiu. A metadata continua sendo lida e validada dentro da
    // transação — malformada, ela bloqueia.
    return this.adapter.revertStorageOperationAfterTransitionConflict({
      operationId,
      expectedStatus,
      reason: 'revert-storage-operation-safely',
    });
  }

  private requireReadyForMutation(snapshot: StorageAdministrationSnapshot): void {
    if (snapshot.state.status === 'ready') return;
    if (snapshot.state.status === 'unavailable') {
      throw new StorageAdministrationUnavailableError(
        snapshot.state.reason,
        snapshot.state.detail,
        { cause: snapshot.state.cause },
      );
    }
    if (snapshot.state.status === 'interrupted') {
      throw new StorageOperationAlreadyInProgressError(snapshot.state.operation);
    }
    throw new StorageAdministrationConflictError(
      snapshot.state.reason,
      snapshot.state.detail,
      { cause: snapshot.state.cause },
    );
  }

  private requireTimestamp(): string {
    const value = this.now();
    try {
      return value.toISOString();
    } catch (error) {
      throw new StorageAdministrationInputError(
        'now',
        'O relógio injetado devolveu um instante inválido; nenhum receipt foi criado.',
        { cause: error },
      );
    }
  }

  private requireOperationId(): string {
    const operationId = this.idFactory();
    if (typeof operationId !== 'string' || operationId.length === 0) {
      throw new StorageAdministrationInputError(
        'operationId',
        'A fábrica de operationId devolveu um identificador vazio; nenhum receipt foi criado.',
      );
    }
    return operationId;
  }

  private requireProvidedOperationId(operationId: string): string {
    if (typeof operationId !== 'string' || operationId.length === 0) {
      throw new StorageAdministrationInputError(
        'operationId',
        'O operationId reservado pelo owner-token é inválido; nenhum receipt foi criado.',
      );
    }
    return operationId;
  }

  private async adapterAvailable(): Promise<boolean> {
    try {
      return await this.adapter.isAvailable();
    } catch {
      return false;
    }
  }
}

export function createStorageAdminRuntime(options: StorageAdminRuntimeOptions): StorageAdminRuntime {
  return new StorageAdminRuntimeImpl(options);
}

export type { StorageOperationCompatibility };
