import { MediaAsset, MediaCacheStats, MediaManifest, ProgramMediaDownloadResult } from './types';
import type { WorkoutProgram } from '../../types';

export const MEDIA_CACHE_NAME = 'gymflow-media-v1';

/**
 * Verifica se a Cache Storage API está disponível no ambiente atual
 */
export function isCacheStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof caches !== 'undefined';
}

/**
 * Abre o cache isolado de mídia
 */
async function openMediaCache(): Promise<Cache | null> {
  if (!isCacheStorageAvailable()) return null;
  try {
    return await caches.open(MEDIA_CACHE_NAME);
  } catch (err) {
    console.warn('Erro ao abrir Cache Storage para mídia:', err);
    return null;
  }
}

/**
 * Verifica se uma URL de mídia está em cache
 */
export async function isMediaCached(url: string): Promise<boolean> {
  const cache = await openMediaCache();
  if (!cache) return false;
  try {
    const match = await cache.match(url);
    return match !== undefined;
  } catch {
    return false;
  }
}

/**
 * Salva um MediaAsset no Cache Storage
 */
export async function cacheMediaAsset(asset: MediaAsset): Promise<boolean> {
  if (!asset.url || asset.url.startsWith('bundle:')) return false;
  const cache = await openMediaCache();
  if (!cache) return false;

  try {
    // Busca o arquivo via fetch
    const response = await fetch(asset.url, { mode: 'cors' });
    if (!response.ok) {
      console.warn(`Falha ao baixar asset para cache: ${asset.url} (${response.status})`);
      return false;
    }

    await cache.put(asset.url, response);
    return true;
  } catch (err) {
    console.warn(`Erro ao salvar asset no cache: ${asset.url}`, err);
    return false;
  }
}

/**
 * Obtém URL local para um recurso em cache (ou o URL remoto original se não cacheado)
 */
export async function getMediaPlayableUrl(url: string): Promise<string> {
  const cache = await openMediaCache();
  if (!cache) return url;

  try {
    const response = await cache.match(url);
    if (response) {
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    }
  } catch {
    // Retorna URL original
  }
  return url;
}

/**
 * Retorna a lista de todas as URLs atualmente salvas no cache de mídia
 */
export async function listCachedMediaUrls(): Promise<string[]> {
  const cache = await openMediaCache();
  if (!cache) return [];

  try {
    const requests = await cache.keys();
    return requests.map((req) => req.url);
  } catch {
    return [];
  }
}

/**
 * Retorna estatísticas de uso do cache de mídia
 */
export async function getMediaCacheStats(): Promise<MediaCacheStats> {
  const cache = await openMediaCache();
  if (!cache) {
    return { count: 0, totalBytes: 0, cacheName: MEDIA_CACHE_NAME };
  }

  try {
    const requests = await cache.keys();
    let totalBytes = 0;

    for (const req of requests) {
      const resp = await cache.match(req);
      if (resp) {
        const contentLength = resp.headers.get('content-length');
        if (contentLength) {
          totalBytes += parseInt(contentLength, 10) || 0;
        } else {
          // Se não houver header content-length, estima pelo blob
          try {
            const blob = await resp.clone().blob();
            totalBytes += blob.size;
          } catch {
            totalBytes += 1500000; // estimativa padrão ~1.5MB por vídeo
          }
        }
      }
    }

    return {
      count: requests.length,
      totalBytes,
      cacheName: MEDIA_CACHE_NAME,
    };
  } catch {
    return { count: 0, totalBytes: 0, cacheName: MEDIA_CACHE_NAME };
  }
}

/**
 * Limpa todo o cache de mídia
 */
export async function clearMediaCache(): Promise<boolean> {
  if (!isCacheStorageAvailable()) return false;
  try {
    return await caches.delete(MEDIA_CACHE_NAME);
  } catch (err) {
    console.warn('Erro ao limpar cache de mídia:', err);
    return false;
  }
}

/**
 * Baixa toda a mídia dos exercícios que pertencem a um programa de treino do usuário.
 * "Baixar mídia para offline" por programa (D14).
 */
export async function downloadProgramMedia(
  program: WorkoutProgram,
  manifest: MediaManifest,
  onProgress?: (progress: { completed: number; total: number; currentExerciseId?: string }) => void
): Promise<ProgramMediaDownloadResult> {
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

    const isAlreadyCached = await isMediaCached(asset.url);
    if (isAlreadyCached) {
      downloaded++;
      totalBytes += asset.bytes;
      continue;
    }

    const ok = await cacheMediaAsset(asset);
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
