// Persistência local-first (GOAL-01): envelope versionado em localStorage.
// Nunca deve crashar o app — storage corrompido/indisponível resulta em null.

const STORAGE_VERSION = 1;

interface StorageEnvelope<T> {
  v: number;
  savedAt: string;
  data: T;
}

export function loadState<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as StorageEnvelope<T>;
    if (!envelope || typeof envelope !== 'object') return null;
    if (envelope.v !== STORAGE_VERSION) return null;
    return envelope.data ?? null;
  } catch {
    return null;
  }
}

export function saveState<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    const envelope: StorageEnvelope<T> = {
      v: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      data
    };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    /* storage cheio/indisponível (modo privado) — ignorar */
  }
}

export function clearState(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignorar */
  }
}
