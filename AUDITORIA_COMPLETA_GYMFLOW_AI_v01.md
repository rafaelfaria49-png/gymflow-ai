# AUDITORIA_COMPLETA_GYMFLOW_AI_v01

> Auditoria **read-only**. Nenhum código foi alterado, corrigido ou implementado. Este documento é apenas análise e relatório.
> Data: 2026-06-18 · Escopo: 100% do código-fonte em `src/` · Versão analisada: `gymflow-ai 0.1.0`

---

## 1. Resumo executivo

O GymFlow AI é um **protótipo de front-end de altíssima fidelidade visual** que *parece* um produto comercial pronto, mas que por baixo é inteiramente **mockado e efêmero**. Não existe backend, banco de dados, autenticação real, persistência, IA real ou vídeo real. Tudo vive em memória (`useState` num único contexto gigante) e **é perdido a cada refresh da página**.

A camada de UI/UX é o ponto mais forte: design dark premium consistente (glassmorphism, accent cyber-lime, tipografia Outfit, cantos arredondados, micro-interações). Já o "coração" prometido do produto — **IA Coach** e **vídeos/biomecânica** — é **fachada**:

- A **"IA Coach"** é uma cadeia de `if/else` por palavra-chave com `setTimeout(1000)`. Não há LLM, memória, nem adaptação.
- Os **"vídeos"** não existem. O que roda é um **boneco-palito 2D desenhado em `<canvas>`** (`BiomechanicalVisualizer`), rotulado na interface como *"Análise Biomecânica 3D"*, *"Renderização Anatômica 3D Realista"* e *"CARREGANDO ANIMAÇÃO 3D"*. Isso é, ao mesmo tempo, um problema de produto **e um risco de confiança/jurídico** (propaganda enganosa).

**Veredito:** está mais perto de **protótipo navegável / demo de pitch** do que de MVP. A boa notícia: a base de UI e a modelagem de tipos são sólidas o suficiente para servir de fundação. A má notícia: os 3 pilares que justificam a marca "AI" e "premium" (IA, vídeo, persistência) precisam ser construídos praticamente do zero.

| Eixo | Nota (0–10) | Comentário |
|---|---|---|
| UI / Visual | 8.5 | Realmente premium, consistente |
| UX / Fluxo | 6.0 | Bom no desktop; quebra no mobile; uso excessivo de `alert()` |
| Arquitetura | 4.5 | Organizada, mas God-context, sem persistência, sem backend |
| Conteúdo (treinos/exercícios) | 4.0 | 18 exercícios reais + 68 "filler" gerados; bugs de referência |
| IA Coach | 2.0 | Fake (keyword matching) |
| Vídeo / Técnica | 2.5 | Canvas 2D vendido como "3D realista" |
| Métricas/Evolução | 4.0 | Sem gráficos, valores hardcoded |
| Monetização | 3.0 | Planos lindos, mas paywall não é aplicado e não há pagamento |
| Prontidão comercial | 2.5 | Demo, não vendável ainda |

---

## 2. Estado atual do produto

**Stack:** Next.js `16.2.6` (App Router), React `19.2.4`, Tailwind `v4`, TypeScript `5`, `lucide-react`, `clsx`, `tailwind-merge`.

**Padrão de aplicação:** apesar de usar App Router, o app é efetivamente um **SPA client-side**. Existe **uma única rota** (`src/app/page.tsx`) marcada `'use client'` que faz um `switch (activeView)` para renderizar "telas". Não há rotas Next, sem SSR/RSC, sem `loading.tsx`/`error.tsx`, sem data fetching, sem `app/api/*`.

**Estado:** 100% em `GymFlowContext.tsx` (~1.207 linhas), um único provider com 50+ valores e todas as funções de negócio. Tudo `useState` em memória.

**Persistência:** **nenhuma.** Existe `src/hooks/useLocalStorage.ts`, mas um `grep` confirma que ele **nunca é importado em lugar algum** (só aparece nele mesmo). Logo, ao recarregar: usuário desloga, histórico some, treino ativo some, XP zera.

**Conteúdo mockado (contagens reais):**
- Exercícios: **18 escritos à mão + 68 gerados em loop** (`Exercício Extra CHEST #1 (Halteres)`…) = 86 itens, dos quais ~79% é "filler".
- Vídeos: **10 escritos + 32 gerados** = 42 "aulas".
- Programas: 12 · Templates semanais: 8 · Desafios: 10 · Conquistas: 20 · Posts comunidade: mock.

**Módulos existentes (todos renderizam):** Landing, Auth (login/registro/recuperação), Onboarding (8 passos), Dashboard, Planejador, Treinos, Treino Ativo, Exercícios, Vídeos, IA Coach, Evolução, Comunidade, Nutrição, Assinatura, Admin.

---

## 3. Pontos fortes

1. **Identidade visual premium e coesa.** Paleta (`#09090b` dark + `#a3e635` lime), `glass`, `glow`, gradientes accent→emerald, `rounded-3xl` em todo lugar. Tem cara de app de 2026.
2. **Modelagem de tipos forte** (`src/types/index.ts`): `Exercise` já prevê `executionSteps`, `postureTips`, `commonErrors`, `errorCorrections`, `substitutions`, `safetyWarnings`, `secondaryMuscles`. É uma base de schema realmente boa para um backend futuro.
3. **Os 18 exercícios escritos à mão são de qualidade** — instruções, respiração, erros + correções e avisos de segurança são tecnicamente decentes e em PT-BR natural.
4. **Onboarding rico** (8 passos: objetivo, nível, dados físicos, frequência/duração, local/equipamentos, foco muscular, restrições, preferências) — coleta os dados certos.
5. **Planejador semanal genuinamente interativo:** mover dia, duplicar, editar, alternar treino/descanso, replanejar.
6. **Treino ativo bem pensado:** cronômetro, séries com carga/reps/RPE, timer de descanso com anel SVG, volume total, troca de exercício, "Academia Lotada", anotações por exercício, modal de RPE no fim.
7. **Gamificação consistente** (XP, níveis, streak, conquistas, desafios) amarrada às ações.
8. **Modularização limpa de arquivos** (`modules/`, `components/`, `mock/`, `types/`, `data/`) — fácil de navegar.

---

## 4. Pontos fracos

1. **Sem persistência → perda total de dados no refresh** (P0). O `useLocalStorage` existe mas está morto.
2. **Sem backend/auth/DB.** Login "demo" é um objeto hardcoded. Admin é liberado por `user.email === 'rafael.demo@gymflow.ai'`.
3. **"IA Coach" é fake** — `if/else` de palavra-chave (`GymFlowContext.tsx`, ~linhas 939–1105). Não há IA.
4. **"Vídeos 3D" são canvas 2D** rotulados como "3D realista" (`BiomechanicalVisualizer.tsx`). Risco de produto e de marketing enganoso.
5. **Conteúdo inflado artificialmente:** 68 exercícios gerados em loop com texto placeholder e `substitutions` que apontam para IDs que podem não existir.
6. **Bugs de integridade referencial confirmados:**
   - `prog_beg_1` referencia `abs_prancha_abdominal` e `prog_beg_4` referencia `cardio_corrida_esteira` — **esses IDs não existem** em `MOCK_EXERCISES` → ao iniciar, aparece "Exercício Desconhecido".
   - Mapas em `ExerciseLibrary.tsx`/`ActiveWorkoutPage.tsx` referenciam `legs_levantamento_terra` e `legs_legpress_45` — **inexistentes** (o real é `legs_stiff`/`legs_leg_press`).
7. **Navegação mobile mutilada:** `BottomNavigation` expõe só 5 de 11 destinos. **Exercícios, Vídeos, Nutrição, Feed, Assinatura e Admin ficam inacessíveis no celular** (não há menu "Mais"). Para um app fitness, mobile-first, isso é grave.
8. **`alert()` nativo em ~12 lugares** (trocas, registros, upgrades, conexões sociais) — quebra a sensação premium.
9. **Métricas sem gráficos.** "Evolução" mostra listas de texto; não há nenhuma biblioteca de chart. Peso, volume, PRs não têm linha do tempo visual.
10. **Paywall não é aplicado.** Os 3 planos são decorativos; usuário "free" não é bloqueado de nada. Não há gateway de pagamento.
11. **Valores hardcoded fingindo serem dinâmicos:** Dashboard mostra "Recuperação Muscular", "3 de X dias", barra "75%", calendário (`trained = idx < 3`), "Relatório Semanal IA" — tudo fixo.
12. **Anti-padrões de estado:** `handleAddSet/handleRemoveSet` fazem `push/pop` mutando o array do state direto e depois chamam `updateWorkoutSet` "para forçar re-render". Frágil.
13. **`select-none` global** no shell impede selecionar/copiar texto.
14. **Sem testes, sem error boundaries, sem tratamento de loading real.**

---

## 5. Comparativo com concorrentes

| App | Núcleo | Vídeo/Visual | IA | Preço (2025–26) | O que o GymFlow precisa aprender |
|---|---|---|---|---|---|
| **Hevy** | Logging social, templates, PRs | Sem vídeo pesado | "Hevy Trainer" incluso | ~US$ 23,99/ano · lifetime US$ 74,99 | Free tier generoso + logging impecável + social real |
| **Strong** | Logging clássico, simples e robusto | GIFs simples | — | ~US$ 29,99/ano · lifetime US$ 99,99 | Simplicidade e confiabilidade de tracking |
| **Fitbod** | Geração adaptativa de treino por recuperação/equipamento | Animações/clips de exercício | IA de verdade (recovery-aware) | ~US$ 95,99/ano | **O motor adaptativo que o GymFlow só finge ter** |
| **Jefit** | Biblioteca enorme + planos | Imagens/animações por exercício | Planos | Freemium | Profundidade de biblioteca real |
| **Nike Training Club** | Treinos guiados | **Vídeo real de instrutores** (grátis) | Curadoria | Grátis | Barra de qualidade de vídeo |
| **Apple Fitness+ / Peloton / Centr / Ladder** | Aulas guiadas por vídeo | **Produção de vídeo profissional, humanos reais** | Curadoria/coach | US$ 9,99–39,99/mês | Produção e storytelling |
| **Freeletics** | Coach adaptativo bodyweight | Vídeo + áudio coach | IA adaptativa forte | Assinatura | Personalização real do plano |
| **Gymshark Training** | Treinos de marca | Vídeo | — | Grátis (marketing) | Branding + comunidade |
| **Wellhub (Gympass) / brasileiros (Queima Diária, Tecnofit)** | Marketplace/academias | Vídeo | — | B2B2C | Distribuição no Brasil, integração academia |

**Leitura:** hoje o GymFlow perde em **todas** as dimensões funcionais (vídeo real, IA real, persistência, logging confiável), mas **vence quase todos em apelo visual de tela**. O design já está no nível "premium"; falta tudo embaixo.

---

## 6. Auditoria módulo por módulo

### 6.1 Arquitetura geral
- **Estrutura de pastas:** boa e previsível.
- **God-context:** `GymFlowContext` concentra estado + regras de negócio + "IA" + lógica de treino + nutrição + social. Vai virar gargalo de manutenção e causa re-render amplo (qualquer mudança de XP re-renderiza consumidores).
- **Sem camada de serviço/API**, sem separação domínio/UI. Quando entrar backend, será preciso refatorar tudo isso em hooks/queries.
- **Riscos técnicos:** ausência de persistência, mutação direta de estado, IDs órfãos, `any` em `actionCard.payload` e em vários handlers.
- **Escalabilidade:** baixa hoje; a base de **tipos** ajuda muito quando virar backend.

### 6.2 UX/UI premium
- **Desktop:** excelente. Sidebar fixa, top bar com XP/level/streak, grids equilibrados, modais bonitos.
- **Mobile:** **quebrado em navegação** (só 5 abas). Modais grandes (player, biblioteca) podem sofrer em telas pequenas.
- **Estados vazios:** existem e são bem feitos (planner vazio, treino inexistente, lista filtrada vazia).
- **Inconsistências:** `alert()` nativo; `select-none` global; player chamado de "fullscreen"/"cinema" mas é só um modal mais largo (não usa Fullscreen API).
- **Veredito:** aparência comparável a apps premium; comportamento ainda não.

### 6.3 Planejador semanal
- **Flexível de verdade:** mover/duplicar/editar/descanso/replanejar funcionam no nível de **rótulo do dia**.
- **Limitação central:** o dia não carrega uma **lista real de exercícios**; `programId` dos templates é quase sempre `undefined`, então "Iniciar Treino" do dia cai em treino livre/genérico. A geração ignora `level` e `duration` na escolha de exercícios.
- **Perfil M/F/Neutro:** influencia só a escolha de template por gênero, não a prescrição.
- Comparado a Fitbod/Freeletics: falta a parte que importa (conteúdo do dia + adaptação por recuperação).

### 6.4 Treinos
- 12 programas (iniciante→atleta), divisões ABC/Upper-Lower/PPL/FullBody/Powerbuilding presentes **como rótulo**.
- **Profundidade rasa:** cada programa tem ~3–6 exercícios listados (um "ABC" mostra só os exercícios de um dia). Sem progressão de carga programada, sem periodização, sem aquecimento/alongamento estruturado (só `type: 'finisher'` solto).
- Tracking do treino ativo é o ponto alto (volume, RPE, descanso, troca).
- Bugs de exercício inexistente (item 4.6) afetam `prog_beg_1` e `prog_beg_4`.

### 6.5 Exercícios
- Filtros por músculo + busca + abas (Todos/Favoritos/Recomendados/Tendências/Recentes) — boa estrutura.
- Ficha técnica (passos, postura, erros+correções, substitutos, respiração) é **muito boa nos 18 reais** e **vazia/placeholder nos 68 gerados**.
- Favoritos e "vistos recentemente" funcionam (em memória).
- Comparado a Hevy/Strong/Fitbod: a *estrutura* da ficha é superior à de muitos; o *volume real e confiável* de exercícios é inferior (só 18 confiáveis).

### 6.6 Vídeos e execução técnica
Ver **Seção 8** (auditoria profunda). Resumo: não há vídeo; há canvas 2D rotulado como 3D.

### 6.7 IA Coach
- `sendChatMessage` = `if/else` por substring (`'supino'`, `'academia cheia'`, `'30 minutos'`…) + `setTimeout`. **Sem LLM, sem memória, sem contexto do usuário real.**
- Os "action cards" (gerar semana, replanejar, academia cheia, assistir vídeo, iniciar treino) **funcionam** e são uma boa UX — mas a "inteligência" é roteirizada.
- Bug: ação `generate-week` chama `generateWeeklyPlan('hipertrofia','intermediário','neutral',…)` com strings PT, enquanto o matching de template usa enums EN (`'hypertrophy'`) → cai no fallback.
- Comparado a Fitbod/Freeletics: hoje é teatro de IA.

### 6.8 Evolução/métricas
- Registra peso e medidas (chest/waist/hips/arms) com histórico em lista; fotos de evolução (mock Unsplash); PRs **hardcoded**; "Relatório Semanal IA" hardcoded.
- **Sem nenhum gráfico** (não há lib de charting). Volume/fadiga/recuperação não têm série temporal real.
- Integrações sociais (Instagram/Strava/Apple Health) e privacidade são botões que dão `alert()`.

### 6.9 Feed/comunidade
- Feed com post/curtir/comentar (em memória), auto-post ao finalizar treino, ranking semanal (mock), grupos (lista estática).
- **Aba "groups" é código morto:** o estado prevê `'groups'` mas só `feed` e `ranking` têm botão/render.
- Sem backend → nada é compartilhado entre usuários. Comparado a Hevy/Strava: é uma maquete.

### 6.10 Nutrição
- Água (presets +250/+500/+1L + custom) com anel visual; log manual de kcal/macros; cardápio sugerido por objetivo (só `slimming` vs padrão).
- **Tem disclaimer de responsabilidade** (bom). Mas **sem banco de alimentos, busca, código de barras, nem metas calculadas** (TDEE/macros-alvo). Os totais só somam, sem teto/meta.
- Risco legal mitigado pelo aviso, mas sugestões fixas de dieta ainda pedem cautela.

### 6.11 Assinatura/monetização
- 3 planos: Free R$ 0 / Pro R$ 19,90 / Elite R$ 39,90. Visual ótimo.
- Upgrade é `setTimeout` + `alert`. **Sem pagamento e sem enforcement** (free não é limitado de fato).
- Preço Pro (R$ 19,90/mês) é **caro frente ao mercado global** (Hevy ~US$ 24/**ano**), mas plausível para o Brasil **se** houver vídeo real + IA real justificando.

### 6.12 Admin/content
- Add/Delete exercício (em memória), analytics fake, log de eventos fake, gate por e-mail hardcoded.
- Falta para virar CMS real: persistência, RBAC real, upload de mídia (thumb/vídeo), edição completa (não só add), gestão de programas/vídeos/desafios, moderação real, métricas reais.

### 6.13 Performance
- `BiomechanicalVisualizer` faz `setPhase` a cada frame via `requestAnimationFrame` → **re-render React + redraw completo do canvas a cada frame**. Na tela de treino ativo há **um visualizer por exercício rodando em loop simultaneamente** → custo alto e bateria.
- `<img>` direto de Unsplash, sem `next/image`/otimização.
- App inteiro é um bundle client único; sem code splitting além do default.

### 6.14 Segurança/responsabilidade
- Sem auth real, sem proteção de rotas, admin por e-mail fixo.
- Disclaimers existem em **Onboarding** e **Nutrição**, mas **faltam** no Treino Ativo, na IA Coach e na tela de vídeo (onde se afirma "biomecânica"/"3D realista").
- Sem Termos de Uso, Política de Privacidade, consentimento de saúde (PAR-Q) ou LGPD.

---

## 7. Gap analysis (o que falta)

| Capacidade | Hoje | Esperado p/ produto | Gap |
|---|---|---|---|
| Persistência | Nenhuma | DB + sync | **Crítico** |
| Auth/contas | Mock | Login real (OAuth/email) | **Crítico** |
| Vídeo/execução | Canvas 2D "3D" | Vídeo/3D licenciado ou próprio | **Crítico** |
| IA | Keyword | LLM/regra adaptativa real | Alto |
| Plano→conteúdo | Desacoplado | Dia → lista real de exercícios | Alto |
| Pagamento | Fake | Gateway + paywall | Alto |
| Gráficos/analytics | Listas | Séries temporais reais | Médio |
| Nutrição | Manual | Banco de alimentos + metas | Médio |
| Social | Local | Backend multiusuário | Médio |
| Mobile nav | 5/11 telas | Acesso a tudo | Alto (rápido de corrigir) |
| Conteúdo | 18 reais + filler | 100–300 exercícios curados | Alto |
| Legal | Parcial | Termos/Privacidade/PAR-Q/LGPD | Alto |

---

## 8. Auditoria profunda dos vídeos

**Onde aparece o "vídeo":**
1. Aba **Vídeos** (`EducationalVideos.tsx`) → abre `GlobalVideoPlayer`.
2. Botão **"Ver técnica"** na Biblioteca e **"Ver Biomecânica"** no treino ativo → mesmo `GlobalVideoPlayer`/`BiomechanicalVisualizer`.
3. **Mini-loop** dentro de cada exercício do Treino Ativo (`BiomechanicalVisualizer` em 360×130).

**O que realmente é:**
- **`BiomechanicalVisualizer.tsx`** desenha em `<canvas>` um **boneco-palito 2D** (cabeça, cápsulas de membros, "músculos" como glows radiais, barra/halter/banco/polia) e o **gira em torno do eixo Y** com uma projeção de perspectiva caseira (`project()` com `camDist=280`). Isso **não é 3D** — é um pseudo-3D 2D. Tem ângulos de câmera (diagonal/lateral/frontal/zoom) e avatar por gênero (cor de pele/roupa/cabelo desenhados).
- O `GlobalVideoPlayer` simula um player: **buffering fake de 500ms**, "playback" via `setInterval` incrementando `playTime`, velocidade 1/1.5/2x, seek ±10s, barra de progresso, "Modo Cinema" (= modal mais largo, **não** Fullscreen API), e marca "aula concluída" para dar XP.
- O campo de tipo no model chama-se literalmente **`videoFakeUrl`** — o próprio código admite que é fake.

**Por que parece amador apesar do esforço:**
- É vendido como *"Renderização Anatômica 3D Realista"*, *"CARREGANDO ANIMAÇÃO 3D…"*, *"Análise Biomecânica 3D"* — expectativa que o boneco-palito não cumpre.
- A detecção de exercício é por **substring do id** (`includes('supino')→PRESS`). No player a entrada é o **`video.id`** (`vid_supino_1`), que casa; mas os **68 exercícios gerados** (`extra_chest_12`) **não casam com nenhum tipo → caem no `DEFAULT` (boneco parado respirando)**. Ou seja, a maioria dos exercícios mostra a mesma animação genérica.
- Consistência entre players: é o mesmo componente em 3 lugares (bom para consistência), mas todos com a mesma limitação.

**Conclusão:** tecnicamente é um canvas impressionante para um protótipo, porém **inadequado e mal-rotulado** para produto. Não parece humano real nem 3D real; parece o que é: um esqueleto procedural.

---

## 9. Estratégia recomendada para vídeos reais/3D/licenciados

### 9.1 Opções e custos aproximados (pesquisa 2025–2026)

| Estratégia | Como | Custo aprox. | Copyright | Velocidade |
|---|---|---|---|---|
| **Licenciar animações 3D prontas (MoveKit)** | 200+ animações 3D de exercícios, com highlight de músculo, **licença comercial + API** | **US$ 4,99/clipe ou US$ 99 a biblioteca toda** (one-time) | Limpo p/ app comercial | **Dias** |
| **Muscle & Motion** | 1.200+ exercícios em 3D de alta qualidade | Assinatura por planos | ❌ **Não permite sublicenciar/uso comercial embutido** — só referência/ensino | — |
| **Gravar vídeo próprio (instrutor real)** | Contratar personal + videomaker, padronizar fundo/ângulos | R$ alto por sessão (estúdio, edição) | Você é dono | Semanas–meses |
| **Banco de stock fitness** (Storyblocks/Envato) | Clipes genéricos | Assinatura | Licença por clipe | Médio (cobertura de exercício específico é fraca) |
| **Pipeline 3D próprio** (Mixamo + Blender, ou MetaHuman/Unreal) | Rig + animação custom, render p/ MP4/WebM | Mixamo/Blender grátis; tempo de artista é o custo | Você é dono (cuidado com licença de modelos) | Meses |
| **Hospedagem: Cloudflare Stream** | VOD com ABR | **US$ 1/1.000 min armazenados + US$ 5/1.000 min entregues** (renditions multiplicam armazenamento) | — | Imediato |
| **Hospedagem: Mux** | VOD com just-in-time encoding | input ~US$ 0,0384/min (720p), entrega por tier, **100k min/mês grátis** | — | Imediato |

### 9.2 Recomendações claras

- **Mais barata:** licenciar a biblioteca **MoveKit por ~US$ 99** (one-time, comercial) e servir os MP4/Lottie via **Cloudflare R2/Stream**. Custo inicial irrisório.
- **Mais profissional:** **produzir vídeo próprio** com instrutores reais (como Nike/Centr/Peloton fazem) hospedado no **Mux**. Caro e lento, mas é o teto de qualidade e diferenciação de marca.
- **Mais rápida:** MoveKit + Cloudflare Stream → no ar em **dias**, mapeando `exerciseId → videoId`.
- **Mais escalável:** biblioteca de MP4 (licenciada ou própria) + **Cloudflare Stream/Mux** (ABR, CDN) com mapeamento por metadados — escala para milhares de exercícios sem custo de re-render no cliente.
- **Recomendada para o GymFlow AI (faseada):**
  - **Fase MVP:** comprar **MoveKit (US$ 99)**, hospedar no **Cloudflare Stream**, mapear por `exerciseId`, e **parar imediatamente de chamar de "3D realista"** se ainda usar o canvas. Isso resolve 90% do problema de vídeo a custo quase zero.
  - **Fase comercial:** gravar **vídeo próprio dos ~50 exercícios principais** (instrutor real) no **Mux**, mantendo MoveKit para a cauda longa. Isso cria diferenciação real e justifica preço premium.

> Observação jurídica: **Muscle & Motion não pode ser embutido** num app comercial — usar só como referência interna de qualidade, nunca como ativo do produto.

---

## 10. Priorização P0/P1/P2/P3

### P0 — Bloqueadores (sem isto, não é nem MVP nem vendável)
1. **Persistência + Backend + Auth real** (DB, contas, sessão). Hoje refresh apaga tudo.
2. **Aplicar o `useLocalStorage` (ou store real)** como ponte imediata até o backend.
3. **Resolver o problema do vídeo + parar o rótulo "3D realista"** (risco de propaganda enganosa). Trocar por MoveKit + Stream.
4. **Enforcement de paywall + pagamento** (senão não há receita) — ou assumir que ainda é demo.
5. **Corrigir IDs de exercício órfãos** (`abs_prancha_abdominal`, `cardio_corrida_esteira`, `legs_levantamento_terra`, `legs_legpress_45`) → some "Exercício Desconhecido".
6. **Navegação mobile completa** (menu "Mais" / acesso às 11 telas).

### P1 — Para competir
7. **IA real** (LLM via API) ou, no mínimo, motor de regras adaptativo de verdade (recuperação/volume).
8. **Plano semanal acoplado a listas reais de exercícios por dia** (resolver `programId` undefined).
9. **Histórico/Analytics reais com gráficos** (peso, volume, PR ao longo do tempo).
10. **Curar a biblioteca de exercícios** (remover os 68 filler; chegar a 100–300 reais) com vídeo associado.
11. **Substituir todos os `alert()`** por toasts/modais nativos do design system.
12. **Nutrição com banco de alimentos + metas calculadas** (TDEE/macros).

### P2 — Importante
13. Backend social real (feed/ranking/grupos multiusuário) + ativar aba **groups** (hoje morta).
14. Tracking real de desafios e conquistas (não só incrementos fixos).
15. Otimização de performance do canvas/animações (e `next/image`).
16. Acessibilidade (foco, contraste, `select-none` global, labels).

### P3 — Polimento
17. Remover código morto (`useLocalStorage` se for substituído por store, aba groups, `videoFakeUrl`).
18. Testes (unit/e2e), error boundaries, loading states reais.
19. SSR/SEO da landing, i18n, métricas/observabilidade.

---

## 11. Roadmap recomendado

- **Sprint 0 — Fundação (P0):** escolher stack de backend (ex.: Supabase/Postgres + Auth) → modelar a partir dos tipos existentes → mover estado para store + persistência → auth real → RBAC para admin. Em paralelo: corrigir IDs órfãos e navegação mobile (quick wins de 1 dia).
- **Sprint 1 — Vídeo + Conteúdo (P0/P1):** licenciar MoveKit → hospedar no Cloudflare Stream → mapear `exerciseId→videoId` → remover/renomear o framing "3D realista" → curar biblioteca de exercícios.
- **Sprint 2 — IA + Plano (P1):** IA Coach via LLM com contexto do usuário (perfil, histórico, restrições) → gerar/adaptar plano de verdade → acoplar dias do planner a listas reais.
- **Sprint 3 — Monetização (P1):** gateway de pagamento (Stripe/Mercado Pago/Pagar.me) + enforcement de features por plano + trial.
- **Sprint 4 — Métricas/Nutrição/Social (P1/P2):** gráficos reais (Recharts/Visx) + banco de alimentos + backend social.
- **Sprint 5 — Comercial:** vídeo próprio dos top-50 exercícios (Mux), legal completo (Termos/Privacidade/PAR-Q/LGPD), testes, performance.

---

## 12. Próxima sprint sugerida (detalhada)

**Tema: "Tornar real" — Fundação + 2 quick wins.**
1. **Backend + Auth + Persistência (P0):** subir Postgres gerenciado + Auth; criar tabelas a partir de `types/index.ts` (`user_profile`, `exercise`, `program`, `workout_session`, `weekly_plan`, `nutrition_log`); migrar o `GymFlowContext` para ler/escrever via camada de dados; manter `localStorage` como cache otimista.
2. **Vídeo real MVP (P0):** integrar MoveKit + Cloudflare Stream; substituir o canvas como *fonte de verdade* do "Ver técnica"; ajustar copy (remover "3D realista" enquanto não for).
3. **Quick wins (P0):** corrigir os 4 IDs de exercício órfãos; adicionar menu "Mais" no `BottomNavigation` para acessar as 11 telas no mobile.

*Critério de pronto:* recarregar a página **não** perde dados; "Ver técnica" abre vídeo licenciado real; nenhum "Exercício Desconhecido"; todas as telas acessíveis no celular.

---

## 13. Riscos técnicos

- **Refator do God-context** será inevitável e custoso ao entrar backend (acoplamento alto, re-renders amplos).
- **Mutação direta de estado** (`sets.push/pop`) pode gerar bugs sutis de UI.
- **Animações por exercício simultâneas** no treino ativo = risco de performance/bateria em mobile.
- **IDs órfãos e `substitutions` gerados** indicam ausência de validação de integridade — vai piorar conforme o conteúdo cresce.
- **Ausência total de testes** torna qualquer refator arriscado.
- **`payload: any`** e enums duplicados em PT/EN (ex.: `'hipertrofia'` vs `'hypertrophy'`) já causam bug silencioso na geração de semana.

## 14. Riscos legais/copyright

- **Marketing enganoso:** rotular canvas 2D como "Renderização 3D Realista"/"Análise Biomecânica 3D" pode configurar publicidade enganosa (CDC). **Corrigir o copy ou o produto** antes de cobrar.
- **Conselhos de saúde/lesão:** o app prescreve treino, fala de "biomecânica", "fadiga muscular", PRs — **faltam disclaimers** no Treino Ativo e na IA. Risco de responsabilidade por lesão.
- **Nutrição:** sugestões de dieta fixas — manter e reforçar o disclaimer; idealmente parceria com nutricionista para conteúdo.
- **Licenciamento de vídeo:** **não embutir Muscle & Motion**; validar licença comercial de qualquer pack (MoveKit é OK). Modelos 3D (Mixamo etc.) têm termos próprios.
- **LGPD:** coleta de dados sensíveis (peso, medidas, fotos, restrições/lesões = dado de saúde) **exige** base legal, consentimento, Política de Privacidade e segurança. Hoje inexistente.
- **Pagamentos:** ao cobrar, vêm obrigações fiscais e de proteção ao consumidor (cancelamento, reembolso).

---

## 15. Recomendações finais

1. **Pare de chamar de "3D realista".** É a correção mais barata e de maior impacto reputacional/jurídico. Faça hoje.
2. **Construa a fundação (DB+Auth+persistência) antes de qualquer feature nova.** Sem isso, é demo.
3. **Resolva vídeo com MoveBit/MoveKit + Cloudflare Stream (US$ ~99).** ROI altíssimo, prazo de dias.
4. **Torne a "IA" real** (LLM com contexto) — é o que a marca promete e o que justifica preço.
5. **Acople plano → conteúdo** e **cure a biblioteca** (mate os 68 filler).
6. **Aplique o paywall e integre pagamento** (Mercado Pago/Pagar.me/Stripe) — ou assuma explicitamente que é protótipo.
7. **Conserte mobile e troque `alert()` por toasts** — ganhos rápidos de percepção premium.
8. **Cubra o legal** (Termos, Privacidade, PAR-Q, LGPD, disclaimers nos lugares certos).

---

## Respostas diretas

**O app está mais próximo de protótipo, MVP ou produto comercial?**
→ **Protótipo navegável de alta fidelidade (demo de pitch).** Não é MVP: sem persistência, sem backend/auth, IA e vídeo são fachada. Visualmente parece produto; funcionalmente é maquete.

**O que falta para virar MVP vendável?**
→ (1) Backend + Auth + **persistência**; (2) **vídeo real** (MoveKit + Stream) e fim do rótulo "3D realista"; (3) **pagamento + paywall aplicado**; (4) correção dos **IDs órfãos** e da **navegação mobile**; (5) plano semanal acoplado a exercícios reais. Com isso, vira um MVP honesto e cobrável.

**O que falta para competir com apps grandes?**
→ **IA adaptativa de verdade** (estilo Fitbod/Freeletics), **biblioteca de vídeo profissional** (própria para o top-50, licenciada para a cauda), **analytics com gráficos reais**, **nutrição com banco de alimentos**, **social multiusuário real** e **integrações** (Apple Health/Google Fit/wearables). Mais profundidade e confiabilidade de conteúdo.

**Qual deve ser a próxima implementação?**
→ **Fundação de dados (Backend + Auth + Persistência)**, executada **em paralelo** com a **troca do vídeo fake por clipes licenciados (MoveKit) no Cloudflare Stream** e o ajuste de copy. São os dois movimentos que transformam "demo bonita" em "produto de verdade".

---

### Fontes (pesquisa de mercado/custos)
- [Mux — Pricing](https://www.mux.com/pricing) · [Mux — Understanding Video Pricing](https://www.mux.com/docs/pricing/video)
- [Cloudflare Stream — Pricing](https://developers.cloudflare.com/stream/pricing/)
- [MoveKit — Best Exercise Animation Libraries 2026](https://movekit.com/blog/best-exercise-animation-libraries-2026) · [MoveKit — Pricing](https://movekit.com/pricing)
- [Muscle & Motion — Strength Training App](https://www.muscleandmotion.com/strength-training-app/) · [Muscle & Motion — Pricing](https://www.muscleandmotion.com/pricing/)
- [Hevy — Pricing](https://hevy.com/pricing) · [Fitbod vs Strong vs Hevy (2026 prices) — Smart Rabbit](https://www.smartrabbitfitness.com/blog/en/fitness-ai-apps-price-comparison-fitbod-strong-hevy-2025)
