/**
 * GymFlow AI — NUT-008 auditoria de segredos e chamada direta ao provedor.
 *
 * Esperado: API_KEY_EXPOSURE = NO; DIRECT_OPENROUTER_CLIENT_CALL = NO.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');

const SECRET_VALUE_RE = /(sk-[a-zA-Z0-9]{12,}|or-v1-[a-zA-Z0-9]{12,}|sk-or-v1-[a-zA-Z0-9]{12,}|Bearer\s+[A-Za-z0-9\-._~+/]{20,})/;
const PUBLIC_SECRET_RE = /NEXT_PUBLIC_[A-Z0-9_]*(KEY|SECRET|TOKEN)\s*=/;

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'labs') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function readIfExists(rel: string): string | null {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

describe('NUT-008 secret / privacy audit', () => {
  it('fonte: nenhum valor de chave e nenhum NEXT_PUBLIC_*KEY/SECRET/TOKEN', () => {
    const files = [
      ...walk(path.join(ROOT, 'src')),
      ...walk(path.join(ROOT, 'docs')),
      ...walk(path.join(ROOT, 'scripts')),
    ].filter((file) => /\.(ts|tsx|js|mjs|md|json|env)$/.test(file));

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(SECRET_VALUE_RE);
      expect(text, file).not.toMatch(PUBLIC_SECRET_RE);
    }
  });

  it('client nunca chama OpenRouter / chat/completions; chave só no provider server-only', () => {
    const client = readIfExists('src/lib/nutrition/ai-assistant-client.ts') ?? '';
    const modal = readIfExists('src/components/nutrition/AiMealAssistantModal.tsx') ?? '';
    expect(client).not.toContain('openrouter.ai');
    expect(client).not.toContain('chat/completions');
    expect(client).not.toContain('GYMFLOW_AI_API_KEY');
    expect(modal).not.toContain('GYMFLOW_AI_API_KEY');
    expect(modal).not.toContain('openrouter.ai');

    const provider = readIfExists('src/lib/nutrition/ai-assistant-provider.ts') ?? '';
    expect(provider).toContain('GYMFLOW_AI_API_KEY');
    expect(provider).toContain('/chat/completions');
    expect(provider).toContain('MÓDULO EXCLUSIVAMENTE SERVER-SIDE');
  });

  it('artefatos de build (.next/static, out/) sem chave nem openrouter quando existirem', () => {
    const artifactDirs = [
      path.join(ROOT, '.next/static'),
      path.join(ROOT, 'out'),
    ];
    for (const dir of artifactDirs) {
      if (!fs.existsSync(dir)) continue;
      for (const file of walk(dir)) {
        if (!/\.(js|html|json|txt|map)$/.test(file)) continue;
        const text = fs.readFileSync(file, 'utf8');
        expect(text, file).not.toContain('GYMFLOW_AI_API_KEY');
        expect(text, file).not.toContain('openrouter.ai');
        expect(text, file).not.toContain('/chat/completions');
        expect(text, file).not.toMatch(SECRET_VALUE_RE);
      }
    }
  });
});
