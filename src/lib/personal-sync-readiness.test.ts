import { describe, expect, it } from 'vitest';
import type { WorkoutProgram } from '../types';
import { MOCK_PROGRAMS } from '../mock/programs';

describe('GOAL-35: serialização e prontidão de sync de WorkoutProgram (createdBy neutro)', () => {
  it('programas legados serializam e deserializam sem createdBy sem alteração estrutural', () => {
    const seedProgram = MOCK_PROGRAMS[0];
    const serialized = JSON.stringify(seedProgram);
    const parsed: WorkoutProgram = JSON.parse(serialized);

    expect(parsed.id).toBe(seedProgram.id);
    expect(parsed.name).toBe(seedProgram.name);
    expect(parsed.createdBy).toBeUndefined();
    expect(parsed).toEqual(seedProgram);
  });

  it('permite definir createdBy como coach preservando roundtrip serializado integral', () => {
    const program: WorkoutProgram = {
      id: 'custom-coach-prog-1',
      name: 'Treino Prescrito pelo Treinador',
      durationWeeks: 4,
      frequencyDays: 3,
      level: 'intermediate',
      objective: 'Hipertrofia Funcional',
      exercises: [],
      description: 'Prescrição remota com foco em dorsais',
      repeatWeeks: true,
      weeks: [
        {
          number: 1,
          days: [
            {
              id: 'day-coach-a',
              name: 'Dia A — Puxadas',
              slots: [
                {
                  exerciseId: 'barra-fixa',
                  series: 4,
                  repRange: [6, 10],
                  targetRPE: 8,
                  restSec: 120,
                  progression: 'dupla',
                  incrementKg: 2,
                },
              ],
            },
          ],
        },
      ],
      isCustom: true,
      createdBy: 'coach',
    };

    const json = JSON.stringify(program);
    const restored: WorkoutProgram = JSON.parse(json);

    expect(restored.createdBy).toBe('coach');
    expect(restored.id).toBe('custom-coach-prog-1');
    expect(restored.weeks[0].days[0].slots[0].exerciseId).toBe('barra-fixa');
    expect(restored).toEqual(program);
  });

  it('suporta valores válidos de createdBy ("user", "coach", "system") em envelopes de storage', () => {
    const authors: Array<NonNullable<WorkoutProgram['createdBy']>> = ['user', 'coach', 'system'];

    for (const author of authors) {
      const sampleProgram: WorkoutProgram = {
        id: `prog-${author}`,
        name: `Programa ${author}`,
        durationWeeks: 2,
        frequencyDays: 2,
        level: 'beginner',
        objective: 'Adaptação',
        exercises: [],
        description: 'Descrição de teste',
        repeatWeeks: false,
        weeks: [],
        isCustom: author !== 'system',
        createdBy: author,
      };

      const storageEnvelope = {
        v: 1,
        savedAt: '2026-09-02T20:00:00.000Z',
        data: {
          customPrograms: [sampleProgram],
        },
      };

      const serialized = JSON.stringify(storageEnvelope);
      const parsed = JSON.parse(serialized);

      expect(parsed.data.customPrograms[0].createdBy).toBe(author);
      expect(parsed.data.customPrograms[0]).toEqual(sampleProgram);
    }
  });

  it('garante que a ausência de createdBy seja indistinguível do formato legado v1', () => {
    const rawLegacyPayload = {
      id: 'legacy-program-123',
      name: 'Treino Antigo',
      durationWeeks: 6,
      frequencyDays: 4,
      level: 'advanced',
      objective: 'Força',
      exercises: [],
      description: 'Criado no GOAL-10',
      repeatWeeks: true,
      weeks: [],
      isCustom: true,
    };

    const parsed: WorkoutProgram = JSON.parse(JSON.stringify(rawLegacyPayload));
    expect('createdBy' in parsed).toBe(false);
    expect(parsed.createdBy).toBeUndefined();
  });
});
