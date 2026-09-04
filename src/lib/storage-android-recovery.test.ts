import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  runStorageBootRecovery,
  runStorageBootRecoveryOnce,
} from './storage-boot-recovery';
import {
  createHybridStorageRuntime,
  parsePhysicalEnvelope,
  toPersistedCoreState,
  combineCoreWithHistory,
  saveHybridCoreResult,
  HYBRID_CORE_BACKUP_SUFFIX,
} from './storage-hybrid';
import {
  IndexedDbWorkoutHistoryStorage,
  GYMFLOW_INDEXEDDB_VERSION,
} from './storage-indexeddb';
import {
  HYBRID_STORAGE_VERSION,
  type PersistedCoreState,
  type PersistedState,
  type StorageLike,
} from './storage-types';
import type { WorkoutSession } from '../types';

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  readonly reads: string[] = [];
  readonly writes: string[] = [];

  getItem(key: string): string | null {
    this.reads.push(key);
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes.push(key);
    this.values.set(key, String(value));
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  clear(): void {
    this.values.clear();
  }
  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }
  get length(): number {
    return this.values.size;
  }
}

function makeSession(index: number): WorkoutSession {
  return {
    id: `sess-${index}`,
    name: `Treino ${index}`,
    date: `2026-08-${String(index).padStart(2, '0')}T10:00:00.000Z`,
    duration: 2700,
    calories: 300,
    xpEarned: 100,
    exercises: [
      {
        id: 'ex-1',
        exerciseId: 'supino-reto',
        name: 'Supino Reto',
        muscleGroup: 'Peito',
        sets: [{ id: 'set-1', weight: 80, reps: 10, completed: true }],
      },
    ],
  };
}

function baseDefaults(): PersistedState {
  return {
    user: { id: 'u-1', name: 'Rafael', email: 'rafael@example.com' } as any,
    gymProfile: {
      schemaVersion: 1,
      activeProfileId: 'profile-1',
      profiles: [
        {
          id: 'profile-1',
          name: 'Academia Principal Preservada',
          kind: 'gym',
          isDefault: true,
          equipment: [],
        },
      ],
    } as any,
    weeklyPlan: [
      { dayOfWeek: 1, workoutId: 'prog-1', restDay: false },
      { dayOfWeek: 2, workoutId: 'prog-2', restDay: false },
    ] as any,
    customPrograms: [
      {
        id: 'prog-custom-1',
        name: 'Treino Especial de Força',
        description: 'Programa customizado preservado',
        workouts: [],
      } as any,
    ],
    activeWorkout: {
      id: 'active-sess-1',
      workoutId: 'w-active',
      date: '2026-09-04T12:00:00.000Z',
      exercises: [],
    } as any,
    activeWorkoutStartedAt: 1788523200000,
    restTimerEndAt: null,
    restTimerTotalSeconds: null,
    restTimerLabel: null,
    workoutHistory: [],
    weightHistory: [],
    measurementsHistory: [],
    nutrition: { calories: 2500, protein: 180, carbs: 250, fat: 70, water: 3000 } as any,
    achievements: [],
    challenges: [],
    favoriteExercises: ['supino-reto'],
    recentlyViewedVideoIds: [],
  };
}

let dbSeq = 0;

describe('GOAL-021: Recuperação Segura de Storage Híbrido no Android', () => {
  const KEY = 'gymflow_state_v1';

  it('Candidato 1: geração referenciada no core existe fisicamente e é comprovada -> reconcilia e desbloqueia', async () => {
    const storage = new MemoryStorage();
    const factory = new IDBFactory();
    const dbName = `gymflow-android-c1-${dbSeq += 1}`;
    const adapter = new IndexedDbWorkoutHistoryStorage({
      factory,
      databaseName: dbName,
      generationIdFactory: () => 'gen-rec-c1',
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });

    await adapter.open();

    // Cria e prepara uma geração real no IndexedDB com 2 sessões
    const sessions = [makeSession(1), makeSession(2)];
    const genId = await adapter.prepareHistoryGeneration(sessions);

    // Salva core v2 no localStorage apontando para essa geração, mas metadata ainda sem activeGeneration (queda/bloqueio)
    const state = baseDefaults();
    const core = toPersistedCoreState(state, genId);
    const rawCore = JSON.stringify({
      v: HYBRID_STORAGE_VERSION,
      savedAt: '2026-09-04T12:00:00.000Z',
      data: core,
    });
    storage.setItem(KEY, rawCore);

    // Executa boot recovery
    const outcome = await runStorageBootRecovery({
      adapter,
      storage,
      key: KEY,
    });

    // Deve autorizar a hidratação
    expect(outcome.hydrationAllowed).toBe(true);
    expect(outcome.status).toBe('ready-after-settled');

    // Backup foi gravado com segurança antes de qualquer mutação
    expect(storage.getItem(`${KEY}${HYBRID_CORE_BACKUP_SUFFIX}`)).toBe(rawCore);

    // Hidratação híbrida subsequente deve ter sucesso pleno em hybrid-v2
    const hybrid = createHybridStorageRuntime({
      key: KEY,
      storage,
      adapter,
      defaults: baseDefaults(),
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });
    hybrid.retain();
    const hydrated = await hybrid.hydrate();
    expect(hydrated.mode).toBe('hybrid-v2');
    if (hydrated.mode !== 'hybrid-v2') throw new Error('not hybrid-v2');
    expect(hydrated.state.gymProfile?.profiles[0].name).toBe('Academia Principal Preservada');
    expect(hydrated.state.workoutHistory).toHaveLength(2);
    expect(hydrated.state.workoutHistory[0].id).toBe('sess-1');
    expect(hydrated.state.workoutHistory[1].id).toBe('sess-2');
    await hybrid.close();
  });

  it('Candidato 2: snapshot legado verificado em LEGACY_SNAPSHOTS_STORE -> reconcilia com dados legados', async () => {
    const storage = new MemoryStorage();
    const factory = new IDBFactory();
    const dbName = `gymflow-android-c2-${dbSeq += 1}`;
    const adapter = new IndexedDbWorkoutHistoryStorage({
      factory,
      databaseName: dbName,
      generationIdFactory: () => 'gen-rec-c2',
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });

    await adapter.open();

    // Grava um snapshot legado verificado no adapter
    const legacySessions = [makeSession(10), makeSession(11), makeSession(12)];
    const legacyState: PersistedState = {
      ...baseDefaults(),
      workoutHistory: legacySessions,
    };
    const legacyRaw = JSON.stringify({
      v: 1,
      savedAt: '2026-08-01T12:00:00.000Z',
      data: legacyState,
    });
    await adapter.saveLegacySnapshot(legacyRaw);

    // Core v2 no localStorage apontando para geração perdida
    const state = baseDefaults();
    const core = toPersistedCoreState(state, 'gen-perdida-999');
    const rawCore = JSON.stringify({
      v: HYBRID_STORAGE_VERSION,
      savedAt: '2026-09-04T12:00:00.000Z',
      data: core,
    });
    storage.setItem(KEY, rawCore);

    // Executa boot recovery
    const outcome = await runStorageBootRecovery({
      adapter,
      storage,
      key: KEY,
    });

    expect(outcome.hydrationAllowed).toBe(true);
    expect(outcome.status).toBe('ready-after-settled');

    // Hidratação híbrida subsequente recupera as 3 sessões do snapshot legado verificado
    const hybrid = createHybridStorageRuntime({
      key: KEY,
      storage,
      adapter,
      defaults: baseDefaults(),
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });
    hybrid.retain();
    const hydrated = await hybrid.hydrate();
    expect(hydrated.mode).toBe('hybrid-v2');
    if (hydrated.mode !== 'hybrid-v2') throw new Error('not hybrid-v2');
    expect(hydrated.state.workoutHistory).toHaveLength(3);
    expect(hydrated.state.workoutHistory.map((s: WorkoutSession) => s.id)).toEqual(['sess-10', 'sess-11', 'sess-12']);
    await hybrid.close();
  });

  it('Candidato 3: manifest explícito com sessionCount === 0 -> reconcilia histórico vazio comprovado', async () => {
    const storage = new MemoryStorage();
    const factory = new IDBFactory();
    const dbName = `gymflow-android-c3-${dbSeq += 1}`;
    const adapter = new IndexedDbWorkoutHistoryStorage({
      factory,
      databaseName: dbName,
      generationIdFactory: () => 'gen-rec-c3',
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });

    await adapter.open();

    // Prepara geração vazia
    const emptyGenId = await adapter.prepareHistoryGeneration([]);

    // Core v2 apontando para essa geração vazia
    const state = baseDefaults();
    const core = toPersistedCoreState(state, emptyGenId);
    const rawCore = JSON.stringify({
      v: HYBRID_STORAGE_VERSION,
      savedAt: '2026-09-04T12:00:00.000Z',
      data: core,
    });
    storage.setItem(KEY, rawCore);

    const outcome = await runStorageBootRecovery({
      adapter,
      storage,
      key: KEY,
    });

    expect(outcome.hydrationAllowed).toBe(true);
    expect(outcome.status).toBe('ready-after-settled');

    const hybrid = createHybridStorageRuntime({
      key: KEY,
      storage,
      adapter,
      defaults: baseDefaults(),
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });
    hybrid.retain();
    const hydrated = await hybrid.hydrate();
    expect(hydrated.mode).toBe('hybrid-v2');
    if (hydrated.mode !== 'hybrid-v2') throw new Error('not hybrid-v2');
    expect(hydrated.state.workoutHistory).toEqual([]);
    await hybrid.close();
  });

  it('Regra 10 (ausência física continua ausência): sem comprovação, recusa recuperação automática e bloqueia', async () => {
    const storage = new MemoryStorage();
    const factory = new IDBFactory();
    const dbName = `gymflow-android-absent-${dbSeq += 1}`;
    const adapter = new IndexedDbWorkoutHistoryStorage({
      factory,
      databaseName: dbName,
    });

    await adapter.open();

    // Aponta para geração que não existe no IndexedDB e não há snapshot nem manifest
    const state = baseDefaults();
    const core = toPersistedCoreState(state, 'gen-fantasma-inexistente');
    const rawCore = JSON.stringify({
      v: HYBRID_STORAGE_VERSION,
      savedAt: '2026-09-04T12:00:00.000Z',
      data: core,
    });
    storage.setItem(KEY, rawCore);

    const outcome = await runStorageBootRecovery({
      adapter,
      storage,
      key: KEY,
    });

    // Deve falhar fechado, mantendo blocked-storage-unavailable
    expect(outcome.hydrationAllowed).toBe(false);
    expect(outcome.status).toBe('blocked-storage-unavailable');
    // Não alterou o localStorage
    expect(storage.getItem(KEY)).toBe(rawCore);
  });

  it('Idempotência (HYBRID_RECOVERY_REPEATS = NO): segundo boot após reconciliação não repete recuperação', async () => {
    const storage = new MemoryStorage();
    const factory = new IDBFactory();
    const dbName = `gymflow-android-idempotent-${dbSeq += 1}`;
    const adapter = new IndexedDbWorkoutHistoryStorage({
      factory,
      databaseName: dbName,
      generationIdFactory: () => 'gen-idemp-1',
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });

    await adapter.open();
    const sessions = [makeSession(5)];
    const genId = await adapter.prepareHistoryGeneration(sessions);

    const state = baseDefaults();
    const core = toPersistedCoreState(state, genId);
    storage.setItem(
      KEY,
      JSON.stringify({
        v: HYBRID_STORAGE_VERSION,
        savedAt: '2026-09-04T12:00:00.000Z',
        data: core,
      }),
    );

    // Primeiro boot: reconcilia
    const outcome1 = await runStorageBootRecoveryOnce({ adapter, storage, key: KEY });
    expect(outcome1.hydrationAllowed).toBe(true);
    expect(outcome1.status).toBe('ready-after-settled');

    // Simula reload criando novo adapter sobre o mesmo banco
    const adapter2 = new IndexedDbWorkoutHistoryStorage({
      factory,
      databaseName: dbName,
    });

    const writesCountBefore = storage.writes.length;

    // Segundo boot: já está settled e saudável
    const outcome2 = await runStorageBootRecoveryOnce({ adapter: adapter2, storage, key: KEY });
    expect(outcome2.hydrationAllowed).toBe(true);
    expect(outcome2.status).toBe('ready-no-operation');

    // Nenhuma nova escrita foi realizada no segundo boot
    expect(storage.writes.length).toBe(writesCountBefore);
  });
});
