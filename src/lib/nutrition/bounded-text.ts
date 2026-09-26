/**
 * GymFlow AI — Leitura de corpo HTTP com teto em bytes (GOAL-118)
 *
 * Usado pelo gateway do assistente (corpo da requisição) e pelo adapter do
 * provedor (corpo da resposta): o teto do contrato vale em bytes UTF-8 e a
 * leitura para — cancelando o stream — assim que ele é ultrapassado, sem
 * materializar o corpo inteiro.
 */

export type BoundedTextResult = { kind: 'ok'; text: string } | { kind: 'too-large' };

export interface BoundedTextSource {
  body?: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}

/**
 * Lê `source` até `maxBytes`. Corpo `null` (requisição sem corpo) = texto
 * vazio. Sem stream disponível (ex.: dublês de teste), usa `text()` e mede em
 * bytes. Decodificação UTF-8 igual à de `text()` (sequência inválida vira
 * U+FFFD). Erros de leitura propagam para quem chamou.
 */
export async function readTextWithinLimit(source: BoundedTextSource, maxBytes: number): Promise<BoundedTextResult> {
  if (source.body === null) return { kind: 'ok', text: '' };
  if (source.body === undefined || typeof source.body.getReader !== 'function') {
    const text = await source.text();
    if (text.length > maxBytes || new TextEncoder().encode(text).byteLength > maxBytes) return { kind: 'too-large' };
    return { kind: 'ok', text };
  }
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { kind: 'too-large' };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { kind: 'ok', text: new TextDecoder('utf-8').decode(bytes) };
}
