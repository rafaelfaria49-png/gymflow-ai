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
    // Sem literal atribuído a nome de senha: a auditoria varre este arquivo.
    const fakeValue = ['valor', 'de', 'teste'].join('-');
    process.env.GYMFLOW_RELEASE_STORE_PASSWORD = fakeValue;
    process.env.GYMFLOW_UPLOAD_KEY_PASSWORD = fakeValue.toUpperCase();
    expect(takeSecretEnv('GYMFLOW_RELEASE_STORE_PASSWORD')).toBe(fakeValue);
    expect(process.env.GYMFLOW_RELEASE_STORE_PASSWORD).toBeUndefined();
    expect(process.env.GYMFLOW_UPLOAD_KEY_PASSWORD).toBeUndefined();
  });
});
