import { describe, it, expect, vi } from 'vitest';
import {
  BackActionRegistry,
  resolveBackNavigationPolicy,
  type BackNavigationPolicyInput,
} from './back-navigation';

describe('BackActionRegistry', () => {
  it('registers and executes handlers in LIFO order for equal priority', () => {
    const registry = new BackActionRegistry();
    const calls: string[] = [];

    const unreg1 = registry.register(() => {
      calls.push('first');
      return false;
    });

    const unreg2 = registry.register(() => {
      calls.push('second');
      return true; // handled
    });

    const handled = registry.dispatch();
    expect(handled).toBe(true);
    expect(calls).toEqual(['second']);

    unreg1();
    unreg2();
  });

  it('respects higher priority handlers before lower priority', () => {
    const registry = new BackActionRegistry();
    const calls: string[] = [];

    registry.register(() => {
      calls.push('normal-priority');
      return true;
    }, 10);

    registry.register(() => {
      calls.push('high-priority');
      return true;
    }, 50);

    const handled = registry.dispatch();
    expect(handled).toBe(true);
    expect(calls).toEqual(['high-priority']);
  });

  it('stops at the first handler that returns true', () => {
    const registry = new BackActionRegistry();
    const first = vi.fn().mockReturnValue(false);
    const second = vi.fn().mockReturnValue(true);
    const third = vi.fn().mockReturnValue(true);

    registry.register(third, 10);
    registry.register(second, 20);
    registry.register(first, 30);

    const handled = registry.dispatch();
    expect(handled).toBe(true);
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
    expect(third).not.toHaveBeenCalled();
  });

  it('unregisters cleanly via returned cleanup function', () => {
    const registry = new BackActionRegistry();
    const cleanup = registry.register(() => true);
    expect(registry.hasHandlers()).toBe(true);

    cleanup();
    expect(registry.hasHandlers()).toBe(false);
    expect(registry.dispatch()).toBe(false);
  });
});

describe('resolveBackNavigationPolicy', () => {
  describe('Logged Out User', () => {
    it('navigates from login to landing', () => {
      const input: BackNavigationPolicyInput = {
        currentView: 'login',
        isLoggedIn: false,
        hasActiveWorkout: false,
        history: ['landing'],
      };
      const decision = resolveBackNavigationPolicy(input);
      expect(decision).toEqual({
        type: 'navigate',
        targetView: 'landing',
        remainingHistory: [],
      });
    });

    it('navigates from onboarding to landing', () => {
      const input: BackNavigationPolicyInput = {
        currentView: 'onboarding',
        isLoggedIn: false,
        hasActiveWorkout: false,
        history: [],
      };
      const decision = resolveBackNavigationPolicy(input);
      expect(decision).toEqual({
        type: 'navigate',
        targetView: 'landing',
        remainingHistory: [],
      });
    });

    it('allows exit-app when already at landing', () => {
      const input: BackNavigationPolicyInput = {
        currentView: 'landing',
        isLoggedIn: false,
        hasActiveWorkout: false,
        history: [],
      };
      const decision = resolveBackNavigationPolicy(input);
      expect(decision).toEqual({ type: 'exit-app' });
    });
  });

  describe('Logged In User - Workout Builder', () => {
    it('returns to builderReturnView if provided', () => {
      const input: BackNavigationPolicyInput = {
        currentView: 'workout-builder',
        isLoggedIn: true,
        hasActiveWorkout: false,
        history: ['dashboard', 'workouts'],
        builderReturnView: 'workouts',
      };
      const decision = resolveBackNavigationPolicy(input);
      expect(decision).toEqual({
        type: 'navigate',
        targetView: 'workouts',
        remainingHistory: ['dashboard', 'workouts'],
      });
    });

    it('defaults to planner when no builderReturnView is defined', () => {
      const input: BackNavigationPolicyInput = {
        currentView: 'workout-builder',
        isLoggedIn: true,
        hasActiveWorkout: false,
        history: ['dashboard'],
      };
      const decision = resolveBackNavigationPolicy(input);
      expect(decision).toEqual({
        type: 'navigate',
        targetView: 'planner',
        remainingHistory: ['dashboard'],
      });
    });
  });

  describe('Logged In User - Active Workout Protection', () => {
    it('returns to dashboard from active-workout preserving the session', () => {
      const input: BackNavigationPolicyInput = {
        currentView: 'active-workout',
        isLoggedIn: true,
        hasActiveWorkout: true,
        history: ['dashboard'],
      };
      const decision = resolveBackNavigationPolicy(input);
      expect(decision).toEqual({
        type: 'navigate',
        targetView: 'dashboard',
        remainingHistory: ['dashboard'],
      });
    });

    it('prevents silent exit on dashboard when a workout is in progress', () => {
      const input: BackNavigationPolicyInput = {
        currentView: 'dashboard',
        isLoggedIn: true,
        hasActiveWorkout: true,
        history: [],
      };
      const decision = resolveBackNavigationPolicy(input);
      expect(decision).toEqual({
        type: 'protect-active-workout',
        targetView: 'active-workout',
        reason: 'workout-in-progress',
      });
    });
  });

  describe('Logged In User - Internal Navigation & Root Exit', () => {
    it('navigates back to previous view in history', () => {
      const input: BackNavigationPolicyInput = {
        currentView: 'videos',
        isLoggedIn: true,
        hasActiveWorkout: false,
        history: ['dashboard', 'exercises'],
      };
      const decision = resolveBackNavigationPolicy(input);
      expect(decision).toEqual({
        type: 'navigate',
        targetView: 'exercises',
        remainingHistory: ['dashboard'],
      });
    });

    it('falls back to dashboard when history is empty', () => {
      const input: BackNavigationPolicyInput = {
        currentView: 'evolution',
        isLoggedIn: true,
        hasActiveWorkout: false,
        history: [],
      };
      const decision = resolveBackNavigationPolicy(input);
      expect(decision).toEqual({
        type: 'navigate',
        targetView: 'dashboard',
        remainingHistory: [],
      });
    });

    it('allows exit-app when on dashboard with no active workout', () => {
      const input: BackNavigationPolicyInput = {
        currentView: 'dashboard',
        isLoggedIn: true,
        hasActiveWorkout: false,
        history: [],
      };
      const decision = resolveBackNavigationPolicy(input);
      expect(decision).toEqual({ type: 'exit-app' });
    });
  });
});
