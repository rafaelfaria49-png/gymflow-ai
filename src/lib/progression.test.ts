import { describe, it, expect } from 'vitest';
import { suggestNext, lastRecordedWeight, roundToHalfKg, ExerciseSessionHistory } from './progression';
import { ExerciseSlot } from '../types';

const slot = (overrides: Partial<ExerciseSlot> = {}): ExerciseSlot => ({
  exerciseId: 'chest_supino_reto',
  series: 4,
  repRange: [8, 10],
  targetRPE: 8,
  restSec: 120,
  progression: 'dupla',
  incrementKg: 2.5,
  ...overrides
});

const session = (
  sets: { reps?: number; weight?: number; completed?: boolean; rpe?: number }[],
  date = '2026-07-01'
): ExerciseSessionHistory => ({ date, sets });

// Sessão completa uniforme: n séries de reps × weight com rpe
const uniform = (reps: number, weight: number | undefined, rpe: number | undefined, count = 4, date?: string) =>
  session(Array.from({ length: count }, () => ({ reps, weight, completed: true, rpe })), date);

describe('suggestNext — histórico vazio', () => {
  it('sem histórico: pesoKg null, repsAlvo = piso da faixa, motivo honesto', () => {
    const s = suggestNext(slot(), []);
    expect(s.pesoKg).toBeNull();
    expect(s.repsAlvo).toBe(8);
    expect(s.motivo).toMatch(/sem histórico/i);
  });

  it('sessões só com séries não concluídas contam como sem histórico', () => {
    const s = suggestNext(slot(), [session([{ reps: 10, weight: 40, completed: false }])]);
    expect(s.pesoKg).toBeNull();
    expect(s.repsAlvo).toBe(8);
    expect(s.motivo).toMatch(/sem histórico/i);
  });
});

describe('suggestNext — progressão de peso', () => {
  it('topo da faixa em todas as séries com RPE ≤ alvo: sobe incrementKg e volta ao piso', () => {
    const s = suggestNext(slot(), [uniform(10, 40, 8)]);
    expect(s.pesoKg).toBe(42.5);
    expect(s.repsAlvo).toBe(8);
    expect(s.motivo).toMatch(/subir/i);
  });

  it('RPE alto não progride peso mesmo no topo da faixa', () => {
    const s = suggestNext(slot(), [uniform(10, 40, 9.5)]);
    expect(s.pesoKg).toBe(40);
    expect(s.repsAlvo).toBe(10);
    expect(s.motivo).toMatch(/rpe/i);
  });

  it('uma série abaixo do topo impede a subida de carga (progressão dupla)', () => {
    const hist = [session([
      { reps: 10, weight: 40, completed: true, rpe: 8 },
      { reps: 9, weight: 40, completed: true, rpe: 8 }
    ])];
    const s = suggestNext(slot(), hist);
    expect(s.pesoKg).toBe(40);
    expect(s.repsAlvo).toBe(10); // 9 + 1, dentro do teto
  });
});

describe('suggestNext — deload', () => {
  it('abaixo do piso em 2 sessões consecutivas: deload de 10% arredondado a 0.5kg', () => {
    const hist = [uniform(6, 42, 9, 4, '2026-07-01'), uniform(7, 42, 9, 4, '2026-06-28')];
    const s = suggestNext(slot(), hist);
    expect(s.pesoKg).toBe(38); // 42 * 0.9 = 37.8 → 38
    expect(s.repsAlvo).toBe(8);
    expect(s.motivo).toMatch(/deload/i);
  });

  it('uma única sessão ruim ainda não gera deload', () => {
    const hist = [uniform(6, 42, 9, 4, '2026-07-01'), uniform(9, 42, 8, 4, '2026-06-28')];
    const s = suggestNext(slot(), hist);
    expect(s.motivo).not.toMatch(/deload/i);
    expect(s.pesoKg).toBe(42); // mantém carga
    expect(s.repsAlvo).toBe(7); // 6 + 1
  });
});

describe('suggestNext — aumento de reps', () => {
  it('meio da faixa: mantém peso e sugere +1 rep', () => {
    const s = suggestNext(slot(), [uniform(8, 40, 8)]);
    expect(s.pesoKg).toBe(40);
    expect(s.repsAlvo).toBe(9);
  });

  it('+1 rep nunca ultrapassa o teto do repRange', () => {
    const hist = [session([
      { reps: 10, weight: 40, completed: true, rpe: 9 },
      { reps: 10, weight: 40, completed: true, rpe: 9 }
    ])];
    const s = suggestNext(slot(), hist);
    expect(s.repsAlvo).toBeLessThanOrEqual(10);
  });
});

describe('suggestNext — dados ausentes', () => {
  it('RPE ausente não crasha e permite progressão de carga no topo da faixa', () => {
    const s = suggestNext(slot(), [uniform(10, 40, undefined)]);
    expect(s.pesoKg).toBe(42.5);
    expect(s.repsAlvo).toBe(8);
    expect(s.motivo).toMatch(/sem rpe/i);
  });

  it('peso ausente não crasha: sugere sem carga e pede registro', () => {
    const s = suggestNext(slot(), [uniform(10, undefined, 8)]);
    expect(s.pesoKg).toBeNull();
    expect(s.repsAlvo).not.toBeNull();
    expect(typeof s.motivo).toBe('string');
  });

  it('histórico malformado (sets ausentes) não crasha', () => {
    const bad = [{ date: 'x' } as unknown as ExerciseSessionHistory, null as unknown as ExerciseSessionHistory];
    const s = suggestNext(slot(), bad);
    expect(s.pesoKg).toBeNull();
    expect(s.repsAlvo).toBe(8);
  });
});

describe('suggestNext — progression "nenhuma"', () => {
  it('retorna sugestão neutra mesmo com histórico forte', () => {
    const s = suggestNext(slot({ progression: 'nenhuma' }), [uniform(10, 40, 7)]);
    expect(s.pesoKg).toBeNull();
    expect(s.repsAlvo).toBe(8);
    expect(s.motivo).toMatch(/desativada/i);
  });
});

describe('arredondamento e helpers', () => {
  it('incremento não múltiplo arredonda para 0.5kg', () => {
    const s = suggestNext(slot({ incrementKg: 1.2 }), [uniform(10, 40, 8)]);
    expect(s.pesoKg).toBe(41); // 41.2 → 41.0
    expect((s.pesoKg as number) % 0.5).toBe(0);
  });

  it('roundToHalfKg e lastRecordedWeight', () => {
    expect(roundToHalfKg(37.8)).toBe(38);
    expect(roundToHalfKg(41.24)).toBe(41);
    expect(roundToHalfKg(41.25)).toBe(41.5);
    expect(lastRecordedWeight([uniform(8, 62.5, 8), uniform(8, 60, 8)])).toBe(62.5);
    expect(lastRecordedWeight([])).toBeNull();
    expect(lastRecordedWeight([session([{ reps: 8, completed: true }])])).toBeNull();
  });
});
