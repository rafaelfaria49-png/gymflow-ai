import fs from 'node:fs';
import path from 'node:path';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../types';
import { createStorageAdminRuntime } from './storage-admin-runtime';
import { createStorageExport } from './storage-export';
import {
  HYBRID_CORE_BACKUP_SUFFIX,
  createHybridStorageRuntime,
  parsePhysicalEnvelope,
} from './storage-hybrid';
import {
  computeOrderedHistoryDigest,
  digestWorkoutSession,
} from './storage-history-integrity';
import {
  GENERATION_MANIFESTS_STORE,
  GYMFLOW_INDEXEDDB_VERSION,
  IndexedDbWorkoutHistoryStorage,
  METADATA_STORE,
  STORAGE_OPERATION_RECEIPTS_STORE,
  WORKOUT_HISTORY_STORE,
} from './storage-indexeddb';
import {
  computeLogicalPayloadDigest,
  serializeLogicalPayloadCanonically,
} from './storage-logical-backup';
import * as logicalImportModule from './storage-logical-import';
import {
  type LogicalImportAdapter,
  type LogicalImportObservation,
  type LogicalImportRecoveryDecision,
  type LogicalStorageImportV2Result,
  commitLogicalStorageImportV2,
  resolveLogicalImportRecovery,
} from './storage-logical-import';
import {
  type StorageOperationReceipt,
  createStorageOperationReceipt,
} from './storage-operation-receipt';
import {
  MONOLITHIC_STORAGE_VERSION,
  type PersistedCoreState,
  type PersistedState,
  type StorageLike,
} from './storage-types';

const KEY = 'gymflow:state:v1';
const BACKUP_KEY = `${KEY}${HYBRID_CORE_BACKUP_SUFFIX}`;
let databaseSequence = 0;

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  readonly removed: string[] = [];
  // Injeção de outra aba: roda DEPOIS de uma gravação bem-sucedida.
  onSetItem: ((key: string, value: string) => void) | null = null;
  // Falha determinística de gravação, por chave.
  failSetItem: ((key: string, value: string) => Error | null) | null = null;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    const failure = this.failSetItem?.(key, value) ?? null;
    if (failure) throw failure;
    this.values.set(key, value);
    this.onSetItem?.(key, value);
  }

  removeItem(key: string): void {
    this.removed.push(key);
    this.values.delete(key);
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.values);
  }
}

function quotaError(): Error {
  const error = new Error('The quota has been exceeded.');
  error.name = 'QuotaExceededError';
  return error;
}

function makeSession(index: number, overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  const startedAt = 1_767_225_600_000 + index * 86_400_000;
  return {
    id: `session-${index}`,
    name: `Treino ${index}`,
    date: new Date(startedAt).toISOString(),
    duration: 3_600,
    calories: 420,
    xpEarned: 180,
    totalVolume: 12_500 + index,
    prsDetected: [],
    sourceProgramId: 'program-1',
    sourceProgramDayId: 'day-1',
    sourceProgramName: 'Programa multi-dia',
    sourceProgramDayName: 'Dia 1 — Peito',
    status: 'completed',
    startedAt,
    endedAt: startedAt + 3_600_000,
    exercises: [{
      id: `entry-${index}`,
      exerciseId: 'exercise-1',
      name: 'Remada articulada',
      muscleGroup: 'back',
      notes: '',
      repRange: [8, 12],
      targetRPE: 8,
      restSec: 90,
      progressionNote: '',
      plannedSlotIndex: 0,
      entryOrigin: 'planned',
      entryStatus: 'performed',
      sets: [{
        id: `set-${index}`,
        reps: 10,
        weight: 60,
        completed: true,
        suggestedWeight: 60,
        lastWeight: 60,
        rpe: 8,
      }],
    }],
    ...overrides,
  };
}

function defaults(history: WorkoutSession[] = []): PersistedState {
  return {
    user: null,
    weeklyPlan: [],
    customPrograms: [],
    activeWorkout: null,
    activeWorkoutStartedAt: null,
    restTimerEndAt: null,
    restTimerTotalSeconds: null,
    restTimerLabel: null,
    workoutHistory: history,
    weightHistory: [],
    measurementsHistory: [],
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
    achievements: [],
    challenges: [],
    favoriteExercises: [],
    recentlyViewedVideoIds: [],
  };
}

// Hidrata um runtime híbrido real para obter core v2 saudável + geração ativa
// verificada, e monta a fachada administrativa sobre a MESMA storage/adapter.
async function createReadyHarness(options: {
  storage?: MemoryStorage;
  sessions?: WorkoutSession[];
} = {}) {
  const storage = options.storage ?? new MemoryStorage();
  const factory = new IDBFactory();
  const name = `gymflow-import-${databaseSequence += 1}`;
  let generation = 0;
  const adapter = new IndexedDbWorkoutHistoryStorage({
    factory,
    databaseName: name,
    generationIdFactory: () => `generation-${generation += 1}`,
    now: () => new Date('2026-07-26T08:00:00.000Z'),
  });
  const hybrid = createHybridStorageRuntime({
    key: KEY,
    storage,
    adapter,
    defaults: defaults(),
    now: () => new Date('2026-07-26T08:00:00.000Z'),
  });
  const hydration = await hybrid.hydrate();
  if (hydration.mode !== 'hybrid-v2') {
    throw new Error(`setup de teste falhou: hidratação ficou em ${hydration.mode}`);
  }
  let generationId = hydration.generationId;
  if (options.sessions && options.sessions.length > 0) {
    generationId = await adapter.replaceHistory(options.sessions);
    // `replaceHistory` troca a geração ativa; o core v2 precisa apontar para
    // ela, exatamente como o autosave faria no fluxo real.
    const envelope = JSON.parse(storage.getItem(KEY) as string) as {
      data: { historyStorage: Record<string, unknown> };
    };
    envelope.data.historyStorage = { ...envelope.data.historyStorage, generationId };
    storage.setItem(KEY, JSON.stringify(envelope));
    // A geração vazia da hidratação vira órfã depois do replace. Limpá-la aqui
    // deixa o harness com exatamente UMA geração, para que as asserções sobre
    // "quantas gerações existem" descrevam a importação, e não o setup.
    await adapter.clearInactiveGeneration(hydration.generationId);
  }
  const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter });
  return { storage, factory, name, adapter, hybrid, runtime, generationId };
}

type Harness = Awaited<ReturnType<typeof createReadyHarness>>;

function commit(
  harness: Harness,
  raw: string,
  overrides: Partial<Parameters<typeof commitLogicalStorageImportV2>[0]> = {},
): Promise<LogicalStorageImportV2Result> {
  return commitLogicalStorageImportV2({
    raw,
    runtime: harness.runtime,
    adapter: harness.adapter,
    storage: harness.storage,
    key: KEY,
    now: () => new Date('2026-07-26T11:00:00.000Z'),
    ...overrides,
  });
}

// Arquivo v2 real: digest calculado sobre a forma canônica, como o exportador
// do slice B faz. `overrides` permite corromper campos específicos.
async function makeBackupContent(
  payload: PersistedState,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const payloadDigest = await computeLogicalPayloadDigest(payload);
  return JSON.stringify({
    format: 'gymflow-backup',
    formatVersion: 2,
    logicalSchemaVersion: 1,
    exportedAt: '2026-07-26T10:00:00.000Z',
    sourcePhysicalStorageVersion: 2,
    sourceSavedAt: '2026-07-26T09:59:00.000Z',
    payloadDigest,
    payload: JSON.parse(serializeLogicalPayloadCanonically(payload)) as PersistedState,
    ...overrides,
  });
}

// Roda `mutate` DEPOIS da n-ésima chamada real de `method`, com o adapter de
// verdade. Nada aqui simula retorno de erro.
function afterCall<T extends object>(
  target: T,
  method: string,
  nth: number,
  mutate: () => Promise<void> | void,
): T {
  let calls = 0;
  return new Proxy(target, {
    get(object, prop, receiver) {
      const value = Reflect.get(object, prop, receiver);
      if (typeof value !== 'function') return value;
      const bound = (value as (...a: unknown[]) => unknown).bind(object);
      if (prop !== method) return bound;
      return async (...args: unknown[]) => {
        const result = await bound(...args);
        calls += 1;
        if (calls === nth) await mutate();
        return result;
      };
    },
  }) as T;
}

// Substitui um método por uma falha determinística, preservando o resto.
function failingMethod<T extends object>(target: T, method: string, error: Error): T {
  return new Proxy(target, {
    get(object, prop, receiver) {
      if (prop === method) return () => Promise.reject(error);
      const value = Reflect.get(object, prop, receiver);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(object)
        : value;
    },
  }) as T;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => undefined;
  });
}

async function withStore<T>(
  harness: Harness,
  storeNames: string | string[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = harness.factory.open(harness.name, GYMFLOW_INDEXEDDB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transaction = database.transaction(storeNames, mode);
  const completed = transactionResult(transaction);
  const result = await run(transaction);
  await completed;
  database.close();
  return result;
}

function readOperationReceipts(harness: Harness): Promise<StorageOperationReceipt[]> {
  return withStore(harness, STORAGE_OPERATION_RECEIPTS_STORE, 'readonly', (transaction) => (
    requestResult(
      transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE).getAll(),
    ) as Promise<StorageOperationReceipt[]>
  ));
}

function readGenerationIds(harness: Harness): Promise<string[]> {
  return withStore(harness, GENERATION_MANIFESTS_STORE, 'readonly', async (transaction) => {
    const manifests = await requestResult(
      transaction.objectStore(GENERATION_MANIFESTS_STORE).getAll(),
    ) as { generationId: string }[];
    return manifests.map((manifest) => manifest.generationId).sort();
  });
}

function putRawOperationReceipt(
  harness: Harness,
  record: Record<string, unknown>,
): Promise<unknown> {
  return withStore(harness, STORAGE_OPERATION_RECEIPTS_STORE, 'readwrite', (transaction) => (
    requestResult(transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE).put(record))
  ));
}

function putMetadataRecord(harness: Harness, key: string, value: unknown): Promise<unknown> {
  return withStore(harness, METADATA_STORE, 'readwrite', (transaction) => (
    requestResult(transaction.objectStore(METADATA_STORE).put({ key, value }))
  ));
}

// Reescreve um registro de histórico direto no store, sem tocar no manifest.
async function tamperGenerationRecord(harness: Harness, generationId: string): Promise<void> {
  await withStore(harness, WORKOUT_HISTORY_STORE, 'readwrite', async (transaction) => {
    const store = transaction.objectStore(WORKOUT_HISTORY_STORE);
    const records = await requestResult(
      store.index('byGeneration').getAll(generationId),
    ) as { session: WorkoutSession }[];
    const first = records[0] as Record<string, unknown> & { session: WorkoutSession };
    await requestResult(store.put({
      ...first,
      session: { ...first.session, totalVolume: (first.session.totalVolume ?? 0) + 1 },
    }));
  });
}

async function tamperGenerationManifest(harness: Harness, generationId: string): Promise<void> {
  await withStore(harness, GENERATION_MANIFESTS_STORE, 'readwrite', async (transaction) => {
    const store = transaction.objectStore(GENERATION_MANIFESTS_STORE);
    const manifest = await requestResult(store.get(generationId)) as Record<string, unknown>;
    await requestResult(store.put({ ...manifest, sessionCount: Number(manifest.sessionCount) + 5 }));
  });
}

// A geração preparada sai do JOURNAL, não de uma dedução sobre quais gerações
// existem: é o receipt que diz de quem ela é.
async function stagedGenerationOf(harness: Harness): Promise<string> {
  const [receipt] = await readOperationReceipts(harness);
  const preparada = receipt?.stagedGenerationId;
  if (!preparada) throw new Error('nenhuma geração preparada registrada no journal');
  return preparada;
}

async function fingerprintOf(harness: Harness): Promise<string | null> {
  return (await harness.runtime.inspectStorageAdministration()).administrationFingerprint;
}

function coreOf(harness: Harness): PersistedCoreState {
  const parsed = parsePhysicalEnvelope(harness.storage.getItem(KEY) as string);
  if (parsed.status !== 'v2') throw new Error(`core inesperado: ${parsed.status}`);
  return parsed.envelope.data;
}

// ---------------------------------------------------------------------------
// 1–11 — caminho saudável
// ---------------------------------------------------------------------------

describe('importação lógica v2 — caminho saudável', () => {
  it('1. importa um backup saudável e devolve sucesso completo', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const importado = [makeSession(70), makeSession(71)];
    const raw = await makeBackupContent(defaults(importado));

    const resultado = await commit(harness, raw);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.sessionCount).toBe(2);
    expect(resultado.generationId).not.toBe(harness.generationId);
    expect(resultado.previousGenerationId).toBe(harness.generationId);
    expect(resultado.savedAt).toBe('2026-07-26T11:00:00.000Z');
    expect(resultado.preview.workoutSessions).toBe(2);

    const historico = await harness.adapter.readActiveHistory();
    expect(historico.map((sessao) => sessao.id)).toEqual(['session-70', 'session-71']);
  });

  it('2. importa um payload lógico com perfil preenchido e histórico vazio', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const payload = defaults([]);
    payload.user = {
      name: 'Rafael',
      email: 'rafael@example.test',
      xp: 4200,
      points: 900,
      streak: 12,
    } as unknown as PersistedState['user'];
    payload.favoriteExercises = ['exercise-1', 'exercise-2'];
    const raw = await makeBackupContent(payload);

    const resultado = await commit(harness, raw);

    expect(resultado.ok).toBe(true);
    const core = coreOf(harness);
    expect((core.user as unknown as { name: string }).name).toBe('Rafael');
    expect(core.favoriteExercises).toEqual(['exercise-1', 'exercise-2']);
    expect(await harness.adapter.readActiveHistory()).toEqual([]);
  });

  it('3. importa histórico vazio criando geração vazia canônica', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1), makeSession(2)] });
    const raw = await makeBackupContent(defaults([]));

    const resultado = await commit(harness, raw);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const verificada = await harness.adapter.readVerifiedHistoryGeneration(resultado.generationId);
    expect(verificada.sessions).toEqual([]);
    expect(verificada.manifest.sessionCount).toBe(0);
  });

  it('4. importa um histórico grande com 500 sessões', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const importado = Array.from({ length: 500 }, (_, index) => makeSession(1000 + index));
    const raw = await makeBackupContent(defaults(importado));

    const resultado = await commit(harness, raw);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.sessionCount).toBe(500);
    const verificada = await harness.adapter.readVerifiedHistoryGeneration(resultado.generationId);
    expect(verificada.sessions).toHaveLength(500);
    expect(verificada.manifest.orderedDigest).toBe(await computeOrderedHistoryDigest(importado));
  }, 120_000);

  it('5. preserva Unicode e emoji byte a byte', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const sessao = makeSession(80, { name: 'Treino 💪 — ombros/costas ção 中文 🇧🇷' });
    const payload = defaults([sessao]);
    payload.restTimerLabel = 'Descanso ⏱️ 90s';
    const raw = await makeBackupContent(payload);

    const resultado = await commit(harness, raw);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const historico = await harness.adapter.readActiveHistory();
    expect(historico[0].name).toBe('Treino 💪 — ombros/costas ção 中文 🇧🇷');
    expect(coreOf(harness).restTimerLabel).toBe('Descanso ⏱️ 90s');
    // O digest gravado é o do conteúdo real, não de uma versão normalizada.
    const verificada = await harness.adapter.readVerifiedHistoryGeneration(resultado.generationId);
    expect(await digestWorkoutSession(verificada.sessions[0]))
      .toBe(await digestWorkoutSession(sessao));
  });

  it('6. grava no receipt o mesmo payloadDigest que a inspeção validou', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const payload = defaults([makeSession(70)]);
    const raw = await makeBackupContent(payload);

    const resultado = await commit(harness, raw);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.payloadDigest).toBe(await computeLogicalPayloadDigest(payload));
    const receipts = await readOperationReceipts(harness);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].sourceDigest).toBe(resultado.payloadDigest);
    expect(receipts[0].kind).toBe('import');
  });

  it('7. o core final não carrega workoutHistory', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));

    await commit(harness, raw);

    const envelope = JSON.parse(harness.storage.getItem(KEY) as string) as {
      v: number;
      data: Record<string, unknown>;
    };
    expect(envelope.v).toBe(2);
    expect('workoutHistory' in envelope.data).toBe(false);
    expect(Object.keys(envelope.data)).toHaveLength(16);
  });

  it('8. o core final aponta para a geração nova', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));

    const resultado = await commit(harness, raw);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(coreOf(harness).historyStorage.generationId).toBe(resultado.generationId);
    const metadata = await harness.adapter.readMetadata();
    expect(metadata.activeGeneration).toBe(resultado.generationId);
    expect(metadata.migrationGeneration).toBeNull();
    expect(metadata.migrationStatus).toBe('completed');
  });

  it('9. a geração anterior continua existindo e íntegra', async () => {
    const anteriores = [makeSession(1), makeSession(2)];
    const harness = await createReadyHarness({ sessions: anteriores });
    const raw = await makeBackupContent(defaults([makeSession(70)]));

    await commit(harness, raw);

    const anterior = await harness.adapter.readVerifiedHistoryGeneration(harness.generationId);
    expect(anterior.sessions.map((sessao) => sessao.id)).toEqual(['session-1', 'session-2']);
    expect(await harness.adapter.hasHistoryGeneration(harness.generationId)).toBe(true);
  });

  it('10. o receipt termina em settled com os dois mundos registrados', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const coreAnterior = harness.storage.getItem(KEY) as string;
    const raw = await makeBackupContent(defaults([makeSession(70)]));

    const resultado = await commit(harness, raw);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const receipts = await readOperationReceipts(harness);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe('settled');
    expect(receipts[0].previousCoreRaw).toBe(coreAnterior);
    expect(receipts[0].previousGenerationId).toBe(harness.generationId);
    expect(receipts[0].stagedGenerationId).toBe(resultado.generationId);
    expect(receipts[0].targetCoreRaw).toBe(harness.storage.getItem(KEY));
    // A importação nunca cria receipt de conclusão de treino.
    expect(await harness.adapter.readPendingCompletionReceipts()).toEqual([]);
  });

  it('11. termina em ready e o estado importado hidrata normalmente', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const importado = [makeSession(70), makeSession(71)];
    const raw = await makeBackupContent(defaults(importado));

    await commit(harness, raw);

    const snapshot = await harness.runtime.inspectStorageAdministration();
    expect(snapshot.state.status).toBe('ready');
    expect(snapshot.stagedGenerationId).toBeNull();
    expect(snapshot.unsettledOperations).toHaveLength(0);

    // Prova de ponta a ponta: o boot híbrido sobe sobre o estado importado.
    const rehidratado = createHybridStorageRuntime({
      key: KEY,
      storage: harness.storage,
      adapter: harness.adapter,
      defaults: defaults(),
      now: () => new Date('2026-07-26T12:00:00.000Z'),
    });
    const hidratacao = await rehidratado.hydrate();
    expect(hidratacao.mode).toBe('hybrid-v2');
    if (hidratacao.mode !== 'hybrid-v2') return;
    expect(hidratacao.state.workoutHistory.map((sessao) => sessao.id))
      .toEqual(['session-70', 'session-71']);
  });
});

// ---------------------------------------------------------------------------
// 12–22 — arquivo inválido, zero escrita
// ---------------------------------------------------------------------------

describe('importação lógica v2 — arquivo recusado antes do primeiro write', () => {
  async function expectNoWrite(
    harness: Harness,
    raw: string,
    expected: { reason: string; backupReason?: string | null },
    overrides: Partial<Parameters<typeof commitLogicalStorageImportV2>[0]> = {},
  ): Promise<void> {
    const antesStorage = harness.storage.snapshot();
    const antesFingerprint = await fingerprintOf(harness);
    const antesGeracoes = await readGenerationIds(harness);

    const resultado = await commit(harness, raw, overrides);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.reason).toBe(expected.reason);
    if (expected.backupReason !== undefined) {
      expect(resultado.backupReason).toBe(expected.backupReason);
    }
    expect(resultado.operationId).toBeNull();
    expect(resultado.compensation).toBe('not-needed');
    expect(harness.storage.snapshot()).toEqual(antesStorage);
    expect(await fingerprintOf(harness)).toBe(antesFingerprint);
    expect(await readGenerationIds(harness)).toEqual(antesGeracoes);
    expect(await readOperationReceipts(harness)).toHaveLength(0);
  }

  it('12. recusa IDs de sessão duplicados', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    // Digest calculado sobre o payload duplicado: a recusa vem da validação do
    // payload, não de divergência de digest.
    const raw = await makeBackupContent(defaults([makeSession(70), makeSession(70)]));
    await expectNoWrite(harness, raw, {
      reason: 'invalid-backup',
      backupReason: 'duplicate-session-id',
    });
  });

  it('13. recusa digest divergente do conteúdo', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]), {
      payloadDigest: `sha256:${'0'.repeat(64)}`,
    });
    await expectNoWrite(harness, raw, { reason: 'invalid-backup', backupReason: 'digest-mismatch' });
  });

  it('14. recusa logicalSchemaVersion futuro', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]), { logicalSchemaVersion: 2 });
    await expectNoWrite(harness, raw, {
      reason: 'unsupported-schema',
      backupReason: 'unsupported-schema',
    });
  });

  it('15. recusa um backup v1 real', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const origem = new MemoryStorage();
    origem.setItem(KEY, JSON.stringify({
      v: MONOLITHIC_STORAGE_VERSION,
      savedAt: '2026-07-26T09:00:00.000Z',
      data: defaults([makeSession(70)]),
    }));
    const v1 = createStorageExport(KEY, origem);
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;
    await expectNoWrite(harness, v1.content, {
      reason: 'unsupported-version',
      backupReason: 'unsupported-version',
    });
  });

  it('16. recusa campo externo desconhecido', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]), { extra: 'campo' });
    await expectNoWrite(harness, raw, { reason: 'invalid-backup', backupReason: 'invalid-format' });
  });

  it('17. recusa campo raiz desconhecido no payload', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const payload = defaults([makeSession(70)]);
    const raw = await makeBackupContent(payload, {
      payload: {
        ...JSON.parse(serializeLogicalPayloadCanonically(payload)) as Record<string, unknown>,
        extra: 1,
      },
    });
    await expectNoWrite(harness, raw, { reason: 'invalid-backup', backupReason: 'invalid-payload' });
  });

  it('18. recusa chave de protótipo perigosa', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const conteudo = await makeBackupContent(defaults([makeSession(70)]));
    const raw = conteudo.replace('"favoriteExercises":[]', '"favoriteExercises":[],"__proto__":{"x":1}');
    expect(raw).not.toBe(conteudo);
    await expectNoWrite(harness, raw, { reason: 'invalid-backup', backupReason: 'invalid-payload' });
  });

  it('19. recusa valor não JSON reconstruído a partir do arquivo', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const conteudo = await makeBackupContent(defaults([makeSession(70)]));
    // `1e999` reparseia como Infinity, que não é JSON válido de verdade.
    const raw = conteudo.replace('"restTimerEndAt":null', '"restTimerEndAt":1e999');
    expect(raw).not.toBe(conteudo);
    await expectNoWrite(harness, raw, { reason: 'invalid-backup', backupReason: 'invalid-payload' });
  });

  it('20. recusa declaredBytes inválido', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    await expectNoWrite(
      harness,
      raw,
      { reason: 'invalid-backup', backupReason: 'invalid-size' },
      { declaredBytes: Number.NaN },
    );
  });

  it('21. recusa arquivo acima do limite de 25 MiB', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    await expectNoWrite(
      harness,
      raw,
      { reason: 'invalid-backup', backupReason: 'too-large' },
      { declaredBytes: 26 * 1024 * 1024 },
    );
  });

  it('22. recusa expectedPayloadDigest divergente antes de qualquer write', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    await expectNoWrite(
      harness,
      raw,
      { reason: 'invalid-backup', backupReason: null },
      { expectedPayloadDigest: `sha256:${'a'.repeat(64)}` },
    );
  });
});

// ---------------------------------------------------------------------------
// 23–29 — estado atual do armazenamento
// ---------------------------------------------------------------------------

describe('importação lógica v2 — estado atual do armazenamento', () => {
  it('23. recusa quando o armazenamento físico ainda é v1', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    harness.storage.setItem(KEY, JSON.stringify({
      v: MONOLITHIC_STORAGE_VERSION,
      savedAt: '2026-07-26T09:00:00.000Z',
      data: defaults([]),
    }));
    const raw = await makeBackupContent(defaults([makeSession(70)]));

    const resultado = await commit(harness, raw);

    expect(resultado).toMatchObject({ ok: false, reason: 'administration-unavailable' });
    expect(await readOperationReceipts(harness)).toHaveLength(0);
  });

  it('24. recusa quando não existe core físico', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    harness.storage.values.delete(KEY);
    const raw = await makeBackupContent(defaults([makeSession(70)]));

    const resultado = await commit(harness, raw);

    expect(resultado).toMatchObject({ ok: false, reason: 'administration-unavailable' });
    expect(await readOperationReceipts(harness)).toHaveLength(0);
  });

  it('25. recusa quando o IndexedDB está indisponível', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const indisponivel = new Proxy(harness.adapter, {
      get(object, prop, receiver) {
        if (prop === 'isAvailable') return () => Promise.resolve(false);
        const value = Reflect.get(object, prop, receiver);
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(object)
          : value;
      },
    });
    const runtime = createStorageAdminRuntime({
      key: KEY,
      storage: harness.storage,
      adapter: indisponivel,
    });
    const raw = await makeBackupContent(defaults([makeSession(70)]));

    const resultado = await commit(harness, raw, { runtime });

    expect(resultado).toMatchObject({ ok: false, reason: 'administration-unavailable' });
    expect(await readOperationReceipts(harness)).toHaveLength(0);
  });

  it('26. recusa quando migrationStatus não está completed', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await putMetadataRecord(harness, 'migrationStatus', 'in-progress');
    const raw = await makeBackupContent(defaults([makeSession(70)]));

    const resultado = await commit(harness, raw);

    expect(resultado).toMatchObject({ ok: false, reason: 'migration-incomplete' });
    expect(await readOperationReceipts(harness)).toHaveLength(0);
  });

  it('27. recusa quando migrationGeneration não é null', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await putMetadataRecord(harness, 'migrationGeneration', 'generation-ocupada');
    const raw = await makeBackupContent(defaults([makeSession(70)]));

    const resultado = await commit(harness, raw);

    // O diagnóstico do A2 já bloqueia: staging sem receipt que o explique.
    expect(resultado).toMatchObject({ ok: false, reason: 'administration-conflicted' });
    expect(await readOperationReceipts(harness)).toHaveLength(0);
  });

  it('28. recusa quando existe receipt administrativo pendente', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    await harness.adapter.createStorageOperationReceiptIfIdle({
      receipt: createStorageOperationReceipt({
        operationId: 'operation-pendente',
        kind: 'rollback',
        previousCoreRaw: harness.storage.getItem(KEY) as string,
        previousGenerationId: harness.generationId,
        createdAt: '2026-07-26T09:30:00.000Z',
      }),
      expectedActiveGenerationId: harness.generationId,
    });
    const raw = await makeBackupContent(defaults([makeSession(70)]));

    const resultado = await commit(harness, raw);

    expect(resultado).toMatchObject({ ok: false, reason: 'administration-interrupted' });
    expect(await readOperationReceipts(harness)).toHaveLength(1);
  });

  it('29. recusa quando existe conclusão de treino pendente', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const sessao = makeSession(97);
    await harness.adapter.appendSessionWithCompletionReceipt(sessao, {
      receiptId: `receipt-${sessao.id}`,
      sessionId: sessao.id,
      generationId: harness.generationId,
      sessionDigest: await digestWorkoutSession(sessao),
      finalSession: sessao,
      coreEnvelopeAfter: coreOf(harness),
      effects: {
        xpNotifications: [],
        communityPost: {
          id: 'post-1',
          authorName: 'Rafael',
          authorAvatar: '🚀',
          time: 'Agora mesmo',
          content: 'Treino finalizado!',
          likes: 0,
          comments: [],
          userLiked: false,
          shares: 0,
        },
        unlockedAchievementIds: [],
        markedDayName: 'Segunda',
      },
      createdAt: '2026-07-26T09:40:00.000Z',
      status: 'pending',
      settledAt: null,
    });
    const raw = await makeBackupContent(defaults([makeSession(70)]));

    const resultado = await commit(harness, raw);

    expect(resultado).toMatchObject({ ok: false, reason: 'administration-conflicted' });
    expect(await readOperationReceipts(harness)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 30–40 — concorrência e integridade
// ---------------------------------------------------------------------------

describe('importação lógica v2 — concorrência e integridade', () => {
  it('30. bloqueia quando a geração ativa muda antes do staging', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const adapter = afterCall(harness.adapter, 'readStorageOperationReceipt', 1, async () => {
      await putMetadataRecord(harness, 'activeGeneration', 'generation-intrusa');
    }) as unknown as LogicalImportAdapter;

    const resultado = await commit(harness, raw, { adapter });

    expect(resultado).toMatchObject({ ok: false, reason: 'staging-failed' });
    expect(await readGenerationIds(harness)).toEqual([harness.generationId]);
  });

  it('31. bloqueia quando a geração ativa muda antes da ativação', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const adapter = afterCall(harness.adapter, 'readStorageOperationReceipt', 3, async () => {
      await putMetadataRecord(harness, 'activeGeneration', 'generation-intrusa');
    }) as unknown as LogicalImportAdapter;

    const resultado = await commit(harness, raw, { adapter });

    expect(resultado).toMatchObject({ ok: false, reason: 'activation-failed' });
    // O core do usuário nunca foi tocado.
    expect(coreOf(harness).historyStorage.generationId).toBe(harness.generationId);
  });

  it('32. bloqueia quando o core muda antes do commit', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const adapter = afterCall(harness.adapter, 'rollbackToHistoryGeneration', 1, () => {
      harness.storage.values.set(KEY, `${harness.storage.getItem(KEY) as string} `);
    }) as unknown as LogicalImportAdapter;

    const resultado = await commit(harness, raw, { adapter });

    expect(resultado).toMatchObject({ ok: false, reason: 'core-commit-failed' });
    // O core alheio não é desfeito nem sobrescrito.
    expect((harness.storage.getItem(KEY) as string).endsWith(' ')).toBe(true);
  });

  it('33. bloqueia quando o core muda entre as duas releituras do commit', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const backupAnterior = 'core-de-outro-momento';
    harness.storage.values.set(BACKUP_KEY, backupAnterior);
    harness.storage.onSetItem = (chave) => {
      if (chave === BACKUP_KEY) harness.storage.values.set(KEY, 'core-de-outra-aba');
    };

    const resultado = await commit(harness, raw);

    expect(resultado).toMatchObject({ ok: false, reason: 'core-commit-failed' });
    expect(harness.storage.getItem(KEY)).toBe('core-de-outra-aba');
    // A cópia rolante volta ao valor anterior: nada foi deixado pela metade.
    expect(harness.storage.getItem(BACKUP_KEY)).toBe(backupAnterior);
  });

  it('34. duas importações concorrentes: exatamente uma vence', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const rawA = await makeBackupContent(defaults([makeSession(70)]));
    const rawB = await makeBackupContent(defaults([makeSession(71)]));

    const [a, b] = await Promise.all([commit(harness, rawA), commit(harness, rawB)]);

    expect([a, b].filter((resultado) => resultado.ok)).toHaveLength(1);
    const perdedor = [a, b].find((resultado) => !resultado.ok);
    expect(perdedor).toBeDefined();
    if (!perdedor || perdedor.ok) return;
    expect([
      'operation-conflict',
      'administration-interrupted',
      'administration-conflicted',
      'snapshot-changed-during-import',
      'readback-failed',
    ]).toContain(perdedor.reason);
  });

  it('35. bloqueia quando a geração preparada é adulterada antes da ativação', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const adapter = afterCall(harness.adapter, 'readVerifiedHistoryGeneration', 1, async () => {
      await tamperGenerationRecord(harness, await stagedGenerationOf(harness));
    }) as unknown as LogicalImportAdapter;

    const resultado = await commit(harness, raw, { adapter });

    expect(resultado).toMatchObject({ ok: false, reason: 'activation-failed' });
    expect((await harness.adapter.readMetadata()).activeGeneration).toBe(harness.generationId);
  });

  it('36. bloqueia quando o manifest da geração preparada é adulterado', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const adapter = afterCall(harness.adapter, 'stageHistoryGenerationForOperation', 1, async () => {
      await tamperGenerationManifest(harness, await stagedGenerationOf(harness));
    }) as unknown as LogicalImportAdapter;

    const resultado = await commit(harness, raw, { adapter });

    expect(resultado).toMatchObject({ ok: false, reason: 'verification-failed' });
  });

  it('37. bloqueia quando o conteúdo preparado diverge do payload validado', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const adapter = afterCall(harness.adapter, 'stageHistoryGenerationForOperation', 1, async () => {
      await tamperGenerationRecord(harness, await stagedGenerationOf(harness));
    }) as unknown as LogicalImportAdapter;

    const resultado = await commit(harness, raw, { adapter });

    expect(resultado).toMatchObject({
      ok: false,
      reason: 'verification-failed',
      compensation: 'reverted',
    });
    // A geração preparada por esta operação é limpa; a anterior permanece.
    expect(await readGenerationIds(harness)).toEqual([harness.generationId]);
  });

  it('38. bloqueia quando o readback do core diverge da gravação', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const coreAnterior = harness.storage.getItem(KEY) as string;
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    harness.storage.onSetItem = (chave) => {
      // Gravação silenciosamente ignorada pela chave principal.
      if (chave === KEY) harness.storage.values.set(KEY, coreAnterior);
    };

    const resultado = await commit(harness, raw);

    expect(resultado).toMatchObject({
      ok: false,
      reason: 'core-commit-failed',
      compensation: 'reverted',
    });
    expect(harness.storage.getItem(KEY)).toBe(coreAnterior);
    expect((await harness.adapter.readMetadata()).activeGeneration).toBe(harness.generationId);
  });

  it('39. exige que o receipt ainda nomeie o mesmo core alvo para marcar activated', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const adapter = afterCall(harness.adapter, 'rollbackToHistoryGeneration', 1, async () => {
      const [receipt] = await readOperationReceipts(harness);
      await putRawOperationReceipt(harness, {
        ...receipt,
        targetCoreRaw: `${receipt.targetCoreRaw as string} `,
      });
    }) as unknown as LogicalImportAdapter;

    const resultado = await commit(harness, raw, { adapter });

    expect(resultado).toMatchObject({
      ok: false,
      reason: 'recovery-required',
      compensation: 'not-attempted',
    });
    // Journal preservado: nada terminal, nada apagado.
    expect((await readOperationReceipts(harness))[0].status).toBe('activating');
  });

  it('40. exige core alvo confirmado imediatamente antes de marcar activated', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const adapter = afterCall(harness.adapter, 'readVerifiedHistoryGeneration', 2, () => {
      harness.storage.values.set(KEY, 'core-trocado-depois-da-verificacao');
    }) as unknown as LogicalImportAdapter;

    const resultado = await commit(harness, raw, { adapter });

    expect(resultado).toMatchObject({ ok: false, reason: 'recovery-required' });
    expect((await readOperationReceipts(harness))[0].status).toBe('activating');
    expect(harness.storage.getItem(KEY)).toBe('core-trocado-depois-da-verificacao');
  });
});

// ---------------------------------------------------------------------------
// 41–50 — falhas e compensação imediata
// ---------------------------------------------------------------------------

describe('importação lógica v2 — falhas e compensação', () => {
  it('41. staging que falha antes do commit reverte o receipt e não cria geração', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const adapter = failingMethod(
      harness.adapter,
      'stageHistoryGenerationForOperation',
      new Error('staging indisponível'),
    ) as unknown as LogicalImportAdapter;

    const resultado = await commit(harness, raw, { adapter });

    expect(resultado).toMatchObject({
      ok: false,
      reason: 'staging-failed',
      compensation: 'reverted',
    });
    expect(await readGenerationIds(harness)).toEqual([harness.generationId]);
    expect((await readOperationReceipts(harness))[0].status).toBe('reverted');
    expect((await harness.runtime.inspectStorageAdministration()).state.status).toBe('ready');
  });

  it('42. verificação que falha reverte o receipt e limpa a geração preparada', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const adapter = failingMethod(
      harness.adapter,
      'readVerifiedHistoryGeneration',
      new Error('leitura verificada indisponível'),
    ) as unknown as LogicalImportAdapter;

    const resultado = await commit(harness, raw, { adapter });

    expect(resultado).toMatchObject({
      ok: false,
      reason: 'verification-failed',
      compensation: 'reverted',
    });
    expect(await readGenerationIds(harness)).toEqual([harness.generationId]);
  });

  it('43. ativação que falha reverte tudo e mantém a geração ativa anterior', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const coreAnterior = harness.storage.getItem(KEY) as string;
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const adapter = failingMethod(
      harness.adapter,
      'rollbackToHistoryGeneration',
      new Error('ativação indisponível'),
    ) as unknown as LogicalImportAdapter;

    const resultado = await commit(harness, raw, { adapter });

    expect(resultado).toMatchObject({
      ok: false,
      reason: 'activation-failed',
      compensation: 'reverted',
    });
    expect(harness.storage.getItem(KEY)).toBe(coreAnterior);
    expect((await harness.adapter.readMetadata()).activeGeneration).toBe(harness.generationId);
    expect(await readGenerationIds(harness)).toEqual([harness.generationId]);
  });

  it('44. falha da cópia rolante restaura a geração anterior sem tocar no core', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const coreAnterior = harness.storage.getItem(KEY) as string;
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    harness.storage.failSetItem = (chave) => (
      chave === BACKUP_KEY ? new Error('backup rolante indisponível') : null
    );

    const resultado = await commit(harness, raw);

    expect(resultado).toMatchObject({
      ok: false,
      reason: 'storage-unavailable',
      compensation: 'reverted',
    });
    expect(harness.storage.getItem(KEY)).toBe(coreAnterior);
    expect((await harness.adapter.readMetadata()).activeGeneration).toBe(harness.generationId);
  });

  it('45. quota na gravação do core devolve reason quota e restaura tudo', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const coreAnterior = harness.storage.getItem(KEY) as string;
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    harness.storage.failSetItem = (chave) => (chave === KEY ? quotaError() : null);

    const resultado = await commit(harness, raw);

    expect(resultado).toMatchObject({ ok: false, reason: 'quota', compensation: 'reverted' });
    expect(harness.storage.getItem(KEY)).toBe(coreAnterior);
    expect((await harness.adapter.readMetadata()).activeGeneration).toBe(harness.generationId);
    expect(await readGenerationIds(harness)).toEqual([harness.generationId]);
    expect((await harness.runtime.inspectStorageAdministration()).state.status).toBe('ready');
  });

  it('46. resultado ambíguo da gravação preserva o journal e não adivinha', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    harness.storage.onSetItem = (chave) => {
      if (chave === KEY) harness.storage.values.set(KEY, 'terceiro-valor-desconhecido');
    };

    const resultado = await commit(harness, raw);

    expect(resultado).toMatchObject({
      ok: false,
      reason: 'recovery-required',
      compensation: 'not-attempted',
    });
    // Nem sobrescreve o terceiro valor, nem apaga a geração, nem fecha o receipt.
    expect(harness.storage.getItem(KEY)).toBe('terceiro-valor-desconhecido');
    const receipts = await readOperationReceipts(harness);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe('activating');
    expect(await readGenerationIds(harness)).toHaveLength(2);
  });

  it('47. falha na liquidação devolve recovery-required com o mundo alvo aplicado', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    let chamadas = 0;
    const runtime = new Proxy(harness.runtime, {
      get(object, prop, receiver) {
        const value = Reflect.get(object, prop, receiver);
        if (typeof value !== 'function') return value;
        const bound = (value as (...a: unknown[]) => unknown).bind(object);
        if (prop !== 'transitionStorageOperation') return bound;
        return (...args: unknown[]) => {
          chamadas += 1;
          if (chamadas === 2) return Promise.reject(new Error('liquidação indisponível'));
          return bound(...args);
        };
      },
    });

    const resultado = await commit(harness, raw, { runtime });

    expect(resultado).toMatchObject({ ok: false, reason: 'recovery-required' });
    const receipts = await readOperationReceipts(harness);
    expect(receipts[0].status).toBe('activated');
    expect(receipts[0].previousCoreRaw).toBeTruthy();
    expect((await harness.adapter.readActiveHistory()).map((sessao) => sessao.id))
      .toEqual(['session-70']);
  });

  it('48. compensação comprovável devolve o armazenamento ao estado anterior', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1), makeSession(2)] });
    const antes = harness.storage.snapshot();
    const historicoAntes = await harness.adapter.readActiveHistory();
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const adapter = failingMethod(
      harness.adapter,
      'rollbackToHistoryGeneration',
      new Error('ativação indisponível'),
    ) as unknown as LogicalImportAdapter;

    const resultado = await commit(harness, raw, { adapter });

    expect(resultado.ok).toBe(false);
    expect(harness.storage.snapshot()).toEqual(antes);
    expect(await harness.adapter.readActiveHistory()).toEqual(historicoAntes);
    expect((await harness.runtime.inspectStorageAdministration()).state.status).toBe('ready');
  });

  it('49. estado ambíguo mantém os dois mundos registrados no journal', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const coreAnterior = harness.storage.getItem(KEY) as string;
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    harness.storage.onSetItem = (chave) => {
      if (chave === KEY) harness.storage.values.set(KEY, 'terceiro-valor-desconhecido');
    };

    await commit(harness, raw);

    const [receipt] = await readOperationReceipts(harness);
    expect(receipt.previousCoreRaw).toBe(coreAnterior);
    expect(receipt.previousGenerationId).toBe(harness.generationId);
    expect(receipt.stagedGenerationId).toBeTruthy();
    expect(receipt.targetCoreRaw).toBeTruthy();
    expect(receipt.status).toBe('activating');
  });

  it('50. nenhuma compensação apaga a geração ativa ou a geração anterior', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const adapter = failingMethod(
      harness.adapter,
      'rollbackToHistoryGeneration',
      new Error('ativação indisponível'),
    ) as unknown as LogicalImportAdapter;

    await commit(harness, raw, { adapter });

    expect(await harness.adapter.hasHistoryGeneration(harness.generationId)).toBe(true);
    const anterior = await harness.adapter.readVerifiedHistoryGeneration(harness.generationId);
    expect(anterior.sessions.map((sessao) => sessao.id)).toEqual(['session-1']);
  });
});

// ---------------------------------------------------------------------------
// 51–60 — idempotência, invariantes e isolamento
// ---------------------------------------------------------------------------

describe('importação lógica v2 — idempotência e invariantes', () => {
  it('51. reimportar o mesmo arquivo cria um operationId novo', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));

    const primeira = await commit(harness, raw);
    const segunda = await commit(harness, raw);

    if (!primeira.ok || !segunda.ok) throw new Error('as duas importações deveriam ter sucesso');
    expect(segunda.operationId).not.toBe(primeira.operationId);
    expect(segunda.payloadDigest).toBe(primeira.payloadDigest);
    const receipts = await readOperationReceipts(harness);
    expect(receipts).toHaveLength(2);
    expect(receipts.every((receipt) => receipt.status === 'settled')).toBe(true);
  });

  it('52. reimportar o mesmo arquivo cria um generationId físico novo', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));

    const primeira = await commit(harness, raw);
    const segunda = await commit(harness, raw);

    if (!primeira.ok || !segunda.ok) throw new Error('as duas importações deveriam ter sucesso');
    expect(segunda.generationId).not.toBe(primeira.generationId);
    expect(segunda.previousGenerationId).toBe(primeira.generationId);
    expect(await readGenerationIds(harness)).toHaveLength(3);
  });

  it('53. nenhuma geração anterior é excluída no caminho saudável', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));

    await commit(harness, raw);
    await commit(harness, raw);

    const geracoes = await harness.adapter.listHistoryGenerations();
    expect(geracoes).toHaveLength(3);
    expect(geracoes.filter((geracao) => geracao.isActive)).toHaveLength(1);
  });

  it('54. a chave principal nunca é removida', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));

    await commit(harness, raw);
    const falho = failingMethod(
      harness.adapter,
      'rollbackToHistoryGeneration',
      new Error('ativação indisponível'),
    ) as unknown as LogicalImportAdapter;
    await commit(harness, raw, { adapter: falho });

    expect(harness.storage.removed).not.toContain(KEY);
  });

  it('55. nenhum retorno público carrega sentinelas privadas', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const payload = defaults([makeSession(70, { name: 'SENTINELA-TREINO' })]);
    payload.user = {
      name: 'SENTINELA-NOME',
      email: 'sentinela@example.test',
    } as unknown as PersistedState['user'];
    const raw = await makeBackupContent(payload);
    const coreAnterior = harness.storage.getItem(KEY) as string;

    const sucesso = await commit(harness, raw);
    const falha = await commit(harness, await makeBackupContent(payload, {
      payloadDigest: `sha256:${'0'.repeat(64)}`,
    }));

    for (const resultado of [sucesso, falha]) {
      const serializado = JSON.stringify(resultado);
      for (const sentinela of [
        'SENTINELA-NOME',
        'SENTINELA-TREINO',
        'sentinela@example.test',
        'session-70',
        coreAnterior,
        raw,
        'historyStorage',
      ]) {
        expect(serializado).not.toContain(sentinela);
      }
    }
  });

  it('56. o resolvedor puro é determinístico', () => {
    const observacao = makeObservation({});
    const primeira = resolveLogicalImportRecovery(observacao);
    expect(resolveLogicalImportRecovery(observacao)).toEqual(primeira);
    expect(resolveLogicalImportRecovery(makeObservation({}))).toEqual(primeira);
  });

  it('57. o resolvedor puro não modifica a entrada', () => {
    const observacao = makeObservation({});
    const antes = JSON.stringify(observacao);
    resolveLogicalImportRecovery(observacao);
    expect(JSON.stringify(observacao)).toBe(antes);
  });

  it('58. o módulo não importa React', () => {
    expect(importModuleSource()).not.toMatch(/from '(react|react-dom)[^']*'/);
  });

  it('59. o módulo não usa document, Blob, URL nem escrita fora do protocolo', () => {
    const fonte = importModuleSource();
    for (const proibido of [
      'document',
      'new Blob',
      'createObjectURL',
      'createElement',
      'downloadTextFile',
      'window.',
      'saveHybridCoreResult',
      'prepareHistoryGeneration',
      'activateHistoryGeneration',
      'replaceHistory',
      'writeMetadata',
    ]) {
      expect(fonte).not.toContain(proibido);
    }
  });

  it('60. o importador não tem nenhum call site fora dos testes', () => {
    expect(sourceFilesImporting('storage-logical-import'))
      .toEqual(['src/lib/storage-logical-import.test.ts']);
  });
});

// ---------------------------------------------------------------------------
// Resolvedor puro — tabela fechada de decisões
// ---------------------------------------------------------------------------

const PREVIOUS_CORE = '{"v":2,"savedAt":"2026-07-26T08:00:00.000Z","data":"anterior"}';
const TARGET_CORE = '{"v":2,"savedAt":"2026-07-26T11:00:00.000Z","data":"alvo"}';

function makeImportReceipt(
  overrides: Partial<StorageOperationReceipt> = {},
): StorageOperationReceipt {
  return {
    ...createStorageOperationReceipt({
      operationId: 'operation-1',
      kind: 'import',
      previousCoreRaw: PREVIOUS_CORE,
      previousGenerationId: 'generation-anterior',
      createdAt: '2026-07-26T10:00:00.000Z',
      sourceDigest: `sha256:${'b'.repeat(64)}`,
    }),
    ...overrides,
  };
}

function makeObservation(
  overrides: Partial<LogicalImportObservation> = {},
): LogicalImportObservation {
  return {
    receipt: makeImportReceipt(),
    coreRaw: PREVIOUS_CORE,
    metadata: {
      activeGeneration: 'generation-anterior',
      migrationGeneration: null,
      migrationStatus: 'completed',
    },
    generations: [{ generationId: 'generation-anterior' }, { generationId: 'generation-nova' }],
    stagedGenerationIntegrity: 'unknown',
    targetVerification: 'unknown',
    unsettledOperationCount: 1,
    pendingCompletionReceiptCount: 0,
    ...overrides,
  };
}

const APPLIED_METADATA = {
  activeGeneration: 'generation-nova',
  migrationGeneration: null,
  migrationStatus: 'completed',
} as const;

function importModuleSource(): string {
  return fs.readFileSync(path.join(process.cwd(), 'src/lib/storage-logical-import.ts'), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');
}

// Varre `src/` inteiro procurando quem importa o módulo.
function sourceFilesImporting(moduleName: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const relative = path.relative(process.cwd(), full).split(path.sep).join('/');
      if (relative.endsWith(`/${moduleName}.ts`)) continue;
      if (fs.readFileSync(full, 'utf8').includes(`./${moduleName}`)) found.push(relative);
    }
  };
  walk(path.join(process.cwd(), 'src'));
  return found.sort();
}

describe('resolveLogicalImportRecovery — tabela fechada', () => {
  function decide(overrides: Partial<LogicalImportObservation>): LogicalImportRecoveryDecision {
    return resolveLogicalImportRecovery(makeObservation(overrides));
  }

  it('61. sem receipt não existe operação para recuperar', () => {
    expect(decide({ receipt: null, unsettledOperationCount: 0 })).toEqual({ action: 'no-operation' });
  });

  it('62. receipt de outro kind bloqueia', () => {
    expect(decide({ receipt: makeImportReceipt({ kind: 'reset' }) }))
      .toEqual({ action: 'recovery-required', reason: 'not-an-import' });
  });

  it('63. receipt terminal já está liquidado', () => {
    expect(decide({ receipt: makeImportReceipt({ status: 'settled' }), unsettledOperationCount: 0 }))
      .toEqual({ action: 'already-settled', operationId: 'operation-1', status: 'settled' });
    expect(decide({ receipt: makeImportReceipt({ status: 'reverted' }), unsettledOperationCount: 0 }))
      .toEqual({ action: 'already-settled', operationId: 'operation-1', status: 'reverted' });
  });

  it('64. staged sem geração preparada pede o staging', () => {
    expect(decide({})).toEqual({ action: 'stage-generation', operationId: 'operation-1' });
  });

  it('65. staged com geração preparada não verificada pede a verificação', () => {
    expect(decide({ receipt: makeImportReceipt({ stagedGenerationId: 'generation-nova' }) }))
      .toEqual({ action: 'verify-staging', operationId: 'operation-1', generationId: 'generation-nova' });
  });

  it('66. staged com geração verificada pede o core alvo', () => {
    expect(decide({
      receipt: makeImportReceipt({ stagedGenerationId: 'generation-nova' }),
      stagedGenerationIntegrity: 'verified',
    })).toEqual({ action: 'prepare-core', operationId: 'operation-1', generationId: 'generation-nova' });
  });

  it('67. staged com geração preparada inválida pede a limpeza', () => {
    expect(decide({
      receipt: makeImportReceipt({ stagedGenerationId: 'generation-nova' }),
      stagedGenerationIntegrity: 'invalid',
    })).toEqual({
      action: 'cleanup-inactive-staging',
      operationId: 'operation-1',
      generationId: 'generation-nova',
    });
  });

  it('68. staged sobre um core que já não é o anterior encerra com segurança', () => {
    expect(decide({ coreRaw: 'core-de-outra-aba' }))
      .toEqual({ action: 'revert-safe', operationId: 'operation-1', reason: 'core-not-previous' });
  });

  it('69. staged com core alvo declarado é estado impossível', () => {
    expect(decide({ receipt: makeImportReceipt({ targetCoreRaw: TARGET_CORE }) }))
      .toEqual({ action: 'impossible-state', reason: 'staged-with-target-core' });
  });

  it('70. activating com nada aplicado pede a ativação', () => {
    expect(decide({
      receipt: makeImportReceipt({
        status: 'activating',
        stagedGenerationId: 'generation-nova',
        targetCoreRaw: TARGET_CORE,
      }),
    })).toEqual({
      action: 'activate-generation',
      operationId: 'operation-1',
      generationId: 'generation-nova',
      previousGenerationId: 'generation-anterior',
    });
  });

  it('71. activating com a geração já ativa pede o commit do core', () => {
    expect(decide({
      receipt: makeImportReceipt({
        status: 'activating',
        stagedGenerationId: 'generation-nova',
        targetCoreRaw: TARGET_CORE,
      }),
      metadata: { ...APPLIED_METADATA },
    })).toEqual({ action: 'commit-core', operationId: 'operation-1', generationId: 'generation-nova' });
  });

  it('72. activating com tudo aplicado pede verificação e depois a marcação', () => {
    const aplicado: Partial<LogicalImportObservation> = {
      receipt: makeImportReceipt({
        status: 'activating',
        stagedGenerationId: 'generation-nova',
        targetCoreRaw: TARGET_CORE,
      }),
      coreRaw: TARGET_CORE,
      metadata: { ...APPLIED_METADATA },
    };
    expect(decide(aplicado))
      .toEqual({ action: 'verify-target', operationId: 'operation-1', generationId: 'generation-nova' });
    expect(decide({ ...aplicado, targetVerification: 'verified' }))
      .toEqual({ action: 'mark-activated', operationId: 'operation-1', generationId: 'generation-nova' });
    expect(decide({ ...aplicado, targetVerification: 'invalid' }))
      .toEqual({ action: 'recovery-required', reason: 'target-verification-failed' });
  });

  it('73. activated coerente pede a liquidação', () => {
    expect(decide({
      receipt: makeImportReceipt({
        status: 'activated',
        stagedGenerationId: 'generation-nova',
        targetCoreRaw: TARGET_CORE,
      }),
      coreRaw: TARGET_CORE,
      metadata: { ...APPLIED_METADATA },
    })).toEqual({ action: 'settle', operationId: 'operation-1' });
  });

  it('74. activated sem os efeitos declarados bloqueia', () => {
    const base = makeImportReceipt({
      status: 'activated',
      stagedGenerationId: 'generation-nova',
      targetCoreRaw: TARGET_CORE,
    });
    expect(decide({ receipt: base, coreRaw: TARGET_CORE }))
      .toEqual({ action: 'recovery-required', reason: 'activated-generation-not-active' });
    expect(decide({ receipt: base, metadata: { ...APPLIED_METADATA } }))
      .toEqual({ action: 'recovery-required', reason: 'activated-core-not-target' });
    expect(decide({
      receipt: makeImportReceipt({ status: 'activated' }),
      coreRaw: TARGET_CORE,
      metadata: { ...APPLIED_METADATA },
    })).toEqual({ action: 'impossible-state', reason: 'activated-target-missing' });
  });

  it('75. ambiguidade estrutural bloqueia antes de qualquer decisão de avanço', () => {
    expect(decide({ unsettledOperationCount: 2 }))
      .toEqual({ action: 'recovery-required', reason: 'multiple-unsettled-operations' });
    expect(decide({ pendingCompletionReceiptCount: 1 }))
      .toEqual({ action: 'recovery-required', reason: 'completion-pending' });
    expect(decide({ coreRaw: null }))
      .toEqual({ action: 'recovery-required', reason: 'core-missing' });
    expect(decide({
      metadata: {
        activeGeneration: 'generation-anterior',
        migrationGeneration: null,
        migrationStatus: 'in-progress',
      },
    })).toEqual({ action: 'recovery-required', reason: 'migration-incomplete' });
    expect(decide({
      metadata: {
        activeGeneration: 'generation-anterior',
        migrationGeneration: 'generation-x',
        migrationStatus: 'completed',
      },
    })).toEqual({ action: 'recovery-required', reason: 'unexpected-staging-pointer' });
    expect(decide({ generations: [{ generationId: 'generation-nova' }] }))
      .toEqual({ action: 'impossible-state', reason: 'previous-generation-absent' });
    expect(decide({ receipt: makeImportReceipt({ stagedGenerationId: 'generation-fantasma' }) }))
      .toEqual({ action: 'impossible-state', reason: 'staged-generation-absent' });
  });

  it('76. o módulo exporta apenas o commit e o resolvedor como funções', () => {
    const funcoes = Object.keys(logicalImportModule)
      .filter((nome) => typeof (logicalImportModule as Record<string, unknown>)[nome] === 'function')
      .sort();
    expect(funcoes).toEqual(['commitLogicalStorageImportV2', 'resolveLogicalImportRecovery']);
    // A recuperação com I/O real é do C2 e ainda não existe.
    expect(Object.keys(logicalImportModule)).not.toContain('recoverLogicalStorageImportV2');
  });
});
