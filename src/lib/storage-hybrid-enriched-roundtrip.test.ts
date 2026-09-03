import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbWorkoutHistoryStorage } from './storage-indexeddb';
import { createHybridStorageRuntime } from './storage-hybrid';
import { createStorageAdminRuntime } from './storage-admin-runtime';
import {
  createLogicalStorageExportV2,
  inspectLogicalStorageBackupV2,
  validateLogicalBackupPayload,
} from './storage-logical-backup';
import { commitLogicalStorageImportV2 } from './storage-logical-import';
import {
  createEmptyPersistedState,
  type PersistedState,
  type StorageLike,
} from './storage-types';
import {
  createDefaultGymProfileState,
  type GymProfileState,
} from '../domain/gymProfile';
import type { WorkoutProgram, WorkoutSession } from '../types';

const KEY = 'gymflow:state:v1';
let dbSequence = 0;

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

async function createHarness(initialState?: Partial<PersistedState>, sessions?: WorkoutSession[]) {
  const storage = new MemoryStorage();
  const factory = new IDBFactory();
  const name = `gymflow-enriched-db-${dbSequence += 1}`;
  let generation = 0;

  const defaultState: PersistedState = {
    ...createEmptyPersistedState(),
    ...initialState,
  };

  const adapter = new IndexedDbWorkoutHistoryStorage({
    factory,
    databaseName: name,
    generationIdFactory: () => `gen-${generation += 1}`,
    now: () => new Date('2026-09-03T12:00:00.000Z'),
  });

  const hybrid = createHybridStorageRuntime({
    key: KEY,
    storage,
    adapter,
    defaults: defaultState,
    now: () => new Date('2026-09-03T12:00:00.000Z'),
  });

  const hydration = await hybrid.hydrate();
  if (hydration.mode !== 'hybrid-v2') {
    throw new Error(`Falha na hidratação: ${JSON.stringify(hydration)}`);
  }

  let activeGenerationId = hydration.generationId;
  if (sessions && sessions.length > 0) {
    activeGenerationId = await adapter.replaceHistory(sessions);
    const envelope = JSON.parse(storage.getItem(KEY) as string);
    envelope.data.historyStorage = { ...envelope.data.historyStorage, generationId: activeGenerationId };
    storage.setItem(KEY, JSON.stringify(envelope));
    await adapter.clearInactiveGeneration(hydration.generationId);
  }

  const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter });

  return {
    storage,
    factory,
    adapter,
    hybrid,
    runtime,
    activeGenerationId,
  };
}

describe('P0 — PersistedState / backup lógico v2 com GymProfile', () => {
  it('1. valida e aceita payload lógico com gymProfile presente', () => {
    const empty = createEmptyPersistedState();
    const gymProfile: GymProfileState = createDefaultGymProfileState();
    const payload: PersistedState = {
      ...empty,
      gymProfile,
    };

    const validation = validateLogicalBackupPayload(payload);
    expect(validation.status).toBe('valid');
    if (validation.status === 'valid') {
      expect(validation.payload.gymProfile).toEqual(gymProfile);
    }
  });

  it('2. aceita backup legado sem gymProfile (compatibilidade retroativa)', () => {
    const empty = createEmptyPersistedState();
    const legacyPayload = { ...empty };
    delete (legacyPayload as { gymProfile?: unknown }).gymProfile;

    expect('gymProfile' in legacyPayload).toBe(false);
    const validation = validateLogicalBackupPayload(legacyPayload);
    expect(validation.status).toBe('valid');
  });

  it('3. rejeita qualquer campo raiz desconhecido mantendo política fail-closed', () => {
    const empty = createEmptyPersistedState();
    const maliciousPayload = {
      ...empty,
      unauthorizedField: 'hacked',
    };

    const validation = validateLogicalBackupPayload(maliciousPayload);
    expect(validation.status).toBe('invalid');
    if (validation.status === 'invalid') {
      expect(validation.detail).toBe('O payload declara um campo raiz desconhecido.');
    }
  });

  it('4. export → import → export preserva GymProfile integralmente', async () => {
    const defaultState = createDefaultGymProfileState();
    const gymProfile: GymProfileState = {
      ...defaultState,
      profiles: defaultState.profiles.map((p) => ({
        ...p,
        name: 'Academia SmartFit Moema',
        equipment: p.equipment.map((eq) =>
          eq.equipmentId === 'cable_crossover' ? { ...eq, status: 'crowded' as const } : eq,
        ),
        plateCalculator: {
          barWeightKg: 20,
          availablePairsKg: [25, 20, 15, 10, 5, 2.5, 1.25],
        },
      })),
    };

    // Harness A com gymProfile
    const harnessA = await createHarness({ gymProfile });

    // Export 1
    const exportResultA = await createLogicalStorageExportV2({
      runtime: harnessA.runtime,
      now: new Date('2026-09-03T12:00:00.000Z'),
    });
    expect(exportResultA.ok).toBe(true);
    if (!exportResultA.ok) return;

    // Inspeciona e importa no Harness B
    const harnessB = await createHarness();
    const importResult = await commitLogicalStorageImportV2({
      raw: exportResultA.content,
      runtime: harnessB.runtime,
      adapter: harnessB.adapter,
      storage: harnessB.storage,
      key: KEY,
    });
    expect(importResult.ok).toBe(true);

    // Export 2 a partir do Harness B
    const exportResultB = await createLogicalStorageExportV2({
      runtime: harnessB.runtime,
      now: new Date('2026-09-03T12:00:00.000Z'),
    });
    expect(exportResultB.ok).toBe(true);
    if (!exportResultB.ok) return;

    // Inspeciona payload re-exportado
    const inspectionB = await inspectLogicalStorageBackupV2(exportResultB.content);
    expect(inspectionB.ok).toBe(true);
    if (!inspectionB.ok) return;

    expect(inspectionB.backup.payload.gymProfile).toEqual(gymProfile);
  });
});

describe('P3 — Cobertura de roundtrip híbrido com dados enriquecidos (GOAL-26 a 35)', () => {
  it('preserva dados enriquecidos (RIR, techniqueMetrics, progressionDecision, createdBy e gymProfile)', async () => {
    const defaultState = createDefaultGymProfileState();
    const gymProfile: GymProfileState = {
      ...defaultState,
      profiles: defaultState.profiles.map((p) => ({
        ...p,
        name: 'CT Ironberg',
        equipment: p.equipment.map((eq) =>
          eq.equipmentId === 'leg_press_45' ? { ...eq, status: 'available' as const } : eq,
        ),
      })),
    };

    const modernProgram: WorkoutProgram = {
      id: 'program-progression-v2',
      name: 'Hipertrofia Avançada Periodizada',
      description: 'Programa moderno com RIR e técnicas avançadas',
      durationWeeks: 4,
      frequencyDays: 3,
      level: 'advanced',
      objective: 'hypertrophy',
      exercises: [],
      repeatWeeks: true,
      weeks: [],
      createdBy: 'user', // GOAL-35
    };

    const modernSession: WorkoutSession = {
      id: 'session-enriched-1',
      date: '2026-09-03',
      name: 'Treino A — Supino e Técnicas Avançadas',
      duration: 3720,
      calories: 450,
      xpEarned: 220,
      totalVolume: 15400,
      prsDetected: ['Supino Reto 120kg'],
      status: 'completed',
      startedAt: 1788436800000,
      endedAt: 1788440520000,
      techniqueMetrics: {
        effectiveSets: 14,
        tonnage: 15400,
        fatigueIndex: 8,
        techniqueCount: 2,
      },
      exercises: [
        {
          id: 'entry-ex-1',
          exerciseId: 'chest_supino_reto',
          name: 'Supino Reto com Barra',
          muscleGroup: 'chest',
          notes: 'Execução pausada no peito',
          repRange: [8, 12],
          targetRPE: 9,
          restSec: 120,
          progressionNote: 'Subir 2kg na próxima semana',
          plannedSlotIndex: 0,
          entryOrigin: 'planned',
          entryStatus: 'performed',
          techniquePlan: {
            type: 'drop_set',
            stages: [],
          },
          progressionDecision: {
            pesoKg: 100,
            repsAlvo: 10,
            reasonCode: 'progress-weight',
            reasonText: 'Progressão dupla batida no topo da faixa',
            motivo: 'Progressão dupla batida no topo da faixa',
            action: 'progress',
            source: 'v2',
            changed: true,
            previousWeightKg: 95,
            targetRPE: 9,
            targetRIR: 1,
            effortSource: 'rir',
          },
          sets: [
            {
              id: 'set-warmup-1',
              reps: 15,
              weight: 40,
              completed: true,
              rpe: 5,
              rir: 5,
              isWarmup: true,
              warmupKind: 'approach',
            },
            {
              id: 'set-feeder-1',
              reps: 6,
              weight: 80,
              completed: true,
              rpe: 7,
              rir: 3,
              isWarmup: true,
              warmupKind: 'approach',
            },
            {
              id: 'set-working-1',
              reps: 10,
              weight: 100,
              completed: true,
              rpe: 9,
              rir: 1,
            },
            {
              id: 'set-dropset-1',
              reps: 12,
              weight: 70,
              completed: true,
              rpe: 10,
              rir: 0,
            },
          ],
        },
      ],
    };

    // 1. Setup harness com o estado moderno
    const harness = await createHarness(
      {
        gymProfile,
        customPrograms: [modernProgram],
      },
      [modernSession],
    );

    // 2. Exportação lógica v2
    const exportResult = await createLogicalStorageExportV2({
      runtime: harness.runtime,
      now: new Date('2026-09-03T12:00:00.000Z'),
    });
    expect(exportResult.ok).toBe(true);
    if (!exportResult.ok) return;

    // 3. Inspeção e validação do backup
    const inspection = await inspectLogicalStorageBackupV2(exportResult.content);
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) return;

    // Confirma que os campos enriquecidos estão presentes no payload
    const payload = inspection.backup.payload;
    expect(payload.gymProfile).toEqual(gymProfile);
    expect(payload.customPrograms[0].createdBy).toBe('user');

    const exportedSession = payload.workoutHistory[0];
    expect(exportedSession.techniqueMetrics).toBeDefined();
    expect(exportedSession.techniqueMetrics?.effectiveSets).toBe(14);
    expect(exportedSession.exercises[0].progressionDecision?.pesoKg).toBe(100);
    expect(exportedSession.exercises[0].sets[0].rir).toBe(5);
    expect(exportedSession.exercises[0].sets[0].warmupKind).toBe('approach');
    expect(exportedSession.exercises[0].techniquePlan?.type).toBe('drop_set');

    // 4. Importação em novo ambiente limpo
    const targetHarness = await createHarness();
    const importResult = await commitLogicalStorageImportV2({
      raw: exportResult.content,
      runtime: targetHarness.runtime,
      adapter: targetHarness.adapter,
      storage: targetHarness.storage,
      key: KEY,
    });
    expect(importResult.ok).toBe(true);

    // 5. Readback e verificação dos dados no target
    const metadata = await targetHarness.adapter.readMetadata();
    const importedGeneration = await targetHarness.adapter.readVerifiedHistoryGeneration(
      metadata.activeGeneration ?? '',
    );

    expect(importedGeneration.sessions).toHaveLength(1);
    const restoredSession = importedGeneration.sessions[0];
    expect(restoredSession.id).toBe('session-enriched-1');
    expect(restoredSession.techniqueMetrics?.effectiveSets).toBe(14);
    expect(restoredSession.exercises[0].progressionDecision?.pesoKg).toBe(100);
    expect(restoredSession.exercises[0].sets[0].rir).toBe(5);
    expect(restoredSession.exercises[0].sets[0].warmupKind).toBe('approach');
    expect(restoredSession.exercises[0].techniquePlan?.type).toBe('drop_set');

    // Confirma core persistido
    const coreEnvelope = JSON.parse(targetHarness.storage.getItem(KEY) ?? '{}');
    expect(coreEnvelope.data.gymProfile).toEqual(gymProfile);
    expect(coreEnvelope.data.customPrograms[0].createdBy).toBe('user');
  });
});
