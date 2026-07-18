# Proteção de alterações não salvas no Construtor

## Motivo

O GymFlow troca telas por `activeView`, sem roteador tradicional. Antes deste ajuste, o
Construtor protegia apenas seus botões Voltar/Cancelar. A barra inferior, o menu lateral, a
TopBar e qualquer outro chamador de `setActiveView` podiam desmontar a tela e perder o draft.

O guard é estado transitório de UI. Ele não faz parte do envelope `gymflow:state:v1`, do
`localStorage`, de backup, export/import ou de qualquer `WorkoutProgram`.

## Guard central

`GymFlowContext` continua expondo uma única navegação pública, `setActiveView`. Essa função
passa pelo controller de `view-navigation-guard.ts`, que admite um único guard ativo. O
Construtor registra o guard ao montar e usa o cleanup retornado para removê-lo ao desmontar.
Registrar outro guard substitui o anterior; o cleanup antigo não remove o registro novo.

Uma solicitação para a própria view é um no-op e não consulta o guard. A restrição existente
que impede abrir `active-workout` sem sessão real também foi preservada.

O logout usa a mesma solicitação protegida. Se houver draft sujo, a limpeza de usuário e
storage fica dentro da continuação e só ocorre depois da confirmação; um logout sem draft sujo
continua imediato.

## Destino pendente e confirmação

Quando a assinatura atual difere de `savedSignatureRef`, o guard do Construtor:

1. bloqueia a troca imediata;
2. guarda o destino e a continuação solicitada;
3. abre o único `ConfirmDialog` de descarte;
4. oferece “Continuar editando” e “Sair sem salvar”.

Cancelar limpa a solicitação pendente e mantém draft, modais e tela. Confirmar consome uma
continuação idempotente: mesmo que o callback seja disparado duas vezes, a navegação original
é executada uma única vez e não passa novamente pelo guard. Não existe bypass público genérico.

Todas as superfícies que já chamavam `setActiveView` ficam cobertas pelo mesmo contrato:
barra inferior mobile, menu “Mais”, menu lateral desktop, logo/streak/avatar da TopBar,
notificação de treino ativo, ações internas das telas e botão Voltar/Cancelar do Construtor.

## Navegação após salvar

`persist` atualiza de forma síncrona a referência do draft e a assinatura salva antes de pedir
a próxima view. Assim, “Salvar”, “Salvar e Planejar”, planejamento de um dia e “Iniciar Agora”
navegam sem diálogo depois de persistirem com sucesso.

“Concluir sem planejar” significa terminar a criação sem atribuir um novo dia ao calendário.
A ação agora valida a existência de ao menos um exercício, persiste o programa novamente,
marca a assinatura como salva, abre “Meus Treinos” e mostra toast. Ela não chama
`assignDayToWeekday` nem `applyProgramToWeek`; salvar uma edição ainda pode reconciliar resumos
de vínculos futuros já existentes, conforme o contrato do GOAL-19A.1.

## Fechar ou recarregar

Enquanto o draft está sujo, o Construtor mantém exatamente um listener de `beforeunload`.
O listener chama `preventDefault` e define `returnValue`, sem mensagem customizada. Ao salvar,
ficar limpo ou desmontar, o listener é removido. Um draft limpo não bloqueia reload.

## Limitações

- O projeto ainda não possui ambiente DOM/Testing Library para testes de interação de
  componentes; o controller, a continuação de uso único, registro/cleanup e `beforeunload`
  são cobertos por testes puros. Na execução do GOAL-19B.2A a página renderizou em desktop e
  390×844 sem erros de console, mas a automação não despachou handlers React; a matriz completa
  de superfícies visuais permanece pendente de repetição manual.
- A proteção cobre mudanças de `activeView` e fechamento/reload. Ela não cria autosave de draft.
- O texto do diálogo descreve genericamente “outra tela”; labels de destino não são duplicadas
  no domínio de navegação.

## Testes

`view-navigation-guard.test.ts` cobre view limpa, bloqueio, destino pendente, cancelamento,
confirmação idempotente, própria view, cleanup e remontagem. O mesmo arquivo cobre criação,
remoção e não duplicação do listener de `beforeunload`.

Os testes existentes de `workout-builder` e `workout-guided-creation` continuam cobrindo que
nome, objetivo, nível, dias, foco, duração, volume, slots, nomes e reordenação alteram a
assinatura; template e criação por frequência também deixam o draft sujo.
