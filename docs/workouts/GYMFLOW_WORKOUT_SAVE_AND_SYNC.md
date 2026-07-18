# Salvamento e sincronização de treinos

## Escopo

Este documento registra o contrato do GOAL-19A.1 para o fluxo:

`WorkoutProgram → WeeklyWorkoutDay → WorkoutSession → workoutHistory`.

O objetivo é impedir caches antigos, início ambíguo de dias e perda silenciosa de edições da sessão, sem alterar progressão, volume, duração, catálogo ou o envelope de persistência v1.

## Fontes de verdade

### Programa futuro

`WorkoutProgram` é a fonte de verdade da prescrição para os próximos treinos. A estrutura canônica de um programa multi-dia continua em `weeks[].days[]`; cada `ProgramDay.id` é identidade estável e não deve ser substituído por posição ou `dayNumber`.

### Planejamento semanal

`WeeklyWorkoutDay` representa o vínculo da semana atual. Ele guarda `programId` e `programDayId`, além de um cache de apresentação (`workoutName`, grupos musculares, duração e quantidade de exercícios).

Esse cache é reconciliado quando o programa vinculado é salvo. Dias já treinados não são reescritos retroativamente.

O card do Planejador apresenta a quantidade real de exercícios ao lado da duração estimada, além do nome e dos grupos. Esses valores vêm da mesma versão reconciliada usada para iniciar o treino, sem uma segunda leitura paralela do programa.

### Sessão ativa

`activeWorkout` é um snapshot editável criado quando o treino começa. Carga, repetições, RPE, notas e alterações estruturais pertencem somente a essa execução.

Editar a sessão não altera automaticamente o programa. Editar o programa durante uma sessão também não reconstrói nem sobrescreve o snapshot já iniciado.

### Histórico

`workoutHistory` contém snapshots concluídos. Finalizar usa o próprio `activeWorkout`, acrescentando apenas métricas finais. O histórico não consulta novamente o programa e continua válido se programa ou dia forem renomeados, editados ou excluídos depois.

## Origem da sessão

Sessões iniciadas de programa podem carregar campos opcionais:

- `sourceProgramId`;
- `sourceProgramDayId`;
- `sourceProgramName`;
- `sourceProgramDayName`.

Os campos explicam a origem e permitem abrir o programa/dia correto. São opcionais para manter sessões antigas e treinos livres válidos. Como fazem parte do próprio `WorkoutSession`, sobrevivem à hidratação, ao histórico e ao export/import sem migração.

Treino livre não possui origem.

## Reconciliação do planejamento

Ao salvar um programa personalizado, a reconciliação examina apenas dias do planejamento que:

1. ainda não foram treinados; e
2. possuem `programId` igual ao programa salvo.

Se o mesmo `programDayId` ainda existir, o cache é recalculado a partir do dia salvo e do catálogo real de exercícios:

- rótulo pelo helper de nome de dia;
- grupos musculares pelos slots;
- duração estimada;
- quantidade real de exercícios;
- IDs de programa e dia preservados.

Dias de outros programas e dias já treinados são devolvidos sem alteração.

### Dia removido

Se o ID exato não existir mais, não há fallback para outro dia. O vínculo é limpo, os resumos derivados são zerados, o nome passa a “Escolha novamente o treino” e `planningIssue` registra `missing-program-day`.

O Planejador mostra o aviso “O dia usado neste planejamento foi removido do programa. Escolha novamente um treino.” e bloqueia o início até uma nova escolha.

`weeklyPlan` e `user.weeklyPlan` recebem exatamente a mesma versão reconciliada. Um usuário nulo não impede a atualização do estado principal.

## Resolução estrita para iniciar

As regras para programas estruturados são:

- com `programDayId`: procurar somente o ID informado; se não existir, bloquear;
- sem `programDayId` e com exatamente um dia: iniciar esse dia;
- sem `programDayId` e com vários dias: exigir escolha explícita;
- com `explicitDay`: aceitar somente a identidade explícita compatível;
- programa legado sem dias estruturados: manter o caminho documentado por `exercises`;
- treino livre: continuar independente de programa.

Nenhum erro de resolução cria sessão vazia e nenhum programa multi-dia inicia silenciosamente o Dia 1. A aba Treinos reutiliza seu modal de detalhes como seletor de dias.

## NumericInput e persistência durante a edição

`NumericInput` mantém um rascunho textual enquanto está focado. Assim, textos intermediários como `080`, `12,5`, vazio e separador decimal parcial não são reformatados a cada tecla.

Quando o rascunho representa um número válido, `onValidChange` envia imediatamente ao pai o valor normalizado e limitado por `min`/`max`, sem substituir o texto visível. Nos campos de carga, repetições e RPE, esse callback atualiza o `GymFlowContext` antes do blur.

Regras de confirmação:

- blur normaliza visualmente e chama `onCommit`;
- Enter desfoca e confirma;
- Escape restaura o valor existente no início da edição e desfaz uma emissão válida da edição cancelada;
- vazio temporário não vira zero durante a digitação;
- no blur, vazio segue `emptyBehavior` (`revert` ou `null`);
- atualizações externas não atropelam um rascunho focado.

Abrir ou confirmar a finalização desfoca o elemento ativo. O componente não acessa `localStorage`: a persistência continua centralizada no Context, com debounce e flush em `pagehide`/`visibilitychange`.

## Semântica visível na sessão

A Sessão Ativa explica que ajustes locais valem para a execução atual e para o histórico. Quando há origem, “Editar programa de origem” abre o programa/dia exato no Construtor. Se programa ou dia não existirem mais, a ação é bloqueada em vez de abrir outro dia.

A sessão continua ativa em background. Salvar o programa afeta os próximos treinos e o planejamento futuro, não o snapshot em andamento.

Enquanto existe uma sessão ativa, qualquer tentativa global de iniciar outra sessão é bloqueada. No fluxo “Editar programa de origem”, o Construtor oculta “Iniciar Agora”; cancelar retorna à sessão existente, com todas as alterações locais preservadas.

O Context mantém referências canônicas para sessão ativa, histórico e horário de início. Assim, finalização e flush de ciclo de vida enxergam também mudanças ocorridas no mesmo tick, sem depender de um render intermediário.

## Compatibilidade

- `CURRENT_STORAGE_VERSION` continua `1`;
- a chave continua `gymflow:state:v1`;
- não há migração obrigatória;
- sessões antigas sem origem continuam válidas;
- export/import preserva campos opcionais por serializar o snapshot integral;
- programa não recebe automaticamente valores executados;
- histórico não é reconciliado com programa.

## Limitações e continuação

Este incremento não propaga cargas, repetições, RPE, substituições ou exercícios improvisados da sessão para a prescrição futura. Uma ação deliberada para promover alterações executadas ao programa, com revisão de diferenças e confirmação do usuário, fica para o GOAL-23A.

Progressão, motor de volume, motor de duração, backend e sincronização entre dispositivos permanecem fora deste escopo.
