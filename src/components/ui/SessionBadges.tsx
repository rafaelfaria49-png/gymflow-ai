'use client';

import React from 'react';
import type {
  ActiveExercise,
  WorkoutExerciseEntryStatus,
  WorkoutSession,
} from '../../types';
import {
  ENTRY_STATUS_STYLES,
  entryOriginStyle,
  entryStatusStyle,
  sessionStatusStyle,
  type BadgeStyle,
} from '../../lib/workout-session-view';

const BADGE_BASE =
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider leading-none whitespace-nowrap';

interface BadgeProps {
  style: BadgeStyle;
  showDot?: boolean;
  className?: string;
}

function Badge({ style, showDot = true, className }: BadgeProps) {
  return (
    <span className={`${BADGE_BASE} ${style.className}${className ? ` ${className}` : ''}`}>
      {showDot && (
        <span className={`w-1.5 h-1.5 rounded-full ${style.dotClassName}`} aria-hidden="true" />
      )}
      {style.label}
    </span>
  );
}

/** Badge do status da sessão (Concluída / Parcial / Abandonada / Em andamento). */
export function SessionStatusBadge({
  session,
  showDot = true,
  className,
}: {
  session: WorkoutSession;
  showDot?: boolean;
  className?: string;
}) {
  return <Badge style={sessionStatusStyle(session)} showDot={showDot} className={className} />;
}

/** Badge da origem do exercício (Planejado / Adicionado / Substituído). */
export function ExerciseOriginBadge({
  exercise,
  showDot = true,
  className,
}: {
  exercise: ActiveExercise;
  showDot?: boolean;
  className?: string;
}) {
  return <Badge style={entryOriginStyle(exercise)} showDot={showDot} className={className} />;
}

/**
 * Badge do estado de execução do exercício (Realizado / Parcial / Pulado /
 * Planejado). Por padrão resolve do `exercise` (bom para histórico, onde o
 * `entryStatus` foi gravado na finalização). Para o treino ATIVO, passe `status`
 * derivado ao vivo por `deriveExerciseEntryStatus` — o `entryStatus` da sessão
 * ativa fica em `planned` até a finalização e não reflete o progresso das séries.
 */
export function ExerciseExecutionBadge({
  exercise,
  status,
  showDot = true,
  className,
}: {
  exercise?: ActiveExercise;
  status?: WorkoutExerciseEntryStatus;
  showDot?: boolean;
  className?: string;
}) {
  const style =
    status !== undefined ? ENTRY_STATUS_STYLES[status] : entryStatusStyle(exercise as ActiveExercise);
  return <Badge style={style} showDot={showDot} className={className} />;
}
