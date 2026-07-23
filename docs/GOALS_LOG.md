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
