import { describe, it, expect } from 'vitest';
import { normalizeText, matchesExerciseSearch } from './exerciseSearch';
import { Exercise } from '../types';
import { MOCK_EXERCISES } from '../mock/exercises';

const makeEx = (partial: Partial<Exercise>): Exercise =>
  ({
    id: 'x',
    name: '',
    thumbnail: '',
    muscleGroup: 'triceps',
    equipment: '',
    level: 'beginner',
    executionSteps: [],
    postureTips: [],
    breathing: '',
    commonErrors: [],
    errorCorrections: [],
    variations: [],
    substitutions: [],
    safetyWarnings: [],
    ...partial,
  }) as Exercise;

describe('normalizeText', () => {
  it('remove acentos e baixa a caixa', () => {
    expect(normalizeText('Tríceps')).toBe('triceps');
    expect(normalizeText('Glúteos')).toBe('gluteos');
    expect(normalizeText('  PUXADA Alta ')).toBe('puxada alta');
  });
});

describe('matchesExerciseSearch', () => {
  it('acha sem acento (triceps -> Tríceps)', () => {
    const ex = makeEx({ name: 'Tríceps Testa com Barra W' });
    expect(matchesExerciseSearch(ex, 'triceps testa')).toBe(true);
    expect(matchesExerciseSearch(ex, 'TRÍCEPS')).toBe(true);
  });

  it('ignora stopwords (coice de triceps)', () => {
    const ex = makeEx({ name: 'Tríceps Coice com Haltere' });
    expect(matchesExerciseSearch(ex, 'coice de triceps')).toBe(true);
  });

  it('acha por apelido em searchTerms (pulley)', () => {
    const ex = makeEx({ name: 'Tríceps Polia com Corda', searchTerms: ['pulley'] });
    expect(matchesExerciseSearch(ex, 'pulley')).toBe(true);
  });

  it('busca vazia casa com tudo', () => {
    expect(matchesExerciseSearch(makeEx({ name: 'Qualquer' }), '')).toBe(true);
  });

  it('nao casa quando falta um token', () => {
    const ex = makeEx({ name: 'Supino Reto' });
    expect(matchesExerciseSearch(ex, 'supino inclinado')).toBe(false);
  });
});

// Integração: os exercícios tradicionais citados no GOAL-15 precisam aparecer na busca.
describe('biblioteca real acha os exercícios tradicionais (GOAL-15)', () => {
  const find = (q: string) => MOCK_EXERCISES.filter((ex) => matchesExerciseSearch(ex, q));

  const cases: Array<[string, (ex: Exercise) => boolean]> = [
    ['triceps pulley', (ex) => ex.muscleGroup === 'triceps'],
    ['triceps corda', (ex) => ex.muscleGroup === 'triceps'],
    ['triceps na polia', (ex) => ex.muscleGroup === 'triceps'],
    ['triceps frances', (ex) => ex.muscleGroup === 'triceps'],
    ['triceps testa', (ex) => ex.muscleGroup === 'triceps'],
    ['triceps maquina', (ex) => ex.id === 'triceps_maquina'],
    ['extensao de triceps na maquina', (ex) => ex.id === 'triceps_maquina'],
    ['remada maquina sentada', (ex) => ex.muscleGroup === 'back'],
    ['remada baixa', (ex) => ex.muscleGroup === 'back'],
    ['remada articulada', (ex) => ex.muscleGroup === 'back'],
    ['puxada alta', (ex) => ex.muscleGroup === 'back'],
    ['pulldown', (ex) => ex.muscleGroup === 'back'],
  ];

  it.each(cases)('busca "%s" retorna resultado esperado', (query, predicate) => {
    const results = find(query);
    expect(results.length, `sem resultados para "${query}"`).toBeGreaterThan(0);
    expect(results.some(predicate), `nenhum resultado adequado para "${query}"`).toBe(true);
  });
});
