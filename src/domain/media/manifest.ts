import { ExerciseMedia, MediaAsset, MediaManifest } from './types';
import defaultManifestJson from './manifest.json';

/**
 * Manifest padrão embutido como baseline segura
 */
const DEFAULT_MANIFEST: MediaManifest = defaultManifestJson as MediaManifest;

let activeManifest: MediaManifest = DEFAULT_MANIFEST;

/**
 * Retorna o manifest ativo em memória
 */
export function getActiveManifest(): MediaManifest {
  return activeManifest;
}

/**
 * Define ou atualiza o manifest ativo
 */
export function setActiveManifest(manifest: MediaManifest): void {
  const validation = validateMediaManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Manifest inválido: ${validation.errors.join(', ')}`);
  }
  activeManifest = manifest;
}

/**
 * Reseta o manifest para o default embutido
 */
export function resetToDefaultManifest(): void {
  activeManifest = DEFAULT_MANIFEST;
}

/**
 * Validação profunda do manifest contra as regras do GOAL-34 e LIBRARY §2–4
 */
export function validateMediaManifest(manifest: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest deve ser um objeto válido'] };
  }

  const m = manifest as Partial<MediaManifest>;

  if (typeof m.version !== 'number' || m.version < 1) {
    errors.push('Manifest deve possuir version numérica >= 1');
  }

  if (typeof m.schemaVersion !== 'string' || !m.schemaVersion.trim()) {
    errors.push('Manifest deve possuir schemaVersion válida');
  }

  if (typeof m.cdnBaseUrl !== 'string' || !m.cdnBaseUrl.startsWith('http')) {
    errors.push('Manifest deve possuir cdnBaseUrl válida com protocolo http/https');
  }

  if (!m.assets || typeof m.assets !== 'object') {
    errors.push('Manifest deve possuir mapa de assets');
    return { valid: false, errors };
  }

  let approvedVideoCount = 0;

  for (const [exerciseId, media] of Object.entries(m.assets)) {
    if (!media || typeof media !== 'object') {
      errors.push(`Exercício ${exerciseId}: mídia malformada`);
      continue;
    }

    if (!media.exerciseId || media.exerciseId !== exerciseId) {
      errors.push(`Exercício ${exerciseId}: exerciseId diverge da chave do mapa`);
    }

    if (!media.thumbnail || typeof media.thumbnail !== 'object') {
      errors.push(`Exercício ${exerciseId}: thumbnail obrigatória ausente`);
    } else {
      validateAsset(media.thumbnail, `${exerciseId}.thumbnail`, errors);
    }

    if (media.video) {
      validateAsset(media.video, `${exerciseId}.video`, errors);
      if (media.video.status === 'approved') {
        approvedVideoCount++;
      }
    }

    if (media.frames && Array.isArray(media.frames)) {
      media.frames.forEach((frame, idx) => {
        validateAsset(frame, `${exerciseId}.frames[${idx}]`, errors);
      });
    }
  }

  if (approvedVideoCount < 20) {
    errors.push(`Manifest deve possuir no mínimo 20 vídeos aprovados (encontrados: ${approvedVideoCount})`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateAsset(asset: MediaAsset, path: string, errors: string[]): void {
  if (!asset.id || typeof asset.id !== 'string') {
    errors.push(`${path}: id inválido`);
  }
  if (!asset.url || typeof asset.url !== 'string') {
    errors.push(`${path}: url inválida`);
  }
  if (typeof asset.bytes !== 'number' || asset.bytes <= 0) {
    errors.push(`${path}: bytes deve ser maior que 0`);
  }
  if (typeof asset.width !== 'number' || asset.width <= 0) {
    errors.push(`${path}: width inválida`);
  }
  if (typeof asset.height !== 'number' || asset.height <= 0) {
    errors.push(`${path}: height inválida`);
  }
  if (typeof asset.version !== 'number' || asset.version < 1) {
    errors.push(`${path}: version deve ser >= 1`);
  }
  if (!['draft', 'approved', 'retired'].includes(asset.status)) {
    errors.push(`${path}: status desconhecido '${asset.status}'`);
  }
  // D13: licença comercial obrigatória
  if (!asset.license || typeof asset.license !== 'string' || !asset.license.trim()) {
    errors.push(`${path}: licença comercial (D13) obrigatória ausente`);
  }
}

/**
 * Obtém os dados de mídia de um exercício a partir do manifest ativo
 */
export function getExerciseMedia(exerciseId: string, manifest: MediaManifest = activeManifest): ExerciseMedia | null {
  return manifest.assets[exerciseId] ?? null;
}

/**
 * Busca manifest remoto atualizado (ex.: no CDN ou servidor local).
 * Se o manifest remoto for mais recente (version > ativa), ele é promovido a ativo.
 */
export async function fetchRemoteManifest(manifestUrl = '/media-manifest.json'): Promise<{ updated: boolean; manifest: MediaManifest }> {
  try {
    const res = await fetch(manifestUrl, { cache: 'no-cache' });
    if (!res.ok) {
      return { updated: false, manifest: activeManifest };
    }
    const data = (await res.json()) as MediaManifest;
    const validation = validateMediaManifest(data);
    if (!validation.valid) {
      console.warn('Manifest remoto inválido:', validation.errors);
      return { updated: false, manifest: activeManifest };
    }

    if (data.version > activeManifest.version) {
      activeManifest = data;
      return { updated: true, manifest: data };
    }

    return { updated: false, manifest: activeManifest };
  } catch (err) {
    console.warn('Falha ao buscar manifest remoto:', err);
    return { updated: false, manifest: activeManifest };
  }
}
