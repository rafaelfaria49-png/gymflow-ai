// GOAL-19A/PART-17: fábrica local de IDs do Construtor.
//
// Existe para tirar `Date.now()` de dentro dos componentes: dois cliques no mesmo
// milissegundo geravam IDs iguais, e um id derivado do relógio não é testável.
// Sem dependência nova (nada de uuid): `crypto.randomUUID` quando disponível,
// fallback previsível e sem colisão quando não.

import type { BuilderIdFactory } from '../types/workout-builder';

let fallbackCounter = 0;

function randomSuffix(): string {
  const globalCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;

  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }

  if (globalCrypto && typeof globalCrypto.getRandomValues === 'function') {
    const bytes = globalCrypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  // Último recurso (WebView antigo sem Web Crypto): contador monotônico + relógio.
  // Único dentro da sessão, que é o escopo real de um id criado no Construtor.
  fallbackCounter += 1;
  return `${Date.now().toString(36)}${fallbackCounter.toString(36).padStart(3, '0')}`;
}

/** `createBuilderId('day')` -> 'day_<uuid>'. IDs históricos nunca passam por aqui. */
export const createBuilderId: BuilderIdFactory = (prefix: string) => `${prefix}_${randomSuffix()}`;

/** Fábrica sequencial para testes: createSequentialIdFactory() -> 'day_1', 'day_2'... */
export function createSequentialIdFactory(): BuilderIdFactory {
  let counter = 0;
  return (prefix: string) => {
    counter += 1;
    return `${prefix}_${counter}`;
  };
}
