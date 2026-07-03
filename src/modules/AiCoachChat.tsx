'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useGymFlow, ChatActionCard } from '../providers/GymFlowContext';
import { Send, Sparkles, User, Brain, Dumbbell, Trash2, ArrowRight, Play } from 'lucide-react';
import { IaCoachHologram } from '../components/IaCoachHologram';

export const AiCoachChat = () => {
  const {
    chatMessages,
    sendChatMessage,
    clearChat,
    startWorkout,
    setActiveView,
    replanMissedWorkout,
    adaptActiveWorkoutForCrowdedGym,
    generateWeeklyPlan
  } = useGymFlow();
  
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendChatMessage(input);
    setInput('');
  };

  const handlePresetPrompt = (prompt: string) => {
    sendChatMessage(prompt);
  };

  const handleStartSuggestedWorkout = (sugg: any) => {
    // Inicia o treino livre com o nome sugerido
    startWorkout(undefined, sugg.name);
    setActiveView('active-workout');
  };

  const handleActionCardClick = (card: ChatActionCard) => {
    switch (card.actionType) {
      case 'start-workout':
        startWorkout(card.payload);
        setActiveView('active-workout');
        break;
      case 'generate-week':
        generateWeeklyPlan('hypertrophy', 'intermediate', 'neutral', 4, 60);
        setActiveView('planner');
        break;
      case 'replan-missed':
        replanMissedWorkout();
        setActiveView('planner');
        break;
      case 'crowded-gym':
        adaptActiveWorkoutForCrowdedGym();
        setActiveView('active-workout');
        break;
      case 'watch-video':
        setActiveView('videos');
        break;
      default:
        setActiveView('dashboard');
        break;
    }
  };

  // Ações rápidas (ETAPA 7) — cada uma cai num ramo que gera card acionável.
  const presets = [
    { text: 'Gerar treino de hoje', label: '🔥 Treino de hoje' },
    { text: 'Gerar minha semana', label: '📅 Gerar minha semana' },
    { text: 'Perdi o treino ontem', label: '⏱️ Perdi o treino' },
    { text: 'Academia está cheia', label: '🔄 Academia cheia' },
    { text: 'Quero um treino rápido de 30 minutos', label: '⚡ Treino rápido' },
    { text: 'Quero treino feminino glúteo e pernas', label: '🍑 Feminino glúteo' },
    { text: 'Quero hipertrofia masculino', label: '💪 Hipertrofia masc.' },
    { text: 'Estou com dor muscular', label: '🩹 Dor muscular' },
    { text: 'Trocar exercício', label: '🔁 Trocar exercício' },
    { text: 'Quero ver a técnica do supino', label: '🎬 Ver técnica' }
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] lg:h-[calc(100vh-80px)] pb-4">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-black/40 border border-gym-accent/25 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0">
            <IaCoachHologram width={46} height={46} isActive={true} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-none">GymFlow AI Coach</h1>
            <p className="text-[10px] text-gym-accent font-semibold flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gym-accent animate-ping"></span>
              Online e Analisando seu progresso
            </p>
          </div>
        </div>

        <button
          onClick={clearChat}
          className="text-gym-text-muted hover:text-gym-rose hover:bg-gym-rose/10 p-2 rounded-lg transition-all"
          title="Limpar Conversa"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* CHAT MESSAGES LOG */}
      <div className="flex-1 overflow-y-auto pr-2 space-y-4 min-h-0 scrollbar-thin">
        {chatMessages.map((msg) => {
          const isAi = msg.sender === 'ai';
          return (
            <div key={msg.id} className={`flex gap-3 ${isAi ? 'justify-start' : 'justify-end'}`}>
              {isAi && (
                <div className="w-8 h-8 rounded-xl bg-gym-accent/15 border border-gym-accent/20 flex items-center justify-center text-gym-accent flex-shrink-0">
                  <Brain className="w-4 h-4" />
                </div>
              )}

              <div className="flex flex-col gap-2 max-w-[80%]">
                <div
                  className={`p-4 rounded-3xl text-xs leading-relaxed border ${
                    isAi
                      ? 'bg-gym-card/80 border-white/5 text-white rounded-tl-none'
                      : 'bg-gym-accent text-gym-dark border-transparent rounded-tr-none font-medium'
                  }`}
                >
                  {msg.text}
                </div>

                {/* Se a IA retornou um treino sugerido, renderizar card bonito */}
                {isAi && msg.workoutSuggestion && (
                  <div className="bg-gym-card border border-gym-accent/20 rounded-2xl p-4 space-y-3 shadow-xl animate-fade-in">
                    <div className="flex items-center gap-1.5 text-gym-accent text-[10px] font-bold uppercase tracking-wider">
                      <Dumbbell className="w-3.5 h-3.5" /> Treino Gerado pela IA
                    </div>
                    <h4 className="text-xs font-bold text-white">{msg.workoutSuggestion.name}</h4>
                    <div className="space-y-1 bg-white/5 p-3 rounded-xl">
                      {msg.workoutSuggestion.exercises.map((ex, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[10px]">
                          <span className="text-white font-medium">{ex.name}</span>
                          <span className="text-gym-accent font-bold font-mono">
                            {ex.sets}s x {ex.reps}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => handleStartSuggestedWorkout(msg.workoutSuggestion)}
                      className="w-full py-2.5 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-xl text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1"
                    >
                      Iniciar este Treino
                      <Play className="w-3 h-3 fill-gym-dark" />
                    </button>
                  </div>
                )}

                {/* Se a IA retornou um card de ação interativa, renderizar */}
                {isAi && msg.actionCard && (
                  <div className="bg-gym-accent/5 border border-gym-accent/25 rounded-2xl p-4 space-y-2.5 shadow-xl animate-fade-in">
                    <div className="flex items-center gap-1 text-gym-accent text-[10px] font-black uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-gym-accent animate-pulse" /> Recomendações do Coach
                    </div>
                    <p className="text-[11px] text-gym-text-muted leading-relaxed">
                      {msg.actionCard.actionType === 'start-workout'
                        ? 'Deseja iniciar esta rotina agora no rastreador?'
                        : msg.actionCard.actionType === 'replan-missed'
                        ? 'Ajuste automático no Planejador para manter a consistência e recuperação.'
                        : msg.actionCard.actionType === 'crowded-gym'
                        ? 'Substituir todas as máquinas ocupadas por halteres e pesos livres equivalentemente.'
                        : msg.actionCard.actionType === 'watch-video'
                        ? 'Assista à aula de biomecânica técnica para otimizar os seus resultados.'
                        : 'Configurar e gerar sua nova planilha semanal de treinamento.'}
                    </p>
                    <button
                      onClick={() => handleActionCardClick(msg.actionCard!)}
                      className="w-full py-2.5 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold rounded-xl text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md shadow-gym-accent/15"
                    >
                      <span>{msg.actionCard.label}</span>
                      <ArrowRight className="w-3.5 h-3.5 stroke-[2.5px]" />
                    </button>
                  </div>
                )}
              </div>

              {!isAi && (
                <div className="w-8 h-8 rounded-xl bg-gym-card border border-white/10 flex items-center justify-center text-white flex-shrink-0 font-bold text-xs">
                  U
                </div>
              )}
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* PRESET CHIPS */}
      <div className="py-3 overflow-x-auto whitespace-nowrap flex gap-2 border-t border-white/5">
        {presets.map((pre, idx) => (
          <button
            key={idx}
            onClick={() => handlePresetPrompt(pre.text)}
            className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-gym-accent/20 text-white hover:text-gym-accent px-3.5 py-2 rounded-xl text-[10px] font-bold transition-all"
          >
            {pre.label}
          </button>
        ))}
      </div>

      {/* INPUT FORM */}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          placeholder="Pergunte à IA: 'Troque o supino', 'Tenho 30 minutos'..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-gym-card border border-white/5 focus:border-gym-accent rounded-2xl py-3 px-4 text-xs text-white placeholder-gym-text-muted outline-none transition-all"
        />
        <button
          type="submit"
          className="bg-gym-accent hover:bg-gym-accent-hover text-gym-dark p-3.5 rounded-2xl transition-all shadow-md shadow-gym-accent/15"
        >
          <Send className="w-4 h-4 fill-gym-dark" />
        </button>
      </form>
    </div>
  );
};
