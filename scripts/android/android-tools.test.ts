import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT, canonicalPath, enclosingGitRoot, takeSecretEnv } from './android-tools.mjs';

const cleanup: string[] = [];
afterEach(() => {
  for (const p of cleanup.splice(0)) fs.rmSync(p, { recursive: true, force: true });
});

describe('GOAL-117 android-tools: chave fora de repositório git', () => {
  it('detecta repo pelo caminho direto', () => {
    expect(enclosingGitRoot(path.join(REPO_ROOT, 'android', 'nao-existe.jks'))).not.toBeNull();
  });

  it('diretório temporário comum não é repo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-key-'));
    cleanup.push(dir);
    expect(enclosingGitRoot(path.join(dir, 'gymflow-upload-key.jks'))).toBeNull();
  });

  it('resolve symlink/junction que aponta para dentro do repo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymflow-link-'));
    cleanup.push(dir);
    const link = path.join(dir, 'parece-externo');
    fs.symlinkSync(path.join(REPO_ROOT, 'android'), link, 'junction');
    expect(canonicalPath(path.join(link, 'x.jks')).toLowerCase()).toContain(path.join('android', 'x.jks').toLowerCase());
    expect(enclosingGitRoot(path.join(link, 'x.jks'))).not.toBeNull();
  });
});

describe('GOAL-117 android-tools: senha fora do ambiente', () => {
  it('devolve o valor pedido e remove todas as variáveis de senha', () => {
    process.env.GYMFLOW_RELEASE_STORE_PASSWORD = 'valor-teste';
    process.env.GYMFLOW_UPLOAD_KEY_PASSWORD = 'outro-valor';
    expect(takeSecretEnv('GYMFLOW_RELEASE_STORE_PASSWORD')).toBe('valor-teste');
    expect(process.env.GYMFLOW_RELEASE_STORE_PASSWORD).toBeUndefined();
    expect(process.env.GYMFLOW_UPLOAD_KEY_PASSWORD).toBeUndefined();
  });
});
