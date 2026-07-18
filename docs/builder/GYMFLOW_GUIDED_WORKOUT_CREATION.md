# Criação guiada e templates do Construtor (GOAL-19B)

Data: 2026-07-17 · Base: GOAL-19A (Construtor multi-dia). Gate G2 aprovado pelo Founder.

Este documento descreve a criação guiada, o registry de templates estruturais e as ações
de programa (duplicar, usar como base, excluir) adicionadas no GOAL-19B — e, com o mesmo
peso, o que elas **não** fazem.

---

## 1. Princípio central

**Template não é prescrição.** Um template define somente a **estrutura** de um programa:
quantidade de dias, foco muscular por dia, nomes automáticos/estruturais, duração alvo,
`volumeProfile` e a ordem dos dias. **Nenhum template contém exercícios**; ao ser aplicado,
todo dia nasce com `slots: []`. Tudo é editável, e nenhum exercício é escolhido
automaticamente — a seleção inteligente de exercícios é o GOAL-20, fora deste escopo.

---

## 2. Modos de criação (PART 1)

Ao iniciar um programa novo, o Construtor abre um gate com três caminhos:

| Modo | O que faz |
|---|---|
| **Programa em branco** | Um único Dia 1 vazio. Comportamento próximo ao anterior. |
| **Usar minha frequência** | Lê a frequência do perfil, sugere N dias vazios (editável antes de confirmar, faixa 1–7), sem foco nem exercícios. |
| **Começar com um template** | Abre o seletor → prévia → aplica um draft editável. |

O gate só aparece na **criação de um programa novo** (`!builderDraft && !sourceProgram`).
Editar um programa existente (custom ou "usar como base") vai direto ao editor.

A frequência é **sugestão, não obrigação**: o número inicial vem do perfil, mas o usuário
ajusta antes de confirmar. O gate nunca vira onboarding longo — no máximo 3 passos antes do
editor (modo → seletor → prévia).

---

## 3. Registry de templates (PART 2/3)

`src/lib/workout-templates.ts` é um registry **puro e imutável** (deep-frozen). Após a
auditoria semântica, mantém **6 templates úteis**:

| id | Nome | Dias | Freq. sugerida | Retorno |
|---|---|---|---|---|
| `full-body-3` | Corpo inteiro — 3 dias | 3 | 3 | — |
| `upper-lower-4` | Superior / Inferior — 4 dias | 4 | 4 | — |
| `push-pull-legs-3` | Empurrar / Puxar / Pernas — 3 dias | 3 | 3 | — |
| `push-pull-legs-6` | Empurrar / Puxar / Pernas — 6 dias | 6 | 6 | — |
| `five-day-split` | Divisão 5 dias | 5 | 5 | — |
| `return-full-body-3` | Retorno — Corpo inteiro 3 dias | 3 | 3 | ✓ |

### Auditoria semântica

O template **"Torso / Pernas 4 dias"** descrito no GOAL foi **descartado**: é
estruturalmente idêntico a **"Superior / Inferior 4 dias"** (Torso = Peito+Costas+Ombros+
Braços = Superior; Pernas = Inferior). Mantê-lo seria duplicação sem justificativa.

**"Corpo inteiro 3 dias"** e **"Retorno — Corpo inteiro 3 dias"** compartilham a estrutura
muscular (3× corpo inteiro), mas **não** são duplicados: o de retorno usa `volumeProfile:
'compact'` e um enquadramento conservador. A justificativa é a diferença de volume/propósito,
e um teste garante que nenhum par de templates colida em (estrutura + volume + flag de retorno).

### Template versus programa

- O `id` do template **nunca** vira identidade do programa. A conversão cria ids novos.
- Cada dia do template gera `slots: []`.
- `WorkoutProgram.exercises` (lista achatada legada) **nunca** é recriada para customs novos.

---

## 4. Compatibilidade (PART 4)

`evaluateTemplateCompatibility(template, profile)` devolve sinais **informativos**:
recomendado para a frequência, compatível com nível/objetivo, adequado a retorno, mais/menos
dias que a frequência, e uma frase honesta (`note`). **Nada bloqueia a escolha** e **não há
ranking de "melhor template"**. Quando o número de dias difere da frequência, a nota deixa
claro que dá para editar:

> "Seu perfil indica 4 dias por semana. Este template tem 5 dias, mas você poderá editá-lo."

---

## 5. Prévia (PART 5)

Antes de aplicar, a prévia mostra nome, descrição, número de dias, frequência sugerida,
compatibilidade, a lista de dias (foco + duração alvo + perfil de volume) e — sempre — a
garantia:

> "Este template cria apenas a estrutura dos dias. Você continuará escolhendo os exercícios."

Ações: **Usar este template** · **Voltar** · **Cancelar**. Nada é salvo na prévia.

---

## 6. Conversão para draft (PART 6/7)

`src/lib/workout-guided-creation.ts` — funções puras:

- `createWorkoutDraftFromTemplate(template, profile, options)`
- `createEmptyWorkoutDraftFromFrequency(profile, dayCount?)`

Garantias:

1. Ids novos para o programa e todos os dias.
2. O template/registry **nunca** é mutado.
3. `slots` sempre vazios.
4. `targetMinutes` vem do perfil quando válido; senão, do padrão do `volumeProfile`.
5. **Retorno afeta somente o `volumeProfile` inicial** (um dia que começaria em "Alto volume"
   nasce em "Padrão"); o **nível nunca é rebaixado**.
6. O draft resultante não tem `programId` → o primeiro "Salvar" cria um custom novo.
7. Faixa de dias na criação por frequência: 1–7. Frequência ausente/inválida → 1 dia, sem
   inventar divisão muscular.

Compatível com `normalizeWorkoutProgramForBuilder`/`buildWorkoutProgramFromDraft` (roundtrip
coberto por teste).

---

## 7. Ações de programa (PART 8/9)

`src/lib/workout-program-actions.ts` — puras e imutáveis:

- **Duplicar** (`duplicateWorkoutProgram`): cópia editável de um custom, ids novos, deep-clone
  dos slots, `" — Cópia"` no nome. Original intocado.
- **Usar como base** (`deriveCustomProgramFromSeed`): cria um custom novo a partir de qualquer
  programa (seed ou custom), ids novos, **sem** sufixo de cópia. O seed original **nunca** é
  editado. No app, abre o custom no Construtor para edição.
- **Excluir** (`analyzeProgramDeletion` + `clearProgramFromWeeklyPlan` + `removeProgramFromList`).

### Regras de exclusão

Só **programas customizados** podem ser excluídos (seed nunca). O diálogo (`ConfirmDialog`
dedicado) mostra o impacto: dias, exercícios e quantos dias da semana serão liberados.

- **weeklyPlan futuro:** entradas não treinadas que apontam para o programa são invalidadas com
  `planningIssue: 'missing-program-day'`, nome “Escolha novamente o treino”, resumos zerados e
  sem `programId`/`programDayId`. Não há card quebrado nem botão para iniciar programa morto.
- **Dia treinado:** retorna integralmente intacto; nome, resumos, IDs e status não são reescritos.
- **Histórico:** `workoutHistory` é uma lista de snapshots autocontidos. A origem opcional
  (`sourceProgramId`/`sourceProgramDayId`) é metadado histórico e permanece após a exclusão.
- **Treino ativo:** `activeWorkout` segue a mesma regra de snapshot; excluir o programa
  **nunca** apaga, reconstrói ou interrompe a sessão. A origem histórica pode continuar apontando
  para o ID excluído sem transformá-lo em vínculo vivo.

Não apagamos nada de sessão/histórico por ID ou aproximação de nome. A sessão ativa é
independente e segue rodando; apenas o planejamento futuro exige nova escolha.

---

## 8. Card e menu de programa (PART 10)

Menu contextual acessível (`WorkoutProgramMenu`), abre para cima, fecha por Escape / clique
fora / seleção, navega por setas, devolve o foco ao gatilho.

- **Custom:** Editar · Duplicar · Excluir (mais Ver Detalhes / Iniciar nos botões do card).
- **Seed:** Usar como base · Planejar semana (mais Ver Detalhes / Iniciar). **Nunca** mostra
  "Excluir".

---

## 9. Meus Treinos (PART 11/12)

`src/modules/WorkoutsTab.tsx`:

- **Filtro:** Todos · Meus treinos · Programas prontos.
- **Busca por nome:** ignora acentos e caixa (reusa `normalizeText`), casa por tokens.
- **Ordenação:** mais recentes · nome · quantidade de dias.
- **Cards:** dias, duração média aproximada (memoizada por assinatura leve — não recalcula a
  cada render), grupos principais, nível, badge Personalizado/Programa pronto.
- **Estado vazio (sem custom):** "Você ainda não criou um treino personalizado." + Criar do
  zero / Usar minha frequência / Escolher template (deep-link para o gate).
- **Busca sem resultado:** "Não encontramos treinos para esta busca." + Limpar filtros.

O filtro por nível continua valendo só para a biblioteca de programas prontos.

---

## 10. Dirty state (PART 16)

A criação guiada **não salva** o programa. A linha de base do dirty-state é o draft em branco
do mount; aplicar template/frequência muda o draft mas **não** a base, então sair sem salvar
dispara o `ConfirmDialog` existente. Após salvar, a base é atualizada e o dirty-state some.
"Programa em branco" mantém o draft inicial (base == atual) — sair de um branco pristino não
pergunta, igual ao GOAL-19A.

---

## 11. Análise, volume e taxonomia legada (PART 17/18)

Os resumos do GOAL-19A são preservados. Templates recém-aplicados têm volume 0 e duração
indeterminada até o usuário adicionar exercícios — os painéis já exibem isso de forma honesta
("Adicione exercícios…"), sem avisos enganosos de "volume baixo".

A taxonomia legada continua limitada (nenhum exercício tem `primaryMuscleGroupId`;
`LEGACY_GENERIC_COVERAGE` preservado). Este GOAL **não** faz curadoria (isso é o GOAL-33A) e
não altera nada em `training-volume`, `workoutDuration`, `progression`, `storage`,
`mock/*` ou `ActiveWorkoutPage`.

---

## 12. Relação com outros GOALs

- **GOAL-20** (próximo): motor de sugestões, filtros e seleção inteligente de exercícios. Este
  GOAL prepara a superfície (templates estruturais + criação guiada) mas **não** escolhe,
  pontua nem substitui exercícios.
- **GOAL-23A:** `ExerciseSlot` continua sem `id`; identidade do slot = índice no dia.
- **GOAL-33A:** curadoria da taxonomia canônica dos 126 exercícios.

---

## 13. Contrato de API tocado

`openWorkoutBuilder(draft?, returnView?, creationStep?)` ganhou um **3º parâmetro opcional e
aditivo** (`creationStep: 'mode' | 'frequency' | 'template'`) para o estado vazio deep-linkar
a criação guiada. Todas as chamadas existentes (2 args) seguem inalteradas.
