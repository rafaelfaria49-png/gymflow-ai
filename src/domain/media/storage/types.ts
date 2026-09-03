import type { MediaAsset, MediaCacheStats, MediaManifest } from '../types';

/**
 * Interface do driver de armazenamento de mídia offline.
 * Implementado por:
 * - WebStorageDriver: Cache Storage API (Web / PWA)
 * - NativeStorageDriver: @capacitor/filesystem + @capacitor/file-transfer (Android / iOS)
 */
export interface MediaStorageDriver {
  readonly driverName: 'web-cache-storage' | 'capacitor-filesystem';

  /**
   * Verifica se um asset de mídia está disponível localmente para uso offline.
   */
  isCached(assetOrUrl: MediaAsset | string, manifest?: MediaManifest): Promise<boolean>;

  /**
   * Baixa e salva um MediaAsset no armazenamento local apropriado.
   */
  cacheAsset(asset: MediaAsset, manifest?: MediaManifest): Promise<boolean>;

  /**
   * Obtém a URL/URI local adequada para reprodução pelo player:
   * - No Web: blob: URL gerada a partir do Cache Storage
   * - No Nativo: converted file URL (Capacitor.convertFileSrc)
   * - Se não cacheado ou corrompido: retorna a URL remota original
   */
  getPlayableUrl(assetOrUrl: MediaAsset | string, manifest?: MediaManifest): Promise<string>;

  /**
   * Retorna a lista de chaves ou URLs atualmente cacheadas.
   */
  listCached(): Promise<string[]>;

  /**
   * Retorna estatísticas de armazenamento (quantidade de mídias e tamanho total em bytes).
   */
  getStats(): Promise<MediaCacheStats>;

  /**
   * Limpa todo o cache de mídia do GymFlow sem tocar em nenhum outro dado do app.
   */
  clear(): Promise<boolean>;

  /**
   * Invalida e remove versões antigas de assets ou arquivos temporários incompletos.
   */
  pruneObsolete(manifest?: MediaManifest): Promise<number>;
}
