import { describe, expect, it } from 'vitest';
import { MOCK_EXERCISES } from '../mock/exercises';
import {
  generateTrainingSplitProposal,
  generateTrainingPlanProgram,
  findProfileRecommendations,
  activeDaysForFrequency,
} from './training-plan-assistant';
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
});
