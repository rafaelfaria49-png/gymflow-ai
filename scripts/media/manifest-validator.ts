import { MediaManifest } from '../../src/domain/media/types';

export interface ManifestValidationResult {
  valid: boolean;
  totalAssets: number;
  approvedVideosCount: number;
  draftVideosCount: number;
  retiredVideosCount: number;
  errors: string[];
  warnings: string[];
}

/**
 * Validador oficial do manifest de mídia contra LIBRARY §2–5 e D11–D14
 */
export function validateManifestFile(manifest: MediaManifest): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return {
      valid: false,
      totalAssets: 0,
      approvedVideosCount: 0,
      draftVideosCount: 0,
      retiredVideosCount: 0,
      errors: ['Manifest inválido ou nulo'],
      warnings: [],
    };
  }

  if (typeof manifest.version !== 'number' || manifest.version < 1) {
    errors.push('Manifest deve ter version >= 1');
  }

  if (!manifest.schemaVersion) {
    errors.push('Manifest deve ter schemaVersion');
  }

  if (!manifest.cdnBaseUrl || !manifest.cdnBaseUrl.startsWith('http')) {
    errors.push('Manifest deve ter cdnBaseUrl válida (http/https)');
  }

  if (!manifest.assets || typeof manifest.assets !== 'object') {
    errors.push('Manifest deve ter objeto assets');
    return {
      valid: false,
      totalAssets: 0,
      approvedVideosCount: 0,
      draftVideosCount: 0,
      retiredVideosCount: 0,
      errors,
      warnings,
    };
  }

  let approvedVideos = 0;
  let draftVideos = 0;
  let retiredVideos = 0;
  const entries = Object.entries(manifest.assets);

  for (const [key, media] of entries) {
    if (key !== media.exerciseId) {
      errors.push(`Chave '${key}' diverge do exerciseId '${media.exerciseId}'`);
    }

    // Thumbnail
    if (!media.thumbnail) {
      errors.push(`Exercício '${key}' não possui thumbnail`);
    } else {
      if (!media.thumbnail.url) errors.push(`Thumbnail de '${key}' não tem url`);
      if (media.thumbnail.status !== 'approved') {
        warnings.push(`Thumbnail de '${key}' não está approved`);
      }
    }

    // Vídeo
    if (media.video) {
      const v = media.video;
      if (!v.id) errors.push(`Vídeo de '${key}' não tem id`);
      if (!v.url) errors.push(`Vídeo de '${key}' não tem url`);
      if (!v.license || !v.license.trim()) {
        errors.push(`D13 violada: vídeo de '${key}' não possui campo license`);
      }

      // Proporção 9:16 vertical (720x1280 ou similar)
      const ratio = v.width / v.height;
      if (ratio > 0.65) {
        warnings.push(`Vídeo de '${key}' pode não estar em 9:16 vertical (proporção: ${ratio.toFixed(2)})`);
      }

      if (v.status === 'approved') {
        approvedVideos++;
      } else if (v.status === 'draft') {
        draftVideos++;
      } else if (v.status === 'retired') {
        retiredVideos++;
      }
    }
  }

  // LIBRARY §5: Aceite integral com >= 20 vídeos aprovados servidos
  if (approvedVideos < 20) {
    errors.push(`LIBRARY §5 violado: esperado no mínimo 20 vídeos aprovados, encontrados ${approvedVideos}`);
  }

  return {
    valid: errors.length === 0,
    totalAssets: entries.length,
    approvedVideosCount: approvedVideos,
    draftVideosCount: draftVideos,
    retiredVideosCount: retiredVideos,
    errors,
    warnings,
  };
}
