import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { IndexedDbWorkoutHistoryStorage } from '../lib/storage-indexeddb';
import { createStorageAdminRuntime } from '../lib/storage-admin-runtime';
import { createHybridStorageRuntime } from '../lib/storage-hybrid';
import { createLogicalStorageExportV2, inspectLogicalStorageBackupV2 } from '../lib/storage-logical-backup';
import { commitLogicalStorageImportV2 } from '../lib/storage-logical-import';
import { createStorageAdminOwnerTokenCoordinator } from '../lib/storage-admin-owner-token';

class MemoryLocalStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
  removeItem(key: string): void { this.values.delete(key); }
}

const STORAGE_KEY = 'gymflow:persistedState';

describe('probe real round trip', () => {
  it('log do resultado real do commit', async () => {
    const storage = new MemoryLocalStorage();
    (globalThis as { indexedDB?: unknown }).indexedDB = new IDBFactory();

    const seed = {
      v: 1 as const,
      savedAt: '2026-07-23T10:00:00.000Z',
      data: {
        user: { name: 'Rafael', email: 'r@r.com', level: 'intermediate', goal: 'hypertrophy', gender: 'male', age: 28, weight: 80, height: 178, frequency: 4, duration: 60, location: 'gym', equipments: [], restrictions: [], muscleFocus: [], preference: '', xp: 0, streak: 0, waterIntake: 0, waterGoal: 3000, premiumStatus: 'free', points: 0, weeklyPlan: [], connectedSocials: [] },
        weeklyPlan: [],
        customPrograms: [],
        activeWorkout: null,
        activeWorkoutStartedAt: null,
        restTimerEndAt: null,
        restTimerTotalSeconds: null,
        restTimerLabel: null,
        workoutHistory: [{
          id: 'session-1',
          name: 'Treino A',
          date: '2026-07-23T10:00:00.000Z',
          duration: 42,
          calories: 300,
          xpEarned: 50,
          prsDetected: [],
          status: 'completed',
          startedAt: 1784000000000,
          exercises: [{
            id: 'entry-1',
            exerciseId: 'chest_supino_reto',
            name: 'Supino reto',
            muscleGroup: 'Peito',
            notes: '',
            entryOrigin: 'planned',
            sets: [{ id: 'set-1', reps: 10, weight: 60, completed: true }],
          }],
        }],
        weightHistory: [],
        measurementsHistory: [],
        nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
        achievements: [],
        challenges: [],
        favoriteExercises: [],
        recentlyViewedVideoIds: [],
      },
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(seed));

    const adapter = new IndexedDbWorkoutHistoryStorage();
    const hybrid = createHybridStorageRuntime({
      key: STORAGE_KEY,
      storage,
      adapter,
      defaults: {} as never,
    });
    const hydration = await hybrid.hydrate();
    console.log('MODE:', hydration.mode, 'GEN:', 'generationId' in hydration ? hydration.generationId : undefined, 'REASON:', 'reason' in hydration ? hydration.reason : undefined);

    const runtime = createStorageAdminRuntime({
      key: STORAGE_KEY,
      storage,
      adapter,
    });
    const exported = await createLogicalStorageExportV2({ runtime });
    console.log('EXPORT ok:', exported.ok, exported.ok ? exported.bytes : exported.reason);

    if (!exported.ok) {
      expect(true).toBe(false);
      return;
    }

    const inspected = await inspectLogicalStorageBackupV2(exported.content, exported.bytes);
    console.log('INSPECT ok:', inspected.ok, inspected.ok ? undefined : inspected.reason);
    if (!inspected.ok) {
      expect(true).toBe(false);
      return;
    }

    const owner = createStorageAdminOwnerTokenCoordinator({ key: STORAGE_KEY, storage });
    const commit = await commitLogicalStorageImportV2({
      raw: exported.content,
      declaredBytes: exported.bytes,
      expectedPayloadDigest: inspected.backup.payloadDigest,
      runtime: {
        inspectStorageAdministration: runtime.inspectStorageAdministration.bind(runtime),
        beginStorageOperation: runtime.beginStorageOperation.bind(runtime),
        transitionStorageOperation: runtime.transitionStorageOperation.bind(runtime),
      },
      adapter: {
        readMetadata: adapter.readMetadata.bind(adapter),
        stageHistoryGenerationForOperation: adapter.stageHistoryGenerationForOperation.bind(adapter),
        readVerifiedHistoryGeneration: adapter.readVerifiedHistoryGeneration.bind(adapter),
        rollbackToHistoryGeneration: adapter.rollbackToHistoryGeneration.bind(adapter),
        transitionStorageOperationIfUnambiguous: adapter.transitionStorageOperationIfUnambiguous.bind(adapter),
        revertStorageOperationAfterTransitionConflict: adapter.revertStorageOperationAfterTransitionConflict.bind(adapter),
        readStorageOperationReceipt: adapter.readStorageOperationReceipt.bind(adapter),
        clearInactiveGeneration: adapter.clearInactiveGeneration.bind(adapter),
      },
      storage,
      key: STORAGE_KEY,
      ownerToken: owner,
    });
    console.log('COMMIT:', JSON.stringify(commit, null, 2));
    expect(true).toBe(true);
  });
});