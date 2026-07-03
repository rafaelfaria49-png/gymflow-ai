# ROADMAP — Do Spike à Produção (GymFlow Motion Engine)

**Documento:** `docs/ROADMAP_SPIKE_TO_PRODUCTION.md`
**Gerado porque:** `GYMFLOW_MOTION_ENGINE_SPIKE_001.md` deu **veredito técnico APROVADO** para executar o spike (risco técnico baixo; critérios objetivos fixados).
**Pré-requisito absoluto:** cada etapa só começa quando a anterior **passa no seu portão**. Nada de pular o spike executado.

> Pipeline confirmado: **CC4 → Blender (cc_blender_tools) → glTF-transform (Draco/Meshopt + KTX2) → GLB → R3F/Three.js**. Skeleton único. Avatar de **posse própria**. Animação **própria** como fosso competitivo.

---

## Visão em uma tela

```
   ┌─────────────────────────────────────────────────────────────────┐
   │  E0  SPIKE EXECUTADO  ── portão visual GO/NO-GO ──────────────┐  │
   │      1 M + 1 F + agachamento em /poc-3d                       │  │
   └──────────────────────────────────────────────────────────────┘  │
                          │ (só passa se aprovado §6 do SPIKE)         │
                          ▼                                            │
   ┌──────────────────────────────────────────────────────────────┐  │
   │  E1  AVATAR DEFINITIVO   (refino dos 2 avatares oficiais)      │  │
   └──────────────────────────────────────────────────────────────┘  │
                          ▼                                            │
   ┌──────────────────────────────────────────────────────────────┐  │
   │  E2  SKELETON DEFINITIVO   (congelar SKELETON_001)            │  │
   └──────────────────────────────────────────────────────────────┘  │
                          ▼                                            │
   ┌──────────────────────────────────────────────────────────────┐  │
   │  E3  PRIMEIRAS 10 ANIMAÇÕES   (MOTION_LIB_010)                │  │
   └──────────────────────────────────────────────────────────────┘  │
                          ▼                                            │
   ┌──────────────────────────────────────────────────────────────┐  │
   │  E4  BIBLIOTECA COMPLETA   (50 → 100 → … exercícios)          │  │
   └──────────────────────────────────────────────────────────────┘  │
                          ▼                                            │
   ┌──────────────────────────────────────────────────────────────┐  │
   │  E5  INTEGRAÇÃO COM O GYMFLOW   (Vídeos, Ver Técnica, Treino…)│◀─┘
   └──────────────────────────────────────────────────────────────┘
```

---

## E0 — SPIKE EXECUTADO  *(o portão)*
**Objetivo:** responder "parece premium?" com pixels reais.
**Entregar:** `male.glb`, `female.glb`, `squat.glb` carregando em `/poc-3d`.
**Como:** CC4 (autorar 1 M + 1 F) → Blender (export glTF, **sem shape keys**) → glTF-transform (Draco + KTX2) → marcar `available:true` em `avatar-config.ts`.
**Portão (do SPIKE §2.4):** visual premium (≥2 avaliadores) + desktop ≥60 fps + mobile ≥30 fps + GLB ≤8 MB + ≤70 bones + carregamento dentro do alvo + skin/rig preservados.
**Se REPROVAR:** não seguir. Opções: ajustar material/luz/otimização (1 ciclo), ou reavaliar ferramenta (Avaturn/MetaPerson como plano B, ou custom no Blender). **Só some o NO-GO com nova execução aprovada.**
**Custo/esforço típico:** 1 artista, ~1–2 semanas. **Não compra cara**: CC4 trial/licença + AccuRig grátis + Blender grátis.
**Ação jurídica paralela:** obter **confirmação escrita da Reallusion** (uso "avatares embutidos servidos em web app").

## E1 — AVATAR DEFINITIVO
**Objetivo:** transformar os 2 avatares do spike nos **oficiais** de marca.
**Entregar:** M e F finais (arte aprovada §7 do SPEC), roupa fitness premium definitiva, texturas 2K KTX2, dentro do orçamento.
**Portão:** checklist de qualidade SPEC §14 + coesão M×F + posse do GLB confirmada.
**Decisão de arte:** refinar os do CC4 **ou** comissionar character artist — **sempre no mesmo rig**.

## E2 — SKELETON DEFINITIVO (`SKELETON_001`)
**Objetivo:** **congelar** o skeleton — agora que existe um rig validado (não no vácuo).
**Entregar:** `docs/skeletons/SKELETON_001.md` (lista fechada de bones, hierarquia, bind pose, eixo/escala, naming de clips/materiais) + **validador** de conformidade + contratos de asset (`avatar.contract`, `animation.contract`).
**Portão:** M e F passam no validador; 1 animação roda **idêntica** nos dois (prova de reuso). *(= sprint SPEC §18.)*
**Por que aqui e não antes:** o skeleton deve **derivar do rig** que o spike/E1 validaram (CC_Base/AccuRig conformado ao humanoide Mixamo-like). Congelar antes = retargeting e dor.

## E3 — PRIMEIRAS 10 ANIMAÇÕES (`MOTION_LIB_010`)
**Objetivo:** produzir os 10 clipes oficiais (SPEC §6): supino, agachamento, leg press, remada, puxada, desenvolvimento, rosca, tríceps corda, stiff, elevação pélvica.
**Como:** mocap (Move AI/Rokoko) → cleanup (Cascadeur/Blender) → glTF clips separados (reuso M/F) → otimizar.
**Portão:** cada clipe passa §5/§6 do SPEC (fases, loop suave, ROM correta, sem foot sliding) + **revisão biomecânica por profissional de Ed. Física** + roda nos 2 avatares.

## E4 — BIBLIOTECA COMPLETA
**Objetivo:** escalar 10 → **50 → 100 → …** exercícios.
**Como:** ondas (SPEC §16 F1–F2); LODs **obrigatórios**; lazy/streaming por categoria; mapear `exerciseId → clip` no catálogo real.
**Portão por onda:** orçamento de performance mantido em mobile; nenhum clipe sem aprovação biomecânica.

## E5 — INTEGRAÇÃO COM O GYMFLOW
**Objetivo:** substituir o visualizador 2D atual pela Engine, **atrás de uma flag**.
**Pontos (SPEC §12):** Vídeos → Ver Técnica → Treino ativo (mini preview) → Biblioteca → IA Coach → Fullscreen.
**Regras:** 1 `<Canvas>` por tela; listas com pôster estático + lazy; **API drop-in** (`GymFlowAvatarStage`/`MotionPlayerProps`) sem tocar `GymFlowContext`.
**Portão:** paridade com o componente antigo + performance em mobile + QA visual em cada ponto de uso.

---

## Princípios que valem em TODAS as etapas
1. **Posse do asset** — o GLB do avatar é seu; ferramentas são meios de produção, não dependências de runtime.
2. **Skeleton único** desde E1 — habilita reuso e custo marginal baixo.
3. **Honestidade de UI** — enquanto faltar asset em qualquer contexto, placeholder honesto (nunca "3D realista" sem avatar; nunca skeleton/wireframe/palito).
4. **Portão antes de avançar** — cada etapa tem GO/NO-GO objetivo; não se acumula dívida visual.
5. **Mobile é o gargalo** — toda decisão é validada no device mediano, não no desktop.

## Riscos por etapa (resumo)
| Etapa | Risco-chave | Mitigação |
|---|---|---|
| E0 | Visual reprova / não cabe no orçamento | 1 ciclo de ajuste; plano B Avaturn/MetaPerson/custom |
| E1 | Avatar "genérico CC4" sem identidade | refino/comissão + texturas próprias |
| E2 | Skeleton incompatível com animações | validador automático + bind pose única |
| E3 | Animação biomecanicamente errada | revisão por profissional + checklist §6 |
| E4 | Performance degrada ao escalar | LOD + lazy + orçamento por onda |
| E5 | Regressão em outros módulos | flag + API drop-in isolada + QA |

---

**Próximo passo imediato (aguardando autorização):** executar **E0** — autorar 1 M + 1 F + agachamento e carregar em `/poc-3d` para o GO/NO-GO visual. Nenhuma linha de código de produto muda nesse passo; só entram assets na pasta `public/assets/` e a flag `available:true` na config da POC.

*Fim — `ROADMAP_SPIKE_TO_PRODUCTION.md`.*
