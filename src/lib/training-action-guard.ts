/** Trava síncrona por identidade: também cobre eventos duplicados antes do próximo render. */
export function createTrainingActionGuard(intervalMs = 500, now: () => number = Date.now) {
  const lastActions = new Map<string, number>();
  return (key: string): boolean => {
    const time = now();
    const previous = lastActions.get(key);
    if (previous !== undefined && time - previous < intervalMs) return false;
    for (const [oldKey, timestamp] of lastActions) {
      if (time - timestamp >= intervalMs) lastActions.delete(oldKey);
    }
    lastActions.set(key, time);
    return true;
  };
}
