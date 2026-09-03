import { describe, expect, it } from 'vitest';
import type { Exercise } from '../types';
import {
  bestWorkingSetWeight,
  buildWarmupPlan,
  generateApproachWarmupSets,
  getGeneralWarmupMinutes,
  materializeWarmupSet,
  selectApproachTargets,
} from './warmupEngine';

function exercise(
  id: string,
  movementPatternIds: Exercise['movementPatternIds'],
  overrides: Partial<Exercise> = {},
): Exercise {
  return {
    id,
    name: id,
    thumbnail: '',
    muscleGroup: 'chest',
    equipment: 'Barra',
    level: 'intermediate',
    executionSteps: [],
    postureTips: [],
    breathing: '',
    commonErrors: [],
    errorCorrections: [],
    variations: [],
    substitutions: [],
    safetyWarnings: [],
    mechanics: 'compound',
    secondaryMuscles: ['shoulders'],
    movementPatternIds,
    ...overrides,
  };
}

describe('warmupEngine — objetivo e aproximações', () => {
  it('gera no supino de 80 kg em força a rampa vazia/40/60/80%', () => {
    const sets = generateApproachWarmupSets(80, 'strength');

    expect(sets.map((set) => set.percentage)).toEqual([0, 0.4, 0.6, 0.8]);
    expect(sets.map((set) => set.requestedWeightKg)).toEqual([20, 32, 48, 64]);
    expect(sets.map((set) => set.weightKg)).toEqual([20, 32.5, 47.5, 65]);
    expect(sets.map((set) => set.reps)).toEqual([8, 5, 3, 1]);
    expect(sets[0].isEmptyBar).toBe(true);
  });

  it('usa uma rampa mais curta e mais repetição para hipertrofia', () => {
    const sets = generateApproachWarmupSets(80, 'hypertrophy');

    expect(sets.map((set) => set.percentage)).toEqual([0, 0.5, 0.7]);
    expect(sets.map((set) => set.reps)).toEqual([8, 5, 3]);
    expect(getGeneralWarmupMinutes('força')).toBe(8);
    expect(getGeneralWarmupMinutes('hipertrofia')).toBe(5);
  });

  it('não inventa uma barra de 20 kg acima do alvo', () => {
    expect(generateApproachWarmupSets(10, 'strength')).toEqual([]);
  });

  it('escolhe somente o primeiro composto de cada padrão', () => {
    const targets = selectApproachTargets([
      exercise('supino-reto', ['horizontal_push']),
      exercise('supino-inclinado', ['horizontal_push']),
      exercise('remada', ['horizontal_pull']),
      exercise('crucifixo', [], { mechanics: 'isolation', secondaryMuscles: [] }),
    ]);

    expect(targets).toEqual([
      { exerciseIndex: 0, patternIds: ['horizontal_push'] },
      { exerciseIndex: 2, patternIds: ['horizontal_pull'] },
    ]);
  });

  it('marca a aproximação como warmup sem contaminar a carga de trabalho/PR', () => {
    const warmup = materializeWarmupSet(generateApproachWarmupSets(80, 'strength')[3], 'warmup-1');
    warmup.completed = true;

    expect(warmup.isWarmup).toBe(true);
    expect(bestWorkingSetWeight([warmup])).toBe(0);
    expect(bestWorkingSetWeight([
      warmup,
      { id: 'work-1', reps: 5, weight: 80, completed: true },
    ])).toBe(80);
  });

  it('constrói a configuração geral e a aproximação por alvo', () => {
    const plan = buildWarmupPlan({
      exercises: [exercise('supino', ['horizontal_push'])],
      objective: 'Força',
      targetWeightForExercise: () => 80,
    });

    expect(plan.settings).toEqual({ enabled: true, objective: 'strength', generalMinutes: 8 });
    expect(plan.targets[0].sets).toHaveLength(4);
  });
});
