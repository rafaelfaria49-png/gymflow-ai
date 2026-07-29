import { describe, expect, it, vi } from 'vitest';
import {
  inspectStorageAdminOwnerToken,
  type StorageAdminOwnerTokenInspectionStatus,
} from './storage-admin-owner-token';
import type { StorageAdministrationSnapshot } from './storage-admin-runtime';
import type { StorageBootRecoveryOutcome } from './storage-boot-recovery';
import {
  createStorageAdminStatusReader,
  type CreateStorageAdminStatusReaderOptions,
} from './storage-admin-status';
import type { StorageRetentionEvidence } from './storage-retention-evidence';
import type { StorageRetentionPlan } from './storage-retention';

const READY_BOOT: StorageBootRecoveryOutcome = {
  status: 'ready-no-operation',
  hydrationAllowed: true,
  cleanupPending: false,
};

const BLOCKED_BOOT: StorageBootRecoveryOutcome = {
  status: 'blocked-recovery-required',
  hydrationAllowed: false,
  cleanupPending: false,
  message: 'mensagem interna que não deve atravessar',
};

function administration(
  state: StorageAdministrationSnapshot['state'] = { status: 'ready' },
): StorageAdministrationSnapshot {
  return {
    state,
    physicalStorageVersion: 2,
    activeGenerationId: 'generation-secret-active',
    stagedGenerationId: null,
    generations: [],
    unsettledOperations: [],
    pendingCompletionReceiptCount: 0,
    coreDigest: 'digest-secret',
    activeGenerationIntegrity: null,
    administrationFingerprint: 'fingerprint-secret',
    coreRawObserved: 'raw-secret',
  };
}

function evidence(
  historical = 0,
  overrides: Partial<StorageRetentionEvidence> = {},
): StorageRetentionEvidence {
  const evaluated = historical + 1;
  return {
    status: 'inspected',
    reason: 'evidence-collected',
    generations: {
      observed: evaluated,
      evaluated,
      active: 1,
      migration: 0,
      historical,
      orphan: historical,
      complete: evaluated,
      incomplete: 0,
      structurallyConflicted: 0,
      physicallyVerified: evaluated,
      physicallyUnverified: 0,
      missingReferenced: 0,
    },
    references: {
      activePointers: 1,
      migrationPointers: 0,
      operationReceipts: 0,
      unsettledOperationReceipts: 0,
      pendingCompletionReceipts: 0,
      operationProtectedGenerations: 0,
      completionProtectedGenerations: 0,
    },
    anomalies: {
      missingManifests: 0,
      duplicateManifests: 0,
      duplicateGenerationSummaries: 0,
      danglingPointers: 0,
      danglingReceiptReferences: 0,
      multipleActiveGenerations: 0,
      multipleMigrationGenerations: 0,
      summaryManifestConflicts: 0,
      malformedEntries: 0,
      verificationFailures: 0,
    },
    ...overrides,
  };
}

function planFor(value: StorageRetentionEvidence): StorageRetentionPlan {
  return value.generations.historical > 0
    ? { status: 'blocked', reason: 'physical-proof-required', delete: [] }
    : { status: 'policy-required', reason: 'policy-required', delete: [] };
}

function createReader(input: {
  administration?: StorageAdministrationSnapshot;
  evidence?: StorageRetentionEvidence;
  boot?: StorageBootRecoveryOutcome | null;
  ownerToken?: StorageAdminOwnerTokenInspectionStatus;
  plan?: StorageRetentionPlan;
  inspectEvidence?: () => Promise<StorageRetentionEvidence>;
  storage?: {
    getItem: (key: string) => string | null;
    setItem?: (key: string, value: string) => void;
    removeItem?: (key: string) => void;
    clear?: () => void;
  };
} = {}) {
  const currentEvidence = input.evidence ?? evidence();
  const inspectAdministration = vi.fn(async () => (
    input.administration ?? administration()
  ));
  const inspectEvidence = vi.fn(input.inspectEvidence ?? (async () => currentEvidence));
  const storage = input.storage ?? { getItem: vi.fn(() => null) };
  const options: CreateStorageAdminStatusReaderOptions = {
    runtime: { inspectStorageAdministration: inspectAdministration },
    evidenceReader: {
      readStorageAdministrationSnapshot: vi.fn(async () => ({ marker: 'snapshot-secret' } as never)),
      readHistoryGenerationSnapshot: vi.fn(async () => ({ marker: 'history-secret' } as never)),
    },
    storage,
    key: 'gymflow:test',
    getBootOutcome: () => input.boot === undefined ? READY_BOOT : input.boot,
    rollbackReserveRequired: false,
    dependencies: {
      inspectEvidence,
      planRetention: vi.fn(() => input.plan ?? planFor(currentEvidence)),
      inspectOwnerToken: vi.fn(() => Object.freeze({
        status: input.ownerToken ?? 'available',
      })),
    },
  };
  return {
    reader: createStorageAdminStatusReader(options),
    inspectAdministration,
    inspectEvidence,
    storage,
  };
}

describe('storage-admin-status — composição sanitizada read-only', () => {
  it('classifica o cenário íntegro como saudável', async () => {
    const value = await createReader().reader.inspect();
    expect(value).toEqual({
      overall: 'healthy',
      boot: 'ready',
      storage: {
        observed: 1,
        evaluated: 1,
        active: 1,
        migration: 0,
        historical: 0,
      },
      receipts: 'absent',
      evidence: 'verified',
      retention: {
        status: 'ready',
        keep: 1,
        protected: 0,
        futureDeleteCandidate: 0,
      },
      ownerToken: 'available',
      executionAuthorized: false,
      deleteAuthorized: false,
    });
  });

  it('receipts presentes pedem atenção e bloqueiam retenção', async () => {
    const base = evidence();
    const withReceipt = evidence(0, {
      references: {
        ...base.references,
        operationReceipts: 1,
      },
    });
    const value = await createReader({
      evidence: withReceipt,
      plan: { status: 'blocked', reason: 'operation-receipt-present', delete: [] },
    }).reader.inspect();
    expect(value.overall).toBe('attention');
    expect(value.receipts).toBe('present');
    expect(value.retention.status).toBe('blocked');
  });

  it('snapshot instável nunca aparece saudável', async () => {
    const value = await createReader({
      evidence: evidence(0, {
        status: 'blocked',
        reason: 'snapshot-unstable',
      }),
    }).reader.inspect();
    expect(value.overall).toBe('blocked');
    expect(value.evidence).toBe('unstable');
    expect(value.receipts).toBe('conflicted');
  });

  it('prova física insuficiente fica não verificada e sem candidatura', async () => {
    const base = evidence(1);
    const value = await createReader({
      evidence: evidence(1, {
        generations: {
          ...base.generations,
          physicallyVerified: 1,
          physicallyUnverified: 1,
        },
        anomalies: {
          ...base.anomalies,
          verificationFailures: 1,
        },
      }),
    }).reader.inspect();
    expect(value.overall).toBe('attention');
    expect(value.evidence).toBe('unverified');
    expect(value.retention).toMatchObject({
      status: 'blocked',
      futureDeleteCandidate: 0,
    });
  });

  it('boot bloqueado preserva toda a classificação como bloqueada', async () => {
    const value = await createReader({ boot: BLOCKED_BOOT }).reader.inspect();
    expect(value.overall).toBe('blocked');
    expect(value.boot).toBe('blocked');
    expect(value.retention.status).toBe('blocked');
  });

  it('falha de storage aparece como indisponível, nunca como saudável', async () => {
    const value = await createReader({
      administration: administration({
        status: 'unavailable',
        reason: 'storage-blocked',
        detail: 'erro nativo secreto',
        cause: new Error('stack secreta'),
      }),
      evidence: evidence(0, {
        status: 'blocked',
        reason: 'storage-read-failed',
      }),
    }).reader.inspect();
    expect(value.overall).toBe('unavailable');
    expect(value.evidence).toBe('unverified');
  });

  it.each([
    ['busy', 'attention'],
    ['malformed', 'blocked'],
    ['expired', 'attention'],
    ['unavailable', 'unavailable'],
  ] as const)('owner-token %s é exibido sem ampliar autoridade', async (ownerToken, overall) => {
    const value = await createReader({ ownerToken }).reader.inspect();
    expect(value.ownerToken).toBe(ownerToken);
    expect(value.overall).toBe(overall);
    expect(value.executionAuthorized).toBe(false);
    expect(value.deleteAuthorized).toBe(false);
  });

  it('publica somente contagens para candidatas futuras e mantém as autorizações falsas', async () => {
    const value = await createReader({ evidence: evidence(3) }).reader.inspect();
    expect(value.overall).toBe('healthy');
    expect(value.retention).toEqual({
      status: 'ready',
      keep: 1,
      protected: 1,
      futureDeleteCandidate: 2,
    });
    expect(value.executionAuthorized).toBe(false);
    expect(value.deleteAuthorized).toBe(false);
  });

  it('compartilha a mesma Promise concorrente e uma atualização posterior relê', async () => {
    let resolveEvidence!: (value: StorageRetentionEvidence) => void;
    const pending = new Promise<StorageRetentionEvidence>((resolve) => {
      resolveEvidence = resolve;
    });
    const scenario = createReader({ inspectEvidence: () => pending });

    const first = scenario.reader.inspect();
    const concurrent = scenario.reader.inspect();
    expect(concurrent).toBe(first);
    expect(scenario.inspectAdministration).toHaveBeenCalledTimes(1);
    expect(scenario.inspectEvidence).toHaveBeenCalledTimes(1);

    resolveEvidence(evidence());
    await first;
    await scenario.reader.inspect();
    expect(scenario.inspectAdministration).toHaveBeenCalledTimes(2);
    expect(scenario.inspectEvidence).toHaveBeenCalledTimes(2);
  });

  it('falha fechado para entradas desconhecidas', async () => {
    const value = await createReader({
      inspectEvidence: async () => ({ status: 'mystery' } as never),
    }).reader.inspect();
    expect(value.overall).toBe('unavailable');
    expect(value.boot).toBe('unknown');
    expect(value.retention.status).toBe('blocked');
    expect(value.deleteAuthorized).toBe(false);
  });

  it('não deixa ids, tempos, digests, fingerprints, raw, receipts ou erros atravessarem', async () => {
    const value = await createReader({
      administration: administration({
        status: 'conflicted',
        reason: 'operation-incompatible',
        detail: 'native-error-secret',
        operations: [{
          operationId: 'operation-id-secret',
          createdAt: 'timestamp-secret',
        } as never],
        cause: new Error('stack-secret'),
      }),
    }).reader.inspect();
    const serialized = JSON.stringify(value);
    expect(serialized).not.toMatch(
      /generation-secret|digest-secret|fingerprint-secret|raw-secret|operation-id-secret|timestamp-secret|native-error-secret|stack-secret/i,
    );
    expect(Object.keys(value).sort()).toEqual([
      'boot',
      'deleteAuthorized',
      'evidence',
      'executionAuthorized',
      'overall',
      'ownerToken',
      'receipts',
      'retention',
      'storage',
    ]);
  });

  it('devolve a saída profundamente congelada', async () => {
    const value = await createReader({ evidence: evidence(2) }).reader.inspect();
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.storage)).toBe(true);
    expect(Object.isFrozen(value.retention)).toBe(true);
  });

  it('não chama nenhuma capacidade de escrita, exclusão ou limpeza', async () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    const scenario = createReader({ storage });
    await scenario.reader.inspect();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.clear).not.toHaveBeenCalled();
    expect(scenario.inspectAdministration).toHaveBeenCalledTimes(1);
  });
});

describe('inspectStorageAdminOwnerToken — observação sem lease', () => {
  const token = (expiresAt: number) => JSON.stringify({
    schemaVersion: 1,
    ownerId: 'owner-secret',
    operationId: 'operation-secret',
    operationKind: 'import',
    acquiredAt: 100,
    expiresAt,
    nonce: 'nonce-secret',
  });

  it('distingue disponível, ocupado, expirado e malformado sem escrever', () => {
    const setItem = vi.fn();
    const removeItem = vi.fn();
    const inspect = (raw: string | null, now: number) => inspectStorageAdminOwnerToken({
      key: 'gymflow:test',
      storage: { getItem: vi.fn(() => raw) },
      now: () => now,
    });

    expect(inspect(null, 200).status).toBe('available');
    expect(inspect(token(300), 200).status).toBe('busy');
    expect(inspect(token(200), 200).status).toBe('expired');
    expect(inspect('{inválido', 200).status).toBe('malformed');
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('falha como indisponível para storage/relógio inválidos e não expõe o token', () => {
    const blocked = inspectStorageAdminOwnerToken({
      key: 'gymflow:test',
      storage: {
        getItem: () => {
          throw new Error('erro nativo secreto');
        },
      },
      now: () => 200,
    });
    const badClock = inspectStorageAdminOwnerToken({
      key: 'gymflow:test',
      storage: { getItem: () => token(300) },
      now: () => Number.NaN,
    });
    expect(blocked).toEqual({ status: 'unavailable' });
    expect(badClock).toEqual({ status: 'unavailable' });
    expect(Object.isFrozen(blocked)).toBe(true);
    expect(JSON.stringify(blocked)).not.toMatch(/owner-secret|operation-secret|nonce-secret/);
  });
});
