// GOAL-17B-002E-E7A5 — política pura de produto para retenção MVP.
//
// Retenção é MANUAL. Esta camada não escolhe candidata, não dispara cleanup,
// não lê idade/espaço/timestamp/ID lexical como identidade e não autoriza
// execução. Entrada interna pode nomear gerações; a saída pública é sanitizada.
// Preview e confirmação humana futura são contratuais, sem UI neste GOAL.

export const STORAGE_RETENTION_PRODUCT_POLICY = Object.freeze({
  mode: 'manual' as const,
  maxGenerationsPerOperation: 1 as const,
  automaticCleanup: false,
  backgroundCleanup: false,
  ageTrigger: false,
  spaceTrigger: false,
  bootTrigger: false,
  timerTrigger: false,
  keepN: false,
  previewRequired: true,
  humanConfirmationRequired: true,
  selectionIsNotConfirmation: true,
});

export const STORAGE_RETENTION_IRREVERSIBILITY_NOTICE = Object.freeze(
  'A exclusao futura e irreversivel e exige confirmacao humana separada da selecao.',
);

export type StorageRetentionPolicyStatus =
  | 'candidate-eligible'
  | 'blocked-current-generation'
  | 'blocked-immediate-predecessor'
  | 'blocked-protected-reference'
  | 'blocked-ambiguous'
  | 'blocked-not-explicitly-selected'
  | 'blocked-multiple-candidates'
  | 'blocked-policy-disabled';

export type StorageRetentionPolicyReason =
  | 'candidate-eligible'
  | 'current-generation-protected'
  | 'immediate-predecessor-protected'
  | 'protected-reference'
  | 'ambiguous-safety'
  | 'not-explicitly-selected'
  | 'multiple-candidates'
  | 'policy-disabled';

export interface StorageRetentionPolicyPreview {
  readonly associatedSessionCount: number;
  readonly associatedDataCount: number;
  readonly immediatePredecessorPreserved: true;
  readonly irreversible: true;
  readonly irreversibilityNotice: typeof STORAGE_RETENTION_IRREVERSIBILITY_NOTICE;
  readonly identityIndependentOfAge: true;
  readonly identityIndependentOfSize: true;
}

interface StorageRetentionPolicyBase {
  readonly reason: StorageRetentionPolicyReason;
  readonly mode: 'manual';
  readonly maxGenerationsPerOperation: 1;
  readonly keepN: false;
  readonly ageSelectsIdentity: false;
  readonly sizeSelectsIdentity: false;
  readonly previewRequired: true;
  readonly humanConfirmationRequired: true;
  readonly selectionIsNotConfirmation: true;
  readonly ownerTokenRequired: true;
  readonly executionAuthorized: false;
  readonly deleteAuthorized: false;
}

export interface StorageRetentionPolicyEligible extends StorageRetentionPolicyBase {
  readonly status: 'candidate-eligible';
  readonly reason: 'candidate-eligible';
  readonly preview: StorageRetentionPolicyPreview;
}

export interface StorageRetentionPolicyBlocked extends StorageRetentionPolicyBase {
  readonly status: Exclude<StorageRetentionPolicyStatus, 'candidate-eligible'>;
  readonly reason: Exclude<StorageRetentionPolicyReason, 'candidate-eligible'>;
  readonly preview: null;
}

export type StorageRetentionPolicyResult =
  | StorageRetentionPolicyEligible
  | StorageRetentionPolicyBlocked;

export interface EvaluateStorageRetentionPolicyInput {
  readonly mode: unknown;
  readonly selectedGenerationIds: unknown;
  readonly currentGenerationId: unknown;
  readonly immediatePredecessorGenerationId: unknown;
  readonly predecessorResolution: unknown;
  readonly protectedGenerationIds: unknown;
  readonly activeGenerationId: unknown;
  readonly migrationGenerationId: unknown;
  readonly stagedGenerationIds: unknown;
  readonly recoveryGenerationIds: unknown;
  readonly pendingCompletionGenerationIds: unknown;
  readonly operationProtectedGenerationIds: unknown;
  readonly policyEnabled?: unknown;
  readonly keepN?: unknown;
  readonly automaticTrigger?: unknown;
  readonly associatedSessionCount?: unknown;
  readonly associatedDataCount?: unknown;
  readonly createdAt?: unknown;
  readonly sizeBytes?: unknown;
  readonly enumerationOrder?: unknown;
  readonly candidateCreatedAt?: unknown;
  readonly candidateSizeBytes?: unknown;
}

const REQUIRED_KEYS = [
  'mode',
  'selectedGenerationIds',
  'currentGenerationId',
  'immediatePredecessorGenerationId',
  'predecessorResolution',
  'protectedGenerationIds',
  'activeGenerationId',
  'migrationGenerationId',
  'stagedGenerationIds',
  'recoveryGenerationIds',
  'pendingCompletionGenerationIds',
  'operationProtectedGenerationIds',
] as const;

const OPTIONAL_KEYS = [
  'policyEnabled',
  'keepN',
  'automaticTrigger',
  'associatedSessionCount',
  'associatedDataCount',
  'createdAt',
  'sizeBytes',
  'enumerationOrder',
  'candidateCreatedAt',
  'candidateSizeBytes',
] as const;

const ALLOWED_KEYS = new Set<string>([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);

const PREDECESSOR_RESOLUTIONS = new Set([
  'proved',
  'ambiguous',
  'unavailable',
]);

const DISABLED_MODES = new Set([
  'automatic',
  'background',
  'age',
  'space',
  'boot',
  'timer',
]);

const DISABLED_TRIGGERS = new Set([
  'age',
  'space',
  'boot',
  'timer',
  'background',
  'automatic',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function uniqueNonEmptyStrings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  for (const entry of value) {
    if (!isNonEmptyString(entry)) return null;
    ids.push(entry);
  }
  if (new Set(ids).size !== ids.length) return null;
  return ids;
}

function freezePreview(
  associatedSessionCount: number,
  associatedDataCount: number,
): StorageRetentionPolicyPreview {
  return Object.freeze({
    associatedSessionCount,
    associatedDataCount,
    immediatePredecessorPreserved: true as const,
    irreversible: true as const,
    irreversibilityNotice: STORAGE_RETENTION_IRREVERSIBILITY_NOTICE,
    identityIndependentOfAge: true as const,
    identityIndependentOfSize: true as const,
  });
}

function freezeResult(
  status: StorageRetentionPolicyStatus,
  reason: StorageRetentionPolicyReason,
  preview: StorageRetentionPolicyPreview | null,
): StorageRetentionPolicyResult {
  return Object.freeze({
    status,
    reason,
    mode: 'manual',
    maxGenerationsPerOperation: 1,
    keepN: false,
    ageSelectsIdentity: false,
    sizeSelectsIdentity: false,
    previewRequired: true,
    humanConfirmationRequired: true,
    selectionIsNotConfirmation: true,
    preview,
    ownerTokenRequired: true,
    executionAuthorized: false,
    deleteAuthorized: false,
  }) as StorageRetentionPolicyResult;
}

function blocked(
  status: Exclude<StorageRetentionPolicyStatus, 'candidate-eligible'>,
  reason: Exclude<StorageRetentionPolicyReason, 'candidate-eligible'>,
): StorageRetentionPolicyBlocked {
  return freezeResult(status, reason, null) as StorageRetentionPolicyBlocked;
}

function eligible(
  associatedSessionCount: number,
  associatedDataCount: number,
): StorageRetentionPolicyEligible {
  return freezeResult(
    'candidate-eligible',
    'candidate-eligible',
    freezePreview(associatedSessionCount, associatedDataCount),
  ) as StorageRetentionPolicyEligible;
}

function policyIsDisabled(input: Record<string, unknown>): boolean {
  if (input.policyEnabled === false) return true;
  if (typeof input.mode === 'string' && DISABLED_MODES.has(input.mode)) return true;
  if (input.keepN === true || isNonNegativeInteger(input.keepN)) return true;
  if (input.automaticTrigger === true) return true;
  if (
    typeof input.automaticTrigger === 'string'
    && DISABLED_TRIGGERS.has(input.automaticTrigger)
  ) {
    return true;
  }
  return false;
}

/**
 * Avalia a política de produto sem I/O, sem writer e sem autoridade. Idade,
 * tamanho, timestamp, ordem lexical e ordem de enumeração são ignorados na
 * identidade. Uma candidata só atravessa quando um humano a nomeou exatamente
 * uma vez e ela não é atual, predecessor imediato nem referência protegida.
 */
export function evaluateStorageRetentionPolicy(
  input: unknown,
): StorageRetentionPolicyResult {
  try {
    if (!isRecord(input)) return blocked('blocked-ambiguous', 'ambiguous-safety');
    const keys = Object.keys(input);
    if (keys.some((key) => !ALLOWED_KEYS.has(key))) {
      return blocked('blocked-ambiguous', 'ambiguous-safety');
    }
    if (!REQUIRED_KEYS.every((key) => Object.prototype.hasOwnProperty.call(input, key))) {
      return blocked('blocked-ambiguous', 'ambiguous-safety');
    }

    if (policyIsDisabled(input) || input.mode !== 'manual') {
      return blocked('blocked-policy-disabled', 'policy-disabled');
    }

    const selected = uniqueNonEmptyStrings(input.selectedGenerationIds);
    if (selected === null) return blocked('blocked-ambiguous', 'ambiguous-safety');
    if (selected.length === 0) {
      return blocked('blocked-not-explicitly-selected', 'not-explicitly-selected');
    }
    if (selected.length > STORAGE_RETENTION_PRODUCT_POLICY.maxGenerationsPerOperation) {
      return blocked('blocked-multiple-candidates', 'multiple-candidates');
    }

    const currentGenerationId = input.currentGenerationId;
    const activeGenerationId = input.activeGenerationId;
    if (!isNonEmptyString(currentGenerationId) || !isNonEmptyString(activeGenerationId)) {
      return blocked('blocked-ambiguous', 'ambiguous-safety');
    }
    if (currentGenerationId !== activeGenerationId) {
      return blocked('blocked-ambiguous', 'ambiguous-safety');
    }

    const predecessorResolution = input.predecessorResolution;
    if (
      typeof predecessorResolution !== 'string'
      || !PREDECESSOR_RESOLUTIONS.has(predecessorResolution)
    ) {
      return blocked('blocked-ambiguous', 'ambiguous-safety');
    }

    const predecessorId = input.immediatePredecessorGenerationId;
    if (predecessorId !== null && !isNonEmptyString(predecessorId)) {
      return blocked('blocked-ambiguous', 'ambiguous-safety');
    }
    if (predecessorResolution === 'proved' && !isNonEmptyString(predecessorId)) {
      return blocked('blocked-ambiguous', 'ambiguous-safety');
    }
    if (predecessorResolution === 'unavailable' && predecessorId !== null) {
      return blocked('blocked-ambiguous', 'ambiguous-safety');
    }
    if (isNonEmptyString(predecessorId) && predecessorId === currentGenerationId) {
      return blocked('blocked-ambiguous', 'ambiguous-safety');
    }

    const protectedGenerationIds = uniqueNonEmptyStrings(input.protectedGenerationIds);
    const stagedGenerationIds = uniqueNonEmptyStrings(input.stagedGenerationIds);
    const recoveryGenerationIds = uniqueNonEmptyStrings(input.recoveryGenerationIds);
    const pendingCompletionGenerationIds = uniqueNonEmptyStrings(
      input.pendingCompletionGenerationIds,
    );
    const operationProtectedGenerationIds = uniqueNonEmptyStrings(
      input.operationProtectedGenerationIds,
    );
    if (
      protectedGenerationIds === null
      || stagedGenerationIds === null
      || recoveryGenerationIds === null
      || pendingCompletionGenerationIds === null
      || operationProtectedGenerationIds === null
    ) {
      return blocked('blocked-ambiguous', 'ambiguous-safety');
    }

    const migrationGenerationId = input.migrationGenerationId;
    if (migrationGenerationId !== null && !isNonEmptyString(migrationGenerationId)) {
      return blocked('blocked-ambiguous', 'ambiguous-safety');
    }

    const associatedSessionCount = input.associatedSessionCount === undefined
      ? 0
      : input.associatedSessionCount;
    const associatedDataCount = input.associatedDataCount === undefined
      ? 0
      : input.associatedDataCount;
    if (
      !isNonNegativeInteger(associatedSessionCount)
      || !isNonNegativeInteger(associatedDataCount)
    ) {
      return blocked('blocked-ambiguous', 'ambiguous-safety');
    }

    const candidate = selected[0];
    if (candidate === currentGenerationId) {
      return blocked('blocked-current-generation', 'current-generation-protected');
    }
    if (isNonEmptyString(predecessorId) && candidate === predecessorId) {
      return blocked('blocked-immediate-predecessor', 'immediate-predecessor-protected');
    }
    if (predecessorResolution === 'ambiguous') {
      return blocked('blocked-ambiguous', 'ambiguous-safety');
    }

    const protectedRefs = new Set<string>([
      ...protectedGenerationIds,
      ...stagedGenerationIds,
      ...recoveryGenerationIds,
      ...pendingCompletionGenerationIds,
      ...operationProtectedGenerationIds,
      ...(isNonEmptyString(migrationGenerationId) ? [migrationGenerationId] : []),
    ]);
    if (protectedRefs.has(candidate)) {
      return blocked('blocked-protected-reference', 'protected-reference');
    }

    return eligible(associatedSessionCount, associatedDataCount);
  } catch {
    return blocked('blocked-ambiguous', 'ambiguous-safety');
  }
}
