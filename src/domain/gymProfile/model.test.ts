import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../types';
import { EQUIPMENT_REGISTRY } from '../../lib/equipment-registry';
import {
  addGymProfile,
  createDefaultGymProfileState,
  createGymProfile,
  getActiveGymProfile,
  getGymProfileAvailability,
  getGymProfileEquipmentStatus,
  getGymProfileExerciseAvailability,
  migrateGymProfile,
  removeGymProfile,
  setActiveGymProfile,
  setDefaultGymProfile,
  updateGymProfileEquipment,
} from './index';

function makeExercise(
  equipmentIds?: Exercise['equipmentIds'],
  equipment = 'Halteres',
): Exercise {
  return {
    id: 'test_exercise',
    name: 'Exercício de teste',
    thumbnail: '',
    muscleGroup: 'back',
    equipment,
    equipmentIds: equipmentIds ? [...equipmentIds] : undefined,
    level: 'beginner',
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

describe('GymProfile', () => {
  it('cria o seed do Founder com tudo disponível e um local padrão', () => {
    const state = createDefaultGymProfileState();
    const profile = getActiveGymProfile(state)!;

    expect(state.activeProfileId).toBe(profile.id);
    expect(profile.isDefault).toBe(true);
    expect(profile.equipment).toHaveLength(EQUIPMENT_REGISTRY.length);
    expect(profile.equipment.every((item) => item.status === 'available')).toBe(true);
  });

  it('mantém múltiplos locais, ativo e padrão sem misturar checklists', () => {
    const initial = createDefaultGymProfileState();
    const home = createGymProfile({
      id: 'gym_profile_home',
      name: 'Casa',
      kind: 'home',
      isDefault: false,
    });
    const withHome = addGymProfile(initial, home);
    const defaultHome = setDefaultGymProfile(withHome, home.id);

    expect(getActiveGymProfile(defaultHome)?.id).toBe(home.id);
    expect(defaultHome.profiles.find((profile) => profile.id === home.id)?.isDefault).toBe(true);
    expect(defaultHome.profiles.find((profile) => profile.id === initial.activeProfileId)?.isDefault).toBe(false);

    const backToGym = setActiveGymProfile(defaultHome, initial.activeProfileId);
    expect(getActiveGymProfile(backToGym)?.id).toBe(initial.activeProfileId);
    expect(removeGymProfile(backToGym, home.id)?.profiles).toHaveLength(1);
  });

  it('expira indisponibilidade temporária na data informada', () => {
    const profile = getActiveGymProfile(createDefaultGymProfileState())!;
    const blocked = updateGymProfileEquipment(profile, 'dumbbells', 'unavailable', '2026-08-30');

    expect(getGymProfileEquipmentStatus(blocked, 'dumbbells', '2026-08-29')).toBe('unavailable');
    expect(getGymProfileEquipmentStatus(blocked, 'dumbbells', '2026-08-30')).toBe('available');
    expect(getGymProfileAvailability(blocked, '2026-08-29')?.unavailableEquipment).toContain('dumbbells');
    expect(getGymProfileAvailability(blocked, '2026-08-30')?.unavailableEquipment).not.toContain('dumbbells');
  });

  it('classifica exercício pelo equipamento real do perfil ativo', () => {
    const profile = getActiveGymProfile(createDefaultGymProfileState())!;
    const blocked = updateGymProfileEquipment(profile, 'dumbbells', 'unavailable');
    const crowded = updateGymProfileEquipment(profile, 'barbell', 'crowded');
    const blockedAvailability = getGymProfileAvailability(blocked, '2026-08-30')!;
    const crowdedAvailability = getGymProfileAvailability(crowded, '2026-08-30')!;

    expect(getGymProfileExerciseAvailability(makeExercise(['dumbbells']), blockedAvailability).status)
      .toBe('unavailable');
    expect(getGymProfileExerciseAvailability(makeExercise(['barbell']), crowdedAvailability).status)
      .toBe('crowded');
    expect(getGymProfileExerciseAvailability(makeExercise(), blockedAvailability).status)
      .toBe('unavailable');
    expect(getGymProfileExerciseAvailability(makeExercise(undefined, 'aparelho-sem-mapa'), blockedAvailability).status)
      .toBe('unverified');
  });

  it('trata perfil ausente na migração como null, sem criar configuração silenciosa', () => {
    expect(migrateGymProfile(undefined)).toBeNull();
    expect(migrateGymProfile(null)).toBeNull();
  });
});
