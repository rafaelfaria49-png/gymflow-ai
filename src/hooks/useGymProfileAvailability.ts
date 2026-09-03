import { useMemo } from 'react';
import {
  getActiveGymProfileAvailability,
  type GymProfileAvailability,
  type GymProfileState,
} from '../domain/gymProfile';
import { getCurrentCivilDate } from '../lib/training-profile';

/** Leitura derivada para consumidores como o Construtor; não cria nem salva perfil. */
export function useGymProfileAvailability(
  state: GymProfileState | null | undefined,
): GymProfileAvailability | null {
  const todayCivilDate = getCurrentCivilDate();
  return useMemo(
    () => getActiveGymProfileAvailability(state, todayCivilDate),
    [state, todayCivilDate],
  );
}
