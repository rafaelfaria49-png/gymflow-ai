// GOAL-129: portable validation shared by macOS packaging and Windows download.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, existsSync } from 'node:fs';
import path from 'node:path';
import { compareWebTrees, assistantBackendEvidence, PRODUCTION_BACKEND_ORIGIN } from '../android/play-release-lib.mjs';

export const BUNDLE_ID = 'com.gymflowai.app';
export const REPOSITORY = 'rafaelfaria49-png/gymflow-ai';
export const WORKFLOW = 'ios-distribution-readiness.yml';
export const SIGNING_STATUS = 'UNSIGNED_FOR_LOCAL_RESIGN';
export const REQUIRED_FRAMEWORKS = ['Capacitor', 'CapacitorApp', 'CapacitorFilesystem', 'CapacitorFileTransfer', 'CapacitorKeyboard', 'CapacitorShare', 'CapacitorSplashScreen', 'CapacitorStatusBar'];
export const REQUIRED_GATES = ['DEVICE_ARM64_IPHONEOS', 'NO_DISTRIBUTION_ENCRYPTION', 'BUNDLE_ID_VERSION_ICONS_PRIVACY', 'WEB_EXPORT_HASHES', 'PUBLIC_PRODUCTION_BACKEND', 'NO_SENSITIVE_FILES_OR_VALUES', 'CAPABILITIES_INSPECTED', 'ZIP_PAYLOAD_STRUCTURE', 'EXTRACTED_BUNDLE_INTEGRITY'];
export function requireCondition(ok, message) { if (!ok) throw new Error(message); }
export function sha256(data) { return createHash('sha256').update(data).digest('hex'); }
export function fileSha256(file) { return sha256(readFileSync(file)); }
export function validateSourceSha(value) {
  requireCondition(/^[a-f0-9]{40}$/.test(value ?? ''), 'SOURCE_SHA must be a full lowercase Git SHA.');
  return value;
}
export function ipaName(sourceSha) { return `GymFlow-iOS-${validateSourceSha(sourceSha).slice(0, 12)}-unsigned.ipa`; }
export function artifactName(sourceSha, runId, attempt) {
  requireCondition(/^\d+$/.test(String(runId)) && /^\d+$/.test(String(attempt)), 'Invalid workflow run/attempt.');
  return `GymFlow-iOS-${validateSourceSha(sourceSha)}-${SIGNING_STATUS}-run-${runId}-${attempt}`;
}
function within(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

// Timestamps/xattrs are deliberately excluded; file bytes, Unix modes and links are compared.
export function treeManifest(root) {
  requireCondition(existsSync(root) && lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(), `Directory missing or not physical: ${root}`);
  const canonicalRoot = realpathSync(root);
  const entries = [];
  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      requireCondition(!/[\r\n\\]/.test(name), 'Unsupported bundle filename.');
      const file = path.join(dir, name);
      const relative = path.relative(root, file).split(path.sep).join('/');
      const stat = lstatSync(file);
      const mode = stat.mode & 0o777;
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(file);
        requireCondition(!path.isAbsolute(target) && !/[\r\n]/.test(target), `Unsafe absolute symlink: ${relative}`);
        requireCondition(within(canonicalRoot, realpathSync(file)), `Symlink escapes bundle: ${relative}`);
        entries.push({ path: relative, type: 'symlink', mode, target });
      } else if (stat.isDirectory()) {
        entries.push({ path: relative, type: 'directory', mode });
        walk(file);
      } else {
        requireCondition(stat.isFile(), `Unsupported special file: ${relative}`);
        entries.push({ path: relative, type: 'file', mode, bytes: stat.size, sha256: fileSha256(file) });
      }
    }
  }
  walk(root);
  return entries;
}
export function assertTreesEqual(expected, actual, label = 'Bundle') {
  requireCondition(JSON.stringify(expected) === JSON.stringify(actual), `${label}: file bytes, modes, directories or symlinks changed.`);
}
export function fileHashes(manifest) { return Object.fromEntries(manifest.filter(e => e.type === 'file').map(e => [e.path, e.sha256])); }

// Constants/layout follow Apple's mach-o/loader.h; arm64 alone does not prove a device binary.
function thinMachO(data) {
  requireCondition(data.length >= 32 && data.readUInt32LE(0) === 0xfeedfacf, 'Expected a 64-bit little-endian Mach-O.');
  const cpu = data.readUInt32LE(4), fileType = data.readUInt32LE(12);
  const count = data.readUInt32LE(16), commandBytes = data.readUInt32LE(20);
  const end = 32 + commandBytes;
  requireCondition(end <= data.length && count > 0 && count <= commandBytes / 8, 'Truncated/invalid Mach-O load commands.');
  let offset = 32, platform = null, signature = false;
  const cryptids = [], dependencies = [];
  for (let i = 0; i < count; i++) {
    requireCondition(offset + 8 <= end, 'Truncated Mach-O command.');
    const cmd = data.readUInt32LE(offset), size = data.readUInt32LE(offset + 4);
    requireCondition(size >= 8 && size % 8 === 0 && offset + size <= end, 'Invalid Mach-O command size.');
    if (cmd === 0x32) {
      requireCondition(size >= 24 && platform === null, 'Invalid/duplicate LC_BUILD_VERSION.');
      platform = data.readUInt32LE(offset + 8);
    }
    if (cmd === 0x21 || cmd === 0x2c) {
      requireCondition(size >= (cmd === 0x2c ? 24 : 20), 'Invalid encryption command.');
      cryptids.push(data.readUInt32LE(offset + 16));
    }
    if (cmd === 0x1d) signature = true;
    if ([0xc, 0x80000018, 0x8000001f, 0x80000023].includes(cmd)) {
      requireCondition(size >= 24, 'Invalid dylib command.');
      const start = data.readUInt32LE(offset + 8);
      requireCondition(start >= 24 && start < size, 'Invalid dylib name offset.');
      dependencies.push(data.subarray(offset + start, offset + size).toString('utf8').split('\0')[0]);
    }
    offset += size;
  }
  requireCondition(offset === end, 'Mach-O command count does not match header.');
  return { architecture: cpu === 0x100000c ? 'arm64' : `cpu-${cpu}`, cpu, fileType, platform, cryptids, hasCodeSignature: signature, dependencies };
}
export function inspectMachO(data) {
  if (data.length < 4) return null;
  const magic = data.readUInt32BE(0);
  if (magic === 0xcffaedfe) return [thinMachO(data)];
  if ([0xcefaedfe, 0xfeedface, 0xfeedfacf].includes(magic)) throw new Error('Unsupported Mach-O architecture/byte order.');
  if (![0xcafebabe, 0xcafebabf, 0xbebafeca, 0xbfbafeca].includes(magic)) return null;
  const little = [0xbebafeca, 0xbfbafeca].includes(magic);
  const fat64 = [0xcafebabf, 0xbfbafeca].includes(magic);
  const u32 = o => little ? data.readUInt32LE(o) : data.readUInt32BE(o);
  const u64 = o => Number(little ? data.readBigUInt64LE(o) : data.readBigUInt64BE(o));
  requireCondition(data.length >= 8, 'Truncated FAT header.');
  const count = u32(4), stride = fat64 ? 32 : 20;
  requireCondition(count > 0 && count <= 16 && 8 + count * stride <= data.length, 'Invalid FAT architecture table.');
  const slices = [];
  for (let i = 0; i < count; i++) {
    const row = 8 + i * stride;
    const start = fat64 ? u64(row + 8) : u32(row + 8);
    const size = fat64 ? u64(row + 16) : u32(row + 12);
    requireCondition(Number.isSafeInteger(start) && Number.isSafeInteger(size) && start >= 8 + count * stride && size >= 32 && start + size <= data.length, 'Invalid FAT slice bounds.');
    const slice = thinMachO(data.subarray(start, start + size));
    requireCondition(slice.cpu === u32(row), 'FAT CPU metadata mismatch.');
    slices.push(slice);
  }
  return slices;
}
export function validateDeviceMachO(data, label, fileType) {
  const slices = inspectMachO(data);
  requireCondition(slices?.length > 0, `${label}: missing Mach-O executable.`);
  for (const slice of slices) {
    requireCondition(slice.cpu === 0x100000c, `${label}: architecture is not arm64.`);
    requireCondition(slice.platform === 2, `${label}: platform is not iPhoneOS (Simulator is rejected).`);
    requireCondition(slice.cryptids.every(id => id === 0), `${label}: distribution encryption is present.`);
    requireCondition(fileType === undefined || slice.fileType === fileType, `${label}: incorrect Mach-O file type.`);
  }
  return slices;
}

const SENSITIVE_PATH = /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.git|\.ssh|credentials(?:\.[^/]*)?|passwords?(?:\.[^/]*)?|[^/]*\.(?:p12|p8|pfx|pem|cer|key|jks|keystore|mobileprovision|provisionprofile|ipa|xcarchive|bak|tmp|log)|(?:personal[-_])?backup[^/]*\.(?:json|zip|sqlite|db)|(?:release-signing|keystore)\.properties)(?:\/|$)/i;
// Match credential VALUES, never a variable name on its own. Results contain labels only.
const VALUE_MARKERS = [
  ['PROVIDER_KEY', /\bsk-(?:or-v1-|proj-)?[A-Za-z0-9_-]{24,}/],
  ['GITHUB_TOKEN', /\bgh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}/],
  ['VERCEL_BLOB_TOKEN', /vercel_blob_rw_[A-Za-z0-9]{8,}/],
  ['GOOGLE_API_KEY', /AIza[0-9A-Za-z_-]{35}/],
  ['PRIVATE_KEY', /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/],
  ['CREDENTIAL_LITERAL', /["']?\b(?:OPENROUTER_API_KEY|GYMFLOW_AI_API_KEY|APPLE_ID_PASSWORD|APPLE_PASSWORD|storePassword|keyPassword)["']?\s*[:=]\s*["'][^"'\s]{8,}["']/],
];
export function sensitiveValueLabels(text) { return VALUE_MARKERS.filter(([, re]) => re.test(text)).map(([label]) => label); }
export function auditTreeSecurity(root, manifest = treeManifest(root)) {
  for (const entry of manifest) {
    requireCondition(!SENSITIVE_PATH.test(entry.path), `Sensitive file/path rejected: ${entry.path}`);
    if (entry.type === 'file') {
      const labels = sensitiveValueLabels(readFileSync(path.join(root, entry.path)).toString('latin1'));
      requireCondition(labels.length === 0, `Sensitive value detected (${labels.join(', ')}) in ${entry.path}; values omitted.`);
    }
  }
  return { sensitiveFiles: 0, sensitiveValues: 0 };
}

export function validateArchive(archive, readPlist) {
  requireCondition(existsSync(archive) && lstatSync(archive).isDirectory() && archive.endsWith('.xcarchive'), 'Archive missing or not an .xcarchive directory.');
  const app = path.join(archive, 'Products', 'Applications', 'App.app');
  requireCondition(existsSync(path.join(archive, 'Info.plist')), 'Archive Info.plist missing.');
  requireCondition(existsSync(app), 'Archive App.app missing.');
  const archiveInfo = readPlist(path.join(archive, 'Info.plist'));
  const info = readPlist(path.join(app, 'Info.plist'));
  requireCondition(archiveInfo.ApplicationProperties?.CFBundleIdentifier === BUNDLE_ID && info.CFBundleIdentifier === BUNDLE_ID, 'Incorrect bundle ID.');
  for (const key of ['CFBundleShortVersionString', 'CFBundleVersion']) {
    requireCondition(typeof info[key] === 'string' && info[key].length > 0 && info[key] === archiveInfo.ApplicationProperties[key], `Archive/bundle ${key} missing or inconsistent.`);
  }
  requireCondition(info.CFBundlePackageType === 'APPL' && info.DTPlatformName === 'iphoneos' && JSON.stringify(info.CFBundleSupportedPlatforms) === '["iPhoneOS"]', 'Bundle platform is not iPhoneOS.');
  requireCondition(/^[A-Za-z0-9_-]+$/.test(info.CFBundleExecutable ?? ''), 'Invalid CFBundleExecutable.');
  const executable = path.join(app, info.CFBundleExecutable);
  requireCondition(existsSync(executable) && lstatSync(executable).isFile(), 'Main executable missing.');
  requireCondition((lstatSync(executable).mode & 0o111) !== 0 || process.platform === 'win32', 'Main executable lacks execute permission.');
  const mainSlices = validateDeviceMachO(readFileSync(executable), 'App executable', 2);
  requireCondition(mainSlices.every(s => !s.hasCodeSignature), 'Main executable is signed; expected unsigned archive. No signature is removed.');
  const icon = info.CFBundleIcons?.CFBundlePrimaryIcon;
  requireCondition(icon?.CFBundleIconName === 'AppIcon' && icon.CFBundleIconFiles?.length > 0 && existsSync(path.join(app, 'Assets.car')), 'Compiled AppIcon metadata/catalog missing.');
  requireCondition(existsSync(path.join(app, 'PrivacyInfo.xcprivacy')), 'App PrivacyInfo.xcprivacy missing.');
  const manifest = treeManifest(app);
  const binaries = [];
  for (const entry of manifest.filter(e => e.type === 'file')) {
    const data = readFileSync(path.join(app, entry.path));
    if (inspectMachO(data)) binaries.push({ path: entry.path, slices: validateDeviceMachO(data, entry.path) });
  }
  for (const name of REQUIRED_FRAMEWORKS) {
    const base = path.join(app, 'Frameworks', `${name}.framework`);
    requireCondition(existsSync(path.join(base, 'Info.plist')), `Required framework missing: ${name}`);
    const frameworkInfo = readPlist(path.join(base, 'Info.plist'));
    requireCondition(/^[A-Za-z0-9_-]+$/.test(frameworkInfo.CFBundleExecutable ?? ''), `Framework executable name invalid: ${name}`);
    const binary = path.join(base, frameworkInfo.CFBundleExecutable);
    requireCondition(existsSync(binary), `Framework executable missing: ${name}`);
    validateDeviceMachO(readFileSync(binary), name, 6);
    requireCondition((lstatSync(binary).mode & 0o111) !== 0 || process.platform === 'win32', `Framework executable permission missing: ${name}`);
  }
  auditTreeSecurity(app, manifest);
  return { app, info, manifest, binaries };
}
export function validateWebExport(out, embedded) {
  const source = treeManifest(out), bundle = treeManifest(embedded);
  requireCondition(source.every(e => e.type !== 'symlink') && bundle.every(e => e.type !== 'symlink'), 'Web export cannot contain symlinks.');
  auditTreeSecurity(out, source);
  const hashes = fileHashes(source), comparison = compareWebTrees(hashes, fileHashes(bundle));
  requireCondition(comparison.match, `Embedded web export differs: ${JSON.stringify(comparison)}`);
  const files = source.filter(e => e.type === 'file');
  const backend = assistantBackendEvidence(files.filter(e => e.path.endsWith('.js')).map(e => ({ name: e.path, text: readFileSync(path.join(out, e.path), 'utf8') })));
  requireCondition(backend.embedded, 'Canonical public production backend resolver is not proven embedded.');
  const media = files.filter(e => e.path.startsWith('assets/exercises/') || e.path.startsWith('media/'));
  return { files: files.length, fileHashes: hashes, exportTreeSha256: sha256(JSON.stringify(hashes)), mediaFiles: media.length, mediaBytes: media.reduce((sum, e) => sum + e.bytes, 0), backendOrigin: PRODUCTION_BACKEND_ORIGIN, backend };
}

export function validatePayloadEntries(entries, executable = 'App') {
  requireCondition(entries.length > 0 && new Set(entries).size === entries.length, 'Empty/duplicate ZIP entries.');
  for (const name of entries) {
    requireCondition(!name.includes('\\') && !name.split('/').includes('..') && !name.includes('//') && (name === 'Payload/' || name === 'Payload/App.app/' || name.startsWith('Payload/App.app/')), `Invalid IPA Payload entry: ${name}`);
  }
  for (const file of ['Info.plist', executable, 'PrivacyInfo.xcprivacy', 'Assets.car']) requireCondition(entries.includes(`Payload/App.app/${file}`), `IPA required file missing: ${file}`);
}
// Central directory inspection is portable. macOS also tests CRCs and extracts the entire IPA.
export function zipEntryNames(data) {
  let end = -1;
  for (let o = data.length - 22; o >= Math.max(0, data.length - 65557); o--) {
    if (data.readUInt32LE(o) === 0x06054b50 && o + 22 + data.readUInt16LE(o + 20) === data.length) { end = o; break; }
  }
  requireCondition(end >= 0, 'Invalid ZIP end record.');
  requireCondition(data.readUInt16LE(end + 4) === 0 && data.readUInt16LE(end + 6) === 0, 'Multi-disk ZIP rejected.');
  const count = data.readUInt16LE(end + 10), size = data.readUInt32LE(end + 12), start = data.readUInt32LE(end + 16);
  requireCondition(count > 0 && count < 65535 && start + size === end && data.readUInt16LE(end + 8) === count, 'Invalid/ZIP64 central directory.');
  const names = [];
  let offset = start;
  for (let i = 0; i < count; i++) {
    requireCondition(offset + 46 <= end && data.readUInt32LE(offset) === 0x02014b50, 'Invalid ZIP central entry.');
    requireCondition((data.readUInt16LE(offset + 8) & 1) === 0 && [0, 8].includes(data.readUInt16LE(offset + 10)), 'Encrypted/unsupported ZIP entry.');
    const nameLength = data.readUInt16LE(offset + 28), extraLength = data.readUInt16LE(offset + 30), commentLength = data.readUInt16LE(offset + 32);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    requireCondition(next <= end && data.readUInt32LE(offset + 42) < start, 'Invalid ZIP entry bounds.');
    names.push(data.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
    offset = next;
  }
  requireCondition(offset === end, 'Unexpected ZIP central bytes.');
  return names;
}
export function verifyArtifactDirectory(dir, { sourceSha, runId, runAttempt, repository = REPOSITORY }) {
  validateSourceSha(sourceSha);
  const expectedFiles = [ipaName(sourceSha), 'metadata.json', 'SHA256SUMS.txt', 'SIDELOAD_GUIDE.md'].sort();
  requireCondition(JSON.stringify(readdirSync(dir).sort()) === JSON.stringify(expectedFiles), 'Artifact must contain only IPA, metadata, checksums and sanitized guide.');
  for (const name of expectedFiles) requireCondition(lstatSync(path.join(dir, name)).isFile() && !lstatSync(path.join(dir, name)).isSymbolicLink(), 'Artifact contains a non-regular file.');
  const metadata = JSON.parse(readFileSync(path.join(dir, 'metadata.json'), 'utf8'));
  requireCondition(metadata.source_sha === sourceSha && String(metadata.workflow.run_id) === String(runId) && String(metadata.workflow.run_attempt) === String(runAttempt) && metadata.workflow.repository === repository && metadata.workflow.path === `.github/workflows/${WORKFLOW}`, 'Artifact provenance mismatch.');
  requireCondition(metadata.signing_status === SIGNING_STATUS && metadata.bundle.identifier === BUNDLE_ID && metadata.ipa.name === ipaName(sourceSha), 'Artifact signing/bundle/name mismatch.');
  for (const gate of REQUIRED_GATES) requireCondition(metadata.gates?.[gate] === 'PASS', `Missing/failed artifact gate: ${gate}`);
  const sums = readFileSync(path.join(dir, 'SHA256SUMS.txt'), 'utf8').trim().split(/\r?\n/);
  const checked = new Set();
  for (const line of sums) {
    const m = line.match(/^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$/);
    requireCondition(m && expectedFiles.includes(m[2]) && m[2] !== 'SHA256SUMS.txt' && !checked.has(m[2]), 'Invalid/duplicate checksum record.');
    requireCondition(fileSha256(path.join(dir, m[2])) === m[1], `SHA-256 mismatch: ${m[2]}`);
    checked.add(m[2]);
  }
  requireCondition(checked.size === 3, 'IPA, metadata and guide all require checksums.');
  const ipa = readFileSync(path.join(dir, metadata.ipa.name));
  requireCondition(ipa.length === metadata.ipa.bytes && sha256(ipa) === metadata.ipa.sha256, 'IPA bytes/hash do not match metadata.');
  validatePayloadEntries(zipEntryNames(ipa), metadata.bundle.executable);
  return metadata;
}
