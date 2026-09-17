/**
 * GymFlow AI — Fixtures compartilhadas do NUT-008 (QA integrada).
 *
 * Somente testes: não entra no barrel `index.ts` e não é importado por UI.
 */

import type { NutritionProfile } from '../../types/nutrition';
import { calculateDailyTargets } from './engine';
import type { DailyTargets } from './engine-types';
import { createEvaluatedGateSnapshot, createProfileAbsentSnapshot } from './gate-snapshot';
import {
  addFoodEntry,
  addHydrationEntry,
  addMeal,
  createNutritionDay,
} from './ledger';
import type { NutritionDay } from './ledger-types';
import { evaluateNutritionGate } from './profile-gates';
import { FOOD_DATABASE, toFoodEntryInput } from './food-database';

export const NUT008_NOW_ISO = '2026-09-16T15:00:00.000Z';
export const NUT008_TZ = 'America/Sao_Paulo';

export function createNut008Profile(overrides: Partial<NutritionProfile> = {}): NutritionProfile {
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
    timezone: NUT008_TZ,
    updatedAt: NUT008_NOW_ISO,
    ...overrides,
  };
}

export function createNut008AutomatedGateSnapshot(profile: NutritionProfile = createNut008Profile()) {
  return createEvaluatedGateSnapshot(evaluateNutritionGate(profile), NUT008_NOW_ISO);
}

export function createNut008ProfileAbsentSnapshot() {
  return createProfileAbsentSnapshot(NUT008_NOW_ISO);
}

export function createNut008EmptyDay(date: string, targets: DailyTargets, profile?: NutritionProfile): NutritionDay {
  return createNutritionDay({
    id: `nut008-day-${date}`,
    date,
    timezone: NUT008_TZ,
    targets,
    gateSnapshot: createNut008AutomatedGateSnapshot(profile),
  });
}

export function createNut008ConsumedDay(
  date: string,
  targets: DailyTargets,
  options: { chickenGrams?: number; waterMl?: number; profile?: NutritionProfile } = {},
): NutritionDay {
  const chicken = FOOD_DATABASE.getById('br-peito-frango-grelhado');
  if (!chicken) throw new Error('Catálogo V1 sem br-peito-frango-grelhado — NUT-005 regressão.');
  const grams = options.chickenGrams ?? 150;
  const waterMl = options.waterMl ?? 500;
  const loggedAt = `${date}T12:00:00.000Z`;
  let day = createNut008EmptyDay(date, targets, options.profile);
  day = addMeal(day, { id: `meal-${date}`, type: 'lunch', name: 'Almoço', time: '12:00' });
  day = addFoodEntry(day, `meal-${date}`, toFoodEntryInput(chicken, grams, { id: `food-${date}`, loggedAt }));
  day = addHydrationEntry(day, { id: `water-${date}`, amountMl: waterMl, loggedAt });
  return day;
}

export function createNut008ManualOnlyDay(
  date: string,
  reason: 'PROFILE_ABSENT' | 'AUTOMATION_BLOCKED' = 'PROFILE_ABSENT',
): NutritionDay {
  const gateSnapshot = reason === 'PROFILE_ABSENT'
    ? createNut008ProfileAbsentSnapshot()
    : createEvaluatedGateSnapshot(
      evaluateNutritionGate(createNut008Profile({ healthFlags: ['pregnancy'] })),
      NUT008_NOW_ISO,
    );
  return createNutritionDay({
    id: `nut008-manual-${date}`,
    date,
    timezone: NUT008_TZ,
    targets: null,
    targetState: 'MANUAL_ONLY',
    targetUnavailableReason: reason,
    gateSnapshot,
  });
}

export function nut008SharedTargets(): DailyTargets {
  return calculateDailyTargets(createNut008Profile());
}

export function civilDateUtc(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function addUtcDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day + days);
  return new Date(utc).toISOString().slice(0, 10);
}
