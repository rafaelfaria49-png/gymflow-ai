import { describe, expect, it } from 'vitest';
import { getMuscleGroupDefinition } from './training-taxonomy';
import {
  WORKOUT_PROGRAM_TEMPLATES,
  evaluateTemplateCompatibility,
  getTemplateDayFocusLabels,
  getTemplateDayName,
  getWorkoutTemplate,
  listWorkoutTemplates,
} from './workout-templates';

describe('registry de templates — invariantes estruturais (GOAL-19B PART 20)', () => {
  it('mantém entre 5 e 7 templates úteis', () => {
    expect(WORKOUT_PROGRAM_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    expect(WORKOUT_PROGRAM_TEMPLATES.length).toBeLessThanOrEqual(7);
  });

  it('tem ids únicos', () => {
    const ids = WORKOUT_PROGRAM_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tem nomes únicos', () => {
    const names = WORKOUT_PROGRAM_TEMPLATES.map((template) => template.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('nenhum template contém exercícios — só estrutura', () => {
    for (const template of WORKOUT_PROGRAM_TEMPLATES) {
      for (const day of template.days) {
        expect('slots' in day).toBe(false);
        expect('exerciseId' in day).toBe(false);
        expect('exercises' in day).toBe(false);
      }
    }
  });

  it('usa apenas grupos musculares válidos da taxonomia', () => {
    for (const template of WORKOUT_PROGRAM_TEMPLATES) {
      for (const day of template.days) {
        expect(day.muscleGroupIds.length).toBeGreaterThan(0);
        for (const id of day.muscleGroupIds) {
          expect(getMuscleGroupDefinition(id), `grupo inválido: ${id}`).toBeDefined();
        }
      }
    }
  });

  it('declara frequências recomendadas dentro de 1..7', () => {
    for (const template of WORKOUT_PROGRAM_TEMPLATES) {
      expect(template.recommendedFrequencies.length).toBeGreaterThan(0);
      for (const freq of template.recommendedFrequencies) {
        expect(freq).toBeGreaterThanOrEqual(1);
        expect(freq).toBeLessThanOrEqual(7);
      }
    }
  });

  it('todo dia sem customName gera um nome automático não vazio', () => {
    for (const template of WORKOUT_PROGRAM_TEMPLATES) {
      for (const day of template.days) {
        expect(getTemplateDayName(day).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('é imutável em runtime (deep-frozen)', () => {
    expect(Object.isFrozen(WORKOUT_PROGRAM_TEMPLATES)).toBe(true);
    const first = WORKOUT_PROGRAM_TEMPLATES[0];
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.days)).toBe(true);
    expect(Object.isFrozen(first.days[0])).toBe(true);
    expect(Object.isFrozen(first.days[0].muscleGroupIds)).toBe(true);
    // Congelado: a tentativa de mutação lança em runtime (modo estrito dos módulos ES).
    expect(() => first.days[0].muscleGroupIds.push('chest')).toThrow();
  });

  it('não tem template semanticamente duplicado sem justificativa', () => {
    // Assinatura = estrutura muscular + perfil de volume + flag de retorno por dia.
    // Dois templates com a MESMA assinatura seriam duplicados sem justificativa.
    // (Corpo inteiro 3d "standard" vs Retorno 3d "compact" NÃO colidem: volume difere.)
    const signature = (index: number) => {
      const template = WORKOUT_PROGRAM_TEMPLATES[index];
      const days = template.days
        .map((day) => `${[...day.muscleGroupIds].sort().join('+')}@${day.volumeProfile ?? 'standard'}`)
        .join('|');
      return `${days}#return=${Boolean(template.forReturningUsers)}`;
    };
    const signatures = WORKOUT_PROGRAM_TEMPLATES.map((_, index) => signature(index));
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});

describe('templates específicos do GOAL-19B', () => {
  it('Superior / Inferior 4 dias usa rótulos estruturais e 4 dias', () => {
    const template = getWorkoutTemplate('upper-lower-4');
    expect(template?.days).toHaveLength(4);
    expect(template && getTemplateDayName(template.days[0])).toBe('Superior');
    expect(template && getTemplateDayName(template.days[1])).toBe('Inferior');
  });

  it('Empurrar / Puxar / Pernas nomeia os três dias estruturalmente', () => {
    const template = getWorkoutTemplate('push-pull-legs-3');
    expect(template?.days.map((day) => getTemplateDayName(day))).toEqual(['Empurrar', 'Puxar', 'Pernas']);
  });

  it('PPL 6 dias repete a estrutura duas vezes', () => {
    const template = getWorkoutTemplate('push-pull-legs-6');
    expect(template?.days).toHaveLength(6);
    expect(template?.recommendedFrequencies).toContain(6);
  });

  it('o template de retorno é conservador e marcado para retorno', () => {
    const template = getWorkoutTemplate('return-full-body-3');
    expect(template?.forReturningUsers).toBe(true);
    expect(template?.days.every((day) => day.volumeProfile === 'compact')).toBe(true);
    // Nunca afirma que o template garante readaptação segura — a única menção é negada.
    expect(template?.disclaimer).toMatch(/não\s+.*garante/i);
  });

  it('expõe rótulos de foco por dia para a prévia', () => {
    const template = getWorkoutTemplate('upper-lower-4');
    expect(template && getTemplateDayFocusLabels(template.days[1])).toEqual([
      'Quadríceps',
      'Posterior de coxa',
      'Glúteos',
      'Panturrilhas',
    ]);
  });
});

describe('evaluateTemplateCompatibility — informativa, nunca bloqueante', () => {
  const upperLower = getWorkoutTemplate('upper-lower-4')!;
  const returnTemplate = getWorkoutTemplate('return-full-body-3')!;

  it('reconhece a frequência recomendada', () => {
    const result = evaluateTemplateCompatibility(upperLower, { level: 'intermediate', frequency: 4, goal: 'hypertrophy' });
    expect(result.recommendedForFrequency).toBe(true);
    expect(result.moreDaysThanFrequency).toBe(false);
    expect(result.fewerDaysThanFrequency).toBe(false);
  });

  it('avisa (sem bloquear) quando o template tem mais dias que a frequência', () => {
    const result = evaluateTemplateCompatibility(upperLower, { level: 'intermediate', frequency: 3, goal: 'hypertrophy' });
    expect(result.moreDaysThanFrequency).toBe(true);
    expect(result.note).toContain('4 dias');
    expect(result.note).toContain('poderá editá-lo');
  });

  it('avisa quando o template tem menos dias que a frequência', () => {
    const result = evaluateTemplateCompatibility(returnTemplate, { level: 'beginner', frequency: 5 });
    expect(result.fewerDaysThanFrequency).toBe(true);
  });

  it('sinaliza adequação a retorno e compatibilidade de nível/objetivo', () => {
    const result = evaluateTemplateCompatibility(returnTemplate, {
      level: 'advanced',
      frequency: 3,
      goal: 'hypertrophy',
      trainingStatus: 'returning',
    });
    expect(result.suitableForReturn).toBe(true);
    expect(result.levelCompatible).toBe(true);
    expect(result.goalCompatible).toBe(true);
  });

  it('lida com perfil sem frequência sem inventar recomendação', () => {
    const result = evaluateTemplateCompatibility(upperLower, { level: 'intermediate' });
    expect(result.recommendedForFrequency).toBe(false);
    expect(result.moreDaysThanFrequency).toBe(false);
    expect(result.fewerDaysThanFrequency).toBe(false);
    expect(result.note).toBe('Você poderá ajustar os dias depois de aplicar.');
  });

  it('listWorkoutTemplates devolve o registry', () => {
    expect(listWorkoutTemplates()).toBe(WORKOUT_PROGRAM_TEMPLATES);
  });
});
