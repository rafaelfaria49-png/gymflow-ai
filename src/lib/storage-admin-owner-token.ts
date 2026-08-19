import type { StorageOperationKind } from './storage-operation-receipt';
import type { StorageLike } from './storage-types';

export type StorageAdminOwnerTokenOperationKind = StorageOperationKind | 'retirement';

// Lease cooperativo entre documentos para as operações administrativas.
//
// O localStorage não oferece compare-and-swap nem transação entre abas. Este
// contrato não promete exclusão mútua perfeita: ele faz escrita + readback
// exato na aquisição/renovação e exige nova confirmação imediatamente antes e
// depois de cada janela administrativa. Uma perda de propriedade é detectada e
// o journal existente fica responsável por convergir o mundo físico.

const OWNER_TOKEN_SCHEMA_VERSION = 1;
const OWNER_TOKEN_KEY_SUFFIX = ':admin-owner-token:v1';
const DEFAULT_LEASE_DURATION_MS = 30_000;
const DEFAULT_RENEW_WITHIN_MS = 10_000;

interface StoredStorageAdminOwnerToken {
  schemaVersion: typeof OWNER_TOKEN_SCHEMA_VERSION;
  ownerId: string;
  operationId: string;
  operationKind: StorageAdminOwnerTokenOperationKind;
  acquiredAt: number;
  expiresAt: number;
  nonce: string;
}

export type StorageAdminOwnerTokenBlockedReason =
  | 'invalid-input'
  | 'clock-invalid'
  | 'storage-unavailable'
  | 'malformed-token'
  | 'owned-by-other'
  | 'lost-ownership'
  | 'expired'
  | 'readback-diverged';

export type StorageAdminOwnerTokenCheck =
  | { readonly status: 'owned'; readonly reason: 'confirmed' | 'renewed' }
  | {
      readonly status: 'blocked';
      readonly reason: StorageAdminOwnerTokenBlockedReason;
    };

export type StorageAdminOwnerTokenRelease =
  | { readonly status: 'released'; readonly reason: 'released' }
  | {
      readonly status: 'not-released';
      readonly reason: StorageAdminOwnerTokenBlockedReason;
    };

export interface StorageAdminOwnerTokenConflict {
  readonly status: 'owner-token-blocked';
  readonly reason: StorageAdminOwnerTokenBlockedReason;
}

export interface StorageAdminOwnerTokenLease {
  confirm(): StorageAdminOwnerTokenCheck;
  execute<T>(operation: () => T | Promise<T>): Promise<T>;
  release(): StorageAdminOwnerTokenRelease;
}

export type StorageAdminOwnerTokenAcquisition =
  | {
      readonly status: 'acquired';
      readonly reason: 'acquired' | 'already-owned';
      readonly lease: StorageAdminOwnerTokenLease;
    }
  | {
      readonly status: 'blocked';
      readonly reason: StorageAdminOwnerTokenBlockedReason;
    };

export interface StorageAdminOwnerTokenCoordinatorOptions {
  key: string;
  storage: StorageLike;
  ownerId?: string;
  now?: () => number;
  nonceFactory?: () => string;
  operationIdFactory?: () => string;
  leaseDurationMs?: number;
  renewWithinMs?: number;
}

export interface StorageAdminOwnerTokenCoordinator {
  createOperationId(): string;
  acquire(input: {
    operationId: string;
    operationKind: StorageAdminOwnerTokenOperationKind;
  }): StorageAdminOwnerTokenAcquisition;
}

export type StorageAdminOwnerTokenInspectionStatus =
  | 'available'
  | 'busy'
  | 'expired'
  | 'malformed'
  | 'unavailable';

export interface StorageAdminOwnerTokenInspection {
  readonly status: StorageAdminOwnerTokenInspectionStatus;
}

export interface InspectStorageAdminOwnerTokenOptions {
  readonly key: string;
  readonly storage: Pick<StorageLike, 'getItem'>;
  readonly now?: () => number;
}

type TokenRead =
  | { status: 'absent' }
  | { status: 'read'; raw: string; token: StoredStorageAdminOwnerToken }
  | { status: 'blocked'; reason: 'storage-unavailable' | 'malformed-token' };

let defaultDocumentOwnerId: string | null = null;

const localLeases = new WeakMap<
  object,
  Map<string, StorageAdminOwnerTokenLeaseImpl>
>();

function opaqueId(prefix: 'owner' | 'operation' | 'nonce'): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function defaultOwnerId(): string {
  defaultDocumentOwnerId ??= opaqueId('owner');
  return defaultDocumentOwnerId;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isBlockedReason(value: unknown): value is StorageAdminOwnerTokenBlockedReason {
  return value === 'invalid-input'
    || value === 'clock-invalid'
    || value === 'storage-unavailable'
    || value === 'malformed-token'
    || value === 'owned-by-other'
    || value === 'lost-ownership'
    || value === 'expired'
    || value === 'readback-diverged';
}

function hasExactTokenKeys(value: Record<string, unknown>): boolean {
  const expected = [
    'schemaVersion',
    'ownerId',
    'operationId',
    'operationKind',
    'acquiredAt',
    'expiresAt',
    'nonce',
  ].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isOperationKind(value: unknown): value is StorageAdminOwnerTokenOperationKind {
  return value === 'import'
    || value === 'restore'
    || value === 'reset'
    || value === 'rollback'
    || value === 'retirement';
}

function isStoredToken(value: unknown): value is StoredStorageAdminOwnerToken {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const token = value as Record<string, unknown>;
  return hasExactTokenKeys(token)
    && token.schemaVersion === OWNER_TOKEN_SCHEMA_VERSION
    && isNonEmptyString(token.ownerId)
    && isNonEmptyString(token.operationId)
    && isOperationKind(token.operationKind)
    && isFiniteInteger(token.acquiredAt)
    && isFiniteInteger(token.expiresAt)
    && token.acquiredAt <= token.expiresAt
    && isNonEmptyString(token.nonce);
}

function readToken(storage: Pick<StorageLike, 'getItem'>, tokenKey: string): TokenRead {
  let raw: string | null;
  try {
    raw = storage.getItem(tokenKey);
  } catch {
    return { status: 'blocked', reason: 'storage-unavailable' };
  }
  if (raw === null) return { status: 'absent' };
  try {
    const value: unknown = JSON.parse(raw);
    return isStoredToken(value)
      ? { status: 'read', raw, token: value }
      : { status: 'blocked', reason: 'malformed-token' };
  } catch {
    return { status: 'blocked', reason: 'malformed-token' };
  }
}

function serializeToken(token: StoredStorageAdminOwnerToken): string | null {
  try {
    const raw = JSON.stringify(token);
    return isStoredToken(JSON.parse(raw) as unknown) ? raw : null;
  } catch {
    return null;
  }
}

function conflict(
  reason: StorageAdminOwnerTokenBlockedReason,
): StorageAdminOwnerTokenConflict {
  return Object.freeze({ status: 'owner-token-blocked', reason });
}

export function isStorageAdminOwnerTokenConflict(
  value: unknown,
): value is StorageAdminOwnerTokenConflict {
  return value !== null
    && typeof value === 'object'
    && (value as { status?: unknown }).status === 'owner-token-blocked'
    && isBlockedReason((value as { reason?: unknown }).reason);
}

/**
 * Observa somente a disponibilidade pública do lease administrativo.
 *
 * Nenhuma identidade, nonce ou instante atravessa esta fronteira. A inspeção
 * nunca cria, renova, libera ou remove um token; entradas e relógios que não
 * possam ser classificados com segurança falham como indisponíveis.
 */
export function inspectStorageAdminOwnerToken(
  options: InspectStorageAdminOwnerTokenOptions,
): StorageAdminOwnerTokenInspection {
  try {
    if (!isNonEmptyString(options.key)) {
      return Object.freeze({ status: 'unavailable' });
    }

    const now = (options.now ?? Date.now)();
    if (!isFiniteInteger(now)) {
      return Object.freeze({ status: 'unavailable' });
    }

    const read = readToken(options.storage, `${options.key}${OWNER_TOKEN_KEY_SUFFIX}`);
    if (read.status === 'absent') {
      return Object.freeze({ status: 'available' });
    }
    if (read.status === 'blocked') {
      return Object.freeze({
        status: read.reason === 'malformed-token' ? 'malformed' : 'unavailable',
      });
    }

    return Object.freeze({
      status: now >= read.token.expiresAt ? 'expired' : 'busy',
    });
  } catch {
    return Object.freeze({ status: 'unavailable' });
  }
}

class StorageAdminOwnerTokenLeaseImpl implements StorageAdminOwnerTokenLease {
  readonly #storage: StorageLike;
  readonly #tokenKey: string;
  readonly #ownerId: string;
  readonly #operationId: string;
  readonly #operationKind: StorageAdminOwnerTokenOperationKind;
  readonly #now: () => number;
  readonly #nonceFactory: () => string;
  readonly #leaseDurationMs: number;
  readonly #renewWithinMs: number;
  readonly #registry: Map<string, StorageAdminOwnerTokenLeaseImpl>;
  #raw: string;
  #token: StoredStorageAdminOwnerToken;
  #active = true;

  constructor(input: {
    storage: StorageLike;
    tokenKey: string;
    token: StoredStorageAdminOwnerToken;
    raw: string;
    now: () => number;
    nonceFactory: () => string;
    leaseDurationMs: number;
    renewWithinMs: number;
    registry: Map<string, StorageAdminOwnerTokenLeaseImpl>;
  }) {
    this.#storage = input.storage;
    this.#tokenKey = input.tokenKey;
    this.#ownerId = input.token.ownerId;
    this.#operationId = input.token.operationId;
    this.#operationKind = input.token.operationKind;
    this.#now = input.now;
    this.#nonceFactory = input.nonceFactory;
    this.#leaseDurationMs = input.leaseDurationMs;
    this.#renewWithinMs = input.renewWithinMs;
    this.#token = input.token;
    this.#raw = input.raw;
    this.#registry = input.registry;
  }

  belongsTo(
    ownerId: string,
    operationId: string,
    operationKind: StorageAdminOwnerTokenOperationKind,
  ): boolean {
    return this.#ownerId === ownerId
      && this.#operationId === operationId
      && this.#operationKind === operationKind;
  }

  confirm(): StorageAdminOwnerTokenCheck {
    const confirmed = this.confirmExact();
    if (confirmed.status === 'blocked') return confirmed;
    if (confirmed.remainingMs > this.#renewWithinMs) {
      return Object.freeze({ status: 'owned', reason: 'confirmed' });
    }
    return this.renew();
  }

  async execute<T>(operation: () => T | Promise<T>): Promise<T> {
    const before = this.confirm();
    if (before.status === 'blocked') throw conflict(before.reason);

    let value: T;
    try {
      value = await operation();
    } catch (error) {
      const afterFailure = this.confirmExact();
      if (afterFailure.status === 'blocked') throw conflict(afterFailure.reason);
      throw error;
    }

    const after = this.confirmExact();
    if (after.status === 'blocked') throw conflict(after.reason);
    return value;
  }

  release(): StorageAdminOwnerTokenRelease {
    const confirmed = this.confirmExact();
    if (confirmed.status === 'blocked') {
      this.deactivate();
      return Object.freeze({ status: 'not-released', reason: confirmed.reason });
    }
    const now = this.readNow();
    if (now === null || now < this.#token.acquiredAt) {
      return Object.freeze({ status: 'not-released', reason: 'clock-invalid' });
    }
    const nonce = this.#nonceFactory();
    if (!isNonEmptyString(nonce)) {
      return Object.freeze({ status: 'not-released', reason: 'invalid-input' });
    }

    // A liberação é representada por um token expirado, não por `removeItem`.
    // Assim um handle ABA nunca remove fisicamente o token que outra aba possa
    // ter adquirido; uma propriedade divergente é detectada antes desta escrita.
    const released: StoredStorageAdminOwnerToken = {
      ...this.#token,
      expiresAt: now,
      nonce,
    };
    const raw = serializeToken(released);
    if (raw === null) {
      return Object.freeze({ status: 'not-released', reason: 'invalid-input' });
    }
    const immediatelyBeforeWrite = this.confirmExact();
    if (immediatelyBeforeWrite.status === 'blocked') {
      this.deactivate();
      return Object.freeze({
        status: 'not-released',
        reason: immediatelyBeforeWrite.reason,
      });
    }
    try {
      this.#storage.setItem(this.#tokenKey, raw);
      if (this.#storage.getItem(this.#tokenKey) !== raw) {
        this.deactivate();
        return Object.freeze({ status: 'not-released', reason: 'readback-diverged' });
      }
    } catch {
      return Object.freeze({ status: 'not-released', reason: 'storage-unavailable' });
    }
    this.#raw = raw;
    this.#token = released;
    this.deactivate();
    return Object.freeze({ status: 'released', reason: 'released' });
  }

  private confirmExact():
    | { status: 'owned'; remainingMs: number }
    | {
        status: 'blocked';
        reason: StorageAdminOwnerTokenBlockedReason;
      } {
    if (!this.#active) return { status: 'blocked', reason: 'lost-ownership' };
    const now = this.readNow();
    if (now === null) return { status: 'blocked', reason: 'clock-invalid' };
    if (now < this.#token.acquiredAt) {
      return { status: 'blocked', reason: 'clock-invalid' };
    }
    const current = readToken(this.#storage, this.#tokenKey);
    if (current.status === 'blocked') return current;
    if (current.status === 'absent') return { status: 'blocked', reason: 'lost-ownership' };
    if (
      current.raw !== this.#raw
      || current.token.ownerId !== this.#ownerId
      || current.token.operationId !== this.#operationId
      || current.token.operationKind !== this.#operationKind
      || current.token.nonce !== this.#token.nonce
    ) {
      return { status: 'blocked', reason: 'lost-ownership' };
    }
    if (now >= current.token.expiresAt) return { status: 'blocked', reason: 'expired' };
    return { status: 'owned', remainingMs: current.token.expiresAt - now };
  }

  private renew(): StorageAdminOwnerTokenCheck {
    const confirmed = this.confirmExact();
    if (confirmed.status === 'blocked') return confirmed;
    const now = this.readNow();
    if (now === null) return Object.freeze({ status: 'blocked', reason: 'clock-invalid' });
    const nonce = this.#nonceFactory();
    if (!isNonEmptyString(nonce)) {
      return Object.freeze({ status: 'blocked', reason: 'invalid-input' });
    }
    const renewed: StoredStorageAdminOwnerToken = {
      ...this.#token,
      expiresAt: now + this.#leaseDurationMs,
      nonce,
    };
    const raw = serializeToken(renewed);
    if (raw === null) {
      return Object.freeze({ status: 'blocked', reason: 'invalid-input' });
    }
    const immediatelyBeforeWrite = this.confirmExact();
    if (immediatelyBeforeWrite.status === 'blocked') {
      this.deactivate();
      return Object.freeze({
        status: 'blocked',
        reason: immediatelyBeforeWrite.reason,
      });
    }
    try {
      this.#storage.setItem(this.#tokenKey, raw);
      if (this.#storage.getItem(this.#tokenKey) !== raw) {
        this.deactivate();
        return Object.freeze({ status: 'blocked', reason: 'readback-diverged' });
      }
    } catch {
      return Object.freeze({ status: 'blocked', reason: 'storage-unavailable' });
    }
    this.#raw = raw;
    this.#token = renewed;
    return Object.freeze({ status: 'owned', reason: 'renewed' });
  }

  private readNow(): number | null {
    try {
      const value = this.#now();
      return isFiniteInteger(value) ? value : null;
    } catch {
      return null;
    }
  }

  private deactivate(): void {
    this.#active = false;
    if (this.#registry.get(this.#tokenKey) === this) {
      this.#registry.delete(this.#tokenKey);
    }
  }
}

export function createStorageAdminOwnerTokenCoordinator(
  options: StorageAdminOwnerTokenCoordinatorOptions,
): StorageAdminOwnerTokenCoordinator {
  const tokenKey = `${options.key}${OWNER_TOKEN_KEY_SUFFIX}`;
  const storage = options.storage;
  const ownerId = options.ownerId ?? defaultOwnerId();
  const now = options.now ?? (() => Date.now());
  const nonceFactory = options.nonceFactory ?? (() => opaqueId('nonce'));
  const operationIdFactory = options.operationIdFactory ?? (() => opaqueId('operation'));
  const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
  const renewWithinMs = options.renewWithinMs ?? DEFAULT_RENEW_WITHIN_MS;
  const target = storage as object;
  let registry = localLeases.get(target);
  if (!registry) {
    registry = new Map();
    localLeases.set(target, registry);
  }

  const configured = isNonEmptyString(options.key)
    && isNonEmptyString(ownerId)
    && Number.isSafeInteger(leaseDurationMs)
    && leaseDurationMs > 0
    && Number.isSafeInteger(renewWithinMs)
    && renewWithinMs >= 0
    && renewWithinMs < leaseDurationMs;

  return Object.freeze({
    createOperationId(): string {
      try {
        return operationIdFactory();
      } catch {
        return '';
      }
    },

    acquire(input: {
      operationId: string;
      operationKind: StorageAdminOwnerTokenOperationKind;
    }): StorageAdminOwnerTokenAcquisition {
      if (
        !configured
        || !isNonEmptyString(input.operationId)
        || !isOperationKind(input.operationKind)
      ) {
        return Object.freeze({ status: 'blocked', reason: 'invalid-input' });
      }

      const cached = registry?.get(tokenKey);
      if (cached?.belongsTo(ownerId, input.operationId, input.operationKind)) {
        const confirmed = cached.confirm();
        if (confirmed.status === 'owned') {
          return Object.freeze({
            status: 'acquired',
            reason: 'already-owned',
            lease: cached,
          });
        }
        registry?.delete(tokenKey);
      }

      let current = readToken(storage, tokenKey);
      if (current.status === 'blocked') {
        return Object.freeze({ status: 'blocked', reason: current.reason });
      }

      let instant: number;
      try {
        instant = now();
      } catch {
        return Object.freeze({ status: 'blocked', reason: 'clock-invalid' });
      }
      if (!isFiniteInteger(instant)) {
        return Object.freeze({ status: 'blocked', reason: 'clock-invalid' });
      }

      if (current.status === 'read' && instant < current.token.expiresAt) {
        if (
          current.token.ownerId !== ownerId
          || current.token.operationId !== input.operationId
          || current.token.operationKind !== input.operationKind
        ) {
          return Object.freeze({ status: 'blocked', reason: 'owned-by-other' });
        }
        const resumed = new StorageAdminOwnerTokenLeaseImpl({
          storage,
          tokenKey,
          token: current.token,
          raw: current.raw,
          now,
          nonceFactory,
          leaseDurationMs,
          renewWithinMs,
          registry: registry as Map<string, StorageAdminOwnerTokenLeaseImpl>,
        });
        registry?.set(tokenKey, resumed);
        return Object.freeze({
          status: 'acquired',
          reason: 'already-owned',
          lease: resumed,
        });
      }

      const nonce = nonceFactory();
      if (!isNonEmptyString(nonce)) {
        return Object.freeze({ status: 'blocked', reason: 'invalid-input' });
      }
      const token: StoredStorageAdminOwnerToken = {
        schemaVersion: OWNER_TOKEN_SCHEMA_VERSION,
        ownerId,
        operationId: input.operationId,
        operationKind: input.operationKind,
        acquiredAt: instant,
        expiresAt: instant + leaseDurationMs,
        nonce,
      };
      const raw = serializeToken(token);
      if (raw === null) {
        return Object.freeze({ status: 'blocked', reason: 'invalid-input' });
      }

      try {
        storage.setItem(tokenKey, raw);
        const readback = storage.getItem(tokenKey);
        if (readback !== raw) {
          return Object.freeze({ status: 'blocked', reason: 'readback-diverged' });
        }
      } catch {
        return Object.freeze({ status: 'blocked', reason: 'storage-unavailable' });
      }

      // Parsear de novo impede que um StorageLike adulterado devolva a mesma
      // string por referência sem que o shape permaneça reconhecível.
      current = readToken(storage, tokenKey);
      if (
        current.status !== 'read'
        || current.raw !== raw
        || current.token.ownerId !== ownerId
        || current.token.operationId !== input.operationId
        || current.token.operationKind !== input.operationKind
        || current.token.nonce !== nonce
      ) {
        return Object.freeze({ status: 'blocked', reason: 'readback-diverged' });
      }

      const lease = new StorageAdminOwnerTokenLeaseImpl({
        storage,
        tokenKey,
        token,
        raw,
        now,
        nonceFactory,
        leaseDurationMs,
        renewWithinMs,
        registry: registry as Map<string, StorageAdminOwnerTokenLeaseImpl>,
      });
      registry?.set(tokenKey, lease);
      return Object.freeze({ status: 'acquired', reason: 'acquired', lease });
    },
  });
}
