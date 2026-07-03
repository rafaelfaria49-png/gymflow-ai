# Candidatos — ChatAvatar

Candidatos ao Kai gerados no **ChatAvatar** (Deemos). Modalidade típica: **text-to-3D / image-to-3D** com foco em **rosto/cabeça** fotorrealista (avaliar com atenção redobrada a Face/Skin/Hair).

## Como adicionar um candidato
1. Copiar `../_TEMPLATE/candidate_XXX/` para `./candidate_NNN/` (NNN sequencial: `001`, `002`, …).
2. Gerar no ChatAvatar com o alvo de `../../results/STANDARD_PROMPT.md` (+ `docs/avatar-design/KAI_DNA_v1.md`/`KAI_MOODBOARD_v1.md`). Registrar o prompt/imagem exatos em `meta.json → entrada`.
3. Depositar nesta pasta do candidato: `avatar.glb` (se exportado) + `preview_front.png`, `preview_34.png`, `preview_face.png`, `preview_hands.png`.
4. Avaliar pelo `../CHECKLIST_REVIEW.md`; pontuar pelo `../SCORE_GUIDE.md`; escrever `review.md`.
5. Preencher `meta.json` e adicionar/atualizar a linha em `../MASTER_RANKING.md` (ID `chatavatar_candidate_NNN`).

> **Nota de escopo:** se o output for só cabeça/busto (sem corpo/mãos), pontue `body`/`hands` apenas se visíveis; senão, deixe `null` e registre em `notas` — não inventar nota de algo ausente.

## Candidatos
- `candidate_001/` — slot vazio (aguardando asset). `Status: PENDING`.

> **Honestidade:** nenhum GLB/imagem foi criado por este sprint. Slots existem para **receber** assets reais; nota só com asset na frente.
