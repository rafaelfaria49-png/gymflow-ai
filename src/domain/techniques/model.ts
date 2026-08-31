import type { Exercise } from '../../types';
import type {
  TechniqueId,
  TechniqueLog,
  TechniquePlan,
  TechniqueRepTarget,
  TechniqueSetLog,
  TechniqueSetPlan,
  TechniqueStageLog,
  TechniqueStagePlan,
  TechniqueValidationIssue,
  TechniqueValidationResult,
} from './types';
import {
  getTechniqueGate,
  TECHNIQUE_EDUCATION,
  TECHNIQUE_IDS,
  TECHNIQUE_LABELS,
} from './profileRules';
import type { TrainingExperienceLevel } from '../../types/training-profile';
import { getEquipmentDefinition } from '../../lib/equipment-registry';

export const TECHNIQUE_SAFETY_CODES = Object.freeze({
  freeCompoundFailure: 'free-compound-failure',
});

export const TECHNIQUE_SAFETY_MESSAGES = Object.freeze({
  [TECHNIQUE_SAFETY_CODES.freeCompoundFailure]:
    'Falha em composto livre: use carga segura, controle a execução e tenha suporte quando necessário.',
});

export interface DropSetPlanInput {
  baseWeight: number;
  baseReps: number;
  stageCount?: number;
  dropPercent?: number;
  restSec?: number;
  pauseSec?: number;
  lastStageToFailure?: boolean;
  weights?: readonly number[];
  reps?: readonly TechniqueRepTarget[];
}

export interface PyramidPlanInput {
  baseWeight: number;
  baseReps?: number;
  restSec?: number;
  percentages?: readonly number[];
  reps?: readonly TechniqueRepTarget[];
}

export interface BackOffPlanInput {
  topWeight: number;
  topReps: number;
  backOffPercent?: number;
  backOffReps?: number;
  backOffSets?: number;
  restSec?: number;
}

function finitePositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value as number) > 0 ? value as number : fallback;
}

function roundWeight(value: number): number {
  return Math.round(Math.max(0, value) * 10) / 10;
}

function roundPercent(value: number): number {
  return Math.round(Math.min(100, Math.max(1, value)) * 100) / 100;
}

export function normalizeTechniqueRepTarget(value: unknown, fallback = 1): TechniqueRepTarget {
  if (value === 'max') return value;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.round(value);
  return fallback;
}

export function createDropSetPlan(input: DropSetPlanInput): TechniquePlan {
  const baseWeight = finitePositive(input.baseWeight, 1);
  const baseReps = Math.max(1, Math.round(finitePositive(input.baseReps, 8)));
  const stageCount = Math.min(6, Math.max(2, Math.round(input.stageCount ?? 4)));
  const dropPercent = Math.min(0.5, Math.max(0.05, input.dropPercent ?? 0.2));
  const restSec = Math.max(0, Math.round(input.restSec ?? 15));
  const pauseSec = Math.max(0, Math.round(input.pauseSec ?? 0));
  const weights = input.weights ?? [];
  const reps = input.reps ?? [];
  const stages: TechniqueStagePlan[] = Array.from({ length: stageCount }, (_, index) => ({
    id: `drop_stage_${index + 1}`,
    index,
    weight: roundWeight(weights[index] ?? baseWeight * ((1 - dropPercent) ** index)),
    reps: normalizeTechniqueRepTarget(
      reps[index] ?? (index === stageCount - 1 && input.lastStageToFailure !== false ? 'max' : baseReps),
      baseReps,
    ),
    pauseSec,
    restSec: index === 0 ? 0 : restSec,
    toFailure: index === stageCount - 1 && input.lastStageToFailure !== false,
  }));
  return {
    type: 'drop_set',
    label: TECHNIQUE_LABELS.drop_set,
    stages,
  };
}

/** Exemplo canônico do Founder usado no roteiro de aceitação do GOAL-26. */
export function createFounderDropSetPlan(): TechniquePlan {
  return createDropSetPlan({
    baseWeight: 30,
    baseReps: 8,
    weights: [30, 25, 20, 15],
    reps: [8, 7, 6, 'max'],
    stageCount: 4,
    restSec: 15,
    lastStageToFailure: true,
  });
}

export function createPyramidSetPlans(input: PyramidPlanInput): TechniqueSetPlan[] {
  const baseWeight = finitePositive(input.baseWeight, 1);
  const baseReps = Math.max(1, Math.round(finitePositive(input.baseReps, 8)));
  const percentages = input.percentages ?? [0.6, 0.7, 0.8, 0.7, 0.6];
  const reps = input.reps ?? [baseReps + 4, baseReps + 2, baseReps, baseReps + 2, baseReps + 4];
  const restSec = Math.max(0, Math.round(input.restSec ?? 120));
  return percentages.map((percentage, index) => ({
    id: `pyramid_set_${index + 1}`,
    index,
    role: percentage === Math.max(...percentages) ? 'top' : 'ramp',
    weight: roundWeight(baseWeight * (percentage > 1 ? roundPercent(percentage) / 100 : Math.min(1, Math.max(0.01, percentage)))),
    reps: normalizeTechniqueRepTarget(reps[index], baseReps),
    restSec,
  }));
}

export function createPyramidPlan(input: PyramidPlanInput): TechniquePlan {
  return {
    type: 'pyramid',
    label: TECHNIQUE_LABELS.pyramid,
    setPlans: createPyramidSetPlans(input),
  };
}

export function createBackOffPlan(input: BackOffPlanInput): TechniquePlan {
  const topWeight = finitePositive(input.topWeight, 1);
  const topReps = Math.max(1, Math.round(finitePositive(input.topReps, 5)));
  const backOffPercent = Math.min(0.95, Math.max(0.5, input.backOffPercent ?? 0.8));
  const backOffReps = Math.max(1, Math.round(finitePositive(input.backOffReps, topReps + 2)));
  const backOffSets = Math.min(5, Math.max(1, Math.round(input.backOffSets ?? 2)));
  const restSec = Math.max(0, Math.round(input.restSec ?? 120));
  const setPlans: TechniqueSetPlan[] = [
    { id: 'back_off_top', index: 0, role: 'top', weight: roundWeight(topWeight), reps: topReps, restSec },
    ...Array.from({ length: backOffSets }, (_, index) => ({
      id: `back_off_set_${index + 1}`,
      index: index + 1,
      role: 'back_off' as const,
      weight: roundWeight(topWeight * backOffPercent),
      reps: backOffReps,
      restSec,
    })),
  ];
  return { type: 'back_off', label: TECHNIQUE_LABELS.back_off, setPlans };
}

export function materializeTechniqueSetPlans(
  plan: TechniquePlan,
  baseWeight: number,
  baseReps: number,
): TechniqueSetPlan[] {
  if (plan.type === 'pyramid' && plan.setPlans?.length) return plan.setPlans.map((set) => ({ ...set }));
  if (plan.type === 'back_off' && plan.setPlans?.length) return plan.setPlans.map((set) => ({ ...set }));
  if (plan.type === 'pyramid') return createPyramidSetPlans({ baseWeight, baseReps });
  if (plan.type === 'back_off') return createBackOffPlan({ topWeight: baseWeight, topReps: baseReps }).setPlans ?? [];
  return [];
}

export function createInitialTechniqueLog(plan: TechniquePlan): TechniqueLog {
  const stages = plan.stages?.map((stage): TechniqueStageLog => ({
    id: stage.id,
    index: stage.index,
    weight: stage.weight,
    reps: stage.reps === 'max' ? 0 : stage.reps,
    completed: false,
    failed: false,
    pauseSec: stage.pauseSec,
    restSec: stage.restSec,
  }));
  const sets = plan.setPlans?.map((set): TechniqueSetLog => ({
    id: set.id,
    index: set.index,
    weight: set.weight,
    reps: set.reps === 'max' ? 0 : set.reps,
    completed: false,
  }));
  const genericSets = !stages && !sets && plan.type !== 'drop_set'
    ? [{
        id: 'technique_set_1',
        index: 0,
        weight: 0,
        reps: plan.targetReps === 'max' ? 0 : plan.targetReps ?? 0,
        completed: false,
      } satisfies TechniqueSetLog]
    : undefined;
  return {
    type: plan.type,
    ...(stages ? { stages } : {}),
    ...(sets || genericSets ? { sets: sets ?? genericSets } : {}),
  };
}

export function recordTechniqueStage(
  log: TechniqueLog,
  index: number,
  patch: Partial<Omit<TechniqueStageLog, 'id' | 'index'>>,
  updatedAt = Date.now(),
): TechniqueLog {
  if (!log.stages?.[index]) return log;
  return {
    ...log,
    stages: log.stages.map((stage, stageIndex) => stageIndex === index
      ? { ...stage, ...patch, updatedAt }
      : stage),
    updatedAt,
  };
}

export function recordTechniqueSet(
  log: TechniqueLog,
  index: number,
  patch: Partial<Omit<TechniqueSetLog, 'id' | 'index'>>,
  updatedAt = Date.now(),
): TechniqueLog {
  if (!log.sets?.[index]) return log;
  return {
    ...log,
    sets: log.sets.map((set, setIndex) => setIndex === index
      ? { ...set, ...patch, updatedAt }
      : set),
    updatedAt,
  };
}

function isTechniqueId(value: unknown): value is TechniqueId {
  return typeof value === 'string' && (TECHNIQUE_IDS as readonly string[]).includes(value);
}

function issue(code: string, message: string, path?: string): TechniqueValidationIssue {
  return { code, message, ...(path ? { path } : {}) };
}

function isFreeWeightCompound(exercise: Exercise | undefined): boolean {
  if (!exercise || exercise.mechanics !== 'compound') return false;
  const equipmentIds = exercise.equipmentIds ?? [];
  if (equipmentIds.some((id) => getEquipmentDefinition(id)?.category === 'free_weight')) return true;
  return /barra|halter|kettlebell|peso livre|anilha/i.test(exercise.equipment ?? '');
}

export function getTechniqueSafetyWarnings(
  plan: TechniquePlan,
  exercise?: Exercise,
): TechniqueValidationIssue[] {
  const failureTechnique = plan.type === 'to_failure'
    || (plan.type === 'drop_set' && plan.stages?.some((stage) => stage.toFailure));
  if (!failureTechnique || !isFreeWeightCompound(exercise)) return [];
  return [issue(
    TECHNIQUE_SAFETY_CODES.freeCompoundFailure,
    TECHNIQUE_SAFETY_MESSAGES[TECHNIQUE_SAFETY_CODES.freeCompoundFailure],
  )];
}

export function validateTechniquePlan(
  plan: TechniquePlan,
  level: TrainingExperienceLevel,
  manualUnlocks: readonly TechniqueId[] = [],
  exercise?: Exercise,
): TechniqueValidationResult {
  const errors: TechniqueValidationIssue[] = [];
  const warnings = getTechniqueSafetyWarnings(plan, exercise);
  const type = isTechniqueId(plan.type) ? plan.type : 'drop_set';
  const gate = getTechniqueGate(level, type, manualUnlocks);
  if (!isTechniqueId(plan.type)) {
    errors.push(issue('unknown-technique', 'Técnica desconhecida; o plano não foi salvo.'));
  } else if (!gate.visible) {
    errors.push(issue('technique-locked', `${gate.label} exige desbloqueio educativo no perfil.`));
  }

  if (type === 'drop_set') {
    if (!plan.stages || plan.stages.length < 2) errors.push(issue('drop-stages-required', 'Um drop set precisa de pelo menos dois estágios.', 'stages'));
    plan.stages?.forEach((stage, index) => {
      if (!Number.isFinite(stage.weight) || stage.weight < 0) errors.push(issue('invalid-stage-weight', 'A carga do estágio deve ser zero ou positiva.', `stages[${index}].weight`));
      if (stage.reps !== 'max' && (!Number.isFinite(stage.reps) || stage.reps < 0)) errors.push(issue('invalid-stage-reps', 'As repetições devem ser positivas ou “max”.', `stages[${index}].reps`));
    });
  }
  if (type === 'pyramid' || type === 'back_off') {
    if (!plan.setPlans || plan.setPlans.length < 2) errors.push(issue('materialized-set-plans-required', `${gate.label} precisa de séries materializadas.`, 'setPlans'));
  }
  if (type === 'tempo' && (!plan.tempo || !/^\d+(?:-\d+){1,3}$/.test(plan.tempo))) {
    errors.push(issue('tempo-required', 'Informe o tempo no formato 3-1-1-0.', 'tempo'));
  }
  if (type === 'iso_hold' && (!Number.isFinite(plan.holdSec) || (plan.holdSec ?? 0) <= 0)) {
    errors.push(issue('hold-required', 'Informe a duração da isometria em segundos.', 'holdSec'));
  }
  if (type === 'partials' && (!Number.isFinite(plan.partialReps) || (plan.partialReps ?? 0) <= 0)) {
    errors.push(issue('partial-reps-required', 'Informe quantas repetições parciais serão feitas.', 'partialReps'));
  }
  return { valid: errors.length === 0, errors, warnings, gate: { ...gate, education: TECHNIQUE_EDUCATION[type] } };
}
