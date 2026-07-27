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
  COMPLETION_RECEIPTS_STORE,
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

// O double implementa `StorageLike` e nada além disso: a interface de produção
// não ganhou campo nenhum. A injeção de falha — de escrita E de leitura — vive
// só aqui, e o valor lançado é `unknown` de propósito, porque um `Storage` real
// pode lançar `DOMException`, string ou qualquer outra coisa.
class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  readonly removed: string[] = [];
  // Injeção de outra aba: roda DEPOIS de uma gravação bem-sucedida.
  onSetItem: ((key: string, value: string) => void) | null = null;
  // Falha determinística de gravação, por chave.
  failSetItem: ((key: string, value: string) => { error: unknown } | null) | null = null;
  // Falha determinística de leitura, por chave e por ordem de chamada daquela
  // chave. A ordem é por chave para que um teste possa derrubar exatamente a
  // segunda leitura da chave principal.
  failGetItem: ((key: string, call: number) => { error: unknown } | null) | null = null;
  readonly getItemCalls = new Map<string, number>();

  getItem(key: string): string | null {
    const call = (this.getItemCalls.get(key) ?? 0) + 1;
    this.getItemCalls.set(key, call);
    const failure = this.failGetItem?.(key, call) ?? null;
    if (failure) throw failure.error;
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    const failure = this.failSetItem?.(key, value) ?? null;
    if (failure) throw failure.error;
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

function namedError(name: string, message = 'falha de armazenamento'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function quotaError(): Error {
  return namedError('QuotaExceededError', 'The quota has been exceeded.');
}

// Erro de leitura cuja mensagem é uma sentinela: nenhum retorno público pode
// repeti-la.
function getterError(): Error {
  return namedError('UnknownError', 'PRIVATE_GETTER_MESSAGE');
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

function deleteOperationReceipt(harness: Harness, operationId: string): Promise<unknown> {
  return withStore(harness, STORAGE_OPERATION_RECEIPTS_STORE, 'readwrite', (transaction) => (
    requestResult(transaction.objectStore(STORAGE_OPERATION_RECEIPTS_STORE).delete(operationId))
  ));
}

function putRawCompletionReceipt(
  harness: Harness,
  record: Record<string, unknown>,
): Promise<unknown> {
  return withStore(harness, COMPLETION_RECEIPTS_STORE, 'readwrite', (transaction) => (
    requestResult(transaction.objectStore(COMPLETION_RECEIPTS_STORE).put(record))
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
    const coreAnterior = harness.storage.getItem(KEY) as string;
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const backupAnterior = 'core-de-outro-momento';
    harness.storage.values.set(BACKUP_KEY, backupAnterior);
    harness.storage.onSetItem = (chave) => {
      if (chave === BACKUP_KEY) harness.storage.values.set(KEY, 'core-de-outra-aba');
    };

    const resultado = await commit(harness, raw);

    expect(resultado).toMatchObject({ ok: false, reason: 'core-commit-failed' });
    expect(harness.storage.getItem(KEY)).toBe('core-de-outra-aba');
    // A cópia rolante NÃO volta ao valor anterior (corretivo 055): ela já
    // contém `previousCoreRaw`, que é o estado canônico anterior verificado.
    // Reescrever `backupAnterior` por cima apagaria um backup mais novo.
    expect(harness.storage.getItem(BACKUP_KEY)).toBe(coreAnterior);
    expect(harness.storage.getItem(BACKUP_KEY)).not.toBe(backupAnterior);
    expect(harness.storage.removed).not.toContain(BACKUP_KEY);
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
      chave === BACKUP_KEY ? { error: new Error('backup rolante indisponível') } : null
    );

    const resultado = await commit(harness, raw);

    expect(resultado).toMatchObject({
      ok: false,
      reason: 'storage-unavailable',
      compensation: 'reverted',
    });
    expect(harness.storage.getItem(KEY)).toBe(coreAnterior);
    expect((await harness.adapter.readMetadata()).activeGeneration).toBe(harness.generationId);
    // A cópia rolante nunca foi gravada e também nunca foi removida.
    expect(harness.storage.getItem(BACKUP_KEY)).toBeNull();
    expect(harness.storage.removed).toEqual([]);
  });

  it('45. quota na gravação do core devolve reason quota e restaura tudo', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const coreAnterior = harness.storage.getItem(KEY) as string;
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    harness.storage.failSetItem = (chave) => (chave === KEY ? { error: quotaError() } : null);

    const resultado = await commit(harness, raw);

    expect(resultado).toMatchObject({ ok: false, reason: 'quota', compensation: 'reverted' });
    // A cópia rolante ficou com o core anterior e não foi desfeita.
    expect(harness.storage.getItem(BACKUP_KEY)).toBe(coreAnterior);
    expect(harness.storage.removed).toEqual([]);
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

// ---------------------------------------------------------------------------
// 77–83 — política da cópia rolante (corretivo 055)
//
// A cópia rolante é AUXILIAR. Depois que a importação grava `previousCoreRaw`
// nela, esse valor já é um backup válido do estado anterior, e nenhuma
// compensação a escreve de volta nem a remove. O risco fechado aqui é a
// restauração incondicional: entre a leitura e a compensação outra aba pode ter
// atualizado a cópia, e devolvê-la ao valor antigo apagaria um backup mais novo.
// ---------------------------------------------------------------------------

describe('importação lógica v2 — política da cópia rolante', () => {
  it('77. um abort deixa a cópia em previousCoreRaw, sem restaurar o valor antigo', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const coreAnterior = harness.storage.getItem(KEY) as string;
    harness.storage.values.set(BACKUP_KEY, 'copia-de-outro-momento');
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    harness.storage.failSetItem = (chave) => (chave === KEY ? { error: quotaError() } : null);

    const resultado = await commit(harness, raw);

    expect(resultado).toMatchObject({ ok: false, reason: 'quota', compensation: 'reverted' });
    expect(harness.storage.getItem(BACKUP_KEY)).toBe(coreAnterior);
    expect(harness.storage.removed).toEqual([]);
    // O estado canônico voltou inteiro: chave principal e geração ativa.
    expect(harness.storage.getItem(KEY)).toBe(coreAnterior);
    expect((await harness.adapter.readMetadata()).activeGeneration).toBe(harness.generationId);
  });

  it('78. cópia ausente antes da importação não é recriada como ausência', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const coreAnterior = harness.storage.getItem(KEY) as string;
    expect(harness.storage.getItem(BACKUP_KEY)).toBeNull();
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    harness.storage.failSetItem = (chave) => (chave === KEY ? { error: quotaError() } : null);

    await commit(harness, raw);

    // Nada de `removeItem(backupKey)` para reproduzir a ausência anterior.
    expect(harness.storage.getItem(BACKUP_KEY)).toBe(coreAnterior);
    expect(harness.storage.removed).toEqual([]);
  });

  it('79. cópia alterada por outra aba depois da gravação fica intacta', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const coreAnterior = harness.storage.getItem(KEY) as string;
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    harness.storage.onSetItem = (chave) => {
      if (chave === BACKUP_KEY) harness.storage.values.set(BACKUP_KEY, 'copia-de-outra-aba');
    };

    const resultado = await commit(harness, raw);

    expect(resultado).toMatchObject({
      ok: false,
      reason: 'core-commit-failed',
      compensation: 'reverted',
    });
    // Nem sobrescrita, nem removida: a cópia da outra aba permanece.
    expect(harness.storage.getItem(BACKUP_KEY)).toBe('copia-de-outra-aba');
    expect(harness.storage.removed).toEqual([]);
    expect(harness.storage.getItem(KEY)).toBe(coreAnterior);
    expect((await harness.adapter.readMetadata()).activeGeneration).toBe(harness.generationId);
  });

  it('80. falha da cópia com terceiro valor na chave principal preserva o journal', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    harness.storage.onSetItem = (chave) => {
      if (chave !== BACKUP_KEY) return;
      harness.storage.values.set(KEY, 'core-de-outra-aba');
      harness.storage.values.set(BACKUP_KEY, 'copia-de-outra-aba');
    };

    const resultado = await commit(harness, raw);

    expect(resultado).toMatchObject({
      ok: false,
      reason: 'recovery-required',
      compensation: 'not-attempted',
    });
    // Terceiro valor não é sobrescrito nem removido, e a cópia fica como está.
    expect(harness.storage.getItem(KEY)).toBe('core-de-outra-aba');
    expect(harness.storage.getItem(BACKUP_KEY)).toBe('copia-de-outra-aba');
    expect(harness.storage.removed).toEqual([]);
    const receipts = await readOperationReceipts(harness);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe('activating');
  });

  it('81. falha da cópia com a chave principal já no core alvo não finge reversão', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    let alvo: string | null = null;
    const adapter = afterCall(harness.adapter, 'rollbackToHistoryGeneration', 1, async () => {
      const [receipt] = await readOperationReceipts(harness);
      alvo = receipt.targetCoreRaw;
    }) as unknown as LogicalImportAdapter;
    harness.storage.onSetItem = (chave) => {
      const prometido = alvo;
      if (chave !== BACKUP_KEY || prometido === null) return;
      harness.storage.values.set(KEY, prometido);
      harness.storage.values.set(BACKUP_KEY, 'copia-de-outra-aba');
    };

    const resultado = await commit(harness, raw, { adapter });

    expect(resultado).toMatchObject({
      ok: false,
      reason: 'recovery-required',
      compensation: 'not-attempted',
    });
    expect(harness.storage.getItem(KEY)).toBe(alvo);
    expect(harness.storage.getItem(BACKUP_KEY)).toBe('copia-de-outra-aba');
    // Nada foi revertido às cegas: a geração preparada continua ativa.
    const receipts = await readOperationReceipts(harness);
    expect(receipts[0].status).toBe('activating');
    expect((await harness.adapter.readMetadata()).activeGeneration)
      .toBe(receipts[0].stagedGenerationId);
  });

  it('82. o módulo não tem primitiva de restauração da cópia nem removeItem', () => {
    const fonte = importModuleSource();
    for (const proibido of ['restoreRollingBackup', 'removeItem']) {
      expect(fonte).not.toContain(proibido);
    }
  });

  it('83. nenhum caminho de falha remove qualquer chave do armazenamento', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));

    // Falha da ativação.
    await commit(harness, raw, {
      adapter: failingMethod(
        harness.adapter,
        'rollbackToHistoryGeneration',
        new Error('ativação indisponível'),
      ) as unknown as LogicalImportAdapter,
    });
    // Falha da cópia rolante.
    harness.storage.failSetItem = (chave) => (
      chave === BACKUP_KEY ? { error: new Error('cópia indisponível') } : null
    );
    await commit(harness, raw);
    // Falha da gravação do core.
    harness.storage.failSetItem = (chave) => (chave === KEY ? { error: quotaError() } : null);
    await commit(harness, raw);
    // Terceiro valor na chave principal.
    harness.storage.failSetItem = null;
    harness.storage.onSetItem = (chave) => {
      if (chave === KEY) harness.storage.values.set(KEY, 'terceiro-valor-desconhecido');
    };
    await commit(harness, raw);

    expect(harness.storage.removed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 84–94 — classificação ESTRUTURAL de quota
//
// `reason: 'quota'` só sai de sinal estrutural. Uma mensagem que menciona
// "quota" não é sinal: num erro vindo do `StorageLike` do chamador, ela é texto
// que o chamador controla.
// ---------------------------------------------------------------------------

describe('importação lógica v2 — classificação estrutural de quota', () => {
  async function reasonForCoreWriteError(error: unknown): Promise<string> {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    harness.storage.failSetItem = (chave) => (chave === KEY ? { error } : null);
    const resultado = await commit(harness, raw);
    if (resultado.ok) throw new Error('a gravação do core deveria ter falhado');
    return resultado.reason;
  }

  it('84. QuotaExceededError é quota', async () => {
    expect(await reasonForCoreWriteError(quotaError())).toBe('quota');
  });

  it('85. NS_ERROR_DOM_QUOTA_REACHED é quota', async () => {
    expect(await reasonForCoreWriteError(namedError('NS_ERROR_DOM_QUOTA_REACHED'))).toBe('quota');
  });

  it('86. DOMException de quota é quota', async () => {
    const excecao = new DOMException('sem espaço', 'QuotaExceededError');
    expect(excecao).toBeInstanceOf(DOMException);
    expect(await reasonForCoreWriteError(excecao)).toBe('quota');
  });

  it('87. TypeError com "quota" na mensagem NÃO é quota', async () => {
    expect(await reasonForCoreWriteError(new TypeError('quota exceeded no proxy')))
      .toBe('storage-unavailable');
  });

  it('88. Error comum com "quota" na mensagem NÃO é quota', async () => {
    expect(await reasonForCoreWriteError(new Error('a quota do usuário acabou')))
      .toBe('storage-unavailable');
  });

  it('89. AbortError NÃO é quota', async () => {
    expect(await reasonForCoreWriteError(namedError('AbortError', 'quota abortada')))
      .toBe('storage-unavailable');
  });

  it('90. UnknownError NÃO é quota', async () => {
    expect(await reasonForCoreWriteError(namedError('UnknownError', 'quota desconhecida')))
      .toBe('storage-unavailable');
  });

  it('91. objeto arbitrário com name de quota NÃO é quota', async () => {
    expect(await reasonForCoreWriteError({ name: 'QuotaExceededError', code: 22 }))
      .toBe('storage-unavailable');
  });

  it('92. null lançado não vira quota nem falha de escrita inventada', async () => {
    // `null` é indistinguível de "não houve erro"; o readback é quem prova que
    // a gravação não pegou, e o motivo sai de lá — nunca de uma suposição.
    expect(await reasonForCoreWriteError(null)).toBe('core-commit-failed');
  });

  it('93. string lançada NÃO é quota', async () => {
    expect(await reasonForCoreWriteError('QuotaExceededError')).toBe('storage-unavailable');
  });

  it('94. quota na cópia rolante também é classificada estruturalmente', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    harness.storage.failSetItem = (chave) => (
      chave === BACKUP_KEY ? { error: quotaError() } : null
    );

    const comQuota = await commit(harness, raw);

    expect(comQuota).toMatchObject({ ok: false, reason: 'quota', compensation: 'reverted' });

    harness.storage.failSetItem = (chave) => (
      chave === BACKUP_KEY ? { error: new Error('quota mentirosa') } : null
    );
    const semQuota = await commit(harness, raw);
    expect(semQuota).toMatchObject({ ok: false, reason: 'storage-unavailable' });
  });
});

// ---------------------------------------------------------------------------
// Inspeção de privacidade — usada pelos blocos de getItem, do W8 e da parte 7
// ---------------------------------------------------------------------------

const SENTINELAS = [
  'PRIVATE_RAW',
  'PRIVATE_PREVIOUS_CORE',
  'PRIVATE_TARGET_CORE',
  'PRIVATE_EMAIL',
  'PRIVATE_NAME',
  'PRIVATE_SESSION_ID',
  'PRIVATE_WORKOUT',
  'PRIVATE_GETTER_MESSAGE',
] as const;

// Varredura RECURSIVA de tudo que um valor consegue carregar: propriedades
// enumeráveis E não enumeráveis, `name`, `message`, `stack`, `cause`, causas
// aninhadas, arrays, Map, Set e objetos comuns. `JSON.stringify(erro)` devolve
// `{}` — confiar só nele provaria exatamente nada sobre vazamento.
function collectStrings(
  value: unknown,
  seen: WeakSet<object> = new WeakSet<object>(),
  out: string[] = [],
): string[] {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (typeof value === 'symbol') {
    out.push(String(value.description ?? ''));
    return out;
  }
  if (typeof value === 'function') {
    out.push(value.name);
    return out;
  }
  if (value === null || typeof value !== 'object') return out;
  if (seen.has(value)) return out;
  seen.add(value);

  if (value instanceof Error) {
    out.push(value.name, value.message, value.stack ?? '');
    collectStrings((value as { cause?: unknown }).cause, seen, out);
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, seen, out);
  }
  if (value instanceof Map) {
    for (const [chave, item] of value) {
      collectStrings(chave, seen, out);
      collectStrings(item, seen, out);
    }
  }
  if (value instanceof Set) {
    for (const item of value) collectStrings(item, seen, out);
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    out.push(key);
    let property: unknown;
    try {
      property = (value as Record<string, unknown>)[key];
    } catch {
      continue;
    }
    collectStrings(property, seen, out);
  }
  return out;
}

// Falha com a fase e o texto vazado no próprio diagnóstico.
function expectNoSentinels(fase: string, ...valores: unknown[]): void {
  const textos = valores.flatMap((valor) => collectStrings(valor));
  for (const valor of valores) {
    // O serializado entra também: ele é o que um log ingênuo mandaria embora.
    textos.push(JSON.stringify(valor) ?? '');
  }
  for (const sentinela of SENTINELAS) {
    const vazando = textos.filter((texto) => texto.includes(sentinela));
    expect(`${fase} → ${vazando.join(' | ')}`).toBe(`${fase} → `);
  }
}

// ---------------------------------------------------------------------------
// 95–100 — falhas de getItem
//
// Uma leitura que estoura não prova nada sobre o estado canônico. Nesses casos
// o fluxo não escreve na chave principal, não escreve na cópia rolante, não
// remove nada e mantém o journal aberto para o C2.
// ---------------------------------------------------------------------------

describe('importação lógica v2 — falhas de getItem', () => {
  // A falha de leitura é armada por FASE, nunca por índice global de chamada:
  // o gatilho é o efeito administrativo que precede a leitura sob teste.
  function failReadsOf(harness: Harness, alvo: string): () => void {
    return () => {
      harness.storage.failGetItem = (chave) => (
        chave === alvo ? { error: getterError() } : null
      );
    };
  }

  async function expectNoDestruction(
    harness: Harness,
    resultado: LogicalStorageImportV2Result,
    esperado: { reason: string; status: string; fase: string },
  ): Promise<void> {
    harness.storage.failGetItem = null;
    expect(resultado).toMatchObject({ ok: false, reason: esperado.reason });
    if (resultado.ok) return;
    // A mensagem nativa lançada pelo storage nunca sobe.
    expectNoSentinels(esperado.fase, resultado);
    // Nada é removido, nem a chave principal nem a cópia rolante.
    expect(harness.storage.removed).toEqual([]);
    const receipts = await readOperationReceipts(harness);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe(esperado.status);
    // A geração anterior continua existindo e íntegra em qualquer caso.
    expect(await harness.adapter.hasHistoryGeneration(harness.generationId)).toBe(true);
  }

  it('95. falha antes da primeira leitura da chave principal', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const coreAnterior = harness.storage.getItem(KEY) as string;
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const adapter = afterCall(
      harness.adapter,
      'rollbackToHistoryGeneration',
      1,
      failReadsOf(harness, KEY),
    ) as unknown as LogicalImportAdapter;

    const resultado = await commit(harness, raw, { adapter });

    await expectNoDestruction(harness, resultado, {
      reason: 'storage-unavailable',
      status: 'activating',
      fase: 'primeira leitura da chave principal',
    });
    expect(resultado).toMatchObject({ compensation: 'not-attempted' });
    expect(harness.storage.getItem(KEY)).toBe(coreAnterior);
    // A cópia rolante nem chegou a ser escrita.
    expect(harness.storage.getItem(BACKUP_KEY)).toBeNull();
  });

  it('96. falha na segunda leitura da chave principal', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const coreAnterior = harness.storage.getItem(KEY) as string;
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const armar = failReadsOf(harness, KEY);
    harness.storage.onSetItem = (chave) => {
      if (chave === BACKUP_KEY) armar();
    };

    const resultado = await commit(harness, raw);

    await expectNoDestruction(harness, resultado, {
      reason: 'storage-unavailable',
      status: 'activating',
      fase: 'segunda leitura da chave principal',
    });
    expect(resultado).toMatchObject({ compensation: 'not-attempted' });
    expect(harness.storage.getItem(KEY)).toBe(coreAnterior);
    // A cópia rolante já tinha `previousCoreRaw` e fica assim.
    expect(harness.storage.getItem(BACKUP_KEY)).toBe(coreAnterior);
  });

  it('97. falha no readback da cópia rolante', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const coreAnterior = harness.storage.getItem(KEY) as string;
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const armar = failReadsOf(harness, BACKUP_KEY);
    harness.storage.onSetItem = (chave) => {
      if (chave === BACKUP_KEY) armar();
    };

    const resultado = await commit(harness, raw);

    await expectNoDestruction(harness, resultado, {
      reason: 'storage-unavailable',
      status: 'activating',
      fase: 'readback da cópia rolante',
    });
    expect(resultado).toMatchObject({ compensation: 'not-attempted' });
    expect(harness.storage.getItem(KEY)).toBe(coreAnterior);
    expect(harness.storage.getItem(BACKUP_KEY)).toBe(coreAnterior);
  });

  it('98. falha na leitura logo após o setItem da chave principal', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const armar = failReadsOf(harness, KEY);
    harness.storage.onSetItem = (chave) => {
      if (chave === KEY) armar();
    };

    const resultado = await commit(harness, raw);

    await expectNoDestruction(harness, resultado, {
      reason: 'recovery-required',
      status: 'activating',
      fase: 'readback da gravação do core',
    });
    expect(resultado).toMatchObject({ compensation: 'not-attempted' });
    // A gravação pegou; o journal guarda o mesmo raw que está na chave.
    const [receipt] = await readOperationReceipts(harness);
    expect(harness.storage.getItem(KEY)).toBe(receipt.targetCoreRaw);
  });

  it('99. falha na verificação pós-activated não liquida a operação', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const adapter = afterCall(
      harness.adapter,
      'transitionStorageOperationIfUnambiguous',
      1,
      failReadsOf(harness, KEY),
    ) as unknown as LogicalImportAdapter;

    const resultado = await commit(harness, raw, { adapter });

    await expectNoDestruction(harness, resultado, {
      reason: 'recovery-required',
      status: 'activated',
      fase: 'verificação pós-activated',
    });
    // `activated` é o que foi PROVADO; `settled` não é afirmado sem prova.
    expect((await readOperationReceipts(harness))[0].status).not.toBe('settled');
  });

  it('100. falha na inspeção final não devolve sucesso', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const armar = failReadsOf(harness, KEY);
    let chamadas = 0;
    const runtime = new Proxy(harness.runtime, {
      get(object, prop, receiver) {
        const value = Reflect.get(object, prop, receiver);
        if (typeof value !== 'function') return value;
        const bound = (value as (...a: unknown[]) => unknown).bind(object);
        if (prop !== 'transitionStorageOperation') return bound;
        return async (...args: unknown[]) => {
          const resultado = await bound(...args);
          chamadas += 1;
          // Depois do settlement: só a inspeção final do W10 ainda lê a chave.
          if (chamadas === 2) armar();
          return resultado;
        };
      },
    });

    const resultado = await commit(harness, raw, { runtime });

    await expectNoDestruction(harness, resultado, {
      reason: 'recovery-required',
      status: 'settled',
      fase: 'inspeção final',
    });
    // O settlement tinha prova; o que faltou foi o readback administrativo.
    const [receipt] = await readOperationReceipts(harness);
    expect(harness.storage.getItem(KEY)).toBe(receipt.targetCoreRaw);
  });
});

// ---------------------------------------------------------------------------
// 101–107 — janela de concorrência do W8
//
// A primitiva `transitionStorageOperationIfUnambiguous` confere, DENTRO da
// própria transação: formato de todos os receipts, exatamente uma operação não
// terminal, que ela seja a informada, status esperado, zero conclusão pendente e
// CAS da geração ativa. O que ela NÃO reconfere lá dentro é `stagedGenerationId`
// e `targetCoreRaw` — e é por isso que o importador faz um readback do receipt
// depois da transição. Nada aqui altera a primitiva nem a fachada A2.
//
// A janela TOCTOU remanescente (entre as pré-condições que este módulo confere e
// o início da transação) só fecha com owner-token, que é do C2/E.
// ---------------------------------------------------------------------------

describe('importação lógica v2 — janela do W8', () => {
  // A quarta leitura de receipt é a do W8, imediatamente antes da transição
  // `activating → activated`.
  async function expectMutationBlocked(
    mutate: (harness: Harness) => Promise<void>,
  ): Promise<Harness> {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const adapter = afterCall(
      harness.adapter,
      'readStorageOperationReceipt',
      4,
      () => mutate(harness),
    ) as unknown as LogicalImportAdapter;

    const resultado = await commit(harness, raw, { adapter });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.reason).toBe('recovery-required');
    // Journal preservado: nenhuma mutação produz `settled`.
    const receipts = await readOperationReceipts(harness);
    expect(receipts.some((receipt) => receipt.status === 'settled')).toBe(false);
    expect(harness.storage.removed).toEqual([]);
    return harness;
  }

  async function currentReceipt(harness: Harness): Promise<StorageOperationReceipt> {
    const [receipt] = await readOperationReceipts(harness);
    return receipt;
  }

  it('101. stagedGenerationId trocado não vira sucesso', async () => {
    const harness = await expectMutationBlocked(async (alvo) => {
      const receipt = await currentReceipt(alvo);
      await putRawOperationReceipt(alvo, {
        ...receipt,
        stagedGenerationId: 'generation-intrusa',
      });
    });
    // A primitiva não enxerga o campo dentro da transação — ela chegou a marcar
    // `activated` —; o readback posterior é quem impede o settlement.
    const receipt = await currentReceipt(harness);
    expect(receipt.stagedGenerationId).toBe('generation-intrusa');
    expect(receipt.status).toBe('activated');
  });

  it('102. targetCoreRaw trocado não vira sucesso', async () => {
    const harness = await expectMutationBlocked(async (alvo) => {
      const receipt = await currentReceipt(alvo);
      await putRawOperationReceipt(alvo, {
        ...receipt,
        targetCoreRaw: `${receipt.targetCoreRaw as string} `,
      });
    });
    const receipt = await currentReceipt(harness);
    expect(receipt.targetCoreRaw).toMatch(/ $/);
    expect(receipt.status).toBe('activated');
  });

  it('103. status trocado não vira sucesso', async () => {
    const harness = await expectMutationBlocked(async (alvo) => {
      const receipt = await currentReceipt(alvo);
      await putRawOperationReceipt(alvo, { ...receipt, status: 'staged' });
    });
    expect((await currentReceipt(harness)).status).toBe('staged');
  });

  it('104. operationId renomeado não vira sucesso', async () => {
    const harness = await expectMutationBlocked(async (alvo) => {
      const receipt = await currentReceipt(alvo);
      await deleteOperationReceipt(alvo, receipt.operationId);
      await putRawOperationReceipt(alvo, { ...receipt, operationId: 'operation-renomeada' });
    });
    expect((await currentReceipt(harness)).operationId).toBe('operation-renomeada');
  });

  it('105. activeGeneration trocada não vira sucesso', async () => {
    const harness = await expectMutationBlocked(async (alvo) => {
      await putMetadataRecord(alvo, 'activeGeneration', 'generation-intrusa');
    });
    // O CAS da primitiva recusa; o receipt continua aberto em `activating`.
    expect((await currentReceipt(harness)).status).toBe('activating');
  });

  it('106. conclusão de treino pendente que nasce na janela não vira sucesso', async () => {
    const harness = await expectMutationBlocked(async (alvo) => {
      const receipt = await currentReceipt(alvo);
      const sessao = makeSession(96);
      await putRawCompletionReceipt(alvo, {
        receiptId: `receipt-${sessao.id}`,
        sessionId: sessao.id,
        generationId: receipt.stagedGenerationId as string,
        sessionDigest: await digestWorkoutSession(sessao),
        finalSession: sessao,
        coreEnvelopeAfter: coreOf(alvo),
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
        createdAt: '2026-07-26T11:30:00.000Z',
        status: 'pending',
        settledAt: null,
      });
    });
    expect((await currentReceipt(harness)).status).toBe('activating');
  });

  it('107. segundo receipt não terminal que nasce na janela não vira sucesso', async () => {
    const harness = await expectMutationBlocked(async (alvo) => {
      await putRawOperationReceipt(alvo, createStorageOperationReceipt({
        operationId: 'operation-intrusa',
        kind: 'rollback',
        previousCoreRaw: '{"v":2}',
        previousGenerationId: alvo.generationId,
        createdAt: '2026-07-26T11:30:00.000Z',
      }) as unknown as Record<string, unknown>);
    });
    const receipts = await readOperationReceipts(harness);
    expect(receipts).toHaveLength(2);
    expect(receipts.every((receipt) => receipt.status !== 'settled')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 108–112 — privacidade completa
//
// Nenhuma sentinela pode aparecer em `reason`, `error`, `backupReason`,
// `compensation`, `preview`, `cause`, `message`, `stack`, no serializado nem em
// log. A varredura é recursiva e inclui propriedades NÃO enumeráveis — é por
// isso que o teste 112 existe: sem ele, o inspetor poderia estar cego.
// ---------------------------------------------------------------------------

describe('importação lógica v2 — privacidade completa', () => {
  function sentinelPayload(): PersistedState {
    const payload = defaults([
      makeSession(70, { id: 'PRIVATE_SESSION_ID', name: 'PRIVATE_WORKOUT' }),
    ]);
    payload.user = {
      name: 'PRIVATE_NAME',
      email: 'PRIVATE_EMAIL',
      xp: 4200,
      points: 900,
      streak: 12,
    } as unknown as PersistedState['user'];
    payload.restTimerLabel = 'PRIVATE_TARGET_CORE';
    payload.favoriteExercises = ['PRIVATE_RAW'];
    return payload;
  }

  // O core ANTERIOR também carrega a própria sentinela, para que um vazamento
  // de `previousCoreRaw` seja distinguível de um vazamento do arquivo.
  async function createSentinelHarness(): Promise<Harness> {
    const harness = await createReadyHarness({
      sessions: [makeSession(1, { id: 'PRIVATE_SESSION_ID', name: 'PRIVATE_WORKOUT' })],
    });
    const envelope = JSON.parse(harness.storage.getItem(KEY) as string) as {
      data: Record<string, unknown>;
    };
    envelope.data.restTimerLabel = 'PRIVATE_PREVIOUS_CORE';
    harness.storage.values.set(KEY, JSON.stringify(envelope));
    return harness;
  }

  function captureConsole(): { entries: unknown[]; restore: () => void } {
    const entries: unknown[] = [];
    const metodos = ['log', 'info', 'warn', 'error', 'debug'];
    const alvo = console as unknown as Record<string, (...args: unknown[]) => void>;
    const originais: Record<string, (...args: unknown[]) => void> = {};
    for (const nome of metodos) {
      originais[nome] = alvo[nome];
      alvo[nome] = (...args: unknown[]) => {
        entries.push(...args);
      };
    }
    return {
      entries,
      restore: () => {
        for (const nome of metodos) alvo[nome] = originais[nome];
      },
    };
  }

  // Cada fase devolve o resultado público que ela produziu.
  const FASES: { fase: string; run: () => Promise<LogicalStorageImportV2Result> }[] = [
    {
      fase: 'inspeção do backup',
      run: async () => {
        const harness = await createSentinelHarness();
        return commit(harness, await makeBackupContent(sentinelPayload(), {
          payloadDigest: `sha256:${'0'.repeat(64)}`,
        }));
      },
    },
    {
      fase: 'W0',
      run: async () => {
        const harness = await createSentinelHarness();
        harness.storage.values.set(KEY, JSON.stringify({
          v: MONOLITHIC_STORAGE_VERSION,
          savedAt: '2026-07-26T09:00:00.000Z',
          data: { ...defaults([]), restTimerLabel: 'PRIVATE_PREVIOUS_CORE' },
        }));
        return commit(harness, await makeBackupContent(sentinelPayload()));
      },
    },
    {
      fase: 'begin',
      run: async () => {
        const harness = await createSentinelHarness();
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
        return commit(harness, await makeBackupContent(sentinelPayload()));
      },
    },
    {
      fase: 'staging',
      run: async () => {
        const harness = await createSentinelHarness();
        return commit(harness, await makeBackupContent(sentinelPayload()), {
          adapter: failingMethod(
            harness.adapter,
            'stageHistoryGenerationForOperation',
            new Error('staging indisponível'),
          ) as unknown as LogicalImportAdapter,
        });
      },
    },
    {
      fase: 'verificação',
      run: async () => {
        const harness = await createSentinelHarness();
        return commit(harness, await makeBackupContent(sentinelPayload()), {
          adapter: failingMethod(
            harness.adapter,
            'readVerifiedHistoryGeneration',
            new Error('leitura verificada indisponível'),
          ) as unknown as LogicalImportAdapter,
        });
      },
    },
    {
      fase: 'ativação',
      run: async () => {
        const harness = await createSentinelHarness();
        return commit(harness, await makeBackupContent(sentinelPayload()), {
          adapter: failingMethod(
            harness.adapter,
            'rollbackToHistoryGeneration',
            new Error('ativação indisponível'),
          ) as unknown as LogicalImportAdapter,
        });
      },
    },
    {
      fase: 'backup rolante',
      run: async () => {
        const harness = await createSentinelHarness();
        harness.storage.failSetItem = (chave) => (
          chave === BACKUP_KEY ? { error: getterError() } : null
        );
        return commit(harness, await makeBackupContent(sentinelPayload()));
      },
    },
    {
      fase: 'gravação do core',
      run: async () => {
        const harness = await createSentinelHarness();
        harness.storage.failSetItem = (chave) => (chave === KEY ? { error: getterError() } : null);
        return commit(harness, await makeBackupContent(sentinelPayload()));
      },
    },
    {
      fase: 'readback',
      run: async () => {
        const harness = await createSentinelHarness();
        const coreAnterior = harness.storage.getItem(KEY) as string;
        harness.storage.onSetItem = (chave) => {
          if (chave === KEY) harness.storage.values.set(KEY, coreAnterior);
        };
        return commit(harness, await makeBackupContent(sentinelPayload()));
      },
    },
    {
      fase: 'transição activated',
      run: async () => {
        const harness = await createSentinelHarness();
        return commit(harness, await makeBackupContent(sentinelPayload()), {
          adapter: failingMethod(
            harness.adapter,
            'transitionStorageOperationIfUnambiguous',
            new Error('transição indisponível'),
          ) as unknown as LogicalImportAdapter,
        });
      },
    },
    {
      fase: 'settlement',
      run: async () => {
        const harness = await createSentinelHarness();
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
        return commit(harness, await makeBackupContent(sentinelPayload()), { runtime });
      },
    },
  ];

  it('108. nenhuma fase de falha vaza sentinela no retorno público', async () => {
    for (const { fase, run } of FASES) {
      const resultado = await run();
      expect(resultado.ok).toBe(false);
      expectNoSentinels(fase, resultado);
    }
  }, 60_000);

  it('109. o retorno de sucesso não vaza sentinela', async () => {
    const harness = await createSentinelHarness();
    const resultado = await commit(harness, await makeBackupContent(sentinelPayload()));
    expect(resultado.ok).toBe(true);
    expectNoSentinels('sucesso', resultado);
  });

  it('110. o resolvedor não vaza sentinela em nenhuma decisão', () => {
    const base = {
      previousCoreRaw: 'PRIVATE_PREVIOUS_CORE',
      targetCoreRaw: 'PRIVATE_TARGET_CORE',
    } as const;
    const decisoes: LogicalImportRecoveryDecision[] = [
      resolveLogicalImportRecovery(makeObservation({
        receipt: makeImportReceipt({ previousCoreRaw: base.previousCoreRaw }),
        coreRaw: base.previousCoreRaw,
      })),
      resolveLogicalImportRecovery(makeObservation({
        receipt: makeImportReceipt({
          status: 'activating',
          stagedGenerationId: 'generation-nova',
          previousCoreRaw: base.previousCoreRaw,
          targetCoreRaw: base.targetCoreRaw,
        }),
        coreRaw: base.targetCoreRaw,
        metadata: { ...APPLIED_METADATA },
      })),
      resolveLogicalImportRecovery(makeObservation({
        receipt: makeImportReceipt({ previousCoreRaw: base.previousCoreRaw }),
        coreRaw: 'PRIVATE_RAW',
      })),
    ];
    expectNoSentinels('resolvedor', decisoes);
  });

  it('111. nenhuma fase escreve sentinela em log ou console', async () => {
    const captura = captureConsole();
    try {
      for (const { run } of FASES) await run();
      const harness = await createSentinelHarness();
      await commit(harness, await makeBackupContent(sentinelPayload()));
    } finally {
      captura.restore();
    }
    expectNoSentinels('console', captura.entries);
  }, 60_000);

  it('112. o inspetor enxerga cause, message e stack não enumeráveis', () => {
    const aninhado = new Error('PRIVATE_NAME');
    const externo = new Error('falha externa', { cause: aninhado });
    Object.defineProperty(externo, 'oculto', {
      value: 'PRIVATE_EMAIL',
      enumerable: false,
    });

    // `JSON.stringify` de um Error devolve `{}`: confiar nele não provaria nada.
    expect(JSON.stringify(externo)).toBe('{}');
    const textos = collectStrings({ cause: externo });
    expect(textos.some((texto) => texto.includes('PRIVATE_NAME'))).toBe(true);
    expect(textos.some((texto) => texto.includes('PRIVATE_EMAIL'))).toBe(true);
    expect(collectStrings(new Error('PRIVATE_WORKOUT')).some((texto) => (
      texto.includes('PRIVATE_WORKOUT')
    ))).toBe(true);
    // E o helper realmente reprova quando encontra alguma.
    expect(() => expectNoSentinels('meta', externo)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 113–127 — ramos do resolvedor
//
// Todo estado impossível ou ambíguo tem de terminar em `recovery-required` ou
// `impossible-state`. Nunca numa ação segura de escrita.
// ---------------------------------------------------------------------------

describe('resolveLogicalImportRecovery — ramos adicionais', () => {
  function decide(overrides: Partial<LogicalImportObservation>): LogicalImportRecoveryDecision {
    return resolveLogicalImportRecovery(makeObservation(overrides));
  }

  function activating(
    overrides: Partial<StorageOperationReceipt> = {},
  ): StorageOperationReceipt {
    return makeImportReceipt({
      status: 'activating',
      stagedGenerationId: 'generation-nova',
      targetCoreRaw: TARGET_CORE,
      ...overrides,
    });
  }

  it('113. staged com geração ativa inesperada bloqueia', () => {
    expect(decide({
      metadata: {
        activeGeneration: 'generation-terceira',
        migrationGeneration: null,
        migrationStatus: 'completed',
      },
    })).toEqual({ action: 'recovery-required', reason: 'active-generation-unexpected' });
  });

  it('114. activating sem geração preparada é estado impossível', () => {
    expect(decide({ receipt: activating({ stagedGenerationId: null }) }))
      .toEqual({ action: 'impossible-state', reason: 'activating-without-staging' });
  });

  it('115. activating sem core alvo é estado impossível', () => {
    expect(decide({ receipt: activating({ targetCoreRaw: null }) }))
      .toEqual({ action: 'impossible-state', reason: 'activating-without-target-core' });
  });

  it('116. core alvo com a geração anterior ainda ativa bloqueia', () => {
    // Esta ordem de escrita nunca produz core alvo antes da ativação.
    expect(decide({ receipt: activating(), coreRaw: TARGET_CORE }))
      .toEqual({ action: 'recovery-required', reason: 'core-target-without-activation' });
  });

  it('117. geração nova ativa com o core anterior pede o commit do core', () => {
    expect(decide({ receipt: activating(), metadata: { ...APPLIED_METADATA } }))
      .toEqual({ action: 'commit-core', operationId: 'operation-1', generationId: 'generation-nova' });
  });

  it('118. terceiro valor no core durante activating bloqueia', () => {
    expect(decide({ receipt: activating(), coreRaw: 'terceiro-valor-desconhecido' }))
      .toEqual({ action: 'recovery-required', reason: 'unrecognized-world' });
    expect(decide({
      receipt: activating(),
      coreRaw: 'terceiro-valor-desconhecido',
      metadata: { ...APPLIED_METADATA },
    })).toEqual({ action: 'recovery-required', reason: 'unrecognized-world' });
  });

  it('119. terceira geração ativa durante activating bloqueia', () => {
    expect(decide({
      receipt: activating(),
      metadata: {
        activeGeneration: 'generation-terceira',
        migrationGeneration: null,
        migrationStatus: 'completed',
      },
    })).toEqual({ action: 'recovery-required', reason: 'unrecognized-world' });
  });

  it('120. geração preparada igual à anterior é estado impossível', () => {
    // O staging recusa colidir com a ativa e o readback do W2 recusa a
    // igualdade: um receipt assim descreve algo que não aconteceu.
    expect(decide({ receipt: makeImportReceipt({ stagedGenerationId: 'generation-anterior' }) }))
      .toEqual({ action: 'impossible-state', reason: 'staged-generation-is-previous' });
    expect(decide({
      receipt: activating({ stagedGenerationId: 'generation-anterior' }),
    })).toEqual({ action: 'impossible-state', reason: 'staged-generation-is-previous' });
  });

  it('121. geração preparada ausente do armazenamento é estado impossível', () => {
    expect(decide({ receipt: activating({ stagedGenerationId: 'generation-fantasma' }) }))
      .toEqual({ action: 'impossible-state', reason: 'staged-generation-absent' });
  });

  it('122. geração desconhecida extra não altera a decisão', () => {
    const comExtra = decide({
      generations: [
        { generationId: 'generation-anterior' },
        { generationId: 'generation-nova' },
        { generationId: 'generation-desconhecida' },
      ],
    });
    expect(comExtra).toEqual(decide({}));
  });

  it('123. migrationGeneration preenchida bloqueia em qualquer status', () => {
    const ocupada = {
      activeGeneration: 'generation-anterior',
      migrationGeneration: 'generation-ocupada',
      migrationStatus: 'completed',
    } as const;
    expect(decide({ metadata: { ...ocupada } }))
      .toEqual({ action: 'recovery-required', reason: 'unexpected-staging-pointer' });
    expect(decide({ receipt: activating(), metadata: { ...ocupada } }))
      .toEqual({ action: 'recovery-required', reason: 'unexpected-staging-pointer' });
  });

  it('124. activated sem os efeitos declarados não cabe na máquina', () => {
    expect(decide({ receipt: activating({ status: 'activated' }) }))
      .toEqual({ action: 'recovery-required', reason: 'activated-generation-not-active' });
  });

  it('125. sinais conflitantes resolvem por precedência determinística', () => {
    // Estrutural primeiro, depois identidade física, depois a máquina de estado.
    expect(decide({
      receipt: makeImportReceipt({ targetCoreRaw: TARGET_CORE }),
      coreRaw: 'terceiro-valor-desconhecido',
      metadata: {
        activeGeneration: 'generation-terceira',
        migrationGeneration: null,
        migrationStatus: 'completed',
      },
      unsettledOperationCount: 2,
    })).toEqual({ action: 'recovery-required', reason: 'multiple-unsettled-operations' });
    expect(decide({
      receipt: makeImportReceipt({
        targetCoreRaw: TARGET_CORE,
        stagedGenerationId: 'generation-fantasma',
      }),
      coreRaw: 'terceiro-valor-desconhecido',
    })).toEqual({ action: 'impossible-state', reason: 'staged-generation-absent' });
    expect(decide({
      receipt: makeImportReceipt({ targetCoreRaw: TARGET_CORE }),
      coreRaw: 'terceiro-valor-desconhecido',
    })).toEqual({ action: 'impossible-state', reason: 'staged-with-target-core' });
  });

  it('126. nenhuma ação de escrita sai de um mundo que não a justifica', () => {
    const statuses = ['staged', 'activating', 'activated'] as const;
    const stagedIds = [null, 'generation-nova', 'generation-anterior', 'generation-fantasma'];
    const targets = [null, TARGET_CORE];
    const cores = [PREVIOUS_CORE, TARGET_CORE, 'terceiro-valor-desconhecido'];
    const ativas = ['generation-anterior', 'generation-nova', 'generation-terceira'];
    const integridades = ['unknown', 'verified', 'invalid'] as const;
    const verificacoes = ['unknown', 'verified'] as const;
    const ACOES = new Set([
      'no-operation', 'already-settled', 'stage-generation', 'verify-staging', 'prepare-core',
      'activate-generation', 'commit-core', 'verify-target', 'mark-activated', 'settle',
      'revert-safe', 'cleanup-inactive-staging', 'recovery-required', 'impossible-state',
    ]);

    let combinacoes = 0;
    const observadas = new Set<string>();
    for (const status of statuses) {
      for (const staged of stagedIds) {
        for (const target of targets) {
          for (const coreRaw of cores) {
            for (const activeGeneration of ativas) {
              for (const stagedGenerationIntegrity of integridades) {
                for (const targetVerification of verificacoes) {
                  combinacoes += 1;
                  const receipt = makeImportReceipt({
                    status,
                    stagedGenerationId: staged,
                    targetCoreRaw: target,
                  });
                  const decisao = resolveLogicalImportRecovery(makeObservation({
                    receipt,
                    coreRaw,
                    metadata: {
                      activeGeneration,
                      migrationGeneration: null,
                      migrationStatus: 'completed',
                    },
                    stagedGenerationIntegrity,
                    targetVerification,
                  }));
                  const mundo = JSON.stringify({
                    status, staged, target, coreRaw, activeGeneration,
                    stagedGenerationIntegrity, targetVerification,
                  });
                  expect(ACOES.has(decisao.action)).toBe(true);
                  observadas.add(decisao.action);

                  // Cada ação com efeito exige o mundo exato que a justifica.
                  const invariante: Record<string, boolean> = {
                    'stage-generation': status === 'staged' && staged === null && target === null
                      && coreRaw === PREVIOUS_CORE && activeGeneration === 'generation-anterior',
                    'prepare-core': status === 'staged' && staged === 'generation-nova'
                      && target === null && coreRaw === PREVIOUS_CORE
                      && activeGeneration === 'generation-anterior'
                      && stagedGenerationIntegrity === 'verified',
                    'cleanup-inactive-staging': status === 'staged' && staged === 'generation-nova'
                      && target === null && coreRaw === PREVIOUS_CORE
                      && activeGeneration !== staged && stagedGenerationIntegrity === 'invalid',
                    'revert-safe': status === 'staged' && target === null
                      && activeGeneration === 'generation-anterior' && coreRaw !== PREVIOUS_CORE,
                    'activate-generation': status === 'activating' && staged === 'generation-nova'
                      && target !== null && coreRaw === PREVIOUS_CORE
                      && activeGeneration === 'generation-anterior',
                    'commit-core': status === 'activating' && staged === 'generation-nova'
                      && target !== null && coreRaw === PREVIOUS_CORE
                      && activeGeneration === staged,
                    'mark-activated': status === 'activating' && staged === 'generation-nova'
                      && target === TARGET_CORE && coreRaw === TARGET_CORE
                      && activeGeneration === staged && targetVerification === 'verified',
                    settle: status === 'activated' && staged === 'generation-nova'
                      && target === TARGET_CORE && coreRaw === TARGET_CORE
                      && activeGeneration === staged,
                  };
                  const exigido = invariante[decisao.action];
                  if (exigido !== undefined) {
                    expect(`${decisao.action} ← ${mundo}`).toBe(exigido ? `${decisao.action} ← ${mundo}` : '');
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(combinacoes).toBe(1_296);
    // A varredura não é vazia: toda ação com efeito foi realmente exercitada,
    // então os invariantes acima foram conferidos de verdade.
    for (const acao of [
      'stage-generation', 'prepare-core', 'cleanup-inactive-staging', 'revert-safe',
      'activate-generation', 'commit-core', 'mark-activated', 'settle',
      'recovery-required', 'impossible-state',
    ]) {
      expect([acao, observadas.has(acao)]).toEqual([acao, true]);
    }
  });

  it('127. o resolvedor continua puro sob os ramos novos', () => {
    const observacao = makeObservation({
      receipt: makeImportReceipt({ stagedGenerationId: 'generation-anterior' }),
    });
    const antes = JSON.stringify(observacao);
    const primeira = resolveLogicalImportRecovery(observacao);
    expect(resolveLogicalImportRecovery(observacao)).toEqual(primeira);
    expect(JSON.stringify(observacao)).toBe(antes);
  });
});
