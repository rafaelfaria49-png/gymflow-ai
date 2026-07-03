# Benchmark 2 — Avatares

Placar **por avatar gerado**. Preenchido a partir do JSON do analisador (`results/_auto/report-*.json`) + as notas visuais do `<nome>.meta.json`. **Não preencher à mão com chute** — copiar do relatório.

## Como popular
1. GLB em `drop/` → `node ../tools/analyze-glb.mjs`.
2. Copiar os números do relatório para a tabela abaixo.
3. Após revisar o visual, preencher `visual{}` no `.meta.json` e re-rodar (fecha o eixo visual).

## Placar (1 linha por avatar) — *aguardando GLBs reais*
| Avatar (arquivo) | Ferramenta | Sexo | Peso | Tris | Bones | Tex máx | Compress. | Final | Visual | Téc | Perf | Compat | Manut | Comerc | Portão |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

## "Champion Card" do líder atual — *aguardando dados*
- **Arquivo / ferramenta:** —
- **Nota final (2 eixos):** —
- **Passou nos portões?** —
- **Por que lidera:** — *(o analisador gera o "por que X lidera" quando há 2+ avatares)*
- **O que falta para ser definitivo:** nota visual humana + FPS no harness.

## Regra de ouro
O avatar campeão é o de **melhor equilíbrio** (`final` ponderada) **que passou em todos os portões** — não o de maior nota visual isolada. Um rosto lindo com FPS mobile < 30 ou peso > 8 MB **não vence**.
