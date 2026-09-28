# Guardrails de custo e abuso do Assistente IA (GOAL-120)

**GOAL:** `GYMFLOW-AI-COST-ABUSE-GUARDRAILS-120`
**Data:** 2026-09-28
**Base:** `origin/master` `e028436ed282709a226f7377e984c717daab9b36`
**Escopo:** contenções operacionais externas (OpenRouter + Vercel Firewall), **sem
nenhuma mudança de código** e sem deploy. Mitigação do P1 operacional
"gateway público sem autenticação/quota" (F1 do GOAL-118, aberto desde o
GOAL-110). **Não resolve autenticação** — ver §5.

---

## 1. Teto de gasto OpenRouter (COST_CAP)

Configurado **diretamente na chave existente** do GymFlow no painel OpenRouter
(sem recriação, sem invalidar a credencial Production; modelo e provider
inalterados):

| Campo | Valor |
|---|---|
| Chave | `GYMFLOW_AI_API_KEY` (Vercel Production) = chave "Aplicativo Gymflow" do OpenRouter |
| Identificação (não-sensível) | rótulo "Aplicativo Gymflow"; cauda pública `sk-or-v1-460…f57`; hash público da linha `4c57a111…`; último uso condizente com a Production (GOAL-118) |
| **OPENROUTER_KEY_LIMIT** | **USD 5,00** |
| **OPENROUTER_LIMIT_RESET** | **MONTHLY** (renicia no dia 1º de cada mês) |
| Uso até a configuração | $ 0,4529 (30 dias) |
| **OPENROUTER_CONFIG_STATUS** | **CONFIGURED** (coluna "Limite de chave" da lista do painel: `$ 5` + chip `MÊS`) |

- Ao atingir US$ 5 no mês, a chave deixa de funcionar até o reset mensal
  (fail-closed do provedor; o gateway devolve 502/503 ao app — mensagem honesta
  de indisponibilidade).
- Autorização financeira: US$ 5/mês. **Qualquer aumento exige nova autorização
  humana.**
- A chave de inferência não edita o próprio limite via API (`PATCH
  /api/v1/keys/{hash}` exige management key) e as envs de Production da Vercel
  são *Sensitive* (o `vercel env pull` grava placeholder, o valor é write-only).
  A configuração foi feita no painel OpenRouter (sessão do navegador do
  responsável). **O valor da chave nunca foi impresso, copiado ou versionado.**
- Não foi criada management key (nova credencial evitada de propósito).

## 2. Rate limit Vercel Firewall (BASIC_RATE_LIMIT)

Regra criada no projeto `gymflow` (Vercel CLI 57, `vercel firewall rules add`
→ `publish`; draft inspecionado antes de publicar):

| Campo | Valor |
|---|---|
| Nome / id | `nutrition-assistant-post-rate-limit` / `rule_nutrition_assistant_post_rate_limit_Q0u9SD` |
| Condições | `path equals /api/nutrition/assistant` **AND** `method equals POST` |
| **RATE_LIMIT_RULE** | **10 requests / 60 seconds / IP** (fixed window) |
| Ação ao exceder | `rate_limit` → **HTTP 429** |
| matching | Exato: não casa com OPTIONS (preflight CORS preservado), nem GET, nem qualquer outra rota |
| **VERCEL_PLAN** | Hobby (time `rafaelfaria49-4373s-projects`) — rate limiting do WAF disponível no Hobby: 1 regra por projeto, janela 10 s–10 min, chave IP, **1.000.000 requisições permitidas/mês inclusas** |
| **ADDITIONAL_PAID_SERVICE** | **NO** (sem upgrade, sem cobrança automática dentro da franquia) |
| **VERCEL_FIREWALL_STATUS** | **PUBLISHED** (live configuration; `vercel firewall diff` sem mudanças pendentes) |

Tráfego mitigado pelo firewall não consome CDN/FDT (docs Vercel). Observação do
fornecedor: contadores de rate limit são **por região**.

## 3. Validação em Production (2026-09-28, `https://gymflow-beige-gamma.vercel.app`)

| Caso | Resultado |
|---|---|
| OPTIONS `https://localhost` (Android) | 204 + ACAO `https://localhost` — **CORS_ANDROID = PASS** |
| OPTIONS `capacitor://localhost` (iOS) | 204 + ACAO `capacitor://localhost` — **CORS_IOS = PASS** |
| OPTIONS origem estrangeira | 403 sem CORS |
| GET `/` (fora do matching da regra) | 200 |
| POST normal Android (`complete_protein`) | 200 grounded (frango 120 g) + ACAO — **AI_NORMAL_REQUEST = PASS** |
| POST origem estrangeira | 403 antes do provedor |
| Rajada de 12 POSTs com JSON inválido (falham no parse, antes do provedor pago) | r01–r07 = 400; **r08–r12 = 429** — o 429 começou exatamente na 10ª requisição casada da janela — **RATE_LIMIT_429 = PASS** |
| Após os 60 s da janela | OPTIONS 204 e POST normal 200 de novo (recuperação) |

Chamadas pagas geradas pela validação: **2** (os dois POSTs 200). O teste de
volume usou payload inválido de propósito (400 fail-closed, custo zero).

## 4. Segredos

`SECRET_EXPOSURE = NO`. Valor de `GYMFLOW_AI_API_KEY` nunca lido, impresso ou
versionado (Vercel *Sensitive* = write-only); só metadados não-sensíveis
(rótulo, cauda/hash públicos, uso) foram registrados. Nenhuma credencial Vercel
ou OpenRouter em docs. Nenhum deploy de código; nenhuma env alterada.

## 5. O que ficou protegido × o que continua pendente

| Estado | Valor |
|---|---|
| COST_CAP_MITIGATION | **ACTIVE** (US$ 5/mês na chave; teto duro mesmo sob abuso) |
| RATE_LIMIT_MITIGATION | **ACTIVE** (10 req/60 s/IP → 429 na rota do Assistente) |
| AUTHENTICATED_GATEWAY | **NO** |
| AI_SMOKE | PASS (200 grounded após as contenções) |

Limitações honestas (não eliminar a pendência arquitetural):

- Rate limit **por IP não é autenticação**: não identifica usuário, não impede
  abuso distribuído (botnets/proxies), e os contadores da Vercel são por região
  (tráfego multi-região pode exceder 10/60 s efetivos).
- O teto OpenRouter limita o **prejuízo mensal a US$ 5**, não o abuso: esgotado
  o limite, o Assistente fica indisponível para todos até o reset (dia 1º).
- Chamadas sem Origin (curl/bots) e WebViews Capacitor genéricos continuam
  alcançando o gateway dentro desses tetos.
- Correção real (GOAL de backend autorizado): autenticação de usuário /
  Play Integrity / App Attest + quota com estado por usuário/sessão/token.
  Registrado em `docs/PENDENCIAS.md`.

## 6. Não feito (fora de escopo, por ordem do GOAL)

GOAL-119 intocado; sem upload key; sem Google Play; D-NUT-08/D-NUT-09
inalterados; nenhuma implementação de autenticação; nenhum upgrade pago.
