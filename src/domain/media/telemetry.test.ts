import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearMediaTelemetry,
  getExerciseMediaStats,
  getTopExecutedExercises,
  recordMediaTelemetryEvent,
} from './telemetry';

describe('Telemetria Local de Mídia (GOAL-34 & LIBRARY §4)', () => {
  beforeEach(() => {
    clearMediaTelemetry();
  });

  it('registra execuções e prioriza exercícios mais executados para lotes de produção', () => {
    // Simula execuções no treino ativo
    recordMediaTelemetryEvent('chest_supino_reto', 'workout_executed');
    recordMediaTelemetryEvent('chest_supino_reto', 'workout_executed');
    recordMediaTelemetryEvent('chest_supino_reto', 'workout_executed');

    recordMediaTelemetryEvent('legs_agachamento_barra', 'workout_executed');
    recordMediaTelemetryEvent('legs_agachamento_barra', 'workout_executed');

    recordMediaTelemetryEvent('biceps_rosca_direta', 'workout_executed');

    const top = getTopExecutedExercises(3);
    expect(top.length).toBe(3);
    expect(top[0].exerciseId).toBe('chest_supino_reto');
    expect(top[0].executionCount).toBe(3);

    expect(top[1].exerciseId).toBe('legs_agachamento_barra');
    expect(top[1].executionCount).toBe(2);

    expect(top[2].exerciseId).toBe('biceps_rosca_direta');
    expect(top[2].executionCount).toBe(1);
  });

  it('registra eventos de visualização, reprodução de vídeo e fallback', () => {
    recordMediaTelemetryEvent('chest_supino_reto', 'video_play');
    recordMediaTelemetryEvent('chest_supino_reto', 'video_play');
    recordMediaTelemetryEvent('chest_supino_reto', 'fallback_frames');

    const stats = getExerciseMediaStats('chest_supino_reto');
    expect(stats).not.toBeNull();
    expect(stats?.videoPlays).toBe(2);
    expect(stats?.fallbacks).toBe(1);
  });

  it('clearMediaTelemetry limpa os dados de telemetria', () => {
    recordMediaTelemetryEvent('chest_supino_reto', 'workout_executed');
    clearMediaTelemetry();

    const top = getTopExecutedExercises();
    expect(top.length).toBe(0);
  });
});
