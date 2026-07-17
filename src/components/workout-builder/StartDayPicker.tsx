'use client';

import React from 'react';
import { Play, X } from 'lucide-react';
import type { WorkoutDayBuilderDraft } from '../../types/workout-builder';
import { dayDisplayName } from '../../lib/workout-builder';

interface StartDayPickerProps {
  isOpen: boolean;
  days: readonly WorkoutDayBuilderDraft[];
  onSelect: (dayId: string) => void;
  onCancel: () => void;
}

/**
 * GOAL-19A/PART-14: em um programa multi-dia, "Iniciar Agora" pergunta QUAL dia.
 * Iniciar o Dia 1 em silêncio seria escolher pelo usuário. Dias sem exercício não
 * são iniciáveis e aparecem desabilitados, com o motivo à mostra.
 */
export const StartDayPicker = ({ isOpen, days, onSelect, onCancel }: StartDayPickerProps) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-day-picker-title"
        onClick={(event) => event.stopPropagation()}
        className="bg-gym-dark border border-white/10 rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="p-5 border-b border-white/5 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="min-w-0">
            <h3 id="start-day-picker-title" className="text-sm font-bold text-white">Qual dia você vai treinar agora?</h3>
            <p className="text-[10px] text-gym-text-muted mt-0.5">
              Isto não altera o seu planejamento semanal.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-gym-text-muted hover:text-white bg-white/5 rounded-lg tap-target flex-shrink-0"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {days.map((day) => {
            const startable = day.slots.length > 0;
            return (
              <button
                key={day.id}
                disabled={!startable}
                onClick={() => onSelect(day.id)}
                className={`w-full text-left border rounded-xl p-3 flex items-center justify-between gap-2 transition-all min-h-[44px] ${
                  startable
                    ? 'bg-white/5 border-white/5 hover:bg-gym-accent/10 hover:border-gym-accent/30'
                    : 'bg-white/[0.02] border-white/5 opacity-50 cursor-not-allowed'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-[9px] font-black uppercase tracking-wider text-gym-accent">
                    Dia {day.dayNumber}
                  </span>
                  <span className="block text-xs font-bold text-white truncate">{dayDisplayName(day)}</span>
                  <span className="block text-[10px] text-gym-text-muted">
                    {startable
                      ? `${day.slots.length} ${day.slots.length === 1 ? 'exercício' : 'exercícios'}`
                      : 'Sem exercícios ainda'}
                  </span>
                </span>
                {startable && <Play className="w-4 h-4 text-gym-accent fill-gym-accent flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
