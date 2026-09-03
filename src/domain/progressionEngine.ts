import type { ExerciseSlot } from '../types';
import type {
  ReturnToTrainingProfile,
  TrainingBreakDuration,
  TrainingContinuityStatus,
  TrainingExperienceLevel,
  TrainingGoal,
} from '../types/training-profile';

/** Série de histórico aceita pelo motor. Campos opcionais preservam snapshots legados. */
export interface ProgressionHistorySet {
  reps?: number;
  weight?: number;
  completed?: boolean;
  isWarmup?: boolean;
  rpe?: number;
  rir?: number;
}

/** Uma sessão do exercício, ordenada da mais recente para a mais antiga. */
export interface ExerciseSessionHistory {
  date?: string;
  sets?: ProgressionHistorySet[];
}

export type ProgressionLocale = 'pt-BR' | 'en-US';

export type ProgressionReasonCode =
  | 'progression-disabled'
  | 'no-history'
  | 'return-ramp'
  | 'return-ramp-no-weight'
  | 'deload-after-two-failures'
  | 'progress-weight'
  | 'hold-weight-high-effort'
  | 'hold-weight-progress-reps'
  | 'missing-weight'
  | 'plateau-variation'
  | 'plateau-back-off'
  | 'plateau-deload'
  | 'series-progress'
  | 'series-hold'
  | 'readiness-conservative';

export type ProgressionAction =
  | 'disabled'
  | 'start'
  | 'return-ramp'
  | 'reduce'
  | 'progress'
  | 'hold'
  | 'variation'
  | 'back-off'
  | 'deload'
  | 'series-progress'
  | 'series-hold';

export type ProgressionPlateauAction = 'variation' | 'back-off' | 'deload';

export interface ProgressionReturnRampFactors {
  less_than_1_month?: readonly number[];
  one_to_three_months?: readonly number[];
  three_to_six_months?: readonly number[];
  six_to_twelve_months?: readonly number[];
  more_than_1_year?: readonly number[];
}

/** Regras de perfil injetáveis; não há leitura de storage dentro do motor. */
export interface ProgressionProfileRules {
  incrementKg?: number;
  defaultIncrementKg?: number;
  reductionPercent?: number;
  plateauSessions?: number;
  plateauActions?: readonly ProgressionPlateauAction[];
  backOffPercent?: number;
  deloadPercent?: number;
  targetRPE?: number;
  targetRIR?: number;
  defaultRIR?: number;
  seriesProgression?: boolean;
  returnRampFactors?: ProgressionReturnRampFactors;
  overrideThreshold?: number;
  overrideIncrementStepKg?: number;
}

export interface ProgressionProfile {
  level?: TrainingExperienceLevel;
  goal?: TrainingGoal | 'strength' | 'hypertrophy';
  trainingStatus?: TrainingContinuityStatus;
  returnToTraining?: ReturnToTrainingProfile;
  progressionV2?: boolean;
  progressionRules?: Partial<ProgressionProfileRules>;
}

export interface ProgressionSeriesDecision {
  setIndex: number;
  pesoKg: number | null;
  repsAlvo: number | null;
  reasonCode: 'series-progress' | 'series-hold' | 'missing-weight';
  reasonText: string;
  changed: boolean;
}

/** Decisão canônica do motor. `motivo` existe para consumidores GOAL-08 legados. */
export interface ProgressionDecision {
  pesoKg: number | null;
  repsAlvo: number | null;
  reasonCode: ProgressionReasonCode;
  reasonText: string;
  /** Alias compatível com `ProgressionSuggestion` do motor antigo. */
  motivo: string;
  action: ProgressionAction;
  source: 'v2' | 'legacy';
  changed: boolean;
  previousWeightKg: number | null;
  targetRPE: number;
  targetRIR: number;
  effortSource: 'rir' | 'rpe' | 'none';
  plateauAction?: ProgressionPlateauAction;
  returnRampFactor?: number;
  series?: ProgressionSeriesDecision[];
}

export interface ProgressionEngineInput {
  slot: ExerciseSlot;
  history?: readonly ExerciseSessionHistory[];
  profile?: ProgressionProfile;
  profileRules?: Partial<ProgressionProfileRules>;
  /** Permite a comparação explícita com o comportamento anterior. */
  mode?: 'v2' | 'legacy';
  currentWeightKg?: number | null;
  sessionsSinceReturn?: number;
  locale?: ProgressionLocale;
  /** GOAL-30: modulação leve do motor derivada do check-in de prontidão diária. */
  readinessImpact?: 'normal' | 'conservative';
}

export const DEFAULT_RETURN_RAMP_FACTORS: Required<ProgressionReturnRampFactors> = Object.freeze({
  less_than_1_month: Object.freeze([0.85, 0.95, 1]),
  one_to_three_months: Object.freeze([0.75, 0.9, 1]),
  three_to_six_months: Object.freeze([0.65, 0.85, 0.95, 1]),
  six_to_twelve_months: Object.freeze([0.55, 0.75, 0.9, 1]),
  more_than_1_year: Object.freeze([0.5, 0.7, 0.85, 1]),
});

export const DEFAULT_PROGRESSION_PROFILE_RULES: Readonly<Required<Pick<
  ProgressionProfileRules,
  'incrementKg' | 'defaultIncrementKg' | 'reductionPercent' | 'plateauSessions' | 'backOffPercent'
  | 'deloadPercent' | 'targetRPE' | 'targetRIR' | 'defaultRIR' | 'seriesProgression'
  | 'overrideThreshold' | 'overrideIncrementStepKg'
>>> & {
  plateauActions: readonly ProgressionPlateauAction[];
  returnRampFactors: Required<ProgressionReturnRampFactors>;
} = Object.freeze({
  incrementKg: 2.5,
  defaultIncrementKg: 2.5,
  reductionPercent: 10,
  plateauSessions: 3,
  plateauActions: Object.freeze(['variation', 'back-off', 'deload'] as ProgressionPlateauAction[]),
  backOffPercent: 10,
  deloadPercent: 15,
  targetRPE: 8,
  targetRIR: 2,
  defaultRIR: 2,
  seriesProgression: false,
  returnRampFactors: DEFAULT_RETURN_RAMP_FACTORS,
  overrideThreshold: 3,
  overrideIncrementStepKg: 0.5,
});

export const DEFAULT_PROGRESSION_RULES = DEFAULT_PROGRESSION_PROFILE_RULES;

const LEVEL_RULES: Readonly<Record<TrainingExperienceLevel, Partial<ProgressionProfileRules>>> = Object.freeze({
  beginner: Object.freeze({ seriesProgression: false }),
  intermediate: Object.freeze({ seriesProgression: false }),
  advanced: Object.freeze({ seriesProgression: true }),
  athlete: Object.freeze({ seriesProgression: true }),
});

const REASON_MESSAGES: Readonly<Record<ProgressionLocale, Readonly<Record<ProgressionReasonCode, string>>>> = Object.freeze({
  'pt-BR': Object.freeze({
    'progression-disabled': 'Progressão automática desativada — mantenha a execução na faixa alvo.',
    'no-history': 'Sem histórico deste exercício — comece com uma carga confortável e registre as séries.',
    'return-ramp': 'Rampa de retorno ativa: usar {percent}% da última carga para reconstruir margem com controle.',
    'return-ramp-no-weight': 'Rampa de retorno ativa, mas falta uma carga anterior — comece confortável e registre o peso.',
    'deload-after-two-failures': 'Duas sessões abaixo de {min} reps — deload de {percent}% para recuperar a base.',
    'progress-weight': 'Faixa completa ({max} reps em todas as séries){effort} — subir {increment} kg e voltar ao piso da faixa.',
    'hold-weight-high-effort': '{effortLabel} acima do alvo — manter a carga e consolidar o topo da faixa antes de subir.',
    'hold-weight-progress-reps': 'Manter a carga e buscar {reps} reps{ceiling}.',
    'missing-weight': 'Faixa cumprida, mas sem carga registrada — registre o peso para liberar a progressão.',
    'plateau-variation': 'Platô identificado por {sessions} sessões — testar uma variação equivalente mantendo a técnica.',
    'plateau-back-off': 'Platô persistente — usar um back-off de {percent}% e acumular reps com margem.',
    'plateau-deload': 'Platô persistente por {sessions} sessões — sugerir deload de {percent}% antes de retomar.',
    'series-progress': 'Série {set} fechou a faixa com margem — subir {increment} kg e voltar ao piso.',
    'series-hold': 'Série {set}: manter a carga e buscar {reps} reps antes de subir.',
    'readiness-conservative': 'Readiness baixa no check-in diário: mantendo carga em {weight} kg para consolidação segura.',
  }),
  'en-US': Object.freeze({
    'progression-disabled': 'Automatic progression is disabled — stay inside the target rep range.',
    'no-history': 'No history for this exercise — start with a comfortable load and log the sets.',
    'return-ramp': 'Return ramp active: use {percent}% of the last load to rebuild tolerance with control.',
    'return-ramp-no-weight': 'Return ramp active, but no previous load exists — start comfortably and log the weight.',
    'deload-after-two-failures': 'Two sessions below {min} reps — use a {percent}% deload to rebuild the base.',
    'progress-weight': 'Range completed ({max} reps on every set){effort} — add {increment} kg and return to the floor.',
    'hold-weight-high-effort': '{effortLabel} above target — keep the load and consolidate the top before adding weight.',
    'hold-weight-progress-reps': 'Keep the load and aim for {reps} reps{ceiling}.',
    'missing-weight': 'Range completed, but no load was recorded — log the weight to unlock progression.',
    'plateau-variation': 'Plateau detected for {sessions} sessions — try an equivalent variation with control.',
    'plateau-back-off': 'Persistent plateau — use a {percent}% back-off and accumulate reps with margin.',
    'plateau-deload': 'Persistent plateau for {sessions} sessions — suggest a {percent}% deload before resuming.',
    'series-progress': 'Set {set} completed the range with margin — add {increment} kg and return to the floor.',
    'series-hold': 'Set {set}: keep the load and aim for {reps} reps before adding weight.',
    'readiness-conservative': 'Low readiness in daily check-in: holding load at {weight} kg for safe consolidation.',
  }),
});

export function getProgressionReasonText(
  code: ProgressionReasonCode,
  params: Readonly<Record<string, string | number>> = {},
  locale: ProgressionLocale = 'pt-BR',
): string {
  const template = REASON_MESSAGES[locale]?.[code] ?? REASON_MESSAGES['pt-BR'][code];
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}

export const progressionReasonText = getProgressionReasonText;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function roundToHalfKg(value: number): number {
  return Math.round(value * 2) / 2;
}

function normalizePercent(value: unknown, fallback: number): number {
  return finite(value) && value >= 0 && value <= 100 ? value : fallback;
}

function normalizeRules(
  profile?: ProgressionProfile,
  overrides: Partial<ProgressionProfileRules> = {},
): typeof DEFAULT_PROGRESSION_PROFILE_RULES {
  const levelRules = profile?.level ? LEVEL_RULES[profile.level] : {};
  const source = profile?.progressionRules ?? {};
  const raw = { ...levelRules, ...source, ...overrides };
  const plateauActions = Array.isArray(raw.plateauActions)
    ? raw.plateauActions.filter((action): action is ProgressionPlateauAction => (
      action === 'variation' || action === 'back-off' || action === 'deload'
    ))
    : [...DEFAULT_PROGRESSION_PROFILE_RULES.plateauActions];
  const suppliedRamp = raw.returnRampFactors ?? {};
  const returnRampFactors = (Object.keys(DEFAULT_RETURN_RAMP_FACTORS) as TrainingBreakDuration[]).reduce(
    (acc, key) => {
      const candidate = suppliedRamp[key];
      acc[key] = Array.isArray(candidate) && candidate.length > 0 && candidate.every((factor) => finite(factor) && factor > 0 && factor <= 1)
        ? candidate.map((factor) => clamp(factor, 0.1, 1))
        : DEFAULT_RETURN_RAMP_FACTORS[key];
      return acc;
    }, {} as Required<ProgressionReturnRampFactors>,
  );
  return {
    incrementKg: finite(raw.incrementKg) && raw.incrementKg > 0 ? raw.incrementKg : DEFAULT_PROGRESSION_PROFILE_RULES.incrementKg,
    defaultIncrementKg: finite(raw.defaultIncrementKg) && raw.defaultIncrementKg > 0 ? raw.defaultIncrementKg : DEFAULT_PROGRESSION_PROFILE_RULES.defaultIncrementKg,
    reductionPercent: normalizePercent(raw.reductionPercent, DEFAULT_PROGRESSION_PROFILE_RULES.reductionPercent),
    plateauSessions: finite(raw.plateauSessions) && raw.plateauSessions >= 2 ? Math.round(raw.plateauSessions) : DEFAULT_PROGRESSION_PROFILE_RULES.plateauSessions,
    plateauActions: plateauActions.length > 0 ? Object.freeze(plateauActions) : DEFAULT_PROGRESSION_PROFILE_RULES.plateauActions,
    backOffPercent: normalizePercent(raw.backOffPercent, DEFAULT_PROGRESSION_PROFILE_RULES.backOffPercent),
    deloadPercent: normalizePercent(raw.deloadPercent, DEFAULT_PROGRESSION_PROFILE_RULES.deloadPercent),
    targetRPE: finite(raw.targetRPE) ? clamp(raw.targetRPE, 1, 10) : DEFAULT_PROGRESSION_PROFILE_RULES.targetRPE,
    targetRIR: finite(raw.targetRIR) ? clamp(raw.targetRIR, 0, 5) : DEFAULT_PROGRESSION_PROFILE_RULES.targetRIR,
    defaultRIR: finite(raw.defaultRIR) ? clamp(raw.defaultRIR, 0, 5) : DEFAULT_PROGRESSION_PROFILE_RULES.defaultRIR,
    seriesProgression: raw.seriesProgression === true,
    returnRampFactors,
    overrideThreshold: finite(raw.overrideThreshold) && raw.overrideThreshold >= 2 ? Math.round(raw.overrideThreshold) : DEFAULT_PROGRESSION_PROFILE_RULES.overrideThreshold,
    overrideIncrementStepKg: finite(raw.overrideIncrementStepKg) && raw.overrideIncrementStepKg > 0 ? raw.overrideIncrementStepKg : DEFAULT_PROGRESSION_PROFILE_RULES.overrideIncrementStepKg,
  };
}

export function getProgressionProfileRules(
  profile?: ProgressionProfile,
  overrides: Partial<ProgressionProfileRules> = {},
): typeof DEFAULT_PROGRESSION_PROFILE_RULES {
  return normalizeRules(profile, overrides);
}

function completedSets(session: ExerciseSessionHistory | undefined): ProgressionHistorySet[] {
  if (!session || !Array.isArray(session.sets)) return [];
  return session.sets.filter((set) => (
    Boolean(set)
    && set.completed === true
    && set.isWarmup !== true
    && finite(set.reps)
  ));
}

function sessionWeight(session: ExerciseSessionHistory | undefined): number | null {
  const weights = completedSets(session)
    .map((set) => set.weight)
    .filter((weight): weight is number => finite(weight) && weight > 0);
  return weights.length > 0 ? Math.max(...weights) : null;
}

export function lastRecordedWeight(history: readonly ExerciseSessionHistory[]): number | null {
  if (!Array.isArray(history)) return null;
  for (const session of history) {
    const weight = sessionWeight(session);
    if (weight !== null) return weight;
  }
  return null;
}

function validSessions(history: readonly ExerciseSessionHistory[] | undefined): ExerciseSessionHistory[] {
  return (Array.isArray(history) ? history : []).filter((session) => completedSets(session).length > 0);
}

function belowMin(session: ExerciseSessionHistory, repMin: number): boolean {
  const sets = completedSets(session);
  return sets.length > 0 && Math.min(...sets.map((set) => set.reps as number)) < repMin;
}

function minReps(session: ExerciseSessionHistory): number | null {
  const sets = completedSets(session);
  return sets.length > 0 ? Math.min(...sets.map((set) => set.reps as number)) : null;
}

function effortFor(
  sets: readonly ProgressionHistorySet[],
  targetRPE: number,
  targetRIR: number,
): { source: 'rir' | 'rpe' | 'none'; ok: boolean; label: string; detail: string } {
  const rir = sets.map((set) => set.rir).filter((value): value is number => finite(value) && value >= 0);
  if (rir.length > 0) {
    const worstRir = Math.min(...rir);
    return {
      source: 'rir',
      ok: worstRir >= targetRIR,
      label: 'RIR',
      detail: `RIR ${worstRir} ${worstRir >= targetRIR ? '≥' : '<'} ${targetRIR}`,
    };
  }
  const rpe = sets.map((set) => set.rpe).filter((value): value is number => finite(value) && value > 0);
  if (rpe.length > 0) {
    const worstRpe = Math.max(...rpe);
    return {
      source: 'rpe',
      ok: worstRpe <= targetRPE,
      label: 'RPE',
      detail: `RPE ${worstRpe} ${worstRpe <= targetRPE ? '≤' : '>'} ${targetRPE}`,
    };
  }
  return { source: 'none', ok: true, label: 'esforço', detail: 'sem RIR/RPE registrado' };
}

function differentWeight(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return left !== right;
  return Math.abs(left - right) > 0.0001;
}

function decisionBase(
  pesoKg: number | null,
  repsAlvo: number | null,
  reasonCode: ProgressionReasonCode,
  action: ProgressionAction,
  source: 'v2' | 'legacy',
  previousWeightKg: number | null,
  targetRPE: number,
  targetRIR: number,
  effortSource: 'rir' | 'rpe' | 'none',
  reasonText: string,
  extras: Partial<ProgressionDecision> = {},
): ProgressionDecision {
  return {
    pesoKg,
    repsAlvo,
    reasonCode,
    reasonText,
    motivo: reasonText,
    action,
    source,
    changed: differentWeight(previousWeightKg, pesoKg),
    previousWeightKg,
    targetRPE,
    targetRIR,
    effortSource,
    ...extras,
  };
}

function plateauDetected(
  sessions: readonly ExerciseSessionHistory[],
  threshold: number,
  repMax: number | null,
  targetRPE: number,
  targetRIR: number,
): boolean {
  if (sessions.length < threshold) return false;
  const window = sessions.slice(0, threshold);
  const weights = window.map(sessionWeight);
  if (weights.some((weight) => weight === null)) return false;
  const sameWeight = Math.max(...(weights as number[])) - Math.min(...(weights as number[])) <= 0.5;
  if (!sameWeight) return false;
  const progressMetrics = window.map((session) => {
    const sets = completedSets(session);
    const reps = minReps(session);
    const effort = effortFor(sets, targetRPE, targetRIR);
    return `${reps ?? 'x'}:${effort.source === 'rir' ? Math.min(...sets.map((set) => set.rir as number)) : effort.source === 'rpe' ? Math.max(...sets.map((set) => set.rpe as number)) : 'x'}`;
  });
  const sameMetric = progressMetrics.every((metric) => metric === progressMetrics[0]);
  const current = completedSets(window[0]);
  const currentAtTop = repMax !== null && current.every((set) => (set.reps as number) >= repMax);
  const currentEffort = effortFor(current, targetRPE, targetRIR);
  return sameMetric && (!currentAtTop || !currentEffort.ok);
}

function returnRampFor(
  input: ProgressionEngineInput,
  rules: typeof DEFAULT_PROGRESSION_PROFILE_RULES,
  sessions: readonly ExerciseSessionHistory[],
): { factor: number; sessionsSinceReturn: number } | null {
  if (input.profile?.trainingStatus !== 'returning') return null;
  const breakDuration = input.profile.returnToTraining?.breakDuration;
  if (!breakDuration) return null;
  const supplied = input.sessionsSinceReturn;
  const resumedAt = input.profile.returnToTraining?.resumedAt;
  const inferred = resumedAt
    ? sessions.filter((session) => typeof session.date === 'string' && session.date >= resumedAt).length
    : 0;
  const sessionsSinceReturn = Math.max(0, Math.floor(supplied ?? inferred));
  const factors = rules.returnRampFactors[breakDuration] ?? DEFAULT_RETURN_RAMP_FACTORS[breakDuration];
  const factor = factors[Math.min(sessionsSinceReturn, factors.length - 1)] ?? 1;
  return factor < 0.999 ? { factor, sessionsSinceReturn } : null;
}

function normalizeSlotRange(slot: ExerciseSlot): { min: number | null; max: number | null } {
  const min = finite(slot?.repRange?.[0]) ? slot.repRange[0] : null;
  const max = finite(slot?.repRange?.[1]) ? slot.repRange[1] : min;
  return { min, max };
}

function buildSeriesDecisions(
  sets: readonly ProgressionHistorySet[],
  repMin: number | null,
  repMax: number | null,
  increment: number,
  targetRPE: number,
  targetRIR: number,
  previousWeightKg: number | null,
  locale: ProgressionLocale,
): ProgressionSeriesDecision[] {
  return sets.map((set, setIndex) => {
    const setWeight = finite(set.weight) && set.weight > 0 ? set.weight : previousWeightKg;
    const effort = effortFor([set], targetRPE, targetRIR);
    const atTop = repMax !== null && (set.reps as number) >= repMax;
    if (atTop && effort.ok && setWeight !== null) {
      const nextWeight = roundToHalfKg(setWeight + increment);
      const reasonText = getProgressionReasonText('series-progress', {
        set: setIndex + 1,
        increment,
      }, locale);
      return {
        setIndex,
        pesoKg: nextWeight,
        repsAlvo: repMin ?? repMax,
        reasonCode: 'series-progress',
        reasonText,
        changed: differentWeight(setWeight, nextWeight),
      };
    }
    const nextReps = repMax === null ? (set.reps as number) + 1 : Math.min((set.reps as number) + 1, repMax);
    const reasonText = setWeight === null
      ? getProgressionReasonText('missing-weight', {}, locale)
      : getProgressionReasonText('series-hold', { set: setIndex + 1, reps: nextReps }, locale);
    return {
      setIndex,
      pesoKg: setWeight,
      repsAlvo: setWeight === null ? repMin : nextReps,
      reasonCode: setWeight === null ? 'missing-weight' : 'series-hold',
      reasonText,
      changed: false,
    };
  });
}

function buildDecision(input: ProgressionEngineInput): ProgressionDecision {
  const mode = input.mode ?? 'v2';
  const source: 'v2' | 'legacy' = mode;
  const rules = normalizeRules(input.profile, input.profileRules);
  const { min: repMin, max: repMax } = normalizeSlotRange(input.slot);
  const targetRPE = finite(input.slot?.targetRPE) ? clamp(input.slot.targetRPE, 1, 10) : rules.targetRPE;
  const targetRIR = finite(rules.targetRIR) ? rules.targetRIR : clamp(10 - targetRPE, 0, 5);
  const sessions = validSessions(input.history);
  const last = sessions[0];
  const lastSets = completedSets(last);
  const lastWeight = sessionWeight(last) ?? (finite(input.currentWeightKg) && input.currentWeightKg > 0 ? roundToHalfKg(input.currentWeightKg) : null);
  const increment = finite(input.slot?.incrementKg) && input.slot.incrementKg > 0
    ? input.slot.incrementKg
    : rules.incrementKg || rules.defaultIncrementKg;
  const locale = input.locale ?? 'pt-BR';

  if (input.slot?.progression === 'nenhuma') {
    return decisionBase(
      null,
      repMin,
      'progression-disabled',
      'disabled',
      source,
      lastWeight,
      targetRPE,
      targetRIR,
      'none',
      getProgressionReasonText('progression-disabled', {}, locale),
    );
  }

  if (sessions.length === 0) {
    return decisionBase(
      null,
      repMin,
      'no-history',
      'start',
      source,
      null,
      targetRPE,
      targetRIR,
      'none',
      getProgressionReasonText('no-history', {}, locale),
    );
  }

  const effort = effortFor(lastSets, targetRPE, targetRIR);

  if (mode === 'v2') {
    const returnRamp = returnRampFor(input, rules, sessions);
    if (returnRamp) {
      const rampWeight = lastWeight === null ? null : roundToHalfKg(lastWeight * returnRamp.factor);
      const reasonCode = rampWeight === null ? 'return-ramp-no-weight' : 'return-ramp';
      return decisionBase(
        rampWeight,
        repMin,
        reasonCode,
        'return-ramp',
        source,
        lastWeight,
        targetRPE,
        targetRIR,
        effort.source,
        getProgressionReasonText(reasonCode, {
          percent: Math.round(returnRamp.factor * 100),
        }, locale),
        { returnRampFactor: returnRamp.factor },
      );
    }
  }

  if (repMin !== null && sessions.length >= 2 && belowMin(sessions[0], repMin) && belowMin(sessions[1], repMin)) {
    const reducedWeight = lastWeight === null
      ? null
      : roundToHalfKg(lastWeight * (1 - rules.reductionPercent / 100));
    return decisionBase(
      reducedWeight,
      repMin,
      'deload-after-two-failures',
      'reduce',
      source,
      lastWeight,
      targetRPE,
      targetRIR,
      effort.source,
      getProgressionReasonText('deload-after-two-failures', {
        min: repMin,
        percent: rules.reductionPercent,
      }, locale),
    );
  }

  if (mode === 'v2' && rules.seriesProgression && repMin !== null) {
    const series = buildSeriesDecisions(lastSets, repMin, repMax, increment, targetRPE, targetRIR, lastWeight, locale);
    const progresses = series.some((item) => item.reasonCode === 'series-progress');
    return decisionBase(
      series[series.length - 1]?.pesoKg ?? lastWeight,
      series[series.length - 1]?.repsAlvo ?? repMin,
      progresses ? 'series-progress' : 'series-hold',
      progresses ? 'series-progress' : 'series-hold',
      source,
      lastWeight,
      targetRPE,
      targetRIR,
      effort.source,
      progresses
        ? series.find((item) => item.reasonCode === 'series-progress')?.reasonText ?? getProgressionReasonText('series-progress', { set: 1, increment }, locale)
        : series[0]?.reasonText ?? getProgressionReasonText('series-hold', { set: 1, reps: repMin }, locale),
      { series },
    );
  }

  const allAtTop = repMax !== null && lastSets.every((set) => (set.reps as number) >= repMax);
  if (allAtTop && effort.ok) {
    if (lastWeight !== null) {
      if (input.readinessImpact === 'conservative') {
        return decisionBase(
          lastWeight,
          repMax,
          'readiness-conservative',
          'hold',
          source,
          lastWeight,
          targetRPE,
          targetRIR,
          effort.source,
          getProgressionReasonText('readiness-conservative', { weight: lastWeight }, locale),
        );
      }
      return decisionBase(
        roundToHalfKg(lastWeight + increment),
        repMin ?? repMax,
        'progress-weight',
        'progress',
        source,
        lastWeight,
        targetRPE,
        targetRIR,
        effort.source,
        getProgressionReasonText('progress-weight', {
          max: repMax,
          increment,
          effort: effort.source === 'none'
            ? mode === 'legacy' ? ', sem RPE registrado' : ', sem RIR/RPE registrado'
            : ` com ${effort.detail}`,
        }, locale),
      );
    }
    return decisionBase(
      null,
      repMax,
      'missing-weight',
      'hold',
      source,
      null,
      targetRPE,
      targetRIR,
      effort.source,
      getProgressionReasonText('missing-weight', {}, locale),
    );
  }

  if (allAtTop && !effort.ok) {
    const reasonText = getProgressionReasonText('hold-weight-high-effort', {
      effortLabel: effort.detail,
    }, locale);
    if (mode === 'v2' && plateauDetected(sessions, rules.plateauSessions, repMax, targetRPE, targetRIR)) {
      const index = Math.min(sessions.length - rules.plateauSessions, rules.plateauActions.length - 1);
      const plateauAction = rules.plateauActions[index] ?? 'variation';
      if (plateauAction === 'variation') {
        return decisionBase(
          lastWeight,
          repMax,
          'plateau-variation',
          'variation',
          source,
          lastWeight,
          targetRPE,
          targetRIR,
          effort.source,
          getProgressionReasonText('plateau-variation', { sessions: rules.plateauSessions }, locale),
          { plateauAction },
        );
      }
      const percent = plateauAction === 'back-off' ? rules.backOffPercent : rules.deloadPercent;
      const weight = lastWeight === null ? null : roundToHalfKg(lastWeight * (1 - percent / 100));
      return decisionBase(
        weight,
        plateauAction === 'back-off' ? repMax : repMin,
        plateauAction === 'back-off' ? 'plateau-back-off' : 'plateau-deload',
        plateauAction,
        source,
        lastWeight,
        targetRPE,
        targetRIR,
        effort.source,
        getProgressionReasonText(plateauAction === 'back-off' ? 'plateau-back-off' : 'plateau-deload', {
          percent,
          sessions: rules.plateauSessions,
        }, locale),
        { plateauAction },
      );
    }
    return decisionBase(
      lastWeight,
      repMax,
      'hold-weight-high-effort',
      'hold',
      source,
      lastWeight,
      targetRPE,
      targetRIR,
      effort.source,
      reasonText,
    );
  }

  const minimumDone = minReps(last);
  const repsAlvo = minimumDone === null
    ? repMin
    : repMax !== null ? Math.min(minimumDone + 1, repMax) : minimumDone + 1;
  return decisionBase(
    lastWeight,
    repsAlvo,
    'hold-weight-progress-reps',
    'hold',
    source,
    lastWeight,
    targetRPE,
    targetRIR,
    effort.source,
    getProgressionReasonText('hold-weight-progress-reps', {
      reps: repsAlvo ?? 'a próxima repetição',
      ceiling: repMax === null ? '' : ` (teto da faixa: ${repMax})`,
    }, locale),
  );
}

/** Motor puro principal. Nenhum acesso a relógio, storage, DOM ou estado global. */
export function progressionEngine(input: ProgressionEngineInput): ProgressionDecision {
  return buildDecision(input);
}

export const decideProgression = progressionEngine;
export const evaluateProgression = progressionEngine;

export function suggestNextV2(
  slot: ExerciseSlot,
  history: readonly ExerciseSessionHistory[] = [],
  profileRules: Partial<ProgressionProfileRules> = {},
  profile?: ProgressionProfile,
): ProgressionDecision {
  return progressionEngine({ slot, history, profileRules, profile, mode: 'v2' });
}

export interface ProgressionOverride {
  exerciseId: string;
  suggestedWeightKg: number | null;
  actualWeightKg: number | null;
  direction?: 'up' | 'down' | 'same';
  deltaKg?: number;
  recordedAt?: string;
}

export interface ProgressionParameterAdjustment {
  exerciseId: string;
  parameter: 'incrementKg';
  previousValueKg: number;
  nextValueKg: number;
  direction: 'up' | 'down';
  repeatedCount: number;
  reasonText: string;
}

export interface ProgressionOverrideTrackingResult {
  overrides: ProgressionOverride[];
  profileRules: typeof DEFAULT_PROGRESSION_PROFILE_RULES;
  adjustment: ProgressionParameterAdjustment | null;
}

function normalizeOverride(override: ProgressionOverride): ProgressionOverride {
  const suggested = finite(override.suggestedWeightKg) && override.suggestedWeightKg > 0
    ? roundToHalfKg(override.suggestedWeightKg)
    : null;
  const actual = finite(override.actualWeightKg) && override.actualWeightKg > 0
    ? roundToHalfKg(override.actualWeightKg)
    : null;
  const delta = finite(override.deltaKg)
    ? roundToHalfKg(override.deltaKg)
    : suggested !== null && actual !== null ? roundToHalfKg(actual - suggested) : 0;
  const direction = override.direction ?? (delta > 0 ? 'up' : delta < 0 ? 'down' : 'same');
  return {
    exerciseId: override.exerciseId,
    suggestedWeightKg: suggested,
    actualWeightKg: actual,
    direction,
    deltaKg: delta,
    ...(override.recordedAt ? { recordedAt: override.recordedAt } : {}),
  };
}

export function recordProgressionOverride(
  existing: readonly ProgressionOverride[] = [],
  override: ProgressionOverride,
  profileRules: Partial<ProgressionProfileRules> = {},
): ProgressionOverrideTrackingResult {
  const rules = normalizeRules(undefined, profileRules);
  const nextOverride = normalizeOverride(override);
  const overrides = [...existing, nextOverride].slice(-100);
  const matching = overrides.filter((item) => (
    item.exerciseId === nextOverride.exerciseId
    && item.direction === nextOverride.direction
    && item.deltaKg === nextOverride.deltaKg
  ));
  const count = matching.length;
  let adjustment: ProgressionParameterAdjustment | null = null;
  if ((nextOverride.direction === 'up' || nextOverride.direction === 'down') && count >= rules.overrideThreshold && count % rules.overrideThreshold === 0) {
    const previousValueKg = rules.incrementKg;
    const delta = Math.abs(nextOverride.deltaKg ?? 0);
    const nextValueKg = nextOverride.direction === 'up'
      ? Math.max(previousValueKg, delta)
      : Math.max(rules.overrideIncrementStepKg, previousValueKg - rules.overrideIncrementStepKg);
    adjustment = {
      exerciseId: nextOverride.exerciseId,
      parameter: 'incrementKg',
      previousValueKg,
      nextValueKg,
      direction: nextOverride.direction,
      repeatedCount: count,
      reasonText: nextOverride.direction === 'up'
        ? `Três overrides para cima detectados — ajustar o incremento para ${nextValueKg} kg.`
        : `Três overrides para baixo detectados — reduzir o incremento para ${nextValueKg} kg.`,
    };
  }
  return {
    overrides,
    profileRules: adjustment ? { ...rules, incrementKg: adjustment.nextValueKg } : rules,
    adjustment,
  };
}

export const trackProgressionOverride = recordProgressionOverride;
export const applyProgressionOverride = recordProgressionOverride;
