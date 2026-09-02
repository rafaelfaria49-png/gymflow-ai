import { ExerciseExecutionStat, MediaTelemetryEvent } from './types';

const STORAGE_KEY = 'gymflow_media_telemetry_v1';

interface TelemetryStore {
  version: number;
  events: MediaTelemetryEvent[];
  stats: Record<string, { executionCount: number; lastExecutedAt: string; videoPlays: number; fallbacks: number }>;
}

let memoryStore: TelemetryStore = { version: 1, events: [], stats: {} };

function loadStore(): TelemetryStore {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return memoryStore;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return memoryStore;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.version === 1) {
      return parsed;
    }
    return memoryStore;
  } catch {
    return memoryStore;
  }
}

function saveStore(store: TelemetryStore): void {
  memoryStore = store;
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    // Mantém no máximo os últimos 200 eventos brutos para não inflar localStorage
    if (store.events.length > 200) {
      store.events = store.events.slice(-200);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Silencioso em caso de quota atingida
  }
}

/**
 * Registra um evento de consumo ou execução de exercício na telemetria local
 */
export function recordMediaTelemetryEvent(
  exerciseId: string,
  eventType: 'view' | 'video_play' | 'fallback_frames' | 'fallback_image' | 'workout_executed'
): void {
  if (!exerciseId) return;
  const store = loadStore();
  const timestamp = new Date().toISOString();

  store.events.push({
    exerciseId,
    eventType,
    timestamp,
  });

  if (!store.stats[exerciseId]) {
    store.stats[exerciseId] = {
      executionCount: 0,
      lastExecutedAt: timestamp,
      videoPlays: 0,
      fallbacks: 0,
    };
  }

  const stat = store.stats[exerciseId];
  stat.lastExecutedAt = timestamp;

  if (eventType === 'workout_executed') {
    stat.executionCount += 1;
  } else if (eventType === 'video_play') {
    stat.videoPlays += 1;
  } else if (eventType === 'fallback_frames' || eventType === 'fallback_image') {
    stat.fallbacks += 1;
  }

  saveStore(store);
}

/**
 * Retorna os exercícios mais executados, ordenados por volume de execução
 * Usado para priorizar os próximos lotes de produção de vídeo (LIBRARY §4).
 */
export function getTopExecutedExercises(limit = 10): ExerciseExecutionStat[] {
  const store = loadStore();
  const list: ExerciseExecutionStat[] = Object.entries(store.stats).map(([exerciseId, data]) => ({
    exerciseId,
    executionCount: data.executionCount,
    lastExecutedAt: data.lastExecutedAt,
  }));

  list.sort((a, b) => {
    if (b.executionCount !== a.executionCount) {
      return b.executionCount - a.executionCount;
    }
    return new Date(b.lastExecutedAt).getTime() - new Date(a.lastExecutedAt).getTime();
  });

  return list.slice(0, limit);
}

/**
 * Retorna estatísticas detalhadas de consumo de mídia por exercício
 */
export function getExerciseMediaStats(exerciseId: string): { executionCount: number; videoPlays: number; fallbacks: number } | null {
  const store = loadStore();
  return store.stats[exerciseId] ?? null;
}

/**
 * Limpa toda a telemetria local
 */
export function clearMediaTelemetry(): void {
  memoryStore = { version: 1, events: [], stats: {} };
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Silencioso
    }
  }
}
