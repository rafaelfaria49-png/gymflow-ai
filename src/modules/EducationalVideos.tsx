'use client';

import React, { useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { VideoLesson } from '../types';
import { Play, Award, ArrowRight, User } from 'lucide-react';

export const EducationalVideos = () => {
  const { videos, trails, openGlobalPlayer } = useGymFlow();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentTab, setCurrentTab] = useState<'videos' | 'trails'>('videos');

  // Categories helper
  const categories = [
    { id: 'all', label: 'Todas as Aulas' },
    { id: 'posture', label: 'Técnica e Postura' },
    { id: 'machines', label: 'Uso de Aparelhos' },
    { id: 'warmup', label: 'Aquecimento' },
    { id: 'mobility', label: 'Mobilidade' },
    { id: 'injury-prevention', label: 'Prevenir Lesões' }
  ];

  const filteredVideos = videos.filter(
    (vid) => selectedCategory === 'all' || vid.category === selectedCategory
  );

  const handleOpenVideo = (vid: VideoLesson) => {
    openGlobalPlayer(vid.id);
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">Vídeos Educativos</h1>
        <p className="text-xs text-gym-text-muted mt-0.5 font-medium">
          Aprenda postura, biomecânica e técnicas de execução com nossos instrutores de elite.
        </p>
      </div>

      {/* TAB SYSTEM */}
      <div className="flex border-b border-white/10 gap-4">
        <button
          onClick={() => setCurrentTab('videos')}
          className={`pb-3 px-2 text-sm font-bold border-b-2 transition-all relative ${
            currentTab === 'videos'
              ? 'border-gym-accent text-gym-accent font-extrabold'
              : 'border-transparent text-gym-text-muted hover:text-white'
          }`}
        >
          Aulas Individuais
        </button>
        <button
          onClick={() => setCurrentTab('trails')}
          className={`pb-3 px-2 text-sm font-bold border-b-2 transition-all relative ${
            currentTab === 'trails'
              ? 'border-gym-accent text-gym-accent font-extrabold'
              : 'border-transparent text-gym-text-muted hover:text-white'
          }`}
        >
          Trilhas Técnicas ({trails?.length || 0})
        </button>
      </div>

      {currentTab === 'videos' ? (
        <>
          {/* FILTER BUTTONS */}
          <div className="flex bg-gym-card/40 p-2 rounded-2xl border border-white/5 overflow-x-auto whitespace-nowrap gap-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`py-2 px-4 rounded-xl text-xs font-bold transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-gym-accent text-gym-dark shadow-md'
                    : 'text-gym-text-muted hover:text-white hover:bg-white/5'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* VIDEOS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVideos.map((vid) => (
              <div
                key={vid.id}
                onClick={() => handleOpenVideo(vid)}
                className="glass hover:border-gym-accent/30 rounded-3xl overflow-hidden cursor-pointer transition-all duration-300 transform hover:-translate-y-1 flex flex-col justify-between group"
              >
                <div>
                  {/* Thumbnail frame */}
                  <div className="aspect-video w-full bg-black relative flex items-center justify-center text-4xl group-hover:opacity-90 transition-all select-none">
                    {vid.thumbnail}
                    <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                      <Play className="w-10 h-10 text-white fill-white opacity-80 group-hover:scale-110 transition-all group-hover:text-gym-accent group-hover:fill-gym-accent" />
                    </div>
                    
                    {/* Progress indicator */}
                    {(vid.progressPercent || 0) > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10">
                        <div
                          className="h-full bg-gym-accent"
                          style={{ width: `${vid.progressPercent}%` }}
                        ></div>
                      </div>
                    )}

                    <span className="absolute bottom-3 right-3 bg-black/75 text-white font-mono text-[10px] font-bold px-2 py-1 rounded-lg">
                      {vid.duration}
                    </span>
                    {vid.learned && (
                      <span className="absolute top-3 left-3 bg-gym-accent text-gym-dark text-[9px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-0.5">
                        ✓ Aprendido
                      </span>
                    )}
                  </div>

                  {/* Text */}
                  <div className="p-5">
                    <span className="text-[10px] font-extrabold text-gym-accent uppercase tracking-widest block mb-1">
                      {vid.category === 'injury-prevention' ? 'Prevenir Lesões' : vid.category === 'posture' ? 'Postura' : vid.category === 'machines' ? 'Aparelhos' : vid.category === 'mobility' ? 'Mobilidade' : 'Biomecânica'}
                    </span>
                    <h3 className="text-sm font-bold text-white tracking-tight leading-snug group-hover:text-gym-accent transition-all">
                      {vid.title}
                    </h3>
                    <p className="text-[10px] text-gym-text-muted mt-2 flex items-center gap-1">
                      <User className="w-3.5 h-3.5" /> Prof. {vid.instructor.split(' ')[0]}
                    </p>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-3 border-t border-white/5 flex items-center justify-between text-xs font-bold">
                  <span className="text-gym-text-muted capitalize">Nível: {vid.level}</span>
                  <span className="text-gym-accent group-hover:underline flex items-center gap-0.5">
                    Assistir aula <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* TRAILS LIST */
        <div className="space-y-6">
          <div className="bg-gym-accent/5 border border-gym-accent/15 rounded-3xl p-5 flex items-center justify-between">
            <div className="max-w-md">
              <span className="text-[10px] font-black text-gym-accent uppercase tracking-widest block mb-1">
                Evolução Cognitiva
              </span>
              <h2 className="text-base font-bold text-white leading-tight">Trilhas de Técnica Avançada</h2>
              <p className="text-xs text-gym-text-muted mt-1">
                Domine os 3 pilares da musculação: Biomecânica de Execução, Ajuste de Máquinas e Prevenção.
              </p>
            </div>
            <Award className="w-10 h-10 text-gym-accent opacity-80 hidden sm:block" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {trails?.map((trail) => {
              const trailLessons = videos.filter((v) => trail.videoIds.includes(v.id));
              const completedCount = trailLessons.filter((v) => v.learned).length;
              const totalCount = trail.videoIds.length;
              const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

              return (
                <div
                  key={trail.id}
                  className="glass border border-white/5 hover:border-white/10 p-5 rounded-3xl space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="text-[9px] font-extrabold text-gym-accent bg-gym-accent/10 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        Trilha • {trail.level === 'all' ? 'Todos os níveis' : trail.level}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-gym-text-muted">
                        {completedCount}/{totalCount} Aulas
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white">{trail.name}</h3>
                    <p className="text-xs text-gym-text-muted line-clamp-2">{trail.description}</p>
                  </div>

                  <div className="space-y-2">
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-gym-accent to-gym-emerald transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                      ></div>
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <span className="text-[10px] font-bold text-gym-accent">{progressPct}% Concluído</span>
                      <button
                        onClick={() => {
                          const nextVid = trailLessons.find((v) => !v.learned) || trailLessons[0];
                          if (nextVid) handleOpenVideo(nextVid);
                        }}
                        className="text-xs text-white hover:text-gym-accent font-bold flex items-center gap-1 transition-all"
                      >
                        Começar Trilha <ArrowRight className="w-3.5 h-3.5 text-gym-accent" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
