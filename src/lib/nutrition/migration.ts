/**
 * GymFlow AI — Migração legada pura do NutritionLedger (NUT-004A / GOAL-077)
 *
 * Classificação e migração 100% puras do `NutritionLog` legado
 * `{ calories, protein, carbs, fat, water }` (+ `user.waterIntake`).
 * Nenhum acesso a storage, nenhum XP, nenhum relógio implícito.
 *
 * Regras canônicas (Masterplan 17 + auditoria NUT-004/GOAL-076):
 * - UNKNOWN tem prioridade sobre qualquer promoção e nunca gera FoodEntry
 *   confirmado, HydrationEntry confirmado, DailyActuals ou XP (aqui: day null).
 * - LEGACY_DEMO (seed 1420/110/150/45/1200) é descartado do ledger real.
 * - LEGACY_REAL vira entrada consolidada legada em refeição `custom`.
 * - Hidratação legada NUNCA soma `nutrition.water + user.waterIntake`: uma única
 *   HydrationEntry com `max(nutrition.water, user.waterIntake)` (anti-duplicidade).
 * - Migração idempotente: IDs determinísticos por data; reaplicar sobre o mesmo
 *   input e persistir pela chave natural (date) nunca cria duplicatas.
 */

import type { DailyTargets } from './engine-types';
import { createNutritionDay } from './ledger';
import {
  isCivilDateString,
  NutritionLedgerError,
  type LegacyDataClassification,
  type NutritionDay,
} from './ledger-types';
import { isValidWaterInput } from '../nutrition-validation';

/** Seed demonstrativo comprovado que contamina resets legados (Masterplan 2.1.8). */
export const LEGACY_DEMO_SEED = Object.freeze({
  calories: 1420,
  protein: 110,
  carbs: 150,
  fat: 45,
  water: 1200,
});

/** Nome canônico da refeição consolidada da migração real. */
export const LEGACY_CONSOLIDATED_MEAL_NAME = 'Consumo consolidado legado';

/** Limites NUT-001 reaproveitados para preservação (sem exigir calorias > 0). */
const LEGACY_MACRO_UPPER_BOUNDS = Object.freeze({
  calories: 15000,
  macros: 1000,
});

/**
 * `user.waterIntake` compatível com resíduo demo (GOAL-079):
 * ausente, zerado ou o próprio espelho demo de 1200 ml. Qualquer outro valor
 * válido indica hidratação real registrada pelo usuário e impede o descarte
 * como DEMO (Masterplan 17: sem perda de informações reais).
 */
const DEMO_COMPATIBLE_WATER_INTAKES: readonly number[] = Object.freeze([0, 1200]);

interface ClassifiedLegacy {
  classification: LegacyDataClassification;
  reasons: string[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkLegacyNumber(
  problems: string[],
  holder: string,
  field: string,
  value: unknown,
): value is number {
  if (typeof value !== 'number') {
    problems.push(`${holder}.${field}: tipo incorreto (${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value})`);
    return false;
  }
  if (!Number.isFinite(value)) {
    problems.push(`${holder}.${field}: não finito (${String(value)})`);
    return false;
  }
  if (value < 0) {
    problems.push(`${holder}.${field}: negativo (${String(value)})`);
    return false;
  }
  return true;
}

function classifyWithReasons(nutrition: unknown, userWaterIntake?: unknown): ClassifiedLegacy {
  const problems: string[] = [];
  if (!isPlainRecord(nutrition)) {
    return { classification: 'UNKNOWN', reasons: ['nutrition: payload malformado (não é um objeto)'] };
  }
  let sound = true;
  const values: Record<string, number> = {};
  for (const field of ['calories', 'protein', 'carbs', 'fat', 'water'] as const) {
    const value: unknown = (nutrition as Record<string, unknown>)[field];
    if (!checkLegacyNumber(problems, 'nutrition', field, value)) {
      sound = false;
    } else {
      values[field] = value as number;
    }
  }
  if (userWaterIntake !== undefined && userWaterIntake !== null) {
    if (!checkLegacyNumber(problems, 'user', 'waterIntake', userWaterIntake)) {
      sound = false;
    }
  }
  // UNKNOWN tem prioridade sobre qualquer promoção.
  if (!sound) return { classification: 'UNKNOWN', reasons: problems };

  // Fora dos tetos NUT-001 (calorias/macros) nunca é dado real migrável:
  // UNKNOWN → quarentena, nunca LEGACY_REAL → exceção no migrate (GOAL-079).
  // Água sem teto canônico: nenhum teto arbitrário é inventado aqui (dívida P2
  // LEGACY_WATER_NO_CEILING); apenas finitude/>= 0 são exigidos acima.
  if (values['calories'] >= LEGACY_MACRO_UPPER_BOUNDS.calories) {
    return {
      classification: 'UNKNOWN',
      reasons: [...problems, `nutrition.calories: fora do teto NUT-001 (${String(values['calories'])})`],
    };
  }
  for (const field of ['protein', 'carbs', 'fat'] as const) {
    if (values[field] >= LEGACY_MACRO_UPPER_BOUNDS.macros) {
      return {
        classification: 'UNKNOWN',
        reasons: [...problems, `nutrition.${field}: fora do teto NUT-001 (${String(values[field])})`],
      };
    }
  }

  const intake = typeof userWaterIntake === 'number' ? userWaterIntake : 0;
  const allZero = values['calories'] === 0
    && values['protein'] === 0
    && values['carbs'] === 0
    && values['fat'] === 0
    && values['water'] === 0
    && intake === 0;
  if (allZero) return { classification: 'LEGACY_EMPTY', reasons: [] };

  const isDemo = values['calories'] === LEGACY_DEMO_SEED.calories
    && values['protein'] === LEGACY_DEMO_SEED.protein
    && values['carbs'] === LEGACY_DEMO_SEED.carbs
    && values['fat'] === LEGACY_DEMO_SEED.fat
    && values['water'] === LEGACY_DEMO_SEED.water
    && (DEMO_COMPATIBLE_WATER_INTAKES as readonly number[]).includes(intake);
  if (isDemo) return { classification: 'LEGACY_DEMO', reasons: [] };

  return { classification: 'LEGACY_REAL', reasons: [] };
}

/**
 * Classifica a carga legada. UNKNOWN (NaN/Infinity/negativo/tipo incorreto/
 * malformado) tem prioridade e nunca pode ser promovido.
 */
export function classifyLegacyNutrition(nutrition: unknown, userWaterIntake?: unknown): LegacyDataClassification {
  return classifyWithReasons(nutrition, userWaterIntake).classification;
}

// ============================================================================
// MIGRAÇÃO
// ============================================================================

export interface MigrateLegacyNutritionInput {
  nutrition: unknown;
  userWaterIntake?: unknown;
  /** Data civil do dia retroativo (ou atual, sem metadado temporal melhor). */
  date: string;
  timezone: string;
  /**
   * Targets vigentes para o snapshot do dia REAL.
   * Com targets válido => AUTOMATED; sem targets (null/undefined) exige
   * targetUnavailableReason => MANUAL_ONLY. Nunca inventar metas.
   */
  targets: DailyTargets | null | undefined;
  targetUnavailableReason?: import('./ledger-types').NutritionTargetUnavailableReason;
  /** IDs determinísticos por data (idempotência de replay); sobrescrevíveis. */
  dayId?: string;
  mealId?: string;
  foodEntryId?: string;
  hydrationEntryId?: string;
  /**
   * Instante das entradas consolidadas; default determinístico
   * `${date}T12:00:00.000Z`.
   *
   * Dívida P2 LEGACY_LOGGED_AT_APPROXIMATION: o legado não guarda hora, então
   * este meio-dia UTC é uma APROXIMAÇÃO determinística para ordenação — nunca
   * um horário histórico conhecido. Não redesenhar neste GOAL.
   */
  loggedAt?: string;
  /**
   * Dia migrado nasce fechado (dado histórico). O chamador do wiring pode
   * passar false quando `date` é o dia corrente.
   */
  markClosed?: boolean;
}

export type MigrateLegacyNutritionResult =
  | {
    classification: 'LEGACY_EMPTY' | 'LEGACY_DEMO';
    outcome: 'discarded';
    day: null;
    hydrationMl: 0;
    reasons: string[];
  }
  | {
    classification: 'LEGACY_REAL';
    outcome: 'migrated';
    day: NutritionDay;
    hydrationMl: number;
    reasons: string[];
  }
  | {
    classification: 'UNKNOWN';
    outcome: 'quarantined';
    day: null;
    hydrationMl: 0;
    reasons: string[];
  };

function assertWithinLegacyBounds(field: string, value: number, max: number): void {
  if (value >= max) {
    throw new NutritionLedgerError(
      'INVALID_ENTRY',
      `Valor legado fora dos limites NUT-001 em ${field}: ${String(value)} (teto ${String(max)}).`,
    );
  }
}

/**
 * Migra a carga legada para um NutritionDay retroativo (ou descarta/isola).
 * Pura e idempotente: duas execuções sobre o mesmo input produzem dias
 * profundo-iguais, prontos para `put` pela chave natural (date).
 */
export function migrateLegacyNutrition(input: MigrateLegacyNutritionInput): MigrateLegacyNutritionResult {
  const { classification, reasons } = classifyWithReasons(input.nutrition, input.userWaterIntake);

  if (classification === 'LEGACY_EMPTY' || classification === 'LEGACY_DEMO') {
    return { classification, outcome: 'discarded', day: null, hydrationMl: 0, reasons: [] };
  }
  if (classification === 'UNKNOWN') {
    // Quarentena honesta: nunca vira consumo confirmado, DailyActuals ou XP.
    return { classification, outcome: 'quarantined', day: null, hydrationMl: 0, reasons };
  }

  if (!isCivilDateString(input.date)) {
    throw new NutritionLedgerError(
      'INVALID_DAY',
      `Migração exige data civil válida: ${String(input.date)} (esperado YYYY-MM-DD).`,
    );
  }
  if (typeof input.timezone !== 'string' || input.timezone.trim().length === 0) {
    throw new NutritionLedgerError('INVALID_DAY', 'Migração exige um timezone IANA explícito.');
  }
  // NUT-004B: com targets válidos => AUTOMATED; sem targets => MANUAL_ONLY
  // com motivo explícito. Nunca inventar metas para preservar consumo legado.
  const loggedAt = input.loggedAt ?? `${input.date}T12:00:00.000Z`;
  if (typeof loggedAt !== 'string' || loggedAt.trim().length === 0) {
    throw new NutritionLedgerError('INVALID_INPUT', 'Migração exige um loggedAt textual não vazio.');
  }

  const legacy = input.nutrition as Record<string, number>;
  const intake = typeof input.userWaterIntake === 'number' ? input.userWaterIntake : 0;

  // Preservação com limites NUT-001 (finito e >= 0 já garantidos pela
  // classificação REAL; aqui só os tetos, como rede de segurança tipada).
  // Calorias zero com macros positivos são preservadas como estão: migração
  // não revalida intenção do usuário.
  assertWithinLegacyBounds('nutrition.calories', legacy['calories'], LEGACY_MACRO_UPPER_BOUNDS.calories);
  for (const field of ['protein', 'carbs', 'fat'] as const) {
    assertWithinLegacyBounds(`nutrition.${field}`, legacy[field], LEGACY_MACRO_UPPER_BOUNDS.macros);
  }
  // Água: sem teto canônico no NUT-001 — nenhum número arbitrário é inventado
  // (dívida P2 LEGACY_WATER_NO_CEILING). A reconciliação abaixo exige apenas
  // hidratação finita e > 0 via isValidWaterInput.

  let day: import('./ledger-types').NutritionDay;
  if (input.targets === null || input.targets === undefined) {
    const reason = (input as { targetUnavailableReason?: unknown }).targetUnavailableReason;
    if (
      reason !== 'PROFILE_ABSENT'
      && reason !== 'AUTOMATION_BLOCKED'
      && reason !== 'TARGET_RESOLUTION_ERROR'
    ) {
      throw new NutritionLedgerError(
        'INVALID_TARGETS',
        'Migração REAL sem targets exige targetUnavailableReason explícito (MANUAL_ONLY, sem metas inventadas).',
      );
    }
    day = createNutritionDay({
      id: input.dayId ?? `legacy-nutrition-day-${input.date}`,
      date: input.date,
      timezone: input.timezone,
      targets: null,
      targetState: 'MANUAL_ONLY',
      targetUnavailableReason: reason,
    });
  } else {
    day = createNutritionDay({
      id: input.dayId ?? `legacy-nutrition-day-${input.date}`,
      date: input.date,
      timezone: input.timezone,
      targets: input.targets as DailyTargets,
    });
  }

  const mealId = input.mealId ?? `legacy-consolidated-meal-${input.date}`;
  const hasMacros = legacy['calories'] > 0 || legacy['protein'] > 0 || legacy['carbs'] > 0 || legacy['fat'] > 0;
  day = {
    ...day,
    meals: [
      {
        id: mealId,
        type: 'custom',
        name: LEGACY_CONSOLIDATED_MEAL_NAME,
        entries: hasMacros
          ? [
            {
              id: input.foodEntryId ?? `legacy-consolidated-food-${input.date}`,
              name: LEGACY_CONSOLIDATED_MEAL_NAME,
              calories: legacy['calories'],
              protein: legacy['protein'],
              carbs: legacy['carbs'],
              fat: legacy['fat'],
              loggedAt,
            },
          ]
          : [],
      },
    ],
  };

  // Anti-duplicidade de hidratação: UMA única entrada com o máximo — nunca a soma.
  const hydrationMl = Math.max(legacy['water'], intake);
  if (hydrationMl > 0) {
    if (!isValidWaterInput(hydrationMl)) {
      throw new NutritionLedgerError('INVALID_HYDRATION', 'Hidratação legada reconciliada inválida.');
    }
    day = {
      ...day,
      hydrationEntries: [
        {
          id: input.hydrationEntryId ?? `legacy-hydration-${input.date}`,
          amountMl: hydrationMl,
          loggedAt,
        },
      ],
    };
  }

  if (input.markClosed ?? true) {
    day = { ...day, isClosed: true, closedAt: loggedAt };
  }

  return { classification: 'LEGACY_REAL', outcome: 'migrated', day, hydrationMl, reasons: [] };
}
