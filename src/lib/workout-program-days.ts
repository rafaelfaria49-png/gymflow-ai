import type { ProgramDay, WorkoutProgram } from '../types';

export type ProgramDaysResolution =
  | { kind: 'canonical'; days: ProgramDay[] }
  | { kind: 'legacy-flat'; days: []; exerciseCount: number }
  | { kind: 'empty'; days: [] };

function isProgramDay(value: unknown): value is ProgramDay {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProgramDay>;
  return typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && Array.isArray(candidate.slots);
}

function legacyExerciseCount(program: WorkoutProgram): number {
  const exercises = (program as unknown as { exercises?: unknown }).exercises;
  if (!Array.isArray(exercises)) return 0;
  return exercises.filter((entry) => (
    Boolean(entry)
    && typeof entry === 'object'
    && typeof (entry as { exerciseId?: unknown }).exerciseId === 'string'
  )).length;
}

/**
 * Leitura defensiva da semana canônica. Payloads antigos podem omitir toda a cadeia;
 * a resolução nunca lança e não fabrica um ProgramDay para conteúdo achatado.
 */
export function resolveProgramDays(program: WorkoutProgram | null | undefined): ProgramDaysResolution {
  if (!program) return { kind: 'empty', days: [] };

  const weeks = (program as unknown as { weeks?: unknown }).weeks;
  const firstWeek = Array.isArray(weeks) ? weeks[0] : undefined;
  const rawDays = firstWeek && typeof firstWeek === 'object'
    ? (firstWeek as { days?: unknown }).days
    : undefined;
  const days = Array.isArray(rawDays) ? rawDays.filter(isProgramDay) : [];
  if (days.length > 0) return { kind: 'canonical', days };

  const exerciseCount = legacyExerciseCount(program);
  if (exerciseCount > 0) return { kind: 'legacy-flat', days: [], exerciseCount };
  return { kind: 'empty', days: [] };
}

/** Atalho para chamadores que só aceitam dias canônicos. Sempre devolve um array. */
export function getProgramDays(program: WorkoutProgram | null | undefined): ProgramDay[] {
  const resolution = resolveProgramDays(program);
  return resolution.kind === 'canonical' ? resolution.days : [];
}
