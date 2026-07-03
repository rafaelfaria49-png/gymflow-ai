# Candidatos — Rodin

Candidatos ao Kai gerados no **Rodin** (Hyper3D Rodin). Modalidade típica: **text-to-3D** (também aceita image-to-3D).

## Como adicionar um candidato
1. Copiar `../_TEMPLATE/candidate_XXX/` para `./candidate_NNN/` (NNN sequencial: `001`, `002`, …).
2. Gerar no Rodin com o alvo de `../../results/STANDARD_PROMPT.md` (+ `docs/avatar-design/KAI_DNA_v1.md`/`KAI_MOODBOARD_v1.md`). Registrar o prompt exato em `meta.json → entrada`.
3. Depositar nesta pasta do candidato: `avatar.glb` (se exportado) + `preview_front.png`, `preview_34.png`, `preview_face.png`, `preview_hands.png`.
4. Avaliar pelo `../CHECKLIST_REVIEW.md`; pontuar pelo `../SCORE_GUIDE.md`; escrever `review.md`.
5. Preencher `meta.json` e adicionar/atualizar a linha em `../MASTER_RANKING.md` (ID `rodin_candidate_NNN`).

## Candidatos
- `candidate_001/` — slot vazio (aguardando asset). `Status: PENDING`. Variação prevista: oval-square, cabelo curto, stubble 3–5mm.
- `candidate_002/` — slot vazio (aguardando asset). `Status: PENDING`. Variação prevista: clean-shaven, mandíbula mais forte, cabelo cropado.
- `candidate_003/` — slot vazio (aguardando asset). `Status: PENDING`. Variação prevista: ~12% bf, cabelo médio texturizado, leve barba.
- `candidate_004/` — slot vazio (aguardando asset). `Status: PENDING`. Variação prevista: ponta larga do 8/10, buzz cut, barba curta cheia.
- `candidate_005/` — slot vazio (aguardando asset). `Status: PENDING`. Variação prevista: pele Fitzpatrick IV, risca lateral, clean-shaven.

> **Honestidade:** nenhum GLB/imagem foi criado por este sprint. Slots existem para **receber** assets reais; nota só com asset na frente.
