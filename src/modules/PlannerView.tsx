'use client';

import React, { useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { WeeklyWorkoutDay, WorkoutProgram, ProgramDay } from '../types';
import { AlertTriangle, Calendar, Sparkles, Play, RotateCcw, Sliders, Clock, Move, Copy, Wrench, Pencil, ListChecks, X } from 'lucide-react';
import { programDayDisplayLabel } from '../lib/workout-day-naming';
import { estimateWorkoutDuration } from '../lib/workoutDuration';

const hasMissingProgramDayIssue = (day: WeeklyWorkoutDay): boolean =>
  day.planningIssue === 'missing-program-day';

export const PlannerView = () => {
  const {
    user,
    weeklyPlan,
    generateWeeklyPlan,
    replanMissedWorkout,
    startWorkout,
    setWeeklyPlan,
    updateUserProfile,
    programs,
    openWorkoutBuilder,
    assignDayToWeekday,
    chooserDayName,
    setChooserDayName
  } = useGymFlow();

  const [goal, setGoal] = useState<'hypertrophy' | 'slimming' | 'strength' | 'conditioning' | 'athlete'>(
    user?.goal || 'hypertrophy'
  );
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'advanced' | 'athlete'>(
    user?.level || 'intermediate'
  );
  const [gender, setGender] = useState<'male' | 'female' | 'neutral'>(
    user?.gender || 'neutral'
  );
  const [frequency, setFrequency] = useState<number>(user?.frequency || 4);
  const [duration, setDuration] = useState<number>(user?.duration || 60);

  // Swapping and duplicating states
  const [movingFromDay, setMovingFromDay] = useState<string | null>(null);
  const [duplicatingFromDay, setDuplicatingFromDay] = useState<string | null>(null);

  const handleGenerate = () => {
    generateWeeklyPlan(goal, level, gender, frequency);
    updateUserProfile({ goal, level, gender, frequency, duration });
  };

  // GOAL-10.5: alternar para "Treino" não fabrica mais um exerciseCount fictício —
  // fica honestamente vazio (0 exercícios) até o usuário escolher/criar um treino real.
  const handleToggleRest = (dayName: string) => {
    const updated = weeklyPlan.map((day) => {
      if (day.dayName === dayName) {
        const isRest = !day.isRest;
        return {
          ...day,
          isRest,
          workoutName: isRest ? 'Descanso' : 'Sem treino definido',
          exerciseCount: 0,
          duration: 0,
          muscleGroups: [],
          // GOAL-07: alternar treino/descanso desfaz o vínculo com o Day do programa
          programId: undefined,
          programDayId: undefined,
          planningIssue: undefined,
        };
      }
      return day;
    });
    setWeeklyPlan(updated);
    updateUserProfile({ weeklyPlan: updated });
  };

  const handleCreateFromScratch = () => {
    openWorkoutBuilder(undefined, 'planner');
  };

  // GOAL-10.5: "Editar dia" abre o Construtor com os slots reais do Day (quando há
  // um programa vinculado) — nunca mais o modal antigo que fabricava exerciseCount.
  const handleEditDay = (day: WeeklyWorkoutDay) => {
    const sourceProgram = programs.find((p) => p.id === day.programId);
    const sourceDay = sourceProgram?.weeks?.flatMap((week) => week.days).find((d) => d.id === day.programDayId);
    const hasBrokenProgramLink = Boolean(day.programId || day.programDayId) && (!sourceProgram || !sourceDay);

    // Um vínculo removido precisa ser escolhido novamente. Abrir o Construtor sem
    // programa/dia criaria um treino vazio e esconderia a causa real do problema.
    if (hasMissingProgramDayIssue(day) || hasBrokenProgramLink) {
      setChooserDayName(day.dayName);
      return;
    }

    openWorkoutBuilder(
      {
        programId: sourceProgram?.isCustom ? sourceProgram.id : undefined,
        dayId: sourceProgram?.isCustom ? sourceDay?.id : undefined,
        name: day.isRest ? 'Meu Treino' : day.workoutName,
        level: user?.level ?? 'intermediate',
        volumeProfile: sourceDay?.volumeProfile ?? 'standard',
        targetMinutes: day.duration || user?.duration || 60,
        slots: sourceDay?.slots ?? []
      },
      'planner'
    );
  };

  const handleChooseProgramDay = (program: WorkoutProgram, day: ProgramDay) => {
    if (!chooserDayName) return;
    assignDayToWeekday(chooserDayName, program, day);
    setChooserDayName(null);
  };

  const handleStartMove = (dayName: string) => {
    setMovingFromDay(dayName);
    setDuplicatingFromDay(null);
  };

  const handleExecuteMove = (targetDayName: string) => {
    if (!movingFromDay) return;
    const sourceIdx = weeklyPlan.findIndex((d) => d.dayName === movingFromDay);
    const targetIdx = weeklyPlan.findIndex((d) => d.dayName === targetDayName);

    if (sourceIdx !== -1 && targetIdx !== -1) {
      const updated = [...weeklyPlan];
      const tempWorkout = { ...updated[sourceIdx] };

      updated[sourceIdx] = {
        ...updated[targetIdx],
        dayName: updated[sourceIdx].dayName
      };

      updated[targetIdx] = {
        ...tempWorkout,
        dayName: updated[targetIdx].dayName
      };

      setWeeklyPlan(updated);
      updateUserProfile({ weeklyPlan: updated });
    }
    setMovingFromDay(null);
  };

  const handleStartDuplicate = (dayName: string) => {
    setDuplicatingFromDay(dayName);
    setMovingFromDay(null);
  };

  const handleExecuteDuplicate = (targetDayName: string) => {
    if (!duplicatingFromDay) return;
    const sourceDay = weeklyPlan.find((d) => d.dayName === duplicatingFromDay);
    if (sourceDay) {
      const updated = weeklyPlan.map((day) => {
        if (day.dayName === targetDayName) {
          return {
            ...day,
            workoutName: sourceDay.workoutName,
            isRest: sourceDay.isRest,
            duration: sourceDay.duration,
            exerciseCount: sourceDay.exerciseCount,
            muscleGroups: sourceDay.muscleGroups ? [...sourceDay.muscleGroups] : [],
            programId: sourceDay.programId,
            programDayId: sourceDay.programDayId,
            planningIssue: sourceDay.planningIssue,
          };
        }
        return day;
      });
      setWeeklyPlan(updated);
      updateUserProfile({ weeklyPlan: updated });
    }
    setDuplicatingFromDay(null);
  };


  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">Planejador Semanal</h1>
          <p className="text-xs text-gym-text-muted mt-0.5 font-medium">
            Personalize suas divisões de treino, configure descansos e gerencie adiantamentos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCreateFromScratch}
            className="bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold px-4 py-2.5 rounded-xl transition-all text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-gym-accent/15"
          >
            <Wrench className="w-4 h-4" />
            Criar Treino
          </button>
          <button
            onClick={replanMissedWorkout}
            className="bg-gym-card hover:bg-white/5 border border-gym-rose/30 hover:border-gym-rose/50 text-gym-rose font-bold px-4 py-2.5 rounded-xl transition-all text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-gym-rose/5"
          >
            <RotateCcw className="w-4 h-4" />
            Perdi o Treino de Hoje
          </button>
        </div>
      </div>

      {/* SWAP WARNING BANNER */}
      {(movingFromDay || duplicatingFromDay) && (
        <div className="bg-gym-accent/10 border border-gym-accent/30 rounded-2xl p-4 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gym-accent animate-ping"></span>
            <span className="text-xs font-bold text-white">
              {movingFromDay
                ? `Mover o treino de "${movingFromDay}": Escolha outro dia para trocar.`
                : `Copiar o treino de "${duplicatingFromDay}": Escolha o dia para colar.`}
            </span>
          </div>
          <button
            onClick={() => {
              setMovingFromDay(null);
              setDuplicatingFromDay(null);
            }}
            className="min-h-[44px] text-[9px] bg-white/5 hover:bg-white/10 px-3 rounded-lg border border-white/10 font-bold active:scale-95 transition-transform"
          >
            Cancelar Ação
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* COLUNA ESQUERDA: PARÂMETROS DA SEMANA */}
        <div className="lg:col-span-1 glass p-5 rounded-3xl border border-white/5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
            <Sliders className="w-4.5 h-4.5 text-gym-accent" />
            Parâmetros de Divisão
          </h3>

          <div className="space-y-4">
            {/* Gênero / Perfil */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">Perfil de Treino</label>
              <div className="flex bg-gym-dark/50 p-1 rounded-xl border border-white/5 gap-1">
                {[
                  { id: 'male', label: '🚹 Masculino' },
                  { id: 'female', label: '🚺 Feminino' },
                  { id: 'neutral', label: 'Neutral' }
                ].map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setGender(g.id as typeof gender)}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                      gender === g.id
                        ? 'bg-white/10 text-white'
                        : 'text-gym-text-muted hover:text-white'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Objetivo */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">Objetivo</label>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value as typeof goal)}
                className="w-full bg-gym-dark border border-white/10 rounded-xl py-2 px-3 text-xs text-white outline-none focus:border-gym-accent"
              >
                <option value="hypertrophy">Hipertrofia (Massa Magra)</option>
                <option value="slimming">Definição / Emagrecimento</option>
                <option value="strength">Força Máxima (Cargas)</option>
                <option value="conditioning">Condicionamento e GPP</option>
                <option value="athlete">Preparação Física Atleta</option>
              </select>
            </div>

            {/* Nível */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">Nível</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as typeof level)}
                className="w-full bg-gym-dark border border-white/10 rounded-xl py-2 px-3 text-xs text-white outline-none focus:border-gym-accent"
              >
                <option value="beginner">Iniciante</option>
                <option value="intermediate">Intermediário</option>
                <option value="advanced">Avançado</option>
                <option value="athlete">Atleta / Pro</option>
              </select>
            </div>

            {/* Dias de Treino e Duração */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">Frequência</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(Number(e.target.value))}
                  className="w-full bg-gym-dark border border-white/10 rounded-xl py-2 px-3 text-xs text-white outline-none"
                >
                  <option value={2}>2 dias</option>
                  <option value={3}>3 dias</option>
                  <option value={4}>4 dias</option>
                  <option value={5}>5 dias</option>
                  <option value={6}>6 dias</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">Duração</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full bg-gym-dark border border-white/10 rounded-xl py-2 px-3 text-xs text-white outline-none"
                >
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                  <option value={90}>90 min</option>
                  <option value={120}>120 min</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              className="w-full py-3.5 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-gym-accent/15 flex items-center justify-center gap-1.5 cursor-pointer mt-4"
            >
              <Sparkles className="w-4 h-4 fill-gym-dark text-gym-dark" />
              Gerar Semana com IA
            </button>
          </div>
        </div>

        {/* COLUNA DO MEIO/DIREITA: A SEMANA DETALHADA */}
        <div className="lg:col-span-2 space-y-4">
          {weeklyPlan.length === 0 ? (
            <div className="glass p-12 text-center rounded-3xl border border-white/5 space-y-4 flex flex-col items-center">
              <Calendar className="w-16 h-16 text-gym-text-muted opacity-40 animate-pulse" />
              <h3 className="text-base font-bold text-white">Nenhuma planilha semanal ativa</h3>
              <p className="text-xs text-gym-text-muted max-w-sm">
                Ajuste seu perfil e metas nos parâmetros e gere sua divisão de treinos personalizada em um toque.
              </p>
              <button
                onClick={handleGenerate}
                className="min-h-[44px] px-6 bg-gym-accent hover:bg-gym-accent-hover active:scale-[0.98] text-gym-dark font-extrabold rounded-2xl text-xs uppercase tracking-wider transition-all shadow-md shadow-gym-accent/15 flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4 fill-gym-dark text-gym-dark" />
                Gerar Semana com IA
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {weeklyPlan.map((day) => {
                const isTargetForSwap = movingFromDay && movingFromDay !== day.dayName;
                const isTargetForCopy = duplicatingFromDay && duplicatingFromDay !== day.dayName;
                const hasMissingProgramDay = hasMissingProgramDayIssue(day);

                return (
                  <div
                    key={day.dayName}
                    className={`p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between border transition-all gap-3 ${
                      day.trained
                        ? 'bg-gym-emerald/5 border-gym-emerald/20 text-gym-emerald'
                        : day.isRest
                        ? 'bg-white/5 border-transparent text-gym-text-muted'
                        : hasMissingProgramDay
                        ? 'bg-gym-amber/5 border-gym-amber/30 text-white'
                        : 'bg-gym-card border-white/5 text-white hover:border-gym-accent/20'
                    }`}
                  >
                    {/* DIA E NOME DO TREINO */}
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-black w-14 text-gym-text-muted capitalize">{day.dayName}</span>
                      <div>
                        <h4 className="text-xs font-bold">{day.workoutName}</h4>
                        {!day.isRest && day.muscleGroups && (
                          <div className="flex gap-1.5 mt-1">
                            {day.muscleGroups.map((mg) => (
                              <span key={mg} className="text-[8px] bg-white/5 px-2 py-0.5 rounded uppercase font-bold text-gym-text-muted">
                                {mg}
                              </span>
                            ))}
                          </div>
                        )}
                        {hasMissingProgramDay && (
                          <div className="mt-2 flex max-w-md items-start gap-1.5 rounded-lg border border-gym-amber/25 bg-gym-amber/10 px-2.5 py-2 text-[10px] font-semibold leading-relaxed text-gym-amber">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                            <span>
                              O dia usado neste planejamento foi removido do programa. Escolha novamente um treino.
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ACTIONS ROW */}
                    <div className="flex items-center justify-end gap-2 flex-wrap sm:flex-nowrap">
                      {!day.isRest && (
                        <div className="hidden md:flex items-center gap-2 text-[10px] text-gym-text-muted mr-2">
                          <span className="flex items-center gap-0.5">
                            <ListChecks className="w-3.5 h-3.5" /> {day.exerciseCount}{' '}
                            {day.exerciseCount === 1 ? 'exercício' : 'exercícios'}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-3.5 h-3.5" /> {day.duration}m
                          </span>
                        </div>
                      )}

                      {/* Swap Day Execute */}
                      {isTargetForSwap && (
                        <button
                          onClick={() => handleExecuteMove(day.dayName)}
                          className="min-h-[44px] text-[9px] bg-gym-accent text-gym-dark font-extrabold px-3 rounded-lg animate-pulse uppercase tracking-wider active:scale-95 transition-transform"
                        >
                          Trocar Aqui
                        </button>
                      )}

                      {/* Copy Day Execute */}
                      {isTargetForCopy && (
                        <button
                          onClick={() => handleExecuteDuplicate(day.dayName)}
                          className="min-h-[44px] text-[9px] bg-gym-accent text-gym-dark font-extrabold px-3 rounded-lg animate-pulse uppercase tracking-wider active:scale-95 transition-transform"
                        >
                          Colar Aqui
                        </button>
                      )}

                      {/* Default operations if no active action */}
                      {!movingFromDay && !duplicatingFromDay && (
                        <>
                          {/* Swap trigger */}
                          <button
                            onClick={() => handleStartMove(day.dayName)}
                            className="tap-target flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 text-gym-text-muted hover:text-white active:scale-95 transition-all"
                            title="Mover/Trocar Dia"
                            aria-label="Mover ou trocar dia"
                          >
                            <Move className="w-3.5 h-3.5" />
                          </button>

                          {/* Copy trigger */}
                          <button
                            onClick={() => handleStartDuplicate(day.dayName)}
                            className="tap-target flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 text-gym-text-muted hover:text-white active:scale-95 transition-all"
                            title="Duplicar Treino"
                            aria-label="Duplicar treino"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {/* Toggle rest status */}
                          <button
                            onClick={() => handleToggleRest(day.dayName)}
                            className={`min-h-[44px] text-[9px] font-bold px-2.5 rounded-lg transition-all border ${
                              day.isRest
                                ? 'bg-gym-accent/15 border-gym-accent/20 text-gym-accent font-black'
                                : 'bg-white/5 border-white/15 text-gym-text-muted hover:text-white'
                            }`}
                          >
                            {day.isRest ? 'Descanso' : 'Treino'}
                          </button>

                          {!day.isRest && (
                            <>
                              {/* Escolher um treino real (sugerido ou custom) para este dia */}
                              <button
                                onClick={() => setChooserDayName(day.dayName)}
                                className="min-h-[44px] text-[9px] font-bold px-2.5 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-white flex items-center gap-1 active:scale-95 transition-all"
                                title="Escolher treino"
                              >
                                <ListChecks className="w-3 h-3 text-gym-accent" />
                                {hasMissingProgramDay ? 'Escolher novamente' : 'Escolher'}
                              </button>

                              {/* Editar dia no Construtor — sempre com os slots reais, nunca fabricados */}
                              {!hasMissingProgramDay && (
                                <button
                                  onClick={() => handleEditDay(day)}
                                  className="min-h-[44px] text-[9px] font-bold px-2.5 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-white flex items-center gap-1 active:scale-95 transition-all"
                                  title="Editar dia"
                                >
                                  <Pencil className="w-3 h-3 text-gym-accent" />
                                  Editar
                                </button>
                              )}
                            </>
                          )}

                          {/* Launch active — só quando o dia tem exercícios reais de verdade */}
                          {!day.isRest && !day.trained && !hasMissingProgramDay && day.exerciseCount > 0 && (
                            <button
                              onClick={() => startWorkout(day.programId, day.workoutName, day.programDayId)}
                              className="tap-target bg-gym-accent hover:bg-gym-accent-hover text-gym-dark rounded-lg transition-all flex items-center justify-center active:scale-95 shadow-md shadow-gym-accent/15"
                              title="Iniciar Treino"
                              aria-label="Iniciar treino"
                            >
                              <Play className="w-3.5 h-3.5 fill-gym-dark" />
                            </button>
                          )}

                          {!day.isRest && !day.trained && !hasMissingProgramDay && day.exerciseCount === 0 && (
                            <span className="text-[9px] font-bold text-gym-text-muted bg-white/5 px-2 py-1 rounded-full">
                              Sem treino
                            </span>
                          )}

                          {day.trained && (
                            <span className="text-[10px] font-bold text-gym-emerald bg-gym-emerald/15 px-2 py-0.5 rounded-full">
                              Concluído
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ESCOLHER TREINO MODAL — lista os Days reais (sugeridos + Meus Treinos) para
          atribuir a este dia via assignDayToWeekday; nunca fabrica exerciseCount. */}
      {chooserDayName && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setChooserDayName(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-gym-dark border border-white/10 rounded-3xl w-full max-w-lg p-6 space-y-4 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gym-accent uppercase tracking-wider">
                Escolher treino para {chooserDayName}
              </h3>
              <button
                onClick={() => setChooserDayName(null)}
                className="p-2 text-gym-text-muted hover:text-white bg-white/5 rounded-lg tap-target"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {programs.filter((p) => (p.weeks?.[0]?.days?.length ?? 0) > 0).length === 0 ? (
              <p className="text-xs text-gym-text-muted text-center py-8">
                Nenhum programa com dias estruturados disponível ainda.
              </p>
            ) : (
              <div className="space-y-4">
                {programs
                  .filter((p) => (p.weeks?.[0]?.days?.length ?? 0) > 0)
                  .map((program) => (
                    <div key={program.id} className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-gym-text-muted flex items-center gap-1.5">
                        {program.name}
                        {program.isCustom && (
                          <span className="text-[8px] bg-gym-accent/15 text-gym-accent px-1.5 py-0.5 rounded-full">Meu treino</span>
                        )}
                      </span>
                      {(program.weeks[0]?.days || []).map((day) => {
                        const estimate = estimateWorkoutDuration(day.slots);
                        return (
                          <button
                            key={day.id}
                            onClick={() => handleChooseProgramDay(program, day)}
                            className="w-full text-left bg-white/5 hover:bg-gym-accent/10 border border-white/5 hover:border-gym-accent/30 rounded-xl p-3 flex items-center justify-between gap-3 transition-all min-h-[44px]"
                          >
                            <span className="text-xs font-bold text-white">{programDayDisplayLabel(day)}</span>
                            <span className="flex-shrink-0 text-right text-[10px] text-gym-text-muted">
                              {estimate.exerciseCount} {estimate.exerciseCount === 1 ? 'exercício' : 'exercícios'} · ~{estimate.minutes} min
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
