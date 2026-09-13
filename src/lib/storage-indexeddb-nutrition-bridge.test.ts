/**
 * GymFlow AI — Durabilidade e concorrência do ledger (NUT-004B / GOAL-083)
 *
 * Cobre no fake-indexeddb real:
 * - logWater/logMacros via mutate atômico (read→mutate→validate→put, 1 tx)
 * - chamadas concorrentes sem lost update
 * - storage failure sem persistência parcial
 */

import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { calculateDailyTargets } from './nutrition/engine';
import type { DailyTargets } from './nutrition/engine-types';
import { createEvaluatedGateSnapshot, createProfileAbsentSnapshot } from './nutrition/gate-snapshot';
import { addHydrationEntry, calculateActuals } from './nutrition/ledger';
import { evaluateNutritionGate } from './nutrition/profile-gates';
import type { NutritionProfile } from '../types/nutrition';
import {
  GYMFLOW_INDEXEDDB_VERSION,
  IndexedDbWorkoutHistoryStorage,
  NutritionDayIntegrityError,
} from './storage-indexeddb';

let sequence = 5000;

function makeProfile(): NutritionProfile {
  return {
    age: 30,
    heightCm: 175,
    weightKg: 75,
    biologicalSexForCalcs: 'male',
    goal: 'maintenance',
    trainingFrequencyDaysPerWeek: 4,
    averageTrainingDurationMinutes: 60,
    nonExerciseActivity: 'moderately_active',
    dietaryPattern: 'omnivore',
    mealsPerDayPreference: 4,
    allergies: [],
    intolerances: [],
    avoidedFoods: [],
    healthFlags: [],
    timezone: 'America/Sao_Paulo',
    updatedAt: '2026-09-08T12:00:00.000Z',
  };
}

function makeTargets(): DailyTargets {
  return calculateDailyTargets(makeProfile());
}

function harness() {
  const factory = new IDBFactory();
  const name = `gymflow-nut004b-${(sequence += 1)}`;
  const adapter = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name });
  return { adapter, factory, name };
}

describe('NUT004B — escrita atômica do ledger', () => {
  it('mutate persiste hidratação de forma durável em 1 transação', async () => {
    const { adapter } = harness();
    await adapter.open();
    const date = '2026-09-12';
    await adapter.putNutritionDayIfAbsent({
      id: `nutrition-day-${date}`,
      date,
      timezone: 'America/Sao_Paulo',
      targetState: 'MANUAL_ONLY',
      targets: null,
      targetUnavailableReason: 'PROFILE_ABSENT',
      gateSnapshot: createProfileAbsentSnapshot('2026-09-12T14:00:00.000Z'),
      meals: [],
      hydrationEntries: [],
      isClosed: false,
      closedAt: null,
    });

    const next = await adapter.mutateNutritionDay(date, (current) => {
      if (!current) throw new Error('dia ausente');
      return addHydrationEntry(current, {
        id: 'hyd-1',
        amountMl: 250,
        loggedAt: '2026-09-12T14:00:00.000Z',
      });
    });

    expect(next.hydrationEntries).toHaveLength(1);
    const reread = await adapter.getNutritionDay(date);
    expect(reread).toEqual(next);
    expect(calculateActuals(next).waterMl).toBe(250);
    await adapter.close();
  });

  it('CONCURRENT_NUTRITION_LOST_UPDATE = NO: 20 hidratações concorrentes somam sem perda', async () => {
    const { adapter } = harness();
    await adapter.open();
    const date = '2026-09-12';
    await adapter.putNutritionDayIfAbsent({
      id: `nutrition-day-${date}`,
      date,
      timezone: 'America/Sao_Paulo',
      targetState: 'AUTOMATED',
      targets: makeTargets(),
      gateSnapshot: createEvaluatedGateSnapshot(
        evaluateNutritionGate(makeProfile()),
        '2026-09-12T14:00:00.000Z',
      ),
      meals: [],
      hydrationEntries: [],
      isClosed: false,
      closedAt: null,
    });

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        adapter.mutateNutritionDay(date, (current) => {
          if (!current) throw new Error('dia ausente');
          return addHydrationEntry(current, {
            id: `hyd-concurrent-${index}`,
            amountMl: 100,
            loggedAt: '2026-09-12T14:00:00.000Z',
          });
        }),
      ),
    );

    const final = await adapter.getNutritionDay(date);
    expect(final?.hydrationEntries).toHaveLength(20);
    expect(calculateActuals(final!).waterMl).toBe(2000);
    await adapter.close();
  }, 60000);

  it('falha de validação aborta sem persistir nada (sem mirror fantasma)', async () => {
    const { adapter } = harness();
    await adapter.open();
    const date = '2026-09-12';
    await adapter.putNutritionDayIfAbsent({
      id: `nutrition-day-${date}`,
      date,
      timezone: 'America/Sao_Paulo',
      targetState: 'MANUAL_ONLY',
      targets: null,
      targetUnavailableReason: 'PROFILE_ABSENT',
      gateSnapshot: createProfileAbsentSnapshot('2026-09-12T14:00:00.000Z'),
      meals: [],
      hydrationEntries: [],
      isClosed: false,
      closedAt: null,
    });

    await expect(
      adapter.mutateNutritionDay(date, () => ({ id: 'x' }) as never),
    ).rejects.toBeInstanceOf(NutritionDayIntegrityError);

    const reread = await adapter.getNutritionDay(date);
    expect(reread?.hydrationEntries).toEqual([]);
    expect(reread?.meals).toEqual([]);
    await adapter.close();
  });

  it('versão física segue 5 sem novo object store nutricional', async () => {
    expect(GYMFLOW_INDEXEDDB_VERSION).toBe(5);
    const { adapter, factory, name } = harness();
    await adapter.open();
    const request = factory.open(name, GYMFLOW_INDEXEDDB_VERSION);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(Array.from(database.objectStoreNames)).toContain('nutritionDays');
    expect(Array.from(database.objectStoreNames)).toContain('nutritionMetadata');
    database.close();
    await adapter.close();
  });
});
