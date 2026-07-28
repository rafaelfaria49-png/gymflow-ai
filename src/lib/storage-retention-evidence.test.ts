import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import type {
  HistoryGenerationSummary,
  StorageAdministrationSnapshotRead,
} from './storage-adapter';
import type { WorkoutCompletionReceipt } from './storage-completion-receipt';
import {
  EMPTY_GENERATION_DIGEST,
  type HistoryGenerationManifest,
  type HistoryGenerationSnapshot,
} from './storage-history-integrity';
import { IndexedDbWorkoutHistoryStorage } from './storage-indexeddb';
import {
  createStorageOperationReceipt,
  type StorageOperationReceipt,
} from './storage-operation-receipt';
import {
  inspectStorageRetentionEvidence,
  type StorageRetentionEvidence,
  type StorageRetentionEvidenceReader,
} from './storage-retention-evidence';

const CREATED_AT = '2026-07-28T12:00:00.000Z';
const ACTIVE_ID = 'generation-active-PRIVATE_ID';
const MIGRATION_ID = 'generation-migration-PRIVATE_ID';
const HISTORICAL_ID = 'generation-historical-PRIVATE_ID';

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

function administrationSnapshot(
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
    fingerprint: 'PRIVATE_FINGERPRINT',
    ...overrides,
  };
}

function emptyAdministrationSnapshot(): StorageAdministrationSnapshotRead {
  return administrationSnapshot({
    metadata: {
      activeGeneration: null,
      migrationGeneration: null,
      schemaVersion: 1,
      migrationStatus: 'not-started',
      migratedAt: null,
      sourceStorageVersion: null,
    },
    activeGenerationId: null,
    migrationGenerationId: null,
    generations: [],
    manifests: [],
    activeGenerationRecords: [],
    activeGenerationManifest: null,
    activeGenerationPresent: false,
    fingerprint: 'PRIVATE_EMPTY_FINGERPRINT',
  });
}

function operation(
  overrides: Partial<StorageOperationReceipt> = {},
): StorageOperationReceipt {
  return {
    ...createStorageOperationReceipt({
      operationId: 'operation-PRIVATE_SESSION',
      kind: 'import',
      previousCoreRaw: 'PRIVATE_RAW PRIVATE_CORE PRIVATE_BACKUP',
      previousGenerationId: ACTIVE_ID,
      createdAt: CREATED_AT,
    }),
    ...overrides,
  };
}

function completion(): WorkoutCompletionReceipt {
  return {
    receiptId: 'completion-PRIVATE_SESSION',
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
        id: 'post-private',
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
  snapshots?: readonly StorageAdministrationSnapshotRead[];
  physical?: ReadonlyMap<string, HistoryGenerationSnapshot>;
  snapshotError?: unknown;
  generationError?: unknown;
} = {}): {
  reader: StorageRetentionEvidenceReader;
  readAdministration: ReturnType<typeof vi.fn>;
  readGeneration: ReturnType<typeof vi.fn>;
} {
  const snapshots = input.snapshots ?? [administrationSnapshot()];
  let snapshotIndex = 0;
  const readAdministration = vi.fn(async () => {
    if (input.snapshotError !== undefined) throw input.snapshotError;
    const index = Math.min(snapshotIndex, snapshots.length - 1);
    snapshotIndex += 1;
    return snapshots[index];
  });
  const readGeneration = vi.fn(async (generationId: string) => {
    if (input.generationError !== undefined) throw input.generationError;
    const custom = input.physical?.get(generationId);
    if (custom) return custom;
    const source = snapshots[0];
    const summary = source.generations.find((entry) => entry.generationId === generationId);
    const declaredManifest = source.manifests.find((entry) => entry.generationId === generationId);
    return {
      present: summary !== undefined || declaredManifest !== undefined,
      manifest: declaredManifest ?? null,
      sessions: [],
      recordDigests: [],
    };
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

function inspect(
  snapshot = administrationSnapshot(),
  physical?: ReadonlyMap<string, HistoryGenerationSnapshot>,
): Promise<StorageRetentionEvidence> {
  return inspectStorageRetentionEvidence({
    reader: readerFor({ snapshots: [snapshot], physical }).reader,
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

function expectDeepFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) expectDeepFrozen(descriptor.value, seen);
  }
}

describe('evidência física read-only para retenção', () => {
  it('classifica armazenamento vazio sem fabricar gerações', async () => {
    const result = await inspect(emptyAdministrationSnapshot());

    expect(result.status).toBe('inspected');
    expect(result.reason).toBe('evidence-collected');
    expect(result.generations).toEqual({
      observed: 0,
      evaluated: 0,
      active: 0,
      migration: 0,
      historical: 0,
      orphan: 0,
      complete: 0,
      incomplete: 0,
      structurallyConflicted: 0,
      physicallyVerified: 0,
      physicallyUnverified: 0,
      missingReferenced: 0,
    });
  });

  it('verifica fisicamente a única geração ativa saudável', async () => {
    const result = await inspect();

    expect(result.status).toBe('inspected');
    expect(result.generations).toMatchObject({
      observed: 1,
      active: 1,
      complete: 1,
      physicallyVerified: 1,
      physicallyUnverified: 0,
    });
  });

  it('distingue ativa e migração coerentes', async () => {
    const migrationManifest = manifest(MIGRATION_ID);
    const result = await inspect(administrationSnapshot({
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
    }));

    expect(result.status).toBe('inspected');
    expect(result.generations).toMatchObject({
      active: 1,
      migration: 1,
      complete: 2,
      physicallyVerified: 2,
    });
    expect(result.references.migrationPointers).toBe(1);
  });

  it('distingue geração histórica íntegra e sem referência administrativa', async () => {
    const result = await inspect(administrationSnapshot({
      generations: [
        generation(ACTIVE_ID, { isActive: true }),
        generation(HISTORICAL_ID),
      ],
      manifests: [manifest(ACTIVE_ID), manifest(HISTORICAL_ID)],
    }));

    expect(result.status).toBe('inspected');
    expect(result.generations).toMatchObject({
      active: 1,
      historical: 1,
      orphan: 1,
      complete: 2,
      physicallyVerified: 2,
    });
  });

  it('mantém histórica com digest inválido como fisicamente não verificada', async () => {
    const invalidManifest = manifest(HISTORICAL_ID, {
      sessionCount: 1,
      orderedDigest: 'sha256:PRIVATE_INVALID_DIGEST',
    });
    const snapshot = administrationSnapshot({
      generations: [
        generation(ACTIVE_ID, { isActive: true }),
        generation(HISTORICAL_ID, {
          hasRecords: true,
          recordCount: 1,
          manifestSessionCount: 1,
          orderedDigest: invalidManifest.orderedDigest,
        }),
      ],
      manifests: [manifest(ACTIVE_ID), invalidManifest],
    });
    const physical = new Map([
      [HISTORICAL_ID, physicalSnapshot(HISTORICAL_ID, {
        manifest: invalidManifest,
        sessions: [{ id: 'PRIVATE_SESSION', name: 'PRIVATE_WORKOUT' } as never],
        recordDigests: [null],
      })],
    ]);

    const result = await inspect(snapshot, physical);

    expect(result.status).toBe('inspected');
    expect(result.generations).toMatchObject({
      historical: 1,
      complete: 2,
      physicallyVerified: 1,
      physicallyUnverified: 1,
    });
    expect(result.anomalies.verificationFailures).toBe(1);
  });

  it('classifica geração órfã e incompleta sem manifest', async () => {
    const orphan = generation(HISTORICAL_ID, {
      hasManifest: false,
      hasRecords: true,
      recordCount: 1,
      manifestSessionCount: null,
      orderedDigest: null,
      verified: null,
      createdAt: null,
      updatedAt: null,
    });
    const snapshot = administrationSnapshot({
      generations: [generation(ACTIVE_ID, { isActive: true }), orphan],
      manifests: [manifest(ACTIVE_ID)],
    });
    const physical = new Map([
      [HISTORICAL_ID, physicalSnapshot(HISTORICAL_ID, {
        manifest: null,
        sessions: [{ id: 'PRIVATE_SESSION' } as never],
        recordDigests: [null],
      })],
    ]);

    const result = await inspect(snapshot, physical);

    expect(result.status).toBe('inspected');
    expect(result.generations).toMatchObject({
      historical: 1,
      orphan: 1,
      incomplete: 1,
      physicallyUnverified: 1,
    });
    expect(result.anomalies.missingManifests).toBe(1);
  });

  it('detecta manifest ausente na geração ativa', async () => {
    const active = generation(ACTIVE_ID, {
      isActive: true,
      hasManifest: false,
      manifestSessionCount: null,
      orderedDigest: null,
      verified: null,
      createdAt: null,
      updatedAt: null,
    });
    const snapshot = administrationSnapshot({
      generations: [active],
      manifests: [],
      activeGenerationManifest: null,
    });
    const physical = new Map([
      [ACTIVE_ID, physicalSnapshot(ACTIVE_ID, { manifest: null })],
    ]);

    const result = await inspect(snapshot, physical);

    expect(result.status).toBe('inspected');
    expect(result.generations).toMatchObject({
      active: 1,
      incomplete: 1,
      physicallyUnverified: 1,
    });
    expect(result.anomalies.missingManifests).toBe(1);
  });

  it('detecta manifest duplicado e falha fechado', async () => {
    const activeManifest = manifest(ACTIVE_ID);
    const result = await inspect(administrationSnapshot({
      manifests: [activeManifest, { ...activeManifest }],
      activeGenerationManifest: { ...activeManifest },
    }));

    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'structurally-conflicted',
    });
    expect(result.anomalies.duplicateManifests).toBe(1);
    expect(result.generations.structurallyConflicted).toBe(1);
    expect(result.generations.physicallyVerified).toBe(0);
  });

  it('detecta ponteiro para geração fisicamente inexistente', async () => {
    const snapshot = administrationSnapshot({
      generations: [],
      manifests: [],
      activeGenerationManifest: null,
      activeGenerationPresent: false,
    });
    const physical = new Map([
      [ACTIVE_ID, {
        present: false,
        manifest: null,
        sessions: [],
        recordDigests: [],
      }],
    ]);

    const result = await inspect(snapshot, physical);

    expect(result.status).toBe('blocked');
    expect(result.anomalies.danglingPointers).toBe(1);
    expect(result.generations.missingReferenced).toBe(1);
    expect(result.generations.physicallyUnverified).toBe(1);
  });

  it('detecta duas gerações marcadas como ativas', async () => {
    const second = 'generation-second-active-PRIVATE_ID';
    const result = await inspect(administrationSnapshot({
      generations: [
        generation(ACTIVE_ID, { isActive: true }),
        generation(second, { isActive: true }),
      ],
      manifests: [manifest(ACTIVE_ID), manifest(second)],
    }));

    expect(result.status).toBe('blocked');
    expect(result.anomalies.multipleActiveGenerations).toBe(1);
    expect(result.generations.structurallyConflicted).toBe(2);
  });

  it('identifica operation receipt sem consumi-lo', async () => {
    const receipt = operation();
    const snapshot = administrationSnapshot({
      operationReceipts: [receipt],
      unsettledOperations: [receipt],
    });
    const { reader, readAdministration } = readerFor({ snapshots: [snapshot] });

    const result = await inspectStorageRetentionEvidence({ reader });

    expect(result.references).toMatchObject({
      operationReceipts: 1,
      unsettledOperationReceipts: 1,
      operationProtectedGenerations: 1,
    });
    expect(readAdministration).toHaveBeenCalledTimes(2);
    expect(snapshot.operationReceipts).toEqual([receipt]);
  });

  it('identifica completion receipt sem consumi-lo', async () => {
    const receipt = completion();
    const snapshot = administrationSnapshot({
      pendingCompletionReceipts: [receipt],
    });

    const result = await inspect(snapshot);

    expect(result.references).toMatchObject({
      pendingCompletionReceipts: 1,
      completionProtectedGenerations: 1,
    });
    expect(snapshot.pendingCompletionReceipts).toEqual([receipt]);
  });

  it('sanitiza erro do IndexedDB sem propagar message, stack ou cause', async () => {
    const privateCause = new Error('PRIVATE_INDEXEDDB_MESSAGE PRIVATE_NAME');
    const { reader } = readerFor({ snapshotError: privateCause });

    const result = await inspectStorageRetentionEvidence({ reader });

    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('storage-read-failed');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
    expect('cause' in result).toBe(false);
  });

  it('detecta entrada adulterada sem confiar no tipo declarado', async () => {
    const adulterated = {
      ...generation(ACTIVE_ID, { isActive: true }),
      recordCount: -1,
    } as HistoryGenerationSummary;
    const result = await inspect(administrationSnapshot({
      generations: [adulterated],
    }));

    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('structurally-conflicted');
    expect(result.anomalies.malformedEntries).toBe(1);
    expect(result.generations.physicallyVerified).toBe(0);
  });

  it('falha fechado quando o snapshot muda durante a prova', async () => {
    const first = administrationSnapshot({ fingerprint: 'PRIVATE_FINGERPRINT_A' });
    const second = administrationSnapshot({ fingerprint: 'PRIVATE_FINGERPRINT_B' });
    const { reader } = readerFor({ snapshots: [first, second] });

    const result = await inspectStorageRetentionEvidence({ reader });

    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'snapshot-unstable',
    });
    expect(result.generations.evaluated).toBe(0);
  });

  it('duas inspeções simultâneas são idênticas e somente leem', async () => {
    const snapshot = administrationSnapshot();
    const { reader, readAdministration, readGeneration } = readerFor({
      snapshots: [snapshot],
    });

    const [left, right] = await Promise.all([
      inspectStorageRetentionEvidence({ reader }),
      inspectStorageRetentionEvidence({ reader }),
    ]);

    expect(left).toEqual(right);
    expect(readAdministration).toHaveBeenCalledTimes(4);
    expect(readGeneration).toHaveBeenCalledTimes(2);
  });

  it('é determinístico entre execuções sucessivas', async () => {
    const snapshot = administrationSnapshot();
    const { reader } = readerFor({ snapshots: [snapshot] });

    const first = await inspectStorageRetentionEvidence({ reader });
    const second = await inspectStorageRetentionEvidence({ reader });

    expect(first).toEqual(second);
  });

  it('aceita entradas profundamente congeladas e devolve resultado deep-frozen', async () => {
    const snapshot = deepFreeze(administrationSnapshot());
    const physical = deepFreeze(physicalSnapshot(ACTIVE_ID));
    const { reader } = readerFor({
      snapshots: [snapshot],
      physical: new Map([[ACTIVE_ID, physical]]),
    });

    const result = await inspectStorageRetentionEvidence({ reader });

    expect(result.status).toBe('inspected');
    expectDeepFrozen(result);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('não expõe ids, raws, digests, fingerprints, sessões ou conteúdo privado', async () => {
    const receipt = operation();
    const completionReceipt = completion();
    const snapshot = administrationSnapshot({
      operationReceipts: [receipt],
      unsettledOperations: [receipt],
      pendingCompletionReceipts: [completionReceipt],
      fingerprint: 'PRIVATE_FINGERPRINT',
    });

    const result = await inspect(snapshot);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('PRIVATE_');
    expect(serialized).not.toContain(ACTIVE_ID);
    expect(Object.keys(result).sort()).toEqual([
      'anomalies',
      'generations',
      'reason',
      'references',
      'status',
    ]);
  });

  it('prova zero escrita e zero delete sobre o adapter IndexedDB real', async () => {
    const factory = new IDBFactory();
    let generationSequence = 0;
    const adapter = new IndexedDbWorkoutHistoryStorage({
      factory,
      databaseName: 'gymflow-retention-evidence-readonly',
      generationIdFactory: () => `physical-generation-${generationSequence += 1}`,
      now: () => new Date(CREATED_AT),
    });
    await adapter.open();
    await adapter.replaceHistory([{
      id: 'PRIVATE_SESSION',
      name: 'PRIVATE_WORKOUT',
    } as never]);
    await adapter.replaceHistory([]);

    const before = await adapter.readStorageAdministrationSnapshot();
    const result = await inspectStorageRetentionEvidence({ reader: adapter });
    const after = await adapter.readStorageAdministrationSnapshot();

    expect(result.status).toBe('inspected');
    expect(result.generations).toMatchObject({
      active: 1,
      historical: 1,
      physicallyVerified: 2,
    });
    expect(after.fingerprint).toBe(before.fingerprint);
    expect(after.metadata).toEqual(before.metadata);
    expect(after.generations).toEqual(before.generations);
    expect(after.manifests).toEqual(before.manifests);
    expect(after.operationReceipts).toEqual(before.operationReceipts);
    expect(after.pendingCompletionReceipts).toEqual(before.pendingCompletionReceipts);
    adapter.close();
  });
});

const SOURCE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const EVIDENCE_SOURCE = join(SOURCE_ROOT, 'lib', 'storage-retention-evidence.ts');

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

describe('guards da evidência física de retenção', () => {
  it('possui apenas as duas capacidades read-only oficiais', () => {
    const source = codeOf(EVIDENCE_SOURCE);
    const forbidden = [
      /\bsetItem\b/,
      /\bremoveItem\b/,
      /\bwriteMetadata\b/,
      /\bclearInactiveGeneration\b/,
      /\bdeleteSession\b/,
      /\brollbackToHistoryGeneration\b/,
      /\bbeginStorageOperation\b/,
      /\btransitionStorageOperation\b/,
      /from\s+['"]\.\/storage-retention['"]/,
      /\brandomUUID\b/,
      /\bMath\.random\b/,
      /\bnew Date\b/,
    ];

    for (const pattern of forbidden) expect(source).not.toMatch(pattern);
    expect(source).toContain("'readStorageAdministrationSnapshot' | 'readHistoryGenerationSnapshot'");
    expect(source).toContain('verifyHistoryGeneration');
  });

  it('não possui call site de produção, UI, Provider ou boot', () => {
    const callers = listFiles(SOURCE_ROOT, ['.ts', '.tsx'])
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => /\binspectStorageRetentionEvidence\s*\(/.test(codeOf(file)))
      .map(relativeSource)
      .sort();

    expect(callers).toEqual(['src/lib/storage-retention-evidence.ts']);
  });

  it('não altera package.json nem package-lock.json por contrato de fonte', () => {
    const source = codeOf(EVIDENCE_SOURCE);
    expect(source).not.toMatch(/\bpackage(?:-lock)?\.json\b/);
    expect(source).not.toMatch(/\bindexedDB\.(?:deleteDatabase|open)\b/);
  });
});
