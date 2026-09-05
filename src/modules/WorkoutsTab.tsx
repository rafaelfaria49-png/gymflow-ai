'use client';

import React, { useMemo, useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { WorkoutProgram, Exercise, ProgramDay } from '../types';
import {
  Calendar,
  ChevronRight,
  Clock,
  Copy,
  LayoutGrid,
  ListChecks,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  Wrench,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { estimateWorkoutDuration, muscleGroupsForSlots } from '../lib/workoutDuration';
import { defaultTargetMinutes } from '../lib/volumeProfiles';
import { programDayDisplayLabel } from '../lib/workout-day-naming';
import { slotsFromLegacyExercises } from '../lib/workout-program-normalization';
import { getProgramDays, resolveProgramDays } from '../lib/workout-program-days';
import {
  analyzeProgramDeletion,
  organizePrograms,
  type ProgramFilterKind,
  type ProgramSortKey,
} from '../lib/workout-program-actions';
import { WORKOUT_PROGRAM_TEMPLATES } from '../lib/workout-templates';
import { findProfileRecommendations } from '../lib/training-plan-assistant';
import { WorkoutProgramMenu, type WorkoutProgramMenuItem } from '../components/workout-builder/WorkoutProgramMenu';
import { WorkoutProgramDeleteDialog } from '../components/workout-builder/WorkoutProgramDeleteDialog';
import { TrainingPlanAssistantModal } from '../components/training-assistant/TrainingPlanAssistantModal';

export type WorkoutsHubSection = 'for_you' | 'ready' | 'mine' | 'scratch';

// Projeção somente de leitura para programas v1 que ainda têm apenas a lista achatada.
const displayDaysForProgram = (program: WorkoutProgram): ProgramDay[] => {
  const resolution = resolveProgramDays(program);
  if (resolution.kind === 'canonical') return resolution.days;

  const legacySlots = slotsFromLegacyExercises(program);
  if (legacySlots.length === 0) return [];
  return [{
    id: `legacy-display-${program.id}`,
    name: program.name,
    customName: program.name,
    dayNumber: 1,
    muscleGroupIds: [],
    volumeProfile: 'standard',
    slots: legacySlots,
  }];
};

const customProgramSummaryLabel = (program: WorkoutProgram): string => {
  const days = displayDaysForProgram(program);
  if (days.length > 1) return `${days.length} dias`;
  const count = days[0]?.slots.length ?? 0;
  return `${count} ${count === 1 ? 'exercício' : 'exercícios'}`;
};

const MUSCLE_GROUP_LABELS: Record<string, string> = {
  chest: 'Peito',
  back: 'Costas',
  shoulders: 'Ombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  legs: 'Pernas',
  glutes: 'Glúteos',
  abs: 'Abdômen',
  calves: 'Panturrilha',
  cardio: 'Cardio',
  mobility: 'Mobilidade',
  functional: 'Funcional',
};

const SORT_OPTIONS: { value: ProgramSortKey; label: string }[] = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'name', label: 'Nome' },
  { value: 'days', label: 'Quantidade de dias' },
];

export const WorkoutsTab = () => {
  const {
    programs,
    exercises,
    startWorkout,
    applyProgramToWeek,
    user,
    openWorkoutBuilder,
    workoutsTab,
    setWorkoutsTab,
    lastSavedProgramId,
    weeklyPlan,
    duplicateProgram,
    createProgramFromBase,
    deleteCustomProgram,
    planAssistantOpen,
    openPlanAssistant,
    closePlanAssistant,
  } = useGymFlow();

  // Seção ativa do Hub de Treinos (GOAL-024: Para você / Programas prontos / Meus treinos / Montar do zero)
  const [section, setSection] = useState<WorkoutsHubSection>(
    workoutsTab === 'mine' ? 'mine' : 'for_you',
  );

  // Filtros dos Programas Prontos
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedGoal, setSelectedGoal] = useState<string>('all');
  const [selectedFrequency, setSelectedFrequency] = useState<string>('all');

  const [selectedProgram, setSelectedProgram] = useState<WorkoutProgram | null>(null);
  const [programPendingDeletion, setProgramPendingDeletion] = useState<WorkoutProgram | null>(null);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ProgramSortKey>('recent');

  const customCount = useMemo(() => programs.filter((program) => program.isCustom).length, [programs]);
  const hasAnyCustom = customCount > 0;

  // Resumo dos cards (dias, duração média, grupos principais).
  const programsSignature = useMemo(
    () => programs
      .map((program) => {
        const days = displayDaysForProgram(program);
        const slots = days.reduce((total, day) => total + day.slots.length, 0);
        return `${program.id}:${days.length}:${slots}`;
      })
      .join('|'),
    [programs],
  );

  const cardSummaries = useMemo(() => {
    const map = new Map<string, { dayCount: number; avgMinutes: number; mainGroups: string[] }>();
    for (const program of programs) {
      const days = displayDaysForProgram(program);
      const durations = days.map((day) => estimateWorkoutDuration(day.slots).minutes);
      const avgMinutes = durations.length
        ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length)
        : 0;
      const groups: string[] = [];
      for (const day of days) {
        for (const group of muscleGroupsForSlots(day.slots, exercises)) {
          const label = MUSCLE_GROUP_LABELS[group] ?? group;
          if (!groups.includes(label)) groups.push(label);
        }
      }
      map.set(program.id, { dayCount: days.length, avgMinutes, mainGroups: groups.slice(0, 3) });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programsSignature, exercises]);

  // Recomendações personalizadas "Para você"
  const recommendations = useMemo(() => {
    return findProfileRecommendations(programs, {
      level: user?.level || 'intermediate',
      goal: user?.goal || 'hypertrophy',
      frequency: user?.frequency || 4,
    });
  }, [programs, user?.level, user?.goal, user?.frequency]);

  // Filtro de acordo com a seção ativa
  const kind: ProgramFilterKind = section === 'mine' ? 'mine' : 'ready';

  const organized = useMemo(
    () => organizePrograms(programs, { kind, query, sort, pinnedId: lastSavedProgramId }),
    [programs, kind, query, sort, lastSavedProgramId],
  );

  // Filtros aplicados à biblioteca de programas prontos
  const visibleReadyPrograms = useMemo(() => {
    return organized.filter((program) => {
      if (selectedLevel !== 'all' && program.level !== selectedLevel) return false;
      if (selectedFrequency !== 'all' && program.frequencyDays !== Number(selectedFrequency)) return false;
      if (selectedGoal !== 'all') {
        const text = `${program.objective} ${program.description} ${program.name}`.toLowerCase();
        if (!text.includes(selectedGoal.toLowerCase())) return false;
      }
      return true;
    });
  }, [organized, selectedLevel, selectedFrequency, selectedGoal]);

  const visiblePrograms = section === 'mine' ? organized : visibleReadyPrograms;

  const selectedProgramResolution = resolveProgramDays(selectedProgram);
  const selectedProgramHasLegacyExercises = selectedProgramResolution.kind === 'legacy-flat';
  const selectedProgramDays = selectedProgram ? displayDaysForProgram(selectedProgram) : [];

  const handleStartProgram = (program: WorkoutProgram) => {
    const resolution = resolveProgramDays(program);
    const days = resolution.kind === 'canonical' ? resolution.days : [];

    if (resolution.kind === 'legacy-flat') {
      startWorkout(program.id);
      setSelectedProgram(null);
      return;
    }

    if (days.length === 1) {
      startWorkout(program.id, undefined, days[0].id);
      setSelectedProgram(null);
      return;
    }

    setSelectedProgram(program);
  };

  const handleCreateWorkout = (creationStep: 'mode' | 'frequency' | 'template' = 'mode') => {
    openWorkoutBuilder(undefined, 'workouts', creationStep);
  };

  const handleEditProgram = (program: WorkoutProgram) => {
    const firstDay = getProgramDays(program)[0];
    const volumeProfile = firstDay?.volumeProfile ?? 'standard';
    openWorkoutBuilder(
      {
        programId: program.id,
        dayId: firstDay?.id,
        name: program.name,
        sourceProgramName: program.name,
        level: program.level,
        volumeProfile,
        targetMinutes: firstDay?.targetMinutes ?? user?.duration ?? defaultTargetMinutes(volumeProfile),
        slots: [],
      },
      'workouts',
    );
    setSelectedProgram(null);
  };

  const handleEditProgramDay = (program: WorkoutProgram, day: ProgramDay) => {
    const volumeProfile = day.volumeProfile ?? 'standard';
    openWorkoutBuilder(
      {
        programId: program.id,
        dayId: day.id,
        name: day.name,
        sourceProgramName: program.name,
        level: program.level,
        volumeProfile,
        targetMinutes: day.targetMinutes ?? user?.duration ?? defaultTargetMinutes(volumeProfile),
        slots: day.slots,
      },
      'workouts',
    );
    setSelectedProgram(null);
  };

  const menuItemsFor = (program: WorkoutProgram): WorkoutProgramMenuItem[] =>
    program.isCustom
      ? [
          { key: 'edit', label: 'Editar', icon: Pencil, onClick: () => handleEditProgram(program) },
          {
            key: 'duplicate',
            label: 'Duplicar',
            icon: Copy,
            onClick: () => {
              duplicateProgram(program.id);
              setSection('mine');
              setWorkoutsTab('mine');
            },
          },
          { key: 'delete', label: 'Excluir', icon: Trash2, destructive: true, onClick: () => setProgramPendingDeletion(program) },
        ]
      : [
          { key: 'base', label: 'Usar como base', icon: Wrench, onClick: () => createProgramFromBase(program.id) },
          { key: 'plan', label: 'Planejar semana', icon: Calendar, onClick: () => applyProgramToWeek(program.id) },
        ];

  const getExerciseDetails = (exId: string): Exercise | undefined => exercises.find((e) => e.id === exId);

  const clearFilters = () => {
    setQuery('');
    setSelectedLevel('all');
    setSelectedGoal('all');
    setSelectedFrequency('all');
  };

  const deletionImpact = programPendingDeletion
    ? analyzeProgramDeletion(programPendingDeletion, weeklyPlan)
    : null;

  const sectionsList: { id: WorkoutsHubSection; label: string }[] = [
    { id: 'for_you', label: 'Para você' },
    { id: 'ready', label: 'Programas prontos' },
    { id: 'mine', label: `Meus treinos${customCount > 0 ? ` (${customCount})` : ''}` },
    { id: 'scratch', label: 'Montar do zero' },
  ];

  const showCreateFirstEmptyState = visiblePrograms.length === 0 && section === 'mine' && !hasAnyCustom && query.trim() === '';
  const showNoResultsEmptyState = visiblePrograms.length === 0 && !showCreateFirstEmptyState;

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">Hub de Treinos</h1>
          <p className="text-xs text-gym-text-muted mt-0.5">
            Monte com o Assistente, escolha um programa pronto ou construa do zero — tudo salvo no seu aparelho.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={openPlanAssistant}
            className="bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black px-4 py-2.5 rounded-2xl transition-all shadow-md shadow-gym-accent/15 flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider min-h-[44px]"
          >
            <Sparkles className="w-4 h-4 fill-gym-dark" />
            Montar com Assistente
          </button>
          <button
            onClick={() => handleCreateWorkout('mode')}
            className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-extrabold px-4 py-2.5 rounded-2xl transition-all flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider min-h-[44px]"
          >
            <Wrench className="w-4 h-4 text-gym-accent" />
            Criar Treino
          </button>
          <button
            onClick={() => startWorkout(undefined, 'Treino Livre')}
            className="bg-white/5 hover:bg-white/10 border border-white/10 text-gym-text-muted hover:text-white font-bold px-3 py-2.5 rounded-2xl transition-all flex items-center justify-center gap-1.5 text-xs min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            Livre
          </button>
        </div>
      </div>

      {/* TABS PRINCIPAIS: PARA VOCÊ / PROGRAMAS PRONTOS / MEUS TREINOS / MONTAR DO ZERO */}
      <div className="flex bg-gym-card p-1 rounded-2xl border border-white/5 overflow-x-auto whitespace-nowrap">
        {sectionsList.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setSection(tab.id);
              if (tab.id === 'mine') {
                setWorkoutsTab('mine');
              } else {
                setWorkoutsTab('suggested');
              }
            }}
            aria-pressed={section === tab.id}
            className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all min-h-[44px] flex items-center justify-center gap-1.5 ${
              section === tab.id
                ? 'bg-white/10 text-white shadow'
                : 'text-gym-text-muted hover:text-white'
            }`}
          >
            {tab.id === 'for_you' && <Sparkles className="w-3.5 h-3.5 text-gym-accent" />}
            {tab.label}
          </button>
        ))}
      </div>

      {/* SEÇÃO: PARA VOCÊ (RECOMMENDED ENTRY) */}
      {section === 'for_you' && (
        <div className="space-y-6">
          {/* HERO BANNER: ASSISTENTE DE PLANO */}
          <div className="bg-gradient-to-br from-gym-accent/15 via-gym-card to-gym-dark border border-gym-accent/30 rounded-3xl p-6 lg:p-8 relative overflow-hidden">
            <div className="max-w-xl space-y-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-gym-accent bg-gym-accent/10 border border-gym-accent/20 px-3 py-1 rounded-full inline-block">
                Recomendado para sua rotina
              </span>
              <h2 className="text-xl lg:text-2xl font-black text-white tracking-tight">
                Monte sua Ficha com o Assistente de Treino
              </h2>
              <p className="text-xs text-gym-text-muted leading-relaxed">
                Baseado no seu perfil de {user?.goal || 'hipertrofia'}, nível {user?.level || 'intermediário'}, {user?.frequency || 4} dias por semana e {user?.duration || 60} minutos por treino. Divisão equilibrada sem repetições cegas e 100% adaptada aos seus aparelhos.
              </p>
              <div className="pt-2 flex flex-wrap gap-2">
                <button
                  onClick={openPlanAssistant}
                  className="bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black px-6 py-3 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-gym-accent/25 flex items-center gap-2 min-h-[44px]"
                >
                  <Sparkles className="w-4 h-4 fill-gym-dark" />
                  Iniciar Assistente de Plano
                </button>
              </div>
            </div>
          </div>

          {/* RECOMENDADOS DA BIBLIOTECA PRONTA */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Programas que Combinam com Você
                </h3>
                <p className="text-[11px] text-gym-text-muted">
                  Seleção pronta da biblioteca alinhada ao seu nível e objetivo atual.
                </p>
              </div>
              <button
                onClick={() => setSection('ready')}
                className="text-xs font-bold text-gym-accent hover:underline flex items-center gap-1"
              >
                Ver todos
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {recommendations.map(({ program: prog, matchReason }) => {
                const summary = cardSummaries.get(prog.id);
                return (
                  <div
                    key={prog.id}
                    className="glass hover:border-gym-accent/30 rounded-3xl p-5 flex flex-col justify-between transition-all duration-300 relative border border-white/5"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2.5 gap-2">
                        <span className="text-[10px] font-black uppercase bg-gym-accent/15 border border-gym-accent/25 text-gym-accent px-2.5 py-1 rounded-full">
                          Combina com você
                        </span>
                        <span className="text-[10px] font-extrabold text-gym-accent uppercase tracking-widest flex items-center gap-1 flex-shrink-0">
                          <Calendar className="w-3.5 h-3.5" />
                          {prog.frequencyDays}x por semana
                        </span>
                      </div>

                      <h4 className="text-base font-bold text-white tracking-tight">{prog.name}</h4>
                      <p className="text-[11px] text-gym-accent/90 font-medium mt-1">
                        {matchReason}
                      </p>
                      <p className="text-xs text-gym-text-muted mt-2 leading-relaxed line-clamp-2">
                        {prog.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[10px] text-gym-text-muted">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {summary?.dayCount ?? 0} dias
                        </span>
                        {summary && summary.avgMinutes > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> ~{summary.avgMinutes} min
                          </span>
                        )}
                        <span className="flex items-center gap-1 capitalize">
                          <Target className="w-3 h-3" /> {prog.level}
                        </span>
                      </div>

                      {summary && summary.mainGroups.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2.5">
                          {summary.mainGroups.map((group) => (
                            <span key={group} className="text-[9px] bg-white/5 border border-white/10 text-gym-text-muted px-2 py-0.5 rounded-full">
                              {group}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setSelectedProgram(prog)}
                        className="text-xs font-bold text-gym-accent hover:underline flex items-center gap-1 cursor-pointer min-h-[44px]"
                      >
                        Ver Detalhes
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => {
                            applyProgramToWeek(prog.id);
                          }}
                          className="bg-white/5 hover:bg-white/10 border border-white/10 p-2.5 rounded-xl transition-all min-h-[40px] text-[11px] font-bold text-white flex items-center gap-1"
                          title="Planejar na semana"
                        >
                          <Calendar className="w-3.5 h-3.5 text-gym-accent" />
                          Planejar
                        </button>
                        <button
                          onClick={() => handleStartProgram(prog)}
                          className="bg-gym-accent hover:bg-gym-accent-hover text-gym-dark p-2.5 rounded-xl transition-all min-h-[40px] flex items-center justify-center"
                          title="Iniciar Treino"
                          aria-label={`Iniciar ${prog.name}`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SEÇÃO: PROGRAMAS PRONTOS OU MEUS TREINOS */}
      {(section === 'ready' || section === 'mine') && (
        <div className="space-y-4">
          {/* BUSCA + ORDENAÇÃO */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-gym-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar treino por nome…"
                aria-label="Buscar treino por nome"
                className="w-full min-h-[44px] bg-gym-card border border-white/10 rounded-2xl pl-10 pr-4 text-sm text-white placeholder:text-gym-text-muted focus:border-gym-accent/40 outline-none transition-all"
              />
            </div>
            <label className="flex items-center gap-2 bg-gym-card border border-white/10 rounded-2xl px-3 min-h-[44px] flex-shrink-0">
              <span className="text-[10px] font-bold uppercase text-gym-text-muted">Ordenar</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as ProgramSortKey)}
                aria-label="Ordenar treinos"
                className="bg-transparent text-xs font-bold text-white outline-none py-2 pr-1"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} className="bg-gym-dark text-white">
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* FILTROS ADICIONAIS — apenas para Programas Prontos */}
          {section === 'ready' && (
            <div className="flex flex-wrap gap-2 pt-1">
              {/* Nível */}
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                aria-label="Filtrar por nível"
                className="bg-gym-card border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none min-h-[40px]"
              >
                <option value="all">Todos os níveis</option>
                <option value="beginner">🟢 Iniciante</option>
                <option value="intermediate">🟡 Intermediário</option>
                <option value="advanced">🔴 Avançado</option>
                <option value="athlete">⚡ Atleta</option>
              </select>

              {/* Frequência */}
              <select
                value={selectedFrequency}
                onChange={(e) => setSelectedFrequency(e.target.value)}
                aria-label="Filtrar por frequência"
                className="bg-gym-card border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none min-h-[40px]"
              >
                <option value="all">Todas as frequências</option>
                <option value="2">2 dias/sem</option>
                <option value="3">3 dias/sem</option>
                <option value="4">4 dias/sem</option>
                <option value="5">5 dias/sem</option>
                <option value="6">6 dias/sem</option>
              </select>

              {/* Objetivo */}
              <select
                value={selectedGoal}
                onChange={(e) => setSelectedGoal(e.target.value)}
                aria-label="Filtrar por objetivo"
                className="bg-gym-card border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none min-h-[40px]"
              >
                <option value="all">Todos os objetivos</option>
                <option value="hipertrofia">Hipertrofia</option>
                <option value="força">Força</option>
                <option value="emagrec">Definição / Emagrecimento</option>
                <option value="condicionamento">Condicionamento</option>
              </select>

              {(selectedLevel !== 'all' || selectedFrequency !== 'all' || selectedGoal !== 'all' || query.trim() !== '') && (
                <button
                  onClick={clearFilters}
                  className="text-xs font-bold text-gym-accent px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all min-h-[40px]"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}

          {/* ESTADO VAZIO — Meus treinos vazio */}
          {showCreateFirstEmptyState && (
            <div className="glass p-10 text-center rounded-3xl border border-white/5 space-y-4 flex flex-col items-center">
              <Wrench className="w-12 h-12 text-gym-text-muted opacity-40" />
              <div>
                <h3 className="text-base font-bold text-white">Você ainda não criou um treino personalizado</h3>
                <p className="text-xs text-gym-text-muted max-w-sm mt-1">
                  Monte um plano completo com o Assistente ou comece uma ficha do zero.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-center w-full max-w-md">
                <button
                  onClick={openPlanAssistant}
                  className="min-h-[44px] px-5 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4 fill-gym-dark" /> Montar com Assistente
                </button>
                <button
                  onClick={() => handleCreateWorkout('mode')}
                  className="min-h-[44px] px-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Criar do zero
                </button>
              </div>
            </div>
          )}

          {/* ESTADO VAZIO — Busca sem resultado */}
          {showNoResultsEmptyState && (
            <div className="glass p-10 text-center rounded-3xl border border-white/5 space-y-3 flex flex-col items-center">
              <Search className="w-10 h-10 text-gym-text-muted opacity-40" />
              <h3 className="text-base font-bold text-white">Não encontramos treinos para esta busca</h3>
              <button
                onClick={clearFilters}
                className="min-h-[44px] px-6 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-2xl text-xs transition-all"
              >
                Limpar filtros
              </button>
            </div>
          )}

          {/* LISTA DE PROGRAMAS (GRID) */}
          {visiblePrograms.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visiblePrograms.map((prog) => {
                const isRecentlySaved = prog.isCustom && prog.id === lastSavedProgramId;
                const summary = cardSummaries.get(prog.id);
                return (
                  <div
                    key={prog.id}
                    className={`glass hover:border-gym-accent/20 rounded-3xl p-5 flex flex-col justify-between transition-all duration-300 relative ${
                      isRecentlySaved ? 'ring-2 ring-gym-accent shadow-lg shadow-gym-accent/20' : ''
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-3 gap-2">
                        {prog.isCustom ? (
                          <span className="text-[10px] font-black uppercase bg-gym-accent/15 border border-gym-accent/20 text-gym-accent px-2.5 py-1 rounded-full">
                            {isRecentlySaved ? 'Recém-criado' : 'Personalizado'}
                          </span>
                        ) : (
                          <span className="text-[10px] font-black uppercase bg-white/5 border border-white/10 text-gym-text-muted px-2.5 py-1 rounded-full">
                            Programa pronto
                          </span>
                        )}
                        <span className="text-[10px] font-extrabold text-gym-accent uppercase tracking-widest flex items-center gap-1 flex-shrink-0">
                          <Calendar className="w-3.5 h-3.5" />
                          {prog.isCustom ? customProgramSummaryLabel(prog) : `${prog.frequencyDays}x por semana`}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-white tracking-tight mt-1">{prog.name}</h3>
                      <p className="text-xs text-gym-text-muted mt-2 leading-relaxed line-clamp-2">{prog.description}</p>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[10px] text-gym-text-muted">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {summary?.dayCount ?? 0} {(summary?.dayCount ?? 0) === 1 ? 'dia' : 'dias'}
                        </span>
                        {summary && summary.avgMinutes > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> ~{summary.avgMinutes} min
                          </span>
                        )}
                        <span className="flex items-center gap-1 capitalize">
                          <Target className="w-3 h-3" /> {prog.level}
                        </span>
                      </div>

                      {summary && summary.mainGroups.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2.5">
                          {summary.mainGroups.map((group) => (
                            <span key={group} className="text-[9px] bg-white/5 border border-white/10 text-gym-text-muted px-2 py-0.5 rounded-full">
                              {group}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setSelectedProgram(prog)}
                        className="text-xs font-bold text-gym-accent hover:underline flex items-center gap-1.5 cursor-pointer min-h-[44px]"
                      >
                        Ver Detalhes
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <WorkoutProgramMenu label={`Ações de ${prog.name}`} items={menuItemsFor(prog)} />
                        <button
                          onClick={() => handleStartProgram(prog)}
                          className="bg-white/5 hover:bg-gym-accent/15 hover:text-gym-accent border border-white/10 hover:border-gym-accent/20 p-2.5 rounded-xl transition-all tap-target flex items-center justify-center min-h-[40px] min-w-[40px]"
                          title={getProgramDays(prog).length > 1 ? 'Escolher dia do treino' : 'Iniciar Treino'}
                          aria-label={`Iniciar ${prog.name}`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SEÇÃO: MONTAR DO ZERO */}
      {section === 'scratch' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => handleCreateWorkout('mode')}
              className="glass p-5 rounded-3xl border border-white/10 hover:border-gym-accent/30 text-left transition-all space-y-3 group min-h-[44px]"
            >
              <div className="w-10 h-10 rounded-2xl bg-gym-accent/15 border border-gym-accent/25 flex items-center justify-center text-gym-accent group-hover:scale-105 transition-transform">
                <Plus className="w-5 h-5 stroke-[2.5px]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Programa em Branco</h3>
                <p className="text-[11px] text-gym-text-muted mt-1 leading-relaxed">
                  Comece com uma tela limpa e adicione dias, focos e exercícios livremente.
                </p>
              </div>
            </button>

            <button
              onClick={() => handleCreateWorkout('frequency')}
              className="glass p-5 rounded-3xl border border-white/10 hover:border-gym-accent/30 text-left transition-all space-y-3 group min-h-[44px]"
            >
              <div className="w-10 h-10 rounded-2xl bg-gym-accent/15 border border-gym-accent/25 flex items-center justify-center text-gym-accent group-hover:scale-105 transition-transform">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Usar Minha Frequência</h3>
                <p className="text-[11px] text-gym-text-muted mt-1 leading-relaxed">
                  Inicia com {user?.frequency || 4} dias vazios preparados para sua rotina semanal.
                </p>
              </div>
            </button>

            <button
              onClick={() => handleCreateWorkout('template')}
              className="glass p-5 rounded-3xl border border-white/10 hover:border-gym-accent/30 text-left transition-all space-y-3 group min-h-[44px]"
            >
              <div className="w-10 h-10 rounded-2xl bg-gym-accent/15 border border-gym-accent/25 flex items-center justify-center text-gym-accent group-hover:scale-105 transition-transform">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Começar com Template</h3>
                <p className="text-[11px] text-gym-text-muted mt-1 leading-relaxed">
                  Escolha uma divisão clássica (Full Body, Upper/Lower, PPL) como ponto de partida.
                </p>
              </div>
            </button>
          </div>

          {/* TEMPLATES ESTRUTURAIS DISPONÍVEIS */}
          <div className="space-y-3">
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              Templates Estruturais Catalogados ({WORKOUT_PROGRAM_TEMPLATES.length})
            </h3>
            <p className="text-[11px] text-gym-text-muted">
              Estruturas validadas sem exercícios pré-definidos — você escolhe os exercícios no Construtor.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {WORKOUT_PROGRAM_TEMPLATES.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="bg-gym-card/60 border border-white/5 rounded-3xl p-5 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-white">{tmpl.name}</h4>
                      <span className="text-[10px] font-extrabold text-gym-accent bg-white/5 px-2.5 py-1 rounded-full">
                        {tmpl.days.length} dias
                      </span>
                    </div>
                    <p className="text-xs text-gym-text-muted leading-relaxed">
                      {tmpl.description}
                    </p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {tmpl.tags.map((tag) => (
                        <span key={tag} className="text-[9px] bg-white/5 border border-white/10 text-gym-text-muted px-2 py-0.5 rounded-full">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/5 flex justify-end">
                    <button
                      onClick={() => handleCreateWorkout('template')}
                      className="min-h-[40px] px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <Wrench className="w-3.5 h-3.5 text-gym-accent" />
                      Usar no Construtor
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALHES DO PROGRAMA */}
      {selectedProgram && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gym-dark border border-white/10 rounded-3xl w-full max-w-2xl p-6 lg:p-8 relative max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setSelectedProgram(null)}
              className="absolute top-4 right-4 text-gym-text-muted hover:text-white p-2 rounded-lg bg-white/5 tap-target"
              aria-label="Fechar detalhes"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <span className="text-[10px] font-extrabold text-gym-accent uppercase tracking-widest block mb-1">
                Ficha de Treino Detalhada
              </span>
              <h2 className="text-xl lg:text-2xl font-black text-white tracking-tight">{selectedProgram.name}</h2>
              <p className="text-xs text-gym-text-muted mt-1 leading-relaxed">{selectedProgram.description}</p>

              {/* Informações Rápidas */}
              <div className="grid grid-cols-3 gap-3 my-5 bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex flex-col items-center text-center">
                  <Clock className="w-4 h-4 text-gym-accent mb-1" />
                  <span className="text-[10px] text-gym-text-muted uppercase">Duração</span>
                  <span className="text-xs font-bold text-white">{selectedProgram.durationWeeks} semanas</span>
                </div>
                <div className="flex flex-col items-center text-center">
                  <Calendar className="w-4 h-4 text-gym-accent mb-1" />
                  <span className="text-[10px] text-gym-text-muted uppercase">Frequência</span>
                  <span className="text-xs font-bold text-white">{selectedProgram.frequencyDays} dias/sem</span>
                </div>
                <div className="flex flex-col items-center text-center">
                  <Target className="w-4 h-4 text-gym-accent mb-1" />
                  <span className="text-[10px] text-gym-text-muted uppercase">Objetivo</span>
                  <span className="text-xs font-bold text-white truncate max-w-full">{selectedProgram.objective}</span>
                </div>
              </div>

              {/* Estrutura real do programa: Dias e Slots */}
              <h4 className="text-xs font-bold uppercase tracking-wider text-gym-text-muted mb-3 pl-1">
                Divisão de Treinos ({selectedProgramDays.length} {selectedProgramDays.length === 1 ? 'dia' : 'dias'})
              </h4>

              <div className="space-y-4">
                {selectedProgramDays.map((day) => {
                  const estimate = estimateWorkoutDuration(day.slots);
                  return (
                    <div key={day.id} className="bg-gym-card/50 border border-white/5 rounded-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-3.5 py-2.5 bg-white/5 border-b border-white/5 gap-2">
                        <div className="min-w-0">
                          <h5 className="text-xs font-black text-white truncate">{programDayDisplayLabel(day)}</h5>
                          <p className="mt-0.5 text-[9px] font-semibold text-gym-text-muted">
                            {estimate.exerciseCount} {estimate.exerciseCount === 1 ? 'exercício' : 'exercícios'} · duração aproximada de {estimate.minutes} min
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {selectedProgram.isCustom && !selectedProgramHasLegacyExercises && (
                            <button
                              onClick={() => handleEditProgramDay(selectedProgram, day)}
                              className="min-h-[32px] text-[9px] bg-white/5 hover:bg-white/10 border border-white/10 text-white font-extrabold px-3 py-1.5 rounded-lg uppercase tracking-wider flex items-center gap-1"
                            >
                              <Pencil className="w-3 h-3 text-gym-accent" /> Editar
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (selectedProgramHasLegacyExercises) {
                                handleStartProgram(selectedProgram);
                                return;
                              }
                              startWorkout(selectedProgram.id, undefined, day.id);
                              setSelectedProgram(null);
                            }}
                            className="min-h-[32px] text-[9px] bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold px-3 py-1.5 rounded-lg uppercase tracking-wider flex items-center gap-1"
                          >
                            <Play className="w-3 h-3 fill-gym-dark" /> Iniciar
                          </button>
                        </div>
                      </div>
                      <div className="divide-y divide-white/5">
                        {day.slots.map((slot, idx) => {
                          const ex = getExerciseDetails(slot.exerciseId);
                          return (
                            <div key={idx} className="p-3 flex items-center justify-between">
                              <div>
                                <h6 className="text-xs font-bold text-white">{ex?.name || 'Exercício Desconhecido'}</h6>
                                <p className="text-[10px] text-gym-text-muted capitalize">
                                  {ex?.muscleGroup || 'Geral'} • Descanso {slot.restSec}s • RPE {slot.targetRPE}
                                </p>
                              </div>
                              <span className="text-xs font-extrabold text-gym-accent font-mono whitespace-nowrap">
                                {slot.series} x {slot.repRange[0] === slot.repRange[1] ? slot.repRange[0] : `${slot.repRange[0]}-${slot.repRange[1]}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Botões */}
              <div className="flex flex-col sm:flex-row gap-3 mt-8">
                {selectedProgram.isCustom ? (
                  <button
                    onClick={() => handleEditProgram(selectedProgram)}
                    className="flex-1 min-h-[44px] py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5 text-gym-accent" /> Editar programa
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      createProgramFromBase(selectedProgram.id);
                    }}
                    className="flex-1 min-h-[44px] py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5"
                  >
                    <Wrench className="w-3.5 h-3.5 text-gym-accent" /> Usar como base
                  </button>
                )}
                <button
                  onClick={() => {
                    applyProgramToWeek(selectedProgram.id);
                    setSelectedProgram(null);
                  }}
                  className="flex-1 min-h-[44px] py-3 bg-white/5 hover:bg-white/10 border border-gym-accent/30 text-gym-accent rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Planejar Semana
                </button>
                {selectedProgramDays.length === 1 || selectedProgramHasLegacyExercises ? (
                  <button
                    onClick={() => handleStartProgram(selectedProgram)}
                    className="flex-1 min-h-[44px] py-3 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-gym-accent/15 flex items-center justify-center gap-1.5"
                  >
                    Iniciar Treino Agora
                    <Play className="w-3.5 h-3.5 fill-gym-dark" />
                  </button>
                ) : (
                  <div className="flex-1 min-h-[44px] py-3 px-4 bg-gym-accent/10 border border-gym-accent/25 text-gym-accent rounded-xl text-[10px] font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 text-center">
                    <ListChecks className="w-3.5 h-3.5 flex-shrink-0" />
                    {selectedProgramDays.length > 1
                      ? 'Escolha um dia acima para iniciar'
                      : 'Programa sem dias disponíveis'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DIÁLOGO DE EXCLUSÃO */}
      <WorkoutProgramDeleteDialog
        isOpen={programPendingDeletion !== null}
        program={programPendingDeletion}
        impact={deletionImpact}
        onConfirm={() => {
          if (programPendingDeletion) deleteCustomProgram(programPendingDeletion.id);
          setProgramPendingDeletion(null);
        }}
        onCancel={() => setProgramPendingDeletion(null)}
      />

      {/* ASSISTENTE DE PLANO MODAL (GOAL-024) */}
      <TrainingPlanAssistantModal
        isOpen={planAssistantOpen}
        onClose={closePlanAssistant}
        initialFrequency={user?.frequency || 4}
        initialGoal={user?.goal}
        initialLevel={user?.level}
        initialDuration={user?.duration || 60}
      />
    </div>
  );
};
