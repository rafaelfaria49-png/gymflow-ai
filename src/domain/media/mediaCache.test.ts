import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MEDIA_CACHE_NAME,
  isCacheStorageAvailable,
  downloadProgramMedia,
  clearMediaCache,
  getMediaCacheStats,
} from './mediaCache';
import { MediaManifest } from './types';
import type { WorkoutProgram } from '../../types';

describe('Gestor de Cache Storage de Mídia (GOAL-34 & D14)', () => {
  const mockCacheStorage = new Map<string, Response>();

  beforeEach(() => {
    mockCacheStorage.clear();

    const mockCache: Partial<Cache> = {
      match: vi.fn(async (req: RequestInfo | URL) => {
        const url = typeof req === 'string' ? req : (req as Request).url;
        return mockCacheStorage.get(url);
      }),
      put: vi.fn(async (req: RequestInfo | URL, resp: Response) => {
        const url = typeof req === 'string' ? req : (req as Request).url;
        mockCacheStorage.set(url, resp);
      }),
      keys: vi.fn(async () => {
        return Array.from(mockCacheStorage.keys()).map((u) => new Request(u));
      }),
    };

    const mockCaches: Partial<CacheStorage> = {
      open: vi.fn(async (name: string) => {
        expect(name).toBe(MEDIA_CACHE_NAME);
        return mockCache as Cache;
      }),
      delete: vi.fn(async (name: string) => {
        if (name === MEDIA_CACHE_NAME) {
          mockCacheStorage.clear();
          return true;
        }
        return false;
      }),
      keys: vi.fn(async () => [MEDIA_CACHE_NAME]),
    };

    vi.stubGlobal('caches', mockCaches);
    vi.stubGlobal('window', {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('video-data', { status: 200, headers: { 'content-length': '1500000' } }))
    );
  });

  it('usa o namespace isolado gymflow-media-v1', () => {
    expect(MEDIA_CACHE_NAME).toBe('gymflow-media-v1');
    expect(isCacheStorageAvailable()).toBe(true);
  });

  it('downloadProgramMedia: baixa vídeos aprovados para os exercícios do programa do usuário', async () => {
    const mockProgram: WorkoutProgram = {
      id: 'prog_hipertrofia_br',
      name: 'Hipertrofia Brasil',
      durationWeeks: 4,
      frequencyDays: 3,
      level: 'intermediate',
      objective: 'hypertrophy',
      description: 'Programa teste de hipertrofia',
      exercises: [],
      repeatWeeks: true,
      weeks: [
        {
          number: 1,
          days: [
            {
              id: 'day_a',
              name: 'Peito e Tríceps',
              slots: [
                {
                  exerciseId: 'chest_supino_reto',
                  series: 4,
                  repRange: [8, 10],
                  targetRPE: 8,
                  restSec: 90,
                  progression: 'dupla',
                  incrementKg: 2,
                },
                {
                  exerciseId: 'triceps_polia_corda',
                  series: 3,
                  repRange: [10, 12],
                  targetRPE: 8,
                  restSec: 60,
                  progression: 'dupla',
                  incrementKg: 2,
                },
              ],
            },
          ],
        },
      ],
    };

    const mockManifest: MediaManifest = {
      version: 1,
      schemaVersion: '1.0.0',
      updatedAt: '2026-09-02T18:00:00.000Z',
      cdnBaseUrl: 'https://assets.gymflow.ai/media',
      assets: {
        chest_supino_reto: {
          exerciseId: 'chest_supino_reto',
          thumbnail: {
            id: 'thumb_1',
            url: '/assets/exercises/chest_supino_reto/1.jpg',
            bytes: 40000,
            width: 720,
            height: 480,
            version: 1,
            status: 'approved',
            provenance: {
              provider: 'gymflow_catalog',
              termsOrLicenseRef: 'GymFlow Catalog Assets',
            },
          },
          video: {
            id: 'vid_1',
            url: 'https://assets.gymflow.ai/media/videos/chest_supino_reto_v1.mp4',
            bytes: 1600000,
            width: 720,
            height: 1280,
            durationSeconds: 6,
            repCount: 2,
            fps: 24,
            codec: 'h264',
            version: 1,
            status: 'approved',
            provenance: {
              provider: 'higgsfield',
              termsOrLicenseRef: 'Higgsfield Commercial Generation Terms',
              approval: {
                approvedBy: 'coach_lead_human',
                approvedAt: '2026-09-02T18:00:00Z',
                approvedAtPrecision: 'exact',
                approvalEvidenceRef: 'human-review-log 2026-09-02 (biomechanical review)',
              },
            },
          },
        },
        triceps_polia_corda: {
          exerciseId: 'triceps_polia_corda',
          thumbnail: {
            id: 'thumb_2',
            url: '/assets/exercises/triceps_polia_corda/1.jpg',
            bytes: 40000,
            width: 720,
            height: 480,
            version: 1,
            status: 'approved',
            provenance: {
              provider: 'gymflow_catalog',
              termsOrLicenseRef: 'GymFlow Catalog Assets',
            },
          },
          video: {
            id: 'vid_2',
            url: 'https://assets.gymflow.ai/media/videos/triceps_polia_corda_v1.mp4',
            bytes: 1500000,
            width: 720,
            height: 1280,
            durationSeconds: 6,
            repCount: 2,
            fps: 24,
            codec: 'h264',
            version: 1,
            status: 'approved',
            provenance: {
              provider: 'higgsfield',
              termsOrLicenseRef: 'Higgsfield Commercial Generation Terms',
              approval: {
                approvedBy: 'coach_lead_human',
                approvedAt: '2026-09-02T18:00:00Z',
                approvedAtPrecision: 'exact',
                approvalEvidenceRef: 'human-review-log 2026-09-02 (biomechanical review)',
              },
            },
          },
        },
      },
    };

    const progressLogs: Array<{ completed: number; total: number }> = [];
    const result = await downloadProgramMedia(mockProgram, mockManifest, (p) => {
      progressLogs.push({ completed: p.completed, total: p.total });
    });

    expect(result.success).toBe(true);
    expect(result.downloaded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.totalBytes).toBe(3100000);
    expect(progressLogs.length).toBeGreaterThan(0);
    expect(mockCacheStorage.size).toBe(2);
  });

  it('clearMediaCache limpa o Cache Storage do namespace', async () => {
    mockCacheStorage.set('url1', new Response('data'));
    expect(mockCacheStorage.size).toBe(1);

    const cleared = await clearMediaCache();
    expect(cleared).toBe(true);
    expect(mockCacheStorage.size).toBe(0);

    const stats = await getMediaCacheStats();
    expect(stats.count).toBe(0);
    expect(stats.totalBytes).toBe(0);
  });
});
