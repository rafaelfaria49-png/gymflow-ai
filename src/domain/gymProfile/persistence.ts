import {
  normalizeGymProfileState,
  type GymProfileState,
} from './model';

/**
 * Ponte de compatibilidade da persistência principal. Não existe um storage
 * separado: o estado fica dentro do envelope GymFlow e a ausência é explícita.
 */
export interface GymProfilePersistedSlice {
  gymProfile?: unknown;
}

export function readPersistedGymProfile(
  state: GymProfilePersistedSlice | null | undefined,
): GymProfileState | null {
  return normalizeGymProfileState(state?.gymProfile);
}

export function migrateGymProfile(value: unknown): GymProfileState | null {
  return normalizeGymProfileState(value);
}
