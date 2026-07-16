export type TrainingExperienceLevel = 'beginner' | 'intermediate' | 'advanced' | 'athlete';

export type TrainingContinuityStatus = 'active' | 'returning';

export type TrainingBreakDuration =
  | 'less_than_1_month'
  | 'one_to_three_months'
  | 'three_to_six_months'
  | 'six_to_twelve_months'
  | 'more_than_1_year';

export type TrainingGoal = 'hypertrophy' | 'slimming' | 'strength' | 'conditioning' | 'athlete';

export interface TrainingExperienceDefinition {
  id: TrainingExperienceLevel;
  label: string;
  compactLabel: string;
  description: string;
  guidance: string;
  order: number;
  note?: string;
}

export interface TrainingStatusDefinition {
  id: TrainingContinuityStatus;
  label: string;
  description: string;
  order: number;
}

export interface TrainingBreakDurationDefinition {
  id: TrainingBreakDuration;
  label: string;
  order: number;
}

export interface ReturnToTrainingProfile {
  previousLevel?: TrainingExperienceLevel;
  breakDuration?: TrainingBreakDuration;
  resumedAt?: string;
  notes?: string;
}

export interface TrainingProfileFields {
  level: TrainingExperienceLevel;
  trainingStatus?: TrainingContinuityStatus;
  returnToTraining?: ReturnToTrainingProfile;
  trainingExperienceYears?: number;
}

export interface TrainingProfileSource extends TrainingProfileFields {
  goal: TrainingGoal;
  frequency: number;
  duration: number;
}

export interface ResolvedTrainingProfile {
  experienceLevel: TrainingExperienceLevel;
  trainingStatus: TrainingContinuityStatus;
  returnToTraining?: ReturnToTrainingProfile;
  trainingExperienceYears?: number;
  goal: TrainingGoal;
  frequency: number;
  sessionDuration: number;
  displayName: string;
}

export interface TrainingProfileValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface TrainingProfileValidationResult {
  valid: boolean;
  errors: readonly TrainingProfileValidationIssue[];
}
