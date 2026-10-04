# GOAL-129 — Validação do candidato do pipeline iOS

Data local: 2026-10-04. Base remota real: `7717333e7e4d31a8fead14f033b69833ad9835da`, descendente da base observada `0a27bb89c2d53fc28f4864e42da8c9c1fff75e2d`. Branch: `codex/goal-129-ios-ipa-sideload`; worktree exclusivo `C:\Projetos\gymflow-goal-129-ios-ipa`. A base real já integra PR-64/GOAL-128; nenhum WIP externo foi incorporado.

## Gates locais executados

| Gate | Resultado |
| --- | --- |
| npm ci (lockfile existente) | PASS, 543 pacotes, sem mudança de dependências |
| ios:ipa:test no Windows | PASS, 36 testes; 2 casos próprios de macOS aguardam CI |
| ios:validate | PASS, 17 testes |
| tsc --noEmit | PASS |
| build web | PASS, Next 16.2.6 |
| build:mobile -- --ai-backend production | PASS |
| Scan do export mobile / resolvedor canônico | PASS, 406 arquivos; 335 mídias; 33.710.379 bytes de mídia |
| Lint dos quatro scripts novos | PASS |
| node --check / parse YAML / git diff --check | PASS |

Não houve mudança funcional do app; a suíte completa adicional não é necessária para este delta de scripts/workflow. A CI por PR ainda deve executar os gates nativos reais e os dois testes próprios do macOS antes de merge. Source/run/artifact/hashes definitivos ficam no metadata do IPA e no recibo local pós-download, evitando autorreferência no commit que identificam.

## Revisão independente

Um único subagente revisor read-only examinou os quatro scripts, testes, workflow e guia contra a base. Nenhum finding P0/P1/P2 acionável. Quatro scripts passaram em node --check. O revisor não leu credenciais, acessou rede/aparelho, editou arquivos nem executou CI. O delta final de contagem de mídia usa o caminho integrado assets/exercises/; os gates de conteúdo continuam comparando toda a árvore web.

## Pré-flight cloud e Windows

GitHub autenticado, repositório público, Actions habilitado. Usa exclusivamente runner padrão macos-26, sem serviço pago ou Apple credentials. As permissões deste workflow são contents:read; checkout não persiste credenciais; nenhum pull_request_target, environment de Production ou Release pública foi adicionado.

Inspeção read-only do Windows 64 bits não encontrou iPhone USB, Sideloadly nem componentes Apple. Os instaladores oficiais foram preparados em `C:\Projetos\gymflow-artifacts\ios\windows-setup\`, com origem/hashes em `official-downloads.json`. iTunes/iCloud têm Authenticode Valid (Apple Inc.); Sideloadly do domínio oficial tem status NotSigned, sem identidade de assinante verificável por Authenticode. Nenhum instalador foi executado; UAC/licenças pertencem ao responsável. Nenhum componente existente foi removido/substituído.

SIDELOAD_SIGNING, IPHONE_INSTALL e IPHONE_PHYSICAL_QA permanecem PENDING_HUMAN. Modelo/iOS, bundle efetivo, validade e preservação física de dados ainda não foram observados. Próximo checkpoint: responsável instala componentes oficiais aceitando UAC/licenças, conecta/desbloqueia/Confiar no iPhone e informa somente modelo/iOS/existência de GymFlow; senha/2FA entram localmente sem captura. O guia IOS_SIDELOAD_WINDOWS_129.md define continuidade, assinatura gratuita, QA e renovação sem apagar dados.

## Regressão descoberta no primeiro run macOS

Run 37233323123/candidato 46564f2: archive Release e auditorias anteriores PASS; embalagem falhou porque o Info.plist real do xcarchive contém CreationDate do tipo NSDate, incompatível com a conversão JSON integral do plutil. Correção extrai somente o dicionário ApplicationProperties auditado, mantendo a origem intacta e todos os gates. O teste macOS de empacotamento/CRC/extração agora contém data tipada XML, cobrindo a regressão. Artifact falho não foi publicado ou baixado; candidato corrigido exige nova CI antes de merge.
