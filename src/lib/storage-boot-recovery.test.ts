import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import {
  STORAGE_BOOT_RECOVERY_MESSAGES,
  type StorageBootRecoveryInput,
  type StorageBootRecoveryOutcome,
  classifyStorageBootRecovery,
  runStorageBootRecovery,
  runStorageBootRecoveryOnce,
} from './storage-boot-recovery';
import { createStorageAdminRuntime } from './storage-admin-runtime';
import type { AdministrableWorkoutHistoryStorageAdapter } from './storage-adapter';
import { createHybridStorageRuntime, parsePhysicalEnvelope } from './storage-hybrid';
import { IndexedDbWorkoutHistoryStorage } from './storage-indexeddb';
import {
  MONOLITHIC_STORAGE_VERSION,
  type PersistedState,
  type StorageLike,
} from './storage-types';
import type { WorkoutSession } from '../types';

// ---------------------------------------------------------------------------
// GOAL-17B-002D-D1 — testes do orquestrador de boot.
//
// A convergência FÍSICA da recuperação (matriz de crash points: staged com G,
// activating nos mundos A/B/C, activated) já é provada exaustivamente em
// `storage-logical-import.test.ts`. Aqui o objeto sob teste é OUTRO: a ordem
// recovery → hydrate, a classificação fechada de cada resultado terminal, a
// falha fechada e a execução única sob Strict Mode.
//
// Por isso a suíte tem duas camadas explícitas:
//  - camada FÍSICA, sobre fake-indexeddb, com a recuperação real (sem mock);
//  - camada de CLASSIFICAÇÃO, que injeta o resultado terminal para exercitar
//    cada motivo sem refabricar o mundo que o outro arquivo já cobre.
// ---------------------------------------------------------------------------

const KEY = 'gymflow:boot-recovery';
let databaseSequence = 0;

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  readonly writes: string[] = [];
  readonly reads: string[] = [];
  getItemError: unknown = null;

  getItem(key: string): string | null {
    this.reads.push(key);
    if (this.getItemError !== null) throw this.getItemError;
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes.push(key);
    this.values.set(key, String(value));
  }

  removeItem(key: string): void {
    this.writes.push(`remove:${key}`);
    this.values.delete(key);
  }

  snapshot(): string {
    return JSON.stringify([...this.values.entries()].sort());
  }
}

function defaults(history: WorkoutSession[] = []): PersistedState {
  return {
    user: null,
    weeklyPlan: [],
    customPrograms: [],
    activeWorkout: null,
    activeWorkoutStartedAt: null,
    restTimerEndAt: null,
    restTimerTotalSeconds: null,
    restTimerLabel: null,
    workoutHistory: history,
    weightHistory: [],
    measurementsHistory: [],
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
    achievements: [],
    challenges: [],
    favoriteExercises: [],
    recentlyViewedVideoIds: [],
  } as unknown as PersistedState;
}

function makeSession(index: number): WorkoutSession {
  return {
    id: `sessao-${index}`,
    date: `2026-07-${String((index % 27) + 1).padStart(2, '0')}T10:00:00.000Z`,
    programName: `Treino ${index}`,
    dayName: 'Segunda',
    durationMinutes: 45,
    exercises: [],
  } as unknown as WorkoutSession;
}

interface World {
  storage: MemoryStorage;
  factory: IDBFactory;
  name: string;
  adapter: IndexedDbWorkoutHistoryStorage;
}

function makeAdapter(factory: IDBFactory, name: string): IndexedDbWorkoutHistoryStorage {
  return new IndexedDbWorkoutHistoryStorage({
    factory,
    databaseName: name,
    generationIdFactory: () => `generation-${databaseSequence += 1}`,
    now: () => new Date('2026-07-26T08:00:00.000Z'),
  });
}

// Mundo v2 REAL: hidratação híbrida de verdade, core v2 e geração ativa
// verificada — o mesmo caminho que o Provider percorre no primeiro boot.
async function createV2World(sessions: WorkoutSession[] = []): Promise<World> {
  const storage = new MemoryStorage();
  const factory = new IDBFactory();
  const name = `gymflow-boot-${databaseSequence += 1}`;
  const adapter = makeAdapter(factory, name);
  const hybrid = createHybridStorageRuntime({
    key: KEY,
    storage,
    adapter,
    defaults: defaults(),
    now: () => new Date('2026-07-26T08:00:00.000Z'),
  });
  hybrid.retain();
  const hydration = await hybrid.hydrate();
  if (hydration.mode !== 'hybrid-v2') {
    throw new Error(`setup falhou: hidratação ficou em ${hydration.mode}`);
  }
  if (sessions.length > 0) {
    const generationId = await adapter.replaceHistory(sessions);
    const envelope = JSON.parse(storage.getItem(KEY) as string) as {
      data: { historyStorage: { generationId: string } };
    };
    envelope.data.historyStorage.generationId = generationId;
    storage.values.set(KEY, JSON.stringify(envelope));
  }
  await hybrid.close();
  return { storage, factory, name, adapter };
}

// "Reload": adapter novo sobre o MESMO banco, como um processo reiniciado. O
// gerador de id explode de propósito — a recuperação jamais cria geração.
function reloaded(world: World): World {
  const adapter = new IndexedDbWorkoutHistoryStorage({
    factory: world.factory,
    databaseName: world.name,
    generationIdFactory: () => {
      throw new Error('a recuperação tentou criar uma geração');
    },
    now: () => new Date('2026-07-27T09:00:00.000Z'),
  });
  return { ...world, adapter };
}

function bootInput(world: World): StorageBootRecoveryInput {
  return { adapter: world.adapter, storage: world.storage, key: KEY };
}

// Espelha a ordem do Provider: recuperação primeiro; hidratação só depois de um
// resultado terminal seguro. O spy prova a ordem e a contagem.
async function boot(
  world: World,
  hydrate: () => Promise<void> | void,
  overrides: Partial<StorageBootRecoveryInput> = {},
): Promise<{ outcome: StorageBootRecoveryOutcome; hydrated: boolean }> {
  const outcome = await runStorageBootRecoveryOnce({ ...bootInput(world), ...overrides });
  if (!outcome.hydrationAllowed) return { outcome, hydrated: false };
  await hydrate();
  return { outcome, hydrated: true };
}

// Fotografia física completa: localStorage inteiro + estado administrativo.
async function footprintOf(world: World): Promise<string> {
  await world.adapter.open();
  const snapshot = await world.adapter.readStorageAdministrationSnapshot();
  return JSON.stringify({
    storage: world.storage.snapshot(),
    metadata: snapshot.metadata,
    generations: snapshot.generations,
    receipts: snapshot.operationReceipts,
    pendentes: snapshot.pendingCompletionReceipts,
  });
}

// Cria uma importação administrativa REAL interrompida em `staged` sem geração
// preparada: o journal fica exatamente como depois de uma queda logo após o W1.
async function stageInterruptedImport(world: World): Promise<string> {
  const runtime = createStorageAdminRuntime({
    key: KEY,
    storage: world.storage,
    adapter: world.adapter,
  });
  const receipt = await runtime.beginStorageOperation({
    kind: 'import',
    sourceDigest: 'sha256:origem-de-teste',
    stagedGenerationId: null,
    targetCoreRaw: null,
  });
  return receipt.operationId;
}

function fakeRecover(
  result: unknown,
): NonNullable<StorageBootRecoveryInput['recover']> {
  return async () => result as Awaited<
    ReturnType<NonNullable<StorageBootRecoveryInput['recover']>>
  >;
}

const NEVER_USED_ADAPTER = {} as unknown as AdministrableWorkoutHistoryStorageAdapter;

function classificationInput(
  result: unknown,
  storage: MemoryStorage = new MemoryStorage(),
): StorageBootRecoveryInput {
  return {
    adapter: NEVER_USED_ADAPTER,
    storage,
    key: KEY,
    runtime: {} as StorageBootRecoveryInput['runtime'],
    recover: fakeRecover(result),
  };
}

function administrationUnavailable(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ok: false,
    reason: 'administration-unavailable',
    error: 'Mensagem interna que não pode atravessar o boot.',
    operationId: null,
    generationId: null,
    steps: 0,
    finalAction: 'observe',
    recoveryRequired: true,
    cleanupPending: false,
    ...overrides,
  };
}

// ===========================================================================
// Camada FÍSICA — recuperação real sobre fake-indexeddb
// ===========================================================================

describe('orquestrador de boot — mundo físico real', () => {
  it('1. nenhuma operação pendente: recuperação libera e hydrate roda uma vez', async () => {
    const world = reloaded(await createV2World([makeSession(1)]));
    const hydrate = vi.fn(async () => undefined);

    const { outcome, hydrated } = await boot(world, hydrate);

    expect(outcome).toEqual({
      status: 'ready-no-operation',
      hydrationAllowed: true,
      cleanupPending: false,
    });
    expect(hydrated).toBe(true);
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it('2. importação staged sem geração: a recuperação reverte e então hydrate roda', async () => {
    const world = reloaded(await createV2World([makeSession(1), makeSession(2)]));
    const operationId = await stageInterruptedImport(world);
    const antes = await world.adapter.readStorageOperationReceipt(operationId);
    expect(antes).toMatchObject({ status: 'staged', kind: 'import' });

    const hydrate = vi.fn(async () => undefined);
    const { outcome, hydrated } = await boot(world, hydrate);

    expect(outcome.status).toBe('ready-after-reverted');
    expect(outcome.hydrationAllowed).toBe(true);
    expect(hydrated).toBe(true);
    expect(hydrate).toHaveBeenCalledTimes(1);
    // O journal foi REALMENTE liquidado como revertido — não é classificação.
    const depois = await world.adapter.readStorageOperationReceipt(operationId);
    expect(depois).toMatchObject({ status: 'reverted' });
  });

  it('14. a recuperação executa ANTES da hidratação, nunca depois', async () => {
    const world = reloaded(await createV2World([makeSession(3)]));
    const ordem: string[] = [];
    await stageInterruptedImport(world);

    const outcome = await runStorageBootRecoveryOnce(bootInput(world));
    ordem.push('recovery');
    if (outcome.hydrationAllowed) ordem.push('hydrate');

    expect(ordem).toEqual(['recovery', 'hydrate']);
  });

  it('16. fluxo v1 (core monolítico) continua hidratando', async () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify({
      v: MONOLITHIC_STORAGE_VERSION,
      savedAt: '2026-07-26T08:00:00.000Z',
      data: defaults(),
    }));
    const factory = new IDBFactory();
    const name = `gymflow-boot-v1-${databaseSequence += 1}`;
    const world: World = { storage, factory, name, adapter: makeAdapter(factory, name) };
    const hydrate = vi.fn(async () => undefined);

    const { outcome, hydrated } = await boot(world, hydrate);

    // Sem journal v2 não existe importação interrompida: quem decide v1 ou
    // blocked continua sendo a hidratação híbrida.
    expect(outcome.status).toBe('ready-no-operation');
    expect(hydrated).toBe(true);
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it('16b. instalação nova (nada gravado) continua hidratando', async () => {
    const storage = new MemoryStorage();
    const factory = new IDBFactory();
    const name = `gymflow-boot-novo-${databaseSequence += 1}`;
    const world: World = { storage, factory, name, adapter: makeAdapter(factory, name) };
    const hydrate = vi.fn(async () => undefined);

    const { outcome, hydrated } = await boot(world, hydrate);

    expect(outcome.status).toBe('ready-no-operation');
    expect(hydrated).toBe(true);
    expect(storage.writes).toEqual([]);
  });

  it('17. fluxo v2 saudável continua hidratando', async () => {
    const world = reloaded(await createV2World([makeSession(4), makeSession(5)]));
    const hydrate = vi.fn(async () => undefined);

    const { outcome, hydrated } = await boot(world, hydrate);

    expect(outcome.status).toBe('ready-no-operation');
    expect(hydrated).toBe(true);
  });

  it('18. no-operation não faz nenhuma escrita adicional', async () => {
    const world = reloaded(await createV2World([makeSession(6)]));
    const antes = await footprintOf(world);
    const escritasAntes = [...world.storage.writes];

    const outcome = await runStorageBootRecoveryOnce(bootInput(world));

    expect(outcome.status).toBe('ready-no-operation');
    expect(await footprintOf(world)).toBe(antes);
    expect(world.storage.writes).toEqual(escritasAntes);
  });

  it('15. receipt de conclusão pendente é preservado pela recuperação', async () => {
    const world = reloaded(await createV2World([makeSession(7)]));
    await world.adapter.open();
    const antes = await world.adapter.readStorageAdministrationSnapshot();
    const pendentesAntes = antes.pendingCompletionReceipts;

    const outcome = await runStorageBootRecoveryOnce(bootInput(world));

    await world.adapter.open();
    const depois = await world.adapter.readStorageAdministrationSnapshot();
    expect(outcome.hydrationAllowed).toBe(true);
    // A recuperação da IMPORTAÇÃO não cria, não consome e não liquida receipt
    // de conclusão: essa conciliação continua sendo da hidratação híbrida.
    expect(depois.pendingCompletionReceipts).toEqual(pendentesAntes);
  });

  it('21. desmontagem não cancela a recuperação física já iniciada', async () => {
    const world = reloaded(await createV2World([makeSession(8)]));
    const operationId = await stageInterruptedImport(world);
    let montado = true;
    let publicado = false;

    const pendente = runStorageBootRecoveryOnce(bootInput(world));
    // "Unmount" no meio do voo: só impede a publicação de estado.
    montado = false;
    const outcome = await pendente;
    if (montado && outcome.hydrationAllowed) publicado = true;

    expect(publicado).toBe(false);
    expect(outcome.hydrationAllowed).toBe(true);
    // A operação física terminou mesmo assim.
    const receipt = await world.adapter.readStorageOperationReceipt(operationId);
    expect(receipt).toMatchObject({ status: 'reverted' });
  });
});

// ===========================================================================
// Execução única / Strict Mode
// ===========================================================================

describe('orquestrador de boot — execução única', () => {
  it('19. duas chamadas simultâneas compartilham a mesma Promise', async () => {
    const world = reloaded(await createV2World([makeSession(9)]));
    const leiturasFisicas = vi.spyOn(world.adapter, 'readStorageAdministrationSnapshot');

    const primeira = runStorageBootRecoveryOnce(bootInput(world));
    const segunda = runStorageBootRecoveryOnce(bootInput(world));

    expect(segunda).toBe(primeira);
    const [a, b] = await Promise.all([primeira, segunda]);
    expect(leiturasFisicas.mock.calls.length).toBeGreaterThan(0);
    expect(a).toBe(b);
  });

  it('19a. Strict Mode compartilha uma única aquisição para a mesma operação', async () => {
    const world = reloaded(await createV2World([makeSession(9)]));
    const operationId = await stageInterruptedImport(world);
    const input = bootInput(world);

    const primeira = runStorageBootRecoveryOnce(input);
    const segunda = runStorageBootRecoveryOnce(input);

    expect(segunda).toBe(primeira);
    const [a, b] = await Promise.all([primeira, segunda]);
    expect(a).toBe(b);
    expect(a.status).toBe('ready-after-reverted');
    expect(await world.adapter.readStorageOperationReceipt(operationId))
      .toMatchObject({ status: 'reverted' });
    const tokenKey = `${KEY}:admin-owner-token:v1`;
    // Uma escrita adquire; uma segunda escreve o tombstone expirado no release.
    // Duas montagens independentes fariam quatro.
    expect(world.storage.writes.filter((key) => key === tokenKey)).toHaveLength(2);
    expect(world.storage.writes).not.toContain(`remove:${tokenKey}`);
  });

  it('20. depois de assentar, uma nova chamada executa de novo e é idempotente', async () => {
    const world = reloaded(await createV2World([makeSession(10)]));
    const leiturasFisicas = vi.spyOn(world.adapter, 'readStorageAdministrationSnapshot');

    const primeira = await runStorageBootRecoveryOnce(bootInput(world));
    const leiturasDoPrimeiroCiclo = leiturasFisicas.mock.calls.length;
    const segunda = await runStorageBootRecoveryOnce(bootInput(world));

    // A trava é por ciclo, não uma flag global eterna: o segundo boot roda.
    expect(leiturasDoPrimeiroCiclo).toBeGreaterThan(0);
    expect(leiturasFisicas.mock.calls.length).toBeGreaterThan(leiturasDoPrimeiroCiclo);
    expect(segunda).toEqual(primeira);
    expect(segunda.status).toBe('ready-no-operation');
  });

  it('19b. a promessa compartilhada nunca rejeita, mesmo com exceção interna', async () => {
    const storage = new MemoryStorage();
    const input: StorageBootRecoveryInput = {
      adapter: NEVER_USED_ADAPTER,
      storage,
      key: KEY,
      runtime: {} as StorageBootRecoveryInput['runtime'],
      recover: async () => {
        throw new Error('detalhe interno que não pode vazar');
      },
    };

    const primeira = runStorageBootRecoveryOnce(input);
    const segunda = runStorageBootRecoveryOnce(input);
    expect(segunda).toBe(primeira);

    const outcome = await primeira;
    expect(outcome.hydrationAllowed).toBe(false);
    expect(outcome.status).toBe('blocked-recovery-required');
  });
});

// ===========================================================================
// Camada de CLASSIFICAÇÃO — cada resultado terminal
// ===========================================================================

describe('orquestrador de boot — resultados que liberam a hidratação', () => {
  const liberados: Array<[string, string]> = [
    ['no-operation', 'ready-no-operation'],
    ['settled', 'ready-after-settled'],
    ['already-settled', 'ready-after-settled'],
    ['reverted', 'ready-after-reverted'],
    ['already-reverted', 'ready-after-reverted'],
  ];

  for (const [status, esperado] of liberados) {
    it(`3-7. status terminal "${status}" libera a hidratação como ${esperado}`, async () => {
      const hydrate = vi.fn();
      const outcome = await runStorageBootRecovery(classificationInput({
        ok: true,
        status,
        operationId: 'operacao-1',
        generationId: 'geracao-1',
        steps: 2,
        finalAction: status,
        recoveryRequired: false,
        cleanupPending: false,
      }));
      if (outcome.hydrationAllowed) hydrate();

      expect(outcome.status).toBe(esperado);
      expect(outcome.hydrationAllowed).toBe(true);
      expect(hydrate).toHaveBeenCalledTimes(1);
    });
  }

  it('3b. geração órfã pendente de limpeza não impede a hidratação', async () => {
    const outcome = await runStorageBootRecovery(classificationInput({
      ok: true,
      status: 'reverted',
      operationId: 'operacao-1',
      generationId: 'geracao-orfa',
      steps: 3,
      finalAction: 'revert-receipt',
      recoveryRequired: false,
      cleanupPending: true,
    }));

    expect(outcome).toEqual({
      status: 'ready-after-reverted',
      hydrationAllowed: true,
      cleanupPending: true,
    });
  });
});

describe('orquestrador de boot — resultados que bloqueiam a hidratação', () => {
  const bloqueados: Array<[string, string]> = [
    ['recovery-required', 'blocked-recovery-required'],
    ['impossible-state', 'blocked-recovery-required'],
    ['operation-conflict', 'blocked-operation-conflict'],
    ['owner-token-conflict', 'blocked-operation-conflict'],
    ['administration-conflicted', 'blocked-administration-conflicted'],
    ['storage-unavailable', 'blocked-storage-unavailable'],
    ['migration-incomplete', 'blocked-recovery-required'],
    ['recovery-step-limit', 'blocked-step-limit'],
    ['quota', 'blocked-recovery-required'],
    ['verification-failed', 'blocked-recovery-required'],
    ['activation-failed', 'blocked-recovery-required'],
    ['core-commit-failed', 'blocked-recovery-required'],
    ['readback-failed', 'blocked-recovery-required'],
  ];

  for (const [reason, esperado] of bloqueados) {
    it(`8-11. motivo "${reason}" bloqueia e hydrate nunca é chamado`, async () => {
      const hydrate = vi.fn();
      const outcome = await runStorageBootRecovery(classificationInput({
        ok: false,
        reason,
        error: `mensagem interna crua sobre ${reason} no IndexedDB`,
        operationId: 'operacao-1',
        generationId: 'geracao-1',
        steps: 4,
        finalAction: 'observe',
        recoveryRequired: true,
        cleanupPending: false,
      }));
      if (outcome.hydrationAllowed) hydrate();

      expect(outcome.status).toBe(esperado);
      expect(outcome.hydrationAllowed).toBe(false);
      expect(hydrate).not.toHaveBeenCalled();
    });
  }

  it('12. exceção inesperada bloqueia e hydrate nunca é chamado', async () => {
    const hydrate = vi.fn();
    const outcome = await runStorageBootRecovery({
      adapter: NEVER_USED_ADAPTER,
      storage: new MemoryStorage(),
      key: KEY,
      runtime: {} as StorageBootRecoveryInput['runtime'],
      recover: async () => {
        throw new Error('QuotaExceededError: detalhe cru do IndexedDB');
      },
    });
    if (outcome.hydrationAllowed) hydrate();

    expect(outcome.status).toBe('blocked-recovery-required');
    expect(outcome.hydrationAllowed).toBe(false);
    expect(hydrate).not.toHaveBeenCalled();
  });

  const desconhecidos: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['string', 'ok'],
    ['objeto vazio', {}],
    ['ok não booleano', { ok: 'sim', status: 'no-operation' }],
    ['status desconhecido', { ok: true, status: 'status-do-futuro', steps: 1, cleanupPending: false }],
    ['motivo desconhecido', { ok: false, reason: 'motivo-do-futuro', steps: 1, cleanupPending: false }],
    ['sucesso sem status', { ok: true, steps: 1, cleanupPending: false }],
  ];

  for (const [nome, valor] of desconhecidos) {
    it(`13. retorno desconhecido (${nome}) falha fechado`, async () => {
      const outcome = await runStorageBootRecovery(classificationInput(valor));

      expect(outcome.hydrationAllowed).toBe(false);
      expect(outcome.status).toBe('blocked-recovery-required');
    });
  }

  it('13b. classificação direta também falha fechada sem passar pelo runner', () => {
    expect(classifyStorageBootRecovery({ ok: false, reason: 'nada-disso' })).toMatchObject({
      hydrationAllowed: false,
      status: 'blocked-recovery-required',
    });
  });

  it('10b. administration-unavailable DEPOIS de começar a recuperar bloqueia', async () => {
    // steps > 0 significa que a triagem física já tinha passado: perder a
    // administração no meio do caminho é anomalia, não "não há v2 aqui".
    const outcome = await runStorageBootRecovery(classificationInput(
      administrationUnavailable({ steps: 2 }),
    ));

    expect(outcome.hydrationAllowed).toBe(false);
    expect(outcome.status).toBe('blocked-recovery-required');
  });

  it('10c. operationId não nulo bloqueia mesmo com steps zero', async () => {
    const outcome = await runStorageBootRecovery(classificationInput(
      administrationUnavailable({ operationId: 'operacao-parcial' }),
    ));

    expect(outcome).toMatchObject({
      hydrationAllowed: false,
      status: 'blocked-recovery-required',
    });
  });

  it('10d. evidência administrativa parcial bloqueia', async () => {
    for (const partial of [
      { generationId: 'geracao-parcial' },
      { cleanupPending: true },
    ]) {
      const outcome = await runStorageBootRecovery(classificationInput(
        administrationUnavailable(partial),
      ));
      expect(outcome).toMatchObject({
        hydrationAllowed: false,
        status: 'blocked-recovery-required',
      });
    }
  });

  it('10e. instalação nova é provada pela ausência da chave e libera', async () => {
    const storage = new MemoryStorage();
    const outcome = await runStorageBootRecovery(classificationInput(
      administrationUnavailable(),
      storage,
    ));

    expect(outcome.hydrationAllowed).toBe(true);
    expect(outcome.status).toBe('ready-no-operation');
    expect(storage.snapshot()).toBe('[]');
    expect(storage.writes).toEqual([]);
  });

  it('10f. envelope monolítico v1 válido libera', async () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify({
      v: MONOLITHIC_STORAGE_VERSION,
      savedAt: '2026-07-26T08:00:00.000Z',
      data: defaults(),
    }));
    const before = storage.snapshot();

    const outcome = await runStorageBootRecovery(classificationInput(
      administrationUnavailable(),
      storage,
    ));

    expect(outcome).toMatchObject({
      hydrationAllowed: true,
      status: 'ready-no-operation',
    });
    expect(storage.snapshot()).toBe(before);
  });

  it('10g. chaves legadas suportadas com chave principal ausente liberam a migração', async () => {
    const storage = new MemoryStorage();
    storage.setItem('gymflow_user', JSON.stringify({ id: 'usuario-legado' }));
    storage.setItem('gymflow_weeklyPlan', JSON.stringify([]));
    const before = storage.snapshot();

    const outcome = await runStorageBootRecovery(classificationInput(
      administrationUnavailable(),
      storage,
    ));

    expect(outcome).toMatchObject({
      hydrationAllowed: true,
      status: 'ready-no-operation',
    });
    expect(storage.snapshot()).toBe(before);
  });

  it('10h. core v2 válido com geração indicada e administração indisponível bloqueia', async () => {
    const world = await createV2World([makeSession(41)]);
    const raw = world.storage.getItem(KEY) as string;
    const physical = parsePhysicalEnvelope(raw);
    expect(physical.status).toBe('v2');
    if (physical.status !== 'v2') return;
    expect(physical.envelope.data.historyStorage.generationId.length).toBeGreaterThan(0);
    const before = await footprintOf(world);
    const writesBefore = [...world.storage.writes];

    const outcome = await runStorageBootRecovery(classificationInput(
      administrationUnavailable(),
      world.storage,
    ));

    expect(outcome).toMatchObject({
      hydrationAllowed: false,
      status: 'blocked-storage-unavailable',
    });
    expect(await footprintOf(world)).toBe(before);
    expect(world.storage.writes).toEqual(writesBefore);
  });

  it('10i. raw sem v2 comprovável autoriza somente a classificação bloqueada', async () => {
    for (const raw of [
      '{raw-corrompido',
      JSON.stringify({ v: 1, data: {} }),
      JSON.stringify({ v: 99, savedAt: '2026-07-26T08:00:00.000Z', data: {} }),
    ]) {
      const storage = new MemoryStorage();
      storage.setItem(KEY, raw);
      const before = storage.snapshot();

      const outcome = await runStorageBootRecovery(classificationInput(
        administrationUnavailable(),
        storage,
      ));

      expect(outcome).toEqual({
        hydrationAllowed: false,
        blockedStorageClassificationAllowed: true,
        cleanupPending: false,
        status: 'ready-for-blocked-storage-classification',
      });
      expect(storage.snapshot()).toBe(before);
      expect(JSON.stringify(outcome)).not.toContain(raw);
    }
  });

  it('10i-b. envelope v2 inválido continua bloqueado antes do runtime', async () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({
      v: 2,
      savedAt: '2026-07-26T08:00:00.000Z',
      data: {},
    });
    storage.setItem(KEY, raw);
    expect(parsePhysicalEnvelope(raw)).toMatchObject({
      status: 'corrupt',
      physicalVersion: 2,
    });
    const before = storage.snapshot();

    const outcome = await runStorageBootRecovery(classificationInput(
      administrationUnavailable(),
      storage,
    ));

    expect(outcome).toMatchObject({
      hydrationAllowed: false,
      status: 'blocked-storage-unavailable',
      physicalVersion: 2,
    });
    expect(storage.snapshot()).toBe(before);
  });

  it('10i-c. duas chamadas simultâneas compartilham a classificação do raw corrompido', async () => {
    const storage = new MemoryStorage();
    storage.values.set(KEY, '{raw-corrompido');
    const input = classificationInput(administrationUnavailable(), storage);

    const first = runStorageBootRecoveryOnce(input);
    const second = runStorageBootRecoveryOnce(input);

    expect(second).toBe(first);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(a.status).toBe('ready-for-blocked-storage-classification');
    expect(storage.reads.filter((key) => key === KEY)).toHaveLength(1);
  });

  it('10j. getItem que lança bloqueia sem expor mensagem nativa', async () => {
    const storage = new MemoryStorage();
    storage.values.set(KEY, 'PRIVATE_RAW');
    storage.getItemError = new Error('PRIVATE_LOCALSTORAGE_MESSAGE');

    const outcome = await runStorageBootRecovery(classificationInput(
      administrationUnavailable(),
      storage,
    ));

    expect(outcome).toMatchObject({
      hydrationAllowed: false,
      status: 'blocked-storage-unavailable',
    });
    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toContain('PRIVATE_RAW');
    expect(serialized).not.toContain('PRIVATE_LOCALSTORAGE_MESSAGE');
    expect(serialized).not.toContain('stack');
  });

  it('10k. classificação sem prova física continua fail-closed', () => {
    expect(classifyStorageBootRecovery(administrationUnavailable())).toMatchObject({
      hydrationAllowed: false,
      status: 'blocked-recovery-required',
    });
  });
});

// ===========================================================================
// Privacidade do resultado
// ===========================================================================

describe('orquestrador de boot — nenhuma mensagem privada atravessa', () => {
  it('22. o resultado bloqueado só carrega a constante deste módulo', async () => {
    const cru = 'previousCoreRaw={"user":{"name":"Rafael","email":"rafael@exemplo.com"}} '
      + 'sessionId=sessao-42 QuotaExceededError na store workout-history';
    const outcome = await runStorageBootRecovery(classificationInput({
      ok: false,
      reason: 'core-commit-failed',
      error: cru,
      operationId: 'operacao-1',
      generationId: 'geracao-1',
      steps: 5,
      finalAction: 'commit-core',
      recoveryRequired: true,
      cleanupPending: false,
    }));

    expect(outcome.hydrationAllowed).toBe(false);
    const serializado = JSON.stringify(outcome);
    for (const proibido of [
      'previousCoreRaw', 'targetCoreRaw', 'receipt', 'Rafael',
      'rafael@exemplo.com', 'sessao-42', 'QuotaExceededError',
      'workout-history', 'operacao-1', 'geracao-1',
    ]) {
      expect(serializado).not.toContain(proibido);
    }
    expect(outcome.hydrationAllowed).toBe(false);
    if ('message' in outcome) {
      expect(outcome.message).toBe(
        STORAGE_BOOT_RECOVERY_MESSAGES['blocked-recovery-required'],
      );
    }
  });

  it('22b. o resultado liberado não expõe identificadores internos', async () => {
    const outcome = await runStorageBootRecovery(classificationInput({
      ok: true,
      status: 'settled',
      operationId: 'operacao-secreta',
      generationId: 'geracao-secreta',
      steps: 3,
      finalAction: 'settle-receipt',
      recoveryRequired: false,
      cleanupPending: false,
    }));

    expect(Object.keys(outcome).sort()).toEqual([
      'cleanupPending', 'hydrationAllowed', 'status',
    ]);
    const serializado = JSON.stringify(outcome);
    expect(serializado).not.toContain('operacao-secreta');
    expect(serializado).not.toContain('geracao-secreta');
  });

  it('22c. toda mensagem de bloqueio é constante e não vazia', () => {
    const valores = Object.values(STORAGE_BOOT_RECOVERY_MESSAGES);
    expect(valores).toHaveLength(5);
    for (const mensagem of valores) {
      expect(mensagem.length).toBeGreaterThan(0);
      expect(mensagem).not.toMatch(/IndexedDB|localStorage|Error|undefined|null/);
    }
  });
});

// ===========================================================================
// GUARDS — o que NÃO pode existir (busca estática sobre o código real)
// ===========================================================================

const SOURCE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function listFiles(root: string, extensions: string[]): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (extensions.some((extension) => entry.name.endsWith(extension))) found.push(full);
    }
  };
  walk(root);
  return found;
}

// Comentários explicam decisões e citam nomes de propósito. Um guard que lê
// prosa acusa o comentário e não o código, então a busca roda sobre a fonte sem
// comentários.
function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sourceFilesWith(term: string, options: { includeTests?: boolean } = {}): string[] {
  return listFiles(SOURCE_ROOT, ['.ts', '.tsx'])
    .filter((file) => options.includeTests || !/\.test\.tsx?$/.test(file))
    .filter((file) => codeOf(file).includes(term))
    .map((file) => relative(SOURCE_ROOT, file).replace(/\\/g, '/'));
}

// Invocação de verdade — `nome(` —, não menção em texto ou em tipo.
function sourceFilesCalling(name: string): string[] {
  return listFiles(SOURCE_ROOT, ['.ts', '.tsx'])
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .filter((file) => new RegExp(`\\b${name}\\s*\\(`).test(codeOf(file)))
    .map((file) => relative(SOURCE_ROOT, file).replace(/\\/g, '/'));
}

describe('guards — a recuperação tem exatamente um call site', () => {
  it('o call site aprovado é o orquestrador, e ele é chamado só pelo Provider', () => {
    const chamadores = sourceFilesWith('runStorageBootRecoveryOnce');
    expect(chamadores.sort()).toEqual([
      'lib/storage-boot-recovery.ts',
      'providers/GymFlowContext.tsx',
    ]);
  });

  // GOAL-17B-E4B: commitLogicalStorageImportV2 agora tem exatamente um
  // call site autorizado no GymFlowContext (via importLogicalBackupV2).
  it('commitLogicalStorageImportV2 tem exatamente um call site autorizado', () => {
    const declaracao = codeOf(join(SOURCE_ROOT, 'lib/storage-logical-import.ts'));
    expect(declaracao).toContain('export async function commitLogicalStorageImportV2');
    const importadores = listFiles(SOURCE_ROOT, ['.ts', '.tsx'])
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => /import[\s\S]*?commitLogicalStorageImportV2[\s\S]*?from/.test(codeOf(file)))
      .map((file) => relative(SOURCE_ROOT, file).replace(/\\/g, '/'));
    expect(importadores).toEqual(['providers/GymFlowContext.tsx']);
  });

  it('nenhum componente visual chama a recuperação', () => {
    const visuais = sourceFilesWith('runStorageBootRecovery')
      .filter((file) => file.startsWith('components/') || file.startsWith('modules/') || file.startsWith('app/'));
    expect(visuais).toEqual([]);
  });

  it('nenhum botão dispara a recuperação', () => {
    const visuais = listFiles(SOURCE_ROOT, ['.tsx'])
      .filter((file) => !/\.test\.tsx$/.test(file))
      .filter((file) => {
        const codigo = codeOf(file);
        return /onClick[\s\S]{0,200}runStorageBootRecovery/.test(codigo);
      });
    expect(visuais).toEqual([]);
  });

  it('o orquestrador não conhece React, UI nem Provider', () => {
    const codigo = codeOf(join(SOURCE_ROOT, 'lib/storage-boot-recovery.ts'));

    for (const proibido of [
      'react', 'React', 'useEffect', 'useState', 'jsx',
      'GymFlowContext', 'toast', 'Toast',
      'commitLogicalStorageImportV2', 'stageHistoryGenerationForOperation',
      'setTimeout', 'setInterval',
    ]) {
      expect(codigo).not.toContain(proibido);
    }
  });

  it('nenhum arquivo Android chama a recuperação', () => {
    const androidRoot = join(REPO_ROOT, 'android');
    if (!existsSync(androidRoot)) return;
    const arquivos = listFiles(androidRoot, ['.java', '.kt', '.xml', '.gradle', '.ts', '.js']);

    const suspeitos = arquivos.filter((file) => {
      const conteudo = readFileSync(file, 'utf8');
      return conteudo.includes('runStorageBootRecovery');
    });
    expect(suspeitos).toEqual([]);
  });
});

describe('guards — importação e restauração continuam indisponíveis ao usuário', () => {
  // GOAL-17B-E4B: o Provider agora importa commitLogicalStorageImportV2
  // (via importLogicalBackupV2). O orquestrador de boot continua sendo o
  // único .tsx que importa storage-boot-recovery.
  it('somente o Provider importa logical-import (call site autorizado)', () => {
    const visuais = listFiles(SOURCE_ROOT, ['.tsx'])
      .filter((file) => !/\.test\.tsx$/.test(file))
      .filter((file) => {
        const conteudo = readFileSync(file, 'utf8');
        return conteudo.includes('logical-import')
          || conteudo.includes('storage-boot-recovery');
      })
      .map((file) => relative(SOURCE_ROOT, file).replace(/\\/g, '/'));

    expect(visuais).toEqual(['providers/GymFlowContext.tsx']);
    const provider = readFileSync(join(SOURCE_ROOT, 'providers/GymFlowContext.tsx'), 'utf8');
    // O Provider importa commitLogicalStorageImportV2 (E4B), mas não
    // importa recoverLogicalStorageImportV2 (recovery é exclusiva do boot).
    expect(provider).toContain('commitLogicalStorageImportV2');
    expect(provider).not.toContain('recoverLogicalStorageImportV2');
    expect(provider).toContain('commitLogicalStorageRestoreV2');
    expect(provider).not.toContain('recoverLogicalStorageRestoreV2');
    expect(provider).toContain('commitLogicalStorageResetV2');
    expect(provider).not.toContain('recoverLogicalStorageResetV2');
  });

  it('nenhum seletor de arquivo para importação lógica foi adicionado', () => {
    const orquestrador = readFileSync(join(SOURCE_ROOT, 'lib/storage-boot-recovery.ts'), 'utf8');
    for (const proibido of ['input type="file"', 'FileReader', 'showOpenFilePicker', 'download']) {
      expect(orquestrador).not.toContain(proibido);
    }
  });

  it('o D1 não introduziu restore, rollback nem reset manual', () => {
    const orquestrador = readFileSync(join(SOURCE_ROOT, 'lib/storage-boot-recovery.ts'), 'utf8');
    for (const proibido of [
      'restoreStorage', 'rollbackStorage', 'resetStorage', 'startFresh',
      'clearInactiveGeneration', 'replaceHistory',
    ]) {
      expect(orquestrador).not.toContain(proibido);
    }
  });
});
