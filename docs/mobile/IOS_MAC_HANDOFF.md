# Guia de Handoff iOS / Mac / App Store — GymFlow AI
**ID do Documento:** `docs/mobile/IOS_MAC_HANDOFF.md`  
**Milestone de Referência:** `GYMFLOW-MOBILE-CROSS-PLATFORM-006`  
**Versão Alvo:** 1.0 (Build 1)  
**Bundle Identifier:** `com.gymflowai.app`  
**Nome de Exibição:** `GymFlow`  
**Data:** Setembro de 2026  

---

## 1. Contexto e Propósito

Este documento destina-se a um engenheiro ou operador que esteja utilizando um **macOS com Xcode instalado**. Ele detalha todas as etapas necessárias para clonar, compilar, testar, assinar e empacotar o GymFlow AI no iOS a partir do commit do repositório, **sem reconstruir contexto** e sem exigir nenhuma credencial comitada no Git.

> [!IMPORTANT]
> **Workspace vs. Project:** Abra sempre `ios/App/App.xcworkspace`, **NUNCA** o `ios/App/App.xcodeproj` isolado. Como o projeto integra plugins nativos do Capacitor via CocoaPods, a abertura incorreta do `.xcodeproj` causará erros de link de frameworks (`Pods_App.framework not found`).

---

## 2. Requisitos da Toolchain no macOS

- **Sistema Operacional:** macOS 14 (Sonoma), macOS 15 (Sequoia) ou posterior.
- **Xcode:** Xcode 16 / 26 ou posterior com suporte ao iOS SDK 18 / 26+.
- **Command Line Tools:** `xcode-select --install` configurado (`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`).
- **Node.js:** Node 20.x ou 22.x LTS.
- **Gerenciador de Pacotes:** `npm` (v10+).
- **CocoaPods:** v1.14+ instalado (`sudo gem install cocoapods` ou via Homebrew: `brew install cocoapods`).

---

## 3. Passo a Passo de Execução no Mac

### Passo 1: Obter o Código
```bash
git clone <URL_DO_REPOSITORIO> gymflow-ai
cd gymflow-ai
# Realize o checkout do commit ou branch correspondente ao marco MOBILE-006
git checkout <COMMIT_SHA_OU_BRANCH>
```

### Passo 2: Instalar Dependências Web
```bash
npm ci
```

### Passo 3: Compilar o Frontend Mobile Estático
Gera os artefatos estáticos otimizados na pasta `out/` com `BUILD_TARGET=mobile`:
```bash
npm run build:mobile
```

### Passo 4: Sincronizar o Capacitor para iOS
Copia o bundle `out/` para o diretório nativo `ios/App/App/public` e atualiza a configuração:
```bash
npx cap sync ios
```

### Passo 5: Resolver Dependências Nativas (CocoaPods)
No terminal, entre na pasta do projeto iOS e execute o instalador do CocoaPods:
```bash
cd ios/App
pod install
cd ../..
```

### Passo 6: Abrir o Workspace no Xcode
```bash
open ios/App/App.xcworkspace
```
*(ou execute diretamente `npm run ios:open`)*

---

## 4. Configuração de Assinatura (Code Signing) no Xcode

1. Na barra lateral esquerda do Xcode (Project Navigator), selecione o projeto raiz **App**.
2. Selecione o Target **App** na seção de targets.
3. Clique na aba **Signing & Capabilities**.
4. Certifique-se de que a opção **"Automatically manage signing"** esteja marcada.
5. No menu suspenso **Team**:
   - Selecione a sua equipe de desenvolvedor Apple cadastrada no **Apple Developer Program**.
   - Se sua conta não estiver listada, acesse **Xcode -> Settings -> Accounts** (`Cmd + ,`) e adicione seu Apple ID.
6. Verifique se o **Bundle Identifier** está fixado em `com.gymflowai.app`.
7. O Xcode gerará automaticamente o Provisioning Profile de desenvolvimento.

---

## 5. Build e Execução em Simulador e Dispositivo Físico

### 5.1. Execução no iOS Simulator
1. Na barra superior do Xcode, selecione o destino de execução (Scheme selector):
   - Alvo: **App**
   - Dispositivo: **iPhone 16 / 17 Pro** ou **iPhone SE (3rd generation)**.
2. Inicie a compilação e execução pressionando `Cmd + R` (ou o botão Play).
3. O simulador será iniciado com o splash screen escuro oficial (`#09090b`), transicionando suavemente para a tela inicial do GymFlow.

### 5.2. Execução em iPhone Físico
1. Conecte o iPhone ao Mac via cabo USB/USB-C (ou configure emparelhamento sem fio via rede local).
2. No iPhone, se for a primeira conexão, autorize o computador selecionando **"Confiar neste Computador"**.
3. No iPhone com iOS 16+, habilite o **Modo de Desenvolvedor** em:
   - **Ajustes -> Privacidade e Segurança -> Modo de Desenvolvedor -> Ativar** (o aparelho reiniciará).
4. No Xcode, selecione o seu dispositivo físico no seletor de destino.
5. Execute `Cmd + R`.
6. Se o app não abrir imediatamente devido à verificação de perfil no dispositivo, acesse:
   - **Ajustes -> Geral -> Gerenciamento de VPN e Dispositivo -> App de Desenvolvedor -> Confiar no Desenvolvedor**.

---

## 6. Procedimento de Archive e Validação de Submissão

Quando os testes estiverem concluídos e a versão estiver pronta para TestFlight / App Store:

1. No seletor de destino do Xcode, selecione **Any iOS Device (arm64)**.
2. Acesse o menu superior: **Product -> Archive**.
3. O Xcode compilará o release binário e abrirá automaticamente a janela **Organizer** com o Archive gerado.
4. Na janela Organizer, selecione o Archive do GymFlow e clique no botão **Validate App** (à direita).
   - O Xcode consultará o App Store Connect e validará:
     - Bundle Identifier (`com.gymflowai.app`);
     - Privacy Manifest (`App.app/PrivacyInfo.xcprivacy`);
     - Ícone universal 1024x1024 sem transparência;
     - Conformidade de arquitetura e certificados.
5. Após o resultado **"Validation Succeeded"**:
   - Para envio ao TestFlight: clique em **Distribute App -> App Store Connect -> TestFlight & App Store -> Upload**.
   - Siga as instruções do assistente para envio do binário assinado.

---

## 7. Roteiro Obrigatório de Smoke Test no Mac / iPhone

Execute o seguinte checklist completo de validação funcional antes de autorizar release:

- [ ] **1. Instalação Limpa:** O app instala com sucesso sem erros de assinatura ou integridade de manifesto.
- [ ] **2. Splash Screen:** Ao tocar no ícone, a tela de splash escura (`#09090b`) com o monograma "G" em verde-lima é exibida perfeitamente centralizada e desaparece com fade suave de 300ms.
- [ ] **3. Onboarding:** Fluxo inicial de questionário responde com transições fluídas e sem salto de viewport.
- [ ] **4. Dashboard:** Cards de Treino do Dia, resumo semanal, consistência e métricas carregam normalmente.
- [ ] **5. Workout Builder:** Criação e edição de rotinas personalizadas respondem aos toques e salvam no estado local.
- [ ] **6. Início de Treino:** Iniciar um treino cria a sessão com status `active` e registra o timestamp `startedAt`.
- [ ] **7. Séries / RIR / Readiness:** Marcação de séries concluídas, ajuste de carga/reps e avaliação de RIR/readiness atualizam a tela em tempo real.
- [ ] **8. Navegação Interna / Abas:** Transição entre Dashboard, Treinos, Biblioteca, Evolução e Nutrição ocorre instantaneamente.
- [ ] **9. Ciclo Background -> Foreground com Treino Ativo:**
  - Iniciar treino ativo;
  - Minimizar o app (voltar para a Home do iOS);
  - Aguardar 2 minutos;
  - Reabrir o GymFlow;
  - O treino ativo permanece aberto, o timer reflete o tempo real decorrido (`Date.now() - startedAt`) e nenhum dado de série foi perdido.
- [ ] **10. Teclado Virtual:** Ao focar em inputs (ex.: campos de carga, repetições, notas), o teclado sobrepõe/redimensiona o corpo sem esconder campos críticos nem quebrar a barra inferior (`KeyboardResize.Body`).
- [ ] **11. Biblioteca de Exercícios:** Listagem, filtros por grupo muscular e busca rápida operam sem travamentos.
- [ ] **12. Evolution Dashboard:** Gráficos de volume e histórico de sessões anteriores renderizam corretamente via SVG/Canvas.
- [ ] **13. Mídia — Fallback de Rede:** Ao tocar em um exercício sem mídia offline prévia baixada, o player carrega o stream via CDN HTTPS (`https://assets.gymflow.ai/media/...`).
- [ ] **14. Mídia — Download Offline Real:** Ao acionar o download offline de um exercício, o arquivo `.mp4` é baixado para `Directory.Data` (`gymflow-media/`) e passa a ser reproduzido via esquema local `Capacitor.convertFileSrc` (`capacitor://localhost/_capacitor_file_/...`).
- [ ] **15. Exportação de Backup (Share Sheet):**
  - Acessar Configurações -> Exportar Backup;
  - O arquivo JSON é gerado em `Directory.Cache`;
  - A folha nativa de compartilhamento do iOS (`UIActivityViewController`) abre permitindo Salvar em Arquivos, AirDrop ou enviar por mensagem;
  - O arquivo temporário é limpo com segurança.
- [ ] **16. Importação de Backup:** Selecionar um arquivo JSON de backup válido restaura as rotinas e histórico fielmente.
- [ ] **17. Modo Avião (Offline Completo):**
  - Ativar Modo Avião no iOS;
  - Navegar pelo app, consultar exercícios baixados, iniciar e finalizar um treino;
  - O app opera 100% offline com persistência em IndexedDB/LocalStorage.
- [ ] **18. Encerramento Forçado e Reabertura:**
  - Forçar encerramento do app no App Switcher (swipe up);
  - Reabrir o GymFlow;
  - Sessão ativa ou estado mais recente é restaurado do envelope de storage com fidelidade absoluta.
- [ ] **19. Persistência após Reinício do Dispositivo:**
  - Reiniciar o iPhone;
  - Abrir o app;
  - Todos os treinos concluídos, XP, streak e plano semanal continuam intactos.

---

## 8. Inventário de Privacidade (App Store Privacy Questionnaire)

Ao cadastrar a seção **App Privacy** no App Store Connect, preencha estritamente de acordo com a arquitetura do GymFlow:

| Categoria de Dado | Coletado pelo Desenvolvedor? | Vinculado à Identidade do Usuário? | Usado para Tracking? | Justificativa / Armazenamento |
|---|---|---|---|---|
| **Informações de Contato** | Não | Não | Não | Não coletado. |
| **Dados de Saúde / Fitness** | Não coletado remotamente | Não | Não | Treinos, cargas e RIR ficam **estritamente locais** no aparelho do usuário (`IndexedDB`). |
| **Localização** | Não | Não | Não | Nenhuma API de localização utilizada. |
| **Fotos ou Vídeos** | Não | Não | Não | Mídia de exercícios é apenas baixada em cache do app; fotos do usuário não são acessadas. |
| **Identificadores (IDFA)** | Não | Não | Não | Zero bibliotecas de anúncios ou ATT. |
| **Dados de Diagnóstico / Crash** | Não coletado | Não | Não | Nenhum SDK de analytics terceiro integrado. |

**Conclusão para App Store Connect:**  
Marque a opção: **"Não, nós não coletamos dados deste app"** (*Data Not Collected*). Se no futuro for integrado serviço de crash reports ou backend remoto, essa declaração deverá ser revisada.

---

## 9. Conformidade de Exportação (Export Compliance)

- **Criptografia Utilizada:** O GymFlow AI utiliza **exclusivamente HTTPS/TLS** padrão fornecido pelo sistema operacional (WebKit / iOS Foundation) para downloads de mídia do CDN e requisições seguras.
- O app **NÃO** implementa algoritmos de criptografia proprietários nem segurança customizada de nível militar.
- **Classificação EAR:** Isento sob as provisões da categoria 5, parte 2 das Export Administration Regulations (EAR) dos EUA para uso padrão de autenticação/HTTPS.
- **Pergunta no App Store Connect / Archive:**  
  *"O app utiliza criptografia não isenta?"* -> Selecione **"Não"**.

---

## 10. Checklist de Cadastro no App Store Connect

- [ ] **1. Apple Developer Account:** Inscrição ativa no Apple Developer Program (Individual ou Organização).
- [ ] **2. App Record:** Criar novo app no App Store Connect:
  - Plataforma: `iOS`
  - Nome: `GymFlow`
  - Idioma Primário: Português (Brasil) / Inglês
  - Bundle ID: `com.gymflowai.app`
  - SKU: `gymflow-ai-ios-01`
- [ ] **3. URLs Obrigatórias:**
  - Privacy Policy URL: `https://gymflow.ai/privacy` (ou página equivalente publicada)
  - Support URL: `https://gymflow.ai/support`
- [ ] **4. Classificação Etária (Age Rating):** Responder ao questionário da Apple (o app não contém violência, conteúdo adulto, apostas ou conteúdo médico restrito -> Classificação 4+ ou 12+ dependendo de referências a condicionamento físico).
- [ ] **5. Screenshots Requeridos:**
  - **iPhone 6.9" / 6.7" (obrigatório):** 1320 × 2868 px ou 1290 × 2796 px (mínimo 3 capturas: Dashboard, Treino Ativo, Evolução).
  - **iPhone 6.5" (obrigatório):** 1284 × 2778 px ou 1242 × 2688 px.
  - **iPad 13" (se distribuído como Universal):** 2064 × 2752 px.
- [ ] **6. Textos de Apresentação:**
  - Nome do App: `GymFlow`
  - Subtítulo (até 30 caracteres): *Treino Inteligente e Métricas*
  - Descrição: Visão do produto, suporte offline, privacidade total e controle de sobrecarga progressiva.
  - Palavras-chave: *musculação, treino, academia, fitness, hipertrofia, rir, volume*
- [ ] **7. Informações de Revisão (Review Notes):**
  - O app funciona com persistência local e não exige login obrigatório para o core de treinos (ou fornecer credencial demo caso tela de login esteja habilitada).
