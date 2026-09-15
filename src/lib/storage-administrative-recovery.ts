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
import {
  type LogicalStorageResetRecoveryResult,
  recoverLogicalStorageResetV2,
} from './storage-logical-reset';
import { isTerminalStorageOperationStatus } from './storage-operation-receipt';
import type { StorageLike } from './storage-types';

export type LogicalStorageAdministrativeRecoveryResult =
  | LogicalStorageImportRecoveryResult
  | LogicalStorageRestoreRecoveryResult
  | LogicalStorageResetRecoveryResult;

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

type LedgerCapableAdapter = {
  snapshotNutritionLedger: () => Promise<import('./storage-nutrition-ledger-backup').NutritionLedgerBackupSection>;
  replaceNutritionLedgerAsAdmin: (
    section: import('./storage-nutrition-ledger-backup').NutritionLedgerBackupSection,
  ) => Promise<void>;
  runNutritionAdminWithExclusiveLock?: <T>(task: () => Promise<T>) => Promise<T>;
  readStorageOperationReceipt?: (operationId: string) => Promise<unknown>;
};

/**
 * GOAL-100: fix-up do ledger no boot (mesmo journal, nenhum segundo sistema).
 * - settled => ledger deve ser o target do receipt;
 * - reverted => ledger deve ser o previous do receipt;
 * - no-operation/legado sem raws => nada a fazer;
 * - divergente => aplica o esperado (full replace, preserva fence) e revalida;
 * - falha => blocked (recoveryRequired, sem hidratação híbrida).
 */
async function convergeNutritionLedgerAfterCoreRecovery(
  input: RecoverLogicalStorageAdministrationV2Input,
  coreResult: LogicalStorageAdministrativeRecoveryResult,
): Promise<LogicalStorageAdministrativeRecoveryResult> {
  if (!coreResult.ok) return coreResult;
  const status = (coreResult as { status?: string }).status;
  if (status !== 'settled' && status !== 'already-settled' && status !== 'reverted' && status !== 'already-reverted') {
    return coreResult;
  }
  const operationId = (coreResult as { operationId?: string | null }).operationId;
  if (!operationId) return coreResult;
  const adapter = input.adapter as unknown as LedgerCapableAdapter;
  if (typeof adapter.snapshotNutritionLedger !== 'function' || typeof adapter.replaceNutritionLedgerAsAdmin !== 'function') {
    return coreResult;
  }
  let receipt: Record<string, unknown> | null = null;
  try {
    if (typeof adapter.readStorageOperationReceipt === 'function') {
      receipt = (await adapter.readStorageOperationReceipt(operationId)) as unknown as Record<string, unknown> | null;
    }
  } catch {
    return coreResult;
  }
  if (!receipt) return coreResult;
  const isSettled = status === 'settled' || status === 'already-settled';
  const expectedRaw = isSettled
    ? (receipt.targetNutritionLedgerRaw as unknown)
    : (receipt.previousNutritionLedgerRaw as unknown);
  // Legado (sem raws) ou reset sem ledger: nada a convergir.
  if (expectedRaw === undefined || expectedRaw === null) return coreResult;
  if (typeof expectedRaw !== 'string' || expectedRaw.length === 0) return coreResult;
  const runExclusive = typeof adapter.runNutritionAdminWithExclusiveLock === 'function'
    ? adapter.runNutritionAdminWithExclusiveLock.bind(adapter)
    : undefined;
  const converge = async (): Promise<boolean> => {
    const {
      validateNutritionLedgerBackupSection,
      serializeNutritionLedgerCanonically,
    } = await import('./storage-nutrition-ledger-backup');
    let expectedParsed: unknown;
    try {
      expectedParsed = JSON.parse(expectedRaw);
    } catch {
      try {
        // eslint-disable-next-line no-console
        console.log('[ledger-recovery] expected parse failed');
      } catch {
        /* noop */
      }
      return false;
    }
    const expectedChecked = validateNutritionLedgerBackupSection(expectedParsed);
    if (expectedChecked.status !== 'valid') {
      try {
        // eslint-disable-next-line no-console
        console.log('[ledger-recovery] expected invalid', expectedChecked.detail);
      } catch {
        /* noop */
      }
      return false;
    }
    const expectedCanonical = serializeNutritionLedgerCanonically(expectedChecked.section);
    let current: import('./storage-nutrition-ledger-backup').NutritionLedgerBackupSection;
    try {
      current = await adapter.snapshotNutritionLedger();
    } catch {
      return false;
    }
    const currentChecked = validateNutritionLedgerBackupSection(current);
    if (currentChecked.status !== 'valid') {
      // Ledger corrente corrompido fora de operação admin? Não repara às cegas:
      // se o esperado é vazio e o corrente é ilegível, aplica o esperado;
      // caso contrário, bloqueia.
      try {
        await adapter.replaceNutritionLedgerAsAdmin(expectedChecked.section);
      } catch {
        return false;
      }
      try {
        const reread = await adapter.snapshotNutritionLedger();
        return serializeNutritionLedgerCanonically(reread) === expectedCanonical;
      } catch {
        return false;
      }
    }
    if (serializeNutritionLedgerCanonically(currentChecked.section) === expectedCanonical) {
      return true;
    }
    try {
      await adapter.replaceNutritionLedgerAsAdmin(expectedChecked.section);
    } catch {
      return false;
    }
    try {
      const reread = await adapter.snapshotNutritionLedger();
      const rereadChecked = validateNutritionLedgerBackupSection(reread);
      if (rereadChecked.status !== 'valid') return false;
      return serializeNutritionLedgerCanonically(rereadChecked.section) === expectedCanonical;
    } catch {
      return false;
    }
  };
  try {
    let converged: boolean;
    if (typeof runExclusive === 'function') {
      try {
        converged = await runExclusive(converge);
      } catch (lockError) {
        // Sem Web Locks (testes single-tab / ambientes sem cross-tab): converge
        // direto. Em produção com locks, o exclusive serializa com writers.
        try {
          const { isNutritionAdminLockUnavailableError } = await import('./nutrition/admin-lock');
          if (isNutritionAdminLockUnavailableError(lockError)) {
            converged = await converge();
          } else {
            converged = false;
          }
        } catch {
          try {
            converged = await converge();
          } catch {
            converged = false;
          }
        }
      }
    } else {
      converged = await converge();
    }
    if (!converged) {
      return {
        ...coreResult,
        ok: false as const,
        reason: 'recovery-required' as never,
        error: 'A convergência do ledger nutricional não pôde ser comprovada; o journal foi preservado.',
        recoveryRequired: true as const,
      };
    }
    return coreResult;
  } catch {
    return {
      ...coreResult,
      ok: false as const,
      reason: 'recovery-required' as never,
      error: 'A convergência do ledger nutricional não pôde ser comprovada; o journal foi preservado.',
      recoveryRequired: true as const,
    };
  }
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
  // GOAL-100: o adapter real (IDB v5) implementa as primitivas ledger-aware;
  // o tipo base não as declara. Cast seguro em runtime (falha vira blocked).
  let coreResult: LogicalStorageAdministrativeRecoveryResult;
  if (receipt === null || receipt.kind === 'import') {
    coreResult = await recoverLogicalStorageImportV2(input as never);
  } else if (receipt.kind === 'restore') {
    coreResult = await recoverLogicalStorageRestoreV2(input as never);
  } else if (receipt.kind === 'reset') {
    coreResult = await recoverLogicalStorageResetV2(input as never);
  } else {
    return blockedResult('operation-conflict');
  }
  // GOAL-100: convergência do ledger após a convergência do core/history.
  // O recovery do core ignora o ledger; sem este fix-up, um crash entre o stage
  // dos dias e o settled deixaria híbrido (core novo + ledger antigo ou inverso).
  // Aqui o mundo core já convergiu (previous ou target); o ledger é levado ao
  // mesmo mundo (previous se reverted, target se settled), sob lock EXCLUSIVE.
  // Nunca híbrido; falha vira blocked (journal preservado).
  return convergeNutritionLedgerAfterCoreRecovery(input, coreResult);
  // rollback e kind desconhecido/malformado: fail-closed. Nunca ha default
  // que autorize hidratacao.
  return blockedResult('operation-conflict');
}
