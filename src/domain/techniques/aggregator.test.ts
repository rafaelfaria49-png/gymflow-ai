import { describe, expect, it } from 'vitest';
import type { ActiveExercise } from '../../types';
import { aggregateActiveExerciseVolume, aggregateTechniqueLog, aggregateWorkoutVolume } from './aggregator';
import { createFounderDropSetPlan, createInitialTechniqueLog, recordTechniqueStage } from './model';

function founderExercise(): ActiveExercise {
  const plan = createFounderDropSetPlan();
  let log = createInitialTechniqueLog(plan);
  [8, 7, 6, 10].forEach((reps, index) => {
    log = recordTechniqueStage(log, index, { reps, completed: true, failed: index === 3 }, 100 + index);
  });
  return {
    id: 'active-founder-curl',
    exerciseId: 'curl-founder',
    name: 'Rosca Founder',
    muscleGroup: 'biceps',
    sets: [{ id: 'base', reps: 8, weight: 30, completed: false }],
    techniquePlan: plan,
    techniqueLog: log,
  };
}

describe('aggregator — volume e fadiga TECH §5', () => {
  it('conta o drop set como uma série efetiva e soma o tonnage dos stages', () => {
    const result = aggregateTechniqueLog(founderExercise().techniqueLog!);
    expect(result.effectiveSets).toBe(1);
    expect(result.tonnage).toBe(685);
    expect(result.techniqueCount).toBe(1);
    expect(result.fatigueIndex).toBeGreaterThan(1);
  });

  it('agrega técnica e séries convencionais no mesmo treino', () => {
    const founder = founderExercise();
    const normal: ActiveExercise = {
      id: 'normal',
      exerciseId: 'normal',
      name: 'Série normal',
      muscleGroup: 'chest',
      sets: [{ id: 'normal-set', reps: 10, weight: 50, completed: true }],
    };
    expect(aggregateActiveExerciseVolume(founder).totalVolume).toBe(685);
    expect(aggregateWorkoutVolume([founder, normal])).toMatchObject({
      effectiveSets: 2,
      totalVolume: 1185,
      techniqueCount: 1,
    });
  });

  it('ignora séries de aquecimento no volume efetivo e no tonnage', () => {
    const exerciseWithWarmup: ActiveExercise = {
      id: 'warmup-and-work',
      exerciseId: 'chest_supino_reto',
      name: 'Supino',
      muscleGroup: 'chest',
      sets: [
        { id: 'warmup', reps: 5, weight: 100, completed: true, isWarmup: true },
        { id: 'work', reps: 5, weight: 80, completed: true },
      ],
    };

    expect(aggregateActiveExerciseVolume(exerciseWithWarmup)).toMatchObject({
      effectiveSets: 1,
      tonnage: 400,
      totalVolume: 400,
    });
    expect(aggregateWorkoutVolume([exerciseWithWarmup]).effectiveSets).toBe(1);
  });
});
