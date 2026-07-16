import type {
  ResolvedTrainingProfile,
  TrainingBreakDuration,
  TrainingBreakDurationDefinition,
  TrainingContinuityStatus,
  TrainingExperienceDefinition,
  TrainingExperienceLevel,
  TrainingProfileSource,
  TrainingProfileValidationIssue,
  TrainingProfileValidationResult,
  TrainingStatusDefinition,
} from '../types/training-profile';

export const MAX_TRAINING_EXPERIENCE_YEARS = 80;
export const MAX_RETURN_NOTES_LENGTH = 500;

export const TRAINING_EXPERIENCE_DEFINITIONS: readonly TrainingExperienceDefinition[] = Object.freeze([
  {
    id: 'beginner',
    label: 'Iniciante',
    compactLabel: 'Iniciante',
    description: 'Ainda está desenvolvendo técnica, repertório e consistência.',
    guidance: 'Escolha se tem pouca prática consistente; carga baixa, sozinha, não define este nível.',
    order: 10,
  },
  {
    id: 'intermediate',
    label: 'Intermediário',
    compactLabel: 'Intermediário',
    description: 'Conhece os principais movimentos e registra carga, repetições e esforço.',
    guidance: 'Escolha se já treina com consistência e evolui bem com progressão estruturada.',
    order: 20,
  },
  {
    id: 'advanced',
    label: 'Avançado',
    compactLabel: 'Avançado',
    description: 'Tem experiência prolongada, técnica consolidada e boa autorregulação.',
    guidance: 'Escolha pela experiência e domínio do treino, não somente pelas cargas utilizadas.',
    order: 30,
  },
  {
    id: 'athlete',
    label: 'Atleta / Alta performance',
    compactLabel: 'Atleta',
    description: 'Treina para competição ou desempenho esportivo específico.',
    guidance: 'Não significa Personal Trainer e não deve ser escolhido apenas pelo aspecto físico.',
    order: 40,
    note: 'Personal Trainer será um papel futuro, não um nível de experiência.',
  },
]);

export const TRAINING_STATUS_DEFINITIONS: readonly TrainingStatusDefinition[] = Object.freeze([
  {
    id: 'active',
    label: 'Treinando normalmente',
    description: 'Você está mantendo sua rotina atual de treinos.',
    order: 10,
  },
  {
    id: 'returning',
    label: 'Voltando após uma pausa',
    description: 'Sua experiência anterior é preservada enquanto você retoma a rotina.',
    order: 20,
  },
]);

export const TRAINING_BREAK_DURATION_DEFINITIONS: readonly TrainingBreakDurationDefinition[] = Object.freeze([
  { id: 'less_than_1_month', label: 'Menos de 1 mês', order: 10 },
  { id: 'one_to_three_months', label: 'Entre 1 e 3 meses', order: 20 },
  { id: 'three_to_six_months', label: 'Entre 3 e 6 meses', order: 30 },
  { id: 'six_to_twelve_months', label: 'Entre 6 e 12 meses', order: 40 },
  { id: 'more_than_1_year', label: 'Mais de 1 ano', order: 50 },
]);

const experienceIds = new Set<TrainingExperienceLevel>(TRAINING_EXPERIENCE_DEFINITIONS.map((item) => item.id));
const statusIds = new Set<TrainingContinuityStatus>(TRAINING_STATUS_DEFINITIONS.map((item) => item.id));
const breakDurationIds = new Set<TrainingBreakDuration>(TRAINING_BREAK_DURATION_DEFINITIONS.map((item) => item.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isTrainingExperienceLevel(value: unknown): value is TrainingExperienceLevel {
  return typeof value === 'string' && experienceIds.has(value as TrainingExperienceLevel);
}

export function isTrainingContinuityStatus(value: unknown): value is TrainingContinuityStatus {
  return typeof value === 'string' && statusIds.has(value as TrainingContinuityStatus);
}

export function isTrainingBreakDuration(value: unknown): value is TrainingBreakDuration {
  return typeof value === 'string' && breakDurationIds.has(value as TrainingBreakDuration);
}

export function getTrainingExperienceDefinition(level: unknown): TrainingExperienceDefinition | undefined {
  return isTrainingExperienceLevel(level)
    ? TRAINING_EXPERIENCE_DEFINITIONS.find((definition) => definition.id === level)
    : undefined;
}

export function getTrainingStatusDefinition(status: unknown): TrainingStatusDefinition | undefined {
  return isTrainingContinuityStatus(status)
    ? TRAINING_STATUS_DEFINITIONS.find((definition) => definition.id === status)
    : undefined;
}

export function getTrainingBreakDurationDefinition(duration: unknown): TrainingBreakDurationDefinition | undefined {
  return isTrainingBreakDuration(duration)
    ? TRAINING_BREAK_DURATION_DEFINITIONS.find((definition) => definition.id === duration)
    : undefined;
}

export function getCurrentCivilDate(now = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidCivilDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

export function validateReturnToTrainingProfile(
  profile: unknown,
  todayCivilDate = getCurrentCivilDate(),
): TrainingProfileValidationResult {
  const errors: TrainingProfileValidationIssue[] = [];
  if (profile === undefined) return { valid: true, errors };
  if (!isRecord(profile)) {
    return { valid: false, errors: [{ code: 'invalid-return-profile', message: 'Perfil de retorno inválido.', path: 'returnToTraining' }] };
  }

  if ('previousLevel' in profile && profile.previousLevel !== undefined && !isTrainingExperienceLevel(profile.previousLevel)) {
    errors.push({ code: 'invalid-previous-level', message: 'Nível anterior desconhecido.', path: 'returnToTraining.previousLevel' });
  }
  if ('breakDuration' in profile && profile.breakDuration !== undefined && !isTrainingBreakDuration(profile.breakDuration)) {
    errors.push({ code: 'invalid-break-duration', message: 'Duração de pausa desconhecida.', path: 'returnToTraining.breakDuration' });
  }
  if ('resumedAt' in profile && profile.resumedAt !== undefined) {
    if (typeof profile.resumedAt !== 'string' || !isValidCivilDate(profile.resumedAt)) {
      errors.push({ code: 'invalid-resumed-at', message: 'Use uma data civil válida no formato AAAA-MM-DD.', path: 'returnToTraining.resumedAt' });
    } else if (isValidCivilDate(todayCivilDate) && profile.resumedAt > todayCivilDate) {
      errors.push({ code: 'future-resumed-at', message: 'A data de retorno não pode estar no futuro.', path: 'returnToTraining.resumedAt' });
    }
  }
  if ('notes' in profile && profile.notes !== undefined) {
    if (typeof profile.notes !== 'string') {
      errors.push({ code: 'invalid-notes', message: 'As observações devem ser texto.', path: 'returnToTraining.notes' });
    } else if (profile.notes.length > MAX_RETURN_NOTES_LENGTH) {
      errors.push({ code: 'notes-too-long', message: `Use no máximo ${MAX_RETURN_NOTES_LENGTH} caracteres.`, path: 'returnToTraining.notes' });
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateTrainingProfile(
  profile: unknown,
  todayCivilDate = getCurrentCivilDate(),
): TrainingProfileValidationResult {
  const errors: TrainingProfileValidationIssue[] = [];
  if (!isRecord(profile)) {
    return { valid: false, errors: [{ code: 'invalid-profile', message: 'Perfil de treino inválido.' }] };
  }

  if (!isTrainingExperienceLevel(profile.level)) {
    errors.push({ code: 'invalid-level', message: 'Nível de experiência desconhecido.', path: 'level' });
  }
  if ('trainingStatus' in profile && profile.trainingStatus !== undefined && !isTrainingContinuityStatus(profile.trainingStatus)) {
    errors.push({ code: 'invalid-status', message: 'Status de treino desconhecido.', path: 'trainingStatus' });
  }
  if ('trainingExperienceYears' in profile && profile.trainingExperienceYears !== undefined) {
    if (
      typeof profile.trainingExperienceYears !== 'number'
      || !Number.isFinite(profile.trainingExperienceYears)
      || profile.trainingExperienceYears < 0
      || profile.trainingExperienceYears > MAX_TRAINING_EXPERIENCE_YEARS
    ) {
      errors.push({
        code: 'invalid-experience-years',
        message: `A experiência aproximada deve ficar entre 0 e ${MAX_TRAINING_EXPERIENCE_YEARS} anos.`,
        path: 'trainingExperienceYears',
      });
    }
  }

  const returnValidation = validateReturnToTrainingProfile(profile.returnToTraining, todayCivilDate);
  errors.push(...returnValidation.errors);
  return { valid: errors.length === 0, errors };
}

export function getTrainingProfileDisplayName(
  profile: Pick<ResolvedTrainingProfile, 'experienceLevel' | 'trainingStatus'>,
): string {
  const definition = getTrainingExperienceDefinition(profile.experienceLevel);
  if (!definition) return 'Perfil de treino';
  return profile.trainingStatus === 'returning'
    ? `${definition.compactLabel} em retorno`
    : definition.label;
}

export function normalizeTrainingProfile(profile: TrainingProfileSource): ResolvedTrainingProfile {
  const trainingStatus = isTrainingContinuityStatus(profile.trainingStatus) ? profile.trainingStatus : 'active';
  const resolved: ResolvedTrainingProfile = {
    experienceLevel: profile.level,
    trainingStatus,
    returnToTraining: profile.returnToTraining,
    trainingExperienceYears: profile.trainingExperienceYears,
    goal: profile.goal,
    frequency: profile.frequency,
    sessionDuration: profile.duration,
    displayName: '',
  };
  return { ...resolved, displayName: getTrainingProfileDisplayName(resolved) };
}

export function resolveTrainingProfile(profile: TrainingProfileSource): ResolvedTrainingProfile {
  return normalizeTrainingProfile(profile);
}

export function isReturningToTraining(profile: { trainingStatus?: unknown }): boolean {
  return profile.trainingStatus === 'returning';
}
