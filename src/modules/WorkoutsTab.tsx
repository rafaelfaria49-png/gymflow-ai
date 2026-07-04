'use client';

import React, { useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { WorkoutProgram, Exercise, ProgramDay } from '../types';
import { Play, Calendar, Target, Clock, Dumbbell, Award, ChevronRight, X, Sparkles, Plus, Wrench, Pencil } from 'lucide-react';
import { estimateWorkoutDuration } from '../lib/workoutDuration';

export const WorkoutsTab = () => {
  const {
    programs,
    exercises,
    startWorkout,
    applyProgramToWeek,
    user,
    openWorkoutBuilder,
    workoutsTab,
    setWorkoutsTab,
    lastSavedProgramId
  } = useGymFlow();
  const [selectedLevel, setSelectedLevel] = useState<'beginner' | 'intermediate' | 'advanced' | 'athlete'>(
    user?.level || 'intermediate'
  );
  const [selectedProgram, setSelectedProgram] = useState<WorkoutProgram | null>(null);

  const suggestedPrograms = programs.filter((p) => !p.isCustom);
  // GOAL-10.6: o treino recém-salvo aparece primeiro em "Meus Treinos" (Tarefa 3).
  const myPrograms = programs
    .filter((p) => p.isCustom)
    .sort((a, b) => {
      if (a.id === lastSavedProgramId) return -1;
      if (b.id === lastSavedProgramId) return 1;
      return 0;
    });
  const filteredPrograms = workoutsTab === 'suggested' ? suggestedPrograms.filter((p) => p.level === selectedLevel) : myPrograms;

  const handleStartProgram = (p: WorkoutProgram) => {
    // Sem customName: o nome vem do Day real (ex.: "ABC Hipertrofia — Dia A — Peito Foco")
    startWorkout(p.id);
    setSelectedProgram(null);
  };

  const handleCreateWorkout = () => {
    openWorkoutBuilder(undefined, 'workouts');
  };

  const handleEditProgramDay = (program: WorkoutProgram, day: ProgramDay) => {
    openWorkoutBuilder(
      {
        programId: program.id,
        dayId: day.id,
        name: day.name,
        level: program.level,
        volumeProfile: day.volumeProfile ?? 'standard',
        targetMinutes: estimateWorkoutDuration(day.slots).minutes,
        slots: day.slots
      },
      'workouts'
    );
    setSelectedProgram(null);
  };

  const getExerciseDetails = (exId: string): Exercise | undefined => {
    return exercises.find((e) => e.id === exId);
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">Programas de Treino</h1>
          <p className="text-xs text-gym-text-muted mt-0.5">
            Planilhas profissionais montadas por nossa IA para acelerar seus resultados.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCreateWorkout}
            className="bg-white/5 hover:bg-white/10 border border-gym-accent/30 text-gym-accent font-extrabold px-5 py-3 rounded-2xl transition-all flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider"
          >
            <Wrench className="w-4 h-4" />
            Criar Treino
          </button>
          <button
            onClick={() => startWorkout(undefined, 'Treino Livre')}
            className="bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold px-5 py-3 rounded-2xl transition-all shadow-md shadow-gym-accent/15 flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider"
          >
            <Plus className="w-4 h-4 text-gym-dark stroke-[3px]" />
            Treino Rápido Livre
          </button>
        </div>
      </div>

      {/* TABS: SUGERIDOS x MEUS TREINOS */}
      <div className="flex bg-gym-card p-1 rounded-2xl border border-white/5">
        {[
          { id: 'suggested', label: 'Programas Sugeridos' },
          { id: 'mine', label: `Meus Treinos${myPrograms.length > 0 ? ` (${myPrograms.length})` : ''}` }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setWorkoutsTab(tab.id as 'suggested' | 'mine')}
            className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
              workoutsTab === tab.id ? 'bg-white/10 text-white shadow' : 'text-gym-text-muted hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TABS DE NÍVEIS — só faz sentido para a biblioteca sugerida */}
      {workoutsTab === 'suggested' && (
        <div className="flex bg-gym-card p-1 rounded-2xl border border-white/5 overflow-x-auto whitespace-nowrap">
          {[
            { id: 'beginner', label: '🟢 Iniciante' },
            { id: 'intermediate', label: '🟡 Intermediário' },
            { id: 'advanced', label: '🔴 Avançado' },
            { id: 'athlete', label: '⚡ Atleta' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedLevel(tab.id as any)}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
                selectedLevel === tab.id
                  ? 'bg-white/10 text-white shadow'
                  : 'text-gym-text-muted hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* PROGRAMAS LIST */}
      {workoutsTab === 'mine' && filteredPrograms.length === 0 ? (
        <div className="glass p-12 text-center rounded-3xl border border-white/5 space-y-3 flex flex-col items-center">
          <Wrench className="w-12 h-12 text-gym-text-muted opacity-40" />
          <h3 className="text-base font-bold text-white">Nenhum treino seu ainda</h3>
          <p className="text-xs text-gym-text-muted max-w-sm">
            Toque em &quot;Criar Treino&quot; para montar seu primeiro treino do zero.
          </p>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPrograms.map((prog) => {
          const isRecentlySaved = prog.isCustom && prog.id === lastSavedProgramId;
          return (
          <div
            key={prog.id}
            className={`glass hover:border-gym-accent/20 rounded-3xl p-5 flex flex-col justify-between transition-all duration-300 relative group ${
              isRecentlySaved ? 'ring-2 ring-gym-accent shadow-lg shadow-gym-accent/20' : ''
            }`}
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                {prog.isCustom ? (
                  <span className="text-[10px] font-black uppercase bg-gym-accent/15 border border-gym-accent/20 text-gym-accent px-2.5 py-1 rounded-full">
                    {isRecentlySaved ? 'Recém-criado' : 'Meu treino'}
                  </span>
                ) : (
                  <span className="text-[10px] font-black uppercase bg-white/5 border border-white/10 text-gym-text-muted px-2.5 py-1 rounded-full">
                    {prog.durationWeeks} semanas
                  </span>
                )}
                <span className="text-[10px] font-extrabold text-gym-accent uppercase tracking-widest flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {prog.isCustom
                    ? `${estimateWorkoutDuration(prog.weeks[0]?.days[0]?.slots ?? []).exerciseCount} exercícios`
                    : `${prog.frequencyDays}x por semana`}
                </span>
              </div>

              <h3 className="text-base font-bold text-white tracking-tight mt-1">{prog.name}</h3>
              <p className="text-xs text-gym-text-muted mt-2 leading-relaxed line-clamp-3">
                {prog.description}
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
              <button
                onClick={() => setSelectedProgram(prog)}
                className="text-xs font-bold text-gym-accent hover:underline flex items-center gap-1.5 cursor-pointer"
              >
                Ver Detalhes
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => handleStartProgram(prog)}
                className="bg-white/5 hover:bg-gym-accent/15 hover:text-gym-accent border border-white/10 hover:border-gym-accent/20 p-2.5 rounded-xl transition-all"
                title="Iniciar Treino"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
              </button>
            </div>
          </div>
          );
        })}
      </div>
      )}

      {/* DETALHES DO PROGRAMA MODAL */}
      {selectedProgram && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gym-dark border border-white/10 rounded-3xl w-full max-w-2xl p-6 lg:p-8 relative max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setSelectedProgram(null)}
              className="absolute top-4 right-4 text-gym-text-muted hover:text-white p-2 rounded-lg bg-white/5"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <span className="text-[10px] font-extrabold text-gym-accent uppercase tracking-widest block mb-1">
                Ficha de Treino Detalhada
              </span>
              <h2 className="text-xl lg:text-2xl font-black text-white tracking-tight">
                {selectedProgram.name}
              </h2>
              <p className="text-xs text-gym-text-muted mt-1 leading-relaxed">
                {selectedProgram.description}
              </p>

              {/* Informações Rápidas */}
              <div className="grid grid-cols-3 gap-3 my-5 bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex flex-col items-center text-center">
                  <Clock className="w-4 h-4 text-gym-accent mb-1" />
                  <span className="text-[10px] text-gym-text-muted uppercase">Duração</span>
                  <span className="text-xs font-bold text-white">{selectedProgram.durationWeeks} semanas</span>
                </div>
                <div className="flex flex-col items-center text-center">
                  <Calendar className="w-4 h-4 text-gym-accent mb-1" />
                  <span className="text-[10px] text-gym-text-muted uppercase">Frequência</span>
                  <span className="text-xs font-bold text-white">{selectedProgram.frequencyDays} dias/sem</span>
                </div>
                <div className="flex flex-col items-center text-center">
                  <Target className="w-4 h-4 text-gym-accent mb-1" />
                  <span className="text-[10px] text-gym-text-muted uppercase">Objetivo</span>
                  <span className="text-xs font-bold text-white truncate max-w-full">{selectedProgram.objective}</span>
                </div>
              </div>

              {/* Estrutura real do programa: Dias e Slots (GOAL-07) */}
              <h4 className="text-xs font-bold uppercase tracking-wider text-gym-text-muted mb-3 pl-1">
                Divisão de Treinos ({selectedProgram.weeks[0]?.days.length || 0} {(selectedProgram.weeks[0]?.days.length || 0) === 1 ? 'dia' : 'dias'})
              </h4>

              <div className="space-y-4">
                {(selectedProgram.weeks[0]?.days || []).map((day) => (
                  <div key={day.id} className="bg-gym-card/50 border border-white/5 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-3.5 py-2.5 bg-white/5 border-b border-white/5 gap-2">
                      <h5 className="text-xs font-black text-white truncate">{day.name}</h5>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {selectedProgram.isCustom && (
                          <button
                            onClick={() => handleEditProgramDay(selectedProgram, day)}
                            className="min-h-[32px] text-[9px] bg-white/5 hover:bg-white/10 border border-white/10 text-white font-extrabold px-3 py-1.5 rounded-lg uppercase tracking-wider flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3 text-gym-accent" /> Editar
                          </button>
                        )}
                        <button
                          onClick={() => {
                            startWorkout(selectedProgram.id, undefined, day.id);
                            setSelectedProgram(null);
                          }}
                          className="min-h-[32px] text-[9px] bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold px-3 py-1.5 rounded-lg uppercase tracking-wider flex items-center gap-1"
                        >
                          <Play className="w-3 h-3 fill-gym-dark" /> Iniciar
                        </button>
                      </div>
                    </div>
                    <div className="divide-y divide-white/5">
                      {day.slots.map((slot, idx) => {
                        const ex = getExerciseDetails(slot.exerciseId);
                        return (
                          <div key={idx} className="p-3 flex items-center justify-between">
                            <div>
                              <h6 className="text-xs font-bold text-white">{ex?.name || 'Exercício Desconhecido'}</h6>
                              <p className="text-[10px] text-gym-text-muted capitalize">
                                {ex?.muscleGroup || 'Geral'} • Descanso {slot.restSec}s • RPE {slot.targetRPE}
                              </p>
                            </div>
                            <span className="text-xs font-extrabold text-gym-accent font-mono whitespace-nowrap">
                              {slot.series} x {slot.repRange[0] === slot.repRange[1] ? slot.repRange[0] : `${slot.repRange[0]}-${slot.repRange[1]}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Botões */}
              <div className="flex flex-col sm:flex-row gap-3 mt-8">
                <button
                  onClick={() => setSelectedProgram(null)}
                  className="flex-1 min-h-[44px] py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold transition-all text-center"
                >
                  Voltar
                </button>
                <button
                  onClick={() => {
                    applyProgramToWeek(selectedProgram.id);
                    setSelectedProgram(null);
                  }}
                  className="flex-1 min-h-[44px] py-3 bg-white/5 hover:bg-white/10 border border-gym-accent/30 text-gym-accent rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Planejar Semana
                </button>
                <button
                  onClick={() => handleStartProgram(selectedProgram)}
                  className="flex-1 min-h-[44px] py-3 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-gym-accent/15 flex items-center justify-center gap-1.5"
                >
                  Iniciar Treino Agora
                  <Play className="w-3.5 h-3.5 fill-gym-dark" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
