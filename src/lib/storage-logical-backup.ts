import type { WorkoutSession } from '../types';
import type { VerifiedHistoryGeneration } from './storage-adapter';
import { combineCoreWithHistory, parsePhysicalEnvelope } from './storage-hybrid';
import {
  type HistoryGenerationManifest,
  HistoryDigestCryptoUnavailableError,
  isHistoryGenerationManifest,
  serializeWorkoutHistoryDeterministically,
  sha256Checksum,
} from './storage-history-integrity';
import type { StorageAdministrationSnapshot, StorageAdminRuntime } from './storage-admin-runtime';
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

// Formato externo LÓGICO v2 (GOAL-17B-002D-B, slice B) + corretivo 046.
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
// O corretivo 046 fechou os bloqueantes Classe C da auditoria independente:
//
// 1. CORRIDA ABA. Comparar apenas os dois diagnósticos que cercam a leitura
//    verificada não prova nada: um histórico que vai de H1 para H2 e volta byte
//    a byte para H1 devolve dois diagnósticos idênticos, com o MESMO
//    fingerprint, enquanto a leitura do meio carregou H2. A leitura
//    intermediária agora é comparada com a geração verificada DESCRITA pelos
//    dois diagnósticos, não só com o estado administrativo em volta dela.
// 2. CONTRATO EXTERNO ABERTO. O arquivo passa a ter exatamente oito chaves
//    próprias enumeráveis — nada de campo extra, símbolo, getter, propriedade
//    não enumerável ou protótipo customizado.
// 3. PAYLOAD RAIZ ABERTO. O payload passa a ter exatamente os 16 campos
//    lógicos; qualquer campo raiz desconhecido é recusado estruturalmente.
// 4. NORMALIZAÇÃO SILENCIOSA. `undefined`, função, símbolo, `Date`, `Map`,
//    `Set`, `TypedArray` e afins nunca mais viram ausência, `{}` ou `null` no
//    caminho do digest: a árvore inteira é validada antes de qualquer
//    serialização.
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

// Instante UTC canônico, exatamente o que `Date.prototype.toISOString` produz.
// `Date.parse` aceita muito mais do que isso (data sem hora, offset local, RFC
// textual, ISO sem milissegundos) e aceitar o que ele aceita significaria
// gravar num arquivo de backup uma data cujo significado depende do fuso de
// quem abriu.
const CANONICAL_ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

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
  | 'invalid-timestamp'
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
  | 'invalid-size'
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
      reason: Exclude<
        LogicalBackupExportFailureReason,
        'too-large' | 'serialization' | 'crypto-unavailable' | 'invalid-timestamp'
      >;
      error: string;
      cause?: unknown;
    };

// ---------------------------------------------------------------------------
// Contrato externo fechado (PARTE 2)
// ---------------------------------------------------------------------------

export const LOGICAL_BACKUP_ENVELOPE_FIELDS: readonly string[] = [
  'format',
  'formatVersion',
  'logicalSchemaVersion',
  'exportedAt',
  'sourcePhysicalStorageVersion',
  'sourceSavedAt',
  'payloadDigest',
  'payload',
];

const ENVELOPE_FIELD_SET = new Set(LOGICAL_BACKUP_ENVELOPE_FIELDS);

// Campos físicos que NUNCA podem aparecer na raiz de um payload lógico. Desde o
// corretivo 046 o payload é fechado nos 16 campos lógicos, então esta lista não
// é mais o que barra um vazamento — ela existe para que o vazamento físico
// tenha uma mensagem PRECISA (o nome vem daqui, de uma constante, nunca do
// arquivo), enquanto um campo desconhecido qualquer cai na recusa genérica.
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

// Nomes de campo que podem aparecer numa mensagem de erro. Um caminho só é
// montado com nomes desta lista e índices numéricos: uma chave desconhecida —
// que num payload adulterado pode ser conteúdo do usuário — nunca é impressa.
// Lista incompleta só deixa o caminho menos preciso; ela nunca vaza.
const SAFE_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  ...REQUIRED_PAYLOAD_FIELDS,
  ...LOGICAL_BACKUP_ENVELOPE_FIELDS,
  ...FORBIDDEN_LOGICAL_PAYLOAD_FIELDS,
  ...DANGEROUS_KEYS,
  ...MEASUREMENT_NUMBER_FIELDS,
  'id',
  'name',
  'date',
  'value',
  'duration',
  'calories',
  'exercises',
  'xpEarned',
  'totalVolume',
  'prsDetected',
  'sourceProgramId',
  'sourceProgramDayId',
  'sourceProgramName',
  'sourceProgramDayName',
  'status',
  'startedAt',
  'endedAt',
  'exerciseId',
  'muscleGroup',
  'sets',
  'notes',
  'repRange',
  'targetRPE',
  'restSec',
  'progressionNote',
  'plannedSlotIndex',
  'plannedExerciseId',
  'entryOrigin',
  'entryStatus',
  'plannedExerciseName',
  'plannedMuscleGroup',
  'swapReasonCode',
  'swapReasonNote',
  'swappedAt',
  'reps',
  'weight',
  'completed',
  'isWarmup',
  'suggestedWeight',
  'lastWeight',
  'rpe',
  'email',
  'level',
  'goal',
  'gender',
  'age',
  'height',
  'frequency',
  'location',
  'equipments',
  'restrictions',
  'muscleFocus',
  'preference',
  'xp',
  'streak',
  'lastWorkoutDate',
  'waterIntake',
  'waterGoal',
  'premiumStatus',
  'points',
  'connectedSocials',
  'restTimerDefaultSeconds',
  'restTimerSoundEnabled',
  'trainingStatus',
  'returnToTraining',
  'trainingExperienceYears',
  'protein',
  'carbs',
  'fat',
  'water',
  'description',
  'icon',
  'unlocked',
  'unlockedAt',
  'durationDays',
  'xpReward',
  'progress',
  'type',
  'dayName',
  'workoutName',
  'muscleGroups',
  'exerciseCount',
  'isRest',
  'programId',
  'programDayId',
  'planningIssue',
  'trained',
  'durationWeeks',
  'frequencyDays',
  'objective',
  'targetAudience',
  'contraindications',
  'repeatWeeks',
  'weeks',
  'isCustom',
  'number',
  'days',
  'slots',
  'volumeProfile',
  'dayNumber',
  'muscleGroupIds',
  'customName',
  'targetMinutes',
  'series',
  'progression',
  'incrementKg',
]);

const REDACTED_SEGMENT = '<campo>';

function safeSegment(name: string): string {
  return SAFE_PATH_SEGMENTS.has(name) ? name : REDACTED_SEGMENT;
}

function childPath(path: string, name: string): string {
  return `${path}.${safeSegment(name)}`;
}

export type LogicalBackupContractViolation =
  | 'not-an-object'
  | 'custom-prototype'
  | 'symbol-key'
  | 'dangerous-key'
  | 'unknown-field'
  | 'missing-field'
  | 'accessor-field'
  | 'non-enumerable-field';

export type LogicalBackupContractResult =
  | { status: 'valid' }
  | { status: 'invalid'; violation: LogicalBackupContractViolation; field: string | null };

const CONTRACT_MESSAGES: Record<LogicalBackupContractViolation, string> = {
  'not-an-object': 'Formato de backup desconhecido.',
  'custom-prototype': 'O arquivo de backup não é um objeto simples.',
  'symbol-key': 'O arquivo declara uma propriedade simbólica.',
  'dangerous-key': 'O arquivo declara uma chave de protótipo perigosa.',
  'unknown-field': 'O arquivo declara um campo externo desconhecido.',
  'missing-field': 'O arquivo não declara um campo externo obrigatório.',
  'accessor-field': 'O arquivo declara um campo externo como getter ou setter.',
  'non-enumerable-field': 'O arquivo declara um campo externo não enumerável.',
};

function describeContractViolation(result: Extract<LogicalBackupContractResult, { status: 'invalid' }>): string {
  if (result.violation === 'missing-field' && result.field !== null) {
    return `O arquivo não declara o campo ${result.field}.`;
  }
  return CONTRACT_MESSAGES[result.violation];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

// `formatVersion` declarado, lido por descritor para não executar um getter.
// Serve só para distinguir "arquivo de OUTRA versão" de "arquivo v2 malformado":
// um backup v1 real não tem — e não deve ter — as oito chaves do contrato v2, e
// dizer a ele `invalid-format` esconderia a única informação útil que existe.
function declaredFormatVersion(value: unknown): unknown {
  if (!isPlainObject(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, 'formatVersion');
  if (descriptor === undefined || typeof descriptor.get === 'function') return undefined;
  return descriptor.value;
}

// Contrato externo FECHADO: exatamente oito chaves próprias, enumeráveis, de
// dados. Vale tanto para o objeto vindo de `JSON.parse` quanto para um objeto de
// memória — e por isso a checagem é feita com `Reflect.ownKeys` e descritores,
// não com `in` nem com `Object.keys`: símbolo, propriedade não enumerável e
// getter são invisíveis para os dois últimos, e um getter ainda por cima
// executaria código do payload durante a validação.
export function validateLogicalBackupEnvelopeContract(value: unknown): LogicalBackupContractResult {
  if (!isPlainObject(value)) {
    const objectLike = value !== null && typeof value === 'object' && !Array.isArray(value);
    return {
      status: 'invalid',
      violation: objectLike ? 'custom-prototype' : 'not-an-object',
      field: null,
    };
  }

  const ownKeys = Reflect.ownKeys(value);
  for (const key of ownKeys) {
    if (typeof key === 'symbol') return { status: 'invalid', violation: 'symbol-key', field: null };
    if (DANGEROUS_KEYS.includes(key)) {
      return { status: 'invalid', violation: 'dangerous-key', field: null };
    }
    if (!ENVELOPE_FIELD_SET.has(key)) {
      return { status: 'invalid', violation: 'unknown-field', field: null };
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) return { status: 'invalid', violation: 'unknown-field', field: null };
    if (typeof descriptor.get === 'function' || typeof descriptor.set === 'function') {
      return { status: 'invalid', violation: 'accessor-field', field: key };
    }
    if (!descriptor.enumerable) {
      return { status: 'invalid', violation: 'non-enumerable-field', field: key };
    }
  }

  for (const field of LOGICAL_BACKUP_ENVELOPE_FIELDS) {
    if (!ownKeys.includes(field)) {
      return { status: 'invalid', violation: 'missing-field', field };
    }
  }

  return { status: 'valid' };
}

// ---------------------------------------------------------------------------
// Árvore JSON estrita (PARTE 4 e PARTE 5)
// ---------------------------------------------------------------------------

export type LogicalJsonRejection =
  | 'undefined-value'
  | 'function-value'
  | 'symbol-value'
  | 'bigint-value'
  | 'non-finite-number'
  | 'exotic-object'
  | 'exotic-array'
  | 'sparse-array'
  | 'array-extra-property'
  | 'symbol-key'
  | 'non-enumerable-key'
  | 'accessor-key'
  | 'dangerous-key'
  | 'circular-reference'
  | 'hostile-value';

export type LogicalJsonValidation =
  | { status: 'valid'; value: unknown }
  | { status: 'invalid'; rejection: LogicalJsonRejection; path: string };

const JSON_REJECTION_MESSAGES: Record<LogicalJsonRejection, string> = {
  'undefined-value': 'undefined não é JSON válido.',
  'function-value': 'função não é JSON válido.',
  'symbol-value': 'símbolo não é JSON válido.',
  'bigint-value': 'BigInt não é JSON válido.',
  'non-finite-number': 'número não finito não é JSON válido.',
  'exotic-object': 'o objeto não é um objeto JSON simples.',
  'exotic-array': 'o array não é um array JSON simples.',
  'sparse-array': 'array esparso não é JSON válido.',
  'array-extra-property': 'array com propriedade própria extra não é JSON válido.',
  'symbol-key': 'propriedade simbólica não é JSON válida.',
  'non-enumerable-key': 'propriedade não enumerável não é JSON válida.',
  'accessor-key': 'getter ou setter não é JSON válido.',
  'dangerous-key': 'chave de protótipo perigosa não é JSON válida.',
  'circular-reference': 'referência circular não é JSON válida.',
  'hostile-value': 'o valor recusou a inspeção estrutural.',
};

export function describeLogicalJsonRejection(rejection: LogicalJsonRejection): string {
  return JSON_REJECTION_MESSAGES[rejection];
}

function jsonInvalid(rejection: LogicalJsonRejection, path: string): LogicalJsonValidation {
  return { status: 'invalid', rejection, path };
}

// Validação recursiva + CÓPIA. Nada é lido por acesso comum de propriedade: o
// valor sai sempre de `descriptor.value`, então um getter é DETECTADO em vez de
// EXECUTADO. A cópia devolvida é uma árvore JSON pura, independente da entrada:
// nem a canonicalização nem o payload publicado voltam a tocar no objeto
// original, que também não é modificado em momento nenhum.
function validateJsonValue(value: unknown, path: string, ancestors: Set<object>): LogicalJsonValidation {
  if (value === null) return { status: 'valid', value: null };

  const type = typeof value;
  if (type === 'boolean' || type === 'string') return { status: 'valid', value };
  if (type === 'number') {
    return Number.isFinite(value as number)
      ? { status: 'valid', value }
      : jsonInvalid('non-finite-number', path);
  }
  if (type === 'undefined') return jsonInvalid('undefined-value', path);
  if (type === 'function') return jsonInvalid('function-value', path);
  if (type === 'symbol') return jsonInvalid('symbol-value', path);
  if (type === 'bigint') return jsonInvalid('bigint-value', path);
  if (type !== 'object') return jsonInvalid('exotic-object', path);

  const source = value as object;
  if (ancestors.has(source)) return jsonInvalid('circular-reference', path);

  if (Object.getOwnPropertySymbols(source).length > 0) return jsonInvalid('symbol-key', path);

  if (Array.isArray(source)) {
    if (Object.getPrototypeOf(source) !== Array.prototype) return jsonInvalid('exotic-array', path);
    ancestors.add(source);
    const length = source.length;
    const copy: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const itemPath = `${path}[${index}]`;
      const descriptor = Object.getOwnPropertyDescriptor(source, String(index));
      if (descriptor === undefined) {
        ancestors.delete(source);
        return jsonInvalid('sparse-array', itemPath);
      }
      if (typeof descriptor.get === 'function' || typeof descriptor.set === 'function') {
        ancestors.delete(source);
        return jsonInvalid('accessor-key', itemPath);
      }
      if (!descriptor.enumerable) {
        ancestors.delete(source);
        return jsonInvalid('non-enumerable-key', itemPath);
      }
      const item = validateJsonValue(descriptor.value, itemPath, ancestors);
      if (item.status !== 'valid') {
        ancestors.delete(source);
        return item;
      }
      copy.push(item.value);
    }
    ancestors.delete(source);
    // `length` é própria e sempre existe; qualquer outro nome próprio seria
    // descartado em silêncio por `JSON.stringify`.
    if (Object.getOwnPropertyNames(source).length !== length + 1) {
      return jsonInvalid('array-extra-property', path);
    }
    return { status: 'valid', value: copy };
  }

  if (Object.getPrototypeOf(source) !== Object.prototype) return jsonInvalid('exotic-object', path);

  ancestors.add(source);
  const copy: Record<string, unknown> = {};
  for (const name of Object.getOwnPropertyNames(source)) {
    const keyPath = childPath(path, name);
    if (DANGEROUS_KEYS.includes(name)) {
      ancestors.delete(source);
      return jsonInvalid('dangerous-key', keyPath);
    }
    const descriptor = Object.getOwnPropertyDescriptor(source, name);
    if (descriptor === undefined) {
      ancestors.delete(source);
      return jsonInvalid('hostile-value', keyPath);
    }
    if (typeof descriptor.get === 'function' || typeof descriptor.set === 'function') {
      ancestors.delete(source);
      return jsonInvalid('accessor-key', keyPath);
    }
    if (!descriptor.enumerable) {
      ancestors.delete(source);
      return jsonInvalid('non-enumerable-key', keyPath);
    }
    const child = validateJsonValue(descriptor.value, keyPath, ancestors);
    if (child.status !== 'valid') {
      ancestors.delete(source);
      return child;
    }
    copy[name] = child.value;
  }
  ancestors.delete(source);
  return { status: 'valid', value: copy };
}

// Um `Proxy` hostil pode lançar em qualquer trap de introspecção. A falha vira
// uma recusa estruturada e ANÔNIMA: a mensagem do objeto do payload nunca sobe.
export function validateLogicalJsonTree(value: unknown, rootPath = 'payload'): LogicalJsonValidation {
  try {
    return validateJsonValue(value, rootPath, new Set<object>());
  } catch {
    return jsonInvalid('hostile-value', rootPath);
  }
}

// ---------------------------------------------------------------------------
// Datas canônicas (PARTE 6)
// ---------------------------------------------------------------------------

export function isCanonicalIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_ISO_INSTANT_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString() === value;
}

// ---------------------------------------------------------------------------
// Payload lógico
// ---------------------------------------------------------------------------

// Serialização canônica falhou porque o valor não é JSON válido de verdade.
// Converter silenciosamente — o que `JSON.stringify` faz com `undefined`,
// função, símbolo, `Date` e número não finito — produziria um digest que assina
// um estado diferente do que existe na memória. A mensagem carrega o CAMINHO
// (só nomes de campo conhecidos e índices), nunca o valor.
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
// esta função só ACRESCENTA exigências. O que ela devolve é sempre uma CÓPIA
// lógica independente, já validada como árvore JSON pura.
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

  // Raiz FECHADA. Chaves próprias reais — não `in`, que enxergaria a cadeia de
  // protótipos, e não `Object.keys`, que não enxerga o que não é enumerável.
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return invalidPayload('O payload declara uma propriedade simbólica na raiz.');
  }
  if (Object.getOwnPropertyNames(value).length !== REQUIRED_PAYLOAD_FIELDS.length) {
    return invalidPayload('O payload declara um campo raiz desconhecido.');
  }

  const tree = validateLogicalJsonTree(value, 'payload');
  if (tree.status !== 'valid') {
    return invalidPayload(
      `O payload carrega um valor que não é JSON válido em ${tree.path}:`
      + ` ${describeLogicalJsonRejection(tree.rejection)}`,
    );
  }
  const payload = tree.value as Record<string, unknown>;

  if (!validatePersistedStateShape(payload)) {
    return invalidPayload('O payload não satisfaz a forma básica de PersistedState.');
  }

  for (const field of PAYLOAD_ARRAY_FIELDS) {
    if (!Array.isArray(payload[field])) return invalidPayload(`O campo ${field} precisa ser um array.`);
  }

  for (const field of PAYLOAD_NULLABLE_NUMBER_FIELDS) {
    const fieldValue = payload[field];
    if (fieldValue !== null && !isFiniteNumber(fieldValue)) {
      return invalidPayload(`O campo ${field} precisa ser um número finito ou null.`);
    }
  }

  if (payload.restTimerLabel !== null && typeof payload.restTimerLabel !== 'string') {
    return invalidPayload('O campo restTimerLabel precisa ser uma string ou null.');
  }
  if (payload.user !== null && !isRecord(payload.user)) {
    return invalidPayload('O campo user precisa ser um objeto ou null.');
  }
  if (payload.activeWorkout !== null && !isRecord(payload.activeWorkout)) {
    return invalidPayload('O campo activeWorkout precisa ser um objeto ou null.');
  }
  if (!isRecord(payload.nutrition)) {
    return invalidPayload('O campo nutrition precisa ser um objeto.');
  }

  for (const field of ['favoriteExercises', 'recentlyViewedVideoIds'] as const) {
    const entries = payload[field] as unknown[];
    if (entries.some((entry) => typeof entry !== 'string')) {
      return invalidPayload(`O campo ${field} só aceita strings.`);
    }
  }

  const weightInvalid = (payload.weightHistory as unknown[]).some((entry) => (
    !isRecord(entry) || typeof entry.date !== 'string' || !isFiniteNumber(entry.value)
  ));
  if (weightInvalid) {
    return invalidPayload('Um registro de weightHistory não tem date string e value numérico finito.');
  }

  const measurementInvalid = (payload.measurementsHistory as unknown[]).some((entry) => (
    !isRecord(entry)
    || typeof entry.date !== 'string'
    || MEASUREMENT_NUMBER_FIELDS.some((field) => !isFiniteNumber(entry[field]))
  ));
  if (measurementInvalid) {
    return invalidPayload('Um registro de measurementsHistory tem data ou medida inválida.');
  }

  const sessions = payload.workoutHistory as unknown[];
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
      // Sem interpolar o id: ele é conteúdo do usuário e a mensagem é pública.
      return {
        status: 'invalid',
        reason: 'duplicate-session-id',
        detail: 'O histórico contém IDs de sessão duplicados.',
      };
    }
    seen.add(session.id);
  }

  return { status: 'valid', payload: payload as unknown as PersistedState };
}

// Canonicalização determinística de uma árvore JÁ VALIDADA. Chaves de objeto
// ordenadas recursivamente, ordem de array preservada (`workoutHistory` é
// newest-first e continua assim), nada reordenado por conteúdo. Nenhum caso
// especial de normalização sobrevive aqui: o que não é JSON já foi recusado.
function canonicalizeValidatedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeValidatedValue);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonicalizeValidatedValue(record[key])]),
    );
  }
  return value;
}

// Forma canônica do payload lógico. É ela que entra no digest E no arquivo:
// assim o material assinado e o conteúdo publicado nunca podem divergir por
// ordem de chave.
export function serializeLogicalPayloadCanonically(payload: PersistedState): string {
  const tree = validateLogicalJsonTree(payload, 'payload');
  if (tree.status !== 'valid') {
    throw new LogicalBackupSerializationError(
      tree.path,
      describeLogicalJsonRejection(tree.rejection),
    );
  }
  return JSON.stringify(canonicalizeValidatedValue(tree.value));
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

function timestampForFilename(exportedAt: string): string {
  return exportedAt.slice(0, 16).replace('T', '-').replace(':', '');
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

// ---------------------------------------------------------------------------
// Geração verificada — vínculo entre os diagnósticos e a leitura intermediária
// (PARTE 1)
// ---------------------------------------------------------------------------

// Descrição CANÔNICA e comparável de uma geração verificada: identidade,
// contagem, digest ordenado, manifest inteiro e as sessões completas na ordem
// física (newest-first). É a única coisa que autoriza usar a leitura
// intermediária: comparar fingerprint administrativo, generationId, contagem,
// lista de ids ou `manifest.verified` deixa passar o caso ABA, em que o
// armazenamento sai de H1, passa por H2 e volta byte a byte para H1.
interface VerifiedGenerationDescriptor {
  generationId: string;
  sessionCount: number;
  orderedDigest: string;
  manifest: string;
  sessionIds: string;
  sessions: string;
}

function canonicalManifest(manifest: HistoryGenerationManifest): string {
  return JSON.stringify([
    manifest.generationId,
    manifest.sessionCount,
    manifest.orderedDigest,
    manifest.createdAt,
    manifest.updatedAt,
    manifest.verified,
  ]);
}

function describeVerifiedGeneration(
  generationId: string,
  manifest: HistoryGenerationManifest,
  sessions: readonly WorkoutSession[],
): VerifiedGenerationDescriptor {
  return {
    generationId,
    sessionCount: sessions.length,
    orderedDigest: manifest.orderedDigest,
    manifest: canonicalManifest(manifest),
    sessionIds: JSON.stringify(sessions.map((session) => session.id)),
    sessions: serializeWorkoutHistoryDeterministically(sessions),
  };
}

// Comparação integral. Cada divergência tem nome próprio para que a falha diga
// o que mudou sem jamais dizer QUAL era o conteúdo.
function compareVerifiedGenerations(
  expected: VerifiedGenerationDescriptor,
  actual: VerifiedGenerationDescriptor,
): string | null {
  if (expected.generationId !== actual.generationId) return 'a identidade da geração verificada mudou';
  if (expected.sessionCount !== actual.sessionCount) return 'a quantidade de sessões verificadas mudou';
  if (expected.orderedDigest !== actual.orderedDigest) return 'o digest ordenado da geração mudou';
  if (expected.manifest !== actual.manifest) return 'o manifest da geração verificada mudou';
  if (expected.sessionIds !== actual.sessionIds) return 'os ids ou a ordem das sessões mudaram';
  if (expected.sessions !== actual.sessions) return 'o conteúdo das sessões verificadas mudou';
  return null;
}

type VerifiedGenerationReading =
  | { status: 'ok'; descriptor: VerifiedGenerationDescriptor }
  | { status: 'invalid'; detail: string };

// A geração verificada DESCRITA por um diagnóstico. Exige verificação integral
// concluída, manifest presente, sessões presentes e identidade igual à geração
// ativa declarada pelo mesmo diagnóstico.
function readSnapshotGeneration(snapshot: StorageAdministrationSnapshot): VerifiedGenerationReading {
  const integrity = snapshot.activeGenerationIntegrity;
  if (integrity === null) {
    return { status: 'invalid', detail: 'O diagnóstico não verificou a geração ativa.' };
  }
  if (integrity.status !== 'verified') {
    return {
      status: 'invalid',
      detail: `A geração ativa do diagnóstico não passou na verificação integral (${integrity.reason}).`,
    };
  }
  if (!isHistoryGenerationManifest(integrity.manifest)) {
    return { status: 'invalid', detail: 'A geração verificada do diagnóstico não tem manifest íntegro.' };
  }
  if (!Array.isArray(integrity.sessions)) {
    return { status: 'invalid', detail: 'A geração verificada do diagnóstico não tem sessões.' };
  }
  const activeGenerationId = snapshot.activeGenerationId;
  if (!activeGenerationId || integrity.manifest.generationId !== activeGenerationId) {
    return {
      status: 'invalid',
      detail: 'A geração verificada não é a geração ativa declarada pelo diagnóstico.',
    };
  }
  return {
    status: 'ok',
    descriptor: describeVerifiedGeneration(activeGenerationId, integrity.manifest, integrity.sessions),
  };
}

// Duas fotos do MESMO estado físico com a leitura verificada do histórico no
// meio, e — desde o corretivo 046 — o CONTEÚDO dessa leitura amarrado às duas
// fotos. Se qualquer coisa entre elas divergir, não existe backup: escolher uma
// das leituras produziria um arquivo que combina o core de um instante com o
// histórico de outro — exatamente o defeito que este protocolo existe para
// impedir.
//
// Protocolo: A ready e íntegro → core de A validado → geração verificada de A →
// leitura intermediária → B ready e íntegro → A × B → intermediária × A →
// intermediária × B → só então o payload.
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
  if (!isCanonicalIsoInstant(parsed.envelope.savedAt)) {
    return snapshotFailure('invalid-core', 'O core observado não tem um savedAt UTC canônico.');
  }

  const firstGeneration = readSnapshotGeneration(first);
  if (firstGeneration.status !== 'ok') {
    return snapshotFailure('invalid-core', firstGeneration.detail);
  }

  let verified: VerifiedHistoryGeneration;
  try {
    verified = await runtime.readVerifiedAdministrationGeneration(activeGenerationId);
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

  if (!isHistoryGenerationManifest(verified.manifest) || !Array.isArray(verified.sessions)) {
    return snapshotFailure(
      'administration-conflicted',
      'A leitura verificada da geração ativa não devolveu manifest e sessões íntegros.',
    );
  }
  const readingGeneration = describeVerifiedGeneration(
    verified.generationId,
    verified.manifest,
    verified.sessions,
  );

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

  const secondGeneration = readSnapshotGeneration(second);
  if (secondGeneration.status !== 'ok') {
    return snapshotFailure('snapshot-changed-during-export', secondGeneration.detail);
  }

  const abDivergence = compareVerifiedGenerations(firstGeneration.descriptor, secondGeneration.descriptor);
  if (abDivergence !== null) {
    return snapshotFailure(
      'snapshot-changed-during-export',
      `O armazenamento mudou durante a exportação: ${abDivergence}.`,
    );
  }

  // O CORAÇÃO DO CORRETIVO. A leitura intermediária é o histórico que iria para
  // o arquivo; ela só pode ser usada se descrever a MESMA geração verificada que
  // os dois diagnósticos descreveram. Numa corrida ABA os dois diagnósticos
  // concordam entre si e mesmo assim esta comparação recusa.
  for (const observed of [firstGeneration.descriptor, secondGeneration.descriptor]) {
    const readingDivergence = compareVerifiedGenerations(observed, readingGeneration);
    if (readingDivergence !== null) {
      return snapshotFailure(
        'snapshot-changed-during-export',
        `A leitura verificada do histórico não descreve o estado observado: ${readingDivergence}.`,
      );
    }
  }

  // Core lógico: `historyStorage` sai, `workoutHistory` verificado entra.
  const state = combineCoreWithHistory(parsed.envelope.data, [...verified.sessions]);
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
// Não cria `Blob`, não cria `URL`, não cria elemento de âncora, não dispara
// download: quem quiser salvar o arquivo chama `downloadTextFile` (v1) por fora
// — e nesta etapa ninguém chama. Nada aqui escreve no `localStorage` ou no
// IndexedDB.
export async function createLogicalStorageExportV2(
  input: CreateLogicalStorageExportV2Input,
): Promise<LogicalStorageExportV2Result> {
  const now = input.now ?? new Date();
  let exportedAt: string;
  try {
    exportedAt = now.toISOString();
  } catch {
    return {
      ok: false,
      reason: 'invalid-timestamp',
      error: 'O instante de exportação não é uma data válida.',
    };
  }
  if (!isCanonicalIsoInstant(exportedAt)) {
    return {
      ok: false,
      reason: 'invalid-timestamp',
      error: 'O instante de exportação não é um instante UTC canônico.',
    };
  }

  const captured = await captureLogicalBackupSnapshot(input.runtime);
  if (captured.status !== 'ok') {
    return { ok: false, reason: captured.reason, error: captured.error, cause: captured.cause };
  }
  if (!isCanonicalIsoInstant(captured.snapshot.sourceSavedAt)) {
    return {
      ok: false,
      reason: 'invalid-timestamp',
      error: 'O instante de gravação do core não é um instante UTC canônico.',
    };
  }

  let canonicalPayload: string;
  try {
    canonicalPayload = serializeLogicalPayloadCanonically(captured.snapshot.state);
  } catch (error) {
    // Mensagem própria: a origem do erro é o conteúdo do payload, então nem o
    // texto original nem o erro original sobem para quem chamou.
    return {
      ok: false,
      reason: 'serialization',
      error: error instanceof LogicalBackupSerializationError
        ? `Não foi possível serializar o payload lógico em ${error.path}.`
        : 'Não foi possível serializar o payload lógico.',
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
    exportedAt,
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
    filename: `gymflow-backup-v2-${timestampForFilename(exportedAt)}.json`,
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

function isValidDeclaredBytes(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= 0;
}

// Inspeção READ-ONLY de um arquivo v2. Ela não abre storage nenhum: não toca no
// `localStorage`, não abre o IndexedDB, não conhece a chave do app. Um arquivo
// pode ser conferido inteiro num aparelho onde o GymFlow nunca rodou.
//
// Ordem FAIL-FAST fixa: tamanho → JSON → contrato externo → format →
// formatVersion → logicalSchemaVersion → datas → versão física de origem →
// payload completo e árvore JSON → formato textual do digest → recálculo →
// comparação → preview. Nenhum SHA-256 é calculado sobre um payload que ainda
// não foi validado.
//
// Nenhuma mensagem devolvida aqui carrega conteúdo do arquivo: nem o raw, nem
// um trecho de JSON, nem um id de sessão, nem uma chave desconhecida, nem o
// texto de um erro produzido por um objeto do payload.
//
// Não existe `commitLogicalStorageImportV2` neste slice — a inspeção termina em
// preview, e ponto.
export async function inspectLogicalStorageBackupV2(
  raw: string,
  declaredBytes: number = utf8Bytes(raw),
  subtleCrypto?: SubtleCrypto | null,
): Promise<LogicalStorageBackupV2Inspection> {
  if (!isValidDeclaredBytes(declaredBytes)) {
    return inspectionFailure(
      'invalid-size',
      'O tamanho declarado do arquivo precisa ser um número inteiro finito não negativo.',
    );
  }
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
  } catch {
    // A mensagem nativa do `JSON.parse` cita um TRECHO do arquivo; ela não pode
    // sair daqui, e o erro original também não.
    return inspectionFailure('invalid-json', 'O arquivo não é um JSON válido.');
  }

  const contract = validateLogicalBackupEnvelopeContract(parsed);
  if (contract.status !== 'valid') {
    const version = declaredFormatVersion(parsed);
    if (version !== undefined && version !== LOGICAL_BACKUP_FORMAT_VERSION) {
      return inspectionFailure('unsupported-version', 'Versão de formato de backup não suportada.');
    }
    return inspectionFailure('invalid-format', describeContractViolation(contract));
  }
  const envelope = parsed as Record<string, unknown>;

  if (envelope.format !== 'gymflow-backup') {
    return inspectionFailure('invalid-format', 'Formato de backup desconhecido.');
  }
  if (envelope.formatVersion !== LOGICAL_BACKUP_FORMAT_VERSION) {
    return inspectionFailure('unsupported-version', 'Versão de formato de backup não suportada.');
  }
  if (envelope.logicalSchemaVersion !== LOGICAL_BACKUP_SCHEMA_VERSION) {
    return inspectionFailure('unsupported-schema', 'Versão de esquema lógico não suportada.');
  }
  if (!isCanonicalIsoInstant(envelope.exportedAt) || !isCanonicalIsoInstant(envelope.sourceSavedAt)) {
    return inspectionFailure(
      'invalid-date',
      'O arquivo tem exportedAt ou sourceSavedAt fora do formato UTC canônico.',
    );
  }
  if (envelope.sourcePhysicalStorageVersion !== LOGICAL_BACKUP_SOURCE_PHYSICAL_STORAGE_VERSION) {
    return inspectionFailure('unsupported-version', 'Versão física de origem não suportada.');
  }

  const validation = validateLogicalBackupPayload(envelope.payload);
  if (validation.status !== 'valid') {
    return inspectionFailure(validation.reason, validation.detail);
  }

  const declaredDigest = envelope.payloadDigest;
  if (typeof declaredDigest !== 'string' || !PAYLOAD_DIGEST_PATTERN.test(declaredDigest)) {
    return inspectionFailure('invalid-format', 'O digest declarado não está no formato sha256:<hex>.');
  }

  let recomputed: string;
  try {
    recomputed = await sha256Checksum(
      logicalPayloadDigestMaterial(serializeLogicalPayloadCanonically(validation.payload)),
      subtleCrypto,
    );
  } catch (error) {
    if (error instanceof LogicalBackupSerializationError) {
      return inspectionFailure('invalid-payload', 'O payload do arquivo não é serializável.');
    }
    return inspectionFailure(
      'crypto-unavailable',
      'Web Crypto indisponível: o digest do arquivo não pôde ser reconferido.',
      error,
    );
  }

  if (recomputed !== declaredDigest) {
    return inspectionFailure('digest-mismatch', 'O digest do payload não confere com o conteúdo do arquivo.');
  }

  const backup: GymFlowLogicalBackupV2 = {
    format: 'gymflow-backup',
    formatVersion: LOGICAL_BACKUP_FORMAT_VERSION,
    logicalSchemaVersion: LOGICAL_BACKUP_SCHEMA_VERSION,
    exportedAt: envelope.exportedAt,
    sourcePhysicalStorageVersion: LOGICAL_BACKUP_SOURCE_PHYSICAL_STORAGE_VERSION,
    sourceSavedAt: envelope.sourceSavedAt,
    payloadDigest: declaredDigest,
    payload: validation.payload,
  };

  return { ok: true, backup, preview: buildPreview(backup, bytes) };
}
