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

// Razões fechadas de incompatibilidade entre um receipt não terminal e o estado
// físico observado (core v2 + metadata + gerações existentes).
export type StorageOperationIncompatibilityReason =
  | 'terminal-status'
  | 'previous-generation-absent'
  | 'previous-generation-not-active'
  | 'core-not-previous'
  | 'staged-generation-absent'
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
    const activeIsStaged = stagedDeclared !== null && activeGeneration === stagedDeclared;

    if (!coreIsPrevious && !coreIsTarget) {
      return incompatible(
        'activating-state-unrecognized',
        `O core atual não é nem o anterior nem o alvo declarado pelo receipt ${receipt.operationId}.`,
      );
    }
    if (!activeIsPrevious && !activeIsStaged) {
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

  // `activated`: exige prova completa dos efeitos declarados.
  if (stagedDeclared === null || receipt.targetCoreRaw === null) {
    return incompatible(
      'activated-target-missing',
      `O receipt ${receipt.operationId} está activated sem geração preparada ou core alvo declarados.`,
    );
  }
  if (activeGeneration !== stagedDeclared) {
    return incompatible(
      'activated-generation-not-active',
      `O receipt ${receipt.operationId} está activated, mas a geração ativa é`
      + ` ${activeGeneration ?? 'nenhuma'}, e não ${stagedDeclared}.`,
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
