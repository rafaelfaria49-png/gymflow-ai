'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  HardDrive,
  RefreshCw,
  Trash2,
  X,
  CheckCircle2,
  Film,
  TrendingUp,
} from 'lucide-react';
import { useGymFlow } from '../providers/GymFlowContext';
import { getActiveManifest } from '../domain/media/manifest';
import {
  clearMediaCache,
  downloadProgramMedia,
  getMediaCacheStats,
} from '../domain/media/mediaCache';
import { getTopExecutedExercises } from '../domain/media/telemetry';
import { MediaCacheStats } from '../domain/media/types';

interface OfflineMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OfflineMediaModal: React.FC<OfflineMediaModalProps> = ({ isOpen, onClose }) => {
  const { programs, user, exercises } = useGymFlow();
  const currentProgram =
    (user?.weeklyPlan?.[0]?.programId
      ? programs.find((p) => p.id === user.weeklyPlan?.[0]?.programId)
      : null) ||
    programs[0] ||
    null;
  const [stats, setStats] = useState<MediaCacheStats>({ count: 0, totalBytes: 0, cacheName: 'gymflow-media-v1' });
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ completed: number; total: number } | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const topExercises = useMemo(() => (isOpen ? getTopExecutedExercises(5) : []), [isOpen]);

  // Carrega estatísticas ao abrir o modal
  useEffect(() => {
    let isSubscribed = true;
    if (isOpen) {
      getMediaCacheStats().then((s) => {
        if (isSubscribed) setStats(s);
      });
    }
    return () => {
      isSubscribed = false;
    };
  }, [isOpen]);

  const refreshStats = async () => {
    const s = await getMediaCacheStats();
    setStats(s);
  };

  if (!isOpen) return null;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const handleDownloadProgram = async () => {
    if (!currentProgram) {
      setFeedbackMessage('Nenhum programa de treino ativo selecionado.');
      return;
    }

    setIsDownloading(true);
    setFeedbackMessage(null);

    try {
      const manifest = getActiveManifest();
      const result = await downloadProgramMedia(currentProgram, manifest, (p) => {
        setDownloadProgress({ completed: p.completed, total: p.total });
      });

      await refreshStats();
      setIsDownloading(false);
      setDownloadProgress(null);

      if (result.success) {
        setFeedbackMessage(`Download concluído! ${result.downloaded} vídeos salvos para uso offline.`);
      } else {
        setFeedbackMessage(`Download finalizado: ${result.downloaded} salvos, ${result.failed} falharam.`);
      }
    } catch {
      setIsDownloading(false);
      setDownloadProgress(null);
      setFeedbackMessage('Falha ao baixar mídia. Verifique sua conexão.');
    }
  };

  const handleClearCache = async () => {
    const ok = confirm('Deseja liberar o espaço ocupado pelos vídeos offline?');
    if (!ok) return;

    await clearMediaCache();
    await refreshStats();
    setFeedbackMessage('Cache de mídia limpo com sucesso.');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-gym-dark p-5 sm:p-6 shadow-2xl text-white max-h-[90vh] overflow-y-auto"
      >
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gym-accent/15 text-gym-accent border border-gym-accent/25">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Mídia Offline & Armazenamento</h3>
              <p className="text-xs text-gym-text-muted">Cache isolado de vídeos técnicos (D14)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gym-text-muted hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ESTATÍSTICAS DE ARMAZENAMENTO */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/5 bg-gym-card/40 p-3.5">
            <div className="flex items-center gap-2 text-gym-text-muted text-xs">
              <HardDrive className="h-3.5 w-3.5 text-gym-accent" />
              <span>Espaço Ocupado</span>
            </div>
            <div className="mt-2 text-xl font-black text-white">{formatBytes(stats.totalBytes)}</div>
            <span className="text-[10px] text-gym-text-muted">Zero impacto no APK</span>
          </div>

          <div className="rounded-2xl border border-white/5 bg-gym-card/40 p-3.5">
            <div className="flex items-center gap-2 text-gym-text-muted text-xs">
              <Film className="h-3.5 w-3.5 text-gym-emerald" />
              <span>Vídeos em Cache</span>
            </div>
            <div className="mt-2 text-xl font-black text-white">{stats.count}</div>
            <span className="text-[10px] text-gym-text-muted">Prontos para modo avião</span>
          </div>
        </div>

        {/* BARRA DE PROGRESSO DE DOWNLOAD */}
        {isDownloading && downloadProgress && (
          <div className="mt-4 rounded-2xl border border-gym-accent/30 bg-gym-accent/10 p-4">
            <div className="flex items-center justify-between text-xs font-bold text-gym-accent">
              <span>Baixando vídeos do programa...</span>
              <span>
                {downloadProgress.completed}/{downloadProgress.total}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full bg-gym-accent transition-all duration-300"
                style={{
                  width: `${(downloadProgress.completed / Math.max(1, downloadProgress.total)) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* MENSAGEM DE FEEDBACK */}
        {feedbackMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-gym-accent/20 bg-gym-accent/10 p-3 text-xs text-gym-accent">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {/* AÇÕES PRINCIPAIS */}
        <div className="mt-5 space-y-2.5">
          <button
            type="button"
            onClick={handleDownloadProgram}
            disabled={isDownloading || !currentProgram}
            className="flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl bg-gym-accent px-4 font-black uppercase tracking-wider text-[11px] text-black transition-all hover:bg-gym-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDownloading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Baixando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Baixar Mídia do Programa Ativo
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleClearCache}
            disabled={isDownloading || stats.count === 0}
            className="flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 font-bold text-xs text-gym-rose hover:bg-gym-rose/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Limpar Cache de Mídia
          </button>
        </div>

        {/* TELEMETRIA LOCAL: EXERCÍCIOS MAIS EXECUTADOS */}
        {topExercises.length > 0 && (
          <div className="mt-6 border-t border-white/5 pt-4">
            <div className="flex items-center gap-2 text-xs font-bold text-white mb-2">
              <TrendingUp className="h-3.5 w-3.5 text-gym-accent" />
              <span>Prioridade de Produção (Telemetria Local)</span>
            </div>
            <div className="space-y-1.5">
              {topExercises.map((top) => {
                const ex = exercises.find((e) => e.id === top.exerciseId);
                return (
                  <div
                    key={top.exerciseId}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs"
                  >
                    <span className="font-bold text-white truncate max-w-[240px]">
                      {ex?.name || top.exerciseId}
                    </span>
                    <span className="rounded bg-black/40 px-2 py-0.5 text-[10px] font-mono text-gym-text-muted">
                      {top.executionCount} execuções
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* NOTA DE CONFORMIDADE D13/D14 */}
        <div className="mt-5 rounded-2xl border border-white/5 bg-black/40 p-3 text-[11px] text-gym-text-muted space-y-1">
          <p className="font-bold text-white">Governança e Direitos Autorais:</p>
          <p>
            Vídeos aprovados sob a <span className="text-gym-accent">Higgsfield Commercial License v1</span>. Nenhum
            vídeo em status <i>draft</i> é baixado ou reproduzido.
          </p>
        </div>
      </div>
    </div>
  );
};
