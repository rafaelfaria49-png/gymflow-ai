import { describe, expect, it } from 'vitest';
import {
  createBackOffPlan,
  createFounderDropSetPlan,
  createInitialTechniqueLog,
  createPyramidPlan,
  materializeTechniqueSetPlans,
  recordTechniqueStage,
  validateTechniquePlan,
} from './model';

describe('técnicas especiais — modelo e validação', () => {
  it('cria o exemplo canônico do Founder com quedas de 30 para 15 kg', () => {
    const plan = createFounderDropSetPlan();
    expect(plan.type).toBe('drop_set');
    expect(plan.stages?.map((stage) => stage.weight)).toEqual([30, 25, 20, 15]);
    expect(plan.stages?.map((stage) => stage.reps)).toEqual([8, 7, 6, 'max']);
    expect(plan.stages?.at(-1)?.toFailure).toBe(true);
  });

  it('registra e edita cada stage sem mutar o log anterior', () => {
    const plan = createFounderDropSetPlan();
    const initial = createInitialTechniqueLog(plan);
    const edited = recordTechniqueStage(initial, 0, { weight: 29.5, reps: 8, completed: true }, 123);
    expect(initial.stages?.[0].weight).toBe(30);
    expect(edited.stages?.[0]).toMatchObject({ weight: 29.5, reps: 8, completed: true, updatedAt: 123 });
  });

  it('materializa pirâmide e back-off em SetPlans', () => {
    const pyramid = createPyramidPlan({ baseWeight: 100, baseReps: 8 });
    const pyramidSets = materializeTechniqueSetPlans(pyramid, 100, 8);
    const backOff = createBackOffPlan({ topWeight: 100, topReps: 5, backOffSets: 2 });
    expect(pyramidSets).toHaveLength(5);
    expect(pyramidSets.map((set) => set.weight)).toEqual([60, 70, 80, 70, 60]);
    expect(backOff.setPlans?.map((set) => set.weight)).toEqual([100, 80, 80]);
    expect(backOff.setPlans?.every((set) => set.role === 'top' || set.role === 'back_off')).toBe(true);
  });

  it('bloqueia técnica para iniciante por padrão e aceita desbloqueio manual', () => {
    const plan = createFounderDropSetPlan();
    expect(validateTechniquePlan(plan, 'beginner').valid).toBe(false);
    expect(validateTechniquePlan(plan, 'beginner', ['drop_set']).valid).toBe(true);
    expect(validateTechniquePlan(plan, 'intermediate').valid).toBe(false);
    expect(validateTechniquePlan(plan, 'advanced').valid).toBe(true);
  });
});

