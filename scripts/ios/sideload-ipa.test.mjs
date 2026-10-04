import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { artifactName, auditTreeSecurity, assertTreesEqual, BUNDLE_ID, fileSha256, ipaName, REQUIRED_FRAMEWORKS, REQUIRED_GATES, REPOSITORY, sensitiveValueLabels, sha256, SIGNING_STATUS, treeManifest, validateArchive, validateDeviceMachO, validatePayloadEntries, validateWebExport, verifyArtifactDirectory, WORKFLOW, zipEntryNames } from './sideload-lib.mjs';
import { packageSideloadIpa } from './package-sideload-ipa.mjs';
const roots = [], sourceSha = 'a'.repeat(40);
const productionResolver = 'let e,t=0===(e="https://gymflow-beige-gamma.vercel.app".trim()).length?null:e;return t?{kind:"remote",url:`${t}/api/nutrition/assistant`}:{kind:"unavailable"}';
function temp() { const root = mkdtempSync(path.join(os.tmpdir(), 'gymflow-ipa-test-')); roots.push(root); return root; }
function put(file, data) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, data); }
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    const relative = path.relative(os.tmpdir(), root);
    if (!relative.startsWith('gymflow-ipa-test-') || relative.includes(path.sep)) throw new Error('Unsafe test cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});
function macho({ platform = 2, cpu = 0x100000c, cryptid = 0, fileType = 2, signed = false } = {}) {
  const data = Buffer.alloc(32 + 24 + 24 + (signed ? 16 : 0));
  data.writeUInt32LE(0xfeedfacf, 0); data.writeUInt32LE(cpu, 4); data.writeUInt32LE(fileType, 12);
  data.writeUInt32LE(signed ? 3 : 2, 16); data.writeUInt32LE(data.length - 32, 20);
  data.writeUInt32LE(0x32, 32); data.writeUInt32LE(24, 36); data.writeUInt32LE(platform, 40);
  data.writeUInt32LE(0x2c, 56); data.writeUInt32LE(24, 60); data.writeUInt32LE(cryptid, 72);
  if (signed) { data.writeUInt32LE(0x1d, 80); data.writeUInt32LE(16, 84); }
  return data;
}
function fixture() {
  const root = temp(), archive = path.join(root, 'GymFlow.xcarchive'), app = path.join(archive, 'Products/Applications/App.app'), out = path.join(root, 'out');
  const info = { CFBundleIdentifier: BUNDLE_ID, CFBundleShortVersionString: '1.0', CFBundleVersion: '1', CFBundleExecutable: 'App', CFBundlePackageType: 'APPL', DTPlatformName: 'iphoneos', CFBundleSupportedPlatforms: ['iPhoneOS'], CFBundleIcons: { CFBundlePrimaryIcon: { CFBundleIconName: 'AppIcon', CFBundleIconFiles: ['AppIcon60x60'] } }, MinimumOSVersion: '14.0' };
  put(path.join(archive, 'Info.plist'), JSON.stringify({ ApplicationProperties: info }));
  put(path.join(app, 'Info.plist'), JSON.stringify(info));
  put(path.join(app, 'App'), macho()); chmodSync(path.join(app, 'App'), 0o755);
  put(path.join(app, 'Assets.car'), 'fixture compiled icon catalog');
  put(path.join(app, 'PrivacyInfo.xcprivacy'), JSON.stringify({ NSPrivacyAccessedAPITypes: [], NSPrivacyTracking: false }));
  for (const name of REQUIRED_FRAMEWORKS) {
    const base = path.join(app, 'Frameworks', `${name}.framework`);
    put(path.join(base, 'Info.plist'), JSON.stringify({ CFBundleExecutable: name }));
    put(path.join(base, name), macho({ fileType: 6 })); chmodSync(path.join(base, name), 0o755);
  }
  put(path.join(out, 'index.html'), '<html>fixture</html>');
  put(path.join(out, 'app.js'), productionResolver);
  put(path.join(out, 'assets/exercises/fixture/0.jpg'), Buffer.from([255, 216, 255, 1, 2, 3]));
  cpSync(out, path.join(app, 'public'), { recursive: true });
  return { root, archive, app, out, info, readPlist: file => JSON.parse(readFileSync(file, 'utf8')) };
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function storedZip(names) {
  const local = [], central = []; let offset = 0;
  for (const name of names) {
    const fileName = Buffer.from(name), bytes = Buffer.from(`fixture:${name}`), crc = crc32(bytes);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt32LE(crc, 14); header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(fileName.length, 26);
    local.push(header, fileName, bytes);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(0x314, 4); entry.writeUInt16LE(20, 6); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(bytes.length, 20); entry.writeUInt32LE(bytes.length, 24); entry.writeUInt16LE(fileName.length, 28); entry.writeUInt32LE((0o100644 << 16) >>> 0, 38); entry.writeUInt32LE(offset, 42);
    central.push(entry, fileName); offset += header.length + fileName.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
const payloadNames = ['Info.plist', 'App', 'Assets.car', 'PrivacyInfo.xcprivacy', 'public/app.js'].map(name => `Payload/App.app/${name}`);
function artifactFixture() {
  const root = temp(), name = ipaName(sourceSha), ipa = storedZip(payloadNames);
  put(path.join(root, name), ipa);
  const metadata = { source_sha: sourceSha, workflow: { run_id: '129', run_attempt: '1', repository: REPOSITORY, path: `.github/workflows/${WORKFLOW}` }, signing_status: SIGNING_STATUS, bundle: { identifier: BUNDLE_ID, executable: 'App' }, ipa: { name, bytes: ipa.length, sha256: sha256(ipa) }, gates: Object.fromEntries(REQUIRED_GATES.map(gate => [gate, 'PASS'])) };
  put(path.join(root, 'metadata.json'), JSON.stringify(metadata)); put(path.join(root, 'SIDELOAD_GUIDE.md'), 'Fixture: unsigned; local signing required.');
  const sums = () => put(path.join(root, 'SHA256SUMS.txt'), [name, 'metadata.json', 'SIDELOAD_GUIDE.md'].map(file => `${fileSha256(path.join(root, file))}  ${file}`).join('\n') + '\n'); sums();
  return { root, name, metadata, sums, expected: { sourceSha, runId: '129', runAttempt: 1 } };
}

describe('GOAL-129 archive and device safety', () => {
  it('accepts a coherent unsigned device archive fixture', () => { const f = fixture(); expect(validateArchive(f.archive, f.readPlist).info.CFBundleIdentifier).toBe(BUNDLE_ID); });
  it('rejects missing archive', () => expect(() => validateArchive(path.join(temp(), 'missing.xcarchive'), () => ({}))).toThrow(/Archive missing/));
  it('rejects incorrect bundle ID', () => { const f = fixture(); put(path.join(f.app, 'Info.plist'), JSON.stringify({ ...f.info, CFBundleIdentifier: 'other.app' })); expect(() => validateArchive(f.archive, f.readPlist)).toThrow(/bundle ID/); });
  it('rejects missing main executable', () => { const f = fixture(); rmSync(path.join(f.app, 'App')); expect(() => validateArchive(f.archive, f.readPlist)).toThrow(/executable missing/); });
  it('rejects arm64 Simulator despite correct bundle metadata', () => { const f = fixture(); put(path.join(f.app, 'App'), macho({ platform: 7 })); expect(() => validateArchive(f.archive, f.readPlist)).toThrow(/not iPhoneOS/); });
  it('rejects simulator framework', () => { const f = fixture(); put(path.join(f.app, 'Frameworks/Capacitor.framework/Capacitor'), macho({ platform: 7, fileType: 6 })); expect(() => validateArchive(f.archive, f.readPlist)).toThrow(/not iPhoneOS/); });
  it('rejects missing required framework', () => { const f = fixture(); rmSync(path.join(f.app, 'Frameworks/Capacitor.framework/Capacitor')); expect(() => validateArchive(f.archive, f.readPlist)).toThrow(/Framework executable missing/); });
  it('rejects non-arm64 and encrypted executables', () => { expect(() => validateDeviceMachO(macho({ cpu: 0x1000007 }), 'main')).toThrow(/not arm64/); expect(() => validateDeviceMachO(macho({ cryptid: 1 }), 'main')).toThrow(/encryption/); });
  it('rejects an already signed main binary without removing its signature', () => { const f = fixture(); put(path.join(f.app, 'App'), macho({ signed: true })); expect(() => validateArchive(f.archive, f.readPlist)).toThrow(/is signed/); });
  it('rejects truncated load commands and missing platform evidence', () => { expect(() => validateDeviceMachO(macho().subarray(0, 50), 'main')).toThrow(/Truncated/); const binary = macho(); binary.writeUInt32LE(0x19, 32); expect(() => validateDeviceMachO(binary, 'main')).toThrow(/not iPhoneOS/); });
  it('inspects every FAT slice rather than accepting one device slice', () => { const first = macho(), second = macho({ platform: 7 }); const fat = Buffer.alloc(48); fat.writeUInt32BE(0xcafebabe); fat.writeUInt32BE(2, 4); [first, second].forEach((b, i) => { const o = 8 + i * 20; fat.writeUInt32BE(0x100000c, o); fat.writeUInt32BE(48 + i * first.length, o + 8); fat.writeUInt32BE(b.length, o + 12); }); expect(() => validateDeviceMachO(Buffer.concat([fat, first, second]), 'fat')).toThrow(/not iPhoneOS/); });
});

describe('GOAL-129 content and security', () => {
  it('preserves integrated media and detects a changed embedded byte', () => { const f = fixture(); expect(validateWebExport(f.out, path.join(f.app, 'public')).mediaFiles).toBe(1); put(path.join(f.app, 'public/assets/exercises/fixture/0.jpg'), 'changed'); expect(() => validateWebExport(f.out, path.join(f.app, 'public'))).toThrow(/differs/); });
  it('rejects unapproved web extras and does not certify a loose production URL', () => { const f = fixture(); put(path.join(f.app, 'public/extra.js'), 'extra'); expect(() => validateWebExport(f.out, path.join(f.app, 'public'))).toThrow(/differs/); rmSync(path.join(f.app, 'public/extra.js')); put(path.join(f.out, 'app.js'), 'const url="https://gymflow-beige-gamma.vercel.app";'); cpSync(f.out, path.join(f.app, 'public'), { recursive: true }); expect(() => validateWebExport(f.out, path.join(f.app, 'public'))).toThrow(/resolver/); });
  it.each(['.env.production', 'release.keystore', 'private.p12', 'embedded.mobileprovision', 'personal-backup.json', 'keystore.properties', 'debug.log'])('rejects sensitive file %s', file => { const f = fixture(); put(path.join(f.app, file), 'private fixture'); expect(() => auditTreeSecurity(f.app)).toThrow(/Sensitive file/); });
  it('accepts variable names and references; rejects only credential values', () => { expect(sensitiveValueLabels('OPENROUTER_API_KEY GYMFLOW_AI_API_KEY process.env.APPLE_PASSWORD')).toEqual([]); const key = 'sk-or-v1-' + 'a'.repeat(48); expect(sensitiveValueLabels(`const x="${key}"`)).toContain('PROVIDER_KEY'); expect(sensitiveValueLabels('APPLE_PASSWORD="fixture-long-value"')).toContain('CREDENTIAL_LITERAL'); });
  it('omits detected secret values from errors', () => { const f = fixture(), key = 'sk-or-v1-' + 'b'.repeat(48); put(path.join(f.app, 'public/test.js'), key); try { auditTreeSecurity(f.app); throw new Error('expected rejection'); } catch (e) { expect(e.message).toContain('Sensitive value detected'); expect(e.message).not.toContain(key); } });
  it('detects changes in hashes and Unix modes', () => { const f = fixture(), original = treeManifest(f.app); cpSync(f.app, path.join(f.root, 'copy'), { recursive: true }); assertTreesEqual(original, treeManifest(path.join(f.root, 'copy'))); const mutated = structuredClone(original); mutated[0].mode ^= 0o100; expect(() => assertTreesEqual(original, mutated)).toThrow(/modes/); });
  it.skipIf(process.platform === 'win32')('preserves safe links and rejects links escaping the bundle', () => { const f = fixture(); symlinkSync('App', path.join(f.app, 'AppLink')); expect(treeManifest(f.app).find(e => e.path === 'AppLink').target).toBe('App'); symlinkSync(f.out, path.join(f.app, 'Escape')); expect(() => treeManifest(f.app)).toThrow(/absolute symlink/); });
});

describe('GOAL-129 Payload, checksums and exact-run download', () => {
  it('accepts a real ZIP structure containing only Payload/App.app', () => { const data = storedZip(payloadNames); expect(zipEntryNames(data)).toEqual(payloadNames); validatePayloadEntries(zipEntryNames(data)); });
  it.each(['App.app/Info.plist', 'Payload/Other.app/App', '__MACOSX/file', 'Payload/App.app/../../escape', 'Payload\\App.app\\App'])('rejects wrong IPA root/path %s', bad => expect(() => validatePayloadEntries([...payloadNames, bad])).toThrow(/Invalid IPA/));
  it('rejects duplicate/missing entries and corrupt ZIP directory', () => { expect(() => validatePayloadEntries([...payloadNames, payloadNames[0]])).toThrow(/duplicate/); expect(() => validatePayloadEntries(payloadNames.filter(name => !name.endsWith('/App')))).toThrow(/required file/); const zip = storedZip(payloadNames); zip[zip.length - 22] = 0; expect(() => zipEntryNames(zip)).toThrow(/end record/); });
  it('verifies all three file hashes, byte size and provenance on Windows too', () => { const f = artifactFixture(); expect(verifyArtifactDirectory(f.root, f.expected).signing_status).toBe(SIGNING_STATUS); });
  it('rejects wrong source/run/attempt', () => { const f = artifactFixture(); expect(() => verifyArtifactDirectory(f.root, { ...f.expected, runId: '130' })).toThrow(/provenance/); expect(() => verifyArtifactDirectory(f.root, { ...f.expected, runAttempt: 2 })).toThrow(/provenance/); expect(() => verifyArtifactDirectory(f.root, { ...f.expected, sourceSha: 'b'.repeat(40) })).toThrow(/only IPA/); });
  it('rejects modified IPA bytes and metadata even if filenames match', () => { const f = artifactFixture(); put(path.join(f.root, f.name), 'corrupt'); expect(() => verifyArtifactDirectory(f.root, f.expected)).toThrow(/SHA-256/); });
  it('rejects extra artifact files and checksum traversal', () => { const f = artifactFixture(); put(path.join(f.root, 'private.txt'), 'x'); expect(() => verifyArtifactDirectory(f.root, f.expected)).toThrow(/only IPA/); rmSync(path.join(f.root, 'private.txt')); put(path.join(f.root, 'SHA256SUMS.txt'), `${'a'.repeat(64)}  ../outside\n`); expect(() => verifyArtifactDirectory(f.root, f.expected)).toThrow(/checksum record/); });
  it('rejects failed safety gate with otherwise valid checksums', () => { const f = artifactFixture(); f.metadata.gates.DEVICE_ARM64_IPHONEOS = 'FAIL'; put(path.join(f.root, 'metadata.json'), JSON.stringify(f.metadata)); f.sums(); expect(() => verifyArtifactDirectory(f.root, f.expected)).toThrow(/gate/); });
  it('names artifacts with full source, exact run and attempt', () => expect(artifactName(sourceSha, 129, 2)).toContain(`${sourceSha}-UNSIGNED_FOR_LOCAL_RESIGN-run-129-2`));
  it.skipIf(process.platform !== 'darwin')('packages, CRC-tests, extracts and checks real ZIP modes/links on macOS (synthetic archive fixture)', () => {
    const f = fixture(); symlinkSync('App', path.join(f.app, 'AppLink'));
    // Real archives contain a typed NSDate; converting the entire plist to JSON fails.
    const properties = ['CFBundleIdentifier', 'CFBundleShortVersionString', 'CFBundleVersion'].map(key => `<key>${key}</key><string>${f.info[key]}</string>`).join('');
    put(path.join(f.archive, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CreationDate</key><date>2026-10-04T12:00:00Z</date><key>ApplicationProperties</key><dict>${properties}</dict></dict></plist>`);
    vi.stubEnv('SOURCE_SHA', execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()); vi.stubEnv('GITHUB_REPOSITORY', REPOSITORY); vi.stubEnv('GITHUB_RUN_ID', '129'); vi.stubEnv('GITHUB_RUN_ATTEMPT', '1'); vi.stubEnv('GITHUB_OUTPUT', ''); vi.stubEnv('GITHUB_STEP_SUMMARY', '');
    const metadata = packageSideloadIpa({ archive: f.archive, out: f.out, output: path.join(f.root, 'publish') });
    expect(metadata.gates.EXTRACTED_BUNDLE_INTEGRITY).toBe('PASS'); expect(existsSync(path.join(f.root, 'publish', metadata.ipa.name))).toBe(true);
  }, 30000);
});
