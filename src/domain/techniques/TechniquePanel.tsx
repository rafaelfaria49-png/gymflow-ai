'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Clock3, LockKeyhole, ShieldAlert, TimerReset } from 'lucide-react';
import type { Exercise } from '../../types';
import type { TrainingExperienceLevel } from '../../types/training-profile';
import type {
  TechniqueId,
  TechniqueLog,
  TechniqueMiniSetLog,
  TechniquePlan,
  TechniqueSetLog,
  TechniqueStageLog,
} from './types';
import {
  createInitialTechniqueLog,
  getTechniqueSafetyWarnings,
  recordTechniqueMiniSet,
  recordTechniqueSet,
  recordTechniqueStage,
} from './model';
import { getTechniqueGate } from './profileRules';

interface TechniquePanelProps {
  plan: TechniquePlan;
  log?: TechniqueLog;
  exercise?: Exercise;
  level: TrainingExperienceLevel;
  manualUnlocks?: readonly TechniqueId[];
  onChange: (log: TechniqueLog) => void;
  onUnlock: (technique: TechniqueId) => void;
}

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function TechniqueInput({
  value,
  label,
  onChange,
  step = 1,
}: {
  value: number;
  label: string;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(numberValue(event.target.value, value))}
        className="w-full min-h-[40px] rounded-lg border border-white/10 bg-gym-dark/70 px-2 text-center text-xs font-mono text-white outline-none focus:border-gym-accent"
      />
    </label>
  );
}

function StageRow({
  stage,
  index,
  stageLabel = 'Estágio',
  autoTimer = false,
  onChange,
  onTimer,
}: {
  stage: TechniqueStageLog;
  index: number;
  stageLabel?: string;
  autoTimer?: boolean;
  onChange: (patch: Partial<Omit<TechniqueStageLog, 'id' | 'index'>>) => void;
  onTimer: (seconds: number) => void;
}) {
  return (
    <div className={`rounded-xl border p-2.5 space-y-2 ${stage.completed ? 'border-gym-accent/30 bg-gym-accent/5' : 'border-white/10 bg-white/[0.03]'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-white">{stageLabel} {index + 1}</span>
        <span className="text-[9px] text-gym-text-muted">{stage.restSec > 0 ? `${stage.restSec}s até o próximo` : 'série principal'}</span>
      </div>
      <div className="flex items-end gap-2">
        <TechniqueInput value={stage.weight} label={`Carga do estágio ${index + 1}`} onChange={(weight) => onChange({ weight })} step={0.5} />
        <TechniqueInput value={stage.reps} label={`Repetições do estágio ${index + 1}`} onChange={(reps) => onChange({ reps })} />
        <button
          type="button"
          onClick={() => {
            const completed = !stage.completed;
            onChange({ completed });
            if (completed && autoTimer && stage.restSec > 0) onTimer(stage.restSec);
          }}
          className={`min-h-[40px] min-w-[40px] rounded-lg border flex items-center justify-center ${stage.completed ? 'border-gym-accent bg-gym-accent text-gym-dark' : 'border-white/15 bg-white/5 text-transparent hover:border-gym-accent'}`}
          aria-label={stage.completed ? `Desmarcar estágio ${index + 1}` : `Concluir estágio ${index + 1}`}
        >
          <Check className="h-4 w-4 stroke-[3px]" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onChange({ failed: !stage.failed, completed: true })}
          className={`min-h-[36px] rounded-lg border px-2.5 text-[9px] font-black uppercase tracking-wide ${stage.failed ? 'border-gym-rose/50 bg-gym-rose/15 text-rose-300' : 'border-white/10 bg-white/5 text-gym-text-muted hover:text-white'}`}
        >
          {stage.failed ? 'Falhou aqui' : 'Marcar falhou aqui'}
        </button>
        {stage.restSec > 0 && (
          <button
            type="button"
            onClick={() => onTimer(stage.restSec)}
            className="min-h-[36px] rounded-lg border border-white/10 bg-white/5 px-2.5 text-[9px] font-black uppercase tracking-wide text-gym-text-muted hover:text-gym-accent"
          >
            <Clock3 className="mr-1 inline h-3 w-3" /> Descanso {stage.restSec}s
          </button>
        )}
      </div>
    </div>
  );
}

function MiniSetRow({
  mini,
  index,
  baseCompleted,
  onChange,
  onTimer,
}: {
  mini: TechniqueMiniSetLog;
  index: number;
  baseCompleted: boolean;
  onChange: (patch: Partial<Omit<TechniqueMiniSetLog, 'id' | 'index'>>) => void;
  onTimer: (seconds: number) => void;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border p-2 ${mini.completed ? 'border-gym-accent/30 bg-gym-accent/5' : 'border-white/10 bg-white/[0.03]'}`}>
      <span className="w-16 text-[9px] font-black uppercase tracking-wide text-gym-text-muted">Mini {index + 1}</span>
      <TechniqueInput
        value={mini.reps}
        label={`Repetições da mini-série ${index + 1}`}
        onChange={(reps) => onChange({ reps })}
      />
      <span className="whitespace-nowrap text-[9px] text-gym-text-muted">{mini.restSec > 0 ? `${mini.restSec}s` : 'fim'}</span>
      {mini.restSec > 0 && (
        <button
          type="button"
          disabled={!baseCompleted}
          onClick={() => onTimer(mini.restSec)}
          className="min-h-[40px] rounded-lg border border-white/10 bg-white/5 px-2 text-[9px] font-black uppercase tracking-wide text-gym-text-muted hover:text-gym-accent disabled:cursor-not-allowed disabled:opacity-35"
          aria-label={`Iniciar pausa de ${mini.restSec} segundos da mini-série ${index + 1}`}
        >
          <Clock3 className="mr-1 inline h-3 w-3" />
        </button>
      )}
      <button
        type="button"
        disabled={!baseCompleted}
        onClick={() => {
          const completed = !mini.completed;
          onChange({ completed });
          if (completed && mini.restSec > 0) onTimer(mini.restSec);
        }}
        className={`min-h-[40px] min-w-[40px] rounded-lg border flex items-center justify-center ${mini.completed ? 'border-gym-accent bg-gym-accent text-gym-dark' : 'border-white/15 bg-white/5 text-transparent hover:border-gym-accent'} disabled:cursor-not-allowed disabled:opacity-35`}
        aria-label={mini.completed ? `Desmarcar mini-série ${index + 1}` : `Concluir mini-série ${index + 1}`}
      >
        <Check className="h-4 w-4 stroke-[3px]" />
      </button>
    </div>
  );
}

function SetRow({
  set,
  index,
  onChange,
  failureAction,
}: {
  set: TechniqueSetLog;
  index: number;
  onChange: (patch: Partial<Omit<TechniqueSetLog, 'id' | 'index'>>) => void;
  failureAction: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border p-2 ${set.completed ? 'border-gym-accent/30 bg-gym-accent/5' : 'border-white/10 bg-white/[0.03]'}`}>
      <span className="w-5 text-[10px] font-black text-gym-accent">{index + 1}</span>
      <TechniqueInput value={set.weight} label={`Carga da série especial ${index + 1}`} onChange={(weight) => onChange({ weight })} step={0.5} />
      <TechniqueInput value={set.reps} label={`Repetições da série especial ${index + 1}`} onChange={(reps) => onChange({ reps })} />
      {failureAction && (
        <button
          type="button"
          onClick={() => onChange({ completed: true, failed: !set.failed })}
          className={`min-h-[40px] rounded-lg border px-2 text-[9px] font-black uppercase ${set.failed ? 'border-gym-rose/50 bg-gym-rose/15 text-rose-300' : 'border-gym-rose/25 bg-gym-rose/10 text-rose-300'}`}
        >
          {set.failed ? 'Falhou aqui' : 'Marcar falhou aqui'}
        </button>
      )}
      <button
        type="button"
        onClick={() => onChange({ completed: !set.completed })}
        className={`min-h-[40px] min-w-[40px] rounded-lg border flex items-center justify-center ${set.completed ? 'border-gym-accent bg-gym-accent text-gym-dark' : 'border-white/15 bg-white/5 text-transparent hover:border-gym-accent'}`}
        aria-label={set.completed ? `Desmarcar série especial ${index + 1}` : `Concluir série especial ${index + 1}`}
      >
        <Check className="h-4 w-4 stroke-[3px]" />
      </button>
    </div>
  );
}

export const TechniquePanel = ({
  plan,
  log,
  exercise,
  level,
  manualUnlocks = [],
  onChange,
  onUnlock,
}: TechniquePanelProps) => {
  const gate = getTechniqueGate(level, plan.type, manualUnlocks);
  const safetyWarnings = useMemo(() => getTechniqueSafetyWarnings(plan, exercise), [plan, exercise]);
  const hydratedLog = useMemo(() => log ?? createInitialTechniqueLog(plan), [log, plan]);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    if (timer <= 0) return undefined;
    const interval = window.setInterval(() => setTimer((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [timer]);

  const updateStage = (index: number, patch: Partial<Omit<TechniqueStageLog, 'id' | 'index'>>) => {
    onChange(recordTechniqueStage(hydratedLog, index, patch));
  };
  const updateSet = (index: number, patch: Partial<Omit<TechniqueSetLog, 'id' | 'index'>>) => {
    onChange(recordTechniqueSet(hydratedLog, index, patch));
  };

  if (!gate.visible) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 space-y-2">
        <div className="flex items-start gap-2">
          <LockKeyhole className="mt-0.5 h-4 w-4 flex-shrink-0 text-gym-text-muted" />
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-gym-text-muted">Técnica educativa bloqueada</span>
            <p className="mt-1 text-[10px] leading-relaxed text-gym-text-muted">{gate.education}</p>
          </div>
        </div>
        <button type="button" onClick={() => onUnlock(plan.type)} className="min-h-[40px] rounded-xl border border-gym-accent/40 bg-gym-accent/10 px-3 text-[10px] font-black uppercase tracking-wide text-gym-accent">
          Ler e liberar {gate.label}
        </button>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-gym-accent/20 bg-gym-accent/[0.03] p-3.5 space-y-3" aria-label={`Registro de ${gate.label}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gym-accent">
            <TimerReset className="h-3.5 w-3.5" /> {gate.label}
          </span>
          <p className="mt-1 text-[10px] leading-relaxed text-gym-text-muted">{gate.education}</p>
        </div>
        {timer > 0 && <span className="flex-shrink-0 rounded-full bg-gym-accent/15 px-2.5 py-1 text-xs font-mono font-black text-gym-accent">{timer}s</span>}
      </div>

      {(plan.tempo || plan.holdSec || plan.partialReps) && (
        <div className="flex flex-wrap gap-1.5 text-[9px] font-bold text-white">
          {plan.tempo && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Cadência {plan.tempo}</span>}
          {plan.holdSec && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Isometria {plan.holdSec}s</span>}
          {plan.partialReps && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{plan.partialReps} parciais · {plan.partialRange ?? 'trecho'}</span>}
        </div>
      )}

      {safetyWarnings.map((warning) => (
        <div key={warning.code} role="alert" className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-2.5 text-[10px] leading-relaxed text-amber-300">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{warning.message}</span>
        </div>
      ))}

      {(plan.type === 'drop_set' || plan.type === 'cluster') && hydratedLog.stages && (
        <div className="space-y-2">
          {hydratedLog.stages.map((stage, index) => (
            <StageRow
              key={stage.id}
              stage={stage}
              index={index}
              stageLabel={plan.type === 'cluster' ? 'Bloco' : 'Estágio'}
              autoTimer={plan.type === 'cluster'}
              onChange={(patch) => updateStage(index, patch)}
              onTimer={setTimer}
            />
          ))}
        </div>
      )}

      {plan.type !== 'drop_set' && plan.type !== 'rest_pause' && hydratedLog.sets && (
        <div className="space-y-2">
          {hydratedLog.sets.map((set, index) => (
            <SetRow key={set.id} set={set} index={index} onChange={(patch) => updateSet(index, patch)} failureAction={plan.type === 'to_failure'} />
          ))}
        </div>
      )}

      {plan.type === 'rest_pause' && hydratedLog.miniSets && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-black uppercase tracking-wider text-gym-text-muted">Mini-séries · só reps</span>
            <span className="text-[9px] text-gym-text-muted">Pausa automática de 15–20s</span>
          </div>
          {hydratedLog.sets?.[0] && !hydratedLog.sets[0].completed && (
            <p className="text-[9px] leading-relaxed text-amber-300">Conclua a série base na tabela acima para liberar as mini-séries.</p>
          )}
          {hydratedLog.miniSets.map((mini, index) => (
            <MiniSetRow
              key={mini.id}
              mini={mini}
              index={index}
              baseCompleted={hydratedLog.sets?.[0]?.completed === true}
              onChange={(patch) => onChange(recordTechniqueMiniSet(hydratedLog, index, patch))}
              onTimer={setTimer}
            />
          ))}
        </div>
      )}

      {timer === 0 && (hydratedLog.stages?.some((stage) => stage.completed && stage.restSec > 0) || hydratedLog.sets?.some((set) => set.completed)) && (
        <div className="flex items-center gap-1.5 text-[9px] font-bold text-gym-text-muted">
          <AlertTriangle className="h-3 w-3 text-gym-accent" /> Registro salvo nesta sessão; você pode editar carga e reps.
        </div>
      )}
    </section>
  );
};
