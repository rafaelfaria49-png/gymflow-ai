'use client';

import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Dumbbell,
  Plus,
  Trash2,
  Wand2,
} from 'lucide-react';
import type { Exercise, ExerciseSlot, ProgressionType, VolumeProfile } from '../../types';
import type { MuscleGroupId } from '../../types/training-taxonomy';
import type { DetailedWorkoutDurationEstimate } from '../../types/training-volume';
import type { WorkoutDayBuilderDraft } from '../../types/workout-builder';
import { NumericInput } from '../ui/NumericInput';
import { VOLUME_PROFILES } from '../../lib/volumeProfiles';
import {
  MAX_DAY_TARGET_MINUTES,
  MIN_DAY_TARGET_MINUTES,
  QUICK_TARGET_MINUTES,
  dayDisplayName,
} from '../../lib/workout-builder';
import { WorkoutDayActions } from './WorkoutDayActions';
import { WorkoutDayFocusSelector } from './WorkoutDayFocusSelector';
import { WorkoutDaySummary } from './WorkoutDaySummary';

interface WorkoutDaysEditorProps {
  day: WorkoutDayBuilderDraft;
  exercises: readonly Exercise[];
  estimate: DetailedWorkoutDurationEstimate;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canDuplicate: boolean;
  canRemove: boolean;
  otherDaysWithExercise: (exerciseId: string) => string[];
  onCustomNameChange: (name: string) => void;
  onUseAutoName: () => void;
  onToggleMuscleGroup: (muscleGroupId: MuscleGroupId) => void;
  onTargetMinutesChange: (minutes: number) => void;
  onVolumeProfileChange: (profile: VolumeProfile) => void;
  onMoveDay: (direction: -1 | 1) => void;
  onDuplicateDay: () => void;
  onRemoveDay: () => void;
  onOpenPicker: () => void;
  onSlotChange: (index: number, fields: Partial<ExerciseSlot>) => void;
  onSlotMove: (index: number, direction: -1 | 1) => void;
  onSlotDuplicate: (index: number) => void;
  onSlotRemove: (index: number) => void;
}

/** GOAL-19A: edição do dia selecionado. Cada dia tem os próprios slots (PART 8). */
export const WorkoutDaysEditor = ({
  day,
  exercises,
  estimate,
  canMoveLeft,
  canMoveRight,
  canDuplicate,
  canRemove,
  otherDaysWithExercise,
  onCustomNameChange,
  onUseAutoName,
  onToggleMuscleGroup,
  onTargetMinutesChange,
  onVolumeProfileChange,
  onMoveDay,
  onDuplicateDay,
  onRemoveDay,
  onOpenPicker,
  onSlotChange,
  onSlotMove,
  onSlotDuplicate,
  onSlotRemove,
}: WorkoutDaysEditorProps) => (
  <div className="glass p-5 rounded-3xl border border-gym-accent/15 space-y-4">
    {/* CABEÇALHO DO DIA */}
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="text-[9px] font-black uppercase tracking-wider text-gym-accent">Dia {day.dayNumber}</span>
        <h3 className="text-base font-black text-white truncate">{dayDisplayName(day)}</h3>
      </div>
      <WorkoutDayActions
        canMoveLeft={canMoveLeft}
        canMoveRight={canMoveRight}
        canDuplicate={canDuplicate}
        canRemove={canRemove}
        onMove={onMoveDay}
        onDuplicate={onDuplicateDay}
        onRemove={onRemoveDay}
      />
    </div>

    {/* NOME DO DIA */}
    <div>
      <label htmlFor={`day-name-${day.id}`} className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">
        Nome do dia
      </label>
      <div className="flex gap-2">
        <input
          id={`day-name-${day.id}`}
          value={day.customName ?? ''}
          onChange={(event) => onCustomNameChange(event.target.value)}
          placeholder={day.autoName}
          className="flex-1 min-w-0 bg-gym-dark border border-white/10 rounded-xl py-2.5 px-3 text-sm text-white outline-none focus:border-gym-accent"
        />
        {day.customName?.trim() && (
          <button
            type="button"
            onClick={onUseAutoName}
            className="flex-shrink-0 min-h-[44px] px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-bold text-gym-text-muted hover:text-white flex items-center gap-1.5"
            title={`Usar "${day.autoName}"`}
          >
            <Wand2 className="w-3.5 h-3.5 text-gym-accent" />
            Usar nome automático
          </button>
        )}
      </div>
      <p className="text-[9px] text-gym-text-muted mt-1.5">
        Vazio = nome automático do foco ({day.autoName}).
      </p>
    </div>

    {/* FOCO MUSCULAR */}
    <WorkoutDayFocusSelector selected={day.muscleGroupIds} onToggle={onToggleMuscleGroup} />

    {/* TEMPO ALVO + PERFIL DE VOLUME */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">
          Tempo disponível neste dia
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {QUICK_TARGET_MINUTES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onTargetMinutesChange(value)}
              className={`min-h-[36px] px-3 rounded-xl text-[11px] font-bold border transition-all ${
                day.targetMinutes === value
                  ? 'bg-gym-accent/15 border-gym-accent text-gym-accent'
                  : 'bg-white/5 border-white/5 text-gym-text-muted hover:text-white'
              }`}
            >
              {value} min
            </button>
          ))}
        </div>
        <NumericInput
          min={MIN_DAY_TARGET_MINUTES}
          max={MAX_DAY_TARGET_MINUTES}
          value={day.targetMinutes}
          onCommit={(value) => onTargetMinutesChange(value ?? MIN_DAY_TARGET_MINUTES)}
          aria-label="Tempo alvo personalizado em minutos"
          className="w-full bg-gym-dark border border-white/10 rounded-xl min-h-[44px] px-3 text-xs text-white outline-none focus:border-gym-accent"
        />
      </div>

      <div>
        <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">Perfil de volume</label>
        <div className="grid grid-cols-1 gap-1.5">
          {VOLUME_PROFILES.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => onVolumeProfileChange(profile.id)}
              className={`p-2 rounded-xl border text-left transition-all min-h-[40px] ${
                day.volumeProfile === profile.id
                  ? 'bg-gym-accent/15 border-gym-accent text-gym-accent'
                  : 'bg-white/5 border-white/5 text-gym-text-muted hover:text-white'
              }`}
            >
              <span className="block text-[11px] font-black">{profile.label}</span>
              <span className="block text-[9px] leading-snug">{profile.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>

    {/* RESUMO DO DIA */}
    <WorkoutDaySummary day={day} exercises={exercises} estimate={estimate} />

    {/* EXERCÍCIOS DO DIA */}
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-white">Exercícios do Dia {day.dayNumber} ({day.slots.length})</h4>
        <button
          onClick={onOpenPicker}
          className="min-h-[44px] bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-bold px-4 rounded-xl text-xs flex items-center gap-1.5 flex-shrink-0"
        >
          <Plus className="w-4 h-4" /> Adicionar
        </button>
      </div>

      {day.slots.length === 0 ? (
        <div className="bg-white/5 p-8 text-center rounded-2xl border border-dashed border-white/10 space-y-3 flex flex-col items-center">
          <Dumbbell className="w-8 h-8 text-gym-text-muted opacity-40" />
          <p className="text-xs text-gym-text-muted max-w-sm">
            Este dia ainda não tem exercícios. Adicione o primeiro para ver a estimativa.
          </p>
          <button
            onClick={onOpenPicker}
            className="min-h-[44px] px-6 bg-gym-accent hover:bg-gym-accent-hover active:scale-[0.98] text-gym-dark font-extrabold rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Adicionar Exercício
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {day.slots.map((slot, index) => {
            const exercise = exercises.find((item) => item.id === slot.exerciseId);
            const alsoIn = otherDaysWithExercise(slot.exerciseId);
            return (
              <div
                key={`${day.id}_${index}_${slot.exerciseId}`}
                className="bg-gym-card/60 border border-white/5 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] text-gym-accent font-bold">#{index + 1}</span>
                    <h5 className="text-xs font-bold text-white truncate">
                      {exercise?.name ?? 'Exercício desconhecido'}
                    </h5>
                    <p className="text-[10px] text-gym-text-muted capitalize">
                      {exercise?.muscleGroup ?? 'sem classificação'}
                      {alsoIn.length > 0 && (
                        <span className="text-gym-text-muted"> • também no {alsoIn.join(', ')}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => onSlotMove(index, -1)}
                      disabled={index === 0}
                      className="p-2 bg-white/5 rounded-lg disabled:opacity-30 text-white tap-target"
                      title="Mover para cima"
                      aria-label="Mover exercício para cima"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onSlotMove(index, 1)}
                      disabled={index === day.slots.length - 1}
                      className="p-2 bg-white/5 rounded-lg disabled:opacity-30 text-white tap-target"
                      title="Mover para baixo"
                      aria-label="Mover exercício para baixo"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onSlotDuplicate(index)}
                      className="p-2 bg-white/5 rounded-lg text-white tap-target"
                      title="Duplicar"
                      aria-label="Duplicar exercício"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onSlotRemove(index)}
                      className="p-2 bg-gym-rose/10 rounded-lg text-gym-rose tap-target"
                      title="Remover"
                      aria-label="Remover exercício"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <label className="text-[9px] font-bold text-gym-text-muted uppercase block">
                    Séries
                    <NumericInput
                      min={1}
                      value={slot.series}
                      onCommit={(value) => onSlotChange(index, { series: value ?? 1 })}
                      className="mt-1 w-full bg-gym-dark border border-white/10 rounded-lg min-h-[44px] px-2 text-xs text-white outline-none focus:border-gym-accent"
                    />
                  </label>
                  <label className="text-[9px] font-bold text-gym-text-muted uppercase block">
                    Reps mín.
                    <NumericInput
                      min={1}
                      value={slot.repRange[0]}
                      onCommit={(value) => onSlotChange(index, { repRange: [value ?? 1, slot.repRange[1]] })}
                      className="mt-1 w-full bg-gym-dark border border-white/10 rounded-lg min-h-[44px] px-2 text-xs text-white outline-none focus:border-gym-accent"
                    />
                  </label>
                  <label className="text-[9px] font-bold text-gym-text-muted uppercase block">
                    Reps máx.
                    <NumericInput
                      min={1}
                      value={slot.repRange[1]}
                      onCommit={(value) => onSlotChange(index, { repRange: [slot.repRange[0], value ?? 1] })}
                      className="mt-1 w-full bg-gym-dark border border-white/10 rounded-lg min-h-[44px] px-2 text-xs text-white outline-none focus:border-gym-accent"
                    />
                  </label>
                  <label className="text-[9px] font-bold text-gym-text-muted uppercase block">
                    RPE alvo
                    <NumericInput
                      min={1}
                      max={10}
                      value={slot.targetRPE}
                      onCommit={(value) => onSlotChange(index, { targetRPE: value ?? 1 })}
                      className="mt-1 w-full bg-gym-dark border border-white/10 rounded-lg min-h-[44px] px-2 text-xs text-white outline-none focus:border-gym-accent"
                    />
                  </label>
                  <label className="text-[9px] font-bold text-gym-text-muted uppercase block">
                    Descanso (s)
                    <NumericInput
                      min={0}
                      value={slot.restSec}
                      onCommit={(value) => onSlotChange(index, { restSec: value ?? 0 })}
                      className="mt-1 w-full bg-gym-dark border border-white/10 rounded-lg min-h-[44px] px-2 text-xs text-white outline-none focus:border-gym-accent"
                    />
                  </label>
                  <label className="text-[9px] font-bold text-gym-text-muted uppercase block">
                    Progressão
                    <select
                      value={slot.progression}
                      onChange={(event) => onSlotChange(index, { progression: event.target.value as ProgressionType })}
                      className="mt-1 w-full bg-gym-dark border border-white/10 rounded-lg min-h-[44px] px-2 text-xs text-white outline-none focus:border-gym-accent"
                    >
                      <option value="dupla">Dupla progressão</option>
                      <option value="linear">Linear</option>
                      <option value="nenhuma">Nenhuma</option>
                    </select>
                  </label>
                  <label className="text-[9px] font-bold text-gym-text-muted uppercase block">
                    Incremento (kg)
                    <NumericInput
                      min={0}
                      allowDecimal
                      value={slot.incrementKg}
                      onCommit={(value) => onSlotChange(index, { incrementKg: value ?? 0 })}
                      className="mt-1 w-full bg-gym-dark border border-white/10 rounded-lg min-h-[44px] px-2 text-xs text-white outline-none focus:border-gym-accent"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>
);
