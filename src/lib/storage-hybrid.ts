import type { WorkoutSession } from '../types';
import type {
  HistoryStorageMetadata,
  LegacySnapshotRecord,
  WorkoutHistoryStorageAdapter,
} from './storage-adapter';
import {
  STORAGE_BACKUP_SUFFIX,
  utf8Bytes,
} from './storage';
import {
  checksumLegacySnapshot,
} from './storage-indexeddb';
import {
  serializeWorkoutHistoryDeterministically,
  verifyHistoryGeneration,
} from './storage-history-integrity';
import { migrateWorkoutHistoryFromV1 } from './storage-history-migration';
import { mergePersistedState } from './storage-migrations';
import {
  HYBRID_STORAGE_VERSION,
  MONOLITHIC_STORAGE_VERSION,
  type PersistedCoreState,
  type PersistedState,
  type StorageEnvelope,
  type StorageIssue,
  type StorageLike,
  type StorageWriteResult,
} from './storage-types';
import {
  isRecord,
  parseEnvelope,
  validateHybridEnvelope,
} from './storage-validation';
import { normalizeSessionState } from './workout-session-migration';

export const HYBRID_CORE_BACKUP_SUFFIX = ':hybrid-core-backup:v2';

export type HybridStorageMode = 'legacy-v1' | 'hybrid-v2' | 'blocked';

export type HybridHydrationResult =
  | {
      mode: 'legacy-v1';
      state: PersistedState;
      reason: 'indexeddb-unavailable';
      physicalVersion: 1 | null;
    }
  | {
      mode: 'hybrid-v2';
      state: PersistedState;
      core: PersistedCoreState;
      generationId: string;
      reconciledCompletion: boolean;
      physicalVersion: 2;
    }
  | {
      mode: 'blocked';
      issue: StorageIssue;
      physicalVersion: number | null;
    };

export type HybridAppendResult =
  | { status: 'appended'; session: WorkoutSession }
  | { status: 'resumed'; session: WorkoutSession };

export interface HybridStorageRuntimeOptions {
  key: string;
  storage: StorageLike;
  adapter: WorkoutHistoryStorageAdapter;
  defaults: PersistedState;
  now?: () => Date;
}

export interface HybridStorageRuntime {
  hydrate(): Promise<HybridHydrationResult>;
  saveCore(state: PersistedState): StorageWriteResult<PersistedCoreState>;
  appendSession(session: WorkoutSession): Promise<HybridAppendResult>;
  close(): Promise<void>;
}

export class HybridStorageIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HybridStorageIntegrityError';
  }
}

type PhysicalEnvelopeResult =
  | { status: 'v1'; envelope: StorageEnvelope<PersistedState> }
  | { status: 'v2'; envelope: StorageEnvelope<PersistedCoreState> }
  | { status: 'corrupt'; error: string; physicalVersion: number | null }
  | { status: 'unsupported-version'; version: unknown };

type StorageWriteFailure = Extract<StorageWriteResult<never>, { ok: false }>;

const hydrationLocks = new WeakMap<object, Map<string, Promise<HybridHydrationResult>>>();

function physicalVersionFromUnknown(value: unknown): number | null {
  return isRecord(value) && typeof value.v === 'number' ? value.v : null;
}

export function parsePhysicalEnvelope(raw: string): PhysicalEnvelopeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      status: 'corrupt',
      error: error instanceof Error ? error.message : 'JSON inválido.',
      physicalVersion: null,
    };
  }

  if (isRecord(parsed) && parsed.v === HYBRID_STORAGE_VERSION) {
    return validateHybridEnvelope(parsed)
      ? { status: 'v2', envelope: parsed }
      : {
          status: 'corrupt',
          error: 'Envelope físico v2 ou core com formato inválido.',
          physicalVersion: HYBRID_STORAGE_VERSION,
        };
  }

  const legacy = parseEnvelope<PersistedState>(raw);
  if (legacy.status === 'ok') return { status: 'v1', envelope: legacy.envelope };
  if (legacy.status === 'unsupported-version') {
    return { status: 'unsupported-version', version: legacy.version };
  }
  return {
    status: 'corrupt',
    error: legacy.error,
    physicalVersion: physicalVersionFromUnknown(parsed),
  };
}

export function toPersistedCoreState(
  state: PersistedState,
  generationId: string,
): PersistedCoreState {
  const { workoutHistory, ...core } = state;
  void workoutHistory;
  return {
    ...core,
    historyStorage: {
      backend: 'indexeddb',
      schemaVersion: 1,
      generationId,
    },
  };
}

export function combineCoreWithHistory(
  core: PersistedCoreState,
  workoutHistory: WorkoutSession[],
): PersistedState {
  const { historyStorage, ...state } = core;
  void historyStorage;
  return { ...state, workoutHistory };
}

function historiesMatch(
  expected: readonly WorkoutSession[],
  actual: readonly WorkoutSession[],
): boolean {
  return serializeWorkoutHistoryDeterministically(expected)
    === serializeWorkoutHistoryDeterministically(actual);
}

function snapshotMatches(
  raw: string,
  snapshot: LegacySnapshotRecord | null,
  expectedChecksum: string,
): boolean {
  return Boolean(
    snapshot?.verified
    && snapshot.raw === raw
    && snapshot.checksum === expectedChecksum,
  );
}

function storageFailure(
  error: unknown,
  fallback: string,
): StorageWriteFailure {
  return {
    ok: false,
    reason: 'unavailable',
    error: error instanceof Error && error.message ? error.message : fallback,
  };
}

function rollbackRaw(
  storage: StorageLike,
  key: string,
  previousRaw: string | null,
): boolean {
  try {
    if (previousRaw === null) storage.removeItem(key);
    else storage.setItem(key, previousRaw);
    return storage.getItem(key) === previousRaw;
  } catch {
    return false;
  }
}

function serializeHybridEnvelope(
  envelope: StorageEnvelope<PersistedCoreState>,
): { ok: true; raw: string } | { ok: false; result: StorageWriteFailure } {
  if (!validateHybridEnvelope(envelope)) {
    return {
      ok: false,
      result: {
        ok: false,
        reason: 'validation',
        error: 'O core não forma um envelope físico v2 válido.',
      },
    };
  }
  try {
    const raw = JSON.stringify(envelope);
    const parsed = parsePhysicalEnvelope(raw);
    if (parsed.status !== 'v2') {
      return {
        ok: false,
        result: {
          ok: false,
          reason: 'serialization',
          error: 'A serialização não preservou o envelope físico v2.',
        },
      };
    }
    return { ok: true, raw };
  } catch (error) {
    return { ok: false, result: storageFailure(error, 'Falha ao serializar o core v2.') };
  }
}

function createHybridEnvelope(
  core: PersistedCoreState,
  now: () => Date,
): StorageEnvelope<PersistedCoreState> {
  return {
    v: HYBRID_STORAGE_VERSION,
    savedAt: now().toISOString(),
    data: core,
  };
}

export function saveHybridCoreResult(
  key: string,
  core: PersistedCoreState,
  storage: StorageLike,
  now: () => Date = () => new Date(),
): StorageWriteResult<PersistedCoreState> {
  const envelope = createHybridEnvelope(core, now);
  const serialized = serializeHybridEnvelope(envelope);
  if (!serialized.ok) return serialized.result;

  let previousRaw: string | null;
  try {
    previousRaw = storage.getItem(key);
  } catch (error) {
    return storageFailure(error, 'Falha ao ler o core v2 anterior.');
  }
  if (previousRaw === null || parsePhysicalEnvelope(previousRaw).status !== 'v2') {
    return {
      ok: false,
      reason: 'blocked',
      error: 'O autosave híbrido recusou substituir um estado que não é v2.',
    };
  }

  try {
    const backupKey = `${key}${HYBRID_CORE_BACKUP_SUFFIX}`;
    storage.setItem(backupKey, previousRaw);
    if (
      storage.getItem(backupKey) !== previousRaw
      || parsePhysicalEnvelope(previousRaw).status !== 'v2'
    ) {
      return {
        ok: false,
        reason: 'verification',
        error: 'O backup rolante do core v2 não pôde ser confirmado.',
      };
    }
    storage.setItem(key, serialized.raw);
  } catch (error) {
    return storageFailure(error, 'Falha ao gravar o core v2.');
  }

  try {
    const readback = storage.getItem(key);
    if (readback !== serialized.raw || readback === null || parsePhysicalEnvelope(readback).status !== 'v2') {
      const rolledBack = rollbackRaw(storage, key, previousRaw);
      return {
        ok: false,
        reason: 'verification',
        error: 'O readback do core v2 divergiu da gravação.',
        rolledBack,
      };
    }
  } catch (error) {
    const rolledBack = rollbackRaw(storage, key, previousRaw);
    return {
      ...storageFailure(error, 'Falha ao reler o core v2.'),
      rolledBack,
    };
  }

  return {
    ok: true,
    savedAt: envelope.savedAt,
    bytes: utf8Bytes(serialized.raw),
    envelope,
    source: 'save',
  };
}

function commitV1Cutover(
  key: string,
  rawV1: string,
  core: PersistedCoreState,
  storage: StorageLike,
  now: () => Date,
): StorageWriteResult<PersistedCoreState> {
  const envelope = createHybridEnvelope(core, now);
  const serialized = serializeHybridEnvelope(envelope);
  if (!serialized.ok) return serialized.result;

  try {
    const current = storage.getItem(key);
    if (current !== rawV1 || parsePhysicalEnvelope(rawV1).status !== 'v1') {
      return {
        ok: false,
        reason: 'blocked',
        error: 'O envelope v1 mudou durante o cutover.',
      };
    }
    const backupKey = `${key}${STORAGE_BACKUP_SUFFIX}`;
    storage.setItem(backupKey, rawV1);
    if (storage.getItem(backupKey) !== rawV1) {
      return {
        ok: false,
        reason: 'verification',
        error: 'O backup bruto v1 não pôde ser confirmado.',
      };
    }
    storage.setItem(key, serialized.raw);
  } catch (error) {
    return storageFailure(error, 'Falha ao gravar o cutover v2.');
  }

  try {
    const readback = storage.getItem(key);
    if (readback !== serialized.raw || readback === null || parsePhysicalEnvelope(readback).status !== 'v2') {
      const rolledBack = rollbackRaw(storage, key, rawV1);
      return {
        ok: false,
        reason: 'verification',
        error: 'O envelope v2 não passou no readback do cutover.',
        rolledBack,
      };
    }
  } catch (error) {
    const rolledBack = rollbackRaw(storage, key, rawV1);
    return {
      ...storageFailure(error, 'Falha ao reler o cutover v2.'),
      rolledBack,
    };
  }

  return {
    ok: true,
    savedAt: envelope.savedAt,
    bytes: utf8Bytes(serialized.raw),
    envelope,
    source: 'save',
  };
}

function terminalSessionMatchesActive(
  active: WorkoutSession,
  terminal: WorkoutSession,
): boolean {
  const omitTerminalFields = (session: WorkoutSession): unknown => {
    const {
      calories,
      duration,
      endedAt,
      prsDetected,
      status,
      totalVolume,
      xpEarned,
      ...stable
    } = session;
    void calories;
    void duration;
    void endedAt;
    void prsDetected;
    void status;
    void totalVolume;
    void xpEarned;
    return {
      ...stable,
      exercises: stable.exercises.map((exercise) => {
        const { entryStatus, ...withoutDerivedStatus } = exercise;
        void entryStatus;
        return withoutDerivedStatus;
      }),
    };
  };
  return serializeWorkoutHistoryDeterministically(
    [omitTerminalFields(active) as WorkoutSession],
  ) === serializeWorkoutHistoryDeterministically(
    [omitTerminalFields(terminal) as WorkoutSession],
  );
}

function isTerminalSession(session: WorkoutSession): boolean {
  return session.status !== undefined
    && session.status !== 'active'
    && typeof session.endedAt === 'number';
}

function reconcileResidualActiveWorkout(
  core: PersistedCoreState,
  history: readonly WorkoutSession[],
): { core: PersistedCoreState; reconciled: boolean } {
  const active = core.activeWorkout;
  if (!active) return { core, reconciled: false };
  const terminal = history.find((session) => session.id === active.id);
  if (!terminal) return { core, reconciled: false };
  if (!isTerminalSession(terminal) || !terminalSessionMatchesActive(active, terminal)) {
    throw new HybridStorageIntegrityError(
      `A sessão ${active.id} existe no histórico, mas diverge do treino ativo residual.`,
    );
  }
  return {
    core: {
      ...core,
      activeWorkout: null,
      activeWorkoutStartedAt: null,
      restTimerEndAt: null,
      restTimerTotalSeconds: null,
      restTimerLabel: null,
    },
    reconciled: true,
  };
}

function blockedResult(
  message: string,
  kind: StorageIssue['kind'],
  raw?: string,
  physicalVersion: number | null = null,
): HybridHydrationResult {
  return {
    mode: 'blocked',
    physicalVersion,
    issue: {
      kind,
      message,
      ...(raw === undefined ? {} : { raw }),
      ...(physicalVersion === null ? {} : { version: physicalVersion }),
    },
  };
}

async function verifySnapshot(raw: string, adapter: WorkoutHistoryStorageAdapter): Promise<void> {
  const expectedChecksum = await checksumLegacySnapshot(raw);
  const snapshot = await adapter.readLegacySnapshot();
  if (!snapshotMatches(raw, snapshot, expectedChecksum)) {
    throw new HybridStorageIntegrityError('O snapshot bruto v1 não passou na verificação final.');
  }
}

// Fonte única de "esta geração existe fisicamente e está íntegra": manifest
// confirmado, contagem coerente, digest ordenado coerente e registros completos.
// Geração ausente nunca vira `[]`.
async function loadVerifiedGeneration(
  adapter: WorkoutHistoryStorageAdapter,
  generationId: string,
): Promise<WorkoutSession[]> {
  const snapshot = await adapter.readHistoryGenerationSnapshot(generationId);
  const verification = await verifyHistoryGeneration(generationId, snapshot);
  if (verification.status === 'invalid') {
    throw new HybridStorageIntegrityError(
      `Integridade física da geração ${generationId} recusada (${verification.reason}): ${verification.message}`,
    );
  }
  return verification.sessions;
}

async function verifyGeneration(
  adapter: WorkoutHistoryStorageAdapter,
  generationId: string,
  expected: readonly WorkoutSession[],
): Promise<WorkoutSession[]> {
  const history = await loadVerifiedGeneration(adapter, generationId);
  if (!historiesMatch(expected, history)) {
    throw new HybridStorageIntegrityError(`A geração ${generationId} diverge do histórico esperado.`);
  }
  return history;
}

async function ensureCompletedGeneration(
  adapter: WorkoutHistoryStorageAdapter,
  expected: readonly WorkoutSession[],
  sourceStorageVersion: number | null,
  now: () => Date,
): Promise<string> {
  const initial = await adapter.readMetadata();
  if (initial.migrationStatus === 'completed') {
    if (!initial.activeGeneration || initial.sourceStorageVersion !== sourceStorageVersion) {
      throw new HybridStorageIntegrityError('Metadata completed incompatível com a origem da instalação.');
    }
    await verifyGeneration(adapter, initial.activeGeneration, expected);
    return initial.activeGeneration;
  }

  await adapter.writeMetadata({
    migrationStatus: 'in-progress',
    migratedAt: null,
    sourceStorageVersion,
  });

  let generationId = initial.migrationGeneration;
  if (generationId) {
    try {
      await verifyGeneration(adapter, generationId, expected);
    } catch (error) {
      if (generationId === initial.activeGeneration) throw error;
      await adapter.clearInactiveGeneration(generationId);
      generationId = null;
    }
  }
  if (
    !generationId
    && initial.activeGeneration
    && initial.migrationStatus !== 'not-started'
  ) {
    try {
      await verifyGeneration(adapter, initial.activeGeneration, expected);
      generationId = initial.activeGeneration;
    } catch {
      // A geração ativa anterior é preservada; uma nova geração será preparada.
    }
  }
  if (!generationId) {
    generationId = await adapter.prepareHistoryGeneration(expected);
  }

  await verifyGeneration(adapter, generationId, expected);
  const beforeActivation = await adapter.readMetadata();
  if (beforeActivation.activeGeneration !== generationId) {
    await adapter.activateHistoryGeneration(generationId);
  }
  const active = await adapter.readActiveHistory();
  if (!historiesMatch(expected, active)) {
    throw new HybridStorageIntegrityError('A geração ativa divergiu depois da ativação.');
  }
  await adapter.writeMetadata({
    migrationGeneration: null,
    migrationStatus: 'completed',
    migratedAt: now().toISOString(),
    sourceStorageVersion,
  });
  const final = await adapter.readMetadata();
  if (
    final.activeGeneration !== generationId
    || final.migrationGeneration !== null
    || final.migrationStatus !== 'completed'
    || final.sourceStorageVersion !== sourceStorageVersion
    || !final.migratedAt
  ) {
    throw new HybridStorageIntegrityError('Metadata final não confirmou a geração ativa.');
  }
  return generationId;
}

async function ensureEmptyV1Cutover(
  raw: string,
  adapter: WorkoutHistoryStorageAdapter,
  now: () => Date,
): Promise<string> {
  const expectedChecksum = await checksumLegacySnapshot(raw);
  const currentSnapshot = await adapter.readLegacySnapshot();
  if (!snapshotMatches(raw, currentSnapshot, expectedChecksum)) {
    if (
      currentSnapshot
      && (currentSnapshot.raw !== raw || currentSnapshot.checksum !== expectedChecksum)
    ) {
      throw new HybridStorageIntegrityError('O snapshot existente pertence a outro envelope v1.');
    }
    const saved = await adapter.saveLegacySnapshot(raw);
    if (!saved.verified) {
      throw new HybridStorageIntegrityError('O adapter não confirmou o snapshot v1 vazio.');
    }
  }
  await verifySnapshot(raw, adapter);
  return ensureCompletedGeneration(adapter, [], MONOLITHIC_STORAGE_VERSION, now);
}

function metadataMatchesV2(
  metadata: HistoryStorageMetadata,
  generationId: string,
): boolean {
  return metadata.migrationStatus === 'completed'
    && metadata.activeGeneration === generationId
    && metadata.migrationGeneration === null;
}

class HybridStorageRuntimeImpl implements HybridStorageRuntime {
  private readonly key: string;
  private readonly storage: StorageLike;
  private readonly adapter: WorkoutHistoryStorageAdapter;
  private readonly defaults: PersistedState;
  private readonly now: () => Date;
  private hydrationPromise: Promise<HybridHydrationResult> | null = null;
  private mode: HybridStorageMode = 'blocked';
  private generationId: string | null = null;

  constructor(options: HybridStorageRuntimeOptions) {
    this.key = options.key;
    this.storage = options.storage;
    this.adapter = options.adapter;
    this.defaults = options.defaults;
    this.now = options.now ?? (() => new Date());
  }

  hydrate(): Promise<HybridHydrationResult> {
    if (this.hydrationPromise) return this.hydrationPromise;
    const lockTarget = this.storage as object;
    let locks = hydrationLocks.get(lockTarget);
    if (!locks) {
      locks = new Map();
      hydrationLocks.set(lockTarget, locks);
    }
    const existing = locks.get(this.key);
    const operation = existing ?? this.performHydration();
    if (!existing) {
      locks.set(this.key, operation);
      void operation.finally(() => {
        if (locks?.get(this.key) === operation) locks.delete(this.key);
      });
    }
    this.hydrationPromise = operation.then((result) => {
      this.mode = result.mode;
      this.generationId = result.mode === 'hybrid-v2' ? result.generationId : null;
      return result;
    });
    return this.hydrationPromise;
  }

  saveCore(state: PersistedState): StorageWriteResult<PersistedCoreState> {
    if (this.mode !== 'hybrid-v2' || !this.generationId) {
      return {
        ok: false,
        reason: 'blocked',
        error: 'O core v2 só pode ser salvo depois da hidratação híbrida.',
      };
    }
    return saveHybridCoreResult(
      this.key,
      toPersistedCoreState(state, this.generationId),
      this.storage,
      this.now,
    );
  }

  async appendSession(session: WorkoutSession): Promise<HybridAppendResult> {
    if (this.mode !== 'hybrid-v2' || !this.generationId) {
      throw new HybridStorageIntegrityError('Append recusado fora do modo híbrido.');
    }
    await this.adapter.open();
    try {
      await this.adapter.appendSession(session);
      return { status: 'appended', session };
    } catch (originalError) {
      let existing: WorkoutSession | undefined;
      try {
        existing = (await this.adapter.readActiveHistory())
          .find((candidate) => candidate.id === session.id);
      } catch {
        throw originalError;
      }
      if (!existing) throw originalError;
      if (!historiesMatch([session], [existing])) {
        throw new HybridStorageIntegrityError(
          `A sessão ${session.id} já existe com conteúdo divergente.`,
        );
      }
      return { status: 'resumed', session: existing };
    }
  }

  async close(): Promise<void> {
    await this.hydrationPromise?.catch(() => undefined);
    await this.adapter.close();
  }

  private async performHydration(): Promise<HybridHydrationResult> {
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.key);
    } catch (error) {
      return blockedResult(
        error instanceof Error ? error.message : 'Falha ao ler o armazenamento principal.',
        'unavailable',
      );
    }

    if (raw === null) return this.initializeFreshInstall();
    const parsed = parsePhysicalEnvelope(raw);
    if (parsed.status === 'v2') return this.hydrateV2(raw, parsed.envelope);
    if (parsed.status === 'unsupported-version') {
      return blockedResult(
        `A versão física ${String(parsed.version)} não é suportada.`,
        'unsupported-version',
        raw,
        typeof parsed.version === 'number' ? parsed.version : null,
      );
    }
    if (parsed.status === 'corrupt') {
      return blockedResult(
        parsed.error,
        'corrupt',
        raw,
        parsed.physicalVersion,
      );
    }
    return this.cutoverV1(raw, parsed.envelope);
  }

  private async adapterAvailable(): Promise<boolean> {
    try {
      return await this.adapter.isAvailable();
    } catch {
      return false;
    }
  }

  private async initializeFreshInstall(): Promise<HybridHydrationResult> {
    if (!await this.adapterAvailable()) {
      return {
        mode: 'legacy-v1',
        state: this.defaults,
        reason: 'indexeddb-unavailable',
        physicalVersion: null,
      };
    }
    try {
      await this.adapter.open();
    } catch {
      return {
        mode: 'legacy-v1',
        state: this.defaults,
        reason: 'indexeddb-unavailable',
        physicalVersion: null,
      };
    }

    try {
      const snapshot = await this.adapter.readLegacySnapshot();
      const metadata = await this.adapter.readMetadata();
      if (snapshot || metadata.sourceStorageVersion === MONOLITHIC_STORAGE_VERSION) {
        throw new HybridStorageIntegrityError(
          'Instalação sem chave principal contém vestígios de uma migração v1.',
        );
      }
      const generationId = await ensureCompletedGeneration(this.adapter, [], null, this.now);
      const core = toPersistedCoreState(this.defaults, generationId);
      const envelope = createHybridEnvelope(core, this.now);
      const serialized = serializeHybridEnvelope(envelope);
      if (!serialized.ok) {
        return blockedResult(
          serialized.result.error,
          serialized.result.reason,
          undefined,
          HYBRID_STORAGE_VERSION,
        );
      }
      this.storage.setItem(this.key, serialized.raw);
      const readback = this.storage.getItem(this.key);
      if (readback !== serialized.raw || readback === null || parsePhysicalEnvelope(readback).status !== 'v2') {
        rollbackRaw(this.storage, this.key, null);
        throw new HybridStorageIntegrityError('A instalação nova v2 falhou no readback.');
      }
      return {
        mode: 'hybrid-v2',
        state: this.defaults,
        core,
        generationId,
        reconciledCompletion: false,
        physicalVersion: HYBRID_STORAGE_VERSION,
      };
    } catch (error) {
      return blockedResult(
        error instanceof Error ? error.message : 'Falha ao inicializar o storage híbrido.',
        'verification',
        undefined,
        HYBRID_STORAGE_VERSION,
      );
    }
  }

  private async cutoverV1(
    raw: string,
    envelope: StorageEnvelope<PersistedState>,
  ): Promise<HybridHydrationResult> {
    const legacyState = mergePersistedState(this.defaults, envelope.data);
    const normalizedSessionState = normalizeSessionState({
      activeWorkout: legacyState.activeWorkout,
      activeWorkoutStartedAt: legacyState.activeWorkoutStartedAt,
      workoutHistory: legacyState.workoutHistory,
    });
    if (!await this.adapterAvailable()) {
      return {
        mode: 'legacy-v1',
        state: legacyState,
        reason: 'indexeddb-unavailable',
        physicalVersion: MONOLITHIC_STORAGE_VERSION,
      };
    }
    try {
      await this.adapter.open();
    } catch {
      return {
        mode: 'legacy-v1',
        state: legacyState,
        reason: 'indexeddb-unavailable',
        physicalVersion: MONOLITHIC_STORAGE_VERSION,
      };
    }

    try {
      const migration = await migrateWorkoutHistoryFromV1({
        rawEnvelope: raw,
        adapter: this.adapter,
        now: this.now,
      });
      let generationId: string;
      if (migration.status === 'no-history') {
        generationId = await ensureEmptyV1Cutover(raw, this.adapter, this.now);
      } else if (migration.status === 'failed') {
        throw migration.error;
      } else {
        generationId = migration.generationId;
      }

      await verifySnapshot(raw, this.adapter);
      const metadata = await this.adapter.readMetadata();
      if (
        !metadataMatchesV2(metadata, generationId)
        || metadata.sourceStorageVersion !== MONOLITHIC_STORAGE_VERSION
      ) {
        throw new HybridStorageIntegrityError('Metadata não confirmou o cutover v1.');
      }
      const history = await loadVerifiedGeneration(this.adapter, generationId);
      if (!historiesMatch(normalizedSessionState.workoutHistory, history)) {
        throw new HybridStorageIntegrityError('O histórico relido divergiu do envelope v1 normalizado.');
      }

      const state = {
        ...legacyState,
        activeWorkout: normalizedSessionState.activeWorkout,
        workoutHistory: history,
      };
      const core = toPersistedCoreState(state, generationId);
      const commit = commitV1Cutover(this.key, raw, core, this.storage, this.now);
      if (!commit.ok) {
        return blockedResult(
          commit.error,
          commit.reason,
          raw,
          MONOLITHIC_STORAGE_VERSION,
        );
      }
      return {
        mode: 'hybrid-v2',
        state,
        core,
        generationId,
        reconciledCompletion: false,
        physicalVersion: HYBRID_STORAGE_VERSION,
      };
    } catch (error) {
      return blockedResult(
        error instanceof Error ? error.message : 'Falha durante o cutover v1 para v2.',
        'verification',
        raw,
        MONOLITHIC_STORAGE_VERSION,
      );
    }
  }

  private async hydrateV2(
    raw: string,
    envelope: StorageEnvelope<PersistedCoreState>,
  ): Promise<HybridHydrationResult> {
    if (!await this.adapterAvailable()) {
      return blockedResult(
        'O envelope v2 exige IndexedDB, mas o backend está indisponível.',
        'unavailable',
        raw,
        HYBRID_STORAGE_VERSION,
      );
    }
    try {
      await this.adapter.open();
      const generationId = envelope.data.historyStorage.generationId;
      const metadata = await this.adapter.readMetadata();
      if (!metadataMatchesV2(metadata, generationId)) {
        throw new HybridStorageIntegrityError(
          'O generationId do core v2 não coincide com a geração ativa confirmada.',
        );
      }
      const history = await loadVerifiedGeneration(this.adapter, generationId);
      const reconciled = reconcileResidualActiveWorkout(envelope.data, history);
      if (reconciled.reconciled) {
        const saved = saveHybridCoreResult(this.key, reconciled.core, this.storage, this.now);
        if (!saved.ok) {
          throw new HybridStorageIntegrityError(
            `A reconciliação do treino residual não foi persistida: ${saved.error}`,
          );
        }
      }
      return {
        mode: 'hybrid-v2',
        state: combineCoreWithHistory(reconciled.core, history),
        core: reconciled.core,
        generationId,
        reconciledCompletion: reconciled.reconciled,
        physicalVersion: HYBRID_STORAGE_VERSION,
      };
    } catch (error) {
      return blockedResult(
        error instanceof Error ? error.message : 'Falha ao hidratar o envelope v2.',
        'verification',
        raw,
        HYBRID_STORAGE_VERSION,
      );
    }
  }
}

export function createHybridStorageRuntime(
  options: HybridStorageRuntimeOptions,
): HybridStorageRuntime {
  return new HybridStorageRuntimeImpl(options);
}

export async function commitHybridWorkoutSession(
  runtime: Pick<HybridStorageRuntime, 'appendSession'>,
  session: WorkoutSession,
  callbacks: {
    onAppended: (session: WorkoutSession) => void | Promise<void>;
    onResumed?: (session: WorkoutSession) => void | Promise<void>;
  },
): Promise<HybridAppendResult> {
  const result = await runtime.appendSession(session);
  if (result.status === 'appended') await callbacks.onAppended(result.session);
  else await callbacks.onResumed?.(result.session);
  return result;
}

export function canUseLegacyAdminOperations(
  mode: HybridStorageMode,
  physicalVersion: number | null,
): boolean {
  return mode === 'legacy-v1'
    || (mode === 'blocked' && physicalVersion !== HYBRID_STORAGE_VERSION);
}
