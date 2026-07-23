import type { WorkoutSession } from '../types';

// Serialização canônica + digest encadeado das gerações de histórico.
//
// Este módulo é folha de propósito: só depende dos tipos de domínio. O adapter
// IndexedDB, a migração v1 e o runtime híbrido importam daqui, então a mesma
// definição de "conteúdo idêntico" vale para migração, manifest e recuperação.
//
// O digest da geração é encadeado do registro mais antigo para o mais novo. Como
// a ordem física é newest-first, prefixar uma sessão nova custa exatamente um
// passo de encadeamento sobre o digest anterior — o append normal nunca precisa
// reler nem reserializar o histórico inteiro.

export const HISTORY_DIGEST_ALGORITHM = 'SHA-256';

// Geração vazia tem digest canônico explícito: `[]` e "geração ausente" nunca
// compartilham representação.
export const EMPTY_GENERATION_DIGEST = 'gymflow:history-digest:v1:empty';

const SESSION_DIGEST_PREFIX = 'gymflow:history-session:v1:';
const CHAIN_DIGEST_PREFIX = 'gymflow:history-chain:v1:';
const CHAIN_SEPARATOR = '\u0000';

export class HistoryDigestCryptoUnavailableError extends Error {
  constructor() {
    super('Web Crypto indisponível para calcular o digest do histórico.');
    this.name = 'HistoryDigestCryptoUnavailableError';
  }
}

export interface HistoryGenerationManifest {
  generationId: string;
  sessionCount: number;
  orderedDigest: string;
  createdAt: string;
  updatedAt: string;
  verified: boolean;
}

export type HistoryGenerationIntegrityReason =
  | 'generation-absent'
  | 'manifest-absent'
  | 'manifest-unverified'
  | 'manifest-generation-mismatch'
  | 'manifest-count-invalid'
  | 'session-count-mismatch'
  | 'empty-digest-mismatch'
  | 'record-digest-mismatch'
  | 'ordered-digest-mismatch';

export type HistoryGenerationVerification =
  | { status: 'verified'; manifest: HistoryGenerationManifest; sessions: WorkoutSession[] }
  | { status: 'invalid'; reason: HistoryGenerationIntegrityReason; message: string };

export interface HistoryGenerationSnapshot {
  present: boolean;
  manifest: HistoryGenerationManifest | null;
  sessions: WorkoutSession[];
  // Digest gravado junto de cada registro. `null` marca registro legado sem
  // digest individual persistido: é tolerado, pois o orderedDigest recalculado
  // sobre o conteúdo completo continua verificando a integridade. Manifesto
  // ausente ou divergente continua bloqueando.
  recordDigests: (string | null)[];
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = canonicalize(item);
      return normalized === undefined ? null : normalized;
    });
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .flatMap((key) => {
          const normalized = canonicalize(record[key]);
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

export function serializeWorkoutHistoryDeterministically(
  history: readonly WorkoutSession[],
): string {
  return JSON.stringify(canonicalize(history));
}

export function serializeWorkoutSessionCanonically(session: WorkoutSession): string {
  return JSON.stringify(canonicalize(session));
}

export function workoutSessionsMatch(
  expected: WorkoutSession,
  actual: WorkoutSession,
): boolean {
  return serializeWorkoutSessionCanonically(expected) === serializeWorkoutSessionCanonically(actual);
}

export function workoutHistoriesMatch(
  expected: readonly WorkoutSession[],
  actual: readonly WorkoutSession[],
): boolean {
  return serializeWorkoutHistoryDeterministically(expected)
    === serializeWorkoutHistoryDeterministically(actual);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Checksum(
  raw: string,
  subtleCrypto: SubtleCrypto | null | undefined = globalThis.crypto?.subtle,
): Promise<string> {
  if (!subtleCrypto) throw new HistoryDigestCryptoUnavailableError();
  const digest = await subtleCrypto.digest(
    HISTORY_DIGEST_ALGORITHM,
    new TextEncoder().encode(raw),
  );
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

export async function digestWorkoutSession(
  session: WorkoutSession,
  subtleCrypto?: SubtleCrypto | null,
): Promise<string> {
  return sha256Checksum(
    `${SESSION_DIGEST_PREFIX}${serializeWorkoutSessionCanonically(session)}`,
    subtleCrypto,
  );
}

// Um passo do encadeamento: `previous` é o digest do histórico já existente e
// `sessionDigest` entra como registro mais novo (posição 0 da ordem física).
export async function chainGenerationDigest(
  previous: string,
  sessionDigest: string,
  subtleCrypto?: SubtleCrypto | null,
): Promise<string> {
  return sha256Checksum(
    `${CHAIN_DIGEST_PREFIX}${previous}${CHAIN_SEPARATOR}${sessionDigest}`,
    subtleCrypto,
  );
}

export async function computeOrderedDigestFromSessionDigests(
  sessionDigestsNewestFirst: readonly string[],
  subtleCrypto?: SubtleCrypto | null,
): Promise<string> {
  let digest = EMPTY_GENERATION_DIGEST;
  for (let index = sessionDigestsNewestFirst.length - 1; index >= 0; index -= 1) {
    digest = await chainGenerationDigest(digest, sessionDigestsNewestFirst[index], subtleCrypto);
  }
  return digest;
}

export async function digestWorkoutSessions(
  historyNewestFirst: readonly WorkoutSession[],
  subtleCrypto?: SubtleCrypto | null,
): Promise<string[]> {
  const digests: string[] = [];
  for (const session of historyNewestFirst) {
    digests.push(await digestWorkoutSession(session, subtleCrypto));
  }
  return digests;
}

export async function computeOrderedHistoryDigest(
  historyNewestFirst: readonly WorkoutSession[],
  subtleCrypto?: SubtleCrypto | null,
): Promise<string> {
  return computeOrderedDigestFromSessionDigests(
    await digestWorkoutSessions(historyNewestFirst, subtleCrypto),
    subtleCrypto,
  );
}

export function createGenerationManifest(input: {
  generationId: string;
  sessionCount: number;
  orderedDigest: string;
  createdAt: string;
  updatedAt?: string;
  verified?: boolean;
}): HistoryGenerationManifest {
  return {
    generationId: input.generationId,
    sessionCount: input.sessionCount,
    orderedDigest: input.orderedDigest,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
    verified: input.verified ?? true,
  };
}

export function isHistoryGenerationManifest(value: unknown): value is HistoryGenerationManifest {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.generationId === 'string'
    && typeof record.sessionCount === 'number'
    && Number.isInteger(record.sessionCount)
    && typeof record.orderedDigest === 'string'
    && typeof record.createdAt === 'string'
    && typeof record.updatedAt === 'string'
    && typeof record.verified === 'boolean';
}

const INTEGRITY_MESSAGES: Record<HistoryGenerationIntegrityReason, string> = {
  'generation-absent': 'A geração de histórico não existe fisicamente no IndexedDB.',
  'manifest-absent': 'A geração de histórico não possui manifest durável.',
  'manifest-unverified': 'O manifest da geração nunca foi confirmado.',
  'manifest-generation-mismatch': 'O manifest pertence a outra geração de histórico.',
  'manifest-count-invalid': 'O manifest declara uma contagem de sessões inválida.',
  'session-count-mismatch': 'A quantidade de registros diverge da contagem do manifest.',
  'empty-digest-mismatch': 'A geração vazia não possui o digest canônico esperado.',
  'record-digest-mismatch': 'O digest gravado de um registro diverge do conteúdo persistido.',
  'ordered-digest-mismatch': 'O digest ordenado dos registros diverge do manifest.',
};

function invalid(
  reason: HistoryGenerationIntegrityReason,
  detail?: string,
): HistoryGenerationVerification {
  return {
    status: 'invalid',
    reason,
    message: detail ? `${INTEGRITY_MESSAGES[reason]} ${detail}` : INTEGRITY_MESSAGES[reason],
  };
}

// Verificação completa: ausência física, manifest ausente/adulterado, perda
// total, perda parcial, registro extra, ordem divergente e conteúdo divergente
// caem todos aqui — nunca em um histórico vazio silencioso.
export async function verifyHistoryGeneration(
  generationId: string,
  snapshot: HistoryGenerationSnapshot,
  subtleCrypto?: SubtleCrypto | null,
): Promise<HistoryGenerationVerification> {
  if (!snapshot.present) return invalid('generation-absent', `Geração: ${generationId}.`);
  const manifest = snapshot.manifest;
  if (!manifest || !isHistoryGenerationManifest(manifest)) {
    return invalid('manifest-absent', `Geração: ${generationId}.`);
  }
  if (manifest.generationId !== generationId) {
    return invalid('manifest-generation-mismatch', `Esperado ${generationId}, recebido ${manifest.generationId}.`);
  }
  if (!manifest.verified) return invalid('manifest-unverified', `Geração: ${generationId}.`);
  if (manifest.sessionCount < 0) {
    return invalid('manifest-count-invalid', `Contagem: ${manifest.sessionCount}.`);
  }
  if (manifest.sessionCount !== snapshot.sessions.length) {
    return invalid(
      'session-count-mismatch',
      `Manifest: ${manifest.sessionCount}, registros: ${snapshot.sessions.length}.`,
    );
  }

  const digests = await digestWorkoutSessions(snapshot.sessions, subtleCrypto);
  for (let index = 0; index < digests.length; index += 1) {
    const stored = snapshot.recordDigests[index];
    if (stored !== undefined && stored !== null && stored !== digests[index]) {
      return invalid('record-digest-mismatch', `Posição ${index}.`);
    }
  }

  if (snapshot.sessions.length === 0) {
    return manifest.orderedDigest === EMPTY_GENERATION_DIGEST
      ? { status: 'verified', manifest, sessions: [] }
      : invalid('empty-digest-mismatch', `Digest: ${manifest.orderedDigest}.`);
  }

  const orderedDigest = await computeOrderedDigestFromSessionDigests(digests, subtleCrypto);
  if (orderedDigest !== manifest.orderedDigest) {
    return invalid('ordered-digest-mismatch', `Geração: ${generationId}.`);
  }
  return { status: 'verified', manifest, sessions: snapshot.sessions };
}
