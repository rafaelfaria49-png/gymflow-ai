/**
 * GymFlow AI — Reconciliação única do dia nutricional (NUT-004C / GOAL-094)
 *
 * Cobre `reconcileNutritionDayForNow` sobre repositório em memória, de forma
 * determinística (instantes explícitos, sem sleeps, sem relógio global):
 * - mesma data: sem novo dia, sem escrita de fechamento;
 * - dia seguinte: rollover (anterior fechado, novo zerado, histórico intacto);
 * - eventos duplicados/concorrentes: um único dia por data civil;
 * - timezones America/Sao_Paulo, UTC, UTC+14, UTC-11, com meia-noite local
 *   que não coincide com UTC;
 * - fail-closed: timezone inválido, now inválido, falha de storage.
 */

import { describe, expect, it } from 'vitest';
import type { NutritionProfile } from '../../types/nutrition';
import { addHydrationEntry, calculateActuals } from './ledger';
import {
  NUTRITION_FOREGROUND_RECONCILE_INTERVAL_MS,
  reconcileNutritionDayForNow,
  type NutritionLifecycleReason,
} from './lifecycle';
import { createInMemoryNutritionDayRepository, type NutritionDayRepository } from './rollover';

function makeProfile(timezone: string): NutritionProfile {
  return {
    age: 30,
    heightCm: 175,
    weightKg: 75,
    biologicalSexForCalcs: 'male',
    goal: 'maintenance',
    trainingFrequencyDaysPerWeek: 4,
    averageTrainingDurationMinutes: 60,
    nonExerciseActivity: 'moderately_active',
    dietaryPattern: 'omnivore',
    mealsPerDayPreference: 4,
    allergies: [],
    intolerances: [],
    avoidedFoods: [],
    healthFlags: [],
    timezone,
    updatedAt: '2026-09-09T10:00:00.000Z',
  };
}

function reconcile(
  repository: NutritionDayRepository,
  nowIso: string,
  timezone: string,
  reason: NutritionLifecycleReason = 'timer',
) {
  return reconcileNutritionDayForNow({
    reason,
    repository,
    now: new Date(nowIso),
    profile: makeProfile(timezone),
  });
}

describe('NUT-004C — reconcileNutritionDayForNow (função única)', () => {
  it('TIMER_INTERVAL = 60s cooperativo (sem polling agressivo)', () => {
    expect(NUTRITION_FOREGROUND_RECONCILE_INTERVAL_MS).toBe(60_000);
  });

  it('mesma data: existing-active, sem novo dia e sem fechar nada', async () => {
    const repo = createInMemoryNutritionDayRepository();
    const first = await reconcile(repo, '2026-09-12T10:00:00.000Z', 'America/Sao_Paulo', 'cold-boot');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.today).toBe('2026-09-12');
    expect(first.status).toBe('created');

    const second = await reconcile(repo, '2026-09-12T18:00:00.000Z', 'America/Sao_Paulo', 'visibility');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.today).toBe('2026-09-12');
    expect(second.status).toBe('existing-active');
    expect(second.day.id).toBe(first.day.id);

    const days = await repo.listNutritionDays();
    expect(days).toHaveLength(1);
    expect(days[0]!.isClosed).toBe(false);
  });

  it('dia seguinte: fecha anterior, cria novo zerado, preserva histórico', async () => {
    const repo = createInMemoryNutritionDayRepository();
    const dayOne = await reconcile(repo, '2026-09-12T10:00:00.000Z', 'America/Sao_Paulo', 'cold-boot');
    expect(dayOne.ok).toBe(true);
    if (!dayOne.ok) return;
    // Consumo no dia D (fora da reconciliação, como faria o mutate do write).
    const withWater = addHydrationEntry(dayOne.day, {
      id: 'hyd-d1',
      amountMl: 500,
      loggedAt: '2026-09-12T13:00:00.000Z',
    });
    await repo.putNutritionDay(withWater);

    const dayTwo = await reconcile(repo, '2026-09-13T08:00:00.000Z', 'America/Sao_Paulo', 'visibility');
    expect(dayTwo.ok).toBe(true);
    if (!dayTwo.ok) return;
    expect(dayTwo.today).toBe('2026-09-13');
    expect(dayTwo.status).toBe('created');

    const previous = await repo.getNutritionDay('2026-09-12');
    expect(previous?.isClosed).toBe(true);
    expect(calculateActuals(previous!).waterMl).toBe(500);

    expect(calculateActuals(dayTwo.day)).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      waterMl: 0,
    });
    expect(dayTwo.mirrors).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      water: 0,
      waterIntake: 0,
    });

    const days = await repo.listNutritionDays();
    expect(days.map((day) => day.date)).toEqual(['2026-09-12', '2026-09-13']);
    expect(await repo.getActiveNutritionDate()).toBe('2026-09-13');
  });

  it('novo dia herda targets AUTOMATED + gateSnapshot coerente (sem copiar consumo)', async () => {
    const repo = createInMemoryNutritionDayRepository();
    const first = await reconcile(repo, '2026-09-12T10:00:00.000Z', 'America/Sao_Paulo', 'cold-boot');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.resolution.targetState).toBe('AUTOMATED');

    const second = await reconcile(repo, '2026-09-13T08:00:00.000Z', 'America/Sao_Paulo', 'timer');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.day.targetState).toBe('AUTOMATED');
    expect(second.day.targets).toEqual(first.day.targets);
    expect(second.day.gateSnapshot).toEqual(second.resolution.gateSnapshot);
    expect(second.day.hydrationEntries).toEqual([]);
    expect(second.day.meals).toEqual([]);
  });

  it('perfil ausente: MANUAL_ONLY com motivo, sem inventar targets', async () => {
    const repo = createInMemoryNutritionDayRepository();
    const result = await reconcileNutritionDayForNow({
      reason: 'cold-boot',
      repository: repo,
      now: new Date('2026-09-12T10:00:00.000Z'),
      profile: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resolution.targetState).toBe('MANUAL_ONLY');
    expect(result.day.targetState).toBe('MANUAL_ONLY');
    expect(result.day.targets).toBe(null);
  });

  it('eventos duplicados simultâneos: um único dia por data, sem lost update', async () => {
    const repo = createInMemoryNutritionDayRepository();
    const seed = await reconcile(repo, '2026-09-12T10:00:00.000Z', 'America/Sao_Paulo', 'cold-boot');
    expect(seed.ok).toBe(true);

    const reasons: NutritionLifecycleReason[] = ['visibility', 'app-state', 'timer', 'resume', 'write'];
    const results = await Promise.all(
      // 00:00:30 em America/Sao_Paulo (UTC-3) = 03:00:30Z.
      reasons.map((reason) => reconcile(repo, '2026-09-13T03:00:30.000Z', 'America/Sao_Paulo', reason)),
    );
    expect(results.every((result) => result.ok)).toBe(true);
    const created = results.filter((result) => result.ok && result.status === 'created');
    expect(created.length).toBeLessThanOrEqual(1);

    const days = await repo.listNutritionDays();
    expect(days.map((day) => day.date)).toEqual(['2026-09-12', '2026-09-13']);
    const previous = await repo.getNutritionDay('2026-09-12');
    expect(previous?.isClosed).toBe(true);
  });

  it('write imediatamente após midnight nunca cai no dia antigo', async () => {
    const repo = createInMemoryNutritionDayRepository();
    const seed = await reconcile(repo, '2026-09-12T10:00:00.000Z', 'America/Sao_Paulo', 'cold-boot');
    expect(seed.ok).toBe(true);

    // Meia-noite local atravessada sem nenhum evento de lifecycle: o próprio
    // write reconcilia antes de gravar (contrato da seção 8).
    // 00:00:05 em America/Sao_Paulo (UTC-3) = 03:00:05Z.
    const beforeWrite = await reconcile(repo, '2026-09-13T03:00:05.000Z', 'America/Sao_Paulo', 'write');
    expect(beforeWrite.ok).toBe(true);
    if (!beforeWrite.ok) return;
    expect(beforeWrite.today).toBe('2026-09-13');
    const nextDay = addHydrationEntry(beforeWrite.day, {
      id: 'hyd-post-midnight',
      amountMl: 250,
      loggedAt: '2026-09-13T00:00:05.000Z',
    });
    await repo.putNutritionDay(nextDay);

    const previous = await repo.getNutritionDay('2026-09-12');
    expect(calculateActuals(previous!).waterMl).toBe(0);
    const current = await repo.getNutritionDay('2026-09-13');
    expect(calculateActuals(current!).waterMl).toBe(250);
  });

  it.each([
    {
      timezone: 'America/Sao_Paulo',
      beforeIso: '2026-09-13T02:30:00.000Z',
      afterIso: '2026-09-13T03:30:00.000Z',
      beforeDate: '2026-09-12',
      afterDate: '2026-09-13',
    },
    {
      timezone: 'UTC',
      beforeIso: '2026-09-12T23:30:00.000Z',
      afterIso: '2026-09-13T00:30:00.000Z',
      beforeDate: '2026-09-12',
      afterDate: '2026-09-13',
    },
    {
      timezone: 'Pacific/Kiritimati',
      beforeIso: '2026-09-12T09:30:00.000Z',
      afterIso: '2026-09-12T10:30:00.000Z',
      beforeDate: '2026-09-12',
      afterDate: '2026-09-13',
    },
    {
      timezone: 'Pacific/Midway',
      beforeIso: '2026-09-13T10:30:00.000Z',
      afterIso: '2026-09-13T11:30:00.000Z',
      beforeDate: '2026-09-12',
      afterDate: '2026-09-13',
    },
  ])(
    'timezone $timezone: meia-noite local ($beforeDate → $afterDate) independente de UTC',
    async ({ timezone, beforeIso, afterIso, beforeDate, afterDate }) => {
      const repo = createInMemoryNutritionDayRepository();
      const before = await reconcile(repo, beforeIso, timezone, 'cold-boot');
      expect(before.ok).toBe(true);
      if (!before.ok) return;
      expect(before.today).toBe(beforeDate);
      expect(before.timezone).toBe(timezone);
      expect(before.timezoneSource).toBe('profile');

      const after = await reconcile(repo, afterIso, timezone, 'timer');
      expect(after.ok).toBe(true);
      if (!after.ok) return;
      expect(after.today).toBe(afterDate);
      expect(after.status).toBe('created');
      const previous = await repo.getNutritionDay(beforeDate);
      expect(previous?.isClosed).toBe(true);
    },
  );

  it('relógio retrocedido: futuro intacto, sem apagar nem fechar (semântica canônica do rollover)', async () => {
    const repo = createInMemoryNutritionDayRepository();
    const first = await reconcile(repo, '2026-09-13T08:00:00.000Z', 'America/Sao_Paulo', 'cold-boot');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await repo.putNutritionDay(addHydrationEntry(first.day, {
      id: 'hyd-future',
      amountMl: 500,
      loggedAt: '2026-09-13T06:00:00.000Z',
    }));

    const back = await reconcile(repo, '2026-09-12T08:00:00.000Z', 'America/Sao_Paulo', 'timer');
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.today).toBe('2026-09-12');

    // Nada do futuro foi apagado ou fechado.
    const future = await repo.getNutritionDay('2026-09-13');
    expect(future?.isClosed).toBe(false);
    expect(calculateActuals(future!).waterMl).toBe(500);

    // Relógio restaurado: o dia original volta a ser o ativo, intacto.
    const restored = await reconcile(repo, '2026-09-13T09:00:00.000Z', 'America/Sao_Paulo', 'resume');
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.today).toBe('2026-09-13');
    expect(restored.day.id).toBe(first.day.id);
    expect(calculateActuals(restored.day).waterMl).toBe(500);
  });

  it('fail-closed: timezone de perfil inválido não corrompe o ledger', async () => {
    const repo = createInMemoryNutritionDayRepository();
    const result = await reconcileNutritionDayForNow({
      reason: 'visibility',
      repository: repo,
      now: new Date('2026-09-12T10:00:00.000Z'),
      profile: makeProfile('INVALID_TZ_DOES_NOT_EXIST'),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe('timezone');
    expect(result.reason).toBe('visibility');
    expect(await repo.listNutritionDays()).toEqual([]);
  });

  it('fail-closed: now inválido retorna erro explícito sem throw', async () => {
    const repo = createInMemoryNutritionDayRepository();
    const result = await reconcileNutritionDayForNow({
      reason: 'timer',
      repository: repo,
      now: new Date('not-a-date'),
      profile: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe('invalid-input');
  });

  it('fail-closed: falha de storage vira erro explícito sem throw', async () => {
    const broken: NutritionDayRepository = {
      ...createInMemoryNutritionDayRepository(),
      getActiveNutritionDate: async () => {
        throw new Error('IDB indisponível');
      },
    };
    const result = await reconcileNutritionDayForNow({
      reason: 'resume',
      repository: broken,
      now: new Date('2026-09-12T10:00:00.000Z'),
      profile: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe('ensure-today');
    expect(result.reason).toBe('resume');
  });
});
