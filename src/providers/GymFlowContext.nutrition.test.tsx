import { IDBFactory } from 'fake-indexeddb';
import React, { StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { GymFlowProvider, STORAGE_KEY, useGymFlow } from './GymFlowContext';
import { MONOLITHIC_STORAGE_VERSION } from '../lib/storage-types';
import { getCivilDateString } from '../lib/nutrition-civil-date';
import type { UserProfile } from '../types';

type GymFlowValue = ReturnType<typeof useGymFlow>;

class MemoryLocalStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

let storage: MemoryLocalStorage;
let windowStub: EventTarget & { localStorage: MemoryLocalStorage; location: { reload: () => void } };
let documentStub: EventTarget & { visibilityState: string };
const originalWindow = Reflect.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Reflect.getOwnPropertyDescriptor(globalThis, 'document');
const originalIndexedDb = Reflect.getOwnPropertyDescriptor(globalThis, 'indexedDB');

function freezeClockAt(instant: Date): void {
  vi.useFakeTimers({ toFake: ['Date'], now: instant });
}

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Atleta Teste',
    email: 'atleta@gymflow.ai',
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
    points: 100,
    streak: 3,
    waterIntake: 0,
    waterGoal: 3000,
    premiumStatus: 'free',
    weeklyPlan: [],
    ...overrides,
  };
}

function seedPersistedStorage(dataOverrides: Record<string, unknown> = {}): void {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      v: MONOLITHIC_STORAGE_VERSION,
      savedAt: '2026-09-07T10:00:00.000Z',
      data: {
        user: makeUser(),
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
        ...dataOverrides,
      },
    })
  );
}

interface Mounted {
  renderer: TestRenderer.ReactTestRenderer;
  context: () => GymFlowValue;
  unmount: () => Promise<void>;
}

const mountedInstances: Mounted[] = [];

async function mountProvider(): Promise<Mounted> {
  let contextValue: GymFlowValue | null = null;

  const Probe = () => {
    contextValue = useGymFlow();
    return null;
  };

  const tree = (
    <ToastProvider>
      <GymFlowProvider>
        <Probe />
      </GymFlowProvider>
    </ToastProvider>
  );

  let renderer: TestRenderer.ReactTestRenderer | null = null;
  await act(async () => {
    renderer = TestRenderer.create(<StrictMode>{tree}</StrictMode>);
  });
  // NUT-004B: o cold boot (IDB + migração + ensureToday) assenta em microtasks
  // e eventos do fake-indexeddb; timers seguem reais para não travar o IDB.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  const handle: Mounted = {
    renderer: renderer as unknown as TestRenderer.ReactTestRenderer,
    context: () => {
      if (!contextValue) throw new Error('Contexto não inicializado');
      return contextValue;
    },
    unmount: async () => {
      await act(async () => {
        renderer?.unmount();
      });
    },
  };

  mountedInstances.push(handle);
  return handle;
}

describe('GymFlowContext — Nutrição e Idempotência de XP (NUT-001)', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    storage = new MemoryLocalStorage();
    windowStub = new EventTarget() as EventTarget & {
      localStorage: MemoryLocalStorage;
      location: { reload: () => void };
    };
    windowStub.localStorage = storage;
    windowStub.location = { reload: vi.fn() };
    documentStub = new EventTarget() as EventTarget & { visibilityState: string };
    documentStub.visibilityState = 'visible';

    Reflect.defineProperty(globalThis, 'window', {
      value: windowStub,
      configurable: true,
      writable: true,
    });
    Reflect.defineProperty(globalThis, 'document', {
      value: documentStub,
      configurable: true,
      writable: true,
    });
    Reflect.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
    Reflect.defineProperty(globalThis, 'indexedDB', {
      value: new IDBFactory(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    while (mountedInstances.length > 0) {
      const handle = mountedInstances.pop();
      await handle?.unmount();
    }
    if (originalWindow) {
      Reflect.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
    if (originalDocument) {
      Reflect.defineProperty(globalThis, 'document', originalDocument);
    } else {
      Reflect.deleteProperty(globalThis, 'document');
    }
    if (originalIndexedDb) {
      Reflect.defineProperty(globalThis, 'indexedDB', originalIndexedDb);
    } else {
      Reflect.deleteProperty(globalThis, 'indexedDB');
    }
  });

  it('nutrition inicia em zeros sem storage (elimina seed demo 1420/110/150/45/1200)', async () => {
    const app = await mountProvider();
    const ctx = app.context();

    expect(ctx.nutrition).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      water: 0,
    });
  });

  it('dados reais persistidos continuam hidratando corretamente', async () => {
    seedPersistedStorage({
      nutrition: {
        calories: 1850,
        protein: 140,
        carbs: 190,
        fat: 55,
        water: 2500,
        lastMacroLoggedDate: '2026-09-06',
      },
    });

    const app = await mountProvider();
    const ctx = app.context();

    expect(ctx.nutrition.calories).toBe(1850);
    expect(ctx.nutrition.protein).toBe(140);
    expect(ctx.nutrition.carbs).toBe(190);
    expect(ctx.nutrition.fat).toBe(55);
    expect(ctx.nutrition.water).toBe(2500);
  });

  it('input macro válido é registrado e soma aos valores existentes', async () => {
    const app = await mountProvider();
    const ctx = app.context();

    let accepted = false;
    await act(async () => {
      accepted = await ctx.logMacros(500, 40, 60, 10);
    });

    expect(accepted).toBe(true);
    expect(app.context().nutrition.calories).toBe(500);
    expect(app.context().nutrition.protein).toBe(40);
    expect(app.context().nutrition.carbs).toBe(60);
    expect(app.context().nutrition.fat).toBe(10);

    // Segundo registro válido soma
    await act(async () => {
      accepted = await app.context().logMacros(300, 20, 30, 5);
    });

    expect(accepted).toBe(true);
    expect(app.context().nutrition.calories).toBe(800);
    expect(app.context().nutrition.protein).toBe(60);
    expect(app.context().nutrition.carbs).toBe(90);
    expect(app.context().nutrition.fat).toBe(15);
  });

  it('calorias zero, negativas, NaN e fora do range são rejeitadas sem mutar estado nem conceder XP', async () => {
    seedPersistedStorage({
      user: makeUser({ xp: 100 }),
      nutrition: { calories: 500, protein: 30, carbs: 50, fat: 10, water: 0 },
    });

    const app = await mountProvider();
    const initialUserXp = app.context().user!.xp;

    // Calorias zero
    let result = false;
    await act(async () => {
      result = await app.context().logMacros(0, 30, 50, 10);
    });
    expect(result).toBe(false);

    // Calorias negativas
    await act(async () => {
      result = await app.context().logMacros(-100, 30, 50, 10);
    });
    expect(result).toBe(false);

    // Calorias NaN
    await act(async () => {
      result = await app.context().logMacros(Number.NaN, 30, 50, 10);
    });
    expect(result).toBe(false);

    // Calorias >= 15000
    await act(async () => {
      result = await app.context().logMacros(15000, 30, 50, 10);
    });
    expect(result).toBe(false);

    // Nenhuma mutação ocorreu
    expect(app.context().nutrition.calories).toBe(500);
    expect(app.context().nutrition.protein).toBe(30);
    expect(app.context().user!.xp).toBe(initialUserXp);
  });

  it('macros negativos, NaN ou out-of-range são rejeitados sem alterar nutrição', async () => {
    seedPersistedStorage({
      nutrition: { calories: 500, protein: 30, carbs: 50, fat: 10, water: 0 },
    });

    const app = await mountProvider();

    // Proteína negativa
    let result = false;
    await act(async () => {
      result = await app.context().logMacros(400, -5, 50, 10);
    });
    expect(result).toBe(false);

    // Carbos >= 1000
    await act(async () => {
      result = await app.context().logMacros(400, 30, 1000, 10);
    });
    expect(result).toBe(false);

    // Gordura NaN
    await act(async () => {
      result = await app.context().logMacros(400, 30, 50, Number.NaN);
    });
    expect(result).toBe(false);

    // Estado permanece inalterado
    expect(app.context().nutrition.calories).toBe(500);
    expect(app.context().nutrition.protein).toBe(30);
    expect(app.context().nutrition.carbs).toBe(50);
    expect(app.context().nutrition.fat).toBe(10);
  });

  it('primeiro registro válido do dia concede até 20 XP; segundo registro no mesmo dia concede 0 XP adicional', async () => {
    seedPersistedStorage({
      user: makeUser({ xp: 200 }),
    });

    const app = await mountProvider();
    const initialXp = app.context().user!.xp;

    // 1º registro válido do dia -> +20 XP
    let success = false;
    await act(async () => {
      success = await app.context().logMacros(400, 30, 50, 10);
    });
    expect(success).toBe(true);
    expect(app.context().user!.xp).toBe(initialXp + 20);

    // 2º registro válido no mesmo dia -> 0 XP adicional
    await act(async () => {
      success = await app.context().logMacros(350, 25, 40, 8);
    });
    expect(success).toBe(true);
    expect(app.context().user!.xp).toBe(initialXp + 20); // Continua 220 XP

    // Nutrição somou ambos
    expect(app.context().nutrition.calories).toBe(750);
    expect(app.context().nutrition.protein).toBe(55);
  });

  it('a trava de XP por data civil sobrevive a reload/hidratação de storage', async () => {
    const today = getCivilDateString();

    // Simula estado salvo onde o usuário já registrou refeição hoje
    seedPersistedStorage({
      user: makeUser({ xp: 500 }),
      nutrition: {
        calories: 600,
        protein: 45,
        carbs: 70,
        fat: 15,
        water: 1000,
        lastMacroLoggedDate: today,
      },
    });

    const app = await mountProvider();
    expect(app.context().user!.xp).toBe(500);

    // Tentativa de novo registro no mesmo dia após reload
    let success = false;
    await act(async () => {
      success = await app.context().logMacros(300, 25, 30, 5);
    });

    expect(success).toBe(true);
    // Não concede XP adicional porque a trava sobreviveu à hidratação
    expect(app.context().user!.xp).toBe(500);
    // Mas a nutrição é somada com sucesso
    expect(app.context().nutrition.calories).toBe(900);
    expect(app.context().nutrition.protein).toBe(70);
  });

  it('no dia seguinte civil, o primeiro registro válido volta a conceder até 20 XP', async () => {
    freezeClockAt(new Date('2026-09-07T12:00:00Z'));

    // Estado com último registro em dia anterior
    seedPersistedStorage({
      user: makeUser({ xp: 300 }),
      nutrition: {
        calories: 2000,
        protein: 150,
        carbs: 220,
        fat: 60,
        water: 3000,
        lastMacroLoggedDate: '2026-09-06',
      },
    });

    const app = await mountProvider();

    // Hoje é outro dia civil (2026-09-07)
    let success = false;
    await act(async () => {
      success = await app.context().logMacros(450, 35, 50, 12);
    });

    expect(success).toBe(true);
    expect(app.context().user!.xp).toBe(320); // +20 XP concedido
  });

  it('mudança de data civil permite nova concessão diária de forma determinística (fake timers)', async () => {
    freezeClockAt(new Date('2026-09-07T12:00:00Z'));

    seedPersistedStorage({
      user: makeUser({ xp: 200 }),
    });

    const app = await mountProvider();
    const initialXp = app.context().user!.xp;

    // Dia 1 (2026-09-07): 1º registro -> +20 XP
    let success = false;
    await act(async () => {
      success = await app.context().logMacros(400, 30, 50, 10);
    });
    expect(success).toBe(true);
    expect(app.context().user!.xp).toBe(initialXp + 20);

    // Dia 1 (2026-09-07): 2º registro no mesmo dia -> 0 XP adicional
    await act(async () => {
      success = await app.context().logMacros(300, 20, 30, 5);
    });
    expect(success).toBe(true);
    expect(app.context().user!.xp).toBe(initialXp + 20);

    // Avança relógio para Dia 2 (2026-09-08)
    vi.setSystemTime(new Date('2026-09-08T12:00:00Z'));

    // Dia 2: 1º registro -> +20 XP adicional
    await act(async () => {
      success = await app.context().logMacros(500, 35, 60, 15);
    });
    expect(success).toBe(true);
    expect(app.context().user!.xp).toBe(initialXp + 40);

    // Dia 2: 2º registro -> 0 XP adicional
    await act(async () => {
      success = await app.context().logMacros(200, 15, 20, 5);
    });
    expect(success).toBe(true);
    expect(app.context().user!.xp).toBe(initialXp + 40);
  });

  it('dois logs no mesmo dia civil local concedem XP uma única vez; próximo dia civil concede novamente', async () => {
    // TZ-independent: instantes construídos no calendário LOCAL do próprio processo
    // (new Date(a, m, d, h, min)), sem pressupor offset UTC-3. A conversão específica
    // America/Sao_Paulo 20:59/21:01 atravessando UTC já é provada em
    // src/lib/nutrition-civil-date.test.ts; aqui o contrato é a deduplicação de XP
    // por DATA CIVIL LOCAL do provider (logMacros -> getCivilDateString()).
    freezeClockAt(new Date(2026, 8, 8, 20, 59));

    seedPersistedStorage({
      user: makeUser({ xp: 100 }),
    });

    const app = await mountProvider();
    const initialXp = app.context().user!.xp;

    // 1º registro do dia civil local -> +20 XP concedido
    let success = false;
    await act(async () => {
      success = await app.context().logMacros(400, 30, 50, 10);
    });
    expect(success).toBe(true);
    expect(app.context().user!.xp).toBe(initialXp + 20);

    // Avança dentro do MESMO dia civil local (ainda 08/09 no calendário do processo)
    vi.setSystemTime(new Date(2026, 8, 8, 21, 1));

    // 2º registro no mesmo dia civil local -> 0 XP adicional
    await act(async () => {
      success = await app.context().logMacros(300, 20, 30, 5);
    });
    expect(success).toBe(true);
    expect(app.context().user!.xp).toBe(initialXp + 20); // Permanece 120 XP!

    // Avança relógio para o dia civil seguinte local: 09/09 08:00
    vi.setSystemTime(new Date(2026, 8, 9, 8, 0));

    // 1º registro do novo dia civil -> +20 XP concedido
    await act(async () => {
      success = await app.context().logMacros(450, 35, 50, 12);
    });
    expect(success).toBe(true);
    expect(app.context().user!.xp).toBe(initialXp + 40); // 140 XP!
  });

  it('dateOverride não existe na API pública de logMacros (contrato limpo de 4 parâmetros)', async () => {
    const app = await mountProvider();
    const logMacrosFn = app.context().logMacros;

    // A função deve ter aridade de 4 parâmetros na assinatura de produção
    expect(logMacrosFn.length).toBe(4);
  });

  it('água manual zero, negativa ou inválida não altera estado', async () => {
    seedPersistedStorage({
      user: makeUser({ waterIntake: 500 }),
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 500 },
    });

    const app = await mountProvider();

    let accepted = false;
    await act(async () => {
      accepted = await app.context().logWater(0);
    });
    expect(accepted).toBe(false);

    await act(async () => {
      accepted = await app.context().logWater(-250);
    });
    expect(accepted).toBe(false);

    await act(async () => {
      accepted = await app.context().logWater(Number.NaN);
    });
    expect(accepted).toBe(false);

    expect(app.context().nutrition.water).toBe(500);
    expect(app.context().user!.waterIntake).toBe(500);
  });

  it('água positiva é registrada e atualiza estado de nutrição e do usuário', async () => {
    seedPersistedStorage({
      user: makeUser({ waterIntake: 500, waterGoal: 3000 }),
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 500 },
    });

    const app = await mountProvider();

    let accepted = false;
    await act(async () => {
      accepted = await app.context().logWater(250);
    });

    expect(accepted).toBe(true);
    expect(app.context().nutrition.water).toBe(750);
    expect(app.context().user!.waterIntake).toBe(750);
  });

  it('meta de água batida concede 40 XP e respeita teto de 60 XP de D-NUT-07 somado aos macros', async () => {
    seedPersistedStorage({
      user: makeUser({ xp: 100, points: 100, waterIntake: 2800, waterGoal: 3000 }),
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 2800 },
      // Conquista já desbloqueada em sessão anterior para isolar o XP diário habitual
      achievements: [{ id: 'ach_4', name: 'Hidratação Nível Elite', description: '', icon: '💧', unlocked: true }],
    });

    const app = await mountProvider();
    const initialXp = app.context().user!.xp;

    // 1. Atinge a meta de água (2800 + 250 = 3050 >= 3000) -> concede 40 XP
    let acceptedWater = false;
    await act(async () => {
      acceptedWater = await app.context().logWater(250);
    });
    expect(acceptedWater).toBe(true);
    const xpAfterWater = app.context().user!.xp;
    expect(xpAfterWater - initialXp).toBe(40);

    // 2. Registra macros no mesmo dia -> concede 20 XP
    let acceptedMacro = false;
    await act(async () => {
      acceptedMacro = await app.context().logMacros(450, 30, 45, 12);
    });
    expect(acceptedMacro).toBe(true);
    const xpAfterMacro = app.context().user!.xp;
    expect(xpAfterMacro - xpAfterWater).toBe(20);

    // Soma diária total do domínio de nutrição: 40 + 20 = 60 XP (teto D-NUT-07)
    expect(xpAfterMacro - initialXp).toBe(60);

    // 3. Segundo registro de macros no mesmo dia: não concede novo XP
    await act(async () => {
      await app.context().logMacros(300, 20, 30, 8);
    });
    expect(app.context().user!.xp - initialXp).toBe(60);

    // 4. Registro adicional de água quando já acima da meta: não re-concede XP
    await act(async () => {
      await app.context().logWater(250);
    });
    expect(app.context().user!.xp - initialXp).toBe(60);
  });

  it('meta de água desbloqueia conquista ach_4 quando ainda bloqueada', async () => {
    seedPersistedStorage({
      user: makeUser({ xp: 100, points: 100, waterIntake: 2800, waterGoal: 3000 }),
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 2800 },
      achievements: [{ id: 'ach_4', name: 'Hidratação Nível Elite', description: '', icon: '💧', unlocked: false }],
    });

    const app = await mountProvider();

    await act(async () => {
      await app.context().logWater(250);
    });

    const ach4 = app.context().achievements.find((a) => a.id === 'ach_4');
    expect(ach4?.unlocked).toBe(true);
  });

  it('a concessão de XP de água é idempotente após reload no mesmo dia e persiste lastWaterXpDate', async () => {
    freezeClockAt(new Date('2026-09-08T14:00:00.000Z'));
    const today = getCivilDateString();

    seedPersistedStorage({
      user: makeUser({ xp: 100, points: 100, waterIntake: 2800, waterGoal: 3000 }),
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 2800 },
      achievements: [{ id: 'ach_4', name: 'Hidratação Nível Elite', description: '', icon: '💧', unlocked: true }],
    });

    const app = await mountProvider();
    const initialXp = app.context().user!.xp;

    // Atinge meta de água pela primeira vez hoje -> +40 XP
    await act(async () => {
      await app.context().logWater(300); // 2800 + 300 = 3100 >= 3000
    });
    expect(app.context().user!.xp - initialXp).toBe(40);
    expect(app.context().nutrition.lastWaterXpDate).toBe(today);

    // Simula reload/hidratação com o estado persistido contendo lastWaterXpDate
    // NUT-004B: isola o IDB do segundo boot (reload real parte de storage
    // local persistido, sem carregar o ledger em memória do boot anterior).
    await app.unmount();
    Reflect.defineProperty(globalThis, 'indexedDB', {
      value: new IDBFactory(),
      configurable: true,
      writable: true,
    });
    seedPersistedStorage({
      user: makeUser({ xp: 140, points: 140, waterIntake: 3100, waterGoal: 3000 }),
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 3100, lastWaterXpDate: today },
      achievements: [{ id: 'ach_4', name: 'Hidratação Nível Elite', description: '', icon: '💧', unlocked: true }],
    });

    const reloadedApp = await mountProvider();
    expect(reloadedApp.context().user!.xp).toBe(140);
    expect(reloadedApp.context().nutrition.lastWaterXpDate).toBe(today);

    // Nova chamada no mesmo dia não re-concede XP
    await act(async () => {
      await reloadedApp.context().logWater(200);
    });
    expect(reloadedApp.context().user!.xp).toBe(140);
  });

  it('snapshot legado sem lastWaterXpDate continua válido e hidrata perfeitamente', async () => {
    seedPersistedStorage({
      user: makeUser({ xp: 300, waterIntake: 1500, waterGoal: 2500 }),
      nutrition: { calories: 1200, protein: 90, carbs: 110, fat: 40, water: 1500 }, // snapshot legado sem datas
    });

    const app = await mountProvider();
    const ctx = app.context();

    expect(ctx.nutrition.calories).toBe(1200);
    expect(ctx.nutrition.protein).toBe(90);
    expect(ctx.nutrition.carbs).toBe(110);
    expect(ctx.nutrition.fat).toBe(40);
    expect(ctx.nutrition.water).toBe(1500);
    expect(ctx.nutrition.lastWaterXpDate).toBeUndefined();
    expect(ctx.user!.xp).toBe(300);

    // Pode atingir a meta e registrar o marcador pela primeira vez
    await act(async () => {
      await ctx.logWater(1000); // 1500 + 1000 = 2500 >= 2500
    });
    expect(app.context().user!.xp).toBe(340); // +40 XP
    expect(app.context().nutrition.lastWaterXpDate).toBe(getCivilDateString());
  });

  it('nova transição de limiar no mesmo dia não concede recompensa duplicada', async () => {
    freezeClockAt(new Date('2026-09-08T10:00:00.000Z'));
    const today = getCivilDateString();

    seedPersistedStorage({
      user: makeUser({ xp: 100, waterIntake: 1900, waterGoal: 2000 }),
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 1900 },
      achievements: [{ id: 'ach_4', name: 'Hidratação Nível Elite', description: '', icon: '💧', unlocked: true }],
    });

    const app = await mountProvider();
    expect(app.context().user!.xp).toBe(100);

    // 1ª vez cruza 2000ml -> +40 XP
    await act(async () => {
      await app.context().logWater(200); // 2100 >= 2000
    });
    expect(app.context().user!.xp).toBe(140);
    expect(app.context().nutrition.lastWaterXpDate).toBe(today);

    // Usuário já com lastWaterXpDate registrado para hoje
    await act(async () => {
      await app.context().logWater(500);
    });
    expect(app.context().user!.xp).toBe(140);
  });
});
