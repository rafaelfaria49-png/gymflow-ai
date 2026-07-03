# GYMFLOW AVATAR LAB — RESULTS v01 (E0.5 · Testes Reais)

**Documento:** `labs/avatar-lab/results/GYMFLOW_AVATAR_LAB_RESULTS_v01.md`
**Escopo:** só dentro de `labs/avatar-lab/`. Não toca GymFlow AI / Motion Engine / POC.

---

## ⚠️ STATUS DESTE DOCUMENTO: AGUARDANDO OS PRIMEIROS GLBs

> **Honestidade primeiro (princípio do projeto):** este arquivo está **estruturado e pronto para receber dados reais**, mas **NENHUMA célula de resultado foi preenchida com dado fabricado**. As tabelas abaixo estão com `—` (vazias) até os GLBs reais entrarem no pipeline.
>
> **Estratégia "você gera, eu analiso" (jun/2026):** o lab **não depende de navegador**. Você gera/baixa os GLBs e os coloca em [`../drop/`](../drop/); o analisador [`../tools/analyze-glb.mjs`](../tools/analyze-glb.mjs) preenche **automaticamente** as colunas objetivas (peso, tris, bones, textura, compressão, extensões, compatibilidade) e calcula as notas por eixo. As colunas que exigem **olhos** (visual) ou **render** (FPS) você preenche no `<nome>.meta.json` — nunca são inventadas.
>
> O que **já é real** aqui: o apparato completo (analisador testado, rubrica, 11 benchmarks, checklists), o prompt padrão (`STANDARD_PROMPT.md`) e os prompts por ferramenta (`PROMPTS_PER_TOOL.md`). As previsões da pesquisa (`LAB_001`) seguem **rotuladas como PREVISÃO** — não são resultado; só priorizam a ordem dos testes.

---

## FASE 1 — Ferramentas selecionadas para testar (real)

| # | Ferramenta | Modalidade | Free tier p/ 1º teste? | Como executar |
|---|---|---|---|---|
| 1 | **CC5 + Headshot 3 + AccuRig** | Desktop (imagem/texto→rigado) | ❌ (licença + install) | Desktop; precisa licença Reallusion |
| 2 | **Meshy AI** | Web (texto/imagem→3D) | ✅ (free = CC BY 4.0 público) | Navegador + conta |
| 3 | **Tripo AI** | Web (texto/imagem→3D) | ⚠️ (free **sem uso comercial**) | Navegador + conta |
| 4 | **Tencent Hunyuan 3D** | Web/host (imagem→3D) | ✅ (demo) | Navegador/HF Space |
| 5 | **MetaPerson (Avatar SDK)** | Web (foto→avatar) | ✅ (limitado) | Navegador + conta |
| 6 | **Avaturn** | Web (foto→avatar) | ✅ (limitado) | Navegador + conta |
| 7 | **Rodin / ChatAvatar** (extra competitiva) | Web (texto/imagem→3D; face) | ⚠️ (tiers) | Navegador + conta |

> Ordem de teste sugerida (custo↑, esforço↑): **Meshy → Hunyuan (demo) → Avaturn → MetaPerson → Tripo → Rodin/ChatAvatar → CC5+Headshot 3** (este último por último, pois é o de maior fricção e — pela pesquisa — provável vencedor para uso oficial).

---

## FASE 2 — Prompt padrão
✅ Pronto e real: ver [`STANDARD_PROMPT.md`](STANDARD_PROMPT.md). Idêntico para todas; entrada por texto **ou** imagem de referência única.

---

## FASE 3 — Resultados gerados (1 pasta por ferramenta)

> Preencher ao executar. Capturas em `results/<ferramenta>/`. Test Card por ferramenta (`../experiments/TEST_CARD_TEMPLATE.md`).

| Ferramenta | Imagem/preview | Qualidade | Facilidade | Limitações | Exportação | Licença | Custo |
|---|---|---|---|---|---|---|---|
| CC5 + Headshot 3 | — | — | — | — | — | — | — |
| Meshy AI | — | — | — | — | — | — | — |
| Tripo AI | — | — | — | — | — | — | — |
| Hunyuan 3D | — | — | — | — | — | — | — |
| MetaPerson | — | — | — | — | — | — | — |
| Avaturn | — | — | — | — | — | — | — |
| Rodin / ChatAvatar | — | — | — | — | — | — | — |

---

## FASE 4 — Comparação (notas 0–10) — *aguardando dados reais*

| Ferramenta | Visual | Realismo | Rosto | Mãos | Pele | Olhos | Roupa | Anatomia | Performance | Facilidade | Export GLB | Licença | **Nota final** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| CC5 + Headshot 3 | — | — | — | — | — | — | — | — | — | — | — | — | **—** |
| Meshy AI | — | — | — | — | — | — | — | — | — | — | — | — | **—** |
| Tripo AI | — | — | — | — | — | — | — | — | — | — | — | — | **—** |
| Hunyuan 3D | — | — | — | — | — | — | — | — | — | — | — | — | **—** |
| MetaPerson | — | — | — | — | — | — | — | — | — | — | — | — | **—** |
| Avaturn | — | — | — | — | — | — | — | — | — | — | — | — | **—** |
| Rodin / ChatAvatar | — | — | — | — | — | — | — | — | — | — | — | — | **—** |

---

## FASE 4.5 — Viabilidade técnica / Integração com o GymFlow AI (EIXO 2) — *aguardando dados reais*

> A pedido: o vencedor é julgado em **2 eixos** — não só beleza. Notas 0–10.

| Ferramenta | Peso GLB | Carreg. (TTFR) | FPS desktop | FPS mobile | Facil. export | Qual. rig | Qual. animações | Compat. R3F | Compat. Three.js | Facil. updates | **VT final** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| CC5 + Headshot 3 | — | — | — | — | — | — | — | — | — | — | **—** |
| Meshy AI | — | — | — | — | — | — | — | — | — | — | **—** |
| Tripo AI | — | — | — | — | — | — | — | — | — | — | **—** |
| Hunyuan 3D | — | — | — | — | — | — | — | — | — | — | **—** |
| MetaPerson | — | — | — | — | — | — | — | — | — | — | **—** |
| Avaturn | — | — | — | — | — | — | — | — | — | — | **—** |
| Rodin / ChatAvatar | — | — | — | — | — | — | — | — | — | — | **—** |

**Alvos objetivos (SPEC/E0):** peso ≤6 MB ideal / ≤8 MB teto · desktop ≥60 fps · mobile ≥30 fps · ≤70 bones · ≤60k tris · carregamento dentro do alvo do SPIKE.

---

## MODELO DE DECISÃO EM 3 EIXOS (como o vencedor é escolhido)

> *"O laboratório não escolhe o avatar mais bonito; escolhe o melhor TREINADOR VIRTUAL."*

- **Eixo 1 — 🔧 Técnico (50%):** objetivo, dos bytes — média ponderada de Técnica/Performance/Compatibilidade/Manutenção (`analyze-glb`).
- **Eixo 2 — 👁️ Visual (30%):** humano — nota `visual.geral` do sidecar (realismo/rosto/mãos/pele…).
- **Eixo 3 — 🤝 Experiência Humana (20%):** humano — média dos 8 critérios (empatia, credibilidade, naturalidade corporal, movimento, mãos, expressão facial, premium, identificação).
- **Nota final = 50% Técnico + 30% Visual + 20% Experiência Humana** *(pesos em `tools/rubric.json → macroWeights`)*.

### Portões eliminatórios (reprovam, independentemente da média)
- **NOVO — os 3 eixos:** Técnico < 8.5 **ou** Visual < 8.5 **ou** Experiência Humana < 8.5 → reprovado.
- **Visual (detalhe):** Mãos < 6 **ou** Rosto < 6.
- **Físico:** FPS mobile < 30 · peso GLB > 8 MB · não carrega/anima em R3F/Three.js · rig não conforma ao skeleton único · extensão obrigatória não suportada.

> **Consequência prática:** um avatar lindíssimo mas sem empatia/credibilidade (não dá vontade de "treinar com ele todo dia") **não vence**. Idem um avatar carismático mas pesado/sem rig. Só vence quem passa **nos três eixos**.

---

## FASE 5 — Ranking — *aguardando dados reais*
1. º — …
2. º — …
3. º — …
*(preencher com o porquê de cada posição, com base nas capturas reais)*

## FASE 6 — Vencedor — *aguardando dados reais*
> Escolhido pela **nota final em 2 eixos** (QV + VT), respeitando os portões eliminatórios — **não** pelo simples "mais bonito".
> "Este será o ponto de partida oficial do GymFlow AI: __________." *(a preencher só após ver os resultados reais e medir a viabilidade técnica)*

## FASE 7 — Plano de refinamento (% trabalho humano) — *aguardando dados reais*
| Aspecto | % humano restante | Nota |
|---|:--:|---|
| Rosto | — | |
| Mãos | — | |
| Roupa | — | |
| Rig | — | |
| Texturas | — | |
| Biomecânica | — | |

## FASE 8 — Plano de produção (A/B/C) — *aguardando dados reais*
- A) Usar o avatar da IA como está · B) IA como base + artista finaliza · C) Descartar IA
- **Decisão:** — *(justificar tecnicamente após os testes)*

## FASE 9 — Critério de sucesso
> APROVADO só se a equipe disser: **"Eu pagaria por um app que usa esse personagem."**
> REPROVADO se parecer boneco / cartoon / videogame barato / IA mal acabada / estranho / mãos ruins / rosto artificial.
> **Veredito:** ⏳ não avaliável sem os pixels reais.

---

## FASE 10 — Respostas finais

> ⚠️ **Distinção honesta:** abaixo, **"RESPOSTA REAL"** só pode ser dada após a execução. Forneço a **"PREVISÃO (da pesquisa LAB_001)"** apenas para orientar — **não é resultado**.

**1. Qual ferramenta venceu?**
- RESPOSTA REAL: ⏳ aguardando testes.
- PREVISÃO: para **uso oficial**, **CC5 + Headshot 3** (topologia/rig limpos + licença web embed). Para **realismo facial bruto**, **ChatAvatar**. Para **base rápida grátis**, **Meshy/Hunyuan**. *Confirmar com pixels.*

**2. Quanto trabalho humano ainda será necessário?**
- RESPOSTA REAL: ⏳.
- PREVISÃO (LAB_001): mãos e biomecânica seguem ~majoritariamente humanas; rosto/base caem bastante com IA. *Quantificar só vendo o output.*

**3. Vale a pena usar IA?**
- RESPOSTA REAL: ⏳.
- PREVISÃO: sim, **como acelerador** (não substituto) — confirmação depende dos testes.

**4. Quanto dinheiro estimamos economizar?**
- RESPOSTA REAL: ⏳ (depende de quanto a IA reduz as horas humanas medidas nos testes).
- PREVISÃO: se a IA cortar a base/rig, o pacote pode cair da faixa "modelagem do zero" para "finalização" (potencial economia relevante vs. `HIRING_001`). *Número só com horas reais.*

**5. Você seguiria este caminho se fosse CTO?**
- RESPOSTA REAL: ⏳.
- PREVISÃO: sim — pipeline híbrido —, **mas exijo ver os pixels antes de comprometer a marca.** É exatamente o que este E0.5 existe para descobrir.

---

## Como destravar a execução (passo a passo, sem navegador)
1. Gere o par M+F numa ferramenta (comece pelo **Meshy** — `../results/PROMPTS_PER_TOOL.md`).
2. Baixe o **`.glb`** e coloque em [`../drop/`](../drop/) com o nome `gymflow_<sexo>_<ferramenta>.glb`.
3. Copie `../drop/_TEMPLATE.meta.json` → `<nome>.meta.json` e preencha ferramenta/plano/**licença**/custo.
4. Rode: `cd ../tools && node analyze-glb.mjs` → relatório objetivo em `_auto/`.
5. Olhe as capturas, preencha `visual{}` no `.meta.json`, re-rode → fecha o eixo visual.
6. Me entregue os GLBs/relatórios e eu consolido ranking + "por que X vence" aqui.
> Detalhes em `../checklists/` (geração → exportação → avaliação → aprovação).

*Fim — `GYMFLOW_AVATAR_LAB_RESULTS_v01.md` (scaffold, aguardando os primeiros GLBs).*
