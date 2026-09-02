'use client';

import { useEffect } from 'react';
import { isCapacitorNative } from '../lib/platform';

// Registra o service worker manual (public/sw.js) somente em produção na Web/PWA.
// Em dev um SW ativo cachearia chunks e atrapalharia o HMR. No Capacitor nativo
// (Android WebView / iOS WKWebView), os assets já são locais e o SW pode causar conflitos.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (isCapacitorNative()) return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registro best-effort: falha ao registrar não pode quebrar o app.
    });
  }, []);

  return null;
}
