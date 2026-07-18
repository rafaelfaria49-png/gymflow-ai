import { describe, expect, it } from 'vitest';
import type { WorkoutProgram } from '../types';
import { getProgramDays, resolveProgramDays } from './workout-program-days';

function program(overrides: Partial<WorkoutProgram> = {}): WorkoutProgram {
  return {
    id: 'program-1',
    name: 'Programa',
    durationWeeks: 4,
    frequencyDays: 1,
    level: 'intermediate',
    objective: 'Teste',
    exercises: [],
    description: 'Teste',
    repeatWeeks: true,
    weeks: [{ number: 1, days: [{ id: 'day-1', name: 'Dia 1', slots: [] }] }],
    ...overrides,
  };
}

describe('resolveProgramDays', () => {
  it('devolve os dias da primeira semana canônica', () => {
    const source = program();
    const result = resolveProgramDays(source);
    expect(result).toEqual({ kind: 'canonical', days: source.weeks[0].days });
    expect(getProgramDays(source)).toEqual(source.weeks[0].days);
  });

  it.each([
    ['weeks ausente', { weeks: undefined }],
    ['weeks vazio', { weeks: [] }],
    ['primeira semana ausente', { weeks: [undefined] }],
    ['days ausente', { weeks: [{ number: 1 }] }],
    ['days inválido', { weeks: [{ number: 1, days: 'inválido' }] }],
    ['days vazio', { weeks: [{ number: 1, days: [] }] }],
  ])('tolera %s sem lançar', (_label, shape) => {
    const source = { ...program(), ...shape } as unknown as WorkoutProgram;
    expect(resolveProgramDays(source)).toEqual({ kind: 'empty', days: [] });
    expect(getProgramDays(source)).toEqual([]);
  });

  it('distingue programa flat legado de programa realmente vazio', () => {
    const flat = {
      ...program({ exercises: [{ exerciseId: 'ex-1', sets: 3, reps: '10' }] }),
      weeks: undefined,
    } as unknown as WorkoutProgram;
    const empty = { ...program(), weeks: undefined } as unknown as WorkoutProgram;

    expect(resolveProgramDays(flat)).toEqual({ kind: 'legacy-flat', days: [], exerciseCount: 1 });
    expect(resolveProgramDays(empty)).toEqual({ kind: 'empty', days: [] });
    expect(getProgramDays(flat)).toEqual([]);
  });

  it('ignora entradas de dia inválidas sem inventar ids', () => {
    const source = {
      ...program(),
      weeks: [{ number: 1, days: [null, { id: 'sem-slots', name: 'Inválido' }] }],
    } as unknown as WorkoutProgram;
    expect(resolveProgramDays(source)).toEqual({ kind: 'empty', days: [] });
  });
});
