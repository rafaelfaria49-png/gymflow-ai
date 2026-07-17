'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import type { WorkoutDayBuilderDraft } from '../../types/workout-builder';
import { dayDisplayName } from '../../lib/workout-builder';

interface WorkoutDayTabsProps {
  days: readonly WorkoutDayBuilderDraft[];
  selectedDayId: string;
  canAddDay: boolean;
  onSelect: (dayId: string) => void;
  onAddDay: () => void;
}

/** GOAL-19A: navegação entre os dias. O número vem sempre da posição atual (PART 4). */
export const WorkoutDayTabs = ({
  days,
  selectedDayId,
  canAddDay,
  onSelect,
  onAddDay,
}: WorkoutDayTabsProps) => (
  <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap pb-1" role="tablist" aria-label="Dias do treino">
    {days.map((day) => {
      const active = day.id === selectedDayId;
      return (
        <button
          key={day.id}
          role="tab"
          aria-selected={active}
          onClick={() => onSelect(day.id)}
          className={`flex-shrink-0 min-h-[44px] px-3.5 rounded-xl border text-left transition-all ${
            active
              ? 'bg-gym-accent/15 border-gym-accent'
              : 'bg-white/5 border-white/5 hover:border-white/20'
          }`}
        >
          <span className={`block text-[9px] font-black uppercase tracking-wider ${active ? 'text-gym-accent' : 'text-gym-text-muted'}`}>
            Dia {day.dayNumber}
          </span>
          <span className={`block text-[11px] font-bold max-w-[150px] truncate ${active ? 'text-white' : 'text-gym-text-muted'}`}>
            {dayDisplayName(day)}
          </span>
          <span className="block text-[9px] text-gym-text-muted">
            {day.slots.length} {day.slots.length === 1 ? 'exercício' : 'exercícios'}
          </span>
        </button>
      );
    })}

    {canAddDay && (
      <button
        onClick={onAddDay}
        className="flex-shrink-0 min-h-[44px] px-3.5 rounded-xl border border-dashed border-white/15 bg-transparent text-gym-text-muted hover:text-gym-accent hover:border-gym-accent/40 transition-all flex items-center gap-1.5 text-[11px] font-bold"
      >
        <Plus className="w-4 h-4" />
        Adicionar dia
      </button>
    )}
  </div>
);
