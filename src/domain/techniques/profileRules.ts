import type { TrainingExperienceLevel } from '../../types/training-profile';
import type { TechniqueGate, TechniqueId } from './types';

export const TECHNIQUE_IDS: readonly TechniqueId[] = Object.freeze([
  'drop_set',
  'pyramid',
  'back_off',
  'to_failure',
  'tempo',
  'iso_hold',
  'partials',
]);

export const TECHNIQUE_LABELS: Readonly<Record<TechniqueId, string>> = Object.freeze({
  drop_set: 'Drop set',
  pyramid: 'Pirâmide',
  back_off: 'Back-off',
  to_failure: 'Até a falha',
  tempo: 'Tempo',
  iso_hold: 'Iso hold',
  partials: 'Parciais',
});

export const TECHNIQUE_EDUCATION: Readonly<Record<TechniqueId, string>> = Object.freeze({
  drop_set: 'Reduza a carga sem perder controle. Pare se a técnica sair do padrão.',
  pyramid: 'A carga sobe e desce em séries planejadas; não transforme a rampa em teste máximo.',
  back_off: 'Depois da série de topo, reduza a carga para acumular trabalho com margem.',
  to_failure: 'A falha é opcional e deve ser reservada a exercícios seguros e bem conhecidos.',
  tempo: 'O tempo controla a cadência. Use carga menor para manter a execução.',
  iso_hold: 'Sustente a posição indicada sem compensar com outra articulação.',
  partials: 'Use amplitude parcial apenas no trecho planejado e sem dor articular.',
});

/**
 * Técnicas liberadas automaticamente por nível. O iniciante não vê nenhum
 * seletor até concluir o desbloqueio educativo manual; isso evita apresentar
 * complexidade sem contexto no primeiro contato.
 */
export const DEFAULT_TECHNIQUES_BY_LEVEL: Readonly<Record<TrainingExperienceLevel, readonly TechniqueId[]>> = Object.freeze({
  beginner: Object.freeze([] as TechniqueId[]),
  intermediate: Object.freeze(['pyramid', 'back_off', 'tempo', 'iso_hold', 'partials'] as TechniqueId[]),
  advanced: Object.freeze([...TECHNIQUE_IDS] as TechniqueId[]),
  athlete: Object.freeze([...TECHNIQUE_IDS] as TechniqueId[]),
});

export function normalizeTechniqueUnlocks(value: unknown): TechniqueId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is TechniqueId => (
    typeof item === 'string' && (TECHNIQUE_IDS as readonly string[]).includes(item)
  )))];
}

export function getTechniqueGate(
  level: TrainingExperienceLevel,
  type: TechniqueId,
  manualUnlocks: readonly TechniqueId[] = [],
): TechniqueGate {
  const unlockedManually = manualUnlocks.includes(type);
  const visible = unlockedManually || DEFAULT_TECHNIQUES_BY_LEVEL[level].includes(type);
  return {
    type,
    visible,
    unlockedManually,
    educationRequired: unlockedManually || level === 'beginner',
    education: TECHNIQUE_EDUCATION[type],
    label: TECHNIQUE_LABELS[type],
  };
}

export function isTechniqueVisible(
  level: TrainingExperienceLevel,
  type: TechniqueId,
  manualUnlocks: readonly TechniqueId[] = [],
): boolean {
  return getTechniqueGate(level, type, manualUnlocks).visible;
}

export function listVisibleTechniques(
  level: TrainingExperienceLevel,
  manualUnlocks: readonly TechniqueId[] = [],
): TechniqueId[] {
  return TECHNIQUE_IDS.filter((type) => isTechniqueVisible(level, type, manualUnlocks));
}
