# batch-002/ — 2ª leva (refinamento das direções fortes)

Segunda rodada: pegar as **direções mais fortes** que saíram da `../batch-001/` (segundo o `../FACE_RANKING.md`) e **refinar** — variações finas em torno do que funcionou, não exploração nova do zero.

## Quando usar
- Só **depois** de a `batch-001/` ter rostos reais avaliados e ranqueados.
- Foco: estreitar a busca. Ex.: se "F08-calmo" e "F14-natural" lideram, gerar variações combinando/ajustando essas direções (micro-deltas), mantendo o **mesmo isolamento** (corpo/roupa/luz constantes).

## Convenção
- Igual à `batch-001/`: copiar `../_TEMPLATE/face_XXX/` para `./face_NNN/`, numeração sequencial continuando a global do ranking.
- Registrar no `meta.json → entrada.notas` de qual direção da batch-001 este refinamento deriva.

> **Honestidade:** não pré-encher esta pasta. Refinamento só faz sentido com resultados reais da batch-001 em mãos. Pasta inicia vazia.
