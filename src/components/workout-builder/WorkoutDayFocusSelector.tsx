'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { MuscleGroupId } from '../../types/training-taxonomy';
import {
  PRIMARY_FOCUS_GROUPS,
  SECONDARY_FOCUS_GROUPS,
  muscleGroupShortLabel,
} from '../../lib/workout-day-naming';

interface WorkoutDayFocusSelectorProps {
  selected: readonly MuscleGroupId[];
  onToggle: (muscleGroupId: MuscleGroupId) => void;
}

const Chip = ({
  id,
  active,
  onToggle,
}: {
  id: MuscleGroupId;
  active: boolean;
  onToggle: (id: MuscleGroupId) => void;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={() => onToggle(id)}
    className={`min-h-[36px] px-3 rounded-xl text-[11px] font-bold border transition-all ${
      active
        ? 'bg-gym-accent/15 border-gym-accent text-gym-accent'
        : 'bg-white/5 border-white/5 text-gym-text-muted hover:text-white hover:border-white/20'
    }`}
  >
    {muscleGroupShortLabel(id)}
  </button>
);

/**
 * GOAL-19A: foco muscular do dia (PART 5).
 *
 * O foco organiza o dia e gera o nome automático. NÃO escolhe exercícios — no
 * GOAL-19A ele apenas prepara o filtro do seletor; ranking e sugestão são GOAL-20.
 */
export const WorkoutDayFocusSelector = ({ selected, onToggle }: WorkoutDayFocusSelectorProps) => {
  const hasSecondarySelected = SECONDARY_FOCUS_GROUPS.some((id) => selected.includes(id));
  const [showMore, setShowMore] = useState(hasSecondarySelected);

  return (
    <div>
      <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">
        Foco muscular do dia
      </label>

      <div className="flex flex-wrap gap-1.5">
        {PRIMARY_FOCUS_GROUPS.map((id) => (
          <Chip key={id} id={id} active={selected.includes(id)} onToggle={onToggle} />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowMore((prev) => !prev)}
        className="mt-2 text-[10px] font-bold text-gym-text-muted hover:text-white flex items-center gap-1"
      >
        {showMore ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showMore ? 'Menos grupos' : 'Mais grupos'}
      </button>

      {showMore && (
        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-white/5">
          {SECONDARY_FOCUS_GROUPS.map((id) => (
            <Chip key={id} id={id} active={selected.includes(id)} onToggle={onToggle} />
          ))}
        </div>
      )}

      <p className="text-[9px] text-gym-text-muted mt-2 leading-relaxed">
        O foco organiza o dia e gera o nome automático. Ele não escolhe exercícios por você.
      </p>
    </div>
  );
};
