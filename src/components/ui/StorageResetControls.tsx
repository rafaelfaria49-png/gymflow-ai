'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Eraser, Loader2 } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';

interface ResetPreview {
  sessionCount: number;
  customProgramCount: number;
  weightRecordCount: number;
  measurementRecordCount: number;
}

type ResetAvailability =
  | { status: 'available'; preview: ResetPreview }
  | { status: 'busy'; reason: string; message: string }
  | { status: 'error'; reason: string; message: string };

type ResetCommitResult =
  | { ok: true; requiresReload: true; message: string }
  | { ok: false; reason: string; requiresReload: boolean; message: string };

type ResetPhase =
  | { phase: 'loading' }
  | { phase: 'available'; preview: ResetPreview }
  | { phase: 'busy'; message: string }
  | { phase: 'error'; message: string }
  | { phase: 'confirming-first'; preview: ResetPreview }
  | { phase: 'confirming-final'; preview: ResetPreview }
  | { phase: 'resetting'; preview: ResetPreview };

export interface StorageResetControlsProps {
  storageMode: 'legacy-v1' | 'hybrid-v2' | 'blocked';
  inspectLogicalResetV2: () => Promise<ResetAvailability>;
  commitLogicalResetV2: () => Promise<ResetCommitResult>;
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

export function StorageResetControls({
  storageMode,
  inspectLogicalResetV2,
  commitLogicalResetV2,
}: StorageResetControlsProps) {
  const [phase, setPhase] = useState<ResetPhase>({ phase: 'loading' });
  const mountedRef = useRef(true);
  const inspectRequestRef = useRef(0);
  const commitInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyAvailability = useCallback((availability: ResetAvailability) => {
    if (availability.status === 'available') {
      setPhase({ phase: 'available', preview: availability.preview });
      return;
    }
    setPhase({ phase: availability.status, message: availability.message });
  }, []);

  useEffect(() => {
    if (storageMode !== 'hybrid-v2') return;
    const requestId = inspectRequestRef.current + 1;
    inspectRequestRef.current = requestId;
    let cancelled = false;
    void inspectLogicalResetV2()
      .then((availability) => {
        if (cancelled || !mountedRef.current || inspectRequestRef.current !== requestId) return;
        applyAvailability(availability);
      })
      .catch(() => {
        if (cancelled || !mountedRef.current || inspectRequestRef.current !== requestId) return;
        setPhase({
          phase: 'error',
          message: 'Não foi possível verificar os dados atuais.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [storageMode, inspectLogicalResetV2, applyAvailability]);

  const handleResetClick = useCallback(() => {
    if (phase.phase !== 'available') return;
    if (commitInFlightRef.current) return;
    setPhase({ phase: 'confirming-first', preview: phase.preview });
  }, [phase]);

  const handleCancelConfirm = useCallback(() => {
    if (phase.phase !== 'confirming-first' && phase.phase !== 'confirming-final') return;
    setPhase({ phase: 'available', preview: phase.preview });
  }, [phase]);

  const handleConfirmFirst = useCallback(() => {
    if (phase.phase !== 'confirming-first') return;
    if (commitInFlightRef.current) return;
    setPhase({ phase: 'confirming-final', preview: phase.preview });
  }, [phase]);

  const handleConfirmReset = useCallback(async () => {
    if (phase.phase !== 'confirming-final') return;
    if (commitInFlightRef.current) return;
    commitInFlightRef.current = true;
    setPhase({ phase: 'resetting', preview: phase.preview });
    try {
      const result = await commitLogicalResetV2();
      if (!mountedRef.current) return;
      if (result.ok) return;
      commitInFlightRef.current = false;
      setPhase({ phase: 'error', message: result.message });
    } catch {
      if (!mountedRef.current) return;
      commitInFlightRef.current = false;
      setPhase({
        phase: 'error',
        message: 'Não foi possível zerar os dados do GymFlow.',
      });
    }
  }, [phase, commitLogicalResetV2]);

  if (storageMode !== 'hybrid-v2') return null;

  const preview = 'preview' in phase ? phase.preview : null;
  const showDestructive = phase.phase === 'available'
    || phase.phase === 'confirming-first'
    || phase.phase === 'confirming-final'
    || phase.phase === 'resetting';
  const isResetting = phase.phase === 'resetting';
  const isConfirming = phase.phase === 'confirming-first' || phase.phase === 'confirming-final';

  return (
    <div className="space-y-3 rounded-2xl border border-gym-rose/20 bg-gym-rose/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gym-rose/15 text-gym-rose">
          {phase.phase === 'loading' || isResetting ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-white">
            {isResetting
              ? 'Zerando dados…'
              : phase.phase === 'loading'
                ? 'Verificando dados atuais…'
                : 'Zerar dados do GymFlow'}
          </h4>
          {(phase.phase === 'available' || isConfirming) && (
            <p className="mt-1 text-[11px] leading-relaxed text-gym-text-muted">
              Treinos, programas, histórico, peso, medidas e perfil atual serão
              zerados. O aplicativo será recarregado. O reset não apaga
              fisicamente de imediato o mundo anterior; o painel poderá oferecer
              a restauração do predecessor verificável. Isso não garante
              histórico ilimitado nem recuperação eterna.
            </p>
          )}
          {(phase.phase === 'busy' || phase.phase === 'error') && (
            <p className="mt-1 text-[11px] leading-relaxed text-gym-text-muted">
              {phase.message}
            </p>
          )}
          {isResetting && (
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
          onClick={handleResetClick}
          disabled={isResetting || isConfirming}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-2xl border border-gym-rose/25 bg-gym-rose/15 px-3 text-xs font-extrabold text-gym-rose enabled:hover:bg-gym-rose/25 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Zerar dados do GymFlow"
        >
          {isResetting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Eraser className="h-4 w-4" aria-hidden="true" />
          )}
          {isResetting ? 'Zerando dados…' : 'Zerar dados do GymFlow'}
        </button>
      )}

      <ConfirmDialog
        isOpen={phase.phase === 'confirming-first'}
        variant="destructive"
        title="Zerar todos os dados"
        description="Treinos, programas, histórico, peso, medidas e perfil atual serão zerados. O aplicativo será recarregado. Os dados atuais serão substituídos por um estado vazio do GymFlow."
        confirmLabel="Zerar todos os dados"
        cancelLabel="Cancelar"
        onConfirm={handleConfirmFirst}
        onCancel={handleCancelConfirm}
      />
      <ConfirmDialog
        isOpen={phase.phase === 'confirming-final'}
        variant="destructive"
        title="Confirmar e zerar"
        description="Os dados atuais serão substituídos por um estado vazio do GymFlow. O aplicativo será recarregado."
        confirmLabel="Confirmar e zerar"
        cancelLabel="Cancelar"
        onConfirm={() => { void handleConfirmReset(); }}
        onCancel={handleCancelConfirm}
      />
    </div>
  );
}
