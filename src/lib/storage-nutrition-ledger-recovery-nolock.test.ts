/**
 * GOAL-102 (GYMFLOW-NUT004C-LEDGER-RECOVERY-NOLOCK-FAILCLOSED-102) — provas fail-closed.
 *
 * Elimina exclusivamente o P1 do GOAL-101: o boot recovery do ledger NÃO pode
 * executar replace/convergência sem Web Lock EXCLUSIVE quando houver
 * possibilidade cross-tab. Sem a primitiva `runNutritionAdminWithExclusiveLock`
 * ou com `NutritionAdminLockUnavailableError`, o recovery retorna
 * recovery-required com o journal preservado — nunca converge direto, nunca
 * declara convergência, nunca usa o fence como substituto de exclusão.
 *
 * Aceite coberto aqui:
 * - RECOVERY_WITHOUT_WEBLOCK = BLOCKED_FAIL_CLOSED (§6)
 * - RECOVERY_WITHOUT_LOCK_PRIMITIVE = BLOCKED_FAIL_CLOSED (§9)
 * - LEDGER_WRITE_ATTEMPTED_WITHOUT_LOCK = NO
 * - JOURNAL_PRESERVED_WITHOUT_LOCK = YES
 * - HYDRATION_ALLOWED_WITHOUT_PROVEN_RECOVERY = NO
 * - BOOT_RECOVERY_WITHOUT_WEBLOCK_CROSS_TAB_SAFE = YES, por FAIL-CLOSED (§8)
 * - DEFERRED_RECOVERY_REPLAY = PASS (§10)
 * - SETTLED_LEDGER_RECOVERY = PASS / REVERTED_LEDGER_RECOVERY = PASS (§11)
 * - Lock disponível: no-op quando equivalente, replace sob EXCLUSIVE quando
 *   divergente, sem regressão (§7)
 */
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { createStorageAdminRuntime } from './storage-admin-runtime';
import {
  createHybridStorageRuntime,
} from './storage-hybrid';
import {
  IndexedDbWorkoutHistoryStorage,
} from './storage-indexeddb';
import {
  createLogicalStorageExportV2,
} from './storage-logical-backup';
import {
  commitLogicalStorageImportV2,
  type LogicalImportCommitStep,
} from './storage-logical-import';
import { recoverLogicalStorageAdministrationV2 } from './storage-administrative-recovery';
import { runStorageBootRecovery } from './storage-boot-recovery';
import {
  serializeNutritionLedgerCanonically,
  validateNutritionLedgerBackupSection,
  type NutritionLedgerBackupSection,
} from './storage-nutrition-ledger-backup';
import type { LedgerMigrationMarker, NutritionDay } from './nutrition/ledger-types';
import { calculateDailyTargets } from './nutrition/engine';
import { evaluateNutritionGate } from './nutrition/profile-gates';
import { createEvaluatedGateSnapshot } from './nutrition/gate-snapshot';
import type { NutritionProfile } from '../types/nutrition';
import type { PersistedState, StorageLike } from './storage-types';
import type { NutritionCrossTabLockManager } from './nutrition/admin-lock';
import { createFakeNutritionCrossTabLockManager } from './nutrition/admin-lock-fake';
import { isTerminalStorageOperationStatus } from './storage-operation-receipt';

const KEY = 'gymflow:state:v1';
let databaseSequence = 0;
let ownerOperationSequence = 0;

function createTestOwnerToken() {
  return {
    createOperationId: () => `operation-owner-nolock-${(ownerOperationSequence += 1)}`,
    acquire: () => ({
      status: 'acquired' as const,
      reason: 'acquired' as const,
      lease: {
        confirm: () => ({ status: 'owned' as const, reason: 'confirmed' as const }),
        execute: async <T>(operation: () => T | Promise<T>) => operation(),
        release: () => ({ status: 'released' as const, reason: 'released' as const }),
      },
    }),
  };
}

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function makeProfile(): NutritionProfile {
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
    updatedAt: '2026-09-12T12:00:00.000Z',
  };
}

const GATE_AT = '2026-09-12T12:00:00.000Z';

function makeAutomatedDay(date: string, closed = false): NutritionDay {
  const targets = calculateDailyTargets(makeProfile());
  const gateSnapshot = createEvaluatedGateSnapshot(evaluateNutritionGate(makeProfile()), GATE_AT);
  return {
    id: `day-${date}`,
    date,
    timezone: 'America/Sao_Paulo',
    targetState: 'AUTOMATED',
    targets,
    gateSnapshot,
    meals: [
      {
        id: `meal-${date}-1`,
        type: 'lunch',
        name: 'Almoço',
        entries: [
          {
            id: `food-${date}-1`,
            name: 'Arroz e feijão',
            quantityGrams: 300,
            calories: 500,
            protein: 20,
            carbs: 80,
            fat: 10,
            loggedAt: `${date}T12:00:00.000Z`,
          },
        ],
      },
    ],
    hydrationEntries: [{ id: `water-${date}-1`, amountMl: 500, loggedAt: `${date}T13:00:00.000Z` }],
    isClosed: closed,
    closedAt: closed ? `${date}T23:59:00.000Z` : null,
  };
}

function makeRealMarker(): LedgerMigrationMarker {
  return {
    version: 1,
    status: 'completed',
    classification: 'LEGACY_REAL',
    migratedAt: '2026-09-12T12:00:00.000Z',
    source: 'legacy-nutrition-log',
  };
}

function defaults(): PersistedState {
  return {
    user: null,
    weeklyPlan: [],
    customPrograms: [],
    activeWorkout: null,
    activeWorkoutStartedAt: null,
    restTimerEndAt: null,
    restTimerTotalSeconds: null,
    restTimerLabel: null,
    workoutHistory: [],
    weightHistory: [],
    measurementsHistory: [],
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
    achievements: [],
    challenges: [],
    favoriteExercises: [],
    recentlyViewedVideoIds: [],
    gymProfile: null,
    nutritionProfile: null,
  } as unknown as PersistedState;
}

interface Harness {
  storage: MemoryStorage;
  factory: IDBFactory;
  name: string;
  adapter: IndexedDbWorkoutHistoryStorage;
  runtime: ReturnType<typeof createStorageAdminRuntime>;
}

/** Locks explícitos por harness: fake determinístico ou null (indisponível). */
async function createReadyHarness(locks: NutritionCrossTabLockManager | null): Promise<Harness> {
  const storage = new MemoryStorage();
  const factory = new IDBFactory();
  const name = `gymflow-ledger-nolock-${(databaseSequence += 1)}`;
  let generation = 0;
  const adapter = new IndexedDbWorkoutHistoryStorage({
    factory,
    databaseName: name,
    generationIdFactory: () => `generation-${(generation += 1)}`,
    now: () => new Date('2026-09-12T08:00:00.000Z'),
    locks,
  });
  const hybrid = createHybridStorageRuntime({
    key: KEY,
    storage,
    adapter,
    defaults: defaults(),
    now: () => new Date('2026-09-12T08:00:00.000Z'),
  });
  const hydration = await hybrid.hydrate();
  if (hydration.mode !== 'hybrid-v2') throw new Error('setup falhou');
  const runtime = createStorageAdminRuntime({ key: KEY, storage, adapter });
  return { storage, factory, name, adapter, runtime };
}

function previousSection(): NutritionLedgerBackupSection {
  return {
    days: [makeAutomatedDay('2026-09-10', true)],
    activeDate: '2026-09-10',
    migrationMarker: makeRealMarker(),
  };
}

function targetSection(): NutritionLedgerBackupSection {
  return {
    days: [makeAutomatedDay('2026-09-12')],
    activeDate: '2026-09-12',
    migrationMarker: makeRealMarker(),
  };
}

interface DivergentWorld extends Harness {
  operationId: string;
  receiptStatusBefore: string;
  coreBefore: string | null;
  ledgerBeforeJson: string;
  ledgerBeforeDates: string[];
  targetCanonical: string;
  previousCanonical: string;
}

/**
 * Mundo com recovery pendente e ledger divergente do esperado: semeia o ledger
 * previous, importa o backup doador (ledger target) com falha induzida, e
 * prova as pré-condições (journal em aberto, ledger ≠ esperado).
 */
async function prepareDivergentImportWorld(
  locks: NutritionCrossTabLockManager | null,
  faultStep: LogicalImportCommitStep,
): Promise<DivergentWorld> {
  const harness = await createReadyHarness(locks);
  const previous = previousSection();
  const target = targetSection();
  await harness.adapter.replaceNutritionLedgerAsAdmin(previous);
  const previousCanonical = serializeNutritionLedgerCanonically(previous);
  const targetCanonical = serializeNutritionLedgerCanonically(target);

  const donor = await createReadyHarness(locks);
  await donor.adapter.replaceNutritionLedgerAsAdmin(target);
  const donorExport = await createLogicalStorageExportV2({
    runtime: donor.runtime,
    readNutritionLedger: () => donor.adapter.snapshotNutritionLedger(),
    now: new Date('2026-09-12T10:00:00.000Z'),
  });
  expect(donorExport.ok).toBe(true);
  if (!donorExport.ok) throw new Error('export doador falhou');

  let injected = false;
  const crashed = await commitLogicalStorageImportV2({
    raw: donorExport.content,
    runtime: harness.runtime,
    adapter: harness.adapter,
    storage: harness.storage,
    key: KEY,
    now: () => new Date('2026-09-12T11:00:00.000Z'),
    ownerToken: createTestOwnerToken(),
    afterStep: async (step) => {
      if (step === faultStep && !injected) {
        injected = true;
        throw new Error(`fault:${faultStep}`);
      }
    },
  });
  expect(injected).toBe(true);
  expect(crashed.ok).toBe(false);
  const operationId = (crashed as { operationId: string | null }).operationId;
  expect(typeof operationId).toBe('string');
  if (typeof operationId !== 'string') throw new Error('operationId ausente após falha induzida');

  const receipt = await harness.adapter.readStorageOperationReceipt(operationId);
  expect(receipt).not.toBeNull();
  expect(isTerminalStorageOperationStatus(receipt?.status as string)).toBe(false);
  const snapshot = await harness.adapter.readStorageAdministrationSnapshot();
  expect(snapshot.unsettledOperations.map((entry) => entry.operationId)).toContain(operationId);

  const ledgerBefore = await harness.adapter.snapshotNutritionLedger();
  const ledgerBeforeDates = ledgerBefore.days.map((day) => day.date);
  // Divergente do previous (dias do target já staged) — nunca híbrido parcial.
  expect(ledgerBeforeDates).toContain('2026-09-12');
  expect(ledgerBeforeDates).not.toContain('2026-09-10');

  return {
    ...harness,
    operationId,
    receiptStatusBefore: receipt?.status as string,
    coreBefore: harness.storage.getItem(KEY),
    ledgerBeforeJson: JSON.stringify(ledgerBefore),
    ledgerBeforeDates,
    targetCanonical,
    previousCanonical,
  };
}

describe('GOAL-102 — ledger recovery fail-closed sem Web Lock (NOLOCK)', () => {
  it('LOCK_UNAVAILABLE (§6): runNutritionAdminWithExclusiveLock lança => recovery-required, sem write, journal intacto, sem hidratação', async () => {
    const world = await prepareDivergentImportWorld(null, 'core-committed');
    const replaceSpy = vi.spyOn(world.adapter, 'replaceNutritionLedgerAsAdmin');
    const clearSpy = vi.spyOn(world.adapter, 'clearNutritionLedgerAsAdmin');

    const runtime = createStorageAdminRuntime({ key: KEY, storage: world.storage, adapter: world.adapter });
    const result = await recoverLogicalStorageAdministrationV2({
      runtime,
      adapter: world.adapter as never,
      storage: world.storage,
      key: KEY,
      ownerToken: createTestOwnerToken() as never,
    });

    // RECOVERY_WITHOUT_WEBLOCK = BLOCKED_FAIL_CLOSED
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'recovery-required', recoveryRequired: true });
    expect(result.operationId).toBe(world.operationId);
    // LEDGER_WRITE_ATTEMPTED_WITHOUT_LOCK = NO
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
    // JOURNAL_PRESERVED_WITHOUT_LOCK = YES (journal byte-intacto, ainda em aberto)
    const receiptAfter = await world.adapter.readStorageOperationReceipt(world.operationId);
    expect(receiptAfter?.status).toBe(world.receiptStatusBefore);
    expect(isTerminalStorageOperationStatus(receiptAfter?.status as string)).toBe(false);
    const snapshotAfter = await world.adapter.readStorageAdministrationSnapshot();
    expect(snapshotAfter.unsettledOperations.map((entry) => entry.operationId)).toContain(world.operationId);
    expect(world.storage.getItem(KEY)).toBe(world.coreBefore);
    expect(JSON.stringify(await world.adapter.snapshotNutritionLedger())).toBe(world.ledgerBeforeJson);
    // HYDRATION_ALLOWED_WITHOUT_PROVEN_RECOVERY = NO
    const outcome = await runStorageBootRecovery({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(outcome.hydrationAllowed).toBe(false);
    expect(outcome.status).toBe('blocked-recovery-required');
  });

  it('LOCK_PRIMITIVE_MISSING (§9): adapter sem runNutritionAdminWithExclusiveLock => BLOCKED_FAIL_CLOSED, sem write', async () => {
    // Manager disponível, mas a primitiva ausente: nunca assumir single-tab.
    const world = await prepareDivergentImportWorld(createFakeNutritionCrossTabLockManager(), 'core-committed');
    (world.adapter as unknown as Record<string, unknown>).runNutritionAdminWithExclusiveLock = undefined;
    expect(typeof (world.adapter as unknown as Record<string, unknown>).runNutritionAdminWithExclusiveLock)
      .toBe('undefined');
    const replaceSpy = vi.spyOn(world.adapter, 'replaceNutritionLedgerAsAdmin');

    const runtime = createStorageAdminRuntime({ key: KEY, storage: world.storage, adapter: world.adapter });
    const result = await recoverLogicalStorageAdministrationV2({
      runtime,
      adapter: world.adapter as never,
      storage: world.storage,
      key: KEY,
      ownerToken: createTestOwnerToken() as never,
    });

    // RECOVERY_WITHOUT_LOCK_PRIMITIVE = BLOCKED_FAIL_CLOSED
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'recovery-required', recoveryRequired: true });
    // LEDGER_WRITE_ATTEMPTED_WITHOUT_LOCK = NO
    expect(replaceSpy).not.toHaveBeenCalled();
    // JOURNAL_PRESERVED_WITHOUT_LOCK = YES
    const receiptAfter = await world.adapter.readStorageOperationReceipt(world.operationId);
    expect(receiptAfter?.status).toBe(world.receiptStatusBefore);
    expect(isTerminalStorageOperationStatus(receiptAfter?.status as string)).toBe(false);
    expect(world.storage.getItem(KEY)).toBe(world.coreBefore);
    expect(JSON.stringify(await world.adapter.snapshotNutritionLedger())).toBe(world.ledgerBeforeJson);
    // Sem hidratação sem prova.
    const outcome = await runStorageBootRecovery({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(outcome).toMatchObject({ hydrationAllowed: false, status: 'blocked-recovery-required' });
  });

  it('CROSS_TAB_NOLOCK (§8): dois contextos sem Web Locks — recovery não sobrescreve o writer, journal permanece, sem hidratação híbrida', async () => {
    const world = await prepareDivergentImportWorld(null, 'core-committed');
    // Segundo contexto ("aba") sobre o MESMO fake-indexeddb, também sem locks.
    let writerGeneration = 0;
    const writer = new IndexedDbWorkoutHistoryStorage({
      factory: world.factory,
      databaseName: world.name,
      generationIdFactory: () => `generation-writer-${(writerGeneration += 1)}`,
      now: () => new Date('2026-09-12T08:00:00.000Z'),
      locks: null,
    });
    await writer.open();
    // Premissa do cenário: nem fence isolado como exclusão (fail-closed por
    // ausência de lock, não por serialização inexistente).
    expect(await writer.hasActiveNutritionAdminFence()).toBe(false);

    const writerDay = makeAutomatedDay('2026-09-13');
    const replaceSpy = vi.spyOn(world.adapter, 'replaceNutritionLedgerAsAdmin');

    // Recovery em voo no contexto 1 enquanto o writer escreve no contexto 2.
    const recoveryPromise = recoverLogicalStorageAdministrationV2({
      runtime: createStorageAdminRuntime({ key: KEY, storage: world.storage, adapter: world.adapter }),
      adapter: world.adapter as never,
      storage: world.storage,
      key: KEY,
      ownerToken: createTestOwnerToken() as never,
    });
    await writer.putNutritionDay(writerDay);
    const recovered = await recoveryPromise;

    // Recovery fail-closed: nenhum replace, writer intacto.
    expect(recovered.ok).toBe(false);
    expect(recovered).toMatchObject({ reason: 'recovery-required', recoveryRequired: true });
    expect(replaceSpy).not.toHaveBeenCalled();
    const ledgerAfter = await writer.snapshotNutritionLedger();
    const datesAfter = ledgerAfter.days.map((day) => day.date);
    expect(datesAfter).toContain('2026-09-13');
    expect(datesAfter).toContain('2026-09-12');
    // Journal permanece em aberto; core intocado.
    const receiptAfter = await world.adapter.readStorageOperationReceipt(world.operationId);
    expect(isTerminalStorageOperationStatus(receiptAfter?.status as string)).toBe(false);
    expect(world.storage.getItem(KEY)).toBe(world.coreBefore);
    // Nenhuma hidratação híbrida autorizada.
    const outcome = await runStorageBootRecovery({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(outcome).toMatchObject({ hydrationAllowed: false, status: 'blocked-recovery-required' });
    // BOOT_RECOVERY_WITHOUT_WEBLOCK_CROSS_TAB_SAFE = YES (por FAIL-CLOSED).
    await writer.close().catch(() => undefined);
  });

  it('DEFERRED_REPLAY (§10): boot1 sem lock preserva journal; boot2 com lock converge para o target', async () => {
    const world = await prepareDivergentImportWorld(null, 'core-committed');

    // boot 1: Web Lock indisponível => recovery-required, journal preservado.
    const boot1 = await runStorageBootRecovery({
      adapter: world.adapter,
      storage: world.storage,
      key: KEY,
    });
    expect(boot1).toMatchObject({ hydrationAllowed: false, status: 'blocked-recovery-required' });
    const receiptBoot1 = await world.adapter.readStorageOperationReceipt(world.operationId);
    expect(isTerminalStorageOperationStatus(receiptBoot1?.status as string)).toBe(false);

    // boot 2: mesmo banco, adapter novo COM Web Lock (fake) => retoma e converge.
    let generation2 = 0;
    const adapter2 = new IndexedDbWorkoutHistoryStorage({
      factory: world.factory,
      databaseName: world.name,
      generationIdFactory: () => `generation-boot2-${(generation2 += 1)}`,
      now: () => new Date('2026-09-12T08:00:00.000Z'),
      locks: createFakeNutritionCrossTabLockManager(),
    });
    const boot2 = await runStorageBootRecovery({
      adapter: adapter2,
      storage: world.storage,
      key: KEY,
    });
    expect(boot2).toMatchObject({ hydrationAllowed: true, status: 'ready-after-settled' });

    // Estado final coerente: ledger == target completo, nunca híbrido.
    const finalLedger = await adapter2.snapshotNutritionLedger();
    const checked = validateNutritionLedgerBackupSection(finalLedger);
    expect(checked.status).toBe('valid');
    expect(serializeNutritionLedgerCanonically(finalLedger)).toBe(world.targetCanonical);
    expect(finalLedger.days.map((day) => day.date)).toEqual(['2026-09-12']);
    expect(finalLedger.activeDate).toBe('2026-09-12');
    const receiptBoot2 = await adapter2.readStorageOperationReceipt(world.operationId);
    expect(receiptBoot2?.status).toBe('settled');
    // DEFERRED_RECOVERY_REPLAY = PASS
  });

  it('SETTLED (§11): core settled + ledger divergente — sem lock bloqueia e preserva receipt; com lock converge para o target', async () => {
    const world = await prepareDivergentImportWorld(null, 'core-committed');

    const blocked = await recoverLogicalStorageAdministrationV2({
      runtime: createStorageAdminRuntime({ key: KEY, storage: world.storage, adapter: world.adapter }),
      adapter: world.adapter as never,
      storage: world.storage,
      key: KEY,
      ownerToken: createTestOwnerToken() as never,
    });
    expect(blocked).toMatchObject({ ok: false, reason: 'recovery-required', recoveryRequired: true });
    const receiptBlocked = await world.adapter.readStorageOperationReceipt(world.operationId);
    expect(isTerminalStorageOperationStatus(receiptBlocked?.status as string)).toBe(false);

    // Boot seguinte com lock: ledger converge para o raw do settled (target).
    let generation2 = 0;
    const adapter2 = new IndexedDbWorkoutHistoryStorage({
      factory: world.factory,
      databaseName: world.name,
      generationIdFactory: () => `generation-settled-${(generation2 += 1)}`,
      now: () => new Date('2026-09-12T08:00:00.000Z'),
      locks: createFakeNutritionCrossTabLockManager(),
    });
    const runtime2 = createStorageAdminRuntime({ key: KEY, storage: world.storage, adapter: adapter2 });
    const converged = await recoverLogicalStorageAdministrationV2({
      runtime: runtime2,
      adapter: adapter2 as never,
      storage: world.storage,
      key: KEY,
      ownerToken: createTestOwnerToken() as never,
    });
    expect(converged).toMatchObject({ ok: true, status: 'settled' });
    const finalLedger = await adapter2.snapshotNutritionLedger();
    expect(serializeNutritionLedgerCanonically(finalLedger)).toBe(world.targetCanonical);
    // SETTLED_LEDGER_RECOVERY = PASS
  });

  it('REVERTED (§11): core reverted + ledger divergente — sem lock bloqueia e preserva receipt; com lock converge para o previous', async () => {
    const world = await prepareDivergentImportWorld(null, 'ledger-staged');

    const blocked = await recoverLogicalStorageAdministrationV2({
      runtime: createStorageAdminRuntime({ key: KEY, storage: world.storage, adapter: world.adapter }),
      adapter: world.adapter as never,
      storage: world.storage,
      key: KEY,
      ownerToken: createTestOwnerToken() as never,
    });
    expect(blocked).toMatchObject({ ok: false, reason: 'recovery-required', recoveryRequired: true });
    const receiptBlocked = await world.adapter.readStorageOperationReceipt(world.operationId);
    expect(isTerminalStorageOperationStatus(receiptBlocked?.status as string)).toBe(false);

    // Boot seguinte com lock: ledger converge para o raw do reverted (previous).
    let generation2 = 0;
    const adapter2 = new IndexedDbWorkoutHistoryStorage({
      factory: world.factory,
      databaseName: world.name,
      generationIdFactory: () => `generation-reverted-${(generation2 += 1)}`,
      now: () => new Date('2026-09-12T08:00:00.000Z'),
      locks: createFakeNutritionCrossTabLockManager(),
    });
    const runtime2 = createStorageAdminRuntime({ key: KEY, storage: world.storage, adapter: adapter2 });
    const converged = await recoverLogicalStorageAdministrationV2({
      runtime: runtime2,
      adapter: adapter2 as never,
      storage: world.storage,
      key: KEY,
      ownerToken: createTestOwnerToken() as never,
    });
    expect(converged).toMatchObject({ ok: true, status: 'reverted' });
    const finalLedger = await adapter2.snapshotNutritionLedger();
    expect(serializeNutritionLedgerCanonically(finalLedger)).toBe(world.previousCanonical);
    expect(finalLedger.days.map((day) => day.date)).toEqual(['2026-09-10']);
    // REVERTED_LEDGER_RECOVERY = PASS
  });

  it('LOCK_AVAILABLE (§7, sem regressão): equivalente => no-op sem write; divergente => replace sob EXCLUSIVE com prova', async () => {
    // (a) Ledger já equivalente: sucesso sem nenhum write.
    const evenWorld = await prepareDivergentImportWorld(createFakeNutritionCrossTabLockManager(), 'verified');
    const evenReplaceSpy = vi.spyOn(evenWorld.adapter, 'replaceNutritionLedgerAsAdmin');
    const evenResult = await recoverLogicalStorageAdministrationV2({
      runtime: createStorageAdminRuntime({ key: KEY, storage: evenWorld.storage, adapter: evenWorld.adapter }),
      adapter: evenWorld.adapter as never,
      storage: evenWorld.storage,
      key: KEY,
      ownerToken: createTestOwnerToken() as never,
    });
    expect(evenResult).toMatchObject({ ok: true, status: 'settled' });
    expect(evenReplaceSpy).not.toHaveBeenCalled();
    expect(serializeNutritionLedgerCanonically(await evenWorld.adapter.snapshotNutritionLedger()))
      .toBe(evenWorld.targetCanonical);

    // (b) Ledger divergente: replace sob EXCLUSIVE + reread com prova canônica.
    const divergentWorld = await prepareDivergentImportWorld(createFakeNutritionCrossTabLockManager(), 'core-committed');
    const divergentReplaceSpy = vi.spyOn(divergentWorld.adapter, 'replaceNutritionLedgerAsAdmin');
    const divergentResult = await recoverLogicalStorageAdministrationV2({
      runtime: createStorageAdminRuntime({
        key: KEY,
        storage: divergentWorld.storage,
        adapter: divergentWorld.adapter,
      }),
      adapter: divergentWorld.adapter as never,
      storage: divergentWorld.storage,
      key: KEY,
      ownerToken: createTestOwnerToken() as never,
    });
    expect(divergentResult).toMatchObject({ ok: true, status: 'settled' });
    expect(divergentReplaceSpy).toHaveBeenCalledTimes(1);
    const finalLedger = await divergentWorld.adapter.snapshotNutritionLedger();
    expect(validateNutritionLedgerBackupSection(finalLedger).status).toBe('valid');
    expect(serializeNutritionLedgerCanonically(finalLedger)).toBe(divergentWorld.targetCanonical);
  });
});
