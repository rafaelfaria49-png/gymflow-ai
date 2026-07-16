import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadStateResult, saveStateResult } from './storage';
import { mergePersistedState } from './storage-migrations';
import type { PersistedState, StorageLike } from './storage-types';

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const fixtures = [
  'gymflow-state-v1-basic.json',
  'gymflow-state-v1-active-workout.json',
  'gymflow-state-v1-heavy-usage.json',
];

function readFixture(name: string): { v: number; savedAt: string; data: PersistedState } {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs/audit/fixtures', name), 'utf8'));
}

describe('fixtures auditadas como golden inputs', () => {
  for (const name of fixtures) {
    it(`${name} valida e sobrevive ao roundtrip`, () => {
      const fixture = readFixture(name);
      const storage = new MemoryStorage();
      storage.setItem('gymflow:state:v1', JSON.stringify(fixture));
      const loaded = loadStateResult<PersistedState>('gymflow:state:v1', storage);
      expect(loaded.status).toBe('ok');
      if (loaded.status !== 'ok') return;
      expect(saveStateResult('gymflow:copy:v1', loaded.value, storage).ok).toBe(true);
      const copy = loadStateResult<PersistedState>('gymflow:copy:v1', storage);
      expect(copy.status).toBe('ok');
      if (copy.status === 'ok') expect(copy.value).toEqual(fixture.data);
    });
  }

  it('preserva treino ativo, timer, histórico e programas customizados', () => {
    const active = readFixture('gymflow-state-v1-active-workout.json').data;
    const heavy = readFixture('gymflow-state-v1-heavy-usage.json').data;
    expect(active.activeWorkout?.id).toBeTruthy();
    expect(active.activeWorkoutStartedAt).toBeTypeOf('number');
    expect(active.restTimerEndAt).toBeTypeOf('number');
    expect(heavy.workoutHistory.length).toBeGreaterThan(0);
    expect(heavy.customPrograms.length).toBeGreaterThan(0);
    expect(mergePersistedState(heavy, { favoriteExercises: [] }).favoriteExercises).toEqual([]);
  });

  it('mantém as três fixtures anonimizadas', () => {
    const combined = fixtures.map((name) => fs.readFileSync(
      path.join(process.cwd(), 'docs/audit/fixtures', name),
      'utf8',
    )).join('\n');
    const emails = combined.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g) ?? [];
    expect(emails.every((email) => email.endsWith('@example.invalid'))).toBe(true);
    expect(combined).not.toMatch(/joao\.silva|outlook\.com|gmail\.com/i);
  });
});
