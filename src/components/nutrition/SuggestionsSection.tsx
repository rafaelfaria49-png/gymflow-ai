'use client';

import React, { useMemo, useState } from 'react';
import { useGymFlow } from '../../providers/GymFlowContext';
import { useToast } from '../ui/Toast';
import { FOOD_DATABASE } from '../../lib/nutrition/food-database';
import { calculateActuals } from '../../lib/nutrition/ledger';
import { buildNutritionSuggestions } from '../../lib/nutrition/suggestions';
import type { MealType } from '../../lib/nutrition/ledger-types';
import { EmptyState, NUTRITION_MEAL_OPTIONS, SectionCard } from './shared';
import { AiMealAssistantModal } from './AiMealAssistantModal';

export const SuggestionsSection = () => {
  const { nutritionDay, nutritionLoading, logFoodReference } = useGymFlow();
  const toast = useToast();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmMeal, setConfirmMeal] = useState<MealType>('lunch');
  const [savingId, setSavingId] = useState<string | null>(null);
  // NUT-007: assistente IA em modal separado — as sugestões determinísticas
  // offline abaixo continuam intactas e honestamente separadas da IA.
  const [aiOpen, setAiOpen] = useState(false);

  const suggestions = useMemo(() => {
    if (!nutritionDay) return [];
    const actuals = calculateActuals(nutritionDay);
    const targets = nutritionDay.targetState === 'AUTOMATED' ? nutritionDay.targets : null;
    try {
      return buildNutritionSuggestions({
        catalog: FOOD_DATABASE.all(),
        actuals,
        targets,
        limit: 3,
      });
    } catch {
      return [];
    }
  }, [nutritionDay]);

  const handleRegister = async (referenceId: string, grams: number) => {
    const reference = FOOD_DATABASE.getById(referenceId);
    if (!reference) {
      toast.error('Alimento indisponível no catálogo.');
      return;
    }
    setSavingId(referenceId);
    try {
      const ok = await logFoodReference(reference, grams, confirmMeal);
      if (ok) {
        toast.success(`${reference.name} registrado no diário!`);
        setConfirmId(null);
      } else {
        toast.error('Não foi possível registrar o alimento agora.');
      }
    } finally {
      setSavingId(null);
    }
  };

  if (nutritionLoading) {
    return (
      <div className="glass p-4 rounded-3xl border border-white/5 animate-pulse" aria-busy="true" aria-label="Carregando sugestões">
        <div className="h-4 w-1/2 bg-white/10 rounded" />
        <div className="h-24 w-full bg-white/5 rounded-xl mt-3" />
      </div>
    );
  }

  if (!nutritionDay) {
    return (
      <EmptyState
        title="Sugestões indisponíveis"
        hint="Carregue o diário de hoje para ver sugestões do catálogo verificado."
      />
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setAiOpen(true)}
        className="min-h-[44px] w-full bg-gym-accent/10 hover:bg-gym-accent/20 border border-gym-accent/30 text-gym-accent font-extrabold rounded-2xl text-xs uppercase tracking-wider transition-all active:scale-[0.99]"
      >
        Assistente IA · propostas do catálogo
      </button>
      <AiMealAssistantModal open={aiOpen} onClose={() => setAiOpen(false)} />
      <SectionCard
        title="Sugestões do catálogo"
        subtitle="Somente alimentos verificados com cálculo determinístico. Sem rótulo de IA, sem prescrição — qualquer inclusão no diário exige confirmação explícita."
      >
        {suggestions.length === 0 ? (
          <EmptyState
            title="Sem sugestões agora"
            hint="O catálogo verificado não retornou exemplos para o estado atual do dia. Tente registrar consumo ou recarregar."
          />
        ) : (
          <ul className="space-y-2.5">
            {suggestions.map((suggestion) => {
              const confirming = confirmId === suggestion.referenceId;
              return (
                <li key={suggestion.referenceId} className="bg-white/5 border border-white/10 rounded-2xl p-3.5 space-y-2">
                  <div>
                    <p className="text-xs font-bold text-white">{suggestion.name}</p>
                    <p className="text-[10px] text-gym-text-muted mt-0.5">
                      {suggestion.grams}g ({suggestion.servingDescription})
                    </p>
                    <p className="text-[11px] font-mono text-gym-accent mt-1">
                      {suggestion.preview.calories} kcal · P {suggestion.preview.protein}g · C {suggestion.preview.carbs}g · G {suggestion.preview.fat}g
                    </p>
                    <p className="text-[10px] text-gym-text-muted mt-1 leading-relaxed">{suggestion.reason}</p>
                  </div>
                  {confirming ? (
                    <div className="space-y-2 pt-1">
                      <div className="flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Refeição da sugestão">
                        {NUTRITION_MEAL_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={confirmMeal === option.value}
                            onClick={() => setConfirmMeal(option.value)}
                            className={`min-h-[44px] flex-shrink-0 px-3 rounded-lg text-[11px] font-bold border ${
                              confirmMeal === option.value
                                ? 'bg-gym-accent text-gym-dark border-gym-accent'
                                : 'bg-white/5 text-white border-white/10'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="min-h-[44px] flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-xs"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={savingId !== null}
                          onClick={() => void handleRegister(suggestion.referenceId, suggestion.grams)}
                          className="min-h-[44px] flex-1 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold rounded-xl text-xs uppercase tracking-wider disabled:opacity-60"
                        >
                          {savingId === suggestion.referenceId ? 'Registrando…' : 'Confirmar inclusão'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmId(suggestion.referenceId);
                        setConfirmMeal('lunch');
                      }}
                      className="min-h-[44px] w-full bg-white/5 hover:bg-gym-accent/15 border border-white/10 hover:border-gym-accent/30 text-white hover:text-gym-accent font-bold rounded-xl text-xs transition-all"
                    >
                      Registrar no diário
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="bg-gym-rose/5 border border-gym-rose/10 text-gym-rose rounded-xl p-3.5 text-[10px] leading-relaxed">
          <span className="font-bold">Nota de responsabilidade:</span> exemplos informativos do catálogo verificado — não constituem planejamento
          alimentar individualizado nem prescrição dietética e não substituem um nutricionista clínico qualificado.
        </div>
      </SectionCard>
    </div>
  );
};
