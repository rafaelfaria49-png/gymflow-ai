import { describe, expect, it } from 'vitest';
import {
  createNumericInputMachineState,
  sanitizeNumericInputDraft,
  transitionNumericInput,
  type NumericInputMachineOptions,
  type NumericInputMachineState,
} from './NumericInput';

const focus = (
  value: number | null | undefined,
  options: NumericInputMachineOptions = {},
): NumericInputMachineState =>
  transitionNumericInput(
    createNumericInputMachineState(value),
    { type: 'focus', value },
    options,
  ).state;

describe('sanitizeNumericInputDraft', () => {
  it('preserva zeros à esquerda e o separador digitado enquanto o campo está focado', () => {
    expect(sanitizeNumericInputDraft('080')).toBe('080');
    expect(sanitizeNumericInputDraft('12,5', true)).toBe('12,5');
    expect(sanitizeNumericInputDraft('12.5', true)).toBe('12.5');
  });

  it('mantém somente caracteres numéricos e o primeiro separador permitido', () => {
    expect(sanitizeNumericInputDraft('a01,2.3kg', true)).toBe('01,23');
    expect(sanitizeNumericInputDraft('12,5')).toBe('125');
  });
});

describe('transitionNumericInput', () => {
  it('confirma e normaliza um valor válido no blur', () => {
    const editing = transitionNumericInput(
      focus(10),
      { type: 'change', raw: '080' },
      { emitValidChange: true },
    );
    expect(editing.state.draft).toBe('080');
    expect(editing.effects).toEqual({ validChange: 80 });

    const blurred = transitionNumericInput(
      editing.state,
      { type: 'blur' },
      { emitValidChange: true },
    );
    expect(blurred.state).toMatchObject({ draft: '80', focused: false, externalValue: 80 });
    expect(blurred.effects).toEqual({ commit: 80 });
  });

  it('confirma no Enter, solicita blur e não depende de um segundo commit', () => {
    const editing = transitionNumericInput(
      focus(10),
      { type: 'change', raw: '12,5' },
      { allowDecimal: true, emitValidChange: true },
    );
    expect(editing.state.draft).toBe('12,5');
    expect(editing.effects).toEqual({ validChange: 12.5 });

    const entered = transitionNumericInput(
      editing.state,
      { type: 'enter' },
      { allowDecimal: true, emitValidChange: true },
    );
    expect(entered.state).toMatchObject({ draft: '12.5', focused: false });
    expect(entered.effects).toEqual({ commit: 12.5, blur: true });

    expect(
      transitionNumericInput(
        entered.state,
        { type: 'blur' },
        { allowDecimal: true, emitValidChange: true },
      ).effects,
    ).toEqual({});
  });

  it('emite números válidos durante a edição sem reformatar 080 ou vírgula', () => {
    const withLeadingZero = transitionNumericInput(
      focus(0),
      { type: 'change', raw: '080' },
      { emitValidChange: true },
    );
    expect(withLeadingZero.state.draft).toBe('080');
    expect(withLeadingZero.effects.validChange).toBe(80);

    const withComma = transitionNumericInput(
      withLeadingZero.state,
      { type: 'change', raw: '12,5' },
      { allowDecimal: true, emitValidChange: true },
    );
    expect(withComma.state.draft).toBe('12,5');
    expect(withComma.effects.validChange).toBe(12.5);
  });

  it('não emite para vazio ou decimal incompleto e não inventa zero', () => {
    const emptied = transitionNumericInput(
      focus(20),
      { type: 'change', raw: '' },
      { allowDecimal: true, emitValidChange: true },
    );
    expect(emptied.state.draft).toBe('');
    expect(emptied.effects).toEqual({});

    const partial = transitionNumericInput(
      emptied.state,
      { type: 'change', raw: ',' },
      { allowDecimal: true, emitValidChange: true },
    );
    expect(partial.state.draft).toBe(',');
    expect(partial.effects).toEqual({});
  });

  it('reverte vazio no blur sem comitar zero', () => {
    const emptied = transitionNumericInput(
      focus(20),
      { type: 'change', raw: '' },
      { emitValidChange: true },
    );
    const blurred = transitionNumericInput(
      emptied.state,
      { type: 'blur' },
      { emitValidChange: true },
    );

    expect(blurred.state).toMatchObject({ draft: '20', focused: false, externalValue: 20 });
    expect(blurred.effects).toEqual({});
  });

  it('respeita emptyBehavior null no blur e no Enter', () => {
    const emptied = transitionNumericInput(
      focus(8),
      { type: 'change', raw: '' },
      { emptyBehavior: 'null', emitValidChange: true },
    );
    const blurred = transitionNumericInput(
      emptied.state,
      { type: 'blur' },
      { emptyBehavior: 'null', emitValidChange: true },
    );
    expect(blurred.state).toMatchObject({ draft: '', focused: false, externalValue: null });
    expect(blurred.effects).toEqual({ commit: null });

    const entered = transitionNumericInput(
      transitionNumericInput(
        focus(8),
        { type: 'change', raw: '' },
        { emptyBehavior: 'null' },
      ).state,
      { type: 'enter' },
      { emptyBehavior: 'null' },
    );
    expect(entered.effects).toEqual({ commit: null, blur: true });
  });

  it('aplica min e max ao callback sem alterar o draft focado', () => {
    const belowMin = transitionNumericInput(
      focus(5),
      { type: 'change', raw: '0' },
      { min: 1, max: 10, emitValidChange: true },
    );
    expect(belowMin.state.draft).toBe('0');
    expect(belowMin.effects).toEqual({ validChange: 1 });

    const aboveMax = transitionNumericInput(
      belowMin.state,
      { type: 'change', raw: '99' },
      { min: 1, max: 10, emitValidChange: true },
    );
    expect(aboveMax.state.draft).toBe('99');
    expect(aboveMax.effects).toEqual({ validChange: 10 });

    const blurred = transitionNumericInput(
      aboveMax.state,
      { type: 'blur' },
      { min: 1, max: 10, emitValidChange: true },
    );
    expect(blurred.state.draft).toBe('10');
    expect(blurred.effects).toEqual({ commit: 10 });
  });

  it('Escape restaura o valor do início do foco e desfaz a emissão otimista', () => {
    const editing = transitionNumericInput(
      focus(10),
      { type: 'change', raw: '25' },
      { emitValidChange: true },
    );
    expect(editing.effects).toEqual({ validChange: 25 });

    const invalidAfterEmission = transitionNumericInput(
      editing.state,
      { type: 'change', raw: '' },
      { emitValidChange: true },
    );
    expect(invalidAfterEmission.effects).toEqual({});

    const escaped = transitionNumericInput(
      invalidAfterEmission.state,
      { type: 'escape' },
      { emitValidChange: true },
    );
    expect(escaped.state).toMatchObject({ draft: '10', focused: true, externalValue: 10 });
    expect(escaped.effects).toEqual({ commit: 10 });
  });

  it('Escape restaura null no RPE após emissão válida', () => {
    const editing = transitionNumericInput(
      focus(null),
      { type: 'change', raw: '8' },
      { min: 1, max: 10, emitValidChange: true },
    );
    const escaped = transitionNumericInput(
      editing.state,
      { type: 'escape' },
      { min: 1, max: 10, emitValidChange: true },
    );

    expect(escaped.state.draft).toBe('');
    expect(escaped.effects).toEqual({ commit: null });
  });

  it('Escape de draft inválido não envia valor inválido nem comita sem emissão anterior', () => {
    const invalid = transitionNumericInput(
      focus(10),
      { type: 'change', raw: '' },
      { emitValidChange: true },
    );
    const escaped = transitionNumericInput(
      invalid.state,
      { type: 'escape' },
      { emitValidChange: true },
    );

    expect(escaped.state.draft).toBe('10');
    expect(escaped.effects).toEqual({});
  });

  it('uma prop externa não atropela o draft focado, mas sincroniza fora do foco', () => {
    const editing = transitionNumericInput(
      focus(10),
      { type: 'change', raw: '080' },
      { emitValidChange: true },
    );
    const externalWhileFocused = transitionNumericInput(
      editing.state,
      { type: 'external', value: 42 },
      { emitValidChange: true },
    );
    expect(externalWhileFocused.state).toMatchObject({ draft: '080', externalValue: 42 });

    const blurred = transitionNumericInput(
      externalWhileFocused.state,
      { type: 'blur' },
      { emitValidChange: true },
    );
    expect(blurred.state.draft).toBe('80');
    expect(blurred.effects).toEqual({ commit: 80 });

    const externalAfterBlur = transitionNumericInput(
      blurred.state,
      { type: 'external', value: 42 },
      { emitValidChange: true },
    );
    expect(externalAfterBlur.state.draft).toBe('42');
  });

  it('preserva o contrato legado quando onValidChange não foi fornecido', () => {
    const editing = transitionNumericInput(
      focus(10),
      { type: 'change', raw: '12' },
    );
    expect(editing.state.draft).toBe('12');
    expect(editing.effects).toEqual({});

    const blurred = transitionNumericInput(editing.state, { type: 'blur' });
    expect(blurred.effects).toEqual({ commit: 12 });
  });
});
