// GOAL-10.5: perfis de volume do Construtor de Treino.
// Guias configuráveis (nunca travas) — o usuário pode montar qualquer volume real;
// o perfil só sugere um alvo de tempo/exercícios e alimenta o aviso de duração.

import { VolumeProfile } from '../types';

export interface VolumeProfileConfig {
  id: VolumeProfile;
  label: string;
  description: string;
  minMinutes: number;
  maxMinutes: number;
  minExercises: number;
  maxExercises: number;
}

export const VOLUME_PROFILES: VolumeProfileConfig[] = [
  {
    id: 'compact',
    label: 'Compacto',
    description: '35–45 min • 4–5 exercícios • foco em eficiência',
    minMinutes: 35,
    maxMinutes: 45,
    minExercises: 4,
    maxExercises: 5
  },
  {
    id: 'standard',
    label: 'Padrão',
    description: '50–65 min • 5–7 exercícios • volume intermediário',
    minMinutes: 50,
    maxMinutes: 65,
    minExercises: 5,
    maxExercises: 7
  },
  {
    id: 'high',
    label: 'Alto Volume',
    description: '70–90 min • 7–9 exercícios • indicado para quem já treina há mais tempo',
    minMinutes: 70,
    maxMinutes: 90,
    minExercises: 7,
    maxExercises: 9
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
