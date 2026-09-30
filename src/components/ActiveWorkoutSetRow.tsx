'use client';

import React, { useRef } from 'react';
import { Check } from 'lucide-react';
import type { WorkoutSet } from '../types';
import { NumericInput } from './ui/NumericInput';
import { createTrainingActionGuard } from '../lib/training-action-guard';

interface ActiveWorkoutSetRowProps {
  set: WorkoutSet;
  displayIndex: number;
  warmupIndex?: number;
  showRir?: boolean;
  isCurrentFocus?: boolean;
  targetReps?: string;
  onUpdate: (fields: Partial<WorkoutSet>) => void;
  onToggle: () => void;
}

function formatWeight(value?: number) {
  return value === undefined ? 'Sem registro' : value.toLocaleString('pt-BR') + ' kg';
}

export function ActiveWorkoutSetRow({ set, displayIndex, warmupIndex, showRir = false, isCurrentFocus = false, targetReps, onUpdate, onToggle }: ActiveWorkoutSetRowProps) {
  const guard = useRef(createTrainingActionGuard());
  const description = set.isWarmup ? 'aquecimento ' + ((warmupIndex ?? 0) + 1) : 'série ' + (displayIndex + 1);
  return (
    <div id={'set-row-' + set.id} className={'space-y-3 rounded-xl border p-3 ' + (set.completed ? 'border-gym-accent/20 bg-gym-accent/5' : isCurrentFocus ? 'border-gym-accent/60 bg-gym-accent/[0.08]' : 'border-white/10 bg-white/5')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-white">{set.isWarmup ? 'Aquecimento ' + ((warmupIndex ?? 0) + 1) : 'Série ' + (displayIndex + 1)}</span>
        <span className="text-xs font-bold text-gym-accent">{set.completed ? 'Concluída' : isCurrentFocus ? 'Série atual' : 'Pendente'}</span>
      </div>
      {!set.isWarmup && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <p className="text-gym-text-muted">Carga anterior<span className="mt-1 block font-semibold text-white">{formatWeight(set.lastWeight)}</span></p>
          <p className="text-gym-text-muted">Carga sugerida<span className="mt-1 block font-semibold text-gym-accent">{formatWeight(set.suggestedWeight)}</span></p>
        </div>
      )}
      {targetReps && <p className="text-xs text-gym-text-muted">Repetições alvo: <span className="font-bold text-white">{targetReps}</span></p>}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-gym-text-muted">
          Carga (kg)
          <NumericInput value={set.weight} allowDecimal min={0} disabled={set.completed}
            aria-label={'Carga da ' + description + ' (kg)'}
            onValidChange={value => onUpdate({ weight: value })} onCommit={value => onUpdate({ weight: value ?? 0 })}
            className="mt-1 min-h-[44px] w-full rounded-lg border border-white/15 bg-gym-dark/60 px-2 text-center text-base text-white outline-none focus:border-gym-accent" />
        </label>
        <label className="text-xs font-semibold text-gym-text-muted">
          Repetições feitas
          <NumericInput value={set.reps} min={0} disabled={set.completed}
            aria-label={'Repetições feitas da ' + description}
            onValidChange={value => onUpdate({ reps: value })} onCommit={value => onUpdate({ reps: value ?? 0 })}
            className="mt-1 min-h-[44px] w-full rounded-lg border border-white/15 bg-gym-dark/60 px-2 text-center text-base text-white outline-none focus:border-gym-accent" />
        </label>
      </div>
      <button type="button" onClick={() => { if (guard.current(set.id)) onToggle(); }}
        aria-label={set.completed ? 'Desmarcar ' + description : 'Concluir ' + description}
        className={'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold ' + (set.completed ? 'border border-white/15 bg-white/5 text-gym-text-muted' : 'bg-gym-accent text-gym-dark')}>
        <Check className="h-4 w-4" />{set.completed ? 'Desmarcar série' : 'Concluir série'}
      </button>
      {!set.isWarmup && <details className="border-t border-white/10 pt-1">
        <summary className="flex min-h-[44px] cursor-pointer items-center text-xs font-semibold text-gym-text-muted">Mais detalhes · esforço opcional</summary>
        <p className="mb-2 text-xs leading-relaxed text-gym-text-muted">Esforço de 1 a 10: 1 é muito leve, 10 é seu máximo.</p>
        <label className="text-xs text-gym-text-muted">Esforço (1–10)
          <NumericInput value={set.rpe ?? null} min={1} max={10} emptyBehavior="null" placeholder="Opcional" disabled={set.completed}
            aria-label={'Esforço da ' + description + ' de 1 a 10'}
            onValidChange={value => onUpdate({ rpe: value })} onCommit={value => onUpdate({ rpe: value ?? undefined })}
            className="mt-1 min-h-[44px] w-full rounded-lg border border-white/15 bg-gym-dark/60 px-3 text-base text-white" />
        </label>
        {showRir && <fieldset className="mt-3">
          <legend className="text-xs text-white">Quantas repetições ainda conseguiria fazer?</legend>
          <p className="my-1 text-xs text-gym-text-muted">Repetições em reserva: 0 significa que chegou ao limite. Opcional.</p>
          <div className="flex flex-wrap gap-1.5">{[0,1,2,3,4,5].map(value =>
            <button key={value} type="button" disabled={set.completed} aria-pressed={set.rir === value}
              aria-label={value + ' repetições em reserva'}
              onClick={() => onUpdate({ rir: set.rir === value ? undefined : value })}
              className={'min-h-[44px] min-w-[44px] rounded-lg border px-2 text-sm disabled:opacity-40 ' + (set.rir === value ? 'border-gym-accent bg-gym-accent text-gym-dark' : 'border-white/15 text-gym-text-muted')}>
              {value}
            </button>)}</div>
        </fieldset>}
      </details>}
    </div>
  );
}
