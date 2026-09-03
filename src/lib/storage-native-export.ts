import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export interface NativeBackupExportOptions {
  cleanupDelayMs?: number;
}

export interface NativeBackupExportResult {
  ok: boolean;
  uri?: string;
  error?: string;
}

/**
 * Exporta um arquivo no ambiente nativo (Android / iOS) gravando-o em Directory.Cache
 * e compartilhando via Share sheet oficial do Capacitor.
 * 
 * - Usa Directory.Cache (já coberto pelo file_paths.xml do FileProvider no Android);
 * - Não requer permissões amplas de armazenamento;
 * - Agenda limpeza segura do arquivo temporário.
 */
export async function exportNativeBackupFile(
  content: string,
  filename: string,
  options?: NativeBackupExportOptions
): Promise<NativeBackupExportResult> {
  try {
    // 1. Grava no cache temporário privado do app
    await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });

    // 2. Obtém a URI local file://
    const uriResult = await Filesystem.getUri({
      path: filename,
      directory: Directory.Cache,
    });

    // 3. Invoca o Share Sheet oficial
    await Share.share({
      title: filename,
      text: 'Backup GymFlow',
      url: uriResult.uri,
      dialogTitle: 'Exportar Backup GymFlow',
    });

    // 4. Limpeza segura pós-compartilhamento
    const delay = options?.cleanupDelayMs ?? 15000;
    if (delay > 0) {
      setTimeout(async () => {
        try {
          await Filesystem.deleteFile({
            path: filename,
            directory: Directory.Cache,
          });
        } catch {
          // Cache do sistema é efêmero por definição
        }
      }, delay);
    }

    return { ok: true, uri: uriResult.uri };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao compartilhar backup nativo';
    console.error('Erro na exportação de backup nativo:', error);
    return { ok: false, error: message };
  }
}
