import { describe, expect, it, vi } from 'vitest';
import {
  createBeforeUnloadGuard,
  createViewNavigationGuard,
  type BeforeUnloadTarget,
  type ViewLeaveRequest,
} from './view-navigation-guard';

describe('createViewNavigationGuard', () => {
  it('navega imediatamente quando não há guard e ignora a própria view', () => {
    const navigation = createViewNavigationGuard<string>();
    const commit = vi.fn();

    expect(navigation.request('builder', 'workouts', commit)).toBe('navigated');
    expect(navigation.request('builder', 'builder', commit)).toBe('same-view');
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('guard limpo permite navegar e não é consultado para a própria view', () => {
    const navigation = createViewNavigationGuard<string>();
    const cleanGuard = vi.fn(() => true);
    const commit = vi.fn();
    navigation.register(cleanGuard);

    expect(navigation.request('builder', 'builder', commit)).toBe('same-view');
    expect(cleanGuard).not.toHaveBeenCalled();
    expect(navigation.request('builder', 'planner', commit)).toBe('navigated');
    expect(cleanGuard).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('mantém o destino pendente e só navega quando a saída é confirmada', () => {
    const navigation = createViewNavigationGuard<string>();
    const commit = vi.fn();
    const pending: ViewLeaveRequest<string>[] = [];
    navigation.register((request) => {
      pending.push(request);
      return false;
    });

    expect(navigation.request('builder', 'dashboard', commit)).toBe('blocked');
    expect(pending[0].nextView).toBe('dashboard');
    expect(commit).not.toHaveBeenCalled();

    pending[0].proceed();
    pending[0].proceed();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('cancelar preserva a view e uma tentativa posterior recebe um novo destino', () => {
    const navigation = createViewNavigationGuard<string>();
    const commit = vi.fn();
    const pending: ViewLeaveRequest<string>[] = [];
    navigation.register((request) => {
      pending.push(request);
      return false;
    });

    navigation.request('builder', 'planner', commit);
    navigation.request('builder', 'exercises', commit);

    expect(pending.map((request) => request.nextView)).toEqual(['planner', 'exercises']);
    expect(commit).not.toHaveBeenCalled();
  });

  it('cleanup remove somente o próprio guard e remontagem não deixa registro antigo', () => {
    const navigation = createViewNavigationGuard<string>();
    const first = vi.fn(() => false);
    const second = vi.fn(() => true);
    const cleanupFirst = navigation.register(first);
    const cleanupSecond = navigation.register(second);

    cleanupFirst();
    expect(navigation.hasGuard()).toBe(true);
    navigation.request('builder', 'planner', vi.fn());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    cleanupSecond();
    expect(navigation.hasGuard()).toBe(false);
  });
});

describe('createBeforeUnloadGuard', () => {
  it('existe somente quando sujo, não duplica e é removido ao limpar', () => {
    const listeners = new Set<(event: BeforeUnloadEvent) => void>();
    const target: BeforeUnloadTarget = {
      addEventListener: vi.fn((_type, listener) => listeners.add(listener)),
      removeEventListener: vi.fn((_type, listener) => listeners.delete(listener)),
    };
    const guard = createBeforeUnloadGuard(target);

    guard.setDirty(false);
    expect(listeners.size).toBe(0);
    guard.setDirty(true);
    guard.setDirty(true);
    expect(listeners.size).toBe(1);
    expect(target.addEventListener).toHaveBeenCalledTimes(1);

    const event = { preventDefault: vi.fn(), returnValue: false } as unknown as BeforeUnloadEvent;
    listeners.forEach((listener) => listener(event));
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.returnValue).toBe(true);

    guard.setDirty(false);
    expect(listeners.size).toBe(0);
    expect(target.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('dispose remove o listener durante o cleanup sem remoção duplicada', () => {
    const target: BeforeUnloadTarget = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const guard = createBeforeUnloadGuard(target);
    guard.setDirty(true);

    guard.dispose();
    guard.dispose();
    expect(target.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
