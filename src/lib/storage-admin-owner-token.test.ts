import { describe, expect, it, vi } from 'vitest';
import {
  createStorageAdminOwnerTokenCoordinator,
  isStorageAdminOwnerTokenConflict,
} from './storage-admin-owner-token';
import type { StorageLike } from './storage-types';

const KEY = 'gymflow:state:v1';
const TOKEN_KEY = `${KEY}:admin-owner-token:v1`;

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

function token(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    ownerId: 'owner-other',
    operationId: 'operation-other',
    operationKind: 'import',
    acquiredAt: 0,
    expiresAt: 100,
    nonce: 'nonce-other',
    ...overrides,
  });
}

function coordinator(input: {
  storage: StorageLike;
  ownerId?: string;
  now?: () => number;
  nonces?: string[];
  operationIds?: string[];
  leaseDurationMs?: number;
  renewWithinMs?: number;
}) {
  const nonces = [...(input.nonces ?? ['nonce-1', 'nonce-2', 'nonce-3'])];
  const operationIds = [...(input.operationIds ?? ['operation-generated'])];
  return createStorageAdminOwnerTokenCoordinator({
    key: KEY,
    storage: input.storage,
    ownerId: input.ownerId ?? 'owner-a',
    now: input.now ?? (() => 0),
    nonceFactory: () => nonces.shift() ?? 'nonce-fallback',
    operationIdFactory: () => operationIds.shift() ?? 'operation-fallback',
    leaseDurationMs: input.leaseDurationMs ?? 100,
    renewWithinMs: input.renewWithinMs ?? 25,
  });
}

function expectAcquired(
  acquisition: ReturnType<ReturnType<typeof coordinator>['acquire']>,
) {
  expect(acquisition.status).toBe('acquired');
  if (acquisition.status !== 'acquired') throw new Error('aquisição esperada');
  return acquisition.lease;
}

describe('owner-token administrativo entre abas', () => {
  it('adquire a ausência com schema mínimo, chave derivada e readback exato', () => {
    const storage = new MemoryStorage();
    const lease = expectAcquired(coordinator({
      storage,
      operationIds: ['operation-deterministic'],
      nonces: ['nonce-deterministic'],
    }).acquire({
      operationId: 'operation-deterministic',
      operationKind: 'import',
    }));

    expect(JSON.parse(storage.values.get(TOKEN_KEY) ?? '')).toEqual({
      schemaVersion: 1,
      ownerId: 'owner-a',
      operationId: 'operation-deterministic',
      operationKind: 'import',
      acquiredAt: 0,
      expiresAt: 100,
      nonce: 'nonce-deterministic',
    });
    expect(lease.confirm()).toEqual({ status: 'owned', reason: 'confirmed' });
  });

  it('gera operationId por fábrica injetável sem expor estado adicional', () => {
    const storage = new MemoryStorage();
    const owner = coordinator({
      storage,
      operationIds: ['operation-injected'],
    });

    expect(owner.createOperationId()).toBe('operation-injected');
  });

  it('bloqueia token válido de outro owner e não o altera', () => {
    const storage = new MemoryStorage();
    const raw = token();
    storage.values.set(TOKEN_KEY, raw);

    expect(coordinator({ storage }).acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    })).toEqual({ status: 'blocked', reason: 'owned-by-other' });
    expect(storage.values.get(TOKEN_KEY)).toBe(raw);
  });

  it('permite takeover no limite exato da expiração', () => {
    const storage = new MemoryStorage();
    storage.values.set(TOKEN_KEY, token({ expiresAt: 100 }));

    const acquisition = coordinator({
      storage,
      ownerId: 'owner-b',
      now: () => 100,
      nonces: ['nonce-b'],
    }).acquire({
      operationId: 'operation-b',
      operationKind: 'rollback',
    });

    expect(acquisition.status).toBe('acquired');
    expect(JSON.parse(storage.values.get(TOKEN_KEY) ?? '')).toMatchObject({
      ownerId: 'owner-b',
      operationId: 'operation-b',
      operationKind: 'rollback',
      acquiredAt: 100,
      expiresAt: 200,
      nonce: 'nonce-b',
    });
  });

  it('faz takeover após crash sem release somente depois da expiração', () => {
    const storage = new MemoryStorage();
    let now = 0;
    expectAcquired(coordinator({
      storage,
      ownerId: 'owner-crashed',
      now: () => now,
      nonces: ['nonce-crashed'],
    }).acquire({
      operationId: 'operation-crashed',
      operationKind: 'import',
    }));
    const contender = coordinator({
      storage,
      ownerId: 'owner-recovery',
      now: () => now,
      nonces: ['nonce-recovery'],
    });

    now = 99;
    expect(contender.acquire({
      operationId: 'operation-recovery',
      operationKind: 'import',
    })).toEqual({ status: 'blocked', reason: 'owned-by-other' });
    now = 100;
    expect(contender.acquire({
      operationId: 'operation-recovery',
      operationKind: 'import',
    }).status).toBe('acquired');
  });

  it('renova apenas o mesmo owner/operação perto da expiração', () => {
    const storage = new MemoryStorage();
    let now = 0;
    const lease = expectAcquired(coordinator({
      storage,
      now: () => now,
      nonces: ['nonce-initial', 'nonce-renewed'],
    }).acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    }));

    now = 80;
    expect(lease.confirm()).toEqual({ status: 'owned', reason: 'renewed' });
    expect(JSON.parse(storage.values.get(TOKEN_KEY) ?? '')).toMatchObject({
      ownerId: 'owner-a',
      operationId: 'operation-a',
      acquiredAt: 0,
      expiresAt: 180,
      nonce: 'nonce-renewed',
    });
  });

  it('não renova após perder propriedade para outra aba', () => {
    const storage = new MemoryStorage();
    let now = 0;
    const lease = expectAcquired(coordinator({
      storage,
      now: () => now,
      nonces: ['nonce-a', 'nonce-renew-a'],
    }).acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    }));
    const replacement = token({
      ownerId: 'owner-b',
      operationId: 'operation-b',
      acquiredAt: 80,
      expiresAt: 180,
      nonce: 'nonce-b',
    });
    storage.values.set(TOKEN_KEY, replacement);
    now = 80;

    expect(lease.confirm()).toEqual({ status: 'blocked', reason: 'lost-ownership' });
    expect(storage.values.get(TOKEN_KEY)).toBe(replacement);
  });

  it('não sobrescreve takeover ocorrido durante a preparação da renovação', () => {
    const storage = new MemoryStorage();
    let now = 0;
    let nonceCall = 0;
    const other = token({
      ownerId: 'owner-b',
      operationId: 'operation-b',
      acquiredAt: 80,
      expiresAt: 180,
      nonce: 'nonce-b',
    });
    const owner = createStorageAdminOwnerTokenCoordinator({
      key: KEY,
      storage,
      ownerId: 'owner-a',
      now: () => now,
      nonceFactory: () => {
        nonceCall += 1;
        if (nonceCall === 2) storage.values.set(TOKEN_KEY, other);
        return `nonce-a-${nonceCall}`;
      },
      operationIdFactory: () => 'operation-a',
      leaseDurationMs: 100,
      renewWithinMs: 25,
    });
    const lease = expectAcquired(owner.acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    }));

    now = 80;
    expect(lease.confirm()).toEqual({ status: 'blocked', reason: 'lost-ownership' });
    expect(storage.values.get(TOKEN_KEY)).toBe(other);
  });

  it('reutiliza o mesmo lease para a mesma operação na mesma aba', () => {
    const storage = new MemoryStorage();
    const owner = coordinator({ storage, nonces: ['nonce-a'] });
    const first = owner.acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    });
    const second = owner.acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    });

    expect(first.status).toBe('acquired');
    expect(second.status).toBe('acquired');
    if (first.status !== 'acquired' || second.status !== 'acquired') return;
    expect(second.reason).toBe('already-owned');
    expect(second.lease).toBe(first.lease);
  });

  it('release do owner grava tombstone expirado e permite takeover', () => {
    const storage = new MemoryStorage();
    let now = 10;
    const lease = expectAcquired(coordinator({
      storage,
      now: () => now,
      nonces: ['nonce-a', 'nonce-release'],
    }).acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    }));

    now = 20;
    expect(lease.release()).toEqual({ status: 'released', reason: 'released' });
    expect(JSON.parse(storage.values.get(TOKEN_KEY) ?? '')).toMatchObject({
      ownerId: 'owner-a',
      expiresAt: 20,
      nonce: 'nonce-release',
    });
    expect(coordinator({
      storage,
      ownerId: 'owner-b',
      now: () => now,
      nonces: ['nonce-b'],
    }).acquire({
      operationId: 'operation-b',
      operationKind: 'restore',
    }).status).toBe('acquired');
  });

  it('release não-owner não remove nem sobrescreve o token atual', () => {
    const storage = new MemoryStorage();
    let now = 0;
    const stale = expectAcquired(coordinator({
      storage,
      ownerId: 'owner-a',
      now: () => now,
      nonces: ['nonce-a', 'nonce-release-a'],
    }).acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    }));
    now = 100;
    expectAcquired(coordinator({
      storage,
      ownerId: 'owner-b',
      now: () => now,
      nonces: ['nonce-b'],
    }).acquire({
      operationId: 'operation-b',
      operationKind: 'restore',
    }));
    const current = storage.values.get(TOKEN_KEY);

    expect(stale.release()).toEqual({ status: 'not-released', reason: 'lost-ownership' });
    expect(storage.values.get(TOKEN_KEY)).toBe(current);
  });

  it('release não sobrescreve takeover ocorrido durante sua preparação', () => {
    const storage = new MemoryStorage();
    let nonceCall = 0;
    const other = token({
      ownerId: 'owner-b',
      operationId: 'operation-b',
      acquiredAt: 10,
      expiresAt: 110,
      nonce: 'nonce-b',
    });
    const owner = createStorageAdminOwnerTokenCoordinator({
      key: KEY,
      storage,
      ownerId: 'owner-a',
      now: () => 10,
      nonceFactory: () => {
        nonceCall += 1;
        if (nonceCall === 2) storage.values.set(TOKEN_KEY, other);
        return `nonce-a-${nonceCall}`;
      },
      operationIdFactory: () => 'operation-a',
      leaseDurationMs: 100,
      renewWithinMs: 25,
    });
    const lease = expectAcquired(owner.acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    }));

    expect(lease.release()).toEqual({
      status: 'not-released',
      reason: 'lost-ownership',
    });
    expect(storage.values.get(TOKEN_KEY)).toBe(other);
  });

  it('handle ABA antigo não altera nova aquisição do mesmo owner e operação', () => {
    const storage = new MemoryStorage();
    let now = 0;
    const owner = coordinator({
      storage,
      ownerId: 'owner-a',
      now: () => now,
      nonces: ['nonce-old', 'nonce-new', 'nonce-stale-release'],
    });
    const stale = expectAcquired(owner.acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    }));
    now = 100;
    const currentLease = expectAcquired(owner.acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    }));
    const current = storage.values.get(TOKEN_KEY);

    expect(currentLease).not.toBe(stale);
    expect(stale.release()).toEqual({ status: 'not-released', reason: 'lost-ownership' });
    expect(storage.values.get(TOKEN_KEY)).toBe(current);
    expect(currentLease.confirm()).toEqual({ status: 'owned', reason: 'confirmed' });
  });

  it.each([
    ['JSON inválido', '{'],
    ['shape incompleto', JSON.stringify({ schemaVersion: 1 })],
    ['schema futuro', token({ schemaVersion: 2 })],
    ['chave extra', token({ unexpected: true })],
    ['intervalo inválido', token({ acquiredAt: 101, expiresAt: 100 })],
  ])('falha fechado para token malformado: %s', (_label, raw) => {
    const storage = new MemoryStorage();
    storage.values.set(TOKEN_KEY, raw);

    expect(coordinator({ storage }).acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    })).toEqual({ status: 'blocked', reason: 'malformed-token' });
    expect(storage.values.get(TOKEN_KEY)).toBe(raw);
  });

  it('falha fechado quando o readback da aquisição diverge', () => {
    const storage = new MemoryStorage();
    const setItem = vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      storage.values.set(key, `${value} `);
    });

    expect(coordinator({ storage }).acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    })).toEqual({ status: 'blocked', reason: 'readback-diverged' });
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('bloqueia no instante exato da expiração e na regressão do relógio', () => {
    const storage = new MemoryStorage();
    let now = 10;
    const lease = expectAcquired(coordinator({
      storage,
      now: () => now,
      nonces: ['nonce-a'],
    }).acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    }));

    now = 110;
    expect(lease.confirm()).toEqual({ status: 'blocked', reason: 'expired' });
    now = 9;
    expect(lease.confirm()).toEqual({ status: 'blocked', reason: 'clock-invalid' });
  });

  it('duas abas simuladas: só a primeira avança antes da expiração', async () => {
    const storage = new MemoryStorage();
    const first = coordinator({
      storage,
      ownerId: 'owner-a',
      nonces: ['nonce-a'],
    });
    const second = coordinator({
      storage,
      ownerId: 'owner-b',
      nonces: ['nonce-b'],
    });
    const lease = expectAcquired(first.acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    }));
    const effect = vi.fn();

    expect(second.acquire({
      operationId: 'operation-b',
      operationKind: 'import',
    })).toEqual({ status: 'blocked', reason: 'owned-by-other' });
    await lease.execute(effect);
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it('execute confirma antes e não chama a janela após perda do token', async () => {
    const storage = new MemoryStorage();
    const lease = expectAcquired(coordinator({
      storage,
      nonces: ['nonce-a'],
    }).acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    }));
    storage.values.set(TOKEN_KEY, token());
    const effect = vi.fn();

    await expect(lease.execute(effect)).rejects.toSatisfy(isStorageAdminOwnerTokenConflict);
    expect(effect).not.toHaveBeenCalled();
  });

  it('execute confirma depois e troca erro da janela por conflito sanitizado ao perder o token', async () => {
    const storage = new MemoryStorage();
    const lease = expectAcquired(coordinator({
      storage,
      nonces: ['nonce-a'],
    }).acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    }));
    const sensitive = new Error('raw de usuário e digest secreto');

    let caught: unknown;
    try {
      await lease.execute(() => {
        storage.values.set(TOKEN_KEY, token());
        throw sensitive;
      });
    } catch (error) {
      caught = error;
    }

    expect(isStorageAdminOwnerTokenConflict(caught)).toBe(true);
    expect(caught).toEqual({ status: 'owner-token-blocked', reason: 'lost-ownership' });
    expect(caught).not.toBeInstanceOf(Error);
    expect(Object.keys(caught as object).sort()).toEqual(['reason', 'status']);
    expect(JSON.stringify(caught)).not.toContain('raw de usuário');
    expect(JSON.stringify(caught)).not.toContain('digest');
  });

  it('execute preserva o erro original quando a propriedade continua comprovada', async () => {
    const storage = new MemoryStorage();
    const lease = expectAcquired(coordinator({
      storage,
      nonces: ['nonce-a'],
    }).acquire({
      operationId: 'operation-a',
      operationKind: 'import',
    }));
    const failure = new Error('falha controlada');

    await expect(lease.execute(() => {
      throw failure;
    })).rejects.toBe(failure);
  });

  it('resultados públicos não carregam owner, operação, nonce, raw, receipt ou digest', () => {
    const storage = new MemoryStorage();
    const acquisition = coordinator({
      storage,
      ownerId: 'owner-sensitive',
      operationIds: ['operation-sensitive'],
      nonces: ['nonce-sensitive'],
    }).acquire({
      operationId: 'operation-sensitive',
      operationKind: 'import',
    });

    expect(acquisition.status).toBe('acquired');
    expect(JSON.stringify(acquisition)).not.toContain('owner-sensitive');
    expect(JSON.stringify(acquisition)).not.toContain('operation-sensitive');
    expect(JSON.stringify(acquisition)).not.toContain('nonce-sensitive');
    expect(JSON.stringify(acquisition)).not.toMatch(/raw|receipt|digest/i);
  });
});
