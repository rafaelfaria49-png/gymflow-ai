import { describe, expect, it } from 'vitest';
import type {
  Achievement,
  Challenge,
  UserProfile,
  WeeklyWorkoutDay,
  WorkoutSession,
} from '../types';
import {
  COMPLETION_POST_AVATAR,
  COMPLETION_POST_FALLBACK_AUTHOR,
  COMPLETION_POST_TIME_LABEL,
  type WorkoutCompletionInput,
  completionPostContent,
  createWorkoutCompletionReceipt,
  deriveWorkoutCompletion,
  isWorkoutCompletionReceipt,
  verifyWorkoutCompletionReceipt,
} from './storage-completion-receipt';
import { digestWorkoutSession } from './storage-history-integrity';
import type { PersistedCoreState, PersistedState } from './storage-types';

const TODAY = '2026-07-23';

function makeSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  const startedAt = 1_784_000_000_000;
  return {
    id: 'session-final',
    name: 'Treino A — Peito',
    date: new Date(startedAt).toISOString(),
    duration: 3_600,
    calories: 420,
    xpEarned: 180,
    totalVolume: 6_000,
    prsDetected: [],
    status: 'completed',
    startedAt,
    endedAt: startedAt + 3_600_000,
    exercises: [{
      id: 'entry-1',
      exerciseId: 'chest_supino_reto',
      name: 'Supino reto',
      muscleGroup: 'chest',
      notes: '',
      sets: [{ id: 'set-1', reps: 10, weight: 60, completed: true }],
    }],
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Rafael Silveira (Demo)',
    email: 'rafael.demo@gymflow.ai',
    level: 'intermediate',
    goal: 'hypertrophy',
    gender: 'male',
    age: 28,
    weight: 80.5,
    height: 178,
    frequency: 4,
    duration: 60,
    location: 'gym',
    equipments: [],
    restrictions: [],
    muscleFocus: [],
    preference: '',
    xp: 900,
    streak: 5,
    waterIntake: 0,
    waterGoal: 3000,
    premiumStatus: 'pro',
    points: 900,
    weeklyPlan: [],
    connectedSocials: [],
    ...overrides,
  };
}

function makeWeeklyPlan(): WeeklyWorkoutDay[] {
  return [
    { dayName: 'Segunda', workoutName: 'Treino A', muscleGroups: [], duration: 60, exerciseCount: 5, isRest: false, trained: false },
    { dayName: 'Terça', workoutName: 'Descanso', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true, trained: false },
  ];
}

function makeAchievements(): Achievement[] {
  return [
    { id: 'ach_1', name: 'Primeiro Treino', description: '', icon: '🏅', unlocked: false },
    { id: 'ach_2', name: 'Supino 100kg', description: '', icon: '💪', unlocked: false },
    { id: 'ach_18', name: 'Volume 10t', description: '', icon: '🏋️', unlocked: false },
    { id: 'ach_20', name: 'Elite', description: '', icon: '👑', unlocked: true, unlockedAt: '2026-01-01' },
  ];
}

function makeChallenges(): Challenge[] {
  return [
    { id: 'chal_1', name: '7 dias', durationDays: 7, xpReward: 100, description: '', progress: 10, completed: false, type: '7-days' },
    { id: 'chal_4', name: 'Calorias', durationDays: 30, xpReward: 300, description: '', progress: 0, completed: false, type: '30-days' },
    { id: 'chal_5', name: 'Volume', durationDays: 30, xpReward: 300, description: '', progress: 0, completed: false, type: '30-days' },
    { id: 'chal_9', name: 'Intocado', durationDays: 14, xpReward: 200, description: '', progress: 42, completed: false, type: '14-days' },
  ];
}

function makeState(overrides: Partial<PersistedState> = {}): PersistedState {
  const weeklyPlan = makeWeeklyPlan();
  return {
    user: makeUser({ weeklyPlan }),
    weeklyPlan,
    customPrograms: [],
    activeWorkout: makeSession({ status: 'active', endedAt: undefined }),
    activeWorkoutStartedAt: 1_784_000_000_000,
    restTimerEndAt: 1_784_000_100_000,
    restTimerTotalSeconds: 90,
    restTimerLabel: 'Supino reto',
    workoutHistory: [],
    weightHistory: [{ date: '2026-05-01', value: 82.5 }],
    measurementsHistory: [],
    nutrition: { calories: 100, protein: 10, carbs: 10, fat: 5, water: 500 },
    achievements: makeAchievements(),
    challenges: makeChallenges(),
    favoriteExercises: ['chest_supino_reto'],
    recentlyViewedVideoIds: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<WorkoutCompletionInput> = {}): WorkoutCompletionInput {
  return {
    state: makeState(),
    finalSession: makeSession(),
    finalXp: 150,
    caloriesBurned: 420,
    totalVolume: 6_000,
    minutes: 60,
    prsDetected: [],
    prAchievementIds: [],
    todayDayName: 'Segunda',
    todayIso: TODAY,
    postId: 'post_1784000000000',
    postAuthorName: 'Rafael Silveira (Demo)',
    postImage: 'https://images.example/foto.jpg',
    ...overrides,
  };
}

function coreOf(state: PersistedState, generationId = 'generation-1'): PersistedCoreState {
  const { workoutHistory, ...core } = state;
  void workoutHistory;
  return {
    ...core,
    historyStorage: { backend: 'indexeddb', schemaVersion: 1, generationId },
  };
}

describe('helper puro de conclusão de treino', () => {
  it('não muta o estado recebido', () => {
    const state = makeState();
    const snapshot = JSON.stringify(state);
    deriveWorkoutCompletion(makeInput({ state }));
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('remove treino ativo, startedAt e timers do resultado', () => {
    const { state } = deriveWorkoutCompletion(makeInput());
    expect(state.activeWorkout).toBeNull();
    expect(state.activeWorkoutStartedAt).toBeNull();
    expect(state.restTimerEndAt).toBeNull();
    expect(state.restTimerTotalSeconds).toBeNull();
    expect(state.restTimerLabel).toBeNull();
  });

  it('atualiza XP e pontos somando treino, conquista e postagem', () => {
    // 150 (treino) + 150 (ach_1) + 25 (postagem) = 325.
    const { state } = deriveWorkoutCompletion(makeInput());
    expect(state.user?.xp).toBe(900 + 325);
    expect(state.user?.points).toBe(900 + 325);
  });

  it('emite notificação de level up antes da notificação de XP correspondente', () => {
    const { effects } = deriveWorkoutCompletion(makeInput({
      state: makeState({ user: makeUser({ xp: 900, points: 900 }) }),
      finalXp: 150,
    }));
    const levelUpIndex = effects.xpNotifications.findIndex((n) => n.kind === 'levelup');
    expect(levelUpIndex).toBe(0);
    expect(effects.xpNotifications[0].text).toContain('Nível 2');
    expect(effects.xpNotifications[1]).toMatchObject({
      kind: 'xp',
      text: 'Treino Concluído! +420 kcal gastas',
      xp: 150,
    });
  });

  it('incrementa streak apenas quando o dia ainda não foi registrado', () => {
    const novo = deriveWorkoutCompletion(makeInput());
    expect(novo.state.user?.streak).toBe(6);
    expect(novo.state.user?.lastWorkoutDate).toBe(TODAY);

    const mesmoDia = deriveWorkoutCompletion(makeInput({
      state: makeState({ user: makeUser({ lastWorkoutDate: TODAY }) }),
    }));
    expect(mesmoDia.state.user?.streak).toBe(5);
    expect(mesmoDia.state.user?.lastWorkoutDate).toBe(TODAY);
  });

  it('marca o dia treinado no weeklyPlan e sincroniza o plano do usuário', () => {
    const { state, effects } = deriveWorkoutCompletion(makeInput());
    expect(state.weeklyPlan.find((day) => day.dayName === 'Segunda')?.trained).toBe(true);
    expect(state.weeklyPlan.find((day) => day.dayName === 'Terça')?.trained).toBe(false);
    expect(state.user?.weeklyPlan).toBe(state.weeklyPlan);
    expect(effects.markedDayName).toBe('Segunda');
  });

  it('desbloqueia conquistas de PR, de primeiro treino e de volume sem repetir as já abertas', () => {
    const { state, effects } = deriveWorkoutCompletion(makeInput({
      prsDetected: ['Supino Reto 100kg'],
      prAchievementIds: ['ach_2'],
      totalVolume: 12_000,
    }));
    expect(effects.unlockedAchievementIds).toEqual(['ach_2', 'ach_1', 'ach_18']);
    const unlockedAt = state.achievements
      .filter((achievement) => effects.unlockedAchievementIds.includes(achievement.id))
      .map((achievement) => achievement.unlockedAt);
    expect(unlockedAt).toEqual([TODAY, TODAY, TODAY]);
    // ach_20 já estava aberta e não gera XP novo.
    expect(state.achievements.find((a) => a.id === 'ach_20')?.unlockedAt).toBe('2026-01-01');
    // 150 (treino) + 3 x 150 (conquistas) + 25 (postagem).
    expect(state.user?.xp).toBe(900 + 150 + 450 + 25);
  });

  it('não desbloqueia ach_18 abaixo de 10.000 kg de volume', () => {
    const { effects } = deriveWorkoutCompletion(makeInput({ totalVolume: 9_999 }));
    expect(effects.unlockedAchievementIds).toEqual(['ach_1']);
  });

  it('atualiza apenas os desafios chal_1, chal_4 e chal_5', () => {
    const { state } = deriveWorkoutCompletion(makeInput({
      caloriesBurned: 1_500,
      totalVolume: 5_000,
    }));
    expect(state.challenges.find((c) => c.id === 'chal_1')).toMatchObject({ progress: 25, completed: false });
    expect(state.challenges.find((c) => c.id === 'chal_4')).toMatchObject({ progress: 50, completed: false });
    expect(state.challenges.find((c) => c.id === 'chal_5')).toMatchObject({ progress: 100, completed: true });
    expect(state.challenges.find((c) => c.id === 'chal_9')).toMatchObject({ progress: 42, completed: false });
  });

  it('limita o progresso dos desafios a 100', () => {
    const { state } = deriveWorkoutCompletion(makeInput({
      caloriesBurned: 99_000,
      totalVolume: 99_000,
    }));
    for (const id of ['chal_1', 'chal_4', 'chal_5']) {
      expect(state.challenges.find((c) => c.id === id)?.progress).toBeLessThanOrEqual(100);
    }
  });

  it('monta a postagem determinística com id, autor e conteúdo estáveis', () => {
    const { effects } = deriveWorkoutCompletion(makeInput({
      prsDetected: ['Supino Reto 100kg'],
    }));
    expect(effects.communityPost).toMatchObject({
      id: 'post_1784000000000',
      authorName: 'Rafael Silveira (Demo)',
      authorAvatar: COMPLETION_POST_AVATAR,
      time: COMPLETION_POST_TIME_LABEL,
      image: 'https://images.example/foto.jpg',
      likes: 0,
      comments: [],
      userLiked: false,
      shares: 0,
    });
    expect(effects.communityPost.content).toBe(completionPostContent({
      sessionName: 'Treino A — Peito',
      minutes: 60,
      totalVolume: 6_000,
      prsDetected: ['Supino Reto 100kg'],
    }));
    expect(effects.communityPost.content).toContain('PRs Batidos: Supino Reto 100kg!');
  });

  it('usa o autor padrão quando o nome não é informado', () => {
    const { effects } = deriveWorkoutCompletion(makeInput({ postAuthorName: '' }));
    expect(effects.communityPost.authorName).toBe(COMPLETION_POST_FALLBACK_AUTHOR);
  });

  it('não credita XP nem notificações quando não há usuário', () => {
    const { state, effects } = deriveWorkoutCompletion(makeInput({
      state: makeState({ user: null }),
    }));
    expect(state.user).toBeNull();
    expect(effects.xpNotifications).toEqual([]);
    // A postagem continua sendo materializada.
    expect(effects.communityPost.id).toBe('post_1784000000000');
  });

  it('preserva os demais campos do estado', () => {
    const state = makeState();
    const outcome = deriveWorkoutCompletion(makeInput({ state }));
    expect(outcome.state.customPrograms).toBe(state.customPrograms);
    expect(outcome.state.nutrition).toBe(state.nutrition);
    expect(outcome.state.weightHistory).toBe(state.weightHistory);
    expect(outcome.state.favoriteExercises).toBe(state.favoriteExercises);
    expect(outcome.state.workoutHistory).toBe(state.workoutHistory);
  });

  it('é determinístico para a mesma entrada', () => {
    const first = deriveWorkoutCompletion(makeInput());
    const second = deriveWorkoutCompletion(makeInput());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe('receipt durável da conclusão', () => {
  async function buildReceipt(overrides: {
    session?: WorkoutSession;
    generationId?: string;
  } = {}) {
    const session = overrides.session ?? makeSession();
    const generationId = overrides.generationId ?? 'generation-1';
    const outcome = deriveWorkoutCompletion(makeInput({ finalSession: session }));
    return createWorkoutCompletionReceipt({
      receiptId: 'receipt-1',
      generationId,
      finalSession: session,
      coreEnvelopeAfter: coreOf(outcome.state, generationId),
      effects: outcome.effects,
      createdAt: '2026-07-23T12:00:00.000Z',
    });
  }

  it('cria receipt pendente com digest da sessão e core sem workoutHistory', async () => {
    const session = makeSession();
    const receipt = await buildReceipt({ session });
    expect(receipt).toMatchObject({
      receiptId: 'receipt-1',
      sessionId: session.id,
      generationId: 'generation-1',
      status: 'pending',
      settledAt: null,
      createdAt: '2026-07-23T12:00:00.000Z',
    });
    expect(receipt.sessionDigest).toBe(await digestWorkoutSession(session));
    expect(Object.prototype.hasOwnProperty.call(receipt.coreEnvelopeAfter, 'workoutHistory')).toBe(false);
    expect(receipt.coreEnvelopeAfter.activeWorkout).toBeNull();
    expect(receipt.coreEnvelopeAfter.activeWorkoutStartedAt).toBeNull();
    expect(receipt.coreEnvelopeAfter.restTimerEndAt).toBeNull();
    expect(receipt.coreEnvelopeAfter.user?.lastWorkoutDate).toBe(TODAY);
    expect(isWorkoutCompletionReceipt(receipt)).toBe(true);
  });

  it('valida o formato do receipt', async () => {
    const receipt = await buildReceipt();
    expect(isWorkoutCompletionReceipt(null)).toBe(false);
    expect(isWorkoutCompletionReceipt({ receiptId: 'r' })).toBe(false);
    expect(isWorkoutCompletionReceipt({ ...receipt, status: 'qualquer' })).toBe(false);
    expect(isWorkoutCompletionReceipt({ ...receipt, effects: {} })).toBe(false);
    expect(isWorkoutCompletionReceipt({
      ...receipt,
      coreEnvelopeAfter: { ...receipt.coreEnvelopeAfter, workoutHistory: [] },
    })).toBe(false);
    expect(isWorkoutCompletionReceipt({ ...receipt, sessionId: 'outra-sessao' })).toBe(false);
  });

  it('aprova receipt coerente com a sessão persistida', async () => {
    const session = makeSession();
    const receipt = await buildReceipt({ session });
    await expect(verifyWorkoutCompletionReceipt({
      receipt,
      generationId: 'generation-1',
      persistedSession: session,
    })).resolves.toEqual({ status: 'verified' });
  });

  it('recusa receipt malformado', async () => {
    await expect(verifyWorkoutCompletionReceipt({
      receipt: { receiptId: 'r' },
      generationId: 'generation-1',
      persistedSession: makeSession(),
    })).resolves.toMatchObject({ status: 'invalid', reason: 'receipt-malformed' });
  });

  it('recusa receipt de outra geração ou com core apontando para outra geração', async () => {
    const session = makeSession();
    const receipt = await buildReceipt({ session });
    await expect(verifyWorkoutCompletionReceipt({
      receipt,
      generationId: 'generation-2',
      persistedSession: session,
    })).resolves.toMatchObject({ status: 'invalid', reason: 'receipt-generation-mismatch' });

    await expect(verifyWorkoutCompletionReceipt({
      receipt: {
        ...receipt,
        coreEnvelopeAfter: {
          ...receipt.coreEnvelopeAfter,
          historyStorage: { backend: 'indexeddb', schemaVersion: 1, generationId: 'generation-9' },
        },
      },
      generationId: 'generation-1',
      persistedSession: session,
    })).resolves.toMatchObject({ status: 'invalid', reason: 'receipt-generation-mismatch' });
  });

  it('recusa receipt adulterado no digest ou na sessão que carrega', async () => {
    const session = makeSession();
    const receipt = await buildReceipt({ session });
    await expect(verifyWorkoutCompletionReceipt({
      receipt: { ...receipt, sessionDigest: 'sha256:adulterado' },
      generationId: 'generation-1',
      persistedSession: session,
    })).resolves.toMatchObject({ status: 'invalid', reason: 'receipt-digest-mismatch' });

    await expect(verifyWorkoutCompletionReceipt({
      receipt: { ...receipt, finalSession: { ...session, totalVolume: 1 } },
      generationId: 'generation-1',
      persistedSession: session,
    })).resolves.toMatchObject({ status: 'invalid', reason: 'receipt-digest-mismatch' });
  });

  it('recusa receipt sem sessão persistida ou com sessão divergente', async () => {
    const session = makeSession();
    const receipt = await buildReceipt({ session });
    await expect(verifyWorkoutCompletionReceipt({
      receipt,
      generationId: 'generation-1',
      persistedSession: undefined,
    })).resolves.toMatchObject({ status: 'invalid', reason: 'session-absent' });

    await expect(verifyWorkoutCompletionReceipt({
      receipt,
      generationId: 'generation-1',
      persistedSession: { ...session, calories: 1 },
    })).resolves.toMatchObject({ status: 'invalid', reason: 'session-divergent' });
  });
});
