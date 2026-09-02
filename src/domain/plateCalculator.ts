/**
 * Calculadora de carga para barras e máquinas carregadas com discos.
 *
 * A carga recebida e devolvida é a carga TOTAL (barra + dois lados). Os pares
 * representam o peso de UMA anilha em cada lado, por isso a soma é espelhada.
 * O algoritmo escolhe a carga alcançável mais próxima e, em empate, a menor
 * quantidade de anilhas e a menor carga — uma decisão conservadora para uma
 * recomendação de aproximação.
 */

export const DEFAULT_BAR_WEIGHT_KG = 20;
export const DEFAULT_AVAILABLE_PLATE_PAIRS_KG: readonly number[] = Object.freeze([
  1.25,
  2.5,
  5,
  10,
  15,
  20,
  25,
]);

export interface PlateCalculatorConfig {
  barWeightKg?: number;
  availablePairsKg?: readonly number[];
}

export interface PlateLoadout {
  requestedWeightKg: number;
  barWeightKg: number;
  loadedWeightKg: number;
  sideWeightKg: number;
  platesPerSideKg: number[];
  availablePairsKg: number[];
  exact: boolean;
  differenceKg: number;
}

interface PlateProfileLike {
  barWeightKg?: unknown;
  availablePairsKg?: unknown;
  availablePlatePairsKg?: unknown;
  platePairsKg?: unknown;
  plateCalculator?: unknown;
}

function finitePositive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function roundKg(value: number): number {
  return Math.round(value * 100) / 100;
}

function toCents(value: number): number {
  return Math.max(0, Math.round(value * 100));
}

function fromCents(value: number): number {
  return value / 100;
}

function normalizedPairs(config: PlateCalculatorConfig = {}): number[] {
  const source = config.availablePairsKg ?? DEFAULT_AVAILABLE_PLATE_PAIRS_KG;
  const pairs = source
    .map(finitePositive)
    .filter((value): value is number => value !== undefined)
    .map(roundKg);
  return [...new Set(pairs)].sort((left, right) => right - left);
}

/**
 * Lê a configuração opcional do GymProfile sem acoplar o domínio à persistência.
 * Os aliases mantêm compatibilidade com perfis criados durante a evolução do
 * GOAL-32 (`availablePlatePairsKg`/`platePairsKg`).
 */
export function getPlateCalculatorConfig(profile: unknown): Required<PlateCalculatorConfig> {
  const candidate = (profile && typeof profile === 'object' ? profile : {}) as PlateProfileLike;
  const nested = candidate.plateCalculator && typeof candidate.plateCalculator === 'object'
    ? candidate.plateCalculator as PlateProfileLike
    : {};
  const barWeightKg = finitePositive(candidate.barWeightKg)
    ?? finitePositive(nested.barWeightKg)
    ?? DEFAULT_BAR_WEIGHT_KG;
  const rawPairs = candidate.availablePairsKg
    ?? candidate.availablePlatePairsKg
    ?? candidate.platePairsKg
    ?? nested.availablePairsKg
    ?? nested.availablePlatePairsKg
    ?? nested.platePairsKg;
  const availablePairsKg = normalizedPairs({
    barWeightKg,
    ...(Array.isArray(rawPairs) ? { availablePairsKg: rawPairs as number[] } : {}),
  });
  return { barWeightKg, availablePairsKg };
}

interface Candidate {
  sideCents: number;
  plateCount: number;
  plates: number[];
}

function compareCandidates(left: Candidate, right: Candidate, targetSideCents: number): number {
  const leftDistance = Math.abs(left.sideCents - targetSideCents);
  const rightDistance = Math.abs(right.sideCents - targetSideCents);
  if (leftDistance !== rightDistance) return leftDistance - rightDistance;
  if (left.plateCount !== right.plateCount) return left.plateCount - right.plateCount;
  return left.sideCents - right.sideCents;
}

/**
 * Calcula os pares necessários para uma carga total.
 *
 * Ex.: 67,5 kg com a configuração padrão retorna 23,75 kg por lado:
 * 20 + 2,5 + 1,25 kg em cada lado.
 */
export function calculatePlateLoad(
  requestedWeightKg: number,
  config: PlateCalculatorConfig = {},
): PlateLoadout {
  const requested = Number.isFinite(requestedWeightKg) ? Math.max(0, requestedWeightKg) : 0;
  const barWeightKg = finitePositive(config.barWeightKg) ?? DEFAULT_BAR_WEIGHT_KG;
  const availablePairsKg = normalizedPairs(config);
  const requestedWithBar = Math.max(barWeightKg, requested);
  const targetSideCents = toCents(Math.max(0, (requestedWithBar - barWeightKg) / 2));

  if (targetSideCents === 0 || availablePairsKg.length === 0) {
    const loadedWeightKg = roundKg(barWeightKg);
    return {
      requestedWeightKg: roundKg(requested),
      barWeightKg: roundKg(barWeightKg),
      loadedWeightKg,
      sideWeightKg: 0,
      platesPerSideKg: [],
      availablePairsKg,
      exact: requestedWithBar === barWeightKg,
      differenceKg: roundKg(loadedWeightKg - requested),
    };
  }

  // Uma unidade mínima acima do alvo é suficiente para escolher o vizinho mais
  // próximo: qualquer soma adicional usa ao menos a menor anilha disponível.
  const smallestPairCents = Math.min(...availablePairsKg.map(toCents));
  const maxSideCents = targetSideCents + smallestPairCents;
  const bestBySide = new Array<Candidate | undefined>(maxSideCents + 1);
  bestBySide[0] = { sideCents: 0, plateCount: 0, plates: [] };

  for (let sideCents = 0; sideCents <= maxSideCents; sideCents += 1) {
    const current = bestBySide[sideCents];
    if (!current) continue;
    for (const pair of availablePairsKg) {
      const plateCents = toCents(pair);
      const nextSideCents = sideCents + plateCents;
      if (nextSideCents > maxSideCents) continue;
      const next: Candidate = {
        sideCents: nextSideCents,
        plateCount: current.plateCount + 1,
        plates: [...current.plates, pair],
      };
      const previous = bestBySide[nextSideCents];
      if (!previous || next.plateCount < previous.plateCount) bestBySide[nextSideCents] = next;
    }
  }

  const candidates = bestBySide.filter((candidate): candidate is Candidate => Boolean(candidate));
  const best = candidates.reduce((winner, candidate) => (
    compareCandidates(candidate, winner, targetSideCents) < 0 ? candidate : winner
  ));
  const sideWeightKg = fromCents(best.sideCents);
  const loadedWeightKg = roundKg(barWeightKg + sideWeightKg * 2);

  return {
    requestedWeightKg: roundKg(requested),
    barWeightKg: roundKg(barWeightKg),
    loadedWeightKg,
    sideWeightKg: roundKg(sideWeightKg),
    platesPerSideKg: [...best.plates].sort((left, right) => right - left),
    availablePairsKg,
    exact: Math.abs(loadedWeightKg - requested) < 0.001,
    differenceKg: roundKg(loadedWeightKg - requested),
  };
}

export const calculatePlates = calculatePlateLoad;
