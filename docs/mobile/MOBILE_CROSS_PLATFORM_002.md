# Relatório de Execução — Fundação Cross-Platform iOS & Plugins Nativos Essenciais
**ID do Documento:** `docs/mobile/MOBILE_CROSS_PLATFORM_002.md`  
**GOAL:** `GYMFLOW-MOBILE-CROSS-PLATFORM-002`  
**Data:** Setembro de 2026  
**Status:** Concluído com Sucesso  
**Ambiente de Execução:** Windows 11 local (Host de Desenvolvimento)

---

## Sumário Executivo

Este documento consolida a execução do **GOAL-MOBILE-002**, que estabeleceu a fundação nativa oficial para **iOS** no GymFlow AI e integrou os plugins nativos essenciais do ecossistema **Capacitor 7** tanto no **Android** quanto no **iOS**.

A estrutura permite que o aplicativo opere com paridade entre web/PWA e plataformas nativas, mantendo o bundle estático exportado (`out/`), sem interrupções indesejadas de treino ativo por gestos/botões de retorno do sistema, e com gerenciamento nativo de status bar, teclado virtual e tela de carregamento.

---

## 1. Versões Efetivamente Instaladas e Alinhamento

Todas as dependências foram mantidas ou instaladas em estrita compatibilidade com a major **Capacitor 7**, sem avançar para Capacitor 8:

```text
gymflow-ai@0.1.0 C:\Projetos\gymflow-ai
+-- @capacitor/android@7.6.7
|   `-- @capacitor/core@7.6.7 deduped
+-- @capacitor/app@7.1.2
|   `-- @capacitor/core@7.6.7 deduped
+-- @capacitor/cli@7.6.7
+-- @capacitor/core@7.6.7
+-- @capacitor/ios@7.6.9
|   `-- @capacitor/core@7.6.7 deduped
+-- @capacitor/keyboard@7.0.6
|   `-- @capacitor/core@7.6.7 deduped
+-- @capacitor/splash-screen@7.0.5
|   `-- @capacitor/core@7.6.7 deduped
`-- @capacitor/status-bar@7.0.6
    `-- @capacitor/core@7.6.7 deduped
```

- `@capacitor/core`: `7.6.7`
- `@capacitor/cli`: `7.6.7`
- `@capacitor/android`: `7.6.7`
- `@capacitor/ios`: `7.6.9` (patch compatível Capacitor 7)
- `@capacitor/app`: `7.1.2`
- `@capacitor/status-bar`: `7.0.6`
- `@capacitor/keyboard`: `7.0.6`
- `@capacitor/splash-screen`: `7.0.5`

---

## 2. Identificadores Canônicos e Configuração Cross-Platform

Arquivo [capacitor.config.ts](file:///c:/Projetos/gymflow-ai/capacitor.config.ts):

- **`appId` / Bundle Identifier**: `com.gymflowai.app` (unificado entre Android e iOS).
- **`appName`**: `GymFlow AI`.
- **`webDir`**: `out` (gerado por `npm run build:mobile`).
- **Android**:
  - `backgroundColor`: `#09090b`
  - `webContentsDebuggingEnabled`: `true`
  - `server.androidScheme`: `https`
- **iOS**:
  - `backgroundColor`: `#09090b` (evita tela branca durante boot no WKWebView)
  - `contentInset`: `automatic`
  - `allowsLinkPreview`: `false`
  - `scrollEnabled`: `true`
- **Plugins**:
  - `SplashScreen`: background `#09090b`, fade programático controlado via React.
  - `StatusBar`: estilo `DARK` (ícones claros sobre fundo `#09090b`).
  - `Keyboard`: `resize: KeyboardResize.Body`, `resizeOnFullScreen: true`.

---

## 3. Estrutura Criada: Plataforma iOS (`ios/`)

A plataforma iOS foi criada pelo fluxo oficial `npx cap add ios`:

```text
ios/
├── .gitignore
├── App/
│   ├── App/
│   │   ├── AppDelegate.swift
│   │   ├── Assets.xcassets/
│   │   ├── Base.lproj/
│   │   │   ├── LaunchScreen.storyboard
│   │   │   └── Main.storyboard
│   │   ├── Info.plist
│   │   ├── capacitor.config.json
│   │   └── public/               (ignorado pelo git, sincronizado via cap sync)
│   ├── App.xcodeproj/
│   ├── App.xcworkspace/
│   └── Podfile
└── capacitor-cordova-ios-plugins/
```

### 3.1 Detalhes do Projeto iOS
- **Podfile**: Alvo base configurado com `platform :ios, '14.0'` e verificação `assertDeploymentTarget(installer)` que requer iOS 15.0+ (Capacitor 7).
- **Info.plist**:
  - `CFBundleDisplayName`: `GymFlow AI`
  - `CFBundleIdentifier`: `$(PRODUCT_BUNDLE_IDENTIFIER)` (`com.gymflowai.app`)
  - `UIViewControllerBasedStatusBarAppearance`: `true`
- **Alvo Futuro de Submissão**: Preparado para ser aberto e compilado no **Xcode 16 / iOS 18 SDK** e versões posteriores em ambiente macOS.

---

## 4. Detecção de Ambiente e Helpers de Plataforma

Criado o módulo [src/lib/platform.ts](file:///c:/Projetos/gymflow-ai/src/lib/platform.ts):
- `getPlatform()`: retorna `'web' | 'android' | 'ios'`.
- `isCapacitorNative()`: `boolean` (indica runtime nativo).
- `isCapacitorAndroid()`: `boolean`.
- `isCapacitorIos()`: `boolean`.
- `isWeb()`: `boolean`.

### Aplicação Real
- [src/components/ServiceWorkerRegister.tsx](file:///c:/Projetos/gymflow-ai/src/components/ServiceWorkerRegister.tsx): O registro de `public/sw.js` foi condicionado com `!isCapacitorNative()`. No Android WebView e iOS WKWebView os assets já são locais; desabilitar o Service Worker em runtime nativo previne conflitos de cache e erros de isolamento de segurança no iOS.

---

## 5. Política do Botão Voltar (Android Back Navigation)

Para resolver o fechamento inadvertido do app via botão físico/gesto de Voltar no Android, foi implementada uma arquitetura com prioridades claras e reversão limpa:

### 5.1 Arquitetura em Três Camadas ([src/lib/back-navigation.ts](file:///c:/Projetos/gymflow-ai/src/lib/back-navigation.ts))

1. **Camada 1 — Ações de Overlays e Modais (`BackActionRegistry` / `useBackHandler`)**:
   - Modais, gavetas e diálogos registram um handler de fechamento com prioridade enquanto abertos.
   - Pressionar Voltar fecha o modal em foco (`LIFO` / prioridade maior) e consome o evento sem tocar na visualização subjacente.
   - Integrado em: `ConfirmDialog` (prioridade 50), modais do treino ativo (cancelar treino, finalizar, troca, adicionar exercício, readiness, calculadora de anilhas, why this weight), `ExercisePickerModal`, `SocialShareModal`, `SessionDetailModal`, `OfflineMediaModal` e o menu inferior `MoreMenuSheet` (prioridade 20).
2. **Camada 2 — Navegação Interna de Telas (`resolveBackNavigationPolicy`)**:
   - Quando não há modais abertos, o app avalia a tela atual e o histórico de visualizações:
     - Telas deslogadas (`login`, `register`, `recovery`, `onboarding`): voltam para `'landing'`.
     - Telas internas logadas (`workouts`, `exercises`, `videos`, `ai-coach`, `evolution`, etc.): voltam para a tela anterior coerente ou `'dashboard'`.
     - Construtor de treinos (`workout-builder`): volta para `builderReturnView` (ex.: `'planner'`), acionando o guard de confirmação caso existam alterações pendentes não salvas.
     - Treino ativo (`active-workout`): ao voltar, navega para `'dashboard'`, **mantendo a sessão de treino viva em segundo plano** com o componente `WorkoutSheetNotification` visível. A sessão nunca é cancelada nem descartada por engano.
3. **Camada 3 — Proteção da Raiz e Saída Nativa**:
   - Se o usuário estiver na raiz (`dashboard`) e **houver um treino em andamento**: o fechamento nativo é bloqueado. Um aviso via toast é exibido e a visualização é redirecionada para `active-workout`.
   - Somente na raiz (`dashboard` logado ou `landing` deslogado), **sem treino ativo e sem estado interno a preservar**, é invocada a saída nativa via `CapacitorApp.exitApp()`.

---

## 6. Integração Nativa no React ([src/components/NativeAppBridge.tsx](file:///c:/Projetos/gymflow-ai/src/components/NativeAppBridge.tsx))

Componente client-side montado dentro do `GymFlowProvider` no [src/app/layout.tsx](file:///c:/Projetos/gymflow-ai/src/app/layout.tsx):
- **Status Bar**: Configura tema escuro `#09090b` e `Style.Dark` (ícones brancos) tanto no Android quanto no iOS.
- **Teclado**: Define `Keyboard.setResizeMode({ mode: KeyboardResize.Body })`, evitando quebra de elementos com posicionamento fixo (`fixed`).
- **Splash Screen**: Dispara `SplashScreen.hide({ fadeOutDuration: 300 })` com fade suave logo após a montagem do React.
- **Back Button**: Registra listener permanente no `@capacitor/app` (`backButton`) no Android.
- **Desktop/Web ESC**: Mapeia a tecla `Escape` no navegador para despachar fechamento de overlays pelo mesmo registro unificado.

---

## 7. Scripts NPM Cross-Platform Adicionados

Em [package.json](file:///c:/Projetos/gymflow-ai/package.json):

| Script | Comando | Descrição |
| :--- | :--- | :--- |
| `build:mobile` | `node scripts/build-mobile.mjs` | Export estático Next.js (`BUILD_TARGET=mobile`) gerando `out/` |
| `cap:sync` | `node scripts/build-mobile.mjs && cap sync` | Compila web e sincroniza assets com Android e iOS |
| `cap:sync:android` | `node scripts/build-mobile.mjs && cap sync android` | Sincroniza especificamente a plataforma Android |
| `cap:sync:ios` | `node scripts/build-mobile.mjs && cap sync ios` | Sincroniza assets web com o projeto `ios/` |
| `android:sync` | `node scripts/build-mobile.mjs && cap sync android` | Alias conveniente para sync Android |
| `android:open` | `cap open android` | Abre o projeto nativo no Android Studio |
| `android:build` | `node scripts/android-build.mjs` | Executa o Gradle local (`assembleDebug`) |
| `ios:sync` | `node scripts/build-mobile.mjs && cap sync ios` | Alias conveniente para sync iOS |
| `ios:open` | `cap open ios` | Prepara/abre o workspace no Xcode (em macOS) |

*Nota: Não foram criados scripts que afirmem compilar iOS no ambiente Windows.*

---

## 8. Validações Executadas e Resultados

| Validação | Comando | Resultado |
| :--- | :--- | :--- |
| **Listagem Capacitor Core** | `npm ls @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios` | ✅ Aprovado (Core/Cli/Android em 7.6.7, iOS em 7.6.9) |
| **Listagem Plugins** | `npm ls @capacitor/app @capacitor/status-bar @capacitor/keyboard @capacitor/splash-screen` | ✅ Aprovado (App 7.1.2, StatusBar 7.0.6, Keyboard 7.0.6, Splash 7.0.5) |
| **Capacitor Doctor** | `npx cap doctor` | ✅ Aprovado (`Android looking great!`, aponta corretamente ausência de Xcode no Windows) |
| **Testes de Plataforma** | `npx vitest run src/lib/platform.test.ts` | ✅ 3/3 testes aprovados |
| **Testes de Back Navigation** | `npx vitest run src/lib/back-navigation.test.ts` | ✅ 14/14 testes aprovados |
| **Suite Completa de Testes** | `npm test` | ✅ 78/78 arquivos, 2109/2109 testes aprovados |
| **Tipagem TypeScript** | `npx tsc --noEmit` | ✅ 0 erros de tipo |
| **Build Estático Mobile** | `npm run build:mobile` | ✅ Turbopack exportou com sucesso 6 rotas estáticas em `out/` |
| **Sync Android** | `npx cap sync android` | ✅ Assets e 4 plugins integrados no Gradle em 1.7s |
| **Sync iOS** | `npx cap sync ios` | ✅ Assets e 4 plugins copiados para `ios/App/App/public` em 1.9s |
| **Compilação Android (APK)** | `npm run android:build` | ✅ `BUILD SUCCESSFUL in 3m 59s` gerando `app-debug.apk` |
| **Git Diff Check** | `git diff --check` | ✅ Sem conflitos de whitespace ou quebras de linha |

---

## 9. Limitações Conhecidas e Pendências para Ambiente macOS / Xcode

Por estarmos executando no Windows, as seguintes tarefas foram delimitadas e permanecem para homologação futura em máquina macOS (fase `MOBILE-006`):
1. **Instalação de CocoaPods**: `pod install` no diretório `ios/App` (Capacitor avisou `Skipping pod install because CocoaPods is not installed`).
2. **Compilação Nativa iOS**: Execução de `xcodebuild` para geração de build `.app` / `.ipa`.
3. **Simuladores iOS e Dispositivo Físico**: Validação nos simuladores iPhone 16 Pro / iPhone SE e teste de gestos de borda / Dynamic Island.
4. **Certificados e Assinatura Apple**: Configuração de Team ID, Provisioning Profile e bundle signing no Xcode.

---

## 10. Conclusão

O objetivo do **MOBILE-CROSS-PLATFORM-002** foi integralmente alcançado. A fundação iOS foi criada de maneira limpa, o aplicativo Android continua compilando perfeitamente com os 4 novos plugins oficiais, o fluxo web/PWA foi preservado e o comportamento do botão Voltar do Android está blindado contra encerramentos prematuros ou perda de treinos.
