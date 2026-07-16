import type {
  Achievement,
  Challenge,
  NutritionLog,
  UserProfile,
  WeeklyWorkoutDay,
  WorkoutProgram,
  WorkoutSession,
} from '../types';

export const CURRENT_STORAGE_VERSION = 1 as const;

export interface PersistedState {
  user: UserProfile | null;
  weeklyPlan: WeeklyWorkoutDay[];
  customPrograms: WorkoutProgram[];
  activeWorkout: WorkoutSession | null;
  activeWorkoutStartedAt: number | null;
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

export interface StorageEnvelope<T> {
  v: number;
  savedAt: string;
  data: T;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type StorageLoadResult<T> =
  | { status: 'ok'; value: T; envelope: StorageEnvelope<T>; raw: string }
  | { status: 'empty' }
  | { status: 'legacy'; value: T; sourceKeys: string[] }
  | { status: 'corrupt'; raw: string; error: string; quarantined: boolean }
  | { status: 'unsupported-version'; raw: string; version: unknown; quarantined: boolean }
  | { status: 'unavailable'; error: string };

export type StorageWriteFailureReason =
  | 'quota'
  | 'unavailable'
  | 'serialization'
  | 'validation'
  | 'verification'
  | 'blocked';

export type StorageWriteSource = 'save' | 'backup' | 'import' | 'fresh';

export type StorageWriteResult<T = unknown> =
  | { ok: true; savedAt: string; bytes: number; envelope: StorageEnvelope<T>; source: StorageWriteSource }
  | { ok: false; reason: StorageWriteFailureReason; error: string; rolledBack?: boolean };

export type StorageClearResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable'; error: string };

export type EnvelopeParseResult<T> =
  | { status: 'ok'; envelope: StorageEnvelope<T> }
  | { status: 'corrupt'; error: string }
  | { status: 'unsupported-version'; version: unknown };

export type StorageIssueKind =
  | 'corrupt'
  | 'unsupported-version'
  | 'unavailable'
  | StorageWriteFailureReason;

export interface StorageIssue {
  kind: StorageIssueKind;
  message: string;
  raw?: string;
  version?: unknown;
}

export interface StorageHealth {
  status: 'loading' | 'ready' | 'blocked' | 'write-error';
  issue?: StorageIssue;
  hasBackup: boolean;
}

export interface GymFlowBackupFile<T> {
  format: 'gymflow-backup';
  formatVersion: 1;
  exportedAt: string;
  appStorageVersion: 1;
  envelope: StorageEnvelope<T>;
}

export interface StorageImportPreview {
  exportedAt: string;
  savedAt: string;
  workoutSessions: number;
  hasActiveWorkout: boolean;
  customPrograms: number;
  bytes: number;
}
