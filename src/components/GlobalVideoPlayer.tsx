'use client';

import React, { useState, useEffect } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { AvatarDemoPlaceholder } from './AvatarDemoPlaceholder';
import { Play, Check, ShieldAlert, Award, Clock, ArrowLeft, User, Flame, Maximize2, Minimize2, X, Brain, Dumbbell, Sparkles } from 'lucide-react';
import { TechniqueSequencePlayer } from './TechniqueSequencePlayer';
import { getExerciseIdForTechniqueVideoId } from '../lib/exerciseTechniqueMap';

export const GlobalVideoPlayer = () => {
  const {
    activeVideoLessonId,
    globalPlayerOpen,
    closeGlobalPlayer,
    videos,
    exercises,
    markVideoLearned,
    openGlobalPlayer,
    startWorkout,
  } = useGymFlow();

  const [isCinemaMode, setIsCinemaMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'guide' | 'related'>('guide');

  // Find the selected video lesson
  const video = videos.find((v) => v.id === activeVideoLessonId);
  const relatedExerciseId = activeVideoLessonId ? getExerciseIdForTechniqueVideoId(activeVideoLessonId) : null;
  const relatedExercise = relatedExerciseId ? exercises.find((ex) => ex.id === relatedExerciseId) : null;

  // Reset tab on video change
  useEffect(() => {
    setActiveTab('guide');
  }, [activeVideoLessonId]);

  // ESC key listener to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && globalPlayerOpen) {
        closeGlobalPlayer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [globalPlayerOpen]);

  if (!globalPlayerOpen || !video) return null;

  const handleLearn = () => {
    markVideoLearned(video.id);
  };

  const handleStartWorkout = () => {
    closeGlobalPlayer();
    startWorkout(undefined, `Treino — ${video.title}`);
  };

  // Related videos
  const relatedVideos = videos
    .filter((v) => v.category === video.category && v.id !== video.id)
    .slice(0, 5);

  const categoryLabel =
    video.category === 'posture'
      ? 'Técnica e Postura'
      : video.category === 'machines'
      ? 'Aparelhos'
      : video.category === 'mobility'
      ? 'Mobilidade'
      : video.category === 'injury-prevention'
      ? 'Prevenir Lesões'
      : 'Técnica';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={closeGlobalPlayer}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-gym-dark border border-white/10 rounded-3xl w-full relative transition-all duration-300 overflow-hidden shadow-2xl ${
          isCinemaMode ? 'max-w-6xl' : 'max-w-4xl'
        } max-h-[95vh] flex flex-col`}
      >
        {/* Header border status */}
        <div className="h-1 bg-gradient-to-r from-gym-accent to-gym-emerald"></div>

        {/* Top Control Bar */}
        <div className="p-4 flex items-center justify-between border-b border-white/5 bg-gym-card/25">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-black uppercase text-gym-accent bg-gym-accent/15 px-2 py-0.5 rounded border border-gym-accent/20 flex-shrink-0">
              {categoryLabel}
            </span>
            <span className="hidden sm:inline text-xs text-gym-text-muted font-bold font-mono truncate">
              Guia técnico de execução
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Cinema mode toggle (desktop) */}
            <button
              onClick={() => setIsCinemaMode(!isCinemaMode)}
              className="hidden sm:flex p-2 text-gym-text-muted hover:text-gym-accent bg-white/5 hover:bg-white/10 rounded-xl transition-all"
              title={isCinemaMode ? 'Sair do Modo Cinema' : 'Ativar Modo Cinema'}
            >
              {isCinemaMode ? <Minimize2 className="w-4.5 h-4.5" /> : <Maximize2 className="w-4.5 h-4.5" />}
            </button>

            {/* Close Button */}
            <button
              onClick={closeGlobalPlayer}
              className="p-2 text-gym-text-muted hover:text-gym-rose bg-white/5 hover:bg-white/10 rounded-xl transition-all tap-target"
              title="Fechar (ESC)"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Main Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto p-4 md:p-6 gap-6">

          {/* LADO ESQUERDO: Demonstração + descrições */}
          <div className={`${isCinemaMode ? 'lg:col-span-8' : 'lg:col-span-7'} space-y-4`}>

            {/* DEMONSTRAÇÃO — sequência visual provisória quando há exercício associado. */}
            <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 shadow-inner">
              {relatedExercise ? (
                <TechniqueSequencePlayer
                  exercise={relatedExercise}
                  emoji={relatedExercise.thumbnail.split(' ')[0]}
                  fit="contain"
                />
              ) : (
                <div className="aspect-video w-full">
                  <AvatarDemoPlaceholder
                    emoji={video.thumbnail.split(' ')[0]}
                    title="Demonstração 3D em breve"
                    subtitle="A demonstração animada do Kai será integrada quando a Motion Engine for aprovada."
                  />
                </div>
              )}
            </div>

            {/* Banner de honestidade (ETAPA 12) */}
            <div className="flex items-start gap-2.5 bg-gym-accent/5 border border-gym-accent/15 rounded-2xl p-3">
              <Sparkles className="w-4 h-4 text-gym-accent mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-gym-text-muted leading-relaxed">
                <span className="text-white font-bold">Sequência visual provisória.</span> Demonstração 3D em breve:
                o avatar Kai e a Motion Engine seguem em produção no Avatar Lab. Use como referência técnica, não
                substitui orientação profissional.
              </p>
            </div>

            {/* Descrições */}
            <div className="space-y-2">
              <h2 className="text-lg font-black text-white tracking-tight leading-snug">{video.title}</h2>
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-gym-text-muted">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-gym-accent" /> {video.instructor}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-gym-emerald" /> {video.duration}
                </span>
                <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase">
                  {video.level === 'all' ? 'Todos os Níveis' : video.level}
                </span>
              </div>

              {/* Temas / músculos trabalhados (tags) */}
              {video.tags && video.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {video.tags.map((tag) => (
                    <span key={tag} className="text-[9px] bg-white/5 border border-white/5 px-2 py-0.5 rounded uppercase font-bold text-gym-text-muted">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* CTAs principais (ETAPA 6: voltar + iniciar treino) */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                onClick={closeGlobalPlayer}
                className="sm:flex-shrink-0 py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-all tap-target"
              >
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
              <button
                onClick={handleStartWorkout}
                className="flex-1 py-3 px-4 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-2xl text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md shadow-gym-accent/15 tap-target"
              >
                <Dumbbell className="w-4 h-4" /> Iniciar treino
              </button>
            </div>
          </div>

          {/* LADO DIREITO: Guia técnico vs relacionadas */}
          <div className={`${isCinemaMode ? 'lg:col-span-4' : 'lg:col-span-5'} space-y-4`}>

            {/* Toggle tabs */}
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 text-xs font-bold">
              <button
                onClick={() => setActiveTab('guide')}
                className={`flex-1 py-2 rounded-lg text-center transition-all ${
                  activeTab === 'guide' ? 'bg-gym-accent text-gym-dark font-black' : 'text-gym-text-muted hover:text-white'
                }`}
              >
                Guia Técnico
              </button>
              <button
                onClick={() => setActiveTab('related')}
                className={`flex-1 py-2 rounded-lg text-center transition-all ${
                  activeTab === 'related' ? 'bg-gym-accent text-gym-dark font-black' : 'text-gym-text-muted hover:text-white'
                }`}
              >
                Relacionadas
              </button>
            </div>

            {activeTab === 'guide' ? (
              <div className="space-y-3.5 lg:max-h-[55vh] lg:overflow-y-auto pr-1">

                {/* Execução checklist */}
                <div className="bg-gym-emerald/5 border border-gym-emerald/20 rounded-2xl p-4">
                  <h4 className="text-[10px] font-bold text-gym-emerald flex items-center gap-1.5 uppercase tracking-wider">
                    <Check className="w-4 h-4 text-gym-emerald stroke-[3px]" />
                    Execução Correta Passo a Passo
                  </h4>
                  <ul className="space-y-1.5 mt-2">
                    {video.checklist.map((item, idx) => (
                      <li key={idx} className="text-xs text-white/95 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-gym-emerald mt-1.5 flex-shrink-0"></span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Erros a evitar */}
                <div className="bg-gym-rose/5 border border-gym-rose/20 rounded-2xl p-4">
                  <h4 className="text-[10px] font-bold text-gym-rose flex items-center gap-1.5 uppercase tracking-wider">
                    <ShieldAlert className="w-4 h-4" />
                    Erros Comuns a Evitar
                  </h4>
                  <ul className="space-y-1.5 mt-2">
                    {video.errorsToAvoid.map((item, idx) => (
                      <li key={idx} className="text-xs text-white/95 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-gym-rose mt-1.5 flex-shrink-0"></span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Dica da IA */}
                <div className="bg-gym-accent/5 border border-gym-accent/20 rounded-2xl p-4 space-y-2">
                  <h4 className="text-[10px] font-bold text-gym-accent flex items-center gap-1 uppercase tracking-wider">
                    <Brain className="w-3.5 h-3.5" /> Dica de Execução da IA
                  </h4>
                  <p className="text-[11px] text-gym-text-muted leading-relaxed font-medium">
                    Controle a fase excêntrica (descida) por cerca de 2 segundos: isso aumenta o tempo
                    sob tensão e o estímulo de hipertrofia, mantendo a articulação segura.
                  </p>
                </div>

                {/* Learn badge */}
                {video.learned ? (
                  <div className="bg-gym-accent/10 border border-gym-accent/25 text-gym-accent p-3 rounded-2xl text-xs font-bold text-center flex items-center justify-center gap-2">
                    <Award className="w-5 h-5" />
                    <span>Técnica marcada como dominada (+50 XP)</span>
                  </div>
                ) : (
                  <button
                    onClick={handleLearn}
                    className="w-full py-3 bg-gym-emerald/15 hover:bg-gym-emerald/25 border border-gym-emerald/25 text-gym-emerald font-extrabold rounded-2xl transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 tap-target"
                  >
                    <Flame className="w-4 h-4" />
                    Marcar técnica como aprendida (+50 XP)
                  </button>
                )}
              </div>
            ) : (
              /* RELATED VIDEOS TAB */
              <div className="space-y-2 lg:max-h-[55vh] lg:overflow-y-auto pr-1">
                {relatedVideos.map((relVid) => (
                  <div
                    key={relVid.id}
                    onClick={() => openGlobalPlayer(relVid.id)}
                    className="bg-white/5 border border-white/5 hover:border-gym-accent/20 p-2.5 rounded-2xl flex items-center gap-3 cursor-pointer transition-all group"
                  >
                    <div className="w-16 h-10 bg-black rounded-lg flex items-center justify-center text-xs relative flex-shrink-0 select-none font-bold">
                      {relVid.thumbnail}
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                        <Play className="w-4 h-4 text-gym-accent fill-gym-accent" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h5 className="text-xs font-bold text-white truncate leading-tight group-hover:text-gym-accent transition-all">
                        {relVid.title}
                      </h5>
                      <span className="text-[9px] text-gym-text-muted block mt-0.5 font-mono">
                        {relVid.duration} • Prof. {relVid.instructor.split(' ')[0]}
                      </span>
                    </div>
                  </div>
                ))}
                {relatedVideos.length === 0 && (
                  <p className="text-xs text-gym-text-muted text-center py-6">Nenhuma outra aula nesta categoria.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
