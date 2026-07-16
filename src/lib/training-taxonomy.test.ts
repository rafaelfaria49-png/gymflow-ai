import { describe, expect, it } from 'vitest';
import type { Exercise } from '../types';
import {
  LEGACY_MUSCLE_GROUP_MAP,
  MOVEMENT_PATTERNS,
  MUSCLE_GROUPS,
  findMovementPatternByAlias,
  getMovementPatternDefinition,
  getMuscleGroupDefinition,
  normalizeTaxonomyText,
  resolveLegacyMuscleGroup,
  validateTrainingTaxonomy,
} from './training-taxonomy';

describe('normalizeTaxonomyText', () => {
  it.each([
    ['Tríceps Pulley', 'triceps pulley'],
    ['  PUXADOR   Articulado ', 'puxador articulado'],
    ['Leg Press 90°', 'leg press 90'],
    ['Rosca Scott', 'rosca scott'],
    ['Máquina de Glúteo', 'maquina de gluteo'],
    ['Crucifixo Inclinado / Máquina', 'crucifixo inclinado maquina'],
    ['barra-W — 45°', 'barra w 45'],
    ['Polia (Crossover)', 'polia crossover'],
    ['', ''],
  ])('normaliza %j de forma previsível', (input, expected) => {
    expect(normalizeTaxonomyText(input)).toBe(expected);
    expect(normalizeTaxonomyText(normalizeTaxonomyText(input))).toBe(expected);
  });
});

describe('taxonomia muscular', () => {
  it('tem IDs únicos, labels PT-BR e ordem única', () => {
    expect(new Set(MUSCLE_GROUPS.map((group) => group.id)).size).toBe(MUSCLE_GROUPS.length);
    expect(new Set(MUSCLE_GROUPS.map((group) => group.order)).size).toBe(MUSCLE_GROUPS.length);
    expect(MUSCLE_GROUPS.every((group) => group.label.trim().length > 0)).toBe(true);
  });

  it('mantém legs genérico e converte abs para core', () => {
    expect(LEGACY_MUSCLE_GROUP_MAP.legs).toBe('legs_general');
    expect(LEGACY_MUSCLE_GROUP_MAP.abs).toBe('core');
    expect(resolveLegacyMuscleGroup('LEGS')?.id).toBe('legs_general');
    expect(resolveLegacyMuscleGroup('Abs')?.id).toBe('core');
  });

  it('resolve todos os 12 grupos atuais', () => {
    const current = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'glutes', 'abs', 'cardio', 'calves', 'functional', 'mobility'];
    expect(current.map((value) => resolveLegacyMuscleGroup(value)?.id)).not.toContain(undefined);
  });

  it('inclui grupos específicos justificados para curadoria futura', () => {
    for (const id of ['quadriceps', 'hamstrings', 'adductors', 'abductors', 'lower_back', 'forearms', 'traps'] as const) {
      expect(getMuscleGroupDefinition(id)?.label).toBeTruthy();
    }
  });
});

describe('padrões de movimento', () => {
  it('possui os 25 padrões mínimos, com IDs únicos, label e descrição', () => {
    expect(MOVEMENT_PATTERNS).toHaveLength(25);
    expect(new Set(MOVEMENT_PATTERNS.map((pattern) => pattern.id)).size).toBe(MOVEMENT_PATTERNS.length);
    expect(MOVEMENT_PATTERNS.every((pattern) => pattern.label.trim() && pattern.description.trim())).toBe(true);
  });

  it('faz lookup por ID e alias sem inventar desconhecidos', () => {
    expect(getMovementPatternDefinition('hip_hinge')?.label).toBe('Dobradiça de quadril');
    expect(findMovementPatternByAlias('PULldown')?.id).toBe('vertical_pull');
    expect(findMovementPatternByAlias('elevação lateral')?.id).toBe('shoulder_abduction');
    expect(findMovementPatternByAlias('movimento parecido com remada talvez')).toBeUndefined();
  });

  it('passa na validação canônica sem colisões', () => {
    const report = validateTrainingTaxonomy();
    expect(report.valid, JSON.stringify(report.errors)).toBe(true);
    expect(report.collisions).toEqual([]);
  });
});

describe('compatibilidade do tipo Exercise', () => {
  const legacyExercise = {
    id: 'legacy',
    name: 'Exercício legado',
    thumbnail: '',
    muscleGroup: 'legs',
    equipment: 'Peso Corporal',
    level: 'beginner',
    executionSteps: [],
    postureTips: [],
    breathing: '',
    commonErrors: [],
    errorCorrections: [],
    variations: [],
    substitutions: [],
    safetyWarnings: [],
  } satisfies Exercise;

  it('aceita o shape antigo sem metadados estruturados', () => {
    expect(legacyExercise.id).toBe('legacy');
    expect('equipmentIds' in legacyExercise).toBe(false);
  });

  it('aceita todos os novos metadados como opcionais', () => {
    const structured: Exercise = {
      ...legacyExercise,
      primaryMuscleGroupId: 'legs_general',
      secondaryMuscleGroupIds: ['glutes', 'core'],
      movementPatternIds: ['squat'],
      equipmentIds: ['bodyweight'],
      mechanics: 'compound',
      laterality: 'bilateral',
      bodyPosition: 'standing',
    };
    expect(structured.movementPatternIds).toEqual(['squat']);
  });
});
