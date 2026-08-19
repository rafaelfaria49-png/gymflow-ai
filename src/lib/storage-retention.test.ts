import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  HistoryGenerationSummary,
  StorageAdministrationSnapshotRead,
} from './storage-adapter';
import type { WorkoutCompletionReceipt } from './storage-completion-receipt';
import {
  EMPTY_GENERATION_DIGEST,
  type HistoryGenerationManifest,
} from './storage-history-integrity';
import {
  createStorageOperationReceipt,
  type StorageOperationKind,
  type StorageOperationReceipt,
} from './storage-operation-receipt';
import {
  planStorageRetention,
  type StorageRetentionPlan,
  type StorageRetentionReason,
} from './storage-retention';

const CREATED_AT = '2026-07-28T09:00:00.000Z';
const ACTIVE_GENERATION_ID = 'generation-active';

const PRIVATE_SENTINELS = [
  'PRIVATE_RAW',
  'PRIVATE_CORE',
  'PRIVATE_BACKUP',
  'PRIVATE_FINGERPRINT',
  'PRIVATE_WORKOUT',
  'PRIVATE_SESSION',
  'PRIVATE_NAME',
  'PRIVATE_EMAIL',
  'PRIVATE_STORAGE_MESSAGE',
  'PRIVATE_INDEXEDDB_MESSAGE',
] as const;

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

function operation(
  kind: StorageOperationKind,
  overrides: Record<string, unknown> = {},
): StorageOperationReceipt {
  const created = kind === 'restore'
    ? createStorageOperationReceipt({
        operationId: `operation-${kind}`,
        kind,
        previousCoreRaw: 'PRIVATE_RAW PRIVATE_CORE PRIVATE_BACKUP',
        previousGenerationId: ACTIVE_GENERATION_ID,
        targetGenerationId: 'generation-restore-target',
        targetCoreRaw: 'PRIVATE_RESTORE_TARGET',
        createdAt: CREATED_AT,
      })
    : createStorageOperationReceipt({
        operationId: `operation-${kind}`,
        kind,
        previousCoreRaw: 'PRIVATE_RAW PRIVATE_CORE PRIVATE_BACKUP',
        previousGenerationId: ACTIVE_GENERATION_ID,
        createdAt: CREATED_AT,
      });
  return {
    ...created,
    ...overrides,
  } as unknown as StorageOperationReceipt;
}

function completion(): WorkoutCompletionReceipt {
  return {
    receiptId: 'completion-private',
    sessionId: 'PRIVATE_SESSION',
    generationId: ACTIVE_GENERATION_ID,
    sessionDigest: 'PRIVATE_WORKOUT',
    finalSession: {
      id: 'PRIVATE_SESSION',
      name: 'PRIVATE_NAME',
    } as never,
    coreEnvelopeAfter: {
      historyStorage: {
        backend: 'indexeddb',
        schemaVersion: 1,
        generationId: ACTIVE_GENERATION_ID,
      },
    } as never,
    effects: {
      xpNotifications: [],
      communityPost: {
        id: 'post-private',
        author: 'PRIVATE_EMAIL',
      } as never,
      unlockedAchievementIds: [],
      markedDayName: 'PRIVATE_WORKOUT',
    },
    createdAt: CREATED_AT,
    status: 'pending',
    settledAt: null,
  };
}

function snapshot(
  overrides: Partial<StorageAdministrationSnapshotRead> = {},
): StorageAdministrationSnapshotRead {
  const active = generation(ACTIVE_GENERATION_ID, { isActive: true });
  const activeManifest = manifest(ACTIVE_GENERATION_ID);
  return {
    metadata: {
      activeGeneration: ACTIVE_GENERATION_ID,
      migrationGeneration: null,
      schemaVersion: 1,
      migrationStatus: 'completed',
      migratedAt: CREATED_AT,
      sourceStorageVersion: 2,
    },
    activeGenerationId: ACTIVE_GENERATION_ID,
    migrationGenerationId: null,
    generations: [active],
    manifests: [activeManifest],
    activeGenerationRecords: [],
    activeGenerationManifest: { ...activeManifest },
    activeGenerationPresent: true,
    operationReceipts: [],
    unsettledOperations: [],
    pendingCompletionReceipts: [],
    fingerprint: 'PRIVATE_FINGERPRINT',
    ...overrides,
  };
}

function findPrivateSentinels(value: unknown): string[] {
  const found = new Set<string>();
  const seen = new WeakSet<object>();

  const inspectString = (candidate: string): void => {
    for (const sentinel of PRIVATE_SENTINELS) {
      if (candidate.includes(sentinel)) found.add(sentinel);
    }
  };

  const visit = (candidate: unknown): void => {
    if (typeof candidate === 'string') {
      inspectString(candidate);
      return;
    }
    if (
      candidate === null
      || (typeof candidate !== 'object' && typeof candidate !== 'function')
    ) {
      return;
    }
    if (seen.has(candidate)) return;
    seen.add(candidate);

    if (candidate instanceof Map) {
      for (const [key, entry] of candidate) {
        visit(key);
        visit(entry);
      }
    }
    if (candidate instanceof Set) {
      for (const entry of candidate) visit(entry);
    }
    if (candidate instanceof Error) {
      visit(candidate.name);
      visit(candidate.message);
      visit(candidate.stack);
      visit((candidate as Error & { cause?: unknown }).cause);
    }

    for (const key of Reflect.ownKeys(candidate)) {
      if (typeof key === 'string') inspectString(key);
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (descriptor && 'value' in descriptor) visit(descriptor.value);
    }
  };

  visit(value);
  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) inspectString(serialized);
  } catch {
    // O percurso recursivo acima também cobre estruturas cíclicas.
  }
  return [...found].sort();
}

function expectPrivateDataAbsent(plan: StorageRetentionPlan): void {
  expect(findPrivateSentinels(plan)).toEqual([]);
  expect(plan.delete).toEqual([]);
}

function expectBlocked(
  input: unknown,
  reason: Exclude<StorageRetentionReason, 'policy-required'>,
): StorageRetentionPlan {
  const plan = planStorageRetention(input);
  expect(plan).toEqual({
    status: 'blocked',
    reason,
    delete: [],
  });
  expectPrivateDataAbsent(plan);
  return plan;
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

describe('planner conservador de retenção administrativa', () => {
  it('retorna somente policy-required, motivo fechado e zero deleções no snapshot simples', () => {
    const plan = planStorageRetention(snapshot());

    expect(plan).toEqual({
      status: 'policy-required',
      reason: 'policy-required',
      delete: [],
    });
    expect(Object.keys(plan).sort()).toEqual(['delete', 'reason', 'status']);
    expectPrivateDataAbsent(plan);
  });

  it('ignora o fingerprint legado sem ler, transformar ou devolver dados privados', () => {
    const input = snapshot({ fingerprint: PRIVATE_SENTINELS.join(':') });
    const plan = planStorageRetention(input);

    expect(plan.status).toBe('policy-required');
    expect('snapshotFingerprint' in plan).toBe(false);
    expect('fingerprint' in plan).toBe(false);
    expectPrivateDataAbsent(plan);
  });

  it('trata verified somente como diagnóstico e aceita false quando resumo e manifest coincidem', () => {
    const active = generation(ACTIVE_GENERATION_ID, {
      isActive: true,
      verified: false,
    });
    const activeManifest = manifest(ACTIVE_GENERATION_ID, { verified: false });
    const plan = planStorageRetention(snapshot({
      generations: [active],
      manifests: [activeManifest],
      activeGenerationManifest: { ...activeManifest },
    }));

    expect(plan.status).toBe('policy-required');
    expectPrivateDataAbsent(plan);
  });

  it('bloqueia metadata contraditória', () => {
    expectBlocked(snapshot({
      metadata: {
        ...snapshot().metadata,
        schemaVersion: 0,
      },
    }), 'snapshot-invalid');
  });

  it('bloqueia ponteiro activeGeneration divergente', () => {
    expectBlocked(snapshot({
      metadata: {
        ...snapshot().metadata,
        activeGeneration: 'PRIVATE_BACKUP',
      },
    }), 'snapshot-invalid');
  });

  it('bloqueia migrationGeneration divergente entre metadata e top-level', () => {
    expectBlocked(snapshot({
      metadata: {
        ...snapshot().metadata,
        migrationGeneration: 'PRIVATE_SESSION',
      },
      migrationGenerationId: null,
    }), 'snapshot-invalid');
  });

  it.each([
    'not-started',
    'in-progress',
    'failed',
  ] as const)('bloqueia migrationStatus não concluído: %s', (migrationStatus) => {
    expectBlocked(snapshot({
      metadata: {
        ...snapshot().metadata,
        migrationStatus,
      },
    }), 'snapshot-invalid');
  });

  it('bloqueia duas gerações ativas', () => {
    const second = generation('generation-second', { isActive: true });
    expectBlocked(snapshot({
      generations: [...snapshot().generations, second],
      manifests: [...snapshot().manifests, manifest(second.generationId)],
    }), 'physical-proof-required');
  });

  it('bloqueia flag isActive divergente', () => {
    expectBlocked(snapshot({
      generations: [generation(ACTIVE_GENERATION_ID, { isActive: false })],
    }), 'snapshot-invalid');
  });

  it('bloqueia geração duplicada', () => {
    const duplicate = generation(ACTIVE_GENERATION_ID, { isActive: false });
    expectBlocked(snapshot({
      generations: [...snapshot().generations, duplicate],
    }), 'snapshot-invalid');
  });

  it('bloqueia manifest duplicado', () => {
    expectBlocked(snapshot({
      manifests: [...snapshot().manifests, manifest(ACTIVE_GENERATION_ID)],
    }), 'snapshot-invalid');
  });

  it('bloqueia manifest sem geração conhecida', () => {
    expectBlocked(snapshot({
      manifests: [...snapshot().manifests, manifest('generation-unknown')],
    }), 'snapshot-invalid');
  });

  it('bloqueia geração ativa sem manifest', () => {
    expectBlocked(snapshot({
      manifests: [],
      activeGenerationManifest: null,
    }), 'snapshot-invalid');
  });

  it.each([
    'import',
    'restore',
    'rollback',
    'reset',
  ] as const)('bloqueia operation receipt aberto: %s', (kind) => {
    expectBlocked(snapshot({
      operationReceipts: [operation(kind)],
      unsettledOperations: [operation(kind)],
    }), 'operation-receipt-present');
  });

  it('receipt settled valido nao bloqueia sozinho o planner', () => {
    const plan = planStorageRetention(snapshot({
      operationReceipts: [operation('import', {
        status: 'settled',
        previousGenerationId: 'PRIVATE_SESSION',
        stagedGenerationId: 'PRIVATE_BACKUP',
        targetCoreRaw: 'PRIVATE_CORE',
      })],
    }));
    expect(plan.status).toBe('policy-required');
    expect(plan.reason).toBe('policy-required');
    expect(plan.delete).toEqual([]);
  });

  it('bloqueia kind desconhecido como snapshot-invalid', () => {
    expectBlocked(snapshot({
      operationReceipts: [{
        kind: 'PRIVATE_STORAGE_MESSAGE',
        previousCoreRaw: 'PRIVATE_RAW',
      } as never],
    }), 'snapshot-invalid');
  });

  it('bloqueia status desconhecido como snapshot-invalid', () => {
    expectBlocked(snapshot({
      operationReceipts: [{
        ...operation('import'),
        status: 'PRIVATE_INDEXEDDB_MESSAGE',
      } as never],
    }), 'snapshot-invalid');
  });

  it('bloqueia unsettled operation mesmo quando a lista histórica está vazia', () => {
    expectBlocked(snapshot({
      unsettledOperations: [{
        status: 'PRIVATE_STORAGE_MESSAGE',
      } as never],
    }), 'operation-receipt-present');
  });

  it('bloqueia completion receipt válido', () => {
    expectBlocked(snapshot({
      pendingCompletionReceipts: [completion()],
    }), 'completion-receipt-present');
  });

  it('bloqueia completion receipt malformado sem criar validador paralelo', () => {
    expectBlocked(snapshot({
      pendingCompletionReceipts: [{
        receiptId: 'PRIVATE_SESSION',
        cause: 'PRIVATE_INDEXEDDB_MESSAGE',
      } as never],
    }), 'completion-receipt-present');
  });

  it('bloqueia geração histórica aparentemente verified por falta de prova física', () => {
    const historical = generation('generation-historical', { verified: true });
    expectBlocked(snapshot({
      generations: [...snapshot().generations, historical],
      manifests: [...snapshot().manifests, manifest(historical.generationId)],
    }), 'physical-proof-required');
  });

  it('bloqueia qualquer geração inativa adicional', () => {
    const inactive = generation('generation-inactive', { verified: false });
    expectBlocked(snapshot({
      generations: [...snapshot().generations, inactive],
      manifests: [
        ...snapshot().manifests,
        manifest(inactive.generationId, { verified: false }),
      ],
    }), 'physical-proof-required');
  });

  it('bloqueia geração de migração mesmo quando os ponteiros coincidem', () => {
    expectBlocked(snapshot({
      metadata: {
        ...snapshot().metadata,
        migrationGeneration: 'generation-migration',
      },
      migrationGenerationId: 'generation-migration',
    }), 'physical-proof-required');
  });

  it('bloqueia cleanupPending sem devolver seu conteúdo', () => {
    expectBlocked({
      ...snapshot(),
      cleanupPending: true,
      cause: 'PRIVATE_STORAGE_MESSAGE',
    }, 'cleanup-pending');
  });

  it('bloqueia activeGenerationManifest divergente', () => {
    expectBlocked(snapshot({
      activeGenerationManifest: manifest(ACTIVE_GENERATION_ID, {
        orderedDigest: 'PRIVATE_BACKUP',
      }),
    }), 'snapshot-invalid');
  });

  it('bloqueia referência desconhecida nos registros da geração ativa', () => {
    const active = generation(ACTIVE_GENERATION_ID, {
      isActive: true,
      hasRecords: true,
      recordCount: 1,
      manifestSessionCount: 1,
      orderedDigest: 'digest-one',
    });
    const activeManifest = manifest(ACTIVE_GENERATION_ID, {
      sessionCount: 1,
      orderedDigest: 'digest-one',
    });
    expectBlocked(snapshot({
      generations: [active],
      manifests: [activeManifest],
      activeGenerationManifest: { ...activeManifest },
      activeGenerationRecords: [{
        generationId: 'generation-unknown',
        sessionId: 'PRIVATE_SESSION',
        order: 0,
        session: { id: 'PRIVATE_SESSION', name: 'PRIVATE_NAME' } as never,
        digest: 'digest-session',
      }],
    }), 'snapshot-invalid');
  });

  it('aceita registros ativos coerentes sem tratá-los como prova física', () => {
    const active = generation(ACTIVE_GENERATION_ID, {
      isActive: true,
      hasRecords: true,
      recordCount: 1,
      manifestSessionCount: 1,
      orderedDigest: 'digest-one',
    });
    const activeManifest = manifest(ACTIVE_GENERATION_ID, {
      sessionCount: 1,
      orderedDigest: 'digest-one',
    });
    const plan = planStorageRetention(snapshot({
      generations: [active],
      manifests: [activeManifest],
      activeGenerationManifest: { ...activeManifest },
      activeGenerationRecords: [{
        generationId: ACTIVE_GENERATION_ID,
        sessionId: 'PRIVATE_SESSION',
        order: 0,
        session: {
          id: 'PRIVATE_SESSION',
          name: 'PRIVATE_NAME',
          notes: 'PRIVATE_EMAIL PRIVATE_WORKOUT',
        } as never,
        digest: 'PRIVATE_CORE',
      }],
    }));

    expect(plan.status).toBe('policy-required');
    expectPrivateDataAbsent(plan);
  });

  it('bloqueia ids de sessão e ordens duplicados', () => {
    const active = generation(ACTIVE_GENERATION_ID, {
      isActive: true,
      hasRecords: true,
      recordCount: 2,
      manifestSessionCount: 2,
      orderedDigest: 'digest-two',
    });
    const activeManifest = manifest(ACTIVE_GENERATION_ID, {
      sessionCount: 2,
      orderedDigest: 'digest-two',
    });
    const duplicatedRecord = {
      generationId: ACTIVE_GENERATION_ID,
      sessionId: 'PRIVATE_SESSION',
      order: 0,
      session: { id: 'PRIVATE_SESSION' } as never,
      digest: 'digest-session',
    };
    expectBlocked(snapshot({
      generations: [active],
      manifests: [activeManifest],
      activeGenerationManifest: { ...activeManifest },
      activeGenerationRecords: [duplicatedRecord, { ...duplicatedRecord }],
    }), 'snapshot-invalid');
  });

  it('é idempotente, determinístico e não altera a entrada', () => {
    const input = snapshot();
    const before = JSON.stringify(input);
    const first = planStorageRetention(input);
    const second = planStorageRetention(input);

    expect(second).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
    expectPrivateDataAbsent(first);
  });

  it('aceita snapshot profundamente congelado', () => {
    const input = deepFreeze(snapshot());
    const plan = planStorageRetention(input);

    expect(plan.status).toBe('policy-required');
    expect(Object.isFrozen(input)).toBe(true);
    expectPrivateDataAbsent(plan);
  });

  it.each([
    null,
    undefined,
    {},
    { metadata: {} },
    { metadata: {}, generations: [] },
  ])('falha fechado para snapshot sem formato reconhecido: %#', (input) => {
    expectBlocked(input, 'snapshot-invalid');
  });

  it('captura exceção inesperada sem propagar stack, cause ou mensagem nativa', () => {
    const input = {
      get metadata() {
        const error = new Error('PRIVATE_INDEXEDDB_MESSAGE');
        error.cause = 'PRIVATE_STORAGE_MESSAGE';
        throw error;
      },
    };
    expectBlocked(input, 'snapshot-invalid');
  });
});

describe('inspetor recursivo de privacidade', () => {
  it('detecta sentinelas deliberadas em objetos, arrays, Map, Set, Error, stack e cause', () => {
    const error = new Error('PRIVATE_STORAGE_MESSAGE');
    error.stack = `stack ${'PRIVATE_INDEXEDDB_MESSAGE'}`;
    error.cause = new Set(['PRIVATE_CORE', { nested: 'PRIVATE_BACKUP' }]);
    const probe = new Map<unknown, unknown>([
      ['PRIVATE_RAW', ['PRIVATE_FINGERPRINT']],
      ['error', error],
      ['profile', { name: 'PRIVATE_NAME', email: 'PRIVATE_EMAIL' }],
      ['workout', { session: 'PRIVATE_SESSION', workout: 'PRIVATE_WORKOUT' }],
    ]);

    expect(findPrivateSentinels(probe)).toEqual([...PRIVATE_SENTINELS].sort());
  });
});

const SOURCE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RETENTION_SOURCE = join(SOURCE_ROOT, 'lib', 'storage-retention.ts');

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
      else if (extensions.some((extension) => entry.name.endsWith(extension))) found.push(full);
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

describe('guards do planner de retenção', () => {
  it('mantém o símbolo público somente na implementação, no facade read-only e no teste', () => {
    const files = listFiles(REPO_ROOT, ['.ts', '.tsx', '.md'])
      .filter((file) => readFileSync(file, 'utf8').includes('planStorageRetention'))
      .map(relativeSource)
      .sort();

    expect(files).toEqual([
      'src/lib/storage-admin-status.ts',
      'src/lib/storage-retention.test.ts',
      'src/lib/storage-retention.ts',
      'src/lib/storage-retirement-journal.test.ts',
    ]);
  });

  it('não possui Provider, UI, boot, runtime admin, Android, executor ou APIs mutáveis', () => {
    const source = codeOf(RETENTION_SOURCE);
    const forbidden = [
      /\bProvider\b/i,
      /\bUI\b/,
      /\bboot\b/i,
      /storage-admin-runtime/i,
      /\bAndroid\b/i,
      /\bexecutor\b/i,
      /\badapter\b/i,
      /\btransaction\b/i,
      /removeItem/,
      /objectStore\s*\.\s*delete/,
      /clearInactiveGeneration/,
    ];

    for (const pattern of forbidden) expect(source).not.toMatch(pattern);
  });

  it('não possui call site de produção direto', () => {
    const callers = listFiles(SOURCE_ROOT, ['.ts', '.tsx'])
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => /\bplanStorageRetention\s*\(/.test(codeOf(file)))
      .map(relativeSource)
      .sort();

    expect(callers).toEqual(['src/lib/storage-retention.ts']);
  });
});
