'use client';

import React from 'react';
import { TrendingUp, MinusCircle, AlertTriangle, HelpCircle } from 'lucide-react';

interface UsabilityThreeQuestionsCardProps {
  whereEvolved: string[];
  whereStagnant: string[];
  whatMissing: string[];
  windowWeeks: number;
}

export const UsabilityThreeQuestionsCard: React.FC<UsabilityThreeQuestionsCardProps> = ({
  whereEvolved,
  whereStagnant,
  whatMissing,
  windowWeeks,
}) => {
  return (
    <div className="glass p-5 rounded-3xl border border-white/10 space-y-4 shadow-xl">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] uppercase font-extrabold tracking-wider text-gym-accent flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5" />
            Diagnóstico Rápido em 30 Segundos
          </span>
          <h2 className="text-base font-black text-white tracking-tight mt-0.5">
            Onde você evoluiu, estagnou ou faltou nas últimas {windowWeeks} semanas?
          </h2>
        </div>
        <span className="text-[10px] bg-white/5 border border-white/10 text-gym-text-muted px-2.5 py-1 rounded-xl font-mono hidden sm:inline-block">
          Cálculo puro de SessionLogs
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
        {/* 1. Onde evoluí? */}
        <div className="bg-gym-emerald/[0.04] border border-gym-emerald/20 p-4 rounded-2xl space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gym-emerald/20 text-gym-emerald flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              1. Onde evoluí?
            </h3>
          </div>
          <ul className="space-y-1.5 text-xs text-zinc-300">
            {whereEvolved.map((item, idx) => (
              <li key={idx} className="flex items-start gap-1.5 leading-snug">
                <span className="text-gym-emerald font-bold mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 2. Onde estagnei? */}
        <div className="bg-amber-400/[0.04] border border-amber-400/20 p-4 rounded-2xl space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-amber-400/20 text-amber-400 flex items-center justify-center">
              <MinusCircle className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              2. Onde estagnei?
            </h3>
          </div>
          <ul className="space-y-1.5 text-xs text-zinc-300">
            {whereStagnant.map((item, idx) => (
              <li key={idx} className="flex items-start gap-1.5 leading-snug">
                <span className="text-amber-400 font-bold mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 3. O que faltou? */}
        <div className="bg-rose-500/[0.04] border border-rose-500/20 p-4 rounded-2xl space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              3. O que faltou?
            </h3>
          </div>
          <ul className="space-y-1.5 text-xs text-zinc-300">
            {whatMissing.map((item, idx) => (
              <li key={idx} className="flex items-start gap-1.5 leading-snug">
                <span className="text-rose-400 font-bold mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
