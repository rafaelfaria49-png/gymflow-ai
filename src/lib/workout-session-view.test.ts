import { describe, expect, it } from 'vitest';
import type {
  ActiveExercise,
  WorkoutSession,
  WorkoutSet,
} from '../types';
import {
  buildSessionSummary,
  buildSessionPreview,
  buildSwapView,
  countCompletedSets,
  countIncompleteSets,
  countPerformedExercises,
  countSkippedExercises,
  countTotalSets,
  entryOriginStyle,
  entryStatusStyle,
  resolveEntryOrigin,
  resolveEntryStatus,
  resolveSessionStatus,
  resolveSwapReasonLabel,
  sessionStatusStyle,
  SESSION_STATUS_STYLES,
  ENTRY_ORIGIN_STYLES,
  ENTRY_STATUS_STYLES,
  MISSING_ORIGINAL_LABEL,
  SWAP_REASON_LABELS,
  SWAP_REASON_ORDER,
} from './workout-session-view';

function makeSet(completed: boolean, id = `set_${Math.random()}`): WorkoutSet {
  return { id, reps: 10, weight: 50, completed };
}

function makeExercise(
  id: string,
  completedFlags: boolean[],
  overrides: Partial<ActiveExercise> = {},
): ActiveExercise {
  return {
    id,
    exerciseId: `ex_${id}`,
    name: `Exercício ${id}`,
    muscleGroup: 'chest',
    sets: completedFlags.map((completed, index) => makeSet(completed, `${id}_set_${index}`)),
    ...overrides,
  };
}

function makeSession(
  exercises: ActiveExercise[],
  overrides: Partial<WorkoutSession> = {},
): WorkoutSession {
  return {
    id: 'session_1',
    name: 'Treino',
    date: '2026-07-21',
    duration: 1800,
    calories: 200,
    exercises,
    xpEarned: 50,
    ...overrides,
  };
}

describe('SESSION_STATUS_STYLES / sessionStatusStyle', () => {
  it('concluída quando status explicito completed', () => {
    const session = makeSession([makeExercise('a', [true, true])], { status: 'completed' });
    expect(resolveSessionStatus(session)).toBe('completed');
    expect(sessionStatusStyle(session).label).toBe('Concluída');
  });

  it('parcial quando status explicito partial', () => {
    const session = makeSession([makeExercise('a', [true, false])], { status: 'partial' });
    expect(resolveSessionStatus(session)).toBe('partial');
    expect(sessionStatusStyle(session).label).toBe('Parcial');
  });

  it('abandonada quando status explicito abandoned', () => {
    const session = makeSession([makeExercise('a', [false, false])], { status: 'abandoned' });
    expect(resolveSessionStatus(session)).toBe('abandoned');
    expect(sessionStatusStyle(session).label).toBe('Abandonada');
  });

  it('em andamento quando status active', () => {
    const session = makeSession([makeExercise('a', [false])], { status: 'active' });
    expect(resolveSessionStatus(session)).toBe('active');
    expect(sessionStatusStyle(session).label).toBe('Em andamento');
  });

  it('cada status tem label, className e dotClassName nao vazios', () => {
    for (const style of Object.values(SESSION_STATUS_STYLES)) {
      expect(style.label.length).toBeGreaterThan(0);
      expect(style.className.length).toBeGreaterThan(0);
      expect(style.dotClassName.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveSessionStatus — fallback legado sem status', () => {
  it('deriva completed quando todas as series concluidas e sem status', () => {
    const session = makeSession([makeExercise('a', [true, true]), makeExercise('b', [true])]);
    expect(resolveSessionStatus(session)).toBe('completed');
  });

  it('deriva partial quando parte concluida e parte incompleta', () => {
    const session = makeSession([makeExercise('a', [true, false])]);
    expect(resolveSessionStatus(session)).toBe('partial');
  });

  it('deriva abandoned quando nenhuma serie concluida', () => {
    const session = makeSession([makeExercise('a', [false, false])]);
    expect(resolveSessionStatus(session)).toBe('abandoned');
  });

  it('deriva abandoned quando nao ha series', () => {
    const session = makeSession([makeExercise('a', [])]);
    expect(resolveSessionStatus(session)).toBe('abandoned');
  });
});

describe('ENTRY_ORIGIN_STYLES / entryOriginStyle', () => {
  it('planned, added e swapped tem labels corretos', () => {
    expect(ENTRY_ORIGIN_STYLES.planned.label).toBe('Planejado');
    expect(ENTRY_ORIGIN_STYLES.added.label).toBe('Adicionado');
    expect(ENTRY_ORIGIN_STYLES.swapped.label).toBe('Substituído');
  });

  it('resolveEntryOrigin usa o campo explicito', () => {
    expect(resolveEntryOrigin(makeExercise('a', [true], { entryOrigin: 'added' }))).toBe('added');
    expect(resolveEntryOrigin(makeExercise('a', [true], { entryOrigin: 'swapped' }))).toBe('swapped');
    expect(resolveEntryOrigin(makeExercise('a', [true], { entryOrigin: 'planned' }))).toBe('planned');
  });

  it('fallback legado sem entryOrigin resolve como planned', () => {
    const ex = makeExercise('a', [true]);
    expect(ex.entryOrigin).toBeUndefined();
    expect(resolveEntryOrigin(ex)).toBe('planned');
    expect(entryOriginStyle(ex).label).toBe('Planejado');
  });
});

describe('ENTRY_STATUS_STYLES / entryStatusStyle', () => {
  it('performed, partial, skipped e planned tem labels corretos', () => {
    expect(ENTRY_STATUS_STYLES.performed.label).toBe('Realizado');
    expect(ENTRY_STATUS_STYLES.partial.label).toBe('Parcial');
    expect(ENTRY_STATUS_STYLES.skipped.label).toBe('Pulado');
    expect(ENTRY_STATUS_STYLES.planned.label).toBe('Planejado');
  });

  it('cada estilo tem classes nao vazias', () => {
    for (const style of Object.values(ENTRY_STATUS_STYLES)) {
      expect(style.className.length).toBeGreaterThan(0);
      expect(style.dotClassName.length).toBeGreaterThan(0);
    }
  });

  it('usa entryStatus explicito quando presente', () => {
    expect(resolveEntryStatus(makeExercise('a', [true, true], { entryStatus: 'performed' }))).toBe('performed');
    expect(resolveEntryStatus(makeExercise('a', [false, false], { entryStatus: 'skipped' }))).toBe('skipped');
  });
});

describe('resolveEntryStatus — fallback legado sem entryStatus', () => {
  it('deriva performed quando todas as series concluidas', () => {
    expect(resolveEntryStatus(makeExercise('a', [true, true]))).toBe('performed');
    expect(entryStatusStyle(makeExercise('a', [true, true])).label).toBe('Realizado');
  });

  it('deriva partial quando parte concluida', () => {
    expect(resolveEntryStatus(makeExercise('a', [true, false]))).toBe('partial');
  });

  it('deriva skipped quando ha series mas nenhuma concluida', () => {
    expect(resolveEntryStatus(makeExercise('a', [false, false]))).toBe('skipped');
    expect(entryStatusStyle(makeExercise('a', [false, false])).label).toBe('Pulado');
  });

  it('deriva planned quando nao ha series', () => {
    expect(resolveEntryStatus(makeExercise('a', []))).toBe('planned');
  });
});

describe('contagem de series e exercicios', () => {
  const exercises = [
    makeExercise('a', [true, true, false]), // performed? não (1 incompleta) → partial
    makeExercise('b', [true, true]), // performed
    makeExercise('c', [false, false]), // skipped
    makeExercise('d', []), // planned
  ];

  it('countTotalSets soma todas as series', () => {
    expect(countTotalSets(exercises)).toBe(3 + 2 + 2 + 0);
  });

  it('countCompletedSets soma apenas as concluidas', () => {
    expect(countCompletedSets(exercises)).toBe(2 + 2 + 0 + 0);
  });

  it('countIncompleteSets soma as nao concluidas', () => {
    expect(countIncompleteSets(exercises)).toBe(1 + 0 + 2 + 0);
  });

  it('countPerformedExercises conta apenas exercicios totalmente realizados', () => {
    expect(countPerformedExercises(exercises)).toBe(1);
  });

  it('countSkippedExercises conta apenas exercicios pulados', () => {
    expect(countSkippedExercises(exercises)).toBe(1);
  });

  it('lista vazia nao quebra as contagens', () => {
    expect(countTotalSets([])).toBe(0);
    expect(countCompletedSets([])).toBe(0);
    expect(countIncompleteSets([])).toBe(0);
    expect(countPerformedExercises([])).toBe(0);
    expect(countSkippedExercises([])).toBe(0);
  });
});

describe('buildSessionSummary', () => {
  it('agrega status e contagens de uma sessao concluida', () => {
    const session = makeSession(
      [makeExercise('a', [true, true]), makeExercise('b', [true])],
      { status: 'completed' },
    );
    const summary = buildSessionSummary(session);
    expect(summary.status).toBe('completed');
    expect(summary.statusStyle.label).toBe('Concluída');
    expect(summary.totalExercises).toBe(2);
    expect(summary.performedExercises).toBe(2);
    expect(summary.skippedExercises).toBe(0);
    expect(summary.totalSets).toBe(3);
    expect(summary.completedSets).toBe(3);
    expect(summary.incompleteSets).toBe(0);
  });

  it('agrega status e contagens de uma sessao parcial', () => {
    const session = makeSession(
      [makeExercise('a', [true, false]), makeExercise('b', [false, false])],
      { status: 'partial' },
    );
    const summary = buildSessionSummary(session);
    expect(summary.status).toBe('partial');
    expect(summary.totalExercises).toBe(2);
    expect(summary.performedExercises).toBe(0);
    expect(summary.skippedExercises).toBe(1);
    expect(summary.totalSets).toBe(4);
    expect(summary.completedSets).toBe(1);
    expect(summary.incompleteSets).toBe(3);
  });

  it('agrega status e contagens de uma sessao abandonada', () => {
    const session = makeSession(
      [makeExercise('a', [false, false]), makeExercise('b', [false])],
      { status: 'abandoned' },
    );
    const summary = buildSessionSummary(session);
    expect(summary.status).toBe('abandoned');
    expect(summary.performedExercises).toBe(0);
    expect(summary.skippedExercises).toBe(2);
    expect(summary.completedSets).toBe(0);
    expect(summary.incompleteSets).toBe(3);
  });

  it('sessao legada sem status deriva o resumo sem inventar dados', () => {
    const session = makeSession([makeExercise('a', [true, true]), makeExercise('b', [false, false])]);
    const summary = buildSessionSummary(session);
    expect(summary.status).toBe('partial');
    expect(summary.performedExercises).toBe(1);
    expect(summary.skippedExercises).toBe(1);
    expect(summary.completedSets).toBe(2);
    expect(summary.incompleteSets).toBe(2);
  });

  it('sessao ativa sem series concluidas mostra em andamento', () => {
    const session = makeSession([makeExercise('a', [false, false])], { status: 'active' });
    const summary = buildSessionSummary(session);
    expect(summary.status).toBe('active');
    expect(summary.completedSets).toBe(0);
  });
});

describe('contagem no treino ativo (entryStatus preso em planned)', () => {
  // Na sessão ativa o contexto carimba entryStatus: 'planned' no início e só
  // regrava na finalização. As contagens precisam derivar das séries, não ler o
  // campo armazenado, para refletir o progresso real.
  it('conta performed/skipped derivando das series mesmo com entryStatus planned', () => {
    const exercises = [
      makeExercise('a', [true, true], { entryOrigin: 'planned', entryStatus: 'planned' }),
      makeExercise('b', [false, false], { entryOrigin: 'added', entryStatus: 'planned' }),
    ];
    expect(countPerformedExercises(exercises)).toBe(1);
    expect(countSkippedExercises(exercises)).toBe(1);
    expect(countCompletedSets(exercises)).toBe(2);
    expect(countIncompleteSets(exercises)).toBe(2);
  });
});

describe('buildSessionPreview — prévia da finalização (treino ativo)', () => {
  it('deriva completed ignorando o status active armazenado', () => {
    const session = makeSession(
      [makeExercise('a', [true, true]), makeExercise('b', [true])],
      { status: 'active' },
    );
    const preview = buildSessionPreview(session);
    expect(preview.status).toBe('completed');
    expect(preview.statusStyle.label).toBe('Concluída');
    expect(preview.completedSets).toBe(3);
    expect(preview.incompleteSets).toBe(0);
    expect(preview.performedExercises).toBe(2);
  });

  it('deriva partial quando ha serie incompleta', () => {
    const session = makeSession(
      [makeExercise('a', [true, false]), makeExercise('b', [false, false])],
      { status: 'active' },
    );
    const preview = buildSessionPreview(session);
    expect(preview.status).toBe('partial');
    expect(preview.skippedExercises).toBe(1);
    expect(preview.completedSets).toBe(1);
    expect(preview.incompleteSets).toBe(3);
  });

  it('deriva abandoned quando nenhuma serie concluida', () => {
    const session = makeSession(
      [makeExercise('a', [false, false])],
      { status: 'active' },
    );
    const preview = buildSessionPreview(session);
    expect(preview.status).toBe('abandoned');
    expect(preview.statusStyle.label).toBe('Abandonada');
    expect(preview.completedSets).toBe(0);
  });
});

describe('SWAP_REASON_LABELS / SWAP_REASON_ORDER / resolveSwapReasonLabel', () => {
  const CODES = [
    'equipment-occupied',
    'equipment-unavailable',
    'discomfort',
    'preference',
    'technique-fit',
    'other',
  ] as const;

  it('tem um rótulo não-vazio para todos os 6 motivos', () => {
    for (const code of CODES) {
      expect(SWAP_REASON_LABELS[code].length).toBeGreaterThan(0);
    }
    expect(Object.keys(SWAP_REASON_LABELS)).toHaveLength(6);
  });

  it('SWAP_REASON_ORDER lista exatamente os 6 códigos, sem repetição', () => {
    expect(SWAP_REASON_ORDER).toHaveLength(6);
    expect(new Set(SWAP_REASON_ORDER).size).toBe(6);
    expect([...SWAP_REASON_ORDER].sort()).toEqual([...CODES].sort());
  });

  it('resolveSwapReasonLabel resolve o código e trata ausência de motivo', () => {
    expect(resolveSwapReasonLabel('discomfort')).toBe(SWAP_REASON_LABELS.discomfort);
    expect(resolveSwapReasonLabel(undefined)).toBeUndefined();
  });
});

describe('buildSwapView', () => {
  it('monta planejado × executado + motivo + nota de uma troca completa', () => {
    const ex = makeExercise('a', [true], {
      exerciseId: 'crucifixo',
      name: 'Crucifixo',
      muscleGroup: 'chest',
      entryOrigin: 'swapped',
      plannedExerciseId: 'supino',
      plannedExerciseName: 'Supino',
      plannedMuscleGroup: 'chest',
      swapReasonCode: 'equipment-occupied',
      swapReasonNote: 'barra ocupada',
    });
    const view = buildSwapView(ex);
    expect(view.planned).toBe('Supino');
    expect(view.hasOriginal).toBe(true);
    expect(view.performed).toBe('Crucifixo');
    expect(view.reasonCode).toBe('equipment-occupied');
    expect(view.reasonLabel).toBe(SWAP_REASON_LABELS['equipment-occupied']);
    expect(view.note).toBe('barra ocupada');
  });

  it('fallback legado: swapped sem snapshot usa "Original não registrado"', () => {
    const ex = makeExercise('a', [true], {
      exerciseId: 'crucifixo',
      name: 'Crucifixo',
      muscleGroup: 'chest',
      entryOrigin: 'swapped',
      // sem plannedExerciseName / swapReasonCode / swapReasonNote (registro pré-GOAL-24)
    });
    const view = buildSwapView(ex);
    expect(view.planned).toBe(MISSING_ORIGINAL_LABEL);
    expect(view.hasOriginal).toBe(false);
    expect(view.performed).toBe('Crucifixo');
    expect(view.reasonCode).toBeUndefined();
    expect(view.reasonLabel).toBeUndefined();
    expect(view).not.toHaveProperty('note');
  });

  it('troca com motivo mas sem nota não expõe note', () => {
    const ex = makeExercise('a', [true], {
      name: 'Crucifixo',
      entryOrigin: 'swapped',
      plannedExerciseName: 'Supino',
      plannedMuscleGroup: 'chest',
      swapReasonCode: 'preference',
    });
    const view = buildSwapView(ex);
    expect(view.planned).toBe('Supino');
    expect(view.hasOriginal).toBe(true);
    expect(view.reasonLabel).toBe(SWAP_REASON_LABELS.preference);
    expect(view).not.toHaveProperty('note');
  });
});
