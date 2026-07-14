// GOAL-15: normalização de campos numéricos (carga, reps, RPE, descanso, etc.).
// O bug real no APK: usar `Number(e.target.value)` direto no onChange fazia
// "apagar 10 e digitar 20" virar "0.20", e digitar "80"/"12" aparecer como
// "080"/"012" (zero à esquerda). A correção é tratar o valor como STRING enquanto
// o usuário digita e só converter para número no blur/confirmação.

export interface NumericInputOptions {
  /** Aceita separador decimal (vírgula ou ponto). Reps/RPE/descanso = false; carga/incremento = true. */
  allowDecimal?: boolean;
}

/**
 * Normaliza o texto digitado em um estado numérico PARCIAL válido para exibição
 * enquanto o usuário edita. Não converte para número — devolve string.
 *
 * Regras (ver GOAL-15):
 * - mantém o campo vazio (""), nunca força "0" durante a digitação;
 * - aceita vírgula ou ponto como separador decimal (vírgula → ponto);
 * - remove zeros à esquerda: "080" → "80", "012" → "12", "00020" → "20";
 * - preserva um único zero e o zero antes do decimal: "0" → "0", "0.5" → "0.5";
 * - quando allowDecimal, mantém apenas o primeiro separador.
 */
export function normalizeNumericInput(raw: string, options: NumericInputOptions = {}): string {
  const { allowDecimal = true } = options;
  if (raw === null || raw === undefined) return '';

  // Vírgula → ponto e descarta tudo que não for dígito ou ponto.
  let s = String(raw).replace(/,/g, '.').replace(/[^0-9.]/g, '');

  if (allowDecimal) {
    // Mantém apenas o primeiro ponto decimal.
    const firstDot = s.indexOf('.');
    if (firstDot !== -1) {
      s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
    }
  } else {
    s = s.replace(/\./g, '');
  }

  // Remove zeros à esquerda que sejam seguidos por outro dígito.
  // "080" → "80"; "0" e "0.5" ficam intactos (o 0 não é seguido por dígito).
  s = s.replace(/^0+(?=\d)/, '');

  return s;
}

/**
 * Converte o texto digitado em número real (ou null se vazio/incompleto).
 * "2,5" → 2.5, "080" → 80, "" → null, "." → null.
 */
export function parseNumericInput(raw: string, options: NumericInputOptions = {}): number | null {
  const s = normalizeNumericInput(raw, options);
  if (s === '' || s === '.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
