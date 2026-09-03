'use client';

import React, { useState } from 'react';
import type {
  ExerciseMetricPoint,
  MuscleGroupWeeklyVolume,
  SwapAndSkipAnalytics,
  WeeklyAdherenceBreakdown,
} from '../../domain/analytics/types';
import { SWAP_REASON_LABELS } from '../../lib/workout-session-view';
import type { WorkoutSwapReasonCode } from '../../types';

interface VolumeComparisonBarChartProps {
  data: MuscleGroupWeeklyVolume[];
}

export const VolumeComparisonBarChart: React.FC<VolumeComparisonBarChartProps> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-gym-text-muted">
        Nenhum dado de volume muscular registrado no período selecionado.
      </div>
    );
  }

  // Pega os top grupos com volume
  const displayData = data.slice(0, 8);
  const maxSets = Math.max(
    ...displayData.map((d) => Math.max(d.plannedSets, d.executedSets, 1)),
    10,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-gym-accent inline-block"></span>
            <span className="text-gym-text-muted text-[11px]">Executado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-white/20 inline-block"></span>
            <span className="text-gym-text-muted text-[11px]">Planejado</span>
          </div>
        </div>
        <span className="text-[10px] text-gym-text-muted">Volume em Séries</span>
      </div>

      <div className="space-y-2.5">
        {displayData.map((item, idx) => {
          const execPercent = Math.min(100, Math.round((item.executedSets / maxSets) * 100));
          const planPercent = Math.min(100, Math.round((item.plannedSets / maxSets) * 100));
          const isHovered = hoveredIdx === idx;
          const ratio =
            item.plannedSets > 0
              ? Math.round((item.executedSets / item.plannedSets) * 100)
              : 100;

          return (
            <div
              key={item.muscleGroupId}
              className="space-y-1 p-2 rounded-xl hover:bg-white/[0.03] transition-all cursor-pointer"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div className="flex justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  {item.muscleGroupLabel}
                  {item.executedSets === 0 && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-semibold">
                      0 séries
                    </span>
                  )}
                </span>
                <span className="font-mono text-[11px] text-gym-text-muted">
                  <span className="text-white font-bold">{item.executedSets}</span>
                  <span className="text-gym-text-muted"> / {item.plannedSets} séries</span>
                  <span className="ml-1 text-[10px] text-gym-accent font-semibold">
                    ({ratio}%)
                  </span>
                </span>
              </div>

              {/* Barra de comparação SVG / HTML híbrida responsiva */}
              <div className="h-4 bg-white/5 rounded-lg overflow-hidden relative flex items-center">
                {/* Barra planejada (fundo) */}
                <div
                  className="h-full bg-white/15 rounded-lg transition-all duration-500 absolute left-0 top-0"
                  style={{ width: `${planPercent}%` }}
                />
                {/* Barra executada (frente) */}
                <div
                  className={`h-full rounded-lg transition-all duration-500 absolute left-0 top-0 ${
                    item.executedSets >= item.plannedSets && item.plannedSets > 0
                      ? 'bg-gym-emerald'
                      : isHovered
                      ? 'bg-gym-accent'
                      : 'bg-gym-accent/80'
                  }`}
                  style={{ width: `${execPercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface ExerciseProgressLineChartProps {
  history: ExerciseMetricPoint[];
  exerciseName: string;
}

export const ExerciseProgressLineChart: React.FC<ExerciseProgressLineChartProps> = ({
  history,
  exerciseName,
}) => {
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);

  if (!history || history.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-gym-text-muted">
        Nenhum registro de carga para este exercício na janela selecionada.
      </div>
    );
  }

  const width = 500;
  const height = 180;
  const padding = { top: 20, right: 30, bottom: 30, left: 45 };

  const weights = history.map((p) => p.maxWeight);
  const minWeight = Math.max(0, Math.floor(Math.min(...weights) * 0.9));
  const maxWeight = Math.max(minWeight + 10, Math.ceil(Math.max(...weights) * 1.05));
  const weightRange = maxWeight - minWeight || 1;

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const points = history.map((p, idx) => {
    const x =
      history.length === 1
        ? padding.left + innerWidth / 2
        : padding.left + (idx / (history.length - 1)) * innerWidth;
    const y = padding.top + innerHeight - ((p.maxWeight - minWeight) / weightRange) * innerHeight;
    return { ...p, x, y };
  });

  const pathD =
    points.length === 1
      ? `M ${points[0].x} ${points[0].y}`
      : points.reduce((acc, pt, idx) => {
          return `${acc} ${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`;
        }, '');

  const areaD =
    points.length === 1
      ? ''
      : `${pathD} L ${points[points.length - 1].x} ${height - padding.bottom} L ${
          points[0].x
        } ${height - padding.bottom} Z`;

  const activePoint = activePointIndex !== null ? points[activePointIndex] : points[points.length - 1];

  return (
    <div className="space-y-3">
      {/* Mini Header com Ponto Ativo / Selecionado */}
      <div className="flex items-center justify-between bg-white/[0.02] border border-white/5 p-3 rounded-2xl">
        <div>
          <span className="text-[10px] text-gym-text-muted uppercase font-semibold block">
            {activePoint ? `Treino em ${activePoint.date.split('T')[0]}` : exerciseName}
          </span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-xl font-extrabold text-white font-mono">
              {activePoint.maxWeight} kg
            </span>
            <span className="text-xs text-gym-text-muted">× {activePoint.repsAtMaxWeight} reps</span>
            {activePoint.isPR && (
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-gym-accent/20 text-gym-accent font-bold border border-gym-accent/30 flex items-center gap-1">
                ⭐ Recorde (PR)
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-gym-text-muted block">Volume na Sessão</span>
          <span className="text-xs font-mono font-bold text-gym-accent">
            {activePoint.volumeKg.toLocaleString('pt-BR')} kg
          </span>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto max-h-[220px] select-none"
        >
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Linhas de grade horizontal */}
          {[0, 0.5, 1].map((ratio) => {
            const y = padding.top + innerHeight * (1 - ratio);
            const val = Math.round(minWeight + weightRange * ratio);
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="rgba(255,255,255,0.07)"
                  strokeDasharray="3 3"
                />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="#71717a"
                  fontFamily="monospace"
                >
                  {val}k
                </text>
              </g>
            );
          })}

          {/* Área sombreada */}
          {areaD && <path d={areaD} fill="url(#chartGradient)" />}

          {/* Linha principal */}
          <path
            d={pathD}
            fill="none"
            stroke="#22c55e"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Pontos clicáveis / hover */}
          {points.map((pt, idx) => {
            const isSelected = activePointIndex === idx;
            return (
              <g
                key={idx}
                className="cursor-pointer"
                onMouseEnter={() => setActivePointIndex(idx)}
                onClick={() => setActivePointIndex(idx)}
              >
                {/* Hit target invisível */}
                <circle cx={pt.x} cy={pt.y} r="14" fill="transparent" />

                {/* Anel de PR ou Ponto Normal */}
                {pt.isPR ? (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 6 : 4.5}
                    fill="#eab308"
                    stroke="#18181b"
                    strokeWidth="2"
                  />
                ) : (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 5 : 3.5}
                    fill={isSelected ? '#22c55e' : '#10b981'}
                    stroke="#18181b"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

interface WeeklyAdherenceBarChartProps {
  breakdown: WeeklyAdherenceBreakdown[];
}

export const WeeklyAdherenceBarChart: React.FC<WeeklyAdherenceBarChartProps> = ({ breakdown }) => {
  if (!breakdown || breakdown.length === 0) {
    return null;
  }

  const maxSessions = Math.max(...breakdown.map((b) => b.totalSessions), 4);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-gym-emerald inline-block"></span>
            <span className="text-gym-text-muted text-[10px]">Completos</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block"></span>
            <span className="text-gym-text-muted text-[10px]">Parciais</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block"></span>
            <span className="text-gym-text-muted text-[10px]">Abandonados</span>
          </div>
        </div>
        <span className="text-[10px] text-gym-text-muted">Frequência Semanal</span>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-4 gap-2">
        {breakdown.map((week) => {
          const heightPct = Math.min(100, Math.round((week.totalSessions / maxSessions) * 100));

          return (
            <div
              key={week.weekIndex}
              className="bg-white/[0.03] border border-white/5 rounded-2xl p-2.5 flex flex-col items-center justify-between h-36 text-center"
            >
              <div className="w-full flex justify-between text-[10px] text-gym-text-muted">
                <span>{week.weekLabel}</span>
                <span className="font-bold text-white">{week.totalSessions} sessões</span>
              </div>

              {/* Barra de Coluna */}
              <div className="w-8 h-20 bg-white/5 rounded-xl flex flex-col-reverse overflow-hidden relative">
                {week.completed > 0 && (
                  <div
                    className="bg-gym-emerald w-full transition-all"
                    style={{ height: `${(week.completed / week.totalSessions) * heightPct}%` }}
                    title={`${week.completed} completos`}
                  />
                )}
                {week.partial > 0 && (
                  <div
                    className="bg-amber-400 w-full transition-all"
                    style={{ height: `${(week.partial / week.totalSessions) * heightPct}%` }}
                    title={`${week.partial} parciais`}
                  />
                )}
                {week.abandoned > 0 && (
                  <div
                    className="bg-rose-400 w-full transition-all"
                    style={{ height: `${(week.abandoned / week.totalSessions) * heightPct}%` }}
                    title={`${week.abandoned} abandonados`}
                  />
                )}
              </div>

              <span className="text-[9px] text-gym-text-muted">
                {week.avgDurationMinutes > 0 ? `${week.avgDurationMinutes} min méd.` : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface SwapReasonsBarChartProps {
  analytics: SwapAndSkipAnalytics;
}

export const SwapReasonsBarChart: React.FC<SwapReasonsBarChartProps> = ({ analytics }) => {
  const { swapReasonDistribution, totalSwaps, mostSwapped, totalSkips, mostSkipped } = analytics;

  if (totalSwaps === 0 && totalSkips === 0) {
    return (
      <div className="p-6 text-center text-xs text-gym-text-muted">
        Nenhuma substituição ou exercício pulado registrado nesta janela. Treinos executados 100% conforme o plano!
      </div>
    );
  }

  const entries = Object.entries(swapReasonDistribution).filter(([, count]) => count > 0);

  return (
    <div className="space-y-4">
      {/* Motivos de substituição */}
      {entries.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-white uppercase tracking-wider block">
            Motivos de Substituição ({totalSwaps} trocas)
          </span>
          <div className="space-y-1.5">
            {entries.map(([reasonCode, count]) => {
              const label =
                reasonCode === 'unspecified'
                  ? 'Não especificado (legado)'
                  : SWAP_REASON_LABELS[reasonCode as WorkoutSwapReasonCode] ?? reasonCode;
              const pct = Math.round((count / totalSwaps) * 100);

              return (
                <div key={reasonCode} className="space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gym-text-muted">{label}</span>
                    <span className="font-mono font-bold text-white">
                      {count}x ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gym-accent rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mais trocados e mais pulados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
        {mostSwapped.length > 0 && (
          <div className="bg-white/[0.02] border border-white/5 p-3 rounded-2xl space-y-1.5">
            <span className="text-[10px] font-bold text-gym-accent uppercase tracking-wider block">
              Mais Substituídos
            </span>
            <ul className="space-y-1 text-xs">
              {mostSwapped.slice(0, 3).map((item, idx) => (
                <li key={idx} className="flex justify-between items-center text-white">
                  <span className="truncate pr-2">{item.name}</span>
                  <span className="font-mono text-gym-text-muted text-[10px] flex-shrink-0">
                    {item.count}x
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {mostSkipped.length > 0 && (
          <div className="bg-white/[0.02] border border-white/5 p-3 rounded-2xl space-y-1.5">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
              Mais Pulados (Skipped)
            </span>
            <ul className="space-y-1 text-xs">
              {mostSkipped.slice(0, 3).map((item, idx) => (
                <li key={idx} className="flex justify-between items-center text-white">
                  <span className="truncate pr-2">{item.name}</span>
                  <span className="font-mono text-amber-400 text-[10px] flex-shrink-0 font-bold">
                    {item.count}x
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
