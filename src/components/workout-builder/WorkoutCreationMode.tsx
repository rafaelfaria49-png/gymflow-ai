'use client';

import React, { useEffect, useState } from 'react';
import { CalendarRange, ChevronLeft, FileText, LayoutGrid } from 'lucide-react';
import { MAX_FREQUENCY_DAYS, MIN_FREQUENCY_DAYS } from '../../lib/workout-guided-creation';

interface WorkoutCreationModeProps {
  suggestedFrequency: number;
  /** Passo inicial deep-linkado (ex.: abrir direto no ajuste de frequência). */
  initialView?: 'choose' | 'frequency';
  onBlank: () => void;
  onFrequency: (dayCount: number) => void;
  onTemplate: () => void;
  onCancel: () => void;
}

function clampCount(value: number): number {
  if (!Number.isFinite(value)) return MIN_FREQUENCY_DAYS;
  return Math.min(MAX_FREQUENCY_DAYS, Math.max(MIN_FREQUENCY_DAYS, Math.round(value)));
}

/**
 * GOAL-19B/PART-1: escolha de COMO começar um programa novo — sem virar onboarding.
 *
 * Três caminhos: programa em branco, usar a frequência do perfil (dias vazios) ou
 * partir de um template. A frequência é sugestão editável (PART 3): o número inicial
 * vem do perfil, mas o usuário ajusta antes de confirmar. Nada aqui escolhe exercício
 * ou divisão muscular.
 */
export const WorkoutCreationMode = ({
  suggestedFrequency,
  initialView = 'choose',
  onBlank,
  onFrequency,
  onTemplate,
  onCancel,
}: WorkoutCreationModeProps) => {
  const [view, setView] = useState<'choose' | 'frequency'>(initialView);
  const [count, setCount] = useState(() => clampCount(suggestedFrequency > 0 ? suggestedFrequency : 3));

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (view === 'frequency') setView('choose');
      else onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [view, onCancel]);

  if (view === 'frequency') {
    return (
      <div className="glass p-5 rounded-3xl border border-white/5 space-y-4 max-w-md mx-auto">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('choose')}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-white tap-target"
            aria-label="Voltar aos modos de criação"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-base font-bold text-white">Quantos dias por semana?</h2>
        </div>

        <p className="text-[11px] text-gym-text-muted leading-relaxed">
          {suggestedFrequency > 0
            ? `Seu perfil indica ${suggestedFrequency} ${suggestedFrequency === 1 ? 'dia' : 'dias'} por semana — ajuste se quiser. `
            : ''}
          Os dias começam vazios e sem foco definido; você escolhe cada exercício depois.
        </p>

        <div className="flex items-center justify-center gap-4 py-2">
          <button
            onClick={() => setCount((current) => clampCount(current - 1))}
            disabled={count <= MIN_FREQUENCY_DAYS}
            className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-white text-2xl font-black flex items-center justify-center disabled:opacity-30 hover:bg-white/10 transition-all"
            aria-label="Diminuir número de dias"
          >
            −
          </button>
          <div className="text-center min-w-[64px]" aria-live="polite">
            <span className="block text-4xl font-black text-gym-accent leading-none">{count}</span>
            <span className="block text-[10px] text-gym-text-muted uppercase tracking-wider mt-1">
              {count === 1 ? 'dia' : 'dias'}
            </span>
          </div>
          <button
            onClick={() => setCount((current) => clampCount(current + 1))}
            disabled={count >= MAX_FREQUENCY_DAYS}
            className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-white text-2xl font-black flex items-center justify-center disabled:opacity-30 hover:bg-white/10 transition-all"
            aria-label="Aumentar número de dias"
          >
            +
          </button>
        </div>

        <button
          onClick={() => onFrequency(count)}
          className="w-full min-h-[48px] bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-2xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-gym-accent/15"
        >
          Criar {count} {count === 1 ? 'dia vazio' : 'dias vazios'}
        </button>
      </div>
    );
  }

  const modes = [
    {
      key: 'blank',
      icon: FileText,
      title: 'Programa em branco',
      description: 'Comece com um único dia vazio e adicione o resto do seu jeito.',
      onClick: onBlank,
    },
    {
      key: 'frequency',
      icon: CalendarRange,
      title: 'Usar minha frequência',
      description: suggestedFrequency > 0
        ? `Cria dias vazios com base nos ${suggestedFrequency} ${suggestedFrequency === 1 ? 'dia' : 'dias'} do seu perfil.`
        : 'Escolha quantos dias vazios criar de uma vez.',
      onClick: () => setView('frequency'),
    },
    {
      key: 'template',
      icon: LayoutGrid,
      title: 'Começar com um template',
      description: 'Uma estrutura pronta de dias e foco — sempre editável, sem exercícios prontos.',
      onClick: onTemplate,
    },
  ] as const;

  return (
    <div className="space-y-3 max-w-md mx-auto">
      <div className="text-center space-y-1 pb-1">
        <h2 className="text-base font-bold text-white">Como deseja começar?</h2>
        <p className="text-[11px] text-gym-text-muted">Você poderá editar tudo depois.</p>
      </div>

      {modes.map((mode) => {
        const Icon = mode.icon;
        return (
          <button
            key={mode.key}
            onClick={mode.onClick}
            className="w-full text-left glass hover:border-gym-accent/30 rounded-2xl p-4 flex items-start gap-3.5 transition-all group"
          >
            <span className="flex-shrink-0 w-11 h-11 rounded-2xl bg-gym-accent/15 text-gym-accent flex items-center justify-center group-hover:bg-gym-accent/25 transition-all">
              <Icon className="w-5 h-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">{mode.title}</span>
              <span className="block text-[11px] text-gym-text-muted leading-relaxed mt-0.5">{mode.description}</span>
            </span>
          </button>
        );
      })}

      <button
        onClick={onCancel}
        className="w-full min-h-[44px] py-3 text-[11px] font-bold text-gym-text-muted hover:text-white transition-all"
      >
        Cancelar
      </button>
    </div>
  );
};
