import { describe, it, expect, beforeEach } from 'vitest';
import {
  getActiveManifest,
  getExerciseMedia,
  resetToDefaultManifest,
  setActiveManifest,
  validateMediaManifest,
} from './manifest';
import { MediaManifest } from './types';

describe('Manifest de Mídia (GOAL-34)', () => {
  beforeEach(() => {
    resetToDefaultManifest();
  });

  it('carrega o manifest baseline com version 2, cdn real (Vercel Blob) e 1 vídeo aprovado real', () => {
    const manifest = getActiveManifest();
    expect(manifest.version).toBe(2);
    expect(manifest.schemaVersion).toBe('1.0.0');
    // GOAL-053: cdnBaseUrl passou a apontar para a origem REAL (Vercel Blob public storage)
    expect(manifest.cdnBaseUrl).toBe('https://jmnpdtxahhb8xobk.public.blob.vercel-storage.com');

    const approvedVideos = Object.values(manifest.assets).filter(
      (a) => a.video && a.video.status === 'approved'
    );
    // GOAL-053: exatamente 1 vídeo com aprovação humana comprovada (back_remada_baixa)
    expect(approvedVideos.length).toBe(1);
    expect(approvedVideos[0].exerciseId).toBe('back_remada_baixa');
    expect(approvedVideos[0].video?.url).toBe(
      'https://jmnpdtxahhb8xobk.public.blob.vercel-storage.com/back_remada_baixa_v1.mp4'
    );
    expect(approvedVideos[0].video?.checksum).toBe(
      'sha256:93fc1fa4cb1a68f266c7d98e2b09229194e238ce91dd063ce239c41fdd161732'
    );
    expect(approvedVideos[0].video?.provenance?.approval?.approvedBy).toBeTruthy();

    const draftVideos = Object.values(manifest.assets).filter(
      (a) => a.video && a.video.status === 'draft'
    );
    expect(draftVideos.length).toBeGreaterThanOrEqual(20);
  });

  it('obtém mídia de exercício existente por ID com proveniência factual', () => {
    const media = getExerciseMedia('chest_supino_reto');
    expect(media).not.toBeNull();
    expect(media?.exerciseId).toBe('chest_supino_reto');
    expect(media?.video?.status).toBe('draft');
    expect(media?.video?.provenance?.provider).toBe('higgsfield');
    expect(media?.video?.provenance?.termsOrLicenseRef).toContain('Higgsfield Terms of Service');
    expect(media?.thumbnail?.provenance?.provider).toBe('gymflow_catalog');
  });

  it('retorna null para exercício inexistente no manifest', () => {
    const media = getExerciseMedia('exercicio_inexistente_xyz');
    expect(media).toBeNull();
  });

  it('manifest bump: troca URL e versão do vídeo dinamicamente sem release do app', () => {
    const current = getActiveManifest();
    const upgraded: MediaManifest = JSON.parse(JSON.stringify(current));
    upgraded.version = 2;
    upgraded.assets['chest_supino_reto'].video = {
      id: 'vid_chest_supino_reto_v2',
      url: 'https://assets.gymflow.ai/media/videos/chest_supino_reto_v2.mp4',
      bytes: 1750000,
      width: 720,
      height: 1280,
      durationSeconds: 6,
      repCount: 2,
      fps: 24,
      codec: 'h264',
      version: 2,
      status: 'approved',
      provenance: {
        provider: 'higgsfield',
        modelOrWorkflow: 'character_soul_kai_v2',
        generatedAt: '2026-09-02T19:00:00.000Z',
        termsOrLicenseRef: 'Higgsfield Commercial Terms',
        approval: {
          approvedBy: 'coach_lead_human_gymflow',
          approvedAt: '2026-09-02T19:30:00.000Z',
          notes: 'Aprovado após revisão biomecânica humana.',
        },
      },
      contentType: 'video/mp4',
    };

    setActiveManifest(upgraded);

    const active = getActiveManifest();
    expect(active.version).toBe(2);
    const updatedMedia = getExerciseMedia('chest_supino_reto');
    expect(updatedMedia?.video?.version).toBe(2);
    expect(updatedMedia?.video?.url).toBe('https://assets.gymflow.ai/media/videos/chest_supino_reto_v2.mp4');
    expect(updatedMedia?.video?.status).toBe('approved');
  });

  it('rejeita manifest malformado estruturalmente', () => {
    const invalidManifest = {
      version: 0,
      schemaVersion: '',
      cdnBaseUrl: 'not-a-url',
      assets: {},
    };

    const res = validateMediaManifest(invalidManifest);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('valida rejeição quando exigido critério de conteúdo de >=20 vídeos aprovados', () => {
    const current = getActiveManifest();
    const res = validateMediaManifest(current, { requireContentAcceptance: true });
    // Falha quando exigido o critério de conteúdo porque o repositório não tem 20 vídeos aprovados ainda
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('LIBRARY §5 violado'))).toBe(true);
    expect(res.contentAcceptance.status).toBe('pending_human_production');
  });
});
