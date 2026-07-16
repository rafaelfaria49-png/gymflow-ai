// GOAL-10.5: perfis de volume do Construtor de Treino.
// Guias configuráveis (nunca travas) — o usuário pode montar qualquer volume real;
// o perfil só sugere um alvo de tempo/exercícios e alimenta o aviso de duração.

import { VolumeProfile } from '../types';
import type { TrainingVolumeLevel } from '../types/training-volume';

export interface VolumeProfileConfig {
  id: VolumeProfile;
  label: string;
  description: string;
  minMinutes: number;
  maxMinutes: number;
  minExercises: number;
  maxExercises: number;
  /** Classificação descritiva da sessão; não substitui faixas semanais por músculo. */
  referenceLevel?: Exclude<TrainingVolumeLevel, 'very_high'>;
}

export const VOLUME_PROFILES: VolumeProfileConfig[] = [
  {
    id: 'compact',
    label: 'Compacto',
    description: '35–45 min • 4–5 exercícios • foco em eficiência',
    minMinutes: 35,
    maxMinutes: 45,
    minExercises: 4,
    maxExercises: 5,
    referenceLevel: 'low'
  },
  {
    id: 'standard',
    label: 'Padrão',
    description: '50–65 min • 5–7 exercícios • volume intermediário',
    minMinutes: 50,
    maxMinutes: 65,
    minExercises: 5,
    maxExercises: 7,
    referenceLevel: 'moderate'
  },
  {
    id: 'high',
    label: 'Alto Volume',
    description: '70–90 min • 7–9 exercícios • indicado para quem já treina há mais tempo',
    minMinutes: 70,
    maxMinutes: 90,
    minExercises: 7,
    maxExercises: 9,
    referenceLevel: 'high'
  }
];

export function getVolumeProfile(id: VolumeProfile): VolumeProfileConfig {
  return VOLUME_PROFILES.find((p) => p.id === id) ?? VOLUME_PROFILES[1];
}

// Ponto médio de duração do perfil — usado como "tempo alvo" inicial sugerido.
export function defaultTargetMinutes(id: VolumeProfile): number {
  const profile = getVolumeProfile(id);
  return Math.round((profile.minMinutes + profile.maxMinutes) / 2);
}

export function getVolumeProfileReferenceLevel(id: VolumeProfile): Exclude<TrainingVolumeLevel, 'very_high'> {
  return getVolumeProfile(id).referenceLevel ?? 'moderate';
}
