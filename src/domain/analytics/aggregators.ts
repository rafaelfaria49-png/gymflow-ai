import type {
  ActiveExercise,
  WorkoutSession,
  WorkoutSet,
  WorkoutSwapReasonCode,
} from '../../types';
import type {
  AdherenceAnalytics,
  AnalyticsTimeWindow,
  EvolutionReport,
  ExerciseAnalytics,
  ExerciseComparisonItem,
  ExerciseMetricPoint,
  MuscleGroupWeeklyVolume,
  NeglectedMuscleGroup,
  ReadinessCorrelationAnalytics,
  SessionComparison,
  SwapAndSkipAnalytics,
  TextualInsight,
  WeeklyAdherenceBreakdown,
  WeeklyDataPoint,
} from './types';

// Mapas canônicos de grupos musculares para rótulos em português
export const MUSCLE_GROUP_LABELS: Record<string, string> = {
  chest: 'Peito',
  back: 'Costas',
  shoulders: 'Ombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  quadriceps: 'Quadríceps',
  hamstrings: 'Posterior de coxa',
  glutes: 'Glúteos',
  calves: 'Panturrilhas',
  legs: 'Pernas',
  legs_general: 'Pernas',
  abs: 'Abdômen/Core',
  core: 'Abdômen/Core',
  traps: 'Trapézios',
  forearms: 'Antebraços',
  cardio: 'Cardio',
  functional: 'Funcional',
  mobility: 'Mobilidade',
};

export function resolveMuscleGroupLabel(group: string): string {
  const normalized = group.toLowerCase().trim();
  return MUSCLE_GROUP_LABELS[normalized] ?? group;
}

/**
 * Identifica se uma sessão é considerada pré-v2 (legada).
 * Sessões legadas pré-v2 não possuem status explícito gravado ou timestamps de ciclo de vida.
 */
export function isLegacySession(session: WorkoutSession): boolean {
  if (!session.status) return true;
  if (session.endedAt === undefined && session.startedAt === undefined) return true;
  return false;
}

/**
 * Retorna o timestamp (epoch ms) de uma sessão com fallback seguro.
 */
export function getSessionTimestamp(session: WorkoutSession): number {
  if (session.endedAt && session.endedAt > 0) return session.endedAt;
  if (session.startedAt && session.startedAt > 0) return session.startedAt;
  const parsed = Date.parse(session.date);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Filtra sessões estritamente dentro da janela temporal (4, 8 ou 12 semanas).
 */
export function filterSessionsByWindow(
  sessions: readonly WorkoutSession[],
  windowWeeks: AnalyticsTimeWindow = 4,
  referenceDate?: Date | number,
): WorkoutSession[] {
  if (!sessions || sessions.length === 0) return [];

  const refTime = referenceDate
    ? typeof referenceDate === 'number'
      ? referenceDate
      : referenceDate.getTime()
    : (sessions.length > 0 ? Math.max(...sessions.map(getSessionTimestamp)) : Date.now());

  const windowDurationMs = windowWeeks * 7 * 24 * 60 * 60 * 1000;
  const windowStartMs = refTime - windowDurationMs;

  return sessions.filter((s) => {
    const t = getSessionTimestamp(s);
    return t >= windowStartMs && t <= refTime + 86400000;
  });
}

/**
 * Extrai séries de trabalho válidas (excluindo aquecimento).
 */
function getWorkingSets(exercise: ActiveExercise): WorkoutSet[] {
  return (exercise.sets ?? []).filter((s) => !s.isWarmup);
}

/**
 * Calcula volume em kg de um exercício considerando séries de trabalho concluídas.
 */
function calculateExerciseVolume(exercise: ActiveExercise): number {
  let volume = 0;
  const workingSets = getWorkingSets(exercise);
  for (const set of workingSets) {
    if (set.completed && set.weight > 0 && set.reps > 0) {
      volume += set.weight * set.reps;
    }
  }
  // Se houver registro técnico com stages concluídos (ex: drop set, sets especiais)
  if (exercise.techniqueLog?.stages) {
    for (const stage of exercise.techniqueLog.stages) {
      if (stage.completed && stage.weight > 0 && stage.reps > 0) {
        // Se já não tiver sido contabilizado no sets
        if (!workingSets.some((s) => s.id === stage.id)) {
          volume += stage.weight * stage.reps;
        }
      }
    }
  }
  return Math.round(volume * 10) / 10;
}

/**
 * Agregador puro: evolução por exercício na janela temporal.
 */
export function aggregateExerciseEvolution(
  sessions: readonly WorkoutSession[],
): ExerciseAnalytics[] {
  if (!sessions || sessions.length === 0) return [];

  // Ordena cronologicamente (do mais antigo para o mais recente)
  const sortedSessions = [...sessions].sort(
    (a, b) => getSessionTimestamp(a) - getSessionTimestamp(b),
  );

  const exerciseMap = new Map<
    string,
    {
      exerciseId: string;
      exerciseName: string;
      muscleGroup: string;
      points: ExerciseMetricPoint[];
    }
  >();

  for (const session of sortedSessions) {
    const timestamp = getSessionTimestamp(session);
    const legacy = isLegacySession(session);

    for (const exercise of session.exercises) {
      const workingSets = getWorkingSets(exercise);
      const completedSets = workingSets.filter((s) => s.completed);

      // Se não há séries concluídas (ex: exercício pulado), não cria ponto de carga/volume
      if (completedSets.length === 0) continue;

      let maxWeight = 0;
      let repsAtMaxWeight = 0;
      let totalReps = 0;

      for (const set of completedSets) {
        totalReps += set.reps;
        if (
          set.weight > maxWeight ||
          (set.weight === maxWeight && set.reps > repsAtMaxWeight)
        ) {
          maxWeight = set.weight;
          repsAtMaxWeight = set.reps;
        }
      }

      const volumeKg = calculateExerciseVolume(exercise);
      const key = (exercise.exerciseId || exercise.name).toLowerCase().trim();

      if (!exerciseMap.has(key)) {
        exerciseMap.set(key, {
          exerciseId: exercise.exerciseId || key,
          exerciseName: exercise.name,
          muscleGroup: exercise.muscleGroup,
          points: [],
        });
      }

      const group = exerciseMap.get(key)!;
      group.points.push({
        date: session.date,
        timestamp,
        sessionId: session.id,
        sessionName: session.name,
        maxWeight,
        repsAtMaxWeight,
        totalReps,
        workingSets: completedSets.length,
        volumeKg,
        isPR: false, // anotado a seguir
        isLegacy: legacy,
      });
    }
  }

  const results: ExerciseAnalytics[] = [];

  for (const [, entry] of exerciseMap.entries()) {
    const points = entry.points;
    if (points.length === 0) continue;

    // Detectar PRs cumulativos ao longo do tempo
    let highestWeight = 0;
    let highestRepsAtWeight = 0;
    let currentPR: ExerciseAnalytics['currentPR'] = null;

    for (const pt of points) {
      if (
        pt.maxWeight > highestWeight ||
        (pt.maxWeight === highestWeight && pt.repsAtMaxWeight > highestRepsAtWeight)
      ) {
        highestWeight = pt.maxWeight;
        highestRepsAtWeight = pt.repsAtMaxWeight;
        pt.isPR = true;
        currentPR = {
          weight: pt.maxWeight,
          reps: pt.repsAtMaxWeight,
          date: pt.date,
          sessionId: pt.sessionId,
        };
      }
    }

    const first = points[0];
    const latest = points[points.length - 1];

    const weightDeltaKg = Math.round((latest.maxWeight - first.maxWeight) * 10) / 10;
    const weightDeltaPercent =
      first.maxWeight > 0
        ? Math.round(((latest.maxWeight - first.maxWeight) / first.maxWeight) * 1000) / 10
        : 0;

    const volumeDeltaKg = Math.round((latest.volumeKg - first.volumeKg) * 10) / 10;
    const volumeDeltaPercent =
      first.volumeKg > 0
        ? Math.round(((latest.volumeKg - first.volumeKg) / first.volumeKg) * 1000) / 10
        : 0;

    let status: ExerciseAnalytics['status'] = 'new';
    if (points.length >= 2) {
      if (weightDeltaKg > 0) {
        status = 'progressed';
      } else if (weightDeltaKg < 0) {
        status = 'regressed';
      } else {
        status = 'stagnant';
      }
    }

    const totalWorkingSetsCount = points.reduce((acc, p) => acc + p.workingSets, 0);
    const totalVolumeKg = points.reduce((acc, p) => acc + p.volumeKg, 0);

    results.push({
      exerciseId: entry.exerciseId,
      exerciseName: entry.exerciseName,
      muscleGroup: entry.muscleGroup,
      totalSessions: points.length,
      history: points,
      currentMaxWeight: latest.maxWeight,
      initialMaxWeight: first.maxWeight,
      weightDeltaKg,
      weightDeltaPercent,
      currentMaxVolumeKg: latest.volumeKg,
      initialMaxVolumeKg: first.volumeKg,
      volumeDeltaKg,
      volumeDeltaPercent,
      currentPR,
      status,
      totalWorkingSetsCount,
      totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
    });
  }

  // Ordena por maior número de sessões e depois por nome
  return results.sort((a, b) => b.totalSessions - a.totalSessions || a.exerciseName.localeCompare(b.exerciseName));
}

/**
 * Agregador puro: volume semanal por grupo muscular (planejado x executado).
 */
export function aggregateMuscleGroupVolumes(
  sessions: readonly WorkoutSession[],
  windowWeeks: AnalyticsTimeWindow = 4,
  referenceDate?: Date | number,
): MuscleGroupWeeklyVolume[] {
  if (!sessions || sessions.length === 0) return [];

  const refTime = referenceDate
    ? typeof referenceDate === 'number'
      ? referenceDate
      : referenceDate.getTime()
    : (sessions.length > 0 ? Math.max(...sessions.map(getSessionTimestamp)) : Date.now());

  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const windowDurationMs = windowWeeks * oneWeekMs;
  const windowStartMs = refTime - windowDurationMs;

  const weeklyBuckets: Array<{
    weekIndex: number;
    weekLabel: string;
    start: number;
    end: number;
  }> = [];

  for (let w = 0; w < windowWeeks; w++) {
    const start = windowStartMs + w * oneWeekMs;
    const end = start + oneWeekMs;
    weeklyBuckets.push({
      weekIndex: w,
      weekLabel: `Sem ${w + 1}`,
      start,
      end,
    });
  }

  interface GroupAccumulator {
    muscleGroupId: string;
    muscleGroupLabel: string;
    plannedSets: number;
    executedSets: number;
    weekly: WeeklyDataPoint[];
  }

  const map = new Map<string, GroupAccumulator>();

  function getOrInitGroup(id: string): GroupAccumulator {
    const normalized = id.toLowerCase().trim();
    if (!map.has(normalized)) {
      map.set(normalized, {
        muscleGroupId: normalized,
        muscleGroupLabel: resolveMuscleGroupLabel(normalized),
        plannedSets: 0,
        executedSets: 0,
        weekly: weeklyBuckets.map((b) => ({
          weekIndex: b.weekIndex,
          weekLabel: b.weekLabel,
          weekStartIso: new Date(b.start).toISOString(),
          weekEndIso: new Date(b.end).toISOString(),
          plannedSets: 0,
          executedSets: 0,
        })),
      });
    }
    return map.get(normalized)!;
  }

  for (const session of sessions) {
    const ts = getSessionTimestamp(session);
    if (ts < windowStartMs || ts > refTime + 86400000) continue;

    // Acha a semana
    const weekIdx = Math.min(
      windowWeeks - 1,
      Math.max(0, Math.floor((ts - windowStartMs) / oneWeekMs)),
    );

    for (const exercise of session.exercises) {
      const muscle = exercise.muscleGroup || 'geral';
      const group = getOrInitGroup(muscle);

      const workingSets = getWorkingSets(exercise);
      const isSkipped =
        exercise.entryStatus === 'skipped' ||
        (workingSets.length > 0 && workingSets.every((s) => !s.completed));

      const planned = workingSets.length;
      const executed = isSkipped ? 0 : workingSets.filter((s) => s.completed).length;

      group.plannedSets += planned;
      group.executedSets += executed;

      group.weekly[weekIdx].plannedSets += planned;
      group.weekly[weekIdx].executedSets += executed;
    }
  }

  return Array.from(map.values())
    .map((g) => ({
      muscleGroupId: g.muscleGroupId,
      muscleGroupLabel: g.muscleGroupLabel,
      plannedSets: g.plannedSets,
      executedSets: g.executedSets,
      weeklyData: g.weekly,
    }))
    .sort((a, b) => b.executedSets - a.executedSets);
}

/**
 * Agregador puro: detecção de grupos musculares negligenciados com percentual e diagnóstico.
 */
export function detectNeglectedMuscleGroups(
  volumes: MuscleGroupWeeklyVolume[],
  windowWeeks: AnalyticsTimeWindow = 4,
): NeglectedMuscleGroup[] {
  if (!volumes || volumes.length === 0) return [];

  const results: NeglectedMuscleGroup[] = [];
  const volMap = new Map<string, MuscleGroupWeeklyVolume>();
  for (const v of volumes) {
    volMap.set(v.muscleGroupId.toLowerCase().trim(), v);
  }

  // 1. Razão Posterior de coxa vs Quadríceps
  const quads = volMap.get('quadriceps');
  const hamstrings = volMap.get('hamstrings');
  if (quads && quads.executedSets > 0) {
    const hSets = hamstrings ? hamstrings.executedSets : 0;
    const ratio = hSets / quads.executedSets;
    if (ratio < 0.5) {
      const pct = Math.round(ratio * 100);
      results.push({
        muscleGroupId: 'hamstrings',
        muscleGroupLabel: 'Posterior de coxa',
        executedSets: hSets,
        plannedSets: hamstrings ? hamstrings.plannedSets : 0,
        executionRatio: ratio,
        severity: hSets === 0 ? 'alert' : 'warning',
        reason: `Posterior de coxa recebeu ${pct}% do volume de quadríceps nas últimas ${windowWeeks} semanas`,
        comparatorGroupName: 'Quadríceps',
        comparatorGroupSets: quads.executedSets,
      });
    }
  }

  // 2. Razão Costas vs Peito
  const chest = volMap.get('chest');
  const back = volMap.get('back');
  if (chest && chest.executedSets > 0) {
    const bSets = back ? back.executedSets : 0;
    const ratio = bSets / chest.executedSets;
    if (ratio < 0.6) {
      const pct = Math.round(ratio * 100);
      results.push({
        muscleGroupId: 'back',
        muscleGroupLabel: 'Costas',
        executedSets: bSets,
        plannedSets: back ? back.plannedSets : 0,
        executionRatio: ratio,
        severity: bSets === 0 ? 'alert' : 'warning',
        reason: `Costas recebeu ${pct}% do volume de peito nas últimas ${windowWeeks} semanas`,
        comparatorGroupName: 'Peito',
        comparatorGroupSets: chest.executedSets,
      });
    }
  }

  // 3. Grupos com grande déficit de execução (executado < 50% do planejado, com ao menos 4 séries planejadas)
  for (const v of volumes) {
    // Evita duplicar se já foi adicionado acima
    if (results.some((r) => r.muscleGroupId === v.muscleGroupId)) continue;

    if (v.plannedSets >= 4) {
      const ratio = v.executedSets / v.plannedSets;
      if (ratio < 0.5) {
        const pct = Math.round(ratio * 100);
        results.push({
          muscleGroupId: v.muscleGroupId,
          muscleGroupLabel: v.muscleGroupLabel,
          executedSets: v.executedSets,
          plannedSets: v.plannedSets,
          executionRatio: ratio,
          severity: v.executedSets === 0 ? 'alert' : 'warning',
          reason: `${v.muscleGroupLabel} teve apenas ${pct}% das séries planejadas executadas (${v.executedSets}/${v.plannedSets} séries nas últimas ${windowWeeks} semanas)`,
        });
      }
    }
  }

  return results;
}

/**
 * Agregador puro: aderência, taxa de completude, tempo médio e semanas consecutivas.
 */
export function aggregateAdherence(
  sessions: readonly WorkoutSession[],
  windowWeeks: AnalyticsTimeWindow = 4,
  referenceDate?: Date | number,
): AdherenceAnalytics {
  if (!sessions || sessions.length === 0) {
    return {
      totalSessions: 0,
      completedSessions: 0,
      partialSessions: 0,
      abandonedSessions: 0,
      completionRatePercent: 0,
      setCompletionRatePercent: 0,
      totalWorkingSetsPlanned: 0,
      totalWorkingSetsExecuted: 0,
      averageDurationMinutes: 0,
      consecutiveWeeksStreak: 0,
      totalVolumeKg: 0,
      weeklyBreakdown: [],
    };
  }

  const refTime = referenceDate
    ? typeof referenceDate === 'number'
      ? referenceDate
      : referenceDate.getTime()
    : (sessions.length > 0 ? Math.max(...sessions.map(getSessionTimestamp)) : Date.now());

  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const windowDurationMs = windowWeeks * oneWeekMs;
  const windowStartMs = refTime - windowDurationMs;

  const weeklyBreakdown: WeeklyAdherenceBreakdown[] = [];
  for (let w = 0; w < windowWeeks; w++) {
    weeklyBreakdown.push({
      weekIndex: w,
      weekLabel: `Sem ${w + 1}`,
      completed: 0,
      partial: 0,
      abandoned: 0,
      totalSessions: 0,
      avgDurationMinutes: 0,
      totalVolumeKg: 0,
    });
  }

  let completedSessions = 0;
  let partialSessions = 0;
  let abandonedSessions = 0;
  let totalDurationSeconds = 0;
  let totalWorkingSetsPlanned = 0;
  let totalWorkingSetsExecuted = 0;
  let totalVolumeKg = 0;

  const weeklyDurations: number[][] = Array.from({ length: windowWeeks }, () => []);

  for (const session of sessions) {
    const ts = getSessionTimestamp(session);
    if (ts < windowStartMs || ts > refTime + 86400000) continue;

    const weekIdx = Math.min(
      windowWeeks - 1,
      Math.max(0, Math.floor((ts - windowStartMs) / oneWeekMs)),
    );

    const status = session.status ?? 'completed';
    if (status === 'completed') {
      completedSessions++;
      weeklyBreakdown[weekIdx].completed++;
    } else if (status === 'partial') {
      partialSessions++;
      weeklyBreakdown[weekIdx].partial++;
    } else {
      abandonedSessions++;
      weeklyBreakdown[weekIdx].abandoned++;
    }

    weeklyBreakdown[weekIdx].totalSessions++;
    totalDurationSeconds += session.duration || 0;
    weeklyDurations[weekIdx].push(session.duration || 0);

    // Soma volume da sessão
    const sessVol =
      session.totalVolume && session.totalVolume > 0
        ? session.totalVolume
        : session.exercises.reduce((acc, ex) => acc + calculateExerciseVolume(ex), 0);
    totalVolumeKg += sessVol;
    weeklyBreakdown[weekIdx].totalVolumeKg += sessVol;

    // Séries
    for (const ex of session.exercises) {
      const working = getWorkingSets(ex);
      totalWorkingSetsPlanned += working.length;
      totalWorkingSetsExecuted += working.filter((s) => s.completed).length;
    }
  }

  // Médias de duração por semana
  for (let w = 0; w < windowWeeks; w++) {
    const durs = weeklyDurations[w];
    weeklyBreakdown[w].avgDurationMinutes =
      durs.length > 0 ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length / 60) : 0;
    weeklyBreakdown[w].totalVolumeKg = Math.round(weeklyBreakdown[w].totalVolumeKg);
  }

  const totalSessions = completedSessions + partialSessions + abandonedSessions;
  const completionRatePercent =
    totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 1000) / 10 : 0;
  const setCompletionRatePercent =
    totalWorkingSetsPlanned > 0
      ? Math.round((totalWorkingSetsExecuted / totalWorkingSetsPlanned) * 1000) / 10
      : 0;
  const averageDurationMinutes =
    totalSessions > 0 ? Math.round(totalDurationSeconds / totalSessions / 60) : 0;

  // Semanas consecutivas ativas (da semana mais recente para trás)
  let consecutiveWeeksStreak = 0;
  for (let w = windowWeeks - 1; w >= 0; w--) {
    if (weeklyBreakdown[w].totalSessions > 0) {
      consecutiveWeeksStreak++;
    } else {
      break;
    }
  }

  return {
    totalSessions,
    completedSessions,
    partialSessions,
    abandonedSessions,
    completionRatePercent,
    setCompletionRatePercent,
    totalWorkingSetsPlanned,
    totalWorkingSetsExecuted,
    averageDurationMinutes,
    consecutiveWeeksStreak,
    totalVolumeKg: Math.round(totalVolumeKg),
    weeklyBreakdown,
  };
}

/**
 * Agregador puro: substituições e pulos frequentes com motivo.
 */
export function aggregateSwapsAndSkips(
  sessions: readonly WorkoutSession[],
): SwapAndSkipAnalytics {
  const swapReasonDistribution: Record<WorkoutSwapReasonCode | 'unspecified', number> = {
    'equipment-occupied': 0,
    'equipment-unavailable': 0,
    discomfort: 0,
    preference: 0,
    'technique-fit': 0,
    other: 0,
    unspecified: 0,
  };

  const swapCounts = new Map<
    string,
    { name: string; count: number; reasons: Record<string, number> }
  >();
  const skipCounts = new Map<string, { name: string; count: number }>();

  let totalSwaps = 0;
  let totalSkips = 0;

  for (const session of sessions) {
    for (const exercise of session.exercises) {
      // 1. Substituição
      if (exercise.entryOrigin === 'swapped') {
        totalSwaps++;
        const reason = exercise.swapReasonCode || 'unspecified';
        swapReasonDistribution[reason] = (swapReasonDistribution[reason] || 0) + 1;

        const name = exercise.plannedExerciseName || exercise.name;
        if (!swapCounts.has(name)) {
          swapCounts.set(name, { name, count: 0, reasons: {} });
        }
        const record = swapCounts.get(name)!;
        record.count++;
        record.reasons[reason] = (record.reasons[reason] || 0) + 1;
      }

      // 2. Pulo (skipped)
      const workingSets = getWorkingSets(exercise);
      const isSkipped =
        exercise.entryStatus === 'skipped' ||
        (workingSets.length > 0 && workingSets.every((s) => !s.completed));

      if (isSkipped) {
        totalSkips++;
        const name = exercise.name;
        if (!skipCounts.has(name)) {
          skipCounts.set(name, { name, count: 0 });
        }
        skipCounts.get(name)!.count++;
      }
    }
  }

  const mostSwapped = Array.from(swapCounts.values())
    .map((s) => {
      let topReason: WorkoutSwapReasonCode | undefined;
      let topCount = 0;
      for (const [r, c] of Object.entries(s.reasons)) {
        if (c > topCount && r !== 'unspecified') {
          topCount = c;
          topReason = r as WorkoutSwapReasonCode;
        }
      }
      return {
        name: s.name,
        count: s.count,
        primaryReason: topReason,
        reasonDistribution: s.reasons,
      };
    })
    .sort((a, b) => b.count - a.count);

  const mostSkipped = Array.from(skipCounts.values())
    .map((s) => ({ name: s.name, count: s.count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalSwaps,
    totalSkips,
    swapReasonDistribution,
    mostSwapped,
    mostSkipped,
  };
}

/**
 * Agregador puro: correlação de prontidão (readiness) com volume e taxa de conclusão.
 */
export function aggregateReadinessCorrelation(
  sessions: readonly WorkoutSession[],
): ReadinessCorrelationAnalytics {
  const withReadiness = sessions.filter(
    (s) => s.readiness && typeof s.readiness.score === 'number',
  );

  if (withReadiness.length === 0) {
    return {
      totalWithReadiness: 0,
      hasData: false,
      optimalCount: 0,
      moderateCount: 0,
      lowCount: 0,
      averageScore: 0,
      optimalAvgVolumeKg: 0,
      moderateAvgVolumeKg: 0,
      lowAvgVolumeKg: 0,
      optimalCompletionRate: 0,
      moderateCompletionRate: 0,
      lowCompletionRate: 0,
      summary: 'Nenhum check-in de prontidão registrado nesta janela.',
    };
  }

  let totalScore = 0;
  const groups = {
    optimal: { sessions: 0, completed: 0, volumes: [] as number[] },
    moderate: { sessions: 0, completed: 0, volumes: [] as number[] },
    low: { sessions: 0, completed: 0, volumes: [] as number[] },
  };

  for (const session of withReadiness) {
    const checkIn = session.readiness!;
    totalScore += checkIn.score;

    const level = checkIn.level || 'moderate';
    const group = groups[level] || groups.moderate;
    group.sessions++;

    if (session.status === 'completed' || (!session.status && !session.exercises.some((e) => e.entryStatus === 'skipped'))) {
      group.completed++;
    }

    const vol =
      session.totalVolume && session.totalVolume > 0
        ? session.totalVolume
        : session.exercises.reduce((acc, ex) => acc + calculateExerciseVolume(ex), 0);
    group.volumes.push(vol);
  }

  const avgVol = (arr: number[]) =>
    arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  const compRate = (completed: number, total: number) =>
    total > 0 ? Math.round((completed / total) * 100) : 0;

  const optimalAvgVolumeKg = avgVol(groups.optimal.volumes);
  const moderateAvgVolumeKg = avgVol(groups.moderate.volumes);
  const lowAvgVolumeKg = avgVol(groups.low.volumes);

  const optimalCompletionRate = compRate(groups.optimal.completed, groups.optimal.sessions);
  const moderateCompletionRate = compRate(groups.moderate.completed, groups.moderate.sessions);
  const lowCompletionRate = compRate(groups.low.completed, groups.low.sessions);

  let summary = '';
  if (groups.optimal.sessions > 0 && groups.low.sessions > 0) {
    const diffRate = optimalCompletionRate - lowCompletionRate;
    summary =
      diffRate > 0
        ? `Sessões com prontidão alta tiveram taxa de conclusão ${diffRate}% maior e volume médio superior em relação aos dias de prontidão baixa.`
        : 'Desempenho mantido consistente mesmo em dias com pontuações variadas de prontidão.';
  } else if (groups.optimal.sessions > 0) {
    summary = `${groups.optimal.sessions} treinos realizados com prontidão excelente, mantendo alta intensidade e conclusão das séries.`;
  } else {
    summary = `${withReadiness.length} check-ins registrados. Média geral de prontidão: ${Math.round(totalScore / withReadiness.length)} pts.`;
  }

  return {
    totalWithReadiness: withReadiness.length,
    hasData: true,
    optimalCount: groups.optimal.sessions,
    moderateCount: groups.moderate.sessions,
    lowCount: groups.low.sessions,
    averageScore: Math.round(totalScore / withReadiness.length),
    optimalAvgVolumeKg,
    moderateAvgVolumeKg,
    lowAvgVolumeKg,
    optimalCompletionRate,
    moderateCompletionRate,
    lowCompletionRate,
    summary,
  };
}

/**
 * Gera observações textuais inteligentes com razão estruturada.
 */
export function generateTextualInsights(params: {
  exerciseAnalytics: ExerciseAnalytics[];
  neglected: NeglectedMuscleGroup[];
  adherence: AdherenceAnalytics;
  swapsAndSkips: SwapAndSkipAnalytics;
  readiness: ReadinessCorrelationAnalytics;
  windowWeeks: AnalyticsTimeWindow;
}): TextualInsight[] {
  const { exerciseAnalytics, neglected, adherence, swapsAndSkips, windowWeeks } = params;
  const insights: TextualInsight[] = [];

  // 1. Insights de Progresso
  const progressed = exerciseAnalytics.filter((e) => e.status === 'progressed');
  if (progressed.length > 0) {
    const topProgressed = [...progressed].sort((a, b) => b.weightDeltaPercent - a.weightDeltaPercent)[0];
    insights.push({
      id: 'top-progression',
      category: 'progress',
      title: 'Evolução Expressiva de Carga',
      description: `${topProgressed.exerciseName} progrediu +${topProgressed.weightDeltaKg} kg (+${topProgressed.weightDeltaPercent}%) nas últimas ${windowWeeks} semanas.`,
      reason: `Carga inicial era ${topProgressed.initialMaxWeight} kg e alcançou ${topProgressed.currentMaxWeight} kg ao longo de ${topProgressed.totalSessions} sessões.`,
      severity: 'positive',
    });
  }

  // 2. Insights de Negligenciados
  for (const neg of neglected.slice(0, 2)) {
    insights.push({
      id: `neglected-${neg.muscleGroupId}`,
      category: 'gap',
      title: `Desequilíbrio Muscular: ${neg.muscleGroupLabel}`,
      description: neg.reason,
      reason: neg.comparatorGroupName
        ? `Desproporção biomecânica em relação a ${neg.comparatorGroupName} pode aumentar risco de lesão ou limitar simetria.`
        : `Volume abaixo da faixa mínima necessária para estímulo hipertrófico sustentado.`,
      severity: neg.severity === 'alert' ? 'warning' : 'neutral',
    });
  }

  // 3. Insights de Estagnação
  const stagnant = exerciseAnalytics.filter((e) => e.status === 'stagnant' && e.totalSessions >= 3);
  if (stagnant.length > 0) {
    const names = stagnant.slice(0, 2).map((e) => e.exerciseName).join(' e ');
    insights.push({
      id: 'stagnation-alert',
      category: 'stagnation',
      title: 'Estagnação de Cargas',
      description: `${names} manteve a mesma carga máxima nas últimas ${windowWeeks} semanas.`,
      reason: 'Sem aumento progressivo de repetições ou peso ao longo de 3+ treinos sucessivos.',
      severity: 'warning',
    });
  }

  // 4. Substituição Frequente por Equipamento
  if (swapsAndSkips.mostSwapped.length > 0) {
    const topSwapped = swapsAndSkips.mostSwapped[0];
    if (topSwapped.count >= 2) {
      const occupiedCount = topSwapped.reasonDistribution['equipment-occupied'] || 0;
      if (occupiedCount >= 2) {
        insights.push({
          id: 'frequent-swap-equipment',
          category: 'gap',
          title: 'Gargalo de Equipamento na Academia',
          description: `${topSwapped.name} foi substituído ${topSwapped.count} vezes, sendo ${occupiedCount} por equipamento ocupado.`,
          reason: 'Considerar horário de treino alternativo ou adotar exercício equivalente fixo na ficha.',
          severity: 'neutral',
        });
      }
    }
  }

  // 5. Aderência
  if (adherence.totalSessions >= 4 && adherence.completionRatePercent < 75) {
    insights.push({
      id: 'adherence-alert',
      category: 'gap',
      title: 'Sessões Incompletas Frequentes',
      description: `${Math.round(100 - adherence.completionRatePercent)}% dos treinos foram finalizados de forma parcial ou abandonados.`,
      reason: 'Interromper o treino antes de completar as séries reduz o volume acumulado efetivo.',
      severity: 'warning',
    });
  }

  return insights;
}

/**
 * Respostas prontas para o Roteiro de Usabilidade (<30s):
 * 1. Onde evoluí?
 * 2. Onde estagnei?
 * 3. O que faltou?
 */
export function buildUsabilityAnswers(params: {
  exerciseAnalytics: ExerciseAnalytics[];
  neglected: NeglectedMuscleGroup[];
  adherence: AdherenceAnalytics;
  swapsAndSkips: SwapAndSkipAnalytics;
  windowWeeks: AnalyticsTimeWindow;
}): {
  whereEvolved: string[];
  whereStagnant: string[];
  whatMissing: string[];
} {
  const { exerciseAnalytics, neglected, adherence, swapsAndSkips, windowWeeks } = params;

  // 1. Onde evoluí?
  const whereEvolved: string[] = [];
  const progressed = exerciseAnalytics
    .filter((e) => e.status === 'progressed')
    .sort((a, b) => b.weightDeltaKg - a.weightDeltaKg);

  if (progressed.length > 0) {
    for (const e of progressed.slice(0, 3)) {
      whereEvolved.push(
        `${e.exerciseName}: +${e.weightDeltaKg} kg (atingiu ${e.currentMaxWeight} kg)`,
      );
    }
  }

  const allPRs = exerciseAnalytics.filter((e) => e.currentPR !== null);
  if (allPRs.length > 0 && whereEvolved.length < 3) {
    whereEvolved.push(
      `${allPRs.length} recorde(s) pessoal(is) (PR) registrado(s) no período de ${windowWeeks} semanas`,
    );
  }

  if (adherence.consecutiveWeeksStreak > 1) {
    whereEvolved.push(
      `Consistência semanal: ${adherence.consecutiveWeeksStreak} semanas consecutivas de treino ativo`,
    );
  }

  if (whereEvolved.length === 0) {
    whereEvolved.push('Dados insuficientes para progressão — continue registrando seus treinos!');
  }

  // 2. Onde estagnei?
  const whereStagnant: string[] = [];
  const stagnant = exerciseAnalytics.filter((e) => e.status === 'stagnant' && e.totalSessions >= 2);
  if (stagnant.length > 0) {
    for (const e of stagnant.slice(0, 3)) {
      whereStagnant.push(
        `${e.exerciseName}: carga estável em ${e.currentMaxWeight} kg por ${e.totalSessions} sessões seguidas`,
      );
    }
  }

  const regressed = exerciseAnalytics.filter((e) => e.status === 'regressed');
  if (regressed.length > 0) {
    for (const e of regressed.slice(0, 2)) {
      whereStagnant.push(
        `${e.exerciseName}: queda de ${Math.abs(e.weightDeltaKg)} kg em relação à 1ª sessão da janela`,
      );
    }
  }

  if (whereStagnant.length === 0) {
    whereStagnant.push('Nenhuma estagnação evidente identificada na janela atual.');
  }

  // 3. O que faltou?
  const whatMissing: string[] = [];
  for (const n of neglected.slice(0, 2)) {
    whatMissing.push(n.reason);
  }

  if (adherence.partialSessions > 0 || adherence.abandonedSessions > 0) {
    whatMissing.push(
      `${adherence.partialSessions + adherence.abandonedSessions} treino(s) não foram concluído(s) integralmente (${adherence.partialSessions} parciais, ${adherence.abandonedSessions} abandonados)`,
    );
  }

  if (swapsAndSkips.totalSkips > 0) {
    const topSkipped = swapsAndSkips.mostSkipped[0];
    whatMissing.push(
      `${swapsAndSkips.totalSkips} exercício(s) pulado(s) — principal: ${topSkipped?.name} (${topSkipped?.count}x)`,
    );
  }

  if (whatMissing.length === 0) {
    whatMissing.push('Treinos equilibrados: sem grupos musculares negligenciados ou pulos frequentes!');
  }

  return {
    whereEvolved,
    whereStagnant,
    whatMissing,
  };
}

/**
 * Comparativo pós-treino vs sessão anterior (ou equivalente).
 */
export function compareWithPreviousSession(
  currentSession: WorkoutSession,
  history: readonly WorkoutSession[],
): SessionComparison {
  const currentTs = getSessionTimestamp(currentSession);
  const isCurrentLegacy = isLegacySession(currentSession);

  // Calcula volume do treino atual
  const currentVolume =
    currentSession.totalVolume && currentSession.totalVolume > 0
      ? currentSession.totalVolume
      : currentSession.exercises.reduce((acc, ex) => acc + calculateExerciseVolume(ex), 0);

  const currentDurationMin = Math.round((currentSession.duration || 0) / 60);

  let currentSetsCompleted = 0;
  for (const ex of currentSession.exercises) {
    currentSetsCompleted += getWorkingSets(ex).filter((s) => s.completed).length;
  }

  // Candidatos no histórico que são estritamente anteriores
  const candidates = history.filter(
    (s) => s.id !== currentSession.id && getSessionTimestamp(s) < currentTs,
  );

  // Procura sessão equivalente (mesmo sourceProgramDayId, ou mesmo nome)
  let previous: WorkoutSession | null = null;
  if (currentSession.sourceProgramDayId) {
    previous =
      candidates.find((s) => s.sourceProgramDayId === currentSession.sourceProgramDayId) ?? null;
  }
  if (!previous && currentSession.name) {
    previous =
      candidates.find((s) => s.name.trim().toLowerCase() === currentSession.name.trim().toLowerCase()) ?? null;
  }
  // Fallback para a sessão cronologicamente mais recente antes da atual
  if (!previous && candidates.length > 0) {
    const sorted = [...candidates].sort((a, b) => getSessionTimestamp(b) - getSessionTimestamp(a));
    previous = sorted[0];
  }

  if (!previous) {
    const exercises: ExerciseComparisonItem[] = currentSession.exercises.map((ex) => {
      const working = getWorkingSets(ex).filter((s) => s.completed);
      let maxW = 0;
      let repsAtMax = 0;
      for (const s of working) {
        if (s.weight > maxW || (s.weight === maxW && s.reps > repsAtMax)) {
          maxW = s.weight;
          repsAtMax = s.reps;
        }
      }
      const vol = calculateExerciseVolume(ex);
      return {
        exerciseName: ex.name,
        muscleGroup: ex.muscleGroup,
        currentMaxWeight: maxW,
        currentRepsAtMax: repsAtMax,
        weightDeltaKg: 0,
        currentVolumeKg: vol,
        volumeDeltaKg: 0,
        currentCompletedSets: working.length,
        status: 'new',
      };
    });

    return {
      currentSession: {
        id: currentSession.id,
        name: currentSession.name,
        date: currentSession.date,
        volumeKg: Math.round(currentVolume),
        durationMinutes: currentDurationMin,
        setsCompleted: currentSetsCompleted,
        isLegacy: isCurrentLegacy,
      },
      previousSession: null,
      volumeDeltaKg: 0,
      volumeDeltaPercent: 0,
      durationDeltaMinutes: 0,
      setsDelta: 0,
      exercises,
    };
  }

  const prevTs = getSessionTimestamp(previous);
  const isPrevLegacy = isLegacySession(previous);

  const prevVolume =
    previous.totalVolume && previous.totalVolume > 0
      ? previous.totalVolume
      : previous.exercises.reduce((acc, ex) => acc + calculateExerciseVolume(ex), 0);

  const prevDurationMin = Math.round((previous.duration || 0) / 60);

  let prevSetsCompleted = 0;
  for (const ex of previous.exercises) {
    prevSetsCompleted += getWorkingSets(ex).filter((s) => s.completed).length;
  }

  const volumeDeltaKg = Math.round((currentVolume - prevVolume) * 10) / 10;
  const volumeDeltaPercent =
    prevVolume > 0 ? Math.round(((currentVolume - prevVolume) / prevVolume) * 1000) / 10 : 0;
  const durationDeltaMinutes = currentDurationMin - prevDurationMin;
  const setsDelta = currentSetsCompleted - prevSetsCompleted;

  // Comparação exercício por exercício
  const prevExerciseMap = new Map<string, ActiveExercise>();
  for (const ex of previous.exercises) {
    prevExerciseMap.set((ex.exerciseId || ex.name).toLowerCase().trim(), ex);
    prevExerciseMap.set(ex.name.toLowerCase().trim(), ex);
  }

  const exercises: ExerciseComparisonItem[] = currentSession.exercises.map((currentEx) => {
    const key = (currentEx.exerciseId || currentEx.name).toLowerCase().trim();
    const prevEx = prevExerciseMap.get(key) || prevExerciseMap.get(currentEx.name.toLowerCase().trim());

    const currentWorking = getWorkingSets(currentEx).filter((s) => s.completed);
    let curMaxW = 0;
    let curRepsAtMax = 0;
    for (const s of currentWorking) {
      if (s.weight > curMaxW || (s.weight === curMaxW && s.reps > curRepsAtMax)) {
        curMaxW = s.weight;
        curRepsAtMax = s.reps;
      }
    }
    const currentVol = calculateExerciseVolume(currentEx);

    if (!prevEx) {
      return {
        exerciseName: currentEx.name,
        muscleGroup: currentEx.muscleGroup,
        currentMaxWeight: curMaxW,
        currentRepsAtMax: curRepsAtMax,
        weightDeltaKg: 0,
        currentVolumeKg: currentVol,
        volumeDeltaKg: 0,
        currentCompletedSets: currentWorking.length,
        status: 'new',
      };
    }

    const prevWorking = getWorkingSets(prevEx).filter((s) => s.completed);
    let prevMaxW = 0;
    let prevRepsAtMax = 0;
    for (const s of prevWorking) {
      if (s.weight > prevMaxW || (s.weight === prevMaxW && s.reps > prevRepsAtMax)) {
        prevMaxW = s.weight;
        prevRepsAtMax = s.reps;
      }
    }
    const prevVol = calculateExerciseVolume(prevEx);

    const weightDelta = Math.round((curMaxW - prevMaxW) * 10) / 10;
    const volDelta = Math.round((currentVol - prevVol) * 10) / 10;

    let status: ExerciseComparisonItem['status'] = 'maintained';
    if (weightDelta > 0 || (weightDelta === 0 && curRepsAtMax > prevRepsAtMax)) {
      status = 'progressed';
    } else if (weightDelta < 0 || (weightDelta === 0 && curRepsAtMax < prevRepsAtMax)) {
      status = 'regressed';
    }

    return {
      exerciseName: currentEx.name,
      muscleGroup: currentEx.muscleGroup,
      currentMaxWeight: curMaxW,
      previousMaxWeight: prevMaxW,
      currentRepsAtMax: curRepsAtMax,
      previousRepsAtMax: prevRepsAtMax,
      weightDeltaKg: weightDelta,
      currentVolumeKg: currentVol,
      previousVolumeKg: prevVol,
      volumeDeltaKg: volDelta,
      currentCompletedSets: currentWorking.length,
      previousCompletedSets: prevWorking.length,
      status,
    };
  });

  return {
    currentSession: {
      id: currentSession.id,
      name: currentSession.name,
      date: currentSession.date,
      volumeKg: Math.round(currentVolume),
      durationMinutes: currentDurationMin,
      setsCompleted: currentSetsCompleted,
      isLegacy: isCurrentLegacy,
    },
    previousSession: {
      id: previous.id,
      name: previous.name,
      date: previous.date,
      volumeKg: Math.round(prevVolume),
      durationMinutes: prevDurationMin,
      setsCompleted: prevSetsCompleted,
      isLegacy: isPrevLegacy,
    },
    volumeDeltaKg,
    volumeDeltaPercent,
    durationDeltaMinutes,
    setsDelta,
    exercises,
  };
}

/**
 * Orquestrador analítico puro: compila o relatório completo de evolução v2.
 */
export function generateEvolutionReport(
  sessions: readonly WorkoutSession[],
  windowWeeks: AnalyticsTimeWindow = 4,
  referenceDate?: Date | number,
): EvolutionReport {
  const windowSessions = filterSessionsByWindow(sessions, windowWeeks, referenceDate);

  const legacySessionsCount = windowSessions.filter(isLegacySession).length;
  const hasLegacyData = legacySessionsCount > 0;

  const adherence = aggregateAdherence(windowSessions, windowWeeks, referenceDate);
  const muscleGroupVolumes = aggregateMuscleGroupVolumes(windowSessions, windowWeeks, referenceDate);
  const neglectedGroups = detectNeglectedMuscleGroups(muscleGroupVolumes, windowWeeks);
  const exerciseAnalytics = aggregateExerciseEvolution(windowSessions);
  const swapsAndSkips = aggregateSwapsAndSkips(windowSessions);
  const readiness = aggregateReadinessCorrelation(windowSessions);

  const insights = generateTextualInsights({
    exerciseAnalytics,
    neglected: neglectedGroups,
    adherence,
    swapsAndSkips,
    readiness,
    windowWeeks,
  });

  const usabilityAnswers = buildUsabilityAnswers({
    exerciseAnalytics,
    neglected: neglectedGroups,
    adherence,
    swapsAndSkips,
    windowWeeks,
  });

  return {
    windowWeeks,
    hasLegacyData,
    legacySessionsCount,
    totalSessionsInWindow: windowSessions.length,
    adherence,
    muscleGroupVolumes,
    neglectedGroups,
    exerciseAnalytics,
    swapsAndSkips,
    readiness,
    insights,
    usabilityAnswers,
  };
}
