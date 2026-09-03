import type { TrainingExperienceLevel } from '../../types/training-profile';

/** Técnicas especiais suportadas pelo plano de treino e pelo registro ativo. */
export type TechniqueId =
  | 'drop_set'
  | 'pyramid'
  | 'back_off'
  | 'to_failure'
  | 'tempo'
  | 'iso_hold'
  | 'partials'
  | 'rest_pause'
  | 'cluster';

/** Alias semântico usado por componentes que exibem o seletor de técnica. */
export type TechniqueType = TechniqueId;

/** Agrupamentos de exercícios executados em rodadas alternadas. */
export type ExerciseGroupType = 'bi_set' | 'superset' | 'tri_set' | 'giant_set';

/** Alias usado por integrações que tratam o grupo como uma variante de set. */
export type WorkoutGroupType = ExerciseGroupType;

export type TechniqueRepTarget = number | 'max';

export interface TechniqueStagePlan {
  id: string;
  index: number;
  weight: number;
  reps: TechniqueRepTarget;
  /** Pausa intencional durante a repetição, em segundos. */
  pauseSec: number;
  /** Intervalo sugerido antes do próximo estágio, em segundos. */
  restSec: number;
  toFailure: boolean;
}

export type TechniqueSetRole = 'ramp' | 'working' | 'top' | 'back_off';

/** SetPlan materializado para pirâmides/back-off. */
export interface TechniqueSetPlan {
  id: string;
  index: number;
  role: TechniqueSetRole;
  weight: number;
  reps: TechniqueRepTarget;
  restSec: number;
}

/** Mini-série de rest-pause: a carga pertence à série base; aqui entram só reps. */
export interface TechniqueMiniSetPlan {
  id: string;
  index: number;
  reps: TechniqueRepTarget;
  restSec: number;
}

export interface TechniqueMiniSetLog {
  id: string;
  index: number;
  reps: number;
  restSec: number;
  completed: boolean;
  failed?: boolean;
  updatedAt?: number;
}

/** Plano atribuído a um slot do builder e copiado para a sessão ativa. */
export interface TechniquePlan {
  type: TechniqueId;
  /** Identidade opcional para dados criados fora do builder. */
  id?: string;
  label?: string;
  stages?: TechniqueStagePlan[];
  /** Obrigatório na prática para pyramid/back_off; opcional para planos legados. */
  setPlans?: TechniqueSetPlan[];
  /** Carga da série base usada por rest-pause; os mini-sets registram somente reps. */
  baseWeight?: number;
  targetReps?: TechniqueRepTarget;
  /** Pausa curta entre mini-sets de rest-pause ou blocos de cluster. */
  pauseSec?: number;
  miniSets?: TechniqueMiniSetPlan[];
  tempo?: string;
  holdSec?: number;
  partialReps?: number;
  partialRange?: 'top' | 'bottom' | 'mid';
  notes?: string;
}

export interface TechniqueStageLog {
  id: string;
  index: number;
  weight: number;
  reps: number;
  completed: boolean;
  failed: boolean;
  pauseSec: number;
  restSec: number;
  notes?: string;
  updatedAt?: number;
}

export interface TechniqueSetLog {
  id: string;
  index: number;
  weight: number;
  reps: number;
  completed: boolean;
  failed?: boolean;
  rpe?: number;
  /** GOAL-29: RIR opcional para séries especiais que aceitam esforço registrado. */
  rir?: number;
  updatedAt?: number;
}

/** Log persistido no ActiveExercise; stages continuam editáveis/re-hidratáveis. */
export interface TechniqueLog {
  type: TechniqueId;
  stages?: TechniqueStageLog[];
  sets?: TechniqueSetLog[];
  miniSets?: TechniqueMiniSetLog[];
  notes?: string;
  updatedAt?: number;
}

export interface TechniqueMetrics {
  effectiveSets: number;
  tonnage: number;
  fatigueIndex: number;
  techniqueCount: number;
}

export interface TechniqueGate {
  type: TechniqueId;
  visible: boolean;
  unlockedManually: boolean;
  educationRequired: boolean;
  education: string;
  label: string;
}

export interface TechniqueValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface TechniqueValidationResult {
  valid: boolean;
  errors: TechniqueValidationIssue[];
  warnings: TechniqueValidationIssue[];
  gate: TechniqueGate;
}

export interface TechniqueProfileContext {
  level: TrainingExperienceLevel;
  manualUnlocks?: readonly TechniqueId[];
}
