# Candidatos — Meshy

Candidatos ao Kai gerados no **Meshy AI**. Modalidade típica: **text-to-3D** (também aceita image-to-3D).

## Como adicionar um candidato
1. Copiar `../_TEMPLATE/candidate_XXX/` para `./candidate_NNN/` (NNN sequencial: `001`, `002`, …).
2. Gerar no Meshy com o alvo de `../../results/STANDARD_PROMPT.md` (+ `docs/avatar-design/KAI_DNA_v1.md`/`KAI_MOODBOARD_v1.md`). Registrar o prompt exato em `meta.json → entrada`.
3. Depositar nesta pasta do candidato: `avatar.glb` (se exportado) + `preview_front.png`, `preview_34.png`, `preview_face.png`, `preview_hands.png`.
4. Avaliar pelo `../CHECKLIST_REVIEW.md`; pontuar pelo `../SCORE_GUIDE.md`; escrever `review.md`.
5. Preencher `meta.json` e adicionar/atualizar a linha em `../MASTER_RANKING.md` (ID `meshy_candidate_NNN`).

## Candidatos
- `candidate_001/` — slot vazio (aguardando asset). `Status: PENDING`.

> **Honestidade:** nenhum GLB/imagem foi criado por este sprint. Slots existem para **receber** assets reais; nota só com asset na frente.
