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
// Sufixos de template: `x.properties.example` é tratado como `x.properties`.
const TEMPLATE_SUFFIX = /\.(example|sample|template|dist)$/i;
// Placeholders/referências aceitos — gramáticas EXATAS (não prefixo):
// ***, $VAR, ${VAR}, ${{ expr }}, %VAR%, <texto>, SUA_X / YOUR_X, CHANGEME, xxx, ...
const PLACEHOLDER_VALUE =
  /^(?:\*+|\$[A-Za-z_][A-Za-z0-9_]*|\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$\{\{[^}]*\}\}|%[A-Za-z_][A-Za-z0-9_]*%|<[^<>]+>|(?:SUA|YOUR)_[A-Z0-9_]+|CHANGE_?ME|x{3,}|\.{3})$/i;

function withoutTemplateSuffix(filePath) {
  return String(filePath).replace(/\\/g, "/").replace(TEMPLATE_SUFFIX, "");
}

function isConfigLike(filePath) {
  return CONFIG_LIKE_EXT.test(withoutTemplateSuffix(filePath));
}

/**
 * Conta atribuições com VALOR literal a nomes de credencial de assinatura
 * num arquivo versionado (o valor nunca é devolvido).
 * - Config/script (properties, env, sh, yaml, json, gradle...): cada
 *   atribuição é lida até o fim da linha, inclusive linhas comentadas (senha
 *   comentada continua vazada). Em `.properties` o valor é a linha inteira
 *   (`#`/`;` no meio fazem parte do valor); nos demais, remove `,`/`;` final
 *   e comentário ` #...` fora de aspas. Aspas pareadas são retiradas; aspa
 *   sem par fica no valor.
 * - Arquivo sem extensão (gradlew, Dockerfile...) é tratado como config;
 *   em Markdown, blocos de código cercados também (comandos `X=valor`).
 * - Código/prosa: só literais entre aspas contam (`NOME: variavel` é
 *   referência, não segredo). Crases exigem valor sem espaço (prosa de .md).
 * Chave entre aspas (JSON: `"storePassword": ...`) também é reconhecida.
 */
export function committedSecretAssignments(filePath, text) {
  const source = String(text ?? "");
  const normalized = withoutTemplateSuffix(filePath);
  const baseName = normalized.split("/").pop() ?? "";
  // Arquivo sem extensão (script/config: gradlew, Dockerfile...) = config.
  if (isConfigLike(filePath) || !baseName.includes(".")) {
    return configSecretAssignments(source, /\.properties$/i.test(normalized));
  }
  // Markdown: blocos de código cercados (``` / ~~~) são lidos como script;
  // a prosa fora deles só conta literal entre aspas.
  if (/\.mdx?$/i.test(normalized)) {
    // CommonMark: cerca com até 3 espaços de recuo; fecha com a mesma sequência.
    const fenceRe = /^ {0,3}(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^ {0,3}\1/gm;
    let fenced = 0;
    for (const m of source.matchAll(fenceRe)) fenced += configSecretAssignments(m[2], false);
    const prose = source.replace(fenceRe, "");
    // Bloco de código indentado (4 espaços ou tab) também é lido como script.
    const indented = prose
      .split(/\r?\n/)
      .filter((l) => /^(?: {4}|\t)/.test(l))
      .join("\n");
    return fenced + configSecretAssignments(indented, false) + quotedSecretAssignments(prose);
  }
  return quotedSecretAssignments(source);
}

const SECRET_ASSIGN = `\\b(?:${SIGNING_SECRET_NAMES.join("|")})\\b["']?\\s*[=:]\\s*`;

function quotedSecretAssignments(source) {
  let count = 0;
  const quoted = new RegExp(`${SECRET_ASSIGN}(?:"([^"\\r\\n]{4,})"|'([^'\\r\\n]{4,})'|\`([^\`\\s]{4,})\`)`, "g");
  for (const m of source.matchAll(quoted)) {
    const value = m[1] ?? m[2] ?? m[3] ?? "";
    if (!PLACEHOLDER_VALUE.test(value)) count += 1;
  }
  return count;
}

function configSecretAssignments(source, isProperties) {
  let count = 0;
  for (const m of source.matchAll(new RegExp(`${SECRET_ASSIGN}(.*)$`, "gm"))) {
    let value = m[1].replace(/\r$/, "").trim();
    const q = value[0];
    const close = q === '"' || q === "'" || q === "`" ? value.indexOf(q, 1) : -1;
    if (close > 0) {
      // Literal entre aspas pareadas: o valor é o conteúdo (resto da linha,
      // ex. `, "outra": 1 }` do JSON, não faz parte).
      value = value.slice(1, close);
    } else if (!isProperties) {
      value = value.replace(/\s+#.*$/, "").replace(/[,;]$/, "").trim();
    }
    if (value.length >= 4 && !PLACEHOLDER_VALUE.test(value)) count += 1;
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

// Definição ÚNICA de host local/privado: usada para validar a origem do
// backend e para varrer artefatos (DEV_BACKEND_MARKERS abaixo).
const PRIVATE_HOST_SOURCE =
  "localhost|[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.local|127(?:\\.\\d{1,3}){3}|0\\.0\\.0\\.0|10(?:\\.\\d{1,3}){3}|192\\.168(?:\\.\\d{1,3}){2}|172\\.(?:1[6-9]|2\\d|3[01])(?:\\.\\d{1,3}){2}|\\[::1\\]|::1";
const PRIVATE_HOST_RE = new RegExp(`^(?:${PRIVATE_HOST_SOURCE})$`, "i");

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
  // Esquema + host privado seguido de fim de host (porta, path, aspas...).
  { id: "PRIVATE_HOST_URL", re: new RegExp(`https?:\\/\\/(?:${PRIVATE_HOST_SOURCE})(?=[:/?#"'\`\\s)]|$)`, "gi") },
  { id: "EMULATOR_HOST", re: /https?:\/\/10\.0\.2\.2/g },
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

// Janela (caracteres) antes do template `${x}/api/nutrition/assistant` que
// contém o corpo do resolvedor compilado (medido no bundle real: ~170).
const RESOLVER_WINDOW = 400;

/**
 * Evidência do backend a partir do RESOLVEDOR compilado do endpoint do
 * assistente (`ai-assistant-client.ts`), não de ocorrências soltas da URL.
 * `files`: [{ name, text }]. Para cada template `${x}/api/nutrition/assistant`
 * examina a janela anterior:
 *  - `resolverOrigins`: TODA URL literal na janela (qualquer uma ≠ Production
 *    é origem estrangeira embutida → falha dura, sem waiver);
 *  - embedded: o literal Production entra no `.trim()` da leitura da origem
 *    (forma de `(env ?? '').trim()` com o valor embutido) e não resta leitura
 *    em runtime em arquivo algum;
 *  - unavailableProven: janela sem URL literal e com a leitura em runtime
 *    (variável não embutida → IA nativa indisponível, único caso do waiver).
 * Refatorar o resolvedor faz o gate FALHAR (nunca passar por engano).
 */
const JS_ID = "[A-Za-z_$][\\w$]*";

/**
 * Forma compilada de `resolveAssistantEndpoint()` com VÍNCULO por
 * identificador: o valor-fonte `SRC` é atribuído a `tmp`, `out` recebe
 * `tmp` normalizado e é o MESMO identificador interpolado em
 * `${out}/api/nutrition/assistant` (medido no bundle real do Next/Turbopack):
 *   t=0===(e=SRC).length?null:e.replace(/\/+$/,"");return t?{kind:"remote",url:`${t}/api/...`}
 * Se o minificador/refatoração mudar essa forma, o gate FALHA (fail-closed).
 */
function boundResolverRe(src) {
  return new RegExp(
    `(${JS_ID})=0===\\((${JS_ID})=${src}\\)\\.length\\?null:\\2(?:\\.replace\\([^;]{0,40}\\))?;return \\1\\?\\{kind:"remote",url:\`\\$\\{\\1\\}\\/api\\/nutrition\\/assistant\``,
    "g"
  );
}

export function assistantBackendEvidence(files, origin = PRODUCTION_BACKEND_ORIGIN) {
  const escapedOrigin = origin.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  // Origem embutida: `"ORIGEM".trim()` ou `("ORIGEM"??"").trim()`.
  const embeddedRe = boundResolverRe(`(?:"${escapedOrigin}"|\\("${escapedOrigin}"\\?\\?""\\))\\.trim\\(\\)`);
  // Não embutida: `(X.env.NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL??"").trim()`.
  const runtimeRe = boundResolverRe(`\\([\\w$.]*env\\.NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL\\?\\?""\\)\\.trim\\(\\)`);
  const templateRe = /\$\{[\w$]+\}\/api\/nutrition\/assistant/g;
  const urlLiteralRe = /["'`](https?:\/\/[^"'`\s]+?)\/*["'`]/g;
  const resolverFiles = [];
  const resolverOrigins = new Set();
  const runtimeLookupFiles = [];
  let templates = 0;
  let boundEmbedded = 0;
  let boundRuntime = 0;
  for (const { name, text } of files) {
    const source = String(text ?? "");
    if (source.includes(RUNTIME_BACKEND_LOOKUP)) runtimeLookupFiles.push(name);
    let found = false;
    for (const m of source.matchAll(templateRe)) {
      found = true;
      templates += 1;
      // Toda URL literal perto do resolvedor (qualquer uma ≠ Production = estrangeira).
      const window = source.slice(Math.max(0, m.index - RESOLVER_WINDOW), m.index);
      for (const u of window.matchAll(urlLiteralRe)) resolverOrigins.add(u[1]);
    }
    if (found) {
      resolverFiles.push(name);
      boundEmbedded += [...source.matchAll(embeddedRe)].length;
      boundRuntime += [...source.matchAll(runtimeRe)].length;
    }
  }
  const origins = [...resolverOrigins].sort();
  const foreignOrigins = origins.filter((o) => o !== origin);
  return {
    resolverFiles,
    resolverOrigins: origins,
    foreignOrigins,
    runtimeLookupFiles,
    embedded: templates > 0 && boundEmbedded === templates && foreignOrigins.length === 0 && runtimeLookupFiles.length === 0,
    unavailableProven: templates > 0 && boundRuntime === templates && origins.length === 0,
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
