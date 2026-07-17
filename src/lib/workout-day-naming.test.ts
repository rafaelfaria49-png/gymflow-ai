import { describe, expect, it } from 'vitest';
import type { MuscleGroupId } from '../types/training-taxonomy';
import { MUSCLE_GROUPS } from './training-taxonomy';
import {
  MAX_NAMED_MUSCLE_GROUPS,
  NO_FOCUS_DAY_NAME,
  PRIMARY_FOCUS_GROUPS,
  SECONDARY_FOCUS_GROUPS,
  formatWorkoutDayLabel,
  generateWorkoutDayAutoName,
  joinWithConjunction,
  muscleGroupShortLabel,
  normalizeMuscleGroupIds,
  programDayDisplayLabel,
  resolveWorkoutDayName,
} from './workout-day-naming';

describe('generateWorkoutDayAutoName — exemplos normativos do GOAL-19A', () => {
  it.each<[MuscleGroupId[], string]>([
    [['chest'], 'Peito'],
    [['chest', 'triceps'], 'Peito e Tríceps'],
    [['back', 'biceps'], 'Costas e Bíceps'],
    [['quadriceps', 'hamstrings', 'glutes'], 'Pernas'],
    [['shoulders', 'core'], 'Ombros e Core'],
    [['cardio'], 'Cardio'],
    [['mobility'], 'Mobilidade'],
    [['full_body'], 'Corpo inteiro'],
  ])('nomeia %j como %j', (ids, expected) => {
    expect(generateWorkoutDayAutoName(ids)).toBe(expected);
  });

  it('devolve o nome honesto quando nenhum grupo foi escolhido', () => {
    expect(generateWorkoutDayAutoName([])).toBe(NO_FOCUS_DAY_NAME);
    expect(generateWorkoutDayAutoName(undefined)).toBe(NO_FOCUS_DAY_NAME);
    expect(generateWorkoutDayAutoName(null)).toBe(NO_FOCUS_DAY_NAME);
  });

  it('é previsível: a ordem de escolha não muda o nome', () => {
    expect(generateWorkoutDayAutoName(['triceps', 'chest'])).toBe('Peito e Tríceps');
    expect(generateWorkoutDayAutoName(['chest', 'triceps'])).toBe('Peito e Tríceps');
    expect(generateWorkoutDayAutoName(['glutes', 'quadriceps', 'hamstrings'])).toBe('Pernas');
  });

  it('ignora grupos duplicados', () => {
    expect(generateWorkoutDayAutoName(['chest', 'chest', 'triceps', 'triceps'])).toBe('Peito e Tríceps');
  });

  it('ignora ids desconhecidos sem inventar grupo', () => {
    expect(generateWorkoutDayAutoName(['chest', 'nao_existe' as MuscleGroupId])).toBe('Peito');
    expect(generateWorkoutDayAutoName(['nao_existe' as MuscleGroupId])).toBe(NO_FOCUS_DAY_NAME);
  });

  it('resume braços apenas quando bíceps E tríceps estão presentes', () => {
    expect(generateWorkoutDayAutoName(['biceps', 'triceps'])).toBe('Braços');
    expect(generateWorkoutDayAutoName(['back', 'biceps', 'triceps'])).toBe('Costas e Braços');
    // Peito + tríceps não vira "Braços" — bíceps não faz parte do dia.
    expect(generateWorkoutDayAutoName(['chest', 'triceps'])).toBe('Peito e Tríceps');
  });

  it('só resume pernas com o trio completo; panturrilha nunca é absorvida', () => {
    expect(generateWorkoutDayAutoName(['quadriceps', 'calves'])).toBe('Quadríceps e Panturrilhas');
    expect(generateWorkoutDayAutoName(['quadriceps', 'hamstrings'])).toBe('Quadríceps e Posterior de coxa');
    expect(generateWorkoutDayAutoName(['quadriceps', 'hamstrings', 'glutes', 'calves']))
      .toBe('Pernas e Panturrilhas');
  });

  it('não usa legs_general como substituto de quadríceps ou posterior', () => {
    expect(generateWorkoutDayAutoName(['legs_general'])).toBe('Pernas geral');
    expect(generateWorkoutDayAutoName(['quadriceps'])).toBe('Quadríceps');
    expect(generateWorkoutDayAutoName(['hamstrings'])).toBe('Posterior de coxa');
  });

  it('mantém o nome curto sem esconder que existem mais grupos', () => {
    const many: MuscleGroupId[] = ['chest', 'back', 'shoulders', 'core', 'calves', 'forearms'];
    const name = generateWorkoutDayAutoName(many);
    expect(name).toBe('Peito, Costas, Ombros e mais 3');
    expect(name.length).toBeLessThan(60);
  });

  it('nomeia por extenso até o limite de grupos', () => {
    const atLimit: MuscleGroupId[] = ['chest', 'back', 'shoulders', 'core'];
    expect(atLimit).toHaveLength(MAX_NAMED_MUSCLE_GROUPS);
    expect(generateWorkoutDayAutoName(atLimit)).toBe('Peito, Costas, Ombros e Core');
  });
});

describe('chips de foco', () => {
  it('cobre toda a taxonomia exatamente uma vez, sem grupo escondido', () => {
    const chips = [...PRIMARY_FOCUS_GROUPS, ...SECONDARY_FOCUS_GROUPS];
    expect(new Set(chips).size).toBe(chips.length);
    expect([...chips].sort()).toEqual(MUSCLE_GROUPS.map((group) => group.id).sort());
  });

  it('expõe os grupos principais na ordem pedida pelo GOAL', () => {
    expect(PRIMARY_FOCUS_GROUPS).toEqual([
      'chest', 'back', 'shoulders', 'biceps', 'triceps', 'quadriceps',
      'hamstrings', 'glutes', 'calves', 'core', 'cardio', 'mobility',
    ]);
  });

  it('mantém legs_general fora dos chips principais', () => {
    expect(PRIMARY_FOCUS_GROUPS).not.toContain('legs_general');
    expect(SECONDARY_FOCUS_GROUPS).toContain('legs_general');
  });
});

describe('rótulos PT-BR', () => {
  it('usa os labels da taxonomia por padrão', () => {
    expect(muscleGroupShortLabel('chest')).toBe('Peito');
    expect(muscleGroupShortLabel('hamstrings')).toBe('Posterior de coxa');
    expect(muscleGroupShortLabel('glutes')).toBe('Glúteos');
    expect(muscleGroupShortLabel('calves')).toBe('Panturrilhas');
  });

  it('encurta apenas os rótulos que ficariam ruins dentro de um nome composto', () => {
    expect(muscleGroupShortLabel('core')).toBe('Core');
    expect(muscleGroupShortLabel('legs_general')).toBe('Pernas geral');
    expect(muscleGroupShortLabel('traps')).toBe('Trapézio');
  });

  it('tem rótulo não vazio para todos os grupos da taxonomia', () => {
    for (const group of MUSCLE_GROUPS) {
      expect(muscleGroupShortLabel(group.id).trim().length).toBeGreaterThan(0);
    }
  });
});

describe('normalizeMuscleGroupIds', () => {
  it('ordena pela ordem da taxonomia e remove duplicados/inválidos', () => {
    expect(normalizeMuscleGroupIds(['core', 'chest', 'chest', 'x' as MuscleGroupId, 'back']))
      .toEqual(['chest', 'back', 'core']);
  });

  it('é tolerante a entrada não-array', () => {
    expect(normalizeMuscleGroupIds(undefined)).toEqual([]);
    expect(normalizeMuscleGroupIds(null)).toEqual([]);
  });
});

describe('joinWithConjunction', () => {
  it.each([
    [[], ''],
    [['A'], 'A'],
    [['A', 'B'], 'A e B'],
    [['A', 'B', 'C'], 'A, B e C'],
  ])('junta %j como %j', (labels, expected) => {
    expect(joinWithConjunction(labels)).toBe(expected);
  });
});

describe('resolveWorkoutDayName', () => {
  it('o nome customizado prevalece sobre o automático', () => {
    expect(resolveWorkoutDayName({ customName: 'Treino de empurrar', autoName: 'Peito e Tríceps' }))
      .toBe('Treino de empurrar');
  });

  it('cai no automático quando o customizado está vazio ou só com espaços', () => {
    expect(resolveWorkoutDayName({ customName: '   ', autoName: 'Peito' })).toBe('Peito');
    expect(resolveWorkoutDayName({ customName: '', autoName: 'Peito' })).toBe('Peito');
    expect(resolveWorkoutDayName({ autoName: 'Peito' })).toBe('Peito');
  });
});

describe('rótulos de dia', () => {
  it('compõe número + nome final', () => {
    expect(formatWorkoutDayLabel(2, 'Costas e Bíceps')).toBe('Dia 2 — Costas e Bíceps');
  });

  it('numera apenas dias do Construtor multi-dia; dias seed ficam intactos', () => {
    expect(programDayDisplayLabel({ name: 'Peito e Tríceps', dayNumber: 1 })).toBe('Dia 1 — Peito e Tríceps');
    expect(programDayDisplayLabel({ name: 'Dia A — Peito Foco' })).toBe('Dia A — Peito Foco');
    expect(programDayDisplayLabel({ name: 'Meu Treino', dayNumber: undefined })).toBe('Meu Treino');
  });
});
