'use client';

/**
 * GymFlow AI — POC do Pipeline 3D
 * Rota isolada (/poc-3d) para validar a substituição do canvas/skeleton por
 * avatares 3D reais (.glb) com React Three Fiber. Não toca no restante do app.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { GymFlowAvatarStage } from '@/components/three/GymFlowAvatarStage';
import {
  AvatarGender,
  AVATARS,
  ANIMATIONS,
  resolveAnimationId,
  getAnimation,
  hasAnyAvatarAsset,
} from '@/components/three/avatar-config';
import { Play, Pause, Sparkles, RotateCw, ArrowLeft } from 'lucide-react';

const SAMPLE_EXERCISES: { id: string; label: string }[] = [
  { id: 'legs_agachamento_barra', label: 'Agachamento Livre' },
  { id: 'chest_supino_reto', label: 'Supino Reto' },
  { id: 'back_remada_curvada', label: 'Remada Curvada' },
  { id: 'legs_stiff', label: 'Stiff (Terra)' },
  { id: 'glutes_elevacao_pelvica', label: 'Elevação Pélvica' },
  { id: 'shoulder_desenvolvimento_haltere', label: 'Desenvolvimento' },
  { id: 'biceps_rosca_direta', label: 'Rosca Direta' },
];

const SPEEDS = [1, 1.5, 2];

export default function Poc3DPage() {
  const [gender, setGender] = useState<AvatarGender>('male');
  const [exerciseId, setExerciseId] = useState(SAMPLE_EXERCISES[0].id);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [autoRotate, setAutoRotate] = useState(false);

  const animId = resolveAnimationId(exerciseId);
  const animDef = getAnimation(animId);
  const anyAsset = hasAnyAvatarAsset();

  return (
    <div className="min-h-screen bg-gym-dark text-white p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-gym-accent text-[10px] font-black uppercase tracking-widest mb-1">
            <Sparkles className="w-3.5 h-3.5" /> POC · Pipeline 3D
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Avatar 3D Viewer (React Three Fiber)</h1>
          <p className="text-xs text-gym-text-muted mt-1 max-w-2xl leading-relaxed">
            Prova de conceito do motor 3D real (Three.js + R3F) que substitui o canvas/skeleton.
            Carrega modelos <code className="text-gym-accent font-mono">.glb/.gltf</code> com
            animação via <code className="text-gym-accent font-mono">AnimationMixer</code>, luzes,
            câmera e controles. Enquanto não houver asset, mostra um palco 3D real + aviso honesto.
          </p>
        </div>
        <Link
          href="/"
          className="self-start inline-flex items-center gap-1.5 text-xs font-bold text-gym-text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-xl transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao app
        </Link>
      </div>

      {/* STATUS DE ASSETS */}
      <div
        className={`rounded-2xl border p-3.5 text-xs flex items-center gap-2.5 ${
          anyAsset
            ? 'bg-gym-accent/10 border-gym-accent/25 text-gym-accent'
            : 'bg-white/5 border-white/10 text-gym-text-muted'
        }`}
      >
        <span className={`w-2 h-2 rounded-full ${anyAsset ? 'bg-gym-accent' : 'bg-gym-text-muted'} animate-pulse`} />
        {anyAsset ? (
          <span>Asset(s) 3D detectado(s) na config — carregando avatar real.</span>
        ) : (
          <span>
            Nenhum <code className="font-mono">.glb</code> ativo. Adicione em{' '}
            <code className="font-mono text-white">public/assets/avatars</code> e marque{' '}
            <code className="font-mono text-white">available: true</code> em{' '}
            <code className="font-mono text-white">src/components/three/avatar-config.ts</code>.
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* VIEWER */}
        <div className="lg:col-span-2 space-y-3">
          <div className="aspect-video w-full">
            <GymFlowAvatarStage
              exerciseId={exerciseId}
              gender={gender}
              isPlaying={isPlaying}
              playbackSpeed={speed}
              autoRotate={autoRotate}
            />
          </div>

          {/* CONTROLES PLAYBACK */}
          <div className="glass border border-white/5 rounded-2xl p-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsPlaying((p) => !p)}
              className="flex items-center gap-1.5 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold px-4 py-2 rounded-xl text-xs transition-all"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-gym-dark" /> : <Play className="w-3.5 h-3.5 fill-gym-dark" />}
              {isPlaying ? 'Pausar' : 'Reproduzir'}
            </button>

            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    speed === s ? 'bg-gym-accent text-gym-dark' : 'text-gym-text-muted hover:text-white'
                  }`}
                >
                  {s.toFixed(1)}x
                </button>
              ))}
            </div>

            <button
              onClick={() => setAutoRotate((a) => !a)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold border transition-all ${
                autoRotate
                  ? 'bg-gym-accent/15 border-gym-accent/30 text-gym-accent'
                  : 'bg-white/5 border-white/10 text-gym-text-muted hover:text-white'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" /> Auto-girar
            </button>
          </div>
        </div>

        {/* PAINEL DE CONFIG */}
        <div className="space-y-4">
          {/* Gênero */}
          <div className="glass border border-white/5 rounded-2xl p-4 space-y-2">
            <label className="text-[10px] font-bold uppercase text-gym-text-muted tracking-wider">Avatar (gênero)</label>
            <div className="flex bg-gym-dark/50 p-1 rounded-xl border border-white/5 gap-1">
              {(Object.keys(AVATARS) as AvatarGender[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold capitalize transition-all ${
                    gender === g ? 'bg-gym-accent text-gym-dark font-black' : 'text-gym-text-muted hover:text-white'
                  }`}
                >
                  {AVATARS[g].label}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-gym-text-muted">
              Troca M/F/Neutro é só config — cada gênero aponta para um{' '}
              <code className="font-mono">.glb</code> próprio.
            </p>
          </div>

          {/* Exercício */}
          <div className="glass border border-white/5 rounded-2xl p-4 space-y-2">
            <label className="text-[10px] font-bold uppercase text-gym-text-muted tracking-wider">Exercício</label>
            <div className="grid grid-cols-2 gap-1.5">
              {SAMPLE_EXERCISES.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => setExerciseId(ex.id)}
                  className={`p-2 rounded-xl text-[10px] font-bold text-left border transition-all ${
                    exerciseId === ex.id
                      ? 'bg-gym-accent/10 border-gym-accent text-gym-accent'
                      : 'bg-white/5 border-white/5 text-gym-text-muted hover:text-white'
                  }`}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mapeamento resolvido */}
          <div className="glass border border-white/5 rounded-2xl p-4 space-y-2.5">
            <h4 className="text-[10px] font-bold uppercase text-gym-text-muted tracking-wider">Mapeamento resolvido</h4>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gym-text-muted">exerciseId</span>
              <code className="font-mono text-white text-[10px]">{exerciseId}</code>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gym-text-muted">→ animação</span>
              <code className="font-mono text-gym-accent text-[10px]">{animId}</code>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gym-text-muted">clipe</span>
              <span className="text-white text-[10px] font-bold">{animDef?.label ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between text-xs border-t border-white/5 pt-2">
              <span className="text-gym-text-muted">asset do clipe</span>
              <span className={`text-[10px] font-bold ${animDef?.available ? 'text-gym-accent' : 'text-gym-text-muted'}`}>
                {animDef?.available ? 'disponível' : 'pendente'}
              </span>
            </div>
          </div>

          {/* Animações registradas */}
          <div className="glass border border-white/5 rounded-2xl p-4 space-y-2">
            <h4 className="text-[10px] font-bold uppercase text-gym-text-muted tracking-wider">
              Biblioteca de animações ({Object.keys(ANIMATIONS).length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {Object.values(ANIMATIONS).map((a) => (
                <span
                  key={a.id}
                  className={`text-[9px] font-bold px-2 py-1 rounded-lg border ${
                    a.id === animId
                      ? 'bg-gym-accent/15 border-gym-accent/30 text-gym-accent'
                      : 'bg-white/5 border-white/5 text-gym-text-muted'
                  }`}
                >
                  {a.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* DOCS RÁPIDAS */}
      <div className="glass border border-white/5 rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-white">Como ativar avatares reais</h3>
        <ol className="text-xs text-gym-text-muted space-y-1.5 list-decimal list-inside leading-relaxed">
          <li>
            Coloque <code className="font-mono text-white">male.glb</code> /{' '}
            <code className="font-mono text-white">female.glb</code> em{' '}
            <code className="font-mono text-white">public/assets/avatars/</code>.
          </li>
          <li>
            Coloque os clipes (ex.: <code className="font-mono text-white">squat.glb</code>) em{' '}
            <code className="font-mono text-white">public/assets/animations/</code>.
          </li>
          <li>
            Em <code className="font-mono text-white">src/components/three/avatar-config.ts</code>, marque{' '}
            <code className="font-mono text-white">available: true</code> nos itens correspondentes.
          </li>
          <li>Recarregue esta página — o placeholder some e o avatar real é carregado.</li>
        </ol>
        <p className="text-[10px] text-gym-text-muted">
          Detalhes de produção (Mixamo, Ready Player Me, Blender, retargeting, custos) no relatório{' '}
          <code className="font-mono text-white">POC_AVATAR_3D_GYMFLOW.md</code>.
        </p>
      </div>
    </div>
  );
}
