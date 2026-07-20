import { describe, expect, it } from 'vitest';
import type { Exercise, ExerciseSlot } from '../types';
import type { EquipmentId, MuscleGroupId } from '../types/training-taxonomy';
import type { TrainingExperienceLevel } from '../types/training-profile';
import { MOCK_EXERCISES } from '../mock/exercises';
import { updateDaySlots } from './workout-builder';
import { normalizeWorkoutProgramForBuilder } from './workout-program-normalization';
import {
  applySuggestionToDay,
  buildWorkoutSuggestionPreview,
  createDefaultExerciseSlot,
  type WorkoutSuggestionInput,
} from './workout-suggestion';

// ===== Fixtures determinísticas =====

type Kind = 'compound' | 'isolation';

interface MakeExercise {
  id: string;
  primary: Extract<MuscleGroupId, 'back' | 'biceps' | 'chest' | 'triceps'>;
  kind?: Kind;
  level?: TrainingExperienceLevel;
  /** Quando presente, usa o caminho LEGADO (sem primaryMuscleGroupId). */
  legacy?: boolean;
  equipmentIds?: EquipmentId[];
  equipment?: string;
}

function makeExercise(config: MakeExercise): Exercise {
  const kind = config.kind ?? 'compound';
  const secondary = kind === 'compound' ? ['triceps'] : [];
  const exercise: Exercise = {
    id: config.id,
    name: config.id,
    thumbnail: '',
    muscleGroup: config.primary,
    secondaryMuscles: secondary,
    equipment: config.equipment ?? 'Halteres',
    level: config.level ?? 'beginner',
    executionSteps: [],
    postureTips: [],
    breathing: '',
    commonErrors: [],
    errorCorrections: [],
    variations: [],
    substitutions: [],
    safetyWarnings: [],
    mechanics: kind,
  };
  if (!config.legacy) {
    exercise.primaryMuscleGroupId = config.primary;
    exercise.secondaryMuscleGroupIds = kind === 'compound' ? ['triceps'] : [];
  }
  if (config.equipmentIds) exercise.equipmentIds = config.equipmentIds;
  return exercise;
}

/** Catálogo canônico com costas (grande) e bíceps (pequeno), compostos e isolados. */
const CANONICAL_CATALOG: Exercise[] = [
  makeExercise({ id: 'back_c1', primary: 'back', kind: 'compound' }),
  makeExercise({ id: 'back_c2', primary: 'back', kind: 'compound' }),
  makeExercise({ id: 'back_c3', primary: 'back', kind: 'compound' }),
  makeExercise({ id: 'back_i1', primary: 'back', kind: 'isolation' }),
  makeExercise({ id: 'back_i2', primary: 'back', kind: 'isolation' }),
  makeExercise({ id: 'bic_c1', primary: 'biceps', kind: 'compound' }),
  makeExercise({ id: 'bic_i1', primary: 'biceps', kind: 'isolation' }),
  makeExercise({ id: 'bic_i2', primary: 'biceps', kind: 'isolation' }),
  makeExercise({ id: 'bic_i3', primary: 'biceps', kind: 'isolation' }),
  // fora do foco: nunca deve ser sugerido para costas/bíceps
  makeExercise({ id: 'chest_c1', primary: 'chest', kind: 'compound' }),
];

function baseInput(overrides: Partial<WorkoutSuggestionInput> = {}): WorkoutSuggestionInput {
  return {
    focusIds: ['back', 'biceps'],
    targetMinutes: 60,
    volumeProfile: 'standard',
    level: 'beginner',
    goal: 'hypertrophy',
    returnToTraining: null,
    existingSlots: [],
    catalog: CANONICAL_CATALOG,
    ...overrides,
  };
}

function seedDraftWithSlots(slots: ExerciseSlot[], targetMinutes = 60) {
  const draft = normalizeWorkoutProgramForBuilder(undefined, {
    fallbackLevel: 'beginner',
    fallbackTargetMinutes: targetMinutes,
  });
  const dayId = draft.days[0].id;
  return {
    draft: slots.length > 0 ? updateDaySlots(draft, dayId, () => slots) : draft,
    dayId,
  };
}

describe('workout suggestion — PART15', () => {
  it('29 — determinístico: duas chamadas idênticas produzem saída idêntica', () => {
    const first = buildWorkoutSuggestionPreview(baseInput());
    const second = buildWorkoutSuggestionPreview(baseInput());
    expect(second).toEqual(first);
    expect(second.additions.map((addition) => addition.exercise.id))
      .toEqual(first.additions.map((addition) => addition.exercise.id));
  });

  it('30 — não sugere duplicatas nem exercício já no dia nem equipamento indisponível', () => {
    const catalog: Exercise[] = [
      makeExercise({ id: 'back_db1', primary: 'back', equipmentIds: ['dumbbells'] }),
      makeExercise({ id: 'back_db2', primary: 'back', equipmentIds: ['dumbbells'] }),
      makeExercise({ id: 'back_bar', primary: 'back', equipmentIds: ['barbell'] }),
    ];
    const preview = buildWorkoutSuggestionPreview(baseInput({
      focusIds: ['back'],
      catalog,
      availableEquipment: ['dumbbells'],
      existingSlots: [createDefaultExerciseSlot(catalog[0])], // back_db1 já está no dia
    }));
    const ids = preview.additions.map((addition) => addition.exercise.id);
    expect(new Set(ids).size).toBe(ids.length); // sem repetição
    expect(ids).not.toContain('back_db1'); // já no dia
    expect(ids).not.toContain('back_bar'); // equipamento (barra) fora do perfil
    expect(ids).toContain('back_db2');
  });

  it('31 — aplicar SÓ acrescenta: slots existentes e o dia ficam intocados byte a byte', () => {
    const existingSlots: ExerciseSlot[] = [
      createDefaultExerciseSlot(makeExercise({ id: 'prev_1', primary: 'back' })),
      createDefaultExerciseSlot(makeExercise({ id: 'prev_2', primary: 'biceps', kind: 'isolation' })),
    ];
    const { draft, dayId } = seedDraftWithSlots(existingSlots);
    const before = draft.days[0];
    const preview = buildWorkoutSuggestionPreview(baseInput({ existingSlots: before.slots }));
    expect(preview.additions.length).toBeGreaterThan(0);

    const applied = applySuggestionToDay(draft, dayId, preview);
    const after = applied.days[0];

    // Os slots existentes seguem os mesmos objetos, na mesma ordem, no começo.
    expect(after.slots.slice(0, 2)).toEqual(before.slots);
    expect(after.slots[0]).toBe(before.slots[0]);
    expect(after.slots[1]).toBe(before.slots[1]);
    expect(after.slots.length).toBe(before.slots.length + preview.additions.length);
    // Nome, foco, tempo e perfil do dia não mudam.
    expect(after.muscleGroupIds).toEqual(before.muscleGroupIds);
    expect(after.customName).toBe(before.customName);
    expect(after.autoName).toBe(before.autoName);
    expect(after.targetMinutes).toBe(before.targetMinutes);
    expect(after.volumeProfile).toBe(before.volumeProfile);
  });

  it('32 — dia já cheio (dentro/acima do tempo): nada é sugerido e aplicar é no-op', () => {
    const fullSlots = CANONICAL_CATALOG.slice(0, 6).map(createDefaultExerciseSlot);
    const { draft, dayId } = seedDraftWithSlots(fullSlots, 30);
    const preview = buildWorkoutSuggestionPreview(baseInput({
      targetMinutes: 30,
      existingSlots: draft.days[0].slots,
    }));
    expect(preview.alreadyFits).toBe(true);
    expect(preview.additions).toHaveLength(0);
    expect(preview.warnings.map((warning) => warning.code)).toContain('already-fits');
    // Aplicar um preview vazio devolve o MESMO draft (nenhuma mutação).
    expect(applySuggestionToDay(draft, dayId, preview)).toBe(draft);
  });

  it('33 — retorno aos treinos reduz o teto de exercícios', () => {
    const active = buildWorkoutSuggestionPreview(baseInput({ returnToTraining: null }));
    const returning = buildWorkoutSuggestionPreview(baseInput({
      returnToTraining: { breakDuration: 'more_than_1_year' },
    }));
    expect(active.ceilingExercises).toBe(7); // Padrão/60 min → máx 7
    expect(returning.ceilingExercises).toBeLessThan(active.ceilingExercises);
    expect(returning.additions.length).toBeLessThanOrEqual(returning.ceilingExercises);
    expect(returning.rationale.join(' ')).toContain('teto reduzido');
  });

  it('34 — avisos honestos: sem foco, classificação legada e restrições/equipamento não verificados', () => {
    // Sem foco → nada sugerido + aviso.
    const noFocus = buildWorkoutSuggestionPreview(baseInput({ focusIds: [] }));
    expect(noFocus.additions).toHaveLength(0);
    expect(noFocus.warnings.map((warning) => warning.code)).toContain('no-focus');

    // Catálogo legado (sem classificação canônica nem equipamento mapeável) →
    // aviso de classificação legada e de equipamento não confirmado.
    const legacyCatalog = [
      makeExercise({ id: 'legacy_back_1', primary: 'back', legacy: true, equipment: 'aparelho-sem-mapa' }),
      makeExercise({ id: 'legacy_back_2', primary: 'back', legacy: true, equipment: 'aparelho-sem-mapa' }),
    ];
    const legacy = buildWorkoutSuggestionPreview(baseInput({
      focusIds: ['back'],
      catalog: legacyCatalog,
      restrictions: ['dor no ombro'],
      availableEquipment: ['dumbbells'],
    }));
    expect(legacy.additions.length).toBeGreaterThan(0);
    const codes = legacy.warnings.map((warning) => warning.code);
    expect(codes).toContain('legacy-classification');
    expect(codes).toContain('restrictions-unverified');
    expect(codes).toContain('equipment-unverified');
  });

  it('35 — distribuição multi-foco: peso aditivo com foco principal e tamanho do grupo', () => {
    const preview = buildWorkoutSuggestionPreview(baseInput({ focusIds: ['back', 'biceps'] }));
    const back = preview.distribution.find((entry) => entry.muscleGroupId === 'back')!;
    const biceps = preview.distribution.find((entry) => entry.muscleGroupId === 'biceps')!;
    // base 1 + tamanho (grande 2 / pequeno 1) + foco principal (costas = primeiro foco) 1.
    expect(back.weight).toBe(4);
    expect(biceps.weight).toBe(2);
    // Não é proporção fixa: costas (grande + principal) recebe mais que bíceps, e ambos > 0.
    expect(back.added).toBeGreaterThan(biceps.added);
    expect(biceps.added).toBeGreaterThanOrEqual(1);
    expect(back.added + biceps.added).toBe(preview.additions.length);
  });

  it('36 — ranking: compostos antes de isolados na ordem final', () => {
    const preview = buildWorkoutSuggestionPreview(baseInput({
      focusIds: ['chest'],
      targetMinutes: 90,
      volumeProfile: 'high',
      catalog: [
        makeExercise({ id: 'chest_iso_1', primary: 'chest', kind: 'isolation' }),
        makeExercise({ id: 'chest_comp_1', primary: 'chest', kind: 'compound' }),
        makeExercise({ id: 'chest_iso_2', primary: 'chest', kind: 'isolation' }),
        makeExercise({ id: 'chest_comp_2', primary: 'chest', kind: 'compound' }),
      ],
    }));
    const mechanics = preview.additions.map((addition) => addition.mechanics);
    expect(mechanics).toContain('compound');
    expect(mechanics).toContain('isolation');
    const lastCompound = mechanics.lastIndexOf('compound');
    const firstIsolation = mechanics.indexOf('isolation');
    expect(lastCompound).toBeLessThan(firstIsolation);
  });

  it('37 — os slots gerados usam os mesmos defaults de handleAddExercise', () => {
    const compound = makeExercise({ id: 'comp', primary: 'back', kind: 'compound' });
    const isolation = makeExercise({ id: 'iso', primary: 'biceps', kind: 'isolation' });
    expect(createDefaultExerciseSlot(compound)).toEqual({
      exerciseId: 'comp',
      series: 3,
      repRange: [8, 10],
      targetRPE: 8,
      restSec: 120,
      progression: 'dupla',
      incrementKg: 2.5,
    });
    expect(createDefaultExerciseSlot(isolation)).toEqual({
      exerciseId: 'iso',
      series: 3,
      repRange: [10, 15],
      targetRPE: 8,
      restSec: 75,
      progression: 'dupla',
      incrementKg: 1,
    });
    // O preview reusa exatamente a mesma função.
    const preview = buildWorkoutSuggestionPreview(baseInput({ focusIds: ['back'] }));
    for (const addition of preview.additions) {
      expect(addition.slot).toEqual(createDefaultExerciseSlot(addition.exercise));
    }
  });

  it('38 — catálogo real: Costas + Bíceps / 60 / Padrão gera sugestão determinística e aplicável', () => {
    const input = baseInput({
      focusIds: ['back', 'biceps'],
      level: 'intermediate',
      catalog: MOCK_EXERCISES,
    });
    const preview = buildWorkoutSuggestionPreview(input);
    expect(preview.additions.length).toBeGreaterThan(0);
    // Determinístico também sobre o catálogo real.
    expect(buildWorkoutSuggestionPreview(input)).toEqual(preview);
    // Toda adição existe no catálogo real e nenhuma se repete.
    const catalogIds = new Set(MOCK_EXERCISES.map((exercise) => exercise.id));
    const ids = preview.additions.map((addition) => addition.exercise.id);
    expect(ids.every((id) => catalogIds.has(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    // Costas (grande + foco principal) pesa mais que bíceps.
    const back = preview.distribution.find((entry) => entry.muscleGroupId === 'back')!;
    const biceps = preview.distribution.find((entry) => entry.muscleGroupId === 'biceps')!;
    expect(back.weight).toBeGreaterThan(biceps.weight);
    // O catálogo real é legado → aviso honesto de classificação.
    expect(preview.warnings.map((warning) => warning.code)).toContain('legacy-classification');

    const { draft, dayId } = seedDraftWithSlots([]);
    const applied = applySuggestionToDay(draft, dayId, preview);
    expect(applied.days[0].slots).toHaveLength(preview.additions.length);
  });
});
