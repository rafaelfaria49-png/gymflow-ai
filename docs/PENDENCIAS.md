# Pendências

Problemas encontrados fora do escopo dos GOALs — anotados aqui, não corrigidos.

- (2026-07-03, visto no GOAL-01) `GymFlowContext.tsx` e `AdminPanel.tsx` usam `alert()` nativo em código pré-existente (swap de exercício, replanejar semana, academia cheia, cadastro de exercício). A regra proíbe apenas em código novo; migrar para toasts em GOAL futuro.
- (2026-07-03) Exercícios criados no Admin não persistem (lista de exercícios volta ao mock após refresh) — fora do escopo do GOAL-01; decidir em GOAL futuro se exercícios admin entram no estado persistido.
- (2026-07-03, visto no GOAL-02) `eslint` aponta 3 erros pré-existentes fora do escopo: `setState` síncrono dentro de `useEffect` do timer de descanso em `ActiveWorkoutPage.tsx:40`, aspas não escapadas (`react/no-unescaped-entities`) em `ActiveWorkoutPage.tsx:524` e `LandingPage.tsx:230`, e `as any` no gerador programático de exercícios extras em `exercises.ts`. Nenhum foi introduzido pelo GOAL-02; `npm run build` passa normalmente pois o build não roda lint estrito nesses casos.
