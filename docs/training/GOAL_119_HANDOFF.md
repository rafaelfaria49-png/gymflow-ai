> Registro histórico do levantamento. A execução e as validações do GOAL-119 estão em docs/GOALS_LOG.md.

# GOAL-119 — handoff (sessão interrompida por limite de uso)

Estado: SOMENTE levantamento. Nenhum código alterado, nada commitado.
Worktree: `C:\Projetos\gymflow-goal-119-training-clarity`, branch `feat/gymflow-training-mobile-clarity-pickers-119`
a partir de `origin/master` 0679e20. `node_modules` já copiado (robocopy código 1 = sucesso).
`scripts/track.mjs` NÃO existe neste repositório (só nos repos omni-*); segui o CLAUDE.md.
O worktree principal está em uso pela frente GOAL-118 (HEAD 6baca02): não mexer nele.

## Achados confirmados no código (base 0679e20)

- `src/lib/exerciseTechniqueMap.ts:29` usa `?? 'vid_supino_1'` como fallback. Callers:
  `ActiveWorkoutPage.tsx:1087` e `ExerciseLibrary.tsx:105`. Resultado: exercício sem mapeamento abre a aula de Supino.
- `ExerciseMediaUnifiedPlayer.tsx`: `activeFrameIndex` nunca é zerado ao trocar exercício/frames (o card mantém `key=ex.id`
  depois da troca) e a lista de frames diminui quando um frame falha (`failedUrls`), então aparece `2/1`. O contador também
  aparece com 0 frames. `TechniqueSequencePlayer.tsx:114` mostra `1/0` sem frames e usa um reset em effect (um render com índice antigo).
- `GlobalVideoPlayer.tsx:57`: "Iniciar treino" chama `startWorkout(undefined, ...)`. Com sessão ativa, o `startWorkout`
  (GymFlowContext:2371) só mostra um toast e navega; o CTA precisa virar "Voltar ao treino". Instrutor/credenciais/duração vêm
  de `src/mock/videos.ts` (pessoas fictícias, sem vídeo real) e "Dica de Execução da IA" é texto fixo: não há fonte que
  sustente essa atribuição. `video.level` aparece cru ("BEGINNER").
- Modais (`GlobalVideoPlayer` max-h-95vh p-2, prontidão 92vh, troca 80vh, adicionar 85vh) não têm padding de safe-area.
  targetSdk 36 + Capacitor 7.6.7 → edge-to-edge no Android 15; a TopBar já usa `env(safe-area-inset-top)`.
- `PreWorkoutReadinessModal.tsx`: tem 2 botões "Pular" (cabeçalho e rodapé); todas as respostas vêm pré-preenchidas
  (energy medium, sleep fair, soreness none, stress low, time normal, local "Peito"), então "Concluir" grava respostas que o
  usuário não deu; cada pergunta usa uma cor diferente; os chips de local têm menos de 44px. Os testes existentes contam com esses padrões.
- `Dashboard.tsx:100`: "Seu corpo está pronto..." (afirma recuperação sem avaliação); o card "Recuperação Muscular"
  usa valores fixos; aparece "Streak". O FAB "Treinar" (`Navigation.tsx:208`) aparece no dashboard junto com "Começar Treino".
- `ActiveWorkoutPage`: grade de 12 colunas Ant/Sug | Carga | Reps | RPE | OK; o placeholder do RPE é "8" (parece valor);
  a ActionBar mostra "Série {concluídas+1} de {total}" (conta do treino todo, não do exercício) e "Continuar";
  o modal de adicionar corta em `.slice(0, 40)` sem avisar; a troca bloqueia a lista inteira até ter motivo;
  `swapExerciseInActiveWorkout` retorna void (falha silenciosa). A conclusão da série é um toggle sem trava contra toque duplo.
- Reuso canônico disponível: `src/lib/workout-picker.ts` (abas/seções/busca, `groupExercisesForDayFocus`,
  `getWorkoutPickerTabResult`), `training-taxonomy.ts` (`MUSCLE_GROUPS` com rótulos PT-BR), `exerciseSearch.ts`
  (sem acento), `rankWorkoutSubstitutes` (elegibilidade = mesmo `muscleGroup`), categorias de `equipment-registry`.

## Plano (não iniciado)

1. Mapa de técnica retorna `null`; os callers tratam a ausência mostrando indisponibilidade compacta. Players zeram e
   limitam o índice e não mostram contador sem mídia. GlobalVideoPlayer: "Voltar ao treino" com sessão ativa, autoria/duração/IA
   só com fonte que sustente, nível em PT-BR, safe-area.
2. Check-in "Como você está hoje?": um único Pular, nenhuma resposta pré-selecionada, seleção visual consistente (aria-pressed).
3. Home: saudação compacta, "Seu treino de hoje está pronto", "Continuar treino" com sessão ativa, FAB oculto no dashboard.
4. Sessão: aviso de origem compacto, resumo técnico e anotações recolhidos, série em formato de card no mobile
   (Peso (kg) / Repetições / Concluir série; Esforço 1–10 e RIR em "mais detalhes"), Peso anterior/Peso sugerido,
   "Ir para série atual", série dentro do exercício separada do progresso geral, trava contra toque duplo.
5. Seletores: adicionar com categorias + Todos + contagem + "mostrar mais"; trocar com lista elegível + busca + filtro de
   equipamento, seleção antes da confirmação, motivo exigido só no confirmar, nota recolhida, resultado de sucesso/falha.
6. Testes, QA 360/390/412, revisão Codex, PR, CI, merge, APK.
