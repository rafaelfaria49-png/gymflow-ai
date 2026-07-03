# Decisões

Registro de decisões tomadas com autonomia durante os GOALs (1 linha por decisão).

## GOAL-01 (2026-07-03)

- Hidratação: efeito único no mount do GymFlowContext carrega `gymflow:state:v1` e aplica campo a campo por cima dos defaults (arrays só se não-vazios), com flag `hydrated` bloqueando o save debounced até a carga terminar — evita que o primeiro render sobrescreva dados salvos e evita crash com estado parcial/antigo.
- Chaves legadas `gymflow_user`/`gymflow_weeklyPlan` são migradas para o novo envelope na primeira carga e removidas em seguida (usuário logado não perde a sessão na atualização).
- Tempo do treino ativo: persiste-se `activeWorkoutStartedAt` (timestamp ms); `workoutDuration` é sempre recalculado a partir dele (inclusive no tick do timer), nunca persistido como contador.
- Se há treino ativo salvo, o app restaura direto na view `active-workout`; senão, usuário logado cai no `dashboard` (comportamento anterior mantido).
- Persistidos além do pedido explícito: histórico de peso/medidas e vídeos vistos recentemente (mesma natureza de "histórico/favoritos"). NÃO persistidos: chat do coach (transitório), posts da comunidade, vídeos e exercícios (mock/admin) — voltam ao mock a cada sessão.
- `src/hooks/useLocalStorage.ts` deletado: nenhum consumidor no código (hook morto, substituído por `src/lib/storage.ts`).
