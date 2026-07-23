import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import type { WorkoutSession } from '../types';
import { STORAGE_BACKUP_SUFFIX } from './storage';
import {
  HYBRID_CORE_BACKUP_SUFFIX,
  HybridStorageIntegrityError,
  canUseLegacyAdminOperations,
  commitHybridWorkoutSession,
  createHybridStorageRuntime,
  parsePhysicalEnvelope,
  toPersistedCoreState,
} from './storage-hybrid';
import {
  COMPLETION_RECEIPTS_STORE,
  GENERATION_MANIFESTS_STORE,
  GYMFLOW_INDEXEDDB_VERSION,
  IndexedDbWorkoutHistoryStorage,
  METADATA_STORE,
  WORKOUT_HISTORY_STORE,
} from './storage-indexeddb';
import {
  type WorkoutCompletionEffects,
  createWorkoutCompletionReceipt,
} from './storage-completion-receipt';
import {
  EMPTY_GENERATION_DIGEST,
  digestWorkoutSession,
} from './storage-history-integrity';
import {
  HYBRID_STORAGE_VERSION,
  MONOLITHIC_STORAGE_VERSION,
  type PersistedCoreState,
  type PersistedState,
  type StorageLike,
} from './storage-types';
import { parseEnvelope } from './storage-validation';

const KEY = 'gymflow:state:v1';
let databaseSequence = 0;

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  failNextV2MainWrite = false;
  failNextLegacyBackupWrite = false;
  corruptNextV2Readback = false;

  getItem(key: string): string | null {
    const value = this.values.get(key) ?? null;
    if (
      this.corruptNextV2Readback
      && key === KEY
      && value?.includes(`"v":${HYBRID_STORAGE_VERSION}`)
    ) {
      this.corruptNextV2Readback = false;
      return '{"v":2,"readback":"corrompido"}';
    }
    return value;
  }

  setItem(key: string, value: string): void {
    if (this.failNextLegacyBackupWrite && key === `${KEY}${STORAGE_BACKUP_SUFFIX}`) {
      this.failNextLegacyBackupWrite = false;
      throw new Error('falha induzida no backup v1');
    }
    if (
      this.failNextV2MainWrite
      && key === KEY
      && value.includes(`"v":${HYBRID_STORAGE_VERSION}`)
    ) {
      this.failNextV2MainWrite = false;
      throw new Error('falha induzida no commit v2');
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
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
    prsDetected: index % 10 === 0 ? ['Supino +2,5 kg'] : [],
    sourceProgramId: 'program-1',
    sourceProgramDayId: 'day-1',
    sourceProgramName: 'Programa multi-dia',
    sourceProgramDayName: 'Dia 1 — Peito',
    status: 'completed',
    startedAt,
    endedAt: startedAt + 3_600_000,
    exercises: [{
      id: `entry-${index}`,
      exerciseId: 'replacement-exercise',
      name: 'Remada articulada',
      muscleGroup: 'back',
      notes: 'Cadência controlada e amplitude confortável.',
      repRange: [8, 12],
      targetRPE: 8,
      restSec: 90,
      progressionNote: 'Aumentar 2,5 kg ao fechar a faixa.',
      plannedSlotIndex: 0,
      plannedExerciseId: 'planned-exercise',
      entryOrigin: 'swapped',
      entryStatus: 'performed',
      plannedExerciseName: 'Puxada alta',
      plannedMuscleGroup: 'back',
      swapReasonCode: 'equipment-unavailable',
      swapReasonNote: 'Equipamento ocupado.',
      swappedAt: startedAt + 120_000,
      sets: [{
        id: `set-${index}`,
        reps: 10,
        weight: 62.5,
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

function v1Envelope(state: Partial<PersistedState>): string {
  return JSON.stringify({
    v: MONOLITHIC_STORAGE_VERSION,
    savedAt: '2026-07-23T10:00:00.000Z',
    data: state,
  });
}

function createHarness(options: {
  storage?: MemoryStorage;
  factory?: IDBFactory;
  generationIdFactory?: () => string;
} = {}) {
  const storage = options.storage ?? new MemoryStorage();
  const factory = options.factory ?? new IDBFactory();
  const name = `gymflow-hybrid-${databaseSequence += 1}`;
  const adapter = new IndexedDbWorkoutHistoryStorage({
    factory,
    databaseName: name,
    generationIdFactory: options.generationIdFactory ?? (() => 'generation-1'),
    now: () => new Date('2026-07-23T11:00:00.000Z'),
  });
  const runtime = createHybridStorageRuntime({
    key: KEY,
    storage,
    adapter,
    defaults: defaults(),
    now: () => new Date('2026-07-23T12:00:00.000Z'),
  });
  return { storage, factory, name, adapter, runtime };
}

function openRawDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  const request = factory.open(name, GYMFLOW_INDEXEDDB_VERSION);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function rawRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Corrompe o banco por fora do adapter para simular perda física real.
async function mutateRawDatabase(
  factory: IDBFactory,
  name: string,
  stores: string[],
  mutate: (transaction: IDBTransaction) => Promise<void>,
): Promise<void> {
  const database = await openRawDatabase(factory, name);
  const transaction = database.transaction(stores, 'readwrite');
  const completed = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => undefined;
  });
  await mutate(transaction);
  await completed;
  database.close();
}

function reloadRuntime(harness: ReturnType<typeof createHarness>) {
  return createHybridStorageRuntime({
    key: KEY,
    storage: harness.storage,
    adapter: harness.adapter,
    defaults: defaults(),
    now: () => new Date('2026-07-23T12:00:00.000Z'),
  });
}

function expectV2WithoutHistory(raw: string | null, expectedGeneration?: string) {
  expect(raw).not.toBeNull();
  const parsed = parsePhysicalEnvelope(raw as string);
  expect(parsed.status).toBe('v2');
  if (parsed.status !== 'v2') return;
  expect(Object.prototype.hasOwnProperty.call(parsed.envelope.data, 'workoutHistory')).toBe(false);
  expect(JSON.stringify(parsed.envelope.data)).not.toContain('workoutHistory');
  if (expectedGeneration) {
    expect(parsed.envelope.data.historyStorage.generationId).toBe(expectedGeneration);
  }
}

describe('runtime híbrido v2', () => {
  it.each([0, 1, 100, 500, 1_000])(
    'faz cutover verificável de v1 com %i sessões',
    async (size) => {
      const { storage, adapter, runtime } = createHarness();
      const history = Array.from({ length: size }, (_, index) => makeSession(index));
      const raw = v1Envelope(defaults(history));
      storage.setItem(KEY, raw);

      const result = await runtime.hydrate();
      expect(result.mode).toBe('hybrid-v2');
      if (result.mode !== 'hybrid-v2') return;
      expect(result.state.workoutHistory).toEqual(history);
      expect(await adapter.readActiveHistory()).toEqual(history);
      expect(await adapter.readMetadata()).toMatchObject({
        activeGeneration: result.generationId,
        migrationGeneration: null,
        migrationStatus: 'completed',
        sourceStorageVersion: 1,
      });
      expect(await adapter.readLegacySnapshot()).toMatchObject({ raw, verified: true });
      expect(storage.getItem(`${KEY}${STORAGE_BACKUP_SUFFIX}`)).toBe(raw);
      expectV2WithoutHistory(storage.getItem(KEY), result.generationId);
      await runtime.close();
    },
    30_000,
  );

  it('faz o parser v1 antigo rejeitar o envelope v2 como versão incompatível', async () => {
    const { storage, runtime } = createHarness();
    storage.setItem(KEY, v1Envelope(defaults([makeSession(1)])));
    expect((await runtime.hydrate()).mode).toBe('hybrid-v2');

    const oldParser = parseEnvelope<PersistedState>(storage.getItem(KEY) as string);
    expect(oldParser).toEqual({ status: 'unsupported-version', version: 2 });
    await runtime.close();
  });

  it('retoma um cutover interrompido sem duplicar a geração', async () => {
    let generations = 0;
    const storage = new MemoryStorage();
    const raw = v1Envelope(defaults([makeSession(1), makeSession(2)]));
    storage.setItem(KEY, raw);
    storage.failNextV2MainWrite = true;
    const harness = createHarness({
      storage,
      generationIdFactory: () => `generation-${generations += 1}`,
    });

    const interrupted = await harness.runtime.hydrate();
    expect(interrupted.mode).toBe('blocked');
    expect(storage.getItem(KEY)).toBe(raw);
    expect(storage.getItem(`${KEY}${STORAGE_BACKUP_SUFFIX}`)).toBe(raw);

    const resumedRuntime = createHybridStorageRuntime({
      key: KEY,
      storage,
      adapter: harness.adapter,
      defaults: defaults(),
      now: () => new Date('2026-07-23T12:30:00.000Z'),
    });
    const resumed = await resumedRuntime.hydrate();
    expect(resumed).toMatchObject({ mode: 'hybrid-v2', generationId: 'generation-1' });
    expect(generations).toBe(1);
    expect((await harness.adapter.readActiveHistory()).map((session) => session.id))
      .toEqual(['session-1', 'session-2']);
    await resumedRuntime.close();
  });

  it('mantém v1 principal quando o backup bruto falha', async () => {
    const { storage, runtime } = createHarness();
    const raw = v1Envelope(defaults([makeSession(1)]));
    storage.setItem(KEY, raw);
    storage.failNextLegacyBackupWrite = true;

    await expect(runtime.hydrate()).resolves.toMatchObject({ mode: 'blocked' });
    expect(storage.getItem(KEY)).toBe(raw);
    expect(storage.getItem(`${KEY}${STORAGE_BACKUP_SUFFIX}`)).toBeNull();
    await runtime.close();
  });

  it('faz rollback para v1 quando o readback v2 diverge', async () => {
    const { storage, runtime } = createHarness();
    const raw = v1Envelope(defaults([makeSession(1)]));
    storage.setItem(KEY, raw);
    storage.corruptNextV2Readback = true;

    await expect(runtime.hydrate()).resolves.toMatchObject({ mode: 'blocked' });
    expect(storage.getItem(KEY)).toBe(raw);
    expect(storage.getItem(`${KEY}${STORAGE_BACKUP_SUFFIX}`)).toBe(raw);
    await runtime.close();
  });

  it('mantém v1 e bloqueia quando a migração rejeita IDs duplicados', async () => {
    const { storage, runtime } = createHarness();
    const raw = v1Envelope(defaults([
      makeSession(1, { id: 'duplicada' }),
      makeSession(2, { id: 'duplicada' }),
    ]));
    storage.setItem(KEY, raw);

    await expect(runtime.hydrate()).resolves.toMatchObject({ mode: 'blocked' });
    expect(storage.getItem(KEY)).toBe(raw);
    await runtime.close();
  });

  it('inicializa instalação nova em v2 sem fabricar snapshot v1', async () => {
    const { storage, adapter, runtime } = createHarness();
    const result = await runtime.hydrate();

    expect(result).toMatchObject({ mode: 'hybrid-v2', state: { workoutHistory: [] } });
    expect(await adapter.readLegacySnapshot()).toBeNull();
    expect(await adapter.readMetadata()).toMatchObject({
      migrationStatus: 'completed',
      sourceStorageVersion: null,
    });
    expect(storage.getItem(`${KEY}${STORAGE_BACKUP_SUFFIX}`)).toBeNull();
    expectV2WithoutHistory(storage.getItem(KEY));
    await runtime.close();
  });

  it('mantém instalação nova em legacy-v1 quando IndexedDB não está disponível', async () => {
    const storage = new MemoryStorage();
    const adapter = new IndexedDbWorkoutHistoryStorage({
      factory: undefined,
      databaseName: `gymflow-unavailable-${databaseSequence += 1}`,
    });
    const runtime = createHybridStorageRuntime({
      key: KEY,
      storage,
      adapter,
      defaults: defaults(),
    });

    await expect(runtime.hydrate()).resolves.toMatchObject({
      mode: 'legacy-v1',
      reason: 'indexeddb-unavailable',
      physicalVersion: null,
    });
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('mantém v1 como fallback quando IndexedDB está indisponível antes do cutover', async () => {
    const storage = new MemoryStorage();
    const state = defaults([makeSession(1)]);
    storage.setItem(KEY, v1Envelope(state));
    const adapter = new IndexedDbWorkoutHistoryStorage({ factory: undefined });
    const runtime = createHybridStorageRuntime({ key: KEY, storage, adapter, defaults: defaults() });

    await expect(runtime.hydrate()).resolves.toMatchObject({
      mode: 'legacy-v1',
      state: { workoutHistory: state.workoutHistory },
      physicalVersion: 1,
    });
    expect(parsePhysicalEnvelope(storage.getItem(KEY) as string).status).toBe('v1');
  });

  it('bloqueia v2 quando IndexedDB fica indisponível', async () => {
    const { storage, runtime } = createHarness();
    storage.setItem(KEY, v1Envelope(defaults([makeSession(1)])));
    expect((await runtime.hydrate()).mode).toBe('hybrid-v2');
    await runtime.close();

    const unavailable = createHybridStorageRuntime({
      key: KEY,
      storage,
      adapter: new IndexedDbWorkoutHistoryStorage({ factory: undefined }),
      defaults: defaults(),
    });
    await expect(unavailable.hydrate()).resolves.toMatchObject({
      mode: 'blocked',
      physicalVersion: 2,
      issue: { kind: 'unavailable' },
    });
  });

  it('bloqueia mismatch entre generationId do core e metadata', async () => {
    const { storage, adapter, runtime } = createHarness();
    storage.setItem(KEY, v1Envelope(defaults([makeSession(1)])));
    expect((await runtime.hydrate()).mode).toBe('hybrid-v2');
    const parsed = JSON.parse(storage.getItem(KEY) as string) as {
      data: { historyStorage: { generationId: string } };
    };
    parsed.data.historyStorage.generationId = 'generation-divergente';
    storage.setItem(KEY, JSON.stringify(parsed));

    const reloaded = createHybridStorageRuntime({
      key: KEY,
      storage,
      adapter,
      defaults: defaults(),
    });
    await expect(reloaded.hydrate()).resolves.toMatchObject({
      mode: 'blocked',
      physicalVersion: 2,
    });
    await reloaded.close();
  });

  it('bloqueia envelope v2 sem generationId', async () => {
    const { storage, runtime } = createHarness();
    storage.setItem(KEY, JSON.stringify({
      v: HYBRID_STORAGE_VERSION,
      savedAt: '2026-07-23T12:00:00.000Z',
      data: {
        ...defaults(),
        workoutHistory: undefined,
        historyStorage: {
          backend: 'indexeddb',
          schemaVersion: 1,
          generationId: '',
        },
      },
    }));

    await expect(runtime.hydrate()).resolves.toMatchObject({
      mode: 'blocked',
      physicalVersion: 2,
      issue: { kind: 'corrupt' },
    });
    await runtime.close();
  });

  it('bloqueia v2 quando a leitura do histórico falha', async () => {
    const { storage, adapter, runtime } = createHarness();
    storage.setItem(KEY, v1Envelope(defaults([makeSession(1)])));
    expect((await runtime.hydrate()).mode).toBe('hybrid-v2');
    await runtime.close();
    vi.spyOn(adapter, 'readHistoryGenerationSnapshot').mockRejectedValueOnce(new Error('leitura falhou'));

    const reloaded = createHybridStorageRuntime({
      key: KEY,
      storage,
      adapter,
      defaults: defaults(),
    });
    await expect(reloaded.hydrate()).resolves.toMatchObject({
      mode: 'blocked',
      issue: { kind: 'verification' },
    });
    await reloaded.close();
  });

  it('bloqueia quando a geração some fisicamente em vez de hidratar histórico vazio', async () => {
    const harness = createHarness();
    harness.storage.setItem(KEY, v1Envelope(defaults([makeSession(2), makeSession(1)])));
    expect((await harness.runtime.hydrate()).mode).toBe('hybrid-v2');
    await harness.runtime.close();

    await mutateRawDatabase(
      harness.factory,
      harness.name,
      [WORKOUT_HISTORY_STORE, METADATA_STORE, GENERATION_MANIFESTS_STORE],
      async (transaction) => {
        const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
        const keys = await rawRequest(historyStore.index('byGeneration').getAllKeys('generation-1'));
        await Promise.all(keys.map((key) => rawRequest(historyStore.delete(key))));
        await rawRequest(transaction.objectStore(GENERATION_MANIFESTS_STORE).delete('generation-1'));
        await rawRequest(transaction.objectStore(METADATA_STORE)
          .delete('generationNextOrder:generation-1'));
      },
    );

    const reloaded = reloadRuntime(harness);
    const result = await reloaded.hydrate();
    expect(result).toMatchObject({ mode: 'blocked', physicalVersion: 2 });
    if (result.mode === 'blocked') {
      expect(result.issue.message).toContain('generation-absent');
    }
    await reloaded.close();
  });

  it('bloqueia quando parte dos registros da geração se perde', async () => {
    const harness = createHarness();
    harness.storage.setItem(KEY, v1Envelope(defaults([makeSession(3), makeSession(2), makeSession(1)])));
    expect((await harness.runtime.hydrate()).mode).toBe('hybrid-v2');
    await harness.runtime.close();

    await mutateRawDatabase(
      harness.factory,
      harness.name,
      [WORKOUT_HISTORY_STORE],
      async (transaction) => {
        const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
        const keys = await rawRequest(historyStore.index('byGeneration').getAllKeys('generation-1'));
        await rawRequest(historyStore.delete(keys[0]));
      },
    );

    const reloaded = reloadRuntime(harness);
    const result = await reloaded.hydrate();
    expect(result).toMatchObject({ mode: 'blocked', physicalVersion: 2 });
    if (result.mode === 'blocked') {
      expect(result.issue.message).toContain('session-count-mismatch');
    }
    await reloaded.close();
  });

  it('bloqueia quando o manifest da geração some', async () => {
    const harness = createHarness();
    harness.storage.setItem(KEY, v1Envelope(defaults([makeSession(1)])));
    expect((await harness.runtime.hydrate()).mode).toBe('hybrid-v2');
    await harness.runtime.close();

    await mutateRawDatabase(
      harness.factory,
      harness.name,
      [GENERATION_MANIFESTS_STORE],
      async (transaction) => {
        await rawRequest(transaction.objectStore(GENERATION_MANIFESTS_STORE).delete('generation-1'));
      },
    );

    const reloaded = reloadRuntime(harness);
    const result = await reloaded.hydrate();
    expect(result).toMatchObject({ mode: 'blocked', physicalVersion: 2 });
    if (result.mode === 'blocked') {
      expect(result.issue.message).toContain('manifest-absent');
    }
    await reloaded.close();
  });

  it('bloqueia quando o manifest é adulterado', async () => {
    const harness = createHarness();
    harness.storage.setItem(KEY, v1Envelope(defaults([makeSession(2), makeSession(1)])));
    expect((await harness.runtime.hydrate()).mode).toBe('hybrid-v2');
    await harness.runtime.close();

    await mutateRawDatabase(
      harness.factory,
      harness.name,
      [GENERATION_MANIFESTS_STORE],
      async (transaction) => {
        const store = transaction.objectStore(GENERATION_MANIFESTS_STORE);
        const manifest = await rawRequest(store.get('generation-1')) as Record<string, unknown>;
        await rawRequest(store.put({ ...manifest, orderedDigest: 'sha256:adulterado' }));
      },
    );

    const reloaded = reloadRuntime(harness);
    const result = await reloaded.hydrate();
    expect(result).toMatchObject({ mode: 'blocked', physicalVersion: 2 });
    if (result.mode === 'blocked') {
      expect(result.issue.message).toContain('ordered-digest-mismatch');
    }
    await reloaded.close();
  });

  it('hidrata geração vazia válida com manifest verificado', async () => {
    const harness = createHarness();
    harness.storage.setItem(KEY, v1Envelope(defaults([])));
    expect((await harness.runtime.hydrate()).mode).toBe('hybrid-v2');
    await harness.runtime.close();

    await harness.adapter.open();
    expect(await harness.adapter.readGenerationManifest('generation-1')).toMatchObject({
      sessionCount: 0,
      orderedDigest: EMPTY_GENERATION_DIGEST,
      verified: true,
    });

    const reloaded = reloadRuntime(harness);
    const result = await reloaded.hydrate();
    expect(result).toMatchObject({ mode: 'hybrid-v2', generationId: 'generation-1' });
    if (result.mode === 'hybrid-v2') expect(result.state.workoutHistory).toEqual([]);
    await reloaded.close();
  });

  it('combina core e histórico apenas em memória na hidratação v2', async () => {
    const { storage, adapter, runtime } = createHarness();
    const history = [makeSession(8), makeSession(2)];
    storage.setItem(KEY, v1Envelope({ ...defaults(history), favoriteExercises: ['exercise-1'] }));
    expect((await runtime.hydrate()).mode).toBe('hybrid-v2');

    const reloaded = createHybridStorageRuntime({
      key: KEY,
      storage,
      adapter,
      defaults: defaults(),
    });
    const result = await reloaded.hydrate();
    expect(result).toMatchObject({
      mode: 'hybrid-v2',
      state: {
        favoriteExercises: ['exercise-1'],
        workoutHistory: history,
      },
    });
    expectV2WithoutHistory(storage.getItem(KEY));
    await reloaded.close();
  });

  it('faz append incremental newest-first sem reordenar por datas', async () => {
    const { storage, adapter, runtime } = createHarness();
    const older = makeSession(1, { date: '2030-01-01' });
    const newest = makeSession(2, { date: '2020-01-01' });
    storage.setItem(KEY, v1Envelope(defaults([older])));
    expect((await runtime.hydrate()).mode).toBe('hybrid-v2');

    await expect(runtime.appendSession(newest)).resolves.toMatchObject({ status: 'appended' });
    expect((await adapter.readActiveHistory()).map((session) => session.id))
      .toEqual([newest.id, older.id]);
    expectV2WithoutHistory(storage.getItem(KEY));
    await runtime.close();
  });

  it('trata duplicate idêntico como retomada e divergente como integridade', async () => {
    const { storage, runtime } = createHarness();
    const session = makeSession(1);
    storage.setItem(KEY, v1Envelope(defaults([session])));
    expect((await runtime.hydrate()).mode).toBe('hybrid-v2');

    await expect(runtime.appendSession(session)).resolves.toMatchObject({ status: 'resumed' });
    await expect(runtime.appendSession({ ...session, name: 'Conteúdo divergente' }))
      .rejects.toBeInstanceOf(HybridStorageIntegrityError);
    await runtime.close();
  });

  it('não executa callbacks de sucesso quando o append falha', async () => {
    const { storage, adapter, runtime } = createHarness();
    storage.setItem(KEY, v1Envelope(defaults()));
    expect((await runtime.hydrate()).mode).toBe('hybrid-v2');
    vi.spyOn(adapter, 'appendSession').mockRejectedValueOnce(new Error('append rejeitado'));
    const onAppended = vi.fn();
    const onResumed = vi.fn();

    await expect(commitHybridWorkoutSession(runtime, makeSession(1), { onAppended, onResumed }))
      .rejects.toThrow('append rejeitado');
    expect(onAppended).not.toHaveBeenCalled();
    expect(onResumed).not.toHaveBeenCalled();
    await runtime.close();
  });

  it('reconcilia append confirmado com core antigo sem duplicar efeitos', async () => {
    const active = makeSession(1, {
      duration: 0,
      calories: 0,
      xpEarned: 0,
      totalVolume: undefined,
      prsDetected: undefined,
      status: 'active',
      endedAt: undefined,
      exercises: makeSession(1).exercises.map((exercise) => {
        const { entryStatus, ...withoutStatus } = exercise;
        void entryStatus;
        return withoutStatus;
      }),
    });
    const terminal = makeSession(1);
    const { storage, adapter, runtime } = createHarness();
    storage.setItem(KEY, v1Envelope({
      ...defaults(),
      activeWorkout: active,
      activeWorkoutStartedAt: active.startedAt ?? null,
    }));
    const first = await runtime.hydrate();
    expect(first.mode).toBe('hybrid-v2');
    await adapter.appendSession(terminal);
    await runtime.close();

    const reloaded = createHybridStorageRuntime({
      key: KEY,
      storage,
      adapter,
      defaults: defaults(),
    });
    const recovered = await reloaded.hydrate();
    expect(recovered).toMatchObject({
      mode: 'hybrid-v2',
      reconciledCompletion: true,
      state: {
        activeWorkout: null,
        activeWorkoutStartedAt: null,
        workoutHistory: [terminal],
      },
    });
    const persisted = parsePhysicalEnvelope(storage.getItem(KEY) as string);
    expect(persisted.status).toBe('v2');
    if (persisted.status === 'v2') expect(persisted.envelope.data.activeWorkout).toBeNull();
    await reloaded.close();
  });

  it('bloqueia reconciliação quando a sessão terminal diverge do activeWorkout', async () => {
    const active = makeSession(1, {
      status: 'active',
      endedAt: undefined,
      duration: 0,
      calories: 0,
      xpEarned: 0,
      exercises: [],
    });
    const { storage, adapter, runtime } = createHarness();
    storage.setItem(KEY, v1Envelope({
      ...defaults(),
      activeWorkout: active,
      activeWorkoutStartedAt: active.startedAt ?? null,
    }));
    expect((await runtime.hydrate()).mode).toBe('hybrid-v2');
    await adapter.appendSession(makeSession(1, { name: 'Outro conteúdo' }));
    await runtime.close();

    const reloaded = createHybridStorageRuntime({
      key: KEY,
      storage,
      adapter,
      defaults: defaults(),
    });
    await expect(reloaded.hydrate()).resolves.toMatchObject({ mode: 'blocked' });
    await reloaded.close();
  });

  it('deduplica cutover concorrente como no segundo efeito do Strict Mode', async () => {
    let generations = 0;
    const storage = new MemoryStorage();
    storage.setItem(KEY, v1Envelope(defaults([makeSession(1)])));
    const factory = new IDBFactory();
    const adapter = new IndexedDbWorkoutHistoryStorage({
      factory,
      databaseName: `gymflow-strict-${databaseSequence += 1}`,
      generationIdFactory: () => `generation-${generations += 1}`,
    });
    const first = createHybridStorageRuntime({ key: KEY, storage, adapter, defaults: defaults() });
    const second = createHybridStorageRuntime({ key: KEY, storage, adapter, defaults: defaults() });

    const [left, right] = await Promise.all([first.hydrate(), second.hydrate()]);
    expect(left).toMatchObject({ mode: 'hybrid-v2', generationId: 'generation-1' });
    expect(right).toMatchObject({ mode: 'hybrid-v2', generationId: 'generation-1' });
    expect(generations).toBe(1);
    expect(await adapter.count()).toBe(1);
    await first.close();
    await second.close();
  });

  it('autosave v2 serializa somente o core e mantém backup próprio verificado', async () => {
    const { storage, runtime } = createHarness();
    const history = [makeSession(1)];
    storage.setItem(KEY, v1Envelope(defaults(history)));
    const hydrated = await runtime.hydrate();
    expect(hydrated.mode).toBe('hybrid-v2');
    if (hydrated.mode !== 'hybrid-v2') return;
    const rawBefore = storage.getItem(KEY);

    const updated = { ...hydrated.state, workoutHistory: [makeSession(999)], favoriteExercises: ['x'] };
    const saved = runtime.saveCore(updated);
    expect(saved.ok).toBe(true);
    const rawAfter = storage.getItem(KEY) as string;
    expect(rawAfter).not.toContain('session-999');
    expect(rawAfter).not.toContain('workoutHistory');
    expect(storage.getItem(`${KEY}${HYBRID_CORE_BACKUP_SUFFIX}`)).toBe(rawBefore);
    expect(parsePhysicalEnvelope(storage.getItem(`${KEY}${HYBRID_CORE_BACKUP_SUFFIX}`) as string).status)
      .toBe('v2');
    expect(storage.getItem(`${KEY}${STORAGE_BACKUP_SUFFIX}`)).toBe(
      v1Envelope(defaults(history)),
    );
    await runtime.close();
  });

  it('bloqueia operações administrativas antigas somente para estado v2', () => {
    expect(canUseLegacyAdminOperations('legacy-v1', 1)).toBe(true);
    expect(canUseLegacyAdminOperations('blocked', 1)).toBe(true);
    expect(canUseLegacyAdminOperations('hybrid-v2', 2)).toBe(false);
    expect(canUseLegacyAdminOperations('blocked', 2)).toBe(false);
  });

  it('bloqueia JSON inválido e versão física desconhecida sem sobrescrever', async () => {
    const corrupt = createHarness();
    corrupt.storage.setItem(KEY, '{inválido');
    await expect(corrupt.runtime.hydrate()).resolves.toMatchObject({
      mode: 'blocked',
      issue: { kind: 'corrupt' },
    });
    expect(corrupt.storage.getItem(KEY)).toBe('{inválido');

    const unsupported = createHarness();
    unsupported.storage.setItem(KEY, JSON.stringify({ v: 99, savedAt: new Date().toISOString(), data: {} }));
    await expect(unsupported.runtime.hydrate()).resolves.toMatchObject({
      mode: 'blocked',
      physicalVersion: 99,
      issue: { kind: 'unsupported-version' },
    });
  });
});

function completionEffects(marker: string): WorkoutCompletionEffects {
  return {
    xpNotifications: [{ kind: 'xp', text: 'Treino Concluído! +420 kcal gastas', xp: 150 }],
    communityPost: {
      id: `post-${marker}`,
      authorName: 'Rafael Silveira (Demo)',
      authorAvatar: '🚀',
      time: 'Agora mesmo',
      content: 'Treino finalizado!',
      likes: 0,
      comments: [],
      userLiked: false,
      shares: 0,
    },
    unlockedAchievementIds: ['ach_1'],
    markedDayName: 'Segunda',
  };
}

// Estado pós-conclusão: treino ativo e timers limpos, com marcadores que provam
// que o core gravado veio do snapshot e não de um render intermediário.
function completionState(session: WorkoutSession): PersistedState {
  return {
    ...defaults(),
    activeWorkout: null,
    activeWorkoutStartedAt: null,
    restTimerEndAt: null,
    restTimerTotalSeconds: null,
    restTimerLabel: null,
    favoriteExercises: ['pos-conclusao'],
    recentlyViewedVideoIds: [session.id],
  };
}

function staleStateWithActiveWorkout(session: WorkoutSession): PersistedState {
  return {
    ...defaults(),
    activeWorkout: session,
    activeWorkoutStartedAt: session.startedAt ?? null,
    restTimerEndAt: 1_800_000_000_000,
    restTimerTotalSeconds: 90,
    restTimerLabel: 'Supino',
    favoriteExercises: ['pre-conclusao'],
  };
}

function activeVersionOf(session: WorkoutSession): WorkoutSession {
  return {
    ...session,
    duration: 0,
    calories: 0,
    xpEarned: 0,
    totalVolume: undefined,
    prsDetected: undefined,
    status: 'active',
    endedAt: undefined,
    exercises: session.exercises.map((exercise) => {
      const { entryStatus, ...withoutStatus } = exercise;
      void entryStatus;
      return withoutStatus;
    }),
  };
}

function persistedCore(storage: MemoryStorage): PersistedCoreState {
  const parsed = parsePhysicalEnvelope(storage.getItem(KEY) as string);
  if (parsed.status !== 'v2') throw new Error('O envelope persistido não é v2.');
  return parsed.envelope.data;
}

async function writeRawReceipt(
  harness: ReturnType<typeof createHarness>,
  receipt: unknown,
): Promise<void> {
  await mutateRawDatabase(
    harness.factory,
    harness.name,
    [COMPLETION_RECEIPTS_STORE],
    async (transaction) => {
      await rawRequest(transaction.objectStore(COMPLETION_RECEIPTS_STORE).put(receipt));
    },
  );
}

describe('conclusão híbrida recuperável', () => {
  async function hydratedHarness(state: Partial<PersistedState> = {}) {
    const harness = createHarness();
    harness.storage.setItem(KEY, v1Envelope({ ...defaults(), ...state }));
    const hydration = await harness.runtime.hydrate();
    expect(hydration.mode).toBe('hybrid-v2');
    return harness;
  }

  it('persiste sessão, receipt e core verificado antes de qualquer callback', async () => {
    const harness = await hydratedHarness();
    const session = makeSession(1);

    const result = await harness.runtime.commitCompletion({
      session,
      state: completionState(session),
      effects: completionEffects('1'),
      receiptId: 'receipt-1',
    });

    expect(result.status).toBe('committed');
    if (result.status === 'resumed') throw new Error('esperado commit');
    expect(result.coreWrite.ok).toBe(true);
    expect(result.core.activeWorkout).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(result.core, 'workoutHistory')).toBe(false);

    expect((await harness.adapter.readActiveHistory()).map((item) => item.id)).toEqual(['session-1']);
    expect((await harness.adapter.readPendingCompletionReceipts()).map((item) => item.receiptId))
      .toEqual(['receipt-1']);
    expect(await harness.adapter.readGenerationManifest('generation-1'))
      .toMatchObject({ sessionCount: 1, verified: true });

    const core = persistedCore(harness.storage);
    expect(core.activeWorkout).toBeNull();
    expect(core.activeWorkoutStartedAt).toBeNull();
    expect(core.restTimerEndAt).toBeNull();
    expect(core.favoriteExercises).toEqual(['pos-conclusao']);
    await harness.runtime.close();
  });

  it('um pagehide imediato após o append grava o snapshot pós-conclusão, não o estado antigo', async () => {
    const harness = await hydratedHarness();
    const session = makeSession(1);
    const result = await harness.runtime.commitCompletion({
      session,
      state: completionState(session),
      effects: completionEffects('1'),
      receiptId: 'receipt-1',
    });
    if (result.status === 'resumed') throw new Error('esperado commit');

    // Autosave normal é bloqueado enquanto há receipt; o ciclo de vida usa
    // explicitamente o snapshot pós-conclusão.
    const autosave = harness.runtime.saveCore(staleStateWithActiveWorkout(session));
    expect(autosave).toMatchObject({ ok: false, reason: 'blocked' });
    const flush = harness.runtime.flushPendingCompletionCore();
    expect(flush.ok).toBe(true);
    const core = persistedCore(harness.storage);
    expect(core.activeWorkout).toBeNull();
    expect(core.activeWorkoutStartedAt).toBeNull();
    expect(core.restTimerEndAt).toBeNull();
    expect(core.favoriteExercises).toEqual(['pos-conclusao']);

    // Depois da liquidação o autosave normal volta a mandar.
    await harness.runtime.settleCompletion(result.receiptId);
    expect(harness.runtime.saveCore(completionState(session)).ok).toBe(true);
    expect(persistedCore(harness.storage).favoriteExercises).toEqual(['pos-conclusao']);
    await harness.runtime.close();
  });

  it('mantém receipt e snapshot pendentes após falha do core e flush posterior', async () => {
    const harness = await hydratedHarness();
    const session = makeSession(1);
    const rawBefore = harness.storage.getItem(KEY);
    harness.storage.failNextV2MainWrite = true;

    const result = await harness.runtime.commitCompletion({
      session,
      state: completionState(session),
      effects: completionEffects('1'),
      receiptId: 'receipt-1',
    });
    if (result.status === 'resumed') throw new Error('esperado commit');

    expect(result.coreWrite.ok).toBe(false);
    expect(harness.runtime.hasPendingCompletion()).toBe(true);
    expect(harness.storage.getItem(KEY)).toBe(rawBefore);
    expect((await harness.adapter.readPendingCompletionReceipts()).map((item) => item.receiptId))
      .toEqual(['receipt-1']);

    const editedAfterFailure = {
      ...completionState(session),
      favoriteExercises: ['edicao-posterior'],
    };
    expect(harness.runtime.saveCore(editedAfterFailure))
      .toMatchObject({ ok: false, reason: 'blocked' });
    expect(harness.storage.getItem(KEY)).toBe(rawBefore);

    // Um flush de ciclo de vida bem-sucedido não liquida nem limpa o estado.
    expect(harness.runtime.flushPendingCompletionCore().ok).toBe(true);
    expect(persistedCore(harness.storage).favoriteExercises).toEqual(['pos-conclusao']);
    expect(harness.runtime.hasPendingCompletion()).toBe(true);
    expect((await harness.adapter.readPendingCompletionReceipts()).map((item) => item.receiptId))
      .toEqual(['receipt-1']);
    expect(harness.runtime.saveCore(editedAfterFailure))
      .toMatchObject({ ok: false, reason: 'blocked' });

    const secondSession = makeSession(2);
    await expect(harness.runtime.commitCompletion({
      session: secondSession,
      state: completionState(secondSession),
      effects: completionEffects('2'),
      receiptId: 'receipt-2',
    })).rejects.toBeInstanceOf(HybridStorageIntegrityError);
    expect(await harness.adapter.count()).toBe(1);
    expect(await harness.adapter.readPendingCompletionReceipts()).toHaveLength(1);

    await harness.runtime.close();

    const reloaded = reloadRuntime(harness);
    const recovered = await reloaded.hydrate();
    expect(recovered).toMatchObject({
      mode: 'hybrid-v2',
      recoveredCompletions: [{ receiptId: 'receipt-1' }],
    });
    expect(await harness.adapter.readPendingCompletionReceipts()).toHaveLength(1);
    await reloaded.settleCompletion('receipt-1');
    expect(await harness.adapter.readPendingCompletionReceipts()).toEqual([]);
    expect(reloaded.saveCore(editedAfterFailure).ok).toBe(true);
    expect(persistedCore(harness.storage).favoriteExercises).toEqual(['edicao-posterior']);
    await reloaded.close();
  });

  it('recupera kill após append e antes do core gravando o coreEnvelopeAfter', async () => {
    const terminal = makeSession(1);
    const active = activeVersionOf(terminal);
    const harness = await hydratedHarness({
      activeWorkout: active,
      activeWorkoutStartedAt: active.startedAt ?? null,
    });
    const receipt = await createWorkoutCompletionReceipt({
      receiptId: 'receipt-1',
      generationId: 'generation-1',
      finalSession: terminal,
      coreEnvelopeAfter: toPersistedCoreState(completionState(terminal), 'generation-1'),
      effects: completionEffects('1'),
      createdAt: '2026-07-23T12:30:00.000Z',
    });
    // Kill: sessão e receipt duráveis, core ainda com o treino ativo.
    await harness.adapter.appendSessionWithCompletionReceipt(terminal, receipt);
    expect(persistedCore(harness.storage).activeWorkout).not.toBeNull();
    await harness.runtime.close();

    const reloaded = reloadRuntime(harness);
    const recovered = await reloaded.hydrate();
    expect(recovered).toMatchObject({
      mode: 'hybrid-v2',
      state: { activeWorkout: null, activeWorkoutStartedAt: null, favoriteExercises: ['pos-conclusao'] },
    });
    if (recovered.mode !== 'hybrid-v2') throw new Error('esperado hybrid-v2');
    expect(recovered.state.workoutHistory.map((item) => item.id)).toEqual(['session-1']);
    expect(recovered.recoveredCompletions).toHaveLength(1);
    expect(recovered.recoveredCompletions[0]).toMatchObject({ receiptId: 'receipt-1' });
    expect(recovered.recoveredCompletions[0].effects.communityPost.id).toBe('post-1');
    expect(persistedCore(harness.storage).favoriteExercises).toEqual(['pos-conclusao']);
    await reloaded.close();
  });

  it('recupera kill após o core e antes dos estados React confirmando o core existente', async () => {
    const harness = await hydratedHarness();
    const session = makeSession(1);
    const result = await harness.runtime.commitCompletion({
      session,
      state: completionState(session),
      effects: completionEffects('1'),
      receiptId: 'receipt-1',
    });
    if (result.status === 'resumed') throw new Error('esperado commit');
    const coreBefore = harness.storage.getItem(KEY);
    // Kill antes de liquidar o receipt.
    await harness.runtime.close();

    const reloaded = reloadRuntime(harness);
    const recovered = await reloaded.hydrate();
    if (recovered.mode !== 'hybrid-v2') throw new Error('esperado hybrid-v2');
    expect(recovered.recoveredCompletions).toHaveLength(1);
    expect(recovered.state.workoutHistory.map((item) => item.id)).toEqual(['session-1']);
    expect(harness.storage.getItem(KEY)).toBe(coreBefore);
    await reloaded.close();
  });

  it('é idempotente em reinícios repetidos com o mesmo receipt', async () => {
    const harness = await hydratedHarness();
    const session = makeSession(1);
    const result = await harness.runtime.commitCompletion({
      session,
      state: completionState(session),
      effects: completionEffects('1'),
      receiptId: 'receipt-1',
    });
    if (result.status === 'resumed') throw new Error('esperado commit');
    await harness.runtime.close();

    for (let boot = 0; boot < 3; boot += 1) {
      const reloaded = reloadRuntime(harness);
      const recovered = await reloaded.hydrate();
      if (recovered.mode !== 'hybrid-v2') throw new Error('esperado hybrid-v2');
      expect(recovered.recoveredCompletions).toHaveLength(1);
      expect(recovered.state.workoutHistory.map((item) => item.id)).toEqual(['session-1']);
      expect(recovered.state.user).toBeNull();
      await reloaded.close();
    }

    // Depois de liquidado, o boot seguinte não repete nada.
    const settling = reloadRuntime(harness);
    await settling.hydrate();
    await settling.settleCompletion('receipt-1');
    await settling.close();

    const clean = reloadRuntime(harness);
    const cleanBoot = await clean.hydrate();
    if (cleanBoot.mode !== 'hybrid-v2') throw new Error('esperado hybrid-v2');
    expect(cleanBoot.recoveredCompletions).toEqual([]);
    expect(cleanBoot.state.workoutHistory.map((item) => item.id)).toEqual(['session-1']);
    await clean.close();
  });

  it('bloqueia receipt pendente sem sessão na geração', async () => {
    const harness = await hydratedHarness();
    await writeRawReceipt(harness, await createWorkoutCompletionReceipt({
      receiptId: 'receipt-orfao',
      generationId: 'generation-1',
      finalSession: makeSession(7),
      coreEnvelopeAfter: toPersistedCoreState(completionState(makeSession(7)), 'generation-1'),
      effects: completionEffects('7'),
      createdAt: '2026-07-23T12:30:00.000Z',
    }));
    await harness.runtime.close();

    const reloaded = reloadRuntime(harness);
    const result = await reloaded.hydrate();
    expect(result).toMatchObject({ mode: 'blocked', physicalVersion: 2 });
    if (result.mode === 'blocked') expect(result.issue.message).toContain('session-absent');
    await reloaded.close();
  });

  it('bloqueia receipt adulterado no digest', async () => {
    const harness = await hydratedHarness();
    const session = makeSession(1);
    const result = await harness.runtime.commitCompletion({
      session,
      state: completionState(session),
      effects: completionEffects('1'),
      receiptId: 'receipt-1',
    });
    if (result.status === 'resumed') throw new Error('esperado commit');
    const stored = await harness.adapter.readCompletionReceiptForSession(session.id);
    await writeRawReceipt(harness, { ...stored, sessionDigest: 'sha256:adulterado' });
    await harness.runtime.close();

    const reloaded = reloadRuntime(harness);
    const boot = await reloaded.hydrate();
    expect(boot).toMatchObject({ mode: 'blocked' });
    if (boot.mode === 'blocked') expect(boot.issue.message).toContain('receipt-digest-mismatch');
    await reloaded.close();
  });

  it('bloqueia receipt cuja sessão persistida diverge', async () => {
    const harness = await hydratedHarness();
    const session = makeSession(1);
    const result = await harness.runtime.commitCompletion({
      session,
      state: completionState(session),
      effects: completionEffects('1'),
      receiptId: 'receipt-1',
    });
    if (result.status === 'resumed') throw new Error('esperado commit');
    const stored = await harness.adapter.readCompletionReceiptForSession(session.id);
    const divergent = { ...session, name: 'Outro treino' };
    await writeRawReceipt(harness, {
      ...stored,
      finalSession: divergent,
      sessionDigest: await digestWorkoutSession(divergent),
    });
    await harness.runtime.close();

    const reloaded = reloadRuntime(harness);
    const boot = await reloaded.hydrate();
    expect(boot).toMatchObject({ mode: 'blocked' });
    if (boot.mode === 'blocked') expect(boot.issue.message).toContain('session-divergent');
    await reloaded.close();
  });

  it('bloqueia quando o treino ativo residual diverge da sessão do receipt', async () => {
    const terminal = makeSession(1);
    const harness = await hydratedHarness({
      activeWorkout: activeVersionOf(makeSession(1, { name: 'Outro conteúdo' })),
      activeWorkoutStartedAt: terminal.startedAt ?? null,
    });
    await harness.adapter.appendSessionWithCompletionReceipt(terminal, await createWorkoutCompletionReceipt({
      receiptId: 'receipt-1',
      generationId: 'generation-1',
      finalSession: terminal,
      coreEnvelopeAfter: toPersistedCoreState(completionState(terminal), 'generation-1'),
      effects: completionEffects('1'),
      createdAt: '2026-07-23T12:30:00.000Z',
    }));
    await harness.runtime.close();

    const reloaded = reloadRuntime(harness);
    await expect(reloaded.hydrate()).resolves.toMatchObject({ mode: 'blocked' });
    await reloaded.close();
  });

  it('recusa nova conclusão enquanto o receipt anterior permanece pendente', async () => {
    const harness = await hydratedHarness();
    const session = makeSession(1);
    const first = await harness.runtime.commitCompletion({
      session,
      state: completionState(session),
      effects: completionEffects('1'),
      receiptId: 'receipt-1',
    });
    if (first.status === 'resumed') throw new Error('esperado commit');

    await expect(harness.runtime.commitCompletion({
      session,
      state: completionState(session),
      effects: completionEffects('nova-tentativa'),
      receiptId: 'receipt-2',
    })).rejects.toBeInstanceOf(HybridStorageIntegrityError);
    expect((await harness.adapter.readPendingCompletionReceipts()).map((item) => item.receiptId))
      .toEqual(['receipt-1']);
    expect(await harness.adapter.count()).toBe(1);
    await harness.runtime.close();
  });

  it('trata duplicidade: conteúdo idêntico com receipt concluído vira retomada', async () => {
    const harness = await hydratedHarness();
    const session = makeSession(1);
    const first = await harness.runtime.commitCompletion({
      session,
      state: completionState(session),
      effects: completionEffects('1'),
      receiptId: 'receipt-1',
    });
    if (first.status === 'resumed') throw new Error('esperado commit');
    await harness.runtime.settleCompletion('receipt-1');

    const second = await harness.runtime.commitCompletion({
      session,
      state: completionState(session),
      effects: completionEffects('nova-tentativa'),
      receiptId: 'receipt-2',
    });
    expect(second.status).toBe('resumed');
    expect(await harness.adapter.count()).toBe(1);
    await harness.runtime.close();
  });

  it('trata duplicidade: conteúdo divergente bloqueia por integridade', async () => {
    const harness = await hydratedHarness();
    const session = makeSession(1);
    const first = await harness.runtime.commitCompletion({
      session,
      state: completionState(session),
      effects: completionEffects('1'),
      receiptId: 'receipt-1',
    });
    if (first.status === 'resumed') throw new Error('esperado commit');

    const divergent = makeSession(1, { name: 'Outro conteúdo' });
    await expect(harness.runtime.commitCompletion({
      session: divergent,
      state: completionState(divergent),
      effects: completionEffects('divergente'),
      receiptId: 'receipt-2',
    })).rejects.toBeInstanceOf(HybridStorageIntegrityError);
    expect(await harness.adapter.count()).toBe(1);
    await harness.runtime.close();
  });

  it('recusa conclusão fora do modo híbrido', async () => {
    const { storage, runtime } = createHarness();
    storage.setItem(KEY, '{inválido');
    expect((await runtime.hydrate()).mode).toBe('blocked');
    const session = makeSession(1);
    await expect(runtime.commitCompletion({
      session,
      state: completionState(session),
      effects: completionEffects('1'),
      receiptId: 'receipt-1',
    })).rejects.toBeInstanceOf(HybridStorageIntegrityError);
    await runtime.close();
  });

  it('close aguarda a operação durável pendente antes de fechar o adapter', async () => {
    const harness = await hydratedHarness();
    const session = makeSession(1);
    const order: string[] = [];
    const closeSpy = vi.spyOn(harness.adapter, 'close')
      .mockImplementation(async () => { order.push('close'); });

    const commit = harness.runtime.commitCompletion({
      session,
      state: completionState(session),
      effects: completionEffects('1'),
      receiptId: 'receipt-1',
    }).then((result) => {
      order.push('commit');
      return result;
    });
    const closing = harness.runtime.close();
    const [result] = await Promise.all([commit, closing]);

    expect(order).toEqual(['commit', 'close']);
    expect(result.status).toBe('committed');
    closeSpy.mockRestore();
    expect((await harness.adapter.readActiveHistory()).map((item) => item.id)).toEqual(['session-1']);
    expect((await harness.adapter.readPendingCompletionReceipts()).map((item) => item.receiptId))
      .toEqual(['receipt-1']);
    await harness.adapter.close();
  });

  it('cleanup da primeira montagem não fecha adapter retido pela segunda', async () => {
    const harness = await hydratedHarness();
    const closeSpy = vi.spyOn(harness.adapter, 'close');

    harness.runtime.retain();
    const firstCleanup = harness.runtime.close();
    harness.runtime.retain();
    await firstCleanup;
    expect(closeSpy).not.toHaveBeenCalled();

    await harness.runtime.close();
    expect(closeSpy).toHaveBeenCalledTimes(1);
    closeSpy.mockRestore();
  });
});
