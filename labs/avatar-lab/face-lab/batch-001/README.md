# batch-001/ — 1ª leva de rostos gerados

Primeira rodada de geração: **explorar as 15 direções** de `../PROMPTS_FACE.md`, uma a uma, para descobrir quais rostos representam melhor o Kai.

## Convenção
- Um candidato = uma pasta `face_NNN/` (3 dígitos, sequencial: `face_001`, `face_002`, …).
- Copiar `../_TEMPLATE/face_XXX/` para `./face_NNN/` antes de depositar.
- ID global no ranking = `face_NNN` (ex.: `face_007`).
- Registrar a direção usada no `meta.json → entrada.prompt_id` (ex.: `F07-funcional`).

## Assets esperados dentro de cada `face_NNN/`
| Arquivo | Quando | Observação |
|---|---|---|
| `preview_front.png` | ao revisar | Rosto frontal (busto/ombros). |
| `preview_34.png` | ao revisar | Rosto em 3/4. |
| `preview_closeup.png` | ao revisar | Close (olhos/pele) — teste dos 3 segundos. |
| `face.glb` | se exportado | Cabeça em GLB (opcional nesta fase). Roda `../../tools/analyze-glb.mjs` p/ dados técnicos **informativos**. |
| `meta.json` | sempre | Ficha do rosto (ferramenta, direção, scores, gates, status). |
| `review.md` | sempre | Review escrita (cópia de `../FACE_REVIEW_TEMPLATE.md`). |

## Meta da leva
- Cobrir as 15 direções (idealmente 1+ candidato por direção).
- Ao final, ranquear em `../FACE_RANKING.md` e identificar as **direções fortes** (não vencedores definitivos) para refinar em `../batch-002/`.

> **Honestidade:** nenhum GLB/imagem criado por este sprint. Nota só com asset real na frente; sem asset = `PENDING`. Pasta inicia vazia.
