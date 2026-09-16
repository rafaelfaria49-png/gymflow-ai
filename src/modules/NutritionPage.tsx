'use client';

import React, { useState } from 'react';
import { CalendarDays, ClipboardList, LineChart, NotebookPen, Sparkles } from 'lucide-react';
import { TodaySection } from '../components/nutrition/TodaySection';
import { RegisterSection } from '../components/nutrition/RegisterSection';
import { TargetsSection } from '../components/nutrition/TargetsSection';
import { TrendSection } from '../components/nutrition/TrendSection';
import { SuggestionsSection } from '../components/nutrition/SuggestionsSection';

type NutritionTab = 'today' | 'register' | 'targets' | 'trend' | 'suggestions';

const TABS: { value: NutritionTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'today', label: 'Hoje', icon: CalendarDays },
  { value: 'register', label: 'Registrar', icon: NotebookPen },
  { value: 'targets', label: 'Metas', icon: ClipboardList },
  { value: 'trend', label: 'Tendência', icon: LineChart },
  { value: 'suggestions', label: 'Sugestões', icon: Sparkles },
];

/**
 * NUT-006 — Experiência mobile-first de Nutrição sobre os contratos reais:
 * - Ledger (NUT-004) como source of truth do consumo;
 * - NutritionEngine como autoridade exclusiva dos targets;
 * - FoodDatabase (NUT-005) para busca, porções, USER_CONFIRMED, favoritos e recentes.
 *
 * Sem formulário manual de macros, sem sugestões estáticas, sem rótulo de IA.
 */
export const NutritionPage = () => {
  const [activeTab, setActiveTab] = useState<NutritionTab>('today');

  return (
    <div className="space-y-4 pb-24 lg:pb-6 max-w-2xl mx-auto w-full min-w-0">
      <div className="px-0.5">
        <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">Nutrição</h1>
        <p className="text-xs text-gym-text-muted mt-0.5 font-medium leading-relaxed">
          Diário real do ledger com metas do motor e catálogo verificado.
        </p>
      </div>

      {/* Abas internas — 360–430px sem overflow, alvos >= 44px, scroll horizontal contido */}
      <div
        className="sticky top-0 z-10 -mx-1 px-1 py-1.5 bg-gym-dark/90 backdrop-blur-xl"
        role="tablist"
        aria-label="Seções da nutrição"
      >
        <div className="grid grid-cols-5 gap-1 bg-white/5 border border-white/10 rounded-2xl p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`nut-panel-${tab.value}`}
                id={`nut-tab-${tab.value}`}
                onClick={() => setActiveTab(tab.value)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-extrabold uppercase tracking-wide transition-all active:scale-[0.97] min-w-0 ${
                  active ? 'bg-gym-accent text-gym-dark' : 'text-gym-text-muted hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate max-w-full px-0.5">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`nut-panel-${activeTab}`}
        aria-labelledby={`nut-tab-${activeTab}`}
        className="min-w-0"
      >
        {activeTab === 'today' ? <TodaySection /> : null}
        {activeTab === 'register' ? <RegisterSection /> : null}
        {activeTab === 'targets' ? <TargetsSection /> : null}
        {activeTab === 'trend' ? <TrendSection /> : null}
        {activeTab === 'suggestions' ? <SuggestionsSection /> : null}
      </div>
    </div>
  );
};
