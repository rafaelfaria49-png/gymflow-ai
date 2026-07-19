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
- A primeira aba é o primeiro foco; um foco gera `[Foco, Todos]`; sem foco o modal exibe explicitamente uma única aba `Todos`, selecionada e associada ao tabpanel da biblioteca inteira.
- O conteúdo interno desmonta quando `isOpen` fica falso e é chaveado por `day.id`; reabrir reinicia busca e primeira aba.
- Selecionar exercício chama somente `onAdd` e não fecha o modal.
- A tablist implementa roving `tabIndex`, `aria-selected`, `aria-controls`, painel associado, setas com wrap e Home/End.
- No mobile, chips e contadores usam `overflow-x-auto` e snap horizontal. O overlay usa `z-[100]` para ficar acima da navegação global móvel.
- O overlay reserva a safe-area inferior com `padding-bottom: calc(1rem + env(safe-area-inset-bottom))`; inset zero preserva o padding visual mínimo de 1 rem.

## Cobertura e validação

`workout-picker.test.ts` cobre PART15 17–22 e 26–27, preservação de `ExerciseFocusMatch`, ausência de reordenação, compatibilidade do filtro público, contadores pela mesma resolução, busca dentro da aba, persistência/limpeza da busca e reset ao reabrir. O corretivo pós-auditoria acrescentou casos explícitos para três focos em entrada não canônica, incluindo `Todos` e equivalência dos contadores, e para imutabilidade profunda dos focos, exercícios e arrays internos das fixtures.

Validação final:

- `npx vitest run`: 29 arquivos, 569 testes;
- `npx tsc --noEmit`: aprovado;
- ESLint dos arquivos tocados: aprovado;
- `npm run build`: aprovado no Next.js 16.2.6;
- QA no navegador: zero foco com uma única aba `Todos`, 126 exercícios, busca e seleção sem fechar; Costas + Bíceps com busca persistente, setas, Home/End, wrap e slots intactos; zero erro ou warning no console;
- viewports 360 × 800 e 390 × 844: `Concluir` visível, lista rolável, overlay acima e bloqueando o CTA `Treinar`, padding inferior computado de 16 px, expressão `env(safe-area-inset-bottom)` presente e nenhum overflow horizontal do documento;
- o navegador comum resolveu o inset para zero; a expressão e o fallback foram validados, sem alegar simulação real de notch. Com três focos em 360 px, a tablist preservou `overflow-x: auto`, snap horizontal e scroll (`scrollWidth 282 > clientWidth 281`).

Permanece como limitação P3 a ausência de teste DOM automatizado nesta fase, compensada por inspeção do componente e QA manual. Também permanece como risco P3 conhecido a dependência circular `workout-builder.ts → workout-picker.ts → workout-builder.ts`; ela está fora do escopo deste corretivo e as validações de teste, tipos e build continuam verdes.

Storage v1, seeds, progressão, `matchesDayFocus`, `handleAddExercise`, treino ativo e GOAL C permaneceram intocados.
