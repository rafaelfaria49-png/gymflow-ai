'use client';

import React, { useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Gauge } from 'lucide-react';

export interface RirEducationCardProps {
  onComplete?: () => void;
  compact?: boolean;
}

export const RIR_EDUCATION_SCREENS = Object.freeze([
  {
    eyebrow: 'O que é RIR?',
    title: 'RIR é a margem que sobrou',
    body: 'RIR significa repetições em reserva: quantas repetições boas você ainda faria antes de falhar. RIR 2 = você terminaria a série sentindo que caberiam mais duas.',
  },
  {
    eyebrow: 'Como registrar',
    title: 'Escolha o número depois da série',
    body: 'Use os chips de 0 a 5 nas séries efetivas. RIR 0 é falha; RIR 3–5 indica mais margem. É opcional: se não souber, deixe em branco.',
  },
  {
    eyebrow: 'Como o GymFlow usa',
    title: 'Mais contexto, menos chute',
    body: 'O motor cruza RIR, reps e carga para decidir se progride, segura ou reduz. A decisão sempre vem acompanhada de um motivo que você pode conferir.',
  },
] as const);

export function RirEducationCard({ onComplete, compact = false }: RirEducationCardProps) {
  const [screen, setScreen] = useState(0);
  const content = RIR_EDUCATION_SCREENS[screen];
  const isLast = screen === RIR_EDUCATION_SCREENS.length - 1;

  const finish = () => onComplete?.();

  return (
    <section
      aria-labelledby="rir-education-title"
      className={`border border-gym-accent/20 bg-gym-accent/[0.04] ${compact ? 'rounded-2xl p-3.5' : 'rounded-3xl p-5'} space-y-3`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gym-accent/30 bg-gym-accent/10 text-gym-accent">
          <Gauge className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-gym-accent">RIR · {screen + 1}/3</span>
            <button
              type="button"
              onClick={finish}
              className="min-h-[36px] px-2 text-[9px] font-bold text-gym-text-muted underline-offset-2 hover:text-white hover:underline"
            >
              Ver depois
            </button>
          </div>
          <h2 id="rir-education-title" className="mt-1 text-sm font-black text-white">{content.title}</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-gym-text-muted">{content.body}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-3">
        <span className="text-[9px] font-bold uppercase tracking-wider text-gym-text-muted">{content.eyebrow}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setScreen((current) => Math.max(0, current - 1))}
            disabled={screen === 0}
            aria-label="Tela anterior sobre RIR"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-gym-text-muted transition-colors hover:border-gym-accent/30 hover:text-gym-accent disabled:cursor-not-allowed disabled:opacity-25"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={finish}
              className="flex min-h-[36px] items-center gap-1.5 rounded-lg bg-gym-accent px-3 text-[9px] font-black uppercase tracking-wide text-gym-dark transition-colors hover:bg-gym-accent-hover"
            >
              Entendi <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setScreen((current) => Math.min(RIR_EDUCATION_SCREENS.length - 1, current + 1))}
              className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-gym-accent/25 bg-gym-accent/10 px-3 text-[9px] font-black uppercase tracking-wide text-gym-accent transition-colors hover:bg-gym-accent/15"
            >
              Próxima <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
