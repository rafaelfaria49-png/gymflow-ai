/**
 * GymFlow AI — Motor Nutricional Determinístico e Canônico (NUT-003)
 *
 * Módulo puramente funcional, desacoplado de I/O, determinístico e versionado.
 * Implementa cálculo bioenergético de BMR (Mifflin-St Jeor provisório),
 * TDEE, déficit/superávit seguro, partição de macronutrientes (proteína 1.6–2.2 g/kg),
 * hidratação canônica e carimbo de proveniência SHA-256.
 *
 * Garantias estruturais (NUT-003 corretivo):
 * - Invariantes absolutos não são configuráveis: configuração que os viole falha fechada
 *   (`NutritionEngineConfigError`), sem clamp silencioso.
 * - Nenhum número não finito entra no cálculo nem sai em `DailyTargets`.
 * - `inputSnapshotHash` cobre a totalidade dos parâmetros de cálculo resolvidos.
 * - O motor não lê relógio nem inventa data: sem `computedAt` explícito, o campo é `null`.
 *
 * Referências canônicas:
 * - docs/nutrition/GYMFLOW_NUTRITION_MASTERPLAN_001.md (Seções 5.2, 7, 8 e 9.2)
 * - docs/nutrition/GYMFLOW_NUTRITION_DECISIONS_001.md (D-NUT-01, D-NUT-02, D-NUT-03, D-NUT-04)
 * - docs/nutrition/GYMFLOW_NUTRITION_IMPLEMENTATION_GOALS_001.md (NUT-003)
 */

import type { NutritionProfile } from '../../types/nutrition';
import { evaluateNutritionGate } from './profile-gates';
import {
  DEFAULT_CALCULATION_CONFIG,
  DEFAULT_ENGINE_CONFIG,
  ENGINE_HARD_SAFETY_LIMITS,
  MACRO_ROUNDING_TOLERANCE_KCAL,
  NutritionEngineConfigError,
  NutritionEngineGateError,
  NutritionEngineInputError,
  NutritionEngineSerializationError,
  UNSPECIFIED_ESTIMATION_RELATIVE_TOLERANCE,
  type DailyTargets,
  type EngineConfig,
  type EstimationTolerance,
  type MacroConstraintCode,
  type MacroReconciliation,
  type NutritionInputSnapshot,
  type ResolvedCalculationConfig,
  type ResolvedComputationContext,
  type ResolvedEngineConfig,
} from './engine-types';
import {
  isFiniteNumber,
  validateDailyTargetsOutput,
  validateEngineConfig,
  validateEngineConfigKeys,
  validateProfileInputs,
} from './engine-validation';

// ============================================================================
// CRIPTOGRAFIA PORTÁTIL: SHA-256 SÍNCRONO (FIPS 180-4)
// Zero dependências externas; 100% portável (Browser, Mobile, SSR, Node)
// ============================================================================

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;
const ch = (x: number, y: number, z: number): number => ((x & y) ^ (~x & z)) >>> 0;
const maj = (x: number, y: number, z: number): number => ((x & y) ^ (x & z) ^ (y & z)) >>> 0;
const sigma0 = (x: number): number => (rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22)) >>> 0;
const sigma1 = (x: number): number => (rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25)) >>> 0;
const gamma0 = (x: number): number => (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
const gamma1 = (x: number): number => (rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10)) >>> 0;

/**
 * Computa o hash SHA-256 canônico de forma síncrona, determinística e sem dependência de runtime.
 */
export function sha256Sync(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const l = bytes.length;
  const bitLen = l * 8;

  const remainder = (l + 9) % 64;
  const paddingZeros = remainder === 0 ? 0 : 64 - remainder;
  const totalLen = l + 1 + paddingZeros + 8;
  const buf = new Uint8Array(totalLen);
  buf.set(bytes, 0);
  buf[l] = 0x80;

  const highBits = Math.floor(bitLen / 0x100000000) >>> 0;
  const lowBits = bitLen >>> 0;
  buf[totalLen - 8] = (highBits >>> 24) & 0xff;
  buf[totalLen - 7] = (highBits >>> 16) & 0xff;
  buf[totalLen - 6] = (highBits >>> 8) & 0xff;
  buf[totalLen - 5] = highBits & 0xff;
  buf[totalLen - 4] = (lowBits >>> 24) & 0xff;
  buf[totalLen - 3] = (lowBits >>> 16) & 0xff;
  buf[totalLen - 2] = (lowBits >>> 8) & 0xff;
  buf[totalLen - 1] = lowBits & 0xff;

  let h0 = 0x6a09e667 >>> 0;
  let h1 = 0xbb67ae85 >>> 0;
  let h2 = 0x3c6ef372 >>> 0;
  let h3 = 0xa54ff53a >>> 0;
  let h4 = 0x510e527f >>> 0;
  let h5 = 0x9b05688c >>> 0;
  let h6 = 0x1f83d9ab >>> 0;
  let h7 = 0x5be0cd19 >>> 0;

  const w = new Uint32Array(64);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      w[i] = (gamma1(w[i - 2]) + w[i - 7] + gamma0(w[i - 15]) + w[i - 16]) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const t1 = (h + sigma1(e) + ch(e, f, g) + SHA256_K[i] + w[i]) >>> 0;
      const t2 = (sigma0(a) + maj(a, b, c)) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const toHex = (n: number) => n.toString(16).padStart(8, '0');
  return `${toHex(h0)}${toHex(h1)}${toHex(h2)}${toHex(h3)}${toHex(h4)}${toHex(h5)}${toHex(h6)}${toHex(h7)}`;
}

// ============================================================================
// SERIALIZAÇÃO CANÔNICA (PROVENANCE ESTÁVEL)
// ============================================================================

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normaliza recursivamente qualquer estrutura de dados com ordenação léxica de chaves.
 *
 * Números não finitos (NaN, Infinity, -Infinity) são rejeitados com
 * `NutritionEngineSerializationError`: `JSON.stringify` os converteria em `null`,
 * apagando silenciosamente a diferença entre inputs distintos no hash de proveniência.
 */
export function canonicalizeJson(value: unknown, path = '$'): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new NutritionEngineSerializationError(path, value);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalizeJson(item, `${path}[${index}]`));
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined) {
      result[key] = canonicalizeJson(v, `${path}.${key}`);
    }
  }
  return result;
}

/**
 * Serializa de forma determinística e canônica para JSON sem depender de ordem de inserção.
 */
export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

// ============================================================================
// RESOLUÇÃO DE CONFIGURAÇÃO E SNAPSHOT
// ============================================================================

function pick<T>(value: T | undefined, fallback: T): T {
  // `null` NÃO cai no default: é preservado para que a validação o rejeite explicitamente.
  return value === undefined ? fallback : value;
}

function pickRecord<T extends Record<string, number>>(value: T | undefined, defaults: T): T {
  if (value === undefined) {
    return defaults;
  }
  if (!isPlainRecord(value)) {
    // Estrutura inválida é preservada para rejeição explícita na validação.
    return value;
  }
  return { ...defaults, ...value };
}

/**
 * Mescla de forma pura e imutável os parâmetros de cálculo com a configuração canônica padrão.
 * Não valida e não clampeia: a validação fail-closed é responsabilidade de `validateEngineConfig`.
 */
export function resolveCalculationConfig(config?: EngineConfig): ResolvedCalculationConfig {
  if (!config) {
    return DEFAULT_CALCULATION_CONFIG;
  }
  const d = DEFAULT_CALCULATION_CONFIG;
  return {
    bmrUnspecifiedOffset: pick(config.bmrUnspecifiedOffset, d.bmrUnspecifiedOffset),
    palFactors: pickRecord(config.palFactors, d.palFactors),
    trainingKcalPerMinute: pick(config.trainingKcalPerMinute, d.trainingKcalPerMinute),
    goalAdjustments: pickRecord(config.goalAdjustments, d.goalAdjustments),
    maxAbsoluteDeficitKcal: pick(config.maxAbsoluteDeficitKcal, d.maxAbsoluteDeficitKcal),
    minBmrMultiplierInDeficit: pick(
      config.minBmrMultiplierInDeficit,
      d.minBmrMultiplierInDeficit
    ),
    // Pisos calóricos são invariantes: vêm sempre da constante canônica, nunca do
    // config do chamador. Continuam no snapshot por serem input efetivo do cálculo.
    femaleCaloricFloorKcal: d.femaleCaloricFloorKcal,
    maleCaloricFloorKcal: d.maleCaloricFloorKcal,
    unspecifiedCaloricFloorKcal: d.unspecifiedCaloricFloorKcal,
    proteinGramsPerKgByGoal: pickRecord(config.proteinGramsPerKgByGoal, d.proteinGramsPerKgByGoal),
    minProteinGramsPerKg: pick(config.minProteinGramsPerKg, d.minProteinGramsPerKg),
    maxProteinGramsPerKg: pick(config.maxProteinGramsPerKg, d.maxProteinGramsPerKg),
    defaultFatGramsPerKg: pick(config.defaultFatGramsPerKg, d.defaultFatGramsPerKg),
    minFatGramsPerKg: pick(config.minFatGramsPerKg, d.minFatGramsPerKg),
    maxFatGramsPerKg: pick(config.maxFatGramsPerKg, d.maxFatGramsPerKg),
    nonKetoCarbsPreferenceGrams: pick(
      config.nonKetoCarbsPreferenceGrams,
      d.nonKetoCarbsPreferenceGrams
    ),
    ketogenicCarbsGrams: pick(config.ketogenicCarbsGrams, d.ketogenicCarbsGrams),
    baseHydrationMlPerKg: pick(config.baseHydrationMlPerKg, d.baseHydrationMlPerKg),
    trainingHydrationMlPerHour: pick(
      config.trainingHydrationMlPerHour,
      d.trainingHydrationMlPerHour
    ),
    maxHydrationMlPerDay: pick(config.maxHydrationMlPerDay, d.maxHydrationMlPerDay),
    minHydrationMlPerDay: pick(config.minHydrationMlPerDay, d.minHydrationMlPerDay),
  };
}

/**
 * Resolve versões e metadados de evento.
 *
 * `computedAt` NUNCA é inventado: sem instante explícito o resultado carrega `null`
 * e `computedAtSource: 'absent'`.
 */
export function resolveComputationContext(config?: EngineConfig): ResolvedComputationContext {
  const providedComputedAt = config?.computedAt;
  const hasComputedAt = providedComputedAt !== undefined;

  return {
    engineVersion: pick(config?.engineVersion, DEFAULT_ENGINE_CONFIG.engineVersion),
    formulaVersion: pick(config?.formulaVersion, DEFAULT_ENGINE_CONFIG.formulaVersion),
    computedAt: hasComputedAt ? providedComputedAt : null,
    computedAtSource: hasComputedAt ? 'explicit_context' : 'absent',
    computedReason: pick(config?.computedReason, DEFAULT_ENGINE_CONFIG.computedReason),
  };
}

/**
 * Mescla de forma pura e imutável a configuração fornecida com a configuração canônica padrão.
 */
export function resolveEngineConfig(config?: EngineConfig): ResolvedEngineConfig {
  if (!config) {
    return DEFAULT_ENGINE_CONFIG;
  }
  const context = resolveComputationContext(config);
  return {
    ...resolveCalculationConfig(config),
    engineVersion: context.engineVersion,
    formulaVersion: context.formulaVersion,
    computedAt: context.computedAt,
    computedReason: context.computedReason,
  };
}

/**
 * Constrói o snapshot formal de biometria, estilo de vida, versões e da TOTALIDADE dos
 * parâmetros de cálculo resolvidos para o SHA-256 de proveniência.
 *
 * `effectiveParameters` é o próprio `ResolvedCalculationConfig`: a completude é garantida
 * pelo tipo, e não por uma lista curada manualmente que possa esquecer um parâmetro.
 * Metadados de evento (`computedAt`, `computedReason`) ficam fora por não alterarem números.
 */
export function buildInputSnapshot(
  profile: NutritionProfile,
  calculationConfig: ResolvedCalculationConfig,
  versions: { engineVersion: string; formulaVersion: string }
): NutritionInputSnapshot {
  return {
    biometrics: {
      age: profile.age,
      biologicalSexForCalcs: profile.biologicalSexForCalcs,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
    },
    lifestyle: {
      averageTrainingDurationMinutes: profile.averageTrainingDurationMinutes,
      dietaryPattern: profile.dietaryPattern,
      goal: profile.goal,
      healthFlags: [...(profile.healthFlags || [])].sort(),
      nonExerciseActivity: profile.nonExerciseActivity,
      trainingFrequencyDaysPerWeek: profile.trainingFrequencyDaysPerWeek,
    },
    versions: {
      engineVersion: versions.engineVersion,
      formulaVersion: versions.formulaVersion,
    },
    effectiveParameters: calculationConfig,
  };
}

// ============================================================================
// ETAPAS DO MOTOR BIOENERGÉTICO
// ============================================================================

function requireFiniteParameter(field: string, value: unknown): number {
  if (!isFiniteNumber(value)) {
    throw new NutritionEngineInputError([
      {
        field,
        code: 'NOT_FINITE',
        message: `parâmetro efetivo ausente ou não finito: ${String(value)}`,
      },
    ]);
  }
  return value;
}

/**
 * 1. BMR — Equação de Mifflin-St Jeor (formulaVersion: 'mifflin-st-jeor-v1')
 *
 * Homem: 10 * peso + 6.25 * altura - 5 * idade + 5
 * Mulher: 10 * peso + 6.25 * altura - 5 * idade - 161
 * Unspecified: base + offset provisório (-78) com marcação explícita de LIMITED_GUIDANCE.
 * NUNCA assume default masculino (D-NUT-02).
 *
 * Pré-condição: perfil e config já validados (`validateProfileInputs` / `validateEngineConfig`).
 */
export function computeBmr(
  profile: NutritionProfile,
  config: ResolvedCalculationConfig
): { bmrKcal: number; isLimitedGuidance: boolean } {
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  let bmrKcal: number;
  let isLimitedGuidance = false;

  if (profile.biologicalSexForCalcs === 'male') {
    bmrKcal = base + 5;
  } else if (profile.biologicalSexForCalcs === 'female') {
    bmrKcal = base - 161;
  } else {
    // biologicalSexForCalcs === 'unspecified'
    // PROFESSIONAL_REVIEW_REQUIRED: Ponto médio entre +5 e -161 (-78)
    bmrKcal = base + requireFiniteParameter('bmrUnspecifiedOffset', config.bmrUnspecifiedOffset);
    isLimitedGuidance = true;
  }

  return {
    bmrKcal: Math.round(bmrKcal),
    isLimitedGuidance,
  };
}

/**
 * 2. TDEE — Fator de Atividade Física (PAL 1.2–1.75) + Gasto Médio de Treino
 *
 * Sem default oculto: nível de atividade fora do contrato falha de forma tipada,
 * em vez de cair silenciosamente no PAL sedentário.
 */
export function computeTdee(
  bmrKcal: number,
  profile: NutritionProfile,
  config: ResolvedCalculationConfig
): { tdeeKcal: number; dailyTrainingKcal: number } {
  const pal = requireFiniteParameter(
    `palFactors.${String(profile.nonExerciseActivity)}`,
    config.palFactors[profile.nonExerciseActivity]
  );
  const kcalPerMinute = requireFiniteParameter(
    'trainingKcalPerMinute',
    config.trainingKcalPerMinute
  );

  // Custo calórico diário de treinamento proporcional à frequência e duração
  const dailyTrainingMinutes =
    (profile.trainingFrequencyDaysPerWeek * profile.averageTrainingDurationMinutes) / 7;

  // PROFESSIONAL_REVIEW_REQUIRED: custo de 6 kcal/min
  const dailyTrainingKcal = Math.round(dailyTrainingMinutes * kcalPerMinute);
  const tdeeKcal = Math.round(bmrKcal * pal + dailyTrainingKcal);

  return { tdeeKcal, dailyTrainingKcal };
}

/**
 * 3. Partição Energética — Déficit / Superávit Seguro com Pisos de Emergência
 *
 * Regras mandatórias de segurança (invariantes duros, não configuráveis acima do limite):
 * - Déficit máximo absoluto <= 750 kcal/dia.
 * - Target em déficit nunca abaixo de BMR * 0.90.
 * - Piso absoluto de emergência:
 *   - female: >= 1200 kcal
 *   - male: >= 1500 kcal
 *   - unspecified: >= 1200 kcal (NUNCA aplicar piso masculino a unspecified).
 */
export function computeTargetCalories(
  bmrKcal: number,
  tdeeKcal: number,
  profile: NutritionProfile,
  config: ResolvedCalculationConfig
): {
  targetCalories: number;
  energyBalanceKcal: number;
  appliedCaloricFloor: number;
} {
  let rawAdjustment = requireFiniteParameter(
    `goalAdjustments.${String(profile.goal)}`,
    config.goalAdjustments[profile.goal]
  );

  // Trava 1: envelope de ajuste por objetivo.
  // `validateEngineConfig` já rejeita (fail-closed) qualquer ajuste fora de
  // [-maxAbsoluteDeficitKcal, MAX_GOAL_SURPLUS_KCAL], então estes clamps são
  // redundantes por contrato e mantidos apenas como defesa para chamadas diretas
  // desta etapa pura. Nenhum caminho validado depende deles.
  if (rawAdjustment < 0) {
    rawAdjustment = Math.max(rawAdjustment, -config.maxAbsoluteDeficitKcal);
  } else {
    rawAdjustment = Math.min(rawAdjustment, ENGINE_HARD_SAFETY_LIMITS.MAX_GOAL_SURPLUS_KCAL);
  }

  let rawTarget = tdeeKcal + rawAdjustment;

  // Trava 2: Proteção em déficit — nunca descer abaixo de BMR * minBmrMultiplierInDeficit
  if (rawAdjustment < 0) {
    const bmrFloor = Math.round(bmrKcal * config.minBmrMultiplierInDeficit);
    rawTarget = Math.max(rawTarget, bmrFloor);
  }

  // Trava 3: Piso calórico absoluto de emergência
  let sexFloor: number;
  if (profile.biologicalSexForCalcs === 'male') {
    // PROFESSIONAL_REVIEW_REQUIRED: piso homem 1500 kcal
    sexFloor = config.maleCaloricFloorKcal;
  } else if (profile.biologicalSexForCalcs === 'female') {
    // PROFESSIONAL_REVIEW_REQUIRED: piso mulher 1200 kcal
    sexFloor = config.femaleCaloricFloorKcal;
  } else {
    // biologicalSexForCalcs === 'unspecified'
    // D-NUT-02: NUNCA aplicar o piso masculino de 1500 kcal ao sexo não especificado
    // PROFESSIONAL_REVIEW_REQUIRED: piso unspecified 1200 kcal
    sexFloor = config.unspecifiedCaloricFloorKcal;
  }

  const targetCalories = Math.round(Math.max(rawTarget, sexFloor));
  const energyBalanceKcal = targetCalories - tdeeKcal;

  return {
    targetCalories,
    energyBalanceKcal,
    appliedCaloricFloor: sexFloor,
  };
}

/**
 * 4. Partição de Macronutrientes
 *
 * Ordem de prioridade (inalterada, sem nova regra clínica):
 * 1. Proteína, estritamente dentro de [minProteinGramsPerKg, maxProteinGramsPerKg],
 *    com teto duro de 2.2 g/kg reaplicado APÓS o arredondamento inteiro.
 * 2. Lipídios de suporte essencial (nunca abaixo de `minFatGramsPerKg`).
 * 3. Carboidratos pelo saldo energético; em dieta não cetogênica o motor tenta atingir a
 *    PREFERÊNCIA `nonKetoCarbsPreferenceGrams` deslocando lipídio até o piso essencial.
 *
 * Reconciliação: o resultado expõe `MacroReconciliation` com o delta real entre
 * (4P + 4C + 9F) e `targetCalories`. Quando as constraints tornam a igualdade impossível,
 * o motor NÃO finge reconciliação: sinaliza a constraint não atendida de forma tipada.
 */
export function computeMacros(
  targetCalories: number,
  profile: NutritionProfile,
  config: ResolvedCalculationConfig
): {
  targetProteinGrams: number;
  targetFatGrams: number;
  targetCarbsGrams: number;
  effectiveProteinGramsPerKg: number;
  effectiveFatGramsPerKg: number;
  reconciliation: MacroReconciliation;
} {
  const weightKg = profile.weightKg;

  // 1. Proteína (g/kg/dia) — D-NUT-04
  const goalProteinRate = requireFiniteParameter(
    `proteinGramsPerKgByGoal.${String(profile.goal)}`,
    config.proteinGramsPerKgByGoal[profile.goal]
  );
  const boundedProteinRate = Math.min(
    config.maxProteinGramsPerKg,
    Math.max(config.minProteinGramsPerKg, goalProteinRate)
  );

  // Teto duro reaplicado após o arredondamento: `Math.round` pode ultrapassar 2.2 g/kg.
  const hardCapProteinGrams = Math.floor(weightKg * config.maxProteinGramsPerKg);
  let targetProteinGrams = Math.min(
    Math.round(weightKg * boundedProteinRate),
    hardCapProteinGrams
  );
  if (targetProteinGrams < 0) {
    targetProteinGrams = 0;
  }
  const proteinCalories = targetProteinGrams * 4;

  let targetFatGrams: number;
  let targetCarbsGrams: number;
  let roundingToleranceKcal: number;
  const unmetConstraints: MacroConstraintCode[] = [];

  if (profile.dietaryPattern === 'ketogenic') {
    // Dieta Cetogênica: carboidratos fixados baixos; lipídios absorvem o saldo calórico.
    // PROFESSIONAL_REVIEW_REQUIRED: 30g de carboidratos
    targetCarbsGrams = Math.max(0, Math.round(config.ketogenicCarbsGrams));
    const carbsCalories = targetCarbsGrams * 4;
    targetFatGrams = Math.max(
      0,
      Math.round((targetCalories - proteinCalories - carbsCalories) / 9)
    );
    // Lipídio é o macro residual: meio grama de gordura = 4.5 kcal.
    roundingToleranceKcal = MACRO_ROUNDING_TOLERANCE_KCAL.FAT_RESIDUAL;
  } else {
    // Dieta Não Cetogênica
    // Lipídios de suporte essencial (0.7 a 1.0 g/kg/dia)
    // PROFESSIONAL_REVIEW_REQUIRED: default 0.85 g/kg/dia
    const fatRate = Math.min(
      config.maxFatGramsPerKg,
      Math.max(config.minFatGramsPerKg, config.defaultFatGramsPerKg)
    );
    let fatGrams = Math.max(0, Math.round(weightKg * fatRate));
    const essentialFatGrams = Math.min(fatGrams, Math.max(0, Math.round(weightKg * config.minFatGramsPerKg)));

    // Carboidratos pelo saldo energético: Target - (Kcal_prot + Kcal_gord)
    let carbsGrams = Math.round((targetCalories - proteinCalories - fatGrams * 9) / 4);

    // Preferência de carboidratos em dieta não cetogênica (best-effort, não invariante).
    // PROFESSIONAL_REVIEW_REQUIRED: preferência de 120g
    const carbsPreference = Math.max(0, Math.round(config.nonKetoCarbsPreferenceGrams));
    if (carbsGrams < carbsPreference) {
      const neededCalories = (carbsPreference - carbsGrams) * 4;
      const reducibleFatCalories = Math.max(0, (fatGrams - essentialFatGrams) * 9);
      const caloriesToShift = Math.min(neededCalories, reducibleFatCalories);
      if (caloriesToShift > 0) {
        fatGrams -= Math.floor(caloriesToShift / 9);
        carbsGrams = Math.round((targetCalories - proteinCalories - fatGrams * 9) / 4);
      }
    }

    targetFatGrams = Math.max(0, fatGrams);
    targetCarbsGrams = Math.max(0, carbsGrams);

    if (targetCarbsGrams < carbsPreference) {
      unmetConstraints.push('NON_KETO_CARBS_PREFERENCE_UNMET');
    }
    // Carboidrato é o macro residual: meio grama de carboidrato = 2 kcal.
    roundingToleranceKcal = MACRO_ROUNDING_TOLERANCE_KCAL.CARBS_RESIDUAL;
  }

  const macroCalories = targetProteinGrams * 4 + targetCarbsGrams * 4 + targetFatGrams * 9;
  const deltaKcal = macroCalories - targetCalories;
  const isReconciled = Math.abs(deltaKcal) <= roundingToleranceKcal;

  if (deltaKcal > roundingToleranceKcal) {
    // Energia alvo insuficiente para proteína + lipídio essencial (+ carboidrato cetogênico):
    // a igualdade energética é matematicamente impossível e isso é declarado, não mascarado.
    unmetConstraints.unshift('ENERGY_BELOW_MACRO_MINIMUMS');
  }

  return {
    targetProteinGrams,
    targetFatGrams,
    targetCarbsGrams,
    effectiveProteinGramsPerKg: Number((targetProteinGrams / weightKg).toFixed(2)),
    effectiveFatGramsPerKg: Number((targetFatGrams / weightKg).toFixed(2)),
    reconciliation: {
      macroCalories,
      targetCalories,
      deltaKcal,
      roundingToleranceKcal,
      isReconciled,
      unmetConstraints,
    },
  };
}

/**
 * 5. Meta Hídrica Canônica
 *
 * Base: 35 ml * pesoKg
 * Adicional de treino: +500 ml por hora média de treinamento
 * Teto de segurança: <= 4500 ml/dia (prevenção de hiponatremia)
 */
export function computeHydration(
  profile: NutritionProfile,
  config: ResolvedCalculationConfig
): number {
  // PROFESSIONAL_REVIEW_REQUIRED: 35 ml/kg
  const baseMl = profile.weightKg * config.baseHydrationMlPerKg;

  const dailyTrainingHours =
    (profile.trainingFrequencyDaysPerWeek * profile.averageTrainingDurationMinutes) / (7 * 60);

  // PROFESSIONAL_REVIEW_REQUIRED: +500 ml por hora de treino
  const trainingMl = dailyTrainingHours * config.trainingHydrationMlPerHour;
  const rawWater = baseMl + trainingMl;

  // Clamps: máximo 4500 ml/dia (D-NUT-03/Masterplan 9.2), mínimo 1500 ml/dia
  const clampedWater = Math.min(
    config.maxHydrationMlPerDay,
    Math.max(config.minHydrationMlPerDay, rawWater)
  );

  return Math.round(clampedWater);
}

/**
 * 6. Tolerância declarada do alvo (Masterplan 5.2)
 *
 * Para `biologicalSexForCalcs === 'unspecified'`, o alvo carrega tolerância ampliada
 * de +/- 15%. É guidance explícita: o alvo NÃO é ajustado automaticamente por ela.
 */
export function buildEstimationTolerance(
  profile: NutritionProfile,
  targetCalories: number
): EstimationTolerance {
  const isUnspecified = profile.biologicalSexForCalcs === 'unspecified';
  const relative = isUnspecified ? UNSPECIFIED_ESTIMATION_RELATIVE_TOLERANCE : 0;

  return {
    relative,
    reason: isUnspecified ? 'BIOLOGICAL_SEX_UNSPECIFIED' : 'NONE',
    targetCaloriesLowerKcal: Math.round(targetCalories * (1 - relative)),
    targetCaloriesUpperKcal: Math.round(targetCalories * (1 + relative)),
  };
}

// ============================================================================
// PONTO DE ENTRADA PRINCIPAL: calculateDailyTargets
// ============================================================================

/**
 * Calcula deterministicamente os DailyTargets para um NutritionProfile.
 *
 * Função puramente funcional e determinística:
 * - Mesmos profile + config produzem exatamente os mesmos números, hash e id.
 * - Sem Math.random(), randomUUID(), Date.now() ou `new Date()`.
 *
 * Precedência de falha (fail-closed):
 * 1. `NutritionEngineConfigError` — configuração viola invariante duro de segurança.
 * 2. `NutritionEngineGateError` — gate ético-clínico bloqueia metas automáticas.
 * 3. `NutritionEngineInputError` — números/enumerações do perfil inválidos, ou saída não finita.
 *
 * @throws {NutritionEngineConfigError} configuração inválida ou acima de invariante absoluto.
 * @throws {NutritionEngineGateError} perfil bloqueado pelo gate ético-clínico.
 * @throws {NutritionEngineInputError} entrada numérica inválida ou saída fora do contrato.
 */
export function calculateDailyTargets(
  profile: NutritionProfile,
  config?: EngineConfig
): DailyTargets {
  // 1. CONFIGURAÇÃO: chaves canônicas, resolução pura e validação fail-closed dos invariantes.
  //    A checagem de chaves vem primeiro para que um override removido do contrato seja
  //    reportado como inexistente, e não silenciosamente descartado na resolução.
  const keyViolations = validateEngineConfigKeys(config);
  if (keyViolations.length > 0) {
    throw new NutritionEngineConfigError(keyViolations);
  }
  const calculationConfig = resolveCalculationConfig(config);
  const context = resolveComputationContext(config);
  const configViolations = validateEngineConfig({
    ...calculationConfig,
    engineVersion: context.engineVersion,
    formulaVersion: context.formulaVersion,
    computedAt: context.computedAt,
    computedReason: context.computedReason,
  });
  if (configViolations.length > 0) {
    throw new NutritionEngineConfigError(configViolations);
  }

  // 2. GATE CLÍNICO: antes de calcular targets, respeitar evaluateNutritionGate(profile)
  const gateResult = evaluateNutritionGate(profile);
  if (!gateResult.allowAutomatedTargets) {
    throw new NutritionEngineGateError(gateResult);
  }

  // 3. VALIDAÇÃO NUMÉRICA DO PERFIL: nenhum NaN/Infinity/negativo inválido entra no cálculo
  const inputViolations = validateProfileInputs(profile);
  if (inputViolations.length > 0) {
    throw new NutritionEngineInputError(inputViolations);
  }

  // 4. Proveniência: snapshot canônico completo e SHA-256
  const snapshot = buildInputSnapshot(profile, calculationConfig, {
    engineVersion: context.engineVersion,
    formulaVersion: context.formulaVersion,
  });
  const inputSnapshotHash = sha256Sync(canonicalSerialize(snapshot));

  // 5. BMR (Mifflin-St Jeor provisório)
  const { bmrKcal, isLimitedGuidance } = computeBmr(profile, calculationConfig);

  // 6. TDEE (PAL + Componente de Treino)
  const { tdeeKcal } = computeTdee(bmrKcal, profile, calculationConfig);

  // 7. Balanço Calórico Seguro e Pisos Fisiológicos
  const { targetCalories, energyBalanceKcal, appliedCaloricFloor } = computeTargetCalories(
    bmrKcal,
    tdeeKcal,
    profile,
    calculationConfig
  );

  // 8. Partição de Macronutrientes (Proteína -> Lipídios -> Carboidratos)
  const {
    targetProteinGrams,
    targetFatGrams,
    targetCarbsGrams,
    effectiveProteinGramsPerKg,
    effectiveFatGramsPerKg,
    reconciliation,
  } = computeMacros(targetCalories, profile, calculationConfig);

  // 9. Meta Hídrica (35 ml/kg base + treino, teto 4500 ml)
  const targetWaterMl = computeHydration(profile, calculationConfig);

  // 10. Identidade de evento: snapshot + metadados que NÃO alteram números,
  //     de modo que razões/instantes distintos nunca colidam como o mesmo evento.
  const eventFingerprint = canonicalSerialize({
    inputSnapshotHash,
    computedAt: context.computedAt,
    computedReason: context.computedReason,
  });
  const id = `dt_${sha256Sync(eventFingerprint).slice(0, 16)}`;

  const targets: DailyTargets = {
    id,
    engineVersion: context.engineVersion,
    formulaVersion: context.formulaVersion,
    inputSnapshotHash,
    computedAt: context.computedAt,
    computedAtSource: context.computedAtSource,
    computedReason: context.computedReason,
    targetCalories,
    targetProteinGrams,
    targetCarbsGrams,
    targetFatGrams,
    targetWaterMl,
    bmrKcal,
    tdeeKcal,
    energyBalanceKcal,
    scientificStatus: 'PROVISIONAL_PENDING_PROFESSIONAL_REVIEW',
    isLimitedGuidance: isLimitedGuidance || gateResult.status === 'LIMITED_GUIDANCE',
    appliedCaloricFloor,
    effectiveProteinGramsPerKg,
    effectiveFatGramsPerKg,
    macroReconciliation: reconciliation,
    estimationTolerance: buildEstimationTolerance(profile, targetCalories),
  };

  // 11. Garantia final: nenhum número não finito, hidratação negativa ou proteína acima do teto
  const outputViolations = validateDailyTargetsOutput(targets, profile);
  if (outputViolations.length > 0) {
    throw new NutritionEngineInputError(outputViolations);
  }

  return targets;
}
