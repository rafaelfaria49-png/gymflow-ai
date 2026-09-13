/**
 * GymFlow AI — Fake determinístico do lock cross-tab nutricional (GOAL-089).
 *
 * SOMENTE PARA TESTES. Este gerenciador é in-memory (mesmo processo) e NÃO
 * é exclusão cross-tab real: nunca usá-lo como fallback em produção quando
 * `navigator.locks` estiver indisponível (o admin falha fechado nesse caso).
 *
 * Semântica (espelha a Web Locks API no essencial):
 * - vários holders SHARED simultâneos são permitidos;
 * - EXCLUSIVE espera todos os SHARED ativos e bloqueia novos SHARED;
 * - ordem FIFO: um SHARED atrás de um EXCLUSIVE na fila espera (sem
 *   ultrapassagem que cause starvation do admin);
 * - a concessão é marcada de forma síncrona no momento do `request`, então a
 *   ordem de chamada no mesmo tick define a ordem da fila (determinístico);
 * - o lock é sempre liberado em `finally`, inclusive quando o callback lança.
 */

import type {
  NutritionCrossTabLockManager,
  NutritionCrossTabLockMode,
} from './admin-lock';

interface FakeLockTicket {
  mode: NutritionCrossTabLockMode;
  grant: () => void;
}

interface FakeLockNameState {
  shared: number;
  exclusive: boolean;
  queue: FakeLockTicket[];
}

export interface FakeNutritionCrossTabLockManager extends NutritionCrossTabLockManager {
  /** Tickets aguardando concessão para o nome (fila FIFO). */
  pendingCount(name: string): number;
  /** Há algum holder (shared ou exclusive) para o nome? */
  isHeld(name: string): boolean;
  /** Quantos holders shared ativos para o nome. */
  heldSharedCount(name: string): number;
  /** Há holder exclusive ativo para o nome. */
  hasExclusiveHolder(name: string): boolean;
}

function isCompatibleWithActive(state: FakeLockNameState, mode: NutritionCrossTabLockMode): boolean {
  if (mode === 'exclusive') return !state.exclusive && state.shared === 0;
  return !state.exclusive;
}

function hold(state: FakeLockNameState, mode: NutritionCrossTabLockMode): void {
  if (mode === 'exclusive') state.exclusive = true;
  else state.shared += 1;
}

function unhold(state: FakeLockNameState, mode: NutritionCrossTabLockMode): void {
  if (mode === 'exclusive') state.exclusive = false;
  else state.shared = Math.max(0, state.shared - 1);
}

export function createFakeNutritionCrossTabLockManager(): FakeNutritionCrossTabLockManager {
  const states = new Map<string, FakeLockNameState>();

  const stateFor = (name: string): FakeLockNameState => {
    let state = states.get(name);
    if (!state) {
      state = { shared: 0, exclusive: false, queue: [] };
      states.set(name, state);
    }
    return state;
  };

  const pumpQueue = (state: FakeLockNameState): void => {
    while (state.queue.length > 0) {
      const head = state.queue[0];
      if (!isCompatibleWithActive(state, head.mode)) break;
      state.queue.shift();
      hold(state, head.mode);
      head.grant();
    }
  };

  const acquire = (name: string, mode: NutritionCrossTabLockMode): Promise<void> => {
    const state = stateFor(name);
    if (state.queue.length === 0 && isCompatibleWithActive(state, mode)) {
      hold(state, mode);
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      state.queue.push({ mode, grant: resolve });
    });
  };

  const release = (name: string, mode: NutritionCrossTabLockMode): void => {
    const state = stateFor(name);
    unhold(state, mode);
    pumpQueue(state);
  };

  return {
    async request<T>(
      name: string,
      options: { mode: NutritionCrossTabLockMode },
      callback: () => Promise<T> | T,
    ): Promise<T> {
      const mode = options?.mode ?? 'exclusive';
      await acquire(name, mode);
      try {
        return await callback();
      } finally {
        release(name, mode);
      }
    },
    pendingCount(name: string): number {
      return stateFor(name).queue.length;
    },
    isHeld(name: string): boolean {
      const state = stateFor(name);
      return state.exclusive || state.shared > 0;
    },
    heldSharedCount(name: string): number {
      return stateFor(name).shared;
    },
    hasExclusiveHolder(name: string): boolean {
      return stateFor(name).exclusive;
    },
  };
}

/** Deferred manual para cenários "admin pendente" sem sleep real. */
export function createDeferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
// Harness global para testes do Provider/adapter (somente testes).
//
// O adapter resolve `navigator.locks` a cada uso. Estes helpers instalam o
// fake determinístico no `navigator` global (simulando um navegador com
// Web Locks) e o removem depois — sem eles, em Node, o admin lógico falha
// fechado com `nutrition-admin-lock-unavailable` (comportamento correto do
// fallback, provado nos testes de fallback).
// ---------------------------------------------------------------------------

interface FakeLocksInstallation {
  fake: FakeNutritionCrossTabLockManager;
  navigatorTarget: object | null;
  previousLocksDescriptor: PropertyDescriptor | undefined;
  createdNavigator: boolean;
}

let activeInstallation: FakeLocksInstallation | null = null;

/**
 * Instala o fake determinístico como `navigator.locks` global e devolve a
 * instância (para asserções de fila/holders). Chamar uma vez por teste no
 * `beforeEach`; desfazer com `restoreFakeNutritionCrossTabLocks()`.
 */
export function installFakeNutritionCrossTabLocks(): FakeNutritionCrossTabLockManager {
  if (activeInstallation) {
    throw new Error('Fake de Web Locks já instalado (restore pendente).');
  }
  const fake = createFakeNutritionCrossTabLockManager();
  const holder = globalThis as Record<string, unknown>;
  const existingNavigator = holder['navigator'];
  if (existingNavigator !== null && typeof existingNavigator === 'object') {
    const target = existingNavigator as object;
    const previousLocksDescriptor = Reflect.getOwnPropertyDescriptor(target, 'locks');
    Reflect.defineProperty(target, 'locks', {
      value: fake,
      configurable: true,
      writable: true,
    });
    activeInstallation = { fake, navigatorTarget: target, previousLocksDescriptor, createdNavigator: false };
  } else {
    Reflect.defineProperty(holder, 'navigator', {
      value: { locks: fake },
      configurable: true,
      writable: true,
    });
    activeInstallation = { fake, navigatorTarget: null, previousLocksDescriptor: undefined, createdNavigator: true };
  }
  return fake;
}

/** Remove o fake global instalado por `installFakeNutritionCrossTabLocks()`. */
export function restoreFakeNutritionCrossTabLocks(): void {
  const installation = activeInstallation;
  activeInstallation = null;
  if (!installation) return;
  try {
    if (installation.createdNavigator) {
      Reflect.deleteProperty(globalThis as Record<string, unknown>, 'navigator');
    } else if (installation.navigatorTarget) {
      if (installation.previousLocksDescriptor) {
        Reflect.defineProperty(installation.navigatorTarget, 'locks', installation.previousLocksDescriptor);
      } else {
        Reflect.deleteProperty(installation.navigatorTarget as Record<string, unknown>, 'locks');
      }
    }
  } catch {
    /* melhor esforço em teardown */
  }
}

// ---------------------------------------------------------------------------
// Supressão total da Web Locks (somente testes de fallback).
//
// Sombreia `navigator.locks` com `undefined` (inclusive quando o ambiente tem
// Web Locks nativa, como o Node 24), provando o fail-closed:
// ADMIN_WITHOUT_WEB_LOCK = BLOCKED_FAIL_CLOSED.
// ---------------------------------------------------------------------------

interface SuppressedLocksState {
  navigatorTarget: object | null;
  previousLocksDescriptor: PropertyDescriptor | undefined;
  createdNavigator: boolean;
}

let suppressedState: SuppressedLocksState | null = null;

/** Suprime qualquer Web Locks global (fake ou nativa) até `restoreGlobalWebLocksAfterTest()`. */
export function suppressGlobalWebLocksForTest(): void {
  if (activeInstallation) {
    throw new Error('Fake de Web Locks instalado — restaurar antes de suprimir.');
  }
  if (suppressedState) {
    throw new Error('Web Locks já suprimida (restore pendente).');
  }
  const holder = globalThis as Record<string, unknown>;
  const existingNavigator = holder['navigator'];
  if (existingNavigator !== null && typeof existingNavigator === 'object') {
    const target = existingNavigator as object;
    const previousLocksDescriptor = Reflect.getOwnPropertyDescriptor(target, 'locks');
    Reflect.defineProperty(target, 'locks', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    suppressedState = { navigatorTarget: target, previousLocksDescriptor, createdNavigator: false };
  } else {
    Reflect.defineProperty(holder, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });
    suppressedState = { navigatorTarget: null, previousLocksDescriptor: undefined, createdNavigator: true };
  }
}

/** Restaura a Web Locks global após `suppressGlobalWebLocksForTest()`. */
export function restoreGlobalWebLocksAfterTest(): void {
  const state = suppressedState;
  suppressedState = null;
  if (!state) return;
  try {
    if (state.createdNavigator) {
      Reflect.deleteProperty(globalThis as Record<string, unknown>, 'navigator');
    } else if (state.navigatorTarget) {
      if (state.previousLocksDescriptor) {
        Reflect.defineProperty(state.navigatorTarget, 'locks', state.previousLocksDescriptor);
      } else {
        Reflect.deleteProperty(state.navigatorTarget as Record<string, unknown>, 'locks');
      }
    }
  } catch {
    /* melhor esforço em teardown */
  }
}
