'use client';

import React, { useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { WeeklyWorkoutDay } from '../types';
import { Calendar, Sparkles, Play, RotateCcw, Sliders, Clock, Dumbbell, ArrowRight, Move, Copy, Trash, CheckSquare, Square } from 'lucide-react';

export const PlannerView = () => {
  const {
    user,
    weeklyPlan,
    generateWeeklyPlan,
    replanMissedWorkout,
    startWorkout,
    setWeeklyPlan,
    updateUserProfile
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

  // Modal to edit specific day
  const [editingDay, setEditingDay] = useState<WeeklyWorkoutDay | null>(null);
  const [editWorkoutName, setEditWorkoutName] = useState('');
  const [editDuration, setEditDuration] = useState(60);
  const [editMuscleGroups, setEditMuscleGroups] = useState<string[]>([]);
  const [editIsRest, setEditIsRest] = useState(false);

  const handleGenerate = () => {
    generateWeeklyPlan(goal, level, gender, frequency, duration);
    updateUserProfile({ goal, level, gender, frequency, duration });
  };

  const handleToggleRest = (dayName: string) => {
    const updated = weeklyPlan.map((day) => {
      if (day.dayName === dayName) {
        const isRest = !day.isRest;
        return {
          ...day,
          isRest,
          workoutName: isRest ? 'Descanso' : 'Treino Personalizado',
          exerciseCount: isRest ? 0 : 4,
          duration: isRest ? 0 : duration,
          muscleGroups: isRest ? [] : ['legs', 'chest']
        };
      }
      return day;
    });
    setWeeklyPlan(updated);
    updateUserProfile({ weeklyPlan: updated });
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
            programId: sourceDay.programId
          };
        }
        return day;
      });
      setWeeklyPlan(updated);
      updateUserProfile({ weeklyPlan: updated });
    }
    setDuplicatingFromDay(null);
  };

  const handleEditDayOpen = (day: WeeklyWorkoutDay) => {
    setEditingDay(day);
    setEditWorkoutName(day.workoutName === 'Descanso' ? 'Novo Treino' : day.workoutName);
    setEditDuration(day.duration || 60);
    setEditMuscleGroups(day.muscleGroups || []);
    setEditIsRest(day.isRest);
  };

  const handleEditDaySave = () => {
    if (!editingDay) return;
    const updated = weeklyPlan.map((day) => {
      if (day.dayName === editingDay.dayName) {
        const isRest = editIsRest || editWorkoutName.toLowerCase() === 'descanso' || editWorkoutName.trim() === '';
        return {
          ...day,
          workoutName: isRest ? 'Descanso' : editWorkoutName,
          duration: isRest ? 0 : editDuration,
          isRest,
          muscleGroups: isRest ? [] : editMuscleGroups,
          exerciseCount: isRest ? 0 : (editMuscleGroups.length > 0 ? editMuscleGroups.length * 2 : 4)
        };
      }
      return day;
    });
    setWeeklyPlan(updated);
    updateUserProfile({ weeklyPlan: updated });
    setEditingDay(null);
  };

  const handleToggleMuscleGroup = (mg: string) => {
    setEditMuscleGroups((prev) =>
      prev.includes(mg) ? prev.filter((item) => item !== mg) : [...prev, mg]
    );
  };

  const templates = [
    { name: 'Push Day (Peito/Ombro/Tríceps)', duration: 60, muscles: ['chest', 'shoulders', 'triceps'] },
    { name: 'Pull Day (Costas/Bíceps)', duration: 60, muscles: ['back', 'biceps'] },
    { name: 'Leg Day (Membros Inferiores)', duration: 65, muscles: ['legs', 'calves'] },
    { name: 'Glúteos e Pernas (Feminino Pro)', duration: 70, muscles: ['legs', 'glutes'] },
    { name: 'Superior Completo (Upper Body)', duration: 55, muscles: ['chest', 'back', 'shoulders'] },
    { name: 'Cardio HIIT e Abdômen', duration: 40, muscles: ['cardio', 'abs'] }
  ];

  const availableMuscleGroups = [
    { id: 'chest', label: 'Peito' },
    { id: 'back', label: 'Costas' },
    { id: 'shoulders', label: 'Ombros' },
    { id: 'biceps', label: 'Bíceps' },
    { id: 'triceps', label: 'Tríceps' },
    { id: 'legs', label: 'Pernas' },
    { id: 'glutes', label: 'Glúteos' },
    { id: 'abs', label: 'Abdômen' },
    { id: 'cardio', label: 'Cardio' },
    { id: 'mobility', label: 'Mobilidade' }
  ];

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

        <button
          onClick={replanMissedWorkout}
          className="bg-gym-card hover:bg-white/5 border border-gym-rose/30 hover:border-gym-rose/50 text-gym-rose font-bold px-4 py-2.5 rounded-xl transition-all text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-gym-rose/5"
        >
          <RotateCcw className="w-4 h-4" />
          Perdi o Treino de Hoje
        </button>
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
            className="text-[9px] bg-white/5 hover:bg-white/10 px-2 py-1 rounded border border-white/10 font-bold"
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
                    onClick={() => setGender(g.id as any)}
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
                onChange={(e) => setGoal(e.target.value as any)}
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
                onChange={(e) => setLevel(e.target.value as any)}
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
                Selecione seu perfil e metas nos parâmetros ao lado e clique em **Gerar Semana com IA** para montar sua divisão de treinos personalizada.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {weeklyPlan.map((day) => {
                const isTargetForSwap = movingFromDay && movingFromDay !== day.dayName;
                const isTargetForCopy = duplicatingFromDay && duplicatingFromDay !== day.dayName;

                return (
                  <div
                    key={day.dayName}
                    className={`p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between border transition-all gap-3 ${
                      day.trained
                        ? 'bg-gym-emerald/5 border-gym-emerald/20 text-gym-emerald'
                        : day.isRest
                        ? 'bg-white/5 border-transparent text-gym-text-muted'
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
                      </div>
                    </div>

                    {/* ACTIONS ROW */}
                    <div className="flex items-center justify-end gap-2 flex-wrap sm:flex-nowrap">
                      {!day.isRest && (
                        <div className="hidden md:flex items-center gap-2 text-[10px] text-gym-text-muted mr-2">
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-3.5 h-3.5" /> {day.duration}m
                          </span>
                        </div>
                      )}

                      {/* Swap Day Execute */}
                      {isTargetForSwap && (
                        <button
                          onClick={() => handleExecuteMove(day.dayName)}
                          className="text-[9px] bg-gym-accent text-gym-dark font-extrabold px-3 py-1.5 rounded-lg animate-pulse uppercase tracking-wider"
                        >
                          Trocar Aqui
                        </button>
                      )}

                      {/* Copy Day Execute */}
                      {isTargetForCopy && (
                        <button
                          onClick={() => handleExecuteDuplicate(day.dayName)}
                          className="text-[9px] bg-gym-accent text-gym-dark font-extrabold px-3 py-1.5 rounded-lg animate-pulse uppercase tracking-wider"
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
                            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 text-gym-text-muted hover:text-white"
                            title="Mover/Trocar Dia"
                          >
                            <Move className="w-3 h-3" />
                          </button>

                          {/* Copy trigger */}
                          <button
                            onClick={() => handleStartDuplicate(day.dayName)}
                            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 text-gym-text-muted hover:text-white"
                            title="Duplicar Treino"
                          >
                            <Copy className="w-3 h-3" />
                          </button>

                          {/* Toggle rest status */}
                          <button
                            onClick={() => handleToggleRest(day.dayName)}
                            className={`text-[9px] font-bold px-2 py-1 rounded transition-all border ${
                              day.isRest
                                ? 'bg-gym-accent/15 border-gym-accent/20 text-gym-accent font-black'
                                : 'bg-white/5 border-white/15 text-gym-text-muted hover:text-white'
                            }`}
                          >
                            {day.isRest ? 'Descanso' : 'Treino'}
                          </button>

                          {/* Edit content */}
                          <button
                            onClick={() => handleEditDayOpen(day)}
                            className="text-[9px] font-bold px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-white"
                          >
                            Editar
                          </button>

                          {/* Launch active */}
                          {!day.isRest && !day.trained && (
                            <button
                              onClick={() => startWorkout(day.programId, day.workoutName)}
                              className="p-1.5 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark rounded-lg transition-all flex items-center justify-center"
                              title="Iniciar Treino"
                            >
                              <Play className="w-3 h-3 fill-gym-dark" />
                            </button>
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

      {/* EDIT MODAL */}
      {editingDay && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setEditingDay(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-gym-dark border border-white/10 rounded-3xl w-full max-w-md p-6 space-y-6 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-sm font-bold text-gym-accent uppercase tracking-wider">Configurar {editingDay.dayName}</h3>

            <div className="space-y-4">
              {/* Type toggle inside modal */}
              <div className="flex bg-gym-dark/50 p-1 rounded-xl border border-white/5 gap-1 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setEditIsRest(false)}
                  className={`flex-1 py-1.5 rounded transition-all ${
                    !editIsRest ? 'bg-gym-accent text-gym-dark font-black' : 'text-gym-text-muted hover:text-white'
                  }`}
                >
                  Dia de Treino
                </button>
                <button
                  type="button"
                  onClick={() => setEditIsRest(true)}
                  className={`flex-1 py-1.5 rounded transition-all ${
                    editIsRest ? 'bg-gym-accent text-gym-dark font-black' : 'text-gym-text-muted hover:text-white'
                  }`}
                >
                  Dia de Descanso
                </button>
              </div>

              {!editIsRest && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1">Nome da Sessão</label>
                    <input
                      type="text"
                      value={editWorkoutName}
                      onChange={(e) => setEditWorkoutName(e.target.value)}
                      className="w-full bg-gym-dark border border-white/10 rounded-xl py-2 px-3 text-xs text-white outline-none focus:border-gym-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1">Duração (minutos)</label>
                    <input
                      type="number"
                      value={editDuration}
                      onChange={(e) => setEditDuration(Number(e.target.value))}
                      className="w-full bg-gym-dark border border-white/10 rounded-xl py-2 px-3 text-xs text-white outline-none focus:border-gym-accent"
                    />
                  </div>

                  {/* Muscle Groups Checkboxes */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold uppercase text-gym-text-muted">Músculos Alvo</label>
                    <div className="grid grid-cols-2 gap-2 max-h-[110px] overflow-y-auto pr-1">
                      {availableMuscleGroups.map((mg) => {
                        const checked = editMuscleGroups.includes(mg.id);
                        return (
                          <button
                            key={mg.id}
                            type="button"
                            onClick={() => handleToggleMuscleGroup(mg.id)}
                            className={`p-2 border text-left rounded-xl text-[10px] font-bold transition-all flex items-center justify-between ${
                              checked 
                                ? 'bg-gym-accent/10 border-gym-accent text-gym-accent' 
                                : 'bg-white/5 border-white/5 text-gym-text-muted hover:text-white'
                            }`}
                          >
                            <span>{mg.label}</span>
                            {checked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* TEMPLATES LIST */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold uppercase text-gym-text-muted">Copiar Modelo da IA</label>
                    <div className="grid grid-cols-2 gap-1.5 max-h-[90px] overflow-y-auto pr-1">
                      {templates.map((temp) => (
                        <button
                          key={temp.name}
                          type="button"
                          onClick={() => {
                            setEditWorkoutName(temp.name);
                            setEditDuration(temp.duration);
                            setEditMuscleGroups(temp.muscles);
                          }}
                          className="p-2 text-left bg-white/5 hover:bg-gym-accent/15 border border-white/5 rounded-xl text-[10px] text-white hover:text-gym-accent transition-all font-semibold"
                        >
                          {temp.name.split(' (')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {editIsRest && (
                <div className="py-6 text-center text-xs text-gym-text-muted">
                  Este dia será considerado Descanso no cronograma semanal.
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setEditingDay(null)}
                className="flex-1 py-2.5 bg-white/5 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={handleEditDaySave}
                className="flex-1 py-2.5 bg-gym-accent text-gym-dark font-extrabold rounded-xl text-xs"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
