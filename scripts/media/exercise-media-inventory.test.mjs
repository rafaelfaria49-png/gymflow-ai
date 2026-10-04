import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { buildInventory, generateArtifacts, auditRuntimeCatalog, EXPECTED_SEQUENCE_IDS, APPROVED_VIDEO_IDS } from './exercise-media-inventory.mjs';
import { BASE_CATALOG_126, LOTE_6_EXPANSION, LOTE_7_EXPANSION, RUNTIME_CATALOG, MOCK_EXERCISES, MEDIA_CATALOG_SCOPE } from '../../src/mock/exercises';
import { PUBLISHED_LOCAL_MEDIA_EXERCISE_IDS } from '../../src/domain/media/publishedLocalMedia';

let cached;
const inventory = () => cached ??= buildInventory(process.cwd());

describe('GOAL-124 runtime exercise media inventory', () => {
  it('contains exactly the 184 runtime IDs once each and preserves the 126 base IDs', async () => {
    const data = await inventory();
    const ids = data.exercises.map(x => x.exerciseId);
    expect(data.auditStatus.exerciseMediaGenerated).toBe(false);
    expect(data.auditStatus.mediaApprovalChanged).toBe(false);
    expect(data.auditStatus.readyForMediaGenerationGoal).toBe(false);
    expect(data.schemaVersion).toBe(2);
    expect(MEDIA_CATALOG_SCOPE).toBe('RUNTIME_CATALOG');
    expect(MOCK_EXERCISES).toBe(RUNTIME_CATALOG);
    expect(data.scope.canonicalCatalogCount).toBe(184);
    expect(ids).toHaveLength(184);
    expect(new Set(ids).size).toBe(184);
    expect(ids.slice().sort()).toEqual(RUNTIME_CATALOG.map(x => x.id).sort());
    expect(data.scope.canonicalSource).toBe('src/mock/exercises.ts#RUNTIME_CATALOG');
    expect(BASE_CATALOG_126).toHaveLength(126);
    expect(LOTE_6_EXPANSION).toHaveLength(29);
    expect(LOTE_7_EXPANSION).toHaveLength(29);
    expect(BASE_CATALOG_126.map(x => x.id)).toEqual(JSON.parse(fs.readFileSync('scripts/media/goal-123-baseline.json', 'utf8')).baseCatalogIds);
    expect(data.exercises.filter(x => x.catalogOrigin === 'LOTE_6')).toHaveLength(29);
    expect(data.exercises.filter(x => x.catalogOrigin === 'LOTE_7')).toHaveLength(29);
    expect(data.auditStatus.catalogRuntimeReconciled).toBe(true);
    expect(data.auditStatus.inventoryRuntimeComplete).toBe(true);
  });

  it('matches disk paths after exactly 12 authorized local sequences close their gaps', async () => {
    const data = await inventory();
    expect(data.counts.assetDirectories).toBe(137);
    expect(data.missingAssetDirectories.slice().sort()).toEqual(['triceps_maquina', ...LOTE_6_EXPANSION.map(x => x.id), ...LOTE_7_EXPANSION.map(x => x.id)].filter(id => !PUBLISHED_LOCAL_MEDIA_EXERCISE_IDS.includes(id)).sort());
    expect(data.counts.missingAssetDirectories).toBe(47);
    expect(data.counts.noMediaRuntimeCount).toBe(47);
    expect(data.historicalBaseline.counts.missingAssetDirectories).toBe(1);
    expect(data.baseCatalogCurrent.missingAssetDirectories).toEqual([]);
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
    expect(data.counts.manifestEntries).toBe(25);
    expect(data.counts.historicalManifestEntries).toBe(3);
    expect(data.counts.totalManifestRecords).toBe(28);
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

  it('preserves draft/retired videos and records the authorized two-frame exception', async () => {
    const data = await inventory();
    expect(data.counts.videoDraftCount).toBe(25);
    expect(data.counts.videoRetiredCount).toBe(1);
    expect(data.exercises.filter(x => x.videoStatus === 'draft' && x.videoIsRealApproved)).toEqual([]);
    expect(data.exercises.find(x => x.exerciseId === 'triceps_maquina').mediaCoverageClass).toBe('LOCAL_RUNTIME_TWO_FRAME_EXCEPTION');
    expect(data.exercises.find(x => x.exerciseId === 'legs_agachamento_sissy').mediaCoverageClass).toBe('NO_MEDIA');
  });

  it('resolves each of the 11 structural findings with historical records retained', async () => {
    const data = await inventory();
    expect(data.historicalBaseline.findings).toHaveLength(11);
    expect(data.historicalBaseline.findings.filter(x => x.type.startsWith('BROKEN_'))).toHaveLength(4);
    expect(data.reconciliation.findings).toHaveLength(11);
    expect(data.reconciliation.findings.every(x => x.status === 'RESOLVED')).toBe(true);
    expect(data.unmatchedManifestEntries).toEqual([]);
    expect(data.validation.mappedVideoIdOrphans).toEqual([]);
    expect(data.validation.brokenManifestAssetPaths).toEqual([]);
    expect(data.validation.anomalies).toEqual([]);
    expect(data.reconciliation.activeBrokenPathCount).toBe(0);
    expect(data.reconciliation.historicalBrokenPaths).toHaveLength(3);
    expect(data.reconciliation.historicalBrokenPaths.every(x => x.served === false)).toBe(true);
    expect(data.auditStatus.structuralMediaP0).toBe(0);
    expect(data.auditStatus.structuralMediaP1).toBe(0);
  });

  it('records visually confirmed issues and leaves dHash-only pairs unconfirmed', async () => {
    const data = await inventory();
    const quadriceps = data.exercises.find(x => x.exerciseId === 'mobility_alongamento_quadriceps');
    expect(quadriceps.visualFlags).toContain('WRONG_EXERCISE');
    expect(quadriceps.galleryCoverCandidate).toBe('EXISTING_1');
    expect(quadriceps.galleryCoverPath).toBe('/assets/exercises/mobility_alongamento_quadriceps/1.jpg');
    expect(quadriceps.galleryCoverNeedsHumanApproval).toBe(true);
    expect(quadriceps.localImageCount).toBe(2);
    expect(quadriceps.galleryCoverStatus).toBe('COVER_NEEDS_REVIEW');
    expect(quadriceps.galleryCoverBlockedImagePaths).toEqual(['/assets/exercises/mobility_alongamento_quadriceps/0.jpg']);
    expect(RUNTIME_CATALOG.find(x => x.id === quadriceps.exerciseId).images).toEqual([quadriceps.galleryCoverPath]);
    expect(data.validation.exactDuplicateImagePairs).toHaveLength(2);
    expect(data.validation.exactDuplicateImagePairs.every(x => x.classification === 'DUPLICATE_EXACT' && x.review === 'HUMAN_REVIEW_REQUIRED')).toBe(true);
    expect(data.validation.exactDuplicateImagePairs.map(({ pathA, pathB }) => ({ pathA, pathB }))).toEqual(JSON.parse(fs.readFileSync('scripts/media/goal-123-baseline.json', 'utf8')).exactDuplicateImagePairs);
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
    const missing = data.exercises.find(x => x.exerciseId === 'legs_agachamento_sissy');
    expect(missing.techniqueMappingExists).toBe(false);
    expect(missing.techniqueFramesAvailable).toBe(false);
    expect(missing.techniqueFallbackRisk.level).toBe('high');
    expect(missing.priority).toBe('P1');
    expect(missing.recommendedNextAction).toBe('GENERATE_REFERENCE_IMAGES');
    const legacy = data.exercises.find(x => x.exerciseId === 'chest_supino_haltere');
    expect(legacy.techniqueMappingExists).toBe(false);
    expect(legacy.techniqueFramesAvailable).toBe(true);
  });
  it('checks generated reports across Windows line ending conversion', async () => {
    const result = await generateArtifacts(process.cwd(), true);
    expect(result.checked).toBe(true);
  });
  it('audits ambiguous names/search hints without creating canonical aliases', async () => {
    const audit = (await inventory()).validation.catalogAudit;
    expect(audit.duplicatedRuntimeIds).toEqual([]);
    expect(audit.invalidRuntimeIds).toEqual([]);
    expect(audit.lotOverlaps).toEqual([]);
    expect(audit.lotIdsMissingFromRuntime).toEqual([]);
    expect(audit.runtimeIdsWithoutLot).toEqual([]);
    expect(audit.duplicateNormalizedNames.map(x => x.exerciseIds)).toEqual([['biceps_rosca_direta', 'biceps_rosca_w']]);
    expect(audit.aliasConflicts).toEqual([expect.objectContaining({ term: 'leg press 45', review: 'HUMAN_REVIEW_REQUIRED' })]);
    expect(audit.sharedSearchTerms.every(x => x.classification === 'MULTI_MATCH_SEARCH_HINT')).toBe(true);
    expect(audit.semanticNameCandidates.every(x => x.action === 'PRESERVE_IDS_NO_MEDIA_REMAP')).toBe(true);
  });
  it('detects duplicate/invalid IDs, missing IDs and overlapping lots in a damaged catalog', () => {
    const damaged = RUNTIME_CATALOG.slice();
    damaged[0] = { ...damaged[0], id: 'INVALID/ID' };
    damaged.push(damaged[1]);
    const audit = auditRuntimeCatalog(damaged, BASE_CATALOG_126, LOTE_6_EXPANSION, [...LOTE_7_EXPANSION, LOTE_6_EXPANSION[0]]);
    expect(audit.duplicatedRuntimeIds).toEqual([damaged[1].id]);
    expect(audit.invalidRuntimeIds).toEqual(['INVALID/ID']);
    expect(audit.lotIdsMissingFromRuntime).toContain(RUNTIME_CATALOG[0].id);
    expect(audit.lotOverlaps).toEqual([{ exerciseId: LOTE_6_EXPANSION[0].id, lots: ['LOTE_6', 'LOTE_7'] }]);
  });
  it('does not assume media exists for either expansion lot', async () => {
    for (const row of (await inventory()).exercises.filter(x => x.catalogOrigin !== 'BASE_CATALOG_126' && !PUBLISHED_LOCAL_MEDIA_EXERCISE_IDS.includes(x.exerciseId))) {
      expect(row).toMatchObject({ assetDirectoryExists: false, localImageCount: 0, sequenceFrameCount: 0, manifestEntryExists: false, videoStatus: null, galleryCoverCandidate: 'NONE', mediaCoverageClass: 'NO_MEDIA', priority: 'P1', recommendedNextAction: 'GENERATE_REFERENCE_IMAGES' });
    }
  });
  it('preserves all original asset status, identity and provenance in active or historical records', async () => {
    const baseline = JSON.parse(fs.readFileSync('scripts/media/goal-123-baseline.json', 'utf8'));
    const manifest = JSON.parse(fs.readFileSync('src/domain/media/manifest.json', 'utf8'));
    const hash = asset => crypto.createHash('sha256').update(JSON.stringify(asset)).digest('hex');
    const entries = { ...manifest.assets, ...manifest.historicalAssets };
    const assets = Object.values(entries).flatMap(x => [x.thumbnail, x.video, ...(x.frames ?? [])].filter(Boolean)).concat(Object.values(baseline.deactivatedManifestFrames).flat());
    const byId = new Map(assets.map(x => [x.id, x]));
    expect(byId.size).toBe(Object.keys(baseline.manifestAssetFingerprints).length);
    for (const [id, original] of Object.entries(baseline.manifestAssetFingerprints)) {
      expect(byId.get(id)?.status, id).toBe(original.status);
      expect(hash(byId.get(id)), id).toBe(original.sha256);
    }
    for (const [id, entry] of Object.entries(manifest.historicalAssets)) expect(hash(entry), id).toBe(baseline.manifestEntryFingerprints[id]);
    expect((await inventory()).validation.preservedAssetChanges).toEqual([]);
  });
  it('separates local authorization for 12 covers from the 125 legacy candidates', async () => {
    const data = await inventory();
    expect(data.counts.galleryCoverClassCounts).toEqual({ COVER_EXISTING_CANDIDATE: 122, COVER_NEEDS_REVIEW: 3, COVER_LOCAL_RUNTIME_AUTHORIZED: 12, COVER_MISSING: 47, COVER_BLOCKED_WRONG_MEDIA: 0 });
    expect(Object.values(data.counts.galleryCoverClassCounts).reduce((a, b) => a + b, 0)).toBe(184);
    expect(data.counts.galleryCoverAvailableCandidateCount).toBe(137);
    expect(data.counts.galleryCoverHumanApprovalPendingCount).toBe(125);
    expect(data.counts.galleryCoverReadyCount).toBe(12);
    expect(data.runtimePublication).toMatchObject({exerciseCount: 12, frameCount: 35, threeFrameExercises: 11, twoFrameExercises: 1});
    expect(data.exercises.filter(x => x.runtimePublished).map(x => x.exerciseId).sort()).toEqual([...PUBLISHED_LOCAL_MEDIA_EXERCISE_IDS].sort());
    for (const row of data.exercises.filter(x => x.runtimePublished)) {
      expect(row.galleryCoverPath).toBe(`/assets/exercises/${row.exerciseId}/0.jpg`);
      expect(row.galleryCoverNeedsHumanApproval).toBe(false);
      expect(row.priority).toBe('P4');
      expect(row.recommendedNextAction).toBe('PRESERVE_PUBLISHED_LOCAL_SEQUENCE');
    }
  });
  it('allows reference intake but keeps generation blocked by the missing official reference', async () => {
    const data = await inventory();
    expect(data.personalReference.status).toBe('MISSING_OFFICIAL_VISUAL_REFERENCE');
    expect(data.personalReference.sufficientForSamePersonalGeneration).toBe(false);
    expect(data.auditStatus.readyForPersonalReferenceIntake).toBe(true);
    expect(data.auditStatus.readyForMediaGenerationGoal).toBe(false);
  });
});
