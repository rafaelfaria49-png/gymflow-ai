import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';
import { Capacitor } from '@capacitor/core';
import type { MediaAsset, MediaCacheStats, MediaManifest } from '../types';
import type { MediaStorageDriver } from './types';

export const NATIVE_MEDIA_DIR = 'gymflow-media';

/**
 * Sanitiza identificadores de asset para uso seguro no sistema de arquivos nativo.
 */
export function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Gera o nome determinístico do arquivo de mídia com base no assetId e na versão do asset.
 */
export function getDeterministicMediaFilename(asset: Pick<MediaAsset, 'id' | 'version'>): string {
  const safeId = sanitizeFilenamePart(asset.id);
  const version = typeof asset.version === 'number' && asset.version > 0 ? asset.version : 1;
  return `${safeId}_v${version}.mp4`;
}

/**
 * Tenta encontrar o MediaAsset correspondente a partir de uma URL ou do próprio asset.
 */
export function resolveAssetFromInput(
  assetOrUrl: MediaAsset | string,
  manifest?: MediaManifest
): { asset: MediaAsset | null; url: string; filename: string } {
  if (typeof assetOrUrl === 'object' && assetOrUrl !== null && 'id' in assetOrUrl) {
    return {
      asset: assetOrUrl,
      url: assetOrUrl.url,
      filename: getDeterministicMediaFilename(assetOrUrl),
    };
  }

  const url = String(assetOrUrl);

  // Procura no manifest pelo asset que contém esta URL
  if (manifest?.assets) {
    for (const media of Object.values(manifest.assets)) {
      if (media.video && media.video.url === url) {
        return {
          asset: media.video,
          url,
          filename: getDeterministicMediaFilename(media.video),
        };
      }
    }
  }

  // Fallback determinístico caso o manifest não tenha sido passado
  const urlParts = url.split('/');
  const lastPart = urlParts[urlParts.length - 1] || 'media.mp4';
  const cleanName = sanitizeFilenamePart(lastPart.replace(/\.mp4$/i, ''));
  return {
    asset: null,
    url,
    filename: `${cleanName || 'asset'}_v1.mp4`,
  };
}

export class NativeMediaStorageDriver implements MediaStorageDriver {
  readonly driverName = 'capacitor-filesystem' as const;

  /**
   * Garante a existência do diretório privado isolado `gymflow-media`
   */
  async ensureMediaDirectory(): Promise<void> {
    try {
      await Filesystem.mkdir({
        path: NATIVE_MEDIA_DIR,
        directory: Directory.Data,
        recursive: true,
      });
    } catch {
      // Diretório já existente ou criado concorrentemente
    }
  }

  async isCached(assetOrUrl: MediaAsset | string, manifest?: MediaManifest): Promise<boolean> {
    const { filename } = resolveAssetFromInput(assetOrUrl, manifest);
    const filePath = `${NATIVE_MEDIA_DIR}/${filename}`;

    try {
      const stat = await Filesystem.stat({
        path: filePath,
        directory: Directory.Data,
      });

      // Validação de integridade: arquivo existe e tem tamanho > 0
      return Boolean(stat && stat.size > 0);
    } catch {
      return false;
    }
  }

  async cacheAsset(asset: MediaAsset): Promise<boolean> {
    if (!asset.url || asset.url.startsWith('bundle:')) return false;
    // QA Gate: apenas status 'approved' pode ser persistido
    if (asset.status !== 'approved') return false;

    await this.ensureMediaDirectory();

    const filename = getDeterministicMediaFilename(asset);
    const finalPath = `${NATIVE_MEDIA_DIR}/${filename}`;
    const tempPath = `${NATIVE_MEDIA_DIR}/${filename}.tmp`;

    try {
      // 1. Obtém o URI absoluto do arquivo temporário
      const tempUriResult = await Filesystem.getUri({
        path: tempPath,
        directory: Directory.Data,
      });

      // 2. Realiza o download via FileTransfer para o arquivo temporário
      await FileTransfer.downloadFile({
        url: asset.url,
        path: tempUriResult.uri,
        progress: false,
      });

      // 3. Validação pós-download: arquivo existe e não está vazio
      const stat = await Filesystem.stat({
        path: tempPath,
        directory: Directory.Data,
      });

      if (!stat || stat.size === 0) {
        console.warn(`Download corrompido ou vazio para: ${asset.url}`);
        await this.deleteFileSafe(tempPath);
        return false;
      }

      // 4. Renomeia com segurança o temporário para o nome final
      await Filesystem.rename({
        from: tempPath,
        to: finalPath,
        directory: Directory.Data,
      });

      return true;
    } catch (err) {
      console.warn(`Falha ao baixar asset nativo: ${asset.url}`, err);
      await this.deleteFileSafe(tempPath);
      return false;
    }
  }

  async getPlayableUrl(assetOrUrl: MediaAsset | string, manifest?: MediaManifest): Promise<string> {
    const { url, filename } = resolveAssetFromInput(assetOrUrl, manifest);
    const filePath = `${NATIVE_MEDIA_DIR}/${filename}`;

    try {
      const stat = await Filesystem.stat({
        path: filePath,
        directory: Directory.Data,
      });

      if (stat && stat.size > 0) {
        const uriResult = await Filesystem.getUri({
          path: filePath,
          directory: Directory.Data,
        });

        // Converte a URI file:// para o esquema compatível com o WebView nativo (Android/WKWebView)
        // Nunca retorna Blob URL no ambiente nativo!
        return Capacitor.convertFileSrc(uriResult.uri);
      }
    } catch {
      // Arquivo não existe ou não pôde ser lido: fallback para URL remota
    }

    return url;
  }

  async listCached(): Promise<string[]> {
    try {
      const result = await Filesystem.readdir({
        path: NATIVE_MEDIA_DIR,
        directory: Directory.Data,
      });

      // Filtra arquivos temporários (.tmp) e ocultos
      const validFiles: string[] = [];
      for (const entry of result.files) {
        const name = typeof entry === 'string' ? entry : entry.name;
        if (name && !name.startsWith('.') && !name.endsWith('.tmp')) {
          validFiles.push(name);
        }
      }

      return validFiles;
    } catch {
      return [];
    }
  }

  async getStats(): Promise<MediaCacheStats> {
    try {
      const result = await Filesystem.readdir({
        path: NATIVE_MEDIA_DIR,
        directory: Directory.Data,
      });

      let totalBytes = 0;
      let count = 0;

      for (const entry of result.files) {
        const name = typeof entry === 'string' ? entry : entry.name;
        if (!name || name.startsWith('.') || name.endsWith('.tmp')) continue;

        try {
          const stat = await Filesystem.stat({
            path: `${NATIVE_MEDIA_DIR}/${name}`,
            directory: Directory.Data,
          });
          if (stat && stat.size > 0) {
            totalBytes += stat.size;
            count++;
          }
        } catch {
          // Ignora arquivo individual com erro de leitura de stat
        }
      }

      return {
        count,
        totalBytes,
        cacheName: 'gymflow-media-native',
      };
    } catch {
      return { count: 0, totalBytes: 0, cacheName: 'gymflow-media-native' };
    }
  }

  async clear(): Promise<boolean> {
    try {
      const result = await Filesystem.readdir({
        path: NATIVE_MEDIA_DIR,
        directory: Directory.Data,
      });

      // Remove apenas os arquivos contidos dentro de gymflow-media/
      for (const entry of result.files) {
        const name = typeof entry === 'string' ? entry : entry.name;
        if (name) {
          await this.deleteFileSafe(`${NATIVE_MEDIA_DIR}/${name}`);
        }
      }

      return true;
    } catch (err) {
      console.warn('Erro ao limpar cache nativo de mídia:', err);
      return false;
    }
  }

  async pruneObsolete(manifest?: MediaManifest): Promise<number> {
    let prunedCount = 0;

    try {
      const result = await Filesystem.readdir({
        path: NATIVE_MEDIA_DIR,
        directory: Directory.Data,
      });

      // 1. Limpa downloads incompletos (.tmp)
      for (const entry of result.files) {
        const name = typeof entry === 'string' ? entry : entry.name;
        if (name && name.endsWith('.tmp')) {
          await this.deleteFileSafe(`${NATIVE_MEDIA_DIR}/${name}`);
          prunedCount++;
        }
      }

      // 2. Se houver manifest, remove versões antigas de assets
      if (manifest?.assets) {
        const activeFilenames = new Set<string>();
        for (const media of Object.values(manifest.assets)) {
          if (media.video && media.video.status === 'approved') {
            activeFilenames.add(getDeterministicMediaFilename(media.video));
          }
        }

        for (const entry of result.files) {
          const name = typeof entry === 'string' ? entry : entry.name;
          if (!name || name.startsWith('.') || name.endsWith('.tmp')) continue;

          // Se o arquivo pertence a um asset do GymFlow mas não é a versão ativa do manifest
          const isOlderVersion = this.isSupersededGymFlowAsset(name, activeFilenames);
          if (isOlderVersion) {
            await this.deleteFileSafe(`${NATIVE_MEDIA_DIR}/${name}`);
            prunedCount++;
          }
        }
      }

      return prunedCount;
    } catch {
      return prunedCount;
    }
  }

  private isSupersededGymFlowAsset(filename: string, activeFilenames: Set<string>): boolean {
    if (activeFilenames.has(filename)) return false;

    // Extrai o padrão <assetId>_v<version>.mp4
    const match = filename.match(/^(.+)_v(\d+)\.mp4$/);
    if (!match) return false;

    const baseId = match[1];
    // Se existe uma versão ativa correspondente para esse baseId, o arquivo atual é obsoleto
    for (const active of activeFilenames) {
      if (active.startsWith(`${baseId}_v`)) {
        return true;
      }
    }

    return false;
  }

  private async deleteFileSafe(path: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path,
        directory: Directory.Data,
      });
    } catch {
      // Ignora se o arquivo já não existir
    }
  }
}

export const nativeMediaStorage = new NativeMediaStorageDriver();
