'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
  TechniqueTrail
} from '../types';
import {
  MOCK_EXERCISES,
  MOCK_PROGRAMS,
  MOCK_VIDEOS,
  MOCK_CHALLENGES,
  MOCK_ACHIEVEMENTS,
  MOCK_COMMUNITY,
  MOCK_WEEKLY_TEMPLATES,
  MOCK_TRAILS
} from '../mock/data';
import { loadState, saveState, clearState } from '../lib/storage';
import { useToast } from '../components/ui/Toast';

export const STORAGE_KEY = 'gymflow:state:v1';

// Estado persistido em localStorage (somente dados de longa duração — nada de UI).
interface PersistedState {
  user: UserProfile | null;
  weeklyPlan: WeeklyWorkoutDay[];
  activeWorkout: WorkoutSession | null;
  activeWorkoutStartedAt: number | null;
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
  | 'planner';

export interface ChatActionCard {
  label: string;
  actionType: 'start-workout' | 'generate-week' | 'swap-exercise' | 'watch-video' | 'replan-missed' | 'crowded-gym';
  payload?: any;
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

  // Active Workout
  activeWorkout: WorkoutSession | null;
  startWorkout: (programId?: string, customName?: string) => void;
  updateWorkoutSet: (exerciseIndex: number, setIndex: number, fields: Partial<WorkoutSet>) => void;
  updateExerciseNotes: (exerciseIndex: number, notes: string) => void;
  completeWorkoutSet: (exerciseIndex: number, setIndex: number) => void;
  swapExerciseInActiveWorkout: (exerciseIndex: number, newExerciseId: string, reason?: string) => void;
  finishWorkout: (rpe: number) => void;
  cancelWorkout: () => void;
  workoutDuration: number;
  setWorkoutDuration: React.Dispatch<React.SetStateAction<number>>;
  adaptActiveWorkoutForCrowdedGym: () => void;

  // Planner
  weeklyPlan: WeeklyWorkoutDay[];
  setWeeklyPlan: React.Dispatch<React.SetStateAction<WeeklyWorkoutDay[]>>;
  generateWeeklyPlan: (goal: string, level: string, gender: string, frequency: number, duration: number) => void;
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
  xpNotifications: { text: string; xp: number }[];
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
}

const GymFlowContext = createContext<GymFlowContextType | undefined>(undefined);

export const GymFlowProvider = ({ children }: { children: ReactNode }) => {
  const toast = useToast();
  const [activeView, setActiveView] = useState<AppView>('landing');
  const [user, setUser] = useState<UserProfile | null>(null);

  // Lists
  const [exercises, setExercises] = useState<Exercise[]>(MOCK_EXERCISES);
  const [programs, setPrograms] = useState<WorkoutProgram[]>(MOCK_PROGRAMS);
  const [videos, setVideos] = useState<VideoLesson[]>(MOCK_VIDEOS);
  const [challenges, setChallenges] = useState<Challenge[]>(MOCK_CHALLENGES);
  const [achievements, setAchievements] = useState<Achievement[]>(MOCK_ACHIEVEMENTS);
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>(MOCK_COMMUNITY);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyWorkoutDay[]>([]);
  const trails = MOCK_TRAILS;

  // Active workout
  const [activeWorkout, setActiveWorkout] = useState<WorkoutSession | null>(null);
  // Timestamp de início (ms) — fonte da verdade do tempo decorrido; sobrevive a refresh.
  const [activeWorkoutStartedAt, setActiveWorkoutStartedAt] = useState<number | null>(null);
  const [workoutDuration, setWorkoutDuration] = useState<number>(0);

  // Evolution & Metrics
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutSession[]>([]);
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
  const [xpNotifications, setXpNotifications] = useState<{ text: string; xp: number }[]>([]);

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
    } else {
      setWorkoutDuration(0);
    }
    return () => clearInterval(timer);
  }, [activeWorkout, activeWorkoutStartedAt]);

  // ===== Persistência local-first (GOAL-01) — envelope versionado, sem backend =====
  // `hydrated` evita que o primeiro render sobrescreva os dados salvos com os defaults.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let saved = loadState<PersistedState>(STORAGE_KEY);

    // Migração das chaves legadas (gymflow_user / gymflow_weeklyPlan) para o novo envelope.
    if (!saved) {
      try {
        const legacyUser = window.localStorage.getItem('gymflow_user');
        if (legacyUser) {
          const parsedUser: UserProfile = JSON.parse(legacyUser);
          const legacyPlan = window.localStorage.getItem('gymflow_weeklyPlan');
          saved = {
            user: parsedUser,
            weeklyPlan: legacyPlan ? JSON.parse(legacyPlan) : (parsedUser.weeklyPlan || []),
            activeWorkout: null,
            activeWorkoutStartedAt: null,
            workoutHistory: [],
            weightHistory: [],
            measurementsHistory: [],
            nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
            achievements: [],
            challenges: [],
            favoriteExercises: [],
            recentlyViewedVideoIds: []
          };
        }
      } catch {
        /* legado corrompido — ignorar */
      }
    }
    try {
      window.localStorage.removeItem('gymflow_user');
      window.localStorage.removeItem('gymflow_weeklyPlan');
    } catch {
      /* ignorar */
    }

    if (saved) {
      // Aplica o estado salvo por cima dos defaults, campo a campo, para que
      // dados parciais/antigos não derrubem o app.
      if (saved.user) setUser(saved.user);
      if (Array.isArray(saved.weeklyPlan) && saved.weeklyPlan.length > 0) setWeeklyPlan(saved.weeklyPlan);
      if (Array.isArray(saved.workoutHistory) && saved.workoutHistory.length > 0) setWorkoutHistory(saved.workoutHistory);
      if (Array.isArray(saved.weightHistory) && saved.weightHistory.length > 0) setWeightHistory(saved.weightHistory);
      if (Array.isArray(saved.measurementsHistory) && saved.measurementsHistory.length > 0) setMeasurementsHistory(saved.measurementsHistory);
      if (saved.nutrition && typeof saved.nutrition === 'object') setNutrition(saved.nutrition);
      if (Array.isArray(saved.achievements) && saved.achievements.length > 0) setAchievements(saved.achievements);
      if (Array.isArray(saved.challenges) && saved.challenges.length > 0) setChallenges(saved.challenges);
      if (Array.isArray(saved.favoriteExercises)) setFavoriteExercises(saved.favoriteExercises);
      if (Array.isArray(saved.recentlyViewedVideoIds)) setRecentlyViewedVideoIds(saved.recentlyViewedVideoIds);

      // Treino ativo sobrevive a refresh: restaura sessão + timestamp de início.
      if (saved.activeWorkout && saved.activeWorkoutStartedAt) {
        setActiveWorkout(saved.activeWorkout);
        setActiveWorkoutStartedAt(saved.activeWorkoutStartedAt);
        setWorkoutDuration(Math.max(0, Math.floor((Date.now() - saved.activeWorkoutStartedAt) / 1000)));
      }

      if (saved.user) {
        setActiveView(saved.activeWorkout && saved.activeWorkoutStartedAt ? 'active-workout' : 'dashboard');
      }
    }
    setHydrated(true);
  }, []);

  // Salva com debounce de 500ms sempre que o estado persistível mudar.
  useEffect(() => {
    if (!hydrated) return;
    const persisted: PersistedState = {
      user,
      weeklyPlan,
      activeWorkout,
      activeWorkoutStartedAt,
      workoutHistory,
      weightHistory,
      measurementsHistory,
      nutrition,
      achievements,
      challenges,
      favoriteExercises,
      recentlyViewedVideoIds
    };
    const handle = setTimeout(() => saveState(STORAGE_KEY, persisted), 500);
    return () => clearTimeout(handle);
  }, [
    hydrated,
    user,
    weeklyPlan,
    activeWorkout,
    activeWorkoutStartedAt,
    workoutHistory,
    weightHistory,
    measurementsHistory,
    nutrition,
    achievements,
    challenges,
    favoriteExercises,
    recentlyViewedVideoIds
  ]);

  // XP trigger helper
  const addXp = (amount: number, reason: string) => {
    if (!user) return;
    setUser((prev) => {
      if (!prev) return null;
      const newXp = prev.xp + amount;
      const currentLevelIndex = Math.floor(prev.xp / 1000);
      const newLevelIndex = Math.floor(newXp / 1000);
      if (newLevelIndex > currentLevelIndex) {
        setXpNotifications((n) => [...n, { text: `🔥 PARABÉNS! Subiu para o Nível ${newLevelIndex + 1}!`, xp: amount }]);
      }
      return {
        ...prev,
        xp: newXp,
        points: prev.points + amount
      };
    });
    setXpNotifications((n) => [...n, { text: reason, xp: amount }]);
  };

  const clearXpNotifications = () => setXpNotifications([]);

  // Auth functions
  const loginDemoUser = () => {
    const defaultPlan = MOCK_WEEKLY_TEMPLATES[1].days; // Split masculino
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
    const defaultPlan = MOCK_WEEKLY_TEMPLATES[profile.gender === 'female' ? 0 : profile.gender === 'male' ? 1 : 2].days;
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
    setUser(null);
    setWeeklyPlan([]);
    setActiveWorkout(null);
    setActiveWorkoutStartedAt(null);
    setWorkoutDuration(0);
    setActiveView('landing');
    clearState(STORAGE_KEY);
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

  // Workout state management
  const startWorkout = (programId?: string, customName?: string) => {
    let workoutName = customName || 'Treino Personalizado';
    let activeExs: ActiveExercise[] = [];

    if (programId) {
      const prog = programs.find((p) => p.id === programId);
      if (prog) {
        workoutName = prog.name;
        activeExs = prog.exercises.map((pe, idx) => {
          const ex = exercises.find((e) => e.id === pe.exerciseId);
          const setsCount = pe.sets || 3;
          const repString = pe.reps || '10';
          const repsVal = parseInt(repString) || 10;
          const sets: WorkoutSet[] = Array.from({ length: setsCount }, (_, sIdx) => ({
            id: `set_${idx}_${sIdx}`,
            reps: repsVal,
            weight: 10,
            completed: false,
            suggestedWeight: 12,
            lastWeight: 10,
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
      }
    } else {
      // Treino livre inicializado com 1 exercício padrão
      const defaultEx = exercises[0];
      activeExs = [{
        id: `active_ex_0_${Date.now()}`,
        exerciseId: defaultEx.id,
        name: defaultEx.name,
        muscleGroup: defaultEx.muscleGroup,
        sets: [{
          id: `set_0_0`,
          reps: 10,
          weight: 10,
          completed: false,
          suggestedWeight: 10,
          lastWeight: 10,
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
      xpEarned: 0
    });
    setActiveWorkoutStartedAt(Date.now());
    setWorkoutDuration(0);
    setActiveView('active-workout');
  };

  const updateWorkoutSet = (exerciseIndex: number, setIndex: number, fields: Partial<WorkoutSet>) => {
    if (!activeWorkout) return;
    const updatedExercises = [...activeWorkout.exercises];
    updatedExercises[exerciseIndex].sets[setIndex] = {
      ...updatedExercises[exerciseIndex].sets[setIndex],
      ...fields
    };
    setActiveWorkout({
      ...activeWorkout,
      exercises: updatedExercises
    });
  };

  const updateExerciseNotes = (exerciseIndex: number, notes: string) => {
    if (!activeWorkout) return;
    const updatedExercises = [...activeWorkout.exercises];
    updatedExercises[exerciseIndex] = {
      ...updatedExercises[exerciseIndex],
      notes
    };
    setActiveWorkout({
      ...activeWorkout,
      exercises: updatedExercises
    });
  };

  const completeWorkoutSet = (exerciseIndex: number, setIndex: number) => {
    if (!activeWorkout) return;
    const isCompleted = !activeWorkout.exercises[exerciseIndex].sets[setIndex].completed;
    updateWorkoutSet(exerciseIndex, setIndex, { completed: isCompleted });
    if (isCompleted) {
      addXp(10, 'Série concluída!');
    }
  };

  const swapExerciseInActiveWorkout = (exerciseIndex: number, newExerciseId: string, reason?: string) => {
    if (!activeWorkout) return;
    const newEx = exercises.find((e) => e.id === newExerciseId);
    if (!newEx) return;

    const updatedExercises = [...activeWorkout.exercises];
    const oldName = updatedExercises[exerciseIndex].name;
    updatedExercises[exerciseIndex] = {
      ...updatedExercises[exerciseIndex],
      exerciseId: newExerciseId,
      name: newEx.name,
      muscleGroup: newEx.muscleGroup
    };

    setActiveWorkout({
      ...activeWorkout,
      exercises: updatedExercises
    });
    const reasonMsg = reason ? ` devido a ${reason}` : '';
    addXp(20, 'Substituição de exercício executada');
    toast.success(`Substituição aplicada sem alterar o objetivo muscular do treino: ${oldName} -> ${newEx.name}${reasonMsg}.`);
  };

  const adaptActiveWorkoutForCrowdedGym = () => {
    if (!activeWorkout) return;
    let count = 0;
    const adaptedExs = activeWorkout.exercises.map((ex) => {
      const baseEx = exercises.find((e) => e.id === ex.exerciseId);
      if (baseEx && (baseEx.equipment === 'Máquina' || baseEx.equipment.includes('Leg Press') || baseEx.equipment.includes('Polia'))) {
        // Achar substituto livre (Halteres / Peso Corporal) do mesmo grupo muscular
        const alt = exercises.find((e) =>
          e.muscleGroup === baseEx.muscleGroup &&
          e.id !== baseEx.id &&
          (e.equipment === 'Halteres' || e.equipment === 'Peso Corporal')
        );
        if (alt) {
          count++;
          return {
            ...ex,
            exerciseId: alt.id,
            name: alt.name,
            muscleGroup: alt.muscleGroup
          };
        }
      }
      return ex;
    });

    if (count > 0) {
      setActiveWorkout({
        ...activeWorkout,
        exercises: adaptedExs
      });
      addXp(100, 'Treino adaptado: Academia Cheia!');
      unlockAchievement('ach_17');
      toast.success(`Academia Lotada: Substituímos ${count} exercícios em aparelhos por pesos livres (halteres/peso corporal) de mesma ativação muscular.`);
    } else {
      toast.info('Seu treino já é composto por pesos livres ou não há aparelhos de trilhos mecânicos para adaptar.');
    }
  };

  const finishWorkout = (rpe: number) => {
    if (!activeWorkout || !user) return;

    const minutes = Math.ceil(workoutDuration / 60);
    const kcalPerMinute = rpe >= 8 ? 8.5 : rpe >= 5 ? 6.5 : 4.5;
    const caloriesBurned = Math.round(minutes * kcalPerMinute);

    const completedSetsCount = activeWorkout.exercises.reduce((acc, ex) => {
      return acc + ex.sets.filter((s) => s.completed).length;
    }, 0);

    // Calcular volume levantado
    const totalVolume = activeWorkout.exercises.reduce((acc, ex) => {
      return acc + ex.sets.filter(s => s.completed).reduce((sAcc, s) => sAcc + (s.reps * s.weight), 0);
    }, 0);

    const finalXp = 100 + (completedSetsCount * 5) + (totalVolume > 5000 ? 50 : 0);

    // Detecção de PRs fictícios
    const prsDetected: string[] = [];
    activeWorkout.exercises.forEach(ex => {
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
      ...activeWorkout,
      duration: workoutDuration,
      calories: caloriesBurned,
      xpEarned: finalXp,
      totalVolume,
      prsDetected
    };

    setWorkoutHistory((prev) => [finalSession, ...prev]);
    addXp(finalXp, `Treino Concluído! +${caloriesBurned} kcal gastas`);

    // Marcar no planejador semanal que treinou hoje
    const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
    const todayNormalized = today.split('-')[0].trim().toLowerCase();
    const daysMap: {[key: string]: string} = {
      'segunda': 'Segunda', 'terça': 'Terça', 'quarta': 'Quarta', 'quinta': 'Quinta',
      'sexta': 'Sexta', 'sábado': 'Sábado', 'domingo': 'Domingo'
    };
    const dayName = daysMap[todayNormalized] || 'Segunda';
    markDayTrained(dayName);

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
      `Treino finalizado! Concluí "${activeWorkout.name}" em ${minutes} minutos. Volume total: ${totalVolume}kg. ${prsDetected.length > 0 ? `🚀 PRs Batidos: ${prsDetected.join(', ')}!` : ''} 🔥 #GymFlow #Fitness`,
      'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=600&auto=format&fit=crop'
    );

    setActiveWorkout(null);
    setActiveWorkoutStartedAt(null);
    setWorkoutDuration(0);
    setActiveView('dashboard');
  };

  const cancelWorkout = () => {
    setActiveWorkout(null);
    setActiveWorkoutStartedAt(null);
    setWorkoutDuration(0);
    setActiveView('dashboard');
  };

  // Planner functions
  const generateWeeklyPlan = (goal: string, level: string, gender: string, frequency: number, duration: number) => {
    const template = MOCK_WEEKLY_TEMPLATES.find(
      (t) => t.profile === gender && t.goal === goal
    ) || MOCK_WEEKLY_TEMPLATES.find((t) => t.profile === gender) || MOCK_WEEKLY_TEMPLATES[2];

    const daysOrder = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    
    // We want to select exactly F days to be active based on frequency
    let activeDays: string[] = [];
    if (frequency === 1) {
      activeDays = ['Segunda'];
    } else if (frequency === 2) {
      activeDays = ['Segunda', 'Quinta'];
    } else if (frequency === 3) {
      activeDays = ['Segunda', 'Quarta', 'Sexta'];
    } else if (frequency === 4) {
      activeDays = ['Segunda', 'Terça', 'Quinta', 'Sexta'];
    } else if (frequency === 5) {
      activeDays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
    } else if (frequency === 6) {
      activeDays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    } else {
      activeDays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    }

    const adjustedDays = daysOrder.map((dayName) => {
      const isRest = !activeDays.includes(dayName);
      const originalDayInfo = template.days.find((d) => d.dayName === dayName);
      let workoutName = 'Descanso';
      let muscleGroups: string[] = [];
      let exerciseCount = 0;

      if (!isRest) {
        if (originalDayInfo && !originalDayInfo.isRest) {
          workoutName = originalDayInfo.workoutName;
          muscleGroups = originalDayInfo.muscleGroups || [];
          exerciseCount = originalDayInfo.exerciseCount || 4;
        } else {
          const unusedTemplateDay = template.days.find((d) => !d.isRest && !activeDays.includes(d.dayName));
          if (unusedTemplateDay) {
            workoutName = unusedTemplateDay.workoutName;
            muscleGroups = unusedTemplateDay.muscleGroups || [];
            exerciseCount = unusedTemplateDay.exerciseCount || 4;
          } else {
            workoutName = 'Treino Geral Estimulação';
            muscleGroups = ['legs', 'chest', 'back'];
            exerciseCount = 4;
          }
        }
      }

      return {
        dayName,
        workoutName,
        muscleGroups,
        duration: isRest ? 0 : duration,
        exerciseCount: isRest ? 0 : exerciseCount,
        isRest,
        programId: (template.days.find(d => d.workoutName === workoutName) as any)?.programId || undefined,
        trained: false
      };
    });

    setWeeklyPlan(adjustedDays);
    if (user) {
      setUser((prev) => prev ? { ...prev, weeklyPlan: adjustedDays } : null);
    }
    addXp(150, 'Ficha Semanal gerada pela IA Coach!');
  };

  const replanMissedWorkout = () => {
    if (weeklyPlan.length === 0) return;

    const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
    const todayNormalized = today.split('-')[0].trim().toLowerCase();
    const daysMap: {[key: string]: string} = {
      'segunda': 'Segunda', 'terça': 'Terça', 'quarta': 'Quarta', 'quinta': 'Quinta',
      'sexta': 'Sexta', 'sábado': 'Sábado', 'domingo': 'Domingo'
    };
    const curDayName = daysMap[todayNormalized] || 'Segunda';
    const targetDayIdx = weeklyPlan.findIndex(d => d.dayName === curDayName);

    if (targetDayIdx !== -1) {
      const updated = [...weeklyPlan];
      const nextRestIdx = updated.findIndex((d, idx) => idx > targetDayIdx && d.isRest);
      if (nextRestIdx !== -1) {
        const missedWorkout = { ...updated[targetDayIdx] };
        const restDay = { ...updated[nextRestIdx] };

        updated[targetDayIdx] = { ...restDay, dayName: missedWorkout.dayName, trained: false };
        updated[nextRestIdx] = { ...missedWorkout, dayName: restDay.dayName, trained: false };

        setWeeklyPlan(updated);
        if (user) {
          setUser((prev) => prev ? { ...prev, weeklyPlan: updated } : null);
        }
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
    setWeeklyPlan((prev) => {
      const updated = prev.map((d) => (d.dayName === dayName ? { ...d, trained: true } : d));
      if (user) {
        setUser((u) => u ? { ...u, weeklyPlan: updated } : null);
      }
      return updated;
    });
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

  return (
    <GymFlowContext.Provider
      value={{
        activeView,
        setActiveView,
        user,
        loginDemoUser,
        registerUser,
        logout,
        updateUserPremium,
        updateUserProfile,

        exercises,
        programs,
        addNewExercise,
        deleteExercise,

        activeWorkout,
        startWorkout,
        updateWorkoutSet,
        updateExerciseNotes,
        completeWorkoutSet,
        swapExerciseInActiveWorkout,
        finishWorkout,
        cancelWorkout,
        workoutDuration,
        setWorkoutDuration,
        adaptActiveWorkoutForCrowdedGym,

        weeklyPlan,
        setWeeklyPlan,
        generateWeeklyPlan,
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
        clearChat
      }}
    >
      {children}
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
