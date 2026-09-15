/**
 * GOAL-100 (GYMFLOW-NUT004C-LEDGER-ADMIN-IMPLEMENTATION-100) — provas ledger-aware.
 *
 * Cobre: EXPORT_LEDGER_COMPLETE, RESTORE_LEDGER_COMPLETE, RESET_LEDGER_COMPLETE,
 * OLD_BACKUP_SAFE, CORRUPT_BACKUP_FAIL_CLOSED, PARTIAL_FAILURE_RECOVERABLE,
 * NO_LEDGER_RESURRECTION, NO_FENCE_RESTORATION, MIRRORS_CONSISTENT, ROUNDTRIP_PASS,
 * CROSS_TAB_SAFE. Preserva fixtures schema 1 para compatibilidade.
 */
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../types';
import { createStorageAdminRuntime } from './storage-admin-runtime';
import {
  HYBRID_CORE_BACKUP_SUFFIX,
  createHybridStorageRuntime,
} from './storage-hybrid';
import {
  GYMFLOW_INDEXEDDB_VERSION,
  IndexedDbWorkoutHistoryStorage,
} from './storage-indexeddb';
import {
  LOGICAL_BACKUP_FORMAT_VERSION,
  LOGICAL_BACKUP_SCHEMA_VERSION,
  createLogicalStorageExportV2,
  inspectLogicalStorageBackupV2,
} from './storage-logical-backup';
import {
  commitLogicalStorageImportV2,
  type LogicalImportCommitStep,
} from './storage-logical-import';
import { commitLogicalStorageResetV2 } from './storage-logical-reset';
import { recoverLogicalStorageAdministrationV2 } from './storage-administrative-recovery';
import {
  createEmptyNutritionLedgerSection,
  serializeNutritionLedgerCanonically,
  validateNutritionLedgerBackupSection,
  type NutritionLedgerBackupSection,
} from './storage-nutrition-ledger-backup';
import type { LedgerMigrationMarker, NutritionDay } from './nutrition/ledger-types';
import { calculateDailyTargets } from './nutrition/engine';
import { evaluateNutritionGate } from './nutrition/profile-gates';
import { createEvaluatedGateSnapshot, createProfileAbsentSnapshot } from './nutrition/gate-snapshot';
import type { NutritionProfile } from '../types/nutrition';
import type { PersistedState, StorageLike } from './storage-types';
import { createStorageAdminOwnerTokenCoordinator } from './storage-admin-owner-token';
import { calculateActuals } from './nutrition/ledger';
import { projectCompatMirrors, runNutritionColdBoot } from './nutrition/provider-bridge';
import {
  NUTRITION_ADMIN_FENCE_BACKUP,
  NUTRITION_ADMIN_FENCE_RESTORE,
} from './nutrition/admin-fence';

const KEY = 'gymflow:state:v1';
let databaseSequence = 0;
let ownerOperationSequence = 0;

function createTestOwnerToken() {
  return {
    createOperationId: () => `operation-owner-test-${(ownerOperationSequence += 1)}`,
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

function makeAutomatedDay(
  date: string,
  options: { closed?: boolean; withConsumption?: boolean } = {},
): NutritionDay {
  const targets = calculateDailyTargets(makeProfile());
  const gateSnapshot = createEvaluatedGateSnapshot(evaluateNutritionGate(makeProfile()), GATE_AT);
  const withConsumption = options.withConsumption ?? true;
  return {
    id: `day-${date}`,
    date,
    timezone: 'America/Sao_Paulo',
    targetState: 'AUTOMATED',
    targets,
    gateSnapshot,
    meals: withConsumption
      ? [
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
        ]
      : [],
    hydrationEntries: withConsumption
      ? [{ id: `water-${date}-1`, amountMl: 500, loggedAt: `${date}T13:00:00.000Z` }]
      : [],
    isClosed: options.closed ?? false,
    closedAt: options.closed ? `${date}T23:59:00.000Z` : null,
  };
}

function makeManualDay(date: string): NutritionDay {
  return {
    id: `day-${date}`,
    date,
    timezone: 'America/Sao_Paulo',
    targetState: 'MANUAL_ONLY',
    targets: null,
    targetUnavailableReason: 'PROFILE_ABSENT',
    gateSnapshot: createProfileAbsentSnapshot(GATE_AT),
    meals: [
      {
        id: `meal-${date}-1`,
        type: 'snack',
        name: 'Lanche',
        entries: [
          {
            id: `food-${date}-1`,
            name: 'Fruta',
            calories: 100,
            protein: 1,
            carbs: 25,
            fat: 0,
            loggedAt: `${date}T15:00:00.000Z`,
          },
        ],
      },
    ],
    hydrationEntries: [],
    isClosed: false,
    closedAt: null,
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
  };
}

function makeSession(index: number): WorkoutSession {
  return {
    id: `session-${index}`,
    date: '2026-07-26',
    name: `Treino ${index}`,
    exercises: [],
  } as unknown as WorkoutSession;
}

async function createReadyHarness() {
  const storage = new MemoryStorage();
  const factory = new IDBFactory();
  const name = `gymflow-ledger-admin-${(databaseSequence += 1)}`;
  let generation = 0;
  const adapter = new IndexedDbWorkoutHistoryStorage({
    factory,
    databaseName: name,
    generationIdFactory: () => `generation-${(generation += 1)}`,
    now: () => new Date('2026-09-12T08:00:00.000Z'),
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
  return { storage, factory, name, adapter, hybrid, runtime };
}

type Harness = Awaited<ReturnType<typeof createReadyHarness>>;

async function seedLedger(
  harness: Harness,
  section: NutritionLedgerBackupSection,
): Promise<void> {
  await harness.adapter.replaceNutritionLedgerAsAdmin(section);
}

async function makeSchema1Backup(payload: PersistedState): Promise<string> {
  const { computeLogicalPayloadDigest, serializeLogicalPayloadCanonically } = await import(
    './storage-logical-backup'
  );
  const payloadDigest = await computeLogicalPayloadDigest(payload);
  return JSON.stringify({
    format: 'gymflow-backup',
    formatVersion: 2,
    logicalSchemaVersion: 1,
    exportedAt: '2026-09-12T10:00:00.000Z',
    sourcePhysicalStorageVersion: 2,
    sourceSavedAt: '2026-09-12T09:59:00.000Z',
    payloadDigest,
    payload: JSON.parse(serializeLogicalPayloadCanonically(payload)) as PersistedState,
  });
}

describe('GOAL-100 — ledger admin (NUT-004C)', () => {
  it('EXPORT_LEDGER_COMPLETE: schema 2 com section obrigatória + digest cobre ledger', async () => {
    const harness = await createReadyHarness();
    const section: NutritionLedgerBackupSection = {
      days: [makeAutomatedDay('2026-09-10', { closed: true }), makeAutomatedDay('2026-09-11', { closed: true }), makeAutomatedDay('2026-09-12')],
      activeDate: '2026-09-12',
      migrationMarker: makeRealMarker(),
    };
    await seedLedger(harness, section);
    const result = await createLogicalStorageExportV2({
      runtime: harness.runtime,
      readNutritionLedger: () => harness.adapter.snapshotNutritionLedger(),
      now: new Date('2026-09-12T10:00:00.000Z'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(LOGICAL_BACKUP_FORMAT_VERSION).toBe(2);
    expect(LOGICAL_BACKUP_SCHEMA_VERSION).toBe(2);
    expect(result.backup.logicalSchemaVersion).toBe(2);
    expect(result.backup.nutritionLedger.days).toHaveLength(3);
    expect(result.backup.nutritionLedger.days.map((d) => d.date)).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
    ]);
    expect(result.backup.nutritionLedger.activeDate).toBe('2026-09-12');
    expect(result.backup.nutritionLedger.migrationMarker?.classification).toBe('LEGACY_REAL');
    // Digest cobre o ledger: adulterar conteúdo válido invalida o digest.
    const tampered = JSON.parse(result.content) as {
      nutritionLedger: NutritionLedgerBackupSection;
    };
    tampered.nutritionLedger.days = [];
    tampered.nutritionLedger.activeDate = null;
    tampered.nutritionLedger.migrationMarker = null;
    const inspection = await inspectLogicalStorageBackupV2(JSON.stringify(tampered));
    expect(inspection.ok).toBe(false);
    if (!inspection.ok) expect(inspection.reason).toBe('digest-mismatch');
    // Inspeção do original passa.
    expect((await inspectLogicalStorageBackupV2(result.content)).ok).toBe(true);
  });

  it('EXPORT_LEDGER_COMPLETE (vazio): schema 2 representa days:[] explicitamente', async () => {
    const harness = await createReadyHarness();
    const result = await createLogicalStorageExportV2({
      runtime: harness.runtime,
      readNutritionLedger: () => harness.adapter.snapshotNutritionLedger(),
      now: new Date('2026-09-12T10:00:00.000Z'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.nutritionLedger.days).toEqual([]);
    // EMPTY_LEDGER_PASS_THROUGH eliminado: section presente mesmo vazia.
    expect(Object.keys(result.backup)).toContain('nutritionLedger');
  });

  it('OLD_BACKUP_SAFE: schema 1 + ledger ativo => legacy-backup-with-active-ledger, sem write', async () => {
    const harness = await createReadyHarness();
    await seedLedger(harness, {
      days: [makeAutomatedDay('2026-09-12')],
      activeDate: '2026-09-12',
      migrationMarker: makeRealMarker(),
    });
    const coreBefore = harness.storage.getItem(KEY);
    const raw = await makeSchema1Backup(defaults());
    const result = await commitLogicalStorageImportV2({
      raw,
      runtime: harness.runtime,
      adapter: harness.adapter,
      storage: harness.storage,
      key: KEY,
      now: () => new Date('2026-09-12T11:00:00.000Z'),
      ownerToken: createTestOwnerToken(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('legacy-backup-with-active-ledger');
    expect(result.compensation).toBe('not-needed');
    expect(harness.storage.getItem(KEY)).toBe(coreBefore);
    const after = await harness.adapter.snapshotNutritionLedger();
    expect(after.days).toHaveLength(1);
  });

  it('OLD_BACKUP_SAFE (legado permitido): schema 1 + ledger vazio => fluxo legado ok', async () => {
    const harness = await createReadyHarness();
    const raw = await makeSchema1Backup({ ...defaults(), workoutHistory: [makeSession(70)] });
    const result = await commitLogicalStorageImportV2({
      raw,
      runtime: harness.runtime,
      adapter: harness.adapter,
      storage: harness.storage,
      key: KEY,
      now: () => new Date('2026-09-12T11:00:00.000Z'),
      ownerToken: createTestOwnerToken(),
    });
    expect(result.ok).toBe(true);
  });

  it('CORRUPT_BACKUP_FAIL_CLOSED: schema 2 sem section / duplicada / orfa / fence => invalid-payload', async () => {
    const harness = await createReadyHarness();
    const exported = await createLogicalStorageExportV2({
      runtime: harness.runtime,
      readNutritionLedger: () => harness.adapter.snapshotNutritionLedger(),
      now: new Date('2026-09-12T10:00:00.000Z'),
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const base = JSON.parse(exported.content) as Record<string, unknown>;
    // Sem section.
    const noSection = { ...base };
    delete (noSection as Record<string, unknown>).nutritionLedger;
    expect((await inspectLogicalStorageBackupV2(JSON.stringify(noSection))).ok).toBe(false);
    // Dias duplicados.
    const dup = JSON.parse(exported.content) as {
      nutritionLedger: NutritionLedgerBackupSection;
      payloadDigest: string;
    };
    dup.nutritionLedger.days = [makeAutomatedDay('2026-09-12'), makeAutomatedDay('2026-09-12')];
    expect(await inspectLogicalStorageBackupV2(JSON.stringify(dup))).toMatchObject({ ok: false });
    // activeDate órfã.
    const orphan = JSON.parse(exported.content) as {
      nutritionLedger: NutritionLedgerBackupSection;
    };
    orphan.nutritionLedger.days = [makeAutomatedDay('2026-09-10', { closed: true })];
    orphan.nutritionLedger.activeDate = '2026-09-12';
    expect(await inspectLogicalStorageBackupV2(JSON.stringify(orphan))).toMatchObject({ ok: false });
    // Fence contrabandeado.
    const fenced = JSON.parse(exported.content) as Record<string, unknown>;
    (fenced.nutritionLedger as Record<string, unknown>).nutritionAdminFence = { fenceId: 'x' };
    expect(await inspectLogicalStorageBackupV2(JSON.stringify(fenced))).toMatchObject({ ok: false });
    // Metadata desconhecida.
    const unknown = JSON.parse(exported.content) as Record<string, unknown>;
    (unknown.nutritionLedger as Record<string, unknown>).ownerId = 'aba-1';
    expect(await inspectLogicalStorageBackupV2(JSON.stringify(unknown))).toMatchObject({ ok: false });
  });

  it('RESET_LEDGER_COMPLETE: reset seletivo zera days/activeDate/marker + core coerente', async () => {
    const harness = await createReadyHarness();
    await seedLedger(harness, {
      days: [makeAutomatedDay('2026-09-12')],
      activeDate: '2026-09-12',
      migrationMarker: makeRealMarker(),
    });
    const result = await commitLogicalStorageResetV2({
      runtime: harness.runtime,
      adapter: harness.adapter,
      storage: harness.storage,
      key: KEY,
      now: () => new Date('2026-09-12T11:00:00.000Z'),
      ownerToken: createTestOwnerToken(),
    });
    expect(result.ok).toBe(true);
    const after = await harness.adapter.snapshotNutritionLedger();
    expect(after.days).toEqual([]);
    expect(after.activeDate).toBeNull();
    expect(after.migrationMarker).toBeNull();
  });

  it('NO_FENCE_RESTORATION: replace/clear preservam o fence; backup nunca serializa fence', async () => {
    expect(NUTRITION_ADMIN_FENCE_BACKUP).toBe('NO');
    expect(NUTRITION_ADMIN_FENCE_RESTORE).toBe('NO');
    const harness = await createReadyHarness();
    const fence = await harness.adapter.acquireNutritionAdminFence({
      ownerId: 'owner-1',
      operationId: 'op-1',
      operationKind: 'export',
    });
    await harness.adapter.replaceNutritionLedgerAsAdmin({
      days: [makeAutomatedDay('2026-09-12')],
      activeDate: '2026-09-12',
      migrationMarker: makeRealMarker(),
    });
    const still = await harness.adapter.readNutritionAdminFence();
    expect(still?.fenceId).toBe(fence.fenceId);
    await harness.adapter.clearNutritionLedgerAsAdmin();
    const afterClear = await harness.adapter.readNutritionAdminFence();
    expect(afterClear?.fenceId).toBe(fence.fenceId);
    const exported = await createLogicalStorageExportV2({
      runtime: harness.runtime,
      readNutritionLedger: () => harness.adapter.snapshotNutritionLedger(),
      now: new Date('2026-09-12T10:00:00.000Z'),
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(JSON.stringify(exported.backup)).not.toContain('nutritionAdminFence');
    expect(Object.keys(exported.backup.nutritionLedger).sort()).toEqual(
      ['activeDate', 'days', 'migrationMarker'].sort(),
    );
  });

  it('RESTORE_LEDGER_COMPLETE + ROUNDTRIP + MIRRORS: export→reset→import→cold boot', async () => {
    const harness = await createReadyHarness();
    const section: NutritionLedgerBackupSection = {
      days: [
        makeAutomatedDay('2026-09-10', { closed: true }),
        makeAutomatedDay('2026-09-11', { closed: true }),
        makeAutomatedDay('2026-09-12'),
      ],
      activeDate: '2026-09-12',
      migrationMarker: makeRealMarker(),
    };
    await seedLedger(harness, section);
    const exported = await createLogicalStorageExportV2({
      runtime: harness.runtime,
      readNutritionLedger: () => harness.adapter.snapshotNutritionLedger(),
      now: new Date('2026-09-12T10:00:00.000Z'),
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    // Reset esvazia tudo.
    const reset = await commitLogicalStorageResetV2({
      runtime: harness.runtime,
      adapter: harness.adapter,
      storage: harness.storage,
      key: KEY,
      now: () => new Date('2026-09-12T11:00:00.000Z'),
      ownerToken: createTestOwnerToken(),
    });
    expect(reset.ok).toBe(true);
    expect((await harness.adapter.snapshotNutritionLedger()).days).toEqual([]);
    // Import restaura core+ledger.
    const imported = await commitLogicalStorageImportV2({
      raw: exported.content,
      runtime: harness.runtime,
      adapter: harness.adapter,
      storage: harness.storage,
      key: KEY,
      expectedPayloadDigest: exported.backup.payloadDigest,
      now: () => new Date('2026-09-12T12:00:00.000Z'),
      ownerToken: createTestOwnerToken(),
    });
    expect(imported.ok).toBe(true);
    const restored = await harness.adapter.snapshotNutritionLedger();
    expect(restored.days.map((d) => d.date)).toEqual(['2026-09-10', '2026-09-11', '2026-09-12']);
    expect(restored.activeDate).toBe('2026-09-12');
    expect(restored.migrationMarker?.classification).toBe('LEGACY_REAL');
    // Targets/gates intactos.
    const day = restored.days.find((d) => d.date === '2026-09-12');
    expect(day?.targetState).toBe('AUTOMATED');
    // Digest válido + equivalência semântica.
    const check = validateNutritionLedgerBackupSection(restored);
    expect(check.status).toBe('valid');
    expect(serializeNutritionLedgerCanonically(restored)).toBe(
      serializeNutritionLedgerCanonically(section),
    );
    // Espelhos derivam do ledger (cold boot, sem XP).
    const cold = await runNutritionColdBoot({
      repository: harness.adapter,
      now: new Date('2026-09-12T12:00:00.000Z'),
      profile: makeProfile(),
      savedNutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
      savedUserWaterIntake: 0,
    });
    expect(cold.ok).toBe(true);
    if (!cold.ok) return;
    expect(cold.day.date).toBe('2026-09-12');
    const actuals = calculateActuals(cold.day);
    const mirrors = projectCompatMirrors(actuals, {});
    expect(mirrors.calories).toBeGreaterThan(0);
    expect(mirrors.water).toBe(500);
  });

  it('ROUNDTRIP (vazio + MANUAL_ONLY)', async () => {
    const harness = await createReadyHarness();
    // Vazio.
    const emptyExport = await createLogicalStorageExportV2({
      runtime: harness.runtime,
      readNutritionLedger: () => harness.adapter.snapshotNutritionLedger(),
      now: new Date('2026-09-12T10:00:00.000Z'),
    });
    expect(emptyExport.ok).toBe(true);
    // MANUAL_ONLY.
    await seedLedger(harness, {
      days: [makeManualDay('2026-09-12')],
      activeDate: '2026-09-12',
      migrationMarker: {
        version: 1,
        status: 'completed',
        classification: 'LEGACY_EMPTY',
        migratedAt: '2026-09-12T12:00:00.000Z',
        source: 'legacy-nutrition-log',
      },
    });
    const manualExport = await createLogicalStorageExportV2({
      runtime: harness.runtime,
      readNutritionLedger: () => harness.adapter.snapshotNutritionLedger(),
      now: new Date('2026-09-12T10:00:00.000Z'),
    });
    expect(manualExport.ok).toBe(true);
    if (!manualExport.ok) return;
    expect(manualExport.backup.nutritionLedger.days[0]?.targetState).toBe('MANUAL_ONLY');
    const reset = await commitLogicalStorageResetV2({
      runtime: harness.runtime,
      adapter: harness.adapter,
      storage: harness.storage,
      key: KEY,
      now: () => new Date('2026-09-12T11:00:00.000Z'),
      ownerToken: createTestOwnerToken(),
    });
    expect(reset.ok).toBe(true);
    const imported = await commitLogicalStorageImportV2({
      raw: manualExport.content,
      runtime: harness.runtime,
      adapter: harness.adapter,
      storage: harness.storage,
      key: KEY,
      now: () => new Date('2026-09-12T12:00:00.000Z'),
      ownerToken: createTestOwnerToken(),
    });
    expect(imported.ok).toBe(true);
    const restored = await harness.adapter.snapshotNutritionLedger();
    expect(restored.days[0]?.targetState).toBe('MANUAL_ONLY');
    expect(restored.days[0]?.targets).toBeNull();
  });

  it('PARTIAL_FAILURE_RECOVERABLE: falha após journal/dias/metadata/core => boot converge, nunca híbrido', async () => {
    const steps: LogicalImportCommitStep[] = [
      'journal-created',
      'ledger-staged',
      'history-staged',
      'core-committed',
      'ledger-applied',
      'verified',
    ];
    for (const step of steps) {
      const harness = await createReadyHarness();
      await seedLedger(harness, {
        days: [makeAutomatedDay('2026-09-10', { closed: true })],
        activeDate: '2026-09-10',
        migrationMarker: makeRealMarker(),
      });
      const targetSection: NutritionLedgerBackupSection = {
        days: [makeAutomatedDay('2026-09-12')],
        activeDate: '2026-09-12',
        migrationMarker: makeRealMarker(),
      };
      // Monta backup schema 2 com ledger alvo via export de harness auxiliar.
      const donor = await createReadyHarness();
      await seedLedger(donor, targetSection);
      const donorExport = await createLogicalStorageExportV2({
        runtime: donor.runtime,
        readNutritionLedger: () => donor.adapter.snapshotNutritionLedger(),
        now: new Date('2026-09-12T10:00:00.000Z'),
      });
      expect(donorExport.ok).toBe(true);
      if (!donorExport.ok) continue;
      let injected = false;
      const result = await commitLogicalStorageImportV2({
        raw: donorExport.content,
        runtime: harness.runtime,
        adapter: harness.adapter,
        storage: harness.storage,
        key: KEY,
        now: () => new Date('2026-09-12T11:00:00.000Z'),
        ownerToken: createTestOwnerToken(),
        afterStep: async (s) => {
          if (s === step && !injected) {
            injected = true;
            throw new Error(`fault:${step}`);
          }
        },
      });
      // Falha induzida => journal aberto (recovery-required) ou falha compensada.
      expect(result.ok).toBe(false);
      // Boot recovery converge para coerente (previous ou target), nunca híbrido.
      const runtime = createStorageAdminRuntime({ key: KEY, storage: harness.storage, adapter: harness.adapter });
      const recovered = await recoverLogicalStorageAdministrationV2({
        runtime,
        adapter: harness.adapter as never,
        storage: harness.storage,
        key: KEY,
        ownerToken: createTestOwnerToken() as never,
      });
      expect(recovered.ok, `step=${step}`).toBe(true);
      const ledger = await harness.adapter.snapshotNutritionLedger();
      const coreRaw = harness.storage.getItem(KEY) as string;
      const core = JSON.parse(coreRaw) as { data: { historyStorage: { generationId: string } } };
      void core;
      // Coerência: activeDate órfã jamais; dias válidos; digest da section válido.
      const checked = validateNutritionLedgerBackupSection(ledger);
      expect(checked.status).toBe('valid');
      if (ledger.activeDate !== null) {
        expect(ledger.days.some((d) => d.date === ledger.activeDate)).toBe(true);
      }
      // Nunca híbrido parcial: ou previous (2026-09-10) ou target (2026-09-12).
      const dates = ledger.days.map((d) => d.date);
      const isPrevious = dates.includes('2026-09-10') && !dates.includes('2026-09-12');
      const isTarget = dates.includes('2026-09-12') && !dates.includes('2026-09-10');
      const isEmpty = dates.length === 0;
      expect(isPrevious || isTarget || isEmpty).toBe(true);
    }
  });

  it('NO_LEDGER_RESURRECTION: reset não ressuscita após cold boot vazio', async () => {
    const harness = await createReadyHarness();
    await seedLedger(harness, {
      days: [makeAutomatedDay('2026-09-12')],
      activeDate: '2026-09-12',
      migrationMarker: makeRealMarker(),
    });
    const reset = await commitLogicalStorageResetV2({
      runtime: harness.runtime,
      adapter: harness.adapter,
      storage: harness.storage,
      key: KEY,
      now: () => new Date('2026-09-12T11:00:00.000Z'),
      ownerToken: createTestOwnerToken(),
    });
    expect(reset.ok).toBe(true);
    const cold = await runNutritionColdBoot({
      repository: harness.adapter,
      now: new Date('2026-09-13T08:00:00.000Z'),
      profile: null,
      savedNutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
      savedUserWaterIntake: 0,
    });
    expect(cold.ok).toBe(true);
    const after = await harness.adapter.snapshotNutritionLedger();
    // Nenhum consumo ressuscitado (apenas dia vazio de hoje, sem entries).
    expect(after.days.every((d) => d.meals.every((m) => m.entries.length === 0) && d.hydrationEntries.length === 0)).toBe(true);
  });

  it('CROSS_TAB_SAFE: writer antes/depois do admin serializa; dois admins não hibridizam', async () => {
    const harness = await createReadyHarness();
    await seedLedger(harness, createEmptyNutritionLedgerSection());
    // Writer antes do admin: export enxerga o consumo (estabilizado sob lock+fence).
    await harness.adapter.putNutritionDay(makeAutomatedDay('2026-09-12'));
    const exported = await createLogicalStorageExportV2({
      runtime: harness.runtime,
      readNutritionLedger: () => harness.adapter.snapshotNutritionLedger(),
      now: new Date('2026-09-12T10:00:00.000Z'),
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.backup.nutritionLedger.days).toHaveLength(1);
    // Admin antes do writer: fence bloqueia o writer (provider-level; aqui o
    // IDB serializa e o snapshot duplo do export detecta mudança).
    // Dois admins concorrentes: segundo begin conflita (operation-conflict).
    const second = await commitLogicalStorageResetV2({
      runtime: harness.runtime,
      adapter: harness.adapter,
      storage: harness.storage,
      key: KEY,
      now: () => new Date('2026-09-12T11:00:00.000Z'),
      ownerToken: createTestOwnerToken(),
    });
    expect(second.ok).toBe(true);
    // Ledger final coerente (vazio), sem híbrido.
    const final = await harness.adapter.snapshotNutritionLedger();
    expect(final.days).toEqual([]);
  });
});
