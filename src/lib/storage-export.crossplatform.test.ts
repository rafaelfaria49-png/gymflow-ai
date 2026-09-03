import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { downloadTextFile } from './storage-export';
import { exportNativeBackupFile } from './storage-native-export';

const virtualFs = new Map<string, { data: string; directory: string }>();

vi.mock('@capacitor/filesystem', () => ({
  Directory: {
    Cache: 'CACHE',
    Data: 'DATA',
  },
  Encoding: {
    UTF8: 'utf8',
  },
  Filesystem: {
    writeFile: vi.fn(async (opts: { path: string; data: string; directory: string }) => {
      virtualFs.set(opts.path, { data: opts.data, directory: opts.directory });
    }),
    getUri: vi.fn(async (opts: { path: string; directory: string }) => ({
      uri: `file:///data/user/0/com.gymflowai.app/cache/${opts.path}`,
    })),
    deleteFile: vi.fn(async (opts: { path: string; directory: string }) => {
      virtualFs.delete(opts.path);
    }),
  },
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    share: vi.fn(async () => ({})),
  },
}));

describe('Storage Export Cross-Platform (GOAL-MOBILE-CROSS-PLATFORM-004)', () => {
  const sampleBackupContent = JSON.stringify({
    format: 'gymflow-backup',
    formatVersion: 1,
    exportedAt: '2026-09-02T21:00:00.000Z',
    appStorageVersion: 1,
    envelope: { v: 1, savedAt: '2026-09-02T21:00:00.000Z', data: {} },
  });
  const sampleFilename = 'gymflow-backup-2026-09-02-2100.json';

  beforeEach(() => {
    virtualFs.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Ambiente Web / PWA', () => {
    it('executa download via <a> e Blob URL quando isCapacitorNative() for false', async () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);

      const createdUrls: string[] = [];
      const clickedAnchors: Array<{ download: string; href: string }> = [];

      vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
        const size = 'size' in blob ? blob.size : 0;
        const url = `blob:http://localhost/blob-${size}`;
        createdUrls.push(url);
        return url;
      });
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const mockAnchor = {
        href: '',
        download: '',
        style: { display: '' },
        click: vi.fn(function (this: { download: string; href: string }) {
          clickedAnchors.push({ download: this.download, href: this.href });
        }),
        remove: vi.fn(),
      };

      const mockDocument = {
        createElement: vi.fn(() => mockAnchor),
        body: {
          appendChild: vi.fn(() => mockAnchor),
        },
      };

      vi.stubGlobal('document', mockDocument);

      await downloadTextFile(sampleBackupContent, sampleFilename);

      expect(createdUrls.length).toBe(1);
      expect(clickedAnchors.length).toBe(1);
      expect(clickedAnchors[0].download).toBe(sampleFilename);
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(mockAnchor.remove).toHaveBeenCalled();

      // Nenhum arquivo foi gravado no filesystem nativo
      expect(virtualFs.size).toBe(0);
      expect(Share.share).not.toHaveBeenCalled();
    });
  });

  describe('Ambiente Nativo (Android / iOS Capacitor)', () => {
    it('grava no Directory.Cache e abre o Share sheet com URI file:// quando isCapacitorNative() for true', async () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);

      await downloadTextFile(sampleBackupContent, sampleFilename, 'application/json');

      // 1. Arquivo gravado no Cache temporário do app
      expect(Filesystem.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({
          path: sampleFilename,
          data: sampleBackupContent,
          directory: 'CACHE',
        })
      );
      expect(virtualFs.has(sampleFilename)).toBe(true);

      // 2. URI resolvida via Filesystem
      expect(Filesystem.getUri).toHaveBeenCalledWith({
        path: sampleFilename,
        directory: 'CACHE',
      });

      // 3. Share sheet aberto com a URI correta
      expect(Share.share).toHaveBeenCalledWith({
        title: sampleFilename,
        text: 'Backup GymFlow',
        url: `file:///data/user/0/com.gymflowai.app/cache/${sampleFilename}`,
        dialogTitle: 'Exportar Backup GymFlow',
      });
    });

    it('exportNativeBackupFile limpa o arquivo temporário após o cleanupDelay', async () => {
      vi.useFakeTimers();

      const result = await exportNativeBackupFile(sampleBackupContent, sampleFilename, {
        cleanupDelayMs: 100,
      });

      expect(result.ok).toBe(true);
      expect(virtualFs.has(sampleFilename)).toBe(true);

      // Avança o timer para disparar a limpeza segura
      await vi.advanceTimersByTimeAsync(150);

      expect(Filesystem.deleteFile).toHaveBeenCalledWith({
        path: sampleFilename,
        directory: 'CACHE',
      });
      expect(virtualFs.has(sampleFilename)).toBe(false);

      vi.useRealTimers();
    });

    it('trata falha de compartilhamento nativo de forma segura sem crashar', async () => {
      vi.mocked(Share.share).mockRejectedValueOnce(new Error('Share canceled by user'));

      const result = await exportNativeBackupFile(sampleBackupContent, sampleFilename, {
        cleanupDelayMs: 0,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Share canceled');
    });
  });
});
