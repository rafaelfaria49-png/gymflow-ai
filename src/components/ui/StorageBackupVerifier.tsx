'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileSearch, Loader2, ShieldCheck, AlertTriangle, Download } from 'lucide-react';
import {
  inspectLogicalStorageBackupV2,
  MAX_LOGICAL_BACKUP_BYTES,
} from '../../lib/storage-logical-backup';
import type {
  LogicalBackupInspectionFailureReason,
  LogicalBackupPreview,
} from '../../lib/storage-logical-backup';

type VerifyPhase =
  | { phase: 'idle' }
  | { phase: 'reading' }
  | { phase: 'valid-preview'; filename: string; preview: LogicalBackupPreview }
  | { phase: 'confirming-import'; filename: string; preview: LogicalBackupPreview }
  | { phase: 'importing' }
  | { phase: 'invalid'; message: string };

const INSPECTION_FAILURE_MESSAGES: Record<
  LogicalBackupInspectionFailureReason,
  string
> = {
  'invalid-size': 'O tamanho do arquivo selecionado é inválido.',
  'too-large': 'O arquivo excede o limite máximo permitido para verificação.',
  'invalid-json': 'O arquivo selecionado não é um JSON válido.',
  'invalid-format': 'O formato do arquivo não é reconhecido como backup do GymFlow.',
  'unsupported-version': 'A versão deste backup não é suportada.',
  'unsupported-schema': 'O esquema lógico deste backup não é suportado.',
  'invalid-date': 'O arquivo contém datas em formato inválido.',
  'invalid-payload': 'O conteúdo do backup não pôde ser validado.',
  'duplicate-session-id': 'O backup contém sessões duplicadas.',
  'digest-mismatch': 'A integridade do backup não pôde ser confirmada.',
  'crypto-unavailable':
    'A verificação de integridade não está disponível neste navegador.',
};

export interface VerifiedBackupPayload {
  raw: string;
  declaredBytes: number;
  payloadDigest: string;
}

export interface StorageBackupVerifierProps {
  storageMode: 'legacy-v1' | 'hybrid-v2' | 'blocked';
  onVerifiedBackup?: (payload: VerifiedBackupPayload) => Promise<{
    ok: boolean;
    message: string;
  }>;
}

export function StorageBackupVerifier({
  storageMode,
  onVerifiedBackup,
}: StorageBackupVerifierProps) {
  const [phase, setPhase] = useState<VerifyPhase>({ phase: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const readingRef = useRef(false);
  // GOAL-17B-E4B: raw, digest e size ficam privados neste componente.
  // Nunca atravessam Context, storage físico, URL ou console.
  const verifiedRawRef = useRef<string | null>(null);
  const verifiedSizeRef = useRef<number>(0);
  const verifiedDigestRef = useRef<string | null>(null);
  const verifiedFileRef = useRef<File | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Limpar raw e digest no unmount.
      verifiedRawRef.current = null;
      verifiedDigestRef.current = null;
      verifiedSizeRef.current = 0;
      verifiedFileRef.current = null;
    };
  }, []);

  const clearVerifiedBackup = useCallback(() => {
    verifiedRawRef.current = null;
    verifiedDigestRef.current = null;
    verifiedSizeRef.current = 0;
    verifiedFileRef.current = null;
  }, []);

  const resetToIdle = useCallback(() => {
    setPhase({ phase: 'idle' });
    readingRef.current = false;
    clearVerifiedBackup();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [clearVerifiedBackup]);

  const handleVerifyClick = useCallback(() => {
    if (readingRef.current) return;
    inputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (readingRef.current) return;

      // Troca de arquivo invalida confirmação anterior.
      clearVerifiedBackup();

      readingRef.current = true;
      setPhase({ phase: 'reading' });

      if (file.size > MAX_LOGICAL_BACKUP_BYTES) {
        if (mountedRef.current) {
          setPhase({
            phase: 'invalid',
            message: INSPECTION_FAILURE_MESSAGES['too-large'],
          });
        }
        readingRef.current = false;
        return;
      }

      try {
        const raw = await file.text();
        if (!mountedRef.current) return;

        const inspection = await inspectLogicalStorageBackupV2(
          raw,
          file.size,
        );
        if (!mountedRef.current) return;

        if (!inspection.ok) {
          setPhase({
            phase: 'invalid',
            message:
              INSPECTION_FAILURE_MESSAGES[inspection.reason]
              ?? 'Não foi possível verificar o arquivo selecionado.',
          });
          readingRef.current = false;
          return;
        }

        // Manter raw e digest privados quando import disponível.
        if (onVerifiedBackup) {
          verifiedRawRef.current = raw;
          verifiedSizeRef.current = file.size;
          verifiedDigestRef.current = inspection.backup.payloadDigest;
          verifiedFileRef.current = file;
        }

        setPhase({
          phase: 'valid-preview',
          filename: file.name,
          preview: inspection.preview,
        });
        readingRef.current = false;
      } catch {
        if (mountedRef.current) {
          setPhase({
            phase: 'invalid',
            message: 'Não foi possível ler o arquivo selecionado.',
          });
        }
        clearVerifiedBackup();
        readingRef.current = false;
      }
    },
    [onVerifiedBackup, clearVerifiedBackup],
  );

  const handleImportClick = useCallback(() => {
    if (phase.phase !== 'valid-preview') return;
    if (!verifiedRawRef.current || !verifiedDigestRef.current) return;
    setPhase({
      phase: 'confirming-import',
      filename: phase.filename,
      preview: phase.preview,
    });
  }, [phase]);

  const handleCancelImport = useCallback(() => {
    if (phase.phase !== 'confirming-import') return;
    setPhase({
      phase: 'valid-preview',
      filename: phase.filename,
      preview: phase.preview,
    });
  }, [phase]);

  const handleConfirmImport = useCallback(async () => {
    if (phase.phase !== 'confirming-import') return;
    if (!onVerifiedBackup) return;
    const raw = verifiedRawRef.current;
    const digest = verifiedDigestRef.current;
    const size = verifiedSizeRef.current;
    if (!raw || !digest) return;

    setPhase({ phase: 'importing' });

    try {
      const result = await onVerifiedBackup({
        raw,
        declaredBytes: size,
        payloadDigest: digest,
      });

      if (!mountedRef.current) return;

      // Limpar raw e digest após terminal.
      clearVerifiedBackup();

      if (!result.ok) {
        setPhase({
          phase: 'invalid',
          message: result.message,
        });
      }
      // Em sucesso, o Context dispara reload — não precisamos fechar o dialog.
    } catch {
      if (mountedRef.current) {
        clearVerifiedBackup();
        setPhase({
          phase: 'invalid',
          message: 'Não foi possível importar o backup selecionado.',
        });
      }
    }
  }, [phase, onVerifiedBackup, clearVerifiedBackup]);

  if (storageMode !== 'hybrid-v2') return null;

  const isReading = phase.phase === 'reading';
  const isImporting = phase.phase === 'importing';
  const importAvailable = !!onVerifiedBackup;

  return (
    <>
      <button
        type="button"
        onClick={handleVerifyClick}
        disabled={isReading || isImporting}
        className="min-h-[44px] rounded-2xl border border-gym-accent/25 bg-gym-accent/10 px-3 text-xs font-extrabold text-gym-accent enabled:hover:bg-gym-accent/15 disabled:cursor-not-allowed disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
        aria-label="Verificar backup lógico v2"
      >
        {isReading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <FileSearch className="h-4 w-4" aria-hidden="true" />
        )}
        {isReading ? 'Verificando…' : 'Verificar backup'}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Selecionar backup JSON v2 para verificação"
      />

      {phase.phase === 'valid-preview' && (
        <div
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={resetToIdle}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="verify-preview-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm bg-gym-card border border-white/10 rounded-3xl p-6 shadow-2xl animate-toast-in"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center bg-gym-emerald/15 text-gym-emerald">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2
                  id="verify-preview-title"
                  className="text-base font-bold text-white pt-1.5 leading-tight"
                >
                  Backup verificado
                </h2>
                <p className="text-[10px] text-gym-emerald font-bold mt-0.5">
                  Nenhum dado foi alterado.
                </p>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <PreviewRow label="Arquivo" value={phase.filename} />
              <PreviewRow
                label="Tamanho"
                value={`${phase.preview.bytes.toLocaleString('pt-BR')} bytes`}
              />
              <PreviewRow
                label="Exportado em"
                value={new Date(phase.preview.exportedAt).toLocaleString('pt-BR')}
              />
              <PreviewRow
                label="Snapshot em"
                value={new Date(phase.preview.sourceSavedAt).toLocaleString('pt-BR')}
              />
              <PreviewRow
                label="Sessões de treino"
                value={String(phase.preview.workoutSessions)}
              />
              <PreviewRow
                label="Treino ativo"
                value={phase.preview.hasActiveWorkout ? 'Sim' : 'Não'}
              />
              <PreviewRow
                label="Programas personalizados"
                value={String(phase.preview.customPrograms)}
              />
              <PreviewRow
                label="Registros de peso"
                value={String(phase.preview.weightEntries)}
              />
              <PreviewRow
                label="Registros de medidas"
                value={String(phase.preview.measurementEntries)}
              />
              {phase.preview.warning && (
                <div className="flex items-start gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <p className="text-[10px] text-yellow-200/80 leading-relaxed">
                    {phase.preview.warning}
                  </p>
                </div>
              )}
            </div>

            {importAvailable ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleImportClick}
                  className="w-full min-h-[44px] px-4 rounded-2xl text-xs font-extrabold bg-gym-accent text-gym-dark hover:bg-gym-accent-hover transition-all inline-flex items-center justify-center gap-1.5"
                  aria-label="Importar este backup"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Importar este backup
                </button>
                <button
                  type="button"
                  onClick={resetToIdle}
                  className="w-full min-h-[44px] px-4 rounded-2xl text-xs font-extrabold bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <>
                <p className="text-[10px] text-gym-text-muted leading-relaxed mb-4 rounded-xl border border-white/5 bg-white/5 p-3">
                  A importação segura será habilitada em uma próxima etapa.
                </p>
                <button
                  type="button"
                  onClick={resetToIdle}
                  className="w-full min-h-[44px] px-4 rounded-2xl text-xs font-extrabold bg-gym-accent text-gym-dark hover:bg-gym-accent-hover transition-all"
                >
                  Fechar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {phase.phase === 'confirming-import' && (
        <div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-import-title"
            aria-describedby="confirm-import-description"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm bg-gym-card border border-gym-rose/30 rounded-3xl p-6 shadow-2xl animate-toast-in"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center bg-gym-rose/15 text-gym-rose">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2
                  id="confirm-import-title"
                  className="text-base font-bold text-white pt-1.5 leading-tight"
                >
                  Confirmar importação
                </h2>
                <p className="text-[10px] text-gym-rose font-bold mt-0.5">
                  Esta ação é destrutiva.
                </p>
              </div>
            </div>

            <div
              id="confirm-import-description"
              className="space-y-2 mb-4 text-[11px] text-gym-text-muted leading-relaxed"
            >
              <p>
                Os dados locais atuais serão <strong className="text-white">substituídos</strong> pelo conteúdo do backup verificado:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Treinos, perfil, medidas e programas personalizados</li>
                <li>O arquivo verificado será a nova fonte de dados</li>
                <li>O aplicativo será recarregado após a importação</li>
              </ul>
              <p className="text-yellow-300/80 font-bold">
                Não feche esta aba durante a operação.
              </p>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleConfirmImport}
                className="w-full min-h-[44px] px-4 rounded-2xl text-xs font-extrabold bg-gym-rose text-white hover:bg-red-600 transition-all"
                aria-label="Substituir dados e importar"
              >
                Substituir dados e importar
              </button>
              <button
                type="button"
                onClick={handleCancelImport}
                className="w-full min-h-[44px] px-4 rounded-2xl text-xs font-extrabold bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {phase.phase === 'importing' && (
        <div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="importing-title"
            className="w-full sm:max-w-sm bg-gym-card border border-white/10 rounded-3xl p-6 shadow-2xl animate-toast-in"
          >
            <div className="flex items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-gym-accent flex-shrink-0" aria-hidden="true" />
              <div>
                <h2
                  id="importing-title"
                  className="text-base font-bold text-white leading-tight"
                >
                  Importando backup…
                </h2>
                <p className="text-[10px] text-gym-text-muted mt-0.5">
                  Não feche esta aba.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {phase.phase === 'invalid' && (
        <div
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={resetToIdle}
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="verify-error-title"
            aria-describedby="verify-error-description"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm bg-gym-card border border-white/10 rounded-3xl p-6 shadow-2xl animate-toast-in"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center bg-gym-rose/15 text-gym-rose">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2
                  id="verify-error-title"
                  className="text-base font-bold text-white pt-1.5 leading-tight"
                >
                  Verificação falhou
                </h2>
                <p
                  id="verify-error-description"
                  className="text-xs text-gym-text-muted mt-1 leading-relaxed"
                >
                  {phase.message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={resetToIdle}
              className="w-full min-h-[44px] px-4 rounded-2xl text-xs font-extrabold bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-[11px]">
      <span className="text-gym-text-muted font-medium">{label}</span>
      <span className="text-white font-bold">{value}</span>
    </div>
  );
}
