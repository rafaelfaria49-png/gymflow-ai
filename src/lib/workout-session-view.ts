// GOAL-23B: camada de apresentação do domínio de sessão (GOAL-23A).
//
// Helpers PUROS (sem React) que traduzem status/origem/execução em labels e estilos
// de badge, contam séries concluídas/incompletas e montam o resumo da sessão. Tudo
// aqui é defensivo: sessões/exercícios legados sem `status`/`entryStatus`/`entryOrigin`
// resolvem via fallback (derivação pelas funções puras do GOAL-23A ou default
// honesto), sem crashar nem inventar dados.
//
// Regras de fallback (ver docs/workouts/GYMFLOW_SESSION_DOMAIN.md):
//   - sessão sem `status`           → deriva por `deriveSessionStatus` (séries);
//   - exercício sem `entryStatus`   → deriva por `deriveExerciseEntryStatus`;
//   - exercício sem `entryOrigin`   → `planned` (legado = tudo planejado).
// A normalização do GOAL-23A já carimba `status` na hidratação para a maioria dos
// casos; estes fallbacks são a rede de segurança para dado não-normalizado.

import type {
  ActiveExercise,
  WorkoutExerciseEntryOrigin,
  WorkoutExerciseEntryStatus,
  WorkoutSession,
  WorkoutSessionStatus,
} from '../types';
import {
  deriveExerciseEntryStatus,
  deriveSessionStatus,
  type FinalizedSessionStatus,
} from './workout-session-domain';

/** Status de apresentação de uma sessão: inclui `active` (treino em andamento). */
export type SessionStatusView = WorkoutSessionStatus;

/** Status finalizado visto pela UI (sem `active`). */
export type FinalizedStatusView = FinalizedSessionStatus;

/** Estilo de um badge: rótulo + classes de cor (badge e ponto). */
export interface BadgeStyle {
  label: string;
  /** Classes Tailwind de cor para o badge (bg/text/border). */
  className: string;
  /** Classe de cor do ponto indicador (ex.: `bg-gym-emerald`). */
  dotClassName: string;
}

// --- Status da sessão ---------------------------------------------------

export const SESSION_STATUS_STYLES: Record<SessionStatusView, BadgeStyle> = {
  completed: {
    label: 'Concluída',
    className: 'bg-gym-emerald/15 text-gym-emerald border-gym-emerald/25',
    dotClassName: 'bg-gym-emerald',
  },
  partial: {
    label: 'Parcial',
    className: 'bg-amber-400/15 text-amber-400 border-amber-400/25',
    dotClassName: 'bg-amber-400',
  },
  abandoned: {
    label: 'Abandonada',
    className: 'bg-gym-rose/15 text-gym-rose border-gym-rose/25',
    dotClassName: 'bg-gym-rose',
  },
  active: {
    label: 'Em andamento',
    className: 'bg-gym-accent/15 text-gym-accent border-gym-accent/25',
    dotClassName: 'bg-gym-accent',
  },
};

/**
 * Resolve o status de apresentação da sessão. Usa `session.status` quando presente
 * (já normalizado pelo GOAL-23A); caso contrário deriva a partir da conclusão das
 * séries — fallback defensivo para sessões legadas não-normalizadas.
 */
export function resolveSessionStatus(session: WorkoutSession): SessionStatusView {
  if (session.status) return session.status;
  return deriveSessionStatus(session.exercises);
}

/** Estilo (label + cores) do status da sessão. */
export function sessionStatusStyle(session: WorkoutSession): BadgeStyle {
  return SESSION_STATUS_STYLES[resolveSessionStatus(session)];
}

// --- Origem da entrada --------------------------------------------------

export const ENTRY_ORIGIN_STYLES: Record<WorkoutExerciseEntryOrigin, BadgeStyle> = {
  planned: {
    label: 'Planejado',
    className: 'bg-white/5 text-gym-text-muted border-white/10',
    dotClassName: 'bg-gym-text-muted',
  },
  added: {
    label: 'Adicionado',
    className: 'bg-gym-accent/15 text-gym-accent border-gym-accent/25',
    dotClassName: 'bg-gym-accent',
  },
  swapped: {
    label: 'Substituído',
    className: 'bg-amber-400/15 text-amber-400 border-amber-400/25',
    dotClassName: 'bg-amber-400',
  },
};

/**
 * Resolve a origem de uma entrada. Legado (sem `entryOrigin`) é tratado como
 * `planned` — toda entrada de uma sessão pré-GOAL-23A veio do plano inicial.
 */
export function resolveEntryOrigin(exercise: ActiveExercise): WorkoutExerciseEntryOrigin {
  return exercise.entryOrigin ?? 'planned';
}

/** Estilo (label + cores) da origem da entrada. */
export function entryOriginStyle(exercise: ActiveExercise): BadgeStyle {
  return ENTRY_ORIGIN_STYLES[resolveEntryOrigin(exercise)];
}

// --- Estado de execução -------------------------------------------------

export const ENTRY_STATUS_STYLES: Record<WorkoutExerciseEntryStatus, BadgeStyle> = {
  planned: {
    label: 'Planejado',
    className: 'bg-white/5 text-gym-text-muted border-white/10',
    dotClassName: 'bg-gym-text-muted',
  },
  performed: {
    label: 'Realizado',
    className: 'bg-gym-emerald/15 text-gym-emerald border-gym-emerald/25',
    dotClassName: 'bg-gym-emerald',
  },
  partial: {
    label: 'Parcial',
    className: 'bg-amber-400/15 text-amber-400 border-amber-400/25',
    dotClassName: 'bg-amber-400',
  },
  skipped: {
    label: 'Pulado',
    className: 'bg-gym-rose/15 text-gym-rose border-gym-rose/25',
    dotClassName: 'bg-gym-rose',
  },
};

/**
 * Resolve o estado de execução de uma entrada. Usa `exercise.entryStatus` quando
 * presente (gravado pela finalização do GOAL-23A); caso contrário deriva a partir
 * da conclusão das séries — fallback defensivo para sessões legadas/ativas.
 */
export function resolveEntryStatus(exercise: ActiveExercise): WorkoutExerciseEntryStatus {
  return exercise.entryStatus ?? deriveExerciseEntryStatus(exercise);
}

/** Estilo (label + cores) do estado de execução da entrada. */
export function entryStatusStyle(exercise: ActiveExercise): BadgeStyle {
  return ENTRY_STATUS_STYLES[resolveEntryStatus(exercise)];
}

// --- Contagem de séries e exercícios ------------------------------------
//
// As contagens usam `deriveExerciseEntryStatus` (sempre derivado das séries), não
// `resolveEntryStatus`. Motivo: na sessão ATIVA o `entryStatus` fica em `planned`
// desde o início (mesmo com séries presentes), então o resolver retornaria
// `planned` e não refletiria o progresso real. Para sessões finalizadas o
// `entryStatus` gravado pela finalização é exatamente `deriveExerciseEntryStatus`,
// logo derivar direto produz o mesmo resultado — funciona nos dois contextos.

/** Total de séries (concluídas + incompletas) de todos os exercícios. */
export function countTotalSets(exercises: ActiveExercise[]): number {
  return exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
}

/** Séries concluídas de todos os exercícios. */
export function countCompletedSets(exercises: ActiveExercise[]): number {
  return exercises.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.completed).length,
    0,
  );
}

/** Séries incompletas (não concluídas) de todos os exercícios. */
export function countIncompleteSets(exercises: ActiveExercise[]): number {
  return countTotalSets(exercises) - countCompletedSets(exercises);
}

/** Exercícios totalmente realizados (todas as séries concluídas e há séries). */
export function countPerformedExercises(exercises: ActiveExercise[]): number {
  return exercises.filter((ex) => deriveExerciseEntryStatus(ex) === 'performed').length;
}

/** Exercícios pulados (têm séries mas nenhuma concluída). */
export function countSkippedExercises(exercises: ActiveExercise[]): number {
  return exercises.filter((ex) => deriveExerciseEntryStatus(ex) === 'skipped').length;
}

// --- Resumo da sessão ---------------------------------------------------

export interface SessionSummary {
  status: SessionStatusView;
  statusStyle: BadgeStyle;
  totalExercises: number;
  performedExercises: number;
  skippedExercises: number;
  totalSets: number;
  completedSets: number;
  incompleteSets: number;
}

/**
 * Monta o resumo de apresentação da sessão: status resolvido + contagens de
 * exercícios e séries. Defensivo para sessões legadas (sem status/entryStatus).
 */
export function buildSessionSummary(session: WorkoutSession): SessionSummary {
  const exercises = session.exercises;
  return {
    status: resolveSessionStatus(session),
    statusStyle: sessionStatusStyle(session),
    totalExercises: exercises.length,
    performedExercises: countPerformedExercises(exercises),
    skippedExercises: countSkippedExercises(exercises),
    totalSets: countTotalSets(exercises),
    completedSets: countCompletedSets(exercises),
    incompleteSets: countIncompleteSets(exercises),
  };
}

/**
 * Monta o resumo de PRÉVIA da finalização (treino ativo): ignora o `status`
 * armazenado (`active`) e deriva o status final a partir das séries, refletindo
 * o que a sessão vai se tornar ao concluir. Usado no resumo final do treino ativo.
 */
export function buildSessionPreview(session: WorkoutSession): SessionSummary {
  const exercises = session.exercises;
  const status = deriveSessionStatus(exercises);
  return {
    status,
    statusStyle: SESSION_STATUS_STYLES[status],
    totalExercises: exercises.length,
    performedExercises: countPerformedExercises(exercises),
    skippedExercises: countSkippedExercises(exercises),
    totalSets: countTotalSets(exercises),
    completedSets: countCompletedSets(exercises),
    incompleteSets: countIncompleteSets(exercises),
  };
}
