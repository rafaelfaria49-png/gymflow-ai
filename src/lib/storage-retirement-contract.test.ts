import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifyStorageRetirement,
  gateStorageRetirementByProductPolicy,
  type StorageRetirementClassification,
} from './storage-retirement-contract';

const SOURCE_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const REPO_ROOT = join(SOURCE_ROOT, '..');
const CONTRACT_SOURCE = join(SOURCE_ROOT, 'lib', 'storage-retirement-contract.ts');

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    candidateGenerationId: 'generation-a',
    reservedPredecessorGenerationId: 'generation-z1',
    currentGenerationId: 'generation-z2',
    supersedeOperationIds: ['reset-z1'],
    revalidationFingerprint: 'fingerprint-ciclo',
    ...overrides,
  };
}

function expectNoAuthority(result: StorageRetirementClassification): void {
  expect(result.ownerTokenRequired).toBe(true);
  expect(result.executionAuthorized).toBe(false);
  expect(result.deleteAuthorized).toBe(false);
  expect(result.writeAuthorized).toBe(false);
}

function listFiles(root: string, extensions: readonly string[]): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
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
    .replace(/(^|[^:])\/\/.*$/gm, ' ');
}

function relativeSource(file: string): string {
  return relative(REPO_ROOT, file).replace(/\\/g, '/');
}

describe('contrato puro de retirement', () => {
  it('classifica proposta valida sem prova fisica como blocked-physical-proof-missing', () => {
    const result = classifyStorageRetirement(validInput());
    expect(result).toMatchObject({
      status: 'blocked-physical-proof-missing',
      reason: 'physical-proof-missing',
      candidateGenerationId: 'generation-a',
      reservedPredecessorGenerationId: 'generation-z1',
      currentGenerationId: 'generation-z2',
      supersedeOperationIds: ['reset-z1'],
    });
    expectNoAuthority(result);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.supersedeOperationIds)).toBe(true);
  });

  it('recusa prova forjada e nao classifica retirement', () => {
    const forged = {
      candidateGenerationId: 'generation-a',
      reservedPredecessorGenerationId: 'generation-z1',
      currentGenerationId: 'generation-z2',
      supersedeOperationIds: ['reset-z1'],
      fingerprint: 'fingerprint-ciclo',
    };
    const result = classifyStorageRetirement(validInput({
      proof: forged,
      revalidationFingerprint: 'fingerprint-ciclo',
    }));
    expect(result.status).toBe('blocked-physical-proof-missing');
    expectNoAuthority(result);
  });

  it('recusa candidata igual a geracao atual', () => {
    const result = classifyStorageRetirement(validInput({
      candidateGenerationId: 'generation-z2',
    }));
    expect(result.status).toBe('blocked-candidate-protected');
    expectNoAuthority(result);
  });

  it('recusa predecessor reservado igual ao mundo atual', () => {
    const result = classifyStorageRetirement(validInput({
      reservedPredecessorGenerationId: 'generation-z2',
    }));
    expect(result.status).toBe('blocked-predecessor-not-reserved');
    expectNoAuthority(result);
  });

  it('recusa supersessao malformada e entrada desconhecida', () => {
    expect(classifyStorageRetirement(validInput({
      supersedeOperationIds: ['reset-z1', 'reset-z1'],
    })).status).toBe('blocked-supersession-invalid');
    expect(classifyStorageRetirement(validInput({
      extra: true,
    })).status).toBe('blocked-unknown-state');
    expect(classifyStorageRetirement(null).status).toBe('blocked-unknown-state');
    expectNoAuthority(classifyStorageRetirement(null));
  });
});

describe('gate de produto do retirement', () => {
  it('devolve saida sanitizada e sem autoridade mesmo quando elegivel', () => {
    const result = gateStorageRetirementByProductPolicy({
      mode: 'manual',
      selectedGenerationIds: ['generation-candidate-PRIVATE_ID'],
      currentGenerationId: 'generation-current-PRIVATE_ID',
      immediatePredecessorGenerationId: 'generation-predecessor-PRIVATE_ID',
      predecessorResolution: 'proved',
      protectedGenerationIds: [],
      activeGenerationId: 'generation-current-PRIVATE_ID',
      migrationGenerationId: null,
      stagedGenerationIds: [],
      recoveryGenerationIds: [],
      pendingCompletionGenerationIds: [],
      operationProtectedGenerationIds: [],
      associatedSessionCount: 2,
      associatedDataCount: 1,
    });
    expect(result.status).toBe('candidate-eligible');
    expect(result.executionAuthorized).toBe(false);
    expect(result.deleteAuthorized).toBe(false);
    expect(result.ownerTokenRequired).toBe(true);
    expect(result.humanConfirmationRequired).toBe(true);
    expect(result.selectionIsNotConfirmation).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('generation-candidate-PRIVATE_ID');
    expect(serialized).not.toContain('generation-predecessor-PRIVATE_ID');
    expect(serialized).not.toContain('generation-current-PRIVATE_ID');
  });

  it('nao transforma classificacao identitaria em execucao', () => {
    const classified = classifyStorageRetirement(validInput());
    expect(classified.status).toBe('blocked-physical-proof-missing');
    expectNoAuthority(classified);
    expect(classified.executionAuthorized).toBe(false);
    expect(classified.deleteAuthorized).toBe(false);
    expect(classified.writeAuthorized).toBe(false);
  });
});

describe('guards do contrato de retirement', () => {
  it('nao introduz primitive de delete, IndexedDB ou writer', () => {
    const source = codeOf(CONTRACT_SOURCE);
    const forbidden = [
      /\bdeleteDatabase\b/,
      /\bobjectStore\b/,
      /\.delete\s*\(/,
      /\.clear\s*\(/,
      /\bclearInactiveGeneration\b/,
      /\bdeleteGeneration\b/,
      /\bdeleteSession\b/,
      /\bsetItem\b/,
      /\bremoveItem\b/,
      /\bindexedDB\b/,
      /\bbeginStorageOperation\b/,
      /\btransitionStorageOperation\b/,
    ];
    for (const pattern of forbidden) expect(source).not.toMatch(pattern);
    expect(source).toContain('executionAuthorized: false');
    expect(source).toContain('deleteAuthorized: false');
    expect(source).toContain('writeAuthorized: false');
  });

  it('nao possui call site de UI, Provider ou painel', () => {
    const callers = listFiles(SOURCE_ROOT, ['.ts', '.tsx'])
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => /\bclassifyStorageRetirement\s*\(/.test(codeOf(file)))
      .map(relativeSource)
      .sort();
    expect(callers).toEqual(['src/lib/storage-retirement-contract.ts']);
  });
});
