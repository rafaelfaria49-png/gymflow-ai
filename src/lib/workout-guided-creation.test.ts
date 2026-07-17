import { describe, expect, it } from 'vitest';
import type { WorkoutProgramTemplate } from '../types/workout-templates';
import { createSequentialIdFactory } from './workout-builder-id';
import { getWorkoutTemplate } from './workout-templates';
import {
  MAX_FREQUENCY_DAYS,
  adjustVolumeProfileForReturn,
  createEmptyWorkoutDraftFromFrequency,
  createWorkoutDraftFromTemplate,
  resolveFrequencyDayCount,
} from './workout-guided-creation';
import {
  buildWorkoutProgramFromDraft,
  normalizeWorkoutProgramForBuilder,
} from './workout-program-normalization';
import { isDraftDirty, serializeDraftSignature } from './workout-builder';
import { NO_FOCUS_DAY_NAME } from './workout-day-naming';

const PROFILE = { level: 'intermediate', duration: 60, frequency: 4 } as const;
const upperLower = getWorkoutTemplate('upper-lower-4')!;
const returnTemplate = getWorkoutTemplate('return-full-body-3')!;

describe('createWorkoutDraftFromTemplate — conversão pura (GOAL-19B PART 6)', () => {
  it('converte a estrutura do template em um draft editável', () => {
    const draft = createWorkoutDraftFromTemplate(upperLower, PROFILE, { createId: createSequentialIdFactory() });
    expect(draft.days).toHaveLength(4);
    expect(draft.name).toBe(upperLower.name);
    expect(draft.level).toBe('intermediate');
    expect(draft.days.map((day) => day.customName)).toEqual(['Superior', 'Inferior', 'Superior', 'Inferior']);
  });

  it('cria ids novos para o programa e todos os dias', () => {
    const draft = createWorkoutDraftFromTemplate(upperLower, PROFILE, { createId: createSequentialIdFactory() });
    expect(draft.programId).toBeUndefined();
    const ids = draft.days.map((day) => day.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['day_1', 'day_2', 'day_3', 'day_4']);
  });

  it('todo dia nasce com slots vazios — nenhum exercício é inserido', () => {
    const draft = createWorkoutDraftFromTemplate(upperLower, PROFILE, { createId: createSequentialIdFactory() });
    expect(draft.days.every((day) => day.slots.length === 0)).toBe(true);
  });

  it('usa targetMinutes do perfil quando ele existe', () => {
    const draft = createWorkoutDraftFromTemplate(upperLower, { level: 'advanced', duration: 75 }, {
      createId: createSequentialIdFactory(),
    });
    expect(draft.days.every((day) => day.targetMinutes === 75)).toBe(true);
    expect(draft.targetMinutes).toBe(75);
  });

  it('usa fallback do volumeProfile quando o perfil não traz duração', () => {
    const draft = createWorkoutDraftFromTemplate(upperLower, { level: 'beginner' }, {
      createId: createSequentialIdFactory(),
    });
    // standard -> ponto médio arredondado de 50..65 = 58
    expect(draft.days.every((day) => day.targetMinutes === 58)).toBe(true);
  });

  it('perfil returning mantém o nível e o volume conservador do template de retorno', () => {
    const draft = createWorkoutDraftFromTemplate(returnTemplate, {
      level: 'advanced',
      duration: 45,
      trainingStatus: 'returning',
    }, { createId: createSequentialIdFactory() });
    expect(draft.level).toBe('advanced'); // retorno NÃO rebaixa o nível
    expect(draft.days.every((day) => day.volumeProfile === 'compact')).toBe(true);
  });

  it('returning só rebaixa volumeProfile "high" para "standard" (nada mais)', () => {
    const highTemplate: WorkoutProgramTemplate = {
      id: 'x-high',
      name: 'Sintético alto volume',
      description: 'teste',
      recommendedFrequencies: [3],
      levelCompatibility: ['advanced'],
      goalCompatibility: ['hypertrophy'],
      tags: [],
      days: [{ muscleGroupIds: ['chest'], volumeProfile: 'high' }],
      disclaimer: 'teste',
    };
    const returning = createWorkoutDraftFromTemplate(highTemplate, { level: 'advanced', trainingStatus: 'returning' });
    expect(returning.days[0].volumeProfile).toBe('standard');
    const active = createWorkoutDraftFromTemplate(highTemplate, { level: 'advanced', trainingStatus: 'active' });
    expect(active.days[0].volumeProfile).toBe('high');
  });

  it('adjustVolumeProfileForReturn é conservador e explícito', () => {
    expect(adjustVolumeProfileForReturn('high', { level: 'advanced', trainingStatus: 'returning' })).toBe('standard');
    expect(adjustVolumeProfileForReturn('standard', { level: 'advanced', trainingStatus: 'returning' })).toBe('standard');
    expect(adjustVolumeProfileForReturn('compact', { level: 'advanced', trainingStatus: 'returning' })).toBe('compact');
    expect(adjustVolumeProfileForReturn('high', { level: 'advanced', trainingStatus: 'active' })).toBe('high');
  });

  it('não muta o template de origem', () => {
    const before = JSON.stringify(upperLower);
    createWorkoutDraftFromTemplate(upperLower, PROFILE, { createId: createSequentialIdFactory() });
    expect(JSON.stringify(upperLower)).toBe(before);
  });

  it('faz roundtrip com build/normalize sem perder dias nem inventar exercícios', () => {
    const draft = createWorkoutDraftFromTemplate(upperLower, PROFILE, { createId: createSequentialIdFactory() });
    const program = buildWorkoutProgramFromDraft(draft, null, createSequentialIdFactory());
    expect(program.isCustom).toBe(true);
    expect(program.exercises).toEqual([]);
    expect(program.weeks[0].days).toHaveLength(4);

    const reopened = normalizeWorkoutProgramForBuilder(program, { createId: createSequentialIdFactory() });
    expect(reopened.days).toHaveLength(4);
    expect(reopened.days.every((day) => day.slots.length === 0)).toBe(true);
    expect(reopened.days.map((day) => day.muscleGroupIds)).toEqual(draft.days.map((day) => day.muscleGroupIds));
  });
});

describe('createEmptyWorkoutDraftFromFrequency — dias vazios (GOAL-19B PART 7)', () => {
  it.each([1, 3, 4, 5, 7])('cria exatamente %i dias vazios', (count) => {
    const draft = createEmptyWorkoutDraftFromFrequency({ level: 'intermediate', frequency: count }, undefined, createSequentialIdFactory());
    expect(draft.days).toHaveLength(count);
    expect(draft.days.every((day) => day.slots.length === 0)).toBe(true);
    expect(draft.days.every((day) => day.muscleGroupIds.length === 0)).toBe(true);
  });

  it('nunca escolhe foco muscular automaticamente', () => {
    const draft = createEmptyWorkoutDraftFromFrequency({ level: 'beginner', frequency: 5 }, undefined, createSequentialIdFactory());
    expect(draft.days.every((day) => day.autoName === NO_FOCUS_DAY_NAME)).toBe(true);
  });

  it('respeita o teto de dias mesmo se pedirem mais', () => {
    const draft = createEmptyWorkoutDraftFromFrequency({ level: 'athlete', frequency: 12 }, 12, createSequentialIdFactory());
    expect(draft.days).toHaveLength(MAX_FREQUENCY_DAYS);
  });

  it('frequência ausente cai para 1 dia (sem inventar divisão)', () => {
    const draft = createEmptyWorkoutDraftFromFrequency({ level: 'beginner' }, undefined, createSequentialIdFactory());
    expect(draft.days).toHaveLength(1);
  });

  it('frequência inválida cai para 1 dia', () => {
    expect(resolveFrequencyDayCount({ level: 'beginner', frequency: 0 })).toBe(1);
    expect(resolveFrequencyDayCount({ level: 'beginner', frequency: -3 })).toBe(1);
    expect(resolveFrequencyDayCount({ level: 'beginner', frequency: Number.NaN })).toBe(1);
  });

  it('dayCount explícito sobrepõe a frequência do perfil', () => {
    expect(resolveFrequencyDayCount({ level: 'beginner', frequency: 3 }, 6)).toBe(6);
  });

  it('aplicar um template/frequência deixa o draft "sujo" contra a base em branco (PART 16)', () => {
    // A base do dirty-state no Construtor é o draft em branco do mount. Aplicar uma
    // estrutura deve ser detectado como alteração não salva, protegendo a saída.
    const blank = normalizeWorkoutProgramForBuilder(undefined, { createId: createSequentialIdFactory() });
    const blankSignature = serializeDraftSignature(blank);

    const fromTemplate = createWorkoutDraftFromTemplate(upperLower, PROFILE, { createId: createSequentialIdFactory() });
    expect(isDraftDirty(fromTemplate, blankSignature)).toBe(true);

    const fromFrequency = createEmptyWorkoutDraftFromFrequency({ level: 'intermediate', frequency: 4 }, undefined, createSequentialIdFactory());
    expect(isDraftDirty(fromFrequency, blankSignature)).toBe(true);
  });

  it('ids são únicos e o draft faz roundtrip', () => {
    const draft = createEmptyWorkoutDraftFromFrequency({ level: 'intermediate', frequency: 3, duration: 50 }, undefined, createSequentialIdFactory());
    const ids = draft.days.map((day) => day.id);
    expect(new Set(ids).size).toBe(3);
    const program = buildWorkoutProgramFromDraft(draft, null, createSequentialIdFactory());
    expect(program.weeks[0].days).toHaveLength(3);
    expect(program.frequencyDays).toBe(3);
  });
});
