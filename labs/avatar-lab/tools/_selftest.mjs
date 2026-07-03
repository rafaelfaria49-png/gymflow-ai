#!/usr/bin/env node
/**
 * _selftest.mjs — smoke test do analyze-glb.mjs SEM depender de GLB real.
 * Sintetiza GLBs válidos o suficiente para exercitar o parser (triângulos,
 * rig/bones, textura PNG embutida, material PBR, animação, extensão não
 * suportada) e roda a análise. Escreve em ./_selftest_out (gitignorável).
 *
 * Uso: node _selftest.mjs
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "_selftest_out");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// --- monta um GLB a partir de um objeto glTF JSON + buffer BIN ---
function buildGLB(gltf, bin = Buffer.alloc(0)) {
  const jsonStr = JSON.stringify(gltf);
  let jsonBuf = Buffer.from(jsonStr, "utf8");
  while (jsonBuf.length % 4 !== 0) jsonBuf = Buffer.concat([jsonBuf, Buffer.from(" ")]); // pad com espaço
  let binBuf = bin;
  while (binBuf.length % 4 !== 0) binBuf = Buffer.concat([binBuf, Buffer.from([0])]); // pad com 0

  const totalLen = 12 + 8 + jsonBuf.length + (binBuf.length ? 8 + binBuf.length : 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // glTF
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // JSON

  const parts = [header, jsonHeader, jsonBuf];
  if (binBuf.length) {
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binBuf.length, 0);
    binHeader.writeUInt32LE(0x004e4942, 4); // BIN
    parts.push(binHeader, binBuf);
  }
  return Buffer.concat(parts);
}

// --- "PNG" mínimo só com assinatura + IHDR (suficiente para pngSize ler w/h) ---
function fakePNG(w, h) {
  const b = Buffer.alloc(33);
  b.writeUInt32BE(0x89504e47, 0); // \x89PNG
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8); // IHDR length
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

// ===================== CASO 1: avatar "bom" (rig + PBR + textura 2048) =====================
const png = fakePNG(2048, 2048);
const good = {
  asset: { version: "2.0", generator: "SelfTest 1.0 (synthetic)" },
  extensionsUsed: ["KHR_materials_clearcoat"],
  accessors: [
    { count: 90000, type: "SCALAR", componentType: 5125 }, // indices -> 30k tris
    { count: 30000, type: "VEC3", componentType: 5126 },   // POSITION
    { count: 2, type: "SCALAR", componentType: 5126, max: [1.5] }, // anim input (duração 1.5s)
  ],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: png.length }],
  images: [{ bufferView: 0, mimeType: "image/png" }],
  textures: [{ source: 0 }],
  materials: [
    { pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, normalTexture: { index: 0 }, extensions: { KHR_materials_clearcoat: {} } },
  ],
  meshes: [{ primitives: [{ attributes: { POSITION: 1 }, indices: 0, material: 0, mode: 4 }] }],
  nodes: [
    { name: "Hips" }, { name: "Spine" }, { name: "Head" }, { name: "mesh", mesh: 0, skin: 0 },
  ],
  skins: [{ joints: [0, 1, 2] }],
  animations: [{ name: "Idle", channels: [{ sampler: 0, target: { node: 0, path: "rotation" } }], samplers: [{ input: 2, output: 2 }] }],
  buffers: [{ byteLength: png.length }],
};

// ===================== CASO 2: avatar "ruim" (sem rig, tris altíssimos, ext não suportada, obrigatória) =====================
const bad = {
  asset: { version: "2.0", generator: "WeirdTool" },
  extensionsUsed: ["ACME_secret_sauce"],
  extensionsRequired: ["ACME_secret_sauce"],
  accessors: [
    { count: 900000, type: "SCALAR", componentType: 5125 }, // 300k tris
    { count: 300000, type: "VEC3", componentType: 5126 },
  ],
  meshes: [{ primitives: [{ attributes: { POSITION: 1 }, indices: 0, mode: 4 }] }],
  nodes: [{ name: "blob", mesh: 0 }],
  materials: [{}],
  buffers: [{ byteLength: 0 }],
};

const files = [
  { name: "selftest_good.glb", glb: buildGLB(good, png) },
  { name: "selftest_bad.glb", glb: buildGLB(bad) },
];
for (const f of files) writeFileSync(join(OUT, f.name), f.glb);

// sidecar para o "good": licença + nota visual + experiência humana + fps (passa os 3 eixos)
writeFileSync(
  join(OUT, "selftest_good.meta.json"),
  JSON.stringify({
    ferramenta: "SelfTest", plano: "free", licenca: "Private (owned)", custo: "US$0",
    visual: { geral: 9, rosto: 9, maos: 8 },
    experiencia_humana: { empatia: 9, credibilidade: 9, naturalidade_corporal: 9, movimento: 8.5, maos: 8.5, expressao_facial: 9, premium: 9, identificacao: 9 },
    tecnico: { fpsMobile: 45 },
  }, null, 2)
);

console.log("GLBs sintéticos gerados em:", OUT);
console.log("Rodando o analisador...\n");
const out = execFileSync("node", [join(__dirname, "analyze-glb.mjs"), OUT, "--out", OUT], { encoding: "utf8" });
console.log(out);
