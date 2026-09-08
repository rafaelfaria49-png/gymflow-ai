import { describe, expect, it } from 'vitest';
import { getCivilDateString } from './nutrition-civil-date';

describe('nutrition-civil-date (NUT-001 canonical civil date rules)', () => {
  it('retorna a data civil no formato estrito YYYY-MM-DD com padding', () => {
    const d = new Date(2026, 0, 5); // 05/01/2026 local
    expect(getCivilDateString(d)).toBe('2026-01-05');
  });

  it('lida corretamente com viradas de mês e ano bissexto', () => {
    const leapDay = new Date(2024, 1, 29); // 29/02/2024
    expect(getCivilDateString(leapDay)).toBe('2024-02-29');

    const yearEnd = new Date(2026, 11, 31); // 31/12/2026
    expect(getCivilDateString(yearEnd)).toBe('2026-12-31');
  });

  it('prova que 20:59 e 21:01 em America/Sao_Paulo pertencem à mesma data civil (08/09/2026)', () => {
    // 2026-09-08 20:59 BRT (-03:00) => 23:59:00Z UTC
    const t2059 = new Date('2026-09-08T23:59:00.000Z');
    // 2026-09-08 21:01 BRT (-03:00) => 2026-09-09 00:01:00Z UTC (em UTC já virou o dia!)
    const t2101 = new Date('2026-09-09T00:01:00.000Z');

    // toISOString().split('T')[0] gerava o bug P1:
    expect(t2059.toISOString().split('T')[0]).toBe('2026-09-08');
    expect(t2101.toISOString().split('T')[0]).toBe('2026-09-09'); // Bug UTC

    // A resolução canônica em America/Sao_Paulo preserva a mesma data civil:
    expect(getCivilDateString(t2059, 'America/Sao_Paulo')).toBe('2026-09-08');
    expect(getCivilDateString(t2101, 'America/Sao_Paulo')).toBe('2026-09-08');
  });

  it('prova que a virada real para o dia seguinte em America/Sao_Paulo altera a data civil', () => {
    // 2026-09-09 00:05 BRT (-03:00) => 2026-09-09 03:05:00Z UTC
    const t0005NextDay = new Date('2026-09-09T03:05:00.000Z');
    expect(getCivilDateString(t0005NextDay, 'America/Sao_Paulo')).toBe('2026-09-09');
  });

  it('funciona para múltiplos fusos horários sem hardcoding', () => {
    // 2026-09-08 23:30:00Z
    const instant = new Date('2026-09-08T23:30:00.000Z');

    // Em Tokyo (UTC+9), já é 09/09 às 08:30
    expect(getCivilDateString(instant, 'Asia/Tokyo')).toBe('2026-09-09');

    // Em Nova York (UTC-4), é 08/09 às 19:30
    expect(getCivilDateString(instant, 'America/New_York')).toBe('2026-09-08');

    // Em UTC, é 08/09 às 23:30
    expect(getCivilDateString(instant, 'UTC')).toBe('2026-09-08');
  });

  it('sem parâmetros, utiliza o instante do relógio do sistema', () => {
    const str = getCivilDateString();
    expect(str).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
