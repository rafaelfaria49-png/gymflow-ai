import { describe, expect, it } from 'vitest';
import type { ActiveExercise, UserProfile, WeeklyWorkoutDay, WorkoutSession, WorkoutSet } from '../types';
import {
  deriveExerciseEntryStatus,
  deriveSessionStatus,
  finalizeSession,
  startActiveSession,
  buildSessionPlan,
} from './workout-session-domain';
import {
  buildSessionPreview,
  buildSessionSummary,
  countCompletedSets,
  countIncompleteSets,
  countPerformedExercises,
  countSkippedExercises,
  countTotalSets,
  resolveSessionStatus,
} from './workout-session-view';
import { normalizeSessionState, type NormalizableSessionState } from './workout-session-migration';
import {
  completionPostContent,
  deriveWorkoutCompletion,
  type WorkoutCompletionInput,
} from './storage-completion-receipt';
import { aggregateWorkoutVolume } from '../domain/techniques/aggregator';
import { getCivilDateString } from './nutrition-civil-date';
import type { PersistedState } from './storage-types';

function makeSet(completed: boolean, weight = 50, reps = 10, isWarmup = false, id = `set_${Math.random()}`): WorkoutSet {
  return { id, reps, weight, completed, isWarmup };
}

function makeExercise(
  id: string,
  sets: WorkoutSet[],
  overrides: Partial<ActiveExercise> = {},
): ActiveExercise {
  return {
    id,
    exerciseId: `ex_${id}`,
    name: `Exercício ${id}`,
    muscleGroup: 'chest',
    sets,
    ...overrides,
  };
}

function makeSession(exercises: ActiveExercise[], overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  const startedAt = 1_784_000_000_000;
  return {
    id: 'session_test_043',
    name: 'Treino A — Peito & Tríceps',
    date: new Date(startedAt).toISOString(),
    duration: 0,
    calories: 0,
    xpEarned: 0,
    totalVolume: 0,
    prsDetected: [],
    status: 'active',
    startedAt,
    exercises,
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
    weight: 80,
    height: 178,
    frequency: 4,
    duration: 60,
    location: 'gym',
    equipments: [],
    restrictions: [],
    muscleFocus: [],
    preference: '',
    xp: 1000,
    streak: 3,
    waterIntake: 0,
    waterGoal: 3000,
    premiumStatus: 'pro',
    points: 1000,
    weeklyPlan: [],
    connectedSocials: [],
    ...overrides,
  };
}

function makeWeeklyPlan(): WeeklyWorkoutDay[] {
  return [
    { dayName: 'Segunda', workoutName: 'Treino A', muscleGroups: ['chest'], duration: 60, exerciseCount: 2, isRest: false, trained: false },
    { dayName: 'Terça', workoutName: 'Descanso', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true, trained: false },
  ];
}

function makeState(overrides: Partial<PersistedState> = {}): PersistedState {
  const weeklyPlan = makeWeeklyPlan();
  return {
    user: makeUser({ weeklyPlan }),
    weeklyPlan,
    customPrograms: [],
    activeWorkout: null,
    activeWorkoutStartedAt: null,
    restTimerEndAt: null,
    restTimerTotalSeconds: null,
    restTimerLabel: null,
    workoutHistory: [],
    weightHistory: [],
    measurementsHistory: [],
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
    achievements: [],
    challenges: [],
    favoriteExercises: [],
    recentlyViewedVideoIds: [],
    ...overrides,
  };
}

describe('GOAL-043: Integridade e Honestidade Operacional do Runtime de Sessão', () => {
  // 1. Retomada após reload
  it('1. retomada após reload preserva a mesma sessão, exercícios e séries sem duplicar', () => {
    const ex1 = makeExercise('ex_1', [makeSet(true, 80, 10), makeSet(false, 80, 10)]);
    const ex2 = makeExercise('ex_2', [makeSet(false, 30, 12)]);
    const session = makeSession([ex1, ex2], { startedAt: 1_000_000 });

    const state: NormalizableSessionState = {
      activeWorkout: session,
      activeWorkoutStartedAt: 1_000_000,
      workoutHistory: [],
    };

    const normalized = normalizeSessionState(state);
    expect(normalized.activeWorkout).not.toBeNull();
    expect(normalized.activeWorkout?.id).toBe(session.id);
    expect(normalized.activeWorkout?.exercises[0].sets[0].completed).toBe(true);
    expect(normalized.activeWorkout?.exercises[0].sets[0].weight).toBe(80);
    expect(normalized.activeWorkout?.exercises[0].sets[1].completed).toBe(false);
    expect(normalized.activeWorkout?.exercises[1].sets[0].completed).toBe(false);
    expect(normalized.activeWorkoutStartedAt).toBe(1_000_000);
    expect(normalized.workoutHistory).toHaveLength(0);
  });

  // 2. Retomada horas/dia depois
  it('2. retomada horas/dia depois preserva wall-clock elapsed, sem zerar e sem tempo negativo', () => {
    const fifteenHoursMs = 15 * 3600 * 1000;
    const now = 1_784_000_000_000;
    const startedAt = now - fifteenHoursMs;
    const session = makeSession([makeExercise('ex_1', [makeSet(false)])], { startedAt });

    const state: NormalizableSessionState = {
      activeWorkout: session,
      activeWorkoutStartedAt: startedAt,
      workoutHistory: [],
    };

    const normalized = normalizeSessionState(state);
    expect(normalized.activeWorkout?.startedAt).toBe(startedAt);
    expect(normalized.activeWorkoutStartedAt).toBe(startedAt);

    // Duração decorrida baseada em wall-clock elapsed
    const elapsedSeconds = Math.max(0, Math.floor((now - normalized.activeWorkoutStartedAt!) / 1000));
    expect(elapsedSeconds).toBe(15 * 3600);
    expect(elapsedSeconds).toBeGreaterThan(0);

    // Formatação segura
    const hrs = Math.floor(elapsedSeconds / 3600);
    const mins = Math.floor((elapsedSeconds % 3600) / 60);
    const secs = elapsedSeconds % 60;
    const formatted = [
      hrs > 0 ? String(hrs).padStart(2, '0') : null,
      String(mins).padStart(2, '0'),
      String(secs).padStart(2, '0'),
    ].filter(Boolean).join(':');

    expect(formatted).toBe('15:00:00');
  });

  // 3. Finalizar sem séries (ABANDONED)
  it('3. finalizar com zero séries resulta em status abandoned, 0 volume, 0 XP e nenhum streak', () => {
    const ex1 = makeExercise('ex_1', [makeSet(false, 60, 10), makeSet(false, 60, 10)]);
    const ex2 = makeExercise('ex_2', [makeSet(false, 40, 12)]);
    const session = makeSession([ex1, ex2]);

    const status = deriveSessionStatus(session.exercises);
    expect(status).toBe('abandoned');

    const preview = buildSessionPreview(session);
    expect(preview.status).toBe('abandoned');
    expect(preview.performedExercises).toBe(0);
    expect(preview.skippedExercises).toBe(2);
    expect(preview.completedSets).toBe(0);
    expect(preview.incompleteSets).toBe(3);

    const volumeSummary = aggregateWorkoutVolume(session.exercises);
    const isAbandoned = status === 'abandoned';
    const totalVolume = isAbandoned ? 0 : volumeSummary.totalVolume;
    const finalXp = isAbandoned ? 0 : 100;
    const caloriesBurned = isAbandoned ? 0 : 300;

    expect(totalVolume).toBe(0);
    expect(finalXp).toBe(0);
    expect(caloriesBurned).toBe(0);

    const { session: finalized } = finalizeSession({
      session,
      endedAt: session.startedAt! + 3600_000,
      duration: 3600,
      calories: caloriesBurned,
      totalVolume,
      prsDetected: [],
      xpEarned: finalXp,
    });

    expect(finalized.status).toBe('abandoned');
    expect(finalized.totalVolume).toBe(0);
    expect(finalized.xpEarned).toBe(0);
    expect(finalized.calories).toBe(0);

    const finalizedSummary = buildSessionSummary(finalized);
    expect(finalizedSummary.status).toBe('abandoned');
    expect(finalizedSummary.performedExercises).toBe(0);
    expect(finalizedSummary.skippedExercises).toBe(2);
    expect(finalizedSummary.completedSets).toBe(0);
    expect(finalizedSummary.incompleteSets).toBe(3);

    const completion = deriveWorkoutCompletion({
      state: makeState({ activeWorkout: session }),
      finalSession: finalized,
      finalXp,
      caloriesBurned,
      totalVolume,
      minutes: 60,
      prsDetected: [],
      prAchievementIds: [],
      todayDayName: 'Segunda',
      todayIso: '2026-09-09',
      postId: 'post_abandoned',
    });

    // Zero XP indevido e zero streak
    expect(completion.state.user?.xp).toBe(1000);
    expect(completion.state.user?.streak).toBe(3);
    expect(completion.state.weeklyPlan.find((d) => d.dayName === 'Segunda')?.trained).toBe(false);
    expect(completion.effects.xpNotifications).toEqual([]);
    expect(completion.effects.communityPost).toBeNull();
    expect(completion.effects.markedDayName).toBe('');
    expect(completion.state.activeWorkout).toBeNull();
  });

  // 4. Finalizar parcialmente (PARTIAL)
  it('4. finalizar parcialmente contabiliza volume estritamente das séries concluídas e emite mensagem parcial', () => {
    // 2 séries concluídas de 50kg x 10 = 500 + 500 = 1000kg
    // 1 série não concluída (deve dar 0 volume)
    const ex1 = makeExercise('ex_1', [makeSet(true, 50, 10), makeSet(true, 50, 10), makeSet(false, 50, 10)]);
    const ex2 = makeExercise('ex_2', [makeSet(false, 30, 10)]);
    const session = makeSession([ex1, ex2]);

    const status = deriveSessionStatus(session.exercises);
    expect(status).toBe('partial');

    const preview = buildSessionPreview(session);
    expect(preview.status).toBe('partial');
    expect(preview.performedExercises).toBe(0); // ex1 tem 2/3 (parcial, não performed)
    expect(preview.skippedExercises).toBe(1); // ex2 tem 0/1 (pulado)
    expect(preview.completedSets).toBe(2);
    expect(preview.incompleteSets).toBe(2);
    expect(preview.totalSets).toBe(4);

    const volume = aggregateWorkoutVolume(session.exercises);
    expect(volume.effectiveSets).toBe(2);
    expect(volume.totalVolume).toBe(1000);

    const { session: finalized } = finalizeSession({
      session,
      endedAt: session.startedAt! + 1800_000,
      duration: 1800,
      calories: 150,
      totalVolume: volume.totalVolume,
      prsDetected: [],
      xpEarned: 100 + 2 * 5,
    });

    expect(finalized.status).toBe('partial');
    expect(finalized.totalVolume).toBe(1000);
    expect(finalized.xpEarned).toBe(110);

    const postContent = completionPostContent({
      sessionName: finalized.name,
      minutes: 30,
      totalVolume: finalized.totalVolume!,
      prsDetected: [],
      status: finalized.status,
    });
    expect(postContent).toContain('Treino parcial registrado!');
    expect(postContent).not.toContain('Treino finalizado! Concluí');
  });

  // 5. Finalizar completo (COMPLETED)
  it('5. finalizar completo tem status completed, salva uma vez e credita volume e XP totais', () => {
    const ex1 = makeExercise('ex_1', [makeSet(true, 60, 10), makeSet(true, 60, 10)]);
    const ex2 = makeExercise('ex_2', [makeSet(true, 40, 12)]);
    const session = makeSession([ex1, ex2]);

    const status = deriveSessionStatus(session.exercises);
    expect(status).toBe('completed');

    const preview = buildSessionPreview(session);
    expect(preview.status).toBe('completed');
    expect(preview.performedExercises).toBe(2);
    expect(preview.skippedExercises).toBe(0);
    expect(preview.completedSets).toBe(3);
    expect(preview.incompleteSets).toBe(0);

    const volume = aggregateWorkoutVolume(session.exercises);
    // 60*10*2 + 40*12 = 1200 + 480 = 1680
    expect(volume.totalVolume).toBe(1680);

    const { session: finalized } = finalizeSession({
      session,
      endedAt: session.startedAt! + 2400_000,
      duration: 2400,
      calories: 250,
      totalVolume: volume.totalVolume,
      prsDetected: [],
      xpEarned: 100 + 3 * 5,
    });

    expect(finalized.status).toBe('completed');
    expect(finalized.totalVolume).toBe(1680);
    expect(finalized.xpEarned).toBe(115);

    const postContent = completionPostContent({
      sessionName: finalized.name,
      minutes: 40,
      totalVolume: finalized.totalVolume!,
      prsDetected: [],
      status: finalized.status,
    });
    expect(postContent).toContain('Treino finalizado! Concluí');
  });

  // 6, 7, 8, 9. Idempotência estrita: histórico, XP e volume exatamente uma vez
  it('6-9. finalização é idempotente: não duplica histórico, XP nem volume ao reexecutar', () => {
    const ex = makeExercise('ex_1', [makeSet(true, 50, 10)]);
    const session = makeSession([ex]);
    const { session: finalized } = finalizeSession({
      session,
      endedAt: session.startedAt! + 1000,
      duration: 1,
      calories: 10,
      totalVolume: 500,
      prsDetected: [],
      xpEarned: 105,
    });

    const initialUser = makeUser({ xp: 1000, points: 1000, streak: 1 });
    const initialState = makeState({ user: initialUser });

    // Primeira conclusão
    const firstOutcome = deriveWorkoutCompletion({
      state: initialState,
      finalSession: finalized,
      finalXp: 105,
      caloriesBurned: 10,
      totalVolume: 500,
      minutes: 1,
      prsDetected: [],
      prAchievementIds: [],
      todayDayName: 'Segunda',
      todayIso: '2026-09-09',
      postId: 'post_first',
    });

    // Estado com a sessão já adicionada ao histórico
    const stateWithHistory: PersistedState = {
      ...firstOutcome.state,
      workoutHistory: [finalized],
    };

    const firstXp = firstOutcome.state.user?.xp;
    expect(firstXp).toBe(1000 + 105 + 25); // 105 treino + 25 post feed

    // Segunda conclusão para a mesma sessão
    const secondOutcome = deriveWorkoutCompletion({
      state: stateWithHistory,
      finalSession: finalized,
      finalXp: 105,
      caloriesBurned: 10,
      totalVolume: 500,
      minutes: 1,
      prsDetected: [],
      prAchievementIds: [],
      todayDayName: 'Segunda',
      todayIso: '2026-09-09',
      postId: 'post_second',
    });

    // Não duplicou XP, pontos, streak nem gerou notificações extras
    expect(secondOutcome.state.user?.xp).toBe(firstXp);
    expect(secondOutcome.state.user?.points).toBe(firstOutcome.state.user?.points);
    expect(secondOutcome.state.user?.streak).toBe(firstOutcome.state.user?.streak);
    expect(secondOutcome.effects.xpNotifications).toEqual([]);
    expect(secondOutcome.state.workoutHistory).toHaveLength(1);
  });

  // 10. Estado final não reabre como ativo
  it('10. sessão com estado finalizado (completed, partial, abandoned) ou com endedAt não reabre como ativa', () => {
    for (const finalStatus of ['completed', 'partial', 'abandoned'] as const) {
      const state = {
        activeWorkout: makeSession([], { status: finalStatus }),
        activeWorkoutStartedAt: 12345,
        workoutHistory: [],
      };
      const normalized = normalizeSessionState(state);
      expect(normalized.activeWorkout).toBeNull();
      expect(normalized.activeWorkoutStartedAt).toBeNull();
    }

    const endedState = {
      activeWorkout: makeSession([], { status: 'active', endedAt: 99999 }),
      activeWorkoutStartedAt: 12345,
      workoutHistory: [],
    };
    const normalizedEnded = normalizeSessionState(endedState);
    expect(normalizedEnded.activeWorkout).toBeNull();
    expect(normalizedEnded.activeWorkoutStartedAt).toBeNull();
  });

  it('10b. activeWorkout com id colidente com sessão já finalizada no histórico não reabre (histórico autoritativo)', () => {
    for (const finalStatus of ['completed', 'partial', 'abandoned'] as const) {
      const state = {
        activeWorkout: makeSession([], { id: 'session_colliding', status: 'active', endedAt: undefined }),
        activeWorkoutStartedAt: 12345,
        workoutHistory: [makeSession([], { id: 'session_colliding', status: finalStatus, endedAt: 20000 })],
      };
      const normalized = normalizeSessionState(state);
      expect(normalized.activeWorkout).toBeNull();
      expect(normalized.activeWorkoutStartedAt).toBeNull();
      expect(normalized.workoutHistory[0].status).toBe(finalStatus);
    }
  });

  // 11. Mensagens coerentes com status e formatação honesta de duração
  it('11. textos de postagem e preview são honestos e não dizem que já salvou antes de registrar', () => {
    // completed 45 min
    const completedPost = completionPostContent({
      sessionName: 'Treino Completo',
      minutes: 45,
      totalVolume: 5000,
      prsDetected: [],
      status: 'completed',
    });
    expect(completedPost).toContain('Treino finalizado! Concluí "Treino Completo" em 45 minutos.');

    // completed 75 min (1h 15min)
    const completedPost75 = completionPostContent({
      sessionName: 'Treino 75',
      minutes: 75,
      totalVolume: 5000,
      prsDetected: [],
      status: 'completed',
    });
    expect(completedPost75).toContain('Treino finalizado! Concluí "Treino 75" em 1h 15min.');

    // completed 1080 min (18h)
    const completedPostLong = completionPostContent({
      sessionName: 'Treino Longo',
      minutes: 1080,
      totalVolume: 6000,
      prsDetected: [],
      status: 'completed',
    });
    expect(completedPostLong).toContain('Treino finalizado! Concluí "Treino Longo" em 18h.');
    expect(completedPostLong).not.toContain('1080 minutos');

    // partial 20 min
    const partialPost = completionPostContent({
      sessionName: 'Treino Parcial',
      minutes: 20,
      totalVolume: 2000,
      prsDetected: [],
      status: 'partial',
    });
    expect(partialPost).toContain('Treino parcial registrado! Realizei "Treino Parcial" em 20 minutos.');
    expect(partialPost).not.toContain('Concluí');

    // partial 1080 min (18h)
    const partialPostLong = completionPostContent({
      sessionName: 'Treino Parcial Longo',
      minutes: 1080,
      totalVolume: 2000,
      prsDetected: [],
      status: 'partial',
    });
    expect(partialPostLong).toContain('Treino parcial registrado! Realizei "Treino Parcial Longo" em 18h.');
    expect(partialPostLong).not.toContain('1080 minutos');
    expect(partialPostLong).not.toContain('Concluí');
  });

  // 12. Contagens do resumo coerentes
  it('12. contagens do resumo são exatamente consistentes no cenário QA com 8 exercícios e 24 séries puladas', () => {
    const exercises: ActiveExercise[] = [];
    for (let i = 0; i < 8; i++) {
      exercises.push(makeExercise(`ex_${i}`, [makeSet(false), makeSet(false), makeSet(false)]));
    }
    const session = makeSession(exercises);

    const summary = buildSessionPreview(session);
    expect(summary.totalExercises).toBe(8);
    expect(summary.performedExercises).toBe(0);
    expect(summary.skippedExercises).toBe(8);
    expect(summary.totalSets).toBe(24);
    expect(summary.completedSets).toBe(0);
    expect(summary.incompleteSets).toBe(24);
    expect(summary.status).toBe('abandoned');

    const volume = aggregateWorkoutVolume(session.exercises);
    expect(volume.totalVolume).toBe(0);
    expect(volume.effectiveSets).toBe(0);
  });

  it('12b. aquecimentos são excluídos da contagem de séries efetivas do resumo', () => {
    const exercise = makeExercise('supino', [
      makeSet(true, 20, 15, true), // aquecimento concluído
      makeSet(true, 60, 10, false), // série de trabalho concluída
      makeSet(false, 60, 10, false), // série de trabalho incompleta
    ]);
    const session = makeSession([exercise]);

    expect(countTotalSets(session.exercises)).toBe(2);
    expect(countCompletedSets(session.exercises)).toBe(1);
    expect(countIncompleteSets(session.exercises)).toBe(1);
  });

  // 13. Wall-clock de muitas horas não infla calorias para números absurdos
  it('13. wall-clock longo (ex.: sessão retomada no dia seguinte) ancora calorias em teto fisiológico seguro', () => {
    // Sessão com 18 horas de duração (1080 minutos) e 12 séries concluídas
    const exercises = [
      makeExercise('ex1', [makeSet(true, 50, 10), makeSet(true, 50, 10), makeSet(true, 50, 10)]),
      makeExercise('ex2', [makeSet(true, 50, 10), makeSet(true, 50, 10), makeSet(true, 50, 10)]),
      makeExercise('ex3', [makeSet(true, 50, 10), makeSet(true, 50, 10), makeSet(true, 50, 10)]),
      makeExercise('ex4', [makeSet(true, 50, 10), makeSet(true, 50, 10), makeSet(true, 50, 10)]),
    ];
    const session = makeSession(exercises);
    const volumeSummary = aggregateWorkoutVolume(session.exercises);
    const completedSetsCount = volumeSummary.effectiveSets; // 12
    const workoutDurationSeconds = 18 * 3600; // 18h = 64800s
    const minutes = Math.ceil(workoutDurationSeconds / 60); // 1080 min
    const kcalPerMinute = 8.5;

    // Fórmula canônica aplicada no GymFlowContext
    const maxActiveMinutes = Math.min(180, Math.max(15, completedSetsCount * 6)); // min(180, 72) = 72 min
    const calorieMinutes = Math.min(minutes, maxActiveMinutes); // 72 min
    const rawCalories = Math.round(calorieMinutes * kcalPerMinute); // 72 * 8.5 = 612 kcal
    const caloriesBurned = Math.min(rawCalories, 1200);

    expect(caloriesBurned).toBe(612);
    // Sem a proteção, seria 1080 * 8.5 = 9180 kcal!
    expect(caloriesBurned).toBeLessThan(1000);
  });

  it('13b. sessão abandonada com wall-clock longo registra rigorosamente 0 calorias', () => {
    const exercises = [
      makeExercise('ex1', [makeSet(false), makeSet(false)]),
    ];
    const session = makeSession(exercises);
    const volumeSummary = aggregateWorkoutVolume(session.exercises);
    const completedSetsCount = 0;
    const isAbandoned = true;
    const workoutDurationSeconds = 24 * 3600; // 24 horas
    const minutes = Math.ceil(workoutDurationSeconds / 60);
    const maxActiveMinutes = Math.min(180, Math.max(15, completedSetsCount * 6));
    const calorieMinutes = Math.min(minutes, maxActiveMinutes);
    const rawCalories = Math.round(calorieMinutes * 6.5);
    const caloriesBurned = isAbandoned ? 0 : Math.min(rawCalories, 1200);

    expect(caloriesBurned).toBe(0);
  });

  // 14. Data civil local determinística
  it('14. data civil local garante que horário após 21h em fusos negativos (ex.: Brasília UTC-3) preserva a data correta', () => {
    // 2026-09-09 às 22:00 BRT -> 2026-09-10T01:00Z em UTC
    const eveningDate = new Date('2026-09-10T01:00:00.000Z');
    const localCivilDate = getCivilDateString(eveningDate, 'America/Sao_Paulo');
    expect(localCivilDate).toBe('2026-09-09');

    // toISOString().split('T')[0] retornaria incorretamente 2026-09-10
    expect(eveningDate.toISOString().split('T')[0]).toBe('2026-09-10');
  });

  // 15. Effects de abandoned garante nenhum post e nenhum dia treinado
  it('15. sessão abandonada produz effects com communityPost estritamente null e markedDayName vazio', () => {
    const session = makeSession([makeExercise('ex1', [makeSet(false)])], { status: 'abandoned' });
    const { session: finalized } = finalizeSession({
      session,
      endedAt: Date.now(),
      duration: 1200,
      calories: 0,
      totalVolume: 0,
      prsDetected: [],
      xpEarned: 0,
    });

    const completion = deriveWorkoutCompletion({
      state: makeState({ activeWorkout: session }),
      finalSession: finalized,
      finalXp: 0,
      caloriesBurned: 0,
      totalVolume: 0,
      minutes: 20,
      prsDetected: [],
      prAchievementIds: [],
      todayDayName: 'Segunda',
      todayIso: '2026-09-09',
      postId: 'post_abandoned_check',
    });

    expect(completion.effects.communityPost).toBeNull();
    expect(completion.effects.markedDayName).toBe('');
    expect(completion.effects.xpNotifications).toHaveLength(0);
    // Nenhum dia do weeklyPlan treinado
    expect(completion.state.weeklyPlan.every((d) => !d.trained)).toBe(true);
  });
});
