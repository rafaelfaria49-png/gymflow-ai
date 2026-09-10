import { describe, it, expect } from 'vitest';
import { exerciseUsesPlates, getMuscleGroupLabel } from './mobile-training-ux';

describe('mobile-training-ux', () => {
  describe('exerciseUsesPlates (Calculadora de Anilhas)', () => {
    it('retorna true para barra olímpica / anilhas (canonical e legacy)', () => {
      expect(exerciseUsesPlates({ equipmentIds: ['barbell'] })).toBe(true);
      expect(exerciseUsesPlates({ equipmentIds: ['ez_bar'] })).toBe(true);
      expect(exerciseUsesPlates({ equipment: 'Barra' })).toBe(true);
      expect(exerciseUsesPlates({ equipment: 'Barra Olímpica' })).toBe(true);
      expect(exerciseUsesPlates({ equipment: 'Barra W' })).toBe(true);
    });

    it('retorna true para máquina plate-loaded (Smith, Leg Press 45, Hack Squat)', () => {
      expect(exerciseUsesPlates({ equipmentIds: ['smith_machine'] })).toBe(true);
      expect(exerciseUsesPlates({ equipmentIds: ['leg_press_45'] })).toBe(true);
      expect(exerciseUsesPlates({ equipmentIds: ['hack_squat_machine'] })).toBe(true);
      expect(exerciseUsesPlates({ equipment: 'Leg Press 45' })).toBe(true);
      expect(exerciseUsesPlates({ equipment: 'Máquina Smith' })).toBe(true);
      expect(exerciseUsesPlates({ equipment: 'Hack Machine' })).toBe(true);
    });

    it('retorna false para halteres', () => {
      expect(exerciseUsesPlates({ equipmentIds: ['dumbbells'] })).toBe(false);
      expect(exerciseUsesPlates({ equipment: 'Halteres' })).toBe(false);
      expect(exerciseUsesPlates({ equipment: 'Halter' })).toBe(false);
    });

    it('retorna false para cabo / polia', () => {
      expect(exerciseUsesPlates({ equipmentIds: ['cable_crossover'] })).toBe(false);
      expect(exerciseUsesPlates({ equipmentIds: ['high_cable_station'] })).toBe(false);
      expect(exerciseUsesPlates({ equipmentIds: ['low_cable_station'] })).toBe(false);
      expect(exerciseUsesPlates({ equipment: 'Cabo' })).toBe(false);
      expect(exerciseUsesPlates({ equipment: 'Polia' })).toBe(false);
      expect(exerciseUsesPlates({ equipment: 'Crossover' })).toBe(false);
    });

    it('retorna false para máquina com stack (selectorized machine)', () => {
      expect(exerciseUsesPlates({ equipmentIds: ['leg_extension_machine'] })).toBe(false);
      expect(exerciseUsesPlates({ equipmentIds: ['seated_leg_curl_machine'] })).toBe(false);
      expect(exerciseUsesPlates({ equipmentIds: ['chest_press_machine'] })).toBe(false);
      expect(exerciseUsesPlates({ equipment: 'Cadeira extensora' })).toBe(false);
      expect(exerciseUsesPlates({ equipment: 'Peck deck' })).toBe(false);
    });

    it('retorna false para peso corporal (bodyweight)', () => {
      expect(exerciseUsesPlates({ equipmentIds: ['bodyweight'] })).toBe(false);
      expect(exerciseUsesPlates({ equipmentIds: ['pull_up_bar'] })).toBe(false);
      expect(exerciseUsesPlates({ equipment: 'Peso corporal' })).toBe(false);
      expect(exerciseUsesPlates({ equipment: 'Barra fixa' })).toBe(false);
      expect(exerciseUsesPlates({ equipment: 'Calistenia' })).toBe(false);
    });

    it('retorna false para nulo ou indefinido', () => {
      expect(exerciseUsesPlates(null)).toBe(false);
      expect(exerciseUsesPlates(undefined)).toBe(false);
      expect(exerciseUsesPlates({})).toBe(false);
      expect(exerciseUsesPlates({ equipment: '' })).toBe(false);
    });
  });

  describe('getMuscleGroupLabel (Tradução PT-BR de Grupos Musculares)', () => {
    it('traduz identificadores canônicos para PT-BR com acentuação correta', () => {
      expect(getMuscleGroupLabel('chest')).toBe('Peito');
      expect(getMuscleGroupLabel('back')).toBe('Costas');
      expect(getMuscleGroupLabel('shoulders')).toBe('Ombros');
      expect(getMuscleGroupLabel('biceps')).toBe('Bíceps');
      expect(getMuscleGroupLabel('triceps')).toBe('Tríceps');
      expect(getMuscleGroupLabel('legs')).toBe('Pernas');
      expect(getMuscleGroupLabel('glutes')).toBe('Glúteos');
      expect(getMuscleGroupLabel('calves')).toBe('Panturrilhas');
      expect(getMuscleGroupLabel('abs')).toBe('Abdômen');
      expect(getMuscleGroupLabel('core')).toBe('Core');
      expect(getMuscleGroupLabel('cardio')).toBe('Cardio');
    });

    it('preserva strings já formatadas ou desconhecidas de forma limpa', () => {
      expect(getMuscleGroupLabel('Peito')).toBe('Peito');
      expect(getMuscleGroupLabel('Tríceps')).toBe('Tríceps');
      expect(getMuscleGroupLabel('')).toBe('');
      expect(getMuscleGroupLabel(null)).toBe('');
      expect(getMuscleGroupLabel(undefined)).toBe('');
    });
  });
});
