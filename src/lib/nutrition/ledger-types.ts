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

import { COMPUTED_REASONS } from './engine-types';
import type {
  DailyTargets,
  EstimationToleranceReason,
  MacroConstraintCode,
} from './engine-types';
import { isStrictIsoUtcTimestamp } from './engine-validation';

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
 *
 * NUT-004B: estado discriminado de metas.
 * - AUTOMATED: snapshot completo de DailyTargets vigente na criação.
 * - MANUAL_ONLY: sem meta implícita; targets === null e motivo explícito.
 */
export type NutritionTargetState = 'AUTOMATED' | 'MANUAL_ONLY';

export const NUTRITION_TARGET_STATES: readonly NutritionTargetState[] = Object.freeze([
  'AUTOMATED',
  'MANUAL_ONLY',
]);

export type NutritionTargetUnavailableReason =
  | 'PROFILE_ABSENT'
  | 'AUTOMATION_BLOCKED'
  | 'TARGET_RESOLUTION_ERROR';

export const NUTRITION_TARGET_UNAVAILABLE_REASONS: readonly NutritionTargetUnavailableReason[] =
  Object.freeze(['PROFILE_ABSENT', 'AUTOMATION_BLOCKED', 'TARGET_RESOLUTION_ERROR']);

interface NutritionDayBase {
  id: string;
  /** Data civil no formato ISO 'YYYY-MM-DD' (ver `getCivilDateString`). */
  date: string;
  /** Fuso IANA vigente na criação (ex.: 'America/Sao_Paulo'). Nunca hardcodado. */
  timezone: string;
  meals: Meal[];
  hydrationEntries: HydrationEntry[];
  isClosed: boolean;
  /** Instante ISO do fechamento; null enquanto o dia está aberto. */
  closedAt: string | null;
}

/** Dia com metas automatizadas: snapshot completo e imutável, nunca null. */
export interface AutomatedNutritionDay extends NutritionDayBase {
  targetState: 'AUTOMATED';
  /** Snapshot completo e imutável dos alvos vigentes na criação do dia. */
  targets: DailyTargets;
  targetUnavailableReason?: never;
}

/** Dia de rastreio manual: sem meta implícita; remaining indisponível. */
export interface ManualNutritionDay extends NutritionDayBase {
  targetState: 'MANUAL_ONLY';
  targets: null;
  targetUnavailableReason: NutritionTargetUnavailableReason;
}

export type NutritionDay = AutomatedNutritionDay | ManualNutritionDay;

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
 *
 * NUT-004B: `reasons` preserva a quarentena UNKNOWN (classificação + motivos)
 * sem consumo, sem XP e sem inventar metas. Opcional para compatibilidade
 * com marcadores v1 já persistidos (ausência continua válida).
 */
export interface LedgerMigrationMarker {
  version: 1;
  status: 'completed';
  classification: LegacyDataClassification;
  migratedAt: string;
  source: 'legacy-nutrition-log';
  reasons?: string[];
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

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] as number;
}

/**
 * Data civil estrita 'YYYY-MM-DD' com existência real no calendário
 * (ex.: 2026-02-30 e 2026-04-31 falham; 2024-02-29 passa).
 * Aritmética pura de calendário — sem `Date`, sem timezone do runtime.
 */
export function isCivilDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = CIVIL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return day <= daysInMonth(year, month);
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

const MACRO_CONSTRAINT_CODES: readonly MacroConstraintCode[] = Object.freeze([
  'ENERGY_BELOW_MACRO_MINIMUMS',
  'NON_KETO_CARBS_PREFERENCE_UNMET',
]);

const ESTIMATION_TOLERANCE_REASONS: readonly EstimationToleranceReason[] = Object.freeze([
  'BIOLOGICAL_SEX_UNSPECIFIED',
  'NONE',
]);

function isMacroReconciliation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  for (const key of ['macroCalories', 'targetCalories', 'deltaKcal', 'roundingToleranceKcal'] as const) {
    if (!isFiniteNumber(value[key])) return false;
  }
  if (typeof value['isReconciled'] !== 'boolean') return false;
  const unmet = value['unmetConstraints'];
  if (!Array.isArray(unmet)) return false;
  return (unmet as unknown[]).every((code): boolean =>
    typeof code === 'string' && (MACRO_CONSTRAINT_CODES as readonly string[]).includes(code),
  );
}

function isEstimationTolerance(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value['relative']) || (value['relative'] as number) < 0) return false;
  if (
    typeof value['reason'] !== 'string'
    || !(ESTIMATION_TOLERANCE_REASONS as readonly string[]).includes(value['reason'])
  ) {
    return false;
  }
  if (!isFiniteNumber(value['targetCaloriesLowerKcal'])) return false;
  if (!isFiniteNumber(value['targetCaloriesUpperKcal'])) return false;
  return true;
}

/**
 * DailyTargets válido para snapshot do dia: contrato REAL completo de
 * `engine-types.ts` (identidade, proveniência temporal, alvos, decomposição
 * bioenergética, marcadores científicos e formas aninhadas obrigatórias).
 * null/undefined/objeto parcial ou com aninhado parcial falham de forma
 * explícita — nunca silenciosa. Nenhum `TypeError` genérico escapa: todos os
 * acessos aninhados são precedidos de guarda de registro.
 */
export function isDailyTargets(value: unknown): value is DailyTargets {
  if (!isRecord(value)) return false;
  const candidate = value as Record<string, unknown>;
  for (const key of ['id', 'engineVersion', 'formulaVersion', 'inputSnapshotHash'] as const) {
    if (!isNonEmptyString(candidate[key])) return false;
  }
  const computedAt = candidate['computedAt'];
  if (computedAt !== null && !isStrictIsoUtcTimestamp(computedAt)) return false;
  if (candidate['computedAtSource'] !== 'explicit_context' && candidate['computedAtSource'] !== 'absent') {
    return false;
  }
  if (
    typeof candidate['computedReason'] !== 'string'
    || !(COMPUTED_REASONS as readonly string[]).includes(candidate['computedReason'] as string)
  ) {
    return false;
  }
  const calories = candidate['targetCalories'];
  if (!isFiniteNumber(calories) || calories <= 0) return false;
  for (const key of ['targetProteinGrams', 'targetCarbsGrams', 'targetFatGrams', 'targetWaterMl'] as const) {
    const macro = candidate[key];
    if (!isFiniteNumber(macro) || macro < 0) return false;
  }
  for (const key of ['bmrKcal', 'tdeeKcal', 'energyBalanceKcal'] as const) {
    if (!isFiniteNumber(candidate[key])) return false;
  }
  if (candidate['scientificStatus'] !== 'PROVISIONAL_PENDING_PROFESSIONAL_REVIEW') return false;
  if (typeof candidate['isLimitedGuidance'] !== 'boolean') return false;
  for (const key of ['appliedCaloricFloor', 'effectiveProteinGramsPerKg', 'effectiveFatGramsPerKg'] as const) {
    const field = candidate[key];
    if (!isFiniteNumber(field) || field < 0) return false;
  }
  if (!isMacroReconciliation(candidate['macroReconciliation'])) return false;
  if (!isEstimationTolerance(candidate['estimationTolerance'])) return false;
  return true;
}

/**
 * Guarda de leitura de FoodEntry: mesmos limites inferiores da escrita
 * (NUT-001 + migração legada, que preserva caloria zero consolidada).
 * NaN/Infinity/negativos falham fechado — storage corrompido nunca vira dia.
 */
function isFoodEntryLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value['id']) || !isNonEmptyString(value['name'])) return false;
  if (!isNonEmptyString(value['loggedAt'])) return false;
  if (value['quantityGrams'] !== undefined) {
    if (!isFiniteNumber(value['quantityGrams']) || (value['quantityGrams'] as number) <= 0) return false;
  }
  const calories = value['calories'];
  if (!isFiniteNumber(calories) || (calories as number) < 0) return false;
  for (const key of ['protein', 'carbs', 'fat'] as const) {
    const macro = value[key];
    if (!isFiniteNumber(macro) || (macro as number) < 0) return false;
  }
  if (value['foodReferenceId'] !== undefined && typeof value['foodReferenceId'] !== 'string') return false;
  return true;
}

function isHydrationEntryLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value['id']) || !isNonEmptyString(value['loggedAt'])) return false;
  const amount = value['amountMl'];
  return isFiniteNumber(amount) && (amount as number) > 0;
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
 *
 * NUT-004B: valida todas as combinações do estado discriminado.
 * - AUTOMATED: targets obrigatório e válido; reason ausente.
 * - MANUAL_ONLY: targets === null; reason em PROFILE_ABSENT |
 *   AUTOMATION_BLOCKED | TARGET_RESOLUTION_ERROR.
 * - Legado sem targetState mas com targets válido: aceito como AUTOMATED
 *   (compatibilidade IDB v5 pré-004B); nunca promove null silencioso.
 */
export function isNutritionDay(value: unknown): value is NutritionDay {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value['id'])) return false;
  if (!isCivilDateString(value['date'])) return false;
  if (!isNonEmptyString(value['timezone'])) return false;
  const targetState = value['targetState'];
  const targets = value['targets'];
  const reason = value['targetUnavailableReason'];
  if (targetState === 'AUTOMATED') {
    if (!isDailyTargets(targets)) return false;
    if (reason !== undefined) return false;
  } else if (targetState === 'MANUAL_ONLY') {
    if (targets !== null) return false;
    if (
      reason !== 'PROFILE_ABSENT'
      && reason !== 'AUTOMATION_BLOCKED'
      && reason !== 'TARGET_RESOLUTION_ERROR'
    ) {
      return false;
    }
  } else if (targetState === undefined) {
    // Legado NUT-004A: sem targetState, com snapshot completo válido.
    if (!isDailyTargets(targets)) return false;
    if (reason !== undefined) return false;
  } else {
    return false;
  }
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

/** Guarda de dia automatizado (targets obrigatório e válido). */
export function isAutomatedNutritionDay(day: NutritionDay): boolean {
  const state = (day as unknown as Record<string, unknown>)['targetState'];
  if (state === undefined) return isDailyTargets(day.targets);
  return state === 'AUTOMATED' && isDailyTargets(day.targets);
}

/** Guarda de dia manual (sem meta implícita; remaining indisponível). */
export function isManualNutritionDay(day: NutritionDay): boolean {
  return (day as unknown as Record<string, unknown>)['targetState'] === 'MANUAL_ONLY' && day.targets === null;
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
  if (value['source'] !== 'legacy-nutrition-log') return false;
  if (value['reasons'] !== undefined) {
    if (!Array.isArray(value['reasons'])) return false;
    if (!(value['reasons'] as unknown[]).every((entry) => typeof entry === 'string')) return false;
  }
  return true;
}
