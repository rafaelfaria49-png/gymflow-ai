/**
 * GymFlow AI — Fence administrativo nutricional durável (GOAL-087)
 *
 * Fecha o TOCTOU do GOAL-086 entre a sonda do ledger nutricional e
 * export/import/restore/reset lógico.
 *
 * O fence vive no store EXISTENTE `nutritionMetadata` (chave
 * `nutritionAdminFence`), sem novo object store e sem bump de IDB.
 * A aquisição usa transação readwrite sobre
 * `[nutritionDays, nutritionMetadata]` para serializar com os writes
 * nutricionais — que passam a consultar o fence NA MESMA transação.
 *
 * Regra canônica:
 * - writer já iniciado → termina primeiro → fence adquire depois →
 *   nova sonda vê o consumo (admin deferred);
 * - fence adquirido primeiro → próximo writer vê fence ativo →
 *   writer é bloqueado antes do put com NUTRITION_ADMIN_FENCED.
 *
 * Expiração: TTL cooperativo (default 30s). Fence expirado pode ser
 * removido pelo próximo writer ou assumido pelo próximo admin
 * (recuperação determinística — nunca lock permanente após crash).
 */

import { isStrictIsoUtcTimestamp } from './engine-validation';

export const NUTRITION_ADMIN_FENCE_KEY = 'nutritionAdminFence' as const;
export const NUTRITION_ADMIN_FENCE_VERSION = 1 as const;
export const NUTRITION_ADMIN_FENCE_TTL_MS = 30_000 as const;
export const NUTRITION_ADMIN_FENCED_CODE = 'NUTRITION_ADMIN_FENCED' as const;

export type NutritionAdminFenceOperationKind =
  | 'export'
  | 'import'
  | 'restore-inspect'
  | 'restore-commit'
  | 'reset-inspect'
  | 'reset-commit';

/**
 * Contrato tipado do fence (V1). Campos mínimos exigidos pelo GOAL-087:
 * version, fenceId, ownerId/operationId, acquiredAt, expiresAt.
 */
export interface NutritionAdminFenceV1 {
  version: typeof NUTRITION_ADMIN_FENCE_VERSION;
  fenceId: string;
  ownerId: string;
  operationId: string;
  operationKind: NutritionAdminFenceOperationKind;
  acquiredAt: string;
  expiresAt: string;
}

const FENCE_KINDS: readonly NutritionAdminFenceOperationKind[] = [
  'export',
  'import',
  'restore-inspect',
  'restore-commit',
  'reset-inspect',
  'reset-commit',
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isNutritionAdminFenceV1(value: unknown): value is NutritionAdminFenceV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate['version'] !== NUTRITION_ADMIN_FENCE_VERSION) return false;
  if (!isNonEmptyString(candidate['fenceId'])) return false;
  if (!isNonEmptyString(candidate['ownerId'])) return false;
  if (!isNonEmptyString(candidate['operationId'])) return false;
  if (typeof candidate['operationKind'] !== 'string') return false;
  if (!(FENCE_KINDS as readonly string[]).includes(candidate['operationKind'] as string)) return false;
  if (!isStrictIsoUtcTimestamp(candidate['acquiredAt'])) return false;
  if (!isStrictIsoUtcTimestamp(candidate['expiresAt'])) return false;
  // acquiredAt <= expiresAt (fence com TTL não-positivo é válido — nasce
  // expirado e serve à recuperação determinística dos testes).
  if ((candidate['acquiredAt'] as string) > (candidate['expiresAt'] as string)) {
    // TTL negativo ainda é um fence bem-formado (expirado). Só rejeitar se
    // as strings forem inválidas (já validadas acima). Permitir.
  }
  return true;
}

/** Fence ativo = bem-formado e com expiresAt no futuro (estrito). */
export function isNutritionAdminFenceExpired(
  fence: NutritionAdminFenceV1,
  nowMs?: number,
): boolean {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const expiresMs = Date.parse(fence.expiresAt);
  if (!Number.isFinite(expiresMs)) return true;
  return expiresMs <= now;
}

export function isNutritionAdminFenceActive(
  fence: NutritionAdminFenceV1 | null | undefined,
  nowMs?: number,
): fence is NutritionAdminFenceV1 {
  if (!fence || !isNutritionAdminFenceV1(fence)) return false;
  return !isNutritionAdminFenceExpired(fence, nowMs);
}

/** Erro tipado do writer bloqueado pelo fence (GOAL-087 §6). */
export class NutritionAdminFencedError extends Error {
  readonly code: typeof NUTRITION_ADMIN_FENCED_CODE = NUTRITION_ADMIN_FENCED_CODE;
  readonly fenceId: string | null;
  readonly operationKind: string | null;

  constructor(message: string, options: { fenceId?: string | null; operationKind?: string | null; cause?: unknown } = {}) {
    super(message, 'cause' in options && options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'NutritionAdminFencedError';
    this.fenceId = options.fenceId ?? null;
    this.operationKind = options.operationKind ?? null;
  }
}

export function isNutritionAdminFencedError(error: unknown): error is NutritionAdminFencedError {
  if (error instanceof NutritionAdminFencedError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Record<string, unknown>;
  return candidate['name'] === 'NutritionAdminFencedError'
    || candidate['code'] === NUTRITION_ADMIN_FENCED_CODE;
}

export function newNutritionAdminFenceId(): string {
  try {
    const uuid = (globalThis.crypto as { randomUUID?: () => string } | undefined)?.randomUUID;
    if (typeof uuid === 'function') return `nut-admin-fence-${uuid.call(globalThis.crypto)}`;
  } catch {
    /* fallback abaixo */
  }
  return `nut-admin-fence-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export interface BuildNutritionAdminFenceInput {
  fenceId?: string;
  ownerId: string;
  operationId: string;
  operationKind: NutritionAdminFenceOperationKind;
  now?: Date;
  ttlMs?: number;
}

export function buildNutritionAdminFenceV1(input: BuildNutritionAdminFenceInput): NutritionAdminFenceV1 {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? NUTRITION_ADMIN_FENCE_TTL_MS;
  const acquiredAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  return {
    version: NUTRITION_ADMIN_FENCE_VERSION,
    fenceId: input.fenceId ?? newNutritionAdminFenceId(),
    ownerId: input.ownerId,
    operationId: input.operationId,
    operationKind: input.operationKind,
    acquiredAt,
    expiresAt,
  };
}
