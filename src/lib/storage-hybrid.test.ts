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
} from './storage-hybrid';
import { IndexedDbWorkoutHistoryStorage } from './storage-indexeddb';
import {
  HYBRID_STORAGE_VERSION,
  MONOLITHIC_STORAGE_VERSION,
  type PersistedState,
  type StorageLike,
} from './storage-types';
import { parseEnvelope } from './storage-validation';

const KEY = 'gymflow:state:v1';
let databaseSequence = 0;

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  failNextV2MainWrite = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
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
  const adapter = new IndexedDbWorkoutHistoryStorage({
    factory,
    databaseName: `gymflow-hybrid-${databaseSequence += 1}`,
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
  return { storage, factory, adapter, runtime };
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

  it('bloqueia v2 quando a leitura do histórico falha', async () => {
    const { storage, adapter, runtime } = createHarness();
    storage.setItem(KEY, v1Envelope(defaults([makeSession(1)])));
    expect((await runtime.hydrate()).mode).toBe('hybrid-v2');
    await runtime.close();
    vi.spyOn(adapter, 'readHistoryGeneration').mockRejectedValueOnce(new Error('leitura falhou'));

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
