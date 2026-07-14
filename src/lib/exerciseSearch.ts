import { Exercise } from '../types';

// GOAL-15: busca de exercicios tolerante a acentos e a nomes comuns de academia.
// Antes a busca era `name.toLowerCase().includes(query)` — sensivel a acento
// ("triceps" nao achava "Triceps ...") e sem apelidos ("pulley", "puxada alta",
// "remada baixa" nao achavam nada). Agora normaliza acentos e casa por tokens
// contra nome + searchTerms + equipamento + grupo muscular.

/** Remove acentos e baixa a caixa para comparacao tolerante. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove marcas de acento combinantes
    .toLowerCase()
    .trim();
}

// Palavras muito comuns que nao devem obrigar correspondencia (ex.: "coice de
// triceps", "remada baixa no cabo").
const STOPWORDS = new Set(['de', 'da', 'do', 'na', 'no', 'em', 'com', 'e', 'a', 'o', 'para', 'pra']);

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'peito',
  back: 'costas',
  shoulders: 'ombros',
  biceps: 'biceps',
  triceps: 'triceps',
  legs: 'pernas',
  glutes: 'gluteos',
  abs: 'abdomen',
  calves: 'panturrilha',
  cardio: 'cardio',
  mobility: 'mobilidade',
  functional: 'funcional',
};

/** Texto "buscavel" (sem acento): nome + apelidos + equipamento + grupo muscular. */
function haystack(exercise: Exercise): string {
  const parts = [
    exercise.name,
    ...(exercise.searchTerms ?? []),
    exercise.equipment,
    MUSCLE_LABELS[exercise.muscleGroup] ?? exercise.muscleGroup,
  ];
  return normalizeText(parts.join(' '));
}

/**
 * true se TODOS os tokens relevantes da busca aparecem no texto do exercicio.
 * Busca vazia (ou so com stopwords) casa com tudo. Tokens separados permitem
 * "triceps polia" achar "Triceps na Polia com Barra Reta".
 */
export function matchesExerciseSearch(exercise: Exercise, query: string): boolean {
  const q = normalizeText(query);
  if (q === '') return true;
  const tokens = q.split(/\s+/).filter((t) => t.length > 0 && !STOPWORDS.has(t));
  if (tokens.length === 0) return true;
  const hay = haystack(exercise);
  return tokens.every((token) => hay.includes(token));
}
