// GOAL-024: Assistente de Plano de Treino determinístico e estruturado.
//
// Substitui a antiga geração cíclica (A/B/C/A/B) por um motor determinístico em 2 etapas:
//  1. Proposta de Divisão Semanal (TrainingSplitProposal) respeitando frequência (2..6),
//     duração, nível, objetivo e prioridades musculares (até 3).
//  2. Preenchimento de Exercícios via workout-suggestion respeitando aparelhos (GymProfile)
//     e restrições, gerando um WorkoutProgram canônico salvo em weeks[0].days.
//
// Regras inegociáveis:
//  - Sem IA externa, sem chamadas de rede, sem heurísticas aleatórias não controladas.
//  - Determinismo estrutural: as divisões, dias, nomes, rationale e seleção de exercícios
//    são 100% determinísticos e testáveis para os mesmos inputs.
//  - IDs de runtime únicos: para evitar colisões no banco/store local ao persistir ou salvar
//    múltiplas propostas, IDs de programas e dias usam createBuilderId() e timestamps controlados.
//  - 5 dias NUNCA gera repetição cíclica A/B/C/A/B.
//  - Frequência 2 a 6 suportada de forma equilibrada.
//  - Prioridades aumentam estímulo do grupo de forma controlada sem eliminar grupos principais.
//  - targetMinutes propagado a todos os dias.

import type {
  Exercise,
  ProgramDay,
  VolumeProfile,
  WorkoutProgram,
} from '../types';
import type {
  MuscleGroupId,
} from '../types/training-taxonomy';
import type {
  ReturnToTrainingProfile,
  TrainingExperienceLevel,
  TrainingGoal,
} from '../types/training-profile';
import type { GymProfileAvailability } from '../domain/gymProfile';
import { createBuilderId } from './workout-builder-id';
import {
  buildWorkoutSuggestionPreview,
  type WorkoutSuggestionPreview,
} from './workout-suggestion';
import {
  generateWorkoutDayAutoName,
  muscleGroupShortLabel,
  normalizeMuscleGroupIds,
} from './workout-day-naming';
import { clampTargetMinutes } from './workout-builder';
import { estimateWorkoutDurationDetailed } from './workoutDuration';

export const DAYS_ORDER: readonly string[] = Object.freeze([
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
  'Domingo',
]);

/** Dias da semana atribuídos canonicamente para cada frequência semanal. */
export function activeDaysForFrequency(frequency: number): string[] {
  if (frequency <= 1) return ['Segunda'];
  if (frequency === 2) return ['Segunda', 'Quinta'];
  if (frequency === 3) return ['Segunda', 'Quarta', 'Sexta'];
  if (frequency === 4) return ['Segunda', 'Terça', 'Quinta', 'Sexta'];
  if (frequency === 5) return ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
  if (frequency === 6) return ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return [...DAYS_ORDER];
}

// ===== Contrato de Entrada e Saída =====

export interface TrainingPlanRequest {
  goal: TrainingGoal | string;
  level: TrainingExperienceLevel;
  frequency: number; // 2..6
  duration: number; // minutos (ex: 30, 45, 60, 75, 90)
  priorityMuscleGroups?: readonly MuscleGroupId[]; // 0..3
  availableEquipment?: readonly string[];
  gymProfileAvailability?: GymProfileAvailability | null;
  restrictions?: readonly string[];
  returnToTraining?: ReturnToTrainingProfile | null;
  variantIndex?: number;
}

export interface ProposedSplitDay {
  dayNumber: number;
  suggestedWeekday: string;
  name: string;
  label: string;
  muscleGroupIds: MuscleGroupId[];
  volumeProfile: VolumeProfile;
  targetMinutes: number;
  rationale: string;
}

export interface TrainingSplitProposal {
  id: string;
  name: string;
  description: string;
  frequency: number;
  targetMinutes: number;
  volumeProfile: VolumeProfile;
  priorityMuscleGroups: MuscleGroupId[];
  days: ProposedSplitDay[];
  rationale: string;
  warnings: string[];
}

export interface GeneratedDayPreview {
  day: ProposedSplitDay;
  programDay: ProgramDay;
  suggestion: WorkoutSuggestionPreview;
  estimatedMinutes: number;
  exerciseCount: number;
  mainMuscleGroups: string[];
}

export interface TrainingPlanGeneratedProgram {
  proposal: TrainingSplitProposal;
  program: WorkoutProgram;
  daysPreview: GeneratedDayPreview[];
  warnings: string[];
}

// ===== Taxonomia Muscular e Categorias =====

const LOWER_BODY_GROUPS: ReadonlySet<MuscleGroupId> = new Set([
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'adductors',
  'abductors',
  'legs_general',
]);

const PUSH_GROUPS: ReadonlySet<MuscleGroupId> = new Set([
  'chest',
  'shoulders',
  'triceps',
]);

const PULL_GROUPS: ReadonlySet<MuscleGroupId> = new Set([
  'back',
  'biceps',
  'traps',
  'forearms',
]);

function isLowerBody(id: MuscleGroupId): boolean {
  return LOWER_BODY_GROUPS.has(id);
}

function isUpperPush(id: MuscleGroupId): boolean {
  return PUSH_GROUPS.has(id);
}

function isUpperPull(id: MuscleGroupId): boolean {
  return PULL_GROUPS.has(id);
}

// ===== Resolução de Volume e Tempo =====

function resolvePlanVolumeProfile(request: TrainingPlanRequest): VolumeProfile {
  if (request.returnToTraining) return 'compact';
  if (request.duration <= 35) return 'compact';
  if ((request.level === 'advanced' || request.level === 'athlete') && request.duration >= 75) {
    return 'high';
  }
  return 'standard';
}

function resolvePlanTargetMinutes(duration?: number): number {
  if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
    return clampTargetMinutes(duration);
  }
  return 60;
}

// ===== Construtor de Divisão por Frequência e Validação =====

export interface RawDayDefinition {
  name: string;
  muscleGroupIds: MuscleGroupId[];
  rationale: string;
}

export type PriorityCategory = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'none';

export function classifyPriorityGroup(id?: MuscleGroupId): PriorityCategory {
  if (!id) return 'none';
  if (id === 'chest') return 'chest';
  if (id === 'back') return 'back';
  if (isLowerBody(id)) return 'legs';
  if (id === 'shoulders') return 'shoulders';
  if (id === 'biceps' || id === 'triceps' || id === 'forearms') return 'arms';
  return 'none';
}

/**
 * Helper puro de validação semanal de equilíbrio muscular.
 * Garante que nenhum dos 5 grandes grupos funcionais (peito, costas, quadríceps,
 * cadeia posterior: isquiotibiais/glúteos, e ombros) fique zerado na semana.
 */
export function validateWeeklySplitBalance(days: Array<{ muscleGroupIds: MuscleGroupId[] }>): {
  valid: boolean;
  missingGroups: MuscleGroupId[];
} {
  const allGroups = new Set(days.flatMap((d) => d.muscleGroupIds));
  const missing: MuscleGroupId[] = [];

  if (!allGroups.has('chest')) missing.push('chest');
  if (!allGroups.has('back')) missing.push('back');
  if (!allGroups.has('quadriceps')) missing.push('quadriceps');
  if (!allGroups.has('hamstrings') && !allGroups.has('glutes')) {
    missing.push('hamstrings');
  }
  if (!allGroups.has('shoulders')) missing.push('shoulders');

  return {
    valid: missing.length === 0,
    missingGroups: missing,
  };
}

function buildSplitDaysForFrequency(
  freq: number,
  priorities: MuscleGroupId[],
  variant: number,
): RawDayDefinition[] {
  const p0 = classifyPriorityGroup(priorities[0]);
  const p1 = classifyPriorityGroup(priorities[1]);
  const p2 = classifyPriorityGroup(priorities[2]);

  let days: RawDayDefinition[] = [];

  // ===== 2 DIAS (Segunda e Quinta) =====
  if (freq === 2) {
    if (p0 === 'chest') {
      const dayBIds: MuscleGroupId[] = ['chest', 'hamstrings', 'glutes', 'triceps'];
      if (p1 === 'back' || p2 === 'back') dayBIds.push('back');
      if (p1 === 'shoulders' || p2 === 'shoulders') dayBIds.push('shoulders');
      if (p1 === 'arms' || p2 === 'arms') dayBIds.push('biceps');
      if (!dayBIds.includes('shoulders')) dayBIds.push('shoulders');

      days = [
        {
          name: 'Corpo Inteiro A (Foco Peito)',
          muscleGroupIds: ['chest', 'back', 'quadriceps', 'core'],
          rationale: 'Estímulo global com ênfase primária em peitoral, dorsais e membros inferiores.',
        },
        {
          name: p1 !== 'none' && priorities[1] ? `Corpo Inteiro B (Peito + ${muscleGroupShortLabel(priorities[1])})` : 'Corpo Inteiro B (Peito Secundário)',
          muscleGroupIds: dayBIds,
          rationale: 'Segundo estímulo de peito combinado com cadeia posterior, deltoides e braços.',
        },
      ];
    } else if (p0 === 'back') {
      const dayBIds: MuscleGroupId[] = ['back', 'hamstrings', 'glutes', 'core'];
      if (p1 === 'chest' || p2 === 'chest') dayBIds.push('chest');
      if (p1 === 'shoulders' || p2 === 'shoulders') dayBIds.push('shoulders');
      if (p1 === 'arms' || p2 === 'arms') dayBIds.push('triceps');
      if (!dayBIds.includes('shoulders')) dayBIds.push('shoulders');

      days = [
        {
          name: 'Corpo Inteiro A (Foco Costas)',
          muscleGroupIds: ['back', 'chest', 'quadriceps', 'biceps'],
          rationale: 'Estímulo global com ênfase primária em dorsais e membros inferiores.',
        },
        {
          name: p1 !== 'none' && priorities[1] ? `Corpo Inteiro B (Costas + ${muscleGroupShortLabel(priorities[1])})` : 'Corpo Inteiro B (Costas Secundário)',
          muscleGroupIds: dayBIds,
          rationale: 'Segundo estímulo de costas combinado com cadeia posterior e deltoides.',
        },
      ];
    } else if (p0 === 'legs') {
      days = [
        {
          name: 'Inferior e Core (Foco Pernas)',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'core'],
          rationale: 'Sessão dedicada de membros inferiores para máxima recuperação e volume.',
        },
        {
          name: 'Superior e Pernas Secundário',
          muscleGroupIds: ['chest', 'back', 'shoulders', 'glutes', 'biceps', 'triceps'],
          rationale: 'Trabalho completo de membros superiores com estímulo complementar de pernas.',
        },
      ];
    } else if (p0 === 'shoulders') {
      days = [
        {
          name: 'Corpo Inteiro A (Foco Ombros)',
          muscleGroupIds: ['shoulders', 'chest', 'back', 'quadriceps'],
          rationale: 'Sessão global com foco proeminente em deltoides, peito e costas.',
        },
        {
          name: 'Corpo Inteiro B (Ombros Secundário)',
          muscleGroupIds: ['shoulders', 'hamstrings', 'glutes', 'biceps', 'triceps', 'core'],
          rationale: 'Segundo estímulo de ombros com cadeia posterior e braços.',
        },
      ];
    } else if (p0 === 'arms') {
      days = [
        {
          name: 'Corpo Inteiro A (Foco Braços)',
          muscleGroupIds: ['biceps', 'triceps', 'chest', 'quadriceps', 'core'],
          rationale: 'Sessão global com volume dedicado para bíceps, tríceps e compostos de peito/pernas.',
        },
        {
          name: 'Corpo Inteiro B (Braços Secundário)',
          muscleGroupIds: ['biceps', 'triceps', 'back', 'hamstrings', 'glutes', 'shoulders'],
          rationale: 'Segundo estímulo de braços associado a dorsais e cadeia posterior.',
        },
      ];
    } else if (variant % 2 === 1) {
      days = [
        {
          name: 'Superior',
          muscleGroupIds: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
          rationale: 'Todos os grupos de membros superiores agrupados de forma equilibrada.',
        },
        {
          name: 'Inferior e Core',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'core'],
          rationale: 'Cadeia anterior e posterior de pernas com estabilização de tronco.',
        },
      ];
    } else {
      days = [
        {
          name: 'Corpo Inteiro A',
          muscleGroupIds: ['chest', 'back', 'quadriceps', 'core'],
          rationale: 'Sessão equilibrada cobrindo empurrar, puxar e pernas anteriores.',
        },
        {
          name: 'Corpo Inteiro B',
          muscleGroupIds: ['shoulders', 'hamstrings', 'glutes', 'biceps', 'triceps', 'calves'],
          rationale: 'Cadeia posterior, deltoides e braços completando a semana.',
        },
      ];
    }
  }

  // ===== 3 DIAS (Segunda, Quarta, Sexta) =====
  else if (freq === 3) {
    if (p0 === 'chest') {
      const day3Ids: MuscleGroupId[] = ['chest', 'shoulders', 'core'];
      let day3Name = 'Peito e Ombros';
      if (p1 === 'back') {
        day3Ids.push('back');
        day3Name = 'Tronco e Ombros (Peito e Costas)';
      } else if (p1 === 'arms') {
        day3Ids.push('biceps', 'triceps');
        day3Name = 'Peito e Braços';
      } else {
        day3Ids.push('biceps');
      }

      days = [
        {
          name: 'Peito e Tríceps',
          muscleGroupIds: ['chest', 'triceps'],
          rationale: 'Foco prioritário em peitoral e extensores de cotovelo.',
        },
        {
          name: 'Costas e Pernas',
          muscleGroupIds: ['back', 'quadriceps', 'hamstrings', 'glutes'],
          rationale: 'Preserva equilíbrio corporal completo e membros inferiores entre as sessões de peito.',
        },
        {
          name: day3Name,
          muscleGroupIds: day3Ids,
          rationale: 'Segundo estímulo de peito espaçado na semana combinado com deltoides e estabilização.',
        },
      ];
    } else if (p0 === 'back') {
      const day3Ids: MuscleGroupId[] = ['back', 'shoulders', 'core'];
      let day3Name = 'Costas e Ombros';
      if (p1 === 'chest') {
        day3Ids.push('chest');
        day3Name = 'Tronco e Ombros (Costas e Peito)';
      } else if (p1 === 'arms') {
        day3Ids.push('biceps', 'triceps');
        day3Name = 'Costas e Braços';
      } else {
        day3Ids.push('triceps');
      }

      days = [
        {
          name: 'Costas e Bíceps',
          muscleGroupIds: ['back', 'biceps', 'traps'],
          rationale: 'Foco prioritário em puxadas, remadas e flexores de cotovelo.',
        },
        {
          name: 'Peito e Pernas',
          muscleGroupIds: ['chest', 'quadriceps', 'hamstrings', 'glutes'],
          rationale: 'Equilíbrio preservando empurrar e membros inferiores completos.',
        },
        {
          name: day3Name,
          muscleGroupIds: day3Ids,
          rationale: 'Segundo estímulo de dorsais associado a deltoides e tronco.',
        },
      ];
    } else if (p0 === 'legs') {
      days = [
        {
          name: 'Pernas (Ênfase Quadríceps)',
          muscleGroupIds: ['quadriceps', 'glutes', 'calves'],
          rationale: 'Sessão pesada de membros inferiores com ênfase na cadeia anterior.',
        },
        {
          name: 'Superior Completo',
          muscleGroupIds: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
          rationale: 'Trabalho de tronco e membros superiores mantendo o balanço geral.',
        },
        {
          name: 'Pernas (Ênfase Posterior e Glúteos)',
          muscleGroupIds: ['hamstrings', 'glutes', 'calves', 'core'],
          rationale: 'Segundo estímulo de pernas com foco em isquiotibiais e glúteos.',
        },
      ];
    } else if (p0 === 'shoulders') {
      days = [
        {
          name: 'Peito e Ombros',
          muscleGroupIds: ['chest', 'shoulders', 'triceps'],
          rationale: 'Abertura com foco prioritário em deltoides e peitoral.',
        },
        {
          name: 'Costas e Pernas',
          muscleGroupIds: ['back', 'quadriceps', 'hamstrings', 'glutes'],
          rationale: 'Membros inferiores e dorsais garantindo o balanço completo.',
        },
        {
          name: 'Ombros e Braços',
          muscleGroupIds: ['shoulders', 'biceps', 'triceps', 'core'],
          rationale: 'Segundo estímulo de deltoides com trabalho isolado de braços.',
        },
      ];
    } else if (p0 === 'arms') {
      days = [
        {
          name: 'Peito e Bíceps',
          muscleGroupIds: ['chest', 'biceps', 'core'],
          rationale: 'Combinação permitindo bíceps descansados e peitoral.',
        },
        {
          name: 'Costas e Tríceps',
          muscleGroupIds: ['back', 'triceps', 'core'],
          rationale: 'Dorsais com trabalho de tríceps.',
        },
        {
          name: 'Pernas e Braços',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'biceps', 'triceps', 'shoulders'],
          rationale: 'Membros inferiores associados a segundo estímulo dedicado de braços e deltoides.',
        },
      ];
    } else if (variant % 2 === 1) {
      days = [
        {
          name: 'Corpo Inteiro A',
          muscleGroupIds: ['quadriceps', 'chest', 'back', 'core'],
          rationale: 'Corpo inteiro com foco em agachamento, supino e remada.',
        },
        {
          name: 'Corpo Inteiro B',
          muscleGroupIds: ['hamstrings', 'glutes', 'shoulders', 'biceps', 'triceps'],
          rationale: 'Corpo inteiro com foco em cadeia posterior, deltoides e braços.',
        },
        {
          name: 'Corpo Inteiro C',
          muscleGroupIds: ['quadriceps', 'chest', 'back', 'calves'],
          rationale: 'Fechamento semanal consolidando os principais padrões motores.',
        },
      ];
    } else {
      days = [
        {
          name: 'Empurrar (Push)',
          muscleGroupIds: ['chest', 'shoulders', 'triceps'],
          rationale: 'Trabalho focado no padrão de empurrar horizontal e vertical.',
        },
        {
          name: 'Puxar (Pull)',
          muscleGroupIds: ['back', 'biceps', 'traps'],
          rationale: 'Trabalho focado no padrão de puxada horizontal e vertical.',
        },
        {
          name: 'Pernas (Legs)',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'core'],
          rationale: 'Membros inferiores completos com cadeia anterior, posterior e panturrilhas.',
        },
      ];
    }
  }

  // ===== 4 DIAS (Segunda, Terça, Quinta, Sexta) =====
  else if (freq === 4) {
    if (p0 === 'chest') {
      const day4Ids: MuscleGroupId[] = ['chest', 'shoulders', 'triceps'];
      let day4Name = 'Superior (Peito Secundário)';
      if (p1 === 'back') {
        day4Ids.push('back');
        day4Name = 'Superior (Peito e Costas)';
      } else if (p1 === 'arms') {
        day4Ids.push('biceps');
        day4Name = 'Superior (Peito e Braços)';
      } else if (p1 === 'shoulders') {
        day4Name = 'Superior (Peito e Ombros)';
      } else {
        day4Ids.push('back');
      }

      days = [
        {
          name: 'Peito e Tríceps',
          muscleGroupIds: ['chest', 'triceps'],
          rationale: 'Sessão de abertura com volume concentrado no peitoral.',
        },
        {
          name: 'Membros Inferiores Completo',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
          rationale: 'Membros inferiores completos preservando a recuperação dos membros superiores.',
        },
        {
          name: 'Costas e Bíceps',
          muscleGroupIds: ['back', 'biceps', 'core'],
          rationale: 'Trabalho de puxada, dorsais e flexores de cotovelo sem sobrecarregar ombros na véspera.',
        },
        {
          name: day4Name,
          muscleGroupIds: day4Ids,
          rationale: 'Segundo estímulo de peito em sessão superior balanceada com deltoides e tronco.',
        },
      ];
    } else if (p0 === 'back') {
      const day4Ids: MuscleGroupId[] = ['back', 'shoulders', 'biceps'];
      let day4Name = 'Superior (Costas Secundário)';
      if (p1 === 'chest') {
        day4Ids.push('chest');
        day4Name = 'Superior (Costas e Peito)';
      } else if (p1 === 'arms') {
        day4Ids.push('triceps');
        day4Name = 'Costas e Braços';
      } else {
        day4Ids.push('chest');
      }

      days = [
        {
          name: 'Costas e Bíceps',
          muscleGroupIds: ['back', 'biceps'],
          rationale: 'Abertura semanal com foco prioritário em puxadas e largura dorsal.',
        },
        {
          name: 'Membros Inferiores Completo',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
          rationale: 'Membros inferiores completos garantindo equilíbrio corporal.',
        },
        {
          name: 'Peito e Tríceps',
          muscleGroupIds: ['chest', 'triceps', 'core'],
          rationale: 'Sessão de empurrar completa mantendo os membros superiores equilibrados.',
        },
        {
          name: day4Name,
          muscleGroupIds: day4Ids,
          rationale: 'Segundo estímulo de costas com deltoides e membros superiores complementares.',
        },
      ];
    } else if (p0 === 'legs') {
      days = [
        {
          name: 'Inferior A (Quadríceps e Glúteos)',
          muscleGroupIds: ['quadriceps', 'glutes', 'calves'],
          rationale: 'Membros inferiores com foco em dominância de joelho.',
        },
        {
          name: 'Superior A',
          muscleGroupIds: ['chest', 'back', 'shoulders', 'triceps'],
          rationale: 'Tronco completo equilibrado.',
        },
        {
          name: 'Inferior B (Posterior e Glúteos)',
          muscleGroupIds: ['hamstrings', 'glutes', 'calves', 'core'],
          rationale: 'Segundo estímulo de pernas com dominância de quadril.',
        },
        {
          name: 'Superior B',
          muscleGroupIds: ['back', 'chest', 'biceps', 'shoulders'],
          rationale: 'Tronco completo com ênfase em puxadas e braços.',
        },
      ];
    } else if (p0 === 'shoulders') {
      days = [
        {
          name: 'Peito e Ombros',
          muscleGroupIds: ['chest', 'shoulders', 'triceps'],
          rationale: 'Abertura com ênfase primária em deltoides anterior/lateral e peitoral.',
        },
        {
          name: 'Membros Inferiores Completo',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
          rationale: 'Membros inferiores completos equilibrados.',
        },
        {
          name: 'Costas e Bíceps',
          muscleGroupIds: ['back', 'biceps', 'core'],
          rationale: 'Puxadas e estabilização de tronco.',
        },
        {
          name: 'Ombros e Superior',
          muscleGroupIds: ['shoulders', 'back', 'chest', 'biceps'],
          rationale: 'Segundo estímulo de deltoides com trabalho complementar de tronco.',
        },
      ];
    } else if (p0 === 'arms') {
      days = [
        {
          name: 'Peito e Bíceps',
          muscleGroupIds: ['chest', 'biceps', 'core'],
          rationale: 'Abertura com foco prioritário em peito e flexores de cotovelo.',
        },
        {
          name: 'Membros Inferiores Completo',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
          rationale: 'Membros inferiores completos.',
        },
        {
          name: 'Costas e Tríceps',
          muscleGroupIds: ['back', 'triceps', 'core'],
          rationale: 'Dorsais com foco em tríceps.',
        },
        {
          name: 'Braços e Ombros',
          muscleGroupIds: ['biceps', 'triceps', 'shoulders', 'back'],
          rationale: 'Segundo estímulo focado de braços e deltoides completando a semana.',
        },
      ];
    } else {
      days = [
        {
          name: 'Superior A',
          muscleGroupIds: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
          rationale: 'Membros superiores completos com ênfase em compostos.',
        },
        {
          name: 'Inferior A',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
          rationale: 'Membros inferiores equilibrados entre anterior e posterior.',
        },
        {
          name: 'Superior B',
          muscleGroupIds: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
          rationale: 'Segundo estímulo de superiores com variações complementares.',
        },
        {
          name: 'Inferior B',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'core'],
          rationale: 'Segundo estímulo de inferiores associado ao fortalecimento de core.',
        },
      ];
    }
  }

  // ===== 5 DIAS (NUNCA VIRA A/B/C/A/B) =====
  else if (freq === 5) {
    if (p0 === 'chest') {
      days = [
        {
          name: 'Peito e Tríceps',
          muscleGroupIds: ['chest', 'triceps'],
          rationale: 'Abertura da semana com foco máximo e volume dedicado no peitoral.',
        },
        {
          name: 'Costas e Bíceps',
          muscleGroupIds: ['back', 'biceps'],
          rationale: 'Trabalho dorsal completo garantindo equilíbrio postural.',
        },
        {
          name: 'Pernas Completo',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
          rationale: 'Membros inferiores inteiros preservando o descanso dos membros superiores.',
        },
        {
          name: p1 === 'shoulders' ? 'Peito e Ombros (Foco Deltoides)' : 'Peito e Ombros',
          muscleGroupIds: ['chest', 'shoulders'],
          rationale: 'Segundo estímulo de peito espaçado na semana, combinado com deltoides.',
        },
        {
          name: p1 === 'arms' ? 'Braços e Costas' : 'Costas e Braços',
          muscleGroupIds: ['back', 'biceps', 'triceps', 'core'],
          rationale: 'Fechamento semanal integrando costas, braços e core.',
        },
      ];
    } else if (p0 === 'back') {
      days = [
        {
          name: 'Costas e Bíceps',
          muscleGroupIds: ['back', 'biceps'],
          rationale: 'Abertura com foco prioritário em puxadas pesadas e largura dorsal.',
        },
        {
          name: 'Peito e Tríceps',
          muscleGroupIds: ['chest', 'triceps'],
          rationale: 'Sessão de empurrar completa mantendo o balanço corporal.',
        },
        {
          name: 'Pernas Completo',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
          rationale: 'Membros inferiores garantindo que pernas não sejam omitidas.',
        },
        {
          name: 'Costas e Ombros',
          muscleGroupIds: ['back', 'shoulders'],
          rationale: 'Segundo estímulo de costas focado em densidade, com deltoides.',
        },
        {
          name: p1 === 'chest' ? 'Peito e Braços' : p1 === 'arms' ? 'Braços Dedicados e Core' : 'Braços e Core',
          muscleGroupIds: p1 === 'chest' ? ['chest', 'biceps', 'triceps', 'core'] : ['biceps', 'triceps', 'core'],
          rationale: 'Fechamento com volume específico para braços e estabilidade central.',
        },
      ];
    } else if (p0 === 'legs') {
      days = [
        {
          name: 'Pernas (Foco Quadríceps)',
          muscleGroupIds: ['quadriceps', 'glutes', 'calves'],
          rationale: 'Primeira sessão de membros inferiores com ênfase em dominância de joelho.',
        },
        {
          name: 'Peito e Tríceps',
          muscleGroupIds: ['chest', 'triceps'],
          rationale: 'Membros superiores anteriores e extensores de cotovelo.',
        },
        {
          name: 'Costas e Bíceps',
          muscleGroupIds: ['back', 'biceps'],
          rationale: 'Puxadas e remadas mantendo a integridade postural.',
        },
        {
          name: 'Pernas (Foco Posterior e Glúteos)',
          muscleGroupIds: ['hamstrings', 'glutes', 'calves'],
          rationale: 'Segundo estímulo de pernas espaçado com foco em cadeia posterior.',
        },
        {
          name: 'Ombros, Braços e Core',
          muscleGroupIds: ['shoulders', 'biceps', 'triceps', 'core'],
          rationale: 'Fechamento semanal integrando deltoides, braços e abdômen.',
        },
      ];
    } else if (p0 === 'shoulders') {
      days = [
        {
          name: 'Peito e Ombros',
          muscleGroupIds: ['chest', 'shoulders'],
          rationale: 'Sessão de empurrar com foco destacado no deltoide anterior e lateral.',
        },
        {
          name: 'Costas e Bíceps',
          muscleGroupIds: ['back', 'biceps'],
          rationale: 'Trabalho de dorsais e posteriores mantendo o balanço.',
        },
        {
          name: 'Pernas Completo',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
          rationale: 'Membros inferiores completos preservando a recuperação dos membros superiores.',
        },
        {
          name: 'Ombros e Tríceps',
          muscleGroupIds: ['shoulders', 'triceps'],
          rationale: 'Segundo estímulo de deltoides focado em elevações e porção posterior.',
        },
        {
          name: 'Braços e Core',
          muscleGroupIds: ['biceps', 'triceps', 'core'],
          rationale: 'Finalização equilibrada de braços e estabilização de tronco.',
        },
      ];
    } else if (p0 === 'arms') {
      days = [
        {
          name: 'Peito e Bíceps',
          muscleGroupIds: ['chest', 'biceps'],
          rationale: 'Combinação clássica permitindo braços descansados na sessão.',
        },
        {
          name: 'Costas e Tríceps',
          muscleGroupIds: ['back', 'triceps'],
          rationale: 'Dorsais fortes com trabalho isolado de tríceps.',
        },
        {
          name: 'Pernas Completo',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
          rationale: 'Membros inferiores completos sem comprometer o volume de braços.',
        },
        {
          name: 'Ombros e Trapézio',
          muscleGroupIds: ['shoulders', 'traps', 'core'],
          rationale: 'Deltoides completos e cintura escapular.',
        },
        {
          name: 'Braços Dedicados (Bíceps e Tríceps)',
          muscleGroupIds: ['biceps', 'triceps'],
          rationale: 'Segundo estímulo prioritário dedicado para flexores e extensores.',
        },
      ];
    } else if (variant % 2 === 1) {
      days = [
        {
          name: 'Superior A',
          muscleGroupIds: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
          rationale: 'Sessão superior equilibrada para iniciar a semana.',
        },
        {
          name: 'Inferior A',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
          rationale: 'Membros inferiores completos.',
        },
        {
          name: 'Empurrar (Push)',
          muscleGroupIds: ['chest', 'shoulders', 'triceps'],
          rationale: 'Padrão de empurrar horizontal e vertical.',
        },
        {
          name: 'Puxar (Pull)',
          muscleGroupIds: ['back', 'biceps', 'traps'],
          rationale: 'Padrão de puxada e flexores de cotovelo.',
        },
        {
          name: 'Pernas e Core (Legs)',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'core'],
          rationale: 'Segundo estímulo de pernas com fortalecimento central.',
        },
      ];
    } else {
      days = [
        {
          name: 'Peito',
          muscleGroupIds: ['chest'],
          rationale: 'Sessão dedicada de peitoral com ênfase em diferentes ângulos.',
        },
        {
          name: 'Costas',
          muscleGroupIds: ['back'],
          rationale: 'Sessão dedicada de dorsais para largura e espessura.',
        },
        {
          name: 'Pernas',
          muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
          rationale: 'Treino completo de membros inferiores.',
        },
        {
          name: 'Ombros e Core',
          muscleGroupIds: ['shoulders', 'core'],
          rationale: 'Deltoides completos e estabilização abdominal.',
        },
        {
          name: 'Braços',
          muscleGroupIds: ['biceps', 'triceps'],
          rationale: 'Sessão focada em bíceps e tríceps em sinergia.',
        },
      ];
    }
  }

  // ===== 6 DIAS (Segunda a Sábado) =====
  else if (freq >= 6) {
    const pushAName = p0 === 'chest' ? 'Empurrar A (Foco Peito)' : p0 === 'shoulders' ? 'Empurrar A (Foco Deltoides)' : 'Empurrar A';
    const pullAName = p0 === 'back' || p1 === 'back' ? 'Puxar A (Foco Costas)' : p0 === 'arms' || p1 === 'arms' ? 'Puxar A (Foco Bíceps)' : 'Puxar A';
    const legsAName = p0 === 'legs' ? 'Pernas A (Foco Quadríceps)' : 'Pernas A';
    const pushBName = p0 === 'chest' ? 'Empurrar B (Foco Peito)' : p0 === 'shoulders' ? 'Empurrar B (Foco Deltoides)' : 'Empurrar B';
    const pullBName = p0 === 'back' || p1 === 'back' ? 'Puxar B (Foco Costas)' : 'Puxar B';
    const legsBName = p0 === 'legs' ? 'Pernas B (Foco Posterior/Glúteos)' : 'Pernas B';

    days = [
      {
        name: pushAName,
        muscleGroupIds: ['chest', 'shoulders', 'triceps'],
        rationale: 'Primeiro treino de empurrar da semana.',
      },
      {
        name: pullAName,
        muscleGroupIds: ['back', 'biceps', 'traps'],
        rationale: 'Primeiro treino de puxar da semana.',
      },
      {
        name: legsAName,
        muscleGroupIds: ['quadriceps', 'calves', 'core'],
        rationale: 'Membros inferiores com foco em quadríceps.',
      },
      {
        name: pushBName,
        muscleGroupIds: ['chest', 'shoulders', 'triceps'],
        rationale: 'Segundo treino de empurrar da semana espaçado.',
      },
      {
        name: pullBName,
        muscleGroupIds: ['back', 'biceps'],
        rationale: 'Segundo treino de puxar da semana.',
      },
      {
        name: legsBName,
        muscleGroupIds: ['hamstrings', 'glutes', 'calves'],
        rationale: 'Membros inferiores com foco em posterior e glúteos.',
      },
    ];
  } else {
    days = [
      {
        name: 'Corpo Inteiro',
        muscleGroupIds: ['chest', 'back', 'quadriceps', 'hamstrings', 'shoulders'],
        rationale: 'Sessão geral.',
      },
    ];
  }

  // Validação e garantia de cobertura semanal obrigatória
  const balance = validateWeeklySplitBalance(days);
  if (!balance.valid) {
    for (const missing of balance.missingGroups) {
      if (missing === 'hamstrings' || missing === 'glutes') {
        const lowerDay = days.find((d) => d.muscleGroupIds.some(isLowerBody));
        if (lowerDay) {
          if (!lowerDay.muscleGroupIds.includes('hamstrings')) lowerDay.muscleGroupIds.push('hamstrings');
          if (!lowerDay.muscleGroupIds.includes('glutes')) lowerDay.muscleGroupIds.push('glutes');
        } else {
          days[days.length - 1].muscleGroupIds.push('hamstrings', 'glutes');
        }
      } else if (missing === 'back') {
        const pullDay = days.find((d) => d.muscleGroupIds.some(isUpperPull));
        if (pullDay) {
          if (!pullDay.muscleGroupIds.includes('back')) pullDay.muscleGroupIds.push('back');
        } else {
          days[0].muscleGroupIds.push('back');
        }
      } else if (missing === 'chest') {
        const pushDay = days.find((d) => d.muscleGroupIds.some(isUpperPush));
        if (pushDay) {
          if (!pushDay.muscleGroupIds.includes('chest')) pushDay.muscleGroupIds.push('chest');
        } else {
          days[0].muscleGroupIds.push('chest');
        }
      } else if (missing === 'shoulders') {
        const pushDay = days.find((d) => d.muscleGroupIds.includes('chest'));
        if (pushDay && !pushDay.muscleGroupIds.includes('shoulders')) {
          pushDay.muscleGroupIds.push('shoulders');
        } else {
          days[days.length - 1].muscleGroupIds.push('shoulders');
        }
      } else if (missing === 'quadriceps') {
        const legDay = days.find((d) => d.muscleGroupIds.some(isLowerBody));
        if (legDay) {
          if (!legDay.muscleGroupIds.includes('quadriceps')) legDay.muscleGroupIds.push('quadriceps');
        } else {
          days[days.length - 1].muscleGroupIds.push('quadriceps');
        }
      }
    }
  }

  return days;
}

// ===== Geração de Proposta de Divisão =====

export function generateTrainingSplitProposal(request: TrainingPlanRequest): TrainingSplitProposal {
  const frequency = Math.min(6, Math.max(2, Math.round(request.frequency || 4)));
  const targetMinutes = resolvePlanTargetMinutes(request.duration);
  const volumeProfile = resolvePlanVolumeProfile(request);
  const rawPriorities = (request.priorityMuscleGroups ?? []).slice(0, 3) as MuscleGroupId[];
  const priorityMuscleGroups: MuscleGroupId[] = [];
  for (const id of rawPriorities) {
    if (typeof id === 'string' && !priorityMuscleGroups.includes(id)) {
      priorityMuscleGroups.push(id);
    }
  }
  const variantIndex = Math.max(0, Math.floor(request.variantIndex ?? 0));

  const rawDays = buildSplitDaysForFrequency(frequency, priorityMuscleGroups, variantIndex);
  const activeDays = activeDaysForFrequency(frequency);

  const days: ProposedSplitDay[] = rawDays.map((rawDay, index) => {
    const suggestedWeekday = activeDays[index] ?? DAYS_ORDER[index % DAYS_ORDER.length];
    const autoName = generateWorkoutDayAutoName(rawDay.muscleGroupIds);
    const dayName = rawDay.name.trim() || autoName;
    const label = `${suggestedWeekday} — ${dayName}`;

    return {
      dayNumber: index + 1,
      suggestedWeekday,
      name: dayName,
      label,
      muscleGroupIds: rawDay.muscleGroupIds,
      volumeProfile,
      targetMinutes,
      rationale: rawDay.rationale,
    };
  });

  const warnings: string[] = [];
  if (priorityMuscleGroups.length > 0) {
    const priorityLabels = priorityMuscleGroups.map(muscleGroupShortLabel).join(', ');
    warnings.push(
      `Prioridade aplicada para: ${priorityLabels}. O plano distribui estímulos extras mantendo o equilíbrio corporal total.`,
    );
  }

  const rationale = `Divisão de ${frequency} dias estruturada para ${targetMinutes} min por sessão com perfil de volume ${volumeProfile}. `
    + `Todos os grandes grupos corporais são estimulados ao longo da semana com espaçamento adequado.`;

  return {
    id: `split_${frequency}d_${Date.now()}`,
    name: `Plano Personalizado ${frequency} Dias`,
    description: `Divisão semanal planejada para seu nível (${request.level}), duração de ${targetMinutes} min e frequência de ${frequency}x na semana.`,
    frequency,
    targetMinutes,
    volumeProfile,
    priorityMuscleGroups,
    days,
    rationale,
    warnings,
  };
}

// ===== Preenchimento de Exercícios e Programa Final =====

export function generateTrainingPlanProgram(
  request: TrainingPlanRequest,
  catalog: readonly Exercise[],
  customProposal?: TrainingSplitProposal,
): TrainingPlanGeneratedProgram {
  const proposal = customProposal ?? generateTrainingSplitProposal(request);
  const createId = createBuilderId;

  const daysPreview: GeneratedDayPreview[] = [];
  const programDays: ProgramDay[] = [];
  const overallWarnings: string[] = [...proposal.warnings];

  for (const proposedDay of proposal.days) {
    const suggestion = buildWorkoutSuggestionPreview({
      focusIds: proposedDay.muscleGroupIds,
      targetMinutes: proposedDay.targetMinutes,
      volumeProfile: proposedDay.volumeProfile,
      level: request.level,
      goal: request.goal,
      returnToTraining: request.returnToTraining ?? null,
      existingSlots: [],
      catalog,
      availableEquipment: request.availableEquipment,
      equipmentAvailability: request.gymProfileAvailability,
      gymProfileAvailability: request.gymProfileAvailability,
      restrictions: request.restrictions,
    });

    for (const warning of suggestion.warnings) {
      if (warning.code !== 'already-fits' && !overallWarnings.includes(warning.message)) {
        overallWarnings.push(warning.message);
      }
    }

    const slots = suggestion.additions.map((addition) => ({
      ...addition.slot,
      repRange: [addition.slot.repRange[0], addition.slot.repRange[1]] as [number, number],
    }));

    const programDay: ProgramDay = {
      id: createId('day'),
      name: proposedDay.name,
      customName: proposedDay.name,
      dayNumber: proposedDay.dayNumber,
      muscleGroupIds: proposedDay.muscleGroupIds,
      volumeProfile: proposedDay.volumeProfile,
      targetMinutes: proposedDay.targetMinutes,
      slots,
    };

    programDays.push(programDay);

    const estimate = estimateWorkoutDurationDetailed(slots, catalog, {
      goal: request.goal,
    });

    const targetMinutes = proposedDay.targetMinutes;
    if (targetMinutes >= 70 && estimate.totalMinutes < targetMinutes - 5) {
      const durationWarning = `Duração alvo de ${targetMinutes} min (${proposedDay.name}): rotina estimada em ${estimate.totalMinutes} min. Considere adicionar exercícios complementares ou séries para preencher o tempo sem descanso excessivo.`;
      if (!overallWarnings.includes(durationWarning)) {
        overallWarnings.push(durationWarning);
      }
    }

    const mainGroups = Array.from(
      new Set(
        slots
          .map((slot) => {
            const ex = catalog.find((candidate) => candidate.id === slot.exerciseId);
            return ex ? muscleGroupShortLabel(ex.muscleGroup as MuscleGroupId) : null;
          })
          .filter((label): label is string => Boolean(label)),
      ),
    );

    daysPreview.push({
      day: proposedDay,
      programDay,
      suggestion,
      estimatedMinutes: estimate.totalMinutes,
      exerciseCount: slots.length,
      mainMuscleGroups: mainGroups,
    });
  }

  const program: WorkoutProgram = {
    id: createId('custom'),
    name: proposal.name,
    description: proposal.description,
    level: request.level,
    objective: typeof request.goal === 'string' ? request.goal : 'Hipertrofia',
    frequencyDays: proposal.days.length,
    durationWeeks: 4,
    repeatWeeks: true,
    isCustom: true,
    exercises: [], // Custom canônico: fonte canônica é weeks[0].days
    weeks: [
      {
        number: 1,
        days: programDays,
      },
    ],
  };

  return {
    proposal,
    program,
    daysPreview,
    warnings: overallWarnings,
  };
}

// ===== Match de Objetivo para Programas Prontos e Recomendações =====

/**
 * Avalia se um WorkoutProgram corresponde a um objetivo de treino específico.
 * Suporta chaves canônicas ('hypertrophy', 'strength', 'slimming', 'conditioning', 'athlete')
 * e rótulos/expressões comuns em pt-BR ('hipertrofia', 'força', 'emagrecimento', 'definição', 'condicionamento').
 *
 * Evita falsos positivos onde palavras secundárias na descrição (ex: 'constrói força básica' em máquinas guiadas)
 * sobrescreveriam o objetivo real de estabilização articular.
 */
export function programMatchesTrainingGoal(
  program: WorkoutProgram,
  goal?: string | null,
): boolean {
  if (!goal || goal === 'all' || goal.trim() === '') {
    return true;
  }

  const normalizedGoal = goal.trim().toLowerCase();
  const obj = (program.objective || '').toLowerCase();
  const name = (program.name || '').toLowerCase();
  const desc = (program.description || '').toLowerCase();
  const fullText = `${obj} ${name} ${desc}`;

  // 1. Hipertrofia
  if (
    normalizedGoal === 'hypertrophy'
    || normalizedGoal === 'hipertrofia'
    || normalizedGoal.startsWith('hyper')
    || normalizedGoal.startsWith('hiper')
  ) {
    if (program.id === 'prog_adv_1' || program.id === 'prog_adv_2') {
      return true;
    }
    return (
      obj.includes('hipertrof')
      || obj.includes('hypertroph')
      || obj.includes('volume')
      || name.includes('hipertrofia')
      || desc.includes('fisiculturismo')
      || desc.includes('bodybuilding')
      || fullText.includes('ganho de massa')
      || fullText.includes('densidade de fibra')
      || fullText.includes('construção extrema de volume')
    );
  }

  // 2. Força
  if (
    normalizedGoal === 'strength'
    || normalizedGoal === 'força'
    || normalizedGoal === 'forca'
  ) {
    // prog_beg_3 ("Aprendendo Máquinas Guiadas") possui "força básica" no texto explicativo,
    // mas seu objetivo primordial é estabilização articular guiada.
    if (program.id === 'prog_beg_3' || obj.includes('estabilização') || obj.includes('estabilizacao')) {
      return false;
    }
    return (
      obj.includes('força')
      || obj.includes('forca')
      || obj.includes('powerlifting')
      || obj.includes('repetição máxima')
      || obj.includes('repeticao maxima')
      || obj.includes('aumento de carga')
      || name.includes('força')
      || name.includes('forca')
      || name.includes('powerbuilding')
      || name.includes('powerlifting')
    );
  }

  // 3. Emagrecimento / Definição
  if (
    normalizedGoal === 'slimming'
    || normalizedGoal === 'emagrecimento'
    || normalizedGoal === 'emagrec'
    || normalizedGoal === 'definição'
    || normalizedGoal === 'definicao'
    || normalizedGoal.startsWith('slim')
  ) {
    return (
      fullText.includes('emagrec')
      || fullText.includes('defini')
      || fullText.includes('calórico')
      || fullText.includes('calorico')
      || fullText.includes('queima de gordura')
    );
  }

  // 4. Condicionamento / Adaptação
  if (
    normalizedGoal === 'conditioning'
    || normalizedGoal === 'condicionamento'
    || normalizedGoal.startsWith('cond')
  ) {
    return (
      fullText.includes('condicionamento')
      || fullText.includes('adaptação')
      || fullText.includes('adaptacao')
      || fullText.includes('estabilização')
      || fullText.includes('estabilizacao')
      || fullText.includes('neurológica')
      || fullText.includes('neurologica')
    );
  }

  // 5. Atleta
  if (
    normalizedGoal === 'athlete'
    || normalizedGoal === 'atleta'
  ) {
    return (
      program.level === 'athlete'
      || fullText.includes('atleta')
      || fullText.includes('powerlifting')
      || fullText.includes('competição')
      || fullText.includes('competicao')
    );
  }

  // Fallback genérico para texto livre
  return fullText.includes(normalizedGoal);
}

// ===== Recomendações para a Seção "Para você" =====

export interface ProfileRecommendation {
  program: WorkoutProgram;
  matchScore: number;
  matchReason: string;
}

export function findProfileRecommendations(
  programs: readonly WorkoutProgram[],
  profile: {
    level: string;
    goal: string;
    frequency?: number;
  },
): ProfileRecommendation[] {
  const readyPrograms = programs.filter((p) => !p.isCustom);
  const scored: ProfileRecommendation[] = [];

  const levelLower = (profile.level || '').toLowerCase();
  const freq = profile.frequency ?? 4;

  for (const prog of readyPrograms) {
    let score = 0;
    const reasons: string[] = [];

    // Nível
    if (prog.level.toLowerCase() === levelLower) {
      score += 4;
      reasons.push(`nível ${prog.level}`);
    }

    // Objetivo via helper canônico
    if (programMatchesTrainingGoal(prog, profile.goal)) {
      score += 4;
      reasons.push('combina com seu objetivo');
    }

    // Frequência
    if (prog.frequencyDays === freq) {
      score += 3;
      reasons.push(`${prog.frequencyDays}x por semana`);
    } else if (Math.abs(prog.frequencyDays - freq) === 1) {
      score += 1;
    }

    const matchReason = reasons.length > 0
      ? `Recomendado por atender seu ${reasons.join(', ')}.`
      : 'Boa opção estrutural para seu perfil.';

    scored.push({ program: prog, matchScore: score, matchReason });
  }

  scored.sort((a, b) => b.matchScore - a.matchScore);
  return scored.slice(0, 3);
}

