# Relatório de Validação de Build e Runtime iOS em macOS Real — GymFlow AI
**ID do Documento:** `docs/mobile/IOS_CLOUD_MAC_BUILD_015.md`  
**GOAL:** `GYMFLOW-IOS-CLOUD-MAC-BUILD-015`  
**Data:** 04 de Setembro de 2026  
**Status do Marco:** APROVADO COM ÊXITO (Validação Real em macOS / GitHub Actions)  
**HEAD Base:** `37e9cff9dc314a254a2afb48f9cfaadbc986fe82` (`origin/master`)  
**Branch de Execução:** `ci/ios-cloud-runtime-015`  
**Pull Request:** [#24](https://github.com/rafaelfaria49-png/gymflow-ai/pull/24)  
**GitHub Actions Run ID:** [33869909010](https://github.com/rafaelfaria49-png/gymflow-ai/actions/runs/33869909010)  
**Runner macOS:** `macos-14` (Apple Silicon M1, macOS Sonoma)  
**Bundle ID Canônico:** `com.gymflowai.app`  

---

## 1. Contexto e Objetivos do Marco

O marco **GOAL-015** foi estabelecido com o propósito de:
1. **Corrigir a classificação documental do GOAL-014**, expurgando a falsa qualificação de `FAIL` para etapas nativas impossíveis de executar em ambiente Windows e removendo a classificação indevida de host incompatível como bug `P1` de produto (classificando-o como `EXTERNAL_ENVIRONMENT_BLOCKER`);
2. **Criar validação automatizada em macOS real via GitHub Actions** utilizando runner hospedado explicitamente versionado (`macos-14`);
3. **Provar compilação nativa (`xcodebuild`), instalação no Simulator (`simctl install`) e inicialização limpa (`simctl launch`)** com renderização visual real do GymFlow AI;
4. **Respeitar os limites de evidência**, não iniciando e não publicando TestFlight ou App Store.

---

## 2. Correção Documental do GOAL-014

Em conformidade com a auditoria:
- O arquivo [IOS_MAC_RUNTIME_VALIDATION_014.md](file:///c:/Projetos/gymflow-ai/docs/mobile/IOS_MAC_RUNTIME_VALIDATION_014.md) foi revisado e corrigido.
- As etapas dependentes da toolchain Apple que não puderam ser executadas no host Windows (`IOS_XCODE_BUILD`, `IOS_SIMULATOR_INSTALL`, `IOS_SIMULATOR_RUNTIME`, `IOS_PERSISTENCE`, `IOS_BACKGROUND_FOREGROUND`, `IOS_KEYBOARD_SAFE_AREA`, `IOS_MEDIA_FALLBACK`, `IOS_OFFLINE_RUNTIME`, `IOS_BACKUP_SHARE`) foram reclassificadas de `FAIL` para `NOT_EXECUTED` / `PENDING_MAC`.
- A ausência da Apple Toolchain no host Windows 11 foi formalmente registrada como `EXTERNAL_ENVIRONMENT_BLOCKER = 1`, e os contadores de produto foram corrigidos para `P0 = 0`, `P1 = 0`, `P2 = 0`, `P3 = 0`.
- 100% dos logs e comandos originais da auditoria anterior foram integralmente preservados.

---

## 3. Diagnóstico Real da Toolchain Apple no Runner macOS

No job do GitHub Actions (Run `33869909010`), a toolchain real do runner `macos-14` foi auditada e registrada:

| Componente | Versão / Identificador Real no Runner |
| :--- | :--- |
| **Sistema Operacional** | macOS Sonoma `14.8.9` (Build `23J631`) |
| **Arquitetura** | `arm64` (Apple Silicon) |
| **Xcode** | `Xcode 15.4` (Build version `15F31d`) |
| **iPhoneSimulator SDK** | `17.5` |
| **Node.js** | `v20.20.2` |
| **npm** | `10.8.2` |
| **CocoaPods** | `1.17.0` |
| **Runtimes de Simulador** | iOS 17.0, iOS 17.2, iOS 17.4, iOS 17.5, iOS 18.1, iOS 18.2 |

---

## 4. Validação Estática no macOS

Executadas no ambiente macOS prévio ao build:
1. `npm run ios:validate`: **17/17 PASS** (Conformidade com Bundle ID `com.gymflowai.app`, versionamento 1.0/1, Privacy Manifest único em `ios/App/App/PrivacyInfo.xcprivacy`, menor privilégio no Info.plist e ATS exclusivamente HTTPS).
2. `npx tsc --noEmit`: **0 erros de tipagem**.
3. `npm run build:mobile`: Geração limpa do bundle estático em `out/` com `BUILD_TARGET=mobile`.
4. `npx cap sync ios` + `pod install`: Resolução nativa de 7 plugins essenciais do Capacitor via CocoaPods `1.17.0` e geração íntegra do workspace `ios/App/App.xcworkspace`.

---

## 5. Compilação Nativa para iOS Simulator (`xcodebuild`)

A compilação nativa foi executada com sucesso contra o workspace oficial:
- **Workspace:** `ios/App/App.xcworkspace`
- **Scheme:** `App`
- **Configuration:** `Debug`
- **Destination:** `generic/platform=iOS Simulator`
- **DerivedDataPath:** `build`
- **Flags de Assinatura:** `CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""`
- **Resultado:** `** BUILD SUCCEEDED **` (Exit code 0)
- **Binário Produzido:** `build/Build/Products/Debug-iphonesimulator/App.app`

---

## 6. Boot, Instalação e Launch no iOS Simulator

### 6.1. Seleção e Boot do Dispositivo
- **Dispositivo Selecionado:** `iPhone 15 Pro`
- **UDID:** `E63A4C69-8ADF-4037-A5EE-AE47A98E069B`
- **Runtime:** `com.apple.CoreSimulator.SimRuntime.iOS-17-4` (iOS 17.4)
- **Comando de Boot:** `xcrun simctl boot E63A4C69-8ADF-4037-A5EE-AE47A98E069B`
- **Boot Status:** Aguardado com `xcrun simctl bootstatus ... -b` com sucesso.

### 6.2. Instalação
- **Comando:** `xcrun simctl install E63A4C69-8ADF-4037-A5EE-AE47A98E069B <caminho_do_App.app>`
- **Container Confirmado:**  
  `/Users/runner/Library/Developer/CoreSimulator/Devices/E63A4C69-8ADF-4037-A5EE-AE47A98E069B/data/Containers/Bundle/Application/C5C19A0A-66F5-400A-824A-42171E978EE9/App.app`
- **Status da Instalação:** `IOS_SIMULATOR_INSTALL = PASS`

### 6.3. Launch e Cold Start
- **Comando:** `xcrun simctl launch E63A4C69-8ADF-4037-A5EE-AE47A98E069B com.gymflowai.app`
- **PID do Processo:** `18797`
- **Ciclo de Vida / WebKit:**
  - `CapacitorKeyboard KeyboardPlugin: resize mode - body`
  - `WebKit::WebPageProxy::loadRequest`
  - `WebKit::NetworkProcessProxy::didFinishLaunching`
  - `WebKit::WebPageProxy::didCommitLoadForFrame`
  - `WebKit::WebPageProxy::didFinishDocumentLoadForFrame`
  - `WebKit::WebPageProxy::didFinishLoadForFrame`
- **Diagnóstico de Falhas:**
  - Verificação em `~/Library/Logs/DiagnosticReports/`: **Zero relatórios de crash** (`IOS_STARTUP_CRASH = NO`).
  - Processo ativo e estável após o período de cold start.

---

## 7. Evidência Visual

Após o launch e estabilização de cold start, uma screenshot em resolução nativa (1179 × 2556 px) foi capturada via `xcrun simctl io ... screenshot`:
- **Arquivo de Evidência:** `simulator_initial_render.png` (551 KB)
- **Conteúdo Verificado:**
  - Status bar do iOS ativa (11:59, Dynamic Island, indicador de sinal e bateria);
  - Logotipo `GYMFLOW AI` com monograma estilizado;
  - Tag `TREINADOR INTELIGENTE 2.0`;
  - Tipografia correta em fonte Outfit com renderização de alta fidelidade;
  - Botões de ação rápida `Criar Meu Plano Grátis` e `Entrar como Usuário Demo`;
  - Paleta escura canônica (`#09090b`) com destaques em verde-lima.

---

## 8. Scorecard Oficial

```text
GOAL_014_CLASSIFICATION_CORRECTED = YES

MACOS_RUNNER = PASS
XCODE_VERSION = Xcode 15.4 (Build 15F31d)
IOS_SDK_VERSION = 17.5 (iPhoneSimulator)
SIMULATOR_DEVICE = iPhone 15 Pro (iOS 17.4, UDID E63A4C69-8ADF-4037-A5EE-AE47A98E069B)

IOS_XCODE_TOOLCHAIN = PASS
IOS_XCODE_BUILD = PASS
IOS_SIMULATOR_BOOT = PASS
IOS_SIMULATOR_INSTALL = PASS
IOS_SIMULATOR_LAUNCH = PASS
IOS_INITIAL_RENDER_EVIDENCE = PASS
IOS_STARTUP_CRASH = NO

IOS_DEVICE_RUNTIME = PENDING_HUMAN
IOS_DEVELOPMENT_SIGNING = PENDING_HUMAN
IOS_ARCHIVE = PENDING_HUMAN
TESTFLIGHT = PENDING_HUMAN

P0 = 0
P1 = 0
P2 = 0
P3 = 0
```

---

## 9. Limite de Evidência

Em conformidade rigorosa com a governança técnica do projeto (Seção 19):
A aprovação nos testes em iOS Simulator em ambiente macOS hospedado comprova prontidão estática, integridade de compilação do código Swift/Capacitor, resolução correta de frameworks CocoaPods, empacotamento do bundle e inicialização do WebView.

Entretanto, **NÃO são declarados como validados neste marco:**
- Validação em iPhone físico;
- Ciclo de vida estendido em background/foreground com treino ativo;
- Acionamento da Share Sheet nativa com interação de usuário;
- Download e streaming de mídia offline em condições reais de rede;
- Assinatura de código de desenvolvimento ou distribuição com Apple Developer Account;
- Archive e validação no App Store Connect Organizer;
- Distribuição via TestFlight;
- Submissão para App Store.

Estes itens requerem credenciais de assinatura, hardware físico e ação do operador humano nos marcos subsequentes.
