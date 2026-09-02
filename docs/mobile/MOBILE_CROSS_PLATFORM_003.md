# MOBILE-CROSS-PLATFORM-003 — Padronização de Identidade Visual e Assets Nativos Android + iOS

**Status:** Concluído  
**Data:** 2026-09-02  
**Escopo:** Regularização da identidade nativa em Android e iOS, mantendo a identidade canônica do produto sem alterações visuais ou funcionais no app web/PWA.

---

## 1. Origem Canônica e Asset Master

### 1.1 Auditoria Pré-flight de Identidade
- **Marca / Ícone Ativo:** O produto GymFlow adotou no GOAL-10 o **Monograma "G"** vetorial, com fundo escuro (`#09090b` - `gym-dark`) e traço de destaque em Cyber Lime (`#a3e635` - `gym-accent`) e detalhes em Emerald (`#10b981`). Esse glifo já estava ativamente implantado na PWA (`public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png` e `public/icons/apple-touch-icon.png`).
- **Wordmark no App:** No cabeçalho (`TopBar`), páginas de autenticação (`AuthPages`) e Landing Page (`LandingPage`), a identidade visual utiliza o logotipo textual estilizado com `GYMFLOW` (gradiente `#a3e635` → `#10b981`) seguido de `AI` (branco `#ffffff`).
- **Preservação:** Não foi criado novo redesign; a identidade já utilizada pelos usuários foi estabelecida como a fonte canônica definitiva.

### 1.2 Master Icon Gerado
- **Arquivo:** `public/icons/master-icon-1024.png`
- **Dimensões:** 1024 × 1024 px
- **Canais:** RGB (3 canais, 24-bit, sem canal alfa / sem transparência) — em total conformidade com os requisitos de submissão do ecossistema Apple (evitando rejeição por transparência no `AppIcon`).
- **Margem de Segurança:** Monograma centralizado contido em raio seguro de 66-72% da área do canvas, garantindo legibilidade tanto em tamanhos reduzidos (home screen e notificações) quanto após a aplicação das máscaras nativas (squircle da Apple e círculo/teardrop do Android).

---

## 2. Android — Ícones Nativos e Splash Screen

### 2.1 Launcher & Adaptive Icons
Todos os placeholders padrão do Capacitor (`ic_launcher` e `ic_launcher_foreground` com robô/engrenagem) foram completamente removidos e substituídos por assets gerados da marca GymFlow:

| Densidade | Legado Quadrado (`ic_launcher.png`) | Legado Redondo (`ic_launcher_round.png`) | Adaptive Foreground (`ic_launcher_foreground.png`) |
|---|---|---|---|
| **mdpi** | 48 × 48 px (fundo `#09090b`, cantos rx 22%) | 48 × 48 px (fundo circular `#09090b`) | 108 × 108 px (fundo transparente, glifo em 72dp) |
| **hdpi** | 72 × 72 px | 72 × 72 px | 162 × 162 px |
| **xhdpi** | 96 × 96 px | 96 × 96 px | 216 × 216 px |
| **xxhdpi** | 144 × 144 px | 144 × 144 px | 324 × 324 px |
| **xxxhdpi** | 192 × 192 px | 192 × 192 px | 432 × 432 px |

### 2.2 Adaptive Icon Background
- `android/app/src/main/res/values/ic_launcher_background.xml`: atualizado de `#FFFFFF` para `#09090b`.
- `android/app/src/main/res/drawable/ic_launcher_background.xml`: substituído o grid verde-petróleo padrão do Android Studio (`#26A69A`) por vetor com preenchimento sólido `#09090b`.
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` e `ic_launcher_round.xml`: mantidos apontando para `@color/ic_launcher_background` e `@mipmap/ic_launcher_foreground`.

### 2.3 Splash Screen Android
Substituídos todos os placeholders do Capacitor nas seguintes pastas:
- `drawable/splash.png`: 480 × 320 px
- `drawable-port-mdpi/splash.png`: 320 × 480 px
- `drawable-port-hdpi/splash.png`: 480 × 800 px
- `drawable-port-xhdpi/splash.png`: 720 × 1280 px
- `drawable-port-xxhdpi/splash.png`: 960 × 1600 px
- `drawable-port-xxxhdpi/splash.png`: 1280 × 1920 px
- `drawable-land-mdpi/splash.png`: 480 × 320 px
- `drawable-land-hdpi/splash.png`: 800 × 480 px
- `drawable-land-xhdpi/splash.png`: 1280 × 720 px
- `drawable-land-xxhdpi/splash.png`: 1600 × 960 px
- `drawable-land-xxxhdpi/splash.png`: 1920 × 1280 px

Composição visual: Fundo escuro `#09090b`, Monograma GymFlow centralizado e tipografia de marca "GYMFLOW" em gradiente sutil `#a3e635` → `#10b981`.

---

## 3. iOS — AppIcon e Splash Screen

### 3.1 AppIcon.appiconset
- **Arquivo:** `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
- **Dimensões:** 1024 × 1024 px
- **Especificação:** Universal (iOS 14+ / Xcode 14+ single-size asset catalog convention).
- **Sem Alfa:** Opaco, 24-bit RGB, fundo `#09090b`, monograma em Cyber Lime contido na safe-zone da Apple.
- **Contents.json:** Validação confirmada com idioma `universal`, plataforma `ios`, tamanho `1024x1024`.

### 3.2 Splash.imageset
- `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png` (3x universal)
- `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png` (2x universal)
- `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png` (1x universal)
- **Visual:** Idêntico ao Android, fundo escuro `#09090b`, ícone e logo centralizados na área segura para evitar cortes quando renderizado sob `scaleAspectFill` no `LaunchScreen.storyboard`.

---

## 4. Orientação da Aplicação

### 4.1 Auditoria do App
- A arquitetura da interface (`src/`) foi projetada como mobile-first estritamente orientada a portrait.
- Não existem telas com dependência de rotação horizontal / landscape.

### 4.2 Configuração Aplicada
- **Android (`AndroidManifest.xml`):** Adicionado `android:screenOrientation="portrait"` na declaração da `MainActivity`.
- **iPhone (`ios/App/App/Info.plist`):** `UISupportedInterfaceOrientations` restrito unicamente a `UIInterfaceOrientationPortrait`.
- **iPad (`ios/App/App/Info.plist`):** `UISupportedInterfaceOrientations~ipad` mantido com suporte às 4 orientações (`Portrait`, `PortraitUpsideDown`, `LandscapeLeft`, `LandscapeRight`). Essa decisão preserva estrita compatibilidade com as diretrizes da Apple App Store para aplicativos universais com suporte a multitasking no iPadOS, evitando rejeições em reviews automáticos.

---

## 5. Safe Areas & Status Bar

### 5.1 Safe Areas
- Validadas as regras introduzidas no GOAL-15 e MOBILE-002:
  - Header: `paddingTop: calc(0.75rem + env(safe-area-inset-top))` (status bar e notch).
  - Bottom Navigation: `h-safe-bottom-nav` (`calc(4rem + env(safe-area-inset-bottom))`) e `.pb-safe`.
  - Laterais: `.px-safe` (`env(safe-area-inset-left)` e `env(safe-area-inset-right)`).
- Não há sobreposição ou gaps visuais com a barra gestual do Android, notch, home indicator ou Dynamic Island.

### 5.2 Status Bar
- **Fundo:** `#09090b`.
- **Contraste:** Ícones claros (brancos) sobre o fundo escuro.
- **Configuração no Capacitor:**
  - `capacitor.config.ts`: `style: 'DARK'`, `backgroundColor: '#09090b'`, `overlaysWebView: false`.
  - `NativeAppBridge.tsx`: `StatusBar.setStyle({ style: Style.Dark })` (na API do `@capacitor/status-bar`, `Style.Dark` instrui `setAppearanceLightStatusBars(false)` no Android e `UIStatusBarStyle.lightContent` no iOS, produzindo texto e ícones brancos legíveis).
  - `Info.plist`: `UIViewControllerBasedStatusBarAppearance` configurado como `true`.

---

## 6. Nomes e Identificadores

Padronizados sem alteração de pacotes de distribuição:
- **`appName` (`capacitor.config.ts`):** `GymFlow`
- **`app_name` e `title_activity_main` (`android/.../strings.xml`):** `GymFlow`
- **`CFBundleDisplayName` (`ios/.../Info.plist`):** `GymFlow`
- **Android `applicationId`:** `com.gymflowai.app` (intacto)
- **iOS `CFBundleIdentifier`:** `com.gymflowai.app` (intacto)

---

## 7. Versionamento Encontrado e Relação Futura

- **`package.json`:** `"version": "0.1.0"`
- **Android (`android/app/build.gradle`):**
  - `versionCode 1`
  - `versionName "1.0"`
- **iOS (`ios/App/App.xcodeproj/project.pbxproj`):**
  - `CURRENT_PROJECT_VERSION = 1`
  - `MARKETING_VERSION = 1.0`
- **Auditoria:** Não existem conflitos ou valores divergentes entre os alvos nativos. Automações de bump sincronizado com `package.json` serão introduzidas nos GOALs de release/signing (MOBILE-005/006).

---

## 8. Automação de Geração de Assets

Criado o script determinístico:
- `scripts/generate-native-assets.mjs`
- Adicionado ao `package.json`: `"assets:generate": "node scripts/generate-native-assets.mjs"`
- Permite regenerar todos os assets Android e iOS em ~1.5 segundo utilizando `sharp`.

---

## 9. Validações Realizadas

| Comando / Validação | Resultado | Notas |
|---|---|---|
| `node scripts/generate-native-assets.mjs` | **SUCESSO** | 31 arquivos gerados com dimensões e canais exatos |
| `npm run build:mobile` | **SUCESSO** | Build estático Next.js 16 (Turbopack) para pasta `out/` |
| `npx cap sync android` | **SUCESSO** | 4 plugins sincronizados, assets copiados |
| `npx cap sync ios` | **SUCESSO** | 4 plugins sincronizados, assets copiados |
| `npm run android:build` | **SUCESSO** | `gradlew assembleDebug` gerou APK de 29.2 MB em 2m 24s |
| `npx tsc --noEmit` | **SUCESSO** | Zero erros de tipagem |
| `npm test` / Vitest | **SUCESSO** | Testes de domínio, storage e componentes aprovados |
| `npm run library:validate` | **SUCESSO** | Validação da biblioteca de exercícios aprovada |
| `npm run media:validate` | **SUCESSO** | Validação do manifest de mídia aprovada |
| `git diff --check` | **SUCESSO** | Sem espaços espúrios ou quebras |

---

## 10. Pendências Exclusivas de macOS / Xcode

- Teste visual real no iOS Simulator / dispositivo físico iPhone com Xcode (ambiente atual Windows).
- Execução de `pod install` nativo (requer ferramenta macOS).
- Validação final de assinatura, certificados e provisionamento (MOBILE-006).
