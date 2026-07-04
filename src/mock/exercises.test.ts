import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { MOCK_EXERCISES } from './exercises';
import { MOCK_PROGRAMS } from './programs';

// GOAL-09: validação da biblioteca real de exercícios.
// Garante que nenhum programa aponta para exercício inexistente e que a
// biblioteca não regrediu para placeholders/loops geradores.

const ids = new Set(MOCK_EXERCISES.map((e) => e.id));
const PUBLIC_DIR = path.join(process.cwd(), 'public');

describe('biblioteca de exercícios (GOAL-09)', () => {
  it('tem pelo menos 120 exercícios reais', () => {
    expect(MOCK_EXERCISES.length).toBeGreaterThanOrEqual(120);
  });

  it('tem IDs únicos', () => {
    expect(ids.size).toBe(MOCK_EXERCISES.length);
  });

  it('todo exercício tem nome, grupo muscular, equipamento e instruções completas', () => {
    for (const ex of MOCK_EXERCISES) {
      expect(ex.name.trim().length, ex.id).toBeGreaterThan(3);
      expect(ex.muscleGroup, ex.id).toBeTruthy();
      expect(ex.equipment.trim().length, ex.id).toBeGreaterThan(0);
      expect(ex.executionSteps.length, `${ex.id}: passos de execução`).toBeGreaterThanOrEqual(3);
      expect(ex.postureTips.length, `${ex.id}: dicas de postura`).toBeGreaterThanOrEqual(1);
      expect(ex.breathing.trim().length, `${ex.id}: respiração`).toBeGreaterThan(0);
      expect(ex.commonErrors.length, `${ex.id}: erros comuns`).toBeGreaterThanOrEqual(1);
      expect(ex.errorCorrections.length, `${ex.id}: correções`).toBeGreaterThanOrEqual(1);
    }
  });

  it('não contém placeholders nem exercícios gerados por loop', () => {
    for (const ex of MOCK_EXERCISES) {
      expect(ex.id, 'id gerado por loop').not.toMatch(/^extra_/);
      expect(ex.name.toLowerCase()).not.toContain('exercício extra');
      expect(ex.name.toLowerCase()).not.toContain('placeholder');
    }
  });

  it('todo exercício tem pelo menos 1 imagem local existente em public/', () => {
    for (const ex of MOCK_EXERCISES) {
      expect(ex.images && ex.images.length, `${ex.id}: sem images`).toBeGreaterThanOrEqual(1);
      const first = ex.images![0];
      expect(first, ex.id).toMatch(/^\/assets\/exercises\//);
      expect(existsSync(path.join(PUBLIC_DIR, first)), `${ex.id}: imagem ausente em ${first}`).toBe(true);
    }
  });

  it('todas as substituições apontam para exercícios existentes', () => {
    for (const ex of MOCK_EXERCISES) {
      for (const sub of ex.substitutions) {
        expect(ids.has(sub), `${ex.id} -> substituição inexistente "${sub}"`).toBe(true);
      }
    }
  });

  it('todos os slots e listas legadas dos programas apontam para exercícios existentes', () => {
    for (const program of MOCK_PROGRAMS) {
      for (const item of program.exercises) {
        expect(ids.has(item.exerciseId), `${program.id} (lista legada) -> "${item.exerciseId}"`).toBe(true);
      }
      for (const week of program.weeks) {
        for (const day of week.days) {
          for (const slot of day.slots) {
            expect(ids.has(slot.exerciseId), `${program.id}/${day.id} -> "${slot.exerciseId}"`).toBe(true);
          }
        }
      }
    }
  });
});
