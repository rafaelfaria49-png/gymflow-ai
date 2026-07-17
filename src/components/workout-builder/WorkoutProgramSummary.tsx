'use client';

import React from 'react';
import { AlertTriangle, BarChart3 } from 'lucide-react';
import type { Exercise } from '../../types';
import type { TrainingProfileSource } from '../../types/training-profile';
import type { TrainingVolumeLevel, VolumeConfidence } from '../../types/training-volume';
import type { WorkoutProgramBuilderDraft } from '../../types/workout-builder';
import { summarizeProgramVolume } from '../../lib/workout-builder';

const CONFIDENCE_LABEL: Record<VolumeConfidence, string> = {
  high: 'Confiança alta',
  medium: 'Confiança média',
  low: 'Confiança baixa',
};

const LEVEL_LABEL: Record<TrainingVolumeLevel, string> = {
  low: 'abaixo',
  moderate: 'na faixa',
  high: 'no topo',
  very_high: 'acima',
};

const LEVEL_CLASS: Record<TrainingVolumeLevel, string> = {
  low: 'text-amber-400',
  moderate: 'text-gym-emerald',
  high: 'text-gym-accent',
  very_high: 'text-amber-400',
};

interface WorkoutProgramSummaryProps {
  draft: WorkoutProgramBuilderDraft;
  exercises: readonly Exercise[];
  profile: Pick<TrainingProfileSource, 'level' | 'trainingStatus' | 'returnToTraining' | 'goal'>;
  profileFrequency?: number;
  totalMinutesByDay: readonly number[];
}

/**
 * GOAL-19A: "Análise do programa" (PART 13).
 *
 * Deliberadamente NÃO se chama IA nem "otimizado": não existe otimização aqui.
 * É leitura de números — soma semanal por grupo comparada com a referência do perfil.
 * Todo aviso é textual; nada é aplicado automaticamente.
 */
export const WorkoutProgramSummary = ({
  draft,
  exercises,
  profile,
  profileFrequency,
  totalMinutesByDay,
}: WorkoutProgramSummaryProps) => {
  const summary = summarizeProgramVolume(draft, exercises, profile);
  const hasVolume = summary.comparisons.length > 0;

  return (
    <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-gym-accent" /> Análise do programa
        </h3>
        <span className="text-[9px] font-bold uppercase text-gym-text-muted flex-shrink-0">
          {CONFIDENCE_LABEL[summary.confidence]}
        </span>
      </div>

      {/* CABEÇALHO */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-white/5 rounded-xl p-2.5">
          <span className="block text-[9px] text-gym-text-muted uppercase">Dias</span>
          <span className="block text-sm font-extrabold text-white">{draft.days.length}</span>
        </div>
        <div className="bg-white/5 rounded-xl p-2.5">
          <span className="block text-[9px] text-gym-text-muted uppercase">Séries/semana</span>
          <span className="block text-sm font-extrabold text-white">{summary.totalWorkingSets}</span>
        </div>
        <div className="bg-white/5 rounded-xl p-2.5">
          <span className="block text-[9px] text-gym-text-muted uppercase">Nível</span>
          <span className="block text-[11px] font-extrabold text-white capitalize truncate">{draft.level}</span>
        </div>
        <div className="bg-white/5 rounded-xl p-2.5">
          <span className="block text-[9px] text-gym-text-muted uppercase">Duração/dia</span>
          <span className="block text-[11px] font-extrabold text-white truncate">
            {totalMinutesByDay.length > 0 ? `${Math.min(...totalMinutesByDay)}–${Math.max(...totalMinutesByDay)} min` : '—'}
          </span>
        </div>
      </div>

      {typeof profileFrequency === 'number' && profileFrequency > 0 && (
        <p className="text-[10px] text-gym-text-muted leading-relaxed">
          Seu perfil indica {profileFrequency} {profileFrequency === 1 ? 'dia' : 'dias'} por semana. Este programa tem{' '}
          {draft.days.length} {draft.days.length === 1 ? 'dia' : 'dias'} — a distribuição na semana é escolhida no Planejador.
        </p>
      )}

      {/* VOLUME SEMANAL POR GRUPO */}
      {hasVolume ? (
        <div>
          <span className="block text-[9px] font-bold uppercase text-gym-text-muted mb-1.5">
            Volume semanal por grupo
          </span>
          <div className="space-y-1">
            {summary.comparisons.map((item) => (
              <div key={item.muscleGroupId} className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-white truncate min-w-0">{item.label}</span>
                <span className="text-[10px] font-mono text-gym-text-muted whitespace-nowrap flex-shrink-0">
                  {item.directSets} diretas
                  {item.secondaryExposure > 0 && ` +${item.secondaryExposure} sin.`}
                  {' = '}
                  <span className="text-white">{item.weightedSets}</span>
                  {item.reference
                    ? (
                      <>
                        {' / '}
                        {item.reference.minimum}–{item.reference.upperReference}{' '}
                        <span className={item.level ? LEVEL_CLASS[item.level] : ''}>
                          {item.level ? LEVEL_LABEL[item.level] : ''}
                        </span>
                      </>
                    )
                    : ' · por tempo'}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-gym-text-muted mt-2 leading-relaxed">
            Sinergistas contam com peso 0,5 e ficam separados das séries diretas. A faixa é uma referência
            inicial do perfil, não um limite.
          </p>
        </div>
      ) : (
        <p className="text-[10px] text-gym-text-muted">
          Adicione exercícios aos dias para ver o volume semanal.
        </p>
      )}

      {/* AVISOS — sempre textuais */}
      {summary.warnings.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-white/5">
          {summary.warnings.map((warning) => (
            <p key={warning} className="text-[10px] text-amber-400 flex items-start gap-1.5 leading-relaxed">
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              {warning}
            </p>
          ))}
          <p className="text-[9px] text-gym-text-muted pt-1">
            Estes avisos são informativos: nada é alterado no seu treino automaticamente.
          </p>
        </div>
      )}
    </div>
  );
};
