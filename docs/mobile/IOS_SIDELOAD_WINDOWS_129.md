# GymFlow iOS no Windows — IPA sem assinatura (GOAL-129)

Este pipeline entrega `UNSIGNED_FOR_LOCAL_RESIGN`. Archive compilado, IPA empacotado, assinatura válida, instalação no iPhone e QA físico são checkpoints separados. O IPA precisa ser reassinado localmente antes de instalar. Não é uma entrega App Store/TestFlight.

## Gerar, acompanhar e baixar

No checkout integrado, com Node/npm e `gh auth status` autenticado:

```powershell
npm ci
npm run ios:ipa:cloud -- --ref master
```

O comando resolve o SHA remoto, usa UUID de correlação, aguarda a conclusão daquele run e baixa somente o artifact correspondente a SOURCE_SHA/RUN_ID/attempt. Se master avançar antes do checkout, a CI rejeita a divergência; execute novamente para a nova fonte. Não há escolha do "último artifact".

Para baixar um candidato de PR já concluído:

```powershell
npm run ios:ipa:cloud -- --run-id <RUN_ID> --source-sha <SOURCE_SHA_COMPLETO>
```

Destino padrão: `C:\Projetos\gymflow-artifacts\ios\<SOURCE_SHA>\`. O diretório contém somente IPA, `metadata.json`, `SHA256SUMS.txt` e este guia. Um recibo Windows fica ao lado, `<SOURCE_SHA>.download-receipt.json`. Arquivos existentes não são sobrescritos se pertencem a outro run. `--download-root <DIRETORIO>` permite conservar uma nova execução da mesma fonte em outro destino.

Confira também manualmente:

```powershell
Get-FileHash -Algorithm SHA256 '<CAMINHO_COMPLETO_DO_IPA>'
```

Retenção: 14 dias. Guarde sua cópia local; uma nova execução tem run/attempt/hash próprios. O IPA referencia seu SOURCE_SHA real, que pode ser ancestral do merge commit. Metadata distingue PR_HEAD_SHA, checkout/SOURCE_SHA e GITHUB_SHA do evento (merge ref em PR). Não existe equivalência presumida entre eles.

## O que a CI verifica

Runner padrão `macos-26`; `npm ci`, TypeScript, prontidão iOS e testes do pacote; build canônico `build:mobile -- --ai-backend production`, Capacitor, CocoaPods e archive Release `generic/platform=iOS`. Signing permanece desligado (`CODE_SIGNING_ALLOWED=NO`, `CODE_SIGNING_REQUIRED=NO`, identidade vazia).

Após os gates existentes: compara todos os hashes do `out/` com `App.app/public/`, incluindo mídia integrada; comprova o resolvedor público GymFlow; verifica bundle `com.gymflowai.app`, versão real, ícones e Privacy Manifest; inspeciona cada Mach-O para arm64/iPhoneOS, cryptid zero e entitlements/capacidades. Nome de variável não é tratado como segredo. Credenciais e backups pessoais são rejeitados. Capacidades extras exigem avaliação explícita e não são removidas.

Copia o bundle sem alterar o archive, mantém modos/links, cria `Payload/App.app`, testa CRCs do ZIP, extrai e compara bytes/modos/links contra a origem. Só publica os quatro entregáveis sanitizados. Privacy Manifest presente não representa aprovação jurídica. Geração cloud não comprova assinatura ou funcionamento nativo.

## Preparar o Windows

Use exclusivamente [Sideloadly oficial](https://sideloadly.io/) e os links Apple exibidos nessa página. Em 2026-10-04 a página apresenta Sideloadly 0.70.1 e exige versões web de iTunes/iCloud no Windows. Verifique novamente ao preparar outra máquina. Os links Apple oficiais mostrados são [iTunes 64 bits](https://www.apple.com/itunes/download/win64) e [iCloud web](https://updates.cdn-apple.com/2020/windows/001-39935-20200911-1A70AA56-F448-11EA-8CC0-99D41950005E/iCloudSetup.exe).

Inspecione instalações existentes e assinatura Authenticode dos instaladores baixados. Se houver versões Microsoft Store ou conflito, pare nesse checkpoint e peça autorização específica antes de remover/substituir componentes. UAC e aceitação de licenças pertencem ao responsável. Não desative antivírus/TLS. Sem jailbreak, tweaks, certificados comprados ou serviço pago.

## Assinar e instalar com o responsável

1. Conectar o iPhone por USB, desbloquear e aceitar "Confiar" manualmente. Registrar somente modelo e versão iOS; não publicar UDID/serial/dados pessoais.
2. Confirmar se já existe GymFlow. Nesse caso registrar sua identidade de instalação e estado visível antes da atualização. Preservar a mesma Conta Apple de assinatura e bundle efetivo. Se a identidade anterior for desconhecida, parar antes de sobrescrever; não desinstalar nem apagar dados para contornar erro.
3. Abrir Sideloadly e carregar o IPA cujo hash foi validado. Preferir Conta Apple de testes no Sideloadly, mantendo o iCloud pessoal da esposa conectado no iPhone. Senha e 2FA são digitados manualmente na interface local, sem captura de tela ou logs nesse intervalo.
4. Usar sideload comum por Apple ID, sem injeção ou alterações de capacidades. Manter auto-refresh, salvamento de credenciais e inicialização automática desligados; dependem de consentimento separado.
5. Registrar bundle efetivo escolhido pela ferramenta e sua validade real. Quando o canônico conflitar numa instalação nova de teste, documentar um identificador estável, como `com.gymflowai.qa129.<SUFIXO_ESTAVEL>`. Um novo identificador representa outro container de dados. Nunca trocar identidade de uma instalação existente silenciosamente.
6. No iOS 16+, habilitar Modo de Desenvolvedor quando exigido; desbloqueio, confirmação e reinício ficam com o responsável. Confiar no desenvolvedor em Ajustes quando solicitado. Se a ferramenta exigir revogar certificados ou remover apps, interromper e pedir autorização específica.

A conta gratuita normalmente tem provisionamento de sete dias e limite de três apps por aparelho; registrar a expiração emitida, sem presumir sucesso. Fontes: [Apple Personal Team](https://developer.apple.com/help/account/basics/about-your-developer-account) e [FAQ Sideloadly](https://sideloadly.io/faq).

## QA físico e renovação

Registrar PASS/FAIL/BLOCKED e horário somente do intervalo de QA: instalação/abertura, onboarding com perfil de testes válido, início e edição de treino, teclado/safe area, mídia efetivamente integrada, Back interno e persistência. Testar background/foreground com treino ativo e fechar/reabrir. Observar crash/travamento nesse intervalo, sem coletar logs gerais do aparelho.

IA: verificar o bloqueio honesto sem perfil elegível; com perfil de QA válido, fazer uma chamada mínima pelo próprio app. Requisição curl não comprova funcionamento nativo. Não importar backup sobre dados existentes. Se preservar dados, comparar o estado autorizado antes/depois, sem publicá-lo no Git.

Renovar antes da expiração: mesmo bundle efetivo, mesma Conta Apple de assinatura, IPA validado e atualização sobre o app existente. Preservar container e dados; não usar uninstall/clear/reset, revogação de certificado ou remoção de outros apps. Não habilitar renovação automática com credenciais salvas sem consentimento.

Checkpoint humano quando indisponível: concluir instalação dos componentes gratuitos aprovando UAC/licenças, conectar/desbloquear/Confiar, informar somente modelo/iOS e existência de GymFlow, entrar na Conta Apple de testes localmente, registrar assinatura/bundle/expiração, instalar e executar o roteiro físico. IPA_BUILD e WINDOWS_DOWNLOAD podem estar PASS enquanto SIDELOAD_SIGNING, IPHONE_INSTALL e IPHONE_PHYSICAL_QA permanecem PENDING_HUMAN.
