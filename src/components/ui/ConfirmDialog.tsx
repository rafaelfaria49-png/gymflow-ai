'use client';

import React, { useEffect, useRef } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    confirmButtonRef.current?.focus();

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isDestructive = variant === 'destructive';

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? 'confirm-dialog-description' : undefined}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-sm bg-gym-card border border-white/10 rounded-3xl p-6 shadow-2xl animate-toast-in"
      >
        <div className="flex items-start gap-3 mb-2">
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center ${
              isDestructive ? 'bg-gym-rose/15 text-gym-rose' : 'bg-gym-accent/15 text-gym-accent'
            }`}
          >
            {isDestructive ? <AlertTriangle className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
          </div>
          <h2 id="confirm-dialog-title" className="text-base font-bold text-white pt-1.5 leading-tight">
            {title}
          </h2>
        </div>

        {description && (
          <p id="confirm-dialog-description" className="text-xs text-gym-text-muted leading-relaxed mb-6 pl-[52px]">
            {description}
          </p>
        )}

        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[44px] px-4 rounded-2xl text-xs font-extrabold bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            className={`flex-1 min-h-[44px] px-4 rounded-2xl text-xs font-extrabold transition-all ${
              isDestructive
                ? 'bg-gym-rose text-white hover:bg-gym-rose/90'
                : 'bg-gym-accent text-gym-dark hover:bg-gym-accent-hover'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
