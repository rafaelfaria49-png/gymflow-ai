# GYMFLOW AVATAR LAB — RELATÓRIO 001 · IA Generativa 3D para Avatares

**Documento:** `labs/avatar-lab/GYMFLOW_AVATAR_LAB_001.md`
**Frente:** P&D isolada (ver [`README.md`](README.md)). **Não** altera GymFlow AI, Motion Engine ou POC.
**Pergunta central:** *conseguimos produzir os avatares oficiais do GymFlow AI com apoio de IA, antes (ou em vez) de contratar um artista?*
**Data da pesquisa:** junho/2026 (campo extremamente volátil — dados ancorados em fontes verificadas no fim do documento).

> **TL;DR (para quem tem 30 segundos):** IA **acelera muito** a produção e **reduz custo**, mas **não entrega sozinha** um avatar herói premium para a marca em 2026 — o gargalo persistente é **topologia "triangle soup" + mãos/rostos quebrados**, exatamente as áreas críticas da nossa Bíblia de Arte. **A melhor "IA" hoje está DENTRO do ecossistema que já escolhemos** (Reallusion **CC5 + Headshot 3**: gera personagem **já rigado** a partir de 1 imagem/texto, com topologia limpa). **Recomendação: pipeline HÍBRIDO** — IA acelera a base e a face; humano (mais barato/rápido que do zero) finaliza. **Não dá para demitir o artista; dá para baratear e acelerar o trabalho dele.**

---

## 1. Sobre "executar testes" — nota de honestidade

O objetivo do lab inclui *"sempre que possível, executar pequenos testes ou POCs e registrar os resultados"*. Sendo rigoroso (como o projeto exige):

- **Executar de verdade** essas ferramentas significa **criar contas externas, consumir créditos pagos e fazer upload de prompts/imagens a serviços de terceiros** (Meshy, Tripo, Rodin, Hunyuan hospedado…). Isso é uma **ação externa/irreversível** (dados saem para fora) e conflita com a postura "não comprar / não baixar" mantida nas etapas anteriores. **Não vou criar contas nem gastar créditos por conta própria.**
- O que **entreguei** no lugar, para o lab já nascer operacional:
  1. **Levantamento técnico atual** (junho/2026) de todas as ferramentas pedidas, com fontes.
  2. **Matriz comparativa** nos critérios solicitados.
  3. **Apparatus de teste reproduzível** — [`experiments/TEST_CARD_TEMPLATE.md`](experiments/TEST_CARD_TEMPLATE.md) — com a **mesma tarefa-padrão** e métricas objetivas, para que qualquer teste real gere evidência comparável.
- **Posso executar os testes reais** assim que você autorizar uma das vias: (a) você cria as contas/free-tiers e eu conduzo via navegador (Claude in Chrome) preenchendo os Test Cards; ou (b) você roda e me passa os GLBs para eu medir/avaliar. Várias ferramentas têm **free tier** que permite um primeiro teste **sem custo** (com a ressalva de licença, §3).

> Em resumo: o lab está **montado e pronto para medir**; a coleta de pixels reais aguarda sua autorização para tocar serviços externos.

---

## 2. Panorama: o que mudou desde nosso último estudo

Três fatos de junho/2026 que importam para a decisão:

1. **Reallusion lançou a visão "Hybrid AI 2026" e o Character Creator 5.** O **Headshot 3** (plugin do CC5) **gera um personagem totalmente rigado a partir de 1 imagem ou prompt de texto**, com geração de imagem 4K, refino de formato de cabeça por spline/Bézier, *Image to Cloth*, *Joint Corrective Morphs* e *AccuFace 2*. **Tradução:** a IA mais útil para nós **já está dentro do pipeline CC/AccuRig/Blender que escolhemos** — preservando topologia limpa e rig confiável.
2. **Os geradores text/image-to-3D amadureceram em velocidade e textura**, mas o **gargalo de topologia para animação continua.** Soluções como *Tripo Smart Mesh* e auto-rig do *Meshy* atacam o problema, porém — citando teste independente — *"o output ainda exigiu ajustes de UV e topologia antes de importar"*.
3. **Faces e mãos seguem sendo o ponto fraco estrutural** da geração por IA — *"capacidade insuficiente de modelar mãos e rostos… artefatos perceptíveis nos detalhes das mãos"*. Para o GymFlow, onde **"mãos são teste de qualidade"** (Bíblia §3), isso é decisivo.

---

## 3. Ferramentas avaliadas

> Critérios por ferramenta: **qualidade · realismo · facilidade · export GLB · compat. Three.js/R3F · licença comercial · custo · limitações · pós-produção.**
> **Nota transversal sobre R3F:** *qualquer* GLB carrega em React Three Fiber via `useGLTF` — "compatível com R3F" **nunca** é o problema. O problema é a **qualidade/topologia/rig do que está dentro** do GLB e se ele conforma ao nosso skeleton único (futuro `SKELETON_001`). Trato isso por ferramenta.

### 3.1 Meshy AI (Meshy 6)
- **Qualidade/realismo:** alta para **props/estilizado/game asset**; humano realista **médio** (rosto/mãos fracos para "herói premium"). Auto-rig + 500+ animações prontas.
- **Facilidade:** altíssima (texto/imagem → modelo em ~1 min; 7 formatos incl. GLB/FBX).
- **Export GLB:** ✅ nativo (inclusive animado).
- **R3F:** ✅ carrega; rig próprio (não conforma ao nosso skeleton sem retarget).
- **Licença:** free = **CC BY 4.0** (uso comercial **com atribuição**, modelo **público**); planos pagos = **Private/posse total** sem atribuição. ⚠️ Para marca, o free (público + atribuição) é inadequado → precisa plano pago.
- **Custo:** free tier + assinatura paga para licença privada.
- **Limitações:** mãos/rosto/topologia para deformação premium; "cara de asset".
- **Pós-produção:** retopo + conserto de mãos/rosto + re-rig + roupa de marca + otimização. **Alta.**

### 3.2 Tripo AI (Algorithm 3.1 + Smart Mesh)
- **Qualidade/realismo:** entre os melhores em **geometria estruturada**; **Smart Mesh** melhora topologia na geração; rig com pesos equilibrados.
- **Facilidade:** alta (texto/imagem; retopo e rig integrados).
- **Export GLB:** ✅ (USD/FBX/OBJ/STL/GLB/3MF, com esqueleto).
- **R3F:** ✅ carrega; rig próprio.
- **Licença:** **free = SEM uso comercial** (público, CC BY 4.0); **Pro US$19,90/mês** (3.000 créditos, **direitos comerciais**); modelos privados a partir de **US$11,94/mês**.
- **Custo:** ~US$12–20/mês.
- **Limitações:** mesmo após Smart Mesh, teste independente relata **ajuste de UV/topologia** antes de produção; rosto/mãos premium ainda limitados.
- **Pós-produção:** média-alta (menor que Meshy graças ao Smart Mesh, mas existe).

### 3.3 Tencent Hunyuan3D (2.5)
- **Qualidade/realismo:** forte em geometria/textura (CLIP 0.821; +15% precisão geométrica, +20% textura vs. anterior); gera personagem e **low-poly**; geração em 8–20 s em A100/4090.
- **Facilidade:** média (melhor via interface hospedada; versões open exigem GPU local/infra).
- **Export GLB:** ✅ (malha).
- **R3F:** ✅ carrega.
- **Licença:** ⚠️ **uso comercial requer aprovação explícita da Tencent** (formulário com nome da empresa/uso). **Não é "pegou e usou"** comercialmente.
- **Custo:** modelo aberto/hospedado; custo real = GPU/infra + processo de licença.
- **Limitações:** burocracia de licença comercial; rosto/mãos premium; pensado mais para objeto/baseline.
- **Pós-produção:** alta para humano premium.

### 3.4 Rodin / Hyper3D (Rodin v2 + ChatAvatar) — DeemosTech
- **Qualidade/realismo:** **o mais "production-ready" do grupo** para humano. Dois motores: **Rodin** (geral, PBR, geometria *rig-ready*, **geração em T-pose/A-pose**) e **ChatAvatar** (**rosto/cabeça hiper-realista** com PBR, dataset facial profissional, usado em cinema/games).
- **Facilidade:** alta (texto/imagem; T/A-pose facilita rig).
- **Export GLB:** ✅ (FBX/OBJ/GLB/USDZ/STL).
- **R3F:** ✅ carrega.
- **Licença:** assinatura em níveis; termos comerciais por plano — **confirmar por escrito** (especialmente *web embed*).
- **Custo:** assinatura paga (tiers).
- **Limitações:** corpo inteiro premium ainda exige acabamento; **ChatAvatar é cabeça/face** (não corpo) — ótimo como **componente facial**, não avatar completo.
- **Pós-produção:** média (Rodin) / baixa-média na face (ChatAvatar), mas integração face↔corpo é trabalho humano.

### 3.5 Stable Fast 3D (Stability AI)
- **Qualidade/realismo:** **velocidade extrema (<1 s)**, UVs e material razoáveis; **fidelidade menor** que TRELLIS/Tripo/Rodin. Bom para **prototipagem/baseline**, não herói.
- **Facilidade:** alta.
- **Export GLB:** ✅.
- **R3F:** ✅.
- **Licença:** **grátis para receita anual ≤ US$1M**; acima disso, **Enterprise da Stability**. (Boa para começar; revisitar ao escalar.)
- **Custo:** grátis no nosso estágio.
- **Limitações:** qualidade insuficiente para avatar de marca; objeto > humano.
- **Pós-produção:** alta para premium.

### 3.6 Microsoft TRELLIS / TRELLIS.2 (4B)
- **Qualidade/realismo:** **estado da arte em image-to-3D** (TRELLIS.2 = 4B parâmetros, alta fidelidade; saídas em mesh, 3D Gaussians, radiance fields).
- **Facilidade:** média (open source; roda local com GPU, ou via NIM/NVIDIA/ComfyUI).
- **Export GLB:** ✅ (mesh).
- **R3F:** ✅.
- **Licença:** **MIT** — **a melhor licença do grupo** (uso comercial livre, **self-host**, sem lock-in, sem atribuição). ⭐
- **Custo:** **grátis** (custo = sua GPU/infra).
- **Limitações:** foco em **objeto/cena**; humano premium e rig não são o forte; topologia ainda exige retopo.
- **Pós-produção:** alta para avatar humano; **excelente para o cenário/equipamentos** (§ uso recomendado).

### 3.7 Character Creator 5 + Headshot 3 + AccuRig (Reallusion) — o "AI híbrido nativo"
- **Qualidade/realismo:** **alta e controlável**; humano realista com **topologia limpa profissional** e **rig confiável** — base do nosso pipeline. **Headshot 3 gera personagem rigado de 1 imagem/prompt**; *Image to Cloth*, *Joint Corrective Morphs*, *AccuFace 2*.
- **Facilidade:** média (curva CC), mas **Headshot 3 encurta muito** o caminho do "base humano".
- **Export GLB:** ❌ **não nativo** → via **Blender (`cc_blender_tools`)** → glTF (gargalo já documentado em E0 §4.1).
- **R3F:** ✅ após Blender; **conforma ao nosso skeleton único** (vantagem decisiva: reuso de animação).
- **Licença:** **royalty-free perpétua** com permissão de **web embed** (confirmar por escrito; ver `ASSET_SELECTION_001`). **A mais segura para nós.**
- **Custo:** licença CC5 + AccuRig grátis + Blender grátis.
- **Limitações:** export passa por Blender; "cara de CC genérico" sem refino humano (resolvido em E1).
- **Pós-produção:** **a menor para chegar a premium controlável**, porque já nasce com topologia + rig bons.

### 3.8 AccuRig + Blender (a espinha dorsal, não geradores)
- **AccuRig:** auto-rig humanoide **grátis**, limpo, Mixamo-like. Não gera malha; **rigga** o que vier.
- **Blender + `cc_blender_tools`:** **etapa obrigatória** de tradução PBR→glTF, limpeza, biomecânica, export, **e retopo/conserto** de qualquer malha vinda de IA. É **onde o trabalho humano acontece** em qualquer pipeline híbrido.

### 3.9 Outras relevantes (menção)
- **Gaussian Splatting animável de humanos** (AvatarReX, SplattingAvatar, Human-3Diffusion, GenLCA): **research/experimental** — não production-ready para web/mobile premium em 2026 (consistente com SPIKE_001). Vigiar, não adotar.
- **Avatares "talking" full-body** (Synthesia/Vidnoz/DeepBrain): são **vídeo/2.5D de apresentador**, não malhas 3D animáveis por exercício. **Fora do escopo** do GymFlow.

---

## 4. Matriz comparativa (síntese)

| Ferramenta | Realismo humano | GLB | Licença p/ marca | Custo | Pós-prod. p/ premium | Melhor uso no GymFlow |
|---|:--:|:--:|---|---|:--:|---|
| **CC5 + Headshot 3 + AccuRig** | ★★★★☆ | via Blender | ✅ royalty-free (web embed*) | Licença CC5 | **Baixa** | **Avatar herói (base + rig)** |
| **Rodin / ChatAvatar** | ★★★★☆ (face ★★★★★) | ✅ | ⚠️ por plano (confirmar) | Assinatura | Média | **Face hiper-real + base acelerada** |
| **Tripo (Smart Mesh)** | ★★★☆☆ | ✅ | Pago = comercial | ~US$12–20/mês | Média-alta | Base/concept, props |
| **Hunyuan3D 2.5** | ★★★☆☆ | ✅ | ⚠️ aprovação Tencent | Infra | Alta | Baseline, R&D |
| **Meshy 6** | ★★★☆☆ | ✅ | Pago = privado | Assinatura | Alta | Concept, props, anim rascunho |
| **TRELLIS.2 (4B)** | ★★☆☆☆ (humano) | ✅ | ✅ **MIT** ⭐ | Grátis (GPU) | Alta (humano) | **Cenário/equipamentos** (§ Bíblia 6–7) |
| **Stable Fast 3D** | ★★☆☆☆ | ✅ | ✅ ≤US$1M | Grátis | Alta | Prototipagem rápida |

\* *web embed do CC a confirmar por escrito com a Reallusion (ação jurídica já listada no roadmap).*

---

## 5. O que a IA já faz vs. o que ainda exige humano

| Etapa | IA hoje (2026) | Humano ainda necessário? |
|---|---|---|
| **Concept / referência visual** | ✅ Excelente (gera refs 4K, variações) | Não (curadoria de arte) |
| **Base mesh do corpo** | ✅ Boa (CC5 Headshot 3 / Rodin) | Supervisão |
| **Rosto realista** | ✅ Forte (ChatAvatar) / Bom (Headshot 3) | Acabamento + evitar uncanny |
| **Mãos** | ❌ **Fraco** (ponto cego estrutural da IA) | **SIM — crítico** |
| **Topologia animation-ready** | ⚠️ Parcial (Smart Mesh ajuda) | **SIM — retopo/QA** |
| **Rig / skin weights** | ✅ Auto-rig (AccuRig/Meshy/Tripo) | Ajuste de pesos, conformar ao skeleton único |
| **Roupa com identidade GymFlow** | ⚠️ *Image to Cloth* ajuda | **SIM — design de marca** |
| **Materiais PBR p/ glTF** | ⚠️ Gera, mas tradução p/ web | **SIM — Blender** |
| **Animação biomecânica correta** | ⚠️ Presets genéricos (não nosso padrão) | **SIM — biomecânica + cleanup** |
| **Otimização web/mobile (GLB)** | ❌ | **SIM — glTF-transform** |
| **Direção de arte / coerência de marca** | ❌ | **SIM — sempre** |
| **Verificação de licença** | ❌ | **SIM — jurídico** |

**Leitura:** a IA **comprime as etapas iniciais** (concept → base → rig rascunho), mas o **"último 30%" que define premium** (mãos, topologia, biomecânica, marca, otimização, licença) **continua humano**. Esse 30% é justamente o que separa "boneco de IA" de "avatar GymFlow".

---

## 6. Respostas às 4 perguntas do laboratório

### 1) É possível chegar a um avatar de qualidade premium usando IA?
**Parcialmente — não "só com IA", mas "com IA + humano" sim.** Em junho/2026, **nenhum gerador text/image-to-3D entrega sozinho** um avatar herói premium: topologia "triangle soup", **mãos/rostos quebrados** e rigs não-conformes reprovam nos critérios da Bíblia §12. **Porém**, a IA **dentro do pipeline certo** (CC5/Headshot 3 para base+rig, ChatAvatar para face) **chega a premium** após acabamento humano — com **menos tempo e menos custo** do que do zero. **IA é acelerador, não substituto.**

### 2) Qual pipeline recomenda?
**Pipeline HÍBRIDO "IA acelera, humano finaliza", ancorado no ecossistema já escolhido:**

```
[1] Concept por IA (Meshy/Rodin/imagem 4K)  →  referência de arte aprovada (Bíblia)
        ↓
[2] Base + rig por IA NATIVA do pipeline: CC5 + Headshot 3 + AccuRig
    (opcional: face hiper-real via ChatAvatar; corpo via Rodin se preferível)
        ↓
[3] Blender (cc_blender_tools): retopo/QA, conserto de MÃOS/rosto,
    roupa de marca, materiais PBR→glTF, biomecânica do agachamento
        ↓
[4] Otimização: glTF-transform (Draco/Meshopt + KTX2) → GLB
        ↓
[5] Validação no /poc-3d (portão GO/NO-GO — Bíblia §15 / E0 §13)

Paralelo: CENÁRIO + EQUIPAMENTOS → TRELLIS.2 (MIT, grátis) + Blender.
```

**Por que este:** mantém **topologia limpa + rig confiável + skeleton único** (essencial para reuso de animação), usa IA onde ela é forte (concept, base, face), e **isola o trabalho humano no "último 30%"** — reduzindo a contratação de "fazer um avatar" para "**finalizar e dar identidade**" (mais barato e rápido).

### 3) Em quais etapas um artista 3D ainda será necessário?
**Mãos** (crítico), **retopologia/QA de deformação**, **ajuste de skin weights / conformar ao skeleton único**, **roupa com identidade de marca**, **materiais PBR para web (Blender)**, **animação biomecanicamente correta**, **otimização GLB**, e **direção de arte/coerência + verificação de licença**. Ou seja: o artista deixa de **modelar do zero** e passa a **finalizar/dirigir** — perfil de **generalist 3D / technical artist**, possivelmente **menos horas** que a contratação cheia do `HIRING_001`.

### 4) Qual é o menor caminho para produzir o PRIMEIRO avatar oficial?
**Caminho mínimo recomendado (melhor custo × risco):**
1. Gerar **referência de arte** por IA (imagem 4K) aprovada contra a Bíblia. *(grátis/baixo)*
2. **CC5 + Headshot 3** → base masculino **já rigado** a partir dessa referência. *(licença CC5)*
3. **AccuRig** (se necessário) + **Blender**: conserto de mãos, roupa GymFlow, biomecânica do **agachamento**. *(grátis)*
4. **glTF-transform** → `gymflow_male_v1.glb` otimizado. *(grátis)*
5. Carregar no **/poc-3d** → **GO/NO-GO**. *(é o E0)*

> Isto é **exatamente o E0 do roadmap, agora AI-acelerado**. O lab **não derruba** a decisão técnica anterior — **confirma e turbina**: a melhor IA está dentro do CC/Blender que já escolhemos.
>
> **Atalho ainda menor (se quiser o mais rápido possível e topar risco/licença):** Rodin (A-pose) **ou** Tripo Pro → Blender (retopo + mãos + roupa + biomecânica) → GLB. Mais rápido na base, **mais pós-produção** e **licença a confirmar**. Bom para um **teste descartável**, arriscado para o asset **oficial**.

---

## 7. Recomendação final (como Diretor de P&D)

> **Adotar o pipeline híbrido — mas não esperar a IA substituir o artista para o avatar de marca.**

- **Avatar herói (M/F oficiais):** **CC5 + Headshot 3 + AccuRig + Blender + glTF-transform**, com **acabamento humano** (foco em mãos/rosto/roupa/biomecânica). IA acelera; humano garante premium.
- **Face:** considerar **ChatAvatar** como componente de realismo facial se Headshot 3 não bastar.
- **Cenário e equipamentos:** **TRELLIS.2 (MIT, grátis)** + Blender — aqui a IA já é "boa o suficiente" porque não são humanos (sem o problema de mãos/rosto), e a licença MIT elimina risco/lock-in. **Maior ganho de IA com menor risco.**
- **Concept/variações:** qualquer gerador (Meshy/Rodin) como **ferramenta de referência**, não de asset final.
- **Não adotar agora:** Gaussian Splatting de humanos (experimental); avatares "talking" de vídeo (fora de escopo).
- **Licença:** confirmar por escrito (a) **web embed do CC** com a Reallusion, (b) termos comerciais de qualquer SaaS antes de usar output no produto; **evitar free tiers com CC BY/atribuição pública** para asset de marca.

**Impacto no `HIRING_001`:** o perfil contratado pode mudar de *"character artist que modela do zero"* para *"3D generalist / technical artist que finaliza saída de IA + dá identidade + faz biomecânica"* — provavelmente **menos horas e menor custo** que o orçamento anterior. O teste técnico (§4 do HIRING) deve então pedir **"pegue esta base de IA e finalize ao padrão GymFlow"**, que mede exatamente a habilidade que passamos a precisar.

---

## 8. Plano de ação

| # | Ação | Toca o produto? | Custo | Depende de |
|---|---|:--:|---|---|
| 1 | **Autorizar testes reais** das ferramentas (free tiers primeiro) | ❌ (fica no lab) | grátis→baixo | sua autorização p/ contas externas |
| 2 | Rodar **Test Cards** (template pronto) p/ Meshy, Tripo, Rodin/ChatAvatar, CC5+Headshot 3, TRELLIS.2 | ❌ | grátis→US$~20 | #1 |
| 3 | **POC de cenário/equipamento** via TRELLIS.2 (MIT) | ❌ (lab) | grátis (GPU) | infra GPU |
| 4 | Confirmar **licenças por escrito** (Reallusion web embed; SaaS comercial) | ❌ | grátis | contato fornecedores |
| 5 | Escolher pipeline híbrido final e **ajustar `HIRING_001`** (perfil "finalizador de IA") | ❌ (doc) | — | #2–#4 |
| 6 | Produzir **`gymflow_male_v1` (E0)** pelo pipeline híbrido | ✅ (entra em `public/assets` só no E0) | licença CC5 | decisão + GO |

**Próximo passo imediato (aguardando autorização):** **#1 + #2** — executar os testes reais nas ferramentas (começando pelos free tiers) e preencher os Test Cards, para **substituir esta avaliação de pesquisa por evidência de pixels reais** antes de bater o martelo. Nada disso toca o GymFlow AI/POC.

---

## Fontes (verificadas em junho/2026)

- [Meshy AI — site / features / animation](https://www.meshy.ai/) · [Meshy review 2026 (Medium)](https://medium.com/illumination/meshy-ai-3d-generator-review-2026-full-production-pipeline-tested-298b006b4a42)
- [Tripo AI — auto-rigging](https://www.tripo3d.ai/features/ai-auto-rigging) · [Tripo review (MakerStack)](https://makerstack.co/reviews/tripo-ai-review/) · [Tripo Smart Mesh / topologia (The Tool Nerd)](https://www.thetoolnerd.com/p/tripo-smart-mesh-p10-step-by-step-guide) · [Tripo AI retopology guide](https://www.tripo3d.ai/tutorials/master-ai-retopology-workflow-guide)
- [Tencent Hunyuan 3D — site](https://3d.hunyuan.tencent.com/) · [Hunyuan3D-2 LICENSE (GitHub)](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/main/LICENSE) · [Hunyuan 3D-2.5 (Vset3D)](https://www.vset3d.com/hunyuan-3d-2-5-tencent-pushes-the-boundaries-of-3d-generation-with-ai/)
- [Hyper3D Rodin — review](https://hyper3d.ai/blog/hyper3d-rodin) · [Rodin v2 (WaveSpeed)](https://wavespeed.ai/blog/posts/introducing-hyper3d-rodin-v2-text-to-3d-on-wavespeedai/) · [ChatAvatar (Hyper3D)](https://hyper3d.ai/chatavatar) · [HyperHuman (Deemos, Medium)](https://deemostech.medium.com/hyperhuman-explained-81ec12cbe86c)
- [Microsoft TRELLIS (GitHub)](https://github.com/microsoft/TRELLIS) · [TRELLIS.2 (GitHub)](https://github.com/microsoft/TRELLIS.2) · [TRELLIS.2-4B notícia (ComfyUI Wiki)](https://comfyui-wiki.com/en/news/2025-12-18-microsoft-trellis2-3d-generation) · [Stable Fast 3D (Trellis3D)](https://trellis3d.co/StableFast3D)
- [Reallusion 2026 Hybrid AI roadmap (CG Channel)](https://www.cgchannel.com/2026/04/see-reallusions-2026-roadmap-redefining-3d-with-hybrid-ai/) · [Reallusion 2026 Vision (PRNewswire)](https://www.prnewswire.com/news-releases/reallusion-announces-2026-vision-redefining-3d-production-through-the-power-of-hybrid-ai-302736982.html)
- [Mesh topology p/ animação (Hyper3D)](https://hyper3d.ai/blog/mesh-topology-3d) · [Will AI replace 3D artists 2026 (Omega Render)](https://omegarender.com/will-ai-replace-3d-artists) · [AI hands/anatomy errors 2026 (GensGPT)](https://www.gensgpt.com/blog/ai-hands-anatomy-body-fixes-common-errors-2026-guide)

---

> **Escopo confirmado:** nenhum arquivo do GymFlow AI / Motion Engine / POC foi alterado; nada instalado, comprado ou baixado. Todo o conteúdo deste lab vive em `labs/avatar-lab/`.

*Fim — `GYMFLOW_AVATAR_LAB_001.md`.*
