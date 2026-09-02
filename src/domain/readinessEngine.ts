// GOAL-30: Motor puro de Readiness e Adaptação Diária (PROG §6).
//
// O motor é 100% puro e determinístico:
// - Avalia o check-in de 5 toques (energia, sono, dor, estresse, tempo);
// - Calcula score (0-100), nível de prontidão e impacto na progressão;
// - Gera propostas de adaptação explicadas de 1 toque (reduzir volume, compacto, trocar dia, mobilidade);
// - Quando tudo estiver favorável ("tudo ok"), não produz mensagens invasivas (status: 'all-good', suggestions: []);
// - Fornece adaptadores puros para redução de volume e correlação simples no histórico.

import type { ActiveExercise, Exercise, WorkoutSession } from '../types';
import { buildCompactWorkoutProposal, type CompactWorkoutProposal } from './compactEngine';

export type ReadinessEnergy = 'low' | 'medium' | 'high';
export type ReadinessSleep = 'poor' | 'fair' | 'good';
export type ReadinessSoreness = 'none' | 'mild' | 'severe';
export type ReadinessStress = 'low' | 'medium' | 'high';
export type ReadinessTime = 'short' | 'normal' | 'plenty';

export interface ReadinessAnswers {
  energy: ReadinessEnergy;
  sleep: ReadinessSleep;
  soreness: ReadinessSoreness;
  sorenessLocation?: string;
  stress: ReadinessStress;
  timeAvailable: ReadinessTime;
  timeAvailableMinutes?: number;
}

export type ReadinessLevel = 'optimal' | 'moderate' | 'low';
export type ReadinessStatus = 'all-good' | 'suggestions-available';
export type ReadinessProgressionImpact = 'normal' | 'conservative';

export interface ReadinessCheckIn extends ReadinessAnswers {
  completedAt: number;
  score: number; // 0..100
  level: ReadinessLevel;
  progressionImpact: ReadinessProgressionImpact;
}

export type ReadinessSuggestionType =
  | 'compact'
  | 'reduce-volume'
  | 'swap-day'
  | 'limit-muscle'
  | 'mobility-warmup';

export interface ReadinessSuggestion {
  id: string;
  type: ReadinessSuggestionType;
  title: string;
  reason: string;
  actionLabel: string;
  dismissLabel: string;
  compactProposal?: CompactWorkoutProposal;
  payload?: {
    targetMinutes?: number;
    alternateDayId?: string;
    alternateDayName?: string;
    affectedMuscle?: string;
    setsToReduce?: number;
  };
}

export interface ReadinessAssessment {
  checkIn: ReadinessCheckIn;
  score: number;
  level: ReadinessLevel;
  status: ReadinessStatus;
  suggestions: ReadinessSuggestion[];
  progressionImpact: ReadinessProgressionImpact;
  affectedMusclesInSession: string[];
}

export interface ProgramDayInfo {
  id: string;
  name: string;
  muscleGroups?: string[];
}

export interface ReadinessSessionContext {
  session?: WorkoutSession;
  catalog?: readonly Exercise[];
  availableProgramDays?: readonly ProgramDayInfo[];
}

/** Pesos para o cálculo do Readiness Score (0 a 100). */
export function calculateReadinessScore(answers: ReadinessAnswers): number {
  let score = 0;

  // 1. Energia (máx 20 pts)
  if (answers.energy === 'high') score += 20;
  else if (answers.energy === 'medium') score += 14;
  else score += 5;

  // 2. Sono (máx 20 pts)
  if (answers.sleep === 'good') score += 20;
  else if (answers.sleep === 'fair') score += 14;
  else score += 5;

  // 3. Dor (máx 20 pts)
  if (answers.soreness === 'none') score += 20;
  else if (answers.soreness === 'mild') score += 14;
  else score += 5;

  // 4. Estresse (máx 20 pts)
  if (answers.stress === 'low') score += 20;
  else if (answers.stress === 'medium') score += 14;
  else score += 5;

  // 5. Tempo (máx 20 pts)
  if (answers.timeAvailable === 'plenty') score += 20;
  else if (answers.timeAvailable === 'normal') score += 18;
  else score += 10;

  return Math.min(100, Math.max(0, score));
}

export function resolveReadinessLevel(score: number): ReadinessLevel {
  if (score >= 80) return 'optimal';
  if (score >= 50) return 'moderate';
  return 'low';
}

function normalizeMuscleString(value: string | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Mapa de equivalência para grupos musculares. */
const MUSCLE_SYNONYMS: Record<string, string[]> = {
  chest: ['peito', 'peitoral', 'chest'],
  back: ['costas', 'dorsal', 'back', 'trapezio', 'latissimus'],
  shoulders: ['ombro', 'ombros', 'deltoide', 'deltoides', 'shoulders'],
  legs: ['perna', 'pernas', 'coxa', 'quadriceps', 'isquiotibiais', 'posterior', 'gluteo', 'gluteos', 'legs', 'panturrilha', 'calves'],
  arms: ['braco', 'bracos', 'biceps', 'triceps', 'antibraco', 'arms'],
  core: ['core', 'abdomen', 'abdominal', 'lombar', 'abs'],
  lower_back: ['lombar', 'costas', 'lower_back', 'espinha'],
  joints: ['articulacoes', 'articular', 'joelho', 'cotovelo', 'ombro', 'punho', 'quadril', 'joints'],
};

export function musclesOverlap(muscleA: string | undefined, muscleB: string | undefined): boolean {
  if (!muscleA || !muscleB) return false;
  const normA = normalizeMuscleString(muscleA);
  const normB = normalizeMuscleString(muscleB);

  if (normA === normB || normA.includes(normB) || normB.includes(normA)) {
    return true;
  }

  for (const group of Object.values(MUSCLE_SYNONYMS)) {
    const hasA = group.some((term) => normA.includes(term) || term.includes(normA));
    const hasB = group.some((term) => normB.includes(term) || term.includes(normB));
    if (hasA && hasB) return true;
  }

  return false;
}

/** Extrai grupos musculares trabalhados na sessão. */
export function extractSessionMuscles(session: WorkoutSession | undefined, catalog?: readonly Exercise[]): string[] {
  if (!session) return [];
  const muscles = new Set<string>();
  const catalogMap = catalog ? new Map(catalog.map((ex) => [ex.id, ex])) : null;

  for (const ex of session.exercises) {
    if (ex.muscleGroup) muscles.add(ex.muscleGroup);
    if (catalogMap) {
      const meta = catalogMap.get(ex.exerciseId);
      if (meta?.muscleGroup) muscles.add(meta.muscleGroup);
      if (meta?.secondaryMuscles) {
        meta.secondaryMuscles.forEach((m) => muscles.add(m));
      }
    }
  }

  return Array.from(muscles);
}

/**
 * Avalia o check-in de prontidão diária gerando sugestões explicadas PROG §6.
 * Função pura e determinística.
 */
export function evaluateReadiness(
  answers: ReadinessAnswers,
  context?: ReadinessSessionContext,
  now = Date.now(),
): ReadinessAssessment {
  const score = calculateReadinessScore(answers);
  const level = resolveReadinessLevel(score);
  const session = context?.session;
  const catalog = context?.catalog;
  const sessionMuscles = extractSessionMuscles(session, catalog);

  // Impacto conservador na progressão se cansaço/sono/score baixo
  const progressionImpact: ReadinessProgressionImpact =
    answers.energy === 'low' || answers.sleep === 'poor' || score < 50
      ? 'conservative'
      : 'normal';

  const checkIn: ReadinessCheckIn = {
    ...answers,
    completedAt: now,
    score,
    level,
    progressionImpact,
  };

  const suggestions: ReadinessSuggestion[] = [];
  const affectedMusclesInSession: string[] = [];

  if (answers.soreness !== 'none' && answers.sorenessLocation) {
    const soreLoc = answers.sorenessLocation;
    for (const sm of sessionMuscles) {
      if (musclesOverlap(soreLoc, sm)) {
        affectedMusclesInSession.push(sm);
      }
    }
  }

  // REGRA 1: Dor Forte no grupo do dia -> Troca de dia ou limitação temporária (PROG §6)
  if (answers.soreness === 'severe') {
    const hasTargetMatch = affectedMusclesInSession.length > 0 || !answers.sorenessLocation;
    const locationLabel = answers.sorenessLocation || 'grupo trabalhado hoje';

    if (hasTargetMatch && context?.availableProgramDays && context.availableProgramDays.length > 1 && session) {
      // Procura outro dia no programa que não trabalhe o grupo dolorido
      const alternateDay = context.availableProgramDays.find((day) => {
        if (day.id === session.sourceProgramDayId) return false;
        if (!day.muscleGroups || day.muscleGroups.length === 0) return true;
        return !day.muscleGroups.some((mg) => musclesOverlap(answers.sorenessLocation, mg));
      });

      if (alternateDay) {
        suggestions.push({
          id: 'sugg_swap_day',
          type: 'swap-day',
          title: 'Troca de Dia Recomendada',
          reason: `Dor forte relatada em ${locationLabel}, foco do treino de hoje. Para permitir a recuperação e evitar sobrecarga, sugerimos adiantar o dia "${alternateDay.name}" e treinar este grupo quando a musculatura estiver recuperada.`,
          actionLabel: `Trocar para ${alternateDay.name}`,
          dismissLabel: 'Treinar Este Grupo Mesmo Assim',
          payload: {
            alternateDayId: alternateDay.id,
            alternateDayName: alternateDay.name,
            affectedMuscle: answers.sorenessLocation,
          },
        });
      }
    }

    if (hasTargetMatch) {
      suggestions.push({
        id: 'sugg_limit_muscle',
        type: 'limit-muscle',
        title: 'Limitação Temporária de Carga/Volume',
        reason: `Dor forte em ${locationLabel}. Sugerimos poupar ou reduzir as séries de exercícios que ativam diretamente essa região na sessão de hoje.`,
        actionLabel: 'Poupar Grupo Dolorido',
        dismissLabel: 'Manter Treino Integral',
        payload: {
          affectedMuscle: answers.sorenessLocation,
        },
      });
    }
  }

  // REGRA 2: Tempo Curto -> Proposta de Treino Rápido (compactEngine GOAL-25)
  const plannedDuration = session?.plannedDuration ?? 45;
  const isTimeShort =
    answers.timeAvailable === 'short'
    || (answers.timeAvailableMinutes !== undefined && answers.timeAvailableMinutes < plannedDuration);

  if (isTimeShort) {
    const targetMinutes = answers.timeAvailableMinutes ?? Math.max(15, Math.min(30, Math.round(plannedDuration * 0.65)));
    let compactProposal: CompactWorkoutProposal | undefined;
    if (session && catalog) {
      compactProposal = buildCompactWorkoutProposal({
        session,
        plannedMinutes: plannedDuration,
        targetMinutes,
        catalog,
      });
    }

    suggestions.push({
      id: 'sugg_compact',
      type: 'compact',
      title: 'Treino Rápido Sugerido',
      reason: `Tempo disponível hoje (${targetMinutes} min) é menor que o previsto (${plannedDuration} min). Sugerimos o Treino Rápido, mantendo exercícios compostos e cortando isoladores para cumprir seu objetivo no tempo exato.`,
      actionLabel: `Aplicar Treino Rápido (${targetMinutes} min)`,
      dismissLabel: 'Manter Treino Completo',
      compactProposal,
      payload: {
        targetMinutes,
      },
    });
  }

  // REGRA 3: Fadiga / Sono Ruim / Estresse Alto -> Reduzir Volume (PROG §6)
  const isHighFatigue =
    answers.energy === 'low'
    || answers.sleep === 'poor'
    || (answers.stress === 'high' && answers.energy !== 'high')
    || score < 50;

  if (isHighFatigue && !suggestions.some((s) => s.type === 'swap-day')) {
    const reasons: string[] = [];
    if (answers.energy === 'low') reasons.push('energia baixa');
    if (answers.sleep === 'poor') reasons.push('sono insuficiente');
    if (answers.stress === 'high') reasons.push('estresse elevado');
    if (reasons.length === 0) reasons.push('prontidão moderada');

    suggestions.push({
      id: 'sugg_reduce_volume',
      type: 'reduce-volume',
      title: 'Redução Suave de Volume',
      reason: `Identificamos ${reasons.join(' e ')}. Sugerimos reduzir 1 série de trabalho por exercício para preservar sua recuperação do sistema nervoso sem perder o estímulo de força.`,
      actionLabel: 'Reduzir 1 Série por Exercício',
      dismissLabel: 'Manter Volume Original',
      payload: {
        setsToReduce: 1,
      },
    });
  }

  // REGRA 4: Dor Leve -> Mobilidade / Aquecimento Reforçado (PROG §6)
  if (answers.soreness === 'mild') {
    const loc = answers.sorenessLocation ? `em ${answers.sorenessLocation}` : 'muscular';
    suggestions.push({
      id: 'sugg_mobility',
      type: 'mobility-warmup',
      title: 'Aquecimento e Mobilidade Prévia',
      reason: `Desconforto leve relatado ${loc}. Recomendamos dedicar 3 a 5 minutos a rotações articulares e aquecimento específico antes das séries principais.`,
      actionLabel: 'Entendido, focar em mobilidade',
      dismissLabel: 'Continuar normalmente',
      payload: {
        affectedMuscle: answers.sorenessLocation,
      },
    });
  }

  // REGRA 5: Tudo OK -> Sem mensagens nem sugestões (PROG §6 tarefa 4)
  const status: ReadinessStatus = suggestions.length > 0 ? 'suggestions-available' : 'all-good';

  return {
    checkIn,
    score,
    level,
    status,
    suggestions,
    progressionImpact,
    affectedMusclesInSession,
  };
}

/**
 * Reduz 1 série de trabalho de cada exercício (função pura).
 * Preserva séries de aproximação/aquecimento e garante que cada exercício mantenha pelo menos 1 série.
 */
export function applyVolumeReduction(session: WorkoutSession, setsToReduce = 1): WorkoutSession {
  const updatedExercises: ActiveExercise[] = session.exercises.map((exercise) => {
    const warmupSets = exercise.sets.filter((s) => s.isWarmup === true);
    const workingSets = exercise.sets.filter((s) => !s.isWarmup);

    if (workingSets.length <= 1) {
      return exercise;
    }

    const targetWorkingCount = Math.max(1, workingSets.length - setsToReduce);
    const keptWorkingSets = workingSets.slice(0, targetWorkingCount);

    return {
      ...exercise,
      sets: [...warmupSets, ...keptWorkingSets],
    };
  });

  return {
    ...session,
    exercises: updatedExercises,
  };
}

/**
 * Limita temporariamente um grupo muscular na sessão (função pura).
 * Reduz as séries de exercícios que ativam o músculo dolorido para 1 série de manutenção.
 */
export function applyMuscleLimitation(session: WorkoutSession, muscleGroup: string): WorkoutSession {
  const updatedExercises: ActiveExercise[] = session.exercises.map((exercise) => {
    const isTarget = musclesOverlap(exercise.muscleGroup, muscleGroup);
    if (!isTarget) return exercise;

    const warmupSets = exercise.sets.filter((s) => s.isWarmup === true);
    const workingSets = exercise.sets.filter((s) => !s.isWarmup);

    if (workingSets.length <= 1) return exercise;

    return {
      ...exercise,
      sets: [...warmupSets, ...workingSets.slice(0, 1)],
    };
  });

  return {
    ...session,
    exercises: updatedExercises,
  };
}

export interface ReadinessCorrelationResult {
  totalWithReadiness: number;
  optimalCount: number;
  moderateCount: number;
  lowCount: number;
  averageScore: number;
  optimalCompletionRate: number; // 0..100
  lowCompletionRate: number; // 0..100
  summary: string;
}

/**
 * Calcula correlação simples entre prontidão do check-in e desempenho das séries no histórico.
 */
export function calculateReadinessCorrelation(history: readonly WorkoutSession[]): ReadinessCorrelationResult | null {
  const sessionsWithReadiness = history.filter((s) => s.readiness && typeof s.readiness.score === 'number');

  if (sessionsWithReadiness.length === 0) {
    return null;
  }

  let totalScore = 0;
  let optimalCount = 0;
  let moderateCount = 0;
  let lowCount = 0;

  let optimalTotalSets = 0;
  let optimalCompletedSets = 0;

  let lowTotalSets = 0;
  let lowCompletedSets = 0;

  for (const session of sessionsWithReadiness) {
    const checkIn = session.readiness!;
    totalScore += checkIn.score;

    if (checkIn.level === 'optimal') optimalCount++;
    else if (checkIn.level === 'moderate') moderateCount++;
    else lowCount++;

    const isHigh = checkIn.score >= 75;

    for (const ex of session.exercises) {
      for (const set of ex.sets) {
        if (set.isWarmup) continue;
        if (isHigh) {
          optimalTotalSets++;
          if (set.completed) optimalCompletedSets++;
        } else {
          lowTotalSets++;
          if (set.completed) lowCompletedSets++;
        }
      }
    }
  }

  const averageScore = Math.round(totalScore / sessionsWithReadiness.length);
  const optimalCompletionRate = optimalTotalSets > 0
    ? Math.round((optimalCompletedSets / optimalTotalSets) * 100)
    : 100;
  const lowCompletionRate = lowTotalSets > 0
    ? Math.round((lowCompletedSets / lowTotalSets) * 100)
    : 100;

  let summary = `Você registrou prontidão em ${sessionsWithReadiness.length} treino(s), com média de ${averageScore} pts.`;
  if (optimalTotalSets > 0 && lowTotalSets > 0) {
    summary += ` Em dias de alta prontidão sua taxa de séries concluídas foi de ${optimalCompletionRate}% vs ${lowCompletionRate}% em dias de prontidão moderada/baixa.`;
  } else if (optimalTotalSets > 0) {
    summary += ` Sua taxa média de conclusão de séries com boa prontidão é de ${optimalCompletionRate}%.`;
  }

  return {
    totalWithReadiness: sessionsWithReadiness.length,
    optimalCount,
    moderateCount,
    lowCount,
    averageScore,
    optimalCompletionRate,
    lowCompletionRate,
    summary,
  };
}
