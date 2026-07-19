# Picker de exercícios por foco do dia

Status: implementado no GOAL B de `GYMFLOW-BUILDER-TF-GOAL-B-PICKER-FOCO-001`, conforme o ADR-TF-004 aceito.

## Contrato de domínio

`src/lib/workout-picker.ts` mantém o picker fora do React e sem qualquer mecanismo de recomendação:

- `getDayFocusGroups` remove ids inválidos/duplicados e devolve os focos na ordem canônica de `MUSCLE_GROUPS`;
- `groupExercisesForDayFocus` resolve cada foco isoladamente, preserva `{ exercise, match: ExerciseFocusMatch }` por item e mantém a ordem original da biblioteca;
- a resolução continua sendo exclusivamente `matchesDayFocus`; não há score, pontuação, ranking ou ordenação de exercícios;
- `filterExercisesByDayFocus` preserva assinatura e resultado públicos em `workout-builder.ts`, agora por delegação ao mesmo domínio;
- a aba aplica `matchesExerciseSearch` somente depois da resolução do foco; a busca persiste entre abas e limpar a busca não altera a aba;
- os contadores do rodapé usam os mesmos grupos resolvidos que alimentam as listas.

## Comportamento do modal

- Um chip por foco válido, na ordem da taxonomia, seguido de `Todos`.
- A primeira aba é o primeiro foco; um foco gera `[Foco, Todos]`; sem foco a biblioteca inteira continua visível no modo `Todos`, sem tablist adicional.
- O conteúdo interno desmonta quando `isOpen` fica falso e é chaveado por `day.id`; reabrir reinicia busca e primeira aba.
- Selecionar exercício chama somente `onAdd` e não fecha o modal.
- A tablist implementa roving `tabIndex`, `aria-selected`, `aria-controls`, painel associado, setas com wrap e Home/End.
- No mobile, chips e contadores usam `overflow-x-auto` e snap horizontal. O overlay usa `z-[100]` para ficar acima da navegação global móvel.

## Cobertura e validação

`workout-picker.test.ts` cobre PART15 17–22 e 26–27, preservação de `ExerciseFocusMatch`, ausência de reordenação, compatibilidade do filtro público, contadores pela mesma resolução, busca dentro da aba, persistência/limpeza da busca e reset ao reabrir.

Validação final:

- `npx vitest run`: 29 arquivos, 567 testes;
- `npx tsc --noEmit`: aprovado;
- ESLint dos arquivos tocados: aprovado;
- `npm run build`: aprovado no Next.js 16.2.6;
- QA no navegador: 0/1/2/3 focos, `Todos`, busca, reset, setas, seleção sem fechar e zero erros de console;
- viewport de 360 px: tablist com scroll real (`scrollWidth 331 > clientWidth 281`), `overflow-x: auto`, snap horizontal e sem overflow do documento.

Storage v1, seeds, progressão, `matchesDayFocus`, `handleAddExercise`, treino ativo e GOAL C permaneceram intocados.
