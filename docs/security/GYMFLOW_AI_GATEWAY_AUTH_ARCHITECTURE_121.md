# Arquitetura de autenticação e quota do gateway do Assistente IA (GOAL-121)

**GOAL:** `GYMFLOW-AI-AUTH-QUOTA-ARCHITECTURE-AUDIT-121`
**Data:** 2026-09-28
**Base:** `origin/master` `ebcc7867c60012aee58e9ec7de9beabaec747f4c`
**Natureza:** auditoria + desenho (**docs-only**). Nenhum código produtivo, dependência,
credencial, serviço externo ou configuração (Vercel, OpenRouter, Google, Apple) foi alterado
ou provisionado. **Nenhum gasto é autorizado por este documento.**
**Não tocado:** worktree/branch do GOAL-119 (`feat/gymflow-training-mobile-clarity-pickers-119`),
`labs/avatar-lab`, `docs/avatar-design`, `app/poc-3d`, arquivos GLB, pipeline do Kai.
**Relação com GOALs anteriores:** transforma o P1 "gateway público sem autenticação/quota"
(F1 do GOAL-118, mitigado — não resolvido — pelo GOAL-120, `docs/AI_COST_ABUSE_GUARDRAILS_120.md`)
em um desenho implementável.

### Convenção de evidência

| Marca | Significado |
|---|---|
| `[CÓDIGO]` | lido no repositório (arquivo:linha) na base acima |
| `[PROD]` | medido em Production (`https://gymflow-beige-gamma.vercel.app`) em 2026-09-28 por este GOAL, **sem nenhuma chamada paga** (só JSON inválido, corpo fora do contrato e `OPTIONS`) |
| `[OFICIAL]` | documentação oficial do fornecedor, lida em 2026-09-28 (URL e data no Apêndice A) |
| `[INFERÊNCIA]` | conclusão derivada do que está acima; precisa ser validada antes de virar premissa |
| `[NÃO VERIFICADO]` | não confirmado nesta auditoria; entra na lista U-xx (Apêndice E) e é validado na fase R1 |

Nada aqui é conformidade jurídica: os pontos de privacidade são mapeamentos factuais para
decisão humana/jurídica (D-NUT-09 continua `PENDING`).

### Índice

0. Sumário executivo
1. Auditoria do estado atual
2. Governança
3. Modelo de ameaças
4. Android — Play Integrity
5. iOS — App Attest / DeviceCheck
6. Arquiteturas comparadas e recomendação
7. Token e sessão
8. Quota com estado
9. Storage
10. Privacidade e dados
11. Fluxo de erro
12. Rollout (R0–R4)
13. Custos e gates humanos
14. Decisões
15. Estado de aceite
16. Revisão independente
- Apêndices: A fontes · B contrato de API · C modelo de dados · D emenda proposta ao CLAUDE.md · E itens não verificados · F receita da revisão independente (pendente)

---

## 0. Sumário executivo

**Hoje** (`AUTHENTICATED_GATEWAY = NO`): qualquer cliente que fale HTTPS alcança o pipeline do
Assistente IA — o `Origin` é ignorado quando ausente (curl/bot) e é só um cabeçalho forjável fora
de navegadores. As duas contenções ativas limitam o *dano*, não o *acesso*: teto de US$ 5/mês
na chave OpenRouter (fail-closed para todos) e 10 POST/60 s/IP no Vercel Firewall (contadores por
região). O app **não tem identidade nenhuma**: o "login" é uma tela simulada; não existe
`INSTALLATION_ID`, `DEVICE_ID`, sessão de servidor ou conta.

**Arquitetura recomendada (alvo):** *instalação atestada + sessão opaca emitida pelo servidor +
quota com estado por instalação*, com conta de usuário como extensão aditiva (não pré-requisito).

1. O app gera uma **chave de instalação** no hardware (Android Keystore / Secure Enclave via App
   Attest) e a **atesta uma vez** com a plataforma (Play Integrity *standard* com `requestHash` /
   App Attest com *challenge*). O servidor valida e devolve `installation_id` + **token de sessão
   opaco** de vida curta. Nenhum segredo vai no cliente.
2. As chamadas do Assistente levam só `Authorization: Bearer <token>`; a atestação **não** roda por
   chamada (custaria cota Google, latência e dependência de disponibilidade). Renovação = prova de
   posse da chave (sem chamar Google/Apple) + reatestação a cada `ATTEST_MAX_AGE`.
3. **Atestação não é autenticação**: ela prova "app genuíno em aparelho genuíno", não "quem" — o
   Firebase App Check separa explicitamente "atestação do app" de "autenticação do usuário" e a
   Apple trata o App Attest como sinal de risco, não como garantia `[OFICIAL]`. O controle real é a
   **quota por instalação no servidor**; a atestação só torna cada unidade de quota escassa (um
   aparelho físico) em vez de grátis (curl).
4. Estado (challenge single-use, sessão, quota, revogação) em **Redis serverless** (Upstash via
   Vercel Marketplace) atrás de uma porta `GuardStore` substituível; **nenhum dado de saúde, treino
   ou nutrição** vai para o servidor; Postgres/Supabase só quando existir conta (GOAL-36 da Fase 8).
5. Camadas: cap OpenRouter (global, último recurso) → Firewall por IP (rajada, por região) → quota
   lógica por instalação (unidade: chamadas/dia UTC e mês) → pacing diário do orçamento global.
   **Números de quota não são escolhidos aqui**: saem da telemetria da fase R1.

**Fica bloqueado por gates humanos** (Seção 13/14): emenda ao `CLAUDE.md` (que hoje proíbe
backend e Supabase), autorização do store, conta Play Console + projeto Google Cloud, Apple
Developer Program (iOS), plano Vercel (Hobby é *não comercial* [OFICIAL]) e a política do canal web
(hoje anônimo e não atestável).

**Rollout seguro:** R0 governança → R1 enrollment opcional + telemetria (sem bloquear ninguém) →
R2 enforcement de atestação (shadow → enforce, com kill-switch e compat para builds antigos) →
R3 quota com estado → R4 endurecimento (iOS, tiers, anti-farming, conta).

**Revisão independente (item 15 do GOAL): NÃO EXECUTADA** — falha do ambiente local que impede o
Codex CLI de conectar (Seção 16). Por isso o desenho **não** é declarado pronto para implementação
(`READY_FOR_AUTH_IMPLEMENTATION_GOAL = PENDING_INDEPENDENT_REVIEW`, Seção 15); a receita para
concluir está no Apêndice F.

**Este GOAL não faz:** backend, Supabase/DB/KV, Play Integrity, App Attest, credenciais, mudança
em Vercel/OpenRouter, GOAL-119, Google Play.

---

## 1. Auditoria do estado atual

### 1.1 Fluxo do gateway `[CÓDIGO]` `[PROD]`

```
App nativo (WebView https://localhost | capacitor://localhost) ─┐
Web (same-origin, gymflow-beige-gamma.vercel.app)                ├─► POST /api/nutrition/assistant
curl / bot / servidor (sem cabeçalho Origin)                     ─┘         │
                                                                            ▼
          Vercel Firewall: 10 POST/60 s/IP (contador por região) ──► 429 (envelope da Vercel, ver 1.3)
                                                                            ▼
        função Next (runtime Node, iad1; edge gru1): classifyRequestOrigin → teto de corpo 16 KiB →
        JSON → validação estrita dos 5 casos → gate clínico/metas → OpenRouter chat/completions
        (GYMFLOW_AI_API_KEY, teto US$ 5/mês) → parse estrito → grounding no FoodDatabase → resposta
```

- Rota: `src/app/api/nutrition/assistant/route.ts` só delega `POST`/`OPTIONS` a
  `src/lib/nutrition/ai-assistant-route.ts`; pipeline em `ai-assistant-gateway.ts:103`.
- Contrato: corpo ≤ 16 KiB (`ai-assistant-types.ts:72`), `max_tokens` 1200
  (`ai-assistant-provider.ts:162`), timeout do provedor 12 s (`ai-assistant-types.ts:79`) e do
  cliente 15 s (`ai-assistant-client.ts:96`), `redirect: 'error'` no fetch do provedor (`:169`).
- **Estado no servidor: nenhum.** Não há banco, cache, sessão, contador nem log de uso próprio
  (só logs da plataforma). `next.config.ts` não define `headers`; não existe `proxy.ts`
  (o `middleware.ts` do Next 16) nem `vercel.json` no repositório.
- Variáveis de ambiente do servidor: `GYMFLOW_AI_ENABLED`, `GYMFLOW_AI_BASE_URL`,
  `GYMFLOW_AI_API_KEY` (Sensitive, write-only na Vercel), `GYMFLOW_AI_MODEL`
  (`ai-assistant-provider.ts:51`). O bundle só conhece a origem pública
  (`NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL`, constante versionada `PRODUCTION_BACKEND_ORIGIN`,
  `scripts/android/play-release-lib.mjs:22`).
- Build mobile: `output: "export"` (`next.config.ts:9-19`) — a rota POST **não entra** no `out/`;
  qualquer novo endpoint de servidor existirá só no build web/Vercel, nunca no bundle nativo.
- Runtime Next 16: `runtime` padrão é `'nodejs'` e o `proxy` "não deve ser usado como solução
  completa de sessão/autorização" `[OFICIAL: docs do Next empacotadas em
  node_modules/next/dist/docs]` → a verificação de sessão deve viver na Route Handler, não em `proxy.ts`.

### 1.2 CORS e `Origin`: o que protege e o que não protege `[CÓDIGO]` `[PROD]`

| Classe de origem | Regra (`ai-assistant-route.ts`) | Alcança o provedor? |
|---|---|---|
| ausente (curl, bot, servidor) | `classifyRequestOrigin` → `absent` (`:82`), contrato normal, sem CORS | **sim** |
| same-origin (web GymFlow) | `isSameOrigin`: host do `Origin` = `Host` e esquema = `x-forwarded-proto` | **sim** |
| `https://localhost`, `capacitor://localhost` | `NATIVE_APP_ORIGINS` (`:32`), origem ecoada + `Vary` | **sim** |
| qualquer outra | 403 antes de ler o corpo (D118-003) | não |

- O `Origin` é um cabeçalho **controlado pelo cliente fora de navegadores**; o CORS é aplicado
  pelo navegador. A allowlist só impede *páginas de terceiros em navegadores* de usar o gateway
  como proxy pago. **Não é autenticação e não barra curl/bots.**
- `[PROD]` POST sem `Origin` com `{}` → `400 INVALID_REQUEST` ("useCase inválido…"): a requisição
  anônima chega à validação estrita; com corpo válido chegaria ao provedor (não executado para
  não gerar custo).
- `[PROD]` Preflight `OPTIONS` com `Origin: https://localhost` pedindo `authorization,content-type`
  → **403**; só `content-type` → 204 com `Access-Control-Allow-Headers: Content-Type`
  (`isAllowedPreflight`, `:159-166`). **Um Bearer token exige mudar este contrato** (F-121-05).

### 1.3 Contenções ativas (GOAL-120) e o que foi re-medido hoje `[PROD]`

| Camada | Configuração | Efeito | Limite |
|---|---|---|---|
| Cap OpenRouter | chave "Aplicativo Gymflow", US$ 5,00/mês, reset mensal (painel) | fail-closed para **todos** quando esgotado | é configuração externa não versionada |
| Vercel Firewall | `path eq /api/nutrition/assistant` AND `method eq POST` → 10 req/60 s/IP, 429 | rajada por IP | contador **por região**; chave IP; não identifica ninguém |

Re-medição (2026-09-28 21:36–21:37Z, 12 POST com JSON inválido, `Origin: https://localhost`,
zero chamadas pagas): `r01–r10 = 400`, `r11–r12 = 429`. Comparação das respostas:

| | resposta da função (400) | resposta do Firewall (429) |
|---|---|---|
| `Access-Control-Allow-Origin` | `https://localhost` | **ausente** |
| `Vary` / `Retry-After` | `Origin` / — | **ausentes** |
| corpo | `{"status":"failure","code":"INVALID_REQUEST",…}` | `{"error":{"code":"429","message":"Too Many Requests","id":"gru1::…"}}` |
| identificação | `X-Vercel-Id: gru1::iad1::…` (edge São Paulo, função iad1) | `X-Vercel-Mitigated: deny` |

`[INFERÊNCIA]` (regra CORS): resposta cross-origin sem ACAO é opaca para `fetch` num WebView
`https://localhost` → o app vê `TypeError`, que `ai-assistant-client.ts:139-143` mapeia para
"rede indisponível?" — **o app nativo não distingue "rate limited" de "offline"** (F-121-03, U-04).

Limites da Vercel `[OFICIAL]`: WAF Rate Limiting em todos os planos; **Hobby = 1 regra de rate
limit por projeto, 3 regras custom no total, chaves IP/JA4** (cabeçalho arbitrário só no Enterprise),
janela 10 s–10 min, fixed window, 1.000.000 "allowed requests" incluídos; contadores por região.
→ o Firewall **não consegue limitar por token/instalação** no plano atual; a quota lógica tem de
ficar na função (F-121-09).

### 1.4 Fluxo OpenRouter `[CÓDIGO]` `[OFICIAL]`

- Chamada: `POST {base}/chat/completions`, `authorization: Bearer <chave>`, `temperature 0.2`,
  `response_format json_object` (`ai-assistant-provider.ts:151-170`). Qualquer HTTP não-2xx vira
  `PROVIDER_HTTP_ERROR` com o status só na mensagem (`:171-176`).
- Semântica oficial de erro: `402` traz `error.metadata.limit_source ∈ {openrouter_key_limit,
  openrouter_credits, openrouter_in_flight_budget}` (`in_flight_budget` é transitório e vem com
  `Retry-After`); `429` = rate limit. **Criar outras contas/chaves não altera o rate limit**
  (capacidade governada globalmente).
- `GET https://openrouter.ai/api/v1/key` (com a própria chave de inferência) devolve `limit`,
  `limit_reset`, `limit_remaining`, `usage_daily`, `usage_weekly`, `usage_monthly` — permite ao
  gateway (a) detectar teto esgotado sem gastar uma chamada, (b) fazer *pacing* diário, (c)
  **recusar-se a operar se a chave estiver sem teto** (`limit: null`) — hoje nada disso existe.
- Consequência: esgotamento do cap é hoje indistinguível de qualquer erro do provedor para o
  cliente (F-121-02, F-121-03).

### 1.5 Cliente `[CÓDIGO]`

- `resolveAssistantEndpoint` (`ai-assistant-client.ts:52`): nativo → origem pública embutida;
  web → `/api/nutrition/assistant` same-origin. **Sem cabeçalho de autenticação** (`:105`).
- Mapeamento de falhas: não-JSON → `INVALID_RESPONSE`; rede/`TypeError` →
  `PROVIDER_UNAVAILABLE`; abort → `PROVIDER_TIMEOUT` (`:109-143`).
- **Armadilha de compatibilidade (F-121-04):** `isFailureResult` aceita **qualquer** string em
  `code` e `aiFailureToUiState` (`ai-assistant-types.ts:325`) é um `switch` **sem `default`**: um
  código novo devolve `undefined` como estado da UI (`AiMealAssistantModal.tsx:213-214`). Os builds
  já distribuídos (APK/AAB `versionCode 1` do GOAL-118) **não sabem tratar códigos novos**.
- O modal só chama o gateway com metas `AUTOMATED`; caso contrário nem tenta (D-NUT-08/09).

### 1.6 Identidade: o que existe de fato

| Conceito | Existe hoje? | O que é / onde vive | Sobrevive a reinstall · backup JSON · Auto Backup | Serve para autorizar? |
|---|---|---|---|---|
| **IDENTIDADE_LOCAL** | Sim, fraca | `UserProfile` (nome, e-mail, nível, `premiumStatus`…) **sem `id`**, criado por `registerUser`/`loginDemoUser` (`GymFlowContext.tsx:2165,2201`); `GymProfile.id` e ids de treino/sessão são dados de domínio. Persistido em `localStorage` `gymflow:state:v1` (legado) ou IndexedDB hybrid-v2 | reinstall: não · backup JSON v2: **sim** (`PersistedState.user`, `storage-types.ts:22`) · Auto Backup: sim | **Não** — editável pelo usuário; `premiumStatus` é flag local |
| **IDENTIDADE_SERVER** | **Não** | nenhuma sessão, cookie, JWT ou registro no servidor; gateway stateless | — | — |
| **DEVICE_ID** | **Não usado** | sem `@capacitor/device`, ANDROID_ID, IDFV ou advertising ID (`package.json:31-51`) | — | — |
| **INSTALLATION_ID** | **Não persistido** | só há ids **por operação/aba/geração** (`nut-owner-*`, `nut-op-*`, `operation-*`, `nut-admin-fence-*`, lease `admin-owner-token`, e `generation-*` = geração física do histórico de treino, **criada a cada nova geração** em `stageGeneration`, `storage-indexeddb.ts:1141`) — nenhum é estável nem identifica a instalação | — | **Não** |
| **USER_ACCOUNT** | **Não** | "Entrar/Cadastrar/Recuperar" são telas simuladas: `handleSubmit` chama `registerUser` sem rede (`AuthPages.tsx:16-24`); senha só precisa ser não vazia; e-mail não verificado; `logout` só limpa estado local (`GymFlowContext.tsx:2248`) | — | **Não** |

Não há chamada de rede de identidade em `src/`: os únicos `fetch` fora do Assistente são do
manifesto/CDN de mídia (`domain/media/manifest.ts:281`, `webStorage.ts:55`).

**Definições normativas para o alvo (nunca tratar um como outro):**

| Conceito | Quem emite | Confiança | Vida | Onde fica | Nunca usar como |
|---|---|---|---|---|---|
| IDENTIDADE_LOCAL | usuário (app) | nenhuma | dados do usuário | estado do app + backup JSON | credencial, quota, direito |
| INSTALLATION_ID | **servidor**, após atestação | alta (ligada a chave em hardware + atestado) | até reinstall/restore/limpeza/revogação | store do servidor + armazenamento **nativo seguro** (fora do WebView e do backup) | identidade de pessoa; dado exportável |
| DEVICE_ID (sync, GOAL-38) | cliente | nenhuma | do app | dados de sync | quota ou autorização (é gerado no cliente e viaja em backup/nuvem) |
| Sinais de dispositivo da plataforma (DeviceCheck bits, App Attest métrica, Play `deviceRecall`) | Apple/Google | alta | sobrevive a reinstall (por desenho da plataforma) | Apple/Google | rastreio/fingerprint (ToS do Play proíbe) |
| USER_ACCOUNT (GOAL-36, Supabase Auth) | provedor de identidade | alta | ciclo de vida da conta | Supabase (futuro) | pré-requisito do Assistente antes da Fase 8 |
| IDENTIDADE_SERVER | gateway | é a *sessão* (token opaco ↔ INSTALLATION_ID) | TTL curto | store do servidor | conta |

### 1.7 Ciclo de vida: instalação, reset, restore

| Evento | Hoje | Exigência para a identidade-alvo |
|---|---|---|
| 1ª execução | nenhum id é criado | enrollment sob demanda ao abrir o Assistente (não no boot) |
| Atualização do app | dados preservados | INSTALLATION_ID e chave preservados |
| Reinstall / limpar dados | dados locais somem (salvo Auto Backup/backup JSON) | chave Keystore some → **nova instalação**; iOS: chave App Attest invalidada (`[OFICIAL]`) |
| `logout` | legado: apaga `gymflow:state:v1`; hybrid-v2: preserva dados (`GymFlowContext.tsx:2248-2264`) | **não** revoga nem reseta instalação/quota |
| Reset lógico ("Resetar Dados") | apaga mundo lógico | **não** pode zerar quota (é estado do servidor) |
| Export/Import/Restore backup JSON v2 (`PersistedState` + ledger) | substitui o estado inteiro | o backup **não pode** conter identidade/sessão/quota; import/restore não altera a instalação. Teste de contrato obrigatório: `PersistedState` sem campos de auth |
| Auto Backup / device-to-device Android | `allowBackup="true"` sem `dataExtractionRules`/`fullBackupContent` (`AndroidManifest.xml:5`); o Auto Backup inclui shared prefs, `getFilesDir`, bancos (`[OFICIAL]`) | armazenar credenciais em `getNoBackupFilesDir()`/Keystore **e** excluir por `dataExtractionRules` (API 31+) + `fullBackupContent` (≤30); WebView `app_webview/` está no diretório de dados `[INFERÊNCIA]`, U-03 |
| Troca de aparelho / restore iOS | itens do Keychain podem migrar conforme a classe de acessibilidade (U-17); a chave App Attest **não** migra | detectar chave inválida → re-enroll com chave nova; não rejeitar a nova chave (`[OFICIAL]`, WWDC26) |

### 1.8 Capacitor, Android, iOS, build e release `[CÓDIGO]`

- Capacitor 7.6.x (`@capacitor/android|ios|core` ^7.6); plugins: app, file-transfer, filesystem,
  keyboard, share, splash-screen, status-bar. **Nenhum** plugin de armazenamento seguro, device
  ou atestação → o alvo exige **plugin nativo próprio** (Kotlin/Swift) ou plugin de terceiros
  auditado (dependência nova; U-09).
- Android: `applicationId com.gymflowai.app`, `versionCode 1`/`versionName 1.0`, `minSdk 23`,
  `target/compile 36`; permissão só `INTERNET`; `allowBackup="true"`; release assinado hoje pela
  chave **interna** (sideload); upload key/Play App Signing/Internal Testing = gates humanos
  abertos (GOAL-117). `minSdk 23` satisfaz Play Integrity (API 23+) e Keystore EC.
- iOS: `PRODUCT_BUNDLE_IDENTIFIER com.gymflowai.app`, deployment target 14.0 (= mínimo do App
  Attest), **sem** arquivo de entitlements e **sem** `DEVELOPMENT_TEAM`; `PrivacyInfo.xcprivacy`
  com `NSPrivacyCollectedDataTypes` vazio e `NSPrivacyTracking=false` (defasado desde o GOAL-118).
- WebView carrega `out/` em `https://localhost` (Android) / `capacitor://localhost` (iOS)
  (`capacitor.config.ts:26-29`); depuração do WebView desligada (`:17`).
- CI (`.github/workflows`), em todo PR para `master`: Android readiness (Ubuntu — TypeScript, *secret
  audit* NUT-008, testes do ferramental Play, `build:mobile`, APK/AAB sem segredos) e iOS
  runtime/distribution (macOS 26). O *secret audit* (`nut008-secrets.test.ts`) varre `src/`, `docs/` e
  `scripts/` atrás de valores de chave e de `NEXT_PUBLIC_*KEY/SECRET/TOKEN`, e a auditoria de release
  varre arquivos versionados atrás de literais de credencial de assinatura (`SIGNING_SECRET_NAMES`):
  **este documento evita ambos os padrões**. `npm test` completo e `npm run build` (web) são gates
  locais do `CLAUDE.md`.

### 1.9 Dependências e estado/auth de servidor existentes

Nenhuma dependência de auth, banco, KV, storage ou SDK de nuvem (`package.json`). Nenhum
storage/auth de servidor existe além da chave do provedor e da regra do Firewall. Vercel: plano
**Hobby** (time `rafaelfaria49-4373s-projects`), projeto `gymflow`, função em `iad1`.

### 1.10 Achados desta auditoria

| ID | Sev. | Achado |
|---|---|---|
| F-121-01 | P1 | Gateway anônimo: requisição sem `Origin` alcança o pipeline (`[PROD]` 400 por validação; sem token/quota/identidade). Reconfirma o F1 do GOAL-118 |
| F-121-02 | P1 (processo) | O cap de US$ 5 é config externa não versionada: **rotacionar a chave sem reaplicar o teto = gasto ilimitado**; o gateway não checa `limit` via `GET /api/v1/key` |
| F-121-03 | P2 | 429 do Firewall é opaco ao app nativo (sem ACAO/`Retry-After`, envelope diferente) → UI diz "inalcançável" (`[PROD]` cabeçalhos; WebView `[INFERÊNCIA]`) |
| F-121-04 | P2 | Código de falha novo → `undefined` na UI dos builds já distribuídos (switch sem default) → regra de compat obrigatória (Seção 11) |
| F-121-05 | P2 | Preflight só aceita `Content-Type`; `Authorization` → 403 (`[PROD]`) → mudança de CORS na R1 |
| F-121-06 | P2 | `allowBackup="true"` sem regras de extração: identidade guardada no diretório de dados do app pode ser clonada |
| F-121-07 | P1 se ficar aberto | Canal web same-origin não é atestável e continua anônimo após enforcement nativo → decisão D-AUTH-03 |
| F-121-08 | P2 | "Login"/`premiumStatus` são locais e forjáveis; nada do estado atual serve de identidade |
| F-121-09 | P3 | Hobby: logs de runtime de **1 h** (sem forense retroativa), uso **não comercial**, 1 regra de RL e sem chave por cabeçalho |
| F-121-10 | P2 | Warm-up do Play Integrity *standard* conta na cota diária de 10.000 → proibido aquecer a cada abertura do app |
| F-121-11 | P3 | ToS do Play Integrity proíbe fingerprint/rastreio de dispositivos/usuários → uso restrito a abuse prevention |
| F-121-12 | P2 | Privacy Manifest/Data Safety já defasados (D-NUT-09 `PENDING`) e ficam mais com `installation_id` |
| F-121-13 | P2 | Sem plugin de secure storage/atestação: dependência nativa nova (código + supply chain) |
| F-121-14 | P3 | iOS: sem Apple Developer Team, sem entitlement; App Attest/DeviceCheck só depois |
| F-121-15 | P2 | Novos endpoints `/api/ai/v1/*` ficam fora da única regra de RL do Hobby |

---

## 2. Governança

### 2.1 O que a governança vigente proíbe `[CÓDIGO]`

- `CLAUDE.md` (regras técnicas permanentes): **"Não implementar backend. Não implementar
  Supabase. Não implementar pagamento real."** E: "Problema fora do escopo: não corrija; anote em
  `docs/PENDENCIAS.md`".
- Roadmap aprovado (`docs/personal/README.md`, `FASE_8_ROADMAP_GOALS.md`, `docs/DECISOES.md`
  GOAL-35): **Gate G4** — D17 aprovou **Supabase** (Postgres + Auth + RLS + Storage) como backend
  da Fase 8 e diz que "nenhum código dos GOALs da Fase 8 deve ser antecipado na Fase 7; cada GOAL
  terá plano e gate de aprovação explícito do Founder". GOAL-36 (Supabase Auth: e-mail+OTP,
  Google OAuth, Apple Sign-In) **preserva o convidado offline**; GOAL-39 traz billing.
- Interpretação praticada até aqui: a rota `/api/nutrition/assistant` (NUT-007) é tolerada como
  *gateway* pré-existente, mas **qualquer estado, identidade, token ou banco no servidor é
  "backend"** e está vedado (D118-008: "correção real exige backend (fora das regras
  permanentes)"; `docs/PENDENCIAS.md`, item do gateway sem auth/quota).

**Este GOAL não edita a regra permanente.** Registra a necessidade e propõe o texto (Apêndice D).

### 2.2 Mudança de governança necessária antes de qualquer implementação server-side

Um ato **humano** (Founder) com quatro partes, todas pré-requisito do primeiro GOAL de
implementação:

1. **Emenda escrita ao `CLAUDE.md`** com uma **exceção nominal e estreita ("AI-Guard")** — sem ela,
   qualquer GOAL de implementação violaria a regra permanente. Texto proposto no Apêndice D.
2. **Registro da decisão** em `docs/DECISOES.md` (D-AUTH-01..08, Seção 14).
3. **Autorização por item de custo/conta** (Seção 13) — este documento não autoriza nada.
4. **Atualização de D-NUT-09 / Data Safety / App Privacy** antes de expor a fase R1 a testers fora
   do time (Seção 10).

Opções de governança, com a recomendação:

| | O que autoriza | Prós | Contras |
|---|---|---|---|
| **G-A — exceção "AI-Guard" (recomendada)** | só o subsistema de abuse prevention do Assistente: atestação, sessão opaca, quota, estado efêmero em store nomeado; sem contas, sem Supabase, sem dado de saúde no servidor | mínimo necessário; **compatível com D17** (Supabase segue como backend de contas/dados; `GuardStore` permite consolidar em Postgres no GOAL-36); não abre o Gate G4 | segundo fornecedor (Redis) até a Fase 8 |
| G-B — abrir Fase 8/GOAL-36 primeiro (Supabase Auth como identidade do Assistente = opção C) | Supabase, contas, OTP/OAuth | identidade forte e entitlements multi-dispositivo | abre o Gate G4 inteiro; free tier do Supabase pausa após 1 semana sem uso e não tem backups `[OFICIAL]` (Pro US$ 25/mês); exige login para IA (ou um caminho de convidado que **precisa** de instalação atestada de qualquer forma); adia a proteção |
| G-C — manter a proibição | nada | zero mudança | o P1 permanece com as contenções do GOAL-120 (cap + IP), sem identidade nem quota |

`[INFERÊNCIA]` Mesmo com G-B o convidado offline (princípio do roadmap) precisaria de uma
identidade de instalação atestada; logo a arquitetura recomendada (Seção 6) é a **camada-base**
de qualquer caminho, e a conta entra por cima.

---

## 3. Modelo de ameaças

### 3.1 Escala

| Nível | Definição |
|---|---|
| **P0** | dano crítico plausível **sem contenção ativa**: gasto ilimitado, vazamento de segredo ou dado de saúde, bypass total e silencioso da proteção |
| **P1** | dano alto e plausível, contenção só parcial do *efeito* (esgotar o teto mensal, Assistente indisponível para todos, bypass barato) |
| **P2** | dano moderado ou plausibilidade baixa/exige aparelho real; efeito limitado a uma identidade, aparelho ou dia |
| **P3** | dano baixo, aceito e monitorado |

"Atual" = base `ebcc786` com cap + Firewall. "Residual" = depois de R0–R4 implementadas como
descrito. Nenhuma linha atual é P0 **porque o cap de US$ 5/mês está ativo** (F-121-02 mostra a
fragilidade desse fato).

### 3.2 As 15 ameaças pedidas + 9 adicionais

| ID | Ameaça | Atual | Controle-alvo (fase) | Residual |
|---|---|---|---|---|
| T01 | **Chamada direta por curl/bot** (sem `Origin`) | **P1** — alcança o pipeline (`[PROD]`); cap+Firewall só contêm o dano | token de sessão obrigatório (R2) + quota por instalação (R3); cada unidade de quota exige uma instalação atestada | **P2** |
| T02 | **Reutilização do bundle** (origem Production pública no APK/`out/`) | **P1** (mesmo caminho de T01); **sem segredo a extrair** — `SECRET_EXPOSURE=NO` | não existe segredo estático no cliente; a credencial é chave em hardware + atestado do servidor | **P3** |
| T03 | **Spoof de `Origin`** | **P1** (ausente/forjado passam; CORS é do navegador) | `Origin` vira só defesa em profundidade contra páginas de navegador; nunca decide acesso | **P3** |
| T04 | **Replay de token** | n/a | token opaco de TTL curto; challenge single-use; contador de assertion (iOS); prova de posse no refresh; revogação instantânea (R1/R2) | **P3** |
| T05 | **Roubo de token** do aparelho | n/a | armazenamento **nativo** (Keystore/Keychain), fora do WebView e do backup; TTL curto; quota por instalação limita o estrago | **P3** (exige root/jailbreak, que reprova a atestação no refresh seguinte) |
| T06 | **Instalação clonada** (Auto Backup/D2D, `adb`, cópia de dados) | n/a (não há identidade) | chave **não exportável** + exclusão de backup + prova de posse no refresh; clone sem a chave não renova | **P2** |
| T07 | **Emulador / root** | **P1** (sem verificação) | Play `MEETS_DEVICE_INTEGRITY` (default) / App Attest; falha → `ATTESTATION_*` honesto (R2) | **P2** — há relatos de módulos que forjam o veredito em aparelhos com root `[NÃO VERIFICADO — U-16]`; a doc oficial manda planejar para chaves de atestação revogadas `[OFICIAL]` → tiers `STRONG`, `recentDeviceActivity`, alertas (R4) |
| T08 | **Abuso distribuído** (frota de aparelhos reais/botnet) | **P1** | quota por instalação + **pacing diário** do orçamento global + limite de enrollments + sinais de plataforma (R3/R4) | **P2** — limitado à fatia diária, não ao mês |
| T09 | **Consumo por usuário legítimo** | — | quota diária/mensal por instalação; `QUOTA_EXCEEDED` honesto com horário de renovação (R3) | **P3** |
| T10 | **Perda/reinstalação/troca de aparelho** | dados locais somem (backup JSON é ortogonal) | novo enrollment; nada local depende do servidor | **P3** (UX); farming por reinstall = T14 |
| T11 | **Import/restore de backup** | o backup v2 não contém identidade (`PersistedState`) | **invariante testada**: sem campos de auth/sessão/quota no estado/backup; import/restore/reset não tocam a instalação | **P3** |
| T12 | **Indisponibilidade Apple/Google** | — | token válido continua; **refresh por prova de posse** (sem Google/Apple) até `ATTEST_MAX_AGE`; enrollment novo → `ATTESTATION_UNAVAILABLE`; treino/nutrição locais intactos | **P3** |
| T13 | **Usuário offline** | IA já indisponível (honesto) | nunca tentar atestação offline; `BACKEND_OFFLINE` sem bloquear o app | **P3** |
| T14 | **Reset de quota** (reinstall, limpar dados, novo enrollment) | n/a | memória de dispositivo **delegada às plataformas** (DeviceCheck 2 bits, App Attest métrica, Play `deviceRecall` beta) + limite de enrollments por IP-hash e por janela (R4) | **P2** |
| T15 | **Relógio do cliente adulterado** | — | janelas e expirações **só pelo relógio do servidor** (UTC); o cliente só agenda o refresh | **P3** |
| T16 | **DoS de challenge/enrollment** (queimar a cota Google de 10.000 decodes/dia e comandos do Redis) | n/a | challenge **stateless** (HMAC, sem escrita); ledger de uso só após sucesso; limites por IP (Firewall + função); refresh por prova de posse **não consome cota Google**; alerta de cota | **P2** |
| T17 | **Vazamento de segredos do gateway** (token REST do Redis, credencial Google, chave de challenge) | só `GYMFLOW_AI_API_KEY` | segredos *Sensitive*, escopo Production, federação OIDC→WIF em vez de chave JSON, rotação documentada, DB de Preview separado; **com escrita no Redis o atacante forja sessões** | **P2** |
| T18 | **Vazamento de privacidade** (IP, installation_id, corpo em log/estado) | logs da plataforma (1 h no Hobby) | nunca logar corpo; IP só como hash rotativo; nada de saúde no store; retenção mínima (Seção 10) | **P3** |
| T19 | **Indisponibilidade/latência do store** | — | *fail-closed* só do Assistente (nunca do app); `BACKEND_OFFLINE`; modos `observe/shadow` falham aberto | **P3** |
| T20 | **Rollout quebra testers e builds internos** | — | fases R1→R4, modo `shadow`, kill-switch instantâneo, regra de compat para builds antigos (F-121-04), canal `internal` com sunset | **P2** |
| T21 | **Canal web permanece anônimo** | **P1** se ficar aberto (F-121-07) | D-AUTH-03: padrão **W1** (desligar o Assistente na web Production ao entrar em enforcement) | **P3** com W1 · **P2** com W2 |
| T22 | **Farming de instalações a partir de 1 aparelho genuíno** (enroll em loop) | n/a | Play `recentDeviceActivity`, App Attest métrica/DeviceCheck bits, limite de enrollments por IP-hash, pacing | **P2** |
| T23 | **Broker de atestação** (aparelho genuíno atestando em nome de terceiros) | n/a | `requestHash` liga token ↔ (challenge, chave pública, propósito); `recentDeviceActivity`; métrica de fraude Apple; **Key Attestation** como endurecimento opcional (Seção 4.5) | **P2** |
| T24 | **Chave OpenRouter rotacionada sem cap / cap removido** | **P1** (processo, F-121-02) | `CAP_GUARD`: gateway lê `GET /api/v1/key` e **recusa operar** se `limit` for `null` ou acima do máximo configurado; runbook de rotação | **P3** |

Leitura honesta do resultado: **nenhuma ameaça vai a "resolvida"**; o que o desenho faz é trocar
"acesso grátis e anônimo" por "acesso que custa um aparelho físico atestado por unidade de
quota", com o dano diário limitado por pacing e o mensal pelo cap.

---

## 4. Android — Play Integrity

Fontes: só documentação oficial Google (Android Developers, Play Console Help, Firebase para a
tabela de canais). Datas e URLs no Apêndice A; tags entre colchetes = página consultada.

### 4.1 Fatos oficiais `[OFICIAL]`

| Tema | O que a documentação diz |
|---|---|
| Serviço | Play Integrity API; verifica "app genuíno, instalado pelo Google Play, em aparelho Android genuíno e certificado". Biblioteca `com.google.android.play:integrity:1.6.0` `[PI-setup]` |
| Credenciais | **Projeto Google Cloud é obrigatório** (habilitar a API); linkar no Play Console (*Protected with Play → Play Integrity API → Link Cloud project*) é necessário para opções adicionais, testes, relatórios e aumento de cota; até 5 projetos por app `[PI-setup][PC-help]`. O app precisa existir no Play Console para linkar |
| Vínculo com o package | o veredito traz `requestDetails.requestPackageName` (**"pode ser forjado no meio da requisição"**), `appIntegrity.packageName`, `certificateSha256Digest[]`, `versionCode` — os três últimos só quando `appRecognitionVerdict != UNEVALUATED` `[PI-verdicts]`. Package alvo: `com.gymflowai.app` |
| Standard × classic | ambos exigem Play Store + Play services e Android 6.0 (API 23)+. **Standard**: *warm-up* obrigatório (5/min por instância), latência ~centenas de ms, uso frequente, replay mitigado **automaticamente** pelo Google, decrypt **só** nos servidores Google. **Classic**: sem warm-up, latência de segundos, uso raro (5 tokens/min por instância), replay via `nonce` + lógica do servidor, decrypt no Google **ou local** (chaves gerenciadas por você) `[PI-classic]` |
| Content binding | standard: `requestHash` ≤ 500 bytes, digest (ex. SHA-256) dos parâmetros relevantes; **nunca dado sensível em claro** (fica visível ao app e ao Google); o servidor recomputa e compara. Classic: `nonce` Base64 URL-safe sem wrap, 16–500 caracteres, ≥ 128 bits recomendado; combinar valor único + hash `[PI-standard][PI-classic]` |
| Replay | standard "automaticamente protegido": decifrar o mesmo token de novo devolve vereditos vazios/`UNEVALUATED` `[PI-standard]`. Não cachear vereditos (risco de *proxying*) `[PI-overview]` |
| Decrypt | `POST https://playintegrity.googleapis.com/v1/PACKAGE_NAME:decodeIntegrityToken` com conta de serviço do projeto linkado, escopo `playintegrity` `[PI-standard]`; o servidor deve checar `requestPackageName`, `requestHash`/`nonce` e a **frescura** via `timestampMillis` `[PI-verdicts]` |
| Vereditos **default** | `accountDetails.appLicensingVerdict` (`LICENSED`/`UNLICENSED`/`UNEVALUATED`), `appIntegrity.appRecognitionVerdict` (`PLAY_RECOGNIZED`/`UNRECOGNIZED_VERSION`/`UNEVALUATED`), `deviceIntegrity.deviceRecognitionVerdict` (`MEETS_DEVICE_INTEGRITY` ou vazio: root/hooking/emulador sem integridade Play) `[PI-verdicts]` |
| Vereditos **opt-in** (só com projeto linkado) | `MEETS_BASIC_INTEGRITY`, `MEETS_STRONG_INTEGRITY` (patch de segurança recente), `deviceAttributes.sdkVersion`, `recentDeviceActivity` (LEVEL_1..4 = nº de tokens/h no aparelho), `deviceRecall` (**beta**, 3 bits por aparelho que sobrevivem a reinstall/reset), `appAccessRiskVerdict` (apps que capturam tela/sobrepõem/controlam o aparelho), `playProtectVerdict`. Mudança de respostas vale **imediatamente**, inclusive em produção `[PI-verdicts][PI-setup][PC-help]` |
| Cotas | **10.000 requisições/dia por projeto**: "token requests" (compartilhado entre classic e **preparações/warm-ups do standard**) e **10.000 decryptions** nos servidores Google (compartilhado); aumento só se o app estiver **publicado no Google Play** + projeto linkado + formulário (até 1 semana); rampa gradual `[PI-setup]` |
| Custo | as páginas consultadas **não declaram preço por chamada**; `deviceRecall` beta: "pricing for high-scale usage may apply after general release" `[PI-setup]` (U-02) |
| ToS | **proíbe usar a API para fingerprint/rastrear usuários ou dispositivos**; Google pode reduzir cota se o app deixar de cumprir critérios `[PI-terms]` |
| Erros | retryáveis (`NETWORK_ERROR`, `TOO_MANY_REQUESTS`, `GOOGLE_SERVER_UNAVAILABLE`, `CLIENT_TRANSIENT_ERROR`, `INTERNAL_ERROR`, falha de inicialização): backoff 5 s/10 s/20 s; **após 3 tentativas tratar como falha de integridade**. Não retryáveis: `API_NOT_AVAILABLE`, `PLAY_STORE_NOT_FOUND`, `PLAY_SERVICES_NOT_FOUND`, `APP_NOT_INSTALLED`… A API já aceita requisições sem conta Play autenticada `[PI-errors]` |
| Outage/revogação | "planeje como o backend funciona num outage da API" e "quando chaves de atestação específicas de aparelhos forem revogadas" `[PI-overview]` |
| Teste | publicar na faixa de teste interno + lista de testers; *Protected with Play → Play Integrity → Testing* simula vereditos e erros (`testingDetails` no payload) `[PC-help]` |
| Conta Play | taxa única **US$ 25**, verificação de identidade; contas pessoais novas têm requisitos de teste e de verificação de dispositivo `[GP-signup]` |
| Canais (Firebase) | apps **não publicados no Play não recebem** `PLAY_RECOGNIZED`; `LICENSED` só para quem instalou/atualizou pelo Play; tabela recomendada: *só Play* → exigir ambos; *fora do Play* → não exigir; *ambos* → exigir integridade de dispositivo, não exigir `LICENSED` `[FB-provider]` |

### 4.2 Plano V1 (Android)

**Decisões:** requisições **standard** com `requestHash`; decrypt no Google (gerenciado por ele);
**atestar só no enrollment e na reatestação**, nunca por chamada do Assistente; *warm-up* **lazy**
(ao abrir o Assistente ou ao precisar renovar, jamais no boot — F-121-10); nenhum uso de
`deviceRecall`/vereditos para fingerprint (F-121-11).

```
Enrollment (1× por instalação; repete após reinstall/restore/limpeza)
 app/plugin                                   gateway (AI-Guard)                       Google
  ├ gera chave EC P-256 no Keystore (não exportável; StrongBox se houver)
  ├ POST /challenge {purpose:enroll} ───────► challenge = HMAC-assinado, TTL 5 min, sem escrita
  ├ prepareIntegrityToken(cloudProjectNumber) (lazy)
  ├ requestHash = SHA-256("gf-enroll-v1" ‖ challenge ‖ SPKI ‖ packageName ‖ versionCode)
  ├ standardIntegrityToken.request(requestHash)
  └ POST /enroll {challenge, integrityToken, SPKI, versionCode} ─►
       valida HMAC/TTL/uso único do challenge ──► decodeIntegrityToken ──────────────► (decrypt)
       confere requestPackageName + appIntegrity.packageName, requestHash, frescura, veredito
       cria installation_id + registro; emite token opaco ◄──── {installationId, token, expiresAt}

Refresh (sempre que o token expira)
  ├ POST /challenge {purpose:refresh, installationId}
  ├ assina (challenge ‖ installationId) com a chave da instalação (prova de posse)
  └ POST /token {installationId, challenge, popSignature [, integrityToken se now−last_attested > ATTEST_MAX_AGE]}
```

**Política de veredito V1** (canal `play`; a Seção 12 define `internal`):

| Campo | Exigência | Falha → |
|---|---|---|
| `requestPackageName` e `appIntegrity.packageName` | `== com.gymflowai.app` (os dois: o primeiro pode ser forjado) | `ATTESTATION_FAILED` |
| `requestHash` | igual ao recomputado no servidor (challenge + SPKI + propósito) | `ATTESTATION_FAILED` |
| `timestampMillis` | frescor ≤ janela curta (proposta técnica: 120 s) | `ATTESTATION_FAILED` |
| `appRecognitionVerdict` | `PLAY_RECOGNIZED` e `certificateSha256Digest` ∈ allowlist (esperado: **assinatura de app do Play**, não a upload key — confirmar em R1, U-01) e `versionCode` ≥ mínimo **e igual ao declarado no corpo** (que entra no `requestHash`) | `ATTESTATION_FAILED` |
| `appLicensingVerdict` | `LICENSED` | `ATTESTATION_FAILED` (remediação `GET_LICENSED`) |
| `deviceRecognitionVerdict` | contém `MEETS_DEVICE_INTEGRITY` | `ATTESTATION_FAILED` (remediação `GET_INTEGRITY`) |
| opt-in (R4) | `MEETS_STRONG_INTEGRITY` → quota cheia; `recentDeviceActivity` alto → limitar enrollment; `appAccessRiskVerdict` controlador → tier reduzido | tiers, não bloqueio |
| erro da API no app | retry 5/10/20 s; 3 falhas → `ATTESTATION_UNAVAILABLE`/`FAILED` (Seção 11) | — |

**O que a implementação nunca faz:** atestar por chamada; cachear veredito; pôr dado do usuário no
`requestHash` (só hash de valores do protocolo); confiar só em `requestPackageName`; aquecer no
boot; usar o veredito como identificador de aparelho.

### 4.3 Comportamento antes de o app estar distribuído pelo Play

| Situação | O que esperar `[OFICIAL]`/`[INFERÊNCIA]` | Política |
|---|---|---|
| APK/AAB **sideload** assinado pela chave interna (estado atual) | não é versão distribuída pelo Play → `appRecognitionVerdict` ≠ `PLAY_RECOGNIZED` (`UNRECOGNIZED_VERSION`/`UNEVALUATED`) e `appLicensingVerdict` ≠ `LICENSED`; o digest só vem se ≠ `UNEVALUATED` (U-01) | **R1 (observe)**: aceitar e registrar; **R2+**: só via canal `internal` (allowlist do digest da chave interna, quota reduzida, `internal_until`) — se o digest não vier, **códigos de tester** de uso único emitidos pelo dono (HMAC) |
| Instalado do Play (Internal Testing, Play App Signing) | elegível a `PLAY_RECOGNIZED`/`LICENSED`; testável no Console | canal `play` completo |
| Produção no Play | cota aumentável; digest = assinatura de app do Play | canal `play`; `internal` removido |

### 4.4 Limites, cota e custo (Android)

Consumo por desenho: **1 decode + 1 token por enrollment ou reatestação** (não por chamada);
com `ATTEST_MAX_AGE` de 24 h, ≤ 1 decode/instalação/dia ativo → a cota padrão de 10.000
decodes/dia comporta da ordem de 10.000 instalações ativas/dia `[INFERÊNCIA]` antes de precisar
do aumento (que exige o app publicado no Play). Warm-ups também contam na cota de tokens →
lazy. Custo monetário: nenhum declarado nas páginas consultadas (U-02). Alertas de cota no Cloud
Console são recomendados pela própria doc.

### 4.5 Endurecimento opcional: Android Key Attestation

O Play Integrity **não entrega chave por instalação**: a chave do app (Keystore) é gerada pelo
próprio app e o veredito só prova "app+aparelho genuínos agora". **Key Attestation** (cadeia com
raiz *Google Hardware Attestation*, lista JSON oficial; uma **nova raiz passa a assinar cadeias
em 1º/fev/2026**) prova que a chave está em hardware **no mesmo aparelho** e traz package/digest do
app na extensão — fecha T23 e funciona para builds fora do Play `[AK-attest]`. Custos: parse
ASN.1 próprio, atualização periódica das raízes, não substitui `LICENSED/PLAY_RECOGNIZED`.
**Fora da V1; candidato a R4.**

### 4.6 Não verificado (Android)

U-01 (vereditos/digest para build interno e para Internal Testing com Play App Signing) ·
U-02 (billing/preço no projeto Cloud) · U-03 (Auto Backup incluir `app_webview/`) — todos
observáveis em R1, antes de qualquer enforcement.

---

## 5. iOS — App Attest / DeviceCheck

Fontes: só documentação oficial Apple (DocC `developer.apple.com/documentation/devicecheck`,
sessão WWDC26 201, App Privacy Details). Datas/URLs no Apêndice A.

### 5.1 Fatos oficiais `[OFICIAL]`

| Tema | O que a documentação diz |
|---|---|
| Pré-requisitos | o app precisa de um **App ID registrado** no portal (Apple Developer Program, **US$ 99/ano** `[AB-programs]`); capability *App Attest* adiciona o entitlement `com.apple.developer.devicecheck.appattest-environment` (`development`/`production`); sem ele em dev → sandbox; **TestFlight/App Store/Enterprise usam sempre produção** |
| Disponibilidade | `DCAppAttestService` iOS/iPadOS **14.0+**; checar `isSupported` antes; **`false` em Mac** (Catalyst e apps iOS em Apple silicon) e na maioria das extensões; no **Simulator `false`** (fórum Apple, não documentação — U-05); tratar `false` inesperado como sinal de fraude |
| Chave | `generateKey` cria par no **Secure Enclave** e devolve `keyId`; **persistir o `keyId` (não há como recuperá-lo depois)**; uma chave por usuário por aparelho (ou **uma por app** quando não há contas); **não compartilhar chave entre usuários**; guardar no Keychain (WWDC26); **a chave não sobrevive a reinstall, migração de dispositivo ou restore, inclusive backup do iCloud**; não sincroniza entre aparelhos |
| Atestação | challenge **único, aleatório, ≥ 16 bytes**, SHA-256 → `clientDataHash`; `attestKey(keyId, clientDataHash)` fala com servidor Apple; `serverUnavailable` → repetir **com a mesma chave**; qualquer outro erro → **descartar o keyId** e gerar novo; o **servidor** deve controlar a iniciação (taxa), atestar fora do fluxo do usuário, e validar sempre no servidor |
| Validação no servidor | cadeia `x5c` até a raiz *Apple App Attestation*; `nonce = SHA256(authData ‖ clientDataHash)` = extensão OID `1.2.840.113635.100.8.2`; `keyId = SHA256(pubkey)`; RP ID = `SHA256("<TeamID>.<bundleID>")`; `counter == 0`; `aaguid` = `appattestdevelop` (dev) ou `appattest`+7×`0x00` (prod); `credentialId == keyId`; `apple_validation_category_01` (2 = TestFlight, 3 = assinatura de desenvolvimento, 4 = App Store, 5 = Enterprise/ad hoc…) e `apple_bundle_version_01`; **guardar chave pública e receipt**; garantir que a chave não esteja associada a outro usuário. O **guia oficial de validação traz vetor de teste** (keyId + attestation de exemplo + resultados intermediários) → verificador testável offline |
| Assertion | servidor entrega novo challenge; app monta `clientData` (ação + challenge) → `clientDataHash` → `generateAssertion`; servidor valida assinatura com a chave pública guardada, RP ID, **`counter` estritamente maior que o último** (>0 na 1ª), challenge, categoria e `bundleVersion`; **sem limite de assertions**, geradas localmente (**sem round-trip Apple**), custo de CPU |
| Ambientes | sandbox e produção são separados (`aaguid`, e `data-development.appattest.apple.com` × `data.appattest.apple.com` para receipts); **chave/receipt de um ambiente não vale no outro** |
| Limites | `attestKey`: **< 100 requisições/s no total** do app; rampa ≤ 10 milhões de usuários/dia/app; backoff exponencial; Apple pode limitar |
| Métrica de fraude | receipt (da atestação) → `POST https://data.appattest.apple.com/v1/attestationData` com JWT ES256 (chave com **DeviceCheck habilitado**, mesmo procedimento do APNs) → contagem **aproximada de chaves atestadas do aparelho nos últimos 30 dias**; reinstall/restore aumentam; **não bloquear usuário só por ela** |
| DeviceCheck | `DCDevice` (iOS 11+) → token → servidor Apple `query_two_bits`/`update_two_bits`/`validate_device_token` (JWT ES256; `api.devicecheck.apple.com`): **2 bits por aparelho** guardados pela Apple (sobrevivem a reinstall do app); o significado e o reset são do desenvolvedor |
| WWDC26 (iOS 27) | novas extensões no *authenticator data*: **launch validation category** e **bundle version**; macOS 27 suportado; boas práticas: degradar com elegância, **não invalidar chaves antigas de imediato**, não bloquear sem avaliação de risco |
| Privacidade (Apple) | "coletar" = transmitir para fora do aparelho de forma que você/terceiros acessem por mais tempo que o necessário para atender a requisição em tempo real; **Device ID** = "outro ID de nível de dispositivo"; finalidade *App Functionality* inclui "prevenir fraude, implementar segurança" `[AB-privacy]` |

### 5.2 Plano V1 (iOS)

```
Enrollment                                       gateway
 ├ isSupported? (senão → ATTESTATION_UNAVAILABLE)
 ├ generateKey → keyId → Keychain (classe "ThisDeviceOnly" a confirmar, U-17)
 ├ POST /challenge {purpose:enroll} ─────────────► challenge assinado (HMAC), TTL 5 min
 ├ attestKey(keyId, SHA256(challenge))
 └ POST /enroll {challenge, keyId, attestation} ─► verifica cadeia/nonce/RP ID/counter=0/aaguid/
        categoria/bundleVersion → guarda pubkey+receipt+counter → installation_id + token opaco
Refresh (sempre)
 ├ POST /challenge {purpose:refresh, installationId}
 ├ generateAssertion(keyId, SHA256(clientData{purpose,installationId,challenge}))
 └ POST /token {installationId, clientData, assertion} ─► assinatura, RP ID, counter (CAS atômico),
        challenge → novo token (o assertion É a prova de posse + integridade, sem chamar Apple)
```

Política: produção aceita categoria **4** (App Store) e **2** (TestFlight) com `aaguid` de
produção; categoria **3** e `aaguid` de dev só em servidor/ambiente de desenvolvimento;
`bundleVersion` ≥ mínimo; `counter` avançado com *compare-and-set* atômico e refresh
serializado no plugin (evita inversão por concorrência). Chave inválida/perdida → **re-enroll
com chave nova** e **sem rejeitar** a nova chave (Apple); regressão de `counter` → revogar aquela
instalação e exigir novo enrollment (sinal de cópia).

### 5.3 Simulator e desenvolvimento

`isSupported=false` no Simulator (U-05) → o app cai em `ATTESTATION_UNAVAILABLE`. Caminho de dev:
modo `off/observe` no servidor e *debug enrollment* **apenas em ambientes não-Production**
(segredo só no ambiente de dev; nunca em bundle de release). Sandbox é o padrão sem entitlement;
builds via TestFlight/App Store ignoram o entitlement e usam produção.

### 5.4 Estado exigido no servidor (iOS)

Por instalação: `key_id`, chave pública, `counter`, `receipt` (e o renovado), `env`
(sandbox/prod), `bundle_version`, `validation_category`, `last_attested_at`; índice
`pubkey → installation_id`. DeviceCheck (2 bits) e a métrica de fraude ficam **nos servidores da
Apple** — memória de dispositivo que sobrevive a reinstall sem nós guardarmos PII.

### 5.5 DeviceCheck como fallback?

DeviceCheck sozinho prova "token de aparelho Apple autêntico do time", **sem** integridade do app
e **sem** chave/prova de posse. Decisão V1: **não usar DeviceCheck como substituto de
autenticação**; `isSupported=false` → `ATTESTATION_UNAVAILABLE` (fail-closed só para o
Assistente; D-AUTH-05). DeviceCheck fica como **sinal opcional anti-reinstall** (R4): por exemplo
um bit "este aparelho já consumiu a quota gratuita do mês M", com o mês tirado de
`last_update_time` (`YYYY-MM`); o servidor decide quando resetar.

### 5.6 Não verificado (iOS)

U-05 (Simulator só por fórum) · U-11 (download único da chave `.p8` do DeviceCheck — não consta nas
páginas consultadas) · a criação de App ID/capability/chave **não foi feita** (gate humano).

---

## 6. Arquiteturas comparadas e recomendação

- **A — só atestação, por chamada** (token Play/assertion em toda requisição, sem sessão).
- **B — instalação atestada + sessão emitida pelo servidor** (recomendada).
- **C — usuário autenticado (Supabase Auth, GOAL-36) + atestação de dispositivo.**
- **D — Firebase App Check como *broker* de atestação** + instalação/quota próprias.

| Critério | A | **B** | C | D |
|---|---|---|---|---|
| **Segurança** | frescor máximo por chamada, mas **Android não tem identidade estável** (o Play Integrity não dá chave por instalação) → quota por instalação impossível; sem revogação granular | identidade = chave em hardware + atestado do servidor; sessão curta e revogável; quota por instalação; simétrico Android/iOS. Fracos: farming por reinstall/aparelhos reais e veredito forjado (mitigados, T07/T14/T22) | a mais forte **se** houver atestação; conta sem atestação é barata de forjar (signup farming). Quota por conta sobrevive a reinstall | mesma base de atestação, **gerenciada**; o token é do **app** (`sub` = App ID), **não identifica instalação/usuário**; sem `deviceRecall`/`recentDeviceActivity`/receipt; replay protection é beta (só Node Admin SDK, +1 round-trip) |
| **Custo** | 1 decode Google por chamada: a cota de **10.000 decryptions/dia** vira o teto de chamadas de IA do app inteiro | sem preço declarado para Play/Apple; Redis no free tier; contas Play (US$ 25) e Apple (US$ 99/ano) já são necessárias para distribuir; Vercel Pro (US$ 20/mês) se comercial | Supabase Pro US$ 25/mês (free pausa em 1 semana, sem backups) + Apple Developer para Sign-In + provedor de OTP | App Check "sem custo, sujeito a cotas do provedor de atestação"; projeto Firebase; ainda paga o store da quota |
| **Complexidade** | baixa no servidor, mas plugin em toda requisição | **média-alta**: plugin nativo (Kotlin+Swift), verificador App Attest (CBOR/X.509), decode Play, store, 4 endpoints, telemetria | **muito alta**: Auth, OTP/OAuth, recuperação, exclusão de conta (políticas das lojas), LGPD, RLS | média: sem verificador próprio, mas SDKs Firebase no app (BoM/pods), plugin de terceiros, **e** ainda instalação+store+quota |
| **Offline** | pior: toda chamada exige Play/Apple online | token em cache + **refresh por prova de posse sem Google/Apple** até `ATTEST_MAX_AGE`; atestação só quando o usuário usa a IA, online | convidado offline ok, IA exige login (ou cai em B para convidado) | TTL 30 min–7 d configurável; SDK faz cache |
| **Reset / reinstalação** | sem identidade → sem memória | nova instalação = quota nova, limitada por sinais de plataforma + limite de enrollments (T14) | quota por conta persiste (melhor) | sem sinais de plataforma extras (pior) |
| **Suporte** | sem id para investigar/revogar | `installation_id` opaco permite revogar e investigar sem PII | conta + e-mail (melhor) | painel Firebase para App Check |
| **Privacidade** | sem ID persistente (vantagem) | ID de instalação ("Device or other IDs"/"Device ID"), sem PII nem saúde | PII (e-mail), exclusão de conta, LGPD | **Firebase installation ID** (exemplo literal da definição do Play) + terceiro adicional |
| **App pago (futuro)** | sem âncora para entitlements | entitlement da loja liga à instalação; multi-dispositivo exige conta → C aditivo | ideal (entitlements/multi-device) | neutro |
| **Android / iOS** | iOS ok; Android caro | Android 6.0+ com Play services; iOS 14+ com Secure Enclave; sem GMS/sem App Attest → sem IA | igual + Sign in with Apple | Play Integrity provider / App Attest + DeviceCheck |

### 6.1 Decisão: **B**, com C aditivo

Justificativa técnica para **este** produto:

1. **O que precisa ser identificado é "esta instalação genuína", não "esta pessoa".** O GymFlow é
   local-first, sem conta, e só um recurso opcional fala com servidor. C obrigaria login para um
   recurso opcional e contradiz o princípio aprovado do roadmap (convidado offline).
2. **A única alavanca escassa e barata sem conta é o aparelho físico atestado.** Ela é o que
   converte "curl grátis" em "um aparelho por unidade de quota".
3. **O Play Integrity não entrega chave por instalação**; A é inviável para quota no Android e
   gastaria a cota de 10.000 decodes/dia por chamada. B usa a atestação só nos pontos raros e
   ancora a instalação numa chave de hardware.
4. **Nenhum PII e nenhum dado de saúde no servidor** → mínima expansão do D-NUT-09.
5. **C entra por cima sem retrabalho:** `account_id` vira coluna/campo da instalação e a quota
   passa a `account_id ?? installation_id` (Seção 8), sem invalidar B.
6. **D é o plano B do *verificador*, não da arquitetura:** o `AttestationVerifier` fica atrás de
   uma interface; se a revisão independente do verificador App Attest próprio achar P0/P1 não
   fechável, ou a manutenção for inaceitável, troca-se por App Check **sem** mexer em token,
   quota nem store (mas com a perda de sinais e o custo de privacidade da tabela).

Trade-off assumido: B exige mais código próprio (plugin nativo + verificador) que D ou que "não
fazer nada". O retorno é o único controle que limita uso por identidade.

---

## 7. Token e sessão

### 7.1 Contrato

Sessão **opaca** (não JWT). Justificativa em 7.2.

| Aspecto | Contrato proposto |
|---|---|
| **Emissão** | só após *enrollment* (atestação válida) ou *refresh* (prova de posse; reatestação se `now − last_attested_at > ATTEST_MAX_AGE`). Resposta: `{installationId, token, expiresAt, refreshAfter, attestationLevel}` |
| **Formato** | `gfat1_` + 43 caracteres Base64url (256 bits do CSPRNG do servidor); prefixo fixo para *secret scanning* e versionamento |
| **No servidor** | chave = `SHA-256(token)`; o token em claro **nunca** é persistido nem logado. Sem *pepper*: a entropia de 256 bits basta |
| **TTL** | proposta técnica inicial **60 min** (o App Check usa 1 h por padrão, configurável de 30 min a 7 dias `[OFICIAL]`); `refreshAfter` = 50% do TTL. Parâmetro, ajustável pela telemetria |
| **`ATTEST_MAX_AGE`** | proposta inicial **24 h**. **Android:** até lá o refresh é só prova de posse (sem Google); depois exige novo token Play Integrity. **iOS:** todo refresh já usa *assertion* (prova de posse + integridade, sem round-trip Apple), então o parâmetro só governa o Android. Parâmetro |
| **Refresh** | `POST /token` com challenge novo; **rotação** a cada refresh (o token anterior fica válido por uma *grace* curta, ~30 s, para requisições em voo, e depois é invalidado); **limitado por instalação/hora** (contador) para que uma instalação válida não vire fonte de carga |
| **Binding** | token ↔ `installation_id` ↔ chave da instalação (`key_thumbprint`) ↔ `attest_level` ↔ `policy_ver`. **Não** ligado a IP (redes móveis trocam de IP) |
| **Claims** (campos do registro server-side, não legíveis pelo cliente) | `installation_id`, `platform`, `channel` (`play`\|`internal`), `attest_level` (`play_device`\|`play_strong`\|`appattest`\|`internal_code`), `app_version`, `iat`, `exp`, `policy_ver`, `epoch` |
| **Assinatura** | não se aplica: o que impede forjar é entropia + *lookup* no store |
| **Rotação de segredos** | não há chave de assinatura de sessão. Há **um** segredo de servidor, `CHALLENGE_KEY` (HMAC dos challenges), com `kid` de 1 byte no challenge → rotação sem downtime (a chave anterior é aceita por ≤ 10 min) |
| **Revogação** | instantânea: `status=revoked` **e** `epoch++` na instalação; toda chamada lê o registro (já necessário para a quota). Revogação em massa: subir `policy_ver` mínimo / `global_epoch` |
| **Replay** | (a) challenge de uso único: `SET NX` de "em verificação" (~30 s) **antes** de chamar o Google (no máximo 1 decode por challenge) e ledger de "usado" **só após** verificação bem-sucedida; (b) `counter` iOS por *compare-and-set* atômico; (c) Play: decrypt repetido do mesmo token devolve vereditos vazios + `requestHash` amarrado ao challenge; (d) sessão vale até `exp` e rotaciona |
| **No app** | **nativo seguro**. Android: chave no Keystore; `installation_id` e token cifrados com chave do Keystore, em `getNoBackupFilesDir()` **e** excluídos por `dataExtractionRules` (API 31+) e `fullBackupContent` (≤ 30). iOS: Keychain (`keyId`, `installation_id`, token; classe `…ThisDeviceOnly`, U-17). **Nunca** em `localStorage`/IndexedDB/`PersistedState`/backup JSON |
| **Segredo no cliente** | **nenhum**. O app só guarda material gerado no aparelho (chave não exportável) e credenciais curtas emitidas pelo servidor |
| **Transporte** | `Authorization: Bearer <token>` (exige incluir `Authorization` no preflight, F-121-05); token nunca em URL/query |

### 7.2 Por que opaco e não JWT

1. O estado já é necessário a cada chamada (quota, revogação) → um JWT stateless **não economiza** a
   ida ao store.
2. Revogação instantânea sem lista de deny.
3. **Um segredo a menos** para proteger e rotacionar no Vercel (não existe chave de assinatura).
4. Sem *claims* legíveis no cliente e nos logs (menos vazamento de metadados).
5. Sem a classe de bugs de algoritmo/`kid`/`aud`/`exp` de JWT caseiro.

Custo aceito: o store é dependência de toda chamada (o Assistente falha fechado; o app não).
Reavaliar se a verificação sair do gateway (borda/multi-serviço) ou o store virar gargalo.

### 7.3 Restore, clone e reinstall

| Cenário | Resultado |
|---|---|
| Android Auto Backup / D2D | a chave Keystore não migra e o armazenamento da sessão é excluído → "sem instalação" → **novo enrollment** (instalação nova) |
| iOS restore/migração | chave App Attest invalidada → assertion falha → **re-enroll com chave nova**; não se rejeita a chave nova (orientação Apple). Se itens do Keychain sobreviverem à desinstalação (**não verificado**, U-17), o plugin pode reapresentar o `installation_id` antigo com a atestação nova e o servidor faria *re-key* (mesma instalação, quota preservada) — upside anti-farming, **nunca premissa de segurança** |
| Reinstall / limpar dados | novo enrollment; a memória de dispositivo (T14) fica com Apple/Google |
| Clone de dados em aparelho com root | a chave é não exportável → o clone **não renova**; token copiado vale só até `exp` e gasta a quota da **mesma** instalação |
| Regressão de `counter` (iOS) | revogar a instalação e exigir novo enrollment (sinal de cópia) |
| Backup JSON / import / reset lógico | **sem efeito** na instalação, sessão ou quota |
| "Apagar meus dados de IA" (opcional, Seção 10) | remove a instalação; deixa *tombstone* mínimo se a decisão jurídica permitir |

### 7.4 Segredos de servidor introduzidos (nenhum no cliente)

| Segredo | Para quê | Onde fica | Rotação / observação |
|---|---|---|---|
| Token REST do Redis (escrita) | `GuardStore` | env Production da Vercel (*Sensitive*); Preview/Dev com outro banco | pelo painel do provedor; par somente-leitura para telemetria. **Com escrita no Redis o atacante forja sessões** (T17) |
| `CHALLENGE_KEY` | HMAC dos challenges | env Production (*Sensitive*) | `kid` de 1 byte; vazamento tem impacto baixo (challenges já são obtidos de graça) |
| Credencial Google para `decodeIntegrityToken` | decrypt do veredito | preferir **OIDC da Vercel → Workload Identity Federation** (sem chave estática, disponível em todos os planos `[OFICIAL]`); alternativa: chave JSON de conta de serviço em env *Sensitive* | WIF: nada a rotacionar; SA: rotação manual |
| Chave DeviceCheck `.p8` (opcional, R4) | métrica de fraude / 2 bits | env *Sensitive* | portal Apple (U-11) |
| `GYMFLOW_AI_API_KEY` (**já existe**) | OpenRouter | env *Sensitive* | ao rotacionar, **reaplicar o cap** (F-121-02) — o `CAP_GUARD` recusa operar sem ele |

Não existe rota pública de administração: revogação/inspeção manual é feita por **script de operador**
(fora do bundle) com a credencial de escrita guardada fora do app.

---

## 8. Quota com estado

### 8.1 O que limitar

| Dimensão | Decisão |
|---|---|
| **Chamadas** | **unidade primária**: propostas do Assistente por instalação por **dia UTC** e por **mês UTC**. Reserva **atômica antes** de chamar o provedor; **estorno** em falha do provedor, com teto de estornos/dia |
| **Custo / tokens** | **secundário**. O custo por chamada é limitado por contrato (corpo ≤ 16 KiB, `max_tokens` 1200, timeout 12 s), logo `chamadas × custo_máx` já limita o gasto. O custo real (tokens/US$ do `usage`) alimenta o **pacing global** e, se a telemetria mostrar variância grande, um 2º contador por instalação (U-08) |
| **Concorrência** | 1 requisição em voo por instalação (lock com TTL 30 s) |
| **Janela** | dia/mês **UTC do servidor**; a UI mostra `resetsAt` no horário local; o relógio do cliente nunca conta |
| **Sujeito** | V1: **instalação**. Com conta (GOAL-36): `quota_subject = account_id ?? installation_id` + teto de instalações por conta. A quota é da conta; a instalação segue como âncora de atestação |
| **Tiers** | sem números: `internal` (reduzida, com sunset), `play_device`, `play_strong`/`appattest`. A razão entre tiers e os valores absolutos vêm da telemetria (D-AUTH-07) |

### 8.2 Como os números serão obtidos (nenhum número comercial escolhido aqui)

1. **R1** registra, sem bloquear, chamadas/dia por instalação e custo por chamada (`usage` do
   provedor, U-08).
2. `cap_diário_por_instalação = min( p99_chamadas_dia × margem ,  orçamento_diário_por_instalação / custo_p95_por_chamada )`
   com `orçamento_diário_por_instalação = (limite_mensal_autorizado × fração_para_usuários) / (dias_do_mês × instalações_ativas_p95)`.
3. `margem`, `fração_para_usuários` e o limite mensal são **decisão do dono** (D-AUTH-07). O
   documento não os fixa.
4. Se `instalações_ativas × cap_diário × custo_p95 × dias > limite_mensal`, o desenho não fecha por
   construção → reduzir o cap ou pedir mais orçamento (autorização humana). O **pacing global**
   impede que o mês estoure mesmo assim.

### 8.3 Três camadas e o pacing: como interagem

| Camada | Escopo | Unidade | Quem aplica | Falha | O app vê |
|---|---|---|---|---|---|
| **L0** teto financeiro OpenRouter | global | US$/mês | OpenRouter (chave) | *fail-closed* para todos | `OPENROUTER_BUDGET_EXHAUSTED` (do `402` com `limit_source=openrouter_key_limit`) |
| **L1** rate limit por IP (Vercel) | IP × região | req/60 s | Firewall, **antes** da função | 429 opaco | `RATE_LIMITED` (ou `BACKEND_OFFLINE` se opaco) |
| **L2** quota lógica | instalação (→ conta) | chamadas/dia e mês, 1 em voo | função + Redis | 429 JSON `QUOTA_EXCEEDED` + `resetsAt` | idem |
| **L3** pacing global diário + `CAP_GUARD` | global | US$/dia via `GET /api/v1/key` (cache 60 s) | função | 503 JSON `OPENROUTER_BUDGET_EXHAUSTED` (`scope: daily`) | idem |

**Ordem por chamada:** Firewall (L1) → `Origin` e teto de corpo → **token e registro da instalação**
(401/403 antes de qualquer trabalho) → validação estrita do corpo e gates clínicos (400/403/409,
**sem consumir quota**) → concorrência → **reserva L2** → **pacing L3 + `CAP_GUARD`** → provedor
(L0 é a rede final) → commit ou estorno.

Regras de interação:

- **L0 nunca é o mecanismo normal.** O pacing L3 fecha o *dia* antes de o *mês* estourar; L0
  existe para bug ou bypass.
- **L1 não substitui L2.** O Firewall vê IP (CGNAT de operadora junta vários usuários; contadores
  por região) e não vê a instalação. **Com L2 ativa, o limite de IP deve ser reavaliado**
  (afrouxado ou mantido só como backstop): decisão humana, e o Hobby só permite 1 regra.
- **L2 não protege contra frota de aparelhos** — por isso L3 limita o dano diário e L0 o mensal.
- **`CAP_GUARD`:** se `GET /key` mostra `limit = null` (chave sem teto) ou `limit` acima do máximo
  configurado, o gateway trata como indisponível e alerta. Cobre F-121-02/T24.
- **Estorno:** timeout/5xx/402/resposta inválida do provedor estorna 1 unidade, com teto de
  estornos/dia por instalação (evita "tentativas grátis" caras).

---

## 9. Storage

### 9.1 Estado necessário e quanto de perda cada item tolera

| Estado | Para quê | Se for perdido | Exigência |
|---|---|---|---|
| Ledger de challenge usado | uso único | um challenge pode ser reaproveitado dentro dos 5 min de TTL | `SET NX` + TTL |
| Instalação (registro + chave pública/`key_id`, `counter`, `receipt`, `last_attested_at`, `status`, `epoch`) | identidade, revogação, PoP | as instalações têm de refazer o enrollment (UX, 1×) | leitura por chave; `counter` com CAS atômico |
| Sessão (hash do token → instalação, `exp`) | autorizar chamadas | sessões inválidas → refresh (*fail-safe*: token sem registro **não vale**) | TTL = `exp` |
| Quotas (dia/mês/estorno/em voo) | limitar uso | quota zera (janela de abuso limitada por L3/L0) | incremento **atômico** com TTL |
| Revogações | bloquear instalação | instalação revogada perde o registro → precisa reatestar | junto do registro |
| Idempotência | não cobrar em dobro | possível cobrança dupla numa retentativa | **só contabilidade** (estado `pending/charged/refunded`, TTL ≤ 120 s); **nunca** corpo/resposta (evita reter dado de nutrição) |
| Config/flags (`mode`, `policy_ver`, mínimos, allowlists) | rollout e *kill-switch* | cai no default do ambiente | leitura barata; override instantâneo |
| Métricas agregadas (contadores/dia/evento) | telemetria sem PII | perde-se histórico | TTL 90 d |

Propriedade de projeto: **estado tolerante a perda** — perder o store nunca produz acesso
indevido (token sem registro não vale) nem quebra o app; produz re-enrollment e reset de quota,
ambos limitados por L3/L0.

### 9.2 Alternativas realistas

| | **Upstash Redis** (Marketplace) | Neon Postgres (Marketplace) | Supabase (Postgres+Auth) | Firebase (Firestore + App Check) | Vercel Blob / Global Config |
|---|---|---|---|---|---|
| **Custo inicial** | US$ 0 no free | US$ 0 no free | US$ 0 no free; **Pro US$ 25/mês** | App Check sem custo; Firestore com quotas free (ver página de preços — não detalhado) | Blob: arquivos; Global Config: flags |
| **Free tier `[OFICIAL]`** | 256 MB, **500 mil comandos/mês**, 10 GB de banda; pay-as-you-go US$ 0,20/100 mil comandos com *budget cap* | 100 CU-h/mês e 0,5 GB por projeto; **scale-to-zero** quando inativo; sem cartão | projetos free **pausam após 1 semana sem uso**, 2 ativos, **sem backups automáticos** | — | — |
| **Latência** | REST/HTTP; medir a partir de `iad1` (U-14) | *cold start* após inatividade; medir | via PostgREST/pooler; medir | — | Global Config: leituras <1 ms/99% <10 ms, **escrita em segundos** (não serve para contadores) |
| **Disponibilidade** | **SLA e multi-zone HA só no Prod Pack (+US$ 200/mês/DB)**; free/PAYG sem SLA | conforme plano | Pro | — | — |
| **Operação** | mínima: 1 par de credenciais injetado pela Marketplace | migrações/schema, driver serverless | migrações, RLS, service role | SDK Admin + conta de serviço | — |
| **Lock-in** | baixo (protocolo Redis) | baixo (Postgres) | médio (Auth/RLS/Storage) | alto | Vercel |
| **Backup** | não declarado na página de preços (U-06) | janela de *instant restore* por plano | Pro: diário, 7 dias | Google | — |
| **Migração** | export por `SCAN`; contadores/sessões não precisam migrar | padrão | padrão | difícil | — |
| **Fit para o AI-Guard** | **ótimo**: `SET NX EX`, `INCR`+`EXPIRE`/script atômico, TTL nativo | bom para instalação/audit; pesado para contadores quentes | **coerente com D17/Fase 8**, mas exige abrir o Gate G4 e Pro para produção | só se a opção D for escolhida | **não** (Blob = arquivos; Global Config = flags) |

Descartadas sem detalhe: **Cloudflare (KV/D1/Durable Objects)** — segunda plataforma de execução;
**self-hosted** — carga operacional inadequada; **memória da função** — stateless e multi-instância.
Marketplace Storage está disponível em **todos os planos**, e a Vercel recomenda hospedar o banco
na região da função (`iad1`) `[OFICIAL]`.

### 9.3 Recomendação

**V1: Upstash Redis (Vercel Marketplace), região `us-east-1` (co-localizado com a função
`iad1`), atrás de uma porta `GuardStore`** (`consumeChallenge`, `getInstallation`,
`putInstallation`, `putSession`, `getSession`, `revokeInstallation`, `reserveQuota`,
`commitQuota`, `refundQuota`, `acquireInFlight`, `getConfig`, `bump`). Motivos: operações nativas
para exatamente este estado (uso único, contadores atômicos, TTL); custo zero no início; sem
PII/saúde; e a porta permite mover a instalação para Postgres quando houver conta.

- **Escopo Production-only:** credenciais só no ambiente Production; Preview/Development usam
  outro banco ou nenhum. Token REST somente-leitura para consultas de telemetria.
- **Custo de comandos (aritmética ilustrativa):** ~8 comandos por chamada de IA (sessão, quota
  atômica, lock, estorno, cache do pacing) → 500 mil comandos/mês ≈ 62 mil chamadas/mês no free.
  Enrollment/refresh ≈ 3–4 comandos. O teto real de chamadas é o cap de US$ 5, bem menor.
- **Aceitos:** free sem SLA/HA (por isso "estado tolerante a perda"); persistência/eviction dos
  planos não verificadas (U-06) — se o eviction puder remover chaves de segurança, usar política
  `noeviction` ou tratar a ausência como falha segura (já é o caso).
- **Quando trocar:** instalação/auditoria que exijam durabilidade e relatórios, ou conta
  (GOAL-36) → Postgres (Neon ou o Supabase do D17). A porta isola o gateway dessa troca.

---

## 10. Privacidade e dados

### 10.1 Dados novos

| Dado | Onde | Finalidade | Retenção proposta | Observação |
|---|---|---|---|---|
| `installation_id` (aleatório, 128 bits) | Redis + armazenamento nativo seguro | quota, revogação, suporte | enquanto ativa; **GC após N dias sem uso** (proposta 180) | "Device or other IDs" (Play, análogo ao *Firebase installation ID* da definição) / "Device ID" (Apple) |
| Chave pública / `key_id` (iOS) / hash do SPKI (Android) | Redis | prova de posse | igual à instalação | não é PII |
| Resultado da atestação: `attest_level`, canal, `app_version`, `last_attested_at` | Redis | política e tiers | igual | **não** armazenar token cru nem JSON completo do veredito |
| Receipt Apple (+ métrica de fraude) | Redis | consulta de fraude | vida do receipt (renovável) | — |
| Contadores de quota, sessão (hash + metadados), lock/idempotência | Redis | operação | 48 h / 40 d / `exp` / ≤ 120 s | — |
| IP | **não gravado em claro**; HMAC com sal diário só para o limitador de enrollment (TTL 2 min) | anti-abuso | 2 min | a Vercel já vê o IP na borda/Firewall e nos logs (1 h no Hobby) |
| Métricas agregadas (por dia/evento, sem ID) | Redis | telemetria R1 | 90 d | — |
| Eventos de auditoria (tipo + `installation_id` + instante) | Redis (opcional) | investigação | 30 d (D-AUTH-06) | — |
| **Não armazenados** | — | — | — | corpo/resposta do Assistente, metas, dados de saúde/treino/nutrição, e-mail, nome, IDs de anúncio/hardware |

### 10.2 Impacto por documento (mapeamento factual — **não** é parecer jurídico)

| Documento | Hoje | Com o AI-Guard |
|---|---|---|
| **Data Safety (Play)** | proposta pendente: contexto nutricional transmitido só ao usar o Assistente (D-NUT-09 `PENDING`) | acrescenta **"Device or other IDs"**: coletado (persistido → **não efêmero**), finalidade prevenção de fraude/segurança/funcionalidade; Vercel/Upstash como *service providers* só se processarem em nome do desenvolvedor (decisão jurídica); criptografia em trânsito: sim; **exclusão**: precisa de caminho ou justificativa. A ToS do Play Integrity proíbe fingerprint/rastreio |
| **App Privacy (Apple)** | `NSPrivacyCollectedDataTypes` vazio | candidato **Device ID**, finalidade *App Functionality* (prevenir fraude/segurança), sem *tracking*; se é "vinculado" ao usuário é decisão humana (a Apple presume vínculo por conta/dispositivo). O `PrivacyInfo.xcprivacy` deixa de ser vazio. Preferir Keychain a `UserDefaults` (este exige declaração de *required reason API*; U-17) |
| **D-NUT-09** (`GYMFLOW_NUTRITION_LEGAL_DOSSIER_D_NUT_09.md` §5/§7) | "sem banco de nutrição; logs da plataforma com IP/caminho/status" | passa a existir **store de identidade/quota (sem saúde)**, atestação com Google/Apple, subprocessador novo (Upstash) e região do store. **Atualizar** e levar ao jurídico: LGPD (IP e ID de instalação como dado pessoal?), DPA (Vercel, Upstash, Google), transferência internacional (função em `iad1`) |
| **Política de privacidade** | não há política publicada no repositório | precisa descrever identificadores, finalidades, retenção, exclusão, provedores e transferência |

### 10.3 Direito de exclusão × memória anti-abuso

Apagar a instalação zera a quota e abre um vetor de reset. Opções: **(i)** *tombstone* HMAC da
chave pública com TTL curto (base legal a confirmar pelo jurídico) + sinais de plataforma;
**(ii)** tratar "Apagar meus dados de IA" como reset de instalação, aceitando que a quota reinicia
(limitada por L3/L0). Recomendação técnica: **(ii) + sinais de plataforma**, e tombstone só se o
jurídico aprovar (D-AUTH-06). A memória de dispositivo (DeviceCheck, métrica App Attest, `deviceRecall`)
fica com Apple/Google.

---

## 11. Fluxo de erro

Regras invariantes: **honestidade** (nunca fabricar proposta; dizer a causa e o que continua
funcionando) e **nunca bloquear treino/nutrição locais** — o Assistente é um modal opcional; o
estado local não depende do servidor.

| Código | Origem | HTTP | Comportamento do app | Texto (pt-BR, proposta) |
|---|---|---|---|---|
| `ATTESTATION_UNAVAILABLE` | plugin: `isSupported=false`, sem Play Store/services, `API_NOT_AVAILABLE`, `PLAY_*_NOT_FOUND`; servidor: Google/Apple fora do ar | 503 (upstream) | Assistente indisponível; retry automático só p/ transitórios (5/10/20 s, máx. 3), depois manual | "Este aparelho não consegue verificar o app (Google Play/App Attest indisponível). O Assistente IA não está disponível aqui — o resto do GymFlow funciona normalmente." |
| `ATTESTATION_FAILED` | servidor: veredito reprovado, hash divergente, challenge inválido/expirado/reusado | 403 | não repete em laço; oferece remediação (diálogo Play `GET_INTEGRITY`/`GET_LICENSED`) | "Não foi possível confirmar que este app é autêntico. Instale ou atualize pela loja oficial." |
| `TOKEN_EXPIRED` | servidor | 401 | **silencioso**: 1 refresh e reenvia; se o refresh falhar cai em `ATTESTATION_*` | (sem UI) |
| `TOKEN_REVOKED` | servidor | 403 | limpa a sessão; 1 re-enroll automático (limitado); se revogar de novo, para | "Sessão bloqueada neste aparelho. Tente mais tarde ou fale com o suporte." |
| `QUOTA_EXCEEDED` | servidor (L2) | 429 JSON `{scope: day\|month, resetsAt, retryAfterSeconds}` | não reenvia até `resetsAt` | "Você usou todas as consultas do Assistente IA {hoje/neste mês}. Volta a partir de {hora}. As sugestões offline continuam disponíveis." |
| `RATE_LIMITED` | função (JSON) **ou Firewall** (429 opaco) | 429 | backoff local mesmo quando não distingue de erro de rede (F-121-03) | "Muitas solicitações em pouco tempo. Aguarde alguns segundos e tente de novo." |
| `OPENROUTER_BUDGET_EXHAUSTED` | pacing L3 ou `402 openrouter_key_limit`; `in_flight_budget_exhausted` (transitório) tratado como `RATE_LIMITED` | 503 JSON `{scope: daily\|monthly}` | não reenvia até `resetsAt` | "O Assistente IA atingiu a capacidade de uso do serviço e volta {quando}. O resto do app não é afetado." |
| `BACKEND_OFFLINE` | cliente: `TypeError`/timeout sem resposta legível | — | mensagem **neutra** (não afirma que o aparelho está sem internet) | "Sem resposta do servidor do Assistente IA agora. Verifique a conexão e tente de novo." |

Regras de contrato:

- **Compatibilidade com builds antigos (F-121-04):** requisição **sem token** (build legado ou
  bot) recebe **só códigos que os builds atuais já mapeiam**: `503 PROVIDER_UNAVAILABLE` com
  mensagem "Atualize o GymFlow para usar o Assistente IA". Códigos novos só para clientes que
  enviam token ou `X-GymFlow-Client: ai-guard/1`.
- **Primeira entrega da R1:** `aiFailureToUiState` ganha `default` seguro (→ `provider-unavailable`)
  e o cliente passa a ser tolerante a códigos desconhecidos (*forward-compat*), antes de qualquer
  código novo existir no servidor.
- **Mapa HTTP→código:** 401 `TOKEN_MISSING|TOKEN_EXPIRED` · 403 `TOKEN_REVOKED|ATTESTATION_FAILED` ·
  429 `QUOTA_EXCEEDED|RATE_LIMITED` · 503 `OPENROUTER_BUDGET_EXHAUSTED|ATTESTATION_UNAVAILABLE|PROVIDER_UNAVAILABLE`.
- **`Retry-After` também no corpo** (`retryAfterSeconds`, `resetsAt`): o WebView só lê cabeçalhos
  listados em `Access-Control-Expose-Headers`.
- **Estados de UI novos (proposta):** `quota-exceeded`, `rate-limited`, `attestation-unavailable`,
  `attestation-failed`, `budget-exhausted`, `backend-offline`. `TOKEN_*` não geram estado.
- **Testes obrigatórios na implementação:** mapa exaustivo código→estado, cópia do modal para cada
  estado, e um teste de contrato garantindo que nenhuma falha nova bloqueie fluxos locais.

---

## 12. Rollout (R0–R4)

`R` = rollout deste desenho (não confundir com as Fases 7/8 do produto). **Sem telemetria não há
enforcement**: nenhuma fase bloqueia ninguém antes de a anterior ter medido.

**Desvio deliberado da sequência sugerida (fase 0 = observação):** uma observação *sem cliente novo e
sem store* não é viável — a Hobby guarda logs de runtime por 1 h `[OFICIAL]` e não há onde acumular
contadores, então não há como reconstruir tráfego retroativamente; a linha de base existente é só o
uso mensal do OpenRouter (US$ 0,4529 em 30 dias, GOAL-120) e o painel do Firewall. Por isso a
observação é a própria **R1** (token opcional + telemetria) e a **R0** vira governança/pré-requisitos.

**Modos** (independentes; default por ambiente + *override* instantâneo no store; o
*kill-switch* é `AUTH_MODE=off`, que devolve o comportamento atual):

| Flag | Valores | Falha do store/atestação |
|---|---|---|
| `AUTH_MODE` | `off` → `observe` → `shadow` → `enforce` | `observe`/`shadow`: **falha aberto** (registra); `enforce`: **falha fechado só para o Assistente** |
| `QUOTA_MODE` | `off` → `shadow` → `enforce` | idem |

| Fase | Objetivo | Entregas (futuros GOALs) | Entrada | Saída | Rollback |
|---|---|---|---|---|---|
| **R0** governança e pré-requisitos | destravar sem código | emenda do `CLAUDE.md` (Apêndice D); D-AUTH-01..05; gates G-01..G-06; Redis provisionado (Preview separado); jurídico iniciado | este documento | decisões assinadas; `READY_FOR_AUTH_IMPLEMENTATION_GOAL` | — |
| **R1** enrollment opcional + telemetria (**Android primeiro**) | medir sem bloquear | (a) **forward-compat do cliente** (default seguro em `aiFailureToUiState`) num release **antes** de qualquer código novo; (b) `GuardStore` + Redis; rotas `challenge`/`enroll`/`token`; (c) plugin nativo Android (Keystore + Play Integrity lazy); (d) CORS conforme o Apêndice B (`Authorization`, `X-GymFlow-Client`, `Idempotency-Key`, `Expose-Headers`); (e) métricas agregadas; (f) `CAP_GUARD` em modo log; (g) `QUOTA_MODE=shadow`; (h) exclusão de backup no manifest; (i) Data Safety/D-NUT-09 atualizados **antes de testers externos** | R0 | quase todo tráfego dos builds novos com token válido; distribuição de vereditos conhecida (fecha U-01/U-10); p50/p95/p99 de chamadas/dia/instalação e custo por chamada medidos (U-08); erros de atestação e cota Google dentro do limite definido pelo dono; **nenhum aumento de erro do Assistente** | `AUTH_MODE=off` |
| **R2** enforcement de atestação | exigir token | **2a `shadow`**: calcula "bloquearia" sem bloquear (contadores + cabeçalho de diagnóstico). **2b `enforce`** (Production nativo): token obrigatório; requisição **sem token** → `503 PROVIDER_UNAVAILABLE` "Atualize o GymFlow" (compat, F-121-04); **bucket `legacy`** global pequeno até o *sunset* (D-AUTH-08) — o dano anônimo máximo passa a ser **exatamente o tamanho desse bucket por dia**; canal `internal` (allowlist do digest, ou códigos de tester) com `internal_until`; **canal web conforme D-AUTH-03** (padrão W1: a UI web deixa de oferecer o Assistente — "disponível no app" — e o servidor já recusa requisições sem token) | R1 concluída; testers atualizados; kill-switch testado em produção | `legacy` = 0 após o sunset; nenhum tester bloqueado; falsos positivos abaixo do limiar | `AUTH_MODE=shadow`/`off` |
| **R3** quota com estado | limitar por identidade | `QUOTA_MODE=shadow → enforce` com números da telemetria (D-AUTH-07); pacing L3; estorno; UI `QUOTA_EXCEEDED`; **reavaliar o limite de IP (L1)**; alertas de orçamento | R2b estável | usuário legítimo (≤ p95) nunca bloqueado; gasto mensal previsível | `QUOTA_MODE=off` |
| **R4** endurecimento e extensões (cada item com GOAL próprio) | reduzir o residual P2 | iOS App Attest (após Apple Developer); tiers (`MEETS_STRONG_INTEGRITY`, `recentDeviceActivity`, `appAccessRisk`); anti-farming (DeviceCheck 2 bits, `deviceRecall`, métrica App Attest); prova de posse por requisição; Key Attestation; **vínculo com conta (GOAL-36)** e entitlements (GOAL-39); remover canal `internal`; consolidar store em Postgres se preciso | R3 | por item | por item |

Regras transversais:

- **Não quebrar builds internos existentes:** em R1 continuam funcionando (token opcional); em R2b
  recebem a mensagem de atualização, com o *bucket* `legacy` cobrindo a janela de transição.
- **Não bloquear testers antes de a infraestrutura estar pronta:** canal `internal` e códigos de
  tester; nenhuma fase liga `enforce` sem `shadow` prévio.
- **Cada mudança de modo** exige teste do *kill-switch* e registro em `docs/DECISOES.md`.

### 12.1 Evidências mínimas exigidas nos GOALs de implementação

Vetor de teste oficial da Apple para o verificador de atestação; fixtures de veredito Play (todos
os rótulos/erros); teste de contrato "`PersistedState`/backup não têm campos de auth"; testes de
atomicidade da reserva de quota sob concorrência; teste de `Authorization` no preflight; teste em
aparelho real (Galaxy S22) de Play Integrity, Keystore, backup excluído e 429 opaco (U-03/U-04);
`npm run build`, `npm test`, `tsc` e a auditoria de release verdes; revisão independente por outra
família de modelo.

### 12.2 Observabilidade (a Hobby guarda logs de runtime por **1 h** `[OFICIAL]`)

| Métrica (contador/dia, sem PII, 90 d) | Uso |
|---|---|
| `enroll.ok/fail.<motivo>`, `refresh.pop/reattest/fail.<motivo>`, `token.reject.<motivo>` | saúde do enrollment; falsos positivos |
| `call.ok/quota/budget/provider_error.<classe>` | consumo e bloqueios |
| distribuição de rótulos: `v.device.*`, `v.app.*`, `v.lic.*`, `v.activity.LEVEL_n` | política de vereditos; tiers; U-01 |
| `anon.legacy`, `cap.guard.trip`, `counter.regression` | sunset, cap, sinal de clone |
| cota Google (relatório "Monitor Play Integrity API" do Console + Cloud Console), `usage_daily`/`limit_remaining` do OpenRouter | orçamento e cota |

Alertas: `cap.guard.trip`, pacing ≥ 80% do dia, decode ≥ 70% da cota, pico de falha de
enrollment, `anon.legacy` > 0 após o sunset. Entrega por e-mail dos consoles (a Upstash avisa em
70%/90% do *budget* `[OFICIAL]`) e um resumo diário por script — **nenhum log de corpo/IP em
claro**.

---

## 13. Custos e gates humanos

**Nenhum item abaixo é autorizado por este documento.** Colunas: `COST` · `FREE_TIER` ·
`HUMAN_ACCOUNT_ACTION` · `IRREVERSIBLE_OR_NOT`.

| Gate | COST | FREE_TIER | HUMAN_ACCOUNT_ACTION | IRREVERSIBLE_OR_NOT | Bloqueia |
|---|---|---|---|---|---|
| **G-01** Emenda do `CLAUDE.md` + decisão do Founder (D-AUTH-01) | 0 | n/a | escrever/aprovar a exceção (Apêndice D) | reversível (é texto) | tudo |
| **G-02** Google Play Console (conta de desenvolvedor) e criação do app `com.gymflowai.app` | **US$ 25 único** `[GP-signup]` | não | criar conta, verificação de identidade (documento oficial e cartão em nome legal); contas pessoais novas: requisitos de teste e de dispositivo; escolher FREE/PAID | **taxa não reembolsável se os dados forem inválidos**; **FREE não vira PAID e o package fica preso à conta no 1º upload** (GOAL-117 §12) — assinatura via Play Billing (GOAL-39) é compatível com app FREE; tipo/identidade da conta: reversibilidade não verificada | R1 (Android real), R2 |
| **G-03** Play App Signing + upload do AAB (Internal Testing) — GOAL-117 | 0 | n/a | escolher a chave de assinatura; enviar o AAB | **escolha da chave de assinatura é irreversível** (GOAL-117) | validar `PLAY_RECOGNIZED`/`LICENSED` |
| **G-04** Projeto Google Cloud + habilitar Play Integrity API + **linkar no Play Console** + credencial de decode (OIDC→WIF, ou conta de serviço) | nenhum preço declarado nas páginas consultadas (U-02); cota padrão 10.000/dia; aumento só com app publicado | cota padrão | criar projeto, habilitar API, linkar, criar WIF/SA | desvinculável (até 5 projetos); demais efeitos não verificados | R1 |
| **G-05** Apple Developer Program | **US$ 99/ano** `[AB-programs]` | não (conta gratuita não distribui) | matrícula; App ID `com.gymflowai.app`; capability App Attest; chave DeviceCheck se usar métrica/bits; Team ID no Xcode | anuidade; download único da chave `.p8` não verificado (U-11) | iOS (R4) |
| **G-06** Storage: **Upstash Redis** via Vercel Marketplace | **free** (256 MB, 500 mil comandos/mês); PAYG US$ 0,20/100 mil comandos (com *budget cap*); Prod Pack +US$ 200/mês/DB (**não recomendado**) | sim | instalar a integração, escolher região, criar DB Production (+ Preview) | reversível (apagar o DB perde só estado tolerante a perda) | R1 |
| **G-07** Plano Vercel | Hobby US$ 0 — **"uso pessoal, não comercial"** `[OFICIAL]`; Pro **US$ 20/mês** (+US$ 20 de crédito) | Hobby | decidir quando o app virar comercial/pago; fazer upgrade | reversível (downgrade com restrições); Pro sobe logs de 1 h para 1 dia e libera mais regras | comercialização (não R1) |
| **G-08** Orçamento OpenRouter | cap atual US$ 5/mês (já autorizado); **qualquer aumento = nova autorização** | — | painel OpenRouter | reversível | R3 (números) |
| **G-09** Parecer jurídico (LGPD, DPA, Data Safety, App Privacy) | externo | — | contratar/consultar | n/a | R1 externo, R2 |
| **G-10** *(só se D)* Projeto Firebase / App Check | sem custo, sujeito a cotas do provedor `[FB]` | sim | criar projeto, registrar apps | reversível | — |
| **G-11** *(opcionais)* Vercel BotID (Basic sem custo; Deep Analysis com preço **não verificado**) para W2; Observability Plus (logs de 30 d) | variável | Basic | ativar | reversível | — |

---

## 14. Decisões

### 14.1 Decisões técnicas registradas por este GOAL

| ID | Decisão |
|---|---|
| D121-001 | Arquitetura-alvo **B** (instalação atestada + sessão opaca + quota por instalação); **C** aditivo no GOAL-36; **A** só como mecanismo de enrollment/refresh; **D** como plano B do verificador |
| D121-002 | Atestação **não** é autenticação; o controle real é a quota de servidor |
| D121-003 | Android: Play Integrity **standard** + `requestHash`; decrypt no Google; atestar só em enrollment/reatestação; warm-up lazy |
| D121-004 | iOS: App Attest (1 chave por instalação, `keyId` no Keychain), assertion só no refresh; DeviceCheck só como sinal opcional (R4) |
| D121-005 | Sessão opaca de 256 bits, guardada por SHA-256, TTL curto, rotação e revogação instantânea; **não JWT** |
| D121-006 | Store V1 = Upstash Redis atrás de `GuardStore`; nada de saúde/treino/nutrição no servidor; Postgres/Supabase só com conta |
| D121-007 | Unidade de quota = chamadas/instalação/dia+mês UTC (reserva atômica, estorno limitado) + 1 em voo + pacing global + `CAP_GUARD`; números só após R1 |
| D121-008 | O Firewall fica como backstop; **não** limita por token no Hobby (chave só IP/JA4); limites por instalação vivem na função |
| D121-009 | Canal web: padrão W1 (desligar o Assistente na web Production ao entrar em enforcement), pendente de D-AUTH-03 |
| D121-010 | Rollout R0–R4 com `AUTH_MODE`/`QUOTA_MODE`, *kill-switch*, compat para builds antigos e canal `internal` |
| D121-011 | Identidade/sessão **nunca** em WebView, `PersistedState` ou backup; armazenamento nativo fora de backup + teste de contrato |
| D121-012 | Requisição sem token recebe só códigos que os builds atuais mapeiam; `aiFailureToUiState` ganha `default` na 1ª entrega da R1 |
| D121-013 | A emenda do `CLAUDE.md` é **proposta**, não aplicada (Apêndice D) |
| D121-014 | `installation_id` é "Device or other IDs"/"Device ID": Data Safety, App Privacy e D-NUT-09 são atualizados **antes** de testers externos |

### 14.2 Decisões humanas pendentes

| ID | Decisão | Recomendação | Bloqueia |
|---|---|---|---|
| **D-AUTH-01** | emenda do `CLAUDE.md` (G-A/G-B/G-C, Seção 2) | G-A, texto do Apêndice D | tudo |
| **D-AUTH-02** | confirmar **B** como alvo e **Upstash** como store V1 (ou G-B/Supabase-first) | B + Upstash | R1 |
| **D-AUTH-03** | canal web: **W1** desligar o Assistente na web Production ao enforçar (inclui PWA/Safari no iOS, sem atestação) · **W2** BotID Basic + sessão web de baixa confiança + quota por IP-hash · **W3** exigir conta (GOAL-36) | W1 | R2 |
| **D-AUTH-04** | provisionar/gastar: G-02, G-04, G-06 (R1), G-05 (iOS), G-07 (Vercel), G-08 | por gate | R1 / iOS |
| **D-AUTH-05** | aparelho sem Play services/App Attest e emulador: **fail-closed** para o Assistente · tier de baixa confiança com quota mínima e por IP-hash | fail-closed | R2 |
| **D-AUTH-06** | retenção e exclusão: GC de instalações (proposta 180 d), auditoria (30 d), *tombstone* (i) ou reset (ii) | (ii) + sinais de plataforma; parecer jurídico | R1 externo |
| **D-AUTH-07** | **números**: teto mensal, `margem`, `fração_para_usuários`, tiers | decidir com a telemetria da R1 | R3 |
| **D-AUTH-08** | data de *sunset* do bucket `legacy` e aviso aos testers | curto, fixo, registrado | R2b |

---

## 15. Estado de aceite

```
CURRENT_GATEWAY_AUTH = NO
CURRENT_COST_CAP = ACTIVE
CURRENT_IP_RATE_LIMIT = ACTIVE

TARGET_ARCHITECTURE = DEFINED                 (B; C aditivo)
ANDROID_ATTESTATION_PLAN = DEFINED
IOS_ATTESTATION_PLAN = DEFINED
TOKEN_MODEL = DEFINED
QUOTA_MODEL = DEFINED                          (unidade e camadas; NÚMEROS = D-AUTH-07, pós-R1)
STATE_STORAGE_REQUIREMENTS = DEFINED
ROLL_OUT_PLAN = DEFINED
PRIVACY_IMPACT = DOCUMENTED

PRODUCTION_CODE_CHANGED = NO
EXTERNAL_SERVICE_PROVISIONED = NO
PAID_SERVICE_ENABLED = NO

P0_ARCHITECTURE_UNKNOWN = 0                    (análise do autor; SEM revisão independente)
P1_ARCHITECTURE_UNKNOWN = 0                    (idem)

INDEPENDENT_REVIEW = NOT_EXECUTED              (falha do ambiente local; Seção 16)
READY_FOR_AUTH_IMPLEMENTATION_GOAL = PENDING_INDEPENDENT_REVIEW
```

**Por que não é `YES`:** o conteúdo do desenho está completo e consistente pela análise do autor,
mas o item 15 do GOAL (revisão independente **obrigatória**, por modelo de outra família) **não foi
executado** (Seção 16). Um `YES` agora afirmaria algo que ninguém além do autor verificou; a revisão
pode reabrir uma decisão de arquitetura. **Regra:** nenhum GOAL de implementação começa antes de a
revisão rodar e de qualquer P0/P1 ser fechado. Depois disso o valor passa a `YES` (o *início* ainda
depende dos gates G-01, G-02/G-04, G-06 e D-AUTH-01/02/04/06, todos enumerados e nenhum é pergunta de
arquitetura) ou a `BLOCKED_HUMAN_ARCHITECTURE_DECISION` (se a revisão contestar B). **R2 (enforcement)
não está liberada** de qualquer forma: exige R1 medida e D-AUTH-03/05/08.

**Por que P0/P1 desconhecidos = 0 (segundo o autor):** os itens que **não** foram verificados (Apêndice E) são todos
P2/P3, cada um tem verificação prevista em R1 antes de qualquer enforcement, e nenhum muda a
arquitetura — em todos existe mitigação independente do resultado (armazenamento nativo excluído
de backup + Keystore, backoff local, `default` seguro, `GuardStore` substituível, verificador
substituível por App Check).

---

## 16. Revisão independente

**Status: NÃO EXECUTADA neste GOAL.** A revisão obrigatória por modelo de outra família (Codex CLI,
`gpt-5.6-sol`, conteúdo inline em sandbox *read-only*, a mesma receita dos GOALs 117/118) **não pôde
rodar por uma falha do ambiente local — não do desenho**. Nada disto é resultado de revisão; é o
registro do que foi tentado.

| Item | Fato medido (2026-09-28, 22:00–22:20Z) |
|---|---|
| Sintoma | `codex exec` para em "Reconnecting… waiting for network" com `os error 10048` (`WSAEADDRINUSE`) ao conectar em `chatgpt.com`; o mesmo erro (`EADDRINUSE`) aparece no `fetch`/`net.connect` do Node para `chatgpt.com`; `curl` para o mesmo host funciona (HTTP 403 do Cloudflare, sem credencial) |
| Causa | ~14–16 mil sockets em `TIME_WAIT` **que não expiram** (0 expirados em 60 s; as contagens por destino ficaram idênticas entre 21:59Z e 22:10Z e as mesmas portas locais seguiam ocupadas), com endereço local antigo (`192.168.0.6`; a máquina agora está em `192.168.2.200`) e destinos `chatgpt.com`/Google/DNS, ocupam a faixa dinâmica 49152–65535. O `bind(0)` que Node/Rust fazem antes do `connect` cai nessas portas e colide; o `curl` (que conecta sem `bind` explícito) não. Prova: `net.connect` com `localPort` explícita fora da faixa conecta em `chatgpt.com` |
| Fora do escopo do GOAL | reiniciar a pilha TCP/máquina, alterar `TcpTimedWaitDelay` ou parar processos de outros projetos (config de sistema / apps do usuário) |
| Tentativas | 3 execuções normais do `codex exec` com retentativa e espera por portas livres — sem sucesso. Um **túnel CONNECT local** com porta explícita foi **negado** pelo classificador de segurança do ambiente e **removido**; nenhuma outra rota (navegador, outro serviço, outro modelo) foi tentada, porque enviar código e desenho por outro canal é uma decisão de compartilhamento de dados que pertence ao dono |
| Preparado | pacote de revisão sanitizado (~43 mil tokens; escaneado por padrões de segredo; sem `.env`, keystore ou credenciais) e instruções do revisor — receita reproduzível no Apêndice F |

**Como concluir:** liberar as portas (p.ex. reiniciar a máquina ou a pilha de rede) e rodar a receita
do Apêndice F; ou o dono autorizar outro canal para o pacote. Depois: registrar rodadas e correções
nesta seção, corrigir **só a documentação/plano**, e então atualizar a Seção 15.

---

## Apêndice A — Fontes consultadas (todas em 2026-09-28)

**Google / Android**

| Tag | URL | Nota |
|---|---|---|
| PI-overview | https://developer.android.com/google/play/integrity/overview | atualizada em 2026-04-20 (exibido na página) |
| PI-standard | https://developer.android.com/google/play/integrity/standard | atualizada em 2026-06-01 |
| PI-classic | https://developer.android.com/google/play/integrity/classic | tabela standard × classic, nonce, decrypt |
| PI-verdicts | https://developer.android.com/google/play/integrity/verdicts | formato do veredito |
| PI-setup | https://developer.android.com/google/play/integrity/setup | cotas, link do projeto, biblioteca 1.6.0 |
| PI-errors | https://developer.android.com/google/play/integrity/error-codes | retry/backoff |
| PI-terms | https://developer.android.com/google/play/integrity/terms | ToS (mod. 2024-05-20): proíbe fingerprint |
| PC-help | https://support.google.com/googleplay/android-developer/answer/11395166 | Console: link, testes, cota |
| GP-signup | https://support.google.com/googleplay/android-developer/answer/6112435 | taxa US$ 25, verificação |
| GP-datasafety | https://support.google.com/googleplay/android-developer/answer/10787469 | definições "Device or other IDs", efêmero, service provider |
| FB-provider / FB / FB-backend | https://firebase.google.com/docs/app-check/android/play-integrity-provider · /docs/app-check · /docs/app-check/custom-resource-backend · https://firebase.google.com/pricing | tabela de canais; App Check ≠ Auth; replay beta; sem custo |
| AK-attest | https://developer.android.com/privacy-and-security/security-key-attestation | raízes; nova raiz em 2026-02-01 |
| AK-keystore | https://developer.android.com/privacy-and-security/keystore | chave não exportável, TEE/StrongBox |
| — Auto Backup | https://developer.android.com/identity/data/autobackup | o que entra no backup, `dataExtractionRules` |

**Apple**

| Tag | URL | Nota |
|---|---|---|
| AP-* | https://developer.apple.com/documentation/devicecheck (páginas: `establishing-your-app-s-integrity`, `validating-apps-that-connect-to-your-server`, `preparing-to-use-the-app-attest-service`, `assessing-fraud-risk`, `accessing-and-modifying-per-device-data`, `dcappattestservice`, `dcappattestservice/issupported`, `dcdevice`, `attestation-object-validation-guide`) e `bundleresources/entitlements/com.apple.developer.devicecheck.appattest-environment` | lidas pelo JSON DocC oficial |
| AP-wwdc26 | https://developer.apple.com/videos/play/wwdc2026/201/ | "Secure your apps with App Attest" (iOS 27) |
| AB-programs | https://developer.apple.com/programs/ | US$ 99/ano |
| AB-privacy | https://developer.apple.com/app-store/app-privacy-details/ | "collect", Device ID, App Functionality |
| — Simulator | https://developer.apple.com/forums/thread/732459 | **fórum**, não documentação (U-05) |

**Outros**

| Fonte | URL | Nota |
|---|---|---|
| Vercel | https://vercel.com/docs/storage · /docs/vercel-firewall/vercel-waf/rate-limiting (atualizada em 2026-08-28) · /docs/logs/runtime · /docs/oidc/gcp · /docs/plans/hobby · /pricing · /docs/botid | limites Hobby, logs 1 h, OIDC→GCP, não comercial |
| OpenRouter | https://openrouter.ai/docs/api_reference/limits | `GET /api/v1/key`, `402 limit_source` |
| Upstash | https://upstash.com/pricing/redis | free/PAYG/Prod Pack |
| Neon | https://neon.com/pricing | free plan, scale-to-zero |
| Supabase | https://supabase.com/pricing | pausa em 1 semana, backups Pro |
| Next.js 16 | `node_modules/next/dist/docs/` (`runtime.md`, `16-proxy.md`) | runtime padrão nodejs; proxy ≠ autorização |

---

## Apêndice B — Contrato de API proposto (**proposta, nada implementado**)

Todas as rotas novas: `Cache-Control: no-store`; mesma allowlist de `Origin` do gateway; nunca
logar corpo; corpo ≤ 16 KiB (o objeto de atestação iOS tem alguns KiB em Base64 — medir, U-14).
Envelope de falha = superset do atual: `{ status:'failure', code, message, retryAfterSeconds?,
resetsAt?, scope? }` (clientes antigos ignoram os campos novos).

| Rota | Corpo | Resposta 200 | Erros |
|---|---|---|---|
| `POST /api/ai/v1/challenge` | `{purpose:'enroll'\|'refresh', platform, installationId?}` | `{challenge, expiresAt}` — **stateless**: HMAC(`kid`, purpose, platform, `iat`, 16 B aleatórios, installationId?) | 400, 429 |
| `POST /api/ai/v1/enroll` | android: `{platform, challenge, integrityToken, installationPublicKey (SPKI b64url), appVersionCode}` · ios: `{platform, challenge, keyId, attestation (b64)}` | `{installationId, token, expiresAt, refreshAfter, attestationLevel, channel}` | 400 `INVALID_REQUEST`; 403 `ATTESTATION_FAILED`; 503 `ATTESTATION_UNAVAILABLE`; 429 |
| `POST /api/ai/v1/token` | android: `{installationId, challenge, popSignature (ECDSA P-256/SHA-256, DER, sobre `gf-pop-v1` ‖ challenge ‖ installationId — separação de domínio) [, integrityToken]}` · ios: `{installationId, clientData (b64 JSON), assertion (b64)}` | idem `enroll` (sem trocar `installationId`) | 403 `TOKEN_REVOKED`/`ATTESTATION_FAILED`; **409 `REATTEST_REQUIRED`** (cliente reenvia com atestação); 503 |
| `POST /api/ai/v1/reset` *(opcional)* | Bearer + prova de posse | 204 (remove a instalação) | 401/403 |
| `GET /api/ai/v1/quota` *(opcional)* | Bearer | `{day:{remaining, resetsAt}, month:{remaining, resetsAt}}` | 401/403 |
| `POST /api/nutrition/assistant` *(existente)* | corpo atual + cabeçalhos `Authorization: Bearer gfat1_…`, `X-GymFlow-Client: ai-guard/1`, `Idempotency-Key: <uuid>` (opcional) | resposta atual + `meta.quota` aditivo | 401 `TOKEN_MISSING/EXPIRED`; 403; 429 `QUOTA_EXCEEDED/RATE_LIMITED`; 503 `OPENROUTER_BUDGET_EXHAUSTED/…` |

**Mudanças de CORS obrigatórias (F-121-05):** `Access-Control-Allow-Headers: Content-Type,
Authorization, X-GymFlow-Client, Idempotency-Key`; `Access-Control-Expose-Headers: Retry-After`;
`isAllowedPreflight` (hoje só `content-type`) aceita esses nomes; testes do GOAL-118 que exigem 403
para `Authorization` são reescritos. A allowlist de origens **não** muda.

---

## Apêndice C — Modelo de dados (Redis, prefixo `gd:`)

| Chave | Valor | TTL | Operação atômica |
|---|---|---|---|
| `gd:chal:used:{rand}` | `1` | 10 min | `SET NX` **só após** verificação bem-sucedida |
| `gd:inst:{installation_id}` | hash: `platform, channel, status, epoch, attest_level, last_attested_at, app_version, key_thumbprint, [ios: key_id, pubkey, counter, receipt, env]` | 180 d rolante (D-AUTH-06) | `counter`: script *compare-and-set* |
| `gd:pk:{sha256(pubkey ou keyId)}` | `installation_id` | igual | `SET NX` (dedupe de chave) |
| `gd:tok:{sha256(token)}` | `installation_id, exp, attest_level, policy_ver, epoch` | `exp` + 5 min | `SET` |
| `gd:tokof:{installation_id}` | hash do token vigente (rotação/grace) | igual | `SET` |
| `gd:q:d:{inst}:{yyyymmdd}` · `gd:q:m:{inst}:{yyyymm}` · `gd:qg:d:{yyyymmdd}` | inteiros | 48 h · 40 d · 48 h | script: `INCR`+`EXPIRE` com teto e reversão |
| `gd:refund:d:{inst}:{yyyymmdd}` | inteiro | 48 h | `INCR` |
| `gd:infl:{inst}` | `1` | 30 s | `SET NX EX` |
| `gd:idem:{inst}:{key}` | `pending\|charged\|refunded` | 120 s | `SET NX EX` |
| `gd:cfg` | hash: `auth_mode, quota_mode, policy_ver, min_versions, cert_allowlist` | — | leitura com cache local de 30 s |
| `gd:cap` | último `GET /api/v1/key` (`limit`, `limit_remaining`, `usage_daily`) | 60 s | `SET EX` |
| `gd:rl:ip:{hmac}:{min}` | inteiro | 2 min | `INCR`+`EXPIRE` (só enrollment/challenge) |
| `gd:m:{yyyymmdd}:{evento}` | inteiro | 90 d | `INCR` |
| `gd:tomb:{sha256(pubkey)}` | `1` | curto | **só se** D-AUTH-06 aprovar |

Nenhuma chave contém corpo/resposta do Assistente, dado de saúde, e-mail, nome ou IP em claro.

---

## Apêndice D — Emenda proposta ao `CLAUDE.md` (**não aplicada**)

> **Exceção controlada "AI-Guard" (exige autorização explícita do Founder por GOAL).**
> Fica permitido, *somente* depois de um GOAL de implementação autorizado e dentro das fases R1–R4
> do documento `docs/security/GYMFLOW_AI_GATEWAY_AUTH_ARCHITECTURE_121.md`: um backend mínimo no
> gateway do Assistente IA para atestação de plataforma (Play Integrity / App Attest), sessão
> opaca, quota por instalação e estado efêmero no store aprovado (Upstash Redis).
> Continua **proibido**: contas de usuário, Supabase/Auth (até o GOAL-36 e o Gate G4), pagamento
> real, dados de saúde/treino/nutrição no servidor, log de corpo de requisição ou IP em claro,
> segredo estático no cliente, e qualquer aumento de gasto sem autorização humana explícita.
> Cada fase exige GOAL próprio, *kill-switch* testado e registro em `docs/DECISOES.md`.

Não altera as demais regras técnicas (design system, sem `alert()`, não tocar em avatar/GLB etc.).

---

## Apêndice E — Itens não verificados (todos P2/P3; verificação prevista antes de enforcement)

| ID | Sev. | Item | Como/quando verificar | Mitigação independente do resultado |
|---|---|---|---|---|
| U-01 | P2 | vereditos e `certificateSha256Digest` para build sideload e para Internal Testing com Play App Signing | R1 (`observe`) com aparelho real | canal `internal` / códigos de tester |
| U-02 | P3 | Play Integrity: exigência de billing/preço no projeto Cloud | Cloud Console antes de G-04 | decisão humana se houver custo |
| U-03 | P2 | Auto Backup incluir o WebView (`app_webview/`) | `bmgr`/`adb` em R1 | credenciais fora do WebView, em armazenamento nativo excluído + Keystore |
| U-04 | P3 | WebView tratar o 429 sem ACAO como erro de rede | teste em aparelho na R1 | backoff local; erros JSON com CORS na função |
| U-05 | P3 | `isSupported` no Simulator (só fórum) | Xcode | `ATTESTATION_UNAVAILABLE`; debug enrollment em dev |
| U-06 | P2 | Upstash: persistência, eviction e backup nos planos free/PAYG | docs do produto antes de G-06 | estado tolerante a perda; `GuardStore` |
| U-07 | P3 | cobrança da integração Marketplace no Hobby | no provisionamento | free tier / *budget cap* |
| U-08 | P2 | campos `usage`/custo por chamada do OpenRouter | R1 | quota por chamadas (custo limitado por contrato) |
| U-09 | P2 | plugin nativo próprio × plugin de terceiros | GOAL da R1 com revisão de supply chain | plugin próprio mínimo |
| U-10 | P2 | requisito mínimo do Console para obter token (habilitar só no Cloud × linkar; a doc de erros cita `API_NOT_AVAILABLE` por "não habilitada no Console") | R1 com build do Play | debug enrollment; opção D |
| U-11 | P3 | download único da chave `.p8` do DeviceCheck | ao criar a chave | guardar cópia no cofre |
| U-12 | P2 | enquadramento jurídico das declarações (Data Safety/App Privacy/LGPD) | G-09 | decisão humana |
| U-13 | P3 | `deviceRecall` (beta): GA e preço | R4 | uso opcional |
| U-14 | P3 | latência Upstash a partir de `iad1`; tamanho real do objeto de atestação iOS | R1 | co-localização |
| U-15 | P3 | controle da região da função no Hobby | Vercel | manter `iad1` |
| U-16 | P3 | veredito forjado com chaves vazadas em aparelhos com root (relato geral, não da doc oficial) | R4 (tiers, alertas) | `MEETS_STRONG_INTEGRITY`, `recentDeviceActivity`, revogação pelo Google |
| U-17 | P3 | classe de acessibilidade do Keychain (`ThisDeviceOnly`), **se itens do Keychain sobrevivem à desinstalação** (habilitaria *re-key*) e se `UserDefaults` exige *required reason API* | docs Apple na implementação | Keychain com `ThisDeviceOnly`; re-key só como upside |

---

## Apêndice F — Receita reproduzível da revisão independente (pendente)

Objetivo: revisão adversarial por **outra família de modelo** (Codex CLI ≥ 0.149, `gpt-5.6-sol`), que
tenta quebrar o desenho e confere o texto contra o código. Recomendação do GOAL-117: o *sandbox*
`read-only` do Codex no Windows bloqueia toda leitura de arquivo — por isso o conteúdo vai **inline**
no prompt, nunca pelo working tree.

1. **Pacote** (um único arquivo `.md`): (a) as instruções abaixo; (b) este documento com linhas
   numeradas; (c) trechos numerados de `git show HEAD:<caminho>` dos arquivos:
   `CLAUDE.md`, `src/app/api/nutrition/assistant/route.ts`, `src/lib/nutrition/ai-assistant-route.ts`,
   `ai-assistant-client.ts`, `ai-assistant-provider.ts` (linhas 45–190), `ai-assistant-types.ts`
   (60–85, 215–235, 290–345), `src/components/nutrition/AiMealAssistantModal.tsx` (200–222),
   `src/lib/storage-types.ts` (15–50), `src/modules/AuthPages.tsx` (1–30),
   `src/providers/GymFlowContext.tsx` (2160–2270), `android/app/src/main/AndroidManifest.xml`,
   `capacitor.config.ts`, `docs/AI_COST_ABUSE_GUARDRAILS_120.md`,
   `docs/personal/FASE_8_ROADMAP_GOALS.md` (1–60), `package.json` (28–70); (d) os cabeçalhos e
   corpos medidos em Production da Seção 1.3 (400 da função × 429 do Firewall).
2. **Sanitizar e escanear:** nada de `.env*`, keystore, `release-signing.properties` ou credenciais;
   trocar o *slug* do time da Vercel; recusar o envio se o pacote casar com chaves `sk-…`/`or-v1-…`,
   um *Bearer* com token longo, marcador de chave privada ou chave de acesso AWS.
3. **Comando:**

```
codex exec --ignore-user-config -m gpt-5.6-sol -c model_reasoning_effort=high -s read-only --skip-git-repo-check --ephemeral --color never -o review-r1-out.md - < review-r1-prompt.md
```

4. **Rodadas:** R1 → corrigir só a documentação → R2 com a lista da rodada anterior e pedido de
   `FIXED / PARTIAL / NOT FIXED / DISPUTED` por achado → repetir até P0 = P1 = 0. Manter severidade
   estrita (o revisor tende a escalar detalhes de implementação e itens já listados no Apêndice E).
5. **Registrar** aqui (Seção 16) rodadas, contagens e correções; atualizar as Seções 14/15 e os
   registros em `docs/DECISOES.md`, `docs/PENDENCIAS.md` e `docs/GOALS_LOG.md`.

**Instruções do revisor** (texto usado para preparar a R1; escala P0–P3 = Seção 3.1):

```
You are an independent senior security/architecture reviewer (a different model family from the
author, who is Claude). The author produced a DESIGN-ONLY document that turns an unauthenticated
public AI gateway (a Next.js route on Vercel calling OpenRouter, used by a Capacitor Android/iOS
app and a web build) into a protected one. You get the document (numbered lines), the real code it
reasons about, and raw headers measured on Production. You cannot browse; everything is inline.

Try to break the design and check it against the code and against itself. Focus on:
(a) bypass paths that still reach the paid provider or drain quota/budget; (b) replay (challenge,
token, attestation, assertion counter, idempotency); (c) excessive trust in the client and false
equivalence between attestation and authentication; (d) quota that can be reset, raced, double-spent
or bypassed; (e) storage inadequacy (atomicity, loss tolerance, secrets, blast radius); (f) offline
or degraded behaviour breaking local features or already shipped builds; (g) dependence on
platform APIs that may be unavailable; (h) hidden costs and human gates; (i) privacy mis-statements;
(j) internal contradictions, wrong citations, and claims tagged [OFICIAL] that contradict the
official docs (state confidence); (k) anything the GOAL checklist requires that is missing.

Severity is strict and uses the document's own scale (section 3.1): rate P0/P1 ONLY if the design AS
WRITTEN leaves the path open. Do not escalate wording, implementation details, or items already
listed as UNVERIFIED (Appendix E) that have a mitigation holding whatever the outcome. Out of scope:
the governance decision, legal conclusions, choosing commercial quota numbers.

Output (markdown, concise): 1 VERDICT; 2 FINDINGS table (ID, severity, doc section, title, concrete
scenario, proposed fix to the DOCUMENT); 3 CLAIMS THAT LOOK WRONG OR UNSUPPORTED; 4 GAPS vs the GOAL
checklist; 5 COUNTS (P0..P3).
```
