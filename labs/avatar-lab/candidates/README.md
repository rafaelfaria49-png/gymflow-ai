# Avatar Candidate Factory — comparação de candidatos ao Kai

**Pasta:** `labs/avatar-lab/candidates/`
**Natureza:** Estrutura (documentação + esqueleto de pastas) para **receber, revisar e ranquear dezenas de candidatos** ao avatar masculino oficial **Kai**, vindos de diferentes ferramentas.
**Escopo:** apenas estrutura de laboratório. **Nenhum código, GLB, imagem, POC, Motion Engine, React, R3F ou Blender foi criado/alterado. Nenhuma documentação existente foi modificada.**

> **Fonte da verdade do alvo:** `docs/avatar-design/KAI_DNA_v1.md` (quem é o Kai) + `docs/avatar-design/KAI_MOODBOARD_v1.md` (como ele se parece). Esta pasta **não redefine o Kai** — ela só compara candidatos contra esse alvo.
>
> **Relação com o sistema existente do lab:** esta pasta é a **camada de review visual humano**. Ela **não substitui** `tools/rubric.json`, `tools/analyze-glb.mjs`, `checklists/` nem `results/` — ela **alimenta** o eixo visual/experiência-humana deles. Portões objetivos (peso, extensões, FPS, licença) continuam vindo do analisador e da `APPROVAL_CRITERIA.md`.

---

## Estrutura

```
candidates/
├── README.md                ← este arquivo
├── MASTER_RANKING.md         ← tabela única com todos os candidatos e notas
├── CHECKLIST_REVIEW.md       ← processo padrão de avaliação humana (passo a passo)
├── REVIEW_TEMPLATE.md        ← perguntas de análise visual (copiar p/ cada review.md)
├── SCORE_GUIDE.md            ← como pontuar exatamente cada critério (0–10) + status
│
├── _TEMPLATE/
│   └── candidate_XXX/         ← copiar esta pasta para criar um novo candidato
│       ├── meta.json          ← ficha do candidato (template, campos null)
│       └── review.md          ← review do candidato (template)
│
├── rodin/                    ← candidatos gerados no Rodin
│   ├── README.md
│   └── candidate_001/        ← 1º slot (vazio, aguardando asset)
│       ├── meta.json
│       └── review.md
├── meshy/                    ← idem (Meshy)
├── chatavatar/              ← idem (ChatAvatar)
└── cc5/                     ← idem (Character Creator 5)
```

### Arquivos esperados dentro de cada `candidate_NNN/`
| Arquivo | Quando | Observação |
|---|---|---|
| `avatar.glb` | **quando existir** | O modelo 3D. **Não é criado por este sprint** — é depositado pelo processo de geração. |
| `preview_front.png` | ao revisar | Captura frontal, corpo inteiro. |
| `preview_34.png` | ao revisar | Captura em 3/4 (hero shot). |
| `preview_face.png` | ao revisar | Close do rosto. |
| `preview_hands.png` | ao revisar | Close das mãos (teste de qualidade). |
| `meta.json` | sempre | Ficha: ferramenta, entrada, licença, presença de assets, **notas**, portões, status. |
| `review.md` | sempre | Análise visual escrita (cópia do `REVIEW_TEMPLATE.md`). |

> **Honestidade:** `avatar.glb` e os `.png` **não foram criados** aqui (este sprint é só estrutura). Em `meta.json`, cada asset tem `present: false` até ser realmente depositado. **Nunca** marcar `present: true` nem preencher nota sem o asset real na frente.

---

## Convenção de nomes
- Ferramenta = subpasta (`rodin/`, `meshy/`, `chatavatar/`, `cc5/`).
- Candidato = `candidate_NNN/` com 3 dígitos, sequencial **por ferramenta** (`candidate_001`, `candidate_002`, …).
- ID global no ranking = `<ferramenta>_candidate_NNN` (ex.: `rodin_candidate_002`).

## Fluxo de uso (resumo — detalhe em `CHECKLIST_REVIEW.md`)
1. **Gerar** o candidato na ferramenta (alvo = DNA/Moodboard) e **depositar** `avatar.glb` + 4 capturas em `<ferramenta>/candidate_NNN/` (copiar antes a pasta `_TEMPLATE/candidate_XXX/`).
2. **Objetivo:** rodar o analisador do lab (`tools/analyze-glb.mjs`) p/ peso/tris/bones/extensões/licença e portões objetivos.
3. **Visual humano:** abrir as 4 capturas + o GLB num viewer; pontuar pelo `SCORE_GUIDE.md`; escrever o `review.md`.
4. **Registrar:** preencher `meta.json` (assets, scores, gates, status) e **adicionar/atualizar a linha** no `MASTER_RANKING.md`.
5. **Decidir:** `APPROVED` / `REJECTED` conforme `SCORE_GUIDE.md` (+ decisão de produção A/B/C da `APPROVAL_CRITERIA.md`).

> Documentos irmãos: `../checklists/APPROVAL_CRITERIA.md` (portões/decisão A-B-C), `../results/STANDARD_PROMPT.md` (briefing idêntico p/ todas as ferramentas), `../experiments/TEST_CARD_TEMPLATE.md` (cartão de teste reproduzível).
