import type { WorkoutSession } from '../types';

function civilDate(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

/** Datas de sessão são civis: não reinterpretar YYYY-MM-DD como meia-noite UTC. */
export function getTrainingWeekSummary(history: readonly WorkoutSession[], now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const startKey = civilDate(start), endKey = civilDate(end), todayKey = civilDate(now);
  const completed = history.filter(session => session.status === 'completed' && session.date.slice(0, 10) >= startKey && session.date.slice(0, 10) < endKey);
  return {
    count: completed.length,
    days: Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      const key = civilDate(date);
      return { date: key, trained: completed.some(session => session.date.slice(0, 10) === key), isToday: key === todayKey };
    }),
  };
}
