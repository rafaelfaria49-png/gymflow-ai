'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useGymFlow } from '../../providers/GymFlowContext';
import { buildNutritionTrend, summarizeNutritionTrend, type NutritionTrendPoint } from '../../lib/nutrition/trend';
import { EmptyState, SectionCard } from './shared';

export const TrendSection = () => {
  const { getNutritionHistory } = useGymFlow();
  const [range, setRange] = useState<7 | 30>(7);
  const [points, setPoints] = useState<NutritionTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (daysCount: 7 | 30) => {
    setLoading(true);
    try {
      const days = await getNutritionHistory();
      setPoints(buildNutritionTrend({ days, daysCount }));
    } catch {
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, [getNutritionHistory]);

  useEffect(() => {
    void load(range);
  }, [load, range]);

  const summary = summarizeNutritionTrend(points);
  const withTargets = points.filter((point) => point.hasTargets).length;
  const maxKcal = Math.max(1, ...points.map((point) => Math.max(point.calories, point.targetCalories ?? 0)));

  return (
    <div className="space-y-3">
      <SectionCard
        title="Tendência real"
        subtitle="Somente dias com registro entram na lista e nas médias — dias sem registro não são interpolados nem inventados."
      >
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Janela da tendência">
          {([7, 30] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={range === option}
              onClick={() => setRange(option)}
              className={`min-h-[44px] rounded-xl text-xs font-bold border transition-all active:scale-[0.98] ${
                range === option
                  ? 'bg-gym-accent text-gym-dark border-gym-accent'
                  : 'bg-white/5 text-white border-white/10'
              }`}
            >
              {option} dias
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Carregando tendência">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-12 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : points.length === 0 ? (
          <EmptyState
            title="Sem histórico ainda"
            hint="Registre água ou alimentos para ver a tendência. Dias futuros ou sem registro nunca aparecem aqui."
          />
        ) : (
          <div className="space-y-3">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] font-bold uppercase text-gym-text-muted">Dias</p>
                <p className="font-mono font-bold text-white text-sm">{summary.count}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-gym-text-muted">Média kcal</p>
                <p className="font-mono font-bold text-white text-sm">{summary.avgCalories ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-gym-text-muted">Média prot.</p>
                <p className="font-mono font-bold text-white text-sm">{summary.avgProtein != null ? `${summary.avgProtein}g` : '—'}</p>
              </div>
            </div>
            <p className="text-[10px] text-gym-text-muted">
              {withTargets} de {points.length} {points.length === 1 ? 'dia com' : 'dias com'} meta automática · média de hidratação: {summary.avgWaterMl != null ? `${summary.avgWaterMl}ml` : '—'}.
            </p>
            <ul className="space-y-2">
              {points.map((point) => (
                <li key={point.date} className="bg-white/5 border border-white/10 rounded-2xl p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-bold text-white font-mono">{point.date}</span>
                    <span className="text-[11px] font-mono text-gym-text-muted">
                      {point.calories} kcal · P {point.protein}g · {point.waterMl}ml
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden mt-2" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-gym-accent"
                      style={{ width: `${Math.min(100, Math.round((point.calories / maxKcal) * 100))}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gym-text-muted mt-1.5 font-mono">
                    {point.hasTargets && point.targetCalories !== null
                      ? `meta: ${point.targetCalories} kcal · prot. ${point.targetProtein ?? '—'}g · água ${point.targetWaterMl ?? '—'}ml`
                      : 'sem meta automática neste dia'}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>
    </div>
  );
};
