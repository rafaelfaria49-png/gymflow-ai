import { describe, expect, it } from 'vitest';
import type { Exercise, ExerciseSlot } from '../types';
import type { EquipmentId } from '../types/training-taxonomy';
import {
  createDefaultGymProfileState,
  getActiveGymProfile,
  getGymProfileAvailability,
  updateGymProfileEquipment,
} from '../domain/gymProfile';
import {
  buildWorkoutSuggestionPreview,
  createDefaultExerciseSlot,
  type WorkoutSuggestionInput,
} from './workout-suggestion';

function makeExercise(id: string, equipmentId: EquipmentId): Exercise {
  return {
    id,
    name: id,
    thumbnail: '',
    muscleGroup: 'back',
    primaryMuscleGroupId: 'back',
    secondaryMuscles: ['biceps'],
    secondaryMuscleGroupIds: ['biceps'],
    equipment: equipmentId,
    equipmentIds: [equipmentId],
    level: 'beginner',
    mechanics: 'compound',
    executionSteps: [],
    postureTips: [],
    breathing: '',
    commonErrors: [],
    errorCorrections: [],
    variations: [],
    substitutions: [],
    safetyWarnings: [],
  };
}

function baseInput(overrides: Partial<WorkoutSuggestionInput> = {}): WorkoutSuggestionInput {
  return {
    focusIds: ['back'],
    targetMinutes: 60,
    volumeProfile: 'standard',
    level: 'beginner',
    goal: 'hypertrophy',
    returnToTraining: null,
    existingSlots: [],
    catalog: [],
    ...overrides,
  };
}

function sixUnknownSlots(): ExerciseSlot[] {
  return Array.from({ length: 6 }, (_, index) => createDefaultExerciseSlot(
    makeExercise(`existing_${index}`, 'bodyweight'),
  ));
}

describe('workout suggestion — GymProfile', () => {
  it('sem perfil mantém o contrato legado de disponibilidade', () => {
    const catalog = [makeExercise('back_dumbbells', 'dumbbells'), makeExercise('back_barbell', 'barbell')];
    const legacyInput = baseInput({ catalog, availableEquipment: ['dumbbells'] });

    expect(buildWorkoutSuggestionPreview({ ...legacyInput, equipmentAvailability: null }))
      .toEqual(buildWorkoutSuggestionPreview(legacyInput));

    const legacyExercise = {
      ...makeExercise('back_legacy_dumbbells', 'dumbbells'),
      equipment: 'Halteres',
      equipmentIds: undefined,
    };
    const legacyPreview = buildWorkoutSuggestionPreview(baseInput({
      catalog: [legacyExercise],
      availableEquipment: ['barbell'],
    }));
    expect(legacyPreview.additions).toHaveLength(1);
    expect(legacyPreview.additions[0].equipmentStatus).toBe('unverified');

    const profile = getActiveGymProfile(createDefaultGymProfileState())!;
    const blocked = updateGymProfileEquipment(profile, 'dumbbells', 'unavailable');
    const profileAvailability = getGymProfileAvailability(blocked, '2026-08-30')!;
    const profilePreview = buildWorkoutSuggestionPreview(baseInput({
      catalog: [legacyExercise],
      equipmentAvailability: profileAvailability,
    }));
    expect(profilePreview.additions).toHaveLength(0);
  });

  it('com perfil filtra equipamento indisponível e mantém a alternativa disponível', () => {
    const profile = getActiveGymProfile(createDefaultGymProfileState())!;
    const blocked = updateGymProfileEquipment(profile, 'barbell', 'unavailable');
    const availability = getGymProfileAvailability(blocked, '2026-08-30')!;
    const preview = buildWorkoutSuggestionPreview(baseInput({
      catalog: [makeExercise('back_barbell', 'barbell'), makeExercise('back_dumbbells', 'dumbbells')],
      equipmentAvailability: availability,
    }));

    expect(preview.additions.map((addition) => addition.exercise.id)).not.toContain('back_barbell');
    expect(preview.additions.map((addition) => addition.exercise.id)).toContain('back_dumbbells');
  });

  it('penaliza lotação no ranking, sem eliminar o exercício', () => {
    const catalog = [makeExercise('back_crowded', 'barbell'), makeExercise('back_available', 'dumbbells')];
    const profile = getActiveGymProfile(createDefaultGymProfileState())!;
    const crowded = updateGymProfileEquipment(profile, 'barbell', 'crowded');
    const availability = getGymProfileAvailability(crowded, '2026-08-30')!;
    const preview = buildWorkoutSuggestionPreview(baseInput({
      catalog,
      existingSlots: sixUnknownSlots(),
      equipmentAvailability: availability,
    }));

    expect(preview.additions).toHaveLength(1);
    expect(preview.additions[0].exercise.id).toBe('back_available');

    const crowdedOnly = buildWorkoutSuggestionPreview(baseInput({
      catalog: [catalog[0]],
      equipmentAvailability: availability,
    }));
    expect(crowdedOnly.additions[0].equipmentStatus).toBe('crowded');
    expect(crowdedOnly.warnings.map((warning) => warning.code)).toContain('equipment-crowded');
  });
});
