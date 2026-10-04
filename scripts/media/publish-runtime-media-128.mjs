// Re-encode only the immutable, human-selected PNGs; never generate source media.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PUBLICATION_FILE = 'docs/media/runtime/GYMFLOW-RUNTIME-MEDIA-PUBLISH-128/publication.json';
export const PUBLICATION_IDS = [
  'triceps_frances_unilateral_cabo', 'triceps_testa_cabo', 'triceps_maquina',
  'legs_leg_press_90', 'legs_agachamento_pendulo', 'legs_afundo_smith',
  'legs_agachamento_bulgaro_smith', 'legs_flexora_em_pe_maquina',
  'legs_flexora_articulada', 'legs_stiff_smith', 'legs_aducao_cabo',
  'legs_agachamento_sumo_smith',
];
export const JPEG_OPTIONS = {quality: 92, progressive: true, mozjpeg: true, chromaSubsampling: '4:4:4'};
const tricepsRoot = 'docs/media/pilots/GYMFLOW-MEDIA-PILOT-TRICEPS-001';
const legsRoot = 'docs/media/staging/GYMFLOW-MEDIA-LEGS-BATCH-001-126';
export const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const readJson = (root, file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

export function selectedSources(root = ROOT) {
  const triceps = readJson(root, `${tricepsRoot}/pilot-manifest.json`);
  const legs = readJson(root, `${legsRoot}/batch-manifest.json`);
  const provenance = {
    triceps: readJson(root, `${tricepsRoot}/provenance-essential.json`),
    legs: readJson(root, `${legsRoot}/provenance-essential.json`),
  };
  return PUBLICATION_IDS.flatMap(exerciseId => {
    const isLeg = exerciseId.startsWith('legs_');
    const manifest = isLeg ? legs : triceps;
    const exercise = manifest.exercises.find(e => e.id === exerciseId);
    const phases = exerciseId === 'triceps_maquina' ? ['01_inicial', '03_final'] : ['01_inicial', '02_intermediaria', '03_final'];
    assert(exercise && JSON.stringify(exercise.frames.map(f => f.phase)) === JSON.stringify(phases), `Selection changed: ${exerciseId}`);
    const humanDecision = isLeg ? exercise.humanDecision.decision : exerciseId === 'triceps_frances_unilateral_cabo' ? 'ACCEPTED_WITH_CAVEAT' : exerciseId === 'triceps_maquina' ? 'TWO_FRAME_EXCEPTION_01_03' : 'ACCEPTED';
    assert(['ACCEPTED', 'ACCEPTED_WITH_CAVEAT', 'TWO_FRAME_EXCEPTION_01_03'].includes(humanDecision), `Human decision not accepted: ${exerciseId}`);
    return exercise.frames.map((f, index) => {
      assert(isLeg ? f.selectionStatus === 'FINAL_SELECTED' : f.status === 'PILOT_SELECTED', `Unselected: ${exerciseId}/${f.phase}`);
      if (isLeg) assert(legs.FINAL_SELECTED.some(s => s.provenanceId === f.provenanceId && s.sha256 === f.sha256), `Not in FINAL_SELECTED: ${exerciseId}/${f.phase}`);
      const attempt = provenance[isLeg ? 'legs' : 'triceps'].attempts.find(a => a.id === f.provenanceId);
      assert(attempt?.outputSha256 === f.sha256, `Provenance differs: ${exerciseId}/${f.phase}`);
      return {
        exerciseId, phase: f.phase, sourceCandidatePath: isLeg ? f.localCandidatePath : f.artifact.localPath,
        sourceArchivePath: isLeg ? f.localArchivePath : f.attemptArchive.localPath,
        SOURCE_SHA256: f.sha256, SOURCE_BYTES: f.bytes,
        provenanceId: f.provenanceId, selectedAttempt: f.selectedAttempt,
        humanDecision, sourceHumanDecision: isLeg ? exercise.humanDecision : exercise.pilotHumanDecision,
        caveat: isLeg ? exercise.humanDecision.caveat : exercise.caveat,
        sourceLocalCommits: manifest.localHistory.commits,
        sourceHumanReview: `${isLeg ? legsRoot : tricepsRoot}/HUMAN_REVIEW_FINAL.md`,
        sourceManifest: `${isLeg ? legsRoot : tricepsRoot}/${isLeg ? 'batch' : 'pilot'}-manifest.json`,
        direction: isLeg ? exercise.direction : exercise.phaseConvention,
        phaseDefinition: isLeg ? exercise.phaseDefinitions[f.phase] : null,
        sourceAgentReview: isLeg ? {agentReview: exercise.agentReview, overall: exercise.overall, reviewNotes: exercise.reviewNotes} : exercise.agentReviewBeforeHumanDecision,
        runtimePath: `/assets/exercises/${exerciseId}/${index}.jpg`,
      };
    });
  });
}

export async function validateRuntimePublication(root = ROOT) {
  const publication = readJson(root, PUBLICATION_FILE);
  const selected = selectedSources(root);
  assert(publication.RUNTIME_PUBLICATION_HUMAN_AUTHORIZED === 'YES', 'Missing human runtime authorization');
  assert(JSON.stringify(publication.exerciseIds) === JSON.stringify(PUBLICATION_IDS), 'Publication scope changed');
  assert(publication.assets.length === 35, 'Expected exactly 35 runtime frames');
  assert(publication.RUNTIME_MEDIA_TOTAL_BYTES <= 15 * 1048576, 'Runtime exceeds 15 MiB');
  let sourceBytes = 0, runtimeBytes = 0;
  for (const [index, asset] of publication.assets.entries()) {
    const source = selected[index];
    for (const key of ['exerciseId', 'phase', 'SOURCE_SHA256', 'SOURCE_BYTES', 'provenanceId', 'humanDecision', 'caveat', 'runtimePath']) {
      assert(JSON.stringify(asset[key]) === JSON.stringify(source[key]), `Publication differs from human selection: ${key}/${source.exerciseId}/${source.phase}`);
    }
    const bytes = fs.readFileSync(path.join(root, 'public', asset.runtimePath.slice(1)));
    assert(sha256(bytes) === asset.RUNTIME_SHA256 && bytes.length === asset.RUNTIME_BYTES, `Runtime hash/bytes differ: ${asset.runtimePath}`);
    const metadata = await sharp(bytes).metadata();
    assert(metadata.format === 'jpeg' && metadata.width === 1024 && metadata.height === 1536 && metadata.isProgressive, `Runtime codec/geometry differs: ${asset.runtimePath}`);
    sourceBytes += asset.SOURCE_BYTES;
    runtimeBytes += bytes.length;
  }
  assert(sourceBytes === publication.SOURCE_TOTAL_BYTES && runtimeBytes === publication.RUNTIME_MEDIA_TOTAL_BYTES, 'Publication byte totals differ');
  return publication;
}

async function publish() {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const p = await validateRuntimePublication();
    console.log(`Runtime publication check PASS: ${p.exerciseIds.length} IDs / ${p.assets.length} frames / ${p.RUNTIME_MEDIA_TOTAL_BYTES} bytes.`);
    return;
  }
  const option = name => args[args.indexOf(name) + 1];
  assert(args.includes('--verified-preflight'), 'Pass --verified-preflight <GOAL-128 local preflight.json>.');
  const preflight = readJson('', option('--verified-preflight'));
  assert(preflight.goal === 'GYMFLOW-RUNTIME-MEDIA-PUBLISH-128' && preflight.baseSha === '0a27bb89c2d53fc28f4864e42da8c9c1fff75e2d', 'Invalid preflight');
  const sources = selectedSources();
  assert(sources.length === 35 && preflight.sourceFrames.length === 35, 'Wrong selection count');
  const prepared = [];
  // Verify ALL binaries before writing anything; any absent/divergent source stops publication.
  for (const source of sources) {
    const verified = preflight.sourceFrames.find(f => f.provenanceId === source.provenanceId);
    assert(verified?.SOURCE_SHA256 === source.SOURCE_SHA256, `Preflight selection differs: ${source.provenanceId}`);
    const input = fs.readFileSync(verified.sourcePath);
    assert(sha256(input) === source.SOURCE_SHA256 && input.length === source.SOURCE_BYTES, `STOP: source diverges: ${verified.sourcePath}`);
    const metadata = await sharp(input).metadata();
    assert(metadata.format === 'png' && metadata.width === 1024 && metadata.height === 1536 && (!metadata.orientation || metadata.orientation === 1), `Source geometry differs: ${verified.sourcePath}`);
    const derivative = await sharp(input).jpeg(JPEG_OPTIONS).toBuffer();
    prepared.push({source, sourcePath: verified.sourcePath, derivative});
  }
  const totalBytes = prepared.reduce((sum, a) => sum + a.derivative.length, 0);
  assert(totalBytes <= 15 * 1048576, 'Budget exceeded; no runtime files written');
  for (const {source, derivative} of prepared) {
    const destination = path.join(ROOT, 'public', source.runtimePath.slice(1));
    assert(!fs.existsSync(destination) || sha256(fs.readFileSync(destination)) === sha256(derivative), `Refusing to replace existing media: ${destination}`);
  }
  for (const {source, derivative} of prepared) {
    const destination = path.join(ROOT, 'public', source.runtimePath.slice(1));
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    if (!fs.existsSync(destination)) fs.writeFileSync(destination, derivative);
  }
  const assets = prepared.map(({source, sourcePath, derivative}) => ({
    ...source, sourcePath, sourceAvailability: 'IMMUTABLE_LOCAL_ARCHIVE_NOT_VERSIONED',
    RUNTIME_SHA256: sha256(derivative), RUNTIME_BYTES: derivative.length,
    codec: 'jpeg', width: 1024, height: 1536, progressive: true, crop: false, resized: false,
  }));
  const publication = {
    schemaVersion: 1, goal: preflight.goal, baseSha: preflight.baseSha,
    publicationDate: '2026-10-04', timezone: 'America/Sao_Paulo',
    RUNTIME_PUBLICATION_HUMAN_AUTHORIZED: 'YES',
    authorization: {source: 'Explicit human GOAL-128 request in this conversation', threadId: '01a106ea-0d0b-7483-856f-9c4e622feac0', requestSha256: preflight.authorizationRequestSha256, scope: 'ONLY_12_IDS_35_FRAMES_LOCAL_APK_RUNTIME', priorVisualDecisionsRemainUnmodified: true},
    exerciseIds: PUBLICATION_IDS, RUNTIME_EXERCISES_PUBLISHED: 12, RUNTIME_FRAMES_PUBLISHED: 35,
    TRICEPS_FRAMES: 8, LEGS_FRAMES: 27, THREE_FRAME_EXERCISES: 11, TWO_FRAME_EXERCISES: 1,
    excluded: {legs_agachamento_sissy: 'NO_MEDIA / DEFERRED; no cover or sequence published', triceps_maquina_02_intermediaria: 'EXCLUDED_FROM_FINAL_SEQUENCE / MIDPOINT_FAILED_BOUNDED_ATTEMPTS'},
    SOURCE_TOTAL_BYTES: assets.reduce((sum, a) => sum + a.SOURCE_BYTES, 0), RUNTIME_MEDIA_TOTAL_BYTES: totalBytes,
    COMPRESSION_RATIO: assets.reduce((sum, a) => sum + a.SOURCE_BYTES, 0) / totalBytes,
    compressionRatioDefinition: 'source bytes divided by runtime bytes',
    encoder: {name: 'sharp', versions: sharp.versions, options: JPEG_OPTIONS, deterministicReencodeVerified: true, runtimeDependencyAdded: false},
    baselineApk: {SOURCE_COMMIT: '8408a29c2507ddd3e5440bd8d7bd7e53f55478fe', SOURCE_EQUIVALENT_TO_BASE: true, equivalenceEvidence: 'git diff --name-only SOURCE_COMMIT BASE_SHA contains only docs/**; runtime/build configuration/dependency lockfiles are identical.', APK_BEFORE_BYTES: 28122019, SHA256: 'ee41413f65f0cb2ecf2d729a57c246b7c6deaf50f315218f81ba85dbb22a5a4e'},
    RUNTIME_MEDIA_CHANGED: 'YES', APPROVAL_STATUS_CHANGED: 'LOCAL_STILL_RUNTIME_PUBLICATION_ONLY', CDN_CHANGED: 'NO', PLAY_STORE_CHANGED: 'NO', NEW_SOURCE_IMAGES_GENERATED: 0,
    assets,
  };
  const output = path.join(ROOT, PUBLICATION_FILE);
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(publication, null, 2) + '\n');
  await validateRuntimePublication();
  console.log(JSON.stringify({EXERCISES: 12, FRAMES: 35, SOURCE_TOTAL_BYTES: publication.SOURCE_TOTAL_BYTES, RUNTIME_MEDIA_TOTAL_BYTES: totalBytes, COMPRESSION_RATIO: publication.COMPRESSION_RATIO}));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  publish().catch(error => {console.error(error.message); process.exitCode = 1;});
}
