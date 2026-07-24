import { describe, expect, it } from 'vitest';
import {
  STORAGE_OPERATION_KINDS,
  STORAGE_OPERATION_STATUSES,
  type StorageOperationKind,
  type StorageOperationReceipt,
  type StorageOperationStatus,
  canTransitionStorageOperation,
  createStorageOperationReceipt,
  isStorageOperationKind,
  isStorageOperationReceipt,
  isStorageOperationStatus,
  isTerminalStorageOperationStatus,
} from './storage-operation-receipt';

function makeOperationReceipt(
  overrides: Partial<StorageOperationReceipt> = {},
): StorageOperationReceipt {
  return {
    operationId: 'operation-1',
    kind: 'rollback',
    sourceDigest: null,
    previousCoreRaw: '{"schemaVersion":1}',
    previousGenerationId: 'generation-1',
    stagedGenerationId: null,
    targetCoreRaw: null,
    status: 'staged',
    createdAt: '2026-07-24T12:00:00.000Z',
    updatedAt: '2026-07-24T12:00:00.000Z',
    ...overrides,
  };
}

describe('contrato do receipt de operação administrativa', () => {
  it('declara os quatro tipos e os cinco status', () => {
    expect(STORAGE_OPERATION_KINDS).toEqual(['import', 'restore', 'reset', 'rollback']);
    expect(STORAGE_OPERATION_STATUSES).toEqual([
      'staged',
      'activating',
      'activated',
      'settled',
      'reverted',
    ]);
    for (const kind of STORAGE_OPERATION_KINDS) expect(isStorageOperationKind(kind)).toBe(true);
    for (const status of STORAGE_OPERATION_STATUSES) {
      expect(isStorageOperationStatus(status)).toBe(true);
    }
    expect(isStorageOperationKind('completion')).toBe(false);
    expect(isStorageOperationStatus('pending')).toBe(false);
    expect(isStorageOperationStatus('completed')).toBe(false);
  });

  it('trata apenas settled e reverted como terminais', () => {
    expect(isTerminalStorageOperationStatus('settled')).toBe(true);
    expect(isTerminalStorageOperationStatus('reverted')).toBe(true);
    expect(isTerminalStorageOperationStatus('staged')).toBe(false);
    expect(isTerminalStorageOperationStatus('activating')).toBe(false);
    expect(isTerminalStorageOperationStatus('activated')).toBe(false);
    expect(isTerminalStorageOperationStatus('pending')).toBe(false);
  });

  it('aceita exatamente as transições declaradas e nenhuma outra', () => {
    const allowed: Record<StorageOperationStatus, StorageOperationStatus[]> = {
      staged: ['activating', 'reverted'],
      activating: ['activated', 'reverted'],
      activated: ['settled', 'reverted'],
      settled: [],
      reverted: [],
    };
    for (const from of STORAGE_OPERATION_STATUSES) {
      for (const to of STORAGE_OPERATION_STATUSES) {
        expect({ from, to, allowed: canTransitionStorageOperation(from, to) })
          .toEqual({ from, to, allowed: allowed[from].includes(to) });
      }
    }
  });

  it('cria receipt staged com createdAt igual a updatedAt', () => {
    const receipt = createStorageOperationReceipt({
      operationId: 'operation-9',
      kind: 'import',
      previousCoreRaw: '{"core":true}',
      previousGenerationId: 'generation-7',
      createdAt: '2026-07-24T12:00:00.000Z',
    });
    expect(receipt).toEqual({
      operationId: 'operation-9',
      kind: 'import',
      sourceDigest: null,
      previousCoreRaw: '{"core":true}',
      previousGenerationId: 'generation-7',
      stagedGenerationId: null,
      targetCoreRaw: null,
      status: 'staged',
      createdAt: '2026-07-24T12:00:00.000Z',
      updatedAt: '2026-07-24T12:00:00.000Z',
    });
    expect(isStorageOperationReceipt(receipt)).toBe(true);
  });

  it('aprova receipt válido em qualquer tipo e status', () => {
    for (const kind of STORAGE_OPERATION_KINDS) {
      for (const status of STORAGE_OPERATION_STATUSES) {
        expect(isStorageOperationReceipt(makeOperationReceipt({ kind, status }))).toBe(true);
      }
    }
    expect(isStorageOperationReceipt(makeOperationReceipt({
      sourceDigest: 'sha256:abc',
      stagedGenerationId: 'generation-2',
      targetCoreRaw: '{"schemaVersion":1}',
    }))).toBe(true);
  });

  it('recusa registro malformado sem tentar consertar', () => {
    expect(isStorageOperationReceipt(null)).toBe(false);
    expect(isStorageOperationReceipt(undefined)).toBe(false);
    expect(isStorageOperationReceipt('operation-1')).toBe(false);
    expect(isStorageOperationReceipt({})).toBe(false);
    expect(isStorageOperationReceipt(makeOperationReceipt({ operationId: '' }))).toBe(false);
    expect(isStorageOperationReceipt({
      ...makeOperationReceipt(),
      kind: 'completion' as unknown as StorageOperationKind,
    })).toBe(false);
    expect(isStorageOperationReceipt({
      ...makeOperationReceipt(),
      status: 'pending' as unknown as StorageOperationStatus,
    })).toBe(false);
    expect(isStorageOperationReceipt({
      ...makeOperationReceipt(),
      sourceDigest: 42 as unknown as string,
    })).toBe(false);
    expect(isStorageOperationReceipt(makeOperationReceipt({ createdAt: '' }))).toBe(false);
    expect(isStorageOperationReceipt(makeOperationReceipt({ updatedAt: '' }))).toBe(false);
  });

  // O core anterior é o que permite desfazer a operação. Aceitar string vazia ou
  // geração vazia seria persistir uma promessa de rollback que não existe.
  it('exige core e geração anteriores preenchidos', () => {
    expect(isStorageOperationReceipt(makeOperationReceipt({ previousCoreRaw: '' }))).toBe(false);
    expect(isStorageOperationReceipt({
      ...makeOperationReceipt(),
      previousCoreRaw: null as unknown as string,
    })).toBe(false);
    expect(isStorageOperationReceipt(makeOperationReceipt({ previousGenerationId: '' }))).toBe(false);
    expect(isStorageOperationReceipt({
      ...makeOperationReceipt(),
      previousGenerationId: null as unknown as string,
    })).toBe(false);
  });

  // Isolamento estrutural: o contrato administrativo não absorve o receipt de
  // conclusão de treino nem por engano de gravação.
  it('recusa registro que carrega campos do receipt de conclusão', () => {
    expect(isStorageOperationReceipt({
      ...makeOperationReceipt(),
      receiptId: 'receipt-1',
    })).toBe(false);
    expect(isStorageOperationReceipt({
      ...makeOperationReceipt(),
      sessionDigest: 'sha256:abc',
    })).toBe(false);
    expect(isStorageOperationReceipt({
      ...makeOperationReceipt(),
      finalSession: { id: 'session-1' },
    })).toBe(false);
  });
});
