import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadStateResult, STORAGE_BACKUP_SUFFIX } from './storage';
import {
  commitStorageImport,
  createStorageExport,
  inspectStorageImport,
  MAX_IMPORT_BYTES,
} from './storage-export';
import type { PersistedState, StorageLike } from './storage-types';

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const KEY = 'gymflow:state:v1';
const rawFixture = fs.readFileSync(
  path.join(process.cwd(), 'docs/audit/fixtures/gymflow-state-v1-active-workout.json'),
  'utf8',
);

describe('exportação e importação local', () => {
  it('exporta envelope validado com nome, formato e tamanho', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, rawFixture);
    const result = createStorageExport(KEY, storage, new Date('2026-07-16T14:05:00.000Z'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filename).toBe('gymflow-backup-2026-07-16-1405.json');
    expect(result.bytes).toBeGreaterThan(0);
    expect(JSON.parse(result.content).format).toBe('gymflow-backup');
  });

  it('inspeciona import válido sem alterar o storage', () => {
    const source = new MemoryStorage();
    source.setItem(KEY, rawFixture);
    const exported = createStorageExport(KEY, source);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const target = new MemoryStorage();
    target.setItem(KEY, rawFixture.replace('session_fixture_active_001', 'current_session'));
    const before = target.getItem(KEY);
    const inspection = inspectStorageImport(exported.content, exported.bytes);
    expect(inspection.ok).toBe(true);
    if (inspection.ok) {
      expect(inspection.preview.hasActiveWorkout).toBe(true);
      expect(inspection.preview.bytes).toBe(exported.bytes);
    }
    expect(target.getItem(KEY)).toBe(before);
  });

  it('importa após confirmação lógica e cria backup do estado anterior', () => {
    const source = new MemoryStorage();
    source.setItem(KEY, rawFixture);
    const exported = createStorageExport(KEY, source);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const target = new MemoryStorage();
    const current = rawFixture.replace('session_fixture_active_001', 'current_session');
    target.setItem(KEY, current);
    const inspection = inspectStorageImport(exported.content, exported.bytes);
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) return;
    const imported = commitStorageImport(KEY, inspection.backup, target);
    expect(imported.ok).toBe(true);
    if (imported.ok) expect(imported.source).toBe('import');
    expect(target.getItem(`${KEY}${STORAGE_BACKUP_SUFFIX}`)).toBe(current);
    const loaded = loadStateResult<PersistedState>(KEY, target);
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') expect(loaded.value.activeWorkout?.id).toBe('session_fixture_active_001');
  });

  it('preserva origem opcional da sessão e do histórico sem mudar o envelope v1', () => {
    const envelope = JSON.parse(rawFixture);
    const sourceOrigin = {
      sourceProgramId: 'program-custom-1',
      sourceProgramDayId: 'program-day-2',
      sourceProgramName: 'Programa de origem',
      sourceProgramDayName: 'Dia 2 — Pernas',
    };
    Object.assign(envelope.data.activeWorkout, sourceOrigin);
    envelope.data.workoutHistory = [{
      ...envelope.data.activeWorkout,
      id: 'session_fixture_history_001',
      duration: 3600,
    }];

    const source = new MemoryStorage();
    source.setItem(KEY, JSON.stringify(envelope));
    const exported = createStorageExport(KEY, source);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const target = new MemoryStorage();
    const inspection = inspectStorageImport(exported.content, exported.bytes);
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) return;
    expect(commitStorageImport(KEY, inspection.backup, target).ok).toBe(true);

    const storedEnvelope = JSON.parse(target.getItem(KEY) ?? '{}');
    expect(storedEnvelope.v).toBe(1);
    const loaded = loadStateResult<PersistedState>(KEY, target);
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') return;
    expect(loaded.value.activeWorkout).toMatchObject(sourceOrigin);
    expect(loaded.value.workoutHistory[0]).toMatchObject(sourceOrigin);
  });

  it('rejeita JSON inválido sem alterar o estado atual', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, rawFixture);
    const before = storage.getItem(KEY);
    expect(inspectStorageImport('{invalid')).toMatchObject({ ok: false, reason: 'invalid-json' });
    expect(storage.getItem(KEY)).toBe(before);
  });

  it('rejeita formato e versão desconhecidos', () => {
    expect(inspectStorageImport(JSON.stringify({ format: 'other' }))).toMatchObject({
      ok: false,
      reason: 'invalid-format',
    });
    expect(inspectStorageImport(JSON.stringify({
      format: 'gymflow-backup',
      formatVersion: 2,
      appStorageVersion: 1,
      exportedAt: new Date().toISOString(),
      envelope: JSON.parse(rawFixture),
    }))).toMatchObject({ ok: false, reason: 'unsupported-version' });
  });

  it('rejeita arquivo maior que 5 MiB', () => {
    expect(inspectStorageImport('{}', MAX_IMPORT_BYTES + 1)).toMatchObject({
      ok: false,
      reason: 'too-large',
    });
  });
});
