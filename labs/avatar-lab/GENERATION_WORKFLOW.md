# GENERATION WORKFLOW — fluxo oficial de produção

Fluxo único para produzir **um candidato** do Kai. Repetir para cada linha de `PRODUCTION_QUEUE.md`.

```
Gerar
  ↓
Salvar GLB
  ↓
Salvar 4 previews (frente · 3/4 · rosto · mãos)
  ↓
Depositar na pasta correta
  ↓
Executar analyze-glb
  ↓
Atualizar ranking
  ↓
Revisão humana
  ↓
Próximo candidato
```

## Os passos
1. **Gerar** — abrir a ferramenta, colar o prompt canônico, trocar a seed/variação. Detalhe operacional em `PRODUCTION_CHECKLIST.md`.
2. **Salvar GLB** — exportar `avatar.glb`. *(Reference Humans: só a foto, sem GLB.)*
3. **Salvar 4 previews** — `preview_front.png` · `preview_34.png` · `preview_face.png` · `preview_hands.png`.
4. **Depositar na pasta correta** — copiar antes `_TEMPLATE/candidate_XXX/` → `<ferramenta>/candidate_NNN/` e soltar GLB + previews. *(Reference Humans → `face-lab/reference/`.)*
5. **Executar analyze-glb** — `cd tools && node analyze-glb.mjs` → dados objetivos (peso/tris/bones/extensões/licença) em `results/_auto/`.
6. **Atualizar ranking** — marcar a linha em `PRODUCTION_QUEUE.md` (☐→☑) e adicionar/atualizar a linha em `candidates/MASTER_RANKING.md` (ou `face-lab/FACE_RANKING.md` para rosto).
7. **Revisão humana** — pontuar pelo `candidates/SCORE_GUIDE.md` (ou `face-lab/FACE_SCORE_GUIDE.md`), escrever `review.md`, preencher `meta.json`.
8. **Próximo candidato** — voltar ao topo com a próxima linha da fila.

> **Honestidade (inegociável):** o lab **não gera** imagens nem GLBs — a geração é feita por você nas ferramentas. **Nota só com o asset real na frente.** Nada de score/FPS/vencedor inventado; o que não foi medido fica `null` / `—`.
