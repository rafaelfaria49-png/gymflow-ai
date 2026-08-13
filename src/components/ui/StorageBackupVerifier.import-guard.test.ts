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

const gymFlowContextSource = readFileSync(
  resolve(__dirname, '../../providers/GymFlowContext.tsx'),
  'utf-8',
);

describe('StorageBackupVerifier — import guard (módulos proibidos)', () => {
  const FORBIDDEN_MODULES = [
    'storage-admin-runtime',
    'storage-admin-owner-token',
    'storage-logical-import',
    'storage-indexeddb',
    'storage-hybrid',
    'storage-operation-receipt',
  ] as const;

  for (const mod of FORBIDDEN_MODULES) {
    it(`não importa de "${mod}"`, () => {
      expect(verifierSource).not.toMatch(
        new RegExp(`from\\s+['"].*${mod}.*['"]`),
      );
    });
  }
});

describe('StorageBackupVerifier — tokens e padrões proibidos', () => {
  const FORBIDDEN_TOKENS = [
    'commitLogicalStorageImportV2',
    'beginStorageOperation',
    'transitionStorageOperation',
    'createStorageAdminRuntime',
    'localStorage',
    'indexedDB',
    'console.log',
    '.cause',
  ] as const;

  for (const token of FORBIDDEN_TOKENS) {
    it(`não contém "${token}"`, () => {
      expect(verifierSource).not.toContain(token);
    });
  }
});

describe('AdminPanel — imports proibidos de storage administrativo', () => {
  const FORBIDDEN_ADMIN_MODULES = [
    'storage-admin-runtime',
    'storage-admin-owner-token',
    'storage-logical-import',
    'storage-indexeddb',
  ] as const;

  for (const mod of FORBIDDEN_ADMIN_MODULES) {
    it(`não importa de "${mod}"`, () => {
      expect(adminSource).not.toMatch(
        new RegExp(`from\\s+['"].*${mod}.*['"]`),
      );
    });
  }
});

describe('GymFlowContext — call-site único de commitLogicalStorageImportV2', () => {
  it('commitLogicalStorageImportV2 tem exatamente uma chamada (dentro de importLogicalBackupV2)', () => {
    // O import no topo conta como referência, mas só a invocação direta no
    // corpo de importLogicalBackupV2 deve existir.
    const invocationPattern = /commitLogicalStorageImportV2\(/g;
    const matches = gymFlowContextSource.match(invocationPattern) ?? [];
    expect(matches).toHaveLength(1);
  });
});

describe('GymFlowContext — tipos públicos limpos', () => {
  it('raw: string não aparece como campo de topo de GymFlowContextType', () => {
    // Extrai o bloco do interface GymFlowContextType.
    const interfaceMatch = gymFlowContextSource.match(
      /interface GymFlowContextType\s*\{([\s\S]*?)\n\}/,
    );
    expect(interfaceMatch).not.toBeNull();
    const interfaceBody = interfaceMatch![1];
    // `raw: string` pode aparecer dentro do parâmetro de `importLogicalBackupV2`,
    // mas nunca como campo de nível superior da interface (indentação de 2 espaços).
    // Campos de topo têm indentação de 2 espaços: `  raw: string;`.
    // Parâmetros internos têm indentação ≥ 4 espaços: `    raw: string;`.
    const topLevelRawField = /^\s{2}raw:\s*string\s*;?\s*$/m;
    expect(interfaceBody).not.toMatch(topLevelRawField);
  });

  it('operationId não aparece em PublicLogicalImportResult', () => {
    const typeMatch = gymFlowContextSource.match(
      /export type PublicLogicalImportResult\s*=[\s\S]*?;/,
    );
    expect(typeMatch).not.toBeNull();
    expect(typeMatch![0]).not.toContain('operationId');
  });

  it('generationId não aparece em PublicLogicalImportResult', () => {
    const typeMatch = gymFlowContextSource.match(
      /export type PublicLogicalImportResult\s*=[\s\S]*?;/,
    );
    expect(typeMatch).not.toBeNull();
    expect(typeMatch![0]).not.toContain('generationId');
  });

  it('payloadDigest não aparece em PublicLogicalImportResult', () => {
    const typeMatch = gymFlowContextSource.match(
      /export type PublicLogicalImportResult\s*=[\s\S]*?;/,
    );
    expect(typeMatch).not.toBeNull();
    expect(typeMatch![0]).not.toContain('payloadDigest');
  });
});

describe('GymFlowContext — nenhum novo call-site administrativo', () => {
  it('nenhuma nova chamada para restoreStorageBackup (fora do contexto legado)', () => {
    // Fora das definições e atribuições, não há novas invocações diretas.
    const invocations = gymFlowContextSource.match(/restoreStorageBackup\(/g) ?? [];
    // Apenas 1: o wrapper `const restoreStorageBackup = () => restoreBackup(...)`
    // que internamente chama a função legada. Nenhuma outra.
    expect(invocations.length).toBeLessThanOrEqual(2);
  });

  it('nenhuma nova chamada para startFreshStorage (fora do contexto legado)', () => {
    const invocations = gymFlowContextSource.match(/startFreshStorage\(/g) ?? [];
    expect(invocations.length).toBeLessThanOrEqual(2);
  });

  it('nenhum call-site para resetStorage', () => {
    expect(gymFlowContextSource).not.toContain('resetStorage(');
  });

  it('nenhum call-site para deleteStorage', () => {
    expect(gymFlowContextSource).not.toContain('deleteStorage(');
  });

  it('nenhum call-site para clearStorage', () => {
    expect(gymFlowContextSource).not.toContain('clearStorage(');
  });
});

describe('GymFlowContext — importLogicalBackupV2 sem rollback como chamada', () => {
  it('nenhuma função "rollback" invocada dentro de importLogicalBackupV2', () => {
    // Extrai o corpo de importLogicalBackupV2.
    const fnMatch = gymFlowContextSource.match(
      /const importLogicalBackupV2 = useCallback\(async[\s\S]*?\n  \}, \[\]\);/,
    );
    expect(fnMatch).not.toBeNull();
    const body = fnMatch![0];
    // Apenas referências a rollbackToHistoryGeneration como binding do adapter,
    // não como chamada direta no fluxo do wrapper.
    expect(body).not.toMatch(/rollback\w*\(/);
  });
});
