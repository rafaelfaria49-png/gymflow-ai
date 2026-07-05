'use client';

import React, { useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { ExerciseMedia } from '../components/ExerciseMedia';
import { Play, Check, RefreshCw, Sparkles, Clock, Share2, Award, Zap, ChevronRight, Flag, X } from 'lucide-react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export const ActiveWorkoutPage = () => {
  const {
    activeWorkout,
    workoutDuration,
    updateWorkoutSet,
    updateExerciseNotes,
    completeWorkoutSet,
    swapExerciseInActiveWorkout,
    finishWorkout,
    cancelWorkout,
    exercises,
    adaptActiveWorkoutForCrowdedGym,
    openGlobalPlayer,
    // Timer de descanso (GOAL-06) — estado vive no GymFlowContext para sobreviver a
    // refresh e continuar contando mesmo se o usuário sair desta tela.
    restSecondsRemaining,
    restTimerTotalSeconds,
    restTimerLabel,
    extendRestTimer,
    skipRestTimer,
    setActiveView
  } = useGymFlow();

  const [rpe, setRpe] = useState(7);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

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

  // Calcular estatísticas para o modal de resumo e painel ativo
  const totalVolume = activeWorkout.exercises.reduce((acc, ex) => {
    return acc + ex.sets.filter(s => s.completed).reduce((sAcc, s) => sAcc + (s.reps * s.weight), 0);
  }, 0);

  const completedSetsCount = activeWorkout.exercises.reduce((acc, ex) => {
    return acc + ex.sets.filter((s) => s.completed).length;
  }, 0);

  const totalSetsCount = activeWorkout.exercises.reduce((acc, ex) => {
    return acc + ex.sets.length;
  }, 0);

  // Estimativa honesta: kcal calculado por série concluída (nunca por tempo decorrido),
  // para não mostrar gasto calórico com 0 séries feitas. Ver docs/DECISOES.md.
  const estimatedCalories = activeWorkout.exercises.reduce((acc, ex) => {
    const completedSets = ex.sets.filter((s) => s.completed).length;
    if (completedSets === 0) return acc;
    const meta = exercises.find((e) => e.id === ex.exerciseId);
    const muscleGroup = meta?.muscleGroup || ex.muscleGroup;
    const isCompound = !!meta?.secondaryMuscles && meta.secondaryMuscles.length > 0;
    const kcalPerSet = muscleGroup === 'cardio' ? 5 : isCompound ? 9 : 6;
    return acc + completedSets * kcalPerSet;
  }, 0);
  const xpEarned = completedSetsCount * 10;

  const nextExercise = activeWorkout.exercises.find((ex) => {
    return !ex.sets.every(s => s.completed);
  }) || null;
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
      const bestSet = ex.sets.filter(s => s.completed).reduce((best, s) => s.weight > best ? s.weight : best, 0);
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
    setShowSwapModal(true);
  };

  const handleSwap = (newExId: string) => {
    if (swapIndex !== null) {
      swapExerciseInActiveWorkout(swapIndex, newExId);
      setShowSwapModal(false);
      setSwapIndex(null);
    }
  };

  const handleAddSet = (exIndex: number) => {
    const updatedExercises = [...activeWorkout.exercises];
    const targetEx = updatedExercises[exIndex];
    const newSetIndex = targetEx.sets.length;
    const lastSet = targetEx.sets[targetEx.sets.length - 1];

    const newSet = {
      id: `set_${exIndex}_${newSetIndex}_${Date.now()}`,
      reps: lastSet ? lastSet.reps : 10,
      weight: lastSet ? lastSet.weight : 10,
      completed: false
    };

    // Usando a estrutura direta no state
    targetEx.sets.push(newSet);
    updateWorkoutSet(exIndex, newSetIndex, newSet);
  };

  const handleRemoveSet = (exIndex: number) => {
    const targetEx = activeWorkout.exercises[exIndex];
    if (targetEx.sets.length <= 1) return;
    targetEx.sets.pop();
    updateWorkoutSet(exIndex, 0, {}); // Trigger force re-render
  };

  // Filtrar substitutos recomendados baseado no mesmo grupo muscular
  const getSubstitutes = (exIndex: number) => {
    const currentExGroup = activeWorkout.exercises[exIndex]?.muscleGroup;
    return exercises.filter((e) => e.muscleGroup === currentExGroup && e.id !== activeWorkout.exercises[exIndex]?.exerciseId);
  };

  // ActionBar fixa (GOAL-04): estado da próxima série pendente.
  const allSetsCompleted = totalSetsCount > 0 && completedSetsCount === totalSetsCount;
  const currentSetNumber = Math.min(completedSetsCount + 1, totalSetsCount || 1);

  const handleContinue = () => {
    for (const ex of activeWorkout.exercises) {
      const incompleteSet = ex.sets.find((s) => !s.completed);
      if (incompleteSet) {
        const row = document.getElementById(`set-row-${incompleteSet.id}`);
        row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const weightInput = row?.querySelector('input[type="number"]') as HTMLInputElement | null;
        weightInput?.focus();
        return;
      }
    }
    setShowFinishModal(true);
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

          {/* Academia Lotada button */}
          <button
            onClick={() => adaptActiveWorkoutForCrowdedGym()}
            className="bg-white/5 hover:bg-gym-accent/15 border border-white/10 hover:border-gym-accent/30 text-white hover:text-gym-accent font-bold px-3 py-2 rounded-xl transition-all text-xs flex items-center gap-1.5"
            title="Adaptar aparelhos para pesos livres devido à lotação"
          >
            <Sparkles className="w-3.5 h-3.5 text-gym-accent animate-pulse" />
            <span className="hidden sm:inline">Academia Lotada</span>
          </button>

          <button
            onClick={() => setShowFinishModal(true)}
            className="bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black px-4 py-2 rounded-xl transition-all shadow-md shadow-gym-accent/15 text-xs uppercase tracking-wider"
          >
            Finalizar
          </button>
        </div>
      </div>

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
        {activeWorkout.exercises.map((ex, exIdx) => (
          <div key={ex.id} className="glass p-5 rounded-3xl border border-white/5 space-y-4">
            {/* TÍTULO DO EXERCÍCIO */}
            <div className="flex justify-between items-start border-b border-white/5 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="text-gym-accent">#{exIdx + 1}</span>
                  {ex.name}
                </h3>
                <span className="text-[10px] text-gym-text-muted capitalize">
                  {/* GOAL-07: meta real do ExerciseSlot quando o treino vem de um Day de programa */}
                  {ex.repRange
                    ? `${ex.muscleGroup} • Meta: ${ex.repRange[0] === ex.repRange[1] ? ex.repRange[0] : `${ex.repRange[0]}-${ex.repRange[1]}`} reps • RPE ${ex.targetRPE ?? 8}${ex.restSec ? ` • Descanso ${ex.restSec}s` : ''}`
                    : ex.muscleGroup}
                </span>
                {/* GOAL-08: motivo honesto do motor determinístico de progressão */}
                {ex.progressionNote && (
                  <span className="block text-[9px] text-gym-accent/80 normal-case mt-0.5 leading-snug">
                    Progressão recomendada: {ex.progressionNote}
                  </span>
                )}
              </div>

              {/* Ações */}
              <div className="flex gap-2">
                <button
                  onClick={() => openSwapModal(exIdx)}
                  className="min-h-[44px] text-[10px] bg-white/5 hover:bg-white/10 border border-white/5 text-gym-text-muted hover:text-white px-3 rounded-lg flex items-center gap-1 transition-all active:scale-95"
                  title="Trocar Exercício"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-gym-accent" />
                  Trocar
                </button>
              </div>
            </div>

            {/* DEMONSTRAÇÃO DO EXERCÍCIO — fotos reais (GOAL-09) com crossfade; fallback honesto
                (avatar Kai/Motion Engine seguem em produção — selo "Demonstração 3D em breve"). */}
            {/* Layout em coluna: mídia em cima, botão "Ver Técnica" embaixo, sem overlap (GOAL-04). */}
            <div className="w-full rounded-2xl overflow-hidden border border-white/5 flex flex-col">
              {/* GOAL-11: 16:9 + cover — as fotos 3:2 preenchem o quadro sem as faixas
                  laterais/brancas do antigo 21:9 com contain (corte vertical leve e seguro). */}
              <div className="aspect-video w-full relative">
                <ExerciseMedia
                  images={exercises.find((e) => e.id === ex.exerciseId)?.images}
                  name={ex.name}
                  crossfade
                  showBadge
                  compact
                  fit="cover"
                />
              </div>
              <button
                onClick={() => {
                  const map: {[key: string]: string} = {
                    'chest_supino_reto': 'vid_supino_1',
                    'legs_agachamento_barra': 'vid_agachamento_1',
                    'back_remada_curvada': 'vid_remada_1',
                    'legs_levantamento_terra': 'vid_terra_1',
                    'glutes_elevacao_pelvica': 'extra_vid_technique_2',
                    'legs_legpress_45': 'extra_vid_machines_1',
                    'legs_stiff': 'vid_terra_2'
                  };
                  const videoId = map[ex.exerciseId] || 'vid_supino_1';
                  openGlobalPlayer(videoId);
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

              {/* Rows */}
              {ex.sets.map((set, setIdx) => (
                <div
                  key={set.id}
                  id={`set-row-${set.id}`}
                  className={`grid grid-cols-12 items-center text-center p-1 rounded-xl transition-all border gap-1 relative ${
                    set.completed
                      ? 'bg-gym-accent/5 border-gym-accent/20'
                      : 'bg-white/5 border-transparent'
                  }`}
                >
                  <span className="col-span-2 text-xs text-white font-bold text-left pl-2 flex flex-col justify-center">
                    <span>{setIdx + 1}</span>
                    {set.isWarmup && (
                      <span className="text-[7px] text-gym-amber uppercase font-extrabold tracking-widest -mt-0.5">Aqc</span>
                    )}
                  </span>

                  {/* Anterior (última sessão real) / Sugerido (motor de progressão) — GOAL-08 */}
                  <div className="col-span-2 flex flex-col justify-center text-[9px] text-gym-text-muted leading-tight font-mono">
                    <span>{set.lastWeight ? `${set.lastWeight} kg` : '—'}</span>
                    <span className="text-gym-accent/80 font-bold">{set.suggestedWeight ? `${set.suggestedWeight} kg` : '—'}</span>
                  </div>

                  {/* Carga */}
                  <div className="col-span-3 px-0.5">
                    <input
                      type="number"
                      value={set.weight}
                      disabled={set.completed}
                      aria-label={`Carga da série ${setIdx + 1} (kg)`}
                      onChange={(e) => updateWorkoutSet(exIdx, setIdx, { weight: Number(e.target.value) })}
                      className="w-full min-h-[44px] bg-gym-dark/60 border border-white/10 text-white rounded-lg text-center text-xs font-mono focus:border-gym-accent outline-none"
                    />
                  </div>

                  {/* Reps */}
                  <div className="col-span-2 px-0.5">
                    <input
                      type="number"
                      value={set.reps}
                      disabled={set.completed}
                      aria-label={`Repetições da série ${setIdx + 1}`}
                      onChange={(e) => updateWorkoutSet(exIdx, setIdx, { reps: Number(e.target.value) })}
                      className="w-full min-h-[44px] bg-gym-dark/60 border border-white/10 text-white rounded-lg text-center text-xs font-mono focus:border-gym-accent outline-none"
                    />
                  </div>

                  {/* RPE */}
                  <div className="col-span-2 px-0.5">
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={set.rpe || ''}
                      placeholder="8"
                      disabled={set.completed}
                      aria-label={`RPE da série ${setIdx + 1}`}
                      onChange={(e) => updateWorkoutSet(exIdx, setIdx, { rpe: Number(e.target.value) })}
                      className="w-full min-h-[44px] bg-gym-dark/60 border border-white/10 text-white rounded-lg text-center text-xs font-mono focus:border-gym-accent outline-none"
                    />
                  </div>

                  {/* Checkbox — área clicável de 44px (margem negativa não desloca o
                      layout), visual de 24px (GOAL-11) */}
                  <div className="col-span-1 flex justify-center">
                    <button
                      onClick={() => completeWorkoutSet(exIdx, setIdx)}
                      aria-label={set.completed ? `Desmarcar série ${setIdx + 1}` : `Concluir série ${setIdx + 1}`}
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
                </div>
              ))}
            </div>

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
                onClick={() => handleRemoveSet(exIdx)}
                className="min-h-[44px] text-[10px] text-gym-rose hover:bg-gym-rose/10 px-3 rounded-lg border border-transparent hover:border-gym-rose/20 transition-all font-semibold active:scale-95"
              >
                - Remover Série
              </button>
              <button
                onClick={() => handleAddSet(exIdx)}
                className="min-h-[44px] text-[10px] text-gym-accent hover:bg-gym-accent/10 px-3 rounded-lg border border-transparent hover:border-gym-accent/20 transition-all font-semibold active:scale-95"
              >
                + Adicionar Série
              </button>
            </div>
          </div>
        ))}
      </div>

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
                onClick={allSetsCompleted ? () => setShowFinishModal(true) : handleContinue}
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

      {/* MODAL DE TROCA DE EXERCÍCIO */}
      {showSwapModal && swapIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gym-dark border border-white/10 rounded-3xl w-full max-w-md p-6 relative max-h-[80vh] overflow-y-auto">
            <button
              onClick={() => setShowSwapModal(false)}
              className="absolute top-4 right-4 text-gym-text-muted hover:text-white rounded-lg bg-white/5 tap-target flex items-center justify-center"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-bold text-gym-accent uppercase tracking-wider mb-2">Substitutos IA Coach</h3>
            <h2 className="text-base font-bold text-white mb-4">
              Substituir "{activeWorkout.exercises[swapIndex]?.name}"
            </h2>

            <div className="space-y-2">
              {getSubstitutes(swapIndex).length === 0 ? (
                <p className="text-xs text-gym-text-muted text-center py-4">Nenhum exercício similar encontrado.</p>
              ) : (
                getSubstitutes(swapIndex).map((subEx) => (
                  <button
                    key={subEx.id}
                    onClick={() => handleSwap(subEx.id)}
                    className="w-full text-left bg-gym-card/50 border border-white/5 hover:border-gym-accent/30 p-3 rounded-2xl flex items-center justify-between transition-all"
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

      {/* MODAL DE RESUMO / PERCEPÇÃO DE ESFORÇO */}
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
                onClick={() => finishWorkout(rpe)}
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
