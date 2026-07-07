'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw, SkipBack, SkipForward, Sparkles } from 'lucide-react';
import { Exercise, TechniqueFrame } from '../types';
import { getTechniqueFrames } from '../lib/techniqueFrames';
import { AvatarDemoPlaceholder } from './AvatarDemoPlaceholder';

interface TechniqueSequencePlayerProps {
  exercise?: Exercise | null;
  frames?: TechniqueFrame[];
  name?: string;
  emoji?: string;
  autoplay?: boolean;
  intervalMs?: number;
  fit?: 'cover' | 'contain';
  compact?: boolean;
  className?: string;
}

const clampInterval = (intervalMs: number) => Math.min(1500, Math.max(1100, intervalMs));

const normalizeFrames = (frames: TechniqueFrame[]) =>
  frames
    .map((frame, index) => ({
      image: frame.image?.trim() ?? '',
      label: frame.label?.trim() || `Etapa ${index + 1}`,
      cue: frame.cue?.trim() || 'Use esta etapa como referência técnica provisória.',
      order: Number.isFinite(frame.order) ? frame.order : index + 1
    }))
    .sort((a, b) => a.order - b.order)
    .map((frame, index) => ({ ...frame, order: index + 1 }));

export const TechniqueSequencePlayer: React.FC<TechniqueSequencePlayerProps> = ({
  exercise,
  frames,
  name,
  emoji,
  autoplay = true,
  intervalMs = 1300,
  fit = 'contain',
  compact = false,
  className = ''
}) => {
  const resolvedFrames = useMemo(() => {
    if (frames && frames.length > 0) return normalizeFrames(frames);
    return getTechniqueFrames(exercise);
  }, [exercise, frames]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoplay && resolvedFrames.length > 1);
  const [failedSrcs, setFailedSrcs] = useState<string[]>([]);

  const delay = clampInterval(intervalMs);
  const activeFrame = resolvedFrames[activeIndex] ?? resolvedFrames[0];
  const exerciseName = name || exercise?.name || 'Exercício';
  const hasImage = !!activeFrame?.image && !failedSrcs.includes(activeFrame.image);
  const canNavigate = resolvedFrames.length > 1;

  useEffect(() => {
    setActiveIndex(0);
    setFailedSrcs([]);
    setIsPlaying(autoplay && resolvedFrames.length > 1);
  }, [autoplay, resolvedFrames]);

  useEffect(() => {
    if (!isPlaying || resolvedFrames.length < 2) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % resolvedFrames.length);
    }, delay);
    return () => clearInterval(timer);
  }, [delay, isPlaying, resolvedFrames.length]);

  const goTo = (index: number) => {
    if (resolvedFrames.length === 0) return;
    setActiveIndex((index + resolvedFrames.length) % resolvedFrames.length);
  };

  const restart = () => {
    setActiveIndex(0);
    setIsPlaying(autoplay && resolvedFrames.length > 1);
  };

  return (
    <div className={`relative w-full overflow-hidden bg-gym-dark text-white ${className}`}>
      <div className={`relative w-full overflow-hidden bg-black ${compact ? 'aspect-video' : 'aspect-[3/2]'}`}>
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={activeFrame.image}
            src={activeFrame.image}
            alt={`${exerciseName} - ${activeFrame.label}`}
            loading="lazy"
            onError={() => setFailedSrcs((prev) => (prev.includes(activeFrame.image) ? prev : [...prev, activeFrame.image]))}
            className={`absolute inset-0 h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'} transition-opacity duration-300`}
          />
        ) : (
          <AvatarDemoPlaceholder
            compact={compact}
            emoji={emoji}
            title="Demonstração 3D em breve"
            subtitle="Ainda sem sequência visual real para esta etapa. O fallback atual segue honesto e provisório."
          />
        )}

        <div className="absolute left-2 top-2 z-10 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-gym-accent/25 bg-black/65 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-gym-accent backdrop-blur-sm">
            <Sparkles className="h-3 w-3" />
            Sequência visual provisória
          </span>
        </div>

        <span className="absolute right-2 top-2 z-10 rounded-full border border-white/10 bg-black/65 px-2.5 py-1 text-[10px] font-black text-white backdrop-blur-sm">
          {activeIndex + 1}/{resolvedFrames.length}
        </span>
      </div>

      <div className="space-y-3 border-t border-white/5 bg-gym-card/40 p-3">
        <div className="min-h-[58px]" aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-sm font-black leading-tight text-white">{activeFrame?.label ?? 'Referência técnica'}</h4>
              <p className="mt-1 text-[11px] font-medium leading-relaxed text-gym-text-muted">
                {activeFrame?.cue ?? 'Use esta etapa como referência técnica provisória.'}
              </p>
              <span className="mt-2 inline-flex rounded-full border border-gym-accent/20 bg-gym-accent/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-gym-accent">
                Demonstração 3D em breve
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => goTo(activeIndex - 1)}
              disabled={!canNavigate}
              aria-label="Etapa anterior"
              title="Etapa anterior"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition-all hover:border-gym-accent/30 hover:text-gym-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsPlaying((prev) => !prev)}
              disabled={!canNavigate}
              aria-label={isPlaying ? 'Pausar sequência' : 'Reproduzir sequência'}
              title={isPlaying ? 'Pausar' : 'Reproduzir'}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-gym-accent text-gym-dark shadow-md shadow-gym-accent/15 transition-all hover:bg-gym-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPlaying ? <Pause className="h-4 w-4 fill-gym-dark" /> : <Play className="h-4 w-4 fill-gym-dark" />}
            </button>
            <button
              type="button"
              onClick={() => goTo(activeIndex + 1)}
              disabled={!canNavigate}
              aria-label="Próxima etapa"
              title="Próxima etapa"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition-all hover:border-gym-accent/30 hover:text-gym-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SkipForward className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={restart}
              aria-label="Repetir sequência"
              title="Repetir"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition-all hover:border-gym-accent/30 hover:text-gym-accent"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="flex max-w-[45%] items-center justify-end gap-0.5 overflow-x-auto">
            {resolvedFrames.map((frame, index) => (
              <button
                key={`${frame.image}-${frame.order}`}
                type="button"
                onClick={() => goTo(index)}
                aria-label={`Ir para etapa ${index + 1}: ${frame.label}`}
                title={frame.label}
                className="flex h-11 w-8 shrink-0 items-center justify-center"
              >
                <span
                  className={`h-2.5 rounded-full transition-all ${
                    index === activeIndex ? 'w-6 bg-gym-accent' : 'w-2.5 bg-white/25 hover:bg-white/45'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {!compact && (
          <p className="border-t border-white/5 pt-2 text-[10px] font-medium leading-relaxed text-gym-text-muted">
            Use como referência técnica, não substitui orientação profissional.
          </p>
        )}
      </div>
    </div>
  );
};
