'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, Play, Save, Sparkles } from 'lucide-react';
import { useGymFlow } from '../providers/GymFlowContext';
import type { Exercise, ExerciseSlot, VolumeProfile, WorkoutBuilderDraft, WorkoutProgram } from '../types';
import type { MuscleGroupId } from '../types/training-taxonomy';
import type { TrainingExperienceLevel } from '../types/training-profile';
import type { WorkoutProgramBuilderDraft } from '../types/workout-builder';
import { useToast } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { estimateWorkoutDurationDetailed } from '../lib/workoutDuration';
import { createBuilderId } from '../lib/workout-builder-id';
import {
  cloneSlots,
  normalizeWorkoutProgramForBuilder,
} from '../lib/workout-program-normalization';
import {
  activeWorkoutNameForDay,
  addDayToDraft,
  addEmptyDaysToDraft,
  addSlotToDay,
  buildProgramFromDraft,
  canAddDay,
  canRemoveDay,
  clampTargetMinutes,
  clearDayCustomName,
  countExerciseInDay,
  dayDisplayName,
  draftHasAnyExercise,
  duplicateDayInDraft,
  duplicateSlotInDay,
  findDay,
  findExerciseInOtherDays,
  isDraftDirty,
  moveDayInDraft,
  moveSlotInDay,
  removeDayFromDraft,
  removeSlotFromDay,
  serializeDraftSignature,
  toggleDayMuscleGroup,
  updateDayInDraft,
  updateSlotInDay,
} from '../lib/workout-builder';
import {
  createEmptyWorkoutDraftFromFrequency,
  createWorkoutDraftFromTemplate,
  type GuidedCreationProfile,
} from '../lib/workout-guided-creation';
import {
  getWorkoutTemplate,
  listWorkoutTemplates,
  type TemplateCompatibilityProfile,
} from '../lib/workout-templates';
import { ExercisePickerModal } from '../components/workout-builder/ExercisePickerModal';
import { StartDayPicker } from '../components/workout-builder/StartDayPicker';
import { WorkoutCreationMode } from '../components/workout-builder/WorkoutCreationMode';
import { WorkoutDaysEditor } from '../components/workout-builder/WorkoutDaysEditor';
import { WorkoutDayTabs } from '../components/workout-builder/WorkoutDayTabs';
import { WorkoutProgramDetails } from '../components/workout-builder/WorkoutProgramDetails';
import { WorkoutProgramSummary } from '../components/workout-builder/WorkoutProgramSummary';
import { WorkoutTemplatePicker } from '../components/workout-builder/WorkoutTemplatePicker';
import { WorkoutTemplatePreview } from '../components/workout-builder/WorkoutTemplatePreview';

type BuilderPhase = 'mode' | 'template-picker' | 'template-preview' | 'editor';

/**
 * Draft inicial do Construtor.
 *
 * Com um customProgram de origem, o programa INTEIRO é normalizado (todos os dias) —
 * é isso que impede a regressão de salvar um dia e apagar os irmãos. O `WorkoutBuilderDraft`
 * legado (um dia só) continua aceito: vira o Dia 1 de um programa novo, que é
 * exatamente o caso de "editar um dia de um programa sugerido" (gera custom novo).
 */
function createInitialDraft(
  legacy: WorkoutBuilderDraft | null,
  sourceProgram: WorkoutProgram | null,
  profileLevel?: TrainingExperienceLevel,
  profileMinutes?: number,
): WorkoutProgramBuilderDraft {
  const options = { fallbackLevel: profileLevel, fallbackTargetMinutes: profileMinutes };
  if (sourceProgram) return normalizeWorkoutProgramForBuilder(sourceProgram, options);

  const base = normalizeWorkoutProgramForBuilder(undefined, options);
  if (!legacy) return base;

  const legacyName = legacy.name?.trim();
  const targetMinutes = clampTargetMinutes(legacy.targetMinutes ?? base.days[0].targetMinutes);
  return {
    ...base,
    name: legacyName || base.name,
    level: legacy.level ?? base.level,
    targetMinutes,
    days: [{
      ...base.days[0],
      ...(legacyName ? { customName: legacyName } : {}),
      volumeProfile: legacy.volumeProfile ?? base.days[0].volumeProfile,
      targetMinutes,
      slots: cloneSlots(legacy.slots),
    }],
  };
}

/**
 * GOAL-19A: Construtor de Treino multi-dia.
 *
 * Um "Salvar" agora grava UM WorkoutProgram com N dias em `weeks[0].days` (fonte
 * canônica; `exercises` achatado nunca é recriado). Substitui a regra do GOAL-10.5
 * de "1 programa = 1 dia", que existia para não sobrescrever um dia irmão — agora os
 * dias irmãos são editados juntos, no mesmo draft, e nenhum se perde.
 *
 * O que este GOAL NÃO faz: escolher exercícios, pontuar, sugerir ou alterar o treino
 * automaticamente. Todo aviso é textual (ver docs/builder/GYMFLOW_MULTI_DAY_WORKOUT_BUILDER.md).
 */
export const WorkoutBuilder = () => {
  const {
    user,
    exercises,
    programs,
    builderDraft,
    builderReturnView,
    builderCreationStep,
    setActiveView,
    saveCustomProgram,
    startWorkout,
    weeklyPlan,
    assignDayToWeekday,
    setWorkoutsTab,
  } = useGymFlow();
  const toast = useToast();

  // Resolvido UMA vez (lazy state): o Construtor passa a ser dono do draft, e
  // mudanças em customPrograms não podem atropelar a edição em andamento.
  // Avaliar duas vezes geraria ids de dia diferentes entre draft e seleção.
  const [initial] = useState(() => {
    const source = builderDraft?.programId
      ? programs.find((program) => program.id === builderDraft.programId && program.isCustom) ?? null
      : null;
    const initialDraft = createInitialDraft(builderDraft, source, user?.level, user?.duration);
    const dayId = builderDraft?.dayId && initialDraft.days.some((day) => day.id === builderDraft.dayId)
      ? builderDraft.dayId
      : initialDraft.days[0].id;
    // GOAL-19B: entrada de criação nova (sem draft legado e sem programa de origem) abre
    // a criação guiada; qualquer edição de programa existente vai direto para o editor.
    const startsInCreation = !builderDraft && !source;
    return { draft: initialDraft, source, dayId, startsInCreation };
  });

  const sourceProgramRef = useRef<WorkoutProgram | null>(initial.source);
  const [draft, setDraft] = useState<WorkoutProgramBuilderDraft>(initial.draft);
  const [selectedDayId, setSelectedDayId] = useState<string>(initial.dayId);

  // GOAL-19B: fase da criação guiada. `savedSignatureRef` continua sendo a linha de base
  // do dirty-state — aplicar template/frequência muda o draft mas NÃO a base, então sair
  // sem salvar dispara o ConfirmDialog (PART 16). O passo inicial pode vir deep-linkado
  // do estado vazio de "Meus Treinos" (PART 12).
  const [phase, setPhase] = useState<BuilderPhase>(() => {
    if (!initial.startsInCreation) return 'editor';
    return builderCreationStep === 'template' ? 'template-picker' : 'mode';
  });
  const [templateId, setTemplateId] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [weekdayPickerVisible, setWeekdayPickerVisible] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [dayPendingRemoval, setDayPendingRemoval] = useState<string | null>(null);
  // Após a criação guiada a dica de frequência é redundante — já foi oferecida no gate.
  const [frequencyHintDismissed, setFrequencyHintDismissed] = useState(initial.startsInCreation);

  const savedSignatureRef = useRef<string>(serializeDraftSignature(draft));
  const markSaved = (saved: WorkoutProgramBuilderDraft) => {
    savedSignatureRef.current = serializeDraftSignature(saved);
  };

  const selectedDay = findDay(draft, selectedDayId) ?? draft.days[0];
  const selectedIndex = draft.days.findIndex((day) => day.id === selectedDay.id);
  const multiDay = draft.days.length > 1;

  const durationByDay = useMemo(
    () => draft.days.map((day) => estimateWorkoutDurationDetailed(day.slots, exercises, {
      goal: user?.goal,
      defaultRestSeconds: user?.restTimerDefaultSeconds,
    })),
    [draft.days, exercises, user?.goal, user?.restTimerDefaultSeconds],
  );
  const selectedEstimate = durationByDay[selectedIndex] ?? durationByDay[0];

  const volumeProfileForSummary = useMemo(() => ({
    level: draft.level,
    goal: user?.goal ?? 'hypertrophy',
    trainingStatus: user?.trainingStatus,
    returnToTraining: user?.returnToTraining,
  } as const), [draft.level, user?.goal, user?.trainingStatus, user?.returnToTraining]);

  // Sugestão visual: o perfil diz 5 dias/semana, mas quem decide é o usuário (PART 3).
  const suggestedFrequency = user?.frequency ?? 0;
  const showFrequencyHint = !frequencyHintDismissed
    && !draft.programId
    && draft.days.length === 1
    && draft.days[0].slots.length === 0
    && suggestedFrequency > 1;

  const otherDaysWithExercise = (exerciseId: string) =>
    findExerciseInOtherDays(draft, selectedDay.id, exerciseId).map((day) => `Dia ${day.dayNumber}`);

  // ===== Dias =====

  const handleAddDay = () => {
    const next = addDayToDraft(draft, createBuilderId);
    if (next === draft) {
      toast.error('Este programa já atingiu o número máximo de dias.');
      return;
    }
    setDraft(next);
    setSelectedDayId(next.days[next.days.length - 1].id);
  };

  const handleUseProfileFrequency = () => {
    const next = addEmptyDaysToDraft(draft, suggestedFrequency - draft.days.length, createBuilderId);
    setDraft(next);
    setFrequencyHintDismissed(true);
    toast.success(`${next.days.length} dias vazios criados — monte cada um do seu jeito.`);
  };

  const handleDuplicateDay = () => {
    const next = duplicateDayInDraft(draft, selectedDay.id, createBuilderId);
    if (next === draft) {
      toast.error('Este programa já atingiu o número máximo de dias.');
      return;
    }
    setDraft(next);
    setSelectedDayId(next.days[selectedIndex + 1].id);
    toast.success('Dia duplicado.');
  };

  const handleConfirmRemoveDay = () => {
    if (!dayPendingRemoval) return;
    const next = removeDayFromDraft(draft, dayPendingRemoval);
    setDayPendingRemoval(null);
    if (next === draft) return;
    setDraft(next);
    if (dayPendingRemoval === selectedDay.id) {
      setSelectedDayId(next.days[Math.min(selectedIndex, next.days.length - 1)].id);
    }
    toast.success('Dia removido.');
  };

  const handleMoveDay = (direction: -1 | 1) => setDraft(moveDayInDraft(draft, selectedDay.id, direction));

  // ===== Exercícios =====

  const handleAddExercise = (exercise: Exercise) => {
    // Mesma heurística do GOAL-10.5: sem sinergistas = isolado (mais reps, menos descanso).
    const isolated = !exercise.secondaryMuscles || exercise.secondaryMuscles.length === 0;
    const slot: ExerciseSlot = {
      exerciseId: exercise.id,
      series: 3,
      repRange: isolated ? [10, 15] : [8, 10],
      targetRPE: 8,
      restSec: isolated ? 75 : 120,
      progression: 'dupla',
      incrementKg: isolated ? 1 : 2.5,
    };
    setDraft(addSlotToDay(draft, selectedDay.id, slot));
    toast.success(`"${exercise.name}" adicionado ao Dia ${selectedDay.dayNumber}.`);
  };

  // ===== Salvamento =====

  const persist = (current: WorkoutProgramBuilderDraft) => {
    const program = buildProgramFromDraft(current, sourceProgramRef.current, createBuilderId);
    saveCustomProgram(program);
    // Reaproveita o mesmo id/dias nos próximos salvamentos desta sessão (sem duplicar).
    sourceProgramRef.current = program;
    const persisted = { ...current, programId: program.id };
    setDraft(persisted);
    markSaved(persisted);
    return program;
  };

  const guardHasExercise = (action: string) => {
    if (draftHasAnyExercise(draft)) return true;
    toast.error(`Adicione pelo menos 1 exercício antes de ${action}.`);
    return false;
  };

  const handleSaveOnly = () => {
    if (!guardHasExercise('salvar')) return;
    const program = persist(draft);
    setWorkoutsTab('mine');
    toast.success(`"${program.name}" salvo em Meus Treinos.`);
    setActiveView('workouts');
  };

  const handleSaveAndPlan = () => {
    if (!guardHasExercise('planejar')) return;
    const program = persist(draft);
    toast.success(`"${program.name}" salvo — escolha um dia da semana abaixo.`);
    setWeekdayPickerVisible(true);
  };

  const handlePlanToWeekday = (weekdayName: string) => {
    const program = persist(draft);
    const day = program.weeks[0].days[selectedIndex] ?? program.weeks[0].days[0];
    assignDayToWeekday(weekdayName, program, day);
    setActiveView('planner');
  };

  const startDay = (dayId: string) => {
    const day = findDay(draft, dayId);
    if (!day || day.slots.length === 0) {
      toast.error('Este dia ainda não tem exercícios.');
      return;
    }
    const program = persist(draft);
    const programDay = program.weeks[0].days.find((item) => item.id === day.id);
    if (!programDay) return;
    setStartPickerOpen(false);
    // explicitDay: não depende do setState de customPrograms ter propagado.
    startWorkout(program.id, activeWorkoutNameForDay(program.name, day, multiDay), programDay.id, programDay);
  };

  const handleStartNow = () => {
    if (!guardHasExercise('iniciar')) return;
    if (!multiDay) {
      startDay(draft.days[0].id);
      return;
    }
    setStartPickerOpen(true);
  };

  // ===== Saída =====

  const handleCancel = () => setActiveView(builderReturnView);
  const handleCancelClick = () => {
    if (isDraftDirty(draft, savedSignatureRef.current)) setShowDiscardConfirm(true);
    else handleCancel();
  };

  const pendingRemovalDay = dayPendingRemoval ? findDay(draft, dayPendingRemoval) : undefined;

  // ===== Criação guiada (GOAL-19B) =====

  const guidedProfile: GuidedCreationProfile = {
    level: user?.level ?? 'intermediate',
    duration: user?.duration,
    frequency: user?.frequency,
    trainingStatus: user?.trainingStatus,
  };
  const compatibilityProfile: TemplateCompatibilityProfile = {
    level: user?.level ?? 'intermediate',
    frequency: user?.frequency,
    goal: user?.goal,
    trainingStatus: user?.trainingStatus,
  };

  // Substitui o draft pelo recém-criado e entra no editor. NÃO mexe em `savedSignatureRef`:
  // o draft aplicado fica "sujo" em relação à base em branco, protegendo a saída.
  const enterEditorWithDraft = (created: WorkoutProgramBuilderDraft) => {
    setDraft(created);
    setSelectedDayId(created.days[0].id);
    setFrequencyHintDismissed(true);
    setPhase('editor');
  };

  // "Programa em branco": mantém o draft inicial (1 dia vazio) — base == atual, sem dirty.
  const handleStartBlank = () => setPhase('editor');

  const handleStartFromFrequency = (dayCount: number) => {
    enterEditorWithDraft(createEmptyWorkoutDraftFromFrequency(guidedProfile, dayCount, createBuilderId));
  };

  const handleUseTemplate = () => {
    const template = templateId ? getWorkoutTemplate(templateId) : undefined;
    if (!template) {
      setPhase('template-picker');
      return;
    }
    enterEditorWithDraft(createWorkoutDraftFromTemplate(template, guidedProfile, { createId: createBuilderId }));
  };

  const chosenTemplate = templateId ? getWorkoutTemplate(templateId) : undefined;

  if (phase !== 'editor') {
    return (
      <div className="space-y-6 pb-20 lg:pb-6 max-w-3xl mx-auto">
        {phase === 'mode' && (
          <WorkoutCreationMode
            suggestedFrequency={suggestedFrequency}
            initialView={builderCreationStep === 'frequency' ? 'frequency' : 'choose'}
            onBlank={handleStartBlank}
            onFrequency={handleStartFromFrequency}
            onTemplate={() => setPhase('template-picker')}
            onCancel={handleCancel}
          />
        )}
        {phase === 'template-picker' && (
          <WorkoutTemplatePicker
            templates={listWorkoutTemplates()}
            profile={compatibilityProfile}
            onPreview={(id) => {
              setTemplateId(id);
              setPhase('template-preview');
            }}
            onBack={() => setPhase('mode')}
          />
        )}
        {phase === 'template-preview' && chosenTemplate && (
          <WorkoutTemplatePreview
            template={chosenTemplate}
            profile={compatibilityProfile}
            sessionMinutes={user?.duration}
            onUse={handleUseTemplate}
            onBack={() => setPhase('template-picker')}
            onCancel={handleCancel}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          onClick={handleCancelClick}
          className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-white tap-target"
          aria-label="Voltar"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight">Construtor de Treino</h1>
          <p className="text-xs text-gym-text-muted mt-0.5">
            Monte um programa com um ou vários dias — você escolhe cada exercício.
          </p>
        </div>
      </div>

      <WorkoutProgramDetails
        name={draft.name}
        level={draft.level}
        objective={draft.objective}
        onNameChange={(name) => setDraft({ ...draft, name })}
        onLevelChange={(level: TrainingExperienceLevel) => setDraft({ ...draft, level })}
        onObjectiveChange={(objective) => setDraft({ ...draft, objective })}
      />

      {/* DIAS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white">
            Dias do programa ({draft.days.length})
          </h2>
          {!canAddDay(draft) && (
            <span className="text-[9px] text-gym-text-muted">Máximo de dias atingido</span>
          )}
        </div>

        <WorkoutDayTabs
          days={draft.days}
          selectedDayId={selectedDay.id}
          canAddDay={canAddDay(draft)}
          onSelect={setSelectedDayId}
          onAddDay={handleAddDay}
        />

        {showFrequencyHint && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] text-gym-text-muted leading-relaxed min-w-0">
              <Sparkles className="w-3 h-3 text-gym-accent inline mr-1" />
              Seu perfil indica {suggestedFrequency} dias por semana. Quer começar com {suggestedFrequency} dias vazios?
            </p>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={handleUseProfileFrequency}
                className="min-h-[36px] px-3 bg-gym-accent/15 border border-gym-accent/40 text-gym-accent rounded-xl text-[10px] font-bold"
              >
                Criar {suggestedFrequency} dias
              </button>
              <button
                onClick={() => setFrequencyHintDismissed(true)}
                className="min-h-[36px] px-3 bg-white/5 border border-white/10 text-gym-text-muted hover:text-white rounded-xl text-[10px] font-bold"
              >
                Continuar com 1
              </button>
            </div>
          </div>
        )}
      </div>

      <WorkoutDaysEditor
        day={selectedDay}
        exercises={exercises}
        estimate={selectedEstimate}
        canMoveLeft={selectedIndex > 0}
        canMoveRight={selectedIndex < draft.days.length - 1}
        canDuplicate={canAddDay(draft)}
        canRemove={canRemoveDay(draft)}
        otherDaysWithExercise={otherDaysWithExercise}
        onCustomNameChange={(customName) => setDraft(updateDayInDraft(draft, selectedDay.id, { customName }))}
        onUseAutoName={() => setDraft(clearDayCustomName(draft, selectedDay.id))}
        onToggleMuscleGroup={(muscleGroupId: MuscleGroupId) =>
          setDraft(toggleDayMuscleGroup(draft, selectedDay.id, muscleGroupId))}
        onTargetMinutesChange={(minutes) =>
          setDraft(updateDayInDraft(draft, selectedDay.id, { targetMinutes: clampTargetMinutes(minutes) }))}
        onVolumeProfileChange={(volumeProfile: VolumeProfile) =>
          setDraft(updateDayInDraft(draft, selectedDay.id, { volumeProfile }))}
        onMoveDay={handleMoveDay}
        onDuplicateDay={handleDuplicateDay}
        onRemoveDay={() => setDayPendingRemoval(selectedDay.id)}
        onOpenPicker={() => setPickerOpen(true)}
        onSlotChange={(index, fields) => setDraft(updateSlotInDay(draft, selectedDay.id, index, fields))}
        onSlotMove={(index, direction) => setDraft(moveSlotInDay(draft, selectedDay.id, index, direction))}
        onSlotDuplicate={(index) => setDraft(duplicateSlotInDay(draft, selectedDay.id, index))}
        onSlotRemove={(index) => setDraft(removeSlotFromDay(draft, selectedDay.id, index))}
      />

      <WorkoutProgramSummary
        draft={draft}
        exercises={exercises}
        profile={volumeProfileForSummary}
        profileFrequency={suggestedFrequency}
        totalMinutesByDay={durationByDay.map((estimate) => estimate.totalMinutes)}
      />

      {/* PLANEJAR NA SEMANA — revelado após "Salvar e Planejar" */}
      {weekdayPickerVisible && (
        <div className="glass p-5 rounded-3xl border border-gym-accent/20 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-gym-accent" /> Programa salvo — planejar o Dia {selectedDay.dayNumber}
          </h3>
          <p className="text-[10px] text-gym-text-muted leading-relaxed">
            Escolha o dia da semana para <strong className="text-white">{dayDisplayName(selectedDay)}</strong>. Os
            outros dias podem ser atribuídos no Planejador, em &quot;Escolher&quot;.
          </p>
          {weeklyPlan.length > 0 ? (
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {weeklyPlan.map((weekday) => (
                <button
                  key={weekday.dayName}
                  onClick={() => handlePlanToWeekday(weekday.dayName)}
                  className="min-h-[44px] bg-white/5 hover:bg-gym-accent/15 hover:text-gym-accent border border-white/10 rounded-xl text-[10px] font-bold text-white transition-all"
                >
                  {weekday.dayName.slice(0, 3)}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gym-text-muted">
              Gere uma semana no Planejador primeiro para poder escolher um dia — o programa já está salvo em Meus Treinos.
            </p>
          )}
          <button
            onClick={() => {
              setWorkoutsTab('mine');
              setActiveView('workouts');
            }}
            className="text-[10px] font-bold text-gym-text-muted hover:text-white underline"
          >
            Concluir sem planejar
          </button>
        </div>
      )}

      {/* AÇÕES FINAIS */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 pb-4">
        <button
          onClick={handleSaveOnly}
          className="flex-1 min-h-[44px] py-3 bg-white/5 hover:bg-white/10 border border-gym-accent/30 text-gym-accent font-extrabold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" /> Salvar
        </button>
        <button
          onClick={handleSaveAndPlan}
          className="flex-1 min-h-[44px] py-3 bg-white/5 hover:bg-white/10 border border-gym-accent/30 text-gym-accent font-extrabold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2"
        >
          <Calendar className="w-4 h-4" /> Salvar e Planejar
        </button>
        <button
          onClick={handleStartNow}
          className="flex-1 min-h-[44px] py-3 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-gym-accent/15"
        >
          <Play className="w-4 h-4" /> Iniciar Agora
        </button>
        <button
          onClick={handleCancelClick}
          className="min-h-[44px] py-3 px-6 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-xs"
        >
          Cancelar
        </button>
      </div>

      <ConfirmDialog
        isOpen={showDiscardConfirm}
        variant="destructive"
        title="Descartar alterações não salvas?"
        description={`Este programa tem ${draft.days.length} dia(s) com alterações que ainda não foram salvas. Se sair agora, esse progresso será perdido.`}
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        onConfirm={() => {
          setShowDiscardConfirm(false);
          handleCancel();
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />

      <ConfirmDialog
        isOpen={dayPendingRemoval !== null}
        variant="destructive"
        title={`Remover o Dia ${pendingRemovalDay?.dayNumber ?? ''}?`}
        description={
          pendingRemovalDay
            ? `"${dayDisplayName(pendingRemovalDay)}" e seus ${pendingRemovalDay.slots.length} exercício(s) serão removidos deste programa. Os outros dias continuam como estão.`
            : ''
        }
        confirmLabel="Remover dia"
        cancelLabel="Manter"
        onConfirm={handleConfirmRemoveDay}
        onCancel={() => setDayPendingRemoval(null)}
      />

      <StartDayPicker
        isOpen={startPickerOpen}
        days={draft.days}
        onSelect={startDay}
        onCancel={() => setStartPickerOpen(false)}
      />

      <ExercisePickerModal
        isOpen={pickerOpen}
        day={selectedDay}
        exercises={exercises}
        countInDay={(exerciseId) => countExerciseInDay(selectedDay, exerciseId)}
        otherDaysWithExercise={otherDaysWithExercise}
        onAdd={handleAddExercise}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
};
