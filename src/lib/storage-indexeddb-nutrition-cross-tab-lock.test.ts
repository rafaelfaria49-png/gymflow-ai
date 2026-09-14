/**
 * GymFlow AI — Exclusão cross-tab do admin nutricional via Web Locks (GOAL-089).
 *
 * Prova que a segurança do admin NÃO depende da duração do TTL: o Web Lock
 * EXCLUSIVE (`gymflow:nutrition-admin-v1`) é retido durante TODA a operação
 * administrativa, writers SHARED aguardam sem commitar, e o fence IndexedDB
 * permanece só como defesa em profundidade + stale cleanup.
 *
 * Lock manager fake/injetável determinístico (mesma instância entre "abas"),
 * relógio injetável (sem sleep real — o clock avança 31s/60s de uma vez).
 *
 * Aceite coberto aqui (nível adapter):
 * - CROSS_TAB_LOCK = WEB_LOCKS, ADMIN_LOCK_MODE = EXCLUSIVE,
 *   NUTRITION_WRITE_LOCK_MODE = SHARED
 * - ADMIN_SAFETY_DEPENDS_ON_FENCE_TTL = NO
 * - ACTIVE_ADMIN_OVER_TTL_SAFE = YES
 * - WRITER_DURING_ACTIVE_ADMIN = BLOCKED (pendente, sem put)
 * - WRITER_BEFORE_ADMIN = OBSERVED_BY_PROBE
 * - RENEW_EXPIRED_FENCE = BLOCKED, CLOCK_SOURCE_CONSISTENT = YES
 * - TOCTOU_* = CLOSED (janela normal e atravessando expiresAt)
 * - ADMIN_THROW_RELEASE (lock liberado; fence best-effort ou expira)
 * - 20 writers simultâneos sem lost update
 */

import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_LOCK_MODE,
  ADMIN_SAFETY_DEPENDS_ON_FENCE_TTL,
  NUTRITION_ADMIN_LOCK_UNAVAILABLE_MESSAGE,
  NUTRITION_ADMIN_LOCK_UNAVAILABLE_REASON,
  NUTRITION_ADMIN_WEB_LOCK_NAME,
  NUTRITION_WRITE_LOCK_MODE,
  NutritionAdminLockUnavailableError,
  isNutritionAdminLockUnavailableError,
  isNutritionCrossTabLockAvailable,
  resolveNutritionCrossTabLockManager,
} from './nutrition/admin-lock';
import {
  createDeferred,
  createFakeNutritionCrossTabLockManager,
  installFakeNutritionCrossTabLocks,
  restoreFakeNutritionCrossTabLocks,
} from './nutrition/admin-lock-fake';
import {
  NUTRITION_ADMIN_FENCE_TTL_MS,
  isNutritionAdminFencedError,
  type NutritionAdminFenceOperationKind,
} from './nutrition/admin-fence';
import { nutritionDayHasConsumption } from './nutrition/admin-gate';
import { createProfileAbsentSnapshot } from './nutrition/gate-snapshot';
import { addHydrationEntry } from './nutrition/ledger';
import {
  CURRENT_STORAGE_VERSION,
  HYBRID_STORAGE_VERSION,
} from './storage-types';
import {
  GYMFLOW_INDEXEDDB_VERSION,
  IndexedDbWorkoutHistoryStorage,
} from './storage-indexeddb';

let sequence = 50000;

const LOCK = NUTRITION_ADMIN_WEB_LOCK_NAME;
const T0 = Date.parse('2026-09-12T14:00:00.000Z');

function makeEmptyDay(date: string) {
  return {
    id: `nutrition-day-${date}`,
    date,
    timezone: 'America/Sao_Paulo',
    targetState: 'MANUAL_ONLY' as const,
    targets: null,
    targetUnavailableReason: 'PROFILE_ABSENT' as const,
    gateSnapshot: createProfileAbsentSnapshot('2026-09-12T14:00:00.000Z'),
    meals: [],
    hydrationEntries: [],
    isClosed: false,
    closedAt: null,
  };
}

function makeConsumptionDay(date: string) {
  return addHydrationEntry(makeEmptyDay(date) as never, {
    id: `hyd-xtab-${date}`,
    amountMl: 500,
    loggedAt: '2026-09-12T14:00:00.000Z',
  }) as unknown as ReturnType<typeof makeEmptyDay>;
}

function makeMarker() {
  return {
    version: 1,
    status: 'completed',
    classification: 'LEGACY_EMPTY',
    migratedAt: '2026-09-12T14:00:00.000Z',
    source: 'legacy-nutrition-log',
  } as never;
}

/** Duas "abas" (adapters) sobre o mesmo IDB + mesmo fake LockManager + clock injetável. */
function makeCrossTabHarness() {
  const factory = new IDBFactory();
  const name = `gymflow-xtablock-${(sequence += 1)}`;
  const locks = createFakeNutritionCrossTabLockManager();
  let nowMs = T0;
  const now = () => new Date(nowMs);
  const admin = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name, now, locks });
  const writer = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name, now, locks });
  return {
    admin,
    writer,
    locks,
    advance: (ms: number) => {
      nowMs += ms;
    },
    nowMs: () => nowMs,
    close: async () => {
      await admin.close().catch(() => undefined);
      await writer.close().catch(() => undefined);
    },
  };
}

async function flushMacrotask(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 25));
}

describe('nutrition cross-tab lock — Web Locks (GOAL-089)', () => {
  it('contrato canônico: nome, modos e TTL fora da garantia', () => {
    expect(NUTRITION_ADMIN_WEB_LOCK_NAME).toBe('gymflow:nutrition-admin-v1');
    expect(ADMIN_LOCK_MODE).toBe('exclusive');
    expect(NUTRITION_WRITE_LOCK_MODE).toBe('shared');
    expect(ADMIN_SAFETY_DEPENDS_ON_FENCE_TTL).toBe('NO');
    expect(NUTRITION_ADMIN_FENCE_TTL_MS).toBe(30_000);
    expect(NUTRITION_ADMIN_LOCK_UNAVAILABLE_REASON).toBe('nutrition-admin-lock-unavailable');
    expect(NUTRITION_ADMIN_LOCK_UNAVAILABLE_MESSAGE.length).toBeGreaterThan(0);
  });

  it('versionamento preservado: IDB=5, HYBRID=2, CURRENT=1', () => {
    expect(GYMFLOW_INDEXEDDB_VERSION).toBe(5);
    expect(HYBRID_STORAGE_VERSION).toBe(2);
    expect(CURRENT_STORAGE_VERSION).toBe(1);
  });

  it('capability: sem manager, admin falha fechado e writers seguem normais', async () => {
    const factory = new IDBFactory();
    const name = `gymflow-xtablock-nolocks-${(sequence += 1)}`;
    const adapter = new IndexedDbWorkoutHistoryStorage({ factory, databaseName: name, locks: null });
    await adapter.open();
    try {
      expect(adapter.isNutritionCrossTabLockAvailable()).toBe(false);
      expect(isNutritionCrossTabLockAvailable(null)).toBe(false);
      expect(resolveNutritionCrossTabLockManager(null)).toBeNull();
      const failure = await adapter.runNutritionAdminWithExclusiveLock(async () => 'nunca').then(
        () => null,
        (error: unknown) => error,
      );
      expect(isNutritionAdminLockUnavailableError(failure)).toBe(true);
      expect(failure).toBeInstanceOf(NutritionAdminLockUnavailableError);
      // Writers nutricionais seguem funcionando sem Web Locks.
      await adapter.putNutritionDay(makeConsumptionDay('2026-09-12') as never);
      await adapter.putNutritionDayIfAbsent(makeEmptyDay('2026-09-13') as never);
      await adapter.mutateNutritionDay('2026-09-12', (current) => (current ?? makeEmptyDay('2026-09-12')) as never);
      await adapter.setActiveNutritionDate('2026-09-12');
      await adapter.setNutritionMigrationMarker(makeMarker());
      expect((await adapter.listNutritionDays()).length).toBe(2);
    } finally {
      await adapter.close();
    }
  });

  it('capability global: navigator.locks detectado quando presente', () => {
    const before = resolveNutritionCrossTabLockManager();
    const fake = installFakeNutritionCrossTabLocks();
    try {
      expect(isNutritionCrossTabLockAvailable()).toBe(true);
      expect(resolveNutritionCrossTabLockManager()).toBe(fake);
    } finally {
      restoreFakeNutritionCrossTabLocks();
    }
    // Restore devolve o ambiente ao que era (nativo ou ausente) — nunca o fake.
    expect(resolveNutritionCrossTabLockManager()).not.toBe(fake);
    expect(resolveNutritionCrossTabLockManager()).toBe(before);
  });

  it('ACTIVE_ADMIN_OVER_TTL_SAFE = YES: admin pendente além de 30s retém writer, sem put', async () => {
    const { admin, writer, locks, advance, close } = makeCrossTabHarness();
    await admin.open();
    await writer.open();
    try {
      const entered = createDeferred<void>();
      const releaseAdmin = createDeferred<void>();
      const adminOp = admin.runNutritionAdminWithExclusiveLock(async () => {
        const fence = await admin.acquireNutritionAdminFence({
          ownerId: 'owner-over-ttl',
          operationId: 'op-over-ttl',
          operationKind: 'export',
        });
        entered.resolve();
        // Admin permanece pendente (operação longa) com fence + lock retidos.
        await releaseAdmin.promise;
        await admin.releaseNutritionAdminFence({ fenceId: fence.fenceId });
        return 'admin-done';
      });
      await entered.promise;
      expect(locks.hasExclusiveHolder(LOCK)).toBe(true);

      // Clock além do TTL — sem sleep real. O fence expira pelo relógio
      // canônico, mas a segurança segue no Web Lock EXCLUSIVE.
      advance(31_000);
      expect(await admin.hasActiveNutritionAdminFence()).toBe(false);

      let writeSettled = false;
      const writePromise = writer.putNutritionDay(makeConsumptionDay('2026-09-12') as never).then(
        () => {
          writeSettled = true;
          return 'wrote';
        },
        (error: unknown) => {
          writeSettled = true;
          throw error;
        },
      );
      // Writer pediu SHARED mas o EXCLUSIVE o retém: fila com 1 ticket.
      expect(locks.pendingCount(LOCK)).toBe(1);
      await flushMacrotask();
      // WRITER_DURING_ACTIVE_ADMIN = BLOCKED: pendente, nenhum put ocorreu.
      expect(writeSettled).toBe(false);
      expect(await writer.listNutritionDays()).toEqual([]);

      releaseAdmin.resolve();
      await expect(adminOp).resolves.toBe('admin-done');
      await expect(writePromise).resolves.toBe('wrote');
      expect(writeSettled).toBe(true);
      // Lock totalmente livre só depois do writer terminar (shared liberado).
      expect(locks.isHeld(LOCK)).toBe(false);
      expect(locks.pendingCount(LOCK)).toBe(0);
      expect((await writer.listNutritionDays()).length).toBe(1);
    } finally {
      await close();
    }
  });

  it('WRITER_BEFORE_ADMIN = OBSERVED_BY_PROBE: shared primeiro, exclusive aguarda, sonda vê consumo', async () => {
    const { admin, writer, locks, close } = makeCrossTabHarness();
    await admin.open();
    await writer.open();
    try {
      // Writer SHARED começa primeiro; admin EXCLUSIVE é solicitado no mesmo
      // tick e enfileira atrás do shared (FIFO determinístico).
      const writePromise = writer.putNutritionDay(makeConsumptionDay('2026-09-12') as never);
      let sharedHeldAtAdminEnter = -1;
      let adminSawConsumption = false;
      const adminOp = admin.runNutritionAdminWithExclusiveLock(async () => {
        sharedHeldAtAdminEnter = locks.heldSharedCount(LOCK);
        const fence = await admin.acquireNutritionAdminFence({
          ownerId: 'owner-writer-first',
          operationId: 'op-writer-first',
          operationKind: 'import',
        });
        try {
          const days = await admin.listNutritionDays();
          adminSawConsumption = days.some((day) => nutritionDayHasConsumption(day));
          // Na borda real, consumo visível ⇒ nutrition-ledger-admin-deferred.
          return adminSawConsumption ? 'deferred' : 'proceed';
        } finally {
          await admin.releaseNutritionAdminFence({ fenceId: fence.fenceId });
        }
      });
      expect(locks.pendingCount(LOCK)).toBe(1);
      await writePromise;
      await expect(adminOp).resolves.toBe('deferred');
      expect(adminSawConsumption).toBe(true);
      // Admin só entrou depois do writer terminar (shared liberado).
      expect(sharedHeldAtAdminEnter).toBe(0);
    } finally {
      await close();
    }
  });

  it('MULTI_TAB A: writer-tab segura shared, admin-tab aguarda e entra depois', async () => {
    const { admin, locks, close } = makeCrossTabHarness();
    await admin.open();
    try {
      const releaseWriterTab = createDeferred<void>();
      const writerTabEntered = createDeferred<void>();
      // Aba A: writer de outra aba retendo SHARED (fora do adapter).
      const writerTab = locks.request(LOCK, { mode: 'shared' }, async () => {
        writerTabEntered.resolve();
        await releaseWriterTab.promise;
        return 'writer-tab-done';
      });
      await writerTabEntered.promise;

      let adminEntered = false;
      const adminOp = admin.runNutritionAdminWithExclusiveLock(async () => {
        adminEntered = true;
        const fence = await admin.acquireNutritionAdminFence({
          ownerId: 'owner-multitab',
          operationId: 'op-multitab',
          operationKind: 'restore-commit',
        });
        await admin.releaseNutritionAdminFence({ fenceId: fence.fenceId });
        return 'admin-done';
      });
      expect(locks.pendingCount(LOCK)).toBe(1);
      await flushMacrotask();
      expect(adminEntered).toBe(false);

      releaseWriterTab.resolve();
      await expect(writerTab).resolves.toBe('writer-tab-done');
      await expect(adminOp).resolves.toBe('admin-done');
      expect(adminEntered).toBe(true);
    } finally {
      await close();
    }
  });

  it('MULTI_TAB B: admin-tab exclusiva retém writer-tab; DOUBLE_ADMIN serializa', async () => {
    const { admin, writer, locks, close } = makeCrossTabHarness();
    await admin.open();
    await writer.open();
    try {
      const events: string[] = [];
      const releaseAdminTab = createDeferred<void>();
      const adminTabEntered = createDeferred<void>();
      // Aba A: admin de outra aba retendo EXCLUSIVE.
      const adminTab = locks.request(LOCK, { mode: 'exclusive' }, async () => {
        events.push('admin-tab-enter');
        adminTabEntered.resolve();
        await releaseAdminTab.promise;
        events.push('admin-tab-exit');
        return 'admin-tab-done';
      });
      await adminTabEntered.promise;

      let writeSettled = false;
      const writePromise = writer.putNutritionDay(makeConsumptionDay('2026-09-12') as never).then(
        () => {
          writeSettled = true;
          events.push('write');
          return 'wrote';
        },
      );
      // Segundo admin (aba B) também aguarda: dois tickets na fila.
      let sharedHeldAtSecondAdminEnter = -1;
      const secondAdminOp = admin.runNutritionAdminWithExclusiveLock(async () => {
        sharedHeldAtSecondAdminEnter = locks.heldSharedCount(LOCK);
        events.push('second-admin-enter');
        return 'second-done';
      });
      expect(locks.pendingCount(LOCK)).toBe(2);
      await flushMacrotask();
      expect(writeSettled).toBe(false);
      expect(events).toEqual(['admin-tab-enter']);

      releaseAdminTab.resolve();
      await expect(adminTab).resolves.toBe('admin-tab-done');
      await expect(writePromise).resolves.toBe('wrote');
      await expect(secondAdminOp).resolves.toBe('second-done');
      // Ordem: admin-tab sai ⇒ segundo admin entra (shared já liberado) ⇒
      // write resolve. Exclusão mútua: shared zerado na entrada do exclusive.
      expect(sharedHeldAtSecondAdminEnter).toBe(0);
      expect(events).toEqual(['admin-tab-enter', 'admin-tab-exit', 'second-admin-enter', 'write']);
      expect((await writer.listNutritionDays()).length).toBe(1);
    } finally {
      await close();
    }
  });

  it('20 writers simultâneos sob shared: sem lost update', async () => {
    const { writer, close } = makeCrossTabHarness();
    await writer.open();
    try {
      const date = '2026-09-12';
      await writer.putNutritionDayIfAbsent(makeEmptyDay(date) as never);
      await Promise.all(
        Array.from({ length: 20 }, (_, index) => writer.mutateNutritionDay(date, (current) => {
          const base = current ?? makeEmptyDay(date);
          return addHydrationEntry(base as never, {
            id: `hyd-20-${index}`,
            amountMl: 50,
            loggedAt: '2026-09-12T14:00:00.000Z',
          }) as never;
        })),
      );
      const day = await writer.getNutritionDay(date);
      expect(day?.hydrationEntries.length).toBe(20);
      expect(new Set(day?.hydrationEntries.map((entry) => entry.id)).size).toBe(20);
    } finally {
      await close();
    }
  });

  it('ADMIN_THROW_RELEASE = YES: throw libera o lock; fence sai best-effort ou expira', async () => {
    const { admin, writer, locks, advance, close } = makeCrossTabHarness();
    await admin.open();
    await writer.open();
    try {
      // Padrão do Provider: acquire → try/finally(release) → throw.
      const thrown = await admin.runNutritionAdminWithExclusiveLock(async () => {
        const fence = await admin.acquireNutritionAdminFence({
          ownerId: 'owner-throw',
          operationId: 'op-throw',
          operationKind: 'reset-commit',
        });
        try {
          throw new Error('boom-admin');
        } finally {
          await admin.releaseNutritionAdminFence({ fenceId: fence.fenceId });
        }
      }).then(
        () => 'no-throw',
        (error: unknown) => error,
      );
      expect((thrown as Error).message).toBe('boom-admin');
      expect(locks.isHeld(LOCK)).toBe(false);
      expect(locks.pendingCount(LOCK)).toBe(0);
      expect(await admin.readNutritionAdminFence()).toBeNull();
      // Futuro writer/admin não fica permanentemente bloqueado.
      await writer.putNutritionDay(makeConsumptionDay('2026-09-12') as never);
      expect((await writer.listNutritionDays()).length).toBe(1);

      // Crash real sem finally: fence órfão ativo, mas o LOCK foi liberado.
      await expect(admin.runNutritionAdminWithExclusiveLock(async () => {
        await admin.acquireNutritionAdminFence({
          ownerId: 'owner-crash',
          operationId: 'op-crash',
          operationKind: 'export',
        });
        throw new Error('crash-sem-finally');
      })).rejects.toThrow('crash-sem-finally');
      expect(locks.isHeld(LOCK)).toBe(false);
      expect(await admin.hasActiveNutritionAdminFence()).toBe(true);
      // Writer vê o fence ativo (defesa em profundidade) até o TTL limpar.
      await expect(writer.putNutritionDay(makeConsumptionDay('2026-09-13') as never))
        .rejects.toSatisfy(isNutritionAdminFencedError);
      advance(31_000);
      await writer.putNutritionDay(makeConsumptionDay('2026-09-13') as never);
      expect(await admin.hasActiveNutritionAdminFence()).toBe(false);
    } finally {
      await close();
    }
  });

  it('RENEW_EXPIRED_FENCE = BLOCKED + CLOCK_SOURCE_CONSISTENT = YES', async () => {
    const { admin, writer, advance, close } = makeCrossTabHarness();
    await admin.open();
    await writer.open();
    try {
      const fence = await admin.acquireNutritionAdminFence({
        ownerId: 'owner-renew',
        operationId: 'op-renew',
        operationKind: 'export',
        ttlMs: 30_000,
      });
      // Renew com fenceId alheio: bloqueado.
      await expect(admin.renewNutritionAdminFence({ fenceId: 'fence-alheio' }))
        .rejects.toSatisfy(isNutritionAdminFencedError);
      // Renew válido estende.
      const renewed = await admin.renewNutritionAdminFence({ fenceId: fence.fenceId });
      expect(renewed.fenceId).toBe(fence.fenceId);
      expect(Date.parse(renewed.expiresAt)).toBeGreaterThanOrEqual(Date.parse(fence.expiresAt));

      // Clock injetável governa a expiração (sem Date.now divergente).
      advance(31_000);
      expect(await admin.hasActiveNutritionAdminFence()).toBe(false);
      // Renew com fence expirado: bloqueado (não ressuscita exclusão morta).
      await expect(admin.renewNutritionAdminFence({ fenceId: fence.fenceId }))
        .rejects.toSatisfy(isNutritionAdminFencedError);
      // O acquire enxerga a mesma expiração e sobrescreve (sem conflito).
      const fresh = await writer.acquireNutritionAdminFence({
        ownerId: 'owner-fresh',
        operationId: 'op-fresh',
        operationKind: 'export',
      });
      expect(fresh.fenceId).not.toBe(fence.fenceId);
      await writer.releaseNutritionAdminFence({ fenceId: fresh.fenceId });
    } finally {
      await close();
    }
  });

  const ADMIN_KINDS: readonly NutritionAdminFenceOperationKind[] = [
    'export',
    'import',
    'restore-inspect',
    'restore-commit',
    'reset-inspect',
    'reset-commit',
  ];

  it.each(ADMIN_KINDS)('TOCTOU_%s = CLOSED na janela normal (writer serializado após o admin)', async (kind) => {
    const { admin, writer, locks, close } = makeCrossTabHarness();
    await admin.open();
    await writer.open();
    try {
      const events: string[] = [];
      // Admin retém EXCLUSIVE + fence e sonda ledger vazio ⇒ prossegue.
      const adminOp = admin.runNutritionAdminWithExclusiveLock(async () => {
        const fence = await admin.acquireNutritionAdminFence({
          ownerId: `owner-toctou-${kind}`,
          operationId: `op-toctou-${kind}`,
          operationKind: kind,
        });
        try {
          const days = await admin.listNutritionDays();
          const hasConsumption = days.some((day) => nutritionDayHasConsumption(day));
          expect(hasConsumption).toBe(false);
          events.push('admin-probe-empty');
          return 'proceed';
        } finally {
          await admin.releaseNutritionAdminFence({ fenceId: fence.fenceId });
          events.push('admin-released');
        }
      });
      // Writer concorrente pede SHARED no mesmo tick: aguarda o exclusive.
      let writeSettled = false;
      const writePromise = writer.putNutritionDay(makeConsumptionDay('2026-09-12') as never).then(
        () => {
          writeSettled = true;
          events.push('write');
          return 'wrote';
        },
      );
      expect(locks.pendingCount(LOCK)).toBe(1);
      await expect(adminOp).resolves.toBe('proceed');
      await expect(writePromise).resolves.toBe('wrote');
      expect(writeSettled).toBe(true);
      // Ordem: sonda vazia ⇒ release ⇒ write. Nada omitido, nada divergiu.
      expect(events).toEqual(['admin-probe-empty', 'admin-released', 'write']);
      expect((await writer.listNutritionDays()).length).toBe(1);
    } finally {
      await close();
    }
  });

  it.each(ADMIN_KINDS)('TOCTOU_OVER_TTL_%s = CLOSED atravessando expiresAt', async (kind) => {
    const { admin, writer, locks, advance, close } = makeCrossTabHarness();
    await admin.open();
    await writer.open();
    try {
      const releaseAdmin = createDeferred<void>();
      const entered = createDeferred<void>();
      const adminOp = admin.runNutritionAdminWithExclusiveLock(async () => {
        const fence = await admin.acquireNutritionAdminFence({
          ownerId: `owner-ttl-${kind}`,
          operationId: `op-ttl-${kind}`,
          operationKind: kind,
        });
        entered.resolve();
        // Janela longa: clock atravessa expiresAt com o admin ainda ativo.
        advance(61_000);
        expect(await admin.hasActiveNutritionAdminFence()).toBe(false);
        await releaseAdmin.promise;
        const days = await admin.listNutritionDays();
        const result = days.some((day) => nutritionDayHasConsumption(day)) ? 'deferred' : 'proceed';
        await admin.releaseNutritionAdminFence({ fenceId: fence.fenceId });
        return result;
      });
      await entered.promise;

      let writeSettled = false;
      const writePromise = writer.putNutritionDay(makeConsumptionDay('2026-09-12') as never).then(
        () => {
          writeSettled = true;
          return 'wrote';
        },
      );
      expect(locks.pendingCount(LOCK)).toBe(1);
      await flushMacrotask();
      // Mesmo com o fence expirado, o writer segue retido pelo EXCLUSIVE.
      expect(writeSettled).toBe(false);
      expect(await writer.listNutritionDays()).toEqual([]);

      releaseAdmin.resolve();
      // Admin sondou vazio (writer ainda retido) ⇒ proceed; writer depois.
      await expect(adminOp).resolves.toBe('proceed');
      await expect(writePromise).resolves.toBe('wrote');
      expect((await writer.listNutritionDays()).length).toBe(1);
    } finally {
      await close();
    }
  });
});
