'use client';

import React, { useMemo, useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { SocialShareModal } from '../components/SocialShareModal';
import { SessionDetailModal } from '../components/SessionDetailModal';
import { useToast } from '../components/ui/Toast';
import { SessionStatusBadge } from '../components/ui/SessionBadges';
import type { WorkoutSession } from '../types';
import { TrainingProfileSelector } from '../components/TrainingProfileSelector';
import { TrainingProfileSummary } from '../components/TrainingProfileSummary';
import { validateTrainingProfile } from '../lib/training-profile';
import type { TrainingProfileFields } from '../types/training-profile';
import { GymProfileSettings } from '../domain/gymProfile/GymProfileSettings';
import {
  Scale,
  Ruler,
  Image as ImageIcon,
  Plus,
  Share2,
  Calendar,
  Award,
  Zap,
  Timer,
  Volume2,
  VolumeX,
  Dumbbell,
  Play,
  Activity,
  TrendingUp,
  BarChart3,
  GitCompare,
  History,
  Settings2,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
} from 'lucide-react';
import type { AnalyticsTimeWindow } from '../domain/analytics/types';
import {
  generateEvolutionReport,
  compareWithPreviousSession,
} from '../domain/analytics/aggregators';
import {
  VolumeComparisonBarChart,
  ExerciseProgressLineChart,
  WeeklyAdherenceBarChart,
  SwapReasonsBarChart,
} from '../components/analytics/SvgCharts';
import { UsabilityThreeQuestionsCard } from '../components/analytics/UsabilityThreeQuestionsCard';
import { SessionComparisonCard } from '../components/analytics/SessionComparisonCard';

export const EvolutionDashboard = () => {
  const {
    user,
    updateUserProfile,
    weightHistory,
    addWeightLog,
    measurementsHistory,
    addMeasurementLog,
    workoutHistory,
    setActiveView,
    gymProfile,
    setGymProfile,
  } = useGymFlow();
  const toast = useToast();

  // Janela temporal para os agregadores (4, 8 ou 12 semanas)
  const [timeWindow, setTimeWindow] = useState<AnalyticsTimeWindow>(4);

  // Tab ativa principal
  const [activeTab, setActiveTab] = useState<
    'analytics' | 'comparison' | 'history' | 'body' | 'settings'
  >('analytics');

  // Exercício selecionado para o gráfico de evolução de carga
  const [selectedExerciseKey, setSelectedExerciseKey] = useState<string>('');

  // Sessão selecionada para o comparativo dedicado
  const [selectedComparisonSessionId, setSelectedComparisonSessionId] = useState<string>('');

  // Inputs de Peso e Medidas
  const [weightInput, setWeightInput] = useState('');
  const [chestInput, setChestInput] = useState('');
  const [waistInput, setWaistInput] = useState('');
  const [hipsInput, setHipsInput] = useState('');
  const [armsInput, setArmsInput] = useState('');
  const [trainingProfileDraft, setTrainingProfileDraft] = useState<TrainingProfileFields>(() => ({
    level: user?.level ?? 'beginner',
    trainingStatus: user?.trainingStatus ?? 'active',
    returnToTraining: user?.returnToTraining,
    trainingExperienceYears: user?.trainingExperienceYears,
  }));

  // Evolution photos mock list
  const [photos, setPhotos] = useState<string[]>([
    'https://images.unsplash.com/photo-1578762560072-483c47779673?q=80&w=400&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=400&auto=format&fit=crop',
  ]);

  // Social Share states
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareData, setShareData] = useState<
    React.ComponentProps<typeof SocialShareModal>['shareData']
  >(null);

  // Sessão selecionada para o modal de detalhe
  const [selectedSession, setSelectedSession] = useState<WorkoutSession | null>(null);

  // GOAL-31: Relatório completo de evolução pura calculado sobre SessionLogs reais
  const report = useMemo(() => {
    return generateEvolutionReport(workoutHistory, timeWindow);
  }, [workoutHistory, timeWindow]);

  // Exercício atualmente exibido no gráfico de carga
  const activeExerciseAnalytics = useMemo(() => {
    if (!report.exerciseAnalytics || report.exerciseAnalytics.length === 0) return null;
    if (selectedExerciseKey) {
      const found = report.exerciseAnalytics.find(
        (e) => (e.exerciseId || e.exerciseName) === selectedExerciseKey,
      );
      if (found) return found;
    }
    return report.exerciseAnalytics[0];
  }, [report.exerciseAnalytics, selectedExerciseKey]);

  // Comparativo de sessão selecionada para a tab de comparação
  const activeComparison = useMemo(() => {
    if (!workoutHistory || workoutHistory.length === 0) return null;
    const current = selectedComparisonSessionId
      ? workoutHistory.find((s) => s.id === selectedComparisonSessionId) ?? workoutHistory[0]
      : workoutHistory[0];
    if (!current) return null;
    return compareWithPreviousSession(current, workoutHistory);
  }, [workoutHistory, selectedComparisonSessionId]);

  const handleWeightSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!weightInput) return;
    addWeightLog(Number(weightInput));
    setWeightInput('');
    toast.success('Peso registrado com sucesso!');
  };

  const handleMeasurementsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chestInput || !waistInput || !hipsInput || !armsInput) return;
    addMeasurementLog(Number(chestInput), Number(waistInput), Number(hipsInput), Number(armsInput));
    setChestInput('');
    setWaistInput('');
    setHipsInput('');
    setArmsInput('');
    toast.success('Medidas registradas com sucesso!');
  };

  const handleTrainingProfileSave = () => {
    const validation = validateTrainingProfile(trainingProfileDraft);
    if (!validation.valid) {
      toast.error(validation.errors[0]?.message ?? 'Revise os dados do perfil de treino.');
      return;
    }
    updateUserProfile({
      level: trainingProfileDraft.level,
      trainingStatus: trainingProfileDraft.trainingStatus ?? 'active',
      returnToTraining: trainingProfileDraft.returnToTraining,
      trainingExperienceYears: trainingProfileDraft.trainingExperienceYears,
    });
    toast.success('Perfil de treino salvo. Seu nível de experiência foi preservado.');
  };

  const handleSimulatePhotoUpload = () => {
    const mockPhoto =
      'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=400&auto=format&fit=crop';
    setPhotos([mockPhoto, ...photos]);
    toast.success('Foto de evolução adicionada!');
  };

  const triggerSharePR = (prName: string, prWeight: string) => {
    setShareData({
      type: 'pr',
      title: `Recorde de Força Batido!`,
      subtitle: `Superei minhas cargas usando o GymFlow AI!`,
      accentText: prWeight,
      badgeIcon: '⚡',
      stats: [
        { label: 'Exercício', value: prName },
        { label: 'Carga Máxima', value: prWeight },
        { label: 'XP Bônus', value: '+150 XP' },
      ],
    });
    setShareModalOpen(true);
  };

  const triggerShareEvolution = () => {
    const currentWeight = weightHistory[0]?.value || 80.5;
    const initialWeight = weightHistory[weightHistory.length - 1]?.value || 82.5;
    const diff = (initialWeight - currentWeight).toFixed(1);

    setShareData({
      type: 'evolution',
      title: `Evolução Física GymFlow`,
      subtitle: `Resultados obtidos com treinos reais e consistência.`,
      badgeIcon: '🏆',
      stats: [
        { label: 'Volume Total', value: `${report.adherence.totalVolumeKg.toLocaleString('pt-BR')} kg` },
        { label: 'Semanas Ativas', value: `${report.adherence.consecutiveWeeksStreak} semanas` },
        { label: 'Conclusão', value: `${report.adherence.completionRatePercent}%` },
        { label: 'Nível Atual', value: `Nível ${Math.floor((user?.xp || 0) / 1000) + 1}` },
      ],
    });
    setShareModalOpen(true);
  };

  // PRs reais detectados no período
  const realPRs = useMemo(() => {
    return report.exerciseAnalytics
      .filter((e) => e.currentPR !== null)
      .map((e) => ({
        exercise: e.exerciseName,
        weight: `${e.currentPR!.weight} kg`,
        reps: e.currentPR!.reps,
        date: e.currentPR!.date.split('T')[0],
      }))
      .slice(0, 5);
  }, [report.exerciseAnalytics]);

  return (
    <div className="space-y-6 pb-24 lg:pb-8 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">
              Evolução e Análise v2
            </h1>
            <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-md bg-gym-accent/20 text-gym-accent border border-gym-accent/30 font-mono">
              Premium
            </span>
          </div>
          <p className="text-xs text-gym-text-muted mt-0.5 font-medium">
            Métricas calculadas exclusivamente de SessionLogs reais gravados no seu histórico.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Seletor de Janela Temporal */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-1 flex items-center">
            {([4, 8, 12] as AnalyticsTimeWindow[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setTimeWindow(w)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  timeWindow === w
                    ? 'bg-gym-accent text-gym-dark shadow-sm'
                    : 'text-gym-text-muted hover:text-white'
                }`}
              >
                {w} sem
              </button>
            ))}
          </div>

          <button
            onClick={triggerShareEvolution}
            className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-gym-accent/30 text-white hover:text-gym-accent font-bold px-4 py-2.5 rounded-2xl transition-all flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Compartilhar</span>
          </button>
        </div>
      </div>

      {/* AVISO DE DADOS ANTIGOS (LEGADO) */}
      {report.hasLegacyData && (
        <div className="p-3.5 rounded-2xl bg-amber-400/[0.06] border border-amber-400/20 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-300">
            <Info className="w-4 h-4 flex-shrink-0" />
            <span>
              Contém <strong>{report.legacySessionsCount}</strong> sessão(ões) anteriores ao motor v2 marcadas como <em>dados antigos</em>. Métricas e telemetria completas são gravadas em novos treinos.
            </span>
          </div>
          <span className="text-[9px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 flex-shrink-0">
            dados antigos
          </span>
        </div>
      )}

      {/* NAVEGAÇÃO ENTRE TABS */}
      <div className="flex items-center gap-1.5 border-b border-white/10 pb-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'analytics', label: 'Evolução & Gráficos', icon: BarChart3 },
          { id: 'comparison', label: 'Comparativo de Treinos', icon: GitCompare },
          { id: 'history', label: 'Histórico de Sessões', icon: History },
          { id: 'body', label: 'Medidas & Fotos', icon: Scale },
          { id: 'settings', label: 'Configurações', icon: Settings2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-gym-accent text-gym-dark shadow-md shadow-gym-accent/15'
                  : 'bg-white/5 hover:bg-white/10 text-gym-text-muted hover:text-white border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: EVOLUÇÃO & GRÁFICOS ANALÍTICOS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* ROTEIRO DE USABILIDADE DAS 3 PERGUNTAS (<30s) */}
          <UsabilityThreeQuestionsCard
            whereEvolved={report.usabilityAnswers.whereEvolved}
            whereStagnant={report.usabilityAnswers.whereStagnant}
            whatMissing={report.usabilityAnswers.whatMissing}
            windowWeeks={timeWindow}
          />

          {/* CARDS DE KPIS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="glass p-4 rounded-3xl border border-white/5 space-y-1">
              <span className="text-[10px] font-bold text-gym-text-muted uppercase tracking-wider block flex items-center gap-1">
                <Flame className="w-3 h-3 text-gym-accent" /> Volume Total
              </span>
              <p className="text-xl font-black text-white font-mono">
                {report.adherence.totalVolumeKg.toLocaleString('pt-BR')}{' '}
                <span className="text-xs text-gym-text-muted">kg</span>
              </p>
              <span className="text-[10px] text-gym-text-muted block">
                {report.adherence.totalWorkingSetsExecuted} séries de trabalho
              </span>
            </div>

            <div className="glass p-4 rounded-3xl border border-white/5 space-y-1">
              <span className="text-[10px] font-bold text-gym-text-muted uppercase tracking-wider block flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-gym-emerald" /> Conclusão
              </span>
              <p className="text-xl font-black text-gym-emerald font-mono">
                {report.adherence.completionRatePercent}%
              </p>
              <span className="text-[10px] text-gym-text-muted block">
                {report.adherence.completedSessions} de {report.adherence.totalSessions} sessões
              </span>
            </div>

            <div className="glass p-4 rounded-3xl border border-white/5 space-y-1">
              <span className="text-[10px] font-bold text-gym-text-muted uppercase tracking-wider block flex items-center gap-1">
                <Clock className="w-3 h-3 text-gym-accent" /> Tempo Médio
              </span>
              <p className="text-xl font-black text-white font-mono">
                {report.adherence.averageDurationMinutes}{' '}
                <span className="text-xs text-gym-text-muted">min</span>
              </p>
              <span className="text-[10px] text-gym-text-muted block">por sessão realizada</span>
            </div>

            <div className="glass p-4 rounded-3xl border border-white/5 space-y-1">
              <span className="text-[10px] font-bold text-gym-text-muted uppercase tracking-wider block flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-amber-400" /> Semanas Ativas
              </span>
              <p className="text-xl font-black text-amber-400 font-mono">
                {report.adherence.consecutiveWeeksStreak}{' '}
                <span className="text-xs text-gym-text-muted">sem</span>
              </p>
              <span className="text-[10px] text-gym-text-muted block">em sequência ininterrupta</span>
            </div>
          </div>

          {/* GRÁFICOS: VOLUME POR GRUPO & EVOLUÇÃO POR EXERCÍCIO */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Volume Semanal por Grupo (Planejado x Executado) */}
            <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-gym-accent" />
                    Volume por Grupo Muscular
                  </h3>
                  <p className="text-[10px] text-gym-text-muted mt-0.5">
                    Séries planejadas vs executadas nas últimas {timeWindow} semanas
                  </p>
                </div>
              </div>

              <VolumeComparisonBarChart data={report.muscleGroupVolumes} />

              {/* Diagnósticos de Grupos Negligenciados */}
              {report.neglectedGroups.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Grupos com Atenção
                  </span>
                  <div className="space-y-1.5">
                    {report.neglectedGroups.map((neg, idx) => (
                      <div
                        key={idx}
                        className="bg-rose-500/[0.05] border border-rose-500/20 p-2.5 rounded-xl text-xs text-rose-300"
                      >
                        <strong>{neg.reason}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Evolução de Carga por Exercício */}
            <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-gym-emerald" />
                    Evolução por Exercício
                  </h3>
                  <p className="text-[10px] text-gym-text-muted mt-0.5">
                    Cargas máximas e recordes pessoais ao longo do tempo
                  </p>
                </div>

                {report.exerciseAnalytics.length > 0 && (
                  <select
                    value={activeExerciseAnalytics?.exerciseId || ''}
                    onChange={(e) => setSelectedExerciseKey(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-gym-accent cursor-pointer max-w-full sm:max-w-[200px]"
                  >
                    {report.exerciseAnalytics.map((ex) => (
                      <option key={ex.exerciseId} value={ex.exerciseId} className="bg-gym-dark text-white">
                        {ex.exerciseName}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {activeExerciseAnalytics ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2 text-center bg-white/[0.02] border border-white/5 p-2.5 rounded-2xl text-xs">
                    <div>
                      <span className="text-[9px] text-gym-text-muted block">Carga Inicial</span>
                      <strong className="text-white font-mono">{activeExerciseAnalytics.initialMaxWeight} kg</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-gym-text-muted block">Carga Atual</span>
                      <strong className="text-gym-accent font-mono">{activeExerciseAnalytics.currentMaxWeight} kg</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-gym-text-muted block">Variação</span>
                      <strong
                        className={`font-mono ${
                          activeExerciseAnalytics.weightDeltaKg > 0
                            ? 'text-gym-emerald'
                            : activeExerciseAnalytics.weightDeltaKg < 0
                            ? 'text-rose-400'
                            : 'text-zinc-400'
                        }`}
                      >
                        {activeExerciseAnalytics.weightDeltaKg >= 0
                          ? `+${activeExerciseAnalytics.weightDeltaKg}`
                          : activeExerciseAnalytics.weightDeltaKg}{' '}
                        kg ({activeExerciseAnalytics.weightDeltaPercent}%)
                      </strong>
                    </div>
                  </div>

                  <ExerciseProgressLineChart
                    history={activeExerciseAnalytics.history}
                    exerciseName={activeExerciseAnalytics.exerciseName}
                  />
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-gym-text-muted">
                  Nenhum exercício com séries registradas nesta janela.
                </div>
              )}
            </div>
          </div>

          {/* CONSISTÊNCIA, SUBSTITUIÇÕES E CORRELAÇÃO DE PRONTIDÃO */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Aderência Semanal */}
            <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gym-accent" />
                Frequência Semanal
              </h3>
              <WeeklyAdherenceBarChart breakdown={report.adherence.weeklyBreakdown} />
            </div>

            {/* Substituições & Pulos com Motivo */}
            <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Substituições e Pulos
              </h3>
              <SwapReasonsBarChart analytics={report.swapsAndSkips} />
            </div>

            {/* Prontidão & Recordes Pessoais */}
            <div className="glass p-5 rounded-3xl border border-white/5 space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-gym-emerald" />
                  Prontidão & Performance
                </h3>

                {report.readiness.hasData ? (
                  <div className="space-y-3">
                    <p className="text-xs text-zinc-300 leading-relaxed bg-white/[0.03] border border-white/5 p-3 rounded-2xl">
                      {report.readiness.summary}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-center text-xs">
                      <div className="bg-gym-accent/10 border border-gym-accent/20 p-2.5 rounded-xl">
                        <span className="text-[9px] text-gym-text-muted uppercase block">Alta Prontidão</span>
                        <strong className="text-white font-mono">{report.readiness.optimalCompletionRate}% conc.</strong>
                      </div>
                      <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl">
                        <span className="text-[9px] text-gym-text-muted uppercase block">Baixa Prontidão</span>
                        <strong className="text-white font-mono">{report.readiness.lowCompletionRate}% conc.</strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gym-text-muted">
                    Faça o check-in diário de prontidão antes do início dos treinos para correlacionar sono, energia e dores musculares ao seu desempenho real.
                  </p>
                )}
              </div>

              {/* Recordes recentes */}
              <div className="pt-3 border-t border-white/5 space-y-2">
                <span className="text-[10px] font-bold text-gym-accent uppercase tracking-wider flex items-center gap-1">
                  <Award className="w-3.5 h-3.5" /> PRs Recentes
                </span>
                {realPRs.length > 0 ? (
                  <div className="space-y-1.5">
                    {realPRs.map((pr, idx) => (
                      <div
                        key={idx}
                        className="bg-white/5 border border-white/5 p-2 rounded-xl flex items-center justify-between text-xs"
                      >
                        <span className="truncate pr-2 font-medium text-white">{pr.exercise}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-mono font-bold text-gym-accent">{pr.weight}</span>
                          <button
                            type="button"
                            onClick={() => triggerSharePR(pr.exercise, pr.weight)}
                            className="text-gym-text-muted hover:text-gym-accent"
                            title="Compartilhar PR"
                          >
                            <Share2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-gym-text-muted">
                    Nenhum PR registrado nesta janela.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* INSIGHTS TEXTUAIS E RECOMENDAÇÕES ACIONÁVEIS */}
          {report.insights.length > 0 && (
            <div className="glass p-5 rounded-3xl border border-white/5 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-gym-accent" />
                Insights Inteligentes com Razão
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {report.insights.map((insight) => (
                  <div
                    key={insight.id}
                    className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{insight.title}</span>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          insight.severity === 'positive'
                            ? 'bg-gym-emerald/15 text-gym-emerald'
                            : insight.severity === 'warning'
                            ? 'bg-amber-400/15 text-amber-400'
                            : 'bg-white/10 text-gym-text-muted'
                        }`}
                      >
                        {insight.category}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300">{insight.description}</p>
                    <p className="text-[10px] text-gym-text-muted italic pt-0.5">
                      Por quê? {insight.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: COMPARATIVO ENTRE SESSÕES */}
      {activeTab === 'comparison' && (
        <div className="space-y-6">
          <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-white tracking-tight">
                  Comparativo de Treinos Equivalentes
                </h2>
                <p className="text-xs text-gym-text-muted mt-0.5">
                  Selecione uma sessão do seu histórico para confrontar carga, volume e repetições contra a sessão imediatamente anterior.
                </p>
              </div>

              {workoutHistory.length > 0 && (
                <select
                  value={selectedComparisonSessionId}
                  onChange={(e) => setSelectedComparisonSessionId(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-gym-accent cursor-pointer"
                >
                  {workoutHistory.map((s) => (
                    <option key={s.id} value={s.id} className="bg-gym-dark text-white">
                      {s.name} — {s.date.split('T')[0]}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {activeComparison ? (
              <SessionComparisonCard comparison={activeComparison} />
            ) : (
              <div className="p-8 text-center text-xs text-gym-text-muted">
                Finalize treinos para visualizar o comparativo detalhado pós-treino.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: HISTÓRICO DE SESSÕES */}
      {activeTab === 'history' && (
        <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-gym-emerald" />
              Todas as sessões de treino ({workoutHistory.length})
            </h3>
          </div>

          <div className="space-y-2.5">
            {workoutHistory.length === 0 ? (
              <div className="text-center py-10 space-y-3 flex flex-col items-center">
                <Dumbbell className="w-10 h-10 text-gym-text-muted opacity-40" />
                <h4 className="text-sm font-bold text-white">Nenhum treino finalizado ainda</h4>
                <p className="text-xs text-gym-text-muted max-w-[260px]">
                  Comece agora para construir seu histórico analítico e ver gráficos de carga e volume!
                </p>
                <button
                  onClick={() => setActiveView('workouts')}
                  className="min-h-[44px] px-5 bg-gym-accent hover:bg-gym-accent-hover active:scale-[0.98] text-gym-dark font-extrabold rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-gym-dark" />
                  Ir para treinos
                </button>
              </div>
            ) : (
              workoutHistory.map((sess) => (
                <div
                  key={sess.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedSession(sess)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedSession(sess);
                    }
                  }}
                  className="bg-white/5 border border-white/10 p-3.5 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-white/10 hover:border-gym-accent/30 transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-white truncate">{sess.name}</h4>
                    <p className="text-[10px] text-gym-text-muted mt-0.5">
                      {sess.date.split('T')[0]} • {Math.ceil(sess.duration / 60)} min • {sess.exercises.length} exercícios
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <SessionStatusBadge session={sess} />
                      {sess.readiness && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md border border-gym-accent/30 bg-gym-accent/15 text-gym-accent flex items-center gap-1">
                          <Activity className="w-2.5 h-2.5" />
                          <span>{sess.readiness.score} pts</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs bg-gym-accent/15 text-gym-accent font-mono font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ml-2">
                    +{sess.calories} kcal
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: MEDIDAS CORPORAIS E FOTOS */}
      {activeTab === 'body' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* REGISTRAR PESO */}
          <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-gym-accent" />
              Registrar Peso Corporal
            </h3>
            <form onSubmit={handleWeightSubmit} className="flex gap-2">
              <input
                type="number"
                step="0.1"
                placeholder="Ex: 80.5 kg"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="flex-1 bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-4 py-2.5 text-xs text-white placeholder-gym-text-muted outline-none transition-all"
                required
              />
              <button
                type="submit"
                className="bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold px-4 py-2.5 rounded-xl text-xs transition-all cursor-pointer"
              >
                Salvar
              </button>
            </form>

            <div className="space-y-2 mt-2 max-h-[160px] overflow-y-auto pr-1">
              {weightHistory.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs py-1.5 border-b border-white/5">
                  <span className="text-gym-text-muted">{item.date}</span>
                  <span className="font-bold text-white font-mono">{item.value} kg</span>
                </div>
              ))}
            </div>
          </div>

          {/* REGISTRAR MEDIDAS */}
          <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Ruler className="w-4 h-4 text-gym-emerald" />
              Medidas Corporais (cm)
            </h3>
            <form onSubmit={handleMeasurementsSubmit} className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Peito"
                value={chestInput}
                onChange={(e) => setChestInput(e.target.value)}
                className="bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-3 py-2 text-xs text-white outline-none"
                required
              />
              <input
                type="number"
                placeholder="Cintura"
                value={waistInput}
                onChange={(e) => setWaistInput(e.target.value)}
                className="bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-3 py-2 text-xs text-white outline-none"
                required
              />
              <input
                type="number"
                placeholder="Quadril"
                value={hipsInput}
                onChange={(e) => setHipsInput(e.target.value)}
                className="bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-3 py-2 text-xs text-white outline-none"
                required
              />
              <input
                type="number"
                placeholder="Braço"
                value={armsInput}
                onChange={(e) => setArmsInput(e.target.value)}
                className="bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-3 py-2 text-xs text-white outline-none"
                required
              />
              <button
                type="submit"
                className="col-span-2 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
              >
                Salvar Medidas
              </button>
            </form>

            <div className="space-y-2 mt-2 max-h-[160px] overflow-y-auto pr-1">
              {measurementsHistory.map((item, idx) => (
                <div key={idx} className="text-xs py-2 border-b border-white/5 space-y-1">
                  <div className="flex justify-between font-bold text-white">
                    <span>{item.date}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[10px] text-gym-text-muted font-mono">
                    <span>P: {item.chest}cm</span>
                    <span>C: {item.waist}cm</span>
                    <span>Q: {item.hips}cm</span>
                    <span>B: {item.arms}cm</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FOTOS DE EVOLUÇÃO */}
          <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-gym-accent" />
                Diário Visual de Evolução
              </h3>
              <button
                onClick={handleSimulatePhotoUpload}
                className="p-1.5 bg-gym-accent/15 hover:bg-gym-accent/25 border border-gym-accent/30 text-gym-accent rounded-lg transition-all"
                title="Adicionar Foto"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {photos.map((url, idx) => (
                <div
                  key={idx}
                  className="aspect-[3/4] bg-zinc-950 rounded-2xl overflow-hidden border border-white/10 relative group"
                >
                  <img src={url} alt={`Evolução ${idx + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-2 left-2 bg-black/70 text-white font-bold text-[9px] px-2 py-0.5 rounded-md">
                    {idx === 0 ? 'Atual' : 'Anterior'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: CONFIGURAÇÕES E CONEXÕES */}
      {activeTab === 'settings' && (
        <div className="glass p-6 rounded-3xl border border-white/5 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-gym-accent" />
              Configurações e Conexões de Perfil
            </h3>
            <p className="text-xs text-gym-text-muted mt-0.5">
              Ajuste seu nível, equipamentos da academia e temporizador de descanso.
            </p>
          </div>

          {user && (
            <div className="border-b border-white/5 pb-6 space-y-5">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Experiência e continuidade
                </h4>
                <p className="text-[10px] text-gym-text-muted mt-1 leading-relaxed">
                  Uma pausa não apaga sua experiência. Este contexto preserva seu histórico de evolução.
                </p>
              </div>

              <TrainingProfileSummary profile={user} />
              <TrainingProfileSelector
                idPrefix="settings-training-profile"
                value={trainingProfileDraft}
                onChange={setTrainingProfileDraft}
              />

              <button
                type="button"
                onClick={handleTrainingProfileSave}
                disabled={!validateTrainingProfile(trainingProfileDraft).valid}
                className="min-h-[44px] w-full sm:w-auto px-5 rounded-xl bg-gym-accent hover:bg-gym-accent-hover text-gym-dark text-xs font-extrabold uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
              >
                Salvar perfil de treino
              </button>
            </div>
          )}

          <GymProfileSettings value={gymProfile} onChange={setGymProfile} />

          {/* TIMER DE DESCANSO */}
          <div className="border-t border-white/5 pt-6">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 mb-4">
              <Timer className="w-3.5 h-3.5 text-gym-accent" />
              Timer de Descanso
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] text-gym-text-muted font-bold block">
                  Descanso padrão entre séries (segundos)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={15}
                    max={600}
                    step={15}
                    value={user?.restTimerDefaultSeconds ?? 90}
                    onChange={(e) => {
                      const value = Math.max(15, Math.min(600, Number(e.target.value) || 90));
                      updateUserProfile({ restTimerDefaultSeconds: value });
                    }}
                    className="w-full min-h-[44px] bg-white/5 border border-white/10 text-white rounded-xl px-3 text-sm font-mono text-center focus:border-gym-accent outline-none"
                  />
                  <span className="text-xs text-gym-text-muted font-bold flex-shrink-0">seg</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-gym-text-muted font-bold block">Som do timer</label>
                <button
                  type="button"
                  onClick={() =>
                    updateUserProfile({
                      restTimerSoundEnabled: user?.restTimerSoundEnabled === false,
                    })
                  }
                  className={`w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    user?.restTimerSoundEnabled !== false
                      ? 'bg-gym-accent/15 text-gym-accent border-gym-accent/30'
                      : 'bg-white/5 text-gym-text-muted border-white/10 hover:text-white'
                  }`}
                >
                  {user?.restTimerSoundEnabled !== false ? (
                    <>
                      <Volume2 className="w-4 h-4" /> Som ligado
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-4 h-4" /> Som desligado
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SHARE MODAL MOUNTED */}
      <SocialShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareData={shareData}
      />

      {/* DETALHE DA SESSÃO MOUNTED */}
      <SessionDetailModal
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
      />
    </div>
  );
};
