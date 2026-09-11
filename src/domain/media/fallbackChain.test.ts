import { describe, it, expect } from 'vitest';
import { resolveMediaRenderTier, isMediaApproved } from './fallbackChain';
import { ExerciseMedia } from './types';

describe('Cadeia de Fallback e QA Gate (GOAL-34 & LIBRARY §2–4)', () => {
  const approvedMedia: ExerciseMedia = {
    exerciseId: 'chest_supino_reto',
    thumbnail: {
      id: 'thumb_1',
      url: '/assets/exercises/chest_supino_reto/thumb.jpg',
      bytes: 45000,
      width: 720,
      height: 480,
      version: 1,
      status: 'approved',
      provenance: {
        provider: 'gymflow_catalog',
        termsOrLicenseRef: 'GymFlow Catalog Assets',
        approval: {
          approvedBy: 'catalog_lead',
          approvedAt: '2026-09-02T18:00:00Z',
          approvedAtPrecision: 'exact',
          approvalEvidenceRef: 'catalog-review-log 2026-09-02 (thumbnail aprovada)',
        },
      },
    },
    frames: [
      {
        id: 'frame_1',
        url: '/assets/exercises/chest_supino_reto/1.jpg',
        bytes: 45000,
        width: 720,
        height: 480,
        version: 1,
        status: 'approved',
        provenance: {
          provider: 'gymflow_catalog',
          termsOrLicenseRef: 'GymFlow Catalog Assets',
        },
      },
      {
        id: 'frame_2',
        url: '/assets/exercises/chest_supino_reto/2.jpg',
        bytes: 46000,
        width: 720,
        height: 480,
        version: 1,
        status: 'approved',
        provenance: {
          provider: 'gymflow_catalog',
          termsOrLicenseRef: 'GymFlow Catalog Assets',
        },
      },
    ],
    video: {
      id: 'vid_1',
      url: 'https://assets.gymflow.ai/media/videos/chest_supino_reto_v1.mp4',
      bytes: 1640000,
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
          approvedAt: '2026-09-02T19:00:00Z',
          approvedAtPrecision: 'exact',
          approvalEvidenceRef: 'human-review-log 2026-09-02 (biomechanical review)',
        },
      },
    },
  };

  it('Tier 1: renderiza vídeo quando aprovado e online', () => {
    const result = resolveMediaRenderTier(approvedMedia, { isOffline: false });
    expect(result.tier).toBe('video');
    expect(result.videoAsset).toBe(approvedMedia.video);
    expect(result.badgeLabel).toBe('Vídeo HD • Coach Kai');
  });

  it('Tier 1: renderiza vídeo em modo avião (offline) se estiver em cache', () => {
    const result = resolveMediaRenderTier(approvedMedia, {
      isOffline: true,
      cachedUrls: [approvedMedia.video!.url],
    });
    expect(result.tier).toBe('video');
    expect(result.reason).toBe('video_cached');
  });

  it('Tier 2: avião sem cache -> fallback gracioso para frames', () => {
    const result = resolveMediaRenderTier(approvedMedia, {
      isOffline: true,
      cachedUrls: [], // não está em cache
    });
    expect(result.tier).toBe('frames');
    expect(result.videoAsset).toBeNull();
    expect(result.frames.length).toBe(2);
    expect(result.badgeLabel).toBe('Sequência visual provisória');
  });

  it('Tier 2: falha no download do vídeo -> fallback imediato para frames', () => {
    const result = resolveMediaRenderTier(approvedMedia, {
      isOffline: false,
      failedUrls: [approvedMedia.video!.url], // vídeo falhou
    });
    expect(result.tier).toBe('frames');
    expect(result.frames.length).toBe(2);
  });

  it('Tier 3: se vídeo e frames falharem -> fallback para thumbnail estática', () => {
    const result = resolveMediaRenderTier(approvedMedia, {
      failedUrls: [
        approvedMedia.video!.url,
        approvedMedia.frames![0].url,
        approvedMedia.frames![1].url,
      ],
    });
    expect(result.tier).toBe('thumbnail');
    expect(result.thumbnailUrl).toBe(approvedMedia.thumbnail.url);
    expect(result.badgeLabel).toBe('Demonstração estática');
  });

  it('Tier 4: se tudo falhar ou mídia vazia -> fallback honesto para placeholder', () => {
    const result = resolveMediaRenderTier(null);
    expect(result.tier).toBe('placeholder');
    expect(result.badgeLabel).toBe('Demonstração em breve');
  });

  it('QA GATE: asset com status "draft" NUNCA renderiza como vídeo (LIBRARY §5)', () => {
    const draftMedia: ExerciseMedia = {
      ...approvedMedia,
      video: {
        ...approvedMedia.video!,
        status: 'draft',
      },
    };

    expect(isMediaApproved(draftMedia.video)).toBe(false);

    // Mesmo com URL online válida, o motor recusa exibir como vídeo
    const result = resolveMediaRenderTier(draftMedia, { isOffline: false });
    expect(result.tier).not.toBe('video');
    expect(result.tier).toBe('frames');
    expect(result.reason).toBe('draft_blocked_fallback_to_frames');
  });

  it('QA GATE: asset com status "retired" NUNCA renderiza como vídeo', () => {
    const retiredMedia: ExerciseMedia = {
      ...approvedMedia,
      video: {
        ...approvedMedia.video!,
        status: 'retired',
      },
    };

    expect(isMediaApproved(retiredMedia.video)).toBe(false);

    const result = resolveMediaRenderTier(retiredMedia, { isOffline: false });
    expect(result.tier).not.toBe('video');
    expect(result.tier).toBe('frames');
  });
});
