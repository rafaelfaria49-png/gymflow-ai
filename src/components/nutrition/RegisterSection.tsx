'use client';

import React, { useMemo, useState } from 'react';
import { Heart, Search } from 'lucide-react';
import { useGymFlow } from '../../providers/GymFlowContext';
import { useToast } from '../ui/Toast';
import { FOOD_DATABASE, scaleFoodReferenceToGrams } from '../../lib/nutrition/food-database';
import {
  confirmUserFoodDraft,
  validateUserFoodInput,
  type FoodReference,
  type UserFoodDraft,
} from '../../lib/nutrition/food-types';
import type { MealType } from '../../lib/nutrition/ledger-types';
import { EmptyState, NUTRITION_MEAL_OPTIONS, SectionCard } from './shared';

export const RegisterSection = () => {
  const {
    logFoodReference,
    nutritionFavorites,
    nutritionRecents,
    toggleNutritionFavorite,
  } = useGymFlow();
  const toast = useToast();

  const [mealType, setMealType] = useState<MealType>('lunch');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grams, setGrams] = useState('100');
  const [saving, setSaving] = useState(false);

  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customServing, setCustomServing] = useState('100');
  const [customCalories, setCustomCalories] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [customFat, setCustomFat] = useState('');
  const [pendingDraft, setPendingDraft] = useState<UserFoodDraft | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [explicitConfirm, setExplicitConfirm] = useState(false);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];
    try {
      return FOOD_DATABASE.search(trimmed, { limit: 8 });
    } catch {
      return [];
    }
  }, [query]);

  const favoriteFoods = useMemo(
    () => nutritionFavorites
      .map((id) => FOOD_DATABASE.getById(id))
      .filter((ref): ref is FoodReference => ref !== null)
      .slice(0, 6),
    [nutritionFavorites],
  );

  const recentFoods = useMemo(
    () => nutritionRecents
      .map((id) => FOOD_DATABASE.getById(id))
      .filter((ref): ref is FoodReference => ref !== null)
      .slice(0, 6),
    [nutritionRecents],
  );

  const selected: FoodReference | null = useMemo(
    () => (selectedId ? FOOD_DATABASE.getById(selectedId) : null),
    [selectedId],
  );

  const preview = useMemo(() => {
    if (!selected) return null;
    const gramsNumber = Number(grams);
    if (!Number.isFinite(gramsNumber) || gramsNumber <= 0) return null;
    try {
      return scaleFoodReferenceToGrams(selected, gramsNumber);
    } catch {
      return null;
    }
  }, [selected, grams]);

  const handleSelect = (reference: FoodReference) => {
    setSelectedId(reference.id);
    setGrams(String(reference.servingReferenceGrams));
  };

  const handleConfirmFood = async () => {
    if (!selected || !preview) {
      toast.error('Selecione um alimento e informe uma quantidade válida em gramas.');
      return;
    }
    setSaving(true);
    try {
      const ok = await logFoodReference(selected, preview.grams, mealType);
      if (ok) {
        toast.success(`${selected.name} registrado no diário!`);
        setSelectedId(null);
        setQuery('');
        setGrams('100');
      } else {
        toast.error('Não foi possível registrar o alimento agora.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPendingDraft(null);
    setPendingMessage(null);
    const validation = validateUserFoodInput({
      name: customName,
      servingGrams: Number(customServing),
      calories: Number(customCalories),
      protein: Number(customProtein),
      carbs: Number(customCarbs),
      fat: Number(customFat),
    });
    if (validation.status === 'REJECTED') {
      toast.error(validation.message);
      return;
    }
    if (validation.status === 'NEEDS_CONFIRMATION') {
      // Trava de 15% do NUT-005: exige confirmação explícita em duas etapas —
      // nenhuma seleção grava automaticamente.
      setPendingDraft(validation.draft);
      setPendingMessage(validation.message);
      setExplicitConfirm(false);
      return;
    }
    void persistCustomReference(validation.reference, validation.reference.servingReferenceGrams);
  };

  const persistCustomReference = async (reference: FoodReference, gramsValue: number) => {
    setSaving(true);
    try {
      const ok = await logFoodReference(reference, gramsValue, mealType);
      if (ok) {
        toast.success(`${reference.name} registrado no diário!`);
        setCustomName('');
        setCustomServing('100');
        setCustomCalories('');
        setCustomProtein('');
        setCustomCarbs('');
        setCustomFat('');
        setPendingDraft(null);
        setPendingMessage(null);
        setExplicitConfirm(false);
      } else {
        toast.error('Não foi possível registrar o alimento agora.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDraft = () => {
    if (!pendingDraft) return;
    if (!explicitConfirm) {
      toast.error('Confirme explicitamente que os valores estão corretos.');
      return;
    }
    try {
      const reference = confirmUserFoodDraft(pendingDraft, { confirmed: true });
      void persistCustomReference(reference, pendingDraft.servingGrams);
    } catch {
      toast.error('Não foi possível confirmar o alimento manual.');
    }
  };

  return (
    <div className="space-y-3">
      <SectionCard title="Tipo de refeição" subtitle="Etapa 1 de 4 — o registro entra na refeição escolhida do dia ativo.">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="radiogroup" aria-label="Tipo de refeição">
          {NUTRITION_MEAL_OPTIONS.map((option) => {
            const active = mealType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMealType(option.value)}
                className={`min-h-[44px] flex-shrink-0 px-4 rounded-xl text-xs font-bold transition-all active:scale-[0.98] border ${
                  active
                    ? 'bg-gym-accent text-gym-dark border-gym-accent'
                    : 'bg-white/5 text-white border-white/10 hover:border-gym-accent/30'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Buscar alimento" subtitle="Etapa 2 de 4 — busca no catálogo verificado (160 itens, offline). Nada é gravado ao selecionar.">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gym-text-muted pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex.: arroz, frango, ovo…"
            aria-label="Buscar alimento no catálogo"
            className="w-full min-h-[44px] bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gym-text-muted outline-none"
          />
        </div>

        {query.trim().length === 0 ? (
          <div className="space-y-3">
            {favoriteFoods.length > 0 ? (
              <div>
                <p className="text-[10px] font-extrabold uppercase text-gym-text-muted tracking-wider mb-1.5">Favoritos</p>
                <ul className="space-y-1.5">
                  {favoriteFoods.map((food) => (
                    <FoodRow
                      key={food.id}
                      food={food}
                      isFavorite
                      isSelected={selectedId === food.id}
                      onSelect={() => handleSelect(food)}
                      onToggleFavorite={() => toggleNutritionFavorite(food.id)}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
            {recentFoods.length > 0 ? (
              <div>
                <p className="text-[10px] font-extrabold uppercase text-gym-text-muted tracking-wider mb-1.5">Recentes</p>
                <ul className="space-y-1.5">
                  {recentFoods.map((food) => (
                    <FoodRow
                      key={food.id}
                      food={food}
                      isFavorite={nutritionFavorites.includes(food.id)}
                      isSelected={selectedId === food.id}
                      onSelect={() => handleSelect(food)}
                      onToggleFavorite={() => toggleNutritionFavorite(food.id)}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
            {favoriteFoods.length === 0 && recentFoods.length === 0 ? (
              <EmptyState
                title="Busque um alimento acima"
                hint="Digite para pesquisar no catálogo verificado. Favoritos e recentes aparecem aqui após o uso."
              />
            ) : null}
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            title="Nenhum alimento encontrado"
            hint="Tente outro termo (a busca ignora acentos e maiúsculas) ou cadastre um alimento manual abaixo."
          />
        ) : (
          <ul className="space-y-1.5" aria-label="Resultados da busca">
            {results.map((food) => (
              <FoodRow
                key={food.id}
                food={food}
                isFavorite={nutritionFavorites.includes(food.id)}
                isSelected={selectedId === food.id}
                onSelect={() => handleSelect(food)}
                onToggleFavorite={() => toggleNutritionFavorite(food.id)}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      {selected && preview ? (
        <SectionCard title="Quantidade e confirmação" subtitle="Etapas 3 e 4 — confira o preview nutricional e confirme para gravar o FoodEntry real.">
          <div className="bg-white/5 border border-gym-accent/25 rounded-2xl p-3.5 space-y-3">
            <div>
              <p className="text-sm font-bold text-white">{selected.name}</p>
              <p className="text-[10px] text-gym-text-muted mt-0.5">
                {selected.source} · porção de referência: {selected.servingReferenceGrams}g ({selected.servingDescription})
              </p>
            </div>
            <div>
              <label htmlFor="nut-register-grams" className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1">
                Quantidade (gramas)
              </label>
              <input
                id="nut-register-grams"
                type="number"
                inputMode="decimal"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                min="1"
                step="any"
                className="w-full min-h-[44px] bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-4 py-2.5 text-sm text-white outline-none"
              />
              <div className="grid grid-cols-4 gap-1.5 mt-2">
                {[0.5, 1, 1.5, 2].map((factor) => (
                  <button
                    key={factor}
                    type="button"
                    onClick={() => setGrams(String(Math.round(selected.servingReferenceGrams * factor)))}
                    className="min-h-[44px] bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[11px] font-bold text-white"
                    aria-label={`Usar ${factor} vez a porção de referência`}
                  >
                    {factor}x
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-gym-dark/60 border border-white/10 rounded-xl p-3">
              <p className="text-[10px] font-extrabold uppercase text-gym-text-muted tracking-wider">Preview nutricional ({preview.grams}g)</p>
              <p className="text-xs font-mono text-white mt-1">
                {preview.calories} kcal · P {preview.protein}g · C {preview.carbs}g · G {preview.fat}g
              </p>
              <p className="text-[10px] text-gym-text-muted mt-1">Cálculo determinístico do FoodDatabase — sem estimativa.</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="min-h-[44px] flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmFood}
                disabled={saving}
                className="min-h-[44px] flex-1 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold rounded-xl text-xs uppercase tracking-wider disabled:opacity-60"
              >
                {saving ? 'Registrando…' : 'Confirmar registro'}
              </button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Alimento manual (USER_CONFIRMED)" subtitle="Cadastro assistido com trava energética de 15% do NUT-005. Divergência acima de 15% exige confirmação explícita.">
        <button
          type="button"
          onClick={() => setCustomOpen((prev) => !prev)}
          aria-expanded={customOpen}
          className="min-h-[44px] w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white"
        >
          {customOpen ? 'Fechar cadastro manual' : 'Cadastrar alimento manual'}
        </button>
        {customOpen ? (
          <form onSubmit={handleCustomSubmit} className="space-y-2.5 pt-1">
            <div>
              <label htmlFor="nut-custom-name" className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1">Nome do alimento</label>
              <input
                id="nut-custom-name"
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Ex.: Marmita da vovó"
                className="w-full min-h-[44px] bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-3 py-2.5 text-sm text-white placeholder-gym-text-muted outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="nut-custom-serving" className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1">Porção (g)</label>
                <input id="nut-custom-serving" type="number" inputMode="decimal" value={customServing} onChange={(e) => setCustomServing(e.target.value)} min="1" step="any" className="w-full min-h-[44px] bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-3 py-2 text-sm text-white outline-none" />
              </div>
              <div>
                <label htmlFor="nut-custom-kcal" className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1">Calorias (kcal)</label>
                <input id="nut-custom-kcal" type="number" inputMode="decimal" value={customCalories} onChange={(e) => setCustomCalories(e.target.value)} min="1" step="any" className="w-full min-h-[44px] bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-3 py-2 text-sm text-white outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="nut-custom-p" className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1 text-center">Prot. (g)</label>
                <input id="nut-custom-p" type="number" inputMode="decimal" value={customProtein} onChange={(e) => setCustomProtein(e.target.value)} min="0" step="any" className="w-full min-h-[44px] bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl py-2 text-center text-sm text-white outline-none" />
              </div>
              <div>
                <label htmlFor="nut-custom-c" className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1 text-center">Carbo (g)</label>
                <input id="nut-custom-c" type="number" inputMode="decimal" value={customCarbs} onChange={(e) => setCustomCarbs(e.target.value)} min="0" step="any" className="w-full min-h-[44px] bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl py-2 text-center text-sm text-white outline-none" />
              </div>
              <div>
                <label htmlFor="nut-custom-f" className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1 text-center">Gord. (g)</label>
                <input id="nut-custom-f" type="number" inputMode="decimal" value={customFat} onChange={(e) => setCustomFat(e.target.value)} min="0" step="any" className="w-full min-h-[44px] bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl py-2 text-center text-sm text-white outline-none" />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] w-full bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold rounded-xl text-xs uppercase tracking-wider disabled:opacity-60"
            >
              Validar e registrar
            </button>
            {pendingDraft && pendingMessage ? (
              <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-2xl p-3.5 space-y-2.5" role="alert">
                <p className="text-[11px] text-yellow-200 leading-relaxed">{pendingMessage}</p>
                <p className="text-[11px] font-mono text-white/80">
                  Teórica: {pendingDraft.theoreticalKcal.toFixed(1)} kcal · divergência: {(pendingDraft.divergenceRelative * 100).toFixed(1)}%
                </p>
                <label className="flex items-start gap-2.5 min-h-[44px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={explicitConfirm}
                    onChange={(e) => setExplicitConfirm(e.target.checked)}
                    className="mt-1 w-5 h-5 accent-lime-400"
                  />
                  <span className="text-[11px] text-white/85 leading-relaxed">
                    Confirmo explicitamente que os valores acima estão corretos e quero registrar como USER_CONFIRMED.
                  </span>
                </label>
                <button
                  type="button"
                  onClick={handleConfirmDraft}
                  disabled={saving || !explicitConfirm}
                  className="min-h-[44px] w-full bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold rounded-xl text-xs uppercase tracking-wider disabled:opacity-50"
                >
                  Confirmar e registrar
                </button>
              </div>
            ) : null}
          </form>
        ) : null}
      </SectionCard>
    </div>
  );
};

function FoodRow({
  food,
  isFavorite,
  isSelected,
  onSelect,
  onToggleFavorite,
}: {
  food: FoodReference;
  isFavorite: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <li
      className={`flex items-center gap-2 bg-white/5 border rounded-2xl p-2 pl-3 transition-all ${
        isSelected ? 'border-gym-accent/50' : 'border-white/10'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        className="min-h-[44px] flex-1 text-left"
      >
        <span className="block text-xs font-bold text-white leading-tight">{food.name}</span>
        <span className="block text-[10px] text-gym-text-muted font-mono mt-0.5">
          {food.per100g.calories} kcal/100g · P {food.per100g.protein}g · {food.source}
        </span>
      </button>
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-pressed={isFavorite}
        aria-label={isFavorite ? `Remover ${food.name} dos favoritos` : `Adicionar ${food.name} aos favoritos`}
        className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border transition-all active:scale-95 ${
          isFavorite ? 'text-gym-accent border-gym-accent/40 bg-gym-accent/10' : 'text-gym-text-muted border-white/10 bg-white/5'
        }`}
      >
        <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
      </button>
    </li>
  );
}
