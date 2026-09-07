import { describe, expect, it } from 'vitest';
import { MOCK_EXERCISES } from '../mock/exercises';
import {
  generateTrainingSplitProposal,
  generateTrainingPlanProgram,
  findProfileRecommendations,
  activeDaysForFrequency,
  validateWeeklySplitBalance,
  programMatchesTrainingGoal,
} from './training-plan-assistant';
import type { MuscleGroupId } from '../types/training-taxonomy';
import { MOCK_PROGRAMS } from '../mock/programs';
import {
  createDefaultGymProfileState,
  getActiveGymProfile,
  getGymProfileAvailability,
  updateGymProfileEquipment,
} from '../domain/gymProfile';

describe('Assistente de Plano — Motor Determinístico (GOAL-024)', () => {
  describe('Frequências de 2 a 6 dias (item 25)', () => {
    it('gera divisão equilibrada para 2 dias iniciante', () => {
      const proposal = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'beginner',
        frequency: 2,
        duration: 45,
      });

      expect(proposal.frequency).toBe(2);
      expect(proposal.days).toHaveLength(2);
      expect(proposal.days[0].suggestedWeekday).toBe('Segunda');
      expect(proposal.days[1].suggestedWeekday).toBe('Quinta');
      expect(proposal.days[0].targetMinutes).toBe(45);
      expect(proposal.days[1].targetMinutes).toBe(45);

      // Grupos principais contemplados
      const allMuscles = proposal.days.flatMap((d) => d.muscleGroupIds);
      expect(allMuscles).toContain('chest');
      expect(allMuscles).toContain('back');
      expect(allMuscles.some((m) => ['quadriceps', 'hamstrings', 'glutes'].includes(m))).toBe(true);
    });

    it('gera divisão para 3 dias (Push/Pull/Legs)', () => {
      const proposal = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 3,
        duration: 60,
      });

      expect(proposal.frequency).toBe(3);
      expect(proposal.days).toHaveLength(3);
      expect(proposal.days.map((d) => d.suggestedWeekday)).toEqual(['Segunda', 'Quarta', 'Sexta']);
      expect(proposal.days[0].muscleGroupIds).toEqual(['chest', 'shoulders', 'triceps']);
      expect(proposal.days[1].muscleGroupIds).toEqual(['back', 'biceps', 'traps']);
      expect(proposal.days[2].muscleGroupIds).toContain('quadriceps');
    });

    it('gera divisão para 4 dias (Superior / Inferior 4x)', () => {
      const proposal = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 4,
        duration: 60,
      });

      expect(proposal.frequency).toBe(4);
      expect(proposal.days).toHaveLength(4);
      expect(proposal.days.map((d) => d.suggestedWeekday)).toEqual(['Segunda', 'Terça', 'Quinta', 'Sexta']);
      expect(proposal.days[0].name).toMatch(/Superior/i);
      expect(proposal.days[1].name).toMatch(/Inferior/i);
      expect(proposal.days[2].name).toMatch(/Superior/i);
      expect(proposal.days[3].name).toMatch(/Inferior/i);
    });

    it('5 dias NUNCA vira repetição cíclica A/B/C/A/B', () => {
      const proposal = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 5,
        duration: 60,
      });

      expect(proposal.frequency).toBe(5);
      expect(proposal.days).toHaveLength(5);
      expect(proposal.days.map((d) => d.suggestedWeekday)).toEqual([
        'Segunda',
        'Terça',
        'Quarta',
        'Quinta',
        'Sexta',
      ]);

      // Os 5 dias devem ter focos distintos e estruturados, NUNCA ciclo A, B, C, A, B
      const dayNames = proposal.days.map((d) => d.name);
      expect(dayNames[0]).not.toBe(dayNames[3]); // dia 1 e dia 4 não são cópias cegas
      expect(dayNames[1]).not.toBe(dayNames[4]); // dia 2 e dia 5 não são cópias cegas

      // Confirma que todos os 5 dias têm identidade própria
      const distinctDays = new Set(dayNames);
      expect(distinctDays.size).toBe(5);
    });

    it('gera divisão para 6 dias (PPL 6x)', () => {
      const proposal = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'advanced',
        frequency: 6,
        duration: 60,
      });

      expect(proposal.frequency).toBe(6);
      expect(proposal.days).toHaveLength(6);
      expect(proposal.days.map((d) => d.suggestedWeekday)).toEqual([
        'Segunda',
        'Terça',
        'Quarta',
        'Quinta',
        'Sexta',
        'Sábado',
      ]);
    });
  });

  describe('Prioridades musculares (item 26)', () => {
    it('com prioridade Peito: aumenta frequência de peito sem excluir costas ou pernas', () => {
      const proposal = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 5,
        duration: 60,
        priorityMuscleGroups: ['chest'],
      });

      expect(proposal.frequency).toBe(5);
      const daysWithChest = proposal.days.filter((d) => d.muscleGroupIds.includes('chest'));
      expect(daysWithChest.length).toBeGreaterThanOrEqual(2);

      // Espaçamento: não repete em dias consecutivos
      for (let i = 0; i < proposal.days.length - 1; i++) {
        const currentHasChest = proposal.days[i].muscleGroupIds.includes('chest');
        const nextHasChest = proposal.days[i + 1].muscleGroupIds.includes('chest');
        expect(currentHasChest && nextHasChest).toBe(false);
      }

      // Costas e pernas continuam presentes na semana!
      const allMuscles = proposal.days.flatMap((d) => d.muscleGroupIds);
      expect(allMuscles).toContain('back');
      expect(allMuscles.some((m) => ['quadriceps', 'hamstrings', 'glutes'].includes(m))).toBe(true);
    });

    it('com prioridade Costas: 2 estímulos de costas preservando peito e pernas', () => {
      const proposal = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 5,
        duration: 60,
        priorityMuscleGroups: ['back'],
      });

      const daysWithBack = proposal.days.filter((d) => d.muscleGroupIds.includes('back'));
      expect(daysWithBack.length).toBeGreaterThanOrEqual(2);

      const allMuscles = proposal.days.flatMap((d) => d.muscleGroupIds);
      expect(allMuscles).toContain('chest');
      expect(allMuscles.some((m) => ['quadriceps', 'hamstrings', 'glutes'].includes(m))).toBe(true);
    });

    it('com prioridade Pernas/Glúteos: 2 estímulos de pernas preservando membros superiores', () => {
      const proposal = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 5,
        duration: 60,
        priorityMuscleGroups: ['glutes', 'quadriceps'],
      });

      const lowerDays = proposal.days.filter((d) =>
        d.muscleGroupIds.some((m) => ['quadriceps', 'hamstrings', 'glutes'].includes(m)),
      );
      expect(lowerDays.length).toBeGreaterThanOrEqual(2);

      const allMuscles = proposal.days.flatMap((d) => d.muscleGroupIds);
      expect(allMuscles).toContain('chest');
      expect(allMuscles).toContain('back');
    });
  });

  describe('Duração por treino (item 27)', () => {
    it.each([30, 60, 90])('propaga targetMinutes=%i aos dias gerados', (duration) => {
      const proposal = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 4,
        duration,
      });

      expect(proposal.targetMinutes).toBe(duration);
      for (const day of proposal.days) {
        expect(day.targetMinutes).toBe(duration);
      }
    });
  });

  describe('Preenchimento com catálogo de exercícios e aparelhos (item 12, 14, 28)', () => {
    it('preenche exercícios reais sem inventar IDs', () => {
      const generated = generateTrainingPlanProgram(
        {
          goal: 'hypertrophy',
          level: 'intermediate',
          frequency: 4,
          duration: 60,
        },
        MOCK_EXERCISES,
      );

      expect(generated.program.isCustom).toBe(true);
      expect(generated.program.weeks[0].days).toHaveLength(4);

      const validCatalogIds = new Set(MOCK_EXERCISES.map((e) => e.id));
      for (const day of generated.program.weeks[0].days) {
        expect(day.slots.length).toBeGreaterThan(0);
        for (const slot of day.slots) {
          expect(validCatalogIds.has(slot.exerciseId)).toBe(true);
          expect(slot.series).toBeGreaterThan(0);
          expect(slot.repRange[0]).toBeGreaterThan(0);
          expect(slot.repRange[1]).toBeGreaterThanOrEqual(slot.repRange[0]);
        }
      }
    });

    it('respeita disponibilidade de GymProfile limitada (ex: barra indisponível)', () => {
      const profile = getActiveGymProfile(createDefaultGymProfileState())!;
      const blocked = updateGymProfileEquipment(profile, 'barbell', 'unavailable');
      const availability = getGymProfileAvailability(blocked, '2026-09-04')!;

      const generated = generateTrainingPlanProgram(
        {
          goal: 'hypertrophy',
          level: 'intermediate',
          frequency: 3,
          duration: 45,
          gymProfileAvailability: availability,
        },
        MOCK_EXERCISES,
      );

      // Os exercícios gerados devem ser válidos, preenchidos e não conter barbell
      for (const day of generated.program.weeks[0].days) {
        expect(day.slots.length).toBeGreaterThan(0);
        for (const slot of day.slots) {
          const ex = MOCK_EXERCISES.find((e) => e.id === slot.exerciseId);
          expect(ex?.equipmentIds?.includes('barbell')).toBe(false);
        }
      }
    });
  });

  describe('Recomendações "Para você" (item 17)', () => {
    it('encontra programas prontos compatíveis com o perfil do usuário', () => {
      const recommendations = findProfileRecommendations(MOCK_PROGRAMS, {
        level: 'intermediate',
        goal: 'hypertrophy',
        frequency: 4,
      });

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.length).toBeLessThanOrEqual(3);

      const top = recommendations[0];
      expect(top.program).toBeDefined();
      expect(top.matchReason).toMatch(/nível intermediate|hipertrofia|semana/i);
    });
  });

  describe('activeDaysForFrequency', () => {
    it('retorna os dias corretos para frequências de 2 a 6', () => {
      expect(activeDaysForFrequency(2)).toEqual(['Segunda', 'Quinta']);
      expect(activeDaysForFrequency(3)).toEqual(['Segunda', 'Quarta', 'Sexta']);
      expect(activeDaysForFrequency(4)).toEqual(['Segunda', 'Terça', 'Quinta', 'Sexta']);
      expect(activeDaysForFrequency(5)).toEqual(['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']);
      expect(activeDaysForFrequency(6)).toEqual(['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']);
    });
  });

  describe('Validação de Equilíbrio Semanal e Correção 4 dias + Peito (GOAL-024B)', () => {
    it('valida que divisão balanceada é considerada válida', () => {
      const validDays: Array<{ muscleGroupIds: MuscleGroupId[] }> = [
        { muscleGroupIds: ['chest', 'shoulders', 'triceps'] },
        { muscleGroupIds: ['back', 'biceps'] },
        { muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves'] },
      ];
      const result = validateWeeklySplitBalance(validDays);
      expect(result.valid).toBe(true);
      expect(result.missingGroups).toHaveLength(0);
    });

    it('detecta omissão de posterior/glúteos quando pernas tem apenas quadríceps', () => {
      const imbalancedDays: Array<{ muscleGroupIds: MuscleGroupId[] }> = [
        { muscleGroupIds: ['chest', 'shoulders', 'triceps'] },
        { muscleGroupIds: ['back', 'biceps'] },
        { muscleGroupIds: ['quadriceps', 'calves'] },
      ];
      const result = validateWeeklySplitBalance(imbalancedDays);
      expect(result.valid).toBe(false);
      expect(result.missingGroups).toContain('hamstrings');
    });

    it('4 dias + Peito: inclui explicitamente posteriores e glúteos no Dia 2', () => {
      const proposal = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 4,
        duration: 60,
        priorityMuscleGroups: ['chest'],
      });

      expect(proposal.days).toHaveLength(4);
      // Dia 1: Peito e Tríceps
      expect(proposal.days[0].muscleGroupIds).toContain('chest');
      // Dia 2: Membros Inferiores Completo com quadríceps, isquiotibiais e glúteos
      const day2 = proposal.days[1];
      expect(day2.muscleGroupIds).toContain('quadriceps');
      expect(day2.muscleGroupIds).toContain('hamstrings');
      expect(day2.muscleGroupIds).toContain('glutes');
      // Dia 3: Costas e Bíceps
      expect(proposal.days[2].muscleGroupIds).toContain('back');
      // Dia 4: Superior com segundo estímulo de Peito
      expect(proposal.days[3].muscleGroupIds).toContain('chest');

      // Verifica equilíbrio total semanal
      const balance = validateWeeklySplitBalance(proposal.days);
      expect(balance.valid).toBe(true);
      expect(balance.missingGroups).toHaveLength(0);
    });

    it('4 dias + Peito: Dia 3 não tem foco em ombros na véspera do Dia 4', () => {
      const proposal = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 4,
        duration: 60,
        priorityMuscleGroups: ['chest'],
      });

      // Dia 3 é Costas e Bíceps sem ombros
      expect(proposal.days[2].muscleGroupIds).not.toContain('shoulders');
    });
  });

  describe('Combinações de Prioridades e Preservação de Ordem (GOAL-024B)', () => {
    it('com prioridades Peito + Costas: confere ênfase a ambos', () => {
      const proposal = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 4,
        duration: 60,
        priorityMuscleGroups: ['chest', 'back'],
      });

      expect(proposal.days).toHaveLength(4);
      const allMuscles = proposal.days.flatMap((d) => d.muscleGroupIds);
      expect(allMuscles).toContain('chest');
      expect(allMuscles).toContain('back');
      expect(allMuscles).toContain('quadriceps');
      expect(allMuscles).toContain('hamstrings');

      const balance = validateWeeklySplitBalance(proposal.days);
      expect(balance.valid).toBe(true);
    });

    it('preserva ordem de prioridades: Costas primeiro vs Peito primeiro gera divisões coerentes', () => {
      const proposalBackFirst = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 4,
        duration: 60,
        priorityMuscleGroups: ['back', 'chest'],
      });

      const proposalChestFirst = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 4,
        duration: 60,
        priorityMuscleGroups: ['chest', 'back'],
      });

      // Quando costas é p0, Dia 1 abre com costas
      expect(proposalBackFirst.days[0].muscleGroupIds).toContain('back');
      // Quando peito é p0, Dia 1 abre com peito
      expect(proposalChestFirst.days[0].muscleGroupIds).toContain('chest');
    });

    it('com prioridades Peito + Ombros em 5 dias', () => {
      const proposal = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 5,
        duration: 60,
        priorityMuscleGroups: ['chest', 'shoulders'],
      });

      expect(proposal.days).toHaveLength(5);
      const chestDays = proposal.days.filter((d) => d.muscleGroupIds.includes('chest'));
      const shoulderDays = proposal.days.filter((d) => d.muscleGroupIds.includes('shoulders'));
      expect(chestDays.length).toBeGreaterThanOrEqual(2);
      expect(shoulderDays.length).toBeGreaterThanOrEqual(1);

      const balance = validateWeeklySplitBalance(proposal.days);
      expect(balance.valid).toBe(true);
    });

    it('com prioridades Costas + Bíceps em 4 dias', () => {
      const proposal = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 4,
        duration: 60,
        priorityMuscleGroups: ['back', 'biceps'],
      });

      expect(proposal.days[0].muscleGroupIds).toContain('back');
      expect(proposal.days[0].muscleGroupIds).toContain('biceps');

      const balance = validateWeeklySplitBalance(proposal.days);
      expect(balance.valid).toBe(true);
    });

    it('com prioridades Quadríceps + Glúteos em 4 dias', () => {
      const proposal = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 4,
        duration: 60,
        priorityMuscleGroups: ['quadriceps', 'glutes'],
      });

      const lowerDays = proposal.days.filter((d) =>
        d.muscleGroupIds.some((m) => ['quadriceps', 'glutes'].includes(m)),
      );
      expect(lowerDays.length).toBeGreaterThanOrEqual(2);

      const balance = validateWeeklySplitBalance(proposal.days);
      expect(balance.valid).toBe(true);
    });

    it('com 3 prioridades: Peito + Costas + Pernas em 5 dias', () => {
      const proposal = generateTrainingSplitProposal({
        goal: 'hypertrophy',
        level: 'intermediate',
        frequency: 5,
        duration: 60,
        priorityMuscleGroups: ['chest', 'back', 'quadriceps'],
      });

      expect(proposal.days).toHaveLength(5);
      const balance = validateWeeklySplitBalance(proposal.days);
      expect(balance.valid).toBe(true);
    });
  });

  describe('Prioridades únicas através de frequências 2 a 6 (GOAL-024B)', () => {
    const frequencies = [2, 3, 4, 5, 6];
    const singlePriorities: Array<Array<'chest' | 'back' | 'quadriceps' | 'shoulders' | 'biceps'>> = [
      ['chest'],
      ['back'],
      ['quadriceps'],
      ['shoulders'],
      ['biceps'],
    ];

    for (const freq of frequencies) {
      for (const priority of singlePriorities) {
        it(`freq=${freq} com prioridade ${priority[0]} mantém equilíbrio semanal completo`, () => {
          const proposal = generateTrainingSplitProposal({
            goal: 'hypertrophy',
            level: 'intermediate',
            frequency: freq,
            duration: 60,
            priorityMuscleGroups: priority,
          });

          expect(proposal.days).toHaveLength(freq);
          const balance = validateWeeklySplitBalance(proposal.days);
          expect(balance.valid).toBe(true);
          expect(balance.missingGroups).toHaveLength(0);
        });
      }
    }
  });

  describe('Match de Objetivo Canônico — programMatchesTrainingGoal (GOAL-024B)', () => {
    it('aceita goal indefinido ou "all" para qualquer programa', () => {
      const prog = MOCK_PROGRAMS[0];
      expect(programMatchesTrainingGoal(prog, undefined)).toBe(true);
      expect(programMatchesTrainingGoal(prog, null)).toBe(true);
      expect(programMatchesTrainingGoal(prog, 'all')).toBe(true);
    });

    it('prog_adv_1 (PPL 6x) casa com hipertrofia tanto com chave canônica quanto pt-BR', () => {
      const ppl = MOCK_PROGRAMS.find((p) => p.id === 'prog_adv_1')!;
      expect(ppl).toBeDefined();
      expect(programMatchesTrainingGoal(ppl, 'hypertrophy')).toBe(true);
      expect(programMatchesTrainingGoal(ppl, 'hipertrofia')).toBe(true);
      expect(programMatchesTrainingGoal(ppl, 'strength')).toBe(false);
    });

    it('prog_adv_2 (Glúteo Avançado) casa com hipertrofia', () => {
      const gluteo = MOCK_PROGRAMS.find((p) => p.id === 'prog_adv_2')!;
      expect(gluteo).toBeDefined();
      expect(programMatchesTrainingGoal(gluteo, 'hypertrophy')).toBe(true);
      expect(programMatchesTrainingGoal(gluteo, 'hipertrofia')).toBe(true);
      expect(programMatchesTrainingGoal(gluteo, 'strength')).toBe(false);
    });

    it('prog_beg_3 ("Aprendendo Máquinas Guiadas") NÃO casa com força/strength', () => {
      const maquinas = MOCK_PROGRAMS.find((p) => p.id === 'prog_beg_3')!;
      expect(maquinas).toBeDefined();
      // Não deve casar com strength
      expect(programMatchesTrainingGoal(maquinas, 'strength')).toBe(false);
      expect(programMatchesTrainingGoal(maquinas, 'força')).toBe(false);
      // Casa com conditioning / adaptação
      expect(programMatchesTrainingGoal(maquinas, 'conditioning')).toBe(true);
      expect(programMatchesTrainingGoal(maquinas, 'condicionamento')).toBe(true);
    });

    it('prog_adv_3 (Powerbuilding) e prog_atl_1 (Força Máxima) casam com força/strength', () => {
      const powerbuilding = MOCK_PROGRAMS.find((p) => p.id === 'prog_adv_3')!;
      const maxPower = MOCK_PROGRAMS.find((p) => p.id === 'prog_atl_1')!;
      expect(powerbuilding).toBeDefined();
      expect(maxPower).toBeDefined();

      expect(programMatchesTrainingGoal(powerbuilding, 'strength')).toBe(true);
      expect(programMatchesTrainingGoal(powerbuilding, 'força')).toBe(true);

      expect(programMatchesTrainingGoal(maxPower, 'strength')).toBe(true);
      expect(programMatchesTrainingGoal(maxPower, 'força')).toBe(true);
    });

    it('prog_beg_4 (Emagrecimento Inicial) casa com slimming e emagrecimento', () => {
      const emagrec = MOCK_PROGRAMS.find((p) => p.id === 'prog_beg_4')!;
      expect(emagrec).toBeDefined();
      expect(programMatchesTrainingGoal(emagrec, 'slimming')).toBe(true);
      expect(programMatchesTrainingGoal(emagrec, 'emagrecimento')).toBe(true);
      expect(programMatchesTrainingGoal(emagrec, 'definição')).toBe(true);
      expect(programMatchesTrainingGoal(emagrec, 'strength')).toBe(false);
    });
  });

  describe('Parâmetros de Exercícios por Objetivo e Alertas de Duração (GOAL-024B)', () => {
    it('gera slots com repetições e descansos distintos para Força vs Hipertrofia', () => {
      const programHyper = generateTrainingPlanProgram(
        {
          goal: 'hypertrophy',
          level: 'intermediate',
          frequency: 3,
          duration: 60,
        },
        MOCK_EXERCISES,
      );

      const programStrength = generateTrainingPlanProgram(
        {
          goal: 'strength',
          level: 'intermediate',
          frequency: 3,
          duration: 60,
        },
        MOCK_EXERCISES,
      );

      // Localiza o primeiro slot de cada programa
      const slotHyper = programHyper.program.weeks[0].days[0].slots[0];
      const slotStrength = programStrength.program.weeks[0].days[0].slots[0];

      // Força deve ter repRange inferior (ex: 3-6) e descanso maior (ex: 180s) em relação a hipertrofia
      expect(slotStrength.repRange[1]).toBeLessThanOrEqual(slotHyper.repRange[1]);
      expect(slotStrength.restSec).toBeGreaterThanOrEqual(slotHyper.restSec);
    });

    it('emite aviso quando duração alvo é alta (ex: 75 min) e estimativa fica muito abaixo', () => {
      const result = generateTrainingPlanProgram(
        {
          goal: 'hypertrophy',
          level: 'intermediate',
          frequency: 4,
          duration: 75,
        },
        MOCK_EXERCISES,
      );

      // Deve incluir aviso explicativo de duração
      const hasDurationWarning = result.warnings.some((w) =>
        w.includes('Duração alvo de 75 min') || w.includes('rotina estimada em'),
      );
      expect(hasDurationWarning).toBe(true);
    });
  });
});
