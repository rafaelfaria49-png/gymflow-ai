import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../types';
import type { WorkoutHistoryStorageAdapter } from './storage-adapter';
import {
  LEGACY_SNAPSHOTS_STORE,
  IndexedDbWorkoutHistoryStorage,
} from './storage-indexeddb';
import {
  HistoryMigrationIntegrityError,
  HistoryMigrationValidationError,
  checksumWorkoutHistory,
  migrateWorkoutHistoryFromV1,
  serializeWorkoutHistoryDeterministically,
} from './storage-history-migration';

let databaseSequence = 0;

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

function rawEnvelope(history?: unknown, version = 1): string {
  const data = history === undefined ? {} : {
    activeWorkout: null,
    activeWorkoutStartedAt: null,
    workoutHistory: history,
  };
  return JSON.stringify({
    v: version,
    savedAt: '2026-07-22T12:00:00.000Z',
    data,
  });
}

function createHarness() {
  const factory = new IDBFactory();
  const name = `gymflow-history-migration-${databaseSequence += 1}`;
  let generationSequence = 0;
  const adapter = new IndexedDbWorkoutHistoryStorage({
    factory,
    databaseName: name,
    generationIdFactory: () => `migration-generation-${generationSequence += 1}`,
    now: () => new Date('2026-07-22T15:00:00.000Z'),
  });
  return {
    adapter,
    factory,
    name,
    generationCount: () => generationSequence,
  };
}

function overrideAdapter(
  adapter: WorkoutHistoryStorageAdapter,
  overrides: Partial<WorkoutHistoryStorageAdapter>,
): WorkoutHistoryStorageAdapter {
  return {
    open: () => adapter.open(),
    close: () => adapter.close(),
    isAvailable: () => adapter.isAvailable(),
    readActiveHistory: () => adapter.readActiveHistory(),
    replaceHistory: (history) => adapter.replaceHistory(history),
    prepareHistoryGeneration: (history) => adapter.prepareHistoryGeneration(history),
    readHistoryGeneration: (generationId) => adapter.readHistoryGeneration(generationId),
    activateHistoryGeneration: (generationId) => adapter.activateHistoryGeneration(generationId),
    appendSession: (session) => adapter.appendSession(session),
    updateSession: (session) => adapter.updateSession(session),
    deleteSession: (sessionId) => adapter.deleteSession(sessionId),
    count: () => adapter.count(),
    readMetadata: () => adapter.readMetadata(),
    writeMetadata: (metadata) => adapter.writeMetadata(metadata),
    saveLegacySnapshot: (raw) => adapter.saveLegacySnapshot(raw),
    readLegacySnapshot: () => adapter.readLegacySnapshot(),
    clearInactiveGeneration: (generationId) => adapter.clearInactiveGeneration(generationId),
    ...overrides,
  };
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  const request = factory.open(name, 1);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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

async function corruptSnapshotRaw(factory: IDBFactory, name: string): Promise<void> {
  const database = await openDatabase(factory, name);
  const transaction = database.transaction(LEGACY_SNAPSHOTS_STORE, 'readwrite');
  const completed = transactionResult(transaction);
  const store = transaction.objectStore(LEGACY_SNAPSHOTS_STORE);
  const snapshot = await requestResult(store.get('v1-rollback')) as Record<string, unknown>;
  await requestResult(store.put({ ...snapshot, raw: '{"corrompido":true}' }));
  await completed;
  database.close();
}

async function migrate(
  raw: string,
  adapter: WorkoutHistoryStorageAdapter,
  checksumHistory?: (history: readonly WorkoutSession[]) => Promise<string>,
) {
  return migrateWorkoutHistoryFromV1({
    rawEnvelope: raw,
    adapter,
    now: () => new Date('2026-07-22T16:00:00.000Z'),
    checksumHistory,
  });
}

describe('migração v1 do workoutHistory', () => {
  it('rejeita envelope JSON inválido sem abrir o adapter', async () => {
    const { adapter } = createHarness();
    const result = await migrate('{inválido', adapter);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.error).toBeInstanceOf(HistoryMigrationValidationError);
  });

  it('rejeita versão desconhecida sem migração silenciosa', async () => {
    const { adapter } = createHarness();
    const result = await migrate(rawEnvelope([makeSession(1)], 2), adapter);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.error).toBeInstanceOf(HistoryMigrationValidationError);
  });

  it('distingue histórico ausente', async () => {
    const { adapter } = createHarness();
    await expect(migrate(rawEnvelope(), adapter)).resolves.toEqual({
      status: 'no-history',
      reason: 'absent',
    });
  });

  it('distingue histórico vazio', async () => {
    const { adapter } = createHarness();
    await expect(migrate(rawEnvelope([]), adapter)).resolves.toEqual({
      status: 'no-history',
      reason: 'empty',
    });
  });

  it.each([1, 100, 500, 1_000])(
    'migra e verifica integralmente %i sessões',
    async (size) => {
      const { adapter } = createHarness();
      const history = Array.from({ length: size }, (_, index) => makeSession(index));
      const result = await migrate(rawEnvelope(history), adapter);

      expect(result).toMatchObject({ status: 'migrated', sessions: size });
      expect(await adapter.readActiveHistory()).toEqual(history);
      expect(await adapter.readMetadata()).toMatchObject({
        migrationGeneration: null,
        migrationStatus: 'completed',
        migratedAt: '2026-07-22T16:00:00.000Z',
        sourceStorageVersion: 1,
      });
      expect(await adapter.readLegacySnapshot()).toMatchObject({ verified: true });
      await adapter.close();
    },
    30_000,
  );

  it('reutiliza a normalização legada do pipeline atual', async () => {
    const { adapter } = createHarness();
    const legacy = makeSession(1);
    delete legacy.status;

    const result = await migrate(rawEnvelope([legacy]), adapter);
    expect(result.status).toBe('migrated');
    expect((await adapter.readActiveHistory())[0]).toMatchObject({
      id: legacy.id,
      status: 'completed',
    });
    await adapter.close();
  });

  it('preserva ordem, conteúdo completo e campos dos GOALs 23A, 23B e 24', async () => {
    const { adapter } = createHarness();
    const history = [
      makeSession(3, { id: 'z', date: '2020-01-01' }),
      makeSession(1, { id: 'a', date: '2030-01-01' }),
      makeSession(2, { id: 'm', date: '2025-01-01' }),
    ];

    expect((await migrate(rawEnvelope(history), adapter)).status).toBe('migrated');
    expect(await adapter.readActiveHistory()).toEqual(history);
    await adapter.close();
  });

  it('serializa deterministicamente objetos com ordem de chaves diferente', async () => {
    const session = makeSession(1);
    const reordered = Object.fromEntries(Object.entries(session).reverse()) as unknown as WorkoutSession;
    expect(serializeWorkoutHistoryDeterministically([session]))
      .toBe(serializeWorkoutHistoryDeterministically([reordered]));
    expect(await checksumWorkoutHistory([session])).toBe(await checksumWorkoutHistory([reordered]));
  });

  it('rejeita IDs duplicados sem ativar staging parcial', async () => {
    const { adapter } = createHarness();
    const raw = rawEnvelope([
      makeSession(1, { id: 'duplicada' }),
      makeSession(2, { id: 'duplicada' }),
    ]);

    const result = await migrate(raw, adapter);
    expect(result.status).toBe('failed');
    expect(await adapter.readMetadata()).toMatchObject({
      activeGeneration: null,
      migrationGeneration: null,
      migrationStatus: 'failed',
    });
    expect(await adapter.readLegacySnapshot()).toMatchObject({ verified: true });
    await adapter.close();
  });

  it('trata sessão estruturalmente inválida como falha sem tocar no IndexedDB', async () => {
    const { adapter } = createHarness();
    const result = await migrate(rawEnvelope([null]), adapter);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.error).toBeInstanceOf(TypeError);
    await adapter.open();
    expect(await adapter.readMetadata()).toMatchObject({
      activeGeneration: null,
      migrationStatus: 'not-started',
    });
    await adapter.close();
  });

  it('falha quando o adapter não confirma o snapshot salvo', async () => {
    const { adapter } = createHarness();
    const unverified = overrideAdapter(adapter, {
      saveLegacySnapshot: async (raw) => ({
        ...await adapter.saveLegacySnapshot(raw),
        verified: false,
      }),
    });

    const result = await migrate(rawEnvelope([makeSession(1)]), unverified);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.error).toBeInstanceOf(HistoryMigrationIntegrityError);
    expect((await adapter.readMetadata()).activeGeneration).toBeNull();
    await adapter.close();
  });

  it('detecta corrupção do snapshot concluído sem criar outra geração', async () => {
    const { adapter, factory, name, generationCount } = createHarness();
    const raw = rawEnvelope([makeSession(1)]);
    expect((await migrate(raw, adapter)).status).toBe('migrated');
    await corruptSnapshotRaw(factory, name);

    const repeated = await migrate(raw, adapter);
    expect(repeated.status).toBe('failed');
    if (repeated.status === 'failed') expect(repeated.error).toBeInstanceOf(HistoryMigrationIntegrityError);
    expect(generationCount()).toBe(1);
    expect((await adapter.readActiveHistory()).map((session) => session.id)).toEqual(['session-1']);
    await adapter.close();
  });

  it('preserva geração anterior e snapshot quando staging falha', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const previous = await adapter.replaceHistory([makeSession(99)]);
    const originalError = new Error('falha induzida durante staging');
    const failing = overrideAdapter(adapter, {
      prepareHistoryGeneration: async () => {
        throw originalError;
      },
    });

    const result = await migrate(rawEnvelope([makeSession(1)]), failing);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.error).toBe(originalError);
    expect((await adapter.readMetadata()).activeGeneration).toBe(previous);
    expect((await adapter.readActiveHistory()).map((session) => session.id)).toEqual(['session-99']);
    expect(await adapter.readLegacySnapshot()).toMatchObject({ verified: true });

    const resumed = await migrate(rawEnvelope([makeSession(1)]), adapter);
    expect(resumed).toMatchObject({
      status: 'resumed',
      generationId: 'migration-generation-2',
    });
    await adapter.close();
  });

  it('retoma staging válido quando a execução falha logo após prepará-lo', async () => {
    const { adapter, generationCount } = createHarness();
    let failRead = true;
    const interrupted = overrideAdapter(adapter, {
      readHistoryGeneration: async (generationId) => {
        const history = await adapter.readHistoryGeneration(generationId);
        if (failRead) {
          failRead = false;
          throw new Error('interrupção após staging');
        }
        return history;
      },
    });
    const raw = rawEnvelope([makeSession(1), makeSession(2)]);

    expect((await migrate(raw, interrupted)).status).toBe('failed');
    const staged = (await adapter.readMetadata()).migrationGeneration;
    expect(staged).toBe('migration-generation-1');
    const resumed = await migrate(raw, adapter);
    expect(resumed).toMatchObject({ status: 'resumed', generationId: staged });
    expect(generationCount()).toBe(1);
    await adapter.close();
  });

  it.each([
    ['quantidade', (history: WorkoutSession[]) => history.slice(0, -1)],
    ['ordem', (history: WorkoutSession[]) => [...history].reverse()],
    ['conteúdo', (history: WorkoutSession[]) => history.map((session, index) => (
      index === 0 ? { ...session, name: 'Conteúdo divergente' } : session
    ))],
  ])('rejeita divergência de %s antes da ativação', async (_kind, mutate) => {
    const { adapter } = createHarness();
    const divergent = overrideAdapter(adapter, {
      readHistoryGeneration: async (generationId) => mutate(
        await adapter.readHistoryGeneration(generationId),
      ),
    });

    const result = await migrate(rawEnvelope([makeSession(1), makeSession(2)]), divergent);
    expect(result.status).toBe('failed');
    expect(await adapter.readMetadata()).toMatchObject({
      activeGeneration: null,
      migrationGeneration: null,
      migrationStatus: 'failed',
    });
    await adapter.close();
  });

  it('rejeita divergência de checksum antes da ativação', async () => {
    const { adapter } = createHarness();
    let checksumCalls = 0;
    const divergentChecksum = async (history: readonly WorkoutSession[]) => {
      checksumCalls += 1;
      const checksum = await checksumWorkoutHistory(history);
      return checksumCalls === 2 ? `${checksum}-divergente` : checksum;
    };

    const result = await migrate(
      rawEnvelope([makeSession(1)]),
      adapter,
      divergentChecksum,
    );
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.error).toBeInstanceOf(HistoryMigrationIntegrityError);
    expect((await adapter.readMetadata()).activeGeneration).toBeNull();
    await adapter.close();
  });

  it('não ativa a geração antes de verificar seu readback', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const previous = await adapter.replaceHistory([makeSession(99)]);
    let observedInactive = false;
    const observing = overrideAdapter(adapter, {
      readHistoryGeneration: async (generationId) => {
        const metadata = await adapter.readMetadata();
        expect(metadata.activeGeneration).toBe(previous);
        expect(metadata.migrationGeneration).toBe(generationId);
        observedInactive = true;
        return adapter.readHistoryGeneration(generationId);
      },
    });

    expect((await migrate(rawEnvelope([makeSession(1)]), observing)).status).toBe('migrated');
    expect(observedInactive).toBe(true);
    await adapter.close();
  });

  it('preserva staging e geração anterior quando a ativação falha', async () => {
    const { adapter } = createHarness();
    await adapter.open();
    const previous = await adapter.replaceHistory([makeSession(99)]);
    const failing = overrideAdapter(adapter, {
      activateHistoryGeneration: async () => {
        throw new Error('falha induzida na ativação');
      },
    });

    const result = await migrate(rawEnvelope([makeSession(1)]), failing);
    expect(result.status).toBe('failed');
    expect(await adapter.readMetadata()).toMatchObject({
      activeGeneration: previous,
      migrationGeneration: 'migration-generation-2',
      migrationStatus: 'failed',
    });
    expect((await adapter.readActiveHistory()).map((session) => session.id)).toEqual(['session-99']);

    const resumed = await migrate(rawEnvelope([makeSession(1)]), adapter);
    expect(resumed).toMatchObject({
      status: 'resumed',
      generationId: 'migration-generation-2',
    });
    expect((await adapter.readActiveHistory()).map((session) => session.id)).toEqual(['session-1']);
    await adapter.close();
  });

  it('retoma ativação confirmada quando metadata completed falha', async () => {
    const { adapter, generationCount } = createHarness();
    let failCompletion = true;
    const interrupted = overrideAdapter(adapter, {
      writeMetadata: async (metadata) => {
        if (metadata.migrationStatus === 'completed' && failCompletion) {
          failCompletion = false;
          throw new Error('interrupção antes da metadata final');
        }
        return adapter.writeMetadata(metadata);
      },
    });
    const raw = rawEnvelope([makeSession(1), makeSession(2)]);

    expect((await migrate(raw, interrupted)).status).toBe('failed');
    const afterFailure = await adapter.readMetadata();
    expect(afterFailure.activeGeneration).toBe('migration-generation-1');
    expect(afterFailure.migrationGeneration).toBe('migration-generation-1');
    expect(afterFailure.migrationStatus).toBe('failed');

    const resumed = await migrate(raw, adapter);
    expect(resumed).toMatchObject({
      status: 'resumed',
      generationId: 'migration-generation-1',
    });
    expect(generationCount()).toBe(1);
    expect(await adapter.readMetadata()).toMatchObject({
      migrationGeneration: null,
      migrationStatus: 'completed',
    });
    await adapter.close();
  });

  it('reconcilia geração ativa válida com metadata incompleta e staging já limpo', async () => {
    const { adapter, generationCount } = createHarness();
    const raw = rawEnvelope([makeSession(1), makeSession(2)]);
    expect((await migrate(raw, adapter)).status).toBe('migrated');
    await adapter.writeMetadata({
      migrationStatus: 'failed',
      migratedAt: null,
    });

    const resumed = await migrate(raw, adapter);
    expect(resumed).toMatchObject({
      status: 'resumed',
      generationId: 'migration-generation-1',
    });
    expect(generationCount()).toBe(1);
    expect(await adapter.readMetadata()).toMatchObject({
      activeGeneration: 'migration-generation-1',
      migrationGeneration: null,
      migrationStatus: 'completed',
    });
    await adapter.close();
  });

  it('reexecução concluída retorna already-completed sem nova geração', async () => {
    const { adapter, generationCount } = createHarness();
    const raw = rawEnvelope([makeSession(1), makeSession(2)]);
    const first = await migrate(raw, adapter);
    const repeated = await migrate(raw, adapter);

    expect(first).toMatchObject({ status: 'migrated', generationId: 'migration-generation-1' });
    expect(repeated).toMatchObject({
      status: 'already-completed',
      generationId: 'migration-generation-1',
    });
    expect(generationCount()).toBe(1);
    expect(await adapter.readLegacySnapshot()).toMatchObject({ verified: true });
    await adapter.close();
  });

  it('não consulta localStorage', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    let accessed = false;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        accessed = true;
        throw new Error('localStorage não deveria ser acessado');
      },
    });

    const { adapter } = createHarness();
    try {
      expect((await migrate(rawEnvelope([makeSession(1)]), adapter)).status).toBe('migrated');
      expect(accessed).toBe(false);
      await adapter.close();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
