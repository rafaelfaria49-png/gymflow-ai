/**
 * GymFlow AI — Testes do AiMealAssistantModal (NUT-007)
 *
 * Prova: USER_CONFIRMATION_REQUIRED (CTA em 2 etapas, sem auto-write),
 * estados honestos (provider-unavailable, clinical-gate-blocked sem chamar
 * rede) e números renderizados a partir da proposta grounded.
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui/Toast';
import { AiMealAssistantModal } from './AiMealAssistantModal';

const contextHolder: { current: unknown } = { current: null };

vi.mock('../../providers/GymFlowContext', () => ({
  useGymFlow: () => contextHolder.current,
}));

function makeTargets() {
  return {
    id: 'dt_test',
    engineVersion: '1.0.0',
    formulaVersion: 'mifflin-st-jeor-v1',
    inputSnapshotHash: 'abc',
    computedAt: null,
    computedAtSource: 'absent',
    computedReason: 'profile_update',
    targetCalories: 2500,
    targetProteinGrams: 160,
    targetCarbsGrams: 300,
    targetFatGrams: 70,
    targetWaterMl: 3000,
    bmrKcal: 1700,
    tdeeKcal: 2500,
    energyBalanceKcal: 0,
    scientificStatus: 'PROVISIONAL_PENDING_PROFESSIONAL_REVIEW',
    isLimitedGuidance: false,
    appliedCaloricFloor: 1500,
    effectiveProteinGramsPerKg: 2,
    effectiveFatGramsPerKg: 0.85,
    macroReconciliation: {
      macroCalories: 2500,
      targetCalories: 2500,
      deltaKcal: 0,
      roundingToleranceKcal: 2,
      isReconciled: true,
      unmetConstraints: [],
    },
    estimationTolerance: { relative: 0, reason: 'NONE', targetCaloriesLowerKcal: 2500, targetCaloriesUpperKcal: 2500 },
  };
}

function automatedDay() {
  return {
    id: 'day-2026-09-16',
    date: '2026-09-16',
    timezone: 'America/Sao_Paulo',
    meals: [],
    hydrationEntries: [],
    isClosed: false,
    closedAt: null,
    targetState: 'AUTOMATED',
    targets: makeTargets(),
    gateSnapshot: {
      kind: 'EVALUATED',
      result: {
        status: 'NORMAL_FLOW',
        reasons: [],
        userNoticeKey: 'NUTRITION_GATE_NORMAL_FLOW',
        allowManualTracking: true,
        allowAutomatedTargets: true,
        suggestedAction: 'PROCEED',
      },
      evaluatedAt: '2026-09-16T12:00:00.000Z',
    },
  };
}

function blockedDay() {
  return {
    ...automatedDay(),
    targetState: 'MANUAL_ONLY',
    targets: null,
    targetUnavailableReason: 'AUTOMATION_BLOCKED',
    gateSnapshot: {
      kind: 'EVALUATED',
      result: {
        status: 'BLOCK_AUTOMATIC_TARGET',
        reasons: ['PREGNANCY'],
        userNoticeKey: 'NUTRITION_GATE_BLOCK_AUTOMATIC_TARGET',
        allowManualTracking: true,
        allowAutomatedTargets: false,
        suggestedAction: 'CONSULT_DIETITIAN',
      },
      evaluatedAt: '2026-09-16T12:00:00.000Z',
    },
  };
}

function buttonText(button: TestRenderer.ReactTestInstance): string {
  return JSON.stringify(button.props.children) ?? '';
}

function findButton(root: TestRenderer.ReactTestInstance, snippet: string): TestRenderer.ReactTestInstance {
  const found = root.findAllByType('button').find((button) => buttonText(button).includes(snippet));
  if (!found) throw new Error(`botão contendo "${snippet}" não encontrado`);
  return found;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
  contextHolder.current = null;
});

describe('NUT-007 modal: confirmação explícita antes de qualquer write', () => {
  it('CTA "Adicionar ao Diário" exige confirmação em 2 etapas (sem auto-write)', async () => {
    const logFoodReference = vi.fn().mockResolvedValue(true);
    contextHolder.current = {
      nutritionDay: automatedDay(),
      nutritionProfile: { dietaryPattern: 'omnivore', goal: 'maintenance' },
      logFoodReference,
    };
    const proposal = {
      useCase: 'complete_protein',
      items: [
        {
          foodReferenceId: 'br-peito-frango-grelhado',
          name: 'Peito de frango grelhado (sem pele)',
          grams: 100,
          servingDescription: '100g',
          culinaryNote: 'grelhado com limão',
          computed: { calories: 159, protein: 32, carbs: 0, fat: 3.6 },
        },
      ],
      totals: { calories: 159, protein: 32, carbs: 0, fat: 3.6 },
    };
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'ok', proposal }),
    });
    vi.stubGlobal('fetch', fetchStub);

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(
        <ToastProvider>
          <AiMealAssistantModal open onClose={() => undefined} />
        </ToastProvider>,
      );
    });
    const root = renderer!.root;

    await act(async () => {
      findButton(root, 'Perguntar à IA').props.onClick();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Números da proposta grounded renderizados (recalculados, não do modelo).
    expect(JSON.stringify(renderer!.toJSON())).toContain('159 kcal');

    // 1ª etapa: abre a confirmação — NADA foi gravado.
    act(() => {
      findButton(root, 'Adicionar ao Diário').props.onClick();
    });
    expect(logFoodReference).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer!.toJSON())).toContain('Confirmar inclusão');

    // 2ª etapa: confirmação explícita grava UMA vez via NUT-006.
    await act(async () => {
      findButton(root, 'Confirmar inclusão').props.onClick();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(logFoodReference).toHaveBeenCalledTimes(1);
    const [reference, grams, meal] = logFoodReference.mock.calls[0] as [unknown, number, string];
    expect((reference as { id: string }).id).toBe('br-peito-frango-grelhado');
    expect(grams).toBe(100);
    expect(meal).toBe('lunch');
  });

  it('provider indisponível mostra AI_UNAVAILABLE honesto (sem fake)', async () => {
    contextHolder.current = {
      nutritionDay: automatedDay(),
      nutritionProfile: null,
      logFoodReference: vi.fn(),
    };
    const fetchStub = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ status: 'failure', code: 'PROVIDER_UNAVAILABLE', message: 'off' }),
    });
    vi.stubGlobal('fetch', fetchStub);

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(
        <ToastProvider>
          <AiMealAssistantModal open onClose={() => undefined} />
        </ToastProvider>,
      );
    });
    await act(async () => {
      findButton(renderer!.root, 'Perguntar à IA').props.onClick();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain('IA indisponível');
  });

  it('gate clínico bloqueado NÃO chama a rede e mostra estado clínico', async () => {
    contextHolder.current = {
      nutritionDay: blockedDay(),
      nutritionProfile: null,
      logFoodReference: vi.fn(),
    };
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(
        <ToastProvider>
          <AiMealAssistantModal open onClose={() => undefined} />
        </ToastProvider>,
      );
    });
    await act(async () => {
      findButton(renderer!.root, 'Perguntar à IA').props.onClick();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(fetchStub).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer!.toJSON())).toContain('Orientação automática pausada');
  });
});
