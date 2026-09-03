import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { FileTransfer } from '@capacitor/file-transfer';

const virtualFs = new Map<string, { size: number; content?: string }>();

vi.mock('@capacitor/filesystem', () => {
  return {
    Directory: {
      Documents: 'DOCUMENTS',
      Data: 'DATA',
      Library: 'LIBRARY',
      Cache: 'CACHE',
      External: 'EXTERNAL',
      ExternalStorage: 'EXTERNAL_STORAGE',
    },
    Encoding: {
      UTF8: 'utf8',
    },
    Filesystem: {
      mkdir: vi.fn(async () => {}),
      stat: vi.fn(async (opts: { path: string }) => {
        const file = virtualFs.get(opts.path);
        if (!file) throw new Error('File not found');
        return {
          type: 'file',
          size: file.size,
          ctime: Date.now(),
          mtime: Date.now(),
          uri: `file:///data/user/0/com.gymflowai.app/files/${opts.path}`,
        };
      }),
      getUri: vi.fn(async (opts: { path: string }) => ({
        uri: `file:///data/user/0/com.gymflowai.app/files/${opts.path}`,
      })),
      rename: vi.fn(async (opts: { from: string; to: string }) => {
        const item = virtualFs.get(opts.from);
        if (!item) throw new Error('Source file not found');
        virtualFs.delete(opts.from);
        virtualFs.set(opts.to, item);
      }),
      deleteFile: vi.fn(async (opts: { path: string }) => {
        virtualFs.delete(opts.path);
      }),
      readdir: vi.fn(async (opts: { path: string }) => {
        const files: Array<{ name: string; type: string; size: number }> = [];
        for (const [path, data] of virtualFs.entries()) {
          if (path.startsWith(`${opts.path}/`)) {
            const relName = path.slice(opts.path.length + 1);
            files.push({
              name: relName,
              type: 'file',
              size: data.size,
            });
          }
        }
        return { files };
      }),
    },
  };
});

vi.mock('@capacitor/file-transfer', () => {
  return {
    FileTransfer: {
      downloadFile: vi.fn(async (opts: { url: string; path: string }) => {
        const pathPart = opts.path.replace('file:///data/user/0/com.gymflowai.app/files/', '');
        virtualFs.set(pathPart, { size: 1500000 });
        return { path: opts.path };
      }),
    },
  };
});

import { NativeMediaStorageDriver, getDeterministicMediaFilename, NATIVE_MEDIA_DIR } from './storage/nativeStorage';
import { WebMediaStorageDriver } from './storage/webStorage';
import { getMediaStorageDriver } from './storage';
import type { MediaAsset, MediaManifest } from './types';

describe('Media Storage Cross-Platform Abstraction (GOAL-MOBILE-CROSS-PLATFORM-004)', () => {
  const sampleApprovedAsset: MediaAsset = {
    id: 'vid_chest_supino_reto_v1',
    url: 'https://cdn.gymflow.ai/media/videos/supino_v1.mp4',
    bytes: 1500000,
    width: 1080,
    height: 1920,
    version: 1,
    status: 'approved',
    provenance: {
      provider: 'higgsfield',
      approval: {
        approvedBy: 'coach_lead',
        approvedAt: '2026-09-02T19:00:00.000Z',
      },
    },
  };

  const sampleDraftAsset: MediaAsset = {
    id: 'vid_triceps_draft_v1',
    url: 'https://cdn.gymflow.ai/media/videos/triceps_draft.mp4',
    bytes: 1200000,
    width: 1080,
    height: 1920,
    version: 1,
    status: 'draft',
  };

  describe('1. Web Storage Driver (Cache Storage)', () => {
    let mockCacheStorage: Map<string, Response>;
    let webDriver: WebMediaStorageDriver;

    beforeEach(() => {
      mockCacheStorage = new Map();
      webDriver = new WebMediaStorageDriver();

      const mockCache: Partial<Cache> = {
        match: vi.fn(async (req: RequestInfo | URL) => {
          const url = typeof req === 'string' ? req : (req as Request).url;
          return mockCacheStorage.get(url);
        }),
        put: vi.fn(async (req: RequestInfo | URL, resp: Response) => {
          const url = typeof req === 'string' ? req : (req as Request).url;
          mockCacheStorage.set(url, resp);
        }),
        keys: vi.fn(async () => Array.from(mockCacheStorage.keys()).map((u) => new Request(u))),
        delete: vi.fn(async (req: RequestInfo | URL) => {
          const url = typeof req === 'string' ? req : (req as Request).url;
          return mockCacheStorage.delete(url);
        }),
      };

      const mockCaches: Partial<CacheStorage> = {
        open: vi.fn(async () => mockCache as Cache),
        delete: vi.fn(async () => {
          mockCacheStorage.clear();
          return true;
        }),
      };

      vi.stubGlobal('caches', mockCaches);
      vi.stubGlobal('window', {});
      vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => `blob:http://localhost/${'size' in blob ? blob.size : 0}`);
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('video-stream', { status: 200, headers: { 'content-length': '1500000' } }))
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('identifica cache miss e cache hit corretamente', async () => {
      expect(await webDriver.isCached(sampleApprovedAsset)).toBe(false);

      await webDriver.cacheAsset(sampleApprovedAsset);
      expect(await webDriver.isCached(sampleApprovedAsset)).toBe(true);
      expect(await webDriver.isCached(sampleApprovedAsset.url)).toBe(true);
    });

    it('QA Gate: recusa armazenar asset draft ou sem status approved', async () => {
      const ok = await webDriver.cacheAsset(sampleDraftAsset);
      expect(ok).toBe(false);
      expect(await webDriver.isCached(sampleDraftAsset)).toBe(false);
    });

    it('gera URL blob para mídia em cache no navegador e retorna URL remota para mídia ausente', async () => {
      const missingUrl = await webDriver.getPlayableUrl(sampleApprovedAsset);
      expect(missingUrl).toBe(sampleApprovedAsset.url);

      await webDriver.cacheAsset(sampleApprovedAsset);
      const playable = await webDriver.getPlayableUrl(sampleApprovedAsset);
      expect(playable).toContain('blob:');
    });

    it('pruneObsolete: limpa itens do cache que não pertencem ao manifest ativo', async () => {
      await webDriver.cacheAsset(sampleApprovedAsset);
      expect(await webDriver.isCached(sampleApprovedAsset)).toBe(true);

      const manifest: MediaManifest = {
        version: 2,
        schemaVersion: '1.0.0',
        updatedAt: '2026-09-02T20:00:00.000Z',
        cdnBaseUrl: 'https://cdn.gymflow.ai',
        assets: {},
      };

      const pruned = await webDriver.pruneObsolete(manifest);
      expect(pruned).toBe(1);
      expect(await webDriver.isCached(sampleApprovedAsset)).toBe(false);
    });

    it('limpa cache mantendo isolamento', async () => {
      await webDriver.cacheAsset(sampleApprovedAsset);
      expect(await webDriver.clear()).toBe(true);
      expect(await webDriver.isCached(sampleApprovedAsset)).toBe(false);
    });
  });

  describe('2. Native Storage Driver (Capacitor Filesystem + FileTransfer)', () => {
    let nativeDriver: NativeMediaStorageDriver;

    beforeEach(() => {
      virtualFs.clear();
      nativeDriver = new NativeMediaStorageDriver();

      vi.spyOn(Capacitor, 'convertFileSrc').mockImplementation((uri) => {
        return uri.replace('file://', 'https://localhost/_capacitor_file_');
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('gera nomes determinísticos baseados em assetId e version', () => {
      const filename = getDeterministicMediaFilename(sampleApprovedAsset);
      expect(filename).toBe('vid_chest_supino_reto_v1_v1.mp4');

      const assetV2: MediaAsset = { ...sampleApprovedAsset, version: 2 };
      expect(getDeterministicMediaFilename(assetV2)).toBe('vid_chest_supino_reto_v1_v2.mp4');
    });

    it('baixa com segurança para .tmp e renomeia para destino determinístico após validação', async () => {
      const expectedFilename = getDeterministicMediaFilename(sampleApprovedAsset);
      const expectedFinalPath = `${NATIVE_MEDIA_DIR}/${expectedFilename}`;

      const ok = await nativeDriver.cacheAsset(sampleApprovedAsset);
      expect(ok).toBe(true);

      expect(virtualFs.has(expectedFinalPath)).toBe(true);
      expect(virtualFs.get(expectedFinalPath)?.size).toBe(1500000);
      expect(virtualFs.has(`${expectedFinalPath}.tmp`)).toBe(false);
      expect(await nativeDriver.isCached(sampleApprovedAsset)).toBe(true);
    });

    it('download interrompido/falho: limpa temporário e nunca marca como concluído', async () => {
      vi.mocked(FileTransfer.downloadFile).mockRejectedValueOnce(new Error('Network disconnected'));

      const expectedFilename = getDeterministicMediaFilename(sampleApprovedAsset);
      const expectedFinalPath = `${NATIVE_MEDIA_DIR}/${expectedFilename}`;

      const ok = await nativeDriver.cacheAsset(sampleApprovedAsset);
      expect(ok).toBe(false);

      expect(virtualFs.has(expectedFinalPath)).toBe(false);
      expect(virtualFs.has(`${expectedFinalPath}.tmp`)).toBe(false);
      expect(await nativeDriver.isCached(sampleApprovedAsset)).toBe(false);
    });

    it('download vazio (0 bytes) é rejeitado e removido', async () => {
      vi.mocked(FileTransfer.downloadFile).mockImplementationOnce(async (opts) => {
        const pathPart = opts.path.replace('file:///data/user/0/com.gymflowai.app/files/', '');
        virtualFs.set(pathPart, { size: 0 });
        return { path: opts.path };
      });

      const ok = await nativeDriver.cacheAsset(sampleApprovedAsset);
      expect(ok).toBe(false);

      const expectedFilename = getDeterministicMediaFilename(sampleApprovedAsset);
      expect(virtualFs.has(`${NATIVE_MEDIA_DIR}/${expectedFilename}`)).toBe(false);
      expect(await nativeDriver.isCached(sampleApprovedAsset)).toBe(false);
    });

    it('resolve URL reproduzível via Capacitor.convertFileSrc e NUNCA usa Blob URL no nativo', async () => {
      await nativeDriver.cacheAsset(sampleApprovedAsset);

      const playableUrl = await nativeDriver.getPlayableUrl(sampleApprovedAsset);
      expect(playableUrl).toContain('https://localhost/_capacitor_file_/');
      expect(playableUrl).not.toContain('blob:');
      expect(playableUrl).toContain(getDeterministicMediaFilename(sampleApprovedAsset));
    });

    it('fallback para URL remota se o arquivo nativo não existir no filesystem', async () => {
      const playableUrl = await nativeDriver.getPlayableUrl(sampleApprovedAsset);
      expect(playableUrl).toBe(sampleApprovedAsset.url);
      expect(playableUrl).not.toContain('_capacitor_file_');
    });

    it('manifest bump: invalida e remove versões anteriores do mesmo asset', async () => {
      await nativeDriver.cacheAsset(sampleApprovedAsset);
      const filenameV1 = getDeterministicMediaFilename(sampleApprovedAsset);
      expect(virtualFs.has(`${NATIVE_MEDIA_DIR}/${filenameV1}`)).toBe(true);

      const assetV2: MediaAsset = { ...sampleApprovedAsset, version: 2, id: sampleApprovedAsset.id };
      const manifestV2: MediaManifest = {
        version: 2,
        schemaVersion: '1.0.0',
        updatedAt: '2026-09-02T21:00:00.000Z',
        cdnBaseUrl: 'https://cdn.gymflow.ai',
        assets: {
          chest_supino_reto: {
            exerciseId: 'chest_supino_reto',
            thumbnail: { ...sampleApprovedAsset, id: 'thumb' },
            video: assetV2,
          },
        },
      };

      const pruned = await nativeDriver.pruneObsolete(manifestV2);
      expect(pruned).toBe(1);
      expect(virtualFs.has(`${NATIVE_MEDIA_DIR}/${filenameV1}`)).toBe(false);
    });

    it('limpeza seletiva: clear remove apenas mídia dentro de gymflow-media e não afeta outros arquivos', async () => {
      await nativeDriver.cacheAsset(sampleApprovedAsset);
      virtualFs.set('user_preferences.json', { size: 256 });

      const ok = await nativeDriver.clear();
      expect(ok).toBe(true);

      const stats = await nativeDriver.getStats();
      expect(stats.count).toBe(0);
      expect(stats.totalBytes).toBe(0);

      expect(virtualFs.has('user_preferences.json')).toBe(true);
    });
  });

  describe('3. Seleção de Driver e Integração da Fachada mediaCache', () => {
    it('seleciona NativeMediaStorageDriver quando isCapacitorNative() for true', () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      const driver = getMediaStorageDriver();
      expect(driver.driverName).toBe('capacitor-filesystem');
      vi.restoreAllMocks();
    });

    it('seleciona WebMediaStorageDriver quando isCapacitorNative() for false', () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
      const driver = getMediaStorageDriver();
      expect(driver.driverName).toBe('web-cache-storage');
      vi.restoreAllMocks();
    });
  });
});
