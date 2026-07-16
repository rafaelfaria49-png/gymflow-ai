import type {
  EquipmentId,
  MuscleGroupId,
} from './training-taxonomy';
import type {
  TrainingContinuityStatus,
  TrainingExperienceLevel,
} from './training-profile';

export type TrainingVolumeLevel = 'low' | 'moderate' | 'high' | 'very_high';

export type TrainingGoalContext =
  | 'hypertrophy'
  | 'strength'
  | 'conditioning'
  | 'mobility'
  | 'return'
  | 'performance'
  | 'general';

export type VolumeConfidence = 'high' | 'medium' | 'low';

export type MuscleVolumeClass =
  | 'large'
  | 'small'
  | 'core'
  | 'whole_body'
  | 'conditioning'
  | 'mobility';

export interface SetVolumeReference {
  minimum: number;
  target: number;
  upperReference: number;
}

export interface MuscleGroupVolumeResult {
  muscleGroupId: MuscleGroupId;
  directSets: number;
  secondaryExposure: number;
  weightedSets: number;
  confidence: VolumeConfidence;
  warnings: string[];
}

export interface PlannedVolumeAnalysis {
  muscleVolume: MuscleGroupVolumeResult[];
  totalWorkingSets: number;
  warmupSets: number;
  unclassifiedSets: number;
  weeklyOccurrences: number;
  secondaryExposureWeight: number;
  confidence: VolumeConfidence;
  warnings: string[];
  assumptions: string[];
}

export interface WeeklyVolumeGuideline {
  muscleGroupId: MuscleGroupId;
  experienceLevel: TrainingExperienceLevel;
  trainingStatus: TrainingContinuityStatus;
  reference: SetVolumeReference | null;
  reasons: string[];
  confidence: VolumeConfidence;
}

export interface ExerciseDurationEstimate {
  exerciseId: string;
  exerciseIndex: number;
  series: number;
  repetitionTarget: number | null;
  workSeconds: number;
  restSeconds: number;
  transitionSeconds: number;
  setupSeconds: number;
  totalSeconds: number;
  lowerBoundSeconds: number;
  upperBoundSeconds: number;
  equipmentIds: EquipmentId[];
  confidence: VolumeConfidence;
  assumptions: string[];
  warnings: string[];
}

export interface DetailedWorkoutDurationEstimate {
  totalMinutes: number;
  lowerBoundMinutes: number;
  upperBoundMinutes: number;
  workSeconds: number;
  restSeconds: number;
  transitionSeconds: number;
  setupSeconds: number;
  warmupSeconds: number;
  totalSeries: number;
  exerciseCount: number;
  breakdownByExercise: ExerciseDurationEstimate[];
  assumptions: string[];
  warnings: string[];
  confidence: VolumeConfidence;
}

export interface CapacityReference {
  minimum: number;
  target: number;
  maximumReference: number;
}

export interface SessionCapacityEstimate {
  availableMinutes: number;
  estimatedWorkingSetCapacity: CapacityReference;
  estimatedExerciseCapacity: CapacityReference;
  assumptions: string[];
  warnings: string[];
  confidence: VolumeConfidence;
}

export type PlanAssessmentStatus =
  | 'fits'
  | 'tight'
  | 'exceeds_time'
  | 'low_volume'
  | 'high_volume'
  | 'insufficient_data';

export interface TrainingPlanWarning {
  code: string;
  message: string;
  muscleGroupId?: MuscleGroupId;
}

export interface TrainingPlanSuggestion {
  code: string;
  message: string;
}

export interface TrainingPlanAssessment {
  status: PlanAssessmentStatus;
  durationEstimate: DetailedWorkoutDurationEstimate;
  muscleVolume: MuscleGroupVolumeResult[];
  guidelines: WeeklyVolumeGuideline[];
  warnings: TrainingPlanWarning[];
  suggestions: TrainingPlanSuggestion[];
  reasons: string[];
  confidence: VolumeConfidence;
}
