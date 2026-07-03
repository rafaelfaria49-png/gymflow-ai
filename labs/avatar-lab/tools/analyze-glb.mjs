#!/usr/bin/env node
/**
 * GymFlow Avatar Lab — analyze-glb.mjs
 * -----------------------------------------------------------------------------
 * Pipeline "GLB entra -> dados objetivos saem", SEM dependências externas.
 * Lê o container binário GLB (glTF 2.0) na unha e extrai métricas reais.
 *
 * ISOLAMENTO: vive em labs/avatar-lab/tools. NÃO toca GymFlow AI / Motion
 * Engine / POC / src. Não instala nada. Só lê arquivos .glb e .meta.json.
 *
 * USO:
 *   node analyze-glb.mjs                      # analisa todos os .glb em ../drop
 *   node analyze-glb.mjs caminho/avatar.glb   # analisa um arquivo
 *   node analyze-glb.mjs pasta/               # analisa todos os .glb da pasta
 *   node analyze-glb.mjs --out ../results/_auto   # onde salvar relatórios
 *   node analyze-glb.mjs --json               # imprime JSON no stdout também
 *
 * HONESTIDADE (princípio do projeto): este script só pontua o que está
 * OBJETIVAMENTE nos bytes. O que NÃO dá para saber de um GLB é marcado como
 * "pendente" e NUNCA inventado:
 *   - Qualidade visual / uncanny / pele -> precisa de olhos/render (humano).
 *   - Topologia quad/edge-loops -> PERDIDA: GLB é sempre triangulado.
 *   - FPS / tempo de carregamento -> precisa do harness de render (futuro).
 *   - Licença / custo -> vem do sidecar <nome>.meta.json (você preenche).
 * -----------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, basename, extname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUBRIC = JSON.parse(readFileSync(join(__dirname, "rubric.json"), "utf8"));

// ---------------------------------------------------------------------------
// 1) PARSE do container GLB (glTF 2.0) — sem libs
// ---------------------------------------------------------------------------
const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

function parseGLB(buf) {
  if (buf.length < 12) throw new Error("Arquivo pequeno demais para ser GLB.");
  const magic = buf.readUInt32LE(0);
  if (magic !== GLB_MAGIC) {
    throw new Error("Não é GLB binário (magic 'glTF' ausente). Se for .gltf+.bin, exporte como .glb.");
  }
  const version = buf.readUInt32LE(4);
  const declaredLength = buf.readUInt32LE(8);

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    if (chunkType === CHUNK_JSON) {
      json = JSON.parse(buf.toString("utf8", dataStart, dataEnd));
    } else if (chunkType === CHUNK_BIN) {
      bin = buf.subarray(dataStart, dataEnd);
    }
    offset = dataEnd;
  }
  if (!json) throw new Error("Chunk JSON não encontrado no GLB.");
  return { version, declaredLength, json, bin };
}

// ---------------------------------------------------------------------------
// 2) Dimensões de imagem embutida (PNG / JPEG / KTX2) — leitura de cabeçalho
// ---------------------------------------------------------------------------
function pngSize(b) {
  // assinatura PNG (8 bytes) + IHDR a partir do byte 16: width(4 BE), height(4 BE)
  if (b.length < 24) return null;
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function jpegSize(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    // SOF markers (exceto C4=DHT, C8=JPG, CC=DAC) trazem altura/largura
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = b.readUInt16BE(i + 5);
      const w = b.readUInt16BE(i + 7);
      return { w, h };
    }
    const segLen = b.readUInt16BE(i + 2);
    i += 2 + segLen;
  }
  return null;
}
function ktx2Size(b) {
  // KTX2: identificador 12 bytes; pixelWidth @ 20 (LE), pixelHeight @ 24 (LE)
  if (b.length < 28) return null;
  const id = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < id.length; i++) if (b[i] !== id[i]) return null;
  return { w: b.readUInt32LE(20), h: b.readUInt32LE(24), compressed: true };
}

function imageDimensions(img, gltf, bin, baseDir) {
  let bytes = null;
  if (img.bufferView !== undefined && bin) {
    const bv = gltf.bufferViews[img.bufferView];
    const start = bv.byteOffset || 0;
    bytes = bin.subarray(start, start + bv.byteLength);
  } else if (img.uri) {
    if (img.uri.startsWith("data:")) {
      const b64 = img.uri.split(",")[1] || "";
      bytes = Buffer.from(b64, "base64");
    } else {
      const p = join(baseDir, decodeURIComponent(img.uri));
      if (existsSync(p)) bytes = readFileSync(p);
    }
  }
  if (!bytes) return null;
  return pngSize(bytes) || jpegSize(bytes) || ktx2Size(bytes);
}

// ---------------------------------------------------------------------------
// 3) Métricas objetivas a partir da estrutura glTF
// ---------------------------------------------------------------------------
function computeMetrics(parsed, filePath) {
  const g = parsed.json;
  const bin = parsed.bin;
  const baseDir = dirname(filePath);
  const fileSizeBytes = statSync(filePath).size;
  const accessors = g.accessors || [];
  const meshes = g.meshes || [];
  const nodes = g.nodes || [];
  const skins = g.skins || [];
  const materials = g.materials || [];
  const animations = g.animations || [];
  const images = g.images || [];
  const extUsed = g.extensionsUsed || [];
  const extReq = g.extensionsRequired || [];

  // --- triângulos ---
  let triangles = 0;
  let primitiveCount = 0;
  let nonTriPrimitives = 0;
  for (const mesh of meshes) {
    for (const prim of mesh.primitives || []) {
      primitiveCount++;
      const mode = prim.mode === undefined ? 4 : prim.mode; // 4 = TRIANGLES
      let vtxOrIdx;
      if (prim.indices !== undefined) vtxOrIdx = accessors[prim.indices]?.count || 0;
      else vtxOrIdx = accessors[prim.attributes?.POSITION]?.count || 0;
      if (mode === 4) triangles += Math.floor(vtxOrIdx / 3);
      else if (mode === 5 || mode === 6) triangles += Math.max(0, vtxOrIdx - 2); // strip/fan
      else nonTriPrimitives++;
    }
  }

  // --- vértices (soma de POSITION por primitive) ---
  let vertices = 0;
  for (const mesh of meshes)
    for (const prim of mesh.primitives || [])
      vertices += accessors[prim.attributes?.POSITION]?.count || 0;

  // --- bones / rig ---
  const jointSet = new Set();
  for (const skin of skins) for (const j of skin.joints || []) jointSet.add(j);
  const boneCount = jointSet.size;
  const hasRig = skins.length > 0 && boneCount > 0;
  const jointNames = [...jointSet].map((idx) => nodes[idx]?.name || `node_${idx}`);

  // --- materiais / PBR ---
  let withPBR = 0, withNormal = 0, withEmissive = 0, withOcclusion = 0;
  const advMaterialExt = new Set();
  for (const m of materials) {
    if (m.pbrMetallicRoughness) withPBR++;
    if (m.normalTexture) withNormal++;
    if (m.emissiveTexture || m.emissiveFactor) withEmissive++;
    if (m.occlusionTexture) withOcclusion++;
    for (const k of Object.keys(m.extensions || {})) advMaterialExt.add(k);
  }

  // --- texturas / imagens ---
  const textureSizes = [];
  let maxTexturePx = 0;
  let anyCompressedTex = false;
  for (const img of images) {
    const dim = imageDimensions(img, g, bin, baseDir);
    if (dim) {
      textureSizes.push({ w: dim.w, h: dim.h, compressed: !!dim.compressed, mime: img.mimeType });
      maxTexturePx = Math.max(maxTexturePx, dim.w, dim.h);
      if (dim.compressed) anyCompressedTex = true;
    } else {
      textureSizes.push({ w: null, h: null, mime: img.mimeType, note: "dimensão não lida" });
    }
  }

  // --- animações ---
  const animList = animations.map((a) => {
    let duration = 0;
    for (const ch of a.channels || []) {
      const sampler = a.samplers?.[ch.sampler];
      const inputAcc = accessors[sampler?.input];
      if (inputAcc?.max?.[0] !== undefined) duration = Math.max(duration, inputAcc.max[0]);
    }
    return { name: a.name || "(sem nome)", channels: (a.channels || []).length, durationSec: +duration.toFixed(3) };
  });

  // --- compressão / extensões ---
  const hasDraco = extUsed.includes("KHR_draco_mesh_compression");
  const hasMeshopt = extUsed.includes("EXT_meshopt_compression");
  const hasKTX2 = extUsed.includes("KHR_texture_basisu");
  const supported = new Set(RUBRIC.compatibility.webSupportedExtensions);
  const unsupportedUsed = extUsed.filter((e) => !supported.has(e));
  const unsupportedRequired = extReq.filter((e) => !supported.has(e));

  return {
    file: basename(filePath),
    path: filePath,
    glbVersion: parsed.version,
    generator: g.asset?.generator || "(desconhecido)",
    gltfVersion: g.asset?.version || "?",
    fileSizeBytes,
    fileSizeMB: +(fileSizeBytes / 1048576).toFixed(2),
    triangles,
    vertices,
    primitiveCount,
    nonTriPrimitives,
    meshCount: meshes.length,
    nodeCount: nodes.length,
    skinCount: skins.length,
    boneCount,
    hasRig,
    jointNames,
    materialCount: materials.length,
    withPBR,
    withNormal,
    withEmissive,
    withOcclusion,
    advMaterialExt: [...advMaterialExt],
    imageCount: images.length,
    textureSizes,
    maxTexturePx,
    anyCompressedTex,
    animationCount: animations.length,
    animations: animList,
    extensionsUsed: extUsed,
    extensionsRequired: extReq,
    hasDraco,
    hasMeshopt,
    hasKTX2,
    unsupportedExtensionsUsed: unsupportedUsed,
    unsupportedExtensionsRequired: unsupportedRequired,
  };
}

// ---------------------------------------------------------------------------
// 4) Banda -> nota
// ---------------------------------------------------------------------------
function band(value, bands) {
  for (const b of bands) if (b.max === null || value <= b.max) return b.score;
  return bands[bands.length - 1].score;
}

// ---------------------------------------------------------------------------
// 5) Sidecar <nome>.meta.json — o que os bytes NÃO contam (humano/externo)
// ---------------------------------------------------------------------------
function loadSidecar(filePath) {
  const p = filePath.replace(/\.glb$/i, ".meta.json");
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); }
  catch { return { _error: "meta.json inválido (JSON malformado)" }; }
}

// ---------------------------------------------------------------------------
// 6) Pontuação por eixo
// ---------------------------------------------------------------------------
function scoreAxes(m, sidecar) {
  const B = RUBRIC.bands;
  const pending = []; // o que exige humano/render/externo

  // EIXO TÉCNICA (objetivo)
  const triScore = band(m.triangles, B.triangles);
  const boneScore = m.hasRig ? band(m.boneCount, B.bones) : 0;
  const tecnicaParts = [triScore];
  if (m.hasRig) tecnicaParts.push(boneScore);
  else pending.push("Sem rig/skin no GLB: nota técnica de rig = 0 (avatar não animável sem re-rig).");
  const tecnica = avg(tecnicaParts);

  // EIXO PERFORMANCE (proxy estático; FPS real fica pro harness)
  const sizeScore = band(m.fileSizeMB, B.fileSizeMB);
  const texScore = m.maxTexturePx > 0 ? band(m.maxTexturePx, B.textureMaxPx) : 6;
  const drawCallProxy = m.primitiveCount <= 4 ? 10 : m.primitiveCount <= 8 ? 8 : m.primitiveCount <= 16 ? 6 : 4;
  const triScorePerf = band(m.triangles, B.triangles); // tris pesam no custo de render
  let perfBonus = 0;
  if (m.hasDraco || m.hasMeshopt) perfBonus += 0.5;
  if (m.hasKTX2 || m.anyCompressedTex) perfBonus += 0.5;
  const performance = clamp10(avg([sizeScore, texScore, drawCallProxy, triScorePerf]) + perfBonus);
  pending.push("FPS desktop/mobile e tempo de carregamento: medir no harness de render do lab (não estimável só pelos bytes).");

  // EIXO COMPATIBILIDADE (objetivo)
  let compat = 10;
  if (m.gltfVersion !== "2.0") compat -= 3;
  if (m.unsupportedExtensionsUsed.length) compat -= 2 * m.unsupportedExtensionsUsed.length;
  if (m.nonTriPrimitives > 0) compat -= 2; // modos não-triângulo às vezes complicam
  compat = clamp10(compat);

  // EIXO MANUTENÇÃO (heurística objetiva)
  let manut = 7;
  if (m.hasRig) manut += 1;
  if (m.generator && m.generator !== "(desconhecido)") manut += 1; // origem rastreável = re-gerar fácil
  if (m.boneCount > RUBRIC.budgets.bones.ceiling) manut -= 1;
  if (m.materialCount > 12) manut -= 1; // muitos materiais = mais trabalho de update
  manut = clamp10(manut);

  // EIXO VISUAL — proxies objetivos + nota humana (sidecar) é a autoridade
  const visualProxyParts = [];
  visualProxyParts.push(m.maxTexturePx >= 2048 ? 9 : m.maxTexturePx >= 1024 ? 7 : 4);
  visualProxyParts.push(m.withNormal > 0 ? 9 : 5);
  visualProxyParts.push(m.advMaterialExt.length > 0 ? 8 : 6);
  visualProxyParts.push(m.triangles >= 30000 ? 8 : m.triangles >= 15000 ? 6 : 4);
  const visualProxy = +avg(visualProxyParts).toFixed(1);
  let visualHuman = null, maosHuman = null, rostoHuman = null;
  if (sidecar?.visual) {
    visualHuman = sidecar.visual.geral ?? null;
    maosHuman = sidecar.visual.maos ?? null;
    rostoHuman = sidecar.visual.rosto ?? null;
  }
  const visual = visualHuman ?? null;
  if (visual === null) pending.push("Nota VISUAL definitiva precisa de olhos: preencher sidecar .meta.json -> visual {geral,rosto,maos,pele,...}. Proxy estático = " + visualProxy + "/10 (só orienta).");

  // EIXO COMERCIAL — licença (sidecar)
  let comercial = null;
  const lic = sidecar?.licenca?.toLowerCase?.() || "";
  if (lic) {
    if (/(private|royalty|propriet|comprad|owned|full rights|cess)/.test(lic)) comercial = 10;
    else if (/(commercial|comercial|pro|paid|pago)/.test(lic)) comercial = 8;
    else if (/(cc by|attribution|atribu)/.test(lic)) comercial = 4;
    else if (/(non.?commercial|nc|sem uso comercial|research)/.test(lic)) comercial = 1;
    else comercial = 5;
  } else {
    pending.push("Nota COMERCIAL precisa da licença: preencher sidecar .meta.json -> licenca.");
  }

  // EIXO 3 — EXPERIÊNCIA HUMANA (humano; sidecar.experiencia_humana{})
  const ehKeys = RUBRIC.humanExperienceCriteria?.keys || [];
  const ehSrc = sidecar?.experiencia_humana || {};
  const ehCriteria = {};
  const ehFilled = [];
  for (const k of ehKeys) {
    const v = typeof ehSrc[k] === "number" ? ehSrc[k] : null;
    ehCriteria[k] = v;
    if (v !== null) ehFilled.push(v);
  }
  const experienciaHumana = ehFilled.length ? +avg(ehFilled).toFixed(1) : null;
  if (experienciaHumana === null)
    pending.push("Eixo EXPERIÊNCIA HUMANA precisa de avaliação humana: preencher sidecar .meta.json -> experiencia_humana{empatia, credibilidade, naturalidade_corporal, movimento, maos, expressao_facial, premium, identificacao}.");
  else if (ehFilled.length < ehKeys.length)
    pending.push(`Experiência Humana PARCIAL: ${ehFilled.length}/${ehKeys.length} critérios preenchidos (média só dos disponíveis; 'movimento' depende de animação).`);

  // MACRO-EIXOS (decisão em 3 eixos: 50% técnico / 30% visual / 20% experiência humana)
  const tc = RUBRIC.tecnicoComponents;
  const tecnicoMacro = +clamp10(
    tecnica * tc.tecnica + performance * tc.performance + compat * tc.compatibilidade + manut * tc.manutencao
  ).toFixed(1);
  const macros = {
    tecnico: { value: tecnicoMacro, source: "objetivo (téc/perf/compat/manut)" },
    visual: { value: visual, proxy: visualProxy, source: visual === null ? "pendente (humano)" : "humano (sidecar)" },
    experiencia_humana: { value: experienciaHumana, criteria: ehCriteria, source: experienciaHumana === null ? "pendente (humano)" : "humano (sidecar)" },
  };

  return {
    raw: { triScore, boneScore, sizeScore, texScore, drawCallProxy, visualProxy },
    axes: {
      visual: { value: visual, proxy: visualProxy, maos: maosHuman, rosto: rostoHuman, source: visual === null ? "pendente (humano)" : "humano (sidecar)" },
      tecnica: { value: +tecnica.toFixed(1), source: "objetivo (bytes)" },
      performance: { value: +performance.toFixed(1), source: "proxy estático (FPS pendente no harness)" },
      compatibilidade: { value: +compat.toFixed(1), source: "objetivo (bytes)" },
      manutencao: { value: +manut.toFixed(1), source: "heurística objetiva" },
      comercial: { value: comercial, source: comercial === null ? "pendente (licença)" : "sidecar" },
    },
    macros,
    pending,
  };
}

// ---------------------------------------------------------------------------
// 7) Portões eliminatórios + nota final
// ---------------------------------------------------------------------------
function evaluateGates(m, scored, sidecar) {
  const G = RUBRIC.gates;
  const fails = [];
  const a = scored.axes;
  if (a.visual.maos !== null && a.visual.maos < G.visual_maos_min) fails.push(`Mãos ${a.visual.maos} < ${G.visual_maos_min}`);
  if (a.visual.rosto !== null && a.visual.rosto < G.visual_rosto_min) fails.push(`Rosto ${a.visual.rosto} < ${G.visual_rosto_min}`);
  if (m.fileSizeMB > G.fileSizeMB_max) fails.push(`Peso ${m.fileSizeMB}MB > ${G.fileSizeMB_max}MB`);
  if (G.no_unsupported_required_extension && m.unsupportedExtensionsRequired.length)
    fails.push(`Extensão obrigatória não suportada em R3F/three: ${m.unsupportedExtensionsRequired.join(", ")}`);
  if (G.rig_must_conform_single_skeleton && !m.hasRig)
    fails.push("Sem rig: não conforma o skeleton único (precisa re-rig).");
  const fpsMobile = sidecar?.tecnico?.fpsMobile;
  if (typeof fpsMobile === "number" && fpsMobile < G.fps_mobile_min) fails.push(`FPS mobile ${fpsMobile} < ${G.fps_mobile_min}`);

  // NOVO GATE: precisa vencer nos 3 eixos (cada macro >= 8.5)
  const M = scored.macros;
  if (typeof M.tecnico.value === "number" && M.tecnico.value < G.macro_tecnico_min) fails.push(`Técnico ${M.tecnico.value} < ${G.macro_tecnico_min}`);
  if (typeof M.visual.value === "number" && M.visual.value < G.macro_visual_min) fails.push(`Visual ${M.visual.value} < ${G.macro_visual_min}`);
  if (typeof M.experiencia_humana.value === "number" && M.experiencia_humana.value < G.macro_experiencia_humana_min) fails.push(`Experiência Humana ${M.experiencia_humana.value} < ${G.macro_experiencia_humana_min}`);

  // pendências de portão (medições/inputs que ainda faltam para bater o martelo)
  const gatePending = [];
  if (a.visual.maos === null || a.visual.rosto === null) gatePending.push("portão visual (mãos/rosto) aguarda nota humana");
  if (typeof fpsMobile !== "number") gatePending.push("portão FPS mobile aguarda medição no harness");
  if (M.visual.value === null) gatePending.push("portão Visual (≥8.5) aguarda nota humana");
  if (M.experiencia_humana.value === null) gatePending.push("portão Experiência Humana (≥8.5) aguarda avaliação humana");

  return { passed: fails.length === 0, fails, gatePending };
}

function finalScore(scored) {
  const w = RUBRIC.macroWeights;
  const M = scored.macros;
  let sum = 0, wsum = 0;
  const missing = [];
  for (const key of ["tecnico", "visual", "experiencia_humana"]) {
    const v = M[key].value;
    if (typeof v === "number") { sum += v * w[key]; wsum += w[key]; }
    else missing.push(key);
  }
  // nota provisória usa só os macro-eixos disponíveis (renormalizada), e avisa o que falta
  const provisional = wsum > 0 ? +(sum / wsum).toFixed(2) : null;
  return { provisional, complete: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// utils
// ---------------------------------------------------------------------------
function avg(arr) { return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0; }
function clamp10(x) { return Math.max(0, Math.min(10, x)); }

// ---------------------------------------------------------------------------
// 8) Análise de 1 arquivo
// ---------------------------------------------------------------------------
function analyzeFile(filePath) {
  const buf = readFileSync(filePath);
  const parsed = parseGLB(buf);
  const metrics = computeMetrics(parsed, filePath);
  const sidecar = loadSidecar(filePath);
  const scored = scoreAxes(metrics, sidecar);
  const gates = evaluateGates(metrics, scored, sidecar);
  const final = finalScore(scored);
  return { metrics, sidecar, scored, gates, final };
}

// ---------------------------------------------------------------------------
// 9) Relatório Markdown (1 arquivo) + comparação
// ---------------------------------------------------------------------------
function fmt(n, unit = "") { return n === null || n === undefined ? "—" : `${n}${unit}`; }

function fileReportMd(r) {
  const m = r.metrics, a = r.scored.axes;
  const targets = RUBRIC.budgets;
  const ck = (ok) => (ok ? "✅" : "❌");
  const lines = [];
  lines.push(`### ${m.file}`);
  lines.push("");
  lines.push(`- **Gerador:** ${m.generator}  ·  **glTF:** ${m.gltfVersion}  ·  **GLB v:** ${m.glbVersion}`);
  lines.push("");
  lines.push("**Métricas objetivas (lidas dos bytes):**");
  lines.push("");
  lines.push("| Métrica | Valor | Alvo (SPEC/E0) | Passa? |");
  lines.push("|---|---|---|:--:|");
  lines.push(`| Peso GLB | ${m.fileSizeMB} MB | ≤${targets.fileSizeMB.ideal} ideal / ≤${targets.fileSizeMB.ceiling} teto | ${ck(m.fileSizeMB <= targets.fileSizeMB.ceiling)} |`);
  lines.push(`| Triângulos | ${m.triangles.toLocaleString("pt-BR")} | ≤${targets.triangles.ideal} ideal / ≤${targets.triangles.ceiling} teto | ${ck(m.triangles <= targets.triangles.ceiling)} |`);
  lines.push(`| Vértices | ${m.vertices.toLocaleString("pt-BR")} | — | — |`);
  lines.push(`| Rig (bones) | ${m.hasRig ? m.boneCount : "sem rig"} | ≤${targets.bones.ceiling} | ${ck(m.hasRig && m.boneCount <= targets.bones.ceiling)} |`);
  lines.push(`| Meshes / primitives | ${m.meshCount} / ${m.primitiveCount} | poucos draw calls | — |`);
  lines.push(`| Materiais (PBR/normal) | ${m.materialCount} (${m.withPBR}/${m.withNormal}) | PBR + normal | ${ck(m.withPBR > 0)} |`);
  lines.push(`| Textura máx | ${m.maxTexturePx || "—"} px | ≤${targets.textureMaxPx.ideal} ideal / ≤${targets.textureMaxPx.ceiling} teto | ${ck(m.maxTexturePx > 0 && m.maxTexturePx <= targets.textureMaxPx.ceiling)} |`);
  lines.push(`| Animações | ${m.animationCount} | (avatar base pode ter 0) | — |`);
  lines.push(`| Compressão | ${[m.hasDraco && "Draco", m.hasMeshopt && "Meshopt", m.hasKTX2 && "KTX2"].filter(Boolean).join(", ") || "nenhuma"} | Draco/Meshopt + KTX2 | ${ck(m.hasDraco || m.hasMeshopt)} |`);
  lines.push(`| Extensões não suportadas | ${m.unsupportedExtensionsUsed.join(", ") || "nenhuma"} | nenhuma | ${ck(m.unsupportedExtensionsUsed.length === 0)} |`);
  lines.push("");
  if (m.animations.length) {
    lines.push("**Animações:** " + m.animations.map((x) => `${x.name} (${x.durationSec}s, ${x.channels} canais)`).join(" · "));
    lines.push("");
  }
  const M = r.scored.macros, w = RUBRIC.macroWeights, G = RUBRIC.gates;
  lines.push("**DECISÃO EM 3 EIXOS:**");
  lines.push("");
  lines.push("| Eixo | Peso | Nota | Mín. (gate) | Origem |");
  lines.push("|---|:--:|:--:|:--:|---|");
  lines.push(`| 🔧 Técnico | ${Math.round(w.tecnico * 100)}% | ${fmt(M.tecnico.value)} | ${G.macro_tecnico_min} | ${M.tecnico.source} |`);
  lines.push(`| 👁️ Visual | ${Math.round(w.visual * 100)}% | ${fmt(M.visual.value)}${M.visual.value === null ? ` (proxy ${M.visual.proxy})` : ""} | ${G.macro_visual_min} | ${M.visual.source} |`);
  lines.push(`| 🤝 Experiência Humana | ${Math.round(w.experiencia_humana * 100)}% | ${fmt(M.experiencia_humana.value)} | ${G.macro_experiencia_humana_min} | ${M.experiencia_humana.source} |`);
  lines.push("");
  const ehc = M.experiencia_humana.criteria || {};
  const ehKeys = Object.keys(ehc);
  if (ehKeys.length) {
    lines.push("<details><summary>Experiência Humana — 8 critérios (0–10)</summary>");
    lines.push("");
    lines.push("| Critério | Nota |");
    lines.push("|---|:--:|");
    for (const k of ehKeys) lines.push(`| ${k.replace(/_/g, " ")} | ${fmt(ehc[k])} |`);
    lines.push("</details>");
    lines.push("");
  }
  lines.push("<details><summary>Sub-eixos objetivos (detalhe do Técnico + comercial)</summary>");
  lines.push("");
  lines.push("| Sub-eixo | Nota | Origem |");
  lines.push("|---|:--:|---|");
  lines.push(`| Técnica | ${fmt(a.tecnica.value)} | ${a.tecnica.source} |`);
  lines.push(`| Performance | ${fmt(a.performance.value)} | ${a.performance.source} |`);
  lines.push(`| Compatibilidade | ${fmt(a.compatibilidade.value)} | ${a.compatibilidade.source} |`);
  lines.push(`| Manutenção | ${fmt(a.manutencao.value)} | ${a.manutencao.source} |`);
  lines.push(`| Comercial (licença · gate à parte) | ${fmt(a.comercial.value)} | ${a.comercial.source} |`);
  lines.push("</details>");
  lines.push("");
  lines.push(`**Nota final ${r.final.complete ? "" : "(provisória — faltam eixos)"}:** ${fmt(r.final.provisional)} / 10  _(50% téc · 30% visual · 20% exp. humana)_`);
  if (!r.final.complete) lines.push(`> Faltam para nota completa: **${r.final.missing.join(", ")}**.`);
  lines.push("");
  lines.push(`**Portões eliminatórios:** ${r.gates.passed ? "✅ passou (até onde dá para medir)" : "❌ REPROVADO"}`);
  if (r.gates.fails.length) lines.push(`- Falhas: ${r.gates.fails.join("; ")}`);
  if (r.gates.gatePending.length) lines.push(`- Ainda pendentes: ${r.gates.gatePending.join("; ")}`);
  lines.push("");
  if (m.hasRig) {
    lines.push(`<details><summary>Bones (${m.boneCount}) — conferir conformidade com o skeleton único</summary>`);
    lines.push("");
    lines.push("```");
    lines.push(m.jointNames.join("\n"));
    lines.push("```");
    lines.push("</details>");
    lines.push("");
  }
  lines.push("**Pendências (o que os bytes NÃO dizem):**");
  for (const p of r.scored.pending) lines.push(`- ${p}`);
  lines.push("");
  if (r.sidecar?._error) lines.push(`> ⚠️ sidecar: ${r.sidecar._error}`);
  return lines.join("\n");
}

function comparisonMd(results) {
  const ranked = [...results].sort((a, b) => (b.final.provisional ?? -1) - (a.final.provisional ?? -1));
  const lines = [];
  lines.push("## Comparação automática");
  lines.push("");
  lines.push("| # | Arquivo | Final | 🔧 Téc (50%) | 👁️ Vis (30%) | 🤝 ExpH (20%) | Peso | Tris | Bones | 3 eixos ≥8.5? |");
  lines.push("|--:|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|");
  ranked.forEach((r, i) => {
    const M = r.scored.macros, m = r.metrics;
    const visCell = M.visual.value === null ? `${M.visual.proxy}*` : `${M.visual.value}`;
    lines.push(`| ${i + 1} | ${m.file} | **${fmt(r.final.provisional)}** | ${fmt(M.tecnico.value)} | ${visCell} | ${fmt(M.experiencia_humana.value)} | ${m.fileSizeMB}MB | ${m.triangles} | ${m.hasRig ? m.boneCount : "—"} | ${r.gates.passed ? "✅" : "❌"} |`);
  });
  lines.push("");
  lines.push("> `*` = proxy estático (nota visual humana pendente). `—` em ExpH = aguarda avaliação humana. Final provisória renormaliza só os eixos disponíveis. Coluna final exige os 3 macro-eixos ≥ 8.5 **e** os portões físicos.");
  lines.push("");
  if (ranked.length >= 2 && ranked[0].final.provisional !== null) {
    const win = ranked[0], second = ranked[1];
    const wM = win.scored.macros, sM = second.scored.macros;
    lines.push(`### Por que **${win.metrics.file}** lidera (provisório)`);
    const reasons = [];
    if ((win.final.provisional ?? 0) > (second.final.provisional ?? 0)) reasons.push(`nota final ${win.final.provisional} vs ${second.final.provisional}`);
    if ((wM.tecnico.value ?? 0) > (sM.tecnico.value ?? 0)) reasons.push(`melhor Técnico (${wM.tecnico.value} vs ${sM.tecnico.value})`);
    if (typeof wM.visual.value === "number" && typeof sM.visual.value === "number" && wM.visual.value > sM.visual.value) reasons.push(`melhor Visual (${wM.visual.value} vs ${sM.visual.value})`);
    if (typeof wM.experiencia_humana.value === "number" && typeof sM.experiencia_humana.value === "number" && wM.experiencia_humana.value > sM.experiencia_humana.value) reasons.push(`melhor Experiência Humana (${wM.experiencia_humana.value} vs ${sM.experiencia_humana.value})`);
    if (win.metrics.fileSizeMB < second.metrics.fileSizeMB) reasons.push(`mais leve (${win.metrics.fileSizeMB}MB vs ${second.metrics.fileSizeMB}MB)`);
    if (win.metrics.hasRig && !second.metrics.hasRig) reasons.push("tem rig (o outro não)");
    lines.push("- " + (reasons.join("\n- ") || "diferença concentrada nos eixos pendentes — decidir após Visual + Experiência Humana + FPS."));
    lines.push("");
    lines.push("> ⚠️ Liderança **provisória**: definitiva só com Visual (olhos) + Experiência Humana + FPS (harness). O laboratório não escolhe o **mais bonito**, escolhe o **melhor treinador virtual**.");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 10) CLI
// ---------------------------------------------------------------------------
function collectGlbs(target) {
  const stat = existsSync(target) ? statSync(target) : null;
  if (!stat) return [];
  if (stat.isDirectory()) {
    return readdirSync(target)
      .filter((f) => extname(f).toLowerCase() === ".glb")
      .map((f) => join(target, f));
  }
  return extname(target).toLowerCase() === ".glb" ? [target] : [];
}

function main() {
  const args = process.argv.slice(2);
  let wantJson = false;
  let outDir = resolve(__dirname, "..", "results", "_auto");
  const targets = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") wantJson = true;
    else if (a === "--out") { outDir = resolve(process.cwd(), args[++i] || outDir); }
    else if (a.startsWith("--")) { /* flag desconhecida, ignora */ }
    else targets.push(a);
  }
  const defaultDrop = resolve(__dirname, "..", "drop");
  const inputs = targets.length ? targets : [defaultDrop];

  const files = [...new Set(inputs.flatMap((t) => collectGlbs(resolve(process.cwd(), t))))];

  if (!files.length) {
    console.log("Nenhum .glb encontrado.");
    console.log("Coloque os GLBs em labs/avatar-lab/drop/ (com um <nome>.meta.json ao lado) e rode de novo:");
    console.log("  node analyze-glb.mjs");
    return;
  }

  const results = [];
  for (const f of files) {
    try {
      results.push(analyzeFile(f));
      console.log(`✓ analisado: ${basename(f)}`);
    } catch (e) {
      console.error(`✗ falhou: ${basename(f)} — ${e.message}`);
    }
  }
  if (!results.length) return;

  // monta relatório
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const md = [
    `# Avatar Lab — Relatório automático de GLB`,
    ``,
    `_Gerado por \`analyze-glb.mjs\` em ${now}. Dados objetivos lidos direto dos bytes do GLB; eixos visuais/FPS/licença marcados como pendentes quando exigem humano/harness/externo._`,
    ``,
    results.length > 1 ? comparisonMd(results) : "",
    ``,
    `## Fichas por arquivo`,
    ``,
    ...results.map(fileReportMd),
  ].join("\n");

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const stamp = now.replace(/[: ]/g, "-");
  const mdPath = join(outDir, `report-${stamp}.md`);
  const jsonPath = join(outDir, `report-${stamp}.json`);
  writeFileSync(mdPath, md, "utf8");
  writeFileSync(jsonPath, JSON.stringify(results, null, 2), "utf8");

  console.log(`\nRelatório:  ${mdPath}`);
  console.log(`JSON:       ${jsonPath}`);
  if (wantJson) console.log("\n" + JSON.stringify(results, null, 2));
}

main();
