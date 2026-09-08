import { describe, expect, it } from 'vitest';
import {
  isValidMacroInput,
  isValidWaterInput,
  parseMacroFormInputs,
  MACRO_LIMITS,
} from './nutrition-validation';

describe('nutrition-validation (NUT-001 canonical rules)', () => {
  describe('isValidMacroInput', () => {
    it('aceita valores de macronutrientes válidos dentro dos limites', () => {
      expect(isValidMacroInput(500, 30, 50, 15)).toBe(true);
      expect(isValidMacroInput(1, 0, 0, 0)).toBe(true);
      expect(isValidMacroInput(14999.9, 999.9, 999.9, 999.9)).toBe(true);
    });

    it('rejeita calorias zero ou negativas', () => {
      expect(isValidMacroInput(0, 30, 50, 15)).toBe(false);
      expect(isValidMacroInput(-1, 30, 50, 15)).toBe(false);
      expect(isValidMacroInput(-500, 30, 50, 15)).toBe(false);
    });

    it('rejeita calorias no teto ou acima do limite de 15000 kcal', () => {
      expect(isValidMacroInput(15000, 30, 50, 15)).toBe(false);
      expect(isValidMacroInput(15001, 30, 50, 15)).toBe(false);
    });

    it('rejeita calorias não finitas (NaN, Infinity, -Infinity)', () => {
      expect(isValidMacroInput(Number.NaN, 30, 50, 15)).toBe(false);
      expect(isValidMacroInput(Number.POSITIVE_INFINITY, 30, 50, 15)).toBe(false);
      expect(isValidMacroInput(Number.NEGATIVE_INFINITY, 30, 50, 15)).toBe(false);
    });

    it('rejeita protein, carbs ou fat negativos', () => {
      expect(isValidMacroInput(500, -0.1, 50, 15)).toBe(false);
      expect(isValidMacroInput(500, 30, -1, 15)).toBe(false);
      expect(isValidMacroInput(500, 30, 50, -5)).toBe(false);
    });

    it('rejeita protein, carbs ou fat no teto ou acima de 1000g', () => {
      expect(isValidMacroInput(500, 1000, 50, 15)).toBe(false);
      expect(isValidMacroInput(500, 30, 1000, 15)).toBe(false);
      expect(isValidMacroInput(500, 30, 50, 1000)).toBe(false);
      expect(isValidMacroInput(500, 1050, 50, 15)).toBe(false);
    });

    it('rejeita protein, carbs ou fat não finitos (NaN, Infinity)', () => {
      expect(isValidMacroInput(500, Number.NaN, 50, 15)).toBe(false);
      expect(isValidMacroInput(500, 30, Number.POSITIVE_INFINITY, 15)).toBe(false);
      expect(isValidMacroInput(500, 30, 50, Number.NaN)).toBe(false);
    });

    it('rejeita entradas não numéricas', () => {
      expect(isValidMacroInput('500' as unknown, 30, 50, 15)).toBe(false);
      expect(isValidMacroInput(null as unknown, 30, 50, 15)).toBe(false);
      expect(isValidMacroInput(undefined as unknown, 30, 50, 15)).toBe(false);
      expect(isValidMacroInput(500, '30' as unknown, 50, 15)).toBe(false);
    });
  });

  describe('isValidWaterInput', () => {
    it('aceita valores de água positivos e finitos', () => {
      expect(isValidWaterInput(1)).toBe(true);
      expect(isValidWaterInput(250)).toBe(true);
      expect(isValidWaterInput(500)).toBe(true);
      expect(isValidWaterInput(1000)).toBe(true);
      expect(isValidWaterInput(3500)).toBe(true);
    });

    it('rejeita valor zero ou negativo', () => {
      expect(isValidWaterInput(0)).toBe(false);
      expect(isValidWaterInput(-1)).toBe(false);
      expect(isValidWaterInput(-250)).toBe(false);
    });

    it('rejeita valores não finitos ou não numéricos', () => {
      expect(isValidWaterInput(Number.NaN)).toBe(false);
      expect(isValidWaterInput(Number.POSITIVE_INFINITY)).toBe(false);
      expect(isValidWaterInput('250' as unknown)).toBe(false);
      expect(isValidWaterInput(null as unknown)).toBe(false);
      expect(isValidWaterInput(undefined as unknown)).toBe(false);
    });
  });

  describe('parseMacroFormInputs', () => {
    it('converte strings válidas corretamente', () => {
      const result = parseMacroFormInputs('450', '35', '50', '12');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.values).toEqual({
          calories: 450,
          protein: 35,
          carbs: 50,
          fat: 12,
        });
      }
    });

    it('rejeita campos vazios ou somente com espaços sem convertê-los erroneamente para 0', () => {
      expect(parseMacroFormInputs('', '35', '50', '12').valid).toBe(false);
      expect(parseMacroFormInputs('450', '  ', '50', '12').valid).toBe(false);
      expect(parseMacroFormInputs('450', '35', '', '12').valid).toBe(false);
      expect(parseMacroFormInputs('450', '35', '50', '   ').valid).toBe(false);
    });

    it('rejeita strings fora dos limites', () => {
      expect(parseMacroFormInputs('0', '35', '50', '12').valid).toBe(false);
      expect(parseMacroFormInputs('15000', '35', '50', '12').valid).toBe(false);
      expect(parseMacroFormInputs('450', '-1', '50', '12').valid).toBe(false);
      expect(parseMacroFormInputs('450', '35', '1000', '12').valid).toBe(false);
    });

    it('rejeita strings não numéricas', () => {
      expect(parseMacroFormInputs('abc', '35', '50', '12').valid).toBe(false);
      expect(parseMacroFormInputs('450', 'protein', '50', '12').valid).toBe(false);
    });
  });

  describe('MACRO_LIMITS constants', () => {
    it('garante os limites canônicos NUT-001', () => {
      expect(MACRO_LIMITS.CALORIES.MIN).toBe(0);
      expect(MACRO_LIMITS.CALORIES.MAX).toBe(15000);
      expect(MACRO_LIMITS.MACROS.MIN).toBe(0);
      expect(MACRO_LIMITS.MACROS.MAX).toBe(1000);
    });
  });
});
