// GOAL-23A: fundação do domínio de sessão de treino.
//
// Separa três estágios do ciclo de vida de um treino, hoje colapsados num único
// `WorkoutSession`:
//   - SessionPlan   → o que foi planejado (origem imutável dos exercícios);
//   - ActiveSession → o treino em andamento (status `active`, com `startedAt`);
//   - SessionLog    → o registro final gravado no histórico.
//
// Nada aqui altera o formato físico do storage v1: os campos novos entram como
// OPCIONAIS em `WorkoutSession`/`ActiveExercise` (ver ./index), preservando as
// fixtures antigas. As funções puras que operam sobre estes tipos vivem em
// src/lib/workout-session-domain.ts.

import type { WorkoutSession } from './index';

/**
 * Situação de uma sessão.
 * - `active`    → em andamento (única situação de um treino não finalizado);
 * - `completed` → todas as séries existentes foram concluídas;
 * - `partial`   → pelo menos uma série concluída e pelo menos uma incompleta;
 * - `abandoned` → nenhuma série concluída.
 */
export type WorkoutSessionStatus = 'active' | 'completed' | 'partial' | 'abandoned';

/**
 * Origem de uma entrada (exercício) dentro da sessão — de ONDE ela veio.
 * Independente do estado de execução.
 * - `planned` → veio do plano inicial (dia de programa, programa flat ou o
 *   exercício padrão de um treino livre);
 * - `added`   → adicionado manualmente durante o treino;
 * - `swapped` → substituiu um exercício; `plannedExerciseId` mantém o original.
 */
export type WorkoutExerciseEntryOrigin = 'planned' | 'added' | 'swapped';

/**
 * Estado de execução de uma entrada — o QUE foi feito com ela.
 * Separado da origem de propósito.
 * - `planned`   → ainda não há dados de execução (sessão ativa / sem séries);
 * - `performed` → todas as séries concluídas;
 * - `partial`   → parte das séries concluída;
 * - `skipped`   → possui séries mas nenhuma concluída.
 */
export type WorkoutExerciseEntryStatus = 'planned' | 'performed' | 'partial' | 'skipped';

/**
 * GOAL-24: motivo estruturado de uma substituição de exercício. Registrado no
 * momento da troca (não altera volume/PR/XP/progressão).
 * - `equipment-occupied`    → o equipamento planejado está ocupado agora;
 * - `equipment-unavailable` → o equipamento não existe/quebrou na academia;
 * - `discomfort`            → desconforto ao executar (apenas registrado, sem
 *   adaptação automática — a decisão de progressão continua manual);
 * - `preference`            → preferência pessoal pelo substituto;
 * - `technique-fit`         → o substituto cai melhor na técnica/execução do dia;
 * - `other`                 → outro motivo (exige nota livre descrevendo).
 */
export type WorkoutSwapReasonCode =
  | 'equipment-occupied'
  | 'equipment-unavailable'
  | 'discomfort'
  | 'preference'
  | 'technique-fit'
  | 'other';

export type SessionPlanOrigin = 'program-day' | 'legacy-program' | 'free';

/**
 * Uma entrada do plano da sessão. A identidade é POSICIONAL: `ExerciseSlot` não
 * tem id (decisão GOAL-23A), então `plannedSlotIndex` (0-based) liga a entrada
 * ativa (`ActiveExercise.plannedSlotIndex`) ao slot planejado.
 */
export interface SessionPlanEntry {
  plannedSlotIndex: number;
  exerciseId: string;
  series: number;
  repRange?: [number, number];
  targetRPE?: number;
  restSec?: number;
}

/** Plano imutável derivado da origem escolhida no início do treino. */
export interface SessionPlan {
  origin: SessionPlanOrigin;
  name: string;
  entries: SessionPlanEntry[];
  sourceProgramId?: string;
  sourceProgramDayId?: string;
  sourceProgramName?: string;
  sourceProgramDayName?: string;
}

/**
 * Sessão em andamento: pareia o plano imutável com a `WorkoutSession` mutável
 * (status `active`, `startedAt` definido). Conceito de domínio — o contexto
 * persiste apenas `session` como `activeWorkout` (o plano é reconstruível a
 * partir dos campos `planned*`/`entry*` de cada `ActiveExercise`).
 */
export interface ActiveSession {
  plan: SessionPlan;
  session: WorkoutSession;
}

/**
 * Registro final de uma sessão finalizada (`completed`/`partial`/`abandoned`),
 * com `endedAt` definido. É o snapshot que vai para `workoutHistory`.
 */
export interface SessionLog {
  session: WorkoutSession;
}
