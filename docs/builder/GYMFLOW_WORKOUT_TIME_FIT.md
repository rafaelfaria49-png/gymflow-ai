# Tempo disponível canônico e time-fit

Status: implementado no GOAL A de `GYMFLOW_BUILDER_TIME_FOCUS_IMPLEMENTATION_GOALS_001.md`, conforme os ADRs TF-001, TF-002 e TF-003 aceitos.

## Fonte de verdade

`ProgramDay.targetMinutes` é o tempo disponível canônico de cada dia. Ao abrir o Construtor, os call-sites usam esta precedência:

1. `day.targetMinutes` quando já existe;
2. `user.duration` quando disponível;
3. `defaultTargetMinutes(volumeProfile)` como fallback.

A duração estimada continua sendo uma saída derivada dos slots. Ela não semeia mais o tempo disponível e nunca altera o treino automaticamente.

## Regras puras

`src/lib/workout-time-fit.ts` concentra quatro operações puras:

- `resolveRecommendedVolumeProfile`: escolhe o perfil cuja faixa fica mais próxima do tempo informado; empates favorecem o menor limite mínimo;
- `analyzeVolumeProfileFit`: classifica o perfil escolhido como alinhado, próximo ou divergente;
- `estimateRecommendedExerciseRange`: deriva uma faixa operacional de exercícios, limitada a 1–12;
- `analyzeWorkoutTimeFit`: compara a estimativa atual com o tempo disponível e retorna estado vazio, abaixo, dentro ou acima, sempre com `assumptions` preenchidas.

Os limites adicionados a `training-volume-rules.ts` são: alvo de 10–240 min, tolerância de ±5 min, ajuste de 1 exercício a cada 10 min abaixo ou 15 min acima e faixa final de 1–12 exercícios. As faixas existentes de `DURATION_RULES` não foram alteradas.

As zonas de transição ficam intencionalmente estáveis: 46–47 min recomendam Compacto, 48–49 min recomendam Padrão, 66–67 min recomendam Padrão e 68–69 min recomendam Alto Volume.

## Interface do Construtor

- O perfil recomendado recebe o badge `Recomendado p/ N min`.
- Um perfil divergente exibe aviso textual; nenhuma sugestão muda perfil, tempo, séries ou exercícios.
- O campo personalizado usa o `onValidChange` existente do `NumericInput` somente para o rascunho visual. O preset deixa de aparecer selecionado durante a digitação; blur ou Enter confirmam o valor, e Escape restaura o valor anterior.
- O resumo mostra tempo disponível, faixa operacional, diferença estimada, faixa recomendada de exercícios, quantidade atual e sugestão textual. Dia vazio não exibe diferença.

## Compatibilidade e invariantes

`buildDurationWarning` permanece disponível e delega a decisão ao novo analisador no modo legado, preservando a mensagem anterior. Storage v1, migrações, shape de `ProgramDay`, seeds, progressão, treino ativo e histórico não mudaram.

A assinatura salva do Construtor é capturada somente após a normalização de abertura. Abrir um programa existente que precise apenas desse fallback não cria dirty-state artificial.

## Cobertura

Os testes de `workout-time-fit.test.ts` cobrem PART15 1–16, compatibilidade do caso acima com `buildDurationWarning`, zonas mortas, clamp 10/240, abertura normalizada sem dirty-state e invariância dos slots ao mudar tempo ou perfil. A precedência dos call-sites é verificada por revisão e pela busca obrigatória por semeaduras baseadas em estimativa.

O QA visual exercitou Costas + Bíceps com dois exercícios e 60 min, rascunho 17 sem preset selecionado, Alto Volume divergente e viewport de 360 px sem overflow horizontal.
