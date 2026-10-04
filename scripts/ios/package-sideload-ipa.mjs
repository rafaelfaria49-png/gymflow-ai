// GOAL-129: requires macOS/Xcode; never signs, exports with a team, or edits the archive.
import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { artifactName, auditTreeSecurity, assertTreesEqual, fileSha256, ipaName, REQUIRED_GATES, REPOSITORY, requireCondition, sha256, SIGNING_STATUS, treeManifest, validateArchive, validatePayloadEntries, validateSourceSha, validateWebExport, verifyArtifactDirectory, WORKFLOW, zipEntryNames } from './sideload-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function run(tool, args, options = {}) {
  const result = spawnSync(tool, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, shell: false, cwd: ROOT, ...options });
  requireCondition(result.status === 0, `${path.basename(tool)} ${args[0] ?? ''} failed (exit ${result.status ?? 'spawn'}); packaging stopped.`);
  return result.stdout.trim();
}
function plist(file) {
  // xcarchive's CreationDate is an NSDate, which plutil cannot serialize to JSON.
  // Extract the audited application dictionary without converting/mutating the archive.
  if (path.basename(file) === 'Info.plist' && path.dirname(file).endsWith('.xcarchive')) {
    return { ApplicationProperties: JSON.parse(run('/usr/bin/plutil', ['-extract', 'ApplicationProperties', 'json', '-o', '-', '--', file])) };
  }
  return JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', file]));
}
function capabilities(bundle) {
  const sourceFiles = run('git', ['ls-files', '-z', 'ios']).split('\0').filter(file => file.endsWith('.entitlements'));
  const declared = sourceFiles.map(file => ({ path: file, keys: Object.keys(plist(path.join(ROOT, file))).sort() }));
  const project = readFileSync(path.join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  requireCondition(!/SystemCapabilities\s*=\s*\{/.test(project), 'Xcode SystemCapabilities require an explicit free-account compatibility assessment; no capability is removed.');
  const embedded = [];
  for (const binary of bundle.binaries) {
    if (binary.slices.some(slice => slice.hasCodeSignature)) {
      const xml = run('/usr/bin/codesign', ['--display', '--entitlements', '-', '--xml', path.join(bundle.app, binary.path)]);
      const values = xml ? JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'], { input: xml })) : {};
      embedded.push({ path: binary.path, keys: Object.keys(values).sort() });
    }
  }
  const keys = [...new Set([...declared, ...embedded].flatMap(entry => entry.keys))].sort();
  requireCondition(keys.length === 0, `Entitlements need free-account compatibility review: ${keys.join(', ')}. No entitlement is removed.`);
  return { declared, embedded, entitlementKeys: keys, freeAccountCapabilityAssessment: 'NO_ADDITIONAL_CAPABILITIES_DETECTED', physicalSigningProven: false };
}
export function packageSideloadIpa({ archive = path.join(ROOT, 'artifacts/GymFlow.xcarchive'), out = path.join(ROOT, 'out'), output = path.join(ROOT, 'artifacts/sideload') } = {}) {
  requireCondition(process.platform === 'darwin', 'Real IPA packaging requires the macOS workflow; Windows can download and verify it.');
  archive = path.resolve(archive); out = path.resolve(out); output = path.resolve(output);
  requireCondition(!output.startsWith(`${archive}${path.sep}`) && output !== archive, 'IPA output must be outside the original archive.');
  requireCondition(!existsSync(output) || readdirSync(output).length === 0, 'Output directory must be empty; existing artifacts are preserved.');
  const sourceSha = validateSourceSha(run('git', ['rev-parse', 'HEAD']));
  requireCondition(process.env.SOURCE_SHA === sourceSha, 'Recorded SOURCE_SHA differs from the actual checkout.');
  const runId = process.env.GITHUB_RUN_ID, attempt = process.env.GITHUB_RUN_ATTEMPT;
  const artifact = artifactName(sourceSha, runId, attempt);
  requireCondition(process.env.GITHUB_REPOSITORY === REPOSITORY, 'Unexpected workflow repository.');
  const bundle = validateArchive(archive, plist);
  auditTreeSecurity(archive);
  const privacy = plist(path.join(bundle.app, 'PrivacyInfo.xcprivacy'));
  requireCondition(Array.isArray(privacy.NSPrivacyAccessedAPITypes) && typeof privacy.NSPrivacyTracking === 'boolean', 'Privacy manifest is not a readable privacy declaration.');
  const web = validateWebExport(out, path.join(bundle.app, 'public'));
  const capabilityAudit = capabilities(bundle);
  const work = mkdtempSync(path.join(os.tmpdir(), 'gymflow-ipa-'));
  try {
    const stagedApp = path.join(work, 'Payload/App.app');
    mkdirSync(path.dirname(stagedApp), { recursive: true });
    run('/usr/bin/ditto', ['--norsrc', '--noextattr', bundle.app, stagedApp]);
    assertTreesEqual(bundle.manifest, treeManifest(stagedApp), 'Copied App.app');
    requireCondition((lstatSync(bundle.app).mode & 0o777) === (lstatSync(stagedApp).mode & 0o777), 'App.app directory mode changed.');
    const publish = path.join(work, 'publish'); mkdirSync(publish);
    const name = ipaName(sourceSha), ipa = path.join(publish, name);
    // -y stores links as links. Executable Unix modes are retained by zip/unzip.
    run('/usr/bin/zip', ['-qry', ipa, 'Payload'], { cwd: work });
    run('/usr/bin/unzip', ['-tq', ipa]);
    const entries = zipEntryNames(readFileSync(ipa));
    validatePayloadEntries(entries, bundle.info.CFBundleExecutable);
    const extracted = path.join(work, 'extracted'); mkdirSync(extracted);
    run('/usr/bin/unzip', ['-q', ipa, '-d', extracted]);
    requireCondition(JSON.stringify(readdirSync(extracted)) === '["Payload"]' && JSON.stringify(readdirSync(path.join(extracted, 'Payload'))) === '["App.app"]', 'IPA must extract to exactly Payload/App.app.');
    assertTreesEqual(bundle.manifest, treeManifest(path.join(extracted, 'Payload/App.app')), 'Extracted IPA');
    assertTreesEqual(bundle.manifest, treeManifest(bundle.app), 'Original archive after packaging');
    auditTreeSecurity(path.join(extracted, 'Payload/App.app'));
    const metadata = {
      schema_version: 1, source_sha: sourceSha,
      pr_head_sha: process.env.PR_HEAD_SHA || null, github_sha: process.env.GITHUB_SHA,
      checkout_ref: sourceSha,
      workflow: { repository: REPOSITORY, name: process.env.GITHUB_WORKFLOW, path: `.github/workflows/${WORKFLOW}`, run_id: runId, run_attempt: attempt, event: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF, request_id: process.env.IPA_REQUEST_ID || null, url: `https://github.com/${REPOSITORY}/actions/runs/${runId}`, artifact_name: artifact },
      created_at: new Date().toISOString(), signing_status: SIGNING_STATUS,
      checkpoints: { IPA_BUILD: 'PASS', WINDOWS_DOWNLOAD: 'PENDING', SIDELOAD_SIGNING: 'PENDING', IPHONE_INSTALL: 'PENDING', IPHONE_PHYSICAL_QA: 'PENDING' },
      toolchain: { runner: 'macos-26', architecture: run('/usr/bin/uname', ['-m']), macos: run('/usr/bin/sw_vers', ['-productVersion']), macos_build: run('/usr/bin/sw_vers', ['-buildVersion']), xcode: run('/usr/bin/xcodebuild', ['-version']), developer_directory: run('/usr/bin/xcode-select', ['-p']), iphoneos_sdk: run('/usr/bin/xcrun', ['--sdk', 'iphoneos', '--show-sdk-version']), node: process.version, npm: run('npm', ['--version']), cocoapods: run('pod', ['--version']) },
      build: { configuration: 'Release', destination: 'generic/platform=iOS', code_signing_allowed: 'NO', code_signing_required: 'NO', code_sign_identity: '' },
      bundle: { identifier: bundle.info.CFBundleIdentifier, version: bundle.info.CFBundleShortVersionString, build: bundle.info.CFBundleVersion, minimum_ios: bundle.info.MinimumOSVersion, executable: bundle.info.CFBundleExecutable, app_icon: bundle.info.CFBundleIcons.CFBundlePrimaryIcon, privacy_manifest: 'PrivacyInfo.xcprivacy', bytes: bundle.manifest.reduce((sum, entry) => sum + (entry.bytes || 0), 0), tree_sha256: sha256(JSON.stringify(bundle.manifest)) },
      binaries: bundle.binaries, capabilities: capabilityAudit, web,
      security: { sensitive_files: 0, sensitive_values: 0, apple_credentials_used: false, distribution_encryption: false },
      gates: Object.fromEntries(REQUIRED_GATES.map(gate => [gate, 'PASS'])),
      ipa: { name, bytes: lstatSync(ipa).size, sha256: fileSha256(ipa), payload: 'Payload/App.app', zip_entries: entries.length },
      limitations: ['Unsigned IPA requires local signing before installation.', 'Privacy manifest presence is not legal approval.', 'Native installation, AI request and physical QA remain unproven until tested on the real iPhone.'],
    };
    writeFileSync(path.join(publish, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
    copyFileSync(path.join(ROOT, 'docs/mobile/IOS_SIDELOAD_WINDOWS_129.md'), path.join(publish, 'SIDELOAD_GUIDE.md'));
    appendFileSync(path.join(publish, 'SIDELOAD_GUIDE.md'), `\n## Artefato desta execução\n\nSOURCE_SHA: ${sourceSha}\n\nRUN_ID: ${runId} (attempt ${attempt})\n\nIPA: ${name}\n\nBYTES: ${metadata.ipa.bytes}\n\nSHA256: ${metadata.ipa.sha256}\n\nSIGNING_STATUS: ${SIGNING_STATUS}\n`);
    writeFileSync(path.join(publish, 'SHA256SUMS.txt'), [name, 'metadata.json', 'SIDELOAD_GUIDE.md'].map(file => `${fileSha256(path.join(publish, file))}  ${file}`).join('\n') + '\n');
    verifyArtifactDirectory(publish, { sourceSha, runId, runAttempt: attempt });
    mkdirSync(output, { recursive: true });
    for (const file of readdirSync(publish)) copyFileSync(path.join(publish, file), path.join(output, file));
    verifyArtifactDirectory(output, { sourceSha, runId, runAttempt: attempt });
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `artifact_name=${artifact}\nipa_name=${name}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### IPA sem assinatura para reassinatura local\n\n- SOURCE_SHA: \`${sourceSha}\`\n- PR_HEAD_SHA: \`${metadata.pr_head_sha ?? 'n/a'}\`\n- GITHUB_SHA (event/merge ref): \`${metadata.github_sha}\`\n- IPA: \`${name}\` (${metadata.ipa.bytes} bytes)\n- SHA256: \`${metadata.ipa.sha256}\`\n- SIGNING_STATUS: **${SIGNING_STATUS}**\n- IPA_BUILD: PASS; instalação e QA físico: PENDING\n`);
    console.log(`[ios:ipa:package] PASS ${name} ${metadata.ipa.bytes} bytes SHA256=${metadata.ipa.sha256} ${SIGNING_STATUS}`);
    return metadata;
  } finally { rmSync(work, { recursive: true, force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { archive: { type: 'string' }, out: { type: 'string' }, output: { type: 'string' } }, strict: true });
    packageSideloadIpa(values);
  } catch (error) { console.error(`[ios:ipa:package] ${error.message}`); process.exitCode = 1; }
}
