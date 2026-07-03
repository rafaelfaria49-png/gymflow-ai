# FACE RANKING — rostos candidatos ao Kai

**Tabela única** com **todos** os rostos de **todas** as ferramentas, ordenada por `Overall` (maior → menor). Fonte de notas: avaliação humana segundo `FACE_SCORE_GUIDE.md`, registrada em cada `meta.json`. Mesmo formato do `../candidates/MASTER_RANKING.md`, especializado nos **10 critérios de rosto**.

> **Regras de honestidade (inegociáveis):**
> - **Nunca** inserir uma linha com notas sem ter as capturas/GLB reais do rosto na frente. Sem asset = sem nota = `Status: PENDING`.
> - Notas são `0–10`; célula vazia/`—` = ainda não avaliado.
> - `Overall` e `Status` **derivam** das notas + portões (ver `FACE_SCORE_GUIDE.md`); não são opinião solta.
> - **Nada de vencedor antecipado.** "Nenhum candidato ainda" é um estado honesto e esperado.

## Legenda das colunas
`ID` rosto (`face_NNN`) · `Dir` direção/prompt (`FNN-nome`) · `Ferr` ferramenta · `Conf` confiança · `Simp` simpatia · `Nat` naturalidade *(portão <6)* · `Mat` maturidade · `Prof` profissionalismo · `Ener` energia · `Cred` credibilidade · `Prem` aparência premium · `Trein` treinador · `Mem` memorabilidade *(portão de identidade)* · `Overall` nota final ponderada · `Status` **APPROVED / REJECTED / PENDING**.

> `Nat` (naturalidade) e identidade (`Mem` = cara de celebridade) são **portões**: ver `FACE_SCORE_GUIDE.md → Portões`.

## Ranking
| ID | Dir | Ferr | Conf | Simp | Nat | Mat | Prof | Ener | Cred | Prem | Trein | Mem | Overall | Status |
|---|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| _(nenhum rosto gerado/avaliado ainda)_ | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

> Ao gerar e revisar um rosto, **substituir a linha placeholder** por linhas reais (`face_001`, `face_002`, …), preencher as notas, calcular `Overall` pela fórmula do `FACE_SCORE_GUIDE.md` e reordenar por `Overall`.

## Resumo por direção (preencher conforme avança)
| Direção | Candidatos | Avaliados | Aprovados | Melhor Overall |
|---|:--:|:--:|:--:|:--:|
| F01-amigável | 0 | 0 | 0 | — |
| F02-maduro | 0 | 0 | 0 | — |
| F03-técnico | 0 | 0 | 0 | — |
| F04-inspirador | 0 | 0 | 0 | — |
| F05-premium | 0 | 0 | 0 | — |
| F06-esportivo | 0 | 0 | 0 | — |
| F07-funcional | 0 | 0 | 0 | — |
| F08-calmo | 0 | 0 | 0 | — |
| F09-disciplinado | 0 | 0 | 0 | — |
| F10-moderno | 0 | 0 | 0 | — |
| F11-energia-alta | 0 | 0 | 0 | — |
| F12-minimalista | 0 | 0 | 0 | — |
| F13-confiante | 0 | 0 | 0 | — |
| F14-natural | 0 | 0 | 0 | — |
| F15-elite | 0 | 0 | 0 | — |

## Líder atual
**—** (nenhum rosto avaliado ainda.)

> O líder definitivo só é declarado com nota visual humana real registrada **+** (quando aplicável) dados objetivos do GLB de cabeça e licença confirmada. Até lá, o ranking é **provisório**. Direções fortes alimentam a `batch-002/` (refinamento) — não são vencedores definitivos.
