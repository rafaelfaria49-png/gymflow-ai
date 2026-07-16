# GOAL-16 — Auditoria do domínio de treino

**Data da auditoria:** 16/07/2026

**Baseline funcional auditado:** `19cce13c3228947735120a3be672ddb925b0c220` (`master`)

**Natureza:** auditoria e documentação; nenhum código de produto foi alterado
**Veredito do Gate G1:** **APROVADO COM AJUSTES**

## 1. Resumo executivo

O GymFlow AI tem um fluxo local-first funcional e coerente para montar um dia de treino, planejar a semana, iniciar uma sessão, registrar séries, retomar após refresh e gravar histórico. A biblioteca contém **126 exercícios**, os 12 programas usam referências de exercício válidas, o motor atual de progressão é puro e coberto por testes, e os builds web e mobile passaram.

O planejamento premium, porém, parte de algumas premissas incorretas ou incompletas. A persistência já possui um envelope versionado (`{ v, savedAt, data }`) e uma migração legada; portanto, não se deve criar um segundo conceito de versão como se nada existisse. O risco P0 real é a ausência de cadeia de migrações, backup, export/import e recuperação: uma versão desconhecida, JSON corrompido ou falha de escrita vira `null` silenciosamente e pode ser sobrescrita pelos defaults após a hidratação (`src/lib/storage.ts:12-36`, `src/providers/GymFlowContext.tsx:534-653`).

Os principais achados são:

- **P0 — segurança dos dados:** versão incompatível/corrupção/falha de quota são silenciosas; não há backup, export/import, confirmação de integridade nem recuperação. A migração das chaves legadas as remove antes de o novo envelope ser confirmado em disco (`src/providers/GymFlowContext.tsx:537-572`).
- **P1 — planejado versus executado:** programas referenciam exercícios por ID, mas treino ativo e histórico copiam `name`, `muscleGroup`, séries e metadados. A troca de exercício substitui apenas ID/nome/grupo, conserva séries e prescrição do exercício antigo e não registra `plannedExerciseId`, motivo ou status (`src/providers/GymFlowContext.tsx:1084-1105`).
- **P1 — duplicação:** todos os 12 programas seed mantêm simultaneamente a lista achatada `exercises` e `weeks/days/slots`; o plano semanal existe em `weeklyPlan` e novamente em `user.weeklyPlan`.
- **P1 — Context monolítico:** `GymFlowContext.tsx` tem 1.909 linhas, reúne treino, storage, perfil, comunidade, nutrição, mídia, gamificação e chat, entrega um `value` não memoizado e possui 21 consumidores. Durante treino há render do Provider a cada segundo; durante descanso, a cada 250 ms (`src/providers/GymFlowContext.tsx:434-478`, `1795-1896`).
- **P1 — histórico sem semântica de sessão:** totais, PRs e progressão consideram apenas séries concluídas, o que é correto; entretanto, uma finalização incompleta grava também exercícios/séries não executados sem status `skipped/partial`, e a sessão aparece como concluída (`src/providers/GymFlowContext.tsx:1145-1191`). F4 é, portanto, parcialmente — não totalmente — confirmado.
- **P1 — customização assimétrica:** programas customizados são reais e persistidos; exercícios adicionados/removidos pelo Admin são apenas estado de memória e desaparecem no refresh (`src/providers/GymFlowContext.tsx:1588-1597`).
- **P2 — mídia/distribuição:** `public/` mede 22,61 MiB, o export mobile 24,94 MiB e o APK existente 27,44 MiB. Hoje isso é aceitável; vídeos embutidos fariam o APK crescer rapidamente.
- **Qualidade atual:** 5 arquivos/56 testes passaram; TypeScript, build web e build mobile também passaram. Não há testes do Context, componentes, sessão integrada, service worker ou build Android em CI.

Conclusão: o produto pode avançar, mas o próximo trabalho deve ser **GOAL-17A — segurança e compatibilidade da persistência v1**, mantendo `localStorage` por enquanto. IndexedDB deve ser uma decisão posterior e medida, não um requisito artificial do primeiro passo.

## 2. Base e ambiente auditados

### 2.1 Pré-flight

| Item | Evidência |
|---|---|
| Checkout principal | `C:\Projetos\gymflow-ai` |
| Branch | `master` |
| HEAD | `19cce13c3228947735120a3be672ddb925b0c220` |
| Baseline GOAL-15 ancestral | Sim; `git merge-base --is-ancestor ... HEAD` retornou `0` |
| Remoto | Nenhum remoto configurado; não existe `origin/main` nem `origin/master` |
| Worktrees | Somente `C:/Projetos/gymflow-ai 19cce13 [master]` |
| WIP preexistente | `?? .claude/settings.local.json` |
| Base escolhida | O checkout principal, por estar exatamente no baseline e o WIP não tocar `docs/audit/**` |
| Worktree isolada | Não necessária |
| Trabalhos paralelos | Preservados; nenhum reset, stash, clean, restore ou checkout destrutivo foi usado |

Histórico imediatamente anterior: GOAL-15 `19cce13`, GOAL-14 `8227029`, GOAL-13 `b1d381c`, GOAL-12 `aac4f80`, GOAL-11 `23aed0c`, GOAL-10.6 `2b465a2`, GOAL-10.5 `9af4f54`, GOAL-10 `399d688`, GOAL-09 `c4a4295`, GOAL-08 `f65adc0` e GOAL-07 `3c56a36`.

### 2.2 Ambiente

- Next.js `16.2.6`, React `19.2.4`, TypeScript 5 e Vitest `4.1.9` (`package.json`).
- A auditoria respeitou a documentação local desta versão do Next em `node_modules/next/dist/docs/01-app/02-guides/static-exports.md` e `.../manifest.md`.
- Inspeção dinâmica local feita em `http://localhost:3005`, sem modificar arquivos. Foi observado login demo, planejamento real, sessão de 7 exercícios/22 séries, conclusão de uma série e timer de 120 s.
- React DevTools Profiler não estava disponível no navegador controlado. Não há números de commits/render inventados; a análise de render é estática, baseada no grafo de estado e nos intervalos.

## 3. Planejamento utilizado como referência

Os 13 documentos não estão versionados no repositório. Foram localizados completos em:

`C:\Users\rafae\Downloads\files (2).zip`

| # | Documento | Localizado |
|---:|---|---|
| 1 | `GYMFLOW_PREMIUM_MASTER_PLAN.md` | Sim |
| 2 | `TRAINING_DOMAIN_ARCHITECTURE.md` | Sim |
| 3 | `SMART_WORKOUT_BUILDER_PLAN.md` | Sim |
| 4 | `ACTIVE_WORKOUT_PRO_PLAN.md` | Sim |
| 5 | `ADVANCED_SET_TECHNIQUES_PLAN.md` | Sim |
| 6 | `EQUIPMENT_AND_SUBSTITUTIONS_PLAN.md` | Sim |
| 7 | `PROGRESSION_AND_PERIODIZATION_PLAN.md` | Sim |
| 8 | `EXERCISE_LIBRARY_AND_MEDIA_PLAN.md` | Sim |
| 9 | `PERSONAL_TRAINER_PLATFORM_PLAN.md` | Sim |
| 10 | `GYMFLOW_SAAS_ARCHITECTURE.md` | Sim |
| 11 | `PREMIUM_FEATURE_IDEAS.md` | Sim |
| 12 | `IMPLEMENTATION_ROADMAP.md` | Sim |
| 13 | `GOALS_COMMANDS_INDEX.md` | Sim |

Foram usados somente como fonte de leitura. Não foram copiados para o repositório. Recomenda-se um GOAL documental separado para versioná-los depois de o Founder aprovar as correções desta auditoria; o `GOALS_COMMANDS_INDEX.md` externo ainda contém paths e premissas que não correspondem ao código real.

## 4. Inventário do domínio real

### 4.1 Tipos e shapes

| Estrutura real | Shape completo | Relação e recomendação |
|---|---|---|
| `WeeklyWorkoutDay` | `dayName`, `workoutName`, `muscleGroups[]`, `duration`, `exerciseCount`, `isRest`, `programId?`, `programDayId?`, `trained?` (`src/types/index.ts:1-11`) | Projeção de calendário que referencia programa/dia. **Adaptar**, acrescentando identidade do ciclo/data no futuro; não transformá-la na entidade canônica do programa. |
| `ProgressionType` | `'dupla' | 'linear' | 'nenhuma'` (`src/types/index.ts:15`) | Manter compatibilidade; `linear` existe no tipo, mas o motor não possui ramo próprio. Documentar/migrar antes de ampliar. |
| `ExerciseSlot` | `exerciseId`, `series`, `repRange`, `targetRPE`, `restSec`, `progression`, `incrementKg` (`src/types/index.ts:17-25`) | Prescrição planejada por referência. **Manter e adaptar** com ID do slot, técnica, grupo e tipo de set; hoje não tem identidade própria. |
| `ProgramDay` | `id`, `name`, `slots[]`, `volumeProfile?` (`src/types/index.ts:38-43`) | Dia real do programa. **Adaptar** para `dayNumber`, `autoName/customName`, foco e estimativa, preservando `name` na migração. |
| `WorkoutBuilderDraft` | `programId?`, `dayId?`, `name`, `level`, `volumeProfile`, `targetMinutes`, `slots[]` (`src/types/index.ts:47-55`) | Rascunho volátil e de um único dia. **Adaptar**, não persistir como domínio. |
| `ProgramWeek` | `number`, `days[]` (`src/types/index.ts:57-60`) | Existe, mas consumidores usam quase sempre `weeks[0]`. **Manter** e testar semanas >1 antes de periodização. |
| `UserProfile` | `name`, `email`, `level`, `goal`, `gender`, `age`, `weight`, `height`, `frequency`, `duration`, `location`, `equipments[]`, `restrictions[]`, `muscleFocus[]`, `preference`, `xp`, `streak`, `lastWorkoutDate?`, `waterIntake`, `waterGoal`, `premiumStatus`, `points`, `weeklyPlan?`, `connectedSocials?`, `restTimerDefaultSeconds?`, `restTimerSoundEnabled?` (`src/types/index.ts:62-89`) | Mistura identidade, treino, gamificação, nutrição, billing mock e configurações. O nível inclui `athlete`; o plano v2 prevê só 3 níveis. **Dividir/adaptar incrementalmente**, sem renomeação destrutiva. |
| `Exercise` | `id`, `name`, `thumbnail`, `videoFakeUrl?`, `muscleGroup`, `secondaryMuscles?`, `equipment`, `level`, `executionSteps[]`, `postureTips[]`, `breathing`, `commonErrors[]`, `errorCorrections[]`, `variations[]`, `substitutions[]`, `safetyWarnings[]`, `type?`, `restSec?`, `images?`, `techniqueFrames?`, `searchTerms?` (`src/types/index.ts:91-113`) | Biblioteca canônica por ID, porém taxonomias são strings e não há movement pattern/mechanics. **Adaptar**; `searchTerms` já cumpre parte de `aliases`. |
| `WorkoutSet` | `id`, `reps`, `weight`, `completed`, `isWarmup?`, `suggestedWeight?`, `lastWeight?`, `rpe?` (`src/types/index.ts:115-124`) | O mesmo objeto representa alvo pré-preenchido e execução. **Migrar** para separar `SetPlan` e `SetLog`, preservando leitura legada. |
| `ActiveExercise` | `id`, `exerciseId`, `name`, `muscleGroup`, `sets[]`, `notes?`, `repRange?`, `targetRPE?`, `restSec?`, `progressionNote?` (`src/types/index.ts:126-139`) | Snapshot parcial da biblioteca + slot. **Migrar** para entry com planejado/executado/status; não descartar os snapshots legados. |
| `WorkoutSession` | `id`, `name`, `date`, `duration`, `calories`, `exercises[]`, `xpEarned`, `totalVolume?`, `prsDetected?` (`src/types/index.ts:141-151`) | É usado simultaneamente como **treino ativo** e **histórico**; não existe tipo `ActiveWorkout`. **Separar** em sessão ativa e log final no GOAL-23A. |
| `WorkoutProgram` | `id`, `name`, `durationWeeks`, `frequencyDays`, `level`, `objective`, `exercises[]` legado, `description`, `targetAudience?`, `contraindications?`, `repeatWeeks`, `weeks[]`, `isCustom?` (`src/types/index.ts:153-171`) | Todos os seeds duplicam flat list e estrutura real. **Migrar incrementalmente**; manter leitura legada, definir `weeks` como canônico e parar novas escritas duplicadas. |
| `XpNotification` | `id`, `kind`, `text`, `xp`, `count`, `createdAt` (`src/providers/GymFlowContext.tsx:80-89`) | Estado transitório correto; consolida e limita a 2 cards. **Manter fora da persistência**. |
| `PersistedState` do Context | `user`, `weeklyPlan`, `customPrograms`, `activeWorkout`, `activeWorkoutStartedAt`, `restTimerEndAt`, `restTimerTotalSeconds`, `restTimerLabel`, `workoutHistory`, `weightHistory`, `measurementsHistory`, `nutrition`, `achievements`, `challenges`, `favoriteExercises`, `recentlyViewedVideoIds` (`src/providers/GymFlowContext.tsx:37-58`) | Payload de longa duração dentro do envelope do adapter. **Renomear internamente somente com migração**, particionar responsabilidades no futuro. |

### 4.2 Ciclo de vida das estruturas

| Conceito | Criado | Lido | Alterado | Persistido | Ajuste |
|---|---|---|---|---|---|
| Exercício seed | `src/mock/exercises.ts:6`, `762`, composição em `3333-3335` | Biblioteca, builder, planner, treino ativo, player | Não é alterado em disco | Não; é bundle estático | Manter como catálogo até existir pipeline validado. |
| Exercício customizado | `AdminPanel.tsx:38`, `GymFlowContext.tsx:1589` | Mesma lista `exercises` | Add/delete no Context | **Não** | P1: ou tornar feature honesta/persistida em GOAL próprio, ou ocultar Admin do produto. |
| Programa seed | `src/mock/programs.ts:52-549` | Workouts, planner, dashboard, start | Imutável em runtime | Não; é bundle estático | Manter; migrar flat list gradualmente. |
| Programa customizado | `WorkoutBuilder.tsx:175-197` | Mesclado em `allPrograms` (`GymFlowContext.tsx:353-357`) | Upsert por ID (`1325-1336`) | Sim, `customPrograms` | Real, mas só um dia por programa; adaptar no GOAL-19. |
| Semana planejada | `buildWeekFromProgram` (`253-277`) | Dashboard/planner/start | Generate/apply/assign/replan/mark trained (`1264-1389`) | Duas cópias: raiz + `user.weeklyPlan` | Remover duplicação em migração; manter raiz canônica. |
| Sessão ativa | `startWorkout` (`817-936`) | ActiveWorkoutPage e notificações globais | Sets/exercises/notes/swap (`941-1143`) | Sim, a cada debounce | Separar plan/log e registrar status. |
| Histórico | `finishWorkout` (`1145-1191`) | Progressão (`808-814`) e Evolution | Prepend somente | Sim | Legado válido, mas sem status/IDs planejados. |
| Progressão | `suggestNext` em `src/lib/progression.ts:64-153` | `startWorkout:839-867` | Função pura, sem estado | Motivo/sugestão copiados no active/history | Preservar regras e testes no v2. |
| Favoritos | `toggleFavoriteExercise:1575-1579` | Biblioteca/UI | Array de IDs | Sim | Manter; catálogo removido deve ser tolerado. |
| Timer | Estados em `386-389`; inicia em `1059-1064` | ActiveWorkoutPage | timestamp, extensão e skip | EndAt/total/label | Manter timestamp-based; separar render do Context global. |
| XP | `addXp:681-698` e `XpNotification` | Header/cards | Usuário, achievements, challenges | XP/points e gamificação; notificação não | Manter notificação transitória. |

## 5. Mapa planejado versus real

| Conceito planejado | Estrutura real | Arquivo real | Situação | Ajuste recomendado |
|---|---|---|---|---|
| `PersistedState.schemaVersion` | `StorageEnvelope.v` | `src/lib/storage.ts:4-20` | Existe com outro nome | Reaproveitar `v`; migrar para shape novo sem invalidar v1. |
| Cadeia de migrações | Migração única de duas chaves legadas | `GymFlowContext.tsx:537-572` | Existe parcialmente | Extrair como função pura e testar; não deletar origem antes do commit durável. |
| Backup/export/import | Nenhum | — | Ausente | GOAL-17A P0. |
| `ExerciseDef.aliases` | `Exercise.searchTerms?` | `types/index.ts:112`, `mock/exercises.ts:3310-3335` | Existe parcialmente/outro nome | Adaptar para alias canônico sem perder `searchTerms`. |
| `MovementPattern`/`mechanics` | Nenhum | — | Ausente | GOAL-18A. |
| `EquipmentDef` registry | 72 strings livres de `equipment` | `types/index.ts:98` | Existe parcialmente/acoplado ao dado | Criar registry e mapear valores existentes. |
| `TrainingProfile` nível × retorno | `UserProfile.level/goal/...`; sem status de retorno | `types/index.ts:62-89` | Parcial | GOAL-21; decidir `athlete`. |
| `ProgramDay.dayNumber/autoName/customName` | `ProgramDay.id/name` | `types/index.ts:38-43` | Parcial | Migrar preservando `name`. |
| `SetPlan` | `ExerciseSlot` + valores pré-preenchidos de `WorkoutSet` | `types/index.ts:17-25`, `115-124` | Duplicado/acoplado | Separar plano de log. |
| `ActiveWorkout` | `WorkoutSession | null` | `GymFlowContext.tsx:379` | Existe com outro nome | Separar tipo ativo de histórico. |
| `SessionLog/SetLog/status` | `WorkoutSession/WorkoutSet.completed` | `types/index.ts:115-151` | Parcial | GOAL-23A. |
| Skip/defer/substitute honestos | Swap simples; sem status | `GymFlowContext.tsx:1084-1143` | Parcial/risco | Registrar planned/executed/status/reason. |
| GymProfile | `UserProfile.equipments[]`, strings | `types/index.ts:74` | Parcial | GOAL-32 após registry. |
| Suggestion engine | Seleção de programa por regex e alternativa por grupo/equipamento | `GymFlowContext.tsx:291-313`, `1107-1143` | Parcial/heurística acoplada à UI | Extrair motores puros; não chamar de IA. |
| Volume engine | `VolumeProfileConfig` só com tempo/exercícios | `src/lib/volumeProfiles.ts:7-55` | Parcial | Estender, não duplicar. |
| Time estimator | `estimateWorkoutDuration` | `src/lib/workoutDuration.ts:7-38` | Já existe e pode ser reaproveitado | Calibrar fórmula no GOAL-22. |
| Technique frames | Derivação em runtime + lote de 10×5 | `src/lib/techniqueFrames.ts:40-125`, `198-233` | Real e reaproveitável | Manter como fallback oficial. |
| Mídia versionada/aprovada | Sem manifest/licença/status | — | Ausente | GOAL-34A. |
| Personal/sync-ready | IDs de runtime por `Date.now`, poucos timestamps | vários | Ausente/não criar ainda | GOAL-35 apenas documental. |

### 5.1 Duplicações confirmadas

1. **Programa:** os 12 `MOCK_PROGRAMS` possuem `exercises[]` achatado e `weeks[].days[].slots[]`. Foram contadas 45 referências legadas e 54 slots; todas válidas, mas representam a mesma prescrição em shapes diferentes (`src/types/index.ts:160-167`, `src/mock/programs.ts:52-549`).
2. **Semana:** `PersistedState.weeklyPlan` e `UserProfile.weeklyPlan` guardam o mesmo array (`src/types/index.ts:85`, `GymFlowContext.tsx:39-40`). A maioria das actions tenta atualizar os dois, aumentando a chance de drift.
3. **Exercício:** programas guardam apenas `exerciseId`, o que é correto. Ao iniciar, `ActiveExercise` copia ID, nome e grupo; ao finalizar, o histórico copia o active inteiro. A biblioteca continua canônica para programas futuros, mas sessões já iniciadas/históricas não recebem rename.
4. **Planejado/executado:** `WorkoutSet` contém valores pré-preenchidos e `completed`; sem `SetPlan/SetLog`, o mesmo objeto é intenção e execução.
5. **Progresso semanal do Dashboard:** o card de frequência usa `idx < 3`, não `WeeklyWorkoutDay.trained` (`src/modules/Dashboard.tsx:369`). É uma duplicação mock de apresentação.

### 5.2 Referências, estabilidade e drift

- **Biblioteca → programas:** por ID. Renomear um exercício da biblioteca afeta o nome mostrado em novos treinos, mas não o histórico.
- **Remoção:** um ID ausente não quebra `startWorkout`; vira “Exercício Desconhecido” (`GymFlowContext.tsx:835-861`). O programa fica semanticamente degradado. A remoção via Admin é volátil e volta no refresh.
- **IDs estáveis:** os 126 exercícios, 12 programas e dias seed têm IDs explícitos, únicos; não há substituição inválida nem referência de programa ausente.
- **IDs instáveis:** programas customizados, sessões, exercícios ativos e sets adicionados usam `Date.now()`; sets iniciais usam apenas índices (`WorkoutBuilder.tsx:85-90`, `GymFlowContext.tsx:847-858`, `925`, `964`, `993-1005`). IDs de set se repetem entre sessões e IDs por timestamp podem colidir em operações no mesmo milissegundo.
- **Swap:** conserva sets, repRange, targetRPE, restSec e progressionNote do exercício anterior, troca apenas a identidade visual e perde o motivo como dado. É o maior risco confirmado de drift planejado × executado.
- **Weeks:** planner/start usam predominantemente `weeks[0]`; uma futura periodização multi-semana não funcionará apenas adicionando dados.

## 6. Persistência e tamanho do estado

### 6.1 Implementação atual

- Chave: `gymflow:state:v1` (`GymFlowContext.tsx:35`).
- Adapter: `loadState/saveState/clearState` sobre `window.localStorage` (`src/lib/storage.ts`).
- Envelope físico: `{ v: 1, savedAt: ISO, data: PersistedState }` (`src/lib/storage.ts:4-10`, `26-34`).
- Load: SSR-safe; JSON parse; objeto; versão exata; retorna `null` em qualquer erro (`12-23`).
- Save: serializa todo o envelope; falha de quota/modo privado é engolida (`26-37`).
- Debounce: 500 ms após qualquer dependência persistível mudar (`GymFlowContext.tsx:612-653`). Não há flush em `pagehide/visibilitychange`.
- Migração existente: `gymflow_user` e `gymflow_weeklyPlan` → payload atual; as chaves antigas são removidas antes da gravação confirmada do novo envelope (`537-572`).
- Backups/export/import/checksum: inexistentes.

### 6.2 Dados persistidos e lacunas

Persistidos: perfil, semana, programas customizados, sessão ativa, timestamp da sessão, timer de descanso, histórico, peso, medidas, nutrição, achievements, challenges, favoritos e vídeos recentes.

Corretamente transitórios: view, draft do builder, abas/modais, duração derivada, segundos restantes derivados, wake lock, XP notifications e player aberto.

Importantes mas não persistidos: exercícios criados/removidos no Admin, progresso/estado `learned` das videoaulas, comunidade/posts, chat e `lastSavedProgramId`. O Admin é explicitamente mock, mas hoje a UI permite uma ação que parece durável.

Risco adicional: na hidratação, vários arrays só substituem defaults quando `length > 0` (`GymFlowContext.tsx:574-587`). Um estado válido com histórico, medidas, conquistas ou desafios intencionalmente vazios pode reidratar dados mock default em vez do vazio salvo.

### 6.3 Fixtures e medidas

| Fixture | Natureza | Sessões | Bytes serializados (`JSON.stringify`) | Arquivo |
|---|---|---:|---:|---|
| Básica | Estado demo observado, anonimizado | 0 | 8.780 B (8,6 KiB) | `docs/audit/fixtures/gymflow-state-v1-basic.json` |
| Treino ativo | Estado observado após iniciar dia C e concluir 1/22 séries, anonimizado | 0 + ativo | 12.527 B (12,2 KiB) | `docs/audit/fixtures/gymflow-state-v1-active-workout.json` |
| Uso intenso | Stress fixture derivada do shape real: 4 sessões/semana por 52 semanas + 6 programas | 208 | 659.857 B (644,4 KiB) | `docs/audit/fixtures/gymflow-state-v1-heavy-usage.json` |

O navegador de teste permitiu observar o fluxo e a UI, mas não expôs diretamente o conteúdo do `localStorage`. As duas primeiras fixtures foram reconstruídas fielmente a partir do serializador, defaults e estado observado; a terceira é sintética e declaradamente um stress test. Todas usam `Pessoa Exemplo`, domínio de e-mail `.invalid` e IDs sintéticos.

### 6.4 Projeção de crescimento

Premissas: 4 treinos/semana, shapes atuais, 5–7 exercícios por sessão, 7–22 séries conforme o dia, 6 programas customizados mantidos no cenário.

| Horizonte | Sessões aproximadas | Estado projetado | MiB |
|---|---:|---:|---:|
| 30 dias | 18 | 73.721 B (72,0 KiB) | 0,070 |
| 90 dias | 52 | 178.142 B (174,0 KiB) | 0,170 |
| 6 meses | 104 | 339.452 B (331,5 KiB) | 0,324 |
| 12 meses | 208 | 659.857 B (644,4 KiB) | 0,629 |

### 6.5 Decisão localStorage versus IndexedDB

- **Quota:** com o shape atual, `localStorage` continua suficiente em 12 meses com margem ampla. A auditoria não confirmou necessidade imediata de IndexedDB por tamanho.
- **Problema mais próximo:** a API é síncrona e reserializa todo o histórico após cada mutação persistida. Jank, perda na janela do debounce e blast radius de corrupção aparecem antes de quota.
- **GOAL-17A recomendado:** manter `localStorage`, fortalecer envelope, migrações, backup, import/export, validação e erro visível; introduzir uma interface de adapter para não acoplar o restante.
- **GOAL-17B recomendado:** medir tempo de stringify/write em fixtures e, depois do modelo de `SessionLog` do GOAL-23A estar estável, decidir entre particionar chaves ou migrar histórico para IndexedDB. Não juntar essa troca física ao primeiro GOAL de segurança.
- **Particionamento futuro:** catálogo estático continua no bundle; preferências/perfil, sessão ativa e histórico devem ter ciclos de gravação e recuperação separados. Isso reduz reescrita e blast radius.

## 7. GymFlowContext e re-renders

### 7.1 Responsabilidades

`src/providers/GymFlowContext.tsx` tem 1.909 linhas e mantém: navegação, autenticação demo, perfil, exercícios, programas, builder, planner, sessão ativa, cronômetro, descanso, wake lock, histórico, peso/medidas, nutrição, gamificação, feed, mídia, favoritos, Admin e chat.

Há 21 arquivos consumidores de `useGymFlow`, incluindo todas as telas principais e componentes globais. O `value={{...}}` é recriado em todo render e nenhuma action usa `useCallback` (`GymFlowContext.tsx:1795-1896`).

### 7.2 Frequência e áreas afetadas

| Evento | Atualização | Consequência estática |
|---|---|---|
| Treino ativo | `setWorkoutDuration` a cada 1 s (`436-446`) | Provider e consumidores montados recebem novo contexto. |
| Descanso ativo | `setRestSecondsRemaining` a cada 250 ms (`450-478`) | ActiveWorkoutPage e componentes globais podem renderizar 4×/s. |
| Concluir set | Active workout + XP/user + notificação + timer | Várias atualizações próximas e novo `value`. |
| Persistência | Debounce depende de 17 fatias; duração/segundos derivados não entram | Não grava a cada tick, mas continua re-renderizando. |

Sem Profiler não é possível afirmar duração ou número exato de commits. A evidência suficiente para risco arquitetural é que `workoutDuration` e `restSecondsRemaining` estão no mesmo Provider não memoizado que todo o app.

### 7.3 Imutabilidade, closures e concorrência

- Corretas: `updateWorkoutSet`, add/remove set, add/remove exercise e várias listas usam updaters funcionais (`941-1023`).
- Frágeis: `updateExerciseNotes`, `swapExerciseInActiveWorkout` e `adaptActiveWorkoutForCrowdedGym` leem `activeWorkout` da closure e depois fazem `setActiveWorkout({...activeWorkout})` (`1025-1036`, `1084-1143`). Atualizações rápidas concorrentes podem se sobrescrever.
- `finishWorkout` lê múltiplas fatias da closure, dispara várias atualizações e depois limpa a sessão (`1145-1248`). Deve virar uma transição de domínio testável antes de técnicas avançadas.
- O wake lock é refeito em `visibilitychange` e liberado no cleanup; é best-effort correto para web (`480-528`).

### 7.4 Separação futura recomendada

Domínio puro: montagem de sessão, transições de set/entry/session, agregação de volume/PR, progressão, compactação, substituição e migrações.

Contexts/stores de UI: navegação, modais/player e notificações.

Estado de alta frequência: timer de treino/descanso em provider/hook próprio, expondo snapshots mínimos.

Pode permanecer no Context raiz: sessão do usuário atual, referências estáveis a adapters e actions de alto nível, desde que o `value` seja memoizado e/ou dividido por selector/responsabilidade.

## 8. Construtor e planejador

### 8.1 Construtor

O builder é real e manual. Cria/edita um único `ProgramDay`, estima duração, permite volume profile, reorder/duplicate/remove slots e salva um `WorkoutProgram` customizado (`src/modules/WorkoutBuilder.tsx:47-50`, `125-197`).

Limitações frente ao plano premium:

- Cada programa customizado possui um único dia; não há wizard multi-dia.
- IDs usam `custom_${Date.now()}` (`85-90`).
- O campo `exercises` legado é salvo vazio, enquanto `weeks` é canônico (`184-195`).
- O picker do builder busca apenas `ex.name.toLowerCase().includes`, não usa o motor tolerante a aliases já existente (`114-118` versus `src/lib/exerciseSearch.ts:53-60`).
- A heurística composto/isolado é `secondaryMuscles.length`, não mechanics/movement pattern (`WorkoutBuilder.tsx:125-138`).
- Volume profile atual controla faixas de tempo/exercícios, não séries por grupo/semana (`src/lib/volumeProfiles.ts`).

### 8.2 Planejador

O planejador é real: distribui dias reais de `weeks[0]`, referencia `programId/programDayId`, atribui um treino a um weekday e inicia exatamente os slots referenciados (`GymFlowContext.tsx:248-277`, `1260-1323`; `PlannerView.tsx:458-460`).

Limitações:

- Usa apenas a primeira semana do programa.
- Distribuição por frequência é hardcoded para weekdays.
- Replanejamento move o dia atual para o próximo descanso; não conhece fadiga real (`GymFlowContext.tsx:1351-1378`).
- `weeklyPlan` duplicado no perfil aumenta drift.
- Labels de “IA Coach” descrevem regras determinísticas/regex, não IA.

### 8.3 Matriz de maturidade funcional

| Área | Classificação | Evidência/veredito |
|---|---|---|
| A. Construtor de Treino | **Real, parcial, reaproveitável** | CRUD de slots/um dia e persistência funcionam; falta multi-dia/sugestão/taxonomia. |
| B. Planejador semanal | **Real, parcial, risco** | Referências reais; apenas week 0 e estado duplicado. |
| C. Dashboard | **Parcial + mock** | Treino do dia é real; frequência usa `idx < 3`, recovery e dica são estáticos. |
| D. Biblioteca | **Real, reaproveitável** | 126 exercícios, busca, favoritos, imagens e substitutos; taxonomia rasa. |
| E. Treino Ativo | **Real, parcial, risco P1** | Registro/persistência/timer funcionam; falta estado honesto e swap planejado×executado. |
| F. Histórico/Evolução | **Parcial + mock** | Lista de sessões real; fotos, PRs e partes do relatório são mock (`EvolutionDashboard.tsx:43-114`). |
| G. Motor de progressão | **Real, reaproveitável** | Função pura e 15 testes. |
| H. Timer de descanso | **Real, reaproveitável** | Timestamp persisted, ±/skip, toast/vibração/beep; sem notificação OS. |
| I. Wake Lock | **Real, best-effort** | Screen Wake Lock web com reacquire. |
| J. Notificações de XP | **Real, transitório** | Consolidação 5 s, máximo 2, auto-dismiss no componente; não persistir. |
| K. PWA | **Real, parcial** | Manifest + SW; cache runtime limitado e versão manual. |
| L. Capacitor/Android | **Real** | Export estático, projeto Android e APK existente. |
| M. Player de técnica | **Real + placeholder honesto** | 10 sequências de 5 frames, fallback 2 imagens e “3D em breve”. |
| N. Vídeos experimentais | **Mock/placeholder** | `MOCK_VIDEOS`; player usa sequência/frame, sem arquivo de vídeo aprovado. |
| O. Exercícios customizados | **Volátil/mock** | Admin adiciona em memória; não persiste. |
| P. Programas customizados | **Real, parcial** | Upsert/persistência funcionam; um dia por programa e ID por timestamp. |

## 9. Treino ativo

### 9.1 Fluxo real

`startWorkout` resolve programa/dia, usa slots estruturados, consulta histórico por `exerciseId`, chama `suggestNext`, pré-preenche sets e cria `WorkoutSession` ativo (`GymFlowContext.tsx:817-936`). Chamadas legadas sem day usam o primeiro day; programas sem weeks caem na flat list (`870-899`).

Cada mutação relevante do active gera novo objeto e entra no debounce de storage. O teste dinâmico confirmou retomada estrutural, 7 exercícios/22 séries e descanso de 120 s após o primeiro set.

### 9.2 Honestidade atual

- Volume, calorias estimadas no painel, PRs e progressão filtram `completed === true` (`ActiveWorkoutPage.tsx:66-90`, `GymFlowContext.tsx:1152-1179`, `src/lib/progression.ts:33-44`).
- `finishWorkout` aceita qualquer quantidade de séries concluídas e grava a sessão; não há status `completed/incomplete/abandoned` nem status por exercício.
- Exercícios não realizados permanecem no array histórico com sets `completed:false`; não somam volume/progressão, mas não são distinguíveis de skipped/deferred.
- `muscleGroupsWorked` no painel deriva de todos os exercícios planejados, mesmo sem série concluída (`ActiveWorkoutPage.tsx:97-105`).
- PRs são thresholds hardcoded e o UI local chega a chamar qualquer melhor set >0 de recorde; não compara com histórico (`ActiveWorkoutPage.tsx:107-120`, `GymFlowContext.tsx:1163-1179`).

### 9.3 Timer, background e wake lock

- Cronômetro da sessão e descanso usam timestamps, logo retomam corretamente após throttling/background.
- Ao voltar, descanso expirado não dispara notificação atrasada; é descartado (`GymFlowContext.tsx:596-603`).
- Não há Capacitor Local Notifications nem `Notification` web. Se o WebView for suspenso, o usuário só verá o estado correto ao retornar; não há garantia de alerta em background.
- Wake Lock web é solicitado enquanto `activeWorkout` existe e refeito ao voltar para visible.

## 10. Progressão atual

### 10.1 Regras exatas

| Regra atual | Arquivo | Teste existente | Preservar? | Ajuste futuro |
|---|---|---|---|---|
| Só sets `completed:true` e reps numéricas contam | `progression.ts:33-37` | Sim | Sim | Migrar para `SetLog` honesto. |
| ANT = maior carga >0 da sessão real mais recente | `39-55` | Sim | Sim | Explicitar se maior carga ou carga de trabalho deve ser a métrica. |
| `progression='nenhuma'` retorna carga nula e piso da faixa | `68-75` | Sim | Sim | Manter como opt-out. |
| Sem histórico retorna carga nula, reps no piso e reason | `77-85` | Sim, inclusive sets incompletos | Sim | Manter. |
| Incremento inválido/ausente cai em 2,5 kg | `91` | Indireto | Sim com parâmetro | Mover default para profile/equipment rules. |
| Target RPE ausente cai em 8; usa maior RPE da sessão | `92-97` | Sim | Sim inicialmente | Decidir RIR/RPE no G3. |
| Duas sessões consecutivas com alguma série abaixo do piso → -10% | `99-113` | Sim | Sim | Nomear “redução técnica”, não deload de mesociclo; manter paridade. |
| Topo em todas as séries e RPE ausente ou ≤ alvo → +incremento e reps no piso | `115-133` | Sim | Sim | Regra central de dupla progressão. |
| Topo com RPE alto → manter carga/topo | `140-145` | Sim | Sim | Converter reason sem perder semântica. |
| Caso geral → manter carga e `minRepsDone + 1`, limitado ao teto | `135-152` | Sim | Sim | Testar sessões heterogêneas no v2. |
| Arredondamento sempre para 0,5 kg | `29-31` | Sim | Sim como fallback | Futuro registry de incrementos por equipamento. |
| Tipo `linear` | Tipo existe | **Não; sem ramo específico** | Não assumir | Definir ou migrar para dupla/nenhuma. |

O motor já usa histórico real, `repRange`, `targetRPE`, `incrementKg`, RPE opcional, ausência de peso e `progression='nenhuma'`. A diferença ANT/SUG é correta no treino estruturado: ANT vem do histórico; SUG do motor. Em treino livre/legado não há slot, portanto SUG fica ausente.

### 10.2 Cobertura existente

`src/lib/progression.test.ts` contém 15 testes: histórico vazio/incompleto, subida de carga, RPE alto, dupla progressão, deload de duas sessões, uma sessão ruim, aumento de reps, teto, dados ausentes/malformados, progression nenhuma, arredondamento e helper ANT.

GOAL-29 deve começar por executar esses 15 cenários contra o motor v2 (golden/parity), não reescrever e substituir a suíte.

## 11. Biblioteca e exercícios ausentes

### 11.1 Inventário

| Métrica | Resultado |
|---|---:|
| Exercícios | **126** |
| IDs duplicados | 0 |
| Grupos | 12 (`chest`, `back`, `shoulders`, `biceps`, `triceps`, `legs`, `glutes`, `abs`, `cardio`, `calves`, `functional`, `mobility`) |
| Valores de equipamento distintos | **72** strings livres |
| Com `secondaryMuscles` | 90 |
| Com `searchTerms` | 12 |
| Com `images` | 125 |
| Referências de imagem base | 250 |
| `techniqueFrames` gravados no objeto | 0 |
| Sequências reais derivadas | 10 exercícios × 5 frames = 50 |
| `videoFakeUrl` preenchido | 0 |
| Substituições inválidas | 0 |
| Programas seed | 12 |
| Exercícios únicos cobertos por programas | 28/126 |

Distribuição por grupo: legs 23, back 17, chest 15, shoulders 12, biceps 11, triceps 11, abs 10, cardio 7, glutes 6, calves 5, mobility 5 e functional 4.

O catálogo já possui instruções, postura, respiração, erros, correções, variações, substitutions e safety warnings. Faltam primary muscle explícito (hoje `muscleGroup`), movement pattern, mechanics, minLevel normalizado, equipment IDs e curadoria ampla de aliases.

### 11.2 Lista solicitada pelo Founder

| Termo | Situação real | ID/observação | Curadoria |
|---|---|---|---|
| Pullover na máquina | Ausente | Existe `chest_pullover_haltere` | GOAL-33 |
| Remada na máquina | Presente | `back_remada_maquina` | Manter |
| Rosca Scott na máquina | Presente | `biceps_rosca_scott_maquina` | Manter |
| Banco Scott | Presente como equipamento/variação, não exercício | `biceps_rosca_scott` | Taxonomia de equipamento no GOAL-18A |
| Supino vertical articulado | Parcial/genérico | `chest_supino_maquina` não declara vertical/articulado | GOAL-33 |
| Supino inclinado articulado | Ausente | Há barra/halteres | GOAL-33 |
| Supino reto articulado | Parcial/genérico | `chest_supino_maquina` | GOAL-33 |
| Supino declinado articulado | Ausente | Há `chest_supino_declinado_barra` | GOAL-33 |
| Crucifixo inclinado na máquina | Ausente | Há `chest_crucifixo_inclinado_haltere` | GOAL-33 |
| Remada invertida na máquina | Ausente | `back_remada_invertida` é peso corporal/Smith | GOAL-33 |
| Remada articulada | Presente como alias | `back_remada_maquina`; `searchTerms` inclui “remada articulada” (`mock/exercises.ts:3319`) | Manter |
| Puxador articulado | Ausente | Há puxadas em polia | GOAL-33 |
| Puxador invertido | Ausente | — | GOAL-33 |
| Desenvolvimento articulado | Parcial/genérico | `shoulder_desenvolvimento_maquina` | GOAL-33 |
| Leg Press 90° | Ausente | Dois IDs de Leg Press 45°: `legs_leg_press`, `legs_legpress_45` | GOAL-18A/33; também revisar duplicidade semântica |
| Agachamento na máquina | Parcial | Hack e Smith existem; máquina genérica não | GOAL-33 |
| Hack Machine | Presente | `legs_agachamento_hack` | Manter |
| Hack sentado | Ausente | — | GOAL-33 |
| Agachamento pêndulo | Ausente | — | GOAL-33 |
| Front squat | Presente com nome PT-BR | `legs_agachamento_frontal` | Adicionar alias no GOAL-33 |
| Cadeira extensora | Presente | `legs_cadeira_extensora` | Manter |
| Cadeira flexora | Presente | `legs_flexora_sentado` | Manter |
| Mesa flexora | Presente | `legs_mesa_flexora` | Manter |
| Flexora articulada | Ausente | — | GOAL-33 |
| Flexora em pé | Ausente | — | GOAL-33 |
| Máquina sumô | Ausente | Há sumô com halter/terra | GOAL-33 |
| Máquina de glúteo | Ausente | Há cabo/quatro apoios | GOAL-33 |
| Elevação pélvica | Presente | `glutes_elevacao_pelvica`, barra/banco | Máquina específica fica para GOAL-33 |
| Panturrilha sentado | Presente | `calves_panturrilha_sentado` | Manter |
| Banco romano | Presente | `back_hiperextensao_lombar` | Manter |
| Tríceps pulley | Presente como alias | 4 variações na polia têm `pulley` em `searchTerms` | Manter |
| Extensão de tríceps na máquina | Presente | `triceps_maquina`, alias exato (`mock/exercises.ts:3317`) | Manter |

## 12. PWA, Capacitor e Android

### 12.1 Web/PWA

- Manifest App Router estático com standalone, portrait, cores e quatro ícones (`src/app/manifest.ts:1-49`).
- Service worker manual registrado somente em produção (`src/components/ServiceWorkerRegister.tsx:5-17`).
- Cache `gymflow-v1`: cache-first para `_next/static`, icons e exercise assets; navigation network-first com shell fallback (`public/sw.js:9-95`).
- Cache version é manual e não ligado ao build. Assets de exercício mantêm o mesmo URL, então uma imagem corrigida pode continuar antiga até bump do cache.
- `activate` apaga **todo cache da origem** cujo nome não seja `gymflow-v1` (`public/sw.js:33-40`). Isso conflita com o futuro cache separado de vídeos/mídia se a regra não for alterada no GOAL-34A.
- Não há precache completo da biblioteca; PWA offline garante shell/chunks usados, mas imagens/frames nunca solicitados podem não estar no cache. O fallback visual impede crash, não garante mídia completa.
- Safe areas existem no layout, nav, treino, toast e sheets (`src/app/globals.css:36-66`, `ActiveWorkoutPage.tsx:577`).

### 12.2 Mobile/Capacitor

- `BUILD_TARGET=mobile` ativa `output:'export'` e `images.unoptimized` (`next.config.ts:8-18`), compatível com a documentação local do Next 16.
- `webDir:'out'`, `androidScheme:'https'`, fundo escuro e WebView debugging (`capacitor.config.ts:6-22`).
- Android: minSdk 23, target/compile 35; somente INTERNET declarado; `allowBackup=true` (`android/variables.gradle:1-15`, `AndroidManifest.xml:4-40`).
- `adb install -r` preserva dados conforme o procedimento documentado; reinstalação após uninstall não foi testada. `allowBackup=true` não é garantia suficiente para prometer preservação de WebView/localStorage em todo dispositivo.
- Não há plugin nativo para wake lock, notification, storage ou background timer. A implementação depende das Web APIs do WebView.
- `npm run cap:sync` não foi executado nesta auditoria porque alteraria a cópia de assets Android; `build:mobile` validou o export sem tocar código fonte.

### 12.3 Tamanhos

| Artefato | Arquivos | Tamanho |
|---|---:|---:|
| `public/` | 314 | 22,61 MiB |
| `out/` após build mobile | 361 | 24,94 MiB |
| `android/app/src/main/assets` existente | 365 | 24,94 MiB |
| APK debug existente (14/07/2026) | 1 | **27,44 MiB** |

`out/`, assets copiados e build Android não são versionados. Vídeos futuros não devem entrar no APK; 20 vídeos de 1–2 MiB adicionariam aproximadamente 20–40 MiB antes de overhead. Arquitetura remota + cache seletivo é necessária.

## 13. Testes e baseline

### 13.1 Inventário

| Arquivo | Escopo | Testes |
|---|---|---:|
| `src/lib/progression.test.ts` | Motor de progressão | 15 |
| `src/lib/numericInput.test.ts` | Inputs numéricos/APK | 10 |
| `src/lib/exerciseSearch.test.ts` | Normalização, aliases e 12 casos reais | 18 |
| `src/lib/techniqueFrames.test.ts` | Frames/fallback/lote 001 | 6 |
| `src/mock/exercises.test.ts` | Integridade de catálogo/programas/assets | 7 |
| **Total** | 5 arquivos | **56** |

Não há Jest, coverage configurado, CI `.github`, testes de componentes, Context, builder/planner, sessão integrada, persistência, PWA/SW ou scripts mobile. Existem testes Java template do Android, mas não fazem parte do baseline Vitest.

### 13.2 Execuções

| Comando | Resultado | Duração observada | Observações |
|---|---|---:|---|
| `npx vitest run` | PASS | 7,2 s wall; Vitest 2,06 s | 5/5 arquivos, 56/56 testes |
| `npx tsc --noEmit` | PASS | 12,3 s | Sem output/erros |
| `npm run build` | PASS | 23,1 s | Compilação 8,3 s; 4 rotas estáticas |
| `npm run build:mobile` | PASS | 16,6 s | Compilação 4,4 s; export estático gerado |
| Android/Gradle | Não executado | — | Evitado conforme escopo; APK existente auditado |

Rotas: `/`, `/_not-found`, `/manifest.webmanifest` e `/poc-3d`, todas prerenderizadas.

## 14. Riscos confirmados e descartados

### 14.1 Fragilidades F1–F10 do master plan

| Fragilidade | Classificação | Evidência |
|---|---|---|
| F1 — 100% localStorage | **Confirmado com impacto recalibrado** | Storage é localStorage; 12 meses projetados = 0,629 MiB. Perda/corrupção/sincronicidade são maiores que quota imediata. |
| F2 — ausência de schemaVersion/migrações | **Parcialmente confirmado** | Já há `v:1` e migração legada. Faltam cadeia, backup, recovery, export/import e validação. |
| F3 — domínio raso | **Confirmado** | Sem movement pattern, registry de equipamento, mechanics, status/plan/log. |
| F4 — histórico otimista | **Parcialmente confirmado** | Totais/progressão ignoram sets não concluídos; falta status e UI chama sessão incompleta de concluída. |
| F5 — builder manual | **Confirmado** | Um dia por programa, sem wizard/sugestão. |
| F6 — IA Coach/assinatura sem lastro | **Confirmado** | Regras/mock local; sem IA remota ou billing. Landing declara dados mockados, mas linguagem premium ainda promete demais. |
| F7 — Context monolítico | **Confirmado** | 1.909 linhas, 21 consumidores, value não memoizado e timers globais. |
| F8 — mídia embutida | **Confirmado** | 22,61 MiB em public e APK 27,44 MiB antes de vídeos. |
| F9 — cobertura desconhecida | **Descartado como “desconhecida”; risco residual confirmado** | Há 56 testes úteis, porém zero integração/UI/storage/mobile. |
| F10 — dados duplicados | **Confirmado** | Flat+weeks, weeklyPlan duplo e snapshots active/history; programas referenciam exercício por ID, não copiam objeto completo. |

### 14.2 Riscos novos

| Prioridade | Risco novo | Evidência/mitigação futura |
|---|---|---|
| P0 | Versão diferente/corrupção retorna `null` e defaults podem sobrescrever a chave | Recovery e migração antes de qualquer bump (`storage.ts:17-23`). |
| P0 | Migração legada remove origem antes de confirmar novo save | Backup e commit atômico lógico no GOAL-17A. |
| P1 | Falha de write/quota é invisível ao usuário | Retorno `Result`, telemetria local e banner de recuperação. |
| P1 | Janela de 500 ms pode perder a última mutação em kill abrupto | Flush seguro/pagehide ou estratégia por transação para sessão ativa. |
| P1 | Swap cria drift de prescrição | Planned/executed IDs + reason + nova prescrição validada. |
| P1 | Closures podem sobrescrever updates concorrentes | Reducer/transições puras e updater funcional. |
| P1 | IDs de runtime não são globais/sync-ready | ID factory estável antes de Personal/sync. |
| P1 | Exercícios customizados aparentam persistir, mas somem | Tornar honesto ou implementar em GOAL separado. |
| P1 | Service worker apaga caches futuros de mídia | Namespace/prefix ownership no GOAL-34A. |
| P1 | Relatórios misturam real e mock | GOAL-31A deve remover/rotular mocks antes de insights premium. |
| P1 | Context recebe ticks de 250 ms | Separar timer/selector antes de aumentar técnicas. |
| P2 | Timer não notifica em background | Plugin/local notification somente após teste Android e permissão. |
| P2 | Reinstalação pode perder WebView data | Export/backup antes de qualquer promessa; testar update vs uninstall. |
| P2 | Cache de asset estático pode ficar antigo | Cache version por release/manifest de asset. |
| P2 | APK cresce com mídia/POC/bundle | Budget de bundle/APK em cada lote. |

## 15. Ajustes recomendados aos GOALs 17–35

| GOAL | Veredito | Ajuste, arquivos reais e dependências |
|---:|---|---|
| 17 | **Dividir em 17A/17B** | **17A:** adaptar `src/lib/storage.ts` e ponto de hydrate/save do Context; preservar envelope `v`; migrações puras, backup, validação, export/import e recovery com as 3 fixtures. **17B:** adapter particionado/IndexedDB só após benchmark e schema de SessionLog. IndexedDB não é requisito agora. |
| 18 | **Dividir/reduzir** | **18A:** taxonomias, Equipment registry, mapeamento dos 72 labels e validators. Não classificar 126 manualmente no mesmo GOAL. A curadoria em lote vai para 33A. Reusar `Exercise.searchTerms`. |
| 19 | **Ajustar e possivelmente 19A/19B** | Builder real é `src/modules/WorkoutBuilder.tsx` e cria programa de um dia. 19A deve habilitar multi-dia/autoName sem quebrar customPrograms antigos; 19B templates. Depende de 17A, 18A, 21/22/G2. |
| 20 | **Válido com adaptação** | Reusar `src/lib/exerciseSearch.ts`; hoje o builder ignora aliases. `suggestionEngine` usa IDs/taxonomias de 18A e estimator de 22. Não duplicar filtro da Library. |
| 21 | **Ajustar** | `UserProfile` já tem level/goal/frequency/duration/equipment; adicionar status de retorno por migração. Founder deve decidir o nível `athlete`, que o plano de 3 níveis omite. |
| 22 | **Válido, adaptar existente** | Evoluir `src/lib/workoutDuration.ts` e `src/lib/volumeProfiles.ts`; não criar fontes paralelas. Adicionar testes de calibração, volume por grupo e cenários de técnicas. |
| 23 | **Dividir em 23A/23B** | **23A P0:** tipos/transições de SessionPlan/ActiveSession/SessionLog, status e migração legada. **23B:** repetir set, notas persistentes, dor, UX de finalizar, resumo, notification. Preservar timer/wake lock atual. Depende de 17A. |
| 24 | **Válido após 23A/32/18A** | Substituir incrementalmente `swapExerciseInActiveWorkout`, registrando planned/executed/reason e recalculando prescrição; preservar UI atual enquanto motor puro entra. |
| 25 | **Válido com ajuste** | O “Academia Lotada” atual é heurística por string/grupo e troca silenciosamente metadados. Reaproveitar superfície, substituir motor após 24; compact mode separado e confirmável. |
| 26 | **Dividir em 26A/26B** | 26A modelo/validação/agregador/migração; 26B drop/pyramid UI. O shape atual mistura plan/log, então não iniciar antes de 23A e G3. |
| 27 | **Válido após 26A/26B** | Grupos e timers especiais exigem timer fora do Context monolítico e IDs próprios de slot/set. Manter testes de round/timer. |
| 28 | **Válido com reaproveitamento** | `WorkoutSet.isWarmup?` já existe. Formalizar SetPlan kind e plate calculator; não contar warmup em volume/PR. Pode manter uma entrega se escopo ficar pequeno. |
| 29 | **Ajustar, não reescrever** | Absorver `src/lib/progression.ts` com golden parity dos 15 testes. RPE já existe por set/slot; RIR é novo. Preservar regras exatas de dupla progressão, duas falhas, reason e round 0,5. |
| 30 | **Válido** | Depende de 23A, 25 e 29. Check-in deve virar dado de SessionLog, não estado solto do Context. Integrar `UserProfile.restrictions` sem diagnóstico. |
| 31 | **Dividir em 31A/31B** | **31A:** analytics reais básicos e remoção/rotulagem de mocks após 23A. **31B:** técnicas/RIR/readiness após 26–30. Leitura compatível de `WorkoutSession` legado obrigatória. |
| 32 | **Válido; considerar antes do 20 completo** | Evoluir `UserProfile.equipments[]` para GymProfile sem apagar preferências existentes. Depende de Equipment registry 18A; suggestion pode consumir opcionalmente. |
| 33 | **Dividir em 33A/33B** | **33A:** curadoria dos 126 em lotes (~25), aliases/equipamentos/patterns; **33B:** expansão 50–75 após mapa de lacunas aprovado. Evitar duplicar a classificação prometida no antigo GOAL-18. |
| 34 | **Dividir em 34A/34B/34C** | **34A:** arquitetura/manifest/fallback/cache namespace; **34B:** piloto 3–5 vídeos; **34C:** lotes de produção por telemetria/curadoria. O aceite atual de ≥20 mistura arquitetura e produção. D13 bloqueia produção, não o modelo/fallback. |
| 35 | **Restringir a documentação** | Fazer auditoria sync-ready/ADRs em `docs/personal/**`. Não adicionar `createdBy` nem alterar tipos enquanto Gate G4 não aprovar; IDs `Date.now` e falta de timestamps devem ser decisões, não mudança “neutra”. |

### 15.1 Ordem reconciliada

1. **17A — Persistência segura v1**.
2. **18A — Fundação de taxonomia/equipamentos**.
3. **21 — Perfil de treino ajustado**.
4. **22 — Volume/tempo sobre motores existentes**.
5. Gate G2.
6. 19A/19B → 20.
7. **23A** → 23B.
8. 32 → 24 → 25.
9. Gate G3 → 26A/26B → 27 → 28 → 29 → 30.
10. 31A pode começar após 23A; 31B após 26–30.
11. 33A → 33B.
12. 34A → 34B → 34C.
13. Gate G4 → 35 documental.
14. **17B** deve ser agendado por benchmark: antes de 23A se a nova sessão exigir transações; caso contrário, após 23A e antes de 31/26 acumular logs maiores.

## 16. Decisões que exigem aprovação do Founder

1. **D3 revisada:** aprovar GOAL-17A com localStorage seguro e adiar IndexedDB para 17B baseado em benchmark.
2. Aprovar `StorageEnvelope.v` como versão canônica a migrar, em vez de introduzir uma versão concorrente silenciosamente.
3. Decidir se `athlete` permanece nível próprio, vira variante de advanced ou será migrado.
4. Aprovar a separação 18A (taxonomia) versus 33A (curadoria dos 126) versus 33B (expansão).
5. Definir vocabulário PT-BR e IDs para Leg Press 45° versus 90°, máquinas articuladas, hack sentado, pêndulo e flexoras.
6. Aprovar 23A/23B e a semântica exata de sessão incompleta, skipped, partial, substituted e abandoned.
7. Confirmar que IA Coach e assinatura continuam explicitamente demo/mock ou serão ocultados até terem lastro.
8. Ratificar D5–D10 no G3 somente depois de ver a paridade do motor atual.
9. Aprovar a divisão 34A/34B/34C; D13 permanece bloqueante para mídia comercial.
10. Confirmar que GOAL-35 será 100% documental; nenhum campo sync-ready será chamado de “neutro” sem migração aprovada.

## 17. Recomendação do próximo passo

Executar **GOAL-17A — Persistência v1 segura, migrações e export/import**, com este escopo exato:

1. congelar as três fixtures desta auditoria como golden inputs;
2. extrair o payload e o envelope atuais sem trocar backend físico;
3. validar unknown/corrupt state sem sobrescrever;
4. migrar as duas chaves legadas de forma confirmável e idempotente;
5. criar backup pré-migração, export/import e roundtrip;
6. mostrar erro de quota/escrita ao usuário;
7. adicionar testes de hydrate/save/migration/recovery;
8. medir stringify/write nas projeções de 30/90/180/365 dias;
9. produzir decisão objetiva para 17B (particionar ou IndexedDB).

Não iniciar GOAL-18/19/23 enquanto 17A não provar que abre o v1 sem perda e recupera falhas.

## 18. Veredito do Gate G1

**APROVADO COM AJUSTES.**

Fundamentação:

- A base GOAL-15 é funcional, buildável e possui ativos reutilizáveis reais.
- O domínio atual pode evoluir incrementalmente; não há justificativa para reescrita total.
- O planejamento premium é válido como direção, mas não como comando executável sem as correções de nomes, dependências, splits e critérios deste relatório.
- GOAL-17 deve ser reescrito como 17A/17B; GOAL-18/33 e GOAL-34 devem ser divididos; GOAL-23 e 31 também excedem um incremento seguro.
- Nenhuma feature posterior deve começar antes de o Founder aprovar as decisões da seção 16 e o comando reconciliado do GOAL-17A.

Critérios desta auditoria: somente `docs/audit/**` foi criado; nenhum arquivo funcional foi alterado; WIPs paralelos foram preservados; nenhum push foi realizado.
