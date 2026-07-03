'use client';

/**
 * GymFlow AI — Pipeline 3D (POC) · Stage
 * -------------------------------------------------------------------------
 * Orquestrador do viewer 3D. Responsabilidades:
 *  1. Carregar o <Canvas> WebGL APENAS no cliente (`next/dynamic` + ssr:false),
 *     porque WebGL não pode ser pré-renderizado no servidor (regra do Next 16:
 *     ssr:false só é permitido dentro de Client Components).
 *  2. Expor uma API de props compatível com o antigo BiomechanicalVisualizer,
 *     para um futuro "drop-in" sem refatorar quem consome.
 *  3. Quando NÃO há asset .glb real, mostrar um placeholder PREMIUM e HONESTO
 *     ("Adicione um arquivo .glb em public/assets/avatars") — sem chamar de
 *     "3D realista". O palco 3D real continua visível por baixo (objeto primitivo).
 *
 * IMPORTANTE: este componente é isolado. Ele NÃO importa nem altera o contexto
 * do app (planejador, treinos, IA Coach, etc.). É a base para substituir o
 * canvas/skeleton quando os avatares reais forem adicionados.
 */

import React, { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Sparkles, ShieldAlert, MousePointer2 } from 'lucide-react';
import {
  AvatarGender,
  getAvatar,
  getAnimation,
  resolveAnimationId,
} from './avatar-config';
import type { ViewerStatus } from './GymFlowAvatarViewer';

/** O Canvas WebGL só é importado no cliente. */
const GymFlowAvatarViewer = dynamic(() => import('./GymFlowAvatarViewer'), {
  ssr: false,
  loading: () => <StageSpinner label="Inicializando engine 3D…" />,
});

export interface GymFlowAvatarStageProps {
  /** ID do exercício (ou do vídeo) — resolve a animação via avatar-config. */
  exerciseId: string;
  gender?: AvatarGender;
  isPlaying?: boolean;
  playbackSpeed?: number;
  autoRotate?: boolean;
  /** Aceitos por paridade de API com o BiomechanicalVisualizer (layout é responsivo). */
  width?: number;
  height?: number;
  className?: string;
  /** Mostra a legenda de controles (arrastar/zoom). Default: true. */
  showHint?: boolean;
}

function StageSpinner({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0b0b0f]">
      <div className="w-8 h-8 rounded-full border-2 border-gym-accent/30 border-t-gym-accent animate-spin" />
      <span className="text-[10px] uppercase tracking-widest font-black text-gym-accent font-mono animate-pulse">
        {label}
      </span>
    </div>
  );
}

export const GymFlowAvatarStage: React.FC<GymFlowAvatarStageProps> = ({
  exerciseId,
  gender = 'neutral',
  isPlaying = true,
  playbackSpeed = 1,
  autoRotate = false,
  width,
  height,
  className = '',
  showHint = true,
}) => {
  const [status, setStatus] = useState<ViewerStatus>('loading');

  const handleStatus = useCallback((s: ViewerStatus) => setStatus(s), []);

  const avatar = getAvatar(gender);
  const animDef = getAnimation(resolveAnimationId(exerciseId));
  const isPlaceholder = status === 'placeholder' || status === 'error';

  const style = width || height
    ? { width: width ? `${width}px` : undefined, height: height ? `${height}px` : undefined }
    : undefined;

  return (
    <div
      className={`relative w-full h-full min-h-[220px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f] ${className}`}
      style={style}
    >
      <GymFlowAvatarViewer
        gender={gender}
        exerciseId={exerciseId}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        autoRotate={autoRotate}
        onStatusChange={handleStatus}
      />

      {/* Chip de status (sempre honesto) */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 select-none">
        <span
          className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border backdrop-blur-md ${
            status === 'model'
              ? 'bg-gym-accent/15 border-gym-accent/30 text-gym-accent'
              : 'bg-white/5 border-white/10 text-gym-text-muted'
          }`}
        >
          {status === 'model'
            ? `Avatar 3D • ${avatar.label}`
            : 'Palco 3D • Pré-visualização'}
        </span>
        {animDef && (
          <span className="hidden sm:inline text-[9px] font-bold text-gym-text-muted bg-black/40 border border-white/5 px-2 py-1 rounded-lg backdrop-blur-md">
            {animDef.label}
          </span>
        )}
      </div>

      {/* Dica de controles */}
      {showHint && (
        <div className="absolute top-3 right-3 z-10 hidden md:flex items-center gap-1 text-[9px] font-bold text-gym-text-muted bg-black/40 border border-white/5 px-2 py-1 rounded-lg backdrop-blur-md select-none">
          <MousePointer2 className="w-3 h-3" /> Arraste p/ girar • scroll p/ zoom
        </div>
      )}

      {/* Banner honesto quando não há asset 3D real */}
      {isPlaceholder && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-3 sm:p-4 bg-gradient-to-t from-black/90 via-black/70 to-transparent select-none">
          <div className="bg-gym-card/70 border border-white/10 rounded-2xl p-3.5 backdrop-blur-md flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                status === 'error'
                  ? 'bg-gym-rose/15 border-gym-rose/30 text-gym-rose'
                  : 'bg-gym-accent/15 border-gym-accent/30 text-gym-accent'
              }`}
            >
              {status === 'error' ? <ShieldAlert className="w-4.5 h-4.5" /> : <Sparkles className="w-4.5 h-4.5" />}
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-extrabold text-white leading-tight">
                {status === 'error'
                  ? 'Arquivo .glb não encontrado'
                  : 'Pipeline 3D pronto — falta o avatar'}
              </h4>
              <p className="text-[10px] text-gym-text-muted mt-1 leading-relaxed">
                {status === 'error' ? (
                  <>
                    Não foi possível carregar{' '}
                    <code className="text-gym-accent font-mono">{avatar.modelPath}</code>. Verifique o
                    arquivo e mantenha <code className="text-gym-accent font-mono">available: true</code>.
                  </>
                ) : (
                  <>
                    Adicione um arquivo <code className="text-gym-accent font-mono">.glb</code> em{' '}
                    <code className="text-gym-accent font-mono">public/assets/avatars</code> e marque{' '}
                    <code className="text-gym-accent font-mono">available: true</code> em{' '}
                    <code className="text-gym-accent font-mono">avatar-config.ts</code>. O objeto ao
                    centro é só uma pré-visualização do palco — <strong>não</strong> é o avatar final.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GymFlowAvatarStage;
