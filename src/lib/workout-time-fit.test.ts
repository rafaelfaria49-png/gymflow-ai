import { describe, expect, it } from 'vitest';
import { MOCK_EXERCISES } from '../mock/exercises';
import type { ExerciseSlot, WorkoutProgram } from '../types';
import { isDraftDirty, serializeDraftSignature, updateDayInDraft } from './workout-builder';
import { normalizeWorkoutProgramForBuilder } from './workout-program-normalization';
import {
  analyzeVolumeProfileFit,
  analyzeWorkoutTimeFit,
  estimateRecommendedExerciseRange,
  resolveRecommendedVolumeProfile,
} from './workout-time-fit';
import {
  buildDurationWarning,
  estimateWorkoutDurationDetailed,
} from './workoutDuration';
import { defaultTargetMinutes } from './volumeProfiles';

const slot = (overrides: Partial<ExerciseSlot> = {}): ExerciseSlot => ({
  exerciseId: MOCK_EXERCISES[0].id,
  series: 3,
  repRange: [8, 12],
  targetRPE: 8,
  restSec: 60,
  progression: 'dupla',
  incrementKg: 2.5,
  ...overrides,
});

describe('workout time-fit — PART15', () => {
  it('1 — recomenda Compacto e 3–4 exercícios para 30 min', () => {
    expect(resolveRecommendedVolumeProfile(30)).toMatchObject({
      profile: 'compact',
      reason: 'below-all-ranges',
    });
    expect(estimateRecommendedExerciseRange(30)).toMatchObject({
      minimumExercises: 3,
      maximumExercises: 4,
    });
  });

  it('2 — mantém a faixa formal do Compacto em 45 min', () => {
    expect(resolveRecommendedVolumeProfile(45).profile).toBe('compact');
    expect(estimateRecommendedExerciseRange(45)).toMatchObject({
      minimumExercises: 4,
      maximumExercises: 5,
    });
  });

  it('3 — recomenda Padrão, 50–65 min e 5–7 exercícios para 60 min', () => {
    expect(resolveRecommendedVolumeProfile(60)).toMatchObject({
      profile: 'standard',
      profileRange: { minimumMinutes: 50, maximumMinutes: 65 },
    });
    expect(estimateRecommendedExerciseRange(60)).toMatchObject({
      minimumExercises: 5,
      maximumExercises: 7,
    });
  });

  it('4 — recomenda Alto Volume, 70–90 min e 7–9 exercícios para 75 min', () => {
    expect(resolveRecommendedVolumeProfile(75)).toMatchObject({
      profile: 'high',
      profileRange: { minimumMinutes: 70, maximumMinutes: 90 },
    });
    expect(estimateRecommendedExerciseRange(75)).toMatchObject({
      minimumExercises: 7,
      maximumExercises: 9,
    });
  });

  it('5 — explica perfil Alto Volume divergente em 60 min', () => {
    const result = analyzeVolumeProfileFit(60, 'high');
    expect(result).toMatchObject({
      recommendedProfile: 'standard',
      status: 'below-profile-range',
      divergent: true,
      distanceToSelectedRange: 10,
    });
    expect(result.message).toContain('Alto Volume');
    expect(result.message).toContain('70–90');
    expect(result.message).toContain('60');
    expect(result.message).toContain('Padrão');
  });

  it('6 — considera Padrão alinhado em 60 min', () => {
    expect(analyzeVolumeProfileFit(60, 'standard')).toMatchObject({
      status: 'aligned',
      divergent: false,
      message: null,
    });
  });

  it('7 — trata 47 min como zona próxima do Compacto sem aviso', () => {
    expect(analyzeVolumeProfileFit(47, 'compact')).toMatchObject({
      recommendedProfile: 'compact',
      status: 'near-range',
      divergent: false,
      message: null,
    });
  });

  it('8 — identifica treino 45 min abaixo e sugere adicionar 3–5 exercícios', () => {
    const result = analyzeWorkoutTimeFit({ targetMinutes: 60, estimatedMinutes: 15, exerciseCount: 2 });
    expect(result).toMatchObject({
      operationalRange: { minimumMinutes: 55, maximumMinutes: 65 },
      status: 'under-target',
      differenceMinutes: -45,
      absoluteDifferenceMinutes: 45,
      recommendedExerciseRange: { minimumExercises: 5, maximumExercises: 7 },
    });
    expect(result.suggestion).toContain('Adicione de 3 a 5 exercícios');
  });

  it('9 — identifica treino dentro da faixa operacional', () => {
    expect(analyzeWorkoutTimeFit({ targetMinutes: 60, estimatedMinutes: 60, exerciseCount: 6 })).toMatchObject({
      status: 'within-target',
      direction: 'within',
      differenceMinutes: 0,
      operationalRange: { minimumMinutes: 55, maximumMinutes: 65 },
      suggestion: null,
    });
  });

  it('10 — preserva o warning legado acima do alvo exato dentro da tolerância', () => {
    const result = analyzeWorkoutTimeFit({ targetMinutes: 60, estimatedMinutes: 63, exerciseCount: 6 });
    expect(result).toMatchObject({ status: 'within-target', legacyOverExactTarget: true });
    expect(buildDurationWarning(63, 60)).toBe(
      'Este treino pode passar de 60 min (estimativa: 63 min). Reduza séries ou escolha o modo Alto Volume.',
    );
  });

  it('11 — identifica treino 20 min acima e sugere redução ou ajuste', () => {
    const result = analyzeWorkoutTimeFit({ targetMinutes: 60, estimatedMinutes: 80, exerciseCount: 8 });
    expect(result).toMatchObject({
      status: 'over-target',
      differenceMinutes: 20,
      absoluteDifferenceMinutes: 20,
    });
    expect(result.suggestion).toMatch(/Reduza.*exercícios.*ajuste/);
  });

  it('12 — não fabrica diferença para dia vazio', () => {
    expect(analyzeWorkoutTimeFit({ targetMinutes: 60, estimatedMinutes: 0, exerciseCount: 0 })).toMatchObject({
      status: 'empty',
      differenceMinutes: null,
      absoluteDifferenceMinutes: null,
      message: null,
      suggestion: 'Adicione exercícios para comparar o treino com o tempo disponível.',
    });
  });

  it('13 — mantém 17 min, recomenda 2–3 exercícios e faixa 12–22', () => {
    expect(resolveRecommendedVolumeProfile(17)).toMatchObject({ targetMinutes: 17, profile: 'compact' });
    expect(estimateRecommendedExerciseRange(17)).toMatchObject({
      minimumExercises: 2,
      maximumExercises: 3,
    });
    expect(analyzeWorkoutTimeFit({ targetMinutes: 17, estimatedMinutes: 15, exerciseCount: 2 }))
      .toMatchObject({ operationalRange: { minimumMinutes: 12, maximumMinutes: 22 } });
  });

  it('14 — limita o alvo inferior em 10 min', () => {
    expect(resolveRecommendedVolumeProfile(1)).toMatchObject({ targetMinutes: 10, profile: 'compact' });
    expect(estimateRecommendedExerciseRange(1)).toMatchObject({
      minimumExercises: 1,
      maximumExercises: 2,
    });
    expect(analyzeWorkoutTimeFit({ targetMinutes: 1, estimatedMinutes: 10, exerciseCount: 1 }))
      .toMatchObject({ operationalRange: { minimumMinutes: 10, maximumMinutes: 15 } });
  });

  it('15 — limita o alvo superior em 240 min e exercícios em 12', () => {
    expect(resolveRecommendedVolumeProfile(999)).toMatchObject({
      targetMinutes: 240,
      profile: 'high',
      reason: 'above-all-ranges',
    });
    const range = estimateRecommendedExerciseRange(999);
    expect(range.minimumExercises).toBeLessThanOrEqual(range.maximumExercises);
    expect(range.maximumExercises).toBeLessThanOrEqual(12);
    expect(analyzeWorkoutTimeFit({ targetMinutes: 999, estimatedMinutes: 240, exerciseCount: 12 }))
      .toMatchObject({ operationalRange: { minimumMinutes: 235, maximumMinutes: 240 } });
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    '16 — usa fallback Padrão para entrada inválida %s',
    (value) => {
      const result = resolveRecommendedVolumeProfile(value);
      expect(result).toMatchObject({
        targetMinutes: defaultTargetMinutes('standard'),
        profile: 'standard',
        reason: 'fallback-invalid',
      });
      expect(result.assumptions.length).toBeGreaterThan(0);
    },
  );
});

describe('ajustes fora das faixas formais', () => {
  it.each([
    [34, 3, 4],
    [20, 2, 3],
  ] as const)('%i min → %i–%i exercícios', (targetMinutes, minimumExercises, maximumExercises) => {
    expect(estimateRecommendedExerciseRange(targetMinutes)).toMatchObject({
      minimumExercises,
      maximumExercises,
      reason: 'below-compact-adjustment',
    });
  });
});

describe('zonas entre perfis', () => {
  it.each([
    [35, 'compact'],
    [45, 'compact'],
    [46, 'compact'],
    [47, 'compact'],
    [48, 'standard'],
    [49, 'standard'],
    [50, 'standard'],
    [65, 'standard'],
    [66, 'standard'],
    [67, 'standard'],
    [68, 'high'],
    [69, 'high'],
    [70, 'high'],
    [90, 'high'],
  ] as const)('%i min → %s', (targetMinutes, profile) => {
    expect(resolveRecommendedVolumeProfile(targetMinutes).profile).toBe(profile);
  });
});

describe('estimativa detalhada e pureza', () => {
  it('aumentar descanso aumenta a estimativa detalhada', () => {
    const shorter = estimateWorkoutDurationDetailed([slot({ restSec: 30 })], MOCK_EXERCISES);
    const longer = estimateWorkoutDurationDetailed([slot({ restSec: 180 })], MOCK_EXERCISES);
    expect(longer.totalMinutes).toBeGreaterThan(shorter.totalMinutes);
  });

  it('aumentar séries aumenta a estimativa detalhada', () => {
    const shorter = estimateWorkoutDurationDetailed([slot({ series: 2 })], MOCK_EXERCISES);
    const longer = estimateWorkoutDurationDetailed([slot({ series: 8 })], MOCK_EXERCISES);
    expect(longer.totalMinutes).toBeGreaterThan(shorter.totalMinutes);
  });

  it('muda o estado somente quando a estimativa recebida muda e não toca nos slots', () => {
    const slots = [slot(), slot()];
    const before = structuredClone(slots);
    expect(analyzeWorkoutTimeFit({ targetMinutes: 60, estimatedMinutes: 15, exerciseCount: 2 }).status)
      .toBe('under-target');
    expect(analyzeWorkoutTimeFit({ targetMinutes: 60, estimatedMinutes: 60, exerciseCount: 2 }).status)
      .toBe('within-target');
    expect(analyzeWorkoutTimeFit({ targetMinutes: 60, estimatedMinutes: 80, exerciseCount: 2 }).status)
      .toBe('over-target');
    expect(slots).toEqual(before);
  });
});

describe('compatibilidade e abertura', () => {
  it('buildDurationWarning retorna null para entradas inválidas', () => {
    expect(buildDurationWarning(Number.NaN, 60)).toBeNull();
    expect(buildDurationWarning(61, Number.POSITIVE_INFINITY)).toBeNull();
    expect(buildDurationWarning(61, 0)).toBeNull();
  });

  it('a assinatura salva após normalizar mantém programa existente limpo', () => {
    const program: WorkoutProgram = {
      id: 'custom-existing',
      name: 'Programa existente',
      durationWeeks: 0,
      frequencyDays: 1,
      level: 'intermediate',
      objective: 'Hipertrofia',
      exercises: [],
      description: 'Programa de teste',
      repeatWeeks: true,
      weeks: [{
        number: 1,
        days: [{
          id: 'existing-day',
          name: 'Costas e Bíceps',
          slots: [slot()],
          volumeProfile: 'standard',
        }],
      }],
      isCustom: true,
    };
    const normalized = normalizeWorkoutProgramForBuilder(program, { fallbackTargetMinutes: 60 });
    const savedSignature = serializeDraftSignature(normalized);
    expect(normalized.days[0].targetMinutes).toBe(60);
    expect(isDraftDirty(normalized, savedSignature)).toBe(false);
  });

  it('mudar tempo e perfil preserva os slots do dia', () => {
    const program: WorkoutProgram = {
      id: 'custom-slots-invariant',
      name: 'Programa existente',
      durationWeeks: 0,
      frequencyDays: 1,
      level: 'intermediate',
      objective: 'Hipertrofia',
      exercises: [],
      description: 'Programa de teste',
      repeatWeeks: true,
      weeks: [{
        number: 1,
        days: [{
          id: 'invariant-day',
          name: 'Costas',
          slots: [slot()],
          volumeProfile: 'standard',
          targetMinutes: 60,
        }],
      }],
      isCustom: true,
    };
    const draft = normalizeWorkoutProgramForBuilder(program, { fallbackTargetMinutes: 60 });
    const originalSlots = draft.days[0].slots;
    const withTime = updateDayInDraft(draft, 'invariant-day', { targetMinutes: 75 });
    const withProfile = updateDayInDraft(withTime, 'invariant-day', { volumeProfile: 'high' });

    expect(withTime.days[0].slots).toBe(originalSlots);
    expect(withProfile.days[0].slots).toBe(originalSlots);
    expect(withProfile.days[0].slots).toEqual(draft.days[0].slots);
  });
});
