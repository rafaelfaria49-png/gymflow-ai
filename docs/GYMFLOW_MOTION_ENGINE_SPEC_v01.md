# GymFlow Motion Engine — Especificação Técnica Oficial

**Documento:** `GYMFLOW_MOTION_ENGINE_SPEC_v01.md`
**Status:** Especificação normativa (v01) — **fonte de verdade** para a camada visual 3D do GymFlow AI
**Escopo:** Definir, sem ambiguidade, **o que** será construído, **como** e **com quais limites**, de modo que o produto final entregue **avatares 3D humanos realistas (masculino e feminino) com animações profissionais** — e **nunca** skeleton, wireframe ou boneco técnico.
**Natureza deste documento:** É um **contrato de engenharia e arte**, não código. Nada aqui implementa, altera arquivos existentes ou integra assets. Ele guia a construção real.

**Documentos relacionados:**
- `AUDITORIA_COMPLETA_GYMFLOW_AI_v01.md` — diagnóstico do estado atual (incl. o achado de que o "vídeo 3D" atual é um stick-figure 2D em canvas rotulado erroneamente como "Renderização Anatômica 3D Realista").
- `GYMFLOW_MOTION_ENGINE_RESEARCH_v01.md` — pesquisa de mercado/licenças e a decisão de arquitetura (pipeline híbrido glTF-first com biblioteca de animações própria).
- `POC_AVATAR_3D_GYMFLOW.md` — POC já construída (`/poc-3d`) que valida o pipeline R3F sem mentir na UI.

> **Regra de leitura obrigatória do projeto (AGENTS.md):** antes de escrever qualquer código que toque o runtime 3D, leia os guias em `node_modules/next/dist/docs/` (especialmente lazy-loading / `next/dynamic` com `ssr:false`). Esta spec assume esse passo.

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Regra visual absoluta](#2-regra-visual-absoluta)
3. [Padrão dos avatares oficiais](#3-padrão-dos-avatares-oficiais)
4. [Skeleton único](#4-skeleton-único)
5. [Padrão de animações](#5-padrão-de-animações)
6. [Primeiras 10 animações oficiais](#6-primeiras-10-animações-oficiais)
7. [Padrão de câmeras](#7-padrão-de-câmeras)
8. [Padrão de iluminação / cenário](#8-padrão-de-iluminação--cenário)
9. [Destaque muscular](#9-destaque-muscular)
10. [Formatos de arquivo](#10-formatos-de-arquivo)
11. [Pipeline de produção](#11-pipeline-de-produção)
12. [Integração com o app](#12-integração-com-o-app)
13. [API interna desejada](#13-api-interna-desejada)
14. [Critério de qualidade](#14-critério-de-qualidade)
15. [Estratégia MVP](#15-estratégia-mvp)
16. [Estratégia futura](#16-estratégia-futura)
17. [Riscos](#17-riscos)
18. [Próxima sprint recomendada — `GYMFLOW_MOTION_ENGINE_SKELETON_001`](#18-próxima-sprint-recomendada--gymflow_motion_engine_skeleton_001)

---

## 1. Visão geral

### 1.1. O que é a GymFlow Motion Engine

A **GymFlow Motion Engine** (doravante "a Engine") é o **subsistema visual de demonstração de movimento** do GymFlow AI. É a camada responsável por mostrar **como executar cada exercício** por meio de **avatares 3D humanos realistas** que reproduzem a técnica correta, com câmera, iluminação e destaque muscular de qualidade comparável a apps premium (Fitbod, Freeletics, Centr, Peloton).

Tecnicamente, a Engine é um **player 3D web/mobile** construído sobre:
- **Three.js** (núcleo WebGL) — já presente: `three@0.184.0`.
- **React Three Fiber** (`@react-three/fiber@9.6.1`) — integração declarativa React 19.
- **@react-three/drei** (`@10.7.7`) — helpers (`useGLTF`, `useAnimations`, `OrbitControls`, `ContactShadows`).
- **glTF/GLB** como **formato único de runtime**, com um **skeleton humanoide único** compartilhado por todos os avatares e todas as animações.

A Engine consome **dados de configuração** (avatares, clipes de animação, mapeamento `exercício → animação`, presets de câmera) e **assets binários** (`.glb`), e expõe um **componente de player** com uma API estável de props.

### 1.2. Por que ela existe

O GymFlow AI hoje exibe, na aba de técnica/biomecânica, um **desenho 2D em `<canvas>`** (stick-figure com bolinhas de articulação) rotulado como "Renderização Anatômica 3D Realista". Isso é, simultaneamente:
- **Tecnicamente honesto?** Não — é 2D, não é 3D, não é realista.
- **Comercialmente viável?** Não — destoa do posicionamento premium e quebra a confiança do usuário no movimento demonstrado.
- **Biomecanicamente útil?** Limitado — um palito não comunica amplitude, controle excêntrico, postura de coluna, pegada, etc.

A Engine existe para **substituir definitivamente** essa abordagem por **avatares humanos 3D reais**, transformando a **precisão biomecânica das animações** no diferencial competitivo (o "fosso") que nenhuma plataforma pronta entrega de forma idêntica.

### 1.3. Como ela se integra ao GymFlow AI

A Engine é **isolada e plugável**. Ela:
- Vive em `src/components/three/**` (e assets em `public/assets/**`).
- **NÃO** importa nem altera o `GymFlowContext` (planejador, treinos, IA Coach, nutrição, comunidade, monetização).
- Recebe do app apenas **um `exerciseId` (ou `videoId`)**, um **gênero** e **flags de playback**; devolve **pixels** (um player) e **status**.
- O carregamento do WebGL acontece **somente no cliente**, via `next/dynamic` com `ssr:false` dentro de um Client Component (regra do Next 16). Esse contrato **já está implementado** no `GymFlowAvatarStage.tsx`.

A substituição do componente antigo (`BiomechanicalVisualizer`) deve ser **drop-in**: a API de props da Engine (`GymFlowAvatarStageProps`) foi desenhada para espelhar a do componente antigo, permitindo trocar o import atrás de uma flag.

### 1.4. O que ela NÃO deve ser

- **NÃO** é um motor de jogo, física ragdoll ou simulação de tecidos em tempo real.
- **NÃO** é um editor de avatar dentro do app (isso é evolução futura, opcional).
- **NÃO** é um sistema de captura de movimento do usuário em tempo real (isso é roadmap futuro — seção 16).
- **NÃO** é um visualizador de **esqueleto, ossos, joints, wireframe ou debug**. Em **nenhuma** circunstância o usuário final deve ver representação técnica de rig.
- **NÃO** depende de nenhum motor externo (Unreal/Unity) **em runtime**, nem de royalties por sessão.

---

## 2. Regra visual absoluta

> Esta seção é **normativa e inegociável**. Qualquer entrega que a viole deve ser **rejeitada em revisão**, independentemente de prazo.

### 2.1. Proibido (lista fechada)

| ❌ Proibido | Por quê |
|---|---|
| **Skeleton / esqueleto de ossos visível** | Aparência de debug; não comunica técnica a um usuário leigo. |
| **Wireframe / malha aramada** | Idem; parece protótipo inacabado. |
| **Boneco palito (stick-figure)** | É exatamente o que estamos removendo; quebra o posicionamento premium. |
| **Bolinhas de articulação (joint markers) como representação principal** | Estética de software de captura, não de produto de consumo. |
| **Mock/placeholder com aparência "técnica" se passando por avatar** | Mentir na UI. Proibido chamar qualquer coisa de "3D realista" sem o asset real. |
| **Cores chapadas tipo "manequim de loja" sem material PBR** | Parece low-effort; some o realismo. |

### 2.2. Permitido (lista fechada)

| ✅ Permitido | Condição |
|---|---|
| **Avatar humano 3D realista** (masculino/feminino/neutro) | Com material PBR, skinning correto, animação profissional. Estado-alvo. |
| **Placeholder honesto** | **Apenas** quando o asset real ainda não existe. Deve declarar claramente a ausência: *"Adicione um arquivo .glb em public/assets/avatars"*. Pode mostrar um **objeto primitivo 3D neutro** (ex.: halter estilizado) **rotulado como pré-visualização do palco** — **nunca** como o avatar. **Nunca** rotulado como "3D realista". |
| **Overlays anatômicos sutis** sobre o avatar realista | Glow/heatmap de músculo (seção 9), desde que **complementares** ao corpo humano, não substitutos dele. |

### 2.3. Critério de aceite da regra visual

Um build só passa se, para **todo** estado possível do player:
1. Ou aparece um **humano 3D realista** animado; **ou**
2. Aparece um **placeholder honesto** que **declara explicitamente** que não há avatar e instrui como adicioná-lo.

**Nunca** um terceiro estado em que algo técnico (ossos/linhas/pontos) seja apresentado como se fosse a experiência final.

> **Observação sobre a POC atual:** o `PlaceholderDumbbell` (halter primitivo) do viewer **é permitido** porque (a) não é humano, (b) não é skeleton, (c) o chip o rotula como *"Palco 3D • Pré-visualização"* e o banner diz que **não** é o avatar final. Mantenha esse contrato de honestidade ao evoluir.

---

## 3. Padrão dos avatares oficiais

### 3.1. Avatares oficiais

| Avatar | `id` | Obrigatoriedade | Arquivo runtime |
|---|---|---|---|
| **GymFlow Masculino** | `male` | **MVP** | `/public/assets/avatars/male.glb` |
| **GymFlow Feminino** | `female` | **MVP** | `/public/assets/avatars/female.glb` |
| **GymFlow Neutro** | `neutral` | Opcional / fallback | `/public/assets/avatars/neutral.glb` |

Os caminhos e a estrutura de troca **já existem** em `avatar-config.ts` (`AVATARS: Record<AvatarGender, AvatarDefinition>`). A spec só preenche o **padrão de arte** desses arquivos.

### 3.2. Padrão de arte (obrigatório para ambos)

| Atributo | Especificação |
|---|---|
| **Tipo físico** | Corpo **atlético natural**, treinado mas **sem exagero** (não fisiculturista extremo). Referência: praticante regular de academia, 12–18% (M) / 18–24% (F) de gordura aparente. |
| **Proporções** | **Naturais e anatomicamente corretas**. Cabeça ~1/7,5 da altura. Sem estilização cartoon, sem proporções heroicas. |
| **Pele** | Material **PBR** com textura realista (albedo + normal + roughness). Subsurface sutil opcional. **Sem** aparência de plástico/cera. Diversidade de tom de pele desejável (ver 3.4). |
| **Rosto** | **Bem acabado**, neutro e simpático, sem uncanny valley agressivo. Olhos com brilho correto. Expressão concentrada/neutra. |
| **Mãos** | **Bem modeladas e riggeadas** — críticas porque a pegada (barra, halter, corda) é ponto técnico. Dedos individuais articuláveis. |
| **Cabelo** | Curto/preso e estilizado (cards ou mesh sólida leve). **Evitar** fios soltos físicos (custo + instabilidade mobile). |
| **Roupa** | **Fitness premium**: regata/top + bermuda/legging + tênis. Material PBR. Estética alinhada à marca (dark + acento cyber-lime `#a3e635` permitido em detalhes). **Sem** logos de terceiros. |
| **Calçado** | Tênis de treino genérico, bem modelado (aparece em agachamento/terra). |

### 3.3. Orçamento técnico por avatar (alinhado à seção 10)

| Métrica | Alvo | Teto |
|---|---|---|
| Triângulos | ≤ 40k | **60k** |
| Bones (skeleton) | ~65 | **70** |
| Materiais | ≤ 4 | 6 |
| Resolução de textura | 2K (2048²) | 2K (4K só para hero shots, não runtime mobile) |
| Tamanho do `.glb` final (Draco/Meshopt + KTX2) | ≤ 6 MB | **8 MB** |

### 3.4. Consistência entre avatares

- Masculino e feminino devem **compartilhar o mesmo skeleton** (seção 4) — é o que permite **uma animação rodar nos dois**.
- Devem ter **mesma escala (metros), mesmo eixo de frente (+Z), mesma origem (entre os pés, no chão, y=0)**.
- Estilo de shading, paleta e nível de detalhe **coerentes** entre si (parecem da mesma "família" de produto).

---

## 4. Skeleton único

> O **skeleton único** é o coração da Engine. Ele é o que torna a biblioteca de animações **reutilizável** e o custo marginal **baixo**. Toda animação é autorada/retargetada **para este skeleton**, e todo avatar é riggeado **com este skeleton**.

### 4.1. Convenção de bones

- **Base de compatibilidade:** humanoide **Mixamo-compatível** (também compatível com Ready Player Me e com o `Humanoid` do glTF na prática de mercado). Isso maximiza reuso de mocap e ferramentas.
- **Nomenclatura canônica:** prefixo `mixamorig:` **removido** na exportação final; nomes limpos em `PascalCase`. Mapa de nomes documentado e versionado (ver tabela 4.3).
- **Eixo/units:** Y-up, metros, frente para **+Z**, T-pose ou A-pose como bind pose (definir **uma** e manter).

### 4.2. Hierarquia recomendada

```
Hips (raiz do movimento)
└─ Spine
   └─ Spine1
      └─ Spine2
         ├─ Neck → Head → (HeadTop_End)
         ├─ LeftShoulder → LeftArm → LeftForeArm → LeftHand
         │     └─ (dedos: Thumb1..3, Index1..3, Middle1..3, Ring1..3, Pinky1..3)
         └─ RightShoulder → RightArm → RightForeArm → RightHand
               └─ (dedos: espelho do esquerdo)
└─ LeftUpLeg → LeftLeg → LeftFoot → LeftToeBase
└─ RightUpLeg → RightLeg → RightFoot → RightToeBase
```

- **Root motion:** `Hips` é a raiz de movimento. Para exercícios estacionários (a maioria), o root fica **travado no lugar** (sem deslocamento horizontal acumulado), evitando "deriva" do avatar.
- **Dedos:** obrigatórios no skeleton (qualidade de pegada), mas podem ter animação simplificada no MVP.

### 4.3. Tabela de bones canônicos (contrato)

| Região | Bones | Obrigatório no MVP |
|---|---|---|
| Núcleo | `Hips`, `Spine`, `Spine1`, `Spine2` | ✅ |
| Cabeça | `Neck`, `Head` | ✅ |
| Braço E | `LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftHand` | ✅ |
| Braço D | `RightShoulder`, `RightArm`, `RightForeArm`, `RightHand` | ✅ |
| Perna E | `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftToeBase` | ✅ |
| Perna D | `RightUpLeg`, `RightLeg`, `RightFoot`, `RightToeBase` | ✅ |
| Mãos (dedos) | 15 bones por mão (5 dedos × 3) | ⚠️ Skeleton sim; animação detalhada pode ser pós-MVP |

> A lista **fechada e definitiva** de nomes (string exata por bone) é **entregável da sprint `SKELETON_001`** (seção 18), para virar arquivo de contrato versionado.

### 4.4. Requisitos para reaproveitar animações

1. **Mesmo skeleton, mesmos nomes, mesma hierarquia** em todos os avatares.
2. **Mesma bind pose** (T ou A) entre avatares e clipes.
3. **Mesma orientação/escala**.
4. Animações exportadas como **clipes que referenciam bones por nome** (não por índice).
5. Quando proporções diferirem (M vs F), usar **retargeting** na produção (Blender/Cascadeur/ferramenta) — **nunca** em runtime.

### 4.5. Compatibilidade GLB/glTF

- O skeleton vira um **`skin` glTF** com `joints` + `inverseBindMatrices`.
- Clipes de animação podem ser:
  - **Embutidos** no `.glb` do avatar (mais simples; replica clipes por avatar), **ou**
  - **Separados** em `.glb` só-de-animação (preferível: um clipe serve M e F). O `AnimationClipDef.path` já modela isso (`path: ''` = embutido).
- **Drei/`useAnimations`** liga os `AnimationClip` ao `AnimationMixer` do objeto skinned.

### 4.6. Como evitar incompatibilidade avatar × animação

| Risco | Prevenção (regra de produção) |
|---|---|
| Nomes de bone divergentes | **Validador automático** compara o skeleton do avatar com o skeleton de referência (`SKELETON_001`). Falha = bloqueia merge. |
| Bind pose diferente | Padronizar **uma** bind pose; documentar; validar no import. |
| Escala/eixo errados | Normalizar na exportação; teste de fumaça no R3F (avatar "planta" no chão, encara a câmera). |
| Clipe referencia bone inexistente | Validador lista tracks órfãs; clipe reprovado. |
| Skinning quebrado ao instanciar | **Nunca** `scene.clone(true)` de SkinnedMesh; usar **`SkeletonUtils.clone`** para múltiplas instâncias (a POC já tem essa nota no viewer). |

---

## 5. Padrão de animações

### 5.1. Estrutura temporal de um clipe de exercício

Cada clipe representa **uma repetição completa, em loop suave**, com três fases legíveis:

| Fase | Conteúdo | Observação |
|---|---|---|
| **Início (setup)** | Posição de partida estável (ex.: barra no peito, quadril alto) | É também o ponto de costura do loop. |
| **Meio (execução)** | Fase **excêntrica** + fase **concêntrica** | É onde a técnica é demonstrada. |
| **Fim (retorno)** | Volta à posição inicial idêntica ao frame 0 | **Loop sem "estalo"** — frame final ≈ frame inicial. |

### 5.2. Parâmetros normativos

| Parâmetro | Especificação |
|---|---|
| **Duração** | 1 repetição em **3–5 s** a 1.0× (ritmo controlado, didático). Definir por exercício (seção 6). |
| **Loop** | **Suave e contínuo** (`loop: true`). Sem flick entre última e primeira frame. |
| **Respiração** | Mesmo em `idle`, sutil sobe/desce de tórax/ombros — **avatar vivo, nunca estátua**. |
| **Excêntrica** | Fase de descida/alongamento **controlada** (≈ 40–50% do tempo da rep). Comunica controle, não "queda". |
| **Concêntrica** | Fase de força **deliberada** (≈ 30–40%), sem "tranco". |
| **Velocidade** | Player controla `timeScale` (1.0× / 1.5× / 2.0× já previstos na UI). Clipe autorado a **1.0×**. |
| **Amplitude (ROM)** | **Tecnicamente correta** por exercício — ROM completa e segura. Sem encurtar a amplitude por estética. |
| **Pés/contato** | Pés fixos no chão durante a execução (sem flutuar/escorregar — *foot sliding* proibido). |
| **Coluna** | Neutra/segura conforme o exercício (crítico em terra/stiff/remada). |

### 5.3. Erros comuns futuros (a serem **demonstráveis** depois)

A spec já reserva espaço, no modelo de dados (seção 13, `MotionClip.variant`), para **variações "errado vs. certo"** por exercício. No MVP só produzimos o **certo**; o **errado** é roadmap (seção 16). Exemplos de erros a animar no futuro: lombar fletida no terra, joelho valgo no agachamento, balanço de tronco na rosca, amplitude parcial no supino, quadril subindo antes do peito no terra.

### 5.4. Correções futuras

A estrutura de clipes permitirá, no futuro: **comparação lado a lado (certo × errado)**, **anotações temporais** (marcadores em frames-chave), e **dicas da IA Coach** atreladas a fases do clipe. Nada disso é MVP — mas a modelagem de dados não pode **impedir** essa evolução.

---

## 6. Primeiras 10 animações oficiais

> Prioridade absoluta de produção. Estas 10 cobrem os grandes padrões de movimento e ~80% dos treinos típicos. Cada clipe é autorado **uma vez** para o skeleton único e roda em **M e F**.

> **Nota de mapeamento (POC ↔ produção):** o `resolveAnimationId()` atual agrupa alguns exercícios em 7 animações lógicas (ex.: *leg press* → `squat`, *puxada* → `row`, *tríceps* → `biceps_curl`, *stiff* → `deadlift`). Esta seção define **10 clipes distintos** como **alvo de produção**. Ao produzir os assets reais, os ids lógicos devem ser **desmembrados** para clipes próprios (atualizando `ANIMATIONS` e as regras de mapeamento). A POC continua válida como andaime; a spec define o destino.

| # | Exercício | `clipId` (alvo) | Equipamento | Duração 1×(s) |
|---|---|---|---|---|
| 1 | Supino reto | `bench_press_barbell` | Barra + banco | 3.5 |
| 2 | Agachamento | `squat_barbell` | Barra + suporte | 4.0 |
| 3 | Leg press | `leg_press` | Máquina leg press 45° | 3.5 |
| 4 | Remada | `row_barbell` | Barra (curvada) | 3.5 |
| 5 | Puxada alta | `lat_pulldown` | Máquina pulley alto | 3.5 |
| 6 | Desenvolvimento | `shoulder_press_dumbbell` | Halteres (ou barra) | 3.5 |
| 7 | Rosca direta | `biceps_curl_barbell` | Barra (ou halteres) | 3.0 |
| 8 | Tríceps corda | `triceps_pushdown_rope` | Polia alta + corda | 3.0 |
| 9 | Stiff | `stiff_deadlift` | Barra | 4.0 |
| 10 | Elevação pélvica | `hip_thrust` | Barra + banco | 3.5 |

### Detalhamento por exercício

#### 1. Supino reto — `bench_press_barbell`
- **Músculos principais:** peitoral maior.
- **Secundários:** tríceps, deltoide anterior.
- **Equipamento:** barra, banco reto, anilhas.
- **Câmeras:** lateral (principal — mostra trajetória da barra), 45°, close em peitoral.
- **Pontos técnicos:** escápulas retraídas, leve arco lombar fisiológico, pés firmes, barra desce à linha dos mamilos, cotovelos ~45–75°.
- **Erros (futuro):** descida no pescoço, cotovelos abertos 90°, quicar a barra no peito, amplitude parcial, glúteos fora do banco.

#### 2. Agachamento — `squat_barbell`
- **Músculos principais:** quadríceps, glúteo máximo.
- **Secundários:** posteriores, eretores da espinha, adutores, core.
- **Equipamento:** barra, suporte/rack.
- **Câmeras:** lateral (profundidade + coluna), frontal (joelhos), 45°.
- **Pontos técnicos:** descer ao menos até paralela, joelhos acompanham a ponta dos pés, coluna neutra, peso no meio do pé.
- **Erros (futuro):** joelho valgo, lombar fletida ("butt wink" exagerado), calcanhar subindo, profundidade parcial.

#### 3. Leg press — `leg_press`
- **Músculos principais:** quadríceps, glúteo.
- **Secundários:** posteriores de coxa.
- **Equipamento:** máquina leg press 45°.
- **Câmeras:** lateral (ângulo de joelho), 45°, close em quadríceps.
- **Pontos técnicos:** não travar joelhos no topo, lombar apoiada, amplitude controlada, pés na largura dos ombros.
- **Erros (futuro):** lombar descolando do apoio, amplitude curta, travar joelhos com tranco.

#### 4. Remada — `row_barbell`
- **Músculos principais:** dorsais (latíssimo), trapézio médio, romboides.
- **Secundários:** bíceps, deltoide posterior, eretores.
- **Equipamento:** barra.
- **Câmeras:** lateral (ângulo de tronco + coluna), 45°, close em dorsal.
- **Pontos técnicos:** tronco ~45°, coluna neutra, puxar à linha do umbigo, escápulas retraem.
- **Erros (futuro):** tronco subindo a cada rep (uso de impulso), coluna curvada, puxar com bíceps.

#### 5. Puxada alta — `lat_pulldown`
- **Músculos principais:** latíssimo do dorso.
- **Secundários:** bíceps, romboides, deltoide posterior.
- **Equipamento:** máquina pulley alto + barra.
- **Câmeras:** frontal (simetria), lateral, close em dorsal.
- **Pontos técnicos:** puxar à parte superior do peito, leve inclinação de tronco, escápulas deprimem, sem balanço.
- **Erros (futuro):** puxar atrás da nuca, balanço excessivo, amplitude parcial.

#### 6. Desenvolvimento — `shoulder_press_dumbbell`
- **Músculos principais:** deltoides (anterior + medial).
- **Secundários:** tríceps, trapézio superior.
- **Equipamento:** halteres (variante: barra).
- **Câmeras:** frontal, lateral (trajetória), close em ombro.
- **Pontos técnicos:** core firme, sem hiperextensão lombar, amplitude completa, punhos neutros.
- **Erros (futuro):** arquear demais a lombar, amplitude parcial, cotovelos travados com tranco.

#### 7. Rosca direta — `biceps_curl_barbell`
- **Músculos principais:** bíceps braquial.
- **Secundários:** braquiorradial, braquial.
- **Equipamento:** barra (variante: halteres).
- **Câmeras:** frontal, lateral, close em bíceps.
- **Pontos técnicos:** cotovelos fixos ao lado do corpo, sem balanço de tronco, controle na descida.
- **Erros (futuro):** balanço de tronco/quadril, cotovelos avançando, descida sem controle.

#### 8. Tríceps corda — `triceps_pushdown_rope`
- **Músculos principais:** tríceps braquial.
- **Secundários:** ancôneo.
- **Equipamento:** polia alta + corda.
- **Câmeras:** lateral, frontal, close em tríceps.
- **Pontos técnicos:** cotovelos fixos ao lado, abrir a corda na base, extensão completa, tronco estável.
- **Erros (futuro):** cotovelos abrindo, uso de tronco/peso corporal, amplitude parcial.

#### 9. Stiff — `stiff_deadlift`
- **Músculos principais:** posteriores de coxa, glúteo máximo.
- **Secundários:** eretores da espinha, dorsais (estabilização).
- **Equipamento:** barra.
- **Câmeras:** lateral (coluna + dobradiça de quadril — principal), 45°, close em posterior.
- **Pontos técnicos:** **dobradiça de quadril** (hip hinge), coluna neutra, joelhos levemente fletidos e fixos, barra rente às pernas.
- **Erros (futuro):** lombar fletida (alto risco), barra longe do corpo, agachar em vez de articular o quadril.

#### 10. Elevação pélvica — `hip_thrust`
- **Músculos principais:** glúteo máximo.
- **Secundários:** posteriores de coxa, core.
- **Equipamento:** barra + banco.
- **Câmeras:** lateral (extensão de quadril — principal), 45°, close em glúteo.
- **Pontos técnicos:** apoio das escápulas no banco, queixo levemente para dentro, extensão completa de quadril no topo, tíbia vertical.
- **Erros (futuro):** hiperextensão lombar no topo, amplitude parcial, empurrar com a ponta dos pés.

---

## 7. Padrão de câmeras

A Engine define **presets de câmera** nomeados, selecionáveis por exercício e pelo usuário. Cada exercício declara sua **câmera primária** (a que melhor mostra a técnica) e câmeras secundárias permitidas.

| Preset | `id` | Uso |
|---|---|---|
| **Frontal** | `front` | Simetria, abdução/adução, padrões frontais (puxada, desenvolvimento). |
| **Lateral** | `side` | Trajetória, coluna, dobradiça de quadril (terra, stiff, agachamento, supino). Geralmente a primária. |
| **45 graus** | `three_quarter` | Visão geral "natural", default de muitas telas. |
| **Zoom técnico** | `technical_zoom` | Aproxima a região-chave (ex.: joelho no agachamento). |
| **Close muscular** | `muscle_close` | Fecha no músculo principal, casado com o destaque muscular (seção 9). |
| **Livre (player)** | `free_orbit` | `OrbitControls` — usuário gira/zoom. Limites de polar/distância de `STAGE_CONFIG.controls`. |
| **Mobile vertical** | `mobile_portrait` | Enquadramento retrato (9:16), FOV/altura ajustados para coluna estreita; corpo inteiro legível em tela de celular. |

**Regras:**
- O preset base de palco já existe em `STAGE_CONFIG.camera` (`position [0, 1.45, 3.4]`, `fov 35`, `target [0, 1.0, 0]`). Os presets desta seção são **derivações** desse palco.
- Transição entre presets deve ser **suave** (tween de posição/target), nunca corte seco brusco.
- `free_orbit` respeita `enablePan:false`, `minDistance/maxDistance`, `min/maxPolarAngle` já definidos — evita o usuário "entrar dentro" do avatar ou ver por baixo do chão.

---

## 8. Padrão de iluminação / cenário

| Atributo | Especificação |
|---|---|
| **Ambiente** | **Academia premium escura** — fundo `#0b0b0f`/`#0e0e13` (já em `STAGE_CONFIG`), coerente com o tema dark do app. |
| **Luz principal (key)** | Direcional suave, levemente acima e à frente, criando volume sem estourar. |
| **Preenchimento (fill)** | Luz ambiente baixa + segunda fonte oposta para não perder o lado escuro. |
| **Recorte (rim)** | Luz traseira sutil com leve **acento cyber-lime** (`#a3e635`) só para destacar a silhueta — discreto, marca registrada. |
| **Sombras** | `ContactShadows` (já no viewer) para "plantar" o avatar no chão. Sombras suaves, não duras. |
| **Profundidade** | Leve `fog` para separar avatar do fundo; fundo **desfocado/limpo**. |
| **Piso** | Círculo/plano sutil sob o avatar (já presente), sem textura poluída. |
| **Poluição visual** | **Proibida.** Sem props desnecessários, sem HUD carregado, sem texto sobre o corpo. Foco total no **avatar + movimento**. |
| **Tom geral** | Cinematográfico, sóbrio, "estúdio premium". Nunca clínico-branco, nunca cartoon-colorido. |

---

## 9. Destaque muscular

> O destaque muscular é **camada complementar** sobre o avatar realista. **Nunca** substitui o corpo humano por uma representação esquemática.

| Atributo | Especificação |
|---|---|
| **Músculo principal** | Glow/heatmap mais intenso na região do agonista do exercício (ex.: peitoral no supino). |
| **Músculos secundários** | Glow mais sutil nos sinergistas (ex.: tríceps, deltoide anterior). |
| **Glow sutil** | Emissivo/overlay com opacidade **baixa-média**, pulsando levemente em sincronia com a fase concêntrica (opcional). Acento cyber-lime ou gradiente quente. |
| **Overlay anatômico** | Pode realçar grupos musculares por máscara de textura/material; deve **respeitar a forma do corpo realista**. |
| **Proibido** | ❌ Parecer **desenho infantil** (cores primárias chapadas). ❌ Parecer **debug técnico** (regiões com wireframe/cores de ID). |
| **Toggle** | Destaque muscular é **ligável/desligável**; o avatar realista sem overlay deve ser sempre uma opção limpa. |

A modelagem de dados do destaque vive em `MuscleHighlight` (seção 13), atrelada a cada `MotionClip`.

---

## 10. Formatos de arquivo

| Formato | Papel | Regra |
|---|---|---|
| **GLB / glTF 2.0** | **Único formato de runtime** | Tudo que o app carrega é `.glb` (binário, self-contained) ou `.gltf`. |
| **FBX** | Produção apenas | Intercâmbio com Mixamo/ferramentas. **Nunca** vai pro runtime. |
| **BVH** | Produção apenas | Mocap bruto (ex.: Rokoko). **Nunca** vai pro runtime. |
| **Texturas** | Runtime | **KTX2/Basis** (GPU-compressed) preferível; PNG/JPG otimizado como fallback. 2K runtime. |
| **Compressão de malha** | Runtime | **Draco** ou **Meshopt** obrigatórios no `.glb` final. |
| **LODs** | Runtime (escala) | Pelo menos LOD0 (perto) e LOD1 (longe/mobile) quando a contagem de exercícios crescer. Opcional no MVP. |

### Orçamento de tamanho por asset

| Asset | Alvo | Teto |
|---|---|---|
| Avatar `.glb` (geometria + textura + skin) | ≤ 6 MB | **8 MB** |
| Clipe de animação `.glb` (sem geometria, só tracks) | ≤ 300 KB | 600 KB |
| Cenário/props (se separados) | ≤ 1 MB | 2 MB |
| **Carga inicial do player (1 avatar + 1 clipe)** | ≤ 7 MB | **10 MB** |

---

## 11. Pipeline de produção

Fluxo ideal, da concepção ao runtime. Cada etapa tem um **gate de validação** antes da seguinte.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ GymFlow Motion Engine — Pipeline de Produção                              │
└──────────────────────────────────────────────────────────────────────────┘

  (1) CRIAR/OBTER AVATAR BASE
      Ready Player Me / Character Creator 4 / MetaHuman→export / custom
        │  Gate: padrão de arte (§3) + licença válida p/ embutir (§17)
        ▼
  (2) RIGAR NO SKELETON ÚNICO
      Conformar ao skeleton SKELETON_001 (nomes/hierarquia §4)
        │  Gate: validador de skeleton passa (nomes/bind pose/escala)
        ▼
  (3) CRIAR/CAPTURAR ANIMAÇÃO
      Mocap (Move AI / Rokoko) OU keyframe manual (Blender/Cascadeur)
        │  Gate: biomecânica revisada por especialista (§6 pontos técnicos)
        ▼
  (4) LIMPAR / RETARGETAR (Blender / Cascadeur)
      Remover jitter, travar pés, garantir loop, retarget M↔F
        │  Gate: sem foot sliding, loop sem estalo, ROM correta
        ▼
  (5) EXPORTAR GLB
      glTF 2.0; clipe separado (preferível) ou embutido
        │  Gate: importa no three.js sem warnings de skin
        ▼
  (6) OTIMIZAR
      Draco/Meshopt + KTX2 + budget (§10) — ex.: gltf-transform
        │  Gate: dentro do orçamento de tamanho
        ▼
  (7) TESTAR NO R3F
      Carregar em /poc-3d; checar luz, câmera, sombra, playback, mobile
        │  Gate: checklist de qualidade (§14) passa
        ▼
  (8) MAPEAR EXERCÍCIO → ANIMAÇÃO
      Atualizar avatar-config.ts (ANIMATIONS + regras) e marcar available:true
        │  Gate: resolveAnimationId cobre os ids reais do catálogo de exercícios
        ▼
  ✅ DISPONÍVEL EM RUNTIME
```

**Ferramentas de referência (de `RESEARCH_v01`):** avatar base (Ready Player Me / Character Creator 4 / MetaHuman para render); mocap (Move AI ~US$0,01–0,02/s, Rokoko Vision); cleanup/keyframe (Blender, Cascadeur Indie/Pro); otimização (`gltf-transform`, gltfpack). Sempre validar a **cláusula de licença para conteúdo embutido em SaaS** antes de adotar (§17).

---

## 12. Integração com o app

A Engine é consumida **sempre** pelo mesmo componente público (`GymFlowAvatarStage`), variando só as props/preset por contexto. **Nenhum** desses pontos importa o contexto global do app.

| Ponto de uso | Como a Engine entra | Câmera default | Notas |
|---|---|---|---|
| **Aba Vídeos** | Player principal da técnica (substitui o canvas 2D) | `side`/`three_quarter` | Controles completos: play/pause, velocidade, troca de câmera, gênero, destaque muscular. |
| **Ver Técnica** (dentro de um exercício) | Player embutido no detalhe do exercício | Câmera **primária** do exercício (§6) | Foco didático; dica de controles visível. |
| **Treino ativo** | **Mini preview** ao lado da série atual | `mobile_portrait`/`three_quarter` | Leve, possivelmente pausado por padrão; tocar abre fullscreen. |
| **Mini preview** (cards/listas) | Thumbnail animado curto ou frame estático | `three_quarter` | Performance: pode usar pôster estático + carregar 3D on-demand. |
| **IA Coach** | Player atrelado a uma dica/correção | `muscle_close`/câmera primária | Futuro: marcadores temporais sincronizados com a fala da IA. |
| **Biblioteca de exercícios** | Player no detalhe + preview na listagem | `three_quarter` | Reusa o mesmo mapeamento `exerciseId → clip`. |
| **Fullscreen** | Player em tela cheia, `free_orbit` liberado | `free_orbit` | Experiência imersiva; todos os controles + troca de câmera. |

**Regra de performance de integração:** no máximo **um** `<Canvas>` WebGL ativo por tela. Listas usam pôster estático e instanciam o player só sob interação (lazy). Fullscreen não cria um segundo contexto — promove o existente.

---

## 13. API interna desejada

> Tipos **propostos** (TypeScript). Onde a POC já tem um equivalente, a spec **estende** sem quebrar. Esta seção é o contrato que a sprint de implementação deverá honrar — **não é para implementar agora**.

```ts
// ── Avatar ────────────────────────────────────────────────────────────────
// Estende AvatarDefinition (já existe em avatar-config.ts).
export type AvatarGender = 'male' | 'female' | 'neutral';

export interface AvatarProfile {
  id: AvatarGender;
  label: string;
  modelPath: string;          // /assets/avatars/*.glb
  available: boolean;         // true só com asset real (regra de honestidade §2)
  scale?: number;
  yOffset?: number;
  // novos (opcionais, retrocompatíveis):
  skeletonVersion?: string;   // ex.: 'SKELETON_001' — valida compatibilidade
  bindPose?: 'T' | 'A';
  skinTone?: string;          // metadado de arte
}

// ── Animação ──────────────────────────────────────────────────────────────
// Estende AnimationClipDef (já existe).
export interface MotionClip {
  id: string;                 // ex.: 'squat_barbell'
  label: string;
  path: string;               // '' = embutido no avatar
  clipName?: string;
  loop: boolean;
  available: boolean;
  // novos:
  durationSec?: number;       // duração de 1 rep a 1.0×
  primaryCamera?: CameraPreset['id'];
  variant?: 'correct' | 'error';   // §5.3 — MVP só 'correct'
  muscles?: MuscleHighlight;
}

// ── Mapeamento exercício → animação ─────────────────────────────────────────
export interface ExerciseMotionMap {
  resolve(exerciseOrVideoId: string): string;  // já existe: resolveAnimationId()
  rules: { match: string[]; clipId: string }[];
  defaultClipId: string;                        // já existe: DEFAULT_ANIMATION_ID
}

// ── Câmera ──────────────────────────────────────────────────────────────────
export interface CameraPreset {
  id: 'front' | 'side' | 'three_quarter' | 'technical_zoom'
    | 'muscle_close' | 'free_orbit' | 'mobile_portrait';
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  orbit?: boolean;            // true só em free_orbit
}

// ── Destaque muscular ────────────────────────────────────────────────────────
export interface MuscleHighlight {
  primary: string[];          // ex.: ['pectoralis_major']
  secondary: string[];        // ex.: ['triceps', 'deltoid_anterior']
  intensity?: number;         // 0..1
  pulseWithConcentric?: boolean;
}

// ── Props do player público ─────────────────────────────────────────────────
// Estende GymFlowAvatarStageProps (já existe).
export interface MotionPlayerProps {
  exerciseId: string;         // resolve o clip via ExerciseMotionMap
  gender?: AvatarGender;
  isPlaying?: boolean;
  playbackSpeed?: number;     // 1 | 1.5 | 2
  autoRotate?: boolean;
  camera?: CameraPreset['id'];      // novo
  showMuscleHighlight?: boolean;    // novo
  showHint?: boolean;
  className?: string;
  width?: number;
  height?: number;
  onStatusChange?: (s: ViewerStatus) => void;  // já existe no viewer
}

// Estado do viewer (já existe): 'placeholder' | 'loading' | 'model' | 'error'
export type ViewerStatus = 'placeholder' | 'loading' | 'model' | 'error';
```

**Princípios da API:**
- **Aditiva:** novos campos são opcionais; a POC continua compilando.
- **Dirigida a dados:** mapeamentos e presets são **dados**, não `if/else` em componente (padrão já adotado em `ANIMATION_MAP_RULES`).
- **Honestidade embutida:** `available:false` ⇒ player entra em modo placeholder honesto. Não há caminho de código que pinte placeholder como avatar real.

---

## 14. Critério de qualidade

Checklist de **gate de release** (todas as respostas precisam ser "sim" para um clipe/avatar ir a produção):

- [ ] **Parece um humano real?** (material PBR, proporções naturais, rosto/mãos acabados)
- [ ] **NÃO parece skeleton/wireframe/palito/debug?** (regra §2)
- [ ] **O movimento é biomecanicamente natural e correto?** (ROM, fases, pontos técnicos da §6)
- [ ] **Loop é suave** (sem estalo entre frame final e inicial)?
- [ ] **Roda bem no desktop?** (60 fps alvo; sem hitch ao carregar)
- [ ] **Roda bem no mobile?** (≥ 30 fps; dentro do orçamento §10; sem crash de memória)
- [ ] **Textura está boa?** (sem esticamento, sem aparência de plástico)
- [ ] **Roupa está boa?** (fitness premium, sem clipping grosseiro, sem logos de terceiros)
- [ ] **Câmera está boa?** (a primária mostra claramente a técnica; transições suaves)
- [ ] **Pés fixos / sem foot sliding?**
- [ ] **O usuário confiaria no movimento demonstrado?** (julgamento final de produto)
- [ ] **A UI é honesta?** (nada chamado de "3D realista" sem asset; placeholder declara ausência)

---

## 15. Estratégia MVP

**Escopo mínimo para a primeira versão real (sem inflar):**

| Item | Quantidade MVP |
|---|---|
| Avatares | **1 masculino + 1 feminino** (neutro = fallback opcional) |
| Animações | **As 10 oficiais** (§6) |
| Cenário | **1** estúdio premium (§8) |
| Câmeras | **4** presets ativos: `front`, `side`, `three_quarter`, `mobile_portrait` |
| Destaque muscular | Opcional no MVP (pode entrar como toggle simples) |
| Variações "errado" | **Fora** do MVP |

**Não-objetivos do MVP (explícito):**
- ❌ Não tentar cobrir 300 exercícios.
- ❌ Não construir editor de avatar.
- ❌ Não captura de movimento do usuário.
- ❌ Não animar erros ainda.

**Definição de pronto (MVP):** os 10 exercícios prioritários, em M e F, carregam avatar realista em desktop e mobile, dentro do orçamento de performance, passando o checklist §14, com a troca de gênero/câmera/velocidade funcionando, **substituindo** o visualizador 2D atual atrás de uma flag.

---

## 16. Estratégia futura

Evolução pós-MVP, em ondas (cada onda só começa com a anterior estável):

| Onda | Conteúdo |
|---|---|
| **F1 — 50 exercícios** | Expandir a biblioteca de clipes para os 50 movimentos mais comuns; mais variantes de equipamento (halter/máquina/barra). |
| **F2 — 100 exercícios** | Cobertura ampla; LODs obrigatórios; possivelmente streaming/lazy de assets por categoria. |
| **F3 — Erros comuns animados** | Clipes `variant:'error'` por exercício (§5.3). |
| **F4 — Comparação certo × errado** | Player lado a lado / overlay; marcadores temporais. |
| **F5 — Câmera do usuário** | Captura via webcam/celular para comparar a execução do usuário com o avatar de referência. |
| **F6 — Correção por IA** | IA Coach analisa a execução e aponta desvios sincronizados com o clipe de referência. |
| **F7 — Avatar personalizado** | Usuário ajusta corpo/roupa/tom de pele (sempre sobre o skeleton único). |

A modelagem de dados da §13 (`variant`, `MuscleHighlight`, `CameraPreset`) já antecipa F3–F6 sem reescrita.

---

## 17. Riscos

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| R1 | **Assets ruins** (avatar "manequim", animação robótica) | Quebra o posicionamento premium; pior que o 2D atual | Gate de qualidade §14; revisão de arte + biomecânica antes do merge; começar com 1 par bem-feito, não 10 medíocres. |
| R2 | **Licença inadequada** (asset que não pode ser embutido em SaaS) | Risco jurídico / retrabalho | Validar EULA **antes** de produzir: Daz proíbe embutir mesh; CC4/ActorCore têm cláusula "embedded/online service" a confirmar; RPM ok mas futuro incerto (Netflix); Mixamo ok mas não redistribuir asset bruto. (detalhe em `RESEARCH_v01`). |
| R3 | **Performance mobile** | Travamento/crash em celulares medianos | Orçamento §10; Draco/Meshopt+KTX2; LODs; 1 Canvas por tela; pôster estático em listas; teste em device real, não só desktop. |
| R4 | **Arquivos pesados** | Carregamento lento, bounce | Teto de tamanho §10 como gate de build; clipes separados leves; lazy-load. |
| R5 | **Animação biomecanicamente errada** | App ensina técnica **errada** → risco ao usuário + responsabilidade | Revisão por profissional de Educação Física; checklist §6; não publicar clipe sem aprovação técnica. |
| R6 | **Inconsistência visual** (M e F parecem de produtos diferentes; skeletons divergem) | Quebra de coesão; animações não reaproveitam | Skeleton único `SKELETON_001` + validador automático; mesma direção de arte; mesma bind pose/escala/eixo. |
| R7 | **Lock-in/royalty de runtime** | Custo recorrente / dependência | Nenhuma dependência de motor externo em runtime; biblioteca de animação **própria**; plataformas só como ferramenta de produção. |
| R8 | **Regressão de honestidade** | Voltar a rotular placeholder/2D como "3D realista" | Regra §2 como gate de revisão; manter o contrato do `ViewerStatus` (placeholder honesto). |

---

## 18. Próxima sprint recomendada — `GYMFLOW_MOTION_ENGINE_SKELETON_001`

**Objetivo da sprint:** congelar o **contrato de skeleton e de assets** e **provar end-to-end** com **1 avatar M + 1 avatar F** e **1 animação simples**, sem ainda produzir as 10 animações. É a sprint que **destrava** toda a produção posterior com baixo risco.

> Esta sprint **não** está autorizada por este documento — é a **recomendação** de próximo passo. Implementação só mediante aprovação explícita.

### 18.1. Entregáveis

1. **Documento de contrato de skeleton** (`docs/skeletons/SKELETON_001.md`):
   - Lista **fechada e exata** de bones (string por bone), expandindo a tabela §4.3.
   - Hierarquia completa (incluindo os 15 bones por mão).
   - Bind pose definida (T **ou** A), eixo (+Z frente), unidade (metros), origem (y=0 entre os pés).
   - Convenção de nomes de clipes (`<exercicio>_<equipamento>`) e de materiais.

2. **Contratos de assets** (specs de entrega para o artista/fornecedor):
   - `avatar.contract` — orçamento (§3.3/§10), materiais, naming, formato de export.
   - `animation.contract` — duração, loop, fases (§5), naming de clip/tracks.

3. **Validador de skeleton** (especificação, não necessariamente código nesta sprint):
   - Regras que comparam um `.glb` recebido com `SKELETON_001` (nomes, hierarquia, bind pose, escala) e **reprovam** divergências.

4. **Validação de 1 avatar M + 1 avatar F:**
   - Os dois `.glb` passam no validador e carregam no `/poc-3d` com escala/orientação corretas, "plantados" no chão, encarando a câmera.
   - Troca de gênero funciona só por config (já suportado).

5. **Validação de 1 animação simples** (ex.: `idle` com respiração, ou `squat_barbell`):
   - Um único clipe `.glb` separado roda **nos dois** avatares via o mesmo `AnimationClip` (prova de reuso pelo skeleton único).
   - Loop suave, sem foot sliding, dentro do orçamento.

### 18.2. Definição de pronto (SKELETON_001)

- [ ] `SKELETON_001.md` publicado com a lista de bones congelada.
- [ ] Contratos de avatar e de animação publicados.
- [ ] 1 avatar M + 1 avatar F reais carregam no `/poc-3d` (placeholder some, chip vira *"Avatar 3D"*).
- [ ] 1 animação roda **idêntica** nos dois avatares (mesmo clipe).
- [ ] Checklist §14 passa para esse conjunto mínimo.
- [ ] Nada de skeleton/wireframe/palito visível em **nenhum** estado (regra §2).
- [ ] UI honesta mantida (sem "3D realista" sem asset).

### 18.3. Saídas que habilitam a sprint seguinte

Com `SKELETON_001` aprovado, a sprint de animações (`MOTION_LIB_010`) produz as **10 animações oficiais** (§6) sobre um contrato estável, com retarget M↔F garantido — risco de incompatibilidade praticamente eliminado.

---

## Apêndice A — Conformidade com o estado atual da POC

| Elemento da spec | Estado na POC (`src/components/three/`) | Ação futura |
|---|---|---|
| `AvatarGender`, `AVATARS`, `AvatarDefinition` | ✅ Existe em `avatar-config.ts` | Estender p/ `AvatarProfile` (campos opcionais §13). |
| `AnimationClipDef`, `ANIMATIONS` (7 ids) | ✅ Existe | Desmembrar p/ 10 `clipId` oficiais (§6) ao produzir assets. |
| `resolveAnimationId()` + regras como dados | ✅ Existe | Atualizar regras p/ ids reais do catálogo. |
| `STAGE_CONFIG` (câmera/controles/cores) | ✅ Existe | Base dos `CameraPreset` (§7). |
| `GymFlowAvatarStageProps` | ✅ Existe | Estender p/ `MotionPlayerProps` (camera, muscle highlight). |
| `ViewerStatus` + placeholder honesto | ✅ Existe | Manter — é o cumprimento da regra §2. |
| Carregar Canvas só no cliente (`ssr:false`) | ✅ Existe em `GymFlowAvatarStage.tsx` | Manter contrato Next 16. |
| Avatares/animações com `available:false` | ✅ Estado atual (sem assets) | Virar `true` só com asset real (§2, §18). |

> **Resumo:** esta especificação é **continuação** da POC, não substituição. A POC já implementa o pipeline e a honestidade de UI; a spec define **o padrão de arte, biomecânica, formatos e processo** para encher esse pipeline com **avatares humanos 3D realistas** — e proíbe, em definitivo, qualquer retorno a skeleton/wireframe/palito.

---

*Fim do documento — `GYMFLOW_MOTION_ENGINE_SPEC_v01.md` (v01).*
