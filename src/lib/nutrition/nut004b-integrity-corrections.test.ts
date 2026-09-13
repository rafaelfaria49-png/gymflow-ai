/**
 * GymFlow AI — Regressões das correções de integridade (GOAL-085)
 *
 * P1 bloqueadores do GOAL-084:
 * 1. gateSnapshot persistido no NutritionDay (nunca só em memória);
 * 2. guards fail-closed para dias NUT-004B sem gate coerente.
 *
 * Cobre (§10):
 * - gate AUTOMATED / AUTOMATION_BLOCKED / PROFILE_ABSENT / TARGET_RESOLUTION_ERROR
 * - dia novo sem gate rejeitado (create + isNutritionDay)
 * - legado NUT-004A legível, sem gate fabricado
 * - round-trip IDB preserva o snapshot; corrompido falha fechado
 * - bridge persiste o snapshot (não só TargetResolution em memória)
 */

import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { NutritionProfile } from '../../types/nutrition';
import {
  createEvaluatedGateSnapshot,
  createProfileAbsentSnapshot,
  isNutritionGateSnapshot,
} from './gate-snapshot';
import {
  calculateActuals,
  createNutritionDay,
} from './ledger';
import {
  isCoherentAutomatedGateSnapshot,
  isCoherentManualGateSnapshot,
  isNutritionDay,
  NutritionLedgerError,
} from './ledger-types';
import { migrateLegacyNutrition } from './migration';
import { evaluateNutritionGate } from './profile-gates';
import {
  createInMemoryNutritionDayRepository,
  ensureTodayNutritionDay,
} from './rollover';
import { resolveNutritionTargets } from './target-resolution';
import { runNutritionColdBoot } from './provider-bridge';
import type { DailyTargets } from './engine-types';
import { calculateDailyTargets } from './engine';
import {
  GYMFLOW_INDEXEDDB_VERSION,
  IndexedDbWorkoutHistoryStorage,
  NUTRITION_DAYS_STORE,
  NutritionDayIntegrityError,
} from '../storage-indexeddb';

function makeProfile(overrides: Partial<NutritionProfile> = {}): NutritionProfile {
  return {
    age: 30,
    heightCm: 175,
    weightKg: 75,
    biologicalSexForCalcs: 'male',
    goal: 'maintenance',
    trainingFrequencyDaysPerWeek: 4,
    averageTrainingDurationMinutes: 60,
    dietaryPattern: 'omnivore',
    nonExerciseActivity: 'moderately_active',
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

function makeAutomatedSnapshot() {
  return createEvaluatedGateSnapshot(evaluateNutritionGate(makeProfile()), NOW_ISO);
}

function makeBlockedSnapshot() {
  return createEvaluatedGateSnapshot(
    evaluateNutritionGate(makeProfile({ healthFlags: ['pregnancy'] })),
    NOW_ISO,
  );
}

function makeAbsentSnapshot() {
  return createProfileAbsentSnapshot(NOW_ISO);
}

describe('GOAL-085 — gate snapshot AUTOMATED persistido', () => {
  it('create persiste EVALUATED permitido; objeto contém o snapshot', () => {
    const snapshot = makeAutomatedSnapshot();
    const day = createNutritionDay({
      id: 'day-auto',
      date: '2026-09-12',
      timezone: 'America/Sao_Paulo',
      targets: makeTargets(),
      gateSnapshot: snapshot,
    });
    expect(day.targetState).toBe('AUTOMATED');
    expect(day.gateSnapshot).toEqual(snapshot);
    expect(day.gateSnapshot.kind).toBe('EVALUATED');
    expect(isNutritionDay(day)).toBe(true);
    expect(isCoherentAutomatedGateSnapshot(day.gateSnapshot)).toBe(true);
  });

  it('snapshot é cópia: mutar a resolução não afeta o dia persistido', () => {
    const snapshot = makeAutomatedSnapshot();
    const day = createNutritionDay({
      id: 'day-auto-copy',
      date: '2026-09-12',
      timezone: 'America/Sao_Paulo',
      targets: makeTargets(),
      gateSnapshot: snapshot,
    });
    if (snapshot.kind !== 'EVALUATED') return expect.unreachable();
    snapshot.result.reasons.push('INVENTADO-DEPOIS');
    expect(day.gateSnapshot.kind).toBe('EVALUATED');
    if (day.gateSnapshot.kind !== 'EVALUATED') return expect.unreachable();
    expect(day.gateSnapshot.result.reasons).not.toContain('INVENTADO-DEPOIS');
  });
});

describe('GOAL-085 — gate snapshot AUTOMATION_BLOCKED persistido', () => {
  it('MANUAL_ONLY bloqueado persiste EVALUATED com flags incompatíveis com automação', () => {
    const snapshot = makeBlockedSnapshot();
    expect(snapshot.result.allowAutomatedTargets).toBe(false);
    const day = createNutritionDay({
      id: 'day-blocked',
      date: '2026-09-12',
      timezone: 'America/Sao_Paulo',
      targets: null,
      targetState: 'MANUAL_ONLY',
      targetUnavailableReason: 'AUTOMATION_BLOCKED',
      gateSnapshot: snapshot,
    });
    expect(day.gateSnapshot).toEqual(snapshot);
    expect(isNutritionDay(day)).toBe(true);
    expect(isCoherentManualGateSnapshot(day.gateSnapshot, 'AUTOMATION_BLOCKED')).toBe(true);
  });
});

describe('GOAL-085 — gate snapshot PROFILE_ABSENT persistido', () => {
  it('MANUAL_ONLY ausente persiste PROFILE_ABSENT sem status inventado', () => {
    const snapshot = makeAbsentSnapshot();
    const day = createNutritionDay({
      id: 'day-absent',
      date: '2026-09-12',
      timezone: 'America/Sao_Paulo',
      targets: null,
      targetState: 'MANUAL_ONLY',
      targetUnavailableReason: 'PROFILE_ABSENT',
      gateSnapshot: snapshot,
    });
    expect(day.gateSnapshot).toEqual({
      kind: 'PROFILE_ABSENT',
      allowManualTracking: true,
      allowAutomatedTargets: false,
      evaluatedAt: NOW_ISO,
      profileHash: null,
    });
    expect(isNutritionDay(day)).toBe(true);
  });
});

describe('GOAL-085 — TARGET_RESOLUTION_ERROR com snapshot coerente', () => {
  it('erro do motor persiste EVALUATED permitido (perfil existiu)', () => {
    const profile = makeProfile({ trainingFrequencyDaysPerWeek: 100 });
    expect(evaluateNutritionGate(profile).allowAutomatedTargets).toBe(true);
    const resolution = resolveNutritionTargets({ profile, evaluatedAt: NOW_ISO });
    expect(resolution.targetState).toBe('MANUAL_ONLY');
    if (resolution.targetState !== 'MANUAL_ONLY') return expect.unreachable();
    expect(resolution.targetUnavailableReason).toBe('TARGET_RESOLUTION_ERROR');
    expect(resolution.gateSnapshot.kind).toBe('EVALUATED');

    const day = createNutritionDay({
      id: 'day-error',
      date: '2026-09-12',
      timezone: 'America/Sao_Paulo',
      targets: null,
      targetState: 'MANUAL_ONLY',
      targetUnavailableReason: 'TARGET_RESOLUTION_ERROR',
      gateSnapshot: resolution.gateSnapshot,
    });
    expect(isNutritionDay(day)).toBe(true);
    expect(isCoherentManualGateSnapshot(day.gateSnapshot, 'TARGET_RESOLUTION_ERROR')).toBe(true);
  });
});

describe('GOAL-085 — dia novo sem gate é rejeitado', () => {
  it('createNutritionDay falha INVALID_TARGETS sem gateSnapshot', () => {
    expect(() =>
      createNutritionDay({
        id: 'x',
        date: '2026-09-12',
        timezone: 'America/Sao_Paulo',
        targets: makeTargets(),
      } as never),
    ).toThrowError(NutritionLedgerError);
    expect(() =>
      createNutritionDay({
        id: 'x',
        date: '2026-09-12',
        timezone: 'America/Sao_Paulo',
        targets: null,
        targetState: 'MANUAL_ONLY',
        targetUnavailableReason: 'PROFILE_ABSENT',
      } as never),
    ).toThrowError(NutritionLedgerError);
  });

  it('ensureToday falha INVALID_TARGETS sem gate e sem escrever nada', async () => {
    const repository = createInMemoryNutritionDayRepository();
    await expect(
      ensureTodayNutritionDay({
        now: NOW,
        timezone: 'America/Sao_Paulo',
        targets: makeTargets(),
        targetState: 'AUTOMATED',
        repository,
      } as never),
    ).rejects.toMatchObject({ name: 'NutritionLedgerError', code: 'INVALID_TARGETS' });
    expect(await repository.listNutritionDays()).toHaveLength(0);
  });

  it('isNutritionDay rejeita dia NUT-004B sem gateSnapshot', () => {
    const automated = {
      id: 'x',
      date: '2026-09-12',
      timezone: 'America/Sao_Paulo',
      targetState: 'AUTOMATED',
      targets: makeTargets(),
      meals: [],
      hydrationEntries: [],
      isClosed: false,
      closedAt: null,
    };
    expect(isNutritionDay(automated)).toBe(false);
    const manual = {
      id: 'x',
      date: '2026-09-12',
      timezone: 'America/Sao_Paulo',
      targetState: 'MANUAL_ONLY',
      targets: null,
      targetUnavailableReason: 'PROFILE_ABSENT',
      meals: [],
      hydrationEntries: [],
      isClosed: false,
      closedAt: null,
    };
    expect(isNutritionDay(manual)).toBe(false);
  });

  it.each([
    ['PROFILE_ABSENT com EVALUATED', makeAutomatedSnapshot(), 'PROFILE_ABSENT'],
    ['AUTOMATION_BLOCKED com PROFILE_ABSENT', makeAbsentSnapshot(), 'AUTOMATION_BLOCKED'],
    ['AUTOMATION_BLOCKED com EVALUATED permitido', makeAutomatedSnapshot(), 'AUTOMATION_BLOCKED'],
    ['TARGET_RESOLUTION_ERROR com PROFILE_ABSENT', makeAbsentSnapshot(), 'TARGET_RESOLUTION_ERROR'],
    ['TARGET_RESOLUTION_ERROR com EVALUATED bloqueado', makeBlockedSnapshot(), 'TARGET_RESOLUTION_ERROR'],
  ])('incoerência manual é rejeitada: %s', (_label, snapshot, reason) => {
    expect(
      isNutritionDay({
        id: 'x',
        date: '2026-09-12',
        timezone: 'America/Sao_Paulo',
        targetState: 'MANUAL_ONLY',
        targets: null,
        targetUnavailableReason: reason,
        gateSnapshot: snapshot,
        meals: [],
        hydrationEntries: [],
        isClosed: false,
        closedAt: null,
      }),
    ).toBe(false);
    expect(() =>
      createNutritionDay({
        id: 'x',
        date: '2026-09-12',
        timezone: 'America/Sao_Paulo',
        targets: null,
        targetState: 'MANUAL_ONLY',
        targetUnavailableReason: reason as 'PROFILE_ABSENT',
        gateSnapshot: snapshot,
      }),
    ).toThrowError(NutritionLedgerError);
  });

  it('EVALUATED com flags incompatíveis é rejeitado no dia AUTOMATED', () => {
    expect(
      isNutritionDay({
        id: 'x',
        date: '2026-09-12',
        timezone: 'America/Sao_Paulo',
        targetState: 'AUTOMATED',
        targets: makeTargets(),
        gateSnapshot: makeBlockedSnapshot(),
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
        targetState: 'AUTOMATED',
        targets: makeTargets(),
        gateSnapshot: makeAbsentSnapshot(),
        meals: [],
        hydrationEntries: [],
        isClosed: false,
        closedAt: null,
      }),
    ).toBe(false);
  });

  it('snapshot parcial/malformado e evaluatedAt inválido falham fechado', () => {
    const base = {
      id: 'x',
      date: '2026-09-12',
      timezone: 'America/Sao_Paulo',
      targetState: 'AUTOMATED',
      targets: makeTargets(),
      meals: [],
      hydrationEntries: [],
      isClosed: false,
      closedAt: null,
    };
    expect(isNutritionDay({ ...base, gateSnapshot: { kind: 'EVALUATED' } })).toBe(false);
    expect(isNutritionDay({ ...base, gateSnapshot: { kind: 'FUTURE_KIND' } })).toBe(false);
    expect(isNutritionDay({ ...base, gateSnapshot: null })).toBe(false);
    const badDate = JSON.parse(JSON.stringify(makeAutomatedSnapshot())) as Record<string, unknown>;
    badDate['evaluatedAt'] = 'ontem';
    expect(isNutritionDay({ ...base, gateSnapshot: badDate })).toBe(false);
    const badFlags = JSON.parse(JSON.stringify(makeAutomatedSnapshot())) as {
      result: Record<string, unknown>;
    };
    badFlags.result['allowAutomatedTargets'] = 'sim';
    expect(isNutritionDay({ ...base, gateSnapshot: badFlags })).toBe(false);
  });
});

describe('GOAL-085 — legado NUT-004A segue legível, sem gate fabricado', () => {
  it('dia sem targetState e com targets válido é legível como legado AUTOMATED', () => {
    const legacy = {
      id: 'legacy-day',
      date: '2026-09-10',
      timezone: 'America/Sao_Paulo',
      targets: makeTargets(),
      meals: [],
      hydrationEntries: [],
      isClosed: true,
      closedAt: '2026-09-10T23:00:00.000Z',
    };
    expect(isNutritionDay(legacy)).toBe(true);
    expect('gateSnapshot' in legacy).toBe(false);
  });

  it('legado com gate acoplado é malformado (nenhum produtor legado o emitiu)', () => {
    expect(
      isNutritionDay({
        id: 'legacy-day',
        date: '2026-09-10',
        timezone: 'America/Sao_Paulo',
        targets: makeTargets(),
        gateSnapshot: makeAutomatedSnapshot(),
        meals: [],
        hydrationEntries: [],
        isClosed: false,
        closedAt: null,
      }),
    ).toBe(false);
  });
});

describe('GOAL-085 — bridge persiste o snapshot (não só em memória)', () => {
  it.each([
    ['AUTOMATED', makeProfile(), 'AUTOMATED'],
    ['PROFILE_ABSENT', null, 'MANUAL_ONLY'],
    ['AUTOMATION_BLOCKED', makeProfile({ healthFlags: ['pregnancy'] }), 'MANUAL_ONLY'],
  ])('cold boot %s: dia persistido contém o gateSnapshot da resolução', async (_label, profile, state) => {
    const repository = createInMemoryNutritionDayRepository();
    const boot = await runNutritionColdBoot({
      repository,
      now: NOW,
      profile,
      savedNutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
      savedUserWaterIntake: 0,
    });
    expect(boot.ok).toBe(true);
    if (!boot.ok) return expect.unreachable();
    expect(boot.day.targetState).toBe(state);
    expect(isNutritionGateSnapshot(boot.day.gateSnapshot)).toBe(true);
    expect(boot.day.gateSnapshot).toEqual(boot.resolution.gateSnapshot);
    const persisted = await repository.getNutritionDay(boot.today);
    expect(persisted).not.toBeNull();
    expect(persisted?.gateSnapshot).toEqual(boot.resolution.gateSnapshot);
  });

  it('LEGACY_REAL carrega gateSnapshot no dia migrado e preserva consumo', async () => {
    const repository = createInMemoryNutritionDayRepository();
    const boot = await runNutritionColdBoot({
      repository,
      now: NOW,
      profile: null,
      savedNutrition: { calories: 1850, protein: 140, carbs: 190, fat: 55, water: 2500 },
      savedUserWaterIntake: 0,
    });
    expect(boot.ok).toBe(true);
    if (!boot.ok) return expect.unreachable();
    expect(boot.day.gateSnapshot.kind).toBe('PROFILE_ABSENT');
    const persisted = await repository.getNutritionDay(boot.today);
    expect(persisted?.gateSnapshot.kind).toBe('PROFILE_ABSENT');
    expect(calculateActuals(persisted!)).toMatchObject({ calories: 1850, waterMl: 2500 });
  });

  it('ensureTodayWithResolution via bridge: dia criado pelo bridge nunca sai sem gate', async () => {
    const repository = createInMemoryNutritionDayRepository();
    const resolution = resolveNutritionTargets({ profile: makeProfile(), evaluatedAt: NOW_ISO });
    if (resolution.targetState !== 'AUTOMATED') return expect.unreachable();
    const ensured = await ensureTodayNutritionDay({
      now: NOW,
      timezone: 'America/Sao_Paulo',
      targets: resolution.targets,
      targetState: 'AUTOMATED',
      gateSnapshot: resolution.gateSnapshot,
      repository,
    });
    expect(ensured.day.gateSnapshot).toEqual(resolution.gateSnapshot);
  });
});

describe('GOAL-085 — round-trip IDB preserva gate; corrompido falha fechado', () => {
  let sequence = 9000;

  function harness() {
    const factory = new IDBFactory();
    const name = `gymflow-nut004b-085-${(sequence += 1)}`;
    const adapter = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name });
    return { adapter, factory, name };
  }

  function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionResult(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => undefined;
    });
  }

  async function writeRawDay(factory: IDBFactory, name: string, record: unknown): Promise<void> {
    const request = factory.open(name, GYMFLOW_INDEXEDDB_VERSION);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(NUTRITION_DAYS_STORE, 'readwrite');
    const completed = transactionResult(transaction);
    await requestResult(transaction.objectStore(NUTRITION_DAYS_STORE).put(record));
    await completed;
    database.close();
  }

  it('round-trip preserva gateSnapshot byte a byte (AUTOMATED e MANUAL)', async () => {
    const { adapter } = harness();
    await adapter.open();
    const auto = createNutritionDay({
      id: 'day-auto-rt',
      date: '2026-09-12',
      timezone: 'America/Sao_Paulo',
      targets: makeTargets(),
      gateSnapshot: makeAutomatedSnapshot(),
    });
    const manual = createNutritionDay({
      id: 'day-manual-rt',
      date: '2026-09-11',
      timezone: 'America/Sao_Paulo',
      targets: null,
      targetState: 'MANUAL_ONLY',
      targetUnavailableReason: 'PROFILE_ABSENT',
      gateSnapshot: makeAbsentSnapshot(),
    });
    await adapter.putNutritionDay(auto);
    await adapter.putNutritionDayIfAbsent(manual);
    expect(await adapter.getNutritionDay('2026-09-12')).toEqual(auto);
    expect(await adapter.getNutritionDay('2026-09-11')).toEqual(manual);
    await adapter.close();
  });

  it('put rejeita dia 004B sem gate sem persistir nada', async () => {
    const { adapter } = harness();
    await adapter.open();
    const gateless = {
      id: 'day-gateless',
      date: '2026-09-12',
      timezone: 'America/Sao_Paulo',
      targetState: 'AUTOMATED',
      targets: makeTargets(),
      meals: [],
      hydrationEntries: [],
      isClosed: false,
      closedAt: null,
    };
    await expect(adapter.putNutritionDay(gateless as never)).rejects.toBeInstanceOf(
      NutritionDayIntegrityError,
    );
    await expect(adapter.putNutritionDayIfAbsent(gateless as never)).rejects.toBeInstanceOf(
      NutritionDayIntegrityError,
    );
    expect(await adapter.listNutritionDays()).toEqual([]);
    await adapter.close();
  });

  it('leitura de dia corrompido (gate parcial) falha fechado no get e no list', async () => {
    const { adapter, factory, name } = harness();
    await adapter.open();
    const corrupt = JSON.parse(JSON.stringify(createNutritionDay({
      id: 'day-corrupt',
      date: '2026-09-12',
      timezone: 'America/Sao_Paulo',
      targets: makeTargets(),
      gateSnapshot: makeAutomatedSnapshot(),
    }))) as Record<string, unknown>;
    (corrupt['gateSnapshot'] as Record<string, unknown>)['evaluatedAt'] = 'não-é-iso';
    await writeRawDay(factory, name, corrupt);
    await expect(adapter.getNutritionDay('2026-09-12')).rejects.toBeInstanceOf(
      NutritionDayIntegrityError,
    );
    await expect(adapter.listNutritionDays()).rejects.toBeInstanceOf(NutritionDayIntegrityError);
    await adapter.close();
  });

  it('leitura de dia 004B com gate removido do disco falha fechado', async () => {
    const { adapter, factory, name } = harness();
    await adapter.open();
    const stripped = JSON.parse(JSON.stringify(createNutritionDay({
      id: 'day-stripped',
      date: '2026-09-12',
      timezone: 'America/Sao_Paulo',
      targets: null,
      targetState: 'MANUAL_ONLY',
      targetUnavailableReason: 'AUTOMATION_BLOCKED',
      gateSnapshot: makeBlockedSnapshot(),
    }))) as Record<string, unknown>;
    delete stripped['gateSnapshot'];
    await writeRawDay(factory, name, stripped);
    await expect(adapter.getNutritionDay('2026-09-12')).rejects.toBeInstanceOf(
      NutritionDayIntegrityError,
    );
    await adapter.close();
  });

  it('LEGACY_REAL migrado com snapshot faz round-trip íntegro', async () => {
    const { adapter } = harness();
    await adapter.open();
    const migrated = migrateLegacyNutrition({
      nutrition: { calories: 2000, protein: 150, carbs: 200, fat: 60, water: 1800 },
      userWaterIntake: 500,
      date: '2026-09-12',
      timezone: 'America/Sao_Paulo',
      targets: makeTargets(),
      gateSnapshot: makeAutomatedSnapshot(),
      markClosed: false,
    });
    if (migrated.outcome !== 'migrated') return expect.unreachable();
    await adapter.putNutritionDayIfAbsent(migrated.day);
    const reread = await adapter.getNutritionDay('2026-09-12');
    expect(reread).toEqual(migrated.day);
    expect(reread?.gateSnapshot.kind).toBe('EVALUATED');
    await adapter.close();
  });
});
