import { getActiveManifest, getExerciseMedia } from './manifest';
import { cacheMediaAsset, isCacheStorageAvailable, isMediaCached } from './mediaCache';
import { MediaManifest } from './types';

const preloadedUrls = new Set<string>();

/**
 * Realiza o preload em background da mídia do próximo exercício da sessão de treino.
 * Não bloqueia a interface do usuário e falha silenciosamente se a rede estiver instável.
 */
export async function preloadNextExerciseMedia(
  nextExerciseId: string | null | undefined,
  manifest: MediaManifest = getActiveManifest()
): Promise<void> {
  if (!nextExerciseId) return;

  const media = getExerciseMedia(nextExerciseId, manifest);
  if (!media) return;

  // 1. Se houver vídeo técnico aprovado, faz o preload para cache local
  if (media.video && media.video.status === 'approved') {
    const videoUrl = media.video.url;
    if (!preloadedUrls.has(videoUrl)) {
      preloadedUrls.add(videoUrl);

      // Tenta salvar em Cache Storage se disponível
      if (isCacheStorageAvailable()) {
        isMediaCached(videoUrl).then((cached) => {
          if (!cached) {
            cacheMediaAsset(media.video!).catch(() => {
              // Silencioso em preload
            });
          }
        });
      } else if (typeof window !== 'undefined') {
        // Fallback para preload via link rel=preload no browser
        try {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'video';
          link.href = videoUrl;
          document.head.appendChild(link);
        } catch {
          // Silencioso
        }
      }
    }
  }

  // 2. Preload das imagens de frames para exibição imediata
  if (media.frames && typeof window !== 'undefined' && typeof Image !== 'undefined') {
    for (const frame of media.frames) {
      if (frame.status === 'approved' && !preloadedUrls.has(frame.url)) {
        preloadedUrls.add(frame.url);
        const img = new Image();
        img.src = frame.url;
      }
    }
  } else if (media.thumbnail && typeof window !== 'undefined' && typeof Image !== 'undefined') {
    if (!preloadedUrls.has(media.thumbnail.url)) {
      preloadedUrls.add(media.thumbnail.url);
      const img = new Image();
      img.src = media.thumbnail.url;
    }
  }
}

/**
 * Limpa o registro de URLs pré-carregadas (útil para testes)
 */
export function resetPreloadState(): void {
  preloadedUrls.clear();
}
