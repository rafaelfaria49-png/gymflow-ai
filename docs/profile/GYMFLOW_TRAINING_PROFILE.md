# GymFlow Training Profile

## Objetivo

O perfil de treino separa duas dimensões que não devem ser confundidas:

- experiência: o repertório e domínio acumulados pelo aluno;
- continuidade: se a pessoa treina normalmente ou está voltando após uma pausa.

Uma pausa não apaga experiência. Por isso `intermediate + returning` aparece como **Intermediário em retorno**, sem mudar o `level` persistido para `beginner`.

Este incremento modela e permite editar contexto. Ele não prescreve séries, repetições, volume, RPE, descanso, deload, exercícios ou progressão.

## Fontes reais do projeto

- tipo persistido: `UserProfile` em `src/types/index.ts`;
- onboarding: `src/modules/OnboardingFlow.tsx`;
- edição posterior: configurações em `src/modules/EvolutionDashboard.tsx`;
- default/demo, cadastro e merge: `src/providers/GymFlowContext.tsx`;
- persistência/hidratação: `PersistedState.user` e fluxo seguro do `GymFlowContext`;
- validação estrutural do envelope: `src/lib/storage-validation.ts`;
- export/import: `src/lib/storage-export.ts`.

O adapter central, a chave e o envelope não mudaram.

## Níveis de experiência

| ID | Label | Orientação resumida |
|---|---|---|
| `beginner` | Iniciante | Desenvolvendo técnica, repertório e consistência; carga baixa sozinha não define o nível. |
| `intermediate` | Intermediário | Conhece os movimentos principais e registra carga, repetições e esforço. |
| `advanced` | Avançado | Experiência prolongada, técnica consolidada e boa autorregulação. |
| `athlete` | Atleta / Alta performance | Treino orientado a competição ou desempenho específico. |

O nível é escolhido pelo aluno. Idade, carga ou tempo de prática não promovem/rebaixam automaticamente.

**Personal Trainer não é nível de treino.** É um papel possível de um futuro modo Personal. `athlete` também não significa que a pessoa é Personal Trainer ou apenas musculosa.

## Continuidade

| ID | Label |
|---|---|
| `active` | Treinando normalmente |
| `returning` | Voltando após uma pausa |

Ausência do campo em perfis antigos resolve como `active`. O fallback é apenas de leitura/view model: abrir um perfil antigo não o regrava destrutivamente.

## Retorno aos treinos

`ReturnToTrainingProfile` é opcional:

```ts
interface ReturnToTrainingProfile {
  previousLevel?: TrainingExperienceLevel
  breakDuration?: TrainingBreakDuration
  resumedAt?: string
  notes?: string
}
```

Faixas de pausa:

- `less_than_1_month` — Menos de 1 mês;
- `one_to_three_months` — Entre 1 e 3 meses;
- `three_to_six_months` — Entre 3 e 6 meses;
- `six_to_twelve_months` — Entre 6 e 12 meses;
- `more_than_1_year` — Mais de 1 ano.

`resumedAt` usa data civil `YYYY-MM-DD`, sem conversão UTC que possa trocar o dia, e não aceita data futura. `notes` tem limite de 500 caracteres e a UI orienta a não registrar diagnóstico ou dados médicos.

`previousLevel` permanece opcional. Ele acrescenta contexto quando o nível atual percebido é diferente do nível anterior, sem alterar automaticamente nenhum dos dois.

## Campos persistidos

`UserProfile` manteve `level`, `goal`, `frequency`, `duration`, equipamentos, restrições, focos e preferências. Foram adicionados somente campos ortogonais opcionais:

```ts
trainingStatus?: TrainingContinuityStatus
returnToTraining?: ReturnToTrainingProfile
trainingExperienceYears?: number
```

`trainingExperienceYears` aceita contexto aproximado entre 0 e 80 anos e não classifica o aluno. Valores fracionários continuam válidos quando fizerem sentido; não há exigência de precisão falsa.

`ResolvedTrainingProfile` é um view model derivado. Ele reúne nível, continuidade, objetivo, frequência e duração sem criar uma segunda cópia persistida desses dados.

## Labels e resolvers

Exemplos:

```text
beginner + active       -> Iniciante
intermediate + active   -> Intermediário
intermediate + returning -> Intermediário em retorno
advanced + returning    -> Avançado em retorno
athlete + returning     -> Atleta em retorno
```

APIs públicas:

- `getTrainingExperienceDefinition`;
- `getTrainingStatusDefinition`;
- `getTrainingBreakDurationDefinition`;
- `resolveTrainingProfile` / `normalizeTrainingProfile`;
- `getTrainingProfileDisplayName`;
- `validateReturnToTrainingProfile` / `validateTrainingProfile`;
- `isReturningToTraining`;
- `isValidCivilDate` / `getCurrentCivilDate`.

Resolvers não mutam o perfil e não retornam recomendação clínica.

## Onboarding progressivo

A antiga etapa de “nível atual” foi substituída por um bloco único de experiência e continuidade:

1. escolha do nível com descrições claras;
2. experiência aproximada opcional;
3. pergunta sobre retorno;
4. somente ao escolher retorno, aparece a faixa da pausa;
5. data, nível anterior e contexto são revelados por uma ação de detalhes opcionais.

O fluxo continua com oito passos. Não solicita diagnóstico, percentual de gordura, carga máxima ou informação médica detalhada.

## Edição posterior

A seção de configurações de `EvolutionDashboard` reutiliza o mesmo seletor e mostra um resumo compacto. Salvar usa `updateUserProfile`, que faz merge e aciona a persistência segura já existente.

- marcar `returning` não muda `level`;
- voltar para `active` apenas oculta os detalhes e não apaga `returnToTraining`;
- não foi criada ação de limpeza destrutiva, portanto não há dado apagado sem confirmação;
- o resumo deixa explícito que ajustes de volume são futuros.

## Persistência e compatibilidade

- chave: `gymflow:state:v1`;
- envelope preservado: `{ v: 1, savedAt, data }`;
- nenhum bump de versão, migração destrutiva ou IndexedDB;
- perfis antigos sem os campos novos continuam válidos;
- storage e export/import preservam campos desconhecidos/opcionais dentro de `user`;
- testes de roundtrip garantem que arrays existentes, `customPrograms`, treino ativo e histórico não mudam.

O usuário demo permanece sem `trainingStatus` gravado para também exercer o fallback legado `active`. Novos cadastros feitos pelo onboarding recebem o status escolhido; `registerUser` apenas transporta os três campos novos para `UserProfile`.

## Caso de referência anonimizado

```text
level: intermediate
trainingStatus: returning
breakDuration: three_to_six_months
trainingExperienceYears: 7
goal: hypertrophy
frequency: 5
duration: 75
```

Resultado: **Intermediário em retorno**. O nível continua `intermediate`; nenhuma série, repetição, prescrição, programa ou treino é alterado.

## Limitações e próximo incremento

O perfil é contexto descritivo, não diagnóstico. O GOAL-22 poderá consumir `experienceLevel`, `trainingStatus`, pausa, objetivo, frequência e duração para modelar volume e tempo. Essa dependência não autoriza antecipar regras de redução/aumento, deload ou mudança de treino neste GOAL.
