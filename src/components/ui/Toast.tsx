'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  leaving: boolean;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE_TOASTS = 3;
const AUTO_DISMISS_MS = 3500;
const LEAVE_ANIMATION_MS = 200;

const ICONS: Record<ToastType, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const ACCENT_CLASSES: Record<ToastType, string> = {
  success: 'border-gym-emerald/30 text-gym-emerald',
  error: 'border-gym-rose/30 text-gym-rose',
  info: 'border-gym-accent/30 text-gym-accent',
};

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, LEAVE_ANIMATION_MS);
  }, []);

  const push = useCallback((type: ToastType, message: string) => {
    const id = ++idRef.current;
    setToasts((prev) => {
      const next = [...prev, { id, type, message, leaving: false }];
      // Fila máxima de 3 toasts visíveis: descarta os mais antigos além do limite.
      return next.slice(-MAX_VISIBLE_TOASTS);
    });
    const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    timersRef.current.set(id, timer);
  }, [dismiss]);

  const value: ToastContextValue = {
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
    info: (message: string) => push('info', message),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast deve ser usado dentro de <ToastProvider>');
  }
  return ctx;
};

const ToastViewport = ({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-[100] inset-x-0 flex flex-col items-center gap-2 px-4 pointer-events-none
        top-[calc(0.75rem+env(safe-area-inset-top))]
        md:inset-x-auto md:items-end md:right-4 md:px-0
        md:bottom-[calc(6.5rem+env(safe-area-inset-bottom))]
        lg:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className={`pointer-events-auto w-full max-w-sm md:w-96 flex items-start gap-2.5 bg-gym-card/95 backdrop-blur-xl border ${ACCENT_CLASSES[t.type]} rounded-2xl shadow-2xl px-4 py-3 transition-all duration-200 ease-out ${
              t.leaving ? 'opacity-0 -translate-y-2 scale-95' : 'opacity-100 translate-y-0 scale-100 animate-toast-in'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="flex-1 text-xs font-semibold text-white leading-snug">{t.message}</p>
            <button
              onClick={() => onDismiss(t.id)}
              className="flex-shrink-0 text-gym-text-muted hover:text-white p-1 -m-1 rounded-lg"
              aria-label="Fechar notificação"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
