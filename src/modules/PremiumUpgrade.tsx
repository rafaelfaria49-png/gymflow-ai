'use client';

import React, { useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { Award, Check, Sparkles, X, ShieldCheck } from 'lucide-react';

export const PremiumUpgrade = () => {
  const { user, updateUserPremium } = useGymFlow();
  const [upgradingTo, setUpgradingTo] = useState<string | null>(null);

  const handleUpgradeSimulate = (status: 'pro' | 'elite') => {
    setUpgradingTo(status);
    setTimeout(() => {
      updateUserPremium(status);
      setUpgradingTo(null);
      alert(`Parabéns! Você agora é um assinante GymFlow ${status.toUpperCase()}! 🎉`);
    }, 1500);
  };

  return (
    <div className="space-y-8 pb-20 lg:pb-6 max-w-5xl mx-auto">
      {/* HEADER */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-1 bg-gym-accent/15 border border-gym-accent/25 px-3 py-1 rounded-full text-[10px] font-black uppercase text-gym-accent tracking-widest animate-pulse-glow">
          <Sparkles className="w-3.5 h-3.5" />
          Acesso Total Ilimitado
        </div>
        <h1 className="text-3xl lg:text-5xl font-black text-white tracking-tight">Escolha Seu Plano de Performance</h1>
        <p className="text-sm text-gym-text-muted max-w-xl mx-auto">
          Diga adeus a planilhas de papel. Desbloqueie o IA Coach inteligente, vídeos explicativos de postura e relatórios analíticos.
        </p>
      </div>

      {/* PLAN CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* FREE */}
        <div className={`glass p-8 rounded-3xl border flex flex-col justify-between transition-all ${
          user?.premiumStatus === 'free' ? 'border-gym-accent bg-gym-accent/5' : 'border-white/5'
        }`}>
          <div>
            <span className="text-xs font-bold text-gym-text-muted uppercase tracking-widest">GymFlow Free</span>
            <div className="text-3xl font-extrabold text-white mt-3">R$ 0<span className="text-sm font-medium text-gym-text-muted">/mês</span></div>
            <p className="text-xs text-gym-text-muted mt-2 leading-relaxed">Acesso essencial para controle básico de carga de forma simples.</p>

            <ul className="space-y-3.5 mt-8 text-xs text-white/95">
              <li className="flex items-center gap-2">✓ Treinos limitados (3 por semana)</li>
              <li className="flex items-center gap-2">✓ Biblioteca básica de exercícios</li>
              <li className="flex items-center gap-2">✓ Histórico de cargas simples</li>
              <li className="flex items-center gap-2 text-white/40">✗ IA Coach Inteligente</li>
              <li className="flex items-center gap-2 text-white/40">✗ Aulas de postura premium</li>
            </ul>
          </div>

          <button
            disabled
            className="w-full py-3.5 bg-white/5 text-gym-text-muted font-bold rounded-xl mt-8 text-xs text-center border border-white/5"
          >
            {user?.premiumStatus === 'free' ? 'Seu Plano Atual' : 'Plano Grátis'}
          </button>
        </div>

        {/* PRO */}
        <div className={`glass bg-gradient-to-b from-gym-accent/5 to-transparent p-8 rounded-3xl border-2 flex flex-col justify-between relative transition-all ${
          user?.premiumStatus === 'pro' ? 'border-gym-accent' : 'border-white/10 hover:border-gym-accent/50'
        }`}>
          {user?.premiumStatus === 'pro' && (
            <span className="absolute top-4 right-4 bg-gym-accent text-gym-dark text-[9px] font-black uppercase px-2 py-0.5 rounded-full">Plano Ativo</span>
          )}
          <div>
            <span className="text-xs font-bold text-gym-accent uppercase tracking-widest">GymFlow Pro</span>
            <div className="text-3xl font-extrabold text-white mt-3">R$ 19,90<span className="text-sm font-medium text-gym-text-muted">/mês</span></div>
            <p className="text-xs text-gym-text-muted mt-2 leading-relaxed">
              O plano perfeito para quem quer evoluir cargas com IA e técnica impecável.
            </p>

            <ul className="space-y-3.5 mt-8 text-xs text-white/95">
              <li className="flex items-center gap-2">✓ IA Coach Chat Ilimitado</li>
              <li className="flex items-center gap-2">✓ Todos os programas por nível</li>
              <li className="flex items-center gap-2">✓ Aulas técnicas e postura completas</li>
              <li className="flex items-center gap-2">✓ Monitoramento de água e macros</li>
              <li className="flex items-center gap-2 text-white/40">✗ Comunidade e canais VIP</li>
            </ul>
          </div>

          <button
            onClick={() => handleUpgradeSimulate('pro')}
            disabled={upgradingTo !== null || user?.premiumStatus === 'pro'}
            className="w-full py-3.5 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-xl mt-8 text-xs uppercase tracking-wider transition-all shadow-md shadow-gym-accent/15"
          >
            {upgradingTo === 'pro' ? (
              <span className="flex items-center justify-center gap-1">
                <span className="w-3 h-3 border-t-2 border-gym-dark rounded-full animate-spin"></span>
                Assinando...
              </span>
            ) : user?.premiumStatus === 'pro' ? (
              'Seu Plano Ativo'
            ) : (
              'Assinar Pro'
            )}
          </button>
        </div>

        {/* ELITE */}
        <div className={`glass p-8 rounded-3xl border flex flex-col justify-between transition-all ${
          user?.premiumStatus === 'elite' ? 'border-gym-emerald bg-gym-emerald/5' : 'border-white/5 hover:border-gym-emerald/50'
        }`}>
          {user?.premiumStatus === 'elite' && (
            <span className="absolute top-4 right-4 bg-gym-emerald text-gym-dark text-[9px] font-black uppercase px-2 py-0.5 rounded-full">Plano Ativo</span>
          )}
          <div>
            <span className="text-xs font-bold text-gym-emerald uppercase tracking-widest">GymFlow Elite</span>
            <div className="text-3xl font-extrabold text-white mt-3">R$ 39,90<span className="text-sm font-medium text-gym-text-muted">/mês</span></div>
            <p className="text-xs text-gym-text-muted mt-2 leading-relaxed">
              Alta performance, relatórios de fadiga articular e comunidade VIP.
            </p>

            <ul className="space-y-3.5 mt-8 text-xs text-white/95">
              <li className="flex items-center gap-2">✓ Tudo do plano Pro</li>
              <li className="flex items-center gap-2">✓ Relatórios avançados mensais de IA</li>
              <li className="flex items-center gap-2">✓ Comunidade e Canais exclusivos</li>
              <li className="flex items-center gap-2">✓ Desafios Premium (+3000 XP)</li>
              <li className="flex items-center gap-2">✓ Selo exclusivo no ranking</li>
            </ul>
          </div>

          <button
            onClick={() => handleUpgradeSimulate('elite')}
            disabled={upgradingTo !== null || user?.premiumStatus === 'elite'}
            className="w-full py-3.5 bg-gym-emerald hover:bg-gym-emerald/80 text-gym-dark font-black rounded-xl mt-8 text-xs uppercase tracking-wider transition-all"
          >
            {upgradingTo === 'elite' ? (
              <span className="flex items-center justify-center gap-1">
                <span className="w-3 h-3 border-t-2 border-gym-dark rounded-full animate-spin"></span>
                Assinando...
              </span>
            ) : user?.premiumStatus === 'elite' ? (
              'Seu Plano Ativo'
            ) : (
              'Assinar Elite'
            )}
          </button>
        </div>
      </div>

      {/* SEGURANÇA GATEWAY */}
      <div className="flex items-center justify-center gap-2 text-gym-text-muted text-xs pt-4 border-t border-white/5">
        <ShieldCheck className="w-4.5 h-4.5 text-gym-accent" />
        <span>Pagamento seguro e simulado. Cancele com um clique quando quiser.</span>
      </div>
    </div>
  );
};
