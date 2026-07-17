'use client';

import React, { useEffect, useRef } from 'react';
import { AlertTriangle, CalendarX, Dumbbell, History } from 'lucide-react';
import type { WorkoutProgram } from '../../types';
import type { ProgramDeletionImpact } from '../../lib/workout-program-actions';

interface WorkoutProgramDeleteDialogProps {
  isOpen: boolean;
  program: WorkoutProgram | null;
  impact: ProgramDeletionImpact | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * GOAL-19B/PART-9: confirmação honesta de exclusão de programa customizado.
 *
 * Mostra o impacto real: quantos dias/exercícios saem e quantos dias da semana serão
 * liberados. Deixa explícito o que NÃO é apagado — histórico e a sessão ativa (snapshots
 * independentes do programa). Padrão de acessibilidade igual ao ConfirmDialog.
 */
export const WorkoutProgramDeleteDialog = ({
  isOpen,
  program,
  impact,
  onConfirm,
  onCancel,
}: WorkoutProgramDeleteDialogProps) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    confirmButtonRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen || !program || !impact) return null;

  const weeklyCount = impact.weeklyReferenceDayNames.length;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-program-title"
        aria-describedby="delete-program-description"
        onClick={(event) => event.stopPropagation()}
        className="w-full sm:max-w-sm bg-gym-card border border-white/10 rounded-3xl p-6 shadow-2xl animate-toast-in max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-start gap-3 mb-2">
          <div className="flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center bg-gym-rose/15 text-gym-rose">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h2 id="delete-program-title" className="text-base font-bold text-white pt-1.5 leading-tight">
            Excluir &quot;{program.name}&quot;?
          </h2>
        </div>

        <p id="delete-program-description" className="text-xs text-gym-text-muted leading-relaxed mb-4 pl-[52px]">
          Esta ação remove o treino personalizado deste aparelho e não pode ser desfeita.
        </p>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2.5 bg-white/5 rounded-xl px-3 py-2.5">
            <Dumbbell className="w-4 h-4 text-gym-text-muted flex-shrink-0" />
            <span className="text-[11px] text-white">
              {impact.dayCount} {impact.dayCount === 1 ? 'dia' : 'dias'} · {impact.exerciseCount}{' '}
              {impact.exerciseCount === 1 ? 'exercício' : 'exercícios'}
            </span>
          </div>

          <div className="flex items-center gap-2.5 bg-white/5 rounded-xl px-3 py-2.5">
            <CalendarX className="w-4 h-4 text-gym-text-muted flex-shrink-0" />
            <span className="text-[11px] text-white">
              {weeklyCount === 0
                ? 'Nenhum dia da sua semana usa este programa.'
                : `${weeklyCount} ${weeklyCount === 1 ? 'dia' : 'dias'} da semana `
                  + `(${impact.weeklyReferenceDayNames.join(', ')}) ${weeklyCount === 1 ? 'ficará livre' : 'ficarão livres'}.`}
            </span>
          </div>

          <div className="flex items-start gap-2.5 bg-white/5 rounded-xl px-3 py-2.5">
            <History className="w-4 h-4 text-gym-emerald flex-shrink-0 mt-0.5" />
            <span className="text-[11px] text-gym-text-muted leading-relaxed">
              Seu histórico de treinos e qualquer sessão em andamento são preservados.
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[44px] px-4 rounded-2xl text-xs font-extrabold bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
          >
            Cancelar
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            className="flex-1 min-h-[44px] px-4 rounded-2xl text-xs font-extrabold bg-gym-rose text-white hover:bg-gym-rose/90 transition-all"
          >
            Excluir treino
          </button>
        </div>
      </div>
    </div>
  );
};
