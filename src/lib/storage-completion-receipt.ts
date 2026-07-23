import type { CommunityPost, WorkoutSession } from '../types';
import {
  digestWorkoutSession,
  workoutSessionsMatch,
} from './storage-history-integrity';
import type { PersistedCoreState, PersistedState } from './storage-types';

// Receipt durável da finalização de treino.
//
// O append da sessão sozinho não prova que XP, streak, planejamento, desafios,
// conquistas, postagem e limpeza do treino foram materializados. O receipt
// carrega o resultado final e determinístico da conclusão para que qualquer
// janela de kill seja retomável e idempotente.

export const COMPLETION_POST_AVATAR = '🚀';
export const COMPLETION_POST_TIME_LABEL = 'Agora mesmo';
export const COMPLETION_POST_FALLBACK_AUTHOR = 'Rafael Silveira (Demo)';

export type CompletionReceiptStatus = 'pending' | 'completed';

export interface CompletionXpNotification {
  kind: 'xp' | 'levelup';
  text: string;
  xp: number;
}

// Efeitos que não pertencem ao core e precisam ser materializados em memória.
export interface WorkoutCompletionEffects {
  xpNotifications: CompletionXpNotification[];
  communityPost: CommunityPost;
  unlockedAchievementIds: string[];
  markedDayName: string;
}

export interface WorkoutCompletionReceipt {
  receiptId: string;
  sessionId: string;
  generationId: string;
  sessionDigest: string;
  finalSession: WorkoutSession;
  coreEnvelopeAfter: PersistedCoreState;
  effects: WorkoutCompletionEffects;
  createdAt: string;
  status: CompletionReceiptStatus;
  settledAt: string | null;
}

export interface WorkoutCompletionInput {
  // Estado imediatamente antes da conclusão (lido dos refs, não de um render).
  state: PersistedState;
  finalSession: WorkoutSession;
  finalXp: number;
  caloriesBurned: number;
  totalVolume: number;
  minutes: number;
  prsDetected: string[];
  prAchievementIds: string[];
  todayDayName: string;
  todayIso: string;
  postId: string;
  postAuthorName?: string;
  postImage?: string;
}

export interface WorkoutCompletionOutcome {
  state: PersistedState;
  effects: WorkoutCompletionEffects;
}

export function completionPostContent(input: {
  sessionName: string;
  minutes: number;
  totalVolume: number;
  prsDetected: readonly string[];
}): string {
  return `Treino finalizado! Concluí "${input.sessionName}" em ${input.minutes} minutos. Volume total: ${input.totalVolume}kg. ${input.prsDetected.length > 0 ? `🚀 PRs Batidos: ${input.prsDetected.join(', ')}!` : ''} 🔥 #GymFlow #Fitness`;
}

// Helper puro: deriva o resultado completo da conclusão a partir do estado atual
// e da finalSession, sem depender de nenhum render React. As regras (ordem do
// XP, level up, streak, dia treinado, conquistas, desafios e postagem) são as
// mesmas aplicadas pelos callbacks anteriores.
export function deriveWorkoutCompletion(input: WorkoutCompletionInput): WorkoutCompletionOutcome {
  const xpNotifications: CompletionXpNotification[] = [];
  let user = input.state.user;

  const award = (amount: number, reason: string): void => {
    if (!user) return;
    const newXp = user.xp + amount;
    const currentLevelIndex = Math.floor(user.xp / 1000);
    const newLevelIndex = Math.floor(newXp / 1000);
    if (newLevelIndex > currentLevelIndex) {
      xpNotifications.push({
        kind: 'levelup',
        text: `🔥 PARABÉNS! Subiu para o Nível ${newLevelIndex + 1}!`,
        xp: amount,
      });
    }
    user = { ...user, xp: newXp, points: user.points + amount };
    xpNotifications.push({ kind: 'xp', text: reason, xp: amount });
  };

  award(input.finalXp, `Treino Concluído! +${input.caloriesBurned} kcal gastas`);

  const weeklyPlan = input.state.weeklyPlan.map((day) => (
    day.dayName === input.todayDayName ? { ...day, trained: true } : day
  ));

  if (user) {
    user = {
      ...user,
      streak: user.lastWorkoutDate === input.todayIso ? user.streak : user.streak + 1,
      lastWorkoutDate: input.todayIso,
    };
  }

  const unlockedAchievementIds: string[] = [];
  let achievements = input.state.achievements;
  const achievementCandidates = [
    ...input.prAchievementIds,
    'ach_1',
    ...(input.totalVolume >= 10_000 ? ['ach_18'] : []),
  ];
  for (const achievementId of achievementCandidates) {
    achievements = achievements.map((achievement) => {
      if (achievement.id !== achievementId || achievement.unlocked) return achievement;
      award(150, `🏆 Conquista Desbloqueada: ${achievement.name}!`);
      unlockedAchievementIds.push(achievement.id);
      return { ...achievement, unlocked: true, unlockedAt: input.todayIso };
    });
  }

  const challenges = input.state.challenges.map((challenge) => {
    if (challenge.id === 'chal_1') {
      const progress = Math.min(100, challenge.progress + 15);
      return { ...challenge, progress, completed: progress >= 100 };
    }
    if (challenge.id === 'chal_4') {
      const progress = Math.min(
        100,
        challenge.progress + Math.round((input.caloriesBurned / 3000) * 100),
      );
      return { ...challenge, progress, completed: progress >= 100 };
    }
    if (challenge.id === 'chal_5') {
      const progress = Math.min(
        100,
        challenge.progress + Math.round((input.totalVolume / 5000) * 100),
      );
      return { ...challenge, progress, completed: progress >= 100 };
    }
    return challenge;
  });

  const communityPost: CommunityPost = {
    id: input.postId,
    authorName: input.postAuthorName || COMPLETION_POST_FALLBACK_AUTHOR,
    authorAvatar: COMPLETION_POST_AVATAR,
    time: COMPLETION_POST_TIME_LABEL,
    content: completionPostContent({
      sessionName: input.finalSession.name,
      minutes: input.minutes,
      totalVolume: input.totalVolume,
      prsDetected: input.prsDetected,
    }),
    image: input.postImage,
    likes: 0,
    comments: [],
    userLiked: false,
    shares: 0,
  };
  award(25, 'Nova postagem no feed da comunidade');

  // O weeklyPlan do usuário acompanha o top-level, igual ao dispatch canônico.
  if (user) user = { ...user, weeklyPlan };

  return {
    state: {
      ...input.state,
      user,
      weeklyPlan,
      achievements,
      challenges,
      activeWorkout: null,
      activeWorkoutStartedAt: null,
      restTimerEndAt: null,
      restTimerTotalSeconds: null,
      restTimerLabel: null,
    },
    effects: {
      xpNotifications,
      communityPost,
      unlockedAchievementIds,
      markedDayName: input.todayDayName,
    },
  };
}

export async function createWorkoutCompletionReceipt(input: {
  receiptId: string;
  generationId: string;
  finalSession: WorkoutSession;
  coreEnvelopeAfter: PersistedCoreState;
  effects: WorkoutCompletionEffects;
  createdAt: string;
  subtleCrypto?: SubtleCrypto | null;
}): Promise<WorkoutCompletionReceipt> {
  return {
    receiptId: input.receiptId,
    sessionId: input.finalSession.id,
    generationId: input.generationId,
    sessionDigest: await digestWorkoutSession(input.finalSession, input.subtleCrypto),
    finalSession: input.finalSession,
    coreEnvelopeAfter: input.coreEnvelopeAfter,
    effects: input.effects,
    createdAt: input.createdAt,
    status: 'pending',
    settledAt: null,
  };
}

export function isCompletionXpNotification(value: unknown): value is CompletionXpNotification {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (record.kind === 'xp' || record.kind === 'levelup')
    && typeof record.text === 'string'
    && typeof record.xp === 'number';
}

export function isWorkoutCompletionEffects(value: unknown): value is WorkoutCompletionEffects {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const post = record.communityPost as Record<string, unknown> | undefined;
  return Array.isArray(record.xpNotifications)
    && record.xpNotifications.every(isCompletionXpNotification)
    && Array.isArray(record.unlockedAchievementIds)
    && record.unlockedAchievementIds.every((id) => typeof id === 'string')
    && typeof record.markedDayName === 'string'
    && post !== undefined
    && post !== null
    && typeof post.id === 'string'
    && typeof post.content === 'string';
}

export function isWorkoutCompletionReceipt(value: unknown): value is WorkoutCompletionReceipt {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const core = record.coreEnvelopeAfter as Record<string, unknown> | undefined;
  const session = record.finalSession as Record<string, unknown> | undefined;
  return typeof record.receiptId === 'string'
    && typeof record.sessionId === 'string'
    && typeof record.generationId === 'string'
    && typeof record.sessionDigest === 'string'
    && (record.status === 'pending' || record.status === 'completed')
    && typeof record.createdAt === 'string'
    && session !== undefined
    && session !== null
    && session.id === record.sessionId
    && core !== undefined
    && core !== null
    && !Object.prototype.hasOwnProperty.call(core, 'workoutHistory')
    && isWorkoutCompletionEffects(record.effects);
}

export type CompletionReceiptVerification =
  | { status: 'verified' }
  | { status: 'invalid'; reason: CompletionReceiptInvalidReason; message: string };

export type CompletionReceiptInvalidReason =
  | 'receipt-malformed'
  | 'receipt-generation-mismatch'
  | 'receipt-digest-mismatch'
  | 'session-absent'
  | 'session-divergent';

// O receipt só é aceito quando ele próprio é coerente (digest bate com a sessão
// que ele carrega) e a sessão persistida na geração é exatamente a mesma.
export async function verifyWorkoutCompletionReceipt(input: {
  receipt: unknown;
  generationId: string;
  persistedSession: WorkoutSession | undefined;
  subtleCrypto?: SubtleCrypto | null;
}): Promise<CompletionReceiptVerification> {
  const { receipt, generationId, persistedSession } = input;
  if (!isWorkoutCompletionReceipt(receipt)) {
    return {
      status: 'invalid',
      reason: 'receipt-malformed',
      message: 'O receipt de conclusão está com formato inválido.',
    };
  }
  if (receipt.generationId !== generationId) {
    return {
      status: 'invalid',
      reason: 'receipt-generation-mismatch',
      message: `O receipt ${receipt.receiptId} pertence à geração ${receipt.generationId}.`,
    };
  }
  if (receipt.coreEnvelopeAfter.historyStorage?.generationId !== generationId) {
    return {
      status: 'invalid',
      reason: 'receipt-generation-mismatch',
      message: `O core do receipt ${receipt.receiptId} aponta para outra geração.`,
    };
  }
  const declaredDigest = await digestWorkoutSession(receipt.finalSession, input.subtleCrypto);
  if (declaredDigest !== receipt.sessionDigest) {
    return {
      status: 'invalid',
      reason: 'receipt-digest-mismatch',
      message: `O receipt ${receipt.receiptId} foi adulterado: digest não confere com a sessão.`,
    };
  }
  if (!persistedSession) {
    return {
      status: 'invalid',
      reason: 'session-absent',
      message: `A sessão ${receipt.sessionId} do receipt não existe na geração ativa.`,
    };
  }
  if (!workoutSessionsMatch(receipt.finalSession, persistedSession)) {
    return {
      status: 'invalid',
      reason: 'session-divergent',
      message: `A sessão ${receipt.sessionId} persistida diverge do receipt.`,
    };
  }
  return { status: 'verified' };
}
