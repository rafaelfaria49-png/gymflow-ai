# GOALS Log

Histórico de execução dos GOALs: resumo, arquivos alterados, decisões, validações e como testar.

---

## GOAL-19A — Construtor de treino multi-dia (2026-07-17)

### Resumo

O Construtor deixou de criar "um programa = um dia" e passou a montar **programas com vários
dias**: Dia 1..N gerados automaticamente, foco muscular por dia (taxonomia do GOAL-18A), nomes
automáticos honestos com nome customizado opcional, slots isolados por dia, estimativa de
duração e volume por dia (motor do GOAL-22) e uma análise do programa inteiro com o volume
semanal por grupo comparado à referência do perfil (GOAL-21).

**Gate G2: aprovado pelo Founder** — pré-requisito deste GOAL.

A regra do GOAL-10.5 ("nunca agrupar dias no mesmo programa para não sobrescrever um dia irmão")
ficou obsoleta: o Construtor agora carrega o **programa inteiro**, então os irmãos são editados
juntos e nenhum se perde. `weeks[0].days` é a fonte canônica; a lista achatada
`WorkoutProgram.exercises` nunca é recriada.

Nada é escolhido, sugerido ou alterado automaticamente. Todo aviso é textual.

### Descoberta que moldou o GOAL

**Nenhum dos 126 exercícios tem `primaryMuscleGroupId`** — todos resolvem pelo campo legado
`muscleGroup`, e os 23 de perna colapsam em `legs_general`. Ou seja, **nada resolve para
quadríceps ou posterior de coxa**. Sem tratamento, o filtro "Foco do dia" devolveria lista vazia
ao focar Quadríceps, e a análise afirmaria *"não possui trabalho direto para posterior"* com a
Mesa Flexora no dia — falso. `LEGACY_GENERIC_COVERAGE` resolve dizendo apenas "não é possível
afirmar nem negar", sempre exibindo a origem legada. Glúteos/panturrilhas têm grupo legado
próprio, então a ausência deles continua sendo afirmada. Cura definitiva: **GOAL-33A**.

### Arquivos

- Tipos: `src/types/workout-builder.ts` (novo), `src/types/index.ts` (campos aditivos e opcionais em `ProgramDay`).
- Domínio: `src/lib/workout-builder-id.ts`, `src/lib/workout-day-naming.ts`, `src/lib/workout-program-normalization.ts`, `src/lib/workout-builder.ts` (todos novos).
- UI: `src/components/workout-builder/{WorkoutProgramDetails,WorkoutDayTabs,WorkoutDayFocusSelector,WorkoutDayActions,WorkoutDaySummary,WorkoutDaysEditor,WorkoutProgramSummary,ExercisePickerModal,StartDayPicker}.tsx` (novos), `src/modules/WorkoutBuilder.tsx` (reescrito).
- Consumo mínimo: `src/providers/GymFlowContext.tsx` (3 linhas: import + `programDayDisplayLabel` em `buildWeekFromProgram`/`assignDayToWeekday`), `src/modules/PlannerView.tsx`, `src/modules/WorkoutsTab.tsx`.
- Testes: `src/lib/workout-builder.test.ts`, `src/lib/workout-day-naming.test.ts`, `src/lib/workout-program-normalization.test.ts`.
- Documentação: `docs/builder/GYMFLOW_MULTI_DAY_WORKOUT_BUILDER.md`, `docs/DECISOES.md`, `docs/PENDENCIAS.md`, `docs/GOALS_LOG.md`.

`openWorkoutBuilder` **não mudou de assinatura** — `programId` passou a significar "edite este
programa" e `dayId` "abra neste dia", então os chamadores existentes já abrem o programa inteiro.

### Validações

- `npx vitest run`: 18 arquivos, **391 testes** aprovados (252 anteriores + 139 novos). Nenhum teste anterior alterado ou removido.
- `npx tsc --noEmit`: aprovado.
- ESLint nos arquivos novos/reescritos: **zero erros e zero warnings**. Os 12 problemas (9 erros, 3 warnings) restantes em `GymFlowContext.tsx` são **pré-existentes** — o baseline `7495225` produz a mesma contagem, com as linhas deslocadas exatamente pelas 3 que este GOAL adicionou.
- `npm run build` e `npm run build:mobile`: aprovados. `cap:sync`/`android:build` não executados.
- `rg -n "alert\(|confirm\(" src`: zero `alert()`/`confirm()` nativos.
- `git diff --check`: limpo.
- Hashes idênticos ao pré-flight: `src/mock/exercises.ts`, `src/mock/programs.ts`, `src/lib/progression.ts`, `src/lib/storage.ts`.

### Teste manual (navegador, dev server em `:3000`)

Programa de 4 dias criado do zero: focos selecionados, nomes automáticos conferidos
("Peito e Tríceps", "Costas e Bíceps", "Quadríceps e Panturrilhas", "Ombros, Posterior de coxa e
Glúteos"), nome customizado aplicado no Dia 4, exercícios adicionados por dia, alternância entre
dias sem perda de slot, duplicação (renumerou 4→5 e inseriu a cópia logo após a original),
reordenação (Dia 2 → Dia 1, ids estáveis), remoção via `ConfirmDialog` informando os exercícios,
estimativas e análise conferidas, salvo, **página recarregada**, reaberto — os 4 dias, o foco, o
nome customizado e os slots voltaram intactos. "Salvar e Planejar", Planner (os 4 dias aparecem
como "Dia N — Nome"; dias seed seguem "Dia A — …" inalterados) e "Iniciar Agora" (pergunta qual
dia; iniciar o Dia 3 carregou os slots do Dia 3 e a sessão virou "Meu ABCD Multi-dia — Dia 3 ·
Quadríceps e Panturrilhas"). Saída com alterações pediu confirmação; "Continuar editando"
preservou o draft. **Zero erros e zero warnings no console.**

### Próximo passo

**GOAL-19B** — templates, criação guiada e refinamento do construtor multi-dia. Não iniciado.

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

---

## GOAL-07 — Programa → Semana → Dia → Slot + Planejador real (2026-07-03)

### Resumo

Programas ganharam estrutura real (`Program → Week → Day → ExerciseSlot`) e o planejador deixou de cair em treino genérico: cada dia planejado referencia um `ProgramDay` real e abre o Treino Ativo com exatamente os slots daquele dia (exercícios, séries, faixa de reps, RPE alvo e descanso corretos).

### Antes / depois (comportamento crítico)

- **Antes:** programas eram uma lista achatada de exercícios; o planejador gerava dias a partir de templates soltos sem `programId`, e tocar num dia abria um treino genérico de 1 exercício ("Treino Livre" disfarçado). O timer de descanso vinha só do `Exercise.restSec` ou do default.
- **Depois:** `weeks[].days[].slots[]` em todos os 12 programas; semana gerada (IA ou "Planejar Semana" no programa) carrega `programId` + `programDayId` por dia; abrir Segunda ≠ abrir Terça (Days diferentes → treinos diferentes); dia de descanso não tem botão de iniciar; o `restSec` do slot alimenta o timer do GOAL-06 com prioridade máxima.

### Arquivos alterados

- `src/types/index.ts` — novos tipos `ExerciseSlot`, `ProgramDay`, `ProgramWeek`, `ProgressionType`; `WorkoutProgram` ganhou `repeatWeeks`/`weeks`; `WeeklyWorkoutDay.programDayId`; `ActiveExercise` ganhou `repRange`/`targetRPE`/`restSec` opcionais.
- `src/mock/programs.ts` — helpers `comp/iso/core/cardio` e migração dos 12 programas para `weeks` (IDs e exercícios existentes preservados; nenhum exercício inventado).
- `src/providers/GymFlowContext.tsx` — `startWorkout(programId, customName, programDayId)` monta o treino pelos slots do Day; `buildWeekFromProgram` + `selectProgramForProfile` + `applyProgramToWeek`; `generateWeeklyPlan` reescrito para usar programas reais; login demo/registro geram plano real; timer de descanso prioriza `restSec` do slot (0 = sem timer).
- `src/modules/PlannerView.tsx` — Play passa `programDayId`; editar/alternar descanso limpa vínculo com o programa; duplicar preserva `programDayId`.
- `src/modules/WorkoutsTab.tsx` — modal mostra a divisão real por Days (séries × faixa, descanso, RPE), botão "Iniciar" por Day e botão "Planejar Semana" (applyProgramToWeek).
- `src/modules/ActiveWorkoutPage.tsx` — cabeçalho do exercício mostra a meta real do slot (faixa de reps, RPE, descanso) quando presente.

### Validações executadas

1. `grep -rn "alert(" src/` e `grep -rn "confirm(" src/` — vazios.
2. `npx tsc --noEmit` — sem erros.
3. `npm run build` — passou (Next 16.2.6, Turbopack).
4. Cross-check automatizado: todos os `exerciseId` usados nos slots existem em `src/mock/exercises.ts`.
5. Compatibilidade validada por código: plano antigo salvo (sem `programDayId`) abre o primeiro Day quando há `programId`, mantém comportamento anterior sem `programId`, e nunca crasha (campos novos opcionais); persistência GOAL-01, timer GOAL-06, ActionBar GOAL-04 e toasts GOAL-03 não alterados estruturalmente.
6. Nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/` ou `app/poc-3d` alterado.

### Como testar no celular

1. Ir em Programas → abrir um programa intermediário/avançado → ver a divisão por dias → tocar "Planejar Semana".
2. No Planejador, tocar Play na Segunda e depois (cancelando) na Terça → treinos diferentes, com os exercícios exatos de cada Day.
3. Concluir uma série → o timer de descanso usa o descanso do slot (ex.: 120s composto, 75s isolado, 180s força).
4. Dia de descanso não tem botão de iniciar treino.

---

## GOAL-08 — Progressão determinística + testes (2026-07-03)

### Resumo

Motor determinístico de progressão de carga/reps (`src/lib/progression.ts`, função pura `suggestNext`) alimentado pelo histórico real de treinos concluídos (persistido desde o GOAL-01), com suíte de testes em vitest e integração nas colunas ANT/SUG do Treino Ativo.

### Regra implementada

1. Sem histórico (ou só séries não concluídas): `pesoKg: null`, `repsAlvo` = piso do repRange, motivo honesto.
2. Última sessão bateu o TETO do repRange em todas as séries concluídas e RPE ≤ targetRPE (RPE ausente conta como ok, declarado no motivo): subir `incrementKg` e voltar ao piso da faixa.
3. Abaixo do PISO em 2 sessões consecutivas: deload de 10%.
4. Caso contrário: manter carga e subir reps (+1 sobre a menor reps concluída, teto = repRange[1]); RPE acima do alvo trava a subida de carga mesmo no teto da faixa.
5. `progression: 'nenhuma'`: sugestão neutra sem carga.
6. Toda carga sugerida é arredondada para múltiplos de 0.5 kg; nunca crasha com peso/RPE/histórico ausentes ou malformados.

### Antes / depois (comportamento crítico)

- **Antes:** colunas ANT/SUG do Treino Ativo eram fabricadas (10 kg / 12 kg hardcoded em `startWorkout`), sem relação com o histórico; texto "Sugestão IA: Carga progressiva" sem base real.
- **Depois:** ANT = maior carga concluída da última sessão real daquele exercício ("—" sem histórico); SUG = saída do motor determinístico ("—" quando não aplicável); séries pré-preenchidas com a sugestão (fallback: última carga → 10 kg); cabeçalho mostra "Progressão recomendada: <motivo>".

### Arquivos criados/alterados

- `src/lib/progression.ts` — **novo**: `suggestNext`, `lastRecordedWeight`, `roundToHalfKg`, tipos `ExerciseSessionHistory`/`HistorySet`/`ProgressionSuggestion`.
- `src/lib/progression.test.ts` — **novo**: 15 testes (histórico vazio, progressão de peso, RPE alto, deload, 1 sessão ruim, +1 rep, teto da faixa, RPE ausente, peso ausente, histórico malformado, progression nenhuma, arredondamento 0.5 kg, helpers).
- `package.json` — vitest como devDependency + script `"test": "vitest run"`.
- `src/providers/GymFlowContext.tsx` — `exerciseHistoryFor` (histórico por exercício a partir do `workoutHistory` persistido) e `startWorkout` integrando o motor nos 3 caminhos (slots, legado, treino livre).
- `src/types/index.ts` — `ActiveExercise.progressionNote?`.
- `src/modules/ActiveWorkoutPage.tsx` — ANT/SUG honestos com "—", motivo do motor no cabeçalho, remoção do texto "Sugestão IA".

### Validações executadas

1. `grep -rn "alert(" src/` e `grep -rn "confirm(" src/` — vazios.
2. `npx vitest run` — 15/15 testes passando.
3. `npx tsc --noEmit` — sem erros.
4. `npm run build` — passou (Next 16.2.6, Turbopack).
5. Histórico antigo compatível: campos de `HistorySet` todos opcionais, nenhuma migração de formato.
6. Nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/` ou `app/poc-3d` alterado.

### Como testar no celular

1. Concluir um treino de programa registrando cargas (ex.: supino 40 kg × 10 reps em todas as séries, RPE ≤ 8).
2. Iniciar o mesmo Day de novo → ANT mostra 40 kg, SUG mostra 42.5 kg e as séries vêm pré-preenchidas com 42.5 kg × 8 reps, com o motivo no cabeçalho.
3. Exercício nunca treinado → ANT e SUG mostram "—".

---

## GOAL-09 — Biblioteca real de exercícios (2026-07-03)

Substituição dos 68 exercícios placeholder gerados por loop por uma biblioteca real de 125 exercícios curados do dataset público free-exercise-db, com instruções PT-BR de qualidade personal, 250 imagens locais e compatibilidade total com os programas.

### Antes / depois

- **Antes:** 29 exercícios reais + loop `for` gerando 68 placeholders "Exercício Extra CHEST #12 (Polia)" com instruções genéricas e substitutos `extra_*` fictícios; nenhuma imagem.
- **Depois:** 125 exercícios reais (97 a mais que os 28 "reais + placeholders" úteis), todos com 4-6 passos de execução, postura, respiração, erros comuns + correções, variações, substitutos válidos e alertas de segurança; 2 fotos locais por exercício exibidas na biblioteca, no modal de técnica e no treino ativo.

### Números

- Exercícios: 29 reais (+68 placeholders) → **125 reais** (placeholders: **0**).
- Imagens locais baixadas: **250** (125 × 2) em `public/assets/exercises/<id>/{0,1}.jpg`.
- Grupos cobertos: chest 15, back 17, shoulders 12, biceps 11, triceps 10, legs 23, glutes 6, calves 5, abs 10, cardio 7, functional 4, mobility 5.

### Arquivos criados/alterados

- `scripts/import-exercises.mjs` — **novo**: importador reexecutável (dataset + fallback de URL, download atômico de imagens, modo `--check`); aborta com erro claro sem corromper arquivos se a rede falhar.
- `public/assets/exercises/**` — **novo**: 250 imagens locais.
- `src/mock/exercises.ts` — regenerado: `BASE_EXERCISES` (29 originais preservados, IDs intactos) + `EXPANSION_EXERCISES` (96 novos autorados em PT-BR); loop gerador removido; `withLocalImages` injeta `images` locais.
- `src/types/index.ts` — `Exercise.images?: string[]`.
- `src/components/ExerciseMedia.tsx` — **novo**: fotos com crossfade (3s), selo "Demonstração 3D em breve", fallback honesto no `AvatarDemoPlaceholder`.
- `src/modules/ExerciseLibrary.tsx` — card com foto real (fallback honesto) e modal de técnica com crossfade + selo, mantendo checklist/erros/correções/dica.
- `src/modules/ActiveWorkoutPage.tsx` — box "Demonstração 3D em produção" agora mostra as fotos do exercício com crossfade + selo; sem fingir avatar final.
- `src/mock/exercises.test.ts` — **novo**: cross-check automatizado (≥120 exercícios, IDs únicos, campos obrigatórios, imagem local existente em disco, substitutions e slots de programas apontando para IDs existentes, zero placeholders).

### Compatibilidade com programas

- Todos os 20 `exerciseId` usados por `MOCK_PROGRAMS` (slots das weeks + lista legada) pertencem aos 29 originais preservados — nenhum alias necessário. Garantido por teste automatizado, não por inspeção manual.

### Validações executadas

1. `grep -rn "Exercício Extra" src/` — vazio; `grep -rn -i "placeholder" src/mock/exercises.ts` — vazio; `grep -rn "alert(" src/` e `confirm(` — vazios (apenas ConfirmDialog próprio).
2. `node scripts/import-exercises.mjs --check` — 125/125 existem no dataset com imagens.
3. `npx vitest run` — 22/22 (16 do motor de progressão GOAL-08 intactos + 6 novos).
4. `npx tsc --noEmit` — sem erros.
5. `npm run build` — passou (Next 16.2.6, Turbopack).
6. Nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d`, GLBs ou pipeline do Kai alterado.

## GOAL-10 — PWA completo (2026-07-04)

App agora é instalável ("Adicionar à tela inicial") em modo standalone, com ícones reais (192/512 + maskable + apple-touch-icon) e um service worker manual (sem `next-pwa`) cacheando os estáticos do build e a biblioteca de exercícios, com fallback offline para a shell.

### Antes / depois

- **Antes:** `app/manifest.ts` já existia com nome/cores/display corretos, mas os únicos ícones declarados eram o `icon.svg` (marca "haltere") e o `favicon.ico` — nenhum PNG 192/512/maskable, nenhum `apple-touch-icon` explícito, e nenhum service worker (app só funcionava 100% online).
- **Depois:** 5 PNGs gerados por script (`icon-192`, `icon-512`, `maskable-192`, `maskable-512`, `apple-touch-icon`) com um monograma "G" vetorial (verde-lima sobre fundo escuro); manifest referenciando os 4 primeiros; `layout.tsx` com `<link rel="apple-touch-icon">` via `metadata.icons.apple`; `public/sw.js` registrado somente em produção, cache-first para estáticos/ícones/exercícios e network-first com fallback de shell para navegação.

### Arquivos criados/alterados

- `scripts/generate-icons.mjs` — **novo**: desenha o monograma G em SVG (sem fonte/arquivo externo) e rasteriza via `sharp` para os 5 PNGs em `public/icons/`. Reexecutável (`node scripts/generate-icons.mjs`).
- `public/icons/icon-192.png`, `icon-512.png`, `maskable-192.png`, `maskable-512.png`, `apple-touch-icon.png` — **novos**.
- `src/app/manifest.ts` — `icons` substituído pelos 4 PNGs novos (`any` 192/512 + `maskable` 192/512); demais campos (name, short_name, display, orientation, start_url, description, cores, categories) mantidos como já estavam.
- `src/app/layout.tsx` — adicionado `metadata.icons.apple` apontando para `/icons/apple-touch-icon.png`; `metadata`/`viewport` (theme-color, appleWebApp, colorScheme) mantidos como já estavam.
- `src/components/ServiceWorkerRegister.tsx` — **novo**: client component minúsculo, registra `/sw.js` só quando `process.env.NODE_ENV === 'production'`; montado em `layout.tsx` ao lado do `ToastProvider`.
- `public/sw.js` — **novo**: cache `gymflow-v1`; cache-first para `/_next/static/`, `/icons/` e `/assets/exercises/`; network-first com fallback para cache e depois para a shell (`/`) em navegações; `activate` apaga qualquer cache com nome diferente de `gymflow-v1`.
- `package.json` — `sharp` adicionado como devDependency (só usada pelo script de geração de ícones, não entra no bundle do app).
- `docs/DECISOES.md`, `docs/GOALS_LOG.md` — este registro.

### Validações executadas

1. `npm run build` — passou (Next 16.2.6, Turbopack); rotas geradas incluem `○ /manifest.webmanifest`.
2. `npm run start` + checagem HTTP real do HTML servido: exatamente um `<link rel="manifest" href="/manifest.webmanifest">`, um `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`, `<meta name="theme-color" content="#09090b">` e as meta tags `apple-mobile-web-app-*`; os 5 PNGs e `/sw.js` respondem HTTP 200; `/manifest.webmanifest` contém os 4 ícones novos com `sizes`/`purpose` corretos.
3. Confirmado por grep no bundle de produção (`.next/static/chunks/`) que a chamada `navigator.serviceWorker.register('/sw.js')` está presente no client build (o guard de `NODE_ENV` é resolvido em tempo de build pelo Next, então só o build de produção a inclui).
4. `npx tsc --noEmit` — sem erros.
5. `npx vitest run` — 22/22 (inalterado; nenhum teste novo era esperado para infraestrutura de PWA).
6. `grep -rn "alert(" src/` e `grep -rn "confirm(" src/` — ambos vazios.
7. Nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d`, GLBs, pipeline do Kai, backend, Supabase ou pagamento alterado; biblioteca de exercícios e motor de progressão intocados.

## GOAL-10.5 — Construtor de Treino + correção de volume dos treinos (2026-07-04)

### Resumo

Corrigida a divergência entre o número de exercícios prometido no card "Treino do Dia" e o que o Treino Ativo de fato carregava. Criado um Construtor de Treino manual completo (criar do zero, editar um treino sugerido, salvar como treino próprio, planejar num dia da semana, iniciar exatamente o que foi montado), com perfis de volume (Compacto/Padrão/Alto Volume) e um estimador de duração honesto que nunca corta exercícios sozinho — só avisa. Programas padrão de Peito/Tríceps reforçados para bater com o volume real. Faixas brancas nas fotos de exercício corrigidas.

### Causa raiz do bug 5 → 3 exercícios

Duas divergências independentes da mesma fonte de verdade (`ProgramDay.slots`):

1. `Dashboard.tsx` calculava o número exibido a partir da lista achatada legada `WorkoutProgram.exercises` (documentada no próprio código como "mantida para compatibilidade de exibição"), não de nenhum Day real — para `prog_int_1` essa lista tinha 5 itens.
2. O botão "Começar Treino" chamava `startWorkout(program.id, program.name)` **sem `programDayId`**, então `GymFlowContext.startWorkout` caía no fallback `allDays[0]` — o primeiro Day do programa, com apenas 3 slots.

O Planejador já fazia certo (usava `weeklyPlan[].programDayId`); só o Dashboard tinha essa leitura paralela. Detalhe completo em `docs/DECISOES.md`.

### Antes / depois (comportamento crítico)

- **Antes:** card do Dashboard mostrava a contagem da lista achatada do programa (não do Day); "Começar Treino" sempre abria o primeiro Day do programa, independente do que o card prometia; `PlannerView` fabricava `exerciseCount` (`4` ou `grupos × 2`) ao alternar/editar um dia, sem exercícios reais por trás; não havia nenhuma forma de montar um treino manualmente.
- **Depois:** Dashboard, Planejador e Treino Ativo leem o MESMO `ProgramDay.slots` através de `todayPlan`/`estimateWorkoutDuration`/`muscleGroupsForSlots` — o número exibido é sempre o número real. Alternar/editar um dia sem vínculo real fica honestamente "Sem treino definido" (0 exercícios) em vez de fabricar um número. Novo Construtor de Treino permite criar, editar, salvar, planejar e iniciar treinos reais, com perfis de volume e aviso de duração sem cortar exercícios.

### Arquivos criados

- `src/lib/volumeProfiles.ts` — perfis Compacto/Padrão/Alto Volume (faixas de minutos/exercícios) + `defaultTargetMinutes`.
- `src/lib/workoutDuration.ts` — `estimateWorkoutDuration` (minutos/séries/exercícios a partir dos slots reais), `muscleGroupsForSlots` (grupos musculares sempre derivados dos exercícios, nunca um campo solto) e `buildDurationWarning` (avisa sem cortar).
- `src/modules/WorkoutBuilder.tsx` — Construtor de Treino manual: nome/nível/perfil de volume/tempo alvo; biblioteca de exercícios com busca e filtro por músculo; editor por exercício (séries, faixa de reps, RPE, descanso, progressão, incremento); reordenar (subir/descer), duplicar, remover; resumo ao vivo (exercícios/séries/duração/grupos) com aviso quando passa do tempo alvo; salvar, iniciar agora e planejar em qualquer dia da semana.

### Arquivos alterados

- `src/types/index.ts` — `VolumeProfile`, `WorkoutBuilderDraft`, `ProgramDay.volumeProfile?`, `WorkoutProgram.isCustom?`.
- `src/providers/GymFlowContext.tsx` — `customPrograms` (persistido) mesclado com `MOCK_PROGRAMS` em `programs`; `todayPlan` (dia de hoje resolvido do `weeklyPlan` real); `startWorkout` aceita um `ProgramDay` explícito (evita corrida de estado ao salvar-e-iniciar); `saveCustomProgram`, `assignDayToWeekday`, `openWorkoutBuilder`; `buildWeekFromProgram` agora usa `estimateWorkoutDuration`/`muscleGroupsForSlots` (removida a função privada duplicada); `getTodayDayName()` único (antes duplicado em `finishWorkout`/`replanMissedWorkout`).
- `src/mock/programs.ts` — `prog_int_1`: "Dia A — Peito e Tríceps" (3 peito + 2 tríceps, 16 séries, perfil Padrão) e "Dia C — Peito e Tríceps (Alto Volume)" (4 peito + 3 tríceps, 22 séries, perfil Alto Volume).
- `src/modules/Dashboard.tsx` — card "Treino do Dia" lê `todayPlan`; botões "Começar Treino" / "Editar Treino" / "Montar do Zero"; estados honestos para dia de descanso e semana ainda não planejada.
- `src/modules/PlannerView.tsx` — botão "Criar Treino"; por dia, "Escolher" (atribui um Day real de qualquer programa/custom ao dia) e "Editar" (abre o Construtor com os slots reais); removida a fabricação de `exerciseCount` do modal antigo.
- `src/modules/WorkoutsTab.tsx` — abas "Programas Sugeridos" / "Meus Treinos"; botão "Criar Treino"; "Editar" por dia dentro de um treino custom.
- `src/components/ExerciseMedia.tsx` — fundo do contêiner de mídia trocado de `bg-white` para `bg-gym-dark` (fim das faixas brancas nas fotos com `object-contain`).
- `src/app/page.tsx` — nova view `workout-builder`.
- `docs/DECISOES.md`, `docs/PENDENCIAS.md`, `docs/GOALS_LOG.md` — este registro.

### Validações executadas

1. `grep -rn "alert(" src/` e `grep -rn "confirm(" src/` — ambos vazios.
2. `npx vitest run` — 22/22 (inalterado).
3. `npx tsc --noEmit` — sem erros.
4. `npm run build` — passou (Next 16.2.6, Turbopack) duas vezes (antes e depois de um ajuste no Construtor — ver nota abaixo).
5. `npm run start` + checagem HTTP: `/` e `/manifest.webmanifest` seguem servindo 200 normalmente (PWA do GOAL-10 intocado).
6. `git status` conferido antes de cada etapa: nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d`, GLBs, pipeline do Kai, backend, Supabase, Prisma, pagamento, service worker ou PWA tocado.
7. Revisão de código identificou e corrigiu, antes do commit, uma corrida no próprio Construtor: `buildProgramFromDraft` mintava um `custom_${Date.now()}` novo a cada clique — planejar o mesmo treino em 2 dias da semana (ou Salvar e depois Iniciar) na mesma sessão duplicava o treino em vez de reaproveitar o que acabou de ser salvo. Corrigido cacheando os ids resolvidos em `useRef` por sessão do Construtor.
8. Não foi possível testar a UI interativa num navegador real (sem ferramenta de browser headless neste ambiente) — validação da lógica de UI feita por revisão de código linha a linha, alinhando cada tela ao mesmo `ProgramDay`/`todayPlan` usado por `startWorkout`.
9. Nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d`, GLBs, pipeline do Kai, backend, Supabase, Prisma, pagamento real, service worker ou PWA foi alterado.

## GOAL-10.6 — QA UX do Construtor de Treino (2026-07-04)

### Resumo

Ajustes de usabilidade a partir dos atritos encontrados na revisão de código do GOAL-10.5 (teste manual em navegador ainda não foi possível neste ambiente — sem ferramenta headless): Dashboard sempre oferece um caminho claro para treinar mesmo em dia de descanso; modal de adicionar exercício no Construtor não fecha mais a cada clique; salvar um treino leva direto para "Meus Treinos" com o item recém-criado destacado; e as ações finais do Construtor ficaram em 3 botões claros (Salvar / Salvar e Planejar / Iniciar Agora), com aviso antes de descartar mudanças não salvas.

### Antes / depois

- **Antes:** em dia de descanso (ou dia sem treino definido) o Dashboard só oferecia "Montar Treino" e "Ver Planejador" — nenhum caminho para reaproveitar um treino já existente. O modal de adicionar exercício fechava a cada exercício adicionado. Salvar um treino custom voltava para a aba Treinos na sub-aba "Programas Sugeridos" (o treino salvo ficava escondido em "Meus Treinos", no fim da lista). O Construtor tinha só "Iniciar Agora"/"Salvar", e a seção de planejar a semana ficava sempre visível mesmo sem ter sido pedida.
- **Depois:** Dashboard sem treino real hoje oferece "Escolher Treino para Hoje" (reaproveita o seletor do Planejador), "Montar Treino" e "Ver Planejador" — nunca inventa um treino sozinho. O modal de exercícios permanece aberto entre adições, com toast de confirmação e um botão "Concluir" explícito; exercícios já adicionados mostram "No treino ×N" e "Adicionar novamente" em vez de duplicar silenciosamente. "Salvar" sempre leva para Treinos → Meus Treinos com o item recém-criado destacado (anel verde-lima) e listado primeiro. "Salvar e Planejar" salva e só então revela a escolha de dia da semana; "Cancelar"/voltar avisa via `ConfirmDialog` (não `confirm()` nativo) se há mudanças não salvas.

### Arquivos alterados

- `src/providers/GymFlowContext.tsx` — novo estado compartilhado: `workoutsTab` (aba Programas Sugeridos/Meus Treinos, antes local do `WorkoutsTab`), `chooserDayName` + `openProgramChooserForDay` (o mesmo seletor "Escolher treino" do Planejador, agora acionável também pelo Dashboard), `lastSavedProgramId` (setado dentro de `saveCustomProgram`).
- `src/modules/Dashboard.tsx` — botão "Escolher Treino para Hoje" quando não há treino real hoje (descanso ou dia vazio); textos honestos ("Hoje está como descanso no seu planejamento...").
- `src/modules/PlannerView.tsx` — "Escolher treino" migrado para o estado compartilhado (`chooserDayName`) em vez de estado local, sem mudar o comportamento existente.
- `src/modules/WorkoutBuilder.tsx` — modal de exercícios não fecha mais ao adicionar; badge de duplicata; botão "Concluir" no rodapé do modal; ações finais reorganizadas em "Salvar" / "Salvar e Planejar" / "Iniciar Agora"; seção de dias da semana só aparece após "Salvar e Planejar"; `ConfirmDialog` ao cancelar com mudanças não salvas (comparação via snapshot, sem `confirm()` nativo).
- `src/modules/WorkoutsTab.tsx` — aba (`workoutsTab`) migrada para o contexto; "Meus Treinos" ordena o treino recém-salvo primeiro e o destaca com badge "Recém-criado" + anel visual.
- `docs/DECISOES.md`, `docs/GOALS_LOG.md` — este registro.

### Checklist de QA manual (curto)

- [ ] Criar treino com 7 exercícios (4 peito + 3 tríceps).
- [ ] Adicionar vários exercícios em sequência sem o modal fechar sozinho.
- [ ] Salvar — cai direto em Treinos → Meus Treinos, com o treino destacado.
- [ ] Confirmar que o treino aparece em "Meus Treinos".
- [ ] Planejar esse treino em segunda-feira (via "Salvar e Planejar" ou Planejador → Escolher).
- [ ] Iniciar o treino salvo.
- [ ] Confirmar que o Treino Ativo abre exatamente os 7 exercícios.
- [ ] No Dashboard, em dia de descanso, confirmar que "Escolher Treino para Hoje" e "Montar Treino" aparecem (nunca um treino inventado).

### Validações executadas

1. `grep -rn "alert(" src/` e `grep -rn "confirm(" src/` — ambos vazios (o aviso de descarte usa `ConfirmDialog`, não `confirm()` nativo).
2. `npx vitest run` — 22/22 (inalterado).
3. `npx tsc --noEmit` — sem erros.
4. `npm run build` — passou (Next 16.2.6, Turbopack).
5. `git status` conferido: nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d`, GLBs, pipeline do Kai, backend, Supabase, Prisma, pagamento real, service worker ou PWA tocado.
6. Sem regressão na persistência (`customPrograms`/`weeklyPlan` continuam no mesmo envelope do GOAL-01), no timer de descanso, no motor de progressão (GOAL-08) nem no PWA (GOAL-10) — nenhum desses arquivos foi alterado neste GOAL.
7. Novamente não foi possível clicar na UI num navegador real neste ambiente (sem ferramenta headless) — validação por revisão de código, `tsc` e `build`.

## GOAL-11 — Polimento premium final + limpeza + relatório (2026-07-05)

### Resumo

Fechamento do Lote 1: código morto removido com validação por grep/eslint, ErrorBoundary global por view, empty states com CTA em 8 telas, auditoria de toque/microinterações/acessibilidade (alvos ≥44px, vibração de 10ms ao concluir série, focus visível, transição de view de 150ms), fotos de exercício sem faixas (cover 16:9 nos cards/Treino Ativo, 3:2 na ficha técnica, skeleton no loading) e relatório final do lote em `docs/RELATORIO_FINAL_GOALS.md`.

### Código morto removido

- `src/components/BiomechanicalVisualizer.tsx` — 1249 linhas, zero imports (só comentários no stack 3D intocável).
- `MOCK_WEEKLY_TEMPLATES` (`mock/programs.ts` + reexport em `mock/data.ts`) — pendência do GOAL-10.5 quitada.
- Sub-aba `'groups'` órfã do CommunityFeed (union estreitado, cast `as any` removido).
- Parâmetro morto `_duration` de `generateWeeklyPlan` (tipo público + 2 call sites).
- ~50 imports mortos em 18 arquivos + variáveis não usadas (`setPrograms`, `registerUser`, `achievements`, `user` etc.) — eslint `no-unused-vars` = 0 em `src/`.
- Helper local `X` svg do ActiveWorkoutPage substituído pelo `X` do lucide.

### ErrorBoundary (novo `src/components/ErrorBoundary.tsx`)

Class component com `getDerivedStateFromError`/`componentDidCatch` (sempre loga no console; em dev mostra `error.message` no fallback). Fallback dark + verde-lima: "Algo deu errado", descrição curta, "Recarregar app" e "Voltar ao painel" (quando `onGoHome` fornecido). Integrado em `page.tsx` em 2 pontos: switch pré-login e em volta do `renderLoggedInView()` DENTRO do shell — crash de uma view mantém TopBar/side/bottom nav vivos. `resetKey={activeView}` limpa o erro ao navegar.

### Empty states com CTA (padrão: ícone lucide + título + 1 frase + 1 CTA ≥44px)

Evolução/histórico ("Finalize seu primeiro treino" → Começar treino), Meus Treinos ("Monte seu primeiro treino" → Criar treino), Feed ("A comunidade ainda está vazia" → Criar publicação, foca o composer), Nutrição ("Comece registrando sua hidratação" → +250ml agora), Planejador (→ Gerar Semana com IA, texto com `**markdown**` quebrado corrigido), Biblioteca por aba (Favoritos → Explorar exercícios; Recentes → Explorar; busca vazia → Limpar filtros), Treino Ativo sem treino (→ Escolher treino), Construtor sem exercícios (→ Adicionar Exercício).

### Toque, microinterações e acessibilidade

- Checkbox OK das séries: hit area 44×44 (`w-11 h-11 -m-2.5`, visual 24px preservado) + `aria-label` por série — medido 44×44 no navegador.
- Inputs de carga/reps/RPE das séries e os 7 inputs de slot do Construtor: min-h 44px + aria-labels.
- Vibração de 10ms em `completeWorkoutSet` (guarda `'vibrate' in navigator`).
- `:focus-visible` global (outline verde-lima, não dispara em toque).
- Transição de view ~150ms (`.animate-view-in` + `key={activeView}` no wrapper do switch).
- Alvos pequenos promovidos a ≥44px: Trocar/±Série (Treino Ativo), Mover/Copiar/Descanso/Escolher/Editar/Play e Trocar/Colar Aqui (Planejador), X de modais (`tap-target`), coração de favorito, Ver técnica (span→button), envio de comentário, compartilhar post/PR, adicionar foto, fechar toast (44px via margem negativa).
- `active:scale` states nos botões auditados; aria-labels em botões icon-only.

### Visual premium

- `ExerciseMedia` ganhou prop `fit`: cards da biblioteca e mídia do Treino Ativo (21:9→16:9) usam `cover` (fotos 3:2, corte leve seguro — fim das faixas); ficha técnica usa container 3:2 com `contain` (fidelidade sem letterbox). Análise real: 121/125 fotos são 850×567.
- Skeleton pulse no container da foto até a primeira imagem carregar.
- CTAs primários unificados (bg-gym-accent, rounded-2xl, uppercase tracking-wider, sombra accent).

### Validações executadas

1. `npx vitest run` — 22/22.
2. `npx tsc --noEmit` — sem erros.
3. `npm run build` — passou (Next 16.2.6, Turbopack).
4. `grep alert(`/`confirm(`/`"Exercício Extra"`/`"Sugestão IA"` em `src/` — todos vazios; `BiomechanicalVisualizer` só em comentários do stack 3D; "placeholder" só em contextos legítimos (registrado em DECISOES.md).
5. eslint `no-unused-vars` em `src/` — 0 ocorrências.
6. Verificação em navegador real (dev server): login demo, biblioteca com fotos cover carregadas, empty state de Favoritos com CTA funcionando (volta para a grade de 125), treino livre iniciado, checkbox de série medido 44×44px, input de carga 44px, série concluída com toast; zero erros de console.
7. `git status` — nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/`, `app/poc-3d`, GLBs, pipeline do Kai, backend, Supabase, Prisma ou pagamento tocado. Lote 2 não iniciado.

**Lote 1 encerrado. Relatório consolidado em `docs/RELATORIO_FINAL_GOALS.md`.**

---

## GOAL-12 — App Android local com Capacitor (2026-07-06)

### Resumo

O GymFlow AI agora pode ser empacotado como **APK Android de debug** e instalado no celular como aplicativo (tela cheia, assets locais, localStorage), sem abrir URL no navegador. O app já era uma SPA 100% client-side, então bastou ligar o **export estático** do Next (`output: "export"` → pasta `out/`) num alvo de build separado e envolvê-lo num **WebView do Capacitor**. Backend, Supabase, pagamento, Avatar Lab, POC 3D e GLBs não foram tocados. **APK gerado com sucesso.**

### Auditoria de static export (Parte 1)

Viável sem refatorar o app: `page.tsx` e `poc-3d` são `'use client'`; **zero** API routes, server actions, `cookies()`/`headers()` ou `next/image`; `localStorage` já guardado por `typeof window`. Único ajuste necessário: a rota de metadata `/manifest.webmanifest` exigiu `export const dynamic = 'force-static'` sob `output: export` (registrado em DECISOES/PENDENCIAS). Os 261 assets de `public/` (250 fotos de exercícios + 5 ícones + sw.js) entram no `out/` automaticamente.

### Estratégia de build (Parte 2) — não quebra o build web

`output: "export"` só liga quando `BUILD_TARGET=mobile` (script `build:mobile`); `next build`/`next start` continuam com o comportamento padrão do Next. A trava de zoom no `viewport` também é condicional a esse alvo (app nativo trava zoom; web mantém pinch-zoom por acessibilidade).

### Arquivos criados

- `capacitor.config.ts` — `appId com.gymflowai.app`, `appName "GymFlow AI"`, `webDir out`; `androidScheme https` (contexto seguro p/ SW + localStorage persistente), `backgroundColor #09090b` (sem flash branco), `webContentsDebuggingEnabled true`.
- `scripts/build-mobile.mjs` — wrapper Node cross-platform que roda `next build` com `BUILD_TARGET=mobile` (evita `cross-env`).
- `scripts/android-build.mjs` — wrapper Node que roda `gradlew assembleDebug` (caminho absoluto do wrapper; cross-platform).
- `docs/ANDROID_BUILD.md` — guia curto (build mobile, abrir Studio, gerar/instalar/atualizar APK, limitações, APK×PWA×Play Store).
- `android/**` — projeto nativo gerado pelo Capacitor (`npx cap add android`).

### Arquivos alterados

- `next.config.ts` — `output: "export"` + `images.unoptimized` condicionais a `BUILD_TARGET=mobile` (via `mobileConfig` espalhado).
- `src/app/manifest.ts` — `export const dynamic = 'force-static'` (necessário para o export; inofensivo ao web).
- `src/app/layout.tsx` — `viewport` ganha `maximumScale: 1, userScalable: false` **só** quando `BUILD_TARGET=mobile`.
- `package.json` — scripts `build:mobile`, `cap:sync`, `android:open`, `android:build`; deps `@capacitor/core`/`@capacitor/android` + devDep `@capacitor/cli`.
- `android/build.gradle` — override de `compileOptions` para `VERSION_17` em todos os subprojetos (ver nota de toolchain abaixo).
- `android/local.properties` — `sdk.dir` local (gitignored pelo Capacitor).

### Capacitor 7 + JDK 17 (nota de toolchain)

A máquina tem **JDK 17** e Android SDK com **platform android-35 + build-tools 35.0.0** (nenhum JDK 21). O Capacitor 8 (e o 7.6) declaram `sourceCompatibility 21`, quebrando o build com "invalid source release: 21". Como o código Java do Capacitor **não usa recursos exclusivos do Java 21** (verificado: sem sequenced collections, virtual threads, record/switch patterns), a solução foi fixar Capacitor **7.6.7** (compileSdk 35 = casa com o SDK instalado) e forçar `compileOptions` para 17 em `android/build.gradle` (arquivo que o `cap sync` não regenera). Android converte o bytecode para DEX, então 17 vs 21 não afeta o runtime. Remover o override quando houver JDK 21.

### Como gerar e instalar (resumo — detalhe em `docs/ANDROID_BUILD.md`)

```bash
npm run cap:sync        # build:mobile (gera out/) + cap sync android
npm run android:build   # APK -> android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`npm run android:open` abre o projeto no Android Studio (que traz seu próprio JBR 21, dispensando o override em quem usar a IDE).

### APK gerado

- `android/app/build/outputs/apk/debug/app-debug.apk` — **~21 MB**.
- `aapt dump badging`: package `com.gymflowai.app`, label **GymFlow AI**, versionCode 1 / versionName 1.0, minSdk 23, targetSdk/compileSdk 35.

### Validações executadas

1. `npm run build:mobile` — export estático OK; `out/` com `index.html`, `manifest.webmanifest`, `sw.js`, `poc-3d.html`, `404.html`, 250 fotos de exercícios e os 5 ícones (~19 MB).
2. `npx cap add android` + `npx cap sync android` — projeto nativo criado e assets copiados sem erro.
3. `npm run android:build` — **BUILD SUCCESSFUL** (Gradle 8.x, AGP 8.7.2, JDK 17); APK de debug gerado.
4. `npm run build` (web normal) — passou; segue com output padrão do Next (sem `export`), provando que o alvo mobile não quebrou o build web.
5. `npx tsc --noEmit` — sem erros (inclui `capacitor.config.ts`).
6. `npx vitest run` — 22/22 (inalterado).
7. `grep -rn "alert(" src/` e `grep -rn "confirm(" src/` — ambos vazios.
8. `git status` — nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/`, `src/app/poc-3d`, GLBs, pipeline do Kai, backend, Supabase, Prisma, Stripe/pagamento ou autenticação real tocado. Lote 2 não iniciado.

### Limitações conhecidas

APK de debug (não assinado p/ release); sem backend (tudo local, não sincroniza entre aparelhos); o service worker é redundante dentro do WebView (mas não atrapalha); é preciso `cap:sync` a cada mudança de código web. Detalhes em `docs/ANDROID_BUILD.md` e `docs/PENDENCIAS.md`.

---

## GOAL-13 — Player de técnica por sequência de imagens (2026-07-07)

### Resumo

Criado suporte completo para sequência visual de técnica por exercício. O app agora entende `techniqueFrames?: TechniqueFrame[]`, usa sequências reais quando houver 3+ frames e gera etapas automáticas a partir de `images[]` enquanto a biblioteca ainda tem, em geral, 2 fotos por exercício. O fallback honesto foi mantido: sem imagem ou imagem quebrada cai em `AvatarDemoPlaceholder`, com texto claro de "Demonstração 3D em breve".

### Arquivos criados

- `src/lib/techniqueFrames.ts` — `getTechniqueFrames(exercise)` com fallback seguro, labels automáticos e cues a partir de instruções/dicas/correções existentes.
- `src/lib/techniqueFrames.test.ts` — testes de `techniqueFrames`, 2 imagens, 5 imagens, sem imagens e dados incompletos.
- `src/lib/exerciseTechniqueMap.ts` — mapa compartilhado exercício ↔ guia técnico, removendo duplicação em telas.
- `src/components/TechniqueSequencePlayer.tsx` — player com autoplay, play/pause, anterior/próxima, repetir, contador, indicadores, dicas por etapa e fallback honesto.
- `docs/TECHNIQUE_IMAGE_SEQUENCE_PLAN.md` — plano curto de pastas, nomes e 25 exercícios prioritários.
- `docs/TECHNIQUE_IMAGE_PROMPTS.md` — prompt-base e prompts futuros para 10 exercícios, sem gerar imagens.

### Arquivos alterados

- `src/types/index.ts` — novo `TechniqueFrame` e `Exercise.techniqueFrames?`.
- `src/modules/ExerciseLibrary.tsx` — ficha técnica agora mostra `TechniqueSequencePlayer`; botão "Ver técnica" usa mapa compartilhado.
- `src/modules/ActiveWorkoutPage.tsx` — box visual do treino ativo trocado de crossfade para sequência curta com controles.
- `src/components/GlobalVideoPlayer.tsx` — player global resolve o exercício associado ao guia e mostra a sequência antes do checklist.
- `docs/GOALS_LOG.md` — este registro.

### Como funciona o fallback

- `techniqueFrames` com 3+ etapas: usa as etapas ordenadas por `order`.
- Sem `techniqueFrames`: gera frames a partir de `images[]`.
- Com 2 imagens: labels "Posição inicial" e "Execução / posição final".
- Com 5 imagens: usa o padrão completo de início, meio, contração/final e retorno controlado.
- Sem imagem: retorna um frame seguro e o player mostra o placeholder honesto, sem fingir vídeo/avatar.

### Validações executadas

1. `npx vitest run` — 27/27 testes passaram.
2. `npx tsc --noEmit` — sem erros.
3. `npm run build` — passou (foi necessário liberar rede para o Next buscar a fonte Google `Outfit`).
4. `npm run build:mobile` — passou (mesma liberação de rede para a fonte).
5. `rg -n "alert\(|confirm\(" src` — sem ocorrências.
6. `git status`/diff conferidos — nenhum arquivo de `labs/avatar-lab/`, `docs/avatar-design/`, `src/app/poc-3d`, Motion Engine, GLBs, backend, Supabase, Prisma, Stripe/pagamento, autenticação real ou service worker foi tocado.

### Confirmação de escopo

Nenhuma imagem real nova foi gerada, baixada ou importada. Nenhum vídeo foi criado. Backend, pagamento, Avatar Lab, Motion Engine, GLBs e Capacitor Android nativo não foram alterados.

---

## GOAL-14 — Lote inicial de imagens reais de técnica (2026-07-07)

### Resumo

Produzido o primeiro lote real de sequências visuais para o `TechniqueSequencePlayer`: 10 exercícios prioritários, 5 JPGs por exercício, total de 50 imagens em `public/assets/exercises/<exerciseId>/sequence/`. O app agora resolve esses frames pelo `getTechniqueFrames()` antes do fallback antigo de `images[]`; exercícios fora do lote continuam com o comportamento do GOAL-13.

### Exercícios cobertos

- `chest_supino_reto`
- `chest_supino_inclinado_haltere`
- `back_puxada_pulley`
- `back_remada_baixa`
- `biceps_rosca_direta`
- `triceps_polia_corda`
- `legs_agachamento_barra`
- `legs_legpress_45`
- `shoulder_desenvolvimento_haltere`
- `shoulder_elevecao_lateral`

### Arquivos criados

- `public/assets/exercises/*/sequence/step-01.jpg` a `step-05.jpg` para os 10 exercícios do lote.
- `docs/TECHNIQUE_IMAGE_BATCH_001.md` — resumo do lote, equivalências de IDs, padrão de arquivos e candidatos ao lote 2.

### Arquivos alterados

- `src/lib/techniqueFrames.ts` — mapa do lote 001 com caminhos reais, labels e cues por etapa.
- `src/lib/techniqueFrames.test.ts` — teste garante 5 frames por exercício e existência física dos JPGs.
- `docs/GOALS_LOG.md` — este registro.

### Integração

`getTechniqueFrames()` mantém a prioridade para `techniqueFrames` explícitos, depois aplica o lote 001 quando o `exercise.id` é coberto, e só então usa o fallback por `images[]` ou placeholder honesto. Biblioteca, Treino Ativo e GlobalVideoPlayer usam o mesmo helper, então recebem os 5 frames reais sem nova integração de tela.

### Confirmação de escopo

Nenhum vídeo foi gerado. Backend, Supabase, Prisma, pagamento/Stripe, autenticação real, Avatar Lab, Motion Engine, GLBs, POC 3D, Android nativo e lote 2 não foram alterados.

---

## GOAL-15 — QA real do Treino Ativo (2026-07-14)

### Resumo

Correção dos bugs reais encontrados no uso do APK Android: (1) notificações de XP empilhando e cobrindo a tela; (2) edições do Treino Ativo (adicionar exercício) que não salvavam; (3) campos numéricos virando `080`/`012`/`0.20`; (4) exercícios tradicionais de academia difíceis de achar na busca; (5) topo do app cortado pela status bar.

### Causa raiz de cada bug

1. **Notificações de XP:** `XPBadgeNotification` renderizava TODAS as notificações do array sem limite e um único timer de 4s reiniciava a cada novo evento. Marcar 4 séries = 4+ cards gigantes presos no topo.
2. **Edição não salva:** `ExerciseLibrary.handleAddToWorkout` fazia `activeWorkout.exercises.push(...)` **sem `setActiveWorkout`** — mutava o array em memória, então não re-renderizava nem disparava o efeito de persistência. `handleAddSet`/`handleRemoveSet` do Treino Ativo também mutavam antes de salvar.
3. **Inputs numéricos:** `onChange={... Number(e.target.value)}` com `<input type="number">` — o comportamento de zero à esquerda do WebView + a reconciliação do React geravam `080`/`0.20`.
4. **Busca:** `ex.name.toLowerCase().includes(query)` — sensível a acento (`triceps` não achava `Tríceps`) e sem apelidos (`pulley`, `puxada alta`, `remada baixa`).
5. **Status bar:** o `<header>` sticky não reservava `env(safe-area-inset-top)`; com `viewport-fit=cover` no APK o conteúdo desenha atrás da status bar.

### Antes / depois (comportamento crítico)

- **Notificações:** antes empilhavam sem fim e cobriam os campos → agora no máximo 2 visíveis, eventos repetidos consolidados (`3 séries concluídas · +30 XP`), auto-dismiss (4s / level up 6s), botão X e swipe horizontal, posicionadas abaixo da TopBar respeitando a safe-area.
- **Inputs:** antes `apagar 10 e digitar 20` virava `0.20` e `80` aparecia `080` → agora aceita vazio durante a edição, remove zero à esquerda, aceita vírgula/ponto, converte só no blur.
- **Edição do treino:** antes adicionar exercício pela biblioteca não salvava → agora persiste em `gymflow:state:v1` e sobrevive a refresh (verificado no navegador).
- **Busca:** antes `triceps pulley` não achava nada → agora acha os 5 exercícios de tríceps na polia (sem acento, por apelido).
- **Status bar:** antes o logo GYMFLOWAI encostava/cortava no topo do APK → agora o header reserva a safe-area (no web `env()=0`, sem regressão).

### Arquivos alterados

- `src/lib/numericInput.ts` + `.test.ts` — **novos**: `normalizeNumericInput`/`parseNumericInput`.
- `src/components/ui/NumericInput.tsx` — **novo**: input controlado com string de rascunho, commit no blur (`type="text"` + `inputMode`).
- `src/lib/exerciseSearch.ts` + `.test.ts` — **novos**: `normalizeText` (sem acento) + `matchesExerciseSearch` (tokens/apelidos/stopwords).
- `src/providers/GymFlowContext.tsx` — `XpNotification` (id/kind/count), `pushXpNotification` (limite + consolidação), `dismissXpNotification`; `updateWorkoutSet` reescrito imutável; novos `addSetToActiveExercise`/`removeSetFromActiveExercise`/`addExerciseToActiveWorkout`/`removeExerciseFromActiveWorkout`.
- `src/components/XPBadgeNotification.tsx` — reescrito: cap 2, auto-dismiss por card, X + swipe, texto consolidado.
- `src/modules/ActiveWorkoutPage.tsx` — `NumericInput` na carga/reps/RPE; ações de série/exercício via contexto; botão + modal "Adicionar Exercício" (busca com apelidos); botão remover exercício.
- `src/modules/ExerciseLibrary.tsx` — busca por `matchesExerciseSearch`; `handleAddToWorkout` usa `addExerciseToActiveWorkout` (fim do bug de mutação).
- `src/modules/WorkoutBuilder.tsx` — `NumericInput` nos campos (séries, reps, RPE, descanso, incremento, tempo alvo).
- `src/mock/exercises.ts` — novo `triceps_maquina` (Extensão de Tríceps na Máquina, `images: []` = fallback honesto); mapa `SEARCH_TERMS` de apelidos aplicado no build.
- `src/mock/exercises.test.ts` — teste de imagem aceita exercícios sem foto (lista fixada em `['triceps_maquina']`).
- `src/types/index.ts` — `Exercise.searchTerms?`.
- `src/components/Navigation.tsx`, `src/modules/LandingPage.tsx` — `paddingTop: calc(... + env(safe-area-inset-top))` no header.

### Exercícios: aliases criados + 1 novo

- **Novo:** `triceps_maquina` — "Extensão de Tríceps na Máquina" (sem foto ainda; fallback honesto).
- **Aliases** (busca): tríceps polia → `pulley`; `triceps_coice` → `kickback`; `back_remada_maquina` → `remada articulada`/`remada sentada`; `back_remada_baixa` → `remada baixa`/`low row`; `back_puxada_pulley`/`_supinada`/`_fechada`/`_triangulo` → `puxada alta`/`pulldown`. Os demais citados (francês, testa, serrote, curvada, pulldown braço reto) já eram achados por nome após a busca ficar sem acento.

### Validações executadas

1. `npx vitest run` — 56 testes, 5 arquivos, todos passam (inclui `numericInput`, `exerciseSearch`, `exercises` atualizado).
2. `npx tsc --noEmit` — sem erros.
3. `npm run build` (web) — sucesso.
4. `npm run build:mobile` (export estático) — sucesso.
5. `npm run cap:sync` — assets copiados para `android/` (APK pronto para regerar).
6. `rg -n "alert\(|confirm\("` em `src` — nenhuma ocorrência.
7. **Verificação no navegador** (dev server): `080`→`80`, campo vazio não vira 0, `2,5`→`2.5`; 3 séries seguidas → um card "3 séries concluídas +30 XP" com botão fechar; busca `triceps pulley` → 5 resultados; exercício adicionado persiste no `localStorage` e sobrevive ao refresh; zero erros no console.

### APK

`npm run cap:sync` sincronizou os assets web atualizados para o projeto Android. Nenhum arquivo nativo (`android/`) foi editado — o fix de safe-area é 100% CSS —, então o build nativo é idêntico ao do GOAL-12. A regeneração do APK instalável é `npm run android:build` (Gradle). O efeito da safe-area no APK não foi validado em dispositivo real neste ambiente.

### Confirmação de escopo

Nenhuma imagem ou vídeo novo foi gerado. Backend, Supabase, Prisma, pagamento/Stripe, LGPD, autenticação real, Avatar Lab, Motion Engine, GLBs, POC 3D e lote 2 de imagens não foram tocados. Único ajuste "mobile" foi CSS de safe-area (sem plugin novo, sem editar `android/`).
## GOAL-17A — Persistência v1 segura, migrações, backup e export/import (2026-07-16)

### Resumo

A persistência `gymflow:state:v1` agora distingue load válido, vazio, legado, corrompido, versão incompatível e storage indisponível. O envelope `{ v: 1, savedAt, data }` foi preservado; saves criam backup rolante do último envelope válido, fazem readback exato e retornam erro discriminado em vez de engolir falhas.

### Recuperação e compatibilidade

- JSON corrompido/versão desconhecida permanece na chave principal, recebe uma única quarentena e bloqueia autosave até confirmação explícita.
- Migração de `gymflow_user`/`gymflow_weeklyPlan` lê e valida antes, salva/relê o v1 e só então remove as origens; é idempotente e mantém tudo se a escrita falhar.
- Hidratação usa presença/shape, não `length > 0`; arrays vazios, treino ativo, timestamps de timer, histórico, favoritos e programas personalizados atravessam roundtrip.
- Debounce de 500 ms continua; `pagehide` e aba oculta fazem flush síncrono sem salvar quando o storage está bloqueado.
- Export/import offline usa JSON validado, limite de 5 MiB, preview e `ConfirmDialog`; import só troca o estado após confirmação e commit verificado.
- `AdminPanel.tsx` recebeu a gestão mínima de dados locais e `StorageRecoveryNotice.tsx` mantém falhas críticas visíveis globalmente.

### Validação do incremento

- `npx vitest run`: 9 arquivos, 88 testes, todos verdes (56 anteriores + 32 novos).
- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado no Next.js 16.2.6.
- `npm run build:mobile`: export estático aprovado, sem tocar em `android/**`.
- `rg -n "alert\(|confirm\(" src`: nenhuma ocorrência.
- Benchmark com 1.000 iterações: fixture pesada 659.858 bytes; save/readback mediana 8,4356 ms, p95 13,3922 ms.
- Teste no navegador carregou a landing hidratada e sem erro de console, mas a interação não pôde ser validada nesta execução porque o dev server bloqueou HMR para `127.0.0.1` (origin fora de `allowedDevOrigins`). Os fluxos de storage permanecem cobertos deterministicamente pelos testes; `next.config.ts` não foi alterado por estar fora da allowlist.
- Decisão: manter `localStorage`; reavaliar particionamento/IndexedDB no GOAL-17B após o GOAL-23A.
- Nenhuma dependência, IndexedDB, backend ou shape do domínio de treino foi introduzido.

---

## GOAL-18A — Fundação de taxonomia muscular, padrões e equipamentos (2026-07-16)

### Pré-flight e inventário inicial

- Base: `master` em `8fd10352413c1ddcee2528f5708709ae920b7bf8`; único WIP era `.claude/settings.local.json`, preservado e não staged.
- Catálogo: 126 exercícios, 12 valores de `muscleGroup`, 10 valores usados em `secondaryMuscles`, 72 strings distintas de `equipment` e níveis `beginner` (73), `intermediate` (44), `advanced` (9), sem `athlete` no seed.
- Busca: 35 ocorrências de `searchTerms`, 23 termos distintos. Substituições: 256 referências/110 IDs distintos, zero inválida. Programas: 12 seeds/99 referências, zero inválida.
- Nomes: um duplicado exato (`biceps_rosca_direta` e `biceps_rosca_w`, ambos “Rosca Direta com Barra W”); pares semanticamente próximos documentados para GOAL-33A, inclusive os dois Leg Press 45°.
- Baseline confirmado: 9 arquivos/88 testes do GOAL-17A.

### Fundação criada

- 20 grupos musculares canônicos, com labels PT-BR, aliases, categoria e ordem. `legs -> legs_general` e `abs -> core`; nenhuma inferência detalhada foi aplicada ao catálogo.
- 25 padrões de movimento, com descrição, categoria e aliases; mecânica, lateralidade e posição corporal tipadas.
- 13 categorias operacionais. Bancos, racks, barras, halteres e kettlebells foram tratados como equipamentos específicos.
- Registry com 82 equipamentos e 106 aliases, cobrindo aparelhos reais informados pelo Founder e declarando status/tipo de carga.
- Normalização determinística de acento, caixa, espaços, hífen, barra, pontuação e grau, preservando números.
- Mapa explícito das 72 strings raw para um ou mais IDs: 72 resolvidas, zero `unresolved`; 17 casos `generic` mantêm warning para curadoria. A equivalência `Polia (Crossover)`/`Polia / Crossover` é deliberada e validada.
- Resolvers são puros, tipados e sem React/localStorage. Lookup canônico é exato; busca parcial não vira fuzzy matching.

### Compatibilidade

`Exercise` recebeu somente campos opcionais: `primaryMuscleGroupId`, `secondaryMuscleGroupIds`, `movementPatternIds`, `equipmentIds`, `mechanics`, `laterality` e `bodyPosition`. Os campos raw e o carregamento atual foram preservados.

Nenhum dos 126 exercícios foi reclassificado; nenhum exercício foi adicionado; `src/mock/exercises.ts`, programas, UI, Treino Ativo, Construtor, persistência, PWA, Android e assets ficaram intactos. Registry não significa que um aparelho já possui exercício.

### Arquivos

- Tipos: `src/types/training-taxonomy.ts`, `src/types/index.ts`.
- Domínio: `src/lib/training-taxonomy.ts`, `src/lib/equipment-registry.ts`, `src/lib/equipment-legacy-map.ts`.
- Testes: `src/lib/training-taxonomy.test.ts`, `src/lib/equipment-registry.test.ts`.
- Documentação: `docs/taxonomy/GYMFLOW_TRAINING_TAXONOMY.md`, `docs/DECISOES.md`, `docs/PENDENCIAS.md`, `docs/GOALS_LOG.md`.

### Validações

- `npx vitest run`: 11 arquivos, **158 testes** aprovados (88 anteriores + 70 novos).
- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado no Next.js 16.2.6.
- `npm run build:mobile`: export estático aprovado; Android build e `cap sync` não executados.
- Auditoria reproduzível: 126 exercícios, 72 raw, 82 equipamentos, 106 aliases, 72 resolvidos, zero unresolved e zero colisão de alias; uma equivalência raw explicitamente aprovada.
- `rg -n "alert\(|confirm\(" src`: zero ocorrência.
- `git diff --check`: aprovado.

### Continuação

Próximo incremento recomendado: **GOAL-21 — Perfil de treino e retorno aos treinos**. GOAL-20, GOAL-24 e GOAL-33A não foram iniciados.

---

## GOAL-21 — Perfil de treino e retorno aos treinos (2026-07-16)

### Modelo e regras

- Experiência e continuidade passaram a ser dimensões independentes: `beginner`, `intermediate`, `advanced` e `athlete` descrevem experiência; `active` e `returning` descrevem o momento atual.
- “Personal Trainer” continua sendo profissão, não nível. `athlete` é exibido como “Atleta / Alta performance”.
- O contexto de retorno aceita pausa aproximada, data civil opcional, nível anterior opcional e observações livres não médicas. Anos de experiência também são opcionais e não promovem/rebaixam o nível automaticamente.
- Perfis antigos sem `trainingStatus` são resolvidos como `active`; o envelope `gymflow:state:v1` e o formato de export/import não mudaram.
- O caso real anonimizado — intermediário, 7 anos, retorno após 3–6 meses, hipertrofia, 5 dias e 75 minutos — permanece “Intermediário em retorno”. Nenhuma prescrição, série, repetição, volume, exercício ou programa é alterado neste incremento.

### Produto e integração

- O onboarding agora explica e coleta experiência + continuidade sem mandar quem retorna para iniciante.
- A seção existente de configurações em Evolução permite revisar e salvar o mesmo perfil depois; alternar para ativo oculta, mas preserva, os detalhes de retorno.
- Um summary compartilhado apresenta labels compostos como “Intermediário em retorno” e deixa explícito que o contexto só poderá orientar adaptações futuras.
- A integração no contexto adiciona apenas os novos campos opcionais ao cadastro; autosave, hidratação, backup e import/export continuam usando a persistência v1 existente.

### Arquivos

- Tipos e domínio: `src/types/training-profile.ts`, `src/types/index.ts`, `src/lib/training-profile.ts`.
- Componentes: `src/components/TrainingProfileSelector.tsx`, `src/components/TrainingProfileSummary.tsx`.
- Superfícies: `src/modules/OnboardingFlow.tsx`, `src/modules/EvolutionDashboard.tsx`.
- Integração mínima: `src/providers/GymFlowContext.tsx`.
- Testes e documentação: `src/lib/training-profile.test.ts`, `docs/profile/GYMFLOW_TRAINING_PROFILE.md`, `docs/DECISOES.md`, `docs/PENDENCIAS.md`, `docs/GOALS_LOG.md`.

### Validações

- `npx vitest run`: 12 arquivos, **183 testes** aprovados (158 anteriores + 25 novos).
- `npx tsc --noEmit`: aprovado.
- ESLint focado nos tipos, domínio, testes, componentes e duas superfícies: aprovado, com um aviso preexistente de `<img>` em Evolução; o arquivo legado do contexto mantém débitos de lint fora das três linhas deste incremento.
- `npm run build`: aprovado no Next.js 16.2.6.
- `npm run build:mobile`: export estático aprovado; Android build e `cap sync` não executados.
- Navegador: perfil legado abriu como “Intermediário”; retorno 3–6 meses com 7 anos virou “Intermediário em retorno” e sobreviveu à recarga; alternar ativo/retorno ocultou e restaurou os detalhes; exportação pela UI confirmou backup de 14.940 bytes; zero erros no console.
- O upload do arquivo de importação não foi automatizado pelo controlador do navegador. O roundtrip export/import do envelope v1, incluindo perfil e invariância de programas, treino ativo e histórico, foi validado deterministicamente no teste de domínio.
- `rg -n "alert\(|confirm\(" src`: zero ocorrência.
- `git diff --check`: aprovado.

### Continuação

Próximo incremento recomendado: **GOAL-22**. Adaptação real de treino, progressão e curadoria de exercícios/programas não foram iniciadas.

---

## GOAL-22 — Motor de volume, frequência e duração (2026-07-16)

### Pré-flight e escopo

- Base confirmada: `master` em `404209d9b731c59f566edf96c9e21c6d83da036d`; baseline de 12 arquivos/183 testes aprovado.
- Único WIP: `.claude/settings.local.json`, preservado e fora do stage.
- Trabalho mantido no worktree principal porque nenhum arquivo permitido estava em conflito.
- Sem UI nova: cenários foram exercitados por domínio, testes e harness; Construtor, Context, programas, catálogo, progressão e storage não foram editados.

### Motores e regras

- Faixas semanais configuráveis por experiência e classe muscular, sempre chamadas de referência/alvo inicial/limite de cautela.
- Atleta começa com a mesma faixa de avançado; retorno preserva o nível e aplica fator heurístico conforme a pausa somente à referência.
- Volume planejado separa séries diretas, exposição secundária ponderada em 0,5, aquecimento e séries não classificadas. `legs_general` continua genérico.
- Duração detalhada separa trabalho, descanso entre séries, setup, transição e aquecimento; usa reps, mecânica, lateralidade e equipamentos quando disponíveis.
- API `estimateWorkoutDuration` permanece com shape e fórmula legados para todos os consumidores atuais.
- Capacidade de sessão estima séries/exercícios que cabem em 30/45/60/75/90 min sem escolher exercícios.
- Assessment retorna `fits`, `tight`, `exceeds_time`, `low_volume`, `high_volume` ou `insufficient_data`, com reasons, warnings, confidence e sugestões não aplicadas.

### Harness real anonimizado

- 4 costas + 4 bíceps, 4 séries, 8–12 reps: 32 séries preservadas; 74 min centrais (bounds 60–93), sendo 22 min de trabalho, 39 de descanso, 7 de transição e 6 de setup; `exceeds_time` para 60 min.
- 4 costas + 5 bíceps: 36 séries preservadas; 82 min centrais (bounds 66–104), com 24 min de trabalho, 43 de descanso, 8 de transição e 7 de setup; `exceeds_time` para 75 min.
- Nenhum exercício/série foi removido; alternativas permaneceram textuais.

### Arquivos

- Tipos: `src/types/training-volume.ts`, `src/types/index.ts`.
- Regras/motores: `src/lib/training-volume-rules.ts`, `src/lib/training-volume.ts`, `src/lib/workoutDuration.ts`, `src/lib/training-plan-assessment.ts`, `src/lib/volumeProfiles.ts`.
- Testes: `src/lib/training-volume.test.ts`, `src/lib/workoutDuration.test.ts`, `src/lib/training-plan-assessment.test.ts`.
- Documentação: `docs/training/GYMFLOW_VOLUME_AND_DURATION_ENGINE.md`, `docs/DECISOES.md`, `docs/PENDENCIAS.md`, `docs/GOALS_LOG.md`.

### Validações

- `npx vitest run`: 15 arquivos, **252 testes** aprovados (183 anteriores + 69 novos).
- `npx tsc --noEmit`: aprovado.
- ESLint focado em todos os arquivos TypeScript alterados/novos: zero erros e zero warnings.
- `npm run build`: aprovado no Next.js 16.2.6.
- `npm run build:mobile`: export estático aprovado; `cap:sync` e Android build não executados.
- Harness substituiu teste manual porque não houve UI. Matriz de capacidade e cenários de 32/36 séries foram executados deterministicamente.
- Hashes de programas, exercícios, progressão, storage, Context e WorkoutBuilder permaneceram idênticos ao pré-flight.
- `rg -n "alert\(|confirm\(" src`: zero ocorrência.
- `git diff --check`: aprovado.

### Gate G2 — proposta, não aprovação

A proposta inclui faixas, fatores de retorno, peso 0,5 de sinergistas, fórmula de duração, defaults de descanso/setup/transição, atleta igual a avançado, política para dados incompletos e catálogo de sugestões. Todos exigem revisão profissional e aprovação explícita do Founder.

Próximo passo: **revisão e aprovação do Gate G2 pelo Founder**. Somente depois iniciar **GOAL-19A**; ele não foi iniciado neste incremento.

---
