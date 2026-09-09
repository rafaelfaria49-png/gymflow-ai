/**
 * GymFlow AI — Motor Nutricional Determinístico e Canônico (NUT-003)
 *
 * Módulo puramente funcional, desacoplado de I/O, determinístico e versionado.
 * Implementa cálculo bioenergético de BMR (Mifflin-St Jeor provisório),
 * TDEE, déficit/superávit seguro, partição de macronutrientes (proteína 1.6–2.2 g/kg),
 * hidratação canônica e carimbo de proveniência SHA-256.
 *
 * Referências canônicas:
 * - docs/nutrition/GYMFLOW_NUTRITION_MASTERPLAN_001.md (Seções 7 e 8)
 * - docs/nutrition/GYMFLOW_NUTRITION_DECISIONS_001.md (D-NUT-01, D-NUT-02, D-NUT-03, D-NUT-04)
 * - docs/nutrition/GYMFLOW_NUTRITION_IMPLEMENTATION_GOALS_001.md (NUT-003)
 */

import type { NutritionProfile } from '../../types/nutrition';
import { evaluateNutritionGate } from './profile-gates';
import {
  DEFAULT_ENGINE_CONFIG,
  DailyTargets,
  EngineConfig,
  NutritionEngineGateError,
  NutritionInputSnapshot,
} from './engine-types';

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

/**
 * Normaliza recursivamente qualquer estrutura de dados com ordenação léxica de chaves.
 */
export function canonicalizeJson(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined) {
      result[key] = canonicalizeJson(v);
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

/**
 * Mescla de forma pura e imutável a configuração fornecida com a configuração canônica padrão.
 */
export function resolveEngineConfig(config?: EngineConfig): Required<EngineConfig> {
  if (!config) {
    return DEFAULT_ENGINE_CONFIG;
  }
  return {
    engineVersion: config.engineVersion ?? DEFAULT_ENGINE_CONFIG.engineVersion,
    formulaVersion: config.formulaVersion ?? DEFAULT_ENGINE_CONFIG.formulaVersion,
    computedAtOverride: config.computedAtOverride ?? DEFAULT_ENGINE_CONFIG.computedAtOverride,
    computedReason: config.computedReason ?? DEFAULT_ENGINE_CONFIG.computedReason,
    bmrUnspecifiedOffset:
      config.bmrUnspecifiedOffset ?? DEFAULT_ENGINE_CONFIG.bmrUnspecifiedOffset,
    palFactors: {
      ...DEFAULT_ENGINE_CONFIG.palFactors,
      ...(config.palFactors ?? {}),
    },
    trainingKcalPerMinute:
      config.trainingKcalPerMinute ?? DEFAULT_ENGINE_CONFIG.trainingKcalPerMinute,
    goalAdjustments: {
      ...DEFAULT_ENGINE_CONFIG.goalAdjustments,
      ...(config.goalAdjustments ?? {}),
    },
    maxAbsoluteDeficitKcal:
      config.maxAbsoluteDeficitKcal ?? DEFAULT_ENGINE_CONFIG.maxAbsoluteDeficitKcal,
    minBmrMultiplierInDeficit:
      config.minBmrMultiplierInDeficit ?? DEFAULT_ENGINE_CONFIG.minBmrMultiplierInDeficit,
    femaleCaloricFloorKcal:
      config.femaleCaloricFloorKcal ?? DEFAULT_ENGINE_CONFIG.femaleCaloricFloorKcal,
    maleCaloricFloorKcal:
      config.maleCaloricFloorKcal ?? DEFAULT_ENGINE_CONFIG.maleCaloricFloorKcal,
    unspecifiedCaloricFloorKcal:
      config.unspecifiedCaloricFloorKcal ?? DEFAULT_ENGINE_CONFIG.unspecifiedCaloricFloorKcal,
    proteinGramsPerKgByGoal: {
      ...DEFAULT_ENGINE_CONFIG.proteinGramsPerKgByGoal,
      ...(config.proteinGramsPerKgByGoal ?? {}),
    },
    minProteinGramsPerKg:
      config.minProteinGramsPerKg ?? DEFAULT_ENGINE_CONFIG.minProteinGramsPerKg,
    maxProteinGramsPerKg:
      config.maxProteinGramsPerKg ?? DEFAULT_ENGINE_CONFIG.maxProteinGramsPerKg,
    defaultFatGramsPerKg:
      config.defaultFatGramsPerKg ?? DEFAULT_ENGINE_CONFIG.defaultFatGramsPerKg,
    minFatGramsPerKg: config.minFatGramsPerKg ?? DEFAULT_ENGINE_CONFIG.minFatGramsPerKg,
    maxFatGramsPerKg: config.maxFatGramsPerKg ?? DEFAULT_ENGINE_CONFIG.maxFatGramsPerKg,
    minFatCaloriePercentage:
      config.minFatCaloriePercentage ?? DEFAULT_ENGINE_CONFIG.minFatCaloriePercentage,
    ketogenicFatCaloriePercentage:
      config.ketogenicFatCaloriePercentage ?? DEFAULT_ENGINE_CONFIG.ketogenicFatCaloriePercentage,
    nonKetoCarbsFloorGrams:
      config.nonKetoCarbsFloorGrams ?? DEFAULT_ENGINE_CONFIG.nonKetoCarbsFloorGrams,
    ketogenicCarbsGrams:
      config.ketogenicCarbsGrams ?? DEFAULT_ENGINE_CONFIG.ketogenicCarbsGrams,
    baseHydrationMlPerKg:
      config.baseHydrationMlPerKg ?? DEFAULT_ENGINE_CONFIG.baseHydrationMlPerKg,
    trainingHydrationMlPerHour:
      config.trainingHydrationMlPerHour ?? DEFAULT_ENGINE_CONFIG.trainingHydrationMlPerHour,
    maxHydrationMlPerDay:
      config.maxHydrationMlPerDay ?? DEFAULT_ENGINE_CONFIG.maxHydrationMlPerDay,
    minHydrationMlPerDay:
      config.minHydrationMlPerDay ?? DEFAULT_ENGINE_CONFIG.minHydrationMlPerDay,
  };
}

/**
 * Constrói o snapshot formal dos parâmetros e biometria para cálculo do SHA-256.
 */
export function buildInputSnapshot(
  profile: NutritionProfile,
  effectiveConfig: Required<EngineConfig>
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
      engineVersion: effectiveConfig.engineVersion,
      formulaVersion: effectiveConfig.formulaVersion,
    },
    effectiveParameters: {
      bmrUnspecifiedOffset: effectiveConfig.bmrUnspecifiedOffset,
      goalAdjustments: effectiveConfig.goalAdjustments,
      maxAbsoluteDeficitKcal: effectiveConfig.maxAbsoluteDeficitKcal,
      minBmrMultiplierInDeficit: effectiveConfig.minBmrMultiplierInDeficit,
      palFactors: effectiveConfig.palFactors,
      proteinGramsPerKgByGoal: effectiveConfig.proteinGramsPerKgByGoal,
      caloricFloors: {
        female: effectiveConfig.femaleCaloricFloorKcal,
        male: effectiveConfig.maleCaloricFloorKcal,
        unspecified: effectiveConfig.unspecifiedCaloricFloorKcal,
      },
      fat: {
        defaultGramsPerKg: effectiveConfig.defaultFatGramsPerKg,
        minGramsPerKg: effectiveConfig.minFatGramsPerKg,
        maxGramsPerKg: effectiveConfig.maxFatGramsPerKg,
      },
      carbs: {
        nonKetoFloorGrams: effectiveConfig.nonKetoCarbsFloorGrams,
        ketogenicGrams: effectiveConfig.ketogenicCarbsGrams,
      },
      hydration: {
        baseMlPerKg: effectiveConfig.baseHydrationMlPerKg,
        trainingMlPerHour: effectiveConfig.trainingHydrationMlPerHour,
        maxMlPerDay: effectiveConfig.maxHydrationMlPerDay,
      },
    },
  };
}

// ============================================================================
// ETAPAS DO MOTOR BIOENERGÉTICO
// ============================================================================

/**
 * 1. BMR — Equação de Mifflin-St Jeor (formulaVersion: 'mifflin-st-jeor-v1')
 *
 * Homem: 10 * peso + 6.25 * altura - 5 * idade + 5
 * Mulher: 10 * peso + 6.25 * altura - 5 * idade - 161
 * Unspecified: base + offset provisório (-78) com marcação explícita de LIMITED_GUIDANCE.
 * NUNCA assume default masculino (D-NUT-02).
 */
export function computeBmr(
  profile: NutritionProfile,
  config: Required<EngineConfig>
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
    bmrKcal = base + config.bmrUnspecifiedOffset;
    isLimitedGuidance = true;
  }

  return {
    bmrKcal: Math.round(bmrKcal),
    isLimitedGuidance,
  };
}

/**
 * 2. TDEE — Fator de Atividade Física (PAL 1.2–1.75) + Gasto Médio de Treino
 */
export function computeTdee(
  bmrKcal: number,
  profile: NutritionProfile,
  config: Required<EngineConfig>
): { tdeeKcal: number; dailyTrainingKcal: number } {
  const pal = config.palFactors[profile.nonExerciseActivity] ?? 1.2;

  // Custo calórico diário de treinamento proporcional à frequência e duração
  const validFreq = Math.max(0, Math.min(7, profile.trainingFrequencyDaysPerWeek));
  const validDuration = Math.max(0, profile.averageTrainingDurationMinutes);
  const dailyTrainingMinutes = (validFreq * validDuration) / 7;

  // PROFESSIONAL_REVIEW_REQUIRED: custo de 6 kcal/min
  const dailyTrainingKcal = Math.round(dailyTrainingMinutes * config.trainingKcalPerMinute);
  const tdeeKcal = Math.round(bmrKcal * pal + dailyTrainingKcal);

  return { tdeeKcal, dailyTrainingKcal };
}

/**
 * 3. Partição Energética — Déficit / Superávit Seguro com Pisos de Emergência
 *
 * Regras mandatórias de segurança:
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
  config: Required<EngineConfig>
): {
  targetCalories: number;
  energyBalanceKcal: number;
  appliedCaloricFloor: number;
} {
  let rawAdjustment = config.goalAdjustments[profile.goal] ?? 0;

  // Trava 1: Déficit máximo absoluto limitado a 750 kcal/dia
  if (rawAdjustment < 0) {
    // PROFESSIONAL_REVIEW_REQUIRED: limite 750 kcal
    rawAdjustment = Math.max(rawAdjustment, -config.maxAbsoluteDeficitKcal);
  }

  let rawTarget = tdeeKcal + rawAdjustment;

  // Trava 2: Proteção em déficit — nunca descer abaixo de BMR * 0.90
  if (rawAdjustment < 0) {
    // PROFESSIONAL_REVIEW_REQUIRED: BMR * 0.90
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
 * - Proteína primeiro: estritamente 1.6 a 2.2 g/kg/dia (D-NUT-04).
 *   Cutting favorece faixa superior; manutenção/hipertrofia faixa central.
 * - Lipídios de suporte essencial: 0.7 a 1.0 g/kg/dia.
 * - Carboidratos: saldo energético restante.
 *   Em dieta não cetogênica, preserva piso de 100 a 130 g/dia (config: 120g).
 *   Em dieta cetogênica, alocação baixa controlada (30g) sem imposição de piso glicolítico.
 * - Garantia matemática de ausência de números negativos ou não finitos.
 */
export function computeMacros(
  targetCalories: number,
  profile: NutritionProfile,
  config: Required<EngineConfig>
): {
  targetProteinGrams: number;
  targetFatGrams: number;
  targetCarbsGrams: number;
  effectiveProteinGramsPerKg: number;
  effectiveFatGramsPerKg: number;
} {
  // 1. Ingestão de Proteína (g/kg/dia)
  const rawProteinRate = config.proteinGramsPerKgByGoal[profile.goal] ?? 1.8;
  // D-NUT-04: Trava de projeto — nunca automatizar < 1.6 ou > 2.2 g/kg/dia
  const clampedProteinRate = Math.min(
    config.maxProteinGramsPerKg,
    Math.max(config.minProteinGramsPerKg, rawProteinRate)
  );

  const targetProteinGrams = Math.round(profile.weightKg * clampedProteinRate);
  const proteinCalories = targetProteinGrams * 4;

  let targetFatGrams = 0;
  let targetCarbsGrams = 0;

  if (profile.dietaryPattern === 'ketogenic') {
    // Dieta Cetogênica: carboidratos fixados baixos; lipídios absorvem saldo calórico
    // PROFESSIONAL_REVIEW_REQUIRED: 30g de carboidratos
    targetCarbsGrams = Math.max(0, config.ketogenicCarbsGrams);
    const carbsCalories = targetCarbsGrams * 4;

    const remainingForFat = Math.max(0, targetCalories - (proteinCalories + carbsCalories));
    targetFatGrams = Math.round(remainingForFat / 9);
  } else {
    // Dieta Não Cetogênica
    // Lipídios de suporte essencial (0.7 a 1.0 g/kg/dia)
    // PROFESSIONAL_REVIEW_REQUIRED: default 0.85 g/kg/dia
    const rawFatRate = Math.min(
      config.maxFatGramsPerKg,
      Math.max(config.minFatGramsPerKg, config.defaultFatGramsPerKg)
    );
    let fatGrams = Math.round(profile.weightKg * rawFatRate);
    let fatCalories = fatGrams * 9;

    // Carboidratos pelo saldo energético: Target - (Kcal_prot + Kcal_gord)
    let remainingForCarbs = targetCalories - (proteinCalories + fatCalories);
    let carbsGrams = Math.round(remainingForCarbs / 4);

    // Respeito ao piso de carboidratos em dieta não cetogênica (100 a 130 g/dia)
    // PROFESSIONAL_REVIEW_REQUIRED: piso de 120g
    if (carbsGrams < config.nonKetoCarbsFloorGrams) {
      const carbsShortfallGrams = config.nonKetoCarbsFloorGrams - carbsGrams;
      const neededCalories = carbsShortfallGrams * 4;

      // Desloca gordura acima do piso mínimo de 0.7 g/kg para viabilizar carboidratos
      const minFatGrams = Math.round(profile.weightKg * config.minFatGramsPerKg);
      const reducibleFatGrams = Math.max(0, fatGrams - minFatGrams);
      const reducibleFatCalories = reducibleFatGrams * 9;

      const caloriesToShift = Math.min(neededCalories, reducibleFatCalories);
      if (caloriesToShift > 0) {
        const fatGramsToReduce = Math.floor(caloriesToShift / 9);
        fatGrams -= fatGramsToReduce;
        fatCalories = fatGrams * 9;
        remainingForCarbs = targetCalories - (proteinCalories + fatCalories);
        carbsGrams = Math.round(remainingForCarbs / 4);
      }
    }

    targetFatGrams = Math.max(0, fatGrams);
    targetCarbsGrams = Math.max(0, carbsGrams);
  }

  // Garantia matemática de finitude e não-negatividade
  const safeProtein =
    Number.isFinite(targetProteinGrams) && targetProteinGrams >= 0 ? targetProteinGrams : 0;
  const safeFat = Number.isFinite(targetFatGrams) && targetFatGrams >= 0 ? targetFatGrams : 0;
  const safeCarbs =
    Number.isFinite(targetCarbsGrams) && targetCarbsGrams >= 0 ? targetCarbsGrams : 0;

  return {
    targetProteinGrams: safeProtein,
    targetFatGrams: safeFat,
    targetCarbsGrams: safeCarbs,
    effectiveProteinGramsPerKg: Number((safeProtein / profile.weightKg).toFixed(2)),
    effectiveFatGramsPerKg: Number((safeFat / profile.weightKg).toFixed(2)),
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
  config: Required<EngineConfig>
): number {
  // PROFESSIONAL_REVIEW_REQUIRED: 35 ml/kg
  const baseMl = profile.weightKg * config.baseHydrationMlPerKg;

  const validFreq = Math.max(0, Math.min(7, profile.trainingFrequencyDaysPerWeek));
  const validDuration = Math.max(0, profile.averageTrainingDurationMinutes);
  const dailyTrainingHours = (validFreq * validDuration) / (7 * 60);

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

// ============================================================================
// PONTO DE ENTRADA PRINCIPAL: calculateDailyTargets
// ============================================================================

/**
 * Calcula deterministicamente os DailyTargets para um NutritionProfile.
 *
 * Função puramente funcional e determinística:
 * - Mesmos profile + config produzem exatamente os mesmos números, hash e id.
 * - Sem Math.random(), randomUUID() ou Date.now().
 * - Validação estrita do gate clínico: falha tipada para BLOCK_AUTOMATIC_TARGET e PROFESSIONAL_REFERRAL.
 *
 * @throws {NutritionEngineGateError} se o perfil for bloqueado pelo gate ético-clínico.
 */
export function calculateDailyTargets(
  profile: NutritionProfile,
  config?: EngineConfig
): DailyTargets {
  // 1. GATE CLÍNICO: Antes de calcular targets, respeitar evaluateNutritionGate(profile)
  const gateResult = evaluateNutritionGate(profile);
  if (!gateResult.allowAutomatedTargets) {
    throw new NutritionEngineGateError(gateResult);
  }

  // 2. Configuração Canônica Efetiva
  const effectiveConfig = resolveEngineConfig(config);

  // 3. Proveniência: Snapshot Canônico e SHA-256
  const snapshot = buildInputSnapshot(profile, effectiveConfig);
  const serializedSnapshot = canonicalSerialize(snapshot);
  const inputSnapshotHash = sha256Sync(serializedSnapshot);

  // 4. BMR (Mifflin-St Jeor provisório)
  const { bmrKcal, isLimitedGuidance } = computeBmr(profile, effectiveConfig);

  // 5. TDEE (PAL + Componente de Treino)
  const { tdeeKcal } = computeTdee(bmrKcal, profile, effectiveConfig);

  // 6. Balanço Calórico Seguro e Pisos Fisiológicos
  const { targetCalories, energyBalanceKcal, appliedCaloricFloor } = computeTargetCalories(
    bmrKcal,
    tdeeKcal,
    profile,
    effectiveConfig
  );

  // 7. Partição de Macronutrientes (Proteína -> Lipídios -> Carboidratos)
  const {
    targetProteinGrams,
    targetFatGrams,
    targetCarbsGrams,
    effectiveProteinGramsPerKg,
    effectiveFatGramsPerKg,
  } = computeMacros(targetCalories, profile, effectiveConfig);

  // 8. Meta Hídrica (35 ml/kg base + treino, teto 4500 ml)
  const targetWaterMl = computeHydration(profile, effectiveConfig);

  // 9. Metadados temporais e determinísticos de auditoria
  const computedAt =
    effectiveConfig.computedAtOverride && effectiveConfig.computedAtOverride.length > 0
      ? effectiveConfig.computedAtOverride
      : profile.updatedAt || '2026-09-09T00:00:00.000Z';
  const computedReason = effectiveConfig.computedReason;

  // 10. Identificador determinístico derivado do SHA-256
  const id = `dt_${inputSnapshotHash.slice(0, 16)}`;

  return {
    id,
    engineVersion: effectiveConfig.engineVersion,
    formulaVersion: effectiveConfig.formulaVersion,
    inputSnapshotHash,
    computedAt,
    computedReason,
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
  };
}
