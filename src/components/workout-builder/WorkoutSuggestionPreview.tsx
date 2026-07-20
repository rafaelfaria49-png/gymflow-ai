'use client';

import React from 'react';
import { AlertTriangle, Check, Info, Sparkles, X } from 'lucide-react';
import type { ExerciseMechanics } from '../../types/training-taxonomy';
import type { WorkoutDayBuilderDraft } from '../../types/workout-builder';
import { dayDisplayName } from '../../lib/workout-builder';
import type { WorkoutSuggestionPreview as SuggestionPreview } from '../../lib/workout-suggestion';

interface WorkoutSuggestionPreviewProps {
  isOpen: boolean;
  day: WorkoutDayBuilderDraft;
  preview: SuggestionPreview | null;
  onApply: () => void;
  onCancel: () => void;
}

const MECHANICS_LABEL: Record<ExerciseMechanics, string> = {
  compound: 'Composto',
  isolation: 'Isolado',
  functional: 'Funcional',
  cardio: 'Cardio',
  mobility: 'Mobilidade',
};

const TIME_FIT_TONE: Record<string, string> = {
  'within-target': 'text-gym-accent',
  'under-target': 'text-amber-300',
  'over-target': 'text-gym-rose',
  empty: 'text-gym-text-muted',
};

/**
 * GOAL-20: preview da sugestão assistida determinística.
 *
 * Só apresenta o que SERIA adicionado — Cancelar descarta, Aplicar acrescenta os slots.
 * Nenhum texto menciona "IA"; nenhum diálogo nativo é usado.
 */
export const WorkoutSuggestionPreview = ({
  isOpen,
  day,
  preview,
  onApply,
  onCancel,
}: WorkoutSuggestionPreviewProps) => {
  if (!isOpen || !preview) return null;

  const hasAdditions = preview.additions.length > 0;
  const distribution = preview.distribution.filter((entry) => entry.added > 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="suggestion-preview-title"
        onClick={(event) => event.stopPropagation()}
        className="bg-gym-dark border border-white/10 rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden min-w-0"
      >
        {/* CABEÇALHO */}
        <div className="p-5 border-b border-white/5 flex items-start justify-between gap-2 flex-shrink-0">
          <div className="min-w-0">
            <h3 id="suggestion-preview-title" className="text-sm font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-gym-accent flex-shrink-0" />
              Sugestão para o Dia {day.dayNumber}
            </h3>
            <p className="text-[10px] text-gym-text-muted truncate">{dayDisplayName(day)}</p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-gym-text-muted hover:text-white bg-white/5 rounded-lg tap-target flex-shrink-0"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CORPO */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-w-0">
          {/* JUSTIFICATIVA */}
          <div className="space-y-1.5">
            {preview.rationale.map((line, index) => (
              <p key={index} className="text-[11px] text-gym-text-muted leading-relaxed break-words">
                {line}
              </p>
            ))}
          </div>

          {/* DISTRIBUIÇÃO */}
          {distribution.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {distribution.map((entry) => (
                <span
                  key={entry.muscleGroupId}
                  className="rounded-full bg-gym-accent/10 border border-gym-accent/25 px-2.5 py-1 text-[10px] font-bold text-gym-accent"
                >
                  {entry.label} ×{entry.added}
                </span>
              ))}
            </div>
          )}

          {/* ESTIMATIVA ANTES → DEPOIS */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase text-gym-text-muted">Estimativa</span>
            <span className="text-xs font-bold text-white">
              {preview.estimateBefore.totalMinutes} min
              <span className="text-gym-text-muted"> → </span>
              <span className={TIME_FIT_TONE[preview.timeFitAfter.status] ?? 'text-white'}>
                {preview.estimateAfter.totalMinutes} min
              </span>
              <span className="text-gym-text-muted"> / {preview.targetMinutes} min</span>
            </span>
          </div>

          {/* LISTA DE ADIÇÕES */}
          {hasAdditions ? (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-white">
                Serão adicionados {preview.additions.length}{' '}
                {preview.additions.length === 1 ? 'exercício' : 'exercícios'}
              </h4>
              {preview.additions.map((addition, index) => (
                <div
                  key={`${addition.exercise.id}_${index}`}
                  className="bg-gym-card/60 border border-white/5 rounded-2xl p-3 flex items-start justify-between gap-2 min-w-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-gym-accent font-bold">#{index + 1}</span>
                      <h5 className="text-xs font-bold text-white truncate">{addition.exercise.name}</h5>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      <span className="text-[9px] font-bold uppercase bg-white/5 text-gym-text-muted px-1.5 py-0.5 rounded-full">
                        {MECHANICS_LABEL[addition.mechanics]}
                      </span>
                      {addition.legacyClassification && (
                        <span className="text-[9px] font-bold uppercase bg-amber-400/10 text-amber-300 px-1.5 py-0.5 rounded-full">
                          Classif. legada
                        </span>
                      )}
                      <span className="text-[9px] text-gym-text-muted">
                        {addition.slot.series}× {addition.slot.repRange[0]}–{addition.slot.repRange[1]} reps · {addition.slot.restSec}s
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white/5 border border-dashed border-white/10 rounded-2xl p-5 text-center space-y-2 flex flex-col items-center">
              <Info className="w-6 h-6 text-gym-text-muted opacity-50" />
              <p className="text-xs text-gym-text-muted max-w-xs">
                {preview.alreadyFits
                  ? 'Este dia já cabe no tempo disponível — nada será adicionado.'
                  : 'Nenhum exercício foi sugerido para os focos e filtros atuais.'}
              </p>
            </div>
          )}

          {/* AVISOS */}
          {preview.warnings.length > 0 && (
            <div className="space-y-1.5">
              {preview.warnings.map((warning) => (
                <p
                  key={warning.code}
                  className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-2.5 text-[10px] leading-relaxed text-amber-300 flex items-start gap-1.5 break-words"
                >
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span className="min-w-0">{warning.message}</span>
                </p>
              ))}
            </div>
          )}
        </div>

        {/* AÇÕES */}
        <div className="p-3 border-t border-white/5 flex gap-2 flex-shrink-0">
          <button
            onClick={onCancel}
            className="flex-1 min-h-[44px] bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-xs"
          >
            Cancelar
          </button>
          <button
            onClick={onApply}
            disabled={!hasAdditions}
            className="flex-1 min-h-[44px] bg-gym-accent hover:bg-gym-accent-hover disabled:opacity-40 disabled:hover:bg-gym-accent text-gym-dark font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            {hasAdditions ? `Aplicar (${preview.additions.length})` : 'Nada a aplicar'}
          </button>
        </div>
      </div>
    </div>
  );
};
