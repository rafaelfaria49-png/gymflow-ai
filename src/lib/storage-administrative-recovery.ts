import type { AdministrableWorkoutHistoryStorageAdapter } from './storage-adapter';
import type { StorageAdminRuntime } from './storage-admin-runtime';
import type { StorageAdminOwnerTokenCoordinator } from './storage-admin-owner-token';
import { isNutritionAdminLockUnavailableError } from './nutrition/admin-lock';
import type { StorageOperationReceipt } from './storage-operation-receipt';
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
 *
 * GOAL-102 (NOLOCK fail-closed): a prova/convergência do ledger exige Web
 * Lock EXCLUSIVE. Sem a primitiva `runNutritionAdminWithExclusiveLock`, ou
 * quando ela lança `NutritionAdminLockUnavailableError`, o recovery retorna
 * recovery-required com o journal preservado. Nunca converge direto, nunca
 * declara convergência sem prova sob exclusão, e nunca usa o fence como
 * substituto de exclusão cross-tab (o fence segue só defesa em profundidade).
 */
function ledgerConvergenceBlocked(
  coreResult: LogicalStorageAdministrativeRecoveryResult,
): LogicalStorageAdministrativeRecoveryResult {
  return {
    ...coreResult,
    ok: false as const,
    reason: 'recovery-required' as never,
    error: 'A convergência do ledger nutricional não pôde ser comprovada; o journal foi preservado.',
    recoveryRequired: true as const,
  };
}

/**
 * GOAL-102 (NOLOCK fail-closed): gate pré-core do proof do ledger.
 *
 * Se o receipt selecionado carrega raws do ledger, o boot pode precisar
 * provar/convergir o ledger — e isso exige Web Lock EXCLUSIVE ANTES de
 * qualquer mutação do core. Retorna o resultado fail-closed quando a
 * exclusão está indisponível (primitiva ausente ou sonda recusada), com o
 * journal intacto em aberto para o próximo boot: nenhum settle/remove do
 * journal, nenhum write no ledger, nenhuma declaração de convergência.
 * Retorna null quando o lock existe (seguir) ou quando o receipt não pode
 * exigir prova do ledger (legado sem raws).
 */
async function gateNutritionLedgerProofLock(
  adapter: AdministrableWorkoutHistoryStorageAdapter,
  receipt: StorageOperationReceipt,
): Promise<LogicalStorageAdministrativeRecoveryResult | null> {
  const targetRaw = receipt.targetNutritionLedgerRaw;
  const previousRaw = receipt.previousNutritionLedgerRaw;
  const mayRequireProof =
    (typeof targetRaw === 'string' && targetRaw.length > 0)
    || (typeof previousRaw === 'string' && previousRaw.length > 0);
  if (!mayRequireProof) return null;
  const candidate = (adapter as unknown as LedgerCapableAdapter).runNutritionAdminWithExclusiveLock;
  // Primitiva ausente: fail-closed antes de qualquer mutação. A ausência da
  // função nunca é lida como "single-tab seguro".
  if (typeof candidate !== 'function') {
    return {
      ok: false as const,
      reason: 'recovery-required' as never,
      error: 'A convergência do ledger nutricional exige exclusão cross-tab indisponível; o journal foi preservado para o próximo boot.',
      operationId: receipt.operationId,
      generationId: receipt.stagedGenerationId ?? null,
      steps: 0,
      finalAction: 'observe' as never,
      recoveryRequired: true as const,
      cleanupPending: false as const,
    };
  }
  // Sonda de disponibilidade: adquire+libera sem mutar nada. Se a exclusão
  // cross-tab está indisponível, o core NÃO é tocado — o journal segue em
  // aberto para o próximo boot. O fence isolado não substitui esta sonda.
  try {
    await candidate.bind(adapter)(async () => undefined);
  } catch {
    return {
      ok: false as const,
      reason: 'recovery-required' as never,
      error: 'A convergência do ledger nutricional exige exclusão cross-tab indisponível; o journal foi preservado para o próximo boot.',
      operationId: receipt.operationId,
      generationId: receipt.stagedGenerationId ?? null,
      steps: 0,
      finalAction: 'observe' as never,
      recoveryRequired: true as const,
      cleanupPending: false as const,
    };
  }
  return null;
}

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
    // GOAL-102: sem a primitiva EXCLUSIVE não há como provar convergência
    // cross-tab. Fail-closed antes de qualquer snapshot+replace: nenhum
    // write no ledger, nenhuma declaração de convergência, nenhuma
    // liquidação do journal por causa do ledger. A ausência da função nunca
    // é lida como "single-tab seguro".
    if (typeof runExclusive !== 'function') {
      return ledgerConvergenceBlocked(coreResult);
    }
    let converged: boolean;
    try {
      converged = await runExclusive(converge);
    } catch (lockError) {
      // GOAL-102: Web Lock indisponível => fail-closed. O fence isolado não
      // substitui a exclusão cross-tab, então não há converge() direto aqui:
      // o journal é preservado para o próximo boot e a hidratação híbrida
      // segue bloqueada.
      if (isNutritionAdminLockUnavailableError(lockError)) {
        return ledgerConvergenceBlocked(coreResult);
      }
      converged = false;
    }
    if (!converged) {
      return ledgerConvergenceBlocked(coreResult);
    }
    return coreResult;
  } catch {
    return ledgerConvergenceBlocked(coreResult);
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
  // GOAL-102: gate pré-core — se o receipt selecionado pode exigir prova do
  // ledger, a exclusão cross-tab precisa existir ANTES de qualquer mutação do
  // core. Sem ela, fail-closed com o journal intacto para o próximo boot.
  if (
    receipt !== null
    && (receipt.kind === 'import' || receipt.kind === 'restore' || receipt.kind === 'reset')
  ) {
    const gate = await gateNutritionLedgerProofLock(input.adapter, receipt);
    if (gate !== null) return gate;
  }
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
