'use client';

import React, { useState } from 'react';
import { ChevronDown, GraduationCap, X } from 'lucide-react';
import type { Exercise, ExerciseSlot } from '../../types';
import type { TrainingExperienceLevel } from '../../types/training-profile';
import type { TechniqueId, TechniquePlan } from './types';
import {
  createBackOffPlan,
  createDropSetPlan,
  createPyramidPlan,
} from './model';
import {
  getTechniqueGate,
  listVisibleTechniques,
  TECHNIQUE_IDS,
  TECHNIQUE_EDUCATION,
  TECHNIQUE_LABELS,
} from './profileRules';

interface TechniquePickerProps {
  slot: ExerciseSlot;
  exercise?: Exercise;
  level: TrainingExperienceLevel;
  manualUnlocks?: readonly TechniqueId[];
  value?: TechniquePlan;
  onChange: (plan: TechniquePlan | undefined) => void;
  onUnlock: (technique: TechniqueId) => void;
}

function planForType(type: TechniqueId, slot: ExerciseSlot): TechniquePlan {
  const baseReps = slot.repRange[0];
  switch (type) {
    case 'drop_set':
      return createDropSetPlan({ baseWeight: 10, baseReps, stageCount: 4 });
    case 'pyramid':
      return createPyramidPlan({ baseWeight: 10, baseReps });
    case 'back_off':
      return createBackOffPlan({ topWeight: 10, topReps: baseReps });
    case 'to_failure':
      return { type, label: TECHNIQUE_LABELS[type], targetReps: slot.repRange[1] };
    case 'tempo':
      return { type, label: TECHNIQUE_LABELS[type], targetReps: baseReps, tempo: '3-1-1-0' };
    case 'iso_hold':
      return { type, label: TECHNIQUE_LABELS[type], targetReps: baseReps, holdSec: 20 };
    case 'partials':
      return { type, label: TECHNIQUE_LABELS[type], targetReps: baseReps, partialReps: 4, partialRange: 'top' };
  }
}

export const TechniquePicker = ({
  slot,
  exercise,
  level,
  manualUnlocks = [],
  value,
  onChange,
  onUnlock,
}: TechniquePickerProps) => {
  const [educationOpen, setEducationOpen] = useState(false);
  const visibleTechniques = listVisibleTechniques(level, manualUnlocks);
  const lockedTechniques = TECHNIQUE_IDS.filter((type) => !visibleTechniques.includes(type));

  if (visibleTechniques.length === 0 && !educationOpen) {
    return (
      <button
        type="button"
        onClick={() => setEducationOpen(true)}
        className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[9px] font-black uppercase tracking-wide text-gym-text-muted hover:border-gym-accent/40 hover:text-gym-accent"
      >
        <GraduationCap className="h-3.5 w-3.5" /> Conhecer técnicas especiais
      </button>
    );
  }

  if (visibleTechniques.length === 0 && educationOpen) {
    return (
      <div className="rounded-xl border border-gym-accent/20 bg-gym-accent/[0.03] p-2.5 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[9px] leading-relaxed text-gym-text-muted">Leia a orientação de uma técnica para liberá-la no seu perfil. O treino não muda sozinho.</p>
          <button type="button" onClick={() => setEducationOpen(false)} aria-label="Fechar orientação" className="text-gym-text-muted hover:text-white"><X className="h-3.5 w-3.5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(['tempo', 'iso_hold', 'partials', 'pyramid', 'back_off', 'drop_set', 'to_failure'] as TechniqueId[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onUnlock(type)}
              className="min-h-[38px] rounded-lg border border-white/10 bg-white/5 px-2 text-left text-[9px] font-bold text-white hover:border-gym-accent/50"
              title={TECHNIQUE_EDUCATION[type]}
            >
              {TECHNIQUE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
      <label className="min-w-0 flex-1">
        <span className="sr-only">Técnica especial de {exercise?.name ?? slot.exerciseId}</span>
        <select
          value={value?.type ?? ''}
          onChange={(event) => onChange(event.target.value ? planForType(event.target.value as TechniqueId, slot) : undefined)}
          className="min-h-[40px] w-full rounded-lg border border-white/10 bg-gym-dark px-2 text-[10px] font-bold text-white outline-none focus:border-gym-accent"
          aria-label={`Técnica especial de ${exercise?.name ?? slot.exerciseId}`}
        >
          <option value="">Série convencional</option>
          {visibleTechniques.map((type) => <option key={type} value={type}>{TECHNIQUE_LABELS[type]}</option>)}
        </select>
      </label>
      {value && (
        <span className="flex items-center gap-1 rounded-full border border-gym-accent/25 bg-gym-accent/10 px-2 py-1 text-[9px] font-black text-gym-accent">
          {getTechniqueGate(level, value.type, manualUnlocks).label}
          <button type="button" onClick={() => onChange(undefined)} aria-label="Remover técnica especial" className="hover:text-white"><X className="h-3 w-3" /></button>
        </span>
      )}
      <ChevronDown className="pointer-events-none -ml-7 h-3 w-3 text-gym-text-muted" aria-hidden="true" />
      </div>
      {lockedTechniques.length > 0 && (
        <div>
          <button type="button" onClick={() => setEducationOpen((open) => !open)} className="text-[9px] font-bold text-gym-text-muted hover:text-gym-accent">
            <GraduationCap className="mr-1 inline h-3 w-3" /> {educationOpen ? 'Fechar orientação' : 'Liberar outra técnica com orientação'}
          </button>
          {educationOpen && (
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {lockedTechniques.map((type) => (
                <button key={type} type="button" onClick={() => onUnlock(type)} title={TECHNIQUE_EDUCATION[type]} className="min-h-[34px] rounded-lg border border-white/10 bg-white/5 px-2 text-left text-[9px] font-bold text-white hover:border-gym-accent/50">
                  {TECHNIQUE_LABELS[type]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
