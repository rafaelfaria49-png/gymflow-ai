import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function findVideoFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== '.next') {
        results.push(...findVideoFiles(fullPath));
      }
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.mp4', '.webm', '.mov', '.mkv', '.avi'].includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function calculateDirectorySize(dir: string): number {
  let totalBytes = 0;
  if (!fs.existsSync(dir)) return 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      totalBytes += calculateDirectorySize(fullPath);
    } else {
      totalBytes += fs.statSync(fullPath).size;
    }
  }
  return totalBytes;
}

describe('Governança de Bundle do APK & Tamanho de Mídia (GOAL-34 & D14)', () => {
  it('NENHUM arquivo binário de vídeo existe no bundle do APK (public/ ou src/)', () => {
    const publicVideos = findVideoFiles(path.resolve(process.cwd(), 'public'));
    const srcVideos = findVideoFiles(path.resolve(process.cwd(), 'src'));

    const allVideos = [...publicVideos, ...srcVideos];
    expect(allVideos, `Vídeos encontrados no bundle: ${allVideos.join(', ')}`).toEqual([]);
  });

  it('o código e manifest adicionados no GOAL-34 aumentam o bundle em estritamente < 5MB', () => {
    const mediaDomainDir = path.resolve(process.cwd(), 'src/domain/media');
    const mediaDomainSize = calculateDirectorySize(mediaDomainDir);

    const publicManifest = path.resolve(process.cwd(), 'public/media-manifest.json');
    const publicManifestSize = fs.existsSync(publicManifest) ? fs.statSync(publicManifest).size : 0;

    const totalGoal34Bytes = mediaDomainSize + publicManifestSize;
    const maxAllowedBytes = 5 * 1024 * 1024; // 5 MB

    // Deve ser muito menor que 5MB (tipicamente < 200KB de código e JSON)
    expect(totalGoal34Bytes).toBeLessThan(maxAllowedBytes);
    expect(totalGoal34Bytes).toBeLessThan(500 * 1024); // < 500 KB garantido!
  });
});
