import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type {
  HistoryGenerationSummary,
  StorageAdministrationSnapshotRead,
} from './storage-adapter';
import type { StorageBootRecoveryOutcome } from './storage-boot-recovery';
import type { WorkoutCompletionReceipt } from './storage-completion-receipt';
import {
  EMPTY_GENERATION_DIGEST,
  type HistoryGenerationManifest,
  type HistoryGenerationSnapshot,
} from './storage-history-integrity';
import {
  createStorageOperationReceipt,
  type StorageOperationReceipt,
} from './storage-operation-receipt';
import {
  decideStorageRetention,
  type StorageRetentionDecision,
} from './storage-retention-decision';
import {
  inspectStorageRetentionEvidence,
  type StorageRetentionEvidence,
  type StorageRetentionEvidenceReader,
} from './storage-retention-evidence';
import type { StorageRetentionPlan } from './storage-retention';

const CREATED_AT = '2026-07-28T20:00:00.000Z';
const ACTIVE_ID = 'generation-active-PRIVATE_ID';
const MIGRATION_ID = 'generation-migration-PRIVATE_ID';
const HISTORICAL_ID = 'generation-historical-PRIVATE_ID';

const READY_BOOT: StorageBootRecoveryOutcome = {
  status: 'ready-no-operation',
  hydrationAllowed: true,
  cleanupPending: false,
};

const BLOCKED_BOOT: StorageBootRecoveryOutcome = {
  status: 'blocked-recovery-required',
  hydrationAllowed: false,
  cleanupPending: false,
  message: 'PRIVATE_INTERNAL_BOOT_MESSAGE',
};

function manifest(
  generationId: string,
  overrides: Partial<HistoryGenerationManifest> = {},
): HistoryGenerationManifest {
  return {
    generationId,
    sessionCount: 0,
    orderedDigest: EMPTY_GENERATION_DIGEST,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    verified: true,
    ...overrides,
  };
}

function generation(
  generationId: string,
  overrides: Partial<HistoryGenerationSummary> = {},
): HistoryGenerationSummary {
  return {
    generationId,
    isActive: false,
    isStaged: false,
    hasManifest: true,
    hasRecords: false,
    recordCount: 0,
    manifestSessionCount: 0,
    orderedDigest: EMPTY_GENERATION_DIGEST,
    verified: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<StorageAdministrationSnapshotRead> = {},
): StorageAdministrationSnapshotRead {
  const activeManifest = manifest(ACTIVE_ID);
  return {
    metadata: {
      activeGeneration: ACTIVE_ID,
      migrationGeneration: null,
      schemaVersion: 1,
      migrationStatus: 'completed',
      migratedAt: CREATED_AT,
      sourceStorageVersion: 2,
    },
    activeGenerationId: ACTIVE_ID,
    migrationGenerationId: null,
    generations: [generation(ACTIVE_ID, { isActive: true })],
    manifests: [activeManifest],
    activeGenerationRecords: [],
    activeGenerationManifest: { ...activeManifest },
    activeGenerationPresent: true,
    operationReceipts: [],
    unsettledOperations: [],
    pendingCompletionReceipts: [],
    fingerprint: 'PRIVATE_FINGERPRINT_A',
    ...overrides,
  };
}

function emptySnapshot(): StorageAdministrationSnapshotRead {
  return snapshot({
    metadata: {
      activeGeneration: null,
      migrationGeneration: null,
      schemaVersion: 1,
      migrationStatus: 'not-started',
      migratedAt: null,
      sourceStorageVersion: null,
    },
    activeGenerationId: null,
    generations: [],
    manifests: [],
    activeGenerationManifest: null,
    activeGenerationPresent: false,
    fingerprint: 'PRIVATE_EMPTY_FINGERPRINT',
  });
}

function withHistorical(...generationIds: string[]): StorageAdministrationSnapshotRead {
  return snapshot({
    generations: [
      generation(ACTIVE_ID, { isActive: true }),
      ...generationIds.map((generationId) => generation(generationId)),
    ],
    manifests: [
      manifest(ACTIVE_ID),
      ...generationIds.map((generationId) => manifest(generationId)),
    ],
  });
}

function operation(): StorageOperationReceipt {
  return createStorageOperationReceipt({
    operationId: 'operation-PRIVATE_ID',
    kind: 'import',
    previousCoreRaw: 'PRIVATE_RAW PRIVATE_CORE',
    previousGenerationId: ACTIVE_ID,
    createdAt: CREATED_AT,
  });
}

function completion(): WorkoutCompletionReceipt {
  return {
    receiptId: 'completion-PRIVATE_ID',
    sessionId: 'PRIVATE_SESSION',
    generationId: ACTIVE_ID,
    sessionDigest: 'PRIVATE_DIGEST',
    finalSession: {
      id: 'PRIVATE_SESSION',
      name: 'PRIVATE_WORKOUT',
    } as never,
    coreEnvelopeAfter: {
      historyStorage: {
        backend: 'indexeddb',
        schemaVersion: 1,
        generationId: ACTIVE_ID,
      },
    } as never,
    effects: {
      xpNotifications: [],
      communityPost: {
        id: 'post-PRIVATE_ID',
        content: 'PRIVATE_NAME PRIVATE_EMAIL',
      } as never,
      unlockedAchievementIds: [],
      markedDayName: 'PRIVATE_WORKOUT',
    },
    createdAt: CREATED_AT,
    status: 'pending',
    settledAt: null,
  };
}

function physicalSnapshot(
  generationId: string,
  overrides: Partial<HistoryGenerationSnapshot> = {},
): HistoryGenerationSnapshot {
  return {
    present: true,
    manifest: manifest(generationId),
    sessions: [],
    recordDigests: [],
    ...overrides,
  };
}

function readerFor(input: {
  snapshots: readonly StorageAdministrationSnapshotRead[];
  physical?: ReadonlyMap<string, HistoryGenerationSnapshot>;
  generationError?: unknown;
}): {
  reader: StorageRetentionEvidenceReader;
  readAdministration: ReturnType<typeof vi.fn>;
  readGeneration: ReturnType<typeof vi.fn>;
} {
  let index = 0;
  const readAdministration = vi.fn(async () => {
    const value = input.snapshots[Math.min(index, input.snapshots.length - 1)];
    index += 1;
    return value;
  });
  const readGeneration = vi.fn(async (generationId: string) => {
    if (input.generationError !== undefined) throw input.generationError;
    const custom = input.physical?.get(generationId);
    if (custom) return custom;
    return physicalSnapshot(generationId);
  });
  return {
    reader: {
      readStorageAdministrationSnapshot: readAdministration,
      readHistoryGenerationSnapshot: readGeneration,
    },
    readAdministration,
    readGeneration,
  };
}

function planFor(value: StorageAdministrationSnapshotRead): StorageRetentionPlan {
  if (value.operationReceipts.length > 0 || value.unsettledOperations.length > 0) {
    return {
      status: 'blocked',
      reason: 'operation-receipt-present',
      delete: [],
    };
  }
  if (value.pendingCompletionReceipts.length > 0) {
    return {
      status: 'blocked',
      reason: 'completion-receipt-present',
      delete: [],
    };
  }
  if (
    value.migrationGenerationId !== null
    || value.generations.length > 1
  ) {
    return {
      status: 'blocked',
      reason: 'physical-proof-required',
      delete: [],
    };
  }
  if (
    value.activeGenerationId !== null
    && value.generations.length === 1
  ) {
    return {
      status: 'policy-required',
      reason: 'policy-required',
      delete: [],
    };
  }
  return {
    status: 'blocked',
    reason: 'snapshot-invalid',
    delete: [],
  };
}

async function evidenceFor(
  value: StorageAdministrationSnapshotRead,
  options: {
    second?: StorageAdministrationSnapshotRead;
    physical?: ReadonlyMap<string, HistoryGenerationSnapshot>;
  } = {},
): Promise<StorageRetentionEvidence> {
  return inspectStorageRetentionEvidence({
    reader: readerFor({
      snapshots: options.second ? [value, options.second] : [value],
      physical: options.physical,
    }).reader,
  });
}

async function decisionFor(
  value: StorageAdministrationSnapshotRead,
  options: {
    boot?: unknown;
    rollbackReserveRequired?: boolean;
    evidence?: StorageRetentionEvidence;
    plan?: StorageRetentionPlan;
    physical?: ReadonlyMap<string, HistoryGenerationSnapshot>;
  } = {},
): Promise<StorageRetentionDecision> {
  const evidence = options.evidence ?? await evidenceFor(value, {
    physical: options.physical,
  });
  return decideStorageRetention({
    plan: options.plan ?? planFor(value),
    evidence,
    boot: options.boot ?? READY_BOOT,
    rollbackReserveRequired: options.rollbackReserveRequired ?? false,
  });
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function expectNoAuthority(result: StorageRetentionDecision): void {
  expect(result.ownerTokenRequired).toBe(true);
  expect(result.executionAuthorized).toBe(false);
  expect(result.deleteAuthorized).toBe(false);
  expect('delete' in result).toBe(false);
}

describe('decisão pura de retenção', () => {
  it('falha fechado para armazenamento vazio', async () => {
    const result = await decisionFor(emptySnapshot());

    expect(result).toMatchObject({
      status: 'blocked-unknown-state',
      reason: 'unknown-state',
      generations: {
        evaluated: 0,
        keep: 0,
        protected: 0,
        futureDeleteCandidate: 0,
      },
    });
    expectNoAuthority(result);
  });

  it('mantém a única geração ativa sem fabricar candidatura', async () => {
    const result = await decisionFor(snapshot());

    expect(result).toMatchObject({
      status: 'decision-ready',
      reason: 'retention-classified',
      generations: {
        evaluated: 1,
        keep: 1,
        protected: 0,
        futureDeleteCandidate: 0,
      },
      bootProofVerified: true,
    });
    expectNoAuthority(result);
  });

  it('protege a única geração anterior verificada para rollback futuro', async () => {
    const result = await decisionFor(withHistorical(HISTORICAL_ID), {
      rollbackReserveRequired: true,
    });

    expect(result).toMatchObject({
      status: 'decision-ready',
      generations: {
        evaluated: 2,
        keep: 1,
        protected: 1,
        futureDeleteCandidate: 0,
      },
    });
    expectNoAuthority(result);
  });

  it('reserva uma anterior e conta somente as históricas excedentes como candidatas futuras', async () => {
    const result = await decisionFor(withHistorical(
      HISTORICAL_ID,
      'generation-historical-two-PRIVATE_ID',
      'generation-historical-three-PRIVATE_ID',
    ), {
      rollbackReserveRequired: true,
    });

    expect(result).toMatchObject({
      status: 'decision-ready',
      generations: {
        evaluated: 4,
        keep: 1,
        protected: 1,
        futureDeleteCandidate: 2,
      },
    });
    expectNoAuthority(result);
  });

  it('bloqueia geração de migração mesmo fisicamente verificada', async () => {
    const migrationManifest = manifest(MIGRATION_ID);
    const value = snapshot({
      metadata: {
        activeGeneration: ACTIVE_ID,
        migrationGeneration: MIGRATION_ID,
        schemaVersion: 1,
        migrationStatus: 'in-progress',
        migratedAt: null,
        sourceStorageVersion: 2,
      },
      migrationGenerationId: MIGRATION_ID,
      generations: [
        generation(ACTIVE_ID, { isActive: true }),
        generation(MIGRATION_ID, { isStaged: true }),
      ],
      manifests: [manifest(ACTIVE_ID), migrationManifest],
    });

    const result = await decisionFor(value);

    expect(result.status).toBe('blocked-active-or-migration-reference');
    expect(result.generations.futureDeleteCandidate).toBe(0);
    expectNoAuthority(result);
  });

  it('bloqueia operation receipt sem interpretar ou consumir seu conteúdo', async () => {
    const receipt = operation();
    const result = await decisionFor(snapshot({
      operationReceipts: [receipt],
      unsettledOperations: [receipt],
    }));

    expect(result.status).toBe('blocked-operation-receipt');
    expect(result.reason).toBe('operation-receipt-present');
    expectNoAuthority(result);
  });

  it('bloqueia completion receipt sem interpretar ou consumir seu conteúdo', async () => {
    const result = await decisionFor(snapshot({
      pendingCompletionReceipts: [completion()],
    }));

    expect(result.status).toBe('blocked-completion-receipt');
    expect(result.reason).toBe('completion-receipt-present');
    expectNoAuthority(result);
  });

  it('trata órfã íntegra única como reserva protegida, não candidata', async () => {
    const result = await decisionFor(withHistorical(HISTORICAL_ID));

    expect(result.status).toBe('decision-ready');
    expect(result.generations).toMatchObject({
      protected: 1,
      futureDeleteCandidate: 0,
    });
  });

  it('bloqueia órfã adulterada como fisicamente não verificada', async () => {
    const value = withHistorical(HISTORICAL_ID);
    const badManifest = manifest(HISTORICAL_ID, {
      orderedDigest: 'sha256:PRIVATE_TAMPERED_DIGEST',
    });
    const result = await decisionFor(value, {
      physical: new Map([
        [HISTORICAL_ID, physicalSnapshot(HISTORICAL_ID, { manifest: badManifest })],
      ]),
    });

    expect(result.status).toBe('blocked-physical-unverified');
    expect(result.generations.futureDeleteCandidate).toBe(0);
    expectNoAuthority(result);
  });

  it('bloqueia ausência física sem transformar resumo verified em prova', async () => {
    const value = withHistorical(HISTORICAL_ID);
    const result = await decisionFor(value, {
      physical: new Map([
        [HISTORICAL_ID, {
          present: false,
          manifest: null,
          sessions: [],
          recordDigests: [],
        }],
      ]),
    });

    expect(result.status).toBe('blocked-physical-unverified');
    expectNoAuthority(result);
  });

  it('bloqueia snapshot instável antes de calcular candidatura', async () => {
    const first = snapshot({ fingerprint: 'PRIVATE_FINGERPRINT_A' });
    const second = snapshot({ fingerprint: 'PRIVATE_FINGERPRINT_B' });
    const evidence = await evidenceFor(first, { second });
    const result = await decisionFor(first, { evidence });

    expect(result).toMatchObject({
      status: 'blocked-snapshot-unstable',
      reason: 'snapshot-unstable',
      generations: { futureDeleteCandidate: 0 },
    });
    expectNoAuthority(result);
  });

  it('bloqueia active igual a migration com razão fechada específica', async () => {
    const value = snapshot({
      metadata: {
        activeGeneration: ACTIVE_ID,
        migrationGeneration: ACTIVE_ID,
        schemaVersion: 1,
        migrationStatus: 'in-progress',
        migratedAt: null,
        sourceStorageVersion: 2,
      },
      migrationGenerationId: ACTIVE_ID,
      generations: [generation(ACTIVE_ID, { isActive: true, isStaged: true })],
    });

    const result = await decisionFor(value);

    expect(result.status).toBe('blocked-active-or-migration-reference');
    expectNoAuthority(result);
  });

  it('explicita ausência da geração anterior quando a reserva é obrigatória', async () => {
    const result = await decisionFor(snapshot(), {
      rollbackReserveRequired: true,
    });

    expect(result).toMatchObject({
      status: 'blocked-insufficient-previous-generation',
      reason: 'previous-generation-missing',
    });
    expectNoAuthority(result);
  });

  it('bloqueia quando o boot bem-sucedido não foi comprovado', async () => {
    const result = await decisionFor(snapshot(), { boot: BLOCKED_BOOT });

    expect(result).toMatchObject({
      status: 'blocked-boot-proof-missing',
      reason: 'boot-proof-missing',
      bootProofVerified: false,
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_INTERNAL_BOOT_MESSAGE');
    expectNoAuthority(result);
  });

  it('bloqueia boot ready que ainda declara cleanup pendente', async () => {
    const result = await decisionFor(snapshot(), {
      boot: {
        status: 'ready-after-settled',
        hydrationAllowed: true,
        cleanupPending: true,
      },
    });

    expect(result.status).toBe('blocked-boot-proof-missing');
    expectNoAuthority(result);
  });

  it('não promove planner bloqueado por estado não resolvido', async () => {
    const result = await decisionFor(snapshot(), {
      plan: {
        status: 'blocked',
        reason: 'cleanup-pending',
        delete: [],
      },
    });

    expect(result.status).toBe('blocked-unknown-state');
    expectNoAuthority(result);
  });

  it('bloqueia planner e evidência contraditórios', async () => {
    const activeOnly = snapshot();
    const historical = withHistorical(HISTORICAL_ID);
    const result = decideStorageRetention({
      plan: planFor(activeOnly),
      evidence: await evidenceFor(historical),
      boot: READY_BOOT,
      rollbackReserveRequired: false,
    });

    expect(result.status).toBe('blocked-unknown-state');
    expect(result.generations.futureDeleteCandidate).toBe(0);
    expectNoAuthority(result);
  });

  it('bloqueia conflito estrutural comprovado', async () => {
    const activeManifest = manifest(ACTIVE_ID);
    const value = snapshot({
      manifests: [activeManifest, { ...activeManifest }],
    });
    const result = await decisionFor(value);

    expect(result.status).toBe('blocked-structural-conflict');
    expectNoAuthority(result);
  });

  it.each([
    null,
    undefined,
    {},
    { plan: null, evidence: null, boot: null, rollbackReserveRequired: false },
    {
      plan: { status: 'PRIVATE_UNKNOWN', reason: 'PRIVATE_REASON', delete: [] },
      evidence: {},
      boot: READY_BOOT,
      rollbackReserveRequired: false,
    },
  ])('falha fechado para resultado desconhecido: %#', (input) => {
    const result = decideStorageRetention(input as never);

    expect(result).toMatchObject({
      status: 'blocked-unknown-state',
      reason: 'unknown-state',
      generations: {
        evaluated: 0,
        keep: 0,
        protected: 0,
        futureDeleteCandidate: 0,
      },
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
    expectNoAuthority(result);
  });

  it('é determinístico e não altera as estruturas de entrada', async () => {
    const value = withHistorical(HISTORICAL_ID, 'generation-second-PRIVATE_ID');
    const input = {
      plan: planFor(value),
      evidence: await evidenceFor(value),
      boot: READY_BOOT,
      rollbackReserveRequired: true,
    };
    const before = JSON.stringify(input);

    const first = decideStorageRetention(input);
    const second = decideStorageRetention(input);

    expect(second).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('aceita entrada profundamente congelada e devolve resultado deep-frozen', async () => {
    const value = withHistorical(HISTORICAL_ID, 'generation-second-PRIVATE_ID');
    const input = deepFreeze({
      plan: planFor(value),
      evidence: await evidenceFor(value),
      boot: { ...READY_BOOT },
      rollbackReserveRequired: true,
    });

    const result = decideStorageRetention(input);

    expect(result.status).toBe('decision-ready');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.generations)).toBe(true);
    expect(() => {
      (result.generations as { protected: number }).protected = 99;
    }).toThrow();
  });

  it('duas decisões concorrentes são idênticas e sem coordenação mutável', async () => {
    const value = withHistorical(HISTORICAL_ID, 'generation-second-PRIVATE_ID');
    const input = {
      plan: planFor(value),
      evidence: await evidenceFor(value),
      boot: READY_BOOT,
      rollbackReserveRequired: true,
    };

    const [left, right] = await Promise.all([
      Promise.resolve().then(() => decideStorageRetention(input)),
      Promise.resolve().then(() => decideStorageRetention(input)),
    ]);

    expect(left).toEqual(right);
    expectNoAuthority(left);
  });

  it('não expõe ids, dados privados, digest, fingerprint, raw, stack ou cause', async () => {
    const privateError = new Error('PRIVATE_INDEXEDDB_MESSAGE PRIVATE_NAME');
    privateError.cause = 'PRIVATE_CAUSE PRIVATE_EMAIL';
    const result = decideStorageRetention({
      plan: {
        status: 'blocked',
        reason: 'snapshot-invalid',
        delete: [],
      },
      evidence: await evidenceFor(snapshot()),
      boot: {
        ...BLOCKED_BOOT,
        message: privateError.message,
        cause: privateError,
      },
      rollbackReserveRequired: false,
    });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('PRIVATE_');
    expect(serialized).not.toContain(ACTIVE_ID);
    expect('cause' in result).toBe(false);
    expect('stack' in result).toBe(false);
    expectNoAuthority(result);
  });

  it('usa somente as duas leituras da evidência e zero escrita ou deleção', async () => {
    const value = withHistorical(HISTORICAL_ID);
    const auditReader = readerFor({ snapshots: [value] });
    const evidence = await inspectStorageRetentionEvidence({
      reader: auditReader.reader,
    });
    const before = JSON.stringify(value);

    const result = decideStorageRetention({
      plan: planFor(value),
      evidence,
      boot: READY_BOOT,
      rollbackReserveRequired: true,
    });

    expect(result.status).toBe('decision-ready');
    expect(auditReader.readAdministration).toHaveBeenCalledTimes(2);
    expect(auditReader.readGeneration).toHaveBeenCalledTimes(2);
    expect(Object.keys(auditReader.reader).sort()).toEqual([
      'readHistoryGenerationSnapshot',
      'readStorageAdministrationSnapshot',
    ]);
    expect(JSON.stringify(value)).toBe(before);
    expectNoAuthority(result);
  });
});

const SOURCE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DECISION_SOURCE = join(SOURCE_ROOT, 'lib', 'storage-retention-decision.ts');

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

describe('guards da decisão de retenção', () => {
  it('não chama escrita, delete, limpeza, recovery, ativação ou rollback', () => {
    const source = codeOf(DECISION_SOURCE);
    const forbiddenCalls = [
      /\.\s*(?:delete|remove|clear)\s*\(/,
      /\bclearInactiveGeneration\s*\(/,
      /\brecover\w*\s*\(/,
      /\bactivate\w*\s*\(/,
      /\brollback\w*\s*\(/,
      /\bsetItem\s*\(/,
      /\bremoveItem\s*\(/,
      /\bindexedDB\b/,
      /\blocalStorage\b/,
      /\brandomUUID\b/,
      /\bMath\.random\b/,
      /\bnew Date\b/,
    ];

    for (const pattern of forbiddenCalls) expect(source).not.toMatch(pattern);
  });

  it('não importa React, adapter, runtime administrativo, UI ou boot executor', () => {
    const source = codeOf(DECISION_SOURCE);
    expect(source).not.toMatch(/from\s+['"]react['"]/);
    expect(source).not.toMatch(/storage-adapter/);
    expect(source).not.toMatch(/storage-admin-runtime/);
    expect(source).not.toMatch(/storage-indexeddb/);
    expect(source).not.toMatch(/runStorageBootRecovery/);
  });

  it('não possui call site de produção, componente ou Provider', () => {
    const callers = listFiles(SOURCE_ROOT, ['.ts', '.tsx'])
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => /\bdecideStorageRetention\s*\(/.test(codeOf(file)))
      .map(relativeSource)
      .sort();

    expect(callers).toEqual(['src/lib/storage-retention-decision.ts']);
  });

  it('mantém owner-token como requisito e nunca como autoridade implementada', () => {
    const source = codeOf(DECISION_SOURCE);
    expect(source).toContain('ownerTokenRequired: true');
    expect(source).toContain('executionAuthorized: false');
    expect(source).toContain('deleteAuthorized: false');
    expect(source).not.toMatch(/\bownerToken\s*:/);
    expect(source).not.toMatch(/\bacquire\w*Token\s*\(/);
    expect(source).not.toMatch(/\brelease\w*Token\s*\(/);
  });
});
