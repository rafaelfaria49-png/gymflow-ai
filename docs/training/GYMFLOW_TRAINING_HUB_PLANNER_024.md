# Arquitetura e Documentação Técnica — GOAL-024
## Reestruturação do Hub de Treinos, Planejador Semanal e Assistente de Plano Determinístico

Data: 2026-09-04  
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

O novo fluxo é composto por um **motor determinístico de 2 etapas**, estruturado de forma pura e testável, sem chamadas a APIs externas:

### Etapa 1: Proposta de Divisão Semanal (`TrainingSplitProposal`)
- **Dados consumidos do perfil:**
  - `user.goal` (Hipertrofia, Definição, Força, Condicionamento, Atleta)
  - `user.level` (Iniciante, Intermediário, Avançado, Atleta)
  - `user.frequency` (2 a 6 dias por semana)
  - `user.duration` (30, 45, 60, 75, 90 minutos)
  - `gymProfile` (máquinas e aparelhos disponíveis)
  - `user.restrictions` (restrições físicas ou articulares)
  - `user.returnToTraining` (ajuste para status de retorno)
  - **Nova entrada:** Prioridades musculares (até 3 grupos selecionados da taxonomia).
- **Regras determinísticas:**
  - **Frequência 2:** Full Body A / B ou Superior / Inferior.
  - **Frequência 3:** Push / Pull / Legs ou Full Body 3x.
  - **Frequência 4:** Superior / Inferior 4x ou PPL + Superior.
  - **Frequência 5:** Divisão 5 dias (Peito, Costas, Pernas, Ombros/Core, Braços) ou PPL + Upper/Lower. **Nunca gera A/B/C/A/B.**
  - **Frequência 6:** PPL 6x ou Upper/Lower 3x.
  - **Regra de Prioridades:** Quando um grupo muscular é priorizado (ex: Peito), o motor confere um 2º estímulo na semana espaçado por no mínimo 48h–72h (ex: Seg Peito+Tríceps, Qui Peito+Ombros), **sem eliminar ou omitir grandes grupos corporais** (Costas e Pernas continuam presentes e equilibrados).
  - **Regra de Duração:** `targetMinutes` é propagado a cada dia gerado.
  - **Variação:** Ação "Gerar outra opção" cicla deterministicamente entre divisões válidas.

### Etapa 2: Preenchimento de Exercícios e Programa Final
- Cada dia estruturado recebe exercícios reais do catálogo via `buildWorkoutSuggestionPreview` (`src/lib/workout-suggestion.ts`).
- Exercícios respeitam:
  - Foco muscular do dia;
  - Nível e objetivo;
  - Disponibilidade de aparelhos (`GymProfileAvailability` / pesos livres);
  - Restrições persistidas;
  - Teto de exercícios e perfil de volume (`VolumeProfile`).
- O programa final é gerado no formato canônico `WorkoutProgram` com `weeks[0].days` preenchido por `ProgramDay`s com slots reais.
- Salvo em "Meus treinos" (`saveCustomProgram`) e aplicável ao Planejador Semanal (`applyProgramToWeek`).

---

## 3. Reorganização da Aba Treinos (`WorkoutsTab`)

A aba Treinos foi reestruturada em 4 áreas claras:
1. **Para você (Entrada Recomendada):**
   - Hero card de destaque com CTA para o **Assistente de Plano**.
   - Recomendações personalizadas da biblioteca pronta baseadas na compatibilidade com o perfil (`findProfileRecommendations`), exibindo justificativa ("Combina com seu objetivo de..."), dias, nível e grupos principais.
2. **Programas prontos:**
   - Catálogo com os 12 programas prontos existentes.
   - Filtros por Nível, Objetivo, Frequência, busca por texto e ordenação.
   - Ações: Ver detalhes, Usar como base, Planejar semana, Iniciar.
3. **Meus treinos:**
   - Lista de programas personalizados do usuário.
   - Destaque para o programa recém-salvo no topo.
   - Ações: Editar, Duplicar, Excluir, Planejar semana, Iniciar.
   - Estado vazio amigável com atalhos para o Assistente e criação do zero.
4. **Montar do zero:**
   - Atalhos para o Construtor: Programa em branco, Usar minha frequência, Começar com template.
   - Galeria informativa dos templates estruturais catalogados (incluindo o novo template de 2 dias).

---

## 4. Atualização do Planejador Semanal (`PlannerView`)

- **Remoção de promessa enganosa:** O termo "Gerar Semana com IA" foi integralmente removido da UX e substituído por "Montar com Assistente".
- **Abertura do Assistente:** O clique em "Montar com Assistente" abre a modal pré-configurada com os parâmetros da tela.
- **Preenchimento sem repetições:** `applyProgramToWeek` e `buildWeekFromProgram` agora mapeiam os dias 1:1. Se um programa possuir menos dias que a frequência semanal do usuário, ele distribui os dias reais e informa ao usuário honestamente, sem repetições cíclicas.

---

## 5. Ponto Futuro de Integração com Provedor de IA

O motor foi desenvolvido de modo que, quando um provider de IA (como Gemini 2.5 Flash, OpenAI ou OpenRouter) for integrado:
1. A interface do Assistente continuará sendo a mesma para o usuário.
2. O prompt do provider poderá receber o `TrainingPlanRequest` e produzir a sugestão de divisão em JSON estruturado.
3. O validador determinístico aqui implementado servirá como **validador de integridade e fallback offline obrigatório**, garantindo que se a IA externa falhar, alucinar exercícios inexistentes ou ficar sem rede, o usuário continuará recebendo uma divisão balanceada e segura.
