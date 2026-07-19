'use client';

import React, { createContext, useCallback, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {
  UserProfile,
  Exercise,
  WorkoutProgram,
  WorkoutSession,
  VideoLesson,
  CommunityPost,
  Achievement,
  Challenge,
  NutritionLog,
  ActiveExercise,
  WorkoutSet,
  WeeklyWorkoutDay,
  TechniqueTrail,
  ProgramDay,
  WorkoutBuilderDraft
} from '../types';
import {
  MOCK_EXERCISES,
  MOCK_PROGRAMS,
  MOCK_VIDEOS,
  MOCK_CHALLENGES,
  MOCK_ACHIEVEMENTS,
  MOCK_COMMUNITY,
  MOCK_TRAILS
} from '../mock/data';
import {
  CURRENT_STORAGE_VERSION,
  clearStateResult,
  flushState,
  loadBackupResult,
  loadStateResult,
  restoreBackup,
  saveEnvelopeResult,
} from '../lib/storage';
import { commitStorageImport, createRawRecoveryExport, downloadTextFile } from '../lib/storage-export';
import { mergePersistedState, migrateLegacyState } from '../lib/storage-migrations';
import type {
  GymFlowBackupFile,
  PersistedState as StoragePersistedState,
  StorageHealth,
  StorageWriteResult,
} from '../lib/storage-types';
import { suggestNext, lastRecordedWeight, ExerciseSessionHistory } from '../lib/progression';
import {
  clearProgramFromWeeklyPlan,
  deriveCustomProgramFromSeed,
  duplicateWorkoutProgram,
  removeProgramFromList,
} from '../lib/workout-program-actions';
import { estimateWorkoutDuration, muscleGroupsForSlots } from '../lib/workoutDuration';
import { defaultTargetMinutes } from '../lib/volumeProfiles';
import { programDayDisplayLabel } from '../lib/workout-day-naming';
import { reconcileWeeklyPlanWithProgram } from '../lib/workout-plan-sync';
import { getProgramDays, resolveProgramDays } from '../lib/workout-program-days';
import {
  createViewNavigationGuard,
  type ViewLeaveGuard,
} from '../lib/view-navigation-guard';
import {
  resolveWorkoutStart,
  upsertWorkoutProgram,
  type WorkoutStartFailureReason,
} from '../lib/workout-session-origin';
import {
  adaptWorkoutForCrowdedGym,
  swapWorkoutExercise,
  toggleWorkoutSetCompletion,
  updateWorkoutExerciseNotes,
} from '../lib/workout-session-mutations';
import { useToast } from '../components/ui/Toast';
import { StorageRecoveryNotice } from '../components/ui/StorageRecoveryNotice';

export const STORAGE_KEY = 'gymflow:state:v1';

// Estado persistido em localStorage (somente dados de longa duração — nada de UI).
interface PersistedState {
  user: UserProfile | null;
  weeklyPlan: WeeklyWorkoutDay[];
  // GOAL-10.5: treinos criados/editados no Construtor de Treino manual.
  customPrograms: WorkoutProgram[];
  activeWorkout: WorkoutSession | null;
  activeWorkoutStartedAt: number | null;
  // Timer de descanso (GOAL-06): timestamp de término sobrevive a refresh,
  // igual ao padrão já usado para activeWorkoutStartedAt.
  restTimerEndAt: number | null;
  restTimerTotalSeconds: number | null;
  restTimerLabel: string | null;
  workoutHistory: WorkoutSession[];
  weightHistory: { date: string; value: number }[];
  measurementsHistory: { date: string; chest: number; waist: number; hips: number; arms: number }[];
  nutrition: NutritionLog;
  achievements: Achievement[];
  challenges: Challenge[];
  favoriteExercises: string[];
  recentlyViewedVideoIds: string[];
}

export type AppView =
  | 'landing'
  | 'login'
  | 'register'
  | 'recovery'
  | 'onboarding'
  | 'dashboard'
  | 'workouts'
  | 'active-workout'
  | 'exercises'
  | 'videos'
  | 'ai-coach'
  | 'evolution'
  | 'community'
  | 'nutrition'
  | 'premium'
  | 'admin'
  | 'planner'
  | 'workout-builder';

// GOAL-15: notificação de XP com id/kind/count para permitir limitar, consolidar,
// auto-dismissar e fechar manualmente (antes era só { text, xp } empilhado sem fim).
export interface XpNotification {
  id: number;
  kind: 'xp' | 'levelup';
  text: string; // texto base do evento (ex.: "Série concluída!")
  xp: number; // XP acumulado — somado quando eventos iguais são consolidados
  count: number; // nº de eventos consolidados neste card
  createdAt: number; // reinicia a cada consolidação (renova o tempo de auto-dismiss)
}

// GOAL-19B: passo inicial da criação guiada quando o Construtor é aberto para um
// programa novo. `null` = abertura normal (edição ou modo padrão do gate).
export type BuilderCreationStep = 'mode' | 'frequency' | 'template';

export interface ChatActionCard {
  label: string;
  actionType: 'start-workout' | 'generate-week' | 'swap-exercise' | 'watch-video' | 'replan-missed' | 'crowded-gym';
  payload?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  workoutSuggestion?: {
    name: string;
    exercises: { name: string; sets: number; reps: string }[];
  };
  actionCard?: ChatActionCard;
}

interface GymFlowContextType {
  activeView: AppView;
  setActiveView: (view: AppView) => void;
  registerViewLeaveGuard: (guard: ViewLeaveGuard<AppView>) => () => void;
  user: UserProfile | null;
  loginDemoUser: () => void;
  registerUser: (profile: Partial<UserProfile>) => void;
  logout: () => void;
  updateUserPremium: (status: 'free' | 'pro' | 'elite') => void;
  updateUserProfile: (profile: Partial<UserProfile>) => void;

  // Exercises & Programs
  exercises: Exercise[];
  programs: WorkoutProgram[];
  addNewExercise: (exercise: Exercise) => void;
  deleteExercise: (id: string) => void;

  // Construtor de Treino manual (GOAL-10.5)
  saveCustomProgram: (program: WorkoutProgram) => void;
  lastSavedProgramId: string | null;
  builderDraft: WorkoutBuilderDraft | null;
  builderReturnView: AppView;
  // GOAL-19B: `creationStep` é aditivo e opcional — chamadas existentes (2 args) seguem
  // inalteradas. Deep-linka a criação guiada para o modo/frequência/template.
  openWorkoutBuilder: (draft?: WorkoutBuilderDraft, returnView?: AppView, creationStep?: BuilderCreationStep) => void;
  builderCreationStep: BuilderCreationStep | null;

  // GOAL-19B: ações sobre programas na lista "Meus Treinos".
  deleteCustomProgram: (programId: string) => void;
  duplicateProgram: (programId: string) => void;
  createProgramFromBase: (programId: string) => void;

  // GOAL-10.6: aba ativa de Treinos (Programas Sugeridos x Meus Treinos) e "Escolher
  // treino" — movidos para o contexto para que o Dashboard também consiga acioná-los.
  workoutsTab: 'suggested' | 'mine';
  setWorkoutsTab: React.Dispatch<React.SetStateAction<'suggested' | 'mine'>>;
  chooserDayName: string | null;
  setChooserDayName: React.Dispatch<React.SetStateAction<string | null>>;
  openProgramChooserForDay: (dayName: string) => void;

  // Active Workout
  activeWorkout: WorkoutSession | null;
  startWorkout: (programId?: string, customName?: string, programDayId?: string, explicitDay?: ProgramDay) => void;
  updateWorkoutSet: (exerciseIndex: number, setIndex: number, fields: Partial<WorkoutSet>) => void;
  updateExerciseNotes: (exerciseIndex: number, notes: string) => void;
  completeWorkoutSet: (exerciseIndex: number, setIndex: number) => void;
  // GOAL-15: edições do Treino Ativo (imutáveis → persistem e sobrevivem a refresh)
  addSetToActiveExercise: (exerciseIndex: number) => void;
  removeSetFromActiveExercise: (exerciseIndex: number) => void;
  addExerciseToActiveWorkout: (exerciseId: string) => void;
  removeExerciseFromActiveWorkout: (exerciseIndex: number) => void;
  swapExerciseInActiveWorkout: (exerciseIndex: number, newExerciseId: string, reason?: string) => void;
  finishWorkout: (rpe: number) => void;
  cancelWorkout: () => void;
  workoutDuration: number;
  setWorkoutDuration: React.Dispatch<React.SetStateAction<number>>;
  adaptActiveWorkoutForCrowdedGym: () => void;

  // Timer de descanso (GOAL-06)
  restSecondsRemaining: number;
  restTimerTotalSeconds: number | null;
  restTimerLabel: string | null;
  extendRestTimer: (deltaSeconds: number) => void;
  skipRestTimer: () => void;

  // Planner
  weeklyPlan: WeeklyWorkoutDay[];
  setWeeklyPlan: React.Dispatch<React.SetStateAction<WeeklyWorkoutDay[]>>;
  // GOAL-10.5: dia de hoje já resolvido a partir de weeklyPlan — fonte única de
  // verdade para o card do Dashboard (nunca mais um lookup paralelo de programa).
  todayPlan: WeeklyWorkoutDay | null;
  generateWeeklyPlan: (goal: string, level: string, gender: string, frequency: number) => void;
  applyProgramToWeek: (programId: string) => void;
  assignDayToWeekday: (dayName: string, program: WorkoutProgram, day: ProgramDay) => void;
  replanMissedWorkout: () => void;
  markDayTrained: (dayName: string) => void;

  // History & Metrics
  workoutHistory: WorkoutSession[];
  weightHistory: { date: string; value: number }[];
  addWeightLog: (weight: number) => void;
  measurementsHistory: { date: string; chest: number; waist: number; hips: number; arms: number }[];
  addMeasurementLog: (chest: number, waist: number, hips: number, arms: number) => void;

  // Nutrition
  nutrition: NutritionLog;
  logWater: (amountMl: number) => void;
  logMacros: (calories: number, protein: number, carbs: number, fat: number) => void;

  // Community
  communityPosts: CommunityPost[];
  likePost: (postId: string) => void;
  commentOnPost: (postId: string, text: string) => void;
  addPost: (content: string, image?: string) => void;
  sharePost: (postId: string) => void;

  // Gamification
  challenges: Challenge[];
  achievements: Achievement[];
  unlockAchievement: (id: string) => void;
  xpNotifications: XpNotification[];
  dismissXpNotification: (id: number) => void;
  clearXpNotifications: () => void;

  // Global Player
  activeVideoLessonId: string | null;
  globalPlayerOpen: boolean;
  openGlobalPlayer: (videoId: string) => void;
  closeGlobalPlayer: () => void;

  // Video Lessons & Trails
  videos: VideoLesson[];
  trails: TechniqueTrail[];
  markVideoLearned: (id: string) => void;
  updateVideoProgress: (id: string, progress: number) => void;
  recentlyViewedVideoIds: string[];
  addRecentlyViewedVideo: (id: string) => void;

  // Favorites
  favoriteExercises: string[];
  toggleFavoriteExercise: (id: string) => void;

  // AI Coach Chat
  chatMessages: ChatMessage[];
  sendChatMessage: (text: string) => void;
  clearChat: () => void;

  // Persistência local segura (GOAL-17A)
  storageHealth: StorageHealth;
  applyStorageImport: (backup: GymFlowBackupFile<PersistedState>) => StorageWriteResult<PersistedState>;
  restoreStorageBackup: () => StorageWriteResult<PersistedState>;
  startFreshStorage: () => StorageWriteResult<PersistedState>;
  downloadStorageRecovery: () => void;
}

const GymFlowContext = createContext<GymFlowContextType | undefined>(undefined);

// GOAL-15: teto de notificações de XP visíveis ao mesmo tempo (mobile) + janela
// de consolidação de eventos repetidos (ex.: marcar várias séries em sequência).
const MAX_XP_NOTIFICATIONS = 2;
const XP_CONSOLIDATE_WINDOW_MS = 5000;

// ===== GOAL-07: planejador real (Programa → Semana → Dia → Slot) =====
const DAYS_ORDER = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function activeDaysForFrequency(frequency: number): string[] {
  if (frequency <= 1) return ['Segunda'];
  if (frequency === 2) return ['Segunda', 'Quinta'];
  if (frequency === 3) return ['Segunda', 'Quarta', 'Sexta'];
  if (frequency === 4) return ['Segunda', 'Terça', 'Quinta', 'Sexta'];
  if (frequency === 5) return ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
  if (frequency === 6) return ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return DAYS_ORDER;
}

// Distribui os Days reais do programa pelos dias ativos do calendário, em ciclo
// (A, B, C, A, B...). Dias fora da frequência viram Descanso — sem treino genérico.
// GOAL-10.5: duration/exerciseCount/muscleGroups vêm de estimateWorkoutDuration/
// muscleGroupsForSlots (src/lib/workoutDuration.ts) — a mesma dupla de funções
// usada pelo Construtor de Treino, então o card nunca mais diverge do treino real.
function buildWeekFromProgram(program: WorkoutProgram, frequency: number, allExercises: Exercise[]): WeeklyWorkoutDay[] {
  const programDays = getProgramDays(program);
  const activeDays = activeDaysForFrequency(frequency);
  let cursor = 0;
  return DAYS_ORDER.map((dayName) => {
    const isRest = !activeDays.includes(dayName) || programDays.length === 0;
    if (isRest) {
      return { dayName, workoutName: 'Descanso', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true, trained: false };
    }
    const progDay = programDays[cursor % programDays.length];
    cursor++;
    const estimate = estimateWorkoutDuration(progDay.slots);
    return {
      dayName,
      // GOAL-19A: dias do Construtor multi-dia entram como "Dia N — Nome"; dias seed
      // já trazem a própria identidade no nome e saem daqui inalterados.
      workoutName: programDayDisplayLabel(progDay),
      muscleGroups: muscleGroupsForSlots(progDay.slots, allExercises),
      duration: estimate.minutes,
      exerciseCount: estimate.exerciseCount,
      isRest: false,
      programId: program.id,
      programDayId: progDay.id,
      trained: false
    };
  });
}

// GOAL-10.5: extraído de finishWorkout/replanMissedWorkout (estavam duplicando a
// mesma normalização de dia da semana) para ter uma única implementação.
function getTodayDayName(): string {
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
  const todayNormalized = today.split('-')[0].trim().toLowerCase();
  const daysMap: { [key: string]: string } = {
    'segunda': 'Segunda', 'terça': 'Terça', 'quarta': 'Quarta', 'quinta': 'Quinta',
    'sexta': 'Sexta', 'sábado': 'Sábado', 'domingo': 'Domingo'
  };
  return daysMap[todayNormalized] || 'Segunda';
}

function resolveStateAction<T>(current: T, action: React.SetStateAction<T>): T {
  return typeof action === 'function'
    ? (action as (previous: T) => T)(current)
    : action;
}

function workoutStartFailureMessage(reason: WorkoutStartFailureReason): string {
  if (reason === 'program-day-not-found') {
    return 'Este dia não existe mais no programa. Escolha novamente o treino no Planejador.';
  }
  if (reason === 'day-selection-required') {
    return 'Este programa tem vários dias. Escolha qual dia deseja iniciar.';
  }
  if (reason === 'empty-program') {
    return 'Este programa não possui um dia ou exercício válido para iniciar.';
  }
  return 'Este programa não está mais disponível. Escolha novamente o treino.';
}

const GOAL_KEYWORDS: Record<string, RegExp> = {
  hypertrophy: /hipertrofia|massa|volume|estética/i,
  slimming: /emagrec|calóric|defini|queima/i,
  strength: /força|carga|power/i,
  conditioning: /condicionamento|global|adapta|estabiliza/i,
  athlete: /máxima|repetição|atleta/i
};

// Escolhe o programa real mais adequado ao perfil: nível > objetivo > público-alvo.
function selectProgramForProfile(programs: WorkoutProgram[], goal: string, level: string, gender: string): WorkoutProgram {
  const byLevel = programs.filter((p) => p.level === level && getProgramDays(p).length > 0);
  const pool = byLevel.length > 0 ? byLevel : programs.filter((p) => getProgramDays(p).length > 0);
  const goalRe = GOAL_KEYWORDS[goal];
  const genderLabel = gender === 'female' ? 'Feminino' : gender === 'male' ? 'Masculino' : 'Unissex';
  const matchesGoal = (p: WorkoutProgram) => (goalRe ? goalRe.test(`${p.objective} ${p.name} ${p.description}`) : false);
  const matchesGender = (p: WorkoutProgram) => (p.targetAudience || 'Unissex').includes(genderLabel) || (p.targetAudience || '').includes('Unissex');
  return (
    pool.find((p) => matchesGoal(p) && matchesGender(p)) ||
    pool.find(matchesGoal) ||
    pool.find(matchesGender) ||
    pool[0]
  );
}

// Beep curto opcional ao fim do descanso (GOAL-06) — Web Audio API, sem asset novo.
// Silencioso em qualquer erro (autoplay bloqueado, navegador sem suporte etc.).
function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.3);
    oscillator.onended = () => ctx.close().catch(() => {});
  } catch {
    /* Web Audio indisponível/bloqueada — ignorar */
  }
}

export const GymFlowProvider = ({ children }: { children: ReactNode }) => {
  const toast = useToast();
  const [activeView, setActiveViewState] = useState<AppView>('landing');
  const activeViewRef = useRef<AppView>('landing');
  const viewNavigationGuardRef = useRef(createViewNavigationGuard<AppView>());
  const [user, setUser] = useState<UserProfile | null>(null);

  // Lists
  const [exercises, setExercises] = useState<Exercise[]>(MOCK_EXERCISES);
  const [programs] = useState<WorkoutProgram[]>(MOCK_PROGRAMS);
  const [videos, setVideos] = useState<VideoLesson[]>(MOCK_VIDEOS);
  const [challenges, setChallenges] = useState<Challenge[]>(MOCK_CHALLENGES);
  const [achievements, setAchievements] = useState<Achievement[]>(MOCK_ACHIEVEMENTS);
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>(MOCK_COMMUNITY);
  const [weeklyPlan, setWeeklyPlanState] = useState<WeeklyWorkoutDay[]>([]);
  const weeklyPlanRef = useRef<WeeklyWorkoutDay[]>([]);
  // O ref torna chamadas sequenciais canônicas mesmo antes do próximo render. O mesmo
  // array calculado uma única vez alimenta o estado top-level e user.weeklyPlan.
  const setWeeklyPlan: React.Dispatch<React.SetStateAction<WeeklyWorkoutDay[]>> = (action) => {
    const next = resolveStateAction(weeklyPlanRef.current, action);
    weeklyPlanRef.current = next;
    setWeeklyPlanState(() => next);
    setUser((previousUser) => {
      if (!previousUser || previousUser.weeklyPlan === next) return previousUser;
      return { ...previousUser, weeklyPlan: next };
    });
  };
  const trails = MOCK_TRAILS;

  // GOAL-10.5: treinos criados/editados no Construtor de Treino manual (persistidos
  // em customPrograms). allPrograms mescla com MOCK_PROGRAMS para que startWorkout,
  // applyProgramToWeek e as telas de Treinos/Planejador não precisem de lógica paralela.
  const [customPrograms, setCustomProgramsState] = useState<WorkoutProgram[]>([]);
  const customProgramsRef = useRef<WorkoutProgram[]>([]);
  const setCustomPrograms: React.Dispatch<React.SetStateAction<WorkoutProgram[]>> = (action) => {
    const next = resolveStateAction(customProgramsRef.current, action);
    customProgramsRef.current = next;
    setCustomProgramsState(() => next);
  };
  const allPrograms = [...programs, ...customPrograms];

  // Rascunho aberto no Construtor — não persistido (o que é salvo vira um
  // WorkoutProgram em customPrograms via saveCustomProgram).
  const [builderDraft, setBuilderDraft] = useState<WorkoutBuilderDraft | null>(null);
  const [builderReturnView, setBuilderReturnView] = useState<AppView>('planner');
  // GOAL-19B: passo inicial da criação guiada (apenas para programa novo).
  const [builderCreationStep, setBuilderCreationStep] = useState<BuilderCreationStep | null>(null);
  // GOAL-10.5: id do último customProgram salvo — usado pela aba Treinos para
  // destacar/posicionar o treino recém-criado em "Meus Treinos" (GOAL-10.6).
  const [lastSavedProgramId, setLastSavedProgramId] = useState<string | null>(null);

  // GOAL-10.6: aba de Treinos e "Escolher treino" viraram estado do contexto (antes
  // eram locais de WorkoutsTab/PlannerView) para o Dashboard poder acionar o mesmo
  // fluxo existente ("Escolher treino para hoje") sem duplicar a lógica do seletor.
  const [workoutsTab, setWorkoutsTab] = useState<'suggested' | 'mine'>('suggested');
  const [chooserDayName, setChooserDayName] = useState<string | null>(null);

  // GOAL-10.5: treino de hoje resolvido a partir do weeklyPlan real — fonte única
  // de verdade do card "Treino do Dia" no Dashboard (nunca mais um lookup paralelo).
  const todayDayName = getTodayDayName();
  const todayPlan = weeklyPlan.find((d) => d.dayName === todayDayName) ?? null;

  // Active workout
  const [activeWorkout, setActiveWorkoutState] = useState<WorkoutSession | null>(null);
  const activeWorkoutRef = useRef<WorkoutSession | null>(null);
  const setActiveWorkout: React.Dispatch<React.SetStateAction<WorkoutSession | null>> = (action) => {
    const next = resolveStateAction(activeWorkoutRef.current, action);
    activeWorkoutRef.current = next;
    setActiveWorkoutState(() => next);
  };
  const commitActiveView = useCallback((view: AppView) => {
    activeViewRef.current = view;
    setActiveViewState(view);
  }, []);
  const requestActiveView = useCallback((view: AppView, commit?: () => void) => (
    viewNavigationGuardRef.current.request(
      activeViewRef.current,
      view,
      commit ?? (() => commitActiveView(view)),
    )
  ), [commitActiveView]);
  const setActiveView = useCallback((view: AppView) => {
    // Superfícies legadas podem tentar navegar mesmo quando startWorkout bloqueia
    // um programa multi-dia sem escolha. Nunca abrir a tela ativa sem sessão real.
    if (view === 'active-workout' && !activeWorkoutRef.current) return;
    requestActiveView(view);
  }, [requestActiveView]);
  const registerViewLeaveGuard = useCallback((guard: ViewLeaveGuard<AppView>) => (
    viewNavigationGuardRef.current.register(guard)
  ), []);
  // Timestamp de início (ms) — fonte da verdade do tempo decorrido; sobrevive a refresh.
  const [activeWorkoutStartedAt, setActiveWorkoutStartedAtState] = useState<number | null>(null);
  const activeWorkoutStartedAtRef = useRef<number | null>(null);
  const setActiveWorkoutStartedAt: React.Dispatch<React.SetStateAction<number | null>> = (action) => {
    const next = resolveStateAction(activeWorkoutStartedAtRef.current, action);
    activeWorkoutStartedAtRef.current = next;
    setActiveWorkoutStartedAtState(() => next);
  };
  const [workoutDuration, setWorkoutDuration] = useState<number>(0);

  // Timer de descanso (GOAL-06) — timestamp de término é a fonte da verdade
  // (mesmo padrão de activeWorkoutStartedAt), o restante é sempre recalculado.
  const [restTimerEndAt, setRestTimerEndAt] = useState<number | null>(null);
  const [restTimerTotalSeconds, setRestTimerTotalSeconds] = useState<number | null>(null);
  const [restTimerLabel, setRestTimerLabel] = useState<string | null>(null);
  const [restSecondsRemainingState, setRestSecondsRemaining] = useState<number>(0);
  const restSecondsRemaining = restTimerEndAt ? restSecondsRemainingState : 0;
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Evolution & Metrics
  const [workoutHistory, setWorkoutHistoryState] = useState<WorkoutSession[]>([]);
  const workoutHistoryRef = useRef<WorkoutSession[]>([]);
  const setWorkoutHistory: React.Dispatch<React.SetStateAction<WorkoutSession[]>> = (action) => {
    const next = resolveStateAction(workoutHistoryRef.current, action);
    workoutHistoryRef.current = next;
    setWorkoutHistoryState(() => next);
  };
  const [weightHistory, setWeightHistory] = useState<{ date: string; value: number }[]>([
    { date: '2026-05-01', value: 82.5 },
    { date: '2026-05-08', value: 81.9 },
    { date: '2026-05-15', value: 81.2 },
    { date: '2026-05-22', value: 80.5 }
  ]);
  const [measurementsHistory, setMeasurementsHistory] = useState([
    { date: '2026-05-01', chest: 104, waist: 88, hips: 100, arms: 38 },
    { date: '2026-05-15', chest: 105, waist: 86, hips: 99, arms: 38.5 }
  ]);

  // Nutrition
  const [nutrition, setNutrition] = useState<NutritionLog>({
    calories: 1420,
    protein: 110,
    carbs: 150,
    fat: 45,
    water: 1200
  });

  // Achievements, XP notifications
  const [xpNotifications, setXpNotifications] = useState<XpNotification[]>([]);
  const xpNotifIdRef = useRef(0);

  // Global Player state
  const [activeVideoLessonId, setActiveVideoLessonId] = useState<string | null>(null);
  const [globalPlayerOpen, setGlobalPlayerOpen] = useState<boolean>(false);
  const [favoriteExercises, setFavoriteExercises] = useState<string[]>([]);
  const [recentlyViewedVideoIds, setRecentlyViewedVideoIds] = useState<string[]>([]);

  // AI Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Olá! Sou o seu Coach Pessoal de Inteligência Artificial GymFlow AI. Como posso ajudar no seu treino hoje?',
      timestamp: new Date()
    }
  ]);

  // Handle active workout timer — o tempo decorrido é recalculado a partir do
  // timestamp de início, então sobrevive a refresh sem "voltar do zero".
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (activeWorkout && activeWorkoutStartedAt) {
      const tick = () => setWorkoutDuration(Math.max(0, Math.floor((Date.now() - activeWorkoutStartedAt) / 1000)));
      tick();
      timer = setInterval(tick, 1000);
    }
    return () => clearInterval(timer);
  }, [activeWorkout, activeWorkoutStartedAt]);

  // Timer de descanso (GOAL-06) — mesmo padrão do cronômetro do treino: o restante
  // é sempre recalculado a partir de `restTimerEndAt`, então sobrevive a refresh.
  useEffect(() => {
    if (!restTimerEndAt) {
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((restTimerEndAt - Date.now()) / 1000));
      setRestSecondsRemaining(remaining);
      if (remaining === 0) {
        toast.success('Descanso concluído! Hora da próxima série.');
        try {
          navigator.vibrate?.([200, 100, 200]);
        } catch {
          /* vibração não suportada — ignorar */
        }
        if (user?.restTimerSoundEnabled !== false) {
          playBeep();
        }
        setRestTimerEndAt(null);
        setRestTimerTotalSeconds(null);
        setRestTimerLabel(null);
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [restTimerEndAt, toast, user?.restTimerSoundEnabled]);

  // Wake Lock (GOAL-06) — tenta manter a tela acesa durante o treino ativo.
  // Requer HTTPS/localhost em muitos navegadores; sem suporte, falha em silêncio
  // e o app continua funcionando normalmente (ver docs/DECISOES.md).
  const hasActiveWorkout = !!activeWorkout;
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let cancelled = false;

    const requestWakeLock = async () => {
      if (wakeLockRef.current) return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          sentinel.release?.();
          return;
        }
        wakeLockRef.current = sentinel;
        sentinel.addEventListener?.('release', () => {
          wakeLockRef.current = null;
        });
      } catch {
        /* não suportado, negado ou requer HTTPS — fallback silencioso */
      }
    };

    const releaseWakeLock = () => {
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };

    if (!hasActiveWorkout) {
      releaseWakeLock();
      return;
    }

    requestWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && hasActiveWorkout) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [hasActiveWorkout]);

  // ===== Persistência local segura (GOAL-17A) — commit lógico verificado =====
  // `hydrated` evita que o primeiro render sobrescreva dados salvos com defaults.
  const [hydrated, setHydrated] = useState(false);
  const [storageHealth, setStorageHealth] = useState<StorageHealth>({
    status: 'loading',
    hasBackup: false,
  });
  const storageBlockedRef = useRef(false);
  const pendingSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWriteErrorRef = useRef<string | null>(null);
  const lastLifecycleFlushRef = useRef(0);

  const persistedState: PersistedState = {
    user,
    weeklyPlan,
    customPrograms,
    activeWorkout,
    activeWorkoutStartedAt,
    restTimerEndAt,
    restTimerTotalSeconds,
    restTimerLabel,
    workoutHistory,
    weightHistory,
    measurementsHistory,
    nutrition,
    achievements,
    challenges,
    favoriteExercises,
    recentlyViewedVideoIds,
  };
  const persistedStateRef = useRef<PersistedState>(persistedState);
  const initialPersistedStateRef = useRef<PersistedState>(persistedState);
  useEffect(() => {
    persistedStateRef.current = persistedState;
  });

  const hasValidBackup = () => loadBackupResult<StoragePersistedState>(STORAGE_KEY).status === 'ok';

  const reportWriteResult = (result: StorageWriteResult<unknown>) => {
    if (result.ok) {
      if (lastWriteErrorRef.current) {
        lastWriteErrorRef.current = null;
        setStorageHealth({ status: 'ready', hasBackup: hasValidBackup() });
      }
      return;
    }
    if (result.reason === 'blocked') return;
    const signature = `${result.reason}:${result.error}`;
    setStorageHealth({
      status: 'write-error',
      hasBackup: hasValidBackup(),
      issue: { kind: result.reason, message: result.error },
    });
    if (lastWriteErrorRef.current !== signature) {
      lastWriteErrorRef.current = signature;
      toast.error(
        result.reason === 'quota'
          ? 'Sem espaço para salvar. Seus dados atuais foram preservados.'
          : 'Não foi possível confirmar o salvamento local.',
      );
    }
  };

  const savePersistedStateNow = () => {
    if (pendingSaveRef.current) {
      clearTimeout(pendingSaveRef.current);
      pendingSaveRef.current = null;
    }
    // Os refs são atualizados no próprio evento de edição. Assim pagehide/visibilitychange
    // não dependem de um render intermediário para enxergar o último valor válido.
    const renderedState = persistedStateRef.current;
    const latestState: PersistedState = {
      ...renderedState,
      weeklyPlan: weeklyPlanRef.current,
      customPrograms: customProgramsRef.current,
      activeWorkout: activeWorkoutRef.current,
      activeWorkoutStartedAt: activeWorkoutStartedAtRef.current,
      workoutHistory: workoutHistoryRef.current,
      user: renderedState.user
        ? { ...renderedState.user, weeklyPlan: weeklyPlanRef.current }
        : null,
    };
    persistedStateRef.current = latestState;
    const result = flushState<StoragePersistedState>(
      STORAGE_KEY,
      latestState,
      storageBlockedRef.current,
    );
    reportWriteResult(result);
    return result;
  };

  useEffect(() => {
    const defaults = initialPersistedStateRef.current;
    const loaded = loadStateResult<StoragePersistedState>(STORAGE_KEY);
    let saved: PersistedState | null = null;

    if (loaded.status === 'ok' || loaded.status === 'legacy') {
      saved = mergePersistedState(defaults, loaded.value) as PersistedState;
    } else if (loaded.status === 'empty') {
      try {
        const migration = migrateLegacyState(STORAGE_KEY, defaults, window.localStorage);
        if (migration.status === 'migrated' || migration.status === 'already-current') {
          saved = mergePersistedState(defaults, migration.value) as PersistedState;
          if (migration.status === 'migrated' && migration.cleanupWarning) {
            toast.info(migration.cleanupWarning);
          }
        } else if (migration.status !== 'no-legacy') {
          storageBlockedRef.current = true;
          const error = migration.status === 'write-failed' && !migration.result.ok
            ? migration.result.error
            : 'error' in migration
              ? migration.error
              : 'Não foi possível migrar os dados locais antigos.';
          const kind = migration.status === 'write-failed' && !migration.result.ok
            ? migration.result.reason
            : migration.status === 'unavailable'
              ? 'unavailable'
              : 'corrupt';
          setStorageHealth({
            status: 'blocked',
            hasBackup: hasValidBackup(),
            issue: { kind, message: error },
          });
        }
      } catch (error) {
        storageBlockedRef.current = true;
        setStorageHealth({
          status: 'blocked',
          hasBackup: hasValidBackup(),
          issue: {
            kind: 'unavailable',
            message: error instanceof Error ? error.message : 'localStorage indisponível.',
          },
        });
      }
    } else {
      storageBlockedRef.current = true;
      setStorageHealth({
        status: 'blocked',
        hasBackup: hasValidBackup(),
        issue: loaded.status === 'unsupported-version'
          ? {
              kind: 'unsupported-version',
              message: `A versão local ${String(loaded.version)} não é suportada por este app.`,
              raw: loaded.raw,
              version: loaded.version,
            }
          : loaded.status === 'corrupt'
            ? { kind: 'corrupt', message: loaded.error, raw: loaded.raw }
            : { kind: 'unavailable', message: loaded.error },
      });
    }

    if (saved) {
      setUser(saved.user);
      setWeeklyPlan(saved.weeklyPlan);
      setCustomPrograms(saved.customPrograms);
      setActiveWorkout(saved.activeWorkout);
      setActiveWorkoutStartedAt(saved.activeWorkoutStartedAt);
      setWorkoutHistory(saved.workoutHistory);
      setWeightHistory(saved.weightHistory);
      setMeasurementsHistory(saved.measurementsHistory);
      setNutrition(saved.nutrition);
      setAchievements(saved.achievements);
      setChallenges(saved.challenges);
      setFavoriteExercises(saved.favoriteExercises);
      setRecentlyViewedVideoIds(saved.recentlyViewedVideoIds);

      if (saved.activeWorkout && saved.activeWorkoutStartedAt) {
        setWorkoutDuration(Math.max(0, Math.floor((Date.now() - saved.activeWorkoutStartedAt) / 1000)));
      }
      if (saved.restTimerEndAt && saved.restTimerEndAt > Date.now()) {
        setRestTimerEndAt(saved.restTimerEndAt);
        setRestTimerTotalSeconds(saved.restTimerTotalSeconds);
        setRestTimerLabel(saved.restTimerLabel);
      }
      if (saved.user) {
        setActiveView(saved.activeWorkout && saved.activeWorkoutStartedAt ? 'active-workout' : 'dashboard');
      }
    }

    if (!storageBlockedRef.current) {
      setStorageHealth({ status: 'ready', hasBackup: hasValidBackup() });
    }
    setHydrated(true);
  }, []);

  // Debounce normal de 500 ms; o resultado discriminado alimenta a UI de erro.
  useEffect(() => {
    if (!hydrated || storageBlockedRef.current) return;
    const handle = setTimeout(savePersistedStateNow, 500);
    pendingSaveRef.current = handle;
    return () => {
      clearTimeout(handle);
      if (pendingSaveRef.current === handle) pendingSaveRef.current = null;
    };
  }, [
    hydrated,
    user,
    weeklyPlan,
    customPrograms,
    activeWorkout,
    activeWorkoutStartedAt,
    restTimerEndAt,
    restTimerTotalSeconds,
    restTimerLabel,
    workoutHistory,
    weightHistory,
    measurementsHistory,
    nutrition,
    achievements,
    challenges,
    favoriteExercises,
    recentlyViewedVideoIds,
  ]);

  // Flush síncrono reduz a janela de perda ao ocultar/fechar a página ou WebView.
  useEffect(() => {
    if (!hydrated) return;
    const lifecycleFlush = () => {
      const now = Date.now();
      if (now - lastLifecycleFlushRef.current < 100) return;
      lastLifecycleFlushRef.current = now;
      savePersistedStateNow();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') lifecycleFlush();
    };
    window.addEventListener('pagehide', lifecycleFlush);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', lifecycleFlush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hydrated]);

  // GOAL-15: empilha uma notificação de XP com limite e consolidação.
  // Eventos de XP repetidos e recentes (mesmo texto, ex.: "Série concluída!")
  // são agrupados num único card ("4 séries concluídas · +40 XP") em vez de
  // renderizar 4 cards gigantes. Level up nunca consolida (comemoração distinta).
  const pushXpNotification = (kind: XpNotification['kind'], text: string, xp: number) => {
    setXpNotifications((prev) => {
      const now = Date.now();
      if (kind === 'xp' && prev.length > 0) {
        const last = prev[prev.length - 1];
        if (last.kind === 'xp' && last.text === text && now - last.createdAt < XP_CONSOLIDATE_WINDOW_MS) {
          const merged: XpNotification = {
            ...last,
            xp: last.xp + xp,
            count: last.count + 1,
            createdAt: now // renova o auto-dismiss enquanto o usuário segue marcando
          };
          return [...prev.slice(0, -1), merged];
        }
      }
      const next: XpNotification = { id: ++xpNotifIdRef.current, kind, text, xp, count: 1, createdAt: now };
      // No máximo MAX_XP_NOTIFICATIONS visíveis — descarta os mais antigos.
      return [...prev, next].slice(-MAX_XP_NOTIFICATIONS);
    });
  };

  // XP trigger helper
  const addXp = (amount: number, reason: string) => {
    if (!user) return;
    setUser((prev) => {
      if (!prev) return null;
      const newXp = prev.xp + amount;
      const currentLevelIndex = Math.floor(prev.xp / 1000);
      const newLevelIndex = Math.floor(newXp / 1000);
      if (newLevelIndex > currentLevelIndex) {
        pushXpNotification('levelup', `🔥 PARABÉNS! Subiu para o Nível ${newLevelIndex + 1}!`, amount);
      }
      return {
        ...prev,
        xp: newXp,
        points: prev.points + amount
      };
    });
    pushXpNotification('xp', reason, amount);
  };

  const dismissXpNotification = (id: number) => setXpNotifications((prev) => prev.filter((n) => n.id !== id));
  const clearXpNotifications = () => setXpNotifications([]);

  // Auth functions
  const loginDemoUser = () => {
    // GOAL-07: plano demo com Days reais do programa ABC masculino (4x/semana)
    const demoProgram = MOCK_PROGRAMS.find((p) => p.id === 'prog_int_1') || MOCK_PROGRAMS[0];
    const defaultPlan = buildWeekFromProgram(demoProgram, 4, MOCK_EXERCISES);
    setUser({
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
      equipments: ['Barra', 'Halteres', 'Polia', 'Máquinas'],
      restrictions: [],
      muscleFocus: ['Peito', 'Braços'],
      preference: 'Hipertrofia com foco estético',
      xp: 2450,
      streak: 5,
      waterIntake: 1200,
      waterGoal: 3000,
      premiumStatus: 'pro',
      points: 2450,
      weeklyPlan: defaultPlan,
      connectedSocials: ['instagram']
    });
    setWeeklyPlan(defaultPlan);
    setActiveView('dashboard');
  };

  const registerUser = (profile: Partial<UserProfile>) => {
    // GOAL-07: plano inicial com Days reais do programa mais adequado ao perfil
    const initialProgram = selectProgramForProfile(
      MOCK_PROGRAMS,
      profile.goal || 'hypertrophy',
      profile.level || 'beginner',
      profile.gender || 'neutral'
    );
    const defaultPlan = buildWeekFromProgram(initialProgram, profile.frequency || 3, MOCK_EXERCISES);
    const newUser: UserProfile = {
      name: profile.name || 'Novo Usuário',
      email: profile.email || 'user@gymflow.ai',
      level: profile.level || 'beginner',
      goal: profile.goal || 'hypertrophy',
      gender: profile.gender || 'neutral',
      age: profile.age || 25,
      weight: profile.weight || 70,
      height: profile.height || 170,
      frequency: profile.frequency || 3,
      duration: profile.duration || 60,
      location: profile.location || 'both',
      equipments: profile.equipments || ['Peso Corporal'],
      restrictions: profile.restrictions || [],
      muscleFocus: profile.muscleFocus || ['Corpo Todo'],
      preference: profile.preference || 'Sem preferências',
      trainingStatus: profile.trainingStatus ?? 'active',
      returnToTraining: profile.returnToTraining,
      trainingExperienceYears: profile.trainingExperienceYears,
      xp: 0,
      streak: 1,
      waterIntake: 0,
      waterGoal: 2500,
      premiumStatus: 'free',
      points: 0,
      weeklyPlan: defaultPlan,
      connectedSocials: []
    };
    setUser(newUser);
    setWeeklyPlan(defaultPlan);
    setActiveView('dashboard');
    addXp(100, 'Boas-vindas ao GymFlow AI!');
    unlockAchievement('ach_5');
  };

  const logout = () => {
    requestActiveView('landing', () => {
      setUser(null);
      setWeeklyPlan([]);
      setActiveWorkout(null);
      setActiveWorkoutStartedAt(null);
      setWorkoutDuration(0);
      setRestTimerEndAt(null);
      setRestTimerTotalSeconds(null);
      setRestTimerLabel(null);
      commitActiveView('landing');
      const cleared = clearStateResult(STORAGE_KEY);
      if (!cleared.ok) toast.error('Não foi possível remover os dados locais deste aparelho.');
    });
  };

  const updateUserPremium = (status: 'free' | 'pro' | 'elite') => {
    if (!user) return;
    setUser((prev) => prev ? { ...prev, premiumStatus: status } : null);
    addXp(200, `Upgrade premium para plano ${status.toUpperCase()}!`);
    if (status === 'elite') {
      unlockAchievement('ach_20');
    }
  };

  const updateUserProfile = (profile: Partial<UserProfile>) => {
    if (!user) return;
    setUser((prev) => prev ? { ...prev, ...profile } : null);
    addXp(50, 'Configurações de perfil salvas!');
  };

  // GOAL-08: histórico real de um exercício (sessões concluídas, mais recente
  // primeiro — ordem natural do workoutHistory persistido no GOAL-01).
  const exerciseHistoryFor = (exerciseId: string): ExerciseSessionHistory[] =>
    workoutHistory
      .map((sess): ExerciseSessionHistory | null => {
        const match = sess.exercises?.find((e) => e.exerciseId === exerciseId);
        return match ? { date: sess.date, sets: match.sets ?? [] } : null;
      })
      .filter((s): s is ExerciseSessionHistory => s !== null);

  // Workout state management
  const startWorkout = (programId?: string, customName?: string, programDayId?: string, explicitDay?: ProgramDay) => {
    if (activeWorkoutRef.current) {
      toast.info('Já existe um treino em andamento. Finalize ou cancele antes de iniciar outro.');
      setActiveView('active-workout');
      return;
    }

    let workoutName = customName || 'Treino Personalizado';
    let activeExs: ActiveExercise[] = [];
    let sessionOrigin: Partial<Pick<
      WorkoutSession,
      'sourceProgramId' | 'sourceProgramDayId' | 'sourceProgramName' | 'sourceProgramDayName'
    >> = {};

    // customProgramsRef é atualizado no próprio saveCustomProgram. Assim o fluxo
    // "salvar e iniciar" encontra o programa novo antes do próximo render.
    const program = programId
      ? [...programs, ...customProgramsRef.current].find((item) => item.id === programId)
      : undefined;
    const daysResolution = resolveProgramDays(program);
    let safeExplicitDay = explicitDay;
    if (program && !safeExplicitDay && programDayId) {
      safeExplicitDay = getProgramDays(program).find((day) => day.id === programDayId);
      if (!safeExplicitDay) {
        toast.error(workoutStartFailureMessage('program-day-not-found'));
        return;
      }
    } else if (program && !safeExplicitDay && !programDayId && daysResolution.kind === 'canonical') {
      if (daysResolution.days.length > 1) {
        toast.error(workoutStartFailureMessage('day-selection-required'));
        return;
      }
      [safeExplicitDay] = daysResolution.days;
    } else if (program && !safeExplicitDay && daysResolution.kind === 'empty') {
      toast.error(workoutStartFailureMessage('empty-program'));
      return;
    }

    const resolution = program && !safeExplicitDay && daysResolution.kind === 'legacy-flat'
      ? {
          status: 'legacy-program' as const,
          program,
          origin: {
            sourceProgramId: program.id,
            sourceProgramName: program.name,
          },
        }
      : resolveWorkoutStart({ programId, program, programDayId, explicitDay: safeExplicitDay });
    if (resolution.status === 'error') {
      toast.error(workoutStartFailureMessage(resolution.reason));
      return;
    }

    if (resolution.status === 'program-day') {
      const programDay = resolution.day;
      if (programDay.slots.length === 0) {
        toast.error('Este dia ainda não possui exercícios para iniciar.');
        return;
      }
      workoutName = customName
        || (resolution.program ? `${resolution.program.name} — ${programDay.name}` : programDay.name);
      sessionOrigin = resolution.origin ?? {};
      activeExs = programDay.slots.map((slot, idx) => {
        // Fallback seguro: exercício ausente vira "Exercício Desconhecido",
        // sem crashar (mesmo padrão legado).
        const ex = exercises.find((e) => e.id === slot.exerciseId);

        // GOAL-08: ANT = última sessão real; SUG = motor determinístico.
        // Pré-preenche carga/reps com a sugestão quando ela existe.
        const history = exerciseHistoryFor(slot.exerciseId);
        const suggestion = suggestNext(slot, history);
        const lastW = lastRecordedWeight(history);
        const targetReps = suggestion.repsAlvo ?? slot.repRange[0];
        const prefillWeight = suggestion.pesoKg ?? lastW ?? 10;

        const sets: WorkoutSet[] = Array.from({ length: slot.series }, (_, sIdx) => ({
          id: `set_${idx}_${sIdx}`,
          reps: targetReps,
          weight: prefillWeight,
          completed: false,
          suggestedWeight: suggestion.pesoKg ?? undefined,
          lastWeight: lastW ?? undefined,
          rpe: slot.targetRPE
        }));

        return {
          id: `active_ex_${idx}_${Date.now()}`,
          exerciseId: slot.exerciseId,
          name: ex?.name || 'Exercício Desconhecido',
          muscleGroup: ex?.muscleGroup || 'Corpo Todo',
          sets,
          notes: '',
          repRange: slot.repRange,
          targetRPE: slot.targetRPE,
          restSec: slot.restSec,
          progressionNote: suggestion.motivo
        };
      });
    } else if (resolution.status === 'legacy-program') {
      // Compatibilidade explícita para programas antigos sem weeks/days.
      const legacyProgram = resolution.program;
      workoutName = customName || legacyProgram.name;
      sessionOrigin = resolution.origin;
      activeExs = legacyProgram.exercises.map((pe, idx) => {
        const ex = exercises.find((e) => e.id === pe.exerciseId);
        const setsCount = pe.sets || 3;
        const repString = pe.reps || '10';
        const repsVal = parseInt(repString) || 10;
        const lastW = lastRecordedWeight(exerciseHistoryFor(pe.exerciseId));
        const sets: WorkoutSet[] = Array.from({ length: setsCount }, (_, sIdx) => ({
          id: `set_${idx}_${sIdx}`,
          reps: repsVal,
          weight: lastW ?? 10,
          completed: false,
          suggestedWeight: undefined,
          lastWeight: lastW ?? undefined,
          rpe: 7
        }));

        return {
          id: `active_ex_${idx}_${Date.now()}`,
          exerciseId: pe.exerciseId,
          name: ex?.name || 'Exercício Desconhecido',
          muscleGroup: ex?.muscleGroup || 'Corpo Todo',
          sets,
          notes: ''
        };
      });
    } else {
      // Treino livre inicializado com 1 exercício padrão
      const defaultEx = exercises[0];
      // GOAL-08: ANT real do histórico; sem slot não há sugestão do motor (SUG = —)
      const lastW = lastRecordedWeight(exerciseHistoryFor(defaultEx.id));
      activeExs = [{
        id: `active_ex_0_${Date.now()}`,
        exerciseId: defaultEx.id,
        name: defaultEx.name,
        muscleGroup: defaultEx.muscleGroup,
        sets: [{
          id: `set_0_0`,
          reps: 10,
          weight: lastW ?? 10,
          completed: false,
          suggestedWeight: undefined,
          lastWeight: lastW ?? undefined,
          rpe: 7
        }],
        notes: ''
      }];
    }

    setActiveWorkout({
      id: `session_${Date.now()}`,
      name: workoutName,
      date: new Date().toISOString().split('T')[0],
      duration: 0,
      calories: 0,
      exercises: activeExs,
      xpEarned: 0,
      ...sessionOrigin,
    });
    setActiveWorkoutStartedAt(Date.now());
    setWorkoutDuration(0);
    setActiveView('active-workout');
  };

  // GOAL-15: atualização 100% imutável (updater funcional) — cada edição gera um
  // novo objeto activeWorkout, disparando o efeito de persistência (sobrevive a
  // refresh). Antes o array de séries era mutado no lugar em vários pontos.
  const updateWorkoutSet = (exerciseIndex: number, setIndex: number, fields: Partial<WorkoutSet>) => {
    setActiveWorkout((prev) => {
      if (!prev) return prev;
      const currentSet = prev.exercises[exerciseIndex]?.sets[setIndex];
      if (!currentSet) return prev;
      const changed = (Object.keys(fields) as (keyof WorkoutSet)[]).some(
        (field) => !Object.is(currentSet[field], fields[field]),
      );
      if (!changed) return prev;
      const exercises = prev.exercises.map((ex, i) =>
        i === exerciseIndex
          ? { ...ex, sets: ex.sets.map((s, j) => (j === setIndex ? { ...s, ...fields } : s)) }
          : ex
      );
      return { ...prev, exercises };
    });
  };

  // GOAL-15: séries e exercícios do Treino Ativo agora são editados de forma
  // imutável e centralizada aqui — antes ActiveWorkoutPage/ExerciseLibrary
  // mutavam o array em memória e algumas mudanças (ex.: adicionar exercício pela
  // biblioteca) não chamavam setActiveWorkout, então não salvavam nem apareciam.
  const addSetToActiveExercise = (exerciseIndex: number) => {
    setActiveWorkout((prev) => {
      if (!prev) return prev;
      if (!prev.exercises[exerciseIndex]) return prev;
      const exercises = prev.exercises.map((ex, i) => {
        if (i !== exerciseIndex) return ex;
        const lastSet = ex.sets[ex.sets.length - 1];
        const newSet: WorkoutSet = {
          id: `set_${i}_${ex.sets.length}_${Date.now()}`,
          reps: lastSet ? lastSet.reps : 10,
          weight: lastSet ? lastSet.weight : 0,
          completed: false,
          rpe: lastSet?.rpe,
          suggestedWeight: lastSet?.suggestedWeight,
          lastWeight: lastSet?.lastWeight
        };
        return { ...ex, sets: [...ex.sets, newSet] };
      });
      return { ...prev, exercises };
    });
  };

  const removeSetFromActiveExercise = (exerciseIndex: number) => {
    setActiveWorkout((prev) => {
      if (!prev) return prev;
      const currentExercise = prev.exercises[exerciseIndex];
      if (!currentExercise || currentExercise.sets.length <= 1) return prev;
      const exercises = prev.exercises.map((ex, i) =>
        i === exerciseIndex ? { ...ex, sets: ex.sets.slice(0, -1) } : ex
      );
      return { ...prev, exercises };
    });
  };

  const addExerciseToActiveWorkout = (exerciseId: string) => {
    const meta = exercises.find((e) => e.id === exerciseId);
    if (!meta) return;
    // ANT real do histórico (GOAL-08) para pré-preencher a carga do novo exercício.
    const lastW = lastRecordedWeight(exerciseHistoryFor(exerciseId));
    const stamp = Date.now();
    setActiveWorkout((prev) => {
      if (!prev) return prev;
      const idx = prev.exercises.length;
      const sets: WorkoutSet[] = Array.from({ length: 3 }, (_, sIdx) => ({
        id: `set_${idx}_${sIdx}_${stamp}`,
        reps: 10,
        weight: lastW ?? 0,
        completed: false,
        lastWeight: lastW ?? undefined
      }));
      const newExercise: ActiveExercise = {
        id: `active_ex_${idx}_${stamp}`,
        exerciseId,
        name: meta.name,
        muscleGroup: meta.muscleGroup,
        sets,
        notes: ''
      };
      return { ...prev, exercises: [...prev.exercises, newExercise] };
    });
    toast.success(`"${meta.name}" adicionado ao treino ativo.`);
  };

  const removeExerciseFromActiveWorkout = (exerciseIndex: number) => {
    setActiveWorkout((prev) => {
      // Mantém pelo menos 1 exercício no treino ativo.
      if (!prev || prev.exercises.length <= 1 || !prev.exercises[exerciseIndex]) return prev;
      return { ...prev, exercises: prev.exercises.filter((_, i) => i !== exerciseIndex) };
    });
  };

  const updateExerciseNotes = (exerciseIndex: number, notes: string) => {
    setActiveWorkout((prev) => (
      prev ? updateWorkoutExerciseNotes(prev, exerciseIndex, notes) : prev
    ));
  };

  const completeWorkoutSet = (exerciseIndex: number, setIndex: number) => {
    const currentWorkout = activeWorkoutRef.current;
    if (!currentWorkout) return;
    const transition = toggleWorkoutSetCompletion(currentWorkout, exerciseIndex, setIndex);
    if (!transition.changed) return;
    setActiveWorkout((prev) => {
      if (!prev) return prev;
      return prev === currentWorkout
        ? transition.workout
        : toggleWorkoutSetCompletion(prev, exerciseIndex, setIndex).workout;
    });

    if (transition.completed) {
      // Feedback tátil curto ao concluir série (GOAL-11) — com guarda de suporte.
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(10);
      }
      addXp(10, 'Série concluída!');

      // Timer de descanso automático (GOAL-06): não inicia se essa era a última
      // série pendente do treino inteiro (nada para descansar antes de).
      if (!transition.isLastRemainingSet && transition.targetExercise) {
        const targetExercise = transition.targetExercise;
        const meta = exercises.find((e) => e.id === targetExercise.exerciseId);
        // GOAL-07: o restSec do ExerciseSlot tem prioridade sobre o restSec do
        // exercício e sobre o padrão do usuário. restSec 0 (ex.: cardio) = sem timer.
        const seconds = targetExercise.restSec ?? meta?.restSec ?? user?.restTimerDefaultSeconds ?? 90;
        if (seconds > 0) {
          setRestTimerEndAt(Date.now() + seconds * 1000);
          setRestTimerTotalSeconds(seconds);
          setRestTimerLabel(targetExercise.name);
        }
      }
    }
  };

  // Botão "+30s" (GOAL-06): estende o descanso atual mantendo o mesmo comportamento
  // visual de sempre reiniciar a barra de progresso a partir do novo total.
  const extendRestTimer = (deltaSeconds: number) => {
    if (!restTimerEndAt) return;
    const remaining = Math.max(0, Math.ceil((restTimerEndAt - Date.now()) / 1000)) + deltaSeconds;
    setRestTimerEndAt(Date.now() + remaining * 1000);
    setRestTimerTotalSeconds(remaining);
  };

  const skipRestTimer = () => {
    setRestTimerEndAt(null);
    setRestTimerTotalSeconds(null);
    setRestTimerLabel(null);
  };

  const swapExerciseInActiveWorkout = (exerciseIndex: number, newExerciseId: string, reason?: string) => {
    const currentWorkout = activeWorkoutRef.current;
    if (!currentWorkout) return;
    const newEx = exercises.find((e) => e.id === newExerciseId);
    if (!newEx) return;
    const currentExercise = currentWorkout.exercises[exerciseIndex];
    if (!currentExercise || currentExercise.exerciseId === newExerciseId) return;
    const nextWorkout = swapWorkoutExercise(currentWorkout, exerciseIndex, newEx);
    setActiveWorkout((prev) => {
      if (!prev) return prev;
      return prev === currentWorkout
        ? nextWorkout
        : swapWorkoutExercise(prev, exerciseIndex, newEx);
    });
    const reasonMsg = reason ? ` devido a ${reason}` : '';
    addXp(20, 'Substituição de exercício executada');
    toast.success(`Substituição aplicada sem alterar o objetivo muscular do treino: ${currentExercise.name} -> ${newEx.name}${reasonMsg}.`);
  };

  const adaptActiveWorkoutForCrowdedGym = () => {
    const currentWorkout = activeWorkoutRef.current;
    if (!currentWorkout) return;
    const adaptation = adaptWorkoutForCrowdedGym(currentWorkout, exercises);
    if (adaptation.replacementCount > 0) {
      setActiveWorkout((prev) => {
        if (!prev) return prev;
        return prev === currentWorkout
          ? adaptation.workout
          : adaptWorkoutForCrowdedGym(prev, exercises).workout;
      });
      addXp(100, 'Treino adaptado: Academia Cheia!');
      unlockAchievement('ach_17');
      toast.success(`Academia Lotada: Substituímos ${adaptation.replacementCount} exercícios em aparelhos por pesos livres (halteres/peso corporal) de mesma ativação muscular.`);
    } else {
      toast.info('Seu treino já é composto por pesos livres ou não há aparelhos de trilhos mecânicos para adaptar.');
    }
  };

  const finishWorkout = (rpe: number) => {
    const workoutToFinish = activeWorkoutRef.current;
    if (!workoutToFinish || !user) return;

    const minutes = Math.ceil(workoutDuration / 60);
    const kcalPerMinute = rpe >= 8 ? 8.5 : rpe >= 5 ? 6.5 : 4.5;
    const caloriesBurned = Math.round(minutes * kcalPerMinute);

    const completedSetsCount = workoutToFinish.exercises.reduce((acc, ex) => {
      return acc + ex.sets.filter((s) => s.completed).length;
    }, 0);

    // Calcular volume levantado
    const totalVolume = workoutToFinish.exercises.reduce((acc, ex) => {
      return acc + ex.sets.filter(s => s.completed).reduce((sAcc, s) => sAcc + (s.reps * s.weight), 0);
    }, 0);

    const finalXp = 100 + (completedSetsCount * 5) + (totalVolume > 5000 ? 50 : 0);

    // Detecção de PRs fictícios
    const prsDetected: string[] = [];
    workoutToFinish.exercises.forEach(ex => {
      const bestSet = ex.sets.filter(s => s.completed).reduce((best, s) => s.weight > best ? s.weight : best, 0);
      if (bestSet >= 100 && ex.exerciseId === 'chest_supino_reto') {
        prsDetected.push('Supino Reto 100kg');
        unlockAchievement('ach_2');
      }
      if (bestSet >= 140 && ex.exerciseId === 'legs_agachamento_barra') {
        prsDetected.push('Agachamento 140kg');
        unlockAchievement('ach_7');
      }
      if (bestSet >= 100 && ex.exerciseId === 'glutes_elevacao_pelvica') {
        prsDetected.push('Elevação Pélvica 100kg');
        unlockAchievement('ach_8');
      }
    });

    const finalSession: WorkoutSession = {
      ...workoutToFinish,
      duration: workoutDuration,
      calories: caloriesBurned,
      xpEarned: finalXp,
      totalVolume,
      prsDetected
    };

    setWorkoutHistory((prev) => [finalSession, ...prev]);
    addXp(finalXp, `Treino Concluído! +${caloriesBurned} kcal gastas`);

    // Marcar no planejador semanal que treinou hoje
    markDayTrained(getTodayDayName());

    // Atualiza o streak do usuário
    const todayStr = new Date().toISOString().split('T')[0];
    setUser((prev) => {
      if (!prev) return null;
      let newStreak = prev.streak;
      if (prev.lastWorkoutDate !== todayStr) {
        newStreak = prev.streak + 1;
      }
      return {
        ...prev,
        streak: newStreak,
        lastWorkoutDate: todayStr
      };
    });

    // Conquistas
    unlockAchievement('ach_1');
    if (totalVolume >= 10000) {
      unlockAchievement('ach_18');
    }

    // Progresso dos desafios
    setChallenges((prev) =>
      prev.map((c) => {
        if (c.id === 'chal_1') {
          const newProgress = Math.min(100, c.progress + 15);
          return { ...c, progress: newProgress, completed: newProgress >= 100 };
        }
        if (c.id === 'chal_4') {
          const newProgress = Math.min(100, c.progress + Math.round((caloriesBurned / 3000) * 100));
          return { ...c, progress: newProgress, completed: newProgress >= 100 };
        }
        if (c.id === 'chal_5') {
          const newProgress = Math.min(100, c.progress + Math.round((totalVolume / 5000) * 100));
          return { ...c, progress: newProgress, completed: newProgress >= 100 };
        }
        return c;
      })
    );

    addPost(
      `Treino finalizado! Concluí "${workoutToFinish.name}" em ${minutes} minutos. Volume total: ${totalVolume}kg. ${prsDetected.length > 0 ? `🚀 PRs Batidos: ${prsDetected.join(', ')}!` : ''} 🔥 #GymFlow #Fitness`,
      'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=600&auto=format&fit=crop'
    );

    setActiveWorkout(null);
    setActiveWorkoutStartedAt(null);
    setWorkoutDuration(0);
    setRestTimerEndAt(null);
    setRestTimerTotalSeconds(null);
    setRestTimerLabel(null);
    setActiveView('dashboard');
  };

  const cancelWorkout = () => {
    setActiveWorkout(null);
    setActiveWorkoutStartedAt(null);
    setWorkoutDuration(0);
    setRestTimerEndAt(null);
    setRestTimerTotalSeconds(null);
    setRestTimerLabel(null);
    setActiveView('dashboard');
  };

  // Planner functions
  // GOAL-07: a semana gerada referencia Days reais de um programa (não mais
  // templates soltos sem exercícios). Cada dia do calendário carrega
  // programId + programDayId, e abrir o dia inicia exatamente aqueles slots.
  const generateWeeklyPlan = (goal: string, level: string, gender: string, frequency: number) => {
    const program = selectProgramForProfile(programs, goal, level, gender);
    if (!program) {
      toast.error('Nenhum programa disponível para gerar a semana.');
      return;
    }
    const adjustedDays = buildWeekFromProgram(program, frequency, exercises);

    setWeeklyPlan(adjustedDays);
    addXp(150, `Ficha Semanal gerada pela IA Coach com o programa "${program.name}"!`);
  };

  // GOAL-07: atribui um programa específico à semana (usado nos Programas de Treino).
  const applyProgramToWeek = (programId: string) => {
    const program = allPrograms.find((p) => p.id === programId);
    if (!program) {
      toast.error('Programa não encontrado.');
      return;
    }
    const daysResolution = resolveProgramDays(program);
    if (daysResolution.kind === 'legacy-flat') {
      toast.error('Este programa antigo ainda não possui dias para planejar. Use como base e salve no novo formato.');
      return;
    }
    if (daysResolution.kind === 'empty') {
      toast.error('Programa sem dias estruturados para planejar a semana.');
      return;
    }
    const frequency = user?.frequency ?? program.frequencyDays;
    const adjustedDays = buildWeekFromProgram(program, frequency, exercises);

    setWeeklyPlan(adjustedDays);
    addXp(100, `Programa "${program.name}" atribuído à sua semana!`);
    toast.success(`Semana planejada com "${program.name}". Cada dia abre o treino real daquele dia.`);
    setActiveView('planner');
  };

  // GOAL-10.5: atribui UM Day real (de qualquer programa, sugerido ou custom) a um
  // dia específico da semana — diferente de applyProgramToWeek, não regenera os
  // outros dias. Usado pelo botão "Escolher treino" do Planejador.
  const assignDayToWeekday = (dayName: string, program: WorkoutProgram, day: ProgramDay) => {
    const estimate = estimateWorkoutDuration(day.slots);
    const dayLabel = programDayDisplayLabel(day);
    setWeeklyPlan((currentPlan) => currentPlan.map((plannedDay) =>
      plannedDay.dayName === dayName
        ? {
            ...plannedDay,
            workoutName: dayLabel,
            muscleGroups: muscleGroupsForSlots(day.slots, exercises),
            duration: estimate.minutes,
            exerciseCount: estimate.exerciseCount,
            isRest: false,
            programId: program.id,
            programDayId: day.id,
            planningIssue: undefined,
            trained: false
          }
        : plannedDay
    ));
    toast.success(`"${dayLabel}" planejado para ${dayName}.`);
  };

  // GOAL-10.5: cria ou atualiza (upsert por id) um treino do Construtor manual.
  const saveCustomProgram = (program: WorkoutProgram) => {
    // O dispatch canônico atualiza customProgramsRef imediatamente; startWorkout
    // encontra nome/dia/origem completos no mesmo evento de "salvar e iniciar".
    setCustomPrograms((prev) => upsertWorkoutProgram(prev, program));
    const reconciliation = reconcileWeeklyPlanWithProgram(
      weeklyPlanRef.current,
      program,
      exercises,
    );
    setWeeklyPlan(reconciliation.weeklyPlan);
    if (reconciliation.invalidatedDayNames.length > 0) {
      toast.info('O dia usado neste planejamento foi removido do programa. Escolha novamente um treino.');
    }
    // GOAL-10.6: guarda qual foi o último salvo para "Meus Treinos" destacar/posicionar.
    setLastSavedProgramId(program.id);
  };

  const openWorkoutBuilder = (
    draft?: WorkoutBuilderDraft,
    returnView: AppView = 'planner',
    creationStep?: BuilderCreationStep,
  ) => {
    setBuilderDraft(draft ?? null);
    setBuilderReturnView(returnView);
    setBuilderCreationStep(creationStep ?? null);
    setActiveView('workout-builder');
  };

  // GOAL-19B: exclusão real de programa customizado.
  //
  // Só programas customizados podem ser excluídos (seed nunca). O histórico
  // e a sessão ativa são snapshots com origem opcional deliberadamente preservada.
  // Apenas referências futuras do weeklyPlan são invalidadas; dias treinados permanecem
  // integrais. Ver docs/builder/GYMFLOW_GUIDED_WORKOUT_CREATION.md.
  const deleteCustomProgram = (programId: string) => {
    const target = customProgramsRef.current.find((program) => program.id === programId);
    if (!target) {
      toast.error('Só é possível excluir treinos personalizados.');
      return;
    }
    setCustomPrograms((prev) => removeProgramFromList(prev, programId));
    setWeeklyPlan((prev) => clearProgramFromWeeklyPlan(prev, programId));
    setLastSavedProgramId((prev) => (prev === programId ? null : prev));
    toast.success(`"${target.name}" foi excluído dos seus treinos.`);
  };

  // GOAL-19B: duplica um programa customizado — cópia editável, novos ids, "— Cópia".
  const duplicateProgram = (programId: string) => {
    const target = customProgramsRef.current.find((program) => program.id === programId);
    if (!target) {
      toast.error('Só é possível duplicar treinos personalizados.');
      return;
    }
    const copy = duplicateWorkoutProgram(target);
    saveCustomProgram(copy);
    setWorkoutsTab('mine');
    toast.success(`Cópia criada: "${copy.name}".`);
  };

  // GOAL-19B: "Usar como base" — cria um custom novo (novos ids) a partir de qualquer
  // programa (seed ou custom) e abre no Construtor para edição. O original fica intacto.
  const createProgramFromBase = (programId: string) => {
    const target = [...programs, ...customProgramsRef.current]
      .find((program) => program.id === programId);
    if (!target) {
      toast.error('Programa não encontrado.');
      return;
    }
    const derived = deriveCustomProgramFromSeed(target);
    saveCustomProgram(derived);
    const firstDay = getProgramDays(derived)[0];
    const volumeProfile = firstDay?.volumeProfile ?? 'standard';
    openWorkoutBuilder(
      {
        programId: derived.id,
        dayId: firstDay?.id,
        name: derived.name,
        level: derived.level,
        volumeProfile,
        targetMinutes: firstDay?.targetMinutes ?? user?.duration ?? defaultTargetMinutes(volumeProfile),
        slots: [],
      },
      'workouts',
    );
    toast.success(`"${derived.name}" criado a partir de um modelo — edite à vontade.`);
  };

  // GOAL-10.6: "Escolher treino para hoje" (Dashboard) reaproveita o mesmo seletor
  // já usado no Planejador — só navega para lá e diz qual dia deve abrir o modal.
  const openProgramChooserForDay = (dayName: string) => {
    setChooserDayName(dayName);
    setActiveView('planner');
  };

  const replanMissedWorkout = () => {
    const currentPlan = weeklyPlanRef.current;
    if (currentPlan.length === 0) return;

    const curDayName = getTodayDayName();
    const targetDayIdx = currentPlan.findIndex(d => d.dayName === curDayName);

    if (targetDayIdx !== -1) {
      const updated = [...currentPlan];
      const nextRestIdx = updated.findIndex((d, idx) => idx > targetDayIdx && d.isRest);
      if (nextRestIdx !== -1) {
        const missedWorkout = { ...updated[targetDayIdx] };
        const restDay = { ...updated[nextRestIdx] };

        updated[targetDayIdx] = { ...restDay, dayName: missedWorkout.dayName, trained: false };
        updated[nextRestIdx] = { ...missedWorkout, dayName: restDay.dayName, trained: false };

        setWeeklyPlan(updated);
        addXp(80, 'Semana replanejada pela IA Coach!');
        toast.success(`IA Coach Reorganizou: O treino de ${missedWorkout.dayName} foi adiado para ${restDay.dayName} para respeitar a sua recuperação muscular.`);
      } else {
        toast.info('Não há dias de descanso disponíveis esta semana para adiar seu treino.');
      }
    } else {
      toast.error('Não foi possível identificar o dia atual.');
    }
  };

  const markDayTrained = (dayName: string) => {
    setWeeklyPlan((prev) => prev.map((day) => (
      day.dayName === dayName ? { ...day, trained: true } : day
    )));
  };

  // Evolution Metric Loggers
  const addWeightLog = (weight: number) => {
    const today = new Date().toISOString().split('T')[0];
    setWeightHistory((prev) => [{ date: today, value: weight }, ...prev]);
    if (user) {
      setUser((prev) => prev ? { ...prev, weight } : null);
    }
    addXp(30, 'Novo peso corporal registrado');
  };

  const addMeasurementLog = (chest: number, waist: number, hips: number, arms: number) => {
    const today = new Date().toISOString().split('T')[0];
    setMeasurementsHistory((prev) => [{ date: today, chest, waist, hips, arms }, ...prev]);
    addXp(40, 'Medidas corporais atualizadas');
  };

  // Nutrition trackers
  const logWater = (amountMl: number) => {
    setNutrition((prev) => ({
      ...prev,
      water: prev.water + amountMl
    }));
    if (user) {
      setUser((prev) => {
        if (!prev) return null;
        const newWater = prev.waterIntake + amountMl;
        if (newWater >= prev.waterGoal && prev.waterIntake < prev.waterGoal) {
          unlockAchievement('ach_4');
          addXp(50, '💧 Meta Diária de Água Batida!');
        }
        return {
          ...prev,
          waterIntake: newWater
        };
      });
    }
  };

  const logMacros = (calories: number, protein: number, carbs: number, fat: number) => {
    setNutrition((prev) => ({
      calories: prev.calories + calories,
      protein: prev.protein + protein,
      carbs: prev.carbs + carbs,
      fat: prev.fat + fat,
      water: prev.water
    }));
    addXp(20, 'Alimento registrado na dieta');
  };

  // Community Feed
  const likePost = (postId: string) => {
    setCommunityPosts((prev) =>
      prev.map((post) => {
        if (post.id === postId) {
          const liked = !post.userLiked;
          return {
            ...post,
            likes: liked ? post.likes + 1 : post.likes - 1,
            userLiked: liked
          };
        }
        return post;
      })
    );
  };

  const commentOnPost = (postId: string, text: string) => {
    if (!text.trim()) return;
    const newComment = {
      id: `comm_${Date.now()}`,
      authorName: user?.name || 'Membro do GymFlow',
      authorAvatar: '🏋️',
      content: text,
      time: 'Agora mesmo'
    };
    setCommunityPosts((prev) =>
      prev.map((post) => {
        if (post.id === postId) {
          return {
            ...post,
            comments: [...post.comments, newComment]
          };
        }
        return post;
      })
    );
    addXp(5, 'Comentário enviado no feed');
  };

  const addPost = (content: string, image?: string) => {
    if (!content.trim()) return;
    const newPost: CommunityPost = {
      id: `post_${Date.now()}`,
      authorName: user?.name || 'Rafael Silveira (Demo)',
      authorAvatar: '🚀',
      time: 'Agora mesmo',
      content,
      image,
      likes: 0,
      comments: [],
      userLiked: false,
      shares: 0
    };
    setCommunityPosts((prev) => [newPost, ...prev]);
    addXp(25, 'Nova postagem no feed da comunidade');
  };

  const sharePost = (postId: string) => {
    setCommunityPosts((prev) =>
      prev.map((post) => {
        if (post.id === postId) {
          return {
            ...post,
            shares: (post.shares || 0) + 1
          };
        }
        return post;
      })
    );
  };

  // Gamification achievements unlocking
  const unlockAchievement = (id: string) => {
    setAchievements((prev) =>
      prev.map((a) => {
        if (a.id === id && !a.unlocked) {
          addXp(150, `🏆 Conquista Desbloqueada: ${a.name}!`);
          return {
            ...a,
            unlocked: true,
            unlockedAt: new Date().toISOString().split('T')[0]
          };
        }
        return a;
      })
    );
  };

  // Videos learned state
  const markVideoLearned = (id: string) => {
    setVideos((prev) =>
      prev.map((v) => {
        if (v.id === id && !v.learned) {
          addXp(50, `🎓 Vídeo Aprendido: ${v.title}`);
          return {
            ...v,
            learned: true,
            progressPercent: 100
          };
        }
        return v;
      })
    );
  };

  const updateVideoProgress = (id: string, progress: number) => {
    setVideos((prev) =>
      prev.map((v) => {
        if (v.id === id) {
          const isNowLearned = progress >= 100 && !v.learned;
          if (isNowLearned) {
            addXp(50, `🎓 Vídeo Aprendido: ${v.title}`);
          }
          return {
            ...v,
            progressPercent: progress,
            learned: v.learned || progress >= 100
          };
        }
        return v;
      })
    );
  };

  const openGlobalPlayer = (videoId: string) => {
    setActiveVideoLessonId(videoId);
    setGlobalPlayerOpen(true);
    addRecentlyViewedVideo(videoId);
  };

  const closeGlobalPlayer = () => {
    setGlobalPlayerOpen(false);
  };

  const toggleFavoriteExercise = (id: string) => {
    setFavoriteExercises((prev) =>
      prev.includes(id) ? prev.filter((fid) => fid !== id) : [...prev, id]
    );
  };

  const addRecentlyViewedVideo = (id: string) => {
    setRecentlyViewedVideoIds((prev) => {
      const filtered = prev.filter((vid) => vid !== id);
      return [id, ...filtered].slice(0, 5);
    });
  };

  // Admin methods
  const addNewExercise = (exercise: Exercise) => {
    setExercises((prev) => [exercise, ...prev]);
    addXp(100, `Admin: Exercício "${exercise.name}" adicionado com sucesso!`);
    unlockAchievement('ach_16');
  };

  const deleteExercise = (id: string) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
  };

  // AI Chat Logic
  const sendChatMessage = (text: string) => {
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date()
    };

    setChatMessages((prev) => [...prev, userMsg]);

    setTimeout(() => {
      let reply = '';
      let workoutSuggestion: ChatMessage['workoutSuggestion'];
      let actionCard: ChatActionCard | undefined;
      const normalized = text.toLowerCase();
      
      if (normalized.includes('ontem') && (normalized.includes('supino') || normalized.includes('peito'))) {
        reply = 'Você executou o treino de peito ontem com um volume acumulado de 3.200kg. Seus deltóides anteriores e tríceps estão atualmente em processo de reconstrução (fadiga de 60%). Quer abrir a aula de retração escapular no Supino Reto para revisar a técnica e otimizar a sua postura para o próximo treino?';
        actionCard = {
          label: 'Revisar Técnica do Supino',
          actionType: 'watch-video',
          payload: 'vid_supino_1'
        };
      } else if (normalized.includes('fatigado') || normalized.includes('dor de perna') || normalized.includes('quadríceps')) {
        reply = 'Seu quadríceps ainda parece fatigado do treino anterior (nível de recuperação em 20%). Treinar por cima de um músculo não regenerado prejudica a hipertrofia e aumenta o risco de lesões patelares. Sugiro fazer uma aula técnica de mobilidade para oxigenar as fibras musculares:';
        actionCard = {
          label: 'Fazer Mobilidade de Quadril',
          actionType: 'watch-video',
          payload: 'vid_agachamento_3'
        };
      } else if (normalized.includes('trocar leg press') || normalized.includes('trocar legpress') || normalized.includes('goblet')) {
        reply = 'Com certeza! O Leg Press 45° trabalha fortemente os quadríceps de forma guiada, mas se a máquina estiver ocupada ou você quiser mais trabalho de core, o Goblet Squat com haltere é um excelente substituto livre. Quer trocar agora no treino ativo?';
        actionCard = {
          label: 'Adaptar para Academia Cheia',
          actionType: 'crowded-gym'
        };
      } else if (normalized.includes('treino de hoje') || normalized.includes('treino de hj')) {
        reply = 'Montei o seu treino de hoje considerando seu perfil e a recuperação muscular. Veja a sugestão e inicie quando quiser:';
        workoutSuggestion = {
          name: 'GymFlow AI — Treino de Hoje',
          exercises: [
            { name: 'Supino Reto com Barra', sets: 4, reps: '8-10' },
            { name: 'Remada Curvada', sets: 4, reps: '10' },
            { name: 'Agachamento Livre', sets: 3, reps: '10' },
            { name: 'Desenvolvimento de Ombros', sets: 3, reps: '12' }
          ]
        };
        actionCard = {
          label: 'Iniciar Treino de Hoje',
          actionType: 'start-workout',
          payload: 'prog_int_1'
        };
      } else if (normalized.includes('gerar minha semana') || normalized.includes('gerar semana')) {
        reply = 'Entendido! Vou estruturar sua planilha de treino semanal com base nas suas metas e perfil. Clique no botão abaixo para gerar com a IA Coach!';
        actionCard = {
          label: 'Gerar Semana com IA',
          actionType: 'generate-week'
        };
      } else if (normalized.includes('perdi o treino') || normalized.includes('perdi treino')) {
        reply = 'Sem problemas, imprevistos acontecem! O descanso também faz parte do ganho. Clique abaixo para ativar o replanejador, movendo os treinos e garantindo o descanso muscular correto.';
        actionCard = {
          label: 'Replanejar Semana',
          actionType: 'replan-missed'
        };
      } else if (normalized.includes('academia está cheia') || normalized.includes('academia cheia')) {
        reply = 'Horário de pico? Não se preocupe! Clique abaixo para trocar instantaneamente todos os exercícios em aparelhos/máquinas por pesos livres equivalentes no seu treino ativo.';
        actionCard = {
          label: 'Adaptar para Academia Cheia',
          actionType: 'crowded-gym'
        };
      } else if (normalized.includes('dor muscular') || normalized.includes('dor de perna')) {
        reply = 'A dor tardia é normal, mas treinar por cima com dor extrema prejudica os ganhos. Hoje recomendo focar em mobilidade e flexibilidade para oxigenar as fibras. Assista nossa videoaula de mobilidade:';
        actionCard = {
          label: 'Assistir Aula de Mobilidade',
          actionType: 'watch-video',
          payload: 'vid_agachamento_3'
        };
      } else if (normalized.includes('feminino glúteo') || normalized.includes('feminino')) {
        reply = 'Excelente foco! Projetei uma planilha dedicada a glúteos e pernas com alto índice de ativação. Veja o treino sugerido:';
        workoutSuggestion = {
          name: 'GymFlow AI - Pernas & Glúteos Premium',
          exercises: [
            { name: 'Elevação Pélvica', sets: 4, reps: '10-12' },
            { name: 'Agachamento Livre', sets: 4, reps: '8' },
            { name: 'Stiff com Barra', sets: 3, reps: '10' }
          ]
        };
        actionCard = {
          label: 'Iniciar Ficha de Glúteos',
          actionType: 'start-workout',
          payload: 'prog_int_2'
        };
      } else if (normalized.includes('masculino hipertrofia') || normalized.includes('masculino')) {
        reply = 'Bora! Montei um split focado em hipertrofia de superiores (peitoral, dorsais e tríceps). Veja o cronograma:';
        workoutSuggestion = {
          name: 'GymFlow AI - Hipertrofia Superior Express',
          exercises: [
            { name: 'Supino Reto com Barra', sets: 4, reps: '10' },
            { name: 'Remada Curvada com Barra', sets: 4, reps: '10' },
            { name: 'Desenvolvimento de Ombros', sets: 3, reps: '10' }
          ]
        };
        actionCard = {
          label: 'Iniciar Ficha Masculina',
          actionType: 'start-workout',
          payload: 'prog_int_1'
        };
      } else if (normalized.includes('30 minutos') || normalized.includes('30 min')) {
        reply = 'Sem tempo a perder! Removi os acessórios de baixo impacto e estruturei um circuito FullBody de 30 minutos focando nos grandes grupos musculares. Veja:';
        workoutSuggestion = {
          name: 'GymFlow AI - 30 Minutos FullBody Express',
          exercises: [
            { name: 'Leg Press 45°', sets: 3, reps: '15' },
            { name: 'Supino Reto com Barra', sets: 3, reps: '10' },
            { name: 'Prancha Isométrica', sets: 3, reps: '40s' }
          ]
        };
        actionCard = {
          label: 'Iniciar Treino 30m',
          actionType: 'start-workout',
          payload: 'prog_beg_4'
        };
      } else if (normalized.includes('supino') || normalized.includes('peito')) {
        reply = 'Você executou treinos de empurrar ontem. Quer revisar a técnica de retração escapular no Supino Reto para proteger os ombros e focar a ativação no peitoral? Assista à aula com a Profª Juliana Silva:';
        actionCard = {
          label: 'Revisar Técnica do Supino',
          actionType: 'watch-video',
          payload: 'vid_supino_1'
        };
      } else if (normalized.includes('agachamento') || normalized.includes('perna')) {
        reply = 'O agachamento livre é fantástico, mas requer bom alinhamento articular. Seus quadríceps parecem fatigados, então preste atenção especial ao controle dinâmico dos joelhos nesta aula:';
        actionCard = {
          label: 'Ver Postura do Agachamento',
          actionType: 'watch-video',
          payload: 'vid_agachamento_2'
        };
      } else if (normalized.includes('remada') || normalized.includes('costas')) {
        reply = 'Para treinar dorsais sem sobrecarregar a lombar, alinhar o tronco em 45° na remada curvada é fundamental. Assista à aula de biomecânica com o Prof. Felipe Neves:';
        actionCard = {
          label: 'Assistir Aula de Remada',
          actionType: 'watch-video',
          payload: 'vid_remada_1'
        };
      } else if (normalized.includes('trocar exercício') || normalized.includes('trocar')) {
        reply = 'Para substituir qualquer exercício, você pode clicar em "Trocar" na sua planilha de treino ativa, ou abrir a biblioteca para ver variações equivalentes.';
        actionCard = {
          label: 'Abrir Biblioteca de Exercícios',
          actionType: 'watch-video',
          payload: 'exercises'
        };
      } else if (normalized.includes('aquecimento')) {
        reply = 'Um aquecimento dinâmico ativa as articulações e previne estiramentos. Assista nosso tutorial de 4 minutos:';
        actionCard = {
          label: 'Assistir Aula de Aquecimento',
          actionType: 'watch-video',
          payload: 'vid_5'
        };
      } else if (normalized.includes('alongamento')) {
        reply = 'O alongamento ajuda na flexibilidade e regeneração pós-treino. Assista ao nosso guia de pós-treino:';
        actionCard = {
          label: 'Assistir Aula de Alongamento',
          actionType: 'watch-video',
          payload: 'vid_7'
        };
      } else {
        reply = 'Excelente colocação! Mantenha a cadência de 2 segundos na descida de todas as séries pesadas hoje para recrutar mais fibras do peitoral/glúteos. Se quiser, peça para eu gerar seu treino ou semana!';
      }

      const aiMsg: ChatMessage = {
        id: `msg_ai_${Date.now()}`,
        sender: 'ai',
        text: reply,
        timestamp: new Date(),
        workoutSuggestion,
        actionCard
      };

      setChatMessages((prev) => [...prev, aiMsg]);
      addXp(10, 'Conversou com o IA Coach');
    }, 1000);
  };

  const clearChat = () => {
    setChatMessages([
      {
        id: 'welcome',
        sender: 'ai',
        text: 'Olá! Sou o seu Coach Pessoal de Inteligência Artificial GymFlow AI. Como posso ajudar no seu treino hoje?',
        timestamp: new Date()
      }
    ]);
  };

  const finishConfirmedStorageOperation = (
    operation: () => StorageWriteResult<StoragePersistedState>,
    successMessage: string,
  ): StorageWriteResult<PersistedState> => {
    const wasBlocked = storageBlockedRef.current;
    const previousHealth = storageHealth;
    storageBlockedRef.current = true;
    if (pendingSaveRef.current) {
      clearTimeout(pendingSaveRef.current);
      pendingSaveRef.current = null;
    }

    const result = operation();
    if (!result.ok) {
      storageBlockedRef.current = wasBlocked;
      if (wasBlocked) {
        setStorageHealth(previousHealth);
        toast.error('A recuperação falhou; o conteúdo original continua preservado.');
      } else {
        reportWriteResult(result);
      }
      return result as StorageWriteResult<PersistedState>;
    }

    setStorageHealth({ status: 'ready', hasBackup: hasValidBackup() });
    toast.success(successMessage);
    window.setTimeout(() => window.location.reload(), 600);
    return result as StorageWriteResult<PersistedState>;
  };

  const applyStorageImport = (
    backup: GymFlowBackupFile<PersistedState>,
  ): StorageWriteResult<PersistedState> => finishConfirmedStorageOperation(
    () => commitStorageImport(STORAGE_KEY, backup as GymFlowBackupFile<StoragePersistedState>),
    'Backup importado e verificado. Recarregando os dados...',
  );

  const restoreStorageBackup = (): StorageWriteResult<PersistedState> => finishConfirmedStorageOperation(
    () => restoreBackup<StoragePersistedState>(STORAGE_KEY),
    'Backup local restaurado e verificado.',
  );

  const startFreshStorage = (): StorageWriteResult<PersistedState> => finishConfirmedStorageOperation(
    () => saveEnvelopeResult<StoragePersistedState>(
      STORAGE_KEY,
      {
        v: CURRENT_STORAGE_VERSION,
        savedAt: new Date().toISOString(),
        data: initialPersistedStateRef.current,
      },
      { allowOverwriteInvalid: true, source: 'fresh' },
    ),
    'Novo estado local criado com segurança.',
  );

  const downloadStorageRecovery = () => {
    const raw = storageHealth.issue?.raw;
    if (!raw) {
      toast.error('Não há conteúdo bruto disponível para exportar.');
      return;
    }
    const recovery = createRawRecoveryExport(raw);
    downloadTextFile(recovery.content, recovery.filename);
    toast.info(`Conteúdo original exportado (${recovery.bytes.toLocaleString('pt-BR')} bytes).`);
  };

  return (
    <GymFlowContext.Provider
      value={{
        activeView,
        setActiveView,
        registerViewLeaveGuard,
        user,
        loginDemoUser,
        registerUser,
        logout,
        updateUserPremium,
        updateUserProfile,

        exercises,
        programs: allPrograms,
        addNewExercise,
        deleteExercise,

        saveCustomProgram,
        lastSavedProgramId,
        builderDraft,
        builderReturnView,
        openWorkoutBuilder,
        builderCreationStep,
        deleteCustomProgram,
        duplicateProgram,
        createProgramFromBase,

        workoutsTab,
        setWorkoutsTab,
        chooserDayName,
        setChooserDayName,
        openProgramChooserForDay,

        activeWorkout,
        startWorkout,
        updateWorkoutSet,
        updateExerciseNotes,
        completeWorkoutSet,
        addSetToActiveExercise,
        removeSetFromActiveExercise,
        addExerciseToActiveWorkout,
        removeExerciseFromActiveWorkout,
        swapExerciseInActiveWorkout,
        finishWorkout,
        cancelWorkout,
        workoutDuration,
        setWorkoutDuration,
        adaptActiveWorkoutForCrowdedGym,

        restSecondsRemaining,
        restTimerTotalSeconds,
        restTimerLabel,
        extendRestTimer,
        skipRestTimer,

        weeklyPlan,
        setWeeklyPlan,
        todayPlan,
        generateWeeklyPlan,
        applyProgramToWeek,
        assignDayToWeekday,
        replanMissedWorkout,
        markDayTrained,

        workoutHistory,
        weightHistory,
        addWeightLog,
        measurementsHistory,
        addMeasurementLog,

        nutrition,
        logWater,
        logMacros,

        communityPosts,
        likePost,
        commentOnPost,
        addPost,
        sharePost,

        challenges,
        achievements,
        unlockAchievement,
        xpNotifications,
        dismissXpNotification,
        clearXpNotifications,

        activeVideoLessonId,
        globalPlayerOpen,
        openGlobalPlayer,
        closeGlobalPlayer,

        videos,
        trails,
        markVideoLearned,
        updateVideoProgress,
        recentlyViewedVideoIds,
        addRecentlyViewedVideo,

        favoriteExercises,
        toggleFavoriteExercise,

        chatMessages,
        sendChatMessage,
        clearChat,

        storageHealth,
        applyStorageImport,
        restoreStorageBackup,
        startFreshStorage,
        downloadStorageRecovery,
      }}
    >
      {children}
      <StorageRecoveryNotice
        health={storageHealth}
        onExportRaw={downloadStorageRecovery}
        onRestoreBackup={restoreStorageBackup}
        onStartFresh={startFreshStorage}
      />
    </GymFlowContext.Provider>
  );
};

export const useGymFlow = () => {
  const context = useContext(GymFlowContext);
  if (context === undefined) {
    throw new Error('useGymFlow must be used within a GymFlowProvider');
  }
  return context;
};
