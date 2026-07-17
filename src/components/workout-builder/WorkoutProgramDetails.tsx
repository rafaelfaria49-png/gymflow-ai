'use client';

import React from 'react';
import type { TrainingExperienceLevel } from '../../types/training-profile';

interface WorkoutProgramDetailsProps {
  name: string;
  level: TrainingExperienceLevel;
  objective: string;
  onNameChange: (name: string) => void;
  onLevelChange: (level: TrainingExperienceLevel) => void;
  onObjectiveChange: (objective: string) => void;
}

/** GOAL-19A: dados do programa (não do dia). O tempo alvo agora é por dia (PART 12). */
export const WorkoutProgramDetails = ({
  name,
  level,
  objective,
  onNameChange,
  onLevelChange,
  onObjectiveChange,
}: WorkoutProgramDetailsProps) => (
  <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
    <div>
      <label htmlFor="builder-program-name" className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">
        Nome do programa
      </label>
      <input
        id="builder-program-name"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="Ex: Meu ABC"
        className="w-full bg-gym-dark border border-white/10 rounded-xl py-2.5 px-3 text-sm text-white outline-none focus:border-gym-accent"
      />
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label htmlFor="builder-program-level" className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">
          Nível
        </label>
        <select
          id="builder-program-level"
          value={level}
          onChange={(event) => onLevelChange(event.target.value as TrainingExperienceLevel)}
          className="w-full bg-gym-dark border border-white/10 rounded-xl py-2.5 px-3 text-xs text-white outline-none focus:border-gym-accent"
        >
          <option value="beginner">Iniciante</option>
          <option value="intermediate">Intermediário</option>
          <option value="advanced">Avançado</option>
          <option value="athlete">Atleta / Pro</option>
        </select>
      </div>
      <div>
        <label htmlFor="builder-program-objective" className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">
          Objetivo
        </label>
        <input
          id="builder-program-objective"
          value={objective}
          onChange={(event) => onObjectiveChange(event.target.value)}
          placeholder="Ex: Hipertrofia"
          className="w-full bg-gym-dark border border-white/10 rounded-xl py-2.5 px-3 text-xs text-white outline-none focus:border-gym-accent"
        />
      </div>
    </div>
  </div>
);
