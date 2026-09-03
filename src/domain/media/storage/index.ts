import { isCapacitorNative } from '../../../lib/platform';
import type { MediaStorageDriver } from './types';
import { webMediaStorage } from './webStorage';
import { nativeMediaStorage } from './nativeStorage';

export * from './types';
export * from './webStorage';
export * from './nativeStorage';

/**
 * Retorna o driver de armazenamento de mídia adequado para a plataforma atual:
 * - Capacitor nativo (Android WebView / iOS WKWebView) -> nativeMediaStorage (@capacitor/filesystem + @capacitor/file-transfer)
 * - Web / PWA -> webMediaStorage (Cache Storage API)
 */
export function getMediaStorageDriver(): MediaStorageDriver {
  if (isCapacitorNative()) {
    return nativeMediaStorage;
  }
  return webMediaStorage;
}
