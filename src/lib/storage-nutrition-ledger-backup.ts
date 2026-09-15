/**
 * GymFlow AI — Section ledger-aware do backup lógico (GOAL-100 / NUT-004C LEDGER ADMIN)
 *
 * Section canônica obrigatória para schema 2:
 *   nutritionLedger: { days: NutritionDay[]; activeDate: string | null; migrationMarker: LedgerMigrationMarker | null }
 *
 * Duráveis: todos NutritionDay, activeNutritionDate, nutritionMigrationMarker.
 * Efêmeros (NUNCA serializados): nutritionAdminFence, ownerId/fenceId, operationId,
 * in-flight reconcile, provenRestoreTargetRef, qualquer metadata runtime.
 * Metadata nutricional desconhecida no backup schema 2: fail-closed.
 *
 * Este módulo é puro (sem I/O): validação total pré-write, canonicalização
 * determinística (days por date asc, meals/entries/hydration estáveis,
 * sorted-keys) e digest via `sha256Checksum` (nenhum hash paralelo).
 */

import { sha256Checksum } from './storage-history-integrity';
import {
  isCivilDateString,
  isLedgerMigrationMarker,
  isNutritionDay,
  type LedgerMigrationMarker,
  type NutritionDay,
} from './nutrition/ledger-types';
import { nutritionDayHasConsumption } from './nutrition/admin-gate';

export interface NutritionLedgerBackupSection {
  days: NutritionDay[];
  activeDate: string | null;
  migrationMarker: LedgerMigrationMarker | null;
}

export const NUTRITION_LEDGER_DIGEST_DOMAIN = 'gymflow:nutrition-ledger:v1:';

const DANGEROUS_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype'];

// Chaves efêmeras que NUNCA podem aparecer na section (fail-closed explícito).
const EPHEMERAL_LEDGER_KEYS: readonly string[] = [
  'nutritionAdminFence',
  'ownerId',
  'fenceId',
  'operationId',
  'inFlight',
  'in-flight',
  'provenRestoreTargetRef',
  'runtime',
  'runtimeMetadata',
];

const SECTION_KEYS: readonly string[] = ['days', 'activeDate', 'migrationMarker'];

const DAY_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'id',
  'date',
  'timezone',
  'meals',
  'hydrationEntries',
  'isClosed',
  'closedAt',
  'targetState',
  'targets',
  'targetUnavailableReason',
  'gateSnapshot',
]);

const MEAL_ALLOWED_KEYS: ReadonlySet<string> = new Set(['id', 'type', 'name', 'time', 'entries']);
const FOOD_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'id',
  'name',
  'quantityGrams',
  'calories',
  'protein',
  'carbs',
  'fat',
  'loggedAt',
  'foodReferenceId',
]);
const HYDRATION_ALLOWED_KEYS: ReadonlySet<string> = new Set(['id', 'amountMl', 'loggedAt']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export type NutritionLedgerSectionValidation =
  | { status: 'valid'; section: NutritionLedgerBackupSection }
  | { status: 'invalid'; reason: 'invalid-payload'; detail: string };

function invalid(detail: string): NutritionLedgerSectionValidation {
  return { status: 'invalid', reason: 'invalid-payload', detail };
}

function checkNoDangerousKeys(record: Record<string, unknown>, path: string): string | null {
  for (const key of Object.getOwnPropertyNames(record)) {
    if ((DANGEROUS_KEYS as readonly string[]).includes(key)) {
      return `A section nutricional declara chave perigosa em ${path}.`;
    }
  }
  if (Object.getOwnPropertySymbols(record).length > 0) {
    return `A section nutricional declara propriedade simbólica em ${path}.`;
  }
  return null;
}

function checkAllowedKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
): string | null {
  for (const key of Object.getOwnPropertyNames(record)) {
    if (!allowed.has(key)) {
      if ((EPHEMERAL_LEDGER_KEYS as readonly string[]).includes(key)) {
        return `A section nutricional carrega metadata efêmera ${key} em ${path}.`;
      }
      return `A section nutricional declara metadata desconhecida em ${path}.`;
    }
  }
  return null;
}

/**
 * Validação TOTAL pré-write da section nutricional.
 * Section parcialmente válida => backup inteiro inválido (o chamador propaga).
 * Nenhum write ocorre aqui (puro).
 */
export function validateNutritionLedgerBackupSection(value: unknown): NutritionLedgerSectionValidation {
  if (!isPlainObject(value)) return invalid('A section nutritionLedger não é um objeto.');
  const topDanger = checkNoDangerousKeys(value, 'nutritionLedger');
  if (topDanger) return invalid(topDanger);
  for (const key of Object.getOwnPropertyNames(value)) {
    if (!SECTION_KEYS.includes(key)) {
      if ((EPHEMERAL_LEDGER_KEYS as readonly string[]).includes(key)) {
        return invalid(`A section nutritionLedger carrega metadata efêmera ${key}.`);
      }
      return invalid('A section nutritionLedger declara campo desconhecido.');
    }
  }
  for (const key of SECTION_KEYS) {
    if (!hasOwn(value, key)) return invalid(`A section nutritionLedger não declara o campo ${key}.`);
  }

  const { days, activeDate, migrationMarker } = value as {
    days: unknown;
    activeDate: unknown;
    migrationMarker: unknown;
  };

  if (!Array.isArray(days)) return invalid('O campo days da section nutricional precisa ser um array.');
  const seen = new Set<string>();
  for (let index = 0; index < days.length; index += 1) {
    const day = days[index] as unknown;
    if (!isPlainObject(day)) return invalid(`O dia nutricional ${index} não é um objeto.`);
    const dayDanger = checkNoDangerousKeys(day, `nutritionLedger.days[${index}]`);
    if (dayDanger) return invalid(dayDanger);
    const dayAllowed = checkAllowedKeys(day, DAY_ALLOWED_KEYS, `nutritionLedger.days[${index}]`);
    if (dayAllowed) return invalid(dayAllowed);
    if (!isNutritionDay(day)) {
      return invalid(`O dia nutricional ${index} está incompleto ou incoerente (targets/gate/meals).`);
    }
    const date = (day as unknown as { date: string }).date;
    if (!isCivilDateString(date)) return invalid(`O dia nutricional ${index} tem data civil inválida.`);
    if (seen.has(date)) return invalid('A section nutricional contém dias duplicados.');
    seen.add(date);
    // Checagem de chaves aninhadas (meals/entries/hydration) — estável, sem reordenar.
    const meals = (day as unknown as { meals: unknown }).meals as unknown[];
    for (let m = 0; m < meals.length; m += 1) {
      const meal = meals[m] as unknown;
      if (!isPlainObject(meal)) return invalid(`A refeição ${m} do dia ${index} não é um objeto.`);
      const mealDanger = checkNoDangerousKeys(meal, `nutritionLedger.days[${index}].meals[${m}]`);
      if (mealDanger) return invalid(mealDanger);
      const mealAllowed = checkAllowedKeys(meal, MEAL_ALLOWED_KEYS, `nutritionLedger.days[${index}].meals[${m}]`);
      if (mealAllowed) return invalid(mealAllowed);
      const entries = (meal as unknown as { entries: unknown }).entries as unknown[];
      for (let e = 0; e < entries.length; e += 1) {
        const entry = entries[e] as unknown;
        if (!isPlainObject(entry)) return invalid(`A entrada ${e} da refeição ${m} do dia ${index} não é um objeto.`);
        const entryDanger = checkNoDangerousKeys(entry, `nutritionLedger.days[${index}].meals[${m}].entries[${e}]`);
        if (entryDanger) return invalid(entryDanger);
        const entryAllowed = checkAllowedKeys(entry, FOOD_ALLOWED_KEYS, `nutritionLedger.days[${index}].meals[${m}].entries[${e}]`);
        if (entryAllowed) return invalid(entryAllowed);
      }
    }
    const hydration = (day as unknown as { hydrationEntries: unknown }).hydrationEntries as unknown[];
    for (let h = 0; h < hydration.length; h += 1) {
      const entry = hydration[h] as unknown;
      if (!isPlainObject(entry)) return invalid(`A hidratação ${h} do dia ${index} não é um objeto.`);
      const hydDanger = checkNoDangerousKeys(entry, `nutritionLedger.days[${index}].hydrationEntries[${h}]`);
      if (hydDanger) return invalid(hydDanger);
      const hydAllowed = checkAllowedKeys(entry, HYDRATION_ALLOWED_KEYS, `nutritionLedger.days[${index}].hydrationEntries[${h}]`);
      if (hydAllowed) return invalid(hydAllowed);
    }
  }

  if (activeDate !== null) {
    if (!isCivilDateString(activeDate)) {
      return invalid('O campo activeDate da section nutricional precisa ser data civil ou null.');
    }
    if (!seen.has(activeDate as string)) {
      return invalid('O activeDate da section nutricional é órfão (ausente em days).');
    }
  }

  if (migrationMarker !== null && !isLedgerMigrationMarker(migrationMarker)) {
    return invalid('O migrationMarker da section nutricional está incoerente.');
  }

  // Cópia ordenada determinística (days por date asc) para uso canônico.
  const sorted = [...(days as NutritionDay[])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    status: 'valid',
    section: {
      days: sorted,
      activeDate: activeDate as string | null,
      migrationMarker: migrationMarker as LedgerMigrationMarker | null,
    },
  };
}

/** Section vazia canônica (schema 2 representa explicitamente days:[]). */
export function createEmptyNutritionLedgerSection(): NutritionLedgerBackupSection {
  return { days: [], activeDate: null, migrationMarker: null };
}

/** Consumo real: qualquer FoodEntry ou HydrationEntry (mesma regra do gate). */
export function nutritionLedgerSectionHasConsumption(section: NutritionLedgerBackupSection | null | undefined): boolean {
  if (!section || !Array.isArray(section.days)) return false;
  return section.days.some((day) => nutritionDayHasConsumption(day));
}

// Canonicalização determinística com sorted-keys (mesmo algoritmo do backup lógico:
// chaves ordenadas recursivamente, ordem de array preservada — days já ordenado asc).
function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonicalizeValue(record[key])]),
    );
  }
  return value;
}

/** Forma canônica da section (days asc + sorted-keys). Não cria hash paralelo. */
export function serializeNutritionLedgerCanonically(section: NutritionLedgerBackupSection): string {
  const normalized: NutritionLedgerBackupSection = {
    days: [...section.days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    activeDate: section.activeDate,
    migrationMarker: section.migrationMarker,
  };
  return JSON.stringify(canonicalizeValue(normalized));
}

export function nutritionLedgerDigestMaterial(canonicalLedger: string): string {
  return `${NUTRITION_LEDGER_DIGEST_DOMAIN}${canonicalLedger}`;
}

/** Digest da section (reutiliza sha256Checksum — nenhum hash paralelo). */
export async function computeNutritionLedgerDigest(
  section: NutritionLedgerBackupSection,
  subtleCrypto?: SubtleCrypto | null,
): Promise<string> {
  return sha256Checksum(nutritionLedgerDigestMaterial(serializeNutritionLedgerCanonically(section)), subtleCrypto);
}

/** Igualdade semântica (digest canônico + activeDate + marker). */
export async function nutritionLedgerSectionsEquivalent(
  left: NutritionLedgerBackupSection,
  right: NutritionLedgerBackupSection,
  subtleCrypto?: SubtleCrypto | null,
): Promise<boolean> {
  if (left.activeDate !== right.activeDate) return false;
  const leftMarker = left.migrationMarker === null ? null : JSON.stringify(canonicalizeValue(left.migrationMarker));
  const rightMarker = right.migrationMarker === null ? null : JSON.stringify(canonicalizeValue(right.migrationMarker));
  if (leftMarker !== rightMarker) return false;
  if (left.days.length !== right.days.length) return false;
  const [leftDigest, rightDigest] = await Promise.all([
    computeNutritionLedgerDigest(left, subtleCrypto),
    computeNutritionLedgerDigest(right, subtleCrypto),
  ]);
  return leftDigest === rightDigest;
}
