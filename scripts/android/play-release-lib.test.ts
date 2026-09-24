import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  DEV_BACKEND_MARKERS,
  PRODUCTION_BACKEND_ORIGIN,
  SECRET_MARKERS,
  backendOriginProblems,
  committedSecretAssignments,
  compareWebTrees,
  countMarkers,
  parseJarsignerVerbose,
  parseKeytoolJarSigners,
  assistantBackendEvidence,
  isThrowawayRecord,
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
    expect(countMarkers('fetch("http://localhost:3000/api")', DEV_BACKEND_MARKERS)).toMatchObject({ PRIVATE_HOST_URL: 1 });
    expect(countMarkers('u="http://10.0.2.2:3000"', DEV_BACKEND_MARKERS)).toMatchObject({ EMULATOR_HOST: 1 });
    expect(countMarkers('u="http://192.168.0.6:3000"', DEV_BACKEND_MARKERS)).toMatchObject({ PRIVATE_HOST_URL: 1 });
  });

  it('lista hosts *.vercel.app para conferir que só há Production', () => {
    expect(
      vercelAppHosts('a="https://gymflow-beige-gamma.vercel.app/x";b="https://gymflow-git-feat-x.vercel.app"'),
    ).toEqual(['gymflow-beige-gamma.vercel.app', 'gymflow-git-feat-x.vercel.app']);
    expect(vercelAppHosts('https://jmnpdtxahhb8xobk.public.blob.vercel-storage.com/a.mp4')).toEqual([]);
  });
});

const JAR_DATE = 'Thu Jan 01 01:01:02 BRT 1981';
function jarsignerOutput(entries: string[], signers: string[], warnings = ''): string {
  return [
    ...entries,
    '',
    '  s = signature was verified ',
    ...signers.map((s) => `- Signed by "${s}"\n    Digest algorithm: SHA-256`),
    '',
    'jar verified.',
    '',
    'Warning: ',
    'This jar contains entries whose signer certificate is self-signed.',
    warnings,
  ].join('\n');
}

describe('GOAL-117 play-release-lib: verificação do AAB (jarsigner/keytool)', () => {
  const signedEntries = [
    `sm       628 ${JAR_DATE} BundleConfig.pb`,
    `sm       767 ${JAR_DATE} base/assets/capacitor.config.json`,
    `      107562 ${JAR_DATE} META-INF/GYMFLOW-.SF`,
    `        2051 ${JAR_DATE} META-INF/GYMFLOW-.RSA`,
    `s     107513 ${JAR_DATE} META-INF/MANIFEST.MF`,
  ];

  it('aceita AAB com todas as entradas assinadas e um único signer', () => {
    const parsed = parseJarsignerVerbose(jarsignerOutput(signedEntries, ['CN=GymFlow Upload']));
    expect(parsed).toMatchObject({ verified: true, entries: 5, unsignedPayload: [], fatalWarnings: [] });
    expect(parsed.signedBy).toEqual(['CN=GymFlow Upload']);
  });

  it('detecta entrada de payload não assinada mesmo com "jar verified."', () => {
    const parsed = parseJarsignerVerbose(
      jarsignerOutput(
        [
          ...signedEntries,
          // Formato real do jarsigner para entrada não assinada: flag "?".
          `    ?     16 Thu Sep 24 17:25:26 BRT 2026 base/assets/public/injetado.js`,
          `         9 ${JAR_DATE} base/assets/public/sem-flag.js`,
        ],
        ['CN=GymFlow Upload'],
        'This jar contains unsigned entries which have not been integrity-checked.',
      ),
    );
    expect(parsed.verified).toBe(true);
    expect(parsed.entries).toBe(7);
    expect(parsed.unsignedPayload).toEqual(['base/assets/public/injetado.js', 'base/assets/public/sem-flag.js']);
    expect(parsed.fatalWarnings.length).toBeGreaterThan(0);
  });

  it('expõe múltiplos signers', () => {
    expect(parseJarsignerVerbose(jarsignerOutput(signedEntries, ['CN=A', 'CN=B'])).signedBy).toHaveLength(2);
  });

  it('lê todos os signers do keytool -printcert -jarfile', () => {
    const one = `Signer #1:\n\n${KEYTOOL_PRINTCERT}\n`;
    expect(parseKeytoolJarSigners(one)).toHaveLength(1);
    expect(parseKeytoolJarSigners(one)[0].sha256).toBe('A3273A11A7C932F1397911AD02D62A8789522564F3AC6F7FF8D918DC1ADE547C');
    const two = `${one}\nSigner #2:\n\n${KEYTOOL_PRINTCERT.replace('A3:27', 'B3:27')}\n`;
    expect(parseKeytoolJarSigners(two)).toHaveLength(2);
    expect(parseKeytoolJarSigners('keytool error: not a signed jar')).toEqual([]);
  });
});

describe('GOAL-117 play-release-lib: proveniência do bundle web', () => {
  const out = { 'index.html': 'h1', '_next/static/a.js': 'h2' };

  it('aceita árvore idêntica com extras injetados pelo Capacitor', () => {
    expect(compareWebTrees(out, { ...out, 'cordova.js': 'x', 'cordova_plugins.js': 'y' }).match).toBe(true);
  });

  it('recusa arquivo faltando, diferente ou extra inesperado', () => {
    expect(compareWebTrees(out, { 'index.html': 'h1' }).missing).toEqual(['_next/static/a.js']);
    expect(compareWebTrees(out, { ...out, 'index.html': 'velho' }).different).toEqual(['index.html']);
    expect(compareWebTrees(out, { ...out, 'extra.js': 'z' }).unexpectedExtra).toEqual(['extra.js']);
    expect(compareWebTrees({}, {}).match).toBe(false);
  });
});

describe('GOAL-117 play-release-lib: senha versionada', () => {
  // Nomes montados por concatenação: este arquivo de teste também é varrido.
  const RELEASE_PW = 'GYMFLOW_RELEASE_STORE_' + 'PASSWORD';
  const UPLOAD_PW = 'GYMFLOW_UPLOAD_KEY_' + 'PASSWORD';
  const STORE_PW = 'store' + 'Password';
  const literal = 'Lit' + 'eral-Val' + 'ue-42';

  it('pega literal entre aspas em qualquer arquivo', () => {
    expect(committedSecretAssignments('scripts/x.mjs', `const e = { ${RELEASE_PW}: "${literal}" };`)).toBe(1);
    expect(committedSecretAssignments('docs/x.md', `${UPLOAD_PW}='${literal}'`)).toBe(1);
  });

  it('pega valor sem aspas em arquivo de configuração/script', () => {
    expect(committedSecretAssignments('android/x.properties', `${STORE_PW}=${literal}`)).toBe(1);
    expect(committedSecretAssignments('ci/run.sh', `export ${RELEASE_PW}=${literal}`)).toBe(1);
    expect(committedSecretAssignments('.env.production', `${UPLOAD_PW}=${literal}`)).toBe(1);
  });

  it('ignora referências e placeholders', () => {
    expect(committedSecretAssignments('scripts/x.mjs', `{ ${RELEASE_PW}: password }`)).toBe(0);
    expect(committedSecretAssignments('docs/x.md', `set ${RELEASE_PW}=***`)).toBe(0);
    expect(committedSecretAssignments('ci/w.yml', `${RELEASE_PW}: \${{ secrets.X }}`)).toBe(0);
    expect(committedSecretAssignments('ci/run.sh', `${RELEASE_PW}=$SECRET`)).toBe(0);
    expect(committedSecretAssignments('a.properties', `${STORE_PW}=SUA_SENHA_AQUI`)).toBe(0);
    expect(committedSecretAssignments('build.gradle', `${STORE_PW} ${STORE_PW}Value`)).toBe(0);
  });
});

describe('GOAL-117 play-release-lib: senha versionada (prosa Markdown)', () => {
  it('não confunde texto entre crases com valor', () => {
    const name = 'store' + 'Password';
    expect(committedSecretAssignments('docs/x.md', `- \`${name}=\`, URLs de dev (\`http://localhost\`)`)).toBe(0);
  });
});

describe('GOAL-117 play-release-lib: evidência do backend no resolvedor', () => {
  // Trechos no formato real do bundle (ver GOAL-117): com e sem origem embutida.
  const notEmbedded =
    'let e,t=0===(e=(G.default.env.NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL??"").trim()).length?null:e;' +
    'return t?{kind:"remote",url:`${t}/api/nutrition/assistant`}:{kind:"unavailable"}';
  const embedded =
    'let e,t=0===(e="https://gymflow-beige-gamma.vercel.app".trim()).length?null:e;' +
    'return t?{kind:"remote",url:`${t}/api/nutrition/assistant`}:{kind:"unavailable"}';

  it('origem embutida no resolvedor = embedded', () => {
    expect(assistantBackendEvidence([{ name: 'a.js', text: embedded }]).embedded).toBe(true);
  });

  it('leitura em runtime restante = não embutido', () => {
    const ev = assistantBackendEvidence([{ name: 'a.js', text: notEmbedded }]);
    expect(ev.embedded).toBe(false);
    expect(ev.runtimeLookupFiles).toEqual(['a.js']);
  });

  it('URL Production solta em outro arquivo não certifica o backend', () => {
    const ev = assistantBackendEvidence([
      { name: 'a.js', text: notEmbedded },
      { name: 'link.js', text: 'href="https://gymflow-beige-gamma.vercel.app/sobre"' },
    ]);
    expect(ev.embedded).toBe(false);
  });
});

describe('GOAL-117 play-release-lib: chave descartável e senha com espaço', () => {
  it('só subject com o marcador de teste é descartável', () => {
    expect(isThrowawayRecord({ subject: 'CN=THROWAWAY TEST ONLY - NOT FOR PLAY, O=GymFlow, C=BR' })).toBe(true);
    expect(isThrowawayRecord({ subject: 'CN=GymFlow Upload, OU=Mobile, O=GymFlow, C=BR' })).toBe(false);
    expect(isThrowawayRecord(null)).toBe(false);
  });

  it('pega senha com espaço interno entre aspas', () => {
    const name = 'GYMFLOW_UPLOAD_KEY_' + 'PASSWORD';
    expect(committedSecretAssignments('scripts/x.mjs', `${name}: "minha senha longa 42"`)).toBe(1);
  });
});

describe('GOAL-117 play-release-lib: rodada 3 da revisão independente', () => {
  it.each([
    'http://172.16.0.5:3000/api',
    'http://172.31.255.1/x',
    'http://0.0.0.0:8080',
    'http://[::1]:3000',
    'http://meu-pc.local:3000',
    'https://127.0.0.1',
  ])('scan de artefato pega URL de host privado/loopback: %s', (url) => {
    expect(countMarkers(`fetch("${url}")`, DEV_BACKEND_MARKERS)).toMatchObject({ PRIVATE_HOST_URL: 1 });
  });

  it('não confunde host público parecido com privado', () => {
    expect(countMarkers('a="https://localhost.example.com";b="https://foo.locale.com";c="https://172.32.0.1"', DEV_BACKEND_MARKERS)).toEqual({});
  });

  it('template .properties.example é tratado como config (valor sem aspas conta)', () => {
    const name = 'store' + 'Password';
    expect(committedSecretAssignments('android/x.properties.example', `${name}=Real-Literal-99`)).toBe(1);
    expect(committedSecretAssignments('android/x.properties.example', `${name}=SUA_SENHA_AQUI`)).toBe(0);
    expect(committedSecretAssignments('android/x.properties.example', `${name}=<senha-do-keystore>`)).toBe(0);
  });

  it('placeholder é gramática exata, não prefixo', () => {
    const name = 'GYMFLOW_UPLOAD_KEY_' + 'PASSWORD';
    expect(committedSecretAssignments('scripts/x.mjs', `${name}: "$uperSecret-2026"`)).toBe(1);
    expect(committedSecretAssignments('scripts/x.mjs', `${name}: "<abc>def"`)).toBe(1);
    expect(committedSecretAssignments('ci/run.sh', `${name}=\${SECRET_FROM_VAULT}`)).toBe(0);
  });

  it('URL Production no mesmo chunk, longe do resolvedor, não certifica o backend', () => {
    const resolverWithoutOrigin =
      'let t=0===(e=(x??"").trim()).length?null:e;return t?{kind:"remote",url:`${t}/api/nutrition/assistant`}:{}';
    const chunk = `${resolverWithoutOrigin};${'x'.repeat(2000)};const link="https://gymflow-beige-gamma.vercel.app";`;
    expect(assistantBackendEvidence([{ name: 'c.js', text: chunk }]).embedded).toBe(false);
  });
});

describe('GOAL-117 play-release-lib: rodada 4 da revisão independente', () => {
  const RESOLVER_PREFIX = 'if(function(){try{let e=globalThis.Capacitor;return!0}catch{}return!1}()){let e,t=0===(e=';
  const RESOLVER_SUFFIX = ').length?null:e.replace(/\/+$/,"");return t?{kind:"remote",url:`${t}/api/nutrition/assistant`}:{kind:"unavailable"}}';
  const resolver = (expr: string) => `${RESOLVER_PREFIX}${expr}${RESOLVER_SUFFIX}`;

  it('origem estrangeira embutida no resolvedor é detectada (sem waiver possível)', () => {
    const ev = assistantBackendEvidence([{ name: 'c.js', text: resolver('"https://evil.example.com".trim()') }]);
    expect(ev.foreignOrigins).toEqual(['https://evil.example.com']);
    expect(ev.embedded).toBe(false);
    expect(ev.unavailableProven).toBe(false);
  });

  it('Production embutida na forma real (literal no .trim()) = embedded', () => {
    const ev = assistantBackendEvidence([{ name: 'c.js', text: resolver('"https://gymflow-beige-gamma.vercel.app".trim()') }]);
    expect(ev).toMatchObject({ embedded: true, foreignOrigins: [], unavailableProven: false });
  });

  it('leitura em runtime sem literal = indisponibilidade comprovada', () => {
    const ev = assistantBackendEvidence([
      { name: 'c.js', text: resolver('(G.default.env.NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL??"").trim()') },
    ]);
    expect(ev).toMatchObject({ embedded: false, unavailableProven: true, resolverOrigins: [] });
  });

  it('literal Production próximo que NÃO entra no .trim() da origem não certifica', () => {
    const text = `const link="https://gymflow-beige-gamma.vercel.app";${resolver('other().trim()')}`;
    const ev = assistantBackendEvidence([{ name: 'c.js', text }]);
    expect(ev.embedded).toBe(false);
    expect(ev.unavailableProven).toBe(false);
  });

  it('valor de config com pontuação inicial conta como senha', () => {
    const name = 'store' + 'Password';
    expect(committedSecretAssignments('a.properties', `${name}=#Correct-Horse-Battery-42`)).toBe(1);
    expect(committedSecretAssignments('a.properties.example', `${name}=;Senha-Ruim-2026`)).toBe(1);
    expect(committedSecretAssignments('a.properties', `# ${name}=Comentada-Mas-Real-9`)).toBe(1);
    expect(committedSecretAssignments('ci/w.yml', `      ${'GYMFLOW_RELEASE_STORE_'}PASSWORD: \${{ secrets.STORE_PW }}`)).toBe(0);
    expect(committedSecretAssignments('a.properties', `${name}=`)).toBe(0);
  });
});
