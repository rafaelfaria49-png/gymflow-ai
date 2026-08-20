// Receipt durável das operações administrativas do armazenamento.
//
// Este contrato é deliberadamente separado do `WorkoutCompletionReceipt`. A
// conclusão de treino descreve um append de sessão já materializado; uma
// operação administrativa (importação, restauração, reset ou rollback) descreve
// uma troca coordenada entre o core v2 do localStorage e uma geração física do
// IndexedDB. Compartilhar store, status ou validador faria o boot de treino ler
// um registro administrativo — ou o contrário — e é exatamente o que este
// módulo impede.
//
// Nada aqui cria receipt em fluxo real: o slice 002D-A1 entrega apenas o
// contrato, a validação pura e a tabela de transições. A coordenação com o core
// v2 fica no 002D-A2/C/D.

export type StorageOperationKind = 'import' | 'restore' | 'reset' | 'rollback';

export type StorageOperationStatus =
  | 'staged'
  | 'activating'
  | 'activated'
  | 'settled'
  | 'reverted';

export const STORAGE_OPERATION_KINDS: readonly StorageOperationKind[] = [
  'import',
  'restore',
  'reset',
  'rollback',
];

export const STORAGE_OPERATION_STATUSES: readonly StorageOperationStatus[] = [
  'staged',
  'activating',
  'activated',
  'settled',
  'reverted',
];

// `settled` e `reverted` são terminais: nenhuma transição parte deles.
export const TERMINAL_STORAGE_OPERATION_STATUSES: readonly StorageOperationStatus[] = [
  'settled',
  'reverted',
];

interface StorageOperationReceiptBase {
  operationId: string;
  // Digest do arquivo/origem que motivou a operação. `null` quando a operação
  // não tem origem externa (reset e rollback).
  sourceDigest: string | null;
  // Core v2 serializado imediatamente antes da operação. É o que permite
  // desfazer a troca; nunca pode ser vazio.
  previousCoreRaw: string;
  previousGenerationId: string;
  // Geração preparada pela operação. Só existe depois do staging físico.
  stagedGenerationId: string | null;
  targetCoreRaw: string | null;
  status: StorageOperationStatus;
  createdAt: string;
  updatedAt: string;
  // Relacoes de predecessor que ESTA operacao substitui para a mesma geracao
  // final. Ausente em receipts legado. Imutavel apos o nascimento: nao entra
  // no patch e receipts settled antigos nunca sao reescritos.
  supersedesOperationIds?: readonly string[];
}

// `kind` discrimina identidades fisicas diferentes. Import e reset criam uma
// geracao nova e a nomeiam em `stagedGenerationId`; restore reutiliza uma
// geracao existente e a nomeia em `targetGenerationId` antes de qualquer troca
// de ponteiro. Receipts historicos de import permanecem sem o campo novo.
// Reset nao usa `targetGenerationId`: o mundo vazio nasce numa geracao nova.
export interface ImportStorageOperationReceipt extends StorageOperationReceiptBase {
  kind: 'import';
  targetGenerationId?: never;
}

export interface RestoreStorageOperationReceipt extends StorageOperationReceiptBase {
  kind: 'restore';
  stagedGenerationId: null;
  targetGenerationId: string;
  targetCoreRaw: string;
}

export interface ResetStorageOperationReceipt extends StorageOperationReceiptBase {
  kind: 'reset';
  targetGenerationId?: never;
}

export interface LegacyStorageOperationReceipt extends StorageOperationReceiptBase {
  kind: 'rollback';
  targetGenerationId?: never;
}

export type StorageOperationReceipt =
  | ImportStorageOperationReceipt
  | RestoreStorageOperationReceipt
  | ResetStorageOperationReceipt
  | LegacyStorageOperationReceipt;

// Campos que podem mudar enquanto a operação avança. Identidade (`operationId`,
// `kind`), origem (`previousCoreRaw`, `previousGenerationId`), `status`,
// `createdAt` e `updatedAt` nunca entram pelo patch.
export type StorageOperationReceiptPatch = Partial<
  Pick<StorageOperationReceipt, 'sourceDigest' | 'stagedGenerationId' | 'targetCoreRaw'>
>;

const ALLOWED_TRANSITIONS: Record<StorageOperationStatus, readonly StorageOperationStatus[]> = {
  staged: ['activating', 'reverted'],
  activating: ['activated', 'reverted'],
  activated: ['settled', 'reverted'],
  settled: [],
  reverted: [],
};

// Campos exclusivos do receipt de conclusão de treino. Um registro que os
// carregue nunca é aceito como receipt administrativo: os dois contratos não se
// misturam nem por engano de gravação.
const COMPLETION_RECEIPT_FIELDS = ['receiptId', 'finalSession', 'sessionDigest'] as const;

export function isStorageOperationKind(value: unknown): value is StorageOperationKind {
  return typeof value === 'string'
    && STORAGE_OPERATION_KINDS.includes(value as StorageOperationKind);
}

export function isStorageOperationStatus(value: unknown): value is StorageOperationStatus {
  return typeof value === 'string'
    && STORAGE_OPERATION_STATUSES.includes(value as StorageOperationStatus);
}

export function isTerminalStorageOperationStatus(value: unknown): boolean {
  return isStorageOperationStatus(value)
    && TERMINAL_STORAGE_OPERATION_STATUSES.includes(value);
}

export function canTransitionStorageOperation(
  from: StorageOperationStatus,
  to: StorageOperationStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function hasOwn(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function uniqueNonEmptyStrings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const ids: string[] = [];
  for (const entry of value) {
    if (!isNonEmptyString(entry)) return null;
    ids.push(entry);
  }
  if (new Set(ids).size !== ids.length) return null;
  return ids;
}

function supersessionFieldIsValid(record: Record<string, unknown>): boolean {
  if (!hasOwn(record, 'supersedesOperationIds')) return true;
  const ids = uniqueNonEmptyStrings(record.supersedesOperationIds);
  if (ids === null) return false;
  return typeof record.operationId !== 'string' || !ids.includes(record.operationId);
}

function kindFieldsAreValid(record: Record<string, unknown>): boolean {
  if (record.kind === 'restore') {
    return record.stagedGenerationId === null
      && isNonEmptyString(record.targetGenerationId)
      && record.targetGenerationId !== record.previousGenerationId
      && isNonEmptyString(record.targetCoreRaw);
  }
  if (record.kind === 'reset') {
    // Reset nao tem origem externa e nao reutiliza geracao: sourceDigest fica
    // null e targetGenerationId e recusado ate como `undefined` persistido.
    return record.sourceDigest === null && !hasOwn(record, 'targetGenerationId');
  }
  // Em qualquer outro kind, ate `targetGenerationId: undefined` persistido e
  // recusado: esse writer declarou uma versao que o protocolo nao compreende.
  return !hasOwn(record, 'targetGenerationId');
}

// Validação pura usada antes de gravar e depois de ler. Um registro malformado
// nunca vira operação administrativa silenciosa.
export function isStorageOperationReceipt(value: unknown): value is StorageOperationReceipt {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (COMPLETION_RECEIPT_FIELDS.some((field) => (
    Object.prototype.hasOwnProperty.call(record, field)
  ))) {
    return false;
  }
  return isNonEmptyString(record.operationId)
    && isStorageOperationKind(record.kind)
    && isNullableString(record.sourceDigest)
    && isNonEmptyString(record.previousCoreRaw)
    && isNonEmptyString(record.previousGenerationId)
    && isNullableString(record.stagedGenerationId)
    && isNullableString(record.targetCoreRaw)
    && kindFieldsAreValid(record)
    && supersessionFieldIsValid(record)
    && isStorageOperationStatus(record.status)
    && isNonEmptyString(record.createdAt)
    && isNonEmptyString(record.updatedAt);
}

export function storageOperationFinalGenerationId(
  receipt: StorageOperationReceipt,
): string | null {
  if (receipt.kind === 'import' || receipt.kind === 'reset') return receipt.stagedGenerationId;
  if (receipt.kind === 'restore') return receipt.targetGenerationId;
  return null;
}

export function storageOperationSupersedesOperationIds(
  receipt: StorageOperationReceipt,
): readonly string[] {
  return receipt.supersedesOperationIds ?? [];
}

export function isStorageOperationPredecessorRelationSuperseded(
  receipt: StorageOperationReceipt,
  receipts: readonly StorageOperationReceipt[],
): boolean {
  const finalGeneration = storageOperationFinalGenerationId(receipt);
  if (finalGeneration === null || receipt.status !== 'settled') return false;
  for (const candidate of receipts) {
    if (candidate.status !== 'settled') continue;
    if (candidate.operationId === receipt.operationId) continue;
    if (storageOperationFinalGenerationId(candidate) !== finalGeneration) continue;
    if (storageOperationSupersedesOperationIds(candidate).includes(receipt.operationId)) {
      return true;
    }
  }
  return false;
}

export function listActivePredecessorSourceOperationIds(
  receipts: readonly StorageOperationReceipt[],
  finalGenerationId: string,
): readonly string[] {
  if (!isNonEmptyString(finalGenerationId)) return [];
  const ids: string[] = [];
  for (const receipt of receipts) {
    if (receipt.status !== 'settled') continue;
    if (storageOperationFinalGenerationId(receipt) !== finalGenerationId) continue;
    if (isStorageOperationPredecessorRelationSuperseded(receipt, receipts)) continue;
    ids.push(receipt.operationId);
  }
  return ids;
}

export type StorageOperationSupersessionValidationReason =
  | 'malformed'
  | 'self-reference'
  | 'missing-operation'
  | 'receipt-invalid'
  | 'not-settled'
  | 'cross-generation'
  | 'cycle'
  | 'relation-not-active';

export type StorageOperationSupersessionValidation =
  | { readonly ok: true; readonly ids: readonly string[] }
  | {
      readonly ok: false;
      readonly reason: StorageOperationSupersessionValidationReason;
    };

function settledReceiptById(
  receipts: readonly StorageOperationReceipt[],
  operationId: string,
): StorageOperationReceipt | null {
  for (const receipt of receipts) {
    if (receipt.operationId !== operationId) continue;
    if (!isStorageOperationReceipt(receipt)) return null;
    return receipt;
  }
  return null;
}

function supersessionEdges(
  receipts: readonly StorageOperationReceipt[],
): Map<string, readonly string[]> {
  const known = new Set(
    receipts
      .filter((receipt) => receipt.status === 'settled')
      .map((receipt) => receipt.operationId),
  );
  const edges = new Map<string, readonly string[]>();
  for (const receipt of receipts) {
    if (receipt.status !== 'settled') continue;
    edges.set(
      receipt.operationId,
      storageOperationSupersedesOperationIds(receipt).filter((id) => known.has(id)),
    );
  }
  return edges;
}

/**
 * Detecta ciclo de 2 ou mais nós no grafo de supersessão settled.
 * Não escolhe por timestamp, ordem de enumeração ou ID lexical: qualquer
 * ciclo é conflito explícito.
 */
export function detectStorageOperationSupersessionCycle(
  receipts: readonly StorageOperationReceipt[],
  extraEdge?: { readonly from: string; readonly to: readonly string[] },
): boolean {
  const edges = supersessionEdges(receipts);
  if (extraEdge !== undefined) {
    const known = new Set(edges.keys());
    known.add(extraEdge.from);
    const existing = edges.get(extraEdge.from) ?? [];
    edges.set(
      extraEdge.from,
      [...new Set([...existing, ...extraEdge.to.filter((id) => known.has(id) || id === extraEdge.from)])],
    );
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of edges.get(node) ?? []) {
      if (walk(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  for (const node of edges.keys()) {
    if (walk(node)) return true;
  }
  return false;
}

/**
 * Prova referencial completa antes de aceitar supersedesOperationIds.
 * Estado inválido falha fechado: não corrige, não escolhe e não persiste.
 */
export function validateStorageOperationSupersession(input: {
  readonly operationId: unknown;
  readonly supersedesOperationIds: unknown;
  readonly finalGenerationId: unknown;
  readonly receipts: readonly StorageOperationReceipt[];
}): StorageOperationSupersessionValidation {
  if (!isNonEmptyString(input.operationId) || !isNonEmptyString(input.finalGenerationId)) {
    return { ok: false, reason: 'malformed' };
  }
  const ids = uniqueNonEmptyStrings(input.supersedesOperationIds);
  if (ids === null) return { ok: false, reason: 'malformed' };
  if (ids.includes(input.operationId)) return { ok: false, reason: 'self-reference' };

  if (detectStorageOperationSupersessionCycle(input.receipts)) {
    return { ok: false, reason: 'cycle' };
  }
  if (detectStorageOperationSupersessionCycle(input.receipts, {
    from: input.operationId,
    to: ids,
  })) {
    return { ok: false, reason: 'cycle' };
  }

  const active = new Set(
    listActivePredecessorSourceOperationIds(input.receipts, input.finalGenerationId),
  );

  for (const id of ids) {
    const named = settledReceiptById(input.receipts, id);
    if (named === null) {
      const exists = input.receipts.some((receipt) => receipt.operationId === id);
      return { ok: false, reason: exists ? 'receipt-invalid' : 'missing-operation' };
    }
    if (named.status !== 'settled') return { ok: false, reason: 'not-settled' };
    if (storageOperationFinalGenerationId(named) !== input.finalGenerationId) {
      return { ok: false, reason: 'cross-generation' };
    }
    if (!active.has(id)) return { ok: false, reason: 'relation-not-active' };
  }

  return { ok: true, ids: Object.freeze([...ids]) };
}

export function declaredSupersedesMatchLiveRelations(
  declared: readonly string[] | undefined,
  live: readonly string[],
): boolean {
  const left = [...(declared ?? [])].sort();
  const right = [...live].sort();
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

// Razões fechadas de incompatibilidade entre um receipt não terminal e o estado
// físico observado (core v2 + metadata + gerações existentes).
export type StorageOperationIncompatibilityReason =
  | 'terminal-status'
  | 'previous-generation-absent'
  | 'previous-generation-not-active'
  | 'core-not-previous'
  | 'staged-generation-absent'
  | 'target-generation-absent'
  | 'migration-generation-divergent'
  | 'activating-state-unrecognized'
  | 'activating-effects-unprovable'
  | 'activated-target-missing'
  | 'activated-generation-not-active'
  | 'activated-core-not-target';

export type StorageOperationCompatibility =
  | { status: 'compatible' }
  | { status: 'incompatible'; reason: StorageOperationIncompatibilityReason; message: string }
  // O estado observado não é contraditório, mas o A2 não tem como provar que os
  // efeitos declarados pelo receipt realmente aconteceram. Nunca é tratado como
  // `compatible`: o chamador precisa recusar a mutação do mesmo jeito.
  | { status: 'insufficient-evidence'; reason: StorageOperationIncompatibilityReason; message: string };

export interface StorageOperationCompatibilityInput {
  receipt: StorageOperationReceipt;
  coreRaw: string;
  metadata: { activeGeneration: string | null; migrationGeneration: string | null };
  generations: readonly { generationId: string }[];
}

function incompatible(
  reason: StorageOperationIncompatibilityReason,
  message: string,
): StorageOperationCompatibility {
  return { status: 'incompatible', reason, message };
}

function insufficient(
  reason: StorageOperationIncompatibilityReason,
  message: string,
): StorageOperationCompatibility {
  return { status: 'insufficient-evidence', reason, message };
}

// Coerência do ponteiro de staging físico com o que o receipt declara.
// `stagedGenerationId === null` exige `migrationGeneration === null`: no A2
// nenhum fluxo cria staging físico, então um ponteiro preenchido sem receipt que
// o explique é divergência, não detalhe.
function migrationPointerCoherent(
  stagedGenerationId: string | null,
  migrationGeneration: string | null,
): boolean {
  return stagedGenerationId === null
    ? migrationGeneration === null
    : migrationGeneration === null || migrationGeneration === stagedGenerationId;
}

// Avaliação pura: nenhuma leitura, nenhuma escrita, nenhum efeito. Ela responde
// se um receipt não terminal descreve o mesmo mundo que o core v2 e a metadata
// observados agora — a pergunta que decide entre `interrupted` (seguro para
// diagnosticar e, no futuro, retomar) e `conflicted` (ambíguo demais).
export function evaluateStorageOperationCompatibility(
  input: StorageOperationCompatibilityInput,
): StorageOperationCompatibility {
  const { receipt, coreRaw, metadata, generations } = input;
  const known = new Set(generations.map((entry) => entry.generationId));
  const { activeGeneration, migrationGeneration } = metadata;

  if (TERMINAL_STORAGE_OPERATION_STATUSES.includes(receipt.status)) {
    return incompatible(
      'terminal-status',
      `O receipt ${receipt.operationId} está em ${receipt.status}: não é uma operação em aberto.`,
    );
  }

  if (!known.has(receipt.previousGenerationId)) {
    return incompatible(
      'previous-generation-absent',
      `A geração anterior ${receipt.previousGenerationId} do receipt ${receipt.operationId} não existe mais.`,
    );
  }

  const stagedDeclared = receipt.stagedGenerationId;
  if (stagedDeclared !== null && !known.has(stagedDeclared)) {
    return incompatible(
      'staged-generation-absent',
      `A geração preparada ${stagedDeclared} declarada pelo receipt ${receipt.operationId} não existe.`,
    );
  }
  if (!migrationPointerCoherent(stagedDeclared, migrationGeneration)) {
    return incompatible(
      'migration-generation-divergent',
      `O ponteiro de staging (${migrationGeneration ?? 'nenhum'}) não corresponde ao receipt ${receipt.operationId}`
      + ` (${stagedDeclared ?? 'nenhum'}).`,
    );
  }

  if (receipt.status === 'staged') {
    // `staged` significa "nada foi aplicado ainda": o mundo tem de estar
    // exatamente como o receipt o encontrou.
    if (activeGeneration !== receipt.previousGenerationId) {
      return incompatible(
        'previous-generation-not-active',
        `O receipt ${receipt.operationId} está staged sobre ${receipt.previousGenerationId},`
        + ` mas a geração ativa é ${activeGeneration ?? 'nenhuma'}.`,
      );
    }
    if (coreRaw !== receipt.previousCoreRaw) {
      return incompatible(
        'core-not-previous',
        `O core atual não é o core que o receipt ${receipt.operationId} registrou antes de começar.`,
      );
    }
    return { status: 'compatible' };
  }

  if (receipt.status === 'activating') {
    // A ativação pode ter aplicado parte dos efeitos. Só dois mundos são
    // reconhecíveis: o de antes (nada aplicado) e o de depois (tudo aplicado
    // sobre alvos que o receipt declarou). Qualquer terceiro valor é conflito.
    const coreIsPrevious = coreRaw === receipt.previousCoreRaw;
    const coreIsTarget = receipt.targetCoreRaw !== null && coreRaw === receipt.targetCoreRaw;
    const activeIsPrevious = activeGeneration === receipt.previousGenerationId;
    const declaredTargetGeneration = receipt.kind === 'restore'
      ? receipt.targetGenerationId
      : stagedDeclared;
    const activeIsTarget = declaredTargetGeneration !== null
      && activeGeneration === declaredTargetGeneration;

    if (!coreIsPrevious && !coreIsTarget) {
      return incompatible(
        'activating-state-unrecognized',
        `O core atual não é nem o anterior nem o alvo declarado pelo receipt ${receipt.operationId}.`,
      );
    }
    if (!activeIsPrevious && !activeIsTarget) {
      return incompatible(
        'activating-state-unrecognized',
        `A geração ativa ${activeGeneration ?? 'nenhuma'} não é nem a anterior nem a preparada`
        + ` pelo receipt ${receipt.operationId}.`,
      );
    }
    if (coreIsPrevious && activeIsPrevious) return { status: 'compatible' };
    // Mundo reconhecível, porém já parcial ou totalmente aplicado: o A2 não
    // executa ativação, então não tem como atestar que esses efeitos vieram
    // desta operação.
    return insufficient(
      'activating-effects-unprovable',
      `O receipt ${receipt.operationId} está activating com efeitos já aplicados que o A2 não consegue comprovar.`,
    );
  }
  if (receipt.kind === 'restore' && !known.has(receipt.targetGenerationId)) {
    return incompatible(
      'target-generation-absent',
      `A geracao alvo ${receipt.targetGenerationId} do restore ${receipt.operationId} nao existe.`,
    );
  }

  // `activated`: exige prova completa dos efeitos declarados.
  const activatedTargetGeneration = receipt.kind === 'restore'
    ? receipt.targetGenerationId
    : stagedDeclared;
  if (activatedTargetGeneration === null || receipt.targetCoreRaw === null) {
    return incompatible(
      'activated-target-missing',
      `O receipt ${receipt.operationId} está activated sem geração preparada ou core alvo declarados.`,
    );
  }
  if (activeGeneration !== activatedTargetGeneration) {
    return incompatible(
      'activated-generation-not-active',
      `O receipt ${receipt.operationId} está activated, mas a geração ativa é`
      + ` ${activeGeneration ?? 'nenhuma'}, e não ${activatedTargetGeneration}.`,
    );
  }
  if (coreRaw !== receipt.targetCoreRaw) {
    return incompatible(
      'activated-core-not-target',
      `O receipt ${receipt.operationId} está activated, mas o core atual não é o core alvo declarado.`,
    );
  }
  return { status: 'compatible' };
}

type CreateStorageOperationReceiptBaseInput = {
  operationId: string;
  previousCoreRaw: string;
  previousGenerationId: string;
  createdAt: string;
  sourceDigest?: string | null;
  stagedGenerationId?: string | null;
  targetCoreRaw?: string | null;
  updatedAt?: string;
  supersedesOperationIds?: readonly string[];
};

export type CreateStorageOperationReceiptInput =
  | (CreateStorageOperationReceiptBaseInput & {
      kind: 'restore';
      stagedGenerationId?: null;
      targetGenerationId: string;
      targetCoreRaw: string;
    })
  | (CreateStorageOperationReceiptBaseInput & {
      kind: Exclude<StorageOperationKind, 'restore'>;
      targetGenerationId?: never;
    });

function frozenSupersedes(
  value: readonly string[] | undefined,
  operationId: string,
): readonly string[] | undefined {
  const ids = uniqueNonEmptyStrings(value);
  if (ids === null || ids.includes(operationId)) return undefined;
  return Object.freeze([...ids]);
}

export function createStorageOperationReceipt(
  input: CreateStorageOperationReceiptInput,
): StorageOperationReceipt {
  const targetGeneration = input.kind === 'restore'
    ? { targetGenerationId: input.targetGenerationId }
    : {};
  const supersedes = frozenSupersedes(input.supersedesOperationIds, input.operationId);
  return {
    operationId: input.operationId,
    kind: input.kind,
    sourceDigest: input.sourceDigest ?? null,
    previousCoreRaw: input.previousCoreRaw,
    previousGenerationId: input.previousGenerationId,
    stagedGenerationId: input.stagedGenerationId ?? null,
    targetCoreRaw: input.targetCoreRaw ?? null,
    ...targetGeneration,
    ...(supersedes === undefined ? {} : { supersedesOperationIds: supersedes }),
    status: 'staged',
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  } as StorageOperationReceipt;
}
