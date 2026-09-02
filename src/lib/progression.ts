// GOAL-29: adaptador de compatibilidade do motor legado.
// A regra vive em `domain/progressionEngine`; este módulo mantém o contrato
// público usado pelo GOAL-08 e explicita o modo legacy para golden parity.

import type { ExerciseSlot } from '../types';
import {
  lastRecordedWeight as engineLastRecordedWeight,
  progressionEngine,
  roundToHalfKg,
  type ExerciseSessionHistory,
  type ProgressionHistorySet,
} from '../domain/progressionEngine';

export type HistorySet = ProgressionHistorySet;
export type { ExerciseSessionHistory };

export interface ProgressionSuggestion {
  pesoKg: number | null;
  repsAlvo: number | null;
  motivo: string;
}

export { roundToHalfKg };

export function lastRecordedWeight(history: ExerciseSessionHistory[]): number | null {
  return engineLastRecordedWeight(history);
}

/**
 * Contrato legado preservado; a implementação agora é a mesma função pura que
 * sustenta a v2, com platô/rampa/séries avançadas desativados pelo modo.
 */
export function suggestNext(slot: ExerciseSlot, history: ExerciseSessionHistory[]): ProgressionSuggestion {
  const decision = progressionEngine({ slot, history, mode: 'legacy' });
  return {
    pesoKg: decision.pesoKg,
    repsAlvo: decision.repsAlvo,
    motivo: decision.reasonText,
  };
}
