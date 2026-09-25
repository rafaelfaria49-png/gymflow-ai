# Assistente IA nativo → backend Production (GOAL-118)

**GOAL:** `GYMFLOW-MOBILE-AI-BACKEND-PRODUCTION-BRIDGE-118`
**Base:** `origin/master` `0679e200fcfff699aced298b43011a42e8cba826`
**Objetivo:** fechar o P1 de backend do GOAL-117 (§9 de
`ANDROID_PLAY_INTERNAL_ONBOARDING_117.md`): Assistente IA da Nutrição no app
nativo via backend Production GymFlow, sem chamada direta do cliente ao
OpenRouter.

Fora deste GOAL (inalterados): upload key, Play Console, Play App Signing,
`android:play:release`, versionCode `1` / versionName `1.0`, D-NUT-08 e
D-NUT-09 (`PENDING`).

---

## 1. Fluxo

```
App nativo (WebView https://localhost | capacitor://localhost)
  → POST https://gymflow-beige-gamma.vercel.app/api/nutrition/assistant   (CORS)
    → gateway GymFlow (Vercel, função iad1; chave só no servidor)
      → OpenRouter (API OpenAI-compatible) → modelo
    ← proposta grounded: números recalculados pelo FoodDatabase local
  ← UI: proposta + "Adicionar ao Diário" com confirmação explícita
```

Web continua same-origin (`/api/nutrition/assistant`), sem CORS.

## 2. Gateway: CORS cirúrgico

`src/lib/nutrition/ai-assistant-route.ts` (a rota `route.ts` só delega
`POST`/`OPTIONS`). Classificação pelo header `Origin`:

| Origin | POST | OPTIONS (preflight) |
|---|---|---|
| ausente (servidor/curl) | contrato de sempre, sem CORS | 204 + `Allow`, sem CORS |
| same-origin (host e esquema = requisição) | contrato de sempre, sem CORS | 204 + `Allow`, sem CORS |
| `https://localhost` / `capacitor://localhost` (comparação exata) | contrato de sempre + `Access-Control-Allow-Origin: <origem>` em **toda** resposta (200/400/403/409/413/502/503/504) | 204 só se `Access-Control-Request-Method: POST` e headers ⊆ {`Content-Type`}; senão 403 sem CORS |
| qualquer outra (LAN, túnel, outros hosts Vercel, `null`, `http://localhost`, maiúsculas…) | **403** antes de ler o corpo; provedor nunca chamado; sem CORS | 403 sem CORS |

- Nunca `*`; nunca `Access-Control-Allow-Credentials`.
- Preflight liberado: `Access-Control-Allow-Methods: POST, OPTIONS`,
  `Access-Control-Allow-Headers: Content-Type`, `Access-Control-Max-Age: 600`.
- `Vary: Origin` em todo POST; `Vary: Origin, Access-Control-Request-Method,
  Access-Control-Request-Headers` em todo OPTIONS.
- Nenhum header CORS em `next.config.ts` nem em outras rotas.

## 3. Build mobile: origem explícita e versionada

`npm run build:mobile [-- --ai-backend production|none]` (padrão `production`).

- `production`: embute `PRODUCTION_BACKEND_ORIGIN`
  (`https://gymflow-beige-gamma.vercel.app`, constante versionada em
  `scripts/android/play-release-lib.mjs`). Não depende de `.env`.
- `none`: não embute nada (IA nativa `unavailable` honesta); a variável sai
  do ambiente do `next build`.
- A origem **efetiva** (ambiente + `.env*`, via `@next/env`) só pode repetir
  a Production (modo `production`) ou estar vazia (modo `none`); qualquer
  outra é recusada antes do build (exceção de QA
  `GYMFLOW_ALLOW_NON_PRODUCTION_BACKEND=1` só para HTTPS pública, nunca
  release — a auditoria a reprova como origem estrangeira).
- `android:play:release` passa o modo aprovado ao `build:mobile`
  (`--accept-backend-unavailable` → `none`; `--expect-backend-production` →
  `production`) e confere antes com a mesma regra (`planMobileBackend`).
- O resolvedor do cliente (`ai-assistant-client.ts`) não mudou; o bundle
  compilado passa a ter o literal Production no `.trim()` da origem, que é a
  forma que a auditoria do GOAL-117 reconhece.

Provas de build (2026-09-25): padrão → `out/` com `embedded=true`,
`foreignOrigins=[]`, 0 leitura em runtime; `--ai-backend none` →
`unavailableProven=true`; `.env.production.local` com
`https://evil.example.com` → recusado (modos `production` e `none`); `.env`
com Production + modo `none` → recusado; `--ai-backend staging` → recusado;
`http://192.168.0.6:3000` com exceção de QA → recusado.

## 4. Deploy Production

- Origem do upload: worktree limpo do commit `3ef25b6` (só arquivos
  versionados — nenhuma keystore, `release-signing.properties` ou `.env.local`
  enviados à Vercel).
- `vercel deploy --prod` (projeto `gymflow`): `dpl_9b1V1yrYdvSEUYAn5xoPXjReq2rb`,
  `READY`, alias `https://gymflow-beige-gamma.vercel.app`
  (`X-Vercel-Id: gru1::iad1::…` → edge São Paulo, função Washington/EUA).
  As 2 primeiras tentativas falharam no upload (`fetch failed`, nenhum deploy
  criado); a 3ª concluiu.
- Envs não alteradas; valor de `GYMFLOW_AI_API_KEY` nunca lido/impresso.

## 5. Validação em Production (curl + navegador real)

| Caso | Resultado |
|---|---|
| OPTIONS `https://localhost` | 204, ACAO `https://localhost`, ACAM `POST, OPTIONS`, ACAH `Content-Type`, Vary |
| OPTIONS `capacitor://localhost` | 204, ACAO `capacitor://localhost`, idem |
| OPTIONS `https://evil.example.com`, `http://localhost`, outro host `*.vercel.app` do próprio projeto, `null` | 403, sem CORS |
| OPTIONS nativo pedindo `PUT` / `Authorization` | 403, sem CORS |
| POST Android `complete_protein` | 200 grounded (frango 120 g = 190,8 kcal), ACAO `https://localhost` |
| POST iOS `complete_protein` | 200 grounded, ACAO `capacitor://localhost` |
| POST Android / iOS `substitute_food` | 200 grounded com delta local (iogurte 170 g; cottage 100 g) |
| POST nativo 409 MANUAL_ONLY / 403 gate clínico / 400 JSON inválido / 413 | status do contrato **com** ACAO; 409/403 sem chamar o provedor |
| POST origem estrangeira / outro host Vercel / LAN | 403 `INVALID_REQUEST`, sem CORS |
| POST same-origin (curl) | 200, sem CORS |
| Navegador real na web Production (`fetch` same-origin) | 200 grounded + 409 MANUAL_ONLY, sem CORS |
| Navegador real em `https://example.com` (`fetch` JSON e `text/plain`) | bloqueado (`TypeError: Failed to fetch`) |
| GET | 405 |

## 6. Release Android interno + auditoria

Chave **interna** (`release-signing.properties`, `CN=GymFlow Internal`), sem
upload key, sem `android:play:release`:

```bash
npm run build:mobile
npx cap sync android
cd android && gradlew --no-daemon clean assembleRelease bundleRelease
npm run android:release:audit -- --no-record --expect-backend-production
```

Resultado (HEAD `3ef25b6`): **36 gates PASS, 0 FAIL, 0 WARN**, incluindo
`BACKEND_ORIGIN_ONLY_PRODUCTION`, `BACKEND_PRODUCTION_ORIGIN_EMBEDDED`,
`BACKEND_MODE_MATCHES_APPROVAL`, `AAB_WEB_MATCHES_OUT`, scans de segredo e de
backend de dev (APK, AAB, `out/`), `GIT_TREE_CLEAN`.

- APK SHA-256 `f91bdd7481d8dc1cba743f2aec1017ece488239af4b147e70eadb0116a1f2eda`
- AAB SHA-256 `3804bd06dd69c5f731521cf7ec26ebfd9505b437502f394d716b0f24d2c7b456`
  (chave interna → inelegível para o Play; só smoke)
- versionCode `1` / versionName `1.0`.

## 7. Smoke nativo real (app, não curl)

**Aparelho:** o Galaxy S22 SM-S901E **não estava conectado** ao ADB na
execução. Usado o emulador `Pixel_6_API_35` (Android 15, API 35, x86_64) com o
**mesmo APK release auditado** (hash do `base.apk` instalado ==
`f91bdd74…`), instalado por `adb install -r` sobre a instalação anterior da
mesma chave interna (sem desinstalar, sem wipe).

Preparação: o produto não tem UI de cadastro do perfil nutricional (o Provider
só o lê do estado persistido). Para chegar a metas `AUTOMATED`, foi restaurado
pelo fluxo do próprio app (Admin → Verificar backup → Importar) um backup
lógico v2 gerado com as funções do projeto (inspeção do app: "Backup
verificado"): usuário demo + perfil adulto sem flags clínicas (fixture
NUT-008) + ledger vazio. O estado QA anterior do emulador foi substituído (o
app mantém o predecessor verificável).

| Gate | Resultado |
|---|---|
| Bloqueado (`PROFILE_ABSENT` → MANUAL_ONLY), antes do restore | "Orientação automática pausada … a IA não foi chamada" — o cliente nem chama o gateway (`buildRequest` nulo) |
| AI_NATIVE_COMPLETE_PROTEIN | Peito de frango grelhado 120 g → 190,8 kcal · P 38,4 · C 0 · G 4,32 (= catálogo 159 kcal/100 g × 1,2), nota culinária do modelo |
| AI_NATIVE_SUBSTITUTE_FOOD | arroz branco cozido 100 g → iogurte natural desnatado 170 g (68 kcal); delta −62 kcal · P +4,1 · C −18,85 · G +0,04 calculado localmente |
| Provider real | notas culinárias diferentes entre chamadas idênticas ("Grelhar até dourar…" / "Grelhar até ficar bem cozido…") com macros idênticos → texto do modelo real, números do catálogo |
| AI_CAN_WRITE_LEDGER_AUTOMATICALLY | NO — após 7 propostas, ledger com 0 kcal |
| USER_CONFIRMATION_REQUIRED | YES — "Adicionar ao Diário" abre refeição + Cancelar/Confirmar inclusão; cancelado, nada gravado |
| AI_CAN_WRITE_TARGETS | NO — meta 2839 kcal inalterada do início ao fim |
| Offline (Wi-Fi + dados desligados) | "IA indisponível (AI_UNAVAILABLE) — Não foi possível alcançar o backend de IA (rede indisponível?)"; registro de água feito offline gravado |
| Online | IA volta a responder (ver §8) |
| Ledger | kill + reopen: 500 ml / 2 registros de hidratação (1 feito offline) preservados |
| Crash / ANR / erro CORS no logcat | 0 / 0 / 0 |

Prova de rede (captura `-tcpdump` do emulador, interface celular): as 3
chamadas feitas pela rede celular abriram TLS com SNI
`gymflow-beige-gamma.vercel.app` (216.198.79.194:443); **0** consultas DNS ou
conexões para `openrouter`. Demais hosts: serviços do sistema Google.

## 8. Observação honesta: 1ª chamada após troca de rede no Wi-Fi do emulador

No Wi-Fi virtual do emulador, 4 chamadas expiraram no timeout **do cliente**
(15 s; mensagem "Assistente IA excedeu o tempo de resposta.", sem proposta
fake) — todas a primeira chamada depois de uma troca da rede padrão (4 de 5
casos no Wi-Fi; o 5º, alternando só o Wi-Fi com a celular ligada, passou). O
logcat mostra o AP virtual com `CTRL-EVENT-BEACON-LOSS` a cada ~8 s e
desassociações espontâneas (`reason=3/4`). Na rede celular do emulador a
primeira chamada após troca de rede passou 3/3 (troca Wi-Fi→celular e 2
ciclos offline → online; o DNS pós-reconexão levou ~13 s num ciclo). Com a
rede estável, "Tentar novamente" sempre voltou a funcionar (numa ocorrência a
2ª tentativa também expirou porque o AP virtual caiu de novo no meio dela).

Não reproduzido em rede estável; não comprovado em aparelho real. Pendência
registrada: repetir no S22 (Wi-Fi real) e, se reproduzir, avaliar
`ACCESS_NETWORK_STATE` (o WebView só observa trocas de rede com essa
permissão) e o orçamento de 15 s do cliente (DNS + TLS + preflight + até 12 s
do provedor).

## 9. Segredos (artefatos deste GOAL)

| Alvo | GYMFLOW_AI_API_KEY | `openrouter.ai` | `chat/completions` | Bearer real | host dev/estrangeiro |
|---|---|---|---|---|---|
| `out/` (371 arquivos) | 0 | 0 | 0 | 0 | 0 (só `gymflow-beige-gamma.vercel.app`) |
| APK (808 entradas) / AAB | 0 | 0 | 0 | 0 | 0 (gates da auditoria) |
| chunks JS servidos pela Production | 0 | 0 | 0 | 0 | só Production |

`DIRECT_OPENROUTER_CLIENT_CALL = NO` · `SECRET_EXPOSURE = NO`.

## 10. Privacidade (fatos; sem aprovação jurídica)

Com este GOAL o app **nativo** passa a transmitir, **somente quando o usuário
pede uma proposta ao Assistente IA**, o contexto nutricional mínimo:
app → gateway GymFlow (Vercel; edge São Paulo, função nos EUA) → OpenRouter →
modelo. Campos por caso em
`docs/nutrition/GYMFLOW_NUTRITION_LEGAL_DOSSIER_D_NUT_09.md` §4. Inventário e
checklist de Data Safety atualizados em
`docs/mobile/MOBILE_CROSS_PLATFORM_005.md` §9; iOS em
`docs/mobile/MOBILE_CROSS_PLATFORM_006.md`. D-NUT-09 continua `PENDING`.

## 11. Status

| Critério | Status |
|---|---|
| CORS_ANDROID / CORS_IOS | PASS / PASS |
| CORS_UNAUTHORIZED_ORIGIN | BLOCKED |
| BACKEND_PRODUCTION / BACKEND_PRODUCTION_ORIGIN_EMBEDDED | PASS / PASS |
| AI_NATIVE_RUNTIME | PASS (emulador; S22 indisponível) |
| AI_NATIVE_PROVIDER_REAL | YES |
| AI_NATIVE_CURL_SUBSTITUTE | NO |
| MODEL_MACROS_TRUSTED / AI_CAN_WRITE_TARGETS | NO / NO |
| USER_CONFIRMATION_REQUIRED | YES |
| OFFLINE_DEGRADATION / ONLINE_RECOVERY | PASS / PASS (ressalva §8) |
| DIRECT_OPENROUTER_CLIENT_CALL / SECRET_EXPOSURE | NO / NO |
| VERSION_CODE / VERSION_NAME | 1 / 1.0 |
| D_NUT_08 / D_NUT_09 EXTERNAL_APPROVAL | PENDING / PENDING |

Para retomar o GOAL-117, o build Play usa `--expect-backend-production`.
