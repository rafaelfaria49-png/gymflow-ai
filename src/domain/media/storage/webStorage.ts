import type { MediaAsset, MediaCacheStats, MediaManifest } from '../types';
import type { MediaStorageDriver } from './types';

export const WEB_MEDIA_CACHE_NAME = 'gymflow-media-v1';

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
    return await caches.open(WEB_MEDIA_CACHE_NAME);
  } catch (err) {
    console.warn('Erro ao abrir Cache Storage para mídia:', err);
    return null;
  }
}

function resolveAssetUrl(assetOrUrl: MediaAsset | string): string {
  return typeof assetOrUrl === 'string' ? assetOrUrl : assetOrUrl.url;
}

export class WebMediaStorageDriver implements MediaStorageDriver {
  readonly driverName = 'web-cache-storage' as const;

  async isCached(assetOrUrl: MediaAsset | string): Promise<boolean> {
    const url = resolveAssetUrl(assetOrUrl);
    if (!url) return false;
    const cache = await openMediaCache();
    if (!cache) return false;
    try {
      const match = await cache.match(url);
      return match !== undefined;
    } catch {
      return false;
    }
  }

  async cacheAsset(asset: MediaAsset): Promise<boolean> {
    if (!asset.url || asset.url.startsWith('bundle:')) return false;
    // QA Gate / Governança: apenas vídeos 'approved' podem ser armazenados
    if (asset.status !== 'approved') return false;

    const cache = await openMediaCache();
    if (!cache) return false;

    try {
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

  async getPlayableUrl(assetOrUrl: MediaAsset | string): Promise<string> {
    const url = resolveAssetUrl(assetOrUrl);
    if (!url) return '';
    const cache = await openMediaCache();
    if (!cache) return url;

    try {
      const response = await cache.match(url);
      if (response) {
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      }
    } catch {
      // Retorna URL original em caso de falha
    }
    return url;
  }

  async listCached(): Promise<string[]> {
    const cache = await openMediaCache();
    if (!cache) return [];

    try {
      const requests = await cache.keys();
      return requests.map((req) => req.url);
    } catch {
      return [];
    }
  }

  async getStats(): Promise<MediaCacheStats> {
    const cache = await openMediaCache();
    if (!cache) {
      return { count: 0, totalBytes: 0, cacheName: WEB_MEDIA_CACHE_NAME };
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
            try {
              const blob = await resp.clone().blob();
              totalBytes += blob.size;
            } catch {
              totalBytes += 1500000; // estimativa padrão ~1.5MB
            }
          }
        }
      }

      return {
        count: requests.length,
        totalBytes,
        cacheName: WEB_MEDIA_CACHE_NAME,
      };
    } catch {
      return { count: 0, totalBytes: 0, cacheName: WEB_MEDIA_CACHE_NAME };
    }
  }

  async clear(): Promise<boolean> {
    if (!isCacheStorageAvailable()) return false;
    try {
      return await caches.delete(WEB_MEDIA_CACHE_NAME);
    } catch (err) {
      console.warn('Erro ao limpar cache de mídia:', err);
      return false;
    }
  }

  async pruneObsolete(manifest?: MediaManifest): Promise<number> {
    if (!manifest || !isCacheStorageAvailable()) return 0;
    const cache = await openMediaCache();
    if (!cache) return 0;

    try {
      const validUrls = new Set<string>();
      for (const media of Object.values(manifest.assets)) {
        if (media.video && media.video.status === 'approved') {
          validUrls.add(media.video.url);
        }
      }

      const requests = await cache.keys();
      let prunedCount = 0;

      for (const req of requests) {
        if (!validUrls.has(req.url)) {
          const deleted = await cache.delete(req.url);
          if (deleted) prunedCount++;
        }
      }

      return prunedCount;
    } catch (err) {
      console.warn('Erro em pruneObsolete do Cache Storage:', err);
      return 0;
    }
  }
}

export const webMediaStorage = new WebMediaStorageDriver();
