'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { TechniqueSequencePlayer } from '../components/TechniqueSequencePlayer';
import { Play, Check, RefreshCw, Sparkles, Clock, Share2, Award, Zap, ChevronRight, ChevronUp, ChevronDown, Flag, X, Plus, Trash2, Search, Info, Pencil, Calculator, Flame, HelpCircle } from 'lucide-react';
import { WhyThisWeightModal } from '../components/WhyThisWeightModal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { NumericInput } from '../components/ui/NumericInput';
import { matchesExerciseSearch } from '../lib/exerciseSearch';
import { getTechniqueVideoIdForExerciseId } from '../lib/exerciseTechniqueMap';
import { defaultTargetMinutes } from '../lib/volumeProfiles';
import { useToast } from '../components/ui/Toast';
import { ExerciseOriginBadge, ExerciseExecutionBadge, SessionStatusBadge } from '../components/ui/SessionBadges';
import { deriveExerciseEntryStatus, MAX_SWAP_REASON_NOTE_LENGTH } from '../lib/workout-session-domain';
import { buildSessionPreview, buildSwapView, SWAP_REASON_LABELS, SWAP_REASON_ORDER } from '../lib/workout-session-view';
import type { ActiveExercise, Exercise, WorkoutSet, WorkoutSwapReasonCode } from '../types';
import {
  buildCompactWorkoutProposal,
  type CompactWorkoutProposal,
} from '../domain/compactEngine';
import { rankCrowdedGymSubstitutes } from '../lib/workout-session-mutations';
import { aggregateActiveExerciseVolume, aggregateWorkoutVolume } from '../domain/techniques/aggregator';
import { TechniquePanel } from '../domain/techniques/TechniquePanel';
import { getGroupForEntry, nextWorkoutFocusIndex } from '../domain/techniques/grouping';
import { getActiveGymProfile } from '../domain/gymProfile';
import { calculatePlateLoad, getPlateCalculatorConfig, type PlateLoadout } from '../domain/plateCalculator';
import { bestWorkingSetWeight } from '../domain/warmupEngine';
import { RirEducationCard } from '../components/RirEducationCard';

function formatLoadKg(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',')} kg`;
}

interface ActiveWorkoutSetRowProps {
  set: WorkoutSet;
  displayIndex: number;
  warmupIndex?: number;
  showRir?: boolean;
  onUpdate: (fields: Partial<WorkoutSet>) => void;
  onToggle: () => void;
}

function ActiveWorkoutSetRow({
  set,
  displayIndex,
  warmupIndex,
  showRir = false,
  onUpdate,
  onToggle,
}: ActiveWorkoutSetRowProps) {
  const label = set.isWarmup ? `A${(warmupIndex ?? 0) + 1}` : String(displayIndex + 1);
  const setDescription = set.isWarmup ? `aproximação ${label}` : `série ${displayIndex + 1}`;
  return (
    <div
      id={`set-row-${set.id}`}
      className={`grid grid-cols-12 items-center text-center p-1 rounded-xl transition-all border gap-1 relative ${
        set.completed
          ? 'bg-gym-accent/5 border-gym-accent/20'
          : set.isWarmup
            ? 'bg-gym-amber/[0.04] border-gym-amber/15'
            : 'bg-white/5 border-transparent'
      }`}
    >
      <span className="col-span-2 text-xs text-white font-bold text-left pl-2 flex flex-col justify-center">
        <span>{label}</span>
        {set.isWarmup && (
          <span className="text-[7px] text-gym-amber uppercase font-extrabold tracking-widest -mt-0.5">Aprox.</span>
        )}
      </span>

      <div className="col-span-2 flex flex-col justify-center text-[9px] text-gym-text-muted leading-tight font-mono">
        <span>{set.isWarmup ? '—' : set.lastWeight ? formatLoadKg(set.lastWeight) : '—'}</span>
        <span className="text-gym-accent/80 font-bold">
          {set.isWarmup ? formatLoadKg(set.weight) : set.suggestedWeight ? formatLoadKg(set.suggestedWeight) : '—'}
        </span>
      </div>

      <div className="col-span-3 px-0.5">
        <NumericInput
          value={set.weight}
          allowDecimal
          min={0}
          disabled={set.completed}
          aria-label={`Carga da ${setDescription} (kg)`}
          onValidChange={(value) => onUpdate({ weight: value })}
          onCommit={(value) => onUpdate({ weight: value ?? 0 })}
          className="w-full min-h-[44px] bg-gym-dark/60 border border-white/10 text-white rounded-lg text-center text-xs font-mono focus:border-gym-accent outline-none"
        />
      </div>

      <div className="col-span-2 px-0.5">
        <NumericInput
          value={set.reps}
          min={0}
          disabled={set.completed}
          aria-label={`Repetições da ${setDescription}`}
          onValidChange={(value) => onUpdate({ reps: value })}
          onCommit={(value) => onUpdate({ reps: value ?? 0 })}
          className="w-full min-h-[44px] bg-gym-dark/60 border border-white/10 text-white rounded-lg text-center text-xs font-mono focus:border-gym-accent outline-none"
        />
      </div>

      <div className="col-span-2 px-0.5">
        <NumericInput
          value={set.rpe ?? null}
          min={1}
          max={10}
          emptyBehavior="null"
          placeholder="8"
          disabled={set.completed}
          aria-label={`RPE da ${setDescription}`}
          onValidChange={(value) => onUpdate({ rpe: value })}
          onCommit={(value) => onUpdate({ rpe: value ?? undefined })}
          className="w-full min-h-[44px] bg-gym-dark/60 border border-white/10 text-white rounded-lg text-center text-xs font-mono focus:border-gym-accent outline-none"
        />
      </div>

      <div className="col-span-1 flex justify-center">
        <button
          type="button"
          onClick={onToggle}
          aria-label={set.completed ? `Desmarcar ${setDescription}` : `Concluir ${setDescription}`}
          className="w-11 h-11 -m-2.5 flex items-center justify-center group/check"
        >
          <span
            className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all group-active/check:scale-90 ${
              set.completed
                ? 'bg-gym-accent text-gym-dark'
                : 'bg-white/10 border border-white/15 text-transparent group-hover/check:border-gym-accent'
            }`}
          >
            <Check className="w-3.5 h-3.5 stroke-[3px]" />
          </span>
        </button>
      </div>

      {showRir && !set.isWarmup && (
        <div className="col-span-12 flex items-center gap-2 border-t border-white/5 px-2 pt-2 text-left">
          <span className="shrink-0 text-[8px] font-black uppercase tracking-wider text-gym-text-muted" title="Repetições em reserva">
            RIR
          </span>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5">
            {[0, 1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                disabled={set.completed}
                aria-pressed={set.rir === value}
                aria-label={`RIR ${value}`}
                onClick={() => onUpdate({ rir: set.rir === value ? undefined : value })}
                className={`min-h-[32px] min-w-[32px] rounded-lg border px-2 text-[10px] font-black transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  set.rir === value
                    ? 'border-gym-accent bg-gym-accent text-gym-dark'
                    : 'border-white/10 bg-white/5 text-gym-text-muted hover:border-gym-accent/40 hover:text-gym-accent'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          <span className="hidden shrink-0 text-[8px] text-gym-text-muted sm:inline">opcional</span>
        </div>
      )}
    </div>
  );
}

export const ActiveWorkoutPage = () => {
  const {
    user,
    activeWorkout,
    workoutDuration,
    updateWorkoutSet,
    updateUserProfile,
    updateExerciseNotes,
    completeWorkoutSet,
    updateActiveExerciseTechniqueLog,
    addSetToActiveExercise,
    removeSetFromActiveExercise,
    addExerciseToActiveWorkout,
    removeExerciseFromActiveWorkout,
    swapExerciseInActiveWorkout,
    finishWorkout,
    cancelWorkout,
    exercises,
    programs,
    gymProfile,
    crowdedGymMode,
    toggleCrowdedGymMode,
    moveExerciseInActiveWorkout,
    applyCompactWorkout,
    openWorkoutBuilder,
    openGlobalPlayer,
    unlockTechnique,
    // Timer de descanso (GOAL-06) — estado vive no GymFlowContext para sobreviver a
    // refresh e continuar contando mesmo se o usuário sair desta tela.
    restSecondsRemaining,
    restTimerTotalSeconds,
    restTimerLabel,
    extendRestTimer,
    skipRestTimer,
    setActiveView,
    recordExerciseProgressionOverride,
  } = useGymFlow();
  const toast = useToast();

  const [rpe, setRpe] = useState(7);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  // GOAL-24: motivo obrigatório + nota opcional (obrigatória p/ `other`) da troca.
  const [swapReasonCode, setSwapReasonCode] = useState<WorkoutSwapReasonCode | null>(null);
  const [swapNote, setSwapNote] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [compactProposal, setCompactProposal] = useState<CompactWorkoutProposal | null>(null);
  const [quickMinutes, setQuickMinutes] = useState(30);
  const [lastCompletedSet, setLastCompletedSet] = useState<{ sessionId: string; exerciseIndex: number; setIndex: number } | null>(null);
  const [plateCalculatorExerciseId, setPlateCalculatorExerciseId] = useState<string | null>(null);
  const [plateCalculatorTarget, setPlateCalculatorTarget] = useState(0);
  const [whyThisWeightExercise, setWhyThisWeightExercise] = useState<ActiveExercise | null>(null);
  const lastScrolledCompletion = useRef<string | null>(null);

  useEffect(() => {
    if (!lastCompletedSet || !activeWorkout || lastCompletedSet.sessionId !== activeWorkout.id) return;
    const completedSet = activeWorkout.exercises[lastCompletedSet.exerciseIndex]?.sets[lastCompletedSet.setIndex];
    if (!completedSet?.completed) return;
    const completionKey = `${activeWorkout.id}:${lastCompletedSet.exerciseIndex}:${lastCompletedSet.setIndex}`;
    if (lastScrolledCompletion.current === completionKey) return;
    lastScrolledCompletion.current = completionKey;
    const nextIndex = nextWorkoutFocusIndex(
      activeWorkout.exercises,
      lastCompletedSet.exerciseIndex,
      lastCompletedSet.setIndex,
    );
    if (nextIndex !== undefined && nextIndex !== lastCompletedSet.exerciseIndex) {
      document.getElementById(`exercise-card-${activeWorkout.exercises[nextIndex]?.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeWorkout, lastCompletedSet]);

  if (!activeWorkout) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 space-y-4">
        <DumbbellIllustration className="w-20 h-20 text-gym-text-muted opacity-50" />
        <h2 className="text-xl font-bold text-white">Nenhum treino em andamento</h2>
        <p className="text-xs text-gym-text-muted max-w-xs">
          Vá até a aba de treinos para iniciar um programa ou comece um treino livre rápido.
        </p>
        <button
          onClick={() => setActiveView('workouts')}
          className="min-h-[44px] px-6 bg-gym-accent hover:bg-gym-accent-hover active:scale-[0.98] text-gym-dark font-extrabold rounded-2xl text-xs uppercase tracking-wider transition-all shadow-md shadow-gym-accent/15 flex items-center gap-1.5"
        >
          <Play className="w-4 h-4 fill-gym-dark" />
          Escolher treino
        </button>
      </div>
    );
  }

  const activeLastCompletedSet = lastCompletedSet?.sessionId === activeWorkout.id
    ? lastCompletedSet
    : null;

  // Calcular estatísticas para o modal de resumo e painel ativo
  const volumeSummary = aggregateWorkoutVolume(activeWorkout.exercises);
  const totalVolume = volumeSummary.totalVolume;
  const completedSetsCount = volumeSummary.effectiveSets;
  const activeProfile = getActiveGymProfile(gymProfile);
  const plateConfig = getPlateCalculatorConfig(activeProfile);
  const plateLoadout: PlateLoadout | null = plateCalculatorExerciseId !== null
    ? calculatePlateLoad(plateCalculatorTarget, plateConfig)
    : null;

  const totalSetsCount = activeWorkout.exercises.reduce((acc, ex) => {
    if (ex.techniquePlan?.type === 'drop_set' || ex.techniquePlan?.type === 'rest_pause' || ex.techniquePlan?.type === 'cluster') return acc + 1;
    if (ex.techniqueLog?.sets?.length) return acc + ex.techniqueLog.sets.length;
    return acc + ex.sets.filter((set) => !set.isWarmup).length;
  }, 0);

  // Estimativa honesta: kcal calculado por série concluída (nunca por tempo decorrido),
  // para não mostrar gasto calórico com 0 séries feitas. Ver docs/DECISOES.md.
  const estimatedCalories = activeWorkout.exercises.reduce((acc, ex) => {
    const completedSets = aggregateActiveExerciseVolume(ex).effectiveSets;
    if (completedSets === 0) return acc;
    const meta = exercises.find((e) => e.id === ex.exerciseId);
    const muscleGroup = meta?.muscleGroup || ex.muscleGroup;
    const isCompound = !!meta?.secondaryMuscles && meta.secondaryMuscles.length > 0;
    const kcalPerSet = muscleGroup === 'cardio' ? 5 : isCompound ? 9 : 6;
    return acc + completedSets * kcalPerSet;
  }, 0);
  const xpEarned = completedSetsCount * 10;

  const nextFocusIndex = activeLastCompletedSet
    ? nextWorkoutFocusIndex(activeWorkout.exercises, activeLastCompletedSet.exerciseIndex, activeLastCompletedSet.setIndex)
    : nextWorkoutFocusIndex(activeWorkout.exercises);
  const nextExercise = nextFocusIndex !== undefined
    ? activeWorkout.exercises[nextFocusIndex] ?? null
    : null;
  const nextExerciseName = nextExercise ? nextExercise.name : 'Nenhum (Finalize o Treino!)';

  const muscleGroupsWorked = Array.from(new Set(activeWorkout.exercises.map(ex => {
    const mg = ex.muscleGroup.toLowerCase();
    const map: {[key: string]: string} = {
      'legs': 'Pernas', 'chest': 'Peito', 'back': 'Costas', 'shoulders': 'Ombros',
      'biceps': 'Bíceps', 'triceps': 'Tríceps', 'abs': 'Abdômen', 'glutes': 'Glúteos',
      'cardio': 'Cardio', 'mobility': 'Mobilidade', 'functional': 'Funcional'
    };
    return map[mg] || ex.muscleGroup;
  })));

  const getPrs = () => {
    const prs: string[] = [];
    activeWorkout.exercises.forEach(ex => {
      const bestSet = bestWorkingSetWeight(ex.sets);
      if (bestSet >= 100 && ex.exerciseId.includes('supino')) {
        prs.push(`${ex.name}: PR de ${bestSet}kg!`);
      } else if (bestSet >= 140 && ex.exerciseId.includes('agachamento')) {
        prs.push(`${ex.name}: PR de ${bestSet}kg!`);
      } else if (bestSet >= 100 && ex.exerciseId.includes('elevacao')) {
        prs.push(`${ex.name}: PR de ${bestSet}kg!`);
      } else if (bestSet > 0) {
        prs.push(`${ex.name}: Recorde Pessoal (${bestSet}kg)`);
      }
    });
    return prs.slice(0, 3);
  };

  const calculatedPrs = getPrs();

  // GOAL-23B: prévia do status da sessão no resumo final — deriva das séries
  // (ignora o `status: 'active'` armazenado) para mostrar o que a sessão vai se
  // tornar ao concluir: completed / partial / abandoned.
  const finishPreview = buildSessionPreview(activeWorkout);
  const plannedMinutes = Math.max(1, Math.round(activeWorkout.plannedDuration ?? user?.duration ?? 45));
  const defaultQuickMinutes = Math.max(1, Math.min(plannedMinutes - 1, Math.round(plannedMinutes * 0.7)));

  const createCompactProposal = (targetMinutes: number) => buildCompactWorkoutProposal({
    session: activeWorkout,
    plannedMinutes,
    targetMinutes,
    catalog: exercises,
  });

  const openCompactProposal = () => {
    const target = Math.max(1, Math.min(plannedMinutes - 1, defaultQuickMinutes));
    setQuickMinutes(target);
    setCompactProposal(createCompactProposal(target));
  };

  const refreshCompactProposal = () => {
    setCompactProposal(createCompactProposal(quickMinutes));
  };

  const closeCompactProposal = () => setCompactProposal(null);

  const confirmCompactProposal = () => {
    if (!compactProposal?.requiresConfirmation) return;
    applyCompactWorkout(compactProposal);
    closeCompactProposal();
  };

  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return [
      hrs > 0 ? String(hrs).padStart(2, '0') : null,
      String(mins).padStart(2, '0'),
      String(secs).padStart(2, '0')
    ]
      .filter(Boolean)
      .join(':');
  };

  // "1:30" (sem zero à esquerda no minuto) — formato pedido para o timer de descanso.
  const formatRestTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const openSwapModal = (idx: number) => {
    setSwapIndex(idx);
    setSwapReasonCode(null);
    setSwapNote('');
    setShowSwapModal(true);
  };

  const closeSwapModal = () => {
    setShowSwapModal(false);
    setSwapIndex(null);
    setSwapReasonCode(null);
    setSwapNote('');
  };

  // GOAL-24: motivo obrigatório; nota obrigatória apenas quando o motivo é `other`.
  const swapNoteTrimmed = swapNote.trim();
  const swapReasonValid =
    swapReasonCode !== null && (swapReasonCode !== 'other' || swapNoteTrimmed.length > 0);

  const handleSwap = (newExId: string) => {
    if (swapIndex === null || swapReasonCode === null || !swapReasonValid) return;
    swapExerciseInActiveWorkout(swapIndex, newExId, {
      reasonCode: swapReasonCode,
      reasonNote: swapNoteTrimmed.length > 0 ? swapNoteTrimmed : undefined,
    });
    closeSwapModal();
  };

  // GOAL-15: adicionar exercício ao Treino Ativo pela busca (persiste de verdade,
  // via addExerciseToActiveWorkout no contexto — antes a biblioteca mutava o array
  // sem setState e a alteração não salvava).
  const addExerciseCandidates = exercises.filter((ex) => matchesExerciseSearch(ex, addSearch)).slice(0, 40);

  const handleAddExercise = (exId: string) => {
    addExerciseToActiveWorkout(exId);
    setShowAddModal(false);
    setAddSearch('');
  };

  // Filtrar substitutos recomendados baseado no mesmo grupo muscular
  const getSubstitutes = (exIndex: number) => {
    const activeExercise = activeWorkout.exercises[exIndex];
    if (!activeExercise) return [];
    const current: Pick<Exercise, 'id' | 'muscleGroup'> = exercises.find(
      (exercise) => exercise.id === activeExercise.exerciseId,
    ) ?? {
      id: activeExercise.exerciseId,
      muscleGroup: activeExercise.muscleGroup as Exercise['muscleGroup'],
    };
    return rankCrowdedGymSubstitutes(current, exercises, { crowdedGym: crowdedGymMode });
  };

  // ActionBar fixa (GOAL-04): estado da próxima série pendente.
  const allSetsCompleted = totalSetsCount > 0 && completedSetsCount === totalSetsCount;
  const currentSetNumber = Math.min(completedSetsCount + 1, totalSetsCount || 1);

  const blurActiveField = () => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();
  };

  const openFinishModal = () => {
    // NumericInput confirma no blur. O valor válido também já chegou ao Context
    // durante a digitação, mas desfocar normaliza vazio/decimal antes do resumo.
    blurActiveField();
    setShowFinishModal(true);
  };

  const handleEditSourceProgram = () => {
    if (!activeWorkout.sourceProgramId) return;

    const sourceProgram = programs.find((program) => program.id === activeWorkout.sourceProgramId);
    if (!sourceProgram) {
      toast.error('O programa de origem não existe mais. O treino atual continua salvo como snapshot.');
      return;
    }

    const sourceDays = (sourceProgram.weeks ?? []).flatMap((week) => week.days);
    const sourceDay = activeWorkout.sourceProgramDayId
      ? sourceDays.find((day) => day.id === activeWorkout.sourceProgramDayId)
      : sourceDays.length === 1
        ? sourceDays[0]
        : undefined;
    if (!sourceDay) {
      toast.error('O dia de origem não existe mais no programa. O treino atual não será alterado.');
      return;
    }

    const volumeProfile = sourceDay.volumeProfile ?? 'standard';
    openWorkoutBuilder(
      {
        programId: sourceProgram.id,
        dayId: sourceDay.id,
        name: sourceDay.name,
        // GOAL-E: `name` é o nome do DIA; o programa herda o nome do PROGRAMA de origem.
        sourceProgramName: sourceProgram.name,
        level: sourceProgram.level,
        volumeProfile,
        targetMinutes: sourceDay.targetMinutes ?? user?.duration ?? defaultTargetMinutes(volumeProfile),
        slots: sourceDay.slots,
      },
      'active-workout',
    );
    toast.info('O treino atual mantém o snapshot iniciado. As alterações do programa valerão para as próximas sessões.');
  };

  const handleContinue = () => {
    const focusIndex = activeLastCompletedSet
      ? nextWorkoutFocusIndex(activeWorkout.exercises, activeLastCompletedSet.exerciseIndex, activeLastCompletedSet.setIndex)
      : nextWorkoutFocusIndex(activeWorkout.exercises);
    const focusExercise = focusIndex === undefined ? undefined : activeWorkout.exercises[focusIndex];
    const incompleteSet = focusExercise?.sets.find((s) => !s.completed);
    if (incompleteSet) {
      const row = document.getElementById(`set-row-${incompleteSet.id}`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // O campo de carga é o primeiro input da linha (NumericInput = type="text").
      const weightInput = row?.querySelector('input') as HTMLInputElement | null;
      weightInput?.focus();
      return;
    }
    openFinishModal();
  };

  const openPlateCalculator = (exerciseId: string, targetWeight: number) => {
    setPlateCalculatorExerciseId(exerciseId);
    setPlateCalculatorTarget(Number.isFinite(targetWeight) ? Math.max(0, targetWeight) : 0);
  };

  return (
    <div className="space-y-6 pb-active-workout lg:pb-6 max-w-3xl mx-auto">
      {/* HEADER FIXO DE TREINO */}
      <div className="glass border border-white/10 p-5 rounded-3xl flex items-center justify-between shadow-xl">
        <div>
          <span className="text-[10px] font-extrabold text-gym-accent uppercase tracking-widest block mb-1">
            Sessão Ativa
          </span>
          <h1 className="text-xl font-bold text-white tracking-tight leading-none">{activeWorkout.name}</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Cronômetro */}
          <div className="flex flex-col items-end mr-1">
            <span className="text-[10px] text-gym-text-muted uppercase font-bold flex items-center gap-1">
              <Clock className="w-3 h-3 text-gym-accent" /> Tempo
            </span>
            <span className="text-base font-mono font-bold text-white leading-none mt-1">
              {formatTime(workoutDuration)}
            </span>
          </div>

          {/* GOAL-25: modo operacional sem trocar exercícios silenciosamente. */}
          <button
            type="button"
            onClick={toggleCrowdedGymMode}
            aria-pressed={crowdedGymMode}
            className={`border font-bold px-3 py-2 rounded-xl transition-all text-xs flex items-center gap-1.5 ${
              crowdedGymMode
                ? 'bg-gym-accent/15 border-gym-accent/40 text-gym-accent'
                : 'bg-white/5 hover:bg-gym-accent/15 border-white/10 hover:border-gym-accent/30 text-white hover:text-gym-accent'
            }`}
            title="Priorizar pesos livres e cabos nas substituições"
          >
            <Sparkles className={`w-3.5 h-3.5 ${crowdedGymMode ? 'animate-pulse' : 'text-gym-accent'}`} />
            <span className="hidden sm:inline">Academia cheia</span>
          </button>

          {/* GOAL-25: primeira ação abre a proposta; nenhum corte acontece aqui. */}
          <button
            type="button"
            onClick={openCompactProposal}
            className="bg-white/5 hover:bg-gym-accent/15 border border-white/10 hover:border-gym-accent/30 text-white hover:text-gym-accent font-bold px-3 py-2 rounded-xl transition-all text-xs flex items-center gap-1.5"
            title="Montar uma versão compacta para o tempo de hoje"
          >
            <Zap className="w-3.5 h-3.5 text-gym-accent" />
            <span className="hidden sm:inline">Treino rápido</span>
          </button>

          <button
            onClick={openFinishModal}
            className="bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black px-4 py-2 rounded-xl transition-all shadow-md shadow-gym-accent/15 text-xs uppercase tracking-wider"
          >
            Finalizar
          </button>
        </div>
      </div>

      <div className="bg-gym-accent/5 border border-gym-accent/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <Info className="w-4 h-4 text-gym-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-white font-semibold leading-relaxed">
              Ajustes feitos aqui valem para esta sessão e serão registrados no histórico. Para alterar os próximos treinos, edite o programa.
            </p>
            {(crowdedGymMode || activeWorkout.variant === 'compact') && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {crowdedGymMode && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gym-accent/10 border border-gym-accent/20 px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-gym-accent">
                    <Sparkles className="w-3 h-3" /> Academia cheia ativa
                  </span>
                )}
                {activeWorkout.variant === 'compact' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gym-emerald/10 border border-gym-emerald/20 px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-gym-emerald">
                    <Zap className="w-3 h-3" /> Variante compacta
                  </span>
                )}
              </div>
            )}
            {activeWorkout.sourceProgramName && (
              <p className="text-[10px] text-gym-text-muted mt-1">
                Origem: {activeWorkout.sourceProgramName}
                {activeWorkout.sourceProgramDayName ? ` · ${activeWorkout.sourceProgramDayName}` : ''}
              </p>
            )}
          </div>
        </div>
        {activeWorkout.sourceProgramId && (
          <button
            type="button"
            onClick={handleEditSourceProgram}
            className="min-h-[40px] px-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gym-accent rounded-xl text-[10px] font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 flex-shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" /> Editar programa de origem
          </button>
        )}
      </div>

      {user && user.level !== 'beginner' && user.rirOnboardingCompleted !== true && (
        <RirEducationCard
          compact
          onComplete={() => updateUserProfile({ rirOnboardingCompleted: true })}
        />
      )}

      {activeWorkout.warmup?.enabled && (
        <details open className="group rounded-2xl border border-gym-amber/20 bg-gym-amber/[0.04]">
          <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-2">
              <Flame className="h-4 w-4 text-gym-amber" aria-hidden="true" />
              <span>
                <span className="block text-xs font-black text-white">Aquecimento geral</span>
                <span className="mt-0.5 block text-[9px] text-gym-text-muted">Entrada opcional antes da primeira carga</span>
              </span>
            </span>
            <span className="flex flex-shrink-0 items-center gap-2">
              <span className="rounded-lg bg-gym-amber/10 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-gym-amber">
                {activeWorkout.warmup.generalMinutes} min
              </span>
              <ChevronDown className="h-4 w-4 text-gym-text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
            </span>
          </summary>
          <div className="border-t border-gym-amber/15 px-4 py-3 text-[10px] leading-relaxed text-gym-text-muted">
            Faça movimento leve e progressivo — por exemplo, bicicleta, esteira ou elíptico — até elevar a temperatura sem chegar à fadiga.
            <span className="mt-2 block font-bold text-gym-amber">
              Objetivo da sessão: {activeWorkout.warmup.objective === 'strength' ? 'força' : 'hipertrofia'} · As aproximações aparecem no primeiro composto de cada padrão.
            </span>
          </div>
        </details>
      )}

      {/* REST TIMER (GOAL-06) — versão desktop, sempre visível na página (não fixa).
          No mobile/tablet o mesmo estado é mostrado dentro da ActionBar fixa abaixo,
          então este card fica reservado ao desktop para não duplicar a informação. */}
      {restSecondsRemaining > 0 && (
        <div className="hidden lg:flex bg-gym-card border border-gym-accent/20 rounded-3xl p-5 items-center justify-between shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 bottom-0 w-1 bg-gym-accent animate-pulse"></div>

          <div className="flex items-center gap-4">
            {/* Circular SVG Ring */}
            <div className="relative w-14 h-14 flex items-center justify-center flex-shrink-0">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  className="stroke-white/5 fill-transparent"
                  strokeWidth="4"
                />
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  className="stroke-gym-accent fill-transparent transition-all duration-1000"
                  strokeWidth="4"
                  strokeDasharray={2 * Math.PI * 24}
                  strokeDashoffset={2 * Math.PI * 24 * (1 - restSecondsRemaining / (restTimerTotalSeconds || 1))}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-xs font-mono font-extrabold text-gym-accent">{formatRestTime(restSecondsRemaining)}</span>
            </div>

            <div>
              <span className="text-[10px] font-extrabold text-gym-accent uppercase tracking-widest block">Descanso Biomecânico Ativo</span>
              <p className="text-xs text-gym-text-muted mt-0.5">
                {restTimerLabel ? `Prepare-se para: ${restTimerLabel}` : 'Oxigenando fibras... Prepare-se para a próxima série.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => extendRestTimer(30)}
              className="text-[10px] bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl border border-white/10 font-bold text-white transition-all"
            >
              +30s
            </button>
            <button
              onClick={skipRestTimer}
              className="text-[10px] bg-gym-rose/10 hover:bg-gym-rose/20 text-gym-rose border border-gym-rose/20 px-3 py-2 rounded-xl font-bold transition-all"
            >
              Pular
            </button>
          </div>
        </div>
      )}

      {/* LIVE METRICS PANEL */}
      <div className="glass p-5 rounded-3xl border border-white/5 space-y-4 shadow-lg">
        <div className="flex justify-between items-center border-b border-white/5 pb-3">
          <span className="text-[10px] font-extrabold text-white uppercase tracking-widest flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-gym-accent animate-pulse" /> Painel Técnico do Treino
          </span>
          <span className="text-[10px] font-bold text-gym-text-muted bg-white/5 px-2.5 py-0.5 rounded-full">
            Progresso: {completedSetsCount} / {totalSetsCount} séries
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-gym-accent to-gym-emerald transition-all duration-500"
            style={{ width: `${totalSetsCount > 0 ? (completedSetsCount / totalSetsCount) * 100 : 0}%` }}
          ></div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="bg-white/5 border border-white/5 p-3 rounded-2xl">
            <span className="text-[9px] text-gym-text-muted uppercase font-bold block">Volume Total</span>
            <span className="text-sm font-extrabold text-gym-accent mt-0.5 block">{totalVolume} kg</span>
          </div>
          <div className="bg-white/5 border border-white/5 p-3 rounded-2xl">
            <span className="text-[9px] text-gym-text-muted uppercase font-bold block">Energia Gasta (kcal est.)</span>
            <span className="text-sm font-extrabold text-white mt-0.5 block">{estimatedCalories} kcal</span>
          </div>
          <div className="bg-white/5 border border-white/5 p-3 rounded-2xl">
            <span className="text-[9px] text-gym-text-muted uppercase font-bold block">XP Acumulado</span>
            <span className="text-sm font-extrabold text-gym-emerald mt-0.5 block">+{xpEarned} XP</span>
          </div>
          <div className="bg-white/5 border border-white/5 p-3 rounded-2xl">
            <span className="text-[9px] text-gym-text-muted uppercase font-bold block">Músculos Ativos</span>
            <span className="text-[10px] font-bold text-white mt-0.5 block truncate" title={muscleGroupsWorked.join(', ')}>
              {muscleGroupsWorked.length > 0 ? muscleGroupsWorked.join(', ') : 'Nenhum'}
            </span>
          </div>
        </div>

        <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl flex items-center justify-between text-xs">
          <span className="text-gym-text-muted font-bold">Próximo exercício:</span>
          <span className="text-white font-extrabold truncate max-w-[200px]">{nextExerciseName}</span>
        </div>
      </div>

      {/* EXERCISES LIST */}
      <div className="space-y-6">
        {activeWorkout.exercises.map((ex, exIdx) => {
          // GOAL-23B: estado de execução derivado ao vivo das séries. O
          // `entryStatus` da sessão ativa fica em `planned` até a finalização,
          // então a derivação direta reflete o progresso real de cada exercício.
          const liveEntryStatus = deriveExerciseEntryStatus(ex);
          // GOAL-24: após a troca, o card mostra "Substitui <original> • <motivo>".
          const swapView = ex.entryOrigin === 'swapped' ? buildSwapView(ex) : null;
          const group = getGroupForEntry(activeWorkout.exercises, exIdx);
          const groupRounds = group ? Math.max(1, group.roundCount) : 0;
          const completedGroupRounds = group
            ? Math.min(...group.memberIndices.map((memberIndex) => {
                const memberSets = (activeWorkout.exercises[memberIndex]?.sets ?? [])
                  .filter((set) => !set.isWarmup);
                let completed = 0;
                while (memberSets[completed]?.completed) completed += 1;
                return completed;
              }))
            : 0;
          const currentGroupRound = group
            ? Math.min(groupRounds, Math.max(1, completedGroupRounds + 1))
            : 0;
          const warmupRows = ex.sets
            .map((set, setIdx) => ({ set, setIdx }))
            .filter(({ set }) => set.isWarmup);
          const workingRows = ex.sets
            .map((set, setIdx) => ({ set, setIdx }))
            .filter(({ set }) => !set.isWarmup);
          const firstWorkingSet = workingRows[0]?.set ?? ex.sets[0];
          return (
          <div id={`exercise-card-${ex.id}`} key={ex.id} className="glass p-5 rounded-3xl border border-white/5 space-y-4">
            {/* TÍTULO DO EXERCÍCIO */}
            <div className="flex justify-between items-start border-b border-white/5 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                  <span className="text-gym-accent">#{exIdx + 1}</span>
                  <span className="truncate">{ex.name}</span>
                  {group && (
                    <span className="inline-flex items-center rounded-full border border-gym-accent/25 bg-gym-accent/10 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-gym-accent">
                      {group.label} · rodada {currentGroupRound}/{groupRounds}
                    </span>
                  )}
                  {/* GOAL-23B: origem da entrada — destacada só quando não planejada. */}
                  {(ex.entryOrigin === 'added' || ex.entryOrigin === 'swapped') && (
                    <ExerciseOriginBadge exercise={ex} />
                  )}
                  {/* GOAL-23B: execução ao vivo — só com progresso real, para não
                      rotular de "Pulado" um exercício ainda não iniciado. */}
                  {(liveEntryStatus === 'performed' || liveEntryStatus === 'partial') && (
                    <ExerciseExecutionBadge status={liveEntryStatus} />
                  )}
                </h3>
                <span className="text-[10px] text-gym-text-muted capitalize">
                  {/* GOAL-07: meta real do ExerciseSlot quando o treino vem de um Day de programa */}
                  {ex.repRange
                    ? `${ex.muscleGroup} • Meta: ${ex.repRange[0] === ex.repRange[1] ? ex.repRange[0] : `${ex.repRange[0]}-${ex.repRange[1]}`} reps • RPE ${ex.targetRPE ?? 8}${ex.restSec ? ` • Descanso ${ex.restSec}s` : ''}`
                    : ex.muscleGroup}
                </span>
                {/* GOAL-08 / GOAL-29: motivo honesto e tela "Por que esse peso?" */}
                {(ex.progressionNote || ex.progressionDecision) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {ex.progressionNote && (
                      <span className="text-[9px] text-gym-accent/80 normal-case leading-snug">
                        Progressão recomendada: {ex.progressionNote}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setWhyThisWeightExercise(ex)}
                      className="inline-flex items-center gap-1 rounded-md border border-gym-accent/30 bg-gym-accent/10 px-2 py-0.5 text-[9px] font-bold text-gym-accent hover:bg-gym-accent/20 transition-colors active:scale-95"
                      title="Ver detalhes da recomendação de peso"
                      aria-label={`Por que esse peso para ${ex.name}?`}
                    >
                      <HelpCircle className="w-3 h-3" aria-hidden="true" />
                      Por que esse peso?
                    </button>
                  </div>
                )}
                {/* GOAL-24: substituição — planejado (original) → executado + motivo */}
                {swapView && (
                  <span className="block text-[9px] text-amber-400/90 normal-case mt-0.5 leading-snug">
                    Substitui {swapView.planned}
                    {swapView.reasonLabel ? ` • ${swapView.reasonLabel}` : ''}
                  </span>
                )}
              </div>

              {/* Ações */}
              <div className="flex gap-2 flex-wrap justify-end">
                {firstWorkingSet && (
                  <button
                    type="button"
                    onClick={() => plateCalculatorExerciseId === ex.id
                      ? setPlateCalculatorExerciseId(null)
                      : openPlateCalculator(ex.id, firstWorkingSet.weight)}
                    aria-pressed={plateCalculatorExerciseId === ex.id}
                    className={`min-h-[44px] text-[10px] px-3 rounded-lg flex items-center gap-1 transition-all active:scale-95 border ${
                      plateCalculatorExerciseId === ex.id
                        ? 'bg-gym-accent/15 border-gym-accent/40 text-gym-accent'
                        : 'bg-white/5 hover:bg-gym-accent/10 border-white/5 text-gym-text-muted hover:text-gym-accent'
                    }`}
                    title="Abrir calculadora de anilhas"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    Anilhas
                  </button>
                )}
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => moveExerciseInActiveWorkout(exIdx, exIdx - 1)}
                    disabled={exIdx === 0}
                    className="min-h-[44px] w-10 text-gym-text-muted hover:text-gym-accent bg-white/5 hover:bg-gym-accent/10 border border-white/5 rounded-lg flex items-center justify-center transition-all active:scale-95 disabled:opacity-25 disabled:cursor-not-allowed"
                    title="Mover exercício para cima"
                    aria-label={`Mover ${ex.name} para cima`}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveExerciseInActiveWorkout(exIdx, exIdx + 1)}
                    disabled={exIdx === activeWorkout.exercises.length - 1}
                    className="min-h-[44px] w-10 text-gym-text-muted hover:text-gym-accent bg-white/5 hover:bg-gym-accent/10 border border-white/5 rounded-lg flex items-center justify-center transition-all active:scale-95 disabled:opacity-25 disabled:cursor-not-allowed"
                    title="Mover exercício para baixo"
                    aria-label={`Mover ${ex.name} para baixo`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={() => openSwapModal(exIdx)}
                  className="min-h-[44px] text-[10px] bg-white/5 hover:bg-white/10 border border-white/5 text-gym-text-muted hover:text-white px-3 rounded-lg flex items-center gap-1 transition-all active:scale-95"
                  title="Trocar Exercício"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-gym-accent" />
                  Trocar
                </button>
                {activeWorkout.exercises.length > 1 && (
                  <button
                    onClick={() => removeExerciseFromActiveWorkout(exIdx)}
                    className="min-h-[44px] w-11 text-gym-rose bg-gym-rose/10 hover:bg-gym-rose/20 border border-gym-rose/20 rounded-lg flex items-center justify-center transition-all active:scale-95"
                    title="Remover exercício do treino"
                    aria-label={`Remover ${ex.name} do treino`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* DEMONSTRAÇÃO DO EXERCÍCIO — sequência visual provisória (GOAL-13);
                fallback honesto quando ainda não houver imagens suficientes. */}
            <div className="w-full rounded-2xl overflow-hidden border border-white/5 flex flex-col">
              <TechniqueSequencePlayer
                exercise={exercises.find((e) => e.id === ex.exerciseId)}
                name={ex.name}
                compact
                fit="cover"
              />
              <button
                onClick={() => {
                  openGlobalPlayer(getTechniqueVideoIdForExerciseId(ex.exerciseId));
                }}
                className="w-full min-h-[44px] bg-black/40 hover:bg-black/60 border-t border-white/5 text-white hover:text-gym-accent font-black uppercase tracking-wider text-[10px] flex items-center justify-center gap-1.5 transition-all"
              >
                <Play className="w-3 h-3 fill-current" /> Ver Técnica
              </button>
            </div>

            {/* TABELA DE SÉRIES */}
            <div className="space-y-2">
              {/* Table Header */}
              <div className="grid grid-cols-12 text-center text-[9px] font-bold text-gym-text-muted uppercase tracking-wider pl-1 gap-1">
                <span className="col-span-2 text-left">Série</span>
                <span className="col-span-2">Ant/Sug</span>
                <span className="col-span-3">Carga (kg)</span>
                <span className="col-span-2">Reps</span>
                <span className="col-span-2">RPE</span>
                <span className="col-span-1">OK</span>
              </div>

              {warmupRows.length > 0 && (
                <details open className="group rounded-xl border border-gym-amber/15 bg-gym-amber/[0.03]">
                  <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 text-[10px] font-black uppercase tracking-wide text-gym-amber [&::-webkit-details-marker]:hidden">
                    <span>Aproximação · {warmupRows.length} {warmupRows.length === 1 ? 'série' : 'séries'}</span>
                    <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="space-y-2 border-t border-gym-amber/15 p-1.5">
                    {warmupRows.map(({ set, setIdx }, warmupIndex) => (
                      <ActiveWorkoutSetRow
                        key={set.id}
                        set={set}
                        displayIndex={warmupIndex}
                        warmupIndex={warmupIndex}
                        showRir={user?.level !== 'beginner'}
                        onUpdate={(fields) => updateWorkoutSet(exIdx, setIdx, fields)}
                        onToggle={() => {
                          const wasCompleted = set.completed;
                          completeWorkoutSet(exIdx, setIdx);
                          if (wasCompleted) {
                            lastScrolledCompletion.current = null;
                            setLastCompletedSet(null);
                          } else {
                            setLastCompletedSet({ sessionId: activeWorkout.id, exerciseIndex: exIdx, setIndex: setIdx });
                          }
                        }}
                      />
                    ))}
                  </div>
                </details>
              )}
              <div className="space-y-2">
                {workingRows.map(({ set, setIdx }, workIndex) => (
                  <ActiveWorkoutSetRow
                    key={set.id}
                    set={set}
                    displayIndex={workIndex}
                    showRir={user?.level !== 'beginner'}
                    onUpdate={(fields) => updateWorkoutSet(exIdx, setIdx, fields)}
                    onToggle={() => {
                      const wasCompleted = set.completed;
                      completeWorkoutSet(exIdx, setIdx);
                      if (wasCompleted) {
                        lastScrolledCompletion.current = null;
                        setLastCompletedSet(null);
                      } else {
                        setLastCompletedSet({ sessionId: activeWorkout.id, exerciseIndex: exIdx, setIndex: setIdx });
                      }
                    }}
                  />
                ))}
              </div>
            </div>

            {plateCalculatorExerciseId === ex.id && plateLoadout && (
              <div className="rounded-2xl border border-gym-accent/20 bg-gym-accent/[0.04] p-3.5" aria-label={`Calculadora de anilhas para ${ex.name}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-gym-accent">
                      <Calculator className="h-3.5 w-3.5" aria-hidden="true" /> Calculadora de anilhas
                    </span>
                    <p className="mt-1 text-[9px] leading-relaxed text-gym-text-muted">
                      Carga total com barra de {formatLoadKg(plateLoadout.barWeightKg)}. A montagem é igual nos dois lados.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPlateCalculatorExerciseId(null)}
                    className="min-h-[36px] rounded-lg border border-white/10 px-2.5 text-[9px] font-bold text-gym-text-muted hover:text-white"
                    aria-label="Fechar calculadora de anilhas"
                  >
                    Fechar
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-[150px_1fr]">
                  <label className="text-[9px] font-bold uppercase tracking-wide text-gym-text-muted">
                    Carga alvo (kg)
                    <NumericInput
                      value={plateCalculatorTarget}
                      allowDecimal
                      min={0}
                      onValidChange={setPlateCalculatorTarget}
                      onCommit={(value) => setPlateCalculatorTarget(value ?? 0)}
                      className="mt-1 w-full min-h-[40px] bg-gym-dark/60 border border-white/10 text-white rounded-lg px-2 text-xs font-mono focus:border-gym-accent outline-none"
                      aria-label="Carga alvo para calcular as anilhas"
                    />
                  </label>
                  <div className="rounded-xl border border-white/10 bg-gym-dark/40 px-3 py-2.5">
                    <span className="block text-[9px] font-bold uppercase tracking-wide text-gym-text-muted">Montagem por lado</span>
                    <span className="mt-1 block text-sm font-black text-white">
                      {plateLoadout.platesPerSideKg.length > 0
                        ? plateLoadout.platesPerSideKg.map(formatLoadKg).join(' + ')
                        : 'Somente a barra'}
                    </span>
                    <span className="mt-1 block text-[9px] text-gym-accent">
                      {formatLoadKg(plateLoadout.loadedWeightKg)} montados · {plateLoadout.exact ? 'carga exata' : `arredondado ${plateLoadout.differenceKg >= 0 ? '+' : ''}${plateLoadout.differenceKg} kg`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {ex.techniquePlan && (
              <TechniquePanel
                plan={ex.techniquePlan}
                log={ex.techniqueLog}
                exercise={exercises.find((item) => item.id === ex.exerciseId)}
                level={user?.level ?? 'beginner'}
                manualUnlocks={user?.techniqueUnlocks ?? []}
                onChange={(log) => updateActiveExerciseTechniqueLog(exIdx, log)}
                onUnlock={unlockTechnique}
              />
            )}

            {/* ANOTAÇÕES DO EXERCÍCIO */}
            <div className="mt-2.5 bg-white/5 border border-white/5 rounded-2xl p-3">
              <span className="text-[9px] font-bold text-gym-text-muted uppercase tracking-wider block mb-1">
                Anotações e Ajustes (Ex: Angulação do Banco, Pegada)
              </span>
              <input
                type="text"
                placeholder="Ex: Banco inclinado 30 graus, pegada supinada..."
                value={ex.notes || ''}
                onChange={(e) => updateExerciseNotes(exIdx, e.target.value)}
                className="w-full bg-gym-dark/40 border border-white/5 hover:border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gym-text-muted/40 focus:border-gym-accent/30 outline-none transition-all"
              />
            </div>

            {/* AÇÕES DE TABELA */}
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => removeSetFromActiveExercise(exIdx)}
                className="min-h-[44px] text-[10px] text-gym-rose hover:bg-gym-rose/10 px-3 rounded-lg border border-transparent hover:border-gym-rose/20 transition-all font-semibold active:scale-95"
              >
                - Remover Série
              </button>
              <button
                onClick={() => addSetToActiveExercise(exIdx)}
                className="min-h-[44px] text-[10px] text-gym-accent hover:bg-gym-accent/10 px-3 rounded-lg border border-transparent hover:border-gym-accent/20 transition-all font-semibold active:scale-95"
              >
                + Adicionar Série
              </button>
            </div>
          </div>
          );
        })}
      </div>

      {/* ADICIONAR EXERCÍCIO AO TREINO ATIVO (GOAL-15) */}
      <button
        onClick={() => setShowAddModal(true)}
        className="w-full min-h-[52px] border-2 border-dashed border-white/15 hover:border-gym-accent/40 text-gym-text-muted hover:text-gym-accent rounded-3xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider transition-all active:scale-[0.99]"
      >
        <Plus className="w-4 h-4" />
        Adicionar Exercício
      </button>

      {/* CANCEL BUTTON */}
      <div className="flex justify-center pt-4">
        <button
          onClick={() => setShowCancelConfirm(true)}
          className="text-xs text-gym-rose hover:underline font-bold px-4 py-2 hover:bg-gym-rose/10 rounded-xl"
        >
          Cancelar Treino Atual
        </button>
      </div>

      <ConfirmDialog
        isOpen={showCancelConfirm}
        variant="destructive"
        title="Cancelar treino atual?"
        description="Todo o progresso deste treino (séries marcadas, tempo decorrido) será perdido. Essa ação não pode ser desfeita."
        confirmLabel="Cancelar treino"
        cancelLabel="Continuar treinando"
        onConfirm={() => {
          setShowCancelConfirm(false);
          cancelWorkout();
        }}
        onCancel={() => setShowCancelConfirm(false)}
      />

      {/* ACTIONBAR FIXA (GOAL-04) — substitui o FAB flutuante "Continuar" dentro do
          próprio Treino Ativo. Mobile/tablet apenas (lg:hidden); no desktop o botão
          "Finalizar" do header acima já cumpre esse papel sem barra fixa nova.
          GOAL-06: quando o timer de descanso está ativo, a barra mostra o descanso
          (tempo + progresso + +30s/Pular) no lugar de Continuar/Finalizar. */}
      <div
        className="lg:hidden fixed inset-x-0 z-30 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] px-4"
      >
        <div className="glass border border-white/10 rounded-2xl shadow-2xl px-4 py-3">
          {restSecondsRemaining > 0 ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-extrabold text-gym-accent uppercase tracking-widest truncate">
                    {restTimerLabel ? `Descanso • ${restTimerLabel}` : 'Descanso'}
                  </span>
                  <span className="text-lg font-mono font-black text-white leading-none flex-shrink-0 ml-2">
                    {formatRestTime(restSecondsRemaining)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-gym-accent to-gym-emerald transition-all duration-300"
                    style={{ width: `${restTimerTotalSeconds ? (restSecondsRemaining / restTimerTotalSeconds) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => extendRestTimer(30)}
                  className="min-h-[44px] px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-bold text-white transition-all active:scale-95"
                >
                  +30s
                </button>
                <button
                  onClick={skipRestTimer}
                  className="min-h-[44px] px-3 bg-gym-rose/10 hover:bg-gym-rose/20 text-gym-rose border border-gym-rose/20 rounded-xl text-[10px] font-bold transition-all active:scale-95"
                >
                  Pular
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold text-gym-accent uppercase tracking-widest block">
                  Série {currentSetNumber} de {totalSetsCount}
                </span>
                <span className="text-xs font-bold text-white block truncate max-w-[180px]">
                  {allSetsCompleted ? 'Treino Concluído' : nextExerciseName}
                </span>
              </div>
              <button
                onClick={allSetsCompleted ? openFinishModal : handleContinue}
                className="flex-shrink-0 min-h-[44px] flex items-center gap-1.5 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black uppercase tracking-wider text-xs px-4 py-3 rounded-xl shadow-md shadow-gym-accent/20 transition-all active:scale-95"
              >
                {allSetsCompleted ? (
                  <>
                    <Flag className="w-3.5 h-3.5" /> Finalizar
                  </>
                ) : (
                  <>
                    Continuar <ChevronRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL DE PROPOSTA DO TREINO RÁPIDO (GOAL-25): só aplica após confirmação. */}
      {compactProposal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="compact-workout-title"
            className="bg-gym-dark border border-gym-accent/25 rounded-3xl w-full max-w-md p-6 relative max-h-[85vh] overflow-y-auto shadow-2xl"
          >
            <button
              type="button"
              onClick={closeCompactProposal}
              className="absolute top-4 right-4 text-gym-text-muted hover:text-white rounded-lg bg-white/5 tap-target flex items-center justify-center"
              aria-label="Fechar proposta de treino rápido"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="pr-8">
              <span className="text-[10px] font-extrabold text-gym-accent uppercase tracking-widest">Treino rápido</span>
              <h2 id="compact-workout-title" className="text-lg font-black text-white mt-1">Ajustar para o tempo de hoje</h2>
              <p className="text-xs text-gym-text-muted leading-relaxed mt-1">
                O plano tem {compactProposal.sourceMinutes} min. Informe o tempo disponível; compostos ficam protegidos e os cortes aparecem antes da confirmação.
              </p>
            </div>

            <div className="flex items-end gap-2 mt-5">
              <label className="flex-1">
                <span className="block text-[10px] font-extrabold text-gym-text-muted uppercase tracking-wider mb-1.5">
                  Tenho hoje (min)
                </span>
                <input
                  type="number"
                  min={1}
                  max={compactProposal.sourceMinutes}
                  value={quickMinutes}
                  onChange={(event) => setQuickMinutes(Math.max(1, Number(event.target.value) || 1))}
                  className="w-full min-h-[44px] bg-gym-card border border-white/10 focus:border-gym-accent rounded-2xl px-3.5 text-sm text-white outline-none"
                />
              </label>
              <button
                type="button"
                onClick={refreshCompactProposal}
                className="min-h-[44px] px-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-extrabold uppercase tracking-wide text-gym-accent"
              >
                Atualizar
              </button>
            </div>

            <div className="mt-4 bg-white/5 border border-white/10 rounded-2xl p-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-extrabold text-gym-text-muted uppercase tracking-wider">Prévia</span>
                <span className={`text-[10px] font-black ${compactProposal.canReachTarget ? 'text-gym-emerald' : 'text-gym-amber'}`}>
                  ~{compactProposal.estimatedMinutesAfter} min
                </span>
              </div>
              {compactProposal.removedExercises.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <p className="text-[10px] font-extrabold text-white uppercase tracking-wider">O que sai</p>
                  {compactProposal.removedExercises.map((removed) => (
                    <div key={removed.activeExerciseId} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-white truncate">{removed.name}</span>
                      <span className="text-gym-amber font-mono text-[10px] flex-shrink-0">-{removed.estimatedMinutes} min</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gym-text-muted mt-2">
                  {compactProposal.sourceMinutes <= compactProposal.targetMinutes
                    ? 'Esse tempo não é menor que o plano; nada será removido.'
                    : 'Nenhum isolador seguro para cortar. Os compostos continuam preservados.'}
                </p>
              )}
            </div>

            <p className="text-[10px] text-gym-text-muted leading-relaxed mt-3">
              {compactProposal.rationale.join(' ')}
            </p>

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={closeCompactProposal}
                className="flex-1 min-h-[44px] px-4 rounded-2xl text-xs font-extrabold bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={confirmCompactProposal}
                disabled={!compactProposal.requiresConfirmation}
                className="flex-1 min-h-[44px] px-4 rounded-2xl text-xs font-extrabold bg-gym-accent text-gym-dark hover:bg-gym-accent-hover transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {compactProposal.requiresConfirmation ? 'Confirmar cortes' : 'Sem alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE TROCA DE EXERCÍCIO */}
      {showSwapModal && swapIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gym-dark border border-white/10 rounded-3xl w-full max-w-md p-6 relative max-h-[80vh] overflow-y-auto">
            <button
              onClick={closeSwapModal}
              className="absolute top-4 right-4 text-gym-text-muted hover:text-white rounded-lg bg-white/5 tap-target flex items-center justify-center"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-bold text-gym-accent uppercase tracking-wider mb-2">Substituir exercício</h3>
            <h2 className="text-base font-bold text-white mb-4">
              Substituir &quot;{activeWorkout.exercises[swapIndex]?.name}&quot;
            </h2>

            {crowdedGymMode && (
              <div className="mb-4 rounded-2xl border border-gym-accent/20 bg-gym-accent/5 p-3 text-[10px] font-semibold leading-relaxed text-gym-accent">
                Academia cheia ativa: pesos livres e cabos aparecem primeiro nesta fila.
              </div>
            )}

            {/* GOAL-24: motivo da troca (obrigatório) */}
            <div className="mb-4">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-gym-text-muted mb-1.5">
                Motivo da troca
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SWAP_REASON_ORDER.map((code) => {
                  const active = swapReasonCode === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSwapReasonCode(code)}
                      className={`min-h-[44px] px-3.5 rounded-xl text-[11px] font-bold border transition-all ${
                        active
                          ? 'bg-gym-accent/15 border-gym-accent text-gym-accent'
                          : 'bg-white/5 border-white/5 text-gym-text-muted hover:text-white hover:border-white/20'
                      }`}
                    >
                      {SWAP_REASON_LABELS[code]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* GOAL-24: nota — opcional, exceto para "Outro"; limitada a 120 caracteres */}
            <div className="mb-4">
              <label
                htmlFor="swap-note"
                className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-gym-text-muted mb-1.5"
              >
                <span>Nota {swapReasonCode === 'other' ? '(obrigatória)' : '(opcional)'}</span>
                <span className="text-gym-text-muted/70 normal-case tracking-normal">
                  {swapNote.length}/{MAX_SWAP_REASON_NOTE_LENGTH}
                </span>
              </label>
              <input
                id="swap-note"
                type="text"
                value={swapNote}
                maxLength={MAX_SWAP_REASON_NOTE_LENGTH}
                onChange={(e) => setSwapNote(e.target.value)}
                placeholder={
                  swapReasonCode === 'other'
                    ? 'Descreva o motivo da troca...'
                    : 'Detalhe opcional (ex.: barra ocupada, ombro sensível)...'
                }
                className="w-full min-h-[44px] bg-gym-card border border-white/10 focus:border-gym-accent rounded-2xl px-3.5 py-2.5 text-sm text-white placeholder-gym-text-muted/50 outline-none transition-all"
              />
              {swapReasonCode === 'other' && swapNoteTrimmed.length === 0 && (
                <p className="text-[10px] text-amber-400/90 mt-1.5">
                  Para o motivo &quot;Outro&quot;, descreva o motivo na nota.
                </p>
              )}
            </div>

            {/* SUBSTITUTOS — bloqueados até o motivo obrigatório ser válido */}
            <div className="space-y-2">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-gym-text-muted mb-0.5">
                Escolha o substituto
              </span>
              {!swapReasonValid && (
                <p className="text-[10px] text-gym-text-muted mb-1">
                  Selecione um motivo{swapReasonCode === 'other' ? ' e preencha a nota' : ''} para liberar a troca.
                </p>
              )}
              {getSubstitutes(swapIndex).length === 0 ? (
                <p className="text-xs text-gym-text-muted text-center py-4">Nenhum exercício similar encontrado.</p>
              ) : (
                getSubstitutes(swapIndex).map((subEx) => (
                  <button
                    key={subEx.id}
                    type="button"
                    disabled={!swapReasonValid}
                    onClick={() => handleSwap(subEx.id)}
                    className="w-full text-left bg-gym-card/50 border border-white/5 hover:border-gym-accent/30 p-3 rounded-2xl flex items-center justify-between transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-white">{subEx.name}</h4>
                      <p className="text-[9px] text-gym-text-muted uppercase font-bold mt-0.5">{subEx.equipment}</p>
                    </div>
                    <span className="text-[10px] text-gym-accent font-bold uppercase">Substituir</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ADICIONAR EXERCÍCIO (GOAL-15) — busca com aliases/sem acento */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gym-dark border border-white/10 rounded-3xl w-full max-w-md p-6 relative max-h-[85vh] flex flex-col">
            <button
              onClick={() => {
                setShowAddModal(false);
                setAddSearch('');
              }}
              className="absolute top-4 right-4 text-gym-text-muted hover:text-white rounded-lg bg-white/5 tap-target flex items-center justify-center"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-bold text-gym-accent uppercase tracking-wider mb-1">Adicionar ao treino</h3>
            <h2 className="text-base font-bold text-white mb-3">Escolha um exercício</h2>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gym-text-muted" />
              <input
                type="text"
                autoFocus
                placeholder="Buscar (ex: tríceps polia, remada baixa)..."
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                className="w-full bg-gym-card border border-white/10 focus:border-gym-accent rounded-2xl py-3 pl-10 pr-4 text-sm text-white placeholder-gym-text-muted outline-none transition-all"
              />
            </div>

            <div className="space-y-2 overflow-y-auto flex-1 -mr-2 pr-2">
              {addExerciseCandidates.length === 0 ? (
                <p className="text-xs text-gym-text-muted text-center py-6">
                  Nenhum exercício encontrado para “{addSearch}”.
                </p>
              ) : (
                addExerciseCandidates.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => handleAddExercise(ex.id)}
                    className="w-full text-left bg-gym-card/50 border border-white/5 hover:border-gym-accent/30 p-3 rounded-2xl flex items-center justify-between transition-all active:scale-[0.99]"
                  >
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">{ex.name}</h4>
                      <p className="text-[9px] text-gym-text-muted uppercase font-bold mt-0.5 truncate">{ex.equipment}</p>
                    </div>
                    <Plus className="w-4 h-4 text-gym-accent flex-shrink-0 ml-2" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE RESUMO / PERCEPÇÃO DE ESFORÇO */}
      {whyThisWeightExercise && (
        <WhyThisWeightModal
          exercise={whyThisWeightExercise}
          isOpen={Boolean(whyThisWeightExercise)}
          onClose={() => setWhyThisWeightExercise(null)}
          onApplyWeightToAllSets={(weightKg) => {
            const exIdx = activeWorkout.exercises.findIndex((e) => e.id === whyThisWeightExercise.id);
            if (exIdx >= 0) {
              whyThisWeightExercise.sets.forEach((set, sIdx) => {
                if (!set.isWarmup) {
                  updateWorkoutSet(exIdx, sIdx, { weight: weightKg });
                }
              });
              recordExerciseProgressionOverride(
                whyThisWeightExercise.exerciseId,
                whyThisWeightExercise.progressionDecision?.pesoKg ?? null,
                weightKg,
              );
            }
          }}
          adjustmentInfo={
            user?.progressionParameterAdjustments
              ?.filter((a) => a.exerciseId === whyThisWeightExercise.exerciseId)
              .at(-1)
          }
        />
      )}

      {showFinishModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-gym-dark border border-white/10 rounded-3xl w-full max-w-md p-6 text-center space-y-5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gym-accent to-gym-emerald"></div>
            
            <div className="w-12 h-12 bg-gym-accent/10 border border-gym-accent/25 rounded-full flex items-center justify-center text-gym-accent mx-auto">
              <Award className="w-6 h-6 animate-bounce" />
            </div>

            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Parabéns pelo Treino!</h2>
              <p className="text-xs text-gym-text-muted mt-1">Sua sessão foi salva com sucesso no histórico.</p>
            </div>

            {/* MÉTRICAS DE RESUMO */}
            <div className="grid grid-cols-3 gap-2.5 bg-white/5 p-3.5 rounded-2xl border border-white/5">
              <div className="text-center">
                <span className="text-[9px] text-gym-text-muted uppercase font-bold">Tempo</span>
                <p className="text-sm font-bold text-white mt-0.5">{formatTime(workoutDuration)}</p>
              </div>
              <div className="text-center border-x border-white/5">
                <span className="text-[9px] text-gym-text-muted uppercase font-bold">Volume Total</span>
                <p className="text-sm font-bold text-gym-accent mt-0.5">{totalVolume} kg</p>
              </div>
              <div className="text-center">
                <span className="text-[9px] text-gym-text-muted uppercase font-bold">Séries OK</span>
                <p className="text-sm font-bold text-white mt-0.5">{completedSetsCount}</p>
              </div>
            </div>

            {/* GOAL-23B: PRÉVIA DO STATUS DA SESSÃO */}
            <div className="text-left bg-white/5 border border-white/5 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-gym-text-muted font-bold uppercase tracking-wider">
                  Status da sessão
                </span>
                <SessionStatusBadge status={finishPreview.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-gym-dark/40 rounded-xl p-2">
                  <span className="text-gym-text-muted text-[9px] uppercase font-bold block">Exercícios</span>
                  <p className="text-white font-bold mt-0.5">
                    {finishPreview.performedExercises} concluído{finishPreview.performedExercises === 1 ? '' : 's'}
                    {finishPreview.skippedExercises > 0 && (
                      <span className="text-gym-rose"> · {finishPreview.skippedExercises} pulado{finishPreview.skippedExercises === 1 ? '' : 's'}</span>
                    )}
                  </p>
                </div>
                <div className="bg-gym-dark/40 rounded-xl p-2">
                  <span className="text-gym-text-muted text-[9px] uppercase font-bold block">Séries</span>
                  <p className="text-white font-bold mt-0.5">
                    {finishPreview.completedSets} concluída{finishPreview.completedSets === 1 ? '' : 's'}
                    {finishPreview.incompleteSets > 0 && (
                      <span className="text-gym-text-muted"> · {finishPreview.incompleteSets} incompleta{finishPreview.incompleteSets === 1 ? '' : 's'}</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* PRs BATIDOS */}
            {calculatedPrs.length > 0 && (
              <div className="text-left bg-gym-accent/5 border border-gym-accent/10 rounded-2xl p-3.5">
                <span className="text-[9px] font-extrabold text-gym-accent uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-gym-accent" /> Recordes Pessoais (PRs)
                </span>
                <ul className="space-y-1">
                  {calculatedPrs.map((pr, idx) => (
                    <li key={idx} className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-gym-accent"></span>
                      {pr}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* RPE Selector */}
            <div className="space-y-2 text-left bg-white/5 border border-white/5 rounded-2xl p-4">
              <div className="flex justify-between text-[10px] text-gym-text-muted font-bold">
                <span>Esforço Físico (RPE)</span>
                <span className="text-gym-accent font-black">{rpe} / 10</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={rpe}
                onChange={(e) => setRpe(Number(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-gym-accent mt-1"
              />
              <p className="text-[10px] text-gym-text-muted italic mt-1 text-center">
                {rpe <= 3
                  ? 'Recuperativo ou aquecimento leve.'
                  : rpe <= 6
                  ? 'Intensidade moderada. Bom estímulo.'
                  : rpe <= 8
                  ? 'Intensidade perfeita para hipertrofia e ganho de força!'
                  : 'Extremo. Perto da falha concêntrica absoluta.'}
              </p>
            </div>

            {/* SHARE / POST NOTE */}
            <div className="flex items-center justify-between text-left p-3.5 bg-white/5 rounded-2xl border border-white/5">
              <div>
                <span className="text-[10px] font-bold text-white block">Compartilhar no Feed</span>
                <p className="text-[9px] text-gym-text-muted mt-0.5">Postar conquistas e volume na comunidade GymFlow AI</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-gym-accent/15 flex items-center justify-center text-gym-accent">
                <Share2 className="w-4 h-4" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowFinishModal(false)}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold transition-all text-center"
              >
                Voltar
              </button>
              <button
                onClick={() => {
                  blurActiveField();
                  finishWorkout(rpe);
                }}
                className="flex-1 py-3 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-gym-accent/15"
              >
                Concluir & Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Dumbbell placeholder vector helper
const DumbbellIllustration = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M6.5 6.5h11" />
    <path d="M6.5 17.5h11" />
    <path d="M3 10v4" />
    <path d="M21 10v4" />
    <rect x="6.5" y="4" width="3" height="16" rx="1" />
    <rect x="14.5" y="4" width="3" height="16" rx="1" />
  </svg>
);
