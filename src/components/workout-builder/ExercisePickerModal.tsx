'use client';

import React, { useMemo, useState } from 'react';
import { Check, Info, Plus, Search, X } from 'lucide-react';
import type { Exercise } from '../../types';
import type { WorkoutDayBuilderDraft } from '../../types/workout-builder';
import { filterExercisesByDayFocus } from '../../lib/workout-builder';
import { dayDisplayName } from '../../lib/workout-builder';

interface ExercisePickerModalProps {
  isOpen: boolean;
  day: WorkoutDayBuilderDraft;
  exercises: readonly Exercise[];
  countInDay: (exerciseId: string) => number;
  otherDaysWithExercise: (exerciseId: string) => string[];
  onAdd: (exercise: Exercise) => void;
  onClose: () => void;
}

type FocusMode = 'focus' | 'all';

/**
 * GOAL-19A/PART-9: seletor de exercícios com filtro simples de foco.
 *
 * O filtro NÃO ordena, NÃO pontua e NÃO sugere — só restringe a lista ao foco do dia.
 * Ranking, score, substituição inteligente e equipamento disponível são GOAL-20.
 */
export const ExercisePickerModal = ({
  isOpen,
  day,
  exercises,
  countInDay,
  otherDaysWithExercise,
  onAdd,
  onClose,
}: ExercisePickerModalProps) => {
  const [search, setSearch] = useState('');
  const hasFocus = day.muscleGroupIds.length > 0;
  const [mode, setMode] = useState<FocusMode>('focus');
  const effectiveMode: FocusMode = hasFocus ? mode : 'all';

  const { visible, usesLegacyClassification } = useMemo(() => {
    const filtered = effectiveMode === 'focus'
      ? filterExercisesByDayFocus(exercises, day.muscleGroupIds)
      : { exercises: [...exercises], usesLegacyClassification: false };
    const term = search.trim().toLowerCase();
    return {
      visible: term
        ? filtered.exercises.filter((exercise) => exercise.name.toLowerCase().includes(term))
        : filtered.exercises,
      usesLegacyClassification: filtered.usesLegacyClassification,
    };
  }, [exercises, day.muscleGroupIds, effectiveMode, search]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-picker-title"
        onClick={(event) => event.stopPropagation()}
        className="bg-gym-dark border border-white/10 rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="p-5 border-b border-white/5 space-y-3 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 id="exercise-picker-title" className="text-sm font-bold text-white">Adicionar ao Dia {day.dayNumber}</h3>
              <p className="text-[10px] text-gym-text-muted truncate">{dayDisplayName(day)}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gym-text-muted hover:text-white bg-white/5 rounded-lg tap-target flex-shrink-0"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gym-text-muted" />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome..."
              className="w-full bg-gym-card border border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-gym-accent"
            />
          </div>

          {hasFocus && (
            <div className="flex gap-1.5">
              {([
                { id: 'focus', label: 'Foco do dia' },
                { id: 'all', label: 'Todos os exercícios' },
              ] as const).map((option) => (
                <button
                  key={option.id}
                  onClick={() => setMode(option.id)}
                  className={`min-h-[36px] py-1.5 px-3 rounded-lg text-[10px] font-bold transition-all ${
                    effectiveMode === option.id ? 'bg-gym-accent text-gym-dark' : 'bg-white/5 text-gym-text-muted hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {effectiveMode === 'focus' && usesLegacyClassification && (
            <p className="text-[10px] text-amber-400 flex items-start gap-1.5 leading-relaxed">
              <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
              Alguns exercícios usam classificação legada.
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {visible.length === 0 ? (
            <p className="text-xs text-gym-text-muted text-center py-8">
              Nenhum exercício encontrado{effectiveMode === 'focus' ? ' para este foco' : ''}.
            </p>
          ) : (
            visible.map((exercise) => {
              const inDay = countInDay(exercise.id);
              const alsoIn = otherDaysWithExercise(exercise.id);
              return (
                <button
                  key={exercise.id}
                  onClick={() => onAdd(exercise)}
                  className={`w-full text-left border rounded-xl p-3 flex items-center justify-between transition-all min-h-[44px] ${
                    inDay > 0
                      ? 'bg-gym-accent/5 border-gym-accent/20 hover:border-gym-accent/40'
                      : 'bg-white/5 border-white/5 hover:bg-gym-accent/10 hover:border-gym-accent/30'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-white truncate">{exercise.name}</h4>
                      {inDay > 0 && (
                        <span className="flex-shrink-0 text-[8px] font-black uppercase bg-gym-accent/15 text-gym-accent px-1.5 py-0.5 rounded-full">
                          No treino ×{inDay}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gym-text-muted capitalize mt-0.5 truncate">
                      {exercise.muscleGroup} • {exercise.equipment}
                    </p>
                    {alsoIn.length > 0 && (
                      <p className="text-[9px] text-gym-text-muted mt-0.5 truncate">
                        Já está no {alsoIn.join(', ')}
                      </p>
                    )}
                  </div>
                  <span className="flex-shrink-0 ml-2 flex items-center gap-1.5">
                    {inDay > 0 && (
                      <span className="text-[9px] text-gym-accent font-bold whitespace-nowrap hidden sm:inline">
                        Adicionar novamente
                      </span>
                    )}
                    <Plus className="w-4 h-4 text-gym-accent" />
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="p-3 border-t border-white/5 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full min-h-[44px] bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" /> Concluir ({day.slots.length}{' '}
            {day.slots.length === 1 ? 'exercício' : 'exercícios'})
          </button>
        </div>
      </div>
    </div>
  );
};
