import type { ProgramDay, WorkoutProgram } from '../types';
import { programDayDisplayLabel } from './workout-day-naming';

export interface WorkoutSessionOrigin {
  sourceProgramId: string;
  sourceProgramDayId: string;
  sourceProgramName: string;
  sourceProgramDayName: string;
}

export type WorkoutStartFailureReason =
  | 'program-not-found'
  | 'program-day-not-found'
  | 'day-selection-required'
  | 'empty-program';

export type WorkoutStartResolution =
  | { status: 'free-workout' }
  | {
      status: 'program-day';
      day: ProgramDay;
      program?: WorkoutProgram;
      origin?: WorkoutSessionOrigin;
    }
  | {
      status: 'legacy-program';
      program: WorkoutProgram;
      origin: Pick<WorkoutSessionOrigin, 'sourceProgramId' | 'sourceProgramName'>;
    }
  | { status: 'error'; reason: WorkoutStartFailureReason };

export interface ResolveWorkoutStartOptions {
  programId?: string;
  program?: WorkoutProgram;
  programDayId?: string;
  explicitDay?: ProgramDay;
}

export function upsertWorkoutProgram(
  programs: WorkoutProgram[],
  savedProgram: WorkoutProgram,
): WorkoutProgram[] {
  const index = programs.findIndex((program) => program.id === savedProgram.id);
  if (index === -1) return [...programs, savedProgram];
  if (programs[index] === savedProgram) return programs;
  return programs.map((program, currentIndex) => (
    currentIndex === index ? savedProgram : program
  ));
}

export function workoutSessionOriginForProgramDay(
  program: WorkoutProgram,
  day: ProgramDay,
): WorkoutSessionOrigin {
  return {
    sourceProgramId: program.id,
    sourceProgramDayId: day.id,
    sourceProgramName: program.name,
    sourceProgramDayName: programDayDisplayLabel(day),
  };
}

/** Resolve o início sem jamais escolher silenciosamente o primeiro dia. */
export function resolveWorkoutStart(options: ResolveWorkoutStartOptions): WorkoutStartResolution {
  const { programId, programDayId, explicitDay } = options;
  const program = !programId || options.program?.id === programId ? options.program : undefined;
  const hasProgramRequest = Boolean(programId || programDayId || explicitDay || program);

  if (!hasProgramRequest) return { status: 'free-workout' };
  if (programId && !program) return { status: 'error', reason: 'program-not-found' };

  if (programDayId) {
    if (explicitDay) {
      if (explicitDay.id !== programDayId) {
        return { status: 'error', reason: 'program-day-not-found' };
      }
      return {
        status: 'program-day',
        day: explicitDay,
        ...(program ? {
          program,
          origin: workoutSessionOriginForProgramDay(program, explicitDay),
        } : {}),
      };
    }

    if (!program) {
      return {
        status: 'error',
        reason: programId ? 'program-not-found' : 'program-day-not-found',
      };
    }

    const exactDay = (program.weeks ?? [])
      .flatMap((week) => week.days)
      .find((day) => day.id === programDayId);
    if (!exactDay) return { status: 'error', reason: 'program-day-not-found' };
    return {
      status: 'program-day',
      day: exactDay,
      program,
      origin: workoutSessionOriginForProgramDay(program, exactDay),
    };
  }

  // explicitDay representa uma escolha explícita já feita no Construtor.
  if (explicitDay) {
    return {
      status: 'program-day',
      day: explicitDay,
      ...(program ? {
        program,
        origin: workoutSessionOriginForProgramDay(program, explicitDay),
      } : {}),
    };
  }

  if (!program) {
    return { status: 'error', reason: 'program-not-found' };
  }

  const allDays = (program.weeks ?? []).flatMap((week) => week.days);
  if (allDays.length === 1) {
    return {
      status: 'program-day',
      day: allDays[0],
      program,
      origin: workoutSessionOriginForProgramDay(program, allDays[0]),
    };
  }
  if (allDays.length > 1) {
    return { status: 'error', reason: 'day-selection-required' };
  }

  // Compatibilidade documentada: programas antigos podem ter apenas a lista achatada.
  if (program.exercises.length > 0) {
    return {
      status: 'legacy-program',
      program,
      origin: {
        sourceProgramId: program.id,
        sourceProgramName: program.name,
      },
    };
  }

  return { status: 'error', reason: 'empty-program' };
}
