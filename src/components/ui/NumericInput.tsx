'use client';

import React, { useEffect, useState } from 'react';
import { normalizeNumericInput, parseNumericInput } from '../../lib/numericInput';

interface NumericInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'type' | 'inputMode' | 'onBlur' | 'onFocus'
  > {
  /** Valor numérico controlado pelo pai (null/undefined = campo vazio). */
  value: number | null | undefined;
  /** Chamado apenas no blur/confirmação com o número já validado (null = vazio). */
  onCommit: (value: number | null) => void;
  /** Aceita separador decimal (carga/incremento). Reps/RPE/descanso deixam false. */
  allowDecimal?: boolean;
  min?: number;
  max?: number;
  /**
   * Quando o campo é esvaziado e perde o foco:
   * - 'revert' (padrão): volta ao último valor válido (não inventa 0);
   * - 'null': comita null (ex.: RPE opcional volta ao placeholder).
   */
  emptyBehavior?: 'revert' | 'null';
}

/**
 * Campo numérico controlado (GOAL-15). Mantém uma string de rascunho enquanto o
 * usuário digita — só converte para número no blur. Isso evita o bug do APK
 * ("080", "012", "0.20") e permite apagar tudo sem o campo virar 0.
 *
 * Usa type="text" + inputMode numérico de propósito: o comportamento de zeros à
 * esquerda de <input type="number"> é inconsistente entre navegadores/WebView.
 */
export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onCommit,
  allowDecimal = false,
  min,
  max,
  emptyBehavior = 'revert',
  disabled,
  ...rest
}) => {
  const toDisplay = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  const [draft, setDraft] = useState<string>(toDisplay(value));
  const [focused, setFocused] = useState(false);

  // Sincroniza com o valor externo somente quando NÃO está em edição — assim
  // atualizações do pai (troca de exercício, pré-preenchimento) aparecem, mas
  // não atropelam o que o usuário está digitando.
  useEffect(() => {
    if (!focused) setDraft(toDisplay(value));
  }, [value, focused]);

  const clamp = (n: number) => {
    let r = n;
    if (typeof min === 'number') r = Math.max(min, r);
    if (typeof max === 'number') r = Math.min(max, r);
    return r;
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseNumericInput(draft, { allowDecimal });
    if (parsed === null) {
      if (emptyBehavior === 'null') {
        setDraft('');
        onCommit(null);
      } else {
        setDraft(toDisplay(value)); // reverte para o último valor válido
      }
      return;
    }
    const clamped = clamp(parsed);
    setDraft(String(clamped));
    onCommit(clamped);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      value={draft}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(normalizeNumericInput(e.target.value, { allowDecimal }))}
      onBlur={handleBlur}
    />
  );
};
