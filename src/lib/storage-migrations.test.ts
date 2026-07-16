import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadStateResult } from './storage';
import {
  LEGACY_USER_KEY,
  LEGACY_WEEKLY_PLAN_KEY,
  mergePersistedState,
  migrateLegacyState,
} from './storage-migrations';
import type { PersistedState, StorageLike } from './storage-types';

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const KEY = 'gymflow:state:v1';
const fixture = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'docs/audit/fixtures/gymflow-state-v1-basic.json'), 'utf8'),
) as { data: PersistedState };
const defaults = fixture.data;

describe('migração legada segura', () => {
  it('migra, verifica e só então remove as chaves de origem', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_USER_KEY, JSON.stringify(defaults.user));
    storage.setItem(LEGACY_WEEKLY_PLAN_KEY, JSON.stringify([]));
    const result = migrateLegacyState(KEY, defaults, storage);
    expect(result.status).toBe('migrated');
    expect(storage.getItem(LEGACY_USER_KEY)).toBeNull();
    expect(storage.getItem(LEGACY_WEEKLY_PLAN_KEY)).toBeNull();
    const loaded = loadStateResult<PersistedState>(KEY, storage);
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') expect(loaded.value.weeklyPlan).toEqual([]);
  });

  it('falha sem apagar a origem quando a gravação não cabe', () => {
    class QuotaStorage extends MemoryStorage {
      override setItem(key: string, value: string) {
        if (key === KEY) throw new DOMException('quota', 'QuotaExceededError');
        super.setItem(key, value);
      }
    }
    const storage = new QuotaStorage();
    storage.setItem(LEGACY_USER_KEY, JSON.stringify(defaults.user));
    const result = migrateLegacyState(KEY, defaults, storage);
    expect(result.status).toBe('write-failed');
    expect(storage.getItem(LEGACY_USER_KEY)).not.toBeNull();
  });

  it('é idempotente quando o envelope atual já existe', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify({ v: 1, savedAt: '2026-07-16T12:00:00.000Z', data: defaults }));
    storage.setItem(LEGACY_USER_KEY, JSON.stringify({ id: 'stale' }));
    const result = migrateLegacyState(KEY, defaults, storage);
    expect(result.status).toBe('already-current');
    expect(storage.getItem(LEGACY_USER_KEY)).not.toBeNull();
  });

  it('mantém arrays vazios durante a hidratação pura', () => {
    const merged = mergePersistedState(defaults, {
      weeklyPlan: [],
      workoutHistory: [],
      weightHistory: [],
      measurementsHistory: [],
      achievements: [],
      challenges: [],
    });
    expect(merged.weeklyPlan).toEqual([]);
    expect(merged.weightHistory).toEqual([]);
    expect(merged.achievements).toEqual([]);
  });

  it('recusa legado malformado sem apagar as chaves', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_USER_KEY, '{invalid');
    expect(migrateLegacyState(KEY, defaults, storage).status).toBe('invalid-legacy');
    expect(storage.getItem(LEGACY_USER_KEY)).toBe('{invalid');
  });
});
