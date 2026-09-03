'use client';

import React, { useState } from 'react';
import {
  ArrowDown,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Flame,
  Info,
  Layers,
  RefreshCw,
  Scale,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import type { ActiveExercise } from '../types';
import type {
  ProgressionAction,
  ProgressionDecision,
  ProgressionParameterAdjustment,
} from '../domain/progressionEngine';

export interface WhyThisWeightModalProps {
  exercise: ActiveExercise;
  isOpen: boolean;
  onClose: () => void;
  onApplyWeightToAllSets?: (weightKg: number) => void;
  adjustmentInfo?: ProgressionParameterAdjustment | null;
}

function actionBadge(action: ProgressionAction | undefined) {
  switch (action) {
    case 'progress':
      return {
        label: 'Subir Carga',
        icon: TrendingUp,
        classes: 'border-gym-emerald/40 bg-gym-emerald/15 text-gym-emerald',
      };
    case 'reduce':
      return {
        label: 'Redução Técnica (−10%)',
        icon: ArrowDown,
        classes: 'border-amber-400/40 bg-amber-400/15 text-amber-400',
      };
    case 'return-ramp':
      return {
        label: 'Rampa de Retorno',
        icon: ShieldAlert,
        classes: 'border-purple-400/40 bg-purple-400/15 text-purple-300',
      };
    case 'variation':
      return {
        label: 'Platô: Variação',
        icon: RefreshCw,
        classes: 'border-orange-400/40 bg-orange-400/15 text-orange-300',
      };
    case 'back-off':
      return {
        label: 'Platô: Back-off (−10%)',
        icon: ArrowDown,
        classes: 'border-amber-400/40 bg-amber-400/15 text-amber-300',
      };
    case 'deload':
      return {
        label: 'Platô: Deload (−15%)',
        icon: Flame,
        classes: 'border-rose-400/40 bg-rose-400/15 text-rose-300',
      };
    case 'series-progress':
      return {
        label: 'Progressão por Séries',
        icon: Layers,
        classes: 'border-gym-emerald/40 bg-gym-emerald/15 text-gym-emerald',
      };
    case 'series-hold':
      return {
        label: 'Consolidar Séries',
        icon: CheckCircle2,
        classes: 'border-cyan-400/40 bg-cyan-400/15 text-cyan-300',
      };
    case 'disabled':
      return {
        label: 'Progressão Desativada',
        icon: Info,
        classes: 'border-white/20 bg-white/5 text-gym-text-muted',
      };
    case 'start':
      return {
        label: 'Sem Histórico Prévio',
        icon: Sparkles,
        classes: 'border-cyan-400/40 bg-cyan-400/15 text-cyan-300',
      };
    case 'hold':
    default:
      return {
        label: 'Consolidar Repetições',
        icon: CheckCircle2,
        classes: 'border-blue-400/40 bg-blue-400/15 text-blue-300',
      };
  }
}

export function WhyThisWeightModal({
  exercise,
  isOpen,
  onClose,
  onApplyWeightToAllSets,
  adjustmentInfo,
}: WhyThisWeightModalProps) {
  const decision: ProgressionDecision | undefined = exercise.progressionDecision;
  const comparison = exercise.progressionComparison;

  const currentWeight = decision?.pesoKg ?? exercise.sets.find((s) => !s.isWarmup)?.weight ?? 0;
  const [overrideInput, setOverrideInput] = useState<string>(currentWeight ? String(currentWeight) : '');
  const [appliedNotification, setAppliedNotification] = useState<string | null>(null);

  if (!isOpen) return null;

  const badge = actionBadge(decision?.action);
  const BadgeIcon = badge.icon;

  const handleApplyWeight = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(overrideInput.replace(',', '.'));
    if (!Number.isNaN(val) && val >= 0) {
      onApplyWeightToAllSets?.(val);
      setAppliedNotification(`Carga de ${val} kg aplicada às séries deste exercício.`);
      setTimeout(() => setAppliedNotification(null), 3000);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="why-this-weight-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-gym-card/95 p-6 shadow-2xl backdrop-blur-xl text-left text-white space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-gym-accent/40 bg-gym-accent/10 text-gym-accent shadow-inner">
              <Scale className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-gym-accent">
                Cálculo de Carga · GymFlow AI
              </span>
              <h2 id="why-this-weight-title" className="text-base font-black leading-tight text-white">
                Por que esse peso?
              </h2>
              <p className="text-[11px] text-gym-text-muted mt-0.5">
                {exercise.name} • {exercise.muscleGroup}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar explicação de carga"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gym-text-muted hover:border-white/20 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Sugestão em Destaque */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">
                {decision?.pesoKg !== null && decision?.pesoKg !== undefined
                  ? `${decision.pesoKg} kg`
                  : 'Sem carga'}
              </span>
              <span className="text-xs text-gym-text-muted">
                {decision?.repsAlvo !== null && decision?.repsAlvo !== undefined
                  ? `para ${decision.repsAlvo} reps`
                  : exercise.repRange
                    ? `para ${exercise.repRange[0]}–${exercise.repRange[1]} reps`
                    : ''}
              </span>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-bold ${badge.classes}`}
            >
              <BadgeIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {badge.label}
            </span>
          </div>

          {/* Motivo Explicativo Honesto */}
          <div className="rounded-xl border border-gym-accent/20 bg-gym-accent/[0.05] p-3">
            <p className="text-xs font-semibold leading-relaxed text-gym-accent-light">
              {decision?.reasonText || exercise.progressionNote || 'Aguardando registro de dados para gerar recomendação.'}
            </p>
            {decision?.reasonCode && (
              <span className="mt-1.5 inline-block text-[9px] font-mono uppercase tracking-wider text-gym-text-muted">
                regra: {decision.reasonCode}
              </span>
            )}
          </div>
        </div>

        {/* Grid de Fatores Analisados */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-black uppercase tracking-wider text-gym-text-muted">
            Fatores que embasaram a decisão
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 space-y-1">
              <span className="text-[10px] text-gym-text-muted block">Última carga real</span>
              <span className="font-bold text-white">
                {decision?.previousWeightKg !== null && decision?.previousWeightKg !== undefined
                  ? `${decision.previousWeightKg} kg`
                  : 'Sem registro'}
              </span>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 space-y-1">
              <span className="text-[10px] text-gym-text-muted block">Faixa do exercício</span>
              <span className="font-bold text-white">
                {exercise.repRange ? `${exercise.repRange[0]} a ${exercise.repRange[1]} reps` : 'Sem faixa'}
              </span>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 space-y-1">
              <span className="text-[10px] text-gym-text-muted block">Esforço avaliado</span>
              <span className="font-bold text-white">
                {decision?.effortSource === 'rir'
                  ? `RIR (meta: ≥ ${decision.targetRIR})`
                  : decision?.effortSource === 'rpe'
                    ? `RPE (meta: ≤ ${decision.targetRPE})`
                    : 'Sem esforço registrado'}
              </span>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 space-y-1">
              <span className="text-[10px] text-gym-text-muted block">Status especial</span>
              <span className="font-bold text-white">
                {decision?.returnRampFactor
                  ? `Rampa: ${Math.round(decision.returnRampFactor * 100)}%`
                  : decision?.plateauAction
                    ? `Platô (${decision.plateauAction})`
                    : 'Progressão regular'}
              </span>
            </div>
          </div>
        </div>

        {/* Detalhamento de Séries (Avançado) */}
        {decision?.series && decision.series.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-white">
              <Layers className="h-4 w-4 text-gym-accent" />
              <span>Decisão série a série (Perfil avançado)</span>
            </div>
            <div className="space-y-1.5 pt-1">
              {decision.series.map((item) => (
                <div
                  key={item.setIndex}
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-[11px]"
                >
                  <span className="font-bold text-gym-text-muted">Série {item.setIndex + 1}</span>
                  <span className="text-white">
                    {item.pesoKg !== null ? `${item.pesoKg} kg` : '—'} • {item.repsAlvo} reps
                  </span>
                  <span
                    className={`text-[10px] font-semibold ${
                      item.reasonCode === 'series-progress' ? 'text-gym-emerald' : 'text-cyan-300'
                    }`}
                  >
                    {item.reasonCode === 'series-progress' ? '+ subida' : 'manter'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comparativo Lado a Lado v1 vs v2 (Transparência de Versão) */}
        {comparison && (
          <div className="space-y-2 rounded-2xl border border-gym-accent/20 bg-gym-accent/[0.03] p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-white">
              <BrainCircuit className="h-4 w-4 text-gym-accent" />
              <span>Comparativo de Transparência (v1 × v2)</span>
            </div>
            <p className="text-[10px] leading-relaxed text-gym-text-muted">
              Durante esta fase de transição, você pode conferir o que o motor antigo sugeria e o que o novo motor inteligente (GOAL-29) recomenda com RIR e dupla progressão.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div className="rounded-xl border border-gym-accent/30 bg-gym-accent/10 p-2.5 space-y-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-gym-accent block">
                  Motor v2 (Novo)
                </span>
                <div className="font-bold text-xs text-white">
                  {comparison.v2.pesoKg !== null ? `${comparison.v2.pesoKg} kg` : '—'} • {comparison.v2.repsAlvo} reps
                </div>
                <p className="text-[10px] text-gym-text-muted leading-tight">
                  {comparison.v2.reasonText}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 space-y-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-gym-text-muted block">
                  Motor v1 (Legado)
                </span>
                <div className="font-bold text-xs text-white/80">
                  {comparison.legacy.pesoKg !== null ? `${comparison.legacy.pesoKg} kg` : '—'} • {comparison.legacy.repsAlvo} reps
                </div>
                <p className="text-[10px] text-gym-text-muted leading-tight">
                  {comparison.legacy.reasonText}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Informações de Ajuste Personalizado por Overrides */}
        {adjustmentInfo && (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-3 space-y-1">
            <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 block">
              Parâmetro aprendido por overrides
            </span>
            <p className="text-[11px] font-medium text-amber-200 leading-snug">
              {adjustmentInfo.reasonText}
            </p>
          </div>
        )}

        {/* Ação de Override Manual */}
        {onApplyWeightToAllSets && (
          <form onSubmit={handleApplyWeight} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-white">Quer usar outra carga hoje?</span>
              <span className="text-[9px] text-gym-text-muted">Ajusta todas as séries</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="0"
                value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value)}
                placeholder="Ex: 40"
                aria-label="Carga manual em kg para este exercício"
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gym-text-muted focus:border-gym-accent focus:outline-none"
              />
              <button
                type="submit"
                className="flex min-h-[40px] items-center gap-1 rounded-xl bg-gym-accent px-4 text-xs font-black uppercase tracking-wider text-gym-dark hover:bg-gym-accent-hover transition-colors"
              >
                Aplicar <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            {appliedNotification && (
              <p className="text-[10px] font-semibold text-gym-emerald animate-in fade-in">
                {appliedNotification}
              </p>
            )}
          </form>
        )}

        {/* Botão de Fechar */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] rounded-xl border border-white/10 bg-white/5 text-xs font-bold uppercase tracking-wider text-gym-text-muted hover:border-white/20 hover:text-white transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
