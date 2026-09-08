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
import type {
  WorkoutExerciseEntryOrigin,
  WorkoutExerciseEntryStatus,
  WorkoutSessionStatus,
  WorkoutSessionVariant,
  WorkoutSwapReasonCode,
} from './workout-session';
import type { ExerciseMedia } from '../domain/media/types';

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
  ActiveSession,
  SessionLog,
  SessionPlan,
  SessionPlanEntry,
  SessionPlanOrigin,
  WorkoutExerciseEntryOrigin,
  WorkoutExerciseEntryStatus,
  WorkoutSessionStatus,
  WorkoutSessionVariant,
  WorkoutSwapReasonCode,
} from './workout-session';

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

export type {
  TechniqueGate,
  ExerciseGroupType,
  TechniqueId,
  TechniqueLog,
  TechniqueMiniSetLog,
  TechniqueMiniSetPlan,
  TechniqueMetrics,
  TechniquePlan,
  TechniqueRepTarget,
  TechniqueSetLog,
  TechniqueSetPlan,
  TechniqueSetRole,
  TechniqueStageLog,
  TechniqueStagePlan,
  TechniqueType,
  TechniqueValidationIssue,
  TechniqueValidationResult,
  WorkoutGroupType,
} from '../domain/techniques/types';

export type {
  WarmupObjective,
  WarmupSessionSettings,
  WarmupSetKind,
  WarmupSetPrescription,
  WarmupTarget,
  WarmupPlan,
} from '../domain/warmupEngine';

export type {
  MediaAssetStatus,
  MediaAssetApproval,
  MediaAssetProvenance,
  MediaAsset,
  ExerciseMedia,
  MediaManifest,
  MediaRenderTier,
  MediaCacheStats,
  ProgramMediaDownloadProgress,
  ProgramMediaDownloadResult,
  MediaTelemetryEvent,
  ExerciseExecutionStat,
} from '../domain/media/types';

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
  /** GOAL-26: técnica especial atribuída ao slot; ausente = série convencional. */
  technique?: import('../domain/techniques/types').TechniquePlan;
  /** GOAL-27: agrupamento alternado; todos os campos são opcionais para legados. */
  groupId?: string;
  groupOrder?: number;
  groupRestSec?: number;
  groupType?: import('../domain/techniques/types').ExerciseGroupType;
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
  /** Técnicas liberadas manualmente após leitura do aviso educativo. */
  techniqueUnlocks?: import('../domain/techniques/types').TechniqueId[];
  /** GOAL-29: card educativo de RIR já visto; ausência mantém compatibilidade legada. */
  rirOnboardingCompleted?: boolean;
  /** GOAL-29: habilita o motor v2 sem alterar perfis legados por migração silenciosa. */
  progressionV2?: boolean;
  /** GOAL-29: ajustes aprendidos após overrides repetidos; opcionais para legados. */
  progressionOverrides?: import('../domain/progressionEngine').ProgressionOverride[];
  progressionParameterAdjustments?: import('../domain/progressionEngine').ProgressionParameterAdjustment[];
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
  /** GOAL-33: restrições articulares, patológicas ou de amplitude (ex: condromalácia, lesão manguito). */
  restrictions?: string[];
  /** GOAL-33: orientação prática humana para substituição inteligente no contexto da academia. */
  substitutionsHint?: string;
  /** GOAL-34: metadados de mídia, vídeo padrão v2 e cadeia de fallback (LIBRARY §3). */
  media?: ExerciseMedia;
}

export interface WorkoutSet {
  id: string;
  reps: number;
  weight: number;
  completed: boolean;
  isWarmup?: boolean;
  /** GOAL-28: aproximação não é uma série efetiva. */
  warmupKind?: import('../domain/warmupEngine').WarmupSetKind;
  warmupPercentage?: number;
  suggestedWeight?: number;
  lastWeight?: number;
  rpe?: number;
  /** GOAL-29: repetições em reserva; opcional e coletado em chips para intermediário+. */
  rir?: number;
  /** GOAL-26: materialização opcional de pyramid/back_off sem alterar séries legadas. */
  setPlan?: import('../domain/techniques/types').TechniqueSetPlan;
  /** GOAL-27: rodada 1-based da entrada dentro de um grupo alternado. */
  groupRound?: number;
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
  /** GOAL-29: decisão estruturada para a tela "Por que esse peso?". */
  progressionDecision?: import('../domain/progressionEngine').ProgressionDecision;
  /** Comparativo de uma versão: motor legado × v2, quando a flag está ativa. */
  progressionComparison?: {
    legacy: import('../domain/progressionEngine').ProgressionDecision;
    v2: import('../domain/progressionEngine').ProgressionDecision;
  };
  // GOAL-23A: vínculo com o plano da sessão e separação origem × execução.
  // Todos opcionais — treinos livres/legados e o snapshot antigo continuam válidos.
  plannedSlotIndex?: number; // posição 0-based no SessionPlan (ExerciseSlot não tem id)
  plannedExerciseId?: string; // exercício originalmente planejado (preservado após swap)
  entryOrigin?: WorkoutExerciseEntryOrigin; // de onde veio: planned | added | swapped
  entryStatus?: WorkoutExerciseEntryStatus; // o que foi feito: planned | performed | partial | skipped
  // GOAL-24: snapshot estruturado da substituição. Opcionais — registros pré-GOAL-24
  // (swapped sem snapshot/motivo) e sessões livres/legadas continuam válidos.
  plannedExerciseName?: string; // nome do exercício original preservado na 1ª troca
  plannedMuscleGroup?: string; // grupo muscular do exercício original preservado na 1ª troca
  swapReasonCode?: WorkoutSwapReasonCode; // motivo da última troca
  swapReasonNote?: string; // nota livre (obrigatória só p/ `other`; normalizada, ≤120 chars)
  swappedAt?: number; // epoch ms da última troca
  /** GOAL-26: snapshot do plano atribuído no builder. */
  techniquePlan?: import('../domain/techniques/types').TechniquePlan;
  /** GOAL-26: execução por stages/sets especiais, editável antes e depois da sessão. */
  techniqueLog?: import('../domain/techniques/types').TechniqueLog;
  /** GOAL-27: snapshot do grupo copiado do slot; ausente em sessões legadas. */
  groupId?: string;
  groupOrder?: number;
  groupRestSec?: number;
  groupType?: import('../domain/techniques/types').ExerciseGroupType;
}

export interface WorkoutSession {
  id: string;
  name: string;
  date: string;
  duration: number; // segundos
  calories: number;
  exercises: ActiveExercise[];
  xpEarned: number;
  /** GOAL-28: snapshot do ritual opcional de aquecimento da sessão. */
  warmup?: import('../domain/warmupEngine').WarmupSessionSettings;
  /** GOAL-30: check-in de prontidão diária pré-treino (opcional e pulável). */
  readiness?: import('../domain/readinessEngine').ReadinessCheckIn;
  readinessSkipped?: boolean;
  readinessDismissedSuggestions?: string[];
  // GOAL-25: metadados da sessão ativa. Opcionais para não alterar registros legados.
  variant?: WorkoutSessionVariant;
  plannedDuration?: number; // minutos previstos no plano no momento do início
  crowdedGymMode?: boolean; // modo operacional da sessão, persistido no snapshot
  totalVolume?: number; // total kg levantados (reps * weight)
  /** Métricas calculadas pela tabela TECH §5; opcional em sessões antigas. */
  techniqueMetrics?: import('../domain/techniques/types').TechniqueMetrics;
  prsDetected?: string[]; // lista de nomes de PRs batidos
  // Origem informativa do snapshot. Opcional para manter sessões livres/legadas válidas.
  sourceProgramId?: string;
  sourceProgramDayId?: string;
  sourceProgramName?: string;
  sourceProgramDayName?: string;
  // GOAL-23A: ciclo de vida da sessão. Opcionais — o histórico legado sem `status`
  // é normalizado como `completed`, e a sessão ativa legada como `active`.
  status?: WorkoutSessionStatus;
  startedAt?: number; // epoch ms; espelha activeWorkoutStartedAt na sessão ativa
  endedAt?: number; // epoch ms; definido apenas no registro final
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
  /** GOAL-28: preferência do programa; ausente mantém sessões legadas inalteradas. */
  warmupEnabled?: boolean;
  weeks: ProgramWeek[];
  // GOAL-10.5: treino criado/editado pelo usuário no Construtor de Treino
  // (nunca um dos MOCK_PROGRAMS — editar um sugerido sempre gera um novo customProgram).
  isCustom?: boolean;
  /** GOAL-35: neutralidade de autoria para modo Personal / SaaS; opcional para manter compatibilidade 100% legada. */
  createdBy?: 'user' | 'coach' | 'system';
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
  /** NUT-001: data civil (YYYY-MM-DD) do último registro de macros para trava de XP idempotente */
  lastMacroLoggedDate?: string;
  lastMacroXpDate?: string;
  /** NUT-001: data civil (YYYY-MM-DD) da última concessão de XP por meta de água batida */
  lastWaterXpDate?: string;
}
