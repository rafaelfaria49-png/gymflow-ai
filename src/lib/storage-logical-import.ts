import type {
  AdministrableWorkoutHistoryStorageAdapter,
  HistoryStorageMetadata,
} from './storage-adapter';
import type { StorageAdminRuntime } from './storage-admin-runtime';
import {
  StorageAdministrationConflictError,
  StorageAdministrationUnavailableError,
  StorageCompletionPendingError,
  StorageOperationAlreadyInProgressError,
  StorageOperationBeginConflictError,
  StorageOperationTransitionConflictError,
} from './storage-admin-runtime';
import {
  HYBRID_CORE_BACKUP_SUFFIX,
  parsePhysicalEnvelope,
  toPersistedCoreState,
} from './storage-hybrid';
import {
  computeOrderedHistoryDigest,
  HistoryDigestCryptoUnavailableError,
  workoutHistoriesMatch,
} from './storage-history-integrity';
import {
  inspectLogicalStorageBackupV2,
  isCanonicalIsoInstant,
  type LogicalBackupInspectionFailureReason,
  type LogicalBackupPreview,
} from './storage-logical-backup';
import type { StorageOperationReceipt } from './storage-operation-receipt';
import {
  HYBRID_STORAGE_VERSION,
  type PersistedCoreState,
  type StorageEnvelope,
  type StorageLike,
} from './storage-types';

// Importação LÓGICA v2 atômica — GOAL-17B-002D-C, slice C1.
//
// O slice B entrega um arquivo v2 que pode ser gerado e conferido, e nada mais:
// `commitStorageImport` só aceita o envelope v1 monolítico, então o usuário v2
// tinha um backup verificável e inútil para restaurar (17B-002D-B-P4). Este
// módulo é o coordenador que faltava.
//
// O QUE ELE É: uma função programática que recebe o CONTEÚDO BRUTO de um
// arquivo v2, reinspeciona esse conteúdo do zero, cria uma geração física nova
// para o histórico importado, registra cada passo num journal durável, ativa a
// geração com CAS e só então troca o core v2 do `localStorage` — byte a byte
// pelo mesmo `targetCoreRaw` que o journal já havia prometido.
//
// O QUE ELE NÃO É: não existe seletor de arquivo, download, upload, modal,
// toast, Provider, Context, AdminPanel nem call site. Não há recuperação no
// boot: `resolveLogicalImportRecovery` é PURO e apenas DECIDE o que fazer — quem
// executa a decisão depois de um reload é o slice C2, e quem liga isso ao boot é
// o D.
//
// MODELO DE CONSISTÊNCIA, SEM PROMESSA FALSA. Não existe atomicidade única
// entre `localStorage` e IndexedDB, e este módulo não finge que existe. O que
// existe é: cada escrita isolada é atômica e verificável por readback; o journal
// nomeia os DOIS mundos completos (`previousCoreRaw` + `previousGenerationId` e
// `targetCoreRaw` + `stagedGenerationId`) antes de qualquer efeito; e a ordem
// escolhida — geração primeiro, core por último — reduz a janela em que os dois
// motores discordam a uma única escrita síncrona de `localStorage`.
//
// POR QUE GERAÇÃO ANTES DO CORE. `metadataMatchesV2` (storage-hybrid) exige
// `activeGeneration === core.historyStorage.generationId` e
// `migrationGeneration === null` para hidratar. Qualquer ordem deixa uma janela
// em que os dois discordam. Gravando a geração primeiro, todas as escritas
// protegidas por CAS acontecem antes da única escrita sem CAS (o
// `localStorage`), e essa última é a mais barata de repetir (gravar o mesmo raw
// duas vezes dá o mesmo raw) e a mais barata de desfazer (gravar de volta o raw
// anterior, que está inteiro no journal). A ordem inversa colocaria a escrita
// fraca no meio e exigiria desfazê-la depois de uma falha do lado forte.
//
// O QUE A COMPENSAÇÃO NÃO DESFAZ (corretivo 055). A cópia rolante do core é
// AUXILIAR; o estado canônico é a chave principal mais a geração ativa. Depois
// que esta operação grava `previousCoreRaw` na cópia, esse valor JÁ é um backup
// válido do estado anterior, então nenhuma falha posterior exige devolver a
// cópia ao valor mais antigo. A restauração incondicional que existia aqui era
// insegura: entre a leitura e a compensação outra aba pode ter atualizado a
// cópia, e reescrever "o valor de antes" apagaria um backup mais novo — ou
// recriaria, com `removeItem`, uma ausência que já não existe. Uma importação
// abortada pode portanto deixar a cópia rolante atualizada para
// `previousCoreRaw`, e isso é seguro porque esse raw é exatamente o estado
// canônico anterior, verificado no W0 e guardado inteiro no journal.

const IMPORT_OPERATION_KIND = 'import' as const;

// Motivos fechados. `administration-*`, `snapshot-changed-during-import` e
// `crypto-unavailable` espelham deliberadamente os nomes já usados pelo slice B
// (`LogicalBackupExportFailureReason`); `quota` e `storage-unavailable`
// espelham `StorageWriteFailureReason`.
export type LogicalImportFailureReason =
  | 'invalid-backup'
  | 'unsupported-version'
  | 'unsupported-schema'
  | 'administration-unavailable'
  | 'administration-conflicted'
  | 'administration-interrupted'
  | 'migration-incomplete'
  | 'operation-conflict'
  | 'snapshot-changed-during-import'
  | 'staging-failed'
  | 'verification-failed'
  | 'activation-failed'
  | 'core-commit-failed'
  | 'readback-failed'
  | 'recovery-required'
  | 'storage-unavailable'
  | 'quota'
  | 'crypto-unavailable';

// O que aconteceu com o receipt depois de uma falha. `failed` NUNCA é relatado
// como `reverted`: um receipt preso em aberto bloqueia todo begin futuro e quem
// chamou precisa saber disso.
export type LogicalImportCompensation = 'not-attempted' | 'not-needed' | 'reverted' | 'failed';

export interface LogicalImportSuccess {
  ok: true;
  operationId: string;
  generationId: string;
  previousGenerationId: string;
  payloadDigest: string;
  sessionCount: number;
  savedAt: string;
  preview: LogicalBackupPreview;
}

export interface LogicalImportFailure {
  ok: false;
  reason: LogicalImportFailureReason;
  // Sempre uma constante DESTE módulo. Nunca uma mensagem nativa de
  // `JSON.parse`, nunca texto vindo do arquivo, nunca conteúdo do usuário.
  error: string;
  operationId: string | null;
  generationId: string | null;
  // Motivo interno da inspeção do slice B, quando a recusa veio de lá. É uma
  // união fechada e não carrega conteúdo do arquivo.
  backupReason: LogicalBackupInspectionFailureReason | null;
  compensation: LogicalImportCompensation;
  // Só falha de infraestrutura confiável (armazenamento, Web Crypto, fachada
  // administrativa). Nunca um erro originado no conteúdo do arquivo.
  cause?: unknown;
}

export type LogicalStorageImportV2Result = LogicalImportSuccess | LogicalImportFailure;

// A importação precisa de três capacidades da fachada A2 e de oito primitivas do
// adapter. Declarar os subconjuntos em vez dos contratos inteiros torna
// impossível — no compilador, não por disciplina — chamar `replaceHistory`,
// `appendSession`, `deleteSession`, `writeMetadata` ou qualquer outra escrita
// que não pertença a este fluxo.
export type LogicalImportRuntime = Pick<
  StorageAdminRuntime,
  'inspectStorageAdministration' | 'beginStorageOperation' | 'transitionStorageOperation'
>;

export type LogicalImportAdapter = Pick<
  AdministrableWorkoutHistoryStorageAdapter,
  | 'readMetadata'
  | 'stageHistoryGenerationForOperation'
  | 'readVerifiedHistoryGeneration'
  | 'rollbackToHistoryGeneration'
  | 'transitionStorageOperationIfUnambiguous'
  | 'revertStorageOperationAfterTransitionConflict'
  | 'readStorageOperationReceipt'
  | 'clearInactiveGeneration'
>;

export interface CommitLogicalStorageImportV2Input {
  // Conteúdo BRUTO do arquivo. Não existe variante que aceite payload já
  // validado: um objeto de inspeção é forjável, e aceitá-lo transferiria a
  // confiança para o chamador.
  raw: string;
  runtime: LogicalImportRuntime;
  adapter: LogicalImportAdapter;
  storage: StorageLike;
  key: string;
  declaredBytes?: number;
  // Amarração anti-TOCTOU com uma inspeção anterior (o preview que o 002D-E vai
  // mostrar). Divergência recusa ANTES do primeiro write.
  expectedPayloadDigest?: string;
  now?: () => Date;
  // Injeção permitida apenas para teste; em produção `sha256Checksum` já usa o
  // Web Crypto global.
  subtleCrypto?: SubtleCrypto | null;
}

// ---------------------------------------------------------------------------
// Mensagens constantes
// ---------------------------------------------------------------------------

const MESSAGES = {
  invalidBackup: 'O arquivo de backup lógico v2 foi recusado pela inspeção.',
  digestMismatch: 'O digest do payload não corresponde ao digest esperado pelo chamador.',
  unsupportedVersion: 'Versão de formato ou de origem física não suportada.',
  unsupportedSchema: 'Versão de esquema lógico não suportada.',
  administrationUnavailable: 'O armazenamento administrativo não está disponível para importar.',
  administrationConflicted: 'O estado administrativo está ambíguo demais para importar.',
  administrationInterrupted: 'Existe uma operação administrativa em aberto.',
  migrationIncomplete: 'A migração física para o formato v2 não está concluída.',
  operationConflict: 'Outra operação administrativa ou conclusão de treino bloqueia a importação.',
  snapshotChanged: 'O armazenamento mudou durante a importação.',
  coreNotV2: 'O core físico observado não é um envelope v2 coerente com a geração ativa.',
  beginReadbackFailed: 'O receipt inicial da importação não passou no readback.',
  stagingFailed: 'A preparação da geração importada falhou.',
  stagingReadbackFailed: 'O receipt não confirmou a geração preparada.',
  verificationFailed: 'A geração preparada não corresponde ao histórico do arquivo.',
  targetCoreInvalid: 'O core alvo da importação não forma um envelope físico v2 válido.',
  targetCoreTimestamp: 'O instante de gravação do core alvo não é um instante UTC canônico.',
  targetCoreReadbackFailed: 'O receipt não confirmou o core alvo da importação.',
  activationFailed: 'A ativação da geração importada falhou.',
  coreUnreadable: 'O core físico ficou ilegível durante a importação.',
  coreChangedBeforeCommit: 'O core físico mudou antes da gravação da importação.',
  coreBackupFailed: 'A cópia rolante do core anterior não pôde ser confirmada.',
  coreWriteFailed: 'A gravação do core importado falhou.',
  coreQuota: 'O armazenamento local não tem espaço para o core importado.',
  coreReadbackDiverged: 'O readback do core importado divergiu da gravação.',
  coreAmbiguous: 'O resultado da gravação do core é ambíguo; o journal foi preservado.',
  finalVerificationFailed: 'A verificação final da importação não pôde ser comprovada.',
  markActivatedFailed: 'A operação não pôde ser marcada como aplicada.',
  settleFailed: 'A operação não pôde ser liquidada.',
  finalStateNotReady: 'O estado administrativo final não voltou a ser utilizável.',
  cryptoUnavailable: 'Web Crypto indisponível: a importação não pode ser conferida sem digest.',
} as const;

// Motivos passados às primitivas de compensação. Só diagnóstico, nunca core
// bruto.
const REVERT_REASONS = {
  beforeStaging: 'logical-import-v2:before-staging',
  afterStaging: 'logical-import-v2:after-staging',
  beforeActivation: 'logical-import-v2:before-activation',
  afterActivation: 'logical-import-v2:after-activation',
} as const;

// ---------------------------------------------------------------------------
// Resolvedor puro dos estados de recuperação
// ---------------------------------------------------------------------------

export type LogicalImportGenerationIntegrity = 'verified' | 'invalid' | 'unknown';

// Fotografia EXPLÍCITA do mundo. O resolvedor não lê armazenamento nenhum: quem
// o chama é responsável por observar e por declarar honestamente o que
// conseguiu — ou não conseguiu — provar.
export interface LogicalImportObservation {
  receipt: StorageOperationReceipt | null;
  coreRaw: string | null;
  metadata: {
    activeGeneration: string | null;
    migrationGeneration: string | null;
    migrationStatus: HistoryStorageMetadata['migrationStatus'];
  };
  generations: readonly { generationId: string }[];
  // Integridade da geração NOMEADA pelo receipt. `unknown` significa "ainda não
  // verifiquei", e é o que faz o resolvedor pedir `verify-staging`.
  stagedGenerationIntegrity: LogicalImportGenerationIntegrity;
  // Prova de que o mundo alvo inteiro (core + geração ativa + manifest +
  // sessões) corresponde ao que o receipt declarou.
  targetVerification: LogicalImportGenerationIntegrity;
  unsettledOperationCount: number;
  pendingCompletionReceiptCount: number;
}

export type LogicalImportBlockedReason =
  | 'not-an-import'
  | 'multiple-unsettled-operations'
  | 'completion-pending'
  | 'core-missing'
  | 'migration-incomplete'
  | 'unexpected-staging-pointer'
  | 'previous-generation-absent'
  | 'staged-generation-absent'
  | 'core-not-previous'
  | 'active-generation-unexpected'
  | 'staged-with-target-core'
  | 'activating-without-staging'
  | 'activating-without-target-core'
  | 'staged-generation-invalid'
  | 'staged-generation-is-previous'
  | 'target-verification-failed'
  | 'core-target-without-activation'
  | 'unrecognized-world'
  | 'activated-target-missing'
  | 'activated-core-not-target'
  | 'activated-generation-not-active';

// União fechada. `recovery-required` é "o mundo não é contraditório, mas eu não
// consigo provar o suficiente para agir"; `impossible-state` é "este receipt
// descreve algo que não pode ter acontecido". Os dois bloqueiam igualmente — a
// diferença existe para o diagnóstico, não para a decisão.
export type LogicalImportRecoveryDecision =
  | { action: 'no-operation' }
  | { action: 'already-settled'; operationId: string; status: 'settled' | 'reverted' }
  | { action: 'stage-generation'; operationId: string }
  | { action: 'verify-staging'; operationId: string; generationId: string }
  | { action: 'prepare-core'; operationId: string; generationId: string }
  | {
      action: 'activate-generation';
      operationId: string;
      generationId: string;
      previousGenerationId: string;
    }
  | { action: 'commit-core'; operationId: string; generationId: string }
  | { action: 'verify-target'; operationId: string; generationId: string }
  | { action: 'mark-activated'; operationId: string; generationId: string }
  | { action: 'settle'; operationId: string }
  | { action: 'revert-safe'; operationId: string; reason: LogicalImportBlockedReason }
  | { action: 'cleanup-inactive-staging'; operationId: string; generationId: string }
  | { action: 'recovery-required'; reason: LogicalImportBlockedReason }
  | { action: 'impossible-state'; reason: LogicalImportBlockedReason };

function blocked(reason: LogicalImportBlockedReason): LogicalImportRecoveryDecision {
  return { action: 'recovery-required', reason };
}

function impossible(reason: LogicalImportBlockedReason): LogicalImportRecoveryDecision {
  return { action: 'impossible-state', reason };
}

// Função PURA: nenhuma leitura, nenhuma escrita, nenhum relógio, nenhum UUID,
// nenhum log, nenhuma mutação da entrada. Ela responde a uma única pergunta —
// "dado este mundo, qual é a próxima ação legítima desta importação?" — e é
// determinística.
//
// Ela é o análogo, para quem PRODUZ os efeitos, do
// `evaluateStorageOperationCompatibility` do 002D-A2. Aquele avaliador devolve
// `insufficient-evidence` para qualquer mundo `activating` já aplicado, porque o
// A2 não executa ativação e por isso não pode atestar que os efeitos vieram
// daquela operação. Este resolvedor vive do outro lado: ele conhece a ordem
// exata das escritas, então consegue distinguir "ainda não ativei" de "já ativei
// e falta o core" de "já gravei tudo".
export function resolveLogicalImportRecovery(
  observation: LogicalImportObservation,
): LogicalImportRecoveryDecision {
  const { receipt, coreRaw, metadata, generations } = observation;

  if (receipt === null) return { action: 'no-operation' };
  if (receipt.kind !== IMPORT_OPERATION_KIND) return blocked('not-an-import');
  if (receipt.status === 'settled' || receipt.status === 'reverted') {
    return { action: 'already-settled', operationId: receipt.operationId, status: receipt.status };
  }
  if (observation.unsettledOperationCount > 1) return blocked('multiple-unsettled-operations');
  // Reverter reduziria o conflito, mas avançar uma importação com conclusão de
  // treino pendente misturaria dois fluxos que o projeto mantém isolados.
  if (observation.pendingCompletionReceiptCount > 0) return blocked('completion-pending');
  if (coreRaw === null) return blocked('core-missing');
  if (metadata.migrationStatus !== 'completed') return blocked('migration-incomplete');
  // Esta importação nunca preenche o ponteiro de staging. Um valor aqui é obra
  // de outro fluxo, e escolher o que fazer seria chute.
  if (metadata.migrationGeneration !== null) return blocked('unexpected-staging-pointer');

  const known = new Set(generations.map((entry) => entry.generationId));
  if (!known.has(receipt.previousGenerationId)) return impossible('previous-generation-absent');

  const staged = receipt.stagedGenerationId;
  const target = receipt.targetCoreRaw;
  const coreIsPrevious = coreRaw === receipt.previousCoreRaw;
  const coreIsTarget = target !== null && coreRaw === target;
  const activeIsPrevious = metadata.activeGeneration === receipt.previousGenerationId;
  const activeIsStaged = staged !== null && metadata.activeGeneration === staged;

  if (staged !== null && !known.has(staged)) return impossible('staged-generation-absent');
  // A geração preparada é sempre NOVA: `stageHistoryGenerationForOperation`
  // recusa colidir com a ativa e o readback do W2 recusa
  // `generationId === previousGenerationId`. Um receipt que nomeia a geração
  // anterior como preparada descreve algo que esta ordem de escrita não produz —
  // e avançar sobre ele gravaria um core alvo apontando para o mundo antigo.
  if (staged !== null && staged === receipt.previousGenerationId) {
    return impossible('staged-generation-is-previous');
  }

  if (receipt.status === 'staged') {
    // `staged` afirma que NADA foi aplicado. Qualquer efeito visível aqui é
    // contradição, não progresso.
    if (target !== null) return impossible('staged-with-target-core');
    if (!activeIsPrevious) return blocked('active-generation-unexpected');
    if (!coreIsPrevious) {
      // O core alheio não é desfeito; a operação apenas se encerra.
      return { action: 'revert-safe', operationId: receipt.operationId, reason: 'core-not-previous' };
    }
    if (staged === null) return { action: 'stage-generation', operationId: receipt.operationId };
    if (observation.stagedGenerationIntegrity === 'unknown') {
      return { action: 'verify-staging', operationId: receipt.operationId, generationId: staged };
    }
    if (observation.stagedGenerationIntegrity === 'invalid') {
      // A geração preparada é lixo e foi criada por ESTA operação: apagá-la não
      // toca em nada do usuário.
      return { action: 'cleanup-inactive-staging', operationId: receipt.operationId, generationId: staged };
    }
    return { action: 'prepare-core', operationId: receipt.operationId, generationId: staged };
  }

  if (receipt.status === 'activating') {
    if (staged === null) return impossible('activating-without-staging');
    if (target === null) return impossible('activating-without-target-core');

    if (coreIsPrevious && activeIsPrevious) {
      return {
        action: 'activate-generation',
        operationId: receipt.operationId,
        generationId: staged,
        previousGenerationId: receipt.previousGenerationId,
      };
    }
    if (coreIsPrevious && activeIsStaged) {
      return { action: 'commit-core', operationId: receipt.operationId, generationId: staged };
    }
    if (coreIsTarget && activeIsStaged) {
      if (observation.targetVerification === 'unknown') {
        return { action: 'verify-target', operationId: receipt.operationId, generationId: staged };
      }
      if (observation.targetVerification === 'invalid') return blocked('target-verification-failed');
      return { action: 'mark-activated', operationId: receipt.operationId, generationId: staged };
    }
    // O core alvo sem ativação não pode nascer desta ordem de escrita.
    if (coreIsTarget && activeIsPrevious) return blocked('core-target-without-activation');
    return blocked('unrecognized-world');
  }

  // `activated` afirma efeitos completos: ou eles estão todos lá, ou o receipt
  // está mentindo e ninguém avança sobre isso.
  if (staged === null || target === null) return impossible('activated-target-missing');
  if (!activeIsStaged) return blocked('activated-generation-not-active');
  if (!coreIsTarget) return blocked('activated-core-not-target');
  return { action: 'settle', operationId: receipt.operationId };
}

// ---------------------------------------------------------------------------
// Leitura e escrita do core
// ---------------------------------------------------------------------------

// A causa nativa de uma leitura que falhou NÃO é capturada. A mensagem de um
// `getItem` que estourou é texto do ambiente — em teste, texto do chamador — e
// o contrato público deste módulo só devolve constantes daqui. O que importa
// para decidir é apenas se a leitura pôde ser provada.
type RawRead = { ok: true; raw: string | null } | { ok: false };

function readRaw(storage: StorageLike, key: string): RawRead {
  try {
    return { ok: true, raw: storage.getItem(key) };
  } catch {
    return { ok: false };
  }
}

// Classificação local do erro de escrita. `storage.ts` tem uma equivalente, mas
// ela é privada daquele módulo e `storage.ts` está fora da allowlist deste
// slice; duplicar esta função é melhor do que abrir um arquivo que este GOAL
// não pode tocar.
//
// Só sinais ESTRUTURAIS classificam quota (corretivo 055). A mensagem é texto
// livre e, num erro que veio do `StorageLike` do chamador, é texto que o
// chamador controla: aceitar `message.includes('quota')` transformava qualquer
// `TypeError`, `AbortError` ou erro genérico numa falha de espaço e mentia
// sobre a causa real — inclusive devolvendo `reason: 'quota'` para uma falha
// que nada tem a ver com armazenamento cheio.
const QUOTA_ERROR_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);

// Códigos legados de `DOMException`: 22 é `QUOTA_EXCEEDED_ERR` e 1014 é o
// `NS_ERROR_DOM_QUOTA_REACHED` do Firefox. Eles só são consultados num
// `DOMException` de verdade — um objeto qualquer com `code: 22` não é sinal.
const QUOTA_LEGACY_CODES = new Set([22, 1014]);

function isQuotaFailure(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return QUOTA_ERROR_NAMES.has(error.name) || QUOTA_LEGACY_CODES.has(error.code);
  }
  return error instanceof Error && QUOTA_ERROR_NAMES.has(error.name);
}

// ---------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------

function failure(input: {
  reason: LogicalImportFailureReason;
  error: string;
  operationId?: string | null;
  generationId?: string | null;
  backupReason?: LogicalBackupInspectionFailureReason | null;
  compensation?: LogicalImportCompensation;
  cause?: unknown;
}): LogicalImportFailure {
  const result: LogicalImportFailure = {
    ok: false,
    reason: input.reason,
    error: input.error,
    operationId: input.operationId ?? null,
    generationId: input.generationId ?? null,
    backupReason: input.backupReason ?? null,
    compensation: input.compensation ?? 'not-attempted',
  };
  return input.cause === undefined ? result : { ...result, cause: input.cause };
}

// Tradução do motivo interno da inspeção do slice B para o motivo público desta
// etapa. Nenhuma mensagem do slice B é repassada: o texto sai sempre daqui.
function reasonForInspection(
  reason: LogicalBackupInspectionFailureReason,
): { reason: LogicalImportFailureReason; error: string } {
  if (reason === 'unsupported-version') {
    return { reason: 'unsupported-version', error: MESSAGES.unsupportedVersion };
  }
  if (reason === 'unsupported-schema') {
    return { reason: 'unsupported-schema', error: MESSAGES.unsupportedSchema };
  }
  if (reason === 'crypto-unavailable') {
    return { reason: 'crypto-unavailable', error: MESSAGES.cryptoUnavailable };
  }
  return { reason: 'invalid-backup', error: MESSAGES.invalidBackup };
}

interface CompensationTargets {
  adapter: LogicalImportAdapter;
  operationId: string;
  expectedStatus: 'staged' | 'activating' | 'activated';
  expectedActiveGenerationId: string;
  reason: string;
}

// Compensação do RECEIPT. Nunca apaga, nunca faz `put` cego: usa a primitiva
// dedicada, que só sabe levar para `reverted`. O CAS da geração ativa é mantido
// de propósito — se o mundo físico ainda não voltou ao lugar, a reversão precisa
// FALHAR em vez de encerrar uma operação sobre um estado divergente.
async function revertReceipt(targets: CompensationTargets): Promise<LogicalImportCompensation> {
  try {
    await targets.adapter.revertStorageOperationAfterTransitionConflict({
      operationId: targets.operationId,
      expectedStatus: targets.expectedStatus,
      expectedActiveGenerationId: targets.expectedActiveGenerationId,
      reason: targets.reason,
    });
    return 'reverted';
  } catch {
    return 'failed';
  }
}

// Limpeza da geração criada por ESTA operação, com guarda tripla: ela precisa
// ser nomeada pelo journal, não pode ser a geração ativa e não pode ser a
// geração anterior. `clearInactiveGeneration` ainda recusa a ativa por conta
// própria — a guarda aqui existe para nunca chegar perto disso.
//
// A geração ANTERIOR nunca é apagada por nenhum caminho deste módulo.
async function cleanupStagedGeneration(
  adapter: LogicalImportAdapter,
  generationId: string | null,
  previousGenerationId: string,
): Promise<void> {
  if (generationId === null) return;
  if (generationId === previousGenerationId) return;
  try {
    const metadata = await adapter.readMetadata();
    if (metadata.activeGeneration === generationId) return;
    await adapter.clearInactiveGeneration(generationId);
  } catch {
    // Órfã preservada: ela não bloqueia diagnóstico nem hidratação, e insistir
    // sobre um armazenamento que já falhou não melhora nada.
  }
}

// Desfaz a ativação. Reutiliza a mesma primitiva verificada da ida, com os
// argumentos trocados: verificação integral da geração anterior, prova canônica
// reconferida dentro da transação e CAS da geração ativa.
async function restorePreviousGeneration(
  adapter: LogicalImportAdapter,
  previousGenerationId: string,
  stagedGenerationId: string,
): Promise<boolean> {
  try {
    const metadata = await adapter.readMetadata();
    if (metadata.activeGeneration === previousGenerationId) return true;
    if (metadata.activeGeneration !== stagedGenerationId) return false;
    await adapter.rollbackToHistoryGeneration({
      targetGenerationId: previousGenerationId,
      expectedActiveGenerationId: stagedGenerationId,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Importa um backup lógico v2 já carregado em memória, de forma jornalizada e
 * recuperável.
 *
 * Sequência (W0–W10): inspecionar o arquivo sem escrever → exigir estado
 * administrativo `ready` → criar o receipt → preparar a geração e amarrá-la ao
 * receipt na mesma transação → verificar a geração contra o payload → gravar o
 * core alvo no journal e ir para `activating` → ativar a geração com CAS →
 * gravar o core byte a byte → verificar tudo → `activated` → `settled` → exigir
 * `ready` de novo. Sucesso só é retornado depois desse último readback.
 */
export async function commitLogicalStorageImportV2(
  input: CommitLogicalStorageImportV2Input,
): Promise<LogicalStorageImportV2Result> {
  const { raw, runtime, adapter, storage, key } = input;
  const now = input.now ?? (() => new Date());

  // -------------------------------------------------------------------------
  // W0 — zero escrita
  // -------------------------------------------------------------------------

  const inspection = await inspectLogicalStorageBackupV2(raw, input.declaredBytes, input.subtleCrypto);
  if (!inspection.ok) {
    const mapped = reasonForInspection(inspection.reason);
    return failure({
      reason: mapped.reason,
      error: mapped.error,
      backupReason: inspection.reason,
      compensation: 'not-needed',
      // Só a indisponibilidade do Web Crypto é infraestrutura confiável; todo o
      // resto nasce do conteúdo do arquivo e não sobe.
      cause: inspection.reason === 'crypto-unavailable' ? inspection.cause : undefined,
    });
  }

  const payload = inspection.backup.payload;
  const payloadDigest = inspection.backup.payloadDigest;

  if (input.expectedPayloadDigest !== undefined && input.expectedPayloadDigest !== payloadDigest) {
    return failure({
      reason: 'invalid-backup',
      error: MESSAGES.digestMismatch,
      compensation: 'not-needed',
    });
  }

  const snapshot = await runtime.inspectStorageAdministration();
  if (snapshot.state.status === 'unavailable') {
    return failure({
      reason: 'administration-unavailable',
      error: MESSAGES.administrationUnavailable,
      compensation: 'not-needed',
      cause: snapshot.state.cause,
    });
  }
  if (snapshot.state.status === 'interrupted') {
    return failure({
      reason: 'administration-interrupted',
      error: MESSAGES.administrationInterrupted,
      operationId: snapshot.state.operation.operationId,
      compensation: 'not-needed',
    });
  }
  if (snapshot.state.status === 'conflicted') {
    return failure({
      reason: 'administration-conflicted',
      error: MESSAGES.administrationConflicted,
      compensation: 'not-needed',
      cause: snapshot.state.cause,
    });
  }

  const previousGenerationId = snapshot.activeGenerationId;
  const previousCoreRaw = snapshot.coreRawObserved;
  if (
    snapshot.physicalStorageVersion !== HYBRID_STORAGE_VERSION
    || previousGenerationId === null
    || previousCoreRaw === null
    || snapshot.administrationFingerprint === null
    || snapshot.activeGenerationIntegrity === null
    || snapshot.activeGenerationIntegrity.status !== 'verified'
  ) {
    return failure({
      reason: 'administration-conflicted',
      error: MESSAGES.administrationConflicted,
      compensation: 'not-needed',
    });
  }
  if (snapshot.unsettledOperations.length !== 0 || snapshot.pendingCompletionReceiptCount !== 0) {
    return failure({
      reason: 'operation-conflict',
      error: MESSAGES.operationConflict,
      compensation: 'not-needed',
    });
  }

  const parsedPrevious = parsePhysicalEnvelope(previousCoreRaw);
  if (
    parsedPrevious.status !== 'v2'
    || parsedPrevious.envelope.data.historyStorage.generationId !== previousGenerationId
  ) {
    return failure({
      reason: 'administration-conflicted',
      error: MESSAGES.coreNotV2,
      compensation: 'not-needed',
    });
  }

  let metadata: HistoryStorageMetadata;
  try {
    metadata = await adapter.readMetadata();
  } catch (cause) {
    return failure({
      reason: 'administration-unavailable',
      error: MESSAGES.administrationUnavailable,
      compensation: 'not-needed',
      cause,
    });
  }
  if (metadata.migrationStatus !== 'completed' || metadata.migrationGeneration !== null) {
    return failure({
      reason: 'migration-incomplete',
      error: MESSAGES.migrationIncomplete,
      compensation: 'not-needed',
    });
  }
  if (metadata.activeGeneration !== previousGenerationId) {
    return failure({
      reason: 'snapshot-changed-during-import',
      error: MESSAGES.snapshotChanged,
      compensation: 'not-needed',
    });
  }

  // -------------------------------------------------------------------------
  // W1 — receipt inicial. Primeiro write da operação.
  // -------------------------------------------------------------------------

  let receipt: StorageOperationReceipt;
  try {
    receipt = await runtime.beginStorageOperation({
      kind: IMPORT_OPERATION_KIND,
      sourceDigest: payloadDigest,
      stagedGenerationId: null,
      targetCoreRaw: null,
    });
  } catch (cause) {
    if (
      cause instanceof StorageOperationAlreadyInProgressError
      || cause instanceof StorageCompletionPendingError
    ) {
      return failure({
        reason: 'operation-conflict',
        error: MESSAGES.operationConflict,
        compensation: 'not-needed',
      });
    }
    if (cause instanceof StorageOperationBeginConflictError) {
      return failure({
        reason: 'snapshot-changed-during-import',
        error: MESSAGES.snapshotChanged,
        operationId: cause.operationId,
        compensation: cause.compensation === 'not-attempted' ? 'not-needed' : cause.compensation,
        cause,
      });
    }
    if (cause instanceof StorageAdministrationUnavailableError) {
      return failure({
        reason: 'administration-unavailable',
        error: MESSAGES.administrationUnavailable,
        compensation: 'not-needed',
        cause,
      });
    }
    if (cause instanceof StorageAdministrationConflictError) {
      return failure({
        reason: 'administration-conflicted',
        error: MESSAGES.administrationConflicted,
        compensation: 'not-needed',
        cause,
      });
    }
    return failure({
      reason: 'administration-unavailable',
      error: MESSAGES.administrationUnavailable,
      compensation: 'not-needed',
      cause,
    });
  }

  const operationId = receipt.operationId;

  const begun = await adapter.readStorageOperationReceipt(operationId).catch(() => null);
  if (
    begun === null
    || begun.kind !== IMPORT_OPERATION_KIND
    || begun.status !== 'staged'
    || begun.sourceDigest !== payloadDigest
    || begun.previousCoreRaw !== previousCoreRaw
    || begun.previousGenerationId !== previousGenerationId
    || begun.stagedGenerationId !== null
    || begun.targetCoreRaw !== null
  ) {
    const compensation = await revertReceipt({
      adapter,
      operationId,
      expectedStatus: 'staged',
      expectedActiveGenerationId: previousGenerationId,
      reason: REVERT_REASONS.beforeStaging,
    });
    return failure({
      reason: 'readback-failed',
      error: MESSAGES.beginReadbackFailed,
      operationId,
      compensation,
    });
  }

  // -------------------------------------------------------------------------
  // W2 — staging atômico: geração nova + patch do receipt na mesma transação.
  // -------------------------------------------------------------------------

  let generationId: string;
  try {
    const staged = await adapter.stageHistoryGenerationForOperation({
      operationId,
      expectedStatus: 'staged',
      expectedKind: IMPORT_OPERATION_KIND,
      expectedActiveGenerationId: previousGenerationId,
      history: payload.workoutHistory,
    });
    generationId = staged.generationId;
  } catch (cause) {
    const compensation = await revertReceipt({
      adapter,
      operationId,
      expectedStatus: 'staged',
      expectedActiveGenerationId: previousGenerationId,
      reason: REVERT_REASONS.beforeStaging,
    });
    return failure({
      reason: 'staging-failed',
      error: MESSAGES.stagingFailed,
      operationId,
      compensation,
      cause,
    });
  }

  // A partir daqui existe uma geração física criada por esta operação. Toda
  // falha compensa o receipt E limpa essa geração.
  const failAfterStaging = async (
    reason: LogicalImportFailureReason,
    error: string,
    expectedStatus: 'staged' | 'activating',
    revertReason: string,
    cause?: unknown,
  ): Promise<LogicalImportFailure> => {
    const compensation = await revertReceipt({
      adapter,
      operationId,
      expectedStatus,
      expectedActiveGenerationId: previousGenerationId,
      reason: revertReason,
    });
    if (compensation === 'reverted') {
      await cleanupStagedGeneration(adapter, generationId, previousGenerationId);
    }
    return failure({ reason, error, operationId, generationId, compensation, cause });
  };

  const afterStaging = await adapter.readStorageOperationReceipt(operationId).catch(() => null);
  if (
    afterStaging === null
    || afterStaging.status !== 'staged'
    || afterStaging.stagedGenerationId !== generationId
    || afterStaging.targetCoreRaw !== null
    || afterStaging.previousCoreRaw !== previousCoreRaw
    || afterStaging.previousGenerationId !== previousGenerationId
    || generationId === previousGenerationId
  ) {
    return failAfterStaging(
      'readback-failed',
      MESSAGES.stagingReadbackFailed,
      'staged',
      REVERT_REASONS.afterStaging,
    );
  }

  // -------------------------------------------------------------------------
  // W3 — verificação integral da geração preparada contra o payload validado.
  // -------------------------------------------------------------------------

  let expectedOrderedDigest: string;
  try {
    expectedOrderedDigest = await computeOrderedHistoryDigest(
      payload.workoutHistory,
      input.subtleCrypto,
    );
  } catch (cause) {
    if (cause instanceof HistoryDigestCryptoUnavailableError) {
      return failAfterStaging(
        'crypto-unavailable',
        MESSAGES.cryptoUnavailable,
        'staged',
        REVERT_REASONS.afterStaging,
        cause,
      );
    }
    return failAfterStaging(
      'verification-failed',
      MESSAGES.verificationFailed,
      'staged',
      REVERT_REASONS.afterStaging,
      cause,
    );
  }

  try {
    const verified = await adapter.readVerifiedHistoryGeneration(generationId);
    const sessions = verified.sessions;
    const manifest = verified.manifest;
    const identical = verified.generationId === generationId
      && manifest.generationId === generationId
      && manifest.verified
      && manifest.sessionCount === payload.workoutHistory.length
      && manifest.orderedDigest === expectedOrderedDigest
      && sessions.length === payload.workoutHistory.length
      && sessions.every((session, index) => session.id === payload.workoutHistory[index]?.id)
      && workoutHistoriesMatch(payload.workoutHistory, sessions);
    if (!identical) {
      return failAfterStaging(
        'verification-failed',
        MESSAGES.verificationFailed,
        'staged',
        REVERT_REASONS.afterStaging,
      );
    }
  } catch (cause) {
    return failAfterStaging(
      'verification-failed',
      MESSAGES.verificationFailed,
      'staged',
      REVERT_REASONS.afterStaging,
      cause,
    );
  }

  // -------------------------------------------------------------------------
  // W4 — core alvo construído UMA vez e persistido no journal antes de existir.
  // -------------------------------------------------------------------------

  const savedAt = now().toISOString();
  if (!isCanonicalIsoInstant(savedAt)) {
    return failAfterStaging(
      'core-commit-failed',
      MESSAGES.targetCoreTimestamp,
      'staged',
      REVERT_REASONS.afterStaging,
    );
  }

  const targetEnvelope: StorageEnvelope<PersistedCoreState> = {
    v: HYBRID_STORAGE_VERSION,
    savedAt,
    data: toPersistedCoreState(payload, generationId),
  };
  let targetCoreRaw: string;
  try {
    targetCoreRaw = JSON.stringify(targetEnvelope);
  } catch (cause) {
    return failAfterStaging(
      'core-commit-failed',
      MESSAGES.targetCoreInvalid,
      'staged',
      REVERT_REASONS.afterStaging,
      cause,
    );
  }
  const parsedTarget = parsePhysicalEnvelope(targetCoreRaw);
  if (
    parsedTarget.status !== 'v2'
    || parsedTarget.envelope.savedAt !== savedAt
    || parsedTarget.envelope.data.historyStorage.generationId !== generationId
  ) {
    return failAfterStaging(
      'core-commit-failed',
      MESSAGES.targetCoreInvalid,
      'staged',
      REVERT_REASONS.afterStaging,
    );
  }

  try {
    await runtime.transitionStorageOperation({
      operationId,
      expectedStatus: 'staged',
      nextStatus: 'activating',
      patch: { targetCoreRaw },
    });
  } catch (cause) {
    if (cause instanceof StorageOperationTransitionConflictError) {
      // A fachada já compensa sozinha quando o conflito é dela; uma segunda
      // tentativa de reverter só produziria uma falha de CAS inventada.
      if (cause.compensation !== 'not-attempted') {
        if (cause.compensation === 'reverted') {
          await cleanupStagedGeneration(adapter, generationId, previousGenerationId);
        }
        return failure({
          reason: 'snapshot-changed-during-import',
          error: MESSAGES.snapshotChanged,
          operationId,
          generationId,
          compensation: cause.compensation,
          cause,
        });
      }
      return failAfterStaging(
        'snapshot-changed-during-import',
        MESSAGES.snapshotChanged,
        'staged',
        REVERT_REASONS.afterStaging,
        cause,
      );
    }
    return failAfterStaging(
      'operation-conflict',
      MESSAGES.operationConflict,
      'staged',
      REVERT_REASONS.afterStaging,
      cause,
    );
  }

  const afterTarget = await adapter.readStorageOperationReceipt(operationId).catch(() => null);
  if (
    afterTarget === null
    || afterTarget.status !== 'activating'
    || afterTarget.stagedGenerationId !== generationId
    || afterTarget.targetCoreRaw !== targetCoreRaw
  ) {
    return failAfterStaging(
      'readback-failed',
      MESSAGES.targetCoreReadbackFailed,
      'activating',
      REVERT_REASONS.afterStaging,
    );
  }

  // -------------------------------------------------------------------------
  // W5 — ativação verificada com CAS.
  //
  // `rollbackToHistoryGeneration` é usada aqui como primitiva de ATIVAÇÃO, não
  // de rollback: ela é a única do adapter que verifica a geração alvo
  // integralmente, reconfere o conteúdo físico contra uma prova canônica DENTRO
  // da transação de escrita, aplica CAS em `activeGeneration` e confirma o
  // ponteiro por readback depois do commit. `activateHistoryGeneration` não faz
  // nada disso e ainda exigiria o ponteiro de staging, que este fluxo
  // deliberadamente não usa. O ponteiro continua nulo: `clearStagedGenerationId`
  // é omitido de propósito.
  // -------------------------------------------------------------------------

  const failAfterActivation = async (
    reason: LogicalImportFailureReason,
    error: string,
    cause?: unknown,
  ): Promise<LogicalImportFailure> => {
    const restored = await restorePreviousGeneration(adapter, previousGenerationId, generationId);
    if (!restored) {
      // O mundo físico não voltou ao lugar: encerrar o receipt aqui esconderia
      // uma divergência real. O journal fica aberto de propósito.
      return failure({
        reason: 'recovery-required',
        error: MESSAGES.coreAmbiguous,
        operationId,
        generationId,
        compensation: 'not-attempted',
        cause,
      });
    }
    const compensation = await revertReceipt({
      adapter,
      operationId,
      expectedStatus: 'activating',
      expectedActiveGenerationId: previousGenerationId,
      reason: REVERT_REASONS.afterActivation,
    });
    if (compensation === 'reverted') {
      await cleanupStagedGeneration(adapter, generationId, previousGenerationId);
    }
    return failure({ reason, error, operationId, generationId, compensation, cause });
  };

  try {
    const activation = await adapter.rollbackToHistoryGeneration({
      targetGenerationId: generationId,
      expectedActiveGenerationId: previousGenerationId,
    });
    if (
      activation.activeGeneration !== generationId
      || activation.migrationGeneration !== null
      || !activation.changed
    ) {
      return failAfterActivation('activation-failed', MESSAGES.activationFailed);
    }
  } catch (cause) {
    // Idempotência: a ativação pode ter commitado e falhado só no readback.
    const observed = await adapter.readMetadata().catch(() => null);
    if (observed === null) {
      return failure({
        reason: 'recovery-required',
        error: MESSAGES.activationFailed,
        operationId,
        generationId,
        compensation: 'not-attempted',
        cause,
      });
    }
    if (observed.activeGeneration !== generationId) {
      return failAfterStaging(
        'activation-failed',
        MESSAGES.activationFailed,
        'activating',
        REVERT_REASONS.beforeActivation,
        cause,
      );
    }
    if (observed.migrationGeneration !== null) {
      return failAfterActivation('activation-failed', MESSAGES.activationFailed, cause);
    }
  }

  // -------------------------------------------------------------------------
  // W6 — commit byte-exato do core. A única escrita sem CAS de todo o fluxo.
  //
  // A cópia rolante NUNCA é compensada: nem `setItem` do valor anterior, nem
  // `removeItem` para recriar uma ausência, nem escrita de "melhor esforço".
  // Ver a nota "O QUE A COMPENSAÇÃO NÃO DESFAZ" no topo do arquivo. Se a cópia
  // contém `previousCoreRaw`, fica assim; se contém outro valor, fica assim; se
  // está ausente, fica ausente; se a leitura dela falha, nem tentamos escrevê-la.
  // -------------------------------------------------------------------------

  const backupKey = `${key}${HYBRID_CORE_BACKUP_SUFFIX}`;

  // Leitura do armazenamento que falhou: o estado canônico não pode ser
  // PROVADO, então nada é escrito — nem a chave principal, nem a cópia rolante —
  // e o journal fica aberto para o C2 decidir. `storage-unavailable` antes do
  // commit da chave principal, `recovery-required` a partir dele.
  const unprovableCore = (
    reason: 'storage-unavailable' | 'recovery-required',
  ): LogicalImportFailure => failure({
    reason,
    error: reason === 'storage-unavailable' ? MESSAGES.coreUnreadable : MESSAGES.coreAmbiguous,
    operationId,
    generationId,
    compensation: 'not-attempted',
  });

  // Compensação de uma falha da CÓPIA ROLANTE, antes de qualquer gravação da
  // chave principal. Ela relê a chave principal e só desfaz o que consegue
  // provar; a cópia rolante fica exatamente como está.
  const failAfterBackupProblem = async (
    reason: LogicalImportFailureReason,
    error: string,
  ): Promise<LogicalImportFailure> => {
    const observed = readRaw(storage, key);
    if (!observed.ok) return unprovableCore('storage-unavailable');
    if (observed.raw !== previousCoreRaw) {
      // Ou a chave principal já é o core alvo — que esta operação não gravou —,
      // ou é um terceiro valor. Nos dois casos: não sobrescreve, não remove,
      // não fecha o journal e não finge que nada foi aplicado.
      return unprovableCore('recovery-required');
    }
    return failAfterActivation(reason, error);
  };

  const beforeCommit = readRaw(storage, key);
  if (!beforeCommit.ok) return unprovableCore('storage-unavailable');
  if (beforeCommit.raw !== previousCoreRaw) {
    return failAfterActivation('core-commit-failed', MESSAGES.coreChangedBeforeCommit);
  }

  // Sonda da cópia rolante: se ela nem pode ser lida, este fluxo não tenta
  // gravá-la.
  const backupProbe = readRaw(storage, backupKey);
  if (!backupProbe.ok) return unprovableCore('storage-unavailable');

  // Cópia rolante do core anterior, no mesmo contrato de chave que o runtime
  // híbrido já usa. O conteúdo é exatamente `previousCoreRaw`, que o journal
  // também guarda.
  try {
    storage.setItem(backupKey, previousCoreRaw);
  } catch (cause) {
    return failAfterBackupProblem(
      isQuotaFailure(cause) ? 'quota' : 'storage-unavailable',
      MESSAGES.coreBackupFailed,
    );
  }
  const backupReadback = readRaw(storage, backupKey);
  if (!backupReadback.ok) return unprovableCore('storage-unavailable');
  if (backupReadback.raw !== previousCoreRaw) {
    return failAfterBackupProblem('core-commit-failed', MESSAGES.coreBackupFailed);
  }

  // Segunda releitura da chave principal: gravar a cópia rolante é uma janela em
  // que outra aba pode ter escrito.
  const beforeWrite = readRaw(storage, key);
  if (!beforeWrite.ok) return unprovableCore('storage-unavailable');
  if (beforeWrite.raw !== previousCoreRaw) {
    return failAfterActivation('core-commit-failed', MESSAGES.coreChangedBeforeCommit);
  }

  let writeError: unknown = null;
  try {
    // O MESMO raw que o journal já prometeu. Nada de reconstruir o envelope,
    // nada de cunhar um `savedAt` novo: `saveHybridCoreResult` faria as duas
    // coisas e o core gravado nunca bateria byte a byte com `targetCoreRaw`.
    storage.setItem(key, targetCoreRaw);
  } catch (cause) {
    writeError = cause;
  }

  const afterWrite = readRaw(storage, key);
  // Ilegível depois de uma tentativa de escrita: não dá para afirmar nada.
  if (!afterWrite.ok) return unprovableCore('recovery-required');
  if (afterWrite.raw === previousCoreRaw) {
    // A chave principal não mudou: compensação segura e comprovável. A cópia
    // rolante fica onde está — ela já contém `previousCoreRaw`.
    if (writeError !== null) {
      return failAfterActivation(
        isQuotaFailure(writeError) ? 'quota' : 'storage-unavailable',
        isQuotaFailure(writeError) ? MESSAGES.coreQuota : MESSAGES.coreWriteFailed,
      );
    }
    return failAfterActivation('core-commit-failed', MESSAGES.coreReadbackDiverged);
  }
  // Terceiro valor: não adivinha, não sobrescreve, não apaga a geração, não
  // marca terminal. O journal fica inteiro para o slice C2.
  if (afterWrite.raw !== targetCoreRaw) return unprovableCore('recovery-required');

  // -------------------------------------------------------------------------
  // W7 — verificação final. A partir daqui o mundo alvo está aplicado: uma
  // divergência não é compensada às cegas, ela preserva o journal.
  // -------------------------------------------------------------------------

  const unprovable = (cause?: unknown): LogicalImportFailure => failure({
    reason: 'recovery-required',
    error: MESSAGES.finalVerificationFailed,
    operationId,
    generationId,
    compensation: 'not-attempted',
    cause,
  });

  const committedCore = readRaw(storage, key);
  if (!committedCore.ok || committedCore.raw !== targetCoreRaw) return unprovable();
  const parsedCommitted = parsePhysicalEnvelope(targetCoreRaw);
  if (
    parsedCommitted.status !== 'v2'
    || parsedCommitted.envelope.data.historyStorage.generationId !== generationId
  ) {
    return unprovable();
  }

  try {
    const finalMetadata = await adapter.readMetadata();
    if (
      finalMetadata.activeGeneration !== generationId
      || finalMetadata.migrationGeneration !== null
      || finalMetadata.migrationStatus !== 'completed'
    ) {
      return unprovable();
    }
    const finalGeneration = await adapter.readVerifiedHistoryGeneration(generationId);
    if (
      finalGeneration.generationId !== generationId
      || finalGeneration.manifest.orderedDigest !== expectedOrderedDigest
      || !workoutHistoriesMatch(payload.workoutHistory, finalGeneration.sessions)
    ) {
      return unprovable();
    }
  } catch (cause) {
    return unprovable(cause);
  }

  // -------------------------------------------------------------------------
  // W8 — activating → activated.
  //
  // A fachada A2 não consegue certificar este passo: seu avaliador devolve
  // `insufficient-evidence` para qualquer mundo `activating` com efeitos
  // aplicados (ela não executa ativação, então não pode atestar de onde os
  // efeitos vieram), e `transitionStorageOperation` exige `interrupted`. Quem
  // produziu os efeitos é este módulo, então é ele que reconfere TODAS as
  // pré-condições e chama a primitiva atômica do adapter diretamente. Nada da
  // fachada e nada de `evaluateStorageOperationCompatibility` é alterado.
  // -------------------------------------------------------------------------

  const beforeActivated = await adapter.readStorageOperationReceipt(operationId).catch(() => null);
  if (beforeActivated === null || beforeActivated.kind !== IMPORT_OPERATION_KIND) {
    return unprovable();
  }
  if (beforeActivated.status === 'activating') {
    if (
      beforeActivated.stagedGenerationId !== generationId
      || beforeActivated.targetCoreRaw !== targetCoreRaw
    ) {
      return unprovable();
    }
    const coreBeforeMark = readRaw(storage, key);
    if (!coreBeforeMark.ok || coreBeforeMark.raw !== targetCoreRaw) return unprovable();
    try {
      const advanced = await adapter.transitionStorageOperationIfUnambiguous({
        operationId,
        expectedStatus: 'activating',
        nextStatus: 'activated',
        expectedActiveGenerationId: generationId,
      });
      if (advanced.status !== 'activated') return unprovable();
    } catch (cause) {
      const current = await adapter.readStorageOperationReceipt(operationId).catch(() => null);
      // Idempotência: a transação pode ter commitado e falhado depois.
      if (current === null || current.status !== 'activated') {
        return failure({
          reason: 'recovery-required',
          error: MESSAGES.markActivatedFailed,
          operationId,
          generationId,
          compensation: 'not-attempted',
          cause,
        });
      }
    }
    const coreAfterMark = readRaw(storage, key);
    if (!coreAfterMark.ok || coreAfterMark.raw !== targetCoreRaw) return unprovable();
    // Readback do RECEIPT depois da transição. A primitiva confere, dentro da
    // própria transação, status, kind, unicidade da operação em aberto, ausência
    // de conclusão pendente e CAS da geração ativa — mas não reconfere
    // `stagedGenerationId`, `targetCoreRaw` nem o mundo anterior. Uma mutação
    // desses campos entre a checagem acima e a transação (janela TOCTOU do W8,
    // que só um owner-token fecha) passa despercebida lá dentro; aqui ela
    // impede o settlement e preserva o journal.
    const afterMark = await adapter.readStorageOperationReceipt(operationId).catch(() => null);
    if (
      afterMark === null
      || afterMark.status !== 'activated'
      || afterMark.kind !== IMPORT_OPERATION_KIND
      || afterMark.stagedGenerationId !== generationId
      || afterMark.targetCoreRaw !== targetCoreRaw
      || afterMark.previousGenerationId !== previousGenerationId
      || afterMark.previousCoreRaw !== previousCoreRaw
    ) {
      return unprovable();
    }
  } else if (beforeActivated.status !== 'activated' && beforeActivated.status !== 'settled') {
    return unprovable();
  }

  // -------------------------------------------------------------------------
  // W9 — activated → settled. Com o mundo alvo inteiro aplicado, o receipt volta
  // a ser coerente para o avaliador do A2 e a fachada consegue liquidá-lo com
  // todo o seu protocolo pré/pós-transação.
  // -------------------------------------------------------------------------

  const beforeSettle = await adapter.readStorageOperationReceipt(operationId).catch(() => null);
  if (beforeSettle === null) return unprovable();
  if (beforeSettle.status === 'activated') {
    try {
      await runtime.transitionStorageOperation({
        operationId,
        expectedStatus: 'activated',
        nextStatus: 'settled',
      });
    } catch (cause) {
      const current = await adapter.readStorageOperationReceipt(operationId).catch(() => null);
      if (current === null || current.status !== 'settled') {
        return failure({
          reason: 'recovery-required',
          error: MESSAGES.settleFailed,
          operationId,
          generationId,
          compensation: 'not-attempted',
          cause,
        });
      }
    }
  } else if (beforeSettle.status !== 'settled') {
    return unprovable();
  }

  const settled = await adapter.readStorageOperationReceipt(operationId).catch(() => null);
  if (settled === null || settled.status !== 'settled') {
    return failure({
      reason: 'recovery-required',
      error: MESSAGES.settleFailed,
      operationId,
      generationId,
      compensation: 'not-attempted',
    });
  }

  // -------------------------------------------------------------------------
  // W10 — nova inspeção administrativa. Sucesso só depois deste readback.
  // -------------------------------------------------------------------------

  const finalSnapshot = await runtime.inspectStorageAdministration();
  if (
    finalSnapshot.state.status !== 'ready'
    || finalSnapshot.activeGenerationId !== generationId
    || finalSnapshot.stagedGenerationId !== null
    || finalSnapshot.coreRawObserved !== targetCoreRaw
    || finalSnapshot.activeGenerationIntegrity === null
    || finalSnapshot.activeGenerationIntegrity.status !== 'verified'
    || finalSnapshot.unsettledOperations.length !== 0
    || finalSnapshot.pendingCompletionReceiptCount !== 0
  ) {
    return failure({
      reason: 'recovery-required',
      error: MESSAGES.finalStateNotReady,
      operationId,
      generationId,
      compensation: 'not-attempted',
    });
  }

  return {
    ok: true,
    operationId,
    generationId,
    previousGenerationId,
    payloadDigest,
    sessionCount: payload.workoutHistory.length,
    savedAt,
    preview: inspection.preview,
  };
}
