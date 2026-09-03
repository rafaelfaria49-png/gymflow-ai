'use client';

import React from 'react';
import type { SessionComparison } from '../../domain/analytics/types';
import { ArrowUpRight, ArrowDownRight, Minus, Dumbbell, Clock, Flame } from 'lucide-react';

interface SessionComparisonCardProps {
  comparison: SessionComparison;
}

export const SessionComparisonCard: React.FC<SessionComparisonCardProps> = ({ comparison }) => {
  const {
    currentSession,
    previousSession,
    volumeDeltaKg,
    volumeDeltaPercent,
    durationDeltaMinutes,
    setsDelta,
    exercises,
  } = comparison;

  if (!previousSession) {
    return (
      <div className="bg-white/[0.03] border border-white/10 p-5 rounded-3xl text-center space-y-2">
        <div className="w-10 h-10 rounded-2xl bg-gym-accent/15 text-gym-accent flex items-center justify-center mx-auto">
          <Dumbbell className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-bold text-white">Primeira sessão registrada deste treino</h4>
        <p className="text-xs text-gym-text-muted max-w-sm mx-auto">
          Os comparativos de carga, volume e tempo serão calculados automaticamente a partir do próximo treino idêntico ou similar.
        </p>
      </div>
    );
  }

  const isPositiveVolume = volumeDeltaKg > 0;
  const isNeutralVolume = volumeDeltaKg === 0;

  return (
    <div className="bg-white/[0.03] border border-white/10 p-5 rounded-3xl space-y-5">
      {/* Header com Sessão Atual vs Anterior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-4">
        <div>
          <span className="text-[10px] text-gym-accent font-extrabold uppercase tracking-wider block">
            Comparativo Pós-Treino vs Sessão Anterior
          </span>
          <h3 className="text-base font-black text-white tracking-tight mt-0.5">
            {currentSession.name}
          </h3>
          <p className="text-[11px] text-gym-text-muted mt-0.5">
            Atual ({currentSession.date.split('T')[0]}) vs Anterior ({previousSession.date.split('T')[0]})
          </p>
        </div>

        {(currentSession.isLegacy || previousSession.isLegacy) && (
          <span className="text-[9px] bg-amber-400/10 text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded-md self-start sm:self-auto font-semibold">
            Contém dados antigos (pré-v2)
          </span>
        )}
      </div>

      {/* KPIs de Delta */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* Delta Volume */}
        <div
          className={`p-3 rounded-2xl border ${
            isPositiveVolume
              ? 'bg-gym-emerald/[0.06] border-gym-emerald/20 text-gym-emerald'
              : isNeutralVolume
              ? 'bg-white/5 border-white/10 text-white'
              : 'bg-rose-500/[0.06] border-rose-500/20 text-rose-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gym-text-muted font-bold uppercase">Volume Total</span>
            <Flame className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-baseline gap-1 mt-1 font-mono">
            <span className="text-base sm:text-lg font-black">
              {isPositiveVolume ? `+${volumeDeltaKg}` : `${volumeDeltaKg}`}
            </span>
            <span className="text-[10px] text-gym-text-muted">kg</span>
          </div>
          <span className="text-[10px] font-bold block mt-0.5">
            {isPositiveVolume ? `+${volumeDeltaPercent}%` : `${volumeDeltaPercent}%`}
          </span>
        </div>

        {/* Delta Tempo */}
        <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between text-gym-text-muted">
            <span className="text-[10px] font-bold uppercase">Duração</span>
            <Clock className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-baseline gap-1 mt-1 font-mono text-white">
            <span className="text-base sm:text-lg font-black">
              {durationDeltaMinutes >= 0 ? `+${durationDeltaMinutes}` : `${durationDeltaMinutes}`}
            </span>
            <span className="text-[10px] text-gym-text-muted">min</span>
          </div>
          <span className="text-[10px] text-gym-text-muted block mt-0.5 font-medium">
            {currentSession.durationMinutes}m vs {previousSession.durationMinutes}m
          </span>
        </div>

        {/* Delta Séries Concluídas */}
        <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between text-gym-text-muted">
            <span className="text-[10px] font-bold uppercase">Séries</span>
            <Dumbbell className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-baseline gap-1 mt-1 font-mono text-white">
            <span className="text-base sm:text-lg font-black">
              {setsDelta >= 0 ? `+${setsDelta}` : `${setsDelta}`}
            </span>
            <span className="text-[10px] text-gym-text-muted">séries</span>
          </div>
          <span className="text-[10px] text-gym-text-muted block mt-0.5 font-medium">
            {currentSession.setsCompleted} concluídas
          </span>
        </div>
      </div>

      {/* Lista Exercício por Exercício */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-white uppercase tracking-wider block">
          Comparativo por Exercício
        </span>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {exercises.map((ex, idx) => {
            const hasProg = ex.status === 'progressed';
            const hasReg = ex.status === 'regressed';
            const isNew = ex.status === 'new';

            return (
              <div
                key={idx}
                className="bg-white/[0.03] border border-white/5 p-3 rounded-2xl flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h5 className="font-bold text-white truncate">{ex.exerciseName}</h5>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-gym-text-muted">
                      {ex.muscleGroup}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-gym-text-muted mt-1 font-mono">
                    <span>
                      Carga:{' '}
                      <strong className="text-white">{ex.currentMaxWeight} kg</strong>
                      {ex.previousMaxWeight !== undefined && (
                        <span className="text-gym-text-muted"> (ant. {ex.previousMaxWeight} kg)</span>
                      )}
                    </span>
                    <span>
                      Volume:{' '}
                      <strong className="text-white">{Math.round(ex.currentVolumeKg)} kg</strong>
                    </span>
                  </div>
                </div>

                {/* Badge de Status */}
                <div className="flex-shrink-0 text-right">
                  {hasProg && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-xl bg-gym-emerald/15 text-gym-emerald border border-gym-emerald/25">
                      <ArrowUpRight className="w-3 h-3" />
                      +{ex.weightDeltaKg} kg
                    </span>
                  )}
                  {hasReg && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/25">
                      <ArrowDownRight className="w-3 h-3" />
                      {ex.weightDeltaKg} kg
                    </span>
                  )}
                  {!hasProg && !hasReg && !isNew && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-xl bg-white/5 text-gym-text-muted border border-white/10">
                      <Minus className="w-3 h-3" />
                      Manteve
                    </span>
                  )}
                  {isNew && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-xl bg-gym-accent/15 text-gym-accent border border-gym-accent/25">
                      Novo
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
