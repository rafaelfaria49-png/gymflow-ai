#!/usr/bin/env node
/**
 * GOAL-MOBILE-003 — Gerador de assets nativos Android + iOS.
 *
 * Gera os ícones e splash screens definitivos a partir da identidade
 * canônica do GymFlow (fundo #09090b, Cyber Lime #a3e635, Monograma G).
 *
 * Executável via: node scripts/generate-native-assets.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const BG = '#09090b';
const ACCENT = '#a3e635';
const EMERALD = '#10b981';

// Monograma G canônico do GymFlow (viewBox 0-100, centrado em 50,50)
function monogramG(scale = 1) {
  return `
    <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">
      <circle cx="50" cy="50" r="30" fill="none" stroke="${ACCENT}" stroke-width="16" />
      <rect x="62" y="41" width="30" height="18" fill="${BG}" />
      <rect x="50" y="42" width="38" height="16" fill="${ACCENT}" />
      <rect x="72" y="42" width="16" height="34" fill="${ACCENT}" />
    </g>
  `;
}

// Master Icon (1024x1024, sem transparência, margem segura)
function buildMasterIconSvg(size = 1024) {
  const glyph = monogramG(0.72);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="${BG}" />
    ${glyph}
  </svg>`;
}

// Android Foreground (fundo transparente, glifo na safe zone central 66%)
function buildAdaptiveForegroundSvg(size) {
  const glyph = monogramG(0.66);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    ${glyph}
  </svg>`;
}

// Android Legado Quadrado Arredondado
function buildLegacySquareSvg(size) {
  const glyph = monogramG(0.72);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <rect width="100" height="100" rx="22" fill="${BG}" />
    ${glyph}
  </svg>`;
}

// Android Legado Redondo
function buildLegacyRoundSvg(size) {
  const glyph = monogramG(0.72);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="50" fill="${BG}" />
    ${glyph}
  </svg>`;
}

// Splash Screen SVG (fundo escuro #09090b, logo centralizado proporcional)
function buildSplashSvg(width, height) {
  // Proporção do ícone na tela: área segura central
  const minDim = Math.min(width, height);
  const iconPixelSize = Math.round(minDim * 0.28);
  const iconX = Math.round((width - iconPixelSize) / 2);
  const iconY = Math.round((height - iconPixelSize) / 2) - Math.round(iconPixelSize * 0.12);
  const textY = iconY + iconPixelSize + Math.round(minDim * 0.045);
  const fontSize = Math.max(16, Math.round(minDim * 0.042));
  const letterSpacing = Math.max(2, Math.round(fontSize * 0.18));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="${BG}" />
    <defs>
      <linearGradient id="gymGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${ACCENT}" />
        <stop offset="100%" stop-color="${EMERALD}" />
      </linearGradient>
    </defs>
    <g transform="translate(${iconX}, ${iconY})">
      <svg width="${iconPixelSize}" height="${iconPixelSize}" viewBox="0 0 100 100">
        ${monogramG(0.82)}
      </svg>
    </g>
    <text x="${width / 2}" y="${textY}"
      text-anchor="middle"
      fill="url(#gymGrad)"
      font-family="-apple-system, BlinkMacSystemFont, 'Outfit', 'Inter', sans-serif"
      font-size="${fontSize}"
      font-weight="900"
      letter-spacing="${letterSpacing}">GYMFLOW</text>
  </svg>`;
}

async function savePng(svgString, outPath, options = {}) {
  await mkdir(path.dirname(outPath), { recursive: true });
  let pipeline = sharp(Buffer.from(svgString));
  if (options.flatten) {
    pipeline = pipeline.flatten({ background: BG });
  }
  // Garantir remoção do canal alfa se solicitado (iOS AppIcon)
  if (options.removeAlpha) {
    pipeline = pipeline.removeAlpha();
  }
  await pipeline.png().toFile(outPath);
  console.log(`[OK] Gerado: ${path.relative(ROOT, outPath)}`);
}

async function main() {
  console.log('--- Iniciando geração de assets nativos GymFlow (MOBILE-003) ---');

  // 1. Master Icon canônico 1024x1024
  const masterIconPath = path.join(ROOT, 'public', 'icons', 'master-icon-1024.png');
  await savePng(buildMasterIconSvg(1024), masterIconPath, { flatten: true, removeAlpha: true });

  // 2. iOS AppIcon (1024x1024 universal, sem transparência)
  const iosIconPath = path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png');
  await savePng(buildMasterIconSvg(1024), iosIconPath, { flatten: true, removeAlpha: true });

  // 3. Android Mipmaps
  const androidDensities = [
    { name: 'mdpi', legacySize: 48, fgSize: 108 },
    { name: 'hdpi', legacySize: 72, fgSize: 162 },
    { name: 'xhdpi', legacySize: 96, fgSize: 216 },
    { name: 'xxhdpi', legacySize: 144, fgSize: 324 },
    { name: 'xxxhdpi', legacySize: 192, fgSize: 432 },
  ];

  for (const d of androidDensities) {
    const resDir = path.join(ROOT, 'android', 'app', 'src', 'main', 'res', `mipmap-${d.name}`);
    // ic_launcher.png
    await savePng(buildLegacySquareSvg(d.legacySize), path.join(resDir, 'ic_launcher.png'), { flatten: true });
    // ic_launcher_round.png
    await savePng(buildLegacyRoundSvg(d.legacySize), path.join(resDir, 'ic_launcher_round.png'));
    // ic_launcher_foreground.png (transparente)
    await savePng(buildAdaptiveForegroundSvg(d.fgSize), path.join(resDir, 'ic_launcher_foreground.png'));
  }

  // 4. iOS Splash Screens (Universal 2732x2732)
  const iosSplashDir = path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset');
  const iosSplashSvg = buildSplashSvg(2732, 2732);
  await savePng(iosSplashSvg, path.join(iosSplashDir, 'splash-2732x2732.png'), { flatten: true });
  await savePng(iosSplashSvg, path.join(iosSplashDir, 'splash-2732x2732-1.png'), { flatten: true });
  await savePng(iosSplashSvg, path.join(iosSplashDir, 'splash-2732x2732-2.png'), { flatten: true });

  // 5. Android Splash Screens
  const androidSplashVariants = [
    { dir: 'drawable', w: 480, h: 320 },
    { dir: 'drawable-port-mdpi', w: 320, h: 480 },
    { dir: 'drawable-port-hdpi', w: 480, h: 800 },
    { dir: 'drawable-port-xhdpi', w: 720, h: 1280 },
    { dir: 'drawable-port-xxhdpi', w: 960, h: 1600 },
    { dir: 'drawable-port-xxxhdpi', w: 1280, h: 1920 },
    { dir: 'drawable-land-mdpi', w: 480, h: 320 },
    { dir: 'drawable-land-hdpi', w: 800, h: 480 },
    { dir: 'drawable-land-xhdpi', w: 1280, h: 720 },
    { dir: 'drawable-land-xxhdpi', w: 1600, h: 960 },
    { dir: 'drawable-land-xxxhdpi', w: 1920, h: 1280 },
  ];

  for (const v of androidSplashVariants) {
    const splashPath = path.join(ROOT, 'android', 'app', 'src', 'main', 'res', v.dir, 'splash.png');
    const svg = buildSplashSvg(v.w, v.h);
    await savePng(svg, splashPath, { flatten: true });
  }

  console.log('--- Todos os assets nativos foram gerados com sucesso! ---');
}

main().catch((err) => {
  console.error('Erro na geração de assets nativos:', err);
  process.exit(1);
});
