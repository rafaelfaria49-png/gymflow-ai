import type { WorkoutSession, WorkoutSwapReasonCode } from '../../types';

export type AnalyticsTimeWindow = 4 | 8 | 12;

export interface ExerciseMetricPoint {
  date: string; // ISO or YYYY-MM-DD
  timestamp: number;
  sessionId: string;
  sessionName: string;
  maxWeight: number;
  repsAtMaxWeight: number;
  totalReps: number;
  workingSets: number;
  volumeKg: number;
  isPR: boolean;
  isLegacy: boolean;
}

export interface ExerciseAnalytics {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  totalSessions: number;
  history: ExerciseMetricPoint[];
  currentMaxWeight: number;
  initialMaxWeight: number;
  weightDeltaKg: number;
  weightDeltaPercent: number;
  currentMaxVolumeKg: number;
  initialMaxVolumeKg: number;
  volumeDeltaKg: number;
  volumeDeltaPercent: number;
  currentPR: {
    weight: number;
    reps: number;
    date: string;
    sessionId: string;
  } | null;
  status: 'progressed' | 'stagnant' | 'regressed' | 'new';
  totalWorkingSetsCount: number;
  totalVolumeKg: number;
}

export interface WeeklyDataPoint {
  weekIndex: number; // 0-based index in the window
  weekLabel: string; // e.g. "Sem 1", "Sem 2"
  weekStartIso: string;
  weekEndIso: string;
  plannedSets: number;
  executedSets: number;
}

export interface MuscleGroupWeeklyVolume {
  muscleGroupId: string;
  muscleGroupLabel: string;
  plannedSets: number;
  executedSets: number;
  weeklyData: WeeklyDataPoint[];
}

export interface NeglectedMuscleGroup {
  muscleGroupId: string;
  muscleGroupLabel: string;
  executedSets: number;
  plannedSets: number;
  executionRatio: number; // 0..1
  severity: 'alert' | 'warning' | 'balanced';
  reason: string;
  comparatorGroupName?: string;
  comparatorGroupSets?: number;
}

export interface WeeklyAdherenceBreakdown {
  weekIndex: number;
  weekLabel: string;
  completed: number;
  partial: number;
  abandoned: number;
  totalSessions: number;
  avgDurationMinutes: number;
  totalVolumeKg: number;
}

export interface AdherenceAnalytics {
  totalSessions: number;
  completedSessions: number;
  partialSessions: number;
  abandonedSessions: number;
  completionRatePercent: number;
  setCompletionRatePercent: number;
  totalWorkingSetsPlanned: number;
  totalWorkingSetsExecuted: number;
  averageDurationMinutes: number;
  consecutiveWeeksStreak: number;
  totalVolumeKg: number;
  weeklyBreakdown: WeeklyAdherenceBreakdown[];
}

export interface MostSwappedExercise {
  name: string;
  count: number;
  primaryReason?: WorkoutSwapReasonCode;
  reasonDistribution: Record<string, number>;
}

export interface MostSkippedExercise {
  name: string;
  count: number;
}

export interface SwapAndSkipAnalytics {
  totalSwaps: number;
  totalSkips: number;
  swapReasonDistribution: Record<WorkoutSwapReasonCode | 'unspecified', number>;
  mostSwapped: MostSwappedExercise[];
  mostSkipped: MostSkippedExercise[];
}

export interface ReadinessCorrelationAnalytics {
  totalWithReadiness: number;
  hasData: boolean;
  optimalCount: number;
  moderateCount: number;
  lowCount: number;
  averageScore: number;
  optimalAvgVolumeKg: number;
  moderateAvgVolumeKg: number;
  lowAvgVolumeKg: number;
  optimalCompletionRate: number; // 0..100
  moderateCompletionRate: number; // 0..100
  lowCompletionRate: number; // 0..100
  summary: string;
}

export interface TextualInsight {
  id: string;
  category: 'progress' | 'stagnation' | 'gap';
  title: string;
  description: string;
  reason: string;
  severity: 'positive' | 'warning' | 'neutral';
}

export interface ExerciseComparisonItem {
  exerciseName: string;
  muscleGroup: string;
  currentMaxWeight: number;
  previousMaxWeight?: number;
  currentRepsAtMax: number;
  previousRepsAtMax?: number;
  weightDeltaKg: number;
  currentVolumeKg: number;
  previousVolumeKg?: number;
  volumeDeltaKg: number;
  currentCompletedSets: number;
  previousCompletedSets?: number;
  status: 'progressed' | 'maintained' | 'regressed' | 'new';
}

export interface SessionComparison {
  currentSession: {
    id: string;
    name: string;
    date: string;
    volumeKg: number;
    durationMinutes: number;
    setsCompleted: number;
    isLegacy: boolean;
  };
  previousSession: {
    id: string;
    name: string;
    date: string;
    volumeKg: number;
    durationMinutes: number;
    setsCompleted: number;
    isLegacy: boolean;
  } | null;
  volumeDeltaKg: number;
  volumeDeltaPercent: number;
  durationDeltaMinutes: number;
  setsDelta: number;
  exercises: ExerciseComparisonItem[];
}

export interface EvolutionReport {
  windowWeeks: AnalyticsTimeWindow;
  hasLegacyData: boolean;
  legacySessionsCount: number;
  totalSessionsInWindow: number;
  adherence: AdherenceAnalytics;
  muscleGroupVolumes: MuscleGroupWeeklyVolume[];
  neglectedGroups: NeglectedMuscleGroup[];
  exerciseAnalytics: ExerciseAnalytics[];
  swapsAndSkips: SwapAndSkipAnalytics;
  readiness: ReadinessCorrelationAnalytics;
  insights: TextualInsight[];
  usabilityAnswers: {
    whereEvolved: string[];
    whereStagnant: string[];
    whatMissing: string[];
  };
}
