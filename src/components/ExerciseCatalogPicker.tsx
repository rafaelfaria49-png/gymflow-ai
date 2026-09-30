'use client';

import React, { useMemo, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import type { Exercise } from '../types';
import { filterExerciseCatalog, getCatalogGroupLabel, getExerciseCatalogTabs, type WorkoutPickerTabId } from '../lib/workout-picker';

const PAGE_SIZE = 30;

interface ExerciseCatalogPickerProps {
  exercises: readonly Exercise[];
  onSelect: (exercise: Exercise) => void;
  selectedId?: string | null;
  actionLabel?: string;
  emptyMessage?: string;
}

export function ExerciseCatalogPicker({ exercises, onSelect, selectedId, actionLabel = 'Adicionar', emptyMessage = 'Nenhum exercício disponível.' }: ExerciseCatalogPickerProps) {
  const [category, setCategory] = useState<WorkoutPickerTabId>('all');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const tabs = useMemo(() => getExerciseCatalogTabs(exercises), [exercises]);
  const candidates = useMemo(() => filterExerciseCatalog(exercises, category, search), [exercises, category, search]);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <label className="relative block shrink-0">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gym-text-muted" aria-hidden="true" />
        <span className="sr-only">Buscar exercício</span>
        <input type="search" placeholder="Buscar exercício ou equipamento" value={search}
          onChange={event => { setSearch(event.target.value); setVisibleCount(PAGE_SIZE); }}
          className="min-h-[44px] w-full rounded-xl border border-white/10 bg-gym-card py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-gym-accent" />
      </label>
      <div className="flex max-h-36 shrink-0 flex-wrap gap-1.5 overflow-y-auto" role="group" aria-label="Grupo muscular">
        {tabs.map(tab => <button key={tab.id} type="button" aria-pressed={category === tab.id}
          onClick={() => { setCategory(tab.id); setVisibleCount(PAGE_SIZE); }}
          className={'min-h-[44px] rounded-xl border px-3 text-xs font-bold transition-colors ' + (category === tab.id ? 'border-gym-accent bg-gym-accent/15 text-gym-accent' : 'border-white/10 bg-white/5 text-gym-text-muted hover:text-white')}>
          {tab.label}
        </button>)}
      </div>
      <p className="text-xs text-gym-text-muted" role="status">{Math.min(visibleCount, candidates.length)} de {candidates.length} exercícios</p>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
        {candidates.length === 0 ? <p className="py-6 text-center text-sm text-gym-text-muted">{exercises.length === 0 ? emptyMessage : 'Nenhum exercício corresponde à busca nesta categoria.'}</p> :
          candidates.slice(0, visibleCount).map(exercise => <button key={exercise.id} type="button" aria-pressed={selectedId === exercise.id}
            onClick={() => onSelect(exercise)}
            className={'flex min-h-[60px] w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ' + (selectedId === exercise.id ? 'border-gym-accent bg-gym-accent/10' : 'border-white/10 bg-gym-card/50 hover:border-gym-accent/40')}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white">{exercise.name}</span>
              <span className="mt-1 block text-xs text-gym-text-muted">{getCatalogGroupLabel(exercise)} · {exercise.equipment}</span>
            </span>
            <span className="shrink-0 text-gym-accent" aria-label={selectedId === exercise.id ? 'Selecionado' : actionLabel}>
              {selectedId === exercise.id ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </span>
          </button>)}
        {visibleCount < candidates.length && <button type="button" onClick={() => setVisibleCount(count => count + PAGE_SIZE)}
          className="min-h-[44px] w-full rounded-xl border border-white/15 px-3 text-sm font-bold text-gym-accent">Carregar mais ({candidates.length - visibleCount} restantes)</button>}
      </div>
    </div>
  );
}
