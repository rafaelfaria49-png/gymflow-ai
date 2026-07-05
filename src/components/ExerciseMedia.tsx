'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { AvatarDemoPlaceholder } from './AvatarDemoPlaceholder';

interface ExerciseMediaProps {
  /** Caminhos locais das imagens do exercício (GOAL-09: /assets/exercises/<id>/N.jpg). */
  images?: string[];
  /** Nome do exercício (alt das imagens). */
  name: string;
  /** Emoji de contexto usado no fallback honesto. */
  emoji?: string;
  /** Alterna entre as 2 imagens com crossfade simples. */
  crossfade?: boolean;
  /** Selo discreto "Demonstração 3D em breve" sobre a imagem. */
  showBadge?: boolean;
  /** Versão reduzida do fallback para cards pequenos. */
  compact?: boolean;
  /**
   * GOAL-11: 'cover' preenche o container cortando as bordas (as fotos são 3:2 com
   * o atleta centralizado — corte leve e seguro em containers 16:9); 'contain'
   * preserva a foto inteira com letterbox (usar quando a fidelidade importa).
   */
  fit?: 'cover' | 'contain';
  className?: string;
}

const CROSSFADE_INTERVAL_MS = 3000;

/**
 * Mídia do exercício (GOAL-09): mostra as fotos reais da biblioteca quando
 * existem, com crossfade opcional entre as 2 poses. Se não houver imagem (ou
 * ela falhar ao carregar), cai no AvatarDemoPlaceholder — fallback HONESTO,
 * sem fingir que o avatar Kai/Motion Engine está pronto.
 */
export const ExerciseMedia: React.FC<ExerciseMediaProps> = ({
  images,
  name,
  emoji,
  crossfade = false,
  showBadge = false,
  compact = false,
  fit = 'contain',
  className = '',
}) => {
  const [failedSrcs, setFailedSrcs] = useState<string[]>([]);
  const [loadedSrcs, setLoadedSrcs] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);

  const usable = useMemo(
    () => (images ?? []).filter((src) => !failedSrcs.includes(src)),
    [images, failedSrcs]
  );

  useEffect(() => {
    if (!crossfade || usable.length < 2) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % usable.length);
    }, CROSSFADE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [crossfade, usable.length]);

  if (usable.length === 0) {
    return (
      <AvatarDemoPlaceholder
        compact={compact}
        emoji={emoji}
        title="Demonstração 3D em produção"
        className={className}
      />
    );
  }

  const activeIndex = current % usable.length;
  // Skeleton simples (GOAL-11): pulso discreto até a primeira foto carregar.
  const anyLoaded = usable.some((src) => loadedSrcs.includes(src));

  return (
    <div className={`relative w-full h-full overflow-hidden bg-gym-dark select-none ${anyLoaded ? '' : 'animate-pulse bg-white/5'} ${className}`}>
      {usable.map((src, idx) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={idx === 0 ? `Execução de ${name}` : `Execução de ${name} (pose ${idx + 1})`}
          loading="lazy"
          onLoad={() => setLoadedSrcs((prev) => (prev.includes(src) ? prev : [...prev, src]))}
          onError={() => setFailedSrcs((prev) => (prev.includes(src) ? prev : [...prev, src]))}
          className={`absolute inset-0 w-full h-full ${fit === 'cover' ? 'object-cover' : 'object-contain'} transition-opacity duration-700 ${
            idx === activeIndex ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}

      {showBadge && (
        <span className="absolute bottom-1.5 right-1.5 z-10 inline-flex items-center gap-1 rounded-full border border-black/10 bg-black/60 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-gym-accent backdrop-blur-sm">
          <Sparkles className="w-2.5 h-2.5" />
          Demonstração 3D em breve
        </span>
      )}
    </div>
  );
};
