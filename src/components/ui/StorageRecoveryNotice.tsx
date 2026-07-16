'use client';

import React, { useState } from 'react';
import { AlertTriangle, Download, RotateCcw, Sparkles } from 'lucide-react';
import type { StorageHealth } from '../../lib/storage-types';
import { ConfirmDialog } from './ConfirmDialog';

interface StorageRecoveryNoticeProps {
  health: StorageHealth;
  onExportRaw: () => void;
  onRestoreBackup: () => void;
  onStartFresh: () => void;
}

export const StorageRecoveryNotice = ({
  health,
  onExportRaw,
  onRestoreBackup,
  onStartFresh,
}: StorageRecoveryNoticeProps) => {
  const [confirmation, setConfirmation] = useState<'restore' | 'fresh' | null>(null);

  if (health.status === 'loading' || health.status === 'ready' || !health.issue) return null;

  const incompatible = health.issue.kind === 'unsupported-version';
  const blocked = health.status === 'blocked';
  const title = incompatible
    ? 'Dados locais de outra versão'
    : health.issue.kind === 'corrupt'
      ? 'Dados locais precisam de recuperação'
      : 'O último salvamento não foi confirmado';

  return (
    <>
      <aside
        role="alert"
        className="fixed z-[105] inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] mx-auto max-w-xl rounded-2xl border border-gym-rose/35 bg-gym-card/95 p-4 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gym-rose/15 text-gym-rose">
            <AlertTriangle className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-extrabold text-white">{title}</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-gym-text-muted">
              {health.issue.message} {blocked && 'O autosave está pausado para não substituir o conteúdo original.'}
            </p>
            {health.hasBackup && (
              <p className="mt-1 text-[10px] font-bold text-gym-emerald">Há um backup v1 válido disponível.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {health.issue.raw && (
                <button
                  type="button"
                  onClick={onExportRaw}
                  className="min-h-[40px] rounded-xl border border-white/10 bg-white/5 px-3 text-[10px] font-extrabold text-white"
                >
                  <Download className="mr-1.5 inline h-3.5 w-3.5" /> Exportar original
                </button>
              )}
              {health.hasBackup && (
                <button
                  type="button"
                  onClick={() => setConfirmation('restore')}
                  className="min-h-[40px] rounded-xl border border-gym-accent/25 bg-gym-accent/15 px-3 text-[10px] font-extrabold text-gym-accent"
                >
                  <RotateCcw className="mr-1.5 inline h-3.5 w-3.5" /> Restaurar backup
                </button>
              )}
              {blocked && (
                <button
                  type="button"
                  onClick={() => setConfirmation('fresh')}
                  className="min-h-[40px] rounded-xl border border-gym-rose/25 bg-gym-rose/10 px-3 text-[10px] font-extrabold text-gym-rose"
                >
                  <Sparkles className="mr-1.5 inline h-3.5 w-3.5" /> Iniciar dados novos
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>

      <ConfirmDialog
        isOpen={confirmation === 'restore'}
        title="Restaurar o último backup válido?"
        description="O estado atual será substituído somente depois de uma gravação e releitura verificadas. O conteúdo incompatível continuará na quarentena."
        confirmLabel="Restaurar backup"
        onConfirm={() => {
          setConfirmation(null);
          onRestoreBackup();
        }}
        onCancel={() => setConfirmation(null)}
      />
      <ConfirmDialog
        isOpen={confirmation === 'fresh'}
        variant="destructive"
        title="Iniciar dados novos neste aparelho?"
        description="O conteúdo atual será preservado na quarentena, mas o app passará a usar um novo estado padrão. Exporte o original antes se quiser analisá-lo depois."
        confirmLabel="Iniciar dados novos"
        onConfirm={() => {
          setConfirmation(null);
          onStartFresh();
        }}
        onCancel={() => setConfirmation(null)}
      />
    </>
  );
};
