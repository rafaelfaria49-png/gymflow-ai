/**
 * Utilitário canônico de data civil para o domínio de nutrição (NUT-001).
 *
 * Retorna a representação de data civil no formato ISO 'YYYY-MM-DD'
 * baseada no calendário local do dispositivo/usuário (ou fuso horário explícito).
 *
 * IMPORTANTE:
 * Não utiliza Date.prototype.toISOString().split('T')[0], pois toISOString() projeta
 * o instante em UTC (GMT+0). Em fusos de offset negativo como America/Sao_Paulo (UTC-3),
 * a data em UTC vira à meia-noite UTC (21:00 horário de Brasília), gerando concessão
 * prematura/duplicada de XP nutricional antes do término do dia civil local.
 */
export function getCivilDateString(date: Date = new Date(), timeZone?: string): string {
  if (timeZone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
