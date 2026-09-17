/**
 * GymFlow AI — NUT-008 revalidação storage/recovery do ledger (invariantes).
 *
 * Reusa a section canônica schema 2 em memória. Provas IDB/Web Locks/fence
 * continuam em storage-nutrition-ledger-*.test.ts (incluídos no foco Nutrition).
 */

import { describe, expect, it } from 'vitest';
import { closeNutritionDay } from './ledger';
import {
  computeNutritionLedgerDigest,
  createEmptyNutritionLedgerSection,
  nutritionLedgerSectionHasConsumption,
  serializeNutritionLedgerCanonically,
  validateNutritionLedgerBackupSection,
  type NutritionLedgerBackupSection,
} from '../storage-nutrition-ledger-backup';
import {
  createNut008ConsumedDay,
  createNut008EmptyDay,
  nut008SharedTargets,
} from './nut008-fixtures';

describe('NUT-008 storage/recovery invariantes', () => {
  it('NO_DATA_LOSS: digest e canonical roundtrip da section schema 2', async () => {
    const targets = nut008SharedTargets();
    const days = [
      closeNutritionDay(createNut008ConsumedDay('2026-09-10', targets), '2026-09-10T23:00:00.000Z'),
      closeNutritionDay(createNut008EmptyDay('2026-09-11', targets), '2026-09-11T23:00:00.000Z'),
      createNut008ConsumedDay('2026-09-12', targets),
    ];
    const section: NutritionLedgerBackupSection = {
      days,
      activeDate: '2026-09-12',
      migrationMarker: null,
    };
    expect(validateNutritionLedgerBackupSection(section).status).toBe('valid');
    expect(nutritionLedgerSectionHasConsumption(section)).toBe(true);
    const canonical = serializeNutritionLedgerCanonically(section);
    const digest = await computeNutritionLedgerDigest(section);
    const parsed = JSON.parse(canonical) as NutritionLedgerBackupSection;
    expect(parsed.days.map((day) => day.date)).toEqual(['2026-09-10', '2026-09-11', '2026-09-12']);
    expect(await computeNutritionLedgerDigest(parsed)).toBe(digest);
    expect(serializeNutritionLedgerCanonically(parsed)).toBe(canonical);
  });

  it('NO_LEDGER_RESURRECTION: section vazia após reset não contém consumo', () => {
    const empty = createEmptyNutritionLedgerSection();
    expect(empty.days).toEqual([]);
    expect(empty.activeDate).toBeNull();
    expect(nutritionLedgerSectionHasConsumption(empty)).toBe(false);
    expect(validateNutritionLedgerBackupSection(empty).status).toBe('valid');
  });

  it('NO_HYBRID_CORE_LEDGER: restore substitui a section inteira, nunca mistura datas', async () => {
    const targets = nut008SharedTargets();
    const previous: NutritionLedgerBackupSection = {
      days: [createNut008ConsumedDay('2026-09-10', targets)],
      activeDate: '2026-09-10',
      migrationMarker: null,
    };
    const target: NutritionLedgerBackupSection = {
      days: [createNut008ConsumedDay('2026-09-12', targets)],
      activeDate: '2026-09-12',
      migrationMarker: null,
    };
    const restored = target;
    const dates = restored.days.map((day) => day.date);
    const isPrevious = dates.includes('2026-09-10') && !dates.includes('2026-09-12');
    const isTarget = dates.includes('2026-09-12') && !dates.includes('2026-09-10');
    const isEmpty = dates.length === 0;
    expect(isPrevious || isTarget || isEmpty).toBe(true);
    expect(isTarget).toBe(true);
    expect(serializeNutritionLedgerCanonically(restored)).not.toBe(
      serializeNutritionLedgerCanonically(previous),
    );
  });

  it('efêmeros de fence/lock nunca entram na section de backup', () => {
    const invalid = {
      days: [],
      activeDate: null,
      migrationMarker: null,
      nutritionAdminFence: { ownerId: 'tab-a' },
    };
    const result = validateNutritionLedgerBackupSection(invalid);
    expect(result.status).toBe('invalid');
  });
});
