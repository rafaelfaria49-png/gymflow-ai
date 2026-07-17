// GOAL-19B: registry PURO e IMUTÁVEL de templates estruturais do Construtor.
//
// Regras inegociáveis (ver docs/builder/GYMFLOW_GUIDED_WORKOUT_CREATION.md):
//  - Nenhum template contém exercícios. A estrutura vira `slots: []` na conversão.
//  - O `id` do template NUNCA é a identidade do programa criado.
//  - Compatibilidade é INFORMATIVA: nada bloqueia a escolha, não há "melhor template".
//  - Após a auditoria semântica, mantemos entre 5 e 7 templates úteis (aqui: 6).
//
// Auditoria semântica (PART 3): "Torso / Pernas 4 dias" foi descartado por ser
// estruturalmente idêntico a "Superior / Inferior 4 dias" (Torso = Peito+Costas+
// Ombros+Braços = Superior). Manter os dois seria duplicação sem justificativa.

import type {
  TemplateCompatibility,
  WorkoutProgramTemplate,
  WorkoutTemplateDay,
} from '../types/workout-templates';
import type { TrainingExperienceLevel, TrainingGoal } from '../types/training-profile';
import type { TrainingContinuityStatus } from '../types/training-profile';
import {
  generateWorkoutDayAutoName,
  muscleGroupShortLabel,
  resolveWorkoutDayName,
} from './workout-day-naming';

/** Congela em profundidade para o registry ser imutável também em runtime. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const ALL_LEVELS: TrainingExperienceLevel[] = ['beginner', 'intermediate', 'advanced', 'athlete'];

// Dias reutilizados entre templates são declarados uma vez e clonados na definição —
// mas cada template mantém a PRÓPRIA cópia (nada é compartilhado por referência).
const UPPER_DAY: WorkoutTemplateDay = {
  muscleGroupIds: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
  customName: 'Superior',
  volumeProfile: 'standard',
};
const LOWER_DAY: WorkoutTemplateDay = {
  muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
  customName: 'Inferior',
  volumeProfile: 'standard',
};
const PUSH_DAY: WorkoutTemplateDay = {
  muscleGroupIds: ['chest', 'shoulders', 'triceps'],
  customName: 'Empurrar',
  volumeProfile: 'standard',
};
const PULL_DAY: WorkoutTemplateDay = {
  muscleGroupIds: ['back', 'biceps', 'traps'],
  customName: 'Puxar',
  volumeProfile: 'standard',
};
const LEGS_DAY: WorkoutTemplateDay = {
  muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
  customName: 'Pernas',
  volumeProfile: 'standard',
};

const cloneDay = (day: WorkoutTemplateDay): WorkoutTemplateDay => ({
  ...day,
  muscleGroupIds: [...day.muscleGroupIds],
});

/** Garantia exibida sempre na prévia (PART 5): template é estrutura, nunca exercícios. */
export const TEMPLATE_NO_EXERCISES_NOTICE =
  'Este template cria apenas a estrutura dos dias. Você continuará escolhendo os exercícios.';

const STRUCTURAL_DISCLAIMER = TEMPLATE_NO_EXERCISES_NOTICE;

const RETURN_DISCLAIMER =
  'Estrutura conservadora para retomar os treinos. Comece leve e ajuste no seu ritmo — '
  + 'o template não escolhe exercícios nem garante readaptação segura sozinho.';

/** Registry imutável. A ordem aqui é a ordem de exibição no seletor. */
export const WORKOUT_PROGRAM_TEMPLATES: readonly WorkoutProgramTemplate[] = deepFreeze([
  {
    id: 'full-body-3',
    name: 'Corpo inteiro — 3 dias',
    description: 'Três sessões de corpo inteiro na semana. Simples de manter e um bom ponto de partida.',
    recommendedFrequencies: [3],
    levelCompatibility: ['beginner', 'intermediate'],
    goalCompatibility: ['hypertrophy', 'slimming', 'conditioning', 'strength'],
    tags: ['corpo-inteiro', 'simples'],
    days: [
      { muscleGroupIds: ['full_body'], volumeProfile: 'standard' },
      { muscleGroupIds: ['full_body'], volumeProfile: 'standard' },
      { muscleGroupIds: ['full_body'], volumeProfile: 'standard' },
    ],
    disclaimer: STRUCTURAL_DISCLAIMER,
  },
  {
    id: 'upper-lower-4',
    name: 'Superior / Inferior — 4 dias',
    description: 'Dois dias de membros superiores e dois de inferiores, alternados na semana.',
    recommendedFrequencies: [4],
    levelCompatibility: ['intermediate', 'advanced', 'athlete'],
    goalCompatibility: ['hypertrophy', 'strength'],
    tags: ['superior-inferior', 'intermediario'],
    days: [cloneDay(UPPER_DAY), cloneDay(LOWER_DAY), cloneDay(UPPER_DAY), cloneDay(LOWER_DAY)],
    disclaimer: STRUCTURAL_DISCLAIMER,
  },
  {
    id: 'push-pull-legs-3',
    name: 'Empurrar / Puxar / Pernas — 3 dias',
    description: 'A divisão clássica de empurrar, puxar e pernas, uma vez por semana cada.',
    recommendedFrequencies: [3],
    levelCompatibility: ['intermediate', 'advanced', 'athlete'],
    goalCompatibility: ['hypertrophy', 'strength'],
    tags: ['ppl', 'intermediario'],
    days: [cloneDay(PUSH_DAY), cloneDay(PULL_DAY), cloneDay(LEGS_DAY)],
    disclaimer: STRUCTURAL_DISCLAIMER,
  },
  {
    id: 'push-pull-legs-6',
    name: 'Empurrar / Puxar / Pernas — 6 dias',
    description: 'A divisão empurrar, puxar e pernas repetida duas vezes na semana. Alto compromisso de frequência.',
    recommendedFrequencies: [6],
    levelCompatibility: ['advanced', 'athlete'],
    goalCompatibility: ['hypertrophy'],
    tags: ['ppl', 'avancado', 'alto-volume'],
    days: [
      cloneDay(PUSH_DAY),
      cloneDay(PULL_DAY),
      cloneDay(LEGS_DAY),
      cloneDay(PUSH_DAY),
      cloneDay(PULL_DAY),
      cloneDay(LEGS_DAY),
    ],
    disclaimer: STRUCTURAL_DISCLAIMER,
  },
  {
    id: 'five-day-split',
    name: 'Divisão 5 dias',
    description: 'Um grupo em foco por dia ao longo de cinco dias, para quem já treina com frequência.',
    recommendedFrequencies: [5],
    levelCompatibility: ['intermediate', 'advanced', 'athlete'],
    goalCompatibility: ['hypertrophy'],
    tags: ['divisao', 'avancado'],
    days: [
      { muscleGroupIds: ['chest'], volumeProfile: 'standard' },
      { muscleGroupIds: ['back'], volumeProfile: 'standard' },
      { muscleGroupIds: ['quadriceps', 'hamstrings', 'glutes', 'calves'], customName: 'Pernas', volumeProfile: 'standard' },
      { muscleGroupIds: ['shoulders', 'core'], volumeProfile: 'standard' },
      { muscleGroupIds: ['biceps', 'triceps'], customName: 'Braços', volumeProfile: 'standard' },
    ],
    disclaimer: STRUCTURAL_DISCLAIMER,
  },
  {
    id: 'return-full-body-3',
    name: 'Retorno — Corpo inteiro 3 dias',
    description: 'Três sessões de corpo inteiro com volume inicial reduzido, pensadas para quem está voltando a treinar.',
    recommendedFrequencies: [3],
    levelCompatibility: ALL_LEVELS,
    goalCompatibility: ['conditioning', 'hypertrophy', 'slimming'],
    tags: ['retorno', 'corpo-inteiro', 'conservador'],
    forReturningUsers: true,
    days: [
      { muscleGroupIds: ['full_body'], volumeProfile: 'compact' },
      { muscleGroupIds: ['full_body'], volumeProfile: 'compact' },
      { muscleGroupIds: ['full_body'], volumeProfile: 'compact' },
    ],
    disclaimer: RETURN_DISCLAIMER,
  },
]);

export function listWorkoutTemplates(): readonly WorkoutProgramTemplate[] {
  return WORKOUT_PROGRAM_TEMPLATES;
}

export function getWorkoutTemplate(id: string): WorkoutProgramTemplate | undefined {
  return WORKOUT_PROGRAM_TEMPLATES.find((template) => template.id === id);
}

// ===== Rótulos de exibição (prévia) =====

/** Nome exibido de um dia do template: rótulo estrutural ou nome automático por foco. */
export function getTemplateDayName(day: WorkoutTemplateDay): string {
  return resolveWorkoutDayName({
    customName: day.customName,
    autoName: generateWorkoutDayAutoName(day.muscleGroupIds),
  });
}

/** Rótulos curtos dos grupos musculares do dia, na ordem da taxonomia. */
export function getTemplateDayFocusLabels(day: WorkoutTemplateDay): string[] {
  return day.muscleGroupIds.map(muscleGroupShortLabel);
}

// ===== Compatibilidade (informativa) =====

export interface TemplateCompatibilityProfile {
  level: TrainingExperienceLevel;
  frequency?: number;
  goal?: TrainingGoal;
  trainingStatus?: TrainingContinuityStatus;
}

/**
 * Lê a compatibilidade entre um template e o perfil. Puro e informativo (PART 4):
 * jamais bloqueia a escolha e não pontua "melhor template". A frase `note` é honesta
 * — quando o número de dias difere da frequência, ela deixa claro que dá para editar.
 */
export function evaluateTemplateCompatibility(
  template: WorkoutProgramTemplate,
  profile: TemplateCompatibilityProfile,
): TemplateCompatibility {
  const dayCount = template.days.length;
  const freq = profile.frequency;
  const hasFreq = typeof freq === 'number' && Number.isFinite(freq) && freq > 0;

  const recommendedForFrequency = hasFreq && template.recommendedFrequencies.includes(freq);
  const levelCompatible = template.levelCompatibility.includes(profile.level);
  const goalCompatible = profile.goal ? template.goalCompatibility.includes(profile.goal) : false;
  const suitableForReturn = Boolean(template.forReturningUsers);
  const moreDaysThanFrequency = hasFreq && dayCount > freq;
  const fewerDaysThanFrequency = hasFreq && dayCount < freq;

  const daysWord = (n: number) => (n === 1 ? 'dia' : 'dias');
  let note: string;
  if (hasFreq && dayCount !== freq) {
    note = `Seu perfil indica ${freq} ${daysWord(freq)} por semana. Este template tem `
      + `${dayCount} ${daysWord(dayCount)}, mas você poderá editá-lo.`;
  } else if (recommendedForFrequency) {
    note = `Compatível com sua frequência de ${freq} ${daysWord(freq as number)} por semana.`;
  } else {
    note = 'Você poderá ajustar os dias depois de aplicar.';
  }

  return {
    recommendedForFrequency,
    levelCompatible,
    goalCompatible,
    suitableForReturn,
    moreDaysThanFrequency,
    fewerDaysThanFrequency,
    note,
  };
}
