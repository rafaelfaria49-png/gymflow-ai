// GOAL-117 — Funções puras compartilhadas pelo ferramental de release Play
// (upload key, build assinado e auditoria). Sem I/O de segredo aqui: nada
// neste módulo lê, grava ou imprime senha. Testado em play-release-lib.test.ts.
import path from "node:path";

export const PACKAGE_ID = "com.gymflowai.app";

// Registro PÚBLICO do certificado da upload key (fingerprints + DN). É o
// contrato de assinatura: build e auditoria recusam artefato cujo signer não
// bata com este arquivo. Nunca contém senha nem material privado.
export const UPLOAD_CERT_RECORD = "android/play-upload-certificate.json";

// Marcador no subject de chave DESCARTÁVEL de teste. Só com ela o fluxo
// aceita árvore git suja (--allow-dirty); a upload key real nunca o tem.
export const THROWAWAY_SUBJECT_MARKER = "THROWAWAY TEST ONLY";

export function isThrowawayRecord(record) {
  return typeof record?.subject === "string" && record.subject.includes(THROWAWAY_SUBJECT_MARKER);
}

// Único backend GymFlow permitido no bundle mobile de release.
export const PRODUCTION_BACKEND_ORIGIN = "https://gymflow-beige-gamma.vercel.app";

// Senha da upload key: comprimento mínimo. A chave protege a identidade de
// upload do app no Play; senha curta não é aceitável.
export const MIN_UPLOAD_PASSWORD_LENGTH = 16;

/** Normaliza fingerprint para hex maiúsculo sem separadores. */
export function normalizeFingerprint(value) {
  return String(value ?? "")
    .replace(/[^0-9a-fA-F]/g, "")
    .toUpperCase();
}

/** Formata hex como AA:BB:CC (formato exibido pelo Play Console). */
export function formatFingerprint(value) {
  const hex = normalizeFingerprint(value);
  return hex.match(/.{1,2}/g)?.join(":") ?? "";
}

export function fingerprintsEqual(a, b) {
  const na = normalizeFingerprint(a);
  const nb = normalizeFingerprint(b);
  return na.length > 0 && na === nb;
}

/**
 * Lê SHA1/SHA256/Owner da saída de `keytool -printcert` / `keytool -list -v`
 * executado com `-J-Duser.language=en` (rótulos em inglês). Retorna o
 * primeiro certificado encontrado.
 */
export function parseKeytoolCertificate(text) {
  const source = String(text ?? "");
  const owner = source.match(/^\s*Owner:\s*(.+?)\s*$/m)?.[1] ?? null;
  const sha1 = source.match(/^\s*SHA1:\s*([0-9A-Fa-f:]+)\s*$/m)?.[1] ?? null;
  const sha256 = source.match(/^\s*SHA256:\s*([0-9A-Fa-f:]+)\s*$/m)?.[1] ?? null;
  const validUntil = source.match(/^\s*Valid from:.*?until:\s*(.+?)\s*$/m)?.[1] ?? null;
  const keyAlgorithm = source.match(/^\s*Subject Public Key Algorithm:\s*(.+?)\s*$/m)?.[1] ?? null;
  return {
    owner,
    sha1: sha1 ? normalizeFingerprint(sha1) : null,
    sha256: sha256 ? normalizeFingerprint(sha256) : null,
    validUntil,
    keyAlgorithm,
  };
}

/**
 * Lê TODOS os signers de `keytool -printcert -jarfile` (blocos "Signer #N:").
 * Um AAB de upload precisa ter exatamente um.
 */
export function parseKeytoolJarSigners(text) {
  const blocks = String(text ?? "").split(/^Signer #\d+:\s*$/m).slice(1);
  return blocks.map((block) => parseKeytoolCertificate(block));
}

// Avisos do jarsigner que invalidam o artefato. Cadeia/auto-assinado/sem
// timestamp são esperados numa upload key (certificado auto-assinado).
const JARSIGNER_FATAL_WARNINGS = [
  /unsigned entries/i,
  /has expired/i,
  /not yet valid/i,
  /not signed by/i,
  /KeyUsage|ExtendedKeyUsage/i,
  /weak algorithm|disabled algorithm|considered a security risk/i,
];

/**
 * Lê `jarsigner -verify -verbose` (locale en). Toda entrada de payload
 * (fora os arquivos de assinatura do META-INF e diretórios) precisa da flag
 * "s" (assinatura verificada); "jar verified." sozinho não basta, pois o
 * jarsigner só AVISA sobre entradas não assinadas.
 */
export function parseJarsignerVerbose(text) {
  const source = String(text ?? "");
  // Flags possíveis: s m k i x e "?" (= entrada NÃO assinada). Quem chama
  // confere `entries` contra a listagem do zip: linha não reconhecida falha.
  const entryRe = /^\s*([a-z?]*)\s+(\d+)\s+\S{3} \S{3} \d{2} \d{2}:\d{2}:\d{2} \S+ \d{4} (.+?)\s*$/gm;
  const unsignedPayload = [];
  let entries = 0;
  let match;
  while ((match = entryRe.exec(source)) !== null) {
    const flags = match[1];
    const name = match[3];
    if (name.endsWith("/")) continue;
    entries += 1;
    const isSignatureFile = /^META-INF\/[^/]+\.(SF|RSA|DSA|EC)$/i.test(name);
    if (!isSignatureFile && !flags.includes("s")) unsignedPayload.push(name);
  }
  const signedBy = [...source.matchAll(/^- Signed by "(.+)"\s*$/gm)].map((m) => m[1]);
  const fatalWarnings = JARSIGNER_FATAL_WARNINGS.filter((re) => re.test(source)).map((re) => re.source);
  return {
    verified: /^jar verified\.\s*$/m.test(source),
    entries,
    unsignedPayload,
    signedBy,
    fatalWarnings,
  };
}

// Arquivos que o `cap sync` injeta em assets/public além do export `out/`.
export const CAPACITOR_INJECTED_WEB_FILES = ["cordova.js", "cordova_plugins.js"];

/**
 * Compara a árvore web embarcada com `out/`: mapas caminho-relativo -> sha256.
 * Todo arquivo de out/ deve existir idêntico; extras só os injetados pelo
 * Capacitor. Retorna contagens (sem conteúdo).
 */
export function compareWebTrees(outHashes, embeddedHashes) {
  const missing = [];
  const different = [];
  for (const [rel, hash] of Object.entries(outHashes)) {
    if (!(rel in embeddedHashes)) missing.push(rel);
    else if (embeddedHashes[rel] !== hash) different.push(rel);
  }
  const unexpectedExtra = Object.keys(embeddedHashes).filter(
    (rel) => !(rel in outHashes) && !CAPACITOR_INJECTED_WEB_FILES.includes(rel)
  );
  return {
    match: Object.keys(outHashes).length > 0 && missing.length === 0 && different.length === 0 && unexpectedExtra.length === 0,
    missing,
    different,
    unexpectedExtra,
  };
}

// Nomes de credenciais de assinatura cujo VALOR nunca pode estar versionado.
export const SIGNING_SECRET_NAMES = [
  "storePassword",
  "keyPassword",
  "GYMFLOW_RELEASE_STORE_PASSWORD",
  "GYMFLOW_RELEASE_KEY_PASSWORD",
  "GYMFLOW_UPLOAD_KEY_PASSWORD",
  "GYMFLOW_UPLOAD_KEY_SECRET",
];

const CONFIG_LIKE_EXT = /\.(properties|env|sh|bash|bat|cmd|ps1|ya?ml|toml|ini|cfg|conf|txt|gradle|kts|json)$|(^|\/)\.env[^/]*$/i;
// Placeholders/referências aceitos: ***, $VAR, ${VAR}, %VAR%, <...>, SUA_/YOUR_.
const PLACEHOLDER_VALUE = /^(\*+|\$|%|<|\{|SUA_|YOUR_|CHANGE_?ME|xxx|\.\.\.)/i;

/**
 * Conta atribuições com VALOR literal a nomes de credencial de assinatura
 * num arquivo versionado (o valor nunca é devolvido). Literais entre aspas
 * contam em qualquer arquivo; valores sem aspas só em arquivos de
 * configuração/script (em código, `NOME: variavel` é referência, não segredo).
 */
export function committedSecretAssignments(filePath, text) {
  const source = String(text ?? "");
  const names = SIGNING_SECRET_NAMES.join("|");
  let count = 0;
  // Aspas duplas/simples: valor completo (espaços internos contam — senha pode
  // ter espaço). Crases: sem espaço, para não casar prosa do Markdown.
  const quoted = new RegExp(
    `\\b(?:${names})\\b\\s*[=:]\\s*(?:"([^"\\r\\n]{4,})"|'([^'\\r\\n]{4,})'|\`([^\`\\s]{4,})\`)`,
    "g"
  );
  for (const m of source.matchAll(quoted)) {
    const value = m[1] ?? m[2] ?? m[3] ?? "";
    if (!PLACEHOLDER_VALUE.test(value)) count += 1;
  }
  if (CONFIG_LIKE_EXT.test(String(filePath).replace(/\\/g, "/"))) {
    const bare = new RegExp(`\\b(?:${names})\\b\\s*[=:]\\s*([^\\s"'\`#;,]{4,})`, "g");
    for (const m of source.matchAll(bare)) {
      if (!PLACEHOLDER_VALUE.test(m[1])) count += 1;
    }
  }
  return count;
}

/** Lê os signers da saída de `apksigner verify --print-certs -v`. */
export function parseApksignerOutput(text) {
  const source = String(text ?? "");
  const signers = new Map();
  const re = /^Signer #(\d+) certificate (DN|SHA-256 digest|SHA-1 digest):\s*(.+?)\s*$/gm;
  let match;
  while ((match = re.exec(source)) !== null) {
    const index = Number(match[1]);
    const entry = signers.get(index) ?? { dn: null, sha256: null, sha1: null };
    if (match[2] === "DN") entry.dn = match[3];
    if (match[2] === "SHA-256 digest") entry.sha256 = normalizeFingerprint(match[3]);
    if (match[2] === "SHA-1 digest") entry.sha1 = normalizeFingerprint(match[3]);
    signers.set(index, entry);
  }
  const schemes = {};
  const schemeRe = /^Verified using (v[0-9.]+) scheme[^:]*:\s*(true|false)\s*$/gm;
  while ((match = schemeRe.exec(source)) !== null) schemes[match[1]] = match[2] === "true";
  return {
    verified: /^Verifies\s*$/m.test(source),
    signers: [...signers.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v),
    schemes,
  };
}

/** Lê identidade da saída de `aapt2 dump badging`. */
export function parseAapt2Badging(text) {
  const source = String(text ?? "");
  const pkg = source.match(/^package:\s*name='([^']+)'\s+versionCode='([^']*)'\s+versionName='([^']*)'/m);
  return {
    packageName: pkg?.[1] ?? null,
    versionCode: pkg?.[2] ? Number(pkg[2]) : null,
    versionName: pkg?.[3] ?? null,
    minSdk: source.match(/^minSdkVersion:'(\d+)'/m)?.[1] ?? null,
    targetSdk: source.match(/^targetSdkVersion:'(\d+)'/m)?.[1] ?? null,
    debuggable: /^application-debuggable\s*$/m.test(source),
    permissions: [...source.matchAll(/^uses-permission: name='([^']+)'/gm)].map((m) => m[1]),
  };
}

/** Lê versionCode/versionName declarados em android/app/build.gradle. */
export function parseGradleVersion(buildGradleText) {
  const source = String(buildGradleText ?? "");
  const code = source.match(/^\s*versionCode\s+(\d+)\s*$/m)?.[1];
  const name = source.match(/^\s*versionName\s+"([^"]+)"\s*$/m)?.[1];
  const appId = source.match(/^\s*applicationId\s+"([^"]+)"\s*$/m)?.[1];
  return {
    applicationId: appId ?? null,
    versionCode: code ? Number(code) : null,
    versionName: name ?? null,
  };
}

function comparablePath(p) {
  const resolved = path.resolve(p);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** true se `candidate` é `parent` ou está dentro dele. */
export function isPathInside(candidate, parent) {
  const c = comparablePath(candidate);
  const p = comparablePath(parent);
  if (c === p) return true;
  const rel = path.relative(p, c);
  return rel.length > 0 && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Regras mínimas de senha da upload key. Retorna a lista de problemas (vazia
 * = aceitável). Nunca inclui a senha na mensagem.
 */
export function uploadPasswordProblems(password) {
  const value = String(password ?? "");
  const problems = [];
  if (value.length < MIN_UPLOAD_PASSWORD_LENGTH) {
    problems.push(`mínimo de ${MIN_UPLOAD_PASSWORD_LENGTH} caracteres`);
  }
  if (value.length > 0 && new Set(value).size < 6) {
    problems.push("pouca variedade de caracteres");
  }
  if (/^\s|\s$/.test(value)) {
    problems.push("sem espaço no início/fim");
  }
  // keytool/Gradle tratam a senha como texto; caracteres de controle quebram
  // a digitação interativa e a leitura em properties.
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    problems.push("sem caracteres de controle");
  }
  return problems;
}

const PRIVATE_HOST_RE =
  /^(localhost|.*\.local|127(?:\.\d{1,3}){3}|0\.0\.0\.0|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|\[?::1\]?)$/i;

/**
 * Valida a origem pública do backend GymFlow embutida no bundle mobile.
 * Aceita somente HTTPS sem path/query/credenciais, host público e nunca o
 * provedor de IA direto.
 */
export function backendOriginProblems(value) {
  const raw = String(value ?? "").trim();
  if (raw.length === 0) return [];
  let url;
  try {
    url = new URL(raw);
  } catch {
    return ["URL inválida"];
  }
  const problems = [];
  if (url.protocol !== "https:") problems.push("precisa ser https");
  if (url.username || url.password) problems.push("sem credenciais na URL");
  if (url.pathname !== "/" || url.search || url.hash) problems.push("somente origem (sem path/query)");
  if (PRIVATE_HOST_RE.test(url.hostname)) problems.push("host local/privado não permitido");
  if (/(^|\.)openrouter\.ai$/i.test(url.hostname)) problems.push("provedor de IA direto não permitido");
  if (/ngrok|localtunnel|trycloudflare/i.test(url.hostname)) problems.push("túnel de desenvolvimento não permitido");
  return problems;
}

// Marcadores de segredo/provedor. Só ids e contagens são reportados — nunca o
// trecho encontrado.
export const SECRET_MARKERS = [
  { id: "OPENROUTER_KEY", re: /sk-or-v1-[A-Za-z0-9]{16,}/g },
  { id: "OPENAI_STYLE_KEY", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g },
  { id: "OPENROUTER_HOST", re: /openrouter\.ai/gi },
  { id: "CHAT_COMPLETIONS_PATH", re: /chat\/completions/g },
  { id: "GYMFLOW_AI_API_KEY_NAME", re: /GYMFLOW_AI_API_KEY/g },
  { id: "OPENROUTER_API_KEY_NAME", re: /OPENROUTER_API_KEY/g },
  { id: "BLOB_RW_TOKEN", re: /vercel_blob_rw_[A-Za-z0-9]{8,}|BLOB_READ_WRITE_TOKEN/g },
  { id: "VERCEL_OIDC_TOKEN_NAME", re: /VERCEL_OIDC_TOKEN/g },
  { id: "PRIVATE_KEY_PEM", re: /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/g },
  { id: "SIGNING_PASSWORD_PROPERTY", re: /\b(?:storePassword|keyPassword)\s*=/g },
  { id: "GOOGLE_API_KEY", re: /AIza[0-9A-Za-z_-]{35}/g },
  { id: "GITHUB_TOKEN", re: /\bgh[pousr]_[A-Za-z0-9]{36,}/g },
];

// Marcadores de backend de desenvolvimento. O parser de URL do Next contém o
// literal "localhost" (sem esquema) — por isso só esquema+host contam.
export const DEV_BACKEND_MARKERS = [
  { id: "HTTP_LOCALHOST", re: /https?:\/\/localhost[:/]/gi },
  { id: "LOOPBACK_IP", re: /https?:\/\/127\.0\.0\.1/g },
  { id: "EMULATOR_HOST", re: /https?:\/\/10\.0\.2\.2/g },
  { id: "LAN_IP", re: /https?:\/\/(?:192\.168|10)\.\d{1,3}\.\d{1,3}/g },
  { id: "TUNNEL_HOST", re: /https?:\/\/[a-z0-9.-]*(?:ngrok|localtunnel|trycloudflare)[a-z0-9.-]*/gi },
];

/** Conta ocorrências por marcador (sem devolver o conteúdo casado). */
export function countMarkers(text, markers) {
  const source = String(text ?? "");
  const counts = {};
  for (const marker of markers) {
    const found = source.match(new RegExp(marker.re.source, marker.re.flags));
    if (found && found.length > 0) counts[marker.id] = found.length;
  }
  return counts;
}

// Leitura em runtime da origem (sobra quando a variável NÃO foi embutida no
// build; quando embutida, o Next substitui a expressão pelo literal).
export const RUNTIME_BACKEND_LOOKUP = "env.NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL";
export const ASSISTANT_PATH = "/api/nutrition/assistant";

/**
 * Evidência de que o RESOLVEDOR do endpoint do assistente usa a origem
 * Production embutida — não basta a URL aparecer em qualquer arquivo.
 * `files`: [{ name, text }]. Embutido = nenhuma leitura em runtime restante
 * em arquivo algum E algum arquivo que monta `${origem}/api/nutrition/assistant`
 * contém a origem Production.
 */
export function assistantBackendEvidence(files, origin = PRODUCTION_BACKEND_ORIGIN) {
  const resolverFiles = [];
  const resolverWithOrigin = [];
  const runtimeLookupFiles = [];
  for (const { name, text } of files) {
    const source = String(text ?? "");
    if (source.includes(RUNTIME_BACKEND_LOOKUP)) runtimeLookupFiles.push(name);
    if (source.includes(ASSISTANT_PATH)) {
      resolverFiles.push(name);
      if (source.includes(origin)) resolverWithOrigin.push(name);
    }
  }
  return {
    embedded: runtimeLookupFiles.length === 0 && resolverWithOrigin.length > 0,
    resolverFiles,
    resolverWithOrigin,
    runtimeLookupFiles,
  };
}

/** Hosts *.vercel.app presentes no texto (para conferir que só há Production). */
export function vercelAppHosts(text) {
  const hosts = new Set();
  for (const m of String(text ?? "").matchAll(/https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app)/gi)) {
    hosts.add(m[1].toLowerCase());
  }
  return [...hosts].sort();
}
