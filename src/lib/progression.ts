// Motor determinístico de progressão (GOAL-08).
// Função pura: mesma entrada → mesma saída; sem Date.now(), sem aleatoriedade,
// sem acesso a estado global. Nunca crasha com histórico/RPE/peso ausentes.

import { ExerciseSlot } from '../types';

// Séries do histórico podem vir de versões antigas do estado persistido (GOAL-01),
// então todos os campos são tratados como possivelmente ausentes.
export interface HistorySet {
  reps?: number;
  weight?: number;
  completed?: boolean;
  rpe?: number;
}

// Uma sessão passada de UM exercício. A lista passada a suggestNext deve vir
// ordenada da mais recente para a mais antiga (ordem natural do workoutHistory).
export interface ExerciseSessionHistory {
  date?: string;
  sets: HistorySet[];
}

export interface ProgressionSuggestion {
  pesoKg: number | null;
  repsAlvo: number | null;
  motivo: string;
}

export function roundToHalfKg(value: number): number {
  return Math.round(value * 2) / 2;
}

// Séries válidas de uma sessão: concluídas e com reps numéricas.
function completedSets(session: ExerciseSessionHistory | undefined): HistorySet[] {
  if (!session || !Array.isArray(session.sets)) return [];
  return session.sets.filter((s) => s && s.completed === true && typeof s.reps === 'number' && !Number.isNaN(s.reps));
}

// Maior carga registrada (> 0) entre as séries concluídas da sessão, ou null.
function sessionWeight(session: ExerciseSessionHistory | undefined): number | null {
  const weights = completedSets(session)
    .map((s) => s.weight)
    .filter((w): w is number => typeof w === 'number' && !Number.isNaN(w) && w > 0);
  return weights.length > 0 ? Math.max(...weights) : null;
}

// Carga da última sessão registrada — usada pela coluna ANT do Treino Ativo.
export function lastRecordedWeight(history: ExerciseSessionHistory[]): number | null {
  if (!Array.isArray(history)) return null;
  for (const session of history) {
    const w = sessionWeight(session);
    if (w !== null) return w;
  }
  return null;
}

// Sessão "abaixo do mínimo": alguma série concluída não alcançou o piso do repRange.
function belowMin(session: ExerciseSessionHistory, repMin: number): boolean {
  const sets = completedSets(session);
  if (sets.length === 0) return false;
  return Math.min(...sets.map((s) => s.reps as number)) < repMin;
}

export function suggestNext(slot: ExerciseSlot, history: ExerciseSessionHistory[]): ProgressionSuggestion {
  const repMin = typeof slot?.repRange?.[0] === 'number' ? slot.repRange[0] : null;
  const repMax = typeof slot?.repRange?.[1] === 'number' ? slot.repRange[1] : repMin;

  // Progressão desativada: sugestão neutra, sem impor carga nem meta nova.
  if (slot?.progression === 'nenhuma') {
    return {
      pesoKg: null,
      repsAlvo: repMin,
      motivo: 'Progressão automática desativada para este exercício — mantenha a execução na faixa alvo.'
    };
  }

  // Só sessões com pelo menos 1 série concluída contam como histórico real.
  const sessions = (Array.isArray(history) ? history : []).filter((s) => completedSets(s).length > 0);

  if (sessions.length === 0) {
    return {
      pesoKg: null,
      repsAlvo: repMin,
      motivo: 'Sem histórico deste exercício — comece com uma carga confortável e registre as séries.'
    };
  }

  const last = sessions[0];
  const lastSets = completedSets(last);
  const lastWeight = sessionWeight(last);
  const increment = typeof slot?.incrementKg === 'number' && slot.incrementKg > 0 ? slot.incrementKg : 2.5;
  const targetRPE = typeof slot?.targetRPE === 'number' ? slot.targetRPE : 8;

  const rpes = lastSets
    .map((s) => s.rpe)
    .filter((r): r is number => typeof r === 'number' && !Number.isNaN(r) && r > 0);
  const maxRpe = rpes.length > 0 ? Math.max(...rpes) : null;

  // Deload 10%: abaixo do piso da faixa em 2 sessões consecutivas.
  if (repMin !== null && sessions.length >= 2 && belowMin(sessions[0], repMin) && belowMin(sessions[1], repMin)) {
    if (lastWeight !== null) {
      return {
        pesoKg: roundToHalfKg(lastWeight * 0.9),
        repsAlvo: repMin,
        motivo: `Duas sessões abaixo de ${repMin} reps — deload de 10% para recuperar a base.`
      };
    }
    return {
      pesoKg: null,
      repsAlvo: repMin,
      motivo: 'Duas sessões abaixo da faixa alvo — reduza a intensidade e registre a carga usada.'
    };
  }

  const allAtTop = repMax !== null && lastSets.every((s) => (s.reps as number) >= repMax);
  const rpeOk = maxRpe === null || maxRpe <= targetRPE;

  // Topo da faixa em todas as séries com RPE dentro do alvo: subir carga.
  if (allAtTop && rpeOk) {
    if (lastWeight !== null) {
      return {
        pesoKg: roundToHalfKg(lastWeight + increment),
        repsAlvo: repMin,
        motivo:
          `Faixa completa (${repMax} reps em todas as séries)${maxRpe === null ? ', sem RPE registrado' : ` com RPE ${maxRpe} ≤ ${targetRPE}`} — subir ${increment} kg e voltar ao piso da faixa.`
      };
    }
    return {
      pesoKg: null,
      repsAlvo: repMax,
      motivo: 'Faixa completa, mas sem carga registrada na última sessão — registre o peso para progredir.'
    };
  }

  // Caso geral (inclui RPE acima do alvo): manter carga e subir reps até o teto.
  const minRepsDone = Math.min(...lastSets.map((s) => s.reps as number));
  const repsAlvo =
    repMax !== null ? Math.min(minRepsDone + 1, repMax) : minRepsDone + 1;

  if (allAtTop && !rpeOk) {
    return {
      pesoKg: lastWeight !== null ? roundToHalfKg(lastWeight) : null,
      repsAlvo: repMax,
      motivo: `RPE ${maxRpe} acima do alvo ${targetRPE} — manter a carga e consolidar o topo da faixa antes de subir.`
    };
  }

  return {
    pesoKg: lastWeight !== null ? roundToHalfKg(lastWeight) : null,
    repsAlvo,
    motivo: `Manter a carga e buscar ${repsAlvo} reps${repMax !== null ? ` (teto da faixa: ${repMax})` : ''}.`
  };
}
