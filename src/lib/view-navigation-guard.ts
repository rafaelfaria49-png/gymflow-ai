export interface ViewLeaveRequest<View> {
  currentView: View;
  nextView: View;
  /** Continuação idempotente: confirma exatamente a transição que foi bloqueada. */
  proceed: () => void;
}

export type ViewLeaveGuard<View> = (request: ViewLeaveRequest<View>) => boolean;

export type ViewNavigationRequestResult = 'same-view' | 'blocked' | 'navigated';

export interface ViewNavigationGuard<View> {
  register: (guard: ViewLeaveGuard<View>) => () => void;
  request: (currentView: View, nextView: View, commit: () => void) => ViewNavigationRequestResult;
  hasGuard: () => boolean;
}

/**
 * Registro transitório e central para a única tela ativa que precisa proteger saída.
 * O controller não conhece React, não persiste nada e entrega ao guard uma continuação
 * de uso único, evitando um segundo diálogo quando a saída é confirmada.
 */
export function createViewNavigationGuard<View>(): ViewNavigationGuard<View> {
  let activeGuard: ViewLeaveGuard<View> | null = null;

  return {
    register(guard) {
      activeGuard = guard;
      return () => {
        if (activeGuard === guard) activeGuard = null;
      };
    },
    request(currentView, nextView, commit) {
      if (Object.is(currentView, nextView)) return 'same-view';

      let committed = false;
      const proceed = () => {
        if (committed) return;
        committed = true;
        commit();
      };
      const allowed = activeGuard?.({ currentView, nextView, proceed }) ?? true;
      if (!allowed) return committed ? 'navigated' : 'blocked';

      proceed();
      return 'navigated';
    },
    hasGuard: () => activeGuard !== null,
  };
}

export interface BeforeUnloadTarget {
  addEventListener: (type: 'beforeunload', listener: (event: BeforeUnloadEvent) => void) => void;
  removeEventListener: (type: 'beforeunload', listener: (event: BeforeUnloadEvent) => void) => void;
}

export interface BeforeUnloadGuard {
  setDirty: (dirty: boolean) => void;
  dispose: () => void;
}

/** Mantém no máximo um listener de beforeunload e o remove ao limpar/desmontar. */
export function createBeforeUnloadGuard(target: BeforeUnloadTarget): BeforeUnloadGuard {
  let listening = false;
  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = true;
  };
  const remove = () => {
    if (!listening) return;
    target.removeEventListener('beforeunload', handleBeforeUnload);
    listening = false;
  };

  return {
    setDirty(dirty) {
      if (!dirty) {
        remove();
        return;
      }
      if (listening) return;
      target.addEventListener('beforeunload', handleBeforeUnload);
      listening = true;
    },
    dispose: remove,
  };
}
