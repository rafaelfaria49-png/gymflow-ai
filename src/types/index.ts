export interface WeeklyWorkoutDay {
  dayName: string; // 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'
  workoutName: string; // Ex: 'Quadríceps + Glúteo', 'Descanso'
  muscleGroups: string[];
  duration: number; // minutos
  exerciseCount: number;
  isRest: boolean;
  programId?: string;
  trained?: boolean;
}

export interface UserProfile {
  name: string;
  email: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'athlete';
  goal: 'hypertrophy' | 'slimming' | 'strength' | 'conditioning' | 'athlete';
  gender: 'male' | 'female' | 'neutral';
  age: number;
  weight: number;
  height: number;
  frequency: number; // dias por semana
  duration: number; // minutos por treino
  location: 'gym' | 'home' | 'both';
  equipments: string[];
  restrictions: string[];
  muscleFocus: string[];
  preference: string;
  xp: number;
  streak: number;
  lastWorkoutDate?: string;
  waterIntake: number; // ml consumido hoje
  waterGoal: number; // ml meta
  premiumStatus: 'free' | 'pro' | 'elite';
  points: number;
  weeklyPlan?: WeeklyWorkoutDay[];
  connectedSocials?: string[]; // Ex: ['instagram', 'facebook']
}

export interface Exercise {
  id: string;
  name: string;
  thumbnail: string;
  videoFakeUrl?: string;
  muscleGroup: 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'glutes' | 'abs' | 'calves' | 'cardio' | 'mobility' | 'functional';
  secondaryMuscles?: string[];
  equipment: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'athlete';
  executionSteps: string[];
  postureTips: string[];
  breathing: string;
  commonErrors: string[];
  errorCorrections: string[];
  variations: string[];
  substitutions: string[]; // IDs de exercícios substitutos
  safetyWarnings: string[];
  type?: 'warmup' | 'main' | 'accessory' | 'finisher' | 'stretch';
}

export interface WorkoutSet {
  id: string;
  reps: number;
  weight: number;
  completed: boolean;
  isWarmup?: boolean;
  suggestedWeight?: number;
  lastWeight?: number;
  rpe?: number;
}

export interface ActiveExercise {
  id: string;
  exerciseId: string;
  name: string;
  muscleGroup: string;
  sets: WorkoutSet[];
  notes?: string;
}

export interface WorkoutSession {
  id: string;
  name: string;
  date: string;
  duration: number; // segundos
  calories: number;
  exercises: ActiveExercise[];
  xpEarned: number;
  totalVolume?: number; // total kg levantados (reps * weight)
  prsDetected?: string[]; // lista de nomes de PRs batidos
}

export interface WorkoutProgram {
  id: string;
  name: string;
  durationWeeks: number;
  frequencyDays: number;
  level: 'beginner' | 'intermediate' | 'advanced' | 'athlete';
  objective: string;
  exercises: { exerciseId: string; sets: number; reps: string; type?: 'warmup' | 'main' | 'accessory' | 'finisher' | 'stretch' }[];
  description: string;
  targetAudience?: string; // Ex: 'Masculino', 'Feminino', 'Unissex'
  contraindications?: string[];
}

export interface VideoLesson {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  instructor: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'all';
  category: 'execution' | 'posture' | 'machines' | 'warmup' | 'mobility' | 'injury-prevention' | 'technique';
  tags: string[];
  checklist: string[];
  errorsToAvoid: string[];
  learned: boolean;
  progressPercent?: number; // 0 a 100
  trailId?: string; // ID da trilha de aprendizado
}

export interface TechniqueTrail {
  id: string;
  name: string;
  description: string;
  videoIds: string[];
  level: 'beginner' | 'intermediate' | 'advanced' | 'all';
}

export interface CommunityComment {
  id: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  time: string;
}

export interface CommunityPost {
  id: string;
  authorName: string;
  authorAvatar: string;
  time: string;
  content: string;
  image?: string;
  likes: number;
  comments: CommunityComment[];
  userLiked?: boolean;
  shares?: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export interface Challenge {
  id: string;
  name: string;
  durationDays: number;
  xpReward: number;
  description: string;
  progress: number; // porcentagem
  completed: boolean;
  type: '7-days' | '14-days' | '30-days';
}

export interface NutritionLog {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water: number;
}
