import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { RUNTIME_CATALOG, LOTE_6_EXPANSION, LOTE_7_EXPANSION } from '../../mock/exercises';
import { MOCK_VIDEOS } from '../../mock/videos';
import { getTechniqueFrames } from '../../lib/techniqueFrames';
import { getTechniqueVideoIdForExerciseId, getExerciseIdForTechniqueVideoId } from '../../lib/exerciseTechniqueMap';
import { matchesExerciseSearch } from '../../lib/exerciseSearch';
import { filterExerciseCatalog } from '../../lib/workout-picker';
import { getExerciseMedia, getActiveManifest, resetToDefaultManifest } from './manifest';
import { resolveMediaRenderTier } from './fallbackChain';
import type { MediaManifest } from './types';

beforeEach(resetToDefaultManifest);

function renderTier(id: string) {
  const exercise = RUNTIME_CATALOG.find(x => x.id === id)!;
  return resolveMediaRenderTier(getExerciseMedia(id), { legacyFrames: getTechniqueFrames(exercise) });
}

describe('GOAL-124 functional runtime media reconciliation', () => {
  it('keeps every operational ID available in the same Todos filter used by the library and picker', () => {
    const selected = filterExerciseCatalog(RUNTIME_CATALOG, 'all', '');
    expect(selected).toHaveLength(184);
    expect(selected.map(x => x.id).sort()).toEqual(RUNTIME_CATALOG.map(x => x.id).sort());
  });
  it.each([
    ['chest_supino_haltere', 'frames'],
    [LOTE_6_EXPANSION[0].id, 'placeholder'],
    [LOTE_7_EXPANSION[0].id, 'placeholder'],
    ['triceps_maquina', 'placeholder'],
    ['back_puxada_pulley', 'video'],
    ['chest_supino_reto', 'frames'],
  ])('%s is selectable and resolves honestly to %s', (id, expectedTier) => {
    const exercise = RUNTIME_CATALOG.find(x => x.id === id)!;
    expect(matchesExerciseSearch(exercise, '')).toBe(true);
    const result = renderTier(id);
    expect(result.tier).toBe(expectedTier);
    if (expectedTier !== 'video') expect(result.videoAsset).toBeNull();
    for (const frame of result.frames) {
      expect(frame.url.startsWith(`/assets/exercises/${id}/`)).toBe(true);
      expect(fs.existsSync(path.join(process.cwd(), 'public', frame.url.slice(1)))).toBe(true);
    }
    if (id === 'chest_supino_reto') {
      expect(result.frames).toHaveLength(5);
      expect(result.badgeLabel).toBe('Sequência visual provisória');
      expect(result.frames.every(x => x.url.includes('/sequence/step-'))).toBe(true);
    }
  });

  it('never serves any historical orphan even when supplied through an old active manifest', () => {
    const current = getActiveManifest();
    const oldManifest: MediaManifest = { ...current, assets: { ...current.assets, ...current.historicalAssets } };
    for (const id of Object.keys(current.historicalAssets!)) {
      expect(getExerciseMedia(id)).toBeNull();
      expect(getExerciseMedia(id, oldManifest)).toBeNull();
      expect(resolveMediaRenderTier(getExerciseMedia(id, oldManifest)).tier).toBe('placeholder');
    }
    expect(current.historicalAssets!.back_puxada_atras.video?.status).toBe('retired');
  });

  it('rejects a crossed exerciseId instead of displaying another exercise', () => {
    const current = getActiveManifest();
    const crossed: MediaManifest = { ...current, assets: { chest_supino_reto: current.assets.back_puxada_pulley } };
    expect(getExerciseMedia('chest_supino_reto', crossed)).toBeNull();
  });

  it('blocks draft and retired video playback even when they are cached', () => {
    const current = getActiveManifest();
    const draft = getExerciseMedia('chest_supino_reto')!;
    const retired = current.historicalAssets!.back_puxada_atras;
    for (const media of [draft, retired]) {
      const result = resolveMediaRenderTier(media, { cachedUrls: [media.video!.url], isOffline: true });
      expect(result.tier).not.toBe('video');
      expect(result.videoAsset).toBeNull();
    }
  });

  it('keeps approved video playback and own local frames as its offline fallback', () => {
    const media = getExerciseMedia('back_puxada_pulley')!;
    const exercise = RUNTIME_CATALOG.find(x => x.id === media.exerciseId)!;
    expect(resolveMediaRenderTier(media, { cachedUrls: [media.video!.url], isOffline: true }).tier).toBe('video');
    const offline = resolveMediaRenderTier(media, { isOffline: true, legacyFrames: getTechniqueFrames(exercise) });
    expect(offline.tier).toBe('frames');
    expect(offline.frames).toHaveLength(5);
    expect(offline.frames.every(x => x.url.startsWith('/assets/exercises/back_puxada_pulley/'))).toBe(true);
  });

  it('removes exactly the four dead synthetic mappings without replacing them by other lessons', () => {
    for (const id of ['extra_vid_technique_2', 'extra_vid_technique_6', 'extra_vid_machines_1', 'extra_vid_machines_5']) {
      expect(MOCK_VIDEOS.some(x => x.id === id)).toBe(false);
      expect(getExerciseIdForTechniqueVideoId(id)).toBeNull();
    }
    expect(getTechniqueVideoIdForExerciseId('glutes_elevacao_pelvica')).toBeNull();
    expect(getTechniqueVideoIdForExerciseId('legs_legpress_45')).toBeNull();
    for (const exercise of RUNTIME_CATALOG) {
      const videoId = getTechniqueVideoIdForExerciseId(exercise.id);
      if (!videoId) continue;
      expect(MOCK_VIDEOS.some(x => x.id === videoId)).toBe(true);
      expect(getExerciseIdForTechniqueVideoId(videoId)).toBe(exercise.id);
    }
  });

  it('retains quadriceps/0.jpg on disk but never selects it as a runtime image or technique frame', () => {
    const exercise = RUNTIME_CATALOG.find(x => x.id === 'mobility_alongamento_quadriceps')!;
    const wrong = '/assets/exercises/mobility_alongamento_quadriceps/0.jpg';
    expect(fs.existsSync(path.join(process.cwd(), 'public', wrong.slice(1)))).toBe(true);
    expect(exercise.images).toEqual(['/assets/exercises/mobility_alongamento_quadriceps/1.jpg']);
    expect(getTechniqueFrames(exercise).map(x => x.image)).toEqual(exercise.images);
  });
});
