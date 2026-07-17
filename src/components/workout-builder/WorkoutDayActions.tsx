'use client';

import React from 'react';
import { ArrowLeft, ArrowRight, Copy, Trash2 } from 'lucide-react';

interface WorkoutDayActionsProps {
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canDuplicate: boolean;
  canRemove: boolean;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

/** GOAL-19A: ações do dia selecionado (PART 7). Reordenar usa botões — sem lib nova. */
export const WorkoutDayActions = ({
  canMoveLeft,
  canMoveRight,
  canDuplicate,
  canRemove,
  onMove,
  onDuplicate,
  onRemove,
}: WorkoutDayActionsProps) => (
  <div className="flex items-center gap-1 flex-shrink-0">
    <button
      onClick={() => onMove(-1)}
      disabled={!canMoveLeft}
      className="p-2 bg-white/5 rounded-lg disabled:opacity-30 text-white tap-target"
      title="Mover dia para trás"
      aria-label="Mover dia para trás"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
    </button>
    <button
      onClick={() => onMove(1)}
      disabled={!canMoveRight}
      className="p-2 bg-white/5 rounded-lg disabled:opacity-30 text-white tap-target"
      title="Mover dia para frente"
      aria-label="Mover dia para frente"
    >
      <ArrowRight className="w-3.5 h-3.5" />
    </button>
    <button
      onClick={onDuplicate}
      disabled={!canDuplicate}
      className="p-2 bg-white/5 rounded-lg disabled:opacity-30 text-white tap-target"
      title="Duplicar dia"
      aria-label="Duplicar dia"
    >
      <Copy className="w-3.5 h-3.5" />
    </button>
    <button
      onClick={onRemove}
      disabled={!canRemove}
      className="p-2 bg-gym-rose/10 rounded-lg disabled:opacity-30 text-gym-rose tap-target"
      title={canRemove ? 'Remover dia' : 'O programa precisa de pelo menos um dia'}
      aria-label="Remover dia"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  </div>
);
