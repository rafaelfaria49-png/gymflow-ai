import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../../types';
import {
  aggregateAdherence,
  aggregateExerciseEvolution,
  aggregateMuscleGroupVolumes,
  aggregateReadinessCorrelation,
  aggregateSwapsAndSkips,
  compareWithPreviousSession,
  detectNeglectedMuscleGroups,
  filterSessionsByWindow,
  generateEvolutionReport,
  isLegacySession,
} from './aggregators';

// Helper de timestamp base: 2026-06-01T12:00:00.000Z
const BASE_TIME = 1_780_315_200_000;
const ONE_DAY = 86_400_000;
const ONE_WEEK = 7 * ONE_DAY;

function makeTestSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'test-session-1',
    name: 'Treino A — Superior',
    date: new Date(BASE_TIME).toISOString(),
    duration: 3600,
    calories: 350,
    xpEarned: 150,
    status: 'completed',
    variant: 'standard',
    startedAt: BASE_TIME,
    endedAt: BASE_TIME + 3600_000,
    exercises: [
      {
        id: 'ex-1',
        exerciseId: 'chest_supino_reto',
        name: 'Supino Reto com Barra',
        muscleGroup: 'chest',
        entryOrigin: 'planned',
        entryStatus: 'performed',
        sets: [
          { id: 's-w', reps: 15, weight: 40, completed: true, isWarmup: true }, // Aquecimento (deve ser ignorado)
          { id: 's-1', reps: 10, weight: 80, completed: true, isWarmup: false },
          { id: 's-2', reps: 8, weight: 85, completed: true, isWarmup: false },
          { id: 's-3', reps: 6, weight: 90, completed: true, isWarmup: false },
        ],
      },
    ],
    ...overrides,
  };
}

describe('analytics aggregators', () => {
  describe('isLegacySession', () => {
    it('detecta sessão pré-v2 sem status ou variant', () => {
      const legacy = {
        id: 'legacy-1',
        name: 'Treino Antigo',
        date: '2026-01-10',
        duration: 2400,
        calories: 200,
        xpEarned: 100,
        exercises: [
          {
            id: 'leg-ex-1',
            exerciseId: 'leg_press',
            name: 'Leg Press',
            muscleGroup: 'legs',
            sets: [{ id: 's1', reps: 10, weight: 100, completed: true }],
          },
        ],
      } as WorkoutSession;

      expect(isLegacySession(legacy)).toBe(true);
    });

    it('detecta sessão moderna v2 com status e variant', () => {
      const modern = makeTestSession();
      expect(isLegacySession(modern)).toBe(false);
    });
  });

  describe('filterSessionsByWindow', () => {
    it('filtra sessões estritamente dentro da janela de 4 semanas', () => {
      const s1 = makeTestSession({ id: 's-in', startedAt: BASE_TIME, endedAt: BASE_TIME + 3600_000 });
      const sOld = makeTestSession({
        id: 's-old',
        startedAt: BASE_TIME - 5 * ONE_WEEK,
        endedAt: BASE_TIME - 5 * ONE_WEEK + 3600_000,
      });

      const filtered = filterSessionsByWindow([s1, sOld], 4, BASE_TIME);
      expect(filtered.map((s) => s.id)).toEqual(['s-in']);
    });

    it('inclui sessões antigas ao expandir para 8 ou 12 semanas', () => {
      const sOld = makeTestSession({
        id: 's-old',
        startedAt: BASE_TIME - 6 * ONE_WEEK,
        endedAt: BASE_TIME - 6 * ONE_WEEK + 3600_000,
      });

      expect(filterSessionsByWindow([sOld], 4, BASE_TIME)).toHaveLength(0);
      expect(filterSessionsByWindow([sOld], 8, BASE_TIME)).toHaveLength(1);
      expect(filterSessionsByWindow([sOld], 12, BASE_TIME)).toHaveLength(1);
    });
  });

  describe('aggregateExerciseEvolution', () => {
    it('ignora séries de aquecimento no cálculo de carga máxima, reps e volume', () => {
      const session = makeTestSession();
      const analytics = aggregateExerciseEvolution([session]);

      expect(analytics).toHaveLength(1);
      const supino = analytics[0];
      expect(supino.exerciseName).toBe('Supino Reto com Barra');
      // Séries de trabalho: 80x10 + 85x8 + 90x6 = 800 + 680 + 540 = 2020 kg
      // Aquecimento de 40x15 NÃO deve estar aqui!
      expect(supino.currentMaxWeight).toBe(90);
      expect(supino.currentPR?.weight).toBe(90);
      expect(supino.totalVolumeKg).toBe(2020);
      expect(supino.totalWorkingSetsCount).toBe(3);
    });

    it('detecta evolução de carga, status progressed e novos PRs ao longo do tempo', () => {
      const session1 = makeTestSession({
        id: 'sess-1',
        startedAt: BASE_TIME - 2 * ONE_WEEK,
        endedAt: BASE_TIME - 2 * ONE_WEEK + 3600_000,
        date: new Date(BASE_TIME - 2 * ONE_WEEK).toISOString(),
        exercises: [
          {
            id: 'ex-1',
            exerciseId: 'supino',
            name: 'Supino',
            muscleGroup: 'chest',
            sets: [{ id: 's1', reps: 10, weight: 80, completed: true }],
          },
        ],
      });

      const session2 = makeTestSession({
        id: 'sess-2',
        startedAt: BASE_TIME,
        endedAt: BASE_TIME + 3600_000,
        date: new Date(BASE_TIME).toISOString(),
        exercises: [
          {
            id: 'ex-1',
            exerciseId: 'supino',
            name: 'Supino',
            muscleGroup: 'chest',
            sets: [{ id: 's1', reps: 10, weight: 85, completed: true }],
          },
        ],
      });

      const analytics = aggregateExerciseEvolution([session1, session2]);
      expect(analytics).toHaveLength(1);
      const supino = analytics[0];
      expect(supino.initialMaxWeight).toBe(80);
      expect(supino.currentMaxWeight).toBe(85);
      expect(supino.weightDeltaKg).toBe(5);
      expect(supino.status).toBe('progressed');
      expect(supino.currentPR?.weight).toBe(85);
    });

    it('ignora exercícios pulados (sem séries concluídas) no cálculo de progressão', () => {
      const session = makeTestSession({
        exercises: [
          {
            id: 'ex-skip',
            exerciseId: 'crucifixo',
            name: 'Crucifixo',
            muscleGroup: 'chest',
            entryStatus: 'skipped',
            sets: [{ id: 's1', reps: 10, weight: 20, completed: false }],
          },
        ],
      });

      const analytics = aggregateExerciseEvolution([session]);
      expect(analytics).toHaveLength(0);
    });
  });

  describe('aggregateMuscleGroupVolumes & detectNeglectedMuscleGroups', () => {
    it('detecta quando posterior de coxa recebeu 40% do volume de quadríceps nas últimas 4 semanas', () => {
      // 10 séries de quadríceps e 4 séries de posterior
      const session = makeTestSession({
        exercises: [
          {
            id: 'ex-quad',
            exerciseId: 'leg_press',
            name: 'Leg Press',
            muscleGroup: 'quadriceps',
            sets: [
              { id: 'q1', reps: 10, weight: 200, completed: true },
              { id: 'q2', reps: 10, weight: 200, completed: true },
              { id: 'q3', reps: 10, weight: 200, completed: true },
              { id: 'q4', reps: 10, weight: 200, completed: true },
              { id: 'q5', reps: 10, weight: 200, completed: true },
              { id: 'q6', reps: 10, weight: 200, completed: true },
              { id: 'q7', reps: 10, weight: 200, completed: true },
              { id: 'q8', reps: 10, weight: 200, completed: true },
              { id: 'q9', reps: 10, weight: 200, completed: true },
              { id: 'q10', reps: 10, weight: 200, completed: true },
            ],
          },
          {
            id: 'ex-ham',
            exerciseId: 'mesa_flexora',
            name: 'Mesa Flexora',
            muscleGroup: 'hamstrings',
            sets: [
              { id: 'h1', reps: 10, weight: 50, completed: true },
              { id: 'h2', reps: 10, weight: 50, completed: true },
              { id: 'h3', reps: 10, weight: 50, completed: true },
              { id: 'h4', reps: 10, weight: 50, completed: true },
            ],
          },
        ],
      });

      const volumes = aggregateMuscleGroupVolumes([session], 4, BASE_TIME);
      const quadsVol = volumes.find((v) => v.muscleGroupId === 'quadriceps');
      const hamVol = volumes.find((v) => v.muscleGroupId === 'hamstrings');

      expect(quadsVol?.executedSets).toBe(10);
      expect(hamVol?.executedSets).toBe(4);

      const neglected = detectNeglectedMuscleGroups(volumes, 4);
      expect(neglected).toHaveLength(1);
      const hamNeg = neglected[0];
      expect(hamNeg.muscleGroupId).toBe('hamstrings');
      expect(hamNeg.reason).toBe('Posterior de coxa recebeu 40% do volume de quadríceps nas últimas 4 semanas');
      expect(hamNeg.severity).toBe('warning');
    });

    it('conta séries planejadas vs executadas quando há séries incompletas', () => {
      const session = makeTestSession({
        exercises: [
          {
            id: 'ex-chest',
            exerciseId: 'supino',
            name: 'Supino',
            muscleGroup: 'chest',
            sets: [
              { id: 's1', reps: 10, weight: 80, completed: true },
              { id: 's2', reps: 10, weight: 80, completed: true },
              { id: 's3', reps: 10, weight: 80, completed: false }, // Incompleta
              { id: 's4', reps: 10, weight: 80, completed: false }, // Incompleta
            ],
          },
        ],
      });

      const volumes = aggregateMuscleGroupVolumes([session], 4, BASE_TIME);
      const chestVol = volumes.find((v) => v.muscleGroupId === 'chest');
      expect(chestVol?.plannedSets).toBe(4);
      expect(chestVol?.executedSets).toBe(2);
    });
  });

  describe('aggregateSwapsAndSkips', () => {
    it('agrega substituições por motivo estruturado e exercícios pulados', () => {
      const session = makeTestSession({
        exercises: [
          {
            id: 'ex-swapped',
            exerciseId: 'supino_halteres',
            name: 'Supino com Halteres',
            muscleGroup: 'chest',
            entryOrigin: 'swapped',
            plannedExerciseName: 'Supino Reto com Barra',
            swapReasonCode: 'equipment-occupied',
            sets: [{ id: 's1', reps: 10, weight: 30, completed: true }],
          },
          {
            id: 'ex-skipped',
            exerciseId: 'cross_over',
            name: 'Crucifixo no Crossover',
            muscleGroup: 'chest',
            entryStatus: 'skipped',
            sets: [{ id: 's2', reps: 12, weight: 15, completed: false }],
          },
        ],
      });

      const analytics = aggregateSwapsAndSkips([session]);
      expect(analytics.totalSwaps).toBe(1);
      expect(analytics.totalSkips).toBe(1);
      expect(analytics.swapReasonDistribution['equipment-occupied']).toBe(1);
      expect(analytics.mostSwapped[0]).toMatchObject({
        name: 'Supino Reto com Barra',
        count: 1,
        primaryReason: 'equipment-occupied',
      });
      expect(analytics.mostSkipped[0]).toMatchObject({
        name: 'Crucifixo no Crossover',
        count: 1,
      });
    });
  });

  describe('aggregateAdherence', () => {
    it('calcula taxa de conclusão, tempo médio e semanas consecutivas ativas', () => {
      const s1 = makeTestSession({
        id: 's-1',
        status: 'completed',
        duration: 3600, // 60 min
        startedAt: BASE_TIME - 8 * ONE_DAY,
        endedAt: BASE_TIME - 8 * ONE_DAY + 3600_000,
      });

      const s2 = makeTestSession({
        id: 's-2',
        status: 'partial',
        duration: 1800, // 30 min
        startedAt: BASE_TIME,
        endedAt: BASE_TIME + 1800_000,
      });

      const adherence = aggregateAdherence([s1, s2], 4, BASE_TIME);
      expect(adherence.totalSessions).toBe(2);
      expect(adherence.completedSessions).toBe(1);
      expect(adherence.partialSessions).toBe(1);
      expect(adherence.completionRatePercent).toBe(50);
      expect(adherence.averageDurationMinutes).toBe(45); // (60 + 30) / 2
      expect(adherence.consecutiveWeeksStreak).toBe(2);
    });
  });

  describe('aggregateReadinessCorrelation', () => {
    it('correlaciona pontuações de prontidão com volume e conclusão', () => {
      const s1 = makeTestSession({
        id: 's-optimal',
        status: 'completed',
        totalVolume: 5000,
        readiness: {
          score: 90,
          level: 'optimal',
          completedAt: BASE_TIME,
          progressionImpact: 'normal',
          sleep: 'good',
          energy: 'high',
          stress: 'low',
          soreness: 'none',
          timeAvailable: 'plenty',
        },
      });

      const s2 = makeTestSession({
        id: 's-low',
        status: 'partial',
        totalVolume: 2500,
        readiness: {
          score: 40,
          level: 'low',
          completedAt: BASE_TIME,
          progressionImpact: 'conservative',
          sleep: 'poor',
          energy: 'low',
          stress: 'high',
          soreness: 'severe',
          timeAvailable: 'normal',
        },
      });

      const corr = aggregateReadinessCorrelation([s1, s2]);
      expect(corr.hasData).toBe(true);
      expect(corr.optimalCount).toBe(1);
      expect(corr.lowCount).toBe(1);
      expect(corr.optimalCompletionRate).toBe(100);
      expect(corr.lowCompletionRate).toBe(0);
      expect(corr.optimalAvgVolumeKg).toBe(5000);
      expect(corr.lowAvgVolumeKg).toBe(2500);
    });
  });

  describe('compareWithPreviousSession', () => {
    it('compara sessão atual com a sessão anterior equivalente calculando deltas de volume e carga', () => {
      const prevSession = makeTestSession({
        id: 'prev-session',
        name: 'Treino A',
        sourceProgramDayId: 'day-a',
        startedAt: BASE_TIME - ONE_WEEK,
        endedAt: BASE_TIME - ONE_WEEK + 3000_000,
        duration: 3000, // 50 min
        totalVolume: 1000,
        exercises: [
          {
            id: 'p-1',
            exerciseId: 'supino',
            name: 'Supino',
            muscleGroup: 'chest',
            sets: [{ id: 'ps1', reps: 10, weight: 80, completed: true }],
          },
        ],
      });

      const currentSession = makeTestSession({
        id: 'curr-session',
        name: 'Treino A',
        sourceProgramDayId: 'day-a',
        startedAt: BASE_TIME,
        endedAt: BASE_TIME + 3600_000,
        duration: 3600, // 60 min
        totalVolume: 1200,
        exercises: [
          {
            id: 'c-1',
            exerciseId: 'supino',
            name: 'Supino',
            muscleGroup: 'chest',
            sets: [{ id: 'cs1', reps: 10, weight: 85, completed: true }],
          },
        ],
      });

      const comparison = compareWithPreviousSession(currentSession, [prevSession, currentSession]);
      expect(comparison.previousSession).not.toBeNull();
      expect(comparison.previousSession?.id).toBe('prev-session');
      expect(comparison.volumeDeltaKg).toBe(200); // 1200 - 1000
      expect(comparison.durationDeltaMinutes).toBe(10); // 60 - 50
      expect(comparison.exercises).toHaveLength(1);

      const exComp = comparison.exercises[0];
      expect(exComp.exerciseName).toBe('Supino');
      expect(exComp.currentMaxWeight).toBe(85);
      expect(exComp.previousMaxWeight).toBe(80);
      expect(exComp.weightDeltaKg).toBe(5);
      expect(exComp.status).toBe('progressed');
    });

    it('lida com sessão inicial sem histórico prévio de forma graciosa', () => {
      const session = makeTestSession();
      const comparison = compareWithPreviousSession(session, [session]);
      expect(comparison.previousSession).toBeNull();
      expect(comparison.volumeDeltaKg).toBe(0);
      expect(comparison.exercises[0].status).toBe('new');
    });
  });

  describe('generateEvolutionReport', () => {
    it('gera relatório unificado e responde às 3 perguntas de usabilidade em <30s', () => {
      const s1 = makeTestSession({
        id: 's1',
        startedAt: BASE_TIME - ONE_WEEK,
        endedAt: BASE_TIME - ONE_WEEK + 3600_000,
        exercises: [
          {
            id: 'ex-1',
            exerciseId: 'supino',
            name: 'Supino Reto',
            muscleGroup: 'chest',
            sets: [{ id: 's1', reps: 10, weight: 80, completed: true }],
          },
        ],
      });

      const s2 = makeTestSession({
        id: 's2',
        startedAt: BASE_TIME,
        endedAt: BASE_TIME + 3600_000,
        exercises: [
          {
            id: 'ex-1',
            exerciseId: 'supino',
            name: 'Supino Reto',
            muscleGroup: 'chest',
            sets: [{ id: 's1', reps: 10, weight: 85, completed: true }],
          },
        ],
      });

      const report = generateEvolutionReport([s1, s2], 4, BASE_TIME);
      expect(report.totalSessionsInWindow).toBe(2);
      expect(report.hasLegacyData).toBe(false);

      // Validação das 3 perguntas
      expect(report.usabilityAnswers.whereEvolved.length).toBeGreaterThan(0);
      expect(report.usabilityAnswers.whereEvolved[0]).toContain('Supino Reto: +5 kg');
      expect(report.usabilityAnswers.whereStagnant.length).toBeGreaterThan(0);
      expect(report.usabilityAnswers.whatMissing.length).toBeGreaterThan(0);
    });

    it('marca presença de dados legados quando houver sessões pré-v2 na janela', () => {
      const legacySession = {
        id: 'legacy-sess',
        name: 'Treino Antigo',
        date: new Date(BASE_TIME).toISOString(),
        duration: 2000,
        calories: 150,
        xpEarned: 80,
        exercises: [
          {
            id: 'leg-1',
            exerciseId: 'puxada',
            name: 'Puxada Frontal',
            muscleGroup: 'back',
            sets: [{ id: 'ls1', reps: 10, weight: 50, completed: true }],
          },
        ],
      } as WorkoutSession;

      const report = generateEvolutionReport([legacySession], 4, BASE_TIME);
      expect(report.hasLegacyData).toBe(true);
      expect(report.legacySessionsCount).toBe(1);
    });

    it('contabiliza volume de técnicas especiais com stages concluídos (drop set)', () => {
      const sessionWithTechnique = makeTestSession({
        exercises: [
          {
            id: 'ex-tech',
            exerciseId: 'elevacao_lateral',
            name: 'Elevação Lateral',
            muscleGroup: 'shoulders',
            sets: [{ id: 's1', reps: 12, weight: 12, completed: true }], // 144 kg
            techniqueLog: {
              type: 'drop_set',
              stages: [
                { id: 'stage-1', index: 0, weight: 10, reps: 10, completed: true, failed: false, pauseSec: 0, restSec: 0 }, // 100 kg
                { id: 'stage-2', index: 1, weight: 8, reps: 10, completed: true, failed: false, pauseSec: 0, restSec: 0 }, // 80 kg
              ],
            },
          },
        ],
      });

      const analytics = aggregateExerciseEvolution([sessionWithTechnique]);
      expect(analytics).toHaveLength(1);
      // Volume = 144 + 100 + 80 = 324 kg
      expect(analytics[0].totalVolumeKg).toBe(324);
    });

    it('lida com histórico totalmente vazio sem falhar', () => {
      const report = generateEvolutionReport([], 4, BASE_TIME);
      expect(report.totalSessionsInWindow).toBe(0);
      expect(report.hasLegacyData).toBe(false);
      expect(report.adherence.totalSessions).toBe(0);
      expect(report.exerciseAnalytics).toHaveLength(0);
      expect(report.muscleGroupVolumes).toHaveLength(0);
      expect(report.neglectedGroups).toHaveLength(0);
      expect(report.usabilityAnswers.whereEvolved).toContain('Dados insuficientes para progressão — continue registrando seus treinos!');
    });
  });
});
