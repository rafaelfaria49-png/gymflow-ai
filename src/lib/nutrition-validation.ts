export const MACRO_LIMITS = {
  CALORIES: {
    MIN: 0,
    MAX: 15000,
  },
  MACROS: {
    MIN: 0,
    MAX: 1000,
  },
} as const;

/**
 * Validação canônica NUT-001 para macronutrientes e calorias.
 *
 * Regras:
 * - calories: finito, > 0 e < 15000
 * - protein, carbs, fat: finitos, >= 0 e < 1000
 *
 * Rejeita: NaN, Infinity, negativos, campos fora dos limites e tipos não numéricos.
 */
export function isValidMacroInput(
  calories: unknown,
  protein: unknown,
  carbs: unknown,
  fat: unknown
): boolean {
  if (
    typeof calories !== 'number' ||
    !Number.isFinite(calories) ||
    calories <= MACRO_LIMITS.CALORIES.MIN ||
    calories >= MACRO_LIMITS.CALORIES.MAX
  ) {
    return false;
  }

  for (const macro of [protein, carbs, fat]) {
    if (
      typeof macro !== 'number' ||
      !Number.isFinite(macro) ||
      macro < MACRO_LIMITS.MACROS.MIN ||
      macro >= MACRO_LIMITS.MACROS.MAX
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Validação de entrada para registro manual de hidratação (água).
 *
 * Regras:
 * - amountMl: finito, > 0
 * Rejeita: zero, negativos, NaN, Infinity e não-números.
 */
export function isValidWaterInput(amountMl: unknown): boolean {
  return typeof amountMl === 'number' && Number.isFinite(amountMl) && amountMl > 0;
}

export type ParsedMacroFormResult =
  | {
      valid: true;
      values: {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
      };
    }
  | {
      valid: false;
    };

/**
 * Sanitiza e converte strings de formulário de macros, prevenindo conversão
 * incorreta de strings vazias ou espaços em branco para 0.
 */
export function parseMacroFormInputs(
  kcalStr: string,
  protStr: string,
  carbStr: string,
  fatStr: string
): ParsedMacroFormResult {
  if (
    typeof kcalStr !== 'string' ||
    typeof protStr !== 'string' ||
    typeof carbStr !== 'string' ||
    typeof fatStr !== 'string'
  ) {
    return { valid: false };
  }

  const trimmedKcal = kcalStr.trim();
  const trimmedProt = protStr.trim();
  const trimmedCarb = carbStr.trim();
  const trimmedFat = fatStr.trim();

  if (!trimmedKcal || !trimmedProt || !trimmedCarb || !trimmedFat) {
    return { valid: false };
  }

  const calories = Number(trimmedKcal);
  const protein = Number(trimmedProt);
  const carbs = Number(trimmedCarb);
  const fat = Number(trimmedFat);

  if (!isValidMacroInput(calories, protein, carbs, fat)) {
    return { valid: false };
  }

  return {
    valid: true,
    values: {
      calories,
      protein,
      carbs,
      fat,
    },
  };
}
