import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildInventory, EXPECTED_SEQUENCE_IDS, APPROVED_VIDEO_IDS } from './exercise-media-inventory.mjs';

let cached;
const inventory = () => cached ??= buildInventory(process.cwd());

describe('GOAL-123 exercise media inventory', () => {
  it('contains exactly the 126 canonical base IDs once each', async () => {
    const data = await inventory();
    const ids = data.exercises.map(x => x.exerciseId);
    expect(data.auditStatus.exerciseMediaGenerated).toBe(false);
    expect(data.auditStatus.mediaApprovalChanged).toBe(false);
    expect(data.auditStatus.readyForMediaGenerationGoal).toBe(false);
    expect(data.scope.canonicalCatalogCount).toBe(126);
    expect(ids).toHaveLength(126);
    expect(new Set(ids).size).toBe(126);
    expect(data.scope.canonicalSource).toBe('src/mock/exercises.ts#BASE_CATALOG_126');
  });

  it('matches disk image paths and finds the triceps_maquina directory gap', async () => {
    const data = await inventory();
    expect(data.counts.assetDirectories).toBe(125);
    expect(data.missingAssetDirectories).toEqual(['triceps_maquina']);
    for (const exercise of data.exercises) {
      expect(exercise.localImagePaths).toHaveLength(exercise.localImageCount);
      expect(exercise.localImagePaths.every(p => fs.existsSync(path.join(process.cwd(), 'public', p.slice(1).replaceAll('/', path.sep))))).toBe(true);
      expect(exercise.catalogImagePaths.every(p => p.startsWith('/assets/exercises/' + exercise.exerciseId + '/'))).toBe(true);
      expect(exercise.catalogImagePaths.every(p => fs.existsSync(path.join(process.cwd(), 'public', p.slice(1).replaceAll('/', path.sep))))).toBe(true);
    }
  });

  it('keeps manifests synchronized and counts only the two real approved videos', async () => {
    const data = await inventory();
    expect(data.validation.manifestParity).toBe(true);
    expect(data.counts.manifestEntries).toBe(28);
    expect(data.counts.videoApprovedCount).toBe(2);
    expect(data.counts.validVideoApprovedCount).toBe(2);
    expect(data.counts.videoApprovedIds).toEqual([...APPROVED_VIDEO_IDS].sort());
    expect(data.exercises.filter(x => x.videoIsRealApproved).map(x => x.exerciseId).sort()).toEqual([...APPROVED_VIDEO_IDS].sort());
    expect(data.exercises.filter(x => x.videoStatus === 'draft' && x.videoIsRealApproved)).toEqual([]);
  });

  it('validates every expected sequence as five unique existing paths', async () => {
    const data = await inventory();
    expect(data.counts.sequence5Count).toBe(10);
    expect(data.counts.sequence5Ids.slice().sort()).toEqual([...EXPECTED_SEQUENCE_IDS].sort());
    for (const id of EXPECTED_SEQUENCE_IDS) {
      const exercise = data.exercises.find(x => x.exerciseId === id);
      expect(exercise.sequenceStatus).toBe('PASS_5_PATHS_VALID');
      expect(exercise.sequenceFrameCount).toBe(5);
      expect(new Set(exercise.sequenceFramePaths).size).toBe(5);
    }
  });

  it('preserves draft and retired status and detects triceps_maquina as NO_MEDIA', async () => {
    const data = await inventory();
    expect(data.counts.videoDraftCount).toBe(25);
    expect(data.counts.videoRetiredCount).toBe(1);
    expect(data.exercises.filter(x => x.videoStatus === 'draft' && x.videoIsRealApproved)).toEqual([]);
    expect(data.exercises.find(x => x.exerciseId === 'triceps_maquina').mediaCoverageClass).toBe('NO_MEDIA');
  });

  it('reports orphaned manifest entries and dangling technique-video IDs', async () => {
    const data = await inventory();
    expect(data.unmatchedManifestEntries.map(x => x.exerciseId).sort()).toEqual(['back_puxada_atras','chest_supino_declinado','legs_hack_squat'].sort());
    expect(data.validation.mappedVideoIdOrphans.length).toBeGreaterThan(0);
    expect(data.validation.anomalies.some(x => x.type === 'BROKEN_MANIFEST_ASSET_PATH')).toBe(true);
  });

  it('records visually confirmed issues and leaves dHash-only pairs unconfirmed', async () => {
    const data = await inventory();
    const quadriceps = data.exercises.find(x => x.exerciseId === 'mobility_alongamento_quadriceps');
    expect(quadriceps.visualFlags).toContain('WRONG_EXERCISE');
    expect(quadriceps.galleryCoverCandidate).toBe('EXISTING_1');
    expect(quadriceps.galleryCoverPath).toBe('/assets/exercises/mobility_alongamento_quadriceps/1.jpg');
    expect(quadriceps.galleryCoverNeedsHumanApproval).toBe(true);
    expect(data.validation.exactDuplicateImagePairs).toHaveLength(2);
    expect(data.validation.duplicateSequenceFramePairs).toEqual([]);
    const confirmed = new Set(data.validation.exactDuplicateImagePairs.flatMap(x => [x.pathA, x.pathB]));
    for (const pair of data.validation.nearDuplicateImageCandidates) {
      for (const imagePath of [pair.pathA, pair.pathB]) {
        if (confirmed.has(imagePath)) continue;
        const row = data.exercises.find(x => x.imageVisualReview.some(image => image.path === imagePath));
        const image = row?.imageVisualReview.find(x => x.path === imagePath);
        expect(image?.flags).not.toContain('DUPLICATE_OR_NEAR_DUPLICATE');
      }
    }
  });
  it('distinguishes the exercise-to-video map from honest local frame fallback', async () => {
    const data = await inventory();
    const missing = data.exercises.find(x => x.exerciseId === 'triceps_maquina');
    expect(missing.techniqueMappingExists).toBe(false);
    expect(missing.techniqueFramesAvailable).toBe(false);
    expect(missing.techniqueFallbackRisk.level).toBe('high');
    const legacy = data.exercises.find(x => x.exerciseId === 'chest_supino_haltere');
    expect(legacy.techniqueMappingExists).toBe(false);
    expect(legacy.techniqueFramesAvailable).toBe(true);
  });
});