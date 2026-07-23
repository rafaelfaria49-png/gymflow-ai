import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../types';
import {
  EMPTY_GENERATION_DIGEST,
  HistoryDigestCryptoUnavailableError,
  type HistoryGenerationSnapshot,
  chainGenerationDigest,
  computeOrderedDigestFromSessionDigests,
  computeOrderedHistoryDigest,
  createGenerationManifest,
  digestWorkoutSession,
  digestWorkoutSessions,
  isHistoryGenerationManifest,
  serializeWorkoutSessionCanonically,
  sha256Checksum,
  verifyHistoryGeneration,
  workoutHistoriesMatch,
  workoutSessionsMatch,
} from './storage-history-integrity';

function makeSession(index: number, overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  const startedAt = 1_767_225_600_000 + index * 86_400_000;
  return {
    id: `session-${index}`,
    name: `Treino ${index}`,
    date: new Date(startedAt).toISOString(),
    duration: 3_600,
    calories: 420,
    xpEarned: 180,
    totalVolume: 12_500 + index,
    prsDetected: [],
    status: 'completed',
    startedAt,
    endedAt: startedAt + 3_600_000,
    exercises: [{
      id: `entry-${index}`,
      exerciseId: 'chest_supino_reto',
      name: 'Supino reto',
      muscleGroup: 'chest',
      notes: '',
      sets: [{
        id: `set-${index}`,
        reps: 10,
        weight: 62.5,
        completed: true,
      }],
    }],
    ...overrides,
  };
}

// Histórico físico é newest-first: índice 0 é o registro mais recente.
const HISTORY = [makeSession(3), makeSession(2), makeSession(1)];

async function snapshotOf(
  sessions: readonly WorkoutSession[],
  generationId = 'generation-1',
  overrides: Partial<HistoryGenerationSnapshot> = {},
): Promise<HistoryGenerationSnapshot> {
  const digests = await digestWorkoutSessions(sessions);
  return {
    present: true,
    manifest: createGenerationManifest({
      generationId,
      sessionCount: sessions.length,
      orderedDigest: await computeOrderedDigestFromSessionDigests(digests),
      createdAt: '2026-07-23T12:00:00.000Z',
    }),
    sessions: [...sessions],
    recordDigests: digests,
    ...overrides,
  };
}

describe('integridade ordenada das gerações de histórico', () => {
  it('serializa a sessão de forma canônica e independente da ordem das chaves', () => {
    const session = makeSession(1);
    const reordered = JSON.parse(JSON.stringify(
      Object.fromEntries(Object.entries(session).reverse()),
    )) as WorkoutSession;
    expect(serializeWorkoutSessionCanonically(session))
      .toBe(serializeWorkoutSessionCanonically(reordered));
    expect(workoutSessionsMatch(session, reordered)).toBe(true);
    expect(workoutHistoriesMatch([session], [reordered])).toBe(true);
  });

  it('usa um digest canônico explícito para geração vazia', async () => {
    expect(await computeOrderedHistoryDigest([])).toBe(EMPTY_GENERATION_DIGEST);
    expect(await computeOrderedDigestFromSessionDigests([])).toBe(EMPTY_GENERATION_DIGEST);
    expect(EMPTY_GENERATION_DIGEST).not.toMatch(/^sha256:/);
  });

  it('permite atualizar o digest ao inserir no início sem reserializar o histórico', async () => {
    const tail = [makeSession(2), makeSession(1)];
    const inserted = makeSession(3);
    const incremental = await chainGenerationDigest(
      await computeOrderedHistoryDigest(tail),
      await digestWorkoutSession(inserted),
    );
    expect(incremental).toBe(await computeOrderedHistoryDigest([inserted, ...tail]));
  });

  it('detecta registro ausente, extra, ordem e conteúdo divergentes', async () => {
    const reference = await computeOrderedHistoryDigest(HISTORY);
    const missing = await computeOrderedHistoryDigest([HISTORY[0], HISTORY[2]]);
    const extra = await computeOrderedHistoryDigest([...HISTORY, makeSession(0)]);
    const reordered = await computeOrderedHistoryDigest([HISTORY[1], HISTORY[0], HISTORY[2]]);
    const mutated = await computeOrderedHistoryDigest([
      { ...HISTORY[0], totalVolume: 1 },
      HISTORY[1],
      HISTORY[2],
    ]);
    const wiped = await computeOrderedHistoryDigest([]);

    expect(new Set([reference, missing, extra, reordered, mutated, wiped]).size).toBe(6);
  });

  it('não usa a data do manifest como identidade da geração', async () => {
    const digests = await digestWorkoutSessions(HISTORY);
    const orderedDigest = await computeOrderedDigestFromSessionDigests(digests);
    const early = createGenerationManifest({
      generationId: 'generation-1',
      sessionCount: HISTORY.length,
      orderedDigest,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const late = createGenerationManifest({
      generationId: 'generation-1',
      sessionCount: HISTORY.length,
      orderedDigest,
      createdAt: '2026-12-31T23:59:59.000Z',
    });
    expect(early.orderedDigest).toBe(late.orderedDigest);

    const snapshot = await snapshotOf(HISTORY);
    await expect(verifyHistoryGeneration('generation-1', { ...snapshot, manifest: early }))
      .resolves.toMatchObject({ status: 'verified' });
    await expect(verifyHistoryGeneration('generation-1', { ...snapshot, manifest: late }))
      .resolves.toMatchObject({ status: 'verified' });
  });

  it('aprova a geração íntegra e a geração vazia com manifest verificado', async () => {
    await expect(verifyHistoryGeneration('generation-1', await snapshotOf(HISTORY)))
      .resolves.toMatchObject({ status: 'verified' });

    const empty = await snapshotOf([]);
    expect(empty.manifest?.orderedDigest).toBe(EMPTY_GENERATION_DIGEST);
    await expect(verifyHistoryGeneration('generation-1', empty))
      .resolves.toMatchObject({ status: 'verified', sessions: [] });
  });

  it('recusa geração fisicamente ausente em vez de devolver histórico vazio', async () => {
    await expect(verifyHistoryGeneration('generation-1', {
      present: false,
      manifest: null,
      sessions: [],
      recordDigests: [],
    })).resolves.toMatchObject({ status: 'invalid', reason: 'generation-absent' });
  });

  it('recusa manifest ausente, não confirmado ou de outra geração', async () => {
    const snapshot = await snapshotOf(HISTORY);
    await expect(verifyHistoryGeneration('generation-1', { ...snapshot, manifest: null }))
      .resolves.toMatchObject({ status: 'invalid', reason: 'manifest-absent' });
    await expect(verifyHistoryGeneration('generation-1', {
      ...snapshot,
      manifest: { ...snapshot.manifest!, verified: false },
    })).resolves.toMatchObject({ status: 'invalid', reason: 'manifest-unverified' });
    await expect(verifyHistoryGeneration('generation-2', snapshot))
      .resolves.toMatchObject({ status: 'invalid', reason: 'manifest-generation-mismatch' });
  });

  it('recusa manifest adulterado na contagem ou no digest', async () => {
    const snapshot = await snapshotOf(HISTORY);
    await expect(verifyHistoryGeneration('generation-1', {
      ...snapshot,
      manifest: { ...snapshot.manifest!, sessionCount: -1 },
    })).resolves.toMatchObject({ status: 'invalid', reason: 'manifest-count-invalid' });
    await expect(verifyHistoryGeneration('generation-1', {
      ...snapshot,
      manifest: { ...snapshot.manifest!, sessionCount: HISTORY.length + 1 },
    })).resolves.toMatchObject({ status: 'invalid', reason: 'session-count-mismatch' });
    await expect(verifyHistoryGeneration('generation-1', {
      ...snapshot,
      manifest: { ...snapshot.manifest!, orderedDigest: 'sha256:adulterado' },
    })).resolves.toMatchObject({ status: 'invalid', reason: 'ordered-digest-mismatch' });
  });

  it('recusa perda parcial, registro extra e ordem divergente dos registros', async () => {
    const snapshot = await snapshotOf(HISTORY);
    await expect(verifyHistoryGeneration('generation-1', {
      ...snapshot,
      sessions: [HISTORY[0], HISTORY[2]],
      recordDigests: [snapshot.recordDigests[0], snapshot.recordDigests[2]],
    })).resolves.toMatchObject({ status: 'invalid', reason: 'session-count-mismatch' });

    const reordered = await snapshotOf(HISTORY);
    await expect(verifyHistoryGeneration('generation-1', {
      ...reordered,
      sessions: [HISTORY[1], HISTORY[0], HISTORY[2]],
      recordDigests: [
        reordered.recordDigests[1],
        reordered.recordDigests[0],
        reordered.recordDigests[2],
      ],
    })).resolves.toMatchObject({ status: 'invalid', reason: 'ordered-digest-mismatch' });
  });

  it('recusa perda total dos registros mantendo o manifest antigo', async () => {
    const snapshot = await snapshotOf(HISTORY);
    await expect(verifyHistoryGeneration('generation-1', {
      ...snapshot,
      sessions: [],
      recordDigests: [],
    })).resolves.toMatchObject({ status: 'invalid', reason: 'session-count-mismatch' });
  });

  it('recusa geração vazia sem o digest canônico e conteúdo divergente do digest gravado', async () => {
    const empty = await snapshotOf([]);
    await expect(verifyHistoryGeneration('generation-1', {
      ...empty,
      manifest: { ...empty.manifest!, orderedDigest: 'sha256:qualquer' },
    })).resolves.toMatchObject({ status: 'invalid', reason: 'empty-digest-mismatch' });

    const snapshot = await snapshotOf(HISTORY);
    await expect(verifyHistoryGeneration('generation-1', {
      ...snapshot,
      recordDigests: ['sha256:digest-gravado-divergente', ...snapshot.recordDigests.slice(1)],
    })).resolves.toMatchObject({ status: 'invalid', reason: 'record-digest-mismatch' });
  });

  it('trata registro sem digest gravado como divergência de conteúdo', async () => {
    const snapshot = await snapshotOf(HISTORY);
    await expect(verifyHistoryGeneration('generation-1', {
      ...snapshot,
      recordDigests: [null, null, null],
    })).resolves.toMatchObject({ status: 'verified' });

    await expect(verifyHistoryGeneration('generation-1', {
      ...snapshot,
      sessions: [{ ...HISTORY[0], totalVolume: 1 }, HISTORY[1], HISTORY[2]],
      recordDigests: [null, null, null],
    })).resolves.toMatchObject({ status: 'invalid', reason: 'ordered-digest-mismatch' });
  });

  it('valida o formato do manifest antes de confiar nele', () => {
    expect(isHistoryGenerationManifest(null)).toBe(false);
    expect(isHistoryGenerationManifest({ generationId: 'g' })).toBe(false);
    expect(isHistoryGenerationManifest(createGenerationManifest({
      generationId: 'g',
      sessionCount: 0,
      orderedDigest: EMPTY_GENERATION_DIGEST,
      createdAt: '2026-07-23T12:00:00.000Z',
    }))).toBe(true);
  });

  it('exige Web Crypto para calcular qualquer digest', async () => {
    await expect(sha256Checksum('conteúdo', null))
      .rejects.toBeInstanceOf(HistoryDigestCryptoUnavailableError);
    await expect(digestWorkoutSession(makeSession(1), null))
      .rejects.toBeInstanceOf(HistoryDigestCryptoUnavailableError);
  });
});
