'use client';

/**
 * GymFlow AI — Assistente nutricional com IA (NUT-007)
 *
 * Modal propositivo e controlado, integrado à experiência NUT-006 SEM
 * substituir as sugestões honestas offline (`SuggestionsSection` continua
 * intacta e separada).
 *
 * - Todos os números exibidos vêm da proposta grounded (recalculados pelo
 *   FoodDatabase); nenhum valor do modelo chega à UI;
 * - CTA "Adicionar ao Diário" exige confirmação explícita em 2 etapas
 *   (refeição + confirmar) e chama o `logFoodReference` já existente do
 *   NUT-006. Sem auto-write: nenhuma proposta grava sozinha no ledger;
 * - Falha de rede/IA nunca quebra a Nutrição: estados honestos por código.
 */

import React, { useMemo, useRef, useState } from 'react';
import { useGymFlow } from '../../providers/GymFlowContext';
import { useToast } from '../ui/Toast';
import { FOOD_DATABASE } from '../../lib/nutrition/food-database';
import { calculateActuals, calculateRemainingForDay } from '../../lib/nutrition/ledger';
import type { MealType } from '../../lib/nutrition/ledger-types';
import {
  aiFailureToUiState,
  type AiAssistantGatewayRequest,
  type AiAssistantUiState,
  type AiGroundedItem,
  type AiGroundedProposal,
  type AiMinimalNutritionContext,
  type AiTargetAvailability,
  type AiUseCase,
} from '../../lib/nutrition/ai-assistant-types';
import { requestAssistantProposal } from '../../lib/nutrition/ai-assistant-client';
import { EmptyState, NUTRITION_MEAL_OPTIONS, SectionCard } from './shared';

const USE_CASE_OPTIONS: { value: AiUseCase; label: string; hint: string }[] = [
  { value: 'complete_protein', label: 'Completar proteína', hint: 'Opções dentro do saldo restante.' },
  { value: 'substitute_food', label: 'Substituir alimento', hint: 'Troca com delta real calculado.' },
  { value: 'build_meal_from_ingredients', label: 'Montar com ingredientes', hint: 'Só usa o que existe no catálogo.' },
  { value: 'snacks_within_balance', label: '3 lanches no saldo', hint: 'Três opções dentro das metas.' },
  { value: 'explain_target_change', label: 'Explicar minhas metas', hint: 'Explicação simples dos números do motor.' },
];

const UI_STATE_COPY: Record<Exclude<AiAssistantUiState, 'idle' | 'loading' | 'success'>, { title: string; hint: string }> = {
  empty: {
    title: 'Sem proposta desta vez',
    hint: 'A IA não retornou opções válidas do catálogo verificado. Tente outro caso ou use as sugestões offline da aba Sugestões.',
  },
  'invalid-response': {
    title: 'Resposta da IA inválida',
    hint: 'A resposta veio fora do contrato e foi descartada — nenhum número foi inventado. Tente novamente.',
  },
  'provider-unavailable': {
    title: 'IA indisponível (AI_UNAVAILABLE)',
    hint: 'Backend/provedor de IA não configurado ou inalcançável. Nenhuma sugestão fake foi gerada — as sugestões offline continuam na aba Sugestões.',
  },
  'timeout-error': {
    title: 'Tempo esgotado',
    hint: 'A IA demorou além do limite e a chamada foi cancelada. Tente novamente.',
  },
  'clinical-gate-blocked': {
    title: 'Orientação automática pausada',
    hint: 'Seu perfil exige acompanhamento profissional para metas automáticas — por isso a IA não foi chamada. O registro manual continua liberado.',
  },
};

function formatMacroLine(computed: { calories: number; protein: number; carbs: number; fat: number }): string {
  return `${computed.calories} kcal · P ${computed.protein}g · C ${computed.carbs}g · G ${computed.fat}g`;
}

export function AiMealAssistantModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { nutritionDay, nutritionProfile, logFoodReference } = useGymFlow();
  const toast = useToast();
  const [useCase, setUseCase] = useState<AiUseCase>('complete_protein');
  const [ingredientText, setIngredientText] = useState('');
  const [substituteQuery, setSubstituteQuery] = useState('');
  const [substituteGrams, setSubstituteGrams] = useState('100');
  const [uiState, setUiState] = useState<AiAssistantUiState>('idle');
  const [proposal, setProposal] = useState<AiGroundedProposal | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [confirmMeal, setConfirmMeal] = useState<MealType>('lunch');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const availability: AiTargetAvailability | null = useMemo(() => {
    if (!nutritionDay) return null;
    if (nutritionDay.targetState === 'AUTOMATED') {
      const snapshot = nutritionDay.gateSnapshot;
      if (snapshot.kind === 'EVALUATED' && snapshot.result.allowAutomatedTargets === false) {
        return { state: 'CLINICAL_GATE_BLOCKED', gateStatus: snapshot.result.status };
      }
      return { state: 'AUTOMATED' };
    }
    const snapshot = nutritionDay.gateSnapshot;
    if (snapshot.kind === 'EVALUATED' && snapshot.result.allowAutomatedTargets === false) {
      return { state: 'CLINICAL_GATE_BLOCKED', gateStatus: snapshot.result.status };
    }
    return { state: 'MANUAL_ONLY', reason: nutritionDay.targetUnavailableReason };
  }, [nutritionDay]);

  const minimalContext: AiMinimalNutritionContext | null = useMemo(() => {
    if (!nutritionDay || nutritionDay.targetState !== 'AUTOMATED' || !nutritionDay.targets) return null;
    try {
      const actuals = calculateActuals(nutritionDay);
      const remaining = calculateRemainingForDay(nutritionDay, actuals);
      const context: AiMinimalNutritionContext = {
        remaining: { calories: remaining.calories, protein: remaining.protein, carbs: remaining.carbs, fat: remaining.fat },
        targets: {
          calories: nutritionDay.targets.targetCalories,
          protein: nutritionDay.targets.targetProteinGrams,
          carbs: nutritionDay.targets.targetCarbsGrams,
          fat: nutritionDay.targets.targetFatGrams,
        },
      };
      if (nutritionProfile?.dietaryPattern) context.dietaryPattern = nutritionProfile.dietaryPattern;
      if (nutritionProfile?.goal) context.goal = nutritionProfile.goal;
      return context;
    } catch {
      return null;
    }
  }, [nutritionDay, nutritionProfile]);

  const substituteCandidates = useMemo(() => {
    const query = substituteQuery.trim();
    if (query.length === 0) return [];
    try {
      return FOOD_DATABASE.search(query, { limit: 5 });
    } catch {
      return [];
    }
  }, [substituteQuery]);

  if (!open) return null;

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setUiState('idle');
  };

  const buildRequest = (): AiAssistantGatewayRequest | null => {
    if (useCase === 'explain_target_change') {
      if (!nutritionDay || nutritionDay.targetState !== 'AUTOMATED' || !nutritionDay.targets) return null;
      const targets = nutritionDay.targets;
      return {
        useCase,
        facts: {
          targetCalories: targets.targetCalories,
          targetProteinGrams: targets.targetProteinGrams,
          targetCarbsGrams: targets.targetCarbsGrams,
          targetFatGrams: targets.targetFatGrams,
          bmrKcal: targets.bmrKcal,
          tdeeKcal: targets.tdeeKcal,
          energyBalanceKcal: targets.energyBalanceKcal,
          goal: nutritionProfile?.goal ?? 'maintenance',
        },
      };
    }
    if (!minimalContext || !availability) return null;
    if (availability.state !== 'AUTOMATED') return null;
    if (useCase === 'substitute_food') {
      const picked = substituteCandidates[0];
      if (!picked) return null;
      const grams = Number(substituteGrams);
      if (!Number.isFinite(grams) || grams < 1 || grams > 1000) return null;
      return { useCase, context: minimalContext, availability, foodReferenceId: picked.id, grams };
    }
    if (useCase === 'build_meal_from_ingredients') {
      const ingredients = ingredientText.split(/[\n,;]+/).map((part) => part.trim()).filter((part) => part.length > 0).slice(0, 12);
      if (ingredients.length === 0) return null;
      return { useCase, context: minimalContext, availability, ingredients };
    }
    return { useCase, context: minimalContext, availability };
  };

  const handleAsk = async () => {
    // Gate clínico local: não chama o modelo para recomendação personalizada.
    if (availability && availability.state === 'CLINICAL_GATE_BLOCKED') {
      setProposal(null);
      setFailureMessage(null);
      setUiState('clinical-gate-blocked');
      return;
    }
    const request = buildRequest();
    if (!request) {
      if (useCase === 'explain_target_change') {
        setProposal(null);
        setFailureMessage(null);
        setUiState('clinical-gate-blocked');
        return;
      }
      toast.error('Sem metas automáticas agora — a IA precisa do saldo do dia.');
      setProposal(null);
      setFailureMessage(null);
      setUiState(availability?.state === 'MANUAL_ONLY' ? 'clinical-gate-blocked' : 'empty');
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setUiState('loading');
    setProposal(null);
    setFailureMessage(null);
    setConfirmKey(null);
    try {
      const result = await requestAssistantProposal(request, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (result.status === 'ok') {
        setProposal(result.proposal);
        setUiState('success');
      } else {
        setFailureMessage(result.message);
        setUiState(aiFailureToUiState(result.code));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleAddToDiary = async (item: AiGroundedItem) => {
    const reference = FOOD_DATABASE.getById(item.foodReferenceId);
    if (!reference) {
      toast.error('Alimento indisponível no catálogo.');
      return;
    }
    const key = `${item.foodReferenceId}@${item.grams}`;
    setSavingKey(key);
    try {
      const ok = await logFoodReference(reference, item.grams, confirmMeal);
      if (ok) {
        toast.success(`${item.name} registrado no diário!`);
        setConfirmKey(null);
      } else {
        toast.error('Não foi possível registrar o alimento agora.');
      }
    } finally {
      setSavingKey(null);
    }
  };

  const renderItems = (items: AiGroundedItem[]) => (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const key = `${item.foodReferenceId}@${item.grams}`;
        const confirming = confirmKey === key;
        return (
          <li key={key} className="bg-white/5 border border-white/10 rounded-2xl p-3.5 space-y-2">
            <div>
              <p className="text-xs font-bold text-white">{item.name}</p>
              <p className="text-[10px] text-gym-text-muted mt-0.5">
                {item.grams}g ({item.servingDescription})
              </p>
              <p className="text-[11px] font-mono text-gym-accent mt-1">{formatMacroLine(item.computed)}</p>
              {item.culinaryNote ? (
                <p className="text-[10px] text-gym-text-muted mt-1 leading-relaxed">{item.culinaryNote}</p>
              ) : null}
            </div>
            {confirming ? (
              <div className="space-y-2 pt-1">
                <div className="flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Refeição do item da IA">
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
                    onClick={() => setConfirmKey(null)}
                    className="min-h-[44px] flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={savingKey !== null}
                    onClick={() => void handleAddToDiary(item)}
                    className="min-h-[44px] flex-1 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold rounded-xl text-xs uppercase tracking-wider disabled:opacity-60"
                  >
                    {savingKey === key ? 'Registrando…' : 'Confirmar inclusão'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirmKey(key);
                  setConfirmMeal('lunch');
                }}
                className="min-h-[44px] w-full bg-white/5 hover:bg-gym-accent/15 border border-white/10 hover:border-gym-accent/30 text-white hover:text-gym-accent font-bold rounded-xl text-xs transition-all"
              >
                Adicionar ao Diário
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );

  const renderProposal = () => {
    if (!proposal) return null;
    if (proposal.useCase === 'snacks_within_balance') {
      return (
        <div className="space-y-3">
          {proposal.options.map((option, index) => (
            <div key={index} className="bg-white/5 border border-white/10 rounded-2xl p-3 space-y-2">
              <p className="text-[11px] font-extrabold text-white uppercase tracking-wide">
                Opção {index + 1} · {formatMacroLine(option.totals)}
              </p>
              {renderItems(option.items)}
            </div>
          ))}
        </div>
      );
    }
    if (proposal.useCase === 'substitute_food') {
      return (
        <div className="space-y-3">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
            <p className="text-[11px] font-bold text-white">Delta real calculado (proposta − atual)</p>
            <p className="text-[11px] font-mono text-gym-accent mt-1">
              {proposal.delta.calories >= 0 ? '+' : ''}{proposal.delta.calories} kcal · P {proposal.delta.protein >= 0 ? '+' : ''}{proposal.delta.protein}g · C {proposal.delta.carbs >= 0 ? '+' : ''}{proposal.delta.carbs}g · G {proposal.delta.fat >= 0 ? '+' : ''}{proposal.delta.fat}g
            </p>
            <p className="text-[10px] text-gym-text-muted mt-1">Calculado localmente pelo catálogo — não informado pelo modelo.</p>
          </div>
          {renderItems(proposal.items)}
        </div>
      );
    }
    if (proposal.useCase === 'build_meal_from_ingredients') {
      return (
        <div className="space-y-3">
          {proposal.unresolvedIngredients.length > 0 ? (
            <p className="text-[10px] text-gym-text-muted bg-white/5 border border-white/10 rounded-xl p-3 leading-relaxed">
              Sem correspondência no catálogo (não viraram alimento inventado): {proposal.unresolvedIngredients.join(', ')}.
            </p>
          ) : null}
          {renderItems(proposal.items)}
        </div>
      );
    }
    if (proposal.useCase === 'explain_target_change') {
      const facts = proposal.facts;
      return (
        <div className="space-y-3">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
            <p className="text-[11px] font-bold text-white">Números oficiais do motor</p>
            <p className="text-[11px] font-mono text-gym-accent mt-1">
              {facts.targetCalories} kcal · P {facts.targetProteinGrams}g · C {facts.targetCarbsGrams}g · G {facts.targetFatGrams}g
            </p>
            <p className="text-[10px] text-gym-text-muted mt-1">
              BMR {facts.bmrKcal} kcal · TDEE {facts.tdeeKcal} kcal · balanço {facts.energyBalanceKcal} kcal · objetivo {facts.goal}
            </p>
          </div>
          <p className="text-[11px] text-white/80 leading-relaxed bg-white/5 border border-white/10 rounded-2xl p-3">{proposal.explanationText}</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-[11px] font-mono text-gym-accent">Total recalculado: {formatMacroLine(proposal.totals)}</p>
        {renderItems(proposal.items)}
      </div>
    );
  };

  const selectedCase = USE_CASE_OPTIONS.find((option) => option.value === useCase);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Assistente nutricional com IA">
      <button type="button" aria-label="Fechar assistente" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-gym-dark border border-white/10 rounded-t-3xl sm:rounded-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-black text-white tracking-tight">Assistente IA · Nutrição</h2>
            <p className="text-[11px] text-gym-text-muted mt-0.5 leading-relaxed">
              Propostas com IA real sobre o catálogo verificado. Números sempre recalculados — nada é gravado sem sua confirmação.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-sm"
          >
            ✕
          </button>
        </header>

        <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Casos do assistente">
          {USE_CASE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={useCase === option.value}
              onClick={() => {
                setUseCase(option.value);
                setUiState('idle');
                setProposal(null);
                setFailureMessage(null);
              }}
              className={`min-h-[44px] flex-shrink-0 px-3 rounded-xl text-[11px] font-extrabold border ${
                useCase === option.value
                  ? 'bg-gym-accent text-gym-dark border-gym-accent'
                  : 'bg-white/5 text-gym-text-muted border-white/10'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {selectedCase ? <p className="text-[10px] text-gym-text-muted">{selectedCase.hint}</p> : null}

        {useCase === 'build_meal_from_ingredients' ? (
          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold text-white">Ingredientes disponíveis (separados por vírgula)</span>
            <textarea
              value={ingredientText}
              onChange={(event) => setIngredientText(event.target.value)}
              rows={2}
              maxLength={600}
              placeholder="ex.: frango, arroz, brócolis"
              className="w-full min-h-[44px] bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-gym-text-muted focus:outline-none focus:border-gym-accent/50"
            />
          </label>
        ) : null}

        {useCase === 'substitute_food' ? (
          <div className="space-y-1.5">
            <label className="block space-y-1.5">
              <span className="text-[11px] font-bold text-white">Alimento a substituir (busca no catálogo)</span>
              <input
                value={substituteQuery}
                onChange={(event) => setSubstituteQuery(event.target.value)}
                maxLength={80}
                placeholder="ex.: arroz branco"
                className="w-full min-h-[44px] bg-white/5 border border-white/10 rounded-xl px-3 text-xs text-white placeholder:text-gym-text-muted focus:outline-none focus:border-gym-accent/50"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-bold text-white">Quantidade atual (g)</span>
              <input
                value={substituteGrams}
                onChange={(event) => setSubstituteGrams(event.target.value)}
                inputMode="decimal"
                maxLength={6}
                className="w-full min-h-[44px] bg-white/5 border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-gym-accent/50"
              />
            </label>
            {substituteQuery.trim().length > 0 ? (
              <p className="text-[10px] text-gym-text-muted">
                {substituteCandidates.length > 0
                  ? `Substituindo: ${substituteCandidates[0].name} (${substituteCandidates[0].servingDescription}).`
                  : 'Nenhum alimento do catálogo para esse texto.'}
              </p>
            ) : null}
          </div>
        ) : null}

        {uiState === 'loading' ? (
          <div className="space-y-2">
            <div className="glass p-4 rounded-2xl border border-white/5 animate-pulse" aria-busy="true" aria-label="Consultando a IA">
              <div className="h-4 w-1/2 bg-white/10 rounded" />
              <div className="h-20 w-full bg-white/5 rounded-xl mt-3" />
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="min-h-[44px] w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-xs"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void handleAsk()}
            className="min-h-[44px] w-full bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold rounded-xl text-xs uppercase tracking-wider"
          >
            Perguntar à IA
          </button>
        )}

        {uiState === 'success' ? (
          <SectionCard
            title="Proposta da IA (catálogo verificado)"
            subtitle="Números recalculados localmente pelo FoodDatabase. Adicionar ao diário exige confirmação explícita — sem gravação automática."
          >
            {renderProposal()}
          </SectionCard>
        ) : null}

        {uiState !== 'idle' && uiState !== 'loading' && uiState !== 'success' ? (
          <EmptyState
            title={UI_STATE_COPY[uiState].title}
            hint={failureMessage ?? UI_STATE_COPY[uiState].hint}
            action={
              uiState === 'invalid-response' || uiState === 'timeout-error'
                ? (
                  <button
                    type="button"
                    onClick={() => void handleAsk()}
                    className="min-h-[44px] px-4 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl text-xs transition-all active:scale-[0.98]"
                  >
                    Tentar novamente
                  </button>
                )
                : undefined
            }
          />
        ) : null}

        <div className="bg-gym-rose/5 border border-gym-rose/10 text-gym-rose rounded-xl p-3.5 text-[10px] leading-relaxed">
          <span className="font-bold">Nota de responsabilidade:</span> a IA sugere combinações do catálogo verificado com números
          recalculados — não é prescrição dietética e não substitui um nutricionista clínico qualificado.
        </div>
      </div>
    </div>
  );
}
