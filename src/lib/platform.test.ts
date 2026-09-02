import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { getPlatform, isCapacitorNative, isCapacitorAndroid, isCapacitorIos, isWeb } from './platform';

describe('platform helpers', () => {
  const originalGetPlatform = Capacitor.getPlatform;
  const originalIsNativePlatform = Capacitor.isNativePlatform;

  afterEach(() => {
    Capacitor.getPlatform = originalGetPlatform;
    Capacitor.isNativePlatform = originalIsNativePlatform;
    vi.restoreAllMocks();
  });

  it('detects web environment when not native', () => {
    Capacitor.getPlatform = vi.fn().mockReturnValue('web');
    Capacitor.isNativePlatform = vi.fn().mockReturnValue(false);

    expect(getPlatform()).toBe('web');
    expect(isCapacitorNative()).toBe(false);
    expect(isCapacitorAndroid()).toBe(false);
    expect(isCapacitorIos()).toBe(false);
    expect(isWeb()).toBe(true);
  });

  it('detects android environment when Capacitor runs on android', () => {
    Capacitor.getPlatform = vi.fn().mockReturnValue('android');
    Capacitor.isNativePlatform = vi.fn().mockReturnValue(true);

    expect(getPlatform()).toBe('android');
    expect(isCapacitorNative()).toBe(true);
    expect(isCapacitorAndroid()).toBe(true);
    expect(isCapacitorIos()).toBe(false);
    expect(isWeb()).toBe(false);
  });

  it('detects ios environment when Capacitor runs on ios', () => {
    Capacitor.getPlatform = vi.fn().mockReturnValue('ios');
    Capacitor.isNativePlatform = vi.fn().mockReturnValue(true);

    expect(getPlatform()).toBe('ios');
    expect(isCapacitorNative()).toBe(true);
    expect(isCapacitorAndroid()).toBe(false);
    expect(isCapacitorIos()).toBe(true);
    expect(isWeb()).toBe(false);
  });
});
