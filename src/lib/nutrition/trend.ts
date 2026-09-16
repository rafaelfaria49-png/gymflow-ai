/**
 * GymFlow AI — Tendência nutricional honesta (NUT-006)
 *
 * Agregação pura sobre NutritionDays reais. Sem interpolar ou inventar dias:
 * somente dias existentes entram nos pontos; janelas de 7/30 dias filtram os
 * N dias reais mais recentes até a data de referência.
 */

import { calculateActuals } from './ledger';
import { isNutritionDay, type NutritionDay } from './ledger-types';

export interface NutritionTrendPoint {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
  targetCalories: number | null;
  targetProtein: number | null;
  targetWaterMl: number | null;
  hasTargets: boolean;
}

export interface BuildNutritionTrendInput {
  days: readonly NutritionDay[];
  /** Janela: exatamente 7 ou 30 (outro valor falha fechado com []). */
  daysCount: 7 | 30;
  /** Data civil de referência (YYYY-MM-DD). Padrão: último dia existente. */
  endDate?: string;
}

export interface NutritionTrendSummary {
  count: number;
  avgCalories: number | null;
  avgProtein: number | null;
  avgWaterMl: number | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isCivilDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Constrói pontos de tendência a partir de dias reais existentes.
 * Ordenação ascendente por data; sem preenchimento de dias ausentes.
 */
export function buildNutritionTrend(input: BuildNutritionTrendInput): NutritionTrendPoint[] {
  const daysCount = input.daysCount;
  if (daysCount !== 7 && daysCount !== 30) return [];
  const days = Array.isArray(input.days) ? input.days.filter(isNutritionDay) : [];
  if (days.length === 0) return [];

  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const endDate = isCivilDate(input.endDate) ? (input.endDate as string) : sorted[sorted.length - 1].date;
  const eligible = sorted.filter((day) => day.date <= endDate);
  if (eligible.length === 0) return [];
  const window = eligible.slice(-daysCount);

  return window.map((day) => {
    const actuals = calculateActuals(day);
    const hasTargets = day.targetState === 'AUTOMATED' && day.targets !== null;
    return {
      date: day.date,
      calories: actuals.calories,
      protein: actuals.protein,
      carbs: actuals.carbs,
      fat: actuals.fat,
      waterMl: actuals.waterMl,
      targetCalories: hasTargets && day.targets ? day.targets.targetCalories : null,
      targetProtein: hasTargets && day.targets ? day.targets.targetProteinGrams : null,
      targetWaterMl: hasTargets && day.targets ? day.targets.targetWaterMl : null,
      hasTargets,
    };
  });
}

/** Médias honestas somente sobre pontos existentes (null quando vazio). */
export function summarizeNutritionTrend(points: readonly NutritionTrendPoint[]): NutritionTrendSummary {
  const list = Array.isArray(points) ? points : [];
  if (list.length === 0) {
    return { count: 0, avgCalories: null, avgProtein: null, avgWaterMl: null };
  }
  let kcal = 0;
  let prot = 0;
  let water = 0;
  for (const point of list) {
    kcal += point.calories;
    prot += point.protein;
    water += point.waterMl;
  }
  return {
    count: list.length,
    avgCalories: round1(kcal / list.length),
    avgProtein: round1(prot / list.length),
    avgWaterMl: round1(water / list.length),
  };
}
