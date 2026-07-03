# GYMFLOW_MOTION_ENGINE_RESEARCH_v01

> **Pesquisa técnica profunda + auditoria de mercado** focada EXCLUSIVAMENTE na engine 3D de personagens e animações do GymFlow AI.
> **Nada foi implementado, alterado ou integrado.** A POC existente (`src/components/three/*`, `/poc-3d`) permanece intacta. Este é um documento de decisão de arquitetura.
>
> Escopo: definir a arquitetura **definitiva** da **GymFlow Motion Engine** — pensada para anos, não para MVP.
>
> ⚠️ **Aviso de licenciamento:** termos e preços mudam. Os dados aqui refletem pesquisa de meados de 2026. **Antes de assinar qualquer contrato/EULA, confirme a versão vigente** com o fornecedor (links nas Fontes). Este documento é orientação técnica/estratégica, não aconselhamento jurídico.

---

## Índice

1. Sumário executivo e a tese central
2. O que realmente importa numa engine 3D para web (critérios técnicos)
3. A verdade incômoda: personagem vs. animação são problemas separados
4. Auditoria plataforma por plataforma (18 critérios cada)
5. Matrizes comparativas
6. Melhor plataforma por objetivo (MVP, comercial, startup, escala, custo, qualidade, realismo, performance)
7. Build vs. Buy (A / B / C / D) — análise e veredito
8. Arquitetura proposta — GymFlow Motion Engine
9. Estimativas de custo (Econômico, Intermediário, Premium, Enterprise) × (10/50/100/300 exercícios)
10. Existe algo melhor que avatares 3D?
11. "Se fosse minha startup…"
12. Melhor equilíbrio (qualidade × custo × manutenção × performance × escala × UX × identidade)
13. Roadmap recomendado
14. Riscos e mitigação
15. Conclusão final (decisão definitiva)
16. Fontes

---

## 1. Sumário executivo e a tese central

A infraestrutura de código (React Three Fiber + Three.js + GLB + AnimationMixer) **já está resolvida** pela POC. O problema agora é de **conteúdo e pipeline**, não de engenharia de software.

A decisão central se reduz a três perguntas independentes:

1. **De onde vem o CORPO (avatar)?** — criar, comprar pronto, ou gerar (RPM/CC4/MetaHuman/Blender).
2. **De onde vem o MOVIMENTO (animação)?** — biblioteca pronta (Mixamo/ActorCore), captura própria (Move AI/Rokoko), ou autoria manual (Cascadeur/Blender).
3. **Quem é DONO do resultado e a que custo recorrente?** — licença, royalties, lock-in por MAU.

**Tese (resumida):** para um produto que viverá por anos, com **identidade visual própria**, custo previsível e performance web/mobile, a resposta não é uma única plataforma — é um **pipeline aberto baseado em glTF/GLB** onde o GymFlow **possui** seus avatares e sua **biblioteca de animações**. Plataformas comerciais entram como **ferramentas de autoria**, não como **dependência de runtime**.

> **Decisão antecipada (detalhada na §15):** padronizar tudo num **skeleton humanoide único (compatível Mixamo)**, com **2 avatares próprios otimizados para web** e uma **biblioteca proprietária de animações** capturada por mocap acessível e limpa em ferramentas de baixo custo — entregue como **glTF otimizado (Draco/Meshopt)** ao R3F. Ferramentas comerciais são intercambiáveis; o **ativo** (skeleton + clips + meshes) é do GymFlow.

---

## 2. O que realmente importa numa engine 3D para web

Antes de pontuar plataformas, é preciso fixar os critérios técnicos que separam "lindo no trailer" de "roda a 60fps no celular de um aluno na academia".

| Critério | Por que importa para o GymFlow |
|---|---|
| **Formato glTF/GLB** | É o "JPEG do 3D na web". Three.js carrega nativamente. Tudo que não exporta glTF limpo gera atrito. |
| **Contagem de polígonos (tris)** | Web/mobile quer **20k–60k tris** por avatar. MetaHuman/Daz/CC4 nascem com **centenas de milhares**. Decimar custa tempo e degrada qualidade. |
| **Número de bones** | Skeletons de 50–70 bones animam bem; rigs faciais de 600+ bones (MetaHuman) matam o frame em mobile. |
| **PBR baked** | Materiais físicos com texturas ≤ 2K, sem shaders proprietários de engine (MetaHuman depende de shaders do Unreal). |
| **Skeleton padronizado** | Para **reusar 1 animação em N avatares** (M/F/neutro), todos precisam do **mesmo esqueleto**. É o segredo da escala. |
| **Draco / Meshopt** | Compressão de geometria. Reduz GLB de 8MB → 1–2MB. Essencial para mobile/3G. |
| **Retargeting** | Aplicar um clip num avatar de proporções diferentes sem "quebrar". Mixamo-skeleton resolve 90%. |
| **Licença de runtime** | Pode o asset **viver dentro de um SaaS** vendido? Pode ser **extraído** pelo usuário? Há **royalty/MAU**? |
| **Custo marginal por exercício** | A biblioteca vai de 10 → 300 movimentos. O custo do **301º** define a escalabilidade. |

**Conclusão dos critérios:** o GymFlow precisa de assets **leves, glTF-nativos, de skeleton único, comprimidos e com licença que permita embutir em SaaS sem royalty**. Isso já elimina, *para runtime web*, os pesos-pesados cinematográficos (MetaHuman/Daz/CC4 "as-is") — que, porém, são ótimos como **ferramentas de autoria** ou para **vídeo pré-renderizado**.

---

## 3. A verdade incômoda: personagem ≠ animação

A maioria das pessoas trata "avatar 3D" como uma coisa só. **São dois mercados:**

- **Mercado de CORPO (mesh + rig + materiais):** Ready Player Me, MetaHuman, Character Creator 4, Daz, Blender, marketplaces (TurboSquid/CGTrader/Sketchfab/RenderHub/Unity).
- **Mercado de MOVIMENTO (animation clips):** Mixamo, ActorCore, Cascadeur, Move AI, Rokoko, DeepMotion, marketplaces.

O **ativo estratégico e mais caro de reproduzir** é a **biblioteca de animações de execução correta de exercícios** — biomecanicamente precisa, com a "cara" do GymFlow. Avatares são relativamente comoditizados (dá para trocar). **Animações boas de musculação são raras e caras** — e são a verdadeira vantagem competitiva (a precisão técnica que vende o "IA Coach que ensina a forma certa").

> **Implicação:** invista identidade e propriedade na **biblioteca de animação**; trate o **avatar** como peça substituível. O skeleton padronizado é o que permite isso.

---

## 4. Auditoria plataforma por plataforma

Legenda dos campos (pedido do briefing): (1) Qualidade visual /10, (2) Realismo /10, (3) Animações, (4) Integração R3F, (5) GLB, (6) Three.js, (7) Licença comercial, (8) Preço, (9) Curva, (10) Performance web, (11) Mobile, (12) Escalabilidade, (13) Personalização, (14) Docs, (15) Comunidade, (16) Atualizações, (17) Prós, (18) Contras.

> Notas de escala: "Qualidade visual/Realismo" referem-se ao **potencial do asset**; "Performance web/Mobile" referem-se ao asset **rodando em tempo real no three.js** (não pré-renderizado).

---

### 4.1 Ready Player Me (RPM)

| # | Critério | Avaliação |
|---|---|---|
| 1 | Qualidade visual | **7/10** (estilizado-realista, "cara de metaverso") |
| 2 | Realismo | **5.5/10** |
| 3 | Animações | Não é o foco; aceita clips Mixamo (skeleton compatível). Fornece algumas animações base. |
| 4 | Integração R3F | **9.5/10** — feito para web/glTF; SDK e `.glb` por URL. |
| 5 | GLB | **10/10** — nativo. |
| 6 | Three.js | **10/10** — half/full-body otimizados para three. |
| 7 | Licença | Avatares do site são **CC BY-NC-SA** (não-comercial). Para comercial, cadastre-se como **developer/partner** → **uso gratuito** no produto. **Sem royalty hoje.** ⚠️ **Adquirida pela Netflix (dez/2025)** → modelo futuro incerto. Pode vender SaaS hoje (como partner); distribuir o `.glb` bruto isolado não é o objetivo. |
| 8 | Preço | **Gratuito** para developers (sem mensalidade conhecida). Risco de mudança pós-aquisição. |
| 9 | Curva | **Baixíssima**. |
| 10 | Performance web | **9/10** — leve, projetado para isso. |
| 11 | Mobile | **9/10**. |
| 12 | Escalabilidade | **8/10** (geração on-the-fly de avatares de usuário é trivial). |
| 13 | Personalização | Roupa ✅, cabelo ✅, cor ✅, corpo (limitado) ⚠️, sexo ✅, idade (limitado) ⚠️, acessórios ✅. |
| 14 | Docs | **8/10**. |
| 15 | Comunidade | **8/10** (grande em web3/games). |
| 16 | Atualizações | Ativas; rumo incerto pós-Netflix. |
| 17 | Prós | Time-to-market imbatível; nativo web; grátis comercial; avatar por usuário. |
| 18 | Contras | Estética "metaverso" (pouco realismo de academia); **dependência de plataforma externa**; futuro/licença incertos após aquisição; controle limitado de proporções musculares. |

**Veredito:** ótimo para **MVP/bootstrap** e para "avatar do usuário". **Risco estratégico** como dependência de longo prazo (lock-in + dono novo). Não dá a identidade "fitness premium".

---

### 4.2 Mixamo (= "Adobe Mixamo" — é a mesma plataforma)

| # | Critério | Avaliação |
|---|---|---|
| 1 | Qualidade visual | **6/10** (personagens datados). |
| 2 | Realismo | **5/10**. |
| 3 | Animações | **8/10** — enorme biblioteca de movimentos rigados; **auto-rigger** excelente; padrão de skeleton de fato. |
| 4 | Integração R3F | **8.5/10** — FBX → glTF; skeleton vira "lingua franca". |
| 5 | GLB | **8/10** (via conversão FBX→glTF; trivial). |
| 6 | Three.js | **8.5/10**. |
| 7 | Licença | **Gratuito, royalty-free**, uso comercial OK. **Não pode redistribuir os arquivos crus** como ativos isolados; deve estar **incorporado ao projeto**. Não pode bulk-download p/ ML. Pode SaaS (embutido). |
| 8 | Preço | **Gratuito** (conta Adobe). |
| 9 | Curva | **Baixa**. |
| 10 | Performance web | **8/10** (animações leves). |
| 11 | Mobile | **8/10**. |
| 12 | Escalabilidade | **7/10** (catálogo fixo; sem novos conteúdos há anos). |
| 13 | Personalização | Personagens limitados; foco é **animação**, não customização. |
| 14 | Docs | **6/10**. |
| 15 | Comunidade | **9/10** (padrão da indústria indie). |
| 16 | Atualizações | **2/10** — **estagnado** (Adobe não evolui há anos; risco de descontinuação no longo prazo). |
| 17 | Prós | Grátis, skeleton-padrão, auto-rig, time-to-market; perfeito para bootstrap da biblioteca. |
| 18 | Contras | Movimentos genéricos (não específicos de musculação); **abandonware na prática**; qualidade não-premium. |

**Veredito:** **bootstrap perfeito** das primeiras animações e do **skeleton padrão**. Não é base de longo prazo para qualidade premium nem cobre execução fina de exercícios.

---

### 4.3 MetaHuman (Epic)

| # | Critério | Avaliação |
|---|---|---|
| 1 | Qualidade visual | **10/10**. |
| 2 | Realismo | **10/10** (estado da arte em humanos digitais). |
| 3 | Animações | Excelente (rig facial/corporal de cinema), mas pesado. |
| 4 | Integração R3F | **3/10 (realtime web)** — alto poly, shaders Unreal, rig facial gigantesco. Ótimo **pré-renderizado**, ruim para three realtime sem retopo agressivo. |
| 5 | GLB | **5/10** — exportável, mas precisa decimação/retopo para web. |
| 6 | Three.js | **4/10** realtime; **9/10** se virar vídeo. |
| 7 | Licença | **Mudança histórica em 2025:** MetaHuman deixou de ser exclusivo do Unreal. Conteúdo MetaHuman pode ser usado em **Unity, Godot, Blender, Maya e apps comerciais**, classificado como **"non-engine product"** → **sem o royalty de 5%** do Unreal. Grátis sob a licença UE (receita < US$1M; termos UE acima disso). Pode vender no FAB. **Ótimo para licença; ruim para realtime web.** |
| 8 | Preço | **Gratuito** (sob licença UE). |
| 9 | Curva | **Alta** (ecossistema Unreal/MetaHuman). |
| 10 | Performance web | **3/10** realtime. |
| 11 | Mobile | **2/10** realtime. |
| 12 | Escalabilidade | Alta para variações de humano; baixa para web realtime. |
| 13 | Personalização | Corpo ✅, rosto ✅✅, idade ✅, etnia ✅, cabelo ✅, roupa (limitada no creator). |
| 14 | Docs | **8/10**. |
| 15 | Comunidade | **9/10**. |
| 16 | Atualizações | **10/10** (Epic investe pesado). |
| 17 | Prós | Realismo máximo; licença 2025 liberou uso multi-engine sem royalty; perfeito para **vídeo pré-renderizado premium**. |
| 18 | Contras | Inviável em **three.js realtime mobile** sem retopo caro; preso ao ecossistema Unreal para autoria. |

**Veredito:** **arma secreta para a fase comercial** — render de marketing/onboarding e, eventualmente, **vídeo pré-renderizado** dos exercícios marquise. **Não** é a base do runtime web.

---

### 4.4 Unreal Engine (como ecossistema/runtime)

| # | Critério | Avaliação |
|---|---|---|
| 1–2 | Visual/Realismo | **10/10** (é o renderizador do MetaHuman). |
| 3 | Animações | Ecossistema completo (Control Rig, retargeting, sequencer). |
| 4 | Integração R3F | **1/10** — é um runtime concorrente do three.js, não um fornecedor de asset web. Há **Pixel Streaming** (rodar Unreal no servidor e transmitir vídeo) — caro e fora do escopo de um app web leve. |
| 5–6 | GLB/Three | Indireto (exporta assets, mas não é o caminho). |
| 7 | Licença | UE: grátis < US$1M; 5% acima (jogos). Pixel Streaming = custo de GPU em nuvem. |
| 8 | Preço | Engine grátis; **Pixel Streaming = $$$** (GPU/h). |
| 9 | Curva | **Muito alta**. |
| 10–11 | Web/Mobile | Via Pixel Streaming: alta qualidade, **alto custo e latência**. |
| 12 | Escalabilidade | Pixel Streaming não escala economicamente para milhares de alunos simultâneos. |
| 17 | Prós | Pipeline de **pré-render** de altíssima qualidade. |
| 18 | Contras | Não é caminho de runtime web realtime viável/econômico para o GymFlow. |

**Veredito:** usar como **render farm de vídeo**, não como engine do app.

---

### 4.5 Reallusion Character Creator 4 (CC4)

| # | Critério | Avaliação |
|---|---|---|
| 1 | Qualidade visual | **9/10**. |
| 2 | Realismo | **8.5/10**. |
| 3 | Animações | Forte (integra com iClone/ActorCore/AccuRig). |
| 4 | Integração R3F | **6.5/10** — exporta glTF/FBX; precisa **otimização/LOD** para web (nasce caro em poly). |
| 5 | GLB | **8/10** (exporta glTF; otimize depois). |
| 6 | Three.js | **7/10** após otimização. |
| 7 | Licença | **Royalty-free, perpétua**, uso comercial em **games, apps e AR/VR** ✅. **PORÉM** a EULA de conteúdo restringe usar o conteúdo como **"embedded content within applications or online services"** e em **APIs de geração de personagem**. Leitura prática: **você pode CRIAR/ANIMAR personagens e enviar o resultado** (baked) ao seu produto; **gerar avatares para usuários via serviço** ou **distribuir o mesh editável** é a zona cinzenta. ⚠️ **Confirme a EULA vigente** para o caso "GLB embutido no app". |
| 8 | Preço | **Licença única** (~US$ 199–299 CC4; pipeline iClone/packs à parte). Sem royalty. |
| 9 | Curva | **Média**. |
| 10 | Performance web | **6/10** (precisa LOD). |
| 11 | Mobile | **5–6/10** após otimização. |
| 12 | Escalabilidade | Alta como **ferramenta de autoria** (gera N variações). |
| 13 | Personalização | Roupa ✅, cabelo ✅, cor ✅, **corpo/morfologia ✅✅** (ótimo p/ físico de academia), sexo ✅, idade ✅, acessórios ✅. |
| 14 | Docs | **8/10**. |
| 15 | Comunidade | **8/10**. |
| 16 | Atualizações | **8/10** (Reallusion ativa). |
| 17 | Prós | **Melhor custo-benefício para CRIAR avatares próprios realistas** com controle de morfologia muscular; licença única; pipeline com AccuRig/ActorCore. |
| 18 | Contras | Nasce pesado (otimização obrigatória p/ web); **nuance de licença "embedded/online service"** exige cautela jurídica. |

**Veredito:** **forte candidato para AUTORIA dos avatares próprios** (você gera, otimiza e baka). Apenas resolva a cláusula "embedded/online service" com a Reallusion antes de escalar.

---

### 4.6 ActorCore (Reallusion)

| # | Critério | Avaliação |
|---|---|---|
| 1–2 | Visual/Realismo | **8/10 / 7.5/10**. |
| 3 | Animações | **8.5/10** — biblioteca de **mocap limpa** (incl. esportes/fitness), pronta para CC/Mixamo skeleton. |
| 4 | Integração R3F | **7/10** (FBX/glTF). |
| 5–6 | GLB/Three | **7–8/10**. |
| 7 | Licença | Royalty-free perpétua (mesma família Reallusion; mesma cautela "embedded/online service" do CC4). |
| 8 | Preço | **Por pacote/animação** (compra avulsa) ou packs. |
| 9 | Curva | **Baixa**. |
| 10–11 | Web/Mobile | **7/10** (clips leves). |
| 12 | Escalabilidade | Boa (catálogo grande e curado). |
| 13 | Personalização | Foco em movimento; personagens à parte. |
| 14–16 | Docs/Comunidade/Updates | **8 / 7 / 8**. |
| 17 | Prós | Mocap **profissional e limpo** (melhor que Mixamo em qualidade), inclui movimentos atléticos. |
| 18 | Contras | Pago por item; mesma nuance de EULA Reallusion. |

**Veredito:** **upgrade de qualidade** sobre o Mixamo para animações específicas — bom para a fase intermediária.

---

### 4.7 Blender

| # | Critério | Avaliação |
|---|---|---|
| 1–2 | Visual/Realismo | **Depende do artista** (até 10/10). |
| 3 | Animações | Ferramenta completa (rig, keyframe, cleanup de mocap, retarget). |
| 4 | Integração R3F | **9/10** — **melhor exportador glTF do mercado** (oficial). |
| 5 | GLB | **10/10**. |
| 6 | Three.js | **10/10**. |
| 7 | Licença | **GPL / grátis. Você é dono de tudo que cria. Sem royalty. Pode SaaS, distribuir, vender.** |
| 8 | Preço | **Gratuito**. |
| 9 | Curva | **Alta** (precisa de artista). |
| 10–11 | Web/Mobile | **10/10** (você controla poly/otimização). |
| 12 | Escalabilidade | Alta (mas limitada por mão de obra de artista). |
| 13 | Personalização | **Total** (é onde tudo é finalizado/otimizado). |
| 14–15 | Docs/Comunidade | **9 / 10**. |
| 16 | Atualizações | **10/10**. |
| 17 | Prós | **Centro do pipeline**: retopo, otimização, retarget, export glTF (Draco/Meshopt), limpeza de mocap. Propriedade 100%. |
| 18 | Contras | Exige talento de artista 3D; não "gera" personagem sozinho. |

**Veredito:** **insubstituível como hub do pipeline.** Tudo passa por ele antes de virar GLB de produção.

---

### 4.8 Daz Studio

| # | Critério | Avaliação |
|---|---|---|
| 1–2 | Visual/Realismo | **9/10 / 9/10** (Genesis é fotorrealista em render). |
| 3 | Animações | Razoável (foco é still/render). |
| 4 | Integração R3F | **3.5/10** — alto poly; **licença restritiva** para mesh em app. |
| 5–6 | GLB/Three | **4–5/10** (exporta, mas pesado e com trava de licença). |
| 7 | Licença | ⚠️ **Crítico:** a EULA padrão **proíbe embutir o MESH** em app/jogo; só permite **renders 2D**. Para usar o modelo 3D dentro de um app é preciso a **Interactive/Gaming License** (paga, **nem todo item oferece**). |
| 8 | Preço | Software grátis; **personagens/itens pagos**; Interactive License **adicional**. |
| 9 | Curva | **Média**. |
| 10–11 | Web/Mobile | **3/10** realtime. |
| 12 | Escalabilidade | Baixa para realtime; boa para render. |
| 13 | Personalização | **Altíssima** (morphs infinitos). |
| 17 | Prós | Realismo de render barato; bom para **imagens/vídeo pré-renderizado**. |
| 18 | Contras | **Licença hostil a app realtime**; pesado; pegadinha da Interactive License por item. |

**Veredito:** **evitar para runtime web.** Só faz sentido para conteúdo **pré-renderizado**, e ainda com atenção à licença.

---

### 4.9 Marketplaces de modelos — CGTrader / TurboSquid / Sketchfab / RenderHub / Unity Asset Store

Tratados juntos porque a lógica é a mesma: você compra **assets de terceiros**, com licença **por item**.

| # | Critério | Avaliação (geral) |
|---|---|---|
| 1–2 | Visual/Realismo | **Varia (4–10)** por item. |
| 3 | Animações | Alguns trazem rig/animação; qualidade varia. |
| 4 | Integração R3F | **6–8/10** (depende do formato; muitos têm glTF). |
| 5–6 | GLB/Three | **6–9/10** (procure itens glTF + low-poly). |
| 7 | Licença | **TurboSquid (Royalty-Free):** uso em apps/jogos/**WebGL** OK **desde que o modelo esteja embutido em formato não-extraível** e o usuário não possa exportá-lo. Proíbe redistribuir o arquivo isolado. **CGTrader:** royalty-free comercial nos itens marcados; checar Editorial vs. Standard. **Sketchfab:** licença **por modelo** (varia de CC0 a "Editorial"/restrito) — **leia cada item**. **Unity Asset Store:** terceiros geralmente permitem uso fora do Unity **se embutido**; assets "Unity Companion License" e publicados pela Unity **só no Unity** — evitar. **RenderHub:** royalty-free comercial (checar por item). |
| 8 | Preço | **Por item** (US$ 10–300+ típico). |
| 9 | Curva | Baixa (é compra). |
| 12 | Escalabilidade | **Inconsistente** (estilos/skeletons diferentes a cada compra → dor de retarget). |
| 13 | Personalização | Limitada ao que vem. |
| 17 | Prós | Rápido; barato por peça; bom para **props/equipamentos** (barra, banco, halteres, polia). |
| 18 | Contras | **Inconsistência de estilo/skeleton** mata a padronização; curadoria de licença item a item; difícil garantir identidade visual coesa. |

**Veredito:** **excelentes para CENÁRIO/EQUIPAMENTOS** (barra, banco, máquina, halteres) e props — **não** para os avatares humanos (inconsistência de estilo/rig). Sempre prefira itens **glTF + low-poly + royalty-free com embutição não-extraível**.

---

### 4.10 AccuRig (Reallusion) — grátis

| # | Critério | Avaliação |
|---|---|---|
| 3 | Animações | Não anima; **auto-rig** (gera skeleton + skin weights a partir de mesh estático). |
| 4–6 | R3F/GLB/Three | Habilitador (gera rig que vira FBX/glTF). |
| 7 | Licença | **Gratuito, inclusive comercial.** |
| 8 | Preço | **Grátis**. |
| 9 | Curva | **Baixa**. |
| 17 | Prós | Transforma qualquer mesh humano (comprado/esculpido) em **personagem animável** com skeleton compatível ActorCore/Mixamo — **de graça**. |
| 18 | Contras | Rig de corpo (sem rig facial avançado); qualidade do auto-skin precisa revisão para casos extremos. |

**Veredito:** **peça-chave gratuita** para padronizar qualquer mesh no skeleton único. Entra no pipeline ao lado do Blender.

---

### 4.11 Cascadeur

| # | Critério | Avaliação |
|---|---|---|
| 3 | Animações | **9/10** — autoria de animação **assistida por IA + física** (AutoPosing, balanço físico). Excelente para **criar/ajustar** movimentos de musculação **sem mocap**. |
| 4–6 | R3F/GLB/Three | Exporta FBX/glTF; bons resultados após Blender. |
| 7 | Licença | **Free:** sem uso comercial. **Indie ($8/mês anual):** comercial **< US$100k/ano** de receita. **Pro ($33/mês anual):** comercial **ilimitado**. Anual vira **perpétua** após 1 ano. |
| 8 | Preço | Free / Indie $8 / Pro $33 (mês, anual). |
| 9 | Curva | **Média-alta**. |
| 12 | Escalabilidade | Alta (autoria controlada, sem custo por clip além do tempo). |
| 17 | Prós | Cria animação **biomecanicamente plausível** com física; barato; perpétuo; **ótimo para corrigir/estilizar** mocap bruto. |
| 18 | Contras | Exige animador habilidoso; não substitui captura real para naturalidade máxima. |

**Veredito:** **ferramenta de finalização/autoria** poderosa e barata. Combina perfeitamente com mocap (limpa e perfeiçoa).

---

### 4.12 Move AI

| # | Critério | Avaliação |
|---|---|---|
| 3 | Animações | **9.5/10** — **mocap markerless** de alta qualidade (multi-câmera Pro; single-cam One). Captura execução **real** de exercícios. |
| 4–6 | R3F/GLB/Three | Exporta **FBX/BVH** → Blender → glTF. |
| 7 | Licença | Planos com **licença comercial**; saída em formatos padrão. Ownership do resultado tipicamente do cliente (⚠️ confirmar termos do plano). |
| 8 | Preço | **Uso (por segundo):** ~US$0,012/s (s1) a ~US$0,024/s (m1); mínimo US$0,10/tarefa; planos custom. |
| 9 | Curva | Média (captura + cleanup). |
| 12 | Escalabilidade | **Alta** — capturar 300 exercícios é viável e barato comparado a artista manual. |
| 17 | Prós | **Realismo de movimento real** sem suit caro; ótimo custo por clip; chave para **biblioteca proprietária**. |
| 18 | Contras | Precisa de set de gravação (atleta + câmeras); cleanup no Blender/Cascadeur; multi-cam para qualidade máxima. |

**Veredito:** **caminho recomendado para CONSTRUIR a biblioteca proprietária** de execução de exercícios com realismo de movimento real.

---

### 4.13 Rokoko (Vision + Suits)

| # | Critério | Avaliação |
|---|---|---|
| 3 | Animações | **8.5/10** — **Vision** (mocap por vídeo, grátis single-cam) e **suits** (Smartsuit/Coil) para qualidade pro. |
| 7 | Licença | **Você é dono das suas gravações**; Starter grátis com **export FBX ilimitado**; planos pagos para recursos avançados. |
| 8 | Preço | **Vision single-cam grátis**; dual-cam **~US$240/ano**; Studio Plus US$20/mês, Pro US$50/mês; suits = hardware ($$$). |
| 9 | Curva | Baixa (Vision) a média (suit). |
| 12 | Escalabilidade | Alta. |
| 17 | Prós | **Entrada gratuita** em mocap; bom para protótipos de movimento; ecossistema maduro. |
| 18 | Contras | Vision single-cam tem limite de precisão; qualidade pro exige suit/dual-cam pago. |

**Veredito:** **alternativa/complemento ao Move AI** — Vision (grátis) para bootstrap, suit para qualidade. Bom para começar a biblioteca a custo zero.

---

### 4.14 DeepMotion (Animate 3D)

| # | Critério | Avaliação |
|---|---|---|
| 3 | Animações | **7.5/10** — **vídeo → 3D** (single-cam), com captura facial/mãos em planos altos. |
| 7 | Licença | Assinatura; uso comercial nos planos pagos; export FBX/BVH/glTF. |
| 8 | Preço | Freemium + assinatura por minutos de processamento. |
| 9 | Curva | Baixa. |
| 17 | Prós | Rápido (sobe vídeo, recebe animação); bom para bootstrap. |
| 18 | Contras | Single-cam erra em oclusão (deitar no banco, agachar profundo) — exige cleanup; menos preciso que Move AI multi-cam. |

**Veredito:** opção **rápida e barata** para rascunhar movimentos; qualidade abaixo de Move AI multi-cam.

---

### 4.15 (Resumo das demais menções)

- **"Adobe Mixamo"** = Mixamo (§4.2). Listado em duplicidade no briefing.
- **Sketchfab/RenderHub** já cobertos no bloco de marketplaces (§4.9).

---

## 5. Matrizes comparativas

### 5.1 Avatares (CORPO) — adequação a **runtime web/three.js**

| Plataforma | Visual | Realismo | Web realtime | Licença SaaS | Custo | Identidade própria |
|---|---|---|---|---|---|---|
| Ready Player Me | 7 | 5.5 | **9** | Grátis (partner) ⚠️Netflix | Grátis | Baixa |
| Character Creator 4 | 9 | 8.5 | 6 (pós-otim.) | ✅ c/ ressalva "embedded" | Licença única | **Alta** |
| Blender (próprio) | 8–10 | 8–10 | **10** | ✅ Total | Grátis + artista | **Máxima** |
| MetaHuman | 10 | 10 | 3 (realtime) | ✅ (2025) | Grátis | Média |
| Daz | 9 | 9 | 3 | ❌ (mesh em app) | $ + Interactive | Média |
| Marketplaces | 4–10 | 4–10 | 6–8 | ✅ (embutido) | $/item | Baixa (inconsistente) |

### 5.2 Animações (MOVIMENTO)

| Fonte | Qualidade | Específico p/ musculação | Custo por clip | Licença SaaS | Esforço |
|---|---|---|---|---|---|
| Mixamo | 6–7 | Baixo (genérico) | **Grátis** | ✅ embutido | Baixo |
| ActorCore | 8 | Médio (tem atléticos) | $/item | ✅ (ressalva RL) | Baixo |
| Move AI (mocap) | **9.5** | **Total (você captura)** | ~US$ por seg (barato) | ✅ (seu) | Médio (set+cleanup) |
| Rokoko Vision | 8 | Total | **Grátis–baixo** | ✅ (seu) | Médio |
| DeepMotion | 7.5 | Total | Assinatura | ✅ | Baixo–médio |
| Cascadeur (autoria) | 9 | **Total (você cria)** | $8–33/mês | ✅ | Médio–alto (artista) |
| Marketplace anim | 4–8 | Variável | $/item | ✅ embutido | Baixo |

### 5.3 Ferramentas de pipeline

| Ferramenta | Papel | Custo | Imprescindível? |
|---|---|---|---|
| **Blender** | Hub: retopo, otimização, retarget, export glTF | Grátis | **Sim** |
| **AccuRig** | Auto-rig (skeleton padrão) | Grátis | Quase |
| **Cascadeur** | Autoria/cleanup de animação c/ física | $8–33/mês | Recomendado |
| **gltf-transform** | Draco/Meshopt, dedupe, otimização final | Grátis | **Sim** |

---

## 6. Melhor plataforma por objetivo

| Objetivo | Recomendação |
|---|---|
| **MVP (rápido/barato)** | **Ready Player Me** (avatar) + **Mixamo** (animação). No ar em dias, grátis. |
| **Produto comercial** | **Avatar próprio (CC4 → Blender)** + **biblioteca de animação própria (Move AI/Rokoko → Cascadeur/Blender)**. |
| **Startup (equilíbrio)** | **Híbrido:** RPM/Mixamo no MVP → migrar para avatar+animação próprios mantendo o **mesmo skeleton**. |
| **Escala (300+ exercícios)** | **Mocap próprio (Move AI)** + skeleton único + pipeline Blender/gltf-transform. Custo marginal por clip cai. |
| **Baixo custo** | **Mixamo + RPM + Rokoko Vision (grátis) + Blender.** |
| **Maior qualidade (asset)** | **MetaHuman / CC4** (para autoria e/ou vídeo pré-renderizado). |
| **Maior realismo de movimento** | **Move AI multi-cam** (mocap real). |
| **Maior performance web/mobile** | **Avatar low-poly próprio (Blender) glTF + Draco/Meshopt** — nada bate asset feito sob medida. |

---

## 7. Build vs. Buy — A / B / C / D

**A) Comprar packs licenciados prontos.**
Prós: rápido, barato por peça, sem equipe 3D. Contras: **identidade genérica**, inconsistência de estilo/skeleton, dependência de catálogo de terceiros, cobertura ruim de execução **fina** de musculação. → Bom para **props/equipamentos** e bootstrap; **insuficiente como base** dos avatares/movimentos premium.

**B) Comprar personagens e animar (você anima).**
Prós: avatar pronto + movimento sob medida = bom equilíbrio. Contras: avatar comprado pode ter licença chata (Daz) ou estilo alheio; ainda precisa pipeline de animação. → Viável na fase intermediária (ex.: CC4/ActorCore + Cascadeur).

**C) Criar personagens próprios (do zero).**
Prós: **identidade e propriedade máximas**, controle de poly/skeleton/estilo, **zero lock-in/royalty**. Contras: precisa de **artista 3D** e tempo; custo inicial maior. → É o **destino de longo prazo** do GymFlow.

**D) Misturar várias soluções (HÍBRIDO).** ✅ **Vencedor.**
Use cada ferramenta no que ela é melhor, sem amarrar o **runtime** a nenhuma:
- **Avatar:** criar próprios (CC4/Blender) — ou RPM no MVP — e **otimizar no Blender**.
- **Animação:** **biblioteca proprietária via mocap (Move AI/Rokoko)** + **Cascadeur** para cleanup/estilização + **Mixamo** para "fillers" no início.
- **Equipamentos/cenário:** marketplaces (royalty-free, embutidos).
- **Pré-render premium (marketing/onboarding):** MetaHuman/Unreal quando fizer sentido.
- **Cola de tudo:** **skeleton único (Mixamo-compatível)** + **Blender** + **glTF/Draco**.

**Justificativa:** o ativo defensável (animações de execução correta) você **constrói e possui**; o resto é intercambiável. O runtime fica **independente de fornecedor** (só consome glTF). Isso maximiza identidade, minimiza lock-in e mantém custo marginal baixo na escala.

---

## 8. Arquitetura proposta — GymFlow Motion Engine

> Camada de **runtime** (no app, já existente na POC) + camada de **conteúdo/pipeline** (fora do app, produz os GLBs). A genialidade é o **contrato glTF** entre as duas: o app não sabe (nem se importa) com qual ferramenta o asset foi feito.

```
                         ┌──────────────────────────────────────────────┐
                         │              PIPELINE (offline)                │
                         │                                                │
   CORPO  ───────────────┤  CC4 / Blender / RPM ──► AccuRig (rig) ──┐     │
                         │                                          │     │
   MOVIMENTO ────────────┤  Move AI / Rokoko ─► Cascadeur ─► Blender│     │
                         │  (mocap)             (cleanup)   (retarget)    │
                         │                                          │     │
   EQUIPAMENTO ──────────┤  Marketplaces (royalty-free) ────────────┤     │
                         │                                          ▼     │
                         │           SKELETON ÚNICO (Mixamo-compat)       │
                         │                    │                           │
                         │        gltf-transform (Draco/Meshopt, LOD)     │
                         │                    │                           │
                         │     ┌──────────────┴───────────────┐           │
                         │     ▼                              ▼            │
                         │  avatar_male.glb / female.glb   clips/*.glb     │
                         └──────────────────────┬───────────────────────┘
                                                │  (assets versionados / CDN)
                                                ▼
        ┌───────────────────────────────────────────────────────────────┐
        │                  GYMFLOW MOTION ENGINE (runtime — React)        │
        │                                                                 │
        │   avatar-config.ts  ──►  Avatar Masculino  ◄─┐                   │
        │   (registro/mapa)        Avatar Feminino     │ troca por config  │
        │                          Avatar Neutro     ◄─┘                   │
        │        │                                                        │
        │        ├─► Sistema de Roupas/Skins (slots de material/texture)   │
        │        ├─► Sistema de Câmeras (presets: lateral/frontal/detalhe) │
        │        ├─► Sistema de Iluminação (estúdio: key/fill/rim)         │
        │        ├─► Sistema de Animações (AnimationMixer + retarget)      │
        │        ├─► Sistema de Biomecânica (ângulos articulares/ROM)      │
        │        ├─► Sistema de Músculos Destacados (emissive/heatmap)     │
        │        ├─► Sistema de Replay (timeline scrub/loop A-B)           │
        │        ├─► Sistema de Velocidade (timeScale 0.25x–2x)            │
        │        └─► Player (UI: play/pause/seek/câmera/velocidade)        │
        │                 │                                                │
        │     consumido por:  Treino Ativo · Biblioteca · IA Coach         │
        └───────────────────────────────────────────────────────────────┘
```

### 8.1 Detalhamento dos subsistemas

| Subsistema | O que é | Implementação (sobre a POC) | Status |
|---|---|---|---|
| **Avatar M/F/Neutro** | Meshes glTF com **skeleton único** | `avatar-config.ts` já modela (`AVATARS`) | POC ✅ (slots) |
| **Sistema de Roupas/Skins** | Trocar material/textura/peça por slots (regata, legging, cor de marca) | Convenção de nomes de material no GLB + troca de `map`/`color` | A projetar |
| **Sistema de Câmeras** | Presets (lateral, frontal, 45°, detalhe) + transições suaves | `OrbitControls` + posições/targets nomeados; tween | POC parcial (controls) |
| **Sistema de Iluminação** | Estúdio: key + fill + rim + accent | Já na POC (`SceneContents`) | POC ✅ |
| **Sistema de Animações** | `AnimationMixer` + retarget por skeleton | POC (`useAnimations`); mapa `exercício→clip` | POC ✅ |
| **Sistema de Biomecânica** | Ângulos articulares/ROM, marcadores, "linha de força" | Ler bones do skeleton e desenhar overlays (gizmos/linhas) | A projetar |
| **Músculos Destacados** | Realce do músculo-alvo (emissive/heatmap) sincronizado à fase | Máscara de textura por grupo muscular OU mesh segmentada + emissive animado | A projetar (alto valor) |
| **Sistema de Replay** | Scrub na timeline, loop A↔B, frame-a-frame | Controlar `mixer.time`/`action.time`; UI de scrub | A projetar |
| **Sistema de Velocidade** | 0.25x–2x | `action.timeScale` (POC já controla play/speed) | POC ✅ |
| **Player** | UI unificada (substitui o player atual) | Componente que orquestra câmera/velocidade/replay/destaque | A projetar |
| **Consumidores** | Treino Ativo, Biblioteca, IA Coach | Drop-in via `GymFlowAvatarStage` (API compatível) | Pronto p/ swap |

### 8.2 Princípios de arquitetura (inegociáveis)
1. **Contrato glTF:** o runtime só conhece GLB + nomes de clip/bones/materiais. Fornecedor é detalhe de pipeline.
2. **Skeleton único:** uma animação serve todos os avatares. É o que torna 300 exercícios viáveis.
3. **Orçamento de performance:** ≤ 60k tris/avatar, ≤ 70 bones, texturas ≤ 2K, GLB ≤ 2MB (Draco/Meshopt). Meta: 60fps em mobile mediano.
4. **Um canvas, não N:** na lista do Treino Ativo, **um** `<Canvas>` (instâncias/troca) em vez de um por exercício (o anti-padrão atual). `frameloop="demand"` quando pausado.
5. **Assets versionados/CDN:** GLBs fora do bundle, com cache; lazy-load por exercício.
6. **Honestidade de UI:** só chamar de "avatar 3D" quando houver asset real (princípio já adotado na POC).

---

## 9. Estimativas de custo

> Premissas: valores **aproximados em USD** (converta ~R$5,5/US$ para BRL, mid-2026). "Custo por animação" inclui captura/aquisição + **cleanup/retarget/otimização** (a maior parte do esforço). Mão de obra de artista 3D estimada em US$25–60/h (freelance global) — ajuste para realidade local. Exclui salários internos fixos.

### 9.1 Custo unitário por método (por animação pronta-para-web)

| Método | Custo/anim (aprox.) | Qualidade | Observação |
|---|---|---|---|
| Mixamo (genérico) | **~US$0** + ~0,3–0,5h cleanup | Média | Não específico de musculação |
| ActorCore (pack) | US$2–8 + cleanup | Média-alta | Tem atléticos |
| Marketplace (avulso) | US$10–50 | Variável | Inconsistente |
| **Mocap Move AI/Rokoko (próprio)** | **US$5–25** (proc.) + 0,5–1,5h cleanup | **Alta** | + custo fixo de set (atleta/câmeras) amortizado |
| Autoria Cascadeur/Blender (manual) | **US$60–250** (1–4h artista) | Alta | Sem set; controle total |
| Pré-render MetaHuman (vídeo) | US$80–300 (render+setup) | **Máxima** | Não interativo |

### 9.2 Cenários × tamanho de biblioteca (custo aproximado de **montagem inicial**, USD)

> Inclui: 2 avatares + clips + ferramentas (1 ano) + otimização. Não inclui hospedagem (Cloudflare Stream/CDN é centavos por GB) nem salários internos.

| Cenário | Avatares | Animação | Ferramentas (ano) | **10 ex.** | **50 ex.** | **100 ex.** | **300 ex.** |
|---|---|---|---|---|---|---|---|
| **Econômico** | RPM (grátis) | Mixamo + Rokoko Vision grátis + cleanup leve | Blender $0, Cascadeur Indie $96 | **US$ 0,3–1k** | **US$ 1–3k** | **US$ 2–5k** | **US$ 6–14k** |
| **Intermediário** | CC4 (~$300) p/ 2 avatares próprios + otim. | Move AI (mocap) + Cascadeur cleanup | Cascadeur Pro $396 + gltf-transform $0 | **US$ 2–4k** | **US$ 6–12k** | **US$ 12–22k** | **US$ 30–60k** |
| **Premium** | Avatares próprios (artista, retopo, 2–3 skins) | Mocap multi-cam (Move AI Pro) + artista sênior cleanup | Pipeline + QA biomecânico (consultoria Ed. Física) | **US$ 6–12k** | **US$ 18–35k** | **US$ 35–65k** | **US$ 90–160k** |
| **Enterprise** | Studio externo (avatares hero + LODs + faciais) | Estúdio de mocap profissional + supervisão técnica | Render farm p/ vídeo (MetaHuman) + design system 3D | **US$ 20–40k** | **US$ 60–120k** | **US$ 120–220k** | **US$ 300–600k+** |

**Leituras-chave:**
- O **custo marginal** do exercício despenca quando a infra (avatar + skeleton + set de mocap) já existe — por isso **investir no pipeline próprio paga a partir de ~50–100 exercícios**.
- O **Econômico** entrega um produto **decente** (suficiente para MVP/seed) por **baixos milhares de dólares**.
- O **Intermediário** é o **sweet spot** para um produto comercial sério: identidade própria, mocap real, custo controlado.
- Hospedagem/entrega de GLB é desprezível (GLBs de 1–2MB em CDN custam centavos).

---

## 10. Existe algo melhor que avatares 3D?

Sim — **dependendo do objetivo**. As alternativas reais:

| Abordagem | Realismo/Confiança | Interatividade (ângulo/velocidade/destaque) | Custo por exercício | Storage/Banda | Escala p/ 300 | Identidade |
|---|---|---|---|---|---|---|
| **Avatar 3D realtime** (proposto) | Médio-alto | **Máxima** (gira, zoom, slow-mo, músculo aceso) | Médio (cai na escala) | **Mínimo** (GLB ≤2MB reusa avatar) | **Excelente** | **Máxima** |
| **Vídeo real de instrutor** (Nike/Peloton/Centr) | **Máximo** | Baixa (ângulo fixo, sem overlay) | Médio-alto (estúdio, talento, reshoot) | Alto (MP4/streaming por minuto) | Boa, mas cara | Média (depende do talento) |
| **Vídeo 3D pré-renderizado** (MetaHuman→MP4) | **Máximo** | Baixa (a menos que renderize N variações) | Alto | Alto | Média | Alta |
| **2D/2.5D animado (Lottie/ilustração)** | Baixo | Baixa | **Baixíssimo** | **Mínimo** | Excelente | Alta (estilizada) |

**Análise:**
- **Vídeo real** é o **padrão-ouro de confiança** e o que os líderes de "aula guiada" usam. **Desvantagens** para o GymFlow: sem interatividade (não gira, não destaca músculo, não faz slow-mo arbitrário), custo de reshoot quando muda algo, banda alta, e cada variação (ângulo/sexo/equipamento) é uma **nova filmagem**.
- **2D animado** é imbatível em custo/peso e ótimo para **dicas rápidas de forma** (estilo Hevy/Strong), mas não entrega a sensação "premium 3D" nem destaque muscular volumétrico.
- **Avatar 3D realtime** é o único que entrega **interatividade + destaque muscular + infinitos ângulos + custo de storage mínimo + identidade própria** — exatamente o que diferencia um "IA Coach que ensina a forma".

**Recomendação sobre alternativas:** **3D realtime como núcleo diferenciador** (a aposta da arquitetura), com **possível camada futura de vídeo real** para os ~20 exercícios "marquise" (prova social/confiança) e **2D/Lottie** para microdicas. Não é "ou", é **camadas** — mas o **core é 3D**.

---

## 11. "Se fosse minha startup…"

Eu **não** apostaria o runtime em nenhuma plataforma comercial. Eu construiria a **GymFlow Motion Engine** sobre um **contrato glTF aberto** e investiria o capital onde está o fosso competitivo: a **biblioteca proprietária de animações de execução correta**.

Concretamente, em fases:

- **Fase 1 (MVP / seed):** RPM (avatar) + Mixamo (animação base) → no ar rápido, custo ~zero, validar produto. **Já padronizando o skeleton Mixamo.**
- **Fase 2 (produto comercial):** 2 avatares **próprios** (CC4 → otimizados no Blender; resolver cláusula "embedded" com a Reallusion, ou esculpir no Blender para 100% de propriedade) + **biblioteca própria via Move AI/Rokoko**, limpa no **Cascadeur/Blender**, com **consultoria de um profissional de Educação Física** validando a biomecânica. Tudo em glTF/Draco.
- **Fase 3 (escala/diferenciação):** sistema de **músculos destacados**, **replay**, **biomecânica** (ângulos/ROM), e **vídeo pré-renderizado MetaHuman** para onboarding/marketing.

**Por quê:** identidade própria (não "cara de metaverso"), **zero lock-in/royalty** no runtime, custo marginal baixo na escala, performance web/mobile sob controle, e o ativo defensável (animações precisas) **é meu**.

---

## 12. Melhor equilíbrio (qualidade × custo × manutenção × performance × escala × UX × identidade)

| Critério | Vencedor do equilíbrio |
|---|---|
| Qualidade | Avatar próprio (CC4/Blender) + mocap (Move AI) |
| Custo | Pipeline aberto (Blender grátis) + mocap acessível + Cascadeur barato |
| Manutenção | **Contrato glTF** desacopla app de fornecedor → manutenção mínima |
| Performance | Asset low-poly sob medida + Draco/Meshopt |
| Escalabilidade | **Skeleton único** + mocap = custo marginal baixo |
| UX | 3D interativo (ângulo/velocidade/músculo) imbatível |
| Identidade | Avatares e animações **próprios** |

**O melhor equilíbrio é a estratégia HÍBRIDA, glTF-first, com biblioteca de animação proprietária** — não uma plataforma isolada. A "plataforma vencedora" é o **pipeline**: **Blender + AccuRig + Cascadeur + Move AI/Rokoko**, alimentando o runtime R3F que já existe, com **CC4** (ou Blender puro) gerando os avatares e **Mixamo/RPM** como bootstrap.

---

## 13. Roadmap recomendado

- **Sprint A — Padrão & Bootstrap:** fixar **skeleton único (Mixamo-compat)**; gerar 1 avatar M + 1 F (RPM ou CC4); 7 animações base (Mixamo/Move AI) → validar no `/poc-3d` com `available: true`.
- **Sprint B — Pipeline de produção:** Blender (retopo/otim/retarget) + gltf-transform (Draco/Meshopt) + convenção de materiais/clips; orçamento de performance aplicado.
- **Sprint C — Biblioteca própria:** sessão de mocap (Move AI/Rokoko) dos 20 exercícios-núcleo com atleta + validação biomecânica; cleanup no Cascadeur.
- **Sprint D — Subsistemas premium:** músculos destacados (emissive/heatmap), replay (scrub/loop), câmeras (presets), Player unificado → substituir o `BiomechanicalVisualizer`/`GlobalVideoPlayer` atrás de flag.
- **Sprint E — Escala:** ampliar para 100→300 exercícios; lazy-load por CDN; um canvas na lista do Treino Ativo; QA mobile.
- **Sprint F — Pré-render premium:** MetaHuman/Unreal para vídeo de onboarding/marketing.

---

## 14. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| **Lock-in/aquisição** (RPM/Netflix) | Não depender de RPM no longo prazo; skeleton padrão permite trocar avatar sem retrabalho de animação. |
| **Cláusula "embedded/online service" (Reallusion)** | Confirmar EULA com a Reallusion; alternativa 100% própria (Blender) elimina o risco. |
| **Daz Interactive License** | **Evitar Daz** para runtime; só pré-render. |
| **Mixamo abandonware** | Usar só como bootstrap; ativo real é a biblioteca própria. |
| **Performance mobile** | Orçamento rígido de tris/bones/textura + Draco/Meshopt + um canvas + `frameloop=demand`. |
| **Uncanny valley** | Estilo "atlético estilizado" (não foto-real) reduz expectativa e custo; foco em **clareza biomecânica**, não realismo de poro de pele. |
| **Custo de mão de obra 3D** | Pipeline mocap reduz dependência de animador manual; freelancers globais para retopo/cleanup. |
| **Responsabilidade biomecânica** | Validação por profissional de Educação Física; disclaimers (vide auditoria geral). |

---

## 15. Conclusão final (decisão definitiva)

A decisão **não** é "qual plataforma comprar", e sim **"qual arquitetura adotar"**. A arquitetura definitiva da **GymFlow Motion Engine** é:

> **Pipeline híbrido, glTF-first, com skeleton humanoide único, no qual o GymFlow POSSUI seus 2 avatares (M/F) e — sobretudo — sua BIBLIOTECA PROPRIETÁRIA DE ANIMAÇÕES de execução de exercícios**, produzida por **mocap acessível (Move AI/Rokoko)**, **limpa/estilizada (Cascadeur)** e **finalizada/otimizada no Blender (Draco/Meshopt)**, consumida pelo runtime **React Three Fiber já existente**. Plataformas comerciais (RPM, Mixamo, CC4, ActorCore, MetaHuman, marketplaces) entram como **ferramentas e bootstrap intercambiáveis**, **nunca** como dependência de runtime ou fonte de royalty.

Isso entrega o melhor equilíbrio entre **qualidade, custo, manutenção, performance, escala, UX e identidade própria**, e protege o ativo defensável (animações precisas) por **anos**.

---

### Frase de decisão

> **Se eu fosse CTO do GymFlow AI, eu escolheria construir a GymFlow Motion Engine como um pipeline híbrido glTF-first com biblioteca de animações PRÓPRIA (mocap via Move AI/Rokoko + cleanup no Cascadeur/Blender) sobre um skeleton único, usando Ready Player Me/Mixamo apenas como bootstrap de MVP — porque é a única abordagem que dá identidade própria, performance web/mobile real, custo marginal baixo na escala e ZERO lock-in/royalty no runtime, transformando a precisão biomecânica das animações no fosso competitivo que nenhuma plataforma pronta entrega.**

---

## 16. Fontes

- Reallusion — [Content License Policy](https://www.reallusion.com/license/content.html) · [Royalty-Free License](https://www.reallusion.com/ContentStore/Royalty_Free/index.html) · [Content EULA](https://www.reallusion.com/Content/EULA/EULA.htm) · [ActorCore](https://actorcore.reallusion.com/)
- MetaHuman — [Licença oficial](https://www.metahuman.com/license) · [CG Channel: vender/usar MetaHumans fora do Unreal (2025)](https://www.cgchannel.com/2025/06/you-can-now-sell-metahumans-or-use-them-in-unity-or-godot/) · [Creative Bloq](https://www.creativebloq.com/3d/metahuman-just-broke-free-from-unreal-engine-5-why-everyone-can-now-create-lifelike-characters)
- Ready Player Me — [Terms / Licensing](https://docs.readyplayer.me/ready-player-me/support/terms-of-use) · [FAQ](https://docs.readyplayer.me/ready-player-me/faq) · [Developer Terms](https://studio.readyplayer.me/terms)
- Daz 3D — [Interactive License Info](https://www.daz3d.com/interactive-license-info) · [Licenses](https://www.daz3d.com/daz-licenses) · [O que posso usar legalmente](https://helpdaz.zendesk.com/hc/en-us/articles/207532343-What-can-I-use-Daz-3D-figures-for-legally-)
- Mixamo — [FAQ Licensing/Royalties (Adobe)](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) · [Mixamo FAQ comunidade](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/td-p/13234775)
- Move AI — [Pricing/Plans/Credits](https://docs.move.ai/knowledge/move-ai-pricing-plans-credits) · [Move Pro pricing](https://docs.move.ai/knowledge/how-does-pricing-work-for-move-pro) · [move.ai](https://move.ai/)
- Cascadeur — [Plans](https://cascadeur.com/plans) · [Nova estrutura de licença (FAQ)](https://cascadeur.com/blog/general/cascadeurs-new-licensing-structure-comprehensive-faq)
- Rokoko — [Pricing](https://www.rokoko.com/pricing) · [Vision](https://www.rokoko.com/products/vision)
- TurboSquid — [Royalty Free License](https://blog.turbosquid.com/royalty-free-license/) · [FAQ](https://www.turbosquid.com/help/en/articles/9937423-royalty-free-license-faq)
- Unity Asset Store — [EULA FAQ](https://assetstore.unity.com/browse/eula-faq) · [Assets em outras engines (gamefromscratch)](https://gamefromscratch.com/using-asset-store-assets-in-other-engines-is-it-legal/)
- CGTrader — [Uso comercial de royalty-free (fórum)](https://www.cgtrader.com/forum/general-discussions/can-we-use-royalty-free-models-for-commercial-use)
