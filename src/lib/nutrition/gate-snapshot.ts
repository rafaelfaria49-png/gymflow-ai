/**
 * GymFlow AI — Snapshot discriminado do gate nutricional (NUT-004B)
 *
 * Não cria nenhum novo NutritionGateStatus. União discriminada:
 * - EVALUATED: NutritionGateResult canônico completo + evaluatedAt ISO
 *   explícito; profileHash somente se já houver helper canônico seguro
 *   (nenhum existe nesta slice — campo permanece ausente).
 * - PROFILE_ABSENT: nenhuma status inventada; manual permitido, automático
 *   bloqueado, evaluatedAt ISO, profileHash null/ausente.
 */

import type { NutritionGateResult } from '../../types/nutrition';
import { isStrictIsoUtcTimestamp } from './engine-validation';

const GATE_STATUSES: readonly string[] = Object.freeze([
  'NORMAL_FLOW',
  'LIMITED_GUIDANCE',
  'PROFESSIONAL_REFERRAL',
  'BLOCK_AUTOMATIC_TARGET',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface EvaluatedNutritionGateSnapshot {
  kind: 'EVALUATED';
  result: NutritionGateResult;
  evaluatedAt: string;
  profileHash?: string | null;
}

export interface ProfileAbsentGateSnapshot {
  kind: 'PROFILE_ABSENT';
  allowManualTracking: true;
  allowAutomatedTargets: false;
  evaluatedAt: string;
  profileHash: null;
}

export type NutritionGateSnapshot = EvaluatedNutritionGateSnapshot | ProfileAbsentGateSnapshot;

function isGateResult(value: unknown): value is NutritionGateResult {
  if (!isRecord(value)) return false;
  if (typeof value['status'] !== 'string' || !GATE_STATUSES.includes(value['status'])) return false;
  if (!Array.isArray(value['reasons'])) return false;
  if (!(value['reasons'] as unknown[]).every((entry) => typeof entry === 'string')) return false;
  if (typeof value['userNoticeKey'] !== 'string') return false;
  if (typeof value['allowManualTracking'] !== 'boolean') return false;
  if (typeof value['allowAutomatedTargets'] !== 'boolean') return false;
  if (value['suggestedAction'] !== undefined && typeof value['suggestedAction'] !== 'string') {
    return false;
  }
  return true;
}

export function createEvaluatedGateSnapshot(
  result: NutritionGateResult,
  evaluatedAt: string,
): EvaluatedNutritionGateSnapshot {
  if (!isGateResult(result)) {
    throw new Error('Snapshot EVALUATED exige um NutritionGateResult canônico completo.');
  }
  if (!isStrictIsoUtcTimestamp(evaluatedAt)) {
    throw new Error('Snapshot EVALUATED exige evaluatedAt ISO UTC explícito.');
  }
  return { kind: 'EVALUATED', result, evaluatedAt };
}

export function createProfileAbsentSnapshot(evaluatedAt: string): ProfileAbsentGateSnapshot {
  if (!isStrictIsoUtcTimestamp(evaluatedAt)) {
    throw new Error('Snapshot PROFILE_ABSENT exige evaluatedAt ISO UTC explícito.');
  }
  return {
    kind: 'PROFILE_ABSENT',
    allowManualTracking: true,
    allowAutomatedTargets: false,
    evaluatedAt,
    profileHash: null,
  };
}

export function isNutritionGateSnapshot(value: unknown): value is NutritionGateSnapshot {
  if (!isRecord(value)) return false;
  if (value['kind'] === 'EVALUATED') {
    if (!isGateResult(value['result'])) return false;
    if (!isStrictIsoUtcTimestamp(value['evaluatedAt'])) return false;
    if (
      value['profileHash'] !== undefined
      && value['profileHash'] !== null
      && typeof value['profileHash'] !== 'string'
    ) {
      return false;
    }
    return true;
  }
  if (value['kind'] === 'PROFILE_ABSENT') {
    if (value['allowManualTracking'] !== true) return false;
    if (value['allowAutomatedTargets'] !== false) return false;
    if (!isStrictIsoUtcTimestamp(value['evaluatedAt'])) return false;
    if (value['profileHash'] !== null && value['profileHash'] !== undefined) return false;
    // Nenhuma NutritionGateStatus inventada atravessa neste caminho.
    if ('status' in value || 'result' in value) return false;
    return true;
  }
  return false;
}
