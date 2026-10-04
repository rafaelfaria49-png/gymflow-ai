import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RUNTIME_CATALOG } from '../../mock/exercises';
import { getTechniqueFrames, TECHNIQUE_BATCH_001_EXERCISE_IDS } from '../../lib/techniqueFrames';
import { getPublishedLocalMedia, getPublishedLocalMediaPaths, PUBLISHED_LOCAL_MEDIA_EXERCISE_IDS } from './publishedLocalMedia';
import { usableLocalMediaPaths } from './localMediaPolicy';
import { getExerciseMedia } from './manifest';
import { resolveMediaRenderTier } from './fallbackChain';

const EXPECTED_IDS = [
  'triceps_frances_unilateral_cabo', 'triceps_testa_cabo', 'triceps_maquina',
  'legs_leg_press_90', 'legs_agachamento_pendulo', 'legs_afundo_smith',
  'legs_agachamento_bulgaro_smith', 'legs_flexora_em_pe_maquina',
  'legs_flexora_articulada', 'legs_stiff_smith', 'legs_aducao_cabo', 'legs_agachamento_sumo_smith',
];
const file = (url: string) => path.join(process.cwd(), 'public', url.slice(1));
const hash = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');

describe('GOAL-128 human-authorized local runtime publication', () => {
  it('publishes exactly 12 IDs / 35 frames, with no synthesized machine midpoint', () => {
    expect(PUBLISHED_LOCAL_MEDIA_EXERCISE_IDS).toEqual(EXPECTED_IDS);
    expect(EXPECTED_IDS.flatMap(id => getPublishedLocalMediaPaths(id)!)).toHaveLength(35);
    expect(EXPECTED_IDS.filter(id => getPublishedLocalMediaPaths(id)?.length === 3)).toHaveLength(11);
    expect(fs.existsSync(file('/assets/exercises/triceps_maquina/2.jpg'))).toBe(false);
    expect(getPublishedLocalMedia('triceps_maquina')?.humanDecision).toBe('TWO_FRAME_EXCEPTION_01_03');
  });

  it.each(EXPECTED_IDS)('%s resolves its own existing paths and initial cover', id => {
    const exercise = RUNTIME_CATALOG.find(e => e.id === id)!;
    const count = id === 'triceps_maquina' ? 2 : 3;
    const expectedPaths = Array.from({length: count}, (_, index) => `/assets/exercises/${id}/${index}.jpg`);
    expect(exercise.images).toEqual(expectedPaths);
    expect(exercise.images?.[0]).toBe(`/assets/exercises/${id}/0.jpg`);
    const frames = getTechniqueFrames(exercise);
    expect(frames.map(frame => frame.image)).toEqual(expectedPaths);
    expect(frames.map(frame => frame.label)).toEqual(count === 2 ? ['Posição inicial', 'Execução / posição final'] : ['Posição inicial', 'Meio da execução', 'Posição final']);
    expect(frames.every(frame => frame.cue.length > 30)).toBe(true);
    expect(expectedPaths.every(url => fs.existsSync(file(url)))).toBe(true);
    const resolved = resolveMediaRenderTier(getExerciseMedia(id), {legacyFrames: frames});
    expect(resolved.tier).toBe('frames');
    expect(resolved.frames.map(frame => frame.url)).toEqual(expectedPaths);
    expect(resolved.videoAsset).toBeNull();
  });

  it('preserves hash-to-hash provenance, source decisions/caveats and the byte budget', () => {
    const publication = JSON.parse(fs.readFileSync('docs/media/runtime/GYMFLOW-RUNTIME-MEDIA-PUBLISH-128/publication.json', 'utf8'));
    expect(publication.RUNTIME_PUBLICATION_HUMAN_AUTHORIZED).toBe('YES');
    expect(publication.exerciseIds).toEqual(EXPECTED_IDS);
    expect(publication.assets).toHaveLength(35);
    expect(publication.TRICEPS_FRAMES).toBe(8);
    expect(publication.LEGS_FRAMES).toBe(27);
    let bytes = 0;
    for (const asset of publication.assets) {
      const actual = fs.readFileSync(file(asset.runtimePath));
      expect(hash(actual), asset.runtimePath).toBe(asset.RUNTIME_SHA256);
      expect(actual.length).toBe(asset.RUNTIME_BYTES);
      expect(asset.SOURCE_SHA256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset.SOURCE_BYTES).toBeGreaterThan(asset.RUNTIME_BYTES);
      expect(asset).toMatchObject({codec: 'jpeg', width: 1024, height: 1536, crop: false, resized: false, progressive: true});
      bytes += actual.length;
    }
    expect(bytes).toBe(publication.RUNTIME_MEDIA_TOTAL_BYTES);
    expect(bytes).toBeLessThanOrEqual(12 * 1048576);
    const machine = publication.assets.filter((asset: {exerciseId: string}) => asset.exerciseId === 'triceps_maquina');
    expect(machine.map((asset: {phase: string}) => asset.phase)).toEqual(['01_inicial', '03_final']);
    expect(getPublishedLocalMedia('triceps_frances_unilateral_cabo')?.caveat).toContain('cotovelo/braço superior');
    expect(publication.assets.find((asset: {exerciseId: string}) => asset.exerciseId === 'triceps_frances_unilateral_cabo').sourceAgentReview.OVERALL).toBe('NEEDS_HUMAN_REVIEW');
  });

  it('keeps Sissy deferred and unpublished and never publishes an unknown ID', () => {
    const sissy = RUNTIME_CATALOG.find(e => e.id === 'legs_agachamento_sissy')!;
    expect(sissy.images).toEqual([]);
    expect(getTechniqueFrames(sissy)[0].image).toBe('');
    expect(getPublishedLocalMediaPaths(sissy.id)).toBeNull();
    expect(fs.existsSync(file(`/assets/exercises/${sissy.id}/0.jpg`))).toBe(false);
    expect(getPublishedLocalMediaPaths('toString')).toBeNull();
    expect(getPublishedLocalMediaPaths('unknown')).toBeNull();
  });

  it('continues quarantining blocked local media while preserving the original file', () => {
    const blocked = '/assets/exercises/mobility_alongamento_quadriceps/0.jpg';
    const usable = '/assets/exercises/mobility_alongamento_quadriceps/1.jpg';
    expect(usableLocalMediaPaths([blocked, usable])).toEqual([usable]);
    expect(fs.existsSync(file(blocked))).toBe(true);
    expect(RUNTIME_CATALOG.find(e => e.id === 'mobility_alongamento_quadriceps')?.images).toEqual([usable]);
  });

  it('keeps all ten old five-frame sequences byte-for-byte intact', () => {
    const baseline = JSON.parse(fs.readFileSync('docs/media/runtime/GYMFLOW-RUNTIME-MEDIA-PUBLISH-128/preservation-baseline.json', 'utf8'));
    const protectedFrames = baseline.protectedFiles.filter((entry: {path: string}) => entry.path.includes('/sequence/'));
    expect(protectedFrames).toHaveLength(50);
    for (const id of TECHNIQUE_BATCH_001_EXERCISE_IDS) {
      const frames = getTechniqueFrames(RUNTIME_CATALOG.find(e => e.id === id));
      expect(frames).toHaveLength(5);
      expect(frames.map(frame => frame.label)).toEqual(['Posição inicial', 'Início do movimento', 'Meio da execução', 'Contração / posição final', 'Retorno controlado']);
    }
    for (const entry of protectedFrames) expect(hash(fs.readFileSync(entry.path)), entry.path).toBe(entry.sha256);
  });
});
