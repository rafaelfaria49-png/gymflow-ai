# GymFlow — Domínio de Sessão de Treino (GOAL-23A)

Fundação que separa três estágios do ciclo de vida de um treino, hoje colapsados
num único `WorkoutSession`. É **aditiva e compatível**: não altera o storage v1,
não recalcula volume/PR/XP e preserva sessões livres, legadas e o snapshot atual.

- Tipos: [`src/types/workout-session.ts`](../../src/types/workout-session.ts)
- Domínio puro: [`src/lib/workout-session-domain.ts`](../../src/lib/workout-session-domain.ts)
- Normalização legada: [`src/lib/workout-session-migration.ts`](../../src/lib/workout-session-migration.ts)
- Integração: [`src/providers/GymFlowContext.tsx`](../../src/providers/GymFlowContext.tsx)

## Os três estágios

| Estágio | Tipo | O que é | Onde vive |
| --- | --- | --- | --- |
| Plano | `SessionPlan` | O que foi planejado (origem imutável dos exercícios). | Memória, no início do treino. |
| Sessão ativa | `ActiveSession` | Treino em andamento: `{ plan, session }`, `status: 'active'`, `startedAt`. | `activeWorkout` (só a `session` é persistida). |
| Registro final | `SessionLog` | Snapshot finalizado que vai para o histórico. | `workoutHistory`. |

`ActiveSession` e `SessionLog` são wrappers finos e nomeados de propósito: marcam
qual estágio do ciclo de vida um `WorkoutSession` representa. O contexto continua
persistindo apenas `WorkoutSession` (o plano é reconstruível a partir dos campos
`planned*`/`entry*` de cada `ActiveExercise`), então **o formato físico do storage
v1 não muda**.

## Status da sessão (`WorkoutSessionStatus`)

`active | completed | partial | abandoned`. As três situações finais são derivadas
em nível de **série**, por `deriveSessionStatus`:

- **completed** — todas as séries existentes foram concluídas;
- **partial** — pelo menos uma série concluída **e** pelo menos uma incompleta;
- **abandoned** — nenhuma série concluída (inclui a sessão sem séries).

## Origem × Execução (separados de propósito)

Cada entrada (`ActiveExercise`, identidade = `ActiveExercise.id`) carrega dois
eixos independentes:

- **Origem** (`entryOrigin`: `planned | added | swapped`) — de ONDE a entrada veio:
  - `planned` — veio do plano inicial (dia de programa, programa flat ou o
    exercício padrão de um treino livre);
  - `added` — adicionada manualmente durante o treino (sem `plannedSlotIndex`/
    `plannedExerciseId`);
  - `swapped` — substituiu outro exercício; `plannedExerciseId` **mantém o
    exercício originalmente planejado**.
- **Execução** (`entryStatus`: `planned | performed | partial | skipped`) — o QUE
  foi feito, derivado por `deriveExerciseEntryStatus` a partir da conclusão das
  séries: sem séries → `planned`; nenhuma concluída → `skipped`; todas concluídas
  → `performed`; caso contrário → `partial`.

`ExerciseSlot` **não** ganhou id (decisão GOAL-23A): a ligação entrada↔plano é
posicional via `plannedSlotIndex` (0-based, mesma ordem em que o contexto
materializa os `ActiveExercise`).

## Funções puras (`workout-session-domain.ts`)

- `buildSessionPlan(source)` — deriva o plano de um dia de programa, programa flat
  legado ou sessão livre, sempre na ordem da origem, com `plannedSlotIndex`.
- `startActiveSession(params)` — anota os exercícios iniciais como `planned`,
  carimba `status: 'active'` + `startedAt` e herda a origem do plano. **Não**
  recalcula pré-preenchimento (isso segue no contexto).
- `deriveSessionStatus` / `deriveExerciseEntryStatus` — ver acima.
- `markEntrySwapped(exercise, { original, reasonCode, reasonNote, swappedAt })` —
  marca `entryOrigin: 'swapped'` e registra o snapshot estruturado da troca
  (GOAL-24). Ver a seção **GOAL-24** abaixo.
- `normalizeSwapReasonNote(note)` — apara/limita a nota da substituição a
  `MAX_SWAP_REASON_NOTE_LENGTH` (120) caracteres; vazio → `undefined` (GOAL-24).
- `finalizeSession(params)` — monta o registro final. Recebe `duration`,
  `endedAt`, `calories`, `totalVolume`, `prsDetected`, `xpEarned` **já calculados**
  e apenas os grava, junto do status derivado e do `entryStatus` por exercício.
  **Não muta a sessão ativa nem recalcula progressão/PR/XP.**
- `buildAbandonedSessionLog(params)` — produz um log `abandoned` preservando o
  snapshot completo. **Para uso futuro** (ver Cancelamento).

## Volume, PR e XP — paridade preservada

O fluxo de finalização em `finishWorkout` continua **idêntico**: volume e PRs
seguem contando **apenas séries concluídas**, e o XP mantém exatamente a regra
atual (`100 + séries_concluídas*5 + (volume>5000 ? 50 : 0)`). `finalizeSession`
**recebe** esses valores prontos — não os recalcula. A ordem dos efeitos
(streak, achievements, challenges, post) foi preservada.

`endedAt` é derivado de forma determinística como `startedAt + duração_decorrida`
(evita uma leitura de relógio que a regra de pureza do React sinaliza e mantém o
fim coerente com `startedAt`/`duration`).

## Snapshot e séries incompletas

Exercícios e séries incompletos **permanecem** no snapshot do histórico. A
finalização deriva `entryStatus` por exercício mas não remove nada: um exercício
pulado vira `skipped` e continua no registro, com suas séries não concluídas.

## Compatibilidade v1 e normalização legada

`normalizeSessionState` (`workout-session-migration.ts`) roda na hidratação,
**após** `mergePersistedState` e **antes** de alimentar os setters. É pura e
idempotente — `normalize(normalize(state)) === normalize(state)`, retornando a
mesma referência quando nada muda:

- `activeWorkout` sem `status` → `active`;
- `activeWorkout` sem `startedAt` → usa `activeWorkoutStartedAt` (se houver);
- sessão do histórico sem `status` → `completed`;
- preserva os campos existentes; nunca apaga nem inventa dados.

`activeWorkoutStartedAt` é mantido intacto para compatibilidade. A chave
`gymflow:state:v1` e o formato físico do storage não mudam; fixtures antigas
continuam válidas.

## Cancelamento

`cancelWorkout` **continua descartando** a sessão sem gravar histórico. O domínio
oferece `buildAbandonedSessionLog` para um futuro em que sessões abandonadas
sejam registradas, mas ele **não** está ligado ao cancelamento neste GOAL.

## Rollback

Mudança aditiva e reversível. Rollback = reverter os dois commits do GOAL-23A
(`feat(session): criar dominio e normalizacao de sessao` e
`feat(session): integrar dominio de sessao ao fluxo ativo`). Como os campos novos
são opcionais e o storage não mudou, estados gravados durante o GOAL-23A (com
`status`/`startedAt`/`endedAt`) continuam lidos sem erro por versões anteriores
(campos extras simplesmente ignorados).

## Limites do GOAL-23A (fora de escopo)

- **Não** adiciona id canônico ao `ExerciseSlot`.
- **Não** implementa visualização dos status/origem na UI.
- **Não** grava sessões abandonadas no histórico.
- **Não** implementa motivo de substituição.
- **Não** trata exercícios/séries pulados na UI.
- **Não** inicia GOAL-23B nem GOAL-24.

## GOAL-23B — Apresentação na UI (experiência visual)

O GOAL-23B consome o domínio do GOAL-23A para tornar visíveis, sem inventar dados,
o status da sessão, a origem e o estado de execução de cada exercício, as séries
concluídas/incompletas, os exercícios pulados, as notas e o detalhe completo da
sessão. **Não** altera a finalização, o cancelamento (continua descartando), o
Context, o storage v1 nem o cálculo de volume/PR/XP.

- Apresentação: [`src/lib/workout-session-view.ts`](../../src/lib/workout-session-view.ts)
- Badges: [`src/components/ui/SessionBadges.tsx`](../../src/components/ui/SessionBadges.tsx)
- Detalhe: [`src/components/SessionDetailModal.tsx`](../../src/components/SessionDetailModal.tsx)

### O que passou a ser visível

- **Histórico (Evolução):** cada sessão mostra um badge de status
  (Concluída/Parcial/Abandonada); o card é clicável e abre o detalhe da sessão num
  modal. A chave do card trocou de `key={idx}` para `key={sess.id}` (estável).
  Cálculos, métricas, gráficos e ordenação atuais foram preservados.
- **Detalhe da sessão (modal):** nome, data, duração e status; por exercício, origem
  e execução (badges), séries concluídas/incompletas, exercícios pulados, reps/peso/
  RPE por série e notas; volume, calorias, XP e PRs quando disponíveis.
- **Treino ativo:** badge `Adicionado`/`Substituído` quando a origem não é
  `planned`; estado de execução derivado ao vivo (`Realizado`/`Parcial`) por
  exercício; o botão `+ Adicionar Série` (duplica a última) foi mantido.
- **Resumo final (finalização):** prévia do status (`completed`/`partial`/
  `abandoned`) derivada das séries, com contagem de exercícios e séries concluídos
  ou pulados/incompletos. A finalização em si não mudou.

### Fallbacks legados (defensivos, sem inventar dados)

A camada de apresentação resolve tudo de forma segura quando o dado legado não tem
os campos do GOAL-23A:

- **Sessão sem `status`** → `resolveSessionStatus` deriva por `deriveSessionStatus`
  (conta as séries). A normalização do GOAL-23A já carimba `status` na hidratação
  para a maioria dos casos; a derivação é rede de segurança para dado não-normalizado.
- **Exercício sem `entryStatus`** → `resolveEntryStatus` deriva por
  `deriveExerciseEntryStatus`. Para sessões finalizadas o `entryStatus` gravado pela
  finalização é exatamente o derivado, logo ler o campo ou derivar dá o mesmo
  resultado.
- **Exercício sem `entryOrigin`** → `planned` (todo exercício pré-GOAL-23A veio do
  plano inicial).

### Decisões de apresentação

- **Sessão ativa: `entryStatus` é derivado ao vivo, não lido do campo.** O contexto
  carimba `entryStatus: 'planned'` no início e só regrava na finalização; ler o
  campo armazenado mostraria "Planejado" mesmo com séries concluídas. Os badges de
  execução do treino ativo usam `deriveExerciseEntryStatus` direto; o badge
  `ExerciseExecutionBadge` aceita um `status` explícito para isso.
- **"Pulado" só aparece após finalização.** No treino ativo, um exercício com séries
  mas nenhuma concluída ainda não foi "pulado" — apenas não foi iniciado. Por isso o
  badge de execução ao vivo só renderiza para `performed`/`partial`. O `skipped`
  aparece no detalhe do histórico e na prévia do resumo final.
- **Contagens sempre derivam das séries** (`countPerformedExercises`/
  `countSkippedExercises` usam `deriveExerciseEntryStatus`), funcionando nos dois
  contextos (ativa e histórico) sem depender do campo armazenado.
- **Prévia do resumo final usa `buildSessionPreview`**, que ignora o `status:
  'active'` armazenado e deriva o status final das séries — refletindo o que a
  sessão vai se tornar ao concluir.
- **Detalhe é um modal** (`SessionDetailModal`), com ESC/overlay para fechar, body
  rolável e tokens dark + verde-lima. Volume/PRs só aparecem quando disponíveis
  (campos opcionais); calorias/XP sempre (campos obrigatórios).
- **Origem destacada só quando não-planejada.** No treino ativo o badge de origem
  só aparece para `added`/`swapped` (não polui com "Planejado" em todo exercício).

### Fora de escopo (GOAL-24)

- **Motivo de substituição** não é persistido nem exibido (`swapExerciseInActiveWorkout`
  recebe `reason?` só para toast).
- **Diff avançado plano×execução** (qual exercício planejado virou qual, comparação
  posicional detalhada) fica para o GOAL-24.
- **Dor/desconforto** fica fora deste GOAL.
- **Sessões abandonadas no histórico** continuam fora: `cancelWorkout` descarta;
  `buildAbandonedSessionLog` segue não ligado.

## GOAL-24 — Registro estruturado da substituição

O GOAL-24 preserva, em cada substituição, **o exercício planejado (original), o
executado (atual) e o motivo** da troca. É **aditivo e compatível**: os campos novos
de `ActiveExercise` são opcionais, o storage segue v1 e **nada** muda em volume/PR/XP/
progressão. `discomfort` é apenas um motivo registrado — **sem** adaptação automática.

- Motivo: [`WorkoutSwapReasonCode`](../../src/types/workout-session.ts)
- Domínio: [`markEntrySwapped` / `normalizeSwapReasonNote`](../../src/lib/workout-session-domain.ts)
- Apresentação: [`buildSwapView` / `SWAP_REASON_LABELS`](../../src/lib/workout-session-view.ts)
- Treino ativo: [`ActiveWorkoutPage`](../../src/modules/ActiveWorkoutPage.tsx)
- Histórico: [`SessionDetailModal`](../../src/components/SessionDetailModal.tsx)

### Motivo (`WorkoutSwapReasonCode`)

`equipment-occupied | equipment-unavailable | discomfort | preference | technique-fit
| other`. O **motivo é obrigatório**; a **nota é obrigatória apenas para `other`**,
limitada a **120 caracteres** e normalizada (`normalizeSwapReasonNote`: apara pontas,
vazio → ausente, corta em 120).

### Campos novos de `ActiveExercise` (opcionais)

- `plannedExerciseName` / `plannedMuscleGroup` — nome e grupo do exercício **original**
  (snapshot), preservados na **primeira** troca. O id do original continua no
  `plannedExerciseId` já existente.
- `swapReasonCode` / `swapReasonNote` — motivo e nota da **última** troca.
- `swappedAt` — epoch ms da última troca (recebido de fora; a função é pura).

### `markEntrySwapped(exercise, { original, reasonCode, reasonNote, swappedAt })`

`exercise` é a entrada **já** com o exercício executado atual; `original` é a entrada
como estava **antes** desta troca. Comportamento:

- **Primeira troca** (`original.entryOrigin !== 'swapped'`): captura id/nome/grupo do
  original no snapshot e carimba `entryOrigin: 'swapped'`. Vale para uma entrada
  `planned` **ou** `added` (o exercício adicionado que estava ali vira o original).
- **Trocas seguintes** (`original.entryOrigin === 'swapped'`): **mantém** o snapshot do
  primeiro original e atualiza **apenas** exercício executado, motivo, nota e
  `swappedAt`. Só se guardam **original + atual** — o histórico intermediário não é
  acumulado.
- A **nota reflete sempre a troca atual**: gravada quando há texto, **removida** quando
  a troca atual não tem nota (não herda a nota de uma troca anterior).
- **Não** altera séries/reps/carga/RPE/descanso nem recalcula volume/PR/XP/progressão.

### Integração no contexto

`swapExerciseInActiveWorkout(exerciseIndex, newExerciseId, { reasonCode, reasonNote })`
captura o exercício antes da troca, executa `swapWorkoutExercise` (troca a identidade
preservando séries) e aplica `markEntrySwapped` com o original, o motivo e um
`swappedAt = Date.now()`. **Toast e XP** (`addXp(20, …)`) permanecem idênticos ao
fluxo anterior. A finalização preserva os metadados no snapshot do histórico (só
deriva `entryStatus`).

### Apresentação e fallback legado

`buildSwapView(exercise)` monta `{ planned, hasOriginal, performed, reasonCode?,
reasonLabel?, note? }`. Registros `swapped` **legados** (pré-GOAL-24) sem snapshot usam
**"Original não registrado"** no planejado; sem motivo/nota, os campos ficam ausentes —
nunca inventa dado. No treino ativo o card mostra **"Substitui &lt;original&gt; •
&lt;motivo&gt;"**; no histórico o `SessionDetailModal` mostra Planejado × Executado +
Motivo + Nota por exercício substituído.

### Compatibilidade

Registros antigos continuam abrindo: `swapped` sem nome original, `swapped` sem motivo,
sessões anteriores ao GOAL-24 e exercícios `added` depois substituídos. Campos novos
opcionais, storage v1 inalterado.
