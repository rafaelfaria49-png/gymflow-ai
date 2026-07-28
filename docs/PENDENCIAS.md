# Pendências

## GOAL-24 — Substituição estruturada

- **Diff posicional avançado plano×execução fica para depois:** o GOAL-24 guarda, por
  entrada, apenas **original + atual + motivo** (snapshot em `plannedExerciseName`/
  `plannedMuscleGroup`). Uma comparação da sessão inteira (qual slot planejado virou qual
  executado, na ordem) e o histórico completo de trocas sucessivas **não** são
  persistidos — só o primeiro original e a troca atual.
- **`discomfort` não dispara adaptação:** por decisão de escopo, é só um motivo
  registrado. Um GOAL futuro poderia usar desconforto recorrente para sugerir troca
  definitiva ou sinalizar o exercício — hoje não alimenta progressão/sugestão.
- **Motivo não realimenta o motor de progressão/sugestão:** `swapReasonCode` é gravado
  mas não influencia carga/volume/PR/XP nem o ranking de substitutos (continua por grupo
  muscular). Integrar motivo × sugestão é trabalho futuro (dependente do GOAL-20).
- **UI do treino ativo/histórico sem teste de componente:** chips de motivo, nota, gate
  de validação (`ActiveWorkoutPage`) e o bloco de detalhe (`SessionDetailModal`) são
  cobertos indiretamente pela lógica pura (`buildSwapView`, `markEntrySwapped`,
  `normalizeSwapReasonNote`); a interação em si depende de QA manual no navegador
  enquanto o projeto não tiver DOM/Testing Library.

## GOAL-19B.2A — Merge readiness

- **Testes de interação continuam sem DOM/Testing Library:** controller de navegação,
  continuação idempotente, cleanup e `beforeunload` têm cobertura pura; menu mobile, lateral,
  TopBar, diálogo e preservação visual do draft dependem do QA manual no navegador.
- **Repetir a matriz manual do GOAL-19B.2A:** nesta execução a página renderizou em desktop e
  390×844 sem `error`/`warn`, mas a automação do navegador apenas focou os botões e não despachou
  os handlers React em nenhuma das duas instâncias testadas. Os fluxos de descarte, saída após
  salvar, reload e fixtures legadas não foram marcados como aprovados visualmente.
- **Programa flat não pode ser planejado diretamente:** por não possuir `ProgramDay.id` real,
  deve ser aberto/derivado e salvo no formato canônico antes de entrar no calendário. A UI
  informa essa limitação em vez de fabricar vínculo.
- **Warnings herdados de hooks:** manter apenas se a validação focada confirmar os mesmos três
  `react-hooks/exhaustive-deps` já registrados no Context, sem warning novo.

## GOAL-19B — Criação guiada e templates

- **GOAL-20 é o próximo passo natural:** motor de sugestões, filtros e seleção inteligente de exercícios. Este GOAL preparou a superfície (templates estruturais + criação guiada), mas **não** escolhe, pontua nem substitui exercícios — isso permanece proibido até o GOAL-20.
- **Revisão profissional dos templates:** as estruturas (divisões, focos por dia, frequências sugeridas) são de produto e devem ser validadas por um profissional antes de exposição pública, assim como as faixas do GOAL-22.
- **Templates não têm periodização:** `durationWeeks` fica 0 e `repeatWeeks` true (herdado do GOAL-19A). Se um GOAL futuro introduzir mesociclos/periodização nos templates, os campos já existem no draft.
- **Origem histórica adicionada no GOAL-19A.1:** `WorkoutSession` pode guardar `sourceProgramId`/`sourceProgramDayId` opcionais, mas continua sendo um snapshot independente. Essa origem não autoriza apagar ou reconstruir sessão ativa/histórico ao excluir um programa.
- **Testes de componente continuam ausentes** (o projeto não tem ambiente DOM/Testing Library): todo o domínio novo (templates, conversão, ações de programa, busca/filtro/ordenação, dirty-state) é puro e coberto por **60 testes**; a UI (gate de criação, menu, diálogo de exclusão, mobile, teclado) foi coberta por teste manual no navegador. Adotar cobertura de interação quando a infraestrutura existir.
- **`react-hooks` no `GymFlowContext.tsx`:** a validação integrada ficou em zero erros e três avisos de `exhaustive-deps`, localizados em código sensível de persistência/timers. Corrigir os avisos em um passe dedicado de saneamento de efeitos.

## GOAL-19A — Construtor multi-dia

- **GOAL-33A é o gargalo de honestidade do Construtor.** Nenhum dos 126 exercícios tem `primaryMuscleGroupId`; os 23 de perna colapsam em `legs_general`, então nada resolve para quadríceps/posterior. Enquanto isso: a confidence nunca chega a `high`, o filtro "Foco do dia" depende de `LEGACY_GENERIC_COVERAGE` e a análise não consegue confirmar volume direto de subgrupos de perna. Curar a taxonomia remove o mapa e os avisos legados de uma vez.
- **`ExerciseSlot` sem `id` (para o GOAL-23A):** a identidade do slot é o índice dentro do dia. Reordenar/duplicar slots funciona, mas não há identidade estável para vincular um slot a um `SessionLog`. Avaliar `slotId` com migração explícita quando SessionPlan/SessionLog entrar — envolve `mock/programs.ts` e `progression.ts`.
- **Token `gym-amber` está morto (fora do escopo deste GOAL).** `--color-gym-amber` não existe no `@theme` de `globals.css`, então `text-gym-amber`/`bg-gym-amber/10`/`border-gym-amber/30` não geram CSS (0 ocorrências no CSS compilado; `.text-gym-rose` gera normalmente). O aviso de duração do Construtor renderizava sem cor desde o GOAL-10.5. O Construtor migrou para `amber-400` (paleta padrão do Tailwind, que continua ativa); **`ActiveWorkoutPage.tsx` ainda usa `gym-amber` e segue com avisos sem cor**. Corrigir num passe de UI: ou adicionar `--color-gym-amber` ao `@theme`, ou migrar o consumidor restante.
- **`weeklyOccurrences` continua sem uso real no Construtor:** a análise conta cada dia do programa **uma vez por semana** (a semana canônica = os dias do programa). Se o usuário repetir o mesmo dia em dois dias da semana no Planejador, o volume semanal real será maior que o exibido. Resolver quando o Planejador virar fonte de frequência (herda a pendência do GOAL-22).
- ~~**Sem UI para apagar um treino custom**~~ — **resolvido no GOAL-19B**: exclusão de programa customizado com `ConfirmDialog` dedicado, análise de impacto e limpeza das referências futuras do `weeklyPlan`.
- **Reordenação é por botões ←/→**, sem drag-and-drop: não existe infraestrutura segura de DnD no projeto e o GOAL proibia dependência nova. **Reavaliado no GOAL-19B e mantido fora de escopo** (continua proibida dependência nova); reavaliar quando houver infra de DnD.
- **Testes de componente continuam ausentes** (o projeto não tem ambiente DOM/Testing Library): todo o domínio do Construtor é puro e coberto por 139 testes; a UI foi coberta por teste manual no navegador. Adotar cobertura de interação quando a infraestrutura existir.
- **`durationWeeks` fica 0 e `repeatWeeks` true** para programas do Construtor — o Construtor não expõe periodização. Se o GOAL-19B introduzir templates com duração, os campos já existem no draft.

## GOAL-22 — motor de volume e duração / Gate G2

- **Revisão profissional obrigatória:** aprovar ou ajustar faixas semanais, modificadores de retorno, peso 0,5 dos sinergistas, defaults de descanso/setup/transição e bounds antes de exposição pública.
- **Gate G2:** o Founder precisa revisar a proposta em `docs/training/GYMFLOW_VOLUME_AND_DURATION_ENGINE.md`; este commit não equivale a aprovação.
- ~~**GOAL-19A bloqueado pelo Gate G2**~~ — **resolvido em 2026-07-17**: o Founder aprovou o Gate G2 e o GOAL-19A (Construtor multi-dia) foi executado sobre as decisões aprovadas. A revisão profissional das faixas segue obrigatória antes de exposição pública.
- **GOAL-33A:** preencher taxonomia canônica dos 126 exercícios para elevar confidence e reduzir warnings legados.
- Decidir futuramente se o Construtor atual migra da estimativa legada para a detalhada; a troca pode alterar números visíveis e requer aceite de produto.
- Modelar supersets, técnicas avançadas, aquecimento específico e lotação somente em incrementos próprios, com novos testes e sem inferência silenciosa.
- Definir como planos multi-dia informarão `weeklyOccurrences`; frequência do perfil sozinha não identifica quantas vezes cada grupo aparece.
- Storage v1, progressão, programas, catálogo, treino ativo e histórico permanecem fora desta decisão.

## GOAL-21 — perfil de treino e retorno

- **GOAL-22:** consumir o contexto derivado somente após modelar regras explícitas e testáveis de volume/frequência/duração. O status `returning` sozinho não autoriza percentual fixo de redução, deload ou troca de prescrição.
- Validar em pesquisa/uso real se a faixa máxima de 80 anos para experiência aproximada é suficiente; ela é apenas guarda de integridade, não critério de nível.
- O perfil demo permanece sem os campos opcionais para cobrir o fallback legado `active`. Se produtos futuros exigirem status explícito em todos os perfis, fazer migração separada e confirmada, não rewrite silencioso.
- Não existe ação para apagar definitivamente o histórico de retorno. Se ela for criada, deverá usar `ConfirmDialog` e explicar a perda de contexto.
- Testes de componente não foram adicionados porque o projeto não possui ambiente DOM/Testing Library; o seletor é coberto pelo domínio e pelo teste manual. Adotar cobertura de interação quando a infraestrutura de UI existir.

## GOAL-18A — taxonomia e equipamentos

- **GOAL-33A:** curar os 126 exercícios em lotes e preencher os novos campos opcionais. Até lá, `legs` continua `legs_general`; nenhum exercício deve ser inferido automaticamente como quadríceps, posterior ou glúteos.
- Resolver por exercício os 17 mapeamentos `generic`: Leg Press/panturrilha/supino sem modelo, bancos sem inclinação e strings com alternativas (`ou`/`/`). O raw deve continuar preservado para diagnóstico.
- Revisar duplicidades/semelhanças já inventariadas sem apagar IDs prematuramente: nome exato duplicado `biceps_rosca_direta`/`biceps_rosca_w`; dois Leg Press 45° (`legs_leg_press` e `legs_legpress_45`); crucifixo/crossover em polia e duas variações de tríceps com corda semanticamente próximas.
- **GOAL-20:** integrar `normalizeTaxonomyText`, registry e busca aos filtros visuais. A busca existente continua funcional e não mudou neste incremento.
- **GOAL-24:** consumir IDs/padrões na substituição somente após o modelo de sessão; registry isolado não autoriza troca automática.
- O status `active` indica equipamento conhecido/disponível no vocabulário informado, não que haja exercício, foto, vídeo ou prescrição correspondente no catálogo.

## GOAL-17A — persistência v1 segura

- **GOAL-17B (após GOAL-23A):** repetir benchmark em aparelhos Android/iOS de entrada, medir jank real no WebView e então decidir entre particionar chaves ou mover histórico para IndexedDB. As fixtures atuais não justificam a troca física imediata.
- `localStorage` continua síncrono, sem transação nativa e com concorrência “última aba vence”; o commit lógico reduz corrupção/readback divergente, mas não oferece lock entre múltiplas abas/WebViews.
- O backup rolante fica no mesmo origin/aparelho e não substitui uma cópia externa. Export JSON manual é o caminho de recuperação fora do dispositivo.
- Arquivos exportados não são criptografados e contêm dados pessoais de treino. Criptografia não foi simulada; proteção do arquivo continua responsabilidade do usuário até existir requisito/projeto real para isso.
- Validar em dispositivo físico futuro os fluxos de download/upload do WebView Capacitor e atualização por instalação sobre o APK existente. O build mobile preserva a mesma chave, mas comportamento de sistema/limpeza de dados continua dependente do Android.

Problemas encontrados fora do escopo dos GOALs — anotados aqui, não corrigidos.

- (2026-07-03, visto no GOAL-01) `GymFlowContext.tsx` e `AdminPanel.tsx` usam `alert()` nativo em código pré-existente (swap de exercício, replanejar semana, academia cheia, cadastro de exercício). A regra proíbe apenas em código novo; migrar para toasts em GOAL futuro. **Resolvido no GOAL-03** (todos os `alert()`/`confirm()` foram substituídos por `ToastProvider`/`ConfirmDialog`).
- (2026-07-03) Exercícios criados no Admin não persistem (lista de exercícios volta ao mock após refresh) — fora do escopo do GOAL-01; decidir em GOAL futuro se exercícios admin entram no estado persistido.
- (2026-07-03, visto no GOAL-02) `eslint` aponta erros pré-existentes fora do escopo: `setState` síncrono dentro de `useEffect` do cronômetro do treino (`GymFlowContext.tsx`, antes em `ActiveWorkoutPage.tsx`), aspas não escapadas (`react/no-unescaped-entities`) em `ActiveWorkoutPage.tsx` e `LandingPage.tsx`, e `as any`/`any` em alguns pontos legados (`exercises.ts`, `GymFlowContext.tsx`, `EvolutionDashboard.tsx`). Nenhum foi introduzido pelos GOALs seguintes; `npm run build` passa normalmente pois o build não roda lint estrito nesses casos.
- (2026-07-03, visto no GOAL-06) O novo efeito do timer de descanso em `GymFlowContext.tsx` (`setRestSecondsRemaining(0)` dentro do `useEffect`) reproduz o mesmo padrão pré-existente do cronômetro do treino (`setWorkoutDuration(0)`) já listado no item acima — `eslint` aponta o mesmo erro `react-hooks/set-state-in-effect`, mantendo consistência com o padrão já aceito no projeto em vez de introduzir uma abordagem nova isolada.
- (2026-07-03, visto no GOAL-07) `WorkoutProgram.exercises` (lista achatada legada) agora duplica a informação de `weeks[].days[].slots` nos 12 programas mock — mantida por compatibilidade de tipo; avaliar remoção em GOAL futuro quando nenhuma tela depender dela.
- (2026-07-03, visto no GOAL-07) Trocar exercício no Treino Ativo (`swapExerciseInActiveWorkout`) mantém repRange/RPE/restSec do slot original — razoável (o alvo da sessão não muda), mas um motor de progressão futuro deve recalcular pelo exercício substituto.
- (2026-07-03, visto no GOAL-07) `Dashboard` chama `startWorkout(id, prog.name)` com customName, então o nome do treino não inclui o Day (ex.: fica "ABC Hipertrofia Masculino" em vez de "— Dia A"); cosmético, sem impacto funcional.
- (2026-07-03, visto no GOAL-08) `WorkoutSet.rpe` é pré-preenchido com o RPE alvo do slot (ou 7 no legado) e persiste mesmo se o usuário não tocar no campo — o motor então lê um RPE "registrado" que pode não ser real. Aceitável no mock, mas o futuro motor completo deve distinguir RPE informado de RPE default (ex.: gravar rpe undefined até o usuário editar).
- (2026-07-04, visto no GOAL-10.5) `MOCK_WEEKLY_TEMPLATES` (`mock/programs.ts`) continua com `exerciseCount`/`duration` fabricados à mão, exatamente o padrão corrigido neste GOAL — mas confirmado via grep que não é consumido em nenhum lugar de `src/` (dead code). Não removido por estar fora do escopo literal do GOAL-10.5; recomenda-se apagar ou religar a dados reais num GOAL futuro para não virar armadilha se alguém voltar a consumi-lo.
- (2026-07-04, visto no GOAL-10.5) Editar um dia sugerido (não-custom) sempre cria um `customProgram` novo (nunca sobrescreve o original, decisão registrada em DECISOES.md) — mas se o usuário reabrir "Editar" no MESMO dia sugerido várias vezes em sessões diferentes, cada edição gera uma cópia nova em "Meus Treinos" em vez de atualizar a cópia anterior. Sem UI para apagar um treino custom. Avaliar em GOAL futuro: detectar/oferecer "atualizar cópia existente" e/ou adicionar exclusão de treinos em "Meus Treinos".
- (2026-07-04, visto no GOAL-10.5) Nome do treino ativo iniciado pelo Dashboard mostra só o nome do Day (ex.: "Dia A — Peito e Tríceps"), sem o prefixo do programa pai (diferente do fluxo via WorkoutsTab, que mostra "Nome do Programa — Nome do Day"); optou-se por isso para não duplicar o nome quando o Day vem de um treino custom (onde `program.name === day.name`). Cosmético, sem impacto funcional — segue o mesmo espírito do item já registrado no GOAL-07 sobre este ponto.
- (2026-07-05, GOAL-11) A pendência do `MOCK_WEEKLY_TEMPLATES` (GOAL-10.5) foi **resolvida no GOAL-11**: bloco removido de `mock/programs.ts` e do reexport em `mock/data.ts`, zero referências confirmadas por grep.
- (2026-07-05, visto no GOAL-11) Erros de lint legados que permanecem (fora do escopo de "código morto"): `react-hooks/set-state-in-effect` no cronômetro/timer de descanso do `GymFlowContext.tsx` e no `GlobalVideoPlayer.tsx` (padrão aceito do projeto, já registrado), `react/no-unescaped-entities` em `ActiveWorkoutPage.tsx`/`LandingPage.tsx`, e alguns `any` legados (`GymFlowContext.tsx`, `EvolutionDashboard.tsx`, `AdminPanel.tsx`). Todos os warnings de `no-unused-vars` foram zerados no GOAL-11.
- (2026-07-05, visto no GOAL-11) Comentários em `src/components/three/GymFlowAvatarStage.tsx` ainda citam o antigo `BiomechanicalVisualizer` (deletado) — são referência histórica de paridade de API dentro do stack 3D, que é intocável por regra. Limpar quando o Lote 4 (Avatar Kai) mexer nesse arquivo.
- (2026-07-06, visto no GOAL-12) O APK gerado é **debug, não assinado para release** (`webContentsDebuggingEnabled: true`). Publicar exige keystore de release, ajustes de ícone/splash nativos, revisão de políticas e — para valer algo — o backend. Tudo isso é Lote 2+; fora do escopo do GOAL-12.
- (2026-07-06, visto no GOAL-12) O service worker (`public/sw.js`, network-first para navegação) é **redundante dentro do WebView do Capacitor** — os assets já são servidos localmente do bundle. Não atrapalha (fallback de shell continua válido), mas um SW específico para mobile poderia ser cache-first puro da shell. Avaliar só se o SW causar algum atrito no app empacotado; hoje não causa.
- (2026-07-06, visto no GOAL-12) `npm audit` reporta **3 vulnerabilidades moderadas** na árvore de dependências (presentes após a instalação do Capacitor). Não corrigidas: `npm audit fix --force` traria mudanças breaking e está fora do escopo do GOAL. Reavaliar num GOAL de manutenção de dependências.
- (2026-07-06, visto no GOAL-12) A **primeira** execução de `npm run android:build` numa máquina limpa baixa a distribuição do Gradle (~130MB) e pode baixar `build-tools`/plataforma que faltem (o SDK precisa das licenças aceitas e de rede). Builds seguintes são offline/rápidos. Não é um bug — só custo de setup inicial.
- (2026-07-14, GOAL-15) O novo `NumericInput` foi aplicado só ao Treino Ativo e ao WorkoutBuilder (escopo do GOAL). `NutritionPage`, `OnboardingFlow` e `EvolutionDashboard` ainda usam `<input type="number">` com `Number(e.target.value)` — mesma classe de bug (zero à esquerda/decimal), sem impacto no fluxo relatado. Migrar para `NumericInput` num passe futuro (o utilitário já existe).
- (2026-07-14, GOAL-15) O ajuste de safe-area/status bar (CSS `env(safe-area-inset-top)`) **não foi validado em dispositivo/emulador Android real** neste ambiente. O fix é o correto para iOS/notch e deve funcionar no WebView moderno em edge-to-edge; se em algum aparelho o Capacitor 7 (targetSdk 35) não popular `env(safe-area-inset-top)` para a status bar, avaliar num GOAL futuro `@capacitor/status-bar` (`setOverlaysWebView`) ou opt-out nativo de edge-to-edge (`windowOptOutEdgeToEdgeEnforcement`) — ambos exigem tocar em `android/`, evitado agora por risco/escopo.
- (2026-07-14, GOAL-15) `triceps_maquina` ("Extensão de Tríceps na Máquina") entrou **sem foto real** (`images: []`, fallback honesto). Incluir no próximo lote de imagens de exercício e remover da allowlist de "aguardando foto" em `exercises.test.ts`.
- (2026-07-18, GOAL-19A.1) **GOAL-23A:** projetar uma ação deliberada e revisável para promover diferenças da sessão executada ao programa futuro. Não copiar automaticamente carga, reps, RPE, substituições ou exercícios improvisados.
- (2026-07-18, GOAL-19A.1) Validar a persistência do último valor digitado também em WebView Android físico, incluindo `pagehide`, app em background e fechamento pelo sistema; o contrato web usa callback imediato + flush centralizado e não adiciona acesso direto ao storage no input.
- (2026-07-19, GOAL-TF-A) Recalibrar as heurísticas de recomendação de perfil e faixa de exercícios somente após evidência de uso real e revisão profissional. A implementação atual segue os ADRs aceitos e não autoriza adaptação automática do treino; qualquer evolução pertence a um GOAL explícito posterior.

## GOAL-TF-F — Pendências consolidadas do lote Tempo–Foco (2026-07-21)

Consolidação do GOAL de integração/QA (documental, sem código). Itens **novos** são
descritos por inteiro; itens **já registrados** são referenciados para não duplicar.
Formato: **ID — título · status · severidade · origem · impacto · reprodução ·
recomendação · dependências · próximo passo.**

- **TF-F-01 — Toggle de sinergistas no picker.** *Aberto · P3 · GOAL-TF-C.* O toggle
  `[Principais | Incluindo sinergistas]` foi deliberadamente adiado; hoje sinergistas
  é só uma seção colapsável por aba. *Impacto:* nenhum funcional; UX de abrangência
  incompleta. *Reprodução:* abrir picker numa aba de foco → seção "Sinergistas"
  colapsada, sem controle de abrangência. *Recomendação/próximo passo:* GOAL explícito
  posterior de abrangência; sem dependência nova.
- **TF-F-02 — Migração do estimador legado para o detalhado.** *Aberto · P3.*
  Duplicata de intenção do item já registrado no **GOAL-22** (linha "Decidir
  futuramente se o Construtor migra da estimativa legada para a detalhada") e no
  **GOAL-TF-A** (`buildDurationWarning` deprecado que delega ao novo analisador).
  *Próximo passo:* passe dedicado; a troca altera números visíveis e exige aceite de
  produto. **Ver GOAL-22 acima — não reaberto aqui.**
- **TF-F-03 — AI Coach é mock.** *Aberto · P3 · pré-existente.* O AI Coach não faz
  chamada real de IA/rede; respostas são locais. *Impacto:* nenhum no lote Tempo–Foco
  (o motor de sugestão é determinístico e explicitamente sem IA). *Recomendação:*
  quando houver backend/IA real (fora das regras atuais: "não implementar backend"),
  tratar em GOAL próprio. *Próximo passo:* backlog.
- **TF-F-04 — GOAL-33A (curadoria da taxonomia dos 126 exercícios).** *Aberto · P2/P3.*
  **Já registrado** em GOAL-18A, GOAL-19A e GOAL-22. Nenhum exercício resolve para
  quadríceps/posterior; `legs_general` colapsa 23 exercícios; badges "Legado" e
  `LEGACY_GENERIC_COVERAGE` são consequência. *Próximo passo:* curar em lotes.
  **Ver seções acima — não duplicado.**
- **TF-F-05 — `draft.targetMinutes` no nível do programa.** *Aberto · P3 · GOAL-TF-A.*
  O tempo-alvo canônico existe por **dia** (`ProgramDay.targetMinutes`); não há alvo no
  nível do **programa**. *Impacto:* nenhum hoje (a UI opera por dia); um futuro alvo de
  programa exigiria precedência/rollup explícitos. *Reprodução:* inspecionar
  `WorkoutBuilderDraft` — sem campo de tempo no programa. *Recomendação/próximo passo:*
  modelar só quando surgir requisito real de tempo de programa; herda a decisão de
  papéis distintos do GOAL-TF-A.
- **TF-F-06 — Dependência circular `workout-builder.ts ↔ workout-picker.ts`.**
  *Aberto · P3 · GOAL-TF-B.* `filterExercisesByDayFocus` (builder) delega ao picker, e
  o picker importa tipos/utilidades do builder. *Impacto:* build/testes verdes; risco
  de manutenção e de ciclo de import mais rígido. *Reprodução:* rastrear imports entre
  os dois módulos. *Recomendação/próximo passo:* extrair contrato comum para um módulo
  neutro num passe de saneamento; sem urgência.
- **TF-F-07 — Ausência de teste DOM automatizado do picker/teclado.** *Aberto · P3.*
  Todo o domínio é puro e coberto por Vitest em ambiente node; não há
  Testing Library/DOM para exercitar modal, tablist, foco e teclado. *Impacto:* a
  camada de interação depende de QA manual (não executável neste ambiente — ver
  TF-F-10/TF-F-11). *Recomendação/próximo passo:* adotar cobertura de interação quando
  a infraestrutura DOM existir (pendência recorrente desde GOAL-19A/19B).
- **TF-F-08 — Badges com fonte de 8px.** *Aberto · P3 · GOAL-TF-C.* Badges do picker
  usam fonte de 8px. *Impacto:* legibilidade/acessibilidade em telas pequenas.
  *Reprodução:* inspecionar badge "Legado"/grupo no picker. *Recomendação/próximo
  passo:* revisar escala tipográfica num passe de UI; não verificado ao vivo neste GOAL.
- **TF-F-09 — Três warnings históricos do `GymFlowContext`.** *Aberto · P3 ·
  pré-existente.* `react-hooks/exhaustive-deps` em **859/870/908**. Confirmados
  idênticos neste GOAL; **já registrados** (GOAL-19B.2A, GOAL-19B). O lote Tempo–Foco
  não os alterou. *Próximo passo:* passe dedicado de saneamento de efeitos.
- **TF-F-10 — Smoke visual residual do GOAL E.** *Pendente · P2 · GOAL-TF-E/F.* O smoke
  de nomes ("ABC Hipertrofia Masculino" × "Dia A — Peito e Tríceps") está **coberto por
  teste** (`createInitialDraft` regras 1–7), mas o **smoke visual no app não foi
  refeito** neste GOAL porque a extensão do Chrome não estava conectada. *Reprodução:*
  editar um dia de programa sugerido e conferir NOME DO PROGRAMA vs NOME DO DIA.
  *Recomendação/próximo passo:* refazer o smoke visual num ambiente com navegador ativo.
- **TF-F-11 — "1 Issue" do Next DevTools.** *Não reproduzida (classe D) · P2 ·
  GOAL-TF-F.* O indicador "1 Issue" é overlay client-side; sem a extensão do Chrome não
  foi possível ler título/mensagem/arquivo/linha/stack. Investigação sem navegador toda
  limpa: terminal do dev sem issues; `layout.tsx` sem mismatch de tema e sem
  `metadataBase`; render da landing sem `Math.random`/`Date`; assets sem 404.
  *Hipótese (baixa confiança):* issue dev-only de React ligada a padrões legados já
  sinalizados pelo ESLint (`set-state-in-effect` em GlobalVideoPlayer/
  TechniqueSequencePlayer; `refs-during-render` em XPBadgeNotification), que só disparam
  quando esses componentes montam. *Reprodução:* abrir o app com `next dev` + extensão
  do Chrome e clicar no badge. *Recomendação/próximo passo:* GOAL de follow-up com
  navegador para capturar e classificar a issue exata. *Dependência:* extensão do
  Chrome conectada.
- **TF-F-12 — Deduplicação de programas sugeridos.** *Aberto · P3 · GOAL-10.5.**
  Reeditar o MESMO dia sugerido em sessões diferentes ainda cria cópias novas em "Meus
  Treinos". **Já registrado** no GOAL-10.5 (o GOAL-TF-E corrigiu o *nome*, não a
  dedup). *Próximo passo:* detectar/oferecer "atualizar cópia existente" e/ou exclusão
  de treinos. **Ver GOAL-10.5 acima — não duplicado.**
- **TF-F-13 — Novos achados do GOAL-TF-F.** *Aberto · P3 · GOAL-TF-F.*
  (a) **ESLint de projeto inteiro nunca enumerado:** `npm run lint` mostra 12 erros +
  6 warnings, todos pré-existentes, mas o rastreamento dos GOALs A–E só citava os "3
  warnings" do Context (lint escopado aos arquivos tocados). *Próximo passo:* enumerar
  a dívida de lint num passe de saneamento (não bloqueante; build não roda lint
  estrito). (b) **Rótulo "GOAL D" fora do padrão:** os demais são `GOAL-TF-X`; o D é
  "GOAL D" em GOALS_LOG/DECISOES. *Próximo passo:* renomear apenas se e quando houver um
  passe documental autorizado (não renomeado aqui para não reescrever histórico). (c)
  **Ordenação do GOALS_LOG:** GOAL D no topo e TF-A..E no fim do arquivo (ordem
  inconsistente). *Próximo passo:* reordenar num passe documental. (d) **QA visual/
  DevTools bloqueada pelo ambiente:** ver TF-F-10/TF-F-11.

## GOAL-23A — domínio de sessão (registradas, fora de escopo)

- **23A-01 — ID canônico do `ExerciseSlot`.** *Aberto · P2 · GOAL-23A.* Decisão
  aprovada foi NÃO adicionar id ao slot; a ligação entrada↔plano é posicional
  (`plannedSlotIndex`). *Próximo passo:* avaliar um id estável de slot se/quando a
  reordenação de slots ou o diff plano×execução exigir identidade não-posicional.
- ~~**23A-02 — Visualização dos status na UI.**~~ — **resolvido no GOAL-23B:**
  badges de status (Concluída/Parcial/Abandonada/Em andamento), origem
  (Planejado/Adicionado/Substituído) e execução (Realizado/Parcial/Pulado) agora
  aparecem no histórico, no detalhe da sessão e no treino ativo.
- **23A-03 — Sessões abandonadas no histórico.** *Aberto · P2 · GOAL-23A.*
  `cancelWorkout` ainda descarta sem gravar; `buildAbandonedSessionLog` existe mas
  não está ligado. *Próximo passo:* decidir se cancelar registra um log
  `abandoned` e como exibi-lo sem poluir métricas.
- **23A-04 — Motivo de substituição.** *Aberto · P3 · GOAL-23A.*
  `swapExerciseInActiveWorkout` recebe `reason?` (só toast) e marca
  `entryOrigin: 'swapped'`, mas o motivo não é persistido na entrada. *Próximo
  passo:* campo opcional de motivo no `ActiveExercise` quando houver UI para ele
  (GOAL-24).
- ~~**23A-05 — Exercícios e séries pulados na UI.**~~ — **resolvido no GOAL-23B:**
  o detalhe da sessão distingue concluído × incompleto × pulado (badges de execução
  + contagens por exercício/série); a prévia do resumo final mostra pulados.
- ~~**23A-06 — GOAL-23B.**~~ — **executado no GOAL-23B** (2026-07-22).
- **23A-07 — GOAL-24 (não iniciado).** *Aberto · GOAL-24.* Escopo posterior ao
  domínio de sessão. Não iniciado.

## GOAL-23B — experiência visual da sessão (2026-07-22)

- **23B-01 — Motivo de substituição (GOAL-24).** *Aberto · P3.* O badge
  `Substituído` aparece, mas o motivo não é persistido nem exibido. *Próximo
  passo:* campo opcional de motivo + UI (GOAL-24).
- **23B-02 — Diff avançado plano×execução (GOAL-24).** *Aberto · P2.* O detalhe
  mostra origem e execução por entrada, mas não compara posicionalmente "qual
  exercício planejado virou qual" nem destaca as trocas como diff. *Próximo passo:*
  diff plano×execução no GOAL-24 (exige decidir se `ExerciseSlot` ganha id — ver
  23A-01).
- **23B-03 — Sessões abandonadas no histórico.** *Aberto · P2.* Duplicata intencional
  do 23A-03: o badge `Abandonada` existe e renderiza, mas `cancelWorkout` ainda
  descarta, então nenhuma sessão abandonada chega ao histórico hoje. *Próximo
  passo:* decidir política de registro de cancelamento.
- **23B-04 — QA visual/interativa pendente.** *Aberto · P2.* A camada de
  apresentação é pura e coberta por testes (34 em `workout-session-view.test.ts`),
  mas a inspeção visual no navegador (abertura/fechamento do modal, badges em
  desktop/mobile 360px, teclado/Enter/Espaço no card clicável) depende de sessão
  manual com navegador — não executada neste ambiente. *Próximo passo:* repetir a
  matriz QA do GOAL-23B num ambiente com navegador ativo.
- **23B-05 — Teste DOM automatizado do modal/badges.** *Aberto · P3.* O projeto
  não tem Testing Library/DOM; a interação (ESC, overlay, foco, tablist) segue
  coberta por revisão de código + testes puros. *Próximo passo:* adotar cobertura
  de interação quando a infraestrutura DOM existir (pendência recorrente).

## GOAL-17B-002A — fundação IndexedDB (2026-07-22)

- **17B-004 — Integridade pós-write/readback.** *Encerrado em 2026-07-22.* O
  adapter, e não o chamador, calcula `verified`; somente conteúdo e checksums
  confirmados após o primeiro commit permitem a segunda transação marcar `true`.
- **17B-002A-BLOCKED — Sucesso tardio após abertura bloqueada.** *Pendente · P2.*
  Fechar explicitamente uma conexão que conclua `onsuccess` depois de `onblocked`
  já ter rejeitado a abertura, evitando conexão órfã.
- **17B-002A-METADATA-GUARD — Proteção runtime do ponteiro ativo.** *Pendente ·
  P2.* Rejeitar `activeGeneration` dentro da implementação de `writeMetadata`,
  além da exclusão já imposta pelo tipo TypeScript.
- **17B-002A-ENV-COVERAGE — Coberturas adicionais.** *Pendente · P2.* Cobrir
  `blocked`, `versionchange`, erro de abertura, operações sem geração ativa e
  append após delete. O corretivo 004 cobreu Web Crypto e falhas do snapshot.
- **17B-002B — Migração v1.** *Concluída em 2026-07-22.* O mecanismo desconectado
  valida e normaliza o envelope recebido por parâmetro, salva snapshot, prepara
  geração inativa e confirma contagem/ordem/conteúdo/checksum antes de ativar.
  Retomada usa `migrationGeneration`; nenhuma chave v1 é lida ou apagada.
- **17B-002C — Integração do Context.** *Concluída em 2026-07-23.* O cutover
  verificável grava o core físico v2 somente após snapshot, backup, geração e
  readback; hidratação assíncrona, append incremental e reconciliação pós-kill
  mantêm uma única fonte de histórico por modo.
- **17B-002D — Import/export e rollback.** *Pendente · P1.* Agregar localStorage e
  IndexedDB no arquivo lógico, revisar o limite de 5 MiB e definir downgrade/
  rollback sem reintroduzir o save integral em cada sessão.
- **17B-002A-PHYSICAL — Gate de aparelho.** *Pendente · P1.* Medir Android WebView
  de entrada: migração 100/500/1.000, cold start, background/kill, update por
  `adb install -r`, quota e recuperação. Benchmark de `fake-indexeddb` é somente
  informativo.
- **17B-002A-CONCURRENCY — Escritores concorrentes.** *Pendente · P2.* As
  transações protegem atomicidade dentro do banco, mas a integração futura deve
  definir coordenação entre abas/WebViews antes de ativar escrita real.

## GOAL-17B-002C corretivo 014 (2026-07-23)

- **17B-002C-P1-A — Geração ausente hidratada como vazia.** *Encerrado em
  2026-07-23.* Manifest verificado por geração com digest ordenado encadeado.
  Geração ausente, manifest ausente, perda parcial/total, registro extra, ordem
  divergente e manifest adulterado bloqueiam por integridade.
- **17B-002C-P1-B — Efeitos perdidos após append confirmado.** *Encerrado em
  2026-07-23.* Receipt durável e idempotente na mesma transação da sessão e do
  manifest; `coreEnvelopeAfter` gravado e verificado antes de qualquer estado
  React; recuperação processada antes de liberar o autosave.
- **17B-002C-P1-C — Callbacks após unmount.** *Encerrado em 2026-07-23.*
  `mountedRef`, `pendingFinalizationPromiseRef`, rastreamento de operações
  duráveis e contagem de retenções no runtime.
- **17B-002C-C06 — Core de conclusão falho voltava a ready.** *Encerrado em
  2026-07-23.* Com o receipt já confirmado e a gravação do `coreEnvelopeAfter`
  falhando, o `pendingCompletionCore` continuava ativo, mas uma gravação
  posterior bem-sucedida devolvia `storageHealth` para `ready` enquanto o receipt
  seguia pendente — e as edições feitas depois da falha não estavam sendo
  persistidas, embora o app anunciasse "salvo". Política conservadora adotada: a
  montagem inteira permanece em recuperação necessária, o autosave normal fica
  suspenso, `reportWriteResult` não promove para `ready`, `finishWorkout` recusa
  uma segunda execução e só um novo boot liquida o receipt.
- **17B-002C-C01 — Geração legada sem manifest bloqueia.** *Aberto · P2.* Um
  banco físico na versão 1 preserva os registros, mas não tem manifest e entra
  em `blocked`. Nenhum usuário real está nessa situação (o 002C nunca foi
  publicado). *Próximo passo:* decidir no 002D se vale um backfill explícito de
  manifest, com verificação, ou se o caminho é sempre recuperação manual.
- **17B-002C-C02 — Base otimista do append.** *Aberto · P2.* O digest encadeado
  é calculado fora da transação (o `crypto.subtle` desativaria a transação
  IndexedDB) e a transação de escrita reconfere a base. Isso é suficiente para
  um único escritor; escritores concorrentes entre abas continuam sendo
  17B-002A-CONCURRENCY. *Próximo passo:* definir a coordenação entre abas antes
  de ativar escrita real.
- **17B-002C-C03 — Postagem recuperada é materializada uma vez só.** *Aberto ·
  P3.* Após a liquidação do receipt, a postagem não é replicada em boots
  seguintes — ela nunca foi persistida (o feed é `MOCK_COMMUNITY` em memória).
  *Próximo passo:* reavaliar quando o feed tiver persistência real.
- **17B-002C-C04 — Notificação de level up fora do updater.** *Aberto · P3.* O
  helper puro emite a notificação de level up antes da notificação de XP
  correspondente; no código anterior ela era empilhada dentro do updater de
  `setUser` e aparecia depois. Diferença apenas visual e de ordenação.
  *Próximo passo:* confirmar a ordem desejada em QA visual.
- **17B-002C-C05 — QA visual do fluxo de conclusão.** *Aberto · P2.* A matriz
  visual (toast de recuperação, card de XP, feed, navegação para o dashboard)
  segue coberta por testes de integração do Provider e revisão de código; a
  inspeção no navegador não foi executada neste ambiente. *Próximo passo:*
  repetir a matriz com navegador ativo.
- **17B-002D — Import/export e rollback.** *Pendente · P1.* Executados até aqui:
  o corretivo de honestidade da UI (**002D-A0**) e a fundação interna do
  IndexedDB (**002D-A1**). O 002D-A foi subdividido: **002D-A2 não foi
  iniciado**. Agregar `localStorage` e IndexedDB no arquivo lógico, revisar o
  limite de 5 MiB e definir downgrade continuam pendentes. Exportação,
  importação, restauração, reset e rollback híbridos seguem **não
  implementados** e bloqueados em modo híbrido.
- **17B-002D-A2 — Fachada segura do runtime administrativo.** *Aberto · P1.* O
  002D-A1 entregou as primitivas físicas (receipts administrativos, enumeração,
  leitura verificada e rollback do ponteiro), mas **nenhuma tem call site real**.
  Falta o runtime que coordene core v2 do `localStorage` e ponteiro do
  IndexedDB, liquide o receipt e retome operação interrompida no boot.
  *Próximo passo:* construir a fachada no 002D-A2 antes de qualquer exposição.
- **17B-002D-A1-P1 — `rollbackToHistoryGeneration` não é rollback completo.**
  *Aberto · P1.* A primitiva move apenas `metadata.activeGeneration`. O core v2
  no `localStorage` continua apontando para a geração anterior, então usá-la
  isolada deixaria core e histórico divergentes. Não há call site hoje, e não
  pode haver antes da coordenação. *Próximo passo:* coordenar no 002D-A2/C/D.
- **17B-002D-A1-P0-1 — Janela entre verificação e commit do rollback.**
  *Encerrado em 2026-07-24 (corretivo do A1).* A auditoria independente
  classificou o A1 como Classe C e reproduziu, em banco real, o rollback
  ativando uma geração cujo conteúdo mudara depois de verificado — com sessão
  alterada, removida e adicionada, manifest intacto. Causa: `workoutHistory`
  ficava fora da transação de escrita. A transação passou a incluir o store e os
  registros são reconferidos sincronamente contra uma prova canônica montada
  antes dela. As três reproduções viraram testes permanentes.
- **17B-002D-A1-P0-2 — `TypeError` na enumeração com chave de metadata não
  textual.** *Encerrado em 2026-07-24 (corretivo do A1).*
  `listHistoryGenerations` chamava `startsWith` direto na chave. Agora a chave é
  validada e o caso vira `HistoryMetadataIntegrityError`, sem listagem parcial e
  sem mutação.
- **17B-002D-A1-P2 — Índices `byKind` e `byUpdatedAt` ainda sem consulta.**
  *Aberto · P3.* Os três índices do store `storageOperationReceipts` foram
  criados na v4 conforme o schema, mas a listagem atual varre o store inteiro
  para ser fail-closed sobre registros sem status válido. `byKind` e
  `byUpdatedAt` só terão consulta dirigida quando o runtime do A2 precisar
  filtrar por tipo ou por janela de tempo. *Próximo passo:* usar ou remover ao
  fechar o 002D-A2.
- **17B-002D-A1-P3 — Sem downgrade físico da versão 4.** *Aberto · P2.* O
  upgrade v3 → v4 é aditivo e idempotente, mas não existe caminho de volta: um
  banco já na versão 4 não abre em build antiga (`VersionError`). O mesmo já
  valia para v2 e v3; a v4 amplia a janela. *Próximo passo:* decidir política de
  downgrade junto do 002D-F.
- **17B-002D-P0-1 — Recuperação legada incompatível exibida em v2.**
  *Encerrado em 2026-07-24 (002D-A0).* O `StorageRecoveryNotice` mostrava
  "Restaurar backup" e "Iniciar dados novos" com envelope físico v2 bloqueado,
  embora o Context recusasse as duas. As ações passaram a depender de
  `resolveStorageRecoveryCapabilities`; em v2 resta apenas o download do
  conteúdo bruto, que é somente leitura.
- **17B-002D-E01 — `hasBackup` continua semanticamente ambíguo.** *Aberto · P1.*
  O valor vem do parser v1 e, em modo híbrido, descreve o backup congelado no
  cutover — não o backup rolante do core (`:hybrid-core-backup:v2`). O 002D-A0
  impediu que ele ofereça restauração incompatível, mas o mesmo rótulo continua
  cobrindo duas semânticas no chip "Backup disponível" do AdminPanel.
  *Próximo passo:* separar as ações nomeadas de restauração no 002D-E.
- **17B-002D-E02 — Textos do AdminPanel citam identificador interno de GOAL.**
  *Aberto · P3.* O banner de "Dados locais" e os toasts de recusa mencionam
  "GOAL-17B-002D". Não é ação executável nem promessa de restauração — os botões
  já estão desabilitados —, então ficou fora do escopo do 002D-A0.
  *Próximo passo:* substituir por linguagem de produto ao reescrever o painel no
  002D-E.
- **17B-002A-PHYSICAL — Gate de aparelho.** *Pendente · P1.* Continua
  obrigatório: medir Android WebView de entrada (migração 100/500/1.000, cold
  start, background/kill, update por `adb install -r`, quota e recuperação)
  antes de qualquer ativação para usuários. `fake-indexeddb` é informativo.
- **17B-002D-A2-P1 — Recuperação de operação interrompida ainda manual.**
  *Aberto · P1.* `inspectStorageAdministration` diagnostica corretamente um
  receipt `staged`/`activating`/`activated` órfão (estado `interrupted`), mas
  nada no A2 conclui, reverte ou limpa staging automaticamente — por desenho
  desta etapa. Um receipt travado em `activating` depois de uma etapa futura
  real (002D-C/D) fica visível, porém irresolvido, até o coordenador atômico
  existir. *Próximo passo:* implementar a resolução em 002D-C/D.
- **17B-002D-A2-P2 — `stagedGenerationId`/`targetCoreRaw` reservados para C/D.**
  *Resolvido no corretivo 036 (2026-07-24) · era P2.* O A2 original aceitava os
  dois campos no `beginStorageOperation` e gravava no receipt uma promessa que
  nenhum fluxo cumpria. Agora `beginStorageOperation` **exige que ambos sejam
  `null`** e recusa com `StorageAdministrationInputError` antes de qualquer
  leitura ou escrita. Os campos continuam no contrato do
  `StorageOperationReceipt` (desde o A1) para uso de 002D-C/D, quando o staging
  físico passar a existir de verdade.
- **17B-002D-A2-P3 — `active-generation-corrupt` usava a flag do manifest.**
  *Resolvido no corretivo 036 (2026-07-24) · era P3, e a classificação estava
  errada.* Auditoria independente reproduziu seis corrupções físicas
  (conteúdo alterado mantendo digest, digest alterado, ordem trocada, sessão
  removida, sessão adicionada, `orderedDigest` incorreto) em que
  `inspectStorageAdministration` devolvia **`ready`** enquanto
  `readVerifiedAdministrationGeneration` reprovava a MESMA geração — Classe C,
  não P3. `ready` agora exige verificação criptográfica integral
  (`verifyHistoryGeneration` sobre o snapshot atômico: contagem, ordem, digests
  por registro e `orderedDigest`). A flag persistida continua visível em
  `HistoryGenerationSummary.verified`, explicitamente documentada como flag e
  não como prova.
- **17B-002D-A2-P4 — o custo do diagnóstico cresce com o histórico.**
  *Aberto · P2.* `inspectStorageAdministration` faz duas leituras atômicas
  completas e uma verificação criptográfica integral da geração ativa por
  chamada. Isso é o preço de `ready` não mentir, mas significa que o diagnóstico
  não é barato o suficiente para rodar em loop de render ou a cada tecla. Não há
  call site real ainda, então nada regride hoje. *Próximo passo:* quando
  002D-C/D ligar a fachada a uma tela, medir com histórico real no WebView
  Android e, se necessário, cachear o snapshot por fingerprint — nunca
  enfraquecer a verificação.
- **17B-002D-A2-P5 — operação `activating` não tem como avançar no A2.**
  *Aberto · P3.* Como o A2 não cria staging físico nem grava core alvo, um
  receipt só pode ir de `staged` para `activating` e daí para `reverted`:
  `activated` exige evidência (`stagedGenerationId` e `targetCoreRaw` reais,
  geração alvo ativa, core alvo gravado) que nenhuma etapa desta fase produz, e
  a transição é recusada antes de escrever. É o comportamento correto — avançar
  criaria um receipt afirmando um mundo inexistente —, mas significa que o ciclo
  completo só fecha em 002D-C/D. *Próximo passo:* o coordenador atômico de C/D
  passa a produzir os efeitos e, aí sim, `activated` e `settled` ficam
  alcançáveis.
- **17B-002D-A2-P6 — recuperação de operação interrompida continua manual.**
  *Aberto · P1.* Ver 17B-002D-A2-P1: o corretivo 036 melhorou o diagnóstico
  (agora um receipt incoerente com core/metadata vira `conflicted` em vez de
  `interrupted` genérico), mas continua não existindo resolução automática. O
  corretivo 038 acrescentou `revertStorageOperationSafely`, que ao menos garante
  uma saída — encerrar a operação como `reverted` sem ficar preso —, mas ela é
  um caminho interno sem call site: alguém precisa chamá-la. *Próximo passo:* o
  coordenador de 002D-C/D decide quando encerrar automaticamente.
- **17B-002D-A2-P7 — TOCTOU do core na transição.** *Resolvido no corretivo 038
  (2026-07-25) · era Classe C.* Auditoria independente reproduziu, com fault
  injection real, a transição avançando `staged → activating` sobre um core do
  `localStorage` já trocado — antes da transação e durante ela. O receipt ficava
  **preso em `activating`**: o `inspect` seguinte virava
  `conflicted/operation-incompatible` e `transitionStorageOperation`, que exige
  `interrupted`, recusava até a reversão. Agora a transição relê o core antes,
  exige igualdade byte a byte com o core do diagnóstico, revalida o envelope,
  reconfere a compatibilidade, e depois do commit relê o core, o receipt e a
  metadata. Qualquer divergência compensa para `reverted` e devolve
  `StorageOperationTransitionConflictError` com `phase`, `reason` fechada,
  resultado da compensação e último status conhecido.
- **17B-002D-A2-P8 — a saída de emergência não tem call site.** *Aberto · P3.*
  `revertStorageOperationSafely` existe e é testada, mas nada no produto a
  chama: não há UI, Provider nem boot ligados à fachada administrativa. Um
  receipt preso por falha de compensação continua exigindo uma chamada
  deliberada. *Próximo passo:* 002D-C/D expõe a resolução junto do coordenador
  atômico.
- **17B-002D-A2-P9 — sem owner-token, duas abas continuam podendo disputar.**
  *Aberto · P2.* O protocolo do 038 garante que a transição não conclui sobre um
  core obsoleto, mas não impede uma segunda aba de escrever no `localStorage`
  durante a operação — ela só faz a operação falhar de forma honesta. A exclusão
  real depende do owner-token, que continua fora de escopo. *Próximo passo:*
  owner-token em etapa posterior, antes de qualquer operação administrativa
  real.

## GOAL-17B-002D-B — formato lógico de backup v2 (2026-07-25)

- **17B-002D-B-P1 — performance da exportação no WebView físico não foi medida.**
  *Aberto · P2.* A captura roda três diagnósticos administrativos completos (o
  primeiro, o interno de `readVerifiedAdministrationGeneration` e o segundo),
  cada um com duas leituras atômicas e verificação criptográfica integral da
  geração ativa, mais um SHA-256 sobre o payload canônico inteiro. Com histórico
  grande isso não é barato, e o custo herda o 17B-002D-A2-P4. Não há call site
  real, então nada regride hoje. *Próximo passo:* medir com histórico real no
  WebView Android antes de 002D-E ligar a exportação a uma tela; se necessário,
  reaproveitar o primeiro diagnóstico em vez de refazê-lo dentro da leitura
  verificada — nunca enfraquecer o double-check.
- **17B-002D-B-P2 — download do arquivo v2 no aparelho físico continua
  pendente.** *Aberto · P1.* Este slice devolve `content`, `filename` e `bytes`
  e para aí: não cria `Blob`, `URL` nem elemento de âncora, e `downloadTextFile`
  continua sendo do fluxo v1. Salvar 8–25 MiB num WebView Capacitor é
  exatamente o cenário que o 17B-002A-PHYSICAL nunca validou. *Próximo passo:*
  002D-E decide o mecanismo de entrega (download, Share Sheet ou Filesystem do
  Capacitor) e valida em aparelho real.
- **17B-002D-B-P3 — o arquivo v2 carrega dados pessoais em texto puro.**
  *Aberto · P2.* O payload traz perfil (nome, e-mail, idade, peso, altura),
  medidas corporais, nutrição e todas as sessões, sem anonimização e sem
  criptografia. É o mesmo nível do backup v1, mas agora num arquivo maior e mais
  fácil de compartilhar por engano. *Próximo passo:* a etapa de UI precisa
  avisar explicitamente antes de exportar; criptografia opcional com senha, se
  vier, é GOAL próprio.
- **17B-002D-B-P4 — não existe importação, restauração ou rollback do v2.**
  *Parcialmente fechado · P1.* Rótulo corrigido pelo corretivo 055: este item
  vinha marcado como `Aberto · P0 para o produto`, fora da escala usada em todo o
  resto do documento e já desatualizado — a seção do C1 o declara parcialmente
  fechado desde 2026-07-27. `commitLogicalStorageImportV2` existe, é jornalizada
  e leva um arquivo v2 validado até `settled`; o que continua faltando é call
  site (002D-E) e recuperação após reload (002D-C2). Enquanto isso, o usuário v2
  ainda não consegue restaurar pela interface. *Próximo passo:* 002D-C2 executa a
  recuperação e 002D-E liga a importação a uma tela.
- **17B-002D-B-P5 — o backup não tem call site, então o usuário ainda não pode
  gerar arquivo nenhum.** *Aberto · P1.* Nenhum componente, Provider, boot ou
  `AdminPanel` importa `storage-logical-backup`. No modo v2 a exportação
  continua bloqueada na UI exatamente como antes deste slice. *Próximo passo:*
  002D-E liga a exportação ao painel administrativo, junto do aviso de dados
  pessoais e do tratamento de arquivo grande.
- **17B-002D-B-P6 — retenção, rotação e limpeza de backups não existem.**
  *Aberto · P3.* Nada apaga, roda ou limita backups antigos: cada exportação é
  um arquivo solto sob responsabilidade do usuário. *Próximo passo:* 002D-F, se
  o produto decidir manter cópias no aparelho.
- **17B-002D-B-P7 — a janela da captura protege o que observou, não o futuro.**
  *Aberto · P2.* Herda 17B-002D-A2-P9: sem owner-token, uma segunda aba pode
  escrever no `localStorage` durante a exportação. O protocolo garante que isso
  **derruba** a exportação (`snapshot-changed-during-export`) em vez de produzir
  um arquivo inconsistente — não garante exclusão mútua. Uma escrita iniciada
  depois da leitura final é um evento novo e aparece na próxima exportação.
  *Próximo passo:* owner-token antes de qualquer operação administrativa real.

## GOAL-17B-002D-B corretivo 046 — auditoria Classe C (2026-07-26)

### Fechados por este corretivo

- **17B-002D-B-C1 — corrida ABA (`H1 → H2 → H1`).** *Fechado.* A captura
  comparava só os dois diagnósticos que cercam a leitura verificada; um
  histórico que ia a `H2` e voltava byte a byte para `H1` produzia diagnósticos
  idênticos, com o mesmo `administrationFingerprint`, e a exportação retornava
  sucesso contendo `H2`. Agora a leitura intermediária é comparada
  integralmente com a geração verificada descrita por A **e** por B.
- **17B-002D-B-C2 — contrato externo aberto.** *Fechado.* Oito chaves próprias
  enumeráveis, conferidas por `Reflect.ownKeys` e descritores.
- **17B-002D-B-C3 — payload raiz aberto.** *Fechado.* Exatamente 16 campos
  lógicos, com recusa estrutural e mensagem genérica para campo desconhecido.
- **17B-002D-B-C4 — normalização silenciosa de valores não JSON.** *Fechado.*
  Árvore validada e copiada antes de canonicalizar; `undefined`, função,
  símbolo, `BigInt`, não finito, `Date`, `Map`, `Set`, `ArrayBuffer`,
  `TypedArray`, `RegExp`, `Promise`, `WeakMap`, `WeakSet`, protótipo
  customizado, array esparso, propriedade extra em array, propriedade
  simbólica, propriedade não enumerável, getter, setter e ciclo são recusados.
- **17B-002D-B-C5 — chaves perigosas aninhadas.** *Fechado.* `__proto__`,
  `prototype` e `constructor` recusadas em todos os níveis por chave própria
  real.
- **17B-002D-B-C6 — datas não canônicas.** *Fechado.* Só
  `YYYY-MM-DDTHH:mm:ss.sssZ`, com regex estrita e ida e volta por
  `toISOString()`.
- **17B-002D-B-C7 — `declaredBytes` inválido.** *Fechado.* Novo motivo
  `invalid-size`; nunca mais `bytes: NaN`, aviso `NaN` ou tamanho decimal.
- **17B-002D-B-C8 — vazamento de dados em mensagem de erro.** *Fechado.*
  Mensagens sanitizadas, caminho só com nomes conhecidos e índices, `cause`
  público apenas em falha interna confiável.
- **17B-002D-B-C9 — ordem da inspeção.** *Fechado.* Fail-fast fixa; nenhum
  SHA-256 sobre payload não validado.

### Abertos

- **17B-002D-B-P8 — o vínculo protege o conteúdo LÓGICO, não todo detalhe
  físico invisível ao arquivo.** *Aberto · P3.* Uma mutação puramente física que
  não altere manifest nem sessões — por exemplo trocar o `digest` gravado de um
  registro por `null`, que a verificação tolera como registro legado — vai e
  volta sem que a leitura intermediária possa enxergá-la, porque
  `readVerifiedAdministrationGeneration` devolve apenas `generationId`,
  `manifest` e `sessions`. O conteúdo exportado continua correto nesse caso; o
  que não existe é detecção. *Próximo passo:* se algum dia o backup precisar
  atestar o estado físico, a leitura verificada precisa devolver também os
  digests por registro.
- **17B-002D-B-P9 — `<campo>` no caminho de erro depende de uma lista de nomes
  conhecidos.** *Aberto · P3.* A lista cobre o esquema atual; um campo novo do
  domínio que ainda não esteja nela aparece redigido. É a falha segura correta —
  perde precisão, nunca vaza —, mas exige manutenção junto com os tipos.
  *Próximo passo:* revisar a lista sempre que `PersistedState` ganhar campo.
- **17B-002D-B-P10 — a corrida ABA foi fechada na LEITURA, não na ESCRITA.**
  *Aberto · P2.* Continua sem owner-token e sem lock entre abas: outra aba pode
  escrever durante a exportação. A garantia é que isso **derruba** a exportação
  (`snapshot-changed-during-export`), nunca que produza arquivo inconsistente.
  Reforça 17B-002D-B-P7 e 17B-002D-A2-P9. *Próximo passo:* owner-token.
- **17B-002D-B-P1 a P7 continuam abertos e inalterados.** Este corretivo **não**
  criou importação, restauração, rollback, reset, UI, Provider, download,
  owner-token nem call site; 002D-C/D/E/F seguem não iniciados.

## GOAL-17B-002D-C1 — importação lógica v2 atômica (2026-07-27)

Auditoria 052: **APTO / Classe B**. O slice C foi dividido em C1 (este) e C2.

### Fechado por este slice

- **17B-002D-B-P4 — não existia importação do v2.** *Parcialmente fechado.*
  `commitLogicalStorageImportV2` existe, é jornalizada e leva um arquivo v2
  validado até `settled`. Continua **sem call site**: o usuário ainda não
  consegue disparar uma importação pela interface (isso é 002D-E).

### Abertos

- **17B-002D-C1-P0 — a recuperação após interrupção existe como DECISÃO, não
  como execução.** *Aberto · P0.* `resolveLogicalImportRecovery` é puro e diz o
  que fazer diante de cada estado; **não existe** `recoverLogicalStorageImportV2`
  com I/O real e **nada roda no boot**. Existe exatamente uma janela em que uma
  queda deixa o aplicativo sem hidratar: entre o commit da ativação da geração e
  o readback do core (`metadataMatchesV2` exige `activeGeneration ===
  core.historyStorage.generationId`). O journal guarda os dois mundos completos,
  então o estado é recuperável — mas ninguém o recupera ainda. Nenhum usuário
  está exposto: não há call site. *Próximo passo:* C2 implementa a execução das
  decisões; D liga a recuperação ao boot **antes** de qualquer confiança em
  `hydrate()`.
- **17B-002D-C1-P1 — a matriz completa de crash points é do C2.** *Aberto · P1.*
  O C1 cobre falha de cada etapa e compensação imediata, mas não injeta queda
  depois de cada write com reinício do processo, nem prova retomada após reload,
  nem repetição idempotente de cada etapa a partir do disco. *Próximo passo:* C2.
- **17B-002D-C1-P2 — geração órfã depois de uma falha pós-ativação.**
  *Aberto · P2.* A compensação apaga a geração criada pela operação apenas
  quando ela nunca foi ativada. Se a falha acontece depois da ativação, a
  restauração devolve a geração anterior e a geração importada fica como órfã
  inativa. Importações que falham repetidamente nesse ponto acumulam registros e
  consomem quota. Apagar uma geração que já foi ativa é mais delicado e ficou
  fora do C1. *Próximo passo:* política de retenção/limpeza em D/F.
- **17B-002D-C1-P3 — custo do fluxo não foi medido em aparelho.** *Aberto · P2.*
  Uma importação roda quatro diagnósticos administrativos completos (cada um com
  duas leituras atômicas e verificação criptográfica integral da geração ativa),
  mais o digest do payload, mais os digests de todas as sessões importadas, mais
  duas verificações integrais da geração nova. Herda 17B-002D-A2-P4 e
  17B-002D-B-P1. Com histórico grande no WebView Android isso não é barato.
  *Próximo passo:* medir antes de 002D-E ligar a importação a uma tela; nunca
  enfraquecer a verificação para ganhar tempo.
- **17B-002D-C1-P4 — ABA no core do `localStorage` continua indetectável.**
  *Aberto · P2.* O protocolo relê o core e exige igualdade byte a byte antes e
  depois de cada passo, mas um core que sai de `P`, passa por `X` e volta a `P`
  dentro da janela passa despercebido. Sem owner-token não há como distinguir.
  Reforça 17B-002D-A2-P9 e 17B-002D-B-P10. *Próximo passo:* owner-token no 002D-E,
  antes de qualquer operação administrativa real.
- **17B-002D-C1-P5 — o receipt guarda dois cores completos.** *Aberto · P2.*
  `previousCoreRaw` e `targetCoreRaw` são exigência do invariante "o core atual
  deve ser preservado integralmente no journal", mas dobram o custo de
  armazenamento por operação e continuam no IndexedDB depois de `settled` — com
  dados pessoais em texto puro, como o próprio backup (17B-002D-B-P3). Eles nunca
  saem no retorno público. *Próximo passo:* política de retenção/expurgo de
  receipts liquidados em D/F.
- **17B-002D-C1-P6 — o teste 60 do slice B passou a listar o importador.**
  *Aberto · P3.* O guard afirma, por igualdade exata, quem menciona
  `storage-logical-backup` em `src/`. O importador chama
  `inspectLogicalStorageBackupV2` de propósito — é o que impede o TOCTOU entre
  validar o arquivo e gravá-lo —, então a lista passou de um para três arquivos.
  Ele continua sendo consumidor de biblioteca, **não** call site: nenhuma UI,
  Provider, Context, boot ou componente importa qualquer um dos dois módulos.
  *Próximo passo:* revisar a lista sempre que um consumidor novo aparecer, e
  nunca relaxar a igualdade exata para um `toContain`.
- **17B-002D-C1-P7 — `isQuotaFailure` é uma segunda classificação de erro de
  escrita.** *Aberto · P3.* `storage.ts` já tem `classifyStorageFailure`, mas ela
  é privada daquele módulo e `storage.ts` estava fora da allowlist deste slice.
  O corretivo 055 endureceu a cópia local (só sinal estrutural) e a divergência
  entre as duas implementações aumentou. *Próximo passo:* exportar a original e
  reusar num passe de saneamento autorizado a tocar `storage.ts`.
- **17B-002A-PHYSICAL continua obrigatório.** Nada aqui foi medido em Android
  WebView de entrada.

## GOAL-17B-002D-C1 corretivo 055 — auditoria Classe B (2026-07-27)

Auditoria independente 054: **APTO / Classe B**, com um achado **P1**.

### Fechado por este corretivo

- **17B-002D-C1-C1 — compensação insegura da cópia rolante do core.**
  *Fechado · era P1.* `restoreRollingBackup` reescrevia (`setItem`) ou removia
  (`removeItem`) a cópia rolante **incondicionalmente** depois de qualquer falha
  do W6, usando o valor lido antes da operação. Entre aquela leitura e a
  compensação, outra aba podia ter atualizado a cópia: a restauração apagaria um
  backup mais novo e o `removeItem` recriaria uma ausência que já não existia.
  *Resolução:* a função foi removida inteira, junto das suas quatro chamadas e da
  última ocorrência de `removeItem` do módulo. A cópia rolante passou a ser
  tratada como auxiliar — o canônico é a chave principal mais a geração ativa —,
  e nenhuma compensação a escreve ou a remove. Uma importação abortada pode
  deixá-la em `previousCoreRaw`, o que é seguro e **não altera o estado
  canônico**, porque esse raw é o core anterior verificado no W0 e guardado
  inteiro no journal. Falha da cópia antes do commit passou a reler a chave
  principal: `targetCoreRaw` ou terceiro valor preservam o journal e devolvem
  `recovery-required`, **sem escrever sobre valor alheio**. Provado pelos testes
  77–83, 94 e 96–98 de `storage-logical-import.test.ts`.
- **17B-002D-C1-C2 — falha de `getItem` fechava o journal sem prova.**
  *Fechado · era P2.* Uma leitura que estourava levava à compensação como se o
  estado canônico fosse conhecido. *Resolução:* toda falha de leitura preserva o
  journal e devolve `storage-unavailable` (antes do commit) ou
  `recovery-required` (a partir dele); `RawRead` deixou de capturar a causa
  nativa, o que também torna impossível vazar a mensagem lançada pelo storage.
- **17B-002D-C1-C3 — quota classificada por mensagem.** *Fechado · era P2.*
  `message.includes('quota')` transformava `TypeError`, `AbortError` e erros
  genéricos em `reason: 'quota'`, e num erro vindo do `StorageLike` do chamador a
  mensagem é texto que o chamador controla. *Resolução:* só sinal estrutural —
  `error.name` conhecido, ou código legado 22/1014 dentro de um `DOMException`
  real. Dez casos cobertos (testes 84–93).
- **17B-002D-C1-C4 — mutação de `stagedGenerationId`/`targetCoreRaw` na janela do
  W8 seguia para o settlement.** *Fechado · era P2.* A primitiva não reconfere
  esses campos dentro da própria transação. *Resolução:* readback do receipt
  depois da transição `activating → activated`; sem os dois mundos ainda
  nomeados, não há settlement. A primitiva IndexedDB e a fachada A2 **não foram
  alteradas**. Testes 101–107.
- **17B-002D-C1-C5 — `stagedGenerationId === previousGenerationId` produzia ação
  de escrita.** *Fechado · era P2.* O resolvedor avançava para `prepare-core` num
  receipt que descreve algo que a ordem de escrita não produz. *Resolução:* novo
  motivo `staged-generation-is-previous`, e uma varredura de 1.296 mundos que
  exige o mundo exato por trás de cada ação com efeito (teste 126).
- **17B-002D-C1-C6 — writes internos da primitiva sem fault injection.**
  *Fechado · era P2.* Só a violação de índice único era exercitada. *Resolução:*
  os seis writes lógicos de `stageHistoryGenerationForOperation` passaram a ter
  injeção explícita com o adapter real, conferindo inclusive fingerprint
  administrativo idêntico ao inicial (testes 17–22 de
  `storage-indexeddb.test.ts`). O teste de índice único foi mantido.
- **17B-002D-C1-C7 — privacidade só era provada por `JSON.stringify`.**
  *Fechado · era P3.* `JSON.stringify(erro)` devolve `{}`, então o guard antigo
  não enxergava `message`, `stack`, `cause` nem propriedades não enumeráveis.
  *Resolução:* inspeção recursiva com meta-teste que prova o próprio inspetor,
  aplicada a 11 fases de falha, ao sucesso, ao resolvedor e ao console (testes
  108–112). **A política pública não mudou.**

### Abertos

- **17B-002D-C1-P8 — a janela TOCTOU do W8 continua aberta.** *Aberto · P2.* O
  readback posterior impede o settlement, mas não impede a mutação: entre as
  pré-condições que o importador confere e o início da transação da primitiva,
  outra aba ainda pode alterar o receipt, a metadata ou os receipts de conclusão.
  O resultado honesto é `recovery-required` com journal preservado, nunca um
  settlement indevido. Reforça 17B-002D-C1-P4 e 17B-002D-A2-P9. *Próximo passo:*
  owner-token no C2/E; a alternativa seria mover a conferência para dentro da
  primitiva, o que exigiria alterar o contrato A1.
- **17B-002D-C1-P9 — a cópia rolante pode ficar em `previousCoreRaw` depois de
  um abort.** *Aberto · P3, por design.* É a consequência aceita da política
  nova, e é segura: esse raw é o estado canônico anterior verificado. O que não
  existe é rotação ou limpeza da cópia. *Próximo passo:* nenhum antes de 002D-F
  decidir retenção; nunca voltar a "restaurar" a cópia.
- **17B-002D-C1-P0 a P7 continuam abertos e inalterados.** Este corretivo **não**
  criou `recoverLogicalStorageImportV2` com I/O, recuperação após reload, boot
  recovery, matriz completa de crash points, UI, Provider, Context, AdminPanel,
  call site, owner-token, restore manual, rollback manual, reset, retenção,
  download ou upload. **O slice C não está completo: o C2 não foi iniciado**, e
  D/E/F seguem não iniciados.

## GOAL-17B-002D-C2 — recuperação da importação v2 interrompida (2026-07-27)

### Fechado por este slice

- **17B-002D-C1-P0 — a recuperação com I/O não existia.** *Fechado · era P1.* O
  C1 entregava apenas um resolvedor puro; nada executava a decisão depois de um
  reload, e uma queda entre W1 e W9 deixava um journal correto sobre um
  aplicativo que não sabia o que fazer com ele. *Resolução:*
  `recoverLogicalStorageImportV2`, com resolvedor de reinício próprio, laço de
  limite fechado, releitura completa depois de cada escrita e matriz de 16 crash
  points provados com recriação **real** das instâncias sobre o mesmo banco e o
  mesmo `localStorage`. **A integração com o boot continua sendo do slice D.**

### Abertos

- **17B-002D-C2-P1 — nada chama a recuperação.** *Aberto · P1.* O motor está
  pronto e testado, e **nenhum call site existe**. O aplicativo **não** recupera
  automaticamente no boot, e a importação **não** está disponível ao usuário.
  *Próximo passo:* o **slice D é obrigatório antes de qualquer exposição** —
  chamar a recuperação antes da hidratação normal, decidir o que fazer com
  `recoveryRequired` e `cleanupPending`, e só então pensar em UI.
- **17B-002D-C2-P2 — não existe atomicidade única entre `localStorage` e
  IndexedDB.** *Aberto · P2, por design.* A recuperação reduz a janela ao mesmo
  ponto que a importação — uma única escrita síncrona de `localStorage` — e
  jamais finge que ela não existe: leitura ilegível ou terceiro valor preservam o
  journal em vez de adivinhar. *Próximo passo:* nenhum; fechar isso exigiria um
  motor de persistência que o projeto não tem.
- **17B-002D-C2-P3 — a órfã segura não tem política de retenção.** *Aberto · P3.*
  Quando a limpeza de G falha, ela fica no disco, inativa e sinalizada por
  `cleanupPending`. Sem `operationId` a recuperação nem a enxerga, porque varrer
  receipts terminais atrás de gerações antigas seria retenção. *Próximo passo:*
  002D-F; nunca apagar geração fora das compensações seguras.
- **17B-002D-C2-P4 — a recuperação concorrente é segura, não serializada.**
  *Aberto · P3.* Duas execuções simultâneas convergem para um mundo físico único
  e válido, nenhuma inventa `operationId` ou `generationId`, e no máximo uma
  relata ter avançado — mas não há lock entre abas. *Próximo passo:* owner-token
  no E, o mesmo que fecha o W8.
- **17B-002D-C1-P8 — a janela TOCTOU do W8 continua aberta.** *Aberto · P2,
  inalterado.* A recuperação repete o mesmo readback do receipt depois de
  `activating → activated` e recusa liquidar sobre um receipt mutado, mas não
  impede a mutação. *Próximo passo:* owner-token no E.
- **17B-002D-C1-P9 — a cópia rolante pode ficar em `previousCoreRaw`.** *Aberto ·
  P3, por design, inalterado.* A recuperação mantém a política à risca: ela
  **grava** `previousCoreRaw` na cópia no caminho saudável de avanço e **nunca**
  a restaura, remove ou compensa para trás — nem quando a gravação do core alvo
  falha. Provado nas quatro variantes do crash 10.
- **17B-002D-C1-P1 a P7 continuam abertos e inalterados.** Este slice **não**
  criou boot integration, Provider, Context, AdminPanel, UI, botão, modal, toast,
  seletor de arquivo, download, upload, call site, owner-token, restore manual,
  rollback manual exposto, reset, retenção, sincronização remota, Supabase nem
  banco remoto. **D/E/F seguem não iniciados.**

## GOAL-17B-002D-D1 — o que ficou aberto

- **17B-002D-D1-P1 — a hidratação bloqueada não tem saída pela interface.**
  *Aberto · P2.* Quando a recuperação não converge, o app mostra o aviso de
  armazenamento e não hidrata. Não existe botão de tentar de novo, diagnóstico ou
  exportação bruta para esse caso específico — só reabrir o aplicativo. Os dados
  físicos ficam intactos. *Próximo passo:* D2/E, junto com restore e diagnóstico.
- **17B-002D-D1-P2 — `cleanupPending` é observado e ignorado.** *Aberto · P3, por
  design.* Uma geração preparada e sem dono continua no disco depois de um
  `reverted`. Ela não impede hidratação nem diagnóstico, e o orquestrador
  propaga o sinal sem agir sobre ele. *Próximo passo:* 002D-F (retenção); nunca
  apagar geração fora das compensações seguras.
- **17B-002D-D1-P3 — ambiguidade de `administration-unavailable`.**
  *Resolvido no D1 · antigo P2.* Sem mudar o contrato C2, o orquestrador agora
  exige metadados administrativos vazios e inspeciona a chave principal de forma
  read-only com o parser físico oficial. Ausência e v1 válido liberam; core v2,
  corrupt com versão 2 ou falha de leitura bloqueiam antes do runtime. Raw
  corrupt sem versão comprovável e unsupported permitem somente a classificação
  bloqueada do runtime, preservando as capacidades legadas explícitas sem
  publicar dados nem escrever. Assim, core v2 nunca é confundido com instalação
  nova.
- **17B-002D-D1-P0-062 — a primeira classificação removia recuperação legada
  correta.** *Fechado · era P1.* O comando 061 fez dois testes baseline falharem
  ao bloquear raw corrompido antes do runtime. Os testes estavam corretos:
  corrupção sem v2 comprovável deve chegar ao modo `blocked` híbrido para manter
  restore v1, recomeço explícito e download. O resultado
  `ready-for-blocked-storage-classification` restaura exatamente essa superfície,
  sem migração, defaults, autosave ou consumo de completion receipt.
- **17B-002D-D1-P4 — não há lock entre abas no boot.** *Aberto · P3.* Duas abas
  abrindo ao mesmo tempo rodam duas recuperações. Elas convergem para um mundo
  físico único e válido (provado no C2) e a trava por `WeakMap` só cobre o mesmo
  documento. *Próximo passo:* owner-token no E, o mesmo que fecha o W8.
- **17B-002D-D1-P5 — o cleanup do Provider pode fechar o adapter durante a
  recuperação.** *Aberto · P3.* No Strict Mode a primeira desmontagem zera a
  contagem de retenção e chama `adapter.close()`. Na prática é inofensivo: o
  IndexedDB só fecha de fato quando as transações em voo terminam, e `open()` é
  reabertura sob demanda. *Próximo passo:* se algum dia doer, registrar a
  recuperação nas operações pendentes do runtime híbrido.
- **17B-002D-C2, C1 e anteriores continuam abertos e inalterados.** Este slice
  **não** criou seletor de arquivo, importação ao usuário, exportação ao usuário,
  restore manual, rollback manual, reset, retenção, limpeza de órfãs,
  owner-token, UI, AdminPanel, modal, toast, download, upload, Android, Supabase
  nem banco remoto. **D2/E/F seguem não iniciados.**
- **O P0 de boot para instalação nova/v1 foi resolvido.** O D1 foi concluído
  localmente com um único call site estritamente guardado, sem declarar o slice
  D completo. Permanecem os riscos P2/P3 acima: saída pela interface,
  `cleanupPending`, concorrência entre abas e fechamento do adapter em cleanup.

## GOAL-17B-002D-D2 — pendências após a auditoria administrativa

- **17B-002D-D2-P1 — fonte de restore híbrido não definida.** *Aberto · P1 ·
  Classe C.* Snapshot legado, cópia rolante e histórico existem, mas nenhum
  documento escolhe uma fonte única nem prova o par core/geração. *Próximo
  passo:* aprovar origem, vínculo e recovery antes de qualquer mutação.
- **17B-002D-D2-P2 — rollback completo não é derivável da operação física.**
  *Aberto · P1 · Classe C.* Trocar somente a geração ativa pode deixar o core
  apontando para outro mundo. *Próximo passo:* definir alvo comprovadamente
  relacionado e a fonte verificável do core correspondente.
- **17B-002D-D2-P3 — reset não possui mundo vazio e recovery aprovados.**
  *Aberto · P1 · Classe C.* Faltam defaults canônicos, tratamento de identidade,
  completion receipts e protocolo de retomada. *Próximo passo:* congelar esses
  contratos antes de criar receipt ou geração.
- **17B-002D-D2-P4 — não existe política de retenção por idade/quantidade.**
  *Aberto · P2 · Classe B.* Após a auditoria independente Classe C do primeiro
  commit, o corretivo restringiu `policy-required` ao snapshot estável com uma
  única geração ativa, zero receipt, zero `cleanupPending` e zero referência
  desconhecida. `delete` continua sempre vazio; sem política aprovada, nem D2
  nem F podem apagar por heurística.
- **17B-002D-D2-P5 — executor de retenção não existe.** *Aberto · P2.* Uma
  execução futura exigirá contrato próprio de prova física, revalidação e
  serialização. O planner não devolve fingerprint, não trata `verified` como
  prova e bloqueia qualquer receipt, geração não ativa ou `cleanupPending`.
- **17B-002D-D2-P6 — serialização entre abas continua pendente.** *Aberto · P2.*
  O planner puro não precisa de owner-token; qualquer executor mutável depende
  do trabalho do E. Validação Android/WebView continua reservada ao F.
- **17B-002D-D2-P7 — integridade física não é comprovada pelo planner.**
  *Aberto · P2.* Metadata, flags e manifests são comparados apenas para rejeitar
  contradições; `verified` é diagnóstico. Qualquer seleção futura para retenção
  exigirá uma prova física fora deste planner, sem transformar resumo estrutural
  em autoridade de deleção.
- **Sem regressão de escopo:** nenhuma UI, integração no Provider, call site de
  usuário, alteração Android ou operação mutável foi adicionada. O D2 está
  parcialmente implementado, E/F não foram iniciados e o GOAL-17B-002D não está
  concluído.
