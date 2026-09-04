# Relatório de QA em Dispositivo Android Físico — GymFlow AI
**ID do Documento:** `docs/mobile/ANDROID_REAL_DEVICE_QA_020.md`  
**GOAL:** `GYMFLOW-ANDROID-REAL-DEVICE-QA-020`  
**Data:** 04 de Setembro de 2026  
**Status do Marco:** Build Canônico PASS / Teste em Aparelho Físico PENDING_HUMAN  
**Branch:** `master` (HEAD: `907b78c87362f6e117d2c21d05d696ed90b0228b` == `origin/master`)  
**Package:** `com.gymflowai.app`  

---

## 1. Sumário Executivo

O objetivo do **GOAL: GYMFLOW-ANDROID-REAL-DEVICE-QA-020** é validar a prontidão operacional do GymFlow AI em um smartphone Android físico antes da criação da conta de desenvolvedor e pagamento da taxa do Google Play Console.

O processo de verificação é estritamente de validação e diagnóstico:
1. **Pre-flight & Git Cleanliness:** Árvore de trabalho verificada, sincronizada com `origin/master`, zero staged, scratches untracked preservados.
2. **Build Canônico Nativo:** Execução completa da pipeline de compilação mobile (`npm run build:mobile`, `npx cap sync android`, `npx tsc --noEmit`, `npm run android:build`).
3. **Inspeção de Metadados do APK:** APK de depuração gerado com sucesso em `android/app/build/outputs/apk/debug/app-debug.apk` e auditado via Android SDK Build-Tools (`aapt`).
4. **Varredura de Conexão ADB:** O Android Debug Bridge foi acionado e identificou ausência de aparelhos físicos conectados/autorizados no momento da execução automatizada.
5. **Classificação Conforme Protocolo:** Conforme a especificação do GOAL, o item `ANDROID_PHYSICAL_DEVICE` é classificado como `PENDING_HUMAN`. Nenhuma afirmação falsa de teste físico foi emitida.

---

## 2. Evidência Automática — Pre-flight e Build Canônico

### 2.1. Git e Estado do Repositório
- **Comando:** `git fetch origin; git status; git rev-parse HEAD; git rev-parse origin/master`
- **Branch:** `master`
- **HEAD:** `907b78c87362f6e117d2c21d05d696ed90b0228b`
- **origin/master:** `907b78c87362f6e117d2c21d05d696ed90b0228b`
- **Staged Changes:** 0 arquivos
- **Tracked Working Tree:** Limpa (`up to date with 'origin/master'`)
- **Untracked Preservados:** `.qwen/`, `docs/gymflow/`, `docs/mobile/MAINLINE_RECONCILE_AUDIT_008.md`, `qwen-code-export-...`

### 2.2. Type Checking (TypeScript)
- **Comando:** `npx tsc --noEmit`
- **Resultado:** Exit code 0 (Zero erros estáticos de tipagem no projeto).

### 2.3. Empacotamento Web Estático (Next.js 16 + Capacitor)
- **Comando:** `npm run build:mobile` (scripts/build-mobile.mjs)
- **Resultado:** Compilação Turbopack estática concluída com sucesso em `out/` (rotas `/`, `/_not-found`, `/manifest.webmanifest`, `/poc-3d`).

### 2.4. Sincronização Nativa Capacitor
- **Comando:** `npx cap sync android`
- **Plugins Ativos (7 plugins):**
  - `@capacitor/app@7.1.2`
  - `@capacitor/file-transfer@1.0.12`
  - `@capacitor/filesystem@7.1.8`
  - `@capacitor/keyboard@7.0.6`
  - `@capacitor/share@7.0.4`
  - `@capacitor/splash-screen@7.0.5`
  - `@capacitor/status-bar@7.0.6`
- **Resultado:** `Sync finished in 2.401s` (Assets copiados para `android/app/src/main/assets/public`).

### 2.5. Build Nativo Android (Gradle)
- **Comando:** `npm run android:build` (`./gradlew assembleDebug`)
- **Resultado:** `BUILD SUCCESSFUL in 2m 42s` (278 actionable tasks: 51 executed, 227 up-to-date).

---

## 3. Metadados do APK Gerado

A inspeção do binário gerado foi realizada via `Get-Item` e pelo utilitário oficial `aapt.exe` (`build-tools/34.0.0`):

| Propriedade | Valor Canônico | Evidência / Fonte |
|---|---|---|
| **Caminho Relativo** | `android/app/build/outputs/apk/debug/app-debug.apk` | Sistema de arquivos |
| **Caminho Absoluto** | `C:\Projetos\gymflow-ai\android\app\build\outputs\apk\debug\app-debug.apk` | Sistema de arquivos |
| **Tamanho** | `31.912.297 bytes` (~30,43 MB) | File system inspection |
| **Data/Hora de Geração** | `04/09/2026 14:00:31` | Gradle assembleDebug |
| **Package Name** | `com.gymflowai.app` | `aapt dump badging` |
| **Version Code** | `1` | `aapt dump badging` |
| **Version Name** | `1.0` | `aapt dump badging` |
| **minSdkVersion** | `23` (Android 6.0 Marshmallow) | `aapt dump badging` |
| **targetSdkVersion** | `36` (Android 16 Baklava) | `aapt dump badging` |
| **compileSdkVersion** | `36` | `aapt dump badging` |

---

## 4. Evidência ADB e Detecção de Dispositivo

### 4.1. Verificação do Ambiente ADB
- **Comando:** `adb version`
  ```text
  Android Debug Bridge version 1.0.41
  Version 37.0.0-14910828
  Installed as C:\Users\rafae\dev\Android\Sdk\platform-tools\adb.exe
  Running on Windows 10.0.26200
  ```
- **Comando:** `adb devices -l`
  ```text
  List of devices attached
  (nenhum dispositivo listado)
  ```

### 4.2. Status de Diagnóstico
- Nenhum aparelho Android físico com Depuração USB ativada e autorização RSA foi detectado na porta USB.
- Conforme o mandato do GOAL, o teste físico não é bloqueante e é classificado formalmente como `PENDING_HUMAN`.

---

## 5. Instruções Operacionais para Instalação e Teste Físico (Ação Humana)

Para prosseguir com os testes operacionais no aparelho real:

### 5.1. Ativação no Smartphone Android
1. **Opções do Desenvolvedor:**
   - Acesse **Configurações** > **Sobre o telefone** (ou Informações do software).
   - Toque **7 vezes consecutivas** em **Número da versão** (Build Number) até surgir a mensagem *"Você agora é um desenvolvedor"*.
2. **Depuração USB:**
   - Acesse **Configurações** > **Sistema** > **Opções do desenvolvedor**.
   - Ative a chave **Depuração USB** (USB Debugging).
3. **Conexão e Pareamento RSA:**
   - Conecte o aparelho ao PC via cabo USB confiável.
   - Na tela do smartphone, aceite o prompt de autorização: marque *"Sempre permitir a partir deste computador"* e toque em **Permitir**.
4. **Confirmar no Terminal:**
   ```powershell
   adb devices -l
   ```
   Deve exibir o número de série e o status `device` (não `unauthorized` ou `offline`).

### 5.2. Proteção de Dados Existentes
Antes de instalar, execute para verificar se o app já existe:
```powershell
adb shell pm list packages | Select-String "com.gymflowai.app"
```
> [!IMPORTANT]
> **NÃO** execute `adb uninstall` ou `adb shell pm clear com.gymflowai.app` automaticamente, pois isso apagará os bancos IndexedDB e o diretório de dados locais. Se houver incompatibilidade de assinatura (ex: app anterior assinado com outra chave debug/release), o ADB retornará `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. Nesse caso, a autorização humana explícita é mandatória antes de qualquer remoção.

### 5.3. Comando de Instalação Segura
Com o aparelho reconhecido:
```powershell
adb install -r C:\Projetos\gymflow-ai\android\app\build\outputs\apk\debug\app-debug.apk
```
*(A flag `-r` reinstala preservando os dados da aplicação).*

### 5.4. Cold Start e Coleta de Logs
Para iniciar o aplicativo via linha de comando:
```powershell
adb shell am start -n com.gymflowai.app/com.gymflowai.app.MainActivity
```
Para monitorar eventuais exceções em tempo real:
```powershell
adb logcat -v time | Select-String -Pattern "Capacitor|GymFlow|chromium|MainActivity|FATAL"
```

---

## 6. Roteiro de QA Operacional Humano no Aparelho

| ID | Superfície / Fluxo | Passos de Teste | Critério de Aceite | Status Atual |
|---|---|---|---|---|
| **SMOKE-01** | Splash Screen | Abrir o app a partir do launcher | Splash screen escura com logo centralizada sem estiramento ou artefatos | `NOT_TESTED` |
| **SMOKE-02** | Onboarding / Boas-vindas | Fluxo inicial se não houver perfil | Navegação fluida, formulário preenchível, transição limpa | `NOT_TESTED` |
| **SMOKE-03** | Dashboard Principal | Carregamento da tela inicial | Resumo do treino do dia, status de prontidão, cards visíveis | `NOT_TESTED` |
| **SMOKE-04** | Navegação Inferior | Tocar nas 4 abas (Hoje, Treinos, Evolução, Perfil) | Transição sem tela em branco, sem perda de estado | `NOT_TESTED` |
| **SMOKE-05** | Builder de Treinos | Criar treino, selecionar foco, perfil de equipamentos e salvar | Sugestão gerada, exercícios editáveis, treino persistido | `NOT_TESTED` |
| **SMOKE-06** | Treino Ativo & Timer | Iniciar treino, registrar carga/reps/RIR, avançar séries | Timer nativo de descanso aciona, botões +30s e pular funcionam | `NOT_TESTED` |
| **SMOKE-07** | Botão Voltar Nativo | Pressionar botão Voltar / Gesto de voltar do Android | Modais fecham primeiro; sub-telas voltam; treino ativo não é cancelado acidentalmente; app só fecha na raiz segura | `NOT_TESTED` |
| **SMOKE-08** | Ciclo Background / Foreground | Minimizar o app por 30s durante treino ativo e retornar | Treino intacto, timer correto, sem reload da WebView | `NOT_TESTED` |
| **SMOKE-09** | Bloqueio de Tela | Bloquear a tela do celular durante treino ativo e desbloquear | Sem crash de processo, sessão preservada | `NOT_TESTED` |
| **SMOKE-10** | Persistência Pós-Encerramento | Fechar app na tela de Recents e reabrir | Programas, histórico e perfil carregados do storage nativo | `NOT_TESTED` |
| **SMOKE-11** | Modo Offline / Avião | Ativar Modo Avião e navegar no app | Dashboard, treinos e biblioteca carregam localmente sem travamento | `NOT_TESTED` |
| **SMOKE-12** | Mídia & Fallbacks | Acessar biblioteca de exercícios | Ilustrações/placeholders renderizam corretamente, sem vídeo draft exibido como aprovado | `NOT_TESTED` |
| **SMOKE-13** | Backup & Share Sheet | Acessar Perfil/Configurações > Exportar Dados | Share Sheet nativo do Android abre com arquivo JSON; cancelamento funciona sem erro | `NOT_TESTED` |
| **SMOKE-14** | Teclado & Safe Areas | Tocar em inputs de texto/número em modais | Teclado virtual não encobre o campo ativo; bottom nav respeita a barra de gestos | `NOT_TESTED` |
| **SMOKE-15** | Estabilidade (Crash-Free) | Operação contínua durante todos os testes | Zero `FATAL EXCEPTION`, zero ANRs (Application Not Responding) | `NOT_TESTED` |

---

## 7. Registro de Dispositivo Físico (Preenchimento no Teste)

- **Fabricante:** *(Aguardando conexão física)*
- **Modelo Comercial:** *(Aguardando conexão física)*
- **Versão do Android:** *(Aguardando conexão física)*
- **Nível de API:** *(Aguardando conexão física)*
- **Resolução / Densidade de Tela:** *(Aguardando conexão física)*

---

## 8. Classificação de Defeitos e Bugs

*(Nenhum defeito foi detectado na compilação ou geração do pacote. O logcat em tempo real será auditado assim que a sessão humana for executada).*

- **P0 (Perda de dados / App inutilizável):** 0
- **P1 (Fluxo principal quebrado / Crash crítico):** 0
- **P2 (Bug funcional com contorno):** 0
- **P3 (Cosmético / Polimento):** 0

---

## 9. Scorecard Final de Prontidão Android

```text
ANDROID_APK_BUILD = PASS
ANDROID_PHYSICAL_DEVICE = PENDING_HUMAN
ANDROID_INSTALL = NOT_EXECUTED
ANDROID_COLD_START = NOT_EXECUTED
ANDROID_NAVIGATION = NOT_TESTED
ANDROID_BUILDER = NOT_TESTED
ANDROID_ACTIVE_WORKOUT = NOT_TESTED
ANDROID_BACK_BUTTON = NOT_TESTED
ANDROID_BACKGROUND_FOREGROUND = NOT_TESTED
ANDROID_PERSISTENCE = NOT_TESTED
ANDROID_OFFLINE = NOT_TESTED
ANDROID_MEDIA_FALLBACK = NOT_TESTED
ANDROID_BACKUP_SHARE = NOT_TESTED
ANDROID_KEYBOARD_SAFE_AREA = NOT_TESTED
ANDROID_CRASH_FREE = NOT_TESTED

P0 = 0
P1 = 0
P2 = 0
P3 = 0

ANDROID_REAL_DEVICE_READINESS = PENDING_PHYSICAL_DEVICE_CONNECTION
```

---

## 10. Próximos Passos Recomendados

1. Conectar o aparelho físico Android via cabo USB com Depuração USB ativada.
2. Executar `adb install -r C:\Projetos\gymflow-ai\android\app\build\outputs\apk\debug\app-debug.apk`.
3. Conduzir os 15 testes do roteiro operacional e anotar o status (`PASS` / `FAIL`).
4. Se `P0 = 0` e `P1 = 0`, o GymFlow estará 100% aprovado para pagamento da taxa de desenvolvedor do Google Play Console e geração da Release Keystore definitiva.
