import { describe, expect, it } from 'vitest';
import type {
  PersistedState,
  StorageLike,
} from './storage-types';
import type {
  UserProfile,
  WorkoutProgram,
  WorkoutSession,
} from '../types';
import {
  TRAINING_BREAK_DURATION_DEFINITIONS,
  TRAINING_EXPERIENCE_DEFINITIONS,
  TRAINING_STATUS_DEFINITIONS,
  getTrainingBreakDurationDefinition,
  getTrainingExperienceDefinition,
  getTrainingProfileDisplayName,
  getTrainingStatusDefinition,
  isReturningToTraining,
  isValidCivilDate,
  normalizeTrainingProfile,
  resolveTrainingProfile,
  validateReturnToTrainingProfile,
  validateTrainingProfile,
} from './training-profile';
import { CURRENT_STORAGE_VERSION, loadStateResult, saveStateResult } from './storage';
import { commitStorageImport, createStorageExport, inspectStorageImport } from './storage-export';

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const KEY = 'gymflow:state:v1';

const legacyProfile: UserProfile = {
  name: 'Pessoa de teste',
  email: 'anonimo@example.invalid',
  level: 'intermediate',
  goal: 'hypertrophy',
  gender: 'neutral',
  age: 30,
  weight: 75,
  height: 175,
  frequency: 4,
  duration: 60,
  location: 'gym',
  equipments: ['Halteres'],
  restrictions: [],
  muscleFocus: ['Peito'],
  preference: 'Treino consistente',
  xp: 0,
  streak: 0,
  waterIntake: 0,
  waterGoal: 2500,
  premiumStatus: 'free',
  points: 0,
};

const returningProfile: UserProfile = {
  ...legacyProfile,
  level: 'intermediate',
  frequency: 5,
  duration: 75,
  trainingStatus: 'returning',
  trainingExperienceYears: 7,
  returnToTraining: {
    previousLevel: 'advanced',
    breakDuration: 'three_to_six_months',
    resumedAt: '2026-07-01',
    notes: 'Retomando a rotina de forma gradual.',
  },
};

describe('níveis de experiência', () => {
  it('preserva os quatro IDs, labels e ordem canônica', () => {
    expect(TRAINING_EXPERIENCE_DEFINITIONS.map((item) => item.id)).toEqual([
      'beginner', 'intermediate', 'advanced', 'athlete',
    ]);
    expect(TRAINING_EXPERIENCE_DEFINITIONS.map((item) => item.label)).toEqual([
      'Iniciante', 'Intermediário', 'Avançado', 'Atleta / Alta performance',
    ]);
    expect(TRAINING_EXPERIENCE_DEFINITIONS.map((item) => item.order)).toEqual([10, 20, 30, 40]);
  });

  it.each(['beginner', 'intermediate', 'advanced', 'athlete'] as const)('faz lookup de %s', (level) => {
    expect(getTrainingExperienceDefinition(level)?.id).toBe(level);
  });

  it('não aceita nível inventado nem Personal Trainer', () => {
    expect(getTrainingExperienceDefinition('professional')).toBeUndefined();
    expect(getTrainingExperienceDefinition('personal_trainer')).toBeUndefined();
    expect(TRAINING_EXPERIENCE_DEFINITIONS.some((item) => item.label.includes('Personal Trainer'))).toBe(false);
  });
});

describe('continuidade e labels compostos', () => {
  it('define somente active e returning', () => {
    expect(TRAINING_STATUS_DEFINITIONS.map((item) => item.id)).toEqual(['active', 'returning']);
    expect(getTrainingStatusDefinition('active')?.label).toBe('Treinando normalmente');
    expect(getTrainingStatusDefinition('returning')?.label).toBe('Voltando após uma pausa');
    expect(getTrainingStatusDefinition('detrained')).toBeUndefined();
  });

  it('perfil legado sem status resolve como active', () => {
    const resolved = resolveTrainingProfile(legacyProfile);
    expect(resolved.trainingStatus).toBe('active');
    expect(isReturningToTraining(legacyProfile)).toBe(false);
  });

  it.each([
    ['beginner', 'active', 'Iniciante'],
    ['intermediate', 'active', 'Intermediário'],
    ['intermediate', 'returning', 'Intermediário em retorno'],
    ['advanced', 'returning', 'Avançado em retorno'],
    ['athlete', 'returning', 'Atleta em retorno'],
  ] as const)('%s + %s produz %s', (level, trainingStatus, expected) => {
    expect(getTrainingProfileDisplayName({ experienceLevel: level, trainingStatus })).toBe(expected);
  });
});

describe('perfil de retorno e datas civis', () => {
  it('define todas as cinco faixas de pausa', () => {
    expect(TRAINING_BREAK_DURATION_DEFINITIONS.map((item) => item.id)).toEqual([
      'less_than_1_month',
      'one_to_three_months',
      'three_to_six_months',
      'six_to_twelve_months',
      'more_than_1_year',
    ]);
    for (const definition of TRAINING_BREAK_DURATION_DEFINITIONS) {
      expect(getTrainingBreakDurationDefinition(definition.id)?.label).toBeTruthy();
    }
  });

  it('valida data civil sem conversão de timezone', () => {
    expect(isValidCivilDate('2024-02-29')).toBe(true);
    expect(isValidCivilDate('2025-02-29')).toBe(false);
    expect(isValidCivilDate('2026-07-01')).toBe(true);
    expect(isValidCivilDate('01/07/2026')).toBe(false);
    expect(isValidCivilDate('2026-13-01')).toBe(false);
  });

  it('aceita data presente/passada e rejeita data futura', () => {
    expect(validateReturnToTrainingProfile({ resumedAt: '2026-07-16' }, '2026-07-16').valid).toBe(true);
    expect(validateReturnToTrainingProfile({ resumedAt: '2026-07-17' }, '2026-07-16')).toMatchObject({
      valid: false,
      errors: [{ code: 'future-resumed-at' }],
    });
  });

  it('aceita retorno sem data, previousLevel e notes opcionais', () => {
    expect(validateReturnToTrainingProfile({ breakDuration: 'three_to_six_months' }, '2026-07-16').valid).toBe(true);
    expect(validateReturnToTrainingProfile({}, '2026-07-16').valid).toBe(true);
    expect(validateReturnToTrainingProfile(undefined, '2026-07-16').valid).toBe(true);
  });

  it('rejeita faixa, nível anterior e notas inválidos sem lançar erro', () => {
    expect(validateReturnToTrainingProfile({ breakDuration: 'some_months' }, '2026-07-16').valid).toBe(false);
    expect(validateReturnToTrainingProfile({ previousLevel: 'professional' }, '2026-07-16').valid).toBe(false);
    expect(validateReturnToTrainingProfile({ notes: 'x'.repeat(501) }, '2026-07-16').valid).toBe(false);
  });
});

describe('validação compatível e não destrutiva', () => {
  it('aceita returning sem data ou objeto de retorno', () => {
    expect(validateTrainingProfile({ level: 'advanced', trainingStatus: 'returning' }, '2026-07-16').valid).toBe(true);
  });

  it('aceita active sem retorno e active com histórico de retorno preservado', () => {
    expect(validateTrainingProfile({ level: 'beginner', trainingStatus: 'active' }, '2026-07-16').valid).toBe(true);
    expect(validateTrainingProfile({
      level: 'intermediate',
      trainingStatus: 'active',
      returnToTraining: returningProfile.returnToTraining,
    }, '2026-07-16').valid).toBe(true);
  });

  it('rejeita nível/status desconhecidos e anos fora da faixa', () => {
    expect(validateTrainingProfile({ level: 'professional' }, '2026-07-16').valid).toBe(false);
    expect(validateTrainingProfile({ level: 'athlete', trainingStatus: 'paused' }, '2026-07-16').valid).toBe(false);
    expect(validateTrainingProfile({ level: 'intermediate', trainingExperienceYears: -1 }, '2026-07-16').valid).toBe(false);
    expect(validateTrainingProfile({ level: 'intermediate', trainingExperienceYears: 81 }, '2026-07-16').valid).toBe(false);
    expect(validateTrainingProfile({ level: 'intermediate', trainingExperienceYears: 7.5 }, '2026-07-16').valid).toBe(true);
  });

  it('ignora campos desconhecidos sem quebrar ou alterar a entrada', () => {
    const input = { ...legacyProfile, futureOptionalField: { enabled: true } };
    const before = JSON.stringify(input);
    expect(validateTrainingProfile(input, '2026-07-16').valid).toBe(true);
    expect(normalizeTrainingProfile(input).trainingStatus).toBe('active');
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('caso real anonimizado', () => {
  it('mantém intermediário em retorno sem prescrição automática', () => {
    const before = JSON.stringify(returningProfile);
    const resolved = resolveTrainingProfile(returningProfile);
    expect(resolved).toMatchObject({
      experienceLevel: 'intermediate',
      trainingStatus: 'returning',
      displayName: 'Intermediário em retorno',
      goal: 'hypertrophy',
      frequency: 5,
      sessionDuration: 75,
      trainingExperienceYears: 7,
    });
    expect(resolved.experienceLevel).not.toBe('beginner');
    expect(resolved).not.toHaveProperty('sets');
    expect(resolved).not.toHaveProperty('repetitions');
    expect(resolved).not.toHaveProperty('volumeAdjustment');
    expect(JSON.stringify(returningProfile)).toBe(before);
  });
});

describe('persistência e export/import v1', () => {
  const customProgram: WorkoutProgram = {
    id: 'custom_unchanged',
    name: 'Programa existente',
    durationWeeks: 4,
    frequencyDays: 5,
    level: 'intermediate',
    objective: 'Hipertrofia',
    exercises: [],
    description: 'Sentinela de compatibilidade',
    repeatWeeks: true,
    weeks: [],
    isCustom: true,
  };
  const activeWorkout: WorkoutSession = {
    id: 'active_unchanged',
    name: 'Treino ativo existente',
    date: '2026-07-16',
    duration: 120,
    calories: 20,
    exercises: [],
    xpEarned: 0,
  };
  const historyWorkout: WorkoutSession = { ...activeWorkout, id: 'history_unchanged', name: 'Histórico existente' };
  const state: PersistedState = {
    user: returningProfile,
    weeklyPlan: [],
    customPrograms: [customProgram],
    activeWorkout,
    activeWorkoutStartedAt: 1_752_668_800_000,
    restTimerEndAt: null,
    restTimerTotalSeconds: null,
    restTimerLabel: null,
    workoutHistory: [historyWorkout],
    weightHistory: [],
    measurementsHistory: [],
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
    achievements: [],
    challenges: [],
    favoriteExercises: [],
    recentlyViewedVideoIds: [],
  };

  it('faz roundtrip sem mudar envelope, arrays, programas, treino ativo ou histórico', () => {
    const storage = new MemoryStorage();
    const write = saveStateResult(KEY, state, storage);
    expect(write.ok).toBe(true);
    if (write.ok) expect(write.envelope.v).toBe(CURRENT_STORAGE_VERSION);

    const loaded = loadStateResult<PersistedState>(KEY, storage);
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') return;
    expect(loaded.envelope.v).toBe(1);
    expect(loaded.value.user).toMatchObject({
      level: 'intermediate',
      trainingStatus: 'returning',
      trainingExperienceYears: 7,
      returnToTraining: { breakDuration: 'three_to_six_months', resumedAt: '2026-07-01' },
    });
    expect(loaded.value.user?.equipments).toEqual(returningProfile.equipments);
    expect(loaded.value.user?.restrictions).toEqual(returningProfile.restrictions);
    expect(loaded.value.customPrograms).toEqual([customProgram]);
    expect(loaded.value.activeWorkout).toEqual(activeWorkout);
    expect(loaded.value.workoutHistory).toEqual([historyWorkout]);
  });

  it('exporta e importa os campos novos sem mudar o restante do estado', () => {
    const source = new MemoryStorage();
    expect(saveStateResult(KEY, state, source).ok).toBe(true);
    const exported = createStorageExport(KEY, source, new Date('2026-07-16T15:00:00.000Z'));
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.backup.envelope.v).toBe(1);

    const inspection = inspectStorageImport(exported.content, exported.bytes);
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) return;
    const target = new MemoryStorage();
    expect(commitStorageImport(KEY, inspection.backup, target).ok).toBe(true);
    const imported = loadStateResult<PersistedState>(KEY, target);
    expect(imported.status).toBe('ok');
    if (imported.status !== 'ok') return;
    expect(imported.value.user?.trainingStatus).toBe('returning');
    expect(imported.value.user?.returnToTraining).toEqual(returningProfile.returnToTraining);
    expect(imported.value.customPrograms).toEqual([customProgram]);
    expect(imported.value.activeWorkout).toEqual(activeWorkout);
    expect(imported.value.workoutHistory).toEqual([historyWorkout]);
  });
});
