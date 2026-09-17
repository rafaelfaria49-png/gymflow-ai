#!/usr/bin/env node
/**
 * NUT-008 — smoke controlado dos 5 casos NUT-007 via gateway GymFlow Production.
 *
 * Não chama OpenRouter diretamente. Não é carga: 5 POSTs de sucesso +
 * negativos fail-closed (estes últimos não atingem o provedor pago).
 *
 * Uso: node scripts/nutrition/nut008-production-ai-smoke.mjs
 * Opcional: NUT008_AI_GATEWAY_URL=https://host
 */

const DEFAULT_URL = 'https://gymflow-beige-gamma.vercel.app/api/nutrition/assistant';
const url = (process.env.NUT008_AI_GATEWAY_URL || DEFAULT_URL).replace(/\/+$/, '');

const context = {
  remaining: { calories: 800, protein: 60, carbs: 90, fat: 25 },
  targets: { calories: 2500, protein: 160, carbs: 300, fat: 70 },
  dietaryPattern: 'omnivore',
  goal: 'maintenance',
};

const cases = [
  {
    name: 'USE_CASE_1_complete_protein',
    body: { useCase: 'complete_protein', context, availability: { state: 'AUTOMATED' } },
  },
  {
    name: 'USE_CASE_2_substitute_food',
    body: {
      useCase: 'substitute_food',
      context,
      availability: { state: 'AUTOMATED' },
      foodReferenceId: 'br-arroz-branco-cozido',
      grams: 150,
    },
  },
  {
    name: 'USE_CASE_3_build_meal_from_ingredients',
    body: {
      useCase: 'build_meal_from_ingredients',
      context,
      availability: { state: 'AUTOMATED' },
      ingredients: ['asa de frango', 'arroz', 'brocolis'],
    },
  },
  {
    name: 'USE_CASE_4_snacks_within_balance',
    body: { useCase: 'snacks_within_balance', context, availability: { state: 'AUTOMATED' } },
  },
  {
    name: 'USE_CASE_5_explain_target_change',
    body: {
      useCase: 'explain_target_change',
      facts: {
        targetCalories: 2500,
        targetProteinGrams: 160,
        targetCarbsGrams: 300,
        targetFatGrams: 70,
        bmrKcal: 1700,
        tdeeKcal: 2600,
        energyBalanceKcal: 0,
        goal: 'maintenance',
      },
    },
  },
];

const negatives = [
  {
    name: 'NEG_MANUAL_ONLY',
    body: {
      useCase: 'complete_protein',
      context,
      availability: { state: 'MANUAL_ONLY', reason: 'PROFILE_ABSENT' },
    },
    expectStatus: 409,
  },
  {
    name: 'NEG_CLINICAL_GATE',
    body: {
      useCase: 'complete_protein',
      context,
      availability: { state: 'CLINICAL_GATE_BLOCKED', gateStatus: 'BLOCK_AUTOMATIC_TARGET' },
    },
    expectStatus: 403,
  },
];

function summarizeProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') return { useCase: null };
  const ids = [];
  if (Array.isArray(proposal.items)) {
    for (const item of proposal.items) ids.push(item.foodReferenceId);
  }
  if (Array.isArray(proposal.options)) {
    for (const option of proposal.options) {
      for (const item of option.items ?? []) ids.push(item.foodReferenceId);
    }
  }
  return {
    useCase: proposal.useCase,
    ids,
    totals: proposal.totals ?? null,
    factsEcho: proposal.facts
      ? {
          targetCalories: proposal.facts.targetCalories,
          targetProteinGrams: proposal.facts.targetProteinGrams,
        }
      : null,
    explanationLen: typeof proposal.explanationText === 'string' ? proposal.explanationText.length : 0,
  };
}

async function post(body) {
  const started = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { status: 'failure', code: 'NON_JSON', rawLen: text.length };
  }
  return { httpStatus: response.status, ms: Date.now() - started, body: parsed };
}

async function main() {
  const report = { gateway: url, at: new Date().toISOString(), cases: [], negatives: [] };
  for (const item of cases) {
    const result = await post(item.body);
    const ok = result.httpStatus === 200 && result.body && result.body.status === 'ok';
    report.cases.push({
      name: item.name,
      httpStatus: result.httpStatus,
      ms: result.ms,
      status: result.body?.status,
      code: result.body?.code ?? null,
      ok,
      summary: ok ? summarizeProposal(result.body.proposal) : result.body,
    });
  }
  for (const item of negatives) {
    const result = await post(item.body);
    report.negatives.push({
      name: item.name,
      httpStatus: result.httpStatus,
      expected: item.expectStatus,
      ok: result.httpStatus === item.expectStatus,
      code: result.body?.code ?? null,
    });
  }
  const allOk = report.cases.every((row) => row.ok) && report.negatives.every((row) => row.ok);
  report.PRODUCTION_AI_RUNTIME = allOk ? 'PASS' : 'FAIL';
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(allOk ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
});
