import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('StorageExportControls — guard estrutural', () => {
  const source = readFileSync(
    resolve(__dirname, 'StorageExportControls.tsx'),
    'utf-8',
  );

  const FORBIDDEN = [
    'commitLogicalStorageImportV2',
    'recoverLogicalStorageImportV2',
    'beginStorageOperation',
    'rollbackToHistoryGeneration',
    'resetStorage',
    'deleteStorage',
    'clearStorage',
    'storage-admin-owner-token',
    'acquireOwnerToken',
    'createStorageAdminRuntime',
  ] as const;

  for (const token of FORBIDDEN) {
    it(`não importa ou referencia "${token}"`, () => {
      expect(source).not.toContain(token);
    });
  }
});

describe('AdminPanel — guard de zero escrita administrativa', () => {
  const source = readFileSync(
    resolve(__dirname, '../../modules/AdminPanel.tsx'),
    'utf-8',
  );

  const FORBIDDEN = [
    'commitLogicalStorageImportV2',
    'recoverLogicalStorageImportV2',
    'beginStorageOperation',
    'storage-admin-owner-token',
    'createStorageAdminRuntime',
  ] as const;

  for (const token of FORBIDDEN) {
    it(`não importa ou referencia "${token}"`, () => {
      expect(source).not.toContain(token);
    });
  }
});

describe('GymFlowContext.exportLogicalBackupV2 — prova de zero owner-token', () => {
  const source = readFileSync(
    resolve(__dirname, '../../providers/GymFlowContext.tsx'),
    'utf-8',
  );

  // Extract the exportLogicalBackupV2 function body
  const fnMatch = source.match(
    /const exportLogicalBackupV2 = useCallback\(async[\s\S]+?\}, \[\]\);/,
  );

  it('função exportLogicalBackupV2 existe no source', () => {
    expect(fnMatch).not.toBeNull();
  });

  const fnBody = fnMatch?.[0] ?? '';

  const FORBIDDEN_IN_FN = [
    'owner-token',
    'beginStorageOperation',
    'acquireOwnerToken',
    'createStorageAdminOwnerTokenCoordinator',
    'inspectStorageAdminOwnerToken',
    'lease',
    'receipt',
  ] as const;

  // GOAL-087: `releaseNutritionFenceBestEffort` contém o substring `lease`
  // (`reLease`) mas é o fence nutricional — não o lease de owner-token.
  // A asserção abaixo filtra esse falso-positivo pelo contexto.
  for (const token of FORBIDDEN_IN_FN) {
    it(`exportLogicalBackupV2 não referencia "${token}"`, () => {
      if (token === 'lease') {
        // Remove as ocorrências do fence nutricional antes de checar o lease
        // de owner-token (que o export nunca toca — prova de zero owner-token).
        const scrubbed = fnBody
          .replaceAll('releaseNutritionFenceBestEffort', '')
          .replaceAll('releaseNutritionAdminFence', '');
        expect(scrubbed).not.toContain(token);
        return;
      }
      expect(fnBody).not.toContain(token);
    });
  }

  it('exportLogicalBackupV2 mantém o fence nutricional durante a captura (GOAL-087)', () => {
    expect(fnBody).toContain('acquireNutritionAdminFence');
    expect(fnBody).toContain('releaseNutritionFenceBestEffort');
  });
});
