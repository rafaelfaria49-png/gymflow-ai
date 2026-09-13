/**
 * GymFlow AI — Exclusão cross-tab do admin nutricional via Web Locks API (GOAL-089).
 *
 * Elimina o P1 final do GOAL-088 sem depender da duração do TTL: a exclusão
 * entre abas durante toda a operação administrativa vem do lock nomeado
 * canônico `gymflow:nutrition-admin-v1` (Web Locks API), e o fence IndexedDB
 * permanece apenas como defesa em profundidade + limpeza de stale (TTL).
 *
 * Modos canônicos:
 * - admin lógico (export/import/restore-inspect/restore-commit/reset-inspect/
 *   reset-commit): lock EXCLUSIVE — espera writers já iniciados e bloqueia
 *   novos writers até terminar;
 * - writes nutricionais (put/put-if-absent/mutate/active-date/marker): lock
 *   SHARED — writers seguem concorrentes entre si.
 *
 * Ordem de locks (sempre, sem caminho inverso — sem deadlock):
 *   Web Lock → fence nutricional IDB → owner-token existente.
 *
 * Sem Web Locks não há fallback para exclusão baseada somente em TTL: writes
 * nutricionais seguem funcionando, e as seis operações administrativas ficam
 * indisponíveis com a razão pública tipada
 * `nutrition-admin-lock-unavailable` (fail-closed, antes de qualquer write).
 *
 * Nenhum fallback em memória é usado como exclusão: o fake in-memory existe
 * somente em `admin-lock-fake.ts` para testes determinísticos (mesmo processo)
 * e nunca como substituto cross-tab em produção.
 */

export const NUTRITION_ADMIN_WEB_LOCK_NAME = 'gymflow:nutrition-admin-v1' as const;

/** Modo do lock para as seis operações administrativas. */
export const ADMIN_LOCK_MODE = 'exclusive' as const;
export type NutritionAdminLockMode = typeof ADMIN_LOCK_MODE;

/** Modo do lock para as cinco primitivas de escrita nutricional. */
export const NUTRITION_WRITE_LOCK_MODE = 'shared' as const;
export type NutritionWriteLockMode = typeof NUTRITION_WRITE_LOCK_MODE;

export type NutritionCrossTabLockMode =
  | NutritionAdminLockMode
  | NutritionWriteLockMode;

/**
 * Declaração explícita do GOAL-089 §7: a segurança do admin NÃO depende da
 * duração do TTL do fence. O TTL serve apenas para stale cleanup; uma
 * operação com 31s, 60s ou mais continua segura enquanto o Web Lock
 * EXCLUSIVE estiver retido.
 */
export const ADMIN_SAFETY_DEPENDS_ON_FENCE_TTL = 'NO' as const;

export const NUTRITION_ADMIN_LOCK_UNAVAILABLE_REASON = 'nutrition-admin-lock-unavailable' as const;
export type NutritionAdminLockUnavailableReason = typeof NUTRITION_ADMIN_LOCK_UNAVAILABLE_REASON;

export const NUTRITION_ADMIN_LOCK_UNAVAILABLE_MESSAGE =
  'As operações administrativas estão indisponíveis neste navegador porque '
  + 'a exclusão entre abas (Web Locks API) não está disponível. Nenhum dado foi alterado.';

export const NUTRITION_ADMIN_LOCK_UNAVAILABLE_CODE = 'NUTRITION_ADMIN_LOCK_UNAVAILABLE' as const;

/** Erro tipado quando o admin lógico exige exclusão cross-tab indisponível. */
export class NutritionAdminLockUnavailableError extends Error {
  readonly code: typeof NUTRITION_ADMIN_LOCK_UNAVAILABLE_CODE = NUTRITION_ADMIN_LOCK_UNAVAILABLE_CODE;

  constructor(message: string = NUTRITION_ADMIN_LOCK_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = 'NutritionAdminLockUnavailableError';
  }
}

export function isNutritionAdminLockUnavailableError(error: unknown): error is NutritionAdminLockUnavailableError {
  if (error instanceof NutritionAdminLockUnavailableError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Record<string, unknown>;
  return candidate['name'] === 'NutritionAdminLockUnavailableError'
    || candidate['code'] === NUTRITION_ADMIN_LOCK_UNAVAILABLE_CODE;
}

/**
 * Contrato mínimo do lock nomeado cross-tab (subconjunto da Web Locks API
 * usado pelo ledger nutricional). `navigator.locks` o implementa; os testes
 * injetam o fake determinístico de `admin-lock-fake.ts`.
 */
export interface NutritionCrossTabLockManager {
  request<T>(
    name: string,
    options: { mode: NutritionCrossTabLockMode },
    callback: () => Promise<T> | T,
  ): Promise<T>;
}

interface NavigatorWithLocks {
  locks?: NutritionCrossTabLockManager | unknown;
}

function readGlobalLockManager(): NutritionCrossTabLockManager | null {
  try {
    const navigatorValue = (globalThis as { navigator?: NavigatorWithLocks }).navigator;
    const locks = navigatorValue?.locks as Partial<NutritionCrossTabLockManager> | undefined;
    if (locks && typeof locks.request === 'function') {
      return locks as NutritionCrossTabLockManager;
    }
  } catch {
    /* ambiente sem navigator: indisponível */
  }
  return null;
}

/**
 * Resolve o gerenciador de locks cross-tab.
 *
 * - `explicit` definido (inclusive `null`) vence: `null` força indisponível
 *   (fail-closed determinístico nos testes de fallback);
 * - `undefined` detecta `navigator.locks` do ambiente em cada chamada (sem
 *   presumir disponibilidade).
 */
export function resolveNutritionCrossTabLockManager(
  explicit?: NutritionCrossTabLockManager | null,
): NutritionCrossTabLockManager | null {
  if (explicit !== undefined) return explicit;
  return readGlobalLockManager();
}

/** Capability/runtime guard testável: há exclusão cross-tab neste ambiente? */
export function isNutritionCrossTabLockAvailable(
  explicit?: NutritionCrossTabLockManager | null,
): boolean {
  return resolveNutritionCrossTabLockManager(explicit) !== null;
}
