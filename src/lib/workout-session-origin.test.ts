import { describe, expect, it } from 'vitest';
import type { ProgramDay, WorkoutProgram } from '../types';
import {
  resolveWorkoutStart,
  upsertWorkoutProgram,
  workoutSessionOriginForProgramDay,
} from './workout-session-origin';

function makeDay(id: string, name: string, dayNumber = 1): ProgramDay {
  return {
    id,
    name,
    dayNumber,
    slots: [{
      exerciseId: 'exercise-1',
      series: 3,
      repRange: [8, 12],
      targetRPE: 8,
      restSec: 90,
      progression: 'dupla',
      incrementKg: 2.5,
    }],
  };
}

function makeProgram(days: ProgramDay[], legacyExercises: WorkoutProgram['exercises'] = []): WorkoutProgram {
  return {
    id: 'program-1',
    name: 'Programa forte',
    durationWeeks: 4,
    frequencyDays: Math.max(days.length, 1),
    level: 'intermediate',
    objective: 'Teste',
    exercises: legacyExercises,
    description: 'Teste',
    repeatWeeks: true,
    weeks: [{ number: 1, days }],
    isCustom: true,
  };
}

describe('resolveWorkoutStart', () => {
  it('mantém treino livre válido', () => {
    expect(resolveWorkoutStart({})).toEqual({ status: 'free-workout' });
  });

  it('resolve programa de um dia sem dayId', () => {
    const day = makeDay('day-1', 'Peito');
    const result = resolveWorkoutStart({ programId: 'program-1', program: makeProgram([day]) });
    expect(result.status).toBe('program-day');
    if (result.status === 'program-day') expect(result.day).toBe(day);
  });

  it('resolve exatamente o dayId informado em programa multi-dia', () => {
    const day1 = makeDay('day-1', 'Peito', 1);
    const day2 = makeDay('day-2', 'Pernas', 2);
    const result = resolveWorkoutStart({
      programId: 'program-1',
      program: makeProgram([day1, day2]),
      programDayId: 'day-2',
    });
    expect(result.status).toBe('program-day');
    if (result.status === 'program-day') expect(result.day).toBe(day2);
  });

  it('exige escolha quando o programa tem vários dias e nenhum dayId', () => {
    const result = resolveWorkoutStart({
      programId: 'program-1',
      program: makeProgram([makeDay('day-1', 'A'), makeDay('day-2', 'B', 2)]),
    });
    expect(result).toEqual({ status: 'error', reason: 'day-selection-required' });
  });

  it('bloqueia dayId inexistente sem fallback para Dia 1', () => {
    const day1 = makeDay('day-1', 'A');
    const result = resolveWorkoutStart({
      programId: 'program-1',
      program: makeProgram([day1]),
      programDayId: 'removed-day',
    });
    expect(result).toEqual({ status: 'error', reason: 'program-day-not-found' });
  });

  it('aceita explicitDay válido do Construtor mesmo diante de catálogo ainda antigo', () => {
    const explicitDay = makeDay('new-day', 'Novo', 2);
    const result = resolveWorkoutStart({
      programId: 'program-1',
      program: makeProgram([makeDay('old-day', 'Antigo')]),
      programDayId: 'new-day',
      explicitDay,
    });
    expect(result.status).toBe('program-day');
    if (result.status === 'program-day') expect(result.day).toBe(explicitDay);
  });

  it('resolve origem completa imediatamente após upsert do fluxo salvar e iniciar', () => {
    const day = makeDay('new-day', 'Novo', 2);
    const savedProgram = makeProgram([day]);
    const catalog = upsertWorkoutProgram([], savedProgram);
    const program = catalog.find((item) => item.id === savedProgram.id);
    const result = resolveWorkoutStart({
      programId: savedProgram.id,
      program,
      programDayId: day.id,
      explicitDay: day,
    });

    expect(result.status).toBe('program-day');
    if (result.status === 'program-day') {
      expect(result.origin).toEqual({
        sourceProgramId: 'program-1',
        sourceProgramDayId: 'new-day',
        sourceProgramName: 'Programa forte',
        sourceProgramDayName: 'Dia 2 — Novo',
      });
    }
  });

  it('rejeita explicitDay que não corresponde ao ID solicitado', () => {
    const result = resolveWorkoutStart({
      programId: 'program-1',
      program: makeProgram([makeDay('day-1', 'A')]),
      programDayId: 'day-1',
      explicitDay: makeDay('other-day', 'B'),
    });
    expect(result).toEqual({ status: 'error', reason: 'program-day-not-found' });
  });

  it('preserva caminho explicitamente legado pela lista achatada', () => {
    const program = makeProgram([], [{ exerciseId: 'exercise-1', sets: 3, reps: '8-12' }]);
    const result = resolveWorkoutStart({ programId: program.id, program });
    expect(result.status).toBe('legacy-program');
    if (result.status === 'legacy-program') {
      expect(result.program).toBe(program);
      expect(result.origin).toEqual({
        sourceProgramId: 'program-1',
        sourceProgramName: 'Programa forte',
      });
    }
  });

  it('bloqueia programa ausente ou vazio', () => {
    expect(resolveWorkoutStart({ programId: 'missing' })).toEqual({
      status: 'error',
      reason: 'program-not-found',
    });
    expect(resolveWorkoutStart({
      programId: 'missing',
      programDayId: 'day-1',
      explicitDay: makeDay('day-1', 'Explícito'),
    })).toEqual({ status: 'error', reason: 'program-not-found' });
    expect(resolveWorkoutStart({ programId: 'program-1', program: makeProgram([]) })).toEqual({
      status: 'error',
      reason: 'empty-program',
    });
  });
});

describe('workoutSessionOriginForProgramDay', () => {
  it('cria os quatro campos de origem sem alterar programa ou dia', () => {
    const day = makeDay('day-2', 'Pernas', 2);
    const program = makeProgram([day]);
    const before = structuredClone(program);
    expect(workoutSessionOriginForProgramDay(program, day)).toEqual({
      sourceProgramId: 'program-1',
      sourceProgramDayId: 'day-2',
      sourceProgramName: 'Programa forte',
      sourceProgramDayName: 'Dia 2 — Pernas',
    });
    expect(program).toEqual(before);
  });
});
