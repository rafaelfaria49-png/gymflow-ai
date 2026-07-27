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
import {
  isTerminalStorageOperationStatus,
  type StorageOperationReceipt,
} from './storage-operation-receipt';
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

// ===========================================================================
// C2 — recuperação de uma importação lógica v2 interrompida
//
// O C1 entrega uma importação jornalizada e um resolvedor PURO; o que faltava é
// quem executa a decisão DEPOIS de um reload. Este bloco é esse motor.
//
// A PREMISSA QUE MUDA TUDO: o arquivo original NÃO EXISTE MAIS. Depois de um
// reload não há `raw`, não há payload lógico e não há como recalcular
// `targetCoreRaw`. Toda evidência sai de duas fontes e só delas — o journal
// (que nomeia os dois mundos completos) e o armazenamento atual. Nada é
// reconstruído, nada é adivinhado e nada é aceito do chamador: a assinatura
// deliberadamente NÃO recebe raw, payload, preview, inspeção, `generationId`
// escolhido, `previousCoreRaw` nem `targetCoreRaw`.
//
// A CONSEQUÊNCIA: uma operação que parou ANTES de gravar o core alvo no journal
// não pode ser terminada para a frente — o mundo importado simplesmente não
// existe em lugar nenhum. Ela converge para trás, para o mundo anterior, que o
// journal guarda inteiro. Uma operação que já gravou `targetCoreRaw` E já criou
// a geração pode ser terminada para a frente, porque os dois mundos estão
// materializados. É essa fronteira — `staged` versus `activating` — que decide
// a direção, nunca uma preferência.
//
// O QUE ESTE MOTOR CONTINUA NÃO SENDO: não há chamada no boot, não há Provider,
// Context, AdminPanel, UI, botão, modal, toast nem call site. `hydrate` e
// `metadataMatchesV2` não foram tocados. Quem chama isto antes da hidratação é
// o slice D, que não foi iniciado.
// ===========================================================================

// Limite fechado de avanços. O caminho mais longo observado — `activating` no
// MUNDO A até `settled` — consome sete passos: ativar, verificar, gravar o core,
// marcar `activated`, verificar de novo, liquidar e confirmar. Doze deixa folga
// para uma releitura extra sem nunca virar espera indefinida.
//
// Não existe recursão, `setTimeout`, espera por tempo nem retry por atraso: o
// motor só avança quando a leitura seguinte PROVA que o mundo mudou.
const MAX_RECOVERY_STEPS = 12;

// Capacidades mínimas da fachada A2. `beginStorageOperation` está fora de
// propósito: a recuperação nunca cria operação nova.
export type LogicalImportRecoveryRuntime = Pick<
  StorageAdminRuntime,
  'inspectStorageAdministration' | 'transitionStorageOperation' | 'revertStorageOperationSafely'
>;

// Capacidades mínimas do adapter. `stageHistoryGenerationForOperation` está
// fora de propósito: a recuperação nunca cria geração — não tem o histórico
// importado para colocar dentro dela, e inventar uma seria fabricar dados.
export type LogicalImportRecoveryAdapter = Pick<
  AdministrableWorkoutHistoryStorageAdapter,
  | 'readMetadata'
  | 'readStorageAdministrationSnapshot'
  | 'readStorageOperationReceipt'
  | 'readVerifiedHistoryGeneration'
  | 'rollbackToHistoryGeneration'
  | 'transitionStorageOperationIfUnambiguous'
  | 'clearInactiveGeneration'
>;

export interface RecoverLogicalStorageImportV2Input {
  runtime: LogicalImportRecoveryRuntime;
  adapter: LogicalImportRecoveryAdapter;
  storage: StorageLike;
  key: string;
  // Amarração opcional a UMA operação. Quando informado, ele precisa
  // corresponder ao receipt elegível; divergência bloqueia sem nenhuma escrita.
  operationId?: string;
}

// ---------------------------------------------------------------------------
// Resolvedor puro de REINÍCIO
// ---------------------------------------------------------------------------

// A leitura da chave principal pode falhar, e "falhou" não é o mesmo que
// "ausente": um `getItem` que estourou não prova nada sobre o estado canônico.
export type LogicalImportCoreObservation =
  | { status: 'read'; raw: string | null }
  | { status: 'unavailable' };

// Fotografia EXPLÍCITA do mundo depois do reload. Como no resolvedor do C1,
// nada aqui é lido pelo resolvedor: quem o chama observa e declara honestamente
// o que conseguiu — ou não conseguiu — provar.
export interface LogicalImportRestartObservation {
  receipt: StorageOperationReceipt | null;
  core: LogicalImportCoreObservation;
  metadata: {
    activeGeneration: string | null;
    migrationGeneration: string | null;
    migrationStatus: HistoryStorageMetadata['migrationStatus'];
  };
  generations: readonly { generationId: string }[];
  // Integridade criptográfica da geração ANTERIOR. Ela decide se a geração
  // preparada pode ser apagada: destruir a alternativa exige provar o mundo que
  // fica.
  previousGenerationIntegrity: LogicalImportGenerationIntegrity;
  // Integridade criptográfica da geração preparada (G).
  stagedGenerationIntegrity: LogicalImportGenerationIntegrity;
  pendingCompletionReceiptCount: number;
  unsettledOperationCount: number;
}

export type LogicalImportRestartBlockedReason =
  | 'not-an-import'
  | 'multiple-unsettled-operations'
  | 'completion-pending'
  | 'core-unreadable'
  | 'core-missing'
  | 'core-not-v2'
  | 'migration-incomplete'
  | 'unexpected-staging-pointer'
  | 'previous-generation-absent'
  | 'staged-generation-absent'
  | 'staged-generation-is-previous'
  | 'staged-generation-invalid'
  | 'staged-with-target-core'
  | 'activating-without-staging'
  | 'activating-without-target-core'
  | 'activated-target-missing'
  | 'target-core-invalid'
  | 'active-generation-unexpected'
  | 'core-not-previous'
  | 'core-target-without-activation'
  | 'target-verification-failed'
  | 'activated-generation-not-active'
  | 'activated-core-not-target'
  | 'unrecognized-world';

// União fechada. Nenhuma ação pede o arquivo original — `stage-generation` e
// `prepare-core`, que o resolvedor do C1 produz, são impossíveis aqui e por
// isso simplesmente não existem neste tipo.
export type LogicalImportRestartDecision =
  | { action: 'no-operation' }
  | { action: 'already-settled'; operationId: string }
  // `cleanupGenerationId` só é preenchido quando a geração preparada continua
  // existindo, inativa e distinta da anterior. `null` significa "não há nada
  // pendente" — é o que torna a segunda execução um no-op.
  | { action: 'already-reverted'; operationId: string; cleanupGenerationId: string | null }
  | {
      action: 'revert-receipt';
      operationId: string;
      generationId: string | null;
      previousGenerationId: string;
    }
  | {
      action: 'revert-and-cleanup-staging';
      operationId: string;
      generationId: string;
      previousGenerationId: string;
    }
  | {
      action: 'activate-generation';
      operationId: string;
      generationId: string;
      previousGenerationId: string;
    }
  | { action: 'commit-target-core'; operationId: string; generationId: string }
  | { action: 'verify-target'; operationId: string; generationId: string }
  | { action: 'mark-activated'; operationId: string; generationId: string }
  | { action: 'settle'; operationId: string }
  | { action: 'recovery-required'; reason: LogicalImportRestartBlockedReason }
  | { action: 'impossible-state'; reason: LogicalImportRestartBlockedReason };

function restartBlocked(reason: LogicalImportRestartBlockedReason): LogicalImportRestartDecision {
  return { action: 'recovery-required', reason };
}

function restartImpossible(
  reason: LogicalImportRestartBlockedReason,
): LogicalImportRestartDecision {
  return { action: 'impossible-state', reason };
}

/**
 * Resolvedor PURO do reinício: nenhuma leitura, nenhuma escrita, nenhum
 * relógio, nenhum UUID, nenhuma mutação da entrada.
 *
 * Ele é irmão de `resolveLogicalImportRecovery`, não substituto: aquele responde
 * "esta importação, que ainda tem o arquivo em mãos, deve continuar de onde?";
 * este responde "esta importação, cujo arquivo evaporou no reload, converge para
 * qual dos dois mundos que o journal nomeia?". O resolvedor do C1 continua puro
 * e intocado.
 */
export function resolveLogicalImportRestartRecovery(
  observation: LogicalImportRestartObservation,
): LogicalImportRestartDecision {
  const { receipt, core, metadata, generations } = observation;

  if (receipt === null) return { action: 'no-operation' };
  // Restore, reset e rollback têm outros fluxos e outros invariantes. Assumir
  // que um receipt alheio pertence à importação seria agir sobre o journal de
  // outra operação.
  if (receipt.kind !== IMPORT_OPERATION_KIND) return restartBlocked('not-an-import');

  const known = new Set(generations.map((entry) => entry.generationId));
  const staged = receipt.stagedGenerationId;

  // Terminais primeiro: eles nunca reabrem, nunca regravam e nunca criam nada.
  if (receipt.status === 'settled') {
    return { action: 'already-settled', operationId: receipt.operationId };
  }
  if (receipt.status === 'reverted') {
    const orphan = staged !== null
      && known.has(staged)
      && staged !== receipt.previousGenerationId
      && metadata.activeGeneration !== staged;
    return {
      action: 'already-reverted',
      operationId: receipt.operationId,
      cleanupGenerationId: orphan ? staged : null,
    };
  }

  if (observation.unsettledOperationCount > 1) return restartBlocked('multiple-unsettled-operations');
  // Avançar uma importação com conclusão de treino pendente misturaria dois
  // fluxos que o projeto mantém isolados; reverter sobre ela idem.
  if (observation.pendingCompletionReceiptCount > 0) return restartBlocked('completion-pending');
  if (core.status === 'unavailable') return restartBlocked('core-unreadable');
  if (core.raw === null) return restartBlocked('core-missing');
  const coreRaw = core.raw;
  if (parsePhysicalEnvelope(coreRaw).status !== 'v2') return restartBlocked('core-not-v2');
  if (metadata.migrationStatus !== 'completed') return restartBlocked('migration-incomplete');
  // Esta importação nunca preenche o ponteiro de staging. Um valor aqui é obra
  // de outro fluxo, e escolher o que fazer seria chute.
  if (metadata.migrationGeneration !== null) return restartBlocked('unexpected-staging-pointer');

  if (!known.has(receipt.previousGenerationId)) return restartImpossible('previous-generation-absent');
  if (staged !== null && !known.has(staged)) return restartImpossible('staged-generation-absent');
  if (staged !== null && staged === receipt.previousGenerationId) {
    return restartImpossible('staged-generation-is-previous');
  }

  const target = receipt.targetCoreRaw;
  const coreIsPrevious = coreRaw === receipt.previousCoreRaw;
  const activeIsPrevious = metadata.activeGeneration === receipt.previousGenerationId;
  const activeIsStaged = staged !== null && metadata.activeGeneration === staged;

  if (receipt.status === 'staged') {
    // `staged` afirma que NADA foi aplicado, e sem o arquivo o mundo importado
    // não pode nascer. O único destino legítimo é encerrar a operação — e só
    // sobre o mundo anterior INTACTO. Um mundo diferente significa que outra
    // coisa escreveu, e reverter ali seria reverter às cegas.
    if (target !== null) return restartImpossible('staged-with-target-core');
    if (!activeIsPrevious) return restartBlocked('active-generation-unexpected');
    if (!coreIsPrevious) return restartBlocked('core-not-previous');
    if (staged === null) {
      return {
        action: 'revert-receipt',
        operationId: receipt.operationId,
        generationId: null,
        previousGenerationId: receipt.previousGenerationId,
      };
    }
    if (observation.previousGenerationIntegrity === 'invalid') {
      // Apagar G exigiria provar o mundo que fica. Sem essa prova a operação é
      // encerrada mesmo assim e G vira órfã SEGURA: ela não bloqueia hidratação
      // nem diagnóstico, e perder dados seria muito pior do que deixar lixo.
      return {
        action: 'revert-receipt',
        operationId: receipt.operationId,
        generationId: staged,
        previousGenerationId: receipt.previousGenerationId,
      };
    }
    return {
      action: 'revert-and-cleanup-staging',
      operationId: receipt.operationId,
      generationId: staged,
      previousGenerationId: receipt.previousGenerationId,
    };
  }

  // De `activating` em diante o receipt PRECISA nomear os dois mundos: é o que
  // torna o avanço possível sem o arquivo.
  if (staged === null) {
    return restartImpossible(
      receipt.status === 'activating' ? 'activating-without-staging' : 'activated-target-missing',
    );
  }
  if (target === null) {
    return restartImpossible(
      receipt.status === 'activating' ? 'activating-without-target-core' : 'activated-target-missing',
    );
  }
  // O core alvo é lido do journal e nunca reconstruído — então ele é conferido
  // aqui, antes de qualquer decisão que o grave: envelope v2, apontando para G,
  // com instante canônico.
  const parsedTarget = parsePhysicalEnvelope(target);
  if (
    parsedTarget.status !== 'v2'
    || parsedTarget.envelope.data.historyStorage.generationId !== staged
    || !isCanonicalIsoInstant(parsedTarget.envelope.savedAt)
  ) {
    return restartBlocked('target-core-invalid');
  }
  const coreIsTarget = coreRaw === target;

  if (receipt.status === 'activating') {
    // MUNDO A — nada aplicado: geração anterior ativa e core anterior.
    if (activeIsPrevious && coreIsPrevious) {
      if (observation.stagedGenerationIntegrity === 'invalid') {
        return restartBlocked('staged-generation-invalid');
      }
      // `unknown` é aceito aqui — e só aqui — porque
      // `rollbackToHistoryGeneration` verifica a geração alvo integralmente e
      // reconfere o conteúdo físico dentro da própria transação de escrita.
      return {
        action: 'activate-generation',
        operationId: receipt.operationId,
        generationId: staged,
        previousGenerationId: receipt.previousGenerationId,
      };
    }
    // MUNDO B — geração já ativada, core ainda o anterior.
    if (activeIsStaged && coreIsPrevious) {
      if (observation.stagedGenerationIntegrity === 'invalid') {
        return restartBlocked('staged-generation-invalid');
      }
      if (observation.stagedGenerationIntegrity === 'unknown') {
        return { action: 'verify-target', operationId: receipt.operationId, generationId: staged };
      }
      return { action: 'commit-target-core', operationId: receipt.operationId, generationId: staged };
    }
    // MUNDO C — geração ativa e core alvo gravado; falta fechar o journal.
    if (activeIsStaged && coreIsTarget) {
      if (observation.stagedGenerationIntegrity === 'invalid') {
        return restartBlocked('target-verification-failed');
      }
      if (observation.stagedGenerationIntegrity === 'unknown') {
        return { action: 'verify-target', operationId: receipt.operationId, generationId: staged };
      }
      return { action: 'mark-activated', operationId: receipt.operationId, generationId: staged };
    }
    // MUNDO D — core alvo SEM ativação. A ordem oficial é geração → core, então
    // este estado não nasce daqui. Não ativar, não reverter, não sobrescrever.
    if (activeIsPrevious && coreIsTarget) return restartBlocked('core-target-without-activation');
    return restartBlocked('unrecognized-world');
  }

  // `activated` afirma efeitos completos: ou todos estão provados, ou ninguém
  // avança e ninguém compensa.
  if (!activeIsStaged) return restartBlocked('activated-generation-not-active');
  if (!coreIsTarget) return restartBlocked('activated-core-not-target');
  if (observation.stagedGenerationIntegrity === 'invalid') {
    return restartBlocked('target-verification-failed');
  }
  if (observation.stagedGenerationIntegrity === 'unknown') {
    return { action: 'verify-target', operationId: receipt.operationId, generationId: staged };
  }
  return { action: 'settle', operationId: receipt.operationId };
}

// ---------------------------------------------------------------------------
// Resultado público fechado
// ---------------------------------------------------------------------------

export type LogicalImportRecoveryStatus =
  | 'no-operation'
  | 'already-settled'
  | 'already-reverted'
  | 'reverted'
  | 'settled';

export type LogicalImportRecoveryFailureReason =
  | 'operation-conflict'
  | 'administration-unavailable'
  | 'administration-conflicted'
  | 'migration-incomplete'
  | 'storage-unavailable'
  | 'quota'
  | 'verification-failed'
  | 'activation-failed'
  | 'core-commit-failed'
  | 'readback-failed'
  | 'recovery-required'
  | 'impossible-state'
  | 'recovery-step-limit';

// Ação em que a recuperação parou. `observe` é a fase anterior a qualquer
// decisão — evidência que nem pôde ser coletada.
export type LogicalImportRecoveryAction =
  | LogicalImportRestartDecision['action']
  | 'observe';

export interface LogicalImportRecoverySuccess {
  ok: true;
  status: LogicalImportRecoveryStatus;
  operationId: string | null;
  generationId: string | null;
  steps: number;
  finalAction: LogicalImportRecoveryAction;
  recoveryRequired: false;
  // Uma geração preparada continua no disco, inativa e sem dono. Ela não impede
  // hidratação nem diagnóstico; a política de retenção é do 002D-F.
  cleanupPending: boolean;
}

export interface LogicalImportRecoveryFailure {
  ok: false;
  reason: LogicalImportRecoveryFailureReason;
  // Sempre uma constante DESTE módulo.
  error: string;
  operationId: string | null;
  generationId: string | null;
  steps: number;
  finalAction: LogicalImportRecoveryAction;
  // O journal foi preservado: uma nova tentativa (ou o diagnóstico do A2) ainda
  // é necessária. Existe para que o chamador não precise casar treze motivos.
  recoveryRequired: true;
  cleanupPending: boolean;
}

export type LogicalStorageImportRecoveryResult =
  | LogicalImportRecoverySuccess
  | LogicalImportRecoveryFailure;

// Mensagens constantes. Nenhuma delas interpola nada: nem id, nem contagem, nem
// texto do ambiente.
const RECOVERY_MESSAGES: Record<LogicalImportRecoveryFailureReason, string> = {
  'operation-conflict': 'O estado administrativo não identifica uma única importação recuperável.',
  'administration-unavailable': 'O armazenamento administrativo não está disponível para recuperar.',
  'administration-conflicted': 'O estado administrativo está ambíguo demais para recuperar.',
  'migration-incomplete': 'A migração física para o formato v2 não está concluída.',
  'storage-unavailable': 'O core físico não pôde ser lido ou gravado durante a recuperação.',
  quota: 'O armazenamento local não tem espaço para concluir a recuperação.',
  'verification-failed': 'A geração da importação interrompida não pôde ser comprovada.',
  'activation-failed': 'A ativação da geração importada falhou durante a recuperação.',
  'core-commit-failed': 'A gravação do core importado falhou durante a recuperação.',
  'readback-failed': 'Uma escrita da recuperação não passou no readback.',
  'recovery-required': 'A recuperação não pôde ser comprovada; o journal foi preservado.',
  'impossible-state': 'O journal descreve um estado que esta ordem de escrita não produz.',
  'recovery-step-limit': 'A recuperação não convergiu dentro do limite de passos.',
};

// Tradução do motivo interno do resolvedor para o motivo público. Fechada nos
// dois lados: `Record` completo, sem `default` e sem string livre.
const RESTART_REASON_TO_PUBLIC: Record<
  LogicalImportRestartBlockedReason,
  LogicalImportRecoveryFailureReason
> = {
  'not-an-import': 'operation-conflict',
  'multiple-unsettled-operations': 'operation-conflict',
  'completion-pending': 'operation-conflict',
  'core-unreadable': 'storage-unavailable',
  'core-missing': 'administration-unavailable',
  'core-not-v2': 'administration-conflicted',
  'migration-incomplete': 'migration-incomplete',
  'unexpected-staging-pointer': 'administration-conflicted',
  'previous-generation-absent': 'impossible-state',
  'staged-generation-absent': 'impossible-state',
  'staged-generation-is-previous': 'impossible-state',
  'staged-generation-invalid': 'verification-failed',
  'staged-with-target-core': 'impossible-state',
  'activating-without-staging': 'impossible-state',
  'activating-without-target-core': 'impossible-state',
  'activated-target-missing': 'impossible-state',
  'target-core-invalid': 'recovery-required',
  'active-generation-unexpected': 'recovery-required',
  'core-not-previous': 'recovery-required',
  'core-target-without-activation': 'recovery-required',
  'target-verification-failed': 'verification-failed',
  'activated-generation-not-active': 'recovery-required',
  'activated-core-not-target': 'recovery-required',
  'unrecognized-world': 'recovery-required',
};

// ---------------------------------------------------------------------------
// Passos com efeito
// ---------------------------------------------------------------------------

// Escolha da operação a recuperar. Ela sai SEMPRE do armazenamento; o
// `operationId` do chamador é apenas uma amarração que precisa bater.
function selectRecoverableOperation(
  snapshot: {
    operationReceipts: readonly StorageOperationReceipt[];
    unsettledOperations: readonly StorageOperationReceipt[];
  },
  requested: string | undefined,
): { status: 'selected'; receipt: StorageOperationReceipt | null } | { status: 'conflict' } {
  const unsettled = snapshot.unsettledOperations;
  if (requested === undefined) {
    if (unsettled.length === 0) return { status: 'selected', receipt: null };
    if (unsettled.length > 1) return { status: 'conflict' };
    return { status: 'selected', receipt: unsettled[0] };
  }
  const named = snapshot.operationReceipts.find((entry) => entry.operationId === requested) ?? null;
  if (named === null) return { status: 'conflict' };
  if (isTerminalStorageOperationStatus(named.status)) {
    // Um terminal só pode ser relatado quando ele é a única história do
    // armazenamento: outra operação viva significaria agir sobre o journal
    // errado.
    return unsettled.length === 0 ? { status: 'selected', receipt: named } : { status: 'conflict' };
  }
  if (unsettled.length !== 1 || unsettled[0].operationId !== requested) return { status: 'conflict' };
  return { status: 'selected', receipt: named };
}

// Reversão idempotente. `revertStorageOperationSafely` é a saída de emergência
// da fachada A2: ela leva a operação para `reverted` e só para lá, dentro de uma
// transação que revalida todos os receipts e a metadata. Uma exceção NÃO é
// tratada como fracasso — a transação pode ter commitado e falhado depois, então
// quem decide é a releitura.
async function revertInterruptedReceipt(
  runtime: LogicalImportRecoveryRuntime,
  adapter: LogicalImportRecoveryAdapter,
  operationId: string,
): Promise<'reverted' | 'already-reverted' | 'failed' | 'readback-failed'> {
  let advanced = false;
  try {
    await runtime.revertStorageOperationSafely({ operationId, expectedStatus: 'staged' });
    advanced = true;
  } catch {
    // Silêncio deliberado: a causa nativa não sobe e a releitura decide.
  }
  const current = await adapter.readStorageOperationReceipt(operationId).catch(() => null);
  if (current === null) return 'readback-failed';
  if (current.status !== 'reverted') return 'failed';
  // `already-reverted` significa que OUTRA execução venceu a corrida. O estado
  // físico é o mesmo; o que muda é quem pode dizer que avançou.
  return advanced ? 'reverted' : 'already-reverted';
}

// Limpeza da geração preparada, com a guarda TRIPLA relida do armazenamento:
// ela precisa ser nomeada pelo journal de um receipt já terminal, não pode ser a
// geração ativa e não pode ser a geração anterior. Some a isso a prova integral
// do mundo que fica.
//
// A geração ANTERIOR nunca é apagada por nenhum caminho deste módulo.
async function cleanupRevertedStagingSafely(
  adapter: LogicalImportRecoveryAdapter,
  operationId: string,
  generationId: string,
  previousGenerationId: string,
): Promise<boolean> {
  if (generationId === previousGenerationId) return false;
  try {
    const receipt = await adapter.readStorageOperationReceipt(operationId);
    if (
      receipt === null
      || receipt.kind !== IMPORT_OPERATION_KIND
      || receipt.status !== 'reverted'
      || receipt.stagedGenerationId !== generationId
      || receipt.previousGenerationId !== previousGenerationId
    ) {
      return false;
    }
    const metadata = await adapter.readMetadata();
    if (metadata.activeGeneration === generationId) return false;
    if (metadata.activeGeneration !== previousGenerationId) return false;
    // Destruir a alternativa exige provar o mundo que fica — manifest, sessões e
    // digest ordenado da geração anterior, tudo recalculado.
    await adapter.readVerifiedHistoryGeneration(previousGenerationId);
    await adapter.clearInactiveGeneration(generationId);
    return true;
  } catch {
    // Órfã preservada: perder dados seria muito pior do que deixar lixo inativo.
    return false;
  }
}

type RecoveredCoreOutcome =
  | 'committed'
  | 'readback-failed'
  | 'core-commit-failed'
  | 'storage-unavailable'
  | 'quota'
  | 'recovery-required';

// Protocolo byte-exato do core, reexecutado na recuperação com o MESMO
// endurecimento do W6.
//
// `targetCoreRaw` sai exclusivamente do receipt — nada é reconstruído, nenhum
// `savedAt` novo é cunhado. A cópia rolante NUNCA é compensada para trás: nem
// `setItem` do valor anterior, nem `removeItem`, nem escrita de melhor esforço.
// Se ela contém `previousCoreRaw`, fica assim; se contém outro valor, fica
// assim; se está ausente, fica ausente; se a leitura dela falha, nem tentamos
// escrevê-la.
async function commitRecoveredTargetCore(input: {
  adapter: LogicalImportRecoveryAdapter;
  storage: StorageLike;
  key: string;
  operationId: string;
  generationId: string;
}): Promise<RecoveredCoreOutcome> {
  const { adapter, storage, key, operationId, generationId } = input;

  const receipt = await adapter.readStorageOperationReceipt(operationId).catch(() => null);
  if (
    receipt === null
    || receipt.kind !== IMPORT_OPERATION_KIND
    || receipt.status !== 'activating'
    || receipt.stagedGenerationId !== generationId
    || receipt.targetCoreRaw === null
  ) {
    return 'readback-failed';
  }
  const target = receipt.targetCoreRaw;
  const previous = receipt.previousCoreRaw;
  const parsedTarget = parsePhysicalEnvelope(target);
  if (
    parsedTarget.status !== 'v2'
    || parsedTarget.envelope.data.historyStorage.generationId !== generationId
    || !isCanonicalIsoInstant(parsedTarget.envelope.savedAt)
  ) {
    return 'recovery-required';
  }

  // A geração ativa precisa ser G AGORA: gravar o core alvo sobre outro mundo
  // criaria exatamente a divergência que este módulo existe para impedir.
  const metadata = await adapter.readMetadata().catch(() => null);
  if (metadata === null) return 'recovery-required';
  if (metadata.activeGeneration !== generationId || metadata.migrationGeneration !== null) {
    return 'recovery-required';
  }

  const beforeCommit = readRaw(storage, key);
  if (!beforeCommit.ok) return 'storage-unavailable';
  if (beforeCommit.raw !== previous) return 'recovery-required';

  const backupKey = `${key}${HYBRID_CORE_BACKUP_SUFFIX}`;
  // Sonda da cópia rolante: se ela nem pode ser lida, este fluxo não tenta
  // gravá-la.
  const backupProbe = readRaw(storage, backupKey);
  if (!backupProbe.ok) return 'storage-unavailable';

  try {
    storage.setItem(backupKey, previous);
  } catch (cause) {
    return isQuotaFailure(cause) ? 'quota' : 'storage-unavailable';
  }
  const backupReadback = readRaw(storage, backupKey);
  if (!backupReadback.ok) return 'storage-unavailable';
  if (backupReadback.raw !== previous) return 'core-commit-failed';

  // Segunda releitura da chave principal: gravar a cópia rolante é uma janela em
  // que outra aba pode ter escrito.
  const beforeWrite = readRaw(storage, key);
  if (!beforeWrite.ok) return 'storage-unavailable';
  if (beforeWrite.raw !== previous) return 'recovery-required';

  let writeError: unknown = null;
  try {
    storage.setItem(key, target);
  } catch (cause) {
    writeError = cause;
  }

  const afterWrite = readRaw(storage, key);
  // Ilegível depois de uma tentativa de escrita: não dá para afirmar nada.
  if (!afterWrite.ok) return 'recovery-required';
  // Escreveu e lançou depois: o efeito venceu, e o journal continua coerente.
  if (afterWrite.raw === target) return 'committed';
  if (afterWrite.raw === previous) {
    if (writeError !== null) return isQuotaFailure(writeError) ? 'quota' : 'storage-unavailable';
    return 'core-commit-failed';
  }
  // Terceiro valor: não adivinha, não sobrescreve, não apaga geração, não marca
  // terminal.
  return 'recovery-required';
}

/**
 * Recupera uma importação lógica v2 que foi interrompida por um reload, um
 * crash ou uma queda de armazenamento.
 *
 * Ela converge para UM dos dois mundos que o journal nomeia — o anterior ou o
 * importado — e nunca para um terceiro. A direção não é escolha: ela é
 * consequência do quanto a operação já tinha materializado antes de parar.
 *
 * Toda evidência vem do journal e do armazenamento atual. O arquivo original não
 * é pedido, não é reconstruído e não é necessário.
 *
 * ISTO NÃO É CHAMADO NO BOOT. Não há Provider, Context, UI nem call site: quem
 * liga esta função à hidratação é o slice D.
 */
export async function recoverLogicalStorageImportV2(
  input: RecoverLogicalStorageImportV2Input,
): Promise<LogicalStorageImportRecoveryResult> {
  const { runtime, adapter, storage, key } = input;
  const requested = input.operationId;

  let steps = 0;
  let operationId: string | null = null;
  let generationId: string | null = null;
  // `null` enquanto nada foi avançado por ESTA execução. É o que distingue
  // `settled` de `already-settled` — e o que torna a segunda execução um no-op
  // observável.
  let outcome: 'settled' | 'reverted' | null = null;
  let cleanupPending = false;
  // Verificação criptográfica válida SÓ para o par (fingerprint, geração): a
  // menor escrita no IndexedDB muda o fingerprint e a prova é descartada.
  let proof: { fingerprint: string; generationId: string; status: 'verified' | 'invalid' } | null = null;

  const fail = (
    reason: LogicalImportRecoveryFailureReason,
    finalAction: LogicalImportRecoveryAction,
  ): LogicalImportRecoveryFailure => ({
    ok: false,
    reason,
    error: RECOVERY_MESSAGES[reason],
    operationId,
    generationId,
    steps,
    finalAction,
    recoveryRequired: true,
    cleanupPending,
  });

  const succeed = (
    status: LogicalImportRecoveryStatus,
    finalAction: LogicalImportRecoveryAction,
  ): LogicalImportRecoverySuccess => ({
    ok: true,
    status,
    operationId,
    generationId,
    steps,
    finalAction,
    recoveryRequired: false,
    cleanupPending,
  });

  // Abertura e triagem física. A fachada A2 é quem abre o IndexedDB, e é ela que
  // distingue "o armazenamento não está utilizável" de "o estado está ambíguo".
  const opening = await runtime.inspectStorageAdministration().catch(() => null);
  if (opening === null) return fail('administration-unavailable', 'observe');
  if (opening.state.status === 'unavailable') {
    return fail(
      opening.state.reason === 'storage-blocked' ? 'storage-unavailable' : 'administration-unavailable',
      'observe',
    );
  }

  while (steps < MAX_RECOVERY_STEPS) {
    steps += 1;

    // -----------------------------------------------------------------------
    // Evidência. Relida INTEIRA a cada passo: nunca se assume que a escrita
    // anterior venceu.
    // -----------------------------------------------------------------------
    const coreRead = readRaw(storage, key);
    const snapshot = await adapter.readStorageAdministrationSnapshot().catch(() => null);
    if (snapshot === null) return fail('administration-unavailable', 'observe');

    // Depois que uma operação é escolhida, o laço passa a segui-la pelo id — do
    // contrário a própria transição para um status terminal a tiraria da lista
    // de operações em aberto e o passo seguinte veria "não há nada para fazer",
    // perdendo o que ESTA execução acabou de produzir.
    const selection = selectRecoverableOperation(snapshot, requested ?? operationId ?? undefined);
    if (selection.status === 'conflict') return fail('operation-conflict', 'observe');
    const receipt = selection.receipt;
    if (receipt !== null) {
      operationId = receipt.operationId;
      generationId = receipt.stagedGenerationId ?? generationId;
    }

    const fingerprint = snapshot.fingerprint;
    const integrityOf = (id: string | null): LogicalImportGenerationIntegrity => (
      id !== null && proof !== null && proof.fingerprint === fingerprint && proof.generationId === id
        ? proof.status
        : 'unknown'
    );

    const decision = resolveLogicalImportRestartRecovery({
      receipt,
      core: coreRead.ok ? { status: 'read', raw: coreRead.raw } : { status: 'unavailable' },
      metadata: {
        activeGeneration: snapshot.metadata.activeGeneration,
        migrationGeneration: snapshot.metadata.migrationGeneration,
        migrationStatus: snapshot.metadata.migrationStatus,
      },
      generations: snapshot.generations.map((entry) => ({ generationId: entry.generationId })),
      previousGenerationIntegrity: integrityOf(receipt?.previousGenerationId ?? null),
      stagedGenerationIntegrity: integrityOf(receipt?.stagedGenerationId ?? null),
      pendingCompletionReceiptCount: snapshot.pendingCompletionReceipts.length,
      unsettledOperationCount: snapshot.unsettledOperations.length,
    });

    // -----------------------------------------------------------------------
    // Execução da decisão. Depois de cada escrita o laço recomeça e o resolvedor
    // roda de novo sobre uma leitura NOVA.
    // -----------------------------------------------------------------------
    switch (decision.action) {
      case 'no-operation':
        // `outcome` só é não nulo se uma operação chegou a ser seguida — e
        // nesse caso o laço a encontra pelo id fixado, nunca por esta ação.
        return succeed(outcome ?? 'no-operation', decision.action);

      case 'already-settled': {
        if (outcome === 'settled') {
          // Inspeção administrativa final: o mundo alvo precisa voltar a ser
          // utilizável, não apenas "não contraditório".
          const final = await runtime.inspectStorageAdministration().catch(() => null);
          if (
            final === null
            || final.state.status !== 'ready'
            || final.activeGenerationId !== generationId
            || final.stagedGenerationId !== null
            || final.unsettledOperations.length !== 0
            || final.pendingCompletionReceiptCount !== 0
            || final.activeGenerationIntegrity === null
            || final.activeGenerationIntegrity.status !== 'verified'
          ) {
            return fail('recovery-required', decision.action);
          }
        }
        return succeed(outcome ?? 'already-settled', decision.action);
      }

      case 'already-reverted': {
        if (decision.cleanupGenerationId !== null) {
          const receiptPrevious = receipt?.previousGenerationId ?? null;
          const cleaned = receiptPrevious !== null && await cleanupRevertedStagingSafely(
            adapter,
            decision.operationId,
            decision.cleanupGenerationId,
            receiptPrevious,
          );
          if (!cleaned) {
            cleanupPending = true;
            return succeed(outcome ?? 'already-reverted', decision.action);
          }
          continue;
        }
        if (outcome === 'reverted') {
          const final = await runtime.inspectStorageAdministration().catch(() => null);
          if (
            final === null
            || final.state.status !== 'ready'
            || final.unsettledOperations.length !== 0
          ) {
            return fail('recovery-required', decision.action);
          }
        }
        return succeed(outcome ?? 'already-reverted', decision.action);
      }

      case 'revert-receipt':
      case 'revert-and-cleanup-staging': {
        const reverted = await revertInterruptedReceipt(runtime, adapter, decision.operationId);
        if (reverted === 'readback-failed') return fail('readback-failed', decision.action);
        if (reverted === 'failed') return fail('recovery-required', decision.action);
        if (reverted === 'reverted') outcome = 'reverted';
        // Sem prova do mundo que fica, G continua no disco de propósito.
        if (decision.action === 'revert-receipt' && decision.generationId !== null) {
          cleanupPending = true;
        }
        continue;
      }

      case 'activate-generation': {
        // Verificação integral de G ANTES da ativação, além da que a própria
        // primitiva refaz dentro da transação.
        const verified = await adapter
          .readVerifiedHistoryGeneration(decision.generationId)
          .catch(() => null);
        if (
          verified === null
          || verified.generationId !== decision.generationId
          || verified.manifest.generationId !== decision.generationId
          || !verified.manifest.verified
        ) {
          proof = { fingerprint, generationId: decision.generationId, status: 'invalid' };
          return fail('verification-failed', decision.action);
        }
        try {
          const activation = await adapter.rollbackToHistoryGeneration({
            targetGenerationId: decision.generationId,
            expectedActiveGenerationId: decision.previousGenerationId,
          });
          if (
            activation.activeGeneration !== decision.generationId
            || activation.migrationGeneration !== null
          ) {
            return fail('activation-failed', decision.action);
          }
        } catch {
          // Idempotência: a ativação pode ter commitado e falhado só depois.
          const observed = await adapter.readMetadata().catch(() => null);
          if (observed === null || observed.activeGeneration !== decision.generationId) {
            return fail('activation-failed', decision.action);
          }
        }
        continue;
      }

      case 'verify-target': {
        const verified = await adapter
          .readVerifiedHistoryGeneration(decision.generationId)
          .catch(() => null);
        proof = {
          fingerprint,
          generationId: decision.generationId,
          status: verified !== null
            && verified.generationId === decision.generationId
            && verified.manifest.generationId === decision.generationId
            && verified.manifest.verified
            ? 'verified'
            : 'invalid',
        };
        continue;
      }

      case 'commit-target-core': {
        const committed = await commitRecoveredTargetCore({
          adapter,
          storage,
          key,
          operationId: decision.operationId,
          generationId: decision.generationId,
        });
        if (committed !== 'committed') return fail(committed, decision.action);
        continue;
      }

      case 'mark-activated': {
        const before = await adapter
          .readStorageOperationReceipt(decision.operationId)
          .catch(() => null);
        if (
          before === null
          || before.kind !== IMPORT_OPERATION_KIND
          || before.status !== 'activating'
          || before.stagedGenerationId !== decision.generationId
          || before.targetCoreRaw === null
        ) {
          return fail('readback-failed', decision.action);
        }
        const coreBefore = readRaw(storage, key);
        if (!coreBefore.ok) return fail('storage-unavailable', decision.action);
        if (coreBefore.raw !== before.targetCoreRaw) return fail('recovery-required', decision.action);
        try {
          const advanced = await adapter.transitionStorageOperationIfUnambiguous({
            operationId: decision.operationId,
            expectedStatus: 'activating',
            nextStatus: 'activated',
            expectedActiveGenerationId: decision.generationId,
          });
          if (advanced.status !== 'activated') return fail('readback-failed', decision.action);
        } catch {
          // Idempotência: a transação pode ter commitado e falhado depois.
          const current = await adapter
            .readStorageOperationReceipt(decision.operationId)
            .catch(() => null);
          if (current === null || current.status !== 'activated') {
            return fail('recovery-required', decision.action);
          }
        }
        // A primitiva não reconfere `stagedGenerationId`, `targetCoreRaw` nem o
        // mundo anterior dentro da própria transação (janela TOCTOU do W8, que
        // só um owner-token fecha). Aqui a mutação é barrada antes do
        // settlement.
        const after = await adapter
          .readStorageOperationReceipt(decision.operationId)
          .catch(() => null);
        if (
          after === null
          || after.status !== 'activated'
          || after.kind !== IMPORT_OPERATION_KIND
          || after.stagedGenerationId !== decision.generationId
          || after.targetCoreRaw !== before.targetCoreRaw
          || after.previousCoreRaw !== before.previousCoreRaw
          || after.previousGenerationId !== before.previousGenerationId
        ) {
          return fail('readback-failed', decision.action);
        }
        const coreAfter = readRaw(storage, key);
        if (!coreAfter.ok || coreAfter.raw !== before.targetCoreRaw) {
          return fail('recovery-required', decision.action);
        }
        continue;
      }

      case 'settle': {
        let advanced = false;
        try {
          await runtime.transitionStorageOperation({
            operationId: decision.operationId,
            expectedStatus: 'activated',
            nextStatus: 'settled',
          });
          advanced = true;
        } catch {
          // Idempotência: a releitura decide, não a exceção.
        }
        const settled = await adapter
          .readStorageOperationReceipt(decision.operationId)
          .catch(() => null);
        if (settled === null || settled.status !== 'settled') {
          return fail('recovery-required', decision.action);
        }
        // Sem `advanced`, outra execução concorrente que apenas OBSERVOU o
        // settlement relataria tê-lo produzido.
        if (advanced) outcome = 'settled';
        continue;
      }

      case 'recovery-required':
      case 'impossible-state':
        return fail(RESTART_REASON_TO_PUBLIC[decision.reason], decision.action);
    }
  }

  // Limite atingido: nada de recursão, nada de espera, nada de retry por atraso.
  // O journal fica inteiro.
  return fail('recovery-step-limit', 'observe');
}
