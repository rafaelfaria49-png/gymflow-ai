/**
 * GymFlow AI — Fence administrativo nutricional durável (GOAL-087)
 *
 * Provas de ordem com duas instâncias sobre o mesmo fake-indexeddb
 * (cross-tab: Adapter A = admin, Adapter B = writer nutricional).
 *
 * - A: writer antes do acquire → commita → acquire sucede → sonda vê consumo.
 * - B: acquire antes do writer → writer bloqueado NUTRITION_ADMIN_FENCED.
 * - C: dois admins concorrentes → somente um fence ativo.
 * - D: release com fenceId incorreto → não remove fence alheio.
 * - E: fence expirado → recuperação determinística (writer + novo acquire).
 *
 * Sem novo object store, sem bump de IDB (continua v5).
 */

import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  isNutritionAdminFencedError,
  NUTRITION_ADMIN_FENCE_KEY,
  NUTRITION_ADMIN_FENCE_VERSION,
} from './nutrition/admin-fence';
import { nutritionDayHasConsumption } from './nutrition/admin-gate';
import { createProfileAbsentSnapshot } from './nutrition/gate-snapshot';
import { addHydrationEntry } from './nutrition/ledger';
import {
  GYMFLOW_INDEXEDDB_VERSION,
  IndexedDbWorkoutHistoryStorage,
  NUTRITION_METADATA_STORE,
} from './storage-indexeddb';
import { CURRENT_STORAGE_VERSION, HYBRID_STORAGE_VERSION } from './storage-types';

let sequence = 9000;

function makeGateSnapshot() {
  return createProfileAbsentSnapshot('2026-09-12T14:00:00.000Z');
}

function makeEmptyDay(date: string) {
  return {
    id: `nutrition-day-${date}`,
    date,
    timezone: 'America/Sao_Paulo',
    targetState: 'MANUAL_ONLY' as const,
    targets: null,
    targetUnavailableReason: 'PROFILE_ABSENT' as const,
    gateSnapshot: makeGateSnapshot(),
    meals: [],
    hydrationEntries: [],
    isClosed: false,
    closedAt: null,
  };
}

function makeConsumptionDay(date: string) {
  const base = makeEmptyDay(date);
  return addHydrationEntry(base as never, {
    id: `hyd-${date}`,
    amountMl: 500,
    loggedAt: '2026-09-12T14:00:00.000Z',
  }) as unknown as ReturnType<typeof makeEmptyDay>;
}

/** Dois adapters (abas) sobre o MESMO factory + MESMO databaseName. */
function makeCrossTabHarness() {
  const factory = new IDBFactory();
  const name = `gymflow-fence-xtab-${(sequence += 1)}`;
  const admin = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name });
  const writer = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name });
  return { factory, name, admin, writer };
}

async function listHasConsumption(
  adapter: IndexedDbWorkoutHistoryStorage,
): Promise<boolean> {
  const days = await adapter.listNutritionDays();
  return days.some((day) => nutritionDayHasConsumption(day));
}

describe('nutrition admin fence — ordem e cross-tab (GOAL-087)', () => {
  it('versionamento preservado: IDB=5, HYBRID=2, CURRENT=1', () => {
    expect(GYMFLOW_INDEXEDDB_VERSION).toBe(5);
    expect(HYBRID_STORAGE_VERSION).toBe(2);
    expect(CURRENT_STORAGE_VERSION).toBe(1);
  });

  it('A. WRITER_BEFORE_FENCE = OBSERVED_BY_PROBE: write commita, acquire sucede, sonda vê consumo', async () => {
    const { admin, writer } = makeCrossTabHarness();
    await admin.open();
    await writer.open();
    try {
      // Writer começa antes do acquire e commita.
      await writer.putNutritionDay(makeConsumptionDay('2026-09-12') as never);

      // Fence adquire DEPOIS — deve suceder (writer já terminou).
      const fence = await admin.acquireNutritionAdminFence({
        ownerId: 'owner-admin-A',
        operationId: 'op-A',
        operationKind: 'export',
      });
      expect(fence.version).toBe(NUTRITION_ADMIN_FENCE_VERSION);
      expect(fence.fenceId.length).toBeGreaterThan(0);
      expect(fence.ownerId).toBe('owner-admin-A');

      // Nova sonda SOB o fence vê o consumo → admin deferred.
      const seenByAdmin = await listHasConsumption(admin);
      const seenByWriter = await listHasConsumption(writer);
      expect(seenByAdmin).toBe(true);
      expect(seenByWriter).toBe(true);

      await admin.releaseNutritionAdminFence({ fenceId: fence.fenceId });
    } finally {
      await admin.close().catch(() => undefined);
      await writer.close().catch(() => undefined);
    }
  });

  it('B. FENCE_BEFORE_WRITER = BLOCKED: fence persiste, writers bloqueados, ledger vazio opera', async () => {
    const { admin, writer } = makeCrossTabHarness();
    await admin.open();
    await writer.open();
    try {
      const fence = await admin.acquireNutritionAdminFence({
        ownerId: 'owner-admin-B',
        operationId: 'op-B',
        operationKind: 'export',
      });
      expect(await admin.hasActiveNutritionAdminFence()).toBe(true);
      // Cross-tab: a outra aba também vê o fence.
      expect(await writer.hasActiveNutritionAdminFence()).toBe(true);

      // Todas as primitivas de escrita bloqueadas de forma tipada.
      await expect(writer.putNutritionDay(makeConsumptionDay('2026-09-12') as never))
        .rejects.toSatisfy(isNutritionAdminFencedError);
      await expect(writer.putNutritionDayIfAbsent(makeEmptyDay('2026-09-13') as never))
        .rejects.toSatisfy(isNutritionAdminFencedError);
      await expect(writer.mutateNutritionDay('2026-09-12', (current) => (current ?? makeEmptyDay('2026-09-12')) as never))
        .rejects.toSatisfy(isNutritionAdminFencedError);
      await expect(writer.setActiveNutritionDate('2026-09-12'))
        .rejects.toSatisfy(isNutritionAdminFencedError);
      await expect(writer.setNutritionMigrationMarker({
        version: 1,
        status: 'completed',
        classification: 'LEGACY_EMPTY',
        migratedAt: '2026-09-12T14:00:00.000Z',
        source: 'legacy-nutrition-log',
      }))
        .rejects.toSatisfy(isNutritionAdminFencedError);

      // Leituras seguem permitidas sob o fence (sonda do admin).
      expect(await listHasConsumption(admin)).toBe(false);
      expect(await admin.listNutritionDays()).toEqual([]);

      // Admin opera sobre ledger vazio (nenhum consumo omitido).
      const released = await admin.releaseNutritionAdminFence({ fenceId: fence.fenceId });
      expect(released).toEqual({ released: true });
      expect(await admin.hasActiveNutritionAdminFence()).toBe(false);

      // Após release, writer volta a funcionar.
      await writer.putNutritionDay(makeConsumptionDay('2026-09-12') as never);
      expect(await listHasConsumption(writer)).toBe(true);
    } finally {
      await admin.close().catch(() => undefined);
      await writer.close().catch(() => undefined);
    }
  });

  it('C. DOUBLE_ADMIN = SINGLE_FENCE: dois admins concorrentes, somente um ativo', async () => {
    const { admin, writer } = makeCrossTabHarness();
    await admin.open();
    await writer.open();
    try {
      const first = await admin.acquireNutritionAdminFence({
        ownerId: 'owner-admin-C1',
        operationId: 'op-C1',
        operationKind: 'import',
      });
      await expect(writer.acquireNutritionAdminFence({
        ownerId: 'owner-admin-C2',
        operationId: 'op-C2',
        operationKind: 'import',
      })).rejects.toSatisfy(isNutritionAdminFencedError);

      const live = await admin.readNutritionAdminFence();
      expect(live?.fenceId).toBe(first.fenceId);
      expect(live?.ownerId).toBe('owner-admin-C1');

      await admin.releaseNutritionAdminFence({ fenceId: first.fenceId });
      // Após release, o segundo admin consegue adquirir.
      const second = await writer.acquireNutritionAdminFence({
        ownerId: 'owner-admin-C2',
        operationId: 'op-C2',
        operationKind: 'import',
      });
      expect(second.fenceId).not.toBe(first.fenceId);
      await writer.releaseNutritionAdminFence({ fenceId: second.fenceId });
    } finally {
      await admin.close().catch(() => undefined);
      await writer.close().catch(() => undefined);
    }
  });

  it('D. WRONG_OWNER_RELEASE = BLOCKED: fenceId incorreto não remove fence alheio', async () => {
    const { admin, writer } = makeCrossTabHarness();
    await admin.open();
    await writer.open();
    try {
      const fence = await admin.acquireNutritionAdminFence({
        ownerId: 'owner-admin-D',
        operationId: 'op-D',
        operationKind: 'reset-commit',
      });
      const wrong = await writer.releaseNutritionAdminFence({ fenceId: 'fence-id-errado' });
      expect(wrong).toEqual({ released: false });
      // Fence alheio intacto — writer segue bloqueado.
      expect(await writer.hasActiveNutritionAdminFence()).toBe(true);
      await expect(writer.putNutritionDay(makeConsumptionDay('2026-09-12') as never))
        .rejects.toSatisfy(isNutritionAdminFencedError);

      const right = await admin.releaseNutritionAdminFence({ fenceId: fence.fenceId });
      expect(right).toEqual({ released: true });
    } finally {
      await admin.close().catch(() => undefined);
      await writer.close().catch(() => undefined);
    }
  });

  it('E. STALE_FENCE_RECOVERY = PASS: fence expirado é removido pelo writer e pelo novo acquire', async () => {
    const { admin, writer } = makeCrossTabHarness();
    await admin.open();
    await writer.open();
    try {
      // Fence que já nasce expirado (TTL negativo → determinístico, sem sleep).
      const stale = await admin.acquireNutritionAdminFence({
        ownerId: 'owner-stale',
        operationId: 'op-stale',
        operationKind: 'export',
        ttlMs: -1000,
      });
      expect(await admin.hasActiveNutritionAdminFence()).toBe(false);

      // Writer remove o expirado NA PRÓPRIA transação e continua.
      await writer.putNutritionDay(makeConsumptionDay('2026-09-12') as never);
      expect(await listHasConsumption(writer)).toBe(true);
      // O expirado sumiu (higiene na mesma transação).
      expect(await admin.readNutritionAdminFence()).toBeNull();

      // Novo admin adquire limpamente após a recuperação.
      const fresh = await admin.acquireNutritionAdminFence({
        ownerId: 'owner-fresh',
        operationId: 'op-fresh',
        operationKind: 'export',
      });
      expect(fresh.fenceId).not.toBe(stale.fenceId);
      expect(await admin.hasActiveNutritionAdminFence()).toBe(true);
      await admin.releaseNutritionAdminFence({ fenceId: fresh.fenceId });
    } finally {
      await admin.close().catch(() => undefined);
      await writer.close().catch(() => undefined);
    }
  });

  it('renew estende o fence do mesmo dono e recusa dono errado', async () => {
    const { admin, writer } = makeCrossTabHarness();
    await admin.open();
    await writer.open();
    try {
      const fence = await admin.acquireNutritionAdminFence({
        ownerId: 'owner-renew',
        operationId: 'op-renew',
        operationKind: 'export',
        ttlMs: 30_000,
      });
      await expect(admin.renewNutritionAdminFence({ fenceId: 'outro-fence' }))
        .rejects.toSatisfy(isNutritionAdminFencedError);
      const renewed = await admin.renewNutritionAdminFence({ fenceId: fence.fenceId });
      expect(renewed.fenceId).toBe(fence.fenceId);
      expect(Date.parse(renewed.expiresAt)).toBeGreaterThanOrEqual(Date.parse(fence.expiresAt));
      await admin.releaseNutritionAdminFence({ fenceId: fence.fenceId });
      expect(await writer.hasActiveNutritionAdminFence()).toBe(false);
    } finally {
      await admin.close().catch(() => undefined);
      await writer.close().catch(() => undefined);
    }
  });

  it('fence vive no store existente nutritionMetadata (sem novo store)', async () => {
    const factory = new IDBFactory();
    const name = `gymflow-fence-store-${(sequence += 1)}`;
    const adapter = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name });
    await adapter.open();
    try {
      expect((adapter as unknown as { database: IDBDatabase }).database.objectStoreNames.contains(NUTRITION_METADATA_STORE)).toBe(true);
      const fence = await adapter.acquireNutritionAdminFence({
        ownerId: 'owner-store',
        operationId: 'op-store',
        operationKind: 'export',
      });
      // Leitura bruta do record comprova o namespace chave/valor existente.
      const raw = await new Promise<unknown>((resolve, reject) => {
        const db = (adapter as unknown as { database: IDBDatabase }).database;
        const tx = db.transaction(NUTRITION_METADATA_STORE, 'readonly');
        const req = tx.objectStore(NUTRITION_METADATA_STORE).get(NUTRITION_ADMIN_FENCE_KEY);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      expect((raw as { key: string }).key).toBe(NUTRITION_ADMIN_FENCE_KEY);
      await adapter.releaseNutritionAdminFence({ fenceId: fence.fenceId });
    } finally {
      await adapter.close();
    }
  });

  it('fence ativo não vira corrupção de storage (erro tipado, sem IntegrityError)', async () => {
    const { admin, writer } = makeCrossTabHarness();
    await admin.open();
    await writer.open();
    try {
      const fence = await admin.acquireNutritionAdminFence({
        ownerId: 'owner-nocorrupt',
        operationId: 'op-nocorrupt',
        operationKind: 'export',
      });
      const failure = await writer.putNutritionDay(makeConsumptionDay('2026-09-12') as never).then(
        () => null,
        (error: unknown) => error,
      );
      expect(isNutritionAdminFencedError(failure)).toBe(true);
      expect((failure as Error).name).toBe('NutritionAdminFencedError');
      await admin.releaseNutritionAdminFence({ fenceId: fence.fenceId });
    } finally {
      await admin.close().catch(() => undefined);
      await writer.close().catch(() => undefined);
    }
  });
});
