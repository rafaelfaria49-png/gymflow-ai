import { describe, expect, it } from 'vitest';
import type { ExerciseSlot, ProgramDay, WeeklyWorkoutDay, WorkoutProgram } from '../types';
import { createSequentialIdFactory } from './workout-builder-id';
import {
  CLEARED_WEEKLY_WORKOUT_NAME,
  analyzeProgramDeletion,
  clearProgramFromWeeklyPlan,
  deriveCustomProgramFromSeed,
  duplicateWorkoutProgram,
  filterProgramsByKind,
  organizePrograms,
  programDayCount,
  programMatchesSearch,
  removeProgramFromList,
  sortPrograms,
} from './workout-program-actions';
import { MISSING_PROGRAM_DAY_ISSUE } from './workout-plan-sync';

function slot(exerciseId: string, overrides: Partial<ExerciseSlot> = {}): ExerciseSlot {
  return {
    exerciseId,
    series: 3,
    repRange: [8, 12],
    targetRPE: 8,
    restSec: 90,
    progression: 'dupla',
    incrementKg: 2.5,
    ...overrides,
  };
}

function day(id: string, overrides: Partial<ProgramDay> = {}): ProgramDay {
  return {
    id,
    name: 'Dia',
    slots: [slot('chest_supino_reto')],
    dayNumber: 1,
    muscleGroupIds: ['chest'],
    ...overrides,
  };
}

function program(overrides: Partial<WorkoutProgram> = {}): WorkoutProgram {
  return {
    id: 'prog_1',
    name: 'Meu ABCD',
    durationWeeks: 8,
    frequencyDays: 2,
    level: 'intermediate',
    objective: 'Hipertrofia estética',
    exercises: [],
    description: 'Programa de teste',
    repeatWeeks: true,
    weeks: [{ number: 1, days: [day('d1'), day('d2', { name: 'Dia 2', dayNumber: 2, muscleGroupIds: ['back'] })] }],
    isCustom: true,
    ...overrides,
  };
}

describe('duplicateWorkoutProgram (GOAL-19B PART 8)', () => {
  it('cria novos ids de programa e de dias, preservando o conteúdo', () => {
    const original = program();
    const copy = duplicateWorkoutProgram(original, createSequentialIdFactory());

    expect(copy.id).not.toBe(original.id);
    expect(copy.weeks[0].days.map((d) => d.id)).not.toEqual(original.weeks[0].days.map((d) => d.id));
    expect(copy.name).toBe('Meu ABCD — Cópia');
    expect(copy.isCustom).toBe(true);
    // Conteúdo preservado dia a dia.
    expect(copy.weeks[0].days).toHaveLength(2);
    expect(copy.weeks[0].days[0].slots).toEqual(original.weeks[0].days[0].slots);
    expect(copy.weeks[0].days[1].muscleGroupIds).toEqual(['back']);
    expect(copy.frequencyDays).toBe(2);
  });

  it('não muta o programa original', () => {
    const original = program();
    const before = JSON.stringify(original);
    duplicateWorkoutProgram(original, createSequentialIdFactory());
    expect(JSON.stringify(original)).toBe(before);
  });

  it('faz deep clone dos slots (a cópia não compartilha referência)', () => {
    const original = program();
    const copy = duplicateWorkoutProgram(original, createSequentialIdFactory());
    copy.weeks[0].days[0].slots[0].series = 99;
    expect(original.weeks[0].days[0].slots[0].series).toBe(3);
  });

  it('duplica um programa estruturado antigo de um único dia', () => {
    const oneDay = program({ weeks: [{ number: 1, days: [day('only')] }], frequencyDays: 1 });
    const copy = duplicateWorkoutProgram(oneDay, createSequentialIdFactory());
    expect(copy.weeks[0].days).toHaveLength(1);
    expect(copy.frequencyDays).toBe(1);
  });

  it('preserva semanas adicionais válidas com novos ids', () => {
    const original = program({
      weeks: [
        { number: 1, days: [day('week-1')] },
        { number: 2, days: [day('week-2', { name: 'Segunda semana' })] },
      ],
    });
    const copy = duplicateWorkoutProgram(original, createSequentialIdFactory());
    expect(copy.weeks).toHaveLength(2);
    expect(copy.weeks[1].days[0].name).toBe('Segunda semana');
    expect(copy.weeks[1].days[0].id).not.toBe('week-2');
  });

  it('promove um programa legado achatado sem perder exercícios', () => {
    const legacy = program({
      weeks: [],
      frequencyDays: 1,
      exercises: [{ exerciseId: 'legacy-row', sets: 4, reps: '6-10' }],
    });
    const before = structuredClone(legacy);
    const copy = duplicateWorkoutProgram(legacy, createSequentialIdFactory());

    expect(copy.exercises).toEqual([]);
    expect(copy.weeks[0].days).toHaveLength(1);
    expect(copy.weeks[0].days[0].slots).toEqual([expect.objectContaining({
      exerciseId: 'legacy-row',
      series: 4,
      repRange: [6, 10],
    })]);
    expect(legacy).toEqual(before);
  });
});

describe('deriveCustomProgramFromSeed (GOAL-19B PART 8)', () => {
  it('cria um custom novo a partir de um seed, sem tocar no seed', () => {
    const seed = program({
      id: 'seed_1',
      isCustom: false,
      weeks: [],
      exercises: [{ exerciseId: 'chest_supino_reto', sets: 3, reps: '8-12' }],
    });
    const before = JSON.stringify(seed);
    const derived = deriveCustomProgramFromSeed(seed, createSequentialIdFactory());

    expect(derived.isCustom).toBe(true);
    expect(derived.id).not.toBe('seed_1');
    expect(derived.name).toBe('Meu ABCD'); // sem "— Cópia"
    // Novo custom NUNCA recria a lista achatada legada.
    expect(derived.exercises).toEqual([]);
    expect(derived.weeks[0].days[0].slots).toEqual([expect.objectContaining({
      exerciseId: 'chest_supino_reto',
      series: 3,
      repRange: [8, 12],
    })]);
    // Seed intacto (inclusive a lista achatada legada).
    expect(JSON.stringify(seed)).toBe(before);
  });
});

describe('analyzeProgramDeletion (GOAL-19B PART 9)', () => {
  it('conta dias, exercícios e referências no weeklyPlan', () => {
    const prog = program();
    const weeklyPlan: WeeklyWorkoutDay[] = [
      { dayName: 'Segunda', workoutName: 'x', muscleGroups: [], duration: 0, exerciseCount: 1, isRest: false, programId: 'prog_1', programDayId: 'd1' },
      { dayName: 'Terça', workoutName: 'Descanso', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true },
      { dayName: 'Quarta', workoutName: 'y', muscleGroups: [], duration: 0, exerciseCount: 1, isRest: false, programId: 'other', programDayId: 'z' },
      { dayName: 'Quinta', workoutName: 'feito', muscleGroups: ['Peito'], duration: 45, exerciseCount: 4, isRest: false, programId: 'prog_1', programDayId: 'd2', trained: true },
    ];
    const impact = analyzeProgramDeletion(prog, weeklyPlan);
    expect(impact.dayCount).toBe(2);
    expect(impact.exerciseCount).toBe(2);
    expect(impact.weeklyReferenceDayNames).toEqual(['Segunda']);

    const legacyImpact = analyzeProgramDeletion(program({
      weeks: [],
      exercises: [{ exerciseId: 'legacy-row', sets: 4, reps: '6-10' }],
    }), []);
    expect(legacyImpact).toMatchObject({ dayCount: 1, exerciseCount: 1 });
  });
});

describe('clearProgramFromWeeklyPlan (GOAL-19B PART 9)', () => {
  const weeklyPlan: WeeklyWorkoutDay[] = [
    { dayName: 'Segunda', workoutName: 'Treino concluído', muscleGroups: ['Peito'], duration: 50, exerciseCount: 5, isRest: false, programId: 'prog_1', programDayId: 'd1', trained: true },
    { dayName: 'Terça', workoutName: 'Treino futuro', muscleGroups: ['Pernas'], duration: 60, exerciseCount: 6, isRest: false, programId: 'prog_1', programDayId: 'd2', trained: false },
    { dayName: 'Quarta', workoutName: 'Outro treino', muscleGroups: ['Costas'], duration: 50, exerciseCount: 5, isRest: false, programId: 'other', programDayId: 'z' },
  ];

  it('preserva integralmente o snapshot de um dia já treinado', () => {
    const cleaned = clearProgramFromWeeklyPlan(weeklyPlan, 'prog_1');
    expect(cleaned[0]).toBe(weeklyPlan[0]);
    expect(cleaned[0]).toEqual(weeklyPlan[0]);
  });

  it('invalida somente vínculos futuros, sem fallback ou card quebrado', () => {
    const cleaned = clearProgramFromWeeklyPlan(weeklyPlan, 'prog_1');
    expect(cleaned[1]).toMatchObject({
      workoutName: CLEARED_WEEKLY_WORKOUT_NAME,
      muscleGroups: [],
      duration: 0,
      exerciseCount: 0,
      isRest: false,
      planningIssue: MISSING_PROGRAM_DAY_ISSUE,
    });
    expect(cleaned[1].programId).toBeUndefined();
    expect(cleaned[1].programDayId).toBeUndefined();
  });

  it('preserva dias de outros programas', () => {
    const cleaned = clearProgramFromWeeklyPlan(weeklyPlan, 'prog_1');
    expect(cleaned[2]).toBe(weeklyPlan[2]);
    expect(cleaned[2]).toEqual(weeklyPlan[2]);
  });

  it('não muta o weeklyPlan original', () => {
    const before = JSON.stringify(weeklyPlan);
    clearProgramFromWeeklyPlan(weeklyPlan, 'prog_1');
    expect(JSON.stringify(weeklyPlan)).toBe(before);
  });

  it('excluir referência inexistente é seguro (nada muda)', () => {
    const cleaned = clearProgramFromWeeklyPlan(weeklyPlan, 'nao_existe');
    expect(cleaned).toEqual(weeklyPlan);
  });
});

describe('removeProgramFromList (GOAL-19B PART 9)', () => {
  it('remove o programa e é imutável', () => {
    const list = [program({ id: 'a' }), program({ id: 'b' })];
    const next = removeProgramFromList(list, 'a');
    expect(next.map((p) => p.id)).toEqual(['b']);
    expect(list).toHaveLength(2);
  });

  it('remover inexistente devolve a lista equivalente', () => {
    const list = [program({ id: 'a' })];
    expect(removeProgramFromList(list, 'zzz').map((p) => p.id)).toEqual(['a']);
  });
});

describe('busca e filtros de Meus Treinos (GOAL-19B PART 11)', () => {
  const seed = program({ id: 'seed', name: 'Hipertrofia Total', isCustom: false });
  const mineA = program({ id: 'mine_a', name: 'Costas e Bíceps', weeks: [{ number: 1, days: [day('x')] }] });
  const mineB = program({ id: 'mine_b', name: 'Treino de Pernas', weeks: [{ number: 1, days: [day('a'), day('b'), day('c')] }] });
  const all = [seed, mineA, mineB];

  it('busca por nome ignora acentos e caixa', () => {
    expect(programMatchesSearch(mineA, 'biceps')).toBe(true); // sem acento
    expect(programMatchesSearch(mineA, 'BÍCEPS')).toBe(true); // caixa + acento
    expect(programMatchesSearch(mineA, 'pernas')).toBe(false);
  });

  it('filtra customizados e prontos', () => {
    expect(filterProgramsByKind(all, 'mine').map((p) => p.id)).toEqual(['mine_a', 'mine_b']);
    expect(filterProgramsByKind(all, 'ready').map((p) => p.id)).toEqual(['seed']);
    expect(filterProgramsByKind(all, 'all')).toHaveLength(3);
  });

  it('ordena por nome, por dias e por recência', () => {
    expect(sortPrograms(all, 'name').map((p) => p.name)).toEqual([
      'Costas e Bíceps',
      'Hipertrofia Total',
      'Treino de Pernas',
    ]);
    expect(sortPrograms(all, 'days').map((p) => p.id)).toEqual(['mine_b', 'seed', 'mine_a']);
    expect(sortPrograms(all, 'recent').map((p) => p.id)).toEqual(['mine_b', 'mine_a', 'seed']);

    const legacy = program({
      weeks: [],
      exercises: [{ exerciseId: 'legacy-row', sets: 3, reps: '8-12' }],
    });
    expect(programDayCount(legacy)).toBe(1);
    expect(programDayCount(program({ weeks: [], exercises: [] }))).toBe(0);
  });

  it('fixa o recém-criado no topo apenas na ordem por recência', () => {
    expect(sortPrograms(all, 'recent', { pinnedId: 'seed' }).map((p) => p.id)).toEqual(['seed', 'mine_b', 'mine_a']);
    // Em 'name', o pin não quebra a ordem pedida.
    expect(sortPrograms(all, 'name', { pinnedId: 'seed' }).map((p) => p.name)[0]).toBe('Costas e Bíceps');
  });

  it('organizePrograms compõe filtro + busca + ordenação', () => {
    const result = organizePrograms(all, { kind: 'mine', query: 'treino', sort: 'name' });
    expect(result.map((p) => p.id)).toEqual(['mine_b']);
  });

  it('busca sem resultado devolve lista vazia', () => {
    expect(organizePrograms(all, { query: 'zzz-inexistente' })).toEqual([]);
  });
});
