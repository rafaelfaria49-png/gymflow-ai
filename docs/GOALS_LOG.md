# GOALS Log

Histórico de execução dos GOALs: resumo, arquivos alterados, decisões, validações e como testar.

---

## GOAL-17B-002C — integração híbrida do Context (2026-07-23)

O `GymFlowContext` agora hidrata de forma assíncrona por um runtime com modos
`legacy-v1`, `hybrid-v2` e `blocked`. O cutover preserva snapshot e backup bruto
v1, confirma metadata/geração/readback e só então grava e relê o envelope físico
v2. O core v2 não contém histórico; a lista é materializada somente em memória a
partir da geração ativa do IndexedDB.

Novas sessões usam append incremental newest-first. Os efeitos de conclusão
ocorrem apenas depois do commit IndexedDB. A janela em que o append foi confirmado
mas o core ainda contém `activeWorkout` é reconciliada no próximo boot sem
duplicar sessão, XP ou demais efeitos. React Strict Mode compartilha o mesmo
cutover em andamento e o adapter é reutilizado durante a vida do Provider.

Enquanto o GOAL-17B-002D não implementar backup lógico híbrido, exportação,
importação, restauração e reset ficam bloqueados somente no modo v2. O fallback
v1 continua funcional quando IndexedDB está indisponível antes do cutover.

---

## GOAL-17B-002B — migração v1 verificada do workoutHistory (2026-07-22)

Implementado o mecanismo desconectado `migrateWorkoutHistoryFromV1`, que recebe o
envelope bruto por parâmetro, reutiliza validação/normalização existentes, salva
o snapshot verificável e prepara uma geração inativa antes de qualquer ativação.

O staging preserva ordem e conteúdo e registra `migrationGeneration` na mesma
transação. Readback, contagem, IDs, serialização canônica e SHA-256 precisam
coincidir antes de `activateHistoryGeneration`. A ativação é seguida por nova
leitura da geração ativa e somente então metadata recebe `completed`,
`migratedAt` e `sourceStorageVersion: 1`.

Reexecuções distinguem `migrated`, `already-completed`, `resumed`, `no-history` e
`failed`. Interrupções após snapshot, staging, verificação ou ativação reutilizam
estado válido sem duplicar gerações; staging inativo divergente é o único dado
que pode ser descartado. O erro original, snapshot e gerações anteriores são
preservados.

Foram adicionados testes com 1/100/500/1.000 sessões, normalização legada, campos
dos GOALs 23A/23B/24, duplicidade, corrupções, divergências e falhas em cada fase.
A suíte completa possui 35 arquivos e 756 testes. A implementação não acessa
`localStorage` nem é importada pelo aplicativo: 002C continua responsável pela
integração e 002D por import/export/rollback; validação física segue como gate.

---

## GOAL-17B-004 — corretivo de integridade do snapshot legado (2026-07-22)

Encerrado o P1 da auditoria de merge readiness. `saveLegacySnapshot` não recebe
mais um booleano do chamador: o adapter grava o snapshot inicialmente com
`verified: false`, aguarda o commit, relê o registro, recalcula o SHA-256 sobre os
bytes UTF-8 e compara conteúdo e checksums antes de uma segunda transação marcar
`verified: true`.

Falha de comparação ou da segunda transação rejeita com erro explícito de
integridade e preserva o snapshot não verificado, sem tocar em metadata ou
`workoutHistory`. A leitura continua recalculando o checksum e nunca confia
somente no flag persistido.

Foram adicionados testes para as duas fases, corrupção de conteúdo/checksum,
abort da segunda transação, reabertura, isolamento da limpeza e ausência de Web
Crypto. Permanecem pendentes os P2 de abertura `blocked`, proteção runtime de
`activeGeneration` em `writeMetadata` e coberturas adicionais de ambiente. A
fundação continua totalmente desconectada do aplicativo, Context e storage v1.

---

## GOAL-17B-002A — Fundação IndexedDB do workoutHistory (2026-07-22)

Criada a base desconectada do futuro storage híbrido, sem alterar a fonte de
verdade atual. O contrato assíncrono cobre abertura, disponibilidade, leitura e
substituição por gerações, append/update/delete, contagem, metadata, snapshot v1
e limpeza explícita de geração inativa.

### Entrega

- `storage-adapter.ts`: contrato tipado para histórico e rollback.
- `storage-indexeddb.ts`: banco `gymflow-persistence` v1 com stores
  `workoutHistory`, `metadata` e `legacySnapshots`.
- `storage-indexeddb.test.ts`: 23 testes focados, incluindo 0/100/500/1.000
  sessões, ordem, abort/rollback, duplicidade, reabertura, isolamento e campos dos
  GOALs 23A/23B/24.
- `fake-indexeddb` 6.2.5 adicionado somente em `devDependencies`.

### Invariantes

- troca de geração e seus registros pertencem a uma única transação;
- geração anterior continua ativa diante de constraint error ou DataCloneError;
- append/update/delete operam exclusivamente na geração ativa;
- índice único `[generationId, sessionId]`; `order` preserva o array sem usar data;
- snapshot v1 usa SHA-256 e releitura invalida `verified` se o conteúdo divergir;
- nenhuma API desta fundação acessa `localStorage`.

### Benchmark informativo

Em `fake-indexeddb`: replace/read/append de 100 sessões = 11,44/4,24/0,30 ms;
500 = 117,24/46,77/0,47 ms; 1.000 = 463,72/245,38/1,07 ms. Sem threshold de
aprovação; aparelho físico continua gate.

### Continuação

- 002B: migração v1;
- 002C: integração do Context;
- 002D: import/export e rollback híbridos.

Esta etapa não altera `gymflow:state:v1`, Context, autosave, import/export ou UI.

### Validação

- `npx vitest run`: 34 arquivos, 716 testes aprovados;
- `npx tsc --noEmit`: aprovado;
- `npm run build` e `npm run build:mobile`: aprovados no Next.js 16.2.6;
- `npm run lint`: baseline preservada em 12 erros e 6 warnings; arquivos novos
  aprovados em lint escopado;
- `git diff --check`: aprovado.

---

## GOAL-24 — Registro estruturado da substituição (2026-07-22)

### Escopo

Persistir, em cada substituição de exercício, **o planejado (original), o executado
(atual) e o motivo** da troca — de forma **aditiva e compatível** (campos opcionais,
storage v1, sem mexer em volume/PR/XP/progressão). `discomfort` é só um motivo
registrado, **sem** adaptação automática.

- Base: **`0962b6a6d0fd3fc8ab791eb65facba87996125ee`** (= `origin/master`, GOAL-23B).
- Branch: `feat/gymflow-goal24-substitution` · Worktree: `C:\Projetos\gymflow-goal-24`.
- `master` local (`17b5d33`, GOAL-TF-D) ficou defasada de propósito; não foi tocada.

### Comportamento — antes → depois

- **Antes:** `swapExerciseInActiveWorkout(idx, newId, reason?)` só marcava
  `entryOrigin: 'swapped'` (via `markEntrySwapped(exercise)`) e usava `reason` no toast;
  o exercício original, o motivo e a nota **não** eram persistidos.
- **Depois:** `swapExerciseInActiveWorkout(idx, newId, { reasonCode, reasonNote })`
  captura o exercício **antes** da troca e chama
  `markEntrySwapped(exercise, { original, reasonCode, reasonNote, swappedAt })`, que
  grava o snapshot do original (`plannedExerciseName`/`plannedMuscleGroup`, id no
  `plannedExerciseId`), o motivo (`swapReasonCode`), a nota normalizada
  (`swapReasonNote`, ≤120) e `swappedAt`. **Toast e XP inalterados.**
- **Preservado:** séries/reps/carga/RPE/descanso do exercício; trocas sucessivas
  mantêm só **original + atual**; `finalizeSession` leva os metadados ao histórico.

### Arquivos

`src/types/workout-session.ts` (+`WorkoutSwapReasonCode`), `src/types/index.ts`
(re-export + 5 campos opcionais em `ActiveExercise`), `src/lib/workout-session-domain.ts`
(`markEntrySwapped` reescrito, `normalizeSwapReasonNote`, `MAX_SWAP_REASON_NOTE_LENGTH`),
`src/lib/workout-session-view.ts` (`SWAP_REASON_LABELS`/`SWAP_REASON_ORDER`/
`resolveSwapReasonLabel`/`MISSING_ORIGINAL_LABEL`/`buildSwapView`),
`src/providers/GymFlowContext.tsx` (integração), `src/modules/ActiveWorkoutPage.tsx`
(chips de motivo + nota + gate + "Substitui …"), `src/components/SessionDetailModal.tsx`
(detalhe planejado × executado). Testes: `workout-session-domain.test.ts`,
`workout-session-view.test.ts`, `workout-session-mutations.test.ts`. Docs:
`GYMFLOW_SESSION_DOMAIN.md`, `DECISOES.md`, `GOALS_LOG.md`, `PENDENCIAS.md`.

### Gates — verdes; lint global vermelho (baseline preexistente)

- `npx vitest run`: **33 arquivos, 693 testes** (+17 sobre a baseline de 676), 0 falha.
- `npx tsc --noEmit`: **0 erro**. `npm run build` e `npm run build:mobile`: **aprovados**.
- `npm run lint`: **12 errors, 6 warnings** — idêntico à baseline; **nenhum** problema
  novo nos arquivos do GOAL. `git diff --check`: limpo.

### Como testar (QA)

Treino ativo → **Trocar**: escolher motivo (chip), opcional nota (obrigatória p/
"Outro"); substitutos ficam bloqueados até o motivo válido. Após trocar, o card mostra
**"Substitui &lt;original&gt; • &lt;motivo&gt;"**. Duas trocas seguidas mantêm o
primeiro original. Trocar um exercício **adicionado** captura o anterior. No histórico
(Evolução → sessão), entradas substituídas mostram Planejado × Executado + Motivo +
Nota. Registro legado `swapped` sem snapshot abre com "Original não registrado".

---

## GOAL-TF-F — Integração e QA final do lote Tempo–Foco (2026-07-21)

### Escopo

GOAL **documental e de QA** (não implementa feature). Consolida o lote Tempo–Foco
(GOALs A–E) já integrados em `origin/master`, roda todos os gates, atribui a matriz
de QA, investiga o "1 Issue" do Next DevTools e consolida decisões e pendências, num
**único commit documental**. Nenhum código foi alterado. Sem push.

- Base: **`5199c734f4ddfad4fc87353662536b99f47f78e1`** (= `origin/master`, GOAL E).
- Branch: `feat/gymflow-tf-goalF-integra-qa` · Worktree: `C:\Projetos\gymflow-goal-tf-f`.
- `master` local (`17b5d331`, GOAL D) ficou defasada de propósito; não foi tocada.

### Lote A–E (linear, sem merges)

`dd5f9cc`+`b0ddfef` (A tempo canônico) · `28aad29`+`e52f60f` (B picker foco) ·
`d9de0aa`+`1026c12` (C badges + Todos-flat corretivo) · `17b5d33` (D sugestão
preview) · `5199c73` (E nomes). Diff do lote
`06684ee..5199c734f4ddfad4fc87353662536b99f47f78e1` = 28 arquivos (6 docs
+ 22 código), 0 merge commits.

### Gates — testes/TypeScript/builds verdes; lint global vermelho (preexistente)

- `npx vitest run`: **30 arquivos, 600 testes**, 0 falha, 0 skip (Vitest 4.1.9).
- `npx tsc --noEmit`: exit 0.
- `npm run lint` (`eslint`): **vermelho, exit 1** — 18 problemas (**12 erros + 6
  warnings**), **todos pré-existentes** — os 8 arquivos com erro estão **intocados**
  pelo lote (diff não os inclui); um nono arquivo, `EvolutionDashboard.tsx`, possui
  somente warning de `no-img-element` e também está intocado; os 3 warnings do
  `GymFlowContext` (859/870/908) são os históricos. **Zero problema novo introduzido
  pelo lote.**
- `npm run build`: Next.js **16.2.6**, TypeScript + 6/6 rotas OK, exit 0.
- `npm run build:mobile`: export estático `out/` OK, exit 0. `cap sync`/Android não
  executados. Working tree limpa após os builds; `android/` intocado.

### Matriz de QA — cobertura

- **Automatizada (600 testes) + estrutural:** focos 1/2/3, tempos 10/30/60/90/240
  (incl. clamps 10 e 240 + teto 12 exercícios), perfis reduzido/padrão/alto, estados
  vazio/parcial/cheio/estourado, sugestão determinística, distribuição multi-foco,
  nomes programa×dia (GOAL E), multi-day, picker (grupos/badges/Todos-flat), busca.
  Suites-âncora: time-fit 21, picker 24, suggestion 10, normalization 34,
  plan-assessment 15. Detalhe e rastreabilidade em
  `docs/builder/GYMFLOW_TEMPO_FOCO_QA_FINAL.md`.
- **Manual/visual:** **NÃO executada.** A extensão do Chrome (Claude-in-Chrome) não
  estava conectada neste ambiente (mesma limitação do GOAL-TF-C-CORRECTIVE-004).
  Renderização/pixels, safe-area/mobile 360px, teclado/foco/acessibilidade em
  runtime e o console do navegador **não foram inspecionados**. Servidor dev `:3017`
  ficou **limpo** (rotas 200/200/200/404) e todos os assets responderam 200.
  Nenhuma combinação da matriz é declarada como aprovada manualmente.

### "1 Issue" do Next DevTools

**Classe D — não reproduzida** (overlay client-side; sem extensão não há como ler
título/stack). Investigação sem navegador toda limpa: terminal do dev sem issues;
`layout.tsx` com `dark` fixo (sem mismatch) e sem `openGraph` (sem aviso de
`metadataBase`); render da landing sem `Math.random`/`Date`; assets sem 404.
Hipótese de baixa confiança: issue dev-only de React (padrões legados já sinalizados
pelo ESLint), a confirmar com navegador. Follow-up recomendado.

### P0–P3

- **P0/P1:** nenhum.
- **P2:** QA visual/interativa e teclado/acessibilidade não executáveis (sem
  navegador); "1 Issue" não inspecionado (severidade desconhecida, provável dev-only).
- **P3:** dívida legada pré-existente (12 erros + 6 warnings de ESLint de projeto
  inteiro; 3 warnings do `GymFlowContext`; badges 8px; sem teste DOM do picker/teclado;
  dependência circular `workout-builder↔workout-picker`; toggle de sinergistas;
  migração do estimador legado; `draft.targetMinutes` no programa; AI Coach mock;
  dedup de programas sugeridos; GOAL-33A). Detalhe em `PENDENCIAS.md`.

### Documentos atualizados

`docs/GOALS_LOG.md`, `docs/DECISOES.md` (seção GOAL-TF-F + tabela de correspondência
dos ADRs TF-001..007), `docs/PENDENCIAS.md` (pendências consolidadas do lote) e
`docs/builder/GYMFLOW_TEMPO_FOCO_QA_FINAL.md` (novo — relatório dedicado de QA).

### Resultado

**Classe B — lote aprovado com ressalvas.** Testes, TypeScript, build web e build
mobile verdes; lint global vermelho por dívida preexistente (neutra ao GOAL F);
zero P0/P1 introduzido pelo lote; núcleo determinístico coberto por testes; risco
remanescente restrito à camada
visual/interativa e ao overlay do DevTools, não exercitáveis neste ambiente
(P2/P3). Commit local documental único; **sem push, sem PR, sem merge**. Próximo
passo (publicação e inspeção visual/DevTools pendente) depende do Founder.

---

## GOAL D — Sugestão assistida determinística com preview (2026-07-20)

### Escopo e decisões

- Trabalho em `feat/gymflow-tf-goalD-sugestao-preview`, base = `master` pós-GOAL C (`1026c12`). É o antigo GOAL-20 (ADR-TF-006): ranking + distribuição sobre o filtro de foco do GOAL B/C, sempre como **preview** que o usuário aplica.
- Novo motor puro `src/lib/workout-suggestion.ts`: `buildWorkoutSuggestionPreview` (contrato 2.7 — foco, tempo, perfil, nível, objetivo, retorno, slots existentes, catálogo; opcionais equipamentos/restrições), `applySuggestionToDay` (só acrescenta slots) e `createDefaultExerciseSlot` (fonte única do slot default, reusada por `handleAddExercise`).
- Pesos aditivos nomeados em `training-volume-rules.ts` (`WORKOUT_SUGGESTION_RULES`): distribuição = `base + tamanho do grupo + foco principal`, repartida por maior quociente; ranking = compostos antes de isolados, nível, classificação curada, índice do catálogo. Reusa `estimateWorkoutDurationDetailed`, `analyzeWorkoutTimeFit`, `estimateRecommendedExerciseRange`, `matchesDayFocus` e `RETURN_REFERENCE_MODIFIERS`.
- Determinístico: sem IA/rede/`Math.random`; duas chamadas idênticas ⇒ saída idêntica. Teto = faixa recomendada + time-fit ("adicionar até caber"); retorno aos treinos reduz o teto. Dia já dentro/acima do tempo ⇒ nada adicionado.
- UI: `WorkoutSuggestionPreview.tsx` (modal com distribuição, estimativa antes→depois, lista de adições, justificativa e avisos) e o botão "Sugerir exercícios para este dia" em `WorkoutDaysEditor`; fiação em `WorkoutBuilder`. Sem texto "IA", sem diálogo nativo, tokens dark + verde-lima, toque 44px.
- Slots existentes, nome, foco, tempo e perfil do dia ficam intocados; equipamento só exclui com certeza, restrições viram aviso (catálogo legado não permite filtrá-las).

### Validações

- Baseline (`1026c12`): `npx tsc --noEmit` limpo e **578 testes** aprovados.
- Resultado: **588 testes** aprovados em 30 arquivos (**10 casos novos**, PART15 29–38), sem excluir testes. `npx tsc --noEmit` limpo; `npm run build` aprovado no Next.js 16.2.6 (Turbopack).
- ESLint dos arquivos alterados: zero erros. Sem `alert(`/`confirm(` nativo e sem texto "IA" no código novo.

### Como testar

- `npx vitest run src/lib/workout-suggestion.test.ts` cobre determinismo, duplicatas, slots intocados, dia cheio, retorno reduz teto, avisos, distribuição, compostos-antes-de-isolados e catálogo real.
- No app: Construtor → dia com foco Costas + Bíceps, 60 min, perfil Padrão → "Sugerir exercícios para este dia" → preview ~4+2 com justificativa → Aplicar acrescenta sem apagar; Cancelar não altera nada.

### Arquivos

- Novos: `src/lib/workout-suggestion.ts`, `src/lib/workout-suggestion.test.ts`, `src/components/workout-builder/WorkoutSuggestionPreview.tsx`, `docs/builder/GYMFLOW_WORKOUT_SUGGESTION.md`.
- Editados: `src/lib/training-volume-rules.ts`, `src/components/workout-builder/WorkoutDaysEditor.tsx`, `src/modules/WorkoutBuilder.tsx`, `docs/DECISOES.md`, `docs/GOALS_LOG.md`.

---

## GOAL-19B.2A — Merge readiness: dirty-state global e planejamento legado (2026-07-18)

### Escopo e decisões

- Trabalho executado em `feat/gymflow-goal19b-guided-builder`, com HEAD local/remoto inicial
  `813764c557e8822fc95e53cf7ec133c825098911`; a referência local
  `safety/gymflow-goal19b-before-readiness-fix` foi criada nesse ponto e não recebeu push.
- `setActiveView` ganhou um guard transitório central. O Construtor registra o único guard ativo,
  apresenta o `ConfirmDialog` existente e guarda uma continuação idempotente; menus mobile e
  desktop, TopBar, ações internas, Voltar e logout passam pelo mesmo contrato.
- `beforeunload` existe somente enquanto a assinatura está suja. Salvar atualiza draft e assinatura
  antes de navegar; “Concluir sem planejar” valida, persiste e abre Meus Treinos sem modificar o
  calendário.
- A leitura de dias agora distingue `canonical`, `legacy-flat` e `empty`. Programa canônico de um
  dia sem `programDayId` é reconciliado com seu ID real; multi-dia ambíguo e ID removido continuam
  inválidos; dias treinados permanecem snapshots e conteúdo flat não recebe ID inventado.
- Storage/envelope v1, catálogo, seeds, progressão, volume, duração, treino ativo e `NumericInput`
  permaneceram inalterados. Nenhuma dependência foi adicionada.

### Validações

- Baseline: 25 arquivos e **492 testes** aprovados, além de TypeScript, build web e build mobile.
- Resultado: 27 arquivos e **513 testes** aprovados (**21 casos novos**), sem excluir testes;
  `npx tsc --noEmit`, `npm run build` e `npm run build:mobile` aprovados no Next.js 16.2.6.
- ESLint focado em todos os TypeScript/TSX alterados: zero erros e somente os mesmos três avisos
  herdados de `react-hooks/exhaustive-deps` em `GymFlowContext.tsx`.
- Não há `alert(`/`confirm(` nativo; `weeks[0]` ficou apenas em testes, documentação e no resolver
  defensivo. `git diff --check`, auditoria de dependências e hashes protegidos passaram.
- SHA-256 antes/depois idênticos: `exercises.ts` `8107BB3A…52AF`, `programs.ts`
  `C87447A6…F41B`, `progression.ts` `BB0D62B4…C4FD`, `storage.ts` `1B041243…AED`,
  `training-volume.ts` `26D2D1E1…9AE4`, `workoutDuration.ts` `178D75D0…6AB7`,
  `ActiveWorkoutPage.tsx` `5C072446…BE4` e `NumericInput.tsx` `97ED1658…ADA5`.

### Checagem no navegador

- A aplicação renderizou em desktop e em **390×844**, sem erro ou aviso no console. A automação do
  navegador, porém, apenas focou os botões e não despachou os handlers React, tanto no servidor
  isolado quanto na instância do workspace; a instrumentação diagnóstica temporária foi removida.
- Por isso, os cliques de descarte/cancelamento, menus, saída após salvar, persistência após reload e
  fixtures legadas **não foram declarados aprovados manualmente** nesta execução. Controller,
  continuação, cleanup, `beforeunload`, resolução legada e reconciliação estão cobertos por testes
  determinísticos; a matriz visual continua pendente de repetição manual.
- O servidor e a pasta temporários foram encerrados/removidos. `.claude/settings.local.json`
  permaneceu intocado e fora do commit; nenhum push foi feito.

---

## GOAL-19B.1 — Integração do salvamento seguro ao Construtor guiado (2026-07-18)

### Integração e decisões

- Destino confirmado em `feat/gymflow-goal19b-guided-builder`, partindo de
  `bab77f1b696eac0ce77819a789f229a33539917a`; a referência local
  `safety/gymflow-goal19b-before-save-sync` foi criada nesse ponto e não recebeu push.
- O fix `41d99e18d064c250aa9f26c2965fd2cd6a52dd76` foi reaplicado como
  `5ec7a21804c83673ac226bf350c4143d4619c832`. Os conflitos em `docs/GOALS_LOG.md` e
  `src/modules/WorkoutsTab.tsx` foram resolvidos preservando os dois conjuntos de funcionalidades.
- Salvar um programa reconcilia, em uma única implementação, os vínculos futuros de `weeklyPlan`
  e `user.weeklyPlan`. Nome, duração, quantidade e grupos são atualizados; dia removido recebe
  `planningIssue: 'missing-program-day'`, perde os IDs inválidos e exige nova escolha, sem fallback
  silencioso para o Dia 1.
- Exclusão de programa invalida somente vínculos futuros. Dias treinados, sessão ativa e histórico
  permanecem snapshots integrais, mesmo quando conservam a origem opcional do programa excluído.
- Templates continuam estruturais e sem exercícios; criação em branco, por frequência e por
  template, duplicação, exclusão, seed como base, busca, filtros, ordenação, dirty state e mobile
  foram preservados. Programas legados realmente achatados são promovidos para um dia canônico ao
  duplicar ou usar como base, sem perder slots nem alterar a origem.
- Programa multi-dia exige escolha explícita do dia; programa canônico de um dia continua iniciando
  diretamente, e a lista achatada v1 é tratada explicitamente como um único treino legado. O
  envelope permanece `gymflow:state:v1` e nenhuma dependência foi adicionada.

### Validações automatizadas

- Baseline anterior ao cherry-pick: 21 arquivos e **451 testes** aprovados, além de TypeScript,
  build web e build mobile verdes.
- Resultado integrado: 25 arquivos e **492 testes** aprovados (451 anteriores + 39 do fix + 2 casos
  adicionais de integração: compatibilidade legada e exclusão segura), sem excluir testes.
- `npx tsc --noEmit`: aprovado. ESLint focado em todos os TypeScript/TSX alterados: zero erros e
  três avisos de dependências de hooks já localizados em `GymFlowContext.tsx`.
- `npm run build` e `npm run build:mobile`: aprovados no Next.js 16.2.6. `cap:sync` e build Android
  não foram executados. `git diff --check` e as auditorias de preservação passaram.
- SHA-256 antes/depois, idênticos: `exercises.ts` `8107BB3A…52AF`, `programs.ts`
  `C87447A6…F41B`, `progression.ts` `BB0D62B4…C4FD`, `storage.ts` `1B041243…AED`,
  `training-volume.ts` `26D2D1E1…AE4` e `workoutDuration.ts` `178D75D0…AB7B`.

### Teste manual integrado

- Execução isolada em `:3003` com Next dev/Webpack, sem usar o `localStorage` das portas 3000–3002.
  O template Superior/Inferior de quatro dias criou quatro dias vazios; exercícios adicionados nos
  Dias 1/2 sobreviveram à recarga.
- O Dia 2 foi planejado para Segunda e depois renomeado para “Inferior Órion”; adicionar dois
  exercícios e remover um atualizou imediatamente o Planejador para 3 exercícios, 24 min e grupos
  `legs`, `glutes` e `calves`.
- Segunda iniciou exatamente o Dia 2. `080` + Enter virou `80` e sobreviveu à recarga; reps `12`
  persistiram ao clicar imediatamente em “Editar programa de origem”. O Builder abriu o programa e
  o dia corretos, manteve a sessão em background e o retorno preservou carga, reps e os 3 exercícios.
- A duplicação criou uma cópia independente com o mesmo conteúdo; excluir a cópia manteve o vínculo
  original e a sessão ativa. Remover o Dia 2 do original exibiu o aviso, zerou o vínculo futuro,
  removeu o botão de início de Segunda e exigiu “Escolher novamente”; o Dia 1 não foi iniciado.
- A sessão já aberta continuou com o snapshot “Dia 2 — Inferior Órion”, foi finalizada com 80 kg ×
  12 reps e apareceu no histórico mesmo após o dia deixar de existir no programa. Busca por
  `integracao orion`, filtros de nível, ordenação por nome e viewport 390×844 foram validados.
- Console do navegador: zero erros e zero avisos. O servidor/pasta temporários de QA foram
  encerrados; `.claude/settings.local.json` permaneceu fora dos commits e nenhum push foi feito.

---

## GOAL-19B — Templates e criação guiada do Construtor (2026-07-17)

### Resumo

O Construtor multi-dia (GOAL-19A) ganhou uma **experiência de criação guiada**: ao abrir um
programa novo, o usuário escolhe entre **programa em branco**, **usar minha frequência** (N dias
vazios a partir do perfil) ou **começar com um template** (estrutura pronta → prévia → draft
editável). Foram adicionados **6 templates estruturais** (corpo inteiro 3d, superior/inferior 4d,
PPL 3d, PPL 6d, divisão 5d, retorno 3d), **duplicação** e **exclusão** de programas customizados,
**"usar como base"** para seeds, e a lista **"Meus Treinos"** ganhou busca, filtros, ordenação e
estados vazios honestos.

**Templates não contêm exercícios** e **nenhum exercício é escolhido automaticamente** — isso é o
GOAL-20. Tudo é editável; a frequência é sugestão; retorno mantém o nível; seeds nunca são
alterados nem excluídos; histórico e sessão ativa nunca são apagados ao excluir um programa.

### Arquivos

- Tipos: `src/types/workout-templates.ts` (novo).
- Domínio (novos): `src/lib/workout-templates.ts`, `src/lib/workout-guided-creation.ts`,
  `src/lib/workout-program-actions.ts` (+ 3 arquivos de teste).
- UI (novos): `src/components/workout-builder/{WorkoutCreationMode,WorkoutTemplatePicker,WorkoutTemplatePreview,WorkoutProgramMenu,WorkoutProgramDeleteDialog}.tsx`.
- UI (alterados): `src/modules/WorkoutBuilder.tsx` (fases de criação), `src/modules/WorkoutsTab.tsx` (busca/filtro/ordenação/menu/exclusão).
- Estado: `src/providers/GymFlowContext.tsx` (`deleteCustomProgram`, `duplicateProgram`, `createProgramFromBase`, param aditivo `creationStep`).
- Docs: `docs/builder/GYMFLOW_GUIDED_WORKOUT_CREATION.md` (novo).

### Decisão que moldou o GOAL

`WorkoutSession` (sessão ativa e histórico) é um snapshot autocontido. Após o GOAL-19A.1 ele
pode guardar `sourceProgramId`/`sourceProgramDayId` como origem histórica opcional, nunca como
vínculo vivo. Logo, excluir um programa **jamais** toca a sessão ativa ou o histórico; apenas
referências futuras do `weeklyPlan` são invalidadas, e dias treinados permanecem integrais.

### Validações

- `npx vitest run` → **451 testes** (391 do GOAL-19A + 60 novos), verdes.
- `npx tsc --noEmit` limpo. `npm run build` e `npm run build:mobile` passam.
- ESLint dos arquivos novos limpo; os 8 problemas remanescentes em `GymFlowContext.tsx` são
  pré-existentes (idênticos à base `1044417`), em código não tocado.
- `rg "alert\(|confirm\(" src` → nenhum diálogo nativo.
- Hashes de `mock/exercises.ts`, `mock/programs.ts`, `progression.ts`, `storage.ts`,
  `training-volume.ts`, `workoutDuration.ts`, `ActiveWorkoutPage.tsx` **idênticos** antes/depois.

### Como testar

Criar Treino → escolher cada modo; aplicar um template de 4 dias, editar foco/nome, adicionar
exercícios, salvar, recarregar; duplicar e editar a cópia; excluir a cópia; usar um seed como
base (seed intacto); buscar sem acento; filtros; excluir "Meu ABCD Multi-dia" e conferir que o
Planner não quebra e o histórico permanece.

---

## GOAL-19A.1 — Corrigir salvamento, sincronização do planejamento e edições da sessão (2026-07-18)

### Isolamento e pré-flight

- Trabalho executado somente em `C:\Projetos\gymflow-ai-save-sync-001`, branch `fix/gymflow-save-sync-001`, criada a partir de `10444172713b341d8d5ad1daed3490646a3da859`.
- O worktree principal permaneceu na branch `feat/gymflow-goal19b-guided-builder`, com seu WIP preservado e sem alteração tracked/staged causada por este GOAL.
- Baseline isolado aprovado: 18 arquivos e 391 testes, além de `npx tsc --noEmit`.
- A documentação local do Next.js 16.2.6 em `node_modules/next/dist/docs/` foi consultada antes das alterações de componentes client-side.

### Programa e planejamento

- Salvar um programa personalizado agora reconcilia todos os dias futuros vinculados ao mesmo `programId`, recalculando nome, grupos, duração e quantidade de exercícios a partir do `ProgramDay` canônico.
- Dias já treinados e dias de outros programas são preservados. `weeklyPlan` e `user.weeklyPlan` recebem a mesma versão reconciliada.
- Se um `programDayId` planejado foi removido, o vínculo é invalidado com `planningIssue: 'missing-program-day'`, os resumos são zerados e o Planejador exige nova escolha.
- O início é estrito: ID informado precisa existir; programa multi-dia sem ID exige seleção; somente programa com um único dia aceita resolução implícita. Não existe fallback silencioso para o Dia 1.
- A aba Treinos reutiliza seu detalhe como seletor explícito de dias e mostra, por dia, nome, quantidade real de exercícios e duração.

### Sessão e persistência

- A sessão ativa é um snapshot independente. Edições de carga, reps, RPE, notas, séries, exercícios, trocas e lotação usam atualizações funcionais e permanecem na sessão/histórico sem reescrever a prescrição futura.
- Sessões iniciadas de programa guardam metadados opcionais de origem (`sourceProgramId`, `sourceProgramDayId`, nomes de programa/dia). Treinos livres e snapshots legados continuam válidos.
- “Editar programa de origem” abre o programa e o dia exatos. A sessão permanece em background, “Iniciar Agora” fica oculto nesse fluxo e um bloqueio global impede sobrescrever uma sessão ativa.
- `NumericInput` preserva rascunhos focados (`080`, vírgula/ponto, vazio), emite imediatamente valores válidos para o Context e mantém contratos de blur, Enter, Escape, limites e atualização externa.
- Finalização desfoca o campo ativo e usa o snapshot mais recente. Refs canônicas de sessão, histórico e horário de início eliminam a janela de perda entre uma edição/início no mesmo tick e `pagehide`/`visibilitychange`.
- O envelope continua `gymflow:state:v1`; hidratação, backup e export/import preservam os novos campos opcionais sem migração ou dependência nova.

### Testes e validações

- `npx vitest run`: 22 arquivos e **430 testes** aprovados (391 anteriores + 39 novos).
- `npx tsc --noEmit`: aprovado.
- ESLint focado em todos os TypeScript/TSX alterados: zero erros; três avisos de dependências de hooks permaneceram no Context.
- `npm run build`: aprovado no Next.js 16.2.6.
- `npm run build:mobile`: export estático aprovado; `cap sync` e build Android não executados.
- `rg -n "alert\(|confirm\(" src`: zero ocorrência. `git diff --check`: aprovado.
- Testes de storage cobrem roundtrip de carga, reps, RPE, notas, adição/remoção/troca, origem, histórico e export/import mantendo a versão 1.
- Cenário manual: programa de dois dias foi planejado, editado (nome, adição/remoção, séries), salvo e iniciado no dia correto; o Planejador mostrou 2 exercícios/20 min e a sessão refletiu os 2 exercícios e 4 séries esperados.
- Carga `80` sobreviveu ao reload; reps `12` chegaram à sessão antes da confirmação; exercício improvisado sobreviveu à navegação e ao reload; editar a origem retornou à mesma sessão sem oferecer novo início.
- Remover o dia do programa invalidou duas ocorrências planejadas, bloqueou início sem fallback e preservou a sessão já aberta. A finalização criou entrada no histórico; detalhes internos do snapshot são cobertos pelos testes porque o card atual de histórico não os expõe.
- Console do navegador: zero erros e zero avisos.
- Hashes de `src/mock/exercises.ts`, `src/mock/programs.ts`, `src/lib/progression.ts`, `src/lib/storage.ts`, `src/lib/training-volume.ts` e `src/lib/workoutDuration.ts` permaneceram idênticos ao pré-flight. `src/modules/WorkoutBuilder.tsx` mudou somente na integração mínima autorizada para impedir novo início durante edição da origem.

### Continuação

- **GOAL-23A:** criar uma ação deliberada, comparável e confirmável para promover diferenças da sessão ao programa; nenhuma propagação automática foi adicionada.
- Validar `pagehide`, background e encerramento pelo sistema em WebView Android físico.
- Integração com a GOAL-19B deve ser feita depois, pelo responsável daquele WIP, preferencialmente via cherry-pick deste commit e nova execução conjunta dos testes/builds. Nenhuma integração ou push foi feito neste GOAL.

---

## GOAL-19A — Construtor de treino multi-dia (2026-07-17)

### Resumo

O Construtor deixou de criar "um programa = um dia" e passou a montar **programas com vários
dias**: Dia 1..N gerados automaticamente, foco muscular por dia (taxonomia do GOAL-18A), nomes
automáticos honestos com nome customizado opcional, slots isolados por dia, estimativa de
duração e volume por dia (motor do GOAL-22) e uma análise do programa inteiro com o volume
semanal por grupo comparado à referência do perfil (GOAL-21).

**Gate G2: aprovado pelo Founder** — pré-requisito deste GOAL.

A regra do GOAL-10.5 ("nunca agrupar dias no mesmo programa para não sobrescrever um dia irmão")
ficou obsoleta: o Construtor agora carrega o **programa inteiro**, então os irmãos são editados
juntos e nenhum se perde. `weeks[0].days` é a fonte canônica; a lista achatada
`WorkoutProgram.exercises` nunca é recriada.

Nada é escolhido, sugerido ou alterado automaticamente. Todo aviso é textual.

### Descoberta que moldou o GOAL

**Nenhum dos 126 exercícios tem `primaryMuscleGroupId`** — todos resolvem pelo campo legado
`muscleGroup`, e os 23 de perna colapsam em `legs_general`. Ou seja, **nada resolve para
quadríceps ou posterior de coxa**. Sem tratamento, o filtro "Foco do dia" devolveria lista vazia
ao focar Quadríceps, e a análise afirmaria *"não possui trabalho direto para posterior"* com a
Mesa Flexora no dia — falso. `LEGACY_GENERIC_COVERAGE` resolve dizendo apenas "não é possível
afirmar nem negar", sempre exibindo a origem legada. Glúteos/panturrilhas têm grupo legado
próprio, então a ausência deles continua sendo afirmada. Cura definitiva: **GOAL-33A**.

### Arquivos

- Tipos: `src/types/workout-builder.ts` (novo), `src/types/index.ts` (campos aditivos e opcionais em `ProgramDay`).
- Domínio: `src/lib/workout-builder-id.ts`, `src/lib/workout-day-naming.ts`, `src/lib/workout-program-normalization.ts`, `src/lib/workout-builder.ts` (todos novos).
- UI: `src/components/workout-builder/{WorkoutProgramDetails,WorkoutDayTabs,WorkoutDayFocusSelector,WorkoutDayActions,WorkoutDaySummary,WorkoutDaysEditor,WorkoutProgramSummary,ExercisePickerModal,StartDayPicker}.tsx` (novos), `src/modules/WorkoutBuilder.tsx` (reescrito).
- Consumo mínimo: `src/providers/GymFlowContext.tsx` (3 linhas: import + `programDayDisplayLabel` em `buildWeekFromProgram`/`assignDayToWeekday`), `src/modules/PlannerView.tsx`, `src/modules/WorkoutsTab.tsx`.
- Testes: `src/lib/workout-builder.test.ts`, `src/lib/workout-day-naming.test.ts`, `src/lib/workout-program-normalization.test.ts`.
- Documentação: `docs/builder/GYMFLOW_MULTI_DAY_WORKOUT_BUILDER.md`, `docs/DECISOES.md`, `docs/PENDENCIAS.md`, `docs/GOALS_LOG.md`.

`openWorkoutBuilder` **não mudou de assinatura** — `programId` passou a significar "edite este
programa" e `dayId` "abra neste dia", então os chamadores existentes já abrem o programa inteiro.

### Validações

- `npx vitest run`: 18 arquivos, **391 testes** aprovados (252 anteriores + 139 novos). Nenhum teste anterior alterado ou removido.
- `npx tsc --noEmit`: aprovado.
- ESLint nos arquivos novos/reescritos: **zero erros e zero warnings**. Os 12 problemas (9 erros, 3 warnings) restantes em `GymFlowContext.tsx` são **pré-existentes** — o baseline `7495225` produz a mesma contagem, com as linhas deslocadas exatamente pelas 3 que este GOAL adicionou.
- `npm run build` e `npm run build:mobile`: aprovados. `cap:sync`/`android:build` não executados.
- `rg -n "alert\(|confirm\(" src`: zero `alert()`/`confirm()` nativos.
- `git diff --check`: limpo.
- Hashes idênticos ao pré-flight: `src/mock/exercises.ts`, `src/mock/programs.ts`, `src/lib/progression.ts`, `src/lib/storage.ts`.

### Teste manual (navegador, dev server em `:3000`)

Programa de 4 dias criado do zero: focos selecionados, nomes automáticos conferidos
("Peito e Tríceps", "Costas e Bíceps", "Quadríceps e Panturrilhas", "Ombros, Posterior de coxa e
Glúteos"), nome customizado aplicado no Dia 4, exercícios adicionados por dia, alternância entre
dias sem perda de slot, duplicação (renumerou 4→5 e inseriu a cópia logo após a original),
reordenação (Dia 2 → Dia 1, ids estáveis), remoção via `ConfirmDialog` informando os exercícios,
estimativas e análise conferidas, salvo, **página recarregada**, reaberto — os 4 dias, o foco, o
nome customizado e os slots voltaram intactos. "Salvar e Planejar", Planner (os 4 dias aparecem
como "Dia N — Nome"; dias seed seguem "Dia A — …" inalterados) e "Iniciar Agora" (pergunta qual
dia; iniciar o Dia 3 carregou os slots do Dia 3 e a sessão virou "Meu ABCD Multi-dia — Dia 3 ·
Quadríceps e Panturrilhas"). Saída com alterações pediu confirmação; "Continuar editando"
preservou o draft. **Zero erros e zero warnings no console.**

### Próximo passo

**GOAL-19B** — templates, criação guiada e refinamento do construtor multi-dia. Não iniciado.

---

## GOAL-01 — Persistência local-first (2026-07-03)

### Resumo

Estado do app agora sobrevive a refresh no celular. Todo o estado de longa duração é salvo em `localStorage` na chave `gymflow:state:v1`, num envelope versionado `{ v: 1, savedAt, data }`, com escrita debounced (500ms) e leitura defensiva (JSON inválido ou versão diferente ⇒ ignora e usa defaults, nunca crasha).

### Antes / depois (comportamento crítico)

- **Antes:** só `user` e `weeklyPlan` persistiam (chaves soltas `gymflow_user`/`gymflow_weeklyPlan`); refresh durante treino ativo perdia o treino, as séries concluídas e zerava o cronômetro (contador só em memória); histórico, conquistas, nutrição e favoritos eram perdidos.
- **Depois:** treino ativo, séries concluídas e timestamp de início sobrevivem a refresh; o tempo decorrido é recalculado a partir de `activeWorkoutStartedAt`; histórico de treinos, XP/nível/streak (no perfil), conquistas, desafios, favoritos, nutrição, peso/medidas e vídeos recentes persistem.

### Arquivos alterados

- `src/lib/storage.ts` — **novo**: `loadState<T>`, `saveState`, `clearState` com envelope versionado, try/catch e guarda de `typeof window`.
- `src/providers/GymFlowContext.tsx` — hidratação no mount + save debounced 500ms; `activeWorkoutStartedAt`; timer recalculado do timestamp; migração das chaves legadas; `logout` limpa `gymflow:state:v1`.
- `src/modules/AdminPanel.tsx` — seção "Dados locais" com botão "Zerar dados do app" (confirmação inline em dois cliques, sem `confirm()` nativo).
- `src/hooks/useLocalStorage.ts` — **deletado** (hook morto, sem consumidores).
- `CLAUDE.md`, `.claude/settings.json`, `docs/DECISOES.md`, `docs/PENDENCIAS.md`, `docs/GOALS_LOG.md` — preparação da sprint (Parte A).

### O que persiste

Perfil (inclui XP, nível implícito por XP, streak, onboarding concluído = perfil existente), plano semanal, treino ativo + séries concluídas + timestamp de início, histórico de treinos, histórico de peso e medidas, nutrição (macros/água), conquistas, desafios, exercícios favoritos, vídeos vistos recentemente.

### O que NÃO persiste (de propósito)

View ativa (exceto restauração para `active-workout`/`dashboard`), modais, mensagens do chat do coach (transitórias), notificações de XP, player global, loading states, listas mock (exercícios, programas, vídeos, comunidade).

### Decisões

Ver `docs/DECISOES.md` (seção GOAL-01).

### Validações executadas

1. `npx tsc --noEmit` — sem erros.
2. `npm run build` — passou (Next 16.2.6, Turbopack).
3. `grep -rn "useLocalStorage" src/` — vazio.
4. Dev server ativo em `0.0.0.0:3000` (HTTP 200).
5. `git status` — nenhum arquivo em `labs/avatar-lab/`, `docs/avatar-design/` ou `app/poc-3d` alterado.
6. Fluxos validados por código: iniciar treino grava sessão + `startedAt`; refresh restaura sessão, séries e tempo recalculado; concluir treino move para histórico e atualiza XP/streak persistidos; "Zerar dados do app" limpa a chave e recarrega.

### Como testar no celular

1. Abrir `http://192.168.0.6:3000`, logar (demo) e iniciar um treino.
2. Marcar 2 séries como concluídas e puxar para atualizar a página → o app volta direto no treino, com as 2 séries marcadas e o cronômetro correto (não zerado).
3. Concluir o treino, atualizar de novo → histórico, XP e streak continuam lá.
4. Ir em Admin → "Dados locais" → tocar "Zerar dados do app" duas vezes → app reinicia zerado na landing.

---

## GOAL-02 — Correções cirúrgicas de dados e rótulos (2026-07-03)

### Resumo

Correção de inconsistências pequenas que afetavam a confiabilidade do app no uso diário: 4 exercícios órfãos (IDs referenciados sem definição), rótulo ambíguo "10k/12k" no Treino Ativo, kcal do painel técnico inflado por tempo mesmo com 0 séries feitas, e um bug visual de clipping no logo "GYMFLOWAI" do header.

### Arquivos alterados

- `src/mock/exercises.ts` — adicionados os 4 exercícios órfãos: `abs_prancha_abdominal`, `cardio_corrida_esteira`, `legs_levantamento_terra`, `legs_legpress_45` (IDs preservados, sem novos IDs criados).
- `src/modules/ActiveWorkoutPage.tsx` — rótulos Ant/Sug (`10k`→`10 kg`, `12k`→`12 kg`); cálculo de `estimatedCalories` trocado de tempo decorrido para série concluída; rótulo do card "Energia Gasta (kcal est.)".
- `src/components/Navigation.tsx`, `src/modules/LandingPage.tsx`, `src/modules/AuthPages.tsx` — `pl-0.5` no span do logo gradiente para corrigir o clipping do "G" inicial.

### Decisões

Ver `docs/DECISOES.md` (seção GOAL-02).

### Validações executadas

1. `npx tsc --noEmit` — sem erros.
2. `npm run build` — passou (Next 16.2.6, Turbopack), sem erros de tipo.
3. `grep -rn "Exercício Desconhecido" src/` — só o fallback de segurança em `WorkoutsTab.tsx`/`GymFlowContext.tsx` (código pré-existente, não mais acionado pelos 4 IDs corrigidos).
4. `grep -rn "10k"` e `grep -rn "12k"` em `src/` — vazio.
5. `grep -rn "useLocalStorage" src/` — vazio (confirma que a persistência do GOAL-01 não regrediu).
6. `git status` — nenhum arquivo em `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d` alterado; nenhum GOAL-03 iniciado.
7. `npx eslint` nos arquivos alterados — 3 erros pré-existentes fora do escopo (ver `docs/PENDENCIAS.md`), nenhum introduzido pelas mudanças deste GOAL.

### Confirmação de escopo

Avatar Lab, POC 3D, Motion Engine, pipeline do Kai, backend, Supabase, pagamento real, biblioteca externa de exercícios, service worker e PWA avançado não foram tocados. GOAL-03 não foi iniciado.

---

## GOAL-03 — Sistema de toasts e confirmações (2026-07-03)

### Resumo

Substituídos todos os `alert()` nativos do app (18 ocorrências) por um sistema próprio de toasts premium (`ToastProvider`/`useToast`) e um `ConfirmDialog` reutilizável para as duas ações destrutivas do app (cancelar treino ativo, zerar dados locais). Nenhum `confirm()` nativo existia no código (grep vazio antes de começar). Nenhuma dependência nova foi instalada.

### Arquivos criados

- `src/components/ui/Toast.tsx` — `ToastProvider`, hook `useToast()` com `.success/.error/.info`, fila máxima de 3 toasts, auto-dismiss em 3,5s, viewport responsivo (top-center no mobile, canto inferior direito em telas ≥1024px).
- `src/components/ui/ConfirmDialog.tsx` — modal controlado (`isOpen`/`onConfirm`/`onCancel`), overlay escuro, fecha com ESC e clique fora, variante `destructive`, botões ≥44px, foco automático no botão de confirmação.

### Arquivos alterados

- `src/app/layout.tsx` — `ToastProvider` montado envolvendo `GymFlowProvider`.
- `src/app/globals.css` — keyframe `toastIn`/`.animate-toast-in` (mesmo padrão de `.animate-pulse-glow` já existente).
- `src/providers/GymFlowContext.tsx` — 6 `alert()` trocados por `toast.success/info/error` (substituição de exercício, adaptação "academia cheia", replanejamento de treino perdido pela IA Coach).
- `src/modules/ActiveWorkoutPage.tsx` — botão "Cancelar Treino Atual" agora abre `ConfirmDialog` (variante destrutiva) em vez de cancelar direto.
- `src/modules/AdminPanel.tsx` — 2 `alert()` → toast; botão "Zerar dados do app" trocado do padrão de duplo clique para `ConfirmDialog` destrutivo.
- `src/components/SocialShareModal.tsx`, `src/modules/CommunityFeed.tsx`, `src/modules/EvolutionDashboard.tsx` (5 ocorrências), `src/modules/ExerciseLibrary.tsx`, `src/modules/NutritionPage.tsx`, `src/modules/PremiumUpgrade.tsx` — `alert()` → `toast.success`/`toast.info` conforme a natureza da mensagem.

### Decisões

Ver `docs/DECISOES.md` (seção GOAL-03).

### Validações executadas

1. `grep -rn "alert(" src/` — vazio.
2. `grep -rn "confirm(" src/` — vazio (já estava vazio antes do GOAL-03; nenhum `confirm()` nativo existia).
3. `npx tsc --noEmit` — sem erros.
4. `npm run build` — passou (Next 16.2.6, Turbopack).
5. Dev server iniciado e `GET /` retornou 200 sem erros no log — confirma que `useToast()` dentro de `GymFlowProvider` não quebra a árvore de providers (`ToastProvider` está acima na hierarquia).
6. `git status` — nenhum arquivo em `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d` alterado; nenhum GOAL-04 iniciado.

### Confirmação de escopo

Avatar Lab, POC 3D, backend, Supabase, pagamento real, timer de descanso, ActionBar fixa e modelo de programas não foram tocados. GOAL-04 não foi iniciado.

---

## GOAL-04 — ActionBar fixa + fim das sobreposições (2026-07-03)

### Resumo

O FAB global "Continuar" (`BottomNavigation`) cobria conteúdo quando o usuário já estava dentro do próprio Treino Ativo. Ele foi escondido nessa tela e substituído por uma ActionBar fixa própria da página, que mostra a série atual/exercício e um botão "Continuar" que rola suavemente até a próxima série pendente (virando "Finalizar" quando todas as séries estão concluídas). Também corrigido o botão "Ver Técnica", que ficava `absolute` sobre o texto do placeholder de mídia 3D — agora é uma barra de rodapé em fluxo normal, sem overlap.

### Arquivos alterados

- `src/modules/ActiveWorkoutPage.tsx` — nova ActionBar fixa (`lg:hidden`) com "Série X de Y" + nome do exercício + botão Continuar/Finalizar; `handleContinue` com `scrollIntoView` + foco no input de carga; placeholder de mídia refeito em coluna (mídia em cima, botão "Ver Técnica" embaixo, sem `position: absolute`); `id="set-row-{id}"` em cada linha de série; container raiz trocado de `pb-24` para a nova classe `.pb-active-workout`.
- `src/components/Navigation.tsx` — FAB "Continuar"/"Treinar" agora é condicional (`showFab`), oculto quando `activeView === 'active-workout'` (a ActionBar da própria página assume esse papel ali).
- `src/app/globals.css` — nova classe `.pb-active-workout` (clearance da ActionBar + bottom nav + safe-area + folga de 16px).

### Como a ActionBar funciona

Fixa no rodapé (`bottom: calc(4.75rem + safe-area)`, mesma constante do FAB que substitui), visível só em mobile/tablet (`lg:hidden`). Mostra à esquerda "Série X de Y" + nome do próximo exercício pendente (ou "Treino Concluído"); à direita um botão que: (a) com séries pendentes, rola suavemente (`scrollIntoView({behavior:'smooth', block:'center'})`) até a primeira série não concluída e foca o input de carga (kg) dela; (b) com todas as séries concluídas, vira "Finalizar" e abre o modal de resumo já existente — sem lógica nova de finalização.

### Decisões

Ver `docs/DECISOES.md` (seção GOAL-04).

### Validações executadas

1. `grep -rn "alert(" src/` — vazio.
2. `grep -rn "confirm(" src/` — vazio (nenhum voltou).
3. `npx tsc --noEmit` — sem erros.
4. `npm run build` — passou (Next 16.2.6, Turbopack).
5. Dev server iniciado, `GET /` retornou 200 sem erros no log.
6. `npx eslint` nos arquivos alterados — mesmos 3 erros pré-existentes já registrados em `docs/PENDENCIAS.md` desde o GOAL-02 (`setState` em efeito do timer de descanso, aspas não escapadas no modal de resumo), nenhum novo introduzido.
7. Varredura de outros floatings (Tarefa 5) documentada em `docs/DECISOES.md` — nenhuma outra sobreposição óbvia encontrada além das duas corrigidas.
8. `git status` — nenhum arquivo em `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d` alterado; nenhum GOAL-05/GOAL-06 iniciado.

### Confirmação de escopo

Avatar Lab, POC 3D, backend, Supabase, pagamento real, timer de descanso, modelo de programas e motor de progressão não foram tocados. GOAL-05 e GOAL-06 não foram iniciados.

---

## GOAL-05 — Menu "Mais" na navegação mobile (2026-07-03)

### Resumo

No mobile, só 5 das 12 telas principais eram alcançáveis (a bottom nav tinha Hoje/Planejar/Exercícios/IA Coach/Evolução; Treinos, Vídeos, Nutrição, Feed, Assinatura e Admin não tinham nenhum caminho de navegação em telas pequenas). A bottom nav foi reduzida a 4 itens fixos + uma aba "Mais" que abre um bottom sheet próprio (grade 2 colunas) com as 6-7 telas restantes, cada uma alcançável em até 2 toques.

### Arquivos alterados

- `src/components/Navigation.tsx` — bottom nav com 4 itens fixos (Hoje/Planejar/Exercícios/Evolução) + aba "Mais"; novo componente `MoreMenuSheet` (bottom sheet com overlay, animação de subida, grade 2 colunas, botão X, fecha ao tocar fora ou ao selecionar um item); `MORE_MENU_ITEMS`/`MORE_MENU_VIEWS` como fonte única de verdade para o conteúdo do sheet e o estado ativo da aba "Mais".
- `src/app/globals.css` — nova animação `@keyframes sheetUp`/`.animate-sheet-up` para a subida do bottom sheet.

### Itens na bottom nav

Hoje (dashboard), Planejar (planner), Exercícios (exercises), Evolução (evolution), Mais.

### Itens no menu "Mais"

IA Coach, Treinos, Vídeos, Nutrição, Feed (community), Assinatura (premium), Admin (somente se `user.email === 'rafael.demo@gymflow.ai'`, mesma regra já usada na `SideNavigation` do desktop).

### Estado ativo da aba "Mais"

`isMoreActive = MORE_MENU_VIEWS.includes(activeView)` — a aba fica destacada sempre que `activeView` for uma das 7 views que moram no sheet (ai-coach, workouts, videos, nutrition, community, premium, admin), sem precisar listar as views duas vezes graças à constante compartilhada.

### Decisões

Ver `docs/DECISOES.md` (seção GOAL-05).

### Validações executadas

1. `grep -rn "alert(" src/` — vazio.
2. `grep -rn "confirm(" src/` — vazio.
3. `npx tsc --noEmit` — sem erros.
4. `npm run build` — passou (Next 16.2.6, Turbopack).
5. Dev server iniciado, `GET /` retornou 200 sem erros no log.
6. `npx eslint src/components/Navigation.tsx` — só o warning pré-existente `'Zap' is defined but never used` restou (o uso do `Menu` no botão "Mais" eliminou o outro warning pré-existente do mesmo arquivo).
7. Auditoria de views (Tarefa 6) documentada em `docs/DECISOES.md` — todas as 12 views pós-login alcançáveis; nenhuma órfã.
8. `git status` — nenhum arquivo em `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d` alterado; nenhum GOAL-06 iniciado.

### Confirmação de escopo

Avatar Lab, POC 3D, backend, Supabase, pagamento real, timer de descanso, modelo de programas e motor de progressão não foram tocados. GOAL-06 não foi iniciado.

---

## GOAL-06 — Timer de descanso + Wake Lock (2026-07-03)

### Resumo

Timer de descanso automático: ao marcar uma série como concluída (exceto se for a última série pendente do treino), inicia um descanso (padrão 90s, configurável, ou `restSec` do exercício se definido) que sobrevive a refresh, mostra tempo/progresso/+30s/Pular na ActionBar do GOAL-04 (mobile) ou no card já existente (desktop), e ao terminar dispara toast + vibração + beep opcional. Durante o treino ativo, o app tenta manter a tela acesa via Wake Lock API, com fallback silencioso onde não suportado.

### Arquivos alterados

- `src/types/index.ts` — `UserProfile.restTimerDefaultSeconds?`/`restTimerSoundEnabled?` (configurações); `Exercise.restSec?` (descanso sugerido por exercício).
- `src/providers/GymFlowContext.tsx` — estado do timer de descanso (`restTimerEndAt`/`restTimerTotalSeconds`/`restTimerLabel`/`restSecondsRemaining`) com hidratação e save no envelope do GOAL-01; `completeWorkoutSet` inicia o timer automaticamente; `extendRestTimer`/`skipRestTimer`; efeito de Wake Lock (`navigator.wakeLock`, re-adquire em `visibilitychange`, libera quando não há treino ativo); helper `playBeep()` via Web Audio API; `logout`/`finishWorkout`/`cancelWorkout` limpam o timer.
- `src/modules/ActiveWorkoutPage.tsx` — removido o timer local (estado, efeito, `handleStartRestTimer`); card de descanso desktop (`hidden lg:flex`) agora lê do contexto; ActionBar fixa mobile/tablet alterna entre modo "descanso" (tempo, barra de progresso, +30s, Pular) e modo "Série X de Y / Continuar-Finalizar" conforme `restSecondsRemaining`.
- `src/modules/EvolutionDashboard.tsx` — bloco "Timer de Descanso" na seção de Configurações: input de descanso padrão (segundos) e toggle de som, ambos via `updateUserProfile`.

### Como o timer funciona

Ao concluir uma série (checkbox na tabela), `completeWorkoutSet` verifica se ainda há alguma série pendente no treino inteiro; se sim, calcula a duração (`exercise.restSec` → `user.restTimerDefaultSeconds` → `90`) e grava `restTimerEndAt = Date.now() + duração`. Um efeito no contexto recalcula `restSecondsRemaining` a cada 250ms a partir desse timestamp (nunca por contador decrescente em memória). "+30s" soma 30s ao tempo restante atual; "Pular" zera o timer. Ao chegar a 0: toast de sucesso, `navigator.vibrate` (se suportado) e beep opcional (Web Audio API, respeita a configuração de som).

### Como persiste após refresh

Mesmo padrão do cronômetro do treino (GOAL-01): só o timestamp de término (`restTimerEndAt`) é persistido no envelope `gymflow:state:v1`, não um contador. Ao hidratar, se esse timestamp ainda está no futuro, o timer é restaurado e o tempo restante recalculado corretamente; se já passou (app ficou fechado além da duração do descanso), o timer é simplesmente descartado — sem timer negativo, sem replay de toast/vibração antigos.

### Wake Lock

`navigator.wakeLock.request('screen')` é tentado sempre que há treino ativo, com `try/catch` silencioso (não suportado, negado ou requer HTTPS — comum ao testar via IP local em HTTP no celular; ver `docs/DECISOES.md`). Re-adquirido no evento `visibilitychange` (o navegador libera o wake lock automaticamente ao trocar de aba). Liberado pelo cleanup do próprio `useEffect` quando `activeWorkout` deixa de existir — cobre finalizar, cancelar e logout sem código duplicado.

### Decisões

Ver `docs/DECISOES.md` (seção GOAL-06).

### Validações executadas

1. `grep -rn "alert(" src/` — vazio.
2. `grep -rn "confirm(" src/` — vazio.
3. `npx tsc --noEmit` — sem erros.
4. `npm run build` — passou (Next 16.2.6, Turbopack).
5. Dev server iniciado, `GET /` retornou 200 sem erros no log.
6. `npx eslint` nos arquivos alterados — 1 erro novo (`setState` em efeito do timer de descanso), mas reproduz exatamente o mesmo padrão já aceito do cronômetro do treino (`setWorkoutDuration(0)`); registrado em `docs/PENDENCIAS.md`. Nenhum outro problema novo (o cast `any` do Wake Lock foi evitado usando o tipo nativo `WakeLockSentinel`/`navigator.wakeLock` do `lib.dom.d.ts`).
7. `git status` — nenhum arquivo em `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d` alterado; nenhum GOAL-07 iniciado.

### Confirmação de escopo

Avatar Lab, POC 3D, backend, Supabase, pagamento real, modelo de programas e motor de progressão não foram tocados. GOAL-07 não foi iniciado.

---

## GOAL-07 — Programa → Semana → Dia → Slot + Planejador real (2026-07-03)

### Resumo

Programas ganharam estrutura real (`Program → Week → Day → ExerciseSlot`) e o planejador deixou de cair em treino genérico: cada dia planejado referencia um `ProgramDay` real e abre o Treino Ativo com exatamente os slots daquele dia (exercícios, séries, faixa de reps, RPE alvo e descanso corretos).

### Antes / depois (comportamento crítico)

- **Antes:** programas eram uma lista achatada de exercícios; o planejador gerava dias a partir de templates soltos sem `programId`, e tocar num dia abria um treino genérico de 1 exercício ("Treino Livre" disfarçado). O timer de descanso vinha só do `Exercise.restSec` ou do default.
- **Depois:** `weeks[].days[].slots[]` em todos os 12 programas; semana gerada (IA ou "Planejar Semana" no programa) carrega `programId` + `programDayId` por dia; abrir Segunda ≠ abrir Terça (Days diferentes → treinos diferentes); dia de descanso não tem botão de iniciar; o `restSec` do slot alimenta o timer do GOAL-06 com prioridade máxima.

### Arquivos alterados

- `src/types/index.ts` — novos tipos `ExerciseSlot`, `ProgramDay`, `ProgramWeek`, `ProgressionType`; `WorkoutProgram` ganhou `repeatWeeks`/`weeks`; `WeeklyWorkoutDay.programDayId`; `ActiveExercise` ganhou `repRange`/`targetRPE`/`restSec` opcionais.
- `src/mock/programs.ts` — helpers `comp/iso/core/cardio` e migração dos 12 programas para `weeks` (IDs e exercícios existentes preservados; nenhum exercício inventado).
- `src/providers/GymFlowContext.tsx` — `startWorkout(programId, customName, programDayId)` monta o treino pelos slots do Day; `buildWeekFromProgram` + `selectProgramForProfile` + `applyProgramToWeek`; `generateWeeklyPlan` reescrito para usar programas reais; login demo/registro geram plano real; timer de descanso prioriza `restSec` do slot (0 = sem timer).
- `src/modules/PlannerView.tsx` — Play passa `programDayId`; editar/alternar descanso limpa vínculo com o programa; duplicar preserva `programDayId`.
- `src/modules/WorkoutsTab.tsx` — modal mostra a divisão real por Days (séries × faixa, descanso, RPE), botão "Iniciar" por Day e botão "Planejar Semana" (applyProgramToWeek).
- `src/modules/ActiveWorkoutPage.tsx` — cabeçalho do exercício mostra a meta real do slot (faixa de reps, RPE, descanso) quando presente.

### Validações executadas

1. `grep -rn "alert(" src/` e `grep -rn "confirm(" src/` — vazios.
2. `npx tsc --noEmit` — sem erros.
3. `npm run build` — passou (Next 16.2.6, Turbopack).
4. Cross-check automatizado: todos os `exerciseId` usados nos slots existem em `src/mock/exercises.ts`.
5. Compatibilidade atualizada pelos GOAL-19A.1/19B.1: plano antigo continua hidratando, porém `programId` multi-dia sem `programDayId` exige nova escolha e jamais cai no primeiro Day; programa canônico de um dia e treino sem `programId` seguem compatíveis. Persistência GOAL-01, timer GOAL-06, ActionBar GOAL-04 e toasts GOAL-03 não foram alterados estruturalmente.
6. Nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/` ou `app/poc-3d` alterado.

### Como testar no celular

1. Ir em Programas → abrir um programa intermediário/avançado → ver a divisão por dias → tocar "Planejar Semana".
2. No Planejador, tocar Play na Segunda e depois (cancelando) na Terça → treinos diferentes, com os exercícios exatos de cada Day.
3. Concluir uma série → o timer de descanso usa o descanso do slot (ex.: 120s composto, 75s isolado, 180s força).
4. Dia de descanso não tem botão de iniciar treino.

---

## GOAL-08 — Progressão determinística + testes (2026-07-03)

### Resumo

Motor determinístico de progressão de carga/reps (`src/lib/progression.ts`, função pura `suggestNext`) alimentado pelo histórico real de treinos concluídos (persistido desde o GOAL-01), com suíte de testes em vitest e integração nas colunas ANT/SUG do Treino Ativo.

### Regra implementada

1. Sem histórico (ou só séries não concluídas): `pesoKg: null`, `repsAlvo` = piso do repRange, motivo honesto.
2. Última sessão bateu o TETO do repRange em todas as séries concluídas e RPE ≤ targetRPE (RPE ausente conta como ok, declarado no motivo): subir `incrementKg` e voltar ao piso da faixa.
3. Abaixo do PISO em 2 sessões consecutivas: deload de 10%.
4. Caso contrário: manter carga e subir reps (+1 sobre a menor reps concluída, teto = repRange[1]); RPE acima do alvo trava a subida de carga mesmo no teto da faixa.
5. `progression: 'nenhuma'`: sugestão neutra sem carga.
6. Toda carga sugerida é arredondada para múltiplos de 0.5 kg; nunca crasha com peso/RPE/histórico ausentes ou malformados.

### Antes / depois (comportamento crítico)

- **Antes:** colunas ANT/SUG do Treino Ativo eram fabricadas (10 kg / 12 kg hardcoded em `startWorkout`), sem relação com o histórico; texto "Sugestão IA: Carga progressiva" sem base real.
- **Depois:** ANT = maior carga concluída da última sessão real daquele exercício ("—" sem histórico); SUG = saída do motor determinístico ("—" quando não aplicável); séries pré-preenchidas com a sugestão (fallback: última carga → 10 kg); cabeçalho mostra "Progressão recomendada: <motivo>".

### Arquivos criados/alterados

- `src/lib/progression.ts` — **novo**: `suggestNext`, `lastRecordedWeight`, `roundToHalfKg`, tipos `ExerciseSessionHistory`/`HistorySet`/`ProgressionSuggestion`.
- `src/lib/progression.test.ts` — **novo**: 15 testes (histórico vazio, progressão de peso, RPE alto, deload, 1 sessão ruim, +1 rep, teto da faixa, RPE ausente, peso ausente, histórico malformado, progression nenhuma, arredondamento 0.5 kg, helpers).
- `package.json` — vitest como devDependency + script `"test": "vitest run"`.
- `src/providers/GymFlowContext.tsx` — `exerciseHistoryFor` (histórico por exercício a partir do `workoutHistory` persistido) e `startWorkout` integrando o motor nos 3 caminhos (slots, legado, treino livre).
- `src/types/index.ts` — `ActiveExercise.progressionNote?`.
- `src/modules/ActiveWorkoutPage.tsx` — ANT/SUG honestos com "—", motivo do motor no cabeçalho, remoção do texto "Sugestão IA".

### Validações executadas

1. `grep -rn "alert(" src/` e `grep -rn "confirm(" src/` — vazios.
2. `npx vitest run` — 15/15 testes passando.
3. `npx tsc --noEmit` — sem erros.
4. `npm run build` — passou (Next 16.2.6, Turbopack).
5. Histórico antigo compatível: campos de `HistorySet` todos opcionais, nenhuma migração de formato.
6. Nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/` ou `app/poc-3d` alterado.

### Como testar no celular

1. Concluir um treino de programa registrando cargas (ex.: supino 40 kg × 10 reps em todas as séries, RPE ≤ 8).
2. Iniciar o mesmo Day de novo → ANT mostra 40 kg, SUG mostra 42.5 kg e as séries vêm pré-preenchidas com 42.5 kg × 8 reps, com o motivo no cabeçalho.
3. Exercício nunca treinado → ANT e SUG mostram "—".

---

## GOAL-09 — Biblioteca real de exercícios (2026-07-03)

Substituição dos 68 exercícios placeholder gerados por loop por uma biblioteca real de 125 exercícios curados do dataset público free-exercise-db, com instruções PT-BR de qualidade personal, 250 imagens locais e compatibilidade total com os programas.

### Antes / depois

- **Antes:** 29 exercícios reais + loop `for` gerando 68 placeholders "Exercício Extra CHEST #12 (Polia)" com instruções genéricas e substitutos `extra_*` fictícios; nenhuma imagem.
- **Depois:** 125 exercícios reais (97 a mais que os 28 "reais + placeholders" úteis), todos com 4-6 passos de execução, postura, respiração, erros comuns + correções, variações, substitutos válidos e alertas de segurança; 2 fotos locais por exercício exibidas na biblioteca, no modal de técnica e no treino ativo.

### Números

- Exercícios: 29 reais (+68 placeholders) → **125 reais** (placeholders: **0**).
- Imagens locais baixadas: **250** (125 × 2) em `public/assets/exercises/<id>/{0,1}.jpg`.
- Grupos cobertos: chest 15, back 17, shoulders 12, biceps 11, triceps 10, legs 23, glutes 6, calves 5, abs 10, cardio 7, functional 4, mobility 5.

### Arquivos criados/alterados

- `scripts/import-exercises.mjs` — **novo**: importador reexecutável (dataset + fallback de URL, download atômico de imagens, modo `--check`); aborta com erro claro sem corromper arquivos se a rede falhar.
- `public/assets/exercises/**` — **novo**: 250 imagens locais.
- `src/mock/exercises.ts` — regenerado: `BASE_EXERCISES` (29 originais preservados, IDs intactos) + `EXPANSION_EXERCISES` (96 novos autorados em PT-BR); loop gerador removido; `withLocalImages` injeta `images` locais.
- `src/types/index.ts` — `Exercise.images?: string[]`.
- `src/components/ExerciseMedia.tsx` — **novo**: fotos com crossfade (3s), selo "Demonstração 3D em breve", fallback honesto no `AvatarDemoPlaceholder`.
- `src/modules/ExerciseLibrary.tsx` — card com foto real (fallback honesto) e modal de técnica com crossfade + selo, mantendo checklist/erros/correções/dica.
- `src/modules/ActiveWorkoutPage.tsx` — box "Demonstração 3D em produção" agora mostra as fotos do exercício com crossfade + selo; sem fingir avatar final.
- `src/mock/exercises.test.ts` — **novo**: cross-check automatizado (≥120 exercícios, IDs únicos, campos obrigatórios, imagem local existente em disco, substitutions e slots de programas apontando para IDs existentes, zero placeholders).

### Compatibilidade com programas

- Todos os 20 `exerciseId` usados por `MOCK_PROGRAMS` (slots das weeks + lista legada) pertencem aos 29 originais preservados — nenhum alias necessário. Garantido por teste automatizado, não por inspeção manual.

### Validações executadas

1. `grep -rn "Exercício Extra" src/` — vazio; `grep -rn -i "placeholder" src/mock/exercises.ts` — vazio; `grep -rn "alert(" src/` e `confirm(` — vazios (apenas ConfirmDialog próprio).
2. `node scripts/import-exercises.mjs --check` — 125/125 existem no dataset com imagens.
3. `npx vitest run` — 22/22 (16 do motor de progressão GOAL-08 intactos + 6 novos).
4. `npx tsc --noEmit` — sem erros.
5. `npm run build` — passou (Next 16.2.6, Turbopack).
6. Nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d`, GLBs ou pipeline do Kai alterado.

## GOAL-10 — PWA completo (2026-07-04)

App agora é instalável ("Adicionar à tela inicial") em modo standalone, com ícones reais (192/512 + maskable + apple-touch-icon) e um service worker manual (sem `next-pwa`) cacheando os estáticos do build e a biblioteca de exercícios, com fallback offline para a shell.

### Antes / depois

- **Antes:** `app/manifest.ts` já existia com nome/cores/display corretos, mas os únicos ícones declarados eram o `icon.svg` (marca "haltere") e o `favicon.ico` — nenhum PNG 192/512/maskable, nenhum `apple-touch-icon` explícito, e nenhum service worker (app só funcionava 100% online).
- **Depois:** 5 PNGs gerados por script (`icon-192`, `icon-512`, `maskable-192`, `maskable-512`, `apple-touch-icon`) com um monograma "G" vetorial (verde-lima sobre fundo escuro); manifest referenciando os 4 primeiros; `layout.tsx` com `<link rel="apple-touch-icon">` via `metadata.icons.apple`; `public/sw.js` registrado somente em produção, cache-first para estáticos/ícones/exercícios e network-first com fallback de shell para navegação.

### Arquivos criados/alterados

- `scripts/generate-icons.mjs` — **novo**: desenha o monograma G em SVG (sem fonte/arquivo externo) e rasteriza via `sharp` para os 5 PNGs em `public/icons/`. Reexecutável (`node scripts/generate-icons.mjs`).
- `public/icons/icon-192.png`, `icon-512.png`, `maskable-192.png`, `maskable-512.png`, `apple-touch-icon.png` — **novos**.
- `src/app/manifest.ts` — `icons` substituído pelos 4 PNGs novos (`any` 192/512 + `maskable` 192/512); demais campos (name, short_name, display, orientation, start_url, description, cores, categories) mantidos como já estavam.
- `src/app/layout.tsx` — adicionado `metadata.icons.apple` apontando para `/icons/apple-touch-icon.png`; `metadata`/`viewport` (theme-color, appleWebApp, colorScheme) mantidos como já estavam.
- `src/components/ServiceWorkerRegister.tsx` — **novo**: client component minúsculo, registra `/sw.js` só quando `process.env.NODE_ENV === 'production'`; montado em `layout.tsx` ao lado do `ToastProvider`.
- `public/sw.js` — **novo**: cache `gymflow-v1`; cache-first para `/_next/static/`, `/icons/` e `/assets/exercises/`; network-first com fallback para cache e depois para a shell (`/`) em navegações; `activate` apaga qualquer cache com nome diferente de `gymflow-v1`.
- `package.json` — `sharp` adicionado como devDependency (só usada pelo script de geração de ícones, não entra no bundle do app).
- `docs/DECISOES.md`, `docs/GOALS_LOG.md` — este registro.

### Validações executadas

1. `npm run build` — passou (Next 16.2.6, Turbopack); rotas geradas incluem `○ /manifest.webmanifest`.
2. `npm run start` + checagem HTTP real do HTML servido: exatamente um `<link rel="manifest" href="/manifest.webmanifest">`, um `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`, `<meta name="theme-color" content="#09090b">` e as meta tags `apple-mobile-web-app-*`; os 5 PNGs e `/sw.js` respondem HTTP 200; `/manifest.webmanifest` contém os 4 ícones novos com `sizes`/`purpose` corretos.
3. Confirmado por grep no bundle de produção (`.next/static/chunks/`) que a chamada `navigator.serviceWorker.register('/sw.js')` está presente no client build (o guard de `NODE_ENV` é resolvido em tempo de build pelo Next, então só o build de produção a inclui).
4. `npx tsc --noEmit` — sem erros.
5. `npx vitest run` — 22/22 (inalterado; nenhum teste novo era esperado para infraestrutura de PWA).
6. `grep -rn "alert(" src/` e `grep -rn "confirm(" src/` — ambos vazios.
7. Nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d`, GLBs, pipeline do Kai, backend, Supabase ou pagamento alterado; biblioteca de exercícios e motor de progressão intocados.

## GOAL-10.5 — Construtor de Treino + correção de volume dos treinos (2026-07-04)

### Resumo

Corrigida a divergência entre o número de exercícios prometido no card "Treino do Dia" e o que o Treino Ativo de fato carregava. Criado um Construtor de Treino manual completo (criar do zero, editar um treino sugerido, salvar como treino próprio, planejar num dia da semana, iniciar exatamente o que foi montado), com perfis de volume (Compacto/Padrão/Alto Volume) e um estimador de duração honesto que nunca corta exercícios sozinho — só avisa. Programas padrão de Peito/Tríceps reforçados para bater com o volume real. Faixas brancas nas fotos de exercício corrigidas.

### Causa raiz do bug 5 → 3 exercícios

Duas divergências independentes da mesma fonte de verdade (`ProgramDay.slots`):

1. `Dashboard.tsx` calculava o número exibido a partir da lista achatada legada `WorkoutProgram.exercises` (documentada no próprio código como "mantida para compatibilidade de exibição"), não de nenhum Day real — para `prog_int_1` essa lista tinha 5 itens.
2. O botão "Começar Treino" chamava `startWorkout(program.id, program.name)` **sem `programDayId`**, então `GymFlowContext.startWorkout` caía no fallback `allDays[0]` — o primeiro Day do programa, com apenas 3 slots.

O Planejador já fazia certo (usava `weeklyPlan[].programDayId`); só o Dashboard tinha essa leitura paralela. Detalhe completo em `docs/DECISOES.md`.

### Antes / depois (comportamento crítico)

- **Antes:** card do Dashboard mostrava a contagem da lista achatada do programa (não do Day); "Começar Treino" sempre abria o primeiro Day do programa, independente do que o card prometia; `PlannerView` fabricava `exerciseCount` (`4` ou `grupos × 2`) ao alternar/editar um dia, sem exercícios reais por trás; não havia nenhuma forma de montar um treino manualmente.
- **Depois:** Dashboard, Planejador e Treino Ativo leem o MESMO `ProgramDay.slots` através de `todayPlan`/`estimateWorkoutDuration`/`muscleGroupsForSlots` — o número exibido é sempre o número real. Alternar/editar um dia sem vínculo real fica honestamente "Sem treino definido" (0 exercícios) em vez de fabricar um número. Novo Construtor de Treino permite criar, editar, salvar, planejar e iniciar treinos reais, com perfis de volume e aviso de duração sem cortar exercícios.

### Arquivos criados

- `src/lib/volumeProfiles.ts` — perfis Compacto/Padrão/Alto Volume (faixas de minutos/exercícios) + `defaultTargetMinutes`.
- `src/lib/workoutDuration.ts` — `estimateWorkoutDuration` (minutos/séries/exercícios a partir dos slots reais), `muscleGroupsForSlots` (grupos musculares sempre derivados dos exercícios, nunca um campo solto) e `buildDurationWarning` (avisa sem cortar).
- `src/modules/WorkoutBuilder.tsx` — Construtor de Treino manual: nome/nível/perfil de volume/tempo alvo; biblioteca de exercícios com busca e filtro por músculo; editor por exercício (séries, faixa de reps, RPE, descanso, progressão, incremento); reordenar (subir/descer), duplicar, remover; resumo ao vivo (exercícios/séries/duração/grupos) com aviso quando passa do tempo alvo; salvar, iniciar agora e planejar em qualquer dia da semana.

### Arquivos alterados

- `src/types/index.ts` — `VolumeProfile`, `WorkoutBuilderDraft`, `ProgramDay.volumeProfile?`, `WorkoutProgram.isCustom?`.
- `src/providers/GymFlowContext.tsx` — `customPrograms` (persistido) mesclado com `MOCK_PROGRAMS` em `programs`; `todayPlan` (dia de hoje resolvido do `weeklyPlan` real); `startWorkout` aceita um `ProgramDay` explícito (evita corrida de estado ao salvar-e-iniciar); `saveCustomProgram`, `assignDayToWeekday`, `openWorkoutBuilder`; `buildWeekFromProgram` agora usa `estimateWorkoutDuration`/`muscleGroupsForSlots` (removida a função privada duplicada); `getTodayDayName()` único (antes duplicado em `finishWorkout`/`replanMissedWorkout`).
- `src/mock/programs.ts` — `prog_int_1`: "Dia A — Peito e Tríceps" (3 peito + 2 tríceps, 16 séries, perfil Padrão) e "Dia C — Peito e Tríceps (Alto Volume)" (4 peito + 3 tríceps, 22 séries, perfil Alto Volume).
- `src/modules/Dashboard.tsx` — card "Treino do Dia" lê `todayPlan`; botões "Começar Treino" / "Editar Treino" / "Montar do Zero"; estados honestos para dia de descanso e semana ainda não planejada.
- `src/modules/PlannerView.tsx` — botão "Criar Treino"; por dia, "Escolher" (atribui um Day real de qualquer programa/custom ao dia) e "Editar" (abre o Construtor com os slots reais); removida a fabricação de `exerciseCount` do modal antigo.
- `src/modules/WorkoutsTab.tsx` — abas "Programas Sugeridos" / "Meus Treinos"; botão "Criar Treino"; "Editar" por dia dentro de um treino custom.
- `src/components/ExerciseMedia.tsx` — fundo do contêiner de mídia trocado de `bg-white` para `bg-gym-dark` (fim das faixas brancas nas fotos com `object-contain`).
- `src/app/page.tsx` — nova view `workout-builder`.
- `docs/DECISOES.md`, `docs/PENDENCIAS.md`, `docs/GOALS_LOG.md` — este registro.

### Validações executadas

1. `grep -rn "alert(" src/` e `grep -rn "confirm(" src/` — ambos vazios.
2. `npx vitest run` — 22/22 (inalterado).
3. `npx tsc --noEmit` — sem erros.
4. `npm run build` — passou (Next 16.2.6, Turbopack) duas vezes (antes e depois de um ajuste no Construtor — ver nota abaixo).
5. `npm run start` + checagem HTTP: `/` e `/manifest.webmanifest` seguem servindo 200 normalmente (PWA do GOAL-10 intocado).
6. `git status` conferido antes de cada etapa: nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d`, GLBs, pipeline do Kai, backend, Supabase, Prisma, pagamento, service worker ou PWA tocado.
7. Revisão de código identificou e corrigiu, antes do commit, uma corrida no próprio Construtor: `buildProgramFromDraft` mintava um `custom_${Date.now()}` novo a cada clique — planejar o mesmo treino em 2 dias da semana (ou Salvar e depois Iniciar) na mesma sessão duplicava o treino em vez de reaproveitar o que acabou de ser salvo. Corrigido cacheando os ids resolvidos em `useRef` por sessão do Construtor.
8. Não foi possível testar a UI interativa num navegador real (sem ferramenta de browser headless neste ambiente) — validação da lógica de UI feita por revisão de código linha a linha, alinhando cada tela ao mesmo `ProgramDay`/`todayPlan` usado por `startWorkout`.
9. Nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d`, GLBs, pipeline do Kai, backend, Supabase, Prisma, pagamento real, service worker ou PWA foi alterado.

## GOAL-10.6 — QA UX do Construtor de Treino (2026-07-04)

### Resumo

Ajustes de usabilidade a partir dos atritos encontrados na revisão de código do GOAL-10.5 (teste manual em navegador ainda não foi possível neste ambiente — sem ferramenta headless): Dashboard sempre oferece um caminho claro para treinar mesmo em dia de descanso; modal de adicionar exercício no Construtor não fecha mais a cada clique; salvar um treino leva direto para "Meus Treinos" com o item recém-criado destacado; e as ações finais do Construtor ficaram em 3 botões claros (Salvar / Salvar e Planejar / Iniciar Agora), com aviso antes de descartar mudanças não salvas.

### Antes / depois

- **Antes:** em dia de descanso (ou dia sem treino definido) o Dashboard só oferecia "Montar Treino" e "Ver Planejador" — nenhum caminho para reaproveitar um treino já existente. O modal de adicionar exercício fechava a cada exercício adicionado. Salvar um treino custom voltava para a aba Treinos na sub-aba "Programas Sugeridos" (o treino salvo ficava escondido em "Meus Treinos", no fim da lista). O Construtor tinha só "Iniciar Agora"/"Salvar", e a seção de planejar a semana ficava sempre visível mesmo sem ter sido pedida.
- **Depois:** Dashboard sem treino real hoje oferece "Escolher Treino para Hoje" (reaproveita o seletor do Planejador), "Montar Treino" e "Ver Planejador" — nunca inventa um treino sozinho. O modal de exercícios permanece aberto entre adições, com toast de confirmação e um botão "Concluir" explícito; exercícios já adicionados mostram "No treino ×N" e "Adicionar novamente" em vez de duplicar silenciosamente. "Salvar" sempre leva para Treinos → Meus Treinos com o item recém-criado destacado (anel verde-lima) e listado primeiro. "Salvar e Planejar" salva e só então revela a escolha de dia da semana; "Cancelar"/voltar avisa via `ConfirmDialog` (não `confirm()` nativo) se há mudanças não salvas.

### Arquivos alterados

- `src/providers/GymFlowContext.tsx` — novo estado compartilhado: `workoutsTab` (aba Programas Sugeridos/Meus Treinos, antes local do `WorkoutsTab`), `chooserDayName` + `openProgramChooserForDay` (o mesmo seletor "Escolher treino" do Planejador, agora acionável também pelo Dashboard), `lastSavedProgramId` (setado dentro de `saveCustomProgram`).
- `src/modules/Dashboard.tsx` — botão "Escolher Treino para Hoje" quando não há treino real hoje (descanso ou dia vazio); textos honestos ("Hoje está como descanso no seu planejamento...").
- `src/modules/PlannerView.tsx` — "Escolher treino" migrado para o estado compartilhado (`chooserDayName`) em vez de estado local, sem mudar o comportamento existente.
- `src/modules/WorkoutBuilder.tsx` — modal de exercícios não fecha mais ao adicionar; badge de duplicata; botão "Concluir" no rodapé do modal; ações finais reorganizadas em "Salvar" / "Salvar e Planejar" / "Iniciar Agora"; seção de dias da semana só aparece após "Salvar e Planejar"; `ConfirmDialog` ao cancelar com mudanças não salvas (comparação via snapshot, sem `confirm()` nativo).
- `src/modules/WorkoutsTab.tsx` — aba (`workoutsTab`) migrada para o contexto; "Meus Treinos" ordena o treino recém-salvo primeiro e o destaca com badge "Recém-criado" + anel visual.
- `docs/DECISOES.md`, `docs/GOALS_LOG.md` — este registro.

### Checklist de QA manual (curto)

- [ ] Criar treino com 7 exercícios (4 peito + 3 tríceps).
- [ ] Adicionar vários exercícios em sequência sem o modal fechar sozinho.
- [ ] Salvar — cai direto em Treinos → Meus Treinos, com o treino destacado.
- [ ] Confirmar que o treino aparece em "Meus Treinos".
- [ ] Planejar esse treino em segunda-feira (via "Salvar e Planejar" ou Planejador → Escolher).
- [ ] Iniciar o treino salvo.
- [ ] Confirmar que o Treino Ativo abre exatamente os 7 exercícios.
- [ ] No Dashboard, em dia de descanso, confirmar que "Escolher Treino para Hoje" e "Montar Treino" aparecem (nunca um treino inventado).

### Validações executadas

1. `grep -rn "alert(" src/` e `grep -rn "confirm(" src/` — ambos vazios (o aviso de descarte usa `ConfirmDialog`, não `confirm()` nativo).
2. `npx vitest run` — 22/22 (inalterado).
3. `npx tsc --noEmit` — sem erros.
4. `npm run build` — passou (Next 16.2.6, Turbopack).
5. `git status` conferido: nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d`, GLBs, pipeline do Kai, backend, Supabase, Prisma, pagamento real, service worker ou PWA tocado.
6. Sem regressão na persistência (`customPrograms`/`weeklyPlan` continuam no mesmo envelope do GOAL-01), no timer de descanso, no motor de progressão (GOAL-08) nem no PWA (GOAL-10) — nenhum desses arquivos foi alterado neste GOAL.
7. Novamente não foi possível clicar na UI num navegador real neste ambiente (sem ferramenta headless) — validação por revisão de código, `tsc` e `build`.

## GOAL-11 — Polimento premium final + limpeza + relatório (2026-07-05)

### Resumo

Fechamento do Lote 1: código morto removido com validação por grep/eslint, ErrorBoundary global por view, empty states com CTA em 8 telas, auditoria de toque/microinterações/acessibilidade (alvos ≥44px, vibração de 10ms ao concluir série, focus visível, transição de view de 150ms), fotos de exercício sem faixas (cover 16:9 nos cards/Treino Ativo, 3:2 na ficha técnica, skeleton no loading) e relatório final do lote em `docs/RELATORIO_FINAL_GOALS.md`.

### Código morto removido

- `src/components/BiomechanicalVisualizer.tsx` — 1249 linhas, zero imports (só comentários no stack 3D intocável).
- `MOCK_WEEKLY_TEMPLATES` (`mock/programs.ts` + reexport em `mock/data.ts`) — pendência do GOAL-10.5 quitada.
- Sub-aba `'groups'` órfã do CommunityFeed (union estreitado, cast `as any` removido).
- Parâmetro morto `_duration` de `generateWeeklyPlan` (tipo público + 2 call sites).
- ~50 imports mortos em 18 arquivos + variáveis não usadas (`setPrograms`, `registerUser`, `achievements`, `user` etc.) — eslint `no-unused-vars` = 0 em `src/`.
- Helper local `X` svg do ActiveWorkoutPage substituído pelo `X` do lucide.

### ErrorBoundary (novo `src/components/ErrorBoundary.tsx`)

Class component com `getDerivedStateFromError`/`componentDidCatch` (sempre loga no console; em dev mostra `error.message` no fallback). Fallback dark + verde-lima: "Algo deu errado", descrição curta, "Recarregar app" e "Voltar ao painel" (quando `onGoHome` fornecido). Integrado em `page.tsx` em 2 pontos: switch pré-login e em volta do `renderLoggedInView()` DENTRO do shell — crash de uma view mantém TopBar/side/bottom nav vivos. `resetKey={activeView}` limpa o erro ao navegar.

### Empty states com CTA (padrão: ícone lucide + título + 1 frase + 1 CTA ≥44px)

Evolução/histórico ("Finalize seu primeiro treino" → Começar treino), Meus Treinos ("Monte seu primeiro treino" → Criar treino), Feed ("A comunidade ainda está vazia" → Criar publicação, foca o composer), Nutrição ("Comece registrando sua hidratação" → +250ml agora), Planejador (→ Gerar Semana com IA, texto com `**markdown**` quebrado corrigido), Biblioteca por aba (Favoritos → Explorar exercícios; Recentes → Explorar; busca vazia → Limpar filtros), Treino Ativo sem treino (→ Escolher treino), Construtor sem exercícios (→ Adicionar Exercício).

### Toque, microinterações e acessibilidade

- Checkbox OK das séries: hit area 44×44 (`w-11 h-11 -m-2.5`, visual 24px preservado) + `aria-label` por série — medido 44×44 no navegador.
- Inputs de carga/reps/RPE das séries e os 7 inputs de slot do Construtor: min-h 44px + aria-labels.
- Vibração de 10ms em `completeWorkoutSet` (guarda `'vibrate' in navigator`).
- `:focus-visible` global (outline verde-lima, não dispara em toque).
- Transição de view ~150ms (`.animate-view-in` + `key={activeView}` no wrapper do switch).
- Alvos pequenos promovidos a ≥44px: Trocar/±Série (Treino Ativo), Mover/Copiar/Descanso/Escolher/Editar/Play e Trocar/Colar Aqui (Planejador), X de modais (`tap-target`), coração de favorito, Ver técnica (span→button), envio de comentário, compartilhar post/PR, adicionar foto, fechar toast (44px via margem negativa).
- `active:scale` states nos botões auditados; aria-labels em botões icon-only.

### Visual premium

- `ExerciseMedia` ganhou prop `fit`: cards da biblioteca e mídia do Treino Ativo (21:9→16:9) usam `cover` (fotos 3:2, corte leve seguro — fim das faixas); ficha técnica usa container 3:2 com `contain` (fidelidade sem letterbox). Análise real: 121/125 fotos são 850×567.
- Skeleton pulse no container da foto até a primeira imagem carregar.
- CTAs primários unificados (bg-gym-accent, rounded-2xl, uppercase tracking-wider, sombra accent).

### Validações executadas

1. `npx vitest run` — 22/22.
2. `npx tsc --noEmit` — sem erros.
3. `npm run build` — passou (Next 16.2.6, Turbopack).
4. `grep alert(`/`confirm(`/`"Exercício Extra"`/`"Sugestão IA"` em `src/` — todos vazios; `BiomechanicalVisualizer` só em comentários do stack 3D; "placeholder" só em contextos legítimos (registrado em DECISOES.md).
5. eslint `no-unused-vars` em `src/` — 0 ocorrências.
6. Verificação em navegador real (dev server): login demo, biblioteca com fotos cover carregadas, empty state de Favoritos com CTA funcionando (volta para a grade de 125), treino livre iniciado, checkbox de série medido 44×44px, input de carga 44px, série concluída com toast; zero erros de console.
7. `git status` — nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d`, GLBs, pipeline do Kai, backend, Supabase, Prisma ou pagamento tocado. Lote 2 não iniciado.

**Lote 1 encerrado. Relatório consolidado em `docs/RELATORIO_FINAL_GOALS.md`.**

---

## GOAL-12 — App Android local com Capacitor (2026-07-06)

### Resumo

O GymFlow AI agora pode ser empacotado como **APK Android de debug** e instalado no celular como aplicativo (tela cheia, assets locais, localStorage), sem abrir URL no navegador. O app já era uma SPA 100% client-side, então bastou ligar o **export estático** do Next (`output: "export"` → pasta `out/`) num alvo de build separado e envolvê-lo num **WebView do Capacitor**. Backend, Supabase, pagamento, Avatar Lab, POC 3D e GLBs não foram tocados. **APK gerado com sucesso.**

### Auditoria de static export (Parte 1)

Viável sem refatorar o app: `page.tsx` e `poc-3d` são `'use client'`; **zero** API routes, server actions, `cookies()`/`headers()` ou `next/image`; `localStorage` já guardado por `typeof window`. Único ajuste necessário: a rota de metadata `/manifest.webmanifest` exigiu `export const dynamic = 'force-static'` sob `output: export` (registrado em DECISOES/PENDENCIAS). Os 261 assets de `public/` (250 fotos de exercícios + 5 ícones + sw.js) entram no `out/` automaticamente.

### Estratégia de build (Parte 2) — não quebra o build web

`output: "export"` só liga quando `BUILD_TARGET=mobile` (script `build:mobile`); `next build`/`next start` continuam com o comportamento padrão do Next. A trava de zoom no `viewport` também é condicional a esse alvo (app nativo trava zoom; web mantém pinch-zoom por acessibilidade).

### Arquivos criados

- `capacitor.config.ts` — `appId com.gymflowai.app`, `appName "GymFlow AI"`, `webDir out`; `androidScheme https` (contexto seguro p/ SW + localStorage persistente), `backgroundColor #09090b` (sem flash branco), `webContentsDebuggingEnabled true`.
- `scripts/build-mobile.mjs` — wrapper Node cross-platform que roda `next build` com `BUILD_TARGET=mobile` (evita `cross-env`).
- `scripts/android-build.mjs` — wrapper Node que roda `gradlew assembleDebug` (caminho absoluto do wrapper; cross-platform).
- `docs/ANDROID_BUILD.md` — guia curto (build mobile, abrir Studio, gerar/instalar/atualizar APK, limitações, APK×PWA×Play Store).
- `android/**` — projeto nativo gerado pelo Capacitor (`npx cap add android`).

### Arquivos alterados

- `next.config.ts` — `output: "export"` + `images.unoptimized` condicionais a `BUILD_TARGET=mobile` (via `mobileConfig` espalhado).
- `src/app/manifest.ts` — `export const dynamic = 'force-static'` (necessário para o export; inofensivo ao web).
- `src/app/layout.tsx` — `viewport` ganha `maximumScale: 1, userScalable: false` **só** quando `BUILD_TARGET=mobile`.
- `package.json` — scripts `build:mobile`, `cap:sync`, `android:open`, `android:build`; deps `@capacitor/core`/`@capacitor/android` + devDep `@capacitor/cli`.
- `android/build.gradle` — override de `compileOptions` para `VERSION_17` em todos os subprojetos (ver nota de toolchain abaixo).
- `android/local.properties` — `sdk.dir` local (gitignored pelo Capacitor).

### Capacitor 7 + JDK 17 (nota de toolchain)

A máquina tem **JDK 17** e Android SDK com **platform android-35 + build-tools 35.0.0** (nenhum JDK 21). O Capacitor 8 (e o 7.6) declaram `sourceCompatibility 21`, quebrando o build com "invalid source release: 21". Como o código Java do Capacitor **não usa recursos exclusivos do Java 21** (verificado: sem sequenced collections, virtual threads, record/switch patterns), a solução foi fixar Capacitor **7.6.7** (compileSdk 35 = casa com o SDK instalado) e forçar `compileOptions` para 17 em `android/build.gradle` (arquivo que o `cap sync` não regenera). Android converte o bytecode para DEX, então 17 vs 21 não afeta o runtime. Remover o override quando houver JDK 21.

### Como gerar e instalar (resumo — detalhe em `docs/ANDROID_BUILD.md`)

```bash
npm run cap:sync        # build:mobile (gera out/) + cap sync android
npm run android:build   # APK -> android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`npm run android:open` abre o projeto no Android Studio (que traz seu próprio JBR 21, dispensando o override em quem usar a IDE).

### APK gerado

- `android/app/build/outputs/apk/debug/app-debug.apk` — **~21 MB**.
- `aapt dump badging`: package `com.gymflowai.app`, label **GymFlow AI**, versionCode 1 / versionName 1.0, minSdk 23, targetSdk/compileSdk 35.

### Validações executadas

1. `npm run build:mobile` — export estático OK; `out/` com `index.html`, `manifest.webmanifest`, `sw.js`, `poc-3d.html`, `404.html`, 250 fotos de exercícios e os 5 ícones (~19 MB).
2. `npx cap add android` + `npx cap sync android` — projeto nativo criado e assets copiados sem erro.
3. `npm run android:build` — **BUILD SUCCESSFUL** (Gradle 8.x, AGP 8.7.2, JDK 17); APK de debug gerado.
4. `npm run build` (web normal) — passou; segue com output padrão do Next (sem `export`), provando que o alvo mobile não quebrou o build web.
5. `npx tsc --noEmit` — sem erros (inclui `capacitor.config.ts`).
6. `npx vitest run` — 22/22 (inalterado).
7. `grep -rn "alert(" src/` e `grep -rn "confirm(" src/` — ambos vazios.
8. `git status` — nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/`, `src/app/poc-3d`, GLBs, pipeline do Kai, backend, Supabase, Prisma, Stripe/pagamento ou autenticação real tocado. Lote 2 não iniciado.

### Limitações conhecidas

APK de debug (não assinado p/ release); sem backend (tudo local, não sincroniza entre aparelhos); o service worker é redundante dentro do WebView (mas não atrapalha); é preciso `cap:sync` a cada mudança de código web. Detalhes em `docs/ANDROID_BUILD.md` e `docs/PENDENCIAS.md`.

---

## GOAL-13 — Player de técnica por sequência de imagens (2026-07-07)

### Resumo

Criado suporte completo para sequência visual de técnica por exercício. O app agora entende `techniqueFrames?: TechniqueFrame[]`, usa sequências reais quando houver 3+ frames e gera etapas automáticas a partir de `images[]` enquanto a biblioteca ainda tem, em geral, 2 fotos por exercício. O fallback honesto foi mantido: sem imagem ou imagem quebrada cai em `AvatarDemoPlaceholder`, com texto claro de "Demonstração 3D em breve".

### Arquivos criados

- `src/lib/techniqueFrames.ts` — `getTechniqueFrames(exercise)` com fallback seguro, labels automáticos e cues a partir de instruções/dicas/correções existentes.
- `src/lib/techniqueFrames.test.ts` — testes de `techniqueFrames`, 2 imagens, 5 imagens, sem imagens e dados incompletos.
- `src/lib/exerciseTechniqueMap.ts` — mapa compartilhado exercício ↔ guia técnico, removendo duplicação em telas.
- `src/components/TechniqueSequencePlayer.tsx` — player com autoplay, play/pause, anterior/próxima, repetir, contador, indicadores, dicas por etapa e fallback honesto.
- `docs/TECHNIQUE_IMAGE_SEQUENCE_PLAN.md` — plano curto de pastas, nomes e 25 exercícios prioritários.
- `docs/TECHNIQUE_IMAGE_PROMPTS.md` — prompt-base e prompts futuros para 10 exercícios, sem gerar imagens.

### Arquivos alterados

- `src/types/index.ts` — novo `TechniqueFrame` e `Exercise.techniqueFrames?`.
- `src/modules/ExerciseLibrary.tsx` — ficha técnica agora mostra `TechniqueSequencePlayer`; botão "Ver técnica" usa mapa compartilhado.
- `src/modules/ActiveWorkoutPage.tsx` — box visual do treino ativo trocado de crossfade para sequência curta com controles.
- `src/components/GlobalVideoPlayer.tsx` — player global resolve o exercício associado ao guia e mostra a sequência antes do checklist.
- `docs/GOALS_LOG.md` — este registro.

### Como funciona o fallback

- `techniqueFrames` com 3+ etapas: usa as etapas ordenadas por `order`.
- Sem `techniqueFrames`: gera frames a partir de `images[]`.
- Com 2 imagens: labels "Posição inicial" e "Execução / posição final".
- Com 5 imagens: usa o padrão completo de início, meio, contração/final e retorno controlado.
- Sem imagem: retorna um frame seguro e o player mostra o placeholder honesto, sem fingir vídeo/avatar.

### Validações executadas

1. `npx vitest run` — 27/27 testes passaram.
2. `npx tsc --noEmit` — sem erros.
3. `npm run build` — passou (foi necessário liberar rede para o Next buscar a fonte Google `Outfit`).
4. `npm run build:mobile` — passou (mesma liberação de rede para a fonte).
5. `rg -n "alert\(|confirm\(" src` — sem ocorrências.
6. `git status`/diff conferidos — nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/`, `src/app/poc-3d`, Motion Engine, GLBs, backend, Supabase, Prisma, Stripe/pagamento, autenticação real ou service worker foi tocado.

### Confirmação de escopo

Nenhuma imagem real nova foi gerada, baixada ou importada. Nenhum vídeo foi criado. Backend, pagamento, Avatar Lab, Motion Engine, GLBs e Capacitor Android nativo não foram alterados.

---

## GOAL-14 — Lote inicial de imagens reais de técnica (2026-07-07)

### Resumo

Produzido o primeiro lote real de sequências visuais para o `TechniqueSequencePlayer`: 10 exercícios prioritários, 5 JPGs por exercício, total de 50 imagens em `public/assets/exercises/<exerciseId>/sequence/`. O app agora resolve esses frames pelo `getTechniqueFrames()` antes do fallback antigo de `images[]`; exercícios fora do lote continuam com o comportamento do GOAL-13.

### Exercícios cobertos

- `chest_supino_reto`
- `chest_supino_inclinado_haltere`
- `back_puxada_pulley`
- `back_remada_baixa`
- `biceps_rosca_direta`
- `triceps_polia_corda`
- `legs_agachamento_barra`
- `legs_legpress_45`
- `shoulder_desenvolvimento_haltere`
- `shoulder_elevecao_lateral`

### Arquivos criados

- `public/assets/exercises/*/sequence/step-01.jpg` a `step-05.jpg` para os 10 exercícios do lote.
- `docs/TECHNIQUE_IMAGE_BATCH_001.md` — resumo do lote, equivalências de IDs, padrão de arquivos e candidatos ao lote 2.

### Arquivos alterados

- `src/lib/techniqueFrames.ts` — mapa do lote 001 com caminhos reais, labels e cues por etapa.
- `src/lib/techniqueFrames.test.ts` — teste garante 5 frames por exercício e existência física dos JPGs.
- `docs/GOALS_LOG.md` — este registro.

### Integração

`getTechniqueFrames()` mantém a prioridade para `techniqueFrames` explícitos, depois aplica o lote 001 quando o `exercise.id` é coberto, e só então usa o fallback por `images[]` ou placeholder honesto. Biblioteca, Treino Ativo e GlobalVideoPlayer usam o mesmo helper, então recebem os 5 frames reais sem nova integração de tela.

### Confirmação de escopo

Nenhum vídeo foi gerado. Backend, Supabase, Prisma, pagamento/Stripe, autenticação real, Avatar Lab, Motion Engine, GLBs, POC 3D, Android nativo e lote 2 não foram alterados.

---

## GOAL-15 — QA real do Treino Ativo (2026-07-14)

### Resumo

Correção dos bugs reais encontrados no uso do APK Android: (1) notificações de XP empilhando e cobrindo a tela; (2) edições do Treino Ativo (adicionar exercício) que não salvavam; (3) campos numéricos virando `080`/`012`/`0.20`; (4) exercícios tradicionais de academia difíceis de achar na busca; (5) topo do app cortado pela status bar.

### Causa raiz de cada bug

1. **Notificações de XP:** `XPBadgeNotification` renderizava TODAS as notificações do array sem limite e um único timer de 4s reiniciava a cada novo evento. Marcar 4 séries = 4+ cards gigantes presos no topo.
2. **Edição não salva:** `ExerciseLibrary.handleAddToWorkout` fazia `activeWorkout.exercises.push(...)` **sem `setActiveWorkout`** — mutava o array em memória, então não re-renderizava nem disparava o efeito de persistência. `handleAddSet`/`handleRemoveSet` do Treino Ativo também mutavam antes de salvar.
3. **Inputs numéricos:** `onChange={... Number(e.target.value)}` com `<input type="number">` — o comportamento de zero à esquerda do WebView + a reconciliação do React geravam `080`/`0.20`.
4. **Busca:** `ex.name.toLowerCase().includes(query)` — sensível a acento (`triceps` não achava `Tríceps`) e sem apelidos (`pulley`, `puxada alta`, `remada baixa`).
5. **Status bar:** o `<header>` sticky não reservava `env(safe-area-inset-top)`; com `viewport-fit=cover` no APK o conteúdo desenha atrás da status bar.

### Antes / depois (comportamento crítico)

- **Notificações:** antes empilhavam sem fim e cobriam os campos → agora no máximo 2 visíveis, eventos repetidos consolidados (`3 séries concluídas · +30 XP`), auto-dismiss (4s / level up 6s), botão X e swipe horizontal, posicionadas abaixo da TopBar respeitando a safe-area.
- **Inputs:** antes `apagar 10 e digitar 20` virava `0.20` e `80` aparecia `080` → agora aceita vazio durante a edição, remove zero à esquerda, aceita vírgula/ponto, converte só no blur.
- **Edição do treino:** antes adicionar exercício pela biblioteca não salvava → agora persiste em `gymflow:state:v1` e sobrevive a refresh (verificado no navegador).
- **Busca:** antes `triceps pulley` não achava nada → agora acha os 5 exercícios de tríceps na polia (sem acento, por apelido).
- **Status bar:** antes o logo GYMFLOWAI encostava/cortava no topo do APK → agora o header reserva a safe-area (no web `env()=0`, sem regressão).

### Arquivos alterados

- `src/lib/numericInput.ts` + `.test.ts` — **novos**: `normalizeNumericInput`/`parseNumericInput`.
- `src/components/ui/NumericInput.tsx` — **novo**: input controlado com string de rascunho, commit no blur (`type="text"` + `inputMode`).
- `src/lib/exerciseSearch.ts` + `.test.ts` — **novos**: `normalizeText` (sem acento) + `matchesExerciseSearch` (tokens/apelidos/stopwords).
- `src/providers/GymFlowContext.tsx` — `XpNotification` (id/kind/count), `pushXpNotification` (limite + consolidação), `dismissXpNotification`; `updateWorkoutSet` reescrito imutável; novos `addSetToActiveExercise`/`removeSetFromActiveExercise`/`addExerciseToActiveWorkout`/`removeExerciseFromActiveWorkout`.
- `src/components/XPBadgeNotification.tsx` — reescrito: cap 2, auto-dismiss por card, X + swipe, texto consolidado.
- `src/modules/ActiveWorkoutPage.tsx` — `NumericInput` na carga/reps/RPE; ações de série/exercício via contexto; botão + modal "Adicionar Exercício" (busca com apelidos); botão remover exercício.
- `src/modules/ExerciseLibrary.tsx` — busca por `matchesExerciseSearch`; `handleAddToWorkout` usa `addExerciseToActiveWorkout` (fim do bug de mutação).
- `src/modules/WorkoutBuilder.tsx` — `NumericInput` nos campos (séries, reps, RPE, descanso, incremento, tempo alvo).
- `src/mock/exercises.ts` — novo `triceps_maquina` (Extensão de Tríceps na Máquina, `images: []` = fallback honesto); mapa `SEARCH_TERMS` de apelidos aplicado no build.
- `src/mock/exercises.test.ts` — teste de imagem aceita exercícios sem foto (lista fixada em `['triceps_maquina']`).
- `src/types/index.ts` — `Exercise.searchTerms?`.
- `src/components/Navigation.tsx`, `src/modules/LandingPage.tsx` — `paddingTop: calc(... + env(safe-area-inset-top))` no header.

### Exercícios: aliases criados + 1 novo

- **Novo:** `triceps_maquina` — "Extensão de Tríceps na Máquina" (sem foto ainda; fallback honesto).
- **Aliases** (busca): tríceps polia → `pulley`; `triceps_coice` → `kickback`; `back_remada_maquina` → `remada articulada`/`remada sentada`; `back_remada_baixa` → `remada baixa`/`low row`; `back_puxada_pulley`/`_supinada`/`_fechada`/`_triangulo` → `puxada alta`/`pulldown`. Os demais citados (francês, testa, serrote, curvada, pulldown braço reto) já eram achados por nome após a busca ficar sem acento.

### Validações executadas

1. `npx vitest run` — 56 testes, 5 arquivos, todos passam (inclui `numericInput`, `exerciseSearch`, `exercises` atualizado).
2. `npx tsc --noEmit` — sem erros.
3. `npm run build` (web) — sucesso.
4. `npm run build:mobile` (export estático) — sucesso.
5. `npm run cap:sync` — assets copiados para `android/` (APK pronto para regerar).
6. `rg -n "alert\(|confirm\("` em `src` — nenhuma ocorrência.
7. **Verificação no navegador** (dev server): `080`→`80`, campo vazio não vira 0, `2,5`→`2.5`; 3 séries seguidas → um card "3 séries concluídas +30 XP" com botão fechar; busca `triceps pulley` → 5 resultados; exercício adicionado persiste no `localStorage` e sobrevive ao refresh; zero erros no console.

### APK

`npm run cap:sync` sincronizou os assets web atualizados para o projeto Android. Nenhum arquivo nativo (`android/`) foi editado — o fix de safe-area é 100% CSS —, então o build nativo é idêntico ao do GOAL-12. A regeneração do APK instalável é `npm run android:build` (Gradle). O efeito da safe-area no APK não foi validado em dispositivo real neste ambiente.

### Confirmação de escopo

Nenhuma imagem ou vídeo novo foi gerado. Backend, Supabase, Prisma, pagamento/Stripe, LGPD, autenticação real, Avatar Lab, Motion Engine, GLBs, POC 3D e lote 2 de imagens não foram tocados. Único ajuste "mobile" foi CSS de safe-area (sem plugin novo, sem editar `android/`).
## GOAL-17A — Persistência v1 segura, migrações, backup e export/import (2026-07-16)

### Resumo

A persistência `gymflow:state:v1` agora distingue load válido, vazio, legado, corrompido, versão incompatível e storage indisponível. O envelope `{ v: 1, savedAt, data }` foi preservado; saves criam backup rolante do último envelope válido, fazem readback exato e retornam erro discriminado em vez de engolir falhas.

### Recuperação e compatibilidade

- JSON corrompido/versão desconhecida permanece na chave principal, recebe uma única quarentena e bloqueia autosave até confirmação explícita.
- Migração de `gymflow_user`/`gymflow_weeklyPlan` lê e valida antes, salva/relê o v1 e só então remove as origens; é idempotente e mantém tudo se a escrita falhar.
- Hidratação usa presença/shape, não `length > 0`; arrays vazios, treino ativo, timestamps de timer, histórico, favoritos e programas personalizados atravessam roundtrip.
- Debounce de 500 ms continua; `pagehide` e aba oculta fazem flush síncrono sem salvar quando o storage está bloqueado.
- Export/import offline usa JSON validado, limite de 5 MiB, preview e `ConfirmDialog`; import só troca o estado após confirmação e commit verificado.
- `AdminPanel.tsx` recebeu a gestão mínima de dados locais e `StorageRecoveryNotice.tsx` mantém falhas críticas visíveis globalmente.

### Validação do incremento

- `npx vitest run`: 9 arquivos, 88 testes, todos verdes (56 anteriores + 32 novos).
- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado no Next.js 16.2.6.
- `npm run build:mobile`: export estático aprovado, sem tocar em `android/**`.
- `rg -n "alert\(|confirm\(" src`: nenhuma ocorrência.
- Benchmark com 1.000 iterações: fixture pesada 659.858 bytes; save/readback mediana 8,4356 ms, p95 13,3922 ms.
- Teste no navegador carregou a landing hidratada e sem erro de console, mas a interação não pôde ser validada nesta execução porque o dev server bloqueou HMR para `127.0.0.1` (origin fora de `allowedDevOrigins`). Os fluxos de storage permanecem cobertos deterministicamente pelos testes; `next.config.ts` não foi alterado por estar fora da allowlist.
- Decisão: manter `localStorage`; reavaliar particionamento/IndexedDB no GOAL-17B após o GOAL-23A.
- Nenhuma dependência, IndexedDB, backend ou shape do domínio de treino foi introduzido.

---

## GOAL-18A — Fundação de taxonomia muscular, padrões e equipamentos (2026-07-16)

### Pré-flight e inventário inicial

- Base: `master` em `8fd10352413c1ddcee2528f5708709ae920b7bf8`; único WIP era `.claude/settings.local.json`, preservado e não staged.
- Catálogo: 126 exercícios, 12 valores de `muscleGroup`, 10 valores usados em `secondaryMuscles`, 72 strings distintas de `equipment` e níveis `beginner` (73), `intermediate` (44), `advanced` (9), sem `athlete` no seed.
- Busca: 35 ocorrências de `searchTerms`, 23 termos distintos. Substituições: 256 referências/110 IDs distintos, zero inválida. Programas: 12 seeds/99 referências, zero inválida.
- Nomes: um duplicado exato (`biceps_rosca_direta` e `biceps_rosca_w`, ambos “Rosca Direta com Barra W”); pares semanticamente próximos documentados para GOAL-33A, inclusive os dois Leg Press 45°.
- Baseline confirmado: 9 arquivos/88 testes do GOAL-17A.

### Fundação criada

- 20 grupos musculares canônicos, com labels PT-BR, aliases, categoria e ordem. `legs -> legs_general` e `abs -> core`; nenhuma inferência detalhada foi aplicada ao catálogo.
- 25 padrões de movimento, com descrição, categoria e aliases; mecânica, lateralidade e posição corporal tipadas.
- 13 categorias operacionais. Bancos, racks, barras, halteres e kettlebells foram tratados como equipamentos específicos.
- Registry com 82 equipamentos e 106 aliases, cobrindo aparelhos reais informados pelo Founder e declarando status/tipo de carga.
- Normalização determinística de acento, caixa, espaços, hífen, barra, pontuação e grau, preservando números.
- Mapa explícito das 72 strings raw para um ou mais IDs: 72 resolvidas, zero `unresolved`; 17 casos `generic` mantêm warning para curadoria. A equivalência `Polia (Crossover)`/`Polia / Crossover` é deliberada e validada.
- Resolvers são puros, tipados e sem React/localStorage. Lookup canônico é exato; busca parcial não vira fuzzy matching.

### Compatibilidade

`Exercise` recebeu somente campos opcionais: `primaryMuscleGroupId`, `secondaryMuscleGroupIds`, `movementPatternIds`, `equipmentIds`, `mechanics`, `laterality` e `bodyPosition`. Os campos raw e o carregamento atual foram preservados.

Nenhum dos 126 exercícios foi reclassificado; nenhum exercício foi adicionado; `src/mock/exercises.ts`, programas, UI, Treino Ativo, Construtor, persistência, PWA, Android e assets ficaram intactos. Registry não significa que um aparelho já possui exercício.

### Arquivos

- Tipos: `src/types/training-taxonomy.ts`, `src/types/index.ts`.
- Domínio: `src/lib/training-taxonomy.ts`, `src/lib/equipment-registry.ts`, `src/lib/equipment-legacy-map.ts`.
- Testes: `src/lib/training-taxonomy.test.ts`, `src/lib/equipment-registry.test.ts`.
- Documentação: `docs/taxonomy/GYMFLOW_TRAINING_TAXONOMY.md`, `docs/DECISOES.md`, `docs/PENDENCIAS.md`, `docs/GOALS_LOG.md`.

### Validações

- `npx vitest run`: 11 arquivos, **158 testes** aprovados (88 anteriores + 70 novos).
- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado no Next.js 16.2.6.
- `npm run build:mobile`: export estático aprovado; Android build e `cap sync` não executados.
- Auditoria reproduzível: 126 exercícios, 72 raw, 82 equipamentos, 106 aliases, 72 resolvidos, zero unresolved e zero colisão de alias; uma equivalência raw explicitamente aprovada.
- `rg -n "alert\(|confirm\(" src`: zero ocorrência.
- `git diff --check`: aprovado.

### Continuação

Próximo incremento recomendado: **GOAL-21 — Perfil de treino e retorno aos treinos**. GOAL-20, GOAL-24 e GOAL-33A não foram iniciados.

---

## GOAL-21 — Perfil de treino e retorno aos treinos (2026-07-16)

### Modelo e regras

- Experiência e continuidade passaram a ser dimensões independentes: `beginner`, `intermediate`, `advanced` e `athlete` descrevem experiência; `active` e `returning` descrevem o momento atual.
- “Personal Trainer” continua sendo profissão, não nível. `athlete` é exibido como “Atleta / Alta performance”.
- O contexto de retorno aceita pausa aproximada, data civil opcional, nível anterior opcional e observações livres não médicas. Anos de experiência também são opcionais e não promovem/rebaixam o nível automaticamente.
- Perfis antigos sem `trainingStatus` são resolvidos como `active`; o envelope `gymflow:state:v1` e o formato de export/import não mudaram.
- O caso real anonimizado — intermediário, 7 anos, retorno após 3–6 meses, hipertrofia, 5 dias e 75 minutos — permanece “Intermediário em retorno”. Nenhuma prescrição, série, repetição, volume, exercício ou programa é alterado neste incremento.

### Produto e integração

- O onboarding agora explica e coleta experiência + continuidade sem mandar quem retorna para iniciante.
- A seção existente de configurações em Evolução permite revisar e salvar o mesmo perfil depois; alternar para ativo oculta, mas preserva, os detalhes de retorno.
- Um summary compartilhado apresenta labels compostos como “Intermediário em retorno” e deixa explícito que o contexto só poderá orientar adaptações futuras.
- A integração no contexto adiciona apenas os novos campos opcionais ao cadastro; autosave, hidratação, backup e import/export continuam usando a persistência v1 existente.

### Arquivos

- Tipos e domínio: `src/types/training-profile.ts`, `src/types/index.ts`, `src/lib/training-profile.ts`.
- Componentes: `src/components/TrainingProfileSelector.tsx`, `src/components/TrainingProfileSummary.tsx`.
- Superfícies: `src/modules/OnboardingFlow.tsx`, `src/modules/EvolutionDashboard.tsx`.
- Integração mínima: `src/providers/GymFlowContext.tsx`.
- Testes e documentação: `src/lib/training-profile.test.ts`, `docs/profile/GYMFLOW_TRAINING_PROFILE.md`, `docs/DECISOES.md`, `docs/PENDENCIAS.md`, `docs/GOALS_LOG.md`.

### Validações

- `npx vitest run`: 12 arquivos, **183 testes** aprovados (158 anteriores + 25 novos).
- `npx tsc --noEmit`: aprovado.
- ESLint focado nos tipos, domínio, testes, componentes e duas superfícies: aprovado, com um aviso preexistente de `<img>` em Evolução; o arquivo legado do contexto mantém débitos de lint fora das três linhas deste incremento.
- `npm run build`: aprovado no Next.js 16.2.6.
- `npm run build:mobile`: export estático aprovado; Android build e `cap sync` não executados.
- Navegador: perfil legado abriu como “Intermediário”; retorno 3–6 meses com 7 anos virou “Intermediário em retorno” e sobreviveu à recarga; alternar ativo/retorno ocultou e restaurou os detalhes; exportação pela UI confirmou backup de 14.940 bytes; zero erros no console.
- O upload do arquivo de importação não foi automatizado pelo controlador do navegador. O roundtrip export/import do envelope v1, incluindo perfil e invariância de programas, treino ativo e histórico, foi validado deterministicamente no teste de domínio.
- `rg -n "alert\(|confirm\(" src`: zero ocorrência.
- `git diff --check`: aprovado.

### Continuação

Próximo incremento recomendado: **GOAL-22**. Adaptação real de treino, progressão e curadoria de exercícios/programas não foram iniciadas.

---

## GOAL-22 — Motor de volume, frequência e duração (2026-07-16)

### Pré-flight e escopo

- Base confirmada: `master` em `404209d9b731c59f566edf96c9e21c6d83da036d`; baseline de 12 arquivos/183 testes aprovado.
- Único WIP: `.claude/settings.local.json`, preservado e fora do stage.
- Trabalho mantido no worktree principal porque nenhum arquivo permitido estava em conflito.
- Sem UI nova: cenários foram exercitados por domínio, testes e harness; Construtor, Context, programas, catálogo, progressão e storage não foram editados.

### Motores e regras

- Faixas semanais configuráveis por experiência e classe muscular, sempre chamadas de referência/alvo inicial/limite de cautela.
- Atleta começa com a mesma faixa de avançado; retorno preserva o nível e aplica fator heurístico conforme a pausa somente à referência.
- Volume planejado separa séries diretas, exposição secundária ponderada em 0,5, aquecimento e séries não classificadas. `legs_general` continua genérico.
- Duração detalhada separa trabalho, descanso entre séries, setup, transição e aquecimento; usa reps, mecânica, lateralidade e equipamentos quando disponíveis.
- API `estimateWorkoutDuration` permanece com shape e fórmula legados para todos os consumidores atuais.
- Capacidade de sessão estima séries/exercícios que cabem em 30/45/60/75/90 min sem escolher exercícios.
- Assessment retorna `fits`, `tight`, `exceeds_time`, `low_volume`, `high_volume` ou `insufficient_data`, com reasons, warnings, confidence e sugestões não aplicadas.

### Harness real anonimizado

- 4 costas + 4 bíceps, 4 séries, 8–12 reps: 32 séries preservadas; 74 min centrais (bounds 60–93), sendo 22 min de trabalho, 39 de descanso, 7 de transição e 6 de setup; `exceeds_time` para 60 min.
- 4 costas + 5 bíceps: 36 séries preservadas; 82 min centrais (bounds 66–104), com 24 min de trabalho, 43 de descanso, 8 de transição e 7 de setup; `exceeds_time` para 75 min.
- Nenhum exercício/série foi removido; alternativas permaneceram textuais.

### Arquivos

- Tipos: `src/types/training-volume.ts`, `src/types/index.ts`.
- Regras/motores: `src/lib/training-volume-rules.ts`, `src/lib/training-volume.ts`, `src/lib/workoutDuration.ts`, `src/lib/training-plan-assessment.ts`, `src/lib/volumeProfiles.ts`.
- Testes: `src/lib/training-volume.test.ts`, `src/lib/workoutDuration.test.ts`, `src/lib/training-plan-assessment.test.ts`.
- Documentação: `docs/training/GYMFLOW_VOLUME_AND_DURATION_ENGINE.md`, `docs/DECISOES.md`, `docs/PENDENCIAS.md`, `docs/GOALS_LOG.md`.

### Validações

- `npx vitest run`: 15 arquivos, **252 testes** aprovados (183 anteriores + 69 novos).
- `npx tsc --noEmit`: aprovado.
- ESLint focado em todos os arquivos TypeScript alterados/novos: zero erros e zero warnings.
- `npm run build`: aprovado no Next.js 16.2.6.
- `npm run build:mobile`: export estático aprovado; `cap:sync` e Android build não executados.
- Harness substituiu teste manual porque não houve UI. Matriz de capacidade e cenários de 32/36 séries foram executados deterministicamente.
- Hashes de programas, exercícios, progressão, storage, Context e WorkoutBuilder permaneceram idênticos ao pré-flight.
- `rg -n "alert\(|confirm\(" src`: zero ocorrência.
- `git diff --check`: aprovado.

### Gate G2 — proposta, não aprovação

A proposta inclui faixas, fatores de retorno, peso 0,5 de sinergistas, fórmula de duração, defaults de descanso/setup/transição, atleta igual a avançado, política para dados incompletos e catálogo de sugestões. Todos exigem revisão profissional e aprovação explícita do Founder.

Próximo passo: **revisão e aprovação do Gate G2 pelo Founder**. Somente depois iniciar **GOAL-19A**; ele não foi iniciado neste incremento.

---

## GOAL-TF-A — Tempo disponível canônico, perfil recomendado e time-fit (2026-07-19)

### Pré-flight e isolamento

- Base exata `06684ee3a2b6950dcdd72c44d9fef03d6f2b8a6a`, branch de origem `feat/gymflow-goal19b-guided-builder`.
- O único untracked aceito no repositório principal foi `.claude/settings.local.json`; não havia modificação rastreada, stage ou stash.
- Trabalho executado somente no worktree `C:\Projetos\gymflow-goal-tf-a`, branch `feat/gymflow-tf-goalA-tempo-canonico`.
- Baseline aprovado: 27 arquivos, 513 testes; TypeScript aprovado. O documento físico ausente do Fable não foi recriado nem inventado; o comando e o complemento contratual foram usados como fonte autorizada.

### Entrega

- `ProgramDay.targetMinutes` passou a ser a fonte canônica em todos os call-sites autorizados de abertura do Construtor, com fallback para duração do usuário e default do perfil.
- Novo domínio puro implementa recomendação de perfil, análise de divergência, faixa recomendada de exercícios e comparação time-fit com tolerância de ±5 min.
- `buildDurationWarning` foi deprecado documentalmente e delega ao novo domínio, preservando string e comportamento positivos/finitos.
- O Construtor deriva as análises por dia após a normalização de abertura; a assinatura salva nasce do draft já normalizado.
- O campo de tempo mantém rascunho visual separado do commit; badge, aviso e resumo são textuais e nunca alteram slots automaticamente.
- Storage v1, migrações, shape de `ProgramDay`, seeds, progressão, treino ativo e histórico não foram alterados.

### Validações

- `npx vitest run`: 28 arquivos, **554 testes** aprovados (513 anteriores + 41 novos).
- `npx tsc --noEmit`: aprovado.
- ESLint nos arquivos TypeScript/TSX tocados: zero erros e zero warnings novos. Permanecem somente os três warnings preexistentes do Context nas linhas 859, 870 e 908, fora do trecho alterado.
- `npm run build`: aprovado no Next.js 16.2.6/Turbopack. O junction temporário de dependências do worktree foi substituído por cópia física ignorada das dependências já instaladas; nenhuma dependência foi instalada ou alterada.
- `git diff --check`: aprovado; busca por `targetMinutes: estimateWorkoutDuration` em `src` retornou zero ocorrência.
- Todos os hashes protegidos de exercícios, programas, progressão e `storage*.ts` permaneceram idênticos ao pré-flight.
- QA visual: Costas + Bíceps, dois exercícios, alvo 60/Padrão, diferença de aproximadamente 46 min, faixa 55–65 e recomendação 5–7; rascunho 17 removeu o destaque dos presets; Alto Volume + 60 exibiu divergência sem mudar slots; viewport 360 px sem overflow horizontal; zero erros no console.
- Nenhum push ou merge foi feito; o GOAL B não foi iniciado.

### Continuação

- Recalibrar as heurísticas somente após evidência de uso real e revisão profissional, em GOAL explícito posterior.

---

## GOAL-TF-B — Picker por foco do dia (2026-07-19)

### Pré-flight e isolamento

- Base exata `b0ddfef57f14a4de7e776f328b16af135f129d56`, coincidente com `master` pós-GOAL A e `origin/master`.
- Trabalho executado somente no worktree `C:\Projetos\gymflow-goal-tf-b`, branch `feat/gymflow-tf-goalB-picker-foco`.
- Baseline aprovado: 28 arquivos, 554 testes; TypeScript aprovado. Hashes SHA-256 de exercícios, programas, progressão e `storage*.ts` registrados antes das alterações.
- O MASTERPLAN físico permanecia ausente, como já registrado no GOAL A; o comando e os contratos 2.5–2.6 fornecidos foram tratados como fonte autorizada, sem redecidir o ADR-TF-004.

### Entrega

- Novo domínio `workout-picker.ts` normaliza focos pela taxonomia e agrupa exercícios por foco, preservando `ExerciseFocusMatch` por item e a ordem de entrada da biblioteca.
- `filterExercisesByDayFocus` mantém a assinatura pública e delega ao novo domínio; `matchesDayFocus` não foi alterado.
- O modal ganhou chips por foco + `Todos`, primeira aba no primeiro foco, busca persistente entre abas, limpeza independente e reset de busca/aba ao reabrir.
- Tablist acessível com roving `tabIndex`, setas, Home/End, associação aba/painel e scroll/snap horizontal no mobile.
- O rodapé mostra contadores por foco derivados dos mesmos grupos da lista; selecionar exercício continua sem fechar o modal.
- Um foco produz `[Foco, Todos]`; sem foco, a biblioteca inteira mantém o comportamento anterior de `Todos`.

### Validações

- `npx vitest run`: 29 arquivos, **569 testes** aprovados (554 anteriores + 15 novos).
- `npx tsc --noEmit`: aprovado.
- ESLint nos quatro arquivos TypeScript/TSX tocados: zero erros e zero warnings.
- `npm run build`: aprovado no Next.js 16.2.6/Turbopack.
- `git diff --check`: aprovado.
- Todos os hashes protegidos de exercícios, programas, progressão e `storage*.ts` permaneceram idênticos ao pré-flight.
- QA no navegador: 0/1/2/3 focos; ordem taxonômica; `Todos`; busca por aba; limpar sem trocar; reset ao reabrir; setas; seleção sem fechar; contadores; zero erros de console.
- QA 360 px: scroll horizontal real (`331 > 281`) com `overflow-x: auto` e snap; documento sem overflow. O overlay passou a `z-[100]` após o QA no navegador revelar que o CTA global `Treinar` cobria os contadores; a correção foi revalidada visualmente.
- Somente os arquivos autorizados e documentação foram tocados; `handleAddExercise`, seeds, storage, progressão e treino ativo permaneceram intocados.
- Nenhum push ou merge foi feito; o GOAL C não foi iniciado.

### Corretivo P2 pós-auditoria (2026-07-19)

- Dias sem foco passaram a renderizar explicitamente a tablist com a única aba `Todos`, selecionada, focável e associada ao tabpanel da biblioteca completa.
- O overlay do picker passou a reservar `calc(1rem + env(safe-area-inset-bottom))`, sem alterar `Navigation`, CTA global, shell ou estilos globais.
- A cobertura ganhou testes explícitos para três focos em ordem não canônica, `Todos` ao final, contadores equivalentes e imutabilidade profunda das entradas.
- QA em 360 × 800 e 390 × 844 confirmou rodapé acessível, lista rolável, 16 px de fallback com inset zero, expressão `env(...)` presente, overlay z-100 bloqueando o CTA z-50 e zero overflow/erro/warning. Não houve simulação real de notch.
- Continuam registrados como riscos P3 a ausência de teste DOM automatizado nesta fase e a dependência circular entre `workout-builder.ts` e `workout-picker.ts`; ambos ficaram fora deste corretivo, com testes, tipos e build verdes.
- Somente os quatro arquivos autorizados do corretivo foram alterados; não houve push, alteração na `master` nem início do GOAL C.

### Continuação

- Curadoria anatômica do catálogo legado e qualquer ranking/sugestão permanecem fora deste GOAL.

---

## GOAL-TF-C — Badges e agrupamento por papel no picker (2026-07-19)

### Pré-flight e isolamento

- Base exata `e52f60f49cf0b0b1102ae5a31624bb1b3a952026`, coincidente com `origin/master` pós-GOAL B; branch `feat/gymflow-tf-goalC-badges-legado`.
- O untracked preexistente `.claude/settings.local.json` foi preservado e permaneceu fora do stage.
- Baseline aprovado: 29 arquivos, 569 testes; TypeScript aprovado. Hashes SHA-256 de exercícios, programas e `storage.ts` foram registrados antes das alterações.
- Os ADRs TF-004/TF-005 aceitos e o comando do GOAL foram consumidos como contrato; nenhuma taxonomia ou classificação nova foi criada.

### Entrega

- O domínio do picker ganhou partição determinística por papel: Principais → Sinergistas → Classificação legada, preservando a ordem da biblioteca dentro de cada seção.
- Sinergistas é uma seção colapsada por padrão e expansível por aba, sem antecipar o toggle `[Principais|Incluindo sinergistas]`.
- `legacy-generic` permanece visível e separado, com “Revise o grupo antes de adicionar”; o banner agregado anterior continua como resumo.
- Cada item mostra grupo principal resolvido, equipamento raw e badge Legado quando `match.legacy`; o `aria-label` anuncia nome, grupo e equipamento.
- Cabeçalhos de seção usam semântica de heading; disclosure, tabs e itens têm foco visível. O item foi extraído para `ExercisePickerItem.tsx` dentro da allowlist.
- A aba Todos continua completa e na ordem original, expondo o match primário/legado de cada item sem filtrar, pontuar ou sugerir.

### Validações

- `npx vitest run`: 29 arquivos, **572 testes** aprovados (569 anteriores + PART15 23–25).
- `npx tsc --noEmit`: aprovado.
- ESLint nos quatro arquivos TypeScript/TSX tocados: zero erros e zero warnings.
- `npm run build`: aprovado no Next.js 16.2.6/Turbopack.
- QA em 360 × 800: documento e diálogo sem overflow horizontal; oito badges longos com truncamento real; todos os itens inspecionados com nome, grupo e equipamento no nome acessível.
- Quadríceps mostrou 23 exercícios `legs_general` exclusivamente em Classificação legada, todos com badge Legado e aviso de revisão. Tríceps mostrou 11 Principais e 15 Sinergistas, esta última colapsada por padrão; Supino apareceu somente como sinergista.
- Setas entre tabs, foco visível e expansão do disclosure foram verificados; console sem erros ou warnings.
- Somente os arquivos autorizados e documentação foram alterados; hashes protegidos foram revalidados, `git diff --check` passou e `.claude/settings.local.json` permaneceu fora do stage.
- Nenhum push ou merge foi feito; o GOAL D não foi iniciado.

### Continuação

- Curadoria anatômica do legado, normalização de equipamento e o toggle de abrangência permanecem para GOALs explícitos posteriores.
- P1 confirmado por auditoria pós-GOAL C: a aba Todos exibia os 126 exercícios sob "Principais (126)" sem foco ativo. Corrigido em `GYMFLOW-BUILDER-TF-GOAL-C-TODOS-FLAT-CORRECTIVE-004` (a seguir).

---

## GOAL-TF-C-CORRECTIVE-004 — Todos sem agrupamento por papel (2026-07-20)

### Pré-flight e isolamento

- Worktree `C:\Projetos\gymflow-goal-tf-c`, branch `feat/gymflow-tf-goalC-badges-legado`, HEAD `d9de0aa9ded825fdd82664af0ff4c48aa7efe903` sobre `e52f60f49cf0b0b1102ae5a31624bb1b3a952026` (= `origin/master`). Working tree limpa, sem staged, sem stash.
- Baseline aprovado: 29 arquivos, 572 testes; `npx tsc --noEmit` aprovado.

### P1 corrigido

- Sintoma: na aba Todos, os 126 exercícios apareciam sob "Principais (126)" mesmo sem foco muscular ativo, em 360 px, desktop e após troca de abas.
- Causa: `resolveAllExercisesMatch` (em `workout-picker.ts`) sintetizava um foco a partir do próprio grupo principal de cada exercício e chamava `matchesDayFocus` com esse foco fabricado, fazendo todo item entrar na seção `primary`. Sem foco ativo não existe base semântica para papel muscular.
- Correção: `getWorkoutPickerTabResult` agora devolve uma união discriminada — `WorkoutPickerGroupedTabResult` (`mode: 'grouped'`, com seções) para abas de foco reais, e `WorkoutPickerFlatTabResult` (`mode: 'flat'`, `items: Exercise[]`) para `ALL_EXERCISES_TAB_ID`. `resolveAllExercisesMatch` foi removida. `ExercisePickerModal` renderiza `tabResult.items` diretamente para o modo `flat`, sem seção, cabeçalho ou badge de grupo/legado. `ExercisePickerItem` passou a receber `exercise` + `focusRole` opcional (ausente em Todos, presente em abas de foco com grupo + legado).

### Entrega

- Abas de foco continuam idênticas: Principais → Sinergistas → Classificação legada, badges, disclosure, aviso de revisão e `aria-label` inalterados — apenas atrás de `tabResult.mode === 'grouped'`.
- Aba Todos: lista plana da biblioteca filtrada, ordem original, sem seção/heading/badge de grupo/badge Legado; equipamento raw, nome, "No treino ×N", "Adicionar novamente" e "Já está no {dia}" preservados; `onAdd(exercise)` continua a única inclusão.
- `handleAddExercise`, `matchesDayFocus`, storage, seeds, progressão, `Navigation` e o toggle de abrangência não foram tocados.

### Validações

- `npx vitest run`: 29 arquivos, **578 testes** (572 + 6 novos em `GYMFLOW-BUILDER-TF-GOAL-C-TODOS-FLAT-CORRECTIVE-004 / P1`), zero falha.
- `npx tsc --noEmit`: aprovado. ESLint nos 3 arquivos tocados: aprovado. `npm run build`: aprovado no Next.js 16.2.6. `git diff --check`: aprovado.
- QA de Todos e abas de foco feita por rastreamento estrutural do código e pela suíte de testes; a extensão do Chrome não estava disponível neste ambiente para uma sessão de navegador ao vivo, então nenhuma medição de pixel foi refeita nesta rodada (diferente da QA original do GOAL C, que teve sessão de navegador real).
- P3 fonte de 8 px, P3 ausência de teste DOM automatizado e P3 dependência circular `workout-builder.ts → workout-picker.ts` permanecem sem alteração — não ampliados, não corrigidos nesta tarefa.
- Somente os 3 arquivos de código autorizados (`ExercisePickerModal.tsx`, `workout-picker.ts`, `workout-picker.test.ts`) e a documentação já tocada pelo GOAL C foram alterados. Nenhum push, merge, rebase ou cherry-pick. GOAL D não foi iniciado.

---

## GOAL-TF-E — Separar nome de programa e nome de dia na entrada legada (2026-07-20)

### Pré-flight e isolamento

- Base exata `17b5d33117015e8646a081cc693f67733ee12352` (master pós-GOAL D), branch `feat/gymflow-tf-goalE-nomes`.
- A primeira tentativa nasceu sobre base incorreta (`b0ddfef57f14a4de7e776f328b16af135f129d56`, master pós-GOAL A); a recuperação `GYMFLOW-BUILDER-TF-GOAL-E-REBASE-AND-WORKTREE-RECOVERY-002` preservou o commit original em `backup/gymflow-tf-goalE-wrong-base-7f1895f` e reaplicou exclusivamente o delta do GOAL E sobre `17b5d331`, com B/C/D já integrados em `origin/master`. Trabalho no worktree dedicado `C:\Projetos\gymflow-goal-tf-e`, sem push.
- O documento físico do ADR-TF-007 (PART 10 / PART 15) não existe no repositório; o enunciado do GOAL e o QA MANUAL foram usados como fonte autorizada, sem inventar texto ou numeração ausentes.

### Comportamento — antes/depois (crítico)

- **ANTES:** editar um dia de um programa **sugerido** (caminho legado de `createInitialDraft`, que gera um custom novo) nomeava o programa novo com o nome do **DIA**. QA real: "Dia A — Peito e Tríceps" do programa "ABC Hipertrofia Masculino" abria o Construtor com **NOME DO PROGRAMA = "Dia A — Peito e Tríceps"**.
- **DEPOIS:** o programa novo herda o nome do **PROGRAMA** de origem. Mesmo fluxo abre com **NOME DO PROGRAMA = "ABC Hipertrofia Masculino"**, e "Dia A — Peito e Tríceps" é preservado como `customName` do Dia 1. Sem `sourceProgramName`, cai em `DEFAULT_PROGRAM_NAME` ("Meu Treino") — nunca no nome do dia.

### Entrega

- `WorkoutBuilderDraft` ganhou o campo aditivo e opcional `sourceProgramName` (nome do PROGRAMA), separado de `name` (nome do DIA).
- `createInitialDraft` (caminho legado) passou a nomear o programa por `sourceProgramName` aparado `|| DEFAULT_PROGRAM_NAME`, sem promover o nome do dia; a preservação de `legacy.name` como `customName` do Dia 1 continua intacta.
- Os 6 call-sites que montam draft passam o nome do programa de origem: `Dashboard`, `PlannerView`, `WorkoutsTab` (editar programa e editar dia), `ActiveWorkoutPage` e `GymFlowContext.createProgramFromBase`.
- `createInitialDraft` foi exportada para teste unitário direto (a função é pura e importa limpa no vitest em ambiente node).

### Validações

- `npx vitest run`: 30 arquivos, **600 testes** aprovados (588 anteriores pós-GOAL D + 12 novos: 7 regras de separação de nome, preservação de nível/tempo, clonagem de slots, guarda de programa de origem, roundtrip `name===autoName` sem `customName` e caso A4 irreproduzível).
- `npm run build`: aprovado no Next.js 16.2.6/Turbopack; TypeScript aprovado.
- ESLint nos arquivos tocados: zero erros e zero warnings novos. Permanecem apenas os três warnings preexistentes do Context (linhas 859/870/908), fora dos trechos alterados.
- QA MANUAL no app rodando (login demo, programa sugerido "ABC Hipertrofia Masculino"): (1) editar "Dia A — Peito e Tríceps" → NOME DO PROGRAMA = "ABC Hipertrofia Masculino", NOME DO DIA = "Dia A — Peito e Tríceps"; (2) trocar foco do dia para Ombros → nome do programa inalterado (o autoName do dia acompanha o foco, o `customName` e o nome do programa não); (3) salvar → aparece em "Meus Treinos" como "ABC Hipertrofia Masculino"; reabrir → nomes idênticos.
- Guardrails intactos: `resolveWorkoutDayName`, `generateWorkoutDayAutoName` e a heurística de `customName` em `normalizeDay` não foram alterados; nenhuma migração de storage, seed ou renome de programa salvo. Sem push; GOAL F não iniciado.

### Continuação

- A pendência do GOAL-10.5 (reeditar o mesmo dia sugerido cria cópias novas a cada sessão) permanece fora de escopo e segue em PENDENCIAS; este GOAL só corrige o nome, não a deduplicação de cópias.

---

## GOAL-23A — fundação do domínio de sessão (2026-07-21)

Separação de plano da sessão, sessão ativa e registro final; origem planejada ×
estado real de execução; status `active/completed/partial/abandoned`. Mudança
aditiva e compatível — sem backend, sem Supabase, sem alterar o storage v1.
Base: `origin/master` = `ee843c2e50e837fc8860a1c5d4a629a8888f24c1`. Worktree
dedicado `C:\Projetos\gymflow-goal-23a`, branch
`feat/gymflow-goal23a-session-domain`. Ver
[docs/workouts/GYMFLOW_SESSION_DOMAIN.md](workouts/GYMFLOW_SESSION_DOMAIN.md).

### O que mudou

- Tipos novos (`src/types/workout-session.ts`): `WorkoutSessionStatus`,
  `WorkoutExerciseEntryOrigin`, `WorkoutExerciseEntryStatus`, `SessionPlanEntry`,
  `SessionPlan`, `ActiveSession`, `SessionLog`. Campos **opcionais** em
  `WorkoutSession` (`status`/`startedAt`/`endedAt`) e `ActiveExercise`
  (`plannedSlotIndex`/`plannedExerciseId`/`entryOrigin`/`entryStatus`).
  `WorkoutSet` intacto.
- Domínio puro (`src/lib/workout-session-domain.ts`): `buildSessionPlan`,
  `startActiveSession`, `deriveSessionStatus`, `deriveExerciseEntryStatus`,
  `markEntrySwapped`, `finalizeSession`, `buildAbandonedSessionLog`.
- Normalização legada (`src/lib/workout-session-migration.ts`):
  `normalizeSessionState`, pura e idempotente.
- Integração cirúrgica no `GymFlowContext`: início (plano + sessão `active` +
  `startedAt`, exercícios `planned`), adicionar (`added`), substituir (`swapped`,
  `plannedExerciseId` preservado), finalização (via `finalizeSession`, status
  explícito no histórico), hidratação (normaliza antes de alimentar o estado).
- `EvolutionDashboard`: título "Últimos Treinos Concluídos" → "Últimas sessões de
  treino".

### Comportamento crítico — antes/depois

- **Histórico:** antes o registro final não tinha `status` nem `endedAt`; agora
  grava `status` explícito derivado das séries (completed/partial/abandoned) e
  `endedAt`. Histórico legado sem `status` → normalizado como `completed`.
- **Sessão ativa:** antes sem `status`/`startedAt` no objeto; agora `status:
  'active'` + `startedAt`. Sessão ativa legada → `status active` e `startedAt`
  vindo de `activeWorkoutStartedAt`.
- **Exercícios:** antes sem eixo de origem/execução; agora cada `ActiveExercise`
  carrega `entryOrigin` (planned/added/swapped) e, no registro final,
  `entryStatus` (performed/partial/skipped/planned).
- **Paridade preservada:** volume e PR seguem contando **apenas séries
  concluídas**; XP mantém a regra atual (`100 + concluídas*5 + (vol>5000?50:0)`);
  `finalizeSession` **recebe** esses valores prontos e não recalcula; a ordem dos
  efeitos (streak/achievements/challenges/post) é a mesma. `cancelWorkout`
  continua descartando sem histórico.

### Validações

- `npx vitest run`: **32 arquivos, 642 testes** aprovados (30 arquivos + 2 novos;
  600 anteriores + 42 novos: domínio + normalização/idempotência). Zero falha.
- `npx tsc --noEmit`: aprovado (0 erros).
- `npm run build` (web) e `npm run build:mobile`: ambos aprovados no
  Next.js 16.2.6/Turbopack; TypeScript aprovado nos dois.
- `npm run lint`: **12 erros + 6 warnings**, idêntico à baseline pré-GOAL
  (TF-F-13); **zero erro/warning novo**. Os arquivos tocados
  (`GymFlowContext.tsx`, `EvolutionDashboard.tsx` e os 6 novos) ficam limpos.
  Nota: uma primeira integração introduziu 1 erro `react-hooks/purity`
  (`Date.now()` em `finishWorkout`); resolvido derivando `endedAt =
  startedAt + duração_decorrida`, sem leitura de relógio.
- `git diff --check`: limpo.
- **Paridade provada por teste:** volume/PR/XP recebidos e gravados sem recálculo;
  finalização imutável; snapshot com séries incompletas; retomada de sessão ativa
  e histórico legado por `normalizeSessionState`; storage v1 e
  `activeWorkoutStartedAt` intactos.

### QA MANUAL

Executada no app rodando a partir do WORKTREE (`npm run dev` em
`C:\Projetos\gymflow-goal-23a`, porta 3005 — o preview gerenciado aponta para o
repositório principal, então o worktree foi servido à parte). Login demo →
programa "ABC Hipertrofia Masculino", "Dia B — Ombros". Estado inspecionado em
`localStorage['gymflow:state:v1']`.

- **Início:** `activeWorkout.status = 'active'`, `startedAt` presente e igual a
  `activeWorkoutStartedAt`; 2 exercícios com `entryOrigin = 'planned'`,
  `entryStatus = 'planned'`, `plannedSlotIndex` 0/1, `plannedExerciseId`
  correto, `sourceProgramId/DayId` presentes. ✔
- **Finalizar parcial** (1 de 7 séries): histórico ganha 1 registro com
  `status = 'partial'`; `startedAt` preservado; `endedAt − startedAt = 301000ms =
  duration` (301s); `totalVolume = 80` (só a série concluída), `xpEarned = 105`
  (=100+1×5) → paridade de volume/XP confirmada; exercício 1 `entryStatus =
  'partial'` (1/3), exercício 2 `entryStatus = 'skipped'` (0/4) preservado no
  snapshot; `activeWorkout` volta a `null`. ✔
- **Refresh em sessão ativa:** recarregar retomou a tela "Sessão Ativa" com
  `status = 'active'` e `startedAt` intactos. ✔
- **Cancelar:** modal customizado "Cancelar treino atual?" (sem `confirm()`
  nativo); ao confirmar, `activeWorkout = null`, `activeWorkoutStartedAt = null` e
  o histórico permanece com 1 registro (a sessão cancelada NÃO foi gravada). ✔
- **Evolution:** o cabeçalho renderiza "Últimas sessões de treino" (título antigo
  ausente) e lista a sessão parcial. ✔
- **Não driven pela UI (cobertos por teste unitário):** finalização *completed* e
  *abandoned* (a *partial* exercitou a fiação de derivação de status/entryStatus);
  e o ponto de entrada de **sessão livre** pela biblioteca — o botão "Treinar" do
  detalhe do exercício não iniciou o treino via clique roteirizado nesta sessão;
  o caminho `free` está coberto por `buildSessionPlan`/`startActiveSession` nos
  testes. Screenshots do preview expiravam (renderer pesado); a verificação usou
  a árvore de acessibilidade + inspeção de estado, não capturas de tela.

### Continuação

- GOAL-23B e GOAL-24 **não iniciados**. Pendências registradas: id canônico do
  slot, visualização dos status, sessões abandonadas no histórico, motivo de
  substituição e séries/exercícios pulados na UI (ver PENDENCIAS 23A-01..07).

---

## GOAL-23B — Experiência visual da sessão (2026-07-22)

Camada de apresentação que consome o domínio do GOAL-23A e torna visíveis (sem
inventar dados) status da sessão, origem e execução de cada exercício, séries
concluídas/incompletas, exercícios pulados, notas e o detalhe completo da sessão.
**Não** altera finalização, cancelamento (continua descartando), Context, storage
v1 nem volume/PR/XP. Base: `origin/master` = `445de0ecabf5491174211dffdc2edc0a99b92cf8`
(= GOAL-23A). Worktree `C:\Projetos\gymflow-goal-23b`, branch
`feat/gymflow-goal23b-session-experience`.

### Entrega (dois commits)

- **Commit 1 — `feat(session): adicionar apresentacao e badges de sessao`:**
  `workout-session-view.ts` (helpers puros: labels/estilos de status/origem/execução,
  contagens, `buildSessionSummary`, fallbacks legados) + `workout-session-view.test.ts`
  (34 testes); `SessionBadges.tsx` (`SessionStatusBadge`/`ExerciseOriginBadge`/
  `ExerciseExecutionBadge`); badges no histórico (`EvolutionDashboard`) e no treino
  ativo (`ActiveWorkoutPage` — origem `added`/`swapped` + execução derivada ao vivo).
- **Commit 2 — `feat(session): adicionar detalhe e resumo visual da sessao`:**
  `SessionDetailModal.tsx` (nome/data/duração/status, exercícios com origem+execução,
  séries concluídas/incompletas, reps/peso/RPE, notas, volume/calorias/XP/PRs);
  integração do detalhe (card clicável + chave estável `sess.id`); prévia do status
  no resumo final (`buildSessionPreview` — completed/partial/abandoned + contagens);
  documentação (DECISOES, GOALS_LOG, PENDENCIAS, GYMFLOW_SESSION_DOMAIN).

### Decisões-chave

- Sessão ativa deriva execução ao vivo (`deriveExerciseEntryStatus` direto, não o
  `entryStatus` armazenado em `planned`); "Pulado" só após finalizar; prévia do
  resumo usa `buildSessionPreview` (ignora `status: 'active'`); detalhe é modal;
  origem destacada só se não-planejada. Ver `docs/DECISOES.md` (GOAL-23B) e
  `docs/workouts/GYMFLOW_SESSION_DOMAIN.md` (seção GOAL-23B).

### Validações

- `npx vitest run`: **33 arquivos, 676 testes** aprovados (642 anteriores + 34
  novos em `workout-session-view.test.ts`). Zero falha.
- `npx tsc --noEmit`: aprovado (0 erros).
- `npm run build` (web) e `npm run build:mobile`: aprovados no Next.js 16.2.6.
- `npm run lint`: **12 erros + 6 warnings**, idêntico à baseline pré-GOAL
  (TF-F-13); **zero erro/warning novo** — os arquivos tocados ficam limpos (o único
  warning em `EvolutionDashboard.tsx` é o `no-img-element` preexistente nas fotos de
  evolução, fora do trecho alterado).
- `git diff --check`: limpo.

### QA MANUAL

A matriz QA (badge completed/partial/abandoned, sessão legada sem status,
abertura/fechamento do detalhe, exercício skipped, séries incompletas, notas,
exercício added/swapped, prévia do status no resumo final, desktop e mobile) é
**coberta por testes puros + revisão de código**. A inspeção visual no navegador
não foi executada neste ambiente (sem navegador ativo); fica como pendência 23B-04.

### Continuação

- GOAL-24 **não iniciado**: motivo de substituição e diff avançado plano×execução
  seguem fora de escopo. Sessões abandonadas no histórico (23A-03/23B-03) seguem
  abertas. Ver PENDENCIAS 23B-01..05.

---

## GOAL-17B-002C corretivo 014 — três P1 da integração híbrida (2026-07-23)

Corrige os três P1 encontrados na revisão da integração do `workoutHistory`:
geração ausente/parcial hidratada como histórico vazio, perda de efeitos
persistentes após append confirmado e callbacks de finalização executados após
o unmount. Base: `origin/master` =
`5d2965008916ea951b7c6b537d4d427e84d9ba2d`. Worktree
`C:\Projetos\gymflow-goal-17b-context-integration`, branch
`feat/gymflow-goal17b-context-integration`. Os dois commits do 002C
(`8f89ad4`, `d837185`) foram preservados sem reescrita.

### Entrega (três commits corretivos)

- **Commit 3 — `fix(storage): verificar integridade fisica das geracoes` (P1-A):**
  `storage-history-integrity.ts` (serialização canônica extraída da migração +
  digest encadeado determinístico + `verifyHistoryGeneration`) e seu teste;
  store `generationManifests` com manifest durável por geração; banco interno na
  versão física 2 com upgrade idempotente; staging, replace e append gravando
  registros, digests, manifest e metadata na mesma transação; hidratação v2
  exigindo manifest confirmado.
- **Commit 4 — `fix(storage): tornar conclusao hibrida recuperavel` (P1-B/P1-C):**
  `storage-completion-receipt.ts` (helper puro `deriveWorkoutCompletion` +
  receipt + verificação) e seu teste; store `completionReceipts` e banco na
  versão física 3; `appendSessionWithCompletionReceipt` atômico;
  `commitCompletion`/`settleCompletion`/`retain` no runtime; recuperação de
  receipts pendentes antes de liberar o autosave; `finishWorkout` reescrito para
  aplicar os estados React a partir do snapshot já persistido; `mountedRef` e
  `pendingFinalizationPromiseRef` no Provider.
- **Commit 5 — `test(storage): cobrir provider e ciclo de vida hibridos`:**
  `GymFlowContext.storage.test.tsx` montando o `GymFlowProvider` real
  (`react-test-renderer` 19.2.4 como única dependência de desenvolvimento nova)
  e o registro final na documentação.

### Decisões-chave

Manifest verificado por geração (nunca só um marcador), digest encadeado do
registro mais antigo para o mais novo (append incremental de um passo),
`coreEnvelopeAfter` derivado por helper puro sem render React, snapshot
pós-conclusão como fonte de qualquer gravação do core até a liquidação do
receipt, e ciclo de vida com contagem de retenções no runtime. Ver
`docs/DECISOES.md` (GOAL-17B-002C corretivo P1-A e P1-B/P1-C) e
`docs/storage/GYMFLOW_STORAGE_V1_SAFE.md`.

### Cobertura real do Provider

`src/providers/GymFlowContext.storage.test.tsx` monta o Provider real (com
`ToastProvider`) sobre `fake-indexeddb` e um `localStorage` em memória, e cobre:
hidratação v2 válida, geração fisicamente ausente, perda parcial de registros,
manifest ausente, manifest divergente, geração vazia válida, append bem-sucedido,
append falhando, kill após append, XP/streak/weeklyPlan/desafios/conquistas
preservados após a recuperação, postagem recuperada sem duplicação no ciclo,
pagehide após a conclusão, finalização seguida de unmount, ausência de callbacks
após o unmount, Strict Mode (hidratação e conclusão únicas), bloqueios
administrativos via Context e operações antigas não sobrescrevendo o v2.

### Validações

- `npx vitest run`: **39 arquivos, 873 testes** aprovados (783 anteriores + 15
  de integridade + 22 de receipt + 6 de manifest no adapter + 6 de receipt no
  adapter + 2 de upgrade + 5 de hidratação bloqueada + 15 de conclusão
  recuperável + 16 do Provider real). Zero falha.
- `npx tsc --noEmit`: aprovado (0 erros).
- `npm run build` (web) e `npm run build:mobile`: aprovados no Next.js 16.2.6.
- `npm run lint`: **12 erros + 6 warnings**, idêntico à baseline pré-GOAL
  (TF-F-13); **zero erro/warning novo** nos arquivos alterados.
- `git diff --check`: limpo.

### Continuação

- GOAL-17B-002D **não iniciado**: import/export e rollback híbridos seguem fora
  de escopo. Validação em WebView físico continua gate obrigatório. Ver
  PENDENCIAS 17B-002C-C01..C05.

---

## GOAL-17B-002C corretivo 017 — recuperação pendente até novo boot (2026-07-23)

Corrige o **P2 17B-002C-C06** da auditoria final do corretivo 002C: depois de uma
falha na gravação do core de conclusão, o `pendingCompletionCore` continuava
ativo, mas uma gravação posterior bem-sucedida devolvia `storageHealth` para
`ready` enquanto o receipt seguia pendente — e as edições feitas pelo usuário
depois da falha não estavam sendo persistidas, embora o app as anunciasse como
salvas. Corrige também o comentário desatualizado de `recordDigests`. Base:
`origin/master` = `5d2965008916ea951b7c6b537d4d427e84d9ba2d`. Os seis commits
anteriores foram preservados sem reescrita (sexto = `84d82ae`).

### Entrega (um commit corretivo)

- **Commit 7 — `fix(storage): manter recuperacao pendente ate novo boot`:**
  `hasPendingCompletion()` e `flushPendingCompletionCore()` no runtime híbrido;
  `saveCore` recusando (`blocked`) enquanto houver conclusão pendente;
  `commitCompletion` recusando uma segunda conclusão por integridade;
  `completionRecoveryRequiredRef`/`markCompletionRecoveryRequired` no Provider,
  com autosave suspenso, `reportWriteResult` e `markHistoryCommitHealthy`
  impedidos de promover para `ready`, ciclo de vida gravando apenas o snapshot
  pendente e `finishWorkout` bloqueado; comentário de `recordDigests` corrigido.

### Comportamento crítico — antes/depois

- **Antes:** core falha → receipt pendente, mas qualquer `saveCore` posterior
  regravava o snapshot pós-conclusão e `reportWriteResult` marcava `ready`. O
  usuário via "salvo" enquanto suas edições posteriores não iam para lugar
  nenhum, e uma nova conclusão era tratada como recuperação.
- **Depois:** core falha → recuperação necessária pela montagem inteira. Autosave
  recusado, `storageHealth` preso em `write-error`, `pagehide`/
  `visibilitychange` gravando somente o `pendingCompletionCore` (sem liquidar o
  receipt nem limpar o estado pendente), `finishWorkout` recusado e uma mensagem
  única e honesta pedindo a reabertura do aplicativo. Só o boot seguinte valida,
  grava/confirma o core, liquida o receipt, hidrata e libera `ready` e autosave.

### Decisões-chave

Política conservadora: recuperação completa na mesma montagem foi descartada por
ser exatamente a suposição que gerou o P2. Nenhuma edição posterior é
silenciosamente declarada persistida. Ver `docs/DECISOES.md`
(GOAL-17B-002C corretivo C06) e `docs/storage/GYMFLOW_STORAGE_V1_SAFE.md`
("Falha do core: recuperação só no próximo boot").

### Cobertura adicionada

- `storage-hybrid.test.ts`: falha inicial do core após append + receipt, autosave
  recusado, flush posterior bem-sucedido sem liquidar o receipt, segunda
  conclusão recusada, boot seguinte recuperando/liquidando e autosave liberado.
- `GymFlowContext.storage.test.tsx` (Provider real): `storageHealth` preso em
  `write-error`, edição posterior só em memória, `pagehide` usando apenas o
  snapshot pendente, segunda finalização bloqueada sem duplicar XP, streak,
  planejamento, desafios, conquistas ou sessão, unmount sem callback, novo boot
  ficando `ready` com o receipt liquidado e o autosave de volta.
- Os digests golden de `storage-history-integrity.test.ts` seguem idênticos.

### Validações

- `npx vitest run`: **39 arquivos, 875 testes** aprovados (873 anteriores + 2
  novos). Zero falha.
- `npx tsc --noEmit`: aprovado (0 erros).
- `npm run build` (web) e `npm run build:mobile`: aprovados.
- `npm run lint`: **12 erros + 6 warnings**, idêntico à baseline (TF-F-13);
  zero ocorrência nova.
- `git diff --check`: limpo.

### Continuação

- GOAL-17B-002D **não iniciado**: import/export e rollback híbridos seguem fora
  de escopo. Validação em WebView físico continua gate obrigatório. Ver
  PENDENCIAS 17B-002C-C01..C05 (C06 encerrado).

---

## GOAL-17B-002D-A0 — recuperação honesta no envelope físico v2 (2026-07-24)

Corretivo exclusivo do **P0-1** levantado na auditoria do 002D: com o envelope
físico v2 em estado bloqueado, o `StorageRecoveryNotice` ainda exibia
"Restaurar backup" e "Iniciar dados novos", embora o Context recusasse as duas
corretamente. Botões mortos deixavam o usuário sem saída acionável.

### Antes / depois

| Estado | Antes | Depois |
| --- | --- | --- |
| legacy-v1 bloqueado com backup | exportar original, restaurar backup, iniciar dados novos | idêntico |
| legacy-v1 bloqueado sem backup | exportar original, iniciar dados novos | idêntico |
| hybrid-v2 saudável | aviso ausente | idêntico |
| hybrid-v2 bloqueado com `hasBackup` | **restaurar backup e iniciar dados novos exibidos e inertes** | nenhum dos dois é renderizado |
| hybrid-v2 bloqueado com conteúdo bruto | exportar original + dois botões mortos | somente "Baixar conteúdo original" |
| hybrid-v2 bloqueado sem conteúdo bruto | dois botões mortos | nenhuma ação; texto declara que não há ação automática segura |
| hybrid-v2 com erro de gravação | "Restaurar backup" se `hasBackup` | nenhuma ação legada |

### Mudanças

- `resolveStorageRecoveryCapabilities` em `storage-hybrid.ts`, ao lado de
  `canUseLegacyAdminOperations`: resolve `canRestoreLegacyBackup`,
  `canStartFreshLegacy`, `canDownloadRaw` e `requiresHybridRecovery` a partir do
  modo, da versão física, do status de saúde, do backup legado e do conteúdo
  bruto. A regra de versão não foi duplicada no componente.
- `GymFlowContext.tsx`: `storagePhysicalVersion` virou estado, as capacidades
  são memoizadas e expostas no contexto e passadas ao aviso. As guardas de
  `restoreStorageBackup`, `startFreshStorage` e `applyStorageImport`
  permanecem intactas.
- `StorageRecoveryNotice.tsx`: renderiza a partir das capacidades; título e
  textos honestos para v2, sem citar identificador interno de GOAL.
- `AdminPanel.tsx`: **não alterado** — os quatro botões já estavam `disabled` em
  modo híbrido, com bloqueio explicado no painel.

### Testes

- `storage-hybrid.test.ts`: matriz pura do resolvedor — legacy com e sem backup,
  v2 saudável, v2 bloqueado com e sem conteúdo bruto, erro de gravação em v1 e
  em v2, e estado de carregamento. **48 → 49 testes.**
- `StorageRecoveryNotice.test.tsx` (novo, `react-test-renderer`): 10 testes
  cobrindo os sete estados da matriz, o fluxo de confirmação legado, ausência de
  identificador interno de GOAL e Strict Mode sem duplicação.
- `GymFlowContext.storage.test.tsx`: Provider real em v2 saudável, v2 bloqueado
  com backup congelado, handlers fail-closed sem tocar em `localStorage`,
  `:backup` ou registros do IndexedDB, v1 corrompido preservando as capacidades
  legadas, conclusão pendente não confundida com corrupção física e Strict Mode.
  **17 → 23 testes.**

### Validações

- `npx vitest run`: **40 arquivos, 892 testes** aprovados (875 anteriores + 17
  novos). Zero falha.
- `npx tsc --noEmit`: aprovado (0 erros).
- `npm run build` (web) e `npm run build:mobile`: aprovados.
- `npx eslint src`: **12 erros + 6 warnings**, idêntico à baseline (TF-F-13);
  zero ocorrência nova nos arquivos alterados.
- `git diff --check`: limpo. `package.json` e `package-lock.json` inalterados.

### Continuação

- **GOAL-17B-002D-A não iniciado.** Importação, exportação, rollback de geração,
  reset híbrido, journal administrativo e downgrade para v1 seguem **não
  implementados**. Ver PENDENCIAS 17B-002D, 17B-002D-E01 (ambiguidade de
  `hasBackup`, P1) e 17B-002D-E02 (identificador de GOAL no AdminPanel, P3).
  Validação em WebView físico continua gate obrigatório.

---

## GOAL-17B-002D-A1 — fundação administrativa do IndexedDB (2026-07-24)

### Objetivo

Entregar a primeira fundação interna do 002D: upgrade físico para a versão 4,
store separado para receipts de operações administrativas, enumeração completa de
gerações, leitura verificada de uma geração e rollback explícito do ponteiro de
geração ativa. **Sem comportamento visível na interface** e **sem integração ao
`HybridStorageRuntime`**.

### Antes / depois

| Comportamento | Antes | Depois |
| --- | --- | --- |
| Versão física do IndexedDB | 3 | **4** (upgrade aditivo e idempotente) |
| Receipt administrativo | não existia | store `storageOperationReceipts` isolado |
| Enumerar gerações | só `readGenerationManifest(id)` pontual | `listHistoryGenerations()` com união de quatro fontes + marcadores |
| Ler geração arbitrária | `readHistoryGeneration` devolvia `[]` para geração ausente | `readVerifiedHistoryGeneration` falha com razão de integridade |
| Rollback de geração | inexistente | primitiva física fail-closed com CAS no ponteiro ativo |
| Ações administrativas reais | bloqueadas | **continuam bloqueadas** (nenhum call site novo) |

### Mudanças

- `storage-operation-receipt.ts` (novo): contrato `StorageOperationReceipt`, os
  quatro `kind`, os cinco `status`, tabela de transições, validação pura e
  factory. Recusa registros que carreguem campos do receipt de conclusão.
- `storage-adapter.ts`: `HistoryGenerationSummary`, `VerifiedHistoryGeneration`,
  entrada/saída do rollback e a interface `WorkoutHistoryAdministrationAdapter`,
  separada do contrato de histórico consumido pela migração e pelo runtime.
- `storage-indexeddb.ts`: versão 4 com `storageOperationReceipts`
  (`keyPath: operationId`, índices `byStatus`, `byKind`, `byUpdatedAt`); CRUD e
  compare-and-swap dos receipts administrativos; `listHistoryGenerations`;
  `readVerifiedHistoryGeneration`; `rollbackToHistoryGeneration`; erros
  `StorageOperationReceiptIntegrityError`, `StorageOperationTransitionError`,
  `HistoryGenerationIntegrityError` e `HistoryRollbackConflictError`.

### Correção durante a implementação

A primeira versão de `listUnsettledStorageOperationReceipts` consultava o índice
`byStatus` pelos três status não terminais. Um teste com registro corrompido
provou o buraco: **sem status válido o registro não entra em índice nenhum**, e a
listagem devolvia `[]` — ou seja, "nada em aberto" sobre um store corrompido, que
é a conclusão mais perigosa possível para o runtime de recuperação do A2. A
listagem passou a varrer o store inteiro e a interromper em qualquer registro
malformado.

### Testes

- `storage-operation-receipt.test.ts` (novo): **8 testes** — tipos e status
  declarados, terminais, matriz completa de transições (25 pares), factory,
  aprovação de todos os `kind`/`status`, recusa de malformado, exigência de core
  e geração anteriores, e recusa de campos do receipt de conclusão.
- `storage-indexeddb.test.ts`: **52 → 88 testes.** Upgrade v3 → v4 preservando
  byte a byte os cinco stores antigos, receipts de conclusão intactos, upgrade
  repetido idempotente, store novo vazio; round-trip administrativo, malformado
  recusado na gravação e na leitura, listagem só de não terminais, transições
  válidas, CAS divergente, terminal imóvel, isolamento nos dois sentidos e falha
  explícita sem banco aberto; enumeração de ativa, staged, registros sem
  manifest, manifest sem registros, vazia válida, órfã, manifest ilegível,
  ordenação determinística e ausência de mutação; leitura verificada válida,
  vazia, ausente, sem manifest, digest divergente, contagem divergente e ordem
  divergente; rollback válido, no-op explícito, staged limpo e preservado, alvo
  ausente, alvo corrompido, ponteiro obsoleto, staged divergente, manifest
  alterado antes do commit, e stores intocados em todas as falhas.
- `storage-completion-receipt.test.ts`: **+1 teste** de regressão — receipt
  administrativo nunca é lido como receipt de conclusão, e vice-versa.

### Validações

- `npx vitest run`: **41 arquivos, 936 testes** aprovados (892 anteriores + 44
  novos). Zero falha.
- `npx tsc --noEmit`: aprovado (0 erros).
- `npm run build` (web) e `npm run build:mobile`: aprovados.
- `npx eslint src`: **12 erros + 6 warnings**, idêntico à baseline (TF-F-13);
  zero ocorrência nova nos arquivos alterados.
- `git diff --check`: limpo. `package.json` e `package-lock.json` inalterados.

### Continuação

- **GOAL-17B-002D-A2 não iniciado.** A fachada segura do runtime administrativo,
  a coordenação entre core v2 do `localStorage` e ponteiro do IndexedDB, o
  owner-token e a concorrência entre abas seguem **não implementados**.
- **002D-B/C/D/E/F não iniciados.** Exportação formato v2, importação,
  restauração, reset e downgrade físico continuam **não implementados** e
  bloqueados em modo híbrido.
- Nenhuma primitiva desta entrega tem call site real: nada foi exposto à UI,
  chamado no boot ou no Provider. `rollbackToHistoryGeneration` move apenas o
  ponteiro físico e **não** é rollback completo do aplicativo.
- Validação em WebView físico (17B-002A-PHYSICAL) continua gate obrigatório.

---

## GOAL-17B-002D-A1 corretivo — rollback atomicamente verificável (2026-07-24)

### Origem

Auditoria independente de merge readiness do A1 classificou **Classe C — NÃO
APTO** e reprovou a publicação por dois achados. Este corretivo fecha os dois. O
commit `b488109` do A1 foi **preservado**.

### P1 — janela entre a verificação e o commit do rollback

`rollbackToHistoryGeneration` verificava a geração alvo em uma transação readonly
já encerrada e depois abria a transação de escrita apenas sobre `metadata` e
`generationManifests`. Com `workoutHistory` fora do escopo, o IndexedDB não
serializava escritores concorrentes: as sessões podiam mudar entre a verificação
e a ativação, e só o manifest era reconferido.

Reprodução em banco real, manifest intacto nos três casos:

| Injeção após a verificação | Antes | Depois |
| --- | --- | --- |
| sessão alterada | **commitava**; geração ativada reprovava com `record-digest-mismatch`; `totalVolume` adulterado virava histórico ativo | **rejeita**; `activeGeneration` intacto |
| sessão removida | **commitava**; geração ativa com **0 sessões** e manifest declarando 1 | **rejeita**; histórico anterior preservado |
| sessão adicionada | **commitava** com contagem divergente | **rejeita**; ponteiro intacto |

Correção: a transação readwrite passou a incluir **`METADATA_STORE`,
`GENERATION_MANIFESTS_STORE` e `WORKOUT_HISTORY_STORE`**. Antes dela, a
verificação integral monta uma **prova canônica imutável** a partir da mesma
leitura física — `order`, `sessionId`, digest persistido (inclusive `null`) e a
serialização canônica de cada sessão, reusando
`serializeWorkoutSessionCanonically`. Dentro da transação, depois de conferir
metadata e a igualdade integral do manifest, todos os registros são relidos e
reconferidos **sincronamente** contra a prova: contagem, `sessionId`, `order`,
digest persistido e conteúdo canônico. Nenhum `crypto.subtle` e nenhum await
estranho à transação.

`readGenerationRecords` virou a leitura crua única que alimenta o snapshot
público e a prova, para que ambos descrevam o mesmo estado físico.

O no-op deixou de reescrever `activeGeneration`: passa pelas mesmas verificações,
devolve `changed: false` e deixa metadata byte a byte intocada — mas continua
recusando quando a geração alvo está corrompida.

### P2 — chave não textual em metadata

`listHistoryGenerations` chamava `startsWith` direto em `record.key`. Uma chave
number/Date/ArrayBuffer produzia `TypeError: record.key.startsWith is not a
function`. Agora a chave é validada e o caso vira
`HistoryMetadataIntegrityError`, erro explícito do domínio, sem listagem parcial,
sem conversão, sem reparo. A interface do adapter não mudou.

### Testes

`storage-indexeddb.test.ts`: **88 → 103 testes.** As três sondas da auditoria
viraram testes permanentes, mais ordem trocada, digest alterado com conteúdo
igual, conteúdo alterado com digest nulo, no-op sobre geração corrompida, no-op
bem-sucedido com metadata intocada, escritor concorrente idêntico (conclui e a
geração ativada continua verificável), escritor concorrente mutante (nunca estado
intermediário, sem threshold de tempo), caminho feliz do rollback e três chaves
não textuais + legibilidade preservada do banco.

Todos os testes de falha comparam antes/depois de `metadata`,
`generationManifests`, `workoutHistory`, `completionReceipts` e
`storageOperationReceipts`. A janela é aberta interceptando
`crypto.subtle.digest`; a verificação e o rollback reais executam inteiros e
nenhuma resposta é simulada — os testes exigem `HistoryRollbackConflictError`,
então uma detecção na verificação prévia faria o teste falhar.

### Validações

- `npx vitest run`: **41 arquivos, 951 testes** aprovados (936 + 15). Zero falha.
- `storage-indexeddb.test.ts` embaralhado 3×: 103 testes, zero falha.
- `npx tsc --noEmit`: aprovado. `npm run build` e `npm run build:mobile`: aprovados.
- `npx eslint src`: **12 erros + 6 warnings**, baseline; zero ocorrência nova.
- `git diff --check`: limpo. `package.json` e `package-lock.json` inalterados.

### Preservado

Versão física v4, stores, índices, formato do `StorageOperationReceipt`,
transições CAS, isolamento dos receipts, `listUnsettledStorageOperationReceipts`,
união da listagem de gerações, semântica documentada de `verified`,
`readVerifiedHistoryGeneration`, comportamento legacy, envelopes v1/v2 e
`schemaVersion` lógico 1.

### Continuação

- **A1 continua sem call site real:** nenhuma primitiva exposta à UI, ao boot ou
  ao Provider.
- **O rollback físico continua não sendo rollback completo do aplicativo:** ele
  move apenas o ponteiro do IndexedDB; o core v2 do `localStorage` precisa ser
  coordenado no 002D-A2/C/D.
- **002D-A2 não iniciado.** **B/C/D/E/F não iniciados.**
- Gate de WebView físico (17B-002A-PHYSICAL) continua obrigatório.

---

## GOAL-17B-002D-A2 — runtime administrativo seguro (2026-07-24)

O A1 (integrado à master em `e35b462`) entregou as primitivas físicas do
IndexedDB: receipts de operação administrativa, enumeração de gerações,
leitura verificada e rollback físico atomicamente correto. O A2 constrói a
camada entre essas primitivas e os futuros fluxos reais de
importação/restauração/reset/rollback (002D-C/D): uma **fachada interna**,
`createStorageAdminRuntime`, em `src/lib/storage-admin-runtime.ts`. Nenhuma
operação real é executada nesta etapa — o begin cria só um receipt `staged`, e
nada aqui é chamado pelo Provider, por um componente ou pelo boot.

### Arquitetura

Arquivo novo em vez de expandir `HybridStorageRuntime` (1279 linhas, a
interface que o Provider consome): a fachada administrativa é deliberadamente
desconectada da UI, e um arquivo próprio evita que um método vaze para a
interface pública por engano. `createStorageAdminRuntime({ key, storage,
adapter, now?, idFactory? })` recebe a mesma `storage`/`adapter` que o runtime
híbrido usa, mas não gerencia o ciclo de vida do adapter — `open()` é
idempotente e é chamado sob demanda.

### Estados administrativos

`StorageAdministrationState` é discriminado por `status`:

- **`unavailable`** (`reason`: `not-hybrid` | `indexeddb-unavailable` |
  `storage-blocked` | `physical-version-mismatch` | `core-invalid`) — a camada
  física em si não está utilizável.
- **`ready`** — v2 saudável, geração ativa com manifest confirmado, zero
  receipt administrativo não terminal, zero conclusão de treino pendente, zero
  staging inesperado.
- **`interrupted`** — exatamente um `StorageOperationReceipt` não terminal,
  identificado por `operationId`/`kind`/`status`. Nenhuma recuperação
  automática.
- **`conflicted`** (`reason`: `multiple-unsettled-operations` |
  `malformed-operation-receipt` | `metadata-malformed` | `completion-pending` |
  `completion-pending-with-operation` | `staging-without-receipt` |
  `active-generation-corrupt`) — estado ambíguo demais para autorizar mutação.

Conflito nunca vira `ready`, e a fachada nunca escolhe sozinha qual receipt
continuar.

### Diagnóstico (`inspectStorageAdministration`)

Devolve sempre o mesmo formato de snapshot: `state`, `physicalStorageVersion`,
`activeGenerationId`, `stagedGenerationId`, `generations` (via
`listHistoryGenerations` do A1), `unsettledOperations`,
`pendingCompletionReceiptCount` e `coreDigest` (checksum best-effort do core
bruto, nunca usado para decidir estado). Read-only ponta a ponta: nenhuma
escrita em `localStorage` ou IndexedDB, nenhuma geração ativada, nenhum
receipt criado ou liquidado.

### Criação atômica do receipt (`createStorageOperationReceiptIfIdle`)

Nova primitiva do adapter (`storage-indexeddb.ts`), não da fachada: uma única
transação readwrite sobre `storageOperationReceipts` + `metadata` que varre
todos os receipts existentes, recusa se qualquer um não for terminal
(`StorageOperationAlreadyInProgressError`, carregando o receipt existente),
reconfere `activeGeneration` por CAS (`StorageOperationBeginConflictError`
quando diverge ou o `operationId` já existe) e só então grava com `add` —
nunca `put`. Receipts `settled`/`reverted` nunca bloqueiam e nunca são
apagados. Duas criações concorrentes na mesma conexão produzem exatamente um
receipt: a segunda transação só começa depois que a primeira já
commitou/abortou.

### Protocolo de `beginStorageOperation`

1. `inspectStorageAdministration()`; exige `ready`.
2. Relê o `raw` do core v2 e valida o envelope físico.
3. Relê `activeGeneration` (independente do snapshot) e verifica **integralmente**
   a geração ativa via `readVerifiedHistoryGeneration`.
4. Constrói o receipt com `status: staged`, `previousCoreRaw` exatamente o raw
   lido, `previousGenerationId` a geração ativa real, `operationId`/timestamps
   internos (`idFactory`/`now` só injetáveis na construção do runtime).
5. `createStorageOperationReceiptIfIdle` com CAS da geração ativa.
6. Relê `raw` e `metadata.activeGeneration` de novo. Se qualquer um divergir do
   passo 2/3 — janela que o CAS por si só não cobre, porque o core v2 vive no
   `localStorage`, fora da transação IndexedDB — transiciona `staged →
   reverted` (nunca apaga) e devolve `StorageOperationBeginConflictError`.

O consumidor não controla `status`, `previousCoreRaw`, `previousGenerationId`,
`createdAt` nem `updatedAt`. O begin recusa (fail-closed, sem criar receipt)
diante de: operação em aberto, mais de uma, conclusão pendente, metadata
malformada, staging sem explicação, geração ativa ausente ou corrompida, core
v2 ausente/inválido, runtime legado/bloqueado, IndexedDB indisponível ou
versão física diferente de 2.

### CompletionReceipt

`beginStorageOperation` recusa com qualquer conclusão de treino pendente.
`inspectStorageAdministration` classifica como `conflicted` quando ela
coexiste com um receipt administrativo não terminal. Nenhum método toca em
`WorkoutCompletionReceipt` — os dois contratos continuam isolados como no A1.

### Transição (`transitionStorageOperation`)

Delegação pura ao CAS do adapter: as mesmas transições do A1 (`staged →
activating → activated → settled`, qualquer não terminal `→ reverted`),
nenhuma nova, nenhum efeito colateral por status. `StorageOperationTransitionError`
já existente é reaproveitado para `expectedStatus` divergente, operação
ausente ou transição a partir de terminal — sem TypeError, sem string solta.

### Leitura verificada (`readVerifiedAdministrationGeneration`)

Bloqueia só em `unavailable` — uma operação `interrupted` ainda permite
diagnóstico read-only, porque nada nesse caminho muta nada. Delega a
`readVerifiedHistoryGeneration` do A1 (nunca devolve `[]` para geração ausente
ou corrompida) e devolve cópia defensiva (`sessions`/`manifest` clonados).

### Erros de domínio

`StorageAdministrationUnavailableError` e `StorageAdministrationConflictError`
(novos, na fachada) carregam `reason` tipado e preservam `cause` nativo
(`Error(message, { cause })`) quando encapsulam falha interna.
`StorageOperationAlreadyInProgressError` e `StorageOperationBeginConflictError`
(novos, no adapter) são reexportados pela fachada em vez de duplicados.

### Testes

`storage-admin-runtime.test.ts`: **40 testes**, cobrindo os 50 itens
obrigatórios do enunciado (estado administrativo, begin — incluindo as duas
janelas de corrida reproduzidas com banco `fake-indexeddb` real e mutação
verdadeira, nunca simulada —, transição, leitura verificada e regressões).
Embaralhado 3× (seeds 11034/22034/33034): 40 testes, zero falha, cada vez.
`storage-indexeddb.test.ts` ganhou **7 testes** para
`createStorageOperationReceiptIfIdle`, incluindo criação concorrente na mesma
conexão: **103 → 110 testes**.

### Validações

- `npx vitest run`: **42 arquivos, 998 testes** aprovados (951 + 40 + 7). Zero
  falha.
- `storage-admin-runtime.test.ts` embaralhado 3×: 40 testes, zero falha.
- `npx tsc --noEmit`: aprovado. `npm run build` e `npm run build:mobile`:
  aprovados.
- `npx eslint src`: **12 erros + 6 warnings**, baseline idêntica ao A1; zero
  ocorrência nova.
- `git diff --check`: limpo. `package.json` e `package-lock.json` inalterados.

### Preservado

Versão física v4, todas as primitivas e testes do A1 (rollback atomicamente
verificável incluído), isolamento entre `StorageOperationReceipt` e
`WorkoutCompletionReceipt`, comportamento legado v1, envelopes v1/v2 e
`schemaVersion` lógico 1. Nenhum arquivo de UI, Provider, Android ou domínio
de treino foi tocado.

### Continuação

- **A2 não é rollback completo, nem importação/exportação/restauração/reset:**
  `beginStorageOperation` cria somente o receipt `staged`. A execução real das
  quatro operações fica para 002D-C/D.
- **`rollbackToHistoryGeneration` continua fora da interface pública:** só o
  adapter de baixo nível o expõe, para uso futuro do coordenador atômico.
  Confirmado por busca: nenhum call site em `GymFlowContext.tsx`,
  `AdminPanel.tsx` ou `StorageRecoveryNotice.tsx`.
- **Recuperação de operação interrompida continua manual:** o snapshot
  devolve diagnóstico estruturado (`interrupted`, com o receipt completo); não
  há conclusão, reversão ou movimentação de ponteiro automática. A resolução
  real fica nos slices C/D.
- **Owner-token e concorrência entre abas continuam para etapa posterior.**
- **002D-B/C/D/E/F não iniciados.**
- Gate de WebView físico (17B-002A-PHYSICAL) continua obrigatório.

---

## GOAL-17B-002D-A2 corretivo 036 — fechamento dos conflitos Classe C (2026-07-24)

Auditoria independente e estritamente read-only do commit `429c87d`
(`feat(storage): adicionar runtime administrativo seguro`) classificou o slice
como **Classe C — NÃO APTO PARA PUBLICAÇÃO**, com três bloqueantes reproduzidos
por fault injection real em `fake-indexeddb`, não por leitura de código. Este
commit corrige os três e mais quatro achados P1/P2. **O commit original foi
preservado integralmente** — sem amend, squash, rebase ou merge.

### O que a auditoria provou

1. **`inspectStorageAdministration` devolvia `ready` sobre histórico
   fisicamente corrompido.** Seis corrupções da geração ativa (conteúdo alterado
   mantendo o digest persistido, digest alterado, ordem física trocada, sessão
   removida, sessão adicionada, `orderedDigest` incorreto com `verified=true`)
   retornavam `ready` enquanto `readVerifiedAdministrationGeneration` reprovava a
   MESMA geração com `HistoryGenerationIntegrityError`. No caso da sessão
   removida o próprio payload carregava a contradição: `recordCount: 1`,
   `manifestSessionCount: 2`, `verified: true`, estado `ready`.
2. **Corrida com `CompletionReceipt` permitia o begin.** Uma conclusão de treino
   gravada entre o `inspect` e a criação do receipt passava despercebida: o begin
   criava a operação e fabricava o `completion-pending-with-operation` que existe
   para impedir.
3. **`transitionStorageOperation` avançava operação em estado ambíguo.** A
   transição só checava `isAvailable()`; avançou receipts em `conflicted` com dois
   receipts, com conclusão pendente, com receipt malformado e — pior — com o core
   v2 **removido** do `localStorage` (`unavailable`).

Além disso: snapshot sem prova de estabilidade (devolveu `ready` com receipt não
terminal já gravado), falha de compensação engolida por `catch {}` vazio,
incompatibilidade receipt × metadata classificada como `interrupted` genérico, e
documentação com três afirmações incorretas.

### Snapshot atômico (`readStorageAdministrationSnapshot`)

Nova primitiva do adapter. **Uma** transação readonly sobre `metadata` +
`workoutHistory` + `generationManifests` + `storageOperationReceipts` +
`completionReceipts`, sem nenhuma transação auxiliar. Devolve metadata real,
ponteiros, resumo das gerações, manifests, os registros da geração ativa
(necessários para verificar integralmente sem reabrir a janela), todos os
receipts administrativos, os CompletionReceipts pendentes e um `fingerprint`
determinístico. Todo receipt é validado antes de qualquer filtragem — malformado
vira `StorageOperationReceiptIntegrityError` ou `CompletionReceiptIntegrityError`,
nunca "nada em aberto". Cópia segura: mutar o snapshot não alcança o IDB. Não
repara, não apaga, não cria manifest, não liquida receipt, não move ponteiro,
não escreve nada.

### `ready` agora verifica de verdade

`inspectStorageAdministration` não usa mais `activeSummary.verified` como prova.
Ele roda `verifyHistoryGeneration` — a MESMA primitiva do A1, sem segunda
implementação — sobre os registros do snapshot atômico: manifest obrigatório,
contagem, ordem física, digests por registro recalculados e `orderedDigest`. O
resultado viaja em `snapshot.activeGenerationIntegrity`. A flag persistida
continua visível em `generations[].verified`, agora documentada como flag e
explicitamente **não** como prova.

### Protocolo double-read

`coreRawBefore` → snapshot A → verificação integral → `coreRawMiddle` →
snapshot B → `coreRawAfter`. Conclui apenas com os três cores idênticos e
`fingerprint(A) === fingerprint(B)`. O fingerprint cobre metadata, ponteiros,
manifests, o **conteúdo canônico de todos os registros de histórico**, todos os
receipts administrativos e todos os CompletionReceipts pendentes — nunca só
contagem. A verificação roda dentro da janela de propósito: mutação durante ela
muda o fingerprint em vez de aprovar conteúdo que já não existe.

Divergência nunca vira escolha: `conflicted` com
`administration-snapshot-unstable` ou `core-changed-during-inspection`. Uma
segunda tentativa é feita (blip isolado resolve); instabilidade persistente
continua fail-closed. O snapshot descreve a janela estável observada — alteração
iniciada depois da leitura final aparece no próximo `inspect`.

### Criação atômica com CompletionReceipts

`createStorageOperationReceiptIfIdle` passou a incluir `COMPLETION_RECEIPTS_STORE`
no escopo da transação readwrite. Como `appendSessionWithCompletionReceipt`
disputa o mesmo store, o IndexedDB serializa as duas. Dentro da transação: lê e
valida todos os admin receipts, recusa qualquer não terminal, lê e valida todos
os CompletionReceipts, recusa qualquer pendente (`StorageCompletionPendingError`),
relê metadata, confere o CAS da geração ativa, valida o novo receipt e grava com
`add`, nunca `put`. Nenhum CompletionReceipt é lido por fora, alterado ou
liquidado.

### Transição só em estado inequívoco

Nova primitiva `transitionStorageOperationIfUnambiguous`, com transação readwrite
sobre os três stores. A fachada exige `interrupted` (que já implica core válido e
estável, geração ativa verificada, exatamente um receipt não terminal, zero
conclusão pendente e receipt coerente) e a primitiva reconfere tudo dentro da
transação de escrita. Ela **nunca escolhe** um receipt: o `operationId` tem de
ser exatamente a única operação não terminal.

> **Correção do 038:** "reconfere tudo dentro da transação de escrita" vale só
> para o lado IndexedDB. O core v2 vive no `localStorage`, fora da transação, e
> a auditoria seguinte provou que a transição avançava sobre um core já trocado.
> Ver a seção do corretivo 038.

A transição também valida o estado **projetado**, para não deixar o chamador
criar um beco sem saída: `activating → activated` é recusada no A2 porque
`activated` afirma efeitos que nenhum fluxo desta fase produz. Reverter é sempre
permitido — status terminal não descreve efeito nenhum.

### Coerência receipt × core × metadata

`evaluateStorageOperationCompatibility`, helper puro em
`storage-operation-receipt.ts`, devolve `compatible`, `incompatible` (razão
fechada) ou `insufficient-evidence`. `staged` exige geração anterior existente e
ativa, core idêntico ao `previousCoreRaw` e ponteiro de staging coerente;
`activating` só é compatível com nenhum efeito aplicado, e efeitos já aplicados
viram `insufficient-evidence`; `activated` exige evidência completa. Um receipt
não terminal incoerente vira `conflicted` (`operation-incompatible`), não
`interrupted` genérico. `insufficient-evidence` **nunca** é tratado como
compatível.

### Compensação honesta

Zero `catch {}`. `StorageOperationBeginConflictError` carrega `operationId`,
`compensation` (`reverted` | `failed` | `not-attempted`), `compensationCause`,
`finalReceiptStatus` e a `cause` original. Compensação que falha nunca é
relatada como revertida: a mensagem diz FALHOU, informa o status remanescente, o
receipt não é apagado nem sobrescrito à força e reaparece no próximo diagnóstico.
Quando até a releitura do status final falha, `finalReceiptStatus` fica `null` e
a causa continua acessível.

### Entrada e erros

`stagedGenerationId` e `targetCoreRaw` precisam ser `null` no A2 — valor não nulo
vira `StorageAdministrationInputError` antes de qualquer leitura ou escrita. O
mesmo erro cobre `now()` inválido (com o `RangeError` preservado em `cause`),
`idFactory` vazia e `generationId` vazio: nada de `RangeError`/`TypeError` cru
como contrato. `StorageAdministrationState` ganhou `cause?: unknown`, então o
caminho `storage-blocked` não perde mais a exceção original do `localStorage`.

### Testes

- `storage-admin-runtime.test.ts`: **43 → 97**. Inclui as sete corrupções da
  auditoria como testes permanentes (cada uma provando que a mutação física
  ocorreu antes de julgar), fault injection de snapshot instável com escrita
  contínua e com blip isolado, dez cenários de transição ambígua, quatro de
  compensação (sucesso, falha por erro de IDB, falha por CAS com status já
  mudado, falha somada a releitura impossível) e invariância física em cada
  recusa.
- `storage-indexeddb.test.ts`: **110 → 125**. Concorrência entre **duas conexões
  independentes** (o cenário que faltava): duas criações simultâneas, begin
  contra `appendSessionWithCompletionReceipt`, cada ordem de chegada, registro
  malformado em qualquer store e duas transições atômicas simultâneas. Mais sete
  testes do snapshot atômico.
- `storage-operation-receipt.test.ts`: **8 → 26**, cobrindo o helper puro em
  tabela.

Nenhum threshold rígido de tempo; nenhuma resposta final simulada — os spies só
abrem janelas reais sobre o adapter físico.

### Validações

- `npx vitest run`: **42 arquivos, 1088 testes** aprovados (998 → 1088). Zero
  falha.
- `storage-admin-runtime.test.ts` embaralhado com as seeds 11036/22036/33036:
  97 testes, zero falha, cada vez. `storage-indexeddb.test.ts` com as mesmas três
  seeds: 125 testes, zero falha.
- `npx tsc --noEmit`: aprovado. `npm run build` e `npm run build:mobile`:
  aprovados.
- `npx eslint src`: **12 erros + 6 warnings**, baseline idêntica; zero ocorrência
  nova nos arquivos alterados.
- `git diff --check`: limpo. `package.json` e `package-lock.json` inalterados.

### Preservado

Commit `429c87d` intacto. Versão física do IndexedDB continua v4 — nenhum store
novo, nenhuma migração. Todas as primitivas do A1 (rollback atomicamente
verificável incluído), o isolamento entre `StorageOperationReceipt` e
`WorkoutCompletionReceipt`, o protocolo de conclusão de treino, o runtime híbrido
v2, a recuperação honesta do A0 e o comportamento legado v1 seguem idênticos.
Nenhum arquivo de UI, Provider, Android ou domínio de treino foi tocado.

### Continuação

- **Nenhum call site real:** nenhum componente, `GymFlowContext`, `AdminPanel`,
  `StorageRecoveryNotice`, boot ou layout chama a fachada. Confirmado por busca.
- **`rollbackToHistoryGeneration` continua fora da interface pública**, só no
  adapter de baixo nível.
- **Nenhuma operação administrativa real:** o begin cria somente o receipt
  `staged`. Importação, exportação v2, restauração, reset e rollback completo
  ficam para 002D-C/D.
- **Nenhuma recuperação automática no boot; nenhuma sincronização entre abas.**
- **Owner-token continua pendente.** Gate de WebView físico
  (17B-002A-PHYSICAL) continua obrigatório.
- **002D-B/C/D/E/F não iniciados.**
---

## GOAL-17B-002D-A2 corretivo 038 — transição protegida contra core obsoleto (2026-07-25)

**Status:** concluído · **Commits preservados:** `429c87d` e `2e8495c`, sem
amend, squash ou rebase.

### O bloqueio

Segunda auditoria independente classificou o 002D-A2 como **Classe C** de novo.
O achado, reproduzido com fault injection real sobre o adapter físico:

- `transitionStorageOperation` usava apenas `snapshot.coreRawObserved`, capturado
  pelo `inspect`, e **nunca relia o core** — nem antes de abrir a transação, nem
  depois do commit;
- com o core do `localStorage` alterado depois do `inspect`, a transição
  **commitava** `staged → activating` e retornava sucesso;
- o mesmo acontecia com o core alterado **durante** a transação IndexedDB;
- pior: o receipt ficava **preso em `activating`**. O `inspect` seguinte virava
  `conflicted/operation-incompatible` e `transitionStorageOperation` — que exige
  `interrupted` — recusava até `activating → reverted`. Não havia saída pela
  fachada.

Antes → depois, medido pelas mesmas sondas:

| Cenário | Antes (2e8495c) | Depois (038) |
| --- | --- | --- |
| Core trocado entre o `inspect` e a transação | `activating` persistido, sucesso retornado | `pre-transition`, receipt `reverted`, erro estruturado |
| Core trocado durante a transação IndexedDB | `activating` persistido, sucesso retornado | `post-transition`, receipt `reverted`, erro estruturado |
| Core trocado depois do commit, antes do readback | `activating` persistido, sucesso retornado | `post-transition`, receipt `reverted`, erro estruturado |
| Receipt em `activating` sobre core divergente | preso: nem avança nem reverte | `revertStorageOperationSafely` encerra como `reverted`; `inspect` volta a `ready` |
| `previousCoreRaw` trocado com o mesmo comprimento | fingerprint idêntico | fingerprint diferente |
| Compensação falha e a releitura do status também | `readCause` capturada e descartada, status `null` | `finalStatusReadCause` acessível, status `unknown` |
| `activeGeneration` gravado como number/Date/objeto | `core-invalid` ("não existe geração ativa") | `metadata-malformed`, com a causa preservada |

### Modelo de consistência declarado

Não existe atomicidade única entre `localStorage` e IndexedDB, e a documentação
deixou de sugerir que existia. A garantia é:

> A transição só retorna sucesso quando o core observado antes e imediatamente
> depois da transação continua byte a byte igual ao core compatível com o
> receipt.

Pré-transação: relê o core, exige igualdade byte a byte com
`snapshot.coreRawObserved`, revalida o envelope v2 e reconfere a compatibilidade
do receipt contra o raw recém-lido. Pós-commit: relê o core e compara, relê o
receipt e confirma o `nextStatus`, relê a metadata e confirma a geração ativa,
reconfirma a compatibilidade. Qualquer divergência compensa para `reverted`.

A compensação **não** tenta desfazer a alteração externa do `localStorage`: o
core alheio fica como está, e a operação administrativa é encerrada com
honestidade.

### O que entrou

- `revertStorageOperationAfterTransitionConflict` no adapter: transação readwrite
  sobre os três stores, validação de todos os receipts dos dois stores, exigência
  de exatamente uma operação não terminal correspondente, releitura e validação
  da metadata, CAS opcional da geração ativa, destino único `reverted`. Não apaga
  o receipt, não faz `put` sem conferência, não altera CompletionReceipt,
  histórico, manifest ou metadata.
- `revertStorageOperationSafely` na fachada: saída para a operação presa. Aceita
  `conflicted` por incoerência; recusa ambiguidade estrutural.
- `StorageOperationTransitionConflictError` com `operationId`, `expectedStatus`,
  `attemptedStatus`, `phase`, `reason`, `compensation`, `finalReceiptStatus`,
  `cause`, `compensationCause`, `finalStatusReadCause` e `observedCoreDigest`.
  Nenhuma mensagem carrega core bruto.
- Fingerprint com o conteúdo integral de `previousCoreRaw`/`targetCoreRaw`
  (SHA-256 via `sha256Checksum`, fora da transação; raw inteiro no material
  canônico sem Web Crypto).
- `readMetadataPointers`: ponteiro não textual vira `HistoryMetadataIntegrityError`
  em vez de `null` silencioso.
- `finalReceiptStatus` ganhou `missing` e `unknown`; `finalStatusReadCause` passou
  a existir nos dois erros de conflito.

### Testes

998 → 1088 → **1151**. 42 arquivos, zero falha. 62 testes novos, em sete blocos
permanentes: transição protegida contra core obsoleto (15, incluindo as três
janelas do core e os cenários de compensação), reversão segura de operação presa
(7), metadata malformada na fachada (12), ponteiros de metadata no adapter (12),
primitiva de compensação (9), fingerprint dos cores do receipt (5) e as duas
ordens de transição × conclusão de treino (2). Um teste antigo mudou de
expectativa: `finalReceiptStatus` deixou de ser `null` e passou a ser `unknown`
com a causa da releitura acessível.

Prova de que os testes pegam a regressão: desativando as duas comparações de
core (pré e pós), os cenários A e B falham; restaurando, voltam a passar.

As janelas são determinísticas: a do pré-transação conta as leituras do core
feitas pelo `inspect`; a do "durante" injeta a escrita depois que a chamada já
abriu a transação de forma síncrona. Nenhum `setTimeout`, nenhum threshold.

### Continuação

- **Nenhum call site real:** nenhum componente, `GymFlowContext`, `AdminPanel`,
  `StorageRecoveryNotice`, boot ou layout chama a fachada. Confirmado por busca.
  `revertStorageOperationSafely` inclusive — ela existe e é testada, mas ninguém
  a chama ainda (17B-002D-A2-P8).
- **`rollbackToHistoryGeneration` continua fora da interface pública.**
- **Nenhuma operação administrativa real.** Importação, exportação v2,
  restauração, reset e rollback completo ficam para 002D-C/D.
- **Nenhuma recuperação automática no boot; nenhuma sincronização entre abas.**
- **Owner-token continua pendente** (17B-002D-A2-P9): o protocolo garante que a
  transição não conclui sobre core obsoleto, não que uma segunda aba seja
  impedida de escrever. Gate de WebView físico (17B-002A-PHYSICAL) continua
  obrigatório.
- **002D-B/C/D/E/F não iniciados.**
---

## GOAL-17B-002D-B — formato lógico de backup v2 e exportação read-only (2026-07-25)

O **002D-A2 está integrado e encerrado** (A0 + A1 + A2 + corretivos 036 e 038).
Este slice abre o **B** e entrega apenas três coisas: o formato externo lógico
v2, a captura read-only do estado híbrido e a inspeção read-only do arquivo
gerado. **Nada é importado, restaurado, revertido, resetado ou gravado.**

### O problema

O backup v1 copia o envelope monolítico inteiro. Isso descrevia o usuário
enquanto o armazenamento ERA o envelope. No híbrido v2 o estado vive em dois
lugares — core v2 no `localStorage` e histórico numa geração verificada do
IndexedDB — e **nenhum dos dois sozinho descreve o usuário**. Um backup que
copiasse o core exportaria um arquivo sem histórico; um que copiasse o envelope
físico exportaria `historyStorage.generationId`, um ponteiro para um banco que
não existe no aparelho de destino.

### O formato

`GymFlowLogicalBackupV2`:

| Campo | Valor |
| --- | --- |
| `format` | `gymflow-backup` |
| `formatVersion` | `2` |
| `logicalSchemaVersion` | `1` |
| `exportedAt` | ISO-8601 |
| `sourcePhysicalStorageVersion` | `2` |
| `sourceSavedAt` | ISO-8601 (`savedAt` do core observado) |
| `payloadDigest` | `sha256:<64 hex>` |
| `payload` | `PersistedState` completo (16 campos raiz) |

O payload é **lógico**: `user`, `weeklyPlan`, `customPrograms`, `activeWorkout`,
`activeWorkoutStartedAt`, `restTimerEndAt`, `restTimerTotalSeconds`,
`restTimerLabel`, `workoutHistory`, `weightHistory`, `measurementsHistory`,
`nutrition`, `achievements`, `challenges`, `favoriteExercises` e
`recentlyViewedVideoIds`. Nada além disso.

**Fora do arquivo, por contrato:** `historyStorage`, `generationId`,
`activeGeneration`, `migrationGeneration`, `generationManifests`,
`recordDigests`, `storageOperationReceipts`, `completionReceipts`,
`legacySnapshots`, `quarantine`, `previousCoreRaw`, `targetCoreRaw`, raw do
`localStorage`, o nome da chave, fingerprints administrativos e metadados
internos do IndexedDB. **Nenhum id físico de geração é necessário para uma
importação futura.**

### Protocolo de captura estável

`captureLogicalBackupSnapshot(runtime)` — read-only por tipo, porque
`LogicalBackupRuntime` só expõe `inspectStorageAdministration` e
`readVerifiedAdministrationGeneration`:

1. `inspectStorageAdministration()` → exige `ready`;
2. exige `physicalStorageVersion === 2`, `activeGenerationId` não vazio,
   `coreRawObserved` não nulo, `administrationFingerprint` não nulo,
   `pendingCompletionReceiptCount === 0`, `unsettledOperations` vazio;
3. interpreta `coreRawObserved` como envelope físico v2 válido;
4. confirma `core.data.historyStorage.generationId === activeGenerationId`;
5. `readVerifiedAdministrationGeneration(activeGenerationId)`;
6. `inspectStorageAdministration()` de novo → exige `ready` de novo;
7. compara as duas leituras: `coreRawObserved` byte a byte,
   `activeGenerationId`, `administrationFingerprint`, `physicalStorageVersion`,
   ausência de receipts e ausência de conclusões pendentes;
8. divergência → `snapshot-changed-during-export`, sem escolher leitura e sem
   produzir conteúdo;
9. remove `historyStorage`, insere o histórico verificado, valida o
   `PersistedState` reconstruído e devolve uma cópia lógica independente.

### Garantia declarada

> O backup só existe quando o core observado antes e depois da leitura
> verificada do histórico é byte a byte o mesmo, com o mesmo
> `activeGenerationId`, o mesmo `administrationFingerprint`, a mesma versão
> física, zero receipt administrativo e zero conclusão pendente nas duas pontas.

Não existe atomicidade entre `localStorage` e IndexedDB, e esta documentação não
sugere que exista. Uma alteração iniciada depois da leitura final é um evento
novo: ela aparece na próxima exportação, não neste arquivo.

### Digest e serialização

Serialização canônica determinística: chaves de objeto ordenadas
recursivamente, ordem de array preservada (`workoutHistory` continua
newest-first), nada reordenado por conteúdo, nenhum campo obrigatório removido.
Número não finito e `BigInt` **param** a serialização
(`LogicalBackupSerializationError`, com o CAMINHO e nunca o valor) em vez de
virarem `null` silencioso.

Material do digest: `gymflow:logical-backup:v2:<payload-canônico>`, com
`sha256Checksum` — a função que já existe. Sem Web Crypto não há backup:
`crypto-unavailable`, causa original preservada, nenhum hash fraco, nenhum
comprimento como integridade. A **forma canônica é o que vai para o arquivo**,
então `payloadDigest` assina exatamente o que está publicado.

### Tamanho

`JSON.stringify(backup)` sem indentação. `bytes` são os bytes UTF-8 reais do
conteúdo final, nunca a contagem de caracteres.

| Faixa | Comportamento |
| --- | --- |
| até 8 MiB | `warning: null` |
| acima de 8 MiB e até 25 MiB | sucesso com aviso explícito de arquivo grande |
| acima de 25 MiB | `too-large`, sem conteúdo de sucesso |

`MAX_IMPORT_BYTES` do v1 continua **5 MiB**, intocado.

### Inspeção read-only

`inspectLogicalStorageBackupV2(raw, declaredBytes?, subtleCrypto?)` usa
`max(declaredBytes, utf8Bytes(raw))`, recusa acima de 25 MiB antes de qualquer
operação cara e então valida na ordem: JSON, formato, `formatVersion`,
`logicalSchemaVersion`, datas, `sourcePhysicalStorageVersion`, payload completo,
digest recalculado e comparado. Razões fechadas: `too-large`, `invalid-json`,
`invalid-format`, `unsupported-version`, `unsupported-schema`, `invalid-date`,
`invalid-payload`, `duplicate-session-id`, `digest-mismatch`,
`crypto-unavailable`.

Preview: `exportedAt`, `sourceSavedAt`, `workoutSessions`, `hasActiveWorkout`,
`customPrograms`, `weightEntries`, `measurementEntries`, `bytes`, `warning`.
A inspeção não abre `localStorage` nem IndexedDB — um arquivo pode ser
conferido inteiro num aparelho onde o GymFlow nunca rodou.

### Privacidade

O arquivo contém **dados pessoais e histórico de treino**: perfil (nome,
e-mail, idade, peso, altura), medidas corporais, nutrição e todas as sessões.
Ele não é anonimizado e não é criptografado. Nenhum payload, perfil, histórico
ou raw é registrado em console, e nenhuma mensagem de erro carrega conteúdo do
payload — só caminho de campo e tamanho.

### Estados bloqueados

Legacy v1, armazenamento vazio, core v2 inválido, IndexedDB indisponível,
versão física divergente, metadata malformada, geração ativa ausente, geração
ativa corrompida, operação administrativa `interrupted`, estado `conflicted`,
CompletionReceipt pendente e snapshot instável. **Nenhum deles cai em
recuperação bruta automática** — o download do raw continua sendo uma ação
separada do v1.

### Arquivos

- `src/lib/storage-logical-backup.ts` (novo)
- `src/lib/storage-logical-backup.test.ts` (novo)

Nada mais mudou no código. `storage-types.ts`, `storage-validation.ts`,
`storage-export.ts`, `storage-admin-runtime.ts`, `storage-history-integrity.ts`
e os testes deles ficaram **byte a byte iguais**.

### Testes

1151 → **1224**. 43 arquivos, zero falha. 73 testes novos: contrato e conteúdo
(13), digest e determinismo (7), limites de tamanho (7), inspeção read-only
(12), corridas com fault injection real (11), estados bloqueados (8),
portabilidade e privacidade (2), regressão v1 (8), invariância física (2) e
serialização canônica (3).

As nove corridas mutam o armazenamento **de verdade dentro da janela** — core
alterado antes e depois da leitura verificada, geração ativa trocada, sessão
adulterada, manifest adulterado, receipt administrativo criado,
CompletionReceipt criado, `migrationGeneration` apontando para geração fantasma
e snapshot administrativo que nunca estabiliza. Cada teste confirma que a
mutação de fato aconteceu antes de julgar, e nenhuma corrida retorna sucesso.

Prova de que os testes pegam a regressão: desativando as duas comparações do
segundo diagnóstico (exigência de `ready` e comparação de divergência),
**9 testes falham**; restaurando, os 73 voltam a passar.

Seeds embaralhadas: `11044`, `22044`, `33044` no arquivo novo e `44044` em
`storage-admin-runtime.test.ts` — todas verdes.

### Validações

`npx vitest run` (1224/1224), `npx tsc --noEmit`, `npm run build`,
`npm run build:mobile`, `npx eslint src` (baseline preservada: 12 erros, 6
avisos, nenhum em `src/lib`), `git diff --check` limpo. `package.json` e
`package-lock.json` inalterados.

### Continuação

- **Nenhum call site real.** Nenhum componente, `GymFlowContext`, `AdminPanel`,
  `StorageRecoveryNotice`, boot ou layout importa este módulo — verificado por
  varredura automatizada de `src` no próprio teste.
- **Nenhuma API de escrita v2.** Não existe `commitLogicalStorageImportV2`; o
  teste falha se qualquer export do módulo começar com verbo de escrita ou se o
  código (fora de comentários) mencionar `setItem`, `removeItem`, `Blob`,
  `createObjectURL` ou qualquer método administrativo de mutação.
- **Nenhum download.** Sem `Blob`, sem `URL`, sem elemento de âncora.
  `downloadTextFile` continua sendo do v1 e ninguém o chama para o v2.
- **Fluxo v1 preservado**, com regressão explícita: exportação indentada,
  inspeção, importação com backup do anterior, recusa de `formatVersion: 2` e
  `MAX_IMPORT_BYTES` em 5 MiB.
- **Nenhuma operação administrativa real, nenhuma UI, nenhum Provider, nenhuma
  recuperação automática, nenhuma sincronização entre abas, nenhuma alteração
  Android, nenhum downgrade físico.**
- **002D-C/D/E/F não iniciados.** Importação v2, restauração, rollback completo,
  reset, retenção e owner-token continuam fora de escopo.
- **Performance e download no WebView físico continuam pendentes**
  (17B-002D-B-P1/P2 e 17B-002A-PHYSICAL).

## GOAL-17B-002D-B corretivo 046 — consistência fechada do backup lógico v2 (2026-07-26)

A auditoria independente do 002D-B levantou bloqueantes Classe C e achados P1
comprovados. Este corretivo fecha **só** esses pontos: a implementação-base foi
preservada, o módulo não recomeçou e nenhum arquivo fora dos seis consolidados
foi tocado.

### Os bloqueios

**1. Corrida ABA — antes.** A captura comparava apenas os dois diagnósticos que
cercam a leitura verificada do histórico. Com o histórico indo de `H1` para `H2`
e **voltando byte a byte** para `H1`, os dois diagnósticos ficavam idênticos —
mesmo `coreRawObserved`, mesmo `activeGenerationId`, mesmo
`administrationFingerprint`, mesma versão física, zero receipt — enquanto
`readVerifiedAdministrationGeneration` devolvia `H2`. Resultado: **exportação
bem-sucedida contendo `H2`**, um histórico que nunca coexistiu com aquele core.

**1. Corrida ABA — depois.** A leitura intermediária é comparada com a geração
verificada **descrita por cada um dos dois diagnósticos**. De A e B passou a ser
exigido `activeGenerationIntegrity.status === 'verified'`, manifest presente,
sessões presentes e `manifest.generationId === activeGenerationId`. A comparação
é integral: identidade, `sessionCount`, `orderedDigest`, manifest canônico, ids,
ordem e sessões completas serializadas deterministicamente — inclusive geração
vazia. Divergência devolve `snapshot-changed-during-export`, sem conteúdo, sem
backup parcial e sem escrita. As comparações A × B antigas continuam todas lá.

**2. Contrato externo aberto — antes.** O arquivo podia trazer campo externo
extra, símbolo, propriedade não enumerável, getter/setter ou protótipo
customizado. **Depois:** exatamente oito chaves próprias enumeráveis, conferidas
com `Reflect.ownKeys` e descritores, tanto em memória quanto após `JSON.parse`.

**3. Payload raiz aberto — antes.** A raiz recusava uma lista fixa de campos
físicos, mas aceitava qualquer campo desconhecido. **Depois:** exatamente os 16
campos lógicos, com recusa estrutural e mensagem genérica para o desconhecido.
Strings funcionais do usuário contendo "generationId", "manifest" ou "receipt"
continuam preservadas.

**4. Normalização silenciosa — antes.** `undefined`, função e símbolo eram
descartados; `Date`, `Map` e `Set` viravam `{}`; `TypedArray` virava objeto
indexado — tudo antes do digest, que passava a assinar um estado diferente do
que existia. **Depois:** a árvore inteira é validada e copiada antes de qualquer
canonicalização, e cada um desses valores é recusado explicitamente.

### O que mais entrou

- **Chaves perigosas recursivas.** `__proto__`, `prototype` e `constructor`
  recusadas em todos os níveis, por chave própria real — não por `in`.
- **Datas canônicas.** `exportedAt`, `sourceSavedAt`, o `now` da exportação e o
  `savedAt` do core só passam no formato `YYYY-MM-DDTHH:mm:ss.sssZ`, conferido
  por regex estrita e por `new Date(value).toISOString() === value`.
- **`declaredBytes` validado.** Novo motivo fechado `invalid-size` para `NaN`,
  `±Infinity`, negativo, decimal, string, `null` e objeto. Nunca mais `bytes:
  NaN`, aviso `NaN` ou tamanho decimal. Limites inalterados (8 MiB / 25 MiB).
- **Ordem fail-fast** da inspeção: tamanho → JSON → contrato externo → `format` →
  `formatVersion` → `logicalSchemaVersion` → datas → versão física → payload e
  árvore JSON → formato do digest → recálculo → comparação → preview. Nenhum
  SHA-256 sobre payload não validado.
- **Erros sanitizados.** Sem id de sessão, nome/valor de perfil, conteúdo de
  treino, `raw`, trecho de JSON, chave desconhecida, valor recusado ou mensagem
  de getter/proxy. `sessionId` duplicado tem mensagem genérica. Caminho de erro
  só com nomes conhecidos e índices; o resto vira `<campo>`. `cause` público
  apenas em falha interna confiável.
- **Digest inalterado:** SHA-256, `sha256:`, 64 hex minúsculos, domínio
  `gymflow:logical-backup:v2:`, comparação exata, sem fallback fraco.

### Testes

1224 → **1435**. 43 arquivos, zero falha. O arquivo do backup lógico foi de 73
para **284** testes.

As nove corridas ABA são fault injection **física real**: o IndexedDB é
reescrito de verdade — registros, digests por registro e `orderedDigest` do
manifest recalculados juntos — e depois devolvido byte a byte ao estado
anterior. Os cenários são ids de sessão diferentes, mesmos ids com valores
diferentes, mesma contagem e mesmos ids em ordem diferente, manifest `M1 → M2 →
M1`, `recordDigest` `D1 → D2 → D1`, geração vazia → sessão → vazia, geração com
sessão → vazia → sessão original, conteúdo alterado com `orderedDigest` válido e
`createdAt`/`updatedAt` do manifest alterados e restaurados.

Cada cenário prova, no mesmo teste: `H1` exporta com sucesso; `H2` exporta com
sucesso (logo os dois são individualmente válidos); o armazenamento voltou byte
a byte para `H1`; A e B observaram `H1` com **fingerprints iguais**; a leitura
intermediária devolveu `H2`; a exportação retorna
`snapshot-changed-during-export` sem `content`, `backup` ou `preview`; e o
estado físico final continua idêntico a `H1`, sem receipt novo.

**Prova de que é a comparação nova que fecha o furo:** o teste "sem o vínculo da
leitura intermediária, todas as corridas ABA passariam" reimplementa fielmente o
protocolo pré-corretivo (só as comparações A × B) e mostra que ele **aprova os
nove cenários**, entregando `H2` nos que mudam conteúdo, enquanto o protocolo
corrigido recusa os nove. Nenhuma mutação de produção e nenhum `skip` ficaram no
commit.

Demais suítes novas: contrato externo fechado (8), raiz do payload fechada (6),
valores que não são JSON (matriz de 17 valores × 6 níveis = 102, mais 10 testes
estruturais de array esparso, propriedade extra, não enumerável, getter, setter,
símbolo, ciclo, referência compartilhada, cópia independente e caminho seguro),
chaves perigosas (3 chaves × 8 níveis = 24, mais envelope externo), datas
canônicas (26), `declaredBytes` (15) e privacidade com sentinelas (7).

O tamanho é provado com espiões: `too-large` e `invalid-size` ocorrem **antes**
de `JSON.parse` e de qualquer `digest`, e o digest só é recalculado depois de o
payload ser validado.

Seeds embaralhadas: `11046`, `22046`, `33046` no arquivo do backup lógico e
`44046` em `storage-admin-runtime.test.ts` — todas verdes.

### Validações

`npx vitest run` (1435/1435), `npx tsc --noEmit`, `npm run build`,
`npm run build:mobile`, `npx eslint src` (baseline preservada: 12 erros, 6
avisos, nenhum nos arquivos alterados), `git diff --check` limpo. `package.json`
e `package-lock.json` inalterados.

### Continuação

- **Nenhuma importação, restauração, rollback, reset, UI, Provider, download,
  owner-token ou sincronização entre abas** entrou neste corretivo.
- **Nenhum call site real** — a varredura automatizada de `src` continua
  encontrando apenas o próprio arquivo de teste.
- **Nenhuma API de escrita v2**; `commitLogicalStorageImportV2` continua não
  existindo.
- **Regressão v1 preservada**: exportação indentada, inspeção, importação com
  backup do anterior, recusa de `formatVersion: 2` e `MAX_IMPORT_BYTES` em
  5 MiB. Um backup v1 real continua recusado como `unsupported-version`.
- **002D-C/D/E/F não iniciados.**
- **Não se afirma atomicidade entre `localStorage` e IndexedDB.** O protocolo
  garante que a concorrência derruba a exportação, não que ela seja impedida.

## GOAL-17B-002D-C1 — importação lógica v2 atômica (2026-07-27)

Auditoria independente 052 classificou o 002D-C como **APTO PARA IMPLEMENTAÇÃO /
Classe B** e recomendou dividir o slice. Este GOAL executa o **C1**: recepção
programática de um backup lógico v2, journal administrativo, staging físico
amarrado ao receipt, caminho saudável completo até `settled` e resolvedor puro
dos estados de recuperação. O **C2** — execução da recuperação após reload e
matriz completa de crash points — **não foi iniciado**.

### O que passou a existir

Antes deste GOAL um arquivo v2 podia ser gerado e conferido, e nada mais:
`commitStorageImport` só aceita o envelope v1 monolítico, então o usuário v2
tinha um backup **verificável e inútil para restaurar** (17B-002D-B-P4). Agora
existe `commitLogicalStorageImportV2`, programática e sem call site.

**Primitiva A1 nova — `stageHistoryGenerationForOperation`.** Cria a geração
importada (registros + digests por registro + `orderedDigest` + manifest +
marcador de ordem) e grava `stagedGenerationId` no receipt da operação na MESMA
transação readwrite sobre `workoutHistory`, `metadata`, `generationManifests`,
`storageOperationReceipts` e `completionReceipts`. Dentro da transação exige:
exatamente um receipt não terminal, que seja o `operationId` informado, com
`kind: 'import'`, `status: 'staged'`, `stagedGenerationId` e `targetCoreRaw`
ainda nulos; zero conclusão de treino pendente; CAS de `activeGeneration`;
`migrationGeneration` nulo; e identidade física ainda inexistente. O
`generationId` sai sempre do `generationIdFactory` do adapter — **o importador
nunca fornece identidade física, e o backup externo muito menos.** Qualquer erro
aborta a transação inteira. Integridade reutiliza as rotinas existentes; não há
segunda implementação.

**`metadata.migrationGeneration` nunca é gravada.** `metadataMatchesV2` exige o
ponteiro nulo para hidratar; preenchê-lo bloquearia o boot durante toda a
preparação. O vínculo geração ↔ operação vive no receipt.

### Sequência implementada (W0–W10)

`W0` inspeciona o arquivo e a administração sem escrever nada; `W1` cria o
receipt via `beginStorageOperation` com `sourceDigest = payloadDigest`; `W2` faz
o staging atômico; `W3` relê a geração verificada e a compara integralmente com o
payload (contagem, ids, ordem, conteúdo canônico, `orderedDigest`, manifest);
`W4` constrói `targetCoreRaw` UMA vez e o persiste no journal junto da transição
`staged → activating`; `W5` ativa com `rollbackToHistoryGeneration` (verificação
integral + prova canônica + CAS + readback); `W6` grava o core byte a byte;
`W7` verifica core, metadata e geração; `W8` marca `activated` pela primitiva A1
direta; `W9` liquida via fachada A2; `W10` exige `ready` de novo. **Sucesso só é
retornado depois desse último readback.**

O `targetCoreRaw` é o MESMO raw do começo ao fim: nada de reconstruir o envelope,
nada de `savedAt` novo, nada de `saveHybridCoreResult` — que cunharia um instante
diferente e jamais bateria byte a byte com o que o receipt prometeu.

### Testes

**Primitiva (16 novos em `storage-indexeddb.test.ts`, 153 → 169):** gravação
completa numa transação; recusa de `expectedStatus` inválido; receipt persistido
fora de `staged`; kind diferente de `import`; `stagedGenerationId` ou
`targetCoreRaw` já preenchidos; segunda operação não terminal; conclusão de
treino pendente; CAS falho; `migrationGeneration` ocupada; identidade já
existente; colisão com a geração ativa; ponteiro de staging intocado e geração
ativa inalterada; histórico vazio com manifest canônico; `put` que falha
abortando tudo; readback do receipt.

**Importador (76 novos em `storage-logical-import.test.ts`):** caminho saudável
(11, incluindo 500 sessões, Unicode/emoji, core sem `workoutHistory`, geração
anterior intacta, `settled` e re-hidratação real do runtime híbrido); arquivo
recusado sem nenhuma escrita (11, cada um provando `localStorage` byte a byte
idêntico, fingerprint administrativo idêntico, zero receipt e zero geração nova);
estado atual do armazenamento (7); concorrência e integridade (11); falhas e
compensação (10); idempotência e invariantes (10); tabela fechada do resolvedor
puro (16).

Seeds embaralhadas: `11053` e `22053` no importador, `33053` no adapter — todas
verdes.

### Validações

`npx vitest run` (**1527/1527**, era 1435), `npx tsc --noEmit`, `npm run build`,
`npm run build:mobile`, `npx eslint src` (baseline preservada: 12 erros, 6
avisos, **nenhum nos arquivos alterados**), `git diff --check` limpo.
`package.json` e `package-lock.json` inalterados.

### Continuação

- **Nenhum call site real.** Nenhuma UI, Provider, Context, AdminPanel, boot,
  seletor de arquivo, download ou upload foi criado. A varredura automatizada de
  `src` confirma que o importador só é referenciado pelo próprio teste.
- **A recuperação após reload NÃO está funcionando.** O C1 entrega apenas o
  resolvedor PURO, que decide; `recoverLogicalStorageImportV2` com I/O real não
  existe e nada roda no boot. Uma queda entre a ativação e o commit do core deixa
  o estado recuperável pelo journal, mas ninguém executa essa recuperação ainda —
  ver 17B-002D-C1-P0 em PENDENCIAS.
- **Não se afirma atomicidade única entre `localStorage` e IndexedDB.** A janela
  em que os dois podem discordar foi reduzida a uma única escrita síncrona, não
  eliminada.
- **Owner-token continua pendente:** duas abas ainda podem disputar; o protocolo
  garante que a importação falha honestamente, não que ela seja impedida.
- **C2/D/E/F não iniciados.**

## GOAL-17B-002D-C1 corretivo 055 — compensação endurecida (2026-07-27)

Auditoria independente 054: **APTO / Classe B**, com um achado **P1** na
compensação da importação lógica v2. Este corretivo fecha o achado e as lacunas
de teste diretamente ligadas a ele. **O C2 continua não iniciado.**

### O risco encontrado

`restoreRollingBackup` reescrevia (`setItem`) ou removia (`removeItem`) a cópia
rolante do core **incondicionalmente** depois de qualquer falha do W6, usando o
valor lido antes da operação. Entre aquela leitura e a compensação, outra aba ou
processo pode ter atualizado a cópia: a restauração apagaria um backup mais novo,
e o `removeItem` recriaria uma ausência que já não existia.

### A correção

A função foi **removida inteira**, junto das suas quatro chamadas e da última
ocorrência de `removeItem` no módulo. A política passou a ser:

- a cópia rolante é **auxiliar**; o canônico é a chave principal + geração ativa;
- depois de gravar `previousCoreRaw` nela, a cópia já é backup válido;
- a compensação **nunca** escreve nem remove a cópia, em nenhum caminho;
- cópia alterada por outra aba fica intacta; cópia ausente fica ausente; cópia
  ilegível não é escrita;
- **uma importação abortada pode deixar a cópia em `previousCoreRaw`** — seguro,
  porque esse raw é o core anterior verificado no W0 e guardado no journal, e
  **não altera o estado canônico**.

Falha da cópia antes do commit passou a **reler a chave principal**: só
`previousCoreRaw` autoriza compensação completa; `targetCoreRaw` ou terceiro
valor preservam o journal e devolvem `recovery-required`, sem sobrescrever nada.

Falha de `getItem` preserva o journal em qualquer fase (`storage-unavailable`
antes do commit, `recovery-required` a partir dele). `RawRead` deixou de carregar
`cause`, então a mensagem nativa do armazenamento não tem por onde vazar.

`isQuotaFailure` passou a exigir sinal estrutural (`error.name` conhecido, ou
código legado 22/1014 dentro de um `DOMException` real). `storage.ts` não foi
tocado.

O W8 ganhou um **readback do receipt depois da transição** `activating →
activated`: a primitiva não reconfere `stagedGenerationId` nem `targetCoreRaw`
dentro da própria transação, então o readback é o que impede o settlement quando
um deles foi mutado na janela. A primitiva IndexedDB e a fachada A2 **não foram
alteradas**.

O resolvedor ganhou o motivo `staged-generation-is-previous`: um receipt que
nomeia a geração anterior como preparada é estado impossível, e sem a guarda ele
avançaria para `prepare-core`.

### Antes / depois do comportamento crítico

| Situação | Antes | Depois |
| --- | --- | --- |
| falha do W6 com a cópia alterada por outra aba | cópia sobrescrita com o valor antigo | cópia intacta |
| falha do W6 com cópia ausente antes | `removeItem(backupKey)` | cópia fica com `previousCoreRaw`, nada é removido |
| falha da cópia com terceiro valor na chave principal | compensava como se nada tivesse sido aplicado | `recovery-required`, journal preservado |
| `getItem` da chave principal falha no W6 | receipt marcado `reverted` | journal preservado, `storage-unavailable` |
| `setItem` lança `TypeError('quota …')` | `reason: 'quota'` | `reason: 'storage-unavailable'` |
| `targetCoreRaw` mutado na janela do W8 | seguia para o settlement | `recovery-required`, receipt não liquidado |

### Testes

**Importador (51 novos, 76 → 127):** política da cópia rolante (7, incluindo
terceiro valor e core alvo já presente); classificação estrutural de quota (11,
cobrindo `QuotaExceededError`, `NS_ERROR_DOM_QUOTA_REACHED`, `DOMException`,
`TypeError` com "quota", `Error` comum com "quota", `AbortError`, `UnknownError`,
objeto arbitrário, `null` e string); falhas de `getItem` (6 fases: antes da
primeira leitura da chave, segunda leitura, readback da cópia, depois do
`setItem`, verificação pós-`activated` e inspeção final); janela do W8 (7
mutações imediatamente antes da transição); privacidade completa (5, com inspeção
recursiva de `cause`/`message`/`stack`/não enumeráveis, varredura de console e um
meta-teste que prova o inspetor); ramos do resolvedor (15, incluindo varredura de
**1.296 mundos** que exige o mundo exato por trás de cada ação com efeito).

**Primitiva (6 novos em `storage-indexeddb.test.ts`, 169 → 175):** fault
injection em cada um dos seis writes lógicos de
`stageHistoryGenerationForOperation` — primeira sessão, sessão intermediária,
última sessão, manifest, marcador de ordem e receipt atualizado — com o adapter
real sobre fake-indexeddb. Cada caso confere zero registro da geração nova, zero
manifest, zero marcador, receipt original byte a byte, `stagedGenerationId` e
`targetCoreRaw` ainda nulos, `activeGeneration` e `migrationGeneration`
inalteradas, nenhum completion receipt alterado e **fingerprint administrativo
idêntico ao inicial**. O teste de violação do índice único foi mantido.

Seeds embaralhadas: `11055`, `22055` e `33055` no importador, `44055` no adapter
— todas verdes.

### Validações

`npx vitest run` (**1584/1584**, era 1527), `npx tsc --noEmit`, `npm run build`,
`npm run build:mobile`, `npx eslint src` (baseline preservada: 12 erros, 6
avisos, **nenhum nos arquivos alterados**), `git diff --check` limpo.
`package.json` e `package-lock.json` inalterados.

### Continuação

- **Nenhum call site.** O importador continua referenciado só pelo próprio teste.
- **A recuperação com I/O não existe** e **nada roda no boot** — 17B-002D-C1-P0.
- **A janela TOCTOU do W8 continua aberta** entre as pré-condições conferidas
  pelo módulo e o início da transação da primitiva; fechá-la exige owner-token.
- **C2/D/E/F não iniciados.** O slice C **não** está completo.

## GOAL-17B-002D-C2 — recuperação da importação lógica v2 interrompida (2026-07-27)

O C1 ficou concluído **localmente** (dois commits na branch
`feat/gymflow-goal17b-import-journal`, nada empurrado) e passou pela auditoria
**056, Classe B**. O que ele deixou aberto era o item de maior risco do slice:
`resolveLogicalImportRecovery` apenas **decidia** o que fazer com uma importação
interrompida, e ninguém executava essa decisão. Uma queda no meio da sequência
W1–W9 deixava um journal correto e um aplicativo que não sabia o que fazer com
ele. Este slice entrega o motor que executa — testado, e ainda sem call site.

### A premissa que organiza tudo

**Depois de um reload o arquivo original não existe mais.** Não há `raw`, não há
payload lógico e não há como recalcular `targetCoreRaw`. Toda evidência sai de
duas fontes e só delas: o journal (que nomeia os dois mundos completos) e o
armazenamento atual.

A consequência não é uma preferência, é uma dedução:

| Estado do receipt | Mundo importado existe? | Direção |
| --- | --- | --- |
| `staged` (com ou sem G) | não — `targetCoreRaw` é nulo | converge **para trás** |
| `activating` / `activated` | sim — G e T estão materializados | converge **para a frente** |

### O que passou a existir

- **`recoverLogicalStorageImportV2`** — recebe runtime A2, adapter administrativo,
  `StorageLike`, chave principal e um `operationId` opcional. **Não** recebe raw,
  payload, preview, objeto de inspeção, `generationId` escolhido,
  `previousCoreRaw` nem `targetCoreRaw`. Sem relógio injetável: a recuperação não
  cunha instante nenhum.
- **`resolveLogicalImportRestartRecovery`** — segundo resolvedor **puro**, irmão
  e não substituto do primeiro. O do C1 continua puro e intocado.
- **Tipos `Pick` da recuperação** — o adapter recebe sete capacidades e o runtime
  três. `stageHistoryGenerationForOperation` e `beginStorageOperation` ficam de
  fora: criar geração ou operação nova nem compila.

### Política sem o arquivo original

- **`staged` sem G** — reverte com segurança, exigindo que `previousCoreRaw` e
  `previousGenerationId` ainda sejam o mundo atual. Nenhuma geração é criada.
- **`staged` com G e `targetCoreRaw` nulo** — confirma que G está inativa e que o
  core e o ponteiro ativo continuam sendo o mundo anterior, marca `reverted` e só
  então limpa G, com guarda tripla relida do armazenamento. Falha de limpeza gera
  **órfã segura** (`cleanupPending: true`), nunca perda de dados.
- **G ativa ou core diferente do anterior** — não reverte às cegas:
  `recovery-required`.

### Política do `activating` — os quatro mundos

| Mundo | `activeGeneration` | core | Ação |
| --- | --- | --- | --- |
| A | Prev | P | verifica G integralmente e ativa com CAS |
| B | G | P | verifica G e reexecuta o protocolo byte-exato do core |
| C | G | T | verifica o alvo e marca `activated` pela primitiva A1 |
| D | Prev | T | **não** nasce da ordem geração → core: `recovery-required` |

Mundos desconhecidos — terceira geração ativa, terceiro core, G ausente, T ou P
divergentes, receipt alterado, `migrationGeneration` preenchida, conclusão
pendente, múltiplos receipts não terminais — bloqueiam sem escrever.

### Política do `activated`

Liquida somente com o mundo alvo **inteiramente provado**: G e T presentes,
`activeGeneration === G`, core byte a byte igual a T, G verificada
criptograficamente, core físico v2 apontando para G, `migrationGeneration` nula,
`migrationStatus` `completed`, zero conclusão pendente e receipt único e
coerente. Faltando qualquer uma, não compensa e não reverte: `recovery-required`.

### Laço fechado

`MAX_RECOVERY_STEPS = 12`. O caminho mais longo — MUNDO A até `settled` — consome
sete passos. Depois de **cada** escrita o motor relê core, metadata, receipt e
snapshot administrativo e roda o resolvedor de novo: nunca assume que a escrita
anterior venceu. Sem recursão, sem `setTimeout`, sem espera por tempo, sem retry
por atraso. Limite atingido devolve `recovery-step-limit` com o journal inteiro.

### Antes / depois do comportamento crítico

| Situação | Antes (C1) | Depois (C2) |
| --- | --- | --- |
| Queda depois do W1 | receipt `staged` preso para sempre | `reverted`, mundo anterior intacto |
| Queda depois do W2 | geração órfã sem dono | `reverted` + G limpa com guarda tripla |
| Queda depois do W4 | receipt `activating` preso | avança até `settled` |
| Queda depois do W5 | geração ativa, core antigo | grava T byte a byte e liquida |
| Queda depois do W8 | receipt `activated` preso | liquida sem tocar core nem geração |
| Terceiro valor no core | nada a fazer | `recovery-required`, zero escrita |

### Testes

**Importador (89 novos, 127 → 216).**

- **Matriz de crash points (23 testes, 16 pontos).** Cada um parte do mundo
  anterior saudável, roda a implementação **real** do C1, corta a energia depois
  da escrita indicada, destrói adapter e fachada, cria instâncias novas sobre o
  mesmo banco e o mesmo `localStorage`, recupera, confere o mundo físico e prova
  idempotência. Os crash 10 e 11 têm quatro variantes cada (cópia rolante: falha
  antes de escrever, escreveu e lançou, readback indisponível, terceiro valor;
  chave principal: lançou antes de escrever, escreveu T e lançou, terceiro valor
  válido, terceiro valor ilegível, readback indisponível).
- **Prova de reinício real (7).** Instâncias diferentes, banco igual; o adapter
  recarregado nem sequer nasce aberto, e a fábrica de `generationId` **lança** se
  a recuperação tentar criar uma geração.
- **Limite de passos (1).** Fingerprint artificialmente instável faz o resolvedor
  pedir verificação para sempre; o retorno é `recovery-step-limit` entre 8 e 16
  passos, com footprint idêntico byte a byte.
- **Concorrência (2).** Duas recuperações em paralelo sobre o mesmo mundo: no
  máximo uma diz que avançou, nenhuma inventa `operationId` ou `generationId`, e
  o estado físico final é único e válido.
- **Idempotência.** Footprint completo — `localStorage` inteiro, metadata,
  gerações, manifests, **todos** os registros de **todas** as gerações, todos os
  receipts com `updatedAt` e o fingerprint administrativo — comparado byte a byte
  antes e depois. Cinco execuções seguidas não movem nada.
- **Estados ambíguos (22).** Terceira geração ativa, core terceiro valor, MUNDO D,
  receipt com G ou T divergente, receipt sem G, receipt sem T, G ausente, G
  adulterada, manifest ausente, `orderedDigest` divergente,
  `migrationGeneration` preenchida, `migrationStatus` incompleto, conclusão
  pendente, dois receipts não terminais, receipt de restore/reset/rollback,
  `operationId` que não corresponde, leitura da principal indisponível e
  IndexedDB indisponível.
- **Geração anterior (5).** Nenhum caminho chama `clearInactiveGeneration` sobre
  Prev; manifest, sessões e digest anteriores sobrevivem à reversão E ao avanço.
- **Privacidade (11).** Nove fases de falha provocadas uma a uma — leitura
  inicial, snapshot administrativo, verificação, ativação, cópia rolante, core,
  W8, liquidação e limpeza —, mais o sucesso completo. Varredura recursiva de
  propriedades enumeráveis e não enumeráveis, `name`, `message`, `stack`, `cause`,
  causas aninhadas, arrays, `Map`, `Set`, serializado e console.
- **Guards de call site (6).** `recoverLogicalStorageImportV2` e
  `resolveLogicalImportRestartRecovery` aparecem apenas no módulo e no próprio
  teste; nenhum componente, Provider, Context, `storage-hybrid` ou AdminPanel
  importa o módulo; nenhum arquivo Android o cita; nenhum boot o chama.
- **Resolvedor de reinício (14).** Tabela fechada mais varredura de **2.400
  mundos** que exige o mundo exato por trás de cada ação com efeito.

Seeds embaralhadas: `11057`, `22057`, `33057` e `44057` — todas verdes.

### Validações

`npx vitest run` (**1673/1673**, era 1584), `npx tsc --noEmit`, `npm run build`,
`npm run build:mobile`, `npx eslint src` (baseline preservada: 12 erros, 6
avisos, **nenhum nos arquivos alterados**), `git diff --check` limpo.
`package.json` e `package-lock.json` inalterados.

### Continuação

- **Nenhum call site.** O importador e a recuperação continuam referenciados só
  pelo próprio teste.
- **Nada roda no boot.** `hydrate` e `metadataMatchesV2` não foram tocados. Quem
  chama a recuperação antes da hidratação é o **slice D, obrigatório antes de
  qualquer exposição** — e não iniciado.
- **Não existe atomicidade única entre `localStorage` e IndexedDB**, e este slice
  não finge que existe.
- **O aplicativo NÃO recupera automaticamente no boot** e **a importação não está
  disponível ao usuário.**
- **A janela TOCTOU do W8 continua aberta**; fechá-la exige owner-token, que
  segue pendente para o E.
- **D/E/F não iniciados.**

## GOAL-17B-002D-D1 — recuperar importação interrompida antes da hidratação

### Ponto de partida

Slice C integrado à master pelo merge commit `4c6284da` (PR #6, pais `5b41f91a`
e `50838541`). Repositório principal sincronizado por fast-forward
(`25a7800 → 4c6284d`) e worktree nova em
`feat/gymflow-goal17b-boot-recovery`.

### Auditoria D0 — Classe B

Caminho real de boot, lido no código e não presumido:

1. `useEffect` de boot do `GymFlowProvider` (dependência `[setActiveView]`);
2. `historyAdapterRef.current ??= new IndexedDbWorkoutHistoryStorage()`;
3. `hybridRuntimeRef.current ??= createHybridStorageRuntime({...})`;
4. `runtime.retain()` — uma retenção por montagem;
5. `hydrateStorage()`: migração legada → `runtime.hydrate()` → publicação do
   estado → materialização dos completion receipts + `settleCompletion` →
   `setHydrated(true)`;
6. cleanup: `cancelled = true`, `mountedRef.current = false`, `runtime.close()`.

Classe B: a ordem não é ambígua e nenhum contrato do C1/C2 mudou, mas a
integração exige um orquestrador novo mais uma alteração controlada no Provider.

### Ordem final, provada por teste

1. preparar dependências de armazenamento (adapter + runtime híbrido);
2. **recuperação administrativa da importação** (`storage-boot-recovery`);
3. confirmar resultado terminal seguro;
4. só então `runtime.hydrate()`;
5. materialização de `recoveredCompletions` e `settleCompletion`, na posição já
   existente do fluxo híbrido;
6. publicação do armazenamento como pronto no Context.

`hydrate → recovery` é impossível: a barreira é a primeira instrução do
`hydrateStorage()`, antes inclusive da migração legada.

### Liberam a hidratação

`no-operation`, `settled`, `already-settled`, `reverted` e `already-reverted`.
`administration-unavailable` só libera após prova física read-only: metadados
administrativos totalmente vazios e chave principal ausente (instalação nova,
inclusive antes da migração legada suportada) ou envelope v1 válido.

### Bloqueiam a hidratação

`recovery-required`, `impossible-state`, `operation-conflict`,
`administration-conflicted`, `storage-unavailable`, `migration-incomplete`,
`recovery-step-limit`, `quota`, `verification-failed`, `activation-failed`,
`core-commit-failed`, `readback-failed`, qualquer status/motivo desconhecido e
qualquer exceção inesperada. Em `administration-unavailable`, core v2 válido ou
corrupt com `physicalVersion === 2`, além de leitura que lança, bloqueiam como
`blocked-storage-unavailable`. `steps > 0`, `operationId` não nulo ou qualquer
evidência administrativa parcial bloqueiam como `blocked-recovery-required`.

Raw corrupt sem versão v2 comprovável, corrupt com outra versão numérica e
unsupported não são hidratados como dados: recebem
`ready-for-blocked-storage-classification`, pulam a migração e só podem obter
`mode = blocked` do runtime. Isso preserva a recuperação legada explícita sem
transformar corrupção em sucesso.

### Antes / depois

- **Antes:** o boot ia direto para `runtime.hydrate()`. Uma importação lógica v2
  interrompida permanecia interrompida e o app hidratava sobre um mundo indeciso.
  `recoverLogicalStorageImportV2` não tinha nenhum call site.
- **Depois:** o boot roda a recuperação primeiro. Convergindo, hidrata igual a
  antes. Não convergindo, **não hidrata**: nada é publicado, nada é escrito, nada
  é apagado, e a UI de erro que já existia mostra uma mensagem constante.
  `recoverLogicalStorageImportV2` passa a ter **exatamente um** call site.

### Liberação mínima dos guards

O primeiro passe ficou bloqueado porque os guards 60, 195 e 197 ainda codificavam
o contrato C1/C2 de zero call site. A liberação 061 incluiu exclusivamente
`src/lib/storage-logical-import.test.ts` no escopo: os três testes continuam
varrendo todo `src/`, usam igualdade exata de caminhos e autorizam somente
`src/lib/storage-boot-recovery.ts` como consumidor de produção.
`commitLogicalStorageImportV2` conserva uma prova independente de zero call
site. Nenhum Provider, componente, arquivo Android ou UI chama o recovery
diretamente.

### Desbloqueio 062 — contrato legado preservado

O comando 061 parou corretamente em dois testes baseline: ambos exigiam que raw
corrompido sem v2 comprovável continuasse bloqueado, porém com as capacidades
legadas explícitas já existentes. Os testes estavam corretos e permaneceram
inalterados. O boot agora distingue hidratação normal, classificação bloqueada
read-only e bloqueio anterior ao runtime.

No caminho de classificação bloqueada, `runtime.hydrate()` serve somente para
obter `mode`, `physicalVersion` e `StorageIssue`; migração legada é ignorada,
defaults não são publicados, `storageBlockedRef` impede autosave/flush e
completion receipts não são consumidos. Se o runtime devolver `legacy-v1` ou
`hybrid-v2` inesperadamente, o Provider descarta o estado e bloqueia com mensagem
constante.

### Arquivos alterados

- `src/lib/storage-boot-recovery.ts` (novo)
- `src/lib/storage-boot-recovery.test.ts` (novo, 64 testes)
- `src/lib/storage-hybrid.ts` e `src/lib/storage-hybrid.test.ts` (autoridade
  explícita do Provider sobre capacidades em bloqueio pré-runtime)
- `src/lib/storage-logical-import.test.ts` (somente guards 60, 195 e 197)
- `src/providers/GymFlowContext.tsx` (import + barreira no efeito de boot)
- `src/providers/GymFlowContext.storage-recovery.test.tsx` (novo, 21 testes)
- `docs/DECISOES.md`, `docs/GOALS_LOG.md`, `docs/PENDENCIAS.md`,
  `docs/storage/GYMFLOW_STORAGE_V1_SAFE.md`

### Validações

Focados: orquestrador **64/64**, Provider D1 **21/21**, baseline imutável do
Context **23/23**, importação lógica **216/216** e híbrido **49/49**. Os guards
60, 195 e 197 passaram também isoladamente, com igualdade exata e um único teste
selecionado em cada comando.

Shuffles verdes: boot `11062` e `22062` (**64/64** cada), Provider D1 `33062`
(**21/21**), Context baseline `44062` (**23/23**) e importação lógica `55062`
(**216/216**).

`npx vitest run`: **46 arquivos e 1758/1758 testes**. `npx tsc --noEmit`,
`npm run build` e `npm run build:mobile` aprovados. `npx eslint src` preservou
exatamente a baseline de **12 erros e 6 warnings**; nenhum diagnóstico novo foi
introduzido, e os arquivos alterados fora do Provider passam isoladamente com
zero diagnóstico. Os três warnings do Provider são efeitos preexistentes, fora
das linhas D1. `git diff --check` limpo; `package.json` e `package-lock.json`
inalterados.

### Continuação

- **O D1 é só a barreira de boot.** Restore manual, rollback manual, reset,
  retenção automática e limpeza geral de gerações órfãs **não** foram
  implementados.
- **Nenhuma UI nova.** O bloqueio reutiliza `storageHealth` e o
  `StorageRecoveryNotice` que já existiam.
- **A importação continua indisponível ao usuário** e
  `commitLogicalStorageImportV2` continua **sem nenhum call site**.
- **Owner-token continua pendente para o E**, e com ele a janela TOCTOU do W8 e a
  serialização entre abas.
- **D2/E/F não iniciados.**
- **D1 concluído localmente.** O P0 identificado na auditoria foi resolvido; a
  ambiguidade P2 de `administration-unavailable` foi reduzida sem alteração no
  C2. Um core v2 nunca é tratado como instalação nova quando a administração
  está indisponível. Isso não declara o slice D inteiro concluído.

## GOAL-17B-002D-D2 — administração auditada e retenção conservadora

- **D1 integrado:** a base é o merge commit `42356f07`.
- **Auditoria D2-0:** resultado global **Classe B**. Restore, rollback e reset
  foram classificados como **Classe C** e não receberam implementação. Retenção
  foi classificada como **Classe B**.
- **Auditoria independente do primeiro commit:** resultado **Classe C**. Foram
  comprovados vazamento do fingerprint privado, validação insuficiente de
  metadata/manifests/receipts e uso indevido de evidência estrutural como prova
  física. O primeiro commit foi preservado e recebeu um corretivo separado.
- **Contrato corrigido no subconjunto seguro:** planejador puro e determinístico,
  sem adapter, escrita, executor ou deleção. A saída contém somente `status`,
  motivo fechado e `delete: []`; fingerprint e ids administrativos foram
  removidos.
- **`policy-required` agora é estrito:** exige migration concluída, ponteiros de
  metadata e top-level iguais, exatamente uma geração ativa e não staged, um
  manifest correspondente, registros sem referências desconhecidas e ausência
  total de operation receipts, completion receipts, `cleanupPending` e gerações
  não ativas. Todo o restante retorna `blocked`.
- **Sem prova física improvisada:** `HistoryGenerationSummary.verified` é apenas
  diagnóstico. Qualquer geração histórica, inativa, órfã, de migração ou
  aparentemente verified bloqueia; nenhuma vira lixo ou candidata à deleção.
- **Receipts falham fechado:** qualquer operation receipt — import, restore,
  rollback, reset, kind/status desconhecido ou terminal — bloqueia. Qualquer
  completion receipt, válido ou inválido, também bloqueia.
- **Semânticas não improvisadas:** restore não ganhou uma fonte híbrida
  arbitrária; rollback físico não foi promovido a rollback completo; reset não
  ganhou defaults ou recovery inventados. Os protocolos existentes de import,
  boot recovery, hidratação e completion receipts permaneceram inalterados.
- **Provas locais corretivas:** cobrem todas as contradições da auditoria,
  receipts válidos e malformados, gerações históricas, snapshot congelado,
  privacidade recursiva e meta-teste do inspetor, zero call site e ausência de
  integração com Provider/UI/Android.
- **Limites:** zero UI e zero call site de usuário. Owner-token continua no E e
  Android/WebView no F. Não há executor de retenção, restore híbrido, rollback
  administrativo, reset ou política aprovada. D2 continua parcial; E e F não
  foram iniciados e o GOAL-17B-002D inteiro não está concluído.

## GOAL-17B-002D-D2-070 — evidência física read-only para retenção

- **Base:** `4430ffc5769a1626513e93a73bb42ef1ea6ba672`, já contendo o planner
  conservador integrado pelo PR #8.
- **Auditoria:** **Classe B**. O snapshot administrativo atômico enumera
  gerações, manifests e referências; o snapshot físico por geração combinado
  com `verifyHistoryGeneration` recalcula a prova oficial. Nenhum contrato de
  escrita ou exclusão precisou mudar.
- **Antes:** qualquer geração além da ativa bloqueava o planner por
  `physical-proof-required`; não existia uma camada que verificasse todas as
  gerações sem lhes atribuir autoridade de retenção.
- **Depois:** `storage-retention-evidence.ts` executa snapshot A → prova física
  de cada geração → snapshot B, exige estabilidade e devolve somente enums
  fechados e contagens deep-frozen.
- **Privacidade:** ids físicos ficam apenas em `Map`s locais. Raws, sessões,
  treinos, fingerprints, digests, receipts completos, mensagens do IndexedDB,
  stack e `cause` não aparecem no diagnóstico público.
- **Invariância física:** teste sobre o adapter IndexedDB real confirma
  fingerprint, metadata, summaries, manifests e receipts idênticos antes e
  depois da inspeção.
- **Escopo preservado:** planner existente inalterado, zero call site de
  produção, zero política, executor, deleção ou recovery. E/F não iniciados.
- **Validação final:** foco read-only 23/23 e regressões obrigatórias 797/797;
  suíte completa 48 arquivos e 1826/1826 testes; `npx tsc --noEmit`,
  `npm run build`, `npm run build:mobile` e `git diff --check` aprovados.
  ESLint dos dois arquivos novos sem diagnósticos; baseline global idêntica à
  base canônica em 12 erros e 6 warnings. `package.json` e
  `package-lock.json` inalterados.
