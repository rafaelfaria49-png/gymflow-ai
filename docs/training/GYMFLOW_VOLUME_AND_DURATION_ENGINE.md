# Motor de volume, frequência e duração

## Propósito

O GOAL-22 cria uma camada pura para calcular e explicar:

- faixas semanais de referência por grupo muscular;
- séries diretas e exposição secundária;
- duração central e intervalo provável de uma sessão;
- capacidade aproximada dentro do tempo disponível;
- compatibilidade entre plano, perfil e duração.

O motor não edita `ExerciseSlot`, programas, planejamento, treino ativo, progressão ou histórico. Sugestões são textos reversíveis para uma confirmação futura. Nenhuma saída é diagnóstico, limite seguro universal ou promessa de resultado.

## Fontes de dados e compatibilidade

- Perfil: `TrainingProfileSource`, criado no GOAL-21.
- Taxonomia muscular: IDs e resolvers do GOAL-18A.
- Equipamentos: `equipmentIds` quando existem; caso contrário, `resolveLegacyEquipment`.
- Plano: `ExerciseSlot[]` e catálogo `Exercise[]` já existentes.
- Perfis de sessão: Compacto, Padrão e Alto Volume de `volumeProfiles.ts`.
- Duração legada: `estimateWorkoutDuration` continua com o mesmo shape e a mesma fórmula usada pelo Construtor e Planejador.

`ExerciseSlot` não recebeu campos obrigatórios. Storage, envelope v1, export/import, programas e catálogo não mudaram.

## Faixas semanais iniciais

São referências de produto para revisão profissional, não “volume mínimo efetivo” nem “máximo recuperável”. Os valores representam séries ponderadas semanais quando o plano informado corresponde à semana analisada.

| Experiência | Grupo grande (mín./alvo/cautela) | Grupo pequeno | Core | Corpo inteiro/funcional |
|---|---:|---:|---:|---:|
| Iniciante | 6 / 8 / 12 | 4 / 6 / 10 | 4 / 6 / 8 | 3 / 5 / 8 |
| Intermediário | 8 / 12 / 16 | 6 / 9 / 12 | 5 / 8 / 12 | 4 / 7 / 10 |
| Avançado | 10 / 14 / 20 | 8 / 12 / 16 | 6 / 10 / 14 | 5 / 8 / 12 |
| Atleta | 10 / 14 / 20 | 8 / 12 / 16 | 6 / 10 / 14 | 5 / 8 / 12 |

Classificação inicial:

- grandes: peito, costas, ombros, quadríceps, posteriores, glúteos e `legs_general`;
- pequenos: bíceps, tríceps, panturrilhas, antebraços, trapézio, adutores e abdutores;
- core: core e lombar;
- corpo inteiro: `full_body` e `functional`.

`legs_general` continua genérico; nunca vira quadríceps, posterior ou glúteo por inferência. Cardio e mobilidade retornam referência muscular `null`: devem ser avaliados por duração, densidade e objetivo, não por esta tabela.

Atleta usa inicialmente a mesma faixa de avançado. A classificação esportiva não autoriza volume extremo automático.

## Modificadores de retorno

O modificador atua somente na faixa inicial. O nível continua igual.

| Pausa | Fator heurístico |
|---|---:|
| Menos de 1 mês | 0,90 |
| 1–3 meses | 0,80 |
| 3–6 meses | 0,70 |
| 6–12 meses | 0,60 |
| Mais de 1 ano | 0,50 |

Os resultados são arredondados e mantidos monotônicos (`minimum <= target <= upperReference`). O fator não representa percentual de capacidade perdido. Retorno sem duração de pausa usa provisoriamente 0,70 e confidence baixa.

## Contagem de volume

Prioridade muscular:

1. `primaryMuscleGroupId`;
2. `muscleGroup` legado resolvido;
3. `secondaryMuscleGroupIds`;
4. `secondaryMuscles` legados resolvidos.

Fórmula:

```text
weightedSets = directSets + secondaryExposure
secondaryExposure = secondarySets × 0,5
```

O peso 0,5 é heurística configurável. Série direta e exposição secundária permanecem separadas. Séries marcadas futuramente como aquecimento, ou exercícios `type: warmup`, ficam em `warmupSets`; não entram no volume de trabalho. Exercícios ausentes ou grupos não resolvidos ficam em `unclassifiedSets` e reduzem confidence.

`weeklyOccurrences` é explícito. Na ausência do campo, o plano é contado uma vez por semana; o motor não multiplica automaticamente um treino de costas pela frequência total de cinco dias.

## Confidence

- `high`: repetições, descanso, taxonomia e equipamentos canônicos disponíveis;
- `medium`: defaults explicados ou classificação legada resolvida;
- `low`: exercício ausente, equipamento genérico/não resolvido, faixa inválida ou retorno sem duração de pausa.

O resultado agregado usa a menor confidence de suas partes. Ausência de dado nunca é preenchida com classificação muscular inventada.

## Duração detalhada

API nova:

```ts
estimateWorkoutDurationDetailed(slots, exercises, options)
```

Breakdown:

```text
total = trabalho + descanso + setup + transições + aquecimento opcional
```

### Trabalho

Para musculação:

```text
tempo da série = reps alvo × segundos por repetição + 8 s de overhead
```

- composto: 3,5 s/rep;
- isolador: 3,0 s/rep;
- funcional: 2,5 s/rep;
- fallback: 3,0 s/rep;
- intervalo dos bounds: 2,5–4,0 s/rep;
- unilateral/alternado: multiplicador operacional 1,25.

Esses valores estimam tempo, não prescrevem cadência. Sem faixa de repetições, o fallback legado de 40 s por série é usado com confidence baixa. Cardio usa minutos do `repRange`; core isométrico sem progressão usa segundos.

### Descanso

Prioridade:

1. `slot.restSec`;
2. `exercise.restSec`;
3. default informado pelo perfil/chamador;
4. fallback por objetivo ou 90 s.

Fallbacks por objetivo: hipertrofia 90 s, força 150 s, condicionamento/emagrecimento 60 s e atleta 105 s. O descanso real do slot nunca é alterado.

O adapter de objetivos também reconhece labels em português/inglês para retorno, saúde geral, resistência, mobilidade e performance. Valores desconhecidos caem em contexto geral com defaults explicados; `UserProfile.goal` e programas não são regravados.

```text
descanso do exercício = max(0, séries - 1) × restSec
```

Não há descanso completo após a última série: entra a transição, evitando dupla contagem.

### Setup e transição

Setup central por categoria varia de 15 s (peso corporal/solo) a 65 s (máquina plate-loaded). Barra + anilhas usa 90 s. Valores principais de transição:

| Situação | Segundos |
|---|---:|
| Mesmo equipamento comum | 25 |
| Barra/anilhas para barra/anilhas | 45 |
| Mesma categoria | 40 |
| Equipamentos diferentes | 60 |
| Entrada/saída de barra ou anilhas | 75 |
| Resolução genérica | +15 |

`equipmentIds` tem prioridade. Texto legado resolvido reduz confidence; resolução genérica reduz para `low`. O registry não foi alterado.

### Bounds e aquecimento

- aquecimento opcional: 300 s;
- fator inferior operacional: 0,82 para trabalho/setup/transição e 0,90 para descanso;
- fator superior: 1,25 para trabalho/setup/transição e 1,15 para descanso;
- bounds arredondam para minutos inteiros contendo a estimativa central.

## API legada

`estimateWorkoutDuration(slots, { includeWarmup })` continua retornando:

```ts
{ minutes, totalSeries, exerciseCount }
```

O wrapper chama o novo motor em modo de compatibilidade e preserva exatamente:

- 40 s de execução por série;
- descanso após cada série;
- 60 s entre exercícios;
- mínimo visual de 5 min em plano não vazio;
- aquecimento opcional de 5 min.

Assim, WorkoutBuilder, Planner, cards e programas antigos continuam com o comportamento atual até uma migração de produto explicitamente aprovada.

## Capacidade aproximada da sessão

`estimateSessionCapacity` reserva 5 min de aquecimento e pelo menos 18% do restante para setup/transições. Usa quatro séries por exercício como razão operacional e não escolhe exercícios.

Harness para intermediário ativo com defaults:

| Tempo | Séries alvo aproximadas | Exercícios alvo aproximados |
|---:|---:|---:|
| 30 min | 11 | 2 |
| 45 min | 18 | 4 |
| 60 min | 25 | 6 |
| 75 min | 32 | 8 |
| 90 min | 38 | 9 |

Defaults de descanso por experiência: iniciante 75 s, intermediário 90 s, avançado 105 s e atleta 105 s. Avançado/atleta não ganham capacidade maior automaticamente. Em retorno, o motor reserva 5–20 s adicionais por intervalo conforme a pausa; isso é margem operacional, não afirmação de perda física.

## Assessment

`assessTrainingPlanAgainstProfile` retorna:

- `fits`;
- `tight`;
- `exceeds_time`;
- `low_volume`;
- `high_volume`;
- `insufficient_data`.

Precedência: dados insuficientes, tempo excedido, volume acima da cautela, volume abaixo, pouca margem e, por fim, `fits`. Warnings adicionais coexistem mesmo quando o status principal é outro.

Sugestões possíveis: revisar uma série de acessórios, usar menos exercícios, dividir grupos em outro dia, escolher organização compacta, aumentar o tempo ou manter como está aceitando duração maior. Nenhuma sugestão é aplicada.

## Caso real anonimizado

Perfil: intermediário em retorno após 3–6 meses, hipertrofia, cinco sessões e 60–75 min. Fixtures totalmente classificadas, 4 séries de 8–12 reps:

| Plano | Trabalho | Descanso | Transição | Setup | Central | Bounds | Status |
|---|---:|---:|---:|---:|---:|---:|---|
| 4 costas + 4 bíceps (32 séries) | 22 min | 39 min | 7 min | 6 min | 74 min | 60–93 min | `exceeds_time` para 60 min |
| 4 costas + 5 bíceps (36 séries) | 24 min | 43 min | 8 min | 7 min | 82 min | 66–104 min | `exceeds_time` para 75 min |

O motor explica que descanso, quantidade de exercícios, setup e transições alongam a sessão. Ele oferece alternativas, preserva todas as 32/36 séries e não classifica a escolha como errada.

## Warnings honestos

O motor pode informar tempo excedido, descanso dominante, muitos exercícios, volume acima/abaixo da referência, classificação legada, retorno e variação por lotação. Não usa “treino perigoso”, “volume seguro”, promessa de hipertrofia, previsão de lesão ou diagnóstico médico.

## Limitações

- Os 126 exercícios ainda dependem majoritariamente de classificação legada; GOAL-33A aumentará confidence.
- Faixas, fatores e tempos são heurísticas iniciais de produto e exigem revisão profissional antes de uso público.
- O motor não conhece supersets, técnicas avançadas, espera real por aparelho ou aquecimentos específicos.
- Um dia de treino não representa automaticamente a semana inteira; `weeklyOccurrences` precisa refletir o plano analisado.
- Objetivo altera explicações/defaults de descanso, não reescreve volume ou programas.

## Compatibilidade e o que não foi feito

- nenhum programa, exercício, slot, série, repetição, carga ou descanso foi alterado;
- progressão, treino ativo, histórico e planejamento não mudaram;
- storage/localStorage v1 e export/import não mudaram;
- nenhum campo obrigatório ou dependência foi adicionado;
- nenhuma UI ou botão “Aplicar” foi criado.

GOAL-19A e GOAL-20 poderão consumir este motor somente após revisão e aprovação do Gate G2.

## Proposta para o Gate G2 — não aprovada

O Founder deve revisar explicitamente:

1. a tabela semanal por nível e classe muscular;
2. fatores de retorno 0,90 / 0,80 / 0,70 / 0,60 / 0,50;
3. exposição secundária ponderada em 0,5;
4. fórmula de duração e bounds;
5. descansos fallback por objetivo/experiência;
6. setups e transições, especialmente barra/anilhas;
7. atleta igual a avançado na referência inicial;
8. confidence reduzida e ausência de números musculares para dados não classificáveis;
9. resultado do cenário real: 74 min para 32 séries e 82 min para 36;
10. catálogo de sugestões permitidas, sempre sem aplicação automática.

Este documento prepara o Gate G2; não registra aprovação. GOAL-19A não deve começar antes da revisão do Founder.
