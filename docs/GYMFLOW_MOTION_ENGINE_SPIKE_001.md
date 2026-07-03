# GYMFLOW_MOTION_ENGINE_SPIKE_001 — Prova de Conceito Visual

**Documento:** `docs/GYMFLOW_MOTION_ENGINE_SPIKE_001.md`
**Tipo:** **SPIKE** (prova de conceito) — **não** é sprint de implementação.
**Pergunta única a responder:** *"A tecnologia escolhida (CC4 + AccuRig + GLB + React Three Fiber + Three.js) realmente entrega um avatar humano 3D premium, bom o suficiente para ser o padrão oficial do GymFlow AI?"*
**Data:** junho/2026. Pesquisa técnica re-confirmada nesta data (fontes no fim).

### Guard-rails (o que este spike NÃO faz)
- ❌ Não implementa a Motion Engine completa. ❌ Não cria centenas de exercícios. ❌ Não cria biblioteca completa.
- ❌ Não congela o skeleton. ❌ Não altera módulos do app (IA Coach, Treinos, Planejador, Nutrição, Comunidade…).
- ❌ **Este documento não codifica, não baixa arquivo e não cria asset.** Ele **define e dá critérios** ao spike. A execução (criar 2 avatares + 1 animação e olhar o resultado) depende de autorização explícita.

**Foco exclusivo:** **validação visual** (com performance como restrição dura).

> **Nota de honestidade metodológica (importante):** um spike *visual* só pode receber o carimbo final "parece premium: SIM" **depois de existir um asset real e alguém olhar para ele**. Como nada será criado/baixado nesta etapa, este documento entrega: (a) o **veredito técnico de viabilidade** — que pode ser dado agora, com evidência; e (b) o **protocolo de execução** que destrava o veredito **visual** final. A §7 separa explicitamente o que já está respondido do que só a execução responde.

**Base:** `GYMFLOW_MOTION_ENGINE_RESEARCH_v01.md`, `GYMFLOW_MOTION_ENGINE_SPEC_v01.md`, `GYMFLOW_ASSET_SELECTION_001.md`, POC em `/poc-3d`.

---

## FASE 1 — Pesquisa técnica final (re-confirmação + novidades)

### 1.1. Licenciamento (re-confirmado, jun/2026)
| Item | Situação | Fonte |
|---|---|---|
| **CC4 / ActorCore** | Royalty-free, perpétua; direito **explícito** de exportar e incluir em *"applications, web services, interactive projects"*. **Enterprise** só p/ "server-based business"/gerar personagens de usuário via API. Para **2 avatares fixos embutidos**, o standard cobre. | Reallusion License/EULA |
| **AccuRig** | **100% grátis**, uso comercial, export FBX/USD; precisa conta ActorCore gratuita. | Reallusion AccuRIG |
| **Ready Player Me** | **Descontinuado** (serviços encerrados 31/01/2026). ❌ fora. | Variety/TechCrunch |
| **MetaHuman** | Livre fora do Unreal (jun/2025), grátis < US$1M/ano, pode vender. | CG Channel/MetaHuman License |

→ **Sem mudança na conclusão de licença:** CC4+AccuRig é web-clean para o caso de 2 avatares fixos. **Ação pendente (não-bloqueante do spike):** confirmação escrita da Reallusion para "avatares embutidos servidos em web app".

### 1.2. Exportação GLB — DESCOBERTA QUE AJUSTA O PIPELINE
**CC4 não exporta glTF/GLB nativamente.** O caminho real e suportado é:

```
CC4  ──FBX──▶  Blender (addon cc_blender_tools)  ──glTF/GLB──▶  glb final
```

Gotchas conhecidos (documentar e mitigar no spike):
- **FBX não carrega PBR**; a tradução de materiais PBR acontece via Blender/cc_blender_tools. Por isso o Blender é **obrigatório**, não opcional.
- **Shape keys** podem quebrar o export glTF em versões recentes do `cc_blender_tools` (relato: 2.0.7 falha com shape keys; 1.5.4 exporta). No spike **não precisamos de shape keys** (sem blendshapes faciais), então **desabilitar a exportação de shape keys** remove o risco.
- Export com "Sampling Motion Bone" ficou **lento** em builds recentes do CC4 (minutos em vez de segundos) — irrelevante para 1 clipe curto, mas registrar.

→ **Impacto:** Blender entra como etapa fixa do pipeline (gratuito). Não é dealbreaker — é caminho trilhado, com tutoriais. **AccuRig** é necessário sobretudo no caminho de **mesh custom** (futuro); para avatar **autorado em CC4**, o **CC rig nativo** já vem pronto — o spike valida os dois pontos: (a) CC4-rig direto e (b) que o GLB final preserva skin/rig após o Blender.

### 1.3. Compatibilidade Web / R3F / Three.js
- GLB carrega via **GLTFLoader / `useGLTF`**; animação via **AnimationMixer / `useAnimations`** — exatamente o que a POC já implementa. Sem incógnita aqui.
- **SkinnedMesh tem limite de uniforms de bones no mobile** (GPUs mobile podem expor só 256/512 vetores) → **reforça o teto de ≤70 bones** (SPEC §8). Há relatos de *crash de SkinnedMesh em mobile* mal otimizado → tratar como **risco conhecido** e testar em device real.
- Boas práticas 2026 (medições citadas): **Draco** reduz ~10× o tamanho; **KTX2/Basis** derruba VRAM (~300MB→~30MB); **Draco+LOD** levou avatares de **20-30 → 45-55 fps**, e **OffscreenCanvas** chegou a 60 fps; meta **< 100 draw calls**.
- Ferramenta de otimização: **`gltf-transform`** (Draco/Meshopt + KTX2 + decimação) — etapa final do pipeline.

### 1.4. Performance mobile — metas derivadas
≤70 bones; ≤60k tris; ≤8 MB GLB; KTX2; Draco/Meshopt; <100 draw calls; LOD opcional no spike, obrigatório ao escalar. (Detalhe nas §3/§8.)

### 1.5. "Existe hoje algo significativamente melhor que CC4+AccuRig?" — ANÁLISE PARA DECIDIR SE DEVO PARAR
> O usuário pediu: se houver tecnologia claramente superior, **PARAR** e propor mudança **antes** de qualquer implementação. Avaliei honestamente:

| Tecnologia | Veredito jun/2026 | Por que NÃO substitui CC4+AccuRig agora |
|---|---|---|
| **Gaussian Splatting animável (HuGS/ASH/SplattingAvatar)** | **Research/experimental.** WebGPU em estágio inicial. | Não há pipeline de produção para **animação arbitrária riggeada** (qualquer exercício); reconstrução por pessoa, ferramentas instáveis, suporte WebGPU desigual em mobile. **Risco altíssimo** para fundar um produto. |
| **MetaHuman → GLB web (via Convai etc.)** | **Viável** após decimação/otimização (mais do que eu afirmara antes). | É **otimizado para "talking head"** (rig facial riquíssimo). Para **corpo inteiro em exercício**, o valor do rosto cai e o **custo de otimização sobe**; ainda mais pesado que CC4. Melhor papel = **render**. |
| **Avaturn / MetaPerson (Avatar SDK, loader three.js oficial)** | **Realistas + web-native + GLB.** | São **bons** — mas **plataformas externas** → dependência (lição fresca do RPM). Servem como **bootstrap rápido** ou **alternativa**, não como vantagem decisiva sobre "possuir o avatar". |
| **Vídeo generativo por IA (Sora/Veo/Runway-like)** | Avança, mas | Não dá **3D interativo** (câmera livre, destaque muscular, troca de gênero), nem consistência/controle biomecânico repetível. Outro produto. |
| **Marketplaces (TurboSquid/CGTrader/Sketchfab/RenderHub)** | Royalty-free, mas | **Problema de extração na web** (GLB servido ao browser) + **skeleton inconsistente**. Reprovados para avatar de marca (ASSET_SELECTION §2). |

**Conclusão da Fase 1:** **NÃO há motivo para parar.** Nenhuma alternativa é *significativamente melhor* para "**humano realista, animável por qualquer exercício, realtime na web/mobile, com licença limpa e posse do asset**". CC4+AccuRig+GLB+R3F segue como a aposta correta — **com o ajuste** de incluir **Blender** como etapa obrigatória de export. O spike continua justificado **exatamente** para matar o único risco que a pesquisa não mata: **a percepção visual do resultado final**.

---

## FASE 2 — O que será validado, como, e os portões

### 2.1. O que exatamente será validado
1. **Qualidade visual** de um avatar humano premium (M e F) renderizado em R3F/Three.js a partir de GLB exportado pelo pipeline CC4→Blender.
2. **Fidelidade do pipeline**: o GLB final preserva **malha, materiais PBR, skin e rig** sem degradar (sem buraco, sem textura quebrada, sem skin colapsando em flexão).
3. **Animação**: 1 clipe (agachamento) roda via AnimationMixer com deformação crível nas articulações sob carga (joelho/quadril/coluna).
4. **Performance** dentro do orçamento mobile/desktop.
5. **Peso/carregamento** do GLB dentro do orçamento.

### 2.2. Quais critérios serão usados
Os três blocos da §3 (Visual / Performance / GLB) + o checklist completo da §6.

### 2.3. Como será medido
| Dimensão | Instrumento | Procedimento |
|---|---|---|
| **FPS** | `stats.js` / R3F `<Perf>` (drei) + DevTools Performance | Medir FPS sustentado por 30s, com auto-rotate ligado, em desktop e em **mobile real mediano**. |
| **Draw calls / triângulos** | `renderer.info` (three.js) | Ler `render.calls` e `render.triangles` no avatar+anim. |
| **Peso GLB** | Sistema de arquivos / aba Network | Medir o `.glb` final pós-otimização. |
| **Tempo de carregamento** | DevTools Network (throttling) | Tempo até o GLB baixar em banda larga e em **4G simulado**. |
| **Tempo até 1ª renderização (TTFR)** | `performance.now()` entre início do load e `onLoad`/primeiro frame | Após o GLB chegar, tempo até aparecer o avatar. |
| **Visual** | Olho humano (avaliador) + capturas | Checklist §6 preenchido por ≥2 pessoas; comparar com referência premium (Fitbod/Freeletics/Centr). |
| **Bones** | Inspeção do GLB (`gltf-transform inspect`) | Contar bones do skin. |

**Dispositivos-alvo de teste:**
- **Desktop:** GPU integrada/mediana (não high-end de propósito — representa o usuário típico).
- **Mobile mediano:** Android ~US$250–350 de geração recente (não flagship). É o gargalo real.

### 2.4. Quando o spike é APROVADO
**Todas** verdadeiras:
- ✅ Visual: passa nos itens premium da §3.1 (humano real, premium, academia profissional; **não** videogame barato / boneco / skeleton / wireframe / cartoon) — avaliado por ≥2 pessoas.
- ✅ Performance: **desktop ≥60 fps** sustentado; **mobile mediano ≥30 fps** (alvo 30–60); sem crash; **<100 draw calls**.
- ✅ GLB: avatar **≤8 MB** (alvo ≤6); clipe **≤600 KB** (alvo ≤300); **≤70 bones**; **≤60k tris**.
- ✅ Carregamento: GLB carrega **≤2,5 s** (banda larga) / **≤4 s** (4G simulado); **TTFR ≤500 ms** após download.
- ✅ Pipeline: GLB preserva PBR/skin/rig; agachamento deforma juelho/quadril/coluna de forma crível, sem foot sliding.

### 2.5. Quando o spike é REPROVADO
**Qualquer** verdadeira:
- ❌ Visual cai em "uncanny", "plástico", "boneco de loja", "videogame barato" e **não há ajuste viável** (textura/luz/material) que resolva sem estourar o orçamento.
- ❌ Não atinge **30 fps no mobile mediano** dentro do orçamento de peso (ou só atinge sacrificando a qualidade abaixo do mínimo).
- ❌ O GLB **não cabe** em 8 MB sem destruir a qualidade visual.
- ❌ O pipeline CC4→Blender→GLB **quebra** skin/rig/PBR de forma não contornável.
- ❌ A licença web se mostrar incompatível na confirmação com a Reallusion (bloqueador jurídico).

---

## FASE 3 — Critérios de sucesso

### 3.1. Visual (qualitativo — portão de marca)
O avatar **deve** parecer:
- ✔ humano real ✔ premium ✔ de academia profissional
- ✔ **não** parecer videogame barato ✔ **não** boneco ✔ **não** skeleton ✔ **não** wireframe ✔ **não** cartoon

Referência de comparação: o avatar precisa "passar" lado a lado com a demonstração de exercício de **Fitbod / Freeletics / Centr / Peloton** sem parecer inferior.

### 3.2. Performance (quantitativo — portão duro)
| Plataforma | Mínimo | Alvo |
|---|---|---|
| **Desktop** (GPU mediana) | 60 FPS | 60 FPS estável |
| **Mobile mediano** | 30 FPS | 30–60 FPS |
| Draw calls | < 100 | < 60 |
| Crash/leak | **zero** | zero |

### 3.3. GLB (quantitativo — portão duro)
| Métrica | Alvo | Teto (reprova acima) |
|---|---|---|
| Peso do avatar `.glb` | ≤ 6 MB | **8 MB** |
| Peso do clipe `.glb` | ≤ 300 KB | 600 KB |
| Triângulos | ≤ 40k | 60k |
| Bones | ~65 | 70 |
| Tempo de carregamento (banda larga) | ≤ 2,5 s | — |
| Tempo de carregamento (4G simulado) | ≤ 4 s | — |
| Tempo até 1ª renderização (TTFR) | ≤ 350 ms | 500 ms |

---

## FASE 4 — O que exatamente será criado (escopo travado)

**Apenas:**
- **1 avatar masculino** (padrão de arte SPEC §3/§9 — atlético natural, roupa fitness premium).
- **1 avatar feminino** (SPEC §3/§10 — mesma família visual, mesma escala/eixo/bind pose).
- **1 animação: AGACHAMENTO** (`squat`).

**Por que AGACHAMENTO e não supino:**
1. É **multiarticular de corpo inteiro** (tornozelo, joelho, quadril, coluna, e braços segurando a barra) → **estressa o skin/rig muito mais** que o supino. É justamente onde rigs baratos **colapsam** (joelho/quadril afundando) — o teste mais diagnóstico.
2. O avatar fica **em pé** → leitura de "hero shot" premium melhor do que deitado num banco para a **primeira impressão**.
3. Exige enquadramento lateral (coluna/profundidade) e frontal (joelhos) → exercita os presets de câmera mais críticos.

**Nada além disso.** Sem segundo exercício, sem variações, sem destaque muscular, sem múltiplas roupas.

---

## FASE 5 — Plano de integração

- O spike roda **exclusivamente em `/poc-3d`** (rota isolada já existente).
- **Mecânica (sem novo código de produto):** colocar `male.glb`/`female.glb` em `public/assets/avatars/`, o clipe em `public/assets/animations/`, e marcar `available: true` nos itens correspondentes de `src/components/three/avatar-config.ts`. A POC **já** detecta isso e troca o placeholder honesto pelo avatar real.
- **Não** integrar a nenhum outro módulo (Vídeos, Ver Técnica, Treino, IA Coach, Biblioteca). **Não** alterar `GymFlowContext`. **Não** tocar navegação/telas do app.
- O `/poc-3d` permanece como **laboratório**; a integração real é etapa **pós-aprovação** (ver ROADMAP).

---

## FASE 6 — Checklist de avaliação

Preencher por **≥2 avaliadores**, em **desktop e mobile**. Notas: ✅ / ⚠️ / ❌.

### Qualidade visual
- [ ] **Realismo** geral (parece humano de verdade?)
- [ ] **Qualidade da pele** (PBR, não plástico/cera, poros/normal crível)
- [ ] **Qualidade das mãos** (dedos articulados, pegada da barra legível)
- [ ] **Qualidade do rosto** (acabado, sem uncanny agressivo)
- [ ] **Roupa** (fitness premium, sem clipping grosseiro, sem logo de terceiro)
- [ ] **Proporção** (anatomicamente natural, atlético sem exagero)
- [ ] **Coesão M×F** (mesma família visual, mesma escala)

### Cena
- [ ] **Iluminação** (volume, premium, sem estourar)
- [ ] **Sombras** (ContactShadows "planta" o avatar; suaves)
- [ ] **Câmera** (lateral/frontal mostram a técnica; transição suave)

### Movimento
- [ ] **Movimento** (agachamento natural, loop sem estalo)
- [ ] **Biomecânica** (profundidade, joelho alinhado, coluna neutra, sem foot sliding)
- [ ] **Deformação do skin** (joelho/quadril/coluna não "quebram" na flexão)

### Percepção
- [ ] **Qualidade percebida** ("eu confiaria nesse app premium internacional?")

### Técnico / performance
- [ ] **Peso** do GLB dentro do orçamento (§3.3)
- [ ] **FPS desktop** ≥ 60
- [ ] **FPS mobile** ≥ 30
- [ ] **Tempo de carregamento** dentro do alvo
- [ ] **Bones / tris / draw calls** dentro do orçamento

### Futuro
- [ ] **Compatibilidade futura** (o mesmo skeleton servirá M e F e aceitará novas animações? o pipeline escala?)

**Regra de decisão:** reprovar se **qualquer** item de marca da §3.1 falhar sem correção viável, **ou** qualquer portão duro (perf/GLB) estourar.

---

## FASE 7 — Relatório de decisão

> **Separação honesta:** abaixo, o que já está respondido **agora** (com evidência) vs. o que **só a execução** do spike responde.

### Veredito TÉCNICO (respondível agora — alta confiança)

**1. A tecnologia realmente entrega um resultado premium?**
**SIM — tecnicamente.** A pilha CC4 (autoria de humano realista) + Blender (export glTF/PBR) + glTF-transform (Draco/KTX2) + R3F/Three.js (GLTFLoader + AnimationMixer) é um caminho **comprovado e em produção** para humanos realistas em web/mobile (Convai, MetaPerson loader, casos R3F com Draco+LOD atingindo 45–60 fps). O realismo do CC4 está **acima** do necessário para "premium fitness" e **abaixo** do peso do MetaHuman — o ponto de equilíbrio certo. **O risco técnico é baixo.**

**2. Vale a pena seguir esse pipeline?**
**SIM.** É o único caminho que combina realismo premium, **licença web-clean**, **posse do asset**, **zero royalty/lock-in de runtime** e **skeleton reaproveitável** — resolvendo o problema de extração da web (ASSET_SELECTION §2) e sobrevivendo à morte de plataformas (RPM).

**3. Existe tecnologia melhor?**
**Não para este caso, hoje.** Gaussian Splatting animável = research; MetaHuman = melhor realismo mas overkill/pesado (fica para render); Avaturn/MetaPerson = bons mas com dependência de plataforma; marketplaces = risco de extração web. (Tabela §1.5.)

**4. Devemos trocar alguma ferramenta?**
**Não trocar — ajustar:** incluir **Blender como etapa obrigatória** (CC4 não tem glTF nativo) e **glTF-transform** na otimização. **AccuRig** permanece, com papel principal no **caminho de mesh custom** (futuro); para avatar autorado **em** CC4, usa-se o **CC rig nativo**.

**5. Podemos seguir para a produção?**
**Ainda não direto** — podemos seguir para **EXECUTAR o spike** (criar os 2 avatares + agachamento e olhar o resultado). A produção é **destravada pelo spike executado** passar no checklist visual §6. Pular o spike e ir à produção seria contrariar o propósito de "descobrir agora, não em meses".

**6. Se fosse seu projeto pessoal, você seguiria exatamente este pipeline?**
**Sim, com duas ressalvas que eu cravaria desde já:** (a) **um único skeleton** desde o primeiro avatar (senão a biblioteca de animação não reaproveita — é o erro que custa meses); (b) **posse do GLB** desde o dia 1 (nada de fundar o produto em serviço externo — a morte do RPM é a prova). Com isso, sim — é exatamente o que eu faria.

### Veredito VISUAL (PENDENTE — só a execução responde)
O carimbo **"parece premium: SIM/NÃO"** exige **olhar o avatar real**. Como este spike não cria asset, esse veredito fica **explicitamente em aberto** e é o **único** objetivo da execução. Os critérios de aprovação/reprovação (§2.4/§2.5/§3/§6) já estão definidos para que a execução seja um **GO/NO-GO objetivo**, sem achismo.

### Resultado desta etapa
✅ **APROVADO para EXECUTAR o spike.** O risco técnico está suficientemente baixo e os critérios objetivos estão fixados. Por isso, gero também o `ROADMAP_SPIKE_TO_PRODUCTION.md`, **com o spike executado como primeiro portão obrigatório** — nada avança sem ele passar.

---

## Apêndice — Fontes (jun/2026)
- CC4 → GLB via Blender (sem glTF nativo; gotchas shape keys/cc_blender_tools): [Convai forum](https://forum.convai.com/t/character-creator-4-blender-glb-gltf-export/4882), [Reallusion FeedBackTracker — glTF export support](https://www.reallusion.com/FeedBackTracker/Issue/glTF-export-support), [cc_blender_tools #230](https://github.com/soupday/cc_blender_tools/issues/230), [CG Cookie — GLB/GLTF pipeline](https://cgcookie.com/community/19153-export-of-animated-3d-web-assets-help-needed-with-glb-gltf-pipeline)
- R3F/Three.js mobile (Draco/KTX2/Meshopt/LOD, bones uniforms, crash de SkinnedMesh): [Krapton — R3F mobile 2026](https://www.krapton.com/blog/boosting-react-three-fiber-mobile-performance-in-2026-a-deep-dive-d6105c), [Utsubo — 100 Three.js tips 2026](https://www.utsubo.com/blog/threejs-best-practices-100-tips), [TechNet — SkinnedMesh mobile crash fix](https://www.technetexperts.com/react-three-fiber-skinnedmesh-mobile-fix/)
- Gaussian Splatting animável (research): [HuGS (arXiv 2311.17113)](https://arxiv.org/abs/2311.17113), [SplattingAvatar (HKUST-GZ)](https://cislab.hkust-gz.edu.cn/publications/splattingavatar-realistic-real-time-human-avatars-with-mesh-embedded-gaussian-splatting/), [WebGPU Gaussian Splatting](https://www.emergentmind.com/topics/webgpu-powered-gaussian-splatting)
- MetaHuman/MetaPerson na web: [Convai — avatares no browser com three.js](https://convai.com/blog/ai-avatars-inside-browser-threejs-react-convai-web-sdk-tutorial), [metaperson-loader-threejs](https://github.com/avatarsdk/metaperson-loader-threejs)
- Licenças (re-confirmação): [Reallusion License](https://www.reallusion.com/license/content.html), [AccuRIG](https://www.reallusion.com/auto-rig/accurig/), [RPM/Netflix — TechCrunch](https://techcrunch.com/2025/12/19/netflix-acquires-gaming-avatar-maker-ready-player-me/), [MetaHuman fora do Unreal — CG Channel](https://www.cgchannel.com/2025/06/you-can-now-sell-metahumans-or-use-them-in-unity-or-godot/)

*Fim — `GYMFLOW_MOTION_ENGINE_SPIKE_001.md`.*
