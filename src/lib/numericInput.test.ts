import { describe, it, expect } from 'vitest';
import { normalizeNumericInput, parseNumericInput } from './numericInput';

// GOAL-15: bug confirmado no APK — "080"/"012" e "0.20". Estes testes travam o
// comportamento correto: apagar tudo, digitar 20/80/12 e decimais 2,5/2.5.

describe('normalizeNumericInput', () => {
  it('remove zeros à esquerda (bug do APK)', () => {
    expect(normalizeNumericInput('080')).toBe('80');
    expect(normalizeNumericInput('012')).toBe('12');
    expect(normalizeNumericInput('00020')).toBe('20');
    expect(normalizeNumericInput('0000')).toBe('0');
  });

  it('preserva um único zero e o zero antes do decimal', () => {
    expect(normalizeNumericInput('0')).toBe('0');
    expect(normalizeNumericInput('0.5')).toBe('0.5');
    expect(normalizeNumericInput('00.5')).toBe('0.5');
  });

  it('mantém o campo vazio (nunca vira 0 durante a digitação)', () => {
    expect(normalizeNumericInput('')).toBe('');
    expect(normalizeNumericInput('abc')).toBe('');
  });

  it('aceita vírgula como separador decimal', () => {
    expect(normalizeNumericInput('2,5')).toBe('2.5');
    expect(normalizeNumericInput('02,5')).toBe('2.5');
    expect(normalizeNumericInput('2.5')).toBe('2.5');
  });

  it('mantém apenas o primeiro separador decimal', () => {
    expect(normalizeNumericInput('2.5.3')).toBe('2.53');
    expect(normalizeNumericInput('1,2,3')).toBe('1.23');
  });

  it('remove o decimal quando allowDecimal é false (reps/RPE inteiros)', () => {
    expect(normalizeNumericInput('2,5', { allowDecimal: false })).toBe('25');
    expect(normalizeNumericInput('012', { allowDecimal: false })).toBe('12');
  });

  it('permite estado parcial durante a digitação de decimal', () => {
    expect(normalizeNumericInput('0.')).toBe('0.');
    expect(normalizeNumericInput('5,')).toBe('5.');
  });
});

describe('parseNumericInput', () => {
  it('converte string digitada em número real', () => {
    expect(parseNumericInput('20')).toBe(20);
    expect(parseNumericInput('80')).toBe(80);
    expect(parseNumericInput('012')).toBe(12);
    expect(parseNumericInput('2,5')).toBe(2.5);
    expect(parseNumericInput('02.5')).toBe(2.5);
  });

  it('nunca transforma 20 em 0.20', () => {
    // Regressão direta do bug relatado.
    expect(parseNumericInput('20')).not.toBe(0.2);
    expect(parseNumericInput('20')).toBe(20);
  });

  it('vazio/incompleto vira null (não 0)', () => {
    expect(parseNumericInput('')).toBeNull();
    expect(parseNumericInput('.')).toBeNull();
    expect(parseNumericInput('abc')).toBeNull();
  });
});
