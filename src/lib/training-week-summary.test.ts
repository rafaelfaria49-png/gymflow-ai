import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../types';
import { getTrainingWeekSummary } from './training-week-summary';
function session(date: string, status: WorkoutSession['status'] = 'completed'): WorkoutSession {
  return { id: date, date, status, name: 'Treino', duration: 0, calories: 0, xpEarned: 0, exercises: [] };
}
describe('resumo semanal civil GOAL-119', () => {
  it('inclui segunda-feira e domingo, exclui semanas vizinhas e sessões parciais', () => {
    const result = getTrainingWeekSummary([
      session('2026-09-27'), session('2026-09-28'), session('2026-10-04'),
      session('2026-10-05'), session('2026-09-30', 'partial'),
    ], new Date(2026, 8, 30, 10, 0));
    expect(result.count).toBe(2);
    expect(result.days[0]).toEqual({ date: '2026-09-28', trained: true, isToday: false });
    expect(result.days[2].isToday).toBe(true);
    expect(result.days[6]).toEqual({ date: '2026-10-04', trained: true, isToday: false });
  });
});
