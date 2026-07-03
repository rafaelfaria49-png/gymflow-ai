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

---

## GOAL-04 — ActionBar fixa + fim das sobreposições (2026-07-03)

### Resumo

O FAB global "Continuar" (`BottomNavigation`) cobria conteúdo quando o usuário já estava dentro do próprio Treino Ativo. Ele foi escondido nessa tela e substituído por uma ActionBar fixa própria da página, que mostra a série atual/exercício e um botão "Continuar" que rola suavemente até a próxima série pendente (virando "Finalizar" quando todas as séries estão concluídas). Também corrigido o botão "Ver Técnica", que ficava `absolute` sobre o texto do placeholder de mídia 3D — agora é uma barra de rodapé em fluxo normal, sem overlap.

### Arquivos alterados

- `src/modules/ActiveWorkoutPage.tsx` — nova ActionBar fixa (`lg:hidden`) com "Série X de Y" + nome do exercício + botão Continuar/Finalizar; `handleContinue` com `scrollIntoView` + foco no input de carga; placeholder de mídia refeito em coluna (mídia em cima, botão "Ver Técnica" embaixo, sem `position: absolute`); `id="set-row-{id}"` em cada linha de série; container raiz trocado de `pb-24` para a nova classe `.pb-active-workout`.
- `src/components/Navigation.tsx` — FAB "Continuar"/"Treinar" agora é condicional (`showFab`), oculto quando `activeView === 'active-workout'` (a ActionBar da própria página assume esse papel ali).
- `src/app/globals.css` — nova classe `.pb-active-workout` (clearance da ActionBar + bottom nav + safe-area + folga de 16px).

### Como a ActionBar funciona

Fixa no rodapé (`bottom: calc(4.75rem + safe-area)`, mesma constante do FAB que substitui), visível só em mobile/tablet (`lg:hidden`). Mostra à esquerda "Série X de Y" + nome do próximo exercício pendente (ou "Treino Concluído"); à direita um botão que: (a) com séries pendentes, rola suavemente (`scrollIntoView({behavior:'smooth', block:'center'})`) até a primeira série não concluída e foca o input de carga (kg) dela; (b) com todas as séries concluídas, vira "Finalizar" e abre o modal de resumo já existente — sem lógica nova de finalização.

### Decisões

Ver `docs/DECISOES.md` (seção GOAL-04).

### Validações executadas

1. `grep -rn "alert(" src/` — vazio.
2. `grep -rn "confirm(" src/` — vazio (nenhum voltou).
3. `npx tsc --noEmit` — sem erros.
4. `npm run build` — passou (Next 16.2.6, Turbopack).
5. Dev server iniciado, `GET /` retornou 200 sem erros no log.
6. `npx eslint` nos arquivos alterados — mesmos 3 erros pré-existentes já registrados em `docs/PENDENCIAS.md` desde o GOAL-02 (`setState` em efeito do timer de descanso, aspas não escapadas no modal de resumo), nenhum novo introduzido.
7. Varredura de outros floatings (Tarefa 5) documentada em `docs/DECISOES.md` — nenhuma outra sobreposição óbvia encontrada além das duas corrigidas.
8. `git status` — nenhum arquivo em `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d` alterado; nenhum GOAL-05/GOAL-06 iniciado.

### Confirmação de escopo

Avatar Lab, POC 3D, backend, Supabase, pagamento real, timer de descanso, modelo de programas e motor de progressão não foram tocados. GOAL-05 e GOAL-06 não foram iniciados.

---

## GOAL-05 — Menu "Mais" na navegação mobile (2026-07-03)

### Resumo

No mobile, só 5 das 12 telas principais eram alcançáveis (a bottom nav tinha Hoje/Planejar/Exercícios/IA Coach/Evolução; Treinos, Vídeos, Nutrição, Feed, Assinatura e Admin não tinham nenhum caminho de navegação em telas pequenas). A bottom nav foi reduzida a 4 itens fixos + uma aba "Mais" que abre um bottom sheet próprio (grade 2 colunas) com as 6-7 telas restantes, cada uma alcançável em até 2 toques.

### Arquivos alterados

- `src/components/Navigation.tsx` — bottom nav com 4 itens fixos (Hoje/Planejar/Exercícios/Evolução) + aba "Mais"; novo componente `MoreMenuSheet` (bottom sheet com overlay, animação de subida, grade 2 colunas, botão X, fecha ao tocar fora ou ao selecionar um item); `MORE_MENU_ITEMS`/`MORE_MENU_VIEWS` como fonte única de verdade para o conteúdo do sheet e o estado ativo da aba "Mais".
- `src/app/globals.css` — nova animação `@keyframes sheetUp`/`.animate-sheet-up` para a subida do bottom sheet.

### Itens na bottom nav

Hoje (dashboard), Planejar (planner), Exercícios (exercises), Evolução (evolution), Mais.

### Itens no menu "Mais"

IA Coach, Treinos, Vídeos, Nutrição, Feed (community), Assinatura (premium), Admin (somente se `user.email === 'rafael.demo@gymflow.ai'`, mesma regra já usada na `SideNavigation` do desktop).

### Estado ativo da aba "Mais"

`isMoreActive = MORE_MENU_VIEWS.includes(activeView)` — a aba fica destacada sempre que `activeView` for uma das 7 views que moram no sheet (ai-coach, workouts, videos, nutrition, community, premium, admin), sem precisar listar as views duas vezes graças à constante compartilhada.

### Decisões

Ver `docs/DECISOES.md` (seção GOAL-05).

### Validações executadas

1. `grep -rn "alert(" src/` — vazio.
2. `grep -rn "confirm(" src/` — vazio.
3. `npx tsc --noEmit` — sem erros.
4. `npm run build` — passou (Next 16.2.6, Turbopack).
5. Dev server iniciado, `GET /` retornou 200 sem erros no log.
6. `npx eslint src/components/Navigation.tsx` — só o warning pré-existente `'Zap' is defined but never used` restou (o uso do `Menu` no botão "Mais" eliminou o outro warning pré-existente do mesmo arquivo).
7. Auditoria de views (Tarefa 6) documentada em `docs/DECISOES.md` — todas as 12 views pós-login alcançáveis; nenhuma órfã.
8. `git status` — nenhum arquivo em `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d` alterado; nenhum GOAL-06 iniciado.

### Confirmação de escopo

Avatar Lab, POC 3D, backend, Supabase, pagamento real, timer de descanso, modelo de programas e motor de progressão não foram tocados. GOAL-06 não foi iniciado.

---

## GOAL-06 — Timer de descanso + Wake Lock (2026-07-03)

### Resumo

Timer de descanso automático: ao marcar uma série como concluída (exceto se for a última série pendente do treino), inicia um descanso (padrão 90s, configurável, ou `restSec` do exercício se definido) que sobrevive a refresh, mostra tempo/progresso/+30s/Pular na ActionBar do GOAL-04 (mobile) ou no card já existente (desktop), e ao terminar dispara toast + vibração + beep opcional. Durante o treino ativo, o app tenta manter a tela acesa via Wake Lock API, com fallback silencioso onde não suportado.

### Arquivos alterados

- `src/types/index.ts` — `UserProfile.restTimerDefaultSeconds?`/`restTimerSoundEnabled?` (configurações); `Exercise.restSec?` (descanso sugerido por exercício).
- `src/providers/GymFlowContext.tsx` — estado do timer de descanso (`restTimerEndAt`/`restTimerTotalSeconds`/`restTimerLabel`/`restSecondsRemaining`) com hidratação e save no envelope do GOAL-01; `completeWorkoutSet` inicia o timer automaticamente; `extendRestTimer`/`skipRestTimer`; efeito de Wake Lock (`navigator.wakeLock`, re-adquire em `visibilitychange`, libera quando não há treino ativo); helper `playBeep()` via Web Audio API; `logout`/`finishWorkout`/`cancelWorkout` limpam o timer.
- `src/modules/ActiveWorkoutPage.tsx` — removido o timer local (estado, efeito, `handleStartRestTimer`); card de descanso desktop (`hidden lg:flex`) agora lê do contexto; ActionBar fixa mobile/tablet alterna entre modo "descanso" (tempo, barra de progresso, +30s, Pular) e modo "Série X de Y / Continuar-Finalizar" conforme `restSecondsRemaining`.
- `src/modules/EvolutionDashboard.tsx` — bloco "Timer de Descanso" na seção de Configurações: input de descanso padrão (segundos) e toggle de som, ambos via `updateUserProfile`.

### Como o timer funciona

Ao concluir uma série (checkbox na tabela), `completeWorkoutSet` verifica se ainda há alguma série pendente no treino inteiro; se sim, calcula a duração (`exercise.restSec` → `user.restTimerDefaultSeconds` → `90`) e grava `restTimerEndAt = Date.now() + duração`. Um efeito no contexto recalcula `restSecondsRemaining` a cada 250ms a partir desse timestamp (nunca por contador decrescente em memória). "+30s" soma 30s ao tempo restante atual; "Pular" zera o timer. Ao chegar a 0: toast de sucesso, `navigator.vibrate` (se suportado) e beep opcional (Web Audio API, respeita a configuração de som).

### Como persiste após refresh

Mesmo padrão do cronômetro do treino (GOAL-01): só o timestamp de término (`restTimerEndAt`) é persistido no envelope `gymflow:state:v1`, não um contador. Ao hidratar, se esse timestamp ainda está no futuro, o timer é restaurado e o tempo restante recalculado corretamente; se já passou (app ficou fechado além da duração do descanso), o timer é simplesmente descartado — sem timer negativo, sem replay de toast/vibração antigos.

### Wake Lock

`navigator.wakeLock.request('screen')` é tentado sempre que há treino ativo, com `try/catch` silencioso (não suportado, negado ou requer HTTPS — comum ao testar via IP local em HTTP no celular; ver `docs/DECISOES.md`). Re-adquirido no evento `visibilitychange` (o navegador libera o wake lock automaticamente ao trocar de aba). Liberado pelo cleanup do próprio `useEffect` quando `activeWorkout` deixa de existir — cobre finalizar, cancelar e logout sem código duplicado.

### Decisões

Ver `docs/DECISOES.md` (seção GOAL-06).

### Validações executadas

1. `grep -rn "alert(" src/` — vazio.
2. `grep -rn "confirm(" src/` — vazio.
3. `npx tsc --noEmit` — sem erros.
4. `npm run build` — passou (Next 16.2.6, Turbopack).
5. Dev server iniciado, `GET /` retornou 200 sem erros no log.
6. `npx eslint` nos arquivos alterados — 1 erro novo (`setState` em efeito do timer de descanso), mas reproduz exatamente o mesmo padrão já aceito do cronômetro do treino (`setWorkoutDuration(0)`); registrado em `docs/PENDENCIAS.md`. Nenhum outro problema novo (o cast `any` do Wake Lock foi evitado usando o tipo nativo `WakeLockSentinel`/`navigator.wakeLock` do `lib.dom.d.ts`).
7. `git status` — nenhum arquivo em `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d` alterado; nenhum GOAL-07 iniciado.

### Confirmação de escopo

Avatar Lab, POC 3D, backend, Supabase, pagamento real, modelo de programas e motor de progressão não foram tocados. GOAL-07 não foi iniciado.
