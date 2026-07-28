import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { STORAGE_BOOT_RECOVERY_MESSAGES } from '../lib/storage-boot-recovery';
import {
  HYBRID_CORE_BACKUP_SUFFIX,
  createHybridStorageRuntime,
  parsePhysicalEnvelope,
} from '../lib/storage-hybrid';
import { IndexedDbWorkoutHistoryStorage } from '../lib/storage-indexeddb';
import { createStorageAdminRuntime } from '../lib/storage-admin-runtime';
import type { StorageOperationReceipt } from '../lib/storage-operation-receipt';
import { MONOLITHIC_STORAGE_VERSION, type PersistedState } from '../lib/storage-types';
import { GymFlowProvider, STORAGE_KEY, useGymFlow } from './GymFlowContext';

// ---------------------------------------------------------------------------
// GOAL-17B-002D-D1 — o Provider sob a barreira de recuperação.
//
// Todos os mundos aqui são FÍSICOS: fake-indexeddb real, journal administrativo
// real e recuperação de importação real. Nenhum teste substitui o orquestrador
// por um mock que devolve a resposta esperada.
// ---------------------------------------------------------------------------

type GymFlowValue = ReturnType<typeof useGymFlow>;

class MemoryLocalStorage {
  readonly values = new Map<string, string>();
  readonly mainKeyWrites: string[] = [];
  readonly mutations: string[] = [];
  mainKeyReadError: unknown = null;

  getItem(key: string): string | null {
    if (key === STORAGE_KEY && this.mainKeyReadError !== null) {
      throw this.mainKeyReadError;
    }
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (key === STORAGE_KEY) this.mainKeyWrites.push(value);
    this.mutations.push(`set:${key}`);
    this.values.set(key, String(value));
  }

  removeItem(key: string): void {
    this.mutations.push(`remove:${key}`);
    this.values.delete(key);
  }

  snapshot(): string {
    return JSON.stringify([...this.values.entries()].sort());
  }
}

let storage: MemoryLocalStorage;
const originalWindow = Reflect.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Reflect.getOwnPropertyDescriptor(globalThis, 'document');
const originalIndexedDb = Reflect.getOwnPropertyDescriptor(globalThis, 'indexedDB');

function installBrowserGlobals(): void {
  storage = new MemoryLocalStorage();
  const windowStub = Object.assign(new EventTarget(), {
    localStorage: storage,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    location: { reload: () => undefined },
  });
  const documentStub = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  Object.defineProperty(globalThis, 'window', { value: windowStub, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'document', { value: documentStub, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
    writable: true,
  });
}

function restoreBrowserGlobals(): void {
  for (const [name, descriptor] of [
    ['window', originalWindow],
    ['document', originalDocument],
    ['indexedDB', originalIndexedDb],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
}

function defaults(): PersistedState {
  return {
    user: null,
    weeklyPlan: [],
    customPrograms: [],
    activeWorkout: null,
    activeWorkoutStartedAt: null,
    restTimerEndAt: null,
    restTimerTotalSeconds: null,
    restTimerLabel: null,
    workoutHistory: [],
    weightHistory: [],
    measurementsHistory: [],
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
    achievements: [],
    challenges: [],
    favoriteExercises: [],
    recentlyViewedVideoIds: [],
  } as unknown as PersistedState;
}

// Constrói um mundo v2 real no MESMO banco/localStorage que o Provider usará.
async function seedHealthyV2World(): Promise<void> {
  const adapter = new IndexedDbWorkoutHistoryStorage();
  const hybrid = createHybridStorageRuntime({
    key: STORAGE_KEY,
    storage,
    adapter,
    defaults: defaults(),
  });
  hybrid.retain();
  const hydration = await hybrid.hydrate();
  if (hydration.mode !== 'hybrid-v2') {
    throw new Error(`setup falhou: hidratação ficou em ${hydration.mode}`);
  }
  await hybrid.close();
}

// Importação administrativa REAL interrompida em `staged`, como depois de uma
// queda logo após abrir a operação.
async function seedInterruptedImport(): Promise<string> {
  const adapter = new IndexedDbWorkoutHistoryStorage();
  const runtime = createStorageAdminRuntime({ key: STORAGE_KEY, storage, adapter });
  const receipt = await runtime.beginStorageOperation({
    kind: 'import',
    sourceDigest: 'sha256:origem-de-teste',
    stagedGenerationId: null,
    targetCoreRaw: null,
  });
  await adapter.close();
  return receipt.operationId;
}

// Journal ambíguo REAL: duas operações em aberto. A recuperação não pode
// escolher sozinha qual delas seguir e bloqueia.
async function seedConflictingOperations(): Promise<void> {
  const primeiro = await seedInterruptedImport();
  const adapter = new IndexedDbWorkoutHistoryStorage();
  await adapter.open();
  const original = await adapter.readStorageOperationReceipt(primeiro);
  if (!original) throw new Error('setup falhou: receipt original não encontrado');
  const gemeo: StorageOperationReceipt = {
    ...original,
    operationId: `${original.operationId}-gemeo`,
  };
  await adapter.putStorageOperationReceipt(gemeo);
  await adapter.close();
}

async function readOperationReceipts(): Promise<StorageOperationReceipt[]> {
  const adapter = new IndexedDbWorkoutHistoryStorage();
  await adapter.open();
  const snapshot = await adapter.readStorageAdministrationSnapshot();
  await adapter.close();
  return [...snapshot.operationReceipts];
}

async function readGenerationCount(): Promise<number> {
  const adapter = new IndexedDbWorkoutHistoryStorage();
  await adapter.open();
  const snapshot = await adapter.readStorageAdministrationSnapshot();
  await adapter.close();
  return snapshot.generations.length;
}

async function readAdministrationSnapshot() {
  const adapter = new IndexedDbWorkoutHistoryStorage();
  await adapter.open();
  const snapshot = await adapter.readStorageAdministrationSnapshot();
  await adapter.close();
  return snapshot;
}

function spyOnHybridHydrate() {
  const probe = createHybridStorageRuntime({
    key: STORAGE_KEY,
    storage,
    adapter: new IndexedDbWorkoutHistoryStorage(),
    defaults: defaults(),
  });
  const prototype = Object.getPrototypeOf(probe) as {
    hydrate: typeof probe.hydrate;
  };
  return vi.spyOn(prototype, 'hydrate');
}

interface Mounted {
  context: () => GymFlowValue;
  statusHistory: string[];
  unmount: () => Promise<void>;
}

const mounted: Mounted[] = [];

async function mountProvider(options: { strict?: boolean } = {}): Promise<Mounted> {
  const state = { value: null as GymFlowValue | null };
  const statusHistory: string[] = [];

  const Probe = () => {
    const value = useGymFlow();
    state.value = value;
    const status = value.storageHealth.status;
    if (statusHistory[statusHistory.length - 1] !== status) statusHistory.push(status);
    return null;
  };

  const tree: React.ReactElement = (
    <ToastProvider>
      <GymFlowProvider>
        <Probe />
      </GymFlowProvider>
    </ToastProvider>
  );

  let renderer: TestRenderer.ReactTestRenderer | null = null;
  await act(async () => {
    renderer = TestRenderer.create(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  });

  const handle: Mounted = {
    context: () => {
      if (!state.value) throw new Error('O Provider não expôs o contexto.');
      return state.value;
    },
    statusHistory,
    unmount: async () => {
      await act(async () => {
        (renderer as unknown as TestRenderer.ReactTestRenderer).unmount();
      });
      await settle(30);
    },
  };
  mounted.push(handle);
  return handle;
}

async function settle(ticks = 10): Promise<void> {
  for (let index = 0; index < ticks; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
  }
}

async function mountSettled(options: { strict?: boolean } = {}): Promise<Mounted> {
  const handle = await mountProvider(options);
  await settle(40);
  return handle;
}

beforeEach(() => {
  installBrowserGlobals();
});

afterEach(async () => {
  for (const handle of mounted.splice(0)) {
    await handle.unmount().catch(() => undefined);
  }
  vi.restoreAllMocks();
  restoreBrowserGlobals();
});

describe('Provider — recuperação administrativa antes da hidratação', () => {
  it('a ordem concreta é recovery → hydrate → completion receipt → publicação', () => {
    const source = readFileSync(new URL('./GymFlowContext.tsx', import.meta.url), 'utf8');
    const bootSource = source.slice(source.indexOf('const hydrateStorage = async () =>'));
    const checkpoints = [
      'runStorageBootRecoveryOnce({',
      'runtime.hydrate()',
      'materializeRecoveredCompletions(',
      'runtime.settleCompletion(',
      "setStorageHealth({ status: 'ready'",
    ].map((needle) => bootSource.indexOf(needle));

    expect(checkpoints.every((index) => index >= 0)).toBe(true);
    expect(checkpoints).toEqual([...checkpoints].sort((left, right) => left - right));
  });

  it('o boot começa em loading antes de qualquer resultado terminal', async () => {
    await seedHealthyV2World();
    const handle = await mountSettled();

    // A primeira observação é sempre `loading`: a hidratação nunca publica
    // estado antes da recuperação responder.
    expect(handle.statusHistory[0]).toBe('loading');
  });

  it('mundo v2 saudável: recuperação libera e o estado é publicado uma vez', async () => {
    await seedHealthyV2World();
    const handle = await mountSettled();

    expect(handle.context().storageHealth.status).toBe('ready');
    expect(handle.statusHistory).toEqual(['loading', 'ready']);
  });

  it('importação interrompida real: recupera, reverte e só então hidrata', async () => {
    await seedHealthyV2World();
    const operationId = await seedInterruptedImport();
    expect((await readOperationReceipts())[0]).toMatchObject({ status: 'staged' });

    const handle = await mountSettled();

    expect(handle.context().storageHealth.status).toBe('ready');
    const receipts = await readOperationReceipts();
    const alvo = receipts.find((receipt) => receipt.operationId === operationId);
    // A recuperação REAL liquidou o journal antes de o app hidratar.
    expect(alvo).toMatchObject({ status: 'reverted' });
  });

  it('journal ambíguo: hidratação bloqueada, sem estado publicado e sem escrita', async () => {
    await seedHealthyV2World();
    await seedConflictingOperations();
    const escritasAntes = storage.mainKeyWrites.length;
    const geracoesAntes = await readGenerationCount();

    const handle = await mountSettled();
    const context = handle.context();

    expect(context.storageHealth.status).toBe('blocked');
    expect(handle.statusHistory).toEqual(['loading', 'blocked']);
    // Nada foi publicado: nenhum usuário default entra como se a recuperação
    // tivesse dado certo.
    expect(context.user).toBeNull();
    expect(context.workoutHistory).toEqual([]);
    // Nada foi escrito e nada foi apagado: os dados físicos ficam para o
    // diagnóstico ou para uma recuperação futura.
    expect(storage.mainKeyWrites).toHaveLength(escritasAntes);
    expect(await readGenerationCount()).toBe(geracoesAntes);
    expect(parsePhysicalEnvelope(storage.getItem(STORAGE_KEY) as string).status).toBe('v2');
  });

  it('o bloqueio expõe apenas a mensagem constante do orquestrador', async () => {
    await seedHealthyV2World();
    await seedConflictingOperations();

    const handle = await mountSettled();
    const health = handle.context().storageHealth;

    expect(health.status).toBe('blocked');
    expect(health.issue?.message).toBe(
      STORAGE_BOOT_RECOVERY_MESSAGES['blocked-operation-conflict'],
    );
    const serializado = JSON.stringify(health);
    for (const proibido of [
      'previousCoreRaw', 'targetCoreRaw', 'receipt', 'sessionId',
      'IndexedDB', 'operationId', 'stack',
    ]) {
      expect(serializado).not.toContain(proibido);
    }
  });

  it('bloqueio mantém o autosave desarmado mesmo com alteração de estado', async () => {
    await seedHealthyV2World();
    await seedConflictingOperations();
    const handle = await mountSettled();
    const escritasAntes = storage.mainKeyWrites.length;

    await act(async () => {
      handle.context().setActiveView('dashboard');
    });
    await settle(20);

    // `hydrated` permanece falso: nem o debounce nem o flush de ciclo de vida
    // chegam a ser armados.
    expect(storage.mainKeyWrites).toHaveLength(escritasAntes);
    expect(handle.context().storageHealth.status).toBe('blocked');
  });

  it('Strict Mode não duplica o fluxo físico da recuperação', async () => {
    await seedHealthyV2World();
    const operationId = await seedInterruptedImport();

    const handle = await mountSettled({ strict: true });

    expect(handle.context().storageHealth.status).toBe('ready');
    const receipts = await readOperationReceipts();
    // Uma única operação, liquidada uma única vez: a segunda montagem
    // reaproveitou a mesma execução em andamento.
    expect(receipts.filter((receipt) => receipt.operationId === operationId)).toHaveLength(1);
    expect(receipts.find((receipt) => receipt.operationId === operationId))
      .toMatchObject({ status: 'reverted' });
    expect(receipts.filter((receipt) => receipt.status !== 'reverted')).toHaveLength(0);
  });

  it('desmontagem durante o boot não publica estado', async () => {
    await seedHealthyV2World();
    const handle = await mountProvider();
    // Desmonta antes de qualquer settle: a recuperação ainda está no ar.
    await handle.unmount();

    expect(handle.statusHistory).not.toContain('ready');
    expect(handle.context().user).toBeNull();
  });

  it('remount saudável volta a hidratar normalmente', async () => {
    await seedHealthyV2World();
    const primeiro = await mountSettled();
    expect(primeiro.context().storageHealth.status).toBe('ready');
    await primeiro.unmount();

    const segundo = await mountSettled();

    // A trava de execução única é por ciclo: o segundo boot roda de novo.
    expect(segundo.context().storageHealth.status).toBe('ready');
    expect(segundo.statusHistory).toEqual(['loading', 'ready']);
  });

  it('fluxo v1 continua hidratando sob a barreira de recuperação', async () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      v: MONOLITHIC_STORAGE_VERSION,
      savedAt: '2026-07-23T10:00:00.000Z',
      data: defaults(),
    }));

    const handle = await mountSettled();

    // Sem journal v2 não há importação interrompida: a hidratação híbrida
    // decide sozinha, exatamente como antes do D1.
    expect(handle.context().storageHealth.status).not.toBe('blocked');
    expect(handle.statusHistory[0]).toBe('loading');
  });

  it('instalação nova continua hidratando sob a barreira de recuperação', async () => {
    const handle = await mountSettled();

    expect(handle.context().storageHealth.status).toBe('ready');
  });

  it('formato legado suportado migra somente depois da barreira', async () => {
    storage.setItem('gymflow_user', JSON.stringify({
      id: 'usuario-legado',
      name: 'Usuário legado',
    }));
    storage.setItem('gymflow_weeklyPlan', JSON.stringify([]));

    const handle = await mountSettled();

    expect(handle.context().storageHealth.status).toBe('ready');
    expect(handle.context().user).toMatchObject({ id: 'usuario-legado' });
    expect(storage.getItem('gymflow_user')).toBeNull();
    expect(parsePhysicalEnvelope(storage.getItem(STORAGE_KEY) as string).status).toBe('v2');
  });

  it('raw corrompido sem versão comprovável preserva recuperação legada sem publicar defaults', async () => {
    const raw = '{inválido';
    const backupV1 = JSON.stringify({
      v: MONOLITHIC_STORAGE_VERSION,
      savedAt: '2026-07-23T10:00:00.000Z',
      data: defaults(),
    });
    storage.setItem(STORAGE_KEY, raw);
    storage.setItem(`${STORAGE_KEY}:backup`, backupV1);
    storage.setItem(`${STORAGE_KEY}${HYBRID_CORE_BACKUP_SUFFIX}`, 'backup-hibrido-byte-a-byte');
    storage.setItem('gymflow_user', JSON.stringify({
      id: 'nao-pode-ser-migrado',
      name: 'Não publicar',
    }));
    expect(parsePhysicalEnvelope(raw)).toMatchObject({
      status: 'corrupt',
      physicalVersion: null,
    });
    const localBefore = storage.snapshot();
    const mutationsBefore = storage.mutations.length;
    const administrationBefore = await readAdministrationSnapshot();

    const handle = await mountSettled();
    const context = handle.context();

    expect(context.storageMode).toBe('blocked');
    expect(context.storageHealth.status).toBe('blocked');
    expect(context.legacyStorageOperationsAllowed).toBe(true);
    expect(context.storageRecoveryCapabilities).toEqual({
      canRestoreLegacyBackup: true,
      canStartFreshLegacy: true,
      canDownloadRaw: true,
      requiresHybridRecovery: false,
    });
    expect(context.user).toBeNull();
    expect(context.weeklyPlan).toEqual([]);
    expect(context.workoutHistory).toEqual([]);
    expect(storage.snapshot()).toBe(localBefore);
    expect(storage.mutations).toHaveLength(mutationsBefore);

    // `setHydrated(true)` libera apenas a superfície bloqueada. Nem o debounce
    // nem o flush de ciclo de vida conseguem gravar com `storageBlockedRef`.
    await act(async () => {
      context.setActiveView('dashboard');
      await new Promise((resolve) => setTimeout(resolve, 550));
    });
    window.dispatchEvent(new Event('pagehide'));
    await settle(5);

    expect(storage.snapshot()).toBe(localBefore);
    expect(storage.mutations).toHaveLength(mutationsBefore);
    const administrationAfter = await readAdministrationSnapshot();
    expect(administrationAfter).toEqual(administrationBefore);
    expect(administrationAfter.metadata).toEqual(administrationBefore.metadata);
    expect(administrationAfter.generations).toEqual(administrationBefore.generations);
    expect(administrationAfter.manifests).toEqual(administrationBefore.manifests);
    expect(administrationAfter.operationReceipts).toEqual(
      administrationBefore.operationReceipts,
    );
    expect(administrationAfter.pendingCompletionReceipts).toEqual(
      administrationBefore.pendingCompletionReceipts,
    );
  });

  it('envelope v2 inválido bloqueia antes do runtime e não habilita recuperação legada', async () => {
    const raw = JSON.stringify({
      v: 2,
      savedAt: '2026-07-23T10:00:00.000Z',
      data: {},
    });
    storage.setItem(STORAGE_KEY, raw);
    expect(parsePhysicalEnvelope(raw)).toMatchObject({
      status: 'corrupt',
      physicalVersion: 2,
    });
    const mutationsBefore = storage.mutations.length;
    const hydrate = spyOnHybridHydrate();

    const handle = await mountSettled();
    const context = handle.context();

    expect(hydrate).not.toHaveBeenCalled();
    expect(context.storageHealth.status).toBe('blocked');
    expect(context.legacyStorageOperationsAllowed).toBe(false);
    expect(context.storageRecoveryCapabilities.requiresHybridRecovery).toBe(true);
    expect(context.user).toBeNull();
    expect(storage.values.get(STORAGE_KEY)).toBe(raw);
    expect(storage.mutations).toHaveLength(mutationsBefore);
  });

  for (const [name, raw, physicalVersion] of [
    [
      'unsupported',
      JSON.stringify({ v: 99, savedAt: '2026-07-23T10:00:00.000Z', data: {} }),
      99,
    ],
    [
      'corrupt com versão numérica não-v2',
      JSON.stringify({ v: 1, data: {} }),
      1,
    ],
  ] as const) {
    it(`${name}: executa somente a classificação bloqueada, sem migração ou escrita`, async () => {
      storage.setItem(STORAGE_KEY, raw);
      storage.setItem('gymflow_user', JSON.stringify({ id: 'nao-migrar' }));
      const parsed = parsePhysicalEnvelope(raw);
      if (name === 'unsupported') {
        expect(parsed).toMatchObject({ status: 'unsupported-version', version: physicalVersion });
      } else {
        expect(parsed).toMatchObject({ status: 'corrupt', physicalVersion });
      }
      const before = storage.snapshot();
      const mutationsBefore = storage.mutations.length;
      const hydrate = spyOnHybridHydrate();

      const handle = await mountSettled();
      const context = handle.context();

      expect(hydrate).toHaveBeenCalledTimes(1);
      expect(context.storageMode).toBe('blocked');
      expect(context.storageHealth.status).toBe('blocked');
      expect(context.legacyStorageOperationsAllowed).toBe(true);
      expect(context.user).toBeNull();
      expect(storage.snapshot()).toBe(before);
      expect(storage.mutations).toHaveLength(mutationsBefore);
    });
  }

  it('sucesso inesperado do runtime no caminho restrito falha fechado sem publicar dados', async () => {
    const raw = '{inválido';
    storage.setItem(STORAGE_KEY, raw);
    const mutationsBefore = storage.mutations.length;
    const hydrate = spyOnHybridHydrate().mockResolvedValue({
      mode: 'legacy-v1',
      state: {
        ...defaults(),
        user: { id: 'estado-que-nao-pode-ser-publicado' },
      } as unknown as PersistedState,
      reason: 'indexeddb-unavailable',
      physicalVersion: null,
    });

    const handle = await mountSettled();
    const context = handle.context();

    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(context.storageMode).toBe('blocked');
    expect(context.storageHealth.status).toBe('blocked');
    expect(context.storageHealth.issue?.message).toBe(
      STORAGE_BOOT_RECOVERY_MESSAGES['blocked-recovery-required'],
    );
    expect(context.legacyStorageOperationsAllowed).toBe(false);
    expect(context.storageRecoveryCapabilities.requiresHybridRecovery).toBe(true);
    expect(context.user).toBeNull();
    expect(storage.values.get(STORAGE_KEY)).toBe(raw);
    expect(storage.mutations).toHaveLength(mutationsBefore);
  });

  it('Strict Mode compartilha o recovery e classifica o raw corrompido uma única vez', async () => {
    const raw = '{inválido';
    storage.setItem(STORAGE_KEY, raw);
    const mutationsBefore = storage.mutations.length;
    const hydrate = spyOnHybridHydrate();

    const handle = await mountSettled({ strict: true });

    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(handle.context().storageMode).toBe('blocked');
    expect(handle.context().legacyStorageOperationsAllowed).toBe(true);
    expect(storage.values.get(STORAGE_KEY)).toBe(raw);
    expect(storage.mutations).toHaveLength(mutationsBefore);
  });

  it('core v2 com IndexedDB indisponível bloqueia sem publicar defaults', async () => {
    await seedHealthyV2World();
    const rawBefore = storage.getItem(STORAGE_KEY);
    const writesBefore = storage.mainKeyWrites.length;
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const hydrate = spyOnHybridHydrate();

    const handle = await mountSettled();
    const context = handle.context();

    expect(context.storageHealth.status).toBe('blocked');
    expect(context.storageHealth.issue?.message).toBe(
      STORAGE_BOOT_RECOVERY_MESSAGES['blocked-storage-unavailable'],
    );
    expect(hydrate).not.toHaveBeenCalled();
    expect(context.legacyStorageOperationsAllowed).toBe(false);
    expect(context.storageRecoveryCapabilities.requiresHybridRecovery).toBe(true);
    expect(context.user).toBeNull();
    expect(context.workoutHistory).toEqual([]);
    expect(storage.values.get(STORAGE_KEY)).toBe(rawBefore);
    expect(storage.mainKeyWrites).toHaveLength(writesBefore);
  });

  it('erro nativo ao classificar o core não atravessa o resultado do Provider', async () => {
    await seedHealthyV2World();
    const rawBefore = storage.values.get(STORAGE_KEY);
    const writesBefore = storage.mainKeyWrites.length;
    storage.mainKeyReadError = new Error('PRIVATE_LOCALSTORAGE_MESSAGE');

    const handle = await mountSettled();
    const context = handle.context();
    const serialized = JSON.stringify(context.storageHealth);

    expect(context.storageHealth.status).toBe('blocked');
    expect(context.storageHealth.issue?.message).toBe(
      STORAGE_BOOT_RECOVERY_MESSAGES['blocked-storage-unavailable'],
    );
    expect(serialized).not.toContain('PRIVATE_LOCALSTORAGE_MESSAGE');
    expect(serialized).not.toContain('stack');
    expect(context.user).toBeNull();
    expect(context.workoutHistory).toEqual([]);
    expect(storage.values.get(STORAGE_KEY)).toBe(rawBefore);
    expect(storage.mainKeyWrites).toHaveLength(writesBefore);
  });
});
