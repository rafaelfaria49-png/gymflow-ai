import { getEquipmentDefinition } from './equipment-registry';
import { resolveLegacyEquipment } from './equipment-legacy-map';
import type { EquipmentId } from '../types/training-taxonomy';

const PT_BR_MUSCLE_LABELS: Record<string, string> = {
  chest: 'Peito',
  back: 'Costas',
  shoulders: 'Ombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  legs: 'Pernas',
  quadriceps: 'Quadríceps',
  hamstrings: 'Posteriores',
  glutes: 'Glúteos',
  calves: 'Panturrilhas',
  abs: 'Abdômen',
  core: 'Core',
  traps: 'Trapézio',
  forearms: 'Antebraços',
  cardio: 'Cardio',
  mobility: 'Mobilidade',
  functional: 'Funcional',
};

/**
 * Retorna o rótulo amigável em PT-BR para um identificador de grupo muscular.
 * Se já for em português ou não catalogado, formata graciosamente.
 */
export function getMuscleGroupLabel(group: string | null | undefined): string {
  if (!group || typeof group !== 'string') return '';
  const normalized = group.trim().toLowerCase();
  if (PT_BR_MUSCLE_LABELS[normalized]) {
    return PT_BR_MUSCLE_LABELS[normalized];
  }
  // Se já começar com maiúscula e não bater com as chaves (ex: 'Peito'), preserva
  return group.charAt(0).toUpperCase() + group.slice(1);
}

export interface ExerciseEquipmentTarget {
  id?: string;
  name?: string;
  exerciseId?: string;
  equipment?: string;
  equipmentId?: string;
  equipmentIds?: EquipmentId[];
}

/**
 * Determina se um exercício é compatível com a calculadora de anilhas.
 * Reutiliza a capability canônica `plateCalculatorCompatible` de `EQUIPMENT_REGISTRY`.
 * Suporta barra/anilhas e máquinas plate-loaded (ex: Leg 45, Hack, Smith).
 * Retorna false para halteres, cabos/polias, máquinas de pilha de placas (selectorized) e peso corporal.
 */
export function exerciseUsesPlates(exercise: ExerciseEquipmentTarget | null | undefined): boolean {
  if (!exercise) return false;

  const ids: EquipmentId[] = [];

  if (Array.isArray(exercise.equipmentIds) && exercise.equipmentIds.length > 0) {
    ids.push(...exercise.equipmentIds);
  } else if (exercise.equipmentId) {
    ids.push(exercise.equipmentId as EquipmentId);
  }

  const rawEquipment = exercise.equipment ? String(exercise.equipment).trim() : '';

  if (rawEquipment) {
    const resolved = resolveLegacyEquipment(rawEquipment);
    if (resolved.equipmentIds.length > 0) {
      ids.push(...resolved.equipmentIds);
    }
  }

  // 1. Checa as definições canônicas de equipamentos identificados
  if (ids.length > 0) {
    const hasCompatible = ids.some((id) => {
      const def = getEquipmentDefinition(id);
      if (!def) return false;
      if (def.plateCalculatorCompatible) return true;
      if (def.loadType === 'plate_loaded') return true;
      return false;
    });
    if (hasCompatible) return true;
  }

  // 2. Fallback puro para variações textuais legadas não presentes no mapa exato
  if (rawEquipment) {
    const norm = rawEquipment.toLowerCase();
    // Exclui barras de peso corporal e acessórios de polia
    if (norm.includes('fixa') || norm.includes('paralela') || norm.includes('polia') || norm.includes('cabo') || norm.includes('haltere')) {
      return false;
    }
    if (norm.includes('barra') || norm.includes('anilha') || norm.includes('smith') || norm.includes('leg 45') || norm.includes('hack')) {
      return true;
    }
  }

  return false;
}
