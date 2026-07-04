'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { Exercise, ExerciseSlot, ProgressionType, ProgramDay, UserProfile, VolumeProfile, WorkoutProgram } from '../types';
import { VOLUME_PROFILES, defaultTargetMinutes } from '../lib/volumeProfiles';
import { estimateWorkoutDuration, muscleGroupsForSlots, buildDurationWarning } from '../lib/workoutDuration';
import { useToast } from '../components/ui/Toast';
import {
  ChevronLeft,
  Plus,
  Search,
  X,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Play,
  Save,
  Calendar,
  Dumbbell,
  Layers,
  Clock,
  Activity,
  AlertTriangle
} from 'lucide-react';

const MUSCLE_FILTERS = [
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

// GOAL-10.5: Construtor de Treino manual — cria/edita UM treino (dia) real por vez.
// Cada "Salvar" vira um WorkoutProgram de 1 dia em customPrograms (isCustom: true);
// não agrupa múltiplos dias no mesmo programa para nunca arriscar sobrescrever um
// dia irmão (ver docs/DECISOES.md GOAL-10.5).
export const WorkoutBuilder = () => {
  const {
    user,
    exercises,
    builderDraft,
    builderReturnView,
    setActiveView,
    saveCustomProgram,
    startWorkout,
    weeklyPlan,
    assignDayToWeekday
  } = useGymFlow();
  const toast = useToast();

  const [name, setName] = useState(builderDraft?.name ?? 'Meu Treino');
  const [level, setLevel] = useState<UserProfile['level']>(builderDraft?.level ?? user?.level ?? 'intermediate');
  const [volumeProfile, setVolumeProfileState] = useState<VolumeProfile>(builderDraft?.volumeProfile ?? 'standard');
  const [targetMinutes, setTargetMinutes] = useState<number>(
    builderDraft?.targetMinutes ?? defaultTargetMinutes(builderDraft?.volumeProfile ?? 'standard')
  );
  const [slots, setSlots] = useState<ExerciseSlot[]>(builderDraft?.slots ?? []);

  // GOAL-10.5: ids finais resolvidos PREGUIÇOSAMENTE e cacheados pela sessão do
  // Construtor (useRef, não useState — não precisa re-render ao definir). Sem isso,
  // clicar "Planejar" em 2 dias diferentes (ou Salvar e depois Iniciar) mintaria um
  // `custom_${Date.now()}` novo a cada clique, duplicando o mesmo treino em vez de
  // atualizar/referenciar o que acabou de ser salvo.
  const idsRef = useRef<{ programId: string; dayId: string } | null>(
    builderDraft?.programId && builderDraft?.dayId
      ? { programId: builderDraft.programId, dayId: builderDraft.dayId }
      : null
  );

  const resolveIds = () => {
    if (!idsRef.current) {
      const newProgramId = `custom_${Date.now()}`;
      idsRef.current = { programId: newProgramId, dayId: `${newProgramId}_day` };
    }
    return idsRef.current;
  };

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('all');

  const derivedMuscleGroups = useMemo(() => muscleGroupsForSlots(slots, exercises), [slots, exercises]);
  const estimate = useMemo(() => estimateWorkoutDuration(slots), [slots]);
  const warning = buildDurationWarning(estimate.minutes, targetMinutes);

  const filteredPickerExercises = exercises.filter((ex) => {
    const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase());
    const matchesMuscle = muscleFilter === 'all' || ex.muscleGroup === muscleFilter;
    return matchesSearch && matchesMuscle;
  });

  const handleProfileChange = (p: VolumeProfile) => {
    setVolumeProfileState(p);
    setTargetMinutes(defaultTargetMinutes(p));
  };

  const handleAddExercise = (ex: Exercise) => {
    // Exercícios sem sinergistas secundários tratados como isolados (faixa de reps
    // mais alta, menos descanso) — mesma heurística usada nos helpers comp/iso do
    // mock/programs.ts, sem precisar duplicar a lista de exercícios "compostos".
    const isIsolated = !ex.secondaryMuscles || ex.secondaryMuscles.length === 0;
    const newSlot: ExerciseSlot = {
      exerciseId: ex.id,
      series: 3,
      repRange: isIsolated ? [10, 15] : [8, 10],
      targetRPE: 8,
      restSec: isIsolated ? 75 : 120,
      progression: 'dupla',
      incrementKg: isIsolated ? 1 : 2.5
    };
    setSlots((prev) => [...prev, newSlot]);
    setPickerOpen(false);
    toast.success(`"${ex.name}" adicionado ao treino.`);
  };

  const updateSlot = (idx: number, fields: Partial<ExerciseSlot>) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...fields } : s)));
  };

  const removeSlot = (idx: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== idx));
  };

  const duplicateSlot = (idx: number) => {
    setSlots((prev) => {
      const copy = [...prev];
      copy.splice(idx + 1, 0, { ...prev[idx] });
      return copy;
    });
  };

  const moveSlot = (idx: number, direction: -1 | 1) => {
    setSlots((prev) => {
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  };

  const buildProgramFromDraft = (): { program: WorkoutProgram; day: ProgramDay } => {
    const { programId: finalProgramId, dayId: finalDayId } = resolveIds();
    const finalName = name.trim() || 'Meu Treino';
    const day: ProgramDay = {
      id: finalDayId,
      name: finalName,
      slots,
      volumeProfile
    };
    const program: WorkoutProgram = {
      id: finalProgramId,
      name: finalName,
      durationWeeks: 0,
      frequencyDays: 1,
      level,
      objective: 'Treino personalizado criado no Construtor de Treino',
      exercises: [],
      description: 'Treino criado manualmente pelo usuário no Construtor de Treino.',
      repeatWeeks: true,
      weeks: [{ number: 1, days: [day] }],
      isCustom: true
    };
    return { program, day };
  };

  const handleCancel = () => setActiveView(builderReturnView);

  const handleSaveOnly = () => {
    if (slots.length === 0) {
      toast.error('Adicione pelo menos 1 exercício antes de salvar.');
      return;
    }
    const { program } = buildProgramFromDraft();
    saveCustomProgram(program);
    toast.success(`"${program.name}" salvo em Meus Treinos.`);
    setActiveView(builderReturnView);
  };

  const handleStartNow = () => {
    if (slots.length === 0) {
      toast.error('Adicione pelo menos 1 exercício antes de iniciar.');
      return;
    }
    const { program, day } = buildProgramFromDraft();
    saveCustomProgram(program);
    // explicitDay evita depender do setState de customPrograms já ter propagado.
    startWorkout(program.id, program.name, day.id, day);
  };

  const handlePlanToWeekday = (dayName: string) => {
    if (slots.length === 0) {
      toast.error('Adicione pelo menos 1 exercício antes de planejar.');
      return;
    }
    const { program, day } = buildProgramFromDraft();
    saveCustomProgram(program);
    assignDayToWeekday(dayName, program, day);
    setActiveView(builderReturnView);
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          onClick={handleCancel}
          className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-white tap-target"
          aria-label="Voltar"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight">Construtor de Treino</h1>
          <p className="text-xs text-gym-text-muted mt-0.5">Monte, edite e salve seu próprio treino.</p>
        </div>
      </div>

      {/* CONFIG BÁSICA */}
      <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
        <div>
          <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">Nome do treino</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Peito e Tríceps"
            className="w-full bg-gym-dark border border-white/10 rounded-xl py-2.5 px-3 text-sm text-white outline-none focus:border-gym-accent"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">Nível</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as UserProfile['level'])}
              className="w-full bg-gym-dark border border-white/10 rounded-xl py-2.5 px-3 text-xs text-white outline-none focus:border-gym-accent"
            >
              <option value="beginner">Iniciante</option>
              <option value="intermediate">Intermediário</option>
              <option value="advanced">Avançado</option>
              <option value="athlete">Atleta / Pro</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">Tempo alvo (min)</label>
            <input
              type="number"
              min={10}
              value={targetMinutes}
              onChange={(e) => setTargetMinutes(Math.max(10, Number(e.target.value)))}
              className="w-full bg-gym-dark border border-white/10 rounded-xl py-2.5 px-3 text-xs text-white outline-none focus:border-gym-accent"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">Perfil de volume</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {VOLUME_PROFILES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleProfileChange(p.id)}
                className={`p-2.5 rounded-xl border text-left transition-all min-h-[44px] ${
                  volumeProfile === p.id
                    ? 'bg-gym-accent/15 border-gym-accent text-gym-accent'
                    : 'bg-white/5 border-white/5 text-gym-text-muted hover:text-white'
                }`}
              >
                <span className="block text-[11px] font-black">{p.label}</span>
                <span className="block text-[9px] mt-0.5 leading-snug">{p.description}</span>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-gym-text-muted mt-2 leading-relaxed">
            O perfil só sugere um alvo — você pode montar qualquer volume real.
          </p>
        </div>
      </div>

      {/* RESUMO AO VIVO */}
      <div className="glass p-5 rounded-3xl border border-white/5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white/5 rounded-2xl p-3 text-center">
            <Dumbbell className="w-4 h-4 text-gym-accent mx-auto mb-1" />
            <span className="block text-[9px] text-gym-text-muted uppercase">Exercícios</span>
            <span className="block text-sm font-extrabold text-white">{slots.length}</span>
          </div>
          <div className="bg-white/5 rounded-2xl p-3 text-center">
            <Layers className="w-4 h-4 text-gym-accent mx-auto mb-1" />
            <span className="block text-[9px] text-gym-text-muted uppercase">Séries</span>
            <span className="block text-sm font-extrabold text-white">{estimate.totalSeries}</span>
          </div>
          <div className="bg-white/5 rounded-2xl p-3 text-center">
            <Clock className="w-4 h-4 text-gym-accent mx-auto mb-1" />
            <span className="block text-[9px] text-gym-text-muted uppercase">Duração est.</span>
            <span className="block text-sm font-extrabold text-white">{estimate.minutes} min</span>
          </div>
          <div className="bg-white/5 rounded-2xl p-3 text-center">
            <Activity className="w-4 h-4 text-gym-accent mx-auto mb-1" />
            <span className="block text-[9px] text-gym-text-muted uppercase">Grupos</span>
            <span className="block text-[10px] font-bold text-white truncate" title={derivedMuscleGroups.join(', ')}>
              {derivedMuscleGroups.length > 0 ? derivedMuscleGroups.join(', ') : '—'}
            </span>
          </div>
        </div>

        {warning && (
          <div className="mt-3 bg-gym-amber/10 border border-gym-amber/30 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-gym-amber flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-gym-amber leading-relaxed">{warning}</p>
          </div>
        )}

        <p className="text-[9px] text-gym-text-muted mt-3 leading-relaxed">
          Sugestão de treino • volume estimado • ajuste conforme sua recuperação.
        </p>
      </div>

      {/* LISTA DE EXERCÍCIOS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Exercícios ({slots.length})</h3>
          <button
            onClick={() => setPickerOpen(true)}
            className="min-h-[44px] bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-bold px-4 rounded-xl text-xs flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Adicionar Exercício
          </button>
        </div>

        {slots.length === 0 ? (
          <div className="glass p-8 text-center rounded-3xl border border-white/5">
            <p className="text-xs text-gym-text-muted">Nenhum exercício ainda. Toque em &quot;Adicionar Exercício&quot; para começar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {slots.map((slot, idx) => {
              const ex = exercises.find((e) => e.id === slot.exerciseId);
              return (
                <div key={`${slot.exerciseId}_${idx}`} className="bg-gym-card/60 border border-white/5 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] text-gym-accent font-bold">#{idx + 1}</span>
                      <h4 className="text-xs font-bold text-white truncate">{ex?.name ?? 'Exercício desconhecido'}</h4>
                      <p className="text-[10px] text-gym-text-muted capitalize">{ex?.muscleGroup}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => moveSlot(idx, -1)}
                        disabled={idx === 0}
                        className="p-2 bg-white/5 rounded-lg disabled:opacity-30 text-white tap-target"
                        title="Mover para cima"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveSlot(idx, 1)}
                        disabled={idx === slots.length - 1}
                        className="p-2 bg-white/5 rounded-lg disabled:opacity-30 text-white tap-target"
                        title="Mover para baixo"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => duplicateSlot(idx)}
                        className="p-2 bg-white/5 rounded-lg text-white tap-target"
                        title="Duplicar"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeSlot(idx)}
                        className="p-2 bg-gym-rose/10 rounded-lg text-gym-rose tap-target"
                        title="Remover"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <label className="text-[9px] font-bold text-gym-text-muted uppercase block">
                      Séries
                      <input
                        type="number"
                        min={1}
                        value={slot.series}
                        onChange={(e) => updateSlot(idx, { series: Math.max(1, Number(e.target.value)) })}
                        className="mt-1 w-full bg-gym-dark border border-white/10 rounded-lg py-1.5 px-2 text-xs text-white outline-none focus:border-gym-accent"
                      />
                    </label>
                    <label className="text-[9px] font-bold text-gym-text-muted uppercase block">
                      Reps mín.
                      <input
                        type="number"
                        min={1}
                        value={slot.repRange[0]}
                        onChange={(e) => updateSlot(idx, { repRange: [Number(e.target.value), slot.repRange[1]] })}
                        className="mt-1 w-full bg-gym-dark border border-white/10 rounded-lg py-1.5 px-2 text-xs text-white outline-none focus:border-gym-accent"
                      />
                    </label>
                    <label className="text-[9px] font-bold text-gym-text-muted uppercase block">
                      Reps máx.
                      <input
                        type="number"
                        min={1}
                        value={slot.repRange[1]}
                        onChange={(e) => updateSlot(idx, { repRange: [slot.repRange[0], Number(e.target.value)] })}
                        className="mt-1 w-full bg-gym-dark border border-white/10 rounded-lg py-1.5 px-2 text-xs text-white outline-none focus:border-gym-accent"
                      />
                    </label>
                    <label className="text-[9px] font-bold text-gym-text-muted uppercase block">
                      RPE alvo
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={slot.targetRPE}
                        onChange={(e) => updateSlot(idx, { targetRPE: Number(e.target.value) })}
                        className="mt-1 w-full bg-gym-dark border border-white/10 rounded-lg py-1.5 px-2 text-xs text-white outline-none focus:border-gym-accent"
                      />
                    </label>
                    <label className="text-[9px] font-bold text-gym-text-muted uppercase block">
                      Descanso (s)
                      <input
                        type="number"
                        min={0}
                        step={5}
                        value={slot.restSec}
                        onChange={(e) => updateSlot(idx, { restSec: Math.max(0, Number(e.target.value)) })}
                        className="mt-1 w-full bg-gym-dark border border-white/10 rounded-lg py-1.5 px-2 text-xs text-white outline-none focus:border-gym-accent"
                      />
                    </label>
                    <label className="text-[9px] font-bold text-gym-text-muted uppercase block">
                      Progressão
                      <select
                        value={slot.progression}
                        onChange={(e) => updateSlot(idx, { progression: e.target.value as ProgressionType })}
                        className="mt-1 w-full bg-gym-dark border border-white/10 rounded-lg py-1.5 px-2 text-xs text-white outline-none focus:border-gym-accent"
                      >
                        <option value="dupla">Dupla progressão</option>
                        <option value="linear">Linear</option>
                        <option value="nenhuma">Nenhuma</option>
                      </select>
                    </label>
                    <label className="text-[9px] font-bold text-gym-text-muted uppercase block">
                      Incremento (kg)
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={slot.incrementKg}
                        onChange={(e) => updateSlot(idx, { incrementKg: Math.max(0, Number(e.target.value)) })}
                        className="mt-1 w-full bg-gym-dark border border-white/10 rounded-lg py-1.5 px-2 text-xs text-white outline-none focus:border-gym-accent"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PLANEJAR NA SEMANA */}
      {weeklyPlan.length > 0 && (
        <div className="glass p-5 rounded-3xl border border-white/5 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-gym-accent" /> Planejar na semana (opcional)
          </h3>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            {weeklyPlan.map((d) => (
              <button
                key={d.dayName}
                onClick={() => handlePlanToWeekday(d.dayName)}
                className="min-h-[44px] bg-white/5 hover:bg-gym-accent/15 hover:text-gym-accent border border-white/10 rounded-xl text-[10px] font-bold text-white transition-all"
              >
                {d.dayName.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AÇÕES FINAIS */}
      <div className="flex flex-col sm:flex-row gap-3 pb-4">
        <button
          onClick={handleStartNow}
          className="flex-1 min-h-[44px] py-3 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-gym-accent/15"
        >
          <Play className="w-4 h-4" /> Iniciar Agora
        </button>
        <button
          onClick={handleSaveOnly}
          className="flex-1 min-h-[44px] py-3 bg-white/5 hover:bg-white/10 border border-gym-accent/30 text-gym-accent font-extrabold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" /> Salvar
        </button>
        <button
          onClick={handleCancel}
          className="min-h-[44px] py-3 px-6 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-xs"
        >
          Cancelar
        </button>
      </div>

      {/* MODAL: BIBLIOTECA DE EXERCÍCIOS */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
          onClick={() => setPickerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-gym-dark border border-white/10 rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
          >
            <div className="p-5 border-b border-white/5 space-y-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Adicionar Exercício</h3>
                <button
                  onClick={() => setPickerOpen(false)}
                  className="p-2 text-gym-text-muted hover:text-white bg-white/5 rounded-lg tap-target"
                  aria-label="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gym-text-muted" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome..."
                  className="w-full bg-gym-card border border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-gym-accent"
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap pb-1">
                {MUSCLE_FILTERS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMuscleFilter(m.id)}
                    className={`py-1.5 px-3 rounded-lg text-[10px] font-bold transition-all flex-shrink-0 ${
                      muscleFilter === m.id ? 'bg-gym-accent text-gym-dark' : 'bg-white/5 text-gym-text-muted hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {filteredPickerExercises.length === 0 ? (
                <p className="text-xs text-gym-text-muted text-center py-8">Nenhum exercício encontrado.</p>
              ) : (
                filteredPickerExercises.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => handleAddExercise(ex)}
                    className="w-full text-left bg-white/5 hover:bg-gym-accent/10 border border-white/5 hover:border-gym-accent/30 rounded-xl p-3 flex items-center justify-between transition-all min-h-[44px]"
                  >
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">{ex.name}</h4>
                      <p className="text-[10px] text-gym-text-muted capitalize mt-0.5">
                        {ex.muscleGroup} • {ex.equipment}
                      </p>
                    </div>
                    <Plus className="w-4 h-4 text-gym-accent flex-shrink-0 ml-2" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
