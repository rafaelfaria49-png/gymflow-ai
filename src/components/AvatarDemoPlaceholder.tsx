'use client';

import React from 'react';
import { Box, Sparkles } from 'lucide-react';

interface AvatarDemoPlaceholderProps {
  /** Emoji do exercício (opcional) exibido como contexto. */
  emoji?: string;
  /** Título principal honesto. */
  title?: string;
  /** Linha de apoio. */
  subtitle?: string;
  /** Versão reduzida para thumbnails/cards pequenos. */
  compact?: boolean;
  className?: string;
}

/**
 * Placeholder HONESTO para a demonstração 3D do exercício.
 *
 * O avatar definitivo (Kai) e a Motion Engine ainda estão em produção no
 * Avatar Lab. Enquanto isso, NÃO exibimos boneco técnico / skeleton / wireframe
 * fingindo ser o avatar final. Este componente deixa o status claro e premium.
 *
 * Ver: labs/avatar-lab/ (frente de produção do avatar — não tocada por este app).
 */
export const AvatarDemoPlaceholder: React.FC<AvatarDemoPlaceholderProps> = ({
  emoji,
  title = 'Demonstração 3D em produção',
  subtitle = 'O avatar Kai e a Motion Engine serão integrados quando aprovados.',
  compact = false,
  className = '',
}) => {
  return (
    <div
      className={`relative w-full h-full overflow-hidden bg-gradient-to-br from-gym-card via-black to-zinc-900 flex flex-col items-center justify-center text-center select-none ${className}`}
    >
      {/* Subtle premium grid + glow */}
      <div
        className="absolute inset-0 opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-40 bg-gym-accent/10 rounded-full blur-3xl pointer-events-none" />

      {/* Status pill */}
      <span
        className={`relative z-10 inline-flex items-center gap-1.5 rounded-full border border-gym-accent/30 bg-gym-accent/10 font-black uppercase tracking-widest text-gym-accent ${
          compact ? 'px-2 py-0.5 text-[8px]' : 'px-3 py-1 text-[10px]'
        }`}
      >
        <Sparkles className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
        Em produção
      </span>

      {/* Icon / emoji */}
      <div
        className={`relative z-10 flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 ${
          compact ? 'w-9 h-9 my-1.5 text-lg' : 'w-14 h-14 my-3 text-2xl'
        }`}
      >
        {emoji ? <span>{emoji}</span> : <Box className={compact ? 'w-4 h-4 text-gym-accent' : 'w-6 h-6 text-gym-accent'} />}
      </div>

      {/* Texts */}
      <h4 className={`relative z-10 font-bold text-white ${compact ? 'text-[10px] px-2 leading-tight' : 'text-sm px-4'}`}>
        {title}
      </h4>
      {!compact && (
        <p className="relative z-10 mt-1 max-w-xs px-4 text-[10px] text-gym-text-muted leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
};
