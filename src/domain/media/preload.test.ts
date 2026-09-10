import { describe, it, expect, beforeEach, vi } from 'vitest';
import { preloadNextExerciseMedia, resetPreloadState } from './preload';
import { MediaManifest } from './types';

describe('Preload de Mídia do Próximo Exercício (GOAL-34)', () => {
  beforeEach(() => {
    resetPreloadState();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('data', { status: 200 })));
    vi.stubGlobal('caches', undefined);
  });

  it('não lança erro para exercício nulo ou inexistente', async () => {
    await expect(preloadNextExerciseMedia(null)).resolves.not.toThrow();
    await expect(preloadNextExerciseMedia('inexistente')).resolves.not.toThrow();
  });

  it('faz preload seguro sem travar a interface', async () => {
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
                approvalEvidenceRef: 'human-review-log 2026-09-02 (preload fixture)',
              },
            },
          },
        },
      },
    };

    await expect(preloadNextExerciseMedia('chest_supino_reto', mockManifest)).resolves.not.toThrow();
  });
});
