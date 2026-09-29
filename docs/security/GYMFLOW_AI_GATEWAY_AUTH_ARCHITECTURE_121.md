# Arquitetura de autenticação e quota do gateway do Assistente IA (GOAL-121)

**GOAL:** `GYMFLOW-AI-AUTH-QUOTA-ARCHITECTURE-AUDIT-121`
**Data:** 2026-09-28 · **revisado após a revisão independente R1 em:** 2026-09-29
**Base:** `origin/master` `ebcc7867c60012aee58e9ec7de9beabaec747f4c`
**Estado:** desenho **pós-R1** — `INDEPENDENT_REVIEW_RESULT = R1_CHANGES_APPLIED_PENDING_R2`,
`READY_FOR_AUTH_IMPLEMENTATION_GOAL = PENDING_INDEPENDENT_REREVIEW`. **Não aprovado; nenhuma
implementação autorizada** (Seção 15).
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
| `[OFICIAL]` | documentação oficial do fornecedor, lida em 2026-09-28 ou 2026-09-29 (URL e data no Apêndice A) |
| `[INFERÊNCIA]` | conclusão derivada do que está acima; precisa ser validada antes de virar premissa |
| `[NÃO VERIFICADO]` | não confirmado nesta auditoria; entra na lista U-xx (Apêndice E) e é validado na fase R1 do rollout |
| `IR-121-nn` | achado da revisão independente **R1** (PR #55) que motivou uma correção; a Seção 16.2 mapeia cada um à seção corrigida |

Nada aqui é conformidade jurídica: os pontos de privacidade são mapeamentos factuais para
decisão humana/jurídica (D-NUT-09 continua `PENDING`).

Atenção ao nome: **R1/R2 da revisão independente** (Seção 16, Apêndice F) e **R0–R4 do rollout**
(Seção 12) são coisas diferentes.

### Índice

0. Sumário executivo
1. Auditoria do estado atual
2. Governança
3. Modelo de ameaças
4. Android — Play Integrity
5. iOS — App Attest / DeviceCheck
6. Arquiteturas comparadas e recomendação
7. Token e sessão (inclui o transporte nativo, 7.5, e os estados do challenge, 7.6)
8. Quota com estado (inclui *outcomes* de idempotência, 8.4, e anti-farming, 8.5)
9. Storage (inclui a análise de perda por tipo de estado, 9.1)
10. Privacidade e dados
11. Fluxo de erro
12. Rollout (R0–R4) (inclui o piso de configuração e a emergência, 12.1)
13. Custos e gates humanos
14. Decisões
15. Estado de aceite
16. Revisão independente (R1 aplicada; R2 pendente)
- Apêndices: A fontes · B contrato de API · C modelo de dados · D emenda proposta ao CLAUDE.md · E itens não verificados · F receita da revisão independente R2 (pendente)

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
`TARGET_ARCHITECTURE = B` foi **mantida** depois da revisão independente R1 (Seção 16): os oito
achados eram corrigíveis dentro do desenho.

1. **Chave de instalação e atestação.** O app gera uma chave de instalação (Android Keystore; iOS
   Secure Enclave via App Attest) e a atesta com a plataforma. No **iOS** o App Attest prova que a
   chave está em hardware. No **Android** o Play Integrity *standard* liga o veredito ("app genuíno
   em aparelho íntegro *agora*") ao SPKI informado por `requestHash`, mas **não prova a origem em
   hardware da chave**: essa garantia foi **retirada do V1** (IR-121-02, estratégia B da revisão);
   Key Attestation fica como *tier* opcional, com requisitos fechados na Seção 4.5. O servidor valida
   e devolve `installation_id` + **token de sessão opaco** de vida curta. Nenhum segredo vai no
   cliente.
2. **Transporte nativo (IR-121-01).** `installation_id`, token, chave e `Idempotency-Key` ficam no
   **plugin nativo**; o JavaScript **nunca** os vê. O plugin faz a chamada autenticada ao gateway e
   devolve ao WebView só a resposta sanitizada. O bearer não entra em `localStorage`, IndexedDB,
   `PersistedState`, backup JSON nem na memória do JS — e, como o caminho nativo não passa por CORS, o
   preflight **não** é ampliado (Seção 7.5).
3. **Renovação sem broker barato.** Android: cada renovação exige um Play Integrity *novo* (ligado a
   challenge + instalação + SPKI) **e** prova de posse da chave; iOS: uma *assertion* por renovação.
   A atestação continua **fora** de cada chamada do Assistente (custaria cota Google, latência e
   dependência de disponibilidade).
4. **Atestação não é autenticação**: ela prova "app genuíno em aparelho genuíno", não "quem" — o
   Firebase App Check separa explicitamente "atestação do app" de "autenticação do usuário" e a
   Apple trata o App Attest como sinal de risco, não como garantia `[OFICIAL]`. O controle real é a
   **quota por instalação no servidor**; a atestação só torna cada unidade de quota escassa (um
   aparelho físico) em vez de grátis (curl).
5. **Estado** (challenge com claim atômico, sessão, quota, revogação, idempotência) em **Redis
   serverless** (Upstash via Vercel Marketplace) atrás de uma porta `GuardStore` substituível;
   **nenhum dado de saúde, treino ou nutrição** vai para o servidor; Postgres/Supabase só quando
   existir conta (GOAL-36 da Fase 8). Cada tipo de estado tem **análise de perda própria** (Seção 9.1);
   `EVICTION = OFF` e `AUTO_UPGRADE = OFF`; falha de store, de storage ou de config em enforcement
   fecha **só o Assistente**. A configuração de enforcement tem **piso de segurança versionado no
   deploy** que nem o store remoto nem a perda dele reduzem (IR-121-04, Seção 12).
6. **Camadas e força da quota.** Cap OpenRouter (global, último recurso) → Firewall por IP (rajada,
   por região) → quota lógica por instalação (chamadas/dia UTC e mês) → pacing diário do orçamento
   global. **A quota da R3 é `SOFT`**: ela limita o uso, mas não impede que o mesmo aparelho genuíno
   gere nova chave → novo enrollment → novo `installation_id` → nova quota; a proteção financeira
   real é pacing + cap, com *enrollment budgets*, pool de instalações novas e `recentDeviceActivity`
   como pré-requisitos da R3. Quota `STRONG` só com memória de dispositivo (R4) — IR-121-03. Retentativas
   com resultado incerto usam o *outcome* `unknown` e nunca disparam segunda chamada paga (IR-121-06).
   **Números de quota não são escolhidos aqui**: saem da telemetria da fase R1.

**Fica bloqueado por gates humanos** (Seção 13/14): emenda ao `CLAUDE.md` (que hoje proíbe
backend e Supabase), autorização do store, conta Play Console + projeto Google Cloud, Apple
Developer Program (iOS), plano Vercel (Hobby é *não comercial* [OFICIAL]), a política do canal web
(hoje anônimo e não atestável) e, só para a quota `STRONG`, a aprovação do *beta* de device recall.

**Rollout seguro:** R0 governança → R1 enrollment opcional + telemetria + transporte nativo (sem
bloquear ninguém) → R2 enforcement de atestação (shadow → enforce, com piso versionado e compat para
builds antigos) → R3 quota `SOFT` com anti-enrollment mínimo → R4 endurecimento (quota `STRONG`, iOS,
tiers, conta, Key Attestation opcional).

**Revisão independente:** a **R1** foi feita por revisor externo ao executor (GPT-5.6 Sol / OpenAI) e
registrada no PR #55: `CHANGES_REQUIRED` (P0 = 0, P1 = 4, P2 = 4, P3 = 0). Esta revisão do documento
aplica as correções IR-121-01..08 nas seções canônicas (não em errata); a **R2** é a re-revisão
pendente. `INDEPENDENT_REVIEW_RESULT = R1_CHANGES_APPLIED_PENDING_R2` e
`READY_FOR_AUTH_IMPLEMENTATION_GOAL = PENDING_INDEPENDENT_REREVIEW` (Seção 15).

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
  (`isAllowedPreflight`, `:159-166`). Um Bearer token no `fetch` do WebView exigiria mudar este contrato; o
  desenho **não** faz isso (IR-121-01): o token viaja só no transporte nativo, sem CORS, e a rota rejeita
  `Authorization` acompanhado de `Origin` (F-121-05).

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
- **Transporte atual = `fetch` do WebView (JS).** O alvo troca por um **transporte nativo** (Seção 7.5): o
  cliente ganha uma porta `AssistantTransport` e o JS deixa de montar qualquer cabeçalho de autenticação.

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
| INSTALLATION_ID | **servidor**, após atestação | alta no iOS (chave em hardware atestada pela Apple); no Android, chave do Keystore **sem** prova de origem em hardware + atestado a cada renovação | até reinstall/restore/limpeza/revogação | store do servidor + armazenamento **nativo seguro** (fora do WebView, do JS e do backup) | identidade de pessoa; dado exportável |
| DEVICE_ID (sync, GOAL-38) | cliente | nenhuma | do app | dados de sync | quota ou autorização (é gerado no cliente e viaja em backup/nuvem) |
| Sinais de dispositivo da plataforma (DeviceCheck bits, App Attest métrica, Play `deviceRecall` — **beta, exige aprovação**) | Apple/Google | alta | sobrevive a reinstall (por desenho da plataforma) | Apple/Google | rastreio/fingerprint (ToS do Play proíbe) |
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
  ou atestação → o alvo exige **plugin nativo próprio** (Kotlin/Swift) que guarda as credenciais e faz
  o transporte autenticado (7.5) — **não** delegar isso a plugin de terceiros (dependência nova; U-09).
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
| F-121-03 | P2 | 429 do Firewall é opaco ao app nativo (sem ACAO/`Retry-After`, envelope diferente) → UI diz "inalcançável" (`[PROD]` cabeçalhos; WebView `[INFERÊNCIA]`). No transporte nativo o 429 é legível (não há CORS): resolvido nos builds novos, segue opaco nos legados |
| F-121-04 | P2 | Código de falha novo → `undefined` na UI dos builds já distribuídos (switch sem default) → regra de compat obrigatória (Seção 11) |
| F-121-05 | P2 | Preflight só aceita `Content-Type`; `Authorization` → 403 (`[PROD]`). **Não será liberado** (IR-121-01): o bearer viaja só no transporte nativo, sem CORS; a rota rejeita `Authorization` acompanhado de `Origin` |
| F-121-06 | P2 | `allowBackup="true"` sem regras de extração: identidade guardada no diretório de dados do app pode ser clonada |
| F-121-07 | P1 se ficar aberto | Canal web same-origin não é atestável e continua anônimo após enforcement nativo → decisão D-AUTH-03 |
| F-121-08 | P2 | "Login"/`premiumStatus` são locais e forjáveis; nada do estado atual serve de identidade |
| F-121-09 | P3 | Hobby: logs de runtime de **1 h** (sem forense retroativa), uso **não comercial**, 1 regra de RL e sem chave por cabeçalho |
| F-121-10 | P2 | Warm-up do Play Integrity *standard* conta na cota diária de 10.000 → proibido aquecer a cada abertura do app |
| F-121-11 | P3 | ToS do Play Integrity proíbe fingerprint/rastreio de dispositivos/usuários → uso restrito a abuse prevention |
| F-121-12 | P2 | Privacy Manifest/Data Safety já defasados (D-NUT-09 `PENDING`) e ficam mais com `installation_id` |
| F-121-13 | P2 | Sem plugin de secure storage/atestação: dependência nativa nova (código + supply chain); o plugin passa a fazer o **transporte autenticado**, então precisa de superfície mínima (sem URL/cabeçalhos arbitrários, sem `getToken`) para não virar proxy HTTP genérico |
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
2. **Registro da decisão** em `docs/DECISOES.md` (D-AUTH-01..10, Seção 14).
3. **Autorização por item de custo/conta** (Seção 13) — este documento não autoriza nada.
4. **Atualização de D-NUT-09 / Data Safety / App Privacy** antes de expor a fase R1 a testers fora
   do time (Seção 10).

Opções de governança, com a recomendação:

| | O que autoriza | Prós | Contras |
|---|---|---|---|
| **G-A — exceção "AI-Guard" (recomendada)** | só o subsistema de abuse prevention do Assistente: atestação, sessão opaca, quota, estado em store nomeado (Redis; sem dado de saúde); sem contas, sem Supabase, sem dado de saúde no servidor | mínimo necessário; **compatível com D17** (Supabase segue como backend de contas/dados; `GuardStore` permite consolidar em Postgres no GOAL-36); não abre o Gate G4 | segundo fornecedor (Redis) até a Fase 8 |
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
descrito **nesta revisão do documento** (pós-R1). Nenhuma linha atual é P0 **porque o cap de
US$ 5/mês está ativo** (F-121-02 mostra a fragilidade desse fato).

### 3.2 As 15 ameaças pedidas + 13 adicionais

| ID | Ameaça | Atual | Controle-alvo (fase) | Residual |
|---|---|---|---|---|
| T01 | **Chamada direta por curl/bot** (sem `Origin`) | **P1** — alcança o pipeline (`[PROD]`); cap+Firewall só contêm o dano | token de sessão obrigatório (R2) + quota `SOFT` por instalação com *enrollment budgets* e pool de instalações novas (R3); cada unidade de quota exige uma instalação atestada | **P2** |
| T02 | **Reutilização do bundle** (origem Production pública no APK/`out/`) | **P1** (mesmo caminho de T01); **sem segredo a extrair** — `SECRET_EXPOSURE=NO` | não existe segredo estático no cliente; a credencial nasce da atestação e vive no plugin nativo | **P3** |
| T03 | **Spoof de `Origin`** | **P1** (ausente/forjado passam; CORS é do navegador) | `Origin` vira só defesa em profundidade contra páginas de navegador; nunca decide acesso. Requisição com `Authorization` **e** `Origin` → 403 (o bearer só existe no transporte nativo); `/api/ai/v1/*` rejeita `Origin` | **P3** |
| T04 | **Replay de token** | n/a | token opaco de TTL curto e rotacionado; challenge com claim atômico `verifying → used` (Seção 7.1); contador de assertion (iOS); prova de posse; revogação instantânea (R1/R2) | **P3** |
| T05 | **Roubo de token** | n/a | **o token nunca entra no JavaScript** (transporte nativo, IR-121-01): armazenamento nativo (Keystore/Keychain) fora do WebView e do backup; TTL curto; a quota por instalação limita o estrago | **P3** (extração exige root/jailbreak, que reprova a atestação na renovação seguinte) |
| T06 | **Instalação clonada** (Auto Backup/D2D, `adb`, cópia de dados) | n/a (não há identidade) | credenciais fora de backup e de WebView; chave não exportável no Keystore/App Attest (**origem em hardware da chave Android NÃO verificada no V1**); prova de posse; **renovação Android exige Play Integrity novo** (um clone fora do aparelho não renova sozinho) | **P2** |
| T07 | **Emulador / root** | **P1** (sem verificação) | Play `MEETS_DEVICE_INTEGRITY` (default) / App Attest; falha → `ATTESTATION_*` honesto (R2) | **P2** — há relatos de módulos que forjam o veredito em aparelhos com root `[NÃO VERIFICADO — U-16]`; a doc oficial manda planejar para chaves de atestação revogadas `[OFICIAL]` → tiers `STRONG`, `recentDeviceActivity`, alertas (R4) |
| T08 | **Abuso distribuído** (frota de aparelhos reais/botnet) | **P1** | quota por instalação + **pacing diário** do orçamento global + pool de instalações novas + limites de enrollment + sinais de plataforma (R3/R4) | **P2** — limitado à fatia diária, não ao mês |
| T09 | **Consumo por usuário legítimo** | — | quota diária/mensal por instalação; `QUOTA_EXCEEDED` honesto com horário de renovação (R3) | **P3** |
| T10 | **Perda/reinstalação/troca de aparelho** | dados locais somem (backup JSON é ortogonal) | novo enrollment; nada local depende do servidor | **P3** (UX); reset de quota por este caminho = T14 |
| T11 | **Import/restore de backup** | o backup v2 não contém identidade (`PersistedState`) | **invariante testada**: sem campos de auth/sessão/quota no estado/backup; import/restore/reset não tocam a instalação | **P3** |
| T12 | **Indisponibilidade Apple/Google** | — | **Android:** sem Google não há renovação — o token válido segue até `exp` e depois responde `ATTESTATION_UNAVAILABLE` (não há renovação só por prova de posse); **iOS:** a *assertion* não chama a Apple. Treino/nutrição locais intactos | **P3** |
| T13 | **Usuário offline** | IA já indisponível (honesto) | nunca tentar atestação offline; `BACKEND_OFFLINE` sem bloquear o app | **P3** |
| T14 | **Reset de quota:** mesmo aparelho genuíno → nova chave → novo enrollment → novo `installation_id` → nova quota (reinstall, limpar dados, ação "apagar dados de IA", perda de chave; **não só reinstall**) | n/a | *enrollment budgets* (global e por IP-hash), **pool de instalações novas** + quota por idade da instalação, gate por `recentDeviceActivity` (Play; pré-requisito de R3), limite de resets da ação do app (o laço via `adb` não passa por ela), pacing + cap. Memória de dispositivo (deviceRecall beta / DeviceCheck + métrica App Attest) só na R4 | **P2** (quota `SOFT` na R3; `STRONG` só na R4) |
| T15 | **Relógio do cliente adulterado** | — | janelas e expirações **só pelo relógio do servidor** (UTC); o cliente só agenda o refresh | **P3** |
| T16 | **DoS de challenge/enrollment/renovação** (queimar 10.000 decodes/dia e comandos do Redis) | n/a | challenge stateless (HMAC, sem escrita na emissão); claim `verifying` limita a **1 decode por challenge**; prova de posse e status da instalação verificados **antes** do decode; limites por IP-hash e por instalação; **fatia da cota de decode reservada às renovações** de instalações existentes; alerta de cota | **P2** |
| T17 | **Vazamento de segredos do gateway** (token REST do Redis, credencial Google, `CHALLENGE_KEY`, `EMERGENCY_KEY`) | só `GYMFLOW_AI_API_KEY` | segredos *Sensitive*, escopo Production, federação OIDC→WIF em vez de chave JSON, rotação documentada, DB de Preview separado; **com escrita no Redis o atacante forja sessões** | **P2** |
| T18 | **Vazamento de privacidade** (IP, installation_id, corpo em log/estado) | logs da plataforma (1 h no Hobby) | nunca logar corpo; IP só como hash rotativo; nada de saúde no store; retenção mínima (Seção 10) | **P3** |
| T19 | **Indisponibilidade, latência ou limite do store; config ausente/ilegível** | — | em enforcement: *fail-closed* **só do Assistente**; **piso de segurança versionado no deploy** (Seção 12); `EVICTION = OFF` → no limite de armazenamento as escritas são rejeitadas e o Assistente fecha; modos `observe/shadow` falham aberto por definição | **P3** |
| T20 | **Rollout quebra testers e builds internos** | — | fases R1→R4, modo `shadow`, override de emergência explícito/temporário/auditado, regra de compat para builds antigos (F-121-04), canal `internal` com sunset | **P2** |
| T21 | **Canal web permanece anônimo** | **P1** se ficar aberto (F-121-07) | D-AUTH-03: padrão **W1** (desligar o Assistente na web Production ao entrar em enforcement) | **P3** com W1 · **P2** com W2 |
| T22 | **Farming de instalações** a partir de 1 aparelho genuíno (laço "limpar dados → abrir → enroll") | n/a | mesmos controles de T14; `recentDeviceActivity` LEVEL_3/4 nega ou limita novos enrollments; pool de instalações novas limita o gasto agregado (efeito colateral aceito: DoS limitado a instalações novas, 8.5); anti-farming forte (R4) | **P2** |
| T23 | **Broker de atestação** (aparelho genuíno comprometido atestando SPKIs de terceiros e distribuindo credenciais renováveis fora do aparelho) | n/a | **sem prova de origem em hardware da chave no V1** (IR-121-02): o `requestHash` liga o veredito ao SPKI, não à origem da chave; por isso cada renovação Android exige Play Integrity **novo**, ligado a challenge + instalação + SPKI + prova de posse, e é limitada por `recentDeviceActivity` (LEVEL_4 → negar; LEVEL_3 → limitar), por taxa de renovação por instalação e por pacing. Key Attestation (tier `android_hw`, Seção 4.5) só concede renovação por prova de posse depois de cumprir todos os requisitos | **P2** |
| T24 | **Chave OpenRouter rotacionada sem cap / cap removido** | **P1** (processo, F-121-02) | `CAP_GUARD`: gateway lê `GET /api/v1/key` e **recusa operar** se `limit` for `null` ou acima do máximo configurado; runbook de rotação | **P3** |
| T25 | **JS/WebView comprometido** (XSS, biblioteca de terceiros) usando o canal autenticado | n/a | o JS **não exfiltra** credencial (não a possui) e o plugin tem superfície mínima (sem URL/cabeçalhos arbitrários; corpo JSON ≤ 16 KiB; sem `getToken`); o pior caso é gastar a quota da instalação, que é limitada (Seção 7.5) | **P3** |
| T26 | **Config, kill-switch ou store degradados abrindo a proteção em silêncio** | n/a | piso versionado por deploy; store remoto só **aperta**; override de emergência assinado, com validade curta, limite de descida e auditoria; ausente/ilegível/desconhecido → piso (Seção 12) | **P3** |
| T27 | **Retentativa/timeout com outcome incerto no provedor → chamadas pagas duplicadas** | n/a | estados `pending/charged/refunded/unknown`; mesma `Idempotency-Key` **nunca** dispara novo *dispatch* enquanto o estado é `pending/charged/unknown`; estorno só com evidência de falha anterior ao dispatch ou falha comprovadamente não cobrada (Seção 8.4); teto global L0/L3 | **P3** |
| T28 | **Perda parcial ou limite do store** (por tipo de estado) | n/a | análise por estado (sessão, instalação, quota, config, revogação, contador App Attest, idempotência, challenge): nenhuma perda gera gasto ilimitado nem acesso sem atestação (Seção 9.1) | **P3** |

Leitura honesta do resultado: **nenhuma ameaça vai a "resolvida"**; o que o desenho faz é trocar
"acesso grátis e anônimo" por "acesso que custa um aparelho físico atestado por unidade de
quota", com o dano diário limitado por pacing e o mensal pelo cap. Depois da R3 a quota é
**`SOFT`**: o teto financeiro vem do pacing e do cap, não da unicidade da instalação (T14/T22);
residuais P2 = T01, T06, T07, T08, T14, T16, T17, T20, T22 e T23.

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
| Content binding | standard: `requestHash` ≤ 500 bytes, digest (ex. SHA-256) dos parâmetros relevantes; **nunca dado sensível em claro** (fica visível ao app e ao Google); o servidor recomputa e compara. **O `requestHash` liga o token a *valores da requisição*, não prova a origem/hardware desses valores** (por exemplo, de uma chave pública). Classic: `nonce` Base64 URL-safe sem wrap, 16–500 caracteres, ≥ 128 bits recomendado `[PI-standard][PI-classic]` |
| Replay | standard "automaticamente protegido": decifrar o mesmo token de novo devolve vereditos vazios/`UNEVALUATED` `[PI-standard]`. Não cachear vereditos (risco de *proxying*) `[PI-overview]` |
| Decrypt | `POST https://playintegrity.googleapis.com/v1/PACKAGE_NAME:decodeIntegrityToken` com conta de serviço do projeto linkado, escopo `playintegrity` `[PI-standard]`; o servidor deve checar `requestPackageName`, `requestHash`/`nonce` e a **frescura** via `timestampMillis` `[PI-verdicts]` |
| Vereditos **default** | `accountDetails.appLicensingVerdict` (`LICENSED`/`UNLICENSED`/`UNEVALUATED`), `appIntegrity.appRecognitionVerdict` (`PLAY_RECOGNIZED`/`UNRECOGNIZED_VERSION`/`UNEVALUATED`), `deviceIntegrity.deviceRecognitionVerdict` (`MEETS_DEVICE_INTEGRITY` ou vazio: root/hooking/emulador sem integridade Play) `[PI-verdicts]` |
| Vereditos **opt-in** (só com projeto linkado) | `MEETS_BASIC_INTEGRITY`, `MEETS_STRONG_INTEGRITY` (patch de segurança recente), `deviceAttributes.sdkVersion`, `recentDeviceActivity`, `deviceRecall` (**beta**), `appAccessRiskVerdict` (apps que capturam tela/sobrepõem/controlam o aparelho), `playProtectVerdict`. Mudança de respostas vale **imediatamente**, inclusive em produção `[PI-verdicts][PI-setup][PC-help]` |
| `recentDeviceActivity` | nº aproximado de tokens pedidos **por este app neste aparelho na última hora**: LEVEL_1 ≤ 10 · LEVEL_2 11–25 · LEVEL_3 26–50 · LEVEL_4 > 50 (standard; classic tem faixas menores) `[PI-verdicts]` |
| Device recall (**beta**) | 3 bits por aparelho guardados nos servidores do Google, relidos no veredito mesmo após reinstall/reset; escrita por chamada servidor-a-servidor `…/PACKAGE_NAME/deviceRecall:write` com o token (até 14 dias depois), com atraso de propagação de até 30 s e, no standard, atualização no **warm-up**; não funciona em emuladores, exige conta Play **licenciada**, retenção de 3 anos após o último acesso, bits compartilhados entre os apps da mesma conta de desenvolvedor; **para ligar é preciso preencher o formulário de interesse do beta e ser aprovado**; proíbe fingerprint/rastreio; a escrita tem limites próprios `[PI-devicerecall]` |
| Cotas | **10.000 requisições/dia por projeto**: "token requests" (compartilhado entre classic e **preparações/warm-ups do standard**) e **10.000 decryptions** nos servidores Google (compartilhado); aumento só se o app estiver **publicado no Google Play** + projeto linkado + formulário (até 1 semana); rampa gradual `[PI-setup]` |
| Custo | as páginas consultadas **não declaram preço por chamada**; `deviceRecall` beta: "pricing for high-scale usage may apply after general release" `[PI-setup]` (U-02) |
| ToS | **proíbe usar a API para fingerprint/rastrear usuários ou dispositivos**; Google pode reduzir cota se o app deixar de cumprir critérios `[PI-terms]` |
| Erros | retryáveis (`NETWORK_ERROR`, `TOO_MANY_REQUESTS`, `GOOGLE_SERVER_UNAVAILABLE`, `CLIENT_TRANSIENT_ERROR`, `INTERNAL_ERROR`, falha de inicialização): backoff 5 s/10 s/20 s; **após 3 tentativas tratar como falha de integridade**. Não retryáveis: `API_NOT_AVAILABLE`, `PLAY_STORE_NOT_FOUND`, `PLAY_SERVICES_NOT_FOUND`, `APP_NOT_INSTALLED`… A API já aceita requisições sem conta Play autenticada `[PI-errors]` |
| Outage/revogação | "planeje como o backend funciona num outage da API" e "quando chaves de atestação específicas de aparelhos forem revogadas" `[PI-overview]` |
| Teste | publicar na faixa de teste interno + lista de testers; *Protected with Play → Play Integrity → Testing* simula vereditos e erros (`testingDetails` no payload) `[PC-help]` |
| Conta Play | taxa única **US$ 25**, verificação de identidade; contas pessoais novas têm requisitos de teste e de verificação de dispositivo `[GP-signup]` |
| Canais (Firebase) | apps **não publicados no Play não recebem** `PLAY_RECOGNIZED`; `LICENSED` só para quem instalou/atualizou pelo Play; tabela recomendada: *só Play* → exigir ambos; *fora do Play* → não exigir; *ambos* → exigir integridade de dispositivo, não exigir `LICENSED` `[FB-provider]` |

### 4.2 Plano V1 (Android) — estratégia B da revisão R1 (IR-121-02)

**Decisões:** requisições **standard** com `requestHash`; decrypt no Google (gerenciado por ele);
**atestar no enrollment e em TODA renovação do token** (não por chamada do Assistente); *warm-up*
**lazy** (ao abrir o Assistente ou ao precisar renovar, jamais no boot — F-121-10); nenhum uso de
`deviceRecall`/vereditos para fingerprint (F-121-11).

**A chave de instalação é gerada no Keystore** (EC P-256, não exportável; StrongBox/TEE pedidos como
melhor esforço), **mas a origem em hardware dessa chave NÃO é verificada e NÃO é premissa do V1.**
O que o Play Integrity prova é "app genuíno, íntegro, em aparelho íntegro, no instante do pedido, e o
`requestHash` (challenge do servidor + hash do SPKI + instalação + versão) foi montado por esse app".
Para forjar um SPKI alheio um atacante precisa controlar o código do app genuíno em execução (hooking/
root), o que reprova a integridade do aparelho — a não ser que o veredito seja forjado (T07/T23,
residual P2). Por isso a renovação **não** pode depender só da prova de posse:

```
Enrollment (1× por instalação; repete após reinstall/restore/limpeza)
 plugin nativo                                gateway (AI-Guard)                       Google
  ├ gera chave EC P-256 no Keystore (não exportável; StrongBox/TEE se houver)
  ├ POST /challenge {purpose:enroll} ───────► challenge = HMAC-assinado, TTL 5 min, sem escrita
  ├ prepareIntegrityToken(cloudProjectNumber) (lazy)
  ├ requestHash = SHA-256("gf-enroll-v1" ‖ challenge ‖ SPKI ‖ packageName ‖ versionCode)
  ├ standardIntegrityToken.request(requestHash)
  └ POST /enroll {challenge, integrityToken, SPKI, versionCode} ─►
       claim atômico do challenge (verifying) ──► decodeIntegrityToken ─────────────► (decrypt)
       confere requestPackageName + appIntegrity.packageName, requestHash, frescura, veredito
       cria installation_id + registro; emite token opaco ◄──── (challenge → used)

Renovação (a cada expiração do token; sempre online; Android NÃO renova só por prova de posse)
  ├ POST /challenge {purpose:refresh, installationId}
  ├ requestHash = SHA-256("gf-refresh-v1" ‖ challenge ‖ installationId ‖ SPKI-hash ‖ versionCode)
  ├ integrityToken = Play Integrity novo (lazy warm-up)
  ├ popSignature = assina ("gf-pop-v1" ‖ challenge ‖ installationId) com a chave da instalação
  └ POST /token {installationId, challenge, integrityToken, popSignature}
       verifica PoP e status da instalação ANTES de chamar o Google ──► decode ──► novo token
```

**Frequência da renovação (o que "suficiente" significa aqui):** TTL da sessão de **60 min** (proposta;
mesmo valor da Seção 7.1) → toda janela de 60 min de uso exige um veredito **fresco**; um token
roubado vale, no máximo, até `exp`; um *broker* precisa produzir um Play Integrity novo por renovação de
**cada** cliente que ele atende, e cada pedido soma em `recentDeviceActivity` (LEVEL_4 → negar a
renovação; LEVEL_3 → limitar) e na taxa de renovação por instalação.

**Política de veredito V1** (canal `play`; a Seção 12 define `internal`):

| Campo | Exigência | Falha → |
|---|---|---|
| `requestPackageName` e `appIntegrity.packageName` | `== com.gymflowai.app` (os dois: o primeiro pode ser forjado) | `ATTESTATION_FAILED` |
| `requestHash` | igual ao recomputado no servidor (challenge + SPKI/instalação + propósito) | `ATTESTATION_FAILED` |
| `timestampMillis` | frescor ≤ janela curta (proposta técnica: 120 s) | `ATTESTATION_FAILED` |
| `appRecognitionVerdict` | `PLAY_RECOGNIZED` e `certificateSha256Digest` ∈ allowlist (esperado: **assinatura de app do Play**, não a upload key — confirmar em R1, U-01) e `versionCode` ≥ mínimo **e igual ao declarado no corpo** (que entra no `requestHash`) | `ATTESTATION_FAILED` |
| `appLicensingVerdict` | `LICENSED` | `ATTESTATION_FAILED` (remediação `GET_LICENSED`) |
| `deviceRecognitionVerdict` | contém `MEETS_DEVICE_INTEGRITY` | `ATTESTATION_FAILED` (remediação `GET_INTEGRITY`) |
| `recentDeviceActivity` (opt-in; **pré-requisito da R3** no canal `play`) | LEVEL_4 → negar enrollment/renovação (`RATE_LIMITED`, sem queimar quota); LEVEL_3 → só renovação e enrollment com quota de "instalação nova" reduzida | `RATE_LIMITED` |
| opt-in (R4) | `MEETS_STRONG_INTEGRITY` → quota cheia; `appAccessRiskVerdict` controlador → tier reduzido | tiers, não bloqueio |
| erro da API no app | retry 5/10/20 s; 3 falhas → `ATTESTATION_UNAVAILABLE`/`FAILED` (Seção 11) | — |

**O que a implementação nunca faz:** atestar por chamada; cachear veredito; pôr dado do usuário no
`requestHash` (só hash de valores do protocolo); confiar só em `requestPackageName`; aquecer no
boot; usar o veredito como identificador de aparelho; **tratar o Keystore como prova de hardware**.

### 4.3 Comportamento antes de o app estar distribuído pelo Play

| Situação | O que esperar `[OFICIAL]`/`[INFERÊNCIA]` | Política |
|---|---|---|
| APK/AAB **sideload** assinado pela chave interna (estado atual) | não é versão distribuída pelo Play → `appRecognitionVerdict` ≠ `PLAY_RECOGNIZED` (`UNRECOGNIZED_VERSION`/`UNEVALUATED`) e `appLicensingVerdict` ≠ `LICENSED`; o digest só vem se ≠ `UNEVALUATED` (U-01) | **R1 (observe)**: aceitar e registrar; **R2+**: só via canal `internal` (allowlist do digest da chave interna, quota reduzida, `internal_until`) — se o digest não vier, **códigos de tester** de uso único emitidos pelo dono (HMAC) |
| Instalado do Play (Internal Testing, Play App Signing) | elegível a `PLAY_RECOGNIZED`/`LICENSED`; testável no Console | canal `play` completo |
| Produção no Play | cota aumentável; digest = assinatura de app do Play | canal `play`; `internal` removido |

### 4.4 Limites, cota e custo (Android)

Consumo por desenho: **1 decode + 1 token por enrollment e por renovação** (não por chamada do
Assistente). As renovações acompanham as **sessões de IA** (uma por expiração de token, lazy): com
TTL de 60 min, ≤ ~1 decode por hora de uso ativo por instalação; a cota padrão de 10.000
decodes/dia comporta da ordem de 10.000 renovações/dia `[INFERÊNCIA]` antes de precisar do aumento
(que exige o app publicado no Play). **Reserva de cota:** uma fatia dos decodes diários é
reservada às **renovações** de instalações existentes, para que uma tempestade de enrollments (T16)
não derrube quem já está usando. Warm-ups também contam na cota de tokens → lazy. Custo monetário:
nenhum declarado nas páginas consultadas (U-02). Alertas de cota no Cloud Console são recomendados
pela própria doc.

### 4.5 Key Attestation — *tier* opcional `android_hw` (**não é premissa do V1**)

O Play Integrity **não entrega chave por instalação nem prova a origem da chave** (Seção 4.2).
**Key Attestation** prova que uma chave foi gerada dentro de hardware seguro do aparelho e traz o
`package`/digest do app na extensão — poderia (a) fechar T23 e (b) permitir **renovação só por prova
de posse** dentro de `ATTEST_MAX_AGE`, reduzindo a carga no Google e tolerando indisponibilidade dele.
**Fica fora do V1**, por dois motivos oficiais: a própria doc do Google recomenda **a biblioteca de
verificação em Kotlin** ("bem testada, cobre casos de borda que verificadores próprios costumam
perder"), e o gateway é Node na Vercel (sem JVM) — usar a biblioteca exigiria um serviço extra; e um
verificador próprio em TypeScript só é aceitável com a suíte de testes abaixo. **Enquanto os
requisitos da tabela não estiverem cumpridos, nenhuma instalação recebe o *tier* `android_hw` e a
renovação Android segue a Seção 4.2.**

| Requisito | Definição (`[OFICIAL: AK-attest]` salvo indicação) |
|---|---|
| Challenge | `setAttestationChallenge` com o **mesmo challenge HMAC de uso único** do enrollment; o servidor compara o `attestationChallenge` da extensão com o challenge reclamado (estado `verifying`, Seção 7.1) |
| Onde validar | **só no servidor**; a doc proíbe validar no próprio aparelho (um Android comprometido validaria o que não é confiável) |
| Cadeia | cada certificado assina o seguinte; certificados de *Remote Key Provisioning* têm validade curta e **devem** ter a validade checada; chaves de fábrica com certificado expirado (aparelhos anteriores a 2021) continuam confiáveis se fora da CRL e com raiz de subject `SERIALNUMBER=f92009e853b6b045` |
| Raiz | **somente** as raízes da lista JSON oficial (a lista muda com o tempo: uma **nova raiz passa a assinar cadeias desde 2026-02-01**). Qualquer outra raiz → o Google **não faz nenhuma afirmação** sobre o hardware → sem *tier* (`play_only`) |
| Revogação | CRL oficial `https://android.googleapis.com/attestation/status` (JSON com `entries` `REVOKED`/`SUSPENDED` por número de série em hex minúsculo; respeitar o `Cache-Control`); revogado/suspenso → sem *tier* |
| Extensão | só a **primeira** ocorrência da extensão na cadeia é confiável (não assumir que está na folha); parse ASN.1 do esquema `KeyDescription` (`[AK-schema]`: `attestationSecurityLevel`, `attestationChallenge`, `origin`, `purpose`, `rootOfTrust`, `osPatchLevel`, `attestationApplicationId`); a extensão *provisioning information* (CBOR) é opcional em cadeias novas |
| Nível de segurança | `attestationSecurityLevel` ∈ {TrustedEnvironment, StrongBox} (StrongBox é o melhor); Software → sem *tier* |
| Propriedades da chave | gerada no aparelho, uso só de assinatura, EC P-256; estado de boot verificado/bootloader travado e *patch level* entram como **degraus de tier**, não como fingerprint |
| Vínculo de app | `attestationApplicationId` (a crença da plataforma sobre quais apps podem usar a chave: `package_infos` com nome/versão e `signature_digests` = SHA-256 dos certificados de assinatura do app) == `com.gymflowai.app` e digest esperado (assinatura de app do Play **ou** chave interna) — também funciona em builds fora do Play (canal `internal`); esquema em `[AK-schema]` |
| Fallback / *tier* | raiz não-Google, nível Software, API < 24, cadeia inválida/revogada/ausente → *tier* **`play_only`**: renovação sempre com Play Integrity novo (Seção 4.2), sem prova de posse isolada e sem oferta de quota maior |
| Rotação | versionar a lista de raízes e a CRL (cache respeitando `Cache-Control`); falha ao baixar → **falha segura** para `play_only`; alerta |
| Evidências | fixtures de cadeias reais (TEE, StrongBox, software, revogada, raiz desconhecida) e os **vetores de teste da biblioteca Kotlin oficial**; nenhum verificador próprio é ligado sem essa suíte e revisão independente (Apêndice E, U-19) |
| Privacidade | **proibido** usar os campos de *ID attestation* (`attestationIdSerial`, `attestationIdImei`, `attestationIdMeid`, `attestationIdBrand/Device/Product`), o `uniqueId` (identifica o aparelho por 30 dias) ou guardar cadeias de certificados; extrair só `{security_level, app_id_ok, key_props_ok, boot_ok, patch_bucket}` e persistir apenas `key_proof = hw_attested\|none`. Key Attestation **não** pode virar fingerprint (a ToS do Play proíbe rastrear dispositivos) |

### 4.6 Não verificado (Android)

U-01 (vereditos/digest para build interno e para Internal Testing com Play App Signing) ·
U-02 (billing/preço no projeto Cloud) · U-03 (Auto Backup incluir `app_webview/`) · U-10 (requisito
mínimo do Console para obter token) · U-13 (aprovação e disponibilidade do beta de device recall) ·
U-19 (cobertura de Key Attestation nos aparelhos-alvo e escolha do verificador) — todos observáveis
em R1, antes de qualquer enforcement.

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
instalação e exigir novo enrollment (sinal de cópia). Uma atestação reapresentada (replay de `/enroll`)
encontra a chave já registrada → **409 `KEY_ALREADY_ENROLLED`, sem token** (7.6). As chamadas ao gateway
(`/challenge`, `/enroll`, `/token` e o Assistente) saem do plugin Swift (`URLSession` efêmero), nunca do
`fetch` do WebView (7.5).

### 5.3 Simulator e desenvolvimento

`isSupported=false` no Simulator (U-05) → o app cai em `ATTESTATION_UNAVAILABLE`. Caminho de dev:
modo `off/observe` no servidor e *debug enrollment* **apenas em ambientes não-Production**
(segredo só no ambiente de dev; nunca em bundle de release). Sandbox é o padrão sem entitlement;
builds via TestFlight/App Store ignoram o entitlement e usam produção.

### 5.4 Estado exigido no servidor (iOS)

Por instalação: `key_id`, chave pública, `counter`, `receipt` (e o renovado), `env`
(sandbox/prod), `bundle_version`, `validation_category`, `last_attested_at`; índice
`pubkey → installation_id`. DeviceCheck (2 bits) e a métrica de fraude ficam **nos servidores da
Apple** — memória de dispositivo que sobrevive a reinstall sem nós guardarmos dado de identificação direta.

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
| **Segurança** | frescor máximo por chamada, mas **Android não tem identidade estável** (o Play Integrity não dá chave por instalação) → quota por instalação impossível; sem revogação granular | identidade = chave da instalação (**iOS: em hardware, atestada pela Apple; Android: no Keystore, origem em hardware NÃO verificada no V1** — IR-121-02) + atestado do servidor a cada renovação; sessão curta e revogável, com transporte nativo (token fora do JS); quota por instalação, `SOFT` até haver memória de dispositivo. Fracos: novo enrollment no mesmo aparelho, veredito forjado e *broker* de atestação (T07/T14/T22/T23; mitigados, não eliminados) | a mais forte **se** houver atestação; conta sem atestação é barata de forjar (signup farming). Quota por conta sobrevive a reinstall | mesma base de atestação, **gerenciada**; o token é do **app** (`sub` = App ID), **não identifica instalação/usuário**; sem `deviceRecall`/`recentDeviceActivity`/receipt; replay protection é beta (só Node Admin SDK, +1 round-trip) |
| **Custo** | 1 decode Google por chamada: a cota de **10.000 decryptions/dia** vira o teto de chamadas de IA do app inteiro | sem preço declarado para Play/Apple; Redis no free tier; contas Play (US$ 25) e Apple (US$ 99/ano) já são necessárias para distribuir; Vercel Pro (US$ 20/mês) se comercial | Supabase Pro US$ 25/mês (free pausa em 1 semana, sem backups) + Apple Developer para Sign-In + provedor de OTP | App Check "sem custo, sujeito a cotas do provedor de atestação"; projeto Firebase; ainda paga o store da quota |
| **Complexidade** | baixa no servidor, mas plugin em toda requisição | **média-alta**: plugin nativo (Kotlin+Swift) **com transporte autenticado**, verificador App Attest (CBOR/X.509), decode Play, store com piso de config, 4 endpoints, telemetria; Key Attestation (ASN.1/CRL) só como *tier* opcional | **muito alta**: Auth, OTP/OAuth, recuperação, exclusão de conta (políticas das lojas), LGPD, RLS | média: sem verificador próprio, mas SDKs Firebase no app (BoM/pods), plugin de terceiros, **e** ainda instalação+store+quota |
| **Offline** | pior: toda chamada exige Play/Apple online | token em cache até `exp`; **renovação: Android exige Play Integrity novo (online); iOS usa *assertion* local (sem Apple)**; atestação só quando o usuário usa a IA, online | convidado offline ok, IA exige login (ou cai em B para convidado) | TTL 30 min–7 d configurável; SDK faz cache |
| **Reset / reinstalação** | sem identidade → sem memória | nova instalação = quota nova (`SOFT`): contida por *budgets* de enrollment, pool de instalações novas, `recentDeviceActivity` e pacing (R3); memória de dispositivo só na R4 (T14/T22) | quota por conta persiste (melhor) | sem sinais de plataforma extras (pior) |
| **Suporte** | sem id para investigar/revogar | `installation_id` opaco permite revogar e investigar sem dado de identificação direta | conta + e-mail (melhor) | painel Firebase para App Check |
| **Privacidade** | sem ID persistente (vantagem) | ID de instalação e chave pública/`key_id` (identificadores persistentes: tratar como dado de dispositivo/**potencial dado pessoal** até parecer jurídico; "Device or other IDs"/"Device ID"), sem dado de identificação direta nem saúde | PII (e-mail), exclusão de conta, LGPD | **Firebase installation ID** (exemplo literal da definição do Play) + terceiro adicional |
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
   gastaria a cota de 10.000 decodes/dia por chamada. B usa a atestação no enrollment e em **cada
   renovação** (não por chamada do Assistente) e ancora a instalação numa chave — **no iOS provada em
   hardware pela Apple; no Android, não** (a origem em hardware só seria provada pelo *tier* opcional de
   Key Attestation, Seção 4.5).
4. **Nenhum dado de identificação direta (nome/e-mail) e nenhum dado de saúde no servidor**; existem
   identificadores persistentes (`installation_id`, chave pública/`key_id`), tratados como potencial dado
   pessoal → expansão mínima e explícita do D-NUT-09.
5. **C entra por cima sem retrabalho:** `account_id` vira coluna/campo da instalação e a quota
   passa a `account_id ?? installation_id` (Seção 8), sem invalidar B.
6. **D é o plano B do *verificador*, não da arquitetura:** o `AttestationVerifier` fica atrás de
   uma interface; se a revisão independente do verificador App Attest próprio achar P0/P1 não
   fechável, ou a manutenção for inaceitável, troca-se por App Check **sem** mexer em token,
   quota nem store (mas com a perda de sinais e o custo de privacidade da tabela).
7. **A revisão R1 não mudou a escolha:** os quatro P1 (fronteira do token, prova da chave Android,
   anti-farming, config fail-safe) foram corrigidos **dentro** de B (Seções 7.5, 4.2/4.5, 8.5, 12.1);
   nenhum demonstrou incompatibilidade real com B.

Trade-off assumido: B exige mais código próprio (plugin nativo com transporte + verificador) que D ou que
"não fazer nada". O retorno é o único controle que limita uso por identidade.

---

## 7. Token e sessão

### 7.1 Contrato

Sessão **opaca** (não JWT). Justificativa em 7.2. Quem guarda e quem usa o token: **só o plugin
nativo** (7.5).

| Aspecto | Contrato proposto |
|---|---|
| **Emissão** | só após *enrollment* (atestação válida) ou *renovação*. **Android:** toda renovação exige Play Integrity **novo** + prova de posse; **iOS:** uma *assertion* por renovação (prova de posse + integridade, sem chamar a Apple). Resposta: `{installationId, token, expiresAt, refreshAfter, attestationLevel}` — consumida pelo plugin, **nunca** devolvida ao JS |
| **Formato** | `gfat1_` + 43 caracteres Base64url (256 bits do CSPRNG do servidor); prefixo fixo para *secret scanning* e versionamento |
| **No servidor** | chave = `SHA-256(token)`; o token em claro **nunca** é persistido nem logado. Sem *pepper*: a entropia de 256 bits basta |
| **TTL** | proposta técnica inicial **60 min** (o App Check usa 1 h por padrão, configurável de 30 min a 7 dias `[OFICIAL]`); `refreshAfter` = 50% do TTL. **É também a frequência mínima de reatestação no Android** (IR-121-02). Parâmetro, ajustável pela telemetria |
| **`ATTEST_MAX_AGE`** | **Android: 0** — toda renovação reatesta; renovação só por prova de posse existiria apenas no *tier* opcional `android_hw` (Seção 4.5), depois de cumprir todos os requisitos. **iOS:** não se aplica (a *assertion* já é a prova a cada renovação) |
| **Renovação** | `POST /token` com challenge novo; **rotação** a cada renovação (o token anterior fica válido por uma *grace* curta, ~30 s, para requisições em voo, e depois é invalidado); **limitada por instalação/hora** (contador) para que uma instalação válida não vire fonte de carga; `single-flight` no plugin |
| **Binding** | token ↔ `installation_id` ↔ chave da instalação (`key_thumbprint`) ↔ `attest_level` ↔ `policy_ver`. **Não** ligado a IP (redes móveis trocam de IP) |
| **Claims** (campos do registro server-side, não legíveis pelo cliente) | `installation_id`, `platform`, `channel` (`play`\|`internal`), `attest_level` (`play_device`\|`play_strong`\|`appattest`\|`internal_code`), `key_proof` (`none`\|`hw_attested`; hoje sempre `none` no Android), `app_version`, `iat`, `exp`, `policy_ver`, `epoch`, `created_at`, `probation_until` |
| **Assinatura** | não se aplica: o que impede forjar é entropia + *lookup* no store |
| **Rotação de segredos** | não há chave de assinatura de sessão. Há dois segredos de servidor com propósitos separados: `CHALLENGE_KEY` (HMAC dos challenges, `kid` de 1 byte → rotação sem downtime; a chave anterior é aceita por ≤ 10 min) e `EMERGENCY_KEY` (assina o override de emergência, Seção 12; nunca usada no caminho normal) |
| **Revogação** | instantânea: `status=revoked` **e** `epoch++` na instalação, mais a *denylist* por hash da chave pública (`gd:deny:*`, sobrevive ao apagamento do registro). Toda chamada lê o registro (já necessário para a quota). Revogação em massa: subir `policy_ver` mínimo / `global_epoch` |
| **Replay** | (a) **challenge de uso único com máquina de estados** `verifying → used` e *claim* atômico **antes** da chamada externa (7.6); (b) `counter` iOS por *compare-and-set* atômico; (c) Play: decrypt repetido do mesmo token devolve vereditos vazios + `requestHash` amarrado ao challenge; (d) sessão vale até `exp` e rotaciona |
| **No app** | **nativo seguro e fora do JS** (7.5). Android: chave no Keystore; `installation_id` e token cifrados com chave do Keystore, em `getNoBackupFilesDir()` **e** excluídos por `dataExtractionRules` (API 31+) e `fullBackupContent` (≤ 30). iOS: Keychain (`keyId`, `installation_id`, token; classe `…ThisDeviceOnly`, U-17). **Nunca** em `localStorage`/IndexedDB/`PersistedState`/backup JSON/memória do JS |
| **Segredo no cliente** | **nenhum**. O app só guarda material gerado no aparelho (chave não exportável) e credenciais curtas emitidas pelo servidor, dentro do plugin |
| **Transporte** | `Authorization: Bearer <token>` **injetado pelo plugin nativo**; o JS nunca monta esse cabeçalho. O preflight **não** é ampliado; a rota rejeita `Authorization` acompanhado de `Origin`; token nunca em URL/query |

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
| Reinstall / limpar dados | novo enrollment; a memória de dispositivo (T14) só existe com deviceRecall/DeviceCheck (R4) — antes disso vale a contenção por *budgets* e pool |
| Clone de dados em aparelho com root | a chave é não exportável **no nível do Keystore** (origem em hardware não verificada no Android); o clone **não renova sozinho** — precisa de um Play Integrity novo ligado a challenge + instalação + SPKI; token copiado vale só até `exp` e gasta a quota da **mesma** instalação |
| Regressão de `counter` (iOS) | revogar a instalação e exigir novo enrollment (sinal de cópia) |
| Backup JSON / import / reset lógico | **sem efeito** na instalação, sessão ou quota |
| "Apagar meus dados de IA" (opcional, Seção 10) | remove a instalação (no máximo 1×/dia por instalação; conta como reset em T14); deixa *tombstone* mínimo se a decisão jurídica permitir |

### 7.4 Segredos de servidor introduzidos (nenhum no cliente)

| Segredo | Para quê | Onde fica | Rotação / observação |
|---|---|---|---|
| Token REST do Redis (escrita) | `GuardStore` | env Production da Vercel (*Sensitive*); Preview/Dev com outro banco | pelo painel do provedor; par somente-leitura para telemetria. **Com escrita no Redis o atacante forja sessões** (T17) |
| `CHALLENGE_KEY` | HMAC dos challenges | env Production (*Sensitive*) | `kid` de 1 byte; vazamento tem impacto baixo (challenges já são obtidos de graça) |
| `EMERGENCY_KEY` | assinatura do override de emergência (IR-121-04) | env Production (*Sensitive*) e no **script de operador** | separa "poder afrouxar" da credencial de escrita do Redis; rotação por deploy |
| Credencial Google para `decodeIntegrityToken` | decrypt do veredito | preferir **OIDC da Vercel → Workload Identity Federation** (sem chave estática, disponível em todos os planos `[OFICIAL]`); alternativa: chave JSON de conta de serviço em env *Sensitive* | WIF: nada a rotacionar; SA: rotação manual |
| Chave DeviceCheck `.p8` (opcional, R4) | métrica de fraude / 2 bits | env *Sensitive* | portal Apple (U-11) |
| `GYMFLOW_AI_API_KEY` (**já existe**) | OpenRouter | env *Sensitive* | ao rotacionar, **reaplicar o cap** (F-121-02) — o `CAP_GUARD` recusa operar sem ele |

Não existe rota pública de administração: revogação/inspeção manual e o override de emergência são
feitos por **script de operador** (fora do bundle) com a credencial de escrita guardada fora do app.

### 7.5 Fronteira JS ↔ nativo: o transporte autenticado é nativo (IR-121-01)

**Decisão:** o plugin nativo (`GymflowAiGuard`, nome de trabalho) guarda `installation_id`, token, chave
e material criptográfico e **executa a chamada autenticada** ao gateway; o JS só envia o corpo do
pedido e recebe o resultado sanitizado. Expor o token ao JS **não** é o desenho: seria mudança de
*threat model* (XSS ou biblioteca comprometida passaria a *exfiltrar* uma credencial utilizável fora
do aparelho até `exp`) e teria de ser reavaliada na próxima revisão.

**Quem guarda o quê:**

| Elemento | Onde vive | Visível ao JS? |
|---|---|---|
| `installation_id`, token de sessão, chave de prova de posse (Keystore/App Attest), `Idempotency-Key` | plugin e armazenamento nativo (7.1) | **Não** |
| origem do gateway (`PRODUCTION_BACKEND_ORIGIN`) e caminhos permitidos | constantes compiladas no nativo; o plugin **ignora** qualquer URL vinda do JS | a origem pública já é conhecida do JS; irrelevante |
| corpo do pedido do Assistente (contexto nutricional mínimo, ≤ 16 KiB) | JS → plugin | Sim (já é dado do JS) |
| resposta (proposta *grounded* ou falha) | plugin → JS, **sanitizada** | Sim |
| `requestId` (opaco, só para cancelar) | gerado no JS; sem valor de segurança | Sim |

**Superfície do plugin (mínima; nada de proxy HTTP genérico):**

- `assistant.request({ requestId, body, timeoutMs? }) → resultado`;
- `assistant.cancel({ requestId })`;
- `guard.status() → { supported, enrolled }` (booleanos; sem ids);
- `guard.resetInstallation()` ("apagar meus dados de IA"; limitado, D-AUTH-06);
- **não existem** `getToken`, `getInstallationId`, `http(url, headers)` nem qualquer chamada que
  devolva credencial ou aceite URL/cabeçalho arbitrário; o corpo precisa ser um objeto JSON.

**Sanitização da resposta** (feita no nativo): só `Content-Type: application/json`, corpo ≤ 64 KiB;
*allowlist* de chaves de topo (`status`, `proposal`, `code`, `message`, `retryAfterSeconds`,
`resetsAt`, `scope`, `meta.quota`); strings ≤ 2 KiB; **nunca** devolve cabeçalhos, cookies nem o corpo
cru de erros de infraestrutura (resposta não-JSON vira um envelope de falha sintetizado: 429 →
`RATE_LIMITED`, erro de rede → `BACKEND_OFFLINE`, o resto → `INVALID_RESPONSE`). O cliente TS continua
validando (`isFailureResult`) e o *grounding* segue no JS — defesa em profundidade.

**Android:** plugin Kotlin; transporte por `HttpsURLConnection` (sem dependência nova), configuração
de rede padrão do sistema (sem CA de usuário, sem *cleartext*), timeouts de conexão/leitura próprios
(o teto do JS não basta se o WebView for suspenso); credenciais em `getNoBackupFilesDir()`, cifradas
com chave do Keystore e **excluídas** de Auto Backup/D2D (`dataExtractionRules` + `fullBackupContent`).

**iOS:** plugin Swift; `URLSession` com configuração **efêmera** (sem cookies/cache), ATS satisfeito
(HTTPS); `keyId`, `installation_id` e token no Keychain (`…ThisDeviceOnly`, U-17); renovação em
*single-flight* para não inverter o contador de *assertions*.

**Migração do `fetch` do WebView atual:** o cliente ganha uma **porta de transporte**
(`AssistantTransport`) com duas implementações — `WebFetchTransport` (o comportamento de hoje: web
same-origin e builds legados) e `NativeGuardTransport` (plugin). `resolveAssistantEndpoint` escolhe
pelo ambiente (`Capacitor.isNativePlatform()` **e** plugin disponível). Ordem de entrega na R1:
(1) *forward-compat* dos códigos de falha; (2) refatoração para a porta de transporte **sem mudar
comportamento**; (3) plugin + `NativeGuardTransport` atrás de *flag*; (4) `AUTH_MODE=observe` com token
opcional. Builds legados seguem no `fetch` do WebView até o *sunset* (D-AUTH-08).

**CORS durante a compatibilidade:** **nenhuma mudança** — a allowlist de origens e a lista de
cabeçalhos do preflight (`Content-Type`) ficam como estão; `Authorization` continua rejeitado no
preflight (é o comportamento desejado: nenhuma página nem JS do WebView pode usar o bearer).
Consequências: (a) as chamadas do plugin não têm `Origin` (não são de navegador); (b) `/api/ai/v1/*`
**rejeita** qualquer requisição com `Origin` (403) e não expõe CORS; (c) o gateway rejeita
`Authorization` **acompanhado de** `Origin` (403); (d) requisição sem token de build legado segue a
regra de compat da Seção 11.

**Erros e cancelamento:**

1. `AbortSignal` do JS → `cancel(requestId)` → o nativo aborta a conexão e resolve o `request` pendente
   com a falha de cancelamento (mapeada como hoje: `PROVIDER_TIMEOUT`; o modal já ignora o resultado
   quando o *controller* foi abortado);
2. o nativo aplica o próprio timeout (15 s = 12 s do provedor + 3 s) mesmo com o JS suspenso;
3. `401 TOKEN_EXPIRED` → o plugin renova uma vez (*single-flight*) e reenvia com a **mesma**
   `Idempotency-Key` (Seção 8.4); falha na renovação → `ATTESTATION_*`;
4. HTTP com envelope JSON do gateway → repassa sanitizado; **429 do Firewall (não-JSON) →
   `RATE_LIMITED`, legível no nativo** (não há CORS) — resolve F-121-03 nos builds novos;
5. erro de rede/DNS/TLS → `BACKEND_OFFLINE`.

**Offline:** o plugin só age quando o usuário aciona o Assistente; sem rede `request` responde
`BACKEND_OFFLINE` no *connect timeout* (sem fila, sem *background*, sem atestação offline); token
expirado sem rede → `BACKEND_OFFLINE` (não `ATTESTATION_*`); treino e nutrição locais não passam
pelo plugin.

**Testabilidade (exigida no GOAL de implementação):**

1. **TS:** testes com um plugin falso injetado na porta de transporte (o `fetchImpl` injetável de hoje
   vira `transport`); teste de contrato: o tipo do resultado não tem campo de credencial; **gate
   estático** — teste que varre `src/` e `out/` e falha se algum JS monta `Authorization` para o gateway
   ou contém o prefixo `gfat1_`;
2. **Nativo:** JUnit/XCTest com servidor local — injeção de cabeçalhos, *allowlist* de sanitização,
   corpo > 64 KiB, não-JSON, `401 → renovação → reenvio com a mesma chave`, 429 opaco → `RATE_LIMITED`,
   timeout, cancelamento e ausência de `getToken`;
3. **Aparelho real (Galaxy S22):** captura de rede prova que o WebView **não** chama
   `/api/nutrition/assistant` nos builds novos; dump de `localStorage`/IndexedDB/backup JSON depois do
   uso **sem** `gfat1_`; backup excluído;
4. o teste de contrato do `PersistedState` (T11) continua valendo.

**Alternativa rejeitada:** expor o token ao JS **em memória** (`Authorization` via `fetch`). Exigiria
ampliar o preflight, deixaria XSS/biblioteca comprometida exfiltrar um bearer válido por até `exp` e
quebraria a invariante "nunca em WebView". Só seria reconsiderada como mudança explícita de *threat
model*, reavaliada na próxima revisão.

### 7.6 Challenge: estados, falhas e retentativa (IR-121-05)

Um challenge é um valor **stateless** (HMAC com `kid`, `iat`, `purpose`, `platform`, 16 bytes
aleatórios, `installationId?`; TTL de emissão 5 min; **emitir não escreve no store**). O estado só
existe quando o challenge chega a um `/enroll` ou `/token`: chave `gd:chal:{rand}` com dois valores,
`V:{claimId}` (*verifying*) e `U` (*used*), manipulada **só por scripts atômicos** no líder do store:

| Operação | Pré-condição | Efeito | Retorno |
|---|---|---|---|
| `claim(rand)` | chave ausente | `SET V:{claimId} NX PX 45000` | `CLAIMED` — segue para a verificação externa |
| `claim(rand)` | valor `U` | — | `USED` → 403 `ATTESTATION_FAILED` (challenge reusado) |
| `claim(rand)` | valor `V:*` | — | `IN_PROGRESS` → 409 `CHALLENGE_IN_PROGRESS` (o cliente pede outro challenge: são grátis) |
| `complete(rand, claimId)` | valor `V:{claimId}` | `SET U PX (validade restante do challenge + folga de 5 min)` | `DONE` — **só agora** cria/atualiza instalação e emite token |
| `complete(rand, claimId)` | valor ≠ `V:{claimId}` (claim expirou/perdido) | — | `LOST` → **não emite token**; 503 `ATTESTATION_UNAVAILABLE`, cliente pega novo challenge |
| `release(rand, claimId)` | valor `V:{claimId}` (falha **transitória**) | `DEL` | `RELEASED` — o cliente pode retentar com o **mesmo** challenge dentro do TTL |
| `burn(rand, claimId)` | valor `V:{claimId}` (falha **definitiva**) | `SET U` | 403 `ATTESTATION_FAILED` |

- **Transitória** = Google 5xx/`GOOGLE_SERVER_UNAVAILABLE`, timeout do decode, 429 da cota de decode, erro do
  store: `release` + 503 `ATTESTATION_UNAVAILABLE` com `retryAfterSeconds`; o plugin faz *backoff*
  5/10/20 s (≤ 3) e reusa o challenge enquanto ele não expirar.
- **Definitiva** = veredito reprovado, `requestHash` divergente, prova de posse inválida, chave/versão
  fora da política: `burn` (o challenge não vira oráculo de tentativas).
- **Crash entre `verifying` e `used`:** o claim expira em 45 s e o challenge volta a poder ser
  reclamado dentro do TTL de 5 min. É seguro: (i) um token Play reapresentado devolve vereditos vazios
  no segundo decode (proteção do Google) → falha; (ii) uma atestação iOS reapresentada encontra a chave
  já registrada → **409 `KEY_ALREADY_ENROLLED`, sem emitir token** (o enrollment é idempotente por chave
  pública: `gd:pk:{sha256}` com `SET NX`); (iii) o cliente legítimo que perdeu a resposta recupera pela
  **renovação** (Android: Play Integrity novo + prova de posse; iOS: *assertion*), identificando a instalação por `keyThumbprint` (Apêndice B) — nunca
  por replay do enrollment.
- **Limite de custo:** no máximo **1 decode Google por challenge** (o claim é atômico e vem antes da
  chamada externa), e a prova de posse/status da instalação é conferida **antes** do decode (T16).

---

## 8. Quota com estado

### 8.1 O que limitar

| Dimensão | Decisão |
|---|---|
| **Chamadas** | **unidade primária**: propostas do Assistente por instalação por **dia UTC** e por **mês UTC**. Reserva **atômica antes** de chamar o provedor; **estorno só com evidência** (8.4) |
| **Custo / tokens** | **secundário**. O custo por chamada é limitado por contrato (corpo ≤ 16 KiB, `max_tokens` 1200, timeout 12 s), logo `chamadas × custo_máx` já limita o gasto. O custo real (tokens/US$ do `usage`) alimenta o **pacing global** e, se a telemetria mostrar variância grande, um 2º contador por instalação (U-08) |
| **Concorrência** | 1 requisição em voo por instalação (lock com TTL 30 s) |
| **Janela** | dia/mês **UTC do servidor**; a UI mostra `resetsAt` no horário local; o relógio do cliente nunca conta |
| **Sujeito** | V1: **instalação**. Com conta (GOAL-36): `quota_subject = account_id ?? installation_id` + teto de instalações por conta. A quota é da conta; a instalação segue como âncora de atestação |
| **Idade da instalação** | instalação nova nasce em ***probation*** (quota reduzida `q0` que cresce com a idade até `PROBATION_AGE`) e consome de um **pool diário compartilhado** das instalações em *probation* (8.5) |
| **Tiers** | sem números: `internal` (reduzida, com sunset), `play_device`, `play_strong`/`appattest`, multiplicados pela fase de *probation*. A razão entre tiers e os valores absolutos vêm da telemetria (D-AUTH-07) |
| **Força** | rótulo explícito **`QUOTA_STRENGTH ∈ {SOFT, STRONG}`** (8.5): a R3 entrega `SOFT`; `STRONG` só com memória de dispositivo na R4 |

### 8.2 Como os números serão obtidos (nenhum número comercial escolhido aqui)

1. **R1** registra, sem bloquear, chamadas/dia por instalação, custo por chamada (`usage` do provedor,
   U-08), **novos enrollments/dia**, distribuição de `recentDeviceActivity` e idade das instalações.
2. `cap_diário_por_instalação = min( p99_chamadas_dia × margem ,  orçamento_diário_por_instalação / custo_p95_por_chamada )`
   com `orçamento_diário_por_instalação = (limite_mensal_autorizado × fração_para_usuários) / (dias_do_mês × instalações_ativas_p95)`.
3. Parâmetros anti-enrollment **sem valor definido aqui** (saem da telemetria; D-AUTH-07): `q0` e
   `PROBATION_AGE`, tamanho do **pool de instalações novas**, *budget* global de novos enrollments/dia,
   *budget* de enrollments por IP-hash/hora, teto de `unknown`/dia, limite de resets.
4. `margem`, `fração_para_usuários` e o limite mensal são **decisão do dono** (D-AUTH-07). O
   documento não os fixa.
5. Se `instalações_ativas × cap_diário × custo_p95 × dias > limite_mensal`, o desenho não fecha por
   construção → reduzir o cap ou pedir mais orçamento (autorização humana). O **pacing global**
   impede que o mês estoure mesmo assim.

### 8.3 Três camadas e o pacing: como interagem

| Camada | Escopo | Unidade | Quem aplica | Falha | O app vê |
|---|---|---|---|---|---|
| **L0** teto financeiro OpenRouter | global | US$/mês | OpenRouter (chave) | *fail-closed* para todos | `OPENROUTER_BUDGET_EXHAUSTED` (do `402` com `limit_source=openrouter_key_limit`) |
| **L1** rate limit por IP (Vercel) | IP × região | req/60 s | Firewall, **antes** da função | 429 opaco (legível no transporte nativo) | `RATE_LIMITED` |
| **L2** quota lógica | instalação (→ conta) | chamadas/dia e mês, 1 em voo, pool de instalações novas | função + Redis | 429 JSON `QUOTA_EXCEEDED` + `resetsAt` | idem |
| **L3** pacing global diário + `CAP_GUARD` | global | US$/dia via `GET /api/v1/key` (cache 60 s) | função | 503 JSON `OPENROUTER_BUDGET_EXHAUSTED` (`scope: daily`) | idem |

**Ordem por chamada:** Firewall (L1) → `Origin` e teto de corpo → **token e registro da instalação**
(401/403 antes de qualquer trabalho) → validação estrita do corpo e gates clínicos (400/403/409,
**sem consumir quota**) → registro de idempotência + concorrência → **reserva L2** → **pacing L3 +
`CAP_GUARD`** → *marca `dispatched`* → provedor (L0 é a rede final) → `charged`, `refunded` ou
`unknown` (8.4).

Regras de interação:

- **L0 nunca é o mecanismo normal.** O pacing L3 fecha o *dia* antes de o *mês* estourar; L0
  existe para bug ou bypass. **L0 e L3 usam o `usage` do próprio provedor como verdade externa**:
  nenhuma perda ou erro de contagem no Redis (8.4, 9.1) rompe o teto.
- **L1 não substitui L2.** O Firewall vê IP (CGNAT de operadora junta vários usuários; contadores
  por região) e não vê a instalação. **Com L2 ativa, o limite de IP deve ser reavaliado**
  (afrouxado ou mantido só como backstop): decisão humana, e o Hobby só permite 1 regra.
- **L2 não protege contra frota de aparelhos nem contra novo enrollment no mesmo aparelho** — por isso
  L3 limita o dano diário, L0 o mensal e o pool/budgets de 8.5 limitam o gasto agregado de instalações
  novas.
- **`CAP_GUARD`:** se `GET /key` mostra `limit = null` (chave sem teto) ou `limit` acima do máximo
  configurado, o gateway trata como indisponível e alerta. Cobre F-121-02/T24.

### 8.4 Idempotência, *outcome* incerto e estorno (IR-121-06)

**Princípio:** um *timeout* do gateway **não prova** que o provedor não processou nem cobrou a
chamada. Estorno lógico só com **evidência** de falha anterior ao *dispatch* ou de falha
comprovadamente não cobrada; o resto é `unknown` e **mantém** a unidade de quota. A idempotência é
**contabilidade**, não *replay* de resposta: **nenhum corpo de pedido ou resposta é guardado**.

Registro `gd:idem:{installation}:{key}` (TTL 15 min, superior ao horizonte de retentativa) com
`state ∈ {pending, charged, refunded, unknown}`, `dispatched` (0/1), `t_reserve`, `t_dispatch`,
`attempts`. A `Idempotency-Key` é gerada **pelo plugin** por ação do usuário e só é reusada nas
retentativas automáticas do próprio plugin dentro da mesma ação (por exemplo, depois da renovação
silenciosa do token, Seção 7.5); uma nova tentativa do usuário usa **outra** chave.

| Evento | Evidência | *Outcome* | Quota | Provedor de novo com a mesma chave? |
|---|---|---|---|---|
| falha **antes** do *dispatch* (validação, token, config/guard, `CAP_GUARD`, lock) | `dispatched = 0` | `refunded` | estorna | sim |
| provedor `2xx` com corpo válido | resposta completa | `charged` | mantém | **não** |
| provedor `2xx` com corpo inválido/acima do teto | o provedor respondeu (custo incorrido) | `charged` | mantém | **não** |
| provedor `402` com `error.metadata.limit_source` (`openrouter_key_limit`, `openrouter_credits`, `in_flight_budget_exhausted`) | rejeição por **limite/crédito**, documentada; o `in_flight_budget_exhausted` é "rejected … before it reaches a provider" `[OFICIAL]` | `refunded` | estorna | sim (após `Retry-After` quando houver) |
| provedor `429` ("Rate limit exceeded") | rejeição por limite de taxa, não processada `[INFERÊNCIA; U-20]` | `refunded` | estorna | sim (após espera) |
| provedor `4xx` de contrato (400/401/403/404) | erro do provedor, sem execução | `refunded` | estorna | sim (≤ 2 tentativas) |
| provedor `5xx` | *dispatch* feito, resultado incerto | **`unknown`** | mantém | **não** |
| *timeout*/*abort*/erro de rede **depois** do *dispatch* | incerto | **`unknown`** | mantém | **não** |
| crash da função entre *dispatch* e *commit* | `pending` com `dispatched = 1` e idade ≥ `DISPATCH_GRACE` (proposta: 60 s) | **`unknown`** (por leitura) | mantém | **não** |

**Mesma `Idempotency-Key`:** `pending` → 409 `REQUEST_IN_PROGRESS`; `charged` → 409
`ALREADY_PROCESSED` (a resposta não é guardada; o usuário refaz com nova chave); `unknown` → 409
`OUTCOME_UNKNOWN` (**sem nova chamada paga**; a nova ação do usuário é uma nova solicitação, com
nova reserva); `refunded` → nova reserva, no máximo 2 tentativas por chave. Nada disso dispara
segunda chamada ao provedor enquanto o estado é `pending/charged/unknown`.

**Como reconciliar o incerto sem guardar corpo/resposta:** (1) contadores **agregados** de `unknown`
(global e por instalação, por dia); (2) comparação diária de `Σ(charged + unknown) × custo_p95` com o
`usage_daily` do OpenRouter (`GET /api/v1/key`) → métrica de *drift* `recon.drift`; (3) teto de `unknown`
por instalação/dia — passou dele, a instalação fica `degraded` (quota reduzida), não banida; (4) se a
medição em R1 provar que uma classe (por exemplo, `5xx`) **nunca** é cobrada, ela só passa de `unknown`
para `refunded` **com a evidência registrada neste documento** (U-20). O teto global OpenRouter
(L0/L3) **não** depende dessa contabilidade.

### 8.5 Reset de quota e anti-farming: a força da quota (IR-121-03)

**O vetor (não é só reinstall):** o mesmo aparelho genuíno **gera nova chave** (limpar dados, reinstalar,
"apagar meus dados de IA", perda/descarte da chave), faz **novo enrollment** (1 Play Integrity + 1 decode),
recebe **novo `installation_id`** e, com ele, **nova quota**. Um laço com `adb`/acessibilidade faz isso
sem root e sem reprovar a integridade do aparelho. A atestação sozinha **não** impede: ela só torna cada
enrollment um pedido a um aparelho real.

| Controle | Efeito | Fase | Plataforma |
|---|---|---|---|
| *Budget* global de novos enrollments/dia | teto do nº de instalações novas | **R3 (pré-requisito)** | ambas |
| *Budget* de enrollments por IP-hash/hora | freia o laço a partir de uma rede (CGNAT: valor folgado; falso positivo → `RATE_LIMITED`) | **R3** | ambas |
| Quota por idade (*probation*, `q0` crescente) | a soma de instalações frescas rende pouco | **R3** | ambas |
| **Pool diário compartilhado das instalações em *probation*** | teto **agregado** do gasto de instalações novas, seja qual for o nº delas | **R3** | ambas |
| Gate por `recentDeviceActivity` | LEVEL_3/4 nega ou limita novos enrollments e renovações (o laço acima aparece como tokens/hora no aparelho) | **R3** (canal `play`; exige projeto linkado) | Android |
| Limite de resets | "apagar meus dados de IA" no máximo 1×/dia por instalação. **Cobre só a ação do app**: o laço via `adb`/limpar dados não passa por ela (quem o freia são os *budgets*, o pool e `recentDeviceActivity`) | **R3** | ambas |
| Pacing L3 + cap L0 | teto financeiro diário e mensal | **R3** | ambas |
| deviceRecall (beta): contador de enrollments por aparelho/mês em 3 bits | **memória de dispositivo** que sobrevive a reinstall e a nova chave; nega/limita "aparelho repetido" | **R4** (exige aprovação do beta) | Android |
| DeviceCheck (2 bits) + métrica de fraude do App Attest (chaves atestadas em 30 dias) | idem | **R4** (exige Apple Developer e chave DeviceCheck) | iOS |

**`QUOTA_STRENGTH`:**

- **`SOFT` (R3):** a quota por instalação é **justiça entre usuários e freio de uso pesado**, **não** um
  anti-farming forte. O gasto agregado de instalações novas é limitado pelo pool e pelos *budgets*; o
  gasto total, por pacing + cap. **A R3 não declara** "uma quota por aparelho". Todo texto de produto,
  telemetria e documentação diz `SOFT`.
- **`STRONG` (R4):** só quando a memória de dispositivo estiver ativa **e** o vetor acima tiver sido
  reproduzido num aparelho real e contido (critério de saída da R4, Seção 12).

**Efeito colateral do pool (aceito):** um atacante que gaste o pool do dia impede que **instalações novas
legítimas** usem o Assistente até `resetsAt` (quem já saiu da *probation* não é afetado). É um DoS limitado
a usuários novos e é preferível a gasto ilimitado; a UI mostra `QUOTA_EXCEEDED` com
`scope: new-installation-pool` e o horário (Seção 11); o tamanho do pool é parâmetro de D-AUTH-07 e a
telemetria da R1 mostra quantos enrollments legítimos por dia ele precisa comportar.

Severidade residual: T14/T22 permanecem **P2** na R3 (contidos por pool, *budgets*, sinais de plataforma,
pacing e cap); só a R4 justifica reavaliar.

---

## 9. Storage

### 9.1 Estado necessário e análise de perda **por tipo** (IR-121-07)

O documento **não** trata o store inteiro como "tolerante a perda": a tolerância é decidida **por tipo
de estado**, com o que cada perda ou indisponibilidade significa para a segurança.

| Estado | Para quê | Se for perdido ou ficar indisponível | Por que é seguro / limite do dano | Exigência |
|---|---|---|---|---|
| **Sessão** (`gd:tok:*`) | autorizar chamadas | tokens deixam de valer; os clientes renovam (Android: Play Integrity novo) | *fail-safe*: token sem registro **não vale** | TTL = `exp` |
| **Instalação e índice de chave** (`gd:inst:*`, `gd:pk:*`) | identidade, PoP, tier, *probation* | as instalações refazem o enrollment; sem `gd:pk` a mesma chave pode virar "instalação nova" (quota nova) | sem atestação não há acesso; o efeito equivale a *farming* (T14/T22) e é contido por *budgets*, pool, pacing e cap | leitura por chave; `SET NX` no índice |
| **Quota** (contadores dia/mês, pool, *budgets*, estorno, `unknown`, em voo) | limitar uso | zera **uma vez**: janela de quota fresca | o teto financeiro **não** vem do Redis: L3/L0 usam o `usage` do próprio provedor como verdade externa | incremento **atômico** com TTL |
| **Config de enforcement** (`gd:cfg`, `gd:emergency`) | tightening/override | ausente ou ilegível → **piso do deploy** (nunca abaixo, Seção 12) | *fail-safe*: o piso é versionado no deploy, fora do store | leitura barata, cache de 30 s |
| **Revogação** (`status` da instalação e `gd:deny:*`) | bloquear instalação/chave | instalação/chave revogada pode reenrolar até a denylist ser reimportada | exige atestação e passa pelos limites de enrollment; **degradação limitada (P3)** | denylist por hash da chave pública, **exportada periodicamente por script** para arquivo privado do dono e reimportável |
| **Contador App Attest** (`counter` da instalação iOS) | sinal de clone/replay | contador some ou regride: `assertion` antiga só valeria com o challenge de uso único (já expirado) | replay já falha por challenge; perde-se o sinal de clone até o próximo `assertion` válido, que vira o novo *baseline* + alerta | CAS atômico |
| **Idempotência** (`gd:idem:*`) | não cobrar/dispatchar em dobro | uma retentativa com a mesma chave pode fazer 2ª chamada paga dentro da janela | dano de **1 chamada**, limitado por L0/L3 | só estados de contabilidade, **nunca** corpo/resposta (8.4) |
| **Challenge** (`gd:chal:*`) | uso único | um challenge pode ser reclamado de novo dentro do TTL de 5 min | Play: 2º decode devolve vereditos vazios; iOS: 409 `KEY_ALREADY_ENROLLED` sem token (7.6) | claim/complete por script atômico |
| **Métricas e auditoria** | telemetria, forense de config | perde-se histórico | nenhum efeito de segurança | TTL 90 d / 30 d |

Conclusão da análise: **nenhuma perda gera gasto ilimitado nem acesso sem atestação.** O que existe é
(a) re-enrollment dos clientes, (b) reset de quota **uma vez**, (c) reabilitação temporária de chaves
revogadas até a reimportação e (d) possível 2ª chamada paga numa retentativa — todos limitados por
L0/L3 (que não dependem do Redis). O que **precisa** de durabilidade acima do que o *free tier*
garante (a denylist e a auditoria) fica coberto por **export periódico por script do operador**, não
por promessa do fornecedor; se a perda destes for inaceitável, o caminho é plano pago ou Postgres.

### 9.2 Alternativas realistas

| | **Upstash Redis** (Marketplace) | Neon Postgres (Marketplace) | Supabase (Postgres+Auth) | Firebase (Firestore + App Check) | Vercel Blob / Global Config |
|---|---|---|---|---|---|
| **Custo inicial** | US$ 0 no free | US$ 0 no free | US$ 0 no free; **Pro US$ 25/mês** | App Check sem custo; Firestore com quotas free (ver página de preços — não detalhado) | Blob: arquivos; Global Config: flags |
| **Free tier `[OFICIAL]`** | 256 MB, **500 mil comandos/mês**, 10 GB de banda; até 10 bancos free; **sem Prod Pack**; pay-as-you-go US$ 0,20/100 mil comandos com *budget cap* | 100 CU-h/mês e 0,5 GB por projeto; **scale-to-zero** quando inativo; sem cartão | projetos free **pausam após 1 semana sem uso**, 2 ativos, **sem backups automáticos** | — | — |
| **Latência** | REST/HTTP; medir a partir de `iad1` (U-14) | *cold start* após inatividade; medir | via PostgREST/pooler; medir | — | Global Config: leituras <1 ms/99% <10 ms, **escrita em segundos** (não serve para contadores) |
| **Durabilidade e disponibilidade** | **persistência sempre ligada** (cada escrita vai para memória **e** para o *block storage* do provedor de nuvem; reload após crash) `[UP-durability]`; **replicação extra só nos planos pagos**; **SLA, multi-zone HA e criptografia em repouso só com Prod Pack, que não se compra no free** `[UP-pricing][UP-replication]` | conforme plano | Pro | — | — |
| **Consistência** | planos replicados: **eventual** entre réplicas, causal por conexão `[UP-consistency]`; free = instância única (o desenho não depende disso, 9.3) | ACID | ACID | — | — |
| **Limites e cobrança automática** | **eviction desligada por padrão: no limite de armazenamento as escritas são rejeitadas**; com eviction ligada removem-se chaves aleatórias, inclusive sem TTL; **Auto Upgrade** (opt-in) troca o plano sozinho ao bater limites `[UP-eviction][UP-autoupgrade]` | conforme plano | conforme plano | — | — |
| **Operação** | mínima: 1 par de credenciais injetado pela Marketplace | migrações/schema, driver serverless | migrações, RLS, service role | SDK Admin + conta de serviço | — |
| **Lock-in** | baixo (protocolo Redis) | baixo (Postgres) | médio (Auth/RLS/Storage) | alto | Vercel |
| **Backup** | recurso de *backup/restore* existe (imediato e diário, retenção de 1 ou 3 dias) `[UP-backup]`; **disponibilidade por plano não confirmada** (U-06) | janela de *instant restore* por plano | Pro: diário, 7 dias | Google | — |
| **Migração** | export por `SCAN`; contadores/sessões não precisam migrar | padrão | padrão | difícil | — |
| **Fit para o AI-Guard** | **ótimo** com a config exigida (9.3): `SET NX`, scripts atômicos, TTL nativo | bom para instalação/audit; pesado para contadores quentes | **coerente com D17/Fase 8**, mas exige abrir o Gate G4 e Pro para produção | só se a opção D for escolhida | **não** (Blob = arquivos; Global Config = flags) |

Descartadas sem detalhe: **Cloudflare (KV/D1/Durable Objects)** — segunda plataforma de execução;
**self-hosted** — carga operacional inadequada; **memória da função** — stateless e multi-instância.
Marketplace Storage está disponível em **todos os planos**, e a Vercel recomenda hospedar o banco
na região da função (`iad1`) `[OFICIAL]`.

### 9.3 Recomendação e configuração exigida

**V1: Upstash Redis (Vercel Marketplace), região `us-east-1` (co-localizado com a função `iad1`),
atrás de uma porta `GuardStore`.** Operações da porta (todas atômicas, sem `GET` solto para decisão de
segurança): `claimChallenge`/`completeChallenge`/`releaseChallenge`/`burnChallenge`,
`getInstallation`/`putInstallation` (com `SET NX` no índice de chave), `putSession`/`getSession`,
`revokeInstallation`/`denylist`, `reserveQuota`/`commitQuota`/`refundQuota`, `idem.reserve`/
`idem.markDispatched`/`idem.settle(outcome)`, `acquireInFlight`/`releaseInFlight`, `getConfig`,
`getEmergency`, `bump`, `audit`. Motivos: operações nativas para exatamente este estado (uso único,
contadores atômicos, TTL); custo zero no início; sem dado de identificação direta nem saúde; e a porta
permite mover a instalação para Postgres quando houver conta.

**Configuração de segurança do banco (exigida, verificada no provisionamento, U-06):**

| Configuração | Valor | Por quê `[OFICIAL]` |
|---|---|---|
| **Eviction** | **OFF** (é o padrão) | com eviction ligada, ao atingir o limite o Upstash remove chaves por amostragem aleatória, priorizando as com TTL **e depois** as sem TTL — chaves de segurança podem sumir. Desligada, as **escritas são rejeitadas** e o Assistente fecha (falha segura) |
| **Auto Upgrade** | **OFF** (é opt-in) salvo autorização humana explícita | ligado, o banco sobe de plano **sozinho** ao bater limites de banda/armazenamento: custo sem autorização |
| ***Budget*** (se PAY-AS-YOU-GO) | ligado, com teto definido pelo dono | o banco fica com taxa limitada ao atingir o teto; o custo não passa dele |
| Credenciais | RW só no env Production; par somente-leitura para telemetria; **outro banco** para Preview/Dev (até 10 bancos free) | limita o raio de dano (T17) |
| Região | `us-east-1` | co-localização com a função `iad1` |

**Falha de storage e de comandos = fail-closed só do Assistente.** Qualquer erro do store —
indisponibilidade, latência acima do teto, escrita rejeitada por limite de armazenamento, limite de
comandos do plano — em `enforce` responde 503 `PROVIDER_UNAVAILABLE` (mensagem honesta) **sem tocar em
treino/nutrição locais**; em `observe/shadow` falha aberto com métrica. O comportamento exato do free
ao exceder 500 mil comandos/mês não está nas páginas lidas (U-06) e por isso é tratado como falha do
store.

**Consistência:** a doc oficial descreve replicação líder-seguidor com consistência **eventual** entre
réplicas nos planos replicados (causal só por conexão). Toda decisão de segurança que depende de estado
recém-escrito — claim de challenge, token recém-emitido, revogação, quota, idempotência — roda em
**script/comando de escrita processado pelo líder**, nunca em leitura simples de réplica. O free é uma
instância única, mas o desenho não pode depender disso ao mudar de plano (U-21).

- **Custo de comandos (aritmética ilustrativa):** ~10 comandos por chamada de IA (token+instalação,
  idempotência, quota+pool, lock, marcação de *dispatch*, liquidação) → 500 mil comandos/mês ≈ 50 mil
  chamadas/mês no free; enrollment/renovação ≈ 4–6 comandos. O teto real de chamadas é o cap de
  US$ 5, bem menor. A contagem exata de `EVAL` no faturamento não foi verificada (U-06).
- **Aceitos:** free **sem** SLA, **sem** replicação extra e **sem** Prod Pack — por isso a análise de
  perda por tipo (9.1) e o export da denylist.
- **Quando trocar:** instalação/auditoria que exijam durabilidade e relatórios, ou conta (GOAL-36) →
  Postgres (Neon ou o Supabase do D17). A porta isola o gateway dessa troca.

---

## 10. Privacidade e dados

### 10.1 Dados novos

| Dado | Onde | Finalidade | Retenção proposta | Observação |
|---|---|---|---|---|
| `installation_id` (aleatório, 128 bits) | Redis + armazenamento nativo seguro | quota, revogação, suporte | enquanto ativa; **GC após N dias sem uso** (proposta 180) | "Device or other IDs" (Play, análogo ao *Firebase installation ID* da definição) / "Device ID" (Apple); **identificador persistente: tratar como potencial dado pessoal até o parecer jurídico** |
| Chave pública / `key_id` (iOS) / hash do SPKI (Android) | Redis (e `denylist` por hash da chave pública) | prova de posse; revogação | igual à instalação (a `denylist` pode durar mais: D-AUTH-06) | **não contém** nome, e-mail nem conteúdo de saúde, mas é **identificador criptográfico persistente** ligado à instalação/aparelho: tratar como **dado de dispositivo / potencial dado pessoal** até o parecer jurídico. **Nenhuma conclusão LGPD aqui** |
| Resultado da atestação: `attest_level`, canal, `app_version`, `last_attested_at` | Redis | política e tiers | igual | **não** armazenar token cru nem JSON completo do veredito |
| Receipt Apple (+ métrica de fraude) | Redis | consulta de fraude | vida do receipt (renovável) | — |
| Contadores de quota, pool e *budgets* de enrollment, sessão (hash + metadados), lock e registro de idempotência (**só estados**, sem corpo) | Redis | operação | 48 h / 40 d / `exp` / 30 s (lock) / 15 min (idempotência) | — |
| IP | **não gravado em claro**; HMAC com sal diário só para os limitadores de challenge/enrollment (rajada: TTL 2 min; *budget* por hora: TTL 2 h) | anti-abuso | 2 min / 2 h | a Vercel já vê o IP na borda/Firewall e nos logs (1 h no Hobby) |
| Métricas agregadas (por dia/evento, sem ID) | Redis | telemetria R1 | 90 d | — |
| Eventos de auditoria (tipo + `installation_id` + instante) e de config/emergência (`cfg.change`, `emergency.on/off`; sem dado de identificação direta, mas com identificador persistente) | Redis (opcional) | investigação | 30 d (D-AUTH-06) | — |
| **Não armazenados** | — | — | — | corpo/resposta do Assistente, metas, dados de saúde/treino/nutrição, e-mail, nome, IDs de anúncio/hardware, token de sessão em claro (só o SHA-256), veredito/atestação completos, cadeias de certificados e campos de *ID attestation* do Android |

### 10.2 Impacto por documento (mapeamento factual — **não** é parecer jurídico)

| Documento | Hoje | Com o AI-Guard |
|---|---|---|
| **Data Safety (Play)** | proposta pendente: contexto nutricional transmitido só ao usar o Assistente (D-NUT-09 `PENDING`) | acrescenta **"Device or other IDs"**: coletado (persistido → **não efêmero**), finalidade prevenção de fraude/segurança/funcionalidade; Vercel/Upstash como *service providers* só se processarem em nome do desenvolvedor (decisão jurídica); criptografia em trânsito: sim; **exclusão**: precisa de caminho ou justificativa. A ToS do Play Integrity proíbe fingerprint/rastreio |
| **App Privacy (Apple)** | `NSPrivacyCollectedDataTypes` vazio | candidato **Device ID**, finalidade *App Functionality* (prevenir fraude/segurança), sem *tracking*; se é "vinculado" ao usuário é decisão humana (a Apple presume vínculo por conta/dispositivo). O `PrivacyInfo.xcprivacy` deixa de ser vazio. Preferir Keychain a `UserDefaults` (este exige declaração de *required reason API*; U-17) |
| **D-NUT-09** (`GYMFLOW_NUTRITION_LEGAL_DOSSIER_D_NUT_09.md` §5/§7) | "sem banco de nutrição; logs da plataforma com IP/caminho/status" | passa a existir **store de identidade/quota (sem saúde)**, atestação com Google/Apple, subprocessador novo (Upstash) e região do store. **Atualizar** e levar ao jurídico: LGPD (IP, ID de instalação e chave pública como dado pessoal?), DPA (Vercel, Upstash, Google), transferência internacional (função em `iad1`) |
| **Política de privacidade** | não há política publicada no repositório | precisa descrever identificadores, finalidades, retenção, exclusão, provedores e transferência |

### 10.3 Direito de exclusão × memória anti-abuso

Apagar a instalação zera a quota e abre um vetor de reset. Opções: **(i)** *tombstone* HMAC da
chave pública com TTL curto (base legal a confirmar pelo jurídico) + sinais de plataforma;
**(ii)** tratar "Apagar meus dados de IA" como reset de instalação, aceitando que a quota reinicia
(contido por limite de 1 reset/dia, *budgets* de enrollment, pool de instalações novas, pacing L3 e cap L0 — 8.5). Recomendação técnica: **(ii) + controles de 8.5**, e tombstone só se o
jurídico aprovar (D-AUTH-06). A memória de dispositivo (DeviceCheck, métrica App Attest, `deviceRecall`)
fica com Apple/Google.

---

## 11. Fluxo de erro

Regras invariantes: **honestidade** (nunca fabricar proposta; dizer a causa e o que continua
funcionando) e **nunca bloquear treino/nutrição locais** — o Assistente é um modal opcional; o
estado local não depende do servidor. As chamadas saem do **plugin nativo** (7.5): ele já entrega ao
JS o resultado mapeado nesta tabela.

| Código | Origem | HTTP | Comportamento do app | Texto (pt-BR, proposta) |
|---|---|---|---|---|
| `ATTESTATION_UNAVAILABLE` | plugin: `isSupported=false`, sem Play Store/services, `API_NOT_AVAILABLE`, `PLAY_*_NOT_FOUND`; servidor: Google/Apple fora do ar, `LOST` do challenge | 503 (upstream) | Assistente indisponível; retry automático só p/ transitórios (5/10/20 s, máx. 3), depois manual. **Android sem Google não renova**: o token vale até `exp` | "Este aparelho não consegue verificar o app (Google Play/App Attest indisponível). O Assistente IA não está disponível aqui — o resto do GymFlow funciona normalmente." |
| `ATTESTATION_FAILED` | servidor: veredito reprovado, hash divergente, challenge inválido/expirado/reusado, prova de posse inválida | 403 | não repete em laço; oferece remediação (diálogo Play `GET_INTEGRITY`/`GET_LICENSED`) | "Não foi possível confirmar que este app é autêntico. Instale ou atualize pela loja oficial." |
| `TOKEN_EXPIRED` | servidor | 401 | **silencioso e dentro do plugin**: 1 renovação (*single-flight*) e reenvio com a **mesma** `Idempotency-Key`; se a renovação falhar cai em `ATTESTATION_*` | (sem UI) |
| `TOKEN_REVOKED` | servidor | 403 | limpa a sessão; 1 re-enroll automático (limitado); se revogar de novo, para | "Sessão bloqueada neste aparelho. Tente mais tarde ou fale com o suporte." |
| `QUOTA_EXCEEDED` | servidor (L2) | 429 JSON `{scope: day\|month\|new-installation-pool, resetsAt, retryAfterSeconds}` | não reenvia até `resetsAt` | "Você usou todas as consultas do Assistente IA {hoje/neste mês}. Volta a partir de {hora}. As sugestões offline continuam disponíveis." |
| `RATE_LIMITED` | função (JSON) **ou Firewall** (429 não-JSON, **legível no transporte nativo**; opaco só nos builds legados) ou `recentDeviceActivity` alto | 429 | backoff local (não reenvia de imediato) | "Muitas solicitações em pouco tempo. Aguarde alguns segundos e tente de novo." |
| `OPENROUTER_BUDGET_EXHAUSTED` | pacing L3 ou `402 openrouter_key_limit`; `in_flight_budget_exhausted` (transitório) tratado como `RATE_LIMITED` | 503 JSON `{scope: daily\|monthly}` | não reenvia até `resetsAt` | "O Assistente IA atingiu a capacidade de uso do serviço e volta {quando}. O resto do app não é afetado." |
| `BACKEND_OFFLINE` | plugin: erro de rede/DNS/TLS, *connect timeout*; sem rede não há tentativa de atestação | — | mensagem **neutra** (não afirma que o aparelho está sem internet) | "Sem resposta do servidor do Assistente IA agora. Verifique a conexão e tente de novo." |
| *(guard indisponível)* | servidor em `enforce`: store fora, escrita rejeitada por limite, config ilegível com piso `enforce` (Seção 12.1) | 503 `PROVIDER_UNAVAILABLE` | mesmo tratamento de "IA indisponível"; **só o Assistente fecha** | "O Assistente IA está indisponível no momento. O resto do GymFlow funciona normalmente." |
| `REQUEST_IN_PROGRESS` / `ALREADY_PROCESSED` / `OUTCOME_UNKNOWN` | idempotência (8.4) | 409 | **nunca** dispara nova chamada paga automática; o plugin só reusa a `Idempotency-Key` dentro da mesma ação; nova tentativa do usuário = nova chave | "Esta consulta já foi enviada e o resultado não pôde ser recuperado. Toque em tentar de novo para fazer uma nova consulta." |

Regras de contrato:

- **Compatibilidade com builds antigos (F-121-04):** requisição **sem token** (build legado ou
  bot) recebe **só códigos que os builds atuais já mapeiam**: `503 PROVIDER_UNAVAILABLE` com
  mensagem "Atualize o GymFlow para usar o Assistente IA". Códigos novos só para clientes que
  enviam token ou `X-GymFlow-Client: ai-guard/1`.
- **Primeira entrega da R1:** `aiFailureToUiState` ganha `default` seguro (→ `provider-unavailable`)
  e o cliente passa a ser tolerante a códigos desconhecidos (*forward-compat*), antes de qualquer
  código novo existir no servidor.
- **Mapa HTTP→código:** 401 `TOKEN_MISSING|TOKEN_EXPIRED` · 403 `TOKEN_REVOKED|ATTESTATION_FAILED` ·
  409 `CHALLENGE_IN_PROGRESS|KEY_ALREADY_ENROLLED|REQUEST_IN_PROGRESS|ALREADY_PROCESSED|OUTCOME_UNKNOWN` ·
  429 `QUOTA_EXCEEDED|RATE_LIMITED` · 503 `OPENROUTER_BUDGET_EXHAUSTED|ATTESTATION_UNAVAILABLE|PROVIDER_UNAVAILABLE`.
- **`Retry-After` também no corpo** (`retryAfterSeconds`, `resetsAt`): no caminho legado o WebView só
  lê cabeçalhos listados em `Access-Control-Expose-Headers`; no transporte nativo o plugin lê os
  cabeçalhos e os repassa no envelope sanitizado.
- **Estados de UI novos (proposta):** `quota-exceeded`, `rate-limited`, `attestation-unavailable`,
  `attestation-failed`, `budget-exhausted`, `backend-offline`, `request-conflict`. `TOKEN_*` não geram
  estado.
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

### 12.1 Configuração: piso versionado, store remoto e emergência (IR-121-04)

**Modos** (ordem de rigor crescente): `AUTH_MODE ∈ {off, observe, shadow, enforce}` e
`QUOTA_MODE ∈ {off, shadow, enforce}`. O modo **efetivo** vem de três fontes com **uma** regra de
precedência:

| Fonte | Onde vive | Quem muda | O que pode fazer |
|---|---|---|---|
| **Piso** `AI_GUARD_MIN_AUTH_MODE`, `AI_GUARD_MIN_QUOTA_MODE` | variáveis de ambiente/constantes **versionadas por deploy** (env da Vercel por ambiente + registro no git e em `docs/DECISOES.md`) | deploy (trilha: deployment + commit) | define o **mínimo**; nada em runtime o reduz além do override de emergência limitado |
| **Config remota** `gd:cfg` | store | script de operador (gera evento de auditoria) | **só aperta**: `efetivo = max(piso, gd:cfg)`; valor **abaixo do piso é ignorado** com alerta `cfg.below_floor` |
| **Override de emergência** `gd:emergency` | store, **chave separada** | script de operador com `EMERGENCY_KEY` | **só afrouxa**, dentro dos limites abaixo |

`efetivo = relaxar( max(piso, gd:cfg), override_de_emergência_válido )`, e o piso é **obrigatório**.

**Em Production o piso é obrigatório:** variável ausente, ilegível, valor desconhecido ou erro de parse →
o piso vale **`enforce`** (o mais restritivo), com erro no boot e alerta. A proteção nunca desaparece por
erro de configuração. Em Preview/Development o padrão é `off`.

**Condições que não reduzem a segurança** (efetivo em `enforce`, IR-121-04):

| Condição | Efetivo | Comportamento |
|---|---|---|
| store indisponível, latência acima do teto, escrita rejeitada por limite | `enforce` | *fail-closed* **só do Assistente** (503 `PROVIDER_UNAVAILABLE`); treino/nutrição locais seguem normais |
| `gd:cfg` ausente, ilegível, erro de parse ou valor desconhecido | piso | ignorado + alerta |
| `gd:cfg` abaixo do piso | piso | ignorado + alerta `cfg.below_floor` |
| `gd:emergency` inválido (assinatura, expirado, validade acima do teto, abaixo de `EMERGENCY_MIN`) | sem override | ignorado + alerta |
| variável do piso ausente em Production | `enforce` | como acima |

Em `observe`/`shadow` (piso ainda baixo) essas falhas abrem com métrica — é a definição desses modos.

**Override de emergência (afrouxar):** explícito, temporário, auditado e **separado** do caminho normal:

- chave própria (`gd:emergency`, nunca `gd:cfg`), payload `{mode_auth?, mode_quota?, expires_at, reason, actor, nonce}`
  **assinado por HMAC** com `EMERGENCY_KEY` — segredo distinto da credencial de escrita do Redis: quem
  só tem o acesso ao store **não** consegue afrouxar;
- **validade curta** (teto no código: 4 h; renovar exige novo override assinado), **descida limitada**
  (`AI_GUARD_EMERGENCY_MIN_*` do deploy; em Production nunca abaixo de `shadow` — **nunca `off`**) e no
  máximo 3 ativações por dia;
- **auditoria:** ativação e expiração gravam `emergency.on/off` em `gd:aud:*` e disparam alerta; ao expirar,
  o piso volta sozinho;
- uso previsto: incidente (Google fora do ar bloqueando testers legítimos, bug de política). Afrouxar
  **de forma permanente** = novo deploy com piso menor (caminho normal, revisável).

**Sobre o "kill-switch":** passa a significar *override de emergência* (instantâneo, temporário) **ou**
deploy com piso menor (minutos, permanente). Não existe `AUTH_MODE=off` remoto em Production.

**Mudança de fase:** entrar em `enforce` em Production exige **elevar o piso no deploy** — é critério
de saída da R2b (auth) e da R3 (quota). O `gd:cfg` serve a degraus operacionais e testes (por exemplo
`observe → shadow` sem deploy), **não** é onde o `enforce` "mora": se o store se perder, o efetivo cai no
piso, que já é `enforce`.

### 12.2 Fases

| Fase | Objetivo | Entregas (futuros GOALs) | Entrada | Saída | Rollback |
|---|---|---|---|---|---|
| **R0** governança e pré-requisitos | destravar sem código | emenda do `CLAUDE.md` (Apêndice D); D-AUTH-01..05; gates G-01..G-06; Redis provisionado **com a configuração exigida** (eviction OFF, auto-upgrade OFF; Preview em banco separado); jurídico iniciado | este documento **e a R2 da revisão independente** | decisões assinadas; `READY_FOR_AUTH_IMPLEMENTATION_GOAL` | — |
| **R1** enrollment opcional + telemetria + transporte nativo (**Android primeiro**) | medir sem bloquear | (a) **forward-compat do cliente** (default seguro em `aiFailureToUiState`) num release **antes** de qualquer código novo; (b) porta de transporte no cliente sem mudar comportamento; (c) `GuardStore` + Redis; rotas `challenge`/`enroll`/`token`; (d) plugin nativo Android (Keystore + Play Integrity lazy + **transporte autenticado nativo**, 7.5); (e) piso/`gd:cfg`/emergência implementados e testados (12.1); (f) métricas agregadas; (g) `CAP_GUARD` em modo log; (h) `QUOTA_MODE=shadow` com telemetria de anti-farming (`recentDeviceActivity`, enrollments/dia, idade); (i) exclusão de backup no manifest; (j) Data Safety/D-NUT-09 atualizados **antes de testers externos** | R0 | quase todo tráfego dos builds novos com token válido; distribuição de vereditos conhecida (fecha U-01/U-10); p50/p95/p99 de chamadas/dia/instalação e custo por chamada medidos (U-08, U-20); **gate estático "sem bearer no JS" verde e captura de rede provando que o WebView não chama o gateway nos builds novos**; erros de atestação e cota Google dentro do limite definido pelo dono; **nenhum aumento de erro do Assistente** | piso em `off`/`observe` por deploy, ou override de emergência |
| **R2** enforcement de atestação | exigir token | **2a `shadow`**: calcula "bloquearia" sem bloquear (contadores + cabeçalho de diagnóstico). **2b `enforce`** (Production nativo): token obrigatório; requisição **sem token** → `503 PROVIDER_UNAVAILABLE` "Atualize o GymFlow" (compat, F-121-04); **bucket `legacy`** global pequeno até o *sunset* (D-AUTH-08) — o dano anônimo máximo passa a ser **exatamente o tamanho desse bucket por dia**; canal `internal` (allowlist do digest, ou códigos de tester) com `internal_until`; **canal web conforme D-AUTH-03** (padrão W1: a UI web deixa de oferecer o Assistente — "disponível no app" — e o servidor já recusa requisições sem token) | R1 concluída; testers atualizados; **testes de piso (store fora, config ausente/ilegível/abaixo do piso, emergência inválida) e do override de emergência verdes (em Preview)** | `legacy` = 0 após o sunset; nenhum tester bloqueado; falsos positivos abaixo do limiar; **`AI_GUARD_MIN_AUTH_MODE = enforce` no deploy de Production**; override de emergência exercitado **uma vez em Production** logo depois de elevar o piso (janela curta, sem tester ativo) e revertido | override de emergência (temporário) ou deploy com piso menor |
| **R3** quota **`SOFT`** com anti-enrollment mínimo | limitar por identidade, sem prometer unicidade por aparelho | **pré-requisitos (R3.0):** *budgets* de enrollment (global e por IP-hash), quota por idade + **pool de instalações novas**, gate por `recentDeviceActivity` (Play) e limite de resets (8.5); modelo de *outcome*/estorno (8.4); pacing L3 e `CAP_GUARD` em *enforce*. **Depois:** `QUOTA_MODE=shadow → enforce` com números da telemetria (D-AUTH-07); UI `QUOTA_EXCEEDED`; **reavaliar o limite de IP (L1)**; alertas de orçamento | R2b estável | (1) **o vetor de farming foi reproduzido em aparelho real** (laço "limpar dados → enroll" via `adb`) **e contido**: gasto agregado das instalações novas ≤ pool, enrollments/h limitados por *budget* e `recentDeviceActivity`; (2) usuário legítimo (≤ p95) nunca bloqueado; (3) pacing verificado com orçamento simulado esgotado e L0 intacto; (4) `QUOTA_STRENGTH = SOFT` declarado; (5) **`AI_GUARD_MIN_QUOTA_MODE = enforce` no deploy**. **A R3 não fecha T14/T22.** | `QUOTA_MODE=shadow` por deploy ou override |
| **R4** endurecimento e extensões (cada item com GOAL próprio) | reduzir o residual P2 e **habilitar `QUOTA_STRENGTH = STRONG`** | **anti-farming forte:** deviceRecall (após aprovação do beta; G-12/D-AUTH-09) / DeviceCheck + métrica de fraude do App Attest; iOS App Attest (após Apple Developer); tiers (`MEETS_STRONG_INTEGRITY`, `appAccessRisk`); Key Attestation opcional (4.5, *tier* `android_hw`; D-AUTH-10); prova de posse por requisição; **vínculo com conta (GOAL-36)** e entitlements (GOAL-39); remover canal `internal`; consolidar store em Postgres se preciso | R3 | por item; **`STRONG` só após o vetor de 8.5 ser reproduzido com a memória de dispositivo ativa e contido** (novo enrollment no mesmo aparelho **não** rende quota fresca além da política) | por item |

Regras transversais:

- **Não quebrar builds internos existentes:** em R1 continuam funcionando (token opcional); em R2b
  recebem a mensagem de atualização, com o *bucket* `legacy` cobrindo a janela de transição.
- **Não bloquear testers antes de a infraestrutura estar pronta:** canal `internal` e códigos de
  tester; nenhuma fase liga `enforce` sem `shadow` prévio.
- **Cada mudança de piso ou de override** exige registro em `docs/DECISOES.md` (piso) ou evento de
  auditoria (emergência) e teste do caminho de volta.

### 12.3 Evidências mínimas exigidas nos GOALs de implementação

Vetor de teste oficial da Apple para o verificador de atestação; fixtures de veredito Play (todos os
rótulos/erros); teste de contrato "`PersistedState`/backup não têm campos de auth"; **testes do
transporte nativo (7.5): gate estático sem bearer no JS, JUnit/XCTest, captura de rede e dump de
storage no aparelho**; **testes da máquina de estados do challenge (7.6): `claim` concorrente, `release`,
`burn`, crash entre `verifying` e `used`**; **testes de idempotência/*outcome* (8.4): mesma chave em
`pending/charged/unknown/refunded`, crash após *dispatch*, nenhum 2º *dispatch* sem evidência**; testes de
atomicidade da reserva de quota sob concorrência; **testes do piso e do override de emergência (12.1)**;
**verificação da configuração do Upstash (eviction OFF, auto-upgrade OFF, escritas rejeitadas no limite →
fail-closed)**; **teste do vetor de farming (8.5) em aparelho real**; teste em aparelho real (Galaxy S22) de
Play Integrity, Keystore, backup excluído e 429 legível no nativo (U-03/U-18); `npm run build`, `npm test`,
`tsc` e a auditoria de release verdes; revisão independente por outra família de modelo (R2 e seguintes).

### 12.4 Observabilidade (a Hobby guarda logs de runtime por **1 h** `[OFICIAL]`)

| Métrica (contador/dia, sem identificador de instalação, 90 d) | Uso |
|---|---|
| `enroll.ok/fail.<motivo>`, `refresh.pop/reattest/fail.<motivo>`, `token.reject.<motivo>`, `chal.claim.<estado>` | saúde do enrollment; falsos positivos; estados do challenge |
| `call.ok/quota/budget/provider_error.<classe>`, `outcome.charged/refunded.<motivo>/unknown` | consumo, bloqueios e *outcomes* |
| distribuição de rótulos: `v.device.*`, `v.app.*`, `v.lic.*`, `v.activity.LEVEL_n` | política de vereditos; tiers; U-01; anti-farming |
| `enroll.budget.deny`, `pool.new.exhausted`, `probation.count`, `reset.count` | anti-farming (8.5) |
| `anon.legacy`, `cap.guard.trip`, `counter.regression` | sunset, cap, sinal de clone |
| `cfg.below_floor`, `emergency.on/off`, `store.error.<tipo>` | configuração e falhas do store (12.1) |
| `recon.drift`, cota Google (relatório "Monitor Play Integrity API" do Console + Cloud Console), `usage_daily`/`limit_remaining` do OpenRouter | orçamento, cota e conciliação de *outcomes* incertos |

Alertas: `cap.guard.trip`, pacing ≥ 80% do dia, decode ≥ 70% da cota, pico de falha de enrollment,
`anon.legacy` > 0 após o sunset, **`emergency.on`, `cfg.below_floor`, `pool.new.exhausted`,
`recon.drift` acima do limiar**. Entrega por e-mail dos consoles (a Upstash avisa em 70%/90% do *budget*
`[OFICIAL]`) e um resumo diário por script — **nenhum log de corpo/IP em claro**.

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
| **G-06** Storage: **Upstash Redis** via Vercel Marketplace | **free** (256 MB, 500 mil comandos/mês; **sem** Prod Pack); PAYG US$ 0,20/100 mil comandos (com *budget cap*); Prod Pack +US$ 200/mês/DB (**não recomendado**; não se compra no free) | sim | instalar a integração, escolher a região `us-east-1`, criar DB Production (+ Preview em **outro** banco) **com `EVICTION = OFF` e `AUTO_UPGRADE = OFF`** (auto-upgrade só com autorização humana explícita); definir *budget* se PAYG | reversível (apagar o DB perde o estado; a perda por tipo está analisada em 9.1 e a denylist é exportada por script) | R1 |
| **G-07** Plano Vercel | Hobby US$ 0 — **"uso pessoal, não comercial"** `[OFICIAL]`; Pro **US$ 20/mês** (+US$ 20 de crédito) | Hobby | decidir quando o app virar comercial/pago; fazer upgrade | reversível (downgrade com restrições); Pro sobe logs de 1 h para 1 dia e libera mais regras | comercialização (não R1) |
| **G-08** Orçamento OpenRouter | cap atual US$ 5/mês (já autorizado); **qualquer aumento = nova autorização** | — | painel OpenRouter | reversível | R3 (números) |
| **G-09** Parecer jurídico (LGPD, DPA, Data Safety, App Privacy) | externo | — | contratar/consultar | n/a | R1 externo, R2 |
| **G-10** *(só se D)* Projeto Firebase / App Check | sem custo, sujeito a cotas do provedor `[FB]` | sim | criar projeto, registrar apps | reversível | — |
| **G-11** *(opcionais)* Vercel BotID (Basic sem custo; Deep Analysis com preço **não verificado**) para W2; Observability Plus (logs de 30 d) | variável | Basic | ativar | reversível | — |
| **G-12** *(só para a quota `STRONG`, R4)* Play Integrity **device recall (beta)** | preço não declarado ("Pricing for high-scale usage may apply after general release") `[PI-setup]` | — | preencher o formulário de interesse do beta, aguardar aprovação e ligar no Console (ligar/desligar apaga as respostas de teste configuradas) | reversível (desligar) | R4 (`STRONG`) |

### 13.1 Dependências novas (futuras — **nenhuma adicionada por este GOAL**)

| Dependência | Onde | Observação |
|---|---|---|
| Cliente Redis (`@upstash/redis` ou `fetch` REST) | gateway | scripts atômicos; avaliar tamanho e supply chain |
| Biblioteca Play Integrity `com.google.android.play:integrity:1.6.0` | plugin Android | Maven do Google `[PI-setup]` |
| **Plugin Capacitor nativo próprio** (Kotlin + Swift) | app | guarda credenciais **e** faz o transporte autenticado (7.5); U-09 — não terceirizar |
| Verificador App Attest: CBOR + X.509 (`node:crypto`) | gateway | decodificador mínimo próprio ou biblioteca; testado com o vetor oficial da Apple |
| ASN.1/CBOR + CRL (**opcional**, só Key Attestation `android_hw`) | gateway | só se a R4 adotar; a doc do Google recomenda a biblioteca Kotlin (sem JVM na Vercel) — U-19 |
| Credencial Google (OIDC→WIF ou conta de serviço) | gateway | sem dependência de código se feito por `fetch` (STS + decode) |
| Apple: só frameworks do sistema (`DeviceCheck`, Keychain, `URLSession`) | plugin iOS | — |

---

## 14. Decisões

### 14.1 Decisões técnicas registradas por este GOAL (pós-R1)

Os IDs abaixo são os mesmos registrados em `docs/DECISOES.md` (bloco GOAL-121). "R1" = revisão
independente (Seção 16); onde a decisão nasceu de um achado, o `IR-121-nn` está indicado.

| ID | Decisão |
|---|---|
| D121-001 | Arquitetura-alvo **B** (instalação atestada + sessão opaca + quota por instalação) **mantida após a R1** — nenhum achado demonstrou incompatibilidade real; **C** aditivo no GOAL-36; **A** só como mecanismo de enrollment/renovação; **D** como plano B do *verificador* |
| D121-002 | Atestação **não** é autenticação; o controle real é a quota de servidor. **A quota da R3 é `SOFT`** (justiça e freio de uso pesado, sem promessa de "uma quota por aparelho"); `STRONG` só com memória de dispositivo na R4 (IR-121-03) |
| D121-003 | Android: Play Integrity **standard** + `requestHash` (challenge + SPKI + instalação + versão); decrypt no Google; **atestar no enrollment e em TODA renovação** do token (não por chamada do Assistente); warm-up lazy. **A origem em hardware da chave Android NÃO é premissa do V1**; Key Attestation é *tier* opcional `android_hw`, só depois de cumprir os requisitos da Seção 4.5 (IR-121-02) |
| D121-004 | iOS: App Attest (1 chave por instalação, `keyId` no Keychain), *assertion* a cada renovação; DeviceCheck só como sinal opcional (R4) |
| D121-005 | Sessão opaca de 256 bits, guardada por SHA-256, TTL curto (proposta 60 min), rotação e revogação instantânea; **não JWT** |
| D121-006 | **Transporte autenticado nativo** (IR-121-01): o plugin guarda `installation_id`/token/chave/`Idempotency-Key` e faz a chamada ao gateway; o bearer **nunca** entra no JS; sem `getToken` nem HTTP genérico; o preflight/CORS **não** é ampliado; `/api/ai/v1/*` rejeita `Origin`; `Authorization` + `Origin` → 403; o cliente ganha a porta `AssistantTransport` (`WebFetchTransport` legado × `NativeGuardTransport`) |
| D121-007 | Store V1 = **Upstash Redis** (Marketplace, `us-east-1`) atrás de `GuardStore`, com `EVICTION = OFF`, `AUTO_UPGRADE = OFF`, *budget* se PAYG e banco de Preview separado; **análise de perda por tipo de estado** (9.1); denylist exportada por script; falha de store/limite = *fail-closed* só do Assistente; nada de saúde/treino/nutrição no servidor; Postgres/Supabase só com conta (IR-121-07) |
| D121-008 | Unidade de quota = chamadas/instalação/dia+mês UTC (reserva atômica) + 1 em voo + pacing global + `CAP_GUARD`; instalação nova nasce em *probation*; números só depois da telemetria da R1 (D-AUTH-07) |
| D121-009 | Idempotência = contabilidade de *outcomes* `pending`/`charged`/`refunded`/`unknown`; estorno **só com evidência**; a mesma `Idempotency-Key` **nunca** dispara nova chamada paga em `pending/charged/unknown`; nenhum corpo/resposta é guardado (IR-121-06) |
| D121-010 | Anti-farming como **pré-requisito da R3**: *budgets* de enrollment (global e por IP-hash), quota por idade + pool de instalações novas, gate por `recentDeviceActivity` (Play) e limite de resets; `QUOTA_STRENGTH = SOFT` declarado; `STRONG` só na R4 com deviceRecall/DeviceCheck (IR-121-03) |
| D121-011 | Config fail-safe (IR-121-04): **piso** `AI_GUARD_MIN_AUTH_MODE`/`AI_GUARD_MIN_QUOTA_MODE` versionado por deploy (em Production ausente/ilegível ⇒ `enforce`); `gd:cfg` **só aperta**; **override de emergência** assinado (`EMERGENCY_KEY`), ≤ 4 h, nunca abaixo de `shadow`, auditado; store/config falhando em `enforce` = *fail-closed* só do Assistente. Não existe `AUTH_MODE=off` remoto em Production |
| D121-012 | Challenge com máquina de estados `verifying`/`used`, *claim* atômico **antes** de qualquer chamada externa, ≤ 1 decode Google por challenge; replay de atestação iOS ⇒ 409 `KEY_ALREADY_ENROLLED` sem token (IR-121-05) |
| D121-013 | O Firewall fica como *backstop*; **não** limita por token no Hobby (chave só IP/JA4); limites por instalação vivem na função |
| D121-014 | Canal web: padrão **W1** (desligar o Assistente na web Production ao entrar em enforcement), pendente de D-AUTH-03 |
| D121-015 | Rollout R0–R4 com `AUTH_MODE`/`QUOTA_MODE` e piso versionado; requisição sem token recebe só códigos que os builds atuais mapeiam; `aiFailureToUiState` ganha `default` seguro na 1ª entrega da R1; canal `internal` com sunset |
| D121-016 | Identidade/sessão **nunca** em WebView/JS, `PersistedState` ou backup; armazenamento nativo fora de backup; testes de contrato, incluindo o **gate estático "nenhum JS monta `Authorization` nem contém `gfat1_`"** |
| D121-017 | A emenda do `CLAUDE.md` é **proposta**, não aplicada (Apêndice D) |
| D121-018 | `installation_id` e chave pública/`key_id` são **identificadores persistentes** (potencial dado pessoal até parecer jurídico; sem conclusão LGPD aqui): Data Safety, App Privacy e D-NUT-09 atualizados **antes** de testers externos (IR-121-08) |
| D121-019 | **Revisão independente:** a tentativa local do executor não rodou (falha de ambiente); a **R1** externa (GPT-5.6 Sol / OpenAI, PR #55) devolveu `CHANGES_REQUIRED` (P0 = 0, P1 = 4, P2 = 4, P3 = 0); as correções IR-121-01..08 foram aplicadas **só na documentação** (`APPLIED`, ainda não `FIXED`); `INDEPENDENT_REVIEW_RESULT = R1_CHANGES_APPLIED_PENDING_R2` e `READY_FOR_AUTH_IMPLEMENTATION_GOAL = PENDING_INDEPENDENT_REREVIEW`; a **R2** é obrigatória antes de qualquer GOAL de implementação (Seção 16, Apêndice F) |

### 14.2 Decisões humanas pendentes

| ID | Decisão | Recomendação | Bloqueia |
|---|---|---|---|
| **D-AUTH-01** | emenda do `CLAUDE.md` (G-A/G-B/G-C, Seção 2) | G-A, texto do Apêndice D | tudo |
| **D-AUTH-02** | confirmar **B** como alvo e **Upstash** (com a configuração da Seção 9.3) como store V1 — ou G-B/Supabase-first | B + Upstash | R1 |
| **D-AUTH-03** | canal web: **W1** desligar o Assistente na web Production ao enforçar (inclui PWA/Safari no iOS, sem atestação) · **W2** BotID Basic + sessão web de baixa confiança + quota por IP-hash · **W3** exigir conta (GOAL-36) | W1 | R2 |
| **D-AUTH-04** | provisionar/gastar: G-02, G-04, G-06 (R1), G-05 (iOS), G-07 (Vercel), G-08 | por gate | R1 / iOS |
| **D-AUTH-05** | aparelho sem Play services/App Attest e emulador: **fail-closed** para o Assistente · tier de baixa confiança com quota mínima e por IP-hash | fail-closed | R2 |
| **D-AUTH-06** | retenção e exclusão: GC de instalações (proposta 180 d), auditoria (30 d), **retenção da denylist** (proposta ≥ vida da instalação, exportada por script), *tombstone* (i) ou reset (ii) | (ii) + controles de 8.5; parecer jurídico | R1 externo |
| **D-AUTH-07** | **números**: teto mensal, `margem`, `fração_para_usuários`, tiers **e parâmetros anti-enrollment** (`q0`, `PROBATION_AGE`, tamanho do pool de instalações novas, *budgets* de enrollment, teto de `unknown`/dia, limite de resets) | decidir com a telemetria da R1 | R3 |
| **D-AUTH-08** | data de *sunset* do bucket `legacy` e aviso aos testers | curto, fixo, registrado | R2b |
| **D-AUTH-09** | *(novo, R1)* memória de dispositivo para a quota `STRONG`: solicitar o **beta do device recall** (G-12) e/ou usar **DeviceCheck** + métrica do App Attest | pedir a aprovação do beta durante a R3; decidir na R4 | R4 (`STRONG`) |
| **D-AUTH-10** | *(novo, R1)* adotar ou não o *tier* `android_hw` (Key Attestation, 4.5): exige verificador com a suíte de testes da 4.5 e, com a biblioteca Kotlin oficial, um serviço extra | **não** adotar no V1; reavaliar na R4 com dados de cobertura (U-19) | R4 |

---

## 15. Estado de aceite

```
CURRENT_GATEWAY_AUTH = NO
CURRENT_COST_CAP = ACTIVE
CURRENT_IP_RATE_LIMIT = ACTIVE

TARGET_ARCHITECTURE = B                        (mantida após a R1; C aditivo)
ANDROID_ATTESTATION_PLAN = DEFINED             (Play Integrity em todo enrollment/renovação; chave sem prova de hardware no V1; Key Attestation = tier opcional)
IOS_ATTESTATION_PLAN = DEFINED
TOKEN_MODEL = DEFINED                          (opaco; transporte nativo — o bearer nunca entra no JS)
QUOTA_MODEL = DEFINED                          (unidade e camadas; R3 = QUOTA_STRENGTH SOFT; NÚMEROS = D-AUTH-07, pós-R1)
ANTI_FARMING_PLAN = DEFINED                    (budgets + pool + recentDeviceActivity na R3; STRONG só na R4)
STATE_STORAGE_REQUIREMENTS = DEFINED           (Upstash: EVICTION OFF, AUTO_UPGRADE OFF; perda analisada por tipo de estado)
CONFIG_FAILSAFE = DEFINED                      (piso versionado no deploy + override de emergência limitado e auditado)
IDEMPOTENCY_OUTCOME_MODEL = DEFINED            (pending/charged/refunded/unknown; sem 2ª chamada paga sem evidência)
ROLL_OUT_PLAN = DEFINED
PRIVACY_IMPACT = DOCUMENTED                    (identificadores persistentes = potencial dado pessoal; sem conclusão jurídica)

PRODUCTION_CODE_CHANGED = NO
EXTERNAL_SERVICE_PROVISIONED = NO
PAID_SERVICE_ENABLED = NO

RESIDUAL_SEVERITY (Seção 3)  P0 = 0 · P1 = 0 · P2 = 10 (T01 T06 T07 T08 T14 T16 T17 T20 T22 T23) · P3 = 18
                                               (T21 = P3 com W1; P2 só com W2)

P0_ARCHITECTURE_UNKNOWN = 0                    (análise do autor)
P1_ARCHITECTURE_UNKNOWN = 0                    (análise do autor; os 4 P1 da R1 foram corrigidos no texto)

INDEPENDENT_REVIEW_RESULT = R1_CHANGES_APPLIED_PENDING_R2
     R1 (GPT-5.6 Sol / OpenAI, PR #55): CHANGES_REQUIRED · P0 = 0 · P1 = 4 · P2 = 4 · P3 = 0
     IR-121-01..08 corrigidos nas seções canônicas (Seção 16.2); nenhuma confirmação independente ainda
READY_FOR_AUTH_IMPLEMENTATION_GOAL = PENDING_INDEPENDENT_REREVIEW
```

**Por que não é `YES`:** a R1 devolveu `CHANGES_REQUIRED` e escreveu explicitamente que o desenho não
estava pronto para virar GOAL de implementação. As correções acima foram feitas **pelo autor**;
nenhum revisor independente confirmou ainda que cada achado está `FIXED` nem que as correções não
introduziram problemas novos (Seção 16.4 lista onde elas foram mais invasivas). Um `YES` agora
afirmaria algo que ninguém além do autor verificou. **Regra:** nenhum GOAL de implementação começa
antes de a **R2** confirmar `FIXED` em IR-121-01..08 e de P0 = P1 = 0 (novos ou antigos). Depois
disso o valor passa a `YES` (o *início* ainda depende dos gates G-01, G-02/G-04, G-06 e
D-AUTH-01/02/04/06, todos enumerados e nenhum é pergunta de arquitetura) ou a
`BLOCKED_HUMAN_ARCHITECTURE_DECISION` (se a R2 contestar B). **R2 do rollout (enforcement) não está
liberada** de qualquer forma: exige R1 do rollout medida e D-AUTH-03/05/08. (Atenção ao nome:
"R1/R2" da **revisão independente** e "R1/R2" das **fases de rollout** são coisas diferentes.)

**Por que P0/P1 desconhecidos = 0 (segundo o autor):** os itens **não verificados** (Apêndice E) são
todos P2/P3, cada um tem verificação prevista antes de qualquer enforcement, e nenhum muda a
arquitetura — em todos existe mitigação independente do resultado (armazenamento nativo excluído de
backup + Keystore, backoff local, `default` seguro, `GuardStore` substituível, verificador
substituível por App Check, renovação Android sempre por Play Integrity novo, piso de config
versionado, pacing + cap externos ao Redis). Isto é análise do autor, não revisão independente.

---

## 16. Revisão independente

**Estado: R1 executada (externa ao executor) → `CHANGES_REQUIRED`; correções aplicadas neste documento;
R2 pendente.** `INDEPENDENT_REVIEW_RESULT = R1_CHANGES_APPLIED_PENDING_R2`.

### 16.1 Rodadas

| Rodada | Revisor | Material | Quando | Resultado |
|---|---|---|---|---|
| Tentativa local do executor (Codex CLI) | — | — | 2026-09-28, 22:00–22:20Z | **não executada** — falha do ambiente local, não do desenho (16.5); sem resultado |
| **R1** | **GPT-5.6 Sol (OpenAI)** — família de modelo diferente da do autor (Claude) | este documento em `91fcc92…` (PR #55, base `ebcc786…`) e o código citado | 2026-09-29 (registrada como *review* do PR #55, id 5347464606) | **`CHANGES_REQUIRED` — P0 = 0 · P1 = 4 · P2 = 4 · P3 = 0** |
| **R2** | a definir (Apêndice F) | este documento **pós-R1** | pendente | pendente |

**O que a R1 concluiu:** a arquitetura **B continua viável**, mas **não estava pronta para virar GOAL
de implementação**; os quatro P1 são corrigíveis no próprio desenho e não exigem nova decisão humana
de arquitetura; `READY_FOR_AUTH_IMPLEMENTATION_GOAL` deve permanecer bloqueado até corrigir os P1 e
repetir a revisão.

**Decisão do autor:** `TARGET_ARCHITECTURE = B` **preservada** — nenhum dos oito achados demonstrou
incompatibilidade real com B; cada P1 foi corrigido *dentro* dela (D121-001).

### 16.2 Achados da R1 e correções

| ID | Sev. | Onde (versão revisada) | Achado (resumo) | Correção aplicada (seção canônica) | Status |
|---|---|---|---|---|---|
| IR-121-01 | **P1** | 7.1, D121-011, Ap. B | Fronteira do token contraditória: "nunca em WebView" × cliente JS que monta `Authorization: Bearer` | **Transporte autenticado nativo**: o plugin guarda as credenciais e faz a chamada; o JS envia só o corpo e recebe resposta sanitizada; sem `getToken` nem HTTP genérico; preflight **não** ampliado; `/api/ai/v1/*` rejeita `Origin`; `Authorization` + `Origin` → 403; porta `AssistantTransport` e migração na R1; gate estático "sem bearer no JS" (**7.5**, 7.1, 11, 12, Ap. B; T05, T25; D121-006/016) | `APPLIED` — aguarda R2 |
| IR-121-02 | **P1** | 4.2, 4.5, 6, 7 | Chave de prova de posse do Android não é provada em hardware; o `requestHash` liga o SPKI, não a origem da chave; risco de *broker* | **Premissa retirada** no V1: toda renovação exige **Play Integrity novo** + prova de posse (`ATTEST_MAX_AGE = 0`), limitada por `recentDeviceActivity` e taxa; Key Attestation vira *tier* opcional `android_hw` com challenge, cadeia/raízes, CRL, nível de segurança, vínculo de app, *fallback* `play_only` e privacidade definidos (**4.2, 4.5**, 6, 7.1, 7.3; T06, T12, T23; D121-003; D-AUTH-10) | `APPLIED` — aguarda R2 |
| IR-121-03 | **P1** | 8, 12 (R3→R4), T14/T22 | Quota por instalação resetável (novo enrollment no mesmo aparelho) antes do anti-farming, que só entrava na R4 | Anti-enrollment vira **pré-requisito da R3** (*budgets* global e por IP-hash, pool de instalações novas + quota por idade, gate `recentDeviceActivity`, limite de resets) **e** a quota da R3 é declarada **`SOFT`** (proteção financeira = pacing + cap); `STRONG` só na R4, com memória de dispositivo e o vetor reproduzido em aparelho real (**8.5**, 12.2; T08, T14, T22; D121-002/010; D-AUTH-07/09; G-12) | `APPLIED` — aguarda R2 |
| IR-121-04 | **P1** | 9, 12 | Config/store em enforcement sem semântica para ausente/ilegível; podia falhar aberto | **Piso versionado no deploy** (`AI_GUARD_MIN_*`; ausente em Production ⇒ `enforce`); `gd:cfg` só aperta; **override de emergência** assinado por HMAC (`EMERGENCY_KEY`), ≤ 4 h, nunca abaixo de `shadow`, auditado; ausente/ilegível/abaixo do piso ⇒ piso; store ou limite indisponível em enforce ⇒ *fail-closed* só do Assistente (**12.1**, 9.3, 7.4, 11; T19, T26; D121-011) | `APPLIED` — aguarda R2 |
| IR-121-05 | P2 | 7.1 × Ap. C | Ledger de challenge contraditório: `SET NX` "em verificação" no texto × só `used` após sucesso no modelo de dados | Máquina de estados `verifying`/`used`, *claim* atômico antes do decode, operações `claim/complete/release/burn`, falha transitória × definitiva, crash entre estados analisado, ≤ 1 decode por challenge (**7.6**, Ap. C; T16; D121-012) | `APPLIED` — aguarda R2 |
| IR-121-06 | P2 | 8, 9, Ap. C | Idempotência/estorno sem *outcome* incerto: um *timeout* não prova que o provedor não cobrou | `pending/charged/refunded/unknown` + `dispatched`; estorno só com evidência; a mesma chave nunca re-dispara em `pending/charged/unknown`; reconciliação com `usage_daily`; L0/L3 independem do Redis; nenhum corpo guardado (**8.4**, Ap. C; T27; D121-009; U-20) | `APPLIED` — aguarda R2 |
| IR-121-07 | P2 | 9.2/9.3, U-06 | Premissas do Upstash desatualizadas: persistência sempre ligada, eviction opt-in/desligada por padrão, free sem a redundância dos planos pagos | Fatos oficiais reescritos e citados; **eviction OFF**, **auto-upgrade OFF**, *budget* se PAYG; limite/escrita rejeitada ⇒ *fail-closed* do Assistente; durabilidade **não** equiparada a HA/SLA; **análise de perda por tipo de estado**; consistência eventual ⇒ decisões de segurança em scripts do líder (**9.1–9.3**, 13/G-06, Ap. A/E; T28; D121-007; U-06, U-21) | `APPLIED` — aguarda R2 |
| IR-121-08 | P2 | 10.1 | "Chave pública/`key_id` não é PII" é categórico demais | Redação factual: sem nome, e-mail nem conteúdo de saúde, mas **identificador persistente** ⇒ dado de dispositivo/potencial dado pessoal até parecer jurídico; sem conclusão LGPD (**10.1–10.3**, 6; D121-018) | `APPLIED` — aguarda R2 |

`APPLIED` significa **texto corrigido pelo autor**, nada mais. Só a R2 pode marcar um achado como
`FIXED`; o autor não se autoavalia como `FIXED`.

### 16.3 Estado depois da R1

- `INDEPENDENT_REVIEW_RESULT = R1_CHANGES_APPLIED_PENDING_R2`
- `TARGET_ARCHITECTURE = B` (preservada)
- `READY_FOR_AUTH_IMPLEMENTATION_GOAL = PENDING_INDEPENDENT_REREVIEW` — **não é `YES`**
- o PR #55 continua **rascunho**; nada foi mesclado; nada foi provisionado, configurado ou gasto.

### 16.4 O que a R2 deve atacar (autoavaliação do autor)

Por achado, onde procurar falhas na correção:

| Achado | Onde a R2 deve procurar |
|---|---|
| IR-121-01 | qualquer trecho que ainda diga ou implique que o JS monta `Authorization`, recebe o token ou que o preflight foi ampliado (1.2, 7.1, 7.5, 11, Ap. B, Ap. D); se a superfície do plugin (7.5) permite virar proxy HTTP genérico; a convivência de dois caminhos (`WebFetchTransport` legado e `NativeGuardTransport`) até o *sunset* |
| IR-121-02 | qualquer trecho que ainda chame a chave Android de "hardware-bound"; custo/cota de 1 decode por renovação e dependência da disponibilidade do Google para renovar (T12); o residual P2 aceito em T23 (*broker*); `recentDeviceActivity` só existe com projeto linkado (U-10) |
| IR-121-03 | se `SOFT` é honesto e suficiente; se o **efeito colateral aceito** do pool (DoS limitado a instalações novas legítimas, 8.5) é tolerável ou precisa de contramedida; se o limite de resets (que só cobre a ação do app) está descrito sem exagero |
| IR-121-04 | a precedência piso × `gd:cfg` × emergência (12.1) em todos os casos de falha; o novo segredo `EMERGENCY_KEY`; a lentidão de elevar o piso só por deploy |
| IR-121-05 | consistência de chaves, TTLs e retornos entre 7.6 e o Apêndice C; degradação de UX sob `IN_PROGRESS`/`LOST` |
| IR-121-06 | a tabela de *outcomes* (8.4) — em especial `429`/`4xx` do provedor como `refunded` `[INFERÊNCIA; U-20]`, que pode estar otimista; o limiar de *drift* |
| IR-121-07 | os fatos do Upstash contra as páginas citadas (Ap. A); o que o plano free faz acima de 500 mil comandos/mês (não documentado, U-06) |
| IR-121-08 | as redações das Seções 6, 10 e 13 e o Apêndice D |

**Onde as correções foram mais invasivas (olhar primeiro):** 7.5 (transporte nativo), 7.6 (challenge),
8.4 (*outcomes*), 8.5 (anti-farming), 12.1 (piso/emergência), 4.5 (Key Attestation), 9.1 (perda por
tipo) e os Apêndices B e C. Cada uma é texto novo, sem código, sem medição e sem revisão independente.

**Fora do escopo da R2:** a decisão de governança (D-AUTH-01), conclusões jurídicas e a escolha de
números comerciais (D-AUTH-07).

### 16.5 Histórico: a tentativa local do executor (não é resultado de revisão)

O executor tentou a revisão com o Codex CLI local (`gpt-5.6-sol`, conteúdo inline em sandbox
*read-only*, a receita dos GOALs 117/118) e **não conseguiu** por uma falha do ambiente. A R1 acima foi
feita depois, por outro canal, sob responsabilidade do dono. Fatos medidos na tentativa
(2026-09-28, 22:00–22:20Z):

| Item | Fato |
|---|---|
| Sintoma | `codex exec` para em "Reconnecting… waiting for network" com `os error 10048` (`WSAEADDRINUSE`) ao conectar em `chatgpt.com`; o `fetch`/`net.connect` do Node dá `EADDRINUSE` para o mesmo host; `curl` funciona (HTTP 403 do Cloudflare, sem credencial) |
| Causa | ~14–16 mil sockets em `TIME_WAIT` que não expiram, com endereço local antigo, ocupam a faixa dinâmica 49152–65535; o `bind(0)` que Node/Rust fazem antes do `connect` cai nessas portas e colide; o `curl` (sem `bind` explícito) não. `net.connect` com `localPort` explícita fora da faixa conecta |
| Fora do escopo | reiniciar a pilha TCP/máquina, alterar `TcpTimedWaitDelay` ou parar processos de outros projetos |
| Tentativas | 3 execuções normais com retentativa e espera por portas livres — sem sucesso; um túnel CONNECT local com porta explícita foi **negado** pelo classificador de segurança do ambiente e **removido**; nenhuma outra rota foi tentada porque enviar código e desenho por outro canal é decisão de compartilhamento de dados do dono |

**Como executar a R2:** receita e prompt no Apêndice F. Depois da R2, registrar aqui a rodada, as
contagens e o `FIXED / PARTIAL / NOT FIXED / DISPUTED` de cada achado, corrigir **só a
documentação/plano** e atualizar as Seções 14/15 e os registros em `docs/DECISOES.md`,
`docs/PENDENCIAS.md` e `docs/GOALS_LOG.md`.

---

## Apêndice A — Fontes consultadas (2026-09-28; Key Attestation, device recall e docs do Upstash relidos em 2026-09-29)

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
| AK-attest | https://developer.android.com/privacy-and-security/security-key-attestation | verificação só no servidor, raízes (nova raiz em 2026-02-01), CRL, biblioteca Kotlin recomendada; atualizada em 2026-07-09 |
| AK-schema | https://source.android.com/docs/security/features/keystore/attestation | esquema `KeyDescription`: `attestationApplicationId`, `rootOfTrust`, campos de *ID attestation*, `uniqueId`; atualizada em 2026-09-21 |
| PI-devicerecall | https://developer.android.com/google/play/integrity/device-recall | device recall (beta): 3 bits, escrita servidor-a-servidor, aprovação do beta; atualizada em 2026-06-08 |
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
| UP-pricing | https://upstash.com/pricing/redis | free/PAYG/Prod Pack; SLA, HA e criptografia em repouso só no Prod Pack |
| UP-durability | https://upstash.com/docs/redis/features/durability | persistência sempre ligada (memória + *block storage*) |
| UP-eviction | https://upstash.com/docs/redis/features/eviction | eviction desligada por padrão: no limite, as escritas são rejeitadas |
| UP-autoupgrade | https://upstash.com/docs/redis/features/auto-upgrade | troca de plano automática (opt-in) |
| UP-replication | https://upstash.com/docs/redis/features/replication | líder/seguidores; replicação extra só nos planos pagos |
| UP-consistency | https://upstash.com/docs/redis/features/consistency | consistência eventual entre réplicas; causal por conexão |
| UP-backup | https://upstash.com/docs/redis/features/backup | *backup/restore*; disponibilidade por plano não confirmada (U-06) |
| Neon | https://neon.com/pricing | free plan, scale-to-zero |
| Supabase | https://supabase.com/pricing | pausa em 1 semana, backups Pro |
| Next.js 16 | `node_modules/next/dist/docs/` (`runtime.md`, `16-proxy.md`) | runtime padrão nodejs; proxy ≠ autorização |

---

## Apêndice B — Contrato de API proposto (**proposta, nada implementado**)

Todas as rotas novas: `Cache-Control: no-store`; nunca logar corpo; corpo ≤ 16 KiB (o objeto de
atestação iOS tem alguns KiB em Base64 — medir, U-14). **Quem chama:** o **plugin nativo** (7.5) —
nenhuma rota `/api/ai/v1/*` é chamada pelo JavaScript do WebView, e o JS nunca vê `installationId`,
token nem chave. Envelope de falha = superset do atual: `{ status:'failure', code, message,
retryAfterSeconds?, resetsAt?, scope? }` (clientes antigos ignoram os campos novos).

### B.1 Rotas

| Rota | Corpo | Resposta 200 | Erros |
|---|---|---|---|
| `POST /api/ai/v1/challenge` | `{purpose:'enroll'\|'refresh'\|'reset', platform, installationId?}` | `{challenge, expiresAt}` — **stateless**: HMAC(`kid`, purpose, platform, `iat`, 16 B aleatórios, installationId?); emitir não escreve no store | 400, 429 |
| `POST /api/ai/v1/enroll` | android: `{platform, challenge, integrityToken, installationPublicKey (SPKI b64url), appVersionCode [, keyAttestationChain]}` (a cadeia só é lida no *tier* opcional `android_hw`, 4.5) · ios: `{platform, challenge, keyId, attestation (b64)}` | `{installationId, token, expiresAt, refreshAfter, attestationLevel, channel}` — **consumido pelo plugin; nunca repassado ao JS** | 400 `INVALID_REQUEST`; 403 `ATTESTATION_FAILED`; 409 `CHALLENGE_IN_PROGRESS` / `KEY_ALREADY_ENROLLED`; 429; 503 `ATTESTATION_UNAVAILABLE` |
| `POST /api/ai/v1/token` | `installationRef` = `{installationId}` **ou** `{keyThumbprint}` (recuperação depois de perder a resposta do enrollment, 7.6; o servidor resolve por `gd:pk` e, sem a prova de posse, a referência não vale nada) + android: `{challenge, integrityToken (**obrigatório** no V1, IR-121-02), appVersionCode (entra no `requestHash`, 4.2), popSignature (ECDSA P-256/SHA-256, DER, sobre `gf-pop-v1` ‖ challenge ‖ installationId — separação de domínio)}` · ios: `{clientData (b64 JSON), assertion (b64)}` | idem `enroll` (sem trocar `installationId`) | 403 `TOKEN_REVOKED` / `ATTESTATION_FAILED`; 409 `REATTEST_REQUIRED` (política subiu, nível insuficiente ou regressão de `counter`: o plugin refaz o enrollment) / `CHALLENGE_IN_PROGRESS`; 429 (`recentDeviceActivity` alto ou taxa de renovação); 503 |
| `POST /api/ai/v1/reset` *(opcional)* | `{challenge}` (`purpose:'reset'`) + prova de posse (`popSignature` ou *assertion*) | 204 (remove a instalação; ≤ 1×/dia por instalação, 8.5) | 401/403/429 |
| `GET /api/ai/v1/quota` *(opcional)* | — (Bearer injetado pelo plugin) | `{day:{remaining, resetsAt}, month:{remaining, resetsAt}}` | 401/403 |
| `POST /api/nutrition/assistant` *(existente)* | corpo atual + cabeçalhos **injetados pelo plugin**: `Authorization: Bearer gfat1_…`, `X-GymFlow-Client: ai-guard/1`, `Idempotency-Key: <uuid>` (uma por ação do usuário, 8.4) | resposta atual + `meta.quota` aditivo | 401 `TOKEN_MISSING` / `TOKEN_EXPIRED`; 403 `TOKEN_REVOKED` / `ATTESTATION_FAILED` / `Authorization` com `Origin`; 409 `REQUEST_IN_PROGRESS` / `ALREADY_PROCESSED` / `OUTCOME_UNKNOWN`; 429 `QUOTA_EXCEEDED` / `RATE_LIMITED`; 503 `OPENROUTER_BUDGET_EXHAUSTED` / `PROVIDER_UNAVAILABLE` |

### B.2 Origem e CORS: **nenhuma mudança** (IR-121-01)

O desenho anterior ampliava o preflight para deixar o JS enviar `Authorization`; **isso foi retirado**:

- `Access-Control-Allow-Headers` e `isAllowedPreflight` **não mudam** (só `Content-Type`); o preflight que
  pede `authorization` continua sendo respondido com 403 — é o comportamento desejado: nenhuma página
  nem JS do WebView pode usar o bearer (F-121-05). Os testes do GOAL-118 que exigem 403 para
  `Authorization` **permanecem**.
- `/api/ai/v1/*`: sem CORS e sem `OPTIONS`; requisição com cabeçalho `Origin` → **403** `INVALID_REQUEST`
  (código que os builds atuais já mapeiam). As chamadas do plugin não são de navegador e não trazem `Origin`.
- `/api/nutrition/assistant`: `Authorization` **acompanhado de** `Origin` → **403** `INVALID_REQUEST`.
  Requisição sem token de build legado segue a regra de compatibilidade da Seção 11.
- `Retry-After` viaja também no corpo (`retryAfterSeconds`, `resetsAt`); no transporte nativo o plugin lê
  os cabeçalhos e os repassa no envelope sanitizado.

### B.3 Contrato JS ↔ plugin nativo (proposta de tipos, **não implementado**; 7.5)

```ts
interface GymflowAiGuardPlugin {
  // O plugin injeta Authorization/Idempotency-Key e devolve só o resultado sanitizado.
  request(o: { requestId: string; body: AiAssistantGatewayRequest; timeoutMs?: number }): Promise<AiAssistantResult>;
  cancel(o: { requestId: string }): Promise<void>;
  status(): Promise<{ supported: boolean; enrolled: boolean }>; // booleanos; sem ids
  resetInstallation(): Promise<{ ok: boolean }>;                // limitado (D-AUTH-06)
}
// NÃO EXISTEM: getToken, getInstallationId, http(url, headers), setBaseUrl.
```

Sanitização no nativo: só `application/json`, corpo ≤ 64 KiB, *allowlist* de chaves de topo (`status`,
`proposal`, `code`, `message`, `retryAfterSeconds`, `resetsAt`, `scope`, `meta.quota`), strings ≤ 2 KiB;
nunca devolve cabeçalhos, cookies nem o corpo cru de erros de infraestrutura.

---

## Apêndice C — Modelo de dados (Redis, prefixo `gd:`)

A coluna **Classe** liga cada chave à análise de perda por tipo de estado da Seção 9.1. Toda escrita de
segurança roda em **script/comando processado pelo líder** (9.3).

| Chave | Valor | TTL | Operação atômica | Classe (9.1) |
|---|---|---|---|---|
| `gd:chal:{rand}` | `V:{claimId}` (*verifying*) **ou** `U` (*used*) — **não** mais um `used` só pós-sucesso (IR-121-05) | `V`: 45 s · `U`: validade restante do challenge + 5 min | scripts `claim` (`SET NX PX`), `complete`, `release`, `burn` (7.6) | Challenge |
| `gd:inst:{installation_id}` | hash: `platform, channel, status, epoch, attest_level, key_proof, last_attested_at, app_version, key_thumbprint, created_at, probation_until, [ios: key_id, pubkey, counter, receipt, env]` | 180 d rolante (D-AUTH-06) | `counter`: script *compare-and-set* | Instalação · Contador App Attest |
| `gd:pk:{sha256(pubkey ou keyId)}` | `installation_id` | igual | `SET NX` (dedupe de chave; enrollment idempotente por chave) | Instalação (índice) |
| `gd:deny:{sha256(pubkey)}` | motivo + instante da revogação | D-AUTH-06 (proposta: ≥ vida da instalação) | `SET`; **exportada periodicamente por script** para arquivo privado do dono | Revogação |
| `gd:tok:{sha256(token)}` | `installation_id, exp, attest_level, policy_ver, epoch` | `exp` + 5 min | `SET` | Sessão |
| `gd:tokof:{installation_id}` | hash do token vigente (rotação/grace ~30 s) | igual | `SET` | Sessão |
| `gd:q:d:{inst}:{yyyymmdd}` · `gd:q:m:{inst}:{yyyymm}` · `gd:qg:d:{yyyymmdd}` | inteiros | 48 h · 40 d · 48 h | script: `INCR`+`EXPIRE` com teto e reversão | Quota |
| `gd:pool:new:{yyyymmdd}` | inteiro: consumo do **pool** das instalações em *probation* (8.5) | 48 h | script com teto | Quota (anti-farming) |
| `gd:enr:g:{yyyymmdd}` · `gd:enr:ip:{hmac}:{yyyymmddhh}` | inteiros: *budgets* de novos enrollments (global e por IP-hash) | 48 h · 2 h | `INCR`+`EXPIRE` com teto (só challenge/enroll) | Quota (anti-farming) |
| `gd:reset:{inst}` | `1` | 24 h | `SET NX EX` | Quota (anti-farming) |
| `gd:refund:d:{inst}:{yyyymmdd}` | inteiro: estornos **com evidência** (8.4) | 48 h | `INCR` | Quota |
| `gd:unk:d:{inst}:{yyyymmdd}` · `gd:unk:g:{yyyymmdd}` | inteiros: *outcomes* `unknown` (instalação e global) | 48 h | `INCR` | Quota · Idempotência |
| `gd:infl:{inst}` | `1` | 30 s | `SET NX EX` | Quota (em voo) |
| `gd:idem:{inst}:{key}` | hash: `state` (`pending`\|`charged`\|`refunded`\|`unknown`), `dispatched` (0\|1), `t_reserve`, `t_dispatch`, `attempts` — **sem corpo nem resposta** (IR-121-06) | 15 min | script `reserve` / `markDispatched` / `settle` | Idempotência |
| `gd:cfg` | hash: `auth_mode, quota_mode, policy_ver, min_versions, cert_allowlist` | — | leitura com cache local de 30 s; **valor abaixo do piso é ignorado** (12.1) | Config |
| `gd:emergency` | JSON `{mode_auth?, mode_quota?, expires_at, reason, actor, nonce}` + HMAC (`EMERGENCY_KEY`) | até `expires_at` (≤ 4 h) | `SET EX`; validado por assinatura, validade e limite de descida | Config |
| `gd:emer:n:{yyyymmdd}` | inteiro: ativações do dia (≤ 3) | 48 h | `INCR` | Config |
| `gd:cap` | último `GET /api/v1/key` (`limit`, `limit_remaining`, `usage_daily`) | 60 s | `SET EX` | Métricas (cache) |
| `gd:rl:ip:{hmac}:{min}` | inteiro | 2 min | `INCR`+`EXPIRE` (só challenge/enroll) | Quota (limitador) |
| `gd:m:{yyyymmdd}:{evento}` | inteiro | 90 d | `INCR` | Métricas |
| `gd:aud:{yyyymmdd}` | eventos (tipo + `installation_id` + instante; `cfg.change`, `emergency.on/off`, `revoke`…) | 30 d | `XADD` / lista | Auditoria |
| `gd:tomb:{sha256(pubkey)}` | `1` | curto | **só se** D-AUTH-06 aprovar | Revogação |

Nenhuma chave contém corpo/resposta do Assistente, dado de saúde, e-mail, nome ou IP em claro.
`gd:inst`, `gd:pk`, `gd:deny` e `gd:tomb` guardam identificadores persistentes (potencial dado pessoal;
Seção 10).

---

## Apêndice D — Emenda proposta ao `CLAUDE.md` (**não aplicada**)

> **Exceção controlada "AI-Guard" (exige autorização explícita do Founder por GOAL).**
> Fica permitido, *somente* depois de um GOAL de implementação autorizado e dentro das fases R1–R4
> do documento `docs/security/GYMFLOW_AI_GATEWAY_AUTH_ARCHITECTURE_121.md`: um backend mínimo no
> gateway do Assistente IA para atestação de plataforma (Play Integrity / App Attest), sessão
> opaca, quota por instalação e estado no store aprovado (Upstash Redis, com *eviction* e *auto-upgrade*
> desligados), com o transporte autenticado feito pelo plugin nativo (o token nunca entra no JavaScript).
> Continua **proibido**: contas de usuário, Supabase/Auth (até o GOAL-36 e o Gate G4), pagamento
> real, dados de saúde/treino/nutrição no servidor, log de corpo de requisição ou IP em claro,
> segredo estático no cliente, e qualquer aumento de gasto sem autorização humana explícita.
> Cada fase exige GOAL próprio, piso de enforcement versionado no deploy, override de emergência
> explícito, temporário e auditado (nunca abaixo de `shadow`) testado e registro em `docs/DECISOES.md`.

Não altera as demais regras técnicas (design system, sem `alert()`, não tocar em avatar/GLB etc.).

---

## Apêndice E — Itens não verificados (todos P2/P3; verificação prevista antes de enforcement)

| ID | Sev. | Item | Como/quando verificar | Mitigação independente do resultado |
|---|---|---|---|---|
| U-01 | P2 | vereditos e `certificateSha256Digest` para build sideload e para Internal Testing com Play App Signing | R1 (`observe`) com aparelho real | canal `internal` / códigos de tester |
| U-02 | P3 | Play Integrity: exigência de billing/preço no projeto Cloud | Cloud Console antes de G-04 | decisão humana se houver custo |
| U-03 | P2 | Auto Backup incluir o WebView (`app_webview/`) | `bmgr`/`adb` em R1 | credenciais fora do WebView, em armazenamento nativo excluído + Keystore |
| U-04 | P3 | WebView tratar o 429 sem ACAO como erro de rede (só **builds legados**: o transporte nativo lê o 429) | teste em aparelho na R1 | backoff local; erros JSON com CORS na função; transporte nativo nos builds novos |
| U-05 | P3 | `isSupported` no Simulator (só fórum) | Xcode | `ATTESTATION_UNAVAILABLE`; debug enrollment em dev |
| U-06 | P2 | Upstash. **Fechado por documentação em 2026-09-29:** persistência sempre ligada, eviction OFF por padrão, auto-upgrade opt-in, replicação extra só nos planos pagos. **Ainda não verificado:** o que o free faz acima de 500 mil comandos/mês; a contagem de `EVAL` no faturamento; a disponibilidade de backup por plano; e que a configuração exigida (eviction OFF, auto-upgrade OFF, *budget*) está de fato aplicada no banco provisionado | no provisionamento (G-06), antes de qualquer dado real | falha de store/limite = *fail-closed* só do Assistente; análise de perda por tipo (9.1); export periódico da denylist; `GuardStore` |
| U-07 | P3 | cobrança da integração Marketplace no Hobby | no provisionamento | free tier / *budget cap* |
| U-08 | P2 | campos `usage`/custo por chamada do OpenRouter | R1 | quota por chamadas (custo limitado por contrato) |
| U-09 | P2 | supply chain das dependências nativas (biblioteca Play Integrity, cliente Redis) — a escolha "plugin próprio" está decidida (D121-006) | GOAL da R1 com revisão de supply chain | plugin próprio mínimo; versões fixadas |
| U-10 | P2 | requisito mínimo do Console para obter token (habilitar só no Cloud × linkar; a doc de erros cita `API_NOT_AVAILABLE` por "não habilitada no Console") **e disponibilidade do opt-in `recentDeviceActivity`** (pré-requisito da R3), que exige projeto linkado | R1 com build do Play | debug enrollment; opção D. Sem `recentDeviceActivity` o pré-requisito da R3 não é cumprido: o dono decide (D-AUTH-07) entre adiar a R3 ou seguir só com pool, *budgets*, pacing e cap (quota `SOFT`) |
| U-11 | P3 | download único da chave `.p8` do DeviceCheck | ao criar a chave | guardar cópia no cofre |
| U-12 | P2 | enquadramento jurídico das declarações (Data Safety/App Privacy/LGPD), **incluindo o status de `installation_id` e da chave pública como dado pessoal** | G-09 | decisão humana; tratamento conservador (potencial dado pessoal) |
| U-13 | P3 | `deviceRecall` (beta): aprovação do formulário, GA e preço | R4 (G-12) | uso opcional; a quota fica `SOFT` sem ele |
| U-14 | P3 | latência Upstash a partir de `iad1`; tamanho real do objeto de atestação iOS | R1 | co-localização |
| U-15 | P3 | controle da região da função no Hobby | Vercel | manter `iad1` |
| U-16 | P3 | veredito forjado com chaves vazadas em aparelhos com root (relato geral, não da doc oficial) | R4 (tiers, alertas) | `MEETS_STRONG_INTEGRITY`, `recentDeviceActivity`, revogação pelo Google; renovação Android sempre com Play Integrity novo |
| U-17 | P3 | classe de acessibilidade do Keychain (`ThisDeviceOnly`), **se itens do Keychain sobrevivem à desinstalação** (habilitaria *re-key*) e se `UserDefaults` exige *required reason API* | docs Apple na implementação | Keychain com `ThisDeviceOnly`; re-key só como upside |
| U-18 | P2 | *(novo, R1)* transporte nativo em aparelho real: 429 do Firewall legível, *timeouts* com o WebView suspenso, o WebView **não** chama o gateway nos builds novos, backup excluído, nenhum `gfat1_` em `localStorage`/IndexedDB/backup JSON | R1, Galaxy S22 + gate estático (7.5) | gate estático e JUnit/XCTest; builds legados seguem no `fetch` até o *sunset* |
| U-19 | P3 | *(novo, R1)* Key Attestation: cobertura nos aparelhos-alvo (API ≥ 24, raízes e CRL) e escolha do verificador (biblioteca Kotlin oficial × TypeScript próprio) | R4 (D-AUTH-10) | *tier* `play_only`: renovação sempre por Play Integrity novo |
| U-20 | P2 | *(novo, R1)* semântica de cobrança do OpenRouter por classe de erro (`429`, `5xx`, *timeout* depois do *dispatch*): quais classes nunca são cobradas | R1: contadores de *outcome* × `usage_daily` | `unknown` **mantém** a quota; L0/L3 usam o `usage` do próprio provedor |
| U-21 | P3 | *(novo, R1)* consistência do Upstash ao mudar de plano (réplicas eventuais) | no upgrade de plano | decisões de segurança em scripts processados pelo líder (9.3) |

---

## Apêndice F — Receita reproduzível da revisão independente (R2 pendente)

Objetivo da **R2**: nova revisão adversarial por **outra família de modelo em relação ao autor**
(Claude). A R1 foi do GPT-5.6 Sol (OpenAI); manter a mesma família permite comparar achado a achado, e
trocar de família amplia a cobertura — escolha do dono. A R2 (1) classifica cada achado da R1 como
`FIXED / PARTIAL / NOT FIXED / DISPUTED` **com evidência** (seção + trecho), (2) procura problemas
**novos** introduzidos pelas correções e (3) confere o texto contra o código. Recomendação do GOAL-117:
o *sandbox* `read-only` do Codex no Windows bloqueia toda leitura de arquivo — por isso o conteúdo vai
**inline** no prompt, nunca pelo working tree.

1. **Pacote** (um único arquivo `.md`): (a) as instruções abaixo; (b) a tabela da R1 (Seção 16.2:
   ID, severidade, achado) como "rodada anterior"; (c) este documento com linhas numeradas; (d) o *diff*
   do documento desde a R1 (`git diff 91fcc92..HEAD -- docs/security/GYMFLOW_AI_GATEWAY_AUTH_ARCHITECTURE_121.md`);
   (e) trechos numerados de `git show HEAD:<caminho>` dos arquivos:
   `CLAUDE.md`, `src/app/api/nutrition/assistant/route.ts`, `src/lib/nutrition/ai-assistant-route.ts`,
   `ai-assistant-client.ts`, `ai-assistant-provider.ts` (linhas 45–190), `ai-assistant-types.ts`
   (60–85, 215–235, 290–345), `src/components/nutrition/AiMealAssistantModal.tsx` (200–222),
   `src/lib/storage-types.ts` (15–50), `src/modules/AuthPages.tsx` (1–30),
   `src/providers/GymFlowContext.tsx` (2160–2270), `android/app/src/main/AndroidManifest.xml`,
   `capacitor.config.ts`, `docs/AI_COST_ABUSE_GUARDRAILS_120.md`,
   `docs/personal/FASE_8_ROADMAP_GOALS.md` (1–60), `package.json` (28–70); (f) os cabeçalhos e
   corpos medidos em Production da Seção 1.3 (400 da função × 429 do Firewall).
2. **Sanitizar e escanear:** nada de `.env*`, keystore, `release-signing.properties` ou credenciais;
   trocar o *slug* do time da Vercel; recusar o envio se o pacote casar com chaves `sk-…`/`or-v1-…`,
   um *Bearer* com token longo, marcador de chave privada ou chave de acesso AWS.
3. **Comando** (Codex CLI ≥ 0.149):

```
codex exec --ignore-user-config -m gpt-5.6-sol -c model_reasoning_effort=high -s read-only --skip-git-repo-check --ephemeral --color never -o review-r2-out.md - < review-r2-prompt.md
```

4. **Se o Codex local não rodar** (a falha `os error 10048` da Seção 16.5 é do ambiente, não do
   desenho): o dono executa a revisão por outro canal, com o **mesmo pacote**, e a registra como *review*
   do PR (foi o que aconteceu na R1). O executor **não** contorna a falha de ambiente.
5. **Rodadas:** R2 → corrigir só a documentação → R3 com a lista da rodada anterior → repetir até
   P0 = P1 = 0 e todos os achados `FIXED`. Manter severidade estrita (o revisor tende a escalar detalhes
   de implementação e itens já listados no Apêndice E).
6. **Registrar** na Seção 16 rodadas, contagens e correções; atualizar as Seções 14/15 e os registros em
   `docs/DECISOES.md`, `docs/PENDENCIAS.md` e `docs/GOALS_LOG.md`.

**Instruções do revisor (R2)** (escala P0–P3 = Seção 3.1):

```
You are an independent senior security/architecture reviewer (a different model family from the
author, who is Claude). ROUND 2. The author produced a DESIGN-ONLY document that turns an
unauthenticated public AI gateway (a Next.js route on Vercel calling OpenRouter, used by a Capacitor
Android/iOS app and a web build) into a protected one. In round 1 you (or another reviewer) returned
CHANGES_REQUIRED with P0=0, P1=4, P2=4, P3=0; the previous findings table is included. The author
rewrote the canonical sections (not an errata). You get the new document (numbered lines), the diff
since round 1, the real code it reasons about, and raw headers measured on Production. You cannot
browse; everything is inline.

TASK 1: for each finding IR-121-01..08 answer FIXED, PARTIAL, NOT FIXED or DISPUTED, quoting the
section and the text that supports the answer. Do not accept a fix that only adds a sentence while
another section still contradicts it: grep every section that mentions the token boundary, the
hardware-backed key claim, quota strength, config precedence, challenge state, idempotency outcomes,
storage loss and privacy wording.
TASK 2: try to break the corrected design and look for NEW problems introduced by the corrections
(native transport plugin as a generic proxy, emergency override, new-installation pool as a DoS
vector, renewal dependence on Google, script atomicity on the store, contradictions between
sections). Focus on: (a) bypass paths that still reach the paid provider or drain quota/budget;
(b) replay (challenge, token, attestation, assertion counter, idempotency); (c) excessive trust in the
client and false equivalence between attestation and authentication; (d) quota that can be reset,
raced, double-spent or bypassed; (e) storage inadequacy (atomicity, loss tolerance, secrets, blast
radius); (f) offline or degraded behaviour breaking local features or already shipped builds;
(g) dependence on platform APIs that may be unavailable; (h) hidden costs and human gates;
(i) privacy mis-statements; (j) internal contradictions, wrong citations, and claims tagged [OFICIAL]
that contradict the official docs (state confidence); (k) anything the GOAL checklist requires that is
missing.

Severity is strict and uses the document's own scale (section 3.1): rate P0/P1 ONLY if the design AS
WRITTEN leaves the path open. Do not escalate wording, implementation details, or items already
listed as UNVERIFIED (Appendix E) that have a mitigation holding whatever the outcome. Out of scope:
the governance decision, legal conclusions, choosing commercial quota numbers.

Output (markdown, concise): 1 VERDICT; 2 PER-FINDING STATUS table for IR-121-01..08 (status +
evidence); 3 NEW FINDINGS table (ID, severity, doc section, title, concrete scenario, proposed fix to
the DOCUMENT); 4 CLAIMS THAT LOOK WRONG OR UNSUPPORTED; 5 GAPS vs the GOAL checklist; 6 COUNTS (P0..P3).
```
