import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const verifierSource = readFileSync(
  resolve(__dirname, 'StorageBackupVerifier.tsx'),
  'utf-8',
);

const adminSource = readFileSync(
  resolve(__dirname, '../../modules/AdminPanel.tsx'),
  'utf-8',
);

describe('StorageBackupVerifier — guard de zero escrita', () => {
  const FORBIDDEN = [
    'commitLogicalStorageImportV2',
    'recoverLogicalStorageImportV2',
    'beginStorageOperation',
    'transitionStorageOperation',
    'rollbackToHistoryGeneration',
    'acquireOwnerToken',
    'storage-admin-owner-token',
    'createStorageAdminRuntime',
    'restoreStorageBackup',
    'startFreshStorage',
    'resetStorage',
    'deleteStorage',
    'clearStorage',
  ] as const;

  for (const token of FORBIDDEN) {
    it(`não importa ou referencia "${token}"`, () => {
      expect(verifierSource).not.toContain(token);
    });
  }
});

describe('StorageBackupVerifier — prova de zero owner-token', () => {
  it('não importa storage-admin-owner-token', () => {
    expect(verifierSource).not.toContain('owner-token');
    expect(verifierSource).not.toContain('ownerToken');
    expect(verifierSource).not.toContain('acquire');
  });
});

describe('StorageBackupVerifier — prova de descarte do raw', () => {
  it('não persiste raw no localStorage', () => {
    expect(verifierSource).not.toContain('localStorage');
  });

  it('não persiste raw no IndexedDB', () => {
    expect(verifierSource).not.toContain('IndexedDB');
    expect(verifierSource).not.toContain('indexedDB');
    expect(verifierSource).not.toContain('IDBDatabase');
  });

  it('não usa Context', () => {
    expect(verifierSource).not.toContain('useGymFlow');
    expect(verifierSource).not.toContain('useContext');
  });
});

describe('StorageBackupVerifier — prova de privacidade', () => {
  it('não propaga backup completo ao view model', () => {
    expect(verifierSource).not.toContain('inspection.backup');
  });

  it('não usa console.log', () => {
    expect(verifierSource).not.toContain('console.log');
  });

  it('não propaga digest ao preview', () => {
    expect(verifierSource).not.toContain('payloadDigest');
  });

  it('não propaga cause ao view model', () => {
    expect(verifierSource).not.toContain('.cause');
  });
});

describe('StorageBackupVerifier — imports permitidos (igualdade explícita)', () => {
  const ALLOWED_IMPORTS = [
    'react',
    'lucide-react',
    'storage-logical-backup',
  ] as const;

  for (const mod of ALLOWED_IMPORTS) {
    it(`importa "${mod}"`, () => {
      expect(verifierSource).toContain(mod);
    });
  }

  const FORBIDDEN_IMPORTS = [
    'storage-logical-import',
    'storage-admin-owner-token',
    'storage-admin-runtime',
    'GymFlowContext',
    'storage-hybrid',
    'storage-operation-receipt',
  ] as const;

  for (const mod of FORBIDDEN_IMPORTS) {
    it(`não importa "${mod}"`, () => {
      expect(verifierSource).not.toMatch(
        new RegExp(`from\\s+['"].*${mod}.*['"]`),
      );
    });
  }
});

describe('AdminPanel — guard atualizado com StorageBackupVerifier', () => {
  it('importa StorageBackupVerifier', () => {
    expect(adminSource).toContain('StorageBackupVerifier');
  });

  const FORBIDDEN = [
    'commitLogicalStorageImportV2',
    'recoverLogicalStorageImportV2',
    'beginStorageOperation',
    'storage-admin-owner-token',
    'createStorageAdminRuntime',
  ] as const;

  for (const token of FORBIDDEN) {
    it(`não importa ou referencia "${token}"`, () => {
      expect(adminSource).not.toContain(token);
    });
  }
});
