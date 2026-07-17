import { describe, expect, it } from 'vitest';
import type { ExerciseSlot, ProgramDay, WorkoutProgram } from '../types';
import { MOCK_PROGRAMS } from '../mock/programs';
import { createSequentialIdFactory } from './workout-builder-id';
import { NO_FOCUS_DAY_NAME } from './workout-day-naming';
import {
  buildWorkoutProgramFromDraft,
  normalizeWorkoutProgramForBuilder,
  parseLegacyRepRange,
} from './workout-program-normalization';

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

/** Programa antigo de UM dia, exatamente como o GOAL-10.5 salvava (sem metadados novos). */
function legacyOneDayProgram(): WorkoutProgram {
  return {
    id: 'custom_1700000000000',
    name: 'Meu Treino',
    durationWeeks: 0,
    frequencyDays: 1,
    level: 'intermediate',
    objective: 'Treino personalizado criado no Construtor de Treino',
    exercises: [],
    description: 'Treino criado manualmente pelo usuário no Construtor de Treino.',
    repeatWeeks: true,
    weeks: [{
      number: 1,
      days: [{
        id: 'custom_1700000000000_day',
        name: 'Meu Treino',
        slots: [slot('chest_supino_reto'), slot('triceps_polia_corda', { series: 4 })],
        volumeProfile: 'standard',
      }],
    }],
    isCustom: true,
  };
}

describe('normalizeWorkoutProgramForBuilder — programa antigo de um dia', () => {
  it('abre como Dia 1 preservando id, nome, slots e perfil de volume', () => {
    const program = legacyOneDayProgram();
    const draft = normalizeWorkoutProgramForBuilder(program);

    expect(draft.programId).toBe('custom_1700000000000');
    expect(draft.days).toHaveLength(1);
    expect(draft.days[0].id).toBe('custom_1700000000000_day');
    expect(draft.days[0].dayNumber).toBe(1);
    expect(draft.days[0].volumeProfile).toBe('standard');
    expect(draft.days[0].slots).toEqual(program.weeks[0].days[0].slots);
  });

  it('preserva o nome existente tratando-o como nome customizado', () => {
    const draft = normalizeWorkoutProgramForBuilder(legacyOneDayProgram());
    expect(draft.days[0].customName).toBe('Meu Treino');
    expect(draft.days[0].autoName).toBe(NO_FOCUS_DAY_NAME);
    expect(draft.days[0].muscleGroupIds).toEqual([]);
  });

  it('não altera o programa recebido apenas por abrir', () => {
    const program = legacyOneDayProgram();
    const snapshot = JSON.parse(JSON.stringify(program));
    normalizeWorkoutProgramForBuilder(program);
    expect(program).toEqual(snapshot);
  });

  it('não compartilha referência de slots com o programa de origem', () => {
    const program = legacyOneDayProgram();
    const draft = normalizeWorkoutProgramForBuilder(program);
    draft.days[0].slots[0].series = 99;
    expect(program.weeks[0].days[0].slots[0].series).toBe(3);
  });

  it('roundtrip: abrir e salvar sem editar não perde nem renomeia nada', () => {
    const program = legacyOneDayProgram();
    const draft = normalizeWorkoutProgramForBuilder(program);
    const saved = buildWorkoutProgramFromDraft(draft, program);

    expect(saved.id).toBe(program.id);
    expect(saved.name).toBe(program.name);
    expect(saved.level).toBe(program.level);
    expect(saved.objective).toBe(program.objective);
    expect(saved.description).toBe(program.description);
    expect(saved.weeks).toHaveLength(1);
    expect(saved.weeks[0].days).toHaveLength(1);
    expect(saved.weeks[0].days[0].id).toBe(program.weeks[0].days[0].id);
    expect(saved.weeks[0].days[0].name).toBe('Meu Treino');
    expect(saved.weeks[0].days[0].slots).toEqual(program.weeks[0].days[0].slots);
    expect(saved.weeks[0].days[0].volumeProfile).toBe('standard');
    expect(saved.isCustom).toBe(true);
  });
});

describe('normalizeWorkoutProgramForBuilder — programa multi-dia', () => {
  function multiDayProgram(): WorkoutProgram {
    const days: ProgramDay[] = [
      {
        id: 'day_a',
        name: 'Peito e Tríceps',
        slots: [slot('chest_supino_reto')],
        volumeProfile: 'standard',
        dayNumber: 1,
        muscleGroupIds: ['chest', 'triceps'],
        targetMinutes: 60,
      },
      {
        id: 'day_b',
        name: 'Treino de puxar',
        slots: [slot('back_puxada_pulley')],
        volumeProfile: 'high',
        dayNumber: 2,
        muscleGroupIds: ['back', 'biceps'],
        customName: 'Treino de puxar',
        targetMinutes: 75,
      },
    ];
    return {
      id: 'custom_multi',
      name: 'Meu ABC',
      durationWeeks: 0,
      frequencyDays: 2,
      level: 'advanced',
      objective: 'Treino personalizado criado no Construtor de Treino',
      exercises: [],
      description: 'Programa multi-dia.',
      repeatWeeks: true,
      weeks: [{ number: 1, days }],
      isCustom: true,
    };
  }

  it('lê todos os dias na ordem, numerando pela posição', () => {
    const draft = normalizeWorkoutProgramForBuilder(multiDayProgram());
    expect(draft.days.map((day) => day.id)).toEqual(['day_a', 'day_b']);
    expect(draft.days.map((day) => day.dayNumber)).toEqual([1, 2]);
  });

  it('distingue nome automático de nome customizado', () => {
    const draft = normalizeWorkoutProgramForBuilder(multiDayProgram());
    // Dia A: o nome persistido é exatamente o automático -> não é customizado.
    expect(draft.days[0].autoName).toBe('Peito e Tríceps');
    expect(draft.days[0].customName).toBeUndefined();
    // Dia B: o nome persistido difere do automático -> é do usuário.
    expect(draft.days[1].autoName).toBe('Costas e Bíceps');
    expect(draft.days[1].customName).toBe('Treino de puxar');
  });

  it('preserva foco, perfil de volume e tempo alvo por dia', () => {
    const draft = normalizeWorkoutProgramForBuilder(multiDayProgram());
    expect(draft.days[0].muscleGroupIds).toEqual(['chest', 'triceps']);
    expect(draft.days[1].muscleGroupIds).toEqual(['back', 'biceps']);
    expect(draft.days[1].volumeProfile).toBe('high');
    expect(draft.days[1].targetMinutes).toBe(75);
  });

  it('roundtrip estrito: normalizar e serializar devolve o mesmo programa', () => {
    const program = multiDayProgram();
    const roundtripped = buildWorkoutProgramFromDraft(normalizeWorkoutProgramForBuilder(program), program);
    expect(roundtripped).toEqual(program);
  });

  it('renumera dias fora de ordem a partir da posição real', () => {
    const program = multiDayProgram();
    program.weeks[0].days[0].dayNumber = 7;
    program.weeks[0].days[1].dayNumber = 4;
    const draft = normalizeWorkoutProgramForBuilder(program);
    expect(draft.days.map((day) => day.dayNumber)).toEqual([1, 2]);
  });
});

describe('normalizeWorkoutProgramForBuilder — entradas incompletas', () => {
  it('sem programa devolve um draft novo com exatamente um dia vazio', () => {
    const draft = normalizeWorkoutProgramForBuilder(undefined, { createId: createSequentialIdFactory() });
    expect(draft.programId).toBeUndefined();
    expect(draft.days).toHaveLength(1);
    expect(draft.days[0].slots).toEqual([]);
    expect(draft.days[0].muscleGroupIds).toEqual([]);
    expect(draft.days[0].dayNumber).toBe(1);
  });

  it('programa sem weeks cai na lista achatada legada sem perder os exercícios', () => {
    const program: WorkoutProgram = {
      id: 'custom_flat',
      name: 'Treino importado',
      durationWeeks: 0,
      frequencyDays: 1,
      level: 'beginner',
      objective: 'Objetivo',
      exercises: [
        { exerciseId: 'chest_supino_reto', sets: 4, reps: '8-12' },
        { exerciseId: 'triceps_polia_corda', sets: 3, reps: '12' },
      ],
      description: 'Sem weeks.',
      repeatWeeks: true,
      weeks: [],
      isCustom: true,
    };
    const draft = normalizeWorkoutProgramForBuilder(program, { createId: createSequentialIdFactory() });

    expect(draft.days).toHaveLength(1);
    expect(draft.days[0].customName).toBe('Treino importado');
    expect(draft.days[0].slots.map((s) => s.exerciseId)).toEqual(['chest_supino_reto', 'triceps_polia_corda']);
    expect(draft.days[0].slots[0].series).toBe(4);
    expect(draft.days[0].slots[0].repRange).toEqual([8, 12]);
    expect(draft.days[0].slots[1].repRange).toEqual([12, 12]);
  });

  it('preserva a lista achatada existente sem recriá-la a partir dos dias', () => {
    const existing: WorkoutProgram = {
      ...legacyOneDayProgram(),
      exercises: [{ exerciseId: 'chest_supino_reto', sets: 3, reps: '10' }],
    };
    const saved = buildWorkoutProgramFromDraft(normalizeWorkoutProgramForBuilder(existing), existing);
    expect(saved.exercises).toEqual(existing.exercises);
  });

  it('programa novo nunca duplica os dias em exercises', () => {
    const draft = normalizeWorkoutProgramForBuilder(undefined, { createId: createSequentialIdFactory() });
    draft.days[0].slots = [slot('chest_supino_reto')];
    const saved = buildWorkoutProgramFromDraft(draft, undefined, createSequentialIdFactory());
    expect(saved.exercises).toEqual([]);
    expect(saved.weeks[0].days[0].slots).toHaveLength(1);
  });

  it('usa o nível e a duração do perfil como fallback', () => {
    const draft = normalizeWorkoutProgramForBuilder(undefined, {
      fallbackLevel: 'advanced',
      fallbackTargetMinutes: 45,
      createId: createSequentialIdFactory(),
    });
    expect(draft.level).toBe('advanced');
    expect(draft.days[0].targetMinutes).toBe(45);
  });
});

describe('normalizeWorkoutProgramForBuilder — programas seed', () => {
  it('nunca marca um programa seed como editável no lugar (sem programId)', () => {
    for (const program of MOCK_PROGRAMS) {
      expect(normalizeWorkoutProgramForBuilder(program).programId).toBeUndefined();
    }
  });

  it('salvar um seed normalizado cria um programa novo e customizado', () => {
    const seed = MOCK_PROGRAMS[0];
    const draft = normalizeWorkoutProgramForBuilder(seed);
    const saved = buildWorkoutProgramFromDraft(draft, undefined, createSequentialIdFactory());

    expect(saved.id).not.toBe(seed.id);
    expect(saved.isCustom).toBe(true);
  });

  it('lê os dias reais de todos os seeds sem perder slots', () => {
    for (const program of MOCK_PROGRAMS) {
      const draft = normalizeWorkoutProgramForBuilder(program);
      const seedDays = program.weeks[0].days;
      expect(draft.days).toHaveLength(seedDays.length);
      draft.days.forEach((day, index) => {
        expect(day.id).toBe(seedDays[index].id);
        expect(day.slots).toEqual(seedDays[index].slots);
        // Nome seed ("Dia A — ...") não é automático: vira customName e é preservado.
        expect(day.customName).toBe(seedDays[index].name);
      });
    }
  });
});

describe('buildWorkoutProgramFromDraft', () => {
  it('gera um id novo apenas quando não existe um', () => {
    const draft = normalizeWorkoutProgramForBuilder(undefined, { createId: createSequentialIdFactory() });
    const saved = buildWorkoutProgramFromDraft(draft, undefined, createSequentialIdFactory());
    expect(saved.id).toBe('custom_1');
  });

  it('frequencyDays reflete o número real de dias', () => {
    const program = legacyOneDayProgram();
    const draft = normalizeWorkoutProgramForBuilder(program);
    draft.days.push({
      id: 'day_novo',
      dayNumber: 2,
      autoName: 'Costas e Bíceps',
      muscleGroupIds: ['back', 'biceps'],
      volumeProfile: 'standard',
      targetMinutes: 60,
      slots: [slot('back_puxada_pulley')],
    });
    const saved = buildWorkoutProgramFromDraft(draft, program);
    expect(saved.frequencyDays).toBe(2);
    expect(saved.weeks[0].days.map((day) => day.dayNumber)).toEqual([1, 2]);
  });

  it('cai em nomes padrão honestos quando o usuário deixa tudo vazio', () => {
    const draft = normalizeWorkoutProgramForBuilder(undefined, { createId: createSequentialIdFactory() });
    draft.name = '   ';
    draft.objective = '';
    const saved = buildWorkoutProgramFromDraft(draft, undefined, createSequentialIdFactory());
    expect(saved.name).toBe('Meu Treino');
    expect(saved.objective).toBe('Treino personalizado criado no Construtor de Treino');
  });

  it('sempre grava uma única semana canônica', () => {
    const draft = normalizeWorkoutProgramForBuilder(legacyOneDayProgram());
    const saved = buildWorkoutProgramFromDraft(draft);
    expect(saved.weeks).toHaveLength(1);
    expect(saved.weeks[0].number).toBe(1);
  });
});

describe('parseLegacyRepRange', () => {
  it.each<[unknown, [number, number] | null]>([
    ['8-12', [8, 12]],
    ['8 a 12', [8, 12]],
    ['10', [10, 10]],
    ['12 reps', [12, 12]],
    ['até a falha', null],
    ['', null],
    [undefined, null],
    [null, null],
    [12, null],
  ])('lê %j como %j', (input, expected) => {
    expect(parseLegacyRepRange(input)).toEqual(expected);
  });
});
