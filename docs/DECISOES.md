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

## GOAL-03 (2026-07-03)

- API de toast implementada como hook imperativo (`useToast()` com `.success/.error/.info`) e não como componente controlado por props, porque os alerts a substituir estavam espalhados em handlers de eventos (`onClick`, `onChange`, `setTimeout`) em módulos e no `GymFlowContext`, sem estado de UI local — um hook imperativo evita prop-drilling e mapeia 1:1 com o `alert(msg)` que ele substitui.
- `ToastProvider` montado em `src/app/layout.tsx`, envolvendo `GymFlowProvider` (não dentro dele) — assim tanto os componentes de UI quanto o próprio `GymFlowContext.tsx` (que dispara toasts em `swapExerciseInActiveWorkout`, `adaptActiveWorkoutForCrowdedGym` e `replanMissedWorkout`) conseguem chamar `useToast()` sem violar a árvore de contexto. Opção escolhida por ser a menos invasiva (nenhuma mudança na assinatura do `GymFlowProvider`).
- `ConfirmDialog` implementado como componente controlado simples (`isOpen`/`onConfirm`/`onCancel` via `useState` local no chamador), não como hook/provider global — só há 2 usos reais (cancelar treino, zerar dados do app), ambos com estado local trivial; um provider global seria complexidade desnecessária para 2 chamadores.
- Posicionamento do toast em telas 768–1023px (tablet): a `BottomNavigation`/FAB do app usam `lg:hidden` (breakpoint 1024px), ou seja, continuam visíveis nessa faixa. Para não sobrepor esses elementos, o toast usa `md:bottom-[calc(6.5rem+...)]` (clearance extra) entre 768–1023px e só cai para `lg:bottom-[calc(1.5rem+...)]` (canto inferior direito "clássico") a partir de 1024px, quando a bottom nav já não existe.
- "Zerar dados do app" no AdminPanel: o padrão anterior (duplo clique local, sem `confirm()`) foi trocado por `ConfirmDialog` por ser uma ação destrutiva e irreversível, unificando a experiência com o `ConfirmDialog` de "Cancelar Treino Atual" e satisfazendo o pedido explícito do GOAL-03.
- Alerts em `GymFlowContext.tsx` classificados por natureza: mudança aplicada com sucesso → `toast.success`; nada a fazer/estado neutro (ex.: "treino já é peso livre", "sem dias de descanso disponíveis") → `toast.info`; falha ao identificar estado (ex.: "não foi possível identificar o dia atual") → `toast.error`.

## GOAL-04 (2026-07-03)

- O "botão flutuante CONTINUAR que cobre conteúdo" citado no GOAL é o FAB global de `BottomNavigation` (`Navigation.tsx`), que mostra "Continuar" sempre que há treino ativo — inclusive quando o usuário já está na própria tela de Treino Ativo. Corrigido escondendo esse FAB especificamente quando `activeView === 'active-workout'` (`showFab`), em vez de removê-lo globalmente — ele continua útil em todas as outras telas para voltar ao treino em andamento.
- ActionBar fixa implementada como `lg:hidden` (mesmo breakpoint do FAB/bottom nav que ela substitui nesta tela). Em desktop (`lg+`) não existe bottom nav nem FAB, então "desktop preservado" foi interpretado literalmente: o botão "Finalizar" já existente no header da página segue sendo o único CTA fixo lá, sem barra nova.
- Offset da ActionBar do rodapé (`bottom: calc(4.75rem + safe-area)`) reaproveita a mesma constante já usada pelo FAB em `Navigation.tsx`, garantindo que ela fique ancorada exatamente acima da bottom nav sem precisar recalcular a altura da nav.
- Nova classe utilitária `.pb-active-workout` em `globals.css` (`4.75rem` de clearance da bottom nav + `5.5rem` de altura estimada da ActionBar + `env(safe-area-inset-bottom)` + `1rem` de folga) substitui o antigo `pb-24` fixo do container do Treino Ativo — criada como classe nomeada (não valor Tailwind arbitrário inline) por ser um valor específico desta tela e mais fácil de re-tunar depois.
- Botão "CONTINUAR" usa `scrollIntoView({ behavior: 'smooth', block: 'center' })` na primeira série não concluída (por `id="set-row-{set.id}"`) e foca o primeiro `<input type="number">` da linha (campo de carga/kg, o mais relevante para editar antes de concluir a série). Quando não há série pendente, vira "FINALIZAR" e abre o modal de resumo já existente (`showFinishModal`), sem lógica nova de finalização.
- "Ver Técnica" no placeholder de mídia: o botão estava `absolute` sobre o `AvatarDemoPlaceholder`, podendo cobrir o texto "Demonstração 3D em produção" em telas estreitas. Corrigido removendo o `position: absolute` — agora é uma barra de rodapé em fluxo normal (`flex flex-col`), abaixo da mídia, com `border-t` separando visualmente e `min-h-[44px]` de área de toque.
- Varredura de outros floatings (Tarefa 5): `GlobalVideoPlayer` usa `AvatarDemoPlaceholder` sem botão sobreposto (nenhum problema); `WorkoutSheetNotification` já se auto-oculta quando `activeView === 'active-workout'`, então nunca compete com a nova ActionBar; badges/ícones `absolute` em cantos de cards (favoritar, fechar modal, selo de foto) em `ExerciseLibrary`/`WorkoutsTab`/`EvolutionDashboard`/`Dashboard` são decorativos em cantos de card, sem cobrir texto relevante — nenhuma correção necessária além do que já foi feito.
