# E0.5 — Execução Híbrida + Alternativas ao CC5 (2026)

**Documento:** `labs/avatar-lab/results/EXECUTION_AND_ALTERNATIVES.md`
**Escopo:** só `labs/avatar-lab/`. Não toca GymFlow AI / Motion Engine / POC.
**Status da execução real:** ⏸️ **bloqueada em 2 portões** (navegador não conectado + sem contas/imagem de referência). Veja §3 — assim que liberados, sigo.

---

## 1. Você pediu: existe algo melhor que o CC5 em 2026? — Comparação

> Pesquisa de junho/2026 (fontes no fim). Conclusão curta: **para o nosso caso específico** (humano ultra-realista, **GLB**, web/R3F, **posse**, animável por exercício), o CC5 segue como **o melhor equilíbrio** — mas há **dois rivais sérios que merecem ser TESTADOS** antes de decidir: **MetaHuman 2.0** (teto de realismo maior) e **3D AI Studio / Hyper3D** (IA tudo-em-um mais rápida).

| Ferramenta | Realismo (teto) | Caminho até **GLB web** | Rig | Licença p/ web embed | Veredito p/ GymFlow |
|---|---|---|---|---|---|
| **Character Creator 5 + Headshot 3** | Alto | CC5→Blender→glTF (médio) | **Limpo + compatível MetaHuman** | ✅ royalty-free (confirmar) | **Melhor equilíbrio / base oficial provável** |
| **MetaHuman 2.0 (Epic)** | **Máximo** (referência de realismo) | UE5→FBX/Python→Blender→GLB (**pesado**; cabelo problemático) | Excelente (padrão MetaHuman) | Liberado fora do Unreal (rever termos) | **Benchmark de realismo** — provável **overkill/peso** p/ runtime web full-body |
| **3D AI Studio** | Médio-alto | prompt/foto → **rigado → GLB num lugar só** | Auto | Pago = comercial (rever) | **Testar** — promete o pipeline mais curto |
| **Hyper3D (Rodin + ChatAvatar)** | Alto (face ★★★★★) | GLB nativo | A/T-pose | Tiers (confirmar) | **Testar** — face hiper-real + base |
| **MetaPerson (Avatar SDK)** | Médio | **GLB/GLTF nativo** (foto→avatar) | Sim | Comercial (planos) | Testar — rápido, mais "avatar" que "herói" |
| **Sloyd** | Médio-baixo | GLB | Pré-rigado | Comercial | Plano B rápido |
| **Daz Studio** | Alto | Daz→Blender→GLB | Daz (retarget) | **Interactive License paga por asset** | Atrito de licença p/ runtime |

> **Fato novo relevante (2026):** o **CC5 agora compartilha esqueleto e padrões faciais do MetaHuman** — dá para trocar personagens CC5 ↔ MetaHuman no Unreal e aplicar animações MetaHuman **sem retarget**. Isso reforça o CC5 como base "à prova de futuro": pega o ecossistema MetaHuman **sem** o peso/atrito do pipeline Unreal→web.
>
> **Recomendação de teste:** incluir **MetaHuman como "benchmark de realismo"** (para sabermos o teto) e **3D AI Studio** (pelo pipeline curto), além dos já listados. Decidir **só com pixels reais**.

---

## 2. Plano híbrido de execução (ordem dos testes)

**Lote A — sem imagem de referência (text-to-3D, mais rápido):** Meshy → Tripo → Rodin (texto).
**Lote B — precisa de 1 imagem de referência:** Hunyuan3D (demo) → Avaturn → MetaPerson → CC5 Headshot 3 (também aceita texto).
**Lote C — desktop:** CC5 + Headshot 3 + AccuRig.
**Benchmark:** MetaHuman 2.0 (só para medir o teto de realismo).

Cada teste → captura (frente / 3-4 / close rosto / close mãos) em `results/<ferramenta>/` + Test Card preenchido + linha na tabela do `GYMFLOW_AVATAR_LAB_RESULTS_v01.md`.

---

## 3. PORTÕES — o que preciso de você para continuar (passo a passo)

> Faça **qualquer um** destes e eu **retomo na hora**. Em ordem do que destrava mais rápido.

### 🔑 Portão 1 — Conectar o navegador (destrava TODAS as ferramentas web)
Sem isso eu não consigo operar nenhum site. Passos:
1. Instale a extensão **“Claude in Chrome”** no Google Chrome (Chrome Web Store).
2. Faça login na extensão com sua conta Claude.
3. Me avise “naveguador conectado” — eu disparo o pedido de conexão e você clica **Connect** no Chrome.
> Sem navegador conectado: `list_connected_browsers` retornou **vazio** (verificado agora).

### 🔑 Portão 2 — Conta gratuita (escolha 1 para o PRIMEIRO teste real)
O caminho **mais rápido para pixels reais hoje**, sem precisar de imagem:
- **Meshy AI** — crie conta grátis em meshy.ai. *(free = licença CC BY 4.0 pública — OK para TESTE, não para o asset final de marca.)* Com Chrome conectado + logado, **eu gero o masculino e o feminino por texto** e comparo.
- (Opcional, em seguida) **Tripo** (tripo3d.ai) e **Rodin/Hyper3D** (hyper3d.ai) — mesma ideia.

### 🔑 Portão 3 — Imagem de referência (para as ferramentas “foto→avatar”)
Avaturn, MetaPerson, Hunyuan e o Headshot 3 partem de **1 imagem**. **Eu não gero imagens.** Opções:
- (a) Você gera **1 retrato + 1 corpo inteiro** (M e F) com um gerador de imagem (ex.: o próprio Claude/qualquer image AI) usando o prompt do `STANDARD_PROMPT.md`, e salva em `results/_reference/`; **ou**
- (b) começamos só pelos text-to-3D (Portão 2) e deixamos os “foto→avatar” para depois.

### 🔑 Portão 4 — CC5 (desktop, provável vencedor para uso oficial)
1. Baixe o **trial do Character Creator 5** em reallusion.com (trial gratuito ~30 dias).
2. Instale o plugin **Headshot 3** (trial) e o **AccuRig** (grátis, conta ActorCore).
3. Me avise quando instalado. *(Para CC5 eu precisaria controlar o app via desktop — combinamos isso quando chegar a hora; é mais pesado que o navegador.)*

### (Opcional) Portão 5 — MetaHuman benchmark
Só se quiser medir o teto de realismo: criar MetaHuman no Unreal/MetaHuman Creator e exportar. Pesado; tratamos como referência, não como pipeline de runtime.

---

## 4. Recomendação de sequência (a mais eficiente)
**Faça Portão 1 + Portão 2 (Meshy).** Com isso eu produzo o **primeiro par real (M+F)** ainda hoje e começo a preencher o ranking com pixels — sem custo e sem depender de imagem. Em paralelo, se topar, dispare o **Portão 4 (trial CC5)**, que é o candidato mais forte para o asset **oficial**.

---

## Fontes (jun/2026)
- [MetaHuman Creator alternatives 2026 (Hyper3D)](https://hyper3d.ai/blog/metahuman-creator-alternative) · [CC5 review (Creative Bloq)](https://www.creativebloq.com/3d/character-creator-5-review-unreal-engine-support-and-auto-rigging-make-it-a-joy-to-use) · [CC5 meets MetaHuman (Reallusion)](https://magazine.reallusion.com/2026/02/06/characters-for-unreal-character-creator-5-meets-metahuman/)
- [MetaHuman → Blender export (Medium)](https://medium.com/@little_michael101/fully-exporting-a-metahuman-from-u-e-5-6-to-blender-except-hair-assets-2dc48f12c228) · [UE5 bulk GLB/GLTF export](https://inzomnia5.itch.io/unreal-5-bulk-export-as-glb-gltf)
- [Best AI 3D character/avatar generators 2026 (3DAI Studio)](https://www.3daistudio.com/blog/best-ai-3d-character-and-avatar-generators-2026) · [Best 3D avatar creator 2026 (Hyper3D)](https://hyper3d.ai/blog/3d-avatar-creator) · [MetaPerson / Avatar SDK](https://avatarsdk.com/avatar-maker/)

*Fim — atualizar conforme os portões forem liberados.*
