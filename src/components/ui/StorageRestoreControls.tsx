'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';

interface RestorePreview {
  sessionCount: number;
  customProgramCount: number;
  weightRecordCount: number;
  measurementRecordCount: number;
}

type RestoreAvailability =
  | { status: 'unavailable' }
  | { status: 'available'; preview: RestorePreview }
  | { status: 'ambiguous' }
  | { status: 'busy'; reason: string; message: string }
  | { status: 'error'; reason: string; message: string };

type RestoreCommitResult =
  | { ok: true; requiresReload: true; message: string }
  | { ok: false; reason: string; requiresReload: boolean; message: string };

type RestorePhase =
  | { phase: 'loading' }
  | { phase: 'unavailable' }
  | { phase: 'available'; preview: RestorePreview }
  | { phase: 'ambiguous' }
  | { phase: 'busy'; message: string }
  | { phase: 'error'; message: string }
  | { phase: 'confirming'; preview: RestorePreview }
  | { phase: 'restoring'; preview: RestorePreview };

export interface StorageRestoreControlsProps {
  storageMode: 'legacy-v1' | 'hybrid-v2' | 'blocked';
  inspectLogicalRestoreV2: () => Promise<RestoreAvailability>;
  commitLogicalRestoreV2: () => Promise<RestoreCommitResult>;
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gym-text-muted">
        {label}
      </span>
      <span className="text-[11px] font-extrabold text-white">{value}</span>
    </div>
  );
}

export function StorageRestoreControls({
  storageMode,
  inspectLogicalRestoreV2,
  commitLogicalRestoreV2,
}: StorageRestoreControlsProps) {
  const [phase, setPhase] = useState<RestorePhase>({ phase: 'loading' });
  const mountedRef = useRef(true);
  const inspectRequestRef = useRef(0);
  const commitInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyAvailability = useCallback((availability: RestoreAvailability) => {
    if (availability.status === 'available') {
      setPhase({ phase: 'available', preview: availability.preview });
      return;
    }
    if (availability.status === 'unavailable') {
      setPhase({ phase: 'unavailable' });
      return;
    }
    if (availability.status === 'ambiguous') {
      setPhase({ phase: 'ambiguous' });
      return;
    }
    setPhase({ phase: availability.status, message: availability.message });
  }, []);

  useEffect(() => {
    if (storageMode !== 'hybrid-v2') return;
    const requestId = inspectRequestRef.current + 1;
    inspectRequestRef.current = requestId;
    let cancelled = false;
    void inspectLogicalRestoreV2()
      .then((availability) => {
        if (cancelled || !mountedRef.current || inspectRequestRef.current !== requestId) return;
        applyAvailability(availability);
      })
      .catch(() => {
        if (cancelled || !mountedRef.current || inspectRequestRef.current !== requestId) return;
        setPhase({
          phase: 'error',
          message: 'Não foi possível verificar o backup anterior.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [storageMode, inspectLogicalRestoreV2, applyAvailability]);

  const handleRestoreClick = useCallback(() => {
    if (phase.phase !== 'available') return;
    if (commitInFlightRef.current) return;
    setPhase({ phase: 'confirming', preview: phase.preview });
  }, [phase]);

  const handleCancelConfirm = useCallback(() => {
    if (phase.phase !== 'confirming') return;
    setPhase({ phase: 'available', preview: phase.preview });
  }, [phase]);

  const handleConfirmRestore = useCallback(async () => {
    if (phase.phase !== 'confirming') return;
    if (commitInFlightRef.current) return;
    commitInFlightRef.current = true;
    setPhase({ phase: 'restoring', preview: phase.preview });
    try {
      const result = await commitLogicalRestoreV2();
      if (!mountedRef.current) return;
      if (result.ok) return;
      commitInFlightRef.current = false;
      if (result.reason === 'restore-unavailable') {
        setPhase({ phase: 'unavailable' });
        return;
      }
      if (result.reason === 'restore-ambiguous') {
        setPhase({ phase: 'ambiguous' });
        return;
      }
      setPhase({ phase: 'error', message: result.message });
    } catch {
      if (!mountedRef.current) return;
      commitInFlightRef.current = false;
      setPhase({
        phase: 'error',
        message: 'Não foi possível restaurar o backup anterior.',
      });
    }
  }, [phase, commitLogicalRestoreV2]);

  if (storageMode !== 'hybrid-v2') return null;

  const preview = 'preview' in phase ? phase.preview : null;
  const showDestructive = phase.phase === 'available'
    || phase.phase === 'confirming'
    || phase.phase === 'restoring';
  const isRestoring = phase.phase === 'restoring';

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gym-accent/15 text-gym-accent">
          {phase.phase === 'loading' || isRestoring ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : phase.phase === 'available' || phase.phase === 'confirming' ? (
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-white">
            {phase.phase === 'available' || phase.phase === 'confirming'
              ? 'Backup anterior verificável'
              : phase.phase === 'restoring'
                ? 'Restaurando backup…'
                : phase.phase === 'loading'
                  ? 'Verificando backup anterior…'
                  : 'Backup anterior'}
          </h4>
          {phase.phase === 'unavailable' && (
            <p className="mt-1 text-[11px] leading-relaxed text-gym-text-muted">
              Nenhum backup anterior verificável disponível.
            </p>
          )}
          {phase.phase === 'ambiguous' && (
            <p className="mt-1 text-[11px] leading-relaxed text-gym-text-muted">
              Não foi possível determinar com segurança um único backup anterior.
            </p>
          )}
          {(phase.phase === 'busy' || phase.phase === 'error') && (
            <p className="mt-1 text-[11px] leading-relaxed text-gym-text-muted">
              {phase.message}
            </p>
          )}
          {phase.phase === 'restoring' && (
            <p className="mt-1 text-[11px] font-bold leading-relaxed text-yellow-300/80">
              Não feche esta aba.
            </p>
          )}
        </div>
      </div>

      {preview && (
        <div className="space-y-2">
          <PreviewRow label="Sessões de treino" value={String(preview.sessionCount)} />
          <PreviewRow
            label="Programas personalizados"
            value={String(preview.customProgramCount)}
          />
          <PreviewRow label="Registros de peso" value={String(preview.weightRecordCount)} />
          <PreviewRow
            label="Registros de medidas"
            value={String(preview.measurementRecordCount)}
          />
        </div>
      )}

      {showDestructive && (
        <button
          type="button"
          onClick={handleRestoreClick}
          disabled={isRestoring || phase.phase === 'confirming'}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-2xl border border-gym-rose/25 bg-gym-rose/15 px-3 text-xs font-extrabold text-gym-rose enabled:hover:bg-gym-rose/25 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Restaurar backup anterior"
        >
          {isRestoring ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          )}
          {isRestoring ? 'Restaurando backup…' : 'Restaurar backup anterior'}
        </button>
      )}

      <ConfirmDialog
        isOpen={phase.phase === 'confirming'}
        variant="destructive"
        title="Restaurar backup anterior?"
        description="Os dados atuais serão substituídos pelo backup anterior verificado. O aplicativo será recarregado ao concluir."
        confirmLabel="Restaurar backup anterior"
        cancelLabel="Cancelar"
        onConfirm={() => { void handleConfirmRestore(); }}
        onCancel={handleCancelConfirm}
      />
    </div>
  );
}
