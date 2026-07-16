import { describe, expect, it } from 'vitest';
import type { Exercise, ExerciseSlot } from '../types';
import {
  calculatePlannedMuscleVolume,
  classifyVolumeAgainstReference,
  estimateSessionCapacity,
  getWeeklyVolumeGuideline,
  resolveTrainingGoalContext,
} from './training-volume';
import { SECONDARY_EXPOSURE_WEIGHT, WEEKLY_VOLUME_REFERENCES } from './training-volume-rules';

function slot(overrides: Partial<ExerciseSlot> = {}): ExerciseSlot {
  return {
    exerciseId: 'exercise_1',
    series: 4,
    repRange: [8, 12],
    targetRPE: 8,
    restSec: 90,
    progression: 'dupla',
    incrementKg: 2.5,
    ...overrides,
  };
}

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'exercise_1',
    name: 'Exercício de teste',
    thumbnail: '',
    muscleGroup: 'chest',
    secondaryMuscles: [],
    equipment: 'Halteres',
    level: 'intermediate',
    executionSteps: [],
    postureTips: [],
    breathing: '',
    commonErrors: [],
    errorCorrections: [],
    variations: [],
    substitutions: [],
    safetyWarnings: [],
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: [],
    equipmentIds: ['dumbbells'],
    mechanics: 'compound',
    ...overrides,
  };
}

describe('faixas semanais de referência', () => {
  it('adapta objetivos atuais e futuros sem mudar UserProfile', () => {
    expect(resolveTrainingGoalContext('hypertrophy')).toBe('hypertrophy');
    expect(resolveTrainingGoalContext('Força')).toBe('strength');
    expect(resolveTrainingGoalContext('emagrecimento')).toBe('conditioning');
    expect(resolveTrainingGoalContext('saúde geral')).toBe('general');
    expect(resolveTrainingGoalContext('mobilidade')).toBe('mobility');
    expect(resolveTrainingGoalContext('retorno')).toBe('return');
    expect(resolveTrainingGoalContext('performance')).toBe('performance');
  });

  it.each(['beginner', 'intermediate', 'advanced', 'athlete'] as const)('retorna razões para %s ativo', (experienceLevel) => {
    const guideline = getWeeklyVolumeGuideline({ muscleGroupId: 'chest', experienceLevel, trainingStatus: 'active' });
    expect(guideline.reference).toEqual(WEEKLY_VOLUME_REFERENCES[experienceLevel].large);
    expect(guideline.reasons.length).toBeGreaterThan(0);
    expect(guideline.confidence).toBe('high');
  });

  it('não atribui volume extremo automaticamente a athlete', () => {
    const advanced = getWeeklyVolumeGuideline({ muscleGroupId: 'back', experienceLevel: 'advanced', trainingStatus: 'active' });
    const athlete = getWeeklyVolumeGuideline({ muscleGroupId: 'back', experienceLevel: 'athlete', trainingStatus: 'active' });
    expect(athlete.reference).toEqual(advanced.reference);
    expect(athlete.reasons.join(' ')).toContain('não recebe volume extremo');
  });

  it('distingue grupo grande, pequeno e core', () => {
    expect(getWeeklyVolumeGuideline({ muscleGroupId: 'chest', experienceLevel: 'intermediate' }).reference)
      .toEqual({ minimum: 8, target: 12, upperReference: 16 });
    expect(getWeeklyVolumeGuideline({ muscleGroupId: 'biceps', experienceLevel: 'intermediate' }).reference)
      .toEqual({ minimum: 6, target: 9, upperReference: 12 });
    expect(getWeeklyVolumeGuideline({ muscleGroupId: 'core', experienceLevel: 'intermediate' }).reference)
      .toEqual({ minimum: 5, target: 8, upperReference: 12 });
  });

  it('não aplica faixa muscular de séries a cardio e mobilidade', () => {
    expect(getWeeklyVolumeGuideline({ muscleGroupId: 'cardio', experienceLevel: 'beginner' }).reference).toBeNull();
    expect(getWeeklyVolumeGuideline({ muscleGroupId: 'mobility', experienceLevel: 'advanced' }).reference).toBeNull();
  });

  it.each([
    ['less_than_1_month', { minimum: 7, target: 11, upperReference: 14 }],
    ['one_to_three_months', { minimum: 6, target: 10, upperReference: 13 }],
    ['three_to_six_months', { minimum: 6, target: 8, upperReference: 11 }],
    ['six_to_twelve_months', { minimum: 5, target: 7, upperReference: 10 }],
    ['more_than_1_year', { minimum: 4, target: 6, upperReference: 8 }],
  ] as const)('aplica modificador explicável para pausa %s', (breakDuration, expected) => {
    const guideline = getWeeklyVolumeGuideline({
      muscleGroupId: 'back',
      experienceLevel: 'intermediate',
      trainingStatus: 'returning',
      breakDuration,
    });
    expect(guideline.experienceLevel).toBe('intermediate');
    expect(guideline.reference).toEqual(expected);
    expect(guideline.reasons.join(' ')).toContain('nível foi preservado');
    expect(guideline.reasons.join(' ')).toContain('heurística');
  });

  it('reduz confidence quando retorno não informa duração da pausa', () => {
    const guideline = getWeeklyVolumeGuideline({
      muscleGroupId: 'back',
      experienceLevel: 'intermediate',
      trainingStatus: 'returning',
    });
    expect(guideline.confidence).toBe('low');
  });

  it('classifica em quatro níveis sem chamar a referência de limite universal', () => {
    const reference = { minimum: 6, target: 9, upperReference: 12 };
    expect(classifyVolumeAgainstReference(4, reference)).toBe('low');
    expect(classifyVolumeAgainstReference(8, reference)).toBe('moderate');
    expect(classifyVolumeAgainstReference(11, reference)).toBe('high');
    expect(classifyVolumeAgainstReference(13, reference)).toBe('very_high');
  });
});

describe('contagem planejada de séries', () => {
  it('separa séries diretas e exposição secundária canônica', () => {
    const result = calculatePlannedMuscleVolume({
      slots: [slot()],
      exercises: [exercise({ secondaryMuscleGroupIds: ['triceps'] })],
    });
    expect(result.secondaryExposureWeight).toBe(SECONDARY_EXPOSURE_WEIGHT);
    expect(result.warmupSets).toBe(0);
    expect(result.muscleVolume).toEqual([
      expect.objectContaining({ muscleGroupId: 'chest', directSets: 4, secondaryExposure: 0, weightedSets: 4 }),
      expect.objectContaining({ muscleGroupId: 'triceps', directSets: 0, secondaryExposure: 2, weightedSets: 2 }),
    ]);
    expect(result.confidence).toBe('high');
  });

  it('usa classificação muscular legada e reduz confidence', () => {
    const legacy = exercise({
      primaryMuscleGroupId: undefined,
      secondaryMuscleGroupIds: undefined,
      muscleGroup: 'back',
      secondaryMuscles: ['Bíceps'],
    });
    const result = calculatePlannedMuscleVolume({ slots: [slot()], exercises: [legacy] });
    expect(result.muscleVolume).toEqual([
      expect.objectContaining({ muscleGroupId: 'back', directSets: 4, confidence: 'medium' }),
      expect.objectContaining({ muscleGroupId: 'biceps', secondaryExposure: 2, confidence: 'medium' }),
    ]);
    expect(result.confidence).toBe('medium');
  });

  it('preserva legs_general sem inventar quadríceps', () => {
    const legacyLegs = exercise({ primaryMuscleGroupId: undefined, muscleGroup: 'legs' });
    const result = calculatePlannedMuscleVolume({ slots: [slot()], exercises: [legacyLegs] });
    expect(result.muscleVolume.map((item) => item.muscleGroupId)).toContain('legs_general');
    expect(result.muscleVolume.map((item) => item.muscleGroupId)).not.toContain('quadriceps');
  });

  it('permite configurar o peso da exposição secundária', () => {
    const result = calculatePlannedMuscleVolume({
      slots: [slot()],
      exercises: [exercise({ secondaryMuscleGroupIds: ['triceps'] })],
      secondaryExposureWeight: 0.25,
    });
    expect(result.muscleVolume.find((item) => item.muscleGroupId === 'triceps')?.secondaryExposure).toBe(1);
  });

  it('multiplica somente quando ocorrências semanais são informadas', () => {
    const once = calculatePlannedMuscleVolume({ slots: [slot()], exercises: [exercise()] });
    const twice = calculatePlannedMuscleVolume({ slots: [slot()], exercises: [exercise()], weeklyOccurrences: 2 });
    expect(once.muscleVolume[0].directSets).toBe(4);
    expect(twice.muscleVolume[0].directSets).toBe(8);
  });

  it('mantém séries desconhecidas separadas e retorna confidence baixa', () => {
    const result = calculatePlannedMuscleVolume({ slots: [slot({ exerciseId: 'missing' })], exercises: [] });
    expect(result.unclassifiedSets).toBe(4);
    expect(result.muscleVolume).toEqual([]);
    expect(result.confidence).toBe('low');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('aceita plano vazio sem inventar volume', () => {
    expect(calculatePlannedMuscleVolume({ slots: [], exercises: [] })).toMatchObject({
      totalWorkingSets: 0,
      warmupSets: 0,
      unclassifiedSets: 0,
      muscleVolume: [],
    });
  });

  it('mantém séries de aquecimento separadas das séries de trabalho', () => {
    const warmupExercise = exercise({ type: 'warmup' });
    const result = calculatePlannedMuscleVolume({ slots: [slot({ series: 3 })], exercises: [warmupExercise] });
    expect(result).toMatchObject({ totalWorkingSets: 0, warmupSets: 3, muscleVolume: [] });
  });

  it('não muta slots nem catálogo', () => {
    const slots = [slot()];
    const exercises = [exercise({ secondaryMuscleGroupIds: ['triceps'] })];
    const before = JSON.stringify({ slots, exercises });
    calculatePlannedMuscleVolume({ slots, exercises });
    expect(JSON.stringify({ slots, exercises })).toBe(before);
  });
});

describe('capacidade aproximada da sessão', () => {
  it.each([
    ['beginner', 'active', 45, 3],
    ['intermediate', 'active', 60, 4],
    ['intermediate', 'returning', 75, 5],
    ['advanced', 'active', 75, 5],
    ['athlete', 'active', 90, 6],
  ] as const)('cobre cenário %s/%s, %i min e %i dias', (experienceLevel, trainingStatus, availableMinutes, _frequency) => {
    expect(_frequency).toBeGreaterThan(0);
    const result = estimateSessionCapacity({
      availableMinutes,
      experienceLevel,
      trainingStatus,
      breakDuration: trainingStatus === 'returning' ? 'three_to_six_months' : undefined,
    });
    expect(result.estimatedWorkingSetCapacity.target).toBeGreaterThan(0);
    expect(result.assumptions.length).toBeGreaterThan(0);
    if (experienceLevel === 'athlete') {
      expect(result.estimatedWorkingSetCapacity.target).toBeLessThanOrEqual(
        estimateSessionCapacity({ availableMinutes, experienceLevel: 'advanced' }).estimatedWorkingSetCapacity.target,
      );
    }
  });

  it.each([
    [30, 11, 2],
    [45, 18, 4],
    [60, 25, 6],
    [75, 32, 8],
    [90, 38, 9],
  ])('produz faixa monotônica para %i minutos', (availableMinutes, expectedSets, expectedExercises) => {
    const result = estimateSessionCapacity({
      availableMinutes,
      experienceLevel: 'intermediate',
      trainingStatus: 'active',
    });
    expect(result.estimatedWorkingSetCapacity.target).toBe(expectedSets);
    expect(result.estimatedExerciseCapacity.target).toBe(expectedExercises);
    expect(result.estimatedWorkingSetCapacity.minimum).toBeLessThanOrEqual(expectedSets);
    expect(result.estimatedWorkingSetCapacity.maximumReference).toBeGreaterThanOrEqual(expectedSets);
  });

  it('considera retorno sem rebaixar o nível', () => {
    const active = estimateSessionCapacity({ availableMinutes: 60, experienceLevel: 'intermediate', trainingStatus: 'active' });
    const returning = estimateSessionCapacity({
      availableMinutes: 60,
      experienceLevel: 'intermediate',
      trainingStatus: 'returning',
      breakDuration: 'three_to_six_months',
    });
    expect(returning.estimatedWorkingSetCapacity.target).toBeLessThan(active.estimatedWorkingSetCapacity.target);
    expect(returning.assumptions.join(' ')).toContain('nível foi preservado');
  });

  it('advanced usa descanso de referência maior sem ganhar volume automático', () => {
    const intermediate = estimateSessionCapacity({ availableMinutes: 60, experienceLevel: 'intermediate' });
    const advanced = estimateSessionCapacity({ availableMinutes: 60, experienceLevel: 'advanced' });
    expect(advanced.estimatedWorkingSetCapacity.target).toBeLessThan(intermediate.estimatedWorkingSetCapacity.target);
  });

  it('retorna confidence alta com médias explícitas e média com defaults', () => {
    expect(estimateSessionCapacity({
      availableMinutes: 60,
      experienceLevel: 'intermediate',
      averageRestSeconds: 90,
      averageSetDurationSeconds: 40,
      averageTransitionSeconds: 60,
    }).confidence).toBe('high');
    expect(estimateSessionCapacity({ availableMinutes: 60, experienceLevel: 'intermediate' }).confidence).toBe('medium');
  });

  it('retorna confidence baixa para retorno ou tempo com dados insuficientes', () => {
    expect(estimateSessionCapacity({
      availableMinutes: 60,
      experienceLevel: 'intermediate',
      trainingStatus: 'returning',
    }).confidence).toBe('low');
    expect(estimateSessionCapacity({ availableMinutes: 0, experienceLevel: 'beginner' })).toMatchObject({
      confidence: 'low',
      availableMinutes: 0,
      estimatedWorkingSetCapacity: { target: 0 },
    });
  });
});
