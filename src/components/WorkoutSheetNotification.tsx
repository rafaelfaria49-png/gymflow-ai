'use client';

import React from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { Play, Maximize2, Sparkles } from 'lucide-react';

export const WorkoutSheetNotification = () => {
  const { activeWorkout, workoutDuration, activeView, setActiveView } = useGymFlow();

  if (!activeWorkout || activeView === 'active-workout') return null;

  // Formatar tempo
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

  const completedSets = activeWorkout.exercises.reduce((acc, ex) => {
    return acc + ex.sets.filter((s) => s.completed).length;
  }, 0);

  const totalSets = activeWorkout.exercises.reduce((acc, ex) => {
    return acc + ex.sets.length;
  }, 0);

  return (
    <div className="fixed bottom-[58px] lg:bottom-4 left-4 right-4 lg:left-auto lg:right-4 lg:w-96 z-40 animate-pulse-glow">
      <div
        onClick={() => setActiveView('active-workout')}
        className="glass-accent hover:bg-gym-accent/15 border border-gym-accent/30 rounded-2xl p-4 shadow-2xl flex items-center justify-between cursor-pointer transition-all duration-300 transform hover:-translate-y-1"
      >
        <div className="flex items-center gap-3">
          <div className="bg-gym-accent text-gym-dark p-2.5 rounded-full flex items-center justify-center">
            <Play className="w-4 h-4 fill-gym-dark" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
              Treino em Andamento
              <Sparkles className="w-3.5 h-3.5 text-gym-accent" />
            </h4>
            <p className="text-xs text-gym-text-muted">
              {activeWorkout.name} • {completedSets}/{totalSets} séries
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-mono font-bold text-gym-accent bg-gym-dark/50 px-2.5 py-1 rounded-lg border border-gym-accent/20">
            {formatTime(workoutDuration)}
          </span>
          <div className="text-gym-text-muted hover:text-white p-1">
            <Maximize2 className="w-4 h-4" />
          </div>
        </div>
      </div>
    </div>
  );
};
