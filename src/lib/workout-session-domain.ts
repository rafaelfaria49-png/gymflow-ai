// GOAL-23A: funções puras do domínio de sessão de treino.
//
// Regras de projeto:
//   - nada aqui muta a sessão ativa nem recalcula volume/PR/XP/progressão;
//   - a finalização RECEBE volume, PRs e XP já calculados pelo fluxo atual e só
//     monta o registro final (status explícito, endedAt, duração, snapshot);
//   - a identidade da entrada é `ActiveExercise.id`; a ligação com o plano é
//     posicional via `plannedSlotIndex` (ExerciseSlot não tem id).
//
// Ver o desenho completo em docs/workouts/GYMFLOW_SESSION_DOMAIN.md.

import type {
  ActiveExercise,
  ActiveSession,
  ExerciseSlot,
  SessionLog,
  SessionPlan,
  SessionPlanEntry,
  WorkoutExerciseEntryStatus,
  WorkoutSession,
  WorkoutSessionStatus,
  WorkoutSwapReasonCode,
} from '../types';

/** Situação de uma sessão já finalizada (nunca `active`). */
export type FinalizedSessionStatus = Exclude<WorkoutSessionStatus, 'active'>;

const DEFAULT_LEGACY_SERIES = 3;
const DEFAULT_FREE_SERIES = 1;

interface LegacyPlanExercise {
  exerciseId: string;
  sets?: number;
  reps?: string;
}

/** Entrada de `buildSessionPlan`, discriminada pela origem resolvida no início. */
export type SessionPlanSource =
  | {
      kind: 'program-day';
      name: string;
      slots: ExerciseSlot[];
      sourceProgramId?: string;
      sourceProgramDayId?: string;
      sourceProgramName?: string;
      sourceProgramDayName?: string;
    }
  | {
      kind: 'legacy-program';
      name: string;
      exercises: LegacyPlanExercise[];
      sourceProgramId?: string;
      sourceProgramName?: string;
    }
  | {
      kind: 'free';
      name: string;
      exerciseIds?: string[];
    };

/** Só as chaves de origem presentes — evita `sourceProgram*: undefined` no plano. */
function definedOrigin(
  source: Partial<Pick<
    SessionPlan,
    'sourceProgramId' | 'sourceProgramDayId' | 'sourceProgramName' | 'sourceProgramDayName'
  >>,
): Partial<SessionPlan> {
  return {
    ...(source.sourceProgramId ? { sourceProgramId: source.sourceProgramId } : {}),
    ...(source.sourceProgramDayId ? { sourceProgramDayId: source.sourceProgramDayId } : {}),
    ...(source.sourceProgramName ? { sourceProgramName: source.sourceProgramName } : {}),
    ...(source.sourceProgramDayName ? { sourceProgramDayName: source.sourceProgramDayName } : {}),
  };
}

/**
 * Constrói o plano imutável da sessão. As entradas saem SEMPRE na ordem da
 * origem (slots, exercícios flat ou ids livres), com `plannedSlotIndex` 0-based
 * — a mesma ordem em que o contexto materializa os `ActiveExercise`.
 */
export function buildSessionPlan(source: SessionPlanSource): SessionPlan {
  if (source.kind === 'program-day') {
    return {
      origin: 'program-day',
      name: source.name,
      entries: source.slots.map((slot, index) => ({
        plannedSlotIndex: index,
        exerciseId: slot.exerciseId,
        series: slot.series,
        repRange: slot.repRange,
        targetRPE: slot.targetRPE,
        restSec: slot.restSec,
      })),
      ...definedOrigin(source),
    };
  }

  if (source.kind === 'legacy-program') {
    return {
      origin: 'legacy-program',
      name: source.name,
      entries: source.exercises.map((exercise, index) => ({
        plannedSlotIndex: index,
        exerciseId: exercise.exerciseId,
        series: exercise.sets && exercise.sets > 0 ? exercise.sets : DEFAULT_LEGACY_SERIES,
      })),
      ...definedOrigin(source),
    };
  }

  return {
    origin: 'free',
    name: source.name,
    entries: (source.exerciseIds ?? []).map((exerciseId, index) => ({
      plannedSlotIndex: index,
      exerciseId,
      series: DEFAULT_FREE_SERIES,
    })),
  };
}

/** Marca uma entrada como planejada, ligando-a ao slot do plano pela posição. */
function applyPlannedOrigin(
  exercise: ActiveExercise,
  entry: SessionPlanEntry | undefined,
): ActiveExercise {
  return {
    ...exercise,
    entryOrigin: 'planned',
    entryStatus: 'planned',
    ...(entry
      ? { plannedSlotIndex: entry.plannedSlotIndex, plannedExerciseId: entry.exerciseId }
      : {}),
  };
}

export interface StartActiveSessionParams {
  plan: SessionPlan;
  sessionId: string;
  name: string;
  date: string;
  startedAt: number;
  /** Exercícios já materializados pelo fluxo atual (com pré-preenchimento). */
  exercises: ActiveExercise[];
}

/**
 * Inicia a sessão ativa: anota cada exercício inicial como `planned`, carimba
 * status `active` + `startedAt` e herda a origem do plano. Não recalcula nada —
 * o pré-preenchimento de carga/reps continua sendo responsabilidade do contexto.
 */
export function startActiveSession(params: StartActiveSessionParams): ActiveSession {
  const { plan } = params;
  const exercises = params.exercises.map((exercise, index) =>
    applyPlannedOrigin(exercise, plan.entries[index]),
  );
  const session: WorkoutSession = {
    id: params.sessionId,
    name: params.name,
    date: params.date,
    duration: 0,
    calories: 0,
    exercises,
    xpEarned: 0,
    status: 'active',
    startedAt: params.startedAt,
    ...(plan.sourceProgramId ? { sourceProgramId: plan.sourceProgramId } : {}),
    ...(plan.sourceProgramDayId ? { sourceProgramDayId: plan.sourceProgramDayId } : {}),
    ...(plan.sourceProgramName ? { sourceProgramName: plan.sourceProgramName } : {}),
    ...(plan.sourceProgramDayName ? { sourceProgramDayName: plan.sourceProgramDayName } : {}),
  };
  return { plan, session };
}

/** GOAL-24: limite de caracteres da nota livre de uma substituição. */
export const MAX_SWAP_REASON_NOTE_LENGTH = 120;

/**
 * Normaliza a nota livre da substituição (GOAL-24): apara espaços nas pontas,
 * trata nota vazia como ausente (`undefined`) e limita ao máximo de caracteres.
 * Pura — sem efeitos colaterais.
 */
export function normalizeSwapReasonNote(note: string | undefined): string | undefined {
  if (note === undefined) return undefined;
  const trimmed = note.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length > MAX_SWAP_REASON_NOTE_LENGTH
    ? trimmed.slice(0, MAX_SWAP_REASON_NOTE_LENGTH)
    : trimmed;
}

export interface MarkEntrySwappedParams {
  /** Exercício que ocupava o slot ANTES desta troca — vira o snapshot na 1ª troca. */
  original: ActiveExercise;
  /** Motivo obrigatório da substituição. */
  reasonCode: WorkoutSwapReasonCode;
  /** Nota livre (obrigatória só p/ `other`) — normalizada/limitada aqui. */
  reasonNote?: string;
  /** Epoch ms da troca — recebido de fora para manter a função pura. */
  swappedAt: number;
}

/**
 * Campos do snapshot do exercício ORIGINAL preservado numa substituição.
 * `plannedExerciseId` já existente continua sendo o id do original.
 */
function originalSnapshot(
  original: ActiveExercise,
): Partial<Pick<ActiveExercise, 'plannedExerciseId' | 'plannedExerciseName' | 'plannedMuscleGroup'>> {
  // Troca sucessiva: o `original` já é uma entrada substituída e carrega o snapshot
  // da PRIMEIRA troca — preserva-se exatamente (inclusive parcial, em legado 23A).
  if (original.entryOrigin === 'swapped') {
    return {
      ...(original.plannedExerciseId !== undefined ? { plannedExerciseId: original.plannedExerciseId } : {}),
      ...(original.plannedExerciseName !== undefined ? { plannedExerciseName: original.plannedExerciseName } : {}),
      ...(original.plannedMuscleGroup !== undefined ? { plannedMuscleGroup: original.plannedMuscleGroup } : {}),
    };
  }
  // Primeira troca: o exercício que estava aqui (planned OU added) vira o original.
  return {
    plannedExerciseId: original.plannedExerciseId ?? original.exerciseId,
    plannedExerciseName: original.name,
    plannedMuscleGroup: original.muscleGroup,
  };
}

/**
 * Marca uma entrada como substituída registrando o snapshot estruturado da troca
 * (GOAL-24). `exercise` é a entrada JÁ com o exercício executado atual; `original`
 * é a entrada como estava ANTES desta troca. Na primeira troca preserva id/nome/
 * grupo do original e carimba `entryOrigin: 'swapped'`; nas trocas seguintes mantém
 * o snapshot original e atualiza apenas motivo, nota e `swappedAt`. Não altera
 * séries/reps/carga/RPE/descanso nem recalcula volume/PR/XP/progressão.
 */
export function markEntrySwapped(
  exercise: ActiveExercise,
  { original, reasonCode, reasonNote, swappedAt }: MarkEntrySwappedParams,
): ActiveExercise {
  const note = normalizeSwapReasonNote(reasonNote);
  const next: ActiveExercise = {
    ...exercise,
    ...originalSnapshot(original),
    entryOrigin: 'swapped',
    swapReasonCode: reasonCode,
    swappedAt,
  };
  // A nota reflete SEMPRE a troca atual: gravada quando há texto, removida quando a
  // troca atual não tem nota (não herda a nota de uma substituição anterior).
  if (note !== undefined) {
    next.swapReasonNote = note;
  } else {
    delete next.swapReasonNote;
  }
  return next;
}

/**
 * Estado de execução de um exercício, derivado só da conclusão das séries:
 *   sem séries → planned; nenhuma concluída → skipped;
 *   todas concluídas → performed; caso contrário → partial.
 */
export function deriveExerciseEntryStatus(exercise: ActiveExercise): WorkoutExerciseEntryStatus {
  const total = exercise.sets.length;
  if (total === 0) return 'planned';
  const completed = exercise.sets.filter((set) => set.completed).length;
  if (completed === 0) return 'skipped';
  if (completed === total) return 'performed';
  return 'partial';
}

/**
 * Situação da sessão ao finalizar, contada em nível de SÉRIE:
 *   nenhuma concluída → abandoned; todas concluídas → completed;
 *   parte concluída → partial.
 */
export function deriveSessionStatus(exercises: ActiveExercise[]): FinalizedSessionStatus {
  let total = 0;
  let completed = 0;
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      total += 1;
      if (set.completed) completed += 1;
    }
  }
  if (completed === 0) return 'abandoned';
  if (completed === total) return 'completed';
  return 'partial';
}

/** Deriva `entryStatus` de cada exercício sem tocar em nenhum outro campo. */
function withDerivedEntryStatus(exercises: ActiveExercise[]): ActiveExercise[] {
  return exercises.map((exercise) => ({
    ...exercise,
    entryStatus: deriveExerciseEntryStatus(exercise),
  }));
}

export interface FinalizeSessionParams {
  /** Sessão ativa a finalizar. NÃO é mutada. */
  session: WorkoutSession;
  endedAt: number;
  duration: number;
  calories: number;
  /** Volume, PRs e XP já calculados pelo fluxo atual — apenas gravados aqui. */
  totalVolume: number;
  prsDetected: string[];
  xpEarned: number;
}

/**
 * Monta o registro final. Preserva TODOS os exercícios e séries (inclusive
 * incompletos), grava status derivado + `endedAt` + duração, e usa volume/PR/XP
 * exatamente como recebidos. Não muta a sessão ativa nem recalcula progressão.
 */
export function finalizeSession(params: FinalizeSessionParams): SessionLog {
  const { session } = params;
  const finalized: WorkoutSession = {
    ...session,
    exercises: withDerivedEntryStatus(session.exercises),
    duration: params.duration,
    calories: params.calories,
    xpEarned: params.xpEarned,
    totalVolume: params.totalVolume,
    prsDetected: params.prsDetected,
    status: deriveSessionStatus(session.exercises),
    endedAt: params.endedAt,
  };
  return { session: finalized };
}

export interface BuildAbandonedSessionLogParams {
  session: WorkoutSession;
  endedAt: number;
  duration: number;
}

/**
 * Produz um log `abandoned` preservando o snapshot completo. Para uso FUTURO —
 * hoje `cancelWorkout` continua descartando a sessão sem gravar histórico.
 */
export function buildAbandonedSessionLog(params: BuildAbandonedSessionLogParams): SessionLog {
  const { session } = params;
  const finalized: WorkoutSession = {
    ...session,
    exercises: withDerivedEntryStatus(session.exercises),
    duration: params.duration,
    status: 'abandoned',
    endedAt: params.endedAt,
    totalVolume: session.totalVolume ?? 0,
    prsDetected: session.prsDetected ?? [],
  };
  return { session: finalized };
}
