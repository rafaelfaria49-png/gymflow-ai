import { describe, expect, it } from 'vitest';
import type { Exercise, ExerciseSlot } from '../types';
import {
  buildDurationWarning,
  estimateWorkoutDuration,
  estimateWorkoutDurationDetailed,
  muscleGroupsForSlots,
} from './workoutDuration';

function slot(overrides: Partial<ExerciseSlot> = {}): ExerciseSlot {
  return {
    exerciseId: 'exercise_1',
    series: 4,
    repRange: [8, 12],
    targetRPE: 8,
    restSec: 120,
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
    equipment: 'Barra e Anilhas',
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
    equipmentIds: ['barbell', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    ...overrides,
  };
}

describe('API legada de duração', () => {
  it('preserva zero exercícios', () => {
    expect(estimateWorkoutDuration([])).toEqual({ minutes: 0, totalSeries: 0, exerciseCount: 0 });
  });

  it('preserva a fórmula anterior para um exercício', () => {
    expect(estimateWorkoutDuration([slot({ series: 3, restSec: 120 })])).toEqual({
      minutes: 8,
      totalSeries: 3,
      exerciseCount: 1,
    });
  });

  it('preserva transição, arredondamento e aquecimento anteriores', () => {
    const slots = [
      slot({ exerciseId: 'a', series: 3, restSec: 90 }),
      slot({ exerciseId: 'b', series: 2, restSec: 60 }),
    ];
    expect(estimateWorkoutDuration(slots)).toEqual({ minutes: 11, totalSeries: 5, exerciseCount: 2 });
    expect(estimateWorkoutDuration(slots, { includeWarmup: true })).toEqual({ minutes: 16, totalSeries: 5, exerciseCount: 2 });
  });

  it('mantém helpers públicos atuais', () => {
    const exercises = [exercise(), exercise({ id: 'exercise_2', muscleGroup: 'back', primaryMuscleGroupId: 'back' })];
    expect(muscleGroupsForSlots([slot(), slot({ exerciseId: 'exercise_2' })], exercises)).toEqual(['chest', 'back']);
    expect(buildDurationWarning(61, 60)).toContain('pode passar de 60 min');
    expect(buildDurationWarning(60, 60)).toBeNull();
  });
});

describe('estimativa detalhada', () => {
  it('retorna breakdown zerado sem exercícios', () => {
    expect(estimateWorkoutDurationDetailed([])).toMatchObject({
      totalMinutes: 0,
      lowerBoundMinutes: 0,
      upperBoundMinutes: 0,
      breakdownByExercise: [],
    });
  });

  it('separa trabalho, descanso, setup e não descansa após a última série', () => {
    const result = estimateWorkoutDurationDetailed([slot()], [exercise()]);
    expect(result).toMatchObject({
      totalSeries: 4,
      exerciseCount: 1,
      workSeconds: 172,
      restSeconds: 360,
      setupSeconds: 90,
      transitionSeconds: 0,
      confidence: 'high',
    });
    expect(result.breakdownByExercise[0].restSeconds).toBe(3 * 120);
    expect(result.lowerBoundMinutes).toBeLessThanOrEqual(result.totalMinutes);
    expect(result.upperBoundMinutes).toBeGreaterThanOrEqual(result.totalMinutes);
  });

  it('usa descansos diferentes por exercício', () => {
    const exercises = [exercise({ id: 'a' }), exercise({ id: 'b', equipmentIds: ['dumbbells'] })];
    const result = estimateWorkoutDurationDetailed([
      slot({ exerciseId: 'a', series: 3, restSec: 180 }),
      slot({ exerciseId: 'b', series: 3, restSec: 60 }),
    ], exercises);
    expect(result.breakdownByExercise.map((item) => item.restSeconds)).toEqual([360, 120]);
  });

  it('prioriza slot, depois exercício, default informado e fallback', () => {
    const withoutRest = slot({ restSec: undefined as unknown as number });
    expect(estimateWorkoutDurationDetailed([slot({ restSec: 70 })], [exercise({ restSec: 80 })])
      .breakdownByExercise[0].restSeconds).toBe(210);
    expect(estimateWorkoutDurationDetailed([withoutRest], [exercise({ restSec: 80 })])
      .breakdownByExercise[0].restSeconds).toBe(240);
    expect(estimateWorkoutDurationDetailed([withoutRest], [exercise()], { defaultRestSeconds: 65 })
      .breakdownByExercise[0].restSeconds).toBe(195);
    expect(estimateWorkoutDurationDetailed([withoutRest], [exercise({ restSec: undefined })], { goal: 'strength' })
      .breakdownByExercise[0].restSeconds).toBe(450);
  });

  it('distingue mesmo equipamento, troca comum e barra/anilhas', () => {
    const same = [exercise({ id: 'a', equipmentIds: ['dumbbells'] }), exercise({ id: 'b', equipmentIds: ['dumbbells'] })];
    const different = [exercise({ id: 'a', equipmentIds: ['dumbbells'] }), exercise({ id: 'b', equipmentIds: ['high_cable_station'] })];
    const barbell = [exercise({ id: 'a', equipmentIds: ['barbell', 'weight_plates'] }), exercise({ id: 'b', equipmentIds: ['seated_row_machine'] })];
    const slots = [slot({ exerciseId: 'a' }), slot({ exerciseId: 'b' })];
    expect(estimateWorkoutDurationDetailed(slots, same).transitionSeconds).toBe(25);
    expect(estimateWorkoutDurationDetailed(slots, different).transitionSeconds).toBe(60);
    expect(estimateWorkoutDurationDetailed(slots, barbell).transitionSeconds).toBe(75);
  });

  it('reserva troca de anilhas mesmo quando dois exercícios usam a mesma barra', () => {
    const exercises = [exercise({ id: 'a' }), exercise({ id: 'b' })];
    const slots = [slot({ exerciseId: 'a' }), slot({ exerciseId: 'b' })];
    expect(estimateWorkoutDurationDetailed(slots, exercises).transitionSeconds).toBe(45);
  });

  it('aplica setup configurado para barra, máquina e cabo', () => {
    expect(estimateWorkoutDurationDetailed([slot()], [exercise()]).setupSeconds).toBe(90);
    expect(estimateWorkoutDurationDetailed([slot()], [exercise({ equipmentIds: ['seated_row_machine'] })]).setupSeconds).toBe(30);
    expect(estimateWorkoutDurationDetailed([slot()], [exercise({ equipmentIds: ['high_cable_station'] })]).setupSeconds).toBe(40);
  });

  it('reduz confidence com equipamento genérico e classificação legada', () => {
    const legacy = exercise({
      primaryMuscleGroupId: undefined,
      equipmentIds: undefined,
      mechanics: undefined,
      equipment: 'Aparelho Leg Press',
      muscleGroup: 'legs',
    });
    const result = estimateWorkoutDurationDetailed([slot()], [legacy]);
    expect(result.confidence).toBe('low');
    expect(result.warnings.join(' ')).toContain('legado');
  });

  it('usa fallback explicável quando repRange está ausente', () => {
    const incomplete = slot({ repRange: undefined as unknown as [number, number] });
    const result = estimateWorkoutDurationDetailed([incomplete], [exercise()]);
    expect(result.workSeconds).toBe(4 * 40);
    expect(result.confidence).toBe('low');
    expect(result.assumptions.join(' ')).toContain('fallback');
  });

  it('interpreta cardio em minutos e core isométrico em segundos', () => {
    const cardioExercise = exercise({ id: 'cardio', muscleGroup: 'cardio', primaryMuscleGroupId: 'cardio', mechanics: 'cardio', equipmentIds: ['treadmill'] });
    const coreExercise = exercise({ id: 'core', muscleGroup: 'abs', primaryMuscleGroupId: 'core', mechanics: 'isolation', equipmentIds: ['exercise_mat'] });
    const cardio = estimateWorkoutDurationDetailed([slot({ exerciseId: 'cardio', series: 1, repRange: [15, 20], restSec: 0 })], [cardioExercise]);
    const core = estimateWorkoutDurationDetailed([slot({ exerciseId: 'core', series: 3, repRange: [30, 60], restSec: 60, progression: 'nenhuma' })], [coreExercise]);
    expect(cardio.workSeconds).toBe(17.5 * 60);
    expect(core.workSeconds).toBe(3 * 45);
  });

  it('inclui aquecimento e preserva bounds coerentes em múltiplos exercícios', () => {
    const exercises = [exercise({ id: 'a' }), exercise({ id: 'b', equipmentIds: ['high_cable_station'] })];
    const result = estimateWorkoutDurationDetailed([
      slot({ exerciseId: 'a', series: 4 }),
      slot({ exerciseId: 'b', series: 4, restSec: 75 }),
    ], exercises, { includeWarmup: true });
    expect(result.warmupSeconds).toBe(300);
    expect(result.totalMinutes).toBeGreaterThan(0);
    expect(result.lowerBoundMinutes).toBeLessThanOrEqual(result.totalMinutes);
    expect(result.upperBoundMinutes).toBeGreaterThanOrEqual(result.totalMinutes);
  });

  it('não muta slots nem exercícios', () => {
    const slots = [slot()];
    const exercises = [exercise()];
    const before = JSON.stringify({ slots, exercises });
    estimateWorkoutDurationDetailed(slots, exercises);
    expect(JSON.stringify({ slots, exercises })).toBe(before);
  });
});
