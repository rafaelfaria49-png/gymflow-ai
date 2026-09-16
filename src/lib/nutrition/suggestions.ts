/**
 * GymFlow AI — Sugestões honestas de nutrição (NUT-006)
 *
 * Somente FoodReference verificado + cálculos determinísticos existentes.
 * - Ledger segue source of truth do consumo (não tocado aqui);
 * - NutritionEngine segue autoridade exclusiva dos targets (lidos, nunca
 *   recalculados/duplicados aqui);
 * - Nenhum rótulo de IA, nenhuma prescrição clínica, nenhum NUT-007.
 *
 * Função 100% pura: sem relógio, sem rede, sem storage, sem mutação do
 * catálogo. Ordem estável e previsível para a mesma entrada.
 */

import { scaleFoodReferenceToGrams } from './food-database';
import { isFoodReference, type FoodReference } from './food-types';
import type { DailyActuals } from './ledger-types';
import type { DailyTargets } from './engine-types';

export interface NutritionSuggestionPreview {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface NutritionSuggestion {
  referenceId: string;
  name: string;
  grams: number;
  servingDescription: string;
  preview: NutritionSuggestionPreview;
  /** Texto honesto exibido na UI (origem + números, sem promessa clínica). */
  reason: string;
}

export interface BuildNutritionSuggestionsInput {
  catalog: readonly FoodReference[];
  actuals: DailyActuals;
  targets: DailyTargets | null;
  limit?: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function sanitizeLimit(limit: unknown): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return 3;
  return Math.min(6, Math.max(1, Math.floor(limit)));
}

/**
 * Monta até `limit` sugestões determinísticas a partir do catálogo verificado.
 *
 * - Com targets AUTOMATED: prioriza alimentos cuja porção de referência cabe
 *   no restante calórico do dia, ordenados por proteína (maior primeiro),
 *   com desempate estável por nome e id. A porção sugerida é a
 *   `servingReferenceGrams` do próprio FoodReference (sem inventar porção).
 * - Sem targets (MANUAL_ONLY / null): devolve alimentos densos em proteína
 *   de forma determinística, com motivo explícito de ausência de meta.
 * - Catálogo vazio ou sem referência válida: [] honesto (UI mostra empty).
 */
export function buildNutritionSuggestions(input: BuildNutritionSuggestionsInput): NutritionSuggestion[] {
  const catalog = Array.isArray(input.catalog) ? input.catalog : [];
  const verified = catalog.filter(isFoodReference).filter((ref) => ref.verified === true);
  if (verified.length === 0) return [];
  const limit = sanitizeLimit(input.limit);

  const actuals = input.actuals;
  const hasActuals = actuals !== null
    && typeof actuals === 'object'
    && isFiniteNonNegative(actuals.calories)
    && isFiniteNonNegative(actuals.protein)
    && isFiniteNonNegative(actuals.carbs)
    && isFiniteNonNegative(actuals.fat);

  const targets = input.targets;
  const hasTargets = targets !== null
    && typeof targets === 'object'
    && isFiniteNonNegative(targets.targetCalories)
    && targets.targetCalories > 0
    && isFiniteNonNegative(targets.targetProteinGrams);

  if (hasTargets && hasActuals && targets !== null) {
    const remainingKcal = Math.max(0, targets.targetCalories - (actuals?.calories ?? 0));
    const remainingProtein = Math.max(0, targets.targetProteinGrams - (actuals?.protein ?? 0));
    const ranked = verified
      .map((ref) => {
        let scaled: { calories: number; protein: number; carbs: number; fat: number };
        try {
          scaled = scaleFoodReferenceToGrams(ref, ref.servingReferenceGrams);
        } catch {
          return null;
        }
        return { ref, scaled };
      })
      .filter((item): item is { ref: FoodReference; scaled: { calories: number; protein: number; carbs: number; fat: number } } => item !== null)
      // Cabe no restante (com folga honesta: nunca sugere porção acima do restante quando há restante).
      .filter((item) => (remainingKcal <= 0 ? true : item.scaled.calories <= remainingKcal + 1e-9))
      .sort((a, b) => {
        if (b.scaled.protein !== a.scaled.protein) return b.scaled.protein - a.scaled.protein;
        if (a.ref.name < b.ref.name) return -1;
        if (a.ref.name > b.ref.name) return 1;
        if (a.ref.id < b.ref.id) return -1;
        if (a.ref.id > b.ref.id) return 1;
        return 0;
      })
      .slice(0, limit);
    return ranked.map(({ ref, scaled }) => ({
      referenceId: ref.id,
      name: ref.name,
      grams: ref.servingReferenceGrams,
      servingDescription: ref.servingDescription,
      preview: {
        calories: scaled.calories,
        protein: scaled.protein,
        carbs: scaled.carbs,
        fat: scaled.fat,
      },
      reason: remainingKcal <= 0
        ? `${scaled.protein}g de proteína em ${scaled.calories} kcal (porção de ${ref.servingReferenceGrams}g) — meta calórica do dia já atingida; valores apenas informativos do catálogo verificado.`
        : `${scaled.protein}g de proteína em ${scaled.calories} kcal (porção de ${ref.servingReferenceGrams}g) — cabe no restante de hoje (${round1(remainingKcal)} kcal, ${round1(remainingProtein)}g prot.). Dado do catálogo verificado ${ref.source}.`,
    }));
  }

  // Sem metas ativas: exemplos determinísticos densos em proteína, sem prometer adequação.
  const fallback = verified
    .map((ref) => {
      let scaled: { calories: number; protein: number; carbs: number; fat: number };
      try {
        scaled = scaleFoodReferenceToGrams(ref, ref.servingReferenceGrams);
      } catch {
        return null;
      }
      const density = scaled.calories > 0 ? scaled.protein / scaled.calories : 0;
      return { ref, scaled, density };
    })
    .filter((item): item is { ref: FoodReference; scaled: { calories: number; protein: number; carbs: number; fat: number }; density: number } => item !== null)
    .sort((a, b) => {
      if (b.density !== a.density) return b.density - a.density;
      if (b.scaled.protein !== a.scaled.protein) return b.scaled.protein - a.scaled.protein;
      if (a.ref.name < b.ref.name) return -1;
      if (a.ref.name > b.ref.name) return 1;
      return 0;
    })
    .slice(0, limit);
  return fallback.map(({ ref, scaled }) => ({
    referenceId: ref.id,
    name: ref.name,
    grams: ref.servingReferenceGrams,
    servingDescription: ref.servingDescription,
    preview: {
      calories: scaled.calories,
      protein: scaled.protein,
      carbs: scaled.carbs,
      fat: scaled.fat,
    },
    reason: `Exemplo do catálogo verificado ${ref.source} (${scaled.protein}g prot. em ${scaled.calories} kcal por ${ref.servingReferenceGrams}g). Sem meta ativa — configure o perfil para metas automáticas. Não é prescrição.`,
  }));
}
