// GOAL-20: sugestão assistida DETERMINÍSTICA com preview.
//
// Este motor é puro e sem efeitos: recebe foco, tempo, perfil, nível, objetivo,
// retorno, slots existentes e catálogo, e devolve um PREVIEW do que seria adicionado.
// Nada aqui chama IA/rede, usa Math.random, apaga/reordena slots existentes ou altera
// nome/foco/tempo/perfil do dia. `applySuggestionToDay` SÓ acrescenta slots — com os
// mesmos defaults de `handleAddExercise` — e é o usuário quem aplica.
//
// Ordenação estável e critérios declarados (ver docs/builder/GYMFLOW_WORKOUT_SUGGESTION.md):
//   distribuição → peso ADITIVO por grupo (base + tamanho + foco principal), repartido
//     por maior quociente (D'Hondt) e limitado pela faixa recomendada + time-fit;
//   ranking dentro do grupo → compostos antes de isolados, nível apropriado antes do
//     acima do nível, classificação curada antes da legada, e o índice do catálogo como
//     desempate final (garante duas chamadas idênticas → saída idêntica).

import type { Exercise, ExerciseSlot, VolumeProfile } from '../types';
import type {
  EquipmentId,
  ExerciseMechanics,
  MuscleGroupId,
} from '../types/training-taxonomy';
import type {
  ReturnToTrainingProfile,
  TrainingExperienceLevel,
  TrainingGoal,
} from '../types/training-profile';
import type { DetailedWorkoutDurationEstimate } from '../types/training-volume';
import type { WorkoutProgramBuilderDraft } from '../types/workout-builder';
import { estimateWorkoutDurationDetailed } from './workoutDuration';
import {
  analyzeWorkoutTimeFit,
  estimateRecommendedExerciseRange,
  type WorkoutTimeFitAnalysis,
} from './workout-time-fit';
import { matchesDayFocus, updateDaySlots } from './workout-builder';
import { getMuscleGroupDefinition } from './training-taxonomy';
import {
  joinWithConjunction,
  muscleGroupShortLabel,
  normalizeMuscleGroupIds,
} from './workout-day-naming';
import { getEquipmentDefinition } from './equipment-registry';
import { resolveLegacyEquipment } from './equipment-legacy-map';
import { getVolumeProfile } from './volumeProfiles';
import {
  MUSCLE_VOLUME_CLASS,
  RETURN_REFERENCE_MODIFIERS,
  WORKOUT_SUGGESTION_RULES,
} from './training-volume-rules';

// ===== Contrato de entrada/saída (MASTERPLAN 2.7) =====

export interface WorkoutSuggestionInput {
  /** Foco muscular do dia (chips). Sem foco → nenhuma sugestão (não inventa foco). */
  focusIds: readonly MuscleGroupId[];
  /** Tempo disponível do dia, em minutos. */
  targetMinutes: number;
  /** Perfil de volume selecionado no dia. */
  volumeProfile: VolumeProfile;
  /** Nível de experiência do programa. */
  level: TrainingExperienceLevel;
  /** Objetivo do usuário (alimenta o descanso da estimativa de duração). */
  goal: TrainingGoal | string;
  /** Retorno aos treinos — `null` = treino contínuo. Reduz o teto de exercícios. */
  returnToTraining: ReturnToTrainingProfile | null;
  /** Slots já presentes no dia — nunca são alterados. */
  existingSlots: readonly ExerciseSlot[];
  /** Catálogo de exercícios disponível. */
  catalog: readonly Exercise[];
  /** Equipamentos declarados no perfil (opcional). */
  availableEquipment?: readonly string[];
  /** Restrições declaradas no perfil (opcional). */
  restrictions?: readonly string[];
  /** Descanso padrão do perfil (opcional) — mantém a estimativa coerente com o resumo do dia. */
  defaultRestSeconds?: number;
}

export interface SuggestionAddition {
  exercise: Exercise;
  /** Slot pronto, com os MESMOS defaults de `handleAddExercise`. */
  slot: ExerciseSlot;
  /** Grupo de foco que motivou a escolha. */
  focusGroupId: MuscleGroupId;
  mechanics: ExerciseMechanics;
  /** true quando o casamento com o foco dependeu de classificação legada. */
  legacyClassification: boolean;
}

export interface SuggestionDistributionEntry {
  muscleGroupId: MuscleGroupId;
  label: string;
  /** Peso aditivo do grupo na distribuição. */
  weight: number;
  /** Quantos exercícios foram efetivamente destinados a este grupo. */
  added: number;
}

export type SuggestionWarningCode =
  | 'no-focus'
  | 'no-eligible-exercises'
  | 'legacy-classification'
  | 'equipment-unverified'
  | 'restrictions-unverified'
  | 'already-fits';

export interface SuggestionWarning {
  code: SuggestionWarningCode;
  message: string;
}

export interface WorkoutSuggestionPreview {
  focusIds: MuscleGroupId[];
  targetMinutes: number;
  volumeProfile: VolumeProfile;
  additions: SuggestionAddition[];
  distribution: SuggestionDistributionEntry[];
  /** Teto de exercícios (faixa recomendada, reduzido pelo retorno aos treinos). */
  ceilingExercises: number;
  estimateBefore: DetailedWorkoutDurationEstimate;
  estimateAfter: DetailedWorkoutDurationEstimate;
  timeFitAfter: WorkoutTimeFitAnalysis;
  /** Dia já dentro (ou acima) do tempo disponível → nada será adicionado. */
  alreadyFits: boolean;
  rationale: string[];
  warnings: SuggestionWarning[];
}

// ===== Slot default (compartilhado com handleAddExercise) =====

/**
 * Slot inicial de um exercício. É a MESMA heurística de `handleAddExercise` (GOAL-10.5):
 * sem sinergistas = isolado (mais reps, menos descanso). O Construtor reusa esta função,
 * então preview e adição manual produzem slots idênticos.
 */
export function createDefaultExerciseSlot(exercise: Exercise): ExerciseSlot {
  const isolated = !exercise.secondaryMuscles || exercise.secondaryMuscles.length === 0;
  return {
    exerciseId: exercise.id,
    series: 3,
    repRange: isolated ? [10, 15] : [8, 10],
    targetRPE: 8,
    restSec: isolated ? 75 : 120,
    progression: 'dupla',
    incrementKg: isolated ? 1 : 2.5,
  };
}

// ===== Helpers puros =====

const LEVEL_ORDER: Readonly<Record<TrainingExperienceLevel, number>> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
  athlete: 3,
};

/** Mecânica curada quando existir; senão a mesma inferência honesta do estimador de duração. */
function inferMechanics(exercise: Exercise): ExerciseMechanics {
  if (exercise.mechanics) return exercise.mechanics;
  if (exercise.muscleGroup === 'cardio') return 'cardio';
  if (exercise.muscleGroup === 'mobility') return 'mobility';
  return (exercise.secondaryMuscles?.length ?? 0) > 0 ? 'compound' : 'isolation';
}

function muscleGroupOrder(id: MuscleGroupId): number {
  return getMuscleGroupDefinition(id)?.order ?? 999;
}

function firstValidFocus(ids: readonly MuscleGroupId[]): MuscleGroupId | undefined {
  return ids.find((id) => Boolean(getMuscleGroupDefinition(id)));
}

function groupWeight(id: MuscleGroupId, primaryFocusId: MuscleGroupId | undefined): number {
  const rules = WORKOUT_SUGGESTION_RULES.distribution;
  const sizeBonus = rules.groupSizeBonus[MUSCLE_VOLUME_CLASS[id]] ?? rules.baseWeight;
  return rules.baseWeight + sizeBonus + (id === primaryFocusId ? rules.primaryFocusBonus : 0);
}

/** Menor = melhor: mecânica domina (composto antes), depois nível, depois classificação legada. */
function rankScore(
  mechanics: ExerciseMechanics,
  exerciseLevel: TrainingExperienceLevel,
  userLevel: TrainingExperienceLevel,
  legacy: boolean,
): number {
  const rules = WORKOUT_SUGGESTION_RULES.ranking;
  const diff = LEVEL_ORDER[exerciseLevel] - LEVEL_ORDER[userLevel];
  const levelPenalty = diff > 0
    ? diff * rules.aboveLevelPenalty
    : Math.abs(diff) * rules.levelDistancePenalty;
  return rules.mechanicsOrder[mechanics] * 100
    + levelPenalty
    + (legacy ? rules.legacyClassificationPenalty : 0);
}

function resolveExerciseEquipment(exercise: Exercise): { ids: EquipmentId[]; confident: boolean } {
  const canonical = Array.isArray(exercise.equipmentIds)
    ? exercise.equipmentIds.filter((id) => Boolean(getEquipmentDefinition(id)))
    : [];
  if (canonical.length > 0) return { ids: [...canonical], confident: true };
  const legacy = resolveLegacyEquipment(exercise.equipment ?? '');
  const confident = legacy.resolution === 'exact' || legacy.resolution === 'alias';
  return { ids: [...legacy.equipmentIds], confident };
}

function resolveAvailableEquipment(available: readonly string[]): Set<EquipmentId> {
  const ids = new Set<EquipmentId>();
  for (const raw of available) {
    if (getEquipmentDefinition(raw as EquipmentId)) {
      ids.add(raw as EquipmentId);
      continue;
    }
    for (const id of resolveLegacyEquipment(raw).equipmentIds) ids.add(id);
  }
  return ids;
}

/**
 * Elegibilidade por equipamento. Só EXCLUI quando há certeza (equipamento curado ou
 * resolvido exato/alias) de que o exercício exige algo fora do perfil — nunca inventa
 * disponibilidade. Classificação legada/genérica não exclui: passa marcada como não
 * confirmada, para virar aviso honesto em vez de uma afirmação falsa.
 */
function equipmentEligibility(
  exercise: Exercise,
  availableSet: Set<EquipmentId> | null,
): { allowed: boolean; unverified: boolean } {
  if (!availableSet) return { allowed: true, unverified: false };
  const { ids, confident } = resolveExerciseEquipment(exercise);
  if (ids.length === 0) return { allowed: true, unverified: true };
  if (ids.some((id) => availableSet.has(id))) return { allowed: true, unverified: false };
  if (confident) return { allowed: false, unverified: false };
  return { allowed: true, unverified: true };
}

interface Candidate {
  exercise: Exercise;
  focusGroupId: MuscleGroupId;
  mechanics: ExerciseMechanics;
  legacy: boolean;
  catalogIndex: number;
  unverifiedEquipment: boolean;
}

// ===== Preview determinístico =====

export function buildWorkoutSuggestionPreview(input: WorkoutSuggestionInput): WorkoutSuggestionPreview {
  const focusIds = normalizeMuscleGroupIds(input.focusIds);
  const primaryFocusId = firstValidFocus(input.focusIds);
  const targetMinutes = input.targetMinutes;
  const existingSlots = input.existingSlots ?? [];
  const catalog = input.catalog ?? [];
  const durationOptions = { goal: input.goal, defaultRestSeconds: input.defaultRestSeconds };

  const estimateBefore = estimateWorkoutDurationDetailed(existingSlots, catalog, durationOptions);
  const fitBefore = analyzeWorkoutTimeFit({
    targetMinutes,
    estimatedMinutes: estimateBefore.totalMinutes,
    exerciseCount: existingSlots.length,
  });

  const range = estimateRecommendedExerciseRange(targetMinutes);
  const breakDuration = input.returnToTraining?.breakDuration;
  const returnFactor = breakDuration ? RETURN_REFERENCE_MODIFIERS[breakDuration] : 1;
  // Retorno reduz o teto: piso em 1 para a redução ser visível (não travada pelo mínimo da faixa).
  const ceilingExercises = Math.max(1, Math.min(range.maximumExercises, Math.round(range.maximumExercises * returnFactor)));

  const alreadyFits = existingSlots.length > 0
    && (fitBefore.status === 'within-target' || fitBefore.status === 'over-target');
  const maxToAdd = alreadyFits ? 0 : Math.max(0, ceilingExercises - existingSlots.length);

  const warnings: SuggestionWarning[] = [];

  // Sem foco: não inventamos foco nem sugerimos nada.
  if (focusIds.length === 0) {
    warnings.push({
      code: 'no-focus',
      message: 'Defina ao menos um foco muscular no dia para receber sugestões.',
    });
    return {
      focusIds,
      targetMinutes,
      volumeProfile: input.volumeProfile,
      additions: [],
      distribution: [],
      ceilingExercises,
      estimateBefore,
      estimateAfter: estimateBefore,
      timeFitAfter: fitBefore,
      alreadyFits,
      rationale: [
        `Tempo disponível ${targetMinutes} min · perfil ${getVolumeProfile(input.volumeProfile).label}.`,
        'Escolha ao menos um foco muscular para o dia — a sugestão nunca inventa um foco.',
      ],
      warnings,
    };
  }

  // Candidatos por grupo (dedup contra o próprio dia: nunca sugere exercício já presente).
  const availableSet = input.availableEquipment && input.availableEquipment.length > 0
    ? resolveAvailableEquipment(input.availableEquipment)
    : null;
  const inDayIds = new Set(existingSlots.map((slot) => slot.exerciseId));
  const candidatesByGroup = new Map<MuscleGroupId, Candidate[]>();
  for (const groupId of focusIds) {
    const list: Candidate[] = [];
    catalog.forEach((exercise, catalogIndex) => {
      if (inDayIds.has(exercise.id)) return;
      const match = matchesDayFocus(exercise, [groupId]);
      if (!match.matches) return;
      const eligibility = equipmentEligibility(exercise, availableSet);
      if (!eligibility.allowed) return;
      list.push({
        exercise,
        focusGroupId: groupId,
        mechanics: inferMechanics(exercise),
        legacy: match.legacy,
        catalogIndex,
        unverifiedEquipment: eligibility.unverified,
      });
    });
    list.sort((left, right) =>
      rankScore(left.mechanics, left.exercise.level, input.level, left.legacy)
        - rankScore(right.mechanics, right.exercise.level, input.level, right.legacy)
      || left.catalogIndex - right.catalogIndex);
    candidatesByGroup.set(groupId, list);
  }

  // Distribuição multi-foco: maior quociente (D'Hondt) pelos pesos aditivos, com teto de
  // exercícios e time-fit ("adicionar até caber"). Empate → ordem da taxonomia (focusIds já vem ordenado).
  const weights = new Map(focusIds.map((id) => [id, groupWeight(id, primaryFocusId)]));
  const added = new Map<MuscleGroupId, number>(focusIds.map((id) => [id, 0]));
  const cursor = new Map<MuscleGroupId, number>(focusIds.map((id) => [id, 0]));
  const pickedIds = new Set<string>(inDayIds);
  const picked: Candidate[] = [];

  const nextCandidate = (groupId: MuscleGroupId): Candidate | undefined => {
    const list = candidatesByGroup.get(groupId) ?? [];
    let index = cursor.get(groupId) ?? 0;
    while (index < list.length && pickedIds.has(list[index].exercise.id)) index += 1;
    cursor.set(groupId, index);
    return list[index];
  };

  while (picked.length < maxToAdd) {
    let chosen: MuscleGroupId | undefined;
    let bestQuotient = -Infinity;
    for (const groupId of focusIds) {
      if (!nextCandidate(groupId)) continue;
      const quotient = (weights.get(groupId) ?? 0) / ((added.get(groupId) ?? 0) + 1);
      if (quotient > bestQuotient) {
        bestQuotient = quotient;
        chosen = groupId;
      }
    }
    if (!chosen) break;

    const candidate = nextCandidate(chosen);
    if (!candidate) break;

    const tentative = [
      ...existingSlots,
      ...picked.map((item) => createDefaultExerciseSlot(item.exercise)),
      createDefaultExerciseSlot(candidate.exercise),
    ];
    const estimate = estimateWorkoutDurationDetailed(tentative, catalog, durationOptions);
    const fit = analyzeWorkoutTimeFit({
      targetMinutes,
      estimatedMinutes: estimate.totalMinutes,
      exerciseCount: tentative.length,
    });
    // Caber = parar antes de estourar o tempo (o primeiro exercício sempre entra).
    if (fit.status === 'over-target' && picked.length > 0) break;

    picked.push(candidate);
    pickedIds.add(candidate.exercise.id);
    added.set(chosen, (added.get(chosen) ?? 0) + 1);

    if (fit.status === 'within-target') break;
  }

  // Ordem final das adições: compostos antes de isolados; foco principal, ordem da
  // taxonomia e índice do catálogo como desempates estáveis.
  const orderedAdditions = [...picked].sort((left, right) => {
    const order = WORKOUT_SUGGESTION_RULES.ranking.mechanicsOrder;
    if (order[left.mechanics] !== order[right.mechanics]) return order[left.mechanics] - order[right.mechanics];
    const leftPrimary = left.focusGroupId === primaryFocusId ? 0 : 1;
    const rightPrimary = right.focusGroupId === primaryFocusId ? 0 : 1;
    if (leftPrimary !== rightPrimary) return leftPrimary - rightPrimary;
    const leftOrder = muscleGroupOrder(left.focusGroupId);
    const rightOrder = muscleGroupOrder(right.focusGroupId);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.catalogIndex - right.catalogIndex;
  });

  const additions: SuggestionAddition[] = orderedAdditions.map((candidate) => ({
    exercise: candidate.exercise,
    slot: createDefaultExerciseSlot(candidate.exercise),
    focusGroupId: candidate.focusGroupId,
    mechanics: candidate.mechanics,
    legacyClassification: candidate.legacy,
  }));

  const afterSlots = [...existingSlots, ...additions.map((addition) => addition.slot)];
  const estimateAfter = estimateWorkoutDurationDetailed(afterSlots, catalog, durationOptions);
  const timeFitAfter = analyzeWorkoutTimeFit({
    targetMinutes,
    estimatedMinutes: estimateAfter.totalMinutes,
    exerciseCount: afterSlots.length,
  });

  const distribution: SuggestionDistributionEntry[] = focusIds.map((id) => ({
    muscleGroupId: id,
    label: muscleGroupShortLabel(id),
    weight: weights.get(id) ?? 0,
    added: added.get(id) ?? 0,
  }));

  // Avisos honestos.
  if (additions.some((addition) => addition.legacyClassification)) {
    warnings.push({
      code: 'legacy-classification',
      message: 'Alguns exercícios sugeridos casaram com o foco por classificação legada; confira se atendem ao que você quer treinar.',
    });
  }
  if (availableSet && orderedAdditions.some((candidate) => candidate.unverifiedEquipment)) {
    warnings.push({
      code: 'equipment-unverified',
      message: 'Não foi possível confirmar no seu perfil o equipamento de alguns exercícios sugeridos.',
    });
  }
  if (input.restrictions && input.restrictions.length > 0 && additions.length > 0) {
    warnings.push({
      code: 'restrictions-unverified',
      message: `As sugestões não filtram automaticamente suas restrições (${input.restrictions.join(', ')}); revise cada exercício antes de aplicar.`,
    });
  }
  if (alreadyFits) {
    warnings.push({
      code: 'already-fits',
      message: 'Este dia já está dentro do tempo disponível; nenhum exercício foi sugerido.',
    });
  } else if (maxToAdd > 0 && additions.length === 0) {
    warnings.push({
      code: 'no-eligible-exercises',
      message: 'Nenhum exercício elegível foi encontrado para os focos e filtros deste dia.',
    });
  }

  // Justificativa honesta (sem qualquer menção a "IA").
  const focusLabel = joinWithConjunction(focusIds.map(muscleGroupShortLabel));
  const rationale: string[] = [
    `Foco: ${focusLabel} · tempo disponível ${targetMinutes} min · perfil ${getVolumeProfile(input.volumeProfile).label}.`,
    `Faixa recomendada para ${targetMinutes} min: ${range.minimumExercises}–${range.maximumExercises} exercícios${
      returnFactor < 1 ? ` (teto reduzido para ${ceilingExercises} pelo retorno aos treinos)` : ''
    }.`,
  ];
  if (additions.length > 0) {
    const perGroup = distribution
      .filter((entry) => entry.added > 0)
      .map((entry) => `${entry.added} de ${entry.label.toLowerCase()}`);
    rationale.push(`Sugeridos ${additions.length} exercício(s): ${joinWithConjunction(perGroup)}, priorizando compostos.`);
    const fitLabel = timeFitAfter.status === 'within-target'
      ? 'dentro da faixa'
      : timeFitAfter.status === 'under-target'
        ? 'ainda abaixo'
        : 'acima';
    rationale.push(`Estimativa após aplicar: ${estimateAfter.totalMinutes} min (${fitLabel} do tempo disponível).`);
  } else if (alreadyFits) {
    rationale.push(`A estimativa atual (${estimateBefore.totalMinutes} min) já cabe no tempo disponível; nada será adicionado.`);
  } else {
    rationale.push('Nenhum exercício foi sugerido para os filtros atuais.');
  }

  return {
    focusIds,
    targetMinutes,
    volumeProfile: input.volumeProfile,
    additions,
    distribution,
    ceilingExercises,
    estimateBefore,
    estimateAfter,
    timeFitAfter,
    alreadyFits,
    rationale,
    warnings,
  };
}

// ===== Aplicação (só acrescenta slots) =====

/**
 * Aplica o preview ao dia: SÓ acrescenta os slots sugeridos ao fim da lista, com os
 * mesmos defaults de `handleAddExercise`. Não toca em nome, foco, tempo, perfil nem nos
 * slots existentes (preservados byte a byte). Sem adições → o mesmo draft, sem mutação.
 */
export function applySuggestionToDay(
  draft: WorkoutProgramBuilderDraft,
  dayId: string,
  preview: WorkoutSuggestionPreview,
): WorkoutProgramBuilderDraft {
  if (preview.additions.length === 0) return draft;
  const slots = preview.additions.map((addition) => ({
    ...addition.slot,
    repRange: [addition.slot.repRange[0], addition.slot.repRange[1]] as [number, number],
  }));
  return updateDaySlots(draft, dayId, (existing) => [...existing, ...slots]);
}
