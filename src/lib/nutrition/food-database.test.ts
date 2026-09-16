/**
 * GymFlow AI — Testes do FoodDatabase V1 (NUT-005 / GOAL-106)
 *
 * Cobre: validação integral do dataset CANONICAL_BR, busca local
 * (acentos, case, prefixo, substring, brand, ordem determinística,
 * performance), contrato USDA_FDC offline, USER_CONFIRMED com trava de 15%,
 * porções/escala e ponte para o ledger (sem escrita automática).
 */

import { describe, expect, it } from 'vitest';
import rawCatalog from '../../data/canonical-br-foods.json';
import {
  CANONICAL_BR_CATALOG,
  FoodDatabase,
  loadFoodCatalog,
  normalizeFoodSearchText,
  scaleFoodReferenceToGrams,
  searchFoods,
  toFoodEntryInput,
} from './food-database';
import {
  confirmUserFoodDraft,
  energyDivergenceRelative,
  exceedsEnergyTolerance,
  foodReferenceFromUsdaFdc,
  FoodDatabaseError,
  isFoodReference,
  theoreticalKcalForMacros,
  USER_FOOD_ENERGY_TOLERANCE_RELATIVE,
  validateUserFoodInput,
  type FoodReference,
} from './food-types';

// ============================================================================
// FIXTURES
// ============================================================================

function makeFood(overrides: Partial<FoodReference> = {}): FoodReference {
  return {
    id: 'fixture-food',
    source: 'USER_CONFIRMED',
    sourceId: 'USER_CONFIRMED:fixture-food',
    name: 'Alimento Fixture',
    servingReferenceGrams: 100,
    servingDescription: '100g',
    per100g: { calories: 100, protein: 10, carbs: 10, fat: 2 },
    provenanceVersion: 'user-confirmed-v1',
    verified: true,
    sourceRef: 'USER_CONFIRMED — fixture de teste',
    ...overrides,
  };
}

function energyOf(food: FoodReference): { theoretical: number; divergence: number } {
  const p = food.per100g;
  const theoretical = theoreticalKcalForMacros(p.protein, p.carbs, p.fat);
  const divergence = energyDivergenceRelative(p.calories, p.protein, p.carbs, p.fat) as number;
  return { theoretical, divergence };
}

// ============================================================================
// 13. TESTES DO DATASET
// ============================================================================

describe('NUT-005 dataset CANONICAL_BR', () => {
  it('possui entre 150 e ~200 alimentos', () => {
    expect(CANONICAL_BR_CATALOG.length).toBeGreaterThanOrEqual(150);
    expect(CANONICAL_BR_CATALOG.length).toBeLessThanOrEqual(200);
    expect((rawCatalog as unknown[]).length).toBe(CANONICAL_BR_CATALOG.length);
  });

  it('todo registro é um FoodReference estruturalmente completo', () => {
    for (const food of CANONICAL_BR_CATALOG) {
      expect(isFoodReference(food)).toBe(true);
      expect(food.source).toBe('CANONICAL_BR');
      expect(food.id.trim().length).toBeGreaterThan(0);
      expect(food.name.trim().length).toBeGreaterThan(0);
      expect(food.sourceId.trim().length).toBeGreaterThan(0);
      expect(food.sourceRef.trim().length).toBeGreaterThan(0);
      expect(food.provenanceVersion.trim().length).toBeGreaterThan(0);
      expect(food.servingReferenceGrams).toBeGreaterThan(0);
      expect(food.servingDescription.trim().length).toBeGreaterThan(0);
    }
  });

  it('nenhum registro oficial sem provenance verificável (UNVERIFIED = 0)', () => {
    const unverified = CANONICAL_BR_CATALOG.filter((food) => food.verified !== true);
    expect(unverified).toEqual([]);
  });

  it('IDs únicos e nomes normalizados únicos (DUPLICATE_IDS = 0)', () => {
    const ids = CANONICAL_BR_CATALOG.map((food) => food.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = CANONICAL_BR_CATALOG.map((food) => normalizeFoodSearchText(food.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it('porções e macros finitos, não negativos e calorias plausíveis', () => {
    for (const food of CANONICAL_BR_CATALOG) {
      const p = food.per100g;
      expect(Number.isFinite(food.servingReferenceGrams)).toBe(true);
      expect(food.servingReferenceGrams).toBeGreaterThan(0);
      for (const value of [p.calories, p.protein, p.carbs, p.fat]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      // Calorias plausíveis: > 0 e teto da gordura pura (900 kcal/100g).
      expect(p.calories).toBeGreaterThan(0);
      expect(p.calories).toBeLessThanOrEqual(900);
      for (const extra of [p.fiber, p.sodiumMg]) {
        if (extra !== undefined) {
          expect(Number.isFinite(extra)).toBe(true);
          expect(extra).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('consistência físico-química 4P+4C+9G ≈ kcal em 100% do catálogo', () => {
    const outliers: string[] = [];
    for (const food of CANONICAL_BR_CATALOG) {
      const { divergence } = energyOf(food);
      // Tolerância canônica de 15% com piso absoluto de 1.5 kcal para itens
      // de energia quase nula (café, chá), onde razão relativa é indefinida.
      const tolerance = Math.max(0.15 * food.per100g.calories, 1.5);
      const p = food.per100g;
      const absolute = Math.abs(p.calories - theoreticalKcalForMacros(p.protein, p.carbs, p.fat));
      if (absolute > tolerance) outliers.push(food.id);
      expect(divergence).not.toBeNull();
    }
    expect(outliers).toEqual([]);
  });

  it('cobre as categorias essenciais do dia a dia brasileiro', () => {
    const names = CANONICAL_BR_CATALOG.map((food) => normalizeFoodSearchText(food.name));
    const has = (term: string): boolean => names.some((name) => name.includes(term));
    for (
      const term of [
        'arroz',
        'feijao',
        'frango',
        'ovo',
        'leite',
        'queijo',
        'pao',
        'aveia',
        'mandioca',
        'batata',
        'macarrao',
        'tapioca',
        'azeite',
        'banana',
        'maca',
        'laranja',
        'alface',
        'couve',
        'cenoura',
        'tomate',
        'amendoim',
      ]
    ) {
      expect(has(term)).toBe(true);
    }
  });

  it('sem TBCA incorporada, sem Open Food Facts, sem barcode (V1.5)', () => {
    const dumped = JSON.stringify(rawCatalog).toLowerCase();
    expect(dumped).not.toContain('tbca');
    expect(dumped).not.toContain('open food facts');
    expect(dumped).not.toContain('openfoodfacts');
    expect(dumped).not.toContain('barcode');
    expect(dumped).not.toContain('gtin');
    expect(dumped).not.toContain('odbl');
    for (const food of CANONICAL_BR_CATALOG) {
      expect(food.source).toBe('CANONICAL_BR');
    }
  });

  it('catálogo é imutável (congelado)', () => {
    expect(Object.isFrozen(CANONICAL_BR_CATALOG)).toBe(true);
  });

  it('loadFoodCatalog rejeita catálogo malformado (fail-closed)', () => {
    expect(() => loadFoodCatalog('nao-um-array' as unknown)).toThrow(FoodDatabaseError);
    expect(() => loadFoodCatalog([{ id: 'x' }] as unknown)).toThrow(FoodDatabaseError);
    expect(() =>
      loadFoodCatalog([{ ...makeFood({ id: 'a', source: 'CANONICAL_BR' }), verified: false }] as unknown)
    ).toThrow(FoodDatabaseError);
    expect(() =>
      loadFoodCatalog([makeFood({ id: 'dup' }), makeFood({ id: 'dup' })] as unknown)
    ).toThrow(FoodDatabaseError);
  });
});

// ============================================================================
// 14. TESTES DE BUSCA
// ============================================================================

describe('NUT-005 busca local', () => {
  it('"arroz", "ARROZ" e "arróz" produzem resultado equivalente', () => {
    const db = new FoodDatabase(CANONICAL_BR_CATALOG);
    const lower = db.search('arroz').map((food) => food.id);
    const upper = db.search('ARROZ').map((food) => food.id);
    const accent = db.search('arróz').map((food) => food.id);
    expect(lower.length).toBeGreaterThan(0);
    expect(upper).toEqual(lower);
    expect(accent).toEqual(lower);
  });

  it('é accent-insensitive (açaí ↔ acai) e aplica trim', () => {
    const db = new FoodDatabase(CANONICAL_BR_CATALOG);
    const withAccent = db.search('açaí').map((food) => food.id);
    const withoutAccent = db.search('acai').map((food) => food.id);
    expect(withAccent.length).toBeGreaterThan(0);
    expect(withoutAccent).toEqual(withAccent);
    expect(db.search('  arroz  ').map((food) => food.id)).toEqual(db.search('arroz').map((food) => food.id));
  });

  it('prefere match exato/prefixo antes de parcial', () => {
    const db = new FoodDatabase(CANONICAL_BR_CATALOG);
    const results = db.search('arroz');
    expect(results.length).toBeGreaterThan(1);
    // Todos os prefixos ("arroz ...") vêm antes de qualquer parcial.
    const names = results.map((food) => normalizeFoodSearchText(food.name));
    const firstPartial = names.findIndex((name) => !name.startsWith('arroz'));
    const lastPrefix = names.reduce(
      (acc, name, index) => (name.startsWith('arroz') ? index : acc),
      -1,
    );
    expect(lastPrefix).toBeGreaterThanOrEqual(0);
    if (firstPartial !== -1) expect(lastPrefix).toBeLessThan(firstPartial);
  });

  it('match exato ranqueia primeiro', () => {
    const fixtures = [
      makeFood({ id: 'f-parcial', name: 'Bolo de arroz integral' }),
      makeFood({ id: 'f-exato', name: 'Arroz' }),
      makeFood({ id: 'f-prefixo', name: 'Arroz doce' }),
    ];
    const db = new FoodDatabase(fixtures);
    const ids = db.search('arroz').map((food) => food.id);
    expect(ids).toEqual(['f-exato', 'f-prefixo', 'f-parcial']);
  });

  it('substring encontra itens e termo inexistente retorna vazio', () => {
    const db = new FoodDatabase(CANONICAL_BR_CATALOG);
    const queijos = db.search('queijo');
    expect(queijos.length).toBeGreaterThan(3);
    for (const food of queijos) {
      const haystack = `${normalizeFoodSearchText(food.name)} ${food.brand ?? ''}`;
      expect(haystack.includes('queijo')).toBe(true);
    }
    expect(db.search('xyzzfruta-inexistente')).toEqual([]);
    expect(db.search('')).toEqual([]);
    expect(db.search('   ')).toEqual([]);
  });

  it('busca por brand quando existir, abaixo do match por nome', () => {
    const fixtures = [
      makeFood({ id: 'f-nome', name: 'Whey blend', brand: 'Marca Z' }),
      makeFood({ id: 'f-marca', name: 'Pasta de amendoim', brand: 'Whey Foods' }),
      makeFood({ id: 'f-outro', name: 'Aveia em flocos' }),
    ];
    const db = new FoodDatabase(fixtures);
    const ids = db.search('whey').map((food) => food.id);
    expect(ids).toEqual(['f-nome', 'f-marca']);
  });

  it('ordem determinística entre chamadas e empates alfabéticos', () => {
    const db = new FoodDatabase(CANONICAL_BR_CATALOG);
    const first = db.search('leite').map((food) => food.id);
    for (let i = 0; i < 10; i += 1) {
      expect(db.search('leite').map((food) => food.id)).toEqual(first);
    }
    const fixtures = [
      makeFood({ id: 'b-2', name: 'Banana' }),
      makeFood({ id: 'b-1', name: 'Banana' }),
    ];
    // Nomes normalizados iguais não passam no dataset, mas a classe ordena
    // por id como desempate final determinístico.
    const dbDup = new FoodDatabase([fixtures[0], fixtures[1]]);
    expect(dbDup.search('banana').map((food) => food.id)).toEqual(['b-1', 'b-2']);
  });

  it('não muta o dataset', () => {
    const db = new FoodDatabase(CANONICAL_BR_CATALOG);
    const before = JSON.stringify(CANONICAL_BR_CATALOG);
    db.search('arroz');
    db.search('LEITE');
    db.search('a');
    db.search('queijo', { limit: 2 });
    db.all();
    expect(JSON.stringify(CANONICAL_BR_CATALOG)).toBe(before);
  });

  it('dataset completo responde a termos de todas as categorias', () => {
    const db = new FoodDatabase(CANONICAL_BR_CATALOG);
    for (const term of ['feijao', 'frango', 'atum', 'sardinha', 'ovo', 'pao', 'batata', 'banana', 'couve', 'tilapia', 'tapioca']) {
      expect(db.search(term).length).toBeGreaterThan(0);
    }
  });

  it('limit restringe sem quebrar a ordem', () => {
    const db = new FoodDatabase(CANONICAL_BR_CATALOG);
    const full = db.search('arroz').map((food) => food.id);
    const limited = db.search('arroz', { limit: 2 }).map((food) => food.id);
    expect(limited).toEqual(full.slice(0, 2));
    expect(db.search('arroz', { limit: 0 })).toEqual([]);
  });

  it('getById resolve identidade estável e null para ausente', () => {
    const db = new FoodDatabase(CANONICAL_BR_CATALOG);
    const rice = db.search('arroz branco cozido')[0];
    expect(rice).toBeDefined();
    expect(db.getById(rice.id)?.name).toBe(rice.name);
    expect(db.getById('id-inexistente')).toBeNull();
  });

  it('performance < 15ms no dataset V1', () => {
    const db = new FoodDatabase(CANONICAL_BR_CATALOG);
    db.search('arroz'); // aquecimento (JIT)
    const iterations = 200;
    const start = performance.now();
    for (let i = 0; i < iterations; i += 1) {
      db.search('arroz');
    }
    const averageMs = (performance.now() - start) / iterations;
    expect(averageMs).toBeLessThan(15);
  });

  it('searchFoods usa o catálogo canônico sem estado mutável', () => {
    const a = searchFoods('feijao').map((food) => food.id);
    const b = searchFoods('FEIJÃO').map((food) => food.id);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });
});

// ============================================================================
// 6. CONTRATO USDA_FDC (OFFLINE, SEM REDE)
// ============================================================================

describe('NUT-005 contrato USDA_FDC', () => {
  const record = {
    fdcId: 171287,
    description: 'Test Food Fixture',
    brandOwner: 'Fixture Brand',
    servingSizeGrams: 50,
    servingDescription: '1 porção (50g)',
    per100g: { calories: 200, protein: 10, carbs: 20, fat: 8 },
  };

  it('converte preservando FDC ID e proveniência original', () => {
    const reference = foodReferenceFromUsdaFdc(record);
    expect(reference.source).toBe('USDA_FDC');
    expect(reference.sourceId).toBe('FDC:171287');
    expect(reference.id).toContain('171287');
    expect(reference.name).toBe('Test Food Fixture');
    expect(reference.brand).toBe('Fixture Brand');
    expect(reference.servingReferenceGrams).toBe(50);
    expect(reference.verified).toBe(true);
    expect(reference.sourceRef).toContain('171287');
    expect(isFoodReference(reference)).toBe(true);
  });

  it('é puro e offline (mesma entrada, mesma saída; sem rede)', () => {
    const first = foodReferenceFromUsdaFdc(record);
    const second = foodReferenceFromUsdaFdc(record);
    expect(second).toEqual(first);
    expect(first).not.toBe(second);
  });

  it('rejeita registros malformados sem inventar campos', () => {
    expect(() => foodReferenceFromUsdaFdc(null)).toThrow(FoodDatabaseError);
    expect(() => foodReferenceFromUsdaFdc({ ...record, fdcId: -1 })).toThrow(FoodDatabaseError);
    expect(() => foodReferenceFromUsdaFdc({ ...record, fdcId: 1.5 })).toThrow(FoodDatabaseError);
    expect(() => foodReferenceFromUsdaFdc({ ...record, description: '  ' })).toThrow(FoodDatabaseError);
    expect(() => foodReferenceFromUsdaFdc({ ...record, per100g: { calories: -5, protein: 0, carbs: 0, fat: 0 } }))
      .toThrow(FoodDatabaseError);
    expect(() => foodReferenceFromUsdaFdc({ ...record, servingSizeGrams: 0 })).toThrow(FoodDatabaseError);
  });
});

// ============================================================================
// 7/15. USER_CONFIRMED COM TRAVA DE 15%
// ============================================================================

describe('NUT-005 USER_CONFIRMED', () => {
  it('tolerância canônica é 15%', () => {
    expect(USER_FOOD_ENERGY_TOLERANCE_RELATIVE).toBe(0.15);
    expect(theoreticalKcalForMacros(10, 20, 5)).toBe(165);
    expect(exceedsEnergyTolerance(0.15)).toBe(false);
    expect(exceedsEnergyTolerance(0.1501)).toBe(true);
  });

  it('valor coerente é aceito com referência USER_CONFIRMED', () => {
    const result = validateUserFoodInput({
      name: 'Vitamina de banana caseira',
      servingGrams: 300,
      calories: 180,
      protein: 8,
      carbs: 30,
      fat: 3,
    });
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.reference.source).toBe('USER_CONFIRMED');
    expect(result.reference.verified).toBe(true);
    expect(result.reference.servingReferenceGrams).toBe(300);
    expect(isFoodReference(result.reference)).toBe(true);
    // Normalização por 100g: 180 kcal em 300g => 60 kcal/100g.
    expect(result.reference.per100g.calories).toBe(60);
    expect(result.reference.per100g.protein).toBeCloseTo(2.67, 1);
  });

  it('divergência exatamente no limite (15%) é aceita', () => {
    // Teórica exata: 4*10 + 4*7.5 + 9*5 = 115; informada 100 => 15/100 = 0.15.
    const result = validateUserFoodInput({
      name: 'Prato limite',
      servingGrams: 100,
      calories: 100,
      protein: 10,
      carbs: 7.5,
      fat: 5,
    });
    expect(result.status).toBe('ACCEPTED');
  });

  it('divergência > 15% exige confirmação explícita (nunca silenciosa)', () => {
    const result = validateUserFoodInput({
      name: 'Bolo suspeito',
      servingGrams: 100,
      calories: 100,
      protein: 10,
      carbs: 10,
      fat: 10,
    });
    // Teórica: 40 + 40 + 90 = 170 => divergência 70%.
    expect(result.status).toBe('NEEDS_CONFIRMATION');
    if (result.status !== 'NEEDS_CONFIRMATION') return;
    expect(result.theoreticalKcal).toBe(170);
    expect(result.divergenceRelative).toBeCloseTo(0.7, 5);
    expect(result.message).toContain('15%');
    // Confirmação explícita materializa a referência.
    const reference = confirmUserFoodDraft(result.draft, { confirmed: true });
    expect(reference.source).toBe('USER_CONFIRMED');
    expect(isFoodReference(reference)).toBe(true);
    // Sem confirmação explícita: falha fechada.
    expect(() => confirmUserFoodDraft(result.draft, { confirmed: false } as unknown)).toThrow(FoodDatabaseError);
    expect(() => confirmUserFoodDraft(result.draft, {})).toThrow(FoodDatabaseError);
    // Rascunho adulterado: falha fechada.
    expect(() =>
      confirmUserFoodDraft({ ...result.draft, divergenceRelative: 0 }, { confirmed: true })
    ).toThrow(FoodDatabaseError);
  });

  it('rejeita zero, NaN, Infinity, negativos e porção inválida', () => {
    const base = {
      name: 'Alimento',
      servingGrams: 100,
      calories: 100,
      protein: 10,
      carbs: 10,
      fat: 2,
    };
    expect(validateUserFoodInput({ ...base, calories: 0 }).status).toBe('REJECTED');
    expect(validateUserFoodInput({ ...base, calories: NaN }).status).toBe('REJECTED');
    expect(validateUserFoodInput({ ...base, calories: Infinity }).status).toBe('REJECTED');
    expect(validateUserFoodInput({ ...base, protein: -1 }).status).toBe('REJECTED');
    expect(validateUserFoodInput({ ...base, carbs: -0.5 }).status).toBe('REJECTED');
    expect(validateUserFoodInput({ ...base, fat: Number.NEGATIVE_INFINITY }).status).toBe('REJECTED');
    expect(validateUserFoodInput({ ...base, servingGrams: 0 }).status).toBe('REJECTED');
    expect(validateUserFoodInput({ ...base, servingGrams: -50 }).status).toBe('REJECTED');
    expect(validateUserFoodInput({ ...base, servingGrams: NaN }).status).toBe('REJECTED');
    expect(validateUserFoodInput({ ...base, name: '   ' }).status).toBe('REJECTED');
    expect(validateUserFoodInput(null).status).toBe('REJECTED');
    const rejected = validateUserFoodInput({ ...base, servingGrams: 0 });
    expect(rejected.status).toBe('REJECTED');
    if (rejected.status === 'REJECTED') expect(rejected.code).toBe('INVALID_SERVING');
  });

  it('identidade estável e determinística para a mesma entrada', () => {
    const input = {
      name: 'Marmita fitness',
      servingGrams: 400,
      calories: 500,
      protein: 40,
      carbs: 50,
      fat: 15,
    };
    const first = validateUserFoodInput(input);
    const second = validateUserFoodInput(input);
    expect(first.status).toBe('ACCEPTED');
    expect(second.status).toBe('ACCEPTED');
    if (first.status !== 'ACCEPTED' || second.status !== 'ACCEPTED') return;
    expect(first.reference.id).toBe(second.reference.id);
  });
});

// ============================================================================
// 10. PORÇÕES E CÁLCULO + PONTE NUT-004
// ============================================================================

describe('NUT-005 porções e ponte com o ledger', () => {
  it('escala FoodReference + gramas em etapa única determinística', () => {
    const db = new FoodDatabase(CANONICAL_BR_CATALOG);
    const rice = db.getById('br-arroz-branco-cozido') as FoodReference;
    const full = scaleFoodReferenceToGrams(rice, 100);
    expect(full.calories).toBe(130);
    expect(full.protein).toBe(2.7);
    const half = scaleFoodReferenceToGrams(rice, 50);
    expect(half.calories).toBe(65);
    expect(half.protein).toBe(1.35);
    // 33g: arredonda só o resultado final (130 * 0.33 = 42.9).
    expect(scaleFoodReferenceToGrams(rice, 33).calories).toBe(42.9);
    expect(scaleFoodReferenceToGrams(rice, 33)).toEqual(scaleFoodReferenceToGrams(rice, 33));
  });

  it('rejeita gramagens e referências inválidas', () => {
    const rice = CANONICAL_BR_CATALOG[0];
    for (const grams of [0, -10, NaN, Infinity, '100', null, undefined]) {
      expect(() => scaleFoodReferenceToGrams(rice, grams)).toThrow(FoodDatabaseError);
    }
    expect(() => scaleFoodReferenceToGrams({ id: 'x' }, 100)).toThrow(FoodDatabaseError);
  });

  it('toFoodEntryInput monta input do ledger sem gravar nada', () => {
    const db = new FoodDatabase(CANONICAL_BR_CATALOG);
    const chicken = db.getById('br-peito-frango-grelhado') as FoodReference;
    const input = toFoodEntryInput(chicken, 150, { id: 'entry-1', loggedAt: '2026-09-16T12:00:00.000Z' });
    expect(input.foodReferenceId).toBe('br-peito-frango-grelhado');
    expect(input.name).toBe('Peito de frango grelhado (sem pele)');
    expect(input.quantityGrams).toBe(150);
    expect(input.calories).toBe(238.5);
    expect(input.protein).toBe(48);
    expect(input.id).toBe('entry-1');
    // Inputs inválidos de identidade falham fechado.
    expect(() => toFoodEntryInput(chicken, 150, { id: '', loggedAt: 'x' })).toThrow(FoodDatabaseError);
    expect(() => toFoodEntryInput(chicken, 150, null)).toThrow(FoodDatabaseError);
    // Chamada repetida: mesmo resultado (pura, sem escrita no ledger).
    expect(toFoodEntryInput(chicken, 150, { id: 'entry-1', loggedAt: '2026-09-16T12:00:00.000Z' })).toEqual(input);
  });
});
