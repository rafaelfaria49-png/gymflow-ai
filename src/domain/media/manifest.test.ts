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

  it('carrega o manifest baseline com version 1 e >= 20 vídeos aprovados', () => {
    const manifest = getActiveManifest();
    expect(manifest.version).toBe(1);
    expect(manifest.schemaVersion).toBe('1.0.0');
    expect(manifest.cdnBaseUrl).toBe('https://assets.gymflow.ai/media');

    const approvedVideos = Object.values(manifest.assets).filter(
      (a) => a.video && a.video.status === 'approved'
    );
    expect(approvedVideos.length).toBeGreaterThanOrEqual(20);
  });

  it('obtém mídia de exercício existente por ID', () => {
    const media = getExerciseMedia('chest_supino_reto');
    expect(media).not.toBeNull();
    expect(media?.exerciseId).toBe('chest_supino_reto');
    expect(media?.video?.status).toBe('approved');
    expect(media?.video?.license).toContain('Higgsfield Commercial License');
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
      version: 2,
      status: 'approved',
      license: 'Higgsfield Commercial License v1 - GymFlow Proprietary',
      contentType: 'video/mp4',
    };

    setActiveManifest(upgraded);

    const active = getActiveManifest();
    expect(active.version).toBe(2);
    const updatedMedia = getExerciseMedia('chest_supino_reto');
    expect(updatedMedia?.video?.version).toBe(2);
    expect(updatedMedia?.video?.url).toBe('https://assets.gymflow.ai/media/videos/chest_supino_reto_v2.mp4');
  });

  it('rejeita manifest malformado ou sem vídeos aprovados suficientes', () => {
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
});
