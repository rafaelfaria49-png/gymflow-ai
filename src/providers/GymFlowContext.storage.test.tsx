import { IDBFactory } from 'fake-indexeddb';
import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { MOCK_COMMUNITY } from '../mock/data';
import {
  COMPLETION_RECEIPTS_STORE,
  GENERATION_MANIFESTS_STORE,
  GYMFLOW_INDEXEDDB_VERSION,
  METADATA_STORE,
  WORKOUT_HISTORY_STORE,
} from '../lib/storage-indexeddb';
import { parsePhysicalEnvelope } from '../lib/storage-hybrid';
import type { WorkoutCompletionReceipt } from '../lib/storage-completion-receipt';
import { MONOLITHIC_STORAGE_VERSION, type PersistedCoreState } from '../lib/storage-types';
import type {
  Achievement,
  Challenge,
  UserProfile,
  WeeklyWorkoutDay,
  WorkoutSession,
} from '../types';
import { GymFlowProvider, STORAGE_KEY, useGymFlow } from './GymFlowContext';

type GymFlowValue = ReturnType<typeof useGymFlow>;

const DAYS_ORDER = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function todayDayName(): string {
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
  const normalized = today.split('-')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'segunda': 'Segunda', 'terça': 'Terça', 'quarta': 'Quarta', 'quinta': 'Quinta',
    'sexta': 'Sexta', 'sábado': 'Sábado', 'domingo': 'Domingo',
  };
  return map[normalized] ?? 'Segunda';
}

// ===== Ambiente de navegador mínimo (sem DOM real) =====

class MemoryLocalStorage {
  readonly values = new Map<string, string>();
  readonly mainKeyWrites: string[] = [];
  readonly mainKeyWriteAttempts: string[] = [];
  failMainKeyWrites = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (key === STORAGE_KEY) this.mainKeyWriteAttempts.push(value);
    if (this.failMainKeyWrites && key === STORAGE_KEY) {
      throw new Error('falha induzida na gravação do core');
    }
    if (key === STORAGE_KEY) this.mainKeyWrites.push(value);
    this.values.set(key, String(value));
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

let storage: MemoryLocalStorage;
let windowStub: EventTarget & { localStorage: MemoryLocalStorage };
let documentStub: EventTarget & { visibilityState: string };
const originalWindow = Reflect.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Reflect.getOwnPropertyDescriptor(globalThis, 'document');
const originalIndexedDb = Reflect.getOwnPropertyDescriptor(globalThis, 'indexedDB');

function installBrowserGlobals(): void {
  storage = new MemoryLocalStorage();
  windowStub = Object.assign(new EventTarget(), {
    localStorage: storage,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    location: { reload: () => undefined },
  });
  documentStub = Object.assign(new EventTarget(), { visibilityState: 'visible' });
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

// ===== Acesso físico ao banco, por fora do Provider =====

function openRawDatabase(): Promise<IDBDatabase> {
  const request = (globalThis.indexedDB as IDBFactory)
    .open('gymflow-persistence', GYMFLOW_INDEXEDDB_VERSION);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function rawRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withRawDatabase<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const database = await openRawDatabase();
  const transaction = database.transaction(stores, mode);
  const completed = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => undefined;
  });
  const result = await run(transaction);
  await completed;
  database.close();
  return result;
}

async function readPendingReceipts(): Promise<WorkoutCompletionReceipt[]> {
  return withRawDatabase([COMPLETION_RECEIPTS_STORE], 'readonly', async (transaction) => {
    const all = await rawRequest(
      transaction.objectStore(COMPLETION_RECEIPTS_STORE).getAll(),
    ) as WorkoutCompletionReceipt[];
    return all.filter((receipt) => receipt.status === 'pending');
  });
}

function persistedCore(): PersistedCoreState {
  const parsed = parsePhysicalEnvelope(storage.getItem(STORAGE_KEY) as string);
  if (parsed.status !== 'v2') throw new Error(`Envelope persistido não é v2: ${parsed.status}`);
  return parsed.envelope.data;
}

// ===== Fixtures =====

const STARTED_AT = 1_784_000_000_000;

function makeActiveSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'session-ativa',
    name: 'Treino A — Peito',
    date: new Date(STARTED_AT).toISOString(),
    duration: 0,
    calories: 0,
    xpEarned: 0,
    prsDetected: [],
    status: 'active',
    startedAt: STARTED_AT,
    exercises: [{
      id: 'entry-1',
      exerciseId: 'chest_supino_reto',
      name: 'Supino reto',
      muscleGroup: 'Peito',
      notes: '',
      entryOrigin: 'planned',
      sets: [{ id: 'set-1', reps: 10, weight: 60, completed: true }],
    }],
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Rafael Silveira (Demo)',
    email: 'rafael.demo@gymflow.ai',
    level: 'intermediate',
    goal: 'hypertrophy',
    gender: 'male',
    age: 28,
    weight: 80.5,
    height: 178,
    frequency: 4,
    duration: 60,
    location: 'gym',
    equipments: [],
    restrictions: [],
    muscleFocus: [],
    preference: '',
    xp: 100,
    streak: 3,
    lastWorkoutDate: '2020-01-01',
    waterIntake: 0,
    waterGoal: 3000,
    premiumStatus: 'pro',
    points: 100,
    weeklyPlan: [],
    connectedSocials: [],
    ...overrides,
  };
}

function makeWeeklyPlan(): WeeklyWorkoutDay[] {
  return DAYS_ORDER.map((dayName) => ({
    dayName,
    workoutName: 'Treino A',
    muscleGroups: ['Peito'],
    duration: 60,
    exerciseCount: 1,
    isRest: false,
    trained: false,
  }));
}

function makeAchievements(): Achievement[] {
  return [
    { id: 'ach_1', name: 'Primeiro Treino', description: '', icon: '🏅', unlocked: false },
    { id: 'ach_18', name: 'Volume 10t', description: '', icon: '🏋️', unlocked: false },
  ];
}

function makeChallenges(): Challenge[] {
  return [
    { id: 'chal_1', name: '7 dias', durationDays: 7, xpReward: 100, description: '', progress: 10, completed: false, type: '7-days' },
    { id: 'chal_9', name: 'Intocado', durationDays: 14, xpReward: 200, description: '', progress: 42, completed: false, type: '14-days' },
  ];
}

function seedV1Envelope(overrides: Record<string, unknown> = {}): void {
  const weeklyPlan = makeWeeklyPlan();
  storage.setItem(STORAGE_KEY, JSON.stringify({
    v: MONOLITHIC_STORAGE_VERSION,
    savedAt: '2026-07-23T10:00:00.000Z',
    data: {
      user: makeUser({ weeklyPlan }),
      weeklyPlan,
      customPrograms: [],
      activeWorkout: makeActiveSession(),
      activeWorkoutStartedAt: STARTED_AT,
      restTimerEndAt: null,
      restTimerTotalSeconds: null,
      restTimerLabel: null,
      workoutHistory: [],
      weightHistory: [],
      measurementsHistory: [],
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
      achievements: makeAchievements(),
      challenges: makeChallenges(),
      favoriteExercises: [],
      recentlyViewedVideoIds: [],
      ...overrides,
    },
  }));
  storage.mainKeyWrites.length = 0;
  storage.mainKeyWriteAttempts.length = 0;
}

// ===== Montagem do Provider real =====

interface Mounted {
  renderer: TestRenderer.ReactTestRenderer;
  context: () => GymFlowValue;
  renderCount: () => number;
  unmount: () => Promise<void>;
}

const mounted: Mounted[] = [];

async function mountProvider(options: { strict?: boolean } = {}): Promise<Mounted> {
  const state = { value: null as GymFlowValue | null, renders: 0 };

  const Probe = () => {
    state.value = useGymFlow();
    state.renders += 1;
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
    renderer: renderer as unknown as TestRenderer.ReactTestRenderer,
    context: () => {
      if (!state.value) throw new Error('O Provider não expôs o contexto.');
      return state.value;
    },
    renderCount: () => state.renders,
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

async function settle(ticks = 5): Promise<void> {
  for (let index = 0; index < ticks; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
  }
}

async function waitFor(
  predicate: () => boolean,
  label: string,
  attempts = 400,
): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
  }
  throw new Error(`Tempo esgotado esperando: ${label}`);
}

async function mountHydrated(options: { strict?: boolean } = {}): Promise<Mounted> {
  const handle = await mountProvider(options);
  await waitFor(
    () => handle.context().storageHealth.status !== 'loading',
    'hidratação concluir',
  );
  return handle;
}

async function finishActiveWorkout(handle: Mounted): Promise<void> {
  await act(async () => {
    handle.context().finishWorkout(8);
  });
  await settle(40);
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installBrowserGlobals();
});

afterEach(async () => {
  for (const handle of mounted.splice(0)) {
    try {
      await act(async () => { handle.renderer.unmount(); });
    } catch {
      // já desmontado pelo próprio teste
    }
  }
  await settle(10);
  restoreBrowserGlobals();
});

describe('GymFlowProvider real — hidratação híbrida', () => {
  it('hidrata v2 válida a partir do cutover e mantém histórico e treino ativo', async () => {
    seedV1Envelope();
    const first = await mountHydrated();
    expect(first.context().storageMode).toBe('hybrid-v2');
    expect(first.context().storageHealth.status).toBe('ready');
    expect(first.context().activeWorkout?.id).toBe('session-ativa');
    expect(first.context().user?.xp).toBe(100);
    const core = persistedCore();
    expect(core.historyStorage.backend).toBe('indexeddb');
    expect(Object.prototype.hasOwnProperty.call(core, 'workoutHistory')).toBe(false);
    await first.unmount();

    const second = await mountHydrated();
    expect(second.context().storageMode).toBe('hybrid-v2');
    expect(second.context().workoutHistory).toEqual([]);
    expect(second.context().activeWorkout?.id).toBe('session-ativa');
  });

  it('hidrata geração vazia válida sem fabricar histórico', async () => {
    seedV1Envelope({ activeWorkout: null, activeWorkoutStartedAt: null });
    const first = await mountHydrated();
    expect(first.context().storageMode).toBe('hybrid-v2');
    await first.unmount();

    const manifest = await withRawDatabase([GENERATION_MANIFESTS_STORE], 'readonly', async (t) => (
      rawRequest(t.objectStore(GENERATION_MANIFESTS_STORE).getAll())
    )) as { sessionCount: number; verified: boolean }[];
    expect(manifest).toHaveLength(1);
    expect(manifest[0]).toMatchObject({ sessionCount: 0, verified: true });

    const second = await mountHydrated();
    expect(second.context().storageMode).toBe('hybrid-v2');
    expect(second.context().storageHealth.status).toBe('ready');
    expect(second.context().workoutHistory).toEqual([]);
  });

  it('bloqueia quando a geração some fisicamente', async () => {
    seedV1Envelope();
    const first = await mountHydrated();
    const generationId = persistedCore().historyStorage.generationId;
    await first.unmount();

    await withRawDatabase(
      [WORKOUT_HISTORY_STORE, METADATA_STORE, GENERATION_MANIFESTS_STORE],
      'readwrite',
      async (transaction) => {
        const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
        const keys = await rawRequest(historyStore.index('byGeneration').getAllKeys(generationId));
        await Promise.all(keys.map((key) => rawRequest(historyStore.delete(key))));
        await rawRequest(transaction.objectStore(GENERATION_MANIFESTS_STORE).delete(generationId));
        await rawRequest(transaction.objectStore(METADATA_STORE)
          .delete(`generationNextOrder:${generationId}`));
      },
    );
    const rawBefore = storage.getItem(STORAGE_KEY);

    const second = await mountHydrated();
    expect(second.context().storageMode).toBe('blocked');
    expect(second.context().storageHealth.status).toBe('blocked');
    expect(second.context().storageHealth.issue?.message).toContain('generation-absent');
    expect(second.context().workoutHistory).toEqual([]);
    // Autosave pausado: o conteúdo original continua intacto.
    expect(storage.getItem(STORAGE_KEY)).toBe(rawBefore);
  });

  it('bloqueia quando parte dos registros se perde', async () => {
    seedV1Envelope({
      activeWorkout: null,
      activeWorkoutStartedAt: null,
      workoutHistory: [
        { ...makeActiveSession({ id: 'hist-2' }), status: 'completed', endedAt: STARTED_AT + 1 },
        { ...makeActiveSession({ id: 'hist-1' }), status: 'completed', endedAt: STARTED_AT + 2 },
      ],
    });
    const first = await mountHydrated();
    expect(first.context().workoutHistory.map((session) => session.id)).toEqual(['hist-2', 'hist-1']);
    const generationId = persistedCore().historyStorage.generationId;
    await first.unmount();

    await withRawDatabase([WORKOUT_HISTORY_STORE], 'readwrite', async (transaction) => {
      const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
      const keys = await rawRequest(historyStore.index('byGeneration').getAllKeys(generationId));
      await rawRequest(historyStore.delete(keys[0]));
    });

    const second = await mountHydrated();
    expect(second.context().storageMode).toBe('blocked');
    expect(second.context().storageHealth.issue?.message).toContain('session-count-mismatch');
    expect(second.context().workoutHistory).toEqual([]);
  });

  it('bloqueia quando o manifest da geração some', async () => {
    seedV1Envelope();
    const first = await mountHydrated();
    const generationId = persistedCore().historyStorage.generationId;
    await first.unmount();

    await withRawDatabase([GENERATION_MANIFESTS_STORE], 'readwrite', async (transaction) => {
      await rawRequest(transaction.objectStore(GENERATION_MANIFESTS_STORE).delete(generationId));
    });

    const second = await mountHydrated();
    expect(second.context().storageMode).toBe('blocked');
    expect(second.context().storageHealth.issue?.message).toContain('manifest-absent');
  });

  it('bloqueia quando o manifest diverge dos registros', async () => {
    seedV1Envelope({
      activeWorkout: null,
      activeWorkoutStartedAt: null,
      workoutHistory: [
        { ...makeActiveSession({ id: 'hist-1' }), status: 'completed', endedAt: STARTED_AT + 1 },
      ],
    });
    const first = await mountHydrated();
    const generationId = persistedCore().historyStorage.generationId;
    await first.unmount();

    await withRawDatabase([GENERATION_MANIFESTS_STORE], 'readwrite', async (transaction) => {
      const store = transaction.objectStore(GENERATION_MANIFESTS_STORE);
      const manifest = await rawRequest(store.get(generationId)) as Record<string, unknown>;
      await rawRequest(store.put({ ...manifest, orderedDigest: 'sha256:adulterado' }));
    });

    const second = await mountHydrated();
    expect(second.context().storageMode).toBe('blocked');
    expect(second.context().storageHealth.issue?.message).toContain('ordered-digest-mismatch');
  });
});

describe('GymFlowProvider real — finalização e recuperação', () => {
  it('confirma o append e aplica XP, streak, plano, desafios, conquistas e postagem', async () => {
    seedV1Envelope();
    const handle = await mountHydrated();
    const postsBefore = handle.context().communityPosts.length;

    await finishActiveWorkout(handle);
    const context = handle.context();

    expect(context.workoutHistory.map((session) => session.id)).toEqual(['session-ativa']);
    expect(context.activeWorkout).toBeNull();
    expect(context.activeView).toBe('dashboard');
    // 105 (treino) + 150 (ach_1) + 25 (postagem).
    expect(context.user?.xp).toBe(100 + 280);
    expect(context.user?.points).toBe(100 + 280);
    expect(context.user?.streak).toBe(4);
    expect(context.user?.lastWorkoutDate).toBe(new Date().toISOString().split('T')[0]);
    expect(context.weeklyPlan.filter((day) => day.trained).map((day) => day.dayName))
      .toEqual([todayDayName()]);
    expect(context.challenges.find((c) => c.id === 'chal_1')?.progress).toBe(25);
    expect(context.challenges.find((c) => c.id === 'chal_9')?.progress).toBe(42);
    expect(context.achievements.find((a) => a.id === 'ach_1')?.unlocked).toBe(true);
    expect(context.achievements.find((a) => a.id === 'ach_18')?.unlocked).toBe(false);
    expect(context.communityPosts).toHaveLength(postsBefore + 1);
    expect(context.communityPosts[0].content).toContain('Treino finalizado!');
    expect(context.storageHealth.status).toBe('ready');

    // Core persistido reflete exatamente a conclusão, sem workoutHistory.
    const core = persistedCore();
    expect(core.activeWorkout).toBeNull();
    expect(core.activeWorkoutStartedAt).toBeNull();
    expect(core.restTimerEndAt).toBeNull();
    expect(core.user?.xp).toBe(380);
    expect(core.user?.streak).toBe(4);
    expect(Object.prototype.hasOwnProperty.call(core, 'workoutHistory')).toBe(false);
    expect(await readPendingReceipts()).toEqual([]);
  });

  it('mantém o treino aberto e sinaliza erro quando o append falha', async () => {
    seedV1Envelope();
    const handle = await mountHydrated();
    const generationId = persistedCore().historyStorage.generationId;

    // Manifest removido por fora: o append recusa antes de gravar qualquer coisa.
    await withRawDatabase([GENERATION_MANIFESTS_STORE], 'readwrite', async (transaction) => {
      await rawRequest(transaction.objectStore(GENERATION_MANIFESTS_STORE).delete(generationId));
    });

    await act(async () => {
      handle.context().finishWorkout(8);
    });
    await waitFor(
      () => handle.context().storageHealth.status === 'write-error',
      'o erro de append ser reportado',
    );

    const context = handle.context();
    expect(context.activeWorkout?.id).toBe('session-ativa');
    expect(context.workoutHistory).toEqual([]);
    expect(context.user?.xp).toBe(100);
    expect(context.user?.streak).toBe(3);
    expect(context.achievements.find((a) => a.id === 'ach_1')?.unlocked).toBe(false);
    expect(await readPendingReceipts()).toEqual([]);
    // Nada foi gravado: nem sessão, nem receipt.
    const records = await withRawDatabase([WORKOUT_HISTORY_STORE], 'readonly', async (t) => (
      rawRequest(t.objectStore(WORKOUT_HISTORY_STORE).getAll())
    )) as unknown[];
    expect(records).toEqual([]);
  });

  it('recupera após kill entre o append e a gravação do core preservando todos os efeitos', async () => {
    seedV1Envelope();
    const first = await mountHydrated();

    // Kill simulado: a sessão e o receipt ficam duráveis, o core não é gravado.
    storage.failMainKeyWrites = true;
    await finishActiveWorkout(first);
    expect((await readPendingReceipts()).map((receipt) => receipt.sessionId)).toEqual(['session-ativa']);
    // O core em disco ainda é o pré-conclusão.
    expect(persistedCore().activeWorkout?.id).toBe('session-ativa');
    expect(persistedCore().user?.xp).toBe(100);
    await first.unmount();
    storage.failMainKeyWrites = false;

    const second = await mountHydrated();
    const context = second.context();

    expect(context.storageMode).toBe('hybrid-v2');
    expect(context.storageHealth.status).toBe('ready');
    expect(context.workoutHistory.map((session) => session.id)).toEqual(['session-ativa']);
    expect(context.activeWorkout).toBeNull();
    expect(context.user?.xp).toBe(380);
    expect(context.user?.points).toBe(380);
    expect(context.user?.streak).toBe(4);
    expect(context.weeklyPlan.filter((day) => day.trained).map((day) => day.dayName))
      .toEqual([todayDayName()]);
    expect(context.challenges.find((c) => c.id === 'chal_1')?.progress).toBe(25);
    expect(context.achievements.find((a) => a.id === 'ach_1')?.unlocked).toBe(true);

    // Postagem materializada exatamente uma vez neste ciclo do Provider.
    const recoveredPosts = context.communityPosts
      .filter((post) => post.content.includes('Treino finalizado!'));
    expect(recoveredPosts).toHaveLength(1);
    expect(context.communityPosts).toHaveLength(MOCK_COMMUNITY.length + 1);

    // Core confirmado e receipt liquidado antes de liberar o autosave.
    expect(persistedCore().user?.xp).toBe(380);
    expect(persistedCore().activeWorkout).toBeNull();
    expect(await readPendingReceipts()).toEqual([]);
  });

  it('mantém recuperação pendente após falha do core até um novo boot', async () => {
    seedV1Envelope();
    const first = await mountHydrated();
    storage.mainKeyWrites.length = 0;
    storage.mainKeyWriteAttempts.length = 0;

    storage.failMainKeyWrites = true;
    await finishActiveWorkout(first);

    const afterFailure = first.context();
    expect(afterFailure.storageHealth.status).toBe('write-error');
    expect(afterFailure.storageHealth.issue?.message).toContain('Reabra o aplicativo');
    expect(afterFailure.activeWorkout).toBeNull();
    expect(afterFailure.workoutHistory.map((session) => session.id)).toEqual(['session-ativa']);
    expect(afterFailure.user?.xp).toBe(380);
    expect(afterFailure.user?.streak).toBe(4);
    expect((await readPendingReceipts()).map((receipt) => receipt.sessionId))
      .toEqual(['session-ativa']);
    expect(storage.mainKeyWriteAttempts).toHaveLength(1);
    expect(storage.mainKeyWrites).toEqual([]);

    // Uma edição posterior permanece apenas em memória: o autosave normal fica
    // suspenso e não tenta substituir o snapshot da conclusão. O commit ganha
    // fronteira de act própria para que o debounce chegue mesmo a ser agendado.
    await act(async () => {
      first.context().toggleFavoriteExercise('edicao-posterior');
    });
    await settle(5);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(first.context().favoriteExercises).toContain('edicao-posterior');
    expect(storage.mainKeyWriteAttempts).toHaveLength(1);
    expect(persistedCore().activeWorkout?.id).toBe('session-ativa');

    // Um pagehide posterior pode repetir somente o pendingCompletionCore. Mesmo
    // após o sucesso, o Provider continua em erro e o receipt não é liquidado.
    storage.failMainKeyWrites = false;
    await act(async () => {
      windowStub.dispatchEvent(new Event('pagehide'));
      await new Promise((resolve) => setTimeout(resolve, 110));
    });
    expect(storage.mainKeyWriteAttempts).toHaveLength(2);
    expect(storage.mainKeyWrites).toHaveLength(1);
    expect(persistedCore().activeWorkout).toBeNull();
    expect(persistedCore().user?.xp).toBe(380);
    expect(persistedCore().favoriteExercises).not.toContain('edicao-posterior');
    expect(first.context().storageHealth.status).toBe('write-error');
    expect((await readPendingReceipts()).map((receipt) => receipt.sessionId))
      .toEqual(['session-ativa']);

    // Nova finalização é recusada: nenhuma sessão, recompensa ou receipt nasce.
    await act(async () => {
      first.context().finishWorkout(8);
    });
    await settle(10);
    expect(first.context().workoutHistory).toHaveLength(1);
    expect(first.context().user?.xp).toBe(380);
    expect(first.context().user?.streak).toBe(4);
    expect(first.context().weeklyPlan.filter((day) => day.trained)).toHaveLength(1);
    expect(first.context().challenges.find((challenge) => challenge.id === 'chal_1')?.progress)
      .toBe(25);
    expect(first.context().achievements.find((achievement) => achievement.id === 'ach_1')?.unlocked)
      .toBe(true);
    expect(await readPendingReceipts()).toHaveLength(1);

    await first.unmount();

    // Somente a nova montagem confirma o core, liquida o receipt e libera save.
    const second = await mountHydrated();
    expect(second.context().storageHealth.status).toBe('ready');
    expect(second.context().workoutHistory.map((session) => session.id)).toEqual(['session-ativa']);
    expect(second.context().user?.xp).toBe(380);
    expect(second.context().user?.streak).toBe(4);
    expect(second.context().communityPosts.filter((post) => post.content.includes('Treino finalizado!')))
      .toHaveLength(1);
    expect(await readPendingReceipts()).toEqual([]);

    storage.mainKeyWrites.length = 0;
    storage.mainKeyWriteAttempts.length = 0;
    // O toggle precisa de uma fronteira de act própria: só depois do commit os
    // refs de persistência enxergam a edição e o debounce é reagendado.
    await act(async () => {
      second.context().toggleFavoriteExercise('apos-recuperacao');
    });
    await settle(5);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(storage.mainKeyWrites.length).toBeGreaterThan(0);
    expect(persistedCore().favoriteExercises).toContain('apos-recuperacao');
    expect(second.context().storageHealth.status).toBe('ready');
  });

  it('não duplica efeitos quando o mesmo receipt é reprocessado em vários boots', async () => {
    seedV1Envelope();
    const first = await mountHydrated();
    storage.failMainKeyWrites = true;
    await finishActiveWorkout(first);
    await first.unmount();
    storage.failMainKeyWrites = false;

    // Primeiro boot: recupera o receipt, materializa a postagem e liquida.
    const recovery = await mountHydrated();
    expect(recovery.context().communityPosts.filter((p) => p.content.includes('Treino finalizado!')))
      .toHaveLength(1);
    expect(await readPendingReceipts()).toEqual([]);
    await recovery.unmount();

    // Boots seguintes: efeitos do core preservados e nenhuma repetição.
    for (let boot = 0; boot < 3; boot += 1) {
      const handle = await mountHydrated();
      const context = handle.context();
      expect(context.workoutHistory.map((session) => session.id)).toEqual(['session-ativa']);
      expect(context.user?.xp).toBe(380);
      expect(context.user?.streak).toBe(4);
      expect(context.weeklyPlan.filter((day) => day.trained)).toHaveLength(1);
      expect(context.challenges.find((c) => c.id === 'chal_1')?.progress).toBe(25);
      expect(context.achievements.find((a) => a.id === 'ach_1')?.unlocked).toBe(true);
      expect(context.communityPosts.filter((p) => p.content.includes('Treino finalizado!')))
        .toHaveLength(0);
      expect(await readPendingReceipts()).toEqual([]);
      await handle.unmount();
    }
  });

  it('um pagehide após a conclusão nunca ressuscita o estado pré-conclusão', async () => {
    seedV1Envelope();
    const handle = await mountHydrated();
    storage.mainKeyWrites.length = 0;

    await act(async () => {
      handle.context().finishWorkout(8);
    });
    for (let index = 0; index < 6; index += 1) {
      await act(async () => {
        windowStub.dispatchEvent(new Event('pagehide'));
        await new Promise((resolve) => setTimeout(resolve, 110));
      });
    }
    await settle(20);

    const cores = storage.mainKeyWrites
      .map((raw) => parsePhysicalEnvelope(raw))
      .filter((parsed) => parsed.status === 'v2')
      .map((parsed) => (parsed as { envelope: { data: PersistedCoreState } }).envelope.data);
    const firstCompleted = cores.findIndex((core) => core.activeWorkout === null);
    expect(firstCompleted).toBeGreaterThanOrEqual(0);

    // Depois que a conclusão virou durável, nenhuma gravação volta atrás.
    for (const core of cores.slice(firstCompleted)) {
      expect(core.activeWorkout).toBeNull();
      expect(core.activeWorkoutStartedAt).toBeNull();
      expect(core.restTimerEndAt).toBeNull();
      expect(core.user?.xp).toBe(380);
      expect(core.user?.streak).toBe(4);
      expect(core.weeklyPlan.filter((day) => day.trained)).toHaveLength(1);
      expect(core.challenges.find((c) => c.id === 'chal_1')?.progress).toBe(25);
      expect(core.achievements.find((a) => a.id === 'ach_1')?.unlocked).toBe(true);
    }
    expect(persistedCore().user?.xp).toBe(380);
  });
});

describe('GymFlowProvider real — ciclo de vida', () => {
  it('conclui a operação durável sem nenhum callback após o unmount', async () => {
    seedV1Envelope();
    const handle = await mountHydrated();
    const rendersBefore = handle.renderCount();
    const contextBefore = handle.context();

    // Finalização iniciada e unmount imediato, sem aguardar o commit.
    await act(async () => {
      handle.context().finishWorkout(8);
      handle.renderer.unmount();
    });
    await settle(40);

    // Nenhum render novo: nada de setState, toast, navegação ou efeito visual.
    expect(handle.renderCount()).toBe(rendersBefore);
    expect(contextBefore.activeWorkout?.id).toBe('session-ativa');
    expect(contextBefore.workoutHistory).toEqual([]);

    // A operação durável concluiu e o receipt continua retomável.
    const durableHistory = await withRawDatabase([WORKOUT_HISTORY_STORE], 'readonly', async (t) => (
      rawRequest(t.objectStore(WORKOUT_HISTORY_STORE).getAll())
    )) as { sessionId: string }[];
    expect(durableHistory.map((record) => record.sessionId)).toEqual(['session-ativa']);
    expect((await readPendingReceipts()).map((receipt) => receipt.sessionId)).toEqual(['session-ativa']);

    // O próximo boot retoma o receipt e materializa os efeitos uma única vez.
    const next = await mountHydrated();
    expect(next.context().workoutHistory.map((session) => session.id)).toEqual(['session-ativa']);
    expect(next.context().user?.xp).toBe(380);
    expect(next.context().activeWorkout).toBeNull();
    expect(next.context().communityPosts.filter((p) => p.content.includes('Treino finalizado!')))
      .toHaveLength(1);
    expect(await readPendingReceipts()).toEqual([]);
  });

  it('sob Strict Mode hidrata uma única vez e não duplica cutover nem geração', async () => {
    seedV1Envelope();
    const handle = await mountHydrated({ strict: true });

    expect(handle.context().storageMode).toBe('hybrid-v2');
    expect(handle.context().storageHealth.status).toBe('ready');
    expect(handle.context().activeWorkout?.id).toBe('session-ativa');

    const manifests = await withRawDatabase([GENERATION_MANIFESTS_STORE], 'readonly', async (t) => (
      rawRequest(t.objectStore(GENERATION_MANIFESTS_STORE).getAll())
    )) as unknown[];
    expect(manifests).toHaveLength(1);
    expect(persistedCore().historyStorage.generationId)
      .toBe((manifests[0] as { generationId: string }).generationId);
  });

  it('sob Strict Mode conclui o treino uma única vez, sem append nem receipt duplicado', async () => {
    seedV1Envelope();
    const handle = await mountHydrated({ strict: true });

    await finishActiveWorkout(handle);
    const context = handle.context();

    expect(context.workoutHistory.map((session) => session.id)).toEqual(['session-ativa']);
    expect(context.activeWorkout).toBeNull();
    expect(context.communityPosts.filter((p) => p.content.includes('Treino finalizado!')))
      .toHaveLength(1);

    const records = await withRawDatabase([WORKOUT_HISTORY_STORE], 'readonly', async (t) => (
      rawRequest(t.objectStore(WORKOUT_HISTORY_STORE).getAll())
    )) as unknown[];
    expect(records).toHaveLength(1);
    const receipts = await withRawDatabase([COMPLETION_RECEIPTS_STORE], 'readonly', async (t) => (
      rawRequest(t.objectStore(COMPLETION_RECEIPTS_STORE).getAll())
    )) as WorkoutCompletionReceipt[];
    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe('completed');
  });
});

describe('GymFlowProvider real — bloqueios administrativos em v2', () => {
  it('recusa importar, restaurar e resetar sem sobrescrever o envelope v2', async () => {
    seedV1Envelope();
    const handle = await mountHydrated();
    expect(handle.context().legacyStorageOperationsAllowed).toBe(false);
    const rawBefore = storage.getItem(STORAGE_KEY);

    let importResult: ReturnType<GymFlowValue['applyStorageImport']> | null = null;
    let restoreResult: ReturnType<GymFlowValue['restoreStorageBackup']> | null = null;
    let freshResult: ReturnType<GymFlowValue['startFreshStorage']> | null = null;
    await act(async () => {
      const context = handle.context();
      importResult = context.applyStorageImport({
        format: 'gymflow-backup',
        formatVersion: 1,
        exportedAt: '2026-07-23T09:00:00.000Z',
        appStorageVersion: 1,
        envelope: { v: 1, savedAt: '2026-07-23T09:00:00.000Z', data: {} as never },
      });
      restoreResult = context.restoreStorageBackup();
      freshResult = context.startFreshStorage();
    });
    await settle(10);

    for (const result of [importResult, restoreResult, freshResult]) {
      expect(result).toMatchObject({ ok: false, reason: 'blocked' });
    }
    // Operações antigas não sobrescrevem o v2 nem o histórico do IndexedDB.
    expect(storage.getItem(STORAGE_KEY)).toBe(rawBefore);
    expect(parsePhysicalEnvelope(storage.getItem(STORAGE_KEY) as string).status).toBe('v2');
    expect(handle.context().storageMode).toBe('hybrid-v2');
  });

  it('libera as operações antigas apenas quando o modo não é v2', async () => {
    storage.setItem(STORAGE_KEY, '{inválido');
    const handle = await mountHydrated();
    expect(handle.context().storageMode).toBe('blocked');
    expect(handle.context().legacyStorageOperationsAllowed).toBe(true);
    expect(storage.getItem(STORAGE_KEY)).toBe('{inválido');
  });
});

describe('GymFlowProvider real — capacidades honestas de recuperação', () => {
  async function breakActiveGeneration(): Promise<string> {
    const first = await mountHydrated();
    const generationId = persistedCore().historyStorage.generationId;
    await first.unmount();
    await withRawDatabase(
      [WORKOUT_HISTORY_STORE, METADATA_STORE, GENERATION_MANIFESTS_STORE],
      'readwrite',
      async (transaction) => {
        const historyStore = transaction.objectStore(WORKOUT_HISTORY_STORE);
        const keys = await rawRequest(historyStore.index('byGeneration').getAllKeys(generationId));
        await Promise.all(keys.map((key) => rawRequest(historyStore.delete(key))));
        await rawRequest(transaction.objectStore(GENERATION_MANIFESTS_STORE).delete(generationId));
        await rawRequest(transaction.objectStore(METADATA_STORE)
          .delete(`generationNextOrder:${generationId}`));
      },
    );
    return generationId;
  }

  it('v2 saudável não expõe nenhuma capacidade de recuperação', async () => {
    seedV1Envelope();
    const handle = await mountHydrated();
    expect(handle.context().storageMode).toBe('hybrid-v2');
    expect(handle.context().storageHealth.status).toBe('ready');
    expect(handle.context().storageRecoveryCapabilities).toEqual({
      canRestoreLegacyBackup: false,
      canStartFreshLegacy: false,
      canDownloadRaw: false,
      requiresHybridRecovery: false,
    });
  });

  it('v2 bloqueado não oferece restauração legada mesmo com o backup v1 congelado', async () => {
    seedV1Envelope();
    await breakActiveGeneration();
    const rawBefore = storage.getItem(STORAGE_KEY);

    const handle = await mountHydrated();
    const context = handle.context();
    expect(context.storageMode).toBe('blocked');
    expect(context.storageHealth.status).toBe('blocked');
    // O cutover deixou um backup v1 congelado: ele existe, mas não habilita nada.
    expect(context.storageHealth.hasBackup).toBe(true);
    expect(context.legacyStorageOperationsAllowed).toBe(false);
    expect(context.storageRecoveryCapabilities).toEqual({
      canRestoreLegacyBackup: false,
      canStartFreshLegacy: false,
      canDownloadRaw: true,
      requiresHybridRecovery: true,
    });
    expect(storage.getItem(STORAGE_KEY)).toBe(rawBefore);
  });

  it('os handlers continuam fail-closed em v2 bloqueado, sem tocar em localStorage nem no IndexedDB', async () => {
    seedV1Envelope({
      activeWorkout: null,
      activeWorkoutStartedAt: null,
      workoutHistory: [
        { ...makeActiveSession({ id: 'hist-1' }), status: 'completed', endedAt: STARTED_AT + 1 },
      ],
    });
    const first = await mountHydrated();
    const generationId = persistedCore().historyStorage.generationId;
    await first.unmount();

    // Corrompe só o manifest: os registros do histórico continuam no banco e
    // precisam sobreviver intactos a qualquer tentativa administrativa.
    await withRawDatabase([GENERATION_MANIFESTS_STORE], 'readwrite', async (transaction) => {
      await rawRequest(transaction.objectStore(GENERATION_MANIFESTS_STORE).delete(generationId));
    });

    const rawBefore = storage.getItem(STORAGE_KEY);
    const backupBefore = storage.getItem(`${STORAGE_KEY}:backup`);
    const sessionsBefore = await withRawDatabase(
      [WORKOUT_HISTORY_STORE],
      'readonly',
      (transaction) => rawRequest(transaction.objectStore(WORKOUT_HISTORY_STORE).getAll()),
    );

    const handle = await mountHydrated();
    expect(handle.context().storageMode).toBe('blocked');
    expect(handle.context().storageRecoveryCapabilities.requiresHybridRecovery).toBe(true);

    let restoreResult: ReturnType<GymFlowValue['restoreStorageBackup']> | null = null;
    let freshResult: ReturnType<GymFlowValue['startFreshStorage']> | null = null;
    let importResult: ReturnType<GymFlowValue['applyStorageImport']> | null = null;
    await act(async () => {
      const context = handle.context();
      restoreResult = context.restoreStorageBackup();
      freshResult = context.startFreshStorage();
      importResult = context.applyStorageImport({
        format: 'gymflow-backup',
        formatVersion: 1,
        exportedAt: '2026-07-23T09:00:00.000Z',
        appStorageVersion: 1,
        envelope: { v: 1, savedAt: '2026-07-23T09:00:00.000Z', data: {} as never },
      });
    });
    await settle(10);

    for (const result of [restoreResult, freshResult, importResult]) {
      expect(result).toMatchObject({ ok: false, reason: 'blocked' });
    }
    expect(storage.getItem(STORAGE_KEY)).toBe(rawBefore);
    expect(storage.getItem(`${STORAGE_KEY}:backup`)).toBe(backupBefore);
    expect(parsePhysicalEnvelope(storage.getItem(STORAGE_KEY) as string).status).toBe('v2');
    const sessionsAfter = await withRawDatabase(
      [WORKOUT_HISTORY_STORE],
      'readonly',
      (transaction) => rawRequest(transaction.objectStore(WORKOUT_HISTORY_STORE).getAll()),
    );
    expect(sessionsAfter).toEqual(sessionsBefore);
  });

  it('v1 corrompido preserva as capacidades legadas', async () => {
    storage.setItem(STORAGE_KEY, '{inválido');
    const handle = await mountHydrated();
    expect(handle.context().legacyStorageOperationsAllowed).toBe(true);
    expect(handle.context().storageRecoveryCapabilities).toEqual({
      canRestoreLegacyBackup: handle.context().storageHealth.hasBackup,
      canStartFreshLegacy: true,
      canDownloadRaw: true,
      requiresHybridRecovery: false,
    });
  });

  it('conclusão pendente em v2 não é tratada como corrupção física', async () => {
    seedV1Envelope();
    const handle = await mountHydrated();
    storage.failMainKeyWrites = true;
    await finishActiveWorkout(handle);

    const context = handle.context();
    // Protocolo do 002C preservado: erro de gravação, autosave suspenso e o
    // pedido de reabrir o app continuam exatamente como antes.
    expect(context.storageHealth.status).toBe('write-error');
    expect(context.storageHealth.issue?.message).toContain('Reabra o aplicativo');
    expect(context.storageMode).toBe('hybrid-v2');
    // E nenhuma ação legada é oferecida como se fosse a saída.
    expect(context.storageRecoveryCapabilities).toEqual({
      canRestoreLegacyBackup: false,
      canStartFreshLegacy: false,
      canDownloadRaw: false,
      requiresHybridRecovery: true,
    });
    expect((await readPendingReceipts()).map((receipt) => receipt.sessionId))
      .toEqual(['session-ativa']);
    storage.failMainKeyWrites = false;
  });

  it('sob Strict Mode as capacidades em v2 bloqueado não divergem', async () => {
    seedV1Envelope();
    await breakActiveGeneration();
    const handle = await mountHydrated({ strict: true });
    expect(handle.context().storageMode).toBe('blocked');
    expect(handle.context().storageRecoveryCapabilities).toEqual({
      canRestoreLegacyBackup: false,
      canStartFreshLegacy: false,
      canDownloadRaw: true,
      requiresHybridRecovery: true,
    });
  });
});
