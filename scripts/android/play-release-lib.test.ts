import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  DEV_BACKEND_MARKERS,
  PRODUCTION_BACKEND_ORIGIN,
  SECRET_MARKERS,
  backendOriginProblems,
  countMarkers,
  fingerprintsEqual,
  formatFingerprint,
  isPathInside,
  normalizeFingerprint,
  parseAapt2Badging,
  parseApksignerOutput,
  parseGradleVersion,
  parseKeytoolCertificate,
  uploadPasswordProblems,
  vercelAppHosts,
} from './play-release-lib.mjs';

const KEYTOOL_PRINTCERT = `Owner: CN=GymFlow Upload, OU=Mobile, O=GymFlow, C=BR
Issuer: CN=GymFlow Upload, OU=Mobile, O=GymFlow, C=BR
Serial number: 1a2b3c
Valid from: Wed Sep 24 16:00:00 BRT 2026 until: Sun Feb 09 16:00:00 BRT 2054
Certificate fingerprints:
\t SHA1: AE:52:78:58:74:70:1C:45:58:89:76:74:4E:66:52:1C:74:32:A6:72
\t SHA256: A3:27:3A:11:A7:C9:32:F1:39:79:11:AD:02:D6:2A:87:89:52:25:64:F3:AC:6F:7F:F8:D9:18:DC:1A:DE:54:7C
Signature algorithm name: SHA256withRSA
Subject Public Key Algorithm: 4096-bit RSA key
Version: 3`;

const APKSIGNER = `Verifies
Verified using v1 scheme (JAR signing): true
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): false
Number of signers: 1
Signer #1 certificate DN: CN=GymFlow Upload, OU=Mobile, O=GymFlow, C=BR
Signer #1 certificate SHA-256 digest: a3273a11a7c932f1397911ad02d62a8789522564f3ac6f7ff8d918dc1ade547c
Signer #1 certificate SHA-1 digest: ae52785874701c45588976744e66521c7432a672`;

describe('GOAL-117 play-release-lib: fingerprints', () => {
  it('normaliza e formata fingerprints no formato do Play Console', () => {
    expect(normalizeFingerprint('ae:52:78')).toBe('AE5278');
    expect(formatFingerprint('ae5278')).toBe('AE:52:78');
  });

  it('compara fingerprints ignorando separador/caixa e nunca aceita vazio', () => {
    expect(fingerprintsEqual('AE:52:78', 'ae5278')).toBe(true);
    expect(fingerprintsEqual('AE:52:78', 'AE:52:79')).toBe(false);
    expect(fingerprintsEqual('', '')).toBe(false);
    expect(fingerprintsEqual(null, undefined)).toBe(false);
  });

  it('lê owner, SHA1, SHA256 e validade do keytool em inglês', () => {
    const cert = parseKeytoolCertificate(KEYTOOL_PRINTCERT);
    expect(cert.owner).toBe('CN=GymFlow Upload, OU=Mobile, O=GymFlow, C=BR');
    expect(cert.sha1).toBe('AE52785874701C45588976744E66521C7432A672');
    expect(cert.sha256).toBe('A3273A11A7C932F1397911AD02D62A8789522564F3AC6F7FF8D918DC1ADE547C');
    expect(cert.validUntil).toBe('Sun Feb 09 16:00:00 BRT 2054');
    expect(cert.keyAlgorithm).toBe('4096-bit RSA key');
  });

  it('não inventa certificado quando a saída não tem fingerprints', () => {
    const cert = parseKeytoolCertificate('keytool error: java.io.IOException: keystore password was incorrect');
    expect(cert.sha256).toBeNull();
    expect(cert.sha1).toBeNull();
    expect(cert.owner).toBeNull();
  });

  it('lê signers e esquemas do apksigner', () => {
    const parsed = parseApksignerOutput(APKSIGNER);
    expect(parsed.verified).toBe(true);
    expect(parsed.signers).toHaveLength(1);
    expect(parsed.signers[0].dn).toBe('CN=GymFlow Upload, OU=Mobile, O=GymFlow, C=BR');
    expect(fingerprintsEqual(parsed.signers[0].sha256, parseKeytoolCertificate(KEYTOOL_PRINTCERT).sha256)).toBe(true);
    expect(parsed.schemes).toMatchObject({ v1: true, v2: true, v3: false });
  });

  it('apksigner sem "Verifies" não é considerado verificado', () => {
    expect(parseApksignerOutput('DOES NOT VERIFY\nERROR: JAR signer CERT.RSA').verified).toBe(false);
  });
});

describe('GOAL-117 play-release-lib: identidade', () => {
  it('lê package/version/debuggable do aapt2 badging', () => {
    const badging = parseAapt2Badging(
      "package: name='com.gymflowai.app' versionCode='2' versionName='1.0.1' platformBuildVersionName='16'\n" +
        "minSdkVersion:'23'\ntargetSdkVersion:'36'\nuses-permission: name='android.permission.INTERNET'\n",
    );
    expect(badging).toMatchObject({
      packageName: 'com.gymflowai.app',
      versionCode: 2,
      versionName: '1.0.1',
      minSdk: '23',
      targetSdk: '36',
      debuggable: false,
      permissions: ['android.permission.INTERNET'],
    });
    expect(parseAapt2Badging("package: name='x' versionCode='1' versionName='1'\napplication-debuggable\n").debuggable).toBe(true);
  });

  it('lê applicationId/versionCode/versionName do build.gradle real', async () => {
    const fs = await import('node:fs');
    const gradle = parseGradleVersion(
      fs.readFileSync(path.resolve(__dirname, '../../android/app/build.gradle'), 'utf8'),
    );
    expect(gradle.applicationId).toBe('com.gymflowai.app');
    expect(Number.isInteger(gradle.versionCode)).toBe(true);
    expect(gradle.versionName).toMatch(/^\d+(\.\d+)*$/);
  });
});

describe('GOAL-117 play-release-lib: caminhos e senha', () => {
  it('detecta caminho dentro/fora de um diretório', () => {
    const root = path.resolve('/tmp/repo');
    expect(isPathInside(path.join(root, 'android', 'key.jks'), root)).toBe(true);
    expect(isPathInside(root, root)).toBe(true);
    expect(isPathInside(path.resolve('/tmp/repo-other/key.jks'), root)).toBe(false);
    expect(isPathInside(path.resolve('/tmp/cofre/key.jks'), root)).toBe(false);
  });

  it('recusa senha curta, repetitiva, com espaço nas pontas ou controle', () => {
    expect(uploadPasswordProblems('curta')).not.toHaveLength(0);
    expect(uploadPasswordProblems('aaaaaaaaaaaaaaaaaaaa')).not.toHaveLength(0);
    expect(uploadPasswordProblems(' Abcdefghij123456789')).not.toHaveLength(0);
    expect(uploadPasswordProblems('Abcdefghij\u0007123456789')).not.toHaveLength(0);
    expect(uploadPasswordProblems('Correct-Horse-Battery-42')).toEqual([]);
  });

  it('mensagens de senha nunca incluem a senha', () => {
    const secret = 'segredo';
    for (const problem of uploadPasswordProblems(secret)) expect(problem).not.toContain(secret);
  });
});

describe('GOAL-117 play-release-lib: backend e segredos', () => {
  it('aceita a origem Production GymFlow e vazio (IA indisponível honesta)', () => {
    expect(backendOriginProblems(PRODUCTION_BACKEND_ORIGIN)).toEqual([]);
    expect(backendOriginProblems('')).toEqual([]);
  });

  it.each([
    'http://gymflow-beige-gamma.vercel.app',
    'https://localhost:3000',
    'https://127.0.0.1',
    'https://10.0.2.2',
    'https://192.168.0.6',
    'https://172.20.1.1',
    'https://openrouter.ai',
    'https://abc.ngrok-free.app',
    'https://gymflow-beige-gamma.vercel.app/api/nutrition/assistant',
    'https://user:pw@gymflow-beige-gamma.vercel.app',
    'nao-e-url',
  ])('recusa origem de backend inválida: %s', (origin) => {
    expect(backendOriginProblems(origin).length).toBeGreaterThan(0);
  });

  it('conta marcadores de segredo sem devolver o valor', () => {
    const fakeKey = `sk-or-v1-${'a'.repeat(40)}`;
    const counts = countMarkers(`x="${fakeKey}";fetch("https://openrouter.ai/api/v1/chat/completions")`, SECRET_MARKERS);
    expect(counts).toMatchObject({ OPENROUTER_KEY: 1, OPENROUTER_HOST: 1, CHAT_COMPLETIONS_PATH: 1 });
    expect(JSON.stringify(counts)).not.toContain(fakeKey);
    expect(countMarkers('const task-runner = 1; storeFile=x', SECRET_MARKERS)).toEqual({});
    expect(countMarkers('storePassword=abc', SECRET_MARKERS)).toMatchObject({ SIGNING_PASSWORD_PROPERTY: 1 });
  });

  it('ignora o literal "localhost" do parser de URL do Next, mas pega URL de dev', () => {
    expect(countMarkers('if("localhost"===e)return a', DEV_BACKEND_MARKERS)).toEqual({});
    expect(countMarkers('fetch("http://localhost:3000/api")', DEV_BACKEND_MARKERS)).toMatchObject({ HTTP_LOCALHOST: 1 });
    expect(countMarkers('u="http://10.0.2.2:3000"', DEV_BACKEND_MARKERS)).toMatchObject({ EMULATOR_HOST: 1 });
    expect(countMarkers('u="http://192.168.0.6:3000"', DEV_BACKEND_MARKERS)).toMatchObject({ LAN_IP: 1 });
  });

  it('lista hosts *.vercel.app para conferir que só há Production', () => {
    expect(
      vercelAppHosts('a="https://gymflow-beige-gamma.vercel.app/x";b="https://gymflow-git-feat-x.vercel.app"'),
    ).toEqual(['gymflow-beige-gamma.vercel.app', 'gymflow-git-feat-x.vercel.app']);
    expect(vercelAppHosts('https://jmnpdtxahhb8xobk.public.blob.vercel-storage.com/a.mp4')).toEqual([]);
  });
});
