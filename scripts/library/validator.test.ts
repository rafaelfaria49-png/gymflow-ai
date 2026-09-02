import { describe, it, expect } from 'vitest';
import { MOCK_EXERCISES } from '../../src/mock/exercises';
import { validateExerciseLibrary } from './validator';

describe('Validador da Biblioteca Ampliada de Exercícios (GOAL-33)', () => {
  it('valida 100% da biblioteca contra regras do GOAL-33 e LIBRARY §1/§5', () => {
    const report = validateExerciseLibrary(MOCK_EXERCISES);

    if (!report.valid) {
      console.error('Erros de validação na biblioteca:', report.errors);
    }

    expect(report.errors, JSON.stringify(report.errors, null, 2)).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.totalExercises).toBeGreaterThanOrEqual(175);
  });
});
