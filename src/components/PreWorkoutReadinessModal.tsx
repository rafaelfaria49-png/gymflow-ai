'use client';

import React, { useState } from 'react';
import {
  Activity,
  BatteryCharging,
  Moon,
  ShieldAlert,
  Zap,
  Clock,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Sliders,
  AlertTriangle,
  X,
} from 'lucide-react';
import type {
  ProgramDayInfo,
  ReadinessAnswers,
  ReadinessAssessment,
  ReadinessEnergy,
  ReadinessSleep,
  ReadinessSoreness,
  ReadinessStress,
  ReadinessSuggestion,
  ReadinessTime,
} from '../domain/readinessEngine';
import { evaluateReadiness } from '../domain/readinessEngine';
import type { WorkoutSession, Exercise } from '../types';

export interface PreWorkoutReadinessModalProps {
  isOpen: boolean;
  session: WorkoutSession;
  catalog?: readonly Exercise[];
  availableProgramDays?: readonly ProgramDayInfo[];
  dismissedSuggestionIds?: readonly string[];
  onComplete: (assessment: ReadinessAssessment) => void;
  onSkip: () => void;
  onApplySuggestion: (suggestion: ReadinessSuggestion) => void;
  onDismissSuggestion: (suggestionId: string) => void;
}

const MUSCLE_LOCATIONS = [
  'Peito',
  'Costas',
  'Ombros',
  'Pernas',
  'Braços',
  'Lombar',
  'Articulações',
];

export function PreWorkoutReadinessModal({
  isOpen,
  session,
  catalog,
  availableProgramDays,
  dismissedSuggestionIds = [],
  onComplete,
  onSkip,
  onApplySuggestion,
  onDismissSuggestion,
}: PreWorkoutReadinessModalProps) {
  // Estado dos 5 toques
  const [energy, setEnergy] = useState<ReadinessEnergy>('medium');
  const [sleep, setSleep] = useState<ReadinessSleep>('fair');
  const [soreness, setSoreness] = useState<ReadinessSoreness>('none');
  const [sorenessLocation, setSorenessLocation] = useState<string>('Peito');
  const [stress, setStress] = useState<ReadinessStress>('low');
  const [timeAvailable, setTimeAvailable] = useState<ReadinessTime>('normal');

  // Estado de avaliação
  const [evaluation, setEvaluation] = useState<ReadinessAssessment | null>(null);

  if (!isOpen) return null;

  const currentAnswers: ReadinessAnswers = {
    energy,
    sleep,
    soreness,
    sorenessLocation: soreness !== 'none' ? sorenessLocation : undefined,
    stress,
    timeAvailable,
    timeAvailableMinutes:
      timeAvailable === 'short' ? 30 : timeAvailable === 'normal' ? session.plannedDuration ?? 50 : 75,
  };

  const handleEvaluate = () => {
    const result = evaluateReadiness(currentAnswers, {
      session,
      catalog,
      availableProgramDays,
    });
    setEvaluation(result);
    // Se tudo ok (sem sugestões ativas), conclui imediatamente sem tela intermediária invasiva
    if (result.status === 'all-good' || result.suggestions.length === 0) {
      onComplete(result);
    }
  };

  const handleProceedWithCurrent = () => {
    if (evaluation) {
      onComplete(evaluation);
    } else {
      const result = evaluateReadiness(currentAnswers, {
        session,
        catalog,
        availableProgramDays,
      });
      onComplete(result);
    }
  };

  // Filtra sugestões já recusadas para não insistir na mesma sessão (PROG §6)
  const activeSuggestions = (evaluation?.suggestions ?? []).filter(
    (s) => !dismissedSuggestionIds.includes(s.id),
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Check-in de Prontidão Diária"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg bg-gym-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gym-accent/15 border border-gym-accent/30 flex items-center justify-center text-gym-accent">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">Check-in de Prontidão</h3>
              <p className="text-[11px] text-gym-text-muted leading-none mt-0.5">
                {session.name} • Adaptação diária inteligente
              </p>
            </div>
          </div>

          {/* Botão de Skip de 1 toque (PROG §6) */}
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-gym-text-muted hover:text-white px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-all flex items-center gap-1 font-medium active:scale-95"
          >
            <span>Pular</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {!evaluation ? (
            <>
              <p className="text-gym-text-muted text-[11px]">
                5 toques rápidos para ajustar carga, volume ou descanso de hoje conforme sua recuperação.
              </p>

              {/* 1. Energia */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-white/90 flex items-center gap-1.5">
                  <BatteryCharging className="w-3.5 h-3.5 text-gym-accent" />
                  <span>1. Nível de Energia</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'low', label: 'Baixa', emoji: '🪫', desc: 'Cansaço/Lento' },
                      { id: 'medium', label: 'Normal', emoji: '⚡', desc: 'Pronto p/ treinar' },
                      { id: 'high', label: 'Alta', emoji: '🔥', desc: '100% disposto' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setEnergy(opt.id)}
                      className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center min-h-[44px] ${
                        energy === opt.id
                          ? 'bg-gym-accent/15 border-gym-accent text-white font-bold'
                          : 'bg-white/5 border-white/10 text-gym-text-muted hover:bg-white/10'
                      }`}
                    >
                      <span className="text-base leading-none mb-1">{opt.emoji}</span>
                      <span className="text-[11px] leading-none">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Sono */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-white/90 flex items-center gap-1.5">
                  <Moon className="w-3.5 h-3.5 text-gym-cyan" />
                  <span>2. Qualidade do Sono</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'poor', label: 'Ruim', emoji: '🥱', desc: '< 6h ou picado' },
                      { id: 'fair', label: 'Regular', emoji: '😐', desc: 'Ok, deu pro gasto' },
                      { id: 'good', label: 'Ótimo', emoji: '😴', desc: 'Repouso profundo' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSleep(opt.id)}
                      className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center min-h-[44px] ${
                        sleep === opt.id
                          ? 'bg-gym-cyan/15 border-gym-cyan text-white font-bold'
                          : 'bg-white/5 border-white/10 text-gym-text-muted hover:bg-white/10'
                      }`}
                    >
                      <span className="text-base leading-none mb-1">{opt.emoji}</span>
                      <span className="text-[11px] leading-none">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Dor Muscular ou Articular */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-white/90 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-gym-amber" />
                  <span>3. Dor ou Desconforto</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'none', label: 'Nenhuma', emoji: '🛡️' },
                      { id: 'mild', label: 'Leve', emoji: '🩹' },
                      { id: 'severe', label: 'Forte', emoji: '⚠️' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSoreness(opt.id)}
                      className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center min-h-[44px] ${
                        soreness === opt.id
                          ? opt.id === 'severe'
                            ? 'bg-gym-coral/20 border-gym-coral text-white font-bold'
                            : 'bg-gym-amber/20 border-gym-amber text-white font-bold'
                          : 'bg-white/5 border-white/10 text-gym-text-muted hover:bg-white/10'
                      }`}
                    >
                      <span className="text-base leading-none mb-1">{opt.emoji}</span>
                      <span className="text-[11px] leading-none">{opt.label}</span>
                    </button>
                  ))}
                </div>

                {soreness !== 'none' && (
                  <div className="pt-2">
                    <span className="text-[10px] text-gym-text-muted block mb-1">
                      Onde é o desconforto principal?
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {MUSCLE_LOCATIONS.map((loc) => (
                        <button
                          key={loc}
                          type="button"
                          onClick={() => setSorenessLocation(loc)}
                          className={`px-2 py-1 rounded-lg text-[10px] border transition-all ${
                            sorenessLocation === loc
                              ? 'bg-gym-amber/20 border-gym-amber text-white font-bold'
                              : 'bg-white/5 border-white/10 text-gym-text-muted hover:bg-white/10'
                          }`}
                        >
                          {loc}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Estresse Mental */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-white/90 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-gym-purple" />
                  <span>4. Nível de Estresse</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'low', label: 'Baixo', emoji: '🧘' },
                      { id: 'medium', label: 'Médio', emoji: '⚖️' },
                      { id: 'high', label: 'Alto', emoji: '🤯' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setStress(opt.id)}
                      className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center min-h-[44px] ${
                        stress === opt.id
                          ? 'bg-gym-purple/20 border-gym-purple text-white font-bold'
                          : 'bg-white/5 border-white/10 text-gym-text-muted hover:bg-white/10'
                      }`}
                    >
                      <span className="text-base leading-none mb-1">{opt.emoji}</span>
                      <span className="text-[11px] leading-none">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Tempo Disponível */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-white/90 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-gym-accent" />
                  <span>5. Tempo Disponível</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'short', label: 'Curto', emoji: '⏱️', desc: '≤ 30 min' },
                      { id: 'normal', label: 'Normal', emoji: '🎯', desc: `${session.plannedDuration ?? 50} min` },
                      { id: 'plenty', label: 'Livre', emoji: '⏳', desc: 'Sem pressa' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTimeAvailable(opt.id)}
                      className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center min-h-[44px] ${
                        timeAvailable === opt.id
                          ? 'bg-gym-accent/15 border-gym-accent text-white font-bold'
                          : 'bg-white/5 border-white/10 text-gym-text-muted hover:bg-white/10'
                      }`}
                    >
                      <span className="text-base leading-none mb-1">{opt.emoji}</span>
                      <span className="text-[11px] leading-none">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* Tela de Sugestões Explicadas (quando há recomendações) */
            <div className="space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                      evaluation.level === 'optimal'
                        ? 'bg-gym-accent/20 text-gym-accent border border-gym-accent/40'
                        : evaluation.level === 'moderate'
                          ? 'bg-gym-amber/20 text-gym-amber border border-gym-amber/40'
                          : 'bg-gym-coral/20 text-gym-coral border border-gym-coral/40'
                    }`}
                  >
                    {evaluation.score}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      Prontidão {evaluation.level === 'optimal' ? 'Ótima' : evaluation.level === 'moderate' ? 'Moderada' : 'Baixa'}
                    </h4>
                    <p className="text-[10px] text-gym-text-muted">
                      {activeSuggestions.length > 0
                        ? `${activeSuggestions.length} sugestão(ões) explicada(s) para o seu treino:`
                        : 'Condições favoráveis para treinar conforme planejado.'}
                    </p>
                  </div>
                </div>
              </div>

              {activeSuggestions.length > 0 ? (
                <div className="space-y-2.5">
                  {activeSuggestions.map((sugg) => (
                    <div
                      key={sugg.id}
                      className="p-3.5 rounded-xl bg-gym-card/80 border border-white/10 space-y-2.5 hover:border-gym-accent/30 transition-all shadow-sm"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="p-1.5 rounded-lg bg-gym-accent/15 text-gym-accent flex-shrink-0 mt-0.5">
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1">
                          <h5 className="text-xs font-bold text-white">{sugg.title}</h5>
                          <p className="text-[11px] text-gym-text-muted mt-1 leading-relaxed">
                            {sugg.reason}
                          </p>
                        </div>
                      </div>

                      {/* Ações de 1 toque */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            onApplySuggestion(sugg);
                            handleProceedWithCurrent();
                          }}
                          className="flex-1 min-h-[44px] bg-gym-accent text-black font-bold py-2 px-3 rounded-xl hover:bg-gym-accent/90 transition-all text-center text-xs flex items-center justify-center gap-1 active:scale-98 shadow-sm"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{sugg.actionLabel}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDismissSuggestion(sugg.id)}
                          className="min-h-[44px] px-3 py-2 rounded-xl border border-white/10 text-gym-text-muted hover:text-white hover:bg-white/5 transition-all text-xs font-medium"
                        >
                          {sugg.dismissLabel}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-gym-accent/10 border border-gym-accent/20 text-center space-y-1.5">
                  <CheckCircle2 className="w-6 h-6 text-gym-accent mx-auto" />
                  <p className="text-xs font-bold text-white">Nenhuma adaptação necessária!</p>
                  <p className="text-[11px] text-gym-text-muted">
                    Todas as sugestões foram dispensadas ou seus indicadores estão equilibrados.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center gap-2.5">
          {!evaluation ? (
            <>
              <button
                type="button"
                onClick={onSkip}
                className="w-1/3 min-h-[44px] py-2.5 px-3 rounded-xl border border-white/10 text-gym-text-muted hover:text-white hover:bg-white/5 text-center text-xs font-semibold transition-all active:scale-98"
              >
                Pular
              </button>
              <button
                type="button"
                onClick={handleEvaluate}
                className="w-2/3 min-h-[44px] py-2.5 px-4 rounded-xl bg-gym-accent text-black font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-gym-accent/90 transition-all active:scale-98 shadow-md"
              >
                <span>Concluir Check-in</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleProceedWithCurrent}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-gym-accent text-black font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-gym-accent/90 transition-all active:scale-98 shadow-md"
            >
              <span>Iniciar Treino</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
