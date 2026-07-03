# GYMFLOW_ASSET_SELECTION_001 — Seleção Definitiva dos Avatares 3D

**Documento:** `docs/GYMFLOW_ASSET_SELECTION_001.md`
**Etapa:** Decisão de **fonte e estratégia** dos avatares humanos 3D da GymFlow Motion Engine — **antes** de congelar o skeleton.
**Natureza:** Análise crítica de decisão. **Não** implementa, **não** altera a POC, **não** compra, **não** baixa asset pago, **não** integra nada. É a base para escolher o caminho definitivo dos avatares.
**Data da análise:** junho/2026. Licenças/preços verificados na web nesta data (fontes ao final).

**Documentos-base:**
- `GYMFLOW_MOTION_ENGINE_RESEARCH_v01.md` — pesquisa de mercado/arquitetura.
- `GYMFLOW_MOTION_ENGINE_SPEC_v01.md` — spec normativa (regra visual absoluta, skeleton único, orçamentos).
- `POC_AVATAR_3D_GYMFLOW.md` — POC R3F já existente (`/poc-3d`), com placeholder honesto.

> **Regra herdada, inegociável:** o produto final é **avatar humano 3D realista (masculino e feminino)**. **Proibido** skeleton, wireframe, boneco-palito, bolinhas de articulação ou mock técnico se passando por avatar (SPEC §2).

---

## 0. TL;DR (para quem não vai ler 20 páginas)

- **O cenário mudou:** **Ready Player Me foi descontinuado** (encerramento em 31/01/2026). Em junho/2026 **não é mais uma opção de bootstrap viável** — risco de plataforma morta. Isso elimina o "atalho" que a `RESEARCH_v01` tratava como bootstrap de MVP.
- **A web tem um problema de licença que quase ninguém considera:** num app three.js, o `.glb` é **servido ao navegador** e é **inerentemente extraível** (aba Network). Licenças "royalty-free, mas proibido extrair o modelo" (TurboSquid, CGTrader, RenderHub e boa parte do Sketchfab) **colidem** com isso. Em jogo (Unity/Unreal) o asset é empacotado em formato proprietário; **na web, não**. → marketplaces de modelo avulso são **juridicamente arriscados** para entrega web de avatar.
- **O vencedor é "customizar e possuir", não "comprar pronto" nem "criar do zero":** **Character Creator 4 + AccuRig (+ ActorCore para semente de animação)** dá realismo premium, licença royalty-free **perpétua que permite explicitamente embutir em web/app**, skeleton consistente e **output que é seu** — sem royalty de runtime, baixo lock-in.
- **MetaHuman** (agora livre fora do Unreal, jun/2025) é **excelente — mas para vídeo pré-renderizado/marketing**, não para humano realtime em three.js mobile.
- **Ordem certa:** **decidir o pipeline de avatar primeiro** (este doc) → **depois** congelar o `SKELETON_001` **alinhado ao rig desse pipeline**. Congelar skeleton no vácuo = dor de retargeting garantida.

Frase final na §16.

---

## Índice
1. [Contexto e o que mudou desde a RESEARCH_v01](#1-contexto-e-o-que-mudou)
2. [O problema da entrega web (decisivo)](#2-o-problema-da-entrega-web)
3. [Critérios de avaliação (15 eixos)](#3-critérios-de-avaliação)
4. [Análise por fonte](#4-análise-por-fonte)
5. [Matriz comparativa mestre](#5-matriz-comparativa-mestre)
6. [Comparações por objetivo](#6-comparações-por-objetivo)
7. [Padrão mínimo de qualidade visual](#7-padrão-mínimo-de-qualidade-visual)
8. [Orçamentos: peso, polígonos, textura](#8-orçamentos-peso-polígonos-textura)
9. [Requisitos: avatar masculino](#9-requisitos-avatar-masculino)
10. [Requisitos: avatar feminino](#10-requisitos-avatar-feminino)
11. [Requisitos: mobile](#11-requisitos-mobile)
12. [Critérios para REPROVAR um asset](#12-critérios-para-reprovar-um-asset)
13. [Recomendação — MVP](#13-recomendação--mvp)
14. [Recomendação — produto comercial](#14-recomendação--produto-comercial)
15. [Comprar / customizar / criar; skeleton antes ou depois; próximo passo](#15-comprar-customizar-criar-skeleton-próximo-passo)
16. [Decisão recomendada](#16-decisão-recomendada)

---

## 1. Contexto e o que mudou

A `RESEARCH_v01` (escrita pouco antes) recomendava o **Ready Player Me como bootstrap de MVP** e marcava seu futuro como "incerto pós-aquisição Netflix". A verificação de junho/2026 fecha essa porta:

| Fonte | Status verificado (jun/2026) | Efeito na decisão |
|---|---|---|
| **Ready Player Me** | **Descontinuado.** Netflix adquiriu (dez/2025) e está **encerrando os serviços em 31/01/2026** (incl. ferramenta online de criação e PlayerZero). Plataforma fechada, exclusiva da Netflix. | ❌ **Removido como opção.** Não se constrói MVP sobre um serviço que está sendo desligado. |
| **MetaHuman** | **Liberado fora do Unreal** (Unreal Fest jun/2025): usável em Unity, Godot, Blender, Maya; **grátis comercial < US$1M/ano**; **pode até vender** MetaHumans. | ✅ Viável — **mas para vídeo pré-renderizado**, não realtime web (ver §4). |
| **Reallusion CC4 / ActorCore** | Licença royalty-free perpétua que **explicitamente** dá o direito de exportar e **incluir em "games, applications, web services or other interactive projects"**. Há License Enterprise para "server-based business"/integrar a criação no seu serviço via API. | ✅ **Subiu para o topo.** A cláusula de web/app é favorável (ver nuance na §4). |
| **AccuRig 2** | **100% grátis**, uso comercial, export FBX/USD; precisa de conta ActorCore gratuita. | ✅ Ferramenta de **rig** consistente — peça-chave do pipeline. |
| Marketplaces (TurboSquid/CGTrader/RenderHub/Sketchfab) | Royalty-free, **mas** com cláusula anti-extração (TurboSquid: "modelos em formato proprietário, não extraíveis"). | ⚠️ **Conflito com a web** (ver §2). |

> Conclusão imediata: a decisão **não pode** ser herdada da `RESEARCH_v01` sem correção. O RPM saiu de cena; o eixo de decisão passa a ser **CC4/AccuRig (possuir) vs. custom (possuir mais ainda) vs. MetaHuman (só render) vs. marketplaces (risco web)**.

---

## 2. O problema da entrega web

> Este é o ponto que reprova metade do mercado e quase nunca aparece nas comparações superficiais. **Leia antes de qualquer recomendação.**

Num app **three.js / R3F**, o avatar é um arquivo `.glb` **servido ao navegador do usuário**. Isso significa:

1. O arquivo **trafega pela rede** e fica no cache/`Network` do browser → **qualquer usuário pode baixá-lo**.
2. Não há, na web, o empacotamento proprietário que Unity/Unreal fazem automaticamente (que é o que satisfaz as cláusulas anti-extração das marketplaces).
3. Logo, licenças do tipo *"royalty-free, desde que o modelo **não possa ser extraído** pelo usuário final"* (TurboSquid, e em espírito CGTrader/RenderHub; Sketchfab Standard diz que você **não pode oferecer a terceiros a capacidade de baixar** o modelo) ficam em **tensão direta** com a forma como a web entrega 3D.

**Mitigações existem, nenhuma é à prova de bala:** ofuscação/minificação de GLB, troca de nomes, *streaming* parcial, *gating* por sessão, DRM de textura. Reduzem o casual, não impedem o determinado. Para um produto comercial, **depender de mitigação técnica para cumprir uma cláusula de licença é risco jurídico**, não solução.

**Corolário de decisão:** a entrega web favorece fortemente assets onde você tem **direito explícito de distribuir embutido em web/app** (CC4/ActorCore standard diz isso em letras claras) **ou** assets que você **possui** (custom/owned). Penaliza marketplaces de modelo avulso com cláusula anti-extração.

---

## 3. Critérios de avaliação

Cada fonte é avaliada nos 15 eixos pedidos, nota **1–5** (5 = melhor para o caso GymFlow web):

1. Realismo visual
2. Qualidade do corpo
3. Qualidade de rosto/mãos
4. Roupa fitness
5. Compatibilidade GLB/glTF
6. Compatibilidade Three.js/R3F
7. Rig/skeleton (qualidade + consistência)
8. Peso de arquivo (potencial de caber no orçamento §8)
9. Performance web/mobile
10. Licença para **SaaS comercial na web** (peso extra — ver §2)
11. Personalização
12. Custo
13. Risco de lock-in (5 = baixíssimo)
14. Facilidade para animações futuras (skeleton reaproveitável)
15. Risco de retrabalho (5 = baixíssimo)

---

## 4. Análise por fonte

### 4.1. Ready Player Me — ❌ ELIMINADO
- **Estado:** descontinuado (serviços encerrando 31/01/2026; agora ativo de avatar interno da Netflix).
- **Antes era:** GLB nativo, web-first, grátis comercial via partner — o bootstrap "óbvio".
- **Hoje:** construir sobre ele = construir sobre areia. Mesmo que assets já gerados continuem funcionando, **não há plataforma viva**, sem suporte, sem novos recursos, com licença em limbo pós-aquisição.
- **Veredito:** **não usar.** Serve apenas como referência de UX ("avatar GLB leve para web é possível"). Substituto natural moderno: **Avaturn** (ver 4.12).
- Notas: realismo 3/corpo 3/rosto-mãos 3/roupa 2/GLB 5/R3F 5/rig 4/peso 5/perf 5/**licença 1**/person. 4/custo 5/**lock-in 1**/anim 4/**retrabalho 1**.

### 4.2. MetaHuman — ✅ para VÍDEO, ❌ para realtime web
- **Estado (jun/2026):** livre fora do Unreal; usável em Blender/Maya/Unity/Godot; grátis comercial < US$1M/ano; pode vender MetaHumans.
- **Força:** o **rosto e a pele mais fotorrealistas** do mercado. Imbatível em close-up.
- **Problema fatal para nós:** MetaHuman é **pesadíssimo** (dezenas de bones faciais, geometria/textura altíssimas, shaders feitos para o Unreal). Reduzi-lo a ≤8 MB / ≤60k tris para three.js **mobile** descaracteriza justamente o que o torna especial e dá **muito** retrabalho. Não é a ferramenta para humano realtime na web.
- **Uso correto:** **render pré-renderizado** de altíssima qualidade (vídeos hero, marketing, telas de onboarding) — onde peso/realtime não importam.
- Notas: realismo 5/corpo 5/rosto-mãos 5/roupa 4/GLB 3(via export)/R3F 2(realtime)/rig 2(p/ web)/peso 1/perf 1(web mobile)/licença 4/person. 5/custo 5(<1M)/lock-in 3/anim 3/retrabalho 2(p/ web).

### 4.3. Reallusion Character Creator 4 (CC4) — ✅✅ TOPO para "possuir"
- **Realismo:** muito bom — "premium realista", um degrau abaixo de MetaHuman no rosto, mas **mais que suficiente** e, crucialmente, **otimizável** para web. Corpo atlético natural sai bem.
- **Rosto/mãos:** bons; mãos riggeadas adequadas para pegada (crítico — SPEC §3).
- **Roupa fitness:** biblioteca + SkinGen + roupas conformáveis; dá pra montar regata/legging/tênis premium.
- **GLB/R3F:** exporta FBX/GLB; ótimo com AccuRig/Blender no meio. Roda no three.js após otimização.
- **Rig/skeleton:** **CC_Base** consistente e profissional; converte para humanoide Mixamo-like (compatível com a meta do SPEC §4). **Mesmo skeleton para M e F** → reuso de animação.
- **Licença SaaS web:** **favorável** — direito explícito de exportar e **incluir em "applications, web services, interactive projects"**, royalty-free, perpétua, **one-time**. ⚠️ **Nuance a confirmar por escrito:** a License **Enterprise** trata de "server-based business" e de **integrar a *criação* de personagens no seu serviço via API**. Avatares **fixos** (os 2 oficiais) embutidos no app caem no uso embedded padrão; **gerar avatares de usuário em escala via pipeline** pode exigir Enterprise. Para o MVP (2 avatares fixos), o standard cobre. **Ação:** obter confirmação formal da Reallusion para o caso "avatares embutidos servidos em web app".
- **Personalização:** altíssima (morphs, SkinGen, roupas) — dá identidade de marca.
- **Custo:** licença CC4 (one-time, faixa de centenas de US$ + pipeline gratuito AccuRig). Sem royalty de runtime.
- **Lock-in:** **baixo** — o output (GLB/FBX) **é seu** e roda em qualquer engine; CC4 é só a ferramenta de autoria.
- Notas: realismo 4/corpo 5/rosto-mãos 4/roupa 5/GLB 4/R3F 4/rig 5/peso 4(pós-otim.)/perf 4/**licença 5**(web embedded)/person. 5/custo 4/lock-in 5/anim 5/retrabalho 4.

### 4.4. ActorCore — ✅ complemento (animação + alguns corpos)
- Loja da Reallusion de **personagens rigados + 4.500+ animações** mocap, royalty-free, compatível com CC4/AccuRig.
- **Papel ideal:** **semente da biblioteca de animação** (idle/respiração, padrões base) e personagens de teste — não necessariamente o avatar final de marca.
- Mesma família de licença/skeleton do CC4 → coesão e reuso.
- Notas: realismo 4/corpo 4/rosto-mãos 4/roupa 3/GLB 4/R3F 4/rig 5/peso 4/perf 4/licença 5/person. 3/custo 4/lock-in 5/anim 5/retrabalho 4.

### 4.5. Daz Studio — ❌ para runtime web
- Realismo de corpo/pele alto (Genesis 8/9), enorme biblioteca.
- **Reprovado para runtime web por dois motivos:** (1) figuras **muito pesadas/altas em poly e bones**, feitas para render, não para mobile realtime; (2) **Interactive License obrigatória** para embutir mesh em app interativo, **~US$50 por item** (alguns antigos US$10), **por asset** — e ainda assim você faz toda a otimização/rig. Custo e atrito altos, modelo errado de licença para escala.
- **Uso possível:** render 2D/vídeo (aí basta licença padrão) — concorre com MetaHuman e perde em rosto.
- Notas: realismo 4/corpo 5/rosto-mãos 4/roupa 4/GLB 2/R3F 2/rig 2/peso 1/perf 1/licença 2/person. 4/custo 2/lock-in 3/anim 2/retrabalho 2.

### 4.6. Blender base mesh (custom / MakeHuman / Human Generator) — ✅✅ para "possuir do zero"
- **Controle e posse totais.** Você modela/esculpe, texturiza (PBR), veste e exporta GLB otimizado — **100% seu**, **zero royalty**, **zero lock-in**, **direito pleno de distribuir embutido na web** (resolve a §2).
- **MakeHuman:** output **CC0** (domínio público) — base humana gratuita e juridicamente limpíssima. Ótimo ponto de partida.
- **Human Generator / addons pagos:** aceleram, output seu.
- **Custo real = tempo/skill de artista 3D.** Para qualidade premium, exige um bom character artist. É o caminho de **maior qualidade-sob-controle e menor risco jurídico**, porém o **mais lento/caro em esforço** se feito 100% à mão.
- **Síntese inteligente:** **base CC4/AccuRig + refino no Blender** > Blender puro do zero. Blender é o **finalizador/otimizador** do pipeline, não necessariamente a origem.
- Notas: realismo 4(depende do artista)/corpo 5/rosto-mãos 4/roupa 5/GLB 5/R3F 5/rig 4(via AccuRig)/peso 5/perf 5/**licença 5**/person. 5/custo 2(esforço)/lock-in 5/anim 5/retrabalho 3(skill-dependente).

### 4.7. Sketchfab (agora Fab/Epic) — ⚠️ caso a caso
- Standard License royalty-free, comercial, sem atribuição, **pode embutir em apps interativos** via viewer/JS API — **mas** "você **não pode oferecer a terceiros baixar** o modelo", o que tropeça na realidade da entrega GLB na web (§2) se você servir o arquivo cru.
- **Qualidade e skeleton variam por autor** → inconsistência entre M e F, retrabalho de rig, sem garantia de skeleton único.
- **Uso possível:** **referências, props, equipamento** (barra, banco, polia) com licença bem lida — **não** avatares de marca consistentes.
- Notas: realismo 3(varia)/corpo 3/rosto-mãos 3/roupa 2/GLB 4/R3F 4/rig 2(varia)/peso 3/perf 3/licença 2(web extração)/person. 2/custo 3/lock-in 4/anim 2/retrabalho 2.

### 4.8. CGTrader — ⚠️ igual a Sketchfab/TurboSquid
- Marketplace; royalty-free comercial existe, **mas** mesma tensão de extração na web e **mesma inconsistência de skeleton/qualidade**. Bom para **props/equipamento**, ruim para **avatar de marca**.
- Notas: realismo 3/corpo 3/rosto-mãos 3/roupa 2/GLB 3/R3F 3/rig 2/peso 3/perf 3/licença 2/person. 2/custo 3/lock-in 4/anim 2/retrabalho 2.

### 4.9. TurboSquid — ⚠️ explicitamente problemático na web
- Royalty-free, permite jogos/apps/mobile/VR — **mas a cláusula exige que o modelo fique em formato proprietário, não extraível**, e diz que engines "fazem isso automaticamente". **A web three.js NÃO faz** → conflito direto (§2).
- Qualidade alta em alguns assets, **skeleton inconsistente**, sem garantia de M/F coeso.
- **Uso possível:** props/equipamento em cena (não o avatar).
- Notas: realismo 4/corpo 4/rosto-mãos 3/roupa 2/GLB 3/R3F 3/rig 2/peso 3/perf 3/**licença 2**(web)/person. 2/custo 3/lock-in 4/anim 2/retrabalho 2.

### 4.10. RenderHub — ⚠️ igual às demais marketplaces
- Modelos + algumas animações; licenças por item; mesmos problemas de extração-web e inconsistência. Sem diferencial que justifique para avatar de marca.
- Notas: realismo 3/corpo 3/rosto-mãos 3/roupa 2/GLB 3/R3F 3/rig 2/peso 3/perf 3/licença 2/person. 2/custo 3/lock-in 4/anim 2/retrabalho 2.

### 4.11. Mixamo — ✅ só como semente de animação
- Auto-rig + biblioteca de animações **grátis, royalty-free**. **Estagnado** (sem evolução há anos), **não redistribuir o asset bruto**.
- **Papel:** **bootstrap de animação** e rig humanoide de referência (skeleton Mixamo é o padrão de fato do SPEC §4). **Não** é fonte de avatar realista de marca (os personagens Mixamo são datados).
- Notas (como avatar): realismo 2/corpo 3/rosto-mãos 2/roupa 1/GLB 4/R3F 4/rig 5/peso 4/perf 4/licença 4/person. 1/custo 5/lock-in 4/anim 5/retrabalho 3.

### 4.12. AccuRig — ✅✅ ferramenta de RIG do pipeline
- Auto-rigger **gratuito**, comercial, export FBX/USD, conta ActorCore grátis. AccuRig 2 (jul/2025) é melhor que o auto-rig do Mixamo em vários casos.
- **Papel central:** **conformar qualquer avatar (CC4, custom, MakeHuman) a um skeleton consistente** → habilita o **skeleton único** do SPEC e o reuso de animação. É a cola do pipeline "possuir".
- Notas (como ferramenta): rig 5/custo 5/lock-in 5/anim 5/compat 5. (Não é fonte de avatar; é de rig.)

### 4.13. Avaturn — ✅ substituto moderno do RPM (bootstrap rápido)
- Não estava na lista, mas é a **alternativa mais citada ao RPM** pós-morte: avatares **mais realistas** que RPM, **export GLB**, **otimizados para web/mobile**, SDK + licenciamento comercial.
- **Trade-off:** é **plataforma/serviço externo** → algum **lock-in** e **risco de dependência** (lição do RPM ainda fresca). Bom para **protótipo/bootstrap velocíssimo**, arriscado como fundação de longo prazo.
- Notas: realismo 4/corpo 4/rosto-mãos 4/roupa 3/GLB 5/R3F 5/rig 4/peso 5/perf 5/licença 4(checar termos atuais)/person. 4/custo 3/**lock-in 2**/anim 4/retrabalho 3.

---

## 5. Matriz comparativa mestre

Notas 1–5 (5 = melhor para **GymFlow web/mobile**). "Lic." e "Lock-in" e "Retrab." têm peso de decisão alto.

| Fonte | Real. | Corpo | Rosto/Mãos | Roupa | GLB | R3F | Rig | Peso | Perf | **Lic.web** | Pers. | Custo | **Lock-in** | Anim | **Retrab.** | **Σ** |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| **CC4 (+AccuRig)** | 4 | 5 | 4 | 5 | 4 | 4 | 5 | 4 | 4 | **5** | 5 | 4 | **5** | 5 | **4** | **67** |
| **Custom/Blender (+AccuRig)** | 4 | 5 | 4 | 5 | 5 | 5 | 4 | 5 | 5 | **5** | 5 | 2 | **5** | 5 | 3 | **67** |
| **ActorCore** | 4 | 4 | 4 | 3 | 4 | 4 | 5 | 4 | 4 | 5 | 3 | 4 | 5 | 5 | 4 | 62 |
| **Avaturn** | 4 | 4 | 4 | 3 | 5 | 5 | 4 | 5 | 5 | 4 | 4 | 3 | 2 | 4 | 3 | 59 |
| **MetaHuman** | 5 | 5 | 5 | 4 | 3 | 2 | 2 | 1 | 1 | 4 | 5 | 5 | 3 | 3 | 2 | 50 |
| **Mixamo** (anim) | 2 | 3 | 2 | 1 | 4 | 4 | 5 | 4 | 4 | 4 | 1 | 5 | 4 | 5 | 3 | 51 |
| **TurboSquid** | 4 | 4 | 3 | 2 | 3 | 3 | 2 | 3 | 3 | 2 | 2 | 3 | 4 | 2 | 2 | 42 |
| **Sketchfab** | 3 | 3 | 3 | 2 | 4 | 4 | 2 | 3 | 3 | 2 | 2 | 3 | 4 | 2 | 2 | 42 |
| **CGTrader** | 3 | 3 | 3 | 2 | 3 | 3 | 2 | 3 | 3 | 2 | 2 | 3 | 4 | 2 | 2 | 40 |
| **RenderHub** | 3 | 3 | 3 | 2 | 3 | 3 | 2 | 3 | 3 | 2 | 2 | 3 | 4 | 2 | 2 | 40 |
| **Daz** | 4 | 5 | 4 | 4 | 2 | 2 | 2 | 1 | 1 | 2 | 4 | 2 | 3 | 2 | 2 | 40 |
| **Ready Player Me** | 3 | 3 | 3 | 2 | 5 | 5 | 4 | 5 | 5 | **1** | 4 | 5 | **1** | 4 | **1** | 51† |

† RPM tem soma "mecânica" alta, mas está **eliminado** por status (descontinuado) — a soma é irrelevante na prática. Incluído só para contraste.

> **Leitura:** empatados no topo, **CC4(+AccuRig)** e **Custom/Blender(+AccuRig)**. A diferença é **velocidade × controle**: CC4 entrega realismo premium **mais rápido** (vence no MVP); Custom entrega **identidade e posse máximas** com mais esforço (vence no produto comercial). Os dois **compartilham o mesmo pipeline e o mesmo skeleton** (AccuRig), então **não são caminhos divergentes — são o mesmo caminho em dois estágios.**

---

## 6. Comparações por objetivo

| Objetivo | Vencedor | Por quê |
|---|---|---|
| **Mais barata** | **MakeHuman base + Blender + AccuRig** (ferramentas gratuitas) | Custo de licença ~zero; custo é tempo. CC4 perde só pela licença paga (one-time). |
| **Mais rápida** | **Avaturn** (bootstrap) ou **CC4** (oficial) | Avaturn gera GLB web em minutos; CC4 monta um avatar premium em horas, não semanas. |
| **Mais realista (web-viável)** | **CC4** | MetaHuman é mais realista, mas **não realtime web**. Entre os web-viáveis, CC4 lidera. |
| **Mais realista (qualquer contexto)** | **MetaHuman** | Só que **para render/vídeo**, não para o player 3D realtime. |
| **Mais segura juridicamente** | **Custom/owned** (posse total) e **CC4** (web embedded explícito) | Resolvem o problema da §2. Marketplaces e RPM ficam para trás. |
| **Mais escalável** | **CC4/Custom sobre skeleton único** | Um skeleton + biblioteca de animação própria escala de 10 → 300 exercícios com custo marginal baixo (SPEC §4). |
| **MVP recomendado** | **CC4 + AccuRig (+ ActorCore/Mixamo p/ animação semente)** | Realismo premium, licença web-clean, skeleton consistente, posse do output, rápido. |
| **Produto comercial** | **Avatares custom-owned** (autorados via CC4/AccuRig ou comissionados), **MetaHuman só p/ render hero** | Identidade de marca, posse total, zero royalty/lock-in runtime, performance controlada. |

---

## 7. Padrão mínimo de qualidade visual

Um avatar só é **aceitável** se TODAS forem verdadeiras (alinha SPEC §3/§14):
- Material **PBR** (albedo + normal + roughness); pele **não** plástica/cera.
- Proporções **anatomicamente naturais** (cabeça ~1/7,5 da altura); corpo **atlético natural**, sem exagero.
- **Rosto** acabado, neutro-simpático, **sem uncanny valley agressivo**.
- **Mãos** com dedos articulados (pegada de barra/halter/corda é ponto técnico).
- **Roupa fitness premium** plausível (regata/top + bermuda/legging + tênis), sem logos de terceiros, sem clipping grosseiro.
- **Sem** aparência de skeleton/wireframe/palito em qualquer estado (regra absoluta).
- M e F **coesos** (mesma direção de arte, mesma escala/eixo/bind pose, **mesmo skeleton**).

---

## 8. Orçamentos: peso, polígonos, textura

(Herdados e reafirmados do SPEC §3.3/§10.)

| Métrica | Alvo | **Teto (reprova acima)** |
|---|---|---|
| Triângulos por avatar | ≤ 40k | **60k** |
| Bones | ~65 | **70** |
| Materiais | ≤ 4 | 6 |
| Textura (runtime) | 2K (2048²), **KTX2/Basis** | 2K (4K só p/ render, nunca runtime mobile) |
| Compressão de malha | **Draco** ou **Meshopt** obrigatória | — |
| **`.glb` do avatar (geo+tex+skin)** | ≤ 6 MB | **8 MB** |
| Clipe de animação `.glb` | ≤ 300 KB | 600 KB |
| **Carga inicial (1 avatar + 1 clipe)** | ≤ 7 MB | **10 MB** |

---

## 9. Requisitos: avatar masculino
- Corpo atlético natural (~12–18% gordura aparente), ombros/costas definidos sem hipertrofia extrema.
- Altura de referência ~1,78 m; proporções naturais.
- Roupa: regata/camiseta dry-fit + bermuda de treino + tênis. Paleta dark; acento cyber-lime `#a3e635` permitido em detalhes.
- Mãos masculinas bem modeladas (pegada pronada/supinada legível).
- Rosto neutro, cabelo curto estilizado (sem fios físicos).
- Skeleton: o **mesmo** `SKELETON_001` do feminino.

## 10. Requisitos: avatar feminino
- Corpo atlético natural (~18–24% gordura aparente), tônus visível sem exagero.
- Altura de referência ~1,66 m; proporções naturais; **mesma escala-base e bind pose** do masculino (diferenças via morph/retarget na produção, **nunca** em runtime).
- Roupa: top + legging (ou shorts) + tênis; mesma linguagem premium dark + acento.
- Mãos femininas bem modeladas; cabelo preso/curto estilizado.
- Rosto neutro-simpático coeso com o masculino (mesma "família" visual).
- Skeleton: o **mesmo** `SKELETON_001`.

## 11. Requisitos: mobile
- `.glb` dentro do teto de 8 MB; textura KTX2; Draco/Meshopt.
- **≥ 30 fps** em celular mediano; sem crash de memória.
- **1 `<Canvas>` WebGL por tela**; listas usam pôster estático + lazy.
- LOD opcional no MVP, **obrigatório** ao escalar exercícios.
- Enquadramento vertical (`mobile_portrait`, SPEC §7) deixa o corpo inteiro legível em tela estreita.

---

## 12. Critérios para REPROVAR um asset

Reprovar (não entra em produção) se **qualquer** for verdadeiro:
1. **Licença incompatível com entrega web** (proíbe extração/redistribuição do arquivo servido ao browser — §2) **e** sem permissão escrita para o caso web embedded.
2. **Status de plataforma morto/descontinuado** (ex.: RPM) ou futuro em limbo como fundação.
3. **Royalty de runtime** ou taxa recorrente por sessão/usuário.
4. Acima do **teto** de tris/bones/peso (§8) e **não otimizável** sem descaracterizar.
5. **Skeleton inconsistente** com o `SKELETON_001` e **não reconformável** via AccuRig/retarget.
6. Aparência **abaixo do padrão mínimo** (§7): plástico, uncanny, proporções erradas, roupa pobre.
7. **M e F incoesos** (parecem de produtos diferentes) ou bind pose/escala/eixo divergentes.
8. **Lock-in alto** sem caminho de posse do output (não dá pra exportar GLB seu).
9. Qualquer aparência de **skeleton/wireframe/palito** no resultado final (regra absoluta — reprova imediata).
10. **Risco jurídico não resolvível** (origem/licença duvidosa, asset "rippado", termos ambíguos sem confirmação do fornecedor).

---

## 13. Recomendação — MVP

**Pipeline "possuir, rápido":**
1. **Character Creator 4** para autorar **1 masculino + 1 feminino** com padrão de arte da §7/§9/§10 (corpo atlético, roupa fitness premium).
2. **AccuRig** para conformar ambos ao **skeleton único** (habilita reuso de animação).
3. **ActorCore + Mixamo** como **semente de animação** (idle/respiração e padrões base) para validar o pipeline — animações definitivas vêm depois (mocap próprio, MOTION_LIB).
4. **Blender + gltf-transform** para otimizar (Draco/Meshopt + KTX2) dentro do orçamento §8.
5. Carregar em `/poc-3d`, medir peso/fps em **mobile real**, rodar checklist §14 do SPEC.
6. **Confirmar por escrito** com a Reallusion o uso "avatares embutidos servidos em web app" (padrão vs. Enterprise) — §4.3.

**Por que não Avaturn no MVP, já que é mais rápido?** É a opção de **bootstrap descartável** aceitável **se** o objetivo for só uma demo em dias — mas adiciona **dependência de plataforma externa** logo após a lição do RPM. Se for usado, tratar como **temporário**, com plano de migração para CC4/custom. Recomendação principal: **ir direto de CC4**, evitando montar afeição por um fornecedor.

## 14. Recomendação — produto comercial

**Pipeline "possuir, máximo":**
1. **Avatares custom-owned**: evoluir os 2 do MVP (autorados via CC4/AccuRig) **ou** comissionar um character artist para refinar/substituir, **sempre conformados ao `SKELETON_001`** e **com posse total do GLB** (resolve §2 de forma definitiva).
2. **Biblioteca de animação PRÓPRIA** (mocap Move AI/Rokoko → cleanup Cascadeur/Blender), sobre o skeleton único — o **fosso competitivo** (alinha RESEARCH/SPEC).
3. **MetaHuman** reservado para **render pré-renderizado** premium (vídeos hero, marketing, onboarding) — **nunca** no player realtime.
4. **Marketplaces (TurboSquid/CGTrader/Sketchfab/RenderHub)** apenas para **props/equipamento** (barra, banco, polia), com licença lida caso a caso, **nunca** para o avatar de marca.

**Regra de ouro comercial:** o avatar de marca é **seu**. Ferramentas (CC4, AccuRig, MetaHuman) são **meios de produção**, nunca dependências de runtime nem fontes de royalty.

---

## 15. Comprar / customizar / criar; skeleton; próximo passo

**1) Comprar pronto, customizar ou criar do zero?**
→ **Customizar e possuir.** Nem "comprar pronto" (licença web arriscada + skeleton/qualidade inconsistentes + sem identidade), nem "criar 100% do zero no MVP" (lento/caro). **CC4 + AccuRig = customizar uma base de alta qualidade e ficar dono do output.** No comercial, evolui para custom puro mantendo o **mesmo pipeline e skeleton**.

**2) Congelar o skeleton ANTES ou DEPOIS de escolher o avatar?**
→ **DEPOIS — mas imediatamente depois.** O skeleton deve ser **derivado do rig do pipeline escolhido** (AccuRig/CC_Base, conformado ao humanoide Mixamo-like do SPEC §4). Congelar um skeleton no vácuo e depois tentar encaixar o avatar = **retargeting e dor garantidos**. Sequência correta:
   **(a)** decidir pipeline = CC4/AccuRig (este documento) → **(b)** autorar 1 M + 1 F e ver qual skeleton o pipeline produz → **(c)** **congelar `SKELETON_001`** alinhado a esse rig → **(d)** produzir a biblioteca de animação sobre ele.

**3) Qual o próximo passo após esta decisão?**
→ Um **spike de validação barato e sem compromisso** (sem comprar nada caro, sem integrar ao app):
   - Autorar **1 avatar M + 1 F** via CC4 (trial/licença) + AccuRig (grátis).
   - Exportar GLB otimizado; medir **peso e fps em mobile real**.
   - Carregar **isolado** em `/poc-3d` (a POC já suporta — basta marcar `available: true`).
   - **Confirmar a licença web por escrito** com a Reallusion.
   - Só então abrir a sprint **`GYMFLOW_MOTION_ENGINE_SKELETON_001`** (SPEC §18) para **congelar o skeleton** com base no rig validado.
   - **Nada disso altera código de app** — só valida assets na rota de POC.

---

## 16. Decisão recomendada

A web é o juiz oculto desta decisão: ela **expõe o asset** (§2) e **descartou o atalho** (RPM morto). Isso empurra a escolha para **possuir** o avatar, não alugá-lo de uma plataforma nem comprá-lo com cláusula anti-extração. Entre as formas de possuir, **CC4 + AccuRig** entrega realismo premium **rápido e web-clean** para o MVP, e o **custom-owned sobre o mesmo skeleton** maximiza identidade e segurança no produto comercial — **é o mesmo caminho em dois estágios**, não dois caminhos.

> **Se eu fosse CTO do GymFlow AI, eu escolheria _Character Creator 4 + AccuRig (avatares autorados e de minha posse, com ActorCore/Mixamo como semente de animação)_ para o MVP e _avatares custom-owned sobre o mesmo skeleton único — comissionados/refinados e com biblioteca de animação própria, reservando o MetaHuman apenas para render pré-renderizado de marketing_ para o produto comercial, porque _é a única estratégia que resolve o problema de extração de asset na web (o GLB é servido ao navegador), elimina o lock-in e o royalty de runtime, sobrevive à morte de plataformas como o Ready Player Me, entrega realismo premium dentro do orçamento de performance mobile e — por usar um único skeleton desde o primeiro avatar — transforma a biblioteca de animações proprietária no fosso competitivo que escala de 10 a 300 exercícios com custo marginal baixo._**

---

## Apêndice — Fontes verificadas (jun/2026)

- Ready Player Me / Netflix (descontinuação): [Variety](https://variety.com/2025/digital/news/netflix-acquires-ready-player-me-games-avatar-creation-1236612915/), [TechCrunch](https://techcrunch.com/2025/12/19/netflix-acquires-gaming-avatar-maker-ready-player-me/), [Genies — RPM alternatives](https://genies.com/blog/ready-player-me-discontinued-alternatives)
- Reallusion CC4/ActorCore (licença embedded em apps/web): [Reallusion Content License Policy](https://www.reallusion.com/license/content.html), [ActorCore EULA](https://actorcore.reallusion.com/eula), [Reallusion Enterprise License](https://www.reallusion.com/license/enterprise.html)
- MetaHuman (livre fora do Unreal, 2025): [CG Channel](https://www.cgchannel.com/2025/06/you-can-now-sell-metahumans-or-use-them-in-unity-or-godot/), [MetaHuman License](https://www.metahuman.com/license), [Creative Bloq](https://www.creativebloq.com/3d/metahuman-just-broke-free-from-unreal-engine-5-why-everyone-can-now-create-lifelike-characters)
- AccuRig (grátis, comercial): [AccuRIG — Reallusion](https://www.reallusion.com/auto-rig/accurig/), [CG Channel — AccuRig 2.0](https://www.cgchannel.com/2025/07/rig-and-animate-3d-characters-for-free-with-accurig-2-0/)
- Sketchfab/Fab (Standard License, embed): [Sketchfab Licenses](https://sketchfab.com/licenses), [Fab Store License FAQ](https://support.fab.com/s/article/Store-License-Usage-FAQ?language=en_US)
- TurboSquid (royalty-free + cláusula anti-extração): [Royalty Free License](https://blog.turbosquid.com/royalty-free-license/), [Royalty Free License FAQ](https://www.turbosquid.com/help/en/articles/9937423-royalty-free-license-faq)
- Daz (Interactive License p/ embed em runtime): [Daz Interactive License](https://www.daz3d.com/interactive-license-info), [Daz Licenses](https://www.daz3d.com/daz-licenses)

*Fim — `GYMFLOW_ASSET_SELECTION_001.md`.*
