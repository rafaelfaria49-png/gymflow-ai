import { loadStateResult, saveEnvelopeResult, utf8Bytes } from './storage';
import {
  CURRENT_STORAGE_VERSION,
  type GymFlowBackupFile,
  type PersistedState,
  type StorageImportPreview,
  type StorageLike,
  type StorageWriteResult,
} from './storage-types';
import { errorMessage, isRecord, validateEnvelope } from './storage-validation';

export const STORAGE_EXPORT_FORMAT_VERSION = 1 as const;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type StorageExportResult =
  | { ok: true; content: string; filename: string; bytes: number; backup: GymFlowBackupFile<PersistedState> }
  | { ok: false; error: string };

export type StorageImportInspection =
  | {
      ok: true;
      backup: GymFlowBackupFile<PersistedState>;
      preview: StorageImportPreview;
    }
  | { ok: false; reason: 'too-large' | 'invalid-json' | 'invalid-format' | 'unsupported-version' | 'invalid-envelope'; error: string };

function timestampForFilename(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', '-').replace(':', '');
}

export function createStorageExport(
  key: string,
  storage?: StorageLike,
  now = new Date(),
): StorageExportResult {
  const loaded = loadStateResult<PersistedState>(key, storage);
  if (loaded.status !== 'ok') {
    return { ok: false, error: 'Não há um envelope v1 válido para exportar.' };
  }

  const backup: GymFlowBackupFile<PersistedState> = {
    format: 'gymflow-backup',
    formatVersion: STORAGE_EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    appStorageVersion: CURRENT_STORAGE_VERSION,
    envelope: loaded.envelope,
  };
  const content = JSON.stringify(backup, null, 2);
  return {
    ok: true,
    content,
    filename: `gymflow-backup-${timestampForFilename(now)}.json`,
    bytes: utf8Bytes(content),
    backup,
  };
}

export function inspectStorageImport(raw: string, declaredBytes = utf8Bytes(raw)): StorageImportInspection {
  const bytes = Math.max(declaredBytes, utf8Bytes(raw));
  if (bytes > MAX_IMPORT_BYTES) {
    return { ok: false, reason: 'too-large', error: 'O arquivo excede o limite de 5 MiB.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, reason: 'invalid-json', error: errorMessage(error, 'JSON inválido.') };
  }

  if (!isRecord(parsed) || parsed.format !== 'gymflow-backup') {
    return { ok: false, reason: 'invalid-format', error: 'Formato de backup desconhecido.' };
  }
  if (parsed.formatVersion !== STORAGE_EXPORT_FORMAT_VERSION || parsed.appStorageVersion !== CURRENT_STORAGE_VERSION) {
    return { ok: false, reason: 'unsupported-version', error: 'Versão de backup não suportada.' };
  }
  if (typeof parsed.exportedAt !== 'string' || Number.isNaN(Date.parse(parsed.exportedAt))) {
    return { ok: false, reason: 'invalid-format', error: 'Data de exportação inválida.' };
  }
  if (!validateEnvelope<PersistedState>(parsed.envelope)) {
    return { ok: false, reason: 'invalid-envelope', error: 'O envelope importado é inválido.' };
  }

  const backup = parsed as unknown as GymFlowBackupFile<PersistedState>;
  const data = backup.envelope.data;
  return {
    ok: true,
    backup,
    preview: {
      exportedAt: backup.exportedAt,
      savedAt: backup.envelope.savedAt,
      workoutSessions: Array.isArray(data.workoutHistory) ? data.workoutHistory.length : 0,
      hasActiveWorkout: Boolean(data.activeWorkout),
      customPrograms: Array.isArray(data.customPrograms) ? data.customPrograms.length : 0,
      bytes,
    },
  };
}

export function commitStorageImport(
  key: string,
  backup: GymFlowBackupFile<PersistedState>,
  storage?: StorageLike,
): StorageWriteResult<PersistedState> {
  if (
    backup.format !== 'gymflow-backup'
    || backup.formatVersion !== STORAGE_EXPORT_FORMAT_VERSION
    || backup.appStorageVersion !== CURRENT_STORAGE_VERSION
    || !validateEnvelope<PersistedState>(backup.envelope)
  ) {
    return { ok: false, reason: 'validation', error: 'O backup deixou de ser válido antes da confirmação.' };
  }
  return saveEnvelopeResult(key, backup.envelope, {
    storage,
    allowOverwriteInvalid: true,
    source: 'import',
  });
}

export function createRawRecoveryExport(raw: string, now = new Date()): {
  content: string;
  filename: string;
  bytes: number;
} {
  return {
    content: raw,
    filename: `gymflow-recovery-${timestampForFilename(now)}.json`,
    bytes: utf8Bytes(raw),
  };
}

export function downloadTextFile(content: string, filename: string, mimeType = 'application/json'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
