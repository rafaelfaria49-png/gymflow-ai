'use client';

import React, { useMemo, useState } from 'react';
import { Droplet } from 'lucide-react';
import { useGymFlow } from '../../providers/GymFlowContext';
import { useToast } from '../ui/Toast';
import { calculateActuals, calculateRemainingForDay } from '../../lib/nutrition/ledger';
import { isValidWaterInput } from '../../lib/nutrition-validation';
import { EmptyState, ErrorState, MacroProgressRow, SectionCard, formatKcal, mealLabel } from './shared';

const WATER_QUICK_ACTIONS = [250, 500, 1000];

export const TodaySection = () => {
  const {
    nutritionDay,
    nutritionActiveDate,
    nutritionLoading,
    nutritionError,
    logWater,
    refreshNutrition,
  } = useGymFlow();
  const toast = useToast();
  const [customWater, setCustomWater] = useState('');
  const [savingWater, setSavingWater] = useState<number | null>(null);

  const actuals = useMemo(
    () => (nutritionDay ? calculateActuals(nutritionDay) : null),
    [nutritionDay],
  );

  const remaining = useMemo(() => {
    if (!nutritionDay || !actuals) return null;
    if (nutritionDay.targetState !== 'AUTOMATED') return null;
    try {
      return calculateRemainingForDay(nutritionDay, actuals);
    } catch {
      return null;
    }
  }, [nutritionDay, actuals]);

  const handleQuickWater = async (amount: number) => {
    if (!isValidWaterInput(amount)) return;
    setSavingWater(amount);
    try {
      const ok = await logWater(amount);
      if (ok) toast.success(`${amount >= 1000 ? `${amount / 1000}L` : `${amount}ml`} de água registrados!`);
      else toast.error('Não foi possível registrar a água agora.');
    } finally {
      setSavingWater(null);
    }
  };

  const handleCustomWater = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(customWater);
    if (!isValidWaterInput(amount)) {
      toast.error('Informe uma quantidade positiva de água em ml (> 0).');
      return;
    }
    setSavingWater(-1);
    try {
      const ok = await logWater(amount);
      if (ok) {
        setCustomWater('');
        toast.success(`${amount}ml de água registrados!`);
      } else {
        toast.error('Não foi possível registrar a água agora.');
      }
    } finally {
      setSavingWater(null);
    }
  };

  if (nutritionLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Carregando diário de hoje">
        {[0, 1, 2].map((key) => (
          <div key={key} className="glass p-4 rounded-3xl border border-white/5 animate-pulse">
            <div className="h-4 w-2/3 bg-white/10 rounded" />
            <div className="h-8 w-full bg-white/5 rounded-xl mt-3" />
          </div>
        ))}
      </div>
    );
  }

  if (nutritionError && !nutritionDay) {
    return <ErrorState message={nutritionError} onRetry={() => void refreshNutrition()} />;
  }

  if (!nutritionDay || !actuals) {
    return (
      <EmptyState
        title="Diário indisponível"
        hint="Não foi possível carregar o diário nutricional de hoje. Verifique sua conexão com o armazenamento local e tente novamente."
        action={
          <button
            type="button"
            onClick={() => void refreshNutrition()}
            className="min-h-[44px] px-4 bg-gym-accent text-gym-dark font-extrabold rounded-xl text-xs uppercase tracking-wider"
          >
            Recarregar
          </button>
        }
      />
    );
  }

  const isAutomated = nutritionDay.targetState === 'AUTOMATED' && nutritionDay.targets !== null;
  const targets = isAutomated ? nutritionDay.targets : null;
  const totalEntries = nutritionDay.meals.reduce((sum, meal) => sum + meal.entries.length, 0);
  const isEmptyDay = actuals.calories === 0 && actuals.waterMl === 0 && totalEntries === 0;

  return (
    <div className="space-y-3">
      {nutritionError ? <ErrorState message={nutritionError} onRetry={() => void refreshNutrition()} /> : null}

      <SectionCard
        title={`Hoje${nutritionActiveDate ? ` · ${nutritionActiveDate}` : ''}`}
        subtitle={isAutomated
          ? 'Dados reais do ledger de hoje com metas do motor de nutrição.'
          : 'Dados reais do ledger de hoje. Metas automáticas indisponíveis — veja a aba Metas.'}
      >
        {/* Calorias */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <span className="block text-[10px] font-bold uppercase text-gym-text-muted">Meta</span>
              <span className="block font-mono font-bold text-white text-sm">
                {targets ? formatKcal(targets.targetCalories) : '—'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-gym-text-muted">Consumidas</span>
              <span className="block font-mono font-bold text-gym-accent text-sm">{formatKcal(actuals.calories)}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-gym-text-muted">Restantes</span>
              <span className="block font-mono font-bold text-white text-sm">
                {remaining ? formatKcal(remaining.calories) : '—'}
              </span>
            </div>
          </div>
          {!isAutomated ? (
            <p className="text-[10px] text-gym-text-muted mt-2 leading-relaxed">
              Sem meta automática hoje ({nutritionDay.targetState === 'MANUAL_ONLY' ? nutritionDay.targetUnavailableReason : 'indisponível'}).
              O consumo acima é real; configure o perfil para metas automáticas.
            </p>
          ) : null}
        </div>

        {/* Macros */}
        <div className="space-y-2.5">
          <MacroProgressRow label="Proteína" consumed={actuals.protein} target={targets?.targetProteinGrams ?? null} unit="g" />
          <MacroProgressRow label="Carboidrato" consumed={actuals.carbs} target={targets?.targetCarbsGrams ?? null} unit="g" />
          <MacroProgressRow label="Gordura" consumed={actuals.fat} target={targets?.targetFatGrams ?? null} unit="g" />
        </div>
      </SectionCard>

      <SectionCard
        title="Hidratação"
        subtitle={targets ? `Meta do motor: ${targets.targetWaterMl}ml.` : 'Meta automática indisponível — o consumo abaixo é real.'}
      >
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-full border-4 border-white/10 bg-white/5 flex flex-col items-center justify-center flex-shrink-0 relative overflow-hidden">
            <div
              className="absolute bottom-0 left-0 right-0 bg-gym-accent/25 transition-all duration-500"
              style={{ height: `${targets && targets.targetWaterMl > 0 ? Math.min(100, Math.round((actuals.waterMl / targets.targetWaterMl) * 100)) : 0}%` }}
            />
            <span className="text-[11px] font-black text-white z-10 font-mono">{actuals.waterMl}</span>
            <span className="text-[8px] text-gym-text-muted z-10 font-bold">ml</span>
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-white">
              {actuals.waterMl}ml{targets ? ` de ${targets.targetWaterMl}ml` : ' registrados'}
            </p>
            <p className="text-[10px] text-gym-text-muted mt-0.5">
              {remaining ? `${remaining.waterMl}ml restantes hoje.` : 'Registro real do ledger — sem estimativa.'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {WATER_QUICK_ACTIONS.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => void handleQuickWater(amount)}
              disabled={savingWater !== null}
              className="min-h-[44px] py-2.5 bg-white/5 hover:bg-gym-accent/15 border border-white/10 hover:border-gym-accent/20 text-white hover:text-gym-accent rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 disabled:opacity-60"
              aria-label={amount >= 1000 ? `Registrar ${amount / 1000} litro de água` : `Registrar ${amount} mililitros de água`}
            >
              <Droplet className="w-3.5 h-3.5" />
              {amount >= 1000 ? `+${amount / 1000} L` : `+${amount} ml`}
            </button>
          ))}
        </div>
        <form onSubmit={handleCustomWater} className="flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            placeholder="Outro valor em ml"
            value={customWater}
            onChange={(e) => setCustomWater(e.target.value)}
            className="flex-1 min-h-[44px] bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-3 py-2 text-xs text-white placeholder-gym-text-muted outline-none"
            min="1"
            aria-label="Quantidade personalizada de água em ml"
          />
          <button
            type="submit"
            disabled={savingWater !== null}
            className="min-h-[44px] bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-bold px-4 py-2 rounded-xl text-xs disabled:opacity-60"
          >
            Registrar
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Refeições e alimentos do dia" subtitle={`${totalEntries} ${totalEntries === 1 ? 'alimento registrado' : 'alimentos registrados'} no ledger.`}>
        {isEmptyDay ? (
          <EmptyState
            title="Nada registrado hoje"
            hint="Seu diário está vazio. Registre água com +250 ml acima ou adicione um alimento na aba Registrar."
          />
        ) : (
          <ul className="space-y-2.5">
            {nutritionDay.meals.map((meal) => (
              <li key={meal.id} className="bg-white/5 border border-white/10 rounded-2xl p-3">
                <p className="text-[10px] font-extrabold uppercase text-gym-accent tracking-wider">
                  {mealLabel(meal.type)} · {meal.name}
                </p>
                {meal.entries.length === 0 ? (
                  <p className="text-[11px] text-gym-text-muted mt-1">Refeição planejada, sem alimentos ainda.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {meal.entries.map((entry) => (
                      <li key={entry.id} className="flex items-start justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <p className="text-white/90 font-semibold truncate">{entry.name}</p>
                          <p className="text-[10px] text-gym-text-muted font-mono">
                            {entry.quantityGrams ? `${entry.quantityGrams}g · ` : ''}{entry.calories} kcal · P {entry.protein}g · C {entry.carbs}g · G {entry.fat}g
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            {nutritionDay.hydrationEntries.length > 0 ? (
              <li className="text-[10px] text-gym-text-muted font-mono">
                {nutritionDay.hydrationEntries.length} {nutritionDay.hydrationEntries.length === 1 ? 'registro de hidratação' : 'registros de hidratação'} no ledger.
              </li>
            ) : null}
          </ul>
        )}
      </SectionCard>
    </div>
  );
};
