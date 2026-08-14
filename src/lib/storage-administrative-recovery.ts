import type { AdministrableWorkoutHistoryStorageAdapter } from './storage-adapter';
import type { StorageAdminRuntime } from './storage-admin-runtime';
import type { StorageAdminOwnerTokenCoordinator } from './storage-admin-owner-token';
import {
  type LogicalStorageImportRecoveryResult,
  recoverLogicalStorageImportV2,
} from './storage-logical-import';
import {
  type LogicalStorageRestoreRecoveryResult,
  recoverLogicalStorageRestoreV2,
} from './storage-logical-restore';
import { isTerminalStorageOperationStatus } from './storage-operation-receipt';
import type { StorageLike } from './storage-types';

export type LogicalStorageAdministrativeRecoveryResult =
  | LogicalStorageImportRecoveryResult
  | LogicalStorageRestoreRecoveryResult;

export interface RecoverLogicalStorageAdministrationV2Input {
  runtime: StorageAdminRuntime;
  adapter: AdministrableWorkoutHistoryStorageAdapter;
  storage: StorageLike;
  key: string;
  operationId?: string;
  ownerToken?: StorageAdminOwnerTokenCoordinator;
}

function blockedResult(
  reason: 'operation-conflict' | 'administration-conflicted' | 'administration-unavailable',
): LogicalStorageAdministrativeRecoveryResult {
  return {
    ok: false,
    reason,
    error: 'A operacao administrativa nao possui um recovery reconhecido e seguro.',
    operationId: null,
    generationId: null,
    steps: 0,
    finalAction: 'observe',
    recoveryRequired: true,
    cleanupPending: false,
  };
}

/**
 * Dispatcher fechado por `kind`. Ele observa somente o journal persistido e
 * nunca infere a operacao a partir do core ou da geracao ativa.
 */
export async function recoverLogicalStorageAdministrationV2(
  input: RecoverLogicalStorageAdministrationV2Input,
): Promise<LogicalStorageAdministrativeRecoveryResult> {
  // A fachada abre/revalida o adapter. Ler o snapshot antes disso faria uma
  // instalacao v2 saudavel parecer indisponivel no primeiro boot.
  const opening = await input.runtime.inspectStorageAdministration().catch(() => null);
  if (opening === null || opening.state.status === 'unavailable') {
    // Preserva a classificacao historica (instalacao nova, v1, v2 bloqueado).
    return recoverLogicalStorageImportV2(input);
  }
  const snapshot = await input.adapter.readStorageAdministrationSnapshot().catch(() => null);
  if (snapshot === null) return blockedResult('administration-conflicted');

  let receipt = null;
  if (input.operationId !== undefined) {
    receipt = snapshot.operationReceipts.find(
      (entry) => entry.operationId === input.operationId,
    ) ?? null;
    if (receipt === null) return blockedResult('operation-conflict');
    if (
      !isTerminalStorageOperationStatus(receipt.status)
      && (
        snapshot.unsettledOperations.length !== 1
        || snapshot.unsettledOperations[0].operationId !== receipt.operationId
      )
    ) {
      return blockedResult('operation-conflict');
    }
  } else if (snapshot.unsettledOperations.length === 1) {
    [receipt] = snapshot.unsettledOperations;
  } else if (snapshot.unsettledOperations.length > 1) {
    return blockedResult('operation-conflict');
  }

  // Sem receipt em aberto, mantem o caminho historico da importacao. Alem de
  // preservar a classificacao de instalacao nova/v1, isso garante que o boot
  // sem restore continua com o mesmo contrato publico.
  if (receipt === null || receipt.kind === 'import') {
    return recoverLogicalStorageImportV2(input);
  }
  if (receipt.kind === 'restore') {
    return recoverLogicalStorageRestoreV2(input);
  }
  // reset/rollback nao ganharam recovery neste GOAL. Um kind futuro tambem cai
  // aqui depois que o parser correspondente o reconhecer: nunca ha default que
  // autorize hidratacao.
  return blockedResult('operation-conflict');
}
