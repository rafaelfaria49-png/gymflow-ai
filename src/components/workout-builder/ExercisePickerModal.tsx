'use client';

import React, { useMemo, useReducer, useRef, useState } from 'react';
import { Check, ChevronDown, Info, Search, X } from 'lucide-react';
import type { Exercise } from '../../types';
import type { WorkoutDayBuilderDraft } from '../../types/workout-builder';
import { dayDisplayName } from '../../lib/workout-builder';
import {
  ALL_EXERCISES_TAB_ID,
  createWorkoutPickerState,
  getWorkoutPickerSections,
  getWorkoutPickerTabResult,
  getWorkoutPickerTabs,
  groupExercisesForDayFocus,
  workoutPickerReducer,
  type WorkoutPickerTabId,
} from '../../lib/workout-picker';
import { ExercisePickerItem } from './ExercisePickerItem';

interface ExercisePickerModalProps {
  isOpen: boolean;
  day: WorkoutDayBuilderDraft;
  exercises: readonly Exercise[];
  countInDay: (exerciseId: string) => number;
  otherDaysWithExercise: (exerciseId: string) => string[];
  onAdd: (exercise: Exercise) => void;
  onClose: () => void;
}

type ExercisePickerContentProps = Omit<ExercisePickerModalProps, 'isOpen'>;

function tabDomId(dayId: string, tabId: WorkoutPickerTabId): string {
  return `exercise-picker-tab-${dayId}-${tabId}`;
}

/**
 * GOAL-TF-B: picker por foco, sem ordenar, pontuar ou sugerir exercícios.
 * O conteúdo é desmontado ao fechar; reabrir reinicia busca e primeira aba sem
 * acoplar estado ao WorkoutBuilder nem à seleção de exercício.
 */
const ExercisePickerContent = ({
  day,
  exercises,
  countInDay,
  otherDaysWithExercise,
  onAdd,
  onClose,
}: ExercisePickerContentProps) => {
  const focusGroups = useMemo(
    () => groupExercisesForDayFocus(exercises, day.muscleGroupIds),
    [exercises, day.muscleGroupIds],
  );
  const tabs = useMemo(() => getWorkoutPickerTabs(day.muscleGroupIds), [day.muscleGroupIds]);
  const [pickerState, dispatch] = useReducer(
    workoutPickerReducer,
    createWorkoutPickerState(day.muscleGroupIds),
  );
  const [expandedSecondaryTabs, setExpandedSecondaryTabs] = useState<ReadonlySet<WorkoutPickerTabId>>(
    () => new Set(),
  );
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasFocus = focusGroups.length > 0;
  const activeTabIndex = Math.max(0, tabs.findIndex(({ id }) => id === pickerState.activeTabId));
  const activeTab = tabs[activeTabIndex] ?? { id: ALL_EXERCISES_TAB_ID, label: 'Todos' };
  const panelId = `exercise-picker-panel-${day.id}`;

  const tabResult = useMemo(
    () => getWorkoutPickerTabResult(
      exercises,
      focusGroups,
      activeTab.id,
      pickerState.search,
    ),
    [activeTab.id, exercises, focusGroups, pickerState.search],
  );
  const sections = useMemo(
    () => getWorkoutPickerSections(tabResult.items),
    [tabResult.items],
  );

  const toggleSecondarySection = () => {
    setExpandedSecondaryTabs((expandedTabs) => {
      const next = new Set(expandedTabs);
      if (next.has(activeTab.id)) next.delete(activeTab.id);
      else next.add(activeTab.id);
      return next;
    });
  };

  const selectTabAt = (index: number) => {
    const nextIndex = (index + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    dispatch({ type: 'select-tab', tabId: nextTab.id });
    tabRefs.current[nextIndex]?.focus();
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined;
    if (event.key === 'ArrowRight') nextIndex = index + 1;
    if (event.key === 'ArrowLeft') nextIndex = index - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    selectTabAt(nextIndex);
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-picker-title"
        onClick={(event) => event.stopPropagation()}
        className="bg-gym-dark border border-white/10 rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="p-5 border-b border-white/5 space-y-3 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 id="exercise-picker-title" className="text-sm font-bold text-white">Adicionar ao Dia {day.dayNumber}</h3>
              <p className="text-[10px] text-gym-text-muted truncate">{dayDisplayName(day)}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gym-text-muted hover:text-white bg-white/5 rounded-lg tap-target flex-shrink-0"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gym-text-muted" />
            <input
              autoFocus
              value={pickerState.search}
              onChange={(event) => dispatch({ type: 'set-search', search: event.target.value })}
              placeholder="Buscar nesta aba..."
              aria-label="Buscar exercícios nesta aba"
              className="w-full bg-gym-card border border-white/10 rounded-xl py-2 pl-9 pr-10 text-xs text-white outline-none focus:border-gym-accent"
            />
            {pickerState.search && (
              <button
                type="button"
                onClick={() => dispatch({ type: 'clear-search' })}
                aria-label="Limpar busca"
                className="absolute right-1.5 top-1.5 p-1 text-gym-text-muted hover:text-white rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div
            role="tablist"
            aria-label="Filtrar exercícios pelo foco do dia"
            className="flex gap-1.5 overflow-x-auto snap-x snap-mandatory pb-1"
          >
            {tabs.map((tab, index) => {
              const selected = activeTab.id === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(element) => { tabRefs.current[index] = element; }}
                  id={tabDomId(day.id, tab.id)}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={panelId}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => dispatch({ type: 'select-tab', tabId: tab.id })}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={`flex-shrink-0 snap-start min-h-[36px] py-1.5 px-3 rounded-lg text-[10px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gym-accent focus-visible:ring-offset-2 focus-visible:ring-offset-gym-dark ${
                    selected
                      ? 'bg-gym-accent text-gym-dark'
                      : 'bg-white/5 text-gym-text-muted hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab.id !== ALL_EXERCISES_TAB_ID && tabResult.usesLegacyClassification && (
            <p className="text-[10px] text-amber-400 flex items-start gap-1.5 leading-relaxed">
              <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
              Alguns exercícios usam classificação legada.
            </p>
          )}
        </div>

        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={tabDomId(day.id, activeTab.id)}
          className="flex-1 overflow-y-auto p-3 space-y-1.5"
        >
          {tabResult.items.length === 0 ? (
            <p className="text-xs text-gym-text-muted text-center py-8">
              Nenhum exercício encontrado{activeTab.id !== ALL_EXERCISES_TAB_ID ? ' para este foco' : ''}.
            </p>
          ) : (
            sections.map((section) => {
              const headingId = `${panelId}-${section.id}-heading`;
              const contentId = `${panelId}-${section.id}-content`;
              const expanded = !section.collapsedByDefault
                || expandedSecondaryTabs.has(activeTab.id);

              return (
                <section key={section.id} aria-labelledby={headingId} className="space-y-1.5">
                  {section.id === 'secondary' ? (
                    <div id={headingId} role="heading" aria-level={3}>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={contentId}
                        onClick={toggleSecondarySection}
                        className="flex min-h-[36px] w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-[10px] font-black uppercase tracking-wider text-white hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gym-accent focus-visible:ring-offset-2 focus-visible:ring-offset-gym-dark"
                      >
                        <span>{section.label} ({section.items.length})</span>
                        <ChevronDown
                          aria-hidden="true"
                          className={`h-3.5 w-3.5 flex-shrink-0 text-gym-text-muted transition-transform ${
                            expanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </div>
                  ) : (
                    <div
                      id={headingId}
                      role="heading"
                      aria-level={3}
                      className="px-2 pt-1 text-[10px] font-black uppercase tracking-wider text-white"
                    >
                      <span>{section.label} ({section.items.length})</span>
                      {section.reviewMessage && (
                        <span className="mt-0.5 block normal-case font-medium tracking-normal text-amber-300">
                          {section.reviewMessage}
                        </span>
                      )}
                    </div>
                  )}

                  {expanded && (
                    <div id={contentId} className="space-y-1.5">
                      {section.items.map((item) => (
                        <ExercisePickerItem
                          key={item.exercise.id}
                          item={item}
                          inDay={countInDay(item.exercise.id)}
                          alsoIn={otherDaysWithExercise(item.exercise.id)}
                          onAdd={onAdd}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>

        <div className="p-3 border-t border-white/5 flex-shrink-0 space-y-2">
          {hasFocus && (
            <div
              aria-label="Quantidade de exercícios por foco"
              className="flex gap-1.5 overflow-x-auto snap-x pb-0.5"
            >
              {focusGroups.map((group) => (
                <span
                  key={group.id}
                  className="flex-shrink-0 snap-start rounded-full bg-white/5 px-2 py-1 text-[9px] text-gym-text-muted"
                  aria-label={`${group.label}: ${group.items.length} exercícios`}
                >
                  {group.label} <strong className="text-white">{group.items.length}</strong>
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" /> Concluir ({day.slots.length}{' '}
            {day.slots.length === 1 ? 'exercício' : 'exercícios'})
          </button>
        </div>
      </div>
    </div>
  );
};

export const ExercisePickerModal = ({ isOpen, ...props }: ExercisePickerModalProps) => {
  if (!isOpen) return null;

  return <ExercisePickerContent key={props.day.id} {...props} />;
};
