import { describe, expect, it } from 'vitest';
import { getTechniqueGate, listVisibleTechniques, normalizeTechniqueUnlocks } from './profileRules';

describe('profileRules — gating educativo de técnicas', () => {
  it('não exibe técnicas ao iniciante sem desbloqueio', () => {
    expect(listVisibleTechniques('beginner')).toEqual([]);
    expect(getTechniqueGate('beginner', 'drop_set').visible).toBe(false);
  });

  it('mostra a técnica após desbloqueio manual e normaliza duplicatas', () => {
    expect(listVisibleTechniques('beginner', ['drop_set'])).toEqual(['drop_set']);
    expect(getTechniqueGate('beginner', 'drop_set', ['drop_set']).educationRequired).toBe(true);
    expect(normalizeTechniqueUnlocks(['drop_set', 'drop_set', 'invalid', null])).toEqual(['drop_set']);
  });

  it('libera rest-pause no intermediário e mantém cluster avançado', () => {
    expect(getTechniqueGate('intermediate', 'rest_pause').visible).toBe(true);
    expect(getTechniqueGate('intermediate', 'cluster').visible).toBe(false);
    expect(getTechniqueGate('advanced', 'cluster').visible).toBe(true);
  });
});
