import { describe, expect, it } from 'vitest';
import type { ActiveExercise, ExerciseSlot, WorkoutSession, WorkoutSet, WorkoutSwapReasonCode } from '../types';
import {
  buildAbandonedSessionLog,
  buildSessionPlan,
  deriveExerciseEntryStatus,
  deriveSessionStatus,
  finalizeSession,
  markEntrySwapped,
  MAX_SWAP_REASON_NOTE_LENGTH,
  normalizeSwapReasonNote,
  startActiveSession,
} from './workout-session-domain';

function makeSlot(exerciseId: string, series = 3): ExerciseSlot {
  return {
    exerciseId,
    series,
    repRange: [8, 12],
    targetRPE: 8,
    restSec: 90,
    progression: 'dupla',
    incrementKg: 2.5,
  };
}

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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('buildSessionPlan', () => {
  it('deriva o plano de um dia de programa multi-dia preservando ordem e plannedSlotIndex', () => {
    const slots = [makeSlot('supino'), makeSlot('crucifixo'), makeSlot('triceps')];
    const plan = buildSessionPlan({
      kind: 'program-day',
      name: 'Programa X — Dia A',
      slots,
      sourceProgramId: 'prog-1',
      sourceProgramDayId: 'day-a',
      sourceProgramName: 'Programa X',
      sourceProgramDayName: 'Dia A',
    });

    expect(plan.origin).toBe('program-day');
    expect(plan.entries.map((e) => e.exerciseId)).toEqual(['supino', 'crucifixo', 'triceps']);
    expect(plan.entries.map((e) => e.plannedSlotIndex)).toEqual([0, 1, 2]);
    expect(plan.entries[0]).toMatchObject({ series: 3, repRange: [8, 12], targetRPE: 8, restSec: 90 });
    expect(plan.sourceProgramDayId).toBe('day-a');
    expect(plan.sourceProgramDayName).toBe('Dia A');
  });

  it('cada dia de um programa multi-dia gera um plano independente', () => {
    const dayA = buildSessionPlan({ kind: 'program-day', name: 'Dia A', slots: [makeSlot('a1')], sourceProgramDayId: 'day-a' });
    const dayB = buildSessionPlan({ kind: 'program-day', name: 'Dia B', slots: [makeSlot('b1'), makeSlot('b2')], sourceProgramDayId: 'day-b' });

    expect(dayA.entries).toHaveLength(1);
    expect(dayB.entries).toHaveLength(2);
    expect(dayA.sourceProgramDayId).toBe('day-a');
    expect(dayB.sourceProgramDayId).toBe('day-b');
  });

  it('deriva o plano de um programa flat legado (sem repRange), preenchendo séries', () => {
    const plan = buildSessionPlan({
      kind: 'legacy-program',
      name: 'Programa Antigo',
      exercises: [
        { exerciseId: 'a', sets: 4, reps: '10' },
        { exerciseId: 'b', reps: '12' }, // sem sets → default
      ],
      sourceProgramId: 'legacy-1',
      sourceProgramName: 'Programa Antigo',
    });

    expect(plan.origin).toBe('legacy-program');
    expect(plan.entries.map((e) => e.series)).toEqual([4, 3]);
    expect(plan.entries.map((e) => e.plannedSlotIndex)).toEqual([0, 1]);
    expect(plan.entries[0].repRange).toBeUndefined();
    expect(plan.sourceProgramDayId).toBeUndefined();
  });

  it('deriva o plano de uma sessão livre a partir dos ids iniciais', () => {
    const plan = buildSessionPlan({ kind: 'free', name: 'Treino Livre', exerciseIds: ['default_ex'] });
    expect(plan.origin).toBe('free');
    expect(plan.entries).toEqual([{ plannedSlotIndex: 0, exerciseId: 'default_ex', series: 1 }]);
    expect(plan.sourceProgramId).toBeUndefined();
  });

  it('sessão livre sem exercícios iniciais gera plano vazio', () => {
    const plan = buildSessionPlan({ kind: 'free', name: 'Vazio' });
    expect(plan.entries).toEqual([]);
  });
});

describe('startActiveSession', () => {
  const plan = buildSessionPlan({
    kind: 'program-day',
    name: 'Dia A',
    slots: [makeSlot('supino'), makeSlot('crucifixo')],
    sourceProgramId: 'prog-1',
    sourceProgramDayId: 'day-a',
  });

  function start() {
    return startActiveSession({
      plan,
      sessionId: 'session_1',
      name: 'Dia A',
      date: '2026-07-21',
      startedAt: 1000,
      exercises: [
        makeExercise('active_a', [false, false, false], { exerciseId: 'supino' }),
        makeExercise('active_b', [false, false, false], { exerciseId: 'crucifixo' }),
      ],
    });
  }

  it('cria a sessão com status active e startedAt', () => {
    const { session } = start();
    expect(session.status).toBe('active');
    expect(session.startedAt).toBe(1000);
    expect(session.id).toBe('session_1');
    expect(session.duration).toBe(0);
  });

  it('marca todos os exercícios iniciais com origem planned e status planned', () => {
    const { session } = start();
    expect(session.exercises.every((e) => e.entryOrigin === 'planned')).toBe(true);
    expect(session.exercises.every((e) => e.entryStatus === 'planned')).toBe(true);
  });

  it('liga cada exercício ao slot planejado (plannedSlotIndex + plannedExerciseId)', () => {
    const { session } = start();
    expect(session.exercises[0]).toMatchObject({ plannedSlotIndex: 0, plannedExerciseId: 'supino' });
    expect(session.exercises[1]).toMatchObject({ plannedSlotIndex: 1, plannedExerciseId: 'crucifixo' });
  });

  it('preserva a identidade única (ActiveExercise.id) de cada entrada', () => {
    const { session } = start();
    const ids = session.exercises.map((e) => e.id);
    expect(ids).toEqual(['active_a', 'active_b']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('herda a origem do plano na sessão', () => {
    const { session } = start();
    expect(session.sourceProgramId).toBe('prog-1');
    expect(session.sourceProgramDayId).toBe('day-a');
  });

  it('não muta o array de exercícios recebido', () => {
    const exercises = [makeExercise('active_a', [false], { exerciseId: 'supino' })];
    deepFreeze(exercises);
    expect(() =>
      startActiveSession({ plan, sessionId: 's', name: 'n', date: 'd', startedAt: 1, exercises }),
    ).not.toThrow();
    expect(exercises[0].entryOrigin).toBeUndefined();
  });
});

describe('deriveExerciseEntryStatus', () => {
  it('performed quando todas as séries estão concluídas', () => {
    expect(deriveExerciseEntryStatus(makeExercise('x', [true, true, true]))).toBe('performed');
  });
  it('partial quando parte das séries está concluída', () => {
    expect(deriveExerciseEntryStatus(makeExercise('x', [true, false, false]))).toBe('partial');
  });
  it('skipped quando há séries mas nenhuma concluída', () => {
    expect(deriveExerciseEntryStatus(makeExercise('x', [false, false]))).toBe('skipped');
  });
  it('planned quando não há séries', () => {
    expect(deriveExerciseEntryStatus(makeExercise('x', []))).toBe('planned');
  });
});

describe('deriveSessionStatus', () => {
  it('completed quando todas as séries de todos os exercícios foram concluídas', () => {
    const exercises = [makeExercise('a', [true, true]), makeExercise('b', [true])];
    expect(deriveSessionStatus(exercises)).toBe('completed');
  });
  it('partial quando pelo menos uma concluída e pelo menos uma incompleta', () => {
    const exercises = [makeExercise('a', [true, false]), makeExercise('b', [false])];
    expect(deriveSessionStatus(exercises)).toBe('partial');
  });
  it('partial mesmo quando um exercício inteiro foi pulado mas outro foi feito', () => {
    const exercises = [makeExercise('a', [true, true]), makeExercise('b', [false, false])];
    expect(deriveSessionStatus(exercises)).toBe('partial');
  });
  it('abandoned quando nenhuma série foi concluída', () => {
    const exercises = [makeExercise('a', [false, false]), makeExercise('b', [false])];
    expect(deriveSessionStatus(exercises)).toBe('abandoned');
  });
  it('abandoned quando não há séries', () => {
    expect(deriveSessionStatus([makeExercise('a', [])])).toBe('abandoned');
  });
});

describe('normalizeSwapReasonNote', () => {
  it('undefined, vazio ou só espaços viram undefined', () => {
    expect(normalizeSwapReasonNote(undefined)).toBeUndefined();
    expect(normalizeSwapReasonNote('')).toBeUndefined();
    expect(normalizeSwapReasonNote('    ')).toBeUndefined();
  });
  it('apara espaços das pontas', () => {
    expect(normalizeSwapReasonNote('  ombro sensível  ')).toBe('ombro sensível');
  });
  it('mantém nota dentro do limite intacta', () => {
    expect(normalizeSwapReasonNote('barra ocupada')).toBe('barra ocupada');
  });
  it('limita a MAX_SWAP_REASON_NOTE_LENGTH caracteres', () => {
    const normalized = normalizeSwapReasonNote('a'.repeat(200));
    expect(normalized).toHaveLength(MAX_SWAP_REASON_NOTE_LENGTH);
    expect(normalized).toBe('a'.repeat(MAX_SWAP_REASON_NOTE_LENGTH));
  });
});

describe('markEntrySwapped', () => {
  // Simula o fluxo do contexto: troca a identidade (como swapWorkoutExercise) e
  // depois aplica markEntrySwapped com o exercício ORIGINAL (antes da troca).
  function performSwap(
    original: ActiveExercise,
    replacement: { exerciseId: string; name: string; muscleGroup: string },
    meta: { reasonCode: WorkoutSwapReasonCode; reasonNote?: string; swappedAt: number },
  ): ActiveExercise {
    const afterSwap: ActiveExercise = { ...original, ...replacement };
    return markEntrySwapped(afterSwap, { original, ...meta });
  }

  const planned = makeExercise('active_a', [true, false], {
    exerciseId: 'supino',
    name: 'Supino',
    muscleGroup: 'chest',
    entryOrigin: 'planned',
    plannedSlotIndex: 0,
    plannedExerciseId: 'supino',
  });

  it('primeira troca salva o snapshot do original e o motivo', () => {
    const swapped = performSwap(
      planned,
      { exerciseId: 'crucifixo', name: 'Crucifixo', muscleGroup: 'chest' },
      { reasonCode: 'equipment-occupied', swappedAt: 1000 },
    );
    expect(swapped.entryOrigin).toBe('swapped');
    expect(swapped.exerciseId).toBe('crucifixo');
    expect(swapped.name).toBe('Crucifixo');
    // snapshot do original preservado
    expect(swapped.plannedExerciseId).toBe('supino');
    expect(swapped.plannedExerciseName).toBe('Supino');
    expect(swapped.plannedMuscleGroup).toBe('chest');
    // motivo + timestamp registrados; sem nota
    expect(swapped.swapReasonCode).toBe('equipment-occupied');
    expect(swapped.swappedAt).toBe(1000);
    expect(swapped).not.toHaveProperty('swapReasonNote');
  });

  it('grava e normaliza a nota da troca', () => {
    const swapped = performSwap(
      planned,
      { exerciseId: 'crucifixo', name: 'Crucifixo', muscleGroup: 'chest' },
      { reasonCode: 'other', reasonNote: `  ${'x'.repeat(200)}  `, swappedAt: 1 },
    );
    expect(swapped.swapReasonNote).toHaveLength(MAX_SWAP_REASON_NOTE_LENGTH);
  });

  it('trocas sucessivas preservam o PRIMEIRO original e atualizam motivo/nota/timestamp', () => {
    const first = performSwap(
      planned,
      { exerciseId: 'crucifixo', name: 'Crucifixo', muscleGroup: 'chest' },
      { reasonCode: 'equipment-occupied', reasonNote: 'barra ocupada', swappedAt: 1000 },
    );
    const second = performSwap(
      first,
      { exerciseId: 'peck', name: 'Peck Deck', muscleGroup: 'chest' },
      { reasonCode: 'preference', swappedAt: 2000 },
    );
    // o snapshot continua sendo o do PRIMEIRO original
    expect(second.plannedExerciseId).toBe('supino');
    expect(second.plannedExerciseName).toBe('Supino');
    expect(second.plannedMuscleGroup).toBe('chest');
    // executado, motivo e timestamp atualizados
    expect(second.exerciseId).toBe('peck');
    expect(second.name).toBe('Peck Deck');
    expect(second.swapReasonCode).toBe('preference');
    expect(second.swappedAt).toBe(2000);
    // a nota da troca ATUAL (ausente) substitui a anterior
    expect(second).not.toHaveProperty('swapReasonNote');
  });

  it('troca de exercício ADDED captura o exercício anterior como original', () => {
    const added = makeExercise('active_x', [false], {
      exerciseId: 'rosca',
      name: 'Rosca Direta',
      muscleGroup: 'biceps',
      entryOrigin: 'added',
    });
    expect(added.plannedExerciseId).toBeUndefined();
    const swapped = performSwap(
      added,
      { exerciseId: 'martelo', name: 'Rosca Martelo', muscleGroup: 'biceps' },
      { reasonCode: 'technique-fit', swappedAt: 500 },
    );
    expect(swapped.entryOrigin).toBe('swapped');
    expect(swapped.plannedExerciseId).toBe('rosca');
    expect(swapped.plannedExerciseName).toBe('Rosca Direta');
    expect(swapped.plannedMuscleGroup).toBe('biceps');
    expect(swapped.exerciseId).toBe('martelo');
  });

  it('preserva séries, reps, carga, RPE e descanso do exercício', () => {
    const withSets = makeExercise('active_s', [], {
      exerciseId: 'supino',
      name: 'Supino',
      muscleGroup: 'chest',
      entryOrigin: 'planned',
      plannedExerciseId: 'supino',
      restSec: 90,
      targetRPE: 8,
      repRange: [8, 12],
      sets: [
        { id: 's1', reps: 10, weight: 80, completed: true, rpe: 8 },
        { id: 's2', reps: 9, weight: 82.5, completed: false, rpe: 9 },
      ],
    });
    const swapped = performSwap(
      withSets,
      { exerciseId: 'crucifixo', name: 'Crucifixo', muscleGroup: 'chest' },
      { reasonCode: 'preference', swappedAt: 10 },
    );
    expect(swapped.sets).toEqual(withSets.sets);
    expect(swapped.restSec).toBe(90);
    expect(swapped.targetRPE).toBe(8);
    expect(swapped.repRange).toEqual([8, 12]);
  });

  it('não muta o exercício original recebido', () => {
    const original = makeExercise('active_f', [false], {
      exerciseId: 'supino',
      name: 'Supino',
      muscleGroup: 'chest',
      entryOrigin: 'planned',
      plannedExerciseId: 'supino',
    });
    deepFreeze(original);
    expect(() =>
      performSwap(
        original,
        { exerciseId: 'crucifixo', name: 'Crucifixo', muscleGroup: 'chest' },
        { reasonCode: 'preference', swappedAt: 1 },
      ),
    ).not.toThrow();
    expect(original.entryOrigin).toBe('planned');
    expect(original).not.toHaveProperty('plannedExerciseName');
  });
});

describe('finalizeSession', () => {
  function activeSession(): WorkoutSession {
    return {
      id: 'session_1',
      name: 'Dia A',
      date: '2026-07-21',
      duration: 0,
      calories: 0,
      xpEarned: 0,
      status: 'active',
      startedAt: 1000,
      exercises: [
        makeExercise('a', [true, true], { entryOrigin: 'planned', entryStatus: 'planned' }),
        makeExercise('b', [true, false], { entryOrigin: 'added', entryStatus: 'planned' }),
      ],
    };
  }

  const finalizeParams = {
    endedAt: 5000,
    duration: 4,
    calories: 200,
    totalVolume: 3200,
    prsDetected: ['Supino 100kg'],
    xpEarned: 150,
  };

  it('grava status derivado, endedAt e duração', () => {
    const { session } = finalizeSession({ session: activeSession(), ...finalizeParams });
    expect(session.status).toBe('partial'); // a=performed, b=partial
    expect(session.endedAt).toBe(5000);
    expect(session.duration).toBe(4);
    expect(session.startedAt).toBe(1000); // preservado
  });

  it('usa volume, PRs e XP EXATAMENTE como recebidos (não recalcula)', () => {
    const { session } = finalizeSession({ session: activeSession(), ...finalizeParams });
    expect(session.totalVolume).toBe(3200);
    expect(session.prsDetected).toEqual(['Supino 100kg']);
    expect(session.xpEarned).toBe(150);
    expect(session.calories).toBe(200);
  });

  it('deriva entryStatus por exercício preservando origem e séries incompletas', () => {
    const { session } = finalizeSession({ session: activeSession(), ...finalizeParams });
    expect(session.exercises[0]).toMatchObject({ entryOrigin: 'planned', entryStatus: 'performed' });
    expect(session.exercises[1]).toMatchObject({ entryOrigin: 'added', entryStatus: 'partial' });
    // séries incompletas continuam no snapshot
    expect(session.exercises[1].sets).toHaveLength(2);
    expect(session.exercises[1].sets.filter((s) => s.completed)).toHaveLength(1);
  });

  it('não muta a sessão ativa recebida', () => {
    const source = activeSession();
    deepFreeze(source);
    expect(() => finalizeSession({ session: source, ...finalizeParams })).not.toThrow();
    expect(source.status).toBe('active');
    expect(source.endedAt).toBeUndefined();
    expect(source.exercises[0].entryStatus).toBe('planned');
  });

  it('sessão completa vira completed; sessão sem séries concluídas vira abandoned', () => {
    const completed = finalizeSession({
      session: { ...activeSession(), exercises: [makeExercise('a', [true, true])] },
      ...finalizeParams,
    });
    expect(completed.session.status).toBe('completed');

    const abandoned = finalizeSession({
      session: { ...activeSession(), exercises: [makeExercise('a', [false, false])] },
      ...finalizeParams,
    });
    expect(abandoned.session.status).toBe('abandoned');
  });

  it('preserva os metadados de substituição (GOAL-24) no histórico', () => {
    const swappedExercise = makeExercise('a', [true, true], {
      exerciseId: 'crucifixo',
      name: 'Crucifixo',
      muscleGroup: 'chest',
      entryOrigin: 'swapped',
      entryStatus: 'planned',
      plannedExerciseId: 'supino',
      plannedExerciseName: 'Supino',
      plannedMuscleGroup: 'chest',
      swapReasonCode: 'equipment-occupied',
      swapReasonNote: 'barra ocupada',
      swappedAt: 1234,
    });
    const { session } = finalizeSession({
      session: { ...activeSession(), exercises: [swappedExercise] },
      ...finalizeParams,
    });
    const ex = session.exercises[0];
    expect(ex.entryOrigin).toBe('swapped');
    expect(ex.entryStatus).toBe('performed'); // derivado das séries na finalização
    expect(ex.plannedExerciseId).toBe('supino');
    expect(ex.plannedExerciseName).toBe('Supino');
    expect(ex.plannedMuscleGroup).toBe('chest');
    expect(ex.swapReasonCode).toBe('equipment-occupied');
    expect(ex.swapReasonNote).toBe('barra ocupada');
    expect(ex.swappedAt).toBe(1234);
  });
});

describe('buildAbandonedSessionLog', () => {
  it('produz um log abandoned preservando o snapshot completo (uso futuro)', () => {
    const source: WorkoutSession = {
      id: 'session_1',
      name: 'Dia A',
      date: '2026-07-21',
      duration: 0,
      calories: 0,
      xpEarned: 0,
      status: 'active',
      startedAt: 1000,
      exercises: [makeExercise('a', [false, false]), makeExercise('b', [false])],
    };
    deepFreeze(source);

    const { session } = buildAbandonedSessionLog({ session: source, endedAt: 4000, duration: 3 });
    expect(session.status).toBe('abandoned');
    expect(session.endedAt).toBe(4000);
    expect(session.duration).toBe(3);
    expect(session.exercises).toHaveLength(2);
    expect(session.exercises.every((e) => e.entryStatus === 'skipped')).toBe(true);
    expect(session.totalVolume).toBe(0);
    expect(session.prsDetected).toEqual([]);
    // não mutou a origem
    expect(source.status).toBe('active');
  });
});
