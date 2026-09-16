/**
 * GymFlow AI — Contratos tipados do Assistente Nutricional com IA (NUT-007)
 *
 * Assistente propositivo, controlado e grounded no FoodDatabase, sem
 * autoridade de escrita. Preserva D-NUT-01: a IA nunca calcula nem altera
 * DailyTargets — todos os números exibidos são recalculados
 * deterministicamente pelo FoodDatabase/NutritionEngine.
 *
 * Este módulo é 100% puro e read-only:
 * - lê apenas DailyTargets, DailyActuals, Remaining, perfil nutricional
 *   permitido e FoodDatabase (via callbacks/estruturas injetadas);
 * - NÃO importa nem expõe nenhum método de escrita do NutritionLedger;
 * - a inclusão no diário acontece exclusivamente pela ação explícita do
 *   usuário na UI já existente do NUT-006 (`logFoodReference`).
 *
 * Referências canônicas:
 * - docs/nutrition/GYMFLOW_NUTRITION_DECISIONS_001.md (D-NUT-01)
 * - docs/nutrition/GYMFLOW_NUTRITION_IMPLEMENTATION_GOALS_001.md (NUT-007)
 */

// ============================================================================
// CASOS CANÔNICOS
// ============================================================================

/**
 * Os 5 casos canônicos do NUT-007. Nenhum outro caso é aceito pelo gateway:
 * `isAiUseCase` rejeita qualquer valor fora desta união.
 */
export type AiUseCase =
  | 'complete_protein'
  | 'substitute_food'
  | 'build_meal_from_ingredients'
  | 'snacks_within_balance'
  | 'explain_target_change';

export const AI_USE_CASES: readonly AiUseCase[] = Object.freeze([
  'complete_protein',
  'substitute_food',
  'build_meal_from_ingredients',
  'snacks_within_balance',
  'explain_target_change',
]);

export function isAiUseCase(value: unknown): value is AiUseCase {
  return typeof value === 'string' && (AI_USE_CASES as readonly string[]).includes(value);
}

// ============================================================================
// LIMITES ESTRITOS DO GATEWAY (contrato, não preferência)
// ============================================================================

/**
 * Limites rígidos de entrada/saída do gateway. Qualquer payload que os
 * ultrapasse é rejeitado de forma tipada antes de alcançar o provedor.
 */
export const AI_ASSISTANT_LIMITS = Object.freeze({
  /** Teto de itens alimentares por proposta (opções de lanche contam à parte). */
  MAX_ITEMS_PER_PROPOSAL: 6,
  /** Teto de opções na resposta do caso `snacks_within_balance`. */
  MAX_SNACK_OPTIONS: 3,
  /** Teto de ingredientes informados no caso `build_meal_from_ingredients`. */
  MAX_INGREDIENTS: 12,
  /** Teto de candidatos FoodReference enviados ao modelo como allowlist. */
  MAX_CANDIDATE_REFERENCES: 40,
  /** Teto de caracteres do texto livre do usuário (tratado como dados). */
  MAX_USER_TEXT_CHARS: 500,
  /** Teto de caracteres do texto culinário/descritivo por item. */
  MAX_CULINARY_NOTE_CHARS: 280,
  /** Teto de caracteres do texto explicativo do modelo. */
  MAX_EXPLANATION_CHARS: 1200,
  /** Teto de bytes do corpo da requisição ao gateway. */
  MAX_REQUEST_BYTES: 16 * 1024,
  /** Teto de bytes da resposta bruta do provedor aceita pelo gateway. */
  MAX_PROVIDER_RESPONSE_BYTES: 16 * 1024,
  /** Gramagem mínima e máxima por item (fail-closed fora da faixa). */
  MIN_GRAMS_PER_ITEM: 1,
  MAX_GRAMS_PER_ITEM: 1000,
  /** Timeout padrão do gateway ao provedor (ms). */
  PROVIDER_TIMEOUT_MS: 12000,
});

// ============================================================================
// CONTEXTO NUTRICIONAL MÍNIMO (único dado enviado ao modelo)
// ============================================================================

/** Macros mínimos necessários para grounded (sem identidade, sem histórico). */
export interface AiMacroBudget {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Contexto nutricional mínimo necessário enviado ao modelo.
 *
 * PROIBIDO incluir: nome, identidade, histórico completo, loggedAt, ids de
 * ledger, hidratação, flags de saúde, biometria, timestamps. Apenas o saldo e
 * os padrões alimentares necessários para propor dentro do catálogo.
 */
export interface AiMinimalNutritionContext {
  /** Saldo restante do dia (max(0, target - actual) por nutriente). */
  remaining: AiMacroBudget;
  /** Metas do dia (autoridade exclusiva do NutritionEngine, somente leitura). */
  targets: AiMacroBudget;
  /** Padrão alimentar para filtrar candidatos (ex.: vegetarian). */
  dietaryPattern?: string;
  /** Objetivo nutricional (ex.: maintenance). Rótulo, nunca número calculado. */
  goal?: string;
}

export type AiTargetAvailability =
  | { state: 'AUTOMATED' }
  | { state: 'MANUAL_ONLY'; reason: 'PROFILE_ABSENT' | 'AUTOMATION_BLOCKED' | 'TARGET_RESOLUTION_ERROR' }
  | { state: 'CLINICAL_GATE_BLOCKED'; gateStatus: string };

// ============================================================================
// CONTRATO DE SAÍDA DO MODELO (antes do grounding)
// ============================================================================

/**
 * Item bruto retornado pelo modelo. APENAS estes campos são lidos:
 * - `foodReferenceId` existente no FoodDatabase;
 * - quantidade/porção proposta em gramas;
 * - texto culinário descritivo (exibição, nunca número).
 *
 * Qualquer outro campo vindo do modelo (calories, protein, carbs, fat,
 * targets, bmr, tdee, urls, código) é IGNORADO e nunca chega à UI.
 */
export interface AiModelRawItem {
  foodReferenceId: unknown;
  grams: unknown;
  culinaryNote?: unknown;
}

/** Resposta bruta do modelo (JSON estrito, sem ferramentas, sem URLs). */
export interface AiModelRawResponse {
  items: unknown;
  culinaryText?: unknown;
  explanationText?: unknown;
}

// ============================================================================
// PROPOSTA GROUNDED (após validação determinística)
// ============================================================================

/** Números recalculados deterministicamente via FoodDatabase (fonte de verdade). */
export interface AiGroundedNutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Item validado: ID resolvido no catálogo + números recalculados localmente. */
export interface AiGroundedItem {
  foodReferenceId: string;
  name: string;
  grams: number;
  servingDescription: string;
  /** Texto culinário descritivo do modelo, sanitizado (sem URLs/código). */
  culinaryNote: string | null;
  /** Nutrientes recalculados pelo FoodDatabase. NUNCA do modelo. */
  computed: AiGroundedNutrients;
}

/** Opção de lanche: 1..3 itens que juntos cabem no saldo. */
export interface AiSnackOption {
  items: AiGroundedItem[];
  totals: AiGroundedNutrients;
}

/** Fatos determinísticos do engine para o caso `explain_target_change`. */
export interface AiTargetChangeFacts {
  targetCalories: number;
  targetProteinGrams: number;
  targetCarbsGrams: number;
  targetFatGrams: number;
  bmrKcal: number;
  tdeeKcal: number;
  energyBalanceKcal: number;
  goal: string;
}

/** Proposta final grounded, por caso canônico. */
export type AiGroundedProposal =
  | { useCase: 'complete_protein'; items: AiGroundedItem[]; totals: AiGroundedNutrients }
  | { useCase: 'substitute_food'; items: AiGroundedItem[]; totals: AiGroundedNutrients; replacedReferenceId: string; replacedGrams: number; replacedComputed: AiGroundedNutrients; delta: AiGroundedNutrients }
  | { useCase: 'build_meal_from_ingredients'; items: AiGroundedItem[]; totals: AiGroundedNutrients; unresolvedIngredients: string[] }
  | { useCase: 'snacks_within_balance'; options: AiSnackOption[] }
  | { useCase: 'explain_target_change'; facts: AiTargetChangeFacts; explanationText: string };

// ============================================================================
// RESULTADOS TIPADOS (inclui estados da UI do modal)
// ============================================================================

/**
 * Estados obrigatórios do AiMealAssistantModal. `success` carrega a proposta
 * grounded; todos os demais são honestos e nunca fabricam números.
 */
export type AiAssistantUiState =
  | 'idle'
  | 'loading'
  | 'success'
  | 'empty'
  | 'invalid-response'
  | 'provider-unavailable'
  | 'timeout-error'
  | 'clinical-gate-blocked';

export const AI_ASSISTANT_UI_STATES: readonly AiAssistantUiState[] = Object.freeze([
  'idle',
  'loading',
  'success',
  'empty',
  'invalid-response',
  'provider-unavailable',
  'timeout-error',
  'clinical-gate-blocked',
]);

/** Códigos de falha tipados do pipeline do assistente. */
export type AiAssistantFailureCode =
  | 'MANUAL_ONLY'
  | 'CLINICAL_GATE_BLOCKED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'EMPTY_PROPOSAL'
  | 'REQUEST_TOO_LARGE'
  | 'INVALID_REQUEST';

export type AiAssistantResult =
  | { status: 'ok'; proposal: AiGroundedProposal }
  | { status: 'failure'; code: AiAssistantFailureCode; message: string };

// ============================================================================
// REQUISIÇÕES POR CASO (entrada estritamente tipada do gateway)
// ============================================================================

export interface AiCompleteProteinInput {
  useCase: 'complete_protein';
  context: AiMinimalNutritionContext;
  /**
   * Disponibilidade de targets resolvida pelo client (engine + gate).
   * O gateway recusa chamar o modelo quando diferente de AUTOMATED.
   */
  availability?: AiTargetAvailability;
  /** Texto opcional do usuário (dados, nunca instrução de sistema). */
  userText?: string;
}

export interface AiSubstituteFoodInput {
  useCase: 'substitute_food';
  context: AiMinimalNutritionContext;
  availability?: AiTargetAvailability;
  foodReferenceId: string;
  grams: number;
  userText?: string;
}

export interface AiBuildMealFromIngredientsInput {
  useCase: 'build_meal_from_ingredients';
  context: AiMinimalNutritionContext;
  availability?: AiTargetAvailability;
  ingredients: string[];
  userText?: string;
}

export interface AiSnacksWithinBalanceInput {
  useCase: 'snacks_within_balance';
  context: AiMinimalNutritionContext;
  availability?: AiTargetAvailability;
  userText?: string;
}

export interface AiExplainTargetChangeInput {
  useCase: 'explain_target_change';
  facts: AiTargetChangeFacts;
  userText?: string;
}

export type AiAssistantGatewayRequest =
  | AiCompleteProteinInput
  | AiSubstituteFoodInput
  | AiBuildMealFromIngredientsInput
  | AiSnacksWithinBalanceInput
  | AiExplainTargetChangeInput;

// ============================================================================
// ERRO TIPADO
// ============================================================================

export type AiAssistantErrorCode =
  | 'INVALID_REQUEST'
  | 'REQUEST_TOO_LARGE'
  | 'TARGETS_UNAVAILABLE'
  | 'CLINICAL_GATE_BLOCKED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_HTTP_ERROR'
  | 'INVALID_MODEL_RESPONSE'
  | 'EMPTY_PROPOSAL';

/**
 * Falha honesta e tipada do assistente. Nenhum caminho promove resposta
 * malformada, número alucinado ou ID inexistente a proposta válida.
 */
export class AiAssistantError extends Error {
  readonly code: AiAssistantErrorCode;

  constructor(code: AiAssistantErrorCode, message: string) {
    super(message);
    this.name = 'AiAssistantError';
    this.code = code;
    Object.setPrototypeOf(this, AiAssistantError.prototype);
  }
}

/**
 * Mapeia o código de erro interno para o estado honesto da UI do modal.
 * Sem números fabricados em nenhum estado de falha.
 */
export function aiFailureToUiState(code: AiAssistantFailureCode): AiAssistantUiState {
  switch (code) {
    case 'MANUAL_ONLY':
    case 'CLINICAL_GATE_BLOCKED':
      return 'clinical-gate-blocked';
    case 'PROVIDER_UNAVAILABLE':
    case 'PROVIDER_HTTP_ERROR':
      return 'provider-unavailable';
    case 'PROVIDER_TIMEOUT':
      return 'timeout-error';
    case 'INVALID_RESPONSE':
    case 'INVALID_REQUEST':
    case 'REQUEST_TOO_LARGE':
      return 'invalid-response';
    case 'EMPTY_PROPOSAL':
      return 'empty';
  }
}
