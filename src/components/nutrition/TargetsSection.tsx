'use client';

import { useGymFlow } from '../../providers/GymFlowContext';
import { EmptyState, ErrorState, SectionCard } from './shared';

const UNAVAILABLE_REASON_TEXT: Record<string, { title: string; guidance: string }> = {
  PROFILE_ABSENT: {
    title: 'Perfil nutricional ausente',
    guidance: 'Cadastre ou recalibre seu perfil (idade, sexo biológico para cálculos, altura, peso e objetivo) para ativar metas automáticas. O registro manual de água e alimentos continua funcionando.',
  },
  AUTOMATION_BLOCKED: {
    title: 'Metas automáticas bloqueadas pelo gate de segurança',
    guidance: 'O motor identificou uma condição que exige acompanhamento profissional antes de gerar metas (ex.: gestação, lactação, doença renal crônica ou menoridade). Procure um nutricionista ou médico. O registro manual continua liberado.',
  },
  TARGET_RESOLUTION_ERROR: {
    title: 'Falha ao calcular metas agora',
    guidance: 'Não foi possível resolver as metas automáticas neste momento. Tente recarregar; se persistir, revise o perfil. Nenhum número foi fabricado — o consumo real segue disponível na aba Hoje.',
  },
};

export const TargetsSection = () => {
  const { nutritionDay, nutritionLoading, nutritionError, refreshNutrition } = useGymFlow();

  if (nutritionLoading) {
    return (
      <div className="glass p-4 rounded-3xl border border-white/5 animate-pulse" aria-busy="true" aria-label="Carregando metas">
        <div className="h-4 w-1/2 bg-white/10 rounded" />
        <div className="h-20 w-full bg-white/5 rounded-xl mt-3" />
      </div>
    );
  }

  if (nutritionError && !nutritionDay) {
    return <ErrorState message={nutritionError} onRetry={() => void refreshNutrition()} />;
  }

  if (!nutritionDay) {
    return (
      <EmptyState
        title="Metas indisponíveis"
        hint="O diário nutricional não pôde ser carregado. Tente recarregar."
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

  if (nutritionDay.targetState === 'AUTOMATED' && nutritionDay.targets !== null) {
    const targets = nutritionDay.targets;
    const gate = nutritionDay.gateSnapshot;
    const gateResult = gate.kind === 'EVALUATED' ? gate.result : null;
    return (
      <div className="space-y-3">
        <SectionCard title="Metas automáticas de hoje" subtitle="Targets reais do NutritionEngine — autoridade exclusiva dos números abaixo.">
          <dl className="grid grid-cols-2 gap-2">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
              <dt className="text-[10px] font-bold uppercase text-gym-text-muted">Calorias</dt>
              <dd className="font-mono font-bold text-white text-sm">{targets.targetCalories} kcal</dd>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
              <dt className="text-[10px] font-bold uppercase text-gym-text-muted">Água</dt>
              <dd className="font-mono font-bold text-white text-sm">{targets.targetWaterMl} ml</dd>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
              <dt className="text-[10px] font-bold uppercase text-gym-text-muted">Proteína</dt>
              <dd className="font-mono font-bold text-gym-accent text-sm">{targets.targetProteinGrams}g</dd>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
              <dt className="text-[10px] font-bold uppercase text-gym-text-muted">Carbo / Gordura</dt>
              <dd className="font-mono font-bold text-white text-sm">{targets.targetCarbsGrams}g / {targets.targetFatGrams}g</dd>
            </div>
          </dl>
          <div className="bg-gym-dark/60 border border-white/10 rounded-2xl p-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] font-bold uppercase text-gym-text-muted">BMR</p>
              <p className="font-mono text-xs text-white">{targets.bmrKcal} kcal</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-gym-text-muted">TDEE</p>
              <p className="font-mono text-xs text-white">{targets.tdeeKcal} kcal</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-gym-text-muted">Balanço</p>
              <p className="font-mono text-xs text-white">{targets.energyBalanceKcal} kcal</p>
            </div>
          </div>
          <div className="text-[10px] text-gym-text-muted font-mono leading-relaxed">
            motor {targets.engineVersion} · fórmula {targets.formulaVersion} · motivo {targets.computedReason}
          </div>
          {targets.isLimitedGuidance ? (
            <p className="text-[11px] text-yellow-200 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 leading-relaxed">
              Orientação limitada: os cálculos usam parâmetros estimados. Revise o perfil para refinar as metas. Não substitui acompanhamento profissional.
            </p>
          ) : null}
          {targets.estimationTolerance.reason !== 'NONE' ? (
            <p className="text-[11px] text-white/70 leading-relaxed">
              Faixa estimada: {targets.estimationTolerance.targetCaloriesLowerKcal}–{targets.estimationTolerance.targetCaloriesUpperKcal} kcal
              (±{(targets.estimationTolerance.relative * 100).toFixed(0)}% — {targets.estimationTolerance.reason}).
            </p>
          ) : null}
          {gateResult ? (
            <p className="text-[10px] text-gym-text-muted leading-relaxed">
              Gate: {gateResult.status} · {gateResult.userNoticeKey}
              {gateResult.suggestedAction ? ` · ação sugerida: ${gateResult.suggestedAction}` : ''}
            </p>
          ) : null}
        </SectionCard>
      </div>
    );
  }

  const reason = nutritionDay.targetState === 'MANUAL_ONLY' ? nutritionDay.targetUnavailableReason : 'TARGET_RESOLUTION_ERROR';
  const copy = UNAVAILABLE_REASON_TEXT[reason] ?? UNAVAILABLE_REASON_TEXT.TARGET_RESOLUTION_ERROR;
  const gate = nutritionDay.gateSnapshot;
  const gateDetail = gate.kind === 'EVALUATED'
    ? `Gate: ${gate.result.status} (${gate.result.userNoticeKey}). Motivos: ${gate.result.reasons.join(', ') || '—'}.`
    : 'Gate: perfil ausente — nenhuma avaliação automática foi executada.';
  return (
    <div className="space-y-3">
      <SectionCard title="Metas automáticas indisponíveis" subtitle="Nenhum número foi fabricado — o app mostra o motivo real abaixo.">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-bold text-white">{copy.title} ({reason})</p>
          <p className="text-[11px] text-gym-text-muted leading-relaxed">{copy.guidance}</p>
          <p className="text-[10px] text-gym-text-muted font-mono leading-relaxed">{gateDetail}</p>
        </div>
        <button
          type="button"
          onClick={() => void refreshNutrition()}
          className="min-h-[44px] w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-xs"
        >
          Recarregar metas
        </button>
      </SectionCard>
    </div>
  );
};
