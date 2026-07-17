'use client';

import React, { useEffect } from 'react';
import { Clock, Info, Layers, RotateCcw } from 'lucide-react';
import type { WorkoutProgramTemplate } from '../../types/workout-templates';
import {
  TEMPLATE_NO_EXERCISES_NOTICE,
  evaluateTemplateCompatibility,
  getTemplateDayFocusLabels,
  getTemplateDayName,
  type TemplateCompatibilityProfile,
} from '../../lib/workout-templates';
import { adjustVolumeProfileForReturn } from '../../lib/workout-guided-creation';
import { clampTargetMinutes } from '../../lib/workout-builder';
import { defaultTargetMinutes, getVolumeProfile } from '../../lib/volumeProfiles';

interface WorkoutTemplatePreviewProps {
  template: WorkoutProgramTemplate;
  profile: TemplateCompatibilityProfile;
  /** Duração de sessão do perfil; alimenta a duração alvo exibida por dia. */
  sessionMinutes?: number;
  onUse: () => void;
  onBack: () => void;
  onCancel: () => void;
}

/**
 * GOAL-19B/PART-5: prévia do template antes de aplicar. Mostra nome, descrição, número
 * de dias, frequência sugerida, compatibilidade, a lista de dias (foco + duração alvo +
 * volume) e a garantia de que NENHUM exercício será adicionado. Nada é salvo aqui.
 */
export const WorkoutTemplatePreview = ({
  template,
  profile,
  sessionMinutes,
  onUse,
  onBack,
  onCancel,
}: WorkoutTemplatePreviewProps) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  const compatibility = evaluateTemplateCompatibility(template, profile);
  const hasSessionMinutes = Number.isFinite(sessionMinutes) && (sessionMinutes as number) > 0;

  const days = template.days.map((day, index) => {
    const volumeProfile = adjustVolumeProfileForReturn(day.volumeProfile ?? 'standard', {
      level: profile.level,
      trainingStatus: profile.trainingStatus,
    });
    const targetMinutes = Number.isFinite(day.targetMinutes) && (day.targetMinutes as number) > 0
      ? clampTargetMinutes(day.targetMinutes as number)
      : hasSessionMinutes
        ? clampTargetMinutes(sessionMinutes as number)
        : clampTargetMinutes(defaultTargetMinutes(volumeProfile));
    return {
      key: `${template.id}-${index}`,
      dayNumber: index + 1,
      name: getTemplateDayName(day),
      focusLabels: getTemplateDayFocusLabels(day),
      volumeLabel: getVolumeProfile(volumeProfile).label,
      targetMinutes,
    };
  });

  const extraDisclaimer = template.disclaimer !== TEMPLATE_NO_EXERCISES_NOTICE ? template.disclaimer : null;

  return (
    <div className="space-y-4 max-w-md mx-auto pb-4">
      <div className="min-w-0">
        <span className="text-[10px] font-extrabold text-gym-accent uppercase tracking-widest">Prévia do template</span>
        <h2 className="text-lg font-black text-white tracking-tight mt-0.5">{template.name}</h2>
        <p className="text-[11px] text-gym-text-muted leading-relaxed mt-1">{template.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white/5 rounded-xl p-2.5">
          <span className="block text-[9px] text-gym-text-muted uppercase">Dias</span>
          <span className="block text-sm font-extrabold text-white">{template.days.length}</span>
        </div>
        <div className="bg-white/5 rounded-xl p-2.5">
          <span className="block text-[9px] text-gym-text-muted uppercase">Frequência sugerida</span>
          <span className="block text-sm font-extrabold text-white">
            {template.recommendedFrequencies.join(', ')}x
          </span>
        </div>
      </div>

      <p className="text-[10px] text-gym-text-muted leading-relaxed flex items-start gap-1.5">
        {compatibility.suitableForReturn && <RotateCcw className="w-3 h-3 text-gym-emerald flex-shrink-0 mt-0.5" />}
        {compatibility.note}
      </p>

      {/* LISTA DE DIAS */}
      <div className="space-y-2">
        <span className="block text-[9px] font-bold uppercase text-gym-text-muted">Estrutura dos dias</span>
        {days.map((day) => (
          <div key={day.key} className="bg-gym-card/60 border border-white/5 rounded-2xl p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="block text-[9px] font-black uppercase tracking-wider text-gym-accent">
                  Dia {day.dayNumber}
                </span>
                <span className="block text-xs font-bold text-white truncate">{day.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 text-gym-text-muted">
                <span className="text-[10px] flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {day.targetMinutes} min
                </span>
                <span className="text-[10px] flex items-center gap-1">
                  <Layers className="w-3 h-3" /> {day.volumeLabel}
                </span>
              </div>
            </div>
            {day.focusLabels.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {day.focusLabels.map((label) => (
                  <span key={label} className="text-[9px] bg-white/5 border border-white/10 text-gym-text-muted px-2 py-0.5 rounded-full">
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* GARANTIA — sempre visível (PART 5) */}
      <div className="glass-accent rounded-2xl p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-gym-accent flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-white leading-relaxed">{TEMPLATE_NO_EXERCISES_NOTICE}</p>
      </div>

      {extraDisclaimer && (
        <p className="text-[10px] text-gym-text-muted leading-relaxed px-1">{extraDisclaimer}</p>
      )}

      {/* AÇÕES */}
      <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
        <button
          onClick={onUse}
          className="flex-1 min-h-[48px] py-3 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-2xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-gym-accent/15"
        >
          Usar este template
        </button>
        <button
          onClick={onBack}
          className="min-h-[48px] py-3 px-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-2xl text-xs transition-all"
        >
          Voltar
        </button>
        <button
          onClick={onCancel}
          className="min-h-[48px] py-3 px-5 text-[11px] font-bold text-gym-text-muted hover:text-white transition-all"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
};
