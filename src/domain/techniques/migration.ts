import type { ActiveExercise, WorkoutSession } from '../../types';
import type {
  TechniqueId,
  TechniqueLog,
  TechniquePlan,
  TechniqueRepTarget,
  TechniqueSetLog,
  TechniqueSetPlan,
  TechniqueStageLog,
  TechniqueStagePlan,
} from './types';
import { createInitialTechniqueLog } from './model';
import { TECHNIQUE_IDS } from './profileRules';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTechniqueId(value: unknown): value is TechniqueId {
  return typeof value === 'string' && (TECHNIQUE_IDS as readonly string[]).includes(value);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function repsOr(value: unknown, fallback: TechniqueRepTarget): TechniqueRepTarget {
  if (value === 'max') return value;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : fallback;
}

function sameStagePlan(a: TechniqueStagePlan, b: TechniqueStagePlan): boolean {
  return a.id === b.id && a.index === b.index && a.weight === b.weight && a.reps === b.reps
    && a.pauseSec === b.pauseSec && a.restSec === b.restSec && a.toFailure === b.toFailure;
}

function normalizeStagePlan(value: unknown, index: number): TechniqueStagePlan | undefined {
  if (!isRecord(value)) return undefined;
  const normalized: TechniqueStagePlan = {
    id: typeof value.id === 'string' && value.id ? value.id : `drop_stage_${index + 1}`,
    index,
    weight: Math.max(0, numberOr(value.weight, 0)),
    reps: repsOr(value.reps, 1),
    pauseSec: Math.max(0, Math.round(numberOr(value.pauseSec, 0))),
    restSec: Math.max(0, Math.round(numberOr(value.restSec, index === 0 ? 0 : 15))),
    toFailure: value.toFailure === true,
  };
  return normalized;
}

function sameSetPlan(a: TechniqueSetPlan, b: TechniqueSetPlan): boolean {
  return a.id === b.id && a.index === b.index && a.role === b.role && a.weight === b.weight
    && a.reps === b.reps && a.restSec === b.restSec;
}

function normalizeSetPlan(value: unknown, index: number): TechniqueSetPlan | undefined {
  if (!isRecord(value)) return undefined;
  const role = value.role === 'top' || value.role === 'back_off' || value.role === 'working'
    ? value.role
    : 'ramp';
  return {
    id: typeof value.id === 'string' && value.id ? value.id : `technique_set_${index + 1}`,
    index,
    role,
    weight: Math.max(0, numberOr(value.weight, 0)),
    reps: repsOr(value.reps, 1),
    restSec: Math.max(0, Math.round(numberOr(value.restSec, 90))),
  };
}

/** Normaliza apenas dados de técnica; sem técnica, devolve undefined. */
export function normalizeTechniquePlan(value: unknown): TechniquePlan | undefined {
  if (!isRecord(value) || !isTechniqueId(value.type)) return undefined;
  const source = value as Partial<TechniquePlan>;
  const plan: TechniquePlan = { type: value.type };
  if (typeof value.id === 'string' && value.id) plan.id = value.id;
  if (typeof value.label === 'string' && value.label) plan.label = value.label;
  if (Array.isArray(value.stages)) {
    const stages = value.stages.map((stage, index) => normalizeStagePlan(stage, index)).filter(
      (stage): stage is TechniqueStagePlan => Boolean(stage),
    );
    if (stages.length > 0) plan.stages = stages;
  }
  if (Array.isArray(value.setPlans)) {
    const setPlans = value.setPlans.map((set, index) => normalizeSetPlan(set, index)).filter(
      (set): set is TechniqueSetPlan => Boolean(set),
    );
    if (setPlans.length > 0) plan.setPlans = setPlans;
  }
  if (source.targetReps === 'max' || typeof source.targetReps === 'number') plan.targetReps = repsOr(source.targetReps, 1);
  if (typeof source.tempo === 'string' && source.tempo) plan.tempo = source.tempo;
  if (typeof source.holdSec === 'number' && Number.isFinite(source.holdSec)) plan.holdSec = Math.max(0, source.holdSec);
  if (typeof source.partialReps === 'number' && Number.isFinite(source.partialReps)) plan.partialReps = Math.max(0, Math.round(source.partialReps));
  if (source.partialRange === 'top' || source.partialRange === 'bottom' || source.partialRange === 'mid') plan.partialRange = source.partialRange;
  if (typeof source.notes === 'string' && source.notes) plan.notes = source.notes;

  const sourceStages = Array.isArray(value.stages) ? value.stages : undefined;
  const sourceSets = Array.isArray(value.setPlans) ? value.setPlans : undefined;
  const stagesSame = sourceStages === undefined
    ? plan.stages === undefined
    : plan.stages?.length === sourceStages.length
      && plan.stages.every((stage, index) => sameStagePlan(stage, sourceStages[index] as TechniqueStagePlan));
  const setsSame = sourceSets === undefined
    ? plan.setPlans === undefined
    : plan.setPlans?.length === sourceSets.length
      && plan.setPlans.every((set, index) => sameSetPlan(set, sourceSets[index] as TechniqueSetPlan));
  const scalarKeys: (keyof TechniquePlan)[] = ['id', 'label', 'targetReps', 'tempo', 'holdSec', 'partialReps', 'partialRange', 'notes'];
  const scalarsSame = scalarKeys.every((key) => plan[key] === source[key]);
  return stagesSame && setsSame && scalarsSame ? value as unknown as TechniquePlan : plan;
}

function sameStageLog(a: TechniqueStageLog, b: TechniqueStageLog): boolean {
  return a.id === b.id && a.index === b.index && a.weight === b.weight && a.reps === b.reps
    && a.completed === b.completed && a.failed === b.failed && a.pauseSec === b.pauseSec
    && a.restSec === b.restSec && a.notes === b.notes && a.updatedAt === b.updatedAt;
}

function normalizeStageLog(value: unknown, index: number, fallback?: TechniqueStagePlan): TechniqueStageLog | undefined {
  if (!isRecord(value) && !fallback) return undefined;
  const source = isRecord(value) ? value : {};
  const normalized: TechniqueStageLog = {
    id: typeof source.id === 'string' && source.id ? source.id : fallback?.id ?? `stage_${index + 1}`,
    index,
    weight: Math.max(0, numberOr(source.weight, fallback?.weight ?? 0)),
    reps: Math.max(0, Math.round(numberOr(source.reps, fallback?.reps === 'max' ? 0 : fallback?.reps ?? 0))),
    completed: source.completed === true,
    failed: source.failed === true,
    pauseSec: Math.max(0, Math.round(numberOr(source.pauseSec, fallback?.pauseSec ?? 0))),
    restSec: Math.max(0, Math.round(numberOr(source.restSec, fallback?.restSec ?? 0))),
  };
  if (typeof source.notes === 'string' && source.notes) normalized.notes = source.notes;
  if (typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt)) normalized.updatedAt = source.updatedAt;
  return normalized;
}

function sameTechniqueSetLog(a: TechniqueSetLog, b: TechniqueSetLog): boolean {
  return a.id === b.id && a.index === b.index && a.weight === b.weight && a.reps === b.reps
    && a.completed === b.completed && a.failed === b.failed && a.rpe === b.rpe && a.updatedAt === b.updatedAt;
}

function normalizeTechniqueSetLog(value: unknown, index: number, fallback?: TechniqueSetPlan): TechniqueSetLog | undefined {
  if (!isRecord(value) && !fallback) return undefined;
  const source = isRecord(value) ? value : {};
  const normalized: TechniqueSetLog = {
    id: typeof source.id === 'string' && source.id ? source.id : fallback?.id ?? `set_${index + 1}`,
    index,
    weight: Math.max(0, numberOr(source.weight, fallback?.weight ?? 0)),
    reps: Math.max(0, Math.round(numberOr(source.reps, fallback?.reps === 'max' ? 0 : fallback?.reps ?? 0))),
    completed: source.completed === true,
    failed: source.failed === true,
  };
  if (typeof source.rpe === 'number' && Number.isFinite(source.rpe)) normalized.rpe = source.rpe;
  if (typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt)) normalized.updatedAt = source.updatedAt;
  return normalized;
}

export function normalizeTechniqueLog(value: unknown, plan?: TechniquePlan): TechniqueLog | undefined {
  if (!isRecord(value) && !plan) return undefined;
  const source = isRecord(value) ? value : {};
  const type = isTechniqueId(source.type) ? source.type : plan?.type;
  if (!type) return undefined;
  const normalized: TechniqueLog = { type };
  const sourceStages = Array.isArray(source.stages) ? source.stages : undefined;
  const sourceSets = Array.isArray(source.sets) ? source.sets : undefined;
  if (sourceStages || plan?.stages) {
    normalized.stages = (sourceStages ?? []).map((stage, index) => normalizeStageLog(stage, index, plan?.stages?.[index])).filter(
      (stage): stage is TechniqueStageLog => Boolean(stage),
    );
    if (!sourceStages && plan?.stages) normalized.stages = plan.stages.map((stage, index) => normalizeStageLog(undefined, index, stage) as TechniqueStageLog);
  }
  if (sourceSets || plan?.setPlans) {
    normalized.sets = (sourceSets ?? []).map((set, index) => normalizeTechniqueSetLog(set, index, plan?.setPlans?.[index])).filter(
      (set): set is TechniqueSetLog => Boolean(set),
    );
    if (!sourceSets && plan?.setPlans) normalized.sets = plan.setPlans.map((set, index) => normalizeTechniqueSetLog(undefined, index, set) as TechniqueSetLog);
  }
  if (typeof source.notes === 'string' && source.notes) normalized.notes = source.notes;
  if (typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt)) normalized.updatedAt = source.updatedAt;

  const original = (isRecord(value) ? value : {}) as Partial<TechniqueLog>;
  const stagesSame = Array.isArray(sourceStages)
    ? normalized.stages?.length === sourceStages.length
      && normalized.stages.every((stage, index) => sameStageLog(stage, sourceStages[index] as TechniqueStageLog))
    : !normalized.stages;
  const setsSame = Array.isArray(sourceSets)
    ? normalized.sets?.length === sourceSets.length
      && normalized.sets.every((set, index) => sameTechniqueSetLog(set, sourceSets[index] as TechniqueSetLog))
    : !normalized.sets;
  const scalarSame = original.type === normalized.type && original.notes === normalized.notes && original.updatedAt === normalized.updatedAt;
  return value && stagesSame && setsSame && scalarSame ? value as TechniqueLog : normalized;
}

export function migrateTechniqueExercise(exercise: ActiveExercise): ActiveExercise {
  const hasPlan = Object.prototype.hasOwnProperty.call(exercise, 'techniquePlan');
  const hasLog = Object.prototype.hasOwnProperty.call(exercise, 'techniqueLog');
  if (!hasPlan && !hasLog) return exercise;
  const techniquePlan = normalizeTechniquePlan(exercise.techniquePlan);
  const techniqueLog = normalizeTechniqueLog(exercise.techniqueLog, techniquePlan);
  const planChanged = techniquePlan !== exercise.techniquePlan;
  const logChanged = techniqueLog !== exercise.techniqueLog;
  if (!planChanged && !logChanged) return exercise;
  const next = { ...exercise };
  if (techniquePlan) next.techniquePlan = techniquePlan;
  else delete next.techniquePlan;
  if (techniqueLog) next.techniqueLog = techniqueLog;
  else delete next.techniqueLog;
  return next;
}

export function migrateTechniqueSession(session: WorkoutSession): WorkoutSession {
  const exercises = session.exercises.map(migrateTechniqueExercise);
  return exercises.every((exercise, index) => exercise === session.exercises[index])
    ? session
    : { ...session, exercises };
}

export interface TechniqueSessionState {
  activeWorkout: WorkoutSession | null;
  workoutHistory: WorkoutSession[];
}

export function migrateTechniqueState(state: TechniqueSessionState): TechniqueSessionState {
  const activeWorkout = state.activeWorkout ? migrateTechniqueSession(state.activeWorkout) : state.activeWorkout;
  let changed = activeWorkout !== state.activeWorkout;
  const workoutHistory = state.workoutHistory.map((session) => {
    const next = migrateTechniqueSession(session);
    if (next !== session) changed = true;
    return next;
  });
  return changed ? { ...state, activeWorkout, workoutHistory } : state;
}

/** Permite um consumidor de histórico reidratar um log sem conhecer o formato antigo. */
export function rehydrateTechniqueLog(plan: TechniquePlan, log?: TechniqueLog): TechniqueLog {
  return normalizeTechniqueLog(log, plan) ?? createInitialTechniqueLog(plan);
}
