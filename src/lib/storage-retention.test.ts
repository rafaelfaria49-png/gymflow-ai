import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  HistoryGenerationSummary,
  StorageAdministrationSnapshotRead,
} from './storage-adapter';
import type { WorkoutCompletionReceipt } from './storage-completion-receipt';
import { EMPTY_GENERATION_DIGEST, type HistoryGenerationManifest } from './storage-history-integrity';
import { createStorageOperationReceipt, type StorageOperationReceipt } from './storage-operation-receipt';
import {
  planStorageRetention,
  type StorageRetentionDecision,
} from './storage-retention';

const CREATED_AT = '2026-07-28T09:00:00.000Z';

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

function manifest(generationId: string): HistoryGenerationManifest {
  return {
    generationId,
    sessionCount: 0,
    orderedDigest: EMPTY_GENERATION_DIGEST,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    verified: true,
  };
}

function operation(
  operationId: string,
  overrides: Partial<StorageOperationReceipt> = {},
): StorageOperationReceipt {
  return {
    ...createStorageOperationReceipt({
      operationId,
      kind: 'import',
      previousCoreRaw: '{"v":2,"private":"previous"}',
      previousGenerationId: 'generation-active',
      createdAt: CREATED_AT,
    }),
    ...overrides,
  };
}

function completion(
  receiptId: string,
  generationId: string,
  coreGenerationId = generationId,
): WorkoutCompletionReceipt {
  return {
    receiptId,
    sessionId: 'session-private',
    generationId,
    sessionDigest: 'sha256:private',
    finalSession: { id: 'session-private', name: 'PRIVATE_NAME' } as never,
    coreEnvelopeAfter: {
      historyStorage: {
        backend: 'indexeddb',
        schemaVersion: 1,
        generationId: coreGenerationId,
      },
    } as never,
    effects: {
      xpNotifications: [],
      communityPost: { id: 'post-private', author: 'PRIVATE_EMAIL@example.com' } as never,
      unlockedAchievementIds: [],
      markedDayName: 'PRIVATE_TRAINING',
    },
    createdAt: CREATED_AT,
    status: 'pending',
    settledAt: null,
  };
}

function snapshot(
  overrides: Partial<StorageAdministrationSnapshotRead> = {},
): StorageAdministrationSnapshotRead {
  const active = generation('generation-active', { isActive: true });
  return {
    metadata: {
      activeGeneration: active.generationId,
      migrationGeneration: null,
      schemaVersion: 1,
      migrationStatus: 'completed',
      migratedAt: CREATED_AT,
      sourceStorageVersion: 2,
    },
    activeGenerationId: active.generationId,
    migrationGenerationId: null,
    generations: [active],
    manifests: [manifest(active.generationId)],
    activeGenerationRecords: [],
    activeGenerationManifest: manifest(active.generationId),
    activeGenerationPresent: true,
    operationReceipts: [],
    unsettledOperations: [],
    pendingCompletionReceipts: [],
    fingerprint: 'fingerprint-stable',
    ...overrides,
  };
}

function decision(
  decisions: readonly StorageRetentionDecision[],
  artifactKind: StorageRetentionDecision['artifactKind'],
  artifactId: string,
): StorageRetentionDecision | undefined {
  return decisions.find((entry) => (
    entry.artifactKind === artifactKind && entry.artifactId === artifactId
  ));
}

describe('planner conservador de retenção administrativa', () => {
  it('retorna policy-required e zero deleções sem política aprovada', () => {
    const plan = planStorageRetention(snapshot());

    expect(plan.status).toBe('policy-required');
    expect(plan.reason).toBe('policy-required');
    expect(plan.snapshotFingerprint).toBe('fingerprint-stable');
    expect(plan.delete).toEqual([]);
  });

  it('mantém core atual, backup rolante e snapshot legado por contrato', () => {
    const plan = planStorageRetention(snapshot());

    expect(plan.decisions.slice(0, 3)).toEqual([
      {
        artifactKind: 'current-core',
        artifactId: 'current-core',
        disposition: 'keep',
        reason: 'current-core',
      },
      {
        artifactKind: 'rolling-core-backup',
        artifactId: 'rolling-core-backup',
        disposition: 'keep',
        reason: 'rolling-core-backup',
      },
      {
        artifactKind: 'legacy-snapshot',
        artifactId: 'legacy-snapshot',
        disposition: 'keep',
        reason: 'legacy-snapshot',
      },
    ]);
  });

  it('nunca remove a geração ativa', () => {
    const plan = planStorageRetention(snapshot());
    expect(decision(plan.decisions, 'generation', 'generation-active')).toMatchObject({
      disposition: 'keep',
      reason: 'active-generation',
    });
  });

  it('nunca remove migrationGeneration', () => {
    const staged = generation('generation-migration', { isStaged: true });
    const plan = planStorageRetention(snapshot({
      metadata: {
        ...snapshot().metadata,
        migrationGeneration: staged.generationId,
      },
      migrationGenerationId: staged.generationId,
      generations: [...snapshot().generations, staged],
      manifests: [...snapshot().manifests, manifest(staged.generationId)],
    }));

    expect(decision(plan.decisions, 'generation', staged.generationId)).toMatchObject({
      disposition: 'keep',
      reason: 'migration-generation',
    });
  });

  it('protege previousGenerationId de operação não terminal', () => {
    const previous = generation('generation-previous');
    const receipt = operation('operation-open', {
      previousGenerationId: previous.generationId,
    });
    const plan = planStorageRetention(snapshot({
      generations: [...snapshot().generations, previous],
      manifests: [...snapshot().manifests, manifest(previous.generationId)],
      operationReceipts: [receipt],
      unsettledOperations: [receipt],
    }));

    expect(decision(plan.decisions, 'generation', previous.generationId)).toMatchObject({
      disposition: 'keep',
      reason: 'unsettled-previous-generation',
    });
  });

  it('protege stagedGenerationId de operação não terminal', () => {
    const staged = generation('generation-staged');
    const receipt = operation('operation-open', {
      stagedGenerationId: staged.generationId,
    });
    const plan = planStorageRetention(snapshot({
      generations: [...snapshot().generations, staged],
      manifests: [...snapshot().manifests, manifest(staged.generationId)],
      operationReceipts: [receipt],
      unsettledOperations: [receipt],
    }));

    expect(decision(plan.decisions, 'generation', staged.generationId)).toMatchObject({
      disposition: 'keep',
      reason: 'unsettled-staged-generation',
    });
  });

  it('protege toda geração citada por completion receipt pendente', () => {
    const sessionGeneration = generation('generation-session');
    const coreGeneration = generation('generation-core-after');
    const pending = completion('completion-1', sessionGeneration.generationId, coreGeneration.generationId);
    const plan = planStorageRetention(snapshot({
      generations: [...snapshot().generations, sessionGeneration, coreGeneration],
      manifests: [
        ...snapshot().manifests,
        manifest(sessionGeneration.generationId),
        manifest(coreGeneration.generationId),
      ],
      pendingCompletionReceipts: [pending],
    }));

    for (const generationId of [sessionGeneration.generationId, coreGeneration.generationId]) {
      expect(decision(plan.decisions, 'generation', generationId)).toMatchObject({
        disposition: 'keep',
        reason: 'pending-completion-generation',
      });
    }
  });

  it('mantém receipt não terminal e completion receipt pendente', () => {
    const receipt = operation('operation-open');
    const pending = completion('completion-1', 'generation-active');
    const plan = planStorageRetention(snapshot({
      operationReceipts: [receipt],
      unsettledOperations: [receipt],
      pendingCompletionReceipts: [pending],
    }));

    expect(decision(plan.decisions, 'operation-receipt', receipt.operationId)).toMatchObject({
      disposition: 'keep',
      reason: 'unsettled-operation-receipt',
    });
    expect(decision(plan.decisions, 'completion-receipt', pending.receiptId)).toMatchObject({
      disposition: 'keep',
      reason: 'pending-completion-receipt',
    });
  });

  it('mantém receipt com cleanupPending mesmo que terminal', () => {
    const receipt = {
      ...operation('operation-cleanup', { status: 'reverted' }),
      cleanupPending: true,
    } as StorageOperationReceipt;
    const plan = planStorageRetention(snapshot({ operationReceipts: [receipt] }));

    expect(decision(plan.decisions, 'operation-receipt', receipt.operationId)).toMatchObject({
      disposition: 'keep',
      reason: 'cleanup-pending',
    });
  });

  it('preserva referências de receipt terminal como evidência de rollback', () => {
    const previous = generation('generation-terminal-previous');
    const staged = generation('generation-terminal-staged');
    const receipt = operation('operation-terminal', {
      status: 'settled',
      previousGenerationId: previous.generationId,
      stagedGenerationId: staged.generationId,
      targetCoreRaw: '{"v":2,"private":"target"}',
    });
    const plan = planStorageRetention(snapshot({
      generations: [...snapshot().generations, previous, staged],
      manifests: [
        ...snapshot().manifests,
        manifest(previous.generationId),
        manifest(staged.generationId),
      ],
      operationReceipts: [receipt],
    }));

    for (const generationId of [previous.generationId, staged.generationId]) {
      expect(decision(plan.decisions, 'generation', generationId)).toMatchObject({
        disposition: 'keep',
        reason: 'terminal-operation-evidence',
      });
    }
    expect(decision(plan.decisions, 'operation-receipt', receipt.operationId)).toMatchObject({
      disposition: 'blocked',
      reason: 'policy-required',
    });
  });

  it('bloqueia geração órfã estruturalmente íntegra por falta de política', () => {
    const orphan = generation('generation-orphan');
    const plan = planStorageRetention(snapshot({
      generations: [...snapshot().generations, orphan],
      manifests: [...snapshot().manifests, manifest(orphan.generationId)],
    }));

    expect(decision(plan.decisions, 'generation', orphan.generationId)).toMatchObject({
      disposition: 'blocked',
      reason: 'policy-required',
    });
    expect(plan.delete).toEqual([]);
  });

  it.each([
    ['manifest ausente', { hasManifest: false }],
    ['flag não verificada', { verified: false }],
    ['contagem divergente', { recordCount: 2, manifestSessionCount: 1 }],
    ['digest ausente', { orderedDigest: null }],
  ])('bloqueia geração sem prova completa: %s', (_name, overrides) => {
    const orphan = generation('generation-invalid', overrides);
    const plan = planStorageRetention(snapshot({
      generations: [...snapshot().generations, orphan],
      manifests: [...snapshot().manifests, manifest(orphan.generationId)],
    }));

    expect(decision(plan.decisions, 'generation', orphan.generationId)).toMatchObject({
      disposition: 'blocked',
      reason: 'integrity-proof-required',
    });
  });

  it('é determinístico e independente da ordem das listas', () => {
    const left = generation('generation-z');
    const right = generation('generation-a');
    const first = operation('operation-z', { status: 'settled' });
    const second = operation('operation-a', { status: 'reverted' });
    const a = planStorageRetention(snapshot({
      generations: [...snapshot().generations, left, right],
      manifests: [...snapshot().manifests, manifest(left.generationId), manifest(right.generationId)],
      operationReceipts: [first, second],
    }));
    const b = planStorageRetention(snapshot({
      generations: [...snapshot().generations, right, left],
      manifests: [...snapshot().manifests, manifest(right.generationId), manifest(left.generationId)],
      operationReceipts: [second, first],
    }));

    expect(a).toEqual(b);
  });

  it('é idempotente e não altera o snapshot recebido', () => {
    const input = snapshot();
    const before = JSON.stringify(input);
    const first = planStorageRetention(input);
    const second = planStorageRetention(input);

    expect(second).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([
    null,
    {},
    { fingerprint: '' },
    snapshot({ generations: [] }),
    snapshot({ activeGenerationId: 'generation-missing' }),
  ])('falha fechado para snapshot inválido %#', (input) => {
    const plan = planStorageRetention(input);

    expect(plan).toMatchObject({
      status: 'blocked',
      reason: 'snapshot-invalid',
      snapshotFingerprint: null,
      delete: [],
    });
    expect(plan.decisions.at(-1)).toEqual({
      artifactKind: 'administration-snapshot',
      artifactId: 'administration-snapshot',
      disposition: 'blocked',
      reason: 'snapshot-invalid',
    });
  });

  it('bloqueia referência não terminal ausente', () => {
    const receipt = operation('operation-missing', {
      previousGenerationId: 'generation-missing',
    });
    const plan = planStorageRetention(snapshot({
      operationReceipts: [receipt],
      unsettledOperations: [receipt],
    }));

    expect(plan.status).toBe('blocked');
    expect(plan.delete).toEqual([]);
  });

  it('bloqueia referência de completion receipt ausente', () => {
    const plan = planStorageRetention(snapshot({
      pendingCompletionReceipts: [completion('completion-missing', 'generation-missing')],
    }));

    expect(plan.status).toBe('blocked');
    expect(plan.delete).toEqual([]);
  });

  it('bloqueia listas com identidades duplicadas', () => {
    const duplicate = generation('generation-active', { isActive: false });
    const plan = planStorageRetention(snapshot({
      generations: [...snapshot().generations, duplicate],
      manifests: [...snapshot().manifests, manifest(duplicate.generationId)],
    }));

    expect(plan.status).toBe('blocked');
  });

  it('captura exceção inesperada sem rejeitar nem expor causa', () => {
    const input = {
      get metadata() {
        throw new Error('PRIVATE_INDEXEDDB_NATIVE_MESSAGE');
      },
    };
    const plan = planStorageRetention(input);

    expect(plan.status).toBe('blocked');
    expect(JSON.stringify(plan)).not.toContain('PRIVATE_INDEXEDDB_NATIVE_MESSAGE');
  });

  it('não expõe raw, receipt inteiro, perfil, sessão ou treino', () => {
    const privateReceipt = operation('operation-private', {
      previousCoreRaw:
        'previousCoreRaw PRIVATE_NAME PRIVATE_EMAIL@example.com PRIVATE_SESSION PRIVATE_TRAINING',
      targetCoreRaw:
        'targetCoreRaw PRIVATE_NAME PRIVATE_EMAIL@example.com PRIVATE_SESSION PRIVATE_TRAINING',
      status: 'settled',
    });
    const pending = completion('completion-private', 'generation-active');
    const plan = planStorageRetention(snapshot({
      operationReceipts: [privateReceipt],
      pendingCompletionReceipts: [pending],
    }));
    const serialized = JSON.stringify(plan);

    for (const forbidden of [
      'previousCoreRaw',
      'targetCoreRaw',
      'PRIVATE_NAME',
      'PRIVATE_EMAIL',
      'PRIVATE_SESSION',
      'PRIVATE_TRAINING',
      'finalSession',
      'coreEnvelopeAfter',
      'stack',
      'cause',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

const SOURCE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function listFiles(root: string, extensions: readonly string[]): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
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
  it('tem somente o próprio teste como importador', () => {
    const importers = listFiles(SOURCE_ROOT, ['.ts', '.tsx'])
      .filter((file) => codeOf(file).includes("from './storage-retention'"))
      .map(relativeSource)
      .sort();

    expect(importers).toEqual(['src/lib/storage-retention.test.ts']);
  });

  it('não possui call site de produção', () => {
    const callers = listFiles(SOURCE_ROOT, ['.ts', '.tsx'])
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => /\bplanStorageRetention\s*\(/.test(codeOf(file)))
      .map(relativeSource)
      .sort();

    expect(callers).toEqual(['src/lib/storage-retention.ts']);
  });

  it('Provider, UI e Android não conhecem o planner', () => {
    const production = listFiles(SOURCE_ROOT, ['.ts', '.tsx'])
      .filter((file) => !/storage-retention(\.test)?\.ts$/.test(file))
      .filter((file) => codeOf(file).includes('storage-retention'))
      .map(relativeSource)
      .sort();
    const androidSourceRoot = join(REPO_ROOT, 'android', 'app', 'src');
    const android = listFiles(androidSourceRoot, ['.java', '.kt', '.ts', '.js'])
      .filter((file) => readFileSync(file, 'utf8').includes('storage-retention'))
      .map(relativeSource)
      .sort();

    expect(production).toEqual([]);
    expect(android).toEqual([]);
  });
});
