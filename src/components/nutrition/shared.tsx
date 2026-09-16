'use client';

import type { MealType } from '../../lib/nutrition/ledger-types';

export const NUTRITION_MEAL_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Café da manhã' },
  { value: 'lunch', label: 'Almoço' },
  { value: 'dinner', label: 'Jantar' },
  { value: 'snack', label: 'Lanche' },
  { value: 'custom', label: 'Outra' },
];

export function mealLabel(type: MealType): string {
  return NUTRITION_MEAL_OPTIONS.find((option) => option.value === type)?.label ?? 'Refeição';
}

export function formatKcal(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value)} kcal`;
}

export function formatGrams(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value * 10) / 10}g`;
}

export function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass p-4 rounded-3xl border border-white/5 space-y-3">
      <header>
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {subtitle ? <p className="text-[11px] text-gym-text-muted mt-0.5 leading-relaxed">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function MacroProgressRow({
  label,
  consumed,
  target,
  unit,
}: {
  label: string;
  consumed: number;
  target: number | null;
  unit: string;
}) {
  const percent = target !== null && target > 0
    ? Math.min(100, Math.round((consumed / target) * 100))
    : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold text-white/90">{label}</span>
        <span className="text-[11px] font-mono text-gym-text-muted">
          {formatGrams(consumed).replace('g', unit)}
          {target !== null ? ` / ${formatGrams(target).replace('g', unit)}` : ' / —'}
        </span>
      </div>
      <div
        className="h-2 rounded-full bg-white/10 overflow-hidden"
        role="progressbar"
        aria-label={`${label}: ${consumed} de ${target ?? 'meta indisponível'}`}
        aria-valuenow={target !== null ? percent : 0}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-gym-accent transition-all duration-500"
          style={{ width: `${target !== null ? percent : 0}%` }}
        />
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-dashed border-white/15 rounded-2xl p-4 text-center space-y-2">
      <p className="text-xs font-bold text-white">{title}</p>
      <p className="text-[11px] text-gym-text-muted leading-relaxed">{hint}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-gym-rose/5 border border-gym-rose/20 rounded-2xl p-4 space-y-2" role="alert">
      <p className="text-xs font-bold text-gym-rose">Não foi possível carregar os dados de nutrição.</p>
      <p className="text-[11px] text-white/70 leading-relaxed">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-[44px] px-4 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl text-xs transition-all active:scale-[0.98]"
      >
        Tentar novamente
      </button>
    </div>
  );
}
