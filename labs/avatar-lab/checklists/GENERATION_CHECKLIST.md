# Checklist — GERAÇÃO (o que fazer em cada ferramenta)

Use junto com `../results/STANDARD_PROMPT.md` (alvo idêntico p/ todas) e `../results/PROMPTS_PER_TOOL.md` (ajustes por ferramenta). Objetivo: gerar **comparável**.

## Antes de gerar
- [ ] Conta criada/logada na ferramenta (anotar **plano** e **licença do output**).
- [ ] Abrir o **prompt padrão** (EN) do `STANDARD_PROMPT.md`.
- [ ] Conferir ajustes específicos da ferramenta no `PROMPTS_PER_TOOL.md`.
- [ ] (Ferramentas image-to-3D) ter a **imagem de referência** pronta em `../results/_reference/`.

## Configurações (quando a ferramenta oferecer)
- [ ] Qualidade/detalhe: **máxima**.
- [ ] Poly target: mirar **≤60k tris** (ou o mais alto e otimizar depois — registrar o que foi usado).
- [ ] **Rig: ligado**, se houver opção.
- [ ] **PBR / texturas**: ligado, maior resolução razoável (≤4096).
- [ ] Pose: **A-pose/T-pose** neutra.
- [ ] Sem fundo/cenário embutido no avatar (cenário é asset separado).

## Gerar o par
- [ ] **Masculino** (prompt M) — gerar.
- [ ] **Feminino** (prompt F — trocar para "natural athletic woman, ~18-22% body fat, hair tied back").
- [ ] Se a ferramenta permitir variações, gerar 2–3 e escolher a melhor (anotar quantas tentativas).

## Capturar (obrigatório — 4 ângulos)
- [ ] Frente · [ ] 3/4 · [ ] **close do rosto** · [ ] **close das mãos**
- [ ] Salvar em `../results/<ferramenta>/` (ex.: `results/meshy/male_frente.png`).

## Anotar (vai pro `.meta.json`)
- [ ] Ferramenta + versão · plano · **licença** · custo · tempo de geração · nº de tentativas.
- [ ] Limitações já visíveis (mãos, rosto, roupa genérica, sem rig…).

> Próximo: `EXPORT_CHECKLIST.md`.
