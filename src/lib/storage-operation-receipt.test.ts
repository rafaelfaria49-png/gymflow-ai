import { describe, expect, it } from 'vitest';
import {
  STORAGE_OPERATION_KINDS,
  STORAGE_OPERATION_STATUSES,
  type StorageOperationKind,
  type StorageOperationReceipt,
  type StorageOperationStatus,
  canTransitionStorageOperation,
  createStorageOperationReceipt,
  evaluateStorageOperationCompatibility,
  isStorageOperationKind,
  isStorageOperationReceipt,
  isStorageOperationStatus,
  isTerminalStorageOperationStatus,
} from './storage-operation-receipt';

function makeOperationReceipt(
  overrides: Record<string, unknown> = {},
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
  } as unknown as StorageOperationReceipt;
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
        const fields = kind === 'restore'
          ? {
              kind,
              status,
              targetGenerationId: 'generation-2',
              targetCoreRaw: '{"schemaVersion":2}',
            }
          : { kind, status };
        expect(isStorageOperationReceipt(makeOperationReceipt(fields))).toBe(true);
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

  it('mantém receipt histórico de import legível sem targetGenerationId', () => {
    const historico = {
      operationId: 'import-antigo',
      kind: 'import',
      sourceDigest: 'sha256:abc',
      previousCoreRaw: '{"v":2}',
      previousGenerationId: 'generation-a',
      stagedGenerationId: 'generation-b',
      targetCoreRaw: '{"v":2,"target":true}',
      status: 'settled',
      createdAt: '2026-07-24T12:00:00.000Z',
      updatedAt: '2026-07-24T12:01:00.000Z',
    };
    expect(Object.prototype.hasOwnProperty.call(historico, 'targetGenerationId')).toBe(false);
    expect(isStorageOperationReceipt(historico)).toBe(true);
  });

  it('exige target próprio no restore e nunca aceita staged como substituto', () => {
    const valido = makeOperationReceipt({
      kind: 'restore',
      stagedGenerationId: null,
      targetGenerationId: 'generation-a',
      targetCoreRaw: '{"v":2}',
      previousGenerationId: 'generation-b',
    });
    expect(isStorageOperationReceipt(valido)).toBe(true);
    expect(isStorageOperationReceipt({ ...valido, targetGenerationId: undefined })).toBe(false);
    expect(isStorageOperationReceipt({ ...valido, targetGenerationId: null })).toBe(false);
    expect(isStorageOperationReceipt({ ...valido, targetGenerationId: '' })).toBe(false);
    expect(isStorageOperationReceipt({ ...valido, stagedGenerationId: 'generation-a' })).toBe(false);
    expect(isStorageOperationReceipt({ ...valido, targetCoreRaw: null })).toBe(false);
    expect(isStorageOperationReceipt({ ...valido, targetGenerationId: 'generation-b' })).toBe(false);
  });

  it('modela reset como geracao nova sem origem externa nem targetGenerationId', () => {
    const valido = makeOperationReceipt({
      kind: 'reset',
      sourceDigest: null,
      stagedGenerationId: 'generation-z',
      targetCoreRaw: '{"v":2}',
    });
    expect(isStorageOperationReceipt(valido)).toBe(true);
    expect(isStorageOperationReceipt(makeOperationReceipt({
      kind: 'reset',
      sourceDigest: 'sha256:abc',
    }))).toBe(false);
    expect(isStorageOperationReceipt(makeOperationReceipt({
      kind: 'reset',
      targetGenerationId: 'generation-x',
    }))).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(
      createStorageOperationReceipt({
        operationId: 'reset-1',
        kind: 'reset',
        previousCoreRaw: '{"v":2}',
        previousGenerationId: 'generation-a',
        createdAt: '2026-08-14T12:00:00.000Z',
      }),
      'targetGenerationId',
    )).toBe(false);
  });

  it('recusa targetGenerationId em import, reset e rollback', () => {
    for (const kind of ['import', 'reset', 'rollback'] as const) {
      expect(isStorageOperationReceipt(makeOperationReceipt({
        kind,
        targetGenerationId: 'generation-x',
      }))).toBe(false);
      expect(isStorageOperationReceipt(makeOperationReceipt({
        kind,
        targetGenerationId: undefined,
      }))).toBe(false);
    }
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

// Coerência entre um receipt não terminal e o mundo físico observado. É o que
// separa `interrupted` (seguro para diagnosticar e, no futuro, retomar) de
// `conflicted` (ambíguo demais para tocar). Tudo puro: sem IndexedDB, sem I/O.
describe('evaluateStorageOperationCompatibility', () => {
  const CORE = '{"v":2,"data":{"core":"atual"}}';
  const OUTRO_CORE = '{"v":2,"data":{"core":"de outro momento"}}';
  const GERACOES = [
    { generationId: 'generation-1' },
    { generationId: 'generation-2' },
  ];

  function evaluate(
    receipt: Partial<StorageOperationReceipt>,
    metadata: { activeGeneration: string | null; migrationGeneration: string | null } = {
      activeGeneration: 'generation-1',
      migrationGeneration: null,
    },
    coreRaw = CORE,
    generations = GERACOES,
  ) {
    return evaluateStorageOperationCompatibility({
      receipt: makeOperationReceipt({ previousCoreRaw: CORE, previousGenerationId: 'generation-1', ...receipt }),
      coreRaw,
      metadata,
      generations,
    });
  }

  it('staged coerente é compatible', () => {
    expect(evaluate({ status: 'staged' })).toEqual({ status: 'compatible' });
  });

  it('staged com previousGenerationId inexistente é incompatible', () => {
    expect(evaluate({ status: 'staged', previousGenerationId: 'generation-fantasma' }))
      .toMatchObject({ status: 'incompatible', reason: 'previous-generation-absent' });
  });

  it('staged sobre geração que não é mais a ativa é incompatible', () => {
    expect(evaluate({ status: 'staged' }, { activeGeneration: 'generation-2', migrationGeneration: null }))
      .toMatchObject({ status: 'incompatible', reason: 'previous-generation-not-active' });
  });

  it('staged com core diferente do previousCoreRaw é incompatible', () => {
    expect(evaluate({ status: 'staged' }, undefined, OUTRO_CORE))
      .toMatchObject({ status: 'incompatible', reason: 'core-not-previous' });
  });

  it('stagedGenerationId fantasma é incompatible', () => {
    expect(evaluate({ status: 'staged', stagedGenerationId: 'generation-fantasma' }))
      .toMatchObject({ status: 'incompatible', reason: 'staged-generation-absent' });
  });

  it('ponteiro de staging preenchido sem receipt que o explique é incompatible', () => {
    expect(evaluate(
      { status: 'staged', stagedGenerationId: null },
      { activeGeneration: 'generation-1', migrationGeneration: 'generation-2' },
    )).toMatchObject({ status: 'incompatible', reason: 'migration-generation-divergent' });
  });

  it('ponteiro de staging divergente do declarado é incompatible', () => {
    expect(evaluate(
      { status: 'staged', stagedGenerationId: 'generation-2' },
      { activeGeneration: 'generation-1', migrationGeneration: 'generation-1' },
    )).toMatchObject({ status: 'incompatible', reason: 'migration-generation-divergent' });
  });

  it('activating sem nenhum efeito aplicado é compatible', () => {
    expect(evaluate({ status: 'activating' })).toEqual({ status: 'compatible' });
  });

  it('activating com efeitos já aplicados é insufficient-evidence, nunca compatible', () => {
    const resultado = evaluate(
      { status: 'activating', stagedGenerationId: 'generation-2', targetCoreRaw: OUTRO_CORE },
      { activeGeneration: 'generation-2', migrationGeneration: 'generation-2' },
      OUTRO_CORE,
    );
    expect(resultado).toMatchObject({
      status: 'insufficient-evidence',
      reason: 'activating-effects-unprovable',
    });
    expect(resultado.status).not.toBe('compatible');
  });

  it('activating com core de terceira origem é incompatible', () => {
    expect(evaluate({ status: 'activating' }, undefined, OUTRO_CORE))
      .toMatchObject({ status: 'incompatible', reason: 'activating-state-unrecognized' });
  });

  it('activating com geração ativa de terceira origem é incompatible', () => {
    expect(evaluate({ status: 'activating' }, { activeGeneration: 'generation-2', migrationGeneration: null }))
      .toMatchObject({ status: 'incompatible', reason: 'activating-state-unrecognized' });
  });

  it('activated sem alvo declarado é incompatible', () => {
    expect(evaluate({ status: 'activated' }))
      .toMatchObject({ status: 'incompatible', reason: 'activated-target-missing' });
  });

  it('activated com a geração antiga ainda ativa é incompatible', () => {
    expect(evaluate(
      { status: 'activated', stagedGenerationId: 'generation-2', targetCoreRaw: OUTRO_CORE },
      { activeGeneration: 'generation-1', migrationGeneration: 'generation-2' },
      OUTRO_CORE,
    )).toMatchObject({ status: 'incompatible', reason: 'activated-generation-not-active' });
  });

  it('activated com o core antigo é incompatible', () => {
    expect(evaluate(
      { status: 'activated', stagedGenerationId: 'generation-2', targetCoreRaw: OUTRO_CORE },
      { activeGeneration: 'generation-2', migrationGeneration: 'generation-2' },
      CORE,
    )).toMatchObject({ status: 'incompatible', reason: 'activated-core-not-target' });
  });

  it('activated com evidência completa é compatible', () => {
    expect(evaluate(
      { status: 'activated', stagedGenerationId: 'generation-2', targetCoreRaw: OUTRO_CORE },
      { activeGeneration: 'generation-2', migrationGeneration: 'generation-2' },
      OUTRO_CORE,
    )).toEqual({ status: 'compatible' });
  });

  it('restore activated usa targetGenerationId e recusa staged como substituto', () => {
    const restoreActivated = {
      kind: 'restore' as const,
      status: 'activated' as const,
      stagedGenerationId: null,
      targetGenerationId: 'generation-2',
      targetCoreRaw: OUTRO_CORE,
    };
    expect(evaluate(
      restoreActivated,
      { activeGeneration: 'generation-2', migrationGeneration: null },
      OUTRO_CORE,
    )).toEqual({ status: 'compatible' });
    expect(evaluate(
      restoreActivated,
      { activeGeneration: 'generation-1', migrationGeneration: null },
      OUTRO_CORE,
    )).toMatchObject({ status: 'incompatible', reason: 'activated-generation-not-active' });
    expect(isStorageOperationReceipt(makeOperationReceipt({
      ...restoreActivated,
      stagedGenerationId: 'generation-2',
    }))).toBe(false);
  });

  it('restore activating com geracao alvo ja ativa permanece insufficient-evidence', () => {
    expect(evaluate(
      {
        kind: 'restore',
        status: 'activating',
        stagedGenerationId: null,
        targetGenerationId: 'generation-2',
        targetCoreRaw: OUTRO_CORE,
      },
      { activeGeneration: 'generation-2', migrationGeneration: null },
      CORE,
    )).toMatchObject({
      status: 'insufficient-evidence',
      reason: 'activating-effects-unprovable',
    });
  });

  it.each(['settled', 'reverted'] as const)('status terminal %s nunca é operação em aberto', (status) => {
    expect(evaluate({ status })).toMatchObject({ status: 'incompatible', reason: 'terminal-status' });
  });

  it('insufficient-evidence e incompatible carregam razão fechada e mensagem', () => {
    const resultado = evaluate({ status: 'activated' });
    if (resultado.status === 'compatible') throw new Error('esperado não-compatible');
    expect(typeof resultado.reason).toBe('string');
    expect(resultado.message.length).toBeGreaterThan(0);
  });
});
