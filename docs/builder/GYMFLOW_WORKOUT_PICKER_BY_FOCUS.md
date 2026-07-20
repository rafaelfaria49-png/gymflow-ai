# Picker de exercícios por foco do dia

Status: GOAL B (`GYMFLOW-BUILDER-TF-GOAL-B-PICKER-FOCO-001`) e GOAL C (`GYMFLOW-BUILDER-TF-GOAL-C-BADGES-LEGADO-001`) implementados conforme os ADRs TF-004/TF-005 aceitos. Corretivo `GYMFLOW-BUILDER-TF-GOAL-C-TODOS-FLAT-CORRECTIVE-004` aplicado: a aba Todos não tem foco ativo e por isso não agrupa por papel (ver seção "Comportamento do modal").

## Contrato de domínio

`src/lib/workout-picker.ts` mantém o picker fora do React e sem qualquer mecanismo de recomendação:

- `getDayFocusGroups` remove ids inválidos/duplicados e devolve os focos na ordem canônica de `MUSCLE_GROUPS`;
- `groupExercisesForDayFocus` resolve cada foco isoladamente, preserva `{ exercise, match: ExerciseFocusMatch }` por item e mantém a ordem original da biblioteca;
- a resolução continua sendo exclusivamente `matchesDayFocus`; não há score, pontuação, ranking ou ordenação de exercícios;
- `filterExercisesByDayFocus` preserva assinatura e resultado públicos em `workout-builder.ts`, agora por delegação ao mesmo domínio;
- a aba aplica `matchesExerciseSearch` somente depois da resolução do foco; a busca persiste entre abas e limpar a busca não altera a aba;
- os contadores do rodapé usam os mesmos grupos resolvidos que alimentam as listas.
- `getWorkoutPickerSections` particiona os itens, sem reordenar dentro de cada seção: Principais (`primary`/`legacy-primary`), Sinergistas (`secondary`/`legacy-secondary`) e Classificação legada (`legacy-generic`); só é chamada para abas de foco;
- `getWorkoutPickerItemMetadata` resolve somente o rótulo do grupo principal e devolve o equipamento raw, sem curar ou normalizar o catálogo; só é chamada para itens de abas de foco;
- `getWorkoutPickerTabResult` devolve `WorkoutPickerGroupedTabResult` (`mode: 'grouped'`, com seções) para abas de foco e `WorkoutPickerFlatTabResult` (`mode: 'flat'`, `items: Exercise[]`) para `Todos`. Sem foco ativo não existe base semântica para atribuir papel muscular — Todos nunca chama `getWorkoutPickerSections` nem `getWorkoutPickerItemMetadata` (corretivo 004, P1).

## Comportamento do modal

- Um chip por foco válido, na ordem da taxonomia, seguido de `Todos`.
- A primeira aba é o primeiro foco; um foco gera `[Foco, Todos]`; sem foco o modal exibe explicitamente uma única aba `Todos`, selecionada e associada ao tabpanel da biblioteca inteira.
- O conteúdo interno desmonta quando `isOpen` fica falso e é chaveado por `day.id`; reabrir reinicia busca e primeira aba.
- Selecionar exercício chama somente `onAdd` e não fecha o modal.
- Abas de foco: cada seção não vazia tem cabeçalho acessível; Sinergistas nasce colapsada por aba e usa disclosure independente. Isso não implementa o toggle de abrangência `[Principais|Incluindo sinergistas]`.
- Abas de foco: Classificação legada permanece expandida, exibe “Revise o grupo antes de adicionar” e nunca esconde um `legacy-generic` válido.
- Abas de foco: cada item mostra badges de grupo principal resolvido (accent), equipamento raw (neutro) e Legado (âmbar) quando `match.legacy`; badges longos truncam dentro do card. O `aria-label` anuncia nome, grupo principal e equipamento.
- Aba Todos (sem foco ativo, corretivo 004): lista única e plana de `tabResult.items`, na ordem original da biblioteca — sem seção, sem cabeçalho "Principais"/"Sinergistas"/"Classificação legada" e sem badge de grupo ou de Legado. O card mostra nome e equipamento raw; o `aria-label` anuncia nome e equipamento, sem grupo. `ExercisePickerItem` recebe `focusRole` opcional: presente (grupo + legado) em abas de foco, ausente em Todos.
- Em ambos os modos: `No treino ×N`, `Adicionar novamente` e "Já está no {dia}" continuam vindo de `countInDay`/`otherDaysWithExercise`, e `onAdd(exercise)` é a única ação de inclusão do card; headings e controles têm semântica e foco visível.
- A tablist implementa roving `tabIndex`, `aria-selected`, `aria-controls`, painel associado, setas com wrap e Home/End.
- No mobile, chips e contadores usam `overflow-x-auto` e snap horizontal. O overlay usa `z-[100]` para ficar acima da navegação global móvel.
- O overlay reserva a safe-area inferior com `padding-bottom: calc(1rem + env(safe-area-inset-bottom))`; inset zero preserva o padding visual mínimo de 1 rem.

## Cobertura e validação

`workout-picker.test.ts` cobre PART15 17–27, preservação de `ExerciseFocusMatch`, ausência de reordenação, compatibilidade do filtro público, contadores pela mesma resolução, busca dentro da aba, persistência/limpeza da busca e reset ao reabrir. PART15 23–25 verificam a ordem e o estado inicial das seções, `legs_general` de Quadríceps exclusivamente na seção legada com marcação individual e a impossibilidade de um sinergista aparecer em Principais. O bloco `GYMFLOW-BUILDER-TF-GOAL-C-TODOS-FLAT-CORRECTIVE-004 / P1` (6 casos) cobre o modo `flat` de Todos: biblioteca completa e na ordem original, ausência de `match`/seção/`usesLegacyClassification` no resultado, busca sobre a lista plana (com e sem resultado), imutabilidade da biblioteca de entrada e preservação do modo `grouped`/exclusividade/total em abas de foco reais.

Validação do GOAL C original (2026-07-19, antes do corretivo):

- `npx vitest run`: 29 arquivos, 572 testes; `npx tsc --noEmit`: aprovado; ESLint dos arquivos tocados: aprovado; `npm run build`: aprovado no Next.js 16.2.6;
- QA no navegador em 360 × 800: documento `354/354 px` e diálogo `321/321 px` sem overflow horizontal; 23 itens de `legs_general` em Quadríceps somente em Classificação legada; equipamento raw e badge Legado visíveis por item; oito badges longos truncaram de fato (`scrollWidth > clientWidth`) sem estourar o card; os 23 `aria-labels` inspecionados continham grupo e equipamento; setas trocaram Quadríceps → Todos com foco visível; Tríceps abriu com `Sinergistas (15)` colapsada, e a expansão mostrou Supino como primeiro sinergista, nunca em Principais; zero erro ou warning no console.
- Nessa validação, a aba Todos ainda expunha `Principais (126)` — esse era exatamente o P1 corrigido a seguir.

Validação do corretivo `GYMFLOW-BUILDER-TF-GOAL-C-TODOS-FLAT-CORRECTIVE-004` (2026-07-20):

- `npx vitest run`: 29 arquivos, **578 testes** (572 + 6 novos); `npx tsc --noEmit`: aprovado; ESLint dos arquivos tocados: aprovado; `npm run build`: aprovado no Next.js 16.2.6; `git diff --check`: aprovado.
- QA de Todos e das abas de foco feita por rastreamento estrutural do código (JSX, classes CSS herdadas intactas, callers) e pela suíte de testes — a extensão do Chrome não estava disponível neste ambiente para uma sessão de navegador ao vivo nesta rodada; nenhuma medição de pixel foi refeita. Confirmado por leitura de código: Todos nunca renderiza `<section>`/heading nem a string "Principais"; equipamento raw permanece incondicional no card; badge de grupo e badge Legado ficam ausentes em Todos (`focusRole` ausente); abas de foco mantêm exatamente o mesmo JSX de seções/badges de antes, agora atrás de `tabResult.mode === 'grouped'`. `day.slots` nunca é tocado pelo picker, então trocar para Todos e voltar não altera os slots. Nenhum `console.*` novo foi introduzido e `tsc` não acusou incompatibilidade de props.
- Ausência de teste DOM automatizado permanece limitação P3 nesta rodada, sem harness de teclado corrigido — mesma observação de QA já registrada no GOAL C original.

Permanece como limitação P3 a ausência de teste DOM automatizado nesta fase, compensada por inspeção do componente e QA manual/estrutural. Também permanece como risco P3 conhecido a dependência circular `workout-builder.ts → workout-picker.ts → workout-builder.ts`; ela está fora do escopo deste corretivo, não aumentou, e as validações de teste, tipos e build continuam verdes. A fonte de 8 px dos badges permanece P3 de legibilidade/polimento mobile, não tratada nesta rodada.

Storage v1, seeds, progressão, `matchesDayFocus`, `handleAddExercise`, treino ativo, curadoria da taxonomia e o toggle de abrangência permaneceram intocados. GOAL D não foi iniciado.
