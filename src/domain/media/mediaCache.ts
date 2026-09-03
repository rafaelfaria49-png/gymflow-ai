import { MediaAsset, MediaCacheStats, MediaManifest, ProgramMediaDownloadResult } from './types';
import type { WorkoutProgram } from '../../types';
import { getMediaStorageDriver, WEB_MEDIA_CACHE_NAME, isCacheStorageAvailable } from './storage';

export const MEDIA_CACHE_NAME = WEB_MEDIA_CACHE_NAME;

export { isCacheStorageAvailable };

/**
 * Verifica se um recurso de mídia está disponível em cache (web ou nativo)
 */
export async function isMediaCached(urlOrAsset: string | MediaAsset, manifest?: MediaManifest): Promise<boolean> {
  const driver = getMediaStorageDriver();
  return driver.isCached(urlOrAsset, manifest);
}

/**
 * Salva um MediaAsset no armazenamento offline da plataforma ativa
 */
export async function cacheMediaAsset(asset: MediaAsset, manifest?: MediaManifest): Promise<boolean> {
  const driver = getMediaStorageDriver();
  return driver.cacheAsset(asset, manifest);
}

/**
 * Obtém URL/URI local para um recurso em cache (ou o URL remoto original se não cacheado)
 */
export async function getMediaPlayableUrl(urlOrAsset: string | MediaAsset, manifest?: MediaManifest): Promise<string> {
  const driver = getMediaStorageDriver();
  return driver.getPlayableUrl(urlOrAsset, manifest);
}

/**
 * Retorna a lista de todas as URLs ou arquivos atualmente salvos no cache de mídia
 */
export async function listCachedMediaUrls(): Promise<string[]> {
  const driver = getMediaStorageDriver();
  return driver.listCached();
}

/**
 * Retorna estatísticas de uso do cache de mídia
 */
export async function getMediaCacheStats(): Promise<MediaCacheStats> {
  const driver = getMediaStorageDriver();
  return driver.getStats();
}

/**
 * Limpa todo o cache de mídia
 */
export async function clearMediaCache(): Promise<boolean> {
  const driver = getMediaStorageDriver();
  return driver.clear();
}

/**
 * Baixa toda a mídia dos exercícios que pertencem a um programa de treino do usuário.
 * "Baixar mídia para offline" por programa (D14).
 * Suporta Web/PWA (Cache Storage) e Android/iOS Capacitor (Filesystem + FileTransfer).
 */
export async function downloadProgramMedia(
  program: WorkoutProgram,
  manifest: MediaManifest,
  onProgress?: (progress: { completed: number; total: number; currentExerciseId?: string }) => void
): Promise<ProgramMediaDownloadResult> {
  const driver = getMediaStorageDriver();

  // Invalida mídias obsoletas de versões anteriores antes de iniciar novos downloads
  try {
    await driver.pruneObsolete(manifest);
  } catch {
    // Prune é melhor-esforço; não impede o download
  }

  // 1. Coleta todos os IDs únicos de exercícios no programa
  const exerciseIds = new Set<string>();

  if (program.weeks) {
    for (const week of program.weeks) {
      for (const day of week.days) {
        if (day.slots) {
          for (const slot of day.slots) {
            if (slot.exerciseId) exerciseIds.add(slot.exerciseId);
          }
        }
      }
    }
  }

  // Se o programa tem a lista flat legada de exercícios
  if (program.exercises) {
    for (const ex of program.exercises) {
      if (typeof ex === 'string') exerciseIds.add(ex);
      else if (ex && typeof ex === 'object' && 'id' in ex) exerciseIds.add((ex as { id: string }).id);
    }
  }

  const assetsToDownload: MediaAsset[] = [];

  for (const exId of exerciseIds) {
    const media = manifest.assets[exId];
    if (media?.video && media.video.status === 'approved') {
      assetsToDownload.push(media.video);
    }
  }

  const total = assetsToDownload.length;
  let downloaded = 0;
  let failed = 0;
  let totalBytes = 0;

  if (total === 0) {
    return { success: true, downloaded: 0, failed: 0, totalBytes: 0 };
  }

  for (let i = 0; i < total; i++) {
    const asset = assetsToDownload[i];
    onProgress?.({
      completed: downloaded + failed,
      total,
      currentExerciseId: asset.id,
    });

    const isAlreadyCached = await driver.isCached(asset, manifest);
    if (isAlreadyCached) {
      downloaded++;
      totalBytes += asset.bytes;
      continue;
    }

    const ok = await driver.cacheAsset(asset, manifest);
    if (ok) {
      downloaded++;
      totalBytes += asset.bytes;
    } else {
      failed++;
    }
  }

  onProgress?.({ completed: total, total });

  return {
    success: failed === 0,
    downloaded,
    failed,
    totalBytes,
  };
}
