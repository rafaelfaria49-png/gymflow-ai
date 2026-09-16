/**
 * GymFlow AI — Testes de favoritos e recentes (NUT-005 / GOAL-106)
 *
 * Cobre: adicionar/remover favorito, idempotência, ordenação de recentes,
 * dedupe, limite V1, item inexistente e persistência/remount. As listas
 * armazenam IDs — nunca cópias de macros.
 */

import { describe, expect, it } from 'vitest';
import { CANONICAL_BR_CATALOG, FoodDatabase } from './food-database';
import {
  addFavoriteId,
  createInMemoryFoodPreferencesStorage,
  FOOD_FAVORITES_STORAGE_KEY,
  FOOD_RECENTS_LIMIT,
  FOOD_RECENTS_STORAGE_KEY,
  FoodPreferencesStore,
  markRecentId,
  removeFavoriteId,
  removeRecentId,
  toggleFavoriteId,
  type FoodPreferencesStorage,
} from './food-preferences';

function makeStorage(): FoodPreferencesStorage {
  return createInMemoryFoodPreferencesStorage();
}

describe('NUT-005 favoritos (helpers puros)', () => {
  it('adicionar é idempotente e remover item inexistente é no-op', () => {
    const once = addFavoriteId([], 'br-arroz-branco-cozido');
    expect(once).toEqual(['br-arroz-branco-cozido']);
    expect(addFavoriteId(once, 'br-arroz-branco-cozido')).toEqual(['br-arroz-branco-cozido']);
    expect(removeFavoriteId(once, 'id-inexistente')).toEqual(['br-arroz-branco-cozido']);
    expect(removeFavoriteId(once, 'br-arroz-branco-cozido')).toEqual([]);
  });

  it('toggle alterna e ignora ids inválidos', () => {
    expect(toggleFavoriteId([], 'a')).toEqual(['a']);
    expect(toggleFavoriteId(['a'], 'a')).toEqual([]);
    expect(toggleFavoriteId(['a'], '')).toEqual(['a']);
    expect(addFavoriteId(['a'], '')).toEqual(['a']);
  });

  it('nunca muta a entrada', () => {
    const input = ['a', 'b'];
    addFavoriteId(input, 'c');
    removeFavoriteId(input, 'a');
    toggleFavoriteId(input, 'a');
    expect(input).toEqual(['a', 'b']);
  });
});

describe('NUT-005 recentes (helpers puros)', () => {
  it('ordena mais recente primeiro com dedupe (move-to-front)', () => {
    const step1 = markRecentId([], 'a');
    const step2 = markRecentId(step1, 'b');
    const step3 = markRecentId(step2, 'a');
    expect(step1).toEqual(['a']);
    expect(step3).toEqual(['a', 'b']);
    expect(removeRecentId(step3, 'zzz')).toEqual(['a', 'b']);
    expect(removeRecentId(step3, 'a')).toEqual(['b']);
  });

  it('respeita o limite V1 descartando o mais antigo', () => {
    let ids: string[] = [];
    for (let i = 0; i < FOOD_RECENTS_LIMIT + 5; i += 1) {
      ids = markRecentId(ids, `food-${i}`);
    }
    expect(ids.length).toBe(FOOD_RECENTS_LIMIT);
    expect(ids[0]).toBe(`food-${FOOD_RECENTS_LIMIT + 4}`);
    expect(ids).not.toContain('food-0');
  });
});

describe('NUT-005 FoodPreferencesStore (persistente por IDs)', () => {
  it('adicionar/remover favorito com idempotência', () => {
    const store = new FoodPreferencesStore(makeStorage());
    expect(store.getFavorites()).toEqual([]);
    store.addFavorite('br-arroz-branco-cozido');
    store.addFavorite('br-arroz-branco-cozido');
    expect(store.getFavorites()).toEqual(['br-arroz-branco-cozido']);
    expect(store.isFavorite('br-arroz-branco-cozido')).toBe(true);
    expect(store.isFavorite('outro')).toBe(false);
    store.toggleFavorite('br-arroz-branco-cozido');
    expect(store.getFavorites()).toEqual([]);
    store.toggleFavorite('br-feijao-preto-cozido');
    expect(store.getFavorites()).toEqual(['br-feijao-preto-cozido']);
    store.removeFavorite('br-feijao-preto-cozido');
    expect(store.getFavorites()).toEqual([]);
  });

  it('recentes: ordenação, dedupe e limite', () => {
    const store = new FoodPreferencesStore(makeStorage());
    store.markRecent('a');
    store.markRecent('b');
    store.markRecent('a');
    expect(store.getRecents()).toEqual(['a', 'b']);
    for (let i = 0; i < FOOD_RECENTS_LIMIT + 10; i += 1) {
      store.markRecent(`food-${i}`);
    }
    const recents = store.getRecents();
    expect(recents.length).toBe(FOOD_RECENTS_LIMIT);
    expect(recents[0]).toBe(`food-${FOOD_RECENTS_LIMIT + 9}`);
    store.removeRecent(recents[0]);
    expect(store.getRecents().length).toBe(FOOD_RECENTS_LIMIT - 1);
    store.clearRecents();
    expect(store.getRecents()).toEqual([]);
  });

  it('item inexistente: armazena o ID, resolução descarta', () => {
    const store = new FoodPreferencesStore(makeStorage());
    const db = new FoodDatabase(CANONICAL_BR_CATALOG);
    store.addFavorite('id-fantasma');
    store.markRecent('id-fantasma');
    expect(store.getFavorites()).toContain('id-fantasma');
    expect(store.getRecents()).toContain('id-fantasma');
    expect(store.getFavoriteFoods(db)).toEqual([]);
    expect(store.getRecentFoods(db)).toEqual([]);
    expect(db.getById('id-fantasma')).toBeNull();
  });

  it('resolve favoritos/recentes para referências preservando ordem', () => {
    const store = new FoodPreferencesStore(makeStorage());
    const db = new FoodDatabase(CANONICAL_BR_CATALOG);
    store.addFavorite('br-arroz-branco-cozido');
    store.addFavorite('br-feijao-preto-cozido');
    store.markRecent('br-feijao-preto-cozido');
    store.markRecent('br-arroz-branco-cozido');
    expect(store.getFavoriteFoods(db).map((food) => food.id)).toEqual([
      'br-arroz-branco-cozido',
      'br-feijao-preto-cozido',
    ]);
    expect(store.getRecentFoods(db).map((food) => food.id)).toEqual([
      'br-arroz-branco-cozido',
      'br-feijao-preto-cozido',
    ]);
  });

  it('persistência/remount: nova instância relê o mesmo storage', () => {
    const storage = makeStorage();
    const first = new FoodPreferencesStore(storage);
    first.addFavorite('br-arroz-branco-cozido');
    first.markRecent('br-feijao-preto-cozido');
    const second = new FoodPreferencesStore(storage);
    expect(second.getFavorites()).toEqual(['br-arroz-branco-cozido']);
    expect(second.getRecents()).toEqual(['br-feijao-preto-cozido']);
    second.addFavorite('x');
    first.reload();
    expect(first.getFavorites()).toEqual(['br-arroz-branco-cozido', 'x']);
  });

  it('payload corrompido vira lista vazia sem throw', () => {
    const storage = createInMemoryFoodPreferencesStorage({
      [FOOD_FAVORITES_STORAGE_KEY]: '[[[invalido',
      [FOOD_RECENTS_STORAGE_KEY]: '{"nao":"array"}',
    });
    const store = new FoodPreferencesStore(storage);
    expect(store.getFavorites()).toEqual([]);
    expect(store.getRecents()).toEqual([]);
    // Segue operacional após quarentena.
    store.addFavorite('a');
    expect(store.getFavorites()).toEqual(['a']);
  });

  it('persiste IDs — nunca cópias de macros', () => {
    const storage = makeStorage();
    const store = new FoodPreferencesStore(storage);
    store.addFavorite('br-arroz-branco-cozido');
    store.markRecent('br-arroz-branco-cozido');
    const favRaw = storage.getItem(FOOD_FAVORITES_STORAGE_KEY) as string;
    const recRaw = storage.getItem(FOOD_RECENTS_STORAGE_KEY) as string;
    expect(favRaw).toContain('br-arroz-branco-cozido');
    expect(recRaw).toContain('br-arroz-branco-cozido');
    expect(favRaw).not.toContain('protein');
    expect(recRaw).not.toContain('calories');
    expect(JSON.parse(favRaw)).toEqual(['br-arroz-branco-cozido']);
  });
});
