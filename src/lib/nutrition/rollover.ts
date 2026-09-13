/**
 * GymFlow AI — Rollover idempotente do NutritionLedger (NUT-004A / GOAL-077)
 *
 * `ensureTodayNutritionDay` garante o dia ativo sobre uma abstração de
 * repository — nunca sobre stores concretos. A proteção contra duplo rollover
 * vem do `putNutritionDayIfAbsent` transacional do storage, NÃO de singleFlight
 * em memória (esta função não mantém nenhum estado global).
 *
 * Comportamento canônico:
 * - today já é o dia ativo → devolve o existente (`existing-active`);
 * - today existe mas não é ativo → reutiliza e ativa (`reused`);
 * - today não existe → fecha o anterior e cria today (`created`);
 * - nunca dois dias da mesma data; fechados nunca apagados; pulados nunca inventados;
 * - relógio retrocedido preserva todo o histórico (fecha só em avanço real).
 *
 * Datas sempre via `getCivilDateString(now, timezone)` — nenhum fuso hardcodado.
 * Sem wiring nesta slice (sem cold boot, sem visibilitychange, sem timer).
 */

import { getCivilDateString } from '../nutrition-civil-date';
import type { DailyTargets } from './engine-types';
import { closeNutritionDay, createNutritionDay } from './ledger';
import type { NutritionGateSnapshot } from './gate-snapshot';
import {
  NutritionLedgerError,
  type LedgerMigrationMarker,
  type NutritionDay,
  type NutritionTargetUnavailableReason,
} from './ledger-types';

// ============================================================================
// CONTRATO DE REPOSITORY
// ============================================================================

/**
 * Abstração mínima de persistência do ledger. O IndexedDB (`v5`: stores
 * `nutritionDays` + `nutritionMetadata`) a implementa de forma transacional;
 * testes usam o repositório em memória deste módulo.
 */
export interface NutritionDayRepository {
  getNutritionDay(date: string): Promise<NutritionDay | null>;
  putNutritionDay(day: NutritionDay): Promise<void>;
  /**
   * Put-if-absent ATÔMICO pela chave natural (date): duas chamadas concorrentes
   * para a mesma data resultam em exatamente um dia persistido; a perdedora
   * recebe `{ created: false, day }` com o dia vencedor (mesmo day.id).
   */
  putNutritionDayIfAbsent(day: NutritionDay): Promise<{ created: boolean; day: NutritionDay }>;
  listNutritionDays(options?: { from?: string; to?: string }): Promise<NutritionDay[]>;
  getActiveNutritionDate(): Promise<string | null>;
  setActiveNutritionDate(date: string): Promise<void>;
  getNutritionMigrationMarker(): Promise<LedgerMigrationMarker | null>;
  setNutritionMigrationMarker(marker: LedgerMigrationMarker): Promise<void>;
}

// ============================================================================
// REPOSITÓRIO EM MEMÓRIA (testes e referência da semântica put-if-absent)
// ============================================================================

function cloneDay(day: NutritionDay): NutritionDay {
  return JSON.parse(JSON.stringify(day)) as NutritionDay;
}

function cloneMarker(marker: LedgerMigrationMarker): LedgerMigrationMarker {
  return JSON.parse(JSON.stringify(marker)) as LedgerMigrationMarker;
}

/**
 * Repositório em memória com `putIfAbsent` síncrono-atômico (nenhum await
 * entre checagem e gravação — inseparável no event loop do JS).
 */
export function createInMemoryNutritionDayRepository(initial?: {
  days?: NutritionDay[];
  activeDate?: string | null;
  marker?: LedgerMigrationMarker | null;
}): NutritionDayRepository {
  const days = new Map<string, NutritionDay>();
  for (const day of initial?.days ?? []) days.set(day.date, cloneDay(day));
  let activeDate: string | null = initial?.activeDate ?? null;
  let marker: LedgerMigrationMarker | null = initial?.marker ? cloneMarker(initial.marker) : null;

  return {
    async getNutritionDay(date: string): Promise<NutritionDay | null> {
      const found = days.get(date);
      return found ? cloneDay(found) : null;
    },
    async putNutritionDay(day: NutritionDay): Promise<void> {
      days.set(day.date, cloneDay(day));
    },
    async putNutritionDayIfAbsent(day: NutritionDay): Promise<{ created: boolean; day: NutritionDay }> {
      // Seção crítica sem await: atômica mesmo sob chamadas concorrentes.
      const existing = days.get(day.date);
      if (existing) return { created: false, day: cloneDay(existing) };
      days.set(day.date, cloneDay(day));
      return { created: true, day: cloneDay(day) };
    },
    async listNutritionDays(options?: { from?: string; to?: string }): Promise<NutritionDay[]> {
      return [...days.values()]
        .filter((day) => (!options?.from || day.date >= options.from) && (!options?.to || day.date <= options.to))
        .sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0))
        .map(cloneDay);
    },
    async getActiveNutritionDate(): Promise<string | null> {
      return activeDate;
    },
    async setActiveNutritionDate(date: string): Promise<void> {
      activeDate = date;
    },
    async getNutritionMigrationMarker(): Promise<LedgerMigrationMarker | null> {
      return marker ? cloneMarker(marker) : null;
    },
    async setNutritionMigrationMarker(next: LedgerMigrationMarker): Promise<void> {
      marker = cloneMarker(next);
    },
  };
}

// ============================================================================
// ENSURE TODAY
// ============================================================================

export interface EnsureTodayNutritionDayInput {
  /** Instante explícito (função não lê o relógio). */
  now: Date;
  /** Fuso IANA explícito do usuário (sem default, sem hardcode). */
  timezone: string;
  /**
   * Targets vigentes para o snapshot do novo dia.
   * AUTOMATED exige DailyTargets válido; MANUAL_ONLY exige null + motivo.
   */
  targets: DailyTargets | null;
  targetState?: 'AUTOMATED' | 'MANUAL_ONLY';
  targetUnavailableReason?: NutritionTargetUnavailableReason;
  /**
   * Prova da resolução (GOAL-085): obrigatória — o dia novo nunca é criado
   * sem gateSnapshot coerente (a validação vive em `createNutritionDay`).
   */
  gateSnapshot: NutritionGateSnapshot;
  repository: NutritionDayRepository;
  /** Factory de id do dia; default determinístico `nutrition-day-${date}`. */
  dayIdFactory?: (date: string) => string;
}

export type EnsureTodayStatus = 'existing-active' | 'reused' | 'created';

export interface EnsureTodayNutritionDayResult {
  status: EnsureTodayStatus;
  day: NutritionDay;
  today: string;
}

function defaultDayId(date: string): string {
  return `nutrition-day-${date}`;
}

/**
 * Garante o NutritionDay do dia civil corrente, de forma idempotente e segura
 * sob concorrência (a atomicidade vive no `putNutritionDayIfAbsent`).
 *
 * Ordem de escrita (estritamente sequenciada por `await`, sem captura de erro
 * entre os passos — falha em W2 nunca alcança W3):
 * - W1 `putNutritionDayIfAbsent(today)`;
 * - W2 `putNutritionDay(close(previous))` (somente em avanço real de data);
 * - W3 `setActiveNutritionDate(today)`.
 *
 * Estados de crash (GOAL-079, provados em `rollover.test.ts`):
 * - A (today não persistido: crash antes de W1) → recuperado: próximo ensure
 *   recria today, fecha o anterior e move o ponteiro.
 * - B (today persistido, active antigo: crash entre W1 e W3) → recuperado via
 *   caminho `reused`: fecha o anterior pendente e move o ponteiro.
 * - C (previous fechado, active antigo: crash entre W2 e W3) → recuperado:
 *   fechamento é idempotente (`!previous.isClosed`) e o ponteiro avança.
 * - D (active já em today com previous aberto) → INALCANÇÁVEL por crash real:
 *   W3 só executa após W2 ter sido confirmado (`await`), e erro em W2 propaga
 *   antes de W3. Por isso não há varredura O(n): nenhum repair além do caminho
 *   `reused` é necessário. A regra "dias anteriores terminam fechados" segue
 *   íntegra sem relaxamento.
 */
export async function ensureTodayNutritionDay(
  input: EnsureTodayNutritionDayInput,
): Promise<EnsureTodayNutritionDayResult> {
  const { now, timezone, targets, repository } = input;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new NutritionLedgerError('INVALID_INPUT', 'ensureToday exige um `now` Date válido e explícito.');
  }
  if (typeof timezone !== 'string' || timezone.trim().length === 0) {
    throw new NutritionLedgerError('INVALID_INPUT', 'ensureToday exige um `timezone` IANA explícito.');
  }

  const today = getCivilDateString(now, timezone);
  const [activeDate, existingToday] = await Promise.all([
    repository.getActiveNutritionDate(),
    repository.getNutritionDay(today),
  ]);

  if (existingToday && activeDate === today) {
    return { status: 'existing-active', day: existingToday, today };
  }

  let day: NutritionDay;
  let created = false;
  if (existingToday) {
    day = existingToday;
  } else {
    // NUT-004B: AUTOMATED exige targets válido; MANUAL_ONLY exige motivo
    // explícito. Nenhum alvo artificial é inventado pelo rollover.
    // GOAL-085: gateSnapshot obrigatório — createNutritionDay rejeita dia
    // novo sem gate coerente (INVALID_TARGETS, antes de qualquer escrita).
    const candidate = input.targets === null
      ? createNutritionDay({
        id: (input.dayIdFactory ?? defaultDayId)(today),
        date: today,
        timezone,
        targets: null,
        targetState: 'MANUAL_ONLY',
        targetUnavailableReason: input.targetUnavailableReason,
        gateSnapshot: input.gateSnapshot,
      })
      : createNutritionDay({
        id: (input.dayIdFactory ?? defaultDayId)(today),
        date: today,
        timezone,
        targets: input.targets,
        targetState: 'AUTOMATED',
        gateSnapshot: input.gateSnapshot,
      });
    const placed = await repository.putNutritionDayIfAbsent(candidate);
    day = placed.day;
    created = placed.created;
  }

  // Dia fechado com ponteiro ativo no futuro = relógio retrocedido: não tocar
  // em nada além de devolver o dia (histórico 100% preservado, sem ressuscitar).
  const activeInFuture = activeDate !== null && activeDate > today;
  if (!(day.isClosed && activeInFuture)) {
    // Fecha o anterior somente em avanço real de data (nunca o futuro, nunca
    // apagando: fechamento preserva todos os registros).
    if (activeDate !== null && activeDate < today) {
      const previous = await repository.getNutritionDay(activeDate);
      if (previous && !previous.isClosed) {
        await repository.putNutritionDay(closeNutritionDay(previous, now.toISOString()));
      }
    }
    if (!day.isClosed || activeDate === null || (activeDate !== null && activeDate < today)) {
      await repository.setActiveNutritionDate(today);
    }
  }

  if (created) return { status: 'created', day, today };
  return { status: 'reused', day, today };
}
