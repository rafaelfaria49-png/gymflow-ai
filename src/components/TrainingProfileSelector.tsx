'use client';

import { useState } from 'react';
import {
  MAX_RETURN_NOTES_LENGTH,
  MAX_TRAINING_EXPERIENCE_YEARS,
  TRAINING_BREAK_DURATION_DEFINITIONS,
  TRAINING_EXPERIENCE_DEFINITIONS,
  TRAINING_STATUS_DEFINITIONS,
  getCurrentCivilDate,
  validateTrainingProfile,
} from '../lib/training-profile';
import type {
  ReturnToTrainingProfile,
  TrainingBreakDuration,
  TrainingContinuityStatus,
  TrainingExperienceLevel,
  TrainingProfileFields,
} from '../types/training-profile';

interface TrainingProfileSelectorProps {
  value: TrainingProfileFields;
  onChange: (value: TrainingProfileFields) => void;
  idPrefix: string;
}

export function TrainingProfileSelector({ value, onChange, idPrefix }: TrainingProfileSelectorProps) {
  const [showOptionalReturnDetails, setShowOptionalReturnDetails] = useState(Boolean(
    value.returnToTraining?.resumedAt
    || value.returnToTraining?.previousLevel
    || value.returnToTraining?.notes,
  ));
  const today = getCurrentCivilDate();
  const validation = validateTrainingProfile(value, today);

  const updateReturnProfile = (patch: Partial<ReturnToTrainingProfile>) => {
    onChange({
      ...value,
      returnToTraining: { ...value.returnToTraining, ...patch },
    });
  };

  const updateStatus = (trainingStatus: TrainingContinuityStatus) => {
    onChange({
      ...value,
      trainingStatus,
      returnToTraining: trainingStatus === 'returning'
        ? value.returnToTraining ?? {}
        : value.returnToTraining,
    });
  };

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2.5">
        <legend className="text-xs font-bold text-white mb-2">Qual é sua experiência com musculação?</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {TRAINING_EXPERIENCE_DEFINITIONS.map((definition) => (
            <button
              key={definition.id}
              type="button"
              aria-pressed={value.level === definition.id}
              onClick={() => onChange({ ...value, level: definition.id })}
              className={`p-3 rounded-xl text-left border transition-all ${
                value.level === definition.id
                  ? 'border-gym-accent bg-gym-accent/10'
                  : 'border-white/5 bg-white/5 hover:bg-white/10'
              }`}
            >
              <span className={`block text-sm font-bold ${value.level === definition.id ? 'text-gym-accent' : 'text-white'}`}>
                {definition.label}
              </span>
              <span className="block text-[10px] leading-relaxed text-gym-text-muted mt-1">
                {definition.description}
              </span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gym-text-muted leading-relaxed">
          {TRAINING_EXPERIENCE_DEFINITIONS.find((item) => item.id === value.level)?.guidance}
        </p>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-experience-years`} className="text-xs font-bold text-white block">
          Experiência aproximada em anos <span className="font-normal text-gym-text-muted">(opcional)</span>
        </label>
        <input
          id={`${idPrefix}-experience-years`}
          type="number"
          min={0}
          max={MAX_TRAINING_EXPERIENCE_YEARS}
          step={1}
          value={value.trainingExperienceYears ?? ''}
          onChange={(event) => onChange({
            ...value,
            trainingExperienceYears: event.target.value === '' ? undefined : Number(event.target.value),
          })}
          className="w-full min-h-[44px] bg-white/5 border border-white/10 rounded-xl px-3 text-sm text-white outline-none focus:border-gym-accent"
          placeholder="Ex.: 5"
        />
        <p className="text-[9px] text-gym-text-muted">É apenas contexto; não promove nem rebaixa seu nível automaticamente.</p>
      </div>

      <fieldset className="space-y-2.5">
        <legend className="text-xs font-bold text-white mb-2">Você está voltando depois de uma pausa?</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {TRAINING_STATUS_DEFINITIONS.map((definition) => (
            <button
              key={definition.id}
              type="button"
              aria-pressed={(value.trainingStatus ?? 'active') === definition.id}
              onClick={() => updateStatus(definition.id)}
              className={`p-3 rounded-xl text-left border transition-all ${
                (value.trainingStatus ?? 'active') === definition.id
                  ? 'border-gym-accent bg-gym-accent/10'
                  : 'border-white/5 bg-white/5 hover:bg-white/10'
              }`}
            >
              <span className={`block text-xs font-bold ${(value.trainingStatus ?? 'active') === definition.id ? 'text-gym-accent' : 'text-white'}`}>
                {definition.id === 'active' ? 'Não, estou treinando normalmente' : 'Sim, estou voltando agora'}
              </span>
              <span className="block text-[10px] leading-relaxed text-gym-text-muted mt-1">
                {definition.description}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {(value.trainingStatus ?? 'active') === 'returning' && (
        <div className="space-y-4 rounded-2xl border border-gym-accent/20 bg-gym-accent/5 p-4">
          <div className="space-y-1.5">
            <label htmlFor={`${idPrefix}-break-duration`} className="text-xs font-bold text-white block">
              Quanto tempo durou aproximadamente a pausa?
            </label>
            <select
              id={`${idPrefix}-break-duration`}
              value={value.returnToTraining?.breakDuration ?? ''}
              onChange={(event) => updateReturnProfile({
                breakDuration: event.target.value
                  ? event.target.value as TrainingBreakDuration
                  : undefined,
              })}
              className="w-full min-h-[44px] bg-gym-dark border border-white/10 rounded-xl px-3 text-sm text-white outline-none focus:border-gym-accent"
            >
              <option value="">Prefiro não informar</option>
              {TRAINING_BREAK_DURATION_DEFINITIONS.map((definition) => (
                <option key={definition.id} value={definition.id}>{definition.label}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowOptionalReturnDetails((current) => !current)}
            className="min-h-[44px] text-xs font-bold text-gym-accent hover:text-gym-accent-hover"
            aria-expanded={showOptionalReturnDetails}
          >
            {showOptionalReturnDetails ? 'Ocultar detalhes opcionais' : 'Adicionar data e detalhes opcionais'}
          </button>

          {showOptionalReturnDetails && (
            <div className="space-y-4 border-t border-white/5 pt-4">
              <div className="space-y-1.5">
                <label htmlFor={`${idPrefix}-resumed-at`} className="text-xs font-bold text-white block">Quando você voltou? (opcional)</label>
                <input
                  id={`${idPrefix}-resumed-at`}
                  type="date"
                  max={today}
                  value={value.returnToTraining?.resumedAt ?? ''}
                  onChange={(event) => updateReturnProfile({ resumedAt: event.target.value || undefined })}
                  className="w-full min-h-[44px] bg-gym-dark border border-white/10 rounded-xl px-3 text-sm text-white outline-none focus:border-gym-accent"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor={`${idPrefix}-previous-level`} className="text-xs font-bold text-white block">Nível antes da pausa (opcional)</label>
                <select
                  id={`${idPrefix}-previous-level`}
                  value={value.returnToTraining?.previousLevel ?? ''}
                  onChange={(event) => updateReturnProfile({
                    previousLevel: event.target.value
                      ? event.target.value as TrainingExperienceLevel
                      : undefined,
                  })}
                  className="w-full min-h-[44px] bg-gym-dark border border-white/10 rounded-xl px-3 text-sm text-white outline-none focus:border-gym-accent"
                >
                  <option value="">Prefiro não informar</option>
                  {TRAINING_EXPERIENCE_DEFINITIONS.map((definition) => (
                    <option key={definition.id} value={definition.id}>{definition.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={`${idPrefix}-return-notes`} className="text-xs font-bold text-white block">Contexto pessoal (opcional)</label>
                <textarea
                  id={`${idPrefix}-return-notes`}
                  maxLength={MAX_RETURN_NOTES_LENGTH}
                  value={value.returnToTraining?.notes ?? ''}
                  onChange={(event) => updateReturnProfile({ notes: event.target.value || undefined })}
                  className="w-full min-h-24 bg-gym-dark border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-gym-accent resize-y"
                  placeholder="Sem diagnósticos ou dados médicos. Ex.: estou retomando a rotina aos poucos."
                />
                <p className="text-[9px] text-gym-text-muted text-right">
                  {value.returnToTraining?.notes?.length ?? 0}/{MAX_RETURN_NOTES_LENGTH}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {!validation.valid && (
        <div role="alert" className="rounded-xl border border-gym-rose/30 bg-gym-rose/10 p-3 text-xs text-gym-rose space-y-1">
          {validation.errors.map((error) => <p key={`${error.code}-${error.path ?? ''}`}>{error.message}</p>)}
        </div>
      )}
    </div>
  );
}
