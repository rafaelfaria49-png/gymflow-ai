/**
 * GymFlow AI — Domínio puro do NutritionLedger (NUT-004A / GOAL-077)
 *
 * Tipos canônicos do livro contábil diário. Este módulo é 100% puro:
 * nenhuma leitura de relógio, nenhum acesso a storage, nenhuma mutação.
 *
 * Referências canônicas:
 * - docs/nutrition/GYMFLOW_NUTRITION_MASTERPLAN_001.md (Seções 10, 11 e 17)
 * - docs/nutrition/GYMFLOW_NUTRITION_IMPLEMENTATION_GOALS_001.md (NUT-004)
 *
 * Invariantes estruturais:
 * - NutritionDay armazena um snapshot COMPLETO de DailyTargets (nunca referência
 *   viva, nunca null silencioso, nunca fallback inventado).
 * - DailyActuals e Remaining NUNCA são persistidos como fonte de verdade: são
 *   sempre derivados por `calculateActuals` / `calculateRemaining` (ledger.ts).
 */

import type { DailyTargets } from './engine-types';

// ============================================================================
// TIPOS DE DOMÍNIO
// ============================================================================

/** Categorias padrão de refeição (Masterplan 10.1 item 5). */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'custom';

export const MEAL_TYPES: readonly MealType[] = Object.freeze([
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'custom',
]);

/**
 * Item alimentar registrado em uma refeição.
 *
 * `quantityGrams` é opcional: quando a gramagem é desconhecida (ex.: entrada
 * consolidada da migração legada) ela é omitida — nunca inventada.
 * `foodReferenceId` é um carimbo opaco nesta slice; a política de proveniência
 * (CANONICAL_BR/USDA/USER_CONFIRMED) pertence ao NUT-005 e não é antecipada aqui.
 */
export interface FoodEntry {
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

/** Registro único de ingestão de água. */
export interface HydrationEntry {
  id: string;
  amountMl: number;
  loggedAt: string;
}

/**
 * Refeição do dia. Uma refeição vazia (sem entradas) pode permanecer no dia:
 * ela representa intenção/planejamento e nunca é apagada implicitamente.
 */
export interface Meal {
  id: string;
  type: MealType;
  name: string;
  time?: string;
  entries: FoodEntry[];
}

/**
 * Totais consumidos — SEMPRE derivados de FoodEntry/HydrationEntry.
 * Nunca persistidos como fonte de verdade.
 */
export interface DailyActuals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
}

/**
 * Saldo restante — SEMPRE derivado: max(0, target - actual) por nutriente.
 * Nunca persistido como fonte de verdade.
 */
export interface Remaining {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
}

/**
 * Dia nutricional: unidade atômica do ledger, chaveada pela data civil
 * (YYYY-MM-DD) no fuso horário do usuário.
 */
export interface NutritionDay {
  id: string;
  /** Data civil no formato ISO 'YYYY-MM-DD' (ver `getCivilDateString`). */
  date: string;
  /** Fuso IANA vigente na criação (ex.: 'America/Sao_Paulo'). Nunca hardcodado. */
  timezone: string;
  /** Snapshot completo e imutável dos alvos vigentes na criação do dia. */
  targets: DailyTargets;
  meals: Meal[];
  hydrationEntries: HydrationEntry[];
  isClosed: boolean;
  /** Instante ISO do fechamento; null enquanto o dia está aberto. */
  closedAt: string | null;
}

/**
 * Contêiner do livro contábil. A persistência desta slice usa o repositório
 * IndexedDB (`nutritionDays` + `nutritionMetadata`); esta interface documenta
 * a forma lógica para as próximas slices (provider/backup).
 */
export interface NutritionLedger {
  days: NutritionDay[];
  activeDate: string | null;
}

/** Classificação canônica de carga legada (Masterplan 17.1). */
export type LegacyDataClassification =
  | 'LEGACY_EMPTY'
  | 'LEGACY_DEMO'
  | 'LEGACY_REAL'
  | 'UNKNOWN';

/**
 * Marcador de migração legada: prova durável de que a migração NUT-004
 * já foi avaliada, impedindo reclassificação e duplicatas em replays.
 */
export interface LedgerMigrationMarker {
  version: 1;
  status: 'completed';
  classification: LegacyDataClassification;
  migratedAt: string;
  source: 'legacy-nutrition-log';
}

// ============================================================================
// ERRO TIPADO
// ============================================================================

export type NutritionLedgerErrorCode =
  | 'INVALID_TARGETS'
  | 'INVALID_DAY'
  | 'INVALID_INPUT'
  | 'INVALID_ACTUALS'
  | 'DAY_CLOSED'
  | 'MEAL_NOT_FOUND'
  | 'ENTRY_NOT_FOUND'
  | 'DUPLICATE_ID'
  | 'INVALID_MEAL'
  | 'INVALID_ENTRY'
  | 'INVALID_HYDRATION'
  | 'INVALID_PATCH';

/**
 * Falha honesta e tipada do domínio do ledger. Nenhum caminho cria
 * NutritionDay com targets inválidos nem promove dado corrompido em silêncio.
 */
export class NutritionLedgerError extends Error {
  readonly code: NutritionLedgerErrorCode;

  constructor(code: NutritionLedgerErrorCode, message: string) {
    super(message);
    this.name = 'NutritionLedgerError';
    this.code = code;
    Object.setPrototypeOf(this, NutritionLedgerError.prototype);
  }
}

// ============================================================================
// GUARDS PUROS (reutilizados pelo ledger, migração, rollover e IndexedDB)
// ============================================================================

const CIVIL_DATE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Data civil estrita 'YYYY-MM-DD' com mês/dia em faixas válidas. */
export function isCivilDateString(value: unknown): value is string {
  return typeof value === 'string' && CIVIL_DATE_PATTERN.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * DailyTargets válido para snapshot do dia: identidade/proveniência presente e
 * todos os alvos numéricos finitos (calorias > 0, demais >= 0).
 * null/undefined/objeto parcial falham de forma explícita — nunca silenciosa.
 */
export function isDailyTargets(value: unknown): value is DailyTargets {
  if (!isRecord(value)) return false;
  const candidate = value as Record<string, unknown>;
  for (const key of ['id', 'engineVersion', 'formulaVersion', 'inputSnapshotHash'] as const) {
    if (!isNonEmptyString(candidate[key])) return false;
  }
  const calories = candidate['targetCalories'];
  if (!isFiniteNumber(calories) || calories <= 0) return false;
  for (const key of ['targetProteinGrams', 'targetCarbsGrams', 'targetFatGrams', 'targetWaterMl'] as const) {
    const macro = candidate[key];
    if (!isFiniteNumber(macro) || macro < 0) return false;
  }
  return true;
}

function isFoodEntryLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value['id']) || !isNonEmptyString(value['name'])) return false;
  if (!isNonEmptyString(value['loggedAt'])) return false;
  if (value['quantityGrams'] !== undefined) {
    if (!isFiniteNumber(value['quantityGrams']) || (value['quantityGrams'] as number) <= 0) return false;
  }
  for (const key of ['calories', 'protein', 'carbs', 'fat'] as const) {
    if (!isFiniteNumber(value[key])) return false;
  }
  if (value['foodReferenceId'] !== undefined && typeof value['foodReferenceId'] !== 'string') return false;
  return true;
}

function isHydrationEntryLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value['id']) || !isNonEmptyString(value['loggedAt'])) return false;
  return isFiniteNumber(value['amountMl']);
}

function isMealLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value['id']) || !isNonEmptyString(value['name'])) return false;
  if (typeof value['type'] !== 'string' || !(MEAL_TYPES as readonly string[]).includes(value['type'])) return false;
  if (value['time'] !== undefined && typeof value['time'] !== 'string') return false;
  if (!Array.isArray(value['entries'])) return false;
  return (value['entries'] as unknown[]).every(isFoodEntryLike);
}

/**
 * Guarda estrutural de NutritionDay para leitura de storage: rejeita payload
 * malformado em vez de promovê-lo a dia válido.
 */
export function isNutritionDay(value: unknown): value is NutritionDay {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value['id'])) return false;
  if (!isCivilDateString(value['date'])) return false;
  if (!isNonEmptyString(value['timezone'])) return false;
  if (!isDailyTargets(value['targets'])) return false;
  if (!Array.isArray(value['meals']) || !(value['meals'] as unknown[]).every(isMealLike)) return false;
  if (
    !Array.isArray(value['hydrationEntries'])
    || !(value['hydrationEntries'] as unknown[]).every(isHydrationEntryLike)
  ) {
    return false;
  }
  if (typeof value['isClosed'] !== 'boolean') return false;
  if (value['closedAt'] !== null && !isNonEmptyString(value['closedAt'])) return false;
  return true;
}

/** Guarda estrutural do marcador de migração para round-trip de storage. */
export function isLedgerMigrationMarker(value: unknown): value is LedgerMigrationMarker {
  if (!isRecord(value)) return false;
  if (value['version'] !== 1 || value['status'] !== 'completed') return false;
  const classification = value['classification'];
  if (
    classification !== 'LEGACY_EMPTY'
    && classification !== 'LEGACY_DEMO'
    && classification !== 'LEGACY_REAL'
    && classification !== 'UNKNOWN'
  ) {
    return false;
  }
  if (!isNonEmptyString(value['migratedAt'])) return false;
  return value['source'] === 'legacy-nutrition-log';
}
