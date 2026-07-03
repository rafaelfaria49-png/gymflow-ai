# KAI FACE LAB — laboratório independente do rosto

**Pasta:** `labs/avatar-lab/face-lab/`
**Natureza:** Estrutura (documentação + esqueleto de pastas) para **gerar, comparar e ranquear rostos** candidatos ao Kai — de forma **isolada do corpo e da roupa**.
**Objetivo desta fase:** **NÃO** criar o Kai definitivo. O objetivo é **descobrir qual rosto representa melhor o Kai**.
**Escopo:** apenas estrutura de laboratório e prompts em texto. **Nenhuma linha de código, asset, GLB, imagem, POC, Motion Engine, React, R3F ou Blender foi criada ou alterada. Nenhuma documentação existente foi modificada.**

> **Fonte da verdade do alvo (não redefinida aqui):**
> - `docs/avatar-design/KAI_DNA_v1.md` **§3 (Face)** e **§4 (Pele)** — quem é o rosto do Kai.
> - `docs/avatar-design/KAI_MOODBOARD_v1.md` **§3 (Face)** e **§4 (Pele)** — como o rosto se parece em foto.
>
> Este lab **não cria identidade nova**. Ele só explora variações **dentro** do envelope travado por essas seções e compara candidatos contra esse alvo.

---

## Por que um Face Lab separado

A `candidates/` (Candidate Factory) avalia o **avatar inteiro** (rosto + corpo + mãos + pele + cabelo + roupa). Mas o rosto é o item que faz ou quebra a confiança — e ele tem **direções de design próprias** que não dependem do corpo nem da roupa.

Este lab **separa completamente** os três eixos:

| Eixo | Onde vive | O que se avalia |
|---|---|---|
| **Rosto** | **`face-lab/` (aqui)** | Só o rosto/cabeça: traços, expressão, pele do rosto, identidade. **Corpo e roupa são neutros e constantes** — não entram na nota. |
| **Corpo** | `candidates/` (eixos Body, Naturalness) | Anatomia, escala 8/10, proporção. |
| **Roupa** | `candidates/` (eixo Clothes) | Identidade GymFlow, tecido, marca. |

> **Regra de isolamento:** no Face Lab, **a única variável é o rosto.** Todo prompt usa o **mesmo** enquadramento (busto/ombros), a **mesma** luz, o **mesmo** fundo, a **mesma** gola neutra sem marca. Assim a comparação é justa — o que muda entre dois candidatos é **só o rosto**, nunca a embalagem.

---

## O que este lab REUSA (não recria)

| Recurso existente | Como o Face Lab o usa |
|---|---|
| `docs/avatar-design/KAI_DNA_v1.md §3/§4` | Alvo travado do rosto e da pele. Toda variação acontece **dentro** dele. |
| `docs/avatar-design/KAI_MOODBOARD_v1.md §3/§4/§6` | Vocabulário visual e palavras-chave de rosto/pele/luz; lista "nunca usar" (§8) vira *negative prompt*. |
| `candidates/SCORE_GUIDE.md` | **Banda geral de qualidade 0–10**, princípio "na dúvida, nota menor", regra de honestidade. O `FACE_SCORE_GUIDE.md` daqui **herda** essa banda e só especializa os 10 critérios de rosto. |
| `candidates/REVIEW_TEMPLATE.md` (§2 Face, §3 Pele) | Base das perguntas de rosto. O `FACE_REVIEW_TEMPLATE.md` daqui é o recorte de rosto/pele dele. |
| `candidates/MASTER_RANKING.md` | Modelo do ranking. O `FACE_RANKING.md` daqui é o mesmo formato, só com os 10 eixos de rosto. |
| `tools/analyze-glb.mjs` + `tools/rubric.json` | Quando um **GLB de cabeça** for depositado, roda o analisador para peso/tris/bones/extensões. No Face Lab esses números são **informativos** (a malha final será finalizada em CC5/Blender); a decisão principal é o **rosto visto**. |
| `candidates/_TEMPLATE` + `drop/_TEMPLATE.meta.json` | Convenção de `meta.json` (campos `null`, `present:false`, nada inventado). O `_TEMPLATE/face_XXX/meta.json` daqui segue a mesma convenção. |

---

## Estrutura

```
face-lab/
├── README.md                ← este arquivo (hub)
├── PROMPTS_FACE.md           ← base constante + 15 prompts (direções de rosto)
├── FACE_SCORE_GUIDE.md       ← os 10 critérios de rosto (0–10) + Overall + status + portões
├── FACE_REVIEW_TEMPLATE.md   ← review só de rosto (copiar p/ cada candidato)
├── FACE_RANKING.md           ← tabela única dos rostos, ordenada por Overall
│
├── _TEMPLATE/
│   └── face_XXX/             ← copiar p/ criar um candidato de rosto
│       ├── meta.json         ← ficha do rosto (10 eixos, campos null)
│       └── review.md         ← cópia do FACE_REVIEW_TEMPLATE
│
├── reference/               ← imagens de referência humana (garimpo) — alvo do olho
├── batch-001/               ← 1ª leva de rostos gerados (face_001, face_002, …)
├── batch-002/               ← 2ª leva (refinamento das direções vencedoras)
├── review/                  ← rostos em avaliação no momento
├── approved/                ← rostos aprovados (passaram portões + Overall ≥ 8.5)
└── rejected/                ← rostos reprovados (com o motivo registrado)
```

> Cada subpasta tem um `README.md` curto explicando seu papel. Pastas começam **vazias de assets** — é honesto e esperado.

---

## Pipeline (fluxo de uma ponta a outra)

1. **Referência** — garimpar fotos de rosto humano real (alvo `MOODBOARD §3/§4`) em `reference/`. Servem de âncora visual ao avaliar (não são geradas aqui).
2. **Gerar** — escolher uma das 15 direções em `PROMPTS_FACE.md`, montar `BASE_FACE + delta da direção + NEGATIVE`, gerar no Rodin / ChatAvatar / outra IA. **Este lab não gera imagens nem GLBs.**
3. **Depositar** — copiar `_TEMPLATE/face_XXX/` para `batch-001/face_NNN/`, soltar os assets reais (`face.glb` se houver + `preview_front.png`, `preview_34.png`, `preview_closeup.png`) e registrar a direção/prompt no `meta.json`.
4. **(Opcional, se houver GLB)** rodar `../tools/analyze-glb.mjs` p/ dados técnicos da cabeça — **informativos** nesta fase.
5. **Avaliar** — pelo `FACE_SCORE_GUIDE.md`, pontuar os **10 critérios** e escrever o `review.md`. Mover o candidato para `review/` enquanto avalia.
6. **Registrar** — preencher `meta.json` (scores, gates, status) e a linha em `FACE_RANKING.md`.
7. **Decidir** — `approved/` (portões ok + Overall ≥ 8.5) ou `rejected/` (com motivo). As direções fortes alimentam a `batch-002/` (refinamento).

---

## Critérios de avaliação (os 10 eixos de rosto)

Definidos em detalhe no `FACE_SCORE_GUIDE.md`. Cada rosto recebe nota **0–10** em:

`confiança` · `simpatia` · `naturalidade` · `maturidade` · `profissionalismo` · `energia` · `credibilidade` · `aparência premium` · `treinador` · `memorabilidade`

> **Portões de rosto** (reprovam sozinhos): **naturalidade < 6** (uncanny) e **cara de celebridade reconhecível** (proíbe identidade emprestada — `KAI_DNA §7.3`).

---

## Regras de honestidade (inegociáveis — herdadas do projeto)

- **Nunca** preencher nota sem o rosto real (GLB/captura) na frente. Sem asset = `Status: PENDING`.
- **Nunca** declarar um vencedor antecipado. "Nenhum aprovado ainda" é honesto e esperado.
- Notas `0–10`; célula vazia/`—` = não avaliado. `Overall`/`Status` **derivam** das notas + portões, não de opinião.
- Nada de FPS, peso, score ou avatar inventado. O que não foi medido fica `null`.

---

## Status do documento

**KAI FACE LAB — v1.** Estrutura de laboratório de rosto, derivada de `KAI_DNA_v1 §3/§4` e `KAI_MOODBOARD_v1 §3/§4`, reusando a pipeline de review da `candidates/`. Nenhum código/asset/imagem criado.

*Fim — `labs/avatar-lab/face-lab/README.md`.*
