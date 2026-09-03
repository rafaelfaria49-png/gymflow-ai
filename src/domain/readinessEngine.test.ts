import { describe, expect, it } from 'vitest';
import {
  applyMuscleLimitation,
  applyVolumeReduction,
  calculateReadinessCorrelation,
  calculateReadinessScore,
  evaluateReadiness,
  musclesOverlap,
  resolveReadinessLevel,
  type ReadinessAnswers,
  type ReadinessSessionContext,
} from './readinessEngine';
import type { Exercise, WorkoutSession } from '../types';

function createDummySession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'session_test_1',
    name: 'Treino A — Peito e Tríceps',
    date: '2026-09-02',
    duration: 3600,
    calories: 350,
    plannedDuration: 50,
    sourceProgramDayId: 'day_a',
    exercises: [
      {
        id: 'ex_1',
        exerciseId: 'chest_supino_reto',
        name: 'Supino Reto',
        muscleGroup: 'chest',
        sets: [
          { id: 'w1', reps: 15, weight: 20, completed: true, isWarmup: true },
          { id: 's1', reps: 10, weight: 80, completed: true },
          { id: 's2', reps: 10, weight: 80, completed: true },
          { id: 's3', reps: 9, weight: 80, completed: false },
        ],
        repRange: [8, 12],
      },
      {
        id: 'ex_2',
        exerciseId: 'triceps_corda',
        name: 'Tríceps Corda',
        muscleGroup: 'triceps',
        sets: [
          { id: 's4', reps: 12, weight: 25, completed: true },
          { id: 's5', reps: 11, weight: 25, completed: true },
          { id: 's6', reps: 10, weight: 25, completed: true },
        ],
        repRange: [10, 15],
      },
    ],
    xpEarned: 100,
    ...overrides,
  };
}

describe('readinessEngine — Cálculo de Score e Níveis', () => {
  it('calcula 100 pontos para condição ótima em todas as 5 variáveis', () => {
    const score = calculateReadinessScore({
      energy: 'high',
      sleep: 'good',
      soreness: 'none',
      stress: 'low',
      timeAvailable: 'plenty',
    });
    expect(score).toBe(100);
    expect(resolveReadinessLevel(score)).toBe('optimal');
  });

  it('calcula score reduzido para energia baixa, sono ruim e estresse alto', () => {
    const score = calculateReadinessScore({
      energy: 'low',
      sleep: 'poor',
      soreness: 'severe',
      stress: 'high',
      timeAvailable: 'short',
    });
    expect(score).toBe(30);
    expect(resolveReadinessLevel(score)).toBe('low');
  });

  it('classifica score intermediário como moderate', () => {
    const score = calculateReadinessScore({
      energy: 'medium',
      sleep: 'fair',
      soreness: 'mild',
      stress: 'medium',
      timeAvailable: 'normal',
    });
    expect(score).toBeGreaterThanOrEqual(50);
    expect(score).toBeLessThan(80);
    expect(resolveReadinessLevel(score)).toBe('moderate');
  });
});

describe('readinessEngine — Comparação de Músculos (musclesOverlap)', () => {
  it('identifica sobreposição direta e por sinônimos', () => {
    expect(musclesOverlap('peito', 'chest')).toBe(true);
    expect(musclesOverlap('Peitoral', 'peito')).toBe(true);
    expect(musclesOverlap('quadriceps', 'pernas')).toBe(true);
    expect(musclesOverlap('costas', 'dorsal')).toBe(true);
    expect(musclesOverlap('ombros', 'shoulders')).toBe(true);
    expect(musclesOverlap('peito', 'pernas')).toBe(false);
  });
});

describe('readinessEngine PROG §6 — Regras de Sugestão e Zero Bloqueio', () => {
  it('1. Sem mensagens nem sugestões quando tudo estiver OK (Regra 5)', () => {
    const answers: ReadinessAnswers = {
      energy: 'high',
      sleep: 'good',
      soreness: 'none',
      stress: 'low',
      timeAvailable: 'normal',
    };
    const assessment = evaluateReadiness(answers, { session: createDummySession() });
    expect(assessment.status).toBe('all-good');
    expect(assessment.suggestions).toHaveLength(0);
    expect(assessment.progressionImpact).toBe('normal');
  });

  it('2. Tempo curto sugere Treino Rápido compacto (Regra 2)', () => {
    const answers: ReadinessAnswers = {
      energy: 'medium',
      sleep: 'good',
      soreness: 'none',
      stress: 'low',
      timeAvailable: 'short',
      timeAvailableMinutes: 25,
    };
    const session = createDummySession({ plannedDuration: 50 });
    const assessment = evaluateReadiness(answers, { session });
    expect(assessment.status).toBe('suggestions-available');
    const compactSugg = assessment.suggestions.find((s) => s.type === 'compact');
    expect(compactSugg).toBeDefined();
    expect(compactSugg?.title).toContain('Treino Rápido');
    expect(compactSugg?.reason).toContain('Tempo disponível hoje (25 min)');
    expect(compactSugg?.actionLabel).toContain('25 min');
    expect(compactSugg?.dismissLabel).toContain('Manter Treino Completo');
  });

  it('3. Fadiga alta / sono ruim sugere redução de volume e modulação conservadora de progressão (Regra 3)', () => {
    const answers: ReadinessAnswers = {
      energy: 'low',
      sleep: 'poor',
      soreness: 'none',
      stress: 'high',
      timeAvailable: 'normal',
    };
    const session = createDummySession();
    const assessment = evaluateReadiness(answers, { session });
    expect(assessment.progressionImpact).toBe('conservative');
    const reduceSugg = assessment.suggestions.find((s) => s.type === 'reduce-volume');
    expect(reduceSugg).toBeDefined();
    expect(reduceSugg?.reason).toMatch(/energia baixa|sono insuficiente/i);
    expect(reduceSugg?.actionLabel).toContain('Reduzir 1 Série');
  });

  it('4. Dor forte no grupo do dia oferece troca de dia ou limitação temporária (Regra 1)', () => {
    const answers: ReadinessAnswers = {
      energy: 'medium',
      sleep: 'good',
      soreness: 'severe',
      sorenessLocation: 'Peito',
      stress: 'low',
      timeAvailable: 'normal',
    };
    const session = createDummySession();
    const context: ReadinessSessionContext = {
      session,
      availableProgramDays: [
        { id: 'day_a', name: 'Treino A — Peito', muscleGroups: ['chest'] },
        { id: 'day_b', name: 'Treino B — Pernas', muscleGroups: ['legs'] },
      ],
    };
    const assessment = evaluateReadiness(answers, context);
    expect(assessment.affectedMusclesInSession.length).toBeGreaterThan(0);
    const swapSugg = assessment.suggestions.find((s) => s.type === 'swap-day');
    expect(swapSugg).toBeDefined();
    expect(swapSugg?.title).toContain('Troca de Dia');
    expect(swapSugg?.actionLabel).toContain('Treino B — Pernas');
    expect(swapSugg?.reason).toContain('Peito');

    const limitSugg = assessment.suggestions.find((s) => s.type === 'limit-muscle');
    expect(limitSugg).toBeDefined();
    expect(limitSugg?.title).toContain('Limitação Temporária');
  });

  it('5. Dor forte em grupo diferente do dia não sugere troca do dia atual', () => {
    const answers: ReadinessAnswers = {
      energy: 'high',
      sleep: 'good',
      soreness: 'severe',
      sorenessLocation: 'Panturrilha',
      stress: 'low',
      timeAvailable: 'normal',
    };
    const session = createDummySession();
    const assessment = evaluateReadiness(answers, { session });
    expect(assessment.affectedMusclesInSession).toHaveLength(0);
    const swapSugg = assessment.suggestions.find((s) => s.type === 'swap-day');
    expect(swapSugg).toBeUndefined();
  });

  it('6. Dor leve sugere mobilidade e aquecimento reforçado (Regra 4)', () => {
    const answers: ReadinessAnswers = {
      energy: 'high',
      sleep: 'good',
      soreness: 'mild',
      sorenessLocation: 'Ombro',
      stress: 'low',
      timeAvailable: 'normal',
    };
    const assessment = evaluateReadiness(answers, { session: createDummySession() });
    const mobSugg = assessment.suggestions.find((s) => s.type === 'mobility-warmup');
    expect(mobSugg).toBeDefined();
    expect(mobSugg?.title).toContain('Aquecimento e Mobilidade');
    expect(mobSugg?.reason).toContain('Ombro');
  });

  it('7. Combinação de tempo curto e baixa energia oferece ambas as sugestões', () => {
    const answers: ReadinessAnswers = {
      energy: 'low',
      sleep: 'fair',
      soreness: 'none',
      stress: 'medium',
      timeAvailable: 'short',
      timeAvailableMinutes: 20,
    };
    const assessment = evaluateReadiness(answers, { session: createDummySession() });
    expect(assessment.suggestions.some((s) => s.type === 'compact')).toBe(true);
    expect(assessment.suggestions.some((s) => s.type === 'reduce-volume')).toBe(true);
  });
});

describe('readinessEngine — Funções Puras de Adaptação de Treino', () => {
  it('applyVolumeReduction reduz 1 série de trabalho preservando séries de aquecimento', () => {
    const session = createDummySession();
    const adapted = applyVolumeReduction(session, 1);

    // Supino Reto tinha 1 aquecimento + 3 de trabalho (4 no total). Agora deve ter 1 aquecimento + 2 de trabalho (3 no total).
    expect(adapted.exercises[0].sets).toHaveLength(3);
    expect(adapted.exercises[0].sets[0].isWarmup).toBe(true);
    expect(adapted.exercises[0].sets[1].isWarmup).toBeFalsy();
    expect(adapted.exercises[0].sets[2].isWarmup).toBeFalsy();

    // Tríceps Corda tinha 3 de trabalho. Agora deve ter 2.
    expect(adapted.exercises[1].sets).toHaveLength(2);
  });

  it('applyVolumeReduction nunca remove abaixo de 1 série de trabalho', () => {
    const session = createDummySession({
      exercises: [
        {
          id: 'ex_min',
          exerciseId: 'chest_supino_reto',
          name: 'Supino',
          muscleGroup: 'chest',
          sets: [{ id: 's1', reps: 10, weight: 80, completed: false }],
        },
      ],
    });
    const adapted = applyVolumeReduction(session, 1);
    expect(adapted.exercises[0].sets).toHaveLength(1);
  });

  it('applyMuscleLimitation reduz séries do grupo muscular especificado', () => {
    const session = createDummySession();
    const adapted = applyMuscleLimitation(session, 'chest');

    // Peito reduz para 1 série de trabalho (+ aquecimento)
    const chestSets = adapted.exercises[0].sets;
    const chestWorking = chestSets.filter((s) => !s.isWarmup);
    expect(chestWorking).toHaveLength(1);

    // Tríceps permanece intocado (3 séries)
    const tricepsSets = adapted.exercises[1].sets;
    expect(tricepsSets).toHaveLength(3);
  });
});

describe('readinessEngine — Correlação Simples no Histórico', () => {
  it('retorna null quando não há sessões com prontidão gravada', () => {
    const result = calculateReadinessCorrelation([createDummySession()]);
    expect(result).toBeNull();
  });

  it('agrega métricas de prontidão alta vs baixa quando há check-ins gravados', () => {
    const highReadinessSession = createDummySession({
      id: 'sess_high',
      readiness: {
        completedAt: 1000,
        energy: 'high',
        sleep: 'good',
        soreness: 'none',
        stress: 'low',
        timeAvailable: 'plenty',
        score: 95,
        level: 'optimal',
        progressionImpact: 'normal',
      },
      exercises: [
        {
          id: 'e1',
          exerciseId: 'c1',
          name: 'C1',
          muscleGroup: 'chest',
          sets: [
            { id: 's1', reps: 10, weight: 50, completed: true },
            { id: 's2', reps: 10, weight: 50, completed: true },
          ],
        },
      ],
    });

    const lowReadinessSession = createDummySession({
      id: 'sess_low',
      readiness: {
        completedAt: 2000,
        energy: 'low',
        sleep: 'poor',
        soreness: 'none',
        stress: 'high',
        timeAvailable: 'short',
        score: 45,
        level: 'low',
        progressionImpact: 'conservative',
      },
      exercises: [
        {
          id: 'e2',
          exerciseId: 'c1',
          name: 'C1',
          muscleGroup: 'chest',
          sets: [
            { id: 's3', reps: 10, weight: 50, completed: true },
            { id: 's4', reps: 10, weight: 50, completed: false },
          ],
        },
      ],
    });

    const correlation = calculateReadinessCorrelation([highReadinessSession, lowReadinessSession]);
    expect(correlation).not.toBeNull();
    expect(correlation?.totalWithReadiness).toBe(2);
    expect(correlation?.optimalCount).toBe(1);
    expect(correlation?.lowCount).toBe(1);
    expect(correlation?.optimalCompletionRate).toBe(100);
    expect(correlation?.lowCompletionRate).toBe(50);
    expect(correlation?.summary).toContain('2 treino(s)');
  });
});
