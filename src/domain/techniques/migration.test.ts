import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../../types';
import { migrateTechniqueSession, normalizeTechniqueLog, normalizeTechniquePlan } from './migration';
import { createFounderDropSetPlan } from './model';

function legacyTechniqueSession(): WorkoutSession {
  return {
    id: 'legacy-technique-session',
    name: 'Braços',
    date: '2026-08-31',
    duration: 0,
    calories: 0,
    xpEarned: 0,
    exercises: [{
      id: 'ex-1',
      exerciseId: 'curl-founder',
      name: 'Rosca',
      muscleGroup: 'biceps',
      sets: [],
      techniquePlan: { type: 'drop_set', stages: [{ weight: 30, reps: 8, toFailure: false }] } as never,
    }],
  };
}

describe('migration — técnicas opcionais', () => {
  it('mantém sessão sem técnica inalterada', () => {
    const session: WorkoutSession = { ...legacyTechniqueSession(), exercises: [{ ...legacyTechniqueSession().exercises[0], techniquePlan: undefined }] };
    delete session.exercises[0].techniquePlan;
    expect(migrateTechniqueSession(session)).toBe(session);
  });

  it('rehidrata stages incompletos a partir do plano e é idempotente', () => {
    const session = legacyTechniqueSession();
    const migrated = migrateTechniqueSession(session);
    const plan = migrated.exercises[0].techniquePlan!;
    expect(plan.stages?.[0]).toMatchObject({ id: 'drop_stage_1', index: 0, pauseSec: 0, restSec: 0 });
    expect(migrated.exercises[0].techniqueLog?.stages).toHaveLength(1);
    expect(migrateTechniqueSession(migrated)).toBe(migrated);
  });

  it('descarta payload de técnica desconhecida sem afetar o exercício', () => {
    expect(normalizeTechniquePlan({ type: 'rest_pause' })).toBeUndefined();
    expect(normalizeTechniqueLog({ type: 'superset' })).toBeUndefined();
    expect(normalizeTechniquePlan(createFounderDropSetPlan())).toBeDefined();
  });
});

