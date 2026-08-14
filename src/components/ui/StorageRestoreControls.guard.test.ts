import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const restoreSource = readFileSync(
  resolve(__dirname, 'StorageRestoreControls.tsx'),
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

describe('StorageRestoreControls — módulos e writers proibidos', () => {
  const FORBIDDEN_MODULES = [
    'storage-indexeddb',
    'storage-admin-runtime',
    'storage-admin-owner-token',
    'storage-operation-receipt',
    'storage-logical-restore',
    'GymFlowContext',
  ] as const;

  for (const token of FORBIDDEN_MODULES) {
    it(`não importa "${token}"`, () => {
      expect(restoreSource).not.toMatch(new RegExp(`from\\s+['"].*${token}.*['"]`));
    });
  }

  it('não chama commitLogicalStorageRestoreV2', () => {
    expect(restoreSource).not.toContain('commitLogicalStorageRestoreV2');
  });
});

describe('AdminPanel — fronteira de restore híbrido', () => {
  it('integra StorageRestoreControls', () => {
    expect(adminSource).toContain('StorageRestoreControls');
  });

  const FORBIDDEN = [
    'storage-indexeddb',
    'storage-admin-runtime',
    'storage-admin-owner-token',
    'storage-operation-receipt',
    'commitLogicalStorageRestoreV2',
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
});

describe('GymFlowContext — único writer autorizado do restore v2', () => {
  it('commitLogicalStorageRestoreV2 tem exatamente uma invocação', () => {
    const matches = contextSource.match(/commitLogicalStorageRestoreV2\(/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('tipos públicos não expõem IDs físicos', () => {
    const availability = contextSource.match(
      /export type PublicLogicalRestoreAvailability\s*=[\s\S]*?;/,
    );
    const result = contextSource.match(
      /export type PublicLogicalRestoreResult\s*=[\s\S]*?;/,
    );
    expect(availability?.[0]).not.toContain('operationId');
    expect(availability?.[0]).not.toContain('generationId');
    expect(result?.[0]).not.toContain('operationId');
    expect(result?.[0]).not.toContain('generationId');
  });
});
