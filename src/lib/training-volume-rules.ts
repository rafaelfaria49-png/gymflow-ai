import type {
  EquipmentCategory,
  MuscleGroupId,
} from '../types/training-taxonomy';
import type {
  TrainingBreakDuration,
  TrainingExperienceLevel,
} from '../types/training-profile';
import type {
  MuscleVolumeClass,
  SetVolumeReference,
  TrainingGoalContext,
  VolumeConfidence,
} from '../types/training-volume';

export const CONFIDENCE_RANK: Readonly<Record<VolumeConfidence, number>> = Object.freeze({
  high: 0,
  medium: 1,
  low: 2,
});

export function lowestConfidence(...values: VolumeConfidence[]): VolumeConfidence {
  return values.reduce<VolumeConfidence>(
    (lowest, value) => CONFIDENCE_RANK[value] > CONFIDENCE_RANK[lowest] ? value : lowest,
    'high',
  );
}

export const SECONDARY_EXPOSURE_WEIGHT = 0.5;

export const MUSCLE_VOLUME_CLASS: Readonly<Record<MuscleGroupId, MuscleVolumeClass>> = Object.freeze({
  chest: 'large',
  back: 'large',
  shoulders: 'large',
  quadriceps: 'large',
  hamstrings: 'large',
  glutes: 'large',
  legs_general: 'large',
  biceps: 'small',
  triceps: 'small',
  calves: 'small',
  forearms: 'small',
  traps: 'small',
  adductors: 'small',
  abductors: 'small',
  core: 'core',
  lower_back: 'core',
  full_body: 'whole_body',
  functional: 'whole_body',
  cardio: 'conditioning',
  mobility: 'mobility',
});

type ReferenceClasses = Extract<MuscleVolumeClass, 'large' | 'small' | 'core' | 'whole_body'>;

export const WEEKLY_VOLUME_REFERENCES: Readonly<
  Record<TrainingExperienceLevel, Readonly<Record<ReferenceClasses, SetVolumeReference>>>
> = Object.freeze({
  beginner: Object.freeze({
    large: Object.freeze({ minimum: 6, target: 8, upperReference: 12 }),
    small: Object.freeze({ minimum: 4, target: 6, upperReference: 10 }),
    core: Object.freeze({ minimum: 4, target: 6, upperReference: 8 }),
    whole_body: Object.freeze({ minimum: 3, target: 5, upperReference: 8 }),
  }),
  intermediate: Object.freeze({
    large: Object.freeze({ minimum: 8, target: 12, upperReference: 16 }),
    small: Object.freeze({ minimum: 6, target: 9, upperReference: 12 }),
    core: Object.freeze({ minimum: 5, target: 8, upperReference: 12 }),
    whole_body: Object.freeze({ minimum: 4, target: 7, upperReference: 10 }),
  }),
  advanced: Object.freeze({
    large: Object.freeze({ minimum: 10, target: 14, upperReference: 20 }),
    small: Object.freeze({ minimum: 8, target: 12, upperReference: 16 }),
    core: Object.freeze({ minimum: 6, target: 10, upperReference: 14 }),
    whole_body: Object.freeze({ minimum: 5, target: 8, upperReference: 12 }),
  }),
  athlete: Object.freeze({
    large: Object.freeze({ minimum: 10, target: 14, upperReference: 20 }),
    small: Object.freeze({ minimum: 8, target: 12, upperReference: 16 }),
    core: Object.freeze({ minimum: 6, target: 10, upperReference: 14 }),
    whole_body: Object.freeze({ minimum: 5, target: 8, upperReference: 12 }),
  }),
});

/** Heurísticas de produto para uma referência inicial de retorno; não medem perda de capacidade. */
export const RETURN_REFERENCE_MODIFIERS: Readonly<Record<TrainingBreakDuration, number>> = Object.freeze({
  less_than_1_month: 0.9,
  one_to_three_months: 0.8,
  three_to_six_months: 0.7,
  six_to_twelve_months: 0.6,
  more_than_1_year: 0.5,
});

export const RETURN_CAPACITY_REST_BUFFER_SECONDS: Readonly<Record<TrainingBreakDuration, number>> = Object.freeze({
  less_than_1_month: 5,
  one_to_three_months: 8,
  three_to_six_months: 12,
  six_to_twelve_months: 16,
  more_than_1_year: 20,
});

export const DURATION_RULES = Object.freeze({
  fallbackSetSeconds: 40,
  setStartEndOverheadSeconds: 8,
  secondsPerRep: Object.freeze({
    compound: 3.5,
    isolation: 3,
    functional: 2.5,
    fallback: 3,
    lower: 2.5,
    upper: 4,
  }),
  fallbackRestSeconds: 90,
  restByGoal: Object.freeze({
    hypertrophy: 90,
    strength: 150,
    conditioning: 60,
    mobility: 60,
    return: 90,
    performance: 105,
    general: 90,
  } satisfies Record<TrainingGoalContext, number>),
  warmupSeconds: 300,
  legacyTransitionSeconds: 60,
  transitionSeconds: Object.freeze({
    sameEquipment: 25,
    sameCategory: 40,
    differentEquipment: 60,
    sameBarbellOrPlates: 45,
    barbellOrPlates: 75,
    genericExtra: 15,
  }),
  setupSecondsByCategory: Object.freeze({
    bodyweight: 15,
    floor: 15,
    accessory: 25,
    support: 25,
    resistance_band: 25,
    suspension: 30,
    free_weight: 45,
    cable: 40,
    selectorized_machine: 30,
    plate_loaded_machine: 65,
    articulated_machine: 55,
    cardio_machine: 35,
    other: 50,
  } satisfies Record<EquipmentCategory, number>),
  barbellPlateSetupSeconds: 90,
  unilateralWorkMultiplier: 1.25,
  lowerBoundFactor: 0.82,
  upperBoundFactor: 1.25,
});

export const SESSION_CAPACITY_RULES = Object.freeze({
  warmupSeconds: 300,
  nonWorkingTimeShare: 0.18,
  setsPerExercise: 4,
  defaultSetDurationSeconds: 40,
  defaultTransitionSeconds: 60,
  restByExperience: Object.freeze({
    beginner: 75,
    intermediate: 90,
    advanced: 105,
    athlete: 105,
  } satisfies Record<TrainingExperienceLevel, number>),
  minimumFactor: 0.8,
  maximumFactor: 1.15,
});
