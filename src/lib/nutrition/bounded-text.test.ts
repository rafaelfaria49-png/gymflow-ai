/**
 * GymFlow AI — Testes da leitura de corpo com teto em bytes (GOAL-118)
 */

import { describe, expect, it } from 'vitest';
import { readTextWithinLimit } from './bounded-text';

function streamOf(parts: Uint8Array[], onCancel?: () => void): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < parts.length) controller.enqueue(parts[index++]);
      else controller.close();
    },
    cancel() {
      onCancel?.();
    },
  });
}

describe('GOAL-118 readTextWithinLimit', () => {
  it('lê stream dentro do teto e decodifica UTF-8 atravessando chunks', async () => {
    const bytes = new TextEncoder().encode('açaí 🍓');
    const result = await readTextWithinLimit(new Response(streamOf([bytes.slice(0, 2), bytes.slice(2, 7), bytes.slice(7)])), 64);
    expect(result).toEqual({ kind: 'ok', text: 'açaí 🍓' });
  });

  it('para e cancela o stream assim que passa do teto em bytes', async () => {
    let cancelled = false;
    const chunk = new Uint8Array(10).fill(0x61);
    const parts = Array.from({ length: 100 }, () => chunk);
    const result = await readTextWithinLimit(new Response(streamOf(parts, () => (cancelled = true))), 25);
    expect(result).toEqual({ kind: 'too-large' });
    expect(cancelled).toBe(true);
  });

  it('teto é em bytes, não em caracteres', async () => {
    const text = 'é'.repeat(20); // 20 caracteres, 40 bytes
    expect(await readTextWithinLimit(new Response(text), 30)).toEqual({ kind: 'too-large' });
    expect(await readTextWithinLimit(new Response(text), 40)).toEqual({ kind: 'ok', text });
  });

  it('corpo null = texto vazio; dublê sem stream usa text() medido em bytes', async () => {
    expect(await readTextWithinLimit(new Request('https://x.test/', { method: 'POST' }), 10)).toEqual({ kind: 'ok', text: '' });
    expect(await readTextWithinLimit({ text: async () => 'ok' }, 10)).toEqual({ kind: 'ok', text: 'ok' });
    expect(await readTextWithinLimit({ text: async () => 'ç'.repeat(6) }, 10)).toEqual({ kind: 'too-large' });
  });

  it('erro de leitura do stream propaga', async () => {
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('quebrado'));
      },
    });
    await expect(readTextWithinLimit(new Response(broken), 10)).rejects.toThrow('quebrado');
  });
});
