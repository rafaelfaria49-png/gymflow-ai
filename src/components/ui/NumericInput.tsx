'use client';

import React, { useEffect, useRef, useState } from 'react';
import { parseNumericInput } from '../../lib/numericInput';

export type NumericInputEmptyBehavior = 'revert' | 'null';

export interface NumericInputMachineOptions {
  allowDecimal?: boolean;
  min?: number;
  max?: number;
  emptyBehavior?: NumericInputEmptyBehavior;
  emitValidChange?: boolean;
}

export interface NumericInputMachineState {
  draft: string;
  focused: boolean;
  externalValue: number | null;
  focusStartValue: number | null;
  hasValidEmission: boolean;
  lastEmittedValue: number | null;
}

export type NumericInputMachineAction =
  | { type: 'external'; value: number | null | undefined }
  | { type: 'focus'; value: number | null | undefined }
  | { type: 'change'; raw: string }
  | { type: 'blur' }
  | { type: 'enter' }
  | { type: 'escape' };

export interface NumericInputMachineEffects {
  validChange?: number;
  commit?: number | null;
  blur?: true;
}

export interface NumericInputMachineTransition {
  state: NumericInputMachineState;
  effects: NumericInputMachineEffects;
}

const numericValue = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const displayValue = (value: number | null | undefined): string => {
  const normalized = numericValue(value);
  return normalized === null ? '' : String(normalized);
};

/**
 * Mantém o texto que a pessoa digitou, inclusive zeros à esquerda e o separador
 * decimal escolhido. A conversão numérica acontece separadamente.
 */
export function sanitizeNumericInputDraft(raw: string, allowDecimal = false): string {
  let draft = '';
  let hasDecimalSeparator = false;

  for (const character of raw) {
    if (character >= '0' && character <= '9') {
      draft += character;
      continue;
    }

    if (allowDecimal && !hasDecimalSeparator && (character === '.' || character === ',')) {
      draft += character;
      hasDecimalSeparator = true;
    }
  }

  return draft;
}

export function clampNumericInput(value: number, min?: number, max?: number): number {
  let clamped = value;
  if (typeof min === 'number') clamped = Math.max(min, clamped);
  if (typeof max === 'number') clamped = Math.min(max, clamped);
  return clamped;
}

export function createNumericInputMachineState(
  value: number | null | undefined,
): NumericInputMachineState {
  const normalized = numericValue(value);
  return {
    draft: displayValue(normalized),
    focused: false,
    externalValue: normalized,
    focusStartValue: normalized,
    hasValidEmission: false,
    lastEmittedValue: null,
  };
}

const finishEditing = (
  state: NumericInputMachineState,
  options: NumericInputMachineOptions,
  blurAfterCommit: boolean,
): NumericInputMachineTransition => {
  const parsed = parseNumericInput(state.draft, { allowDecimal: options.allowDecimal });
  const blurEffect = blurAfterCommit ? { blur: true as const } : {};

  if (parsed === null) {
    if ((options.emptyBehavior ?? 'revert') === 'null') {
      return {
        state: {
          ...state,
          draft: '',
          focused: false,
          externalValue: null,
          hasValidEmission: false,
          lastEmittedValue: null,
        },
        effects: { commit: null, ...blurEffect },
      };
    }

    return {
      state: {
        ...state,
        draft: displayValue(state.externalValue),
        focused: false,
        hasValidEmission: false,
        lastEmittedValue: null,
      },
      effects: blurEffect,
    };
  }

  const clamped = clampNumericInput(parsed, options.min, options.max);
  return {
    state: {
      ...state,
      draft: String(clamped),
      focused: false,
      externalValue: clamped,
      hasValidEmission: false,
      lastEmittedValue: null,
    },
    effects: { commit: clamped, ...blurEffect },
  };
};

/**
 * Máquina pura do campo. Os efeitos retornados são executados pelo componente,
 * permitindo testar teclado e foco no Vitest sem adicionar um runtime de DOM.
 */
export function transitionNumericInput(
  state: NumericInputMachineState,
  action: NumericInputMachineAction,
  options: NumericInputMachineOptions = {},
): NumericInputMachineTransition {
  switch (action.type) {
    case 'external': {
      const externalValue = numericValue(action.value);
      if (state.focused) {
        return {
          state: { ...state, externalValue },
          effects: {},
        };
      }

      return {
        state: {
          ...state,
          draft: displayValue(externalValue),
          externalValue,
          focusStartValue: externalValue,
          hasValidEmission: false,
          lastEmittedValue: null,
        },
        effects: {},
      };
    }

    case 'focus': {
      if (state.focused) return { state, effects: {} };
      const focusStartValue = numericValue(action.value);
      return {
        state: {
          ...state,
          focused: true,
          externalValue: focusStartValue,
          focusStartValue,
          hasValidEmission: false,
          lastEmittedValue: null,
        },
        effects: {},
      };
    }

    case 'change': {
      const draft = sanitizeNumericInputDraft(action.raw, options.allowDecimal);
      const parsed = parseNumericInput(draft, { allowDecimal: options.allowDecimal });
      if (parsed === null) {
        return {
          state: { ...state, draft },
          effects: {},
        };
      }

      const clamped = clampNumericInput(parsed, options.min, options.max);
      if (!options.emitValidChange) {
        return {
          state: { ...state, draft },
          effects: {},
        };
      }

      return {
        state: {
          ...state,
          draft,
          externalValue: clamped,
          hasValidEmission: true,
          lastEmittedValue: clamped,
        },
        effects: { validChange: clamped },
      };
    }

    case 'blur':
      if (!state.focused) return { state, effects: {} };
      return finishEditing(state, options, false);

    case 'enter':
      if (!state.focused) return { state, effects: {} };
      return finishEditing(state, options, true);

    case 'escape': {
      const shouldRollback =
        state.hasValidEmission && state.lastEmittedValue !== state.focusStartValue;
      return {
        state: {
          ...state,
          draft: displayValue(state.focusStartValue),
          externalValue: state.focusStartValue,
          hasValidEmission: false,
          lastEmittedValue: null,
        },
        effects: shouldRollback ? { commit: state.focusStartValue } : {},
      };
    }
  }
}

interface NumericInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'type' | 'inputMode' | 'onBlur' | 'onFocus'
  > {
  /** Valor numérico controlado pelo pai (null/undefined = campo vazio). */
  value: number | null | undefined;
  /** Chamado no blur/Enter com o valor final ou no Escape para desfazer uma emissão otimista. */
  onCommit: (value: number | null) => void;
  /** Recebe imediatamente cada rascunho numericamente válido, já limitado por min/max. */
  onValidChange?: (value: number) => void;
  /** Aceita separador decimal (carga/incremento). Reps/RPE/descanso deixam false. */
  allowDecimal?: boolean;
  min?: number;
  max?: number;
  /**
   * Quando o campo é esvaziado e perde o foco:
   * - 'revert' (padrão): volta ao último valor válido (não inventa 0);
   * - 'null': comita null (ex.: RPE opcional volta ao placeholder).
   */
  emptyBehavior?: NumericInputEmptyBehavior;
}

/**
 * Campo numérico controlado que preserva uma string de rascunho enquanto focado.
 * Valores válidos podem chegar ao pai durante a digitação sem reformatar o texto.
 */
export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onCommit,
  onValidChange,
  allowDecimal = false,
  min,
  max,
  emptyBehavior = 'revert',
  disabled,
  onKeyDown,
  ...rest
}) => {
  const options: NumericInputMachineOptions = {
    allowDecimal,
    min,
    max,
    emptyBehavior,
    emitValidChange: Boolean(onValidChange),
  };
  const [machine, setMachine] = useState<NumericInputMachineState>(() =>
    createNumericInputMachineState(value),
  );
  const machineRef = useRef(machine);

  const applyTransition = (action: NumericInputMachineAction): NumericInputMachineEffects => {
    const transition = transitionNumericInput(machineRef.current, action, options);
    machineRef.current = transition.state;
    setMachine(transition.state);

    if (transition.effects.validChange !== undefined) {
      onValidChange?.(transition.effects.validChange);
    }
    if (transition.effects.commit !== undefined) {
      onCommit(transition.effects.commit);
    }

    return transition.effects;
  };

  // Atualizações externas são lembradas durante o foco, mas nunca substituem o draft.
  useEffect(() => {
    const transition = transitionNumericInput(
      machineRef.current,
      { type: 'external', value },
      options,
    );
    machineRef.current = transition.state;
    setMachine(transition.state);
    // As opções não alteram a sincronização; a prop value é a única origem deste efeito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      value={machine.draft}
      disabled={disabled}
      onFocus={() => applyTransition({ type: 'focus', value })}
      onChange={(event) => applyTransition({ type: 'change', raw: event.target.value })}
      onBlur={() => applyTransition({ type: 'blur' })}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;

        if (event.key === 'Enter') {
          event.preventDefault();
          const effects = applyTransition({ type: 'enter' });
          if (effects.blur) event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          applyTransition({ type: 'escape' });
        }
      }}
    />
  );
};
