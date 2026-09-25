# Android Internal Release — Guia Operacional (GOAL-115)

Distribuição **interna** do GymFlow Android em build release real.
Não autoriza beta público, Play Production/Open Testing nem marketing de beta.
`READY_FOR_PUBLIC_BETA` permanece `NO` (D-NUT-08/D-NUT-09 PENDING).

Identidade: `com.gymflowai.app` · `versionName 1.0` · `versionCode 1`
(versão atual; regra de versionamento na §6).

---

## 1. Pré-requisitos

- JDK 17 (`JAVA_HOME` apontando para o JDK 17, ex.: Temurin 17.0.13).
- Android SDK com `platforms;android-36` + `build-tools;35.0.0`
  (`ANDROID_HOME` + `android/local.properties` com `sdk.dir=...`).
- Node 20+ e `npm ci` executado.
- Sem dispositivo: build + auditoria funcionam sem aparelho;
  smoke físico fica `REAL_DEVICE_RELEASE_QA = NOT_AVAILABLE`.

## 2. Gerar o release (ordem exata)

```bash
npm run build:mobile          # export estático em out/ (BUILD_TARGET=mobile)
npx cap sync android          # copia out/ para o projeto Android
npm run android:apk:release   # android/app/build/outputs/apk/release/app-release.apk
npm run android:bundle:release # android/app/build/outputs/bundle/release/app-release.aab
```

- `npm run android:build` gera apenas o APK de **debug** — nunca usar para
  validar este gate.
- Após **qualquer** mudança de código/config Android, refazer a sequência
  acima e reconstruir o release antes de distribuir.

## 3. Onde ficam os artefatos

| Artefato | Caminho |
|---|---|
| APK release | `android/app/build/outputs/apk/release/app-release.apk` |
| AAB release | `android/app/build/outputs/bundle/release/app-release.aab` |

Ambos são ignorados pelo git (`*.apk`, `*.aab` no `android/.gitignore`).

## 4. Signing esperado

Arquitetura (sem segredos no git):

1. `android/app/build.gradle` lê credenciais **somente** de
   `android/release-signing.properties` (local, git-ignorado) ou das
   variáveis `GYMFLOW_RELEASE_STORE_FILE`, `GYMFLOW_RELEASE_STORE_PASSWORD`,
   `GYMFLOW_RELEASE_KEY_ALIAS`, `GYMFLOW_RELEASE_KEY_PASSWORD`.
2. Sem credenciais, o Gradle gera release **unsigned** (modo resiliente para
   CI/validação). Com credenciais, gera release **assinado**.
3. Template: `android/release-signing.properties.example`.
   Keystore (`*.jks`/`*.keystore`) e `release-signing.properties` nunca entram
   no git (ver `android/.gitignore`).

Gerar chave de **distribuição interna** (build assinado local, sideload/adb):

```bash
set GYMFLOW_RELEASE_STORE_PASSWORD=***
set GYMFLOW_RELEASE_KEY_PASSWORD=***
node scripts/android-generate-release-key.mjs
# ou: npm run android:generate-release-key
```

O script cria `android/gymflow-internal-key.jks` + preenche
`android/release-signing.properties` (ambos git-ignorados) e nunca imprime
senhas. Flags: `--alias <nome>`, `--file <caminho>`, `--force`.

Verificar assinatura:

```bash
apksigner verify --print-certs android/app/build/outputs/apk/release/app-release.apk
jarsigner -verify android/app/build/outputs/bundle/release/app-release.aab
```

**Ponto de parada humano:** a chave acima serve para validação interna. A
**upload key definitiva** do Google Play exige decisão humana sobre
armazenamento (cofre de senhas + backup offline), senhas fortes e registro do
certificado no Play Console (Play App Signing). Não promover a chave interna a
upload key sem essa decisão. Status atual: `REAL_UPLOAD_KEY = PENDING_HUMAN`.

**GOAL-117:** a upload key definitiva tem ferramenta própria
(`npm run android:upload-key:generate`, `npm run android:play:release`,
`npm run android:release:audit`) — ver
`docs/mobile/ANDROID_PLAY_INTERNAL_ONBOARDING_117.md`. O Gradle passou a
tratar a origem das credenciais de forma atômica (4 variáveis de ambiente
ou o properties local; env parcial falha o build).

## 5. Secrets e backend mobile

Release mobile utiliza **somente**:

- `NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL` → origem pública do backend GymFlow
  (Production atual: `https://gymflow-beige-gamma.vercel.app`), com o client
  chamando `{origem}/api/nutrition/assistant`.

Nunca: OpenRouter direto no client, API key de provedor no bundle,
`localhost` ou URL de dev. A chave do provedor (`GYMFLOW_AI_API_KEY`) vive
somente no servidor (gateway same-origin na web).

Auditoria antes de distribuir:

```bash
npx vitest run src/lib/nutrition/nut008-secrets.test.ts
```

Esperado: `OPENROUTER_API_KEY_EXPOSURE = NO`, `SERVER_SECRET_EXPOSURE = NO`,
`DIRECT_PROVIDER_CALL = NO`. Nunca imprimir valores de secret.

## 6. Versionamento

- `versionCode 1` / `versionName "1.0"` em `android/app/build.gradle`.
- Regra mínima: `versionCode` **inteiro monotônico** — incrementar **+1 a cada
  upload** ao Play (o Console rejeita reutilização/regressão). `versionName` é
  rótulo exibido (`MAJOR.MINOR.PATCH`-ish); cada release interno recebe um
  `versionName` distinto correspondente.
- Não aumentar versão arbitrariamente: este GOAL mantém `1 / 1.0`; o próximo
  upload interno define `versionCode 2` (ou o próximo livre no Console).

## 7. Smoke de release (quando houver aparelho)

Preferir Galaxy S22 se conectado. Usar **sempre o APK/AAB de release**,
nunca debug. Não apagar dados reais sem necessidade.

```bash
adb devices
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Roteiro mínimo: cold boot → onboarding/login → Home → treinos → exercícios →
Nutrição → registro de alimento → IA Nutrição via backend → navegação inferior
→ kill/reopen (persistência) → offline/online básico → back navigation →
ausência de crash. Rotação: somente se suportada (app é portrait).

Sem aparelho: registrar `REAL_DEVICE_RELEASE_QA = NOT_AVAILABLE` (usar
emulador/harness quando viável, sem fabricar PASS).

Validação física de release concluída no **GOAL-116** em Samsung Galaxy S22 SM-S901E:
`REAL_DEVICE_RELEASE_QA = PASS` · `P2_ANR_GOAL115 = CLOSED` (ver `docs/mobile/ANDROID_REAL_DEVICE_RELEASE_QA_116.md`).

## 8. Upload para Internal Testing (checklist de pré-upload, sem publicar)

- [ ] AAB release **assinado** com a chave destinada ao Play.
- [ ] `packageId` = `com.gymflowai.app` (Gradle + Capacitor + Manifest).
- [ ] `versionCode` novo (nunca reutilizado) e `versionName` correspondente.
- [ ] `apksigner`/`jarsigner` confirmam assinatura válida.
- [ ] Secret scan limpo (§5) e backend = Production (§5).
- [ ] App registrado no Play Console; Play App Signing ativo (upload key
      registrada pelo humano responsável).
- [ ] Notas da release + lista de testers internos definidas no Console.

**Não publicar nem enviar ao Google Play sem autorização humana explícita.**

## 9. CI / reprodutibilidade

Workflow `android-internal-readiness.yml` (PR → master): JDK 17 + SDK,
`tsc`, secret gate NUT-008, `build:mobile`, `cap sync`, `assembleRelease` +
`bundleRelease` **unsigned** (sem segredos no CI por desenho), verificação de
artefatos/identidade e scan do bundle web. Distribuição interna continua
exigindo chave local (§4).

## 10. Referências

- `docs/ANDROID_BUILD.md` (fluxo debug local).
- `docs/mobile/MOBILE_CROSS_PLATFORM_005.md` (prontidão Play Store, 16 KB,
  Data Safety, checklist de loja).
- `docs/nutrition/GYMFLOW_NUTRITION_NUT008_INTEGRATED_QA_001.md` (QA Nutrição).
