import {
  getTrainingBreakDurationDefinition,
  resolveTrainingProfile,
} from '../lib/training-profile';
import type { TrainingProfileSource } from '../types/training-profile';

interface TrainingProfileSummaryProps {
  profile: TrainingProfileSource;
  compact?: boolean;
}

export function TrainingProfileSummary({ profile, compact = false }: TrainingProfileSummaryProps) {
  const resolved = resolveTrainingProfile(profile);
  const breakLabel = getTrainingBreakDurationDefinition(resolved.returnToTraining?.breakDuration)?.label;

  return (
    <div className="rounded-2xl border border-gym-accent/20 bg-gym-accent/5 p-4" data-training-profile-summary>
      <p className="text-[10px] font-black uppercase tracking-wider text-gym-accent">Perfil de treino</p>
      <h4 className="mt-1 text-base font-black text-white">{resolved.displayName}</h4>
      {!compact && (
        <>
          <p className="mt-1 text-xs leading-relaxed text-gym-text-muted">
            {resolved.trainingStatus === 'returning'
              ? 'Seu nível de experiência foi preservado. Este contexto poderá orientar ajustes futuros de volume.'
              : 'Seu nível representa sua experiência atual e não é calculado automaticamente por idade ou carga.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-gym-text-muted">
            {resolved.trainingExperienceYears !== undefined && <span>{resolved.trainingExperienceYears} anos de experiência aproximada</span>}
            {breakLabel && <span>• Pausa: {breakLabel}</span>}
          </div>
        </>
      )}
    </div>
  );
}
