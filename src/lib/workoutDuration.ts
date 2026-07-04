// GOAL-10.5: estimador de duração/volume do treino — função pura, única fonte de
// verdade usada tanto pelo planejador (buildWeekFromProgram) quanto pelo Construtor
// de Treino manual, para que o número mostrado no card seja sempre o número real.

import { Exercise, ExerciseSlot } from '../types';

export interface WorkoutDurationEstimate {
  minutes: number;
  totalSeries: number;
  exerciseCount: number;
}

// Tempo médio de execução de 1 série (concêntrica + excêntrica + ajuste de carga).
const EXECUTION_SECONDS_PER_SET = 40;
// Tempo de transição entre exercícios (trocar de estação/aparelho, carregar peso).
const TRANSITION_SECONDS_PER_EXERCISE = 60;
const WARMUP_MINUTES = 5;

export function estimateWorkoutDuration(
  slots: ExerciseSlot[],
  options?: { includeWarmup?: boolean }
): WorkoutDurationEstimate {
  if (!slots || slots.length === 0) {
    return { minutes: 0, totalSeries: 0, exerciseCount: 0 };
  }

  const totalSeries = slots.reduce((acc, s) => acc + Math.max(0, s.series), 0);
  const workSeconds = slots.reduce(
    (acc, s) => acc + Math.max(0, s.series) * (Math.max(0, s.restSec) + EXECUTION_SECONDS_PER_SET),
    0
  );
  const transitionSeconds = Math.max(0, slots.length - 1) * TRANSITION_SECONDS_PER_EXERCISE;
  const warmupSeconds = options?.includeWarmup ? WARMUP_MINUTES * 60 : 0;

  const minutes = Math.max(5, Math.round((workSeconds + transitionSeconds + warmupSeconds) / 60));

  return { minutes, totalSeries, exerciseCount: slots.length };
}

// Grupos musculares reais envolvidos nos slots — sempre derivado dos exercícios
// adicionados, nunca um campo solto escolhido à parte (evita o bug do GOAL-10.5).
export function muscleGroupsForSlots(slots: ExerciseSlot[], allExercises: Exercise[]): Exercise['muscleGroup'][] {
  return Array.from(
    new Set(
      slots
        .map((s) => allExercises.find((e) => e.id === s.exerciseId)?.muscleGroup)
        .filter((mg): mg is Exercise['muscleGroup'] => Boolean(mg))
    )
  );
}

// Aviso honesto de duração: o app nunca corta exercícios sozinho, só avisa.
export function buildDurationWarning(estimatedMinutes: number, targetMinutes: number | null | undefined): string | null {
  if (!targetMinutes || estimatedMinutes <= targetMinutes) return null;
  return `Este treino pode passar de ${targetMinutes} min (estimativa: ${estimatedMinutes} min). Reduza séries ou escolha o modo Alto Volume.`;
}
