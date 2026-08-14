import {
  createStorageAdminRuntime,
  type StorageAdminRuntime,
} from './storage-admin-runtime';
import type { AdministrableWorkoutHistoryStorageAdapter } from './storage-adapter';
import {
  type LogicalStorageAdministrativeRecoveryResult,
  type RecoverLogicalStorageAdministrationV2Input,
  recoverLogicalStorageAdministrationV2,
} from './storage-administrative-recovery';
import type { StorageAdminOwnerTokenCoordinator } from './storage-admin-owner-token';
import { parsePhysicalEnvelope } from './storage-hybrid';
import type { StorageLike } from './storage-types';
import { isRecord } from './storage-validation';

// ---------------------------------------------------------------------------
// GOAL-17B-002D-D1 — recuperação administrativa ANTES da hidratação
//
// Este módulo é o único orquestrador de boot: ele despacha a recuperação
// administrativa pelo `kind` do receipt e responde se a hidratação
// pode começar? Ele não renderiza, não conhece React, não importa o Provider,
// não cria geração e não inicia importação. `commitLogicalStorageImportV2`
// continua deliberadamente sem call site.
// ---------------------------------------------------------------------------

export type StorageBootRecoveryReadyStatus =
  | 'ready-no-operation'
  | 'ready-after-settled'
  | 'ready-after-reverted';

export type StorageBootRecoveryBlockedStatus =
  | 'blocked-operation-conflict'
  | 'blocked-recovery-required'
  | 'blocked-storage-unavailable'
  | 'blocked-administration-conflicted'
  | 'blocked-step-limit';

export interface StorageBootRecoveryReady {
  status: StorageBootRecoveryReadyStatus;
  hydrationAllowed: true;
  // Uma geração preparada e sem dono pode continuar no disco. Ela não impede
  // hidratação nem diagnóstico; a política de retenção é do 002D-F.
  cleanupPending: boolean;
}

export interface StorageBootRecoveryBlockedClassificationReady {
  status: 'ready-for-blocked-storage-classification';
  // Não autoriza hidratação de dados. Autoriza somente o runtime híbrido a
  // classificar o raw como `blocked` e devolver a superfície de recuperação já
  // existente.
  hydrationAllowed: false;
  blockedStorageClassificationAllowed: true;
  cleanupPending: false;
}

export interface StorageBootRecoveryBlocked {
  status: StorageBootRecoveryBlockedStatus;
  hydrationAllowed: false;
  cleanupPending: boolean;
  // Só aparece quando a versão foi comprovada pelo parser físico oficial.
  physicalVersion?: number;
  // SEMPRE uma constante deste módulo. Nenhuma mensagem dinâmica de storage,
  // de IndexedDB ou do journal atravessa esta fronteira.
  message: string;
}

export type StorageBootRecoveryOutcome =
  | StorageBootRecoveryReady
  | StorageBootRecoveryBlockedClassificationReady
  | StorageBootRecoveryBlocked;

export const STORAGE_BOOT_RECOVERY_MESSAGES: Readonly<
  Record<StorageBootRecoveryBlockedStatus, string>
> = {
  'blocked-operation-conflict':
    'Outra aba está executando uma operação de armazenamento ou existe mais de uma operação '
    + 'em aberto. Seus dados foram preservados e o carregamento está suspenso.',
  'blocked-recovery-required':
    'A recuperação do armazenamento local não pôde ser concluída. Seus dados foram preservados '
    + 'e nada foi apagado; reabra o aplicativo para tentar novamente.',
  'blocked-storage-unavailable':
    'O armazenamento local não está disponível para concluir a recuperação. '
    + 'Seus dados foram preservados e o carregamento está suspenso.',
  'blocked-administration-conflicted':
    'O armazenamento local está em um estado ambíguo e não pode ser carregado com segurança. '
    + 'Seus dados foram preservados para recuperação.',
  'blocked-step-limit':
    'A recuperação do armazenamento local não convergiu dentro do limite previsto. '
    + 'Seus dados foram preservados e o carregamento está suspenso.',
};

export interface StorageBootRecoveryInput {
  adapter: AdministrableWorkoutHistoryStorageAdapter;
  storage: StorageLike;
  key: string;
  // Injeção opcional: quando ausente, o runtime administrativo é criado aqui a
  // partir do MESMO adapter que a hidratação vai usar — sem segunda conexão.
  runtime?: StorageAdminRuntime;
  // O chamador pode compartilhar uma coordenação determinística nos testes.
  // Em produção, a recuperação cria o owner-token versionado a partir da chave.
  ownerToken?: StorageAdminOwnerTokenCoordinator;
  // Costura de teste para exercitar a classificação sem fabricar mundos físicos.
  // O caminho real usa `recoverLogicalStorageAdministrationV2`.
  recover?: (
    input: RecoverLogicalStorageAdministrationV2Input,
  ) => Promise<LogicalStorageAdministrativeRecoveryResult>;
}

function ready(
  status: StorageBootRecoveryReadyStatus,
  cleanupPending: boolean,
): StorageBootRecoveryReady {
  return { status, hydrationAllowed: true, cleanupPending };
}

function blocked(
  status: StorageBootRecoveryBlockedStatus,
  cleanupPending = false,
  physicalVersion?: number,
): StorageBootRecoveryBlocked {
  return {
    status,
    hydrationAllowed: false,
    cleanupPending,
    ...(physicalVersion === undefined ? {} : { physicalVersion }),
    message: STORAGE_BOOT_RECOVERY_MESSAGES[status],
  };
}

function readyForBlockedStorageClassification(): StorageBootRecoveryBlockedClassificationReady {
  return {
    status: 'ready-for-blocked-storage-classification',
    hydrationAllowed: false,
    blockedStorageClassificationAllowed: true,
    cleanupPending: false,
  };
}

// Classificação FECHADA. O padrão é bloquear: qualquer forma não reconhecida cai
// no `default`, nunca em "segue mesmo assim".
function classifyInitialAdministrationUnavailable(
  result: Record<string, unknown>,
  input: Pick<StorageBootRecoveryInput, 'storage' | 'key'>,
): StorageBootRecoveryOutcome {
  const cleanupPending = result.cleanupPending === true;
  if (
    result.steps !== 0
    || result.operationId !== null
    || result.generationId !== null
    || cleanupPending
  ) {
    return blocked('blocked-recovery-required', cleanupPending);
  }

  let raw: string | null;
  try {
    raw = input.storage.getItem(input.key);
  } catch {
    return blocked('blocked-storage-unavailable');
  }

  if (raw === null) return ready('ready-no-operation', false);

  const physical = parsePhysicalEnvelope(raw);
  if (physical.status === 'v1') return ready('ready-no-operation', false);
  if (physical.status === 'v2') {
    return blocked('blocked-storage-unavailable', false, 2);
  }
  if (physical.status === 'corrupt' && physical.physicalVersion === 2) {
    return blocked('blocked-storage-unavailable', false, 2);
  }

  // Raw presente sem v2 comprovável não pode ser hidratado como dados nem
  // substituído por migração. O runtime híbrido, porém, já tem o contrato
  // read-only que o classifica como `blocked` e preserva as capacidades legadas.
  return readyForBlockedStorageClassification();
}

export function classifyStorageBootRecovery(result: unknown): StorageBootRecoveryOutcome {
  if (!isRecord(result) || typeof result.ok !== 'boolean') {
    return blocked('blocked-recovery-required');
  }
  const cleanupPending = result.cleanupPending === true;

  if (result.ok) {
    switch (result.status) {
      case 'no-operation':
        return ready('ready-no-operation', cleanupPending);
      case 'settled':
      case 'already-settled':
        return ready('ready-after-settled', cleanupPending);
      case 'reverted':
      case 'already-reverted':
        return ready('ready-after-reverted', cleanupPending);
      default:
        return blocked('blocked-recovery-required', cleanupPending);
    }
  }

  switch (result.reason) {
    // Sem contexto físico, indisponibilidade administrativa é ambígua. O runner
    // distingue instalação nova/v1 de core v2 usando o parser oficial; esta
    // função pura permanece fail-closed.
    case 'administration-unavailable':
      return blocked('blocked-recovery-required', cleanupPending);
    case 'operation-conflict':
    case 'owner-token-conflict':
      return blocked('blocked-operation-conflict', cleanupPending);
    case 'administration-conflicted':
      return blocked('blocked-administration-conflicted', cleanupPending);
    case 'storage-unavailable':
      return blocked('blocked-storage-unavailable', cleanupPending);
    case 'recovery-step-limit':
      return blocked('blocked-step-limit', cleanupPending);
    // recovery-required, impossible-state, migration-incomplete, quota,
    // verification-failed, activation-failed, core-commit-failed,
    // readback-failed e qualquer motivo futuro ainda desconhecido.
    default:
      return blocked('blocked-recovery-required', cleanupPending);
  }
}

// Execução única, sem memoização. Nunca rejeita: uma exceção inesperada vira
// bloqueio, porque continuar depois de um erro que não sabemos ler seria
// exatamente o "por garantia" que o fluxo proíbe.
export async function runStorageBootRecovery(
  input: StorageBootRecoveryInput,
): Promise<StorageBootRecoveryOutcome> {
  try {
    const runtime = input.runtime ?? createStorageAdminRuntime({
      key: input.key,
      storage: input.storage,
      adapter: input.adapter,
    });
    const recover = input.recover ?? recoverLogicalStorageAdministrationV2;
    const result = await recover({
      runtime,
      adapter: input.adapter,
      storage: input.storage,
      key: input.key,
      ownerToken: input.ownerToken,
    });
    if (
      isRecord(result)
      && result.ok === false
      && result.reason === 'administration-unavailable'
    ) {
      return classifyInitialAdministrationUnavailable(result, input);
    }
    return classifyStorageBootRecovery(result);
  } catch {
    return blocked('blocked-recovery-required');
  }
}

// Uma recuperação física por ciclo de inicialização, compartilhada por chave
// dentro do mesmo armazenamento — o Strict Mode monta o Provider duas vezes e
// as duas montagens precisam observar a MESMA execução.
//
// A entrada é removida quando a promessa assenta, então um remount posterior
// executa de novo: isto é uma trava por ciclo, não uma flag global eterna que
// impediria uma recuperação legítima no futuro. Sem timer, sem sleep e sem
// depender de ordem de microtasks.
const bootRecoveryLocks = new WeakMap<
  object,
  Map<string, Promise<StorageBootRecoveryOutcome>>
>();

export function runStorageBootRecoveryOnce(
  input: StorageBootRecoveryInput,
): Promise<StorageBootRecoveryOutcome> {
  const lockTarget = input.storage as object;
  let locks = bootRecoveryLocks.get(lockTarget);
  if (!locks) {
    locks = new Map();
    bootRecoveryLocks.set(lockTarget, locks);
  }
  const existing = locks.get(input.key);
  if (existing) return existing;

  const operation = runStorageBootRecovery(input);
  locks.set(input.key, operation);
  void operation.finally(() => {
    if (locks?.get(input.key) === operation) locks.delete(input.key);
  });
  return operation;
}
