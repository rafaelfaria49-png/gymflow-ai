# PRODUCTION CHECKLIST — por candidato

Checklist operacional, usado **a cada geração** (dezenas de vezes). Um candidato = um passe completo. Use junto com `GENERATION_WORKFLOW.md`.

## Prompt a colar (fonte canônica — NÃO reescrever)
Os prompts já existem e estão consolidados. Sempre colar a partir da fonte; não criar prompt novo.

| Ferramenta | O que gerar | Fonte do prompt |
|---|---|---|
| **Rodin** | corpo inteiro M/F | `results/STANDARD_PROMPT.md §B` + ajuste em `results/PROMPTS_PER_TOOL.md → Rodin / Hyper3D` |
| **Rodin** (rosto) | só rosto/cabeça | `face-lab/PROMPTS_FACE.md` → `BASE_FACE` + 1 das 15 direções + `NEGATIVE` |
| **ChatAvatar** | rosto/cabeça (foco face) | `results/STANDARD_PROMPT.md §B` + `PROMPTS_PER_TOOL.md → ChatAvatar`; para rosto isolado → `face-lab/PROMPTS_FACE.md` |
| **Meshy** | corpo inteiro M/F | `results/STANDARD_PROMPT.md §B` + `PROMPTS_PER_TOOL.md → Meshy 6` |
| **Reference Humans** | — (garimpo de foto real) | sem prompt: alvo `docs/avatar-design/KAI_MOODBOARD_v1.md §3/§4` → salvar em `face-lab/reference/` |

## Checklist (marcar a cada candidato)
- ☐ Abrir a ferramenta (anotar plano + licença do output)
- ☐ Colar o prompt canônico (tabela acima — não reescrever)
- ☐ Alterar a seed / variação
- ☐ Gerar
- ☐ Exportar GLB
- ☐ Preview frontal
- ☐ Preview 3/4
- ☐ Preview rosto
- ☐ Preview mãos
- ☐ Copiar `_TEMPLATE/candidate_XXX/` → `<ferramenta>/candidate_NNN/`
- ☐ Depositar GLB + 4 previews na pasta do candidato
- ☐ Rodar o analyzer (`cd tools && node analyze-glb.mjs`)
- ☐ Preencher `meta.json` (entrada/prompt, licença, assets `present`, portões)
- ☐ Atualizar a fila (`PRODUCTION_QUEUE.md`: ☐→☑)
- ☐ Revisão humana → `review.md` + linha no ranking

> **Reference Humans:** pular GLB / analyzer / previews 3-4-mãos — basta a foto de referência em `face-lab/reference/` e marcar a linha na fila.
>
> **Honestidade:** marcar `present: true` e preencher nota **só com o asset real na frente**. Sem asset = `Status: PENDING`, célula `—`.
