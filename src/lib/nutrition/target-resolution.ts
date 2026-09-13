/**
 * GymFlow AI — Resolução de targets do bridge nutricional (NUT-004B)
 *
 * - nutritionProfile === null => MANUAL_ONLY / PROFILE_ABSENT.
 * - Perfil existe => evaluateNutritionGate(profile).
 * - allowAutomatedTargets === false => MANUAL_ONLY / AUTOMATION_BLOCKED.
 * - Permitido => calculateDailyTargets(profile) sem inventar timestamp de
 *   evento: contexto canônico determinístico do motor (computedAt ausente/null).
 * - Falha inesperada do motor => MANUAL_ONLY / TARGET_RESOLUTION_ERROR, sem
 *   fabricar targets e sem esconder o erro em fallback numérico.
 */

import type { NutritionProfile } from '../../types/nutrition';
import { calculateDailyTargets } from './engine';
import type { DailyTargets } from './engine-types';
import { NutritionEngineGateError } from './engine-types';
import {
  createEvaluatedGateSnapshot,
  createProfileAbsentSnapshot,
  type NutritionGateSnapshot,
} from './gate-snapshot';
import { evaluateNutritionGate } from './profile-gates';
import type { NutritionTargetUnavailableReason } from './ledger-types';

export type TargetResolution =
  | {
    targetState: 'AUTOMATED';
    targets: DailyTargets;
    gateSnapshot: NutritionGateSnapshot;
    allowAutomatedTargets: true;
  }
  | {
    targetState: 'MANUAL_ONLY';
    targets: null;
    targetUnavailableReason: NutritionTargetUnavailableReason;
    gateSnapshot: NutritionGateSnapshot;
    allowAutomatedTargets: false;
    cause?: unknown;
  };

export interface ResolveNutritionTargetsInput {
  profile: NutritionProfile | null;
  evaluatedAt: string;
}

export function resolveNutritionTargets(input: ResolveNutritionTargetsInput): TargetResolution {
  const { profile, evaluatedAt } = input;
  if (profile === null || profile === undefined) {
    return {
      targetState: 'MANUAL_ONLY',
      targets: null,
      targetUnavailableReason: 'PROFILE_ABSENT',
      gateSnapshot: createProfileAbsentSnapshot(evaluatedAt),
      allowAutomatedTargets: false,
    };
  }

  const gateResult = evaluateNutritionGate(profile);
  const snapshot = createEvaluatedGateSnapshot(gateResult, evaluatedAt);
  if (!gateResult.allowAutomatedTargets) {
    return {
      targetState: 'MANUAL_ONLY',
      targets: null,
      targetUnavailableReason: 'AUTOMATION_BLOCKED',
      gateSnapshot: snapshot,
      allowAutomatedTargets: false,
    };
  }

  try {
    // Sem computedAt explícito: computedAtSource 'absent', sem evento diário
    // fabricado no cold boot.
    const targets = calculateDailyTargets(profile);
    return {
      targetState: 'AUTOMATED',
      targets,
      gateSnapshot: snapshot,
      allowAutomatedTargets: true,
    };
  } catch (error) {
    if (error instanceof NutritionEngineGateError) {
      return {
        targetState: 'MANUAL_ONLY',
        targets: null,
        targetUnavailableReason: 'AUTOMATION_BLOCKED',
        gateSnapshot: snapshot,
        allowAutomatedTargets: false,
        cause: error,
      };
    }
    return {
      targetState: 'MANUAL_ONLY',
      targets: null,
      targetUnavailableReason: 'TARGET_RESOLUTION_ERROR',
      gateSnapshot: snapshot,
      allowAutomatedTargets: false,
      cause: error,
    };
  }
}
