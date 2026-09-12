/**
 * GymFlow AI — Operações puras do NutritionLedger (NUT-004A / GOAL-077)
 *
 * Todas as funções são puras: nunca mutam a entrada (devolvem cópias),
 * nunca leem relógio nem geram IDs implicitamente — IDs e timestamps vêm do
 * chamador ou de factory injetada. Dia fechado rejeita qualquer edição.
 *
 * Referência: docs/nutrition/GYMFLOW_NUTRITION_MASTERPLAN_001.md (Seção 10).
 */

import type { DailyTargets } from './engine-types';
import {
  isCivilDateString,
  isDailyTargets,
  MEAL_TYPES,
  NutritionLedgerError,
  type DailyActuals,
  type FoodEntry,
  type HydrationEntry,
  type Meal,
  type MealType,
  type NutritionDay,
  type NutritionLedger,
  type Remaining,
} from './ledger-types';
import { isValidMacroInput, isValidWaterInput } from '../nutrition-validation';

// ============================================================================
// VALIDAÇÃO INTERNA
// ============================================================================

function assertValidTargets(targets: unknown): asserts targets is DailyTargets {
  if (!isDailyTargets(targets)) {
    throw new NutritionLedgerError(
      'INVALID_TARGETS',
      'A criação de NutritionDay exige um DailyTargets válido e completo; '
        + 'targets ausente, parcial ou não finito foi rejeitado (sem fallback, sem default).',
    );
  }
}

function assertDayOpen(day: NutritionDay): void {
  if (day.isClosed) {
    throw new NutritionLedgerError(
      'DAY_CLOSED',
      `O dia ${day.date} está fechado e não aceita edição.`,
    );
  }
}

function assertNonEmptyId(id: unknown, what: string): asserts id is string {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new NutritionLedgerError('INVALID_INPUT', `${what} exige um id textual não vazio.`);
  }
}

function assertLoggedAt(loggedAt: unknown, what: string): asserts loggedAt is string {
  if (typeof loggedAt !== 'string' || loggedAt.trim().length === 0) {
    throw new NutritionLedgerError('INVALID_INPUT', `${what} exige um loggedAt textual não vazio.`);
  }
}

function findMeal(day: NutritionDay, mealId: string): Meal {
  const meal = day.meals.find((candidate) => candidate.id === mealId);
  if (!meal) {
    throw new NutritionLedgerError('MEAL_NOT_FOUND', `Refeição ${mealId} não existe no dia ${day.date}.`);
  }
  return meal;
}

function assertUniqueMealId(day: NutritionDay, mealId: string): void {
  if (day.meals.some((meal) => meal.id === mealId)) {
    throw new NutritionLedgerError('DUPLICATE_ID', `Já existe uma refeição com id ${mealId} no dia ${day.date}.`);
  }
}

function assertUniqueFoodEntryId(day: NutritionDay, entryId: string): void {
  const exists = day.meals.some((meal) => meal.entries.some((entry) => entry.id === entryId));
  if (exists) {
    throw new NutritionLedgerError('DUPLICATE_ID', `Já existe um FoodEntry com id ${entryId} no dia ${day.date}.`);
  }
}

function assertUniqueHydrationId(day: NutritionDay, entryId: string): void {
  if (day.hydrationEntries.some((entry) => entry.id === entryId)) {
    throw new NutritionLedgerError(
      'DUPLICATE_ID',
      `Já existe um HydrationEntry com id ${entryId} no dia ${day.date}.`,
    );
  }
}

// ============================================================================
// CRIAÇÃO
// ============================================================================

export interface CreateNutritionDayInput {
  id: string;
  date: string;
  timezone: string;
  targets: DailyTargets;
}

/**
 * Cria um NutritionDay aberto com snapshot completo dos targets.
 * Falha de forma tipada quando os targets são inválidos/ausentes.
 */
export function createNutritionDay(input: CreateNutritionDayInput): NutritionDay {
  assertNonEmptyId(input.id, 'NutritionDay');
  if (!isCivilDateString(input.date)) {
    throw new NutritionLedgerError(
      'INVALID_DAY',
      `Data civil inválida para NutritionDay: ${String(input.date)} (esperado YYYY-MM-DD).`,
    );
  }
  if (typeof input.timezone !== 'string' || input.timezone.trim().length === 0) {
    throw new NutritionLedgerError('INVALID_DAY', 'NutritionDay exige um timezone IANA explícito.');
  }
  assertValidTargets(input.targets);

  return {
    id: input.id,
    date: input.date,
    timezone: input.timezone,
    // Snapshot completo: cópia explícita (inclusive aninhados) para que o dia
    // nunca observe mutação posterior do objeto de targets do chamador.
    targets: {
      ...input.targets,
      macroReconciliation: {
        ...input.targets.macroReconciliation,
        unmetConstraints: [...input.targets.macroReconciliation.unmetConstraints],
      },
      estimationTolerance: { ...input.targets.estimationTolerance },
    },
    meals: [],
    hydrationEntries: [],
    isClosed: false,
    closedAt: null,
  };
}

/**
 * Fecha o dia (idempotente: dia já fechado é devolvido inalterado).
 * `closedAt` é explícito — funções puras não leem o relógio.
 */
export function closeNutritionDay(day: NutritionDay, closedAt: string): NutritionDay {
  if (day.isClosed) return day;
  assertLoggedAt(closedAt, 'closeNutritionDay');
  return { ...day, isClosed: true, closedAt };
}

// ============================================================================
// REFEIÇÕES
// ============================================================================

export interface AddMealInput {
  id: string;
  type: MealType;
  name: string;
  time?: string;
}

/** Adiciona uma refeição (vazia ou não) ao dia aberto. */
export function addMeal(day: NutritionDay, meal: AddMealInput): NutritionDay {
  assertDayOpen(day);
  assertNonEmptyId(meal.id, 'Meal');
  if (!(MEAL_TYPES as readonly string[]).includes(meal.type)) {
    throw new NutritionLedgerError('INVALID_MEAL', `Tipo de refeição inválido: ${String(meal.type)}.`);
  }
  if (typeof meal.name !== 'string' || meal.name.trim().length === 0) {
    throw new NutritionLedgerError('INVALID_MEAL', 'Refeição exige um nome textual não vazio.');
  }
  if (meal.time !== undefined && typeof meal.time !== 'string') {
    throw new NutritionLedgerError('INVALID_MEAL', 'O campo time da refeição deve ser textual.');
  }
  assertUniqueMealId(day, meal.id);

  const created: Meal = {
    id: meal.id,
    type: meal.type,
    name: meal.name,
    ...(meal.time === undefined ? {} : { time: meal.time }),
    entries: [],
  };
  return { ...day, meals: [...day.meals, created] };
}

// ============================================================================
// FOOD ENTRIES
// ============================================================================

export interface AddFoodEntryInput {
  id: string;
  name: string;
  quantityGrams?: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  loggedAt: string;
  foodReferenceId?: string;
}

function toValidatedFoodEntry(entry: AddFoodEntryInput): FoodEntry {
  assertNonEmptyId(entry.id, 'FoodEntry');
  if (typeof entry.name !== 'string' || entry.name.trim().length === 0) {
    throw new NutritionLedgerError('INVALID_ENTRY', 'FoodEntry exige um nome textual não vazio.');
  }
  if (entry.quantityGrams !== undefined) {
    if (typeof entry.quantityGrams !== 'number' || !Number.isFinite(entry.quantityGrams) || entry.quantityGrams <= 0) {
      throw new NutritionLedgerError('INVALID_ENTRY', 'quantityGrams, quando informado, deve ser finito e > 0.');
    }
  }
  // Reúso NUT-001: calorias > 0 e < 15000, macros >= 0 e < 1000; rejeita
  // NaN, Infinity, negativos e tipos não numéricos.
  if (!isValidMacroInput(entry.calories, entry.protein, entry.carbs, entry.fat)) {
    throw new NutritionLedgerError(
      'INVALID_ENTRY',
      'Macros do FoodEntry fora dos limites NUT-001 (calorias > 0 e < 15000; macros >= 0 e < 1000; finitos).',
    );
  }
  assertLoggedAt(entry.loggedAt, 'FoodEntry');
  if (entry.foodReferenceId !== undefined && typeof entry.foodReferenceId !== 'string') {
    throw new NutritionLedgerError('INVALID_ENTRY', 'foodReferenceId, quando informado, deve ser textual.');
  }
  return {
    id: entry.id,
    name: entry.name,
    ...(entry.quantityGrams === undefined ? {} : { quantityGrams: entry.quantityGrams }),
    calories: entry.calories,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    loggedAt: entry.loggedAt,
    ...(entry.foodReferenceId === undefined ? {} : { foodReferenceId: entry.foodReferenceId }),
  };
}

/** Adiciona um alimento a uma refeição do dia aberto. */
export function addFoodEntry(day: NutritionDay, mealId: string, entry: AddFoodEntryInput): NutritionDay {
  assertDayOpen(day);
  const meal = findMeal(day, mealId);
  assertUniqueFoodEntryId(day, entry.id);
  const created = toValidatedFoodEntry(entry);
  return {
    ...day,
    meals: day.meals.map((candidate) => (
      candidate.id === meal.id ? { ...candidate, entries: [...candidate.entries, created] } : candidate
    )),
  };
}

export type UpdateFoodEntryPatch = Partial<
  Pick<FoodEntry, 'name' | 'quantityGrams' | 'calories' | 'protein' | 'carbs' | 'fat' | 'loggedAt' | 'foodReferenceId'>
> & { id?: string };

/** Atualiza um alimento existente; recalcula derivados por leitura (nada é cacheado). */
export function updateFoodEntry(
  day: NutritionDay,
  mealId: string,
  entryId: string,
  patch: UpdateFoodEntryPatch,
): NutritionDay {
  assertDayOpen(day);
  const meal = findMeal(day, mealId);
  const current = meal.entries.find((entry) => entry.id === entryId);
  if (!current) {
    throw new NutritionLedgerError('ENTRY_NOT_FOUND', `FoodEntry ${entryId} não existe na refeição ${mealId}.`);
  }
  if (patch.id !== undefined && patch.id !== entryId) {
    throw new NutritionLedgerError('INVALID_PATCH', 'O id de um FoodEntry é imutável e não pode ser alterado.');
  }
  const merged: AddFoodEntryInput = {
    id: current.id,
    name: patch.name ?? current.name,
    quantityGrams: patch.quantityGrams ?? current.quantityGrams,
    calories: patch.calories ?? current.calories,
    protein: patch.protein ?? current.protein,
    carbs: patch.carbs ?? current.carbs,
    fat: patch.fat ?? current.fat,
    loggedAt: patch.loggedAt ?? current.loggedAt,
    foodReferenceId: patch.foodReferenceId ?? current.foodReferenceId,
  };
  // quantityGrams omitido no original + ausente no patch permanece omitido
  // (nunca inventar gramagem); a validação completa roda sobre o mesclado.
  const updated = toValidatedFoodEntry(merged);
  return {
    ...day,
    meals: day.meals.map((candidate) => (
      candidate.id === meal.id
        ? { ...candidate, entries: candidate.entries.map((entry) => (entry.id === entryId ? updated : entry)) }
        : candidate
    )),
  };
}

/**
 * Remove um alimento. A refeição permanece mesmo vazia (nunca apagada
 * implicitamente).
 */
export function removeFoodEntry(day: NutritionDay, mealId: string, entryId: string): NutritionDay {
  assertDayOpen(day);
  const meal = findMeal(day, mealId);
  if (!meal.entries.some((entry) => entry.id === entryId)) {
    throw new NutritionLedgerError('ENTRY_NOT_FOUND', `FoodEntry ${entryId} não existe na refeição ${mealId}.`);
  }
  return {
    ...day,
    meals: day.meals.map((candidate) => (
      candidate.id === meal.id
        ? { ...candidate, entries: candidate.entries.filter((entry) => entry.id !== entryId) }
        : candidate
    )),
  };
}

// ============================================================================
// HIDRATAÇÃO
// ============================================================================

export interface AddHydrationEntryInput {
  id: string;
  amountMl: number;
  loggedAt: string;
}

/** Registra ingestão de água no dia aberto. */
export function addHydrationEntry(day: NutritionDay, entry: AddHydrationEntryInput): NutritionDay {
  assertDayOpen(day);
  assertNonEmptyId(entry.id, 'HydrationEntry');
  // Reúso NUT-001: finito e > 0; rejeita zero, negativos, NaN e Infinity.
  if (!isValidWaterInput(entry.amountMl)) {
    throw new NutritionLedgerError('INVALID_HYDRATION', 'amountMl deve ser um número finito maior que zero.');
  }
  assertLoggedAt(entry.loggedAt, 'HydrationEntry');
  assertUniqueHydrationId(day, entry.id);
  const created: HydrationEntry = { id: entry.id, amountMl: entry.amountMl, loggedAt: entry.loggedAt };
  return { ...day, hydrationEntries: [...day.hydrationEntries, created] };
}

/** Remove um registro de hidratação do dia aberto. */
export function removeHydrationEntry(day: NutritionDay, entryId: string): NutritionDay {
  assertDayOpen(day);
  if (!day.hydrationEntries.some((entry) => entry.id === entryId)) {
    throw new NutritionLedgerError('ENTRY_NOT_FOUND', `HydrationEntry ${entryId} não existe no dia ${day.date}.`);
  }
  return { ...day, hydrationEntries: day.hydrationEntries.filter((entry) => entry.id !== entryId) };
}

// ============================================================================
// DERIVADOS (única fonte de actuals/remaining)
// ============================================================================

const ZERO_ACTUALS: DailyActuals = Object.freeze({
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  waterMl: 0,
}) as DailyActuals;

/**
 * Totais consumidos derivados: macros/calorias somam FoodEntry;
 * água soma exclusivamente hydrationEntries (fonte única — Masterplan 9.1).
 */
export function calculateActuals(day: NutritionDay): DailyActuals {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  for (const meal of day.meals) {
    for (const entry of meal.entries) {
      calories += entry.calories;
      protein += entry.protein;
      carbs += entry.carbs;
      fat += entry.fat;
    }
  }
  let waterMl = 0;
  for (const entry of day.hydrationEntries) {
    waterMl += entry.amountMl;
  }
  return { calories, protein, carbs, fat, waterMl };
}

/** Saldo restante derivado: max(0, target - actual) por nutriente. */
export function calculateRemaining(targets: DailyTargets, actuals: DailyActuals): Remaining {
  assertValidTargets(targets);
  for (const [key, value] of Object.entries(actuals)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new NutritionLedgerError('INVALID_ACTUALS', `Actuals inválido em ${key}: deve ser finito e >= 0.`);
    }
  }
  const rest = (target: number, actual: number): number => Math.max(0, target - actual);
  return {
    calories: rest(targets.targetCalories, actuals.calories),
    protein: rest(targets.targetProteinGrams, actuals.protein),
    carbs: rest(targets.targetCarbsGrams, actuals.carbs),
    fat: rest(targets.targetFatGrams, actuals.fat),
    waterMl: rest(targets.targetWaterMl, actuals.waterMl),
  };
}

// ============================================================================
// CONTÊINER LÓGICO
// ============================================================================

/** Ledger vazio (forma lógica; a persistência desta slice é o IndexedDB). */
export function createEmptyNutritionLedger(): NutritionLedger {
  return { days: [], activeDate: null };
}

/** Seletor puro por data civil. */
export function findNutritionDay(ledger: NutritionLedger, date: string): NutritionDay | null {
  return ledger.days.find((day) => day.date === date) ?? null;
}

export { ZERO_ACTUALS };
