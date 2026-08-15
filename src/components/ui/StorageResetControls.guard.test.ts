import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OTHER_CONFIRM_CALLERS = [
  '../../modules/AdminPanel.tsx',
  '../../modules/ActiveWorkoutPage.tsx',
  '../../modules/WorkoutBuilder.tsx',
  './StorageRestoreControls.tsx',
  './StorageRecoveryNotice.tsx',
  './StorageBackupVerifier.tsx',
] as const;

const resetSource = readFileSync(
  resolve(__dirname, 'StorageResetControls.tsx'),
  'utf-8',
);

const adminSource = readFileSync(
  resolve(__dirname, '../../modules/AdminPanel.tsx'),
  'utf-8',
);

const contextSource = readFileSync(
  resolve(__dirname, '../../providers/GymFlowContext.tsx'),
  'utf-8',
);

describe('StorageResetControls — módulos e writers proibidos', () => {
  const FORBIDDEN_MODULES = [
    'storage-indexeddb',
    'storage-admin-runtime',
    'storage-admin-owner-token',
    'storage-operation-receipt',
    'storage-logical-reset',
    'storage-logical-restore',
    'GymFlowContext',
  ] as const;

  for (const token of FORBIDDEN_MODULES) {
    it(`não importa "${token}"`, () => {
      expect(resetSource).not.toMatch(new RegExp(`from\\s+['"].*${token}.*['"]`));
    });
  }

  it('não chama commitLogicalStorageResetV2', () => {
    expect(resetSource).not.toContain('commitLogicalStorageResetV2');
  });

  it('não chama commitLogicalStorageRestoreV2', () => {
    expect(resetSource).not.toContain('commitLogicalStorageRestoreV2');
  });

  it('não referencia IDs físicos nem raw', () => {
    expect(resetSource).not.toContain('operationId');
    expect(resetSource).not.toContain('generationId');
    expect(resetSource).not.toContain('stagedGenerationId');
    expect(resetSource).not.toContain('targetCoreRaw');
    expect(resetSource).not.toContain('fingerprint');
    expect(resetSource).not.toContain('payloadDigest');
  });
});

describe('AdminPanel — fronteira de reset híbrido', () => {
  it('integra StorageResetControls', () => {
    expect(adminSource).toContain('StorageResetControls');
  });

  const FORBIDDEN = [
    'storage-indexeddb',
    'storage-admin-runtime',
    'storage-admin-owner-token',
    'storage-operation-receipt',
    'storage-logical-reset',
    'commitLogicalStorageResetV2',
    'recoverLogicalStorageResetV2',
  ] as const;

  for (const token of FORBIDDEN) {
    it(`não importa ou referencia "${token}"`, () => {
      if (token.includes('storage-')) {
        expect(adminSource).not.toMatch(new RegExp(`from\\s+['"].*${token}.*['"]`));
      } else {
        expect(adminSource).not.toContain(token);
      }
    });
  }

  it('outros ConfirmDialog permanecem no comportamento default', () => {
    for (const relative of OTHER_CONFIRM_CALLERS) {
      const source = readFileSync(resolve(__dirname, relative), 'utf-8');
      expect(source).not.toContain('requireIndependentKeyboardIntent');
    }
  });

  it('o segundo diálogo exige intenção de teclado independente', () => {
    const firstDialog = resetSource.match(
      /isOpen=\{phase\.phase === 'confirming-first'\}[\s\S]*?\/>/,
    )?.[0];
    const finalDialog = resetSource.match(
      /isOpen=\{phase\.phase === 'confirming-final'\}[\s\S]*?\/>/,
    )?.[0];
    expect(firstDialog).toBeDefined();
    expect(finalDialog).toBeDefined();
    expect(firstDialog).not.toContain('requireIndependentKeyboardIntent');
    expect(finalDialog).toContain('requireIndependentKeyboardIntent');
  });

  it('preserva startFreshStorage e o fluxo legado', () => {
    expect(adminSource).toContain('startFreshStorage');
    expect(adminSource).toContain('Zerar dados do app');
    expect(adminSource).toContain('legacyStorageOperationsAllowed');
  });
});

describe('GymFlowContext — único writer autorizado do reset v2', () => {
  it('commitLogicalStorageResetV2 tem exatamente uma invocação', () => {
    const matches = contextSource.match(/commitLogicalStorageResetV2\(/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('não importa recoverLogicalStorageResetV2', () => {
    expect(contextSource).not.toContain('recoverLogicalStorageResetV2');
  });

  it('tipos públicos não expõem IDs/raw', () => {
    const availability = contextSource.match(
      /export type PublicLogicalResetAvailability\s*=[\s\S]*?;/,
    );
    const result = contextSource.match(
      /export type PublicLogicalResetResult\s*=[\s\S]*?;/,
    );
    expect(availability?.[0]).not.toContain('operationId');
    expect(availability?.[0]).not.toContain('generationId');
    expect(availability?.[0]).not.toContain('stagedGenerationId');
    expect(availability?.[0]).not.toContain('raw');
    expect(result?.[0]).not.toContain('operationId');
    expect(result?.[0]).not.toContain('generationId');
    expect(result?.[0]).not.toContain('receipt');
    expect(result?.[0]).not.toContain('digest');
    expect(result?.[0]).not.toContain('fingerprint');
  });
});
