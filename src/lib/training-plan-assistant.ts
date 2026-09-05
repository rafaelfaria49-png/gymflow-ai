// GOAL-024: Assistente de Plano de Treino determinístico e estruturado.
//
// Substitui a antiga geração cíclica (A/B/C/A/B) por um motor determinístico em 2 etapas:
//  1. Proposta de Divisão Semanal (TrainingSplitProposal) respeitando frequência (2..6),
//     duração, nível, objetivo e prioridades musculares (até 3).
//  2. Preenchimento de Exercícios via workout-suggestion respeitando aparelhos (GymProfile)
//     e restrições, gerando um WorkoutProgram canônico salvo em weeks[0].days.
//
// Regras inegociáveis:
//  - Sem IA externa, sem chamadas de rede, sem Math.random (100% determinístico e testável).
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

// ===== Construtor de Divisão por Frequência =====

interface RawDayDefinition {
  name: string;
  muscleGroupIds: MuscleGroupId[];
  rationale: string;
}

function buildSplitDaysForFrequency(
  freq: number,
  priorities: MuscleGroupId[],
  variant: number,
): RawDayDefinition[] {
  const hasChest = priorities.includes('chest');
  const hasBack = priorities.includes('back');
  const hasLegs = priorities.some(isLowerBody);
  const hasShoulders = priorities.includes('shoulders');
  const hasArms = priorities.includes('biceps') || priorities.includes('triceps');

  // ===== 2 DIAS =====
  if (freq === 2) {
    if (hasChest) {
      return [
        {
          name: 'Corpo Inteiro A (Foco Peito)',
          muscleGroupIds: ['chest', 'back', 'quadriceps', 'core'],
          rationale: 'Estímulo global com ênfase inicial em peitoral e grandes grupos.',
        },
        {
          name: 'Corpo Inteiro B (Peito Secundário)',
          muscleGroupIds: ['chest', 'shoulders', 'hamstrings', 'glutes', 'triceps'],
          rationale: 'Segundo estímulo de peito com estímulo posterior de pernas e ombros.',
        },
      ];
    }
    if (hasBack) {
      return [
        {
          name: 'Corpo Inteiro A (Foco Costas)',
          muscleGroupIds: ['back', 'chest', 'quadriceps', 'biceps'],
          rationale: 'Estímulo global com ênfase primária em dorsais e membros inferiores.',
        },
        {
          name: 'Corpo Inteiro B (Costas Secundário)',
          muscleGroupIds: ['back', 'hamstrings', 'glutes', 'shoulders', 'core'],
          rationale: 'Segundo estímulo de costas com cadeia posterior e deltoides.',
        },
      ];
    }
    if (hasLegs) {
      return [
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
    }
    // Sem prioridade explícita
    if (variant % 2 === 1) {
      return [
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
    }
    return [
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

  // ===== 3 DIAS =====
  if (freq === 3) {
    if (hasChest) {
      return [
        {
          name: 'Peito e Tríceps',
          muscleGroupIds: ['chest', 'triceps'],
          rationale: 'Foco prioritário em peitoral e extensores de cotovelo.',
        },
        {
          name: 'Costas e Pernas',
          muscleGroupIds: ['back', 'quadriceps', 'hamstrings', 'glutes'],
          rationale: 'Preserva equilíbrio corporal completo entre as duas sessões de peito.',
        },
        {
          name: 'Peito e Ombros',
          muscleGroupIds: ['chest', 'shoulders', 'biceps', 'core'],
          rationale: 'Segundo estímulo de peito com deltoides e estabilização.',
        },
      ];
    }
    if (hasBack) {
      return [
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
          name: 'Costas e Ombros',
          muscleGroupIds: ['back', 'shoulders', 'triceps', 'core'],
          rationale: 'Segundo estímulo de dorsais associado a deltoides.',
        },
      ];
    }
    if (hasLegs) {
      return [
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
    }
    // Sem prioridade
    if (variant % 2 === 1) {
      return [
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
    }
    return [
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

  // ===== 4 DIAS =====
  if (freq === 4) {
    if (hasChest) {
      return [
        {
          name: 'Peito e Tríceps',
          muscleGroupIds: ['chest', 'triceps'],
          rationale: 'Sessão de abertura com volume concentrado no peitoral.',
        },
        {
          name: 'Inferior A',
          muscleGroupIds: ['quadriceps', 'calves', 'core'],
          rationale: 'Membros inferiores preservando recuperação dos superiores.',
        },
        {
          name: 'Costas e Ombros',
          muscleGroupIds: ['back', 'shoulders', 'biceps'],
          rationale: 'Trabalho de puxada e deltoides.',
        },
        {
          name: 'Superior (Peito Secundário)',
          muscleGroupIds: ['chest', 'back', 'shoulders', 'triceps'],
          rationale: 'Segundo estímulo de peito em sessão superior balanceada.',
        },
      ];
    }
    if (hasLegs) {
      return [
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
    }
    // Sem prioridade / Padrão Upper/Lower
    return [
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

  // ===== 5 DIAS (NUNCA VIRA A/B/C/A/B) =====
  if (freq === 5) {
    if (hasChest) {
      // Exemplo canônico do objetivo: Peito prioritário com 2º estímulo sem excluir costas/pernas
      return [
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
          name: 'Peito e Ombros',
          muscleGroupIds: ['chest', 'shoulders'],
          rationale: 'Segundo estímulo de peito espaçado por 72h, combinado com deltoides.',
        },
        {
          name: 'Costas e Braços',
          muscleGroupIds: ['back', 'biceps', 'triceps', 'core'],
          rationale: 'Fechamento semanal integrando costas, braços e core.',
        },
      ];
    }
    if (hasBack) {
      return [
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
          name: 'Braços e Core',
          muscleGroupIds: ['biceps', 'triceps', 'core'],
          rationale: 'Fechamento com volume específico para braços e estabilidade central.',
        },
      ];
    }
    if (hasLegs) {
      return [
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
    }
    if (hasShoulders) {
      return [
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
    }
    if (hasArms) {
      return [
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
    }

    // Sem prioridade: Divisão 5 Dias clássica ou Upper/Lower/PPL
    if (variant % 2 === 1) {
      return [
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
    }

    // Divisão 5 dias (Five Day Split do workout-templates)
    return [
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

  // ===== 6 DIAS =====
  if (freq >= 6) {
    if (hasChest) {
      return [
        {
          name: 'Empurrar A (Foco Peito)',
          muscleGroupIds: ['chest', 'shoulders', 'triceps'],
          rationale: 'Primeiro treino de empurrar com ênfase em supinos pesados.',
        },
        {
          name: 'Puxar A',
          muscleGroupIds: ['back', 'biceps', 'traps'],
          rationale: 'Puxadas completas e dorsais.',
        },
        {
          name: 'Pernas A',
          muscleGroupIds: ['quadriceps', 'glutes', 'calves'],
          rationale: 'Membros inferiores com dominância anterior.',
        },
        {
          name: 'Empurrar B (Foco Peito)',
          muscleGroupIds: ['chest', 'shoulders', 'triceps'],
          rationale: 'Segundo estímulo de peito com variações inclinadas e isolados.',
        },
        {
          name: 'Puxar B',
          muscleGroupIds: ['back', 'biceps'],
          rationale: 'Segundo treino de puxada mantendo o balanço.',
        },
        {
          name: 'Pernas B',
          muscleGroupIds: ['hamstrings', 'glutes', 'calves', 'core'],
          rationale: 'Segundo estímulo de membros inferiores.',
        },
      ];
    }
    // Padrão PPL 6x (push-pull-legs-6)
    return [
      {
        name: 'Empurrar A',
        muscleGroupIds: ['chest', 'shoulders', 'triceps'],
        rationale: 'Primeiro treino de empurrar da semana.',
      },
      {
        name: 'Puxar A',
        muscleGroupIds: ['back', 'biceps', 'traps'],
        rationale: 'Primeiro treino de puxar da semana.',
      },
      {
        name: 'Pernas A',
        muscleGroupIds: ['quadriceps', 'calves', 'core'],
        rationale: 'Membros inferiores com foco em quadríceps.',
      },
      {
        name: 'Empurrar B',
        muscleGroupIds: ['chest', 'shoulders', 'triceps'],
        rationale: 'Segundo treino de empurrar da semana.',
      },
      {
        name: 'Puxar B',
        muscleGroupIds: ['back', 'biceps'],
        rationale: 'Segundo treino de puxar da semana.',
      },
      {
        name: 'Pernas B',
        muscleGroupIds: ['hamstrings', 'glutes', 'calves'],
        rationale: 'Membros inferiores com foco em posterior e glúteos.',
      },
    ];
  }

  // Fallback seguro: 1 dia genérico (nunca deve ocorrer para freq 2..6)
  return [
    {
      name: 'Corpo Inteiro',
      muscleGroupIds: ['full_body'],
      rationale: 'Sessão geral.',
    },
  ];
}

// ===== Geração de Proposta de Divisão =====

export function generateTrainingSplitProposal(request: TrainingPlanRequest): TrainingSplitProposal {
  const frequency = Math.min(6, Math.max(2, Math.round(request.frequency || 4)));
  const targetMinutes = resolvePlanTargetMinutes(request.duration);
  const volumeProfile = resolvePlanVolumeProfile(request);
  const priorityMuscleGroups = normalizeMuscleGroupIds(
    (request.priorityMuscleGroups ?? []).slice(0, 3) as MuscleGroupId[],
  );
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

  const goalLower = (profile.goal || '').toLowerCase();
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

    // Objetivo
    const progObj = (prog.objective || '').toLowerCase();
    const progDesc = (prog.description || '').toLowerCase();
    const progName = (prog.name || '').toLowerCase();
    const combined = `${progObj} ${progDesc} ${progName}`;

    if (
      (goalLower.includes('hyper') && combined.includes('hipertrofia'))
      || (goalLower.includes('slim') && (combined.includes('emagrec') || combined.includes('defini')))
      || (goalLower.includes('strength') && combined.includes('força'))
      || (goalLower.includes('cond') && (combined.includes('condicionamento') || combined.includes('adaptação')))
      || (goalLower.includes('ath') && combined.includes('atleta'))
    ) {
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
