# Construtor de Treino multi-dia (GOAL-19A)

Data: 2026-07-17 · Gate G2: **aprovado pelo Founder** (pré-requisito deste GOAL).

Este documento descreve o domínio do Construtor multi-dia, o que ele garante e — com o
mesmo peso — o que ele **não** faz.

---

## 1. O que mudou

Antes (GOAL-10.5), cada "Salvar" gerava um `WorkoutProgram` de **um único dia**. A regra
existia para nunca arriscar sobrescrever um dia irmão: como o Construtor só carregava um
dia, salvar reescrevia `weeks[0].days` inteiro e apagaria os outros.

Agora o Construtor carrega e salva o **programa inteiro**. Os dias irmãos são editados
juntos, no mesmo draft, e nenhum se perde. A regra antiga fica obsoleta.

---

## 2. Programa canônico

```
WorkoutProgram
└── weeks: [ { number: 1, days: [ ProgramDay, ... ] } ]   ← fonte canônica
    └── ProgramDay
        └── slots: ExerciseSlot[]
```

- Programas customizados usam **uma semana canônica** (`weeks[0]`).
- `WorkoutProgram.exercises` (lista achatada legada) **nunca é recriada** a partir dos
  dias. Programas novos gravam `exercises: []`. Se um programa já tinha a lista, ela é
  preservada como está — não duplicamos, mas também não destruímos.
- `frequencyDays` passa a refletir o número real de dias do programa.

### Campos aditivos em `ProgramDay`

Todos opcionais; dias seed e dias criados antes do GOAL-19A não os têm e continuam válidos.

| Campo | Papel |
|---|---|
| `dayNumber` | Projeção da posição (1-based). **Nunca identidade** — quem identifica é o `id`. Recalculado a cada normalização. |
| `muscleGroupIds` | Foco muscular escolhido no Construtor. |
| `customName` | Nome digitado pelo usuário. Ausente = `name` veio do nome automático. |
| `targetMinutes` | Tempo disponível pensado para o dia. |

---

## 3. Domínio do draft

O draft vive em memória e **não é persistido como entidade separada** (o que é salvo é
sempre um `WorkoutProgram`).

```ts
interface WorkoutProgramBuilderDraft {
  programId?: string;      // só ao editar um customProgram existente (upsert por id)
  name: string;
  description?: string;
  level: TrainingExperienceLevel;
  objective: string;
  durationWeeks: number;
  repeatWeeks: boolean;
  targetMinutes: number;   // default para dias novos
  days: WorkoutDayBuilderDraft[];
}

interface WorkoutDayBuilderDraft {
  id: string;              // identidade estável (sobrevive a reordenação)
  dayNumber: number;       // posição atual
  autoName: string;        // derivado de muscleGroupIds
  customName?: string;     // prevalece sobre autoName
  muscleGroupIds: MuscleGroupId[];
  volumeProfile: VolumeProfile;
  targetMinutes: number;
  slots: ExerciseSlot[];
}
```

### Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/workout-builder.ts` | Tipos do draft. |
| `src/lib/workout-builder-id.ts` | Fábrica de IDs (`crypto.randomUUID` + fallback). |
| `src/lib/workout-day-naming.ts` | Nomes automáticos, rótulos e chips de foco. |
| `src/lib/workout-program-normalization.ts` | `normalize…` / `build…` (ler/gravar). |
| `src/lib/workout-builder.ts` | Dias, slots, foco no seletor, volume, dirty state. |
| `src/components/workout-builder/*` | UI. |
| `src/modules/WorkoutBuilder.tsx` | Orquestrador. |

---

## 4. Compatibilidade com programas antigos

`normalizeWorkoutProgramForBuilder(program)` é **puro**: abrir um programa nunca o altera.

Como o nome de um dia antigo é preservado sem perda: se o `name` persistido **não** é o que
o gerador automático produziria para aquele foco, ele só pode ter vindo do usuário — vira
`customName`. Um programa antigo chamado "Meu Treino" (sem foco) tem `autoName = "Treino sem
foco definido" ≠ "Meu Treino"`, então `customName = "Meu Treino"` e o roundtrip devolve o
nome intacto.

Garantias cobertas por teste:

- programa antigo de um dia abre como Dia 1, com id, slots, `volumeProfile` e nome preservados;
- roundtrip `normalize → build` não perde nem renomeia nada;
- programas **seed nunca ganham `programId`** no draft → salvar cria um customProgram novo
  (regra herdada do GOAL-10.5), o seed permanece intocado;
- programa sem `weeks` cai na lista achatada legada (caminho defensivo — nenhum seed atual
  cai nele). `exerciseId`, `series` e `repRange` vêm do dado real; RPE/descanso/progressão/
  incremento não existem na lista achatada e usam os **mesmos defaults** que o Construtor já
  aplica ao adicionar um exercício à mão.

---

## 5. Dias

- Programa novo começa com **Dia 1**.
- A frequência do perfil é **sugestão visual** ("Seu perfil indica 4 dias… Criar 4 dias?"),
  nunca obrigação. Os dias criados são **vazios** — nenhum exercício é inventado.
- Teto defensivo: `MAX_PROGRAM_DAYS = 7` (não é recomendação de treino).
- Remoção: nunca remove o último dia; usa `ConfirmDialog` informando quantos exercícios serão
  removidos. Nada de `confirm()` nativo.
- Duplicação: id novo, slots copiados em profundidade, foco preservado, inserida logo após a
  original. `"(Cópia)"` só entra quando havia `customName` — o nome automático já descreve o foco.
- Reordenação: botões ←/→ (sem dependência nova). Renumera; os ids não mudam.

### Numeração

`dayNumber` **deriva sempre da posição atual**. Reordenar renumera; remover não deixa lacuna.
O número não é o id, e um nome customizado não remove o número.

---

## 6. Nomes automáticos

`generateWorkoutDayAutoName(muscleGroupIds)` — pura, previsível (ordem da taxonomia), PT-BR.

| Foco | Nome |
|---|---|
| `[chest]` | Peito |
| `[chest, triceps]` | Peito e Tríceps |
| `[back, biceps]` | Costas e Bíceps |
| `[quadriceps, hamstrings, glutes]` | Pernas |
| `[shoulders, core]` | Ombros e Core |
| `[cardio]` / `[mobility]` / `[full_body]` | Cardio / Mobilidade / Corpo inteiro |
| `[]` | Treino sem foco definido |

Regras:

- **Resumos** (`GROUP_SUMMARIES`): `quadriceps+hamstrings+glutes → "Pernas"`,
  `biceps+triceps → "Braços"`. Só conjuntos completos. Panturrilha nunca é absorvida em
  "Pernas" (`[quadriceps, calves] → "Quadríceps e Panturrilhas"`).
- **Nome curto**: acima de 4 grupos, o excedente vira "e mais N" — não mente, só não enumera;
  os chips continuam mostrando tudo.
- **Rótulos**: a taxonomia é a fonte. `SHORT_LABEL_OVERRIDES` encurta apenas o que ficaria ruim
  dentro de um nome composto (`core → "Core"`, `legs_general → "Pernas geral"`, `traps → "Trapézio"`).
- Nome final = `customName?.trim() || autoName`. Mudar os chips **não** apaga o customizado;
  existe a ação "Usar nome automático".

`programDayDisplayLabel(day)` compõe `"Dia N — Nome"` **apenas** quando o dia tem `dayNumber`.
Dias seed já trazem identidade própria ("Dia A — Peito Foco") e saem inalterados.

---

## 7. Foco muscular

Chips principais: Peito, Costas, Ombros, Bíceps, Tríceps, Quadríceps, Posterior de coxa,
Glúteos, Panturrilhas, Core, Cardio, Mobilidade.
"Mais grupos": Adutores, Abdutores, Antebraços, Trapézio, Lombar, Corpo inteiro, Funcional,
Pernas geral. (Um teste garante que os dois conjuntos cobrem a taxonomia inteira, sem grupo escondido.)

O foco organiza o dia, gera o nome e prepara o filtro do GOAL-20. **Não escolhe exercícios.**

---

## 8. Slots por dia

Cada dia tem a própria lista. Alternar dia não perde o estado dos outros. O mesmo exercício
pode existir em dias diferentes (nunca bloqueado); o seletor informa "Já está no Dia N" e
"No treino ×N" para duplicidade no mesmo dia.

**Limitação (GOAL-23A):** `ExerciseSlot` continua **sem `id`**. A identidade do slot é o índice
dentro do dia. Não foi adicionado `slotId` porque `mock/programs.ts` e `progression.ts` são
intocáveis neste GOAL e slots seed não teriam id — criaria um mundo de duas classes. Quando
SessionPlan/SessionLog entrar (GOAL-23A), avaliar `slotId` com migração explícita.

---

## 9. Seletor e classificação legada

O filtro tem só dois modos: **"Foco do dia"** e **"Todos os exercícios"**. Resolve, nesta ordem:
`primaryMuscleGroupId` → `muscleGroup` legado → genérico legado → secundários (canônicos/legados).

### Por que existe `LEGACY_GENERIC_COVERAGE`

Hoje **nenhum dos 126 exercícios tem `primaryMuscleGroupId`** — todos resolvem pelo campo legado
`muscleGroup`, e os 23 exercícios de perna colapsam em `legs_general`. Ou seja: **nenhum exercício
resolve para quadríceps ou posterior de coxa**.

Sem tratamento, isso produziria duas mentiras:

1. filtrar por "Quadríceps" devolveria **lista vazia** (mesmo com Cadeira Extensora no catálogo);
2. a análise afirmaria *"este programa não possui trabalho direto para posterior de coxa"* mesmo
   com Mesa Flexora no dia — uma afirmação **falsa**.

`LEGACY_GENERIC_COVERAGE = { legs_general: [quadriceps, hamstrings, adductors, abductors] }` diz
apenas: *"um exercício marcado como `legs_general` PODE ser deste subgrupo — a classificação atual
não permite afirmar nem negar"*. Com isso:

- o filtro mostra os exercícios de perna, sempre com **"Alguns exercícios usam classificação legada."**;
- a análise **não afirma ausência** que não consegue verificar; em vez disso diz que o trabalho de
  perna está classificado genericamente.

Isto **não** é substituição automática (PART 5): o chip continua sendo o do usuário e a origem
legada é sempre exibida. Glúteos e panturrilhas têm grupo legado próprio, então a ausência deles
**é** verificável e continua sendo afirmada.

A cura exercício a exercício é o **GOAL-33A**.

---

## 10. Duração e volume

- **Por dia**: `estimateWorkoutDurationDetailed` (GOAL-22) → duração central, faixa provável,
  trabalho/descanso/transições/setup e confidence. Dados faltando reduzem a confidence, mas a
  estimativa **não é escondida**.
- **Por dia (volume)**: números crus (grupos, séries diretas, exposição secundária ×0,5,
  weightedSets, não classificados). **Sem** comparação com a faixa semanal — comparar um dia
  isolado com uma referência semanal, sem o contexto dos outros dias, seria desonesto.
- **Programa** ("Análise do programa"): soma semanal por grupo × referência do perfil, confidence
  e avisos.

Nada é aplicado automaticamente. Todo aviso é textual — o painel diz isso explicitamente.
O painel **não** se chama IA nem "otimizado": não existe otimização aqui.

---

## 11. Salvamento e início

- **Salvar**: upsert por id, destaque "Recém-criado" preservado, vai para "Meus Treinos".
- **Salvar e Planejar**: salva e revela o seletor de dia da semana **para o dia selecionado**,
  explicando que os outros dias são atribuídos no Planejador. Não assume dias = frequência semanal.
- **Iniciar Agora**: com um dia, comportamento atual. Com vários, **pergunta qual dia**
  (`StartDayPicker`) — iniciar o Dia 1 em silêncio seria escolher pelo usuário. Dias sem exercício
  aparecem desabilitados com o motivo à mostra.
- Nome da sessão multi-dia: `"{Programa} — Dia N · {Nome do dia}"`.

## 12. Planejador e Treino Ativo

Consumo mínimo, sem redesenhar nada:

- `buildWeekFromProgram` e `assignDayToWeekday` passaram a usar `programDayDisplayLabel` —
  **no-op para dias seed**, "Dia N — Nome" para dias do Construtor;
- `WorkoutsTab`: rótulo do card de treino custom passou a depender da estrutura real
  (`N dias` para multi-dia; "N exercícios" para um dia só) — contar só o primeiro dia diria
  "5 exercícios" para um programa de 4 dias;
- `PlannerView`/`WorkoutsTab`: dias exibidos com `programDayDisplayLabel`.

`openWorkoutBuilder(draft, returnView)` **não mudou de assinatura**: `programId` passou a
significar "edite este programa" e `dayId` "abra neste dia". Por isso "Editar" no Planejador e em
Meus Treinos já abre o programa inteiro sem alteração nos chamadores.

O modelo de sessão ativa **não mudou**. SessionPlan/SessionLog é GOAL-23A.

---

## 13. Fronteiras

Este GOAL **não** faz — e nada no código tenta fazer:

- escolher exercícios automaticamente, pontuar ou ranquear (**GOAL-20**);
- templates e criação guiada (**GOAL-19B**);
- SessionPlan/SessionLog e `slotId` (**GOAL-23A**);
- curadoria da taxonomia dos 126 exercícios (**GOAL-33A**);
- supersets, técnicas avançadas, equipamento disponível, lotação, balanceamento automático;
- alterar programas seed, progressão, storage, Treino Ativo (além do consumo correto do dia) ou backend.
