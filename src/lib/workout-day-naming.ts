// GOAL-19A: nomes automáticos e honestos para os dias do Construtor multi-dia.
// Tudo aqui é puro: recebe foco muscular, devolve texto. Nenhuma função escolhe
// exercício, altera o treino ou aplica sugestão — nome é apresentação, não prescrição.

import type { ProgramDay } from '../types';
import type { MuscleGroupId } from '../types/training-taxonomy';
import { getMuscleGroupDefinition } from './training-taxonomy';

export const NO_FOCUS_DAY_NAME = 'Treino sem foco definido';

/** Quantos grupos aparecem por extenso antes de resumir o excedente (PART 6, regra 3). */
export const MAX_NAMED_MUSCLE_GROUPS = 4;

/**
 * Rótulos curtos para chips e nomes compostos.
 *
 * A taxonomia continua sendo a fonte da verdade (id, ordem e existência do grupo);
 * este mapa só encurta rótulos que ficariam ruins DENTRO de um nome composto —
 * "Ombros e Abdômen/Core" vira "Ombros e Core". Grupos ausentes aqui usam o label
 * da taxonomia sem alteração.
 */
const SHORT_LABEL_OVERRIDES: Partial<Record<MuscleGroupId, string>> = {
  core: 'Core',
  legs_general: 'Pernas geral',
  traps: 'Trapézio',
};

export function muscleGroupShortLabel(id: MuscleGroupId): string {
  return SHORT_LABEL_OVERRIDES[id] ?? getMuscleGroupDefinition(id)?.label ?? id;
}

function muscleGroupOrder(id: MuscleGroupId): number {
  return getMuscleGroupDefinition(id)?.order ?? 999;
}

/** Chips sempre visíveis no seletor de foco (PART 5). */
export const PRIMARY_FOCUS_GROUPS: readonly MuscleGroupId[] = Object.freeze([
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'cardio',
  'mobility',
]);

/** Chips atrás de "Mais grupos" — menos frequentes, mas nunca escondidos. */
export const SECONDARY_FOCUS_GROUPS: readonly MuscleGroupId[] = Object.freeze([
  'adductors',
  'abductors',
  'forearms',
  'traps',
  'lower_back',
  'full_body',
  'functional',
  'legs_general',
]);

/** Remove ids desconhecidos/duplicados e ordena pela ordem da taxonomia (previsível). */
export function normalizeMuscleGroupIds(ids: readonly unknown[] | undefined | null): MuscleGroupId[] {
  if (!Array.isArray(ids)) return [];
  const valid = ids.filter((id): id is MuscleGroupId =>
    typeof id === 'string' && Boolean(getMuscleGroupDefinition(id as MuscleGroupId)));
  return [...new Set(valid)].sort((left, right) => muscleGroupOrder(left) - muscleGroupOrder(right));
}

interface NamePart {
  label: string;
  order: number;
}

/**
 * Resumos de grupos compatíveis (PART 6, regra 4). Conservador de propósito:
 * só resume conjuntos completos e consagrados, e o resumo herda a ordem do primeiro
 * grupo substituído para o nome continuar previsível.
 */
const GROUP_SUMMARIES: { label: string; members: MuscleGroupId[] }[] = [
  { label: 'Pernas', members: ['quadriceps', 'hamstrings', 'glutes'] },
  { label: 'Braços', members: ['biceps', 'triceps'] },
];

function applySummaries(ids: MuscleGroupId[]): NamePart[] {
  const remaining = new Set(ids);
  const parts: NamePart[] = [];

  for (const summary of GROUP_SUMMARIES) {
    if (!summary.members.every((member) => remaining.has(member))) continue;
    parts.push({
      label: summary.label,
      order: Math.min(...summary.members.map(muscleGroupOrder)),
    });
    for (const member of summary.members) remaining.delete(member);
  }

  for (const id of remaining) {
    parts.push({ label: muscleGroupShortLabel(id), order: muscleGroupOrder(id) });
  }

  return parts.sort((left, right) => left.order - right.order);
}

/** "A" · "A e B" · "A, B e C" — conjunção PT-BR sem vírgula de série. */
export function joinWithConjunction(labels: readonly string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

/**
 * Nome automático do dia a partir do foco muscular.
 *
 * Sem foco → "Treino sem foco definido" (nunca inventa um foco).
 * Acima de MAX_NAMED_MUSCLE_GROUPS grupos, o excedente vira "e mais N" — o nome não
 * mente, apenas não enumera tudo; o painel de foco continua mostrando todos os chips.
 */
export function generateWorkoutDayAutoName(muscleGroupIds: readonly MuscleGroupId[] | undefined | null): string {
  const normalized = normalizeMuscleGroupIds(muscleGroupIds);
  if (normalized.length === 0) return NO_FOCUS_DAY_NAME;

  const parts = applySummaries(normalized);
  if (parts.length <= MAX_NAMED_MUSCLE_GROUPS) {
    return joinWithConjunction(parts.map((part) => part.label));
  }

  const named = parts.slice(0, MAX_NAMED_MUSCLE_GROUPS - 1).map((part) => part.label);
  const hiddenCount = parts.length - named.length;
  return `${named.join(', ')} e mais ${hiddenCount}`;
}

/** Nome final exibido: o customizado sempre prevalece (PART 6, regra 7/10). */
export function resolveWorkoutDayName(day: { customName?: string; autoName: string }): string {
  return day.customName?.trim() || day.autoName;
}

/** Rótulo com o número da posição: "Dia 1 — Peito e Tríceps". */
export function formatWorkoutDayLabel(dayNumber: number, name: string): string {
  return `Dia ${dayNumber} — ${name}`;
}

/**
 * Rótulo de um ProgramDay já persistido.
 *
 * Só numera dias que vieram do Construtor multi-dia (têm `dayNumber`). Dias seed
 * já carregam a própria identidade no nome ("Dia A — Peito e Tríceps") e continuam
 * exibidos exatamente como estão.
 */
export function programDayDisplayLabel(day: Pick<ProgramDay, 'name' | 'dayNumber'>): string {
  return typeof day.dayNumber === 'number' && day.dayNumber > 0
    ? formatWorkoutDayLabel(day.dayNumber, day.name)
    : day.name;
}
