# Relatório de QA em Dispositivo Android Físico (Release) — GymFlow AI

**ID do Documento:** `docs/mobile/ANDROID_REAL_DEVICE_RELEASE_QA_116.md`  
**GOAL:** `GYMFLOW-ANDROID-REAL-DEVICE-RELEASE-QA-116`  
**Data:** 22 de Setembro de 2026  
**Status do Marco:** REAL_DEVICE_RELEASE_QA = PASS · P2_ANR_GOAL115 = CLOSED  
**Branch:** `master` (HEAD: `92a8654d0ce844cc461689cefed9b804902cdce2` == `origin/master`)  
**Package:** `com.gymflowai.app`  

---

## 1. Sumário Executivo

O objetivo do **GOAL: GYMFLOW-ANDROID-REAL-DEVICE-RELEASE-QA-116** foi fechar o único P2 restante do **GOAL-115**: validar o artefato **RELEASE** real do GymFlow Android diretamente em hardware físico (Samsung Galaxy S22 SM-S901E), comprovando ausência de ANRs, crashes, anomalias de persistência ou regressões no backend de produção.

A execução foi realizada integralmente no aparelho físico conectado via ADB, utilizando o APK Release assinado com a chave interna de distribuição. O ANR de FocusEvent observado no emulador virtual durante o GOAL-115 **NÃO** foi reproduzido no hardware real (confirmado como artefato puramente ambiental decorrente de sobrecarga de memória do host no ambiente virtualizado).

Todos os fluxos operacionais (Cold boot, Treinos, Timer de descanso, Persistência após background/foreground, Kill + Reopen, Módulo de Nutrição com escrita no ledger, Modal de IA com salvaguardas clínicas D-NUT-08/D-NUT-09, chamada real ao backend de produção GymFlow na Vercel e resiliência offline/online) foram executados e aprovados com **zero crash** e **zero ANR**.

---

## 2. Identificação do Dispositivo Físico & Build

### 2.1. Dispositivo Físico
- **Modelo:** Samsung Galaxy S22 (`SM-S901E` / `r0q`)
- **Versão do Android:** Android 16 (API 36, Vanilla Ice Cream / Baklava preview)
- **Número de Série (ADB):** `RXCT300L33Y`
- **Resolução de Tela:** 1080 x 2340 pixels (480 dpi)
- **Estado de Energia:** `mWakefulness=Awake`, carregando (USB)

### 2.2. Artefato Release sob Teste
- **Caminho:** `android/app/build/outputs/apk/release/app-release.apk`
- **Tamanho:** 28.117.229 bytes (26,81 MB)
- **SHA-256:** `5fc4933507fba0895f82091c13c7d1eb0dc7b0e1785ea2364de623d0d857b803`
- **Package ID:** `com.gymflowai.app`
- **Version Name:** `1.0`
- **Version Code:** `1`
- **Min SDK:** 23 · **Target SDK:** 36 · **Compile SDK:** 36
- **Assinatura:** `CN=GymFlow Internal, OU=Mobile, O=GymFlow, C=BR` (Keystore PKCS12 interna)
- **Flags de Pacote:** `[ HAS_CODE ALLOW_CLEAR_USER_DATA ALLOW_BACKUP ]` (sem flag `DEBUGGABLE`, build estritamente release)

---

## 3. Instalação e Governança de Dados

- **Auditoria Prévia:** Detectada instalação prévia com assinatura incompatível de depuração (`CN=Android Debug`).
- **Governança Segura:** Conforme §3 do protocolo, a desinstalação não foi realizada de forma automática. Foi solicitada e concedida autorização humana explícita antes do wipe/reinstalação.
- **Resultado da Instalação:** `Success` via `adb install -r`.
- **Integridade de Inicialização:** Inicializado com `android.intent.action.MAIN` / `android.intent.category.LAUNCHER`.

---

## 4. Evidência do Smoke Físico de Release

### 4.1. Cold Boot & Performance
- **Comando:** `adb shell am start -W -n com.gymflowai.app/.MainActivity`
- **LaunchState:** `COLD`
- **TotalTime:** `896ms` (WaitTime: `898ms`)
- **Primeira Renderização:** Perfeita, sem artefatos visuais ou tela preta, transição fluida da splash screen nativa para a landing page.

### 4.2. Fluxo de Autenticação / Onboarding
- **Ação:** Login com perfil de demonstração do usuário ("Rafael").
- **Resultado:** Hidratação completa e imediata do contexto, saudação ativa "Olá, Rafael!", pontuação de 2470 XP e streak de 5 dias exibidos sem atraso.

### 4.3. Navegação BottomNav & Biblioteca de Exercícios
- **Tabs Testadas:** Hoje, Planejar, Exercícios, Evolução, Mais.
- **Biblioteca:** Navegação na lista de exercícios, busca interativa, filtragem por grupos musculares (peito, costas, pernas).
- **Teclado:** O teclado virtual abriu normalmente na busca e foi fechado de forma limpa pelo evento de Back (`keyevent 4`) sem quebrar a tela.
- **Modal de Detalhes:** Abertura fluida do modal de detalhes do exercício com instruções de execução e fechamento instantâneo.

### 4.4. Execução de Treino & Timer de Descanso
- **Seleção:** Treino do Dia "Full Body Adaptação" (4 exercícios, ~28 min).
- **Check-in de Prontidão:** Respostas de prontidão registradas com sucesso.
- **Tracker Ativo:** Timer de treino ativo cronometrando em tempo real (`01:05`).
- **Tabela de Séries:** Logger de séries aberto, inserção de carga/repetições e marcação de série concluída (check verde).
- **Timer de Descanso:** Disparo automático do timer de descanso após conclusão da série, barra regressiva funcionando em tempo real.

### 4.5. Persistência Background / Foreground & Kill / Reopen
- **Background / Foreground:** O app foi enviado para background através da tecla Home (`keyevent 3`) e retomado via `am start`.
  - **Resultado:** Retomada quente em `136ms` (`LaunchState: HOT`), cronômetro e série marcada 100% preservados.
- **Kill + Reopen (Sobrevivência a Process Death):**
  - O app foi terminado via `adb shell am force-stop com.gymflowai.app`.
  - Reaberto a frio via `am start -W`.
  - **Resultado:** Inicialização em `920ms`. O estado do treino em andamento foi recuperado intacto do IndexedDB local com todas as séries e tempo transcorrido preservados.
- **Conclusão:** Finalização formal do treino através do modal de confirmação, persistência no histórico e atribuição de XP.

### 4.6. Módulo Nutrição (Ledger Real & Metas)
- **Acesso:** Aberto através da aba "Mais" -> "Nutrição".
- **Hoje:** Exibição do resumo diário.
- **Registro de Alimento:**
  - Busca no catálogo: pesquisa por `ovo`.
  - Seleção do item: "Ovo de galinha cozido" (100g, 155 kcal, 13g P, 1.1g C, 11g G).
  - Confirmação e gravação: inserção imediata no ledger local.
  - Verificação: Painel de Hoje recalculado em tempo real exibindo exatamente `155 kcal consumidas` e `13g de proteína`.
- **Aba Metas:** Degradação honesta ativa (`PROFILE_ABSENT`), sem geração de metas fantasmas.
- **Aba Tendência:** Cálculo real da média diária baseado no consumo lançado no ledger (1 dia registrado, 155 kcal, 13g proteína).
- **Aba Sugestões:** Catálogo verificado de sugestões offline exibido com opções válidas.

### 4.7. Modal Assistente IA & Governança D-NUT-08 / D-NUT-09
- **Abertura do Modal:** Botão "ABRIR ASSISTENTE IA" acionado na aba de sugestões.
- **Caso 1 — Completar Proteína:** Ao solicitar cálculo com metas automáticas ausentes, o app ativou a salvaguarda clínica de segurança:
  - *Mensagem exibida:* "Orientação automática pausada. Seu perfil exige acompanhamento profissional para metas automáticas — por isso a IA não foi chamada. O registro manual continua liberado."
- **Caso 2 — Substituir Alimento:**
  - Campo de busca preenchido com `arroz`.
  - Reconhecimento automático do item no catálogo: `Arroz branco cozido (1 xícara de chá cheia (~125 g))`.
  - Fechamento de teclado e envio: acionamento seguro mantendo salvaguarda clínica ativa.
  - Zero crashes, zero congelamentos de interface.
- **Navegação Back:** Modal fechado via tecla Back (`keyevent 4`) e botão X, retornando perfeitamente à tela principal.

---

## 5. Teste de Chamada ao Backend de Produção & Resiliência de Rede

### 5.1. Chamada Real ao Backend GymFlow Production
A partir do próprio Samsung Galaxy S22 em execução, foi testada a conectividade HTTPS direta com o endpoint oficial de produção:
`https://gymflow-beige-gamma.vercel.app/api/nutrition/assistant`

- **Requisição GET:**
  - **HTTP Status:** `405 Method Not Allowed`
  - **Validação:** Rota POST-only estritamente protegida contra métodos inválidos.
- **Requisição POST com Payload JSON de Teste:**
  - **HTTP Status:** `400 Bad Request`
  - **Resposta:** `{"status":"failure","code":"INVALID_REQUEST","message":"useCase inválido: esperado um dos 5 casos canônicos do NUT-007."}`
  - **Validação:** Conexão TLS, resolução DNS e validação de schema do contrato NUT-007 executadas com sucesso pelo gateway de produção a partir do aparelho real.

### 5.2. Resiliência de Rede (Offline / Retorno Online)
- **Entrada em Modo Offline:**
  - WiFi desativado (`svc wifi disable`) e Dados Móveis desativados (`svc data disable`).
  - Verificação de rede: chamada curl com timeout esgotado (`OFFLINE_VERIFIED`).
  - Comportamento do App: O app permaneceu perfeitamente responsivo, dados locais (treinos, XP, alimentos registrados no ledger) permaneceram 100% acessíveis e intactos, sem crash ou travamento.
- **Retorno ao Modo Online:**
  - WiFi e Dados Móveis reativados (`svc wifi enable`, `svc data enable`).
  - Restauração de conectividade comprovada com o backend de produção (`HTTP 405` retornado imediatamente).
  - Ícone de conexão restaurado na barra de status do sistema e sincronização operante.

---

## 6. Auditoria de Logcat, Crashes e ANRs

Durante e após toda a bateria de testes de smoke físico, foram inspecionados os registros do sistema:

- **FATAL EXCEPTION:** `0` ocorrências em `com.gymflowai.app`.
- **ANR Events:** `0` ocorrências em `com.gymflowai.app`.
- **AndroidRuntime:** `0` erros ou crashes atribuíveis ao GymFlow.
- **WebView / Chromium:** Nenhuma falha fatal de renderização ou JavaScript unhandled exception.
- **Dumpsys Activity ANRs:** `dumpsys activity anrs` auditado — nenhuma entrada para `com.gymflowai.app`.
- **Conclusão sobre o ANR do GOAL-115:** O evento de ANR registrado durante o GOAL-115 no emulador virtual ocorreu sob condição de exaustão severa de memória do host (kswapd ativo, <150MB livres). No hardware físico Galaxy S22 (8GB RAM), a responsividade foi absoluta, com cold boot abaixo de 1 segundo e transições instantâneas. O ANR anterior foi categorizado como artefato puramente ambiental e **fechado em definitivo**.

---

## 7. Critérios de Aceite & Status Final

| Critério | Esperado | Obtido | Status |
|---|---|---|---|
| Dispositivo Físico | Galaxy S22 / SM-S901E | SM-S901E (Android 16, API 36) | **PASS** |
| APK Release Instalado | Assinado, sem debug | APK Release (CN=GymFlow Internal) | **PASS** |
| Cold Boot | < 2.5s | 896ms | **PASS** |
| Navegação Principal | Completa | Home, Treinos, Nutrição, Mais | **PASS** |
| Treino & Timer | Funcional | Tracker ativo + Timer descanso | **PASS** |
| Persistência (Kill/Reopen) | Estado preservado | Recuperado de IndexedDB (920ms) | **PASS** |
| Módulo Nutrição | Ledger real ativo | 155 kcal / 13g P registrados | **PASS** |
| Modal Assistente IA | Guardrails clínicos ativos | Salvaguarda exibida, sem fake AI | **PASS** |
| Backend Production | Acesso verificado | Vercel production endpoint OK | **PASS** |
| Resiliência Offline/Online | Degradação honesta | Dados preservados, reconexão OK | **PASS** |
| Crashes | 0 | 0 | **PASS** |
| ANRs no Hardware Físico | 0 | 0 | **PASS** |
| P2 do GOAL-115 | Resolvido | Fechado (PHYSICAL_ANR_REPRODUCED=NO) | **CLOSED** |
| Prontidão Técnica Play Interna | SIM | Confirmada | **YES** |

---

## 8. Conclusão

O GymFlow Android em build **RELEASE** está tecnicamente validado e homologado para distribuição interna no Samsung Galaxy S22 SM-S901E.

- `REAL_DEVICE_RELEASE_QA = PASS`
- `PHYSICAL_ANR_REPRODUCED = NO`
- `CRASHES = 0`
- `P0 = 0` · `P1 = 0` · `P2 = 0`
- `PLAY_INTERNAL_TECHNICAL_READINESS = YES`
