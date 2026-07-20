# Sugestão assistida determinística com preview

Status: implementado no GOAL D de `GYMFLOW_BUILDER_TIME_FOCUS_IMPLEMENTATION_GOALS_001.md`, conforme o ADR-TF-006 aceito.

Este é o antigo GOAL-20 previsto em `matchesDayFocus`/`filterExercisesByDayFocus` ("NÃO ordena, NÃO pontua, NÃO sugere — isso é GOAL-20"). O motor de sugestão é a camada de **ranking + distribuição** por cima do filtro de foco do GOAL B/C. Nada aqui usa IA, rede, `Math.random`, nem altera o treino automaticamente: o resultado é sempre um **preview** que o usuário aplica.

## Contrato (`src/lib/workout-suggestion.ts`)

`buildWorkoutSuggestionPreview(input)` é puro e determinístico. Entradas obrigatórias: foco do dia, tempo disponível, perfil de volume, nível, objetivo, retorno aos treinos, slots existentes e catálogo. Opcionais: equipamentos e restrições do perfil, e o descanso padrão (mantém a estimativa coerente com o resumo do dia).

Saída (`WorkoutSuggestionPreview`):

- `additions`: exercícios a acrescentar, cada um já com o `slot` pronto;
- `distribution`: por grupo de foco, o peso e quantos exercícios foram destinados;
- `estimateBefore`/`estimateAfter`: reusam `estimateWorkoutDurationDetailed`;
- `timeFitAfter`: `analyzeWorkoutTimeFit` da configuração final;
- `ceilingExercises`, `alreadyFits`, `rationale`, `warnings`.

## Determinismo

Duas chamadas idênticas produzem saída idêntica. Sem aleatoriedade: todo desempate termina no índice do catálogo. O preview nunca muta as entradas.

## Distribuição multi-foco (pesos aditivos nomeados)

Em `training-volume-rules.ts` → `WORKOUT_SUGGESTION_RULES.distribution`. O peso de um grupo é `baseWeight + groupSizeBonus[classe] + (é o foco principal ? primaryFocusBonus : 0)`:

- **foco principal** = o primeiro foco declarado do dia (papel principal);
- **tamanho relativo do grupo** = `groupSizeBonus` por `MuscleVolumeClass` (grande 2, pequeno/core/condicionamento/mobilidade 1, corpo inteiro 2).

Os exercícios a adicionar são repartidos entre os focos por **maior quociente** (D'Hondt) sobre esses pesos, com empate resolvido pela ordem da taxonomia. Nunca é uma proporção fixa universal — a repartição muda conforme os focos do dia (ex.: Costas + Bíceps ⇒ peso 4 × 2, ~4+2 em 6 adições).

## Teto de exercícios (faixa recomendada + time-fit + retorno)

O teto vem de `estimateRecommendedExerciseRange(targetMinutes)` (a mesma faixa do GOAL A). O motor acrescenta um exercício de cada vez e recalcula `analyzeWorkoutTimeFit`: para quando entra `within-target` ("adicionar até caber") ou quando o próximo exercício estouraria o tempo. O **retorno aos treinos** reduz o teto pelo fator de `RETURN_REFERENCE_MODIFIERS` (piso 1) — um aluno retornando recebe menos exercícios.

Se o dia já está dentro (ou acima) do tempo disponível, `alreadyFits` é verdadeiro e nada é sugerido.

## Ranking dentro do grupo (compostos antes de isolados)

`WORKOUT_SUGGESTION_RULES.ranking` ordena os candidatos: `mechanicsOrder` (compostos antes de isolados) domina, depois nível apropriado (`aboveLevelPenalty`/`levelDistancePenalty`), depois classificação curada antes da legada (`legacyClassificationPenalty`), com o índice do catálogo como desempate estável. A mecânica é curada quando existir; senão vale a mesma inferência honesta do estimador (`secondaryMuscles` presentes = composto).

## Avisos honestos

- classificação legada quando um exercício casou com o foco por classificação não curada;
- equipamento não confirmado quando o perfil declara equipamentos mas o do exercício não pôde ser confirmado (nunca inventa disponibilidade: só **exclui** quando há certeza de que o equipamento está fora do perfil);
- restrições não verificadas quando o perfil tem restrições (o catálogo atual não permite filtrá-las automaticamente);
- dia já dentro do tempo, ou nenhum exercício elegível.

## Aplicação (só acrescenta slots)

`applySuggestionToDay(draft, dayId, preview)` **apenas acrescenta** os slots ao fim da lista do dia, com os mesmos defaults de `handleAddExercise` (fonte única: `createDefaultExerciseSlot`, reusada pelo seletor manual). Não toca em nome, foco, tempo, perfil nem nos slots existentes (preservados byte a byte). Preview vazio ⇒ o mesmo draft, sem mutação.

## Interface

O botão **"Sugerir exercícios para este dia"** (`WorkoutDaysEditor`) abre o preview. **Cancelar** descarta; **Aplicar** acrescenta os slots e atualiza a estimativa. Um dia que já cabe explica que nada será adicionado. Nenhum texto menciona "IA" e nenhum diálogo nativo é usado.

## Cobertura

`workout-suggestion.test.ts` cobre PART15 29–38: determinismo, ausência de duplicatas e de exercício já no dia, slots existentes intocados byte a byte, dia cheio (nada adicionado), retorno reduzindo o teto, avisos de dado ausente, distribuição multi-foco com peso aditivo, compostos antes de isolados, defaults iguais aos de `handleAddExercise` e integração com o catálogo real.

O QA manual exercitou Costas + Bíceps / 60 / Padrão em dia vazio (~4+2 com justificativa), um dia com 3 slots completado sem apagar nada, Cancelar sem efeito e viewport mobile.
