import type {
  EquipmentId,
  ExerciseBodyPosition,
  ExerciseLaterality,
  ExerciseMechanics,
  MovementPatternId,
  MuscleGroupId,
} from './training-taxonomy';
import type {
  ReturnToTrainingProfile,
  TrainingContinuityStatus,
  TrainingExperienceLevel,
  TrainingGoal,
} from './training-profile';

export type {
  EquipmentCategory,
  EquipmentDefinition,
  EquipmentId,
  EquipmentLoadType,
  EquipmentResolution,
  EquipmentResolutionKind,
  EquipmentStatus,
  ExerciseBodyPosition,
  ExerciseLaterality,
  ExerciseMechanics,
  MovementPatternCategory,
  MovementPatternDefinition,
  MovementPatternId,
  MuscleGroupCategory,
  MuscleGroupDefinition,
  MuscleGroupId,
  TaxonomyValidationIssue,
  TaxonomyValidationReport,
} from './training-taxonomy';

export type {
  ResolvedTrainingProfile,
  ReturnToTrainingProfile,
  TrainingBreakDuration,
  TrainingBreakDurationDefinition,
  TrainingContinuityStatus,
  TrainingExperienceDefinition,
  TrainingExperienceLevel,
  TrainingGoal,
  TrainingProfileFields,
  TrainingProfileSource,
  TrainingProfileValidationIssue,
  TrainingProfileValidationResult,
  TrainingStatusDefinition,
} from './training-profile';

export type {
  BuilderIdFactory,
  WorkoutDayBuilderDraft,
  WorkoutProgramBuilderDraft,
} from './workout-builder';

export type {
  CapacityReference,
  DetailedWorkoutDurationEstimate,
  ExerciseDurationEstimate,
  MuscleGroupVolumeResult,
  MuscleVolumeClass,
  PlanAssessmentStatus,
  PlannedVolumeAnalysis,
  SessionCapacityEstimate,
  SetVolumeReference,
  TrainingPlanAssessment,
  TrainingPlanSuggestion,
  TrainingPlanWarning,
  TrainingGoalContext,
  TrainingVolumeLevel,
  VolumeConfidence,
  WeeklyVolumeGuideline,
} from './training-volume';

export interface WeeklyWorkoutDay {
  dayName: string; // 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'
  workoutName: string; // Ex: 'Quadríceps + Glúteo', 'Descanso'
  muscleGroups: string[];
  duration: number; // minutos
  exerciseCount: number;
  isRest: boolean;
  programId?: string;
  programDayId?: string; // GOAL-07: referência ao ProgramDay real (Programa → Semana → Dia)
  planningIssue?: 'missing-program-day';
  trained?: boolean;
}

// ===== GOAL-07: Programa → Semana → Dia → Slot =====

export type ProgressionType = 'dupla' | 'linear' | 'nenhuma';

export interface ExerciseSlot {
  exerciseId: string; // precisa existir em MOCK_EXERCISES
  series: number;
  repRange: [number, number]; // [min, max]; cardio usa minutos, core isométrico usa segundos
  targetRPE: number;
  restSec: number; // alimenta o timer de descanso (GOAL-06)
  progression: ProgressionType;
  incrementKg: number;
}

export interface TechniqueFrame {
  image: string;
  label: string;
  cue: string;
  order: number;
}

// GOAL-10.5: perfis de volume do Construtor de Treino — guias configuráveis,
// nunca travas (o usuário pode montar qualquer volume real).
export type VolumeProfile = 'compact' | 'standard' | 'high';

export interface ProgramDay {
  id: string;
  name: string; // Ex: 'Dia A — Peito Foco'
  slots: ExerciseSlot[];
  volumeProfile?: VolumeProfile; // GOAL-10.5: opcional — só quando o Day foi pensado para um perfil específico
  // GOAL-19A: metadados do Construtor multi-dia. Todos opcionais — dias seed e dias
  // criados antes do GOAL-19A simplesmente não os têm, e continuam válidos.
  dayNumber?: number; // projeção da posição (1-based); NUNCA identidade — o id é que identifica o dia
  muscleGroupIds?: MuscleGroupId[]; // foco muscular escolhido no Construtor
  customName?: string; // nome digitado pelo usuário; ausente = `name` veio do nome automático
  targetMinutes?: number; // tempo disponível pensado para este dia
}

// GOAL-10.5: rascunho do Construtor de Treino manual — vive em memória (contexto),
// nunca persistido sozinho (o resultado salvo é sempre um WorkoutProgram em customPrograms).
export interface WorkoutBuilderDraft {
  programId?: string; // presente apenas quando edita um customProgram já existente (upsert em vez de criar novo)
  dayId?: string;
  name: string; // nome do DIA de origem (vira o customName do Dia 1 no caminho legado)
  // GOAL-E: nome do PROGRAMA de origem, separado do nome do dia. No caminho legado
  // (editar um dia de programa sugerido) é ele — nunca `name` — que nomeia o programa.
  sourceProgramName?: string;
  level: UserProfile['level'];
  volumeProfile: VolumeProfile;
  targetMinutes: number;
  slots: ExerciseSlot[];
}

export interface ProgramWeek {
  number: number;
  days: ProgramDay[];
}

export interface UserProfile {
  name: string;
  email: string;
  level: TrainingExperienceLevel;
  goal: TrainingGoal;
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
  restTimerDefaultSeconds?: number; // Descanso padrão entre séries (GOAL-06)
  restTimerSoundEnabled?: boolean; // Beep ao fim do descanso (GOAL-06)
  trainingStatus?: TrainingContinuityStatus;
  returnToTraining?: ReturnToTrainingProfile;
  trainingExperienceYears?: number;
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
  restSec?: number; // Descanso sugerido (segundos) entre séries deste exercício (GOAL-06)
  images?: string[]; // GOAL-09: caminhos locais (/assets/exercises/<id>/N.jpg); vazio p/ exercícios criados no Admin
  techniqueFrames?: TechniqueFrame[]; // GOAL-13: sequência visual técnica; mantém images[] como fallback compatível
  searchTerms?: string[]; // GOAL-15: apelidos/termos de academia p/ a busca achar o exercício (ex.: "pulley", "puxada alta")
  primaryMuscleGroupId?: MuscleGroupId;
  secondaryMuscleGroupIds?: MuscleGroupId[];
  movementPatternIds?: MovementPatternId[];
  equipmentIds?: EquipmentId[];
  mechanics?: ExerciseMechanics;
  laterality?: ExerciseLaterality;
  bodyPosition?: ExerciseBodyPosition;
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
  // GOAL-07: metadados do ExerciseSlot de origem (opcionais — treinos antigos/livres não têm)
  repRange?: [number, number];
  targetRPE?: number;
  restSec?: number;
  // GOAL-08: motivo da sugestão do motor de progressão (texto explicativo honesto)
  progressionNote?: string;
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
  // Origem informativa do snapshot. Opcional para manter sessões livres/legadas válidas.
  sourceProgramId?: string;
  sourceProgramDayId?: string;
  sourceProgramName?: string;
  sourceProgramDayName?: string;
}

export interface WorkoutProgram {
  id: string;
  name: string;
  durationWeeks: number;
  frequencyDays: number; // dias por semana (daysPerWeek)
  level: 'beginner' | 'intermediate' | 'advanced' | 'athlete';
  objective: string;
  // Lista achatada legada — mantida para compatibilidade de exibição (WorkoutsTab)
  exercises: { exerciseId: string; sets: number; reps: string; type?: 'warmup' | 'main' | 'accessory' | 'finisher' | 'stretch' }[];
  description: string;
  targetAudience?: string; // Ex: 'Masculino', 'Feminino', 'Unissex'
  contraindications?: string[];
  // GOAL-07: estrutura real Programa → Semana → Dia → Slot
  repeatWeeks: boolean; // true = a(s) semana(s) se repetem até durationWeeks
  weeks: ProgramWeek[];
  // GOAL-10.5: treino criado/editado pelo usuário no Construtor de Treino
  // (nunca um dos MOCK_PROGRAMS — editar um sugerido sempre gera um novo customProgram).
  isCustom?: boolean;
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
