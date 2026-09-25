/**
 * GymFlow AI — Testes do HTTP do gateway + CORS cirúrgico (GOAL-118)
 *
 * Provider real NUNCA é chamado: `fetchImpl` e `env` injetados.
 * Prova: CORS Android/iOS (preflight + POST, inclusive nos erros), allowlist
 * exata (sem `*`, LAN, túnel, outros hosts Vercel), origem não autorizada
 * fail-closed sem chamar o provedor, web same-origin preservado e chamadas
 * sem `Origin` (servidor/smoke) inalteradas.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  NATIVE_APP_ORIGINS,
  classifyRequestOrigin,
  handleAssistantOptions,
  handleAssistantPost,
} from './ai-assistant-route';

const PRODUCTION_HOST = 'gymflow-beige-gamma.vercel.app';
const ENDPOINT = `https://${PRODUCTION_HOST}/api/nutrition/assistant`;
const ANDROID = 'https://localhost';
const IOS = 'capacitor://localhost';

const CONFIGURED_ENV = {
  GYMFLOW_AI_ENABLED: 'true',
  GYMFLOW_AI_BASE_URL: 'https://ai.example.com/v1',
  GYMFLOW_AI_API_KEY: 'test-key-sem-valor-real',
  GYMFLOW_AI_MODEL: 'fake-model-test',
};

const UNAUTHORIZED_ORIGINS = [
  'http://localhost',
  'https://localhost:8443',
  'http://localhost:3000',
  'https://LOCALHOST',
  'https://localhost.evil.example.com',
  'capacitor://evil',
  'ionic://localhost',
  'http://192.168.0.6:3000',
  'https://10.0.2.2',
  'https://abc123.ngrok-free.app',
  'https://gymflow-git-feature-rafael.vercel.app',
  'https://gymflow.vercel.app',
  'https://evil.example.com',
  'null',
  '*',
];

function validContext() {
  return {
    remaining: { calories: 800, protein: 60, carbs: 90, fat: 25 },
    targets: { calories: 2500, protein: 160, carbs: 300, fat: 70 },
  };
}

function openAiEnvelope(choiceContent: string) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: choiceContent } }] }),
  } as unknown as Response;
}

function serverHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { host: PRODUCTION_HOST, 'x-forwarded-proto': 'https', ...extra };
}

function preflight(origin: string | null, extra: Record<string, string> = {}): Request {
  const headers: Record<string, string> = serverHeaders({
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'content-type',
    ...extra,
  });
  if (origin !== null) headers['origin'] = origin;
  return new Request(ENDPOINT, { method: 'OPTIONS', headers });
}

function post(origin: string | null, body: string, extra: Record<string, string> = {}): Request {
  const headers: Record<string, string> = serverHeaders({ 'content-type': 'application/json', ...extra });
  if (origin !== null) headers['origin'] = origin;
  return new Request(ENDPOINT, { method: 'POST', headers, body });
}

const completeProtein = (state: Record<string, unknown> = { state: 'AUTOMATED' }) =>
  JSON.stringify({ useCase: 'complete_protein', context: validContext(), availability: state });

function frangoProvider() {
  return vi.fn().mockResolvedValue(
    openAiEnvelope(JSON.stringify({ items: [{ foodReferenceId: 'br-peito-frango-grelhado', grams: 150, calories: 1 }] })),
  );
}

function expectNoCors(response: Response): void {
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  expect(response.headers.get('access-control-allow-methods')).toBeNull();
  expect(response.headers.get('access-control-allow-headers')).toBeNull();
  expect(response.headers.get('access-control-allow-credentials')).toBeNull();
}

describe('GOAL-118 CORS: allowlist exata', () => {
  it('somente as duas origens nativas do Capacitor (nunca wildcard)', () => {
    expect([...NATIVE_APP_ORIGINS].sort()).toEqual([ANDROID, IOS].sort());
    expect(NATIVE_APP_ORIGINS).not.toContain('*');
  });

  it('classifica ausente / nativo / same-origin / proibido', () => {
    expect(classifyRequestOrigin(new Headers(serverHeaders())).kind).toBe('absent');
    expect(classifyRequestOrigin(new Headers(serverHeaders({ origin: ANDROID })))).toEqual({ kind: 'native-app', origin: ANDROID });
    expect(classifyRequestOrigin(new Headers(serverHeaders({ origin: IOS })))).toEqual({ kind: 'native-app', origin: IOS });
    expect(classifyRequestOrigin(new Headers(serverHeaders({ origin: `https://${PRODUCTION_HOST}` }))).kind).toBe('same-origin');
    for (const origin of UNAUTHORIZED_ORIGINS) {
      expect(classifyRequestOrigin(new Headers(serverHeaders({ origin }))).kind, origin).toBe('forbidden');
    }
  });

  it('same-origin exige host E esquema iguais aos da requisição', () => {
    // Página http no mesmo host, atrás de proxy https → não é same-origin.
    expect(classifyRequestOrigin(new Headers(serverHeaders({ origin: `http://${PRODUCTION_HOST}` }))).kind).toBe('forbidden');
    // Sem Host não há como provar same-origin.
    expect(classifyRequestOrigin(new Headers({ origin: `https://${PRODUCTION_HOST}` })).kind).toBe('forbidden');
    // Origin com path não é um Origin serializado válido.
    expect(classifyRequestOrigin(new Headers(serverHeaders({ origin: `https://${PRODUCTION_HOST}/x` }))).kind).toBe('forbidden');
    // Dev local (sem proxy): http://localhost:3000 chamando o próprio servidor.
    expect(classifyRequestOrigin(new Headers({ host: 'localhost:3000', origin: 'http://localhost:3000' })).kind).toBe('same-origin');
  });
});

describe('GOAL-118 CORS: preflight OPTIONS', () => {
  it.each([
    ['Android', ANDROID],
    ['iOS', IOS],
  ])('CORS_%s: POST + Content-Type liberados só para a própria origem', (_label, origin) => {
    const response = handleAssistantOptions(preflight(origin));
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type');
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    expect(response.headers.get('vary')).toMatch(/\bOrigin\b/);
  });

  it('preflight sem Access-Control-Request-Headers (só método) também passa', () => {
    const request = new Request(ENDPOINT, {
      method: 'OPTIONS',
      headers: serverHeaders({ origin: ANDROID, 'access-control-request-method': 'POST' }),
    });
    expect(handleAssistantOptions(request).status).toBe(204);
  });

  it.each(UNAUTHORIZED_ORIGINS)('origem não autorizada %s → 403 sem CORS', (origin) => {
    const response = handleAssistantOptions(preflight(origin));
    expect(response.status).toBe(403);
    expectNoCors(response);
    expect(response.headers.get('vary')).toMatch(/\bOrigin\b/);
  });

  it.each([
    ['método PUT', { 'access-control-request-method': 'PUT' }],
    ['método GET', { 'access-control-request-method': 'GET' }],
    ['método em minúsculas', { 'access-control-request-method': 'post' }],
    ['header Authorization', { 'access-control-request-headers': 'content-type, authorization' }],
    ['header customizado', { 'access-control-request-headers': 'x-gymflow-debug' }],
  ])('origem nativa pedindo %s → 403 sem CORS', (_label, extra) => {
    const response = handleAssistantOptions(preflight(ANDROID, extra));
    expect(response.status).toBe(403);
    expectNoCors(response);
  });

  it('origem nativa sem Access-Control-Request-Method não é preflight válido → 403', () => {
    const request = new Request(ENDPOINT, { method: 'OPTIONS', headers: serverHeaders({ origin: IOS }) });
    const response = handleAssistantOptions(request);
    expect(response.status).toBe(403);
    expectNoCors(response);
  });

  it('OPTIONS sem Origin (não-CORS) e same-origin mantêm 204 + Allow, sem CORS', () => {
    for (const origin of [null, `https://${PRODUCTION_HOST}`]) {
      const response = handleAssistantOptions(preflight(origin));
      expect(response.status).toBe(204);
      expect(response.headers.get('allow')).toBe('OPTIONS, POST');
      expectNoCors(response);
    }
  });
});

describe('GOAL-118 CORS: POST do app nativo (sucesso e erros com CORS)', () => {
  it.each([
    ['Android', ANDROID],
    ['iOS', IOS],
  ])('POST %s 200 grounded com CORS; macros do modelo descartados', async (_label, origin) => {
    const fetchImpl = frangoProvider();
    const response = await handleAssistantPost(post(origin, completeProtein()), {
      env: CONFIGURED_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('vary')).toBe('Origin');
    expect(response.headers.get('content-type')).toMatch(/application\/json/);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.proposal.items[0].foodReferenceId).toBe('br-peito-frango-grelhado');
    expect(body.proposal.items[0].computed.calories).toBeCloseTo(238.5, 1);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(JSON.stringify(body)).not.toContain('test-key-sem-valor-real');
  });

  const slowProvider = () =>
    vi.fn().mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );

  it.each([
    ['400 JSON inválido', '{oops', CONFIGURED_ENV, () => vi.fn(), 400, 'INVALID_REQUEST', false],
    ['413 corpo acima do teto', 'x'.repeat(17 * 1024), CONFIGURED_ENV, () => vi.fn(), 413, 'REQUEST_TOO_LARGE', false],
    ['409 MANUAL_ONLY', completeProtein({ state: 'MANUAL_ONLY', reason: 'PROFILE_ABSENT' }), CONFIGURED_ENV, () => vi.fn(), 409, 'MANUAL_ONLY', false],
    [
      '403 gate clínico',
      completeProtein({ state: 'CLINICAL_GATE_BLOCKED', gateStatus: 'BLOCK_AUTOMATIC_TARGET' }),
      CONFIGURED_ENV,
      () => vi.fn(),
      403,
      'CLINICAL_GATE_BLOCKED',
      false,
    ],
    ['503 provedor não configurado', completeProtein(), { GYMFLOW_AI_ENABLED: 'false' }, () => vi.fn(), 503, 'PROVIDER_UNAVAILABLE', false],
    [
      '502 HTTP do provedor',
      completeProtein(),
      CONFIGURED_ENV,
      () => vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' } as unknown as Response),
      502,
      'PROVIDER_HTTP_ERROR',
      true,
    ],
    ['504 timeout do provedor', completeProtein(), CONFIGURED_ENV, slowProvider, 504, 'PROVIDER_TIMEOUT', true],
  ] as const)('%s mantém CORS nativo', async (_label, body, env, makeFetch, status, code, providerCalled) => {
    for (const origin of [ANDROID, IOS]) {
      const fetchImpl = makeFetch();
      const response = await handleAssistantPost(post(origin, body), {
        env,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 50,
      });
      expect(response.status).toBe(status);
      expect(response.headers.get('access-control-allow-origin')).toBe(origin);
      expect(response.headers.get('vary')).toBe('Origin');
      const json = await response.json();
      expect(json).toMatchObject({ status: 'failure', code });
      expect(fetchImpl.mock.calls.length > 0).toBe(providerCalled);
    }
  });

  it('corpo ilegível → 400 com CORS', async () => {
    const request = post(ANDROID, completeProtein());
    vi.spyOn(request, 'text').mockRejectedValue(new Error('stream quebrado'));
    const response = await handleAssistantPost(request, { env: CONFIGURED_ENV });
    expect(response.status).toBe(400);
    expect(response.headers.get('access-control-allow-origin')).toBe(ANDROID);
  });
});

describe('GOAL-118 CORS: origem não autorizada fail-closed', () => {
  it.each(UNAUTHORIZED_ORIGINS)('POST de %s → 403, sem CORS, sem ler corpo, sem provedor', async (origin) => {
    const fetchImpl = frangoProvider();
    const request = post(origin, completeProtein());
    const readBody = vi.spyOn(request, 'text');
    const response = await handleAssistantPost(request, { env: CONFIGURED_ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(response.status).toBe(403);
    expectNoCors(response);
    expect(response.headers.get('vary')).toBe('Origin');
    expect(await response.json()).toMatchObject({ status: 'failure', code: 'INVALID_REQUEST' });
    expect(readBody).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('GOAL-118: web same-origin e chamadas sem Origin preservadas', () => {
  it('web GymFlow (same-origin) → 200 sem nenhum header CORS', async () => {
    const fetchImpl = frangoProvider();
    const response = await handleAssistantPost(post(`https://${PRODUCTION_HOST}`, completeProtein()), {
      env: CONFIGURED_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(response.status).toBe(200);
    expectNoCors(response);
    expect((await response.json()).status).toBe('ok');
  });

  it('sem Origin (servidor/smoke) → contrato de sempre, sem CORS', async () => {
    const fetchImpl = frangoProvider();
    const response = await handleAssistantPost(post(null, completeProtein()), {
      env: CONFIGURED_ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(response.status).toBe(200);
    expectNoCors(response);
  });

  it('erros same-origin continuam sem CORS (ex.: 409 MANUAL_ONLY)', async () => {
    const response = await handleAssistantPost(
      post(`https://${PRODUCTION_HOST}`, completeProtein({ state: 'MANUAL_ONLY', reason: 'PROFILE_ABSENT' })),
      { env: CONFIGURED_ENV },
    );
    expect(response.status).toBe(409);
    expectNoCors(response);
  });
});

describe('GOAL-118: nenhum wildcard/CORS fora do gateway da Nutrição', () => {
  const root = path.resolve(__dirname, '..', '..', '..');
  const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

  it('route.ts só delega POST/OPTIONS ao módulo com a allowlist', () => {
    const route = read('src/app/api/nutrition/assistant/route.ts');
    expect(route).toMatch(/export async function POST\(request: Request\)[^]*handleAssistantPost\(request\)/);
    expect(route).toMatch(/export function OPTIONS\(request: Request\)[^]*handleAssistantOptions\(request\)/);
    expect(route).not.toMatch(/Access-Control-Allow-Origin/i);
  });

  it('nenhum Access-Control-Allow-Origin: * no gateway nem no next.config', () => {
    for (const file of ['src/lib/nutrition/ai-assistant-route.ts', 'next.config.ts', 'src/app/api/nutrition/assistant/route.ts']) {
      expect(read(file), file).not.toMatch(/Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*['"]/i);
    }
    expect(read('next.config.ts')).not.toMatch(/Access-Control/i);
  });
});
