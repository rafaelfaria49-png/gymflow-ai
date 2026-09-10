'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Copy,
  Dumbbell,
  Plus,
  Sparkles,
  Trash2,
  Link2,
  Unlink2,
  Wand2,
} from 'lucide-react';
import type { Exercise, ExerciseSlot, ProgressionType, VolumeProfile } from '../../types';
import type { MuscleGroupId } from '../../types/training-taxonomy';
import type { DetailedWorkoutDurationEstimate } from '../../types/training-volume';
import type { WorkoutDayBuilderDraft } from '../../types/workout-builder';
import type { TrainingExperienceLevel } from '../../types/training-profile';
import type { ExerciseGroupType, TechniqueId } from '../../domain/techniques/types';
import {
  EXERCISE_GROUP_LABELS,
  groupLabel,
  getExerciseGroups,
  groupTypeForSize,
  validateExerciseGroup,
} from '../../domain/techniques/grouping';
import {
  getGymProfileExerciseAvailability,
  type GymProfileAvailability,
} from '../../domain/gymProfile';
import { NumericInput } from '../ui/NumericInput';
import { VOLUME_PROFILES } from '../../lib/volumeProfiles';
import type {
  RecommendedExerciseRange,
  RecommendedVolumeProfileResult,
  VolumeProfileFitAnalysis,
  WorkoutTimeFitAnalysis,
} from '../../lib/workout-time-fit';
import {
  MAX_DAY_TARGET_MINUTES,
  MIN_DAY_TARGET_MINUTES,
  QUICK_TARGET_MINUTES,
  dayDisplayName,
} from '../../lib/workout-builder';
import { WorkoutDayActions } from './WorkoutDayActions';
import { WorkoutDayFocusSelector } from './WorkoutDayFocusSelector';
import { WorkoutDaySummary } from './WorkoutDaySummary';
import { TechniquePicker } from '../../domain/techniques/TechniquePicker';
import { getMuscleGroupLabel } from '../../lib/mobile-training-ux';

interface WorkoutDaysEditorProps {
  day: WorkoutDayBuilderDraft;
  exercises: readonly Exercise[];
  estimate: DetailedWorkoutDurationEstimate;
  recommendation: RecommendedVolumeProfileResult;
  profileFit: VolumeProfileFitAnalysis;
  timeFit: WorkoutTimeFitAnalysis;
  equipmentAvailability: GymProfileAvailability | null;
  recommendedExerciseRange: RecommendedExerciseRange;
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
  onOpenSuggestion: () => void;
  onSlotChange: (index: number, fields: Partial<ExerciseSlot>) => void;
  onGroupCreate: (indices: number[], groupType: ExerciseGroupType, groupRestSec: number) => void;
  onGroupRemove: (groupIds: string[]) => void;
  techniqueLevel: TrainingExperienceLevel;
  techniqueUnlocks: readonly TechniqueId[];
  onTechniqueUnlock: (technique: TechniqueId) => void;
  onSlotMove: (index: number, direction: -1 | 1) => void;
  onSlotDuplicate: (index: number) => void;
  onSlotRemove: (index: number) => void;
}

/** GOAL-19A: edição do dia selecionado. Cada dia tem os próprios slots (PART 8). */
export const WorkoutDaysEditor = ({
  day,
  exercises,
  estimate,
  recommendation,
  profileFit,
  timeFit,
  equipmentAvailability,
  recommendedExerciseRange,
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
  onOpenSuggestion,
  onSlotChange,
  onGroupCreate,
  onGroupRemove,
  techniqueLevel,
  techniqueUnlocks,
  onTechniqueUnlock,
  onSlotMove,
  onSlotDuplicate,
  onSlotRemove,
}: WorkoutDaysEditorProps) => {
  const [selectedSlotIndices, setSelectedSlotIndices] = useState<number[]>([]);
  const [groupType, setGroupType] = useState<ExerciseGroupType>('superset');
  const [groupRestSec, setGroupRestSec] = useState(90);
  const [displayState, setDisplayState] = useState(() => ({
    dayId: day.id,
    canonicalMinutes: day.targetMinutes,
    minutes: day.targetMinutes,
  }));
  const displayMinutes = displayState.dayId === day.id
    && displayState.canonicalMinutes === day.targetMinutes
    ? displayState.minutes
    : day.targetMinutes;

  const groups = useMemo(() => getExerciseGroups(day.slots), [day.slots]);
  const selectedGroupIds = useMemo(() => [...new Set(
    selectedSlotIndices
      .map((index) => day.slots[index]?.groupId)
      .filter((groupId): groupId is string => Boolean(groupId)),
  )], [day.slots, selectedSlotIndices]);
  const groupValidation = useMemo(() => selectedSlotIndices.length > 0
    ? validateExerciseGroup(day.slots, exercises, selectedSlotIndices, groupType)
    : null, [day.slots, exercises, selectedSlotIndices, groupType]);

  const toggleSlotSelection = (index: number) => {
    setSelectedSlotIndices((current) => current.includes(index)
      ? current.filter((item) => item !== index)
      : [...current, index].sort((left, right) => left - right));
  };

  const handleCreateGroup = () => {
    if (selectedSlotIndices.length < 2) return;
    onGroupCreate(selectedSlotIndices, groupType, Math.max(0, Math.round(groupRestSec)));
    setSelectedSlotIndices([]);
  };

  const handleRemoveGroups = () => {
    if (selectedGroupIds.length === 0) return;
    onGroupRemove(selectedGroupIds);
    setSelectedSlotIndices([]);
  };
  const setDisplayMinutes = (minutes: number, canonicalMinutes = day.targetMinutes) => {
    setDisplayState({ dayId: day.id, canonicalMinutes, minutes });
  };

  const commitTargetMinutes = (value: number | null) => {
    const minutes = value ?? MIN_DAY_TARGET_MINUTES;
    setDisplayMinutes(minutes, minutes);
    onTargetMinutesChange(minutes);
  };

  const selectTargetMinutesPreset = (minutes: number) => {
    setDisplayMinutes(minutes, minutes);
    onTargetMinutesChange(minutes);
  };

  return (
  <div className="glass p-5 rounded-3xl border border-gym-accent/15 space-y-4 min-w-0 overflow-hidden">
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
              onClick={() => selectTargetMinutesPreset(value)}
              className={`min-h-[36px] px-3 rounded-xl text-[11px] font-bold border transition-all ${
                displayMinutes === value
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
          value={displayMinutes}
          onValidChange={setDisplayMinutes}
          onCommit={commitTargetMinutes}
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
              className={`p-2 rounded-xl border text-left transition-all min-h-[44px] min-w-0 ${
                day.volumeProfile === profile.id
                  ? 'bg-gym-accent/15 border-gym-accent text-gym-accent'
                  : 'bg-white/5 border-white/5 text-gym-text-muted hover:text-white'
              }`}
            >
              <span className="flex flex-wrap items-center justify-between gap-1.5 min-w-0">
                <span className="text-[11px] font-black">{profile.label}</span>
                {recommendation.profile === profile.id && (
                  <span className="max-w-full rounded-full bg-gym-accent/15 border border-gym-accent/30 px-2 py-0.5 text-[8px] font-black leading-tight text-gym-accent whitespace-normal break-words">
                    Recomendado p/ {recommendation.targetMinutes} min
                  </span>
                )}
              </span>
              <span className="block text-[9px] leading-snug break-words">{profile.description}</span>
            </button>
          ))}
        </div>
        {profileFit.divergent && profileFit.message && (
          <p className="mt-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-2.5 text-[10px] leading-relaxed text-amber-300 flex items-start gap-1.5 break-words">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span className="min-w-0">{profileFit.message}</span>
          </p>
        )}
      </div>
    </div>

    {/* RESUMO DO DIA */}
    <WorkoutDaySummary
      day={day}
      exercises={exercises}
      estimate={estimate}
      targetMinutes={day.targetMinutes}
      timeFit={timeFit}
      recommendedExerciseRange={recommendedExerciseRange}
    />

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

      <button
        onClick={onOpenSuggestion}
        className="w-full min-h-[44px] bg-white/5 hover:bg-white/10 border border-gym-accent/30 text-gym-accent font-bold px-4 rounded-xl text-xs flex items-center justify-center gap-1.5"
      >
        <Sparkles className="w-4 h-4" /> Sugerir exercícios para este dia
      </button>

      {day.slots.length > 0 && (
        <section className="rounded-2xl border border-gym-accent/20 bg-gym-accent/[0.03] p-3 space-y-2.5" aria-label="Agrupamento de exercícios">
          <div className="flex items-start gap-2">
            <Link2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-gym-accent" />
            <div className="min-w-0">
              <h5 className="text-[10px] font-black uppercase tracking-widest text-gym-accent">Rodadas alternadas</h5>
              <p className="mt-1 text-[10px] leading-relaxed text-gym-text-muted">
                Selecione cartões abaixo para alternar exercícios. O descanso do grupo entra só no fim da rodada; entre cartões são 30s de transição.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-gym-text-muted">Tipo</span>
              <select
                value={groupType}
                onChange={(event) => setGroupType(event.target.value as ExerciseGroupType)}
                className="w-full min-h-[40px] rounded-lg border border-white/10 bg-gym-dark px-2 text-[10px] font-bold text-white outline-none focus:border-gym-accent"
                aria-label="Tipo do grupo de exercícios"
              >
                {(Object.keys(EXERCISE_GROUP_LABELS) as ExerciseGroupType[]).map((type) => (
                  <option key={type} value={type}>{EXERCISE_GROUP_LABELS[type]}</option>
                ))}
              </select>
            </label>
            <label className="w-full sm:w-32">
              <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-gym-text-muted">Descanso (s)</span>
              <input
                type="number"
                min={0}
                max={600}
                value={groupRestSec}
                onChange={(event) => setGroupRestSec(Number(event.target.value) || 0)}
                className="w-full min-h-[40px] rounded-lg border border-white/10 bg-gym-dark px-2 text-center text-xs font-mono text-white outline-none focus:border-gym-accent"
                aria-label="Descanso do grupo em segundos"
              />
            </label>
            <button
              type="button"
              onClick={handleCreateGroup}
              disabled={selectedSlotIndices.length < 2}
              className="min-h-[40px] rounded-lg bg-gym-accent px-3 text-[10px] font-black uppercase tracking-wide text-gym-dark disabled:cursor-not-allowed disabled:opacity-35"
            >
              Agrupar {selectedSlotIndices.length > 0 ? `(${selectedSlotIndices.length})` : ''}
            </button>
            <button
              type="button"
              onClick={handleRemoveGroups}
              disabled={selectedGroupIds.length === 0}
              className="min-h-[40px] rounded-lg border border-white/10 bg-white/5 px-3 text-[10px] font-black uppercase tracking-wide text-gym-text-muted hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Unlink2 className="mr-1 inline h-3.5 w-3.5" /> Desfazer
            </button>
          </div>
          {groupValidation?.warnings.map((warning) => (
            <p key={warning.code} className="text-[9px] leading-relaxed text-amber-300">
              <AlertTriangle className="mr-1 inline h-3 w-3" /> {warning.message} O aviso é informativo.
            </p>
          ))}
          {groups.length > 0 && (
            <p className="text-[9px] text-gym-text-muted">
              {groups.length} grupo(s) configurado(s). Selecione um cartão agrupado para desfazê-lo.
            </p>
          )}
        </section>
      )}

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
            const equipmentState = exercise && equipmentAvailability
              ? getGymProfileExerciseAvailability(exercise, equipmentAvailability)
              : null;
            return (
              <div
                key={`${day.id}_${index}_${slot.exerciseId}`}
                className="bg-gym-card/60 border border-white/5 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <label className="inline-flex min-h-[32px] items-center gap-1.5 text-[9px] font-bold text-gym-text-muted">
                        <input
                          type="checkbox"
                          checked={selectedSlotIndices.includes(index)}
                          onChange={() => toggleSlotSelection(index)}
                          className="h-4 w-4 accent-gym-accent"
                          aria-label={`Selecionar ${exercise?.name ?? slot.exerciseId} para grupo`}
                        />
                        <span>Selecionar</span>
                      </label>
                      <span className="text-[10px] text-gym-accent font-bold">#{index + 1}</span>
                      {slot.groupId && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-gym-accent/25 bg-gym-accent/10 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-gym-accent">
                          <Link2 className="h-3 w-3" />
                          {groupLabel(slot.groupType ?? groupTypeForSize(groups.find((group) => group.id === slot.groupId)?.memberIndices.length ?? 2))} · ordem {slot.groupOrder !== undefined ? slot.groupOrder + 1 : index + 1}
                        </span>
                      )}
                    </div>
                    <h5 className="text-xs font-bold text-white line-clamp-2 leading-snug break-words">
                      {exercise?.name ?? 'Exercício desconhecido'}
                    </h5>
                    <p className="text-[10px] text-gym-text-muted">
                      {getMuscleGroupLabel(exercise?.muscleGroup) || 'Sem classificação'}
                      {alsoIn.length > 0 && (
                        <span className="text-gym-text-muted"> • também no {alsoIn.join(', ')}</span>
                      )}
                    </p>
                    {equipmentState?.status === 'unavailable' && (
                      <span
                        role="status"
                        className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md border border-gym-rose/30 bg-gym-rose/10 px-1.5 py-1 text-[9px] font-bold leading-tight text-rose-300"
                      >
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                        Equipamento indisponível no perfil ativo
                      </span>
                    )}
                    {equipmentState?.status === 'crowded' && (
                      <span
                        role="status"
                        className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-1 text-[9px] font-bold leading-tight text-amber-300"
                      >
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                        Equipamento lotado — sugestão penalizada
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => onSlotMove(index, -1)}
                      disabled={index === 0}
                      className="min-w-[44px] min-h-[44px] p-2 bg-white/5 hover:bg-white/10 rounded-lg disabled:opacity-25 text-white flex items-center justify-center transition-all tap-target"
                      title="Mover para cima"
                      aria-label="Mover exercício para cima"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onSlotMove(index, 1)}
                      disabled={index === day.slots.length - 1}
                      className="min-w-[44px] min-h-[44px] p-2 bg-white/5 hover:bg-white/10 rounded-lg disabled:opacity-25 text-white flex items-center justify-center transition-all tap-target"
                      title="Mover para baixo"
                      aria-label="Mover exercício para baixo"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onSlotDuplicate(index)}
                      className="min-w-[44px] min-h-[44px] p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white flex items-center justify-center transition-all tap-target"
                      title="Duplicar"
                      aria-label="Duplicar exercício"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onSlotRemove(index)}
                      className="min-w-[44px] min-h-[44px] p-2 bg-gym-rose/10 hover:bg-gym-rose/20 rounded-lg text-gym-rose flex items-center justify-center transition-all tap-target"
                      title="Remover"
                      aria-label="Remover exercício"
                    >
                      <Trash2 className="w-4 h-4" />
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 space-y-1.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-gym-text-muted">Técnica especial (opcional)</span>
                  <TechniquePicker
                    slot={slot}
                    exercise={exercise}
                    level={techniqueLevel}
                    manualUnlocks={techniqueUnlocks}
                    value={slot.technique}
                    onChange={(technique) => onSlotChange(index, { technique })}
                    onUnlock={onTechniqueUnlock}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>
  );
};
