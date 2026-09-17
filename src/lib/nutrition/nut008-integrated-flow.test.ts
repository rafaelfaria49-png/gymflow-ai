/**
 * GymFlow AI — NUT-008 fluxo integrado ponta a ponta.
 *
 * Homologa o domínio como um único sistema:
 * perfil → gates → engine → DailyTargets → FoodDatabase → ledger →
 * hidratação → favoritos/recentes → rollover civil → tendência →
 * IA grounded + confirmação explícita → backup → restore → reset.
 *
 * Nenhum módulo isolado verde compensa quebra deste fluxo.
 */

import { describe, expect, it } from 'vitest';
import {
  AI_ASSISTANT_PERMISSIONS,
  buildGroundedProposal,
} from './ai-assistant';
import { FOOD_DATABASE, scaleFoodReferenceToGrams, toFoodEntryInput } from './food-database';
import { FoodPreferencesStore, createInMemoryFoodPreferencesStorage } from './food-preferences';
import {
  addFoodEntry,
  addHydrationEntry,
  addMeal,
  calculateActuals,
  calculateRemaining,
  closeNutritionDay,
} from './ledger';
import { reconcileNutritionDayForNow } from './lifecycle';
import { evaluateNutritionGate } from './profile-gates';
import { createInMemoryNutritionDayRepository } from './rollover';
import { resolveNutritionTargets } from './target-resolution';
import { buildNutritionTrend, summarizeNutritionTrend } from './trend';
import {
  computeNutritionLedgerDigest,
  serializeNutritionLedgerCanonically,
  validateNutritionLedgerBackupSection,
  type NutritionLedgerBackupSection,
} from '../storage-nutrition-ledger-backup';
import {
  NUT008_NOW_ISO,
  NUT008_TZ,
  createNut008Profile,
} from './nut008-fixtures';

describe('NUT-008 fluxo integrado perfil → ledger → IA → backup', () => {
  it('PROFILE_TO_LEDGER_FLOW + FOOD_TO_LEDGER_FLOW + AI_TO_CONFIRMATION_FLOW + ROLLOVER + BACKUP_RESTORE + RECOVERY', async () => {
    const profile = createNut008Profile();
    const gate = evaluateNutritionGate(profile);
    expect(gate.status).toBe('NORMAL_FLOW');
    expect(gate.allowAutomatedTargets).toBe(true);

    const resolution = resolveNutritionTargets({ profile, evaluatedAt: NUT008_NOW_ISO });
    expect(resolution.targetState).toBe('AUTOMATED');
    if (resolution.targetState !== 'AUTOMATED') throw new Error('unreachable');
    const targets = resolution.targets;
    expect(targets.formulaVersion).toBe('mifflin-st-jeor-v1');
    expect(targets.engineVersion).toBe('1.0.0');
    expect(targets.scientificStatus).toBe('PROVISIONAL_PENDING_PROFESSIONAL_REVIEW');
    expect(targets.effectiveProteinGramsPerKg).toBeLessThanOrEqual(2.2);

    const repository = createInMemoryNutritionDayRepository();
    const day0 = new Date('2026-09-16T18:00:00.000-03:00');
    const boot = await reconcileNutritionDayForNow({
      reason: 'cold-boot',
      repository,
      now: day0,
      profile,
    });
    expect(boot.ok).toBe(true);
    if (!boot.ok) throw new Error('unreachable');
    expect(boot.today).toBe('2026-09-16');
    expect(boot.timezone).toBe(NUT008_TZ);
    expect(boot.day.targetState).toBe('AUTOMATED');
    expect(boot.actuals.calories).toBe(0);

    const chicken = FOOD_DATABASE.getById('br-peito-frango-grelhado');
    const rice = FOOD_DATABASE.search('arroz branco cozido')[0];
    expect(chicken).toBeTruthy();
    expect(rice).toBeTruthy();
    if (!chicken || !rice) throw new Error('unreachable');

    const searchMsStart = performance.now();
    FOOD_DATABASE.search('feijao');
    expect(performance.now() - searchMsStart).toBeLessThan(15);

    let day = boot.day;
    day = addMeal(day, { id: 'meal-lunch', type: 'lunch', name: 'Almoço', time: '12:30' });
    day = addFoodEntry(
      day,
      'meal-lunch',
      toFoodEntryInput(chicken, 150, { id: 'entry-chicken', loggedAt: NUT008_NOW_ISO }),
    );
    day = addHydrationEntry(day, { id: 'h-500', amountMl: 500, loggedAt: NUT008_NOW_ISO });
    await repository.putNutritionDay(day);

    const prefs = new FoodPreferencesStore(createInMemoryFoodPreferencesStorage());
    prefs.addFavorite(chicken.id);
    prefs.markRecent(chicken.id);
    expect(prefs.getFavorites()).toEqual([chicken.id]);
    expect(prefs.getRecents()[0]).toBe(chicken.id);

    const actualsAfterFood = calculateActuals(day);
    const remaining = calculateRemaining(targets, actualsAfterFood);
    expect(actualsAfterFood.calories).toBeGreaterThan(0);
    expect(actualsAfterFood.protein).toBeGreaterThan(0);
    expect(actualsAfterFood.waterMl).toBe(500);
    expect(remaining.calories).toBe(targets.targetCalories - actualsAfterFood.calories);

    expect(AI_ASSISTANT_PERMISSIONS.canWriteLedger).toBe(false);
    expect(AI_ASSISTANT_PERMISSIONS.canWriteTargets).toBe(false);
    expect(AI_ASSISTANT_PERMISSIONS.canTrustModelMacros).toBe(false);
    expect(AI_ASSISTANT_PERMISSIONS.requiresUserConfirmation).toBe(true);

    const proposal = buildGroundedProposal({
      useCase: 'complete_protein',
      rawItems: [{ foodReferenceId: chicken.id, grams: 120, calories: 1, protein: 999 }],
      catalog: FOOD_DATABASE,
    });
    expect(proposal.useCase).toBe('complete_protein');
    if (proposal.useCase !== 'complete_protein') throw new Error('unreachable');
    const local120 = scaleFoodReferenceToGrams(chicken, 120);
    expect(proposal.items[0].computed.calories).toBe(local120.calories);
    expect(proposal.items[0].computed.protein).toBe(local120.protein);
    expect(proposal.items[0].computed.calories).not.toBe(1);
    expect(proposal.items[0].computed.protein).not.toBe(999);

    const beforeConfirm = calculateActuals(day);
    day = addFoodEntry(
      day,
      'meal-lunch',
      toFoodEntryInput(chicken, 120, { id: 'entry-ai-confirmed', loggedAt: '2026-09-16T19:00:00.000Z' }),
    );
    await repository.putNutritionDay(day);
    const afterConfirm = calculateActuals(day);
    expect(afterConfirm.calories).toBeGreaterThan(beforeConfirm.calories);
    expect(afterConfirm.protein).toBeGreaterThan(beforeConfirm.protein);

    const day1 = new Date('2026-09-17T00:30:00.000-03:00');
    const rollover = await reconcileNutritionDayForNow({
      reason: 'timer',
      repository,
      now: day1,
      profile,
    });
    expect(rollover.ok).toBe(true);
    if (!rollover.ok) throw new Error('unreachable');
    expect(rollover.today).toBe('2026-09-17');
    expect(rollover.status).toBe('created');
    expect(rollover.actuals.calories).toBe(0);

    const previous = await repository.getNutritionDay('2026-09-16');
    expect(previous).toBeTruthy();
    expect(previous!.isClosed).toBe(true);
    expect(calculateActuals(previous!).calories).toBe(afterConfirm.calories);
    expect(previous!.meals[0].entries).toHaveLength(2);

    const days = await repository.listNutritionDays();
    const trend7 = buildNutritionTrend({ days, daysCount: 7, endDate: '2026-09-17' });
    const trend30 = buildNutritionTrend({ days, daysCount: 30, endDate: '2026-09-17' });
    expect(trend7.map((point) => point.date)).toEqual(['2026-09-16', '2026-09-17']);
    expect(trend30).toHaveLength(2);
    expect(trend7.some((point) => point.calories > 0)).toBe(true);
    const summary = summarizeNutritionTrend(trend7);
    expect(summary.count).toBe(2);

    const section: NutritionLedgerBackupSection = {
      days,
      activeDate: rollover.today,
      migrationMarker: null,
    };
    const validated = validateNutritionLedgerBackupSection(section);
    expect(validated.status).toBe('valid');
    const canonical = serializeNutritionLedgerCanonically(section);
    const digest = await computeNutritionLedgerDigest(section);
    expect(canonical.length).toBeGreaterThan(100);
    expect(digest.startsWith('sha256:')).toBe(true);

    const restoredRepo = createInMemoryNutritionDayRepository({
      days: section.days,
      activeDate: section.activeDate,
    });
    const restoredDays = await restoredRepo.listNutritionDays();
    expect(serializeNutritionLedgerCanonically({
      days: restoredDays,
      activeDate: await restoredRepo.getActiveNutritionDate(),
      migrationMarker: null,
    })).toBe(canonical);
    expect(await computeNutritionLedgerDigest({
      days: restoredDays,
      activeDate: await restoredRepo.getActiveNutritionDate(),
      migrationMarker: null,
    })).toBe(digest);

    const emptyRepo = createInMemoryNutritionDayRepository();
    const afterReset = await emptyRepo.listNutritionDays();
    expect(afterReset).toEqual([]);
    expect(await emptyRepo.getActiveNutritionDate()).toBeNull();
    const resurrected = await emptyRepo.getNutritionDay('2026-09-16');
    expect(resurrected).toBeNull();

    const closed = closeNutritionDay(previous!, '2026-09-17T03:00:00.000Z');
    expect(closed.isClosed).toBe(true);
    expect(() => addHydrationEntry(closed, { id: 'x', amountMl: 250, loggedAt: NUT008_NOW_ISO }))
      .toThrowError();
  });
});
