import { describe, expect, it } from 'vitest';
import {
  calculatePlateLoad,
  DEFAULT_AVAILABLE_PLATE_PAIRS_KG,
  DEFAULT_BAR_WEIGHT_KG,
  getPlateCalculatorConfig,
} from './plateCalculator';

describe('plateCalculator — carga total e montagem por lado', () => {
  it('monta 67,5 kg com os pares padrão', () => {
    const result = calculatePlateLoad(67.5);

    expect(result.barWeightKg).toBe(DEFAULT_BAR_WEIGHT_KG);
    expect(result.loadedWeightKg).toBe(67.5);
    expect(result.sideWeightKg).toBe(23.75);
    expect(result.platesPerSideKg).toEqual([20, 2.5, 1.25]);
    expect(result.exact).toBe(true);
  });

  it('usa a configuração do GymProfile e arredonda para a carga alcançável mais próxima', () => {
    const config = getPlateCalculatorConfig({
      plateCalculator: { barWeightKg: 15, availablePairsKg: [1.25, 2.5, 5, 10] },
    });
    const result = calculatePlateLoad(43, config);

    expect(config.barWeightKg).toBe(15);
    expect(result.loadedWeightKg).toBe(42.5);
    expect(result.platesPerSideKg).toEqual([10, 2.5, 1.25]);
    expect(result.differenceKg).toBe(-0.5);
  });

  it('cai para a barra vazia quando não há pares válidos', () => {
    const result = calculatePlateLoad(60, { availablePairsKg: [] });

    expect(result.loadedWeightKg).toBe(DEFAULT_BAR_WEIGHT_KG);
    expect(result.platesPerSideKg).toEqual([]);
    expect(result.availablePairsKg).toEqual([]);
  });

  it('expõe os pares padrão quando o perfil não configurou a calculadora', () => {
    expect(getPlateCalculatorConfig(null).availablePairsKg).toEqual([...DEFAULT_AVAILABLE_PLATE_PAIRS_KG].reverse());
  });
});
