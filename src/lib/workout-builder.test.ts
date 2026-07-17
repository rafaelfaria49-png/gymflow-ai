import { describe, expect, it } from 'vitest';
import type { Exercise, ExerciseSlot, WorkoutProgram } from '../types';
import type { BuilderIdFactory, WorkoutProgramBuilderDraft } from '../types/workout-builder';
import { MOCK_EXERCISES } from '../mock/exercises';
import { estimateWorkoutDurationDetailed } from './workoutDuration';
import { createSequentialIdFactory } from './workout-builder-id';
import {
  buildWorkoutProgramFromDraft,
  normalizeWorkoutProgramForBuilder,
} from './workout-program-normalization';
import {
  LEGACY_GENERIC_COVERAGE,
  MAX_PROGRAM_DAYS,
  activeWorkoutNameForDay,
  addDayToDraft,
  addEmptyDaysToDraft,
  addSlotToDay,
  canRemoveDay,
  clampTargetMinutes,
  clearDayCustomName,
  countExerciseInDay,
  dayDisplayName,
  draftHasAnyExercise,
  duplicateDayInDraft,
  duplicateSlotInDay,
  filterExercisesByDayFocus,
  findDay,
  findExerciseInOtherDays,
  isDraftDirty,
  matchesDayFocus,
  moveDayInDraft,
  moveSlotInDay,
  removeDayFromDraft,
  removeSlotFromDay,
  renumberDays,
  serializeDraftSignature,
  summarizeDayVolume,
  summarizeProgramVolume,
  toggleDayMuscleGroup,
  updateDayInDraft,
  updateSlotInDay,
} from './workout-builder';

const PROFILE = { level: 'intermediate', goal: 'hypertrophy', trainingStatus: 'active' } as const;

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

function newDraft(): WorkoutProgramBuilderDraft {
  return normalizeWorkoutProgramForBuilder(undefined, { createId: createSequentialIdFactory() });
}

/**
 * Draft com N dias e ids determinísticos (day_1..day_N).
 *
 * Devolve também a fábrica: TODO id do mesmo draft precisa sair da MESMA fábrica,
 * senão a sequência reinicia e dois dias nascem com o mesmo id. Em produção a
 * fábrica real é `crypto.randomUUID`, onde isso não acontece.
 */
function makeDraft(count = 1): { draft: WorkoutProgramBuilderDraft; createId: BuilderIdFactory } {
  const createId = createSequentialIdFactory();
  let draft = normalizeWorkoutProgramForBuilder(undefined, { createId });
  for (let index = 1; index < count; index += 1) draft = addDayToDraft(draft, createId);
  return { draft, createId };
}

function draftWithDays(count: number): WorkoutProgramBuilderDraft {
  return makeDraft(count).draft;
}

describe('criação de dias', () => {
  it('um programa novo começa com exatamente o Dia 1', () => {
    const draft = newDraft();
    expect(draft.days).toHaveLength(1);
    expect(draft.days[0].dayNumber).toBe(1);
    expect(draft.days[0].slots).toEqual([]);
    expect(draft.days[0].muscleGroupIds).toEqual([]);
  });

  it('adiciona dias vazios, sem exercícios inventados', () => {
    const draft = addDayToDraft(newDraft(), createSequentialIdFactory());
    expect(draft.days).toHaveLength(2);
    expect(draft.days[1].slots).toEqual([]);
    expect(draft.days.map((day) => day.dayNumber)).toEqual([1, 2]);
  });

  it('cria N dias vazios de uma vez (frequência do perfil como sugestão)', () => {
    const draft = addEmptyDaysToDraft(newDraft(), 4, createSequentialIdFactory());
    expect(draft.days).toHaveLength(5);
    expect(draft.days.every((day) => day.slots.length === 0)).toBe(true);
    expect(draft.days.map((day) => day.dayNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it('respeita o teto de dias', () => {
    const draft = addEmptyDaysToDraft(newDraft(), 50, createSequentialIdFactory());
    expect(draft.days).toHaveLength(MAX_PROGRAM_DAYS);
  });

  it('novos dias herdam o tempo alvo do programa', () => {
    const base = normalizeWorkoutProgramForBuilder(undefined, {
      fallbackTargetMinutes: 45,
      createId: createSequentialIdFactory(),
    });
    const draft = addDayToDraft(base, createSequentialIdFactory());
    expect(draft.days[1].targetMinutes).toBe(45);
  });
});

describe('remoção de dias', () => {
  it('nunca remove o último dia', () => {
    const draft = newDraft();
    expect(canRemoveDay(draft)).toBe(false);
    expect(removeDayFromDraft(draft, draft.days[0].id)).toBe(draft);
    expect(removeDayFromDraft(draft, draft.days[0].id).days).toHaveLength(1);
  });

  it('remove o dia pedido e renumera sem deixar lacuna', () => {
    const draft = draftWithDays(3);
    const removed = removeDayFromDraft(draft, draft.days[1].id);
    expect(removed.days).toHaveLength(2);
    expect(removed.days.map((day) => day.id)).toEqual([draft.days[0].id, draft.days[2].id]);
    expect(removed.days.map((day) => day.dayNumber)).toEqual([1, 2]);
  });

  it('ignora id inexistente', () => {
    const draft = draftWithDays(2);
    expect(removeDayFromDraft(draft, 'nao_existe')).toBe(draft);
  });
});

describe('duplicação de dias', () => {
  it('duplica logo após o original com id novo e slots copiados', () => {
    const { draft: base, createId } = makeDraft(2);
    let draft = addSlotToDay(base, base.days[0].id, slot('chest_supino_reto'));
    draft = updateDayInDraft(draft, base.days[0].id, { muscleGroupIds: ['chest', 'triceps'] });

    const duplicated = duplicateDayInDraft(draft, base.days[0].id, createId);
    expect(duplicated.days).toHaveLength(3);
    expect(duplicated.days[1].id).not.toBe(duplicated.days[0].id);
    expect(duplicated.days[1].slots).toEqual(duplicated.days[0].slots);
    expect(duplicated.days[1].muscleGroupIds).toEqual(['chest', 'triceps']);
    expect(duplicated.days.map((day) => day.dayNumber)).toEqual([1, 2, 3]);
  });

  it('a cópia não compartilha slots nem foco com o original', () => {
    const { draft: base, createId } = makeDraft();
    let draft = addSlotToDay(base, 'day_1', slot('chest_supino_reto'));
    draft = duplicateDayInDraft(draft, 'day_1', createId);
    draft = updateSlotInDay(draft, draft.days[1].id, 0, { series: 9 });
    expect(draft.days[0].slots[0].series).toBe(3);
    expect(draft.days[1].slots[0].series).toBe(9);
  });

  it('marca "(Cópia)" apenas quando havia nome customizado', () => {
    const auto = makeDraft();
    let draft = updateDayInDraft(auto.draft, 'day_1', { muscleGroupIds: ['chest'] });
    draft = duplicateDayInDraft(draft, 'day_1', auto.createId);
    expect(draft.days[1].customName).toBeUndefined();
    expect(dayDisplayName(draft.days[1])).toBe('Peito');

    const custom = makeDraft();
    let named = updateDayInDraft(custom.draft, 'day_1', { customName: 'Treino de empurrar' });
    named = duplicateDayInDraft(named, 'day_1', custom.createId);
    expect(named.days[1].customName).toBe('Treino de empurrar (Cópia)');
  });

  it('respeita o teto ao duplicar', () => {
    const draft = draftWithDays(MAX_PROGRAM_DAYS);
    expect(duplicateDayInDraft(draft, draft.days[0].id, createSequentialIdFactory())).toBe(draft);
  });
});

describe('reordenação e numeração', () => {
  it('reordena e renumera, mantendo os ids estáveis', () => {
    const draft = draftWithDays(3);
    const ids = draft.days.map((day) => day.id);
    const moved = moveDayInDraft(draft, ids[2], -1);

    expect(moved.days.map((day) => day.id)).toEqual([ids[0], ids[2], ids[1]]);
    expect(moved.days.map((day) => day.dayNumber)).toEqual([1, 2, 3]);
    // O número segue a posição; o id nunca muda.
    expect(findDay(moved, ids[2])?.dayNumber).toBe(2);
    expect(findDay(moved, ids[1])?.dayNumber).toBe(3);
  });

  it('não move além das bordas', () => {
    const draft = draftWithDays(2);
    expect(moveDayInDraft(draft, draft.days[0].id, -1)).toBe(draft);
    expect(moveDayInDraft(draft, draft.days[1].id, 1)).toBe(draft);
  });

  it('renumberDays sempre deriva o número da posição', () => {
    const draft = draftWithDays(3);
    const scrambled = draft.days.map((day) => ({ ...day, dayNumber: 99 }));
    expect(renumberDays(scrambled).map((day) => day.dayNumber)).toEqual([1, 2, 3]);
  });
});

describe('foco muscular', () => {
  it('liga e desliga grupos', () => {
    let draft = toggleDayMuscleGroup(newDraft(), 'day_1', 'chest');
    expect(draft.days[0].muscleGroupIds).toEqual(['chest']);
    draft = toggleDayMuscleGroup(draft, 'day_1', 'triceps');
    expect(draft.days[0].muscleGroupIds).toEqual(['chest', 'triceps']);
    draft = toggleDayMuscleGroup(draft, 'day_1', 'chest');
    expect(draft.days[0].muscleGroupIds).toEqual(['triceps']);
  });

  it('mantém a ordem da taxonomia independente da ordem de clique', () => {
    let draft = toggleDayMuscleGroup(newDraft(), 'day_1', 'triceps');
    draft = toggleDayMuscleGroup(draft, 'day_1', 'chest');
    expect(draft.days[0].muscleGroupIds).toEqual(['chest', 'triceps']);
  });

  it('recalcula o nome automático ao mudar o foco', () => {
    let draft = toggleDayMuscleGroup(newDraft(), 'day_1', 'back');
    expect(draft.days[0].autoName).toBe('Costas');
    draft = toggleDayMuscleGroup(draft, 'day_1', 'biceps');
    expect(draft.days[0].autoName).toBe('Costas e Bíceps');
  });

  it('mudar o foco não apaga o nome customizado', () => {
    let draft = updateDayInDraft(newDraft(), 'day_1', { customName: 'Treino de empurrar' });
    draft = toggleDayMuscleGroup(draft, 'day_1', 'chest');
    draft = toggleDayMuscleGroup(draft, 'day_1', 'shoulders');
    expect(draft.days[0].customName).toBe('Treino de empurrar');
    expect(draft.days[0].autoName).toBe('Peito e Ombros');
    expect(dayDisplayName(draft.days[0])).toBe('Treino de empurrar');
  });

  it('"usar nome automático" volta a exibir o nome do foco', () => {
    let draft = updateDayInDraft(newDraft(), 'day_1', { customName: 'Treino de empurrar', muscleGroupIds: ['chest'] });
    draft = clearDayCustomName(draft, 'day_1');
    expect(draft.days[0].customName).toBeUndefined();
    expect(dayDisplayName(draft.days[0])).toBe('Peito');
  });

  it('nome customizado só com espaços não prevalece', () => {
    const draft = updateDayInDraft(newDraft(), 'day_1', { customName: '   ', muscleGroupIds: ['chest'] });
    expect(draft.days[0].customName).toBeUndefined();
    expect(dayDisplayName(draft.days[0])).toBe('Peito');
  });

  it('ignora grupos duplicados vindos de um patch', () => {
    const draft = updateDayInDraft(newDraft(), 'day_1', { muscleGroupIds: ['chest', 'chest', 'triceps'] });
    expect(draft.days[0].muscleGroupIds).toEqual(['chest', 'triceps']);
  });
});

describe('slots isolados por dia', () => {
  it('cada dia tem a própria lista de exercícios', () => {
    let draft = draftWithDays(2);
    draft = addSlotToDay(draft, 'day_1', slot('chest_supino_reto'));
    draft = addSlotToDay(draft, 'day_2', slot('back_puxada_pulley'));

    expect(draft.days[0].slots.map((s) => s.exerciseId)).toEqual(['chest_supino_reto']);
    expect(draft.days[1].slots.map((s) => s.exerciseId)).toEqual(['back_puxada_pulley']);
  });

  it('editar um dia não afeta os outros', () => {
    let draft = draftWithDays(3);
    draft = addSlotToDay(draft, 'day_1', slot('chest_supino_reto'));
    draft = addSlotToDay(draft, 'day_2', slot('back_puxada_pulley'));
    draft = addSlotToDay(draft, 'day_3', slot('legs_agachamento_barra'));

    const edited = updateSlotInDay(draft, 'day_2', 0, { series: 5 });
    expect(edited.days[0].slots[0].series).toBe(3);
    expect(edited.days[1].slots[0].series).toBe(5);
    expect(edited.days[2].slots[0].series).toBe(3);
  });

  it('reordenar dias preserva os slots de cada dia', () => {
    let draft = draftWithDays(2);
    draft = addSlotToDay(draft, 'day_1', slot('chest_supino_reto'));
    draft = addSlotToDay(draft, 'day_2', slot('back_puxada_pulley'));

    const moved = moveDayInDraft(draft, 'day_2', -1);
    expect(moved.days[0].id).toBe('day_2');
    expect(moved.days[0].slots.map((s) => s.exerciseId)).toEqual(['back_puxada_pulley']);
    expect(moved.days[1].slots.map((s) => s.exerciseId)).toEqual(['chest_supino_reto']);
  });

  it('o mesmo exercício pode existir em dias diferentes', () => {
    let draft = draftWithDays(2);
    draft = addSlotToDay(draft, 'day_1', slot('chest_supino_reto'));
    draft = addSlotToDay(draft, 'day_2', slot('chest_supino_reto'));

    expect(countExerciseInDay(findDay(draft, 'day_1'), 'chest_supino_reto')).toBe(1);
    expect(countExerciseInDay(findDay(draft, 'day_2'), 'chest_supino_reto')).toBe(1);
    expect(findExerciseInOtherDays(draft, 'day_1', 'chest_supino_reto').map((day) => day.id)).toEqual(['day_2']);
  });

  it('duplicidade no mesmo dia é contada para avisar, nunca bloqueada', () => {
    let draft = addSlotToDay(newDraft(), 'day_1', slot('chest_supino_reto'));
    draft = addSlotToDay(draft, 'day_1', slot('chest_supino_reto'));
    expect(countExerciseInDay(findDay(draft, 'day_1'), 'chest_supino_reto')).toBe(2);
    expect(findExerciseInOtherDays(draft, 'day_1', 'chest_supino_reto')).toEqual([]);
  });

  it('remove, duplica e reordena slots dentro do dia', () => {
    let draft = addSlotToDay(newDraft(), 'day_1', slot('chest_supino_reto'));
    draft = addSlotToDay(draft, 'day_1', slot('triceps_polia_corda'));

    const moved = moveSlotInDay(draft, 'day_1', 0, 1);
    expect(moved.days[0].slots.map((s) => s.exerciseId)).toEqual(['triceps_polia_corda', 'chest_supino_reto']);

    const duplicated = duplicateSlotInDay(draft, 'day_1', 0);
    expect(duplicated.days[0].slots.map((s) => s.exerciseId))
      .toEqual(['chest_supino_reto', 'chest_supino_reto', 'triceps_polia_corda']);

    const removed = removeSlotFromDay(draft, 'day_1', 0);
    expect(removed.days[0].slots.map((s) => s.exerciseId)).toEqual(['triceps_polia_corda']);
  });
});

describe('estado não salvo', () => {
  it('não está sujo logo após salvar', () => {
    const draft = addSlotToDay(newDraft(), 'day_1', slot('chest_supino_reto'));
    const signature = serializeDraftSignature(draft);
    expect(isDraftDirty(draft, signature)).toBe(false);
  });

  it.each<[string, (draft: WorkoutProgramBuilderDraft, createId: BuilderIdFactory) => WorkoutProgramBuilderDraft]>([
    ['nome', (draft) => ({ ...draft, name: 'Outro nome' })],
    ['objetivo', (draft) => ({ ...draft, objective: 'Outro objetivo' })],
    ['nível', (draft) => ({ ...draft, level: 'advanced' })],
    ['dias', (draft, createId) => addDayToDraft(draft, createId)],
    ['foco', (draft) => toggleDayMuscleGroup(draft, 'day_1', 'chest')],
    ['tempo alvo', (draft) => updateDayInDraft(draft, 'day_1', { targetMinutes: 75 })],
    ['perfil de volume', (draft) => updateDayInDraft(draft, 'day_1', { volumeProfile: 'high' })],
    ['slots', (draft) => addSlotToDay(draft, 'day_1', slot('triceps_polia_corda'))],
    ['nome do dia', (draft) => updateDayInDraft(draft, 'day_1', { customName: 'Novo' })],
  ])('detecta alteração de %s', (_label, mutate) => {
    const { draft: base, createId } = makeDraft();
    const draft = addSlotToDay(base, 'day_1', slot('chest_supino_reto'));
    const signature = serializeDraftSignature(draft);
    expect(isDraftDirty(mutate(draft, createId), signature)).toBe(true);
  });

  it('detecta reordenação de dias', () => {
    const draft = draftWithDays(2);
    const signature = serializeDraftSignature(draft);
    expect(isDraftDirty(moveDayInDraft(draft, 'day_2', -1), signature)).toBe(true);
  });
});

describe('duração por dia', () => {
  const exercises = MOCK_EXERCISES;

  it('dia vazio não tem duração', () => {
    const estimate = estimateWorkoutDurationDetailed(newDraft().days[0].slots, exercises);
    expect(estimate.totalMinutes).toBe(0);
    expect(estimate.exerciseCount).toBe(0);
  });

  it('expõe bounds, fatores e confiança', () => {
    let draft = addSlotToDay(newDraft(), 'day_1', slot('chest_supino_reto', { series: 4 }));
    draft = addSlotToDay(draft, 'day_1', slot('triceps_polia_corda', { series: 3 }));

    const estimate = estimateWorkoutDurationDetailed(draft.days[0].slots, exercises, { goal: 'hypertrophy' });
    expect(estimate.totalSeries).toBe(7);
    expect(estimate.totalMinutes).toBeGreaterThan(0);
    expect(estimate.lowerBoundMinutes).toBeLessThanOrEqual(estimate.totalMinutes);
    expect(estimate.upperBoundMinutes).toBeGreaterThanOrEqual(estimate.totalMinutes);
    expect(estimate.restSeconds).toBeGreaterThan(0);
    expect(estimate.setupSeconds).toBeGreaterThan(0);
    // Catálogo ainda sem curadoria canônica -> a confiança nunca é 'high'.
    expect(['medium', 'low']).toContain(estimate.confidence);
  });

  it('um dia de 32 séries é estimado sem remover nada', () => {
    let draft = newDraft();
    for (const exerciseId of ['back_puxada_pulley', 'back_remada_curvada', 'back_remada_baixa', 'back_barra_fixa',
      'biceps_rosca_direta', 'biceps_rosca_martelo', 'chest_supino_reto', 'chest_peck_deck']) {
      draft = addSlotToDay(draft, 'day_1', slot(exerciseId, { series: 4 }));
    }
    const estimate = estimateWorkoutDurationDetailed(draft.days[0].slots, exercises, { goal: 'hypertrophy' });

    expect(estimate.totalSeries).toBe(32);
    expect(draft.days[0].slots).toHaveLength(8);
    expect(estimate.totalMinutes).toBeGreaterThan(60);
  });

  it('cada dia é estimado isoladamente', () => {
    let draft = draftWithDays(2);
    draft = addSlotToDay(draft, 'day_1', slot('chest_supino_reto', { series: 4 }));
    draft = addSlotToDay(draft, 'day_2', slot('chest_supino_reto', { series: 4 }));
    draft = addSlotToDay(draft, 'day_2', slot('chest_peck_deck', { series: 4 }));

    const first = estimateWorkoutDurationDetailed(draft.days[0].slots, exercises);
    const second = estimateWorkoutDurationDetailed(draft.days[1].slots, exercises);
    expect(second.totalMinutes).toBeGreaterThan(first.totalMinutes);
  });
});

describe('volume por dia', () => {
  it('conta séries diretas e exposição secundária ponderada por 0,5', () => {
    const draft = addSlotToDay(newDraft(), 'day_1', slot('chest_supino_reto', { series: 4 }));
    const analysis = summarizeDayVolume(draft.days[0], MOCK_EXERCISES);

    const chest = analysis.muscleVolume.find((item) => item.muscleGroupId === 'chest');
    const triceps = analysis.muscleVolume.find((item) => item.muscleGroupId === 'triceps');
    expect(chest?.directSets).toBe(4);
    expect(triceps?.secondaryExposure).toBe(2);
    expect(triceps?.directSets).toBe(0);
    expect(analysis.totalWorkingSets).toBe(4);
  });

  it('exercício ausente do catálogo vira série não classificada, sem grupo inventado', () => {
    const draft = addSlotToDay(newDraft(), 'day_1', slot('exercicio_que_nao_existe', { series: 3 }));
    const analysis = summarizeDayVolume(draft.days[0], MOCK_EXERCISES);

    expect(analysis.unclassifiedSets).toBe(3);
    expect(analysis.muscleVolume).toEqual([]);
    expect(analysis.confidence).toBe('low');
  });

  it('dado legado reduz a confiança sem esconder o volume', () => {
    const draft = addSlotToDay(newDraft(), 'day_1', slot('chest_supino_reto', { series: 3 }));
    const analysis = summarizeDayVolume(draft.days[0], MOCK_EXERCISES);
    expect(analysis.confidence).not.toBe('high');
    expect(analysis.muscleVolume.length).toBeGreaterThan(0);
  });

  it('dia vazio não gera volume', () => {
    const analysis = summarizeDayVolume(newDraft().days[0], MOCK_EXERCISES);
    expect(analysis.totalWorkingSets).toBe(0);
    expect(analysis.muscleVolume).toEqual([]);
  });
});

describe('volume semanal do programa', () => {
  it('soma todos os dias uma vez por semana', () => {
    let draft = draftWithDays(2);
    draft = addSlotToDay(draft, 'day_1', slot('chest_supino_reto', { series: 4 }));
    draft = addSlotToDay(draft, 'day_2', slot('chest_peck_deck', { series: 4 }));

    const summary = summarizeProgramVolume(draft, MOCK_EXERCISES, PROFILE);
    const chest = summary.comparisons.find((item) => item.muscleGroupId === 'chest');
    expect(chest?.directSets).toBe(8);
    expect(summary.totalWorkingSets).toBe(8);
  });

  it('compara com a referência semanal do perfil e avisa em texto', () => {
    let draft = newDraft();
    for (let index = 0; index < 5; index += 1) {
      draft = addSlotToDay(draft, 'day_1', slot('triceps_polia_corda', { series: 5 }));
    }
    const summary = summarizeProgramVolume(draft, MOCK_EXERCISES, PROFILE);
    const triceps = summary.comparisons.find((item) => item.muscleGroupId === 'triceps');

    expect(triceps?.directSets).toBe(25);
    expect(triceps?.level).toBe('very_high');
    expect(summary.warnings).toContain('O volume semanal de tríceps está acima da referência inicial.');
    // O aviso é textual: os slots continuam intactos.
    expect(draft.days[0].slots).toHaveLength(5);
    expect(draft.days[0].slots.every((s) => s.series === 5)).toBe(true);
  });

  it('avisa foco declarado sem trabalho direto verificável', () => {
    let draft = updateDayInDraft(newDraft(), 'day_1', { muscleGroupIds: ['chest', 'calves'] });
    draft = addSlotToDay(draft, 'day_1', slot('chest_supino_reto', { series: 4 }));

    const summary = summarizeProgramVolume(draft, MOCK_EXERCISES, PROFILE);
    expect(summary.focusWithoutDirectWork).toContain('calves');
    expect(summary.warnings).toContain('Este programa ainda não possui trabalho direto para panturrilhas.');
  });

  it('NÃO afirma ausência de posterior quando há trabalho de perna classificado genericamente', () => {
    // legs_mesa_flexora é flexora de joelhos, mas o catálogo legado a marca como 'legs'.
    // Afirmar "sem trabalho direto para posterior" aqui seria factualmente falso.
    let draft = updateDayInDraft(newDraft(), 'day_1', { muscleGroupIds: ['quadriceps', 'hamstrings'] });
    draft = addSlotToDay(draft, 'day_1', slot('legs_mesa_flexora', { series: 4 }));
    draft = addSlotToDay(draft, 'day_1', slot('legs_cadeira_extensora', { series: 4 }));

    const summary = summarizeProgramVolume(draft, MOCK_EXERCISES, PROFILE);
    expect(summary.focusWithoutDirectWork).not.toContain('hamstrings');
    expect(summary.focusWithoutDirectWork).not.toContain('quadriceps');
    expect(summary.focusCoveredByGenericWork).toEqual(['quadriceps', 'hamstrings']);
    expect(summary.warnings.some((warning) => warning.includes('classificado de forma genérica'))).toBe(true);
  });

  it('sinaliza classificação incompleta do catálogo atual', () => {
    const draft = addSlotToDay(newDraft(), 'day_1', slot('chest_supino_reto', { series: 3 }));
    const summary = summarizeProgramVolume(draft, MOCK_EXERCISES, PROFILE);
    expect(summary.warnings).toContain('Alguns exercícios não estão totalmente classificados.');
    expect(summary.confidence).not.toBe('high');
  });

  it('programa vazio não inventa volume nem referência', () => {
    const summary = summarizeProgramVolume(newDraft(), MOCK_EXERCISES, PROFILE);
    expect(summary.totalWorkingSets).toBe(0);
    expect(summary.comparisons).toEqual([]);
    expect(summary.muscleVolume).toEqual([]);
  });

  it('séries não classificadas aparecem no resumo', () => {
    const draft = addSlotToDay(newDraft(), 'day_1', slot('nao_existe', { series: 3 }));
    const summary = summarizeProgramVolume(draft, MOCK_EXERCISES, PROFILE);
    expect(summary.unclassifiedSets).toBe(3);
  });
});

describe('foco do dia no seletor', () => {
  const supino = MOCK_EXERCISES.find((ex) => ex.id === 'chest_supino_reto') as Exercise;
  const flexora = MOCK_EXERCISES.find((ex) => ex.id === 'legs_mesa_flexora') as Exercise;

  it('sem foco devolve a biblioteca inteira sem marcar legado', () => {
    const result = filterExercisesByDayFocus(MOCK_EXERCISES, []);
    expect(result.exercises).toHaveLength(MOCK_EXERCISES.length);
    expect(result.usesLegacyClassification).toBe(false);
  });

  it('casa pelo grupo legado do exercício e sinaliza a origem legada', () => {
    const match = matchesDayFocus(supino, ['chest']);
    expect(match).toEqual({ matches: true, kind: 'legacy-primary', legacy: true });
  });

  it('casa pelo sinergista legado', () => {
    const match = matchesDayFocus(supino, ['triceps']);
    expect(match.matches).toBe(true);
    expect(match.kind).toBe('legacy-secondary');
  });

  it('prefere a classificação canônica quando existir', () => {
    const curated: Exercise = { ...supino, primaryMuscleGroupId: 'chest' };
    expect(matchesDayFocus(curated, ['chest'])).toEqual({ matches: true, kind: 'primary', legacy: false });
  });

  it('foco de quadríceps encontra exercícios de perna genéricos em vez de lista vazia', () => {
    const result = filterExercisesByDayFocus(MOCK_EXERCISES, ['quadriceps']);
    expect(result.exercises.length).toBeGreaterThan(0);
    expect(result.exercises).toContain(flexora);
    expect(result.usesLegacyClassification).toBe(true);
    expect(matchesDayFocus(flexora, ['quadriceps']).kind).toBe('legacy-generic');
  });

  it('não casa exercício sem relação com o foco', () => {
    expect(matchesDayFocus(supino, ['calves']).matches).toBe(false);
  });

  it('legs_general cobre apenas subgrupos de perna ainda não curados', () => {
    expect(LEGACY_GENERIC_COVERAGE.legs_general).toEqual(['quadriceps', 'hamstrings', 'adductors', 'abductors']);
    // Glúteos e panturrilhas têm grupo legado próprio: a ausência deles é verificável.
    expect(LEGACY_GENERIC_COVERAGE.legs_general).not.toContain('glutes');
    expect(LEGACY_GENERIC_COVERAGE.legs_general).not.toContain('calves');
  });
});

describe('salvamento', () => {
  it('só é salvável com pelo menos um exercício', () => {
    expect(draftHasAnyExercise(newDraft())).toBe(false);
    expect(draftHasAnyExercise(addSlotToDay(newDraft(), 'day_1', slot('chest_supino_reto')))).toBe(true);
  });

  it('salvar um programa de 4 dias preserva os dias, o foco e os nomes', () => {
    const { draft: base, createId } = makeDraft();
    let draft = addEmptyDaysToDraft(base, 3, createId);
    draft = { ...draft, name: 'Meu ABCD' };

    const focus = [
      { ids: ['chest', 'triceps'] as const, expected: 'Peito e Tríceps' },
      { ids: ['back', 'biceps'] as const, expected: 'Costas e Bíceps' },
      { ids: ['quadriceps', 'calves'] as const, expected: 'Quadríceps e Panturrilhas' },
      { ids: ['hamstrings', 'glutes', 'shoulders'] as const, expected: 'Ombros, Posterior de coxa e Glúteos' },
    ];
    draft.days.forEach((day, index) => {
      draft = updateDayInDraft(draft, day.id, { muscleGroupIds: [...focus[index].ids] });
      draft = addSlotToDay(draft, day.id, slot('chest_supino_reto'));
    });

    const program = buildWorkoutProgramFromDraft(draft, undefined, createId);
    expect(program.weeks[0].days).toHaveLength(4);
    expect(program.frequencyDays).toBe(4);
    expect(program.weeks[0].days.map((day) => day.name)).toEqual(focus.map((item) => item.expected));
    expect(program.weeks[0].days.map((day) => day.dayNumber)).toEqual([1, 2, 3, 4]);
    expect(program.name).toBe('Meu ABCD');
    expect(program.isCustom).toBe(true);
  });

  it('reabrir um programa salvo devolve exatamente os mesmos dias', () => {
    const { draft: base, createId } = makeDraft();
    let draft = addEmptyDaysToDraft(base, 1, createId);
    draft = updateDayInDraft(draft, 'day_1', { muscleGroupIds: ['chest', 'triceps'] });
    draft = updateDayInDraft(draft, 'day_2', { customName: 'Treino de puxar', muscleGroupIds: ['back'] });
    draft = addSlotToDay(draft, 'day_1', slot('chest_supino_reto'));
    draft = addSlotToDay(draft, 'day_2', slot('back_puxada_pulley'));

    const program = buildWorkoutProgramFromDraft(draft, undefined, createId);
    const reopened = normalizeWorkoutProgramForBuilder(program);

    expect(reopened.programId).toBe(program.id);
    expect(reopened.days.map((day) => day.id)).toEqual(['day_1', 'day_2']);
    expect(reopened.days[0].customName).toBeUndefined();
    expect(reopened.days[0].muscleGroupIds).toEqual(['chest', 'triceps']);
    expect(reopened.days[1].customName).toBe('Treino de puxar');
    expect(reopened.days.map((day) => day.slots)).toEqual(draft.days.map((day) => day.slots));
  });

  it('editar um programa existente faz upsert pelo mesmo id', () => {
    const existing: WorkoutProgram = buildWorkoutProgramFromDraft(
      addSlotToDay(newDraft(), 'day_1', slot('chest_supino_reto')),
      undefined,
      createSequentialIdFactory(),
    );
    const reopened = normalizeWorkoutProgramForBuilder(existing);
    const resaved = buildWorkoutProgramFromDraft(addDayToDraft(reopened, createSequentialIdFactory()), existing);

    expect(resaved.id).toBe(existing.id);
    expect(resaved.weeks[0].days).toHaveLength(2);
    expect(resaved.weeks[0].days[0].id).toBe(existing.weeks[0].days[0].id);
  });
});

describe('nome da sessão ao iniciar', () => {
  it('programa de um dia mantém o nome do programa', () => {
    const draft = updateDayInDraft(newDraft(), 'day_1', { muscleGroupIds: ['chest'] });
    expect(activeWorkoutNameForDay('Meu Treino', draft.days[0], false)).toBe('Meu Treino');
  });

  it('programa multi-dia identifica qual dia foi iniciado', () => {
    const draft = updateDayInDraft(draftWithDays(2), 'day_2', { muscleGroupIds: ['back', 'biceps'] });
    expect(activeWorkoutNameForDay('Meu ABC', draft.days[1], true)).toBe('Meu ABC — Dia 2 · Costas e Bíceps');
  });

  it('o nome customizado do dia aparece na sessão', () => {
    const draft = updateDayInDraft(draftWithDays(2), 'day_2', { customName: 'Treino de empurrar' });
    expect(activeWorkoutNameForDay('Meu ABC', draft.days[1], true)).toBe('Meu ABC — Dia 2 · Treino de empurrar');
  });
});

describe('tempo alvo', () => {
  it.each([
    [null, 10],
    [undefined, 10],
    [0, 10],
    [5, 10],
    [45, 45],
    [61.4, 61],
    [9999, 240],
  ])('clampTargetMinutes(%j) -> %j', (input, expected) => {
    expect(clampTargetMinutes(input)).toBe(expected);
  });
});
