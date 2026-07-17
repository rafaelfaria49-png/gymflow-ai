// GOAL-19A: domínio do Construtor de Treino multi-dia.
// O draft vive em memória (estado do Construtor) e NUNCA é persistido como entidade
// separada — o que é salvo é sempre um WorkoutProgram em customPrograms, com
// weeks[0].days como fonte canônica dos dias.

import type { ExerciseSlot, VolumeProfile } from './index';
import type { TrainingExperienceLevel } from './training-profile';
import type { MuscleGroupId } from './training-taxonomy';

/**
 * Um dia do programa em edição.
 *
 * `id` é a identidade estável do dia (sobrevive a reordenação/renumeração).
 * `dayNumber` é apenas a projeção da posição atual — nunca identidade.
 */
export interface WorkoutDayBuilderDraft {
  id: string;
  dayNumber: number;
  /** Derivado de `muscleGroupIds`; recalculado sempre que o foco muda. */
  autoName: string;
  /** Nome digitado pelo usuário; quando presente, prevalece sobre `autoName`. */
  customName?: string;
  muscleGroupIds: MuscleGroupId[];
  volumeProfile: VolumeProfile;
  targetMinutes: number;
  slots: ExerciseSlot[];
}

/** Programa customizado em edição no Construtor. */
export interface WorkoutProgramBuilderDraft {
  /** Presente apenas ao editar um customProgram existente (upsert por id). */
  programId?: string;
  name: string;
  description?: string;
  level: TrainingExperienceLevel;
  objective: string;
  durationWeeks: number;
  repeatWeeks: boolean;
  targetMinutes: number;
  days: WorkoutDayBuilderDraft[];
}

/** Fábrica de IDs injetável — mantém os helpers puros e testáveis (GOAL-19A/PART-17). */
export type BuilderIdFactory = (prefix: string) => string;
