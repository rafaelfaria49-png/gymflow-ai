/**
 * GymFlow AI — Orquestração server-side do gateway do assistente (NUT-007)
 *
 * MÓDULO EXCLUSIVAMENTE SERVER-SIDE (importa o provider com a chave).
 * Nunca importado por componentes client — apenas pela Route Handler
 * `src/app/api/nutrition/assistant/route.ts`.
 *
 * Pipeline estrito por requisição:
 * 1. teto de bytes → 2. JSON válido → 3. `validateGatewayRequest` →
 * 4. `requireTargetsAvailable` (casos dependentes de Remaining; o modelo NÃO
 *    é chamado quando MANUAL_ONLY ou gate bloqueado) →
 * 5. provedor configurado? (senão AI_UNAVAILABLE honesto) →
 * 6. allowlist determinística de candidatos → 7. prompt mínimo →
 * 8. chamada OpenAI-compatible com timeout → 9. parse estrito →
 * 10. grounding no FoodDatabase + recálculo determinístico →
 * 11. proposta grounded (números locais) ou falha tipada.
 *
 * Ajuste de saldo (casos 1 e 4): itens/opções que ultrapassam o saldo
 * calórico restante são descartados; se nada couber, EMPTY honesto.
 */

import {
  buildGroundedProposal,
  buildModelPrompt,
  parseModelResponse,
  requireTargetsAvailable,
  resolveIngredients,
  selectCandidateReferences,
  sumGroundedNutrients,
  validateGatewayRequest,
} from './ai-assistant';
import {
  AI_ASSISTANT_LIMITS,
  AiAssistantError,
  type AiAssistantGatewayRequest,
  type AiAssistantResult,
  type AiGroundedProposal,
} from './ai-assistant-types';
import {
  callProviderChatCompletion,
  describeProvider,
  extractFirstChoiceText,
  isProviderConfigured,
  readProviderConfig,
} from './ai-assistant-provider';
import { FOOD_DATABASE } from './food-database';
import type { FoodReference } from './food-types';

export interface AiGatewayDeps {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  /** Timeout injetável (padrão: contrato de 12s). Existe para testes. */
  timeoutMs?: number;
}

export interface AiGatewayResponse {
  httpStatus: number;
  body: AiAssistantResult;
}

function failure(httpStatus: number, code: AiAssistantResult & { status: 'failure' }): AiGatewayResponse {
  return { httpStatus, body: code };
}

function toFailureBody(error: AiAssistantError): AiGatewayResponse {
  const message = error.message;
  switch (error.code) {
    case 'INVALID_REQUEST':
      return failure(400, { status: 'failure', code: 'INVALID_REQUEST', message });
    case 'REQUEST_TOO_LARGE':
      return failure(413, { status: 'failure', code: 'REQUEST_TOO_LARGE', message });
    case 'TARGETS_UNAVAILABLE':
      return failure(409, { status: 'failure', code: 'MANUAL_ONLY', message });
    case 'CLINICAL_GATE_BLOCKED':
      return failure(403, { status: 'failure', code: 'CLINICAL_GATE_BLOCKED', message });
    case 'PROVIDER_UNAVAILABLE':
      return failure(503, { status: 'failure', code: 'PROVIDER_UNAVAILABLE', message });
    case 'PROVIDER_TIMEOUT':
      return failure(504, { status: 'failure', code: 'PROVIDER_TIMEOUT', message });
    case 'PROVIDER_HTTP_ERROR':
      return failure(502, { status: 'failure', code: 'PROVIDER_HTTP_ERROR', message });
    case 'INVALID_MODEL_RESPONSE':
      return failure(502, { status: 'failure', code: 'INVALID_RESPONSE', message });
    case 'EMPTY_PROPOSAL':
      return failure(200, { status: 'failure', code: 'EMPTY_PROPOSAL', message });
  }
}

/**
 * Resolve um ingrediente contra o catálogo: primeira correspondência da
 * busca local (nome/brand, accent-insensitive). Sem correspondência → null
 * (nunca inventa alimento).
 */
function resolveIngredientText(text: string): FoodReference | null {
  const results = FOOD_DATABASE.search(text, { limit: 1 });
  return results.length > 0 ? results[0] : null;
}

/**
 * Executa o pipeline completo do gateway a partir do corpo bruto da
 * requisição. Função pura de I/O injetável (testável sem rede real).
 */
export async function handleAssistantGatewayRequest(
  bodyText: string,
  deps: AiGatewayDeps = {},
  externalSignal?: AbortSignal,
): Promise<AiGatewayResponse> {
  if (typeof bodyText !== 'string' || bodyText.length > AI_ASSISTANT_LIMITS.MAX_REQUEST_BYTES) {
    return failure(413, {
      status: 'failure',
      code: 'REQUEST_TOO_LARGE',
      message: `Corpo excede o teto de ${AI_ASSISTANT_LIMITS.MAX_REQUEST_BYTES} bytes do contrato.`,
    });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(bodyText.length === 0 ? 'null' : bodyText);
  } catch {
    return failure(400, {
      status: 'failure',
      code: 'INVALID_REQUEST',
      message: 'Corpo da requisição não é JSON válido.',
    });
  }

  let request: AiAssistantGatewayRequest;
  try {
    request = validateGatewayRequest(parsedBody);
  } catch (error) {
    if (error instanceof AiAssistantError) return toFailureBody(error);
    throw error;
  }

  // Casos dependentes de Remaining exigem targets válidos ANTES do modelo.
  if (request.useCase !== 'explain_target_change') {
    try {
      requireTargetsAvailable(request.availability ?? { state: 'MANUAL_ONLY', reason: 'PROFILE_ABSENT' });
    } catch (error) {
      if (error instanceof AiAssistantError) return toFailureBody(error);
      throw error;
    }
  }

  const providerConfig = readProviderConfig(deps.env);
  if (!isProviderConfigured(providerConfig)) {
    return failure(503, {
      status: 'failure',
      code: 'PROVIDER_UNAVAILABLE',
      message: `Assistente IA indisponível (${describeProvider(providerConfig)}). Sugestões determinísticas offline continuam disponíveis na aba Sugestões.`,
    });
  }

  try {
    const catalog = FOOD_DATABASE.all();
    let unresolvedIngredients: string[] = [];
    let candidates = selectCandidateReferences(
      catalog,
      request.useCase,
      request.useCase === 'explain_target_change' ? null : request.context.remaining.calories,
    );

    if (request.useCase === 'build_meal_from_ingredients') {
      const { resolved, unresolved } = resolveIngredients(request.ingredients, resolveIngredientText);
      unresolvedIngredients = unresolved;
      if (resolved.length > 0) {
        candidates = resolved.map((reference) => ({
          id: reference.id,
          name: reference.name,
          servingDescription: reference.servingDescription,
        }));
      }
    }

    const prompt = buildModelPrompt(request, candidates);
    const providerText = await callProviderChatCompletion(
      providerConfig,
      { system: prompt.system, user: prompt.user, signal: externalSignal, ...(deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }) },
      deps.fetchImpl,
    );

    let envelope: unknown;
    try {
      envelope = JSON.parse(providerText);
    } catch {
      throw new AiAssistantError('INVALID_MODEL_RESPONSE', 'Envelope do provedor não é JSON válido.');
    }
    const choiceText = extractFirstChoiceText(envelope);
    const modelResponse = parseModelResponse(choiceText);

    let proposal: AiGroundedProposal;
    if (request.useCase === 'substitute_food') {
      proposal = buildGroundedProposal({
        useCase: request.useCase,
        rawItems: modelResponse.items,
        catalog: FOOD_DATABASE,
        replaced: { foodReferenceId: request.foodReferenceId, grams: request.grams },
      });
    } else if (request.useCase === 'build_meal_from_ingredients') {
      proposal = buildGroundedProposal({
        useCase: request.useCase,
        rawItems: modelResponse.items,
        catalog: FOOD_DATABASE,
        unresolvedIngredients,
      });
    } else if (request.useCase === 'explain_target_change') {
      proposal = buildGroundedProposal({
        useCase: request.useCase,
        rawItems: modelResponse.items.length > 0 ? modelResponse.items : [],
        catalog: FOOD_DATABASE,
        facts: request.facts,
        explanationText: modelResponse.explanationText,
      });
    } else {
      proposal = buildGroundedProposal({
        useCase: request.useCase,
        rawItems: modelResponse.items,
        catalog: FOOD_DATABASE,
      });
      // Casos 1 e 4 prometem caber no saldo: descarta o que ultrapassa o
      // restante calórico (números locais recalculados, nunca do modelo).
      const remainingKcal = request.context.remaining.calories;
      if (request.useCase === 'complete_protein' && proposal.useCase === 'complete_protein') {
        const fitting = proposal.items.filter((item) => item.computed.calories <= remainingKcal + 1e-9);
        if (fitting.length === 0) {
          throw new AiAssistantError(
            'EMPTY_PROPOSAL',
            'Nenhuma proposta do modelo coube no saldo restante sem ultrapassá-lo.',
          );
        }
        proposal = { useCase: 'complete_protein', items: fitting, totals: sumGroundedNutrients(fitting) };
      }
      if (request.useCase === 'snacks_within_balance' && proposal.useCase === 'snacks_within_balance') {
        const fitting = proposal.options.filter((option) => option.totals.calories <= remainingKcal + 1e-9);
        if (fitting.length === 0) {
          throw new AiAssistantError(
            'EMPTY_PROPOSAL',
            'Nenhuma opção de lanche do modelo coube no saldo restante.',
          );
        }
        proposal = { useCase: 'snacks_within_balance', options: fitting };
      }
    }

    return { httpStatus: 200, body: { status: 'ok', proposal } };
  } catch (error) {
    if (error instanceof AiAssistantError) return toFailureBody(error);
    throw error;
  }
}
