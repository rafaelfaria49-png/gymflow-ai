# Benchmark 9 — Qualidade visual

O **único eixo que o analisador não calcula** — exige olhos. Aqui está a régua humana (da Bíblia §12) e como ela vira número no `<nome>.meta.json → visual{}`. O analisador só fornece um **proxy estático** (resolução de textura, normal maps, densidade de tris) para orientar a fila de revisão — **não** é a nota.

## Régua humana (0–10) — preencher por avatar
| Item | Chave no `meta.json` | Portão? | O que olhar |
|---|---|:--:|---|
| Realismo geral | `geral` | — | parece pessoa real ou boneco? |
| Rosto | `rosto` | **<6 reprova** | uncanny? olhos mortos? assimetria? |
| **Mãos** | `maos` | **<6 reprova** | dedos corretos? colapso? "luva"? |
| Pele | `pele` | — | poros/SSS ou plástico? |
| Roupa | `roupa` | — | tecido real? identidade da marca? |
| Anatomia | `anatomia` | — | proporção atlética natural (não bodybuilder)? |
| Uncanny | `uncanny` | — | (quanto MENOS uncanny, maior a nota) |
| Premium | `parece_premium` | — | passaria num app internacional pago? |

## O teste decisivo (Fase 9 do E0.5)
> **APROVADO** só se a equipe disser: **"Eu pagaria por um app que usa esse personagem."**
> **REPROVADO** se parecer: boneco · cartoon · videogame barato · IA mal acabada · estranho · **mãos ruins** · **rosto artificial**.

## Como evitar viés
- Avaliar **frente + 3/4 + close do rosto + close das mãos** (as 4 capturas exigidas).
- Comparar **lado a lado** com o **benchmark de teto** (MetaHuman) e com a Bíblia §3/§4.
- Mais de um avaliador quando possível; registrar discordâncias.

## Proxy estático (o que o analisador dá)
Combina: textura ≥2048 · presença de normal map · materiais avançados (clearcoat/sheen/etc.) · densidade de triângulos. Útil para **priorizar** quais avatares revisar primeiro — **nunca** para substituir o olho humano. No relatório aparece como `Visual: — (proxy X.X)` até a nota humana entrar.
