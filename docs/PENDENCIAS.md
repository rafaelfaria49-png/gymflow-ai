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
- **17B-002C — Integração do Context.** *Pendente · P1.* Introduzir hidratação
  assíncrona, append incremental e tratamento de indisponibilidade sem criar duas
  fontes de verdade silenciosas. Adapter e migração ainda estão desconectados.
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
