import { Capacitor } from '@capacitor/core';

export type AppPlatform = 'web' | 'android' | 'ios';

/**
 * Retorna a plataforma de runtime em que a aplicação está executando:
 * - 'android': Capacitor rodando dentro do WebView nativo Android
 * - 'ios': Capacitor rodando dentro do WKWebView nativo iOS
 * - 'web': Navegador web padrão ou PWA instalado via browser
 */
export function getPlatform(): AppPlatform {
  const platform = Capacitor.getPlatform();
  if (platform === 'android' || platform === 'ios') {
    return platform;
  }
  return 'web';
}

/**
 * Retorna true se estiver rodando como app nativo (Android ou iOS via Capacitor).
 */
export function isCapacitorNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Retorna true se estiver rodando especificamente no Android via Capacitor.
 */
export function isCapacitorAndroid(): boolean {
  return getPlatform() === 'android';
}

/**
 * Retorna true se estiver rodando especificamente no iOS via Capacitor.
 */
export function isCapacitorIos(): boolean {
  return getPlatform() === 'ios';
}

/**
 * Retorna true se estiver no ambiente web convencional (Desktop/Mobile Web ou PWA de navegador).
 */
export function isWeb(): boolean {
  return !isCapacitorNative();
}

