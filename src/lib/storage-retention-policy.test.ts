import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { planStorageRetention } from './storage-retention';
import {
  evaluateStorageRetentionPolicy,
  STORAGE_RETENTION_IRREVERSIBILITY_NOTICE,
  STORAGE_RETENTION_PRODUCT_POLICY,
  type EvaluateStorageRetentionPolicyInput,
  type StorageRetentionPolicyResult,
} from './storage-retention-policy';

const SOURCE_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const REPO_ROOT = join(SOURCE_ROOT, '..');
const POLICY_SOURCE = join(SOURCE_ROOT, 'lib', 'storage-retention-policy.ts');

const CURRENT_ID = 'generation-current-PRIVATE_ID';
const PREDECESSOR_ID = 'generation-predecessor-PRIVATE_ID';
const CANDIDATE_ID = 'generation-candidate-PRIVATE_ID';
const OTHER_ID = 'generation-other-PRIVATE_ID';
const STAGED_ID = 'generation-staged-PRIVATE_ID';
const MIGRATION_ID = 'generation-migration-PRIVATE_ID';
const RECEIPT_ID = 'generation-receipt-PRIVATE_ID';
const OPERATION_ID = 'operation-PRIVATE_ID';
const FINGERPRINT = 'fingerprint-PRIVATE_VALUE';
const DIGEST = 'digest-PRIVATE_VALUE';
const OWNER_TOKEN = 'owner-token-PRIVATE_VALUE';

function policyInput(
  overrides: Partial<EvaluateStorageRetentionPolicyInput> = {},
): EvaluateStorageRetentionPolicyInput {
  return {
    mode: 'manual',
    selectedGenerationIds: [CANDIDATE_ID],
    currentGenerationId: CURRENT_ID,
    immediatePredecessorGenerationId: PREDECESSOR_ID,
    predecessorResolution: 'proved',
    protectedGenerationIds: [],
    activeGenerationId: CURRENT_ID,
    migrationGenerationId: null,
    stagedGenerationIds: [],
    recoveryGenerationIds: [],
    pendingCompletionGenerationIds: [],
    operationProtectedGenerationIds: [],
    associatedSessionCount: 3,
    associatedDataCount: 5,
    ...overrides,
  };
}

function expectNoAuthority(result: StorageRetentionPolicyResult): void {
  expect(result.ownerTokenRequired).toBe(true);
  expect(result.executionAuthorized).toBe(false);
  expect(result.deleteAuthorized).toBe(false);
  expect(result.mode).toBe('manual');
  expect(result.maxGenerationsPerOperation).toBe(1);
  expect(result.keepN).toBe(false);
  expect(result.ageSelectsIdentity).toBe(false);
  expect(result.sizeSelectsIdentity).toBe(false);
  expect(result.previewRequired).toBe(true);
  expect(result.humanConfirmationRequired).toBe(true);
  expect(result.selectionIsNotConfirmation).toBe(true);
  expect(Object.isFrozen(result)).toBe(true);
}

function expectSanitized(result: StorageRetentionPolicyResult): void {
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain(CURRENT_ID);
  expect(serialized).not.toContain(PREDECESSOR_ID);
  expect(serialized).not.toContain(CANDIDATE_ID);
  expect(serialized).not.toContain(OTHER_ID);
  expect(serialized).not.toContain(STAGED_ID);
  expect(serialized).not.toContain(MIGRATION_ID);
  expect(serialized).not.toContain(RECEIPT_ID);
  expect(serialized).not.toContain(OPERATION_ID);
  expect(serialized).not.toContain(FINGERPRINT);
  expect(serialized).not.toContain(DIGEST);
  expect(serialized).not.toContain(OWNER_TOKEN);
  expect(serialized).not.toMatch(/generationId|operationId|owner-token|receipt|raw|digest|fingerprint/i);
}

function listFiles(root: string, extensions: readonly string[]): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        entry.name === 'node_modules'
        || entry.name === '.next'
        || entry.name.startsWith('.')
      ) {
        continue;
      }
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (extensions.some((extension) => entry.name.endsWith(extension))) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found;
}

function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function relativeSource(file: string): string {
  return relative(REPO_ROOT, file).replace(/\\/g, '/');
}

describe('política pura de retenção MVP', () => {
  it('bloqueia quando nenhuma candidata foi selecionada', () => {
    const result = evaluateStorageRetentionPolicy(policyInput({
      selectedGenerationIds: [],
    }));
    expect(result.status).toBe('blocked-not-explicitly-selected');
    expect(result.reason).toBe('not-explicitly-selected');
    expect(result.preview).toBeNull();
    expectNoAuthority(result);
    expectSanitized(result);
  });

  it('bloqueia duas candidatas selecionadas na mesma operação', () => {
    const result = evaluateStorageRetentionPolicy(policyInput({
      selectedGenerationIds: [CANDIDATE_ID, OTHER_ID],
    }));
    expect(result.status).toBe('blocked-multiple-candidates');
    expect(result.preview).toBeNull();
    expectNoAuthority(result);
  });

  it('bloqueia a geração atual mesmo quando nomeada explicitamente', () => {
    const result = evaluateStorageRetentionPolicy(policyInput({
      selectedGenerationIds: [CURRENT_ID],
    }));
    expect(result.status).toBe('blocked-current-generation');
    expectNoAuthority(result);
  });

  it('bloqueia o predecessor imediato comprovado', () => {
    const result = evaluateStorageRetentionPolicy(policyInput({
      selectedGenerationIds: [PREDECESSOR_ID],
    }));
    expect(result.status).toBe('blocked-immediate-predecessor');
    expectNoAuthority(result);
  });

  it('bloqueia candidata protegida por receipt de operação', () => {
    const result = evaluateStorageRetentionPolicy(policyInput({
      selectedGenerationIds: [RECEIPT_ID],
      operationProtectedGenerationIds: [RECEIPT_ID],
    }));
    expect(result.status).toBe('blocked-protected-reference');
    expectNoAuthority(result);
  });

  it('bloqueia candidata de migration ou staged', () => {
    expect(evaluateStorageRetentionPolicy(policyInput({
      selectedGenerationIds: [MIGRATION_ID],
      migrationGenerationId: MIGRATION_ID,
    })).status).toBe('blocked-protected-reference');
    expect(evaluateStorageRetentionPolicy(policyInput({
      selectedGenerationIds: [STAGED_ID],
      stagedGenerationIds: [STAGED_ID],
    })).status).toBe('blocked-protected-reference');
  });

  it('bloqueia estado ambíguo em vez de escolher identidade', () => {
    const result = evaluateStorageRetentionPolicy(policyInput({
      predecessorResolution: 'ambiguous',
    }));
    expect(result.status).toBe('blocked-ambiguous');
    expectNoAuthority(result);
    expectSanitized(result);
  });

  it('aceita uma candidata explícita comprovadamente não protegida sem autorizar delete', () => {
    const result = evaluateStorageRetentionPolicy(policyInput());
    expect(result.status).toBe('candidate-eligible');
    expect(result.preview).toEqual({
      associatedSessionCount: 3,
      associatedDataCount: 5,
      immediatePredecessorPreserved: true,
      irreversible: true,
      irreversibilityNotice: STORAGE_RETENTION_IRREVERSIBILITY_NOTICE,
      identityIndependentOfAge: true,
      identityIndependentOfSize: true,
    });
    expect(Object.isFrozen(result.preview)).toBe(true);
    expectNoAuthority(result);
    expectSanitized(result);
  });

  it('idade diferente não muda a identidade da decisão', () => {
    const older = evaluateStorageRetentionPolicy(policyInput({
      createdAt: '2000-01-01T00:00:00.000Z',
      candidateCreatedAt: '1999-01-01T00:00:00.000Z',
    }));
    const newer = evaluateStorageRetentionPolicy(policyInput({
      createdAt: '2099-12-31T23:59:59.000Z',
      candidateCreatedAt: '2099-12-31T23:59:59.000Z',
    }));
    expect(older.status).toBe('candidate-eligible');
    expect(newer.status).toBe(older.status);
    expect(newer.reason).toBe(older.reason);
    expect(JSON.stringify(newer)).toBe(JSON.stringify(older));
  });

  it('tamanho diferente não muda a identidade da decisão', () => {
    const small = evaluateStorageRetentionPolicy(policyInput({
      sizeBytes: 1,
      candidateSizeBytes: 8,
    }));
    const large = evaluateStorageRetentionPolicy(policyInput({
      sizeBytes: 9_999_999,
      candidateSizeBytes: 88_888_888,
    }));
    expect(small.status).toBe('candidate-eligible');
    expect(JSON.stringify(large)).toBe(JSON.stringify(small));
  });

  it('ordem dos IDs protegidos não muda o resultado', () => {
    const left = evaluateStorageRetentionPolicy(policyInput({
      selectedGenerationIds: [CANDIDATE_ID],
      protectedGenerationIds: [OTHER_ID, RECEIPT_ID],
      stagedGenerationIds: [],
      recoveryGenerationIds: [OTHER_ID],
    }));
    const right = evaluateStorageRetentionPolicy(policyInput({
      selectedGenerationIds: [CANDIDATE_ID],
      protectedGenerationIds: [RECEIPT_ID, OTHER_ID],
      stagedGenerationIds: [],
      recoveryGenerationIds: [OTHER_ID],
    }));
    expect(left.status).toBe('candidate-eligible');
    expect(JSON.stringify(right)).toBe(JSON.stringify(left));
  });

  it('ordem de enumeração e de seleção múltipla não escolhe candidata', () => {
    const first = evaluateStorageRetentionPolicy(policyInput({
      selectedGenerationIds: [CANDIDATE_ID, OTHER_ID],
      enumerationOrder: [CANDIDATE_ID, OTHER_ID, PREDECESSOR_ID],
    }));
    const second = evaluateStorageRetentionPolicy(policyInput({
      selectedGenerationIds: [OTHER_ID, CANDIDATE_ID],
      enumerationOrder: [OTHER_ID, PREDECESSOR_ID, CANDIDATE_ID],
    }));
    expect(first.status).toBe('blocked-multiple-candidates');
    expect(second.status).toBe(first.status);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('recusa política automática, keep-N e triggers de idade/espaço/boot', () => {
    expect(evaluateStorageRetentionPolicy(policyInput({
      mode: 'automatic',
    })).status).toBe('blocked-policy-disabled');
    expect(evaluateStorageRetentionPolicy(policyInput({
      keepN: 3,
    })).status).toBe('blocked-policy-disabled');
    expect(evaluateStorageRetentionPolicy(policyInput({
      automaticTrigger: 'age',
    })).status).toBe('blocked-policy-disabled');
    expect(evaluateStorageRetentionPolicy(policyInput({
      automaticTrigger: 'space',
    })).status).toBe('blocked-policy-disabled');
    expect(evaluateStorageRetentionPolicy(policyInput({
      automaticTrigger: 'boot',
    })).status).toBe('blocked-policy-disabled');
    expect(evaluateStorageRetentionPolicy(policyInput({
      policyEnabled: false,
    })).status).toBe('blocked-policy-disabled');
  });

  it('protege referências de recovery e completion pendente', () => {
    expect(evaluateStorageRetentionPolicy(policyInput({
      selectedGenerationIds: [OTHER_ID],
      recoveryGenerationIds: [OTHER_ID],
    })).status).toBe('blocked-protected-reference');
    expect(evaluateStorageRetentionPolicy(policyInput({
      selectedGenerationIds: [OTHER_ID],
      pendingCompletionGenerationIds: [OTHER_ID],
    })).status).toBe('blocked-protected-reference');
  });

  it('a saída pública não vaza IDs, receipt, raw, digest, fingerprint ou owner-token', () => {
    const result = evaluateStorageRetentionPolicy(policyInput({
      associatedSessionCount: 12,
      associatedDataCount: 4,
    }));
    expectSanitized(result);
    expect(result.preview?.irreversibilityNotice).toBe(
      STORAGE_RETENTION_IRREVERSIBILITY_NOTICE,
    );
    expect(STORAGE_RETENTION_PRODUCT_POLICY.selectionIsNotConfirmation).toBe(true);
  });

  it('autoridade permanece falsa inclusive quando candidate-eligible', () => {
    const result = evaluateStorageRetentionPolicy(policyInput());
    expect(result.status).toBe('candidate-eligible');
    expect(result.executionAuthorized).toBe(false);
    expect(result.deleteAuthorized).toBe(false);
  });

  it('o planner de retenção continua com delete vazio', () => {
    const plan = planStorageRetention({
      metadata: {
        activeGeneration: CURRENT_ID,
        migrationGeneration: null,
        schemaVersion: 1,
        migrationStatus: 'completed',
        migratedAt: '2026-08-19T00:00:00.000Z',
        sourceStorageVersion: 2,
      },
      activeGenerationId: CURRENT_ID,
      migrationGenerationId: null,
      activeGenerationPresent: true,
      generations: [{
        generationId: CURRENT_ID,
        isActive: true,
        isStaged: false,
        hasManifest: true,
        hasRecords: false,
        recordCount: 0,
        manifestSessionCount: 0,
        orderedDigest: 'sha256:' + 'a'.repeat(64),
        verified: true,
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-19T00:00:00.000Z',
      }],
      manifests: [{
        generationId: CURRENT_ID,
        sessionCount: 0,
        orderedDigest: 'sha256:' + 'a'.repeat(64),
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-19T00:00:00.000Z',
        verified: true,
      }],
      activeGenerationManifest: {
        generationId: CURRENT_ID,
        sessionCount: 0,
        orderedDigest: 'sha256:' + 'a'.repeat(64),
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-19T00:00:00.000Z',
        verified: true,
      },
      activeGenerationRecords: [],
      operationReceipts: [],
      unsettledOperations: [],
      pendingCompletionReceipts: [],
    });
    expect(plan.delete).toEqual([]);
    expect(plan.delete.length).toBe(0);
    expect(evaluateStorageRetentionPolicy(policyInput()).deleteAuthorized).toBe(false);
  });
});

describe('guards da política de retenção', () => {
  it('não chama writer, IndexedDB, localStorage, owner-token ou delete', () => {
    const source = codeOf(POLICY_SOURCE);
    const forbidden = [
      /\bdeleteDatabase\b/,
      /\bobjectStore\b/,
      /\.delete\s*\(/,
      /\.clear\s*\(/,
      /\bclearInactiveGeneration\b/,
      /\bdeleteGeneration\b/,
      /\bwriteStorageRetirementJournal\b/,
      /\bcompareAndPutStorageRetirementJournal\b/,
      /\bsetItem\b/,
      /\bremoveItem\b/,
      /\bindexedDB\b/,
      /\blocalStorage\b/,
      /\bacquire\w*Token\s*\(/,
      /\bbeginStorageOperation\b/,
      /\bnew Date\b/,
      /\bMath\.random\b/,
    ];
    for (const pattern of forbidden) expect(source).not.toMatch(pattern);
    expect(source).toContain('executionAuthorized: false');
    expect(source).toContain('deleteAuthorized: false');
  });

  it('não possui call site de UI, Provider, boot ou journal writer', () => {
    const callers = listFiles(SOURCE_ROOT, ['.ts', '.tsx'])
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => /\bevaluateStorageRetentionPolicy\s*\(/.test(codeOf(file)))
      .map(relativeSource)
      .sort();
    expect(callers).toEqual([
      'src/lib/storage-retention-policy.ts',
      'src/lib/storage-retirement-contract.ts',
    ]);
  });

  it('formaliza política manual, uma candidata e preview/confirmação obrigatórios', () => {
    expect(STORAGE_RETENTION_PRODUCT_POLICY).toMatchObject({
      mode: 'manual',
      maxGenerationsPerOperation: 1,
      automaticCleanup: false,
      keepN: false,
      previewRequired: true,
      humanConfirmationRequired: true,
      selectionIsNotConfirmation: true,
    });
  });
});
