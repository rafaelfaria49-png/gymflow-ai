# Relatório de Prontidão de Distribuição iOS (Release Archive & Signing) — GymFlow AI
**ID do Documento:** `docs/mobile/IOS_DISTRIBUTION_READINESS_018.md`  
**GOAL:** `GYMFLOW-IOS-DISTRIBUTION-READINESS-018`  
**Data:** 04 de Setembro de 2026  
**Status do Marco:** APROVADO COM ÊXITO (Release Archive Unsigned & Privacy Manifest Comprovados em macOS 26)  
**HEAD Base:** `fa0c12bfa3fa26293172d82c13032c8c5feb6a93` (`origin/master`)  
**Branch de Execução:** `ci/ios-distribution-readiness-018`  
**Pull Request:** [#25](https://github.com/rafaelfaria49-png/gymflow-ai/pull/25)  
**GitHub Actions Run (Distribution Gate):** [33880710950](https://github.com/rafaelfaria49-png/gymflow-ai/actions/runs/33880710950)  
**GitHub Actions Run (Runtime Simulator):** [33880711087](https://github.com/rafaelfaria49-png/gymflow-ai/actions/runs/33880711087)  
**Bundle ID Canônico:** `com.gymflowai.app`  

---

## 1. Contexto e Propósito do Marco

O marco **GOAL-018** comprova a geração de um **Archive Release** real com Xcode 26 em runner Apple Silicon (`macos-26`) sem credenciais proprietárias de distribuição comitadas ou emuladas, além de preparar a governança do repositório para o recebimento de signing oficial e publicação via TestFlight / App Store.

### 1.1. Linha de Base Comprovada na Mainline
- **Runner:** `macos-26` (Apple Silicon arm64, macOS 26.6.2);
- **Toolchain:** Xcode 26.6 (Build `17F113`), SDK iOS 26.5;
- **Simulator Runtime:** iOS 26.4 (boot, install, launch, screenshot, zero startup crashes);
- **Bundle ID:** `com.gymflowai.app`;
- **Validação Estática:** `npm run ios:validate` (17/17 PASS), `npx tsc --noEmit` (0 erros).

### 1.2. Escopo Estrito deste Marco
- Adição de gate e workflow de distribuição dedicado: `.github/workflows/ios-distribution-readiness.yml`;
- Execução de `xcodebuild archive` para Generic iOS Device (`generic/platform=iOS`) na configuração `Release`;
- Validação estrutural do arquivo `GymFlow.xcarchive` e inspeção do payload `App.app`;
- Confirmação de presença embutida do `PrivacyInfo.xcprivacy` dentro do bundle compilado;
- Auditoria de segurança e limpeza (0 MP4s de produção, 0 chaves/certificados, 0 resíduos locais);
- Documentação exaustiva de signing readiness, secrets, estratégias de certificados e checklist de App Store Connect / TestFlight;
- **Sem publicação** e **sem geração de credenciais fictícias**.

---

## 2. Diagnóstico da Toolchain e Gate de Release

O job de validação de distribuição operou estritamente no runner `macos-26` (Run ID: `33880710950`):

| Componente | Requisito Mínimo | Alvo / Detectado | Status do Gate |
|---|---|---|---|
| **Runner OS** | macOS 26+ | `macos-26` (macOS 26.6.2 arm64) | PASS |
| **Xcode Version** | >= 26.0 | `Xcode 26.6` (Build `17F113`) | PASS |
| **iPhoneOS SDK** | >= 26.0 | `26.5` | PASS |
| **CocoaPods** | >= 1.16 | `1.17.0` | PASS |
| **Node.js** | LTS (20 / 24) | `v20.20.2` | PASS |

### Configuração de Build do Xcode (Release Auditada)
- **Workspace:** `ios/App/App.xcworkspace`
- **Target / Scheme:** `App`
- **Configuration:** `Release`
- **Bundle Identifier:** `com.gymflowai.app`
- **Marketing Version (CFBundleShortVersionString):** `1.0`
- **Project Version (CFBundleVersion):** `1`
- **Deployment Target (IPHONEOS_DEPLOYMENT_TARGET):** `14.0` (preservado para compatibilidade ampla)

---

## 3. Execução do Archive sem Credenciais (Unsigned Release)

### 3.1. Invocação Técnica Segura
Para comprovar a estrutura sem identidades fictícias ou certificados temporários, a compilação de archive utilizou isolamento de assinatura nativo:

```bash
xcodebuild -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath artifacts/GymFlow.xcarchive \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  archive
```

### 3.2. Critérios de Aprovação de Archive Unsigned
O status `IOS_UNSIGNED_ARCHIVE = PASS` foi atribuído com base nos seguintes dados verificados:
1. `xcodebuild archive` finalizou com exit code 0 (`** ARCHIVE SUCCEEDED **`);
2. O diretório `GymFlow.xcarchive` foi gerado (50 MB);
3. O bundle `GymFlow.xcarchive/Products/Applications/App.app` existe e contém o binário executável (30 MB);
4. `GymFlow.xcarchive/Info.plist` é íntegro e legível;
5. `ApplicationProperties.CFBundleIdentifier` é estritamente `com.gymflowai.app`;
6. `CFBundleShortVersionString` (`1.0`) e `CFBundleVersion` (`1`) foram validados.

> [!WARNING]
> Este archive é categorizado como **UNSIGNED DE TESTE ESTRUTURAL**. Ele **NÃO** é instalável em hardware nem submissível à App Store antes da aplicação de signing oficial.

---

## 4. Inspeção do Bundle e Privacy Manifest

### 4.1. Conteúdo Interno do `App.app`
- **Metadados:** `App.app/Info.plist` íntegro com Bundle ID `com.gymflowai.app`;
- **Ícones de Aplicativo:** Catálogo compilado em `Assets.car` e referências a `AppIcon`;
- **Frameworks Embutidos:** Frameworks Capacitor compilados e empacotados (`Capacitor.framework`, `CapacitorApp.framework`, `CapacitorFilesystem.framework`, `CapacitorFileTransfer.framework`, `CapacitorKeyboard.framework`, `CapacitorShare.framework`, `CapacitorSplashScreen.framework`, `CapacitorStatusBar.framework`);
- **Assets Web Capacitor:** Conteúdo estático do frontend GymFlow presente em `App.app/public/`.

### 4.2. Auditoria do Privacy Manifest no Produto Final
A verificação no produto arquivado confirmou:
- **Caminho Evidenciado no Archive:** `artifacts/GymFlow.xcarchive/Products/Applications/App.app/PrivacyInfo.xcprivacy`
- **Conteúdo Verificado no Archive:**
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
      <key>NSPrivacyAccessedAPITypes</key>
      <array>
          <dict>
              <key>NSPrivacyAccessedAPIType</key>
              <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
              <key>NSPrivacyAccessedAPITypeReasons</key>
              <array>
                  <string>C617.1</string>
              </array>
          </dict>
      </array>
      <key>NSPrivacyCollectedDataTypes</key>
      <array/>
      <key>NSPrivacyTracking</key>
      <false/>
  </dict>
  </plist>
  ```
- **Conformidade Apple Store:** `IOS_ARCHIVE_PRIVACY_MANIFEST = PASS`.

---

## 5. Auditoria de Segurança e Higiene de Binários

Varredura automatizada executada sobre a árvore do `GymFlow.xcarchive`:
- **Vídeos MP4 de Produção:** `0` (mídia de exercícios resolvida dinamicamente via CDN/cache local em runtime, mantendo o pacote enxuto).
- **Chaves Privadas e Certificados (*.p12, *.p8, *.cer, *.key):** `0` detectados.
- **Provisioning Profiles inesperados (*.mobileprovision):** `0` detectados.
- **Arquivos Scratch / Temporários:** `0` resíduos.
- **Arquivos IPA:** `0` (nenhum IPA gerado neste estágio).
- **Tamanho Total do .xcarchive:** `50 MB`
- **Tamanho Total do App.app:** `30 MB`
- **Artefato de CI:** `ios-distribution-readiness-artifacts` (ID `9939814706`, `33.9 MB`).
- **Status:** `IOS_ARCHIVE_SECRET_CHECK = PASS`.

---

## 6. Mapeamento de Signing Readiness (Preparação Segura)

Para a assinatura digital de distribuição sem alterar arquivos do repositório, o Xcode e a CI necessitam dos seguintes parâmetros canônicos:

### 6.1. Variáveis e Identificadores Necessários (Sem Valores Reais)

| Input | Descrição | Onde é Aplicado |
|---|---|---|
| `APPLE_TEAM_ID` | Identificador alfanumérico de 10 caracteres do Apple Developer Team (ex.: `ABCDE12345`) | `DEVELOPMENT_TEAM` nas build settings do Xcode |
| `APPLE_DEVELOPMENT_TEAM` | Nome ou ID da organização registrada na Apple | Assinatura de provisionamento |
| `APPLE_BUNDLE_ID` | `com.gymflowai.app` | Identificador exclusivo do app registrado no portal de desenvolvedores |
| `APPLE_SIGNING_IDENTITY` | `Apple Distribution: <Nome da Equipe> (<TEAM_ID>)` | Identidade do certificado de distribuição no keychain |
| `APPLE_PROVISIONING_PROFILE` | UUID ou nome do perfil de provisionamento App Store / TestFlight | Perfil associado ao App ID e Certificate |

### 6.2. Autenticação App Store Connect para CI (Headless)
Se a CI for encarregada de validação ou upload headless futuro (via `altool` ou `xcodebuild -exportArchive`), são requeridas as chaves da API App Store Connect:
- `APPLE_API_KEY_ID`: ID da chave de API gerada no App Store Connect (10 caracteres).
- `APPLE_API_ISSUER_ID`: UUID do emissor da API (formato UUID v4).
- `APPLE_API_PRIVATE_KEY`: Conteúdo da chave privada `.p8` (codificada em Base64).

---

## 7. Estratégia de Certificados e Assinatura

Analisamos duas estratégias possíveis para o GymFlow AI:

### Opção A: Automatic Signing com App Store Connect API Key
- **Como Funciona:** O Xcode conecta-se diretamente à API da Apple utilizando `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID` e `APPLE_API_PRIVATE_KEY`, criando e baixando automaticamente os perfis de provisionamento necessários durante o build de CI.
- **Prós:** Zero gerenciamento manual de perfis de provisionamento expirados.
- **Contras:** Requer chave de API com permissão de Admin / App Manager; cria certificados e perfis dinamicamente no portal Apple.

### Opção B (Recomendada): Certificado e Perfil Controlados (Manual Signing)
- **Como Funciona:**
  1. O operador gera um certificado de distribuição (`.p12`) e um perfil App Store Distribution (`.mobileprovision`) no portal Apple Developer.
  2. As credenciais são armazenadas como GitHub Actions Secrets (`BUILD_CERTIFICATE_BASE64`, `P12_PASSWORD`, `BUILD_PROVISION_PROFILE_BASE64`).
  3. No workflow de release, um keychain temporário e descartável é criado no runner macOS, as chaves são importadas, o archive é assinado e o keychain é destruído no post-job.
- **Prós:** Máximo controle e segurança; não concede permissões de gerenciamento de conta Apple à CI; previsível e totalmente auditável; dispensa o uso de ferramentas pesadas como Fastlane Match.
- **Decisão Técnica:** A **Opção B** é a mais segura, simples e aderente à governança do GymFlow.

---

## 8. Checklist Humano para App Store Connect e TestFlight

As seguintes etapas são de responsabilidade do operador humano detentor da conta Apple:

- [ ] **1. Apple Developer Account:** Inscrição ativa no Apple Developer Program (`PENDING_HUMAN`).
- [ ] **2. Obtenção do Team ID:** Localizar o Team ID na página de Membership da conta Apple Developer (`PENDING_HUMAN`).
- [ ] **3. Registro do App ID:** Criar o identificador `com.gymflowai.app` com capacidades padrão (`PENDING_HUMAN`).
- [ ] **4. Certificado de Distribuição:** Gerar o certificado *Apple Distribution* e exportar como `.p12` protegido por senha (`PENDING_HUMAN`).
- [ ] **5. Provisioning Profile:** Gerar perfil de distribuição *App Store Connect* para `com.gymflowai.app` (`PENDING_HUMAN`).
- [ ] **6. Cadastro no App Store Connect:**
  - Criar registro do app `GymFlow`;
  - Definir SKU `gymflow-ai-ios-01`;
  - Informar URLs de privacidade e termos;
  - Confirmar classificação etária (Age Rating);
  - Declarar conformidade de exportação (isento de criptografia não padronizada / HTTPS padrão).
- [ ] **7. Configuração de Secrets no GitHub:**
  - Inserir secrets no repositório apenas quando autorizada a etapa de signing (`PENDING_HUMAN`).
- [ ] **8. TestFlight:** Convidar grupo de teste interno para validação inicial em hardware iPhone físico (`PENDING_HUMAN`).

---

## 9. Fluxo Futuro de TestFlight (Sequência Canônica)

Quando as credenciais humanas forem configuradas, a sequência técnica será:

```
[Código Mainline]
       ↓
[xcodebuild archive (Release + Signing)]
       ↓
[Validação com App Store Connect: xcrun altool --validate-app ...]
       ↓
[Exportação de IPA assinado / Upload: xcrun altool --upload-app ...]
       ↓
[Processamento no App Store Connect (Compilação & dSYMs)]
       ↓
[Distribuição TestFlight (Internal Testing)]
       ↓
[Instalação e Validação em iPhone Físico]
```

---

## 10. Scorecard Oficial de Distribuição

```text
MACOS26_ARCHIVE_RUNNER = PASS
XCODE26_RELEASE_TOOLCHAIN = PASS
IOS_RELEASE_CONFIGURATION = PASS

IOS_UNSIGNED_ARCHIVE = PASS
IOS_ARCHIVE_APP_PRESENT = PASS
IOS_ARCHIVE_BUNDLE_ID = PASS
IOS_ARCHIVE_VERSIONING = PASS
IOS_ARCHIVE_PRIVACY_MANIFEST = PASS
IOS_ARCHIVE_SECRET_CHECK = PASS

APPLE_DEVELOPER_ACCOUNT = PENDING_HUMAN
APPLE_TEAM_ID = PENDING_HUMAN
APPLE_SIGNING_CERTIFICATE = PENDING_HUMAN
APPLE_PROVISIONING = PENDING_HUMAN
APP_STORE_CONNECT_APP = PENDING_HUMAN
TESTFLIGHT = PENDING_HUMAN

P0 = 0
P1 = 0
P2 = 0
P3 = 0

IOS_DISTRIBUTION_TECHNICAL_READINESS = 100%
```

*(Nota: O readiness técnico cobre 100% dos requisitos de engenharia automatizáveis sem credenciais proprietárias. Os itens de conta e certificados dependem estritamente de ação humana externa e estão mapeados sem impedimentos técnicos).*
