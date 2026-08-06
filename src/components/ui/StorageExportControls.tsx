'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { downloadTextFile } from '../../lib/storage-export';
import { useToast } from './Toast';

type LogicalBackupExportFailureReason =
  | 'administration-unavailable'
  | 'administration-conflicted'
  | 'administration-interrupted'
  | 'snapshot-changed-during-export'
  | 'invalid-core'
  | 'invalid-logical-state'
  | 'invalid-timestamp'
  | 'crypto-unavailable'
  | 'serialization'
  | 'too-large';

type PublicLogicalExportResult =
  | {
      ok: true;
      content: string;
      filename: string;
      bytes: number;
      warning: string | null;
    }
  | {
      ok: false;
      reason: LogicalBackupExportFailureReason;
    };

type ExportPhase =
  | { phase: 'idle' }
  | { phase: 'privacy-confirm' }
  | { phase: 'generating' }
  | {
      phase: 'large-file-confirm';
      content: string;
      filename: string;
      bytes: number;
      warning: string;
    }
  | { phase: 'success'; bytes: number }
  | { phase: 'error'; message: string };

const FAILURE_MESSAGES: Record<LogicalBackupExportFailureReason, string> = {
  'administration-unavailable':
    'O armazenamento administrativo está indisponível. Tente novamente.',
  'administration-conflicted':
    'O armazenamento está em conflito. Aguarde e tente novamente.',
  'administration-interrupted':
    'Existe uma operação administrativa pendente. Aguarde a conclusão.',
  'snapshot-changed-during-export':
    'O armazenamento mudou durante a exportação. Tente novamente.',
  'invalid-core': 'O armazenamento local requer atenção antes de exportar.',
  'invalid-logical-state':
    'O estado lógico do armazenamento não pôde ser reconstruído.',
  'invalid-timestamp': 'O instante de exportação é inválido. Tente novamente.',
  'crypto-unavailable':
    'A criptografia necessária não está disponível neste navegador.',
  'serialization': 'Não foi possível serializar o backup lógico.',
  'too-large': 'O backup excede o limite máximo permitido.',
};

const PRIVACY_DESCRIPTION =
  'O arquivo de backup contém dados locais do seu perfil, medidas corporais, '
  + 'histórico de peso, programas personalizados, sessões de treino e outras '
  + 'informações salvas neste aparelho. Ele não será enviado a nenhum servidor — '
  + 'guarde-o em local seguro.';

export interface StorageExportControlsProps {
  storageMode: 'legacy-v1' | 'hybrid-v2' | 'blocked';
  legacyExport: () => void;
  legacyDisabled: boolean;
  exportLogicalBackupV2: () => Promise<PublicLogicalExportResult>;
}

export function StorageExportControls({
  storageMode,
  legacyExport,
  legacyDisabled,
  exportLogicalBackupV2,
}: StorageExportControlsProps) {
  const toast = useToast();
  const [state, setState] = useState<ExportPhase>({ phase: 'idle' });
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const pendingPromiseRef = useRef<Promise<PublicLogicalExportResult> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resetToIdle = useCallback(() => {
    setState({ phase: 'idle' });
  }, []);

  const handleExportClick = useCallback(() => {
    if (storageMode === 'legacy-v1') {
      legacyExport();
      return;
    }
    if (storageMode === 'hybrid-v2') {
      setState({ phase: 'privacy-confirm' });
    }
  }, [storageMode, legacyExport]);

  const handlePrivacyConfirm = useCallback(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (pendingPromiseRef.current) return;

    setState({ phase: 'generating' });

    const promise = exportLogicalBackupV2();
    pendingPromiseRef.current = promise;

    void promise.then((result) => {
      pendingPromiseRef.current = null;
      if (!mountedRef.current) return;
      if (requestIdRef.current !== requestId) return;

      if (!result.ok) {
        setState({
          phase: 'error',
          message: FAILURE_MESSAGES[result.reason],
        });
        return;
      }

      if (result.warning) {
        setState({
          phase: 'large-file-confirm',
          content: result.content,
          filename: result.filename,
          bytes: result.bytes,
          warning: result.warning,
        });
        return;
      }

      downloadTextFile(result.content, result.filename);
      setState({ phase: 'success', bytes: result.bytes });
      toast.success(
        `Backup exportado (${result.bytes.toLocaleString('pt-BR')} bytes).`,
      );
    });
  }, [exportLogicalBackupV2, toast]);

  const handlePrivacyCancel = useCallback(() => {
    resetToIdle();
  }, [resetToIdle]);

  const handleLargeFileConfirm = useCallback(() => {
    setState((prev) => {
      if (prev.phase !== 'large-file-confirm') return prev;
      downloadTextFile(prev.content, prev.filename);
      toast.success(
        `Backup exportado (${prev.bytes.toLocaleString('pt-BR')} bytes).`,
      );
      return { phase: 'success', bytes: prev.bytes };
    });
  }, [toast]);

  const handleLargeFileCancel = useCallback(() => {
    resetToIdle();
  }, [resetToIdle]);

  const isGenerating = state.phase === 'generating';
  const isDisabled =
    storageMode === 'blocked'
    || (storageMode === 'legacy-v1' && legacyDisabled)
    || isGenerating;

  return (
    <>
      <button
        type="button"
        onClick={handleExportClick}
        disabled={isDisabled}
        className="min-h-[44px] rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-extrabold text-white enabled:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
        aria-label={
          storageMode === 'hybrid-v2'
            ? 'Exportar backup lógico v2'
            : 'Exportar backup JSON'
        }
      >
        {isGenerating ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        {isGenerating ? 'Gerando backup…' : 'Exportar backup'}
      </button>

      {state.phase === 'privacy-confirm' && (
        <div
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={handlePrivacyCancel}
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="export-privacy-title"
            aria-describedby="export-privacy-description"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm bg-gym-card border border-white/10 rounded-3xl p-6 shadow-2xl animate-toast-in"
          >
            <div className="flex items-start gap-3 mb-2">
              <div className="flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center bg-gym-accent/15 text-gym-accent">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h2
                id="export-privacy-title"
                className="text-base font-bold text-white pt-1.5 leading-tight"
              >
                Exportar backup lógico
              </h2>
            </div>
            <p
              id="export-privacy-description"
              className="text-xs text-gym-text-muted leading-relaxed mb-6 pl-[52px]"
            >
              {PRIVACY_DESCRIPTION}
            </p>
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={handlePrivacyCancel}
                className="flex-1 min-h-[44px] px-4 rounded-2xl text-xs font-extrabold bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePrivacyConfirm}
                className="flex-1 min-h-[44px] px-4 rounded-2xl text-xs font-extrabold bg-gym-accent text-gym-dark hover:bg-gym-accent-hover transition-all"
              >
                Confirmar e gerar
              </button>
            </div>
          </div>
        </div>
      )}

      {state.phase === 'large-file-confirm' && (
        <div
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={handleLargeFileCancel}
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="export-large-title"
            aria-describedby="export-large-description"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm bg-gym-card border border-white/10 rounded-3xl p-6 shadow-2xl animate-toast-in"
          >
            <div className="flex items-start gap-3 mb-2">
              <div className="flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center bg-yellow-500/15 text-yellow-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h2
                id="export-large-title"
                className="text-base font-bold text-white pt-1.5 leading-tight"
              >
                Arquivo grande
              </h2>
            </div>
            <p
              id="export-large-description"
              className="text-xs text-gym-text-muted leading-relaxed mb-6 pl-[52px]"
            >
              {state.warning}
            </p>
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={handleLargeFileCancel}
                className="flex-1 min-h-[44px] px-4 rounded-2xl text-xs font-extrabold bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleLargeFileConfirm}
                className="flex-1 min-h-[44px] px-4 rounded-2xl text-xs font-extrabold bg-gym-accent text-gym-dark hover:bg-gym-accent-hover transition-all"
              >
                Baixar mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}

      {state.phase === 'success' && (
        <div
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={resetToIdle}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-success-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm bg-gym-card border border-white/10 rounded-3xl p-6 shadow-2xl animate-toast-in"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center bg-gym-emerald/15 text-gym-emerald">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2
                  id="export-success-title"
                  className="text-base font-bold text-white pt-1.5 leading-tight"
                >
                  Backup exportado
                </h2>
                <p className="text-xs text-gym-text-muted mt-1">
                  {state.bytes.toLocaleString('pt-BR')} bytes salvos com sucesso.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={resetToIdle}
              className="w-full min-h-[44px] px-4 rounded-2xl text-xs font-extrabold bg-gym-accent text-gym-dark hover:bg-gym-accent-hover transition-all"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {state.phase === 'error' && (
        <div
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={resetToIdle}
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="export-error-title"
            aria-describedby="export-error-description"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm bg-gym-card border border-white/10 rounded-3xl p-6 shadow-2xl animate-toast-in"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center bg-gym-rose/15 text-gym-rose">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2
                  id="export-error-title"
                  className="text-base font-bold text-white pt-1.5 leading-tight"
                >
                  Falha na exportação
                </h2>
                <p
                  id="export-error-description"
                  className="text-xs text-gym-text-muted mt-1 leading-relaxed"
                >
                  {state.message}
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
