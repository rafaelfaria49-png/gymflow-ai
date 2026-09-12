/**
 * GymFlow AI — Testes obrigatórios do bridge NUT-004B (GOAL-083)
 *
 * Cobre (slice pura, sem UI):
 * - envelope antigo sem nutritionProfile
 * - profile null / válido / gates / engine failure
 * - AUTOMATED / MANUAL_ONLY invariants + isNutritionDay combinações
 * - Remaining indisponível sem targets
 * - migration EMPTY/DEMO/UNKNOWN/REAL + LEGACY_REAL sem targets + replay
 * - boot 2x sem duplicação + projeção sem XP
 * - versionamento congelado (HYBRID=2, CURRENT=1, IDB=5)
 */

import { describe, expect, it } from 'vitest';
import type { NutritionProfile } from '../../types/nutrition';
import {
  CURRENT_STORAGE_VERSION,
  HYBRID_STORAGE_VERSION,
  createEmptyPersistedState,
} from '../storage-types';
import { GYMFLOW_INDEXEDDB_VERSION } from '../storage-indexeddb';
import { mergePersistedState } from '../storage-migrations';
import { validatePersistedStateShape } from '../storage-validation';
import { calculateDailyTargets } from './engine';
import {
  createEvaluatedGateSnapshot,
  createProfileAbsentSnapshot,
  isNutritionGateSnapshot,
} from './gate-snapshot';
import {
  calculateActuals,
  calculateRemaining,
  calculateRemainingForDay,
  createNutritionDay,
} from './ledger';
import {
  isLedgerMigrationMarker,
  isNutritionDay,
  NutritionLedgerError,
} from './ledger-types';
import { classifyLegacyNutrition, migrateLegacyNutrition } from './migration';
import { evaluateNutritionGate } from './profile-gates';
import {
  isNutritionProfile,
  normalizePersistedNutritionProfile,
} from './profile-validation';
import {
  projectCompatMirrors,
  runNutritionColdBoot,
} from './provider-bridge';
import { createInMemoryNutritionDayRepository } from './rollover';
import { resolveEffectiveTimezone } from './effective-timezone';
import { resolveNutritionTargets } from './target-resolution';
import type { DailyTargets } from './engine-types';

function makeProfile(overrides: Partial<NutritionProfile> = {}): NutritionProfile {
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
    timezone: 'America/Sao_Paulo',
    updatedAt: '2026-09-08T12:00:00.000Z',
    ...overrides,
  };
}

function makeTargets(): DailyTargets {
  return calculateDailyTargets(makeProfile());
}

const NOW = new Date('2026-09-12T14:00:00.000Z');
const NOW_ISO = '2026-09-12T14:00:00.000Z';

describe('NUT004B — versionamento congelado', () => {
  it('HYBRID=2, CURRENT=1, IDB=5, sem envelope v3', () => {
    expect(HYBRID_STORAGE_VERSION).toBe(2);
    expect(CURRENT_STORAGE_VERSION).toBe(1);
    expect(GYMFLOW_INDEXEDDB_VERSION).toBe(5);
  });
});

describe('NUT004B — NutritionProfile no core', () => {
  it('envelope antigo sem campo continua válido e hidrata como null', () => {
    const empty = createEmptyPersistedState();
    expect(empty.nutritionProfile).toBeNull();

    const legacy = { ...empty };
    delete (legacy as Record<string, unknown>)['nutritionProfile'];
    expect(validatePersistedStateShape({ ...legacy, workoutHistory: [] })).toBe(true);

    const merged = mergePersistedState(empty, legacy as Partial<typeof empty>);
    expect(merged.nutritionProfile).toBeNull();
    expect(normalizePersistedNutritionProfile(undefined)).toEqual({ ok: true, profile: null });
    expect(normalizePersistedNutritionProfile(null)).toEqual({ ok: true, profile: null });
  });

  it('guard estrito aceita perfil válido e rejeita inferência silenciosa', () => {
    expect(isNutritionProfile(makeProfile())).toBe(true);
    // Tentativa de derivar de user.gender/goal/restrictions: objeto parcial falha.
    expect(isNutritionProfile({ gender: 'male', goal: 'hypertrophy' })).toBe(false);
    expect(isNutritionProfile({ ...makeProfile(), timezone: 'INVALID_TZ' })).toBe(false);
    expect(isNutritionProfile({ ...makeProfile(), updatedAt: 'ontem' })).toBe(false);
    expect(isNutritionProfile({ ...makeProfile(), biologicalSexForCalcs: 'maleX' })).toBe(false);
    expect(normalizePersistedNutritionProfile({ gender: 'male' }).ok).toBe(false);
  });

  it('PROFILE_SILENT_INFERENCE = NO: ausente vira null, nunca derivado', () => {
    const defaults = createEmptyPersistedState();
    const merged = mergePersistedState(defaults, { nutrition: defaults.nutrition });
    expect(merged.nutritionProfile).toBeNull();
  });
});

describe('NUT004B — gate snapshot discriminado', () => {
  it('EVALUATED carrega resultado canônico + evaluatedAt explícito, sem profileHash', () => {
    const result = evaluateNutritionGate(makeProfile());
    const snap = createEvaluatedGateSnapshot(result, NOW_ISO);
    expect(snap.kind).toBe('EVALUATED');
    expect(isNutritionGateSnapshot(snap)).toBe(true);
    expect((snap as { profileHash?: unknown }).profileHash).toBeUndefined();
  });

  it('PROFILE_ABSENT não inventa status, permite manual e bloqueia automático', () => {
    const snap = createProfileAbsentSnapshot(NOW_ISO);
    expect(snap).toEqual({
      kind: 'PROFILE_ABSENT',
      allowManualTracking: true,
      allowAutomatedTargets: false,
      evaluatedAt: NOW_ISO,
      profileHash: null,
    });
    expect(isNutritionGateSnapshot(snap)).toBe(true);
    expect(isNutritionGateSnapshot({ kind: 'PROFILE_ABSENT', status: 'NORMAL_FLOW' })).toBe(false);
  });

  it('NEW_NUTRITION_GATE_STATUS = NO: nenhum status novo atravessa', () => {
    const result = evaluateNutritionGate(makeProfile());
    expect(['NORMAL_FLOW', 'LIMITED_GUIDANCE', 'PROFESSIONAL_REFERRAL', 'BLOCK_AUTOMATIC_TARGET']).toContain(
      result.status,
    );
  });
});

describe('NUT004B — resolução de targets', () => {
  it('profile null => MANUAL_ONLY / PROFILE_ABSENT', () => {
    const resolution = resolveNutritionTargets({ profile: null, evaluatedAt: NOW_ISO });
    expect(resolution.targetState).toBe('MANUAL_ONLY');
    if (resolution.targetState !== 'MANUAL_ONLY') return expect.unreachable();
    expect(resolution.targetUnavailableReason).toBe('PROFILE_ABSENT');
    expect(resolution.targets).toBeNull();
    expect(resolution.gateSnapshot.kind).toBe('PROFILE_ABSENT');
  });

  it('profile válido + NORMAL_FLOW => AUTOMATED sem timestamp inventado', () => {
    const resolution = resolveNutritionTargets({ profile: makeProfile(), evaluatedAt: NOW_ISO });
    expect(resolution.targetState).toBe('AUTOMATED');
    if (resolution.targetState !== 'AUTOMATED') return expect.unreachable();
    expect(resolution.targets.computedAt).toBeNull();
    expect(resolution.targets.computedAtSource).toBe('absent');
  });

  it('BLOCK_AUTOMATIC_TARGET => MANUAL_ONLY / AUTOMATION_BLOCKED', () => {
    const resolution = resolveNutritionTargets({
      profile: makeProfile({ healthFlags: ['pregnancy'] }),
      evaluatedAt: NOW_ISO,
    });
    expect(resolution.targetState).toBe('MANUAL_ONLY');
    if (resolution.targetState !== 'MANUAL_ONLY') return expect.unreachable();
    expect(resolution.targetUnavailableReason).toBe('AUTOMATION_BLOCKED');
  });

  it('PROFESSIONAL_REFERRAL => MANUAL_ONLY / AUTOMATION_BLOCKED', () => {
    const resolution = resolveNutritionTargets({
      profile: makeProfile({ healthFlags: ['eating_disorder_history'] }),
      evaluatedAt: NOW_ISO,
    });
    expect(resolution.targetState).toBe('MANUAL_ONLY');
    if (resolution.targetState !== 'MANUAL_ONLY') return expect.unreachable();
    expect(resolution.targetUnavailableReason).toBe('AUTOMATION_BLOCKED');
  });

  it('LIMITED_GUIDANCE sem auto targets => MANUAL_ONLY / AUTOMATION_BLOCKED', () => {
    const profile = makeProfile({ heightCm: 0 });
    const gate = evaluateNutritionGate(profile);
    expect(gate.status).toBe('LIMITED_GUIDANCE');
    expect(gate.allowAutomatedTargets).toBe(false);
    const resolution = resolveNutritionTargets({ profile, evaluatedAt: NOW_ISO });
    expect(resolution.targetState).toBe('MANUAL_ONLY');
    if (resolution.targetState !== 'MANUAL_ONLY') return expect.unreachable();
    expect(resolution.targetUnavailableReason).toBe('AUTOMATION_BLOCKED');
  });

  it('engine failure => MANUAL_ONLY / TARGET_RESOLUTION_ERROR sem fallback numérico', () => {
    // Passa no gate (gate não valida frequência), falha no motor.
    const profile = makeProfile({ trainingFrequencyDaysPerWeek: 100 });
    expect(evaluateNutritionGate(profile).allowAutomatedTargets).toBe(true);
    const resolution = resolveNutritionTargets({ profile, evaluatedAt: NOW_ISO });
    expect(resolution.targetState).toBe('MANUAL_ONLY');
    if (resolution.targetState !== 'MANUAL_ONLY') return expect.unreachable();
    expect(resolution.targetUnavailableReason).toBe('TARGET_RESOLUTION_ERROR');
    expect(resolution.targets).toBeNull();
  });
});

describe('NUT004B — NutritionDay AUTOMATED / MANUAL_ONLY', () => {
  it('AUTOMATED exige targets válido e sem motivo', () => {
    const day = createNutritionDay({
      id: 'day-auto',
      date: '2026-09-12',
      timezone: 'America/Sao_Paulo',
      targets: makeTargets(),
    });
    expect(day.targetState).toBe('AUTOMATED');
    expect(day.targets).not.toBeNull();
    expect(isNutritionDay(day)).toBe(true);
  });

  it('MANUAL_ONLY exige targets null + motivo explícito', () => {
    for (const reason of ['PROFILE_ABSENT', 'AUTOMATION_BLOCKED', 'TARGET_RESOLUTION_ERROR'] as const) {
      const day = createNutritionDay({
        id: `day-manual-${reason}`,
        date: '2026-09-12',
        timezone: 'America/Sao_Paulo',
        targets: null,
        targetState: 'MANUAL_ONLY',
        targetUnavailableReason: reason,
      });
      expect(day.targetState).toBe('MANUAL_ONLY');
      expect(day.targets).toBeNull();
      expect(day.targetUnavailableReason).toBe(reason);
      expect(isNutritionDay(day)).toBe(true);
    }
  });

  it('combinações inválidas falham fechado', () => {
    expect(() =>
      createNutritionDay({
        id: 'x',
        date: '2026-09-12',
        timezone: 'America/Sao_Paulo',
        targets: null,
        targetState: 'MANUAL_ONLY',
        targetUnavailableReason: 'BOGUS' as never,
      }),
    ).toThrow(NutritionLedgerError);
    expect(() =>
      createNutritionDay({
        id: 'x',
        date: '2026-09-12',
        timezone: 'America/Sao_Paulo',
        targets: null,
      } as never),
    ).toThrow(NutritionLedgerError);
    expect(
      isNutritionDay({
        id: 'x',
        date: '2026-09-12',
        timezone: 'America/Sao_Paulo',
        targetState: 'AUTOMATED',
        targets: null,
        meals: [],
        hydrationEntries: [],
        isClosed: false,
        closedAt: null,
      }),
    ).toBe(false);
    expect(
      isNutritionDay({
        id: 'x',
        date: '2026-09-12',
        timezone: 'America/Sao_Paulo',
        targetState: 'MANUAL_ONLY',
        targets: makeTargets(),
        targetUnavailableReason: 'PROFILE_ABSENT',
        meals: [],
        hydrationEntries: [],
        isClosed: false,
        closedAt: null,
      }),
    ).toBe(false);
    expect(
      isNutritionDay({
        id: 'x',
        date: '2026-09-12',
        timezone: 'America/Sao_Paulo',
        targetState: 'MANUAL_ONLY',
        targets: null,
        meals: [],
        hydrationEntries: [],
        isClosed: false,
        closedAt: null,
      }),
    ).toBe(false);
  });
});

describe('NUT004B — remaining sem meta implícita', () => {
  it('calculateActuals vale nos dois modos; remaining exige targets', () => {
    const auto = createNutritionDay({
      id: 'a',
      date: '2026-09-12',
      timezone: 'America/Sao_Paulo',
      targets: makeTargets(),
    });
    const manual = createNutritionDay({
      id: 'm',
      date: '2026-09-12',
      timezone: 'America/Sao_Paulo',
      targets: null,
      targetState: 'MANUAL_ONLY',
      targetUnavailableReason: 'PROFILE_ABSENT',
    });
    expect(calculateActuals(auto)).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: 0 });
    expect(calculateActuals(manual)).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: 0 });

    const actuals = { calories: 100, protein: 10, carbs: 10, fat: 10, waterMl: 500 };
    expect(() => calculateRemaining(null as never, actuals)).toThrow(NutritionLedgerError);
    expect(() => calculateRemainingForDay(manual, actuals)).toThrow(NutritionLedgerError);
    const remaining = calculateRemainingForDay(auto, actuals);
    expect(remaining.calories).toBeGreaterThan(0);
  });
});

describe('NUT004B — migração legada', () => {
  const DATE = '2026-09-12';
  const TIMEZONE = 'America/Sao_Paulo';

  it('EMPTY/DEMO descartam; UNKNOWN quarentena; REAL migra', () => {
    expect(classifyLegacyNutrition({ calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 })).toBe('LEGACY_EMPTY');
    expect(
      classifyLegacyNutrition({ calories: 1420, protein: 110, carbs: 150, fat: 45, water: 1200 }),
    ).toBe('LEGACY_DEMO');
    expect(classifyLegacyNutrition({ calories: Number.NaN, protein: 0, carbs: 0, fat: 0, water: 0 })).toBe(
      'UNKNOWN',
    );

    const empty = migrateLegacyNutrition({
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
    });
    expect(empty.outcome).toBe('discarded');

    const unknown = migrateLegacyNutrition({
      nutrition: { calories: -5, protein: 0, carbs: 0, fat: 0, water: 0 },
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
    });
    expect(unknown.outcome).toBe('quarantined');
    if (unknown.outcome !== 'quarantined') return expect.unreachable();
    expect(unknown.day).toBeNull();
    expect(unknown.reasons.length).toBeGreaterThan(0);

    const real = migrateLegacyNutrition({
      nutrition: { calories: 2000, protein: 150, carbs: 200, fat: 60, water: 1800 },
      userWaterIntake: 500,
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
      markClosed: false,
    });
    expect(real.outcome).toBe('migrated');
  });

  it('LEGACY_REAL sem targets => MANUAL_ONLY preservado, sem metas inventadas', () => {
    const result = migrateLegacyNutrition({
      nutrition: { calories: 1850, protein: 140, carbs: 190, fat: 55, water: 2500 },
      userWaterIntake: 0,
      date: DATE,
      timezone: TIMEZONE,
      targets: null,
      targetUnavailableReason: 'PROFILE_ABSENT',
      markClosed: false,
    });
    expect(result.outcome).toBe('migrated');
    if (result.outcome !== 'migrated') return expect.unreachable();
    expect(result.day.targetState).toBe('MANUAL_ONLY');
    expect(result.day.targets).toBeNull();
    expect(result.day.isClosed).toBe(false);
    const actuals = calculateActuals(result.day);
    expect(actuals.calories).toBe(1850);
    expect(actuals.waterMl).toBe(2500);
  });

  it('migration replay é idempotente', () => {
    const input = {
      nutrition: { calories: 2000, protein: 150, carbs: 200, fat: 60, water: 1800 },
      date: DATE,
      timezone: TIMEZONE,
      targets: makeTargets(),
      markClosed: false,
    } as const;
    const first = migrateLegacyNutrition({ ...input });
    const second = migrateLegacyNutrition({ ...input });
    expect(second).toEqual(first);
  });
});

describe('NUT004B — cold boot e espelhos', () => {
  it('boot 2x sem duplicação; marker impede reclassificação', async () => {
    const repository = createInMemoryNutritionDayRepository();
    const input = {
      repository,
      now: NOW,
      profile: null,
      savedNutrition: { calories: 1850, protein: 140, carbs: 190, fat: 55, water: 2500 },
      savedUserWaterIntake: 0,
    };
    const first = await runNutritionColdBoot(input);
    expect(first.ok).toBe(true);
    if (!first.ok) return expect.unreachable();
    expect(first.day.targetState).toBe('MANUAL_ONLY');
    expect(first.mirrors.calories).toBe(1850);

    const second = await runNutritionColdBoot(input);
    expect(second.ok).toBe(true);
    if (!second.ok) return expect.unreachable();
    expect(second.day.id).toBe(first.day.id);
    expect(await repository.listNutritionDays()).toHaveLength(1);
    expect(isLedgerMigrationMarker(await repository.getNutritionMigrationMarker())).toBe(true);
  });

  it('projeção reflete actuals sem XP e preserva last* como contrato temporário', async () => {
    const repository = createInMemoryNutritionDayRepository();
    const boot = await runNutritionColdBoot({
      repository,
      now: NOW,
      profile: makeProfile(),
      savedNutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
      savedUserWaterIntake: 0,
    });
    expect(boot.ok).toBe(true);
    if (!boot.ok) return expect.unreachable();
    const projected = projectCompatMirrors(boot.actuals, {
      lastMacroLoggedDate: '2026-09-11',
      lastWaterXpDate: '2026-09-11',
    });
    expect(projected.calories).toBe(0);
    expect(projected.water).toBe(0);
    expect(projected.lastMacroLoggedDate).toBe('2026-09-11');
    expect(projected.lastWaterXpDate).toBe('2026-09-11');
  });

  it('MANUAL_TRACKING_WITHOUT_TARGETS = PASS: sem perfil, dia manual e actuals válidos', async () => {
    const repository = createInMemoryNutritionDayRepository();
    const boot = await runNutritionColdBoot({
      repository,
      now: NOW,
      profile: null,
      savedNutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
      savedUserWaterIntake: 0,
    });
    expect(boot.ok).toBe(true);
    if (!boot.ok) return expect.unreachable();
    expect(boot.day.targetState).toBe('MANUAL_ONLY');
    expect(boot.resolution.targetState).toBe('MANUAL_ONLY');
  });
});

describe('NUT004B — timezone sem hardcode', () => {
  it('com perfil usa timezone validado; sem perfil usa runtime via Intl', () => {
    const withProfile = resolveEffectiveTimezone('America/Sao_Paulo');
    expect(withProfile).toEqual({ ok: true, timezone: 'America/Sao_Paulo', source: 'profile' });

    const runtime = resolveEffectiveTimezone(null);
    expect(runtime.ok).toBe(true);
    if (!runtime.ok) return expect.unreachable();
    expect(typeof runtime.timezone).toBe('string');
  });

  it('timezone inválido falha explícito sem fallback para UTC ou America/Sao_Paulo', () => {
    const bad = resolveEffectiveTimezone('INVALID_TZ_999');
    expect(bad.ok).toBe(false);
  });
});
