/**
 * GymFlow AI — Readiness determinística dos harnesses NUT-004B (GOAL-091).
 *
 * TEST-ONLY: importado exclusivamente por `*.test.tsx` do Provider nutricional.
 * Nenhum código produtivo importa este módulo (verificado por grep em CI local).
 *
 * Substitui os sleeps fixos (`setTimeout(100)` como readiness, `setTimeout(25)`
 * como settle genérico) por sincronização baseada em condição observável real:
 * - `waitForCondition`: polling curto (10ms) com timeout total explícito (5s),
 *   sempre com timers reais (os harnesses só fakam `Date`, nunca `setTimeout`).
 * - Cada iteração roda dentro de `act()` para drenar effects do StrictMode
 *   (double effects tolerados, nunca removidos).
 *
 * Sinais de prontidão usados pelos harnesses (todos já observáveis no contexto
 * público, sem nova API de produção):
 * - `storageHealth.status !== 'loading'`: hidratação assentada (ready, blocked
 *   ou write-error). É setado por último em `hydrateStorage`, depois do bridge
 *   (ou do fail-closed do boot) — portanto prova que o cold boot foi tentado,
 *   sem sleep fixo. Cobre inclusive o P3 com classificação blocked.
 * - `storageHealth.status === 'ready'` + `storageMode === 'hybrid-v2'`:
 *   runtime admin pronto (exigido pelos testes de gate/fence/lock que exercem
 *   operações admin com ledger ativo/vazio).
 * - Espelhos por cenário (ex.: `nutrition.calories === 1850`): aplicados no
 *   próprio harness via `waitForCondition`, nunca via sleep.
 */

import { act } from 'react-test-renderer';

export interface WaitForConditionOptions {
  /** Timeout total explícito em ms. Default 5000 (bem abaixo do testTimeout 15000). */
  timeoutMs?: number;
  /** Polling curto somente no teste. Default 10. */
  intervalMs?: number;
  /** Rótulo para mensagem de timeout (diagnóstico, sem vazar segredo). */
  label?: string;
}

/**
 * Aguarda até `predicate()` retornar true (ou resolver true).
 * Lança após `timeoutMs` — falha fechada, nunca retry-until-green silencioso.
 */
export async function waitForCondition(
  predicate: () => boolean | Promise<boolean>,
  options: WaitForConditionOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 10;
  const label = options.label ?? 'condition';
  const start = Date.now();
  for (;;) {
    let ok = false;
    try {
      ok = await predicate();
    } catch {
      ok = false;
    }
    if (ok) return;
    if (Date.now() - start >= timeoutMs) {
      throw new Error(`waitForCondition timeout (${timeoutMs}ms): ${label}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    });
  }
}

export interface ProviderReadinessProbe {
  storageHealth?: { status?: string };
  storageMode?: string;
}

/**
 * Prontidão universal do Provider nutricional: hidratação assentada
 * (status !== 'loading'). Prova cold boot tentado (bridge ou fail-closed),
 * sem sleep fixo. StrictMode preservado (espera a prontidão final).
 */
export async function waitForProviderHydrated(
  get: () => ProviderReadinessProbe,
  options: WaitForConditionOptions = {},
): Promise<void> {
  await waitForCondition(
    () => {
      const status = get().storageHealth?.status;
      return status === 'ready' || status === 'blocked' || status === 'write-error';
    },
    {
      ...options,
      label: options.label ?? 'provider-hydrated(settled)',
    },
  );
}

/**
 * Prontidão admin: hidratação + runtime hybrid-v2 (fence/locks operacionais).
 */
export async function waitForProviderAdminReady(
  get: () => ProviderReadinessProbe,
  options: WaitForConditionOptions = {},
): Promise<void> {
  await waitForCondition(
    () => get().storageHealth?.status === 'ready' && get().storageMode === 'hybrid-v2',
    { ...options, label: options.label ?? 'provider-admin-ready(ready+hybrid-v2)' },
  );
}
