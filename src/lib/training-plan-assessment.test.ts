import { describe, expect, it } from 'vitest';
import type { Exercise, ExerciseSlot } from '../types';
import type { TrainingProfileSource } from '../types/training-profile';
import { MOCK_EXERCISES } from '../mock/exercises';
import { MOCK_PROGRAMS } from '../mock/programs';
import { VOLUME_PROFILES, defaultTargetMinutes, getVolumeProfile, getVolumeProfileReferenceLevel } from './volumeProfiles';
import { assessTrainingPlanAgainstProfile } from './training-plan-assessment';

function slot(overrides: Partial<ExerciseSlot> = {}): ExerciseSlot {
  return {
    exerciseId: 'chest_1',
    series: 8,
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
    id: 'chest_1',
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
    laterality: 'bilateral',
    ...overrides,
  };
}

function profile(overrides: Partial<TrainingProfileSource> = {}): TrainingProfileSource {
  return {
    level: 'intermediate',
    trainingStatus: 'active',
    goal: 'hypertrophy',
    frequency: 4,
    duration: 60,
    ...overrides,
  };
}

describe('assessment explicável do plano', () => {
  it('classifica fits', () => {
    const result = assessTrainingPlanAgainstProfile({
      slots: [slot()],
      exercises: [exercise()],
      profile: profile(),
    });
    expect(result.status).toBe('fits');
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.durationEstimate.totalMinutes).toBeLessThan(60);
  });

  it('classifica tight quando cabe sem margem operacional', () => {
    const result = assessTrainingPlanAgainstProfile({
      slots: [slot({ restSec: 300 })],
      exercises: [exercise()],
      profile: profile({ duration: 45 }),
    });
    expect(result.status).toBe('tight');
    expect(result.suggestions.some((item) => item.code === 'accept-longer-session')).toBe(true);
  });

  it('classifica exceeds_time e nunca aplica a sugestão', () => {
    const slots = [slot({ restSec: 400 })];
    const before = JSON.stringify(slots);
    const result = assessTrainingPlanAgainstProfile({ slots, exercises: [exercise()], profile: profile({ duration: 45 }) });
    expect(result.status).toBe('exceeds_time');
    expect(result.warnings.some((item) => item.code === 'exceeds-time')).toBe(true);
    expect(result.suggestions.some((item) => item.code === 'review-accessory-sets')).toBe(true);
    expect(JSON.stringify(slots)).toBe(before);
  });

  it('classifica high_volume como limite de cautela, não como diagnóstico', () => {
    const result = assessTrainingPlanAgainstProfile({
      slots: [slot({ series: 20, restSec: 60 })],
      exercises: [exercise()],
      profile: profile({ duration: 180 }),
    });
    expect(result.status).toBe('high_volume');
    expect(result.warnings.some((item) => item.code === 'high-volume-reference')).toBe(true);
    expect(result.warnings.join(' ')).not.toMatch(/perigoso|lesão|garante/i);
  });

  it('classifica low_volume sem adicionar séries', () => {
    const slots = [slot({ series: 2 })];
    const before = JSON.stringify(slots);
    const result = assessTrainingPlanAgainstProfile({ slots, exercises: [exercise()], profile: profile() });
    expect(result.status).toBe('low_volume');
    expect(result.suggestions.some((item) => item.code === 'review-plan-scope')).toBe(true);
    expect(JSON.stringify(slots)).toBe(before);
  });

  it('classifica insufficient_data com exercício desconhecido', () => {
    const result = assessTrainingPlanAgainstProfile({
      slots: [slot({ exerciseId: 'missing' })],
      exercises: [],
      profile: profile(),
    });
    expect(result.status).toBe('insufficient_data');
    expect(result.confidence).toBe('low');
  });

  it('classifica plano vazio como insufficient_data', () => {
    expect(assessTrainingPlanAgainstProfile({ slots: [], exercises: [], profile: profile() }).status)
      .toBe('insufficient_data');
  });

  it('classifica perfil sem duração/frequência válida como insufficient_data', () => {
    const result = assessTrainingPlanAgainstProfile({
      slots: [slot()],
      exercises: [exercise()],
      profile: profile({ duration: 0, frequency: 0 }),
    });
    expect(result.status).toBe('insufficient_data');
    expect(result.confidence).toBe('low');
  });

  it('considera returning sem alterar intermediate', () => {
    const returningProfile = profile({
      trainingStatus: 'returning',
      returnToTraining: { breakDuration: 'three_to_six_months' },
      frequency: 5,
      duration: 75,
    });
    const before = JSON.stringify(returningProfile);
    const result = assessTrainingPlanAgainstProfile({ slots: [slot()], exercises: [exercise()], profile: returningProfile });
    expect(result.guidelines[0].experienceLevel).toBe('intermediate');
    expect(result.warnings.some((item) => item.code === 'returning-reference')).toBe(true);
    expect(JSON.stringify(returningProfile)).toBe(before);
  });

  it('sempre retorna reasons, warnings honestos e confidence', () => {
    const result = assessTrainingPlanAgainstProfile({ slots: [slot()], exercises: [exercise()], profile: profile() });
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.warnings.some((item) => item.code === 'estimate-varies')).toBe(true);
    expect(['high', 'medium', 'low']).toContain(result.confidence);
  });

  it('compara ocorrências informadas com a frequência sem multiplicar silenciosamente', () => {
    const result = assessTrainingPlanAgainstProfile({
      slots: [slot()],
      exercises: [exercise()],
      profile: profile({ frequency: 3 }),
      weeklyOccurrences: 4,
      availableMinutes: 180,
    });
    expect(result.warnings.some((item) => item.code === 'frequency-mismatch')).toBe(true);
    expect(result.reasons.join(' ')).toContain('4 vez(es)');
  });
});

describe('caso real anonimizado de costas e bíceps', () => {
  function realScenario(bicepsExercises: number) {
    const exercises: Exercise[] = [];
    const slots: ExerciseSlot[] = [];
    const backEquipment = [
      ['barbell', 'weight_plates'],
      ['dumbbells'],
      ['high_cable_station'],
      ['seated_row_machine'],
    ] as const;
    for (let index = 0; index < 4; index += 1) {
      const id = `back_${index}`;
      exercises.push(exercise({
        id,
        name: `Costas ${index + 1}`,
        muscleGroup: 'back',
        primaryMuscleGroupId: 'back',
        secondaryMuscleGroupIds: ['biceps'],
        equipmentIds: [...backEquipment[index]],
        mechanics: 'compound',
      }));
      slots.push(slot({ exerciseId: id, series: 4, repRange: [8, 12], restSec: 120 }));
    }
    for (let index = 0; index < bicepsExercises; index += 1) {
      const id = `biceps_${index}`;
      exercises.push(exercise({
        id,
        name: `Bíceps ${index + 1}`,
        muscleGroup: 'biceps',
        primaryMuscleGroupId: 'biceps',
        secondaryMuscleGroupIds: [],
        equipmentIds: index % 2 === 0 ? ['dumbbells'] : ['low_cable_station'],
        mechanics: 'isolation',
      }));
      slots.push(slot({ exerciseId: id, series: 4, repRange: [8, 12], restSec: 75 }));
    }
    return { exercises, slots };
  }

  it('explica 32 séries em 60 min sem cortar nada', () => {
    const scenario = realScenario(4);
    const before = JSON.stringify(scenario);
    const result = assessTrainingPlanAgainstProfile({
      ...scenario,
      profile: profile({
        trainingStatus: 'returning',
        returnToTraining: { breakDuration: 'three_to_six_months' },
        frequency: 5,
        duration: 60,
      }),
    });
    expect(result.durationEstimate.totalSeries).toBe(32);
    expect(result.durationEstimate.totalMinutes).toBeGreaterThan(60);
    expect(result.status).toBe('exceeds_time');
    expect(result.warnings.some((item) => item.code === 'rest-dominates')).toBe(true);
    expect(result.muscleVolume.find((item) => item.muscleGroupId === 'back')?.directSets).toBe(16);
    expect(result.muscleVolume.find((item) => item.muscleGroupId === 'biceps')).toMatchObject({
      directSets: 16,
      secondaryExposure: 8,
      weightedSets: 24,
    });
    expect(JSON.stringify(scenario)).toBe(before);
  });

  it('explica 36 séries em 75 min como sessão longa sem chamar de errada', () => {
    const scenario = realScenario(5);
    const result = assessTrainingPlanAgainstProfile({
      ...scenario,
      profile: profile({
        trainingStatus: 'returning',
        returnToTraining: { breakDuration: 'three_to_six_months' },
        frequency: 5,
        duration: 75,
      }),
    });
    expect(result.durationEstimate.totalSeries).toBe(36);
    expect(result.durationEstimate.totalMinutes).toBeGreaterThan(75);
    expect(result.warnings.map((item) => item.message).join(' ')).not.toContain('errado');
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});

describe('compatibilidade dos motores existentes', () => {
  it('mantém VolumeProfileConfig e seus defaults atuais', () => {
    expect(VOLUME_PROFILES.map((item) => item.id)).toEqual(['compact', 'standard', 'high']);
    expect(getVolumeProfile('standard')).toMatchObject({ minMinutes: 50, maxMinutes: 65, minExercises: 5, maxExercises: 7 });
    expect(defaultTargetMinutes('standard')).toBe(58);
    expect(getVolumeProfileReferenceLevel('compact')).toBe('low');
    expect(getVolumeProfileReferenceLevel('standard')).toBe('moderate');
    expect(getVolumeProfileReferenceLevel('high')).toBe('high');
  });

  it('avalia programa real sem modificar programas nem catálogo', () => {
    const beforePrograms = JSON.stringify(MOCK_PROGRAMS);
    const beforeExercises = JSON.stringify(MOCK_EXERCISES);
    const day = MOCK_PROGRAMS.find((program) => program.id === 'prog_int_1')?.weeks[0]?.days[0];
    expect(day).toBeDefined();
    assessTrainingPlanAgainstProfile({
      slots: day?.slots ?? [],
      exercises: MOCK_EXERCISES,
      profile: profile({ frequency: 5, duration: 60 }),
    });
    expect(JSON.stringify(MOCK_PROGRAMS)).toBe(beforePrograms);
    expect(JSON.stringify(MOCK_EXERCISES)).toBe(beforeExercises);
  });
});
