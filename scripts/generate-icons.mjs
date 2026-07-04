#!/usr/bin/env node
/**
 * GOAL-10 — Gerador dos ícones do PWA.
 *
 * Desenha um monograma "G" (vetor próprio, sem fonte/arquivo externo) e
 * rasteriza via `sharp` para os PNGs usados pelo manifest e pelo Apple
 * Web App:
 *
 *   public/icons/icon-192.png        (purpose "any")
 *   public/icons/icon-512.png        (purpose "any")
 *   public/icons/maskable-192.png    (purpose "maskable", full-bleed)
 *   public/icons/maskable-512.png    (purpose "maskable", full-bleed)
 *   public/icons/apple-touch-icon.png (180x180, sem transparência)
 *
 * Uso: node scripts/generate-icons.mjs
 * Reexecutável: apenas sobrescreve os PNGs gerados.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OUT_DIR = path.join(process.cwd(), 'public', 'icons');

const BG = '#09090b'; // gym-dark
const ACCENT = '#a3e635'; // gym-accent (Cyber Lime)

// Monograma G: anel (aberto à direita) + barra + "pé" descendente, centrado
// em (50,50) num viewBox 0-100. `scale` encolhe o traço para caber dentro da
// safe zone (círculo central de 80%) exigida pelos ícones "maskable".
function monogramG(scale) {
  return `
    <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">
      <circle cx="50" cy="50" r="30" fill="none" stroke="${ACCENT}" stroke-width="16" />
      <rect x="62" y="41" width="30" height="18" fill="${BG}" />
      <rect x="50" y="42" width="38" height="16" fill="${ACCENT}" />
      <rect x="72" y="42" width="16" height="34" fill="${ACCENT}" />
    </g>
  `;
}

function buildIconSvg(size, maskable) {
  const background = maskable
    ? `<rect width="100" height="100" fill="${BG}" />`
    : `<rect width="100" height="100" rx="22" fill="${BG}" />`;
  // maskable precisa do desenho contido na safe zone central (raio 40);
  // o traço "cheio" chega a raio ~46, por isso o scale 0.8 nesse modo.
  const glyph = monogramG(maskable ? 0.8 : 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${background}${glyph}</svg>`;
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'maskable-192.png', size: 192, maskable: true },
  { file: 'maskable-512.png', size: 512, maskable: true },
  // Apple aplica sua própria máscara/arredondamento: usa o desenho "maskable"
  // (full-bleed, sem cantos arredondados nossos, sem transparência).
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const target of TARGETS) {
    const svg = buildIconSvg(target.size, target.maskable);
    const outPath = path.join(OUT_DIR, target.file);
    let pipeline = sharp(Buffer.from(svg));
    // maskable/apple-touch-icon precisam ser opacos e full-bleed (a própria
    // plataforma aplica a máscara); os ícones "any" mantêm transparência real
    // fora do retângulo arredondado, como o public/icon.svg existente.
    if (target.maskable) {
      pipeline = pipeline.flatten({ background: BG });
    }
    await pipeline.png().toFile(outPath);
    console.log(`gerado ${path.relative(process.cwd(), outPath)}`);
  }
}

main().catch((err) => {
  console.error('Falha ao gerar ícones:', err);
  process.exit(1);
});
