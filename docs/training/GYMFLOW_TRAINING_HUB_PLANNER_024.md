# Arquitetura e Documentação Técnica — GOAL-024 / GOAL-024B
## Reestruturação do Hub de Treinos, Planejador Semanal e Assistente de Plano Determinístico

Data: 2026-09-05  
Branch: `feat/training-hub-planner-restructure-024`  
Base canônica: `ecbfe71241ad9a69dd11f33b9e296bb5eb9c3587`

---

## 1. Contexto e Problema Resolvido

No modelo anterior, a geração semanal invocava `generateWeeklyPlan()`, que escolhia um programa pronto estático e delegava a `buildWeekFromProgram()`, a qual distribuía os dias em repetição cíclica modular:
```ts
// Legado defeituoso:
const progDay = programDays[cursor % programDays.length];
cursor++;
```
Esse comportamento gerava semanas desequilibradas e redundantes (ex: um programa de 3 dias A/B/C aplicado a uma rotina de 5 dias resultava em `A / B / C / A / B`, com treinos de peito/costas se repetindo sem critério de recuperação nem respeito às prioridades musculares do usuário). Além disso, a interface prometia falsamente "Gerar Semana com IA" sem que houvesse um provedor externo real configurado.

---

## 2. O Novo Assistente de Plano de Treino

O fluxo é composto por um **motor determinístico de 2 etapas**, estruturado de forma pura e testável, sem chamadas a APIs externas:

### Etapa 1: Proposta de Divisão Semanal (`TrainingSplitProposal`)
- **Dados consumidos do perfil:**
  - `user.goal` (Hipertrofia, Definição, Força, Condicionamento, Atleta)
  - `user.level` (Iniciante, Intermediário, Avançado, Atleta)
  - `user.frequency` (2 a 6 dias por semana)
  - `user.duration` (30, 45, 60, 75, 90 minutos)
  - `gymProfile` (máquinas e aparelhos disponíveis)
  - `user.restrictions` (restrições físicas ou articulares)
  - `user.returnToTraining` (ajuste para status de retorno)
  - **Prioridades musculares:** Até 3 grupos selecionados da taxonomia (`priorityMuscleGroups[0..2]`).
- **Motor de Composição de Prioridades e Equilíbrio Semanal (GOAL-024B):**
  - **Respeito à ordem de prioridades:** O motor processa `p0`, `p1` e `p2` na ordem exata escolhida pelo usuário, compondo divisões especializadas que integram múltiplos focos simultaneamente (ex: Peito + Costas, Peito + Ombros, Costas + Bíceps, Quadríceps + Glúteos).
  - **Validador de Equilíbrio Semanal (`validateWeeklySplitBalance`):** Assegura que nenhuma divisão semanal omita grandes grupos corporais essenciais (Peitoral, Dorsais, Quadríceps, Cadeia Posterior / Glúteos e Deltoides).
  - **Correção estrutural (4 dias + Peito):** Garante a inclusão explícita de posteriores de coxa e glúteos na sessão de membros inferiores (`quadriceps`, `hamstrings`, `glutes`, `calves`) e aloca Costas e Bíceps no Dia 3, espaçando o estímulo secundário de deltoides/peito no Dia 4 sem sobrecarga consecutiva na articulação dos ombros.
  - **Regras determinísticas por frequência:**
    - **Frequência 2:** Full Body A / B ou Superior / Inferior.
    - **Frequência 3:** Push / Pull / Legs ou Full Body 3x.
    - **Frequência 4:** Superior / Inferior 4x ou divisões especializadas com foco em prioridades.
    - **Frequência 5:** Divisão 5 dias (Peito, Costas, Pernas, Ombros/Core, Braços) ou variações direcionadas. **Nunca gera repetição cíclica A/B/C/A/B.**
    - **Frequência 6:** Push / Pull / Legs 2x com foco prioritário customizado.
- **Determinismo vs IDs Únicos:**
  - O motor de divisões, dias, nomes, rationale e seleção de exercícios é 100% determinístico e testável para as mesmas entradas.
  - Para persistência segura e evitar colisões no banco/storage local, IDs de programas e dias usam geradores controlados (`createBuilderId()`, timestamps).
- **Regra de Duração:** `targetMinutes` é propagado a cada dia gerado. Rotinas com duração alvo elevada ($\ge 70$ min) cuja estimativa fique abaixo recebem aviso transparente no preview orientando o ajuste de exercícios ou séries.
- **Variação:** Ação "Gerar outra opção" cicla deterministicamente entre divisões válidas.

### Etapa 2: Preenchimento de Exercícios e Programa Final
- Cada dia estruturado recebe exercícios reais do catálogo via `buildWorkoutSuggestionPreview` (`src/lib/workout-suggestion.ts`).
- **Parâmetros adaptados ao objetivo (`resolveGoalExerciseParameters` — GOAL-024B):**
  - *Hipertrofia:* Compostos 6-10 reps (RPE 8, 120s descanso), Isolados 10-15 reps (RPE 8, 75s descanso), progressão dupla.
  - *Força:* Compostos 3-6 reps (RPE 8.5-9, 180s descanso), Isolados 6-10 reps (RPE 8, 120s descanso), progressão linear.
  - *Emagrecimento / Definição:* Compostos 12-15 reps (RPE 7.5, 60-75s descanso), Isolados 15-20 reps (RPE 7.5, 45-60s descanso).
  - *Condicionamento:* Compostos 12-15 reps (RPE 7, 60s descanso), Isolados 15-20 reps (RPE 7, 45s descanso).
- Exercícios respeitam:
  - Foco muscular do dia;
  - Nível e objetivo;
  - Disponibilidade de aparelhos (`GymProfileAvailability` / pesos livres);
  - Perfil de volume (`VolumeProfile`).
- **Transparência de Restrições na UI (GOAL-024B):** Mensagem honesta e não-ilusória informando: `"Restrições informadas — revise os exercícios antes de aplicar (nomes das restrições)"`.
- O programa final é gerado no formato canônico `WorkoutProgram` com `weeks[0].days` preenchido por `ProgramDay`s com slots reais.
- Salvo em "Meus treinos" (`saveCustomProgram`) e aplicável ao Planejador Semanal (`applyProgramToWeek`).

---

## 3. Reorganização da Aba Treinos (`WorkoutsTab`)

A aba Treinos é estruturada em 4 áreas claras:
1. **Para você (Entrada Recomendada):**
   - Hero card de destaque com CTA para o **Assistente de Plano**.
   - Recomendações personalizadas da biblioteca pronta baseadas na compatibilidade com o perfil (`findProfileRecommendations`), exibindo justificativa ("Combina com seu objetivo de..."), dias, nível e grupos principais.
2. **Programas prontos:**
   - Catálogo com os 12 programas prontos existentes.
   - **Filtro canônico de objetivo (`programMatchesTrainingGoal` — GOAL-024B):** Alinha chaves canônicas (`hypertrophy`, `strength`, `slimming`, `conditioning`) com termos em português (`hipertrofia`, `força`, `emagrecimento`, `definição`, `condicionamento`). Elimina falsos positivos (ex: `prog_beg_3` com menção pontual a "força básica" no texto explicativo não casa com filtro de força) e assegura que programas como PPL 6x e Glúteo Avançado casem com hipertrofia.
   - Filtros por Nível, Objetivo, Frequência, busca por texto e ordenação.
   - Ações: Ver detalhes, Usar como base, Planejar semana, Iniciar.
3. **Meus treinos:**
   - Lista de programas personalizados do usuário.
   - Destaque para o programa recém-salvo no topo.
   - Ações: Editar, Duplicar, Excluir, Planejar semana, Iniciar.
   - Estado vazio amigável com atalhos para o Assistente e criação do zero.
4. **Montar do zero:**
   - Atalhos para o Construtor: Programa em branco, Usar minha frequência, Começar com template.
   - Galeria informativa dos templates estruturais catalogados (incluindo o template de 2 dias).

---

## 4. Atualização do Planejador Semanal (`PlannerView`)

- **Remoção de promessa enganosa:** O termo "Gerar Semana com IA" foi integralmente removido da UX e substituído por "Montar com Assistente".
- **Abertura do Assistente:** O clique em "Montar com Assistente" abre a modal pré-configurada com os parâmetros da tela.
- **Preenchimento sem repetições:** `applyProgramToWeek` e `buildWeekFromProgram` mapeiam os dias 1:1. Se um programa possuir menos dias que a frequência semanal do usuário, ele distribui os dias reais e informa ao usuário honestamente, sem repetições cíclicas.

---

## 5. Ponto Futuro de Integração com Provedor de IA

O motor foi desenvolvido de modo que, quando um provider de IA (como Gemini 2.5 Flash, OpenAI ou OpenRouter) for integrado:
1. A interface do Assistente continuará sendo a mesma para o usuário.
2. O prompt do provider poderá receber o `TrainingPlanRequest` e produzir a sugestão de divisão em JSON estruturado.
3. O validador determinístico aqui implementado servirá como **validador de integridade e fallback offline obrigatório**, garantindo que se a IA externa falhar, alucinar exercícios inexistentes ou ficar sem rede, o usuário continuará recebendo uma divisão balanceada e segura.
