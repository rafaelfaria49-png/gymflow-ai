import { describe, expect, it } from 'vitest';
import type { ExerciseSlot } from '../types';
import {
  DEFAULT_PROGRESSION_PROFILE_RULES,
  DEFAULT_RETURN_RAMP_FACTORS,
  getProgressionProfileRules,
  getProgressionReasonText,
  lastRecordedWeight,
  progressionEngine,
  recordProgressionOverride,
  roundToHalfKg,
  suggestNextV2,
  type ExerciseSessionHistory,
  type ProgressionDecision,
  type ProgressionReasonCode,
} from './progressionEngine';

const slot = (overrides: Partial<ExerciseSlot> = {}): ExerciseSlot => ({
  exerciseId: 'chest_supino_reto',
  series: 4,
  repRange: [8, 10],
  targetRPE: 8,
  restSec: 120,
  progression: 'dupla',
  incrementKg: 2.5,
  ...overrides,
});

const session = (sets: ProgressionSet[], date = '2026-09-01'): ExerciseSessionHistory => ({ date, sets });
type ProgressionSet = { reps?: number; weight?: number; completed?: boolean; isWarmup?: boolean; rir?: number; rpe?: number };

const uniform = (reps: number, weight: number | undefined, effort: Partial<ProgressionSet> = {}, count = 4, date?: string) =>
  session(Array.from({ length: count }, () => ({ reps, weight, completed: true, ...effort })), date);

describe('progressionEngine — Golden Parity com motor legado (15 cenários)', () => {
  it('1. sem histórico: pesoKg null, repsAlvo = piso da faixa, reasonText honesto', () => {
    const d = progressionEngine({ slot: slot(), history: [], mode: 'legacy' });
    expect(d.pesoKg).toBeNull();
    expect(d.repsAlvo).toBe(8);
    expect(d.reasonCode).toBe('no-history');
    expect(d.reasonText).toMatch(/sem histórico/i);
    expect(d.motivo).toBe(d.reasonText);
  });

  it('2. sessões só com séries não concluídas contam como sem histórico', () => {
    const d = progressionEngine({
      slot: slot(),
      history: [session([{ reps: 10, weight: 40, completed: false }])],
      mode: 'legacy',
    });
    expect(d.pesoKg).toBeNull();
    expect(d.repsAlvo).toBe(8);
    expect(d.reasonCode).toBe('no-history');
    expect(d.reasonText).toMatch(/sem histórico/i);
  });

  it('3. topo da faixa em todas as séries com RPE ≤ alvo: sobe incrementKg e volta ao piso', () => {
    const d = progressionEngine({ slot: slot(), history: [uniform(10, 40, { rpe: 8 })], mode: 'legacy' });
    expect(d.pesoKg).toBe(42.5);
    expect(d.repsAlvo).toBe(8);
    expect(d.reasonCode).toBe('progress-weight');
    expect(d.reasonText).toMatch(/subir/i);
  });

  it('4. RPE alto não progride peso mesmo no topo da faixa', () => {
    const d = progressionEngine({ slot: slot(), history: [uniform(10, 40, { rpe: 9.5 })], mode: 'legacy' });
    expect(d.pesoKg).toBe(40);
    expect(d.repsAlvo).toBe(10);
    expect(d.reasonCode).toBe('hold-weight-high-effort');
    expect(d.reasonText).toMatch(/rpe/i);
  });

  it('5. uma série abaixo do topo impede a subida de carga (dupla progressão)', () => {
    const hist = [session([
      { reps: 10, weight: 40, completed: true, rpe: 8 },
      { reps: 9, weight: 40, completed: true, rpe: 8 },
    ])];
    const d = progressionEngine({ slot: slot(), history: hist, mode: 'legacy' });
    expect(d.pesoKg).toBe(40);
    expect(d.repsAlvo).toBe(10);
    expect(d.reasonCode).toBe('hold-weight-progress-reps');
  });

  it('6. abaixo do piso em 2 sessões consecutivas: deload de 10% arredondado a 0.5kg', () => {
    const hist = [
      uniform(6, 42, { rpe: 9 }, 4, '2026-07-01'),
      uniform(7, 42, { rpe: 9 }, 4, '2026-06-28'),
    ];
    const d = progressionEngine({ slot: slot(), history: hist, mode: 'legacy' });
    expect(d.pesoKg).toBe(38); // 42 * 0.9 = 37.8 -> 38
    expect(d.repsAlvo).toBe(8);
    expect(d.reasonCode).toBe('deload-after-two-failures');
    expect(d.reasonText).toMatch(/deload/i);
  });

  it('7. uma única sessão ruim ainda não gera deload', () => {
    const hist = [
      uniform(6, 42, { rpe: 9 }, 4, '2026-07-01'),
      uniform(9, 42, { rpe: 8 }, 4, '2026-06-28'),
    ];
    const d = progressionEngine({ slot: slot(), history: hist, mode: 'legacy' });
    expect(d.pesoKg).toBe(42);
    expect(d.repsAlvo).toBe(7);
    expect(d.reasonCode).toBe('hold-weight-progress-reps');
    expect(d.reasonText).not.toMatch(/deload/i);
  });

  it('8. meio da faixa: mantém peso e sugere +1 rep', () => {
    const d = progressionEngine({ slot: slot(), history: [uniform(8, 40, { rpe: 8 })], mode: 'legacy' });
    expect(d.pesoKg).toBe(40);
    expect(d.repsAlvo).toBe(9);
    expect(d.reasonCode).toBe('hold-weight-progress-reps');
  });

  it('9. +1 rep nunca ultrapassa o teto do repRange', () => {
    const hist = [session([
      { reps: 10, weight: 40, completed: true, rpe: 9 },
      { reps: 10, weight: 40, completed: true, rpe: 9 },
    ])];
    const d = progressionEngine({ slot: slot(), history: hist, mode: 'legacy' });
    expect(d.repsAlvo).toBeLessThanOrEqual(10);
  });

  it('10. RPE ausente não crasha e permite progressão de carga no topo da faixa', () => {
    const d = progressionEngine({ slot: slot(), history: [uniform(10, 40, {})], mode: 'legacy' });
    expect(d.pesoKg).toBe(42.5);
    expect(d.repsAlvo).toBe(8);
    expect(d.reasonCode).toBe('progress-weight');
    expect(d.reasonText).toMatch(/sem rpe registrado/i);
  });

  it('11. peso ausente não crasha: sugere sem carga e pede registro', () => {
    const d = progressionEngine({ slot: slot(), history: [uniform(10, undefined, { rpe: 8 })], mode: 'legacy' });
    expect(d.pesoKg).toBeNull();
    expect(d.repsAlvo).toBe(10);
    expect(d.reasonCode).toBe('missing-weight');
    expect(d.reasonText).toBeTruthy();
  });

  it('12. histórico malformado (sets ausentes) não crasha', () => {
    const bad = [{ date: 'x' } as unknown as ExerciseSessionHistory, null as unknown as ExerciseSessionHistory];
    const d = progressionEngine({ slot: slot(), history: bad, mode: 'legacy' });
    expect(d.pesoKg).toBeNull();
    expect(d.repsAlvo).toBe(8);
    expect(d.reasonCode).toBe('no-history');
  });

  it('13. progression "nenhuma" retorna sugestão neutra mesmo com histórico forte', () => {
    const d = progressionEngine({ slot: slot({ progression: 'nenhuma' }), history: [uniform(10, 40, { rpe: 7 })], mode: 'legacy' });
    expect(d.pesoKg).toBeNull();
    expect(d.repsAlvo).toBe(8);
    expect(d.reasonCode).toBe('progression-disabled');
    expect(d.reasonText).toMatch(/desativada/i);
  });

  it('14. incremento não múltiplo arredonda para 0.5kg', () => {
    const d = progressionEngine({ slot: slot({ incrementKg: 1.2 }), history: [uniform(10, 40, { rpe: 8 })], mode: 'legacy' });
    expect(d.pesoKg).toBe(41); // 41.2 -> 41.0
    expect((d.pesoKg as number) % 0.5).toBe(0);
  });

  it('15. helpers roundToHalfKg e lastRecordedWeight', () => {
    expect(roundToHalfKg(37.8)).toBe(38);
    expect(roundToHalfKg(41.24)).toBe(41);
    expect(roundToHalfKg(41.25)).toBe(41.5);
    expect(lastRecordedWeight([uniform(8, 62.5, { rpe: 8 }), uniform(8, 60, { rpe: 8 })])).toBe(62.5);
    expect(lastRecordedWeight([])).toBeNull();
    expect(lastRecordedWeight([session([{ reps: 8, completed: true }])])).toBeNull();
  });
});

describe('progressionEngine PROG §9 — Dupla Progressão com RIR e RPE', () => {
  it('sobe carga quando todas as séries batem o teto com RIR suficiente (≥ 2)', () => {
    const d = suggestNextV2(slot(), [uniform(10, 50, { rir: 2 })]);
    expect(d.pesoKg).toBe(52.5);
    expect(d.repsAlvo).toBe(8);
    expect(d.action).toBe('progress');
    expect(d.effortSource).toBe('rir');
    expect(d.changed).toBe(true);
    expect(d.reasonCode).toBe('progress-weight');
    expect(d.reasonText).toContain('RIR 2 ≥ 2');
  });

  it('segura a carga quando RIR é baixo (< 2), mesmo no topo da faixa', () => {
    const d = suggestNextV2(slot(), [uniform(10, 50, { rir: 1 })]);
    expect(d.pesoKg).toBe(50);
    expect(d.repsAlvo).toBe(10);
    expect(d.action).toBe('hold');
    expect(d.effortSource).toBe('rir');
    expect(d.changed).toBe(false);
    expect(d.reasonCode).toBe('hold-weight-high-effort');
    expect(d.reasonText).toContain('acima do alvo');
  });

  it('recorre ao RPE quando RIR não foi informado', () => {
    const ok = suggestNextV2(slot(), [uniform(10, 50, { rpe: 7.5 })]);
    expect(ok.pesoKg).toBe(52.5);
    expect(ok.effortSource).toBe('rpe');

    const high = suggestNextV2(slot(), [uniform(10, 50, { rpe: 9 })]);
    expect(high.pesoKg).toBe(50);
    expect(high.effortSource).toBe('rpe');
    expect(high.reasonCode).toBe('hold-weight-high-effort');
  });

  it('ignora séries de aquecimento na avaliação de esforço e reps', () => {
    const hist = [session([
      { reps: 15, weight: 20, isWarmup: true, completed: true, rir: 5 },
      { reps: 10, weight: 50, isWarmup: false, completed: true, rir: 2 },
      { reps: 10, weight: 50, isWarmup: false, completed: true, rir: 2 },
      { reps: 10, weight: 50, isWarmup: false, completed: true, rir: 2 },
      { reps: 10, weight: 50, isWarmup: false, completed: true, rir: 2 },
    ])];
    const d = suggestNextV2(slot(), hist);
    expect(d.pesoKg).toBe(52.5);
  });
});

describe('progressionEngine PROG §9 — Redução Técnica e Platô', () => {
  it('reduz 10% da carga após 2 sessões consecutivas abaixo do piso de reps', () => {
    const hist = [
      uniform(6, 60, { rir: 0 }, 4, '2026-08-05'),
      uniform(7, 60, { rir: 1 }, 4, '2026-08-01'),
    ];
    const d = suggestNextV2(slot(), hist);
    expect(d.pesoKg).toBe(54); // 60 * 0.9 = 54
    expect(d.repsAlvo).toBe(8);
    expect(d.action).toBe('reduce');
    expect(d.reasonCode).toBe('deload-after-two-failures');
    expect(d.reasonText).toContain('Duas sessões abaixo de 8 reps');
  });

  it('não reduz com apenas 1 sessão ruim', () => {
    const hist = [
      uniform(6, 60, { rir: 0 }, 4, '2026-08-05'),
      uniform(10, 60, { rir: 2 }, 4, '2026-08-01'),
    ];
    const d = suggestNextV2(slot(), hist);
    expect(d.pesoKg).toBe(60);
    expect(d.repsAlvo).toBe(7);
    expect(d.reasonCode).toBe('hold-weight-progress-reps');
  });

  const plateauSessions = (count: number, weight = 50) =>
    Array.from({ length: count }, (_, i) =>
      uniform(10, weight, { rir: 0 }, 4, `2026-08-${String(20 - i).padStart(2, '0')}`),
    );

  it('aplica o estágio 1 de platô (variação recomendada) após 3 sessões estagnadas no topo', () => {
    const d = suggestNextV2(slot(), plateauSessions(3));
    expect(d.reasonCode).toBe('plateau-variation');
    expect(d.action).toBe('variation');
    expect(d.plateauAction).toBe('variation');
    expect(d.pesoKg).toBe(50);
    expect(d.reasonText).toContain('Platô identificado por 3 sessões');
  });

  it('aplica o estágio 2 de platô (back-off −10%) na 4ª sessão estagnada', () => {
    const d = suggestNextV2(slot(), plateauSessions(4));
    expect(d.reasonCode).toBe('plateau-back-off');
    expect(d.action).toBe('back-off');
    expect(d.plateauAction).toBe('back-off');
    expect(d.pesoKg).toBe(45); // 50 * 0.9 = 45
    expect(d.repsAlvo).toBe(10);
    expect(d.reasonText).toContain('back-off de 10%');
  });

  it('aplica o estágio 3 de platô (deload −15%) na 5ª sessão estagnada', () => {
    const d = suggestNextV2(slot(), plateauSessions(5));
    expect(d.reasonCode).toBe('plateau-deload');
    expect(d.action).toBe('deload');
    expect(d.plateauAction).toBe('deload');
    expect(d.pesoKg).toBe(42.5); // 50 * 0.85 = 42.5
    expect(d.repsAlvo).toBe(8);
    expect(d.reasonText).toContain('deload de 15%');
  });
});

describe('progressionEngine PROG §9 — Rampa de Retorno Integrada ao Perfil', () => {
  it.each([
    ['less_than_1_month', 0, 0.85, 85],
    ['less_than_1_month', 1, 0.95, 95],
    ['one_to_three_months', 0, 0.75, 75],
    ['three_to_six_months', 0, 0.65, 65],
    ['six_to_twelve_months', 0, 0.55, 55],
    ['more_than_1_year', 0, 0.50, 50],
  ] as const)('aplica fator correto para %s na sessão %s (%s)', (duration, sessionIndex, factor, expectedPercent) => {
    const d = progressionEngine({
      slot: slot(),
      history: [uniform(10, 100)],
      profile: {
        trainingStatus: 'returning',
        returnToTraining: { breakDuration: duration },
      },
      sessionsSinceReturn: sessionIndex,
      mode: 'v2',
    });
    expect(d.action).toBe('return-ramp');
    expect(d.reasonCode).toBe('return-ramp');
    expect(d.returnRampFactor).toBeCloseTo(factor, 2);
    expect(d.pesoKg).toBe(Math.round(100 * factor * 2) / 2);
    expect(d.reasonText).toContain(`usar ${expectedPercent}% da última carga`);
  });

  it('retoma progressão normal quando as sessões de retorno atingem 100% (fator 1.0)', () => {
    const d = progressionEngine({
      slot: slot(),
      history: [uniform(10, 100, { rir: 2 })],
      profile: {
        trainingStatus: 'returning',
        returnToTraining: { breakDuration: 'less_than_1_month' },
      },
      sessionsSinceReturn: 2, // [0.85, 0.95, 1] -> índice 2 é 1.0
      mode: 'v2',
    });
    expect(d.action).toBe('progress');
    expect(d.reasonCode).toBe('progress-weight');
    expect(d.pesoKg).toBe(102.5);
  });

  it('informa return-ramp-no-weight quando não há carga anterior registrada para aplicar o percentual', () => {
    const d = progressionEngine({
      slot: slot(),
      history: [uniform(10, undefined)],
      profile: {
        trainingStatus: 'returning',
        returnToTraining: { breakDuration: 'one_to_three_months' },
      },
      sessionsSinceReturn: 0,
      mode: 'v2',
    });
    expect(d.pesoKg).toBeNull();
    expect(d.reasonCode).toBe('return-ramp-no-weight');
    expect(d.action).toBe('return-ramp');
  });
});

describe('progressionEngine PROG §9 — Progressão por Séries (Avançado/Atleta)', () => {
  it('calcula decisões independentes por série para perfil avançado', () => {
    const hist = [session([
      { reps: 10, weight: 80, completed: true, rir: 2 },
      { reps: 9, weight: 80, completed: true, rir: 1 },
      { reps: 8, weight: 80, completed: true, rir: 2 },
    ])];
    const d = progressionEngine({
      slot: slot({ repRange: [8, 10], incrementKg: 2.5 }),
      history: hist,
      profile: { level: 'advanced' },
      mode: 'v2',
    });

    expect(d.series).toBeDefined();
    expect(d.series).toHaveLength(3);

    // Série 1 completou o topo com margem -> progride
    expect(d.series![0]).toMatchObject({
      setIndex: 0,
      pesoKg: 82.5,
      repsAlvo: 8,
      reasonCode: 'series-progress',
      changed: true,
    });

    // Série 2 não completou o topo -> segura carga e avança reps
    expect(d.series![1]).toMatchObject({
      setIndex: 1,
      pesoKg: 80,
      repsAlvo: 10,
      reasonCode: 'series-hold',
      changed: false,
    });
  });

  it('não ativa progressão por séries para perfil iniciante ou intermediário', () => {
    const hist = [session([
      { reps: 10, weight: 80, completed: true, rir: 2 },
      { reps: 8, weight: 80, completed: true, rir: 1 },
    ])];
    const dInter = progressionEngine({
      slot: slot(),
      history: hist,
      profile: { level: 'intermediate' },
      mode: 'v2',
    });
    expect(dInter.series).toBeUndefined();
  });
});

describe('progressionEngine PROG §9 — Override Tracking e Ajuste de Parâmetro', () => {
  it('registra overrides e ajusta parâmetro para cima após 3 overrides consistentes', () => {
    const override1 = {
      exerciseId: 'chest_supino_reto',
      suggestedWeightKg: 40,
      actualWeightKg: 45,
    };
    const res1 = recordProgressionOverride([], override1, { incrementKg: 2.5 });
    expect(res1.overrides).toHaveLength(1);
    expect(res1.adjustment).toBeNull();

    const res2 = recordProgressionOverride(res1.overrides, override1, { incrementKg: 2.5 });
    expect(res2.overrides).toHaveLength(2);
    expect(res2.adjustment).toBeNull();

    const res3 = recordProgressionOverride(res2.overrides, override1, { incrementKg: 2.5 });
    expect(res3.overrides).toHaveLength(3);
    expect(res3.adjustment).toMatchObject({
      exerciseId: 'chest_supino_reto',
      parameter: 'incrementKg',
      previousValueKg: 2.5,
      nextValueKg: 5,
      direction: 'up',
      repeatedCount: 3,
    });
    expect(res3.adjustment?.reasonText).toContain('Três overrides para cima');
  });

  it('registra overrides e reduz o incremento após 3 overrides consistentes para baixo', () => {
    const overrideDown = {
      exerciseId: 'chest_supino_reto',
      suggestedWeightKg: 45,
      actualWeightKg: 40,
    };
    let state = recordProgressionOverride([], overrideDown, { incrementKg: 2.5 });
    state = recordProgressionOverride(state.overrides, overrideDown, { incrementKg: 2.5 });
    state = recordProgressionOverride(state.overrides, overrideDown, { incrementKg: 2.5 });

    expect(state.adjustment).toMatchObject({
      parameter: 'incrementKg',
      previousValueKg: 2.5,
      nextValueKg: 2.0, // 2.5 - 0.5
      direction: 'down',
      repeatedCount: 3,
    });
    expect(state.adjustment?.reasonText).toContain('Três overrides para baixo');
  });

  it('não dispara ajuste se os deltas ou direções divergirem', () => {
    let state = recordProgressionOverride([], {
      exerciseId: 'chest_supino_reto',
      suggestedWeightKg: 40,
      actualWeightKg: 42.5,
    });
    state = recordProgressionOverride(state.overrides, {
      exerciseId: 'chest_supino_reto',
      suggestedWeightKg: 40,
      actualWeightKg: 45,
    });
    state = recordProgressionOverride(state.overrides, {
      exerciseId: 'chest_supino_reto',
      suggestedWeightKg: 40,
      actualWeightKg: 47.5,
    });
    expect(state.adjustment).toBeNull();
  });
});

describe('progressionEngine PROG §9 — Reasons e i18n (pt-BR e en-US)', () => {
  const reasonCodes: ProgressionReasonCode[] = [
    'progression-disabled',
    'no-history',
    'return-ramp',
    'return-ramp-no-weight',
    'deload-after-two-failures',
    'progress-weight',
    'hold-weight-high-effort',
    'hold-weight-progress-reps',
    'missing-weight',
    'plateau-variation',
    'plateau-back-off',
    'plateau-deload',
    'series-progress',
    'series-hold',
  ];

  it('formata texto em pt-BR para todos os 14 reason codes', () => {
    for (const code of reasonCodes) {
      const text = getProgressionReasonText(
        code,
        { min: 8, max: 10, increment: 2.5, percent: 10, reps: 9, sessions: 3, set: 1, effort: '', effortLabel: 'RIR', ceiling: '' },
        'pt-BR',
      );
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(5);
      expect(text).not.toContain('{');
    }
  });

  it('formata texto em en-US para todos os 14 reason codes', () => {
    for (const code of reasonCodes) {
      const text = getProgressionReasonText(
        code,
        { min: 8, max: 10, increment: 2.5, percent: 10, reps: 9, sessions: 3, set: 1, effort: '', effortLabel: 'RIR', ceiling: '' },
        'en-US',
      );
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(5);
      expect(text).not.toContain('{');
    }
  });

  it('o motor gera reasonText em en-US quando requisitado pelo locale', () => {
    const d = progressionEngine({
      slot: slot(),
      history: [uniform(10, 40, { rir: 2 })],
      locale: 'en-US',
    });
    expect(d.reasonText).toContain('Range completed');
  });
});

describe('progressionEngine — Pureza Funcional e Contrato de Aceite', () => {
  it('garante que 100% das decisões possuem reasonText preenchido e não vazio', () => {
    const inputs = [
      { slot: slot(), history: [] },
      { slot: slot({ progression: 'nenhuma' }), history: [uniform(10, 40)] },
      { slot: slot(), history: [uniform(6, 40), uniform(6, 40)] },
      { slot: slot(), history: [uniform(10, 40, { rir: 2 })] },
      { slot: slot(), history: [uniform(10, 40, { rir: 0 })] },
      { slot: slot(), history: [uniform(8, 40)] },
      { slot: slot(), history: [uniform(10, undefined)] },
    ];
    for (const input of inputs) {
      const decision = progressionEngine(input);
      expect(typeof decision.reasonText).toBe('string');
      expect(decision.reasonText.trim().length).toBeGreaterThan(0);
      expect(decision.reasonCode).toBeTruthy();
      expect(decision.action).toBeTruthy();
    }
  });

  it('é 100% determinístico e não altera os argumentos de entrada', () => {
    const inputSlot = slot();
    const inputHistory = [uniform(10, 40, { rir: 2 })];
    const slotCopy = JSON.stringify(inputSlot);
    const historyCopy = JSON.stringify(inputHistory);

    const out1 = progressionEngine({ slot: inputSlot, history: inputHistory });
    const out2 = progressionEngine({ slot: inputSlot, history: inputHistory });

    expect(out1).toEqual(out2);
    expect(JSON.stringify(inputSlot)).toBe(slotCopy);
    expect(JSON.stringify(inputHistory)).toBe(historyCopy);
  });
});
