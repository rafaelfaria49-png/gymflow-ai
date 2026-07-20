import { Plus } from 'lucide-react';
import type { Exercise } from '../../types';
import {
  getWorkoutPickerItemMetadata,
  type DayFocusExerciseItem,
} from '../../lib/workout-picker';

interface ExercisePickerItemProps {
  item: DayFocusExerciseItem;
  inDay: number;
  alsoIn: readonly string[];
  onAdd: (exercise: Exercise) => void;
}

export const ExercisePickerItem = ({
  item,
  inDay,
  alsoIn,
  onAdd,
}: ExercisePickerItemProps) => {
  const { exercise } = item;
  const metadata = getWorkoutPickerItemMetadata(item);

  return (
    <button
      type="button"
      onClick={() => onAdd(exercise)}
      aria-label={`Adicionar ${exercise.name}. Grupo principal: ${metadata.primaryGroupLabel}. Equipamento: ${metadata.equipment}.`}
      className={`w-full min-w-0 text-left border rounded-xl p-3 flex items-center justify-between gap-2 transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gym-accent focus-visible:ring-offset-2 focus-visible:ring-offset-gym-dark ${
        inDay > 0
          ? 'bg-gym-accent/5 border-gym-accent/20 hover:border-gym-accent/40'
          : 'bg-white/5 border-white/5 hover:bg-gym-accent/10 hover:border-gym-accent/30'
      }`}
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 items-center gap-1.5">
          <h4 className="min-w-0 truncate text-xs font-bold text-white">{exercise.name}</h4>
          {inDay > 0 && (
            <span className="flex-shrink-0 text-[8px] font-black uppercase bg-gym-accent/15 text-gym-accent px-1.5 py-0.5 rounded-full">
              No treino ×{inDay}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex min-w-0 max-w-full items-center gap-1 overflow-hidden">
          <span
            title={metadata.primaryGroupLabel}
            className="min-w-0 max-w-[44%] truncate rounded-full border border-gym-accent/25 bg-gym-accent/15 px-1.5 py-0.5 text-[8px] font-bold text-gym-accent"
          >
            {metadata.primaryGroupLabel}
          </span>
          <span
            title={metadata.equipment}
            className="min-w-0 max-w-[44%] truncate rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] text-gym-text-muted"
          >
            {metadata.equipment}
          </span>
          {metadata.legacy && (
            <span className="flex-shrink-0 rounded-full border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[8px] font-black uppercase text-amber-300">
              Legado
            </span>
          )}
        </div>

        {alsoIn.length > 0 && (
          <p className="text-[9px] text-gym-text-muted mt-1 truncate">
            Já está no {alsoIn.join(', ')}
          </p>
        )}
      </div>

      <span className="flex-shrink-0 flex items-center gap-1.5">
        {inDay > 0 && (
          <span className="text-[9px] text-gym-accent font-bold whitespace-nowrap hidden sm:inline">
            Adicionar novamente
          </span>
        )}
        <Plus className="w-4 h-4 text-gym-accent" />
      </span>
    </button>
  );
};
