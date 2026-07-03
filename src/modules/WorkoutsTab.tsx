'use client';

import React, { useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { WorkoutProgram, Exercise } from '../types';
import { Play, Calendar, Target, Clock, Dumbbell, Award, ChevronRight, X, Sparkles, Plus } from 'lucide-react';

export const WorkoutsTab = () => {
  const { programs, exercises, startWorkout, user } = useGymFlow();
  const [selectedLevel, setSelectedLevel] = useState<'beginner' | 'intermediate' | 'advanced' | 'athlete'>(
    user?.level || 'intermediate'
  );
  const [selectedProgram, setSelectedProgram] = useState<WorkoutProgram | null>(null);

  const filteredPrograms = programs.filter((p) => p.level === selectedLevel);

  const handleStartProgram = (p: WorkoutProgram) => {
    startWorkout(p.id, p.name);
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

        <button
          onClick={() => startWorkout(undefined, 'Treino Livre')}
          className="bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold px-5 py-3 rounded-2xl transition-all shadow-md shadow-gym-accent/15 flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider"
        >
          <Plus className="w-4 h-4 text-gym-dark stroke-[3px]" />
          Treino Rápido Livre
        </button>
      </div>

      {/* TABS DE NÍVEIS */}
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

      {/* PROGRAMAS LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPrograms.map((prog) => (
          <div
            key={prog.id}
            className="glass hover:border-gym-accent/20 rounded-3xl p-5 flex flex-col justify-between transition-all duration-300 relative group"
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                <span className="text-[10px] font-black uppercase bg-white/5 border border-white/10 text-gym-text-muted px-2.5 py-1 rounded-full">
                  {prog.durationWeeks} semanas
                </span>
                <span className="text-[10px] font-extrabold text-gym-accent uppercase tracking-widest flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {prog.frequencyDays}x por semana
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
        ))}
      </div>

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

              {/* Lista de Exercícios */}
              <h4 className="text-xs font-bold uppercase tracking-wider text-gym-text-muted mb-3 pl-1">
                Exercícios Incluídos ({selectedProgram.exercises.length})
              </h4>

              <div className="space-y-2.5">
                {selectedProgram.exercises.map((pe, idx) => {
                  const ex = getExerciseDetails(pe.exerciseId);
                  return (
                    <div
                      key={idx}
                      className="bg-gym-card/50 border border-white/5 p-3.5 rounded-2xl flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-lg shadow-inner">
                          🏋️
                        </div>
                        <div>
                          <h5 className="text-xs font-bold text-white">{ex?.name || 'Exercício Desconhecido'}</h5>
                          <p className="text-[10px] text-gym-text-muted capitalize">
                            {ex?.muscleGroup || 'Geral'} • Equipamento: {ex?.equipment || 'Livre'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-extrabold text-gym-accent font-mono">
                          {pe.sets} séries x {pe.reps}
                        </span>
                        <p className="text-[8px] text-gym-text-muted uppercase font-bold mt-0.5">Recomendado</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Botões */}
              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setSelectedProgram(null)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold transition-all text-center"
                >
                  Voltar
                </button>
                <button
                  onClick={() => handleStartProgram(selectedProgram)}
                  className="flex-1 py-3 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-gym-accent/15 flex items-center justify-center gap-1.5"
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
