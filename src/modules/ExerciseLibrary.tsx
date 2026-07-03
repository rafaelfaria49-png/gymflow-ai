'use client';

import React, { useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { Exercise } from '../types';
import { Search, X, Play, ShieldAlert, Heart, Check, Sparkles, ChevronRight, Zap, Award, Flame, Clock } from 'lucide-react';
import { useToast } from '../components/ui/Toast';

export const ExerciseLibrary = () => {
  const {
    exercises,
    startWorkout,
    activeWorkout,
    favoriteExercises,
    toggleFavoriteExercise,
    openGlobalPlayer,
    recentlyViewedVideoIds,
    user
  } = useGymFlow();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<string>('all');
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [currentLibraryTab, setCurrentLibraryTab] = useState<'all' | 'favorites' | 'recommended' | 'trends' | 'recent'>('all');

  const musclesList = [
    { id: 'all', label: 'Todos' },
    { id: 'chest', label: 'Peito' },
    { id: 'back', label: 'Costas' },
    { id: 'shoulders', label: 'Ombros' },
    { id: 'biceps', label: 'Bíceps' },
    { id: 'triceps', label: 'Tríceps' },
    { id: 'legs', label: 'Pernas' },
    { id: 'glutes', label: 'Glúteos' },
    { id: 'abs', label: 'Abdômen' },
    { id: 'calves', label: 'Panturrilha' },
    { id: 'cardio', label: 'Cardio' },
    { id: 'mobility', label: 'Mobilidade' },
    { id: 'functional', label: 'Funcional' }
  ];

  // Helper map from exercise ID to mock technical video lesson ID
  const mapExerciseToVideoId = (exId: string): string => {
    const map: { [key: string]: string } = {
      'chest_supino_reto': 'vid_supino_1',
      'legs_agachamento_barra': 'vid_agachamento_1',
      'back_remada_curvada': 'vid_remada_1',
      'legs_levantamento_terra': 'vid_terra_1',
      'glutes_elevacao_pelvica': 'extra_vid_technique_2',
      'legs_legpress_45': 'extra_vid_machines_1',
      'legs_stiff': 'vid_terra_2'
    };
    return map[exId] || 'vid_supino_1';
  };

  // Helper to map video IDs back to exercise IDs for Recently Viewed tab
  const mapVideoToExerciseId = (vidId: string): string => {
    const map: { [key: string]: string } = {
      'vid_supino_1': 'chest_supino_reto',
      'vid_agachamento_1': 'legs_agachamento_barra',
      'vid_agachamento_2': 'legs_agachamento_barra',
      'vid_remada_1': 'back_remada_curvada',
      'vid_terra_1': 'legs_levantamento_terra',
      'extra_vid_technique_2': 'glutes_elevacao_pelvica',
      'extra_vid_machines_1': 'legs_legpress_45',
      'vid_terra_2': 'legs_stiff'
    };
    return map[vidId] || 'chest_supino_reto';
  };

  const getTabFilteredExercises = () => {
    let base = exercises;
    
    if (currentLibraryTab === 'favorites') {
      base = exercises.filter(ex => favoriteExercises.includes(ex.id));
    } else if (currentLibraryTab === 'recommended') {
      // Recommend based on user profile goals or active workout muscle group if exists
      const activeMuscle = activeWorkout?.exercises[0]?.muscleGroup;
      if (activeMuscle) {
        base = exercises.filter(ex => ex.muscleGroup === activeMuscle);
      } else {
        const userFocus = user?.muscleFocus || [];
        base = exercises.filter(ex => {
          if (userFocus.length > 0) {
            return userFocus.includes(ex.muscleGroup) || userFocus.includes(ex.muscleGroup.toUpperCase());
          }
          return ex.level === user?.level;
        });
      }
    } else if (currentLibraryTab === 'trends') {
      base = exercises.filter(ex => [
        'chest_supino_reto', 
        'legs_agachamento_barra', 
        'glutes_elevacao_pelvica', 
        'back_remada_curvada', 
        'legs_stiff', 
        'biceps_rosca_direta'
      ].includes(ex.id));
    } else if (currentLibraryTab === 'recent') {
      const recentExIds = recentlyViewedVideoIds.map(vidId => mapVideoToExerciseId(vidId));
      base = exercises.filter(ex => recentExIds.includes(ex.id));
    }

    return base.filter((ex) => {
      const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase());
      const matchesMuscle = selectedMuscle === 'all' || ex.muscleGroup === selectedMuscle;
      return matchesSearch && matchesMuscle;
    });
  };

  const finalExercises = getTabFilteredExercises();

  const handleAddToWorkout = (ex: Exercise) => {
    if (activeWorkout) {
      const newExIndex = activeWorkout.exercises.length;
      activeWorkout.exercises.push({
        id: `active_ex_${newExIndex}_${Date.now()}`,
        exerciseId: ex.id,
        name: ex.name,
        muscleGroup: ex.muscleGroup,
        sets: [
          { id: `set_${newExIndex}_0`, reps: 10, weight: 10, completed: false, suggestedWeight: 12, lastWeight: 10, rpe: 7 }
        ]
      });
      toast.success(`"${ex.name}" adicionado ao seu treino ativo!`);
    } else {
      startWorkout(undefined, `Treino de ${ex.name}`);
    }
    setSelectedExercise(null);
  };

  const handleOpenVideo = (exId: string) => {
    const videoId = mapExerciseToVideoId(exId);
    openGlobalPlayer(videoId);
  };

  // Get muscle group translation
  const getMuscleLabel = (mg: string) => {
    const map: {[key: string]: string} = {
      'chest': 'Peito', 'legs': 'Pernas', 'back': 'Costas', 'shoulders': 'Ombros',
      'biceps': 'Bíceps', 'triceps': 'Tríceps', 'abs': 'Abdômen', 'glutes': 'Glúteos',
      'cardio': 'Cardio', 'mobility': 'Mobilidade', 'functional': 'Funcional', 'calves': 'Panturrilha'
    };
    return map[mg.toLowerCase()] || mg;
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">Biblioteca de Exercícios</h1>
        <p className="text-xs text-gym-text-muted mt-0.5 font-medium">
          Dicionário de anatomia e técnica com {exercises.length} movimentos cadastrados.
        </p>
      </div>

      {/* SYNERGY WARNING BANNER */}
      {activeWorkout && (
        <div className="bg-gym-accent/10 border border-gym-accent/20 rounded-3xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4.5 h-4.5 text-gym-accent animate-pulse" />
            <span className="text-xs text-white">
              Você tem um treino ativo: <span className="font-extrabold text-gym-accent">"{activeWorkout.name}"</span>. 
              Ao clicar nos exercícios, você poderá adicioná-los diretamente à sessão ativa.
            </span>
          </div>
          <button
            onClick={() => setCurrentLibraryTab('recommended')}
            className="text-[10px] bg-gym-accent text-gym-dark font-extrabold px-3 py-1.5 rounded-xl uppercase tracking-wider"
          >
            Foco do Treino
          </button>
        </div>
      )}

      {/* TOP TABS SYSTEM */}
      <div className="flex border-b border-white/10 gap-4 overflow-x-auto whitespace-nowrap scrollbar-none pr-2">
        {[
          { id: 'all', label: 'Todos os Exercícios' },
          { id: 'favorites', label: 'Meus Favoritos ❤️' },
          { id: 'recommended', label: activeWorkout ? 'Sinergia com Treino Ativo ⚡' : 'Recomendados IA 🧠' },
          { id: 'trends', label: 'Tendências 🔥' },
          { id: 'recent', label: 'Vistos Recentemente ⏱️' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setCurrentLibraryTab(tab.id as any)}
            className={`pb-3 px-1 text-sm font-bold border-b-2 transition-all relative ${
              currentLibraryTab === tab.id
                ? 'border-gym-accent text-gym-accent font-extrabold'
                : 'border-transparent text-gym-text-muted hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-3.5 w-4 h-4 text-gym-text-muted" />
          <input
            type="text"
            placeholder="Buscar por nome (ex: supino, agachamento)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gym-card border border-white/5 focus:border-gym-accent rounded-2xl py-3.5 pl-11 pr-4 text-sm text-white placeholder-gym-text-muted outline-none transition-all"
          />
        </div>
      </div>

      {/* FILTER BADGES */}
      <div className="flex bg-gym-card/40 p-2 rounded-2xl border border-white/5 overflow-x-auto whitespace-nowrap gap-1">
        {musclesList.map((m) => (
          <button
            key={m.id}
            onClick={() => setSelectedMuscle(m.id)}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all ${
              selectedMuscle === m.id
                ? 'bg-gym-accent text-gym-dark shadow-md'
                : 'text-gym-text-muted hover:text-white hover:bg-white/5'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* LIST GRID */}
      {finalExercises.length === 0 ? (
        <div className="glass p-12 text-center rounded-3xl border border-white/5">
          <p className="text-sm text-gym-text-muted">Nenhum exercício encontrado nesta categoria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {finalExercises.map((ex) => {
            const isFav = favoriteExercises.includes(ex.id);
            return (
              <div
                key={ex.id}
                onClick={() => setSelectedExercise(ex)}
                className="glass border border-white/5 hover:border-gym-accent/30 rounded-3xl p-4 flex flex-col justify-between cursor-pointer transition-all duration-200 hover:-translate-y-0.5 group relative"
              >
                {/* Favorite Heart on Card */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavoriteExercise(ex.id);
                  }}
                  className="absolute top-6 right-6 z-10 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white transition-all border border-white/10"
                >
                  <Heart
                    className={`w-3.5 h-3.5 ${isFav ? 'text-gym-rose fill-gym-rose' : 'text-white'}`}
                  />
                </button>

                <div>
                  <div className="aspect-video w-full bg-gym-dark/50 border border-white/10 rounded-2xl mb-3 flex items-center justify-center text-xl font-bold group-hover:border-gym-accent/20 transition-all select-none">
                    {ex.thumbnail}
                  </div>
                  <h3 className="text-xs font-bold text-white tracking-tight group-hover:text-gym-accent transition-all line-clamp-1">
                    {ex.name}
                  </h3>
                  <p className="text-[10px] text-gym-text-muted capitalize mt-1">
                    {getMuscleLabel(ex.muscleGroup)} • {ex.equipment}
                  </p>
                </div>
                
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/5">
                  <span className="text-[9px] font-black uppercase text-gym-text-muted bg-white/5 px-2 py-0.5 rounded">
                    {ex.level === 'beginner' ? 'Iniciante' : ex.level === 'intermediate' ? 'Intermediário' : 'Avançado'}
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenVideo(ex.id);
                    }}
                    className="text-[10px] text-gym-accent font-bold group-hover:underline flex items-center gap-0.5"
                  >
                    Ver técnica <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* EXERCISE DETAIL DRAWER MODAL */}
      {selectedExercise && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSelectedExercise(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-gym-dark border border-white/10 rounded-3xl w-full max-w-3xl p-6 lg:p-8 relative max-h-[90vh] overflow-y-auto space-y-6"
          >
            
            {/* Top Close */}
            <button
              onClick={() => setSelectedExercise(null)}
              className="absolute top-4 right-4 text-gym-text-muted hover:text-white p-2 rounded-lg bg-white/5"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Title and Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-4 gap-4">
              <div>
                <span className="text-[9px] font-extrabold text-gym-accent uppercase tracking-widest block mb-1">Ficha Técnica Biomecânica</span>
                <h2 className="text-xl lg:text-2xl font-black text-white tracking-tight leading-none">
                  {selectedExercise.name}
                </h2>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleFavoriteExercise(selectedExercise.id)}
                  className="p-2 border border-white/10 rounded-xl bg-white/5 text-white hover:text-gym-rose transition-all flex items-center gap-1.5 text-xs font-bold"
                >
                  <Heart className={`w-4 h-4 ${favoriteExercises.includes(selectedExercise.id) ? 'text-gym-rose fill-gym-rose' : ''}`} />
                  <span>Favorito</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ESQUERDA: Video Player cover and muscles details */}
              <div className="space-y-4">
                <div className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden border border-white/15 shadow-inner group">
                  <div className="w-full h-full flex flex-col items-center justify-center relative select-none bg-gradient-to-br from-gym-card to-zinc-950">
                    <span className="text-4xl">{selectedExercise.thumbnail}</span>
                    <span className="text-[10px] text-gym-text-muted font-mono mt-2 uppercase">Demonstração 3D em produção</span>
                    <button
                      onClick={() => handleOpenVideo(selectedExercise.id)}
                      className="absolute inset-0 bg-black/40 hover:bg-black/50 flex items-center justify-center text-white transition-all"
                      title="Abrir guia técnico"
                    >
                      <Play className="w-12 h-12 text-gym-accent fill-gym-accent group-hover:scale-110 transition-all drop-shadow-[0_0_10px_rgba(163,230,53,0.4)]" />
                    </button>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/5 p-4 rounded-2xl space-y-2">
                  <span className="text-[9px] font-extrabold text-gym-accent uppercase tracking-wider block">Grupos Envolvidos</span>
                  <div className="text-xs text-white">
                    Músculo Alvo: <span className="font-bold text-gym-accent capitalize">{getMuscleLabel(selectedExercise.muscleGroup)}</span>
                  </div>
                  {selectedExercise.secondaryMuscles && (
                    <div className="text-[11px] text-gym-text-muted capitalize">
                      Sinergistas Secundários: {selectedExercise.secondaryMuscles.map(m => getMuscleLabel(m)).join(', ')}
                    </div>
                  )}
                  <div className="text-[11px] text-gym-text-muted">
                    Equipamento necessário: <span className="text-white font-bold">{selectedExercise.equipment}</span>
                  </div>
                </div>

                <div className="bg-gym-accent/10 border border-gym-accent/25 rounded-2xl p-4">
                  <h4 className="text-xs font-bold text-gym-accent flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Dica de Respiração
                  </h4>
                  <p className="text-xs text-white/90 mt-1.5 leading-relaxed font-medium">
                    {selectedExercise.breathing || 'Inspire na fase excêntrica (descida do peso), expire na fase concêntrica (subida do peso).'}
                  </p>
                </div>
              </div>

              {/* DIREITA: Instruções Biomecânicas */}
              <div className="space-y-5">
                {/* Passo a Passo */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gym-accent mb-2">Execução Passo a Passo</h4>
                  <ol className="space-y-1.5">
                    {selectedExercise.executionSteps.map((step, idx) => (
                      <li key={idx} className="text-xs text-white/95 flex items-start gap-2 leading-relaxed">
                        <span className="text-gym-accent font-bold font-mono">{idx + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Postura e biomecanica */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gym-accent mb-2">Segredos Posturais</h4>
                  <ul className="space-y-1.5 text-xs text-gym-text-muted list-disc list-inside">
                    {selectedExercise.postureTips.map((tip, idx) => (
                      <li key={idx} className="leading-relaxed">{tip}</li>
                    ))}
                  </ul>
                </div>

                {/* Erros Comuns e Correções */}
                <div className="bg-gym-rose/5 border border-gym-rose/20 rounded-2xl p-4">
                  <h4 className="text-xs font-bold text-gym-rose flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" /> Evite estes Erros Comuns
                  </h4>
                  <ul className="space-y-2.5 mt-2">
                    {selectedExercise.commonErrors.map((err, idx) => (
                      <li key={idx} className="text-xs leading-relaxed text-white/90">
                        ❌ <span className="font-bold">{err}</span>
                        {selectedExercise.errorCorrections && selectedExercise.errorCorrections[idx] && (
                          <span className="block text-[11px] text-gym-text-muted pl-5 mt-0.5">
                            👉 Correção: {selectedExercise.errorCorrections[idx]}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Substitutes / Alternativas */}
                {selectedExercise.substitutions && selectedExercise.substitutions.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-gym-text-muted uppercase tracking-wider block">Exercícios Substitutos IA</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedExercise.substitutions.map((subId) => {
                        const targetEx = exercises.find((e) => e.id === subId);
                        if (!targetEx) return null;
                        return (
                          <button
                            key={subId}
                            onClick={() => setSelectedExercise(targetEx)}
                            className="bg-white/5 hover:bg-gym-accent/15 border border-white/10 text-white hover:text-gym-accent px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all"
                          >
                            🔄 {targetEx.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex gap-3 pt-4 border-t border-white/5">
              <button
                onClick={() => setSelectedExercise(null)}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold"
              >
                Voltar
              </button>
              <button
                onClick={() => handleAddToWorkout(selectedExercise)}
                className="flex-1 py-3 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold rounded-xl text-xs uppercase tracking-wider shadow-md shadow-gym-accent/15"
              >
                {activeWorkout ? 'Adicionar ao Treino Ativo' : 'Iniciar Treino com Este'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
