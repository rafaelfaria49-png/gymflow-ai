import type { WorkoutSession } from '../types';
import { combineCoreWithHistory, parsePhysicalEnvelope } from './storage-hybrid';
import {
  HistoryDigestCryptoUnavailableError,
  sha256Checksum,
} from './storage-history-integrity';
import type { StorageAdminRuntime } from './storage-admin-runtime';
import {
  StorageAdministrationConflictError,
  StorageAdministrationUnavailableError,
} from './storage-admin-runtime';
import { utf8Bytes } from './storage';
import {
  HYBRID_STORAGE_VERSION,
  type PersistedState,
} from './storage-types';
import { isRecord, validatePersistedStateShape } from './storage-validation';

// Formato externo LÓGICO v2 (GOAL-17B-002D-B, slice B).
//
// O backup v1 (`storage-export.ts`) copia o envelope físico monolítico inteiro:
// `{ format, formatVersion: 1, appStorageVersion: 1, envelope: { v, savedAt,
// data } }`. Isso funcionava enquanto o armazenamento ERA o envelope. Com o
// híbrido v2 o estado do usuário vive em dois lugares — core v2 no
// `localStorage` e histórico numa geração verificada do IndexedDB — e nenhum
// dos dois sozinho descreve o usuário.
//
// Este módulo entrega o formato que descreve: um payload lógico equivalente a
// `PersistedState`, sem UM ÚNICO detalhe físico. Nenhum `generationId`, nenhum
// manifest, nenhum receipt, nenhum raw, nenhum nome de chave do `localStorage`.
// Um arquivo v2 pode ser lido, validado e (numa etapa futura) restaurado sem
// que o IndexedDB exista.
//
// ESCOPO DESTE SLICE: formato, captura read-only, digest, serialização compacta
// e inspeção. Nada aqui importa, restaura, escreve, baixa arquivo ou toca em
// UI/Provider. Não existe `commitLogicalStorageImportV2` — de propósito.
//
// O protocolo v1 continua intacto e separado: `storage-export.ts` não conhece
// este módulo, segue exportando só o envelope monolítico e segue recusando
// `formatVersion: 2`.

export const LOGICAL_BACKUP_FORMAT_VERSION = 2 as const;
export const LOGICAL_BACKUP_SCHEMA_VERSION = 1 as const;

// Único valor físico que sobrevive no arquivo: ele diz de QUE armazenamento o
// estado lógico saiu, não como esse armazenamento estava organizado por dentro.
export const LOGICAL_BACKUP_SOURCE_PHYSICAL_STORAGE_VERSION = HYBRID_STORAGE_VERSION;

// Limites próprios. `MAX_IMPORT_BYTES` (5 MiB) continua sendo do fluxo v1 e não
// muda: o arquivo lógico carrega o histórico inteiro, que no v1 já vinha dentro
// do mesmo envelope, mas agora sem indentação e sem teto tão baixo.
export const LOGICAL_BACKUP_LARGE_WARNING_BYTES = 8 * 1024 * 1024;
export const MAX_LOGICAL_BACKUP_BYTES = 25 * 1024 * 1024;

// Domínio explícito do material do digest. Sem ele, o mesmo SHA-256 de um
// payload poderia ser confundido com o digest de outro artefato do sistema.
const LOGICAL_BACKUP_DIGEST_DOMAIN = 'gymflow:logical-backup:v2:';

const PAYLOAD_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export interface GymFlowLogicalBackupV2 {
  format: 'gymflow-backup';
  formatVersion: typeof LOGICAL_BACKUP_FORMAT_VERSION;
  logicalSchemaVersion: typeof LOGICAL_BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  sourcePhysicalStorageVersion: typeof LOGICAL_BACKUP_SOURCE_PHYSICAL_STORAGE_VERSION;
  sourceSavedAt: string;
  payloadDigest: string;
  payload: PersistedState;
}

export interface LogicalBackupPreview {
  exportedAt: string;
  sourceSavedAt: string;
  workoutSessions: number;
  hasActiveWorkout: boolean;
  customPrograms: number;
  weightEntries: number;
  measurementEntries: number;
  bytes: number;
  warning: string | null;
}

export type LogicalBackupExportFailureReason =
  | 'administration-unavailable'
  | 'administration-conflicted'
  | 'administration-interrupted'
  | 'snapshot-changed-during-export'
  | 'invalid-core'
  | 'invalid-logical-state'
  | 'crypto-unavailable'
  | 'serialization'
  | 'too-large';

export type LogicalStorageExportV2Result =
  | {
      ok: true;
      content: string;
      filename: string;
      bytes: number;
      warning: string | null;
      backup: GymFlowLogicalBackupV2;
      preview: LogicalBackupPreview;
    }
  | {
      ok: false;
      reason: LogicalBackupExportFailureReason;
      error: string;
      cause?: unknown;
    };

export type LogicalBackupInspectionFailureReason =
  | 'too-large'
  | 'invalid-json'
  | 'invalid-format'
  | 'unsupported-version'
  | 'unsupported-schema'
  | 'invalid-date'
  | 'invalid-payload'
  | 'duplicate-session-id'
  | 'digest-mismatch'
  | 'crypto-unavailable';

export type LogicalStorageBackupV2Inspection =
  | { ok: true; backup: GymFlowLogicalBackupV2; preview: LogicalBackupPreview }
  | {
      ok: false;
      reason: LogicalBackupInspectionFailureReason;
      error: string;
      cause?: unknown;
    };

// A captura só precisa de duas capacidades da fachada administrativa, e as duas
// são read-only. Declarar o subconjunto em vez de `StorageAdminRuntime` inteiro
// torna impossível — no compilador, não por disciplina — chamar
// `beginStorageOperation`, `transitionStorageOperation`,
// `revertStorageOperationSafely` ou qualquer outra escrita a partir daqui.
export type LogicalBackupRuntime = Pick<
  StorageAdminRuntime,
  'inspectStorageAdministration' | 'readVerifiedAdministrationGeneration'
>;

export interface LogicalBackupSnapshot {
  state: PersistedState;
  sourceSavedAt: string;
}

export type LogicalBackupSnapshotResult =
  | { status: 'ok'; snapshot: LogicalBackupSnapshot }
  | {
      status: 'failed';
      reason: Exclude<LogicalBackupExportFailureReason, 'too-large' | 'serialization' | 'crypto-unavailable'>;
      error: string;
      cause?: unknown;
    };

// Campos físicos que NUNCA podem aparecer na raiz de um payload lógico. A lista
// é explícita (e não "tudo que não é campo conhecido") para que um arquivo
// gerado por uma versão futura com um campo lógico novo não seja recusado por
// engano, enquanto um vazamento físico continua sendo recusado sempre.
export const FORBIDDEN_LOGICAL_PAYLOAD_FIELDS: readonly string[] = [
  'historyStorage',
  'generationId',
  'activeGeneration',
  'migrationGeneration',
  'generationManifests',
  'recordDigests',
  'storageOperationReceipts',
  'completionReceipts',
  'legacySnapshots',
  'quarantine',
  'previousCoreRaw',
  'targetCoreRaw',
];

const DANGEROUS_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype'];

const REQUIRED_PAYLOAD_FIELDS: readonly (keyof PersistedState)[] = [
  'user',
  'weeklyPlan',
  'customPrograms',
  'activeWorkout',
  'activeWorkoutStartedAt',
  'restTimerEndAt',
  'restTimerTotalSeconds',
  'restTimerLabel',
  'workoutHistory',
  'weightHistory',
  'measurementsHistory',
  'nutrition',
  'achievements',
  'challenges',
  'favoriteExercises',
  'recentlyViewedVideoIds',
];

const PAYLOAD_ARRAY_FIELDS: readonly (keyof PersistedState)[] = [
  'weeklyPlan',
  'customPrograms',
  'workoutHistory',
  'weightHistory',
  'measurementsHistory',
  'achievements',
  'challenges',
  'favoriteExercises',
  'recentlyViewedVideoIds',
];

const PAYLOAD_NULLABLE_NUMBER_FIELDS: readonly (keyof PersistedState)[] = [
  'activeWorkoutStartedAt',
  'restTimerEndAt',
  'restTimerTotalSeconds',
];

const MEASUREMENT_NUMBER_FIELDS: readonly string[] = ['chest', 'waist', 'hips', 'arms'];

// Serialização canônica falhou porque o valor não é JSON válido de verdade
// (NaN, Infinity, BigInt). Converter silenciosamente para `null` — o que
// `JSON.stringify` faz — produziria um digest que assina um estado diferente do
// que existe na memória. A mensagem carrega o CAMINHO, nunca o valor.
export class LogicalBackupSerializationError extends Error {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`Não foi possível serializar o payload lógico em ${path}: ${detail}`);
    this.name = 'LogicalBackupSerializationError';
    this.path = path;
  }
}

export type LogicalBackupPayloadValidation =
  | { status: 'valid'; payload: PersistedState }
  | {
      status: 'invalid';
      reason: 'invalid-payload' | 'duplicate-session-id';
      detail: string;
    };

function invalidPayload(detail: string): LogicalBackupPayloadValidation {
  return { status: 'invalid', reason: 'invalid-payload', detail };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function hasDangerousKeys(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return DANGEROUS_KEYS.some((key) => hasOwn(value, key));
}

// Validação COMPLETA do payload lógico v2.
//
// `validatePersistedStateShape` continua sendo a validação permissiva do
// runtime — ela aceita campo ausente de propósito, porque precisa tolerar
// estados salvos por versões anteriores do app. Um arquivo de backup não tem
// essa desculpa: ele é gerado agora, por este código, e é a única fonte de uma
// restauração futura. Campo ausente aqui é arquivo quebrado, não legado.
//
// A semântica do validador permissivo NÃO muda: ele é reutilizado como base e
// esta função só ACRESCENTA exigências.
export function validateLogicalBackupPayload(value: unknown): LogicalBackupPayloadValidation {
  if (!isRecord(value)) return invalidPayload('O payload não é um objeto.');
  if (hasDangerousKeys(value)) {
    return invalidPayload('O payload declara uma chave de protótipo perigosa.');
  }

  for (const field of FORBIDDEN_LOGICAL_PAYLOAD_FIELDS) {
    if (hasOwn(value, field)) {
      return invalidPayload(`O payload lógico não pode carregar o campo físico ${field}.`);
    }
  }

  for (const field of REQUIRED_PAYLOAD_FIELDS) {
    if (!hasOwn(value, field)) return invalidPayload(`O payload não declara o campo ${field}.`);
  }

  if (!validatePersistedStateShape(value)) {
    return invalidPayload('O payload não satisfaz a forma básica de PersistedState.');
  }

  for (const field of PAYLOAD_ARRAY_FIELDS) {
    if (!Array.isArray(value[field])) return invalidPayload(`O campo ${field} precisa ser um array.`);
  }

  for (const field of PAYLOAD_NULLABLE_NUMBER_FIELDS) {
    const fieldValue = value[field];
    if (fieldValue !== null && !isFiniteNumber(fieldValue)) {
      return invalidPayload(`O campo ${field} precisa ser um número finito ou null.`);
    }
  }

  if (value.restTimerLabel !== null && typeof value.restTimerLabel !== 'string') {
    return invalidPayload('O campo restTimerLabel precisa ser uma string ou null.');
  }
  if (value.user !== null && !isRecord(value.user)) {
    return invalidPayload('O campo user precisa ser um objeto ou null.');
  }
  if (value.activeWorkout !== null && !isRecord(value.activeWorkout)) {
    return invalidPayload('O campo activeWorkout precisa ser um objeto ou null.');
  }
  if (!isRecord(value.nutrition)) {
    return invalidPayload('O campo nutrition precisa ser um objeto.');
  }

  for (const field of ['favoriteExercises', 'recentlyViewedVideoIds'] as const) {
    const entries = value[field] as unknown[];
    if (entries.some((entry) => typeof entry !== 'string')) {
      return invalidPayload(`O campo ${field} só aceita strings.`);
    }
  }

  const weightInvalid = (value.weightHistory as unknown[]).some((entry) => (
    !isRecord(entry) || typeof entry.date !== 'string' || !isFiniteNumber(entry.value)
  ));
  if (weightInvalid) {
    return invalidPayload('Um registro de weightHistory não tem date string e value numérico finito.');
  }

  const measurementInvalid = (value.measurementsHistory as unknown[]).some((entry) => (
    !isRecord(entry)
    || typeof entry.date !== 'string'
    || MEASUREMENT_NUMBER_FIELDS.some((field) => !isFiniteNumber(entry[field]))
  ));
  if (measurementInvalid) {
    return invalidPayload('Um registro de measurementsHistory tem data ou medida inválida.');
  }

  const sessions = value.workoutHistory as unknown[];
  const seen = new Set<string>();
  for (let index = 0; index < sessions.length; index += 1) {
    const session = sessions[index];
    if (!isRecord(session)) {
      return invalidPayload(`A sessão ${index} do histórico não é um objeto.`);
    }
    if (typeof session.id !== 'string' || session.id.length === 0) {
      return invalidPayload(`A sessão ${index} do histórico não tem um id não vazio.`);
    }
    // Campo obrigatório de `WorkoutSession`, mas conferido só quando presente:
    // exigir presença recusaria históricos hoje válidos, e o objetivo aqui é
    // recusar o que é inválido, não apertar o domínio de treino.
    if (hasOwn(session, 'exercises') && !Array.isArray(session.exercises)) {
      return invalidPayload(`A sessão ${index} do histórico tem exercises inválido.`);
    }
    if (seen.has(session.id)) {
      return {
        status: 'invalid',
        reason: 'duplicate-session-id',
        detail: `O histórico repete o id de sessão ${session.id}.`,
      };
    }
    seen.add(session.id);
  }

  return { status: 'valid', payload: value as unknown as PersistedState };
}

const DROP = Symbol('drop');

// Canonicalização determinística. Chaves de objeto ordenadas recursivamente,
// ordem de array preservada (`workoutHistory` é newest-first e continua assim),
// nada reordenado por conteúdo. Números não finitos e BigInt param a
// serialização em vez de virarem `null` silencioso.
function canonicalizeLogicalValue(value: unknown, path: string): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const normalized = canonicalizeLogicalValue(item, `${path}[${index}]`);
      // Mesma regra do `JSON.stringify`: buraco de array vira `null`. Não é
      // conversão de número inválido — é a única representação JSON possível.
      return normalized === DROP ? null : normalized;
    });
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries: [string, unknown][] = [];
    for (const key of Object.keys(record).sort()) {
      const normalized = canonicalizeLogicalValue(record[key], `${path}.${key}`);
      if (normalized !== DROP) entries.push([key, normalized]);
    }
    return Object.fromEntries(entries);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new LogicalBackupSerializationError(path, 'número não finito não é JSON válido.');
    }
    return value;
  }
  if (typeof value === 'bigint') {
    throw new LogicalBackupSerializationError(path, 'BigInt não é JSON válido.');
  }
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return DROP;
  }
  return value;
}

// Forma canônica do payload lógico. É ela que entra no digest E no arquivo:
// assim o material assinado e o conteúdo publicado nunca podem divergir por
// ordem de chave.
export function serializeLogicalPayloadCanonically(payload: PersistedState): string {
  const canonical = canonicalizeLogicalValue(payload, 'payload');
  if (canonical === DROP) {
    throw new LogicalBackupSerializationError('payload', 'o payload não é serializável.');
  }
  return JSON.stringify(canonical);
}

export function logicalPayloadDigestMaterial(canonicalPayload: string): string {
  return `${LOGICAL_BACKUP_DIGEST_DOMAIN}${canonicalPayload}`;
}

// Digest do payload LÓGICO, com domínio explícito. Reutiliza `sha256Checksum`
// — não existe uma segunda implementação de SHA-256 no projeto e não é aqui que
// vai nascer. Sem Web Crypto ele lança `HistoryDigestCryptoUnavailableError`, e
// esse erro sobe: nunca há fallback para hash fraco, comprimento ou contagem.
export async function computeLogicalPayloadDigest(
  payload: PersistedState,
  subtleCrypto?: SubtleCrypto | null,
): Promise<string> {
  return sha256Checksum(
    logicalPayloadDigestMaterial(serializeLogicalPayloadCanonically(payload)),
    subtleCrypto,
  );
}

function describeCause(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function timestampForFilename(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', '-').replace(':', '');
}

function isValidIsoInstant(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

export function describeLogicalBackupSize(bytes: number): string | null {
  if (bytes <= LOGICAL_BACKUP_LARGE_WARNING_BYTES) return null;
  const mib = (bytes / (1024 * 1024)).toFixed(1);
  return `O backup lógico tem ${mib} MiB. Arquivos grandes podem falhar ao ser salvos`
    + ' ou reabertos em aparelhos com pouca memória; guarde-o em um local com espaço livre.';
}

function buildPreview(
  backup: GymFlowLogicalBackupV2,
  bytes: number,
): LogicalBackupPreview {
  const payload = backup.payload;
  return {
    exportedAt: backup.exportedAt,
    sourceSavedAt: backup.sourceSavedAt,
    workoutSessions: payload.workoutHistory.length,
    hasActiveWorkout: Boolean(payload.activeWorkout),
    customPrograms: payload.customPrograms.length,
    weightEntries: payload.weightHistory.length,
    measurementEntries: payload.measurementsHistory.length,
    bytes,
    warning: describeLogicalBackupSize(bytes),
  };
}

function snapshotFailure(
  reason: Extract<LogicalBackupSnapshotResult, { status: 'failed' }>['reason'],
  error: string,
  cause?: unknown,
): LogicalBackupSnapshotResult {
  return { status: 'failed', reason, error, cause };
}

// Duas fotos do MESMO estado físico com a leitura verificada do histórico no
// meio. Se qualquer coisa entre elas divergir, não existe backup: escolher uma
// das leituras produziria um arquivo que combina o core de um instante com o
// histórico de outro — exatamente o defeito que este protocolo existe para
// impedir.
//
// Read-only por construção: `LogicalBackupRuntime` não expõe nenhuma escrita.
export async function captureLogicalBackupSnapshot(
  runtime: LogicalBackupRuntime,
): Promise<LogicalBackupSnapshotResult> {
  const first = await runtime.inspectStorageAdministration();
  if (first.state.status === 'unavailable') {
    return snapshotFailure('administration-unavailable', first.state.detail, first.state.cause);
  }
  if (first.state.status === 'interrupted') {
    return snapshotFailure(
      'administration-interrupted',
      `Existe uma operação administrativa em aberto (${first.state.operation.operationId}).`,
    );
  }
  if (first.state.status === 'conflicted') {
    return snapshotFailure('administration-conflicted', first.state.detail, first.state.cause);
  }

  if (first.physicalStorageVersion !== LOGICAL_BACKUP_SOURCE_PHYSICAL_STORAGE_VERSION) {
    return snapshotFailure(
      'invalid-core',
      `A versão física observada não é ${LOGICAL_BACKUP_SOURCE_PHYSICAL_STORAGE_VERSION}.`,
    );
  }
  const activeGenerationId = first.activeGenerationId;
  if (!activeGenerationId) {
    return snapshotFailure('invalid-core', 'Não existe geração ativa de histórico.');
  }
  const coreRawObserved = first.coreRawObserved;
  if (coreRawObserved === null) {
    return snapshotFailure('invalid-core', 'O diagnóstico não observou o core físico v2.');
  }
  if (first.administrationFingerprint === null) {
    return snapshotFailure('invalid-core', 'O diagnóstico não produziu impressão digital administrativa.');
  }
  if (first.pendingCompletionReceiptCount !== 0) {
    return snapshotFailure('administration-conflicted', 'Existe conclusão de treino pendente.');
  }
  if (first.unsettledOperations.length !== 0) {
    return snapshotFailure('administration-conflicted', 'Existe operação administrativa não liquidada.');
  }

  const parsed = parsePhysicalEnvelope(coreRawObserved);
  if (parsed.status !== 'v2') {
    return snapshotFailure('invalid-core', 'O core observado não é um envelope físico v2 válido.');
  }
  if (parsed.envelope.data.historyStorage.generationId !== activeGenerationId) {
    return snapshotFailure(
      'invalid-core',
      'O core aponta para uma geração de histórico diferente da geração ativa.',
    );
  }
  if (!isValidIsoInstant(parsed.envelope.savedAt)) {
    return snapshotFailure('invalid-core', 'O core observado não tem um savedAt ISO-8601 válido.');
  }

  let sessions: WorkoutSession[];
  try {
    const verified = await runtime.readVerifiedAdministrationGeneration(activeGenerationId);
    sessions = verified.sessions;
  } catch (error) {
    if (error instanceof StorageAdministrationUnavailableError) {
      return snapshotFailure('administration-unavailable', error.message, error);
    }
    if (error instanceof StorageAdministrationConflictError) {
      return snapshotFailure('administration-conflicted', error.message, error);
    }
    return snapshotFailure(
      'administration-conflicted',
      `A leitura verificada da geração ativa falhou: ${describeCause(error, 'sem detalhe')}`,
      error,
    );
  }

  const second = await runtime.inspectStorageAdministration();
  if (second.state.status !== 'ready') {
    return snapshotFailure(
      'snapshot-changed-during-export',
      `O estado administrativo deixou de ser ready durante a exportação (${second.state.status}).`,
    );
  }

  const divergence = second.coreRawObserved !== coreRawObserved
    ? 'o core físico v2 mudou'
    : second.activeGenerationId !== activeGenerationId
      ? 'a geração ativa mudou'
      : second.administrationFingerprint !== first.administrationFingerprint
        ? 'a impressão digital administrativa mudou'
        : second.physicalStorageVersion !== first.physicalStorageVersion
          ? 'a versão física mudou'
          : second.unsettledOperations.length !== 0
            ? 'apareceu uma operação administrativa em aberto'
            : second.pendingCompletionReceiptCount !== 0
              ? 'apareceu uma conclusão de treino pendente'
              : null;
  if (divergence !== null) {
    return snapshotFailure(
      'snapshot-changed-during-export',
      `O armazenamento mudou durante a exportação: ${divergence}.`,
    );
  }

  // Core lógico: `historyStorage` sai, `workoutHistory` verificado entra.
  const state = combineCoreWithHistory(parsed.envelope.data, [...sessions]);
  const validation = validateLogicalBackupPayload(state);
  if (validation.status !== 'valid') {
    // Tanto campo faltando quanto id de sessão duplicado descrevem a mesma
    // coisa aqui: o estado lógico reconstruído do armazenamento REAL não é
    // exportável. Não é um problema do arquivo — não existe arquivo ainda.
    return snapshotFailure('invalid-logical-state', validation.detail);
  }

  return {
    status: 'ok',
    snapshot: { state: validation.payload, sourceSavedAt: parsed.envelope.savedAt },
  };
}

export interface CreateLogicalStorageExportV2Input {
  runtime: LogicalBackupRuntime;
  now?: Date;
  // Injeção permitida apenas para teste: em produção `sha256Checksum` já usa o
  // Web Crypto global. `null` força o caminho `crypto-unavailable`.
  subtleCrypto?: SubtleCrypto | null;
}

// Exportação LÓGICA v2, read-only de ponta a ponta.
//
// Não cria `Blob`, não cria `URL`, não cria `<a>`, não dispara download: quem
// quiser salvar o arquivo chama `downloadTextFile` (v1) por fora — e nesta
// etapa ninguém chama. Nada aqui escreve no `localStorage` ou no IndexedDB.
export async function createLogicalStorageExportV2(
  input: CreateLogicalStorageExportV2Input,
): Promise<LogicalStorageExportV2Result> {
  const now = input.now ?? new Date();
  const captured = await captureLogicalBackupSnapshot(input.runtime);
  if (captured.status !== 'ok') {
    return { ok: false, reason: captured.reason, error: captured.error, cause: captured.cause };
  }

  let canonicalPayload: string;
  try {
    canonicalPayload = serializeLogicalPayloadCanonically(captured.snapshot.state);
  } catch (error) {
    return {
      ok: false,
      reason: 'serialization',
      error: describeCause(error, 'Não foi possível serializar o payload lógico.'),
      cause: error,
    };
  }

  let payloadDigest: string;
  try {
    payloadDigest = await sha256Checksum(
      logicalPayloadDigestMaterial(canonicalPayload),
      input.subtleCrypto,
    );
  } catch (error) {
    if (error instanceof HistoryDigestCryptoUnavailableError) {
      return {
        ok: false,
        reason: 'crypto-unavailable',
        error: 'Web Crypto indisponível: o backup lógico não pode ser gerado sem digest.',
        cause: error,
      };
    }
    return {
      ok: false,
      reason: 'crypto-unavailable',
      error: describeCause(error, 'O cálculo do digest do payload lógico falhou.'),
      cause: error,
    };
  }

  const backup: GymFlowLogicalBackupV2 = {
    format: 'gymflow-backup',
    formatVersion: LOGICAL_BACKUP_FORMAT_VERSION,
    logicalSchemaVersion: LOGICAL_BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    sourcePhysicalStorageVersion: LOGICAL_BACKUP_SOURCE_PHYSICAL_STORAGE_VERSION,
    sourceSavedAt: captured.snapshot.sourceSavedAt,
    payloadDigest,
    // A forma canônica é o que vai para o arquivo: reparsear o material já
    // assinado garante que `payloadDigest` descreve exatamente o que está
    // publicado, e não uma variante com outra ordem de chaves.
    payload: JSON.parse(canonicalPayload) as PersistedState,
  };

  // Compacto de propósito: sem `null, 2`. O histórico completo já é grande o
  // bastante sem gastar bytes com indentação de apresentação.
  const content = JSON.stringify(backup);
  const bytes = utf8Bytes(content);
  if (bytes > MAX_LOGICAL_BACKUP_BYTES) {
    return {
      ok: false,
      reason: 'too-large',
      error: `O backup lógico tem ${bytes} bytes e excede o limite de ${MAX_LOGICAL_BACKUP_BYTES} bytes.`,
    };
  }

  return {
    ok: true,
    content,
    filename: `gymflow-backup-v2-${timestampForFilename(now)}.json`,
    bytes,
    warning: describeLogicalBackupSize(bytes),
    backup,
    preview: buildPreview(backup, bytes),
  };
}

function inspectionFailure(
  reason: LogicalBackupInspectionFailureReason,
  error: string,
  cause?: unknown,
): LogicalStorageBackupV2Inspection {
  return { ok: false, reason, error, cause };
}

// Inspeção READ-ONLY de um arquivo v2. Ela não abre storage nenhum: não toca no
// `localStorage`, não abre o IndexedDB, não conhece a chave do app. Um arquivo
// pode ser conferido inteiro num aparelho onde o GymFlow nunca rodou.
//
// Não existe `commitLogicalStorageImportV2` neste slice — a inspeção termina em
// preview, e ponto.
export async function inspectLogicalStorageBackupV2(
  raw: string,
  declaredBytes = utf8Bytes(raw),
  subtleCrypto?: SubtleCrypto | null,
): Promise<LogicalStorageBackupV2Inspection> {
  // O maior entre o declarado e o real: um `declaredBytes` menor nunca encolhe
  // o arquivo de verdade, e um maior é respeitado como o custo que o chamador
  // afirma ter medido (o `File.size` do disco, por exemplo).
  const bytes = Math.max(declaredBytes, utf8Bytes(raw));
  if (bytes > MAX_LOGICAL_BACKUP_BYTES) {
    return inspectionFailure(
      'too-large',
      `O arquivo tem ${bytes} bytes e excede o limite de ${MAX_LOGICAL_BACKUP_BYTES} bytes.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return inspectionFailure('invalid-json', describeCause(error, 'JSON inválido.'), error);
  }

  if (!isRecord(parsed) || parsed.format !== 'gymflow-backup') {
    return inspectionFailure('invalid-format', 'Formato de backup desconhecido.');
  }
  if (hasDangerousKeys(parsed)) {
    return inspectionFailure('invalid-format', 'O arquivo declara uma chave de protótipo perigosa.');
  }
  if (parsed.formatVersion !== LOGICAL_BACKUP_FORMAT_VERSION) {
    return inspectionFailure('unsupported-version', 'Versão de formato de backup não suportada.');
  }
  if (parsed.logicalSchemaVersion !== LOGICAL_BACKUP_SCHEMA_VERSION) {
    return inspectionFailure('unsupported-schema', 'Versão de esquema lógico não suportada.');
  }
  if (!isValidIsoInstant(parsed.exportedAt) || !isValidIsoInstant(parsed.sourceSavedAt)) {
    return inspectionFailure('invalid-date', 'O arquivo tem exportedAt ou sourceSavedAt inválido.');
  }
  if (parsed.sourcePhysicalStorageVersion !== LOGICAL_BACKUP_SOURCE_PHYSICAL_STORAGE_VERSION) {
    return inspectionFailure('unsupported-version', 'Versão física de origem não suportada.');
  }
  if (typeof parsed.payloadDigest !== 'string' || !PAYLOAD_DIGEST_PATTERN.test(parsed.payloadDigest)) {
    return inspectionFailure('invalid-format', 'O digest declarado não está no formato sha256:<hex>.');
  }

  const validation = validateLogicalBackupPayload(parsed.payload);
  if (validation.status !== 'valid') {
    return inspectionFailure(validation.reason, validation.detail);
  }

  let recomputed: string;
  try {
    recomputed = await sha256Checksum(
      logicalPayloadDigestMaterial(serializeLogicalPayloadCanonically(validation.payload)),
      subtleCrypto,
    );
  } catch (error) {
    if (error instanceof LogicalBackupSerializationError) {
      return inspectionFailure('invalid-payload', error.message, error);
    }
    return inspectionFailure(
      'crypto-unavailable',
      'Web Crypto indisponível: o digest do arquivo não pôde ser reconferido.',
      error,
    );
  }

  if (recomputed !== parsed.payloadDigest) {
    return inspectionFailure('digest-mismatch', 'O digest do payload não confere com o conteúdo do arquivo.');
  }

  const backup: GymFlowLogicalBackupV2 = {
    format: 'gymflow-backup',
    formatVersion: LOGICAL_BACKUP_FORMAT_VERSION,
    logicalSchemaVersion: LOGICAL_BACKUP_SCHEMA_VERSION,
    exportedAt: parsed.exportedAt,
    sourcePhysicalStorageVersion: LOGICAL_BACKUP_SOURCE_PHYSICAL_STORAGE_VERSION,
    sourceSavedAt: parsed.sourceSavedAt,
    payloadDigest: parsed.payloadDigest,
    payload: validation.payload,
  };

  return { ok: true, backup, preview: buildPreview(backup, bytes) };
}
