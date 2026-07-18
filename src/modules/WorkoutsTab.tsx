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
  Target,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { estimateWorkoutDuration, muscleGroupsForSlots } from '../lib/workoutDuration';
import { programDayDisplayLabel } from '../lib/workout-day-naming';
import { slotsFromLegacyExercises } from '../lib/workout-program-normalization';
import { getProgramDays, resolveProgramDays } from '../lib/workout-program-days';
import {
  analyzeProgramDeletion,
  organizePrograms,
  type ProgramFilterKind,
  type ProgramSortKey,
} from '../lib/workout-program-actions';
import { WorkoutProgramMenu, type WorkoutProgramMenuItem } from '../components/workout-builder/WorkoutProgramMenu';
import { WorkoutProgramDeleteDialog } from '../components/workout-builder/WorkoutProgramDeleteDialog';

// Projeção somente de leitura para programas v1 que ainda têm apenas a lista achatada.
// O id sintético nunca é persistido nem enviado ao Context; serve para o card/modal
// exibirem esse legado honestamente como o único treino que ele representa.
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

// GOAL-19A: um treino do Construtor pode ter vários dias. Contar só os exercícios do
// primeiro dia diria "5 exercícios" para um programa de 4 dias — por isso o rótulo
// passa a depender da estrutura real do programa.
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
  } = useGymFlow();

  const [selectedLevel, setSelectedLevel] = useState<'beginner' | 'intermediate' | 'advanced' | 'athlete'>(
    user?.level || 'intermediate',
  );
  const [selectedProgram, setSelectedProgram] = useState<WorkoutProgram | null>(null);
  const [programPendingDeletion, setProgramPendingDeletion] = useState<WorkoutProgram | null>(null);

  // GOAL-19B: filtro (Todos / Meus / Prontos), busca e ordenação da lista real. O valor
  // inicial vem do contexto: ao voltar do Construtor após salvar (workoutsTab='mine'), a
  // aba remonta já em "Meus treinos" — sem precisar de efeito de sincronização.
  const [kind, setKind] = useState<ProgramFilterKind>(workoutsTab === 'mine' ? 'mine' : 'ready');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ProgramSortKey>('recent');

  const customCount = useMemo(() => programs.filter((program) => program.isCustom).length, [programs]);
  const hasAnyCustom = customCount > 0;

  // Resumo dos cards (dias, duração média, grupos principais). Memoizado por assinatura
  // leve (id + nº de dias + nº de slots) — a estimativa de duração só recalcula quando
  // a estrutura muda, nunca a cada render (PART 11).
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

  const organized = useMemo(
    () => organizePrograms(programs, { kind, query, sort, pinnedId: lastSavedProgramId }),
    [programs, kind, query, sort, lastSavedProgramId],
  );
  // O filtro por nível continua valendo só para a biblioteca de programas prontos.
  const visiblePrograms = kind === 'ready'
    ? organized.filter((program) => program.level === selectedLevel)
    : organized;
  const selectedProgramResolution = resolveProgramDays(selectedProgram);
  const selectedProgramHasLegacyExercises = selectedProgramResolution.kind === 'legacy-flat';
  const selectedProgramDays = selectedProgram ? displayDaysForProgram(selectedProgram) : [];

  const handleStartProgram = (program: WorkoutProgram) => {
    const resolution = resolveProgramDays(program);
    const days = resolution.kind === 'canonical' ? resolution.days : [];

    if (resolution.kind === 'legacy-flat') {
      // Compatibilidade v1 explícita: uma lista achatada representa um único treino
      // legado. O resolver do Context mantém esse caminho separado de programa vazio.
      startWorkout(program.id);
      setSelectedProgram(null);
      return;
    }

    if (days.length === 1) {
      // Mesmo para um programa de um dia, informar o ID torna a origem inequívoca.
      startWorkout(program.id, undefined, days[0].id);
      setSelectedProgram(null);
      return;
    }

    // Programas multi-dia nunca iniciam silenciosamente o primeiro dia. O modal
    // existente é o seletor canônico e também explica programas sem dias válidos.
    setSelectedProgram(program);
  };

  const handleCreateWorkout = (creationStep: 'mode' | 'frequency' | 'template' = 'mode') => {
    openWorkoutBuilder(undefined, 'workouts', creationStep);
  };

  const handleEditProgram = (program: WorkoutProgram) => {
    const firstDay = getProgramDays(program)[0];
    openWorkoutBuilder(
      {
        programId: program.id,
        dayId: firstDay?.id,
        name: program.name,
        level: program.level,
        volumeProfile: firstDay?.volumeProfile ?? 'standard',
        targetMinutes: firstDay?.targetMinutes ?? estimateWorkoutDuration(firstDay?.slots ?? []).minutes,
        slots: [],
      },
      'workouts',
    );
    setSelectedProgram(null);
  };

  const handleEditProgramDay = (program: WorkoutProgram, day: ProgramDay) => {
    openWorkoutBuilder(
      {
        programId: program.id,
        dayId: day.id,
        name: day.name,
        level: program.level,
        volumeProfile: day.volumeProfile ?? 'standard',
        targetMinutes: estimateWorkoutDuration(day.slots).minutes,
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
              setKind('mine'); // a cópia aparece imediatamente em "Meus treinos"
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
    setKind('all');
  };

  const deletionImpact = programPendingDeletion
    ? analyzeProgramDeletion(programPendingDeletion, weeklyPlan)
    : null;

  const filters: { id: ProgramFilterKind; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'mine', label: `Meus treinos${customCount > 0 ? ` (${customCount})` : ''}` },
    { id: 'ready', label: 'Programas prontos' },
  ];

  const showCreateFirstEmptyState = visiblePrograms.length === 0 && kind === 'mine' && !hasAnyCustom && query.trim() === '';
  const showNoResultsEmptyState = visiblePrograms.length === 0 && !showCreateFirstEmptyState;

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">Programas de Treino</h1>
          <p className="text-xs text-gym-text-muted mt-0.5">
            Monte o seu ou comece por uma estrutura pronta — tudo editável e salvo no aparelho.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleCreateWorkout('mode')}
            className="bg-white/5 hover:bg-white/10 border border-gym-accent/30 text-gym-accent font-extrabold px-5 py-3 rounded-2xl transition-all flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider"
          >
            <Wrench className="w-4 h-4" />
            Criar Treino
          </button>
          <button
            onClick={() => startWorkout(undefined, 'Treino Livre')}
            className="bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold px-5 py-3 rounded-2xl transition-all shadow-md shadow-gym-accent/15 flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider"
          >
            <Plus className="w-4 h-4 text-gym-dark stroke-[3px]" />
            Treino Rápido Livre
          </button>
        </div>
      </div>

      {/* FILTRO: TODOS / MEUS / PRONTOS */}
      <div className="flex bg-gym-card p-1 rounded-2xl border border-white/5 overflow-x-auto whitespace-nowrap">
        {filters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => {
              setKind(filter.id);
              setWorkoutsTab(filter.id === 'mine' ? 'mine' : 'suggested');
            }}
            aria-pressed={kind === filter.id}
            className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
              kind === filter.id ? 'bg-white/10 text-white shadow' : 'text-gym-text-muted hover:text-white'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

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

      {/* TABS DE NÍVEIS — só para a biblioteca de programas prontos */}
      {kind === 'ready' && (
        <div className="flex bg-gym-card p-1 rounded-2xl border border-white/5 overflow-x-auto whitespace-nowrap">
          {[
            { id: 'beginner', label: '🟢 Iniciante' },
            { id: 'intermediate', label: '🟡 Intermediário' },
            { id: 'advanced', label: '🔴 Avançado' },
            { id: 'athlete', label: '⚡ Atleta' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedLevel(tab.id as typeof selectedLevel)}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
                selectedLevel === tab.id ? 'bg-white/10 text-white shadow' : 'text-gym-text-muted hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ESTADO VAZIO — sem nenhum treino personalizado (PART 12) */}
      {showCreateFirstEmptyState && (
        <div className="glass p-10 text-center rounded-3xl border border-white/5 space-y-4 flex flex-col items-center">
          <Wrench className="w-12 h-12 text-gym-text-muted opacity-40" />
          <div>
            <h3 className="text-base font-bold text-white">Você ainda não criou um treino personalizado</h3>
            <p className="text-xs text-gym-text-muted max-w-sm mt-1">
              Comece do jeito que preferir — os programas prontos continuam disponíveis na aba &quot;Programas prontos&quot;.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-center w-full max-w-md">
            <button
              onClick={() => handleCreateWorkout('mode')}
              className="min-h-[44px] px-5 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4 stroke-[3px]" /> Criar do zero
            </button>
            <button
              onClick={() => handleCreateWorkout('frequency')}
              className="min-h-[44px] px-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-1.5"
            >
              <Calendar className="w-4 h-4 text-gym-accent" /> Usar minha frequência
            </button>
            <button
              onClick={() => handleCreateWorkout('template')}
              className="min-h-[44px] px-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-1.5"
            >
              <LayoutGrid className="w-4 h-4 text-gym-accent" /> Escolher template
            </button>
          </div>
        </div>
      )}

      {/* ESTADO VAZIO — busca/filtro sem resultado (PART 12) */}
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

      {/* PROGRAMAS LIST */}
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

                  {/* STATS */}
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
                      className="bg-white/5 hover:bg-gym-accent/15 hover:text-gym-accent border border-white/10 hover:border-gym-accent/20 p-2.5 rounded-xl transition-all tap-target flex items-center justify-center"
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

      {/* DETALHES DO PROGRAMA MODAL */}
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

              {/* Estrutura real do programa: Dias e Slots (GOAL-07) */}
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
    </div>
  );
};
