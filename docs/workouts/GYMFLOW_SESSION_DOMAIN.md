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
- `markEntrySwapped(exercise)` — marca `entryOrigin: 'swapped'` preservando o
  `plannedExerciseId` original.
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
