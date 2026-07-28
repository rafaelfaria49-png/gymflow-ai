# Decisões

Registro de decisões tomadas com autonomia durante os GOALs (1 linha por decisão).

## GOAL-24 — Registro estruturado da substituição (2026-07-22)

- **Snapshot do original = `plannedExerciseId` (reusado) + `plannedExerciseName` +
  `plannedMuscleGroup`:** os dois campos novos guardam nome/grupo; o id continua no
  `plannedExerciseId` já existente. Só preservado na PRIMEIRA troca.
- **`markEntrySwapped` recebe um options object** `{ original, reasonCode, reasonNote,
  swappedAt }`. `original` é o exercício ANTES da troca; `exercise` é o já-executado.
  Na 1ª troca captura o snapshot; nas seguintes preserva-o e atualiza só motivo/nota/
  `swappedAt`. `swappedAt` vem de fora (contexto) para manter a função pura.
- **Nota normalizada no domínio** (`normalizeSwapReasonNote`): `trim`, vazio → ausente,
  limite de 120 chars. A nota da troca ATUAL sempre substitui a anterior (removida
  quando a troca atual não tem nota) — não herda nota de troca passada.
- **Motivo obrigatório na UI; nota obrigatória só p/ `other`.** Os substitutos ficam
  desabilitados até o motivo (e a nota de `other`) serem válidos. `maxLength=120` no
  input espelha o limite do domínio.
- **Chips de motivo com `min-h-[44px]`** (regra de toque de 44px do design system),
  em vez dos 36px dos chips do Construtor — são o gate principal antes de trocar.
- **`reasonCode` default `preference` no contexto** como rede defensiva (a UI sempre
  envia um motivo válido; o default só existe se `swapExerciseInActiveWorkout` for
  chamado sem meta).
- **`discomfort` é só um motivo registrado**, sem adaptação automática (nada de mudar
  volume/carga/progressão) — coerente com "não implementar adaptação por dor".
- **Toast e XP mantidos:** a substituição continua com `addXp(20, …)` e o mesmo toast
  ("Substituição aplicada sem alterar o objetivo muscular…"). O texto "Substitui
  &lt;original&gt; • &lt;motivo&gt;" é elemento SEPARADO no card do treino ativo
  (via `buildSwapView`), não o toast.
- **Fallback legado honesto:** `buildSwapView` usa "Original não registrado" quando um
  registro `swapped` legado (pré-GOAL-24) não tem o nome do original; sem motivo/nota,
  os campos ficam ausentes — nunca inventa dado.
- **Detalhe no histórico** (`SessionDetailModal`): bloco âmbar por exercício swapped com
  Planejado × Executado + Motivo + Nota (quando houver). Storage segue v1 (campos novos
  opcionais).

## GOAL-23B — Experiência visual da sessão (2026-07-22)

- **Apenas apresentação, sem mudar o domínio:** nada em `workout-session-domain.ts`/
  `migration.ts`/`Context`/storage foi alterado. A camada nova (`workout-session-view.ts`)
  é pura e só traduz status/origem/execução em labels/estilos/contagens/resumo.
- **Fallback deriva, não inventa:** sessão sem `status` → `deriveSessionStatus`;
  exercício sem `entryStatus` → `deriveExerciseEntryStatus`; sem `entryOrigin` →
  `planned`. Para finalizadas, campo armazenado === derivado (a finalização deriva),
  então ler ou derivar dá o mesmo; para ativas, só derivar reflete o progresso real.
- **Sessão ativa deriva execução ao vivo:** o `entryStatus` fica em `planned` até a
  finalização, então os badges/contagens do treino ativo usam `deriveExerciseEntryStatus`
  direto (não `resolveEntryStatus`). `ExerciseExecutionBadge`/`SessionStatusBadge`
  aceitam `status` explícito para a prévia da finalização.
- **"Pulado" só após finalizar:** no treino ativo, séries presentes mas nenhuma
  concluída é "ainda não iniciado", não "puladoo". O badge de execução ao vivo só
  renderiza `performed`/`partial`; `skipped` aparece no detalhe do histórico e na
  prévia do resumo final.
- **Prévia do resumo final usa `buildSessionPreview`:** ignora o `status: 'active'`
  armazenado e deriva `completed`/`partial`/`abandoned` das séries — o que a sessão
  vai se tornar ao concluir. A finalização em si não mudou.
- **Detalhe é modal:** `SessionDetailModal` (ESC/overlay fecha, body rolável, dark +
  verde-lima). Volume/PRs só quando disponíveis (opcionais); calorias/XP sempre.
  Renderiza legado sem quebrar nem inventar dados.
- **Histórico clicável + chave estável:** card vira `role=button` (Enter/Espaço +
  clique) abrindo o detalhe; `key={idx}` → `key={sess.id}`. Cálculos/métricas/
  gráficos/ordenação preservados.
- **Origem destacada só se não-planejada:** no treino ativo o badge de origem só
  aparece para `added`/`swapped` (evita ruído de "Planejado" em todo exercício).
- **Botão `+ Adicionar Série` mantido** (duplica a última); cancelamento continua
  descartando; dor/desconforto fora; motivo de substituição e diff plano×execução
  avançado ficam para o GOAL-24.

## GOAL-TF-F — Integração e QA final do lote Tempo–Foco (2026-07-21)

- **GOAL exclusivamente documental e de QA:** consolida A–E sem alterar código.
  Único commit toca apenas `docs/**`. Qualquer achado em código foi registrado como
  pendência/follow-up, nunca corrigido aqui.
- **Base fixada em `origin/master` (`5199c734`), não na `master` local:** o worktree
  nasceu direto de `origin/master`; a `master` local (`17b5d331`, GOAL D) ficou
  defasada de propósito e não foi atualizada.
- **Veredito Classe B, não A:** a QA obrigatória **manual/visual** e a inspeção do
  "1 Issue" do Next DevTools não puderam ser executadas (extensão do Chrome não
  conectada). Como Classe A exige QA manual executada + issue identificada, o lote
  fica em **B** (testes, TypeScript, build web e build mobile verdes; lint global
  **vermelho** por dívida preexistente; 0 P0/P1 introduzido pelo lote; restante
  P2/P3). Não se declara QA que não foi feita.
- **Matriz determinística atribuída a testes automatizados + inspeção estrutural:**
  conforme §19 do enunciado, cobertura por 600 testes substitui a execução manual
  das combinações cujas regras já são determinísticas. O que é puramente visual
  (pixels, safe-area, teclado runtime, overlay do DevTools) ficou como não
  executável neste ambiente.
- **Relatório dedicado criado:** `docs/builder/GYMFLOW_TEMPO_FOCO_QA_FINAL.md`. A
  decisão de criá-lo (em vez de só usar os três docs existentes) é por
  rastreabilidade — a matriz completa, os gates e a investigação do "1 Issue"
  concentrados num só lugar mantêm GOALS_LOG/DECISOES/PENDENCIAS enxutos.
- **ESLint reconciliado sem tocar código:** `npm run lint` (projeto inteiro) é
  **vermelho** (exit 1) — 12 erros + 6 warnings, todos pré-existentes; provado pelo
  diff do lote não incluir nenhum dos 8 arquivos com erro nem o nono arquivo
  (`EvolutionDashboard.tsx`, somente warning de `no-img-element`). A "baseline de 3
  warnings" citada nos GOALs A–E era o lint **escopado aos arquivos tocados**, não o
  do projeto inteiro.

### Correspondência dos ADRs Tempo–Foco (TF-001..TF-007)

**Não existe documento físico `ADR-TF-00X` no repositório** — as entradas dos GOALs
A, B e E registram explicitamente essa ausência ("MASTERPLAN físico ausente", "o
documento físico do ADR-TF-007 não existe no repositório"). As decisões vivem nas
seções deste `DECISOES.md` e no `GOALS_LOG.md`. A numeração TF-00X aparece apenas
como **referência** dentro dos enunciados/entradas. Tabela de correspondência (sem
renumerar nada, sem inventar ADR ausente):

| ADR | Referência literal no repo | GOAL responsável | Commit(s) | Onde a decisão está registrada |
|-----|-----------------------------|------------------|-----------|-------------------------------|
| TF-001 | **não referenciado** | ≈ GOAL-TF-A (tempo disponível canônico) | `dd5f9cc`/`b0ddfef` | DECISOES §GOAL-TF-A (bullet "tempo disponível e duração estimada têm papéis distintos") |
| TF-002 | **não referenciado** | ≈ GOAL-TF-A (perfil recomendado) | `dd5f9cc`/`b0ddfef` | DECISOES §GOAL-TF-A (bullet "recomendação determinística e apenas textual") |
| TF-003 | **não referenciado** | ≈ GOAL-TF-A (time-fit / faixa de exercícios) | `dd5f9cc`/`b0ddfef` | DECISOES §GOAL-TF-A + `workout-time-fit.ts`/tests |
| TF-004 | citado em GOAL-TF-B e -C | GOAL-TF-B (picker por foco) | `28aad29`/`e52f60f` | DECISOES §GOAL-TF-B; `GYMFLOW_WORKOUT_PICKER_BY_FOCUS.md` |
| TF-005 | citado em GOAL-TF-C | GOAL-TF-C (badges/papel) + CORRECTIVE-004 | `d9de0aa`/`1026c12` | DECISOES §GOAL-TF-C e §GOAL-TF-C-CORRECTIVE-004 |
| TF-006 | citado em GOAL D ("antigo GOAL-20") | GOAL D (sugestão preview) | `17b5d33` | DECISOES §GOAL D; `GYMFLOW_WORKOUT_SUGGESTION.md` |
| TF-007 | citado em GOAL-TF-E (doc físico ausente) | GOAL-TF-E (nomes) | `5199c73` | DECISOES §GOAL-TF-E |

Detalhe por ADR (status · decisão-chave · riscos residuais · validação · follow-up):

- **TF-001..003 (GOAL-TF-A, integrado `b0ddfef`):** *status* integrado em
  `origin/master`. *Decisão:* `ProgramDay.targetMinutes` é entrada canônica com
  precedência `day.targetMinutes ?? user.duration ?? default(perfil)`; recomendação
  de perfil/faixa determinística e só textual (±5 min, 1–12 exercícios). *Riscos:*
  heurísticas de produto pendentes de revisão profissional; **numeração TF-001..003
  não é literal** (correspondência conceitual). *Validação:* `workout-time-fit.test.ts`
  (21) + `training-plan-assessment.test.ts` (15). *Follow-up:* recalibrar só após uso
  real (PENDENCIAS).
- **TF-004 (GOAL-TF-B, `e52f60f`):** *status* integrado. *Decisão:* picker por foco
  com um resolver único (lista/legado/contadores), abas pela taxonomia, `Todos` por
  último, busca e aba independentes; `filterExercisesByDayFocus` mantém assinatura.
  *Riscos:* dependência circular `workout-builder↔workout-picker` (P3); sem teste DOM
  (P3). *Validação:* `workout-picker.test.ts` PART15-17..22/26/27. *Follow-up:* toggle
  de abrangência.
- **TF-005 (GOAL-TF-C + CORRECTIVE-004, `1026c12`):** *status* integrado, com
  corretivo P1. *Decisão:* partição por papel (Principais→Sinergistas→Legado) em abas
  de foco; **aba Todos é lista plana** (união discriminada grouped|flat), sem papel/
  badge sem foco ativo. *Riscos:* fonte de 8px nas badges (P3); sem teste DOM (P3).
  *Validação:* `workout-picker.test.ts` PART15-23..25 + P1-01..06. *Follow-up:* toggle
  de sinergistas; curadoria de equipamento.
- **TF-006 (GOAL D, `17b5d33`):** *status* integrado. *Decisão:* motor de sugestão
  puro/determinístico (sem IA/rede/`Math.random`), preview que só acrescenta, teto por
  time-fit reduzido no retorno, equipamento só exclui com certeza, restrições viram
  aviso. *Riscos:* rótulo "GOAL D" fora do padrão `GOAL-TF-D` (achado documental do
  GOAL F). *Validação:* `workout-suggestion.test.ts` #29–#38. *Follow-up:* GOAL-33A
  para elevar confiança do catálogo.
- **TF-007 (GOAL-TF-E, `5199c73`):** *status* integrado (= `origin/master`).
  *Decisão:* `sourceProgramName` separa nome do PROGRAMA do nome do DIA no caminho
  legado de `createInitialDraft`; sem ele cai em `DEFAULT_PROGRAM_NAME`, nunca no nome
  do dia. *Riscos:* documento físico do ADR-TF-007 ausente (decisão testada contra o
  contrato de comportamento, não contra texto). *Validação:*
  `workout-program-normalization.test.ts` (regras 1–7). *Follow-up:* deduplicação de
  cópias (GOAL-10.5) permanece fora de escopo.

## GOAL D — Sugestão assistida com preview (2026-07-20)

- **Motor puro e determinístico, sem nova dependência:** `buildWorkoutSuggestionPreview` é o antigo GOAL-20 anunciado em `filterExercisesByDayFocus`; entra como camada de ranking/distribuição sobre `matchesDayFocus`, sem IA, rede, `Math.random` nem alteração automática do treino.
- **`createDefaultExerciseSlot` é a fonte única do slot default:** `handleAddExercise` foi refatorado para reusá-la, garantindo por construção que "aplicar sugestão" produz slots idênticos aos da adição manual (defaults do GOAL-10.5).
- **Pesos de distribuição são aditivos e nomeados:** `base + groupSizeBonus[classe] + primaryFocusBonus`; repartição por maior quociente (D'Hondt) com empate pela ordem da taxonomia. Nunca proporção fixa universal — Costas+Bíceps dá peso 4×2 (~4+2).
- **Foco principal = primeiro foco declarado:** como o dia guarda `muscleGroupIds` já normalizado pela ordem da taxonomia, o primeiro é o de menor ordem (Costas antes de Bíceps), coerente com o QA.
- **Teto = faixa recomendada + time-fit, e o retorno reduz o teto:** acrescenta um exercício por vez até `analyzeWorkoutTimeFit` entrar em `within-target` (ou antes de estourar); `RETURN_REFERENCE_MODIFIERS` reduz o teto (piso 1) para quem está retornando — daí "retorno reduz teto".
- **Equipamento só EXCLUI com certeza:** quando o exercício tem equipamento curado (ou resolvido exato/alias) fora do perfil. Classificação legada/genérica ou equipamento desconhecido não exclui — vira aviso honesto de "não confirmado", nunca uma afirmação falsa de disponibilidade.
- **Restrições não são filtradas, são avisadas:** o catálogo atual (126 exercícios legados, sem contraindicação estruturada) não permite filtrar restrições deterministicamente; o preview avisa e pede revisão em vez de fingir que aplicou.
- **`already-fits` cobre `within-target` E `over-target`:** um dia já dentro OU acima do tempo disponível não recebe adições; o preview explica que nada será adicionado e "Aplicar" fica desabilitado.
- **`applySuggestionToDay` só acrescenta:** usa `updateDaySlots` e faz `[...existentes, ...novos]`; nome, foco, tempo, perfil e slots existentes ficam intocados (mesmos objetos). Preview vazio devolve o mesmo draft, sem mutação.
- **Preview calculado só com o modal aberto (`useMemo` guardado por `suggestionOpen`):** evita recomputar a cada render do Construtor; o botão fica em `WorkoutDaysEditor`, abaixo de "Adicionar".
- **Sem texto "IA" e sem diálogo nativo:** o modal reusa os tokens do `ExercisePickerModal` (dark + verde-lima, toque 44px); avisos em `amber-400`, coerente com o restante do Construtor.

## GOAL-19B.2A (2026-07-18)

- **`setActiveView` continua sendo a navegação pública única:** o Context ganhou um guard transitório central, não um segundo sistema de navegação; toda superfície existente fica protegida sem duplicar diálogos em menus.
- **Confirmação pertence ao Builder:** o Context entrega uma continuação idempotente e não usa `window.confirm`; o Builder guarda o destino, renderiza o `ConfirmDialog` existente e consome exatamente uma navegação após “Sair sem salvar”.
- **Logout sujo também é transacional:** limpeza de usuário/storage fica na continuação bloqueada; confirmar executa logout, cancelar preserva integralmente o draft.
- **“Concluir sem planejar” salva:** a ação valida exercícios, persiste e marca a assinatura antes de abrir Meus Treinos; não atribui novo dia ao calendário.
- **`beforeunload` é complementar e condicional:** um único listener existe apenas com assinatura suja e é removido ao salvar ou desmontar; nenhuma mensagem nativa customizada foi criada.
- **Ausência de `programDayId` só é resolvida quando inequívoca:** programa canônico de um dia recebe o ID real; multi-dia continua ambíguo; ID informado e removido continua inválido; dia treinado não é reconciliado.
- **Dias são lidos por resolução tipada:** `canonical`, `legacy-flat` e `empty` impedem crash sem transformar conteúdo flat em dia canônico durante leitura. O Planejador nunca inventa ID para o legado.
- **Persistência permanece v1:** guard/destino não são persistidos; nenhum campo de storage, programa seed, exercício, progressão, volume ou duração mudou.

## GOAL-19B.1 (2026-07-18)

- **Integração usa uma implementação canônica por responsabilidade:** ações guiadas continuam no Context, mas `saveCustomProgram`, `weeklyPlan`, sessão ativa e histórico usam os refs/atualizadores do GOAL-19A.1; não há espelho manual concorrente de `user.weeklyPlan`.
- **Excluir programa equivale a invalidar apenas vínculos futuros:** dias não treinados recebem o mesmo `planningIssue: 'missing-program-day'` e aviso de nova escolha usados quando um dia é removido; dias treinados retornam integralmente intactos.
- **Origem não é vínculo destrutivo:** `sourceProgramId`/`sourceProgramDayId` são metadados opcionais do snapshot. Excluir o programa nunca cancela a sessão ativa nem altera o histórico, que preservam inclusive essa origem histórica.
- **Templates continuam estruturais:** modo em branco, frequência e templates criam dias/estrutura sem escolher exercícios; integrar salvamento seguro não antecipa o GOAL-20.
- **Multi-dia é explícito em todas as ações da lista:** um dia canônico inicia com seu ID; vários dias abrem o detalhe/seletor; programa vazio não inicia. Uma lista achatada v1 com exercícios é tratada explicitamente como um único treino legado, sem servir de fallback para programas canônicos.

## GOAL-19B (2026-07-17)

- **"Torso / Pernas 4 dias" foi descartado por duplicação semântica** com "Superior / Inferior 4 dias" (Torso = Peito+Costas+Ombros+Braços = Superior; Pernas = Inferior). Ficaram **6 templates** úteis, dentro da faixa 5–7 exigida.
- **"Corpo inteiro 3d" e "Retorno 3d" coexistem** porque diferem em `volumeProfile` (standard vs compact) e propósito; um teste garante que nenhum par de templates colida em (estrutura muscular + volume + flag de retorno).
- **Template nunca contém exercícios nem vira identidade do programa:** a conversão cria ids novos e `slots: []`; `WorkoutProgram.exercises` (achatado) nunca é recriado para customs novos (regra herdada do GOAL-19A).
- **Retorno afeta só o `volumeProfile` inicial, nunca o nível:** um dia que começaria em "Alto volume" nasce em "Padrão"; `experienceLevel` é preservado (retorno mantém o nível).
- **Frequência é sugestão editável (1–7):** o número inicial vem do perfil; frequência ausente/inválida cai para 1 dia, sem inventar divisão muscular a partir do número de dias.
- **Exclusão limpa só referências futuras do `weeklyPlan`** (dia pede nova escolha, `exerciseCount: 0`, sem card quebrado); uma entrada `trained` é preservada integralmente, inclusive nome, resumos e IDs históricos.
- **Sessão ativa e histórico são intocáveis por construção:** `WorkoutSession` pode guardar `sourceProgramId` como metadado opcional do snapshot, não como vínculo vivo. Excluir um programa nunca apaga a sessão ativa nem reescreve o histórico; a origem histórica permanece registrada.
- **Seed nunca é editado nem excluído:** "Usar como base" cria um custom novo (ids novos, sem "— Cópia") e abre no Construtor; "Duplicar" (só custom) cria cópia com "— Cópia". O menu de seed nunca mostra "Excluir".
- **`openWorkoutBuilder` ganhou 3º parâmetro opcional aditivo (`creationStep`)** para o estado vazio deep-linkar a criação guiada; as chamadas de 2 args seguem inalteradas — o contrato existente não quebrou.
- **`useProgramAsBase` renomeado para `createProgramFromBase`:** um método cujo nome começa com "use" dispara falso positivo do `react-hooks/rules-of-hooks` nos call sites; o nome sem "use" resolve sem gambiarra.
- **Sincronização de aba sem efeito:** a lista "Meus Treinos" inicializa `kind` a partir do contexto (a aba remonta ao voltar do Construtor) e o clique em "Duplicar" seta `kind='mine'` no handler — evita um `useEffect` com `setState` (regra `react-hooks/set-state-in-effect`, já um débito pré-existente no projeto).
- **Duração média do card memoizada por assinatura leve** (`id:dias:slots`): a estimativa só recalcula quando a estrutura muda, nunca a cada render (PART 11).
- **Código novo usa só tokens/classes que geram CSS** (`gym-accent`, `gym-rose`, `gym-emerald`, `amber-400` etc.); o token morto `gym-amber` em `ActiveWorkoutPage` **não** foi corrigido (fora do escopo — segue em PENDENCIAS).
- **Sem drag-and-drop e sem dependência nova:** a reordenação de dias segue por botões ←/→ do GOAL-19A; DnD continua fora de escopo.

## GOAL-19A (2026-07-17)

- **Gate G2 aprovado pelo Founder** é o pré-requisito deste GOAL; as faixas, o peso 0,5 dos sinergistas e a fórmula de duração do GOAL-22 são consumidos como estão, sem reabrir a discussão.
- **`weeks[0].days` é a fonte canônica** dos programas customizados; `WorkoutProgram.exercises` (achatado) nunca é recriado a partir dos dias — programas novos gravam `[]` e uma lista pré-existente é preservada como está (não duplicar, mas também não destruir).
- **A regra do GOAL-10.5 "1 programa = 1 dia" fica obsoleta:** ela existia para não sobrescrever um dia irmão; agora o Construtor carrega o programa inteiro e os irmãos são editados juntos.
- **`ProgramDay` ganhou campos aditivos e opcionais** (`dayNumber`, `muscleGroupIds`, `customName`, `targetMinutes`): dias seed e dias pré-GOAL-19A não os têm e continuam válidos; o storage v1 não deep-valida programas, então o roundtrip JSON é seguro.
- **`dayNumber` é projeção da posição, nunca identidade:** persistido só para os consumidores exibirem sem plumbing de índice, e recalculado a cada normalização. Quem identifica o dia é o `id`.
- **Nome do dia sem o número embutido:** `ProgramDay.name` guarda o nome final (`customName || autoName`), e `programDayDisplayLabel` compõe "Dia N — Nome" só quando há `dayNumber`. Embutir o número no `name` renomearia programas antigos ("Meu Treino" → "Dia 1 — Meu Treino") e quebraria o roundtrip exigido pelo GOAL.
- **Nome antigo é reconstruído como `customName`:** se o `name` persistido não é o que o gerador automático produziria para aquele foco, só pode ter vindo do usuário. É isso que preserva, sem perda, o nome de programas de um dia só.
- **`openWorkoutBuilder` manteve a assinatura:** `programId` passou a significar "edite este programa" e `dayId` "abra neste dia". Por isso "Editar" no Planejador e em Meus Treinos já abre o programa inteiro sem alterar os chamadores — a integração com o Context ficou em zero mudança no caminho de leitura.
- **Resumos de nome conservadores:** só `quadriceps+hamstrings+glutes → "Pernas"` e `biceps+triceps → "Braços"`, e apenas com o conjunto completo. Panturrilha nunca é absorvida em "Pernas".
- **`SHORT_LABEL_OVERRIDES` (core/legs_general/traps):** a taxonomia continua a fonte da verdade; o mapa só encurta rótulos que ficariam ruins dentro de um nome composto ("Ombros e Abdômen/Core" → "Ombros e Core"), como os chips pedidos pelo GOAL.
- **`LEGACY_GENERIC_COVERAGE` (legs_general → quadriceps/hamstrings/adductors/abductors):** nenhum dos 126 exercícios tem `primaryMuscleGroupId` hoje, então nada resolve para quadríceps/posterior. Sem isso, filtrar por "Quadríceps" devolveria lista vazia e a análise afirmaria "sem trabalho direto para posterior" com a Mesa Flexora no dia — uma afirmação falsa. O mapa diz apenas "não é possível afirmar nem negar", sempre com a origem legada à mostra. Não é substituição automática; a cura é o GOAL-33A.
- **Ausência só é afirmada quando é verificável:** glúteos e panturrilhas têm grupo legado próprio → a ausência deles continua sendo afirmada; quadríceps/posterior viram "classificado de forma genérica".
- **Volume do dia não é comparado com a faixa semanal:** comparar um dia isolado com uma referência semanal, sem o contexto dos outros dias, seria desonesto. A comparação só existe no painel do programa.
- **Painel chamado "Análise do programa", nunca IA nem "otimizado":** não existe otimização; são números lidos e avisos textuais.
- **`ExerciseSlot` continua sem `id`:** adicionar `slotId` exigiria tocar `mock/programs.ts`/`progression.ts` (intocáveis neste GOAL) e criaria slots seed sem id. Identidade do slot = índice no dia; `slotId` fica para o GOAL-23A.
- **Fábrica de IDs própria (`workout-builder-id.ts`), sem dependência nova:** `crypto.randomUUID` quando disponível, `getRandomValues` depois, e contador monotônico + relógio como último recurso. Tira `Date.now()` de dentro do componente (dois cliques no mesmo ms geravam ids iguais) e torna os helpers testáveis.
- **Avisos usam `amber-400` (paleta padrão do Tailwind), não `gym-amber`:** `--color-gym-amber` não existe no `@theme`, então `text-gym-amber` não gera CSS algum (verificado no CSS compilado: 0 ocorrências, contra `.text-gym-rose{color:var(--color-gym-rose)}`). Corrigir o token está fora da allowlist deste GOAL — ver PENDENCIAS.
- **Rótulo do card de treino custom passou a depender da estrutura real** (`N dias` / `N exercícios`): contar só o primeiro dia diria "5 exercícios" para um programa de 4 dias.
- **Teto de 7 dias por programa:** guarda defensiva de integridade, não recomendação de treino.

## GOAL-22 (2026-07-16)

- **API de duração legada preservada exatamente:** `estimateWorkoutDuration` usa o novo motor em modo de compatibilidade; a migração visual para o breakdown detalhado exige decisão futura.
- **Faixas são referências de produto:** nunca recebem nomes clínicos como volume mínimo efetivo, máximo recuperável ou limite seguro.
- **Atleta começa com a faixa de avançado:** nível esportivo não autoriza volume extremo automático.
- **Retorno altera somente a referência:** fatores por pausa são heurísticas configuráveis; o nível e o plano permanecem intactos.
- **Exposição secundária começa em 0,5:** fica separada de séries diretas e precisa de aprovação no Gate G2.
- **`legs_general` permanece indivisível:** o motor não infere quadríceps, posterior ou glúteos antes da curadoria.
- **Descanso não é duplicado na duração detalhada:** conta somente entre séries; depois da última entra a transição.
- **Volume semanal exige ocorrências explícitas:** um treino não é multiplicado automaticamente pela frequência total do perfil.
- **Sem UI neste incremento:** testes/harness exercitam os cenários sem criar superfície artificial ou ação “Aplicar”.
- **Gate G2 não está aprovado:** faixas, fatores, tempos e sugestões aguardam revisão do Founder antes do GOAL-19A.

## GOAL-21 (2026-07-16)

- **Experiência e continuidade são dimensões ortogonais:** `level` continua sendo a experiência escolhida; `trainingStatus` informa apenas `active` ou `returning`. Uma pausa nunca rebaixa automaticamente o aluno.
- **`athlete` foi preservado e Personal Trainer não virou nível:** atleta descreve competição/alta performance; Personal Trainer será papel de um futuro modo Personal.
- **Sem objeto persistido duplicado:** objetivo, frequência e duração continuam nos campos existentes de `UserProfile`; `ResolvedTrainingProfile` é somente um view model derivado.
- **Perfil legado resolve como `active` em leitura:** a ausência de `trainingStatus` não dispara rewrite, migração ou bump do envelope v1.
- **Detalhes de retorno não são apagados ao marcar `active`:** a UI os oculta e preserva para histórico/contexto. Nenhuma ação de limpeza foi criada neste GOAL.
- **`previousLevel` permanece opcional:** agrega contexto quando nível atual e experiência anterior diferem, mas nunca promove/rebaixa automaticamente.
- **Data de retorno é civil (`YYYY-MM-DD`):** validação por componentes de calendário, sem parse UTC que possa trocar o dia; datas futuras são rejeitadas.
- **Duas superfícies de UI foram usadas:** onboarding e configurações já existentes em Evolução. Um seletor/resumo compartilhado evita regras paralelas.
- **Nenhuma prescrição foi introduzida:** retorno produz label/contexto, não altera séries, repetições, volume, RPE, descanso, progressão, programas ou exercícios.

## GOAL-18A (2026-07-16)

- **`legs` resolve para `legs_general`, nunca para quadríceps/posterior:** os 23 exercícios legados de pernas continuam genéricos até a curadoria do GOAL-33A.
- **Grupos específicos futuros entram na fundação, não no catálogo:** `adductors`, `abductors`, `lower_back`, `forearms` e `traps` são necessários para domínio/equipamentos reais, mas nenhum dos 126 exercícios recebeu classificação nova agora.
- **Banco, rack, barra, halter e kettlebell são equipamentos, não categorias:** categorias representam famílias operacionais; equipamentos concretos mantêm aliases e características próprias.
- **Lookup exato não usa fuzzy matching:** acento, caixa, grau e pontuação são normalizados; aproximação perigosa não vira resolução canônica. Busca parcial continua separada e pode retornar vários resultados.
- **Strings legadas ambíguas resolvem como `generic` com warning:** não há `unresolved` silencioso nem precisão inventada. Dezessete valores ficam explicitamente para o GOAL-33A.
- **As duas grafias de crossover são uma equivalência aprovada:** `Polia (Crossover)` e `Polia / Crossover` normalizam igual e apontam explicitamente para o mesmo ID; qualquer outra colisão reprova a validação.
- **Registry não implica exercício existente:** os aparelhos reais do Founder entram como fundação para GOAL-20/24/33A, sem criar exercício, filtro, UI ou algoritmo de substituição.
- **A busca visual atual foi preservada:** a nova normalização é compatível e mais abrangente, mas `exerciseSearch.ts` não foi alterado neste GOAL; a integração compartilhada fica para o GOAL-20.

## GOAL-17A (2026-07-16)

- **O envelope canônico continua sendo `{ v: 1, savedAt, data }` na chave `gymflow:state:v1`:** não existe `v: 2`, segunda fonte de verdade ou migração para IndexedDB neste GOAL.
- **O save é um “commit lógico verificado”, não uma transação atômica:** o fluxo serializa/valida, guarda o envelope válido anterior em `:backup`, grava, relê, compara e valida; em divergência tenta restaurar exatamente o valor anterior.
- **Validação v1 é estrutural e tolerante:** campos antigos opcionais podem faltar e recebem defaults na hidratação, mas campos críticos presentes precisam ter shape aceitável. Arrays vazios são dados válidos e substituem defaults.
- **Corrupção e versão desconhecida bloqueiam autosave:** o valor original permanece na chave principal, uma única quarentena rolante guarda sua cópia e somente confirmação via `ConfirmDialog` autoriza restaurar backup ou iniciar estado novo.
- **Superfície de gestão escolhida:** `src/modules/AdminPanel.tsx`, na seção “Dados locais” já existente. Um único `StorageRecoveryNotice` global cobre o caso em que o usuário nem consegue chegar ao painel por causa de load bloqueado.
- **Última alteração recebe flush síncrono em `pagehide` e `visibilitychange` quando hidden:** o debounce normal continua em 500 ms; listeners são únicos, limpos no cleanup e não executam trabalho assíncrono.
- **`localStorage` permanece no GOAL-17A:** a fixture pesada (~660 KB) mediu save/readback mockado em 8,44 ms de mediana e 13,39 ms de p95. Particionamento/IndexedDB fica para GOAL-17B após o schema do GOAL-23A estabilizar, salvo nova evidência em dispositivo real.
- **Origem de recuperação é explícita no resultado de escrita:** `save`, `backup`, `import` ou `fresh`; isso registra a operação sem alterar o domínio de treino nem poluir o envelope v1.

## GOAL-10.6 (2026-07-04)

- **"Salvar" sempre navega para `workouts` (aba Treinos), ignorando `builderReturnView`:** a Tarefa 3 pede explicitamente que salvar mostre "Meus Treinos" imediatamente, então esse botão específico tem destino fixo — diferente de "Cancelar" (que respeita de onde o usuário veio, via `builderReturnView`, pois nada foi necessariamente concluído).
- **Clicar num dia da semana (após "Salvar e Planejar") navega para `planner`, não para `builderReturnView`:** o resultado da ação é visível no Planejador (o dia escolhido agora mostra o treino), então é lá que faz sentido aterrissar — mesmo padrão já usado por `openProgramChooserForDay` (Dashboard → Planejador).
- **`workoutsTab` e `chooserDayName` viraram estado do `GymFlowContext`** (antes locais de `WorkoutsTab`/`PlannerView`) para o Dashboard conseguir acionar "Escolher treino para hoje" reaproveitando o mesmo seletor já existente no Planejador, sem duplicar a modal/lógica de escolha em dois lugares.
- **Detecção de "mudança não salva" no Construtor é um snapshot JSON simples** (`nome` + `slots` no momento do último save/abertura), comparado a cada clique em Cancelar — suficiente para o tamanho do estado (poucos exercícios) sem precisar de uma biblioteca de diff ou de rastrear cada campo individualmente.
- **"Concluir sem planejar" foi adicionado à seção revelada por "Salvar e Planejar"** para o usuário poder sair dali sem escolher um dia (o treino já está salvo nesse ponto) — evita prender o usuário numa tela que só oferece "escolha um dia" depois que ele já mudou de ideia.

## GOAL-10.5 (2026-07-04)

- **Causa raiz do bug "5 exercícios no card → 3 no treino ativo":** eram DUAS divergências independentes da mesma fonte de verdade (`ProgramDay.slots`), não uma. (1) `Dashboard.tsx` calculava `totalExercises = suggestedProgram.exercises.length` a partir da lista achatada legada (`WorkoutProgram.exercises`, comentada no próprio `types/index.ts` como "mantida para compatibilidade de exibição") — para `prog_int_1` essa lista tem 5 itens, mas nenhum `ProgramDay` real precisa ter esse mesmo tamanho. (2) O botão "Começar Treino" chamava `startWorkout(suggestedProgram.id, suggestedProgram.name)` **sem `programDayId`**; `GymFlowContext.startWorkout` então caía no fallback `allDays[0]` (o primeiro Day do programa) — para `prog_int_1` isso é "Dia A — Peito Foco", com apenas 3 slots (Supino Reto, Supino Inclinado, Tríceps Testa), batendo exatamente com o sintoma relatado. O Planejador (`PlannerView`) já fazia o certo (usa `weeklyPlan[].programDayId` construído por `buildWeekFromProgram` a partir de `progDay.slots.length`); o Dashboard era a única tela com uma leitura paralela e desalinhada.
- **Fonte única da verdade adotada:** Dashboard passou a ler o treino de hoje de `weeklyPlan` (via novo `todayPlan` computado no contexto a partir do dia da semana atual), nunca mais de `programs.find(...)` + lista achatada. `exerciseCount`/`duration` de qualquer dia (sugerido, do planejador ou custom) são SEMPRE derivados de `ProgramDay.slots` pelas mesmas funções puras (`estimateWorkoutDuration`, `muscleGroupsForSlots` em `src/lib/workoutDuration.ts`) — extraídas do antigo `estimateDayDuration` privado do `GymFlowContext`, que foi removido para não haver duas implementações do mesmo cálculo.
- **`PlannerView` tinha o mesmo tipo de bug em miniatura:** `handleToggleRest`/`handleEditDaySave` fabricavam `exerciseCount: 4` (ou `grupos.length * 2`) sem exercícios reais por trás — ao "Iniciar" esse dia, `programId`/`programDayId` ficavam `undefined` e `startWorkout` caía no ramo de treino livre (1 exercício), quebrando a mesma promessa. Substituído: alternar/editar um dia sem vínculo real agora zera `exerciseCount` honestamente (fica "Sem treino definido" até o usuário escolher/criar um treino real via Construtor), nunca mais inventa um número.
- **Exercícios "sugerido" vs "custom" usam o mesmo motor:** treinos personalizados são apenas `WorkoutProgram` com `isCustom: true`, guardados em `customPrograms` (persistido) e mesclados com `MOCK_PROGRAMS` num único array exposto como `programs` no contexto — assim `startWorkout`, `applyProgramToWeek`, `WorkoutsTab` e o Treino Ativo funcionam para treinos do usuário sem nenhum código especial paralelo (mesma fonte de verdade, sem bifurcar a lógica).
- **Editar um treino sugerido nunca sobrescreve `MOCK_PROGRAMS`:** o Construtor sempre salva como um novo `customProgram` (id novo) quando a origem é um programa não-custom — evita mutar a biblioteca padrão compartilhada e mantém "programas sugeridos" estáveis entre sessões.
- **Grupos musculares do Construtor são sempre derivados dos exercícios reais adicionados** (nunca um campo separado escolhido manualmente) — evita reintroduzir exatamente o tipo de dessincronia (metadado solto vs. conteúdo real) que este GOAL corrigiu no Dashboard/Planner.
- **Perfis de volume (Compacto/Padrão/Alto Volume) são apenas guias configuráveis**, não travas: escolher um perfil ajusta o alvo de tempo/série sugerido, mas o usuário pode montar qualquer volume; o app avisa (nunca corta exercícios sozinho) quando a duração estimada passa do alvo, conforme pedido.
- **Reordenar exercícios no Construtor usa botões subir/descer**, não drag-and-drop — a Parte 4 do GOAL marca DnD como opcional e o projeto não tem biblioteca de arrastar instalada; subir/descer cumpre o mínimo pedido sem nova dependência.
- **`prog_int_1` (ABC Hipertrofia Masculino) teve os Days de Peito/Tríceps reforçados** para refletir volume real: "Dia A — Peito e Tríceps" (perfil Padrão: 3 exercícios de peito + 2 de tríceps, dentro de 12–16 séries) e "Dia C — Peito e Tríceps (Alto Volume)" (4 peito + 3 tríceps, 18–24 séries) — cobre exatamente o caso relatado pelo usuário sem exigir que todo programa padrão seja reescrito.
- **Faixas brancas nas fotos de exercício:** causa era `bg-white` fixo no contêiner de `ExerciseMedia.tsx` (usado com `object-contain`, que deixa a "sobra" fora da imagem transparente e por isso herda o branco do fundo do próprio componente). Trocado para `bg-gym-dark` (mesmo tom do resto do app); manteve-se `object-contain` (nunca corta o exercício) — resolve o efeito "faixa branca" sem baixar imagens novas nem trocar para `object-cover`.
- **Ids do Construtor cacheados por sessão (`useRef`), não recalculados a cada Salvar/Iniciar/Planejar:** a primeira versão mintava um `custom_${Date.now()}` novo em cada clique, então planejar o mesmo treino em 2 dias da semana (ou Salvar e depois Iniciar) na mesma visita ao Construtor duplicava o treino em `customPrograms` em vez de reaproveitar o que acabou de ser salvo. Corrigido antes do commit — auto-identificado em revisão de código, sem envolver o usuário (tarefa autônoma).

## GOAL-10 (2026-07-04)

- `app/manifest.ts` e `metadata`/`viewport` em `layout.tsx` já existiam parcialmente (nome, short_name, display standalone, orientation, cores, appleWebApp básico) de trabalho anterior ao GOAL-10 formalizar-se — completados aditivamente (novos ícones no manifest, `metadata.icons.apple` no layout) em vez de recriados do zero, preservando os campos já corretos.
- Novo ícone "monograma G" (verde-lima sobre fundo escuro, vetorial, sem fonte/arquivo externo) gerado exclusivamente para o set instalável do PWA (`public/icons/*`); o `public/icon.svg` (marca "haltere") existente foi mantido intacto e sem uso no manifest — não estava referenciado em nenhum lugar de `src/`, então não há regressão em removê-lo do array `icons`, e as duas marcas podem coexistir.
- `metadata.manifest` NÃO foi adicionado em `layout.tsx`: o file convention `app/manifest.ts` já injeta `<link rel="manifest" href="/manifest.webmanifest">` automaticamente (confirmado lendo o HTML servido por `npm run start`); declarar o campo também geraria uma tag duplicada.
- Ícones "any" (`icon-192/512.png`) mantêm transparência real fora do retângulo arredondado (mesmo padrão do `public/icon.svg`); já os "maskable" e o `apple-touch-icon.png` são opacos e full-bleed (fundo pintado até a borda, sem cantos arredondados próprios), pois a plataforma aplica sua própria máscara/arredondamento — misturar os dois estilos no mesmo arquivo causaria recorte inconsistente.
- Service worker cobre literalmente os 3 prefixos pedidos (`/_next/static`, `/icons`, `/assets/exercises`) em cache-first + navegação em network-first; nenhuma outra rota (fontes, `/assets/avatars`, `/assets/animations`, etc.) recebe estratégia de cache própria, por não estar no escopo pedido — evita cache obsoleto de algo que o GOAL não pediu para cachear.
- `self.skipWaiting()` + `self.clients.claim()` incluídos no service worker: coerente com o pedido explícito de cache versionado (`gymflow-v1`) e limpeza de versões antigas no `activate` — sem isso, um SW novo instalado ficaria "esperando" e a limpeza de cache só valeria depois de todas as abas fecharem.

## GOAL-01 (2026-07-03)

- Hidratação: efeito único no mount do GymFlowContext carrega `gymflow:state:v1` e aplica campo a campo por cima dos defaults (arrays só se não-vazios), com flag `hydrated` bloqueando o save debounced até a carga terminar — evita que o primeiro render sobrescreva dados salvos e evita crash com estado parcial/antigo.
- Chaves legadas `gymflow_user`/`gymflow_weeklyPlan` são migradas para o novo envelope na primeira carga e removidas em seguida (usuário logado não perde a sessão na atualização).
- Tempo do treino ativo: persiste-se `activeWorkoutStartedAt` (timestamp ms); `workoutDuration` é sempre recalculado a partir dele (inclusive no tick do timer), nunca persistido como contador.
- Se há treino ativo salvo, o app restaura direto na view `active-workout`; senão, usuário logado cai no `dashboard` (comportamento anterior mantido).
- Persistidos além do pedido explícito: histórico de peso/medidas e vídeos vistos recentemente (mesma natureza de "histórico/favoritos"). NÃO persistidos: chat do coach (transitório), posts da comunidade, vídeos e exercícios (mock/admin) — voltam ao mock a cada sessão.
- `src/hooks/useLocalStorage.ts` deletado: nenhum consumidor no código (hook morto, substituído por `src/lib/storage.ts`).

## GOAL-02 (2026-07-03)

- Exercícios órfãos (`abs_prancha_abdominal`, `cardio_corrida_esteira`, `legs_levantamento_terra`, `legs_legpress_45`) criados em `src/mock/exercises.ts` com os mesmos IDs já referenciados em `programs.ts`/vídeos, mantendo o formato completo do tipo `Exercise` (execução, postura, erros comuns, substituições etc.).
- Rótulos Ant/Sug no Treino Ativo: trocado `10k`/`12k` por `10 kg`/`12 kg` (coluna tem espaço suficiente em 390px; `kg` explícito remove a ambiguidade sem precisar do prefixo `Ant`/`Sug` truncado).
- Kcal do Painel Técnico: cálculo trocado de "tempo decorrido" para "por série concluída" — 9 kcal/série para exercícios compostos (têm `secondaryMuscles`), 6 kcal/série para isolados (sem `secondaryMuscles`), 5 kcal/série para `muscleGroup === 'cardio'`; com 0 séries concluídas mostra sempre `0 kcal`. Rótulo do card passou a indicar "(kcal est.)".
- Header/logo cortado: causa raiz é `bg-clip-text` + `tracking-tighter` no texto gradiente "GYMFLOWAI", que faz o navegador cortar a lateral esquerda do primeiro glifo ("G") contra a borda do elemento. Corrigido adicionando `pl-0.5` ao span do logo em `Navigation.tsx` (TopBar), `LandingPage.tsx` e `AuthPages.tsx` (Login/Register), sem alterar layout do restante do header.

## GOAL-03 (2026-07-03)

- API de toast implementada como hook imperativo (`useToast()` com `.success/.error/.info`) e não como componente controlado por props, porque os alerts a substituir estavam espalhados em handlers de eventos (`onClick`, `onChange`, `setTimeout`) em módulos e no `GymFlowContext`, sem estado de UI local — um hook imperativo evita prop-drilling e mapeia 1:1 com o `alert(msg)` que ele substitui.
- `ToastProvider` montado em `src/app/layout.tsx`, envolvendo `GymFlowProvider` (não dentro dele) — assim tanto os componentes de UI quanto o próprio `GymFlowContext.tsx` (que dispara toasts em `swapExerciseInActiveWorkout`, `adaptActiveWorkoutForCrowdedGym` e `replanMissedWorkout`) conseguem chamar `useToast()` sem violar a árvore de contexto. Opção escolhida por ser a menos invasiva (nenhuma mudança na assinatura do `GymFlowProvider`).
- `ConfirmDialog` implementado como componente controlado simples (`isOpen`/`onConfirm`/`onCancel` via `useState` local no chamador), não como hook/provider global — só há 2 usos reais (cancelar treino, zerar dados do app), ambos com estado local trivial; um provider global seria complexidade desnecessária para 2 chamadores.
- Posicionamento do toast em telas 768–1023px (tablet): a `BottomNavigation`/FAB do app usam `lg:hidden` (breakpoint 1024px), ou seja, continuam visíveis nessa faixa. Para não sobrepor esses elementos, o toast usa `md:bottom-[calc(6.5rem+...)]` (clearance extra) entre 768–1023px e só cai para `lg:bottom-[calc(1.5rem+...)]` (canto inferior direito "clássico") a partir de 1024px, quando a bottom nav já não existe.
- "Zerar dados do app" no AdminPanel: o padrão anterior (duplo clique local, sem `confirm()`) foi trocado por `ConfirmDialog` por ser uma ação destrutiva e irreversível, unificando a experiência com o `ConfirmDialog` de "Cancelar Treino Atual" e satisfazendo o pedido explícito do GOAL-03.
- Alerts em `GymFlowContext.tsx` classificados por natureza: mudança aplicada com sucesso → `toast.success`; nada a fazer/estado neutro (ex.: "treino já é peso livre", "sem dias de descanso disponíveis") → `toast.info`; falha ao identificar estado (ex.: "não foi possível identificar o dia atual") → `toast.error`.

## GOAL-04 (2026-07-03)

- O "botão flutuante CONTINUAR que cobre conteúdo" citado no GOAL é o FAB global de `BottomNavigation` (`Navigation.tsx`), que mostra "Continuar" sempre que há treino ativo — inclusive quando o usuário já está na própria tela de Treino Ativo. Corrigido escondendo esse FAB especificamente quando `activeView === 'active-workout'` (`showFab`), em vez de removê-lo globalmente — ele continua útil em todas as outras telas para voltar ao treino em andamento.
- ActionBar fixa implementada como `lg:hidden` (mesmo breakpoint do FAB/bottom nav que ela substitui nesta tela). Em desktop (`lg+`) não existe bottom nav nem FAB, então "desktop preservado" foi interpretado literalmente: o botão "Finalizar" já existente no header da página segue sendo o único CTA fixo lá, sem barra nova.
- Offset da ActionBar do rodapé (`bottom: calc(4.75rem + safe-area)`) reaproveita a mesma constante já usada pelo FAB em `Navigation.tsx`, garantindo que ela fique ancorada exatamente acima da bottom nav sem precisar recalcular a altura da nav.
- Nova classe utilitária `.pb-active-workout` em `globals.css` (`4.75rem` de clearance da bottom nav + `5.5rem` de altura estimada da ActionBar + `env(safe-area-inset-bottom)` + `1rem` de folga) substitui o antigo `pb-24` fixo do container do Treino Ativo — criada como classe nomeada (não valor Tailwind arbitrário inline) por ser um valor específico desta tela e mais fácil de re-tunar depois.
- Botão "CONTINUAR" usa `scrollIntoView({ behavior: 'smooth', block: 'center' })` na primeira série não concluída (por `id="set-row-{set.id}"`) e foca o primeiro `<input type="number">` da linha (campo de carga/kg, o mais relevante para editar antes de concluir a série). Quando não há série pendente, vira "FINALIZAR" e abre o modal de resumo já existente (`showFinishModal`), sem lógica nova de finalização.
- "Ver Técnica" no placeholder de mídia: o botão estava `absolute` sobre o `AvatarDemoPlaceholder`, podendo cobrir o texto "Demonstração 3D em produção" em telas estreitas. Corrigido removendo o `position: absolute` — agora é uma barra de rodapé em fluxo normal (`flex flex-col`), abaixo da mídia, com `border-t` separando visualmente e `min-h-[44px]` de área de toque.
- Varredura de outros floatings (Tarefa 5): `GlobalVideoPlayer` usa `AvatarDemoPlaceholder` sem botão sobreposto (nenhum problema); `WorkoutSheetNotification` já se auto-oculta quando `activeView === 'active-workout'`, então nunca compete com a nova ActionBar; badges/ícones `absolute` em cantos de cards (favoritar, fechar modal, selo de foto) em `ExerciseLibrary`/`WorkoutsTab`/`EvolutionDashboard`/`Dashboard` são decorativos em cantos de card, sem cobrir texto relevante — nenhuma correção necessária além do que já foi feito.

## GOAL-05 (2026-07-03)

- Nomenclatura das views mapeada para os rótulos do GOAL (que usa "Feed" e "Assinatura"): `community` = Feed, `premium` = Assinatura — nomes de `AppView` em `GymFlowContext.tsx` preservados sem alteração, só o rótulo visível muda.
- Bottom nav reduzida para 4 itens fixos (Hoje/Planejar/Exercícios/Evolução) + aba "Mais"; IA Coach saiu da barra principal por decisão explícita do GOAL-05 e foi para o menu "Mais", junto com Treinos, Vídeos, Nutrição, Feed, Assinatura e Admin (Admin condicional pela mesma regra já usada em `SideNavigation`: `user.email === 'rafael.demo@gymflow.ai'`).
- Bottom sheet "Mais" implementado sem dependência nova: componente controlado local (`useState` em `BottomNavigation`), overlay `fixed inset-0` + painel `rounded-t-3xl` deslizando de baixo (`@keyframes sheetUp`/`.animate-sheet-up`, mesmo padrão de `toastIn`/`pulseGlow` já usado no projeto). Fecha ao clicar no overlay (`onClick` no wrapper + `stopPropagation` no painel) e ao clicar em qualquer item (que já navega e fecha via `handleSelectMoreItem`). Não implementei fechar por ESC no sheet (diferente do `ConfirmDialog`) porque o GOAL-05 não pediu explicitamente e o padrão de fechar por overlay/seleção já cobre o uso mobile-first do componente.
- Aba "Mais" fica destacada (`isMoreActive`) quando `activeView` está na lista `MORE_MENU_VIEWS` (derivada de `MORE_MENU_ITEMS`, uma única fonte de verdade para o conteúdo do sheet e para o estado ativo — evita as duas listas saírem de sincronia).
- Ícone da aba "Mais" reaproveita o import `Menu` do `lucide-react`, que já estava no arquivo mas não era usado (limpa 1 dos 2 warnings de lint pré-existentes do `Navigation.tsx` como efeito colateral).
- Auditoria de views (Tarefa 6): todas as 12 views pós-login do `switch(activeView)` em `src/app/page.tsx` (dashboard, planner, workouts, active-workout, exercises, videos, ai-coach, evolution, community, nutrition, premium, admin) têm caminho de navegação — 4 direto na bottom nav, 6-7 (conforme admin) no sheet "Mais" em 2 toques, `active-workout` seguindo o mesmo padrão já existente antes do GOAL-05 (acessada via FAB "Continuar"/"Treinar" e pelos fluxos de iniciar treino, não por um item de menu dedicado — é um estado de sessão, não uma tela de navegação livre). Nenhuma view órfã encontrada; SideNavigation (desktop) já cobria todas as views antes deste GOAL e não precisou de alteração.

## GOAL-06 (2026-07-03)

- Estado do timer de descanso movido para `GymFlowContext.tsx` (antes era `useState` local em `ActiveWorkoutPage.tsx`), seguindo exatamente o mesmo padrão já usado para `activeWorkoutStartedAt`/`workoutDuration`: persiste-se apenas o timestamp de término (`restTimerEndAt`), e o restante (`restSecondsRemaining`) é sempre recalculado a partir dele em um `useEffect` com `setInterval`. Isso resolve sozinho a Tarefa 3 (sobrevive a refresh) e permite que o timer continue contando e disparando toast/vibração/beep mesmo que o usuário saia da tela do Treino Ativo enquanto descansa.
- Ao hidratar, se `restTimerEndAt` salvo já está no passado (`saved.restTimerEndAt <= Date.now()`), o timer NÃO é restaurado — fica limpo silenciosamente, sem tentar mostrar um timer "negativo" nem disparar o toast/vibração de um descanso que já devia ter terminado enquanto o app estava fechado.
- Resolução do tempo de descanso (Tarefa 1, "se o exercício/série tiver restSec, usar restSec"): adicionado campo opcional `restSec?: number` em `Exercise` (`src/types/index.ts`) — não em `WorkoutProgram`/`ActiveExercise`, para não tocar em "modelo de programas" (fora do escopo). Prioridade em `completeWorkoutSet`: `exercise.restSec` (se o exercício tiver) → `user.restTimerDefaultSeconds` (configuração do GOAL-06) → `90` (padrão). Nenhum exercício do mock define `restSec` hoje, então o comportamento atual é sempre padrão/configuração — o campo existe para uso futuro sem exigir migração de dados.
- "Não iniciar se for a última série do treino" interpretado como: não iniciar se, depois de marcar essa série como concluída, TODAS as séries de TODOS os exercícios do treino já estiverem concluídas (não haveria nada para descansar antes de fazer). Checado em `completeWorkoutSet` tratando a série marcada como concluída virtualmente antes de decidir.
- Timer mostrado em dois lugares por breakpoint, sem duplicar informação na mesma tela: no mobile/tablet (`lg:hidden`) ele substitui o conteúdo "Série X de Y / Continuar" dentro da própria ActionBar fixa do GOAL-04 (pedido explícito da Tarefa 1/5); no desktop (`lg:flex`, onde a ActionBar fixa não existe desde o GOAL-04) o card "Descanso Biomecânico Ativo" já existente na página permanece, só que agora lendo do contexto em vez do estado local. Barra de progresso na ActionBar é linear (mais compacta que o anel SVG); o anel circular original foi mantido no card desktop.
- Configurações do timer (Tarefa 2) adicionadas em `UserProfile` (`restTimerDefaultSeconds?`, `restTimerSoundEnabled?`) — persistem automaticamente porque `user` já faz parte do `PersistedState` desde o GOAL-01, sem precisar de um novo objeto de "settings" nem de mais uma chave no envelope salvo. UI colocada na seção "Configurações e Conexões de Perfil" já existente em `EvolutionDashboard.tsx` (a "área equivalente" mais próxima de um settings screen no app).
- Wake Lock: `navigator.wakeLock.request('screen')` tentado sempre que existe treino ativo (`hasActiveWorkout`), re-adquirido em `visibilitychange` (necessário porque o navegador libera o wake lock automaticamente ao trocar de aba/minimizar), e liberado declarativamente pelo cleanup do `useEffect` quando `hasActiveWorkout` vira `false` (cobre finalizar, cancelar E logout, sem precisar chamar release manualmente em cada um). **Wake Lock pode exigir HTTPS/localhost e pode não funcionar em HTTP via IP no celular** (cenário comum ao testar no celular pela rede local) — falha sempre em silêncio (`try/catch` vazio) e o app continua funcionando normalmente sem a tela travada ligada.
- Beep do timer implementado com Web Audio API pura (osc + gain, sem asset de áudio novo, sem dependência nova) — respeita `restTimerSoundEnabled`; a vibração (`navigator.vibrate`) é independente do som e sempre tentada quando suportada, já que é um sinal tátil e não sonoro.

## GOAL-07 (2026-07-03)

- Tipos: mantidos os nomes existentes por compatibilidade — `WorkoutProgram.frequencyDays` cumpre o papel de `daysPerWeek` (não foi criado campo duplicado); adicionados `repeatWeeks: boolean` e `weeks: ProgramWeek[]` ao programa; a lista achatada legada `exercises` foi mantida no tipo/mock para não quebrar exibições existentes.
- Defaults de slot registrados: composto = repRange 6-10, RPE 8, rest 120s, progressão dupla, +2.5kg; isolado = 10-15, RPE 8, 75s, dupla, +1kg; core isométrico (prancha) = repRange 30-60 em SEGUNDOS, RPE 7, rest 60s, sem progressão; cardio (esteira) = repRange 15-20 em MINUTOS, série única, rest 0, sem progressão. Programas de força (prog_adv_3, prog_atl_1) usam rest 180s e progressão linear nos compostos principais, coerente com a descrição existente ("3-5 min").
- Migração dos programas: nenhum exercício novo inventado; days construídos agrupando os exercícios já listados em cada programa por afinidade muscular (ex.: prog_int_1 → Dia A Peito, Dia B Ombros, Dia C Pump); exercícios podem se repetir entre days do mesmo programa (padrão normal em splits reais). Programas full-body (todos os beginner) têm 1 Day único repetido pelos dias ativos da semana, com `repeatWeeks: true`.
- Reps: `WorkoutSet.reps` inicial = piso do repRange (progressão dupla sobe do piso ao teto antes de aumentar carga); faixas exibidas colapsam quando min === max.
- Planejador: `buildWeekFromProgram` distribui os Days do programa pelos dias ativos da frequência em ciclo (A, B, C, A...); dias fora da frequência viram Descanso sem programDayId — dia de descanso não abre treino genérico (Play já não aparece para isRest).
- `generateWeeklyPlan` agora escolhe um programa REAL por perfil (nível > objetivo por keywords no objetivo/nome/descrição > público-alvo por gênero) em vez de templates soltos; MOCK_WEEKLY_TEMPLATES deixou de ser usado pelo contexto (mantido no mock por compat).
- Login demo e registro geram o plano inicial pelo mesmo builder (demo = prog_int_1 4x/semana), então até o plano default abre treinos reais.
- Customização no Planner: editar um dia ou alternar treino/descanso limpa `programId`/`programDayId` (o dia vira customizado — os slots do programa não correspondem mais ao que o usuário configurou); mover/duplicar preserva o vínculo.
- Timer de descanso: prioridade `ActiveExercise.restSec` (slot) > `Exercise.restSec` (mock GOAL-06) > default do usuário > 90s; `restSec === 0` (cardio) não dispara timer.
- Estado antigo (regra atualizada pelos GOAL-19A.1/19B.1): plano salvo sem `programDayId` continua hidratando, mas um `programId` multi-dia sem o ID do dia exige nova escolha e nunca cai silenciosamente no Dia 1. Programa canônico de um dia e treino custom sem `programId` seguem compatíveis; treino ativo salvo sem `repRange`/`restSec` usa os fallbacks legados. Nada é migrado destrutivamente.

## GOAL-08 (2026-07-03)

- `suggestNext(slot, historico)` é pura e determinística: sem Date.now(), sem aleatoriedade; o histórico entra ordenado do mais recente para o mais antigo (ordem natural do `workoutHistory`, que faz prepend ao concluir treino).
- Só séries `completed: true` com `reps` numéricas contam; sessões sem nenhuma série concluída são ignoradas (equivalem a "sem histórico"). Carga da sessão = maior peso (> 0) entre as séries concluídas.
- RPE ausente é tratado como "dentro do alvo" (progressão dupla clássica não exige RPE) — a carga progride e o motivo declara explicitamente "sem RPE registrado". RPE da sessão = maior RPE entre as séries concluídas (critério conservador).
- "Abaixo do mínimo" = alguma série concluída da sessão abaixo do piso do repRange; deload de 10% exige isso nas 2 sessões mais recentes (1 sessão ruim apenas mantém carga e recalibra reps).
- Aumento de reps parte da MENOR reps concluída da última sessão (+1, teto = repRange[1]) — critério conservador: todas as séries precisam acompanhar.
- `progression: 'linear'` segue as mesmas regras da dupla no GOAL-08 (o enunciado só distingue 'nenhuma'); diferenciação fica para o futuro motor completo.
- Arredondamento sempre para múltiplos de 0.5 kg (`roundToHalfKg`), inclusive no deload; incremento default 2.5 kg quando `incrementKg` inválido/ausente.
- Integração: ANT = última carga real do histórico (ou "—"); SUG = `pesoKg` do motor (ou "—"); pré-preenchimento da série = sugestão → última carga → 10 kg (default legado). Treino livre e caminho legado (sem slot) mostram ANT real mas não fabricam mais SUG (antes eram 10/12 kg hardcoded).
- Motivo da sugestão exposto na UI como "Progressão recomendada: <motivo>" no cabeçalho do exercício (campo opcional `ActiveExercise.progressionNote`), substituindo o antigo "Sugestão IA: Carga progressiva".
- Compatibilidade com histórico antigo (GOAL-01): todos os campos de `HistorySet` são opcionais; `WorkoutSet.rpe` default 7 gravado por treinos antigos conta como RPE ≤ alvo normalmente; nenhum formato foi migrado.

## GOAL-09 (2026-07-03)

- Fonte da biblioteca: dataset público free-exercise-db (yuhonas), 873 exercícios; curadoria fixa de 125 mapeada em `SELECTION` (scripts/import-exercises.mjs) — appId nosso → id do dataset. Textos PT-BR autorados manualmente (sem tradução automática literal).
- Mapa de taxonomia (grupo do app → categorias do dataset usadas): chest→chest; back→lats/middle back/lower back/traps; shoulders→shoulders (inclui face pull/reverse fly por função); biceps→biceps/forearms (rosca inversa); triceps→triceps; legs→quadriceps/hamstrings/adductors/abductors; glutes→glutes (inclui good morning por dominância de quadril); calves→calves; abs→abdominals; cardio→cardio; functional→full body/explosivo (swing, farmer walk, battle rope, escalador); mobility→stretching.
- Equipamentos priorizados: barbell, dumbbell, cable, machine, body only, e-z curl bar, kettlebell. Níveis: maioria beginner/intermediate; advanced só para clássicos (terra, terra sumô, agachamento frontal, passada com barra, bom dia, elevação de pernas na barra).
- IDs antigos preservados 100%: os 29 exercícios curados originais (incl. os 4 corrigidos no GOAL-02) mantêm id/textos em `BASE_EXERCISES`; os 96 novos ficam em `EXPANSION_EXERCISES`. O loop gerador de 68 placeholders `extra_*` foi removido — nenhum programa/substitutions referenciava `extra_*` (verificado por teste).
- `Exercise.images` opcional: preenchido em runtime por `withLocalImages` com `/assets/exercises/<id>/{0,1}.jpg` quando o exercício não define o campo (exercícios criados no Admin ficam sem imagens e caem no fallback honesto).
- Imagens: 2 por exercício (250 arquivos), baixadas atomicamente (tmp+rename) pelo script reexecutável; runtime não usa nenhuma imagem externa.
- UI: novo `ExerciseMedia` (crossfade 3s entre as 2 poses, `object-contain` sobre fundo branco — as fotos do dataset têm fundo branco), selo discreto "Demonstração 3D em breve"; fallback continua sendo o `AvatarDemoPlaceholder` honesto (Kai/Motion Engine em produção).

## GOAL-11 (2026-07-05)

- Código morto: `BiomechanicalVisualizer.tsx` (1249 linhas, zero imports) deletado; as 2 únicas menções restantes são comentários em `src/components/three/GymFlowAvatarStage.tsx` (stack 3D/poc-3d, intocável por regra) — deixados como estão, são referência histórica de paridade de API, não referência de código.
- `MOCK_WEEKLY_TEMPLATES` (pendência registrada no GOAL-10.5) removido de `mock/programs.ts` + reexport em `mock/data.ts`; grep confirma zero referências.
- Sub-aba `'groups'` do CommunityFeed: só existia no union type do estado (nenhuma UI/handler) — union estreitado para `'feed' | 'ranking'` e cast `as any` removido.
- `generateWeeklyPlan` perdeu o 5º parâmetro `_duration` (morto desde o GOAL-07: a duração real vem dos slots do Day) — assinatura pública + 2 call sites atualizados.
- ~50 imports mortos removidos (lucide e outros) em 18 arquivos; validado com eslint `no-unused-vars` = 0 em `src/`.
- ErrorBoundary: 2 instâncias em `page.tsx` — uma no switch pré-login, outra em volta do `renderLoggedInView()` DENTRO do shell (TopBar/nav sobrevivem a crash de view). `resetKey={activeView}` limpa o erro ao navegar; em dev o `error.message` aparece no fallback e `componentDidCatch` sempre loga no console (não atrapalha debug).
- Transição de view: wrapper `key={activeView}` + `.animate-view-in` (150ms) só no fluxo logado — remontar o componente da view a cada troca já era o comportamento do switch (views diferentes = componentes diferentes); o key não muda semântica.
- Vibração de 10ms ao concluir série colocada em `completeWorkoutSet` (contexto), não na UI — é onde a conclusão é decidida; guarda `'vibrate' in navigator`.
- Foco visível: `:focus-visible` global no globals.css (outline verde-lima) em vez de classe por botão — não dispara em toque/clique.
- Fotos de exercício: análise real das 125 fotos (121 são 850×567 ≈ 3:2, fundo de academia; só 3 têm fundo branco). Fix das "faixas": cards e Treino Ativo usam containers 16:9 com `object-cover` (corte vertical ~12%, seguro — atleta centralizado); ficha técnica usa container 3:2 com `contain` (fidelidade sem letterbox). `ExerciseMedia` ganhou prop `fit` (default `contain` para não mudar consumidores não tocados).
- Skeleton: pulso (`animate-pulse bg-white/5`) no container do `ExerciseMedia` até a primeira foto carregar — único loading perceptível do app; sem lib nova.
- Checkbox de série: hit area 44×44 via `w-11 h-11 -m-2.5` (margem negativa preserva o layout da grade de 12 colunas), visual continua 24px; `aria-label` dinâmico por série.
- Empty states padronizados (ícone lucide + título + 1 frase + 1 CTA ≥44px): Evolução/histórico ("Finalize seu primeiro treino" → Começar treino), Meus Treinos ("Monte seu primeiro treino" → Criar treino), Feed ("A comunidade ainda está vazia" → Criar publicação, foca o composer), Nutrição ("Comece registrando sua hidratação" → +250ml agora), Planejador (→ Gerar Semana com IA), Biblioteca por aba (Favoritos/Recentes → Explorar; busca → Limpar filtros), Treino Ativo (→ Escolher treino), Construtor (→ Adicionar Exercício).
- Varredura "placeholder" (TAREFA 7): todas as ocorrências restantes em `src/` são legítimas — `AvatarDemoPlaceholder`/comentários de fallback honesto (Kai em produção), stack 3D `components/three` + `app/poc-3d` (intocáveis por regra), `exercises.test.ts` (teste que GARANTE zero placeholders na biblioteca) e atributos `placeholder=` de inputs. Nada corrigido fora de escopo.

## GOAL-12 (2026-07-06)

- **Export estático ligado por `BUILD_TARGET=mobile`, não globalmente:** `output: "export"` só entra no `next.config.ts` quando a env está setada (script `build:mobile`), preservando o build web normal (`next build`/`next start`) com o comportamento padrão do Next. O app já era uma SPA 100% client-side (`page.tsx`/`poc-3d` são `'use client'`, sem API routes, server actions, cookies ou `next/image`), então o export não exigiu refatorar nada — só ligar a flag.
- **`export const dynamic = 'force-static'` no `manifest.ts`:** sob `output: export` o Next 16 quebra o export da rota `/manifest.webmanifest` sem essa declaração (erro real observado no primeiro build mobile). O manifest já era 100% estático (constantes), então a flag é inofensiva ao build web — apenas explicita o que já era verdade.
- **Trava de zoom condicional ao alvo de build (não global):** `maximumScale: 1, userScalable: false` só é adicionado ao `viewport` de `layout.tsx` quando `process.env.BUILD_TARGET === 'mobile'` (avaliado em build time, pois o layout é Server Component). Assim o APK ganha a sensação de app nativo (pedido do GOAL) sem degradar a acessibilidade do build web (onde o pinch-zoom continua liberado).
- **Scripts de build via wrapper Node (`.mjs`), sem `cross-env`:** `scripts/build-mobile.mjs` e `scripts/android-build.mjs` setam a env e chamam `next`/`gradlew` via `spawnSync`, funcionando igual em PowerShell/cmd/Git Bash — evita adicionar uma dependência só para exportar variável de ambiente (o GOAL pediu instalar só o Capacitor).
- **`gradlew` chamado por caminho absoluto no `android-build.mjs`:** com `shell: true` o cmd.exe do Windows não resolve um `gradlew.bat` "solto" a partir do `cwd` (falhou na primeira tentativa). Passar o caminho completo (`path.join(androidDir, 'gradlew.bat')`) resolve; o diretório do projeto não tem espaços.
- **Capacitor 8.4.1 (core/android/cli alinhados):** major atual; exige compileSdk 35+ e JDK 17, ambos presentes. O projeto Android gerado usa compileSdk/targetSdk 36 (padrão do Capacitor 8) — a plataforma `android-36` já está instalada no SDK local.
- **`capacitor.config.ts`:** `appId com.gymflowai.app`, `appName "GymFlow AI"`, `webDir out`; `androidScheme: 'https'` (contexto seguro → service worker + localStorage persistem entre execuções); `backgroundColor: '#09090b'` (sem flash branco no boot, casa com o dark); `webContentsDebuggingEnabled: true` (inspeção do WebView no APK de debug, conforme "logs debug em desenvolvimento").
- **`android/local.properties` criado apontando o SDK, mas fora do git:** o `.gitignore` que o Capacitor gera dentro de `android/` já exclui `local.properties` (caminho específico da máquina), `.gradle/`, `build/` e o APK — então `git add -A` commita o projeto nativo mas não os artefatos nem o caminho local.
- **Projeto `android/` versionado (padrão Capacitor):** a pasta nativa entra no repositório (workflow oficial do Capacitor); só os gerados/artefatos ficam de fora pelo `.gitignore` aninhado.

## GOAL-15 (2026-07-14)

- **`NumericInput` usa `type="text"` + `inputMode`, não `type="number"`:** o tratamento de zero à esquerda do `<input type=number>` é inconsistente entre WebView/navegadores (causa do `080`/`012` no APK). Com `type="text"` controlamos 100% a string exibida; `inputMode="decimal"/"numeric"` mantém o teclado numérico no celular.
- **Conversão no blur, não no `onChange` (pedido explícito do GOAL):** enquanto digita, o valor é uma string de rascunho (aceita vazio, remove zero à esquerda, aceita vírgula/ponto); só no blur vira número. Ao concluir a série, o blur do input dispara antes do clique no checkbox, então o histórico salva o número correto.
- **`emptyBehavior` por campo:** carga/reps revertem ao último valor válido quando esvaziados e perdem o foco (nunca inventam 0); RPE é opcional (`emptyBehavior="null"`) e volta ao placeholder. Escolhido para não destruir dado nem forçar 0.
- **`NumericInput` aplicado só ao Treino Ativo e ao WorkoutBuilder:** são os campos citados no GOAL. Nutrition/Onboarding/Evolution compartilham o mesmo padrão de input mas ficam fora do escopo — registrado em PENDENCIAS para um passe futuro (o utilitário já é reaproveitável).
- **Notificações de XP: cap 2 + consolidação por texto igual em janela de 5s.** Marcar várias séries seguidas vira um card só ("3 séries concluídas · +30 XP") em vez de N cards; `createdAt` renova a cada consolidação (renova o auto-dismiss). Level up nunca consolida (comemoração distinta). Auto-dismiss 4s (xp) / 6s (level up).
- **Posição das notificações de XP:** topo abaixo da TopBar no mobile (`top: 4rem + safe-area`) e canto superior direito no desktop — não conflita com os toasts (topo-centro no mobile / rodapé-direito no desktop) nem cobre os campos de série (mais abaixo na página).
- **Swipe de dismiss via Pointer Events (sem lib):** além do botão X (obrigatório), arrastar o card > 80px na horizontal remove. Implementado com `onPointerDown/Move/Up` e `touchAction: pan-y`.
- **Edições do Treino Ativo centralizadas em métodos imutáveis no contexto** (`addExerciseToActiveWorkout`, `removeExerciseFromActiveWorkout`, `addSet/removeSetFromActiveExercise`, `updateWorkoutSet` reescrito). Antes ActiveWorkoutPage/ExerciseLibrary mutavam o array no lugar — o `ExerciseLibrary.handleAddToWorkout` nem chamava `setActiveWorkout`, por isso não salvava. Remover exercício mantém no mínimo 1.
- **Busca de exercícios: tokens sem acento + stopwords + apelidos (`searchTerms`).** `matchesExerciseSearch` casa cada token da busca contra nome + `searchTerms` + equipamento + grupo muscular normalizados (sem acento). Aliases aplicados por um mapa `SEARCH_TERMS` no build de `MOCK_EXERCISES`, sem editar cada objeto.
- **Só 1 exercício novo (`triceps_maquina`); o resto por alias.** A maioria dos citados (remada baixa/articulada, puxada alta, pulldown, francês, testa, serrote…) já existia com outro nome — resolvidos por `searchTerms` em vez de duplicar exercícios sem foto. "Extensão de Tríceps na Máquina" era o único realmente ausente.
- **`triceps_maquina` com `images: []` (fallback honesto), sem inventar foto.** O teste de imagem (`exercises.test.ts`) passou a exigir foto local só para quem tem `images` preenchido e trava a lista de "aguardando foto" em `['triceps_maquina']` para evitar regressão silenciosa quando o próximo lote de fotos chegar.
- **Safe-area 100% CSS, sem plugin novo e sem editar `android/`.** O `<header>` sticky ganhou `paddingTop: calc(0.75rem + env(safe-area-inset-top))`; no web `env()=0` (sem regressão) e no APK o fundo glass do header preenche a status bar, empurrando o logo para baixo dela. Evitou-se `@capacitor/status-bar` e mexer no tema nativo (menor risco; regra do GOAL de evitar dependência nova). Não validável em dispositivo real neste ambiente — ver PENDENCIAS.

## GOAL-19A.1 (2026-07-18)

- **Quatro fontes de verdade com papéis distintos:** `WorkoutProgram` descreve os próximos treinos; `WeeklyWorkoutDay` é vínculo semanal com cache de apresentação; `activeWorkout` é snapshot editável da execução; `workoutHistory` é snapshot concluído e imutável.
- **Salvar programa reconcilia somente planejamento futuro:** dias não treinados vinculados ao mesmo programa recebem nome, grupos, duração e contagem recalculados. Dia já treinado não é reescrito.
- **Dia removido invalida, não redireciona:** o vínculo é limpo, o Planejador pede nova escolha e `startWorkout` não pode cair no Dia 1. Programa multi-dia sem ID também exige escolha explícita.
- **Sessão não prescreve o futuro automaticamente:** carga, reps, RPE, notas, trocas e exercícios improvisados permanecem na sessão/histórico. Promover mudanças ao programa fica para um fluxo deliberado futuro.
- **Origem é metadado opcional do snapshot:** IDs e nomes de programa/dia acompanham sessão ativa, refresh, histórico e export/import sem migração nem alteração do envelope v1.
- **Valores numéricos válidos chegam ao Context antes do blur:** `NumericInput` preserva o rascunho visual focado, emite valores válidos durante a digitação, confirma no blur/Enter e restaura no Escape. Persistência continua exclusivamente no Context.
- **`weeklyPlan` canônico:** uma única versão calculada é aplicada ao estado principal e espelhada em `user.weeklyPlan`, inclusive quando a atualização usa functional updater; usuário nulo permanece válido.
- **Uma sessão ativa não pode ser sobrescrita por outro início:** o bloqueio é global no Context; ao editar o programa de origem a partir da sessão, o Construtor também oculta “Iniciar Agora” e retorna ao snapshot em andamento.
- **Resumo do Planejador expõe o cache reconciliado completo:** quantidade real de exercícios e duração estimada aparecem juntas no card, além de nome e grupos musculares, para tornar a sincronização verificável sem abrir o treino.
- **Flush de ciclo de vida lê referências canônicas:** sessão ativa, histórico e horário de início são espelhados em refs; `pagehide`/`visibilitychange` e finalização enxergam inclusive uma edição ou início ocorrido no mesmo tick.

## GOAL-TF-A — tempo disponível canônico (2026-07-19)

- **Tempo disponível e duração estimada têm papéis distintos:** `ProgramDay.targetMinutes` é entrada canônica; a estimativa dos slots é saída derivada e não volta a preencher o alvo.
- **Abertura usa precedência explícita:** `day.targetMinutes ?? user?.duration ?? defaultTargetMinutes(volumeProfile)`. A assinatura salva é capturada depois dessa normalização para não criar dirty-state artificial.
- **Recomendação é determinística e apenas textual:** perfil mais próximo com desempate pelo menor limite mínimo, tolerância de ±5 min e faixa de exercícios limitada a 1–12. Nenhum aviso altera perfil, tempo, séries ou slots.
- **Rascunho e commit permanecem separados:** `onValidChange` atualiza somente a apresentação do campo e dos presets; blur/Enter confirmam, Escape restaura.
- **Compatibilidade legada preservada:** `buildDurationWarning` delega ao novo analisador no modo de limite exato e mantém a mensagem pública anterior.
- **Nenhuma evolução estrutural foi acoplada:** storage v1, migrações, shape de `ProgramDay`, seeds, progressão, treino ativo e histórico permanecem intocados. O GOAL B não foi iniciado.

## GOAL-TF-B — picker por foco do dia (2026-07-19)

- **Um único resolver alimenta lista, match legado e contadores:** cada foco é resolvido isoladamente por `matchesDayFocus`, com `ExerciseFocusMatch` preservado por item; não existe score, pontuação, ranking ou reordenação da biblioteca.
- **A taxonomia define as abas:** focos inválidos/duplicados são removidos, a ordem é `MUSCLE_GROUPS` e `Todos` fica sempre por último. Um foco produz `[Foco, Todos]`; zero focos mantém a biblioteca inteira sem tablist adicional.
- **Busca e aba são estados independentes:** trocar aba preserva a busca; limpar preserva a aba. Fechar desmonta o conteúdo, então reabrir o mesmo dia reinicia busca e primeira aba; mudar `day.id` também remonta o conteúdo.
- **Tablist segue o padrão acessível:** roving `tabIndex`, `aria-selected`, associação aba/painel, setas com wrap e Home/End. Chips usam scroll e snap horizontal no mobile.
- **Modal fica acima da navegação móvel:** `z-[100]` evita que o CTA global `Treinar` cubra os contadores do rodapé, conflito observado e revalidado no QA de 360 px.
- **Compatibilidade pública preservada:** `filterExercisesByDayFocus` mantém a assinatura em `workout-builder.ts` e apenas delega ao novo domínio. `matchesDayFocus`, `handleAddExercise`, storage, seeds e progressão não mudaram. O GOAL C não foi iniciado.

## GOAL-TF-C — badges e agrupamento por papel (2026-07-19)

- **Papel é projeção direta de `ExerciseFocusMatch`:** `primary`/`legacy-primary` ficam em Principais, `secondary`/`legacy-secondary` em Sinergistas e `legacy-generic` em Classificação legada; nenhuma anatomia, pontuação ou ordem interna é inventada.
- **Sinergistas são disclosure, não filtro de abrangência:** a seção nasce colapsada por aba e pode ser expandida independentemente; o toggle `[Principais|Incluindo sinergistas]` continua fora do escopo.
- **Legado permanece visível em dois níveis:** o banner agregado continua resumindo a aba e cada item cujo `match.legacy` é verdadeiro recebe badge âmbar. `legacy-generic` também traz “Revise o grupo antes de adicionar”.
- **Badges não curam catálogo:** grupo principal vem da resolução canônica/legada já existente; equipamento usa exatamente `exercise.equipment`, sem normalização de texto.
- **Aba Todos conserva todos os exercícios:** cada item é confrontado somente com seu próprio grupo principal resolvido para expor papel e legado, sem filtrar, ranquear ou alterar a ordem da biblioteca. **Superada em `GYMFLOW-BUILDER-TF-GOAL-C-TODOS-FLAT-CORRECTIVE-004` — ver decisão abaixo.**
- **Acessibilidade é contrato do item e da seção:** botão anuncia nome, grupo principal e equipamento; cabeçalhos expõem `role=heading`; disclosure usa `aria-expanded`/`aria-controls`; foco visível foi aplicado aos novos controles.

## GOAL-TF-C-CORRECTIVE-004 — Todos sem agrupamento por papel (2026-07-20)

- **Sem foco ativo não existe papel muscular a atribuir:** a decisão original de confrontar cada exercício da aba Todos com seu próprio grupo principal (`resolveAllExercisesMatch`) produzia um match `primary` artificial para os 126 itens, exibindo "Principais (126)" sem nenhum foco real selecionado. Revertida: Todos agora é lista plana (`WorkoutPickerFlatTabResult`), sem seção, papel ou badge de grupo/legado.
- **Grouped vs. flat é uma união discriminada, não um branch implícito:** `WorkoutPickerTabResult` passou a ser `WorkoutPickerGroupedTabResult | WorkoutPickerFlatTabResult` (`mode: 'grouped' | 'flat'`), para que o componente não possa acidentalmente tratar itens de Todos como se tivessem seção/match.
- **O card do exercício continua único:** `ExercisePickerItem` foi generalizado para receber `exercise` + `focusRole` opcional em vez de sempre exigir metadata de papel, para que a lista plana e as listas agrupadas usem exatamente o mesmo renderer, sem duplicar JSX.
- **Equipamento raw nunca dependeu de foco:** permanece incondicional no card em ambos os modos; apenas o badge de grupo e o badge Legado passaram a depender de `focusRole` presente.
- **P3 não ampliados:** fonte de 8 px, ausência de teste DOM automatizado e a dependência circular `workout-builder.ts ↔ workout-picker.ts` permanecem como estavam; nenhum foi corrigido ou piorado nesta tarefa. GOAL D não foi iniciado.

## GOAL-TF-E — separar nome de programa e nome de dia (2026-07-20)

- **`WorkoutBuilderDraft.name` é o nome do DIA; o nome do PROGRAMA ganhou campo próprio (`sourceProgramName`, aditivo e opcional):** eram dois papéis distintos disputando um único campo, e o caminho legado promovia o nome do dia a nome do programa.
- **Caminho legado de `createInitialDraft`:** nome do programa = `sourceProgramName` aparado **ou** `DEFAULT_PROGRAM_NAME`; nunca o nome do dia. `legacy.name` continua virando intacto o `customName` do Dia 1 (preservação herdada do GOAL-19A mantida).
- **Todos os 6 call-sites que montam draft passam o nome do programa de origem:** os que editam um dia (`Dashboard`, `PlannerView`, `WorkoutsTab.handleEditProgramDay`, `ActiveWorkoutPage`) e também os que já entram pelo caminho de normalização (`WorkoutsTab.handleEditProgram`, `createProgramFromBase`) — nesses dois é defensivo, o programa continua sendo normalizado inteiro, mas o fallback legado passa a ser correto por construção.
- **`createInitialDraft` foi exportada para teste direto:** o bug vive nela, não em `normalizeWorkoutProgramForBuilder`; a função é pura (só depende de libs) e importa limpa no vitest em ambiente node — verificado antes de acoplar. Nenhum novo arquivo de teste; tudo em `workout-program-normalization.test.ts`, como autorizado.
- **Testes escritos contra o contrato de comportamento do GOAL, não contra o texto literal do ADR:** o ADR-TF-007 (PART 10 / PART 15) não existe fisicamente no repositório; as 7 regras de separação de nome, o roundtrip `name===autoName` sem `customName` e o caso A4 irreproduzível foram implementados a partir do enunciado e do QA MANUAL, sem inventar numeração de um documento ausente.
- **Guardrails intactos:** `resolveWorkoutDayName`, `generateWorkoutDayAutoName` e a heurística de `customName` em `normalizeDay` não foram alterados (apenas cobertos por testes novos); nenhuma migração de storage, seed ou renome de programa salvo.
- **Execução recuperada em worktree dedicado sobre a base correta:** a primeira tentativa nasceu sobre base incorreta (`b0ddfef`, master pós-GOAL A); a recuperação preservou o commit original em `backup/gymflow-tf-goalE-wrong-base-7f1895f` e reaplicou exclusivamente o delta do GOAL E sobre `17b5d331` (master pós-GOAL D, com B/C/D já integrados), no worktree dedicado `C:\Projetos\gymflow-goal-tf-e`, branch `feat/gymflow-tf-goalE-nomes`. Sem push.

## GOAL-23A — domínio de sessão (2026-07-21)

- **`ActiveSession`/`SessionLog` são wrappers finos, não uma nova entidade persistida:** `ActiveSession = { plan, session }`, `SessionLog = { session }`. O contexto persiste apenas a `WorkoutSession` (como hoje); o `SessionPlan` NÃO é gravado — é reconstruível a partir de `planned*`/`entry*` de cada `ActiveExercise`. Assim o formato físico do storage v1 fica intacto.
- **Origem e execução são dois eixos independentes em `ActiveExercise`:** `entryOrigin` (`planned|added|swapped`) e `entryStatus` (`planned|performed|partial|skipped`). A identidade da entrada é `ActiveExercise.id`; a ligação com o plano é posicional via `plannedSlotIndex` — `ExerciseSlot` **não** ganhou id (decisão aprovada).
- **`deriveExerciseEntryStatus` só retorna `planned` para exercício sem séries:** com séries, o eixo de execução é sempre `performed`/`partial`/`skipped`. O `planned` "vivo" da sessão ativa é carimbado por `startActiveSession` e sobrescrito na finalização.
- **`finalizeSession` recebe volume/PR/XP prontos e não recalcula nada:** `finishWorkout` segue calculando tudo exatamente como antes (volume/PR só de séries concluídas, XP na regra atual) e só delega a MONTAGEM do registro. A ordem dos efeitos foi preservada.
- **`endedAt` derivado como `startedAt + duração_decorrida`, sem `Date.now()`:** a regra `react-hooks/purity` sinaliza `Date.now()` especificamente dentro de `finishWorkout` (não em `startWorkout`); a forma determinística evita introduzir erro novo de lint e mantém o fim coerente com `startedAt`/`duration`.
- **Import type circular `types/index` ↔ `types/workout-session`:** mesmo padrão já usado por `workout-builder.ts`/`workout-templates.ts` (só tipos, apagado em runtime); zero erro de lint/tsc.
- **`markEntrySwapped` só altera `entryOrigin`:** o `plannedExerciseId` (exercício originalmente planejado) é preservado pelo spread interno de `swapWorkoutExercise`, que não toca nesse campo. Motivo da substituição fica fora do escopo (PENDENCIAS).
- **Treino livre: o exercício padrão inicial é `planned` (`plannedSlotIndex` 0):** consistência — todo exercício com que a sessão começa é "planejado"; só o que é adicionado durante o treino vira `added`.

## GOAL-17B-002A — fundação IndexedDB do histórico (2026-07-22)

- **Opção C aprovada, com corte estrito:** somente `workoutHistory` irá para
  IndexedDB; perfil, planejamento, programas e sessão ativa permanecem fora desta
  fundação. IndexedDB para todo o estado continua rejeitado.
- **Fundação desconectada:** `storage-adapter.ts` e `storage-indexeddb.ts` não são
  importados pelo Context, não acessam `localStorage` e não alteram hidratação,
  autosave, import/export ou comportamento visível.
- **Geração é a unidade de substituição:** `replaceHistory` grava uma geração
  inteira e `activeGeneration` na mesma transação. O ponteiro só muda no commit;
  qualquer falha mantém a geração anterior ativa e legível.
- **Sessão usa identidade, ordem usa posição explícita:** `session.id` compõe o
  índice único da geração e `order` reproduz o array. Datas nunca identificam nem
  ordenam registros. Append incremental usa ordens negativas para preservar o
  comportamento newest-first sem reescrever o histórico.
- **Rollback nasce verificável:** o store `legacySnapshots` mantém uma janela
  fixa do envelope v1 bruto, checksum SHA-256, instante e flag de verificação. A
  fundação não lê, grava ou apaga o v1 real.
- **Limpeza é deliberada:** apenas geração inativa nomeada pode ser removida; a
  ativa é recusada. Não há garbage collection implícito nesta etapa.
- **Testabilidade é parte do contrato:** `IDBFactory`, nome de banco, gerador de
  geração e relógio são injetáveis. `fake-indexeddb` existe somente em
  `devDependencies`.
- **Rollout continua bloqueado:** 002B migra v1, 002C integra o Context e 002D
  integra export/import/rollback. Validação em WebView físico segue obrigatória.

## GOAL-17B-002B — migração v1 verificada do histórico (2026-07-22)

- **002A está concluída e permanece a fundação:** o adapter ganhou somente as
  primitivas mínimas `prepareHistoryGeneration`, `readHistoryGeneration` e
  `activateHistoryGeneration`; `replaceHistory` e sua atomicidade original não
  foram alterados.
- **Staging precede ativação:** uma nova geração e `migrationGeneration` são
  gravadas atomicamente sem trocar `activeGeneration`. A ativação só ocorre após
  readback, contagem, identidade, ordem, conteúdo completo e checksum.
- **Pipeline v1 é reutilizado:** a migração recebe o envelope bruto, usa
  `parseEnvelope`/`validateEnvelope` e `normalizeSessionState`; não existe parser,
  normalizador ou acesso a `localStorage` paralelo.
- **Checksum do histórico é canônico:** chaves de objetos são ordenadas, arrays
  preservam a ordem e o SHA-256 usa os bytes UTF-8 da serialização. Data atual,
  generationId e metadata não participam do digest nem da identidade.
- **Recuperação é orientada por metadata:** `migrationGeneration` permite retomar
  uma geração preparada, concluir uma ativação já confirmada ou descartar apenas
  staging inativo comprovadamente divergente. Migração concluída é revalidada e
  não cria outra geração.
- **Falha não promove dados incompletos:** o erro original é retornado,
  `migrationStatus` vai para `failed` quando seguro, snapshot e gerações anteriores
  permanecem, e nenhuma chave v1 é apagada.
- **Ainda desconectada:** 002B não é importada pelo Context. O v1 continua fonte
  de verdade; 002C fará integração e 002D tratará import/export e rollback. O
  aparelho físico permanece gate antes do rollout.

## GOAL-17B-002C — cutover físico v2 e integração do Context (2026-07-23)

- **Versões físicas explícitas:** v1 continua sendo o envelope monolítico legível
  para migração e fallback; v2 permanece na mesma chave, contém apenas o core e
  uma referência de geração IndexedDB. O backup externo continua no formato 1.
- **Uma fonte por modo:** antes do cutover, `legacy-v1` mantém o comportamento
  atual. Depois do readback v2, `hybrid-v2` grava o core no armazenamento local e
  usa IndexedDB como fonte exclusiva de `workoutHistory`. Falhas v2 entram em
  `blocked` e nunca fabricam histórico vazio.
- **Downgrade falha fechado:** aplicativos que entendem somente v1 recebem
  `unsupported-version` ao encontrar v2, em vez de interpretar o core sem
  histórico como um estado válido.
- **Cutover verificável:** snapshot e backup bruto v1 são confirmados antes da
  troca da chave. A geração, metadata e readback do histórico são verificados
  antes do commit e o v2 é relido antes de ativar o modo híbrido.
- **Finalização durável:** append da sessão e `transaction.oncomplete` precedem
  histórico em memória, XP, streak, planejamento, desafios, postagem, limpeza e
  navegação. Duplicidade idêntica reconcilia sem repetir recompensas; divergência
  bloqueia por integridade.
- **Janela de kill reconciliada:** se a sessão terminal já estiver no IndexedDB e
  o core ainda guardar o treino ativo correspondente, o boot limpa apenas o
  residual e confirma o core sem duplicar efeitos.
- **Admin temporariamente restrito:** exportação, importação, restauração e reset
  antigos ficam bloqueados em v2 até o GOAL-17B-002D. O download do raw
  problemático continua disponível.
- **Gates de rollout permanecem:** múltiplos escritores continuam P2 e validação
  em WebView físico continua obrigatória antes de ativação para usuários.

## GOAL-17B-002C corretivo P1-A — manifest verificado por geração (2026-07-23)

- **Manifest, não marcador:** cada geração tem `generationId`, `sessionCount`,
  `orderedDigest`, `createdAt`, `updatedAt` e `verified` num store próprio
  (`generationManifests`). Só um manifest confirmado torna a geração válida.
- **Ausente ≠ vazia:** `readHistoryGenerationSnapshot` devolve presença física,
  manifest e registros juntos. Geração vazia exige `sessionCount = 0` e o digest
  vazio canônico; geração ausente bloqueia. `[]` nunca é fabricado.
- **Digest encadeado do mais antigo para o mais novo:** a ordem newest-first faz
  parte da identidade e prefixar uma sessão custa um único passo de
  encadeamento — o append normal não relê nem reserializa o histórico.
- **Digest fora da transação:** `crypto.subtle` resolve em outra tarefa e
  desativaria a transação IndexedDB. O digest é calculado antes e a transação de
  escrita reconfere a base (geração ativa, contagem e digest anteriores).
- **Serialização canônica centralizada:** saiu da migração para
  `storage-history-integrity.ts`, então migração, manifest e verificação de
  hidratação compartilham a mesma definição de "conteúdo idêntico".
- **Upgrade físico idempotente:** banco na versão 2 apenas cria stores novos.
  Gerações escritas antes do manifest preservam os registros e bloqueiam por
  `manifest-absent` em vez de hidratar histórico vazio. `schemaVersion` lógico
  do metadata e do core v2 continua 1.

## GOAL-17B-002C corretivo P1-B/P1-C — conclusão recuperável e ciclo de vida (2026-07-23)

- **Receipt no lugar de confiança no append:** o append confirmado só provava a
  sessão. Agora sessão, manifest e receipt pendente entram na mesma transação
  (`appendSessionWithCompletionReceipt`), e o receipt carrega o resultado final
  completo da conclusão. Banco interno na versão física 3, upgrade idempotente.
- **Snapshot puro, não render:** `deriveWorkoutCompletion` deriva XP, level up,
  streak, dia treinado, conquistas, desafios, postagem e limpeza do treino a
  partir dos refs, preservando exatamente as regras dos callbacks anteriores. O
  `coreEnvelopeAfter` sai desse snapshot — nenhum render React participa.
- **Estados React saem do snapshot persistido:** em vez de reaplicar callbacks
  (`addXp`/`unlockAchievement`/`addPost`) depois do commit, o Provider aplica o
  core já gravado. Memória e `localStorage` não podem divergir, e a recuperação
  no boot usa exatamente o mesmo caminho.
- **Janela de conclusão manda no autosave:** entre o commit do append e a
  liquidação do receipt, o runtime grava o snapshot pós-conclusão em qualquer
  `saveCore`. Um `pagehide` imediato não ressuscita treino ativo, XP, streak,
  planejamento, desafios ou conquistas antigos.
- **Recuperação antes de `hydrated`:** receipts pendentes são verificados,
  o core é gravado ou confirmado, os efeitos fora do core são materializados e o
  receipt é liquidado antes de liberar o autosave. Idempotente em reinícios
  repetidos; qualquer divergência bloqueia por integridade.
- **Receipt pendente é a fonte na duplicidade:** reenvio da mesma sessão com
  receipt pendente devolve o receipt durável original (não a nova tentativa),
  então efeitos não são recalculados nem duplicados.
- **Ciclo de vida explícito:** `mountedRef` e `pendingFinalizationPromiseRef`
  impedem setState/toast/navegação após o unmount, enquanto a operação durável
  segue até o fim. O runtime conta retenções e drena operações pendentes em
  `close()`, então o cleanup da primeira montagem do Strict Mode não fecha um
  adapter ainda em uso pela segunda.

## GOAL-17B-002C corretivo C06 — recuperação pendente até novo boot (2026-07-23)

- **Falha do core não é recuperável na mesma montagem:** quando a transação do
  append/receipt já foi confirmada e a gravação do `coreEnvelopeAfter` falha, a
  montagem inteira entra em recuperação necessária. Uma gravação posterior
  bem-sucedida não é evidência de que o protocolo terminou: o receipt continua
  pendente, o `pendingCompletionCore` continua ativo e `storageHealth` fica em
  `write-error`/`blocked` até um novo boot. Recuperação completa na mesma
  montagem foi descartada por ser exatamente a suposição que gerou o P2.
- **Autosave suspenso em vez de silencioso:** `saveCore` recusa (`blocked`)
  enquanto houver conclusão pendente, em vez de reescrever o snapshot da
  conclusão a cada `saveCore`. Antes, o autosave "funcionava" gravando sempre o
  mesmo core pós-conclusão — o usuário via sucesso enquanto as edições feitas
  depois da falha não iam para lugar nenhum. Agora nada é anunciado como salvo.
- **`flushPendingCompletionCore` explícito:** o ciclo de vida (`pagehide`/
  `visibilitychange`) ganha um caminho próprio que grava **somente** o
  `pendingCompletionCore`. Nenhum core derivado dos refs renderizados pode
  substituir o snapshot de conclusão, e o sucesso não liquida o receipt nem
  limpa o estado pendente.
- **`reportWriteResult` não promove para ready:** enquanto
  `completionRecoveryRequiredRef` estiver ativo, um resultado `ok` não restaura
  `storageHealth`. `markHistoryCommitHealthy` tem a mesma guarda.
- **Segunda finalização recusada nas duas camadas:** `finishWorkout` retorna
  cedo e o runtime lança `HybridStorageIntegrityError` em `commitCompletion`
  enquanto `hasPendingCompletion()` for verdadeiro. Nenhuma segunda sessão,
  recompensa ou receipt nasce. A duplicidade "conteúdo idêntico com receipt
  pendente vira recuperação" foi substituída por essa recusa: reprocessar o
  receipt é atribuição do boot, não de uma nova chamada de conclusão.
- **Mensagem honesta e única:** o Provider informa que o aplicativo precisa ser
  reaberto para finalizar a recuperação, uma única vez por montagem
  (`completionRecoveryMessageShownRef`), sem toast de "salvo" nem de recuperação
  concluída, e nada é emitido após o unmount.
- **Comentário de `recordDigests` corrigido:** o texto afirmava que `null` é
  sempre divergência. O comportamento real tolera digests individuais ausentes
  em registros legados — o `orderedDigest` recalculado sobre o conteúdo completo
  continua verificando a integridade, e manifest ausente ou divergente continua
  bloqueando. Algoritmo, digests, separador, constantes e formato persistido
  intocados.

## GOAL-17B-002D-A0 — capacidade real antes da apresentação (2026-07-24)

- **Fonte única de capacidade:** `resolveStorageRecoveryCapabilities` nasceu em
  `storage-hybrid.ts`, ao lado de `canUseLegacyAdminOperations`, e recebe modo,
  versão física, status de saúde, existência de backup legado e presença de
  conteúdo bruto. A regra de versão **não** foi duplicada no componente React —
  o `StorageRecoveryNotice` passou a receber as capacidades já resolvidas.
- **`storagePhysicalVersion` virou estado do Provider:** antes só existia
  derivado dentro do efeito de hidratação. Sem ele a UI teria de reinferir a
  permissão a partir de `storageMode`, que é exatamente o acoplamento que o
  corretivo remove. No caminho de falha da migração legada ele fica `null`,
  preservando `canUseLegacyAdminOperations('blocked', null) === true`.
- **`hasBackup` deixa de habilitar restauração em v2:** o valor continua vindo
  do parser v1 e continua descrevendo o backup congelado no cutover. Redefinir
  toda a semântica pública de backup seria escopo do 002D-E; aqui apenas se
  impede que ele ofereça uma restauração que o Context recusa.
- **Download do conteúdo bruto não é restauração:** é a única ação oferecida em
  v2 bloqueado, é somente leitura e o texto declara que não corrige o
  armazenamento. Sem conteúdo bruto, nenhum botão é renderizado — um botão sem
  implementação seria a mesma desonestia que o corretivo elimina.
- **Nada de reset nem reinstalação como sugestão:** no estado sem ação
  disponível o aviso orienta a preservar aplicativo e dados. Sugerir reinstalar
  seria sugerir perda de dados sem caminho de recuperação verificado.
- **AdminPanel preservado:** a auditoria confirmou que os quatro botões de
  "Dados locais" já estão `disabled` sob v2 e que o bloqueio é explicado no
  painel. Sem botão executável, não havia o que corrigir — mexer no painel seria
  alteração fora do escopo declarado.
- **Guardas do Context intocadas:** `restoreStorageBackup`, `startFreshStorage`
  e `applyStorageImport` continuam recusando sob v2. O corretivo alinha
  apresentação e capacidade; a defesa em profundidade permanece.

## GOAL-17B-002D-A1 — fundação administrativa do IndexedDB (2026-07-24)

- **002D-A foi subdividido em A1 e A2:** o slice original acumulava fundação
  física, runtime administrativo e coordenação do core v2. A1 entrega só a
  fundação interna (upgrade v4, receipts administrativos, enumeração, leitura
  verificada e rollback do ponteiro); a fachada segura do runtime fica no A2.
- **Store novo em vez de reuso do `completionReceipts`:** `storageOperationReceipts`
  nasce separado com `keyPath: operationId` e índices `byStatus`, `byKind` e
  `byUpdatedAt`. Compartilhar o store faria o boot de treino ler um registro
  administrativo pelo índice de status — o `pending` da conclusão e o `staged`
  da operação nunca podem colidir.
- **Isolamento também estrutural, não só físico:** `isStorageOperationReceipt`
  recusa qualquer registro que carregue `receiptId`, `finalSession` ou
  `sessionDigest`. Store separado já bastaria para o caminho normal, mas uma
  gravação errada não pode virar operação administrativa válida.
- **`previousCoreRaw` e `previousGenerationId` obrigatórios e não vazios:** o
  core anterior é o que permite desfazer a operação. Aceitar string vazia seria
  persistir uma promessa de rollback inexistente — a mesma armadilha do histórico
  vazio silencioso.
- **A listagem de operações varre o store inteiro, não o índice `byStatus`:** um
  registro com status ausente ou inválido não entra em índice nenhum, e a
  listagem responderia "nada em aberto" sobre um store corrompido. O índice
  continua criado (schema exigido pela v4) e será usado por consultas dirigidas
  do A2; a listagem de recuperação precisa ser fail-closed.
- **Primitivas administrativas em interface própria:** `WorkoutHistoryAdministrationAdapter`
  fica ao lado de `WorkoutHistoryStorageAdapter` em vez de dentro dele. O
  contrato de histórico é consumido pela migração v1 e pelo runtime híbrido, que
  não devem executar operação administrativa; a implementação IndexedDB declara
  os dois contratos, sem cast e sem método ausente.
- **`listHistoryGenerations` é diagnóstica e não julga integridade:** `verified`
  reporta apenas a flag declarada pelo manifest — `null` sem manifest, `false`
  com manifest ilegível. Manifest presente nunca é tratado como geração íntegra;
  integridade real só sai de `readVerifiedHistoryGeneration`.
- **Marcadores físicos de staging entram na união de gerações:** além dos quatro
  fontes exigidas, `generationNextOrder:<id>` também é lido. Uma geração cujos
  registros e manifest sumiram continuaria fisicamente marcada e ficaria
  invisível — exatamente o órfão que a enumeração existe para expor.
- **Ordenação por `updatedAt ?? createdAt` decrescente:** ativa, staged e depois
  as demais da mais recente para a mais antiga, com gerações sem manifest no fim
  e desempate por `generationId`. Newest-first é a convenção já usada pelo
  histórico; o desempate garante determinismo.
- **Rollback devolve `changed: false` em vez de recusar o alvo já ativo:** a
  gravação é idempotente e o resultado é explícito. Recusar seria transformar um
  no-op seguro em erro que o A2 teria de interpretar.
- **Rollback não limpa `migrationGeneration` implicitamente:** o ponteiro de
  staging só é limpo quando `clearStagedGenerationId` confere exatamente; qualquer
  divergência aborta a transação inteira. Limpeza implícita apagaria o rastro de
  uma operação de outra aba.

## GOAL-17B-002D-A1 corretivo — rollback atomicamente verificável (2026-07-24)

- **`workoutHistory` entra na transação do rollback:** a auditoria independente
  reproduziu a janela — com o store fora do escopo, o IndexedDB não serializa
  escritores concorrentes e as sessões podiam mudar entre a verificação e a
  ativação. Incluir o store é o que dá a exclusão mútua; a reconferência sozinha
  não bastaria.
- **Prova canônica em vez de crypto dentro da transação:** a verificação de
  integridade depende de `crypto.subtle`, que é assíncrono e desativaria a
  transação. A prova é montada fora dela, a partir da MESMA leitura crua que
  alimentou a verificação, e guarda `order`, `sessionId`, digest persistido e a
  serialização canônica de cada sessão. Dentro da transação a comparação é
  síncrona, só de strings.
- **Leitura crua compartilhada:** `readGenerationRecords` virou a fonte única do
  snapshot público e da prova. Duas leituras separadas reabririam uma janela
  entre elas — a prova precisa descrever exatamente o estado que foi verificado.
- **Conteúdo canônico comparado sempre, digest também:** digest persistido
  sozinho é falsificável (basta alterar a sessão mantendo o digest antigo), e
  conteúdo sozinho não detectaria adulteração só do digest. Os dois são
  comparados. Com digest `null` de registro legado, a serialização canônica
  continua obrigatória — `null` não afrouxa a comparação.
- **No-op deixou de reescrever o ponteiro:** o alvo já ativo passa pelas mesmas
  verificações, mas não regrava `activeGeneration`. Metadata fica byte a byte
  intocada, e o no-op continua recusando quando a geração está corrompida.
- **Chave não textual em metadata vira erro de domínio:** `HistoryMetadataIntegrityError`
  em vez do `TypeError` de `startsWith`. Ignorar o registro devolveria listagem
  parcial, e listagem parcial esconderia de um runtime de recuperação exatamente
  a geração que ele precisa enxergar. O erro nasceu interno ao
  `storage-indexeddb.ts`: a interface do adapter não mudou.
- **Sondas da auditoria viraram testes permanentes:** as três reproduções usam
  banco `fake-indexeddb` real, executam a verificação e o rollback verdadeiros e
  só usam a interceptação de `crypto.subtle.digest` para abrir a janela. Elas
  exigem `HistoryRollbackConflictError` — se a verificação prévia tivesse pego a
  mutação, o tipo do erro seria outro e o teste falharia.

## GOAL-17B-002D-A2 — fachada administrativa segura (2026-07-24)

- **Fachada em arquivo próprio (`storage-admin-runtime.ts`), não dentro de
  `storage-hybrid.ts`:** `HybridStorageRuntime` já tem 1279 linhas e é a
  interface que o Provider consome. Uma fachada administrativa que "não deve
  ser conectada ao Provider" ficando no mesmo arquivo correria o risco real de
  um método vazar para a interface pública por engano. Arquivo separado, mesmo
  padrão de `storage-operation-receipt.ts` ao lado de
  `storage-completion-receipt.ts`: contratos que não podem se misturar vivem
  separados.
- **`createStorageOperationReceiptIfIdle` é primitiva do adapter, não da
  fachada:** ela precisa da mesma transação atômica das demais primitivas do
  A1 (scan + releitura de metadata + `add` em uma única transação readwrite) e
  segue o padrão já estabelecido em `storage-indexeddb.ts` — cada primitiva com
  seus próprios erros de domínio (`StorageOperationAlreadyInProgressError`,
  `StorageOperationBeginConflictError`). A fachada reexporta os dois em vez de
  duplicá-los, conforme "reutilizar erros existentes quando forem
  semanticamente corretos".
- **Quatro estados, um único método de leitura:** `inspectStorageAdministration`
  devolve sempre um snapshot com o mesmo formato; o motivo de bloqueio vive
  dentro de `state`, nunca em exceção. Nenhum outro método decide sozinho se o
  runtime está pronto — todos (`beginStorageOperation`,
  `readVerifiedAdministrationGeneration`) chamam o inspect internamente antes
  de agir.
- **`physical-version-mismatch` é só para versão física numericamente
  desconhecida:** `v1` vira `not-hybrid`, envelope corrompido vira
  `core-invalid`, e só o caso `unsupported-version` do `parsePhysicalEnvelope`
  (um `v` que não é 1 nem 2) usa esse motivo. Os três nunca se confundem porque
  vêm de branches distintos do mesmo parser já testado no A0/A1.
- **Conclusão de treino pendente sozinha classifica como `conflicted`, não
  `unavailable`:** a definição de `ready` do enunciado já exige "nenhuma
  conclusão de treino pendente", então o estado nunca poderia ser `ready`; mas
  a camada física (localStorage, IndexedDB, core v2) continua perfeitamente
  utilizável — não é "indisponível", é "ambíguo demais para mutar agora". A
  mesma razão passa a existir isolada (`completion-pending`) e combinada com
  operação administrativa (`completion-pending-with-operation`), preservando o
  isolamento entre os dois tipos de receipt.
- **~~`active-generation-corrupt` usa a flag do manifest, não verificação
  integral~~ — DECISÃO REVERTIDA pelo corretivo 036 (ver ADR abaixo).** A
  justificativa original era custo, e ela estava errada em dois pontos: (a)
  `ready` passou a ser uma afirmação falsa sobre armazenamento corrompido, e
  (b) a afirmação "o snapshot documenta isso explicitamente no tipo" era
  incorreta — nem `StorageAdministrationState`, nem `'ready'`, nem
  `'active-generation-corrupt'` tinham qualquer comentário a respeito. O único
  comentário sobre a flag vivia dentro do `beginStorageOperation`, descrevendo o
  que o begin faz, não o que o inspect deixava de fazer.
- **`beginStorageOperation` relê `raw` e `activeGeneration` depois do CAS, não
  reaproveita o snapshot inicial:** o core v2 vive no `localStorage`, fora da
  transação IndexedDB que cria o receipt. O CAS do adapter garante consistência
  só do lado IndexedDB; a releitura pós-criação fecha a janela do lado
  `localStorage`. Divergência em qualquer um dos dois **tenta** transicionar o
  receipt recém-criado para `reverted` (nunca apaga) e devolve
  `StorageOperationBeginConflictError`. *Corrigido em 036:* a redação original
  afirmava a reversão como garantia incondicional; ela é uma tentativa, e o
  resultado real viaja no erro.
- **`coreDigest` é best-effort e nunca decide estado:** calculado via
  `sha256Checksum` (já existente, reaproveitado de
  `storage-history-integrity.ts`) só para diagnóstico comparável entre
  snapshots; falha de `crypto.subtle` vira `null` em vez de derrubar o
  `inspect`.
- **Erros de domínio preservam `cause` nativo (`Error(message, { cause })`),
  não um campo `originalError` customizado:** o enunciado pede "cause"
  literalmente, e o alvo do projeto (`lib: esnext`, Node 24 no build) suporta a
  opção nativa. `LegacySnapshotIntegrityError` do A1 usa `originalError`
  porque antecede essa exigência; não foi alterada por estar fora do escopo
  autorizado deste GOAL.

## GOAL-17B-002D-A2 corretivo 036 — fechamento dos conflitos Classe C (2026-07-24)

Auditoria independente do A2 classificou o commit `429c87d` como **Classe C /
NÃO APTO**, com três bloqueantes reproduzidos por fault injection real. Este
corretivo fecha os três e mais quatro achados P1/P2. O commit original foi
preservado; nada de amend, squash ou rebase.

- **`ready` passa a exigir verificação criptográfica integral da geração
  ativa:** era o bloqueante principal. Seis corrupções físicas (conteúdo
  alterado mantendo o digest persistido, digest alterado, ordem física trocada,
  sessão removida, sessão adicionada, `orderedDigest` incorreto com
  `verified=true`) devolviam `ready` enquanto
  `readVerifiedAdministrationGeneration` reprovava a MESMA geração na mesma
  fachada. A defesa "o begin verifica de novo" não vale: `inspect` é resultado
  público e não pode mentir. Agora o diagnóstico roda
  `verifyHistoryGeneration` — a MESMA primitiva do A1, não uma segunda
  implementação — sobre os registros do snapshot atômico, e o resultado viaja em
  `snapshot.activeGenerationIntegrity`. A flag persistida continua em
  `generations[].verified`, agora explicitamente documentada como flag e nunca
  como prova.
- **Snapshot atômico no adapter em vez de quatro leituras independentes:**
  `readStorageAdministrationSnapshot()` abre UMA transação readonly sobre
  `metadata` + `workoutHistory` + `generationManifests` +
  `storageOperationReceipts` + `completionReceipts`. Antes, `inspect` combinava
  quatro leituras que podiam descrever momentos diferentes. Ela também devolve
  os registros da geração ativa, para que a verificação integral não precise de
  uma transação auxiliar que reabriria a janela.
- **Double-read com fingerprint determinístico:** transação atômica sozinha não
  basta, porque o core v2 vive no `localStorage`, fora do IndexedDB. O protocolo
  é core → snapshot A → verificação integral → core → snapshot B → core, e só
  conclui quando os três cores são idênticos e `fingerprint(A) ===
  fingerprint(B)`. O fingerprint cobre metadata, ponteiros, manifests, o
  conteúdo canônico de todos os registros de histórico, todos os receipts
  administrativos e todos os CompletionReceipts pendentes — nunca só a
  contagem, senão uma sessão trocada mantendo id, ordem e digest passaria
  despercebida. A verificação roda DENTRO da janela de propósito: uma mutação
  durante ela muda o fingerprint em vez de aprovar conteúdo que já não existe.
- **Uma segunda tentativa, não um loop:** instabilidade costuma ser um blip. O
  `inspect` repete o protocolo no máximo uma vez; divergência persistente vira
  `conflicted` (`administration-snapshot-unstable` ou
  `core-changed-during-inspection`) e nunca escolhe qual das leituras seria a
  "certa". Um blip isolado resolve na segunda tentativa — e resolve descrevendo
  o estado NOVO inteiro, nunca uma mistura dos dois momentos.
- **`COMPLETION_RECEIPTS_STORE` entra na transação de criação do receipt:** era
  o segundo bloqueante. Uma conclusão de treino gravada entre o diagnóstico e a
  criação passava despercebida e o begin nascia sobre um estado obsoleto,
  fabricando exatamente o `completion-pending-with-operation` que ele existe
  para impedir. Colocar o store no escopo faz o IndexedDB serializar
  `createStorageOperationReceiptIfIdle` com
  `appendSessionWithCompletionReceipt`: as duas disputam o mesmo store, então
  uma espera a outra. O receipt de conclusão nunca é lido por fora da transação,
  nunca é alterado e nunca é liquidado — só bloqueia, com
  `StorageCompletionPendingError`.
- **`transitionStorageOperationIfUnambiguous` em vez de delegação pura:** era o
  terceiro bloqueante. A transição antiga só checava `isAvailable()`, e a
  auditoria a fez avançar um receipt em `conflicted` de quatro formas — inclusive
  com o core v2 **removido** do `localStorage`. Agora a fachada exige
  `interrupted` (o que já implica core válido e estável, geração ativa
  verificada, exatamente um receipt não terminal, zero conclusão pendente e
  receipt coerente) e a primitiva do adapter reconfere tudo DENTRO da transação
  de escrita, com CAS da geração ativa. *Corrigido em 038:* essa reconferência
  cobre apenas o lado IndexedDB. O core v2 vive no `localStorage` e não
  participa da transação — a redação original sugeria uma segunda defesa que
  conferia o core, e ela não conferia. A proteção do core é o protocolo
  pré/pós-transação do 038.
- **A transição também valida o estado PROJETADO:** recusar só o estado atual
  deixaria o chamador criar um beco sem saída — `activating → activated` produz
  um receipt afirmando efeitos (geração preparada ativa, core alvo gravado) que
  nenhum fluxo do A2 executa. A projeção é avaliada antes de escrever. Status
  terminal (`settled`/`reverted`) não descreve efeito nenhum, então reverter é
  sempre permitido.
- **`evaluateStorageOperationCompatibility` é helper puro em
  `storage-operation-receipt.ts`:** a coerência receipt × core × metadata ×
  gerações não depende de IndexedDB, então não deve viver perto dele. Puro é
  testável em tabela, e é onde os três status vivem: `compatible`,
  `incompatible` (razão fechada) e `insufficient-evidence` — este último para
  quando o mundo observado não é contraditório mas o A2 não consegue **provar**
  que os efeitos declarados vieram desta operação. `insufficient-evidence` nunca
  é tratado como `compatible`: os dois bloqueiam a mutação igualmente.
- **Compensação com resultado estruturado, nunca `catch {}`:** o A2 original
  engolia a falha da compensação num catch vazio e devolvia a mensagem idêntica
  à do caso bem-sucedido — o chamador não distinguia "receipt revertido" de
  "receipt staged travando todos os begins futuros". Agora
  `StorageOperationBeginConflictError` carrega `operationId`, `compensation`
  (`reverted` | `failed` | `not-attempted`), `compensationCause`,
  `finalReceiptStatus` e a `cause` original. Quando a compensação falha, a
  mensagem diz FALHOU e informa o status remanescente; o receipt nunca é apagado
  nem sobrescrito à força, e reaparece no próximo diagnóstico.
- **`stagedGenerationId` e `targetCoreRaw` obrigatoriamente `null` no A2:**
  aceitar valor gravaria no receipt uma promessa que nada cumpre. A recusa é
  `StorageAdministrationInputError`, antes de qualquer leitura ou escrita.
- **`StorageAdministrationInputError` em vez de `RangeError`/`TypeError` cru:**
  `now()` devolvendo instante inválido derrubava um `RangeError` de
  `toISOString()` direto no chamador. Agora vira erro de domínio com `field`
  tipado, preservando o `RangeError` em `cause`. O mesmo para `idFactory` vazia
  e `generationId` vazio.
- **`cause` viaja dentro do estado, não só no texto:** `StorageAdministrationState`
  ganhou `cause?: unknown` em `unavailable` e `conflicted`. Sem isso, o caminho
  `storage-blocked` perdia a exceção original do `localStorage`, porque o erro
  era reconstruído a partir do snapshot, que só guardava `detail`.
- **`summarizeGenerations` compartilhado entre `listHistoryGenerations` e o
  snapshot atômico:** duas enumerações de geração divergentes seriam
  exatamente o tipo de inconsistência que este slice existe para impedir.

## GOAL-17B-002D-A2 corretivo 038 — TOCTOU do core na transição (2026-07-25)

Segunda auditoria independente reprovou o 002D-A2 de novo (**Classe C**): a
transição avançava `staged → activating` sobre um core do `localStorage` já
trocado, e o receipt ficava preso em `activating`. Os dois commits anteriores
foram preservados; nada de amend, squash ou rebase.

- **O modelo de consistência do core passou a ser explícito, não implícito.** A
  redação anterior deixava entender que a transação readwrite do adapter era a
  defesa final. Ela nunca foi: o core v2 mora no `localStorage` e não pode
  entrar numa transação IndexedDB. O que existe agora é um protocolo declarado —
  leitura antes, comparação byte a byte, transação, leitura depois, compensação
  — e uma garantia que cabe numa frase: *a transição só retorna sucesso quando o
  core observado antes e imediatamente depois da transação continua byte a byte
  igual ao core compatível com o receipt.* Nada de atomicidade única entre os
  dois armazenamentos, porque ela não existe.
- **Compensação em vez de "recusar e pronto" no pré-transação.** Um core
  divergente antes da transação poderia simplesmente abortar sem tocar no
  receipt. Optamos por compensar para `reverted`: a operação nasceu descrevendo
  um mundo que já não existe, e deixá-la em aberto bloquearia todo begin futuro
  por um estado que ninguém mais consegue retomar. O erro sai com
  `phase: 'pre-transition'`, então a diferença é observável.
- **`revertStorageOperationAfterTransitionConflict` é uma primitiva separada, e
  não `transitionStorageOperationIfUnambiguous` com `nextStatus: 'reverted'`.**
  A primitiva de avanço bloqueia com CompletionReceipt pendente e exige o CAS da
  geração ativa. Numa compensação isso é exatamente o comportamento errado: o
  mundo JÁ divergiu, e recusar a reversão foi o que criou a armadilha do receipt
  preso. A nova primitiva só sabe ir para `reverted`, mantém os três stores na
  transação, valida todos os registros dos dois stores de receipt, relê e valida
  a metadata, e aceita o CAS como opcional. Ela nunca apaga o receipt nem faz
  `put` sem conferência.
- **`revertStorageOperationSafely` na fachada, separada do caminho de avanço.**
  Misturar as duas exigiria afrouxar o gate de `transitionStorageOperation`, que
  é justamente o que protege contra avanço em estado ambíguo. A saída de
  emergência aceita `conflicted` por incoerência, mas continua recusando
  ambiguidade estrutural — mais de um receipt não terminal, receipt malformado,
  `operationId`/status divergentes, metadata malformada, adapter indisponível.
  CompletionReceipt pendente não bloqueia porque reverter só REDUZ o conflito.
- **`StorageOperationTransitionConflictError` separado de
  `StorageOperationBeginConflictError`:** o begin e a transição falham em fases
  diferentes e precisam de campos diferentes (`phase`, `attemptedStatus`,
  `observedCoreDigest`). Reaproveitar o erro do begin obrigaria o chamador a
  adivinhar de onde veio. Nenhum dos dois carrega core bruto na mensagem — só
  digest, porque `previousCoreRaw` é o estado inteiro do usuário.
- **`finalReceiptStatus` ganhou `missing` e `unknown`.** `null` significava as
  duas coisas ao mesmo tempo: "o registro não existe" e "nem consegui ler".
  Agora são valores distintos, e `unknown` sempre vem acompanhado de
  `finalStatusReadCause` — a variável que o 036 capturava e descartava.
- **Fingerprint com o conteúdo integral dos cores do receipt.** O comprimento
  era um atalho: dois cores diferentes de mesmo tamanho colidiam e o double-read
  não via a troca. Usamos `sha256Checksum` (a função que já existe, calculada
  fora da transação) e caímos para o raw inteiro no material canônico quando não
  há Web Crypto — nunca para comprimento, presença, prefixo ou sufixo. O
  fingerprint continua sem expor o core.
- **Ponteiro de metadata não textual invalida a leitura em vez de virar `null`.**
  Converter para `null` transformava metadata corrompida em "não existe geração
  ativa" (`core-invalid`), que é um motivo falso e aponta para o lugar errado.
  Agora é `HistoryMetadataIntegrityError` → `metadata-malformed`, com a causa
  preservada. A validação ficou nos dois ponteiros estruturais
  (`activeGeneration`, `migrationGeneration`), que são os que decidem a
  enumeração; as demais chaves continuam com o tratamento de sempre.
- **`reverted` não passa pelo protocolo pós-commit completo.** Status terminal
  não afirma efeito nenhum, então um core que mude depois dele não invalida
  coisa alguma — e "compensar" um receipt já revertido só produziria uma falha
  de CAS inventada. A confirmação de `reverted` se limita à releitura do status
  persistido.

## GOAL-17B-002D-B — formato lógico de backup v2 (2026-07-25)

Slice B do 002D. O A2 foi integrado e encerrado; nada dele mudou aqui. Esta
etapa entrega **somente** formato, captura read-only, digest, serialização e
inspeção. Não existe importação v2, restauração, rollback, reset, retenção,
recuperação automática, UI, Provider, download nem call site.

- **Módulo próprio (`storage-logical-backup.ts`), e não `storage-export.ts`.**
  Os dois protocolos têm formatos, limites, validações e caminhos de falha
  diferentes. Misturá-los no mesmo arquivo faria o fluxo v1 — que continua sendo
  o único com importação real — carregar ramos v2 em cada função. `storage-export.ts`
  não foi tocado e não conhece este módulo.
- **O payload é lógico, não `StorageEnvelope<PersistedState>`.** O envelope é um
  detalhe do armazenamento (`v`, `savedAt`), e o v2 físico nem sequer contém o
  histórico. Copiar o envelope reintroduziria a dependência física que o híbrido
  quebrou. O arquivo carrega `PersistedState` puro; `sourceSavedAt` e
  `sourcePhysicalStorageVersion` ficam no envelope EXTERNO do backup, como
  proveniência, não como estrutura.
- **Validação v2 nova em vez de endurecer `validatePersistedStateShape`.** O
  validador permissivo existe para tolerar estados salvos por versões antigas do
  app; apertá-lo quebraria hidratação legítima. `validateLogicalBackupPayload`
  **reutiliza** o permissivo como base e só acrescenta exigências (16 campos
  raiz obrigatórios, tipos por campo, ids de sessão não vazios e sem
  duplicidade, ausência dos campos físicos, ausência de chaves de protótipo).
- **`exercises` da sessão conferido só quando presente.** Exigir a presença
  recusaria históricos hoje válidos. O objetivo é recusar o inválido, não apertar
  o domínio de treino.
- **Lista explícita de campos físicos proibidos, e não "tudo que não conheço".**
  Uma versão futura pode acrescentar um campo lógico novo; recusá-lo por
  desconhecimento transformaria evolução em corrupção. Vazamento físico continua
  recusado sempre.
- **A forma canônica é o que vai para o arquivo, não só para o digest.** Assinar
  uma ordenação e publicar outra permitiria que `content` e `payloadDigest`
  divergissem por reordenação. Com o payload canônico gravado, o mesmo estado
  lógico produz `content` e `bytes` idênticos, e a reconferência na inspeção é
  exatamente a mesma conta.
- **Número não finito PARA a serialização em vez de virar `null`.**
  `JSON.stringify` converte `NaN`/`Infinity` silenciosamente — e um digest assim
  assinaria um estado diferente do que existe. `LogicalBackupSerializationError`
  carrega o CAMINHO (`payload.weightHistory[0].value`), nunca o valor.
  `JSON.parse('1e999')` é o único jeito de um arquivo carregar `Infinity`, e a
  inspeção o recusa.
- **Domínio explícito no material do digest** (`gymflow:logical-backup:v2:`),
  pelo mesmo motivo dos digests de histórico: um SHA-256 sem domínio pode ser
  confundido com o de outro artefato. Reutiliza `sha256Checksum` — não nasceu
  uma segunda implementação de SHA-256.
- **Sem Web Crypto não existe backup.** Nada de hash fraco, comprimento,
  contagem ou "digest opcional": `crypto-unavailable` com a causa original
  preservada. Um arquivo sem digest verificável não é um backup, é um palpite.
- **`LogicalBackupRuntime = Pick<StorageAdminRuntime, 'inspect…' | 'readVerified…'>`.**
  A captura é read-only por TIPO, não por disciplina: `beginStorageOperation`,
  `transitionStorageOperation` e `revertStorageOperationSafely` sequer existem
  no parâmetro recebido.
- **Duas fotos do estado físico com a leitura verificada no meio.** O core mora
  no `localStorage` e o histórico no IndexedDB; não há atomicidade entre eles. A
  garantia declarada é: *o backup só existe quando o core observado antes e
  depois da leitura verificada do histórico é byte a byte o mesmo, com o mesmo
  `activeGenerationId`, o mesmo `administrationFingerprint`, a mesma versão
  física, zero receipt administrativo e zero conclusão pendente nas duas pontas.*
  Divergência não escolhe leitura: `snapshot-changed-during-export`.
- **`core.data.historyStorage.generationId === activeGenerationId` é exigência,
  não detalhe.** Sem ela o arquivo poderia casar o core de uma geração com o
  histórico de outra — o defeito exato que o protocolo existe para impedir.
- **Limites v2 separados dos do v1.** `MAX_IMPORT_BYTES` continua 5 MiB para o
  envelope monolítico. O arquivo lógico ganha `LOGICAL_BACKUP_LARGE_WARNING_BYTES`
  (8 MiB) e `MAX_LOGICAL_BACKUP_BYTES` (25 MiB), medidos em bytes UTF-8 reais —
  contagem de caracteres subestima acentuação e emoji, que existem em nome de
  usuário e nome de treino.
- **`JSON.stringify(backup)` sem indentação.** O histórico completo já é grande;
  `null, 2` gastaria megabytes em espaço de apresentação. O v1 continua indentado.
- **A inspeção termina em preview.** Não existe `commitLogicalStorageImportV2` e
  nenhuma função deste módulo escreve. Importar é 002D-C.

## GOAL-17B-002D-B corretivo 046 — consistência fechada do backup lógico v2

- **A leitura intermediária é comparada com o CONTEÚDO verificado pelos dois
  diagnósticos, não só com o estado administrativo em volta deles.** A auditoria
  comprovou a corrida ABA: histórico indo de `H1` para `H2` e voltando byte a
  byte para `H1` produz dois diagnósticos idênticos — mesmo core, mesma geração,
  mesmo `administrationFingerprint` — enquanto a leitura do meio carrega `H2`.
  `generationId`, contagem, lista de ids, `manifest.verified` e fingerprint
  **não são prova**; a prova é o descritor canônico da geração verificada
  (identidade + `sessionCount` + `orderedDigest` + manifest + ids + ordem +
  sessões completas), comparado contra A e contra B. As comparações A × B
  antigas continuam todas no lugar — o corretivo só ACRESCENTA.
- **Contrato externo e raiz do payload são conjuntos FECHADOS.** Oito chaves no
  envelope, 16 no payload. Lista de proibidos protege contra o que já se
  conhece; conjunto fechado protege contra o que ainda não se conhece — e um
  vazamento físico futuro tem nome que este código nunca viu.
- **A validação usa `Reflect.ownKeys` e descritores, não `Object.keys` nem
  `in`.** Símbolo, propriedade não enumerável e acessor são invisíveis para os
  dois últimos, e ler um getter EXECUTARIA código do arquivo dentro do
  validador. Getter é detectado por `descriptor.get`, nunca invocado.
- **A árvore JSON é validada e COPIADA antes de qualquer canonicalização.**
  `JSON.stringify` normaliza em silêncio (`undefined`/função/símbolo somem,
  `Date` vira string, `Map`/`Set` viram `{}`, `TypedArray` vira objeto
  indexado), e o digest passaria a assinar um estado diferente do que existe. A
  cópia também dá de graça a independência do payload devolvido e garante que a
  entrada nunca é modificada.
- **Protótipo padrão é exigência, inclusive contra `Object.create(null)`.**
  "Objeto simples" aqui significa `Object.prototype`; qualquer outra coisa é
  exótica o bastante para não entrar num arquivo que um dia vai restaurar dados.
- **Data canônica é regex estrita MAIS `toISOString()` de ida e volta.**
  `Date.parse` aceita data sem hora, offset local, RFC textual e ISO sem
  milissegundos — gravar isso num backup deixaria o significado da data
  dependendo do fuso de quem abriu o arquivo.
- **`declaredBytes` inválido é `invalid-size`, não "melhor esforço".** Aceitar
  `NaN` produzia `bytes: NaN` e aviso `NaN`; aceitar decimal produzia tamanho
  fracionário. O valor vem do chamador, então é entrada, e entrada inválida se
  recusa antes de `JSON.parse` e de qualquer SHA-256.
- **Mensagem pública não carrega conteúdo do payload — nem indiretamente.** Id
  de sessão duplicado tem mensagem genérica (o id é do usuário); nome de campo
  desconhecido é conteúdo do arquivo e vira `<campo>` no caminho; a mensagem
  nativa de `JSON.parse` cita um trecho do `raw` e por isso não sobe; erro
  produzido por getter ou proxy do payload nunca aparece em `error` nem em
  `cause`. `cause` sobrevive só em falha interna confiável — Web Crypto,
  runtime administrativo, IndexedDB.
- **Nome de campo vindo de CONSTANTE do código continua sendo impresso.** Os 12
  campos físicos proibidos e os 16 campos obrigatórios são nomeados nas
  mensagens porque esses nomes são nossos, não do arquivo — e uma mensagem
  precisa vale mais do que uma genérica quando não há nada a vazar.
- **Backup v1 real continua recusado como `unsupported-version`, mesmo com o
  contrato externo checado antes da versão.** Ele declara `formatVersion: 1`;
  responder "formato desconhecido" esconderia a única informação útil.
- **O teste negativo é um protocolo antigo reimplementado no arquivo de teste,
  não uma mutação temporária do módulo.** Ele reproduz fielmente as comparações
  pré-corretivo e prova que elas aprovam os nove cenários ABA — sem deixar
  `skip`, código morto ou produção mutilada no commit.

## GOAL-17B-002D-C1 — importação lógica v2 atômica (2026-07-27)

Auditoria independente 052 classificou o 002D-C como **APTO / Classe B**:
arquitetura suficiente, mas exigindo extensão controlada do contrato A1. O slice
foi dividido em **C1** (journal, staging atômico, caminho saudável até `settled`,
resolvedor puro) e **C2** (execução da recuperação após reload e matriz completa
de crash points). Este ADR cobre o C1.

- **Módulo novo (`storage-logical-import.ts`), não dentro de
  `storage-logical-backup.ts`.** Aquele módulo tem um guard permanente (teste 59)
  que proíbe `setItem`, `beginStorageOperation`, `rollbackToHistoryGeneration`,
  `writeMetadata` e qualquer nome que comece com `commit`/`save`/`write`. Ele é,
  por contrato, read-only. A escrita mora em arquivo próprio.
- **Uma primitiva A1 nova, `stageHistoryGenerationForOperation`, porque a
  atomicidade exigida não pode ser obtida de fora de uma transação.**
  `prepareHistoryGeneration` cria a geração numa transação e o patch do receipt
  seria outra: uma queda entre as duas deixaria uma geração física que nenhum
  receipt explica, e o diagnóstico do A2 não teria como provar de quem ela é. A
  primitiva nova faz as duas coisas na MESMA transação readwrite sobre os cinco
  stores administrativos, ou nenhuma delas.
- **O staging NÃO grava `metadata.migrationGeneration`.** Foi a decisão que mais
  mudou o desenho. `metadataMatchesV2` exige o ponteiro nulo para hidratar, então
  preenchê-lo bloquearia o boot durante toda a preparação — inclusive durante a
  verificação integral de um histórico grande. O vínculo geração ↔ operação já
  vive no receipt, que é durável e é lido pelo mesmo snapshot atômico. Sem o
  ponteiro, `migrationPointerCoherent(G, null)` continua verdadeiro e o
  diagnóstico segue devolvendo `interrupted` — nunca `staging-without-receipt`.
- **O importador recebe `raw` e reinspeciona internamente; não existe variante
  que aceite payload já validado.** Um `LogicalStorageBackupV2Inspection` é
  objeto simples e forjável; aceitá-lo transferiria a confiança para o chamador
  (que no 002D-E será a UI). Uma única inspeção significa um único parse, uma
  única validação, um único digest e um único objeto de payload — o mesmo que vai
  para o staging. Não há janela entre validar e usar.
- **`expectedPayloadDigest` é a amarração anti-TOCTOU com o preview.** O 002D-E
  vai inspecionar para mostrar a prévia e só depois confirmar. O parâmetro
  opcional deixa a tela declarar QUAL arquivo ela mostrou; divergência recusa
  antes do primeiro write, com motivo fechado e mensagem constante.
- **Ordem geração → core, não o inverso.** Não existe atomicidade única entre
  `localStorage` e IndexedDB e este slice não finge que existe. Qualquer ordem
  deixa uma janela em que os dois discordam. Gravando a geração primeiro, todas
  as escritas protegidas por CAS acontecem antes da única escrita sem CAS, e essa
  última é a mais barata de repetir (gravar o mesmo raw duas vezes dá o mesmo
  raw) e a mais barata de desfazer (gravar de volta o raw anterior, que está
  inteiro no journal). A ordem inversa colocaria a escrita fraca no meio e
  exigiria desfazê-la depois de uma falha do lado forte.
- **`targetCoreRaw` é construído UMA vez, gravado no journal antes de existir
  fisicamente e depois gravado byte a byte.** `saveHybridCoreResult` cunha um
  `savedAt` novo a cada chamada, então nunca gravaria o raw que o receipt
  prometeu — e `evaluateStorageOperationCompatibility` exige, em `activated`,
  igualdade byte a byte entre o core e `targetCoreRaw`. Por isso o commit do core
  é próprio: relê, confere, grava a cópia rolante, relê de novo, grava o raw
  exato e confere o readback.
- **`rollbackToHistoryGeneration` é usada como primitiva de ATIVAÇÃO
  verificada.** O nome diz rollback, mas ela é a única do adapter que verifica a
  geração alvo integralmente, reconfere o conteúdo físico contra uma prova
  canônica DENTRO da transação de escrita, aplica CAS em `activeGeneration` e
  confirma o ponteiro por readback depois do commit. `activateHistoryGeneration`
  não faz nada disso e ainda exigiria o ponteiro de staging, que este fluxo
  deliberadamente não usa. A mesma primitiva, com os argumentos trocados, é a
  compensação — o que torna ida e volta simétricas e testáveis.
- **`activating → activated` usa a primitiva A1 diretamente, e só ela.** O
  avaliador do A2 devolve `insufficient-evidence` para qualquer mundo
  `activating` com efeitos já aplicados, porque o A2 não executa ativação e por
  isso não pode atestar de onde os efeitos vieram (17B-002D-A2-P5);
  `transitionStorageOperation` exige `interrupted` e recusaria. Quem produziu os
  efeitos é o importador, então é ele que reconfere TODAS as pré-condições
  (receipt único, kind, status, `stagedGenerationId`, `targetCoreRaw`, geração
  ativa e core byte a byte, antes e depois) e chama
  `transitionStorageOperationIfUnambiguous` com CAS. **Nada da fachada A2 e nada
  de `evaluateStorageOperationCompatibility` foi alterado.** Já em
  `activated → settled` o mundo volta a ser coerente para o avaliador, e a
  fachada é usada normalmente, com todo o seu protocolo pré/pós-transação.
- **O resolvedor é puro e não executa nada no C1.** `resolveLogicalImportRecovery`
  recebe uma fotografia explícita e devolve uma união fechada de 14 decisões. Ele
  é o análogo, para quem PRODUZ os efeitos, do avaliador do A2: conhece a ordem
  exata das escritas, então distingue "ainda não ativei" de "já ativei e falta o
  core" de "já gravei tudo". A execução dessas decisões após um reload é do C2.
- **Compensação só quando o estado é comprovável.** Falha antes de qualquer
  efeito reverte o receipt e limpa a geração criada por esta operação. Falha
  depois da ativação restaura a geração anterior com CAS e só então reverte. Se a
  restauração não se confirma, o receipt fica aberto de propósito — encerrá-lo
  esconderia uma divergência real.
- **Estado ambíguo preserva o journal e não adivinha.** Se a chave principal
  contiver um terceiro valor, ou se a releitura falhar, o importador não
  sobrescreve o valor alheio, não apaga a geração, não marca `settled` nem
  `reverted`: devolve `recovery-required` com os dois mundos ainda registrados.
- **A limpeza de geração tem guarda tripla.** Só é apagada a geração nomeada pelo
  journal, que não seja a ativa e não seja a anterior — e `clearInactiveGeneration`
  ainda recusa a ativa por conta própria. **A geração anterior nunca é apagada
  por nenhum caminho deste módulo.**
- **Nenhum campo novo no `StorageOperationReceipt`.** `logicalSchemaVersion` não
  foi adicionado: o `payloadDigest` já vincula o conteúdo exato, e só o schema 1
  é aceito. Erro sanitizado também não é persistido — o status terminal já é o
  marcador de conclusão, e guardar texto de erro só criaria superfície de
  vazamento.
- **O teste 60 do slice B passou a listar o importador explicitamente.** Ele
  afirma, por igualdade exata, quem menciona `storage-logical-backup` em `src/`.
  O importador chama `inspectLogicalStorageBackupV2` de propósito — é o que
  impede o TOCTOU entre validar o arquivo e gravá-lo. Ele é consumidor de
  biblioteca, não call site real: continua sem UI, Provider, Context, boot ou
  componente. A igualdade exata segue valendo, e é ela que prova esse limite.

## GOAL-17B-002D-C1 corretivo 055 — auditoria Classe B (2026-07-27)

Auditoria independente 054 classificou o C1 como **APTO / Classe B** e apontou um
risco **P1** na compensação. Este corretivo o fecha e cobre as lacunas de teste
diretamente ligadas a ele. **O C2 não foi iniciado.**

- **A cópia rolante do core deixou de ser compensada.**
  `restoreRollingBackup` reescrevia ou removia a cópia **incondicionalmente**
  depois de uma falha. Entre a leitura do valor anterior e a compensação outra
  aba pode ter atualizado a cópia: devolvê-la ao valor antigo apagaria um backup
  mais novo, e o `removeItem` recriaria uma ausência que já não existe. A função
  foi removida inteira, e com ela a última chamada de `removeItem` do módulo — o
  teste 82 afirma, sobre a fonte, que nenhum dos dois nomes existe mais.
- **A cópia é auxiliar; o canônico é a chave principal mais a geração ativa.**
  Depois que a operação grava `previousCoreRaw` na cópia, esse valor já é um
  backup válido do estado anterior, então nenhuma falha posterior exige voltar ao
  valor mais antigo. Uma importação abortada pode deixar a cópia atualizada para
  `previousCoreRaw` — e isso **não** altera o estado canônico, porque esse raw é
  o core anterior verificado no W0 e guardado inteiro no journal.
- **Falha da cópia relê a chave principal antes de compensar.** Só o mundo
  `previousCoreRaw` autoriza a compensação completa. Se a chave já for
  `targetCoreRaw`, compensar seria afirmar que nada foi aplicado; se for um
  terceiro valor, sobrescrever seria destruir dado alheio. Nos dois casos o
  journal é preservado e o retorno é `recovery-required`.
- **Falha de `getItem` preserva o journal.** Uma leitura que estoura não prova
  nada sobre o estado canônico, então o fluxo não escreve, não remove e não fecha
  o receipt: devolve `storage-unavailable` antes do commit do core e
  `recovery-required` a partir dele. `RawRead` deixou de carregar `cause` — a
  causa nativa não é sequer capturada, o que torna estruturalmente impossível
  vazar a mensagem lançada pelo `StorageLike` do chamador.
- **Quota passou a ser classificada só por sinal estrutural.**
  `message.includes('quota')` transformava qualquer `TypeError`, `AbortError` ou
  erro genérico numa falha de espaço, e a mensagem de um erro vindo do
  `StorageLike` é texto que o chamador controla. Agora contam `error.name`
  (`QuotaExceededError`, `NS_ERROR_DOM_QUOTA_REACHED`) e os códigos legados 22 e
  1014 **apenas dentro de um `DOMException` real**. `storage.ts` continua
  intocado; a duplicação segue registrada como 17B-002D-C1-P7.
- **O W8 ganhou readback do receipt depois da transição.**
  `transitionStorageOperationIfUnambiguous` não reconfere `stagedGenerationId`
  nem `targetCoreRaw` dentro da própria transação, então uma mutação desses
  campos na janela passaria despercebida. O importador relê o receipt depois de
  marcar `activated` e exige que ele ainda nomeie os dois mundos; caso contrário
  não liquida. A primitiva IndexedDB e a fachada A2 **não foram alteradas**, e a
  janela TOCTOU remanescente continua registrada para C2/E — fechá-la exige
  owner-token.
- **O resolvedor recusa `stagedGenerationId === previousGenerationId`.** O
  staging recusa colidir com a geração ativa e o readback do W2 recusa a
  igualdade, então um receipt assim descreve algo que esta ordem de escrita não
  produz. Sem a guarda, o resolvedor avançaria para `prepare-core` e gravaria um
  core alvo apontando para o mundo antigo. Motivo novo:
  `staged-generation-is-previous`.
- **A privacidade passou a ser provada por inspeção recursiva.**
  `JSON.stringify(erro)` devolve `{}`: um teste que só olhasse o serializado não
  provaria nada. A varredura agora percorre propriedades enumeráveis e não
  enumeráveis, `name`, `message`, `stack`, `cause`, causas aninhadas, arrays,
  `Map`, `Set` e o serializado — e um meta-teste prova que o próprio inspetor
  enxerga o que promete. **A política pública não mudou**; o que mudou foi a
  prova, e a única correção que ela exigiu foi parar de propagar erros do
  armazenamento como `cause`.

## GOAL-17B-002D-C2 — recuperação da importação v2 interrompida (2026-07-27)

- **A direção da recuperação é dedução, não preferência.** Depois de um reload o
  arquivo não existe: um receipt `staged` descreve um mundo importado que não foi
  materializado em lugar nenhum, então ele só pode convergir **para trás**. Um
  receipt `activating` ou `activated` nomeia os dois mundos e ambos existem no
  disco, então ele pode convergir **para a frente**. A fronteira é
  `targetCoreRaw`, e é o journal que a define — nunca a função.
- **A assinatura recusa o que poderia falsificar a evidência.** A recuperação não
  recebe raw, payload, preview, objeto de inspeção, `generationId` escolhido,
  `previousCoreRaw` nem `targetCoreRaw`. Aceitar qualquer um deles transferiria
  para o chamador a confiança sobre o mundo alvo, que é exatamente o que o
  journal existe para guardar.
- **Um segundo resolvedor puro, em vez de dar I/O ao primeiro.**
  `resolveLogicalImportRecovery` responde "esta importação, que ainda tem o
  arquivo em mãos, continua de onde?"; `resolveLogicalImportRestartRecovery`
  responde "esta importação, cujo arquivo evaporou, converge para qual mundo?".
  São perguntas diferentes com tabelas diferentes. Transformar o primeiro numa
  função com I/O teria destruído a única parte do C1 que é trivialmente testável.
  Ações como `stage-generation` e `prepare-core` **não existem** no tipo novo:
  elas exigiriam o arquivo.
- **`verify-target` é uma ação, não um efeito colateral.** A prova criptográfica
  de uma geração é cara e vale apenas para o estado físico sobre o qual foi
  calculada — por isso ela fica em cache amarrada ao par
  (`fingerprint`, `generationId`) e é descartada na menor escrita ao IndexedDB.
  Quando o resolvedor precisa da prova e ela não vale, ele **pede** em vez de
  supor.
- **A geração preparada só é apagada com o mundo que fica provado.** A guarda
  tripla — nomeada pelo journal de um receipt já terminal, não é a ativa, não é a
  anterior — é relida do armazenamento, e sobre ela roda ainda a verificação
  integral da geração anterior. Sem essa prova a operação é encerrada mesmo
  assim e G vira **órfã segura**: ela não bloqueia hidratação nem diagnóstico, e
  deixar lixo inativo é incomparavelmente melhor do que apagar o mundo errado.
- **O laço segue a operação pelo id depois de escolhê-la.** Sem isso, a própria
  transição para um status terminal tirava a operação da lista de "em aberto" e
  o passo seguinte enxergava "não há nada para fazer", perdendo o que aquela
  execução acabara de produzir. A escolha inicial continua saindo do
  armazenamento; o `operationId` do chamador é só uma amarração que precisa bater.
- **`reverted`/`settled` só são relatados quando ESTA execução avançou.**
  `revertStorageOperationSafely` e `transitionStorageOperation` são idempotentes
  por releitura, então uma segunda instância concorrente encontraria o receipt já
  terminal e diria ter feito o trabalho. O motor distingue "a chamada venceu" de
  "a releitura confirmou", e devolve `already-reverted`/`already-settled` no
  segundo caso. É o que torna a prova de concorrência honesta.
- **Sem `operationId` e sem operação pendente, o retorno é `no-operation`.**
  Varrer receipts terminais atrás de gerações antigas seria política de
  retenção, que é do 002D-F. A limpeza de uma órfã ligada a um receipt já
  `reverted` só acontece quando o chamador **nomeia** a operação.
- **A API nova não tem canal de `cause`.** O C1 ainda propaga `cause` para falhas
  de infraestrutura confiável; a recuperação não propaga nada. O retorno público
  tem exatamente `status`/`reason` fechados, mensagem constante deste módulo,
  `operationId`, `generationId`, contagem de passos, ação final,
  `recoveryRequired` e `cleanupPending`. O receipt completo nunca sai, e os
  retornos históricos do C1 não foram alterados.
- **O limite de passos é fechado e o journal é preservado ao atingi-lo.**
  `MAX_RECOVERY_STEPS = 12` contra sete passos do pior caminho real. Recursão
  ilimitada, laço sem contador, `setTimeout`, espera por tempo e retry por atraso
  estão todos fora: o motor só avança quando a leitura seguinte prova que o mundo
  mudou.
- **Uma geração sem manifest continua enumerada.** Ela não some do mundo — o que
  some é a possibilidade de prová-la. Por isso apagar o manifest de G devolve
  `verification-failed`, e não `impossible-state`: a ativação simplesmente nunca
  acontece.
- **O teste 76 do C1 virou a lista exata do C2.** Ele afirmava que
  `recoverLogicalStorageImportV2` não existia; agora afirma que o módulo exporta
  exatamente quatro funções. O guard continua igualmente estrito — nenhuma
  superfície nova entrou de carona.

## GOAL-17B-002D-D1 — recuperação administrativa antes da hidratação

- **O slice C foi integrado à master em `4c6284da`** (merge commit do PR #6, dois
  pais: `5b41f91a` e `50838541`). O repositório principal foi sincronizado por
  fast-forward antes de abrir esta worktree. O D1 parte exatamente desse ponto.
- **A auditoria D0 classificou a integração como Classe B.** A ordem não é
  ambígua e nenhum contrato administrativo do C1/C2 precisou mudar, mas a
  integração exige um orquestrador novo e uma alteração controlada no Provider —
  logo, não é Classe A.
- **A recuperação vive num módulo próprio, não dentro do híbrido.**
  `storage-hybrid.ts` não conhece runtime administrativo nem importação lógica;
  enfiar a recuperação dentro de `hydrate()` acoplaria o motor de hidratação aos
  contratos administrativos do C1/C2. `storage-boot-recovery.ts` recebe
  dependências injetadas, roda `recoverLogicalStorageImportV2`, classifica e
  devolve uma união fechada. Ele não importa React, não importa o Provider, não
  cria geração e não inicia importação.
- **O bloqueio inicial era um guard de escopo, não uma falha do recovery.** C1/C2
  exigiam zero consumidor de `recoverLogicalStorageImportV2`. A liberação 061
  autorizou alterar somente os guards 60, 195 e 197 de
  `storage-logical-import.test.ts`: eles continuam varrendo todo `src/` e
  comparando listas por igualdade exata, mas agora nomeiam
  `storage-boot-recovery.ts` como o único call site de produção permitido.
  `commitLogicalStorageImportV2` permanece protegido por um guard separado e
  continua sem call site.
- **A barreira fica no início do efeito de boot do Provider, antes até da
  migração legada.** A migração v0→v1 **escreve** em `localStorage`; colocar a
  recuperação depois dela permitiria uma escrita antes de sabermos se existe uma
  importação interrompida. Com a barreira primeiro, nenhuma escrita precede a
  decisão. Na prática as duas ordens dão o mesmo resultado — a migração legada só
  roda quando a chave principal está ausente, e sem core v2 não existe journal v2
  —, mas a ordem escolhida é a que se sustenta sozinha.
- **`administration-unavailable` só libera depois de prova física read-only.**
  `steps === 0`, `operationId === null`, `generationId === null` e
  `cleanupPending === false` são pré-condições, não prova suficiente. O
  orquestrador lê a chave principal sem escrever e reutiliza
  `parsePhysicalEnvelope`: chave ausente libera a instalação nova; envelope v1
  válido libera o fluxo monolítico; chave principal ausente também preserva a
  migração dos formatos legados oficialmente suportados. Core v2 válido bloqueia
  como `blocked-storage-unavailable`; leitura que lança faz o mesmo. Corrupt com
  `physicalVersion === 2` também é v2 comprovado e bloqueia antes do runtime.
  Raw corrupt sem versão comprovável, versão física não-v2 inválida e formato
  unsupported recebem `ready-for-blocked-storage-classification`: o runtime
  híbrido pode somente classificá-los como `blocked`, sem migração nem publicação
  de dados. Assim, o P0 da instalação nova/v1 foi resolvido e a ambiguidade P2
  foi reduzida sem alterar o contrato C2: se o core é v2, ausência administrativa
  nunca é tratada como instalação nova.
- **`storage-unavailable` continua bloqueando.** Ele vem de `storage-blocked` —
  o `localStorage` em si não é legível —, que é outra coisa: ali não dá para
  afirmar nada sobre o mundo canônico.
- **A classificação é fechada em três estados.** Há hidratação normal,
  classificação bloqueada read-only e bloqueio anterior ao runtime. No segundo
  estado o Provider exige `hydration.mode === 'blocked'`; qualquer sucesso
  inesperado falha fechado com mensagem constante, sem publicar o `state`.
  Status/motivo administrativo desconhecido e exceção inesperada continuam em
  `blocked-recovery-required`. Não existe caminho "segue por garantia".
- **Nenhuma mensagem dinâmica atravessa o retorno.** O orquestrador nunca repassa
  o `error` do módulo de importação: ele devolve uma das cinco constantes
  próprias. `previousCoreRaw`, `targetCoreRaw`, receipt, nome, e-mail, treino,
  `sessionId`, stack e `cause` não têm como sair — o resultado liberado tem
  exatamente três campos (`status`, `hydrationAllowed`, `cleanupPending`); o
  resultado de classificação acrescenta apenas o booleano fechado que autoriza
  essa operação, e o bloqueado acrescenta mensagem constante e, somente quando
  comprovada, a versão física.
- **O bloqueio anterior ao runtime mantém `hydrated` falso; a classificação
  bloqueada marca `hydrated` apenas para liberar a recuperação existente.** Nesse
  segundo caminho `storageBlockedRef` permanece verdadeiro, o runtime devolve
  somente modo/versão/issue/raw de recuperação e nenhum estado de usuário é
  publicado. Autosave e flush podem ser armados pelo ciclo React, mas toda
  tentativa é recusada antes de escrever. Os dois testes baseline que exigem
  recuperação legada explícita para raw corrompido continuam inalterados.
- **A execução única copia o padrão que já existe no próprio repositório.**
  `hydrate()` usa um `WeakMap` de travas por `storage` e chave, com a entrada
  removida quando a promessa assenta. O boot recovery usa exatamente a mesma
  forma: as duas montagens do Strict Mode observam a MESMA execução, e um remount
  posterior executa de novo. É trava por ciclo, não flag global eterna — sem
  `setTimeout`, sem sleep e sem depender de ordem de microtasks.
- **A promessa memoizada nunca rejeita.** A exceção vira bloqueio dentro do
  runner, então as duas montagens do Strict Mode recebem um valor e nenhuma
  observa uma rejeição sem tratamento.
- **A convergência física não foi reprovada aqui.** A matriz de crash points
  (staged com G, `activating` nos mundos A/B/C, `activated`) já é provada em
  `storage-logical-import.test.ts`. O teste do D1 prova o que é dele: ordem,
  classificação, falha fechada e execução única — mais mundos físicos reais para
  no-operation, v1, instalação nova e uma importação interrompida de verdade.
- **Completion receipts mantêm sua responsabilidade e sua posição.** O D1 não
  cria nem liquida esses receipts. Depois da recuperação administrativa e de
  `runtime.hydrate()`, o Provider materializa `recoveredCompletions`, executa
  `settleCompletion` e só então publica o armazenamento como pronto.
- **D1 foi concluído localmente, sem superfície visual.** Nenhum botão, modal,
  toast, AdminPanel ou fluxo de importação ao usuário foi criado. D2/E/F não
  foram iniciados; o slice D inteiro não é declarado concluído.
- **O bloqueio do comando 061 revelou um contrato correto, não um teste
  obsoleto.** Raw corrompido sem versão v2 comprovável permanece bloqueado, mas
  mantém restore v1 quando disponível, recomeço explícito e download do raw. O
  comando 062 preservou esse contrato sem alterar
  `GymFlowContext.storage.test.tsx`, mantendo v2 comprovado totalmente fechado.
