/**
 * GymFlow AI — Gate temporário do admin lógico (GOAL-085, decisão temporária)
 *
 * Enquanto o NUT-004C não integrar `nutritionDays` + `nutritionMetadata` ao
 * formato lógico, as operações lógicas (export/import/restore/reset) NÃO podem
 * rodar sobre um ledger nutricional ativo: o arquivo omitiria silenciosamente
 * o ledger (export) ou o core divergiria do ledger sobrevivente (import /
 * restore / reset → ressurreição de consumo zerado).
 *
 * Este módulo NÃO implementa backup do ledger. Ele só responde, de forma
 * read-only, se existe consumo real persistido — e publica a razão/mensagem
 * honesta usada pelo Provider para bloquear antes de qualquer escrita.
 */

import type { NutritionDay } from './ledger-types';

/**
 * Razão pública tipada do bloqueio temporário. Reutilizada nas uniões de
 * falha de export/import/restore/reset do Provider.
 */
export const NUTRITION_LEDGER_ADMIN_DEFERRED_REASON = 'nutrition-ledger-admin-deferred' as const;

export type NutritionLedgerAdminDeferredReason = typeof NUTRITION_LEDGER_ADMIN_DEFERRED_REASON;

export const NUTRITION_LEDGER_ADMIN_DEFERRED_MESSAGE =
  'Backup, importação, restauração e reset lógicos estão temporariamente indisponíveis'
  + ' enquanto o livro nutricional não participa do snapshot completo.';

/** Capacidade mínima de leitura para a sonda (o adapter IDB real a implementa). */
export interface NutritionLedgerConsumptionProbe {
  listNutritionDays(options?: { from?: string; to?: string }): Promise<NutritionDay[]>;
}

/**
 * Consumo real num dia: qualquer FoodEntry ou HydrationEntry. Refeição vazia
 * (planejamento sem entradas) e dia zerado NÃO contam — não há dado do
 * usuário a perder ou ressuscitar.
 */
export function nutritionDayHasConsumption(day: NutritionDay | null | undefined): boolean {
  if (!day) return false;
  if (Array.isArray(day.hydrationEntries) && day.hydrationEntries.length > 0) return true;
  if (!Array.isArray(day.meals)) return false;
  return day.meals.some((meal) => Array.isArray(meal.entries) && meal.entries.length > 0);
}

/**
 * Sonda read-only: existe consumo nutricional real persistido?
 *
 * - Atalho em memória (dia corrente do Provider) — sem I/O.
 * - Varredura do repositório (dias anteriores) — só leitura.
 * - Fail-closed: sonda que falha ou devolve forma inesperada responde
 *   "ativo" — sem prova de ledger vazio, nenhuma operação parcial ocorre.
 * - Adapter sem a capacidade de leitura (mocks mínimos) responde "inativo":
 *   em produção o adapter real sempre a implementa.
 */
export async function hasActiveNutritionLedger(input: {
  currentDay?: NutritionDay | null;
  repository?: NutritionLedgerConsumptionProbe | null;
}): Promise<boolean> {
  if (nutritionDayHasConsumption(input.currentDay)) return true;
  const repository = input.repository;
  if (!repository || typeof repository.listNutritionDays !== 'function') return false;
  let days: NutritionDay[];
  try {
    days = await repository.listNutritionDays();
  } catch {
    return true;
  }
  if (!Array.isArray(days)) return true;
  return days.some(nutritionDayHasConsumption);
}
