// GOAL-25: proposta pura de Treino rápido.
//
// O motor não edita a sessão. Ele calcula uma versão candidata, explicita os
// exercícios removidos e só aplica a variante quando a camada de sessão recebe
// uma confirmação explícita da pessoa.

import type { ActiveExercise, Exercise, ExerciseSlot, WorkoutSession } from '../types';
import { estimateWorkoutDurationDetailed } from '../lib/workoutDuration';

export interface CompactWorkoutInput {
  session: WorkoutSession;
  /** Tempo que a pessoa tem hoje, em minutos. */
  targetMinutes: number;
  /** Sobrescreve a duração planejada quando a entrada vem do check-in/menu. */
  plannedMinutes?: number;
  catalog?: readonly Exercise[];
}

export interface CompactExerciseRemoval {
  activeExerciseId: string;
  exerciseId: string;
  name: string;
  /** O corte é deliberadamente rastreável: isoladores saem primeiro. */
  reason: 'isolation-first';
  estimatedMinutes: number;
}

export interface CompactWorkoutProposal {
  sessionId: string;
  sourceExerciseIds: string[];
  sourceMinutes: number;
  targetMinutes: number;
  estimatedMinutesBefore: number;
  estimatedMinutesAfter: number;
  removedExercises: CompactExerciseRemoval[];
  retainedExerciseIds: string[];
  /** Snapshot candidato para a UI poder mostrar exatamente o que será feito. */
  compactWorkout: WorkoutSession;
  variant: 'compact';
  requiresConfirmation: boolean;
  canReachTarget: boolean;
  rationale: string[];
}

interface ExerciseCost {
  exercise: ActiveExercise;
  index: number;
  seconds: number;
  mechanics: 'compound' | 'isolation' | 'other';
  type?: Exercise['type'];
}

function finitePositive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function inferMechanics(activeExercise: ActiveExercise, metadata: Exercise | undefined): ExerciseCost['mechanics'] {
  if (metadata?.mechanics === 'compound' || metadata?.mechanics === 'functional') return 'compound';
  if (metadata?.mechanics === 'isolation') return 'isolation';
  if (metadata?.mechanics) return 'other';
  if ((metadata?.secondaryMuscles?.length ?? 0) > 0) return 'compound';
  return metadata ? 'isolation' : 'other';
}

function activeExerciseSlot(activeExercise: ActiveExercise, metadata: Exercise | undefined): ExerciseSlot {
  const reps = activeExercise.sets.map((set) => set.reps).filter((value) => Number.isFinite(value) && value > 0);
  const minReps = reps.length > 0 ? Math.min(...reps) : 8;
  const maxReps = reps.length > 0 ? Math.max(...reps) : Math.max(10, minReps);
  const series = Math.max(1, activeExercise.sets.length);
  return {
    exerciseId: activeExercise.exerciseId,
    series,
    repRange: activeExercise.repRange ?? [minReps, maxReps],
    targetRPE: activeExercise.targetRPE ?? 8,
    restSec: activeExercise.restSec ?? metadata?.restSec ?? 90,
    progression: 'dupla',
    incrementKg: 1,
  };
}

function exerciseCosts(
  exercises: readonly ActiveExercise[],
  catalog: readonly Exercise[],
): { costs: ExerciseCost[]; estimatedSeconds: number } {
  const metadataById = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const slots = exercises.map((exercise) => activeExerciseSlot(exercise, metadataById.get(exercise.exerciseId)));
  const estimate = estimateWorkoutDurationDetailed(slots, catalog, { calculationMode: 'detailed' });
  const costs = exercises.map((exercise, index) => {
    const metadata = metadataById.get(exercise.exerciseId);
    const breakdown = estimate.breakdownByExercise[index];
    return {
      exercise,
      index,
      seconds: Math.max(1, breakdown?.totalSeconds ?? 60),
      mechanics: inferMechanics(exercise, metadata),
      type: metadata?.type,
    };
  });
  const estimatedSeconds = costs.reduce((sum, cost) => sum + cost.seconds, 0);
  return { costs, estimatedSeconds };
}

function removalPriority(cost: ExerciseCost): number {
  // Acessórios/finishers são os primeiros isoladores a sair; a posição inversa
  // mantém o começo do treino, onde normalmente ficam os movimentos principais.
  if (cost.type === 'finisher') return 0;
  if (cost.type === 'accessory') return 1;
  if (cost.type === 'stretch') return 2;
  return 3;
}

/**
 * Calcula a versão compacta sem mutar `session`.
 *
 * A regra de segurança é forte: somente entradas inferidas como isoladoras são
 * candidatas a remoção. Assim, quando houver compostos, 100% deles permanecem
 * mesmo que o tempo informado seja curto demais para atingir o alvo.
 */
export function buildCompactWorkoutProposal(input: CompactWorkoutInput): CompactWorkoutProposal {
  const catalog = input.catalog ?? [];
  const { costs, estimatedSeconds } = exerciseCosts(input.session.exercises, catalog);
  const fallbackSourceMinutes = Math.max(1, Math.round(estimatedSeconds / 60));
  // `WorkoutSession.duration` é o tempo efetivamente executado (segundos), não
  // o alvo do plano. Sem `plannedMinutes`/`plannedDuration`, estimamos a sessão
  // pelos exercícios para não confundir 45 minutos com 45 segundos.
  const requestedSourceMinutes = input.plannedMinutes ?? input.session.plannedDuration;
  const sourceMinutes = finitePositive(requestedSourceMinutes)
    ? Math.max(1, Math.round(requestedSourceMinutes))
    : fallbackSourceMinutes;
  const targetMinutes = Number.isFinite(input.targetMinutes)
    ? Math.max(1, Math.round(input.targetMinutes))
    : sourceMinutes;
  const sourceExerciseIds = input.session.exercises.map((exercise) => exercise.id);

  const noReduction = sourceMinutes <= targetMinutes || input.session.exercises.length === 0;
  const scale = estimatedSeconds > 0 ? (sourceMinutes * 60) / estimatedSeconds : 60;
  let remainingSeconds = sourceMinutes * 60;
  const removedExercises: CompactExerciseRemoval[] = [];
  const removedIds = new Set<string>();

  if (!noReduction) {
    const candidates = costs
      .filter((cost) => cost.mechanics === 'isolation')
      .sort((left, right) => removalPriority(left) - removalPriority(right) || right.index - left.index);

    for (const candidate of candidates) {
      if (remainingSeconds <= targetMinutes * 60) break;
      const candidateSeconds = candidate.seconds * scale;
      remainingSeconds -= candidateSeconds;
      removedIds.add(candidate.exercise.id);
      removedExercises.push({
        activeExerciseId: candidate.exercise.id,
        exerciseId: candidate.exercise.exerciseId,
        name: candidate.exercise.name,
        reason: 'isolation-first',
        estimatedMinutes: Math.max(1, Math.round(candidateSeconds / 60)),
      });
    }
  }

  const retainedExercises = input.session.exercises.filter((exercise) => !removedIds.has(exercise.id));
  const estimatedMinutesAfter = Math.max(1, Math.ceil(remainingSeconds / 60));
  const canReachTarget = estimatedMinutesAfter <= targetMinutes;
  const compactWorkout: WorkoutSession = {
    ...input.session,
    exercises: retainedExercises,
    variant: 'compact',
  };
  const rationale = noReduction
    ? [`O treino já cabe em ${targetMinutes} min; nenhuma alteração foi proposta.`]
    : removedExercises.length > 0
      ? [
          `Removemos ${removedExercises.length} isolador(es) antes de considerar qualquer composto.`,
          ...(canReachTarget
            ? [`A estimativa cai de ${sourceMinutes} para ${estimatedMinutesAfter} min.`]
            : [`Os compostos preservados ainda exigem cerca de ${estimatedMinutesAfter} min.`]),
        ]
      : ['Não há isoladores seguros para cortar; os compostos foram preservados.'];

  return {
    sessionId: input.session.id,
    sourceExerciseIds,
    sourceMinutes,
    targetMinutes,
    estimatedMinutesBefore: sourceMinutes,
    estimatedMinutesAfter,
    removedExercises,
    retainedExerciseIds: retainedExercises.map((exercise) => exercise.id),
    compactWorkout,
    variant: 'compact',
    requiresConfirmation: removedExercises.length > 0,
    canReachTarget,
    rationale,
  };
}

/** Aplica somente os cortes já apresentados, sem alterar a sessão original. */
export function applyCompactWorkoutProposal(
  session: WorkoutSession,
  proposal: CompactWorkoutProposal,
): WorkoutSession {
  if (session.id !== proposal.sessionId) return session;
  const removedIds = new Set(proposal.removedExercises.map((exercise) => exercise.activeExerciseId));
  return {
    ...session,
    exercises: session.exercises.filter((exercise) => !removedIds.has(exercise.id)),
    variant: 'compact',
  };
}

// Aliases semânticos para consumidores de domínio que chamam a operação de
// criação de `compact` diretamente.
export const createCompactWorkoutProposal = buildCompactWorkoutProposal;
export const compactWorkout = buildCompactWorkoutProposal;
export const applyCompactProposal = applyCompactWorkoutProposal;
