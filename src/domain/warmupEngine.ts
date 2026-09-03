/** GOAL-28: aquecimento geral e séries de aproximação. */

import type { Exercise, WorkoutSet } from '../types';
import type { TrainingGoal } from '../types/training-profile';
import {
  calculatePlateLoad,
  getPlateCalculatorConfig,
  type PlateCalculatorConfig,
} from './plateCalculator';

export type WarmupObjective = 'strength' | 'hypertrophy';
export type WarmupSetKind = 'approach';

export interface WarmupSessionSettings {
  enabled: boolean;
  objective: WarmupObjective;
  generalMinutes: number;
}

export interface WarmupSetPrescription {
  kind: WarmupSetKind;
  percentage: number;
  requestedWeightKg: number;
  weightKg: number;
  reps: number;
  label: string;
  isEmptyBar: boolean;
}

export interface WarmupTarget {
  exerciseId: string;
  exerciseIndex: number;
  patternIds: string[];
  sets: WarmupSetPrescription[];
}

export interface WarmupPlan {
  settings: WarmupSessionSettings;
  targets: WarmupTarget[];
}

export interface WarmupEngineInput {
  exercises: readonly WarmupExercise[];
  objective?: TrainingGoal | string | null;
  targetWeightForExercise?: (exercise: WarmupExercise, index: number) => number | undefined;
  plateConfig?: PlateCalculatorConfig;
}

export type WarmupExercise = Pick<Exercise,
  'id'
  | 'name'
  | 'muscleGroup'
  | 'secondaryMuscles'
  | 'secondaryMuscleGroupIds'
  | 'movementPatternIds'
  | 'mechanics'
>;

const APPROACH_RULES: Readonly<Record<WarmupObjective, readonly { percentage: number; reps: number }[]>> = Object.freeze({
  // O último degrau prepara para a série de trabalho, mas continua marcado como
  // aquecimento e nunca entra no volume efetivo.
  strength: Object.freeze([
    { percentage: 0, reps: 8 },
    { percentage: 0.4, reps: 5 },
    { percentage: 0.6, reps: 3 },
    { percentage: 0.8, reps: 1 },
  ]),
  hypertrophy: Object.freeze([
    { percentage: 0, reps: 8 },
    { percentage: 0.5, reps: 5 },
    { percentage: 0.7, reps: 3 },
  ]),
});

const OBJECTIVE_ALIASES: Readonly<Record<WarmupObjective, RegExp>> = Object.freeze({
  strength: /for[cç]a|strength|power|pot[eê]ncia|levantamento/i,
  hypertrophy: /hipertrofia|hypertrophy|massa|est[eé]tica|volume/i,
});

export function resolveWarmupObjective(objective: unknown): WarmupObjective {
  const value = typeof objective === 'string' ? objective : '';
  if (OBJECTIVE_ALIASES.strength.test(value)) return 'strength';
  return 'hypertrophy';
}

export function getGeneralWarmupMinutes(objective: unknown): number {
  return resolveWarmupObjective(objective) === 'strength' ? 8 : 5;
}

function isCompoundExercise(exercise: WarmupExercise): boolean {
  return exercise.mechanics === 'compound'
    || Boolean(exercise.secondaryMuscles?.length)
    || Boolean(exercise.secondaryMuscleGroupIds?.length);
}

function inferredPatternIds(exercise: WarmupExercise): string[] {
  if (exercise.movementPatternIds?.length) return [...new Set(exercise.movementPatternIds)];
  const text = `${exercise.id} ${exercise.name}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const inferred: string[] = [];
  if (/supino|flexao|push/.test(text)) inferred.push('horizontal_push');
  if (/desenvolvimento|militar|shoulder.press/.test(text)) inferred.push('vertical_push');
  if (/remada|row/.test(text)) inferred.push('horizontal_pull');
  if (/puxada|barra.fixa|pull.up|pulldown/.test(text)) inferred.push('vertical_pull');
  if (/agachamento|leg.press|hack/.test(text)) inferred.push('squat');
  if (/terra|stiff|romeno|good.morning|hinge/.test(text)) inferred.push('hip_hinge');
  return inferred;
}

/** Seleciona o primeiro composto de cada padrão de movimento do treino. */
export function selectApproachTargets(exercises: readonly WarmupExercise[]): { exerciseIndex: number; patternIds: string[] }[] {
  const covered = new Set<string>();
  const targets: { exerciseIndex: number; patternIds: string[] }[] = [];

  exercises.forEach((exercise, exerciseIndex) => {
    if (!isCompoundExercise(exercise)) return;
    const patternIds = inferredPatternIds(exercise);
    // Catálogos legados sem pattern id ainda recebem uma única aproximação por
    // grupo/exercício, sem afirmar um padrão anatômico que não foi curado.
    const fallback = patternIds.length > 0
      ? patternIds
      : [`legacy:${exercise.muscleGroup || exercise.id}`];
    const uncovered = fallback.filter((patternId) => !covered.has(patternId));
    if (uncovered.length === 0) return;
    uncovered.forEach((patternId) => covered.add(patternId));
    targets.push({ exerciseIndex, patternIds: uncovered });
  });

  return targets;
}

function formatPercentage(percentage: number): string {
  return `${Math.round(percentage * 100)}%`;
}

/** Gera a rampa de aproximação de um exercício composto. */
export function generateApproachWarmupSets(
  targetWeightKg: number,
  objective: WarmupObjective | TrainingGoal | string = 'hypertrophy',
  plateConfig?: PlateCalculatorConfig,
): WarmupSetPrescription[] {
  const target = Number.isFinite(targetWeightKg) ? Math.max(0, targetWeightKg) : 0;
  if (target <= 0) return [];
  const resolvedObjective = resolveWarmupObjective(objective);
  const calculatorConfig = getPlateCalculatorConfig(plateConfig);
  const rules = APPROACH_RULES[resolvedObjective];
  const seenLoads = new Set<number>();

  return rules.flatMap(({ percentage, reps }) => {
    const requestedWeightKg = percentage === 0
      ? calculatorConfig.barWeightKg
      : target * percentage;
    const loadout = calculatePlateLoad(requestedWeightKg, calculatorConfig);
    // Nunca propõe uma carga acima do alvo. Isso também evita que a barra padrão
    // de 20 kg apareça como aproximação de exercícios com alvo menor que ela.
    if (loadout.loadedWeightKg > target + 0.001) return [];
    if (seenLoads.has(loadout.loadedWeightKg)) return [];
    seenLoads.add(loadout.loadedWeightKg);
    return [{
      kind: 'approach' as const,
      percentage,
      requestedWeightKg,
      weightKg: loadout.loadedWeightKg,
      reps,
      label: percentage === 0 ? 'Barra vazia' : `${formatPercentage(percentage)} da carga-alvo`,
      isEmptyBar: percentage === 0,
    }];
  });
}

export function buildWarmupPlan(input: WarmupEngineInput): WarmupPlan {
  const objective = resolveWarmupObjective(input.objective);
  const settings: WarmupSessionSettings = {
    enabled: true,
    objective,
    generalMinutes: getGeneralWarmupMinutes(objective),
  };
  const targets = selectApproachTargets(input.exercises).map(({ exerciseIndex, patternIds }) => {
    const exercise = input.exercises[exerciseIndex];
    const targetWeightKg = input.targetWeightForExercise?.(exercise, exerciseIndex) ?? 0;
    return {
      exerciseId: exercise.id,
      exerciseIndex,
      patternIds,
      sets: generateApproachWarmupSets(targetWeightKg, objective, input.plateConfig),
    };
  }).filter((target) => target.sets.length > 0);

  return { settings, targets };
}

/** Converte uma prescrição em WorkoutSet sem misturar com a série efetiva. */
export function materializeWarmupSet(
  prescription: WarmupSetPrescription,
  id: string,
): WorkoutSet {
  return {
    id,
    reps: prescription.reps,
    weight: prescription.weightKg,
    completed: false,
    isWarmup: true,
    warmupKind: prescription.kind,
    warmupPercentage: prescription.percentage,
  };
}

/** Maior carga de trabalho concluída; aquecimento nunca participa de PR. */
export function bestWorkingSetWeight(sets: readonly WorkoutSet[]): number {
  return sets
    .filter((set) => set.completed && !set.isWarmup && Number.isFinite(set.weight))
    .reduce((best, set) => Math.max(best, Math.max(0, set.weight)), 0);
}

export const WARMUP_APPROACH_RULES = APPROACH_RULES;
