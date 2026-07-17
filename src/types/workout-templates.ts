// GOAL-19B: templates ESTRUTURAIS do Construtor de Treino.
//
// Um template define APENAS a estrutura de um programa: quantos dias, o foco muscular
// de cada dia, os nomes automáticos/estruturais, a duração alvo e o perfil de volume.
// Um template NUNCA contém exercícios — ao virar um draft, todo dia nasce com
// `slots: []`. Template é ponto de partida editável, não prescrição definitiva.

import type { VolumeProfile } from './index';
import type { TrainingExperienceLevel, TrainingGoal } from './training-profile';
import type { MuscleGroupId } from './training-taxonomy';

/**
 * Um dia de um template.
 *
 * `muscleGroupIds` é o foco estrutural; o nome automático do dia é derivado dele
 * (ver `generateWorkoutDayAutoName`). `customName` só existe quando o rótulo estrutural
 * ("Superior", "Empurrar") é mais claro que o nome por músculos — e continua editável.
 * Nunca há exercícios aqui.
 */
export interface WorkoutTemplateDay {
  muscleGroupIds: MuscleGroupId[];
  /** Rótulo estrutural opcional ("Superior", "Empurrar"); ausente = usa o nome automático. */
  customName?: string;
  /** Perfil de volume inicial sugerido para o dia; o usuário troca à vontade. */
  volumeProfile?: VolumeProfile;
  /** Tempo alvo do dia; quando ausente, a conversão deriva do perfil/volumeProfile. */
  targetMinutes?: number;
}

/**
 * Um template estrutural de programa.
 *
 * Imutável e puro — vive no registry, nunca é mutado, e ao ser aplicado gera um draft
 * novo com ids próprios (o `id` do template NUNCA vira identidade do programa).
 */
export interface WorkoutProgramTemplate {
  id: string;
  name: string;
  description: string;
  /** Frequências semanais para as quais o template é uma sugestão natural. */
  recommendedFrequencies: number[];
  levelCompatibility: TrainingExperienceLevel[];
  goalCompatibility: TrainingGoal[];
  tags: string[];
  days: WorkoutTemplateDay[];
  /** Aviso honesto exibido na prévia — template é estrutura, não prescrição. */
  disclaimer: string;
  /** true = pensado para retorno aos treinos (framing conservador, volume inicial menor). */
  forReturningUsers?: boolean;
}

/**
 * Leitura de compatibilidade entre um template e o perfil do usuário.
 *
 * Tudo aqui é INFORMATIVO (PART 4): nada bloqueia a escolha do usuário e não existe
 * ranking de "melhor template". São sinais para a UI, não decisões automáticas.
 */
export interface TemplateCompatibility {
  recommendedForFrequency: boolean;
  levelCompatible: boolean;
  goalCompatible: boolean;
  suitableForReturn: boolean;
  /** O template tem mais dias que a frequência informada pelo perfil. */
  moreDaysThanFrequency: boolean;
  /** O template tem menos dias que a frequência informada pelo perfil. */
  fewerDaysThanFrequency: boolean;
  /** Frase pronta e honesta para a UI (nunca afirma "melhor"). */
  note: string;
}
