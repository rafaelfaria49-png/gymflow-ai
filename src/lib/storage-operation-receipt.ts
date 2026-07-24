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

export interface StorageOperationReceipt {
  operationId: string;
  kind: StorageOperationKind;
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
}

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
    && isStorageOperationStatus(record.status)
    && isNonEmptyString(record.createdAt)
    && isNonEmptyString(record.updatedAt);
}

export function createStorageOperationReceipt(input: {
  operationId: string;
  kind: StorageOperationKind;
  previousCoreRaw: string;
  previousGenerationId: string;
  createdAt: string;
  sourceDigest?: string | null;
  stagedGenerationId?: string | null;
  targetCoreRaw?: string | null;
  updatedAt?: string;
}): StorageOperationReceipt {
  return {
    operationId: input.operationId,
    kind: input.kind,
    sourceDigest: input.sourceDigest ?? null,
    previousCoreRaw: input.previousCoreRaw,
    previousGenerationId: input.previousGenerationId,
    stagedGenerationId: input.stagedGenerationId ?? null,
    targetCoreRaw: input.targetCoreRaw ?? null,
    status: 'staged',
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  };
}
