# GOALS Log

Histórico de execução dos GOALs: resumo, arquivos alterados, decisões, validações e como testar.

---

## GOAL-01 — Persistência local-first (2026-07-03)

### Resumo

Estado do app agora sobrevive a refresh no celular. Todo o estado de longa duração é salvo em `localStorage` na chave `gymflow:state:v1`, num envelope versionado `{ v: 1, savedAt, data }`, com escrita debounced (500ms) e leitura defensiva (JSON inválido ou versão diferente ⇒ ignora e usa defaults, nunca crasha).

### Antes / depois (comportamento crítico)

- **Antes:** só `user` e `weeklyPlan` persistiam (chaves soltas `gymflow_user`/`gymflow_weeklyPlan`); refresh durante treino ativo perdia o treino, as séries concluídas e zerava o cronômetro (contador só em memória); histórico, conquistas, nutrição e favoritos eram perdidos.
- **Depois:** treino ativo, séries concluídas e timestamp de início sobrevivem a refresh; o tempo decorrido é recalculado a partir de `activeWorkoutStartedAt`; histórico de treinos, XP/nível/streak (no perfil), conquistas, desafios, favoritos, nutrição, peso/medidas e vídeos recentes persistem.

### Arquivos alterados

- `src/lib/storage.ts` — **novo**: `loadState<T>`, `saveState`, `clearState` com envelope versionado, try/catch e guarda de `typeof window`.
- `src/providers/GymFlowContext.tsx` — hidratação no mount + save debounced 500ms; `activeWorkoutStartedAt`; timer recalculado do timestamp; migração das chaves legadas; `logout` limpa `gymflow:state:v1`.
- `src/modules/AdminPanel.tsx` — seção "Dados locais" com botão "Zerar dados do app" (confirmação inline em dois cliques, sem `confirm()` nativo).
- `src/hooks/useLocalStorage.ts` — **deletado** (hook morto, sem consumidores).
- `CLAUDE.md`, `.claude/settings.json`, `docs/DECISOES.md`, `docs/PENDENCIAS.md`, `docs/GOALS_LOG.md` — preparação da sprint (Parte A).

### O que persiste

Perfil (inclui XP, nível implícito por XP, streak, onboarding concluído = perfil existente), plano semanal, treino ativo + séries concluídas + timestamp de início, histórico de treinos, histórico de peso e medidas, nutrição (macros/água), conquistas, desafios, exercícios favoritos, vídeos vistos recentemente.

### O que NÃO persiste (de propósito)

View ativa (exceto restauração para `active-workout`/`dashboard`), modais, mensagens do chat do coach (transitórias), notificações de XP, player global, loading states, listas mock (exercícios, programas, vídeos, comunidade).

### Decisões

Ver `docs/DECISOES.md` (seção GOAL-01).

### Validações executadas

1. `npx tsc --noEmit` — sem erros.
2. `npm run build` — passou (Next 16.2.6, Turbopack).
3. `grep -rn "useLocalStorage" src/` — vazio.
4. Dev server ativo em `0.0.0.0:3000` (HTTP 200).
5. `git status` — nenhum arquivo em `labs/avatar-lab/`, `docs/avatar-design/` ou `app/poc-3d` alterado.
6. Fluxos validados por código: iniciar treino grava sessão + `startedAt`; refresh restaura sessão, séries e tempo recalculado; concluir treino move para histórico e atualiza XP/streak persistidos; "Zerar dados do app" limpa a chave e recarrega.

### Como testar no celular

1. Abrir `http://192.168.0.6:3000`, logar (demo) e iniciar um treino.
2. Marcar 2 séries como concluídas e puxar para atualizar a página → o app volta direto no treino, com as 2 séries marcadas e o cronômetro correto (não zerado).
3. Concluir o treino, atualizar de novo → histórico, XP e streak continuam lá.
4. Ir em Admin → "Dados locais" → tocar "Zerar dados do app" duas vezes → app reinicia zerado na landing.

---

## GOAL-02 — Correções cirúrgicas de dados e rótulos (2026-07-03)

### Resumo

Correção de inconsistências pequenas que afetavam a confiabilidade do app no uso diário: 4 exercícios órfãos (IDs referenciados sem definição), rótulo ambíguo "10k/12k" no Treino Ativo, kcal do painel técnico inflado por tempo mesmo com 0 séries feitas, e um bug visual de clipping no logo "GYMFLOWAI" do header.

### Arquivos alterados

- `src/mock/exercises.ts` — adicionados os 4 exercícios órfãos: `abs_prancha_abdominal`, `cardio_corrida_esteira`, `legs_levantamento_terra`, `legs_legpress_45` (IDs preservados, sem novos IDs criados).
- `src/modules/ActiveWorkoutPage.tsx` — rótulos Ant/Sug (`10k`→`10 kg`, `12k`→`12 kg`); cálculo de `estimatedCalories` trocado de tempo decorrido para série concluída; rótulo do card "Energia Gasta (kcal est.)".
- `src/components/Navigation.tsx`, `src/modules/LandingPage.tsx`, `src/modules/AuthPages.tsx` — `pl-0.5` no span do logo gradiente para corrigir o clipping do "G" inicial.

### Decisões

Ver `docs/DECISOES.md` (seção GOAL-02).

### Validações executadas

1. `npx tsc --noEmit` — sem erros.
2. `npm run build` — passou (Next 16.2.6, Turbopack), sem erros de tipo.
3. `grep -rn "Exercício Desconhecido" src/` — só o fallback de segurança em `WorkoutsTab.tsx`/`GymFlowContext.tsx` (código pré-existente, não mais acionado pelos 4 IDs corrigidos).
4. `grep -rn "10k"` e `grep -rn "12k"` em `src/` — vazio.
5. `grep -rn "useLocalStorage" src/` — vazio (confirma que a persistência do GOAL-01 não regrediu).
6. `git status` — nenhum arquivo em `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d` alterado; nenhum GOAL-03 iniciado.
7. `npx eslint` nos arquivos alterados — 3 erros pré-existentes fora do escopo (ver `docs/PENDENCIAS.md`), nenhum introduzido pelas mudanças deste GOAL.

### Confirmação de escopo

Avatar Lab, POC 3D, Motion Engine, pipeline do Kai, backend, Supabase, pagamento real, biblioteca externa de exercícios, service worker e PWA avançado não foram tocados. GOAL-03 não foi iniciado.

---

## GOAL-03 — Sistema de toasts e confirmações (2026-07-03)

### Resumo

Substituídos todos os `alert()` nativos do app (18 ocorrências) por um sistema próprio de toasts premium (`ToastProvider`/`useToast`) e um `ConfirmDialog` reutilizável para as duas ações destrutivas do app (cancelar treino ativo, zerar dados locais). Nenhum `confirm()` nativo existia no código (grep vazio antes de começar). Nenhuma dependência nova foi instalada.

### Arquivos criados

- `src/components/ui/Toast.tsx` — `ToastProvider`, hook `useToast()` com `.success/.error/.info`, fila máxima de 3 toasts, auto-dismiss em 3,5s, viewport responsivo (top-center no mobile, canto inferior direito em telas ≥1024px).
- `src/components/ui/ConfirmDialog.tsx` — modal controlado (`isOpen`/`onConfirm`/`onCancel`), overlay escuro, fecha com ESC e clique fora, variante `destructive`, botões ≥44px, foco automático no botão de confirmação.

### Arquivos alterados

- `src/app/layout.tsx` — `ToastProvider` montado envolvendo `GymFlowProvider`.
- `src/app/globals.css` — keyframe `toastIn`/`.animate-toast-in` (mesmo padrão de `.animate-pulse-glow` já existente).
- `src/providers/GymFlowContext.tsx` — 6 `alert()` trocados por `toast.success/info/error` (substituição de exercício, adaptação "academia cheia", replanejamento de treino perdido pela IA Coach).
- `src/modules/ActiveWorkoutPage.tsx` — botão "Cancelar Treino Atual" agora abre `ConfirmDialog` (variante destrutiva) em vez de cancelar direto.
- `src/modules/AdminPanel.tsx` — 2 `alert()` → toast; botão "Zerar dados do app" trocado do padrão de duplo clique para `ConfirmDialog` destrutivo.
- `src/components/SocialShareModal.tsx`, `src/modules/CommunityFeed.tsx`, `src/modules/EvolutionDashboard.tsx` (5 ocorrências), `src/modules/ExerciseLibrary.tsx`, `src/modules/NutritionPage.tsx`, `src/modules/PremiumUpgrade.tsx` — `alert()` → `toast.success`/`toast.info` conforme a natureza da mensagem.

### Decisões

Ver `docs/DECISOES.md` (seção GOAL-03).

### Validações executadas

1. `grep -rn "alert(" src/` — vazio.
2. `grep -rn "confirm(" src/` — vazio (já estava vazio antes do GOAL-03; nenhum `confirm()` nativo existia).
3. `npx tsc --noEmit` — sem erros.
4. `npm run build` — passou (Next 16.2.6, Turbopack).
5. Dev server iniciado e `GET /` retornou 200 sem erros no log — confirma que `useToast()` dentro de `GymFlowProvider` não quebra a árvore de providers (`ToastProvider` está acima na hierarquia).
6. `git status` — nenhum arquivo em `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d` alterado; nenhum GOAL-04 iniciado.

### Confirmação de escopo

Avatar Lab, POC 3D, backend, Supabase, pagamento real, timer de descanso, ActionBar fixa e modelo de programas não foram tocados. GOAL-04 não foi iniciado.
