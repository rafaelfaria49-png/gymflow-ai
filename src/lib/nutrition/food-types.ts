/**
 * GymFlow AI — Contratos do FoodDatabase (NUT-005 / GOAL-106)
 *
 * Tipos canônicos de referência alimentar. Este módulo é 100% puro: nenhuma
 * leitura de relógio, nenhum acesso a storage ou rede, nenhuma mutação.
 *
 * Referências canônicas:
 * - docs/nutrition/GYMFLOW_NUTRITION_MASTERPLAN_001.md (Seção 12)
 * - docs/nutrition/GYMFLOW_NUTRITION_DECISIONS_001.md (D-NUT-05, D-NUT-10)
 * - docs/nutrition/GYMFLOW_NUTRITION_IMPLEMENTATION_GOALS_001.md (NUT-005)
 *
 * Proveniências V1 (exatas, sem camada paralela):
 * - CANONICAL_BR: catálogo offline curado da dieta brasileira;
 * - USDA_FDC: suporte contratual ao USDA FoodData Central (domínio público
 *   federal EUA), sem dependência de rede em runtime (offline-first);
 * - USER_CONFIRMED: cadastro manual assistido com trava físico-química.
 *
 * Licenciamento (D-NUT-05 / GOAL-106 §5):
 * - Proibidos nesta V1: scraping/incorporação integral da TBCA/USP,
 *   Open Food Facts (ODbL share-alike), código de barras e catálogo
 *   comercial proprietário. OFF/barcode permanecem V1.5.
 */

export const FOOD_SOURCES = Object.freeze([
  'CANONICAL_BR',
  'USDA_FDC',
  'USER_CONFIRMED',
] as const);

/** Proveniências suportadas na V1 — exatamente estas três, sem exceção. */
export type FoodSource = (typeof FOOD_SOURCES)[number];

/** Versão de proveniência do catálogo CANONICAL_BR V1. */
export const FOOD_PROVENANCE_VERSION_V1 = 'canonical-br-v1' as const;

/**
 * Tolerância energética canônica (D-NUT-10): a divergência relativa entre as
 * calorias informadas e a kcal teórica (4*P + 4*C + 9*G) só exige confirmação
 * explícita quando ESTRITAMENTE superior a 15%.
 */
export const USER_FOOD_ENERGY_TOLERANCE_RELATIVE = 0.15;

/**
 * Epsilon de comparação para a fronteira de 15%: somas em ponto flutuante
 * (ex.: 4*P + 4*C + 9*G) podem produzir 0.150000000000007 para uma razão
 * matematicamente exata de 0.15. A fronteira é inclusiva (<= 15% aceita).
 */
const ENERGY_BOUNDARY_EPSILON = 1e-9;

/** Nutrientes por 100 g — referência consistente de todo FoodReference. */
export interface FoodNutrientsPer100g {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sodiumMg?: number;
}

/**
 * Referência alimentar canônica (Masterplan 12.1 + campo de auditoria NUT-005).
 *
 * `sourceRef` é a fonte pública verificável em texto pesquisável
 * (dataset + licença + descrição que permite auditoria futura). É obrigatória
 * e não vazia em toda referência V1: alimento oficial sem provenance
 * verificável não entra no catálogo (D-NUT-10).
 */
export interface FoodReference {
  id: string;
  source: FoodSource;
  sourceId: string;
  name: string;
  brand?: string;
  servingReferenceGrams: number;
  servingDescription: string;
  per100g: FoodNutrientsPer100g;
  provenanceVersion: string;
  verified: boolean;
  sourceRef: string;
}

// ============================================================================
// ERRO TIPADO
// ============================================================================

export type FoodDatabaseErrorCode =
  | 'INVALID_FOOD_REFERENCE'
  | 'INVALID_USDA_RECORD'
  | 'DUPLICATE_FOOD_ID'
  | 'UNVERIFIED_OFFICIAL_FOOD'
  | 'INVALID_PORTION_GRAMS';

/**
 * Falha honesta e tipada do domínio do FoodDatabase. Nenhum caminho promove
 * registro malformado a referência válida em silêncio.
 */
export class FoodDatabaseError extends Error {
  readonly code: FoodDatabaseErrorCode;

  constructor(code: FoodDatabaseErrorCode, message: string) {
    super(message);
    this.name = 'FoodDatabaseError';
    this.code = code;
    Object.setPrototypeOf(this, FoodDatabaseError.prototype);
  }
}

// ============================================================================
// ENERGIA TEÓRICA (D-NUT-10)
// ============================================================================

/** kcal teórica de Atwater: 4*P + 4*C + 9*G. */
export function theoreticalKcalForMacros(protein: number, carbs: number, fat: number): number {
  return 4 * protein + 4 * carbs + 9 * fat;
}

/**
 * Divergência relativa |informada - teórica| / informada.
 * Retorna null quando as entradas não permitem o cálculo (não finitas ou
 * calorias informadas <= 0) — o chamador decide a política (rejeitar).
 */
export function energyDivergenceRelative(
  statedKcal: number,
  protein: number,
  carbs: number,
  fat: number,
): number | null {
  if (
    typeof statedKcal !== 'number'
    || typeof protein !== 'number'
    || typeof carbs !== 'number'
    || typeof fat !== 'number'
    || !Number.isFinite(statedKcal)
    || !Number.isFinite(protein)
    || !Number.isFinite(carbs)
    || !Number.isFinite(fat)
    || statedKcal <= 0
  ) {
    return null;
  }
  return Math.abs(statedKcal - theoreticalKcalForMacros(protein, carbs, fat)) / statedKcal;
}

/**
 * Verdadeiro quando a divergência supera ESTRITAMENTE a tolerância canônica
 * de 15% (fronteira inclusiva com epsilon contra poeira de ponto flutuante).
 */
export function exceedsEnergyTolerance(divergenceRelative: number): boolean {
  return divergenceRelative - USER_FOOD_ENERGY_TOLERANCE_RELATIVE > ENERGY_BOUNDARY_EPSILON;
}

// ============================================================================
// GUARDS PUROS
// ============================================================================

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFoodSource(value: unknown): value is FoodSource {
  return (
    typeof value === 'string'
    && (FOOD_SOURCES as readonly string[]).includes(value)
  );
}

function isNutrientsPer100g(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const calories = value['calories'];
  if (!isFiniteNumber(calories) || calories < 0) return false;
  for (const key of ['protein', 'carbs', 'fat'] as const) {
    const macro = value[key];
    if (!isFiniteNumber(macro) || macro < 0) return false;
  }
  for (const key of ['fiber', 'sodiumMg'] as const) {
    const extra = value[key];
    if (extra !== undefined && (!isFiniteNumber(extra) || extra < 0)) return false;
  }
  return true;
}

/**
 * Guarda estrutural de FoodReference: identidade estável, porção válida,
 * nutrientes finitos não negativos e provenance auditável (sourceRef).
 * `brand`, quando presente, deve ser textual não vazia.
 */
export function isFoodReference(value: unknown): value is FoodReference {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value['id'])) return false;
  if (!isFoodSource(value['source'])) return false;
  if (!isNonEmptyString(value['sourceId'])) return false;
  if (!isNonEmptyString(value['name'])) return false;
  if (value['brand'] !== undefined && !isNonEmptyString(value['brand'])) return false;
  const serving = value['servingReferenceGrams'];
  if (!isFiniteNumber(serving) || serving <= 0) return false;
  if (!isNonEmptyString(value['servingDescription'])) return false;
  if (!isNutrientsPer100g(value['per100g'])) return false;
  if (!isNonEmptyString(value['provenanceVersion'])) return false;
  if (typeof value['verified'] !== 'boolean') return false;
  if (!isNonEmptyString(value['sourceRef'])) return false;
  return true;
}

// ============================================================================
// USDA_FDC — CONTRATO OFFLINE (SEM REDE EM RUNTIME)
// ============================================================================

/**
 * Registro USDA FoodData Central mínimo para conversão offline.
 * O FDC ID original é preservado em `sourceId` (`FDC:<id>`); nenhuma chamada
 * de rede existe neste módulo (V1 offline-first — o roadmap não exige rede).
 */
export interface UsdaFdcRecord {
  fdcId: number;
  description: string;
  brandOwner?: string;
  servingSizeGrams?: number;
  servingDescription?: string;
  per100g: FoodNutrientsPer100g;
  publicationDate?: string;
}

function isUsdaFdcRecord(value: unknown): value is UsdaFdcRecord {
  if (!isRecord(value)) return false;
  const fdcId = value['fdcId'];
  if (typeof fdcId !== 'number' || !Number.isInteger(fdcId) || fdcId <= 0) return false;
  if (!isNonEmptyString(value['description'])) return false;
  if (value['brandOwner'] !== undefined && !isNonEmptyString(value['brandOwner'])) return false;
  if (value['servingSizeGrams'] !== undefined) {
    if (!isFiniteNumber(value['servingSizeGrams']) || value['servingSizeGrams'] <= 0) return false;
  }
  if (value['servingDescription'] !== undefined && !isNonEmptyString(value['servingDescription'])) {
    return false;
  }
  if (!isNutrientsPer100g(value['per100g'])) return false;
  if (value['publicationDate'] !== undefined && typeof value['publicationDate'] !== 'string') return false;
  return true;
}

/**
 * Converte um registro USDA_FDC em FoodReference preservando o FDC ID e a
 * proveniência original. Falha fechada (FoodDatabaseError) para registros
 * malformados — nunca inventa campos.
 */
export function foodReferenceFromUsdaFdc(record: unknown): FoodReference {
  if (!isUsdaFdcRecord(record)) {
    throw new FoodDatabaseError(
      'INVALID_USDA_RECORD',
      'Registro USDA_FDC inválido: exige fdcId inteiro > 0, description textual, '
        + 'servingSizeGrams finito > 0 quando informado e per100g finito não negativo.',
    );
  }
  const servingGrams = record.servingSizeGrams ?? 100;
  return {
    id: `usda-fdc-${record.fdcId}`,
    source: 'USDA_FDC',
    sourceId: `FDC:${record.fdcId}`,
    name: record.description,
    ...(record.brandOwner === undefined ? {} : { brand: record.brandOwner }),
    servingReferenceGrams: servingGrams,
    servingDescription: record.servingDescription ?? `${servingGrams}g`,
    per100g: { ...record.per100g },
    provenanceVersion: 'usda-fdc-v1',
    verified: true,
    sourceRef: `USDA FoodData Central (domínio público federal EUA) — FDC ID ${record.fdcId}`,
  };
}

// ============================================================================
// USER_CONFIRMED — CRIAÇÃO/NORMALIZAÇÃO COM TRAVA ENERGÉTICA
// ============================================================================

/** Entrada manual mínima do usuário (valores NA PORÇÃO informada). */
export interface UserFoodInput {
  name: string;
  brand?: string;
  servingGrams: number;
  servingDescription?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type UserFoodRejectionCode = 'INVALID_NAME' | 'INVALID_SERVING' | 'INVALID_NUTRIENTS';

/**
 * Rascunho pendente de confirmação explícita: carrega a entrada normalizada
 * mais a divergência calculada. Nunca é um FoodReference válido por si só.
 */
export interface UserFoodDraft {
  readonly kind: 'USER_FOOD_DRAFT';
  readonly name: string;
  readonly brand?: string;
  readonly servingGrams: number;
  readonly servingDescription: string;
  readonly calories: number;
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
  readonly theoreticalKcal: number;
  readonly divergenceRelative: number;
}

export type UserFoodValidation =
  | {
    status: 'ACCEPTED';
    reference: FoodReference;
    theoreticalKcal: number;
    divergenceRelative: number;
  }
  | {
    status: 'NEEDS_CONFIRMATION';
    draft: UserFoodDraft;
    theoreticalKcal: number;
    divergenceRelative: number;
    message: string;
  }
  | { status: 'REJECTED'; code: UserFoodRejectionCode; message: string };

function isUserFoodDraft(value: unknown): value is UserFoodDraft {
  if (!isRecord(value)) return false;
  if (value['kind'] !== 'USER_FOOD_DRAFT') return false;
  if (!isNonEmptyString(value['name'])) return false;
  if (value['brand'] !== undefined && !isNonEmptyString(value['brand'])) return false;
  if (!isFiniteNumber(value['servingGrams']) || value['servingGrams'] <= 0) return false;
  if (!isNonEmptyString(value['servingDescription'])) return false;
  for (const key of ['calories', 'protein', 'carbs', 'fat', 'theoreticalKcal'] as const) {
    if (!isFiniteNumber(value[key])) return false;
  }
  if ((value['calories'] as number) <= 0) return false;
  for (const key of ['protein', 'carbs', 'fat'] as const) {
    if ((value[key] as number) < 0) return false;
  }
  const divergence = value['divergenceRelative'];
  if (!isFiniteNumber(divergence) || divergence < 0) return false;
  const expected = energyDivergenceRelative(
    value['calories'] as number,
    value['protein'] as number,
    value['carbs'] as number,
    value['fat'] as number,
  );
  // O draft só é honesto se a divergência carimbada confere com os números.
  if (expected === null) return false;
  return Math.abs(expected - divergence) <= 1e-9;
}

/** Slug determinístico para identidade estável (sem dependência externa). */
export function slugifyFoodName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'alimento';
}

/** Hash djb2 determinístico (hex de 8 chars) para identidade estável. */
export function stableFoodHash(parts: readonly (string | number)[]): string {
  const text = parts.map((part) => String(part)).join('|');
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function buildUserFoodReference(input: {
  name: string;
  brand?: string;
  servingGrams: number;
  servingDescription: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}): FoodReference {
  const factor = 100 / input.servingGrams;
  const round2 = (value: number): number => Math.round(value * 100) / 100;
  const slug = slugifyFoodName(input.name);
  const hash = stableFoodHash([
    slug,
    input.servingGrams,
    input.calories,
    input.protein,
    input.carbs,
    input.fat,
  ]);
  return {
    id: `user-${slug}-${hash}`,
    source: 'USER_CONFIRMED',
    sourceId: `USER_CONFIRMED:${slug}-${hash}`,
    name: input.name.trim(),
    ...(input.brand === undefined ? {} : { brand: input.brand }),
    servingReferenceGrams: input.servingGrams,
    servingDescription: input.servingDescription,
    per100g: {
      calories: round2(input.calories * factor),
      protein: round2(input.protein * factor),
      carbs: round2(input.carbs * factor),
      fat: round2(input.fat * factor),
    },
    provenanceVersion: 'user-confirmed-v1',
    verified: true,
    sourceRef: 'USER_CONFIRMED — cadastro manual validado com trava energética de 15% (D-NUT-10)',
  };
}

/**
 * Valida a entrada manual mínima (nome, porção, calorias, P/C/G).
 *
 * - NaN, Infinity, negativos, calorias zero e porções inválidas: REJECTED.
 * - Divergência <= 15%: ACCEPTED com a referência pronta.
 * - Divergência > 15%: NEEDS_CONFIRMATION com rascunho — nunca aceita
 *   silenciosamente; a referência só nasce via `confirmUserFoodDraft`.
 */
export function validateUserFoodInput(input: unknown): UserFoodValidation {
  if (!isRecord(input)) {
    return { status: 'REJECTED', code: 'INVALID_NUTRIENTS', message: 'Entrada de alimento manual inválida: objeto esperado.' };
  }
  const name = input['name'];
  if (!isNonEmptyString(name)) {
    return { status: 'REJECTED', code: 'INVALID_NAME', message: 'Alimento manual exige um nome textual não vazio.' };
  }
  const brand = input['brand'];
  if (brand !== undefined && !isNonEmptyString(brand)) {
    return { status: 'REJECTED', code: 'INVALID_NAME', message: 'Marca do alimento, quando informada, deve ser textual não vazia.' };
  }
  const servingGrams = input['servingGrams'];
  if (!isFiniteNumber(servingGrams) || servingGrams <= 0) {
    return {
      status: 'REJECTED',
      code: 'INVALID_SERVING',
      message: 'Alimento manual exige porção (servingGrams) finita maior que zero.',
    };
  }
  const calories = input['calories'];
  const protein = input['protein'];
  const carbs = input['carbs'];
  const fat = input['fat'];
  if (!isFiniteNumber(calories) || calories <= 0) {
    return {
      status: 'REJECTED',
      code: 'INVALID_NUTRIENTS',
      message: 'Alimento manual exige calorias finitas maiores que zero.',
    };
  }
  for (const [label, value] of [['proteína', protein], ['carboidratos', carbs], ['gordura', fat]] as const) {
    if (!isFiniteNumber(value) || (value as number) < 0) {
      return {
        status: 'REJECTED',
        code: 'INVALID_NUTRIENTS',
        message: `Alimento manual exige ${label} finita maior ou igual a zero.`,
      };
    }
  }
  const proteinNum = protein as number;
  const carbsNum = carbs as number;
  const fatNum = fat as number;
  const caloriesNum = calories as number;
  const theoreticalKcal = theoreticalKcalForMacros(proteinNum, carbsNum, fatNum);
  const divergence = energyDivergenceRelative(caloriesNum, proteinNum, carbsNum, fatNum) as number;
  const servingDescriptionRaw = input['servingDescription'];
  const servingDescription = isNonEmptyString(servingDescriptionRaw)
    ? servingDescriptionRaw.trim()
    : `${servingGrams}g`;
  const normalized = {
    name: (name as string).trim(),
    ...(brand === undefined ? {} : { brand: (brand as string).trim() }),
    servingGrams: servingGrams as number,
    servingDescription,
    calories: caloriesNum,
    protein: proteinNum,
    carbs: carbsNum,
    fat: fatNum,
  };

  if (!exceedsEnergyTolerance(divergence)) {
    return {
      status: 'ACCEPTED',
      reference: buildUserFoodReference(normalized),
      theoreticalKcal,
      divergenceRelative: divergence,
    };
  }
  const percent = (divergence * 100).toFixed(1);
  return {
    status: 'NEEDS_CONFIRMATION',
    draft: { kind: 'USER_FOOD_DRAFT', ...normalized, theoreticalKcal, divergenceRelative: divergence },
    theoreticalKcal,
    divergenceRelative: divergence,
    message: `Divergência energética de ${percent}% supera o limite de 15%: `
      + `informado ${caloriesNum} kcal na porção vs. teórica ${theoreticalKcal.toFixed(1)} kcal `
      + '(4*P + 4*C + 9*G). Confirme explicitamente para registrar como USER_CONFIRMED.',
  };
}

/**
 * Materializa um rascunho pendente em FoodReference USER_CONFIRMED.
 * Exige o rascunho íntegro (isUserFoodDraft) e confirmação explícita
 * `{ confirmed: true }` — qualquer outro valor falha fechado.
 */
export function confirmUserFoodDraft(draft: unknown, confirmation: unknown): FoodReference {
  if (!isUserFoodDraft(draft)) {
    throw new FoodDatabaseError(
      'INVALID_FOOD_REFERENCE',
      'Confirmação rejeitada: rascunho de alimento manual inválido ou adulterado.',
    );
  }
  if (!isRecord(confirmation) || confirmation['confirmed'] !== true) {
    throw new FoodDatabaseError(
      'INVALID_FOOD_REFERENCE',
      'Confirmação rejeitada: confirmação explícita { confirmed: true } é obrigatória.',
    );
  }
  return buildUserFoodReference({
    name: draft.name,
    ...(draft.brand === undefined ? {} : { brand: draft.brand }),
    servingGrams: draft.servingGrams,
    servingDescription: draft.servingDescription,
    calories: draft.calories,
    protein: draft.protein,
    carbs: draft.carbs,
    fat: draft.fat,
  });
}
