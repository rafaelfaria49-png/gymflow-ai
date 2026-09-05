import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  runStorageBootRecovery,
  runStorageBootRecoveryOnce,
  verifyBackupV1Lineage,
} from './storage-boot-recovery';
import { STORAGE_BACKUP_SUFFIX } from './storage';
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

  it('Candidato 4: Fixture do caso físico real Samsung SM-S901E (core v2 + IDB not-started + backup v1 com workoutHistory: []) -> recovery PASS', async () => {
    const storage = new MemoryStorage();
    const factory = new IDBFactory();
    const dbName = `gymflow-android-c4-samsung-${dbSeq += 1}`;
    const adapter = new IndexedDbWorkoutHistoryStorage({
      factory,
      databaseName: dbName,
      generationIdFactory: () => 'gen-rec-samsung-fixed',
      now: () => new Date('2026-09-04T19:30:00.000Z'),
    });

    await adapter.open();

    // Estado exatamente como no Samsung SM-S901E:
    // 1. IndexedDB vazio (not-started, activeGen null, nenhum registro)
    const initialMeta = await adapter.readMetadata();
    expect(initialMeta.migrationStatus).toBe('not-started');
    expect(initialMeta.activeGeneration).toBeNull();
    expect((await adapter.readStorageAdministrationSnapshot()).unsettledOperations).toHaveLength(0);

    // 2. Core v2 no localStorage apontando para geração órfã
    const state = baseDefaults();
    const targetGenId = 'generation-4317ec26-ae8c-4e03-8c00-dd1a955d7895';
    const core = toPersistedCoreState(state, targetGenId);
    const rawCore = JSON.stringify({
      v: HYBRID_STORAGE_VERSION,
      savedAt: '2026-09-04T19:24:25.000Z',
      data: core,
    });
    storage.setItem(KEY, rawCore);

    // 3. Backup v1 físico no localStorage com workoutHistory: [] e dados da mesma linhagem
    const rawBackup = JSON.stringify({
      v: 1,
      savedAt: '2026-08-14T10:55:02.000Z',
      data: {
        ...state,
        workoutHistory: [],
      },
    });
    const backupKey = `${KEY}${STORAGE_BACKUP_SUFFIX}`;
    storage.setItem(backupKey, rawBackup);

    // Executa boot recovery
    const outcome = await runStorageBootRecovery({
      adapter,
      storage,
      key: KEY,
    });

    // Deve autorizar a hidratação plenamente
    expect(outcome.hydrationAllowed).toBe(true);
    expect(outcome.status).toBe('ready-after-settled');

    // Backup pré-mutação foi gravado
    expect(storage.getItem(`${KEY}${HYBRID_CORE_BACKUP_SUFFIX}`)).toBe(rawCore);
    // Backup físico v1 foi rigorosamente preservado (Regra 9)
    expect(storage.getItem(backupKey)).toBe(rawBackup);

    // Hidratação híbrida subsequente em hybrid-v2 com todos os domínios intactos
    const hybrid = createHybridStorageRuntime({
      key: KEY,
      storage,
      adapter,
      defaults: baseDefaults(),
      now: () => new Date('2026-09-04T19:30:00.000Z'),
    });
    hybrid.retain();
    const hydrated = await hybrid.hydrate();
    expect(hydrated.mode).toBe('hybrid-v2');
    if (hydrated.mode !== 'hybrid-v2') throw new Error('not hybrid-v2');

    // Histórico vazio comprovado via backup
    expect(hydrated.state.workoutHistory).toEqual([]);

    // Domínios canônicos preservados integralmente (Regra 15)
    expect(hydrated.state.user?.name).toBe('Rafael');
    expect(hydrated.state.user?.email).toBe('rafael@example.com');
    expect(hydrated.state.gymProfile?.profiles[0].name).toBe('Academia Principal Preservada');
    expect(hydrated.state.customPrograms[0].name).toBe('Treino Especial de Força');
    expect(hydrated.state.weeklyPlan).toHaveLength(2);
    expect(hydrated.state.activeWorkout?.id).toBe('active-sess-1');
    expect(hydrated.state.weightHistory).toEqual([]);
    expect(hydrated.state.measurementsHistory).toEqual([]);
    expect(hydrated.state.nutrition.calories).toBe(2500);
    expect(hydrated.state.favoriteExercises).toEqual(['supino-reto']);

    await hybrid.close();
  });

  it('Candidato 4: Histórico não vazio no backup v1 -> preserva todas as sessões comprovadas exatamente', async () => {
    const storage = new MemoryStorage();
    const factory = new IDBFactory();
    const dbName = `gymflow-android-c4-sessions-${dbSeq += 1}`;
    const adapter = new IndexedDbWorkoutHistoryStorage({
      factory,
      databaseName: dbName,
      generationIdFactory: () => 'gen-rec-sessions',
      now: () => new Date('2026-09-04T19:30:00.000Z'),
    });

    await adapter.open();

    const sessions = [makeSession(20), makeSession(21), makeSession(22)];
    const state = {
      ...baseDefaults(),
      workoutHistory: sessions,
    };

    // Core v2 órfão
    const targetGenId = 'generation-missing-sessions';
    const core = toPersistedCoreState(state, targetGenId);
    const rawCore = JSON.stringify({
      v: HYBRID_STORAGE_VERSION,
      savedAt: '2026-09-04T19:24:25.000Z',
      data: core,
    });
    storage.setItem(KEY, rawCore);

    // Backup v1 com as 3 sessões comprovadas
    const rawBackup = JSON.stringify({
      v: 1,
      savedAt: '2026-08-14T10:55:02.000Z',
      data: state,
    });
    storage.setItem(`${KEY}${STORAGE_BACKUP_SUFFIX}`, rawBackup);

    const outcome = await runStorageBootRecovery({
      adapter,
      storage,
      key: KEY,
    });

    expect(outcome.hydrationAllowed).toBe(true);
    expect(outcome.status).toBe('ready-after-settled');

    // Hidratação híbrida recupera todas as 3 sessões comprovadas
    const hybrid = createHybridStorageRuntime({
      key: KEY,
      storage,
      adapter,
      defaults: baseDefaults(),
      now: () => new Date('2026-09-04T19:30:00.000Z'),
    });
    hybrid.retain();
    const hydrated = await hybrid.hydrate();
    expect(hydrated.mode).toBe('hybrid-v2');
    if (hydrated.mode !== 'hybrid-v2') throw new Error('not hybrid-v2');
    expect(hydrated.state.workoutHistory).toHaveLength(3);
    expect(hydrated.state.workoutHistory[0].id).toBe('sess-20');
    expect(hydrated.state.workoutHistory[1].id).toBe('sess-21');
    expect(hydrated.state.workoutHistory[2].id).toBe('sess-22');
    expect(hydrated.state.workoutHistory[0].exercises[0].sets[0].weight).toBe(80);

    await hybrid.close();
  });

  describe('Testes negativos de recuperação via backup (Regra 13)', () => {
    it('backup ausente -> blocked-storage-unavailable', async () => {
      const storage = new MemoryStorage();
      const factory = new IDBFactory();
      const adapter = new IndexedDbWorkoutHistoryStorage({
        factory,
        databaseName: `gymflow-neg-absent-${dbSeq += 1}`,
      });
      await adapter.open();

      const state = baseDefaults();
      const core = toPersistedCoreState(state, 'gen-no-backup');
      const rawCore = JSON.stringify({
        v: HYBRID_STORAGE_VERSION,
        savedAt: '2026-09-04T12:00:00.000Z',
        data: core,
      });
      storage.setItem(KEY, rawCore);
      // Nenhum backup criado

      const outcome = await runStorageBootRecovery({ adapter, storage, key: KEY });
      expect(outcome.hydrationAllowed).toBe(false);
      expect(outcome.status).toBe('blocked-storage-unavailable');
      expect(storage.getItem(KEY)).toBe(rawCore);
    });

    it('backup com JSON inválido -> blocked-storage-unavailable', async () => {
      const storage = new MemoryStorage();
      const factory = new IDBFactory();
      const adapter = new IndexedDbWorkoutHistoryStorage({
        factory,
        databaseName: `gymflow-neg-badjson-${dbSeq += 1}`,
      });
      await adapter.open();

      const state = baseDefaults();
      const core = toPersistedCoreState(state, 'gen-bad-json');
      storage.setItem(
        KEY,
        JSON.stringify({ v: HYBRID_STORAGE_VERSION, savedAt: '2026-09-04T12:00:00.000Z', data: core }),
      );
      storage.setItem(`${KEY}${STORAGE_BACKUP_SUFFIX}`, '{"v":1, "corrupt":');

      const outcome = await runStorageBootRecovery({ adapter, storage, key: KEY });
      expect(outcome.hydrationAllowed).toBe(false);
      expect(outcome.status).toBe('blocked-storage-unavailable');
    });

    it('backup não-v1 (envelope v2 no slot de backup) -> blocked-storage-unavailable', async () => {
      const storage = new MemoryStorage();
      const factory = new IDBFactory();
      const adapter = new IndexedDbWorkoutHistoryStorage({
        factory,
        databaseName: `gymflow-neg-notv1-${dbSeq += 1}`,
      });
      await adapter.open();

      const state = baseDefaults();
      const core = toPersistedCoreState(state, 'gen-not-v1');
      storage.setItem(
        KEY,
        JSON.stringify({ v: HYBRID_STORAGE_VERSION, savedAt: '2026-09-04T12:00:00.000Z', data: core }),
      );
      // Backup tem v: 2 (não é envelope v1)
      storage.setItem(
        `${KEY}${STORAGE_BACKUP_SUFFIX}`,
        JSON.stringify({ v: HYBRID_STORAGE_VERSION, savedAt: '2026-09-04T12:00:00.000Z', data: core }),
      );

      const outcome = await runStorageBootRecovery({ adapter, storage, key: KEY });
      expect(outcome.hydrationAllowed).toBe(false);
      expect(outcome.status).toBe('blocked-storage-unavailable');
    });

    it('backup com core divergente em user -> blocked-storage-unavailable', async () => {
      const storage = new MemoryStorage();
      const factory = new IDBFactory();
      const adapter = new IndexedDbWorkoutHistoryStorage({
        factory,
        databaseName: `gymflow-neg-divuser-${dbSeq += 1}`,
      });
      await adapter.open();

      const state = baseDefaults();
      const core = toPersistedCoreState(state, 'gen-div-user');
      storage.setItem(
        KEY,
        JSON.stringify({ v: HYBRID_STORAGE_VERSION, savedAt: '2026-09-04T12:00:00.000Z', data: core }),
      );

      // Backup tem usuário diferente
      const divergentState = {
        ...state,
        user: { id: 'u-999', name: 'Usuario Completamente Diferente', email: 'outro@example.com' } as any,
      };
      storage.setItem(
        `${KEY}${STORAGE_BACKUP_SUFFIX}`,
        JSON.stringify({ v: 1, savedAt: '2026-08-01T12:00:00.000Z', data: divergentState }),
      );

      const outcome = await runStorageBootRecovery({ adapter, storage, key: KEY });
      expect(outcome.hydrationAllowed).toBe(false);
      expect(outcome.status).toBe('blocked-storage-unavailable');
    });

    it('backup com core divergente em weeklyPlan -> blocked-storage-unavailable', async () => {
      const storage = new MemoryStorage();
      const factory = new IDBFactory();
      const adapter = new IndexedDbWorkoutHistoryStorage({
        factory,
        databaseName: `gymflow-neg-divplan-${dbSeq += 1}`,
      });
      await adapter.open();

      const state = baseDefaults();
      const core = toPersistedCoreState(state, 'gen-div-plan');
      storage.setItem(
        KEY,
        JSON.stringify({ v: HYBRID_STORAGE_VERSION, savedAt: '2026-09-04T12:00:00.000Z', data: core }),
      );

      const divergentState = {
        ...state,
        weeklyPlan: [{ dayOfWeek: 3, workoutId: 'outro-treino', restDay: false }] as any,
      };
      storage.setItem(
        `${KEY}${STORAGE_BACKUP_SUFFIX}`,
        JSON.stringify({ v: 1, savedAt: '2026-08-01T12:00:00.000Z', data: divergentState }),
      );

      const outcome = await runStorageBootRecovery({ adapter, storage, key: KEY });
      expect(outcome.hydrationAllowed).toBe(false);
      expect(outcome.status).toBe('blocked-storage-unavailable');
    });

    it('backup com core divergente em customPrograms -> blocked-storage-unavailable', async () => {
      const storage = new MemoryStorage();
      const factory = new IDBFactory();
      const adapter = new IndexedDbWorkoutHistoryStorage({
        factory,
        databaseName: `gymflow-neg-divprog-${dbSeq += 1}`,
      });
      await adapter.open();

      const state = baseDefaults();
      const core = toPersistedCoreState(state, 'gen-div-prog');
      storage.setItem(
        KEY,
        JSON.stringify({ v: HYBRID_STORAGE_VERSION, savedAt: '2026-09-04T12:00:00.000Z', data: core }),
      );

      const divergentState = {
        ...state,
        customPrograms: [{ id: 'prog-divergente', name: 'Outro Programa', workouts: [] }] as any,
      };
      storage.setItem(
        `${KEY}${STORAGE_BACKUP_SUFFIX}`,
        JSON.stringify({ v: 1, savedAt: '2026-08-01T12:00:00.000Z', data: divergentState }),
      );

      const outcome = await runStorageBootRecovery({ adapter, storage, key: KEY });
      expect(outcome.hydrationAllowed).toBe(false);
      expect(outcome.status).toBe('blocked-storage-unavailable');
    });

    it('backup com core divergente em gymProfile -> blocked-storage-unavailable', async () => {
      const storage = new MemoryStorage();
      const factory = new IDBFactory();
      const adapter = new IndexedDbWorkoutHistoryStorage({
        factory,
        databaseName: `gymflow-neg-divgym-${dbSeq += 1}`,
      });
      await adapter.open();

      const state = baseDefaults();
      const core = toPersistedCoreState(state, 'gen-div-gym');
      storage.setItem(
        KEY,
        JSON.stringify({ v: HYBRID_STORAGE_VERSION, savedAt: '2026-09-04T12:00:00.000Z', data: core }),
      );

      const divergentState = {
        ...state,
        gymProfile: {
          schemaVersion: 1,
          activeProfileId: 'profile-divergente',
          profiles: [{ id: 'profile-divergente', name: 'Outra Academia', kind: 'home', isDefault: true, equipment: [] }],
        } as any,
      };
      storage.setItem(
        `${KEY}${STORAGE_BACKUP_SUFFIX}`,
        JSON.stringify({ v: 1, savedAt: '2026-08-01T12:00:00.000Z', data: divergentState }),
      );

      const outcome = await runStorageBootRecovery({ adapter, storage, key: KEY });
      expect(outcome.hydrationAllowed).toBe(false);
      expect(outcome.status).toBe('blocked-storage-unavailable');
    });

    it('backup com core divergente em activeWorkout -> blocked-storage-unavailable', async () => {
      const storage = new MemoryStorage();
      const factory = new IDBFactory();
      const adapter = new IndexedDbWorkoutHistoryStorage({
        factory,
        databaseName: `gymflow-neg-divactive-${dbSeq += 1}`,
      });
      await adapter.open();

      const state = baseDefaults();
      const core = toPersistedCoreState(state, 'gen-div-active');
      storage.setItem(
        KEY,
        JSON.stringify({ v: HYBRID_STORAGE_VERSION, savedAt: '2026-09-04T12:00:00.000Z', data: core }),
      );

      const divergentState = {
        ...state,
        activeWorkout: { id: 'active-divergente', workoutId: 'w-divergente', date: '2026-09-04T12:00:00.000Z', exercises: [] } as any,
      };
      storage.setItem(
        `${KEY}${STORAGE_BACKUP_SUFFIX}`,
        JSON.stringify({ v: 1, savedAt: '2026-08-01T12:00:00.000Z', data: divergentState }),
      );

      const outcome = await runStorageBootRecovery({ adapter, storage, key: KEY });
      expect(outcome.hydrationAllowed).toBe(false);
      expect(outcome.status).toBe('blocked-storage-unavailable');
    });

    it('backup com workoutHistory inválido (sessão sem id) -> blocked-storage-unavailable', async () => {
      const storage = new MemoryStorage();
      const factory = new IDBFactory();
      const adapter = new IndexedDbWorkoutHistoryStorage({
        factory,
        databaseName: `gymflow-neg-badhist-${dbSeq += 1}`,
      });
      await adapter.open();

      const state = baseDefaults();
      const core = toPersistedCoreState(state, 'gen-bad-hist');
      storage.setItem(
        KEY,
        JSON.stringify({ v: HYBRID_STORAGE_VERSION, savedAt: '2026-09-04T12:00:00.000Z', data: core }),
      );

      // Sessão sem id
      const invalidBackupState = {
        ...state,
        workoutHistory: [{ name: 'Sem id', date: '2026-08-01' }] as any,
      };
      storage.setItem(
        `${KEY}${STORAGE_BACKUP_SUFFIX}`,
        JSON.stringify({ v: 1, savedAt: '2026-08-01T12:00:00.000Z', data: invalidBackupState }),
      );

      const outcome = await runStorageBootRecovery({ adapter, storage, key: KEY });
      expect(outcome.hydrationAllowed).toBe(false);
      expect(outcome.status).toBe('blocked-storage-unavailable');
    });

    it('Regra 6 & 10: IndexedDB vazio sozinho NUNCA autoriza recuperação de histórico vazio sem prova', async () => {
      const storage = new MemoryStorage();
      const factory = new IDBFactory();
      const adapter = new IndexedDbWorkoutHistoryStorage({
        factory,
        databaseName: `gymflow-neg-idbonly-${dbSeq += 1}`,
      });
      await adapter.open();

      // Core v2 órfão, IDB vazio, SEM backup no localStorage
      const state = baseDefaults();
      const core = toPersistedCoreState(state, 'gen-orphan-alone');
      storage.setItem(
        KEY,
        JSON.stringify({ v: HYBRID_STORAGE_VERSION, savedAt: '2026-09-04T12:00:00.000Z', data: core }),
      );

      const outcome = await runStorageBootRecovery({ adapter, storage, key: KEY });
      // Permanece fail-closed!
      expect(outcome.hydrationAllowed).toBe(false);
      expect(outcome.status).toBe('blocked-storage-unavailable');
    });
  });

  describe('Função pura verifyBackupV1Lineage', () => {
    it('aprova linhagem quando backup e core derivam do mesmo estado', () => {
      const state = baseDefaults();
      const core = toPersistedCoreState(state, 'gen-lineage-1');
      expect(verifyBackupV1Lineage(state, core)).toBe(true);
    });

    it('rejeita linhagem quando usuário diverge', () => {
      const state = baseDefaults();
      const core = toPersistedCoreState(state, 'gen-lineage-2');
      const divergent = { ...state, user: { ...state.user!, name: 'Nome Divergente' } };
      expect(verifyBackupV1Lineage(divergent, core)).toBe(false);
    });

    it('rejeita linhagem quando gymProfile diverge', () => {
      const state = baseDefaults();
      const core = toPersistedCoreState(state, 'gen-lineage-3');
      const divergent = { ...state, gymProfile: null };
      expect(verifyBackupV1Lineage(divergent, core)).toBe(false);
    });
  });
});

