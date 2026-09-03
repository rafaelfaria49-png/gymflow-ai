'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import { Exercise } from '../types';
import { ExerciseMedia } from '../domain/media/types';
import { getExerciseMedia } from '../domain/media/manifest';
import { resolveMediaRenderTier } from '../domain/media/fallbackChain';
import { isMediaCached, getMediaPlayableUrl } from '../domain/media/mediaCache';
import { recordMediaTelemetryEvent } from '../domain/media/telemetry';
import { AvatarDemoPlaceholder } from './AvatarDemoPlaceholder';

interface ExerciseMediaUnifiedPlayerProps {
  exercise?: Exercise | null;
  media?: ExerciseMedia | null;
  name?: string;
  emoji?: string;
  autoplay?: boolean;
  fit?: 'cover' | 'contain';
  compact?: boolean;
  className?: string;
}

export const ExerciseMediaUnifiedPlayer: React.FC<ExerciseMediaUnifiedPlayerProps> = ({
  exercise,
  media,
  name,
  emoji,
  autoplay = true,
  fit = 'contain',
  compact = false,
  className = '',
}) => {
  const exerciseName = name || exercise?.name || 'Exercício';
  const exerciseId = exercise?.id || media?.exerciseId || '';

  // Resolução da mídia via prop direta ou manifest
  const resolvedMedia = useMemo(() => {
    if (media) return media;
    if (exerciseId) return getExerciseMedia(exerciseId);
    return null;
  }, [media, exerciseId]);

  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const [cachedUrls, setCachedUrls] = useState<Set<string>>(new Set());
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  // Estados do player de vídeo
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoPlayableUrl, setVideoPlayableUrl] = useState<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(autoplay);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Estados do player de frames (fallback Tier 2)
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [isFramesPlaying, setIsFramesPlaying] = useState(autoplay);

  // Monitora conectividade de rede (modo avião)
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Verifica se o vídeo está em cache offline
  useEffect(() => {
    let isSubscribed = true;
    if (resolvedMedia?.video?.url) {
      const videoAsset = resolvedMedia.video;
      const url = videoAsset.url;
      isMediaCached(videoAsset).then((cached) => {
        if (!isSubscribed) return;
        if (cached) {
          setCachedUrls((prev) => new Set(prev).add(url));
          getMediaPlayableUrl(videoAsset).then((playableUrl) => {
            if (isSubscribed) setVideoPlayableUrl(playableUrl);
          });
        } else {
          setVideoPlayableUrl(url);
        }
      });
    }
    return () => {
      isSubscribed = false;
    };
  }, [resolvedMedia]);

  // Resolução do tier de renderização ativo
  const tierResult = useMemo(() => {
    return resolveMediaRenderTier(resolvedMedia, {
      failedUrls,
      cachedUrls,
      isOffline,
      legacyFrames: exercise?.techniqueFrames,
    });
  }, [resolvedMedia, failedUrls, cachedUrls, isOffline, exercise?.techniqueFrames]);

  // Registro de telemetria
  useEffect(() => {
    if (!exerciseId) return;
    if (tierResult.tier === 'video') {
      recordMediaTelemetryEvent(exerciseId, 'video_play');
    } else if (tierResult.tier === 'frames') {
      recordMediaTelemetryEvent(exerciseId, 'fallback_frames');
    } else if (tierResult.tier === 'thumbnail') {
      recordMediaTelemetryEvent(exerciseId, 'fallback_image');
    }
  }, [tierResult.tier, exerciseId]);

  // Ciclo automático do player de frames (Tier 2)
  const framesCount = tierResult.frames.length;
  useEffect(() => {
    if (tierResult.tier !== 'frames' || !isFramesPlaying || framesCount < 2) return;
    const interval = setInterval(() => {
      setActiveFrameIndex((prev) => (prev + 1) % framesCount);
    }, 1300);
    return () => clearInterval(interval);
  }, [tierResult.tier, isFramesPlaying, framesCount]);

  // Handler de erro no vídeo -> desvia imediatamente para fallback
  const handleVideoError = (failedUrl: string) => {
    setFailedUrls((prev) => (prev.includes(failedUrl) ? prev : [...prev, failedUrl]));
  };

  // Toggle de fullscreen do container
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Toggle play/pause de vídeo
  const toggleVideoPlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsVideoPlaying(true);
    } else {
      videoRef.current.pause();
      setIsVideoPlaying(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden bg-gym-dark text-white ${className}`}
    >
      {/* ÁREA DE VISUALIZAÇÃO PRINCIPAL */}
      <div
        className={`relative w-full overflow-hidden bg-black flex items-center justify-center ${
          compact ? 'aspect-video' : 'aspect-[9/16] max-h-[460px] sm:max-h-[520px]'
        }`}
      >
        {/* BADGES NO TOPO */}
        <div className="absolute left-2.5 top-2.5 z-20 flex flex-wrap items-center gap-1.5">
          {tierResult.tier === 'video' ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-gym-accent/30 bg-black/75 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-gym-accent backdrop-blur-md">
              <Sparkles className="h-3 w-3 text-gym-accent" />
              {tierResult.badgeLabel}
            </span>
          ) : tierResult.tier === 'frames' ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-black/75 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-400 backdrop-blur-md">
              <Sparkles className="h-3 w-3" />
              {tierResult.badgeLabel}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/75 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-gym-text-muted backdrop-blur-md">
              {tierResult.badgeLabel}
            </span>
          )}

          {isOffline && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/80 px-2 py-0.5 text-[9px] font-bold text-gym-text-muted backdrop-blur-sm">
              <WifiOff className="h-2.5 w-2.5 text-amber-400" />
              Offline
            </span>
          )}
        </div>

        {/* TIER 1: VÍDEO TÉCNICO V2 */}
        {tierResult.tier === 'video' && tierResult.videoAsset && (
          <div className="relative h-full w-full flex items-center justify-center bg-black">
            <video
              ref={videoRef}
              src={videoPlayableUrl || tierResult.videoAsset.url}
              playsInline
              loop
              autoPlay={autoplay}
              muted={isMuted}
              preload="metadata"
              onError={() => handleVideoError(tierResult.videoAsset!.url)}
              onPlay={() => setIsVideoPlaying(true)}
              onPause={() => setIsVideoPlaying(false)}
              className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
            />

            {/* CONTROLES FLUTUANTES SOBRE O VÍDEO */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity flex flex-col justify-end p-3 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleVideoPlay}
                    aria-label={isVideoPlaying ? 'Pausar vídeo' : 'Reproduzir vídeo'}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/70 text-white hover:text-gym-accent border border-white/15 backdrop-blur-md transition-all"
                  >
                    {isVideoPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMuted((prev) => !prev)}
                    aria-label={isMuted ? 'Ativar áudio' : 'Mutar áudio'}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/70 text-white hover:text-gym-accent border border-white/15 backdrop-blur-md transition-all"
                  >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/70 text-white hover:text-gym-accent border border-white/15 backdrop-blur-md transition-all"
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TIER 2: SEQUÊNCIA DE FRAMES */}
        {tierResult.tier === 'frames' && (
          <div className="relative h-full w-full flex items-center justify-center bg-black">
            {tierResult.frames[activeFrameIndex] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={tierResult.frames[activeFrameIndex].url}
                src={tierResult.frames[activeFrameIndex].url}
                alt={`${exerciseName} - Etapa ${activeFrameIndex + 1}`}
                loading="lazy"
                onError={() => handleVideoError(tierResult.frames[activeFrameIndex].url)}
                className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
              />
            ) : (
              <AvatarDemoPlaceholder
                compact={compact}
                emoji={emoji}
                title="Demonstração em breve"
                subtitle="Sequência visual não disponível."
              />
            )}

            {/* CONTADOR DE ETAPAS */}
            <span className="absolute right-2.5 top-2.5 z-20 rounded-full border border-white/10 bg-black/75 px-2.5 py-1 text-[10px] font-black text-white backdrop-blur-md">
              {activeFrameIndex + 1}/{framesCount}
            </span>
          </div>
        )}

        {/* TIER 3: THUMBNAIL ESTÁTICA */}
        {tierResult.tier === 'thumbnail' && tierResult.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tierResult.thumbnailUrl}
            alt={exerciseName}
            loading="lazy"
            onError={() => handleVideoError(tierResult.thumbnailUrl!)}
            className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
          />
        )}

        {/* TIER 4: PLACEHOLDER HONESTO */}
        {tierResult.tier === 'placeholder' && (
          <AvatarDemoPlaceholder
            compact={compact}
            emoji={emoji}
            title="Demonstração 3D em breve"
            subtitle="O avatar Kai e as gravações do Coach seguem em produção com padrão 9:16 vertical."
          />
        )}
      </div>

      {/* CONTROLES INFERIORES QUANDO EM TIER DE FRAMES */}
      {tierResult.tier === 'frames' && framesCount > 1 && (
        <div className="flex items-center justify-between border-t border-white/5 bg-gym-card/40 p-2.5 px-3">
          <span className="text-[11px] font-bold text-gym-text-muted truncate max-w-[200px]">
            {tierResult.frames[activeFrameIndex]?.label || `Etapa ${activeFrameIndex + 1}`}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveFrameIndex((prev) => (prev - 1 + framesCount) % framesCount)}
              aria-label="Etapa anterior"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white hover:text-gym-accent"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsFramesPlaying((prev) => !prev)}
              aria-label={isFramesPlaying ? 'Pausar' : 'Reproduzir'}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white hover:text-gym-accent"
            >
              {isFramesPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            </button>
            <button
              type="button"
              onClick={() => setActiveFrameIndex((prev) => (prev + 1) % framesCount)}
              aria-label="Próxima etapa"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white hover:text-gym-accent"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
