import { describe, expect, it } from 'vitest';
import {
  CURRENT_STORAGE_VERSION,
  flushState,
  loadBackupResult,
  loadStateResult,
  restoreBackup,
  saveStateResult,
  STORAGE_BACKUP_SUFFIX,
  STORAGE_QUARANTINE_SUFFIX,
} from './storage';
import type { StorageLike } from './storage-types';

class MemoryStorage implements StorageLike {
  protected values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const KEY = 'gymflow:state:v1';
const envelope = (data: unknown, savedAt = '2026-07-16T12:00:00.000Z') => JSON.stringify({
  v: CURRENT_STORAGE_VERSION,
  savedAt,
  data,
});

describe('storage v1 seguro', () => {
  it('carrega um envelope v1 válido', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, envelope({ favoriteExercises: [] }));
    const result = loadStateResult<{ favoriteExercises: string[] }>(KEY, storage);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.value.favoriteExercises).toEqual([]);
  });

  it('faz roundtrip save/load com readback verificado', () => {
    const storage = new MemoryStorage();
    const write = saveStateResult(KEY, { workoutHistory: [{ id: 'session_1' }] }, storage);
    expect(write.ok).toBe(true);
    const loaded = loadStateResult<{ workoutHistory: { id: string }[] }>(KEY, storage);
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') expect(loaded.value.workoutHistory[0].id).toBe('session_1');
  });

  it('distingue estado vazio', () => {
    expect(loadStateResult(KEY, new MemoryStorage())).toEqual({ status: 'empty' });
  });

  it('preserva e coloca JSON corrompido em quarentena', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, '{invalid');
    const result = loadStateResult(KEY, storage);
    expect(result.status).toBe('corrupt');
    expect(storage.getItem(KEY)).toBe('{invalid');
    expect(storage.getItem(`${KEY}${STORAGE_QUARANTINE_SUFFIX}`)).toContain('"raw":"{invalid"');
  });

  it('distingue envelope v1 estruturalmente inválido', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify({ v: 1, savedAt: 'not-a-date', data: {} }));
    expect(loadStateResult(KEY, storage).status).toBe('corrupt');
  });

  it('distingue versão desconhecida sem apagar o original', () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({ v: 99, savedAt: '2026-07-16T12:00:00.000Z', data: {} });
    storage.setItem(KEY, raw);
    const result = loadStateResult(KEY, storage);
    expect(result.status).toBe('unsupported-version');
    if (result.status === 'unsupported-version') expect(result.version).toBe(99);
    expect(storage.getItem(KEY)).toBe(raw);
  });

  it('não sobrescreve conteúdo incompatível sem confirmação', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, '{invalid');
    const write = saveStateResult(KEY, { user: null }, storage);
    expect(write).toMatchObject({ ok: false, reason: 'blocked' });
    expect(storage.getItem(KEY)).toBe('{invalid');
  });

  it('retorna quota sem derrubar o chamador', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota cheia', 'QuotaExceededError');
      },
      removeItem: () => undefined,
    };
    expect(saveStateResult(KEY, { user: null }, storage)).toMatchObject({ ok: false, reason: 'quota' });
  });

  it('retorna indisponível quando a leitura falha', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('leitura negada');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(loadStateResult(KEY, storage)).toEqual({ status: 'unavailable', error: 'leitura negada' });
  });

  it('mantém como backup o envelope válido anterior', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, envelope({ favoriteExercises: ['old'] }, '2026-07-15T12:00:00.000Z'));
    expect(saveStateResult(KEY, { favoriteExercises: ['new'] }, storage).ok).toBe(true);
    const backup = loadBackupResult<{ favoriteExercises: string[] }>(KEY, storage);
    expect(backup.status).toBe('ok');
    if (backup.status === 'ok') expect(backup.value.favoriteExercises).toEqual(['old']);
  });

  it('nunca troca backup válido por dado corrompido', () => {
    const storage = new MemoryStorage();
    const backupRaw = envelope({ favoriteExercises: ['safe'] }, '2026-07-14T12:00:00.000Z');
    storage.setItem(`${KEY}${STORAGE_BACKUP_SUFFIX}`, backupRaw);
    storage.setItem(KEY, '{invalid');
    expect(saveStateResult(KEY, { favoriteExercises: ['new'] }, storage)).toMatchObject({ ok: false, reason: 'blocked' });
    expect(storage.getItem(`${KEY}${STORAGE_BACKUP_SUFFIX}`)).toBe(backupRaw);
  });

  it('restaura backup válido sem perder a cópia durante a operação', () => {
    const storage = new MemoryStorage();
    const backupRaw = envelope({ favoriteExercises: ['restored'] }, '2026-07-14T12:00:00.000Z');
    storage.setItem(KEY, '{invalid');
    storage.setItem(`${KEY}${STORAGE_BACKUP_SUFFIX}`, backupRaw);
    const restored = restoreBackup(KEY, storage);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.source).toBe('backup');
    const loaded = loadStateResult<{ favoriteExercises: string[] }>(KEY, storage);
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') expect(loaded.value.favoriteExercises).toEqual(['restored']);
    expect(storage.getItem(`${KEY}${STORAGE_BACKUP_SUFFIX}`)).toBe(backupRaw);
  });

  it('depois de restaurar, mantém como backup o estado válido substituído', () => {
    const storage = new MemoryStorage();
    const currentRaw = envelope({ favoriteExercises: ['current'] }, '2026-07-16T12:00:00.000Z');
    const backupRaw = envelope({ favoriteExercises: ['older'] }, '2026-07-15T12:00:00.000Z');
    storage.setItem(KEY, currentRaw);
    storage.setItem(`${KEY}${STORAGE_BACKUP_SUFFIX}`, backupRaw);
    expect(restoreBackup(KEY, storage).ok).toBe(true);
    expect(storage.getItem(`${KEY}${STORAGE_BACKUP_SUFFIX}`)).toBe(currentRaw);
  });

  it('rollback restaura o valor anterior quando o readback difere', () => {
    class MismatchOnceStorage extends MemoryStorage {
      mismatchNextMainWrite = true;
      override setItem(key: string, value: string) {
        if (key === KEY && this.mismatchNextMainWrite) {
          this.mismatchNextMainWrite = false;
          super.setItem(key, `${value}changed`);
          return;
        }
        super.setItem(key, value);
      }
    }
    const storage = new MismatchOnceStorage();
    storage.mismatchNextMainWrite = false;
    const original = envelope({ favoriteExercises: ['old'] });
    storage.setItem(KEY, original);
    storage.mismatchNextMainWrite = true;
    expect(saveStateResult(KEY, { favoriteExercises: ['new'] }, storage)).toMatchObject({
      ok: false,
      reason: 'verification',
      rolledBack: true,
    });
    expect(storage.getItem(KEY)).toBe(original);
  });

  it('flush não salva quando o storage está bloqueado', () => {
    const storage = new MemoryStorage();
    const result = flushState(KEY, { favoriteExercises: ['new'] }, true, storage);
    expect(result).toMatchObject({ ok: false, reason: 'blocked' });
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('reporta falha de serialização discriminada', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(saveStateResult(KEY, circular, new MemoryStorage())).toMatchObject({
      ok: false,
      reason: 'serialization',
    });
  });
});
