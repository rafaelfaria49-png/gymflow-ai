'use client';

import React from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { IaCoachHologram } from '../components/IaCoachHologram';
import {
  Sparkles,
  Flame,
  Activity,
  Dumbbell,
  ChevronRight,
  TrendingUp,
  Calendar,
  Award,
  Zap,
  Pencil,
  Wrench,
  ListChecks
} from 'lucide-react';
import { defaultTargetMinutes } from '../lib/volumeProfiles';

export const Dashboard = () => {
  const {
    user,
    startWorkout,
    setActiveView,
    programs,
    nutrition,
    challenges,
    weeklyPlan,
    todayPlan,
    openWorkoutBuilder,
    openProgramChooserForDay
  } = useGymFlow();

  if (!user) return null;

  // GOAL-10.5: treino do dia vem de todayPlan (weeklyPlan real), nunca mais de um
  // lookup paralelo por nível — exerciseCount/duration já são os valores reais do
  // ProgramDay (ver buildWeekFromProgram/estimateWorkoutDuration).
  const hasPlan = weeklyPlan.length > 0;
  const isRestToday = todayPlan?.isRest ?? false;
  const hasRealWorkoutToday = !!todayPlan && !todayPlan.isRest && todayPlan.exerciseCount > 0;
  // GOAL-10.6: cobre tanto "hoje é descanso" quanto "hoje é treino mas sem exercícios
  // definidos" — em ambos os casos o usuário precisa de um caminho claro, nunca de
  // um treino inventado automaticamente.
  const needsWorkoutChoice = hasPlan && !hasRealWorkoutToday;

  const handleStartTodayWorkout = () => {
    if (!todayPlan) return;
    startWorkout(todayPlan.programId, todayPlan.workoutName, todayPlan.programDayId);
  };

  const handleBuildFromScratch = () => {
    openWorkoutBuilder(undefined, 'dashboard');
  };

  const handleChooseForToday = () => {
    if (!todayPlan) return;
    openProgramChooserForDay(todayPlan.dayName);
  };

  const handleEditTodayWorkout = () => {
    if (!todayPlan) return;
    const sourceProgram = programs.find((p) => p.id === todayPlan.programId);
    const sourceDay = sourceProgram?.weeks?.[0]?.days.find((d) => d.id === todayPlan.programDayId);
    const volumeProfile = sourceDay?.volumeProfile ?? 'standard';
    openWorkoutBuilder(
      {
        // Editar um treino sugerido sempre vira um treino NOVO (nunca sobrescreve o original).
        programId: sourceProgram?.isCustom ? sourceProgram.id : undefined,
        dayId: sourceProgram?.isCustom ? sourceDay?.id : undefined,
        name: todayPlan.workoutName,
        // GOAL-E: nome do dia acima; o programa novo herda o nome do PROGRAMA de origem.
        sourceProgramName: sourceProgram?.name,
        level: user.level,
        volumeProfile,
        targetMinutes: sourceDay?.targetMinutes ?? user.duration ?? defaultTargetMinutes(volumeProfile),
        slots: sourceDay?.slots ?? []
      },
      'dashboard'
    );
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* BOAS VINDAS E RESUMO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-gym-card to-gym-dark border border-white/5 p-6 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gym-accent/5 rounded-full blur-2xl -z-10"></div>
        <div>
          <div className="flex items-center gap-1.5 text-gym-accent text-xs font-bold uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            GymFlow Coach Ativo
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            Olá, {user.name.split(' ')[0]}!
          </h1>
          <p className="text-xs text-gym-text-muted mt-0.5">
            Seu corpo está pronto para a sessão de hoje. Foco no processo!
          </p>
        </div>

        {/* Mini stats cards */}
        <div className="flex gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center min-w-[70px]">
            <Flame className="w-5 h-5 text-gym-accent mx-auto mb-1 animate-pulse" />
            <span className="block text-xs text-gym-text-muted uppercase">Streak</span>
            <span className="block text-sm font-extrabold text-white">{user.streak} dias</span>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center min-w-[70px]">
            <Zap className="w-5 h-5 text-gym-emerald mx-auto mb-1" />
            <span className="block text-xs text-gym-text-muted uppercase">Pontos</span>
            <span className="block text-sm font-extrabold text-white">{user.xp} XP</span>
          </div>
        </div>
      </div>

      {/* SEÇÃO PRINCIPAL: TREINO DE HOJE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="glass border border-gym-accent/20 rounded-3xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-gym-accent text-gym-dark text-[9px] font-black uppercase px-3 py-1 rounded-bl-2xl">
              {hasRealWorkoutToday ? 'Treino do Dia' : isRestToday ? 'Descanso' : hasPlan ? 'Sem Treino' : 'Planejador'}
            </div>

            <span className="text-[10px] font-extrabold text-gym-accent uppercase tracking-widest block mb-2">Treino do Dia</span>

            {!hasPlan && (
              <>
                <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">Nenhuma semana planejada ainda</h2>
                <p className="text-xs text-gym-text-muted mt-1 leading-relaxed max-w-lg">
                  Monte um treino do zero agora ou vá ao Planejador para gerar sua semana completa com a IA Coach.
                </p>
              </>
            )}

            {hasPlan && isRestToday && (
              <>
                <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">Hoje é dia de descanso</h2>
                <p className="text-xs text-gym-text-muted mt-1 leading-relaxed max-w-lg">
                  Hoje está como descanso no seu planejamento. Se preferir treinar mesmo assim, escolha um treino existente ou monte um agora — nunca vamos inventar um treino sozinhos.
                </p>
              </>
            )}

            {hasPlan && !isRestToday && todayPlan && (
              <>
                <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">{todayPlan.workoutName}</h2>
                {!hasRealWorkoutToday && (
                  <p className="text-xs text-gym-text-muted mt-1 leading-relaxed max-w-lg">
                    Este dia ainda não tem um treino definido no seu planejamento. Escolha um treino existente ou monte um agora.
                  </p>
                )}

                {hasRealWorkoutToday && (
                  <div className="flex flex-wrap items-center gap-4 mt-6 text-xs text-gym-text-muted">
                    <span className="bg-white/5 px-3 py-1.5 rounded-xl border border-white/5 font-bold text-white flex items-center gap-1.5">
                      <Dumbbell className="w-3.5 h-3.5 text-gym-accent" />
                      {todayPlan.exerciseCount} Exercícios
                    </span>
                    <span className="bg-white/5 px-3 py-1.5 rounded-xl border border-white/5 font-bold text-white flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-gym-emerald" />
                      ~{todayPlan.duration} min
                    </span>
                    {todayPlan.muscleGroups.length > 0 && (
                      <span className="bg-white/5 px-3 py-1.5 rounded-xl border border-white/5 font-bold text-white uppercase font-mono">
                        {todayPlan.muscleGroups.join(', ')}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="flex flex-col sm:flex-row flex-wrap gap-3 mt-8">
              {/* GOAL-10.6: 3 blocos mutuamente exclusivos — o usuário nunca fica sem
                  um caminho claro para treinar hoje, e nunca inventamos um treino. */}
              {hasRealWorkoutToday && (
                <button
                  onClick={handleStartTodayWorkout}
                  className="flex-1 py-4 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-2xl transition-all shadow-lg shadow-gym-accent/15 flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider"
                >
                  Começar Treino
                  <ChevronRight className="w-4 h-4 text-gym-dark" />
                </button>
              )}

              {needsWorkoutChoice && (
                <button
                  onClick={handleChooseForToday}
                  className="flex-1 py-4 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-2xl transition-all shadow-lg shadow-gym-accent/15 flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider"
                >
                  <ListChecks className="w-4 h-4 text-gym-dark" />
                  Escolher Treino para Hoje
                </button>
              )}

              {!hasPlan && (
                <button
                  onClick={handleBuildFromScratch}
                  className="flex-1 py-4 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-2xl transition-all shadow-lg shadow-gym-accent/15 flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider"
                >
                  Montar Treino
                  <Wrench className="w-4 h-4 text-gym-dark" />
                </button>
              )}

              {hasRealWorkoutToday && (
                <>
                  <button
                    onClick={handleEditTodayWorkout}
                    className="py-4 px-6 bg-gym-card hover:bg-white/5 border border-white/10 hover:border-white/20 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
                  >
                    <Pencil className="w-4 h-4 text-gym-accent" />
                    Editar Treino
                  </button>
                  <button
                    onClick={handleBuildFromScratch}
                    className="py-4 px-6 bg-gym-card hover:bg-white/5 border border-white/10 hover:border-white/20 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
                  >
                    <Wrench className="w-4 h-4 text-gym-accent" />
                    Montar do Zero
                  </button>
                </>
              )}

              {needsWorkoutChoice && (
                <>
                  <button
                    onClick={handleBuildFromScratch}
                    className="py-4 px-6 bg-gym-card hover:bg-white/5 border border-white/10 hover:border-white/20 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
                  >
                    <Wrench className="w-4 h-4 text-gym-accent" />
                    Montar Treino
                  </button>
                  <button
                    onClick={() => setActiveView('planner')}
                    className="py-4 px-6 bg-gym-card hover:bg-white/5 border border-white/10 hover:border-white/20 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
                  >
                    <Calendar className="w-4 h-4 text-gym-accent" />
                    Ver Planejador
                  </button>
                </>
              )}

              {!hasPlan && (
                <button
                  onClick={() => setActiveView('planner')}
                  className="py-4 px-6 bg-gym-card hover:bg-white/5 border border-white/10 hover:border-white/20 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
                >
                  <Calendar className="w-4 h-4 text-gym-accent" />
                  Ver Planejador
                </button>
              )}
            </div>
          </div>

          {/* EVOLUÇÃO SEMANAL / WIDGETS DE METAS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Metas Semanais */}
            <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-gym-accent" />
                Progresso Semanal
              </h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gym-text-muted">Treinos Concluídos</span>
                    <span className="font-bold text-white">3 de {user.frequency} dias</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gym-accent rounded-full" style={{ width: '75%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gym-text-muted">Meta Hidratação</span>
                    <span className="font-bold text-white">{nutrition.water}ml / {user.waterGoal}ml</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gym-emerald rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (nutrition.water / user.waterGoal) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Desafio do Dia */}
            <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-gym-accent" />
                  Desafio do Dia
                </h3>
                <span className="text-[9px] bg-gym-accent/15 text-gym-accent font-black uppercase px-2 py-0.5 rounded-full">+100 XP</span>
              </div>
              <p className="text-xs text-gym-text-muted leading-relaxed">
                {challenges[0]?.name || 'Foco Total: 7 Dias Consecutivos'}
              </p>
              <div className="flex justify-between items-center text-xs mt-2 border-t border-white/5 pt-3">
                <span className="text-gym-text-muted">Progresso do Desafio</span>
                <span className="font-bold text-gym-accent">{challenges[0]?.progress || 0}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* LADO DIREITO: IA COACH TIP & QUICK INFOS */}
        <div className="space-y-6">
          {/* IA Coach Card */}
          <div className="glass bg-gradient-to-b from-gym-accent/5 to-transparent border border-white/10 rounded-3xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-black/40 border border-gym-accent/25 flex items-center justify-center overflow-hidden flex-shrink-0">
                <IaCoachHologram width={46} height={46} isActive={true} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">IA Coach Dica do Dia</h4>
                <p className="text-[10px] text-gym-accent font-semibold uppercase">Estudos Científicos</p>
              </div>
            </div>
            <p className="text-xs text-gym-text-muted leading-relaxed">
              &quot;Fazer uma retração de escápulas rígida no supino reto não apenas protege os rotadores do ombro contra estiramentos como também aumenta em até 12% a ativação das fibras centrais do peitoral maior. Tente focar nisso na sessão de hoje!&quot;
            </p>
            <button
              onClick={() => setActiveView('ai-coach')}
              className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5"
            >
              Falar com IA Coach
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Músculos Trabalhados */}
          <div className="glass p-5 rounded-3xl border border-white/5 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-gym-emerald" />
              Recuperação Muscular
            </h3>
            <div className="space-y-2">
              {[
                { name: 'Peitorais', recovery: 85, status: 'Fresco' },
                { name: 'Quadríceps', recovery: 20, status: 'Fadigado (Recuperando)' },
                { name: 'Costas', recovery: 95, status: 'Fresco' },
                { name: 'Deltóides', recovery: 40, status: 'Dolorido' }
              ].map((m, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <span className="text-white font-medium">{m.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold ${m.recovery >= 70 ? 'text-gym-accent' : m.recovery >= 40 ? 'text-yellow-500' : 'text-gym-rose'}`}>
                      {m.status}
                    </span>
                    <div className="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full ${m.recovery >= 70 ? 'bg-gym-accent' : m.recovery >= 40 ? 'bg-yellow-500' : 'bg-gym-rose'}`} style={{ width: `${m.recovery}%` }}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Próximos Eventos / Calendário */}
          <div className="glass p-5 rounded-3xl border border-white/5 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-gym-accent" />
              Frequência de Treino
            </h3>
            <div className="grid grid-cols-7 gap-1">
              {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((day, idx) => {
                const trained = idx < 3; // Mocking Trained days
                const active = idx === 3;
                return (
                  <div
                    key={idx}
                    className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-bold border transition-all ${
                      trained
                        ? 'bg-gym-accent/15 border-gym-accent/30 text-gym-accent'
                        : active
                        ? 'bg-white/10 border-white/20 text-white animate-pulse'
                        : 'bg-white/5 border-transparent text-gym-text-muted'
                    }`}
                  >
                    <span>{day}</span>
                    {trained && <span className="text-[7px] mt-0.5">✓</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
