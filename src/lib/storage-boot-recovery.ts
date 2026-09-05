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
import {
  combineCoreWithHistory,
  HYBRID_CORE_BACKUP_SUFFIX,
  parsePhysicalEnvelope,
  saveHybridCoreResult,
  toPersistedCoreState,
} from './storage-hybrid';
import {
  EMPTY_GENERATION_DIGEST,
  verifyHistoryGeneration,
} from './storage-history-integrity';
import { STORAGE_BACKUP_SUFFIX } from './storage';
import type { StorageLike, PersistedState, PersistedCoreState, StorageEnvelope } from './storage-types';
import { isRecord, parseEnvelope } from './storage-validation';
import { recoverStorageRetirementJournal } from './storage-retirement-journal';
import { normalizeSessionState } from './workout-session-migration';
import type { WorkoutSession } from '../types';

// ---------------------------------------------------------------------------
// GOAL-17B-002D-D1 — recuperação administrativa ANTES da hidratação
//
// Este módulo é o único orquestrador de boot: ele despacha a recuperação
// administrativa pelo `kind` do receipt e responde se a hidratação
// pode começar? Ele não renderiza, não conhece React, não importa o Provider,
// não cria geração e não inicia importação, restore ou reset. Os commits
// continuam deliberadamente sem call site neste arquivo.
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

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = canonicalizeValue(item);
      return normalized === undefined ? null : normalized;
    });
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .flatMap((key) => {
          const normalized = canonicalizeValue(record[key]);
          return normalized === undefined ? [] : [[key, normalized]];
        }),
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

export function verifyStableIdentityCompatibility(
  backupUser: unknown,
  coreUser: unknown,
  backupData?: PersistedState,
  coreData?: PersistedCoreState,
): boolean {
  if (isRecord(backupUser) && isRecord(coreUser)) {
    const bId = typeof backupUser.id === 'string' && backupUser.id.trim().length > 0 ? backupUser.id.trim() : null;
    const cId = typeof coreUser.id === 'string' && coreUser.id.trim().length > 0 ? coreUser.id.trim() : null;
    if (bId !== null && cId !== null && bId !== cId) {
      return false;
    }

    const bEmail = typeof backupUser.email === 'string' && backupUser.email.trim().length > 0
      ? backupUser.email.trim().toLowerCase()
      : null;
    const cEmail = typeof coreUser.email === 'string' && coreUser.email.trim().length > 0
      ? coreUser.email.trim().toLowerCase()
      : null;
    if (bEmail !== null && cEmail !== null && bEmail !== cEmail) {
      return false;
    }

    const bName = typeof backupUser.name === 'string' && backupUser.name.trim().length > 0
      ? backupUser.name.trim()
      : null;
    const cName = typeof coreUser.name === 'string' && coreUser.name.trim().length > 0
      ? coreUser.name.trim()
      : null;
    if (bName !== null && cName !== null && bName !== cName) {
      return false;
    }

    // Sinal positivo obrigatório: pelo menos um identificador de identidade de usuário
    // presente em ambos deve coincidir positivamente.
    const hasPositiveMatch = (bId !== null && cId !== null && bId === cId)
      || (bEmail !== null && cEmail !== null && bEmail === cEmail)
      || (bName !== null && cName !== null && bName === cName);

    return hasPositiveMatch;
  }

  // Se um possui usuário identificado e o outro não, há quebra de continuidade de identidade
  if ((backupUser !== null && backupUser !== undefined) !== (coreUser !== null && coreUser !== undefined)) {
    return false;
  }

  // Ambos são anônimos / nulos (pré-onboarding). Avaliar âncoras estáveis secundárias de domínio
  if (backupData && coreData) {
    const bGymId = backupData.gymProfile?.activeProfileId;
    const cGymId = coreData.gymProfile?.activeProfileId;
    if (bGymId && cGymId && bGymId === cGymId) {
      return true;
    }
    // Se ambos tiverem arrays vazios em domínios estruturais iniciais
    if (
      Array.isArray(backupData.weeklyPlan) && backupData.weeklyPlan.length === 0
      && Array.isArray(coreData.weeklyPlan) && coreData.weeklyPlan.length === 0
    ) {
      return true;
    }
  }

  return false;
}

export interface VerifyV1PredecessorOptions {
  backupSavedAt?: string;
  coreSavedAt?: string;
}

function isStorageEnvelope<T>(val: unknown): val is StorageEnvelope<T> {
  return isRecord(val)
    && typeof (val as Record<string, unknown>).v === 'number'
    && typeof (val as Record<string, unknown>).savedAt === 'string'
    && 'data' in val;
}

export function verifyV1PredecessorOfV2(
  backup: StorageEnvelope<PersistedState> | PersistedState,
  core: StorageEnvelope<PersistedCoreState> | PersistedCoreState,
  options?: VerifyV1PredecessorOptions,
): boolean {
  if (!isRecord(backup) || !isRecord(core)) return false;

  const backupEnvelope = isStorageEnvelope<PersistedState>(backup) ? backup : null;
  const coreEnvelope = isStorageEnvelope<PersistedCoreState>(core) ? core : null;

  const backupData = backupEnvelope ? backupEnvelope.data : (backup as PersistedState);
  const coreData = coreEnvelope ? coreEnvelope.data : (core as PersistedCoreState);

  if (!isRecord(backupData) || !isRecord(coreData)) return false;

  // 1. Versões estruturais de envelope
  const backupV = backupEnvelope ? backupEnvelope.v : 1;
  const coreV = coreEnvelope ? coreEnvelope.v : 2;
  if (backupV !== 1 || coreV !== 2) return false;

  // 2. Coerência temporal quando savedAt estiver disponível
  const backupSavedAt = backupEnvelope ? backupEnvelope.savedAt : options?.backupSavedAt;
  const coreSavedAt = coreEnvelope ? coreEnvelope.savedAt : options?.coreSavedAt;

  if (backupSavedAt !== undefined || coreSavedAt !== undefined) {
    if (typeof backupSavedAt !== 'string' || typeof coreSavedAt !== 'string') {
      return false;
    }
    const bTs = Date.parse(backupSavedAt);
    const cTs = Date.parse(coreSavedAt);
    if (Number.isNaN(bTs) || Number.isNaN(cTs)) {
      return false;
    }
    // O predecessor não pode ser posterior ao core do qual descende
    if (bTs > cTs) {
      return false;
    }
  }

  // 3. historyStorage referenciado no core e ausente no backup
  if (!isRecord(coreData.historyStorage)) return false;
  if (coreData.historyStorage.backend !== 'indexeddb') return false;
  if (coreData.historyStorage.schemaVersion !== 1) return false;
  if (
    typeof coreData.historyStorage.generationId !== 'string'
    || coreData.historyStorage.generationId.trim().length === 0
  ) {
    return false;
  }

  if (
    'historyStorage' in backupData
    && backupData.historyStorage !== undefined
    && backupData.historyStorage !== null
  ) {
    return false;
  }

  // 4. workoutHistory no backup deve ser array estruturado
  if (!Array.isArray(backupData.workoutHistory)) return false;
  const sessionsValid = backupData.workoutHistory.every(
    (s) => isRecord(s)
      && typeof s.id === 'string'
      && s.id.trim().length > 0
      && (s.date === undefined || typeof s.date === 'string')
      && (s.name === undefined || typeof s.name === 'string'),
  );
  if (!sessionsValid) return false;

  // 5. Prova positiva de mesma linhagem/identidade estável
  if (!verifyStableIdentityCompatibility(backupData.user, coreData.user, backupData, coreData)) {
    return false;
  }

  return true;
}

export function verifyBackupV1Lineage(
  backupData: PersistedState,
  core: PersistedCoreState,
): boolean {
  return verifyV1PredecessorOfV2(backupData, core);
}

async function attemptSafeBootReconciliation(
  input: StorageBootRecoveryInput & {
    runtime: StorageAdminRuntime;
    raw: string;
    core: PersistedCoreState;
  },
): Promise<StorageBootRecoveryOutcome | null> {
  const { raw, core } = input;
  const targetGenId = core.historyStorage?.generationId;
  if (!targetGenId || typeof targetGenId !== 'string') return null;

  let available = false;
  try {
    if (typeof input.adapter?.isAvailable === 'function') {
      available = await input.adapter.isAvailable();
    }
  } catch {
    return null;
  }
  if (!available) return null;

  try {
    await input.adapter.open();
  } catch {
    return null;
  }

  let adminSnapshot;
  try {
    adminSnapshot = await input.adapter.readStorageAdministrationSnapshot();
  } catch {
    return null;
  }
  if (
    !adminSnapshot
    || adminSnapshot.unsettledOperations.length > 0
    || adminSnapshot.pendingCompletionReceipts.length > 0
  ) {
    return null;
  }

  let provenSessions: WorkoutSession[] | null = null;
  let candidateBackupRaw: string | null = null;

  // Candidato 1: a geração targetGenId existe fisicamente e passa na verificação integral
  try {
    const genSnapshot = await input.adapter.readHistoryGenerationSnapshot(targetGenId);
    if (genSnapshot.present) {
      const verification = await verifyHistoryGeneration(targetGenId, genSnapshot);
      if (verification.status === 'verified') {
        provenSessions = verification.sessions;
      }
    }
  } catch {
    // Continua
  }

  // Candidato 2: snapshot legado verificado em LEGACY_SNAPSHOTS_STORE
  if (provenSessions === null) {
    try {
      const legacy = await input.adapter.readLegacySnapshot();
      if (legacy?.verified) {
        const parsedLegacy = parseEnvelope<PersistedState>(legacy.raw);
        if (parsedLegacy.status === 'ok') {
          provenSessions = parsedLegacy.envelope.data.workoutHistory ?? [];
        }
      }
    } catch {
      // Continua
    }
  }

  // Candidato 3: manifest explícito de histórico vazio para targetGenId
  if (provenSessions === null) {
    try {
      const manifest = await input.adapter.readGenerationManifest(targetGenId);
      if (
        manifest
        && manifest.verified
        && manifest.sessionCount === 0
        && manifest.orderedDigest === EMPTY_GENERATION_DIGEST
      ) {
        provenSessions = [];
      }
    } catch {
      // Continua
    }
  }

  // Candidato 4: VERIFIED_LOCAL_V1_BACKUP
  // Avaliado somente após as fontes físicas do IndexedDB não fornecerem prova.
  // Lê o backup v1 em localStorage, valida formato, prova predecessor legítimo
  // do core v2 atual e deriva as sessões comprovadas.
  if (provenSessions === null) {
    try {
      const backupKey = `${input.key}${STORAGE_BACKUP_SUFFIX}`;
      const rawBackup = input.storage.getItem(backupKey);
      if (typeof rawBackup === 'string') {
        const physicalBackup = parsePhysicalEnvelope(rawBackup);
        const physicalCore = parsePhysicalEnvelope(raw);
        if (physicalBackup.status === 'v1' && physicalCore.status === 'v2') {
          if (verifyV1PredecessorOfV2(physicalBackup.envelope, physicalCore.envelope)) {
            const backupData = physicalBackup.envelope.data;
            const normalized = normalizeSessionState({
              activeWorkout: backupData.activeWorkout ?? null,
              activeWorkoutStartedAt: backupData.activeWorkoutStartedAt ?? null,
              workoutHistory: backupData.workoutHistory,
            });
            provenSessions = normalized.workoutHistory;
            candidateBackupRaw = rawBackup;
          }
        }
      }
    } catch {
      // Continua fail-closed
    }
  }

  // Se nenhuma fonte puder ser comprovada, recusa recuperação automática (Regra 10: ausência física continua sendo ausência)
  if (provenSessions === null) {
    return null;
  }

  // Reconciliação (Regra 9): prepare -> verify -> activate -> reread -> confirm
  try {
    // 1. Confirmar backup físico v1 existente se reconciliando via backup local v1 (Regra 9)
    if (candidateBackupRaw !== null) {
      const v1BackupKey = `${input.key}${STORAGE_BACKUP_SUFFIX}`;
      if (input.storage.getItem(v1BackupKey) !== candidateBackupRaw) {
        return null;
      }
    }

    // 2. Preservar cópia física verificável do estado atual antes da mutação (Regra 11)
    const backupKey = `${input.key}${HYBRID_CORE_BACKUP_SUFFIX}`;
    input.storage.setItem(backupKey, raw);
    if (input.storage.getItem(backupKey) !== raw) {
      return null;
    }

    // Se provido pelo backup local v1, também persiste o snapshot legado comprovado no adapter
    if (candidateBackupRaw !== null && typeof input.adapter.saveLegacySnapshot === 'function') {
      try {
        await input.adapter.saveLegacySnapshot(candidateBackupRaw);
      } catch {
        // Continua
      }
    }

    // Tentar ativação direta se a geração já estiver presente e com marker válido
    let activeGenId = targetGenId;
    let activatedDirectly = false;
    const hasTarget = typeof input.adapter.hasHistoryGeneration === 'function'
      ? await input.adapter.hasHistoryGeneration(targetGenId)
      : false;

    if (hasTarget) {
      try {
        await input.adapter.writeMetadata({ migrationGeneration: targetGenId });
        await input.adapter.activateHistoryGeneration(targetGenId);
        await input.adapter.writeMetadata({
          migrationGeneration: null,
          migrationStatus: 'completed',
          migratedAt: new Date().toISOString(),
          sourceStorageVersion: 2,
        });
        activatedDirectly = true;
      } catch {
        await input.adapter.writeMetadata({ migrationGeneration: null }).catch(() => undefined);
        activatedDirectly = false;
      }
    }

    if (!activatedDirectly) {
      await input.adapter.writeMetadata({ migrationGeneration: null }).catch(() => undefined);
      // Preparar nova geração com as sessões comprovadas
      const newGenId = await input.adapter.prepareHistoryGeneration(provenSessions);
      const newGenSnapshot = await input.adapter.readHistoryGenerationSnapshot(newGenId);
      const newVerification = await verifyHistoryGeneration(newGenId, newGenSnapshot);
      if (newVerification.status !== 'verified') {
        return null;
      }
      await input.adapter.activateHistoryGeneration(newGenId);
      await input.adapter.writeMetadata({
        migrationGeneration: null,
        migrationStatus: 'completed',
        migratedAt: new Date().toISOString(),
        sourceStorageVersion: 2,
      });
      activeGenId = newGenId;

      // Atualizar localStorage core com readback confirmado
      const updatedCore = toPersistedCoreState(
        combineCoreWithHistory(core, provenSessions),
        activeGenId,
      );
      const saveResult = saveHybridCoreResult(input.key, updatedCore, input.storage);
      if (!saveResult.ok) {
        return null;
      }
    }

    // Reread e confirm
    const finalMeta = await input.adapter.readMetadata();
    if (
      finalMeta.activeGeneration !== activeGenId
      || finalMeta.migrationGeneration !== null
      || finalMeta.migrationStatus !== 'completed'
    ) {
      return null;
    }

    const finalAdmin = await input.runtime.inspectStorageAdministration();
    if (finalAdmin.state.status !== 'ready') {
      return null;
    }

    return ready('ready-after-settled', false);
  } catch {
    return null;
  }
}

async function classifyInitialAdministrationUnavailable(
  result: Record<string, unknown>,
  input: StorageBootRecoveryInput,
  runtime: StorageAdminRuntime,
): Promise<StorageBootRecoveryOutcome> {
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
    const reconciled = await attemptSafeBootReconciliation({
      ...input,
      runtime,
      raw,
      core: physical.envelope.data,
    });
    if (reconciled) return reconciled;
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
function hasRetirementJournalReader(
  adapter: AdministrableWorkoutHistoryStorageAdapter,
): adapter is AdministrableWorkoutHistoryStorageAdapter & {
  readStorageRetirementJournal(): Promise<unknown>;
} {
  return typeof (adapter as { readStorageRetirementJournal?: unknown }).readStorageRetirementJournal
    === 'function';
}

async function classifyPersistedRetirementJournal(
  adapter: AdministrableWorkoutHistoryStorageAdapter,
): Promise<StorageBootRecoveryOutcome | null> {
  if (!hasRetirementJournalReader(adapter)) return null;
  let raw: unknown;
  try {
    raw = await adapter.readStorageRetirementJournal();
  } catch {
    return blocked('blocked-administration-conflicted');
  }
  if (raw === null || raw === undefined) return null;

  let fingerprint: string | undefined;
  try {
    fingerprint = (await adapter.readStorageAdministrationSnapshot()).fingerprint;
  } catch {
    return blocked('blocked-administration-conflicted');
  }

  const recovered = recoverStorageRetirementJournal(raw, fingerprint);
  if (recovered.status === 'recorded' || recovered.status === 'absent') return null;
  return blocked('blocked-administration-conflicted');
}

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
      return classifyInitialAdministrationUnavailable(result, input, runtime);
    }
    const classified = classifyStorageBootRecovery(result);
    if (classified.hydrationAllowed !== true) return classified;
    const journalBlock = await classifyPersistedRetirementJournal(input.adapter);
    return journalBlock ?? classified;
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
