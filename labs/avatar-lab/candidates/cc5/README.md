# Candidatos — Character Creator 5 (CC5)

Candidatos ao Kai produzidos no **Character Creator 5** (Reallusion), incl. **Headshot** (foto → cabeça). Modalidade típica: **image-to-avatar / montagem manual**.

## Como adicionar um candidato
1. Copiar `../_TEMPLATE/candidate_XXX/` para `./candidate_NNN/` (NNN sequencial: `001`, `002`, …).
2. Produzir no CC5 com o alvo de `../../results/STANDARD_PROMPT.md` (+ `docs/avatar-design/KAI_DNA_v1.md`/`KAI_MOODBOARD_v1.md`). Para entrada por imagem, usar **a mesma referência** descrita no `STANDARD_PROMPT.md §C`. Registrar a entrada em `meta.json → entrada`.
3. Depositar nesta pasta do candidato: `avatar.glb` (export GLB; CC5 também exporta FBX) + `preview_front.png`, `preview_34.png`, `preview_face.png`, `preview_hands.png`.
4. Avaliar pelo `../CHECKLIST_REVIEW.md`; pontuar pelo `../SCORE_GUIDE.md`; escrever `review.md`.
5. Preencher `meta.json` e adicionar/atualizar a linha em `../MASTER_RANKING.md` (ID `cc5_candidate_NNN`).

> **Atenção à licença:** ferramentas com EULA própria (ex.: CC5/ActorCore) exigem **comprovar por escrito** a permissão de **embed web** (`../../checklists/APPROVAL_CRITERIA.md` / `../../benchmarks/BENCHMARK_LICENSES.md`). Licença duvidosa = portão eliminatório.

## Candidatos
- `candidate_001/` — slot vazio (aguardando asset). `Status: PENDING`.

> **Honestidade:** nenhum GLB/imagem foi criado por este sprint. Slots existem para **receber** assets reais; nota só com asset na frente.
