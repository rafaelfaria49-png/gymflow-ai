/**
 * GymFlow AI — Favoritos e recentes do FoodDatabase (NUT-005 / GOAL-106)
 *
 * Suporte real a favoritos e alimentos usados recentemente sobre a
 * infraestrutura local existente, com o menor contrato persistente coerente:
 *
 * - IDs, nunca cópias de macros (a referência canônica continua sendo o
 *   FoodReference do catálogo; divergência de macros é impossível);
 * - persistência em chave/valor textual (mesma forma do StorageLike local),
 *   sem novo banco físico e sem bump de IDB (não há necessidade
 *   arquitetural: são listas curtas de strings, não entidades relacionais);
 * - sem wiring no Provider nesta entrega: o NUT-006 (UI mobile) conecta este
 *   store; aqui vivem domínio puro + persistência testável.
 *
 * Limite de recentes: o contrato canônico não define teto, então a V1 adota
 * FOOD_RECENTS_LIMIT = 30 documentado e testado (janela útil sem crescer
 * sem bound no storage local).
 */

import type { FoodDatabase } from './food-database';
import type { FoodReference } from './food-types';

// ============================================================================
// CONTRATO
// ============================================================================

/** Chaves de persistência (versionadas; bump textual, nunca IDB). */
export const FOOD_FAVORITES_STORAGE_KEY = 'gymflow:nutrition:favoriteFoodIds:v1' as const;
export const FOOD_RECENTS_STORAGE_KEY = 'gymflow:nutrition:recentFoodIds:v1' as const;

/**
 * Teto de recentes (V1). Sem teto canônico no Masterplan: escolha documentada
 * desta entrega, coberta por teste.
 */
export const FOOD_RECENTS_LIMIT = 30 as const;

/** Infraestrutura local existente: mesma forma do StorageLike do storage. */
export interface FoodPreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isValidFoodId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// ============================================================================
// HELPERS PUROS (LISTAS DE IDS — SEMPRE NOVAS ARRAYS, NUNCA MUTAM A ENTRADA)
// ============================================================================

/** Adiciona aos favoritos; idempotente (duplicata não duplica). */
export function addFavoriteId(ids: readonly string[], id: string): string[] {
  if (!isValidFoodId(id)) return [...ids];
  if (ids.includes(id)) return [...ids];
  return [...ids, id];
}

/** Remove dos favoritos; id inexistente é no-op (nova array mesmo assim). */
export function removeFavoriteId(ids: readonly string[], id: string): string[] {
  if (!isValidFoodId(id)) return [...ids];
  return ids.filter((candidate) => candidate !== id);
}

/** Toggle idempotente de favorito. */
export function toggleFavoriteId(ids: readonly string[], id: string): string[] {
  if (!isValidFoodId(id)) return [...ids];
  return ids.includes(id) ? removeFavoriteId(ids, id) : addFavoriteId(ids, id);
}

/**
 * Marca uso recente: dedupe (move para a frente) + teto FOOD_RECENTS_LIMIT.
 * Ordem: mais recente primeiro.
 */
export function markRecentId(
  ids: readonly string[],
  id: string,
  limit: number = FOOD_RECENTS_LIMIT,
): string[] {
  if (!isValidFoodId(id)) return [...ids];
  const safeLimit = typeof limit === 'number' && Number.isFinite(limit) && limit > 0
    ? Math.floor(limit)
    : FOOD_RECENTS_LIMIT;
  return [id, ...ids.filter((candidate) => candidate !== id)].slice(0, safeLimit);
}

/** Remove um id dos recentes; inexistente é no-op. */
export function removeRecentId(ids: readonly string[], id: string): string[] {
  if (!isValidFoodId(id)) return [...ids];
  return ids.filter((candidate) => candidate !== id);
}

// ============================================================================
// STORE PERSISTENTE (CHAVE/VALOR — SEM IDB)
// ============================================================================

function readIdList(storage: FoodPreferencesStorage, key: string): string[] {
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return [];
  }
  if (raw === null || raw === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Quarentena honesta: payload corrompido vira lista vazia (sem throw) e
    // apenas strings válidas sobrevivem; duplicatas colapsam preservando ordem.
    const seen = new Set<string>();
    const clean: string[] = [];
    for (const entry of parsed) {
      if (isValidFoodId(entry) && !seen.has(entry)) {
        seen.add(entry);
        clean.push(entry);
      }
    }
    return clean;
  } catch {
    return [];
  }
}

function writeIdList(storage: FoodPreferencesStorage, key: string, ids: readonly string[]): void {
  try {
    storage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Storage indisponível (quota/privado): estado em memória prevalece;
    // nunca quebrar o app por causa de preferência alimentar.
  }
}

/** Storage em memória (testes e referência da semântica). */
export function createInMemoryFoodPreferencesStorage(
  initial?: Record<string, string>,
): FoodPreferencesStorage {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

/**
 * Preferências alimentares persistidas (IDs, nunca macros).
 * Remount = nova instância sobre o mesmo storage relê o estado (testado).
 */
export class FoodPreferencesStore {
  private readonly storage: FoodPreferencesStorage;
  private favorites: string[];
  private recents: string[];

  constructor(storage: FoodPreferencesStorage) {
    this.storage = storage;
    this.favorites = readIdList(storage, FOOD_FAVORITES_STORAGE_KEY);
    this.recents = readIdList(storage, FOOD_RECENTS_STORAGE_KEY).slice(0, FOOD_RECENTS_LIMIT);
  }

  /** Recarrega do storage (remount explícito). */
  reload(): void {
    this.favorites = readIdList(this.storage, FOOD_FAVORITES_STORAGE_KEY);
    this.recents = readIdList(this.storage, FOOD_RECENTS_STORAGE_KEY).slice(0, FOOD_RECENTS_LIMIT);
  }

  getFavorites(): string[] {
    return [...this.favorites];
  }

  isFavorite(id: string): boolean {
    if (!isValidFoodId(id)) return false;
    return this.favorites.includes(id);
  }

  addFavorite(id: string): string[] {
    this.favorites = addFavoriteId(this.favorites, id);
    writeIdList(this.storage, FOOD_FAVORITES_STORAGE_KEY, this.favorites);
    return this.getFavorites();
  }

  removeFavorite(id: string): string[] {
    this.favorites = removeFavoriteId(this.favorites, id);
    writeIdList(this.storage, FOOD_FAVORITES_STORAGE_KEY, this.favorites);
    return this.getFavorites();
  }

  toggleFavorite(id: string): string[] {
    this.favorites = toggleFavoriteId(this.favorites, id);
    writeIdList(this.storage, FOOD_FAVORITES_STORAGE_KEY, this.favorites);
    return this.getFavorites();
  }

  getRecents(): string[] {
    return [...this.recents];
  }

  markRecent(id: string): string[] {
    this.recents = markRecentId(this.recents, id, FOOD_RECENTS_LIMIT);
    writeIdList(this.storage, FOOD_RECENTS_STORAGE_KEY, this.recents);
    return this.getRecents();
  }

  removeRecent(id: string): string[] {
    this.recents = removeRecentId(this.recents, id);
    writeIdList(this.storage, FOOD_RECENTS_STORAGE_KEY, this.recents);
    return this.getRecents();
  }

  clearRecents(): string[] {
    this.recents = [];
    writeIdList(this.storage, FOOD_RECENTS_STORAGE_KEY, this.recents);
    return [];
  }

  /**
   * Resolve favoritos para referências do catálogo. IDs inexistentes no
   * catálogo são descartados (IDs, nunca cópias divergentes).
   */
  getFavoriteFoods(database: FoodDatabase): FoodReference[] {
    const resolved: FoodReference[] = [];
    for (const id of this.favorites) {
      const reference = database.getById(id);
      if (reference !== null) resolved.push(reference);
    }
    return resolved;
  }

  /** Resolve recentes para referências, preservando ordem e descartando ausentes. */
  getRecentFoods(database: FoodDatabase): FoodReference[] {
    const resolved: FoodReference[] = [];
    for (const id of this.recents) {
      const reference = database.getById(id);
      if (reference !== null) resolved.push(reference);
    }
    return resolved;
  }
}
