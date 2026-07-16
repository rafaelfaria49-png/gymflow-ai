import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const ITERATIONS = 1000;
const fixtureNames = [
  'gymflow-state-v1-basic.json',
  'gymflow-state-v1-active-workout.json',
  'gymflow-state-v1-heavy-usage.json',
];

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const arrayFields = [
  'weeklyPlan',
  'customPrograms',
  'workoutHistory',
  'weightHistory',
  'measurementsHistory',
  'achievements',
  'challenges',
  'favoriteExercises',
  'recentlyViewedVideoIds',
];

function validateEnvelope(value) {
  if (!isRecord(value) || value.v !== 1) return false;
  if (typeof value.savedAt !== 'string' || Number.isNaN(Date.parse(value.savedAt))) return false;
  if (!isRecord(value.data)) return false;
  for (const field of arrayFields) {
    if (field in value.data && !Array.isArray(value.data[field])) return false;
  }
  return true;
}

function quantile(samples, ratio) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function measure(operation) {
  const samples = [];
  for (let index = 0; index < ITERATIONS; index += 1) {
    const start = performance.now();
    operation();
    samples.push(performance.now() - start);
  }
  return {
    medianMs: quantile(samples, 0.5),
    p95Ms: quantile(samples, 0.95),
  };
}

const results = fixtureNames.map((name) => {
  const filePath = path.join(process.cwd(), 'docs', 'audit', 'fixtures', name);
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const storage = new Map();

  const stringify = measure(() => JSON.stringify(parsed));
  const parse = measure(() => JSON.parse(raw));
  const validation = measure(() => {
    if (!validateEnvelope(parsed)) throw new Error(`Fixture inválida: ${name}`);
  });
  const saveReadback = measure(() => {
    const serialized = JSON.stringify(parsed);
    const current = storage.get('gymflow:state:v1');
    if (current) {
      const currentEnvelope = JSON.parse(current);
      if (validateEnvelope(currentEnvelope)) storage.set('gymflow:state:v1:backup', current);
    }
    storage.set('gymflow:state:v1', serialized);
    const readback = storage.get('gymflow:state:v1');
    if (readback !== serialized || !validateEnvelope(JSON.parse(readback))) {
      throw new Error(`Readback divergente: ${name}`);
    }
  });

  return {
    fixture: name.replace('gymflow-state-v1-', '').replace('.json', ''),
    bytes: Buffer.byteLength(raw, 'utf8'),
    stringifyMedianMs: stringify.medianMs,
    stringifyP95Ms: stringify.p95Ms,
    parseMedianMs: parse.medianMs,
    parseP95Ms: parse.p95Ms,
    validationMedianMs: validation.medianMs,
    validationP95Ms: validation.p95Ms,
    saveReadbackMedianMs: saveReadback.medianMs,
    saveReadbackP95Ms: saveReadback.p95Ms,
  };
});

const formatted = results.map((result) => ({
  fixture: result.fixture,
  bytes: result.bytes,
  stringify_mediana_ms: result.stringifyMedianMs.toFixed(4),
  stringify_p95_ms: result.stringifyP95Ms.toFixed(4),
  parse_mediana_ms: result.parseMedianMs.toFixed(4),
  parse_p95_ms: result.parseP95Ms.toFixed(4),
  validacao_mediana_ms: result.validationMedianMs.toFixed(4),
  validacao_p95_ms: result.validationP95Ms.toFixed(4),
  save_readback_mediana_ms: result.saveReadbackMedianMs.toFixed(4),
  save_readback_p95_ms: result.saveReadbackP95Ms.toFixed(4),
}));

console.log(`GymFlow storage benchmark — ${ITERATIONS} iterações por operação`);
console.table(formatted);
console.log('Decisão: localStorage continua aceitável no GOAL-17A.');
console.log('Particionamento imediato: não há evidência de necessidade nas três fixtures.');
console.log('IndexedDB: reavaliar no GOAL-17B, depois de o schema estabilizar no GOAL-23A.');
