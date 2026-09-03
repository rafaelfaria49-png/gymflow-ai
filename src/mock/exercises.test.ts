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

import { LOTE_6_EXPANSION } from '../../scripts/library/curation-data/lote6';
import { LOTE_7_EXPANSION } from '../../scripts/library/curation-data/lote7';

describe('biblioteca de exercícios (GOAL-09 & GOAL-33)', () => {
  it('tem pelo menos 175 exercícios reais (GOAL-33)', () => {
    expect(MOCK_EXERCISES.length).toBeGreaterThanOrEqual(175);
  });

  it('tem IDs únicos', () => {
    const ids = MOCK_EXERCISES.map((ex) => ex.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('todo exercício tem nome, grupo muscular, equipamento e instruções completas', () => {
    for (const ex of MOCK_EXERCISES) {
      expect(ex.name, `${ex.id}: nome ausente`).toBeTruthy();
      expect(ex.muscleGroup, `${ex.id}: muscleGroup ausente`).toBeTruthy();
      expect(ex.equipment, `${ex.id}: equipment ausente`).toBeTruthy();
      expect(ex.executionSteps.length, `${ex.id}: sem instruções`).toBeGreaterThan(0);
      expect(ex.level, `${ex.id}: level ausente`).toBeTruthy();
    }
  });

  it('não contém placeholders nem exercícios gerados por loop', () => {
    for (const ex of MOCK_EXERCISES) {
      expect(ex.id, 'id gerado por loop').not.toMatch(/^extra_/);
      expect(ex.name.toLowerCase()).not.toContain('exercício extra');
    }
  });

  it('exercícios curados têm imagem local existente; novos sem foto usam fallback honesto', () => {
    // GOAL-15 & GOAL-33: exercícios adicionados sem foto real (images: []) renderizam o
    // fallback honesto (AvatarDemoPlaceholder). Lista fixada para travar o escopo
    // e evitar regressão silenciosa quando o próximo lote de fotos chegar.
    const pending = MOCK_EXERCISES.filter((ex) => !ex.images || ex.images.length === 0)
      .map((ex) => ex.id)
      .sort();
    const expectedPending = [
      'triceps_maquina',
      ...LOTE_6_EXPANSION.map((e) => e.id),
      ...LOTE_7_EXPANSION.map((e) => e.id),
    ].sort();
    expect(pending).toEqual(expectedPending);

    for (const ex of MOCK_EXERCISES) {
      if (!ex.images || ex.images.length === 0) continue; // aguardando foto (fallback honesto)
      const first = ex.images[0];
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
