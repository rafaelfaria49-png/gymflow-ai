/**
 * GymFlow AI — NUT-008 stress sintético não destrutivo + performance.
 *
 * Exercita dezenas, centenas e ~2 anos de NutritionDays em memória.
 * Não escreve no storage do usuário. Não inventa threshold novo:
 * apenas registra métricas e preserva o contrato já existente de busca <15ms.
 */

import { describe, expect, it } from 'vitest';
import { FOOD_DATABASE, searchFoods } from './food-database';
import { calculateActuals, closeNutritionDay } from './ledger';
import { createInMemoryNutritionDayRepository } from './rollover';
import { buildNutritionTrend, summarizeNutritionTrend } from './trend';
import {
  computeNutritionLedgerDigest,
  createEmptyNutritionLedgerSection,
  serializeNutritionLedgerCanonically,
  validateNutritionLedgerBackupSection,
  type NutritionLedgerBackupSection,
} from '../storage-nutrition-ledger-backup';
import {
  addUtcDays,
  createNut008ConsumedDay,
  createNut008EmptyDay,
  nut008SharedTargets,
} from './nut008-fixtures';

function buildHistory(dayCount: number): NutritionLedgerBackupSection {
  const targets = nut008SharedTargets();
  const start = '2024-01-01';
  const days = Array.from({ length: dayCount }, (_, index) => {
    const date = addUtcDays(start, index);
    const isLast = index === dayCount - 1;
    const raw = index % 3 === 0
      ? createNut008EmptyDay(date, targets)
      : createNut008ConsumedDay(date, targets, { chickenGrams: 120 + (index % 40) });
    return isLast ? raw : closeNutritionDay(raw, `${date}T23:59:00.000Z`);
  });
  return {
    days,
    activeDate: days[days.length - 1]!.date,
    migrationMarker: null,
  };
}

interface StressMetrics {
  days: number;
  buildMs: number;
  listMs: number;
  actualsMs: number;
  trend7Ms: number;
  trend30Ms: number;
  serializeMs: number;
  digestMs: number;
  canonicalBytes: number;
}

async function measureStress(dayCount: number): Promise<StressMetrics> {
  const buildStarted = performance.now();
  const section = buildHistory(dayCount);
  const buildMs = performance.now() - buildStarted;

  const repo = createInMemoryNutritionDayRepository({
    days: section.days,
    activeDate: section.activeDate,
  });

  const listStarted = performance.now();
  const listed = await repo.listNutritionDays();
  const listMs = performance.now() - listStarted;
  expect(listed).toHaveLength(dayCount);

  const actualsStarted = performance.now();
  let calories = 0;
  for (const day of listed) calories += calculateActuals(day).calories;
  const actualsMs = performance.now() - actualsStarted;
  expect(calories).toBeGreaterThan(0);

  const t7Started = performance.now();
  const trend7 = buildNutritionTrend({ days: listed, daysCount: 7 });
  const trend7Ms = performance.now() - t7Started;
  expect(trend7.length).toBeGreaterThan(0);
  expect(trend7.length).toBeLessThanOrEqual(7);
  summarizeNutritionTrend(trend7);

  const t30Started = performance.now();
  const trend30 = buildNutritionTrend({ days: listed, daysCount: 30 });
  const trend30Ms = performance.now() - t30Started;
  expect(trend30.length).toBeLessThanOrEqual(30);

  const validated = validateNutritionLedgerBackupSection(section);
  expect(validated.status).toBe('valid');

  const serializeStarted = performance.now();
  const canonical = serializeNutritionLedgerCanonically(section);
  const serializeMs = performance.now() - serializeStarted;

  const digestStarted = performance.now();
  const digest = await computeNutritionLedgerDigest(section);
  const digestMs = performance.now() - digestStarted;
  expect(digest.startsWith('sha256:')).toBe(true);

  const restored = createInMemoryNutritionDayRepository({
    days: JSON.parse(canonical).days,
    activeDate: JSON.parse(canonical).activeDate,
  });
  const restoredDays = await restored.listNutritionDays();
  expect(restoredDays).toHaveLength(dayCount);
  expect(serializeNutritionLedgerCanonically({
    days: restoredDays,
    activeDate: await restored.getActiveNutritionDate(),
    migrationMarker: null,
  })).toBe(canonical);

  return {
    days: dayCount,
    buildMs,
    listMs,
    actualsMs,
    trend7Ms,
    trend30Ms,
    serializeMs,
    digestMs,
    canonicalBytes: canonical.length,
  };
}

describe('NUT-008 stress sintético não destrutivo', () => {
  it('dezenas, centenas e ~2 anos de NutritionDays sem perda/híbrido', async () => {
    const metrics30 = await measureStress(30);
    const metrics180 = await measureStress(180);
    const metrics730 = await measureStress(730);

    expect(metrics30.days).toBe(30);
    expect(metrics180.days).toBe(180);
    expect(metrics730.days).toBe(730);
    expect(metrics730.canonicalBytes).toBeGreaterThan(metrics180.canonicalBytes);
    expect(metrics180.canonicalBytes).toBeGreaterThan(metrics30.canonicalBytes);

    const empty = createEmptyNutritionLedgerSection();
    expect(empty.days).toEqual([]);
    expect(serializeNutritionLedgerCanonically(empty)).toContain('"days":[]');

    // Exposto para o relatório (reproduzível; sem threshold novo).
    // eslint-disable-next-line no-console
    console.info('NUT008_STRESS_METRICS', { metrics30, metrics180, metrics730 });
  }, 30000);
});

describe('NUT-008 performance (contratos existentes)', () => {
  it('FoodDatabase search permanece <15ms no dataset V1', () => {
    const db = FOOD_DATABASE;
    db.search('arroz');
    searchFoods('feijao');
    const iterations = 200;
    const start = performance.now();
    for (let i = 0; i < iterations; i += 1) {
      db.search('arroz');
    }
    const averageMs = (performance.now() - start) / iterations;
    expect(averageMs).toBeLessThan(15);
    // eslint-disable-next-line no-console
    console.info('NUT008_FOOD_SEARCH_AVG_MS', averageMs);
  });

  it('selectors de tendência 7/30 e actuals em janela de 30 dias são síncronos e determinísticos', () => {
    const section = buildHistory(30);
    const start = performance.now();
    const trend7 = buildNutritionTrend({ days: section.days, daysCount: 7 });
    const trend30 = buildNutritionTrend({ days: section.days, daysCount: 30 });
    const actuals = section.days.map((day) => calculateActuals(day));
    const elapsed = performance.now() - start;
    expect(trend7).toHaveLength(7);
    expect(trend30).toHaveLength(30);
    expect(actuals).toHaveLength(30);
    expect(buildNutritionTrend({ days: section.days, daysCount: 7 })).toEqual(trend7);
    // eslint-disable-next-line no-console
    console.info('NUT008_TREND_ACTUALS_30D_MS', elapsed);
  });
});
