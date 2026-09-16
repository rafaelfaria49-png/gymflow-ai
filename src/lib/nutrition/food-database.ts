/**
 * GymFlow AI — FoodDatabase local (NUT-005 / GOAL-106)
 *
 * Busca offline em memória sobre referências verificadas, helper
 * determinístico de porções e ponte limpa para o NutritionLedger (NUT-004).
 *
 * Este módulo é puro fora a leitura do dataset estático: nenhuma rede, nenhum
 * relógio, nenhuma mutação do dataset. A busca nunca muta a entrada e produz
 * ordem estável e previsível para o mesmo catálogo e mesma query.
 *
 * Referências canônicas:
 * - docs/nutrition/GYMFLOW_NUTRITION_MASTERPLAN_001.md (Seções 4, 10 e 12)
 * - docs/nutrition/GYMFLOW_NUTRITION_DECISIONS_001.md (D-NUT-05, D-NUT-10)
 * - docs/nutrition/GYMFLOW_NUTRITION_IMPLEMENTATION_GOALS_001.md (NUT-005)
 *
 * Integração com o NUT-004 (sem substituir o ledger):
 * - ledger = source of truth do consumo;
 * - FoodReference = referência do alimento;
 * - DailyTargets = autoridade do NutritionEngine.
 * Nenhum alimento é gravado automaticamente no ledger: `toFoodEntryInput`
 * apenas monta o input validado para o futuro NUT-006 consumir.
 */

import canonicalBrFoods from '../../data/canonical-br-foods.json';
import {
  FoodDatabaseError,
  isFoodReference,
  type FoodReference,
} from './food-types';

// ============================================================================
// NORMALIZAÇÃO (CASE + ACCENT INSENSITIVE)
// ============================================================================

/**
 * Normalização canônica de texto de busca: trim, minúsculas, decomposição
 * NFD com remoção de diacríticos e colapso de espaços. Assim "arroz",
 * "ARROZ" e "arróz" produzem resultado equivalente.
 */
export function normalizeFoodSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

// ============================================================================
// CARREGAMENTO DO CATÁLOGO (VALIDAÇÃO INTEGRAL)
// ============================================================================

/**
 * Valida e congela registros brutos em referências do catálogo.
 *
 * - Todo registro precisa ser um FoodReference estruturalmente válido;
 * - Alimento oficial (CANONICAL_BR/USDA_FDC) sem `verified === true` é
 *   rejeitado (D-NUT-10: sem provenance verificável, não entra no catálogo);
 * - IDs duplicados são rejeitados (identidade estável exige unicidade).
 *
 * Falha fechada via FoodDatabaseError — nunca promove registro malformado.
 */
export function loadFoodCatalog(records: unknown): FoodReference[] {
  if (!Array.isArray(records)) {
    throw new FoodDatabaseError(
      'INVALID_FOOD_REFERENCE',
      'Catálogo de alimentos inválido: array de registros esperado.',
    );
  }
  const seen = new Set<string>();
  const catalog: FoodReference[] = [];
  for (const record of records) {
    if (!isFoodReference(record)) {
      throw new FoodDatabaseError(
        'INVALID_FOOD_REFERENCE',
        'Catálogo de alimentos inválido: registro malformado ou sem provenance auditável.',
      );
    }
    if ((record.source === 'CANONICAL_BR' || record.source === 'USDA_FDC') && record.verified !== true) {
      throw new FoodDatabaseError(
        'UNVERIFIED_OFFICIAL_FOOD',
        `Alimento oficial sem provenance verificável rejeitado: ${record.id} (D-NUT-10).`,
      );
    }
    if (seen.has(record.id)) {
      throw new FoodDatabaseError(
        'DUPLICATE_FOOD_ID',
        `ID de alimento duplicado no catálogo: ${record.id}.`,
      );
    }
    seen.add(record.id);
    catalog.push(record);
  }
  return Object.freeze(catalog) as FoodReference[];
}

/** Catálogo CANONICAL_BR V1 carregado e validado uma única vez (imutável). */
export const CANONICAL_BR_CATALOG: readonly FoodReference[] = loadFoodCatalog(
  canonicalBrFoods as unknown[],
);

// ============================================================================
// FOOD DATABASE (BUSCA LOCAL EM MEMÓRIA)
// ============================================================================

export interface FoodSearchOptions {
  /** Catálogo alternativo (ex.: fixtures de teste). Padrão: CANONICAL_BR V1. */
  catalog?: readonly FoodReference[];
  /** Teto de resultados (finito > 0). Padrão: sem teto. */
  limit?: number;
}

interface IndexedFood {
  reference: FoodReference;
  normalizedName: string;
  normalizedBrand: string | null;
}

/**
 * Banco de alimentos em memória: índice normalizado construído uma vez,
 * busca sem mutar o dataset, ordenação estável e previsível.
 */
export class FoodDatabase {
  private readonly entries: readonly IndexedFood[];

  constructor(records: readonly FoodReference[] = CANONICAL_BR_CATALOG) {
    const indexed: IndexedFood[] = [];
    const seen = new Set<string>();
    for (const reference of records) {
      if (!isFoodReference(reference)) {
        throw new FoodDatabaseError(
          'INVALID_FOOD_REFERENCE',
          'FoodDatabase rejeitou referência malformada na construção.',
        );
      }
      if (seen.has(reference.id)) {
        throw new FoodDatabaseError(
          'DUPLICATE_FOOD_ID',
          `ID de alimento duplicado no FoodDatabase: ${reference.id}.`,
        );
      }
      seen.add(reference.id);
      indexed.push({
        reference,
        normalizedName: normalizeFoodSearchText(reference.name),
        normalizedBrand: reference.brand === undefined
          ? null
          : normalizeFoodSearchText(reference.brand),
      });
    }
    this.entries = Object.freeze(indexed);
  }

  /** Quantidade de referências indexadas. */
  get size(): number {
    return this.entries.length;
  }

  /** Todas as referências (nova array a cada chamada; itens nunca mutados). */
  all(): FoodReference[] {
    return this.entries.map((entry) => entry.reference);
  }

  /** Busca por ID estável. Retorna null quando inexistente (sem throw). */
  getById(id: string): FoodReference | null {
    if (typeof id !== 'string') return null;
    const found = this.entries.find((entry) => entry.reference.id === id);
    return found ? found.reference : null;
  }

  /**
   * Busca local por texto: case-insensitive, accent-insensitive, com trim.
   * Cobre nome e brand (quando existir).
   *
   * Ranking determinístico (sem algoritmo excessivamente complexo):
   * 1. match exato do nome normalizado;
   * 2. prefixo do nome normalizado;
   * 3. substring do nome normalizado;
   * 4. match de brand (prefixo antes de substring);
   * Desempates: nome normalizado ascendente, depois id ascendente.
   *
   * Query vazia/em branco retorna [] (determinístico e testável).
   */
  search(query: string, options: FoodSearchOptions = {}): FoodReference[] {
    const catalog = options.catalog;
    const normalized = typeof query === 'string' ? normalizeFoodSearchText(query) : '';
    if (normalized.length === 0) return [];
    let limit = Number.POSITIVE_INFINITY;
    if (options.limit !== undefined) {
      if (
        typeof options.limit !== 'number'
        || !Number.isFinite(options.limit)
        || options.limit <= 0
      ) {
        return [];
      }
      limit = Math.floor(options.limit);
    }

    const source: readonly IndexedFood[] = catalog === undefined
      ? this.entries
      : catalog
        .filter(isFoodReference)
        .map((reference) => ({
          reference,
          normalizedName: normalizeFoodSearchText(reference.name),
          normalizedBrand: reference.brand === undefined
            ? null
            : normalizeFoodSearchText(reference.brand),
        }));

    const ranked: { rank: number; name: string; id: string; reference: FoodReference }[] = [];
    for (const entry of source) {
      const rank = rankFoodMatch(entry, normalized);
      if (rank === null) continue;
      ranked.push({
        rank,
        name: entry.normalizedName,
        id: entry.reference.id,
        reference: entry.reference,
      });
    }
    ranked.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
    return ranked.slice(0, limit).map((item) => item.reference);
  }
}

/**
 * Tier de relevância (menor = mais relevante) ou null quando não há match.
 * Prefixo/exato do nome vencem substring; brand só ranqueia abaixo do nome.
 */
function rankFoodMatch(entry: IndexedFood, normalizedQuery: string): number | null {
  if (entry.normalizedName === normalizedQuery) return 0;
  if (entry.normalizedName.startsWith(normalizedQuery)) return 1;
  if (entry.normalizedName.includes(normalizedQuery)) return 2;
  if (entry.normalizedBrand !== null) {
    if (entry.normalizedBrand === normalizedQuery) return 3;
    if (entry.normalizedBrand.startsWith(normalizedQuery)) return 3;
    if (entry.normalizedBrand.includes(normalizedQuery)) return 4;
  }
  return null;
}

/** Instância compartilhada sobre o catálogo CANONICAL_BR V1 (somente leitura). */
export const FOOD_DATABASE = new FoodDatabase(CANONICAL_BR_CATALOG);

/** Atalho puro de busca sobre o catálogo canônico (sem estado global mutável). */
export function searchFoods(query: string, options: FoodSearchOptions = {}): FoodReference[] {
  return FOOD_DATABASE.search(query, options);
}

// ============================================================================
// PORÇÕES E CÁLCULO (HELPER DETERMINÍSTICO)
// ============================================================================

/** Nutrientes escalados para a quantidade informada (etapa única, sem acúmulo). */
export interface ScaledFoodNutrients {
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sodiumMg?: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Converte FoodReference + quantidade em gramas nos nutrientes
 * correspondentes. Escala linear em etapa única a partir do per100g
 * (sem arredondamentos intermediários; arredonda só o resultado final em
 * 2 casas, de forma determinística).
 *
 * Rejeita gramagens NaN/Infinity/<= 0 e referências malformadas — nunca
 * inventa número.
 */
export function scaleFoodReferenceToGrams(
  reference: unknown,
  grams: unknown,
): ScaledFoodNutrients {
  if (!isFoodReference(reference)) {
    throw new FoodDatabaseError(
      'INVALID_FOOD_REFERENCE',
      'Escala de porção rejeitada: referência alimentar inválida.',
    );
  }
  if (typeof grams !== 'number' || !Number.isFinite(grams) || grams <= 0) {
    throw new FoodDatabaseError(
      'INVALID_PORTION_GRAMS',
      'Escala de porção rejeitada: quantidade em gramas deve ser finita maior que zero.',
    );
  }
  const factor = (grams as number) / 100;
  const per100g = reference.per100g;
  const scaled: ScaledFoodNutrients = {
    grams: grams as number,
    calories: round2(per100g.calories * factor),
    protein: round2(per100g.protein * factor),
    carbs: round2(per100g.carbs * factor),
    fat: round2(per100g.fat * factor),
  };
  if (per100g.fiber !== undefined) scaled.fiber = round2(per100g.fiber * factor);
  if (per100g.sodiumMg !== undefined) scaled.sodiumMg = round2(per100g.sodiumMg * factor);
  return scaled;
}

// ============================================================================
// PONTE PARA O NUT-004 (SEM ESCRITA AUTOMÁTICA NO LEDGER)
// ============================================================================

/**
 * Input de FoodEntry pronto para o ledger (forma de `AddFoodEntryInput` do
 * NUT-004), montado a partir de FoodReference + gramagem. Existe para que o
 * futuro NUT-006 (UI) não duplique regra nutricional: a conversão vive aqui.
 *
 * `id` e `loggedAt` são explícitos (função pura, sem relógio nem IDs
 * implícitos). Nada é gravado no ledger por esta função.
 */
export interface FoodEntryInputFromReference {
  id: string;
  name: string;
  quantityGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  loggedAt: string;
  foodReferenceId: string;
}

export function toFoodEntryInput(
  reference: unknown,
  grams: unknown,
  identity: unknown,
): FoodEntryInputFromReference {
  if (!isFoodReference(reference)) {
    throw new FoodDatabaseError(
      'INVALID_FOOD_REFERENCE',
      'Ponte para o ledger rejeitada: referência alimentar inválida.',
    );
  }
  if (
    typeof identity !== 'object'
    || identity === null
    || Array.isArray(identity)
    || typeof (identity as Record<string, unknown>)['id'] !== 'string'
    || ((identity as Record<string, unknown>)['id'] as string).trim().length === 0
    || typeof (identity as Record<string, unknown>)['loggedAt'] !== 'string'
    || ((identity as Record<string, unknown>)['loggedAt'] as string).trim().length === 0
  ) {
    throw new FoodDatabaseError(
      'INVALID_FOOD_REFERENCE',
      'Ponte para o ledger rejeitada: exige { id, loggedAt } textuais não vazios.',
    );
  }
  // Escala em etapa única (valida gramagem e arredonda só o resultado final).
  const nutrients = scaleFoodReferenceToGrams(reference, grams);
  const id = (identity as { id: string }).id;
  const loggedAt = (identity as { loggedAt: string }).loggedAt;
  return {
    id,
    name: reference.name,
    quantityGrams: nutrients.grams,
    calories: nutrients.calories,
    protein: nutrients.protein,
    carbs: nutrients.carbs,
    fat: nutrients.fat,
    loggedAt,
    foodReferenceId: reference.id,
  };
}
