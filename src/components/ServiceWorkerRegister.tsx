'use client';

import { useEffect } from 'react';

// Registra o service worker manual (public/sw.js) somente em produção.
// Em dev um SW ativo cachearia chunks e atrapalharia o HMR/refresh do Next.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registro best-effort: falha ao registrar não pode quebrar o app.
    });
  }, []);

  return null;
}
