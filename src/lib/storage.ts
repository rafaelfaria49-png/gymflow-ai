import {
  CURRENT_STORAGE_VERSION,
  type StorageClearResult,
  type StorageEnvelope,
  type StorageLike,
  type StorageLoadResult,
  type StorageWriteFailureReason,
  type StorageWriteResult,
  type StorageWriteSource,
} from './storage-types';
import { errorMessage, parseEnvelope, validateEnvelope } from './storage-validation';

export {
  CURRENT_STORAGE_VERSION,
  EXTERNAL_BACKUP_FORMAT_VERSION,
  HYBRID_STORAGE_VERSION,
  MONOLITHIC_STORAGE_VERSION,
} from './storage-types';
export type { StorageEnvelope, StorageLike, StorageLoadResult, StorageWriteResult } from './storage-types';

export const STORAGE_BACKUP_SUFFIX = ':backup';
export const STORAGE_QUARANTINE_SUFFIX = ':quarantine';

export interface SaveEnvelopeOptions {
  allowOverwriteInvalid?: boolean;
  backupCurrent?: boolean;
  source?: StorageWriteSource;
  storage?: StorageLike;
}

function browserStorage(): StorageLike | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function classifyStorageFailure(error: unknown): StorageWriteFailureReason {
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : '';
  const message = errorMessage(error, '').toLowerCase();
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || message.includes('quota')) {
    return 'quota';
  }
  return 'unavailable';
}

function quarantineRaw(storage: StorageLike, key: string, raw: string, reason: string): boolean {
  try {
    storage.setItem(
      `${key}${STORAGE_QUARANTINE_SUFFIX}`,
      JSON.stringify({ capturedAt: new Date().toISOString(), reason, raw }),
    );
    return true;
  } catch {
    return false;
  }
}

export function loadStateResult<T>(
  key: string,
  storage: StorageLike | undefined = browserStorage(),
): StorageLoadResult<T> {
  if (!storage) return { status: 'unavailable', error: 'localStorage indisponível neste ambiente.' };

  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch (error) {
    return { status: 'unavailable', error: errorMessage(error, 'Falha ao ler o armazenamento local.') };
  }

  if (raw === null) return { status: 'empty' };

  const parsed = parseEnvelope<T>(raw);
  if (parsed.status === 'ok') {
    return { status: 'ok', value: parsed.envelope.data, envelope: parsed.envelope, raw };
  }

  const quarantined = quarantineRaw(storage, key, raw, parsed.status);
  if (parsed.status === 'unsupported-version') {
    return { status: parsed.status, raw, version: parsed.version, quarantined };
  }
  return { status: 'corrupt', raw, error: parsed.error, quarantined };
}

function rollback(storage: StorageLike, key: string, previousRaw: string | null): boolean {
  try {
    if (previousRaw === null) storage.removeItem(key);
    else storage.setItem(key, previousRaw);
    return storage.getItem(key) === previousRaw;
  } catch {
    return false;
  }
}

export function saveEnvelopeResult<T>(
  key: string,
  envelope: StorageEnvelope<T>,
  options: SaveEnvelopeOptions = {},
): StorageWriteResult<T> {
  const storage = options.storage ?? browserStorage();
  if (!storage) return { ok: false, reason: 'unavailable', error: 'localStorage indisponível neste ambiente.' };
  if (!validateEnvelope<T>(envelope)) {
    return { ok: false, reason: 'validation', error: 'O envelope a salvar não é um envelope v1 válido.' };
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(envelope);
  } catch (error) {
    return { ok: false, reason: 'serialization', error: errorMessage(error, 'Falha ao serializar o estado.') };
  }

  const serializedCheck = parseEnvelope<T>(serialized);
  if (serializedCheck.status !== 'ok') {
    return { ok: false, reason: 'serialization', error: 'A serialização não preservou um envelope v1 válido.' };
  }

  let previousRaw: string | null;
  try {
    previousRaw = storage.getItem(key);
  } catch (error) {
    return { ok: false, reason: 'unavailable', error: errorMessage(error, 'Falha ao ler o estado anterior.') };
  }

  if (previousRaw !== null) {
    const previous = parseEnvelope<T>(previousRaw);
    if (previous.status !== 'ok' && !options.allowOverwriteInvalid) {
      quarantineRaw(storage, key, previousRaw, previous.status);
      return {
        ok: false,
        reason: 'blocked',
        error: 'O estado atual é incompatível ou corrompido e exige confirmação antes de ser substituído.',
      };
    }

    if (previous.status === 'ok' && options.backupCurrent !== false) {
      try {
        storage.setItem(`${key}${STORAGE_BACKUP_SUFFIX}`, previousRaw);
      } catch (error) {
        return {
          ok: false,
          reason: classifyStorageFailure(error),
          error: errorMessage(error, 'Falha ao criar o backup anterior.'),
        };
      }
    } else if (previous.status !== 'ok') {
      quarantineRaw(storage, key, previousRaw, previous.status);
    }
  }

  try {
    storage.setItem(key, serialized);
  } catch (error) {
    return {
      ok: false,
      reason: classifyStorageFailure(error),
      error: errorMessage(error, 'Falha ao gravar o estado local.'),
    };
  }

  let readback: string | null;
  try {
    readback = storage.getItem(key);
  } catch (error) {
    const rolledBack = rollback(storage, key, previousRaw);
    return {
      ok: false,
      reason: 'unavailable',
      error: errorMessage(error, 'Falha ao reler o estado gravado.'),
      rolledBack,
    };
  }

  const verified = readback === serialized && readback !== null && parseEnvelope<T>(readback).status === 'ok';
  if (!verified) {
    const rolledBack = rollback(storage, key, previousRaw);
    return {
      ok: false,
      reason: 'verification',
      error: 'O conteúdo relido é diferente do conteúdo gravado.',
      rolledBack,
    };
  }

  return {
    ok: true,
    savedAt: envelope.savedAt,
    bytes: utf8Bytes(serialized),
    envelope,
    source: options.source ?? 'save',
  };
}

export function saveStateResult<T>(
  key: string,
  data: T,
  storage: StorageLike | undefined = browserStorage(),
): StorageWriteResult<T> {
  const envelope: StorageEnvelope<T> = {
    v: CURRENT_STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    data,
  };
  return saveEnvelopeResult(key, envelope, { storage });
}

export function loadBackupResult<T>(
  key: string,
  storage: StorageLike | undefined = browserStorage(),
): StorageLoadResult<T> {
  if (!storage) return { status: 'unavailable', error: 'localStorage indisponível neste ambiente.' };
  let raw: string | null;
  try {
    raw = storage.getItem(`${key}${STORAGE_BACKUP_SUFFIX}`);
  } catch (error) {
    return { status: 'unavailable', error: errorMessage(error, 'Falha ao ler o backup local.') };
  }
  if (raw === null) return { status: 'empty' };
  const parsed = parseEnvelope<T>(raw);
  if (parsed.status === 'ok') {
    return { status: 'ok', value: parsed.envelope.data, envelope: parsed.envelope, raw };
  }
  if (parsed.status === 'unsupported-version') {
    return { status: parsed.status, raw, version: parsed.version, quarantined: false };
  }
  return { status: 'corrupt', raw, error: parsed.error, quarantined: false };
}

export function restoreBackup<T>(
  key: string,
  storage: StorageLike | undefined = browserStorage(),
): StorageWriteResult<T> {
  const resolvedStorage = storage ?? browserStorage();
  const backup = loadBackupResult<T>(key, resolvedStorage);
  if (backup.status !== 'ok') {
    return {
      ok: false,
      reason: backup.status === 'unavailable' ? 'unavailable' : 'validation',
      error: backup.status === 'unavailable' ? backup.error : 'Nenhum backup v1 válido está disponível.',
    };
  }
  const previous = loadStateResult<T>(key, resolvedStorage);
  const restored = saveEnvelopeResult(key, backup.envelope, {
    storage: resolvedStorage,
    allowOverwriteInvalid: true,
    backupCurrent: false,
    source: 'backup',
  });
  // Depois do commit, o estado válido substituído passa a ser o backup rolante.
  // Se essa atualização auxiliar falhar, o backup restaurado anterior permanece válido.
  if (restored.ok && previous.status === 'ok' && resolvedStorage) {
    try {
      resolvedStorage.setItem(`${key}${STORAGE_BACKUP_SUFFIX}`, previous.raw);
    } catch {
      // A restauração principal já foi verificada; manter o backup existente é seguro.
    }
  }
  return restored;
}

export function clearStateResult(
  key: string,
  storage: StorageLike | undefined = browserStorage(),
): StorageClearResult {
  if (!storage) return { ok: false, reason: 'unavailable', error: 'localStorage indisponível neste ambiente.' };
  try {
    storage.removeItem(key);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'unavailable', error: errorMessage(error, 'Falha ao remover o estado local.') };
  }
}

export function flushState<T>(
  key: string,
  data: T,
  blocked: boolean,
  storage: StorageLike | undefined = browserStorage(),
): StorageWriteResult<T> {
  if (blocked) {
    return { ok: false, reason: 'blocked', error: 'Autosave bloqueado para preservar o estado incompatível.' };
  }
  return saveStateResult(key, data, storage);
}

// Compatibilidade com os chamadores anteriores durante a transição.
export function loadState<T>(key: string): T | null {
  const result = loadStateResult<T>(key);
  return result.status === 'ok' || result.status === 'legacy' ? result.value : null;
}

export function saveState<T>(key: string, data: T): void {
  saveStateResult(key, data);
}

export function clearState(key: string): void {
  clearStateResult(key);
}
