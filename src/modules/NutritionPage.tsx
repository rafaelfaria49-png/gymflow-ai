'use client';

import React, { useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { Droplet, Utensils, Zap, Apple, Sparkles, Scale, RefreshCw, Flame } from 'lucide-react';
import { useToast } from '../components/ui/Toast';

export const NutritionPage = () => {
  const { nutrition, logWater, logMacros, user } = useGymFlow();
  const toast = useToast();
  const [waterInput, setWaterInput] = useState('250');
  const [kcalInput, setKcalInput] = useState('');
  const [protInput, setProtInput] = useState('');
  const [carbInput, setCarbInput] = useState('');
  const [fatInput, setFatInput] = useState('');

  const handleWaterLog = (amount: number) => {
    logWater(amount);
  };

  const handleCustomWaterLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waterInput) return;
    logWater(Number(waterInput));
  };

  const handleMacroSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kcalInput || !protInput || !carbInput || !fatInput) return;
    logMacros(Number(kcalInput), Number(protInput), Number(carbInput), Number(fatInput));
    setKcalInput('');
    setProtInput('');
    setCarbInput('');
    setFatInput('');
    toast.success('Refeição registrada na dieta!');
  };

  // Sugestões de Refeições Baseadas no Objetivo
  const getMealSuggestions = () => {
    const goal = user?.goal || 'hypertrophy';
    if (goal === 'slimming') {
      return [
        {
          type: 'Café da Manhã',
          meal: 'Omelete de 3 ovos inteiros com espinafre e 1 fatia de pão integral.',
          macros: '28g P • 15g C • 18g G • 320 kcal'
        },
        {
          type: 'Almoço',
          meal: 'Grelhado de peito de frango (150g), brócolis cozido no vapor (150g) e batata doce cozida (100g).',
          macros: '46g P • 24g C • 5g G • 345 kcal'
        },
        {
          type: 'Jantar',
          meal: 'Filé de tilápia grelhado (150g) com mix de salada verde e azeite de oliva extra virgem.',
          macros: '35g P • 5g C • 12g G • 270 kcal'
        }
      ];
    }
    // Padrão Hypertrophy / Força
    return [
      {
        type: 'Café da Manhã',
        meal: 'Mingau de aveia (60g) com 1 scoop de Whey Protein, 1 banana picada e pasta de amendoim (15g).',
        macros: '35g P • 58g C • 10g G • 460 kcal'
      },
      {
        type: 'Almoço',
        meal: 'Patinho bovino moído (150g), arroz branco cozido (200g) e feijão carioca (100g).',
        macros: '44g P • 62g C • 12g G • 540 kcal'
      },
      {
        type: 'Jantar',
        meal: 'Peito de frango desfiado (150g), purê de batata inglesa (180g) e salada de folhas.',
        macros: '42g P • 38g C • 6g G • 380 kcal'
      }
    ];
  };

  const calculatedWaterGoalPercent = Math.min(100, Math.round((nutrition.water / (user?.waterGoal || 3000)) * 100));

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">Dieta e Hidratação</h1>
        <p className="text-xs text-gym-text-muted mt-0.5 font-medium">
          Acompanhe o consumo diário de água, calorias e macronutrientes recomendados.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* COLUNA ESQUERDA: DIÁRIO DE HIDRATAÇÃO */}
        <div className="glass p-5 rounded-3xl border border-white/5 space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Droplet className="w-4.5 h-4.5 text-gym-accent animate-pulse" />
              Monitor de Água Diário
            </h3>

            {/* Círculo do Copo de água visual */}
            <div className="w-36 h-36 border-4 border-white/10 rounded-full flex flex-col items-center justify-center mx-auto relative overflow-hidden bg-white/5">
              <div
                className="absolute bottom-0 left-0 right-0 bg-gym-accent/25 transition-all duration-500 ease-out"
                style={{ height: `${calculatedWaterGoalPercent}%` }}
              ></div>
              <span className="text-2xl font-black text-white z-10 font-mono">{nutrition.water}ml</span>
              <span className="text-[10px] text-gym-text-muted z-10 font-bold">Meta: {user?.waterGoal || 3000}ml</span>
            </div>

            {/* Quick logs */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleWaterLog(250)}
                className="py-2.5 bg-white/5 hover:bg-gym-accent/15 border border-white/10 hover:border-gym-accent/20 text-white hover:text-gym-accent rounded-xl text-[10px] font-bold transition-all"
              >
                +250ml (Copo)
              </button>
              <button
                onClick={() => handleWaterLog(500)}
                className="py-2.5 bg-white/5 hover:bg-gym-accent/15 border border-white/10 hover:border-gym-accent/20 text-white hover:text-gym-accent rounded-xl text-[10px] font-bold transition-all"
              >
                +500ml (Garrafa)
              </button>
              <button
                onClick={() => handleWaterLog(1000)}
                className="py-2.5 bg-white/5 hover:bg-gym-accent/15 border border-white/10 hover:border-gym-accent/20 text-white hover:text-gym-accent rounded-xl text-[10px] font-bold transition-all"
              >
                +1L (Garrafa G)
              </button>
            </div>
          </div>

          {/* Form água */}
          <form onSubmit={handleCustomWaterLog} className="flex gap-2 pt-4 border-t border-white/5">
            <input
              type="number"
              placeholder="Outro valor em ml"
              value={waterInput}
              onChange={(e) => setWaterInput(e.target.value)}
              className="flex-1 bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-3 py-2 text-xs text-white placeholder-gym-text-muted outline-none"
              required
            />
            <button
              type="submit"
              className="bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-bold px-4 py-2 rounded-xl text-xs"
            >
              Registrar
            </button>
          </form>
        </div>

        {/* COLUNA DO MEIO: CALCULADOR DE CALORIAS */}
        <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Utensils className="w-4.5 h-4.5 text-gym-emerald" />
            Adicionar Alimento (Refeição)
          </h3>

          <form onSubmit={handleMacroSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1">Calorias (kcal)</label>
              <input
                type="number"
                placeholder="Ex: 450"
                value={kcalInput}
                onChange={(e) => setKcalInput(e.target.value)}
                className="w-full bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[9px] font-bold uppercase text-gym-text-muted mb-1 text-center">Proteínas (g)</label>
                <input
                  type="number"
                  placeholder="30"
                  value={protInput}
                  onChange={(e) => setProtInput(e.target.value)}
                  className="w-full bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl py-2 text-center text-xs text-white outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase text-gym-text-muted mb-1 text-center">Carbos (g)</label>
                <input
                  type="number"
                  placeholder="50"
                  value={carbInput}
                  onChange={(e) => setCarbInput(e.target.value)}
                  className="w-full bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl py-2 text-center text-xs text-white outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase text-gym-text-muted mb-1 text-center">Gorduras (g)</label>
                <input
                  type="number"
                  placeholder="10"
                  value={fatInput}
                  onChange={(e) => setFatInput(e.target.value)}
                  className="w-full bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl py-2 text-center text-xs text-white outline-none"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-gym-accent/15"
            >
              Registrar Alimento
            </button>
          </form>

          {/* Resumo Consumo */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 mt-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Registrado hoje</h4>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div>
                <span className="block font-mono font-bold text-white">{nutrition.calories}</span>
                <span className="block text-[9px] text-gym-text-muted">kcal</span>
              </div>
              <div>
                <span className="block font-mono font-bold text-gym-accent">{nutrition.protein}g</span>
                <span className="block text-[9px] text-gym-text-muted">Prot</span>
              </div>
              <div>
                <span className="block font-mono font-bold text-gym-emerald">{nutrition.carbs}g</span>
                <span className="block text-[9px] text-gym-text-muted">Carbo</span>
              </div>
              <div>
                <span className="block font-mono font-bold text-yellow-500">{nutrition.fat}g</span>
                <span className="block text-[9px] text-gym-text-muted">Gord</span>
              </div>
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: REFEIÇÕES SUGERIDAS (IA) */}
        <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Apple className="w-4.5 h-4.5 text-gym-accent" />
              Cardápio Sugerido IA
            </h3>
            <span className="text-[9px] bg-gym-accent/15 text-gym-accent font-black uppercase px-2 py-0.5 rounded-full">
              {user?.goal === 'slimming' ? 'Cutting' : 'Bulking'}
            </span>
          </div>

          <div className="space-y-3.5">
            {getMealSuggestions().map((meal, idx) => (
              <div key={idx} className="bg-white/5 border border-white/10 p-3 rounded-2xl space-y-1">
                <span className="text-[10px] text-gym-accent font-extrabold uppercase">{meal.type}</span>
                <p className="text-xs text-white/90 leading-relaxed">{meal.meal}</p>
                <p className="text-[9px] font-mono text-gym-text-muted pt-1 border-t border-white/5 mt-1 font-bold">
                  {meal.macros}
                </p>
              </div>
            ))}
          </div>

          {/* Aviso responsabilidade */}
          <div className="bg-gym-rose/5 border border-gym-rose/10 text-gym-rose rounded-xl p-3.5 text-[10px] leading-relaxed">
            ⚠️ <span className="font-bold">Nota de Responsabilidade:</span> As sugestões nutricionais apresentadas no GymFlow AI são estimativas geradas por algoritmos. O aplicativo não substitui o planejamento alimentar e consultas de um nutricionista clínico qualificado.
          </div>
        </div>
      </div>
    </div>
  );
};
