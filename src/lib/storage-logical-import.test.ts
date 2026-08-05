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
  toPersistedCoreState,
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
  type LogicalImportRestartDecision,
  type LogicalImportRestartObservation,
  type LogicalStorageImportRecoveryResult,
  type LogicalStorageImportV2Result,
  commitLogicalStorageImportV2,
  recoverLogicalStorageImportV2,
  resolveLogicalImportRecovery,
  resolveLogicalImportRestartRecovery,
} from './storage-logical-import';
import {
  type StorageOperationReceipt,
  createStorageOperationReceipt,
} from './storage-operation-receipt';
import {
  createStorageAdminOwnerTokenCoordinator,
  type StorageAdminOwnerTokenCoordinator,
} from './storage-admin-owner-token';
import {
  MONOLITHIC_STORAGE_VERSION,
  type PersistedCoreState,
  type PersistedState,
  type StorageLike,
} from './storage-types';

const KEY = 'gymflow:state:v1';
const BACKUP_KEY = `${KEY}${HYBRID_CORE_BACKUP_SUFFIX}`;
let databaseSequence = 0;
let ownerOperationSequence = 0;

// Os testes históricos deste arquivo injetam falhas em qualquer setItem para
// isolar cada janela do protocolo C1/C2. Um lease determinístico mantém esse
// foco; os testes específicos de integração entre abas usam o coordenador real.
function createTestOwnerToken(): StorageAdminOwnerTokenCoordinator {
  return {
    createOperationId: () => `operation-owner-test-${ownerOperationSequence += 1}`,
    acquire: () => ({
      status: 'acquired',
      reason: 'acquired',
      lease: {
        confirm: () => ({ status: 'owned', reason: 'confirmed' }),
        execute: async <T>(operation: () => T | Promise<T>) => operation(),
        release: () => ({ status: 'released', reason: 'released' }),
      },
    }),
  };
}

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
    ownerToken: createTestOwnerToken(),
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

  it('60. o módulo tem somente o teste e o call site de boot autorizado pelo D1', () => {
    // C1/C2 exigiam zero consumidor de produção. D1 autoriza exatamente um;
    // igualdade exata continua impedindo expansão acidental.
    expect(sourceFilesImporting('storage-logical-import'))
      .toEqual([
        'src/lib/storage-boot-recovery.ts',
        'src/lib/storage-logical-import.test.ts',
      ]);
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

  it('76. o módulo exporta apenas o commit, a recuperação e os dois resolvedores', () => {
    const funcoes = Object.keys(logicalImportModule)
      .filter((nome) => typeof (logicalImportModule as Record<string, unknown>)[nome] === 'function')
      .sort();
    // Lista EXATA, como no C1: o C2 acrescentou exatamente duas funções e
    // nenhuma outra superfície pública apareceu junto. Nada de restore manual,
    // rollback exposto, reset, retenção ou owner-token.
    expect(funcoes).toEqual([
      'commitLogicalStorageImportV2',
      'recoverLogicalStorageImportV2',
      'resolveLogicalImportRecovery',
      'resolveLogicalImportRestartRecovery',
    ]);
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

// ---------------------------------------------------------------------------
// C2 — harness de REINÍCIO REAL
//
// A recuperação nunca é exercitada com as instâncias que executaram a
// importação interrompida. Cada teste destrói o adapter e a fachada usados na
// queda e constrói novos sobre o MESMO banco fake-indexeddb (mesmo
// `databaseName`, mesma `IDBFactory`) e o MESMO conteúdo do `MemoryStorage`.
// Nenhum estado em memória do importador anterior atravessa a fronteira — é
// isso que faz o teste simular um reload em vez de mockar o resultado.
// ---------------------------------------------------------------------------

// Corte de energia. Depois dele NADA responde: adapter, fachada e
// `localStorage` passam a lançar. É o que impede a compensação do C1 de rodar e
// "consertar" o estado que o teste quer observar — um processo morto não
// compensa. O conteúdo já gravado no `MemoryStorage` e no IndexedDB permanece,
// exatamente como sobreviveria ao fechamento de uma aba.
class PowerCut {
  tripped = false;

  trip(): void {
    this.tripped = true;
  }

  guard(): void {
    if (this.tripped) throw new Error('PROCESSO_INTERROMPIDO');
  }
}

interface CrashPlan {
  method: string;
  nth: number;
  when: 'before' | 'after';
}

// Proxy que (1) recusa qualquer chamada depois do corte e (2) corta a energia
// na n-ésima chamada do método indicado. Chamadas INTERNAS do objeto real não
// passam por aqui — só a superfície que o importador realmente usa é contada.
function cuttable<T extends object>(target: T, cut: PowerCut, plan: CrashPlan | null): T {
  let calls = 0;
  return new Proxy(target, {
    get(object, prop, receiver) {
      const value = Reflect.get(object, prop, receiver);
      if (typeof value !== 'function') return value;
      const bound = (value as (...a: unknown[]) => unknown).bind(object);
      const matches = plan !== null && prop === plan.method;
      return async (...args: unknown[]) => {
        if (matches && plan.when === 'before') {
          calls += 1;
          if (calls === plan.nth) cut.trip();
        }
        cut.guard();
        const result = await bound(...args);
        if (matches && plan.when === 'after') {
          calls += 1;
          if (calls === plan.nth) cut.trip();
        }
        return result;
      };
    },
  }) as T;
}

// Modela uma transação IndexedDB ABORTADA: o trabalho anterior ao commit roda
// de verdade (`before`), nada é gravado, e o processo morre em seguida. Uma
// transação abortada não deixa resíduo — é o que os testes conferem.
function abortedMethod<T extends object>(
  target: T,
  method: string,
  cut: PowerCut,
  before?: (object: T, args: unknown[]) => Promise<unknown>,
): T {
  return new Proxy(target, {
    get(object, prop, receiver) {
      if (prop === method) {
        return async (...args: unknown[]) => {
          if (before) await before(object, args);
          cut.trip();
          throw new Error('TRANSACAO_ABORTADA');
        };
      }
      const value = Reflect.get(object, prop, receiver);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(object)
        : value;
    },
  }) as T;
}

interface CrashSetup {
  sessions?: WorkoutSession[];
  importado?: WorkoutSession[];
  // Payload lógico completo, quando o teste precisa de mais do que histórico
  // (perfil, rótulos, favoritos) — é o que carrega as sentinelas de privacidade.
  payload?: PersistedState;
  // Muta o core ANTERIOR depois da hidratação e antes da importação.
  previousCore?: (core: PersistedState) => void;
  // Onde cortar a energia. Ausente significa que o corte é disparado por outro
  // mecanismo (falha de `localStorage` ou transação abortada) — ou que a
  // importação deve completar.
  cut?: CrashPlan & { on: 'runtime' | 'adapter' };
  aborted?: {
    method: string;
    before?: (object: Harness['adapter'], args: unknown[]) => Promise<unknown>;
  };
  failSetItem?: (storage: MemoryStorage, cut: PowerCut) => MemoryStorage['failSetItem'];
  failGetItem?: (storage: MemoryStorage, cut: PowerCut) => MemoryStorage['failGetItem'];
  onSetItem?: (storage: MemoryStorage, cut: PowerCut) => MemoryStorage['onSetItem'];
}

interface CrashedImport {
  harness: Harness;
  cut: PowerCut;
  resultado: LogicalStorageImportV2Result;
  sessions: WorkoutSession[];
  importado: WorkoutSession[];
  previousCore: string;
  previousBackup: string | null;
}

// Executa a implementação REAL do C1 e a interrompe fisicamente no ponto pedido.
async function crashedImport(setup: CrashSetup = {}): Promise<CrashedImport> {
  const sessions = setup.sessions ?? [makeSession(1), makeSession(2)];
  const importado = setup.importado ?? [makeSession(70), makeSession(71), makeSession(72)];
  const harness = await createReadyHarness({ sessions });
  if (setup.previousCore) {
    const envelope = JSON.parse(harness.storage.getItem(KEY) as string) as {
      data: PersistedState;
    };
    setup.previousCore(envelope.data);
    harness.storage.values.set(KEY, JSON.stringify(envelope));
  }
  const previousCore = harness.storage.getItem(KEY) as string;
  const previousBackup = harness.storage.values.get(BACKUP_KEY) ?? null;
  const cut = new PowerCut();

  const base = setup.aborted
    ? abortedMethod(harness.adapter, setup.aborted.method, cut, setup.aborted.before)
    : harness.adapter;
  const adapter = cuttable(base, cut, setup.cut?.on === 'adapter' ? setup.cut : null);
  const runtime = cuttable(harness.runtime, cut, setup.cut?.on === 'runtime' ? setup.cut : null);

  const extraSet = setup.failSetItem?.(harness.storage, cut) ?? null;
  const extraGet = setup.failGetItem?.(harness.storage, cut) ?? null;
  harness.storage.failSetItem = (chave, valor) => (
    cut.tripped ? { error: new Error('PROCESSO_INTERROMPIDO') } : extraSet?.(chave, valor) ?? null
  );
  harness.storage.failGetItem = (chave, chamada) => (
    cut.tripped ? { error: new Error('PROCESSO_INTERROMPIDO') } : extraGet?.(chave, chamada) ?? null
  );
  harness.storage.onSetItem = setup.onSetItem?.(harness.storage, cut) ?? null;

  const payload = setup.payload ?? defaults(importado);
  const resultado = await commitLogicalStorageImportV2({
    raw: await makeBackupContent(payload),
    runtime: runtime as unknown as Parameters<typeof commitLogicalStorageImportV2>[0]['runtime'],
    adapter: adapter as unknown as LogicalImportAdapter,
    storage: harness.storage,
    key: KEY,
    now: () => new Date('2026-07-26T11:00:00.000Z'),
    ownerToken: createTestOwnerToken(),
  });

  // Fim do processo: a conexão IndexedDB e todos os proxies morrem aqui.
  await harness.adapter.close().catch(() => undefined);
  harness.storage.failSetItem = null;
  harness.storage.failGetItem = null;
  harness.storage.onSetItem = null;

  return { harness, cut, resultado, sessions, importado, previousCore, previousBackup };
}

// Instâncias NOVAS sobre o mesmo banco e o mesmo `localStorage`. A fábrica de
// generationId lança de propósito: se a recuperação tentar criar uma geração —
// o que ela nunca pode fazer, porque não tem o arquivo — o teste explode.
function reloaded(harness: Harness): Harness {
  const adapter = new IndexedDbWorkoutHistoryStorage({
    factory: harness.factory,
    databaseName: harness.name,
    generationIdFactory: () => {
      throw new Error('a recuperação tentou criar uma geração');
    },
    now: () => new Date('2026-07-27T09:00:00.000Z'),
  });
  const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter });
  return { ...harness, adapter, runtime };
}

function recover(env: Harness, operationId?: string): Promise<LogicalStorageImportRecoveryResult> {
  return recoverLogicalStorageImportV2({
    runtime: env.runtime,
    adapter: env.adapter,
    storage: env.storage,
    key: KEY,
    ownerToken: createTestOwnerToken(),
    ...(operationId === undefined ? {} : { operationId }),
  });
}

function allHistoryRecords(env: Harness): Promise<unknown[]> {
  return withStore(env, WORKOUT_HISTORY_STORE, 'readonly', (transaction) => (
    requestResult(transaction.objectStore(WORKOUT_HISTORY_STORE).getAll()) as Promise<unknown[]>
  ));
}

// Fotografia física COMPLETA: `localStorage` inteiro (chave principal e cópia
// rolante), metadata, gerações, manifests, TODOS os registros de histórico de
// TODAS as gerações, todos os receipts com seus `updatedAt` e o fingerprint
// administrativo. Duas fotografias iguais provam que nada foi regravado.
async function footprintOf(env: Harness): Promise<string> {
  await env.adapter.open();
  const snapshot = await env.adapter.readStorageAdministrationSnapshot();
  return JSON.stringify({
    storage: env.storage.snapshot(),
    metadata: snapshot.metadata,
    generations: snapshot.generations,
    manifests: snapshot.manifests,
    receipts: snapshot.operationReceipts,
    pendentes: snapshot.pendingCompletionReceipts,
    fingerprint: snapshot.fingerprint,
    registros: await allHistoryRecords(env),
  });
}

// Leitura direta da metadata numa instância recém-criada. Um adapter novo não
// nasce aberto — em produção quem o abre é a fachada, no primeiro `inspect`.
async function metadataOf(env: Harness) {
  await env.adapter.open();
  return env.adapter.readMetadata();
}

// PARTE 14: a segunda execução não pode mover um único byte. A amarração pelo
// `operationId` é o caminho FORTE — ela identifica o receipt terminal e força a
// recuperação a passar pelos ramos `already-settled`/`already-reverted` em vez
// de simplesmente não achar nada.
async function expectIdempotent(
  env: Harness,
  operationId?: string,
): Promise<LogicalStorageImportRecoveryResult> {
  const antes = await footprintOf(env);
  const segunda = await recover(env, operationId);
  expect(await footprintOf(env)).toBe(antes);
  // Uma terceira execução, agora SEM amarração, também não move nada.
  await recover(env);
  expect(await footprintOf(env)).toBe(antes);
  return segunda;
}

// PARTE 16: a geração anterior sobrevive a TODOS os caminhos.
async function expectPreviousGenerationIntact(
  env: Harness,
  sessions: WorkoutSession[],
): Promise<void> {
  await env.adapter.open();
  const verificada = await env.adapter.readVerifiedHistoryGeneration(env.generationId);
  expect(verificada.generationId).toBe(env.generationId);
  expect(verificada.manifest.verified).toBe(true);
  expect(verificada.manifest.sessionCount).toBe(sessions.length);
  expect(verificada.manifest.orderedDigest).toBe(await computeOrderedHistoryDigest(sessions));
  expect(verificada.sessions.map((sessao) => sessao.id)).toEqual(sessions.map((sessao) => sessao.id));
}

// O mundo anterior inteiro: geração, core e ponteiro ativo.
async function expectPreviousWorld(env: Harness, crash: CrashedImport): Promise<void> {
  await expectPreviousGenerationIntact(env, crash.sessions);
  expect(env.storage.getItem(KEY)).toBe(crash.previousCore);
  expect((await env.adapter.readMetadata()).activeGeneration).toBe(env.generationId);
}

// O mundo importado inteiro, byte a byte contra o que o journal prometeu.
async function expectImportedWorld(env: Harness, crash: CrashedImport): Promise<void> {
  const [receipt] = await readOperationReceipts(env);
  expect(receipt.status).toBe('settled');
  expect(receipt.stagedGenerationId).not.toBeNull();
  const g = receipt.stagedGenerationId as string;
  expect(env.storage.getItem(KEY)).toBe(receipt.targetCoreRaw);
  const metadata = await env.adapter.readMetadata();
  expect(metadata.activeGeneration).toBe(g);
  expect(metadata.migrationGeneration).toBeNull();
  expect(coreOf(env).historyStorage.generationId).toBe(g);
  const verificada = await env.adapter.readVerifiedHistoryGeneration(g);
  expect(verificada.sessions.map((sessao) => sessao.id))
    .toEqual(crash.importado.map((sessao) => sessao.id));
  expect(verificada.manifest.orderedDigest).toBe(await computeOrderedHistoryDigest(crash.importado));
  // PARTE 16: avançar para o mundo importado NÃO apaga o anterior.
  await expectPreviousGenerationIntact(env, crash.sessions);
}

// ---------------------------------------------------------------------------
// 128–149 — MATRIZ DE CRASH POINTS
//
// Cada teste: parte do mundo anterior saudável, roda a implementação real do
// C1, corta a energia depois da escrita indicada, DESTRÓI as instâncias, cria
// instâncias novas sobre o mesmo banco e o mesmo `localStorage`, chama a
// recuperação, confere o mundo físico final e prova idempotência.
//
// A fronteira que decide a direção é o journal, não uma preferência: sem
// `targetCoreRaw` o mundo importado não existe em lugar nenhum e a operação
// converge para trás; com ele os dois mundos estão materializados e a operação
// converge para a frente.
// ---------------------------------------------------------------------------

describe('recuperação da importação v2 — matriz de crash points', () => {
  it('128. CRASH 1 — queda antes do W1 não deixa receipt e a recuperação é no-operation', async () => {
    const crash = await crashedImport({
      cut: { on: 'runtime', method: 'inspectStorageAdministration', nth: 1, when: 'after' },
    });
    expect(crash.resultado.ok).toBe(false);
    const env = reloaded(crash.harness);
    expect(await readOperationReceipts(env)).toHaveLength(0);

    const antes = await footprintOf(env);
    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: true, status: 'no-operation', operationId: null });
    // Zero escrita: o footprint inteiro é idêntico.
    expect(await footprintOf(env)).toBe(antes);
    await expectPreviousWorld(env, crash);
    expect(await expectIdempotent(env)).toMatchObject({ ok: true, status: 'no-operation' });
  });

  it('129. CRASH 2 — queda depois do W1 reverte o receipt staged sem geração', async () => {
    const crash = await crashedImport({
      cut: { on: 'runtime', method: 'beginStorageOperation', nth: 1, when: 'after' },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    expect(interrompido).toMatchObject({
      status: 'staged',
      kind: 'import',
      stagedGenerationId: null,
      targetCoreRaw: null,
    });
    expect(await readGenerationIds(env)).toEqual([env.generationId]);

    const resultado = await recover(env);

    expect(resultado).toMatchObject({
      ok: true,
      status: 'reverted',
      operationId: interrompido.operationId,
      cleanupPending: false,
      recoveryRequired: false,
    });
    const [final] = await readOperationReceipts(env);
    expect(final.status).toBe('reverted');
    // Nenhuma geração foi criada: a recuperação não tem o arquivo.
    expect(await readGenerationIds(env)).toEqual([env.generationId]);
    await expectPreviousWorld(env, crash);
    expect(await expectIdempotent(env, interrompido.operationId)).toMatchObject({ ok: true, status: 'already-reverted' });
  });

  it('130. CRASH 3 — W2 abortado não deixa resíduo físico e converge como o crash 2', async () => {
    const crash = await crashedImport({
      aborted: { method: 'stageHistoryGenerationForOperation' },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    expect(interrompido).toMatchObject({ status: 'staged', stagedGenerationId: null });
    // Transação abortada = nenhum manifest, nenhum registro, nenhum marcador.
    expect(await readGenerationIds(env)).toEqual([env.generationId]);
    const registros = await allHistoryRecords(env);
    expect(registros).toHaveLength(crash.sessions.length);

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: true, status: 'reverted', cleanupPending: false });
    expect((await readOperationReceipts(env))[0].status).toBe('reverted');
    expect(await readGenerationIds(env)).toEqual([env.generationId]);
    await expectPreviousWorld(env, crash);
    expect(await expectIdempotent(env, interrompido.operationId)).toMatchObject({ ok: true, status: 'already-reverted' });
  });

  it('131. CRASH 4 — queda depois do W2 reverte e limpa a geração preparada', async () => {
    const crash = await crashedImport({
      cut: { on: 'adapter', method: 'stageHistoryGenerationForOperation', nth: 1, when: 'after' },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    const preparada = interrompido.stagedGenerationId as string;
    expect(interrompido.status).toBe('staged');
    expect(preparada).not.toBe(env.generationId);
    expect(interrompido.targetCoreRaw).toBeNull();
    expect((await readGenerationIds(env)).sort()).toEqual([env.generationId, preparada].sort());
    expect((await metadataOf(env)).activeGeneration).toBe(env.generationId);

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: true, status: 'reverted', cleanupPending: false });
    expect((await readOperationReceipts(env))[0].status).toBe('reverted');
    // A geração preparada foi apagada com a guarda tripla; a anterior ficou.
    expect(await readGenerationIds(env)).toEqual([env.generationId]);
    await expectPreviousWorld(env, crash);
    expect(await expectIdempotent(env, interrompido.operationId)).toMatchObject({ ok: true, status: 'already-reverted' });
  });

  it('132. CRASH 5 — queda depois do W3 converge exatamente como o crash 4', async () => {
    const crash = await crashedImport({
      cut: { on: 'adapter', method: 'readVerifiedHistoryGeneration', nth: 1, when: 'after' },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    expect(interrompido.status).toBe('staged');
    expect(interrompido.stagedGenerationId).not.toBeNull();
    expect(interrompido.targetCoreRaw).toBeNull();

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: true, status: 'reverted', cleanupPending: false });
    expect(await readGenerationIds(env)).toEqual([env.generationId]);
    await expectPreviousWorld(env, crash);
    expect(await expectIdempotent(env, interrompido.operationId)).toMatchObject({ ok: true, status: 'already-reverted' });
  });

  it('133. CRASH 6 — queda depois do W4 avança para o mundo importado', async () => {
    const crash = await crashedImport({
      cut: { on: 'runtime', method: 'transitionStorageOperation', nth: 1, when: 'after' },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    expect(interrompido.status).toBe('activating');
    expect(interrompido.targetCoreRaw).not.toBeNull();
    // MUNDO A: nada aplicado ainda.
    expect((await metadataOf(env)).activeGeneration).toBe(env.generationId);
    expect(env.storage.getItem(KEY)).toBe(crash.previousCore);

    const resultado = await recover(env);

    expect(resultado).toMatchObject({
      ok: true,
      status: 'settled',
      operationId: interrompido.operationId,
      generationId: interrompido.stagedGenerationId,
      recoveryRequired: false,
    });
    await expectImportedWorld(env, crash);
    expect(await expectIdempotent(env, interrompido.operationId)).toMatchObject({ ok: true, status: 'already-settled' });
  });

  it('134. CRASH 7 — queda antes do W5 converge exatamente como o crash 6', async () => {
    const crash = await crashedImport({
      cut: { on: 'adapter', method: 'rollbackToHistoryGeneration', nth: 1, when: 'before' },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    expect(interrompido.status).toBe('activating');
    expect((await metadataOf(env)).activeGeneration).toBe(env.generationId);

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: true, status: 'settled' });
    await expectImportedWorld(env, crash);
    expect(await expectIdempotent(env, interrompido.operationId)).toMatchObject({ ok: true, status: 'already-settled' });
  });

  it('135. CRASH 8 — W5 abortado deixa o mundo A e a recuperação avança', async () => {
    const crash = await crashedImport({
      aborted: {
        method: 'rollbackToHistoryGeneration',
        // A verificação integral roda de verdade; só o commit é abortado.
        before: (adapter, args) => adapter.readVerifiedHistoryGeneration(
          (args[0] as { targetGenerationId: string }).targetGenerationId,
        ),
      },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    expect(interrompido.status).toBe('activating');
    expect((await metadataOf(env)).activeGeneration).toBe(env.generationId);
    expect(env.storage.getItem(KEY)).toBe(crash.previousCore);

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: true, status: 'settled' });
    await expectImportedWorld(env, crash);
    expect(await expectIdempotent(env, interrompido.operationId)).toMatchObject({ ok: true, status: 'already-settled' });
  });

  it('136. CRASH 9 — queda depois do W5 grava o core alvo e conclui', async () => {
    const crash = await crashedImport({
      cut: { on: 'adapter', method: 'rollbackToHistoryGeneration', nth: 1, when: 'after' },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    // MUNDO B: geração já ativa, core ainda o anterior.
    expect(interrompido.status).toBe('activating');
    expect((await metadataOf(env)).activeGeneration).toBe(interrompido.stagedGenerationId);
    expect(env.storage.getItem(KEY)).toBe(crash.previousCore);

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: true, status: 'settled' });
    // O core gravado é byte a byte o que o journal prometeu.
    expect(env.storage.getItem(KEY)).toBe(interrompido.targetCoreRaw);
    // A cópia rolante recebeu o core anterior, e ele não se perdeu.
    expect(env.storage.values.get(BACKUP_KEY)).toBe(crash.previousCore);
    await expectImportedWorld(env, crash);
    expect(await expectIdempotent(env, interrompido.operationId)).toMatchObject({ ok: true, status: 'already-settled' });
  });

  // -------------------------------------------------------------------------
  // CRASH 10 — queda durante a escrita da CÓPIA ROLANTE. Em nenhuma das quatro
  // variantes a recuperação pode perder P (o core anterior) ou Prev (a geração
  // anterior).
  // -------------------------------------------------------------------------

  const CRASH_10: {
    nome: string;
    setup: CrashSetup;
    copiaEsperada: (crash: CrashedImport) => string | null;
  }[] = [
    {
      nome: '137. CRASH 10a — a cópia rolante falha antes de escrever',
      setup: {
        failSetItem: (_storage, cut) => (chave) => {
          if (chave !== BACKUP_KEY) return null;
          cut.trip();
          return { error: namedError('UnknownError') };
        },
      },
      copiaEsperada: (crash) => crash.previousBackup,
    },
    {
      nome: '138. CRASH 10b — a cópia rolante recebe P e a chamada lança',
      setup: {
        onSetItem: (_storage, cut) => (chave) => {
          if (chave !== BACKUP_KEY) return;
          cut.trip();
          throw namedError('UnknownError');
        },
      },
      copiaEsperada: (crash) => crash.previousCore,
    },
    {
      nome: '139. CRASH 10c — o readback da cópia rolante fica indisponível',
      setup: {
        failGetItem: (_storage, cut) => (chave, chamada) => {
          // Chamada 1 é a sonda; a 2 é o readback logo após a gravação.
          if (chave !== BACKUP_KEY || chamada !== 2) return null;
          cut.trip();
          return { error: getterError() };
        },
      },
      copiaEsperada: (crash) => crash.previousCore,
    },
    {
      nome: '140. CRASH 10d — a cópia rolante termina com um terceiro valor',
      setup: {
        onSetItem: (storage, cut) => (chave) => {
          if (chave !== BACKUP_KEY) return;
          storage.values.set(BACKUP_KEY, '{"v":2,"savedAt":"2026-07-26T10:30:00.000Z","data":"terceiro"}');
          cut.trip();
        },
      },
      copiaEsperada: () => '{"v":2,"savedAt":"2026-07-26T10:30:00.000Z","data":"terceiro"}',
    },
  ];

  for (const caso of CRASH_10) {
    it(caso.nome, async () => {
      const crash = await crashedImport(caso.setup);
      const env = reloaded(crash.harness);
      const [interrompido] = await readOperationReceipts(env);
      // A chave PRINCIPAL nunca foi tocada: o mundo continua o B.
      expect(interrompido.status).toBe('activating');
      expect(env.storage.getItem(KEY)).toBe(crash.previousCore);
      expect(env.storage.values.get(BACKUP_KEY) ?? null).toBe(caso.copiaEsperada(crash));
      expect((await metadataOf(env)).activeGeneration)
        .toBe(interrompido.stagedGenerationId);

      const resultado = await recover(env);

      expect(resultado).toMatchObject({ ok: true, status: 'settled' });
      // P não se perdeu: ele está na cópia rolante e no journal.
      expect(env.storage.values.get(BACKUP_KEY)).toBe(crash.previousCore);
      expect(interrompido.previousCoreRaw).toBe(crash.previousCore);
      await expectImportedWorld(env, crash);
      expect(await expectIdempotent(env, interrompido.operationId)).toMatchObject({ ok: true, status: 'already-settled' });
    });
  }

  // -------------------------------------------------------------------------
  // CRASH 11 — queda durante o `setItem` da chave PRINCIPAL.
  // -------------------------------------------------------------------------

  const TERCEIRO_CORE = '{"v":2,"savedAt":"2026-07-26T10:45:00.000Z","data":"terceiro-core"}';

  it('141. CRASH 11a — o setItem da principal lança antes de escrever', async () => {
    const crash = await crashedImport({
      failSetItem: (_storage, cut) => (chave) => {
        if (chave !== KEY) return null;
        cut.trip();
        return { error: namedError('UnknownError') };
      },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    expect(interrompido.status).toBe('activating');
    expect(env.storage.getItem(KEY)).toBe(crash.previousCore);

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: true, status: 'settled' });
    await expectImportedWorld(env, crash);
    expect(await expectIdempotent(env, interrompido.operationId)).toMatchObject({ ok: true, status: 'already-settled' });
  });

  it('142. CRASH 11b — a principal recebe T e a chamada lança', async () => {
    const crash = await crashedImport({
      onSetItem: (_storage, cut) => (chave) => {
        if (chave !== KEY) return;
        cut.trip();
        throw namedError('UnknownError');
      },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    // MUNDO C: geração ativa e core alvo já gravado.
    expect(interrompido.status).toBe('activating');
    expect(env.storage.getItem(KEY)).toBe(interrompido.targetCoreRaw);

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: true, status: 'settled' });
    await expectImportedWorld(env, crash);
    expect(await expectIdempotent(env, interrompido.operationId)).toMatchObject({ ok: true, status: 'already-settled' });
  });

  it('143. CRASH 11c — a principal recebe um terceiro valor VÁLIDO: nenhuma escrita', async () => {
    // Um envelope v2 legítimo que não é nem P nem T: só o `savedAt` muda. É o
    // caso difícil — o core PARSEIA, então nada além do journal o denuncia.
    let terceiro = '';
    const crash = await crashedImport({
      onSetItem: (storage, cut) => {
        const anterior = JSON.parse(storage.values.get(KEY) as string) as Record<string, unknown>;
        terceiro = JSON.stringify({ ...anterior, savedAt: '2026-07-26T10:45:00.000Z' });
        return (chave) => {
          if (chave !== KEY) return;
          storage.values.set(KEY, terceiro);
          cut.trip();
          throw namedError('UnknownError');
        };
      },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    expect(interrompido.status).toBe('activating');
    expect(env.storage.getItem(KEY)).toBe(terceiro);
    expect(parsePhysicalEnvelope(terceiro).status).toBe('v2');
    expect(terceiro).not.toBe(crash.previousCore);
    expect(terceiro).not.toBe(interrompido.targetCoreRaw);
    const antes = await footprintOf(env);

    const resultado = await recover(env);

    // MUNDO desconhecido: nem o anterior, nem o alvo. Não adivinha, não
    // sobrescreve, não marca terminal.
    expect(resultado).toMatchObject({
      ok: false,
      reason: 'recovery-required',
      recoveryRequired: true,
      finalAction: 'recovery-required',
    });
    expect(await footprintOf(env)).toBe(antes);
    expect((await readOperationReceipts(env))[0].status).toBe('activating');
    await expectPreviousGenerationIntact(env, crash.sessions);
    expect(await expectIdempotent(env, interrompido.operationId)).toMatchObject({ ok: false, reason: 'recovery-required' });
  });

  it('143b. CRASH 11c — a principal recebe um terceiro valor ILEGÍVEL: nenhuma escrita', async () => {
    const crash = await crashedImport({
      onSetItem: (storage, cut) => (chave) => {
        if (chave !== KEY) return;
        storage.values.set(KEY, TERCEIRO_CORE);
        cut.trip();
        throw namedError('UnknownError');
      },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    expect(interrompido.status).toBe('activating');
    expect(parsePhysicalEnvelope(TERCEIRO_CORE).status).not.toBe('v2');
    const antes = await footprintOf(env);

    const resultado = await recover(env);

    // A camada física não está utilizável: nem chega ao resolvedor.
    expect(resultado).toMatchObject({
      ok: false,
      reason: 'administration-unavailable',
      recoveryRequired: true,
      finalAction: 'observe',
    });
    expect(await footprintOf(env)).toBe(antes);
    await expectPreviousGenerationIntact(env, crash.sessions);
    expect(await expectIdempotent(env, interrompido.operationId))
      .toMatchObject({ ok: false, reason: 'administration-unavailable' });
  });

  it('144. CRASH 11d — a principal recebe T mas o readback fica indisponível', async () => {
    const crash = await crashedImport({
      // Grava com sucesso e só então corta: o `setItem` não lança.
      onSetItem: (_storage, cut) => (chave) => {
        if (chave === KEY) cut.trip();
      },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    expect(env.storage.getItem(KEY)).toBe(interrompido.targetCoreRaw);

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: true, status: 'settled' });
    await expectImportedWorld(env, crash);
    expect(await expectIdempotent(env, interrompido.operationId)).toMatchObject({ ok: true, status: 'already-settled' });
  });

  it('145. CRASH 12 — queda depois do W6 marca activated e liquida', async () => {
    const crash = await crashedImport({
      // A segunda leitura externa de metadata é a do W7, logo após o W6.
      cut: { on: 'adapter', method: 'readMetadata', nth: 2, when: 'after' },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    expect(interrompido.status).toBe('activating');
    expect(env.storage.getItem(KEY)).toBe(interrompido.targetCoreRaw);
    expect((await metadataOf(env)).activeGeneration).toBe(interrompido.stagedGenerationId);

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: true, status: 'settled' });
    await expectImportedWorld(env, crash);
    expect(await expectIdempotent(env, interrompido.operationId)).toMatchObject({ ok: true, status: 'already-settled' });
  });

  it('146. CRASH 13 — queda depois do W7 converge exatamente como o crash 12', async () => {
    const crash = await crashedImport({
      cut: { on: 'adapter', method: 'readVerifiedHistoryGeneration', nth: 2, when: 'after' },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    expect(interrompido.status).toBe('activating');
    expect(env.storage.getItem(KEY)).toBe(interrompido.targetCoreRaw);

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: true, status: 'settled' });
    await expectImportedWorld(env, crash);
    expect(await expectIdempotent(env, interrompido.operationId)).toMatchObject({ ok: true, status: 'already-settled' });
  });

  it('147. CRASH 14 — queda depois do W8 apenas liquida o receipt activated', async () => {
    const crash = await crashedImport({
      cut: { on: 'adapter', method: 'transitionStorageOperationIfUnambiguous', nth: 1, when: 'after' },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    expect(interrompido.status).toBe('activated');
    const coreAntes = env.storage.getItem(KEY);
    const geracoesAntes = await readGenerationIds(env);
    const registrosAntes = await allHistoryRecords(env);

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: true, status: 'settled' });
    // Nada além do receipt mudou: core e gerações intocados.
    expect(env.storage.getItem(KEY)).toBe(coreAntes);
    expect(await readGenerationIds(env)).toEqual(geracoesAntes);
    expect(await allHistoryRecords(env)).toEqual(registrosAntes);
    await expectImportedWorld(env, crash);
    expect(await expectIdempotent(env, interrompido.operationId)).toMatchObject({ ok: true, status: 'already-settled' });
  });

  it('148. CRASH 15 — queda durante o W9 converge sem reescrever core nem geração', async () => {
    const crash = await crashedImport({
      // A segunda transição da fachada é o W9 (activated → settled).
      cut: { on: 'runtime', method: 'transitionStorageOperation', nth: 2, when: 'after' },
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    expect(interrompido.status).toBe('settled');
    const antes = await footprintOf(env);

    const resultado = await recover(env);

    // Sem `operationId` e sem operação pendente: no-operation, por definição.
    expect(resultado).toMatchObject({ ok: true, status: 'no-operation', recoveryRequired: false });
    // Com o `operationId`, o receipt terminal é IDENTIFICADO e relatado.
    expect(await recover(env, interrompido.operationId))
      .toMatchObject({ ok: true, status: 'already-settled', operationId: interrompido.operationId });
    // Zero escrita nos dois caminhos: nem core, nem geração, nem receipt.
    expect(await footprintOf(env)).toBe(antes);
    await expectImportedWorld(env, crash);
    expect(await expectIdempotent(env)).toMatchObject({ ok: true, status: 'no-operation' });
  });

  it('149. CRASH 16 — depois do W9 a administração está ready e nada é escrito', async () => {
    const crash = await crashedImport();
    expect(crash.resultado.ok).toBe(true);
    const env = reloaded(crash.harness);
    expect((await env.runtime.inspectStorageAdministration()).state.status).toBe('ready');
    const antes = await footprintOf(env);

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: true, status: 'no-operation', operationId: null });
    expect(await footprintOf(env)).toBe(antes);
    await expectImportedWorld(env, crash);
    expect(await expectIdempotent(env)).toMatchObject({ ok: true, status: 'no-operation' });
  });
});

// ---------------------------------------------------------------------------
// 150–156 — PROVA DE REINÍCIO REAL, LIMITE DE PASSOS E CONCORRÊNCIA
// ---------------------------------------------------------------------------

// Base 1: `staged` com geração preparada (queda depois do W2).
function stagedCrash(): Promise<CrashedImport> {
  return crashedImport({
    cut: { on: 'adapter', method: 'stageHistoryGenerationForOperation', nth: 1, when: 'after' },
  });
}

// Base 2: `activating` no MUNDO A (queda depois do W4).
function activatingCrash(): Promise<CrashedImport> {
  return crashedImport({
    cut: { on: 'runtime', method: 'transitionStorageOperation', nth: 1, when: 'after' },
  });
}

// Adapter auxiliar só para adulterar o mundo físico nos testes de ambiguidade.
function tamperAdapter(harness: Harness, generationId: string): IndexedDbWorkoutHistoryStorage {
  return new IndexedDbWorkoutHistoryStorage({
    factory: harness.factory,
    databaseName: harness.name,
    generationIdFactory: () => generationId,
    now: () => new Date('2026-07-27T08:00:00.000Z'),
  });
}

describe('recuperação da importação v2 — reinício real, limite e concorrência', () => {
  it('150. a recuperação roda sobre instâncias que nunca tocaram na importação', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);

    // Instâncias diferentes, banco igual, `localStorage` igual.
    expect(env.adapter).not.toBe(crash.harness.adapter);
    expect(env.runtime).not.toBe(crash.harness.runtime);
    expect(env.storage).toBe(crash.harness.storage);
    expect(env.name).toBe(crash.harness.name);
    // O adapter novo nem sequer está aberto: quem o abre é a própria
    // recuperação, exatamente como no boot.
    await expect(env.adapter.readMetadata()).rejects.toThrow();

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: true, status: 'settled' });
    await expectImportedWorld(env, crash);
  });

  it('151. a recuperação nunca cria geração: a fábrica de id lança se for chamada', async () => {
    const crash = await stagedCrash();
    const env = reloaded(crash.harness);
    // A fábrica do adapter recarregado explode se alguém tentar usá-la.
    expect(() => (env.adapter as unknown as { generationIdFactory: () => string })
      .generationIdFactory()).toThrow('a recuperação tentou criar uma geração');

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: true, status: 'reverted' });
    expect(await readGenerationIds(env)).toEqual([env.generationId]);
  });

  it('152. o laço tem limite fechado e devolve recovery-step-limit sem escrever', async () => {
    // MUNDO B: a geração já está ativa, então o primeiro pedido do resolvedor é
    // VERIFICAR — nenhuma escrita acontece em nenhum passo.
    const crash = await crashedImport({
      cut: { on: 'adapter', method: 'rollbackToHistoryGeneration', nth: 1, when: 'after' },
    });
    const env = reloaded(crash.harness);
    await env.adapter.open();
    // Fingerprint sempre novo: a prova criptográfica nunca vale para o estado
    // seguinte, então o resolvedor pede `verify-target` para sempre.
    let sequencia = 0;
    const instavel = new Proxy(env.adapter, {
      get(object, prop, receiver) {
        const value = Reflect.get(object, prop, receiver);
        if (typeof value !== 'function') return value;
        const bound = (value as (...a: unknown[]) => unknown).bind(object);
        if (prop !== 'readStorageAdministrationSnapshot') return bound;
        return async (...args: unknown[]) => {
          const snapshot = await bound(...args) as { fingerprint: string };
          return { ...snapshot, fingerprint: `instavel-${sequencia += 1}` };
        };
      },
    }) as typeof env.adapter;
    // Sem o core alvo gravado o laço fica em MUNDO B pedindo verificação.
    const antes = await footprintOf(env);

    const resultado = await recoverLogicalStorageImportV2({
      runtime: env.runtime,
      adapter: instavel,
      storage: env.storage,
      key: KEY,
      ownerToken: createTestOwnerToken(),
    });

    expect(resultado).toMatchObject({
      ok: false,
      reason: 'recovery-step-limit',
      recoveryRequired: true,
      finalAction: 'observe',
    });
    if (resultado.ok) return;
    // Limite FECHADO: nem recursão infinita, nem espera, nem retry por atraso.
    expect(resultado.steps).toBeGreaterThanOrEqual(8);
    expect(resultado.steps).toBeLessThanOrEqual(16);
    expect(await footprintOf(env)).toBe(antes);
    // O journal ficou aberto e uma recuperação normal ainda converge.
    expect(await recover(env)).toMatchObject({ ok: true, status: 'settled' });
  });

  it('153. duas recuperações concorrentes convergem para um mundo único (activating)', async () => {
    const crash = await activatingCrash();
    const base = reloaded(crash.harness);
    const [antesReceipt] = await readOperationReceipts(base);
    const geracoesAntes = (await readGenerationIds(base)).sort();

    const [a, b] = [reloaded(crash.harness), reloaded(crash.harness)];
    const resultados = await Promise.all([recover(a), recover(b)]);

    // No máximo UMA execução pode dizer que avançou a liquidação.
    expect(resultados.filter((r) => r.ok && r.status === 'settled').length)
      .toBeLessThanOrEqual(1);
    // Nenhuma inventou operação ou geração nova.
    for (const resultado of resultados) {
      if (resultado.operationId !== null) {
        expect(resultado.operationId).toBe(antesReceipt.operationId);
      }
      if (resultado.generationId !== null) {
        expect(resultado.generationId).toBe(antesReceipt.stagedGenerationId);
      }
    }
    expect(await readOperationReceipts(a)).toHaveLength(1);
    expect((await readGenerationIds(a)).sort()).toEqual(geracoesAntes);

    // O estado físico final é único e válido: uma execução sequencial fecha.
    await recover(a);
    await expectImportedWorld(a, crash);
  });

  it('154. duas recuperações concorrentes convergem para um mundo único (staged)', async () => {
    const crash = await stagedCrash();
    const base = reloaded(crash.harness);
    const [antesReceipt] = await readOperationReceipts(base);

    const [a, b] = [reloaded(crash.harness), reloaded(crash.harness)];
    const resultados = await Promise.all([recover(a), recover(b)]);

    expect(resultados.filter((r) => r.ok && r.status === 'reverted').length)
      .toBeLessThanOrEqual(1);
    for (const resultado of resultados) {
      if (resultado.operationId !== null) {
        expect(resultado.operationId).toBe(antesReceipt.operationId);
      }
    }
    await recover(a);
    expect(await readOperationReceipts(a)).toHaveLength(1);
    expect((await readOperationReceipts(a))[0].status).toBe('reverted');
    expect(await readGenerationIds(a)).toEqual([a.generationId]);
    await expectPreviousWorld(a, crash);
  });

  it('155. a idempotência sobrevive a cinco execuções seguidas', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);

    expect(await recover(env)).toMatchObject({ ok: true, status: 'settled' });
    const depoisDaPrimeira = await footprintOf(env);

    for (let i = 0; i < 5; i += 1) {
      const repetida = await recover(env, interrompido.operationId);
      expect(repetida).toMatchObject({ ok: true, status: 'already-settled' });
      // Nenhum savedAt novo, nenhum receipt novo, nenhuma transição reaberta,
      // nenhuma cópia rolante regravada, nenhuma exclusão adicional.
      expect(await footprintOf(env)).toBe(depoisDaPrimeira);
    }
  });

  it('156. a reversão idempotente não regrava a cópia rolante nem apaga de novo', async () => {
    const crash = await stagedCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);

    expect(await recover(env)).toMatchObject({ ok: true, status: 'reverted' });
    const depois = await footprintOf(env);

    for (let i = 0; i < 3; i += 1) {
      expect(await recover(env, interrompido.operationId))
        .toMatchObject({ ok: true, status: 'already-reverted', cleanupPending: false });
      expect(await footprintOf(env)).toBe(depois);
    }
    // A cópia rolante nunca foi tocada pelo caminho de reversão.
    expect(env.storage.values.get(BACKUP_KEY) ?? null).toBe(crash.previousBackup);
    expect(env.storage.removed).not.toContain(KEY);
    expect(env.storage.removed).not.toContain(BACKUP_KEY);
  });
});

// ---------------------------------------------------------------------------
// 157–178 — MATRIZ DE ESTADOS AMBÍGUOS
//
// Em todos: nenhuma escrita canônica, nenhum receipt terminal falso, nenhuma
// geração apagada, retorno fechado e sanitizado.
// ---------------------------------------------------------------------------

describe('recuperação da importação v2 — estados ambíguos', () => {
  // Roda a recuperação e exige bloqueio com footprint idêntico byte a byte.
  async function expectBlocked(
    env: Harness,
    reason: string,
    operationId?: string,
  ): Promise<void> {
    const antes = await footprintOf(env);
    const resultado = await recover(env, operationId);
    expect([resultado.ok, resultado.ok ? '' : resultado.reason]).toEqual([false, reason]);
    if (resultado.ok) return;
    expect(resultado.recoveryRequired).toBe(true);
    // Footprint byte a byte: nenhuma escrita canônica, nenhum receipt terminal
    // falso, nenhuma geração apagada e nenhum `updatedAt` novo.
    expect(await footprintOf(env)).toBe(antes);
  }

  it('157. geração ativa é uma terceira geração real', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    const auxiliar = tamperAdapter(crash.harness, 'generation-terceira');
    await auxiliar.open();
    const terceira = await auxiliar.prepareHistoryGeneration([makeSession(900)]);
    await auxiliar.close();
    await putMetadataRecord(env, 'migrationGeneration', null);
    await putMetadataRecord(env, 'activeGeneration', terceira);

    await expectBlocked(env, 'recovery-required');
    expect(await readGenerationIds(env)).toContain(terceira);
    await expectPreviousGenerationIntact(env, crash.sessions);
  });

  it('158. geração ativa é a anterior e o core já é o alvo (MUNDO D)', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    // Core alvo sem ativação: a ordem oficial é geração → core.
    env.storage.values.set(KEY, interrompido.targetCoreRaw as string);

    await expectBlocked(env, 'recovery-required');
    expect((await metadataOf(env)).activeGeneration).toBe(env.generationId);
  });

  it('159. geração ativa é uma terceira e o core é o anterior', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    await putMetadataRecord(env, 'activeGeneration', 'generation-fantasma');

    await expectBlocked(env, 'recovery-required');
    await expectPreviousGenerationIntact(env, crash.sessions);
  });

  it('160. o receipt nomeia uma geração preparada divergente', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    await putRawOperationReceipt(env, {
      ...interrompido,
      stagedGenerationId: 'generation-divergente',
    });

    await expectBlocked(env, 'impossible-state');
    await expectPreviousGenerationIntact(env, crash.sessions);
  });

  it('161. o receipt nomeia um core alvo divergente', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    await putRawOperationReceipt(env, {
      ...interrompido,
      targetCoreRaw: '{"v":2,"savedAt":"2026-07-26T11:00:00.000Z","data":"divergente"}',
    });

    await expectBlocked(env, 'recovery-required');
  });

  it('162. o receipt activating perdeu a geração preparada', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    await putRawOperationReceipt(env, { ...interrompido, stagedGenerationId: null });

    await expectBlocked(env, 'impossible-state');
  });

  it('163. o receipt activating perdeu o core alvo', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    await putRawOperationReceipt(env, { ...interrompido, targetCoreRaw: null });

    await expectBlocked(env, 'impossible-state');
  });

  it('164. a geração preparada desapareceu do armazenamento', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    const auxiliar = tamperAdapter(crash.harness, 'irrelevante');
    await auxiliar.open();
    await auxiliar.clearInactiveGeneration(interrompido.stagedGenerationId as string);
    await auxiliar.close();

    await expectBlocked(env, 'impossible-state');
    await expectPreviousGenerationIntact(env, crash.sessions);
  });

  it('165. a geração preparada foi adulterada', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    await tamperGenerationRecord(env, interrompido.stagedGenerationId as string);

    // A verificação integral recusa e a ativação nunca acontece.
    await expectBlocked(env, 'verification-failed');
    expect((await metadataOf(env)).activeGeneration).toBe(env.generationId);
    await expectPreviousGenerationIntact(env, crash.sessions);
  });

  it('166. o manifest da geração preparada sumiu', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    await withStore(env, GENERATION_MANIFESTS_STORE, 'readwrite', (transaction) => (
      requestResult(transaction.objectStore(GENERATION_MANIFESTS_STORE)
        .delete(interrompido.stagedGenerationId as string))
    ));

    // A geração continua ENUMERADA (os registros existem), então ela não some
    // do mundo — o que some é a possibilidade de prová-la. Sem manifest a
    // verificação integral recusa e a ativação nunca chega a acontecer.
    await expectBlocked(env, 'verification-failed');
    expect((await metadataOf(env)).activeGeneration).toBe(env.generationId);
    await expectPreviousGenerationIntact(env, crash.sessions);
  });

  it('167. o orderedDigest da geração preparada diverge', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    await tamperGenerationManifest(env, interrompido.stagedGenerationId as string);

    await expectBlocked(env, 'verification-failed');
    await expectPreviousGenerationIntact(env, crash.sessions);
  });

  it('168. migrationGeneration está preenchida', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    await putMetadataRecord(env, 'migrationGeneration', interrompido.stagedGenerationId);

    await expectBlocked(env, 'administration-conflicted');
  });

  it('169. migrationStatus não está completed', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    await putMetadataRecord(env, 'migrationStatus', 'in-progress');

    await expectBlocked(env, 'migration-incomplete');
  });

  it('170. existe um completion receipt pendente', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    // Receipt de conclusão VÁLIDO e pendente: o bloqueio precisa vir da
    // política, não de um registro malformado.
    const sessao = makeSession(500, { id: 'session-pendente' });
    await putRawCompletionReceipt(env, {
      receiptId: 'receipt-pendente',
      sessionId: sessao.id,
      generationId: env.generationId,
      sessionDigest: await digestWorkoutSession(sessao),
      finalSession: sessao,
      coreEnvelopeAfter: coreOf(env),
      effects: {
        xpNotifications: [],
        communityPost: { id: 'post-1', content: 'treino concluído' },
        unlockedAchievementIds: [],
        markedDayName: 'segunda',
      },
      createdAt: '2026-07-26T12:00:00.000Z',
      status: 'pending',
      settledAt: null,
    });

    await expectBlocked(env, 'operation-conflict');
  });

  it('171. existem dois receipts não terminais', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    await putRawOperationReceipt(env, {
      ...createStorageOperationReceipt({
        operationId: 'operation-intruso',
        kind: 'rollback',
        previousCoreRaw: crash.previousCore,
        previousGenerationId: env.generationId,
        createdAt: '2026-07-26T12:00:00.000Z',
      }),
    });

    await expectBlocked(env, 'operation-conflict');
    await expectBlocked(env, 'operation-conflict', interrompido.operationId);
  });

  it('172. o único receipt em aberto é de outro kind', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    await putRawOperationReceipt(env, { ...interrompido, kind: 'restore' });

    // Não assumir que um receipt de restore pertence à importação.
    await expectBlocked(env, 'operation-conflict');
  });

  it('173. o kind reset e o kind rollback também bloqueiam', async () => {
    for (const kind of ['reset', 'rollback'] as const) {
      const crash = await activatingCrash();
      const env = reloaded(crash.harness);
      const [interrompido] = await readOperationReceipts(env);
      await putRawOperationReceipt(env, { ...interrompido, kind });

      await expectBlocked(env, 'operation-conflict');
    }
  });

  it('174. o operationId informado não corresponde a nenhum receipt', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);

    await expectBlocked(env, 'operation-conflict', 'operation-inexistente');
  });

  it('175. o operationId informado não é a operação em aberto', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    await putRawOperationReceipt(env, {
      ...createStorageOperationReceipt({
        operationId: 'operation-antiga',
        kind: 'import',
        previousCoreRaw: crash.previousCore,
        previousGenerationId: env.generationId,
        createdAt: '2026-07-25T12:00:00.000Z',
      }),
      status: 'settled',
    });

    // Um terminal só é relatado quando é a única história do armazenamento.
    await expectBlocked(env, 'operation-conflict', 'operation-antiga');
    // A operação certa continua recuperável.
    expect(await recover(env, interrompido.operationId))
      .toMatchObject({ ok: true, status: 'settled' });
  });

  it('176. a leitura da chave principal fica indisponível', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    await env.adapter.open();
    const antes = await footprintOf(env);
    // A primeira leitura (triagem da fachada) passa; a do laço falha.
    let leituras = 0;
    env.storage.failGetItem = (chave) => {
      if (chave !== KEY) return null;
      leituras += 1;
      return leituras > 3 ? { error: getterError() } : null;
    };

    const resultado = await recover(env);
    env.storage.failGetItem = null;

    expect(resultado).toMatchObject({ ok: false, recoveryRequired: true });
    if (resultado.ok) return;
    expect(['storage-unavailable', 'administration-unavailable']).toContain(resultado.reason);
    expect(await footprintOf(env)).toBe(antes);
  });

  it('177. o IndexedDB fica indisponível', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    const indisponivel = new Proxy(env.adapter, {
      get(object, prop, receiver) {
        if (prop === 'isAvailable') return () => Promise.resolve(false);
        const value = Reflect.get(object, prop, receiver);
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(object)
          : value;
      },
    }) as typeof env.adapter;
    const runtime = createStorageAdminRuntime({
      key: KEY,
      storage: env.storage,
      adapter: indisponivel,
    });
    const coreAntes = env.storage.getItem(KEY);

    const resultado = await recoverLogicalStorageImportV2({
      runtime,
      adapter: indisponivel,
      storage: env.storage,
      key: KEY,
    });

    expect(resultado).toMatchObject({
      ok: false,
      reason: 'administration-unavailable',
      finalAction: 'observe',
      recoveryRequired: true,
    });
    expect(env.storage.getItem(KEY)).toBe(coreAntes);
    await expectPreviousGenerationIntact(env, crash.sessions);
  });

  it('178. o core anterior sumiu da chave principal', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    await env.adapter.open();
    env.storage.values.delete(KEY);
    const geracoesAntes = (await readGenerationIds(env)).sort();

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: false, recoveryRequired: true });
    expect((await readOperationReceipts(env))[0].status).toBe('activating');
    expect((await readGenerationIds(env)).sort()).toEqual(geracoesAntes);
  });
});

// ---------------------------------------------------------------------------
// 179–182 — PRESERVAÇÃO DA GERAÇÃO ANTERIOR
// ---------------------------------------------------------------------------

describe('recuperação da importação v2 — a geração anterior nunca é apagada', () => {
  it('179. o módulo nunca chama clearInactiveGeneration sobre a geração anterior', async () => {
    for (const base of [stagedCrash, activatingCrash]) {
      const crash = await base();
      const env = reloaded(crash.harness);
      const apagadas: string[] = [];
      const observado = new Proxy(env.adapter, {
        get(object, prop, receiver) {
          const value = Reflect.get(object, prop, receiver);
          if (typeof value !== 'function') return value;
          const bound = (value as (...a: unknown[]) => unknown).bind(object);
          if (prop !== 'clearInactiveGeneration') return bound;
          return async (...args: unknown[]) => {
            apagadas.push(args[0] as string);
            return bound(...args);
          };
        },
      }) as typeof env.adapter;

      const resultado = await recoverLogicalStorageImportV2({
        runtime: env.runtime,
        adapter: observado,
        storage: env.storage,
        key: KEY,
      });

      expect(resultado.ok).toBe(true);
      expect(apagadas).not.toContain(env.generationId);
      await expectPreviousGenerationIntact(env, crash.sessions);
    }
  });

  it('180. reverter preserva manifest, sessões e digest da geração anterior', async () => {
    const crash = await stagedCrash();
    const env = reloaded(crash.harness);
    await env.adapter.open();
    const manifestAntes = await env.adapter.readGenerationManifest(env.generationId);
    const sessoesAntes = await env.adapter.readHistoryGeneration(env.generationId);

    expect(await recover(env)).toMatchObject({ ok: true, status: 'reverted' });

    expect(await env.adapter.readGenerationManifest(env.generationId)).toEqual(manifestAntes);
    expect(await env.adapter.readHistoryGeneration(env.generationId)).toEqual(sessoesAntes);
    await expectPreviousGenerationIntact(env, crash.sessions);
  });

  it('181. avançar preserva manifest, sessões e digest da geração anterior', async () => {
    const crash = await activatingCrash();
    const env = reloaded(crash.harness);
    await env.adapter.open();
    const manifestAntes = await env.adapter.readGenerationManifest(env.generationId);
    const sessoesAntes = await env.adapter.readHistoryGeneration(env.generationId);

    expect(await recover(env)).toMatchObject({ ok: true, status: 'settled' });

    expect(await env.adapter.readGenerationManifest(env.generationId)).toEqual(manifestAntes);
    expect(await env.adapter.readHistoryGeneration(env.generationId)).toEqual(sessoesAntes);
    await expectPreviousGenerationIntact(env, crash.sessions);
  });

  it('182. a limpeza é recusada quando a geração preparada é a anterior', async () => {
    const crash = await stagedCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    // Receipt mentiroso: ele diz que a geração ANTERIOR foi preparada por ele.
    await putRawOperationReceipt(env, {
      ...interrompido,
      stagedGenerationId: interrompido.previousGenerationId,
    });
    const geracoesAntes = (await readGenerationIds(env)).sort();

    const resultado = await recover(env);

    expect(resultado).toMatchObject({ ok: false, reason: 'impossible-state' });
    expect((await readGenerationIds(env)).sort()).toEqual(geracoesAntes);
    await expectPreviousGenerationIntact(env, crash.sessions);
  });

  it('183. a órfã segura aparece como cleanupPending em vez de perda de dados', async () => {
    const crash = await stagedCrash();
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    const preparada = interrompido.stagedGenerationId as string;
    const semLimpeza = new Proxy(env.adapter, {
      get(object, prop, receiver) {
        if (prop === 'clearInactiveGeneration') {
          return () => Promise.reject(new Error('limpeza indisponível'));
        }
        const value = Reflect.get(object, prop, receiver);
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(object)
          : value;
      },
    }) as typeof env.adapter;

    const resultado = await recoverLogicalStorageImportV2({
      runtime: env.runtime,
      adapter: semLimpeza,
      storage: env.storage,
      key: KEY,
    });

    // Falha de limpeza NÃO transforma o receipt terminal em não terminal.
    expect(resultado).toMatchObject({ ok: true, status: 'reverted', cleanupPending: true });
    expect((await readOperationReceipts(env))[0].status).toBe('reverted');
    expect((await readGenerationIds(env)).sort()).toEqual([env.generationId, preparada].sort());
    await expectPreviousWorld(env, crash);
    // Sem `operationId` não existe operação em aberto para achar: a órfã é
    // invisível, e varrer receipts terminais atrás de gerações antigas seria
    // política de retenção — coisa do 002D-F, não desta função.
    expect(await recover(env)).toMatchObject({ ok: true, status: 'no-operation' });
    expect((await readGenerationIds(env)).sort()).toEqual([env.generationId, preparada].sort());
    // Nomeando a operação, a limpeza segura termina sem reabrir nada.
    expect(await recover(env, interrompido.operationId))
      .toMatchObject({ ok: true, status: 'already-reverted', cleanupPending: false });
    expect(await readGenerationIds(env)).toEqual([env.generationId]);
    expect((await readOperationReceipts(env))[0].status).toBe('reverted');
  });
});

// ---------------------------------------------------------------------------
// 184–194 — PRIVACIDADE DA RECUPERAÇÃO
//
// A API nova é mais estrita do que a do C1: ela não tem canal de `cause`. O
// que sai é `status`/`reason` fechados, uma mensagem constante deste módulo,
// `operationId`, `generationId`, contagem de passos, ação final e duas
// indicações booleanas. Nada mais.
// ---------------------------------------------------------------------------

const SENTINELAS_C2 = [
  'PRIVATE_RAW',
  'PRIVATE_PREVIOUS_CORE',
  'PRIVATE_TARGET_CORE',
  'PRIVATE_EMAIL',
  'PRIVATE_NAME',
  'PRIVATE_SESSION_ID',
  'PRIVATE_WORKOUT',
  'PRIVATE_STORAGE_MESSAGE',
  'PRIVATE_INDEXEDDB_MESSAGE',
] as const;

function expectNoC2Sentinels(fase: string, ...valores: unknown[]): void {
  const textos = valores.flatMap((valor) => collectStrings(valor));
  for (const valor of valores) textos.push(JSON.stringify(valor) ?? '');
  for (const sentinela of SENTINELAS_C2) {
    const vazando = textos.filter((texto) => texto.includes(sentinela));
    expect(`${fase} → ${vazando.join(' | ')}`).toBe(`${fase} → `);
  }
}

describe('recuperação da importação v2 — privacidade', () => {
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

  // Crash com sentinelas nos DOIS mundos: o core anterior carrega a própria,
  // para que um vazamento de `previousCoreRaw` seja distinguível do arquivo.
  function sentinelCrash(cut: CrashSetup['cut']): Promise<CrashedImport> {
    return crashedImport({
      cut,
      payload: sentinelPayload(),
      previousCore: (core) => {
        core.restTimerLabel = 'PRIVATE_PREVIOUS_CORE';
      },
    });
  }

  const storageError = () => namedError('UnknownError', 'PRIVATE_STORAGE_MESSAGE');
  const indexedDbError = () => namedError('DataError', 'PRIVATE_INDEXEDDB_MESSAGE');

  function captureConsoleC2(): { entries: unknown[]; restore: () => void } {
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

  // Cada fase provoca a falha de UMA ação da recuperação e devolve o retorno
  // público que ela produziu.
  const FASES: { fase: string; run: () => Promise<LogicalStorageImportRecoveryResult> }[] = [
    {
      fase: 'leitura inicial da chave principal',
      run: async () => {
        const crash = await sentinelCrash({
          on: 'runtime', method: 'transitionStorageOperation', nth: 1, when: 'after',
        });
        const env = reloaded(crash.harness);
        env.storage.failGetItem = (chave) => (chave === KEY ? { error: storageError() } : null);
        const resultado = await recover(env);
        env.storage.failGetItem = null;
        return resultado;
      },
    },
    {
      fase: 'leitura do snapshot administrativo',
      run: async () => {
        const crash = await sentinelCrash({
          on: 'runtime', method: 'transitionStorageOperation', nth: 1, when: 'after',
        });
        const env = reloaded(crash.harness);
        await env.adapter.open();
        return recoverLogicalStorageImportV2({
          runtime: env.runtime,
          adapter: failingMethod(
            env.adapter, 'readStorageAdministrationSnapshot', indexedDbError(),
          ) as unknown as Parameters<typeof recoverLogicalStorageImportV2>[0]['adapter'],
          storage: env.storage,
          key: KEY,
        });
      },
    },
    {
      fase: 'verificação da geração',
      run: async () => {
        const crash = await sentinelCrash({
          on: 'runtime', method: 'transitionStorageOperation', nth: 1, when: 'after',
        });
        const env = reloaded(crash.harness);
        await env.adapter.open();
        return recoverLogicalStorageImportV2({
          runtime: env.runtime,
          adapter: failingMethod(
            env.adapter, 'readVerifiedHistoryGeneration', indexedDbError(),
          ) as unknown as Parameters<typeof recoverLogicalStorageImportV2>[0]['adapter'],
          storage: env.storage,
          key: KEY,
        });
      },
    },
    {
      fase: 'ativação da geração',
      run: async () => {
        const crash = await sentinelCrash({
          on: 'runtime', method: 'transitionStorageOperation', nth: 1, when: 'after',
        });
        const env = reloaded(crash.harness);
        await env.adapter.open();
        return recoverLogicalStorageImportV2({
          runtime: env.runtime,
          adapter: failingMethod(
            env.adapter, 'rollbackToHistoryGeneration', indexedDbError(),
          ) as unknown as Parameters<typeof recoverLogicalStorageImportV2>[0]['adapter'],
          storage: env.storage,
          key: KEY,
        });
      },
    },
    {
      fase: 'cópia rolante',
      run: async () => {
        const crash = await sentinelCrash({
          on: 'adapter', method: 'rollbackToHistoryGeneration', nth: 1, when: 'after',
        });
        const env = reloaded(crash.harness);
        env.storage.failSetItem = (chave) => (
          chave === BACKUP_KEY ? { error: storageError() } : null
        );
        const resultado = await recover(env);
        env.storage.failSetItem = null;
        return resultado;
      },
    },
    {
      fase: 'gravação do core',
      run: async () => {
        const crash = await sentinelCrash({
          on: 'adapter', method: 'rollbackToHistoryGeneration', nth: 1, when: 'after',
        });
        const env = reloaded(crash.harness);
        env.storage.failSetItem = (chave) => (chave === KEY ? { error: storageError() } : null);
        const resultado = await recover(env);
        env.storage.failSetItem = null;
        return resultado;
      },
    },
    {
      fase: 'W8 (activating → activated)',
      run: async () => {
        const crash = await sentinelCrash({
          on: 'adapter', method: 'readMetadata', nth: 2, when: 'after',
        });
        const env = reloaded(crash.harness);
        await env.adapter.open();
        return recoverLogicalStorageImportV2({
          runtime: env.runtime,
          adapter: failingMethod(
            env.adapter, 'transitionStorageOperationIfUnambiguous', indexedDbError(),
          ) as unknown as Parameters<typeof recoverLogicalStorageImportV2>[0]['adapter'],
          storage: env.storage,
          key: KEY,
        });
      },
    },
    {
      fase: 'liquidação (activated → settled)',
      run: async () => {
        const crash = await sentinelCrash({
          on: 'adapter', method: 'transitionStorageOperationIfUnambiguous', nth: 1, when: 'after',
        });
        const env = reloaded(crash.harness);
        await env.adapter.open();
        return recoverLogicalStorageImportV2({
          runtime: failingMethod(
            env.runtime, 'transitionStorageOperation', indexedDbError(),
          ) as unknown as Parameters<typeof recoverLogicalStorageImportV2>[0]['runtime'],
          adapter: env.adapter,
          storage: env.storage,
          key: KEY,
        });
      },
    },
    {
      fase: 'limpeza da geração preparada',
      run: async () => {
        const crash = await sentinelCrash({
          on: 'adapter', method: 'stageHistoryGenerationForOperation', nth: 1, when: 'after',
        });
        const env = reloaded(crash.harness);
        await env.adapter.open();
        return recoverLogicalStorageImportV2({
          runtime: env.runtime,
          adapter: failingMethod(
            env.adapter, 'clearInactiveGeneration', indexedDbError(),
          ) as unknown as Parameters<typeof recoverLogicalStorageImportV2>[0]['adapter'],
          storage: env.storage,
          key: KEY,
        });
      },
    },
    {
      fase: 'sucesso completo',
      run: async () => {
        const crash = await sentinelCrash({
          on: 'runtime', method: 'transitionStorageOperation', nth: 1, when: 'after',
        });
        return recover(reloaded(crash.harness));
      },
    },
  ];

  for (const [indice, { fase, run }] of FASES.entries()) {
    it(`${184 + indice}. nenhuma sentinela vaza na fase: ${fase}`, async () => {
      const console = captureConsoleC2();
      let resultado: LogicalStorageImportRecoveryResult;
      try {
        resultado = await run();
      } finally {
        console.restore();
      }
      expectNoC2Sentinels(fase, resultado, console.entries);
      // A API nova NÃO tem canal de `cause`: nem sanitizado, nem vazio.
      expect(Object.prototype.hasOwnProperty.call(resultado, 'cause')).toBe(false);
      // Só as chaves permitidas saem — o receipt completo nunca sai.
      const permitidas = resultado.ok
        ? ['ok', 'status', 'operationId', 'generationId', 'steps', 'finalAction', 'recoveryRequired', 'cleanupPending']
        : ['ok', 'reason', 'error', 'operationId', 'generationId', 'steps', 'finalAction', 'recoveryRequired', 'cleanupPending'];
      expect(Object.keys(resultado).sort()).toEqual([...permitidas].sort());
    }, 30_000);
  }

  it('194. a mensagem de falha é sempre uma constante do módulo', async () => {
    const crash = await sentinelCrash({
      on: 'runtime', method: 'transitionStorageOperation', nth: 1, when: 'after',
    });
    const env = reloaded(crash.harness);
    const [interrompido] = await readOperationReceipts(env);
    await putRawOperationReceipt(env, { ...interrompido, stagedGenerationId: 'generation-divergente' });

    const resultado = await recover(env);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    // Nem id, nem contagem, nem texto do ambiente: a mensagem é literal.
    expect(resultado.error).toBe('O journal descreve um estado que esta ordem de escrita não produz.');
    expect(resultado.error).not.toContain(interrompido.operationId);
    expect(resultado.error).not.toContain('generation');
    expectNoC2Sentinels('mensagem constante', resultado);
  });
});

// ---------------------------------------------------------------------------
describe('owner-token real — integração C1/C2 entre abas', () => {
  const C1_WRITE_WINDOWS = [
    'W1 begin receipt',
    'W2 stage generation',
    'W4 receipt activating',
    'W5 activate generation',
    'W6 rolling backup',
    'W6 exact core',
    'W8 receipt activated',
    'W9 settlement',
  ] as const;

  function ownerWithTakeoverAt(input: {
    storage: MemoryStorage;
    timing: 'before' | 'after';
    window: number;
    now: () => number;
  }): {
    coordinator: StorageAdminOwnerTokenCoordinator;
    executedWindows: () => number;
  } {
    let window = 0;
    let nonce = 0;
    const base = createStorageAdminOwnerTokenCoordinator({
      key: KEY,
      storage: input.storage,
      ownerId: 'owner-import-tab',
      now: input.now,
      nonceFactory: () => `nonce-import-${nonce += 1}`,
      operationIdFactory: () => 'operation-import-window',
      leaseDurationMs: 100,
      renewWithinMs: 25,
    });
    const takeover = (): void => {
      input.storage.values.set(`${KEY}:admin-owner-token:v1`, JSON.stringify({
        schemaVersion: 1,
        ownerId: 'owner-other-tab',
        operationId: 'operation-other-tab',
        operationKind: 'import',
        acquiredAt: 0,
        expiresAt: 100,
        nonce: `nonce-other-${input.timing}-${input.window}`,
      }));
    };
    return {
      coordinator: {
        createOperationId: () => base.createOperationId(),
        acquire: (acquireInput) => {
          const acquisition = base.acquire(acquireInput);
          if (acquisition.status === 'blocked') return acquisition;
          const lease = acquisition.lease;
          return {
            status: 'acquired',
            reason: acquisition.reason,
            lease: {
              confirm: () => lease.confirm(),
              execute: async <T>(operation: () => T | Promise<T>): Promise<T> => {
                window += 1;
                if (window === input.window && input.timing === 'before') takeover();
                return lease.execute(async () => {
                  const result = await operation();
                  if (window === input.window && input.timing === 'after') takeover();
                  return result;
                });
              },
              release: () => lease.release(),
            },
          };
        },
      },
      executedWindows: () => window,
    };
  }

  it('bloqueia a importação antes de W1 quando outra aba mantém token válido', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70)]));
    const coreBefore = harness.storage.getItem(KEY);
    const blocker = createStorageAdminOwnerTokenCoordinator({
      key: KEY,
      storage: harness.storage,
      ownerId: 'owner-other-tab',
      now: () => 10,
      nonceFactory: () => 'nonce-other-tab',
      operationIdFactory: () => 'operation-other-tab',
      leaseDurationMs: 100,
      renewWithinMs: 25,
    });
    expect(blocker.acquire({
      operationId: 'operation-other-tab',
      operationKind: 'import',
    }).status).toBe('acquired');
    const contender = createStorageAdminOwnerTokenCoordinator({
      key: KEY,
      storage: harness.storage,
      ownerId: 'owner-current-tab',
      now: () => 10,
      nonceFactory: () => 'nonce-current-tab',
      operationIdFactory: () => 'operation-current-tab',
      leaseDurationMs: 100,
      renewWithinMs: 25,
    });

    const result = await commit(harness, raw, { ownerToken: contender });

    expect(result).toMatchObject({
      ok: false,
      reason: 'owner-token-conflict',
      operationId: null,
      generationId: null,
      compensation: 'not-needed',
    });
    expect(await readOperationReceipts(harness)).toEqual([]);
    expect(await harness.adapter.readActiveHistory()).toEqual([makeSession(1)]);
    expect(harness.storage.getItem(KEY)).toBe(coreBefore);
  });

  it('perda depois de W2 para fechado; recovery converge após takeover expirado', async () => {
    const harness = await createReadyHarness({ sessions: [makeSession(1)] });
    const raw = await makeBackupContent(defaults([makeSession(70), makeSession(71)]));
    let now = 0;
    const owner = createStorageAdminOwnerTokenCoordinator({
      key: KEY,
      storage: harness.storage,
      ownerId: 'owner-import-tab',
      now: () => now,
      nonceFactory: (() => {
        let sequence = 0;
        return () => `nonce-import-${sequence += 1}`;
      })(),
      operationIdFactory: () => 'operation-import-tab',
      leaseDurationMs: 100,
      renewWithinMs: 25,
    });
    const adapterWithTakeover = afterCall(
      harness.adapter,
      'stageHistoryGenerationForOperation',
      1,
      () => {
        harness.storage.values.set(`${KEY}:admin-owner-token:v1`, JSON.stringify({
          schemaVersion: 1,
          ownerId: 'owner-other-tab',
          operationId: 'operation-other-tab',
          operationKind: 'import',
          acquiredAt: 0,
          expiresAt: 100,
          nonce: 'nonce-other-tab',
        }));
      },
    ) as LogicalImportAdapter;

    const interrupted = await commit(harness, raw, {
      adapter: adapterWithTakeover,
      ownerToken: owner,
    });

    expect(interrupted).toMatchObject({
      ok: false,
      reason: 'owner-token-conflict',
    });
    const [receipt] = await readOperationReceipts(harness);
    expect(receipt).toMatchObject({
      operationId: 'operation-import-tab',
      status: 'staged',
      kind: 'import',
    });
    const beforeBlockedRecovery = await footprintOf(harness);
    const recoveryOwner = createStorageAdminOwnerTokenCoordinator({
      key: KEY,
      storage: harness.storage,
      ownerId: 'owner-recovery-tab',
      now: () => now,
      nonceFactory: (() => {
        let sequence = 0;
        return () => `nonce-recovery-${sequence += 1}`;
      })(),
      operationIdFactory: () => 'operation-recovery-tab',
      leaseDurationMs: 100,
      renewWithinMs: 25,
    });

    now = 99;
    const blocked = await recoverLogicalStorageImportV2({
      runtime: harness.runtime,
      adapter: harness.adapter,
      storage: harness.storage,
      key: KEY,
      ownerToken: recoveryOwner,
    });
    expect(blocked).toMatchObject({
      ok: false,
      reason: 'owner-token-conflict',
      recoveryRequired: true,
    });
    expect(await footprintOf(harness)).toBe(beforeBlockedRecovery);

    now = 100;
    const recovered = await recoverLogicalStorageImportV2({
      runtime: harness.runtime,
      adapter: harness.adapter,
      storage: harness.storage,
      key: KEY,
      ownerToken: recoveryOwner,
    });
    expect(recovered).toMatchObject({
      ok: true,
      status: 'reverted',
      recoveryRequired: false,
    });
    expect((await harness.runtime.inspectStorageAdministration()).unsettledOperations).toEqual([]);
    expect(await harness.adapter.readActiveHistory()).toEqual([makeSession(1)]);
  });

  for (const timing of ['before', 'after'] as const) {
    for (const [index, windowName] of C1_WRITE_WINDOWS.entries()) {
      it(`conflito ${timing} de ${windowName} interrompe fechado e deixa recovery convergir`, async () => {
        const harness = await createReadyHarness({ sessions: [makeSession(1)] });
        const raw = await makeBackupContent(defaults([makeSession(70), makeSession(71)]));
        let now = 0;
        const interleaving = ownerWithTakeoverAt({
          storage: harness.storage,
          timing,
          window: index + 1,
          now: () => now,
        });

        const interrupted = await commit(harness, raw, {
          ownerToken: interleaving.coordinator,
        });

        expect(interrupted).toMatchObject({
          ok: false,
          reason: 'owner-token-conflict',
          operationId: null,
          generationId: null,
        });
        expect(interleaving.executedWindows()).toBe(index + 1);
        expect(JSON.stringify(interrupted)).not.toMatch(
          /owner-import-tab|owner-other-tab|operation-import-window|nonce-other/,
        );

        now = 100;
        const recoveryOwner = createStorageAdminOwnerTokenCoordinator({
          key: KEY,
          storage: harness.storage,
          ownerId: 'owner-recovery-tab',
          now: () => now,
          nonceFactory: () => `nonce-recovery-${timing}-${index}`,
          operationIdFactory: () => `operation-recovery-${timing}-${index}`,
          leaseDurationMs: 100,
          renewWithinMs: 25,
        });
        const recovered = await recoverLogicalStorageImportV2({
          runtime: harness.runtime,
          adapter: harness.adapter,
          storage: harness.storage,
          key: KEY,
          ownerToken: recoveryOwner,
        });

        expect(recovered.ok).toBe(true);
        expect((await harness.runtime.inspectStorageAdministration()).unsettledOperations).toEqual([]);
      }, 30_000);
    }
  }

  const C2_SCENARIOS = [
    {
      name: 'staged/revert',
      create: stagedCrash,
      windows: ['revert receipt', 'cleanup staging'],
    },
    {
      name: 'activating/forward',
      create: activatingCrash,
      windows: [
        'activate generation',
        'rolling backup',
        'exact core',
        'mark activated',
        'settlement',
      ],
    },
  ] as const;

  for (const scenario of C2_SCENARIOS) {
    for (const timing of ['before', 'after'] as const) {
      for (const [index, windowName] of scenario.windows.entries()) {
        it(`recovery ${scenario.name}: conflito ${timing} de ${windowName} para fechado`, async () => {
          const crash = await scenario.create();
          const env = reloaded(crash.harness);
          let now = 0;
          const interleaving = ownerWithTakeoverAt({
            storage: env.storage,
            timing,
            window: index + 1,
            now: () => now,
          });

          const interrupted = await recoverLogicalStorageImportV2({
            runtime: env.runtime,
            adapter: env.adapter,
            storage: env.storage,
            key: KEY,
            ownerToken: interleaving.coordinator,
          });

          expect(interrupted).toMatchObject({
            ok: false,
            reason: 'owner-token-conflict',
            recoveryRequired: true,
          });
          expect(interleaving.executedWindows()).toBe(index + 1);
          expect(JSON.stringify(interrupted)).not.toMatch(
            /owner-import-tab|owner-other-tab|operation-import-window|nonce-other/,
          );

          now = 100;
          const recoveryOwner = createStorageAdminOwnerTokenCoordinator({
            key: KEY,
            storage: env.storage,
            ownerId: 'owner-recovery-tab',
            now: () => now,
            nonceFactory: () => `nonce-recovery-${scenario.name}-${timing}-${index}`,
            operationIdFactory: () => `operation-recovery-${scenario.name}-${timing}-${index}`,
            leaseDurationMs: 100,
            renewWithinMs: 25,
          });
          const recovered = await recoverLogicalStorageImportV2({
            runtime: env.runtime,
            adapter: env.adapter,
            storage: env.storage,
            key: KEY,
            ownerToken: recoveryOwner,
          });

          expect(recovered.ok).toBe(true);
          expect((await env.runtime.inspectStorageAdministration()).unsettledOperations).toEqual([]);
        }, 30_000);
      }
    }
  }
});

// 195–200 — GUARDS DE AUSÊNCIA DE CALL SITE
// ---------------------------------------------------------------------------

// Varre `src/` inteiro procurando quem MENCIONA um identificador.
function sourceFilesMentioning(needle: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (fs.readFileSync(full, 'utf8').includes(needle)) {
        found.push(path.relative(process.cwd(), full).split(path.sep).join('/'));
      }
    }
  };
  walk(path.join(process.cwd(), 'src'));
  return found.sort();
}

// Varre o projeto Android, pulando saída de build.
function androidFilesMentioning(needle: string): string[] {
  const raiz = path.join(process.cwd(), 'android');
  if (!fs.existsSync(raiz)) return [];
  const ignorados = new Set(['build', '.gradle', '.idea', 'node_modules']);
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!ignorados.has(entry.name)) walk(path.join(directory, entry.name));
        continue;
      }
      if (!/\.(java|kt|kts|gradle|xml|json|properties|js|ts|pro)$/.test(entry.name)) continue;
      const full = path.join(directory, entry.name);
      if (fs.readFileSync(full, 'utf8').includes(needle)) {
        found.push(path.relative(process.cwd(), full).split(path.sep).join('/'));
      }
    }
  };
  walk(raiz);
  return found.sort();
}

describe('recuperação da importação v2 — ausência de call site', () => {
  it('195. a recuperação só aparece no módulo, no teste e no boot autorizado', () => {
    // A lista permanece fechada: D1 acrescenta apenas o orquestrador de boot.
    // O 002E-E3 acrescenta o guard estrutural que referencia o nome como string.
    expect(sourceFilesMentioning('recoverLogicalStorageImportV2')).toEqual([
      'src/components/ui/StorageExportControls.guard.test.ts',
      'src/lib/storage-boot-recovery.ts',
      'src/lib/storage-logical-import.test.ts',
      'src/lib/storage-logical-import.ts',
    ]);
  });

  it('196. o resolvedor de reinício também não tem call site', () => {
    expect(sourceFilesMentioning('resolveLogicalImportRestartRecovery')).toEqual([
      'src/lib/storage-logical-import.test.ts',
      'src/lib/storage-logical-import.ts',
    ]);
  });

  it('197. existe exatamente um call site real no boot e nenhum consumidor direto adicional', () => {
    // Independente dos guards 60/195: igualdade exata prova o único consumidor
    // de produção autorizado pelo D1 e falha com qualquer caminho adicional.
    // O 002E-E3 acrescenta o guard estrutural como menção string-only.
    expect(sourceFilesImporting('storage-logical-import')).toEqual([
      'src/lib/storage-boot-recovery.ts',
      'src/lib/storage-logical-import.test.ts',
    ]);
    expect(sourceFilesMentioning('recoverLogicalStorageImportV2')).toEqual([
      'src/components/ui/StorageExportControls.guard.test.ts',
      'src/lib/storage-boot-recovery.ts',
      'src/lib/storage-logical-import.test.ts',
      'src/lib/storage-logical-import.ts',
    ]);
    for (const arquivo of [
      'src/providers/GymFlowContext.tsx',
      'src/lib/storage-hybrid.ts',
      'src/lib/storage.ts',
      'src/lib/storage-adapter.ts',
      'src/lib/storage-admin-runtime.ts',
      'src/lib/storage-indexeddb.ts',
    ]) {
      const fonte = fs.readFileSync(path.join(process.cwd(), arquivo), 'utf8');
      expect([arquivo, fonte.includes('storage-logical-import')]).toEqual([arquivo, false]);
      expect([arquivo, fonte.includes('recoverLogicalStorageImportV2')]).toEqual([arquivo, false]);
    }
    // O AdminPanel EXISTE no projeto — e continua sem saber que a importação
    // ou a recuperação existem.
    const adminPanel = fs.readFileSync(
      path.join(process.cwd(), 'src/modules/AdminPanel.tsx'),
      'utf8',
    );
    expect(adminPanel.includes('storage-logical-import')).toBe(false);
    expect(adminPanel.includes('recoverLogicalStorageImportV2')).toBe(false);
    expect(adminPanel.includes('commitLogicalStorageImportV2')).toBe(false);

    // A importação lógica continua sem call site: só existe sua declaração.
    expect(
      sourceFilesMentioning('commitLogicalStorageImportV2(')
        .filter((arquivo) => !arquivo.endsWith('.test.ts') && !arquivo.endsWith('.test.tsx')),
    ).toEqual(['src/lib/storage-logical-import.ts']);
  });

  it('198. nenhum arquivo Android cita o módulo ou a recuperação', () => {
    expect(androidFilesMentioning('storage-logical-import')).toEqual([]);
    expect(androidFilesMentioning('recoverLogicalStorageImportV2')).toEqual([]);
  });

  it('199. nenhum boot chama a recuperação', () => {
    // A única chamada com parênteses no `src/` inteiro está no teste.
    const chamadores = sourceFilesMentioning('recoverLogicalStorageImportV2(')
      .filter((arquivo) => !arquivo.endsWith('.test.ts') && !arquivo.endsWith('.test.tsx'));
    // O próprio módulo declara a função; ninguém mais a invoca.
    expect(chamadores).toEqual(['src/lib/storage-logical-import.ts']);
    const modulo = importModuleSource();
    // Nenhuma auto-invocação, nenhum efeito de importação.
    expect(modulo).not.toMatch(/^\s*recoverLogicalStorageImportV2\(/m);
    for (const proibido of ['useEffect', 'addEventListener', 'setTimeout', 'setInterval']) {
      expect([proibido, modulo.includes(proibido)]).toEqual([proibido, false]);
    }
  });

  it('200. o módulo continua sem UI, sem download e sem escrita fora do protocolo', () => {
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
      'removeItem',
      'supabase',
    ]) {
      expect([proibido, fonte.includes(proibido)]).toEqual([proibido, false]);
    }
  });

  it('200b. a recuperação não recebe capacidade de CRIAR receipt nem geração', () => {
    // Estes dois `Record` são a prova de verdade, e ela é do compilador: o
    // parâmetro é um `Pick`, então uma capacidade a mais ou a menos aqui já não
    // compila. A importação (C1) recebe `stageHistoryGenerationForOperation` e
    // `beginStorageOperation`; a recuperação, deliberadamente, não recebe
    // NENHUM dos dois — ela não tem o arquivo para colocar dentro de uma
    // geração nova, e uma operação nova seria um journal inventado.
    const adapter: Record<
      keyof Parameters<typeof recoverLogicalStorageImportV2>[0]['adapter'], true
    > = {
      readMetadata: true,
      readStorageAdministrationSnapshot: true,
      readStorageOperationReceipt: true,
      readVerifiedHistoryGeneration: true,
      rollbackToHistoryGeneration: true,
      transitionStorageOperationIfUnambiguous: true,
      clearInactiveGeneration: true,
    };
    const runtime: Record<
      keyof Parameters<typeof recoverLogicalStorageImportV2>[0]['runtime'], true
    > = {
      inspectStorageAdministration: true,
      transitionStorageOperation: true,
      revertStorageOperationSafely: true,
    };

    for (const proibida of ['stageHistoryGenerationForOperation', 'beginStorageOperation']) {
      expect(Object.keys(adapter)).not.toContain(proibida);
      expect(Object.keys(runtime)).not.toContain(proibida);
    }
    expect(Object.keys(adapter)).toHaveLength(7);
    expect(Object.keys(runtime)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 201–214 — RESOLVEDOR DE REINÍCIO PURO
// ---------------------------------------------------------------------------

const RESTART_PREV = 'generation-anterior';
const RESTART_STAGED = 'generation-nova';

function restartCore(generationId: string, savedAt: string): string {
  return JSON.stringify({
    v: 2,
    savedAt,
    data: toPersistedCoreState(defaults([]), generationId),
  });
}

const RESTART_PREVIOUS_CORE = restartCore(RESTART_PREV, '2026-07-26T08:00:00.000Z');
const RESTART_TARGET_CORE = restartCore(RESTART_STAGED, '2026-07-26T11:00:00.000Z');

function makeRestartReceipt(
  overrides: Partial<StorageOperationReceipt> = {},
): StorageOperationReceipt {
  return {
    ...createStorageOperationReceipt({
      operationId: 'operation-1',
      kind: 'import',
      previousCoreRaw: RESTART_PREVIOUS_CORE,
      previousGenerationId: RESTART_PREV,
      createdAt: '2026-07-26T10:00:00.000Z',
      sourceDigest: `sha256:${'b'.repeat(64)}`,
    }),
    ...overrides,
  };
}

function makeRestartObservation(
  overrides: Partial<LogicalImportRestartObservation> = {},
): LogicalImportRestartObservation {
  return {
    receipt: makeRestartReceipt(),
    core: { status: 'read', raw: RESTART_PREVIOUS_CORE },
    metadata: {
      activeGeneration: RESTART_PREV,
      migrationGeneration: null,
      migrationStatus: 'completed',
    },
    generations: [{ generationId: RESTART_PREV }, { generationId: RESTART_STAGED }],
    previousGenerationIntegrity: 'unknown',
    stagedGenerationIntegrity: 'unknown',
    pendingCompletionReceiptCount: 0,
    unsettledOperationCount: 1,
    ...overrides,
  };
}

// Receipt `activating` coerente: os dois mundos nomeados.
function activatingReceipt(): StorageOperationReceipt {
  return makeRestartReceipt({
    status: 'activating',
    stagedGenerationId: RESTART_STAGED,
    targetCoreRaw: RESTART_TARGET_CORE,
  });
}

describe('resolveLogicalImportRestartRecovery — tabela fechada', () => {
  function decide(
    overrides: Partial<LogicalImportRestartObservation>,
  ): LogicalImportRestartDecision {
    return resolveLogicalImportRestartRecovery(makeRestartObservation(overrides));
  }

  it('201. sem receipt não há nada a recuperar', () => {
    expect(decide({ receipt: null })).toEqual({ action: 'no-operation' });
  });

  it('202. receipts terminais são relatados sem reabrir nada', () => {
    expect(decide({ receipt: makeRestartReceipt({ status: 'settled' }) }))
      .toEqual({ action: 'already-settled', operationId: 'operation-1' });
    expect(decide({
      receipt: makeRestartReceipt({ status: 'reverted', stagedGenerationId: RESTART_STAGED }),
    })).toEqual({
      action: 'already-reverted',
      operationId: 'operation-1',
      cleanupGenerationId: RESTART_STAGED,
    });
    // Sem geração preparada conhecida, nada fica pendente de limpeza.
    expect(decide({ receipt: makeRestartReceipt({ status: 'reverted' }) }))
      .toEqual({ action: 'already-reverted', operationId: 'operation-1', cleanupGenerationId: null });
    // A geração ATIVA nunca é candidata a limpeza.
    expect(decide({
      receipt: makeRestartReceipt({ status: 'reverted', stagedGenerationId: RESTART_STAGED }),
      metadata: {
        activeGeneration: RESTART_STAGED,
        migrationGeneration: null,
        migrationStatus: 'completed',
      },
    })).toEqual({ action: 'already-reverted', operationId: 'operation-1', cleanupGenerationId: null });
  });

  it('203. staged sem geração preparada reverte sem limpar', () => {
    expect(decide({})).toEqual({
      action: 'revert-receipt',
      operationId: 'operation-1',
      generationId: null,
      previousGenerationId: RESTART_PREV,
    });
  });

  it('204. staged com geração preparada reverte e limpa', () => {
    expect(decide({ receipt: makeRestartReceipt({ stagedGenerationId: RESTART_STAGED }) }))
      .toEqual({
        action: 'revert-and-cleanup-staging',
        operationId: 'operation-1',
        generationId: RESTART_STAGED,
        previousGenerationId: RESTART_PREV,
      });
  });

  it('205. geração anterior inválida bloqueia a limpeza, mas não a reversão', () => {
    expect(decide({
      receipt: makeRestartReceipt({ stagedGenerationId: RESTART_STAGED }),
      previousGenerationIntegrity: 'invalid',
    })).toEqual({
      action: 'revert-receipt',
      operationId: 'operation-1',
      generationId: RESTART_STAGED,
      previousGenerationId: RESTART_PREV,
    });
  });

  it('206. staged exige o mundo anterior INTACTO para reverter', () => {
    expect(decide({
      metadata: {
        activeGeneration: RESTART_STAGED,
        migrationGeneration: null,
        migrationStatus: 'completed',
      },
    })).toEqual({ action: 'recovery-required', reason: 'active-generation-unexpected' });
    expect(decide({ core: { status: 'read', raw: RESTART_TARGET_CORE } }))
      .toEqual({ action: 'recovery-required', reason: 'core-not-previous' });
  });

  it('207. os quatro mundos do activating', () => {
    const receipt = activatingReceipt();
    const ativo = {
      activeGeneration: RESTART_STAGED,
      migrationGeneration: null,
      migrationStatus: 'completed',
    } as const;

    // MUNDO A
    expect(decide({ receipt })).toEqual({
      action: 'activate-generation',
      operationId: 'operation-1',
      generationId: RESTART_STAGED,
      previousGenerationId: RESTART_PREV,
    });
    // MUNDO B — pede a prova antes de gravar o core.
    expect(decide({ receipt, metadata: ativo }))
      .toEqual({ action: 'verify-target', operationId: 'operation-1', generationId: RESTART_STAGED });
    expect(decide({ receipt, metadata: ativo, stagedGenerationIntegrity: 'verified' }))
      .toEqual({ action: 'commit-target-core', operationId: 'operation-1', generationId: RESTART_STAGED });
    // MUNDO C
    expect(decide({
      receipt,
      metadata: ativo,
      core: { status: 'read', raw: RESTART_TARGET_CORE },
      stagedGenerationIntegrity: 'verified',
    })).toEqual({ action: 'mark-activated', operationId: 'operation-1', generationId: RESTART_STAGED });
    // MUNDO D — core alvo sem ativação não nasce desta ordem de escrita.
    expect(decide({ receipt, core: { status: 'read', raw: RESTART_TARGET_CORE } }))
      .toEqual({ action: 'recovery-required', reason: 'core-target-without-activation' });
  });

  it('208. geração preparada inválida nunca é ativada nem liquidada', () => {
    const receipt = activatingReceipt();
    expect(decide({ receipt, stagedGenerationIntegrity: 'invalid' }))
      .toEqual({ action: 'recovery-required', reason: 'staged-generation-invalid' });
    expect(decide({
      receipt,
      metadata: {
        activeGeneration: RESTART_STAGED,
        migrationGeneration: null,
        migrationStatus: 'completed',
      },
      core: { status: 'read', raw: RESTART_TARGET_CORE },
      stagedGenerationIntegrity: 'invalid',
    })).toEqual({ action: 'recovery-required', reason: 'target-verification-failed' });
  });

  it('209. activated exige prova completa antes de liquidar', () => {
    const base = makeRestartReceipt({
      status: 'activated',
      stagedGenerationId: RESTART_STAGED,
      targetCoreRaw: RESTART_TARGET_CORE,
    });
    const ativo = {
      activeGeneration: RESTART_STAGED,
      migrationGeneration: null,
      migrationStatus: 'completed',
    } as const;

    expect(decide({ receipt: base, metadata: ativo, core: { status: 'read', raw: RESTART_TARGET_CORE } }))
      .toEqual({ action: 'verify-target', operationId: 'operation-1', generationId: RESTART_STAGED });
    expect(decide({
      receipt: base,
      metadata: ativo,
      core: { status: 'read', raw: RESTART_TARGET_CORE },
      stagedGenerationIntegrity: 'verified',
    })).toEqual({ action: 'settle', operationId: 'operation-1' });
    // Sem o mundo alvo aplicado, ninguém liquida e ninguém compensa.
    expect(decide({ receipt: base, core: { status: 'read', raw: RESTART_TARGET_CORE } }))
      .toEqual({ action: 'recovery-required', reason: 'activated-generation-not-active' });
    expect(decide({ receipt: base, metadata: ativo }))
      .toEqual({ action: 'recovery-required', reason: 'activated-core-not-target' });
  });

  it('210. estados impossíveis são separados dos apenas improváveis', () => {
    expect(decide({ receipt: makeRestartReceipt({ targetCoreRaw: RESTART_TARGET_CORE }) }))
      .toEqual({ action: 'impossible-state', reason: 'staged-with-target-core' });
    expect(decide({ receipt: makeRestartReceipt({ status: 'activating' }) }))
      .toEqual({ action: 'impossible-state', reason: 'activating-without-staging' });
    expect(decide({
      receipt: makeRestartReceipt({ status: 'activating', stagedGenerationId: RESTART_STAGED }),
    })).toEqual({ action: 'impossible-state', reason: 'activating-without-target-core' });
    expect(decide({
      receipt: makeRestartReceipt({ status: 'activated', stagedGenerationId: RESTART_STAGED }),
    })).toEqual({ action: 'impossible-state', reason: 'activated-target-missing' });
    expect(decide({ generations: [{ generationId: RESTART_STAGED }] }))
      .toEqual({ action: 'impossible-state', reason: 'previous-generation-absent' });
    expect(decide({ receipt: makeRestartReceipt({ stagedGenerationId: 'generation-fantasma' }) }))
      .toEqual({ action: 'impossible-state', reason: 'staged-generation-absent' });
    expect(decide({ receipt: makeRestartReceipt({ stagedGenerationId: RESTART_PREV }) }))
      .toEqual({ action: 'impossible-state', reason: 'staged-generation-is-previous' });
  });

  it('211. as pré-condições globais bloqueiam antes de qualquer decisão', () => {
    expect(decide({ receipt: makeRestartReceipt({ kind: 'restore' }) }))
      .toEqual({ action: 'recovery-required', reason: 'not-an-import' });
    expect(decide({ unsettledOperationCount: 2 }))
      .toEqual({ action: 'recovery-required', reason: 'multiple-unsettled-operations' });
    expect(decide({ pendingCompletionReceiptCount: 1 }))
      .toEqual({ action: 'recovery-required', reason: 'completion-pending' });
    expect(decide({ core: { status: 'unavailable' } }))
      .toEqual({ action: 'recovery-required', reason: 'core-unreadable' });
    expect(decide({ core: { status: 'read', raw: null } }))
      .toEqual({ action: 'recovery-required', reason: 'core-missing' });
    expect(decide({ core: { status: 'read', raw: '{"v":1,"savedAt":"x","data":{}}' } }))
      .toEqual({ action: 'recovery-required', reason: 'core-not-v2' });
    expect(decide({
      metadata: {
        activeGeneration: RESTART_PREV,
        migrationGeneration: null,
        migrationStatus: 'in-progress',
      },
    })).toEqual({ action: 'recovery-required', reason: 'migration-incomplete' });
    expect(decide({
      metadata: {
        activeGeneration: RESTART_PREV,
        migrationGeneration: RESTART_STAGED,
        migrationStatus: 'completed',
      },
    })).toEqual({ action: 'recovery-required', reason: 'unexpected-staging-pointer' });
  });

  it('212. o core alvo do journal é conferido antes de qualquer decisão que o grave', () => {
    for (const alvo of [
      '{"v":1,"savedAt":"2026-07-26T11:00:00.000Z","data":{}}',
      'não é json',
      // Envelope v2 válido, mas apontando para a geração errada.
      restartCore(RESTART_PREV, '2026-07-26T11:00:00.000Z'),
      // Instante não canônico.
      restartCore(RESTART_STAGED, '2026-07-26T11:00:00Z'),
    ]) {
      const receipt = makeRestartReceipt({
        status: 'activating',
        stagedGenerationId: RESTART_STAGED,
        targetCoreRaw: alvo,
      });
      expect([alvo, decide({ receipt })])
        .toEqual([alvo, { action: 'recovery-required', reason: 'target-core-invalid' }]);
    }
  });

  it('213. o resolvedor de reinício é puro e determinístico', () => {
    const observacao = makeRestartObservation({ receipt: activatingReceipt() });
    const antes = JSON.stringify(observacao);
    const primeira = resolveLogicalImportRestartRecovery(observacao);
    expect(resolveLogicalImportRestartRecovery(observacao)).toEqual(primeira);
    expect(resolveLogicalImportRestartRecovery(makeRestartObservation({
      receipt: activatingReceipt(),
    }))).toEqual(primeira);
    expect(JSON.stringify(observacao)).toBe(antes);
    // O resolvedor do C1 continua intocado e independente.
    expect(resolveLogicalImportRecovery(makeObservation({}))).toEqual(
      resolveLogicalImportRecovery(makeObservation({})),
    );
  });

  it('214. a varredura combinatória só produz ações da união fechada', () => {
    const ACOES = new Set([
      'no-operation', 'already-settled', 'already-reverted', 'revert-receipt',
      'revert-and-cleanup-staging', 'activate-generation', 'commit-target-core',
      'verify-target', 'mark-activated', 'settle', 'recovery-required', 'impossible-state',
    ]);
    const observadas = new Set<string>();
    const cores = [
      { status: 'read', raw: RESTART_PREVIOUS_CORE },
      { status: 'read', raw: RESTART_TARGET_CORE },
      { status: 'read', raw: restartCore('generation-terceira', '2026-07-26T12:00:00.000Z') },
      { status: 'read', raw: null },
      { status: 'unavailable' },
    ] as const;
    const ativas = [RESTART_PREV, RESTART_STAGED, 'generation-terceira', null];
    const statuses = ['staged', 'activating', 'activated', 'settled', 'reverted'] as const;
    const preparadas = [null, RESTART_STAGED, RESTART_PREV, 'generation-fantasma'];
    const alvos = [null, RESTART_TARGET_CORE];
    const integridades = ['unknown', 'verified', 'invalid'] as const;

    let combinacoes = 0;
    for (const core of cores) {
      for (const activeGeneration of ativas) {
        for (const status of statuses) {
          for (const stagedGenerationId of preparadas) {
            for (const targetCoreRaw of alvos) {
              for (const stagedGenerationIntegrity of integridades) {
                combinacoes += 1;
                const decisao = resolveLogicalImportRestartRecovery(makeRestartObservation({
                  receipt: makeRestartReceipt({ status, stagedGenerationId, targetCoreRaw }),
                  core,
                  metadata: {
                    activeGeneration,
                    migrationGeneration: null,
                    migrationStatus: 'completed',
                  },
                  stagedGenerationIntegrity,
                }));
                observadas.add(decisao.action);
                expect([decisao.action, ACOES.has(decisao.action)])
                  .toEqual([decisao.action, true]);
                // Nenhuma ação com efeito nasce de um mundo que não a justifica.
                if (decisao.action === 'commit-target-core' || decisao.action === 'mark-activated') {
                  expect(stagedGenerationIntegrity).toBe('verified');
                  expect(activeGeneration).toBe(RESTART_STAGED);
                }
                if (decisao.action === 'activate-generation') {
                  expect(activeGeneration).toBe(RESTART_PREV);
                  expect(core.status === 'read' && core.raw).toBe(RESTART_PREVIOUS_CORE);
                }
                if (decisao.action === 'revert-and-cleanup-staging') {
                  expect(status).toBe('staged');
                  expect(decisao.generationId).not.toBe(RESTART_PREV);
                  expect(activeGeneration).toBe(RESTART_PREV);
                }
                if (decisao.action === 'settle') {
                  expect(status).toBe('activated');
                  expect(activeGeneration).toBe(RESTART_STAGED);
                  expect(core.status === 'read' && core.raw).toBe(RESTART_TARGET_CORE);
                }
              }
            }
          }
        }
      }
    }
    expect(combinacoes).toBe(2_400);
    // A varredura não é vazia: toda ação com efeito foi exercitada de verdade.
    for (const acao of [
      'already-settled', 'already-reverted', 'revert-receipt', 'revert-and-cleanup-staging',
      'activate-generation', 'commit-target-core', 'verify-target', 'mark-activated',
      'settle', 'recovery-required', 'impossible-state',
    ]) {
      expect([acao, observadas.has(acao)]).toEqual([acao, true]);
    }
  });
});
