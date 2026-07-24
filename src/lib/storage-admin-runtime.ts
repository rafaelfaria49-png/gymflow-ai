import type {
  AdministrableWorkoutHistoryStorageAdapter,
  HistoryGenerationSummary,
  HistoryStorageMetadata,
  VerifiedHistoryGeneration,
} from './storage-adapter';
import type { WorkoutCompletionReceipt } from './storage-completion-receipt';
import { sha256Checksum } from './storage-history-integrity';
import {
  HistoryManifestIntegrityError,
  HistoryMetadataIntegrityError,
  StorageOperationAlreadyInProgressError,
  StorageOperationBeginConflictError,
  StorageOperationReceiptIntegrityError,
} from './storage-indexeddb';
import { parsePhysicalEnvelope } from './storage-hybrid';
import {
  createStorageOperationReceipt,
  type StorageOperationKind,
  type StorageOperationReceipt,
  type StorageOperationReceiptPatch,
  type StorageOperationStatus,
} from './storage-operation-receipt';
import {
  HYBRID_STORAGE_VERSION,
  MONOLITHIC_STORAGE_VERSION,
  type StorageLike,
} from './storage-types';

// Fachada administrativa interna do runtime híbrido (002D-A2).
//
// Ela fica entre as primitivas físicas do IndexedDB (002D-A1: receipts,
// enumeração de gerações, leitura verificada, rollback físico, CAS) e os
// futuros fluxos reais de importação/restauração/reset/rollback completo
// (002D-C/D). Nada aqui executa uma dessas operações: `beginStorageOperation`
// só cria um receipt `staged`. Nada aqui é chamado pelo Provider, por um
// componente ou pelo boot — não há call site real nesta etapa.

export { StorageOperationAlreadyInProgressError, StorageOperationBeginConflictError };

export type StorageAdministrationUnavailableReason =
  | 'storage-blocked'
  | 'not-hybrid'
  | 'indexeddb-unavailable'
  | 'physical-version-mismatch'
  | 'core-invalid';

export type StorageAdministrationConflictReason =
  | 'multiple-unsettled-operations'
  | 'malformed-operation-receipt'
  | 'metadata-malformed'
  | 'completion-pending'
  | 'completion-pending-with-operation'
  | 'staging-without-receipt'
  | 'active-generation-corrupt';

export type StorageAdministrationState =
  | { status: 'unavailable'; reason: StorageAdministrationUnavailableReason; detail: string }
  | { status: 'ready' }
  | { status: 'interrupted'; operation: StorageOperationReceipt }
  | {
      status: 'conflicted';
      reason: StorageAdministrationConflictReason;
      detail: string;
      operations: readonly StorageOperationReceipt[];
    };

// Snapshot diagnóstico. Sempre a partir de dados reais: nunca repara, nunca
// apaga, nunca ativa geração, nunca liquida ou cria receipt, nunca escreve em
// localStorage ou IndexedDB. Campos que dependem de uma leitura que falhou
// ficam em seu valor neutro (`null`/`[]`/`0`) — o motivo da falha vive em
// `state`.
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
}

export interface BeginStorageOperationInput {
  kind: StorageOperationKind;
  sourceDigest: string | null;
  stagedGenerationId: string | null;
  targetCoreRaw: string | null;
}

export interface TransitionStorageOperationInput {
  operationId: string;
  expectedStatus: StorageOperationStatus;
  nextStatus: StorageOperationStatus;
  patch?: StorageOperationReceiptPatch;
}

export interface StorageAdminRuntimeOptions {
  key: string;
  storage: StorageLike;
  adapter: AdministrableWorkoutHistoryStorageAdapter;
  now?: () => Date;
  idFactory?: () => string;
}

export interface StorageAdminRuntime {
  inspectStorageAdministration(): Promise<StorageAdministrationSnapshot>;
  readVerifiedAdministrationGeneration(generationId: string): Promise<VerifiedHistoryGeneration>;
  beginStorageOperation(input: BeginStorageOperationInput): Promise<StorageOperationReceipt>;
  transitionStorageOperation(input: TransitionStorageOperationInput): Promise<StorageOperationReceipt>;
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
// operação administrativa etc.).
export class StorageAdministrationConflictError extends Error {
  readonly reason: StorageAdministrationConflictReason;

  constructor(reason: StorageAdministrationConflictReason, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageAdministrationConflictError';
    this.reason = reason;
  }
}

function defaultOperationId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `operation-${globalThis.crypto.randomUUID()}`;
  }
  return `operation-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function describeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Falha administrativa sem detalhe.';
}

function unavailableState(
  reason: StorageAdministrationUnavailableReason,
  detail: string,
): StorageAdministrationState {
  return { status: 'unavailable', reason, detail };
}

function conflictedState(
  reason: StorageAdministrationConflictReason,
  detail: string,
  operations: readonly StorageOperationReceipt[],
): StorageAdministrationState {
  return { status: 'conflicted', reason, detail, operations };
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
  };
}

class StorageAdminRuntimeImpl implements StorageAdminRuntime {
  private readonly key: string;
  private readonly storage: StorageLike;
  private readonly adapter: AdministrableWorkoutHistoryStorageAdapter;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(options: StorageAdminRuntimeOptions) {
    this.key = options.key;
    this.storage = options.storage;
    this.adapter = options.adapter;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? defaultOperationId;
  }

  async inspectStorageAdministration(): Promise<StorageAdministrationSnapshot> {
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.key);
    } catch (error) {
      return emptySnapshot(
        unavailableState('storage-blocked', describeError(error)),
        null,
      );
    }

    if (raw === null) {
      return emptySnapshot(
        unavailableState('not-hybrid', 'Não existe core físico gravado nesta chave.'),
        null,
      );
    }

    const parsed = parsePhysicalEnvelope(raw);
    if (parsed.status === 'v1') {
      return emptySnapshot(
        unavailableState('not-hybrid', 'O core físico ainda é o envelope legado v1.'),
        MONOLITHIC_STORAGE_VERSION,
      );
    }
    if (parsed.status === 'unsupported-version') {
      return emptySnapshot(
        unavailableState(
          'physical-version-mismatch',
          `A versão física ${String(parsed.version)} não é suportada.`,
        ),
        typeof parsed.version === 'number' ? parsed.version : null,
      );
    }
    if (parsed.status === 'corrupt') {
      return emptySnapshot(
        unavailableState('core-invalid', parsed.error),
        parsed.physicalVersion,
      );
    }

    const physicalStorageVersion = HYBRID_STORAGE_VERSION;

    const available = await this.adapterAvailable();
    if (!available) {
      return emptySnapshot(
        unavailableState('indexeddb-unavailable', 'O adapter IndexedDB reportou indisponibilidade.'),
        physicalStorageVersion,
      );
    }
    try {
      await this.adapter.open();
    } catch (error) {
      return emptySnapshot(
        unavailableState('indexeddb-unavailable', describeError(error)),
        physicalStorageVersion,
      );
    }

    let metadata: HistoryStorageMetadata;
    let generations: HistoryGenerationSummary[];
    let unsettledOperations: StorageOperationReceipt[];
    let pendingCompletionReceipts: WorkoutCompletionReceipt[];
    try {
      [metadata, generations, unsettledOperations, pendingCompletionReceipts] = await Promise.all([
        this.adapter.readMetadata(),
        this.adapter.listHistoryGenerations(),
        this.adapter.listUnsettledStorageOperationReceipts(),
        this.adapter.readPendingCompletionReceipts(),
      ]);
    } catch (error) {
      if (error instanceof StorageOperationReceiptIntegrityError) {
        return emptySnapshot(
          conflictedState('malformed-operation-receipt', describeError(error), []),
          physicalStorageVersion,
        );
      }
      if (error instanceof HistoryMetadataIntegrityError || error instanceof HistoryManifestIntegrityError) {
        return emptySnapshot(
          conflictedState('metadata-malformed', describeError(error), []),
          physicalStorageVersion,
        );
      }
      return emptySnapshot(
        unavailableState('indexeddb-unavailable', describeError(error)),
        physicalStorageVersion,
      );
    }

    let coreDigest: string | null = null;
    try {
      coreDigest = await sha256Checksum(raw);
    } catch {
      coreDigest = null;
    }

    const activeGenerationId = metadata.activeGeneration;
    const stagedGenerationId = metadata.migrationGeneration;
    const base = {
      physicalStorageVersion,
      activeGenerationId,
      stagedGenerationId,
      generations,
      unsettledOperations,
      pendingCompletionReceiptCount: pendingCompletionReceipts.length,
      coreDigest,
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

    const activeSummary = generations.find((entry) => entry.generationId === activeGenerationId);
    const activeGenerationCorrupt = !activeSummary || !activeSummary.hasManifest || activeSummary.verified !== true;
    if (activeGenerationCorrupt) {
      return {
        ...base,
        state: conflictedState(
          'active-generation-corrupt',
          `A geração ativa ${activeGenerationId} não tem manifest confirmado.`,
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
      return { ...base, state: { status: 'interrupted', operation } };
    }

    return { ...base, state: { status: 'ready' } };
  }

  async readVerifiedAdministrationGeneration(generationId: string): Promise<VerifiedHistoryGeneration> {
    if (!generationId) throw new Error('A leitura administrativa exige um generationId.');
    const snapshot = await this.inspectStorageAdministration();
    if (snapshot.state.status === 'unavailable') {
      throw new StorageAdministrationUnavailableError(snapshot.state.reason, snapshot.state.detail);
    }
    const verified = await this.adapter.readVerifiedHistoryGeneration(generationId);
    return {
      generationId: verified.generationId,
      sessions: [...verified.sessions],
      manifest: { ...verified.manifest },
    };
  }

  async beginStorageOperation(input: BeginStorageOperationInput): Promise<StorageOperationReceipt> {
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

    const metadata = await this.adapter.readMetadata();
    const activeGenerationId = metadata.activeGeneration;
    if (!activeGenerationId) {
      throw new StorageAdministrationUnavailableError(
        'core-invalid',
        'Não existe geração ativa de histórico ao iniciar a operação.',
      );
    }
    // Verificação integral, não a flag do manifest: o begin nunca parte de uma
    // geração cuja integridade não foi recalculada agora.
    await this.adapter.readVerifiedHistoryGeneration(activeGenerationId);

    const receipt = createStorageOperationReceipt({
      operationId: this.idFactory(),
      kind: input.kind,
      previousCoreRaw: raw,
      previousGenerationId: activeGenerationId,
      createdAt: this.now().toISOString(),
      sourceDigest: input.sourceDigest ?? null,
      stagedGenerationId: input.stagedGenerationId ?? null,
      targetCoreRaw: input.targetCoreRaw ?? null,
    });

    const created = await this.adapter.createStorageOperationReceiptIfIdle({
      receipt,
      expectedActiveGenerationId: activeGenerationId,
    });

    // O core v2 vive no localStorage, fora da transação IndexedDB que acabou
    // de criar o receipt: esta releitura fecha a janela que o CAS por si só
    // não cobre. Qualquer divergência reverte o receipt em vez de deixá-lo
    // staged e utilizável sobre um estado que já mudou.
    let rawAfter: string | null;
    try {
      rawAfter = this.storage.getItem(this.key);
    } catch (error) {
      await this.revertBegunOperation(created.operationId);
      throw new StorageOperationBeginConflictError(
        `O core físico não pôde ser relido após iniciar a operação ${created.operationId}: ${describeError(error)}`,
      );
    }
    const metadataAfter = await this.adapter.readMetadata();
    if (rawAfter !== raw || metadataAfter.activeGeneration !== activeGenerationId) {
      await this.revertBegunOperation(created.operationId);
      throw new StorageOperationBeginConflictError(
        `O core ou a geração ativa mudaram durante o início da operação ${created.operationId}.`,
      );
    }

    return created;
  }

  async transitionStorageOperation(
    input: TransitionStorageOperationInput,
  ): Promise<StorageOperationReceipt> {
    const { operationId, expectedStatus, nextStatus, patch } = input;
    if (!operationId) throw new Error('A transição administrativa exige um operationId.');
    const available = await this.adapterAvailable();
    if (!available) {
      throw new StorageAdministrationUnavailableError(
        'indexeddb-unavailable',
        'O adapter IndexedDB está indisponível para transicionar a operação.',
      );
    }
    await this.adapter.open();
    // Delegação pura ao CAS do adapter: nenhuma regra de negócio, nenhum
    // efeito colateral por status, nenhuma transição além das já declaradas
    // em `storage-operation-receipt.ts`.
    return this.adapter.transitionStorageOperationReceipt(operationId, expectedStatus, nextStatus, patch);
  }

  private requireReadyForMutation(snapshot: StorageAdministrationSnapshot): void {
    if (snapshot.state.status === 'ready') return;
    if (snapshot.state.status === 'unavailable') {
      throw new StorageAdministrationUnavailableError(snapshot.state.reason, snapshot.state.detail);
    }
    if (snapshot.state.status === 'interrupted') {
      throw new StorageOperationAlreadyInProgressError(snapshot.state.operation);
    }
    throw new StorageAdministrationConflictError(snapshot.state.reason, snapshot.state.detail);
  }

  private async revertBegunOperation(operationId: string): Promise<void> {
    try {
      await this.adapter.transitionStorageOperationReceipt(operationId, 'staged', 'reverted');
    } catch {
      // Best-effort: se outra chamada já reverteu ou liquidou o receipt, ele
      // continua não terminal na pior hipótese e volta a aparecer como
      // `interrupted` no próximo diagnóstico — nunca é apagado.
    }
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
