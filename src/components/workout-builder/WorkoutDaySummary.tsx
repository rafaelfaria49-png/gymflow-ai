'use client';

import React from 'react';
import { AlertTriangle, Clock, Layers } from 'lucide-react';
import type { Exercise } from '../../types';
import type { WorkoutDayBuilderDraft } from '../../types/workout-builder';
import type { DetailedWorkoutDurationEstimate, VolumeConfidence } from '../../types/training-volume';
import type {
  RecommendedExerciseRange,
  WorkoutTimeFitAnalysis,
} from '../../lib/workout-time-fit';
import { summarizeDayVolume } from '../../lib/workout-builder';
import { muscleGroupShortLabel } from '../../lib/workout-day-naming';

const CONFIDENCE_LABEL: Record<VolumeConfidence, string> = {
  high: 'Confiança alta',
  medium: 'Confiança média',
  low: 'Confiança baixa',
};

const minutes = (seconds: number) => Math.round(seconds / 60);

interface WorkoutDaySummaryProps {
  day: WorkoutDayBuilderDraft;
  exercises: readonly Exercise[];
  estimate: DetailedWorkoutDurationEstimate;
  targetMinutes: number;
  timeFit: WorkoutTimeFitAnalysis;
  recommendedExerciseRange: RecommendedExerciseRange;
}

/**
 * GOAL-19A: resumo do dia (PART 10/11).
 *
 * Mostra duração central, faixa provável, de onde vem o tempo e o volume cru do dia.
 * NÃO compara o dia com a faixa semanal — isso só faz sentido com o programa inteiro
 * na mão (a comparação vive em WorkoutProgramSummary). Nada aqui altera o treino.
 */
export const WorkoutDaySummary = ({
  day,
  exercises,
  estimate,
  targetMinutes,
  timeFit,
  recommendedExerciseRange,
}: WorkoutDaySummaryProps) => {
  const volume = summarizeDayVolume(day, exercises);
  const empty = day.slots.length === 0;
  const differenceText = !empty && timeFit.absoluteDifferenceMinutes !== null
    ? timeFit.direction === 'within'
      ? timeFit.absoluteDifferenceMinutes === 0
        ? 'Estimativa alinhada ao tempo disponível.'
        : `Aproximadamente ${timeFit.absoluteDifferenceMinutes} min ${timeFit.differenceMinutes! < 0 ? 'abaixo' : 'acima'} do tempo disponível, dentro da faixa operacional.`
      : `Aproximadamente ${timeFit.absoluteDifferenceMinutes} min ${timeFit.direction === 'below' ? 'abaixo' : 'acima'} do tempo disponível.`
    : null;

  const factors = [
    { label: 'de descanso', value: minutes(estimate.restSeconds) },
    { label: 'de transições', value: minutes(estimate.transitionSeconds) },
    { label: 'de preparação', value: minutes(estimate.setupSeconds) },
  ].filter((factor) => factor.value > 0);

  return (
    <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3">
      {/* DURAÇÃO */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[9px] font-bold uppercase text-gym-text-muted flex items-center gap-1">
            <Clock className="w-3 h-3" /> Estimativa
          </span>
          <span className="block text-lg font-black text-white leading-tight">
            {empty ? '—' : `${estimate.totalMinutes} min`}
          </span>
          {!empty && (
            <span className="block text-[10px] text-gym-text-muted">
              Faixa provável: {estimate.lowerBoundMinutes}–{estimate.upperBoundMinutes} min
            </span>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-[9px] font-bold uppercase text-gym-text-muted flex items-center gap-1 justify-end">
            <Layers className="w-3 h-3" /> Séries
          </span>
          <span className="block text-lg font-black text-white leading-tight">{estimate.totalSeries}</span>
          <span className="block text-[9px] text-gym-text-muted">{CONFIDENCE_LABEL[estimate.confidence]}</span>
        </div>
      </div>

      <div className="pt-2 border-t border-white/5 space-y-1.5 min-w-0">
        <p className="text-[10px] text-white">
          Tempo disponível: <strong>{targetMinutes} min</strong>
        </p>
        <p className="text-[10px] text-gym-text-muted">
          Faixa operacional: {timeFit.operationalRange.minimumMinutes}–{timeFit.operationalRange.maximumMinutes} min
        </p>
        {differenceText && (
          <p className="text-[10px] text-gym-accent leading-relaxed">{differenceText}</p>
        )}
        <p className="text-[10px] text-gym-text-muted leading-relaxed">
          Recomendado para este tempo: {recommendedExerciseRange.minimumExercises}–{recommendedExerciseRange.maximumExercises} exercícios
        </p>
        <p className="text-[10px] text-gym-text-muted">
          Atual: {day.slots.length} {day.slots.length === 1 ? 'exercício' : 'exercícios'}
        </p>
        {!empty && timeFit.suggestion && (
          <p className="rounded-xl bg-gym-accent/10 border border-gym-accent/20 p-2.5 text-[10px] text-gym-accent leading-relaxed break-words">
            {timeFit.suggestion}
          </p>
        )}
      </div>

      {!empty && factors.length > 0 && (
        <div>
          <span className="block text-[9px] font-bold uppercase text-gym-text-muted mb-1">Principais fatores</span>
          <ul className="space-y-0.5">
            {factors.map((factor) => (
              <li key={factor.label} className="text-[10px] text-gym-text-muted">
                • {factor.value} min {factor.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* VOLUME DO DIA — números crus, sem comparação semanal */}
      {volume.muscleVolume.length > 0 && (
        <div className="pt-2 border-t border-white/5">
          <span className="block text-[9px] font-bold uppercase text-gym-text-muted mb-1.5">
            Volume planejado do dia
          </span>
          <div className="space-y-1">
            {volume.muscleVolume.map((item) => (
              <div key={item.muscleGroupId} className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-white truncate">{muscleGroupShortLabel(item.muscleGroupId)}</span>
                <span className="text-[10px] text-gym-text-muted font-mono whitespace-nowrap">
                  {item.directSets} diretas
                  {item.secondaryExposure > 0 && ` · +${item.secondaryExposure} sinergista`}
                  {` · ${item.weightedSets} pond.`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {volume.unclassifiedSets > 0 && (
        <p className="text-[10px] text-amber-400">
          {volume.unclassifiedSets} série(s) sem classificação muscular — não foram atribuídas a nenhum grupo.
        </p>
      )}

      {!empty && volume.warnings.length > 0 && (
        <div className="pt-2 border-t border-white/5 space-y-1">
          {volume.warnings.map((warning) => (
            <p key={warning} className="text-[10px] text-amber-400 flex items-start gap-1.5 leading-relaxed">
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              {warning}
            </p>
          ))}
        </div>
      )}

      {empty && (
        <p className="text-[10px] text-gym-text-muted">
          Adicione exercícios para ver a estimativa deste dia.
        </p>
      )}
    </div>
  );
};
