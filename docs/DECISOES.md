# Decisões

Registro de decisões tomadas com autonomia durante os GOALs (1 linha por decisão).

## GOAL-01 (2026-07-03)

- Hidratação: efeito único no mount do GymFlowContext carrega `gymflow:state:v1` e aplica campo a campo por cima dos defaults (arrays só se não-vazios), com flag `hydrated` bloqueando o save debounced até a carga terminar — evita que o primeiro render sobrescreva dados salvos e evita crash com estado parcial/antigo.
- Chaves legadas `gymflow_user`/`gymflow_weeklyPlan` são migradas para o novo envelope na primeira carga e removidas em seguida (usuário logado não perde a sessão na atualização).
- Tempo do treino ativo: persiste-se `activeWorkoutStartedAt` (timestamp ms); `workoutDuration` é sempre recalculado a partir dele (inclusive no tick do timer), nunca persistido como contador.
- Se há treino ativo salvo, o app restaura direto na view `active-workout`; senão, usuário logado cai no `dashboard` (comportamento anterior mantido).
- Persistidos além do pedido explícito: histórico de peso/medidas e vídeos vistos recentemente (mesma natureza de "histórico/favoritos"). NÃO persistidos: chat do coach (transitório), posts da comunidade, vídeos e exercícios (mock/admin) — voltam ao mock a cada sessão.
- `src/hooks/useLocalStorage.ts` deletado: nenhum consumidor no código (hook morto, substituído por `src/lib/storage.ts`).

## GOAL-02 (2026-07-03)

- Exercícios órfãos (`abs_prancha_abdominal`, `cardio_corrida_esteira`, `legs_levantamento_terra`, `legs_legpress_45`) criados em `src/mock/exercises.ts` com os mesmos IDs já referenciados em `programs.ts`/vídeos, mantendo o formato completo do tipo `Exercise` (execução, postura, erros comuns, substituições etc.).
- Rótulos Ant/Sug no Treino Ativo: trocado `10k`/`12k` por `10 kg`/`12 kg` (coluna tem espaço suficiente em 390px; `kg` explícito remove a ambiguidade sem precisar do prefixo `Ant`/`Sug` truncado).
- Kcal do Painel Técnico: cálculo trocado de "tempo decorrido" para "por série concluída" — 9 kcal/série para exercícios compostos (têm `secondaryMuscles`), 6 kcal/série para isolados (sem `secondaryMuscles`), 5 kcal/série para `muscleGroup === 'cardio'`; com 0 séries concluídas mostra sempre `0 kcal`. Rótulo do card passou a indicar "(kcal est.)".
- Header/logo cortado: causa raiz é `bg-clip-text` + `tracking-tighter` no texto gradiente "GYMFLOWAI", que faz o navegador cortar a lateral esquerda do primeiro glifo ("G") contra a borda do elemento. Corrigido adicionando `pl-0.5` ao span do logo em `Navigation.tsx` (TopBar), `LandingPage.tsx` e `AuthPages.tsx` (Login/Register), sem alterar layout do restante do header.
