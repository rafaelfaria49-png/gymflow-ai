# Google Play Internal Testing — Onboarding (GOAL-117)

**GOAL:** `GYMFLOW-ANDROID-PLAY-INTERNAL-ONBOARDING-ENDTOEND-117`
**Base:** `origin/master` `5619d27275292484c34be4c6b25802e077514d3e`
**Package:** `com.gymflowai.app` · **Trilha permitida:** somente Internal Testing
**Proibido:** Production, Open Testing, Closed Testing público, pré-registro, beta público.
D-NUT-08/D-NUT-09 continuam `PENDING` (não alterados por este GOAL).

> Estado atual: **parado em `HUMAN_KEY_BACKUP_DECISION_REQUIRED`**.
> Nenhuma ação foi feita no Google Play. Nenhuma upload key definitiva existe
> ainda. Ver §11 (o que o humano precisa responder) e §12 (gate do Play).

---

## 1. Pré-flight (2026-09-24)

| Item | Resultado |
|---|---|
| HEAD / origin/master | `5619d27` == base esperada; árvore limpa |
| packageId | `com.gymflowai.app` (Gradle `applicationId`/`namespace`, `capacitor.config.ts`, manifest do APK e do AAB) |
| versionCode / versionName | `1` / `1.0` (`android/app/build.gradle`) |
| Toolchain | AGP 8.7.2 · Gradle 8.11.1 · JDK 17.0.13 (Temurin) · build-tools 35.0.0 · compile/target SDK 36 · min SDK 23 |
| Capacitor | 7.6.7 (`@capacitor/android`, CLI) |
| Signing atual | `android/release-signing.properties` (git-ignorado) → chave **interna** `gymflow-internal` (`CN=GymFlow Internal`, SHA-256 `A3:27:3A:11:…:DE:54:7C`). **Não** é a upload key e não será promovida. |
| Artefatos existentes | APK release SHA-256 `5fc49335…d857b803` (o mesmo do GOAL-116) e AAB de 17/09 — ambos assinados pela chave interna → **inelegíveis** para o Play. |
| Segredos no git | nenhum `.jks/.keystore/.p12/.properties` de assinatura rastreado, nem no histórico |
| Docs 115/116 | lidos; 116 registrou `REAL_DEVICE_RELEASE_QA = PASS` no Galaxy S22 com a chave interna |

## 2. Estado do Google Play (não consultável daqui)

Este ambiente **não** tem acesso à conta do Play Console (login/2FA são do
humano). Nada foi presumido. O humano precisa confirmar:

| # | Pergunta | Por que importa |
|---|---|---|
| P1 | Existe conta de desenvolvedor Google Play ativa e com identidade verificada? (o GOAL-020 registrou que ainda não existia) | sem conta não há Internal Testing |
| P2 | O app `com.gymflowai.app` já foi criado no Console? Em qual conta? | o package fica **preso para sempre** à conta no 1º upload |
| P3 | Play App Signing já está configurado para ele? (Configuração → Integridade do app) | escolha da chave de assinatura do app é irreversível |
| P4 | Algum AAB/APK já foi enviado em qualquer trilha? Qual o maior versionCode? | o Play rejeita versionCode repetido |
| P5 | Já existe upload certificate registrado? Se sim, qual SHA-256? | se existir, a nova chave NÃO é aceita sem reset formal |
| P6 | App gratuito? (Free → Paid é irreversível no Play) | "Não implementar pagamento real" sugere Free — decisão humana |

## 3. Upload key definitiva

Ferramenta: `npm run android:upload-key:generate -- --out-dir "<diretório seguro>"`
(`scripts/android-generate-upload-key.mjs`).

- Chave **nova e separada** da interna: alias `gymflow-upload`, PKCS12,
  RSA 4096, SHA256withRSA, validade 10000 dias (≈2054; o Play exige validade
  além de 2033).
- `--out-dir` é **obrigatório** e sem default: o humano escolhe e cria o
  diretório. O script recusa qualquer caminho dentro de repositório git e
  nunca sobrescreve chave/certificado existentes.
- Senha digitada **sem eco**, duas vezes, mínimo 16 caracteres. Ela vai ao
  keytool só por variável de ambiente do processo filho (`-storepass:env`):
  nunca em argumento, arquivo, log ou relatório. Não há
  `release-signing.properties` para a upload key.
- Saídas: `gymflow-upload-key.jks` (PRIVADO, no diretório escolhido),
  `gymflow-upload-certificate.pem` (público) e, no repo,
  `android/play-upload-certificate.json` — registro **público** (DN,
  SHA-256, SHA-1, validade) que vira o contrato de assinatura do build e da
  auditoria.
- A chave interna (`android/gymflow-internal-key.jks`) continua só para
  sideload/QA local.

## 4. Backup (pré-condição de `UPLOAD_KEY = READY`)

A chave só é considerada READY com evidência (declarada pelo humano, sem
expor segredo) de:

1. **cópia primária** — o `.jks` no local escolhido;
2. **backup offline separado** — ex.: pendrive/HD criptografado guardado fora
   deste PC (não só nuvem sincronizada no mesmo PC);
3. **senha separada em cofre confiável** — gerenciador de senhas, nunca junto
   do `.jks`, nunca no git/docs.

Com Play App Signing (chave do app gerada pelo Google), perder a upload key é
recuperável via pedido de reset ao suporte do Play — mas custa dias e bloqueia
releases. Por isso o backup é obrigatório antes do 1º upload.

Status: `UPLOAD_KEY_BACKUP = HUMAN_KEY_BACKUP_DECISION_REQUIRED`.

## 5. Versionamento

- Mantido `versionCode 1` / `versionName 1.0` até o humano responder P4.
- Nada enviado ao Play (P4 = nenhum) → `1` é válido e será usado.
- Já existe versionCode N no Play → próximo inteiro livre (`N+1`), via PR, e
  `versionName` correspondente.
- O build exige `--expect-version-code <N>` e recusa se o `build.gradle`
  divergir: o operador confirma conscientemente o número aceito pelo Console.

## 6. Build final (executado pelo humano, pede a senha sem eco)

```bash
npm run android:play:release -- --keystore "<dir seguro>\gymflow-upload-key.jks" --expect-version-code 1 --accept-backend-unavailable
```

Modo de backend obrigatório e exclusivo, igual ao aprovado no gate (§12):
`--accept-backend-unavailable` (IA nativa indisponível, §9) ou
`--expect-backend-production` (só depois do GOAL de backend). O script
calcula a origem **efetiva** (ambiente + `.env*`, com o carregador do Next)
antes de compilar e recusa se ela não bater com o modo; a auditoria confere
de novo no bundle (`BACKEND_MODE_MATCHES_APPROVAL`).

O script (`scripts/android-play-release.mjs`):

1. retira do próprio ambiente toda variável de senha logo no início (nenhum
   filho a herda; keytool/Gradle recebem a senha só por env explícito);
2. exige o registro público da upload key e keystore fora de repo git
   (symlink/junction resolvidos antes da checagem);
3. exige árvore git limpa antes do build e de novo depois do `cap sync`;
4. confere keystore + alias + senha → fingerprint **igual** ao registro
   **antes** de compilar (senha errada ou chave errada = nada compilado);
5. sempre regenera o web: `npm run build:mobile` → `npx cap sync android`
   (não existe `--skip-web` no fluxo Play);
6. `gradlew --no-daemon clean assembleRelease bundleRelease` com as 4
   `GYMFLOW_RELEASE_*` (o properties da chave interna é ignorado; `--no-daemon`
   impede daemon de reter a senha);
7. roda a auditoria (§7) e falha se qualquer gate falhar.

Saídas: `android/app/build/outputs/apk/release/app-release.apk`,
`android/app/build/outputs/bundle/release/app-release.aab` e
`android/app/build/outputs/play-release-manifest.json` (hashes + gates).

`android/app/build.gradle` agora trata a origem das credenciais de forma
**atômica**: as 4 variáveis de ambiente ou o properties local; env parcial
falha o build (impede misturar keystore de uma chave com alias/senha de outra).

## 7. Assinatura e auditoria (sem senha)

```bash
npm run android:release:audit -- --accept-backend-unavailable
```

`scripts/android-release-audit.mjs` verifica e registra:

- APK: `apksigner verify --print-certs` (1 signer, não-debug);
- AAB: `jarsigner -verify -verbose` — toda entrada de payload com assinatura
  verificada (o jarsigner só *avisa* sobre entrada não assinada, então
  "jar verified." sozinho não basta) — e exatamente **um** signer
  (`keytool -printcert -jarfile` + jarsigner);
- signer do APK == signer do AAB == `UPLOAD_CERT_SHA256` do registro;
- bundle web do AAB **idêntico, arquivo a arquivo (sha256), ao `out/`** atual
  (extras só `cordova.js`/`cordova_plugins.js`, injetados pelo Capacitor);
- árvore git limpa (`GIT_TREE_CLEAN`; `--allow-dirty` só é aceito com
  registro de chave descartável de teste, nunca com a upload key real);
- backend, lido do **resolvedor compilado** do endpoint do assistente:
  `BACKEND_ORIGIN_ONLY_PRODUCTION` — qualquer URL literal ≠ Production no
  resolvedor é FAIL duro, sem waiver (seria o app mandando dados de nutrição
  para outro servidor); `BACKEND_PRODUCTION_ORIGIN_EMBEDDED` — Production
  entrando no `.trim()` da origem e nenhuma leitura em runtime restante →
  PASS; resolvedor que comprovadamente lê em runtime sem literal → aviso
  somente com `--accept-backend-unavailable` (aceite registrado no
  manifest); qualquer outro formato → FAIL. A evidência exige a forma
  compilada do resolvedor com **vínculo por identificador** (o valor que
  entra no `.trim()` é o mesmo interpolado em `${x}/api/nutrition/assistant`);
  se o minificador mudar essa forma, o gate falha (nunca passa por engano);
  `BACKEND_MODE_MATCHES_APPROVAL` — bundle igual ao modo declarado;
- scan de segredos no AAB **inteiro** (base, módulos, BUNDLE-METADATA);
- identidade de APK **e** AAB (manifest proto do AAB lido via `aapt2`):
  package, versionCode, versionName == `build.gradle`; sem `debuggable`;
- `capacitor.config.json` embarcado: appId correto,
  `webContentsDebuggingEnabled != true`, sem `server.url`;
- nenhum keystore/properties/.env dentro de APK/AAB;
- scan (só contagens, nunca valores) do web bundle, dex e recursos do APK,
  AAB e `out/`: chaves OpenRouter/OpenAI/Google/GitHub/Blob, nomes de
  variáveis server-side, `openrouter.ai`, `chat/completions`, PEM privado,
  `storePassword=`, URLs de dev (`http://localhost`, 127.0.0.1, 10.0.2.2,
  LAN, túneis) e hosts `*.vercel.app` ≠ Production;
- git: `KEYSTORE_IN_GIT`; `SIGNING_PASSWORD_IN_GIT` = nenhum valor literal
  atribuído a `storePassword`/`keyPassword`/`GYMFLOW_RELEASE_*_PASSWORD`/
  `GYMFLOW_UPLOAD_KEY_*` em arquivo versionado (placeholders aceitos).

Campos do gate: `AAB_SHA256`, `APK_SHA256`, `UPLOAD_CERT_SHA256`,
`UPLOAD_CERT_SHA1`, `SIGNING_CERT_SUBJECT`.

Baseline (artefatos da chave interna, `--no-record`): todos os gates PASS
exceto backend não embutido (§9). E2E com chave **descartável** (apagada
depois): ver GOALS_LOG do GOAL-117.

## 8. Segredos

| Gate | Baseline 2026-09-24 |
|---|---|
| SERVER_SECRET_EXPOSURE | NO (0 marcadores em APK/AAB/out) |
| OPENROUTER_KEY_EXPOSURE | NO |
| DIRECT_OPENROUTER_CLIENT_CALL | NO (0 `openrouter.ai`, 0 `chat/completions`) |
| KEYSTORE_IN_GIT | NO |
| SIGNING_PASSWORD_IN_GIT | NO (só placeholders no `.example`) |

A mesma auditoria roda de novo sobre o AAB final assinado pela upload key.

## 9. Backend Production — achado P1

O release Android **não aponta para backend nenhum** hoje:

1. `NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL` nunca é definida no build mobile (não
   está em `.env.local`, no CI nem em script). O bundle lê a variável em
   runtime → no app nativo a IA resolve para `unavailable` ("Backend de IA
   não configurado no app"). Honesto (sem IA fake), mas sem backend.
2. O gateway Production não envia CORS para a origem do WebView:
   `OPTIONS /api/nutrition/assistant` com `Origin: https://localhost` →
   `204`, `Allow: OPTIONS, POST`, **sem** `Access-Control-Allow-Origin`;
   `POST` inválido com o mesmo Origin → `400` sem header CORS. Mesmo com a
   origem embutida, o WebView bloquearia a chamada.
3. O `AI_BACKEND_SMOKE = PASS` do GOAL-116 foi um `curl` a partir do shell do
   aparelho; o app em si não chamou o backend (a salvaguarda clínica encerrou
   o fluxo antes). A chamada app → backend nunca foi exercitada em nativo.

O que este GOAL fez (local e seguro): `build:mobile` passou a aceitar como
origem **somente** `https://gymflow-beige-gamma.vercel.app` (ou nenhuma):
HTTP, localhost/LAN/emulador, túneis, provedor de IA direto e outros hosts
são recusados; o build Play remove a exceção de QA do ambiente. O valor
validado é o **efetivo** — calculado com o carregador do próprio Next
(`@next/env`, mesmos `.env*` e ordem), porque um `.env*` ignorado pelo git
preencheria a variável depois da checagem — e é fixado no `next build`.

O que **não** fez: embutir a origem (sem CORS, só trocaria "não configurado"
por uma falha de rede enganosa) nem mexer no backend/deploy (fora do escopo
pelo CLAUDE.md e exige autorização de Production).

Correção real (GOAL separado, com autorização): CORS allowlist
(`https://localhost` Android, `capacitor://localhost` iOS) na rota do
assistente → deploy Production → build com
`NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL=https://gymflow-beige-gamma.vercel.app`
→ novo versionCode → smoke da IA no aparelho → atualizar Data Safety (dados
de nutrição passam a sair do aparelho).

`BACKEND_PRODUCTION = FAIL (NOT_CONFIGURED)` · sem localhost, dev, OpenRouter
direto ou segredo no cliente.

## 10. Revisão independente

Codex CLI com GPT-5.6-Sol (família OpenAI), sem acesso a disco/rede: o
conteúdo dos arquivos vai inline no prompt (o sandbox read-only do Codex no
Windows bloqueia toda leitura — a 1ª tentativa se recusou a opinar sem ler,
corretamente). Escopo: identidade, versionamento, arquitetura de assinatura,
upload certificate, segredos, AAB, backend, debug e esta documentação.

- Rodada 1 (commit `e77d03f`): **P0=0 · P1=5 · P2=2** — jarsigner aceitava
  entrada não assinada e só o 1º signer era lido; `--skip-web` e comparação
  web só por `index.html` (aviso); git checado só antes do `cap sync`;
  "fora do repo" sem resolver symlink/junction; backend FAIL virava aviso
  sem aceite humano; env de senha herdado por filhos; scan de senha no git
  estreito. **Todos corrigidos** (§6/§7).
- Rodada 2 (commit `0574d75`): **P0=0 · P1=3 · P2=3** — F1/F2/F4/F5/F6
  confirmados corrigidos; F3 parcial (`--allow-dirty` ainda no comando
  definitivo, exit code do git ignorado), F7 parcial (`.example`/arquivos
  grandes pulados, senha com espaço entre aspas); novos: backend continua
  indisponível (= achado §9, fora do escopo), gate de backend aceitava a URL
  em qualquer arquivo, scan só em `base/` do AAB, gate humano sem
  autorização explícita de criação do app/Free. Todos corrigidos, exceto o
  backend (§9), que segue P1 aberto para decisão humana.
- Rodada 3 (commit `928cca2`): **P0=0 · P1=2 · P2=3** — N3/N4 confirmados;
  N1 (backend) reconhecido como "aberto, corretamente documentado e com
  gate" (waiver humano, não fix); F3 residual (a exceção de teste confiava no
  subject do registro, editável), F7 residual (`.properties.example` não era
  tratado como config; placeholder aceito por prefixo), N2 residual
  (coocorrência no mesmo chunk), N5 novo (scan de dev sem 172.16/12,
  0.0.0.0, `[::1]`, `.local`). Todos corrigidos: exceção de teste amarrada
  ao certificado real do keystore/AAB; placeholders por gramática exata;
  evidência do backend exige a expressão do resolvedor (validado nos dois
  modos reais do bundle); definição única de host privado.
- Rodada 4 (commit `7ee0d8a`): **P0=1 · P1=1 · P2=2** — F3/F7/N5
  confirmados; N1 segue aberto por desenho; **N6 (P0)**: a trava do
  `build:mobile` via só o ambiente do processo, e o `next build` carrega
  `.env*` ignorados pelo git depois — um `.env.local` poderia embutir
  qualquer backend HTTPS, e a auditoria só barrava hosts `*.vercel.app`;
  N2 residual (literal próximo sem prova de fluxo); N7 (valor de config com
  pontuação inicial escapava). Corrigidos: valor efetivo via `@next/env` +
  fixado no build; auditoria extrai as origens do resolvedor (estrangeira =
  FAIL duro, waiver só com indisponibilidade comprovada); evidência exige o
  literal Production entrando no `.trim()` da origem; valores de config
  lidos por linha. Provado em builds reais: `.env.production.local` com
  origem estrangeira → recusado antes do build; com Production → embutido e
  detectado; bundle real com origem estrangeira (exceção de QA) →
  `foreignOrigins` detectado.
- Rodada 5 (commit `d66bb9d`): **P0=0 · P1=2 · P2=3** — N6 (P0)
  confirmado corrigido; N1 segue aberto por desenho; **N8 (P1)**: o release
  decidia o waiver só pelo ambiente do processo, enquanto o `build:mobile`
  podia obter a origem de um `.env` — a aprovação humana não restringia o
  modo embutido; N2 (vínculo por identificador), N7 (aspas sem par, `#`
  inline em `.properties`, chave JSON), N9 (resumo da CI apontava a chave
  interna). Corrigidos: modos exclusivos `--accept-backend-unavailable` /
  `--expect-backend-production` conferidos contra a origem efetiva antes do
  build e contra o bundle depois; evidência com vínculo por identificador
  (validada nos dois modos reais); leitura de config por formato; resumo da
  CI separando CI sem assinatura / sideload / Play.
- Rodada 6 (commit `473b440`): **P0=0 · P1=1 · P2=2** — N8, N2, N7, N9
  confirmados corrigidos; único P1 = N1 (backend, aberto por desenho, "waiver
  explícito e corretamente amarrado ao artefato"); P2: N10 (atribuição sem
  aspas em bloco de código Markdown / arquivo sem extensão) e N11 (template
  `release-signing.properties.example` sugeria upload key dentro de
  `android/`). Ambos corrigidos (blocos cercados e arquivos sem extensão
  lidos como script; template marcado "somente chave interna"; guia antigo
  do MOBILE-005 aponta para este runbook).
- Rodada 7 (commit `08cbf90`): **P0=0 · P1=2 · P2=1** — N11 confirmado;
  N1 segue aberto por desenho; **N12 (P1)**: o gate não tinha autorização
  explícita para **lançar** a versão no Teste interno (passo 13.7); N10
  parcial (cerca Markdown recuada 1–3 espaços). Corrigidos:
  `INTERNAL_RELEASE_LAUNCH_AUTHORIZED` separado do upload, cada passo do
  Console amarrado à sua autorização; cercas recuadas lidas como script.
- Rodada 8 (confirmação): ver GOALS_LOG do GOAL-117.

A revisão do **AAB final** e do certificado real só é possível após a upload
key existir: repetir antes do gate do §12.

## 11. Checkpoint humano atual — `HUMAN_KEY_BACKUP_DECISION_REQUIRED`

Para continuar, o humano informa (sem enviar senha a ninguém):

1. respostas P1–P6 (§2);
2. o **diretório seguro** da upload key (fora de qualquer repo git);
3. a estratégia de backup (§4): onde fica o backup offline e em qual cofre a
   senha ficará — só a descrição, nunca a senha;
4. decisão sobre o achado P1 de backend (§9): seguir para Internal Testing
   com a IA nativa indisponível (limitação conhecida) ou corrigir antes.

Depois, num terminal interativo:

```bash
npm run android:upload-key:generate -- --out-dir "<diretório seguro>"
```

Depois o registro público (`android/play-upload-certificate.json`) entra no
git via PR (o build exige árvore limpa), e então:

```bash
npm run android:play:release -- --keystore "<diretório seguro>\gymflow-upload-key.jks" --expect-version-code <N> --accept-backend-unavailable
```

e avisa para a auditoria, a revisão independente final e o gate do §12.

## 12. Gate humano obrigatório (antes de qualquer ação irreversível no Play)

Antes de: escolher/ativar Play App Signing · registrar upload certificate ·
criar o app definitivo · enviar AAB · criar release Internal Testing, o
humano recebe:

```
PACKAGE_ID
VERSION_CODE
VERSION_NAME
AAB_SHA256
UPLOAD_CERT_SHA256
UPLOAD_CERT_SHA1
KEY_BACKUP_STATUS
SECRET_SCAN
BACKEND_PRODUCTION            (EMBEDDED | NOT_CONFIGURED)
BACKEND_LIMITATION_ACCEPTED   (YES/NO — só quando NOT_CONFIGURED; define o
                               modo do build: --accept-backend-unavailable)
INDEPENDENT_REVIEW_RESULT
```

e responde explicitamente, cada item em separado:

```
PLAY_APP_CREATION_AUTHORIZED = YES/NO   (só se o app ainda não existe — P2)
  PLAY_DEVELOPER_ACCOUNT = <conta/e-mail do Console que ficará dona do package>
  PACKAGE_ID = com.gymflowai.app        (preso para sempre a essa conta)
  PRICING = FREE | PAID                 (FREE não pode virar PAID depois)
PLAY_APP_SIGNING_AUTHORIZED = YES/NO    (chave do app gerada pelo Google; o
                                         1º AAB enviado registra o upload
                                         certificate = UPLOAD_CERT_SHA256)
INTERNAL_AAB_UPLOAD_AUTHORIZED = YES/NO (enviar o AAB aprovado à trilha
                                         Teste interno, sem lançar)
INTERNAL_RELEASE_LAUNCH_AUTHORIZED = YES/NO (iniciar o lançamento da versão
                                         no Teste interno para os testers
                                         listados — ação visível aos testers)
```

Sem `YES` explícito em cada item, a ação correspondente não acontece no
Play. Nenhum item autoriza outro por inferência.

## 13. Passos no Play Console (somente após autorização; conta/2FA do humano)

1. **Criar app** (somente com `PLAY_APP_CREATION_AUTHORIZED = YES`, na conta
   e com o `PRICING` autorizados): nome GymFlow, idioma padrão pt-BR, App,
   gratuito/pago conforme autorizado, aceitar declarações. Irreversível:
   gratuito não vira pago; o package fica preso à conta no 1º upload.
2. **Testes → Teste interno → Testadores:** lista de e-mails autorizados
   (Google Groups ou lista); copiar o link de participação (opt-in).
3. **Teste interno → Criar versão** (somente com
   `PLAY_APP_SIGNING_AUTHORIZED = YES`): na primeira versão o Console pede a
   chave de assinatura do app → **"Usar chave gerada pelo Google"**
   (recomendado; irreversível na prática).
4. **Enviar `app-release.aab`** (somente com
   `INTERNAL_AAB_UPLOAD_AUTHORIZED = YES`) — o mesmo arquivo cujo
   `AAB_SHA256` foi aprovado no gate. Recalcular o hash imediatamente antes
   do upload; se o arquivo mudou, repetir auditoria + gate. O 1º AAB registra
   o upload certificate.
5. Conferir em **Integridade do app → Assinatura do app** que o
   "Certificado da chave de upload" tem o `UPLOAD_CERT_SHA256` aprovado.
   Anotar o SHA-256 do "Certificado da chave de assinatura do app" (Google)
   para verificar a instalação.
6. Notas mínimas da versão (pt-BR), por exemplo: "Build interno 1.0 (1) —
   validação técnica. Assistente de IA nativo indisponível nesta versão."
7. **Revisar e iniciar lançamento no Teste interno** — somente com
   `INTERNAL_RELEASE_LAUNCH_AUTHORIZED = YES` (upload autorizado não implica
   lançamento). Se o Console exigir ação não coberta pelas autorizações,
   parar e perguntar. Nunca promover para
   Fechado/Aberto/Produção. O Console pode pedir tarefas do Painel
   (política de privacidade, acesso ao app, anúncios, classificação, público
   alvo, Segurança dos dados): preencher só o que ele exigir, com os fatos de
   `docs/mobile/MOBILE_CROSS_PLATFORM_005.md` §9.

## 14. Instalação via Play e smoke (Galaxy S22 preferencial)

- O S22 tem o `com.gymflowai.app` do GOAL-116 assinado pela chave **interna**;
  o build do Play vem assinado pela chave do Google → assinatura diferente →
  é preciso **desinstalar antes**, o que apaga os dados locais do app no
  aparelho. Exige autorização humana explícita (como no GOAL-116).
- A conta Google do aparelho precisa estar na lista de testadores e aceitar
  o link de participação; instalar pela Play Store.
- Provar origem Play (não adb):
  `adb shell dumpsys package com.gymflowai.app | findstr installerPackageName`
  → `com.android.vending`; e o signer do `base.apk` instalado ==
  certificado da chave de assinatura do app (Console), não o upload cert.
- Smoke mínimo: cold boot · Home · Treinos · persistência (kill/reopen) ·
  Nutrição · backend (esperado hoje: IA nativa indisponível, §9) ·
  offline/online · 0 crash / 0 ANR (logcat + `dumpsys activity anrs`).

## 15. Status do GOAL-117 neste checkpoint

| Critério | Status |
|---|---|
| TOOLING (key/build/audit) | READY — 5 E2E completos com chave descartável (apagada), testes de adulteração e negativos |
| UPLOAD_KEY | PENDING_HUMAN (ferramenta pronta e testada com chave descartável) |
| UPLOAD_KEY_BACKUP | HUMAN_KEY_BACKUP_DECISION_REQUIRED |
| UPLOAD_CERT | PENDING (não existe ainda) |
| AAB_RELEASE / AAB_SIGNING | PENDING (depende da upload key) |
| SECRET_EXPOSURE | NO (baseline) |
| BACKEND_PRODUCTION | FAIL — NOT_CONFIGURED + CORS ausente (P1, §9) |
| PLAY_APP_SIGNING | BLOCKED_HUMAN_GATE |
| INTERNAL_TESTING_UPLOAD | BLOCKED_HUMAN_GATE |
| PLAY_INTERNAL_INSTALL_QA | NOT_YET_AVAILABLE |
| PUBLIC_BETA_PUBLISHED | NO |
| PLAY_PRODUCTION_PUBLISHED | NO |
