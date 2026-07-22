'use client';

import React, { useEffect } from 'react';
import {
  X,
  Clock,
  Calendar,
  Award,
  Zap,
  Dumbbell,
  Check,
  StickyNote,
  RefreshCw,
} from 'lucide-react';
import type { ActiveExercise, WorkoutSession, WorkoutSet } from '../types';
import {
  buildSessionSummary,
  buildSwapView,
} from '../lib/workout-session-view';
import {
  ExerciseOriginBadge,
  ExerciseExecutionBadge,
  SessionStatusBadge,
} from './ui/SessionBadges';

interface SessionDetailModalProps {
  session: WorkoutSession | null;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0 min';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}min` : `${hrs}h`;
}

function SetRow({ set, index }: { set: WorkoutSet; index: number }) {
  return (
    <div
      className={`grid grid-cols-12 items-center gap-1 rounded-xl border px-2 py-1.5 text-center text-xs ${
        set.completed
          ? 'bg-gym-emerald/5 border-gym-emerald/20'
          : 'bg-white/5 border-white/10'
      }`}
    >
      <span className="col-span-2 text-left font-bold text-white">{index + 1}</span>
      <span className="col-span-3 font-mono text-white">
        {set.weight} <span className="text-gym-text-muted text-[10px]">kg</span>
      </span>
      <span className="col-span-3 font-mono text-white">
        {set.reps} <span className="text-gym-text-muted text-[10px]">reps</span>
      </span>
      <span className="col-span-2 font-mono text-gym-text-muted">
        {set.rpe != null ? `RPE ${set.rpe}` : '—'}
      </span>
      <span className="col-span-2 flex justify-center">
        {set.completed ? (
          <span className="inline-flex items-center gap-1 text-gym-emerald font-bold text-[10px] uppercase">
            <Check className="w-3 h-3" /> OK
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-gym-text-muted font-bold text-[10px] uppercase">
            <X className="w-3 h-3" /> —
          </span>
        )}
      </span>
    </div>
  );
}

function ExerciseBlock({ exercise, index }: { exercise: ActiveExercise; index: number }) {
  const completed = exercise.sets.filter((s) => s.completed).length;
  const total = exercise.sets.length;
  // GOAL-24: entradas substituídas mostram planejado × executado + motivo/nota.
  const swap = exercise.entryOrigin === 'swapped' ? buildSwapView(exercise) : null;
  return (
    <div className="bg-gym-card/60 border border-white/5 rounded-2xl p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
            <span className="text-gym-accent">#{index + 1}</span>
            <span className="truncate">{exercise.name}</span>
          </h4>
          <span className="text-[10px] text-gym-text-muted capitalize block mt-0.5">
            {exercise.muscleGroup}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 flex-shrink-0">
          <ExerciseOriginBadge exercise={exercise} />
          <ExerciseExecutionBadge exercise={exercise} />
        </div>
      </div>

      {swap && (
        <div className="bg-amber-400/5 border border-amber-400/15 rounded-xl p-2.5 space-y-1.5">
          <span className="text-[9px] font-bold text-amber-400/90 uppercase tracking-wider flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Substituição
          </span>
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[9px] text-gym-text-muted font-bold uppercase tracking-wider w-16 flex-shrink-0">
                Planejado
              </span>
              <span
                className={`text-[11px] font-semibold break-words ${
                  swap.hasOriginal ? 'text-white' : 'text-gym-text-muted italic'
                }`}
              >
                {swap.planned}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[9px] text-gym-text-muted font-bold uppercase tracking-wider w-16 flex-shrink-0">
                Executado
              </span>
              <span className="text-[11px] text-white font-semibold break-words">{swap.performed}</span>
            </div>
            {swap.reasonLabel && (
              <div className="flex items-baseline gap-2">
                <span className="text-[9px] text-gym-text-muted font-bold uppercase tracking-wider w-16 flex-shrink-0">
                  Motivo
                </span>
                <span className="text-[11px] text-amber-400/90 font-semibold">{swap.reasonLabel}</span>
              </div>
            )}
          </div>
          {swap.note && (
            <p className="text-[11px] text-white/90 leading-relaxed break-words border-t border-amber-400/10 pt-1.5">
              {swap.note}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-gym-text-muted font-bold uppercase tracking-wider">
        <span>Séries</span>
        <span className="text-white">
          {completed} / {total} concluídas
        </span>
      </div>

      {total > 0 ? (
        <div className="space-y-1.5">
          {exercise.sets.map((set, setIdx) => (
            <SetRow key={set.id} set={set} index={setIdx} />
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-gym-text-muted italic">
          Este exercício não possui séries registradas.
        </p>
      )}

      {exercise.notes && exercise.notes.trim().length > 0 && (
        <div className="bg-white/5 border border-white/5 rounded-xl p-2.5 flex items-start gap-2">
          <StickyNote className="w-3.5 h-3.5 text-gym-accent flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-white leading-relaxed break-words">{exercise.notes}</p>
        </div>
      )}
    </div>
  );
}

export const SessionDetailModal = ({ session, onClose }: SessionDetailModalProps) => {
  useEffect(() => {
    if (!session) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [session, onClose]);

  if (!session) return null;

  const summary = buildSessionSummary(session);
  const hasVolume = session.totalVolume !== undefined;
  const prs = session.prsDetected ?? [];

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-detail-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-gym-dark border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] animate-toast-in"
      >
        {/* HEADER */}
        <div className="relative p-5 border-b border-white/5 flex-shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gym-text-muted hover:text-white rounded-lg bg-white/5 w-9 h-9 flex items-center justify-center transition-all"
            aria-label="Fechar detalhe"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="mb-2">
            <SessionStatusBadge session={session} />
          </div>
          <h2 id="session-detail-title" className="text-lg font-black text-white tracking-tight pr-8 leading-tight">
            {session.name}
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-gym-text-muted font-medium">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {session.date}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {formatDuration(session.duration)}
            </span>
          </div>
        </div>

        {/* BODY */}
        <div className="overflow-y-auto p-5 space-y-4">
          {/* MÉTRICAS DE RESUMO */}
          <div className="grid grid-cols-3 gap-2 bg-white/5 p-3 rounded-2xl border border-white/5">
            <div className="text-center">
              <span className="text-[9px] text-gym-text-muted uppercase font-bold flex items-center justify-center gap-1">
                <Zap className="w-3 h-3" /> Volume
              </span>
              <p className="text-sm font-extrabold text-gym-accent mt-0.5">
                {hasVolume ? `${session.totalVolume} kg` : '—'}
              </p>
            </div>
            <div className="text-center border-x border-white/5">
              <span className="text-[9px] text-gym-text-muted uppercase font-bold block">Calorias</span>
              <p className="text-sm font-extrabold text-white mt-0.5">{session.calories} kcal</p>
            </div>
            <div className="text-center">
              <span className="text-[9px] text-gym-text-muted uppercase font-bold block">XP</span>
              <p className="text-sm font-extrabold text-gym-emerald mt-0.5">+{session.xpEarned}</p>
            </div>
          </div>

          {/* RESUMO DE SÉRIES E EXERCÍCIOS */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-white/5 border border-white/5 rounded-xl p-2.5">
              <span className="text-gym-text-muted uppercase font-bold text-[9px] block">Séries</span>
              <p className="text-white font-bold mt-0.5">
                {summary.completedSets} concluídas
                {summary.incompleteSets > 0 && (
                  <span className="text-gym-text-muted"> · {summary.incompleteSets} incompletas</span>
                )}
              </p>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-xl p-2.5">
              <span className="text-gym-text-muted uppercase font-bold text-[9px] block">Exercícios</span>
              <p className="text-white font-bold mt-0.5">
                {summary.totalExercises} no total
                {summary.skippedExercises > 0 && (
                  <span className="text-gym-rose"> · {summary.skippedExercises} pulados</span>
                )}
              </p>
            </div>
          </div>

          {/* PRs */}
          {prs.length > 0 && (
            <div className="bg-gym-accent/5 border border-gym-accent/10 rounded-2xl p-3.5">
              <span className="text-[9px] font-extrabold text-gym-accent uppercase tracking-wider flex items-center gap-1 mb-1.5">
                <Award className="w-3.5 h-3.5" /> Recordes Pessoais
              </span>
              <ul className="space-y-1">
                {prs.map((pr, idx) => (
                  <li key={idx} className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-gym-accent" />
                    {pr}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* EXERCÍCIOS */}
          <div className="space-y-2.5">
            <span className="text-[10px] font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Dumbbell className="w-3.5 h-3.5 text-gym-accent" /> Exercícios
            </span>
            {session.exercises.length === 0 ? (
              <p className="text-xs text-gym-text-muted italic">
                Esta sessão não possui exercícios registrados.
              </p>
            ) : (
              session.exercises.map((ex, idx) => (
                <ExerciseBlock key={ex.id} exercise={ex} index={idx} />
              ))
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-white/5 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-extrabold text-white transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
