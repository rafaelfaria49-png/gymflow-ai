'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

export interface WorkoutProgramMenuItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  destructive?: boolean;
}

interface WorkoutProgramMenuProps {
  /** Rótulo acessível do gatilho (ex.: "Ações de Meu ABCD"). */
  label: string;
  items: WorkoutProgramMenuItem[];
}

/**
 * GOAL-19B/PART-10+15: menu contextual acessível para os cards de programa.
 *
 * Fecha por Escape, por clique fora e ao selecionar uma ação; devolve o foco ao gatilho;
 * navega por setas. Abre para cima (o card fica na grade e a bottom-nav mobile ocupa o
 * rodapé), evitando que o menu seja cortado.
 */
export const WorkoutProgramMenu = ({ label, items }: WorkoutProgramMenuProps) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const focusables = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
        if (focusables.length === 0) return;
        const currentIndex = focusables.findIndex((element) => element === document.activeElement);
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = (currentIndex + delta + focusables.length) % focusables.length;
        focusables[nextIndex]?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    // Foco no primeiro item ao abrir (PART 15).
    itemRefs.current[0]?.focus();
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gym-text-muted hover:text-white transition-all tap-target flex items-center justify-center"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 bottom-full mb-2 z-30 min-w-[176px] bg-gym-card border border-white/10 rounded-2xl shadow-2xl p-1.5 animate-toast-in"
        >
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                role="menuitem"
                type="button"
                onClick={() => {
                  close(false);
                  item.onClick();
                }}
                className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  item.destructive
                    ? 'text-gym-rose hover:bg-gym-rose/10'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
