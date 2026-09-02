# Auditoria de Prontidão para Sincronização Local-First (Sync-Ready)

**Fase:** 7 · **GOAL:** 35 · **Referência:** `GYMFLOW_SAAS_ARCHITECTURE.md` §1

---

## 1. Resumo Executivo

A transição planejada para a **Fase 8** (SaaS com sincronização na nuvem) depende criticamente de uma arquitetura de dados pronta para operar de forma descentralizada. Conforme formulado em `GYMFLOW_SAAS_ARCHITECTURE.md` §1:

> *"Preparações baratas feitas agora: ids string únicos · timestamps ISO em tudo · referências por id (nunca cópia) · schemaVersion · estado serializável integral (export). Isso é 80% do custo de sync pago antecipadamente sem escrever backend."*

Esta auditoria inspeciona exaustivamente o estado real das estruturas de dados e persistência do GymFlow AI no fechamento da Fase 6/7, identificando conformidades, práticas de snapshots versus referências, riscos de colisão temporal e lacunas técnicas que deverão ser resolvidas na Fase 8.

**Veredito:** O domínio atual é **SYNC-CAPABLE COM RESSALVAS DOCUMENTADAS**. O estado é 100% serializável em JSON, o versionamento do storage é robusto, mas as entidades mutáveis e slots dependem de carimbos e geradores de ID que precisarão de padronização na Fase 8.

---

## 2. Inventário Entidade por Entidade

| Entidade | Estrutura Real | Tipo do ID | Timestamps Existentes | Timestamps Ausentes | Referência vs Snapshot |
|---|---|---|---|---|---|
| **WorkoutProgram** (`src/types/index.ts:398`) | `id, name, durationWeeks, frequencyDays, level, objective, repeatWeeks, warmupEnabled?, weeks[], isCustom?, createdBy?` | `string` (`seed-*` em seeds; `Date.now().toString()` em custom) | Nenhum | `createdAt`, `updatedAt` | Referencia `exerciseId` nos slots. Mantém lista achatada `exercises[]` por compatibilidade de apresentação. |
| **ProgramDay** (`src/types/index.ts:189`) | `id, name, slots[], volumeProfile?, dayNumber?, muscleGroupIds?, customName?, targetMinutes?` | `string` (`day-1`, etc. em seeds; `day-${Date.now()}` em custom) | Nenhum | `createdAt`, `updatedAt` | Filho de `ProgramWeek`. |
| **ExerciseSlot** (`src/types/index.ts:161`) | `exerciseId, series, repRange, targetRPE, restSec, progression, incrementKg, technique?, groupId?, groupOrder?, groupRestSec?, groupType?` | **Ausente** (depende de posição do array ou `plannedSlotIndex`) | Nenhum | `id`, `createdAt`, `updatedAt` | Referencia `exerciseId` da biblioteca canônica. |
| **WorkoutSession** (`src/types/index.ts:364`) | `id, name, date, duration, calories, exercises[], xpEarned, warmup?, readiness?, variant?, plannedDuration?, crowdedGymMode?, totalVolume?, techniqueMetrics?, prsDetected?, sourceProgramId?, sourceProgramDayId?, sourceProgramName?, sourceProgramDayName?, status?, startedAt?, endedAt?` | `string` (`session-${Date.now()}`) | `date` (YYYY-MM-DD), `startedAt` (epoch ms), `endedAt` (epoch ms) | Timestamps ISO canônicos (`createdAt`, `updatedAt`) | Snapshot de execução. Carrega referências informativas de origem (`sourceProgramId`, `sourceProgramDayId`) e snapshot congelado de nomes. |
| **ActiveExercise** (`src/types/index.ts:320`) | `id, exerciseId, name, muscleGroup, sets[], notes?, repRange?, targetRPE?, restSec?, progressionNote?, progressionDecision?, plannedSlotIndex?, plannedExerciseId?, entryOrigin?, entryStatus?, plannedExerciseName?, plannedMuscleGroup?, swapReasonCode?, swapReasonNote?, swappedAt?, techniquePlan?, techniqueLog?, groupId?, groupOrder?, groupRestSec?, groupType?` | `string` (`active-${Date.now()}-${idx}`) | `swappedAt` (epoch ms, se trocado) | `createdAt` | Híbrido: referencia `exerciseId` e `plannedExerciseId`, mas desnormaliza `name` e `muscleGroup` para imunidade a alterações futuras do catálogo. |
| **WorkoutSet** (`src/types/index.ts:300`) | `id, reps, weight, completed, isWarmup?, warmupKind?, warmupPercentage?, suggestedWeight?, lastWeight?, rpe?, rir?, setPlan?, groupRound?` | `string` (`set-${idx}` ou `set-${Date.now()}-${idx}`) | Nenhum | `completedAt` | Filho direto de `ActiveExercise`. |
| **UserProfile** (`src/types/index.ts:222`) | `name, email, level, goal, gender, age, weight, height, frequency, duration, location, equipments[], restrictions[], muscleFocus[], preference, xp, streak, lastWorkoutDate?, waterIntake, waterGoal, premiumStatus, points, weeklyPlan?, connectedSocials?, restTimerDefaultSeconds?, restTimerSoundEnabled?, trainingStatus?, returnToTraining?, techniqueUnlocks?, rirOnboardingCompleted?, progressionV2?, progressionOverrides?, progressionParameterAdjustments?` | **Sem ID explícito** (assume perfil local único do dispositivo) | `lastWorkoutDate` (YYYY-MM-DD) | `id`, `createdAt`, `updatedAt` | Agregador de perfil local. |
| **WeeklyWorkoutDay** (`src/types/index.ts:143`) | `dayName, workoutName, muscleGroups[], duration, exerciseCount, isRest, programId?, programDayId?, planningIssue?, trained?` | **Ausente** (chave é a posição no array de 7 dias) | Nenhum | `id`, `plannedDate`, `updatedAt` | Referencia `programId` e `programDayId`. |

---

## 3. Análise Detalhada dos Critérios de Sincronização

### 3.1 Estabilidade dos IDs e Risco de Colisão Temporal

- **IDs Canônicos de Catálogo:**
  Os 126 exercícios da biblioteca (`MOCK_EXERCISES`) e os 12 programas estáticos (`MOCK_PROGRAMS`) utilizam identificadores string semânticos, estáveis e humanamente legíveis (ex.: `supino-reto-barra`, `agachamento-livre`, `prog-push-pull-legs-4x`). Não há risco de colisão.
- **IDs Gerados em Runtime baseados em `Date.now()`:**
  Em programas customizados (`WorkoutBuilder.tsx:85`), sessões ativas (`GymFlowContext.tsx:847`), exercícios ativos (`GymFlowContext.tsx:858`) e conjuntos adicionados em tempo real (`GymFlowContext.tsx:993`), os identificadores são gerados por concatenação com `Date.now()`:
  - Exemplo de programa: `Date.now().toString()`
  - Exemplo de sessão: ``session-${Date.now()}``
  - Exemplo de exercício: ``active-${Date.now()}-${idx}``
  - Exemplo de set: ``set-${Date.now()}-${i}``
- **Diagnóstico de Risco para Sync:**
  No contexto mono-usuário e offline em um único dispositivo, colisões são virtualmente impossíveis (a menos de múltiplos cliques no mesmo milissegundo). Porém, em um ambiente multi-dispositivo ou sincronizado em nuvem (SaaS), dois dispositivos offline gerando entidades no mesmo milissegundo ou com relógios descalibrados sofrerão **colisão de chave primária**.
- **Recomendação para Fase 8:**
  Migrar a geração de IDs em runtime de `Date.now()` para `crypto.randomUUID()` (ou gerador nanoid seguro) no momento da introdução do motor de outbox.

### 3.2 Timestamps Existentes e Ausentes

- **Campos Presentes:**
  - `StorageEnvelope.savedAt`: Timestamp ISO 8601 (ex.: `2026-07-16T12:00:00.000Z`) gravado a cada persistência no `localStorage`.
  - `WorkoutSession.date`: Data de execução em formato ISO date `YYYY-MM-DD`.
  - `WorkoutSession.startedAt`: Epoch em milissegundos do início do treino.
  - `WorkoutSession.endedAt`: Epoch em milissegundos da conclusão do treino.
  - `ActiveExercise.swappedAt`: Epoch em milissegundos do momento em que um exercício foi substituído.
- **Campos Ausentes nas Entidades:**
  - `WorkoutProgram` não possui `createdAt` nem `updatedAt`. Se um usuário editar um treino no celular e no tablet em modo offline, não há como o algoritmo Last-Write-Wins (LWW) saber qual mutação é a mais recente sem um timestamp de modificação da entidade.
  - `ExerciseSlot` não possui data de inclusão ou modificação.
  - `UserProfile` não possui `updatedAt` para resolver conflitos de alteração de metas ou parâmetros de progressão.
- **Recomendação para Fase 8:**
  Adicionar `createdAt` e `updatedAt` obrigatórios (ISO 8601) em todas as mutações no outbox da Fase 8.

### 3.3 Referências por ID versus Snapshots

- **Separação Prescrição vs Execução:**
  O domínio implementa com precisão a regra de negócio do Gate G1:
  - O programa guarda apenas a intenção (`exerciseId`, faixas de repetições, meta de RPE, progressão).
  - A sessão executada (`WorkoutSession`) congela um snapshot do momento da execução (`name`, `muscleGroup`, `plannedExerciseId`, `plannedExerciseName`, `swapReasonCode`).
- **Comportamento em Sincronização:**
  Essa segregação é uma fortaleza arquitetural para o sync. O histórico de sessões executadas é **estritamente append-only**: sessões passadas nunca são alteradas retrospectivamente por mudanças de programas. O merge de histórico em múltiplos dispositivos resume-se a uma união com deduplicação por ID de sessão (`sessionId`).
- **Duplicação Residual:**
  O programa seed mantém simultaneamente a lista achatada legada `exercises[]` e a árvore canônica `weeks[].days[].slots[]`. Na sincronização da Fase 8, apenas a árvore canônica deve ser serializada na nuvem.

### 3.4 Versionamento do Storage

- **Camada v1 (`localStorage`):**
  Envelope explícito `{ v: 1, savedAt: ISOString, data: PersistedState }` (`src/lib/storage.ts`).
  Possui validação estrutural no carregamento e barreira de segurança contra sobrescrita com dados corrompidos.
- **Camada v2 Híbrida (`IndexedDB`):**
  Implementada no GOAL-17B (`src/lib/storage-indexeddb.ts`):
  - Banco de dados `gymflow-persistence` v1.
  - Stores dedicados: `workoutHistory`, `metadata`, `legacySnapshots`.
  - Isolamento por gerações (`generationId`), índice composto `[generationId, sessionId]`.
  - Checksums SHA-256 e verificação de integridade física antes de ativação de geração.
- **Conclusão:**
  A camada de persistência local do GymFlow AI é madura e já suporta partições por envelope e verificação criptográfica, servindo de base sólida para atuar como cache local do Supabase.

### 3.5 Serializabilidade Integral

- Toda a árvore de estado persistida (`PersistedState`) é composta exclusivamente por tipos primitivos (strings, números, booleanos), arrays e objetos literais planos.
- Não existem referências circulares, closures, instâncias de classes não-serializáveis (`Date`, `Map`, `Set`) ou símbolos dentro do payload persistido.
- A exportação e importação de JSON (`exportUserData` / `importUserData`) produzem strings idênticas no ciclo de serialização e deserialização, garantindo que o upload inicial para a nuvem na Fase 8 seja determinístico.

---

## 4. Checklist SAAS §1 — Resumo de Prontidão

| Requisito do SAAS §1 | Status Atual | Evidência Técnica | Ação Necessária na Fase 8 |
|---|---|---|---|
| **IDs string únicos** | Parcialmente Pronto | Catálogos e seeds usam IDs estáveis; entidades dinâmicas usam strings prefixadas com `Date.now()`. | Adotar `crypto.randomUUID()` na criação de entidades mutáveis. |
| **Timestamps ISO em tudo** | Parcialmente Pronto | Sessões usam `date` ISO e epoch ms em `startedAt`/`endedAt`. Storage usa ISO em `savedAt`. Entidades mutáveis não possuem timestamps. | Incluir `createdAt` e `updatedAt` (ISO 8601) em `WorkoutProgram`, `UserProfile` e eventos de mutação. |
| **Referências por ID (sem cópia)** | Pronto com Snapshots Justificados | Slots referenciam `exerciseId`. Snapshots no histórico são intencionais para integridade de auditoria médica/física. | Manter separação canônica no backend: normalizado na prescrição, snapshot imutável no log. |
| **schemaVersion estruturado** | Pronto | Envelopes v1 e v2 com chave `v` e `generationId` verificados por teste. | Integrar `schemaVersion` ao cabeçalho das mensagens de outbox do sync. |
| **Estado serializável integral** | Pronto | Testado via suíte de storage e serialização; sem classes ou referências circulares. | Pronto para payload de export/backup na nuvem (GOAL-37). |
| **Neutralidade de autoria** | **Pronto no GOAL-35** | `WorkoutProgram.createdBy?: 'user' \| 'coach' \| 'system'` introduzido com testes de roundtrip. | Mapear para coluna `created_by` no Postgres do Supabase (GOAL-36/40). |

---

## 5. Próximos Passos (Fase 8)

1. No **GOAL-36 (Auth + Conta):** Criar mapeamento de identidade entre o usuário autenticado no Supabase e os dados locais.
2. No **GOAL-37 (Backup em Nuvem):** Enviar o envelope serializado integral como snapshot comprimido em nuvem, garantindo valor imediato sem complexidade de sincronização bidirecional.
3. No **GOAL-38 (Sync Incremental):** Implementar outbox local de mutações com UUIDs, `updatedAt` em cada entidade mutável e resolução Last-Write-Wins (LWW) por entidade.
