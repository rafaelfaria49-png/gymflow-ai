'use client';

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Edit3,
  Layers,
  Plus,
  RefreshCw,
  Sliders,
  Sparkles,
  Target,
  Wrench,
  X,
  AlertTriangle,
  Play,
} from 'lucide-react';
import { useGymFlow } from '../../providers/GymFlowContext';
import { useGymProfileAvailability } from '../../hooks/useGymProfileAvailability';
import type { MuscleGroupId, TrainingExperienceLevel, TrainingGoal } from '../../types';
import {
  PRIMARY_FOCUS_GROUPS,
  muscleGroupShortLabel,
} from '../../lib/workout-day-naming';
import {
  generateTrainingSplitProposal,
  generateTrainingPlanProgram,
  type TrainingPlanRequest,
  type TrainingSplitProposal,
  type TrainingPlanGeneratedProgram,
  type ProposedSplitDay,
} from '../../lib/training-plan-assistant';

interface TrainingPlanAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFrequency?: number;
  initialGoal?: TrainingGoal;
  initialLevel?: TrainingExperienceLevel;
  initialDuration?: number;
}

type AssistantStep = 'parameters' | 'split-preview' | 'exercise-preview';

export const TrainingPlanAssistantModal: React.FC<TrainingPlanAssistantModalProps> = ({
  isOpen,
  onClose,
  initialFrequency,
  initialGoal,
  initialLevel,
  initialDuration,
}) => {
  const {
    user,
    exercises,
    gymProfile,
    saveCustomProgram,
    applyProgramToWeek,
    openWorkoutBuilder,
    setActiveView,
    setWorkoutsTab,
  } = useGymFlow();

  const availability = useGymProfileAvailability(gymProfile);

  // Parâmetros pré-preenchidos do perfil
  const [goal, setGoal] = useState<TrainingGoal>(
    (initialGoal || user?.goal || 'hypertrophy') as TrainingGoal,
  );
  const [level, setLevel] = useState<TrainingExperienceLevel>(
    (initialLevel || user?.level || 'intermediate') as TrainingExperienceLevel,
  );
  const [frequency, setFrequency] = useState<number>(
    initialFrequency || user?.frequency || 4,
  );
  const [duration, setDuration] = useState<number>(
    initialDuration || user?.duration || 60,
  );
  const [priorityMuscles, setPriorityMuscles] = useState<MuscleGroupId[]>([]);
  const [variantIndex, setVariantIndex] = useState<number>(0);

  // Estados de navegação interna
  const [step, setStep] = useState<AssistantStep>('parameters');
  const [isEditingSplit, setIsEditingSplit] = useState<boolean>(false);
  const [currentProposal, setCurrentProposal] = useState<TrainingSplitProposal | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<TrainingPlanGeneratedProgram | null>(null);

  // Toggle de prioridades musculares (máximo 3)
  const handleTogglePriority = (id: MuscleGroupId) => {
    setPriorityMuscles((prev) => {
      if (prev.includes(id)) {
        return prev.filter((m) => m !== id);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, id];
    });
  };

  // Gerar proposta de divisão inicial
  const handleGenerateSplit = () => {
    const request: TrainingPlanRequest = {
      goal,
      level,
      frequency,
      duration,
      priorityMuscleGroups: priorityMuscles,
      availableEquipment: user?.equipments,
      gymProfileAvailability: availability,
      restrictions: user?.restrictions,
      returnToTraining: user?.returnToTraining,
      variantIndex,
    };
    const proposal = generateTrainingSplitProposal(request);
    setCurrentProposal(proposal);
    setIsEditingSplit(false);
    setStep('split-preview');
  };

  // Ciclar variante ("Gerar outra opção")
  const handleCycleVariant = () => {
    const nextVariant = variantIndex + 1;
    setVariantIndex(nextVariant);
    const request: TrainingPlanRequest = {
      goal,
      level,
      frequency,
      duration,
      priorityMuscleGroups: priorityMuscles,
      availableEquipment: user?.equipments,
      gymProfileAvailability: availability,
      restrictions: user?.restrictions,
      returnToTraining: user?.returnToTraining,
      variantIndex: nextVariant,
    };
    const proposal = generateTrainingSplitProposal(request);
    setCurrentProposal(proposal);
  };

  // Avançar para preenchimento dos exercícios
  const handleProceedToExercises = () => {
    if (!currentProposal) return;
    const request: TrainingPlanRequest = {
      goal,
      level,
      frequency,
      duration,
      priorityMuscleGroups: priorityMuscles,
      availableEquipment: user?.equipments,
      gymProfileAvailability: availability,
      restrictions: user?.restrictions,
      returnToTraining: user?.returnToTraining,
    };
    const plan = generateTrainingPlanProgram(request, exercises, currentProposal);
    setGeneratedPlan(plan);
    setStep('exercise-preview');
  };

  // Salvar programa e fechar
  const handleSaveToMine = (andApply = false) => {
    if (!generatedPlan) return;
    saveCustomProgram(generatedPlan.program);
    if (andApply) {
      applyProgramToWeek(generatedPlan.program.id);
      setActiveView('planner');
    } else {
      setWorkoutsTab('mine');
      setActiveView('workouts');
    }
    onClose();
  };

  // Abrir no Construtor
  const handleOpenInBuilder = () => {
    if (!generatedPlan) return;
    saveCustomProgram(generatedPlan.program);
    const firstDay = generatedPlan.program.weeks[0]?.days[0];
    openWorkoutBuilder(
      {
        programId: generatedPlan.program.id,
        dayId: firstDay?.id,
        name: firstDay?.name || 'Treino A',
        sourceProgramName: generatedPlan.program.name,
        level: generatedPlan.program.level,
        volumeProfile: firstDay?.volumeProfile || 'standard',
        targetMinutes: firstDay?.targetMinutes || duration,
        slots: firstDay?.slots || [],
      },
      'workouts',
    );
    onClose();
  };

  // Edição inline de dia da divisão
  const handleUpdateSplitDay = (index: number, updates: Partial<ProposedSplitDay>) => {
    if (!currentProposal) return;
    const updatedDays = [...currentProposal.days];
    updatedDays[index] = { ...updatedDays[index], ...updates };
    setCurrentProposal({
      ...currentProposal,
      days: updatedDays,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fade-in">
      <div className="bg-gym-dark border border-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* HEADER */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gym-accent/15 border border-gym-accent/30 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-gym-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-white truncate">
                Assistente de Plano de Treino
              </h2>
              <p className="text-[10px] text-gym-text-muted truncate">
                {step === 'parameters' && 'Configuração orientada pelo seu perfil real'}
                {step === 'split-preview' && 'Estrutura semanal antes dos exercícios'}
                {step === 'exercise-preview' && 'Exercícios sugeridos e tempo estimado'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gym-text-muted hover:text-white p-2 rounded-xl bg-white/5 tap-target flex items-center justify-center"
            aria-label="Fechar assistente"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* BODY (SCROLLABLE) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* ETAPA 1: PARÂMETROS */}
          {step === 'parameters' && (
            <div className="space-y-4">
              <div className="bg-gym-card/60 border border-white/5 rounded-2xl p-4 space-y-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-gym-accent">
                  Seu Ponto de Partida
                </span>
                <p className="text-xs text-gym-text-muted leading-relaxed">
                  Os dados do seu cadastro já estão selecionados. Altere livremente o que deseja para este programa.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {/* Objetivo */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1">
                      Objetivo
                    </label>
                    <select
                      value={goal}
                      onChange={(e) => setGoal(e.target.value as TrainingGoal)}
                      className="w-full min-h-[44px] bg-gym-dark border border-white/10 rounded-xl px-3 text-xs text-white outline-none focus:border-gym-accent"
                    >
                      <option value="hypertrophy">Hipertrofia (Massa Magra)</option>
                      <option value="slimming">Definição / Emagrecimento</option>
                      <option value="strength">Força Máxima</option>
                      <option value="conditioning">Condicionamento e Saúde</option>
                      <option value="athlete">Preparação Atleta</option>
                    </select>
                  </div>

                  {/* Nível */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1">
                      Nível de Experiência
                    </label>
                    <select
                      value={level}
                      onChange={(e) => setLevel(e.target.value as TrainingExperienceLevel)}
                      className="w-full min-h-[44px] bg-gym-dark border border-white/10 rounded-xl px-3 text-xs text-white outline-none focus:border-gym-accent"
                    >
                      <option value="beginner">Iniciante</option>
                      <option value="intermediate">Intermediário</option>
                      <option value="advanced">Avançado</option>
                      <option value="athlete">Atleta / Pro</option>
                    </select>
                  </div>

                  {/* Frequência */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1">
                      Frequência Semanal
                    </label>
                    <div className="grid grid-cols-5 gap-1">
                      {[2, 3, 4, 5, 6].map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFrequency(f)}
                          className={`min-h-[44px] rounded-xl text-xs font-black border transition-all ${
                            frequency === f
                              ? 'bg-gym-accent text-gym-dark border-gym-accent shadow-md shadow-gym-accent/20'
                              : 'bg-gym-dark border-white/10 text-white hover:border-white/25'
                          }`}
                        >
                          {f}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Duração */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1">
                      Tempo por Treino
                    </label>
                    <div className="grid grid-cols-5 gap-1">
                      {[30, 45, 60, 75, 90].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDuration(d)}
                          className={`min-h-[44px] rounded-xl text-[10px] sm:text-xs font-bold border transition-all ${
                            duration === d
                              ? 'bg-gym-accent text-gym-dark border-gym-accent shadow-md shadow-gym-accent/20'
                              : 'bg-gym-dark border-white/10 text-white hover:border-white/25'
                          }`}
                        >
                          {d}m
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* PRIORIDADES MUSCULARES */}
              <div className="bg-gym-card/60 border border-white/5 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase text-gym-text-muted flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-gym-accent" />
                    Quais músculos você quer priorizar? (Opcional)
                  </label>
                  <span className="text-[10px] font-extrabold text-gym-accent">
                    {priorityMuscles.length}/3 selecionados
                  </span>
                </div>
                <p className="text-[11px] text-gym-text-muted leading-relaxed">
                  O assistente dará volume e presença extra para até 3 grupos, sem eliminar os grandes grupos corporais.
                </p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {PRIMARY_FOCUS_GROUPS.map((id) => {
                    const active = priorityMuscles.includes(id);
                    const disabled = !active && priorityMuscles.length >= 3;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleTogglePriority(id)}
                        disabled={disabled}
                        className={`min-h-[36px] px-3 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                          active
                            ? 'bg-gym-accent text-gym-dark border-gym-accent font-black shadow-sm'
                            : disabled
                            ? 'bg-white/5 border-transparent text-gym-text-muted opacity-40 cursor-not-allowed'
                            : 'bg-white/5 border-white/5 text-gym-text-muted hover:text-white hover:border-white/20'
                        }`}
                      >
                        {active && <Check className="w-3 h-3 stroke-[3px]" />}
                        {muscleGroupShortLabel(id)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CONTEXTO DE APARELHOS & RESTRIÇÕES */}
              <div className="bg-white/5 border border-white/5 rounded-2xl p-3 flex items-start gap-2.5 text-[11px] text-gym-text-muted">
                <Wrench className="w-4 h-4 text-gym-accent flex-shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold text-white block">Adaptação aos seus aparelhos</span>
                  <span>
                    {gymProfile
                      ? 'Perfil de academia ativo: apenas exercícios com máquinas disponíveis serão sugeridos.'
                      : 'Equipamentos padrão da academia considerados na seleção de exercícios.'}
                  </span>
                  {user?.restrictions && user.restrictions.length > 0 && (
                    <span className="block text-gym-amber mt-1">
                      Restrições informadas — revise os exercícios antes de aplicar ({user.restrictions.join(', ')}).
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ETAPA 2: PREVIEW DA DIVISÃO (ESTRUTURA ANTES DOS EXERCÍCIOS) */}
          {step === 'split-preview' && currentProposal && (
            <div className="space-y-4">
              <div className="bg-gym-accent/10 border border-gym-accent/25 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gym-accent">
                    Proposta de Divisão Semanal
                  </span>
                  <span className="text-[10px] font-bold text-gym-text-muted">
                    {currentProposal.frequency} treinos · {currentProposal.targetMinutes} min
                  </span>
                </div>
                <h3 className="text-base font-black text-white tracking-tight">
                  {currentProposal.name}
                </h3>
                <p className="text-xs text-gym-text-muted leading-relaxed">
                  {currentProposal.rationale}
                </p>
              </div>

              {/* LISTA DOS DIAS */}
              <div className="space-y-2.5">
                {currentProposal.days.map((day, idx) => (
                  <div
                    key={idx}
                    className="bg-gym-card/60 border border-white/5 rounded-2xl p-3.5 space-y-2 hover:border-gym-accent/20 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-extrabold text-gym-accent uppercase tracking-wider block">
                          {day.suggestedWeekday}
                        </span>
                        <h4 className="text-sm font-bold text-white truncate">{day.name}</h4>
                      </div>
                      <span className="text-[10px] font-bold text-gym-text-muted bg-white/5 px-2.5 py-1 rounded-lg flex-shrink-0">
                        ~{day.targetMinutes} min
                      </span>
                    </div>

                    {/* Foco muscular */}
                    <div className="flex flex-wrap gap-1">
                      {day.muscleGroupIds.map((m) => (
                        <span
                          key={m}
                          className="text-[9px] font-bold bg-white/5 border border-white/10 text-gym-text-muted px-2 py-0.5 rounded-full"
                        >
                          {muscleGroupShortLabel(m)}
                        </span>
                      ))}
                    </div>

                    <p className="text-[10px] text-gym-text-muted leading-relaxed">{day.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ETAPA 3: PREVIEW FINAL DOS EXERCÍCIOS */}
          {step === 'exercise-preview' && generatedPlan && (
            <div className="space-y-4">
              <div className="bg-gym-card/60 border border-white/5 rounded-2xl p-4 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gym-accent">
                  Plano Completo Gerado
                </span>
                <h3 className="text-base font-black text-white">{generatedPlan.program.name}</h3>
                <p className="text-xs text-gym-text-muted">
                  Exercícios selecionados deterministicamente respeitando tempo, nível, objetivo e aparelhos disponíveis.
                </p>
              </div>

              {generatedPlan.warnings.length > 0 && (
                <div className="bg-gym-amber/10 border border-gym-amber/25 rounded-2xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-gym-amber text-xs font-bold">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Avisos de Planejamento</span>
                  </div>
                  {generatedPlan.warnings.map((w, idx) => (
                    <p key={idx} className="text-[10px] text-gym-amber/90 leading-relaxed pl-5">
                      • {w}
                    </p>
                  ))}
                </div>
              )}

              {/* DIAS COM EXERCÍCIOS */}
              <div className="space-y-3">
                {generatedPlan.daysPreview.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-gym-card/60 border border-white/5 rounded-2xl overflow-hidden"
                  >
                    <div className="bg-white/5 px-3.5 py-2.5 flex items-center justify-between border-b border-white/5">
                      <div>
                        <span className="text-[9px] font-black text-gym-accent uppercase tracking-wider">
                          {item.day.suggestedWeekday}
                        </span>
                        <h4 className="text-xs font-bold text-white">{item.day.name}</h4>
                      </div>
                      <span className="text-[10px] font-bold text-gym-text-muted">
                        {item.exerciseCount} exercícios · ~{item.estimatedMinutes} min
                      </span>
                    </div>

                    <div className="divide-y divide-white/5">
                      {item.programDay.slots.map((slot, sIdx) => {
                        const ex = exercises.find((e) => e.id === slot.exerciseId);
                        return (
                          <div key={sIdx} className="p-3 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <h5 className="text-xs font-bold text-white truncate">
                                {ex?.name || slot.exerciseId}
                              </h5>
                              <p className="text-[9px] text-gym-text-muted capitalize">
                                {ex?.muscleGroup || 'Geral'} • Descanso {slot.restSec}s • RPE {slot.targetRPE}
                              </p>
                            </div>
                            <span className="text-xs font-black text-gym-accent font-mono whitespace-nowrap">
                              {slot.series} x {slot.repRange[0] === slot.repRange[1] ? slot.repRange[0] : `${slot.repRange[0]}-${slot.repRange[1]}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-gym-dark/95 flex flex-col sm:flex-row gap-2 justify-end">
          {step === 'parameters' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-5 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-bold text-gym-text-muted hover:text-white transition-all order-2 sm:order-1"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGenerateSplit}
                className="min-h-[44px] px-6 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-2xl text-xs uppercase tracking-wider transition-all shadow-md shadow-gym-accent/20 flex items-center justify-center gap-1.5 order-1 sm:order-2"
              >
                <Sparkles className="w-4 h-4 fill-gym-dark" />
                Gerar Divisão Semanal
              </button>
            </>
          )}

          {step === 'split-preview' && (
            <>
              <button
                type="button"
                onClick={() => setStep('parameters')}
                className="min-h-[44px] px-4 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-bold text-gym-text-muted hover:text-white transition-all order-3 sm:order-1"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleCycleVariant}
                className="min-h-[44px] px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-bold text-white transition-all flex items-center justify-center gap-1.5 order-2"
              >
                <RefreshCw className="w-3.5 h-3.5 text-gym-accent" />
                Gerar Outra Opção
              </button>
              <button
                type="button"
                onClick={handleProceedToExercises}
                className="min-h-[44px] px-6 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-2xl text-xs uppercase tracking-wider transition-all shadow-md shadow-gym-accent/20 flex items-center justify-center gap-1.5 order-1 sm:order-3"
              >
                Usar Esta Divisão
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 'exercise-preview' && (
            <>
              <button
                type="button"
                onClick={() => setStep('split-preview')}
                className="min-h-[44px] px-4 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-bold text-gym-text-muted hover:text-white transition-all order-4 sm:order-1"
              >
                Voltar para Divisão
              </button>
              <button
                type="button"
                onClick={handleOpenInBuilder}
                className="min-h-[44px] px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-bold text-white transition-all flex items-center justify-center gap-1.5 order-3 sm:order-2"
              >
                <Wrench className="w-3.5 h-3.5 text-gym-accent" />
                Editar no Construtor
              </button>
              <button
                type="button"
                onClick={() => handleSaveToMine(false)}
                className="min-h-[44px] px-5 bg-white/10 hover:bg-white/15 text-white font-bold rounded-2xl text-xs uppercase tracking-wider transition-all order-2 sm:order-3"
              >
                Salvar em Meus Treinos
              </button>
              <button
                type="button"
                onClick={() => handleSaveToMine(true)}
                className="min-h-[44px] px-6 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-2xl text-xs uppercase tracking-wider transition-all shadow-md shadow-gym-accent/20 flex items-center justify-center gap-1.5 order-1 sm:order-4"
              >
                <Calendar className="w-4 h-4 text-gym-dark" />
                Salvar e Aplicar à Semana
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
