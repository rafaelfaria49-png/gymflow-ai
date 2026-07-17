'use client';

import React, { useEffect } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import type { WorkoutProgramTemplate } from '../../types/workout-templates';
import {
  evaluateTemplateCompatibility,
  type TemplateCompatibilityProfile,
} from '../../lib/workout-templates';

interface WorkoutTemplatePickerProps {
  templates: readonly WorkoutProgramTemplate[];
  profile: TemplateCompatibilityProfile;
  onPreview: (templateId: string) => void;
  onBack: () => void;
}

/**
 * GOAL-19B/PART-2+4: seletor de templates. As indicações (recomendado, retorno, mais/
 * menos dias que a frequência) são INFORMATIVAS — nenhuma bloqueia a escolha e não há
 * ranking de "melhor template". Selecionar leva à prévia; nada é criado ainda.
 */
export const WorkoutTemplatePicker = ({
  templates,
  profile,
  onPreview,
  onBack,
}: WorkoutTemplatePickerProps) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  return (
    <div className="space-y-3 max-w-md mx-auto">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-white tap-target"
          aria-label="Voltar aos modos de criação"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white">Escolha um template</h2>
          <p className="text-[11px] text-gym-text-muted">Estruturas prontas e editáveis — sem exercícios.</p>
        </div>
      </div>

      <ul className="space-y-2.5" role="list">
        {templates.map((template) => {
          const compatibility = evaluateTemplateCompatibility(template, profile);
          return (
            <li key={template.id}>
              <button
                onClick={() => onPreview(template.id)}
                className="w-full text-left glass hover:border-gym-accent/30 rounded-2xl p-4 transition-all group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white">{template.name}</h3>
                    <p className="text-[11px] text-gym-text-muted leading-relaxed mt-0.5 line-clamp-2">
                      {template.description}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gym-text-muted group-hover:text-gym-accent flex-shrink-0 mt-0.5" />
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  <span className="text-[9px] font-black uppercase tracking-wider bg-white/5 border border-white/10 text-gym-text-muted px-2 py-0.5 rounded-full">
                    {template.days.length} {template.days.length === 1 ? 'dia' : 'dias'}
                  </span>
                  {compatibility.recommendedForFrequency && (
                    <span className="text-[9px] font-black uppercase tracking-wider bg-gym-accent/15 border border-gym-accent/25 text-gym-accent px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Recomendado
                    </span>
                  )}
                  {compatibility.suitableForReturn && (
                    <span className="text-[9px] font-black uppercase tracking-wider bg-white/5 border border-white/10 text-gym-emerald px-2 py-0.5 rounded-full flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" /> Para retorno
                    </span>
                  )}
                </div>

                {(compatibility.moreDaysThanFrequency || compatibility.fewerDaysThanFrequency) && (
                  <p className="text-[10px] text-gym-text-muted leading-relaxed mt-2">{compatibility.note}</p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
